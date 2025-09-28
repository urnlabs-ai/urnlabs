// Resilience components for high availability and fault tolerance
export { default as CircuitBreaker } from './CircuitBreaker.js';
export type {
  CircuitBreakerConfig,
  CircuitBreakerState,
  CircuitBreakerMetrics,
  CircuitBreakerCall,
  CircuitBreakerEvents
} from './CircuitBreaker.js';

export { default as HealthMonitor } from './HealthMonitor.js';
export type {
  HealthCheckConfig,
  HealthStatus,
  ServiceHealth,
  DependencyHealth,
  HealthAlert,
  HealthMonitorEvents
} from './HealthMonitor.js';

export { default as FailoverManager } from './FailoverManager.js';
export type {
  ServiceInstance,
  FailoverConfig,
  FailoverState,
  FailoverEvent,
  LoadBalancerMetrics,
  InstanceMetrics,
  FailoverManagerEvents
} from './FailoverManager.js';

export { default as ResilienceOrchestrator } from './ResilienceOrchestrator.js';
export type {
  ResilienceConfig,
  ServiceResilienceProfile,
  ResilienceMetrics,
  ServiceMetrics,
  OverallMetrics,
  ResilienceEvent,
  ResilienceReport,
  ServiceReport,
  TimeSeriesData,
  IncidentSummary,
  ResilienceOrchestratorEvents
} from './ResilienceOrchestrator.js';

import Redis from 'ioredis';
import { FastifyInstance } from 'fastify';
import ResilienceOrchestrator, { ResilienceConfig, ServiceResilienceProfile } from './ResilienceOrchestrator.js';
import logger from '../lib/logger.js';

/**
 * Default resilience configuration for the gateway
 */
export const DEFAULT_RESILIENCE_CONFIG: ResilienceConfig = {
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
  }
};

/**
 * Create and configure a resilience orchestrator instance
 */
export async function createResilienceOrchestrator(
  fastify: FastifyInstance,
  redis: Redis,
  config: Partial<ResilienceConfig> = {}
): Promise<ResilienceOrchestrator> {
  const finalConfig = { ...DEFAULT_RESILIENCE_CONFIG, ...config };

  const orchestrator = new ResilienceOrchestrator(fastify, redis, finalConfig);

  // Set up logging for resilience events
  orchestrator.on('serviceRegistered', (service, profile) => {
    logger.info('Service registered with resilience orchestrator', {
      service,
      instances: profile.instances.length
    });
  });

  orchestrator.on('serviceDeregistered', (service) => {
    logger.info('Service deregistered from resilience orchestrator', { service });
  });

  orchestrator.on('systemHealthChanged', (metrics) => {
    logger.info('System health metrics updated', {
      healthScore: metrics.systemHealthScore,
      totalServices: metrics.totalServices,
      healthyServices: metrics.healthyServices,
      activeAlerts: metrics.activeAlerts
    });
  });

  orchestrator.on('criticalAlert', (alert) => {
    logger.error('Critical alert triggered', {
      service: alert.service,
      type: alert.type,
      message: alert.message,
      severity: alert.severity
    });
  });

  orchestrator.on('incidentDetected', (incident) => {
    logger.warn('Incident detected', {
      service: incident.service,
      type: incident.type,
      impact: incident.impact,
      rootCause: incident.rootCause
    });
  });

  orchestrator.on('recoveryCompleted', (service, duration) => {
    logger.info('Service recovery completed', {
      service,
      recoveryTime: duration,
      recoveryTimeMinutes: Math.round(duration / 60000)
    });
  });

  return orchestrator;
}

/**
 * Helper function to create a basic service resilience profile
 */
