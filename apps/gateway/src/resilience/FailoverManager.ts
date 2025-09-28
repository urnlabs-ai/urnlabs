import Redis from 'ioredis';
import { EventEmitter } from 'events';
import logger from '../lib/logger.js';
import CircuitBreaker from './CircuitBreaker.js';
import HealthMonitor, { ServiceHealth, HealthStatus } from './HealthMonitor.js';

export interface ServiceInstance {
  id: string;
  name: string;
  host: string;
  port: number;
  protocol: 'http' | 'https';
  path?: string;
  weight: number;
  priority: number;
  healthy: boolean;
  metadata?: Record<string, any>;
  tags?: string[];
  region?: string;
  zone?: string;
}

export interface FailoverConfig {
  service: string;
  strategy: 'ROUND_ROBIN' | 'LEAST_CONNECTIONS' | 'WEIGHTED_ROUND_ROBIN' | 'PRIORITY' | 'HEALTH_BASED';
  maxFailovers: number;
  failoverWindow: number;
  healthCheckInterval: number;
  autoFailback: boolean;
  failbackDelay: number;
  gracefulDraining: boolean;
  drainingTimeout: number;
  crossRegionFailover: boolean;
  minHealthyInstances: number;
  stickySession: boolean;
}

export interface FailoverState {
  service: string;
  activeInstance: ServiceInstance | null;
  availableInstances: ServiceInstance[];
  drainingInstances: ServiceInstance[];
  failedInstances: ServiceInstance[];
  failoverCount: number;
  lastFailoverTime: number;
  roundRobinIndex: number;
  connectionCounts: Map<string, number>;
}

export interface FailoverEvent {
  type: 'FAILOVER' | 'FAILBACK' | 'INSTANCE_ADDED' | 'INSTANCE_REMOVED' | 'INSTANCE_DRAINED';
  service: string;
  instance?: ServiceInstance;
  previousInstance?: ServiceInstance;
  reason: string;
  timestamp: number;
  metadata?: Record<string, any>;
}

export interface LoadBalancerMetrics {
  service: string;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageResponseTime: number;
  instanceMetrics: Map<string, InstanceMetrics>;
  currentDistribution: Map<string, number>;
}

export interface InstanceMetrics {
  instanceId: string;
  requests: number;
  successRate: number;
  averageResponseTime: number;
  currentConnections: number;
  totalConnections: number;
  lastUsed: number;
}

export interface FailoverManagerEvents {
  failover: (event: FailoverEvent) => void;
  failback: (event: FailoverEvent) => void;
  instanceHealthChanged: (service: string, instance: ServiceInstance, healthy: boolean) => void;
  allInstancesDown: (service: string) => void;
  serviceRestored: (service: string, instance: ServiceInstance) => void;
  drainingStarted: (service: string, instance: ServiceInstance) => void;
  drainingCompleted: (service: string, instance: ServiceInstance) => void;
}

export class FailoverManager extends EventEmitter {
  private redis: Redis;
  private circuitBreaker?: CircuitBreaker;
  private healthMonitor?: HealthMonitor;
  private services = new Map<string, FailoverConfig>();
  private serviceStates = new Map<string, FailoverState>();
  private loadBalancerMetrics = new Map<string, LoadBalancerMetrics>();
  private failoverHistory = new Map<string, FailoverEvent[]>();
  private drainingTimeouts = new Map<string, NodeJS.Timeout>();
  private healthCheckIntervals = new Map<string, NodeJS.Timeout>();
  private running = false;

  constructor(redis: Redis, circuitBreaker?: CircuitBreaker, healthMonitor?: HealthMonitor) {
    super();
    this.redis = redis;
    this.circuitBreaker = circuitBreaker;
    this.healthMonitor = healthMonitor;
  }

  public async start(): Promise<void> {
    if (this.running) return;

    this.running = true;
    logger.info('Failover manager starting');

    // Load persisted configurations
    await this.loadConfigurations();

    // Start health monitoring for all services
    for (const service of Array.from(this.services.keys())) {
      this.startServiceMonitoring(service);
    }

    logger.info('Failover manager started', {
      services: this.services.size,
      activeMonitors: this.healthCheckIntervals.size
    });
  }

