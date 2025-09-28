import Redis from 'ioredis';
import { EventEmitter } from 'events';
import axios, { AxiosRequestConfig } from 'axios';
import logger from '../lib/logger.js';

export interface HealthCheckConfig {
  id: string;
  service: string;
  endpoint: string;
  method: 'GET' | 'POST' | 'PUT' | 'HEAD';
  interval: number;
  timeout: number;
  retries: number;
  successThreshold: number;
  failureThreshold: number;
  headers?: Record<string, string>;
  body?: any;
  expectedStatus?: number[];
  expectedResponseTime?: number;
  enabled: boolean;
}

export interface HealthStatus {
  service: string;
  healthy: boolean;
  status: 'UP' | 'DOWN' | 'DEGRADED' | 'UNKNOWN';
  lastCheck: number;
  responseTime: number;
  consecutiveSuccesses: number;
  consecutiveFailures: number;
  errorMessage?: string;
  statusCode?: number;
  metadata?: Record<string, any>;
}

export interface ServiceHealth {
  service: string;
  overall: HealthStatus;
  endpoints: HealthStatus[];
  dependencies: DependencyHealth[];
  uptime: number;
  availability: number;
  healthScore: number;
}

export interface DependencyHealth {
  service: string;
  healthy: boolean;
  impact: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  responseTime: number;
  lastCheck: number;
}

export interface HealthAlert {
  id: string;
  service: string;
  type: 'SERVICE_DOWN' | 'DEGRADED_PERFORMANCE' | 'DEPENDENCY_FAILURE' | 'HIGH_ERROR_RATE';
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  message: string;
  timestamp: number;
  resolved: boolean;
  resolvedAt?: number;
  metadata?: Record<string, any>;
}

export interface HealthMonitorEvents {
  healthChanged: (service: string, status: HealthStatus) => void;
  serviceDown: (service: string, status: HealthStatus) => void;
  serviceUp: (service: string, status: HealthStatus) => void;
  degradedPerformance: (service: string, status: HealthStatus) => void;
  dependencyFailure: (dependency: DependencyHealth) => void;
  alertTriggered: (alert: HealthAlert) => void;
  alertResolved: (alert: HealthAlert) => void;
}

export class HealthMonitor extends EventEmitter {
  private redis: Redis;
  private healthChecks = new Map<string, HealthCheckConfig>();
  private healthStatuses = new Map<string, HealthStatus>();
  private monitoringIntervals = new Map<string, NodeJS.Timeout>();
  private dependencies = new Map<string, DependencyHealth[]>();
  private activeAlerts = new Map<string, HealthAlert>();
  private running = false;

  constructor(redis: Redis) {
    super();
    this.redis = redis;
  }

  public async start(): Promise<void> {
    if (this.running) return;

    this.running = true;
    logger.info('Health monitor starting');

    // Load persisted health checks
    await this.loadHealthChecks();

    // Start monitoring all registered health checks
    for (const config of Array.from(this.healthChecks.values())) {
      if (config.enabled) {
        this.startHealthCheck(config);
      }
    }

    // Start alert monitoring
    this.startAlertMonitoring();

    logger.info('Health monitor started', {
      healthChecks: this.healthChecks.size,
      activeMonitors: this.monitoringIntervals.size
    });
  }

  public async stop(): Promise<void> {
    if (!this.running) return;

    this.running = false;
    logger.info('Health monitor stopping');

    // Stop all monitoring intervals
    for (const interval of Array.from(this.monitoringIntervals.values())) {
      clearInterval(interval);
    }
    this.monitoringIntervals.clear();

    await this.persistHealthChecks();

    logger.info('Health monitor stopped');
  }

  public async registerHealthCheck(config: HealthCheckConfig): Promise<void> {
    // Validate config
    this.validateHealthCheckConfig(config);

    // Set defaults
    const fullConfig: HealthCheckConfig = {
      interval: 30000,
      timeout: 5000,
      retries: 3,
      successThreshold: 2,
      failureThreshold: 3,
      method: 'GET',
      expectedStatus: [200, 201, 202, 204],
      enabled: true,
      ...config
    };

    this.healthChecks.set(config.id, fullConfig);

    // Initialize health status
    const initialStatus: HealthStatus = {
      service: config.service,
      healthy: false,
      status: 'UNKNOWN',
      lastCheck: 0,
      responseTime: 0,
      consecutiveSuccesses: 0,
      consecutiveFailures: 0
    };

    this.healthStatuses.set(config.id, initialStatus);

    // Start monitoring if enabled and monitor is running
    if (fullConfig.enabled && this.running) {
      this.startHealthCheck(fullConfig);
    }

    await this.persistHealthChecks();

    logger.info('Health check registered', {
      id: config.id,
      service: config.service,
      endpoint: config.endpoint
    });
  }

