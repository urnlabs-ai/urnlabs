import Redis from 'ioredis';
import { FastifyInstance } from 'fastify';
import logger from '../lib/logger.js';
import { CircuitBreakerManager, CircuitBreakerConfig } from './CircuitBreakerManager.js';
import { FailoverManager, FailoverConfig, ServiceInstance } from './FailoverManager.js';
import { RetryPolicyManager, RetryPolicy } from './RetryPolicyManager.js';
import { ReliabilityDashboard } from './ReliabilityDashboard.js';

export interface ReliabilityConfig {
  circuitBreaker: {
    enabled: boolean;
    defaultConfig: Partial<CircuitBreakerConfig>;
  };
  failover: {
    enabled: boolean;
    defaultConfig: Partial<FailoverConfig>;
  };
  retry: {
    enabled: boolean;
    defaultPolicy: Partial<RetryPolicy>;
  };
  dashboard: {
    enabled: boolean;
    updateInterval: number;
  };
}

export interface ReliabilityModule {
  circuitBreaker: CircuitBreakerManager;
  failover: FailoverManager;
  retryPolicy: RetryPolicyManager;
  dashboard: ReliabilityDashboard;

  // Convenience methods
  executeWithReliability<T>(
    fn: () => Promise<T>,
    context: {
      serviceName: string;
      url: string;
      method: string;
      retryPolicyId?: string;
    }
  ): Promise<T>;

  registerService(
    serviceName: string,
    instances: ServiceInstance[],
    config?: {
      circuitBreaker?: Partial<CircuitBreakerConfig>;
      failover?: Partial<FailoverConfig>;
    }
  ): Promise<void>;

  isServiceHealthy(serviceName: string): Promise<boolean>;
  getServiceInstance(serviceName: string): Promise<ServiceInstance | null>;
  recordServiceCall(
    serviceName: string,
    success: boolean,
    responseTime: number,
    error?: string,
    statusCode?: number
  ): Promise<void>;

  destroy(): void;
}

export const DEFAULT_RELIABILITY_CONFIG: ReliabilityConfig = {
  circuitBreaker: {
    enabled: true,
    defaultConfig: {
      failureThreshold: 5,
      recoveryTimeout: 60000,
      requestVolumeThreshold: 10,
      timeWindow: 60000,
      errorThresholdPercentage: 50,
      slowCallThreshold: 1000,
      slowCallRateThreshold: 50,
      halfOpenMaxCalls: 3
    }
  },
  failover: {
    enabled: true,
    defaultConfig: {
      maxFailovers: 3,
      failoverWindow: 300000,
      healthCheckInterval: 30000,
      healthCheckTimeout: 5000,
      autoFailback: true,
      failbackDelay: 60000,
      gracefulDraining: true,
      drainingTimeout: 30000
    }
  },
  retry: {
    enabled: true,
    defaultPolicy: {
      maxAttempts: 3,
      baseDelay: 1000,
      maxDelay: 30000,
      backoffMultiplier: 2,
      jitter: true,
      jitterType: 'uniform',
      retryableStatusCodes: [408, 429, 500, 502, 503, 504],
      retryableErrors: ['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND'],
      circuitBreakerIntegration: true,
      timeoutPerAttempt: 10000
    }
  },
  dashboard: {
    enabled: true,
    updateInterval: 30000
  }
};