  public async stop(): Promise<void> {
    if (!this.running) return;

    this.running = false;
    logger.info('Failover manager stopping');

    // Stop all monitoring intervals
    for (const interval of Array.from(this.healthCheckIntervals.values())) {
      clearInterval(interval);
    }
    this.healthCheckIntervals.clear();

    // Clear draining timeouts
    for (const timeout of Array.from(this.drainingTimeouts.values())) {
      clearTimeout(timeout);
    }
    this.drainingTimeouts.clear();

    // Persist current state
    await this.persistConfigurations();

    logger.info('Failover manager stopped');
  }

  public async registerService(
    service: string,
    instances: ServiceInstance[],
    config: Partial<FailoverConfig> = {}
  ): Promise<void> {
    const fullConfig: FailoverConfig = {
      service,
      strategy: 'HEALTH_BASED',
      maxFailovers: 5,
      failoverWindow: 300000, // 5 minutes
      healthCheckInterval: 30000, // 30 seconds
      autoFailback: true,
      failbackDelay: 60000, // 1 minute
      gracefulDraining: true,
      drainingTimeout: 30000, // 30 seconds
      crossRegionFailover: false,
      minHealthyInstances: 1,
      stickySession: false,
      ...config
    };

    this.services.set(service, fullConfig);

    // Initialize service state
    const state: FailoverState = {
      service,
      activeInstance: null,
      availableInstances: [...instances],
      drainingInstances: [],
      failedInstances: [],
      failoverCount: 0,
      lastFailoverTime: 0,
      roundRobinIndex: 0,
      connectionCounts: new Map()
    };

    this.serviceStates.set(service, state);

    // Initialize metrics
    this.initializeMetrics(service);

    // Select initial active instance
    await this.selectActiveInstance(service);

    // Start monitoring if manager is running
    if (this.running) {
      this.startServiceMonitoring(service);
    }

    await this.persistConfigurations();

    logger.info('Service registered for failover', {
      service,
      instances: instances.length,
      strategy: fullConfig.strategy
    });
  }

  public async unregisterService(service: string): Promise<void> {
    const config = this.services.get(service);
    if (!config) return;

    // Stop monitoring
    this.stopServiceMonitoring(service);

    // Clean up state
    this.services.delete(service);
    this.serviceStates.delete(service);
    this.loadBalancerMetrics.delete(service);
    this.failoverHistory.delete(service);

    await this.persistConfigurations();

    logger.info('Service unregistered from failover', { service });
  }

  public async getActiveInstance(service: string): Promise<ServiceInstance | null> {
    const state = this.serviceStates.get(service);
    if (!state) return null;

    // Return active instance if healthy
    if (state.activeInstance && state.activeInstance.healthy) {
      return state.activeInstance;
    }

    // Try to select a new active instance
    return await this.selectActiveInstance(service);
  }

  public async getAvailableInstances(service: string): Promise<ServiceInstance[]> {
    const state = this.serviceStates.get(service);
    return state ? state.availableInstances.filter(instance => instance.healthy) : [];
  }

  public async selectInstance(service: string, excludeInstances: string[] = []): Promise<ServiceInstance | null> {
    const config = this.services.get(service);
    const state = this.serviceStates.get(service);

    if (!config || !state) return null;

    const availableInstances = state.availableInstances
      .filter(instance => instance.healthy && !excludeInstances.includes(instance.id));

    if (availableInstances.length === 0) {
      logger.warn('No healthy instances available', { service });
      this.emit('allInstancesDown', service);
      return null;
    }

    let selectedInstance: ServiceInstance;

    switch (config.strategy) {
      case 'ROUND_ROBIN':
        selectedInstance = this.selectRoundRobin(state, availableInstances);
        break;
      case 'WEIGHTED_ROUND_ROBIN':
        selectedInstance = this.selectWeightedRoundRobin(availableInstances);
        break;
      case 'LEAST_CONNECTIONS':
        selectedInstance = this.selectLeastConnections(state, availableInstances);
        break;
      case 'PRIORITY':
        selectedInstance = this.selectByPriority(availableInstances);
        break;
      case 'HEALTH_BASED':
        selectedInstance = await this.selectHealthBased(service, availableInstances);
        break;
      default:
        selectedInstance = availableInstances[0];
    }

    // Update metrics
    await this.updateInstanceMetrics(service, selectedInstance.id, 'selected');

    return selectedInstance;
  }