  public async unregisterHealthCheck(id: string): Promise<void> {
    const config = this.healthChecks.get(id);
    if (!config) return;

    // Stop monitoring
    this.stopHealthCheck(id);

    // Remove from maps
    this.healthChecks.delete(id);
    this.healthStatuses.delete(id);

    await this.persistHealthChecks();

    logger.info('Health check unregistered', { id, service: config.service });
  }

  public async updateHealthCheck(id: string, updates: Partial<HealthCheckConfig>): Promise<void> {
    const config = this.healthChecks.get(id);
    if (!config) {
      throw new Error(`Health check not found: ${id}`);
    }

    const updatedConfig = { ...config, ...updates };
    this.validateHealthCheckConfig(updatedConfig);

    this.healthChecks.set(id, updatedConfig);

    // Restart monitoring if enabled
    if (updatedConfig.enabled && this.running) {
      this.stopHealthCheck(id);
      this.startHealthCheck(updatedConfig);
    } else if (!updatedConfig.enabled) {
      this.stopHealthCheck(id);
    }

    await this.persistHealthChecks();

    logger.info('Health check updated', { id, updates });
  }

  private startHealthCheck(config: HealthCheckConfig): void {
    this.stopHealthCheck(config.id); // Ensure no duplicate intervals

    const interval = setInterval(async () => {
      await this.performHealthCheck(config);
    }, config.interval);

    this.monitoringIntervals.set(config.id, interval);

    // Perform initial check
    setImmediate(() => this.performHealthCheck(config));
  }

  private stopHealthCheck(id: string): void {
    const interval = this.monitoringIntervals.get(id);
    if (interval) {
      clearInterval(interval);
      this.monitoringIntervals.delete(id);
    }
  }