export function createServiceProfile(
  service: string,
  instances: Array<{
    id: string;
    host: string;
    port: number;
    protocol?: 'http' | 'https';
    weight?: number;
    priority?: number;
  }>,
  options: {
    healthCheckPath?: string;
    healthCheckInterval?: number;
    circuitBreakerThreshold?: number;
    failoverStrategy?: 'ROUND_ROBIN' | 'LEAST_CONNECTIONS' | 'WEIGHTED_ROUND_ROBIN' | 'PRIORITY' | 'HEALTH_BASED';
    dependencies?: string[];
    tags?: string[];
  } = {}
): ServiceResilienceProfile {
  const {
    healthCheckPath = '/health',
    healthCheckInterval = 30000,
    circuitBreakerThreshold = 5,
    failoverStrategy = 'HEALTH_BASED',
    dependencies = [],
    tags = []
  } = options;

  const serviceInstances = instances.map(instance => ({
    id: instance.id,
    name: `${service}-${instance.id}`,
    host: instance.host,
    port: instance.port,
    protocol: instance.protocol || 'http' as const,
    weight: instance.weight || 1,
    priority: instance.priority || 1,
    healthy: true,
    metadata: {},
    tags: [...tags, service]
  }));

  const healthCheckConfigs = serviceInstances.map(instance => ({
    id: `health_${service}_${instance.id}`,
    service: instance.name,
    endpoint: `${instance.protocol}://${instance.host}:${instance.port}${healthCheckPath}`,
    method: 'GET' as const,
    interval: healthCheckInterval,
    timeout: 5000,
    retries: 3,
    successThreshold: 2,
    failureThreshold: 3,
    expectedStatus: [200, 201, 202, 204],
    enabled: true
  }));

  return {
    service,
    instances: serviceInstances,
    circuitBreakerConfig: {
      failureThreshold: circuitBreakerThreshold,
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
    },
    healthCheckConfigs,
    failoverConfig: {
      strategy: failoverStrategy,
      maxFailovers: 5,
      failoverWindow: 300000,
      healthCheckInterval,
      autoFailback: true,
      failbackDelay: 60000,
      gracefulDraining: true,
      drainingTimeout: 30000,
      crossRegionFailover: false,
      minHealthyInstances: 1,
      stickySession: false
    },
    dependencies,
    tags,
    metadata: {
      createdAt: new Date().toISOString(),
      version: '1.0.0'
    }
  };
}

/**
 * Helper function to register common gateway services
 */
export async function registerGatewayServices(
  orchestrator: ResilienceOrchestrator,
  serviceConfigs: Array<{
    name: string;
    instances: Array<{
      host: string;
      port: number;
      protocol?: 'http' | 'https';
    }>;
    healthCheckPath?: string;
    dependencies?: string[];
  }>
): Promise<void> {
  for (const config of serviceConfigs) {
    const instances = config.instances.map((instance, index) => ({
      id: `${config.name}-${index + 1}`,
      host: instance.host,
      port: instance.port,
      protocol: instance.protocol || 'http'
    }));

    const profile = createServiceProfile(config.name, instances, {
      healthCheckPath: config.healthCheckPath,
      dependencies: config.dependencies
    });

    await orchestrator.registerService(profile);
  }

  logger.info('Gateway services registered with resilience orchestrator', {
    serviceCount: serviceConfigs.length
  });
}

/**
 * Middleware for executing requests with resilience
 */
export function createResilienceMiddleware(orchestrator: ResilienceOrchestrator) {
  return async function resilienceMiddleware(
    serviceName: string,
    operation: () => Promise<any>,
    options: {
      timeout?: number;
      retries?: number;
      operationName?: string;
    } = {}
  ) {
    const { timeout = 10000, retries = 3, operationName = 'request' } = options;

    return await orchestrator.executeWithResilience(operation, {
      service: serviceName,
      operation: operationName,
      timeout,
      retries
    });
  };
}

/**
 * Health check endpoint generator
 */
export function createHealthCheckEndpoint(orchestrator: ResilienceOrchestrator) {
  return async function healthCheck() {
    const metrics = orchestrator.getMetrics();

    if (!metrics) {
      return {
        status: 'unknown',
        timestamp: Date.now(),
        services: {}
      };
    }

    const overallHealth = metrics.overall;
    const status = overallHealth.systemHealthScore >= 80 ? 'healthy' :
                   overallHealth.systemHealthScore >= 50 ? 'degraded' : 'unhealthy';

    return {
      status,
      timestamp: metrics.timestamp,
      healthScore: overallHealth.systemHealthScore,
      services: Object.fromEntries(
        Array.from(metrics.services.entries()).map(([name, serviceMetrics]) => [
          name,
          {
            healthy: serviceMetrics.health?.score ? serviceMetrics.health.score >= 80 : false,
            score: serviceMetrics.health?.score || 0,
            circuitBreakerState: serviceMetrics.circuitBreaker?.state,
            activeInstance: serviceMetrics.failover?.activeInstance,
            availableInstances: serviceMetrics.failover?.availableInstances || 0
          }
        ])
      ),
      alerts: metrics.alerts.length,
      criticalAlerts: metrics.alerts.filter(a => a.severity === 'CRITICAL').length
    };
  };
}

/**
 * Types for convenience
 */
export type ResilienceMiddleware = ReturnType<typeof createResilienceMiddleware>;
export type HealthCheckEndpoint = ReturnType<typeof createHealthCheckEndpoint>;

export default {
  createResilienceOrchestrator,
  createServiceProfile,
  registerGatewayServices,
  createResilienceMiddleware,
  createHealthCheckEndpoint,
  DEFAULT_RESILIENCE_CONFIG
};