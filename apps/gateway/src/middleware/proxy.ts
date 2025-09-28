import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import httpProxy from '@fastify/http-proxy';
import axios from 'axios';
import config from '../lib/config.js';
import logger from '../lib/logger.js';
import { redisManager } from '../lib/redis.js';
import AdvancedRoutingManager from '../lib/routing-manager.js';
import { ServiceEndpoint, ProxyRoute, ServiceInstance, LoadBalancerAlgorithm } from '../types/index.js';
import { ReliabilityModule, createReliabilityModule } from '../reliability/index.js';

export class ProxyManager {
  private fastify: FastifyInstance;
  private healthChecks: Map<string, NodeJS.Timeout> = new Map();
  private routingManager: AdvancedRoutingManager;
  private serviceInstances: Map<string, ServiceInstance[]> = new Map();
  private reliability: ReliabilityModule | null = null;

  constructor(fastify: FastifyInstance) {
    this.fastify = fastify;
    this.routingManager = new AdvancedRoutingManager();
    this.initializeServiceInstances();
    this.initializeReliability();
  }

  private async initializeReliability(): Promise<void> {
    try {
      this.reliability = await createReliabilityModule(
        this.fastify,
        redisManager.getClient(),
        {
          circuitBreaker: { enabled: true },
          failover: { enabled: true },
          retry: { enabled: true },
          dashboard: { enabled: true }
        }
      );

      // Register all services with reliability module
      for (const [serviceName, instances] of this.serviceInstances.entries()) {
        await this.reliability.registerService(serviceName, instances);
      }

      logger.info('ProxyManager reliability module initialized');
    } catch (error) {
      logger.error('Failed to initialize reliability module', { error });
    }
  }

  private initializeServiceInstances(): void {
    // Initialize service instances from config
    // In production, this would come from service discovery
    for (const [serviceName, service] of Object.entries(config.services)) {
      const instance: ServiceInstance = {
        id: `${serviceName}-primary`,
        url: service.url,
        status: 'unknown',
        weight: service.weight || 100,
        responseTime: 0,
        connections: 0,
        version: service.version || '1.0.0',
        priority: 100, // High priority for primary instances
        metadata: {
          primary: true
        }
      };

      this.serviceInstances.set(serviceName, [instance]);
    }

    logger.info('Initialized service instances for load balancing');
  }

  async registerRoutes(): Promise<void> {
    const routes: ProxyRoute[] = [
      {
        prefix: '/api',
        target: config.services.api.url,
        changeOrigin: true,
        pathRewrite: { '^/api': '' },
        loadBalancer: {
          algorithm: 'round-robin',
          healthCheck: true,
          failover: true
        },
        routingStrategy: {
          type: 'header',
          rules: [
            {
              match: { headers: { 'x-api-version': 'v2' } },
              target: { service: 'api', version: '2.0.0' },
              priority: 10
            }
          ]
        }
      },
      {
        prefix: '/agents',
        target: config.services.agents.url,
        changeOrigin: true,
        pathRewrite: { '^/agents': '' },
        loadBalancer: {
          algorithm: 'least-connections',
          healthCheck: true,
          failover: true,
          canaryConfig: {
            enabled: true,
            versions: [
              { version: '1.0.0', weight: 90, instances: ['agents-primary'] },
              { version: '1.1.0', weight: 10, instances: ['agents-canary'] }
            ],
            trafficSplit: { stable: 90, canary: 10 },
            rolloutStrategy: 'progressive'
          }
        }
      },
      {
        prefix: '/bridge',
        target: config.services.bridge.url,
        changeOrigin: true,
        pathRewrite: { '^/bridge': '' },
        loadBalancer: {
          algorithm: 'weighted',
          healthCheck: true,
          failover: true
        }
      },
      {
        prefix: '/maestro',
        target: config.services.maestro.url,
        changeOrigin: true,
        pathRewrite: { '^/maestro': '' },
        loadBalancer: {
          algorithm: 'round-robin',
          healthCheck: true,
          failover: true
        }
      },
      {
        prefix: '/monitoring',
        target: config.services.monitoring.url,
        changeOrigin: true,
        pathRewrite: { '^/monitoring': '' },
        loadBalancer: {
          algorithm: 'ip-hash',
          healthCheck: true,
          failover: true
        }
      },
      {
        prefix: '/mcp',
        target: config.services.mcpIntegration.url,
        changeOrigin: true,
        pathRewrite: { '^/mcp': '' },
        loadBalancer: {
          algorithm: 'round-robin',
          healthCheck: true,
          failover: true
        }
      },
      {
        prefix: '/testing',
        target: config.services.testing.url,
        changeOrigin: true,
        pathRewrite: { '^/testing': '' },
        loadBalancer: {
          algorithm: 'random',
          healthCheck: true,
          failover: true
        }
      },
      {
        prefix: '/security',
        target: config.services.security.url,
        changeOrigin: true,
        pathRewrite: { '^/security': '' },
        loadBalancer: {
          algorithm: 'round-robin',
          healthCheck: true,
          failover: true
        },
        routingStrategy: {
          type: 'path',
          rules: [
            {
              match: { path: '/security/scan' },
              target: { service: 'security', version: '1.0.0' },
              priority: 5
            }
          ]
        }
      }
    ];

    for (const route of routes) {
      await this.registerProxy(route);
    }

    // Dashboard is served as static files
    await this.fastify.register(require('@fastify/static'), {
      root: '/app/apps/dashboard/dist',
      prefix: '/dashboard',
      decorateReply: false
    });
  }