  private selectRoundRobin(state: FailoverState, instances: ServiceInstance[]): ServiceInstance {
    if (instances.length === 0) throw new Error('No instances available');

    const index = state.roundRobinIndex % instances.length;
    state.roundRobinIndex++;
    return instances[index];
  }

  private selectWeightedRoundRobin(instances: ServiceInstance[]): ServiceInstance {
    const totalWeight = instances.reduce((sum, instance) => sum + instance.weight, 0);
    let randomWeight = Math.random() * totalWeight;

    for (const instance of instances) {
      randomWeight -= instance.weight;
      if (randomWeight <= 0) {
        return instance;
      }
    }

    return instances[instances.length - 1];
  }

  private selectLeastConnections(state: FailoverState, instances: ServiceInstance[]): ServiceInstance {
    return instances.reduce((least, current) => {
      const currentConnections = state.connectionCounts.get(current.id) || 0;
      const leastConnections = state.connectionCounts.get(least.id) || 0;
      return currentConnections < leastConnections ? current : least;
    });
  }

  private selectByPriority(instances: ServiceInstance[]): ServiceInstance {
    return instances.reduce((highest, current) =>
      current.priority > highest.priority ? current : highest
    );
  }

  private async selectHealthBased(service: string, instances: ServiceInstance[]): Promise<ServiceInstance> {
    if (!this.healthMonitor) {
      return this.selectByPriority(instances);
    }

    // Get health scores for all instances
    const instanceHealthScores = new Map<string, number>();

    for (const instance of instances) {
      const health = this.healthMonitor.getServiceHealth(instance.name);
      const score = health ? health.healthScore : 0;
      instanceHealthScores.set(instance.id, score);
    }

    // Select instance with highest health score
    return instances.reduce((best, current) => {
      const currentScore = instanceHealthScores.get(current.id) || 0;
      const bestScore = instanceHealthScores.get(best.id) || 0;
      return currentScore > bestScore ? current : best;
    });
  }

  private async selectActiveInstance(service: string): Promise<ServiceInstance | null> {
    const selectedInstance = await this.selectInstance(service);

    if (selectedInstance) {
      const state = this.serviceStates.get(service);
      if (state) {
        state.activeInstance = selectedInstance;
      }

      logger.info('Active instance selected', {
        service,
        instanceId: selectedInstance.id,
        host: selectedInstance.host
      });
    }

    return selectedInstance;
  }

  public async failover(
    service: string,
    failedInstanceId: string,
    reason: string,
    automatic = true
  ): Promise<ServiceInstance | null> {
    const config = this.services.get(service);
    const state = this.serviceStates.get(service);

    if (!config || !state) {
      throw new Error(`Service not found: ${service}`);
    }

    const failedInstance = state.availableInstances.find(instance => instance.id === failedInstanceId);
    if (!failedInstance) {
      throw new Error(`Instance not found: ${failedInstanceId}`);
    }

    // Check failover limits
    const now = Date.now();
    if (now - state.lastFailoverTime < config.failoverWindow) {
      if (state.failoverCount >= config.maxFailovers) {
        logger.error('Max failovers reached within window', {
          service,
          count: state.failoverCount,
          window: config.failoverWindow
        });
        return null;
      }
    } else {
      // Reset counter outside window
      state.failoverCount = 0;
    }

    // Mark instance as failed
    failedInstance.healthy = false;

    // Remove from available instances
    state.availableInstances = state.availableInstances.filter(instance => instance.id !== failedInstanceId);
    state.failedInstances.push(failedInstance);

    // Start draining if configured
    if (config.gracefulDraining) {
      await this.startGracefulDraining(service, failedInstance);
    }

    // Select new active instance
    const newActiveInstance = await this.selectActiveInstance(service);

    if (newActiveInstance) {
      // Update state
      state.failoverCount++;
      state.lastFailoverTime = now;

      // Create failover event
      const event: FailoverEvent = {
        type: 'FAILOVER',
        service,
        instance: newActiveInstance,
        previousInstance: failedInstance,
        reason,
        timestamp: now,
        metadata: {
          automatic,
          failoverCount: state.failoverCount
        }
      };

      // Record event
      this.recordFailoverEvent(service, event);
      this.emit('failover', event);

      logger.warn('Failover executed', {
        service,
        failedInstance: failedInstanceId,
        newInstance: newActiveInstance.id,
        reason,
        automatic
      });

      return newActiveInstance;
    } else {
      logger.error('No healthy instances available for failover', { service });
      this.emit('allInstancesDown', service);
      return null;
    }
  }

