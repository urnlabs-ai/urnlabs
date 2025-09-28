import Redis from 'ioredis';
import { EventEmitter } from 'events';
import { FastifyInstance } from 'fastify';
import logger from '../lib/logger.js';
import CircuitBreaker, { CircuitBreakerConfig, CircuitBreakerState, CircuitBreakerCall } from './CircuitBreaker.js';
import HealthMonitor, { HealthCheckConfig, ServiceHealth, HealthAlert } from './HealthMonitor.js';
import FailoverManager, { ServiceInstance, FailoverConfig, FailoverEvent } from './FailoverManager.js';

export interface ResilienceConfig {
  circuitBreaker: {
    enabled: boolean;
    defaultConfig: Partial<CircuitBreakerConfig>;
  };
  healthMonitoring: {
    enabled: boolean;
    defaultInterval: number;
    alertThresholds: {
      errorRate: number;
      responseTime: number;
      availability: number;
    };
  };
  failover: {
    enabled: boolean;
    defaultConfig: Partial<FailoverConfig>;
    crossRegionEnabled: boolean;
  };
  dashboard: {
    enabled: boolean;
    updateInterval: number;
    retentionPeriod: number;
  };
  alerting: {
    enabled: boolean;
    webhooks: string[];
    emailNotifications: boolean;
    slackIntegration: boolean;
  };
}

export interface ServiceResilienceProfile {
  service: string;
  instances: ServiceInstance[];
  circuitBreakerConfig?: Partial<CircuitBreakerConfig>;
  healthCheckConfigs?: HealthCheckConfig[];
  failoverConfig?: Partial<FailoverConfig>;
  dependencies?: string[];
  tags?: string[];
  metadata?: Record<string, any>;
}

export interface ResilienceMetrics {
  timestamp: number;
  services: Map<string, ServiceMetrics>;
  overall: OverallMetrics;
  alerts: HealthAlert[];
  events: ResilienceEvent[];
}

export interface ServiceMetrics {
  service: string;
  circuitBreaker?: {
    state: CircuitBreakerState;
    errorRate: number;
    avgResponseTime: number;
    totalRequests: number;
  };
  health?: {
    score: number;
    availability: number;
    uptime: number;
    lastCheck: number;
  };
  failover?: {
    activeInstance: string | null;
    availableInstances: number;
    failedInstances: number;
    lastFailover: number;
  };
}

export interface OverallMetrics {
  totalServices: number;
  healthyServices: number;
  degradedServices: number;
  downServices: number;
  activeAlerts: number;
  criticalAlerts: number;
  systemHealthScore: number;
  totalRequests: number;
  errorRate: number;
  averageResponseTime: number;
}

export interface ResilienceEvent {
  id: string;
  type: 'CIRCUIT_BREAKER' | 'HEALTH_CHECK' | 'FAILOVER' | 'ALERT' | 'RECOVERY';
  service: string;
  severity: 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';
  message: string;
  timestamp: number;
  metadata?: Record<string, any>;
}

export interface ResilienceReport {
  period: {
    start: number;
    end: number;
  };
  summary: {
    totalServices: number;
    totalIncidents: number;
    averageRecoveryTime: number;
    uptime: number;
    errorRate: number;
  };
  serviceReports: ServiceReport[];
  trends: {
    errorRates: TimeSeriesData[];
    responseTimes: TimeSeriesData[];
    availability: TimeSeriesData[];
  };
  incidents: IncidentSummary[];
  recommendations: string[];
}

export interface ServiceReport {
  service: string;
  uptime: number;
  availability: number;
  errorRate: number;
  averageResponseTime: number;
  incidentCount: number;
  mttr: number; // Mean Time To Recovery
  mtbf: number; // Mean Time Between Failures
}

export interface TimeSeriesData {
  timestamp: number;
  value: number;
  service?: string;
}

export interface IncidentSummary {
  id: string;
  service: string;
  type: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  impact: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  rootCause?: string;
  resolution?: string;
}

export interface ResilienceOrchestratorEvents {
  serviceRegistered: (service: string, profile: ServiceResilienceProfile) => void;
  serviceDeregistered: (service: string) => void;
  systemHealthChanged: (metrics: OverallMetrics) => void;
  criticalAlert: (alert: HealthAlert) => void;
  incidentDetected: (incident: IncidentSummary) => void;
  recoveryCompleted: (service: string, duration: number) => void;
  resilienceReport: (report: ResilienceReport) => void;
}

export class ResilienceOrchestrator extends EventEmitter {
  private redis: Redis;
  private fastify: FastifyInstance;
  private config: ResilienceConfig;

  private circuitBreakers = new Map<string, CircuitBreaker>();
  private healthMonitor: HealthMonitor;
  private failoverManager: FailoverManager;

