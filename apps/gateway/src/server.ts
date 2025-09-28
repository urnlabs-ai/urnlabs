import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import websocket from '@fastify/websocket';
import jwt from '@fastify/jwt';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';

import config from './lib/config.js';
import logger from './lib/logger.js';
import redisManager from './lib/redis.js';
import ProxyManager from './middleware/proxy.js';
import { authenticate, authorize, generateToken, revokeToken } from './middleware/auth.js';
import RateLimitingMiddleware from './middleware/rate-limiting.js';
import CacheMiddleware from './middleware/cache-middleware.js';
import { createWAFMiddleware, DEFAULT_WAF_CONFIG } from '../../../packages/security/src/middleware/waf-integration.js';
import { IncidentResponseMiddleware } from '../../../packages/security/src/middleware/incident-response-middleware.js';
import { ComplianceOrchestrator } from '../../../packages/security/src/services/compliance-orchestrator.js';
import { createSecurityModule, DEFAULT_SECURITY_MODULE_CONFIG } from './security/index.js';
import { createResilienceOrchestrator, registerGatewayServices, createHealthCheckEndpoint, DEFAULT_RESILIENCE_CONFIG } from './resilience/index.js';
import { MetricsData, WebSocketMessage } from './types/index.js';

const fastify: FastifyInstance = Fastify({
  logger: logger as any,
  trustProxy: true,
  requestTimeout: 60000,
  keepAliveTimeout: 5000
});

// Global error handler
fastify.setErrorHandler(async (error, request, reply) => {
  logger.error({
    error: {
      message: error.message,
      stack: error.stack,
      statusCode: error.statusCode
    },
    request: {
      method: request.method,
      url: request.url,
      headers: request.headers,
      ip: request.ip
    }
  }, 'Unhandled error');

  const statusCode = error.statusCode || 500;
  const message = statusCode >= 500 
    ? 'Internal Server Error' 
    : error.message || 'Unknown error';

  return reply.status(statusCode).send({
    error: {
      message,
      statusCode,
      timestamp: new Date().toISOString(),
      requestId: request.headers['x-request-id'] || 'unknown'
    }
  });
});

// Register plugins
async function registerPlugins() {
  // Initialize Advanced Security Module - Comprehensive protection
  const securityConfig = {
    ...DEFAULT_SECURITY_MODULE_CONFIG,
    environment: config.environment || 'production',

    // Configure security headers based on environment
    headers: {
      ...DEFAULT_SECURITY_MODULE_CONFIG.headers,
      cors: {
        ...DEFAULT_SECURITY_MODULE_CONFIG.headers.cors,
        origins: config.cors?.origin ? [config.cors.origin] : []
      }
    },

    // Configure threat intelligence with API keys
    threatIntel: {
      ...DEFAULT_SECURITY_MODULE_CONFIG.threatIntel,
      sources: {
        ...DEFAULT_SECURITY_MODULE_CONFIG.threatIntel.sources,
        abuseIPDB: {
          ...DEFAULT_SECURITY_MODULE_CONFIG.threatIntel.sources.abuseIPDB,
          apiKey: process.env.ABUSE_IPDB_API_KEY
        },
        virustotal: {
          ...DEFAULT_SECURITY_MODULE_CONFIG.threatIntel.sources.virustotal,
          apiKey: process.env.VIRUSTOTAL_API_KEY
        }
      }
    },

    // Configure monitoring and alerting
    monitoring: {
      ...DEFAULT_SECURITY_MODULE_CONFIG.monitoring,
      slackWebhook: config.slack?.webhookUrl,
      emailAlerts: ['security@urnlabs.ai']
    }
  };

  // Initialize the comprehensive security module
  const securityModule = await createSecurityModule(fastify, redisManager.getClient(), securityConfig);
  fastify.decorate('securityModule', securityModule);

  logger.info('Advanced Security Module initialized');

  // Initialize resilience orchestrator for high availability
  const resilienceConfig = {
    ...DEFAULT_RESILIENCE_CONFIG,
    alerting: {
      ...DEFAULT_RESILIENCE_CONFIG.alerting,
      webhooks: config.slack?.webhookUrl ? [config.slack.webhookUrl] : [],
      slackIntegration: !!config.slack?.webhookUrl
    }
  };

  const resilienceOrchestrator = await createResilienceOrchestrator(
    fastify,
    redisManager.getClient(),
    resilienceConfig
  );
  fastify.decorate('resilienceOrchestrator', resilienceOrchestrator);

  logger.info('Resilience orchestrator initialized');

  // CORS (handled by security module but need plugin for compatibility)
  await fastify.register(cors, {
    origin: false, // Handled by security headers
    credentials: false // Handled by security headers
  });

  // Legacy WAF integration for compatibility with existing packages
  const wafMiddleware = createWAFMiddleware(redisManager.getClient(), DEFAULT_WAF_CONFIG);

  // Incident Response Middleware - Automated threat response
  const incidentResponseConfig = {
    rateLimitThreshold: 10,
    suppressionTimeout: 300000, // 5 minutes
    automation: {
      notifications: {
        slack: {
          webhookUrl: config.slack?.webhookUrl,
          channels: ['#security-alerts']
        },
        email: {
          recipients: ['security@urnlabs.ai']
        }
      }
    }
  };
  const incidentResponseMiddleware = new IncidentResponseMiddleware(
    redisManager.getClient(),
    incidentResponseConfig
  );
  fastify.addHook('preHandler', incidentResponseMiddleware.middleware());

  // Compliance Orchestrator - Automated compliance monitoring
  const complianceOrchestrator = new ComplianceOrchestrator({
    redisClient: redisManager.getClient(),
    frameworks: ['SOC2', 'ISO27001', 'PCI_DSS', 'GDPR'],
    assessmentFrequency: 24 * 60 * 60 * 1000, // 24 hours
    notifications: {
      slack: {
        webhookUrl: config.slack?.webhookUrl,
        channels: ['#compliance-alerts']
      },
      email: {
        recipients: ['compliance@urnlabs.ai']
      }
    }
  });

  // Start automated compliance monitoring
  complianceOrchestrator.startAutomatedAssessments();
  fastify.decorate('complianceOrchestrator', complianceOrchestrator);

  // Basic rate limiting (keep for compatibility)
  await fastify.register(rateLimit, {
    max: config.rateLimiting.global.max,
    timeWindow: config.rateLimiting.global.timeWindow,
    redis: redisManager.getClient(),
    allowList: ['127.0.0.1', '::1'],
    skipOnError: true,
  });

  // JWT
  await fastify.register(jwt, {
    secret: config.jwt.secret
  });

  // WebSocket support
  await fastify.register(websocket);

  // Swagger documentation
  await fastify.register(swagger, {
    swagger: {
      info: {
        title: 'Urnlabs AI Platform Gateway API',
        description: 'Main gateway for the Urnlabs AI agent platform',
        version: '1.0.0'
      },
      host: `localhost:${config.port}`,
      schemes: ['http', 'https'],
      consumes: ['application/json'],
      produces: ['application/json'],
      securityDefinitions: {
        bearerAuth: {
          type: 'apiKey',
          name: 'Authorization',
          in: 'header',
          description: 'Enter: Bearer {token}'
        }
      }
    }
  });

  await fastify.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'none',
      deepLinking: false
    }
  });
}

