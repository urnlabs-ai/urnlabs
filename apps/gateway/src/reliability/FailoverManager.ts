import { EventEmitter } from 'events';
import Redis from 'ioredis';
import logger from '../lib/logger.js';
import { CircuitBreakerManager } from './CircuitBreakerManager.js';

export interface ServiceInstance {
  id: string;
  url: string;
  status: 'healthy' | 'unhealthy' | 'unknown';
  weight: number;
  responseTime: number;
  connections: number;
  version: string;
  metadata: Record<string, any>;
  priority: number;
  region?: string;
  lastHealthCheck?: number;
}

export interface FailoverConfig {
  maxFailovers: number;
  failoverWindow: number;
  healthCheckInterval: number;
  healthCheckTimeout: number;
  backupInstances?: ServiceInstance[];
  autoFailback: boolean;
  failbackDelay: number;
  gracefulDraining: boolean;
  drainingTimeout: number;
}

export interface FailoverEvent {
  serviceName: string;
  fromInstance: ServiceInstance;
  toInstance: ServiceInstance;
  reason: string;
  timestamp: number;
  automatic: boolean;
}

export class FailoverManager extends EventEmitter {
  private redis: Redis;
  private circuitBreaker: CircuitBreakerManager;
  private serviceInstances: Map<string, ServiceInstance[]> = new Map();
  private activeInstances: Map<string, ServiceInstance[]> = new Map();
  private failoverHistory: Map<string, FailoverEvent[]> = new Map();
  private healthCheckTimers: Map<string, NodeJS.Timeout> = new Map();
  private drainingInstances: Set<string> = new Set();
  private configs: Map<string, FailoverConfig> = new Map();

  private readonly DEFAULT_CONFIG: FailoverConfig = {
    maxFailovers: 3,
    failoverWindow: 300000, // 5 minutes
    healthCheckInterval: 30000, // 30 seconds
    healthCheckTimeout: 5000, // 5 seconds
    autoFailback: true,
    failbackDelay: 60000, // 1 minute
    gracefulDraining: true,
    drainingTimeout: 30000 // 30 seconds
  };

  constructor(redis: Redis, circuitBreaker: CircuitBreakerManager) {
    super();
    this.redis = redis;
    this.circuitBreaker = circuitBreaker;
    this.initializeFailoverManager();
  }

  private async initializeFailoverManager(): Promise<void> {
    try {
      // Load service instances from Redis
      const keys = await this.redis.keys('failover:instances:*');
      for (const key of keys) {
        const serviceName = key.replace('failover:instances:', '');
        const instances = await this.loadInstancesFromRedis(serviceName);
        if (instances.length > 0) {
          this.serviceInstances.set(serviceName, instances);
          this.activeInstances.set(serviceName, instances.filter(i => i.status === 'healthy'));
        }
      }

      // Load failover history
      const historyKeys = await this.redis.keys('failover:history:*');
      for (const key of historyKeys) {
        const serviceName = key.replace('failover:history:', '');
        const history = await this.loadHistoryFromRedis(serviceName);
        this.failoverHistory.set(serviceName, history);
      }

      logger.info('Failover manager initialized', {
        services: this.serviceInstances.size,
        totalInstances: Array.from(this.serviceInstances.values()).reduce((sum, instances) => sum + instances.length, 0)
      });
    } catch (error) {
      logger.error('Failed to initialize failover manager', { error });
    }
  }

  public async registerService(
    serviceName: string,
    instances: ServiceInstance[],
    config?: Partial<FailoverConfig>
  ): Promise<void> {
    const finalConfig = { ...this.DEFAULT_CONFIG, ...config };
    this.configs.set(serviceName, finalConfig);

    // Sort instances by priority (higher priority first)
    instances.sort((a, b) => (b.priority || 0) - (a.priority || 0));

    this.serviceInstances.set(serviceName, instances);
    this.activeInstances.set(serviceName, instances.filter(i => i.status === 'healthy'));
    this.failoverHistory.set(serviceName, []);

    await this.saveInstancesToRedis(serviceName, instances);
    await this.startHealthChecks(serviceName);

    logger.info('Service registered with failover manager', {
      serviceName,
      instances: instances.length,
      activeInstances: this.activeInstances.get(serviceName)?.length || 0,
      config: finalConfig
    });

    this.emit('serviceRegistered', { serviceName, instances, config: finalConfig });
  }

