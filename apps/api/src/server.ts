import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import jwt from '@fastify/jwt';
import { PrismaClient } from '@prisma/client';

import { config } from '@/lib/config.js';
import { logger } from '@/lib/logger.js';
import { errorHandler } from '@/middleware/error-handler.js';
import { authMiddleware } from '@/middleware/auth.js';
import { requestLogger } from '@/middleware/request-logger.js';
import { healthRoutes } from '@/routes/health.js';
import { authRoutes } from '@/routes/auth.js';
import { usersRoutes } from '@/routes/users.js';
import { agentsRoutes } from '@/routes/agents.js';
import { workflowsRoutes } from '@/routes/workflows.js';
import { analyticsRoutes } from '@/routes/analytics.js';

declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient;
  }
}

async function buildServer(): Promise<FastifyInstance> {
  const server = Fastify({
    logger: logger,
    requestIdLogLabel: 'request-id',
    requestIdHeader: 'x-request-id',
    genReqId: () => crypto.randomUUID(),
  });

  // Database connection
  const prisma = new PrismaClient({
    log: config.NODE_ENV === 'development' ? ['query', 'info', 'warn', 'error'] : ['error'],
  });

  server.decorate('prisma', prisma);

  // Graceful shutdown
  server.addHook('onClose', async () => {
    await prisma.$disconnect();
  });

  // Security middleware
  await server.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'https:'],
      },
    },
  });

  // CORS configuration
  await server.register(cors, {
    origin: config.CORS_ORIGINS,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  });

  // Rate limiting
  await server.register(rateLimit, {
    max: config.RATE_LIMIT_MAX,
    timeWindow: config.RATE_LIMIT_WINDOW,
    errorResponseBuilder: (req, context) => ({
      error: 'Rate limit exceeded',
      message: `Too many requests from ${req.ip}`,
      expiresIn: Math.round(context.expiresIn),
    }),
  });

  // JWT authentication
  await server.register(jwt, {
    secret: config.JWT_SECRET,
    sign: {
      expiresIn: config.JWT_EXPIRES_IN,
    },
  });

  // Swagger documentation
  await server.register(swagger, {
    openapi: {
      openapi: '3.0.0',
      info: {
        title: 'Urnlabs AI Agent Platform API',
        description: 'Production-ready API for AI agent orchestration and management',
        version: '1.0.0',
        contact: {
          name: 'Urnlabs Engineering',
          email: 'engineering@urnlabs.ai',
        },
      },
      servers: [
        { url: 'http://localhost:3000', description: 'Development server' },
        { url: 'https://api-staging.urnlabs.ai', description: 'Staging server' },
        { url: 'https://api.urnlabs.ai', description: 'Production server' },
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
          },
        },
      },
    },
  });

  await server.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'full',
      deepLinking: false,
    },
  });

  // Global middleware
  await server.register(requestLogger);
  await server.register(errorHandler);

  // Authentication middleware (applies to all routes except health and auth)
  server.addHook('preHandler', async (request, reply) => {
    // Skip auth for health checks, docs, and auth endpoints
    const publicPaths = ['/health', '/docs', '/auth'];
    const isPublicPath = publicPaths.some(path => request.url.startsWith(path));
    
    if (!isPublicPath) {
      await authMiddleware(request, reply);
    }
  });

  // Routes registration
  await server.register(healthRoutes, { prefix: '/health' });
  await server.register(authRoutes, { prefix: '/auth' });
  await server.register(usersRoutes, { prefix: '/users' });
  await server.register(agentsRoutes, { prefix: '/agents' });
  await server.register(workflowsRoutes, { prefix: '/workflows' });
  await server.register(analyticsRoutes, { prefix: '/analytics' });

  return server;
}

async function start() {
  try {
    const server = await buildServer();
    
    // Use API_PORT environment variable if provided, otherwise fall back to config.PORT
    const port = process.env.API_PORT ? parseInt(process.env.API_PORT, 10) : config.PORT;
    
    await server.listen({
      port: port,
      host: config.HOST,
    });

    // Health check after startup
    const healthCheck = await server.inject({
      method: 'GET',
      url: '/health',
    });

    if (healthCheck.statusCode !== 200) {
      throw new Error('Health check failed after startup');
    }

    logger.info({
      port: port,
      host: config.HOST,
      environment: config.NODE_ENV,
      docs: `http://${config.HOST}:${port}/docs`,
    }, 'Urnlabs API server started successfully');

  } catch (error) {
    logger.error(error, 'Failed to start server');
    process.exit(1);
  }
}

// Handle uncaught exceptions and unhandled rejections
process.on('uncaughtException', (error) => {
  logger.error(error, 'Uncaught exception');
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.error({ reason }, 'Unhandled rejection');
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('Received SIGTERM, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('Received SIGINT, shutting down gracefully');  
  process.exit(0);
});

if (import.meta.url === `file://${process.argv[1]}`) {
  start();
}

export { buildServer };