export async function createReliabilityModule(
  fastify: FastifyInstance,
  redis: Redis,
  config: Partial<ReliabilityConfig> = {}
): Promise<ReliabilityModule> {
  const finalConfig = { ...DEFAULT_RELIABILITY_CONFIG, ...config };

  // Initialize managers
  const circuitBreaker = new CircuitBreakerManager(redis);
  const failover = new FailoverManager(redis, circuitBreaker);
  const retryPolicy = new RetryPolicyManager(redis);
  const dashboard = new ReliabilityDashboard(redis, circuitBreaker, failover, retryPolicy);

  // Create default retry policy
  if (finalConfig.retry.enabled) {
    await retryPolicy.createPolicy({
      id: 'default',
      name: 'Default Gateway Retry Policy',
      ...finalConfig.retry.defaultPolicy
    });
  }

  // Register API routes
  await registerReliabilityRoutes(fastify, circuitBreaker, failover, retryPolicy, dashboard);

  logger.info('Reliability module initialized', {
    circuitBreaker: finalConfig.circuitBreaker.enabled,
    failover: finalConfig.failover.enabled,
    retry: finalConfig.retry.enabled,
    dashboard: finalConfig.dashboard.enabled
  });

  // Create the module
  const module: ReliabilityModule = {
    circuitBreaker,
    failover,
    retryPolicy,
    dashboard,

    async executeWithReliability<T>(
      fn: () => Promise<T>,
      context: {
        serviceName: string;
        url: string;
        method: string;
        retryPolicyId?: string;
      }
    ): Promise<T> {
      // Check circuit breaker
      if (!(await circuitBreaker.callAllowed(context.serviceName))) {
        throw new Error(`Circuit breaker is open for service: ${context.serviceName}`);
      }

      // Execute with retry policy
      const startTime = Date.now();
      try {
        const result = await retryPolicy.executeWithRetry(fn, context);

        // Record successful call
        await circuitBreaker.recordCall({
          serviceName: context.serviceName,
          method: context.method,
          url: context.url,
          startTime,
          endTime: Date.now(),
          success: true
        });

        return result;
      } catch (error: any) {
        // Record failed call
        await circuitBreaker.recordCall({
          serviceName: context.serviceName,
          method: context.method,
          url: context.url,
          startTime,
          endTime: Date.now(),
          success: false,
          error: error.message,
          statusCode: error.statusCode
        });

        throw error;
      }
    },

    async registerService(
      serviceName: string,
      instances: ServiceInstance[],
      config?: {
        circuitBreaker?: Partial<CircuitBreakerConfig>;
        failover?: Partial<FailoverConfig>;
      }
    ): Promise<void> {
      // Register with circuit breaker
      if (finalConfig.circuitBreaker.enabled) {
        await circuitBreaker.registerService(serviceName, {
          ...finalConfig.circuitBreaker.defaultConfig,
          ...config?.circuitBreaker
        });
      }

      // Register with failover manager
      if (finalConfig.failover.enabled) {
        await failover.registerService(serviceName, instances, {
          ...finalConfig.failover.defaultConfig,
          ...config?.failover
        });
      }
    },

    async isServiceHealthy(serviceName: string): Promise<boolean> {
      const cbState = circuitBreaker.getState(serviceName);
      const instance = await failover.getAvailableInstance(serviceName);

      return cbState?.state !== 'OPEN' && instance !== null;
    },

    async getServiceInstance(serviceName: string): Promise<ServiceInstance | null> {
      return await failover.getAvailableInstance(serviceName);
    },

    async recordServiceCall(
      serviceName: string,
      success: boolean,
      responseTime: number,
      error?: string,
      statusCode?: number
    ): Promise<void> {
      const now = Date.now();
      await circuitBreaker.recordCall({
        serviceName,
        method: 'UNKNOWN',
        url: 'UNKNOWN',
        startTime: now - responseTime,
        endTime: now,
        success,
        responseTime,
        error,
        statusCode
      });
    },

    destroy(): void {
      circuitBreaker.destroy();
      failover.destroy();
      retryPolicy.destroy();
      dashboard.destroy();
    }
  };

  return module;
}