  public async failback(service: string, instanceId: string): Promise<boolean> {
    const config = this.services.get(service);
    const state = this.serviceStates.get(service);

    if (!config || !state) return false;

    const instance = state.failedInstances.find(inst => inst.id === instanceId);
    if (!instance) return false;

    // Check if auto failback is enabled and delay has passed
    if (config.autoFailback) {
      const timeSinceFailure = Date.now() - state.lastFailoverTime;
      if (timeSinceFailure < config.failbackDelay) {
        logger.info('Failback delayed', {
          service,
          instanceId,
          remaining: config.failbackDelay - timeSinceFailure
        });
        return false;
      }
    }

    // Verify instance health
    const isHealthy = await this.checkInstanceHealth(service, instance);
    if (!isHealthy) {
      logger.warn('Instance not ready for failback', { service, instanceId });
      return false;
    }

    // Move instance back to available
    state.failedInstances = state.failedInstances.filter(inst => inst.id !== instanceId);
    instance.healthy = true;
    state.availableInstances.push(instance);

    // Create failback event
    const event: FailoverEvent = {
      type: 'FAILBACK',
      service,
      instance,
      reason: 'Instance recovered',
      timestamp: Date.now(),
      metadata: {
        autoFailback: config.autoFailback
      }
    };

    this.recordFailoverEvent(service, event);
    this.emit('failback', event);
    this.emit('serviceRestored', service, instance);

    logger.info('Failback completed', { service, instanceId });

    return true;
  }

  private async startGracefulDraining(service: string, instance: ServiceInstance): Promise<void> {
    const config = this.services.get(service);
    const state = this.serviceStates.get(service);

    if (!config || !state) return;

    // Move to draining instances
    state.drainingInstances.push(instance);

    this.emit('drainingStarted', service, instance);

    // Set timeout for draining completion
    const timeout = setTimeout(async () => {
      await this.completeDraining(service, instance.id);
    }, config.drainingTimeout);

    this.drainingTimeouts.set(`${service}:${instance.id}`, timeout);

    logger.info('Graceful draining started', {
      service,
      instanceId: instance.id,
      timeout: config.drainingTimeout
    });
  }

  private async completeDraining(service: string, instanceId: string): Promise<void> {
    const state = this.serviceStates.get(service);
    if (!state) return;

    // Remove from draining instances
    const drainingIndex = state.drainingInstances.findIndex(inst => inst.id === instanceId);
    if (drainingIndex >= 0) {
      const instance = state.drainingInstances[drainingIndex];
      state.drainingInstances.splice(drainingIndex, 1);

      this.emit('drainingCompleted', service, instance);

      logger.info('Graceful draining completed', { service, instanceId });
    }

    // Clear timeout
    const timeoutKey = `${service}:${instanceId}`;
    const timeout = this.drainingTimeouts.get(timeoutKey);
    if (timeout) {
      clearTimeout(timeout);
      this.drainingTimeouts.delete(timeoutKey);
    }
  }

  private async checkInstanceHealth(service: string, instance: ServiceInstance): Promise<boolean> {
    if (!this.healthMonitor) {
      // Basic health check without health monitor
      try {
        const url = `${instance.protocol}://${instance.host}:${instance.port}${instance.path || '/health'}`;
        const response = await fetch(url, {
          method: 'GET',
          signal: AbortSignal.timeout(5000)
        });
        return response.ok;
      } catch (error) {
        return false;
      }
    }

    // Use health monitor if available
    const health = this.healthMonitor.getServiceHealth(instance.name);
    return health ? health.overall.healthy : false;
  }