  private serviceProfiles = new Map<string, ServiceResilienceProfile>();
  private metricsHistory: ResilienceMetrics[] = [];
  private incidents = new Map<string, IncidentSummary>();
  private events: ResilienceEvent[] = [];

  private monitoringInterval?: NodeJS.Timeout;
  private reportingInterval?: NodeJS.Timeout;
  private alertingInterval?: NodeJS.Timeout;

  private running = false;

  constructor(fastify: FastifyInstance, redis: Redis, config: Partial<ResilienceConfig> = {}) {
    super();
    this.fastify = fastify;
    this.redis = redis;
    this.config = this.mergeWithDefaults(config);

    // Initialize components
    this.healthMonitor = new HealthMonitor(redis);
    this.failoverManager = new FailoverManager(redis, undefined, this.healthMonitor);

    this.setupEventListeners();
  }

  private mergeWithDefaults(config: Partial<ResilienceConfig>): ResilienceConfig {
    return {
      circuitBreaker: {
        enabled: true,
        defaultConfig: {
          failureThreshold: 5,
          successThreshold: 3,
          timeout: 60000,
          resetTimeout: 60000,
          requestVolumeThreshold: 10,
          timeWindow: 60000,
          errorThresholdPercentage: 50,
          slowCallThreshold: 1000,
          slowCallRateThreshold: 50,
          halfOpenMaxCalls: 3,
          monitoringEnabled: true
        }
      },
      healthMonitoring: {
        enabled: true,
        defaultInterval: 30000,
        alertThresholds: {
          errorRate: 10,
          responseTime: 2000,
          availability: 95
        }
      },
      failover: {
        enabled: true,
        defaultConfig: {
          strategy: 'HEALTH_BASED',
          maxFailovers: 5,
          failoverWindow: 300000,
          healthCheckInterval: 30000,
          autoFailback: true,
          failbackDelay: 60000,
          gracefulDraining: true,
          drainingTimeout: 30000,
          crossRegionFailover: false,
          minHealthyInstances: 1,
          stickySession: false
        },
        crossRegionEnabled: false
      },
      dashboard: {
        enabled: true,
        updateInterval: 10000,
        retentionPeriod: 7 * 24 * 60 * 60 * 1000 // 7 days
      },
      alerting: {
        enabled: true,
        webhooks: [],
        emailNotifications: false,
        slackIntegration: false
      },
      ...config
    };
  }

  private setupEventListeners(): void {
    // Circuit breaker events
    this.on('circuitBreakerStateChange', (service: string, oldState: CircuitBreakerState, newState: CircuitBreakerState) => {
      this.recordEvent({
        type: 'CIRCUIT_BREAKER',
        service,
        severity: newState === 'OPEN' ? 'ERROR' : 'INFO',
        message: `Circuit breaker state changed from ${oldState} to ${newState}`,
        metadata: { oldState, newState }
      });

      if (newState === 'OPEN') {
        this.detectIncident(service, 'CIRCUIT_BREAKER_OPEN', 'Circuit breaker opened due to failures');
      } else if (oldState === 'OPEN' && newState === 'CLOSED') {
        this.resolveIncident(service, 'CIRCUIT_BREAKER_OPEN');
      }
    });

    // Health monitor events
    this.healthMonitor.on('serviceDown', (service: string, status) => {
      this.recordEvent({
        type: 'HEALTH_CHECK',
        service,
        severity: 'CRITICAL',
        message: `Service ${service} is down: ${status.errorMessage}`,
        metadata: { status }
      });

      this.detectIncident(service, 'SERVICE_DOWN', status.errorMessage || 'Service health check failed');
    });

    this.healthMonitor.on('serviceUp', (service: string, status) => {
      this.recordEvent({
        type: 'RECOVERY',
        service,
        severity: 'INFO',
        message: `Service ${service} recovered`,
        metadata: { status }
      });

      this.resolveIncident(service, 'SERVICE_DOWN');
    });

    this.healthMonitor.on('alertTriggered', (alert: HealthAlert) => {
      this.recordEvent({
        type: 'ALERT',
        service: alert.service,
        severity: alert.severity === 'CRITICAL' ? 'CRITICAL' : 'WARNING',
        message: alert.message,
        metadata: { alert }
      });

      if (alert.severity === 'CRITICAL') {
        this.emit('criticalAlert', alert);
      }
    });

    // Failover events
    this.failoverManager.on('failover', (event: FailoverEvent) => {
      this.recordEvent({
        type: 'FAILOVER',
        service: event.service,
        severity: 'WARNING',
        message: `Failover executed: ${event.reason}`,
        metadata: { event }
      });

      this.detectIncident(event.service, 'FAILOVER', event.reason);
    });

    this.failoverManager.on('allInstancesDown', (service: string) => {
      this.recordEvent({
        type: 'FAILOVER',
        service,
        severity: 'CRITICAL',
        message: `All instances down for service ${service}`,
        metadata: {}
      });

      this.detectIncident(service, 'ALL_INSTANCES_DOWN', 'No healthy instances available');
    });

    this.failoverManager.on('serviceRestored', (service: string, instance: ServiceInstance) => {
      this.recordEvent({
        type: 'RECOVERY',
        service,
        severity: 'INFO',
        message: `Service ${service} restored with instance ${instance.id}`,
        metadata: { instance }
      });

      this.resolveIncident(service, 'ALL_INSTANCES_DOWN');
    });
  }

