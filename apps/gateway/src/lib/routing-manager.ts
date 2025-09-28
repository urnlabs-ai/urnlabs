import { FastifyRequest } from 'fastify';
import crypto from 'crypto';
import logger from './logger.js';
import { redisManager } from './redis.js';
import {
  ServiceInstance,
  LoadBalancerAlgorithm,
  RoutingStrategy,
  RoutingRule,
  CanaryConfig
} from '../types/index.js';

export interface RoutingDecision {
  targetUrl: string;
  instance: ServiceInstance;
  version: string;
  routingReason: string;
}

export class AdvancedRoutingManager {
  private roundRobinCounters: Map<string, number> = new Map();
  private canaryConfigs: Map<string, CanaryConfig> = new Map();

  constructor() {
    this.initializeCounters();
  }

  private initializeCounters(): void {
    // Initialize round-robin counters for services
    this.roundRobinCounters.set('api', 0);
    this.roundRobinCounters.set('agents', 0);
    this.roundRobinCounters.set('bridge', 0);
    this.roundRobinCounters.set('security', 0);
  }

  /**
   * Main routing decision method
   */
  async routeRequest(
    request: FastifyRequest,
    serviceName: string,
    instances: ServiceInstance[],
    routingStrategy?: RoutingStrategy,
    algorithm: LoadBalancerAlgorithm = 'round-robin'
  ): Promise<RoutingDecision> {
    // Filter healthy instances
    const healthyInstances = instances.filter(instance => instance.status === 'healthy');

    if (healthyInstances.length === 0) {
      throw new Error(`No healthy instances available for service: ${serviceName}`);
    }

    // Apply routing strategy if defined
    if (routingStrategy) {
      const strategyResult = await this.applyRoutingStrategy(request, healthyInstances, routingStrategy);
      if (strategyResult) {
        return strategyResult;
      }
    }

    // Check for canary deployment
    const canaryConfig = this.canaryConfigs.get(serviceName);
    if (canaryConfig?.enabled) {
      const canaryResult = await this.handleCanaryRouting(request, healthyInstances, canaryConfig);
      if (canaryResult) {
        return canaryResult;
      }
    }

    // Apply load balancing algorithm
    const instance = await this.applyLoadBalancer(request, healthyInstances, algorithm, serviceName);

    return {
      targetUrl: instance.url,
      instance,
      version: instance.version,
      routingReason: `Load balanced using ${algorithm} algorithm`
    };
  }

  /**
   * Apply routing strategy based on request properties
   */
  private async applyRoutingStrategy(
    request: FastifyRequest,
    instances: ServiceInstance[],
    strategy: RoutingStrategy
  ): Promise<RoutingDecision | null> {
    // Sort rules by priority
    const sortedRules = strategy.rules.sort((a, b) => b.priority - a.priority);

    for (const rule of sortedRules) {
      if (await this.matchesRule(request, rule)) {
        const targetInstances = instances.filter(instance => {
          if (rule.target.version && instance.version !== rule.target.version) {
            return false;
          }
          return true;
        });

        if (targetInstances.length > 0) {
          const instance = targetInstances[0]; // Use first matching instance

          logger.info({
            rule: rule.match,
            target: rule.target,
            instance: instance.id
          }, 'Applied routing strategy');

          return {
            targetUrl: instance.url,
            instance,
            version: instance.version,
            routingReason: `Matched routing rule: ${JSON.stringify(rule.match)}`
          };
        }
      }
    }

    return null;
  }

  /**
   * Check if request matches routing rule
   */
  private async matchesRule(request: FastifyRequest, rule: RoutingRule): Promise<boolean> {
    const { match } = rule;

    // Path matching
    if (match.path && !request.url.startsWith(match.path)) {
      return false;
    }

    // Header matching
    if (match.headers) {
      for (const [key, value] of Object.entries(match.headers)) {
        const headerValue = request.headers[key.toLowerCase()];
        if (headerValue !== value) {
          return false;
        }
      }
    }

    // Query parameter matching
    if (match.query) {
      const queryParams = new URLSearchParams(request.url.split('?')[1]);
      for (const [key, value] of Object.entries(match.query)) {
        if (queryParams.get(key) !== value) {
          return false;
        }
      }
    }

    // Method matching
    if (match.method && request.method !== match.method) {
      return false;
    }

    return true;
  }

  /**
   * Handle canary deployment routing
   */
  private async handleCanaryRouting(
    request: FastifyRequest,
    instances: ServiceInstance[],
    canaryConfig: CanaryConfig
  ): Promise<RoutingDecision | null> {
    // Determine if this request should be routed to canary
    const canaryTrafficRatio = await this.getCanaryTrafficRatio(canaryConfig);
    const shouldRouteToCanary = await this.shouldRouteToCanary(request, canaryTrafficRatio);

    if (shouldRouteToCanary) {
      const canaryInstances = instances.filter(instance =>
        canaryConfig.versions.some(v => v.version === instance.version && v.weight > 0)
      );

      if (canaryInstances.length > 0) {
        const instance = canaryInstances[Math.floor(Math.random() * canaryInstances.length)];

        logger.info({
          canaryConfig,
          instance: instance.id,
          version: instance.version
        }, 'Routed to canary instance');

        return {
          targetUrl: instance.url,
          instance,
          version: instance.version,
          routingReason: 'Canary deployment routing'
        };
      }
    }

    return null;
  }