async function registerReliabilityRoutes(
  fastify: FastifyInstance,
  circuitBreaker: CircuitBreakerManager,
  failover: FailoverManager,
  retryPolicy: RetryPolicyManager,
  dashboard: ReliabilityDashboard
): Promise<void> {
  // Dashboard endpoint
  fastify.get('/admin/reliability/dashboard', async (_request, reply) => {
    const data = dashboard.getDashboardData();
    return reply.send(data);
  });

  // Circuit breaker endpoints
  fastify.get('/admin/reliability/circuit-breakers', async (_request, reply) => {
    const stats = await circuitBreaker.getStats();
    return reply.send(stats);
  });

  fastify.get('/admin/reliability/circuit-breakers/:serviceName', async (request, reply) => {
    const { serviceName } = request.params as { serviceName: string };
    const state = circuitBreaker.getState(serviceName);
    const config = circuitBreaker.getConfig(serviceName);

    if (!state) {
      return reply.status(404).send({ error: 'Circuit breaker not found' });
    }

    return reply.send({ serviceName, state, config });
  });

  fastify.post('/admin/reliability/circuit-breakers/:serviceName/reset', async (request, reply) => {
    const { serviceName } = request.params as { serviceName: string };
    await circuitBreaker.reset(serviceName);
    return reply.send({ message: 'Circuit breaker reset', serviceName });
  });

  // Failover endpoints
  fastify.get('/admin/reliability/failover', async (_request, reply) => {
    const stats = await failover.getStats();
    return reply.send(stats);
  });

  fastify.post('/admin/reliability/failover/:serviceName/:instanceId', async (request, reply) => {
    const { serviceName, instanceId } = request.params as { serviceName: string; instanceId: string };
    const { reason = 'Manual failover' } = request.body as { reason?: string };

    const result = await failover.failover(serviceName, instanceId, reason, false);

    if (result) {
      return reply.send({ message: 'Failover executed', serviceName, newInstance: result });
    } else {
      return reply.status(400).send({ error: 'Failover failed' });
    }
  });

  // Retry policy endpoints
  fastify.get('/admin/reliability/retry-policies', async (_request, reply) => {
    const policies = retryPolicy.getAllPolicies();
    return reply.send(policies);
  });

  fastify.get('/admin/reliability/retry-policies/:policyId', async (request, reply) => {
    const { policyId } = request.params as { policyId: string };
    const policy = retryPolicy.getPolicy(policyId);

    if (!policy) {
      return reply.status(404).send({ error: 'Retry policy not found' });
    }

    return reply.send(policy);
  });

  fastify.post('/admin/reliability/retry-policies', {
    schema: {
      body: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string' },
          maxAttempts: { type: 'number', minimum: 1, maximum: 10 },
          baseDelay: { type: 'number', minimum: 100 },
          maxDelay: { type: 'number', minimum: 1000 },
          backoffMultiplier: { type: 'number', minimum: 1 },
          jitter: { type: 'boolean' },
          retryableStatusCodes: { type: 'array', items: { type: 'number' } }
        }
      }
    }
  }, async (request, reply) => {
    const policyData = request.body as Partial<RetryPolicy>;
    const policy = await retryPolicy.createPolicy(policyData);
    return reply.status(201).send(policy);
  });

  // Alerts endpoints
  fastify.get('/admin/reliability/alerts', async (_request, reply) => {
    const alerts = dashboard.getActiveAlerts();
    return reply.send(alerts);
  });

  fastify.post('/admin/reliability/alerts/:alertId/acknowledge', async (request, reply) => {
    const { alertId } = request.params as { alertId: string };
    const success = await dashboard.acknowledgeAlert(alertId);

    if (success) {
      return reply.send({ message: 'Alert acknowledged', alertId });
    } else {
      return reply.status(404).send({ error: 'Alert not found' });
    }
  });

  // Reports endpoint
  fastify.get('/admin/reliability/reports', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          start: { type: 'string' },
          end: { type: 'string' },
          hours: { type: 'number', minimum: 1, maximum: 168 } // Max 1 week
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

    try {
      const report = await dashboard.generateReport(startTime, endTime);
      return reply.send(report);
    } catch (error: any) {
      return reply.status(400).send({ error: error.message });
    }
  });

  logger.info('Reliability API routes registered');
}

// Export all types and classes
export {
  CircuitBreakerManager,
  FailoverManager,
  RetryPolicyManager,
  ReliabilityDashboard,
  type CircuitBreakerConfig,
  type CircuitBreakerState,
  type FailoverConfig,
  type ServiceInstance,
  type RetryPolicy,
  type DashboardMetrics,
  type HealthAlert,
  type ReliabilityReport
};