  private async registerProxy(route: ProxyRoute): Promise<void> {
    try {
      // Configure canary deployment if specified
      if (route.loadBalancer?.canaryConfig) {
        const serviceName = this.getServiceNameFromPrefix(route.prefix);
        if (serviceName) {
          this.routingManager.setCanaryConfig(serviceName, route.loadBalancer.canaryConfig);
        }
      }

      await this.fastify.register(httpProxy, {
        upstream: async (request) => {
          // Use advanced routing to determine target
          const serviceName = this.getServiceNameFromPrefix(route.prefix);
          if (!serviceName) {
            throw new Error(`Unknown service for prefix: ${route.prefix}`);
          }

          // Check circuit breaker before routing
          if (this.reliability && !(await this.reliability.circuitBreaker.callAllowed(serviceName))) {
            throw new Error(`Circuit breaker is open for service: ${serviceName}`);
          }

          // Get available instance through reliability failover manager
          let selectedInstance: ServiceInstance | null = null;
          let targetUrl: string;

          if (this.reliability) {
            selectedInstance = await this.reliability.getServiceInstance(serviceName);
            if (!selectedInstance) {
              throw new Error(`No healthy instances available for service: ${serviceName}`);
            }
            targetUrl = selectedInstance.url;
          } else {
            // Fallback to original routing logic
            const instances = this.serviceInstances.get(serviceName) || [];
            if (instances.length === 0) {
              throw new Error(`No instances available for service: ${serviceName}`);
            }

            const algorithm = route.loadBalancer?.algorithm || 'round-robin';
            const routingDecision = await this.routingManager.routeRequest(
              request,
              serviceName,
              instances,
              route.routingStrategy,
              algorithm
            );

            selectedInstance = routingDecision.instance;
            targetUrl = routingDecision.targetUrl;
          }

          logger.debug({
            serviceName,
            selectedInstance: selectedInstance.id,
            targetUrl,
            reliabilityEnabled: !!this.reliability
          }, 'Reliability-aware routing decision');

          return targetUrl;
        },
        prefix: route.prefix,
        http2: false,
        replyOptions: {
          rewriteRequestHeaders: (originalReq, headers) => {
            return {
              ...headers,
              'x-forwarded-for': originalReq.ip,
              'x-forwarded-proto': originalReq.protocol,
              'x-forwarded-host': originalReq.hostname,
              'x-gateway-version': '1.0.0',
              'x-routing-decision': 'advanced'
            };
          },
        },
        preHandler: async (request: FastifyRequest, reply: FastifyReply) => {
          // Add request tracking
          const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          request.headers['x-request-id'] = requestId;

          logger.info({
            requestId,
            method: request.method,
            url: request.url,
            service: route.prefix,
            userAgent: request.headers['user-agent'],
            ip: request.ip,
            loadBalancer: route.loadBalancer?.algorithm || 'round-robin'
          }, 'Processing request with advanced routing');

          // Basic health check - detailed routing happens in upstream function
          const serviceName = this.getServiceNameFromPrefix(route.prefix);
          if (serviceName && !await this.hasHealthyInstances(serviceName)) {
            return reply.status(503).send({
              error: 'Service Unavailable',
              message: `No healthy instances available for ${serviceName} service`,
              requestId
            });
          }
        },
      });

      logger.info({
        prefix: route.prefix,
        target: route.target,
        loadBalancer: route.loadBalancer?.algorithm,
        canaryEnabled: route.loadBalancer?.canaryConfig?.enabled
      }, 'Registered advanced proxy route');
    } catch (error) {
      logger.error({ error, route }, 'Failed to register proxy route');
      throw error;
    }
  }