  /**
   * Apply load balancing algorithm
   */
  private async applyLoadBalancer(
    request: FastifyRequest,
    instances: ServiceInstance[],
    algorithm: LoadBalancerAlgorithm,
    serviceName: string
  ): Promise<ServiceInstance> {
    switch (algorithm) {
      case 'round-robin':
        return this.roundRobinSelect(instances, serviceName);

      case 'least-connections':
        return this.leastConnectionsSelect(instances);

      case 'weighted':
        return this.weightedSelect(instances);

      case 'ip-hash':
        return this.ipHashSelect(request, instances);

      case 'random':
        return this.randomSelect(instances);

      default:
        return this.roundRobinSelect(instances, serviceName);
    }
  }

  /**
   * Round-robin load balancing
   */
  private roundRobinSelect(instances: ServiceInstance[], serviceName: string): ServiceInstance {
    const currentIndex = this.roundRobinCounters.get(serviceName) || 0;
    const selectedInstance = instances[currentIndex % instances.length];

    this.roundRobinCounters.set(serviceName, currentIndex + 1);

    logger.debug({
      algorithm: 'round-robin',
      serviceName,
      selectedInstance: selectedInstance.id,
      currentIndex
    }, 'Load balancer selection');

    return selectedInstance;
  }

  /**
   * Least connections load balancing
   */
  private leastConnectionsSelect(instances: ServiceInstance[]): ServiceInstance {
    const instance = instances.reduce((min, current) =>
      current.connections < min.connections ? current : min
    );

    logger.debug({
      algorithm: 'least-connections',
      selectedInstance: instance.id,
      connections: instance.connections
    }, 'Load balancer selection');

    return instance;
  }

  /**
   * Weighted load balancing
   */
  private weightedSelect(instances: ServiceInstance[]): ServiceInstance {
    const totalWeight = instances.reduce((sum, instance) => sum + instance.weight, 0);
    const random = Math.random() * totalWeight;

    let currentWeight = 0;
    for (const instance of instances) {
      currentWeight += instance.weight;
      if (random <= currentWeight) {
        logger.debug({
          algorithm: 'weighted',
          selectedInstance: instance.id,
          weight: instance.weight,
          totalWeight
        }, 'Load balancer selection');

        return instance;
      }
    }

    return instances[0]; // Fallback
  }

  /**
   * IP hash load balancing (sticky sessions)
   */
  private ipHashSelect(request: FastifyRequest, instances: ServiceInstance[]): ServiceInstance {
    const clientIp = request.ip;
    const hash = crypto.createHash('md5').update(clientIp).digest('hex');
    const hashValue = parseInt(hash.substr(0, 8), 16);
    const index = hashValue % instances.length;

    const selectedInstance = instances[index];

    logger.debug({
      algorithm: 'ip-hash',
      clientIp,
      selectedInstance: selectedInstance.id,
      index
    }, 'Load balancer selection');

    return selectedInstance;
  }

  /**
   * Random load balancing
   */
  private randomSelect(instances: ServiceInstance[]): ServiceInstance {
    const index = Math.floor(Math.random() * instances.length);
    const selectedInstance = instances[index];

    logger.debug({
      algorithm: 'random',
      selectedInstance: selectedInstance.id,
      index
    }, 'Load balancer selection');

    return selectedInstance;
  }

  /**
   * Get canary traffic ratio
   */
  private async getCanaryTrafficRatio(canaryConfig: CanaryConfig): Promise<number> {
    // Calculate total canary traffic percentage
    const canaryVersions = canaryConfig.versions.filter(v => v.weight > 0);
    const totalCanaryWeight = canaryVersions.reduce((sum, v) => sum + v.weight, 0);

    return totalCanaryWeight / 100; // Convert to decimal
  }

  /**
   * Determine if request should go to canary
   */
  private async shouldRouteToCanary(request: FastifyRequest, canaryRatio: number): Promise<boolean> {
    // Check for canary header override
    const canaryHeader = request.headers['x-canary-routing'];
    if (canaryHeader === 'true') return true;
    if (canaryHeader === 'false') return false;

    // Use session-based sticky routing for consistent experience
    const sessionId = request.headers['x-session-id'] as string;
    if (sessionId) {
      const cacheKey = `canary:routing:${sessionId}`;
      const cachedDecision = await redisManager.get(cacheKey);

      if (cachedDecision) {
        return cachedDecision === 'true';
      }

      // Make new decision and cache it
      const decision = Math.random() < canaryRatio;
      await redisManager.set(cacheKey, decision.toString(), 3600); // Cache for 1 hour
      return decision;
    }

    // Fallback to random decision
    return Math.random() < canaryRatio;
  }

  /**
   * Configure canary deployment for a service
   */
  setCanaryConfig(serviceName: string, config: CanaryConfig): void {
    this.canaryConfigs.set(serviceName, config);

    logger.info({
      serviceName,
      config
    }, 'Configured canary deployment');
  }

  /**
   * Update instance connection count
   */
  updateInstanceConnections(instanceId: string, delta: number): void {
    // This would be called by the proxy middleware to track connections
    // For now, we'll just log the update
    logger.debug({
      instanceId,
      delta
    }, 'Updated instance connection count');
  }

  /**
   * Get routing statistics
   */
  async getRoutingStats(): Promise<any> {
    const stats = {
      roundRobinCounters: Object.fromEntries(this.roundRobinCounters),
      canaryConfigs: Object.fromEntries(this.canaryConfigs),
      timestamp: new Date().toISOString()
    };

    return stats;
  }
}

export default AdvancedRoutingManager;