  private startServiceMonitoring(service: string): void {
    const config = this.services.get(service);
    if (!config) return;

    // Stop existing monitoring
    this.stopServiceMonitoring(service);

    // Start health check interval
    const interval = setInterval(async () => {
      await this.performHealthCheck(service);
    }, config.healthCheckInterval);

    this.healthCheckIntervals.set(service, interval);

    // Perform initial health check
    setImmediate(() => this.performHealthCheck(service));
  }

  private stopServiceMonitoring(service: string): void {
    const interval = this.healthCheckIntervals.get(service);
    if (interval) {
      clearInterval(interval);
      this.healthCheckIntervals.delete(service);
    }
  }

  private async performHealthCheck(service: string): Promise<void> {
    const state = this.serviceStates.get(service);
    if (!state) return;

    // Check all instances
    const allInstances = [
      ...state.availableInstances,
      ...state.failedInstances
    ];

    for (const instance of allInstances) {
      const wasHealthy = instance.healthy;
      const isHealthy = await this.checkInstanceHealth(service, instance);

      if (wasHealthy !== isHealthy) {
        instance.healthy = isHealthy;
        this.emit('instanceHealthChanged', service, instance, isHealthy);

        if (isHealthy && state.failedInstances.includes(instance)) {
          // Auto-failback if configured
          const config = this.services.get(service);
          if (config?.autoFailback) {
            await this.failback(service, instance.id);
          }
        } else if (!isHealthy && state.availableInstances.includes(instance)) {
          // Auto-failover
          await this.failover(service, instance.id, 'Health check failed', true);
        }
      }
    }
  }

  private initializeMetrics(service: string): void {
    const metrics: LoadBalancerMetrics = {
      service,
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      averageResponseTime: 0,
      instanceMetrics: new Map(),
      currentDistribution: new Map()
    };

    this.loadBalancerMetrics.set(service, metrics);
  }

  private async updateInstanceMetrics(
    service: string,
    instanceId: string,
    action: 'selected' | 'success' | 'failure',
    responseTime?: number
  ): Promise<void> {
    const metrics = this.loadBalancerMetrics.get(service);
    if (!metrics) return;

    let instanceMetrics = metrics.instanceMetrics.get(instanceId);
    if (!instanceMetrics) {
      instanceMetrics = {
        instanceId,
        requests: 0,
        successRate: 0,
        averageResponseTime: 0,
        currentConnections: 0,
        totalConnections: 0,
        lastUsed: 0
      };
      metrics.instanceMetrics.set(instanceId, instanceMetrics);
    }

    switch (action) {
      case 'selected':
        instanceMetrics.requests++;
        instanceMetrics.totalConnections++;
        instanceMetrics.currentConnections++;
        instanceMetrics.lastUsed = Date.now();
        metrics.totalRequests++;
        break;

      case 'success':
        metrics.successfulRequests++;
        instanceMetrics.currentConnections = Math.max(0, instanceMetrics.currentConnections - 1);
        if (responseTime) {
          instanceMetrics.averageResponseTime =
            ((instanceMetrics.averageResponseTime * (instanceMetrics.requests - 1)) + responseTime) / instanceMetrics.requests;
          metrics.averageResponseTime =
            ((metrics.averageResponseTime * (metrics.totalRequests - 1)) + responseTime) / metrics.totalRequests;
        }
        break;

      case 'failure':
        metrics.failedRequests++;
        instanceMetrics.currentConnections = Math.max(0, instanceMetrics.currentConnections - 1);
        break;
    }

    // Update success rate
    if (instanceMetrics.requests > 0) {
      const successfulRequests = instanceMetrics.requests -
        (metrics.failedRequests * instanceMetrics.requests / metrics.totalRequests);
      instanceMetrics.successRate = (successfulRequests / instanceMetrics.requests) * 100;
    }

    // Update distribution
    metrics.currentDistribution.set(instanceId, instanceMetrics.requests);
  }

  private recordFailoverEvent(service: string, event: FailoverEvent): void {
    let history = this.failoverHistory.get(service);
    if (!history) {
      history = [];
      this.failoverHistory.set(service, history);
    }

    history.push(event);

    // Keep only last 100 events
    if (history.length > 100) {
      history.splice(0, history.length - 100);
    }
  }