  private getServiceNameFromPrefix(prefix: string): string | null {
    const serviceMap: Record<string, string> = {
      '/api': 'api',
      '/agents': 'agents',
      '/bridge': 'bridge',
      '/maestro': 'maestro',
      '/monitoring': 'monitoring',
      '/mcp': 'mcpIntegration',
      '/testing': 'testing',
      '/security': 'security'
    };
    return serviceMap[prefix] || null;
  }

  async startHealthChecks(): Promise<void> {
    for (const [serviceName, service] of Object.entries(config.services)) {
      const intervalId = setInterval(async () => {
        await this.checkServiceHealth(serviceName, service);
      }, 30000); // Check every 30 seconds

      this.healthChecks.set(serviceName, intervalId);
      
      // Initial health check
      await this.checkServiceHealth(serviceName, service);
    }

    logger.info('Started health checks for all services');
  }

  private async checkServiceHealth(serviceName: string, service: ServiceEndpoint): Promise<void> {
    const startTime = Date.now();

    try {
      const response = await axios.get(`${service.url}${service.healthCheck}`, {
        timeout: service.timeout,
        validateStatus: (status) => status < 500
      });

      const responseTime = Date.now() - startTime;
      const isHealthy = response.status >= 200 && response.status < 400;

      service.status = isHealthy ? 'healthy' : 'unhealthy';
      service.lastCheck = new Date();

      // Update service instances health status
      await this.updateInstancesHealth(serviceName, isHealthy, responseTime);

      // Store health status in Redis
      await this.storeHealthStatus(serviceName, {
        status: service.status,
        responseTime,
        timestamp: service.lastCheck,
        details: response.data
      });

      if (isHealthy) {
        logger.debug({
          service: serviceName,
          responseTime,
          status: response.status
        }, 'Health check passed');
      } else {
        logger.warn({
          service: serviceName,
          responseTime,
          status: response.status,
          data: response.data
        }, 'Health check failed');
      }

    } catch (error) {
      const responseTime = Date.now() - startTime;
      service.status = 'unhealthy';
      service.lastCheck = new Date();

      // Update service instances to unhealthy
      await this.updateInstancesHealth(serviceName, false, responseTime);

      await this.storeHealthStatus(serviceName, {
        status: 'unhealthy',
        responseTime,
        timestamp: service.lastCheck,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      logger.error({
        service: serviceName,
        error: error instanceof Error ? error.message : error,
        responseTime
      }, 'Health check error');
    }
  }

  private async updateInstancesHealth(serviceName: string, isHealthy: boolean, responseTime: number): Promise<void> {
    const instances = this.serviceInstances.get(serviceName);
    if (instances) {
      for (const instance of instances) {
        instance.status = isHealthy ? 'healthy' : 'unhealthy';
        instance.responseTime = responseTime;
      }
    }
  }

  private async storeHealthStatus(serviceName: string, status: any): Promise<void> {
    try {
      const key = `health:${serviceName}`;
      await redisManager.set(key, JSON.stringify(status), 300); // 5 minutes TTL
    } catch (error) {
      logger.error({ error, service: serviceName }, 'Failed to store health status');
    }
  }

  async isServiceHealthy(serviceName: string): Promise<boolean> {
    const service = (config.services as any)[serviceName];
    return service && service.status === 'healthy';
  }

  async hasHealthyInstances(serviceName: string): Promise<boolean> {
    const instances = this.serviceInstances.get(serviceName) || [];
    return instances.some(instance => instance.status === 'healthy');
  }

  async getServiceStatus(serviceName: string): Promise<any> {
    try {
      const key = `health:${serviceName}`;
      const status = await redisManager.get(key);
      return status ? JSON.parse(status) : null;
    } catch (error) {
      logger.error({ error, service: serviceName }, 'Failed to get service status');
      return null;
    }
  }

  async getAllServiceStatuses(): Promise<Record<string, any>> {
    const statuses: Record<string, any> = {};
    
    for (const serviceName of Object.keys(config.services)) {
      statuses[serviceName] = await this.getServiceStatus(serviceName);
    }

    return statuses;
  }

  stopHealthChecks(): void {
    for (const [serviceName, intervalId] of this.healthChecks.entries()) {
      clearInterval(intervalId);
      logger.info({ service: serviceName }, 'Stopped health check');
    }
    this.healthChecks.clear();
  }

  // Advanced routing management methods

  addServiceInstance(serviceName: string, instance: ServiceInstance): void {
    const instances = this.serviceInstances.get(serviceName) || [];
    instances.push(instance);
    this.serviceInstances.set(serviceName, instances);

    logger.info({
      serviceName,
      instanceId: instance.id,
      instanceUrl: instance.url
    }, 'Added service instance');
  }

  removeServiceInstance(serviceName: string, instanceId: string): void {
    const instances = this.serviceInstances.get(serviceName) || [];
    const updatedInstances = instances.filter(instance => instance.id !== instanceId);
    this.serviceInstances.set(serviceName, updatedInstances);

    logger.info({
      serviceName,
      instanceId
    }, 'Removed service instance');
  }

  getServiceInstances(serviceName: string): ServiceInstance[] {
    return this.serviceInstances.get(serviceName) || [];
  }

  async getLoadBalancerStats(): Promise<any> {
    const stats = await this.routingManager.getRoutingStats();
    const instanceStats: Record<string, any> = {};

    for (const [serviceName, instances] of this.serviceInstances.entries()) {
      instanceStats[serviceName] = {
        totalInstances: instances.length,
        healthyInstances: instances.filter(i => i.status === 'healthy').length,
        instances: instances.map(instance => ({
          id: instance.id,
          status: instance.status,
          responseTime: instance.responseTime,
          connections: instance.connections,
          version: instance.version,
          weight: instance.weight
        }))
      };
    }

    return {
      ...stats,
      instanceStats,
      timestamp: new Date().toISOString()
    };
  }

  getRoutingManager(): AdvancedRoutingManager {
    return this.routingManager;
  }

  // Reliability module access methods
  getReliabilityModule(): ReliabilityModule | null {
    return this.reliability;
  }

  async isServiceCircuitBreakerOpen(serviceName: string): Promise<boolean> {
    if (!this.reliability) return false;
    const state = this.reliability.circuitBreaker.getState(serviceName);
    return state?.state === 'OPEN';
  }

  async getServiceReliabilityStats(serviceName: string): Promise<any> {
    if (!this.reliability) return null;

    const cbState = this.reliability.circuitBreaker.getState(serviceName);
    const failoverStats = await this.reliability.failover.getStats();
    const serviceFailoverStats = failoverStats.details[serviceName] || {};

    return {
      circuitBreaker: cbState,
      failover: serviceFailoverStats,
      isHealthy: await this.reliability.isServiceHealthy(serviceName)
    };
  }

  async executeWithReliability<T>(
    fn: () => Promise<T>,
    serviceName: string,
    url: string,
    method: string = 'GET'
  ): Promise<T> {
    if (!this.reliability) {
      return await fn();
    }

    return await this.reliability.executeWithReliability(fn, {
      serviceName,
      url,
      method
    });
  }

  stopHealthChecks(): void {
    for (const timer of this.healthChecks.values()) {
      clearInterval(timer);
    }
    this.healthChecks.clear();

    // Also destroy reliability module
    if (this.reliability) {
      this.reliability.destroy();
      this.reliability = null;
    }

    logger.info('ProxyManager health checks and reliability module stopped');
  }
}

export default ProxyManager;