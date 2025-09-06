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
import { authenticate, authorize, optionalAuth, generateToken, revokeToken } from './middleware/auth.js';
import { HealthCheckResult, MetricsData, WebSocketMessage } from './types/index.js';

const fastify: FastifyInstance = Fastify({
  logger: logger,
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
  // Security
  await fastify.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'", "wss:", "ws:"]
      }
    }
  });

  // CORS
  await fastify.register(cors, config.cors);

  // Rate limiting
  await fastify.register(rateLimit, {
    max: config.rateLimiting.global.max,
    timeWindow: config.rateLimiting.global.timeWindow,
    redis: redisManager.getClient(),
    allowList: ['127.0.0.1', '::1'],
    skipOnError: true,
    errorResponseBuilder: (request, context) => {
      return {
        error: 'Too Many Requests',
        message: `Rate limit exceeded: ${context.max} requests per ${Math.round(context.timeWindow / 1000)} seconds`,
        retryAfter: Math.round(context.timeWindow / 1000)
      };
    }
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
  // Health check endpoint
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
            uptime: { type: 'number' }
          }
        }
      }
    }
  }, async (request, reply) => {
    const proxyManager = fastify.proxyManager as ProxyManager;
    const serviceStatuses = await proxyManager.getAllServiceStatuses();
    
    const healthyServices = Object.values(serviceStatuses).filter((s: any) => s?.status === 'healthy').length;
    const totalServices = Object.keys(config.services).length;
    
    const overallStatus = healthyServices === totalServices ? 'healthy' : 
                         healthyServices > 0 ? 'degraded' : 'unhealthy';

    return reply.send({
      status: overallStatus,
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      services: serviceStatuses,
      uptime: process.uptime(),
      redis: redisManager.isHealthy()
    });
  });

  // Detailed system status
  fastify.get('/status', {
    preHandler: [authenticate, authorize(['system:read'])]
  }, async (request, reply) => {
    const proxyManager = fastify.proxyManager as ProxyManager;
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

  // Authentication endpoints
  fastify.post('/auth/login', {
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
    const { email, password } = request.body as any;
    
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
    } catch (error) {
      logger.error({ error, email }, 'Login failed');
      return reply.status(401).send({
        error: 'Authentication Failed',
        message: 'Invalid credentials'
      });
    }
  });

  fastify.post('/auth/logout', {
    preHandler: [authenticate]
  }, async (request, reply) => {
    const authHeader = request.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      await revokeToken(token);
    }
    
    return reply.send({ message: 'Logged out successfully' });
  });

  // WebSocket endpoint for real-time communications
  fastify.register(async function (fastify) {
    fastify.get('/ws', { websocket: true }, (connection, request) => {
      logger.info('WebSocket connection established');
      
      connection.on('message', async (message) => {
        try {
          const data: WebSocketMessage = JSON.parse(message.toString());
          
          switch (data.type) {
            case 'ping':
              connection.send(JSON.stringify({
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
        } catch (error) {
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
  }, async (request, reply) => {
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

  // Initialize proxy manager and register proxy routes
  const proxyManager = new ProxyManager(fastify);
  fastify.decorate('proxyManager', proxyManager);
  
  await proxyManager.registerRoutes();
  await proxyManager.startHealthChecks();
}

// Graceful shutdown
async function gracefulShutdown(signal: string) {
  logger.info(`Received ${signal}, starting graceful shutdown`);
  
  try {
    // Stop health checks
    const proxyManager = fastify.proxyManager as ProxyManager;
    if (proxyManager) {
      proxyManager.stopHealthChecks();
    }
    
    // Close Redis connection
    await redisManager.disconnect();
    
    // Close Fastify
    await fastify.close();
    
    logger.info('Graceful shutdown completed');
    process.exit(0);
  } catch (error) {
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
    
  } catch (error) {
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
process.on('uncaughtException', (error) => {
  logger.error({ error }, 'Uncaught Exception');
  process.exit(1);
});

// Start the server
start();