  public async start(): Promise<void> {
    if (this.running) return;

    this.running = true;
    logger.info('Resilience orchestrator starting');

    // Load persisted data
    await this.loadPersistedData();

    // Start components
    if (this.config.healthMonitoring.enabled) {
      await this.healthMonitor.start();
    }

    if (this.config.failover.enabled) {
      await this.failoverManager.start();
    }

    // Start monitoring intervals
    this.startMonitoring();
    this.startReporting();
    this.startAlerting();

    // Register API routes
    await this.registerRoutes();

    logger.info('Resilience orchestrator started', {
      config: this.config
    });
  }

  public async stop(): Promise<void> {
    if (!this.running) return;

    this.running = false;
    logger.info('Resilience orchestrator stopping');

    // Stop intervals
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = undefined;
    }

    if (this.reportingInterval) {
      clearInterval(this.reportingInterval);
      this.reportingInterval = undefined;
    }

    if (this.alertingInterval) {
      clearInterval(this.alertingInterval);
      this.alertingInterval = undefined;
    }

    // Stop components
    await this.healthMonitor.stop();
    await this.failoverManager.stop();

    // Stop circuit breakers
    for (const circuitBreaker of Array.from(this.circuitBreakers.values())) {
      circuitBreaker.destroy();
    }
    this.circuitBreakers.clear();

    // Persist current state
    await this.persistData();