  public getServiceMetrics(service: string): LoadBalancerMetrics | null {
    return this.loadBalancerMetrics.get(service) || null;
  }

  public getFailoverHistory(service: string): FailoverEvent[] {
    return this.failoverHistory.get(service) || [];
  }

  public async addInstance(service: string, instance: ServiceInstance): Promise<void> {
    const state = this.serviceStates.get(service);
    if (!state) {
      throw new Error(`Service not found: ${service}`);
    }

    // Check if instance already exists
    const existingIndex = state.availableInstances.findIndex(inst => inst.id === instance.id);
    if (existingIndex >= 0) {
      // Update existing instance
      state.availableInstances[existingIndex] = instance;
    } else {
      // Add new instance
      state.availableInstances.push(instance);
    }

    // Initialize metrics for new instance
    const metrics = this.loadBalancerMetrics.get(service);
    if (metrics && !metrics.instanceMetrics.has(instance.id)) {
      metrics.instanceMetrics.set(instance.id, {
        instanceId: instance.id,
        requests: 0,
        successRate: 100,
        averageResponseTime: 0,
        currentConnections: 0,
        totalConnections: 0,
        lastUsed: 0
      });
    }

    const event: FailoverEvent = {
      type: 'INSTANCE_ADDED',
      service,
      instance,
      reason: 'Instance added to service',
      timestamp: Date.now()
    };

    this.recordFailoverEvent(service, event);

    logger.info('Instance added to service', {
      service,
      instanceId: instance.id,
      host: instance.host
    });
  }

  public async removeInstance(service: string, instanceId: string): Promise<void> {
    const state = this.serviceStates.get(service);
    if (!state) {
      throw new Error(`Service not found: ${service}`);
    }

    // Find and remove instance
    const removedInstance = state.availableInstances.find(inst => inst.id === instanceId) ||
                           state.failedInstances.find(inst => inst.id === instanceId) ||
                           state.drainingInstances.find(inst => inst.id === instanceId);

    if (!removedInstance) {
      throw new Error(`Instance not found: ${instanceId}`);
    }

    // Remove from all arrays
    state.availableInstances = state.availableInstances.filter(inst => inst.id !== instanceId);
    state.failedInstances = state.failedInstances.filter(inst => inst.id !== instanceId);
    state.drainingInstances = state.drainingInstances.filter(inst => inst.id !== instanceId);

    // Clear draining timeout if exists
    const timeoutKey = `${service}:${instanceId}`;
    const timeout = this.drainingTimeouts.get(timeoutKey);
    if (timeout) {
      clearTimeout(timeout);
      this.drainingTimeouts.delete(timeoutKey);
    }

    // If this was the active instance, select a new one
    if (state.activeInstance?.id === instanceId) {
      await this.selectActiveInstance(service);
    }

    const event: FailoverEvent = {
      type: 'INSTANCE_REMOVED',
      service,
      instance: removedInstance,
      reason: 'Instance removed from service',
      timestamp: Date.now()
    };

    this.recordFailoverEvent(service, event);

    logger.info('Instance removed from service', {
      service,
      instanceId,
      host: removedInstance.host
    });
  }

  private async persistConfigurations(): Promise<void> {
    const data = {
      services: Array.from(this.services.entries()),
      states: Array.from(this.serviceStates.entries()),
      metrics: Array.from(this.loadBalancerMetrics.entries()),
      history: Array.from(this.failoverHistory.entries())
    };

    await this.redis.setex('failover_manager:config', 3600, JSON.stringify(data));
  }

  private async loadConfigurations(): Promise<void> {
    const data = await this.redis.get('failover_manager:config');
    if (data) {
      try {
        const config = JSON.parse(data);
        this.services = new Map(config.services || []);
        this.serviceStates = new Map(config.states || []);
        this.loadBalancerMetrics = new Map(config.metrics || []);
        this.failoverHistory = new Map(config.history || []);
      } catch (error) {
        logger.error('Failed to load failover configurations', { error });
      }
    }
  }

  public destroy(): void {
    this.stop();
    this.removeAllListeners();
  }
}

export default FailoverManager;