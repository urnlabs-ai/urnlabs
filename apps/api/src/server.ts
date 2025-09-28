import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import jwt from '@fastify/jwt';
import websocket from '@fastify/websocket';

import { config } from '@/lib/config.js';
import { logger } from '@/lib/logger.js';
import { errorHandler } from '@/middleware/error-handler.js';
import { authMiddleware } from '@/middleware/auth.js';
import { requestLogger } from '@/middleware/request-logger.js';
import { healthRoutes } from '@/routes/health.js';
import { execSync } from 'node:child_process';
import { getPrisma, disconnectPrisma, connectWithRetry } from '@/lib/database.js';
import { authRoutes } from '@/routes/auth.js';
import { mfaRoutes } from '@/routes/mfa.js';
import { ssoRoutes } from '@/routes/sso.js';
import { usersRoutes } from '@/routes/users.js';
import { agentsRoutes } from '@/routes/agents.js';
import { workflowsRoutes } from '@/routes/workflows.js';
import { analyticsRoutes } from '@/routes/analytics.js';
import { complianceRoutes } from '@/routes/compliance.js';
import rbacRoutes from '@/routes/rbac.js';
import auditAggregationRoutes from '@/routes/audit-aggregation.js';
import governanceRoutes from '@/routes/governance.js';
import policyTemplatesRoutes from '@/routes/policy-templates.js';
import { ViolationDetectionService } from '@/services/violation-detection-service.js';
import { ComplianceWebSocketService } from '@/services/websocket-service.js';
import { PrismaPolicyLoader } from '@/services/policy-loader.js';
import { PolicyEngineService } from '@/services/policy-engine-service.js';
import { connectRedis, disconnectRedis } from '@/lib/redis.js';
import securityMiddleware from '@/middleware/security.js';
import { getSessionService } from '@/services/session-service.js';
import { getRateLimitingService } from '@/services/rate-limiting-service.js';

declare module 'fastify' {
  interface FastifyInstance {
    prisma: ReturnType<typeof getPrisma> extends infer T ? (T extends object ? T : any) : any;
    violationService: ViolationDetectionService;
    websocketService: ComplianceWebSocketService;
    sessionService: ReturnType<typeof getSessionService>;
    rateLimitingService: ReturnType<typeof getRateLimitingService>;
  }
}

async function buildServer(): Promise<FastifyInstance> {
  const server = Fastify({
    logger: logger,
    requestIdLogLabel: 'request-id',
    requestIdHeader: 'x-request-id',
    genReqId: () => crypto.randomUUID(),
  });

  // Database connection (singleton)
  const prisma = getPrisma();
  server.decorate('prisma', prisma as any);

  // Initialize compliance services
  const policyLoader = new PrismaPolicyLoader(prisma);
  const policyEngine = new PolicyEngineService(prisma, {});
  const violationService = new ViolationDetectionService(prisma, policyEngine);
  const websocketService = new ComplianceWebSocketService(violationService);

  server.decorate('violationService', violationService);
  server.decorate('websocketService', websocketService);

  // Initialize security services
  const sessionService = getSessionService();
  const rateLimitingService = getRateLimitingService();

  server.decorate('sessionService', sessionService);
  server.decorate('rateLimitingService', rateLimitingService);

  // Graceful shutdown
  server.addHook('onClose', async () => {
    websocketService.shutdown();
    await disconnectPrisma();
    await disconnectRedis();
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

  // WebSocket support for real-time monitoring
  await server.register(websocket, {
    options: {
      maxPayload: 1048576, // 1MB
      verifyClient: function (info) {
        // Basic WebSocket connection validation
        return true;
      }
    }
  });

  // Comprehensive security middleware (CSRF, headers, content validation, etc.)
  await server.register(securityMiddleware, {
    enableCSRF: true,
    enableSecurityHeaders: true,
    enableContentTypeValidation: true,
    enableRateLimitBypass: true,
  });

  // Custom rate limiting middleware (integrates with authentication)
  server.addHook('preHandler', async (request, reply) => {
    const isAllowed = await rateLimitingService.checkRateLimit(request, reply);
    if (!isAllowed) {
      // Rate limiting service handles the response
      return;
    }
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
    // Skip auth for health checks, docs, auth endpoints, and SSO auth flows
    const publicPaths = ['/health', '/docs', '/auth', '/sso/auth'];
    const isPublicPath = publicPaths.some(path => request.url.startsWith(path));
    
    if (!isPublicPath) {
      await authMiddleware(request, reply);
    }
  });

  // Routes registration
  await server.register(healthRoutes, { prefix: '/health' });
  await server.register(authRoutes, { prefix: '/auth' });
  await server.register(mfaRoutes, { prefix: '/mfa' });
  await server.register(ssoRoutes, { prefix: '/sso' });
  await server.register(usersRoutes, { prefix: '/users' });
  await server.register(agentsRoutes, { prefix: '/agents' });
  await server.register(workflowsRoutes, { prefix: '/workflows' });
  await server.register(analyticsRoutes, { prefix: '/analytics' });
  await server.register(complianceRoutes, { prefix: '/compliance' });
  await server.register(rbacRoutes, { prefix: '/rbac' });
  await server.register(auditAggregationRoutes, { prefix: '/audit' });
  await server.register(governanceRoutes, { prefix: '/governance' });
  await server.register(policyTemplatesRoutes, { prefix: '/policy-templates' });

  return server;
}

async function start() {
  try {
    const server = await buildServer();

    // Gate startup on database readiness with retries
    const attempts = Number(process.env.DEPENDENCY_RETRY_MAX_ATTEMPTS ?? 20);
    const delay = Number(process.env.DEPENDENCY_RETRY_DELAY_MS ?? 2000);
    await connectWithRetry({ attempts, delayMs: delay });

    // Connect to Redis for JWT and session management
    try {
      await connectRedis();
      logger.info('Redis connection established for JWT service');
    } catch (error) {
      logger.warn('Redis connection failed, JWT service will use fallback mode', { error });
    }

    // After DB is reachable, apply schema migrations
    try {
      execSync('pnpm exec prisma migrate deploy', { stdio: 'inherit' });
    } catch (e) {
      execSync('pnpm exec prisma db push', { stdio: 'inherit' });
    }
    
    // Use API_PORT environment variable if provided, otherwise fall back to config.PORT
    const port = process.env.API_PORT ? parseInt(process.env.API_PORT, 10) : config.PORT;
    
    await server.listen({
      port: port,
      host: config.HOST,
    });

    // Initialize WebSocket server after HTTP server is listening
    server.websocketService.initialize(server.server);

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
      websocket: `ws://${config.HOST}:${port}/ws/compliance`,
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