    logger.info('Resilience orchestrator stopped');
  }

  public async registerService(profile: ServiceResilienceProfile): Promise<void> {
    const { service, instances, circuitBreakerConfig, healthCheckConfigs, failoverConfig } = profile;

    // Store profile
    this.serviceProfiles.set(service, profile);

    // Register circuit breaker if enabled
    if (this.config.circuitBreaker.enabled) {
      const cbConfig: CircuitBreakerConfig = {
        id: `cb_${service}`,
        service,
        failureThreshold: 5,
        successThreshold: 3,
        timeout: 60000,
        resetTimeout: 60000,
        requestVolumeThreshold: 10,
        timeWindow: 60000,
        errorThresholdPercentage: 50,
        slowCallThreshold: 1000,
        slowCallRateThreshold: 50,
        halfOpenMaxCalls: 3,
        monitoringEnabled: true,
        ...this.config.circuitBreaker.defaultConfig,
        ...circuitBreakerConfig
      };

      const circuitBreaker = new CircuitBreaker(this.redis, cbConfig);
      await circuitBreaker.initialize();

      // Setup event forwarding
      circuitBreaker.on('stateChange', (service, oldState, newState) => {
        this.emit('circuitBreakerStateChange', service, oldState, newState);
      });

      this.circuitBreakers.set(service, circuitBreaker);
    }

    // Register health checks if enabled
    if (this.config.healthMonitoring.enabled && healthCheckConfigs) {
      for (const healthConfig of healthCheckConfigs) {
        await this.healthMonitor.registerHealthCheck(healthConfig);
      }
    }

    // Register failover if enabled
    if (this.config.failover.enabled && instances.length > 0) {
      await this.failoverManager.registerService(
        service,
        instances,
        { ...this.config.failover.defaultConfig, ...failoverConfig }
      );
    }

    // Register dependencies
    if (profile.dependencies) {
      for (const dependency of profile.dependencies) {
        await this.healthMonitor.addDependency(service, dependency, 'HIGH');
      }
    }

    this.emit('serviceRegistered', service, profile);

    logger.info('Service registered with resilience orchestrator', {
      service,
      instances: instances.length,
      circuitBreaker: this.config.circuitBreaker.enabled,
      healthChecks: healthCheckConfigs?.length || 0,
      failover: this.config.failover.enabled
    });
  }

  public async deregisterService(service: string): Promise<void> {
    // Remove circuit breaker
    const circuitBreaker = this.circuitBreakers.get(service);
    if (circuitBreaker) {
      circuitBreaker.destroy();
      this.circuitBreakers.delete(service);
    }

    // Remove from failover manager
    await this.failoverManager.unregisterService(service);

    // Remove health checks (would need to track health check IDs)
    // This is simplified for now

    // Remove profile
    this.serviceProfiles.delete(service);

    this.emit('serviceDeregistered', service);

    logger.info('Service deregistered from resilience orchestrator', { service });
  }

  public async executeWithResilience<T>(
    fn: () => Promise<T>,
    context: {
      service: string;
      operation: string;
      timeout?: number;
      retries?: number;
    }
  ): Promise<T> {
    const { service, operation, timeout = 10000, retries = 3 } = context;

    // Get circuit breaker for service
    const circuitBreaker = this.circuitBreakers.get(service);
    if (circuitBreaker && !(await circuitBreaker.callAllowed())) {
      throw new Error(`Circuit breaker is open for service: ${service}`);
    }

    // Get healthy instance
    const instance = await this.failoverManager.getActiveInstance(service);
    if (!instance) {
      throw new Error(`No healthy instances available for service: ${service}`);
    }

    const startTime = Date.now();
    let lastError: any;

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        // Execute with timeout
        const result = await Promise.race([
          fn(),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Operation timeout')), timeout)
          )
        ]);

        const responseTime = Date.now() - startTime;

        // Record successful call
        if (circuitBreaker) {
          await circuitBreaker.recordCall({
            service,
            operation,
            timestamp: Date.now(),
            success: true,
            responseTime
          });
        }

        return result;

      } catch (error: any) {
        lastError = error;
        const responseTime = Date.now() - startTime;

        // Record failed call
        if (circuitBreaker) {
          await circuitBreaker.recordCall({
            service,
            operation,
            timestamp: Date.now(),
            success: false,
            responseTime,
            error: error.message,
            statusCode: error.statusCode
          });
        }

        // Don't retry if circuit breaker is now open
        if (circuitBreaker && !(await circuitBreaker.callAllowed())) {
          break;
        }

        // Don't retry if this was the last attempt
        if (attempt === retries) {
          break;
        }

        // Exponential backoff
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    throw lastError;
  }

  private startMonitoring(): void {
    if (!this.config.dashboard.enabled) return;

    this.monitoringInterval = setInterval(async () => {
      await this.collectMetrics();
    }, this.config.dashboard.updateInterval);
  }

  private startReporting(): void {
    if (!this.config.dashboard.enabled) return;

    // Generate reports every hour
    this.reportingInterval = setInterval(async () => {
      const report = await this.generateReport(
        Date.now() - (60 * 60 * 1000), // Last hour
        Date.now()
      );
      this.emit('resilienceReport', report);
    }, 60 * 60 * 1000);
  }

  private startAlerting(): void {
    if (!this.config.alerting.enabled) return;

    this.alertingInterval = setInterval(async () => {
      await this.processAlerts();
    }, 30000); // Check every 30 seconds
  }

  private async collectMetrics(): Promise<void> {
    const timestamp = Date.now();
    const services = new Map<string, ServiceMetrics>();

    // Collect metrics for each service
    for (const [serviceName, profile] of Array.from(this.serviceProfiles.entries())) {
      const serviceMetrics: ServiceMetrics = { service: serviceName };

      // Circuit breaker metrics
      const circuitBreaker = this.circuitBreakers.get(serviceName);
      if (circuitBreaker) {
        const metrics = circuitBreaker.getMetrics();
        serviceMetrics.circuitBreaker = {
          state: circuitBreaker.getState(),
          errorRate: metrics.errorRate,
          avgResponseTime: metrics.averageResponseTime,
          totalRequests: metrics.totalRequests
        };
      }

      // Health metrics
      const health = this.healthMonitor.getServiceHealth(serviceName);
      if (health) {
        serviceMetrics.health = {
          score: health.healthScore,
          availability: health.availability,
          uptime: health.uptime,
          lastCheck: health.overall.lastCheck
        };
      }

      // Failover metrics
      const failoverMetrics = this.failoverManager.getServiceMetrics(serviceName);
      if (failoverMetrics) {
        const activeInstance = await this.failoverManager.getActiveInstance(serviceName);
        const availableInstances = await this.failoverManager.getAvailableInstances(serviceName);

        serviceMetrics.failover = {
          activeInstance: activeInstance?.id || null,
          availableInstances: availableInstances.length,
          failedInstances: 0, // Would need to track this
          lastFailover: 0 // Would need to track this
        };
      }

      services.set(serviceName, serviceMetrics);
    }

    // Calculate overall metrics
    const overall = this.calculateOverallMetrics(services);

    const metrics: ResilienceMetrics = {
      timestamp,
      services,
      overall,
      alerts: this.healthMonitor.getActiveAlerts(),
      events: this.events.slice(-100) // Keep last 100 events
    };

    // Store metrics
    this.metricsHistory.push(metrics);

    // Cleanup old metrics
    const cutoff = timestamp - this.config.dashboard.retentionPeriod;
    this.metricsHistory = this.metricsHistory.filter(m => m.timestamp > cutoff);

    // Emit system health change if significant
    this.emit('systemHealthChanged', overall);
  }

  private calculateOverallMetrics(services: Map<string, ServiceMetrics>): OverallMetrics {
    let healthyServices = 0;
    let degradedServices = 0;
    let downServices = 0;
    let totalRequests = 0;
    let totalErrors = 0;
    let totalResponseTime = 0;
    let responseTimeCount = 0;

    for (const serviceMetrics of Array.from(services.values())) {
      // Count service states
      if (serviceMetrics.health) {
        if (serviceMetrics.health.score >= 80) {
          healthyServices++;
        } else if (serviceMetrics.health.score >= 50) {
          degradedServices++;
        } else {
          downServices++;
        }
      }

      // Aggregate request metrics
      if (serviceMetrics.circuitBreaker) {
        totalRequests += serviceMetrics.circuitBreaker.totalRequests;
        totalErrors += (serviceMetrics.circuitBreaker.totalRequests * serviceMetrics.circuitBreaker.errorRate) / 100;

        if (serviceMetrics.circuitBreaker.avgResponseTime > 0) {
          totalResponseTime += serviceMetrics.circuitBreaker.avgResponseTime;
          responseTimeCount++;
        }
      }
    }

    const errorRate = totalRequests > 0 ? (totalErrors / totalRequests) * 100 : 0;
    const averageResponseTime = responseTimeCount > 0 ? totalResponseTime / responseTimeCount : 0;

    // Calculate system health score
    const totalServices = services.size;
    const systemHealthScore = totalServices > 0
      ? ((healthyServices * 100 + degradedServices * 50) / totalServices)
      : 100;

    return {
      totalServices,
      healthyServices,
      degradedServices,
      downServices,
      activeAlerts: this.healthMonitor.getActiveAlerts().length,
      criticalAlerts: this.healthMonitor.getActiveAlerts().filter(a => a.severity === 'CRITICAL').length,
      systemHealthScore,
      totalRequests,
      errorRate,
      averageResponseTime
    };
  }

  private recordEvent(event: Omit<ResilienceEvent, 'id' | 'timestamp'>): void {
    const fullEvent: ResilienceEvent = {
      id: `${event.type}_${event.service}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      ...event
    };

    this.events.push(fullEvent);

    // Keep only last 1000 events
    if (this.events.length > 1000) {
      this.events.splice(0, this.events.length - 1000);
    }

    logger.info('Resilience event recorded', fullEvent);
  }

  private detectIncident(service: string, type: string, description: string): void {
    const incidentId = `${type}_${service}_${Date.now()}`;

    const incident: IncidentSummary = {
      id: incidentId,
      service,
      type,
      startTime: Date.now(),
      impact: this.determineIncidentImpact(service, type),
      rootCause: description
    };

    this.incidents.set(incidentId, incident);
    this.emit('incidentDetected', incident);

    logger.warn('Incident detected', incident);
  }

  private resolveIncident(service: string, type: string): void {
    // Find open incident of this type for this service
    for (const [id, incident] of Array.from(this.incidents.entries())) {
      if (incident.service === service && incident.type === type && !incident.endTime) {
        incident.endTime = Date.now();
        incident.duration = incident.endTime - incident.startTime;
        incident.resolution = 'Automatic recovery';

        this.emit('recoveryCompleted', service, incident.duration);

        logger.info('Incident resolved', incident);
        break;
      }
    }
  }

  private determineIncidentImpact(service: string, type: string): 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' {
    // This could be more sophisticated based on service criticality, dependencies, etc.
    switch (type) {
      case 'ALL_INSTANCES_DOWN':
      case 'SERVICE_DOWN':
        return 'CRITICAL';
      case 'CIRCUIT_BREAKER_OPEN':
      case 'FAILOVER':
        return 'HIGH';
      case 'DEGRADED_PERFORMANCE':
        return 'MEDIUM';
      default:
        return 'LOW';
    }
  }

  private async processAlerts(): Promise<void> {
    const activeAlerts = this.healthMonitor.getActiveAlerts();
    const criticalAlerts = activeAlerts.filter(alert => alert.severity === 'CRITICAL');

    // Process critical alerts
    for (const alert of criticalAlerts) {
      await this.sendAlert(alert);
    }
  }

  private async sendAlert(alert: HealthAlert): Promise<void> {
    // This would integrate with external alerting systems
    logger.error('Critical alert triggered', alert);

    // Send webhooks
    for (const webhook of this.config.alerting.webhooks) {
      try {
        await fetch(webhook, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(alert)
        });
      } catch (error) {
        logger.error('Failed to send webhook alert', { webhook, error });
      }
    }
  }

  public async generateReport(startTime: number, endTime: number): Promise<ResilienceReport> {
    const relevantMetrics = this.metricsHistory.filter(
      m => m.timestamp >= startTime && m.timestamp <= endTime
    );

    if (relevantMetrics.length === 0) {
      // Return empty report
      return {
        period: { start: startTime, end: endTime },
        summary: {
          totalServices: 0,
          totalIncidents: 0,
          averageRecoveryTime: 0,
          uptime: 100,
          errorRate: 0
        },
        serviceReports: [],
        trends: {
          errorRates: [],
          responseTimes: [],
          availability: []
        },
        incidents: [],
        recommendations: []
      };
    }

    // Calculate summary metrics
    const latestMetrics = relevantMetrics[relevantMetrics.length - 1];
    const totalServices = latestMetrics.services.size;

    // Get incidents in time range
    const relevantIncidents = Array.from(this.incidents.values())
      .filter(incident =>
        incident.startTime >= startTime &&
        (incident.endTime || Date.now()) <= endTime
      );

    const totalIncidents = relevantIncidents.length;
    const resolvedIncidents = relevantIncidents.filter(i => i.endTime);
    const averageRecoveryTime = resolvedIncidents.length > 0
      ? resolvedIncidents.reduce((sum, i) => sum + (i.duration || 0), 0) / resolvedIncidents.length
      : 0;

    // Calculate overall uptime and error rate
    const avgOverallMetrics = this.calculateAverageMetrics(relevantMetrics);

    // Generate service reports
    const serviceReports: ServiceReport[] = [];
    for (const serviceName of Array.from(latestMetrics.services.keys())) {
      const serviceReport = this.generateServiceReport(serviceName, relevantMetrics, relevantIncidents);
      serviceReports.push(serviceReport);
    }

    // Generate trends
    const trends = this.generateTrends(relevantMetrics);

    // Generate recommendations
    const recommendations = this.generateRecommendations(serviceReports, relevantIncidents);

    return {
      period: { start: startTime, end: endTime },
      summary: {
        totalServices,
        totalIncidents,
        averageRecoveryTime,
        uptime: avgOverallMetrics.systemHealthScore,
        errorRate: avgOverallMetrics.errorRate
      },
      serviceReports,
      trends,
      incidents: relevantIncidents,
      recommendations
    };
  }

  private calculateAverageMetrics(metrics: ResilienceMetrics[]): OverallMetrics {
    if (metrics.length === 0) {
      return {
        totalServices: 0,
        healthyServices: 0,
        degradedServices: 0,
        downServices: 0,
        activeAlerts: 0,
        criticalAlerts: 0,
        systemHealthScore: 100,
        totalRequests: 0,
        errorRate: 0,
        averageResponseTime: 0
      };
    }

    const totals = metrics.reduce((acc, m) => ({
      systemHealthScore: acc.systemHealthScore + m.overall.systemHealthScore,
      errorRate: acc.errorRate + m.overall.errorRate,
      averageResponseTime: acc.averageResponseTime + m.overall.averageResponseTime,
      totalRequests: acc.totalRequests + m.overall.totalRequests
    }), { systemHealthScore: 0, errorRate: 0, averageResponseTime: 0, totalRequests: 0 });

    const latest = metrics[metrics.length - 1].overall;

    return {
      ...latest,
      systemHealthScore: totals.systemHealthScore / metrics.length,
      errorRate: totals.errorRate / metrics.length,
      averageResponseTime: totals.averageResponseTime / metrics.length
    };
  }

  private generateServiceReport(
    service: string,
    metrics: ResilienceMetrics[],
    incidents: IncidentSummary[]
  ): ServiceReport {
    const serviceMetrics = metrics
      .map(m => m.services.get(service))
      .filter(sm => sm !== undefined) as ServiceMetrics[];

    if (serviceMetrics.length === 0) {
      return {
        service,
        uptime: 0,
        availability: 0,
        errorRate: 0,
        averageResponseTime: 0,
        incidentCount: 0,
        mttr: 0,
        mtbf: 0
      };
    }

    // Calculate averages
    const avgUptime = serviceMetrics
      .filter(sm => sm.health)
      .reduce((sum, sm) => sum + sm.health!.uptime, 0) / serviceMetrics.length;

    const avgAvailability = serviceMetrics
      .filter(sm => sm.health)
      .reduce((sum, sm) => sum + sm.health!.availability, 0) / serviceMetrics.length;

    const avgErrorRate = serviceMetrics
      .filter(sm => sm.circuitBreaker)
      .reduce((sum, sm) => sum + sm.circuitBreaker!.errorRate, 0) / serviceMetrics.length;

    const avgResponseTime = serviceMetrics
      .filter(sm => sm.circuitBreaker)
      .reduce((sum, sm) => sum + sm.circuitBreaker!.avgResponseTime, 0) / serviceMetrics.length;

    // Calculate incident metrics
    const serviceIncidents = incidents.filter(i => i.service === service);
    const resolvedIncidents = serviceIncidents.filter(i => i.endTime);

    const mttr = resolvedIncidents.length > 0
      ? resolvedIncidents.reduce((sum, i) => sum + (i.duration || 0), 0) / resolvedIncidents.length
      : 0;

    // MTBF calculation (simplified)
    const timeRange = metrics.length > 0 ?
      metrics[metrics.length - 1].timestamp - metrics[0].timestamp : 0;
    const mtbf = serviceIncidents.length > 0 ? timeRange / serviceIncidents.length : timeRange;

    return {
      service,
      uptime: avgUptime,
      availability: avgAvailability,
      errorRate: avgErrorRate,
      averageResponseTime: avgResponseTime,
      incidentCount: serviceIncidents.length,
      mttr,
      mtbf
    };
  }

  private generateTrends(metrics: ResilienceMetrics[]): {
    errorRates: TimeSeriesData[];
    responseTimes: TimeSeriesData[];
    availability: TimeSeriesData[];
  } {
    return {
      errorRates: metrics.map(m => ({
        timestamp: m.timestamp,
        value: m.overall.errorRate
      })),
      responseTimes: metrics.map(m => ({
        timestamp: m.timestamp,
        value: m.overall.averageResponseTime
      })),
      availability: metrics.map(m => ({
        timestamp: m.timestamp,
        value: m.overall.systemHealthScore
      }))
    };
  }

  private generateRecommendations(
    serviceReports: ServiceReport[],
    incidents: IncidentSummary[]
  ): string[] {
    const recommendations: string[] = [];

    // Check for services with high error rates
    const highErrorServices = serviceReports.filter(sr => sr.errorRate > 5);
    if (highErrorServices.length > 0) {
      recommendations.push(
        `Consider reviewing circuit breaker thresholds for services: ${highErrorServices.map(s => s.service).join(', ')}`
      );
    }

    // Check for services with low availability
    const lowAvailabilityServices = serviceReports.filter(sr => sr.availability < 95);
    if (lowAvailabilityServices.length > 0) {
      recommendations.push(
        `Consider adding redundancy for services: ${lowAvailabilityServices.map(s => s.service).join(', ')}`
      );
    }

    // Check for frequent incidents
    const frequentIncidentServices = serviceReports.filter(sr => sr.incidentCount > 3);
    if (frequentIncidentServices.length > 0) {
      recommendations.push(
        `Investigate root causes for services with frequent incidents: ${frequentIncidentServices.map(s => s.service).join(', ')}`
      );
    }

    // Check for slow recovery times
    const slowRecoveryServices = serviceReports.filter(sr => sr.mttr > 300000); // 5 minutes
    if (slowRecoveryServices.length > 0) {
      recommendations.push(
        `Consider automating recovery procedures for services: ${slowRecoveryServices.map(s => s.service).join(', ')}`
      );
    }

    return recommendations;
  }

  private async registerRoutes(): Promise<void> {
    // Dashboard endpoint
    this.fastify.get('/admin/resilience/dashboard', async (_request, reply) => {
      const latestMetrics = this.metricsHistory[this.metricsHistory.length - 1];
      return reply.send(latestMetrics || {
        timestamp: Date.now(),
        services: {},
        overall: this.calculateOverallMetrics(new Map()),
        alerts: [],
        events: []
      });
    });

    // Services endpoint
    this.fastify.get('/admin/resilience/services', async (_request, reply) => {
      const services = Array.from(this.serviceProfiles.entries()).map(([name, profile]) => ({
        name,
        profile,
        circuitBreaker: this.circuitBreakers.get(name)?.getState(),
        health: this.healthMonitor.getServiceHealth(name),
        failoverMetrics: this.failoverManager.getServiceMetrics(name)
      }));

      return reply.send(services);
    });

    // Service details endpoint
    this.fastify.get('/admin/resilience/services/:service', async (request, reply) => {
      const { service } = request.params as { service: string };

      const profile = this.serviceProfiles.get(service);
      if (!profile) {
        return reply.status(404).send({ error: 'Service not found' });
      }

      const details = {
        profile,
        circuitBreaker: {
          state: this.circuitBreakers.get(service)?.getState(),
          metrics: this.circuitBreakers.get(service)?.getMetrics(),
          config: this.circuitBreakers.get(service)?.getConfig()
        },
        health: this.healthMonitor.getServiceHealth(service),
        failover: {
          metrics: this.failoverManager.getServiceMetrics(service),
          history: this.failoverManager.getFailoverHistory(service)
        },
        incidents: Array.from(this.incidents.values()).filter(i => i.service === service),
        events: this.events.filter(e => e.service === service).slice(-50)
      };

      return reply.send(details);
    });

    // Reports endpoint
    this.fastify.get('/admin/resilience/reports', {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            start: { type: 'string' },
            end: { type: 'string' },
            hours: { type: 'number', minimum: 1, maximum: 168 }
          }
        }
      }
    }, async (request, reply) => {
      const query = request.query as { start?: string; end?: string; hours?: number };

      let startTime: number;
      let endTime: number;

      if (query.start && query.end) {
        startTime = new Date(query.start).getTime();
        endTime = new Date(query.end).getTime();
      } else {
        const hours = query.hours || 24;
        endTime = Date.now();
        startTime = endTime - (hours * 3600000);
      }

      const report = await this.generateReport(startTime, endTime);
      return reply.send(report);
    });

    // Events endpoint
    this.fastify.get('/admin/resilience/events', {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            service: { type: 'string' },
            type: { type: 'string' },
            severity: { type: 'string' },
            limit: { type: 'number', minimum: 1, maximum: 1000, default: 100 }
          }
        }
      }
    }, async (request, reply) => {
      const query = request.query as {
        service?: string;
        type?: string;
        severity?: string;
        limit?: number;
      };

      let filteredEvents = [...this.events];

      if (query.service) {
        filteredEvents = filteredEvents.filter(e => e.service === query.service);
      }

      if (query.type) {
        filteredEvents = filteredEvents.filter(e => e.type === query.type);
      }

      if (query.severity) {
        filteredEvents = filteredEvents.filter(e => e.severity === query.severity);
      }

      // Sort by timestamp descending and limit
      filteredEvents.sort((a, b) => b.timestamp - a.timestamp);
      filteredEvents = filteredEvents.slice(0, query.limit || 100);

      return reply.send(filteredEvents);
    });

    // Incidents endpoint
    this.fastify.get('/admin/resilience/incidents', async (_request, reply) => {
      const incidents = Array.from(this.incidents.values())
        .sort((a, b) => b.startTime - a.startTime);

      return reply.send(incidents);
    });

    // Health status endpoint
    this.fastify.get('/admin/resilience/health', async (_request, reply) => {
      const latestMetrics = this.metricsHistory[this.metricsHistory.length - 1];
      const overallHealth = latestMetrics?.overall || this.calculateOverallMetrics(new Map());

      return reply.send({
        status: overallHealth.systemHealthScore >= 80 ? 'healthy' :
                overallHealth.systemHealthScore >= 50 ? 'degraded' : 'unhealthy',
        score: overallHealth.systemHealthScore,
        metrics: overallHealth,
        timestamp: Date.now()
      });
    });

    logger.info('Resilience orchestrator API routes registered');
  }

  private async loadPersistedData(): Promise<void> {
    try {
      // Load service profiles
      const profilesData = await this.redis.get('resilience:profiles');
      if (profilesData) {
        const profiles = JSON.parse(profilesData) as Array<[string, ServiceResilienceProfile]>;
        this.serviceProfiles = new Map(profiles);
      }

      // Load incidents
      const incidentsData = await this.redis.get('resilience:incidents');
      if (incidentsData) {
        const incidents = JSON.parse(incidentsData) as Array<[string, IncidentSummary]>;
        this.incidents = new Map(incidents);
      }

      // Load events
      const eventsData = await this.redis.get('resilience:events');
      if (eventsData) {
        this.events = JSON.parse(eventsData) as ResilienceEvent[];
      }

    } catch (error) {
      logger.error('Failed to load persisted resilience data', { error });
    }
  }

  private async persistData(): Promise<void> {
    try {
      // Persist service profiles
      await this.redis.setex(
        'resilience:profiles',
        3600,
        JSON.stringify(Array.from(this.serviceProfiles.entries()))
      );

      // Persist incidents
      await this.redis.setex(
        'resilience:incidents',
        24 * 3600,
        JSON.stringify(Array.from(this.incidents.entries()))
      );

      // Persist events
      await this.redis.setex(
        'resilience:events',
        24 * 3600,
        JSON.stringify(this.events.slice(-1000)) // Keep last 1000 events
      );

    } catch (error) {
      logger.error('Failed to persist resilience data', { error });
    }
  }

  public getMetrics(): ResilienceMetrics | null {
    return this.metricsHistory[this.metricsHistory.length - 1] || null;
  }

  public getServiceProfile(service: string): ServiceResilienceProfile | null {
    return this.serviceProfiles.get(service) || null;
  }

  public getIncidents(): IncidentSummary[] {
    return Array.from(this.incidents.values());
  }

  public getEvents(): ResilienceEvent[] {
    return [...this.events];
  }

  public destroy(): void {
    this.stop();
    this.removeAllListeners();
  }
}

export default ResilienceOrchestrator;