// Register routes
async function registerRoutes() {
  // Initialize advanced rate limiting middleware
  const rateLimitingMiddleware = new RateLimitingMiddleware();
  fastify.decorate('rateLimitingMiddleware', rateLimitingMiddleware);

  // Initialize cache middleware
  const cacheMiddleware = new CacheMiddleware(config.cache);
  fastify.decorate('cacheMiddleware', cacheMiddleware);

  // Register cache middleware globally for GET requests
  fastify.addHook('preHandler', cacheMiddleware.middleware());

  // Health check endpoint with resilience integration
  fastify.get('/health', {
    schema: {
      response: {
        200: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            timestamp: { type: 'string' },
            version: { type: 'string' },
            services: { type: 'object' },
            uptime: { type: 'number' },
            resilience: { type: 'object' }
          }
        }
      }
    }
  }, async (_request, reply) => {
    const proxyManager = (fastify as any).proxyManager as ProxyManager;
    const resilienceOrchestrator = (fastify as any).resilienceOrchestrator;

    const serviceStatuses = await proxyManager.getAllServiceStatuses();

    const healthyServices = Object.values(serviceStatuses).filter((s: any) => s?.status === 'healthy').length;
    const totalServices = Object.keys(config.services).length;

    let overallStatus = healthyServices === totalServices ? 'healthy' :
                       healthyServices > 0 ? 'degraded' : 'unhealthy';

    // Get cache health
    const cacheMiddleware = (fastify as any).cacheMiddleware as CacheMiddleware;
    let cacheHealth = null;
    try {
      cacheHealth = await cacheMiddleware.getHealth();
    } catch (error) {
      cacheHealth = { overall: 'critical', error: 'Cache unavailable' };
    }

    // Get resilience health if available
    let resilienceHealth = null;
    try {
      if (resilienceOrchestrator) {
        const healthCheckFn = createHealthCheckEndpoint(resilienceOrchestrator);
        resilienceHealth = await healthCheckFn();

        // Use resilience health score to influence overall status
        if (resilienceHealth.status === 'unhealthy') {
          overallStatus = 'unhealthy';
        } else if (resilienceHealth.status === 'degraded' && overallStatus === 'healthy') {
          overallStatus = 'degraded';
        }
      }
    } catch (error) {
      logger.error('Failed to get resilience health', { error });
      resilienceHealth = { status: 'unknown', error: 'Resilience health check failed' };
    }

    return reply.send({
      status: overallStatus,
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      services: serviceStatuses,
      uptime: process.uptime(),
      redis: redisManager.isHealthy(),
      cache: cacheHealth,
      resilience: resilienceHealth
    });
  });

  // Detailed system status
  fastify.get('/status', {
    preHandler: [authenticate, authorize(['system:read'])]
  }, async (_request, reply) => {
    const proxyManager = (fastify as any).proxyManager as ProxyManager;
    const serviceStatuses = await proxyManager.getAllServiceStatuses();
    
    return reply.send({
      gateway: {
        status: 'healthy',
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        pid: process.pid,
        version: '1.0.0'
      },
      services: serviceStatuses,
      redis: {
        connected: redisManager.isHealthy(),
        info: redisManager.isHealthy() ? await redisManager.getClient().info() : null
      },
      timestamp: new Date().toISOString()
    });
  });

  // Authentication endpoints - stricter rate limiting for auth endpoints
  fastify.post('/auth/login', {
    preHandler: [rateLimitingMiddleware.createEndpointMiddleware(10, 60, 'sliding-window')],
    schema: {
      body: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email' },
          password: { type: 'string', minLength: 8 }
        }
      }
    }
  }, async (request, reply) => {
    // This would typically validate against the API service
    // For now, returning a mock implementation
    const { email } = request.body as any;
    
    try {
      // TODO: Validate credentials with API service
      const mockUser = {
        userId: 'user_123',
        organizationId: 'org_123',
        role: 'USER',
        permissions: ['read', 'write']
      };
      
      const token = await generateToken(mockUser);
      
      return reply.send({
        token,
        user: mockUser,
        expiresIn: config.jwt.expiresIn
      });
    } catch (error: any) {
      logger.error({ error, email }, 'Login failed');
      return reply.status(401).send({
        error: 'Authentication Failed',
        message: 'Invalid credentials'
      });
    }
  });

  fastify.post('/auth/logout', {
    preHandler: [authenticate, rateLimitingMiddleware.createMiddleware(['per-user'])]
  }, async (request: any, reply) => {
    const authHeader = request.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      await revokeToken(token);
    }
    
    return reply.send({ message: 'Logged out successfully' });
  });

  // WebSocket endpoint for real-time communications
  fastify.register(async function (fastify) {
    fastify.get('/ws', { websocket: true }, (connection, _request) => {
      logger.info('WebSocket connection established');
      
      connection.on('message', async (message) => {
        try {
          const data: WebSocketMessage = JSON.parse(message.toString());
          
          switch (data.type) {
            case 'ping':
              connection.socket.send(JSON.stringify({
                type: 'pong',
                payload: { timestamp: new Date().toISOString() },
                timestamp: new Date()
              }));
              break;
              
            case 'notification':
              // Handle notifications
              logger.info({ data }, 'Received WebSocket notification');
              break;
              
            default:
              logger.warn({ type: data.type }, 'Unknown WebSocket message type');
          }
        } catch (error: any) {
          logger.error({ error, message: message.toString() }, 'Invalid WebSocket message');
        }
      });

      connection.on('close', () => {
        logger.info('WebSocket connection closed');
      });

      connection.on('error', (error) => {
        logger.error({ error }, 'WebSocket error');
      });
    });
  });

  // Metrics endpoint
  fastify.get('/metrics', {
    preHandler: [authenticate, authorize(['system:read'])]
  }, async (_request, reply) => {
    const metrics: MetricsData = {
      requests: {
        total: 0, // TODO: Implement request counting
        success: 0,
        errors: 0,
        avgResponseTime: 0
      },
      services: {},
      resources: {
        memory: {
          used: process.memoryUsage().heapUsed,
          total: process.memoryUsage().heapTotal,
          percentage: (process.memoryUsage().heapUsed / process.memoryUsage().heapTotal) * 100
        },
        cpu: {
          usage: process.cpuUsage().user + process.cpuUsage().system
        }
      }
    };

    return reply.send(metrics);
  });

  // Advanced routing management endpoints
  fastify.get('/admin/routing/stats', {
    preHandler: [authenticate, authorize(['system:read'])]
  }, async (_request, reply) => {
    const proxyManager = (fastify as any).proxyManager as ProxyManager;
    const stats = await proxyManager.getLoadBalancerStats();
    return reply.send(stats);
  });

  fastify.get('/admin/routing/instances/:serviceName', {
    preHandler: [authenticate, authorize(['system:read'])]
  }, async (request, reply) => {
    const { serviceName } = request.params as { serviceName: string };
    const proxyManager = (fastify as any).proxyManager as ProxyManager;
    const instances = proxyManager.getServiceInstances(serviceName);

    return reply.send({
      serviceName,
      instances,
      timestamp: new Date().toISOString()
    });
  });

  fastify.post('/admin/routing/instances/:serviceName', {
    preHandler: [authenticate, authorize(['system:write'])],
    schema: {
      body: {
        type: 'object',
        required: ['id', 'url', 'weight', 'version'],
        properties: {
          id: { type: 'string' },
          url: { type: 'string', format: 'uri' },
          weight: { type: 'number', minimum: 1, maximum: 1000 },
          version: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    const { serviceName } = request.params as { serviceName: string };
    const { id, url, weight, version } = request.body as any;

    const proxyManager = (fastify as any).proxyManager as ProxyManager;
    const instance = {
      id,
      url,
      status: 'unknown' as const,
      weight,
      responseTime: 0,
      connections: 0,
      version,
      metadata: {}
    };

    proxyManager.addServiceInstance(serviceName, instance);

    return reply.status(201).send({
      message: 'Service instance added successfully',
      serviceName,
      instance
    });
  });

  fastify.delete('/admin/routing/instances/:serviceName/:instanceId', {
    preHandler: [authenticate, authorize(['system:write'])]
  }, async (request, reply) => {
    const { serviceName, instanceId } = request.params as { serviceName: string; instanceId: string };
    const proxyManager = (fastify as any).proxyManager as ProxyManager;

    proxyManager.removeServiceInstance(serviceName, instanceId);

    return reply.send({
      message: 'Service instance removed successfully',
      serviceName,
      instanceId
    });
  });

  fastify.post('/admin/routing/canary/:serviceName', {
    preHandler: [authenticate, authorize(['system:write'])],
    schema: {
      body: {
        type: 'object',
        required: ['enabled', 'versions', 'trafficSplit', 'rolloutStrategy'],
        properties: {
          enabled: { type: 'boolean' },
          versions: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                version: { type: 'string' },
                weight: { type: 'number' },
                instances: { type: 'array', items: { type: 'string' } }
              }
            }
          },
          trafficSplit: { type: 'object' },
          rolloutStrategy: { type: 'string', enum: ['progressive', 'instant', 'blue-green'] }
        }
      }
    }
  }, async (request, reply) => {
    const { serviceName } = request.params as { serviceName: string };
    const canaryConfig = request.body as any;

    const proxyManager = (fastify as any).proxyManager as ProxyManager;
    const routingManager = proxyManager.getRoutingManager();

    routingManager.setCanaryConfig(serviceName, canaryConfig);

    return reply.send({
      message: 'Canary configuration updated successfully',
      serviceName,
      canaryConfig
    });
  });

  // Advanced rate limiting management endpoints
  fastify.get('/admin/rate-limiting/stats', {
    preHandler: [authenticate, authorize(['system:read'])]
  }, async (_request, reply) => {
    const rateLimitingMiddleware = (fastify as any).rateLimitingMiddleware as RateLimitingMiddleware;
    const stats = await rateLimitingMiddleware.getStats();
    return reply.send(stats);
  });

  fastify.get('/admin/rate-limiting/status', {
    preHandler: [authenticate, authorize(['system:read'])]
  }, async (request, reply) => {
    const { policyId = 'global' } = request.query as { policyId?: string };
    const rateLimitingMiddleware = (fastify as any).rateLimitingMiddleware as RateLimitingMiddleware;
    const status = await rateLimitingMiddleware.getRateLimitStatus(request, policyId);
    return reply.send({ policyId, status });

  // WAF (Web Application Firewall) management endpoints
  fastify.get('/admin/waf/stats', {
    preHandler: [authenticate, authorize(['system:read'])],
    schema: {
      tags: ['WAF'],
      summary: 'Get WAF statistics',
      security: [{ bearerAuth: [] }],
      response: {
        200: {
          type: 'object',
          properties: {
            requests: { type: 'object' },
            threats: { type: 'object' },
            rules: { type: 'object' },
            performance: { type: 'object' }
          }
        }
      }
    }
  }, async (_request, reply) => {
    const stats = await wafMiddleware.getStats();
    return reply.send(stats);
  });

  fastify.post('/admin/waf/config', {
    preHandler: [authenticate, authorize(['system:admin'])],
    schema: {
      tags: ['WAF'],
      summary: 'Update WAF configuration',
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        properties: {
          enabled: { type: 'boolean' },
          failOpen: { type: 'boolean' },
          performance: { type: 'object' },
          rateLimit: { type: 'object' },
          geoBlocking: { type: 'object' }
        }
      }
    }
  }, async (request, reply) => {
    const config = request.body as any;
    await wafMiddleware.updateConfig(config);

    logger.info('WAF configuration updated', {
      updatedBy: (request as any).user.userId,
      config
    });

    return reply.send({
      message: 'WAF configuration updated successfully',
      config
    });
  });

  fastify.post('/admin/waf/rules', {
    preHandler: [authenticate, authorize(['system:admin'])],
    schema: {
      tags: ['WAF'],
      summary: 'Add custom WAF rule',
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['id', 'name', 'pattern', 'action'],
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          pattern: { type: 'string' },
          action: { type: 'string', enum: ['block', 'challenge', 'monitor', 'allow'] },
          enabled: { type: 'boolean' },
          priority: { type: 'number' }
        }
      }
    }
  }, async (request, reply) => {
    const rule = request.body as any;
    await wafMiddleware.addRule(rule);

    logger.info('WAF rule added', {
      addedBy: (request as any).user.userId,
      rule
    });

    return reply.send({
      message: 'WAF rule added successfully',
      rule
    });
  });

  fastify.put('/admin/waf/enable', {
    preHandler: [authenticate, authorize(['system:admin'])],
    schema: {
      tags: ['WAF'],
      summary: 'Enable/disable WAF',
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['enabled'],
        properties: {
          enabled: { type: 'boolean' }
        }
      }
    }
  }, async (request, reply) => {
    const { enabled } = request.body as { enabled: boolean };
    wafMiddleware.setEnabled(enabled);

    logger.info('WAF enabled/disabled', {
      changedBy: (request as any).user.userId,
      enabled
    });

    return reply.send({
      message: `WAF ${enabled ? 'enabled' : 'disabled'} successfully`,
      enabled
    });
  });

  // Incident Response management endpoints
  fastify.get('/admin/incident-response/stats', {
    preHandler: [authenticate, authorize(['system:read'])],
    schema: {
      tags: ['Incident Response'],
      summary: 'Get incident response statistics',
      security: [{ bearerAuth: [] }],
      response: {
        200: {
          type: 'object',
          properties: {
            detectionRules: { type: 'number' },
            recentEvents: { type: 'number' },
            suppressionCache: { type: 'number' },
            automationStatus: { type: 'object' }
          }
        }
      }
    }
  }, async (_request, reply) => {
    const stats = incidentResponseMiddleware.getStats();
    return reply.send(stats);
  });

  fastify.post('/admin/incident-response/webhook', {
    preHandler: [authenticate, authorize(['system:write'])],
    schema: {
      tags: ['Incident Response'],
      summary: 'Process security webhook event',
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        properties: {
          source: { type: 'string' },
          eventType: { type: 'string' },
          data: { type: 'object' }
        },
        required: ['source', 'eventType', 'data']
      }
    }
  }, async (request, reply) => {
    const webhookData = request.body as any;

    try {
      await incidentResponseMiddleware.processWebhookEvent(webhookData);

      logger.info('Security webhook processed', {
        source: webhookData.source,
        eventType: webhookData.eventType,
        processedBy: (request as any).user.userId
      });

      return reply.send({
        message: 'Webhook event processed successfully',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Failed to process security webhook', {
        source: webhookData.source,
        error: error.message
      });

      return reply.status(500).send({
        error: 'Failed to process webhook event',
        message: error.message
      });
    }
  });

  fastify.get('/admin/incident-response/automation/status', {
    preHandler: [authenticate, authorize(['system:read'])],
    schema: {
      tags: ['Incident Response'],
      summary: 'Get automation status',
      security: [{ bearerAuth: [] }]
    }
  }, async (_request, reply) => {
    const stats = incidentResponseMiddleware.getStats();
    return reply.send({
      automation: stats.automationStatus,
      timestamp: new Date().toISOString()
    });
  });

  // Compliance management endpoints
  fastify.get('/admin/compliance/status', {
    preHandler: [authenticate, authorize(['system:read'])],
    schema: {
      tags: ['Compliance'],
      summary: 'Get compliance monitoring status',
      security: [{ bearerAuth: [] }],
      response: {
        200: {
          type: 'object',
          properties: {
            frameworks: { type: 'array' },
            lastAssessment: { type: 'string' },
            status: { type: 'string' },
            compliance: { type: 'object' }
          }
        }
      }
    }
  }, async (_request, reply) => {
    const complianceOrchestrator = (fastify as any).complianceOrchestrator as ComplianceOrchestrator;
    const status = await complianceOrchestrator.getComplianceStatus();
    return reply.send(status);
  });

  fastify.get('/admin/compliance/dashboard', {
    preHandler: [authenticate, authorize(['system:read'])],
    schema: {
      tags: ['Compliance'],
      summary: 'Get compliance dashboard data',
      security: [{ bearerAuth: [] }],
      response: {
        200: {
          type: 'object',
          properties: {
            dashboard: { type: 'object' },
            timestamp: { type: 'string' }
          }
        }
      }
    }
  }, async (_request, reply) => {
    const complianceOrchestrator = (fastify as any).complianceOrchestrator as ComplianceOrchestrator;
    const dashboard = await complianceOrchestrator.generateComplianceDashboard();
    return reply.send({
      dashboard,
      timestamp: new Date().toISOString()
    });
  });

  fastify.get('/admin/compliance/report/:framework', {
    preHandler: [authenticate, authorize(['system:read'])],
    schema: {
      tags: ['Compliance'],
      summary: 'Generate compliance report for framework',
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        required: ['framework'],
        properties: {
          framework: { type: 'string', enum: ['SOC2', 'ISO27001', 'PCI_DSS', 'GDPR'] }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            framework: { type: 'string' },
            report: { type: 'object' },
            generatedAt: { type: 'string' }
          }
        }
      }
    }
  }, async (request, reply) => {
    const { framework } = request.params as { framework: string };
    const complianceOrchestrator = (fastify as any).complianceOrchestrator as ComplianceOrchestrator;

    try {
      const report = await complianceOrchestrator.generateComplianceReport(framework as any);

      logger.info('Compliance report generated', {
        framework,
        generatedBy: (request as any).user.userId
      });

      return reply.send({
        framework,
        report,
        generatedAt: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Failed to generate compliance report', {
        framework,
        error: error.message
      });

      return reply.status(500).send({
        error: 'Failed to generate compliance report',
        message: error.message
      });
    }
  });

  fastify.post('/admin/compliance/assessment/:framework', {
    preHandler: [authenticate, authorize(['system:write'])],
    schema: {
      tags: ['Compliance'],
      summary: 'Run compliance assessment for framework',
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        required: ['framework'],
        properties: {
          framework: { type: 'string', enum: ['SOC2', 'ISO27001', 'PCI_DSS', 'GDPR'] }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            framework: { type: 'string' },
            assessment: { type: 'object' },
            timestamp: { type: 'string' }
          }
        }
      }
    }
  }, async (request, reply) => {
    const { framework } = request.params as { framework: string };
    const complianceOrchestrator = (fastify as any).complianceOrchestrator as ComplianceOrchestrator;

    try {
      const assessment = await complianceOrchestrator.runFrameworkAssessment(framework as any);

      logger.info('Compliance assessment completed', {
        framework,
        triggeredBy: (request as any).user.userId,
        status: assessment.status
      });

      return reply.send({
        framework,
        assessment,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Failed to run compliance assessment', {
        framework,
        error: error.message
      });

      return reply.status(500).send({
        error: 'Failed to run compliance assessment',
        message: error.message
      });
    }
  });

  fastify.get('/admin/compliance/controls/:framework', {
    preHandler: [authenticate, authorize(['system:read'])],
    schema: {
      tags: ['Compliance'],
      summary: 'Get compliance controls for framework',
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        required: ['framework'],
        properties: {
          framework: { type: 'string', enum: ['SOC2', 'ISO27001', 'PCI_DSS', 'GDPR'] }
        }
      }
    }
  }, async (request, reply) => {
    const { framework } = request.params as { framework: string };
    const complianceOrchestrator = (fastify as any).complianceOrchestrator as ComplianceOrchestrator;

    try {
      const controls = await complianceOrchestrator.getFrameworkControls(framework as any);
      return reply.send({
        framework,
        controls,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Failed to get compliance controls', {
        framework,
        error: error.message
      });

      return reply.status(500).send({
        error: 'Failed to get compliance controls',
        message: error.message
      });
    }
  });

  fastify.post('/admin/rate-limiting/reset', {
    preHandler: [authenticate, authorize(['system:write'])],
    schema: {
      body: {
        type: 'object',
        required: ['key', 'policyId'],
        properties: {
          key: { type: 'string' },
          policyId: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    const { key, policyId } = request.body as { key: string; policyId: string };
    const rateLimitingMiddleware = (fastify as any).rateLimitingMiddleware as RateLimitingMiddleware;

    const success = await rateLimitingMiddleware.resetRateLimit(key, policyId);

    return reply.send({
      message: success ? 'Rate limit reset successfully' : 'Failed to reset rate limit',
      success,
      key,
      policyId
    });
  });

  // Apply different rate limiting to different endpoint types
  fastify.get('/admin/rate-limiting/policies', {
    preHandler: [authenticate, authorize(['system:read'])]
  }, async (_request, reply) => {
    return reply.send({
      policies: {
        global: config.rateLimiting.advanced.global,
        perUser: config.rateLimiting.advanced.perUser,
        perEndpoint: config.rateLimiting.advanced.perEndpoint,
        perIp: config.rateLimiting.advanced.perIp
      },
      bypass: config.rateLimiting.advanced.bypass,
      algorithms: ['sliding-window', 'token-bucket', 'fixed-window'],
      keyGenerators: ['ip', 'user', 'endpoint', 'composite']
    });
  });

  // Test endpoint with custom rate limiting
  fastify.get('/test/rate-limit', {
    preHandler: [rateLimitingMiddleware.createEndpointMiddleware(5, 30, 'token-bucket')]
  }, async (_request, reply) => {
    return reply.send({
      message: 'Rate limiting test endpoint',
      timestamp: new Date().toISOString(),
      limit: '5 requests per 30 seconds using token bucket algorithm'
    });
  });

  // Cache management endpoints
  fastify.get('/admin/cache/stats', {
    preHandler: [authenticate, authorize(['system:read'])],
    schema: {
      tags: ['Cache Management'],
      summary: 'Get comprehensive cache statistics',
      security: [{ bearerAuth: [] }],
      response: {
        200: {
          type: 'object',
          properties: {
            cache: { type: 'object' },
            analytics: { type: 'object' },
            health: { type: 'object' }
          }
        }
      }
    }
  }, async (_request, reply) => {
    const cacheMiddleware = (fastify as any).cacheMiddleware as CacheMiddleware;
    const stats = await cacheMiddleware.getStats();
    return reply.send(stats);
  });

  fastify.get('/admin/cache/health', {
    preHandler: [authenticate, authorize(['system:read'])],
    schema: {
      tags: ['Cache Management'],
      summary: 'Get cache health status',
      security: [{ bearerAuth: [] }],
      response: {
        200: {
          type: 'object',
          properties: {
            overall: { type: 'string', enum: ['healthy', 'warning', 'critical'] },
            components: { type: 'object' },
            recommendations: { type: 'array', items: { type: 'string' } }
          }
        }
      }
    }
  }, async (_request, reply) => {
    const cacheMiddleware = (fastify as any).cacheMiddleware as CacheMiddleware;
    const health = await cacheMiddleware.getHealth();
    return reply.send(health);
  });

  fastify.post('/admin/cache/invalidate/tags', {
    preHandler: [authenticate, authorize(['system:write'])],
    schema: {
      tags: ['Cache Management'],
      summary: 'Invalidate cache by tags',
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['tags'],
        properties: {
          tags: { type: 'array', items: { type: 'string' }, minItems: 1 }
        }
      }
    }
  }, async (request, reply) => {
    const { tags } = request.body as { tags: string[] };
    const cacheMiddleware = (fastify as any).cacheMiddleware as CacheMiddleware;
    const deleted = await cacheMiddleware.invalidateByTags(tags);

    logger.info('Cache invalidated by tags', {
      tags,
      deleted,
      triggeredBy: (request as any).user.userId
    });

    return reply.send({
      message: 'Cache invalidated by tags',
      tags,
      deleted,
      timestamp: new Date().toISOString()
    });
  });

  fastify.post('/admin/cache/invalidate/pattern', {
    preHandler: [authenticate, authorize(['system:write'])],
    schema: {
      tags: ['Cache Management'],
      summary: 'Invalidate cache by URL pattern',
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['pattern'],
        properties: {
          pattern: { type: 'string', minLength: 1 }
        }
      }
    }
  }, async (request, reply) => {
    const { pattern } = request.body as { pattern: string };
    const cacheMiddleware = (fastify as any).cacheMiddleware as CacheMiddleware;
    const deleted = await cacheMiddleware.invalidateByPattern(pattern);

    logger.info('Cache invalidated by pattern', {
      pattern,
      deleted,
      triggeredBy: (request as any).user.userId
    });

    return reply.send({
      message: 'Cache invalidated by pattern',
      pattern,
      deleted,
      timestamp: new Date().toISOString()
    });
  });

  fastify.post('/admin/cache/clear', {
    preHandler: [authenticate, authorize(['system:admin'])],
    schema: {
      tags: ['Cache Management'],
      summary: 'Clear all cache entries',
      security: [{ bearerAuth: [] }]
    }
  }, async (request, reply) => {
    const cacheMiddleware = (fastify as any).cacheMiddleware as CacheMiddleware;
    const success = await cacheMiddleware.clearAll();

    logger.warn('Cache cleared', {
      success,
      triggeredBy: (request as any).user.userId
    });

    return reply.send({
      message: success ? 'Cache cleared successfully' : 'Failed to clear cache',
      success,
      timestamp: new Date().toISOString()
    });
  });

  fastify.post('/admin/cache/warm', {
    preHandler: [authenticate, authorize(['system:write'])],
    schema: {
      tags: ['Cache Management'],
      summary: 'Warm cache for specific endpoints',
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['endpoints'],
        properties: {
          endpoints: {
            type: 'array',
            items: {
              type: 'object',
              required: ['method', 'url'],
              properties: {
                method: { type: 'string' },
                url: { type: 'string' },
                headers: { type: 'object' }
              }
            }
          }
        }
      }
    }
  }, async (request, reply) => {
    const { endpoints } = request.body as { endpoints: Array<{ method: string; url: string; headers?: Record<string, string> }> };
    const cacheMiddleware = (fastify as any).cacheMiddleware as CacheMiddleware;
    await cacheMiddleware.warmCache(endpoints);

    logger.info('Cache warming initiated', {
      endpointCount: endpoints.length,
      triggeredBy: (request as any).user.userId
    });

    return reply.send({
      message: 'Cache warming initiated',
      endpoints: endpoints.length,
      timestamp: new Date().toISOString()
    });
  });

  fastify.get('/admin/cache/policies', {
    preHandler: [authenticate, authorize(['system:read'])],
    schema: {
      tags: ['Cache Management'],
      summary: 'Get all cache policies',
      security: [{ bearerAuth: [] }]
    }
  }, async (_request, reply) => {
    const cacheMiddleware = (fastify as any).cacheMiddleware as CacheMiddleware;
    const policies = cacheMiddleware.getPolicies();
    return reply.send({ policies, timestamp: new Date().toISOString() });
  });

  fastify.post('/admin/cache/policies', {
    preHandler: [authenticate, authorize(['system:admin'])],
    schema: {
      tags: ['Cache Management'],
      summary: 'Add cache policy',
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['id', 'name', 'pattern', 'ttl'],
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          pattern: { type: 'string' },
          ttl: { type: 'number', minimum: 0 },
          enabled: { type: 'boolean' },
          conditions: { type: 'object' },
          varyHeaders: { type: 'array', items: { type: 'string' } },
          tags: { type: 'array', items: { type: 'string' } },
          priority: { type: 'number' }
        }
      }
    }
  }, async (request, reply) => {
    const policy = request.body as any;
    const cacheMiddleware = (fastify as any).cacheMiddleware as CacheMiddleware;
    cacheMiddleware.addPolicy(policy);

    logger.info('Cache policy added', {
      policyId: policy.id,
      addedBy: (request as any).user.userId
    });

    return reply.status(201).send({
      message: 'Cache policy added successfully',
      policy,
      timestamp: new Date().toISOString()
    });
  });

  fastify.delete('/admin/cache/policies/:policyId', {
    preHandler: [authenticate, authorize(['system:admin'])],
    schema: {
      tags: ['Cache Management'],
      summary: 'Remove cache policy',
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        required: ['policyId'],
        properties: {
          policyId: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    const { policyId } = request.params as { policyId: string };
    const cacheMiddleware = (fastify as any).cacheMiddleware as CacheMiddleware;
    const removed = cacheMiddleware.removePolicy(policyId);

    if (removed) {
      logger.info('Cache policy removed', {
        policyId,
        removedBy: (request as any).user.userId
      });

      return reply.send({
        message: 'Cache policy removed successfully',
        policyId,
        timestamp: new Date().toISOString()
      });
    } else {
      return reply.status(404).send({
        error: 'Cache policy not found',
        policyId
      });
    }
  });

  fastify.get('/admin/cache/config', {
    preHandler: [authenticate, authorize(['system:read'])],
    schema: {
      tags: ['Cache Management'],
      summary: 'Get cache middleware configuration',
      security: [{ bearerAuth: [] }]
    }
  }, async (_request, reply) => {
    const cacheMiddleware = (fastify as any).cacheMiddleware as CacheMiddleware;
    const config = cacheMiddleware.getConfig();
    return reply.send({ config, timestamp: new Date().toISOString() });
  });

  fastify.put('/admin/cache/config', {
    preHandler: [authenticate, authorize(['system:admin'])],
    schema: {
      tags: ['Cache Management'],
      summary: 'Update cache middleware configuration',
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        properties: {
          enabled: { type: 'boolean' },
          defaultTtl: { type: 'number', minimum: 0 },
          maxSize: { type: 'number', minimum: 0 },
          etagEnabled: { type: 'boolean' },
          conditionalRequestsEnabled: { type: 'boolean' },
          compressionEnabled: { type: 'boolean' },
          debugMode: { type: 'boolean' }
        }
      }
    }
  }, async (request, reply) => {
    const configUpdate = request.body as any;
    const cacheMiddleware = (fastify as any).cacheMiddleware as CacheMiddleware;
    cacheMiddleware.updateConfig(configUpdate);

    logger.info('Cache configuration updated', {
      update: configUpdate,
      updatedBy: (request as any).user.userId
    });

    return reply.send({
      message: 'Cache configuration updated successfully',
      config: cacheMiddleware.getConfig(),
      timestamp: new Date().toISOString()
    });
  });

  // Premium tier test endpoint
  fastify.get('/premium/feature', {
    preHandler: [authenticate, rateLimitingMiddleware.createTierMiddleware('premium')]
  }, async (_request, reply) => {
    return reply.send({
      message: 'Premium feature accessed',
      tier: 'premium',
      timestamp: new Date().toISOString()
    });
  });

  // Adaptive rate limiting test endpoint
  fastify.get('/test/adaptive', {
    preHandler: [rateLimitingMiddleware.createAdaptiveMiddleware(100, 0.7)]
  }, async (_request, reply) => {
    const memoryUsage = process.memoryUsage();
    const memoryUtilization = memoryUsage.heapUsed / memoryUsage.heapTotal;

    return reply.send({
      message: 'Adaptive rate limiting test',
      systemMetrics: {
        memoryUtilization: (memoryUtilization * 100).toFixed(2) + '%',
        heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024) + ' MB',
        heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024) + ' MB'
      },
      timestamp: new Date().toISOString()
    });
  });

  // Cache testing endpoints
  fastify.get('/test/cache', {
    schema: {
      tags: ['Testing'],
      summary: 'Test response caching',
      description: 'Endpoint for testing cache functionality with varying response times'
    }
  }, async (_request, reply) => {
    // Simulate some processing time
    await new Promise(resolve => setTimeout(resolve, Math.random() * 100));

    const responseData = {
      message: 'Cache test endpoint',
      timestamp: new Date().toISOString(),
      randomData: Math.random(),
      serverTime: Date.now(),
      processingTime: Math.random() * 100
    };

    // Set cache headers for testing
    reply.header('Cache-Control', 'max-age=300'); // 5 minutes
    reply.header('ETag', `"${Date.now()}"`);

    return reply.send(responseData);
  });

  fastify.get('/test/cache/heavy', {
    schema: {
      tags: ['Testing'],
      summary: 'Test caching with heavy response',
      description: 'Heavy response for testing cache size limits'
    }
  }, async (_request, reply) => {
    // Create a larger response to test size-based caching
    const heavyData = {
      message: 'Heavy cache test endpoint',
      timestamp: new Date().toISOString(),
      largeArray: Array.from({ length: 1000 }, (_, i) => ({
        id: i,
        data: `Item ${i} with some data`,
        timestamp: new Date().toISOString(),
        random: Math.random()
      }))
    };

    reply.header('Cache-Control', 'max-age=600'); // 10 minutes
    return reply.send(heavyData);
  });

  fastify.get('/test/cache/no-cache', {
    schema: {
      tags: ['Testing'],
      summary: 'Test uncacheable response',
      description: 'Endpoint that should not be cached'
    }
  }, async (_request, reply) => {
    const responseData = {
      message: 'This response should not be cached',
      timestamp: new Date().toISOString(),
      randomValue: Math.random()
    };

    reply.header('Cache-Control', 'no-cache, no-store, must-revalidate');
    reply.header('Pragma', 'no-cache');
    reply.header('Expires', '0');

    return reply.send(responseData);
  });

  fastify.get('/test/cache/user/:userId', {
    preHandler: [authenticate],
    schema: {
      tags: ['Testing'],
      summary: 'Test user-specific caching',
      description: 'User-specific content that should vary by user',
      params: {
        type: 'object',
        required: ['userId'],
        properties: {
          userId: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    const { userId } = request.params as { userId: string };
    const user = (request as any).user;

    const userData = {
      message: 'User-specific cached content',
      userId,
      userRole: user?.role || 'anonymous',
      timestamp: new Date().toISOString(),
      personalizedData: `Data for user ${userId}`,
      accessCount: Math.floor(Math.random() * 100)
    };

    reply.header('Cache-Control', 'private, max-age=300'); // 5 minutes, private cache
    reply.header('Vary', 'Authorization');

    return reply.send(userData);
  });

  // Initialize proxy manager and register proxy routes
  const proxyManager = new ProxyManager(fastify);
  fastify.decorate('proxyManager', proxyManager);

  await proxyManager.registerRoutes();
  await proxyManager.startHealthChecks();

  // Start resilience orchestrator and register gateway services
  const resilienceOrchestrator = (fastify as any).resilienceOrchestrator;
  if (resilienceOrchestrator) {
    await resilienceOrchestrator.start();

    // Register gateway services with resilience orchestrator
    const gatewayServices = Object.entries(config.services).map(([name, serviceConfig]: [string, any]) => ({
      name,
      instances: serviceConfig.instances?.map((instance: any, index: number) => ({
        host: instance.host,
        port: instance.port,
        protocol: instance.protocol || 'http'
      })) || [],
      healthCheckPath: serviceConfig.healthCheckPath || '/health',
      dependencies: serviceConfig.dependencies || []
    }));

    await registerGatewayServices(resilienceOrchestrator, gatewayServices);
  }
}

// Graceful shutdown
async function gracefulShutdown(signal: string) {
  logger.info(`Received ${signal}, starting graceful shutdown`);
  
  try {
    // Stop health checks
    const proxyManager = (fastify as any).proxyManager as ProxyManager;
    if (proxyManager) {
      proxyManager.stopHealthChecks();
    }

    // Stop compliance orchestrator
    const complianceOrchestrator = (fastify as any).complianceOrchestrator as ComplianceOrchestrator;
    if (complianceOrchestrator) {
      complianceOrchestrator.stopAutomatedAssessments();
    }

    // Stop resilience orchestrator
    const resilienceOrchestrator = (fastify as any).resilienceOrchestrator;
    if (resilienceOrchestrator) {
      await resilienceOrchestrator.stop();
    }

    // Close Redis connection
    await redisManager.disconnect();
    
    // Close Fastify
    await fastify.close();
    
    logger.info('Graceful shutdown completed');
    process.exit(0);
  } catch (error: any) {
    logger.error({ error }, 'Error during shutdown');
    process.exit(1);
  }
}

// Start server
async function start() {
  try {
    // Connect to Redis
    await redisManager.connect();
    
    // Register plugins and routes
    await registerPlugins();
    await registerRoutes();
    
    // Start server
    await fastify.listen({ 
      port: config.port, 
      host: '0.0.0.0' 
    });
    
    logger.info(`🚀 Urnlabs Gateway running on port ${config.port}`);
    logger.info(`📚 API Documentation: http://localhost:${config.port}/docs`);
    logger.info(`❤️  Health Check: http://localhost:${config.port}/health`);
    
    // Setup signal handlers
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    
  } catch (error: any) {
    logger.error({ error }, 'Failed to start server');
    process.exit(1);
  }
}

// Handle unhandled rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error({ reason, promise }, 'Unhandled Promise Rejection');
  process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error: any) => {
  logger.error({ error }, 'Uncaught Exception');
  process.exit(1);
});

// Start the server
start();