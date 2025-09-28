import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { config, rateLimitConfig } from './lib/config.js';
import { logger } from './lib/logger.js';
import { githubRoutes } from './routes/github.js';
import { slackRoutes } from './routes/slack.js';
import { webhookRoutes } from './routes/webhooks.js';
import { marketplaceRoutes } from './routes/marketplace.js';

async function buildServer() {
  const fastify = Fastify({
    logger: logger,
    trustProxy: true,
  });

  // Register security plugins
  await fastify.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"],
      },
    },
  });

  await fastify.register(cors, {
    origin: true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  });

  await fastify.register(rateLimit, {
    max: rateLimitConfig.maxRequests,
    timeWindow: rateLimitConfig.windowMs,
    allowList: ['127.0.0.1', '::1'],
  });

  // Register Swagger documentation
  await fastify.register(swagger, {
    swagger: {
      info: {
        title: 'Urnlabs Integrations API',
        description: 'API for managing external integrations including GitHub, Slack, and marketplace connectors',
        version: '1.0.0',
      },
      host: `${config.HOST}:${config.PORT}`,
      schemes: ['http', 'https'],
      consumes: ['application/json'],
      produces: ['application/json'],
      tags: [
        { name: 'GitHub', description: 'GitHub App integration endpoints' },
        { name: 'Slack', description: 'Slack bot integration endpoints' },
        { name: 'Webhooks', description: 'Webhook processing endpoints' },
        { name: 'Marketplace', description: 'Integration marketplace endpoints' },
        { name: 'Health', description: 'Health check endpoints' },
      ],
    },
  });

  await fastify.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: false,
    },
    staticCSP: true,
    transformSpecificationClone: true,
  });

  // Health check endpoint
  fastify.get('/health', async (request, reply) => {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: 'integrations',
      version: '1.0.0',
      environment: config.NODE_ENV,
    };
  });

  // Register route modules
  await fastify.register(githubRoutes, { prefix: '/api/v1/github' });
  await fastify.register(slackRoutes, { prefix: '/api/v1/slack' });
  await fastify.register(webhookRoutes, { prefix: '/api/v1' });
  await fastify.register(marketplaceRoutes, { prefix: '/api/v1/marketplace' });

  // Global error handler
  fastify.setErrorHandler(async (error, request, reply) => {
    logger.error({
      error: {
        message: error.message,
        stack: error.stack,
        name: error.name,
      },
      request: {
        method: request.method,
        url: request.url,
        params: request.params,
        query: request.query,
        headers: request.headers,
      },
    }, 'Request error');

    if (error.validation) {
      return reply.code(400).send({
        error: 'Validation Error',
        message: error.message,
        details: error.validation,
      });
    }

    if (error.statusCode && error.statusCode < 500) {
      return reply.code(error.statusCode).send({
        error: error.name || 'Bad Request',
        message: error.message,
      });
    }

    return reply.code(500).send({
      error: 'Internal Server Error',
      message: 'An unexpected error occurred',
    });
  });

  // 404 handler
  fastify.setNotFoundHandler(async (request, reply) => {
    return reply.code(404).send({
      error: 'Not Found',
      message: `Route ${request.method} ${request.url} not found`,
    });
  });

  return fastify;
}

async function start() {
  try {
    const fastify = await buildServer();

    // Graceful shutdown
    const gracefulShutdown = async () => {
      logger.info('Received shutdown signal, closing server gracefully');
      try {
        await fastify.close();
        logger.info('Server closed successfully');
        process.exit(0);
      } catch (error) {
        logger.error('Error during graceful shutdown', error);
        process.exit(1);
      }
    };

    process.on('SIGTERM', gracefulShutdown);
    process.on('SIGINT', gracefulShutdown);

    // Start server
    await fastify.listen({
      port: config.PORT,
      host: config.HOST,
    });

    logger.info(`🚀 Integrations service started on ${config.HOST}:${config.PORT}`);
    logger.info(`📚 API documentation available at http://${config.HOST}:${config.PORT}/docs`);
    logger.info(`🔗 Health check available at http://${config.HOST}:${config.PORT}/health`);
  } catch (error) {
    logger.error('Failed to start server', error);
    process.exit(1);
  }
}

// Start server if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  start();
}

export { buildServer, start };