  private async performHealthCheck(config: HealthCheckConfig): Promise<void> {
    const startTime = Date.now();
    let attempt = 0;
    let lastError: any = null;

    while (attempt < config.retries) {
      try {
        const requestConfig: AxiosRequestConfig = {
          method: config.method,
          url: config.endpoint,
          timeout: config.timeout,
          headers: config.headers,
          data: config.body,
          validateStatus: () => true // Don't throw on non-2xx status
        };

        const response = await axios(requestConfig);
        const responseTime = Date.now() - startTime;

        // Check if response is considered successful
        const isSuccessful = config.expectedStatus!.includes(response.status);
        const isExpectedResponseTime = !config.expectedResponseTime ||
          responseTime <= config.expectedResponseTime;

        const success = isSuccessful && isExpectedResponseTime;

        await this.updateHealthStatus(config.id, {
          healthy: success,
          status: success ? 'UP' : 'DEGRADED',
          lastCheck: Date.now(),
          responseTime,
          statusCode: response.status,
          errorMessage: success ? undefined : `Unexpected status: ${response.status}`,
          metadata: {
            attempt: attempt + 1,
            retries: config.retries,
            headers: response.headers
          }
        }, success);

        return; // Success, exit retry loop

      } catch (error: any) {
        lastError = error;
        attempt++;

        if (attempt < config.retries) {
          // Wait before retry with exponential backoff
          const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    // All retries failed
    const responseTime = Date.now() - startTime;
    await this.updateHealthStatus(config.id, {
      healthy: false,
      status: 'DOWN',
      lastCheck: Date.now(),
      responseTime,
      errorMessage: lastError?.message || 'Unknown error',
      statusCode: lastError?.response?.status,
      metadata: {
        attempts: config.retries,
        lastError: lastError?.message
      }
    }, false);
  }

  private async updateHealthStatus(
    id: string,
    updates: Partial<HealthStatus>,
    success: boolean
  ): Promise<void> {
    const currentStatus = this.healthStatuses.get(id);
    if (!currentStatus) return;

    const config = this.healthChecks.get(id);
    if (!config) return;

    // Update consecutive counters
    if (success) {
      updates.consecutiveSuccesses = (currentStatus.consecutiveSuccesses || 0) + 1;
      updates.consecutiveFailures = 0;
    } else {
      updates.consecutiveFailures = (currentStatus.consecutiveFailures || 0) + 1;
      updates.consecutiveSuccesses = 0;
    }

    // Determine health based on thresholds
    if (updates.consecutiveSuccesses! >= config.successThreshold) {
      updates.healthy = true;
      updates.status = 'UP';
    } else if (updates.consecutiveFailures! >= config.failureThreshold) {
      updates.healthy = false;
      updates.status = 'DOWN';
    }

    const newStatus = { ...currentStatus, ...updates };
    this.healthStatuses.set(id, newStatus);

    // Check for status changes and emit events
    if (currentStatus.healthy !== newStatus.healthy) {
      this.emit('healthChanged', config.service, newStatus);

      if (newStatus.healthy) {
        this.emit('serviceUp', config.service, newStatus);
        await this.resolveServiceAlerts(config.service);
      } else {
        this.emit('serviceDown', config.service, newStatus);
        await this.triggerServiceAlert(config.service, newStatus);
      }
    }

    // Check for performance degradation
    if (newStatus.healthy && config.expectedResponseTime &&
        newStatus.responseTime > config.expectedResponseTime * 1.5) {
      this.emit('degradedPerformance', config.service, newStatus);
      await this.triggerPerformanceAlert(config.service, newStatus);
    }

    // Persist status
    await this.persistHealthStatus(id, newStatus);
  }

  public async addDependency(
    service: string,
    dependency: string,
    impact: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'
  ): Promise<void> {
    const dependencyHealth: DependencyHealth = {
      service: dependency,
      healthy: true,
      impact,
      responseTime: 0,
      lastCheck: 0
    };

    const currentDeps = this.dependencies.get(service) || [];
    const existingIndex = currentDeps.findIndex(dep => dep.service === dependency);

    if (existingIndex >= 0) {
      currentDeps[existingIndex] = { ...currentDeps[existingIndex], impact };
    } else {
      currentDeps.push(dependencyHealth);
    }

    this.dependencies.set(service, currentDeps);

    logger.info('Dependency added', { service, dependency, impact });
  }

  public async removeDependency(service: string, dependency: string): Promise<void> {
    const currentDeps = this.dependencies.get(service) || [];
    const filteredDeps = currentDeps.filter(dep => dep.service !== dependency);

    if (filteredDeps.length === 0) {
      this.dependencies.delete(service);
    } else {
      this.dependencies.set(service, filteredDeps);
    }

    logger.info('Dependency removed', { service, dependency });
  }

  public getServiceHealth(service: string): ServiceHealth | null {
    const healthChecks = Array.from(this.healthChecks.values())
      .filter(config => config.service === service);

    if (healthChecks.length === 0) return null;

    const endpoints = healthChecks.map(config => {
      const status = this.healthStatuses.get(config.id);
      return status || this.createDefaultStatus(service);
    });

    const dependencies = this.dependencies.get(service) || [];

    // Calculate overall health
    const healthyEndpoints = endpoints.filter(ep => ep.healthy).length;
    const overallHealthy = healthyEndpoints > 0;

    // Calculate uptime and availability
    const uptime = this.calculateUptime(service);
    const availability = this.calculateAvailability(service);

    // Calculate health score
    const healthScore = this.calculateHealthScore(endpoints, dependencies);

    const overall: HealthStatus = {
      service,
      healthy: overallHealthy,
      status: overallHealthy ? 'UP' : 'DOWN',
      lastCheck: Math.max(...endpoints.map(ep => ep.lastCheck), 0),
      responseTime: endpoints.reduce((sum, ep) => sum + ep.responseTime, 0) / endpoints.length,
      consecutiveSuccesses: Math.min(...endpoints.map(ep => ep.consecutiveSuccesses)),
      consecutiveFailures: Math.max(...endpoints.map(ep => ep.consecutiveFailures))
    };

    return {
      service,
      overall,
      endpoints,
      dependencies,
      uptime,
      availability,
      healthScore
    };
  }

  public getAllServiceHealth(): ServiceHealth[] {
    const services = new Set<string>();

    // Collect all services from health checks
    for (const config of Array.from(this.healthChecks.values())) {
      services.add(config.service);
    }

    return Array.from(services)
      .map(service => this.getServiceHealth(service))
      .filter(health => health !== null) as ServiceHealth[];
  }

  private calculateUptime(service: string): number {
    // This would typically be calculated from historical data
    // For now, return a simplified calculation based on current status
    const healthChecks = Array.from(this.healthChecks.values())
      .filter(config => config.service === service);

    if (healthChecks.length === 0) return 0;

    const healthyChecks = healthChecks.filter(config => {
      const status = this.healthStatuses.get(config.id);
      return status?.healthy;
    }).length;

    return (healthyChecks / healthChecks.length) * 100;
  }

  private calculateAvailability(service: string): number {
    // Similar to uptime but can be more sophisticated
    return this.calculateUptime(service);
  }

  private calculateHealthScore(
    endpoints: HealthStatus[],
    dependencies: DependencyHealth[]
  ): number {
    if (endpoints.length === 0) return 0;

    // Base score from endpoint health
    const healthyEndpoints = endpoints.filter(ep => ep.healthy).length;
    let score = (healthyEndpoints / endpoints.length) * 70;

    // Response time score (30% of total)
    const avgResponseTime = endpoints.reduce((sum, ep) => sum + ep.responseTime, 0) / endpoints.length;
    const responseScore = Math.max(0, 30 - (avgResponseTime / 1000) * 5);
    score += responseScore;

    // Dependency penalty
    const criticalDepsDown = dependencies.filter(dep => !dep.healthy && dep.impact === 'CRITICAL').length;
    const highDepsDown = dependencies.filter(dep => !dep.healthy && dep.impact === 'HIGH').length;

    score -= (criticalDepsDown * 20) + (highDepsDown * 10);

    return Math.max(0, Math.min(100, score));
  }

  private createDefaultStatus(service: string): HealthStatus {
    return {
      service,
      healthy: false,
      status: 'UNKNOWN',
      lastCheck: 0,
      responseTime: 0,
      consecutiveSuccesses: 0,
      consecutiveFailures: 0
    };
  }

  private validateHealthCheckConfig(config: HealthCheckConfig): void {
    if (!config.id || !config.service || !config.endpoint) {
      throw new Error('Health check config must include id, service, and endpoint');
    }

    if (config.interval < 5000) {
      throw new Error('Health check interval must be at least 5 seconds');
    }

    if (config.timeout < 1000) {
      throw new Error('Health check timeout must be at least 1 second');
    }

    if (config.retries < 1 || config.retries > 5) {
      throw new Error('Health check retries must be between 1 and 5');
    }
  }

  private async triggerServiceAlert(service: string, status: HealthStatus): Promise<void> {
    const alert: HealthAlert = {
      id: `service_down_${service}_${Date.now()}`,
      service,
      type: 'SERVICE_DOWN',
      severity: 'CRITICAL',
      message: `Service ${service} is down: ${status.errorMessage}`,
      timestamp: Date.now(),
      resolved: false,
      metadata: { status }
    };

    this.activeAlerts.set(alert.id, alert);
    this.emit('alertTriggered', alert);

    await this.persistAlert(alert);
  }

  private async triggerPerformanceAlert(service: string, status: HealthStatus): Promise<void> {
    const alert: HealthAlert = {
      id: `degraded_performance_${service}_${Date.now()}`,
      service,
      type: 'DEGRADED_PERFORMANCE',
      severity: 'HIGH',
      message: `Service ${service} performance degraded: ${status.responseTime}ms response time`,
      timestamp: Date.now(),
      resolved: false,
      metadata: { status }
    };

    this.activeAlerts.set(alert.id, alert);
    this.emit('alertTriggered', alert);

    await this.persistAlert(alert);
  }

  private async resolveServiceAlerts(service: string): Promise<void> {
    const serviceAlerts = Array.from(this.activeAlerts.values())
      .filter(alert => alert.service === service && !alert.resolved);

    for (const alert of serviceAlerts) {
      alert.resolved = true;
      alert.resolvedAt = Date.now();

      this.emit('alertResolved', alert);
      await this.persistAlert(alert);
    }
  }

  private startAlertMonitoring(): void {
    // Clean up old resolved alerts every hour
    setInterval(() => {
      const cutoff = Date.now() - (24 * 60 * 60 * 1000); // 24 hours ago

      for (const [id, alert] of Array.from(this.activeAlerts.entries())) {
        if (alert.resolved && alert.resolvedAt && alert.resolvedAt < cutoff) {
          this.activeAlerts.delete(id);
        }
      }
    }, 60 * 60 * 1000);
  }

  private async persistHealthChecks(): Promise<void> {
    const data = Array.from(this.healthChecks.entries());
    await this.redis.setex('health_monitor:checks', 3600, JSON.stringify(data));
  }

  private async loadHealthChecks(): Promise<void> {
    const data = await this.redis.get('health_monitor:checks');
    if (data) {
      try {
        const checks = JSON.parse(data) as Array<[string, HealthCheckConfig]>;
        this.healthChecks = new Map(checks);
      } catch (error) {
        logger.error('Failed to load health checks', { error });
      }
    }
  }

  private async persistHealthStatus(id: string, status: HealthStatus): Promise<void> {
    const key = `health_monitor:status:${id}`;
    await this.redis.setex(key, 3600, JSON.stringify(status));
  }

  private async persistAlert(alert: HealthAlert): Promise<void> {
    const key = `health_monitor:alert:${alert.id}`;
    await this.redis.setex(key, 24 * 3600, JSON.stringify(alert)); // Keep for 24 hours
  }

  public getActiveAlerts(): HealthAlert[] {
    return Array.from(this.activeAlerts.values())
      .filter(alert => !alert.resolved)
      .sort((a, b) => b.timestamp - a.timestamp);
  }

  public async acknowledgeAlert(alertId: string): Promise<boolean> {
    const alert = this.activeAlerts.get(alertId);
    if (!alert) return false;

    alert.resolved = true;
    alert.resolvedAt = Date.now();

    this.emit('alertResolved', alert);
    await this.persistAlert(alert);

    return true;
  }

  public destroy(): void {
    this.stop();
    this.removeAllListeners();
  }
}

export default HealthMonitor;