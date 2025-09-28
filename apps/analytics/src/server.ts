import Fastify from 'fastify';
import cors from '@fastify/cors';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { PrismaClient } from '@prisma/client';
import { Redis } from 'ioredis';
import { Logger } from './utils/logger.js';
import { MetricsCollector } from './services/metrics-collector.js';
import { ROICalculator } from './services/roi-calculator.js';
import { DashboardService } from './services/dashboard-service.js';
import { ReportingService } from './services/reporting-service.js';
import { IntelligenceService } from './services/intelligence-service.js';

// Import routes
import metricsRoutes from './routes/metrics.js';
import dashboardRoutes from './routes/dashboard.js';
import roiRoutes from './routes/roi.js';
import reportsRoutes from './routes/reports.js';
import intelligenceRoutes from './routes/intelligence.js';

declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient;
    redis: Redis;
    logger: Logger;
    metricsCollector: MetricsCollector;
    roiCalculator: ROICalculator;
    dashboardService: DashboardService;
    reportingService: ReportingService;
    intelligenceService: IntelligenceService;
  }
}

async function buildServer() {
  const fastify = Fastify({
    logger: {
      level: process.env.LOG_LEVEL || 'info'
    }
  });

  // Initialize database and Redis connections
  const prisma = new PrismaClient({
    log: ['query', 'info', 'warn', 'error']
  });

  const redis = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    retryDelayOnFailover: 100,
    enableReadyCheck: false,
    maxRetriesPerRequest: 3
  });

  // Initialize logger
  const logger = new Logger('analytics');

  // Initialize services
  const metricsCollector = new MetricsCollector(redis, prisma, logger);
  
  const roiConfig = {
    average_hourly_rate_cents: parseInt(process.env.AVERAGE_HOURLY_RATE_CENTS || '5000'), // $50/hour
    senior_hourly_rate_cents: parseInt(process.env.SENIOR_HOURLY_RATE_CENTS || '8000'), // $80/hour
    junior_hourly_rate_cents: parseInt(process.env.JUNIOR_HOURLY_RATE_CENTS || '3000'), // $30/hour
    server_cost_per_hour_cents: parseInt(process.env.SERVER_COST_PER_HOUR_CENTS || '10'), // $0.10/hour
    ai_api_cost_multiplier: parseFloat(process.env.AI_API_COST_MULTIPLIER || '1.2'),
    discount_rate: parseFloat(process.env.DISCOUNT_RATE || '0.1'), // 10%
    tax_rate: parseFloat(process.env.TAX_RATE || '0.25') // 25%
  };
  
  const roiCalculator = new ROICalculator(prisma, redis, logger, roiConfig);
  const dashboardService = new DashboardService(redis, prisma, logger, metricsCollector);
  
  const emailConfig = {
    host: process.env.SMTP_HOST || 'localhost',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  };
  
  const reportingService = new ReportingService(
    prisma,
    redis,
    logger,
    dashboardService,
    roiCalculator,
    metricsCollector,
    emailConfig
  );
  
  const intelligenceService = new IntelligenceService(
    prisma,
    redis,
    logger,
    metricsCollector,
    roiCalculator
  );

  // Register services with Fastify
  fastify.decorate('prisma', prisma);
  fastify.decorate('redis', redis);
  fastify.decorate('logger', logger);
  fastify.decorate('metricsCollector', metricsCollector);
  fastify.decorate('roiCalculator', roiCalculator);
  fastify.decorate('dashboardService', dashboardService);
  fastify.decorate('reportingService', reportingService);
  fastify.decorate('intelligenceService', intelligenceService);

  // Register CORS
  await fastify.register(cors, {
    origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
    credentials: true
  });

  // Register Swagger
  await fastify.register(swagger, {
    swagger: {
      info: {
        title: 'Urnlabs Analytics API',
        description: 'Production-ready analytics and ROI measurement service',
        version: '1.0.0',
        contact: {
          name: 'Urnlabs Team',
          email: 'team@urnlabs.ai'
        }
      },
      host: process.env.API_HOST || 'localhost:7003',
      schemes: ['http', 'https'],
      consumes: ['application/json'],
      produces: ['application/json'],
      tags: [
        { name: 'metrics', description: 'Performance and business metrics' },
        { name: 'dashboard', description: 'Dashboard widgets and visualizations' },
        { name: 'roi', description: 'ROI calculations and cost analysis' },
        { name: 'reports', description: 'Automated reporting system' },
        { name: 'intelligence', description: 'Business intelligence and insights' }
      ]
    }
  });

  await fastify.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: false
    }
  });

  // Health check endpoint
  fastify.get('/health', async (request, reply) => {
    try {
      // Check database connection
      await prisma.$queryRaw`SELECT 1`;
      
      // Check Redis connection
      await redis.ping();
      
      return {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        services: {
          database: 'connected',
          redis: 'connected',
          metrics_collector: 'running',
          roi_calculator: 'running',
          dashboard_service: 'running',
          reporting_service: 'running',
          intelligence_service: 'running'
        }
      };
    } catch (error) {
      fastify.log.error('Health check failed', error);
      reply.status(503);
      return {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: 'Service dependency failure'
      };
    }
  });

  // Register API routes
  await fastify.register(metricsRoutes, { prefix: '/api/v1' });
  await fastify.register(dashboardRoutes, { prefix: '/api/v1' });
  await fastify.register(roiRoutes, { prefix: '/api/v1' });
  await fastify.register(reportsRoutes, { prefix: '/api/v1' });
  await fastify.register(intelligenceRoutes, { prefix: '/api/v1' });

  // Global error handler
  fastify.setErrorHandler(async (error, request, reply) => {
    fastify.log.error('Unhandled error', {
      error: error.message,
      stack: error.stack,
      request: {
        method: request.method,
        url: request.url,
        headers: request.headers
      }
    });

    if (error.validation) {
      reply.status(400);
      return {
        error: 'Validation Error',
        message: error.message,
        details: error.validation
      };
    }

    reply.status(500);
    return {
      error: 'Internal Server Error',
      message: process.env.NODE_ENV === 'production' 
        ? 'An unexpected error occurred' 
        : error.message
    };
  });

  // Graceful shutdown handling
  const gracefulShutdown = async (signal: string) => {
    fastify.log.info(`Received ${signal}, shutting down gracefully`);
    
    try {
      // Close services
      metricsCollector.destroy();
      reportingService.destroy();
      
      // Close database connections
      await prisma.$disconnect();
      await redis.quit();
      
      // Close Fastify
      await fastify.close();
      
      fastify.log.info('Graceful shutdown completed');
      process.exit(0);
    } catch (error) {
      fastify.log.error('Error during shutdown', error);
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  return fastify;
}

async function start() {
  try {
    const fastify = await buildServer();
    
    const port = parseInt(process.env.PORT || '7003');
    const host = process.env.HOST || '0.0.0.0';
    
    await fastify.listen({ port, host });
    
    fastify.log.info(`🚀 Analytics service running on http://${host}:${port}`);
    fastify.log.info(`📊 API documentation available at http://${host}:${port}/docs`);
    fastify.log.info(`❤️  Health check available at http://${host}:${port}/health`);
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Start server if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  start();
}

export { buildServer, start };