  public async addInstance(serviceName: string, instance: ServiceInstance): Promise<void> {
    const instances = this.serviceInstances.get(serviceName) || [];
    const activeInstances = this.activeInstances.get(serviceName) || [];

    // Remove existing instance with same ID if exists
    const filteredInstances = instances.filter(i => i.id !== instance.id);
    const filteredActiveInstances = activeInstances.filter(i => i.id !== instance.id);

    // Add new instance
    filteredInstances.push(instance);
    if (instance.status === 'healthy') {
      filteredActiveInstances.push(instance);
    }

    // Sort by priority
    filteredInstances.sort((a, b) => (b.priority || 0) - (a.priority || 0));
    filteredActiveInstances.sort((a, b) => (b.priority || 0) - (a.priority || 0));

    this.serviceInstances.set(serviceName, filteredInstances);
    this.activeInstances.set(serviceName, filteredActiveInstances);

    await this.saveInstancesToRedis(serviceName, filteredInstances);

    logger.info('Instance added to failover manager', { serviceName, instanceId: instance.id });
    this.emit('instanceAdded', { serviceName, instance });
  }

  public async removeInstance(serviceName: string, instanceId: string): Promise<void> {
    const instances = this.serviceInstances.get(serviceName) || [];
    const activeInstances = this.activeInstances.get(serviceName) || [];

    const filteredInstances = instances.filter(i => i.id !== instanceId);
    const filteredActiveInstances = activeInstances.filter(i => i.id !== instanceId);

    this.serviceInstances.set(serviceName, filteredInstances);
    this.activeInstances.set(serviceName, filteredActiveInstances);

    await this.saveInstancesToRedis(serviceName, filteredInstances);

    logger.info('Instance removed from failover manager', { serviceName, instanceId });
    this.emit('instanceRemoved', { serviceName, instanceId });
  }

  public async getAvailableInstance(serviceName: string): Promise<ServiceInstance | null> {
    const activeInstances = this.activeInstances.get(serviceName) || [];

    if (activeInstances.length === 0) {
      // Try to find backup instances
      const config = this.configs.get(serviceName);
      if (config?.backupInstances && config.backupInstances.length > 0) {
        logger.warn('No active instances, using backup instance', { serviceName });
        return config.backupInstances[0];
      }

      logger.error('No available instances for service', { serviceName });
      return null;
    }

    // Filter out draining instances
    const availableInstances = activeInstances.filter(i => !this.drainingInstances.has(i.id));

    if (availableInstances.length === 0) {
      logger.warn('All instances are draining', { serviceName });
      return activeInstances[0]; // Return a draining instance as last resort
    }

    // Return highest priority instance (already sorted)
    return availableInstances[0];
  }

  public async failover(
    serviceName: string,
    fromInstanceId: string,
    reason: string,
    automatic: boolean = true
  ): Promise<ServiceInstance | null> {
    const instances = this.serviceInstances.get(serviceName) || [];
    const activeInstances = this.activeInstances.get(serviceName) || [];

    const fromInstance = instances.find(i => i.id === fromInstanceId);
    if (!fromInstance) {
      logger.error('Source instance not found for failover', { serviceName, fromInstanceId });
      return null;
    }

    // Mark source instance as unhealthy
    fromInstance.status = 'unhealthy';
    const newActiveInstances = activeInstances.filter(i => i.id !== fromInstanceId);
    this.activeInstances.set(serviceName, newActiveInstances);

    // Get next available instance
    const toInstance = await this.getAvailableInstance(serviceName);
    if (!toInstance) {
      logger.error('No available instance for failover', { serviceName, fromInstanceId });
      return null;
    }

    // Check failover rate limits
    const config = this.configs.get(serviceName) || this.DEFAULT_CONFIG;
    if (!this.canFailover(serviceName, config)) {
      logger.error('Failover rate limit exceeded', { serviceName, fromInstanceId });
      return null;
    }

    // Execute failover
    const failoverEvent: FailoverEvent = {
      serviceName,
      fromInstance,
      toInstance,
      reason,
      timestamp: Date.now(),
      automatic
    };

    // Record failover event
    const history = this.failoverHistory.get(serviceName) || [];
    history.push(failoverEvent);
    this.failoverHistory.set(serviceName, history);

    await this.saveHistoryToRedis(serviceName, history);
    await this.saveInstancesToRedis(serviceName, instances);

    // Start graceful draining if enabled
    if (config.gracefulDraining) {
      await this.startGracefulDraining(fromInstance, config.drainingTimeout);
    }

    logger.warn('Failover executed', {
      serviceName,
      fromInstanceId: fromInstance.id,
      toInstanceId: toInstance.id,
      reason,
      automatic
    });

    this.emit('failoverExecuted', failoverEvent);

    // Schedule failback if auto-failback is enabled
    if (config.autoFailback) {
      setTimeout(async () => {
        await this.attemptFailback(serviceName, fromInstance);
      }, config.failbackDelay);
    }

    return toInstance;
  }

