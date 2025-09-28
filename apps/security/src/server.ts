import Fastify from 'fastify';
import fastifyCors from '@fastify/cors';
import fastifyHelmet from '@fastify/helmet';
import fastifyJwt from '@fastify/jwt';
import fastifyRateLimit from '@fastify/rate-limit';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import fastifyCookie from '@fastify/cookie';
import { authRoutes } from './routes/auth-routes.js';
import { logger } from './lib/logger.js';

const fastify = Fastify({
  logger: {
    level: process.env.LOG_LEVEL || 'info',
    transport: process.env.NODE_ENV === 'development' ? {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'yyyy-mm-dd HH:MM:ss',
        ignore: 'pid,hostname'
      }
    } : undefined
  }
});

const start = async () => {
  try {
    // Security headers
    await fastify.register(fastifyHelmet, {
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", "data:", "https:"],
        },
      },
    });

    // CORS configuration
    await fastify.register(fastifyCors, {
      origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:3000', 'http://localhost:7000'],
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token']
    });

    // Cookie support
    await fastify.register(fastifyCookie, {
      secret: process.env.COOKIE_SECRET || 'your-cookie-secret-change-me',
      parseOptions: {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict'
      }
    });

    // Global rate limiting
    await fastify.register(fastifyRateLimit, {
      max: 1000, // requests
      timeWindow: '15 minutes',
      errorResponseBuilder: function (request, context) {
        return {
          code: 429,
          error: 'Too Many Requests',
          message: `Rate limit exceeded, retry in ${context.ttl} milliseconds.`,
          date: Date.now(),
          expiresIn: context.ttl
        };
      }
    });

    // JWT configuration
    await fastify.register(fastifyJwt, {
      secret: process.env.JWT_ACCESS_SECRET || 'your-access-secret'
    });

    // Swagger documentation
    await fastify.register(fastifySwagger, {
      swagger: {
        info: {
          title: 'Urnlabs Security Service API',
          description: 'Enterprise Security Framework with JWT Authentication, RBAC, and Audit Logging',
          version: '1.0.0'
        },
        host: process.env.SWAGGER_HOST || 'localhost:7009',
        schemes: ['http', 'https'],
        consumes: ['application/json'],
        produces: ['application/json'],
        tags: [
          { name: 'Authentication', description: 'Authentication and authorization endpoints' },
          { name: 'Security', description: 'Security management endpoints' },
          { name: 'Audit', description: 'Audit logging and compliance endpoints' }
        ],
        securityDefinitions: {
          Bearer: {
            type: 'apiKey',
            name: 'Authorization',
            in: 'header',
            description: 'Enter JWT token in format: Bearer <token>'
          }
        }
      }
    });

    await fastify.register(fastifySwaggerUi, {
      routePrefix: '/docs',
      uiConfig: {
        docExpansion: 'list',
        deepLinking: false
      },
      staticCSP: true,
      transformStaticCSP: (header) => header
    });

    // Health check endpoint
    fastify.get('/health', async () => {
      return {
        status: 'healthy',
        service: 'security',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: process.env.NODE_ENV || 'development'
      };
    });

    // Ready check endpoint (for K8s readiness probes)
    fastify.get('/ready', async () => {
      // TODO: Add database connectivity check
      // TODO: Add external service dependency checks
      return {
        status: 'ready',
        service: 'security',
        timestamp: new Date().toISOString(),
        checks: {
          database: 'healthy', // TODO: Implement actual check
          encryption: 'healthy', // TODO: Implement actual check
          logging: 'healthy'
        }
      };
    });

    // Register authentication routes
    await fastify.register(authRoutes, { prefix: '/auth' });

    // Global error handler
    fastify.setErrorHandler((error, request, reply) => {
      logger.error('Unhandled error', {
        error: error.message,
        stack: error.stack,
        url: request.url,
        method: request.method,
        ip: request.ip
      });

      // Don't expose internal errors in production
      const message = process.env.NODE_ENV === 'production' 
        ? 'Internal Server Error'
        : error.message;

      reply.status(error.statusCode || 500).send({
        error: 'Internal Server Error',
        message,
        timestamp: new Date().toISOString(),
        path: request.url
      });
    });

    // 404 handler
    fastify.setNotFoundHandler((request, reply) => {
      reply.status(404).send({
        error: 'Not Found',
        message: `Route ${request.method} ${request.url} not found`,
        timestamp: new Date().toISOString()
      });
    });

    // Graceful shutdown handling
    const signals = ['SIGINT', 'SIGTERM'];
    signals.forEach(signal => {
      process.on(signal, async () => {
        logger.info(`Received ${signal}, starting graceful shutdown`);
        try {
          await fastify.close();
          logger.info('Server closed successfully');
          process.exit(0);
        } catch (error) {
          logger.error('Error during graceful shutdown', { error });
          process.exit(1);
        }
      });
    });

    // Start server
    const port = parseInt(process.env.SECURITY_PORT || '7009', 10);
    const host = process.env.HOST || '0.0.0.0';
    
    await fastify.listen({ port, host });
    
    logger.info(`Security service started successfully`, {
      port,
      host,
      environment: process.env.NODE_ENV || 'development',
      docsUrl: `http://${host}:${port}/docs`
    });

  } catch (error) {
    logger.error('Failed to start security service', { error });
    process.exit(1);
  }
};

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', { error });
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection', { reason, promise });
  process.exit(1);
});

start();