  private canFailover(serviceName: string, config: FailoverConfig): boolean {
    const history = this.failoverHistory.get(serviceName) || [];
    const now = Date.now();
    const windowStart = now - config.failoverWindow;

    const recentFailovers = history.filter(event => event.timestamp >= windowStart);
    return recentFailovers.length < config.maxFailovers;
  }

  private async startGracefulDraining(instance: ServiceInstance, timeout: number): Promise<void> {
    this.drainingInstances.add(instance.id);

    setTimeout(() => {
      this.drainingInstances.delete(instance.id);
      logger.info('Graceful draining completed', { instanceId: instance.id });
    }, timeout);

    logger.info('Started graceful draining', { instanceId: instance.id, timeout });
  }

  private async attemptFailback(serviceName: string, instance: ServiceInstance): Promise<void> {
    try {
      // Perform health check on the failed instance
      const isHealthy = await this.performHealthCheck(instance);

      if (isHealthy) {
        instance.status = 'healthy';
        instance.lastHealthCheck = Date.now();

        const activeInstances = this.activeInstances.get(serviceName) || [];

        // Insert back into active instances and sort by priority
        activeInstances.push(instance);
        activeInstances.sort((a, b) => (b.priority || 0) - (a.priority || 0));

        this.activeInstances.set(serviceName, activeInstances);

        const instances = this.serviceInstances.get(serviceName) || [];
        await this.saveInstancesToRedis(serviceName, instances);

        logger.info('Auto-failback successful', { serviceName, instanceId: instance.id });
        this.emit('failbackCompleted', { serviceName, instance });
      } else {
        logger.warn('Auto-failback failed - instance still unhealthy', {
          serviceName,
          instanceId: instance.id
        });
      }
    } catch (error) {
      logger.error('Auto-failback error', { serviceName, instanceId: instance.id, error });
    }
  }

  private async startHealthChecks(serviceName: string): Promise<void> {
    const config = this.configs.get(serviceName) || this.DEFAULT_CONFIG;

    const timer = setInterval(async () => {
      await this.performHealthChecks(serviceName);
    }, config.healthCheckInterval);

    this.healthCheckTimers.set(serviceName, timer);

    // Perform initial health check
    await this.performHealthChecks(serviceName);
  }

  private async performHealthChecks(serviceName: string): Promise<void> {
    const instances = this.serviceInstances.get(serviceName) || [];
    const config = this.configs.get(serviceName) || this.DEFAULT_CONFIG;

    const healthCheckPromises = instances.map(async (instance) => {
      try {
        const isHealthy = await this.performHealthCheck(instance, config.healthCheckTimeout);
        const wasHealthy = instance.status === 'healthy';

        instance.status = isHealthy ? 'healthy' : 'unhealthy';
        instance.lastHealthCheck = Date.now();

        // If instance became healthy, add to active instances
        if (isHealthy && !wasHealthy) {
          const activeInstances = this.activeInstances.get(serviceName) || [];
          if (!activeInstances.find(i => i.id === instance.id)) {
            activeInstances.push(instance);
            activeInstances.sort((a, b) => (b.priority || 0) - (a.priority || 0));
            this.activeInstances.set(serviceName, activeInstances);

            logger.info('Instance recovered', { serviceName, instanceId: instance.id });
            this.emit('instanceRecovered', { serviceName, instance });
          }
        }

        // If instance became unhealthy, remove from active instances
        if (!isHealthy && wasHealthy) {
          const activeInstances = this.activeInstances.get(serviceName) || [];
          const newActiveInstances = activeInstances.filter(i => i.id !== instance.id);
          this.activeInstances.set(serviceName, newActiveInstances);

          logger.warn('Instance became unhealthy', { serviceName, instanceId: instance.id });
          this.emit('instanceUnhealthy', { serviceName, instance });

          // Trigger automatic failover if needed
          if (activeInstances.length === 1 && newActiveInstances.length === 0) {
            await this.failover(serviceName, instance.id, 'Health check failed', true);
          }
        }

      } catch (error) {
        logger.error('Health check failed', { serviceName, instanceId: instance.id, error });
        instance.status = 'unhealthy';
      }
    });

    await Promise.all(healthCheckPromises);
    await this.saveInstancesToRedis(serviceName, instances);
  }

  private async performHealthCheck(instance: ServiceInstance, timeout: number = 5000): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const startTime = Date.now();
      const response = await fetch(`${instance.url}/health`, {
        method: 'GET',
        signal: controller.signal,
        headers: {
          'User-Agent': 'urnlabs-gateway-health-check',
          'Accept': 'application/json'
        }
      });

      clearTimeout(timeoutId);

      const responseTime = Date.now() - startTime;
      instance.responseTime = responseTime;

      return response.ok;
    } catch (error) {
      logger.debug('Health check failed', { instanceId: instance.id, url: instance.url, error });
      return false;
    }
  }

  public async getStats(): Promise<any> {
    const services = Array.from(this.serviceInstances.entries());
    const stats = {
      services: services.length,
      totalInstances: 0,
      healthyInstances: 0,
      unhealthyInstances: 0,
      drainingInstances: this.drainingInstances.size,
      totalFailovers: 0,
      details: {} as any
    };

    for (const [serviceName, instances] of services) {
      const activeInstances = this.activeInstances.get(serviceName) || [];
      const failoverHistory = this.failoverHistory.get(serviceName) || [];

      stats.totalInstances += instances.length;
      stats.healthyInstances += activeInstances.length;
      stats.unhealthyInstances += instances.length - activeInstances.length;
      stats.totalFailovers += failoverHistory.length;

      stats.details[serviceName] = {
        totalInstances: instances.length,
        activeInstances: activeInstances.length,
        failoverEvents: failoverHistory.length,
        lastFailover: failoverHistory.length > 0
          ? new Date(failoverHistory[failoverHistory.length - 1].timestamp).toISOString()
          : null,
        instances: instances.map(i => ({
          id: i.id,
          url: i.url,
          status: i.status,
          priority: i.priority,
          responseTime: i.responseTime,
          lastHealthCheck: i.lastHealthCheck ? new Date(i.lastHealthCheck).toISOString() : null,
          isDraining: this.drainingInstances.has(i.id)
        }))
      };
    }

    return stats;
  }

  private async saveInstancesToRedis(serviceName: string, instances: ServiceInstance[]): Promise<void> {
    try {
      await this.redis.setex(
        `failover:instances:${serviceName}`,
        3600, // 1 hour TTL
        JSON.stringify(instances)
      );
    } catch (error) {
      logger.error('Failed to save instances to Redis', { serviceName, error });
    }
  }

  private async loadInstancesFromRedis(serviceName: string): Promise<ServiceInstance[]> {
    try {
      const data = await this.redis.get(`failover:instances:${serviceName}`);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      logger.error('Failed to load instances from Redis', { serviceName, error });
      return [];
    }
  }

  private async saveHistoryToRedis(serviceName: string, history: FailoverEvent[]): Promise<void> {
    try {
      // Keep only last 100 events
      const limitedHistory = history.slice(-100);
      await this.redis.setex(
        `failover:history:${serviceName}`,
        86400, // 24 hours TTL
        JSON.stringify(limitedHistory)
      );
    } catch (error) {
      logger.error('Failed to save history to Redis', { serviceName, error });
    }
  }

  private async loadHistoryFromRedis(serviceName: string): Promise<FailoverEvent[]> {
    try {
      const data = await this.redis.get(`failover:history:${serviceName}`);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      logger.error('Failed to load history from Redis', { serviceName, error });
      return [];
    }
  }

  public destroy(): void {
    // Clear all timers
    for (const timer of this.healthCheckTimers.values()) {
      clearInterval(timer);
    }
    this.healthCheckTimers.clear();
    this.removeAllListeners();
  }
}