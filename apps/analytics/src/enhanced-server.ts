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

// Import new analytics services
import { ClickHouseService } from './streaming/clickhouse-service.js';
import { KafkaProducerService } from './streaming/kafka-producer.js';
import { KafkaConsumerService } from './streaming/kafka-consumer.js';
import { RealTimeDashboardService } from './dashboard/realtime-dashboard.js';
import { PredictiveAnalyticsService } from './ml/predictive-analytics.js';
import { ReportEngineService } from './reporting/report-engine.js';

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
    clickHouse: ClickHouseService;
    kafkaProducer: KafkaProducerService;
    kafkaConsumer: KafkaConsumerService;
    realTimeDashboard: RealTimeDashboardService;
    predictiveAnalytics: PredictiveAnalyticsService;
    reportEngine: ReportEngineService;
  }
}

async function buildEnhancedServer() {
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
  const logger = new Logger('analytics-enhanced');

  // Initialize ClickHouse connection
  const clickHouse = new ClickHouseService(logger);
  await clickHouse.connect();

  // Initialize Kafka services
  const kafkaProducer = new KafkaProducerService(logger);
  await kafkaProducer.connect();

  const kafkaConsumer = new KafkaConsumerService(logger, clickHouse);

  // Initialize predictive analytics
  const predictiveAnalytics = new PredictiveAnalyticsService(redis, clickHouse, logger);

  // Initialize enhanced metrics collector with Kafka streaming
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

  const reportEngine = new ReportEngineService(
    redis,
    clickHouse,
    predictiveAnalytics,
    logger,
    emailConfig
  );
  
  const intelligenceService = new IntelligenceService(
    prisma,
    redis,
    logger,
    metricsCollector,
    roiCalculator
  );

  // Initialize real-time dashboard with WebSocket support
  const realTimeDashboard = new RealTimeDashboardService(
    redis,
    clickHouse,
    kafkaProducer,
    logger
  );

  // Start Kafka consumer for real-time data processing
  await kafkaConsumer.start();

  // Initialize real-time dashboard WebSocket server
  const wsPort = parseInt(process.env.WEBSOCKET_PORT || '8080');
  realTimeDashboard.initializeWebSocketServer(wsPort);

  // Register all services with Fastify
  fastify.decorate('prisma', prisma);
  fastify.decorate('redis', redis);
  fastify.decorate('logger', logger);
  fastify.decorate('metricsCollector', metricsCollector);
  fastify.decorate('roiCalculator', roiCalculator);
  fastify.decorate('dashboardService', dashboardService);
  fastify.decorate('reportingService', reportingService);
  fastify.decorate('intelligenceService', intelligenceService);
  fastify.decorate('clickHouse', clickHouse);
  fastify.decorate('kafkaProducer', kafkaProducer);
  fastify.decorate('kafkaConsumer', kafkaConsumer);
  fastify.decorate('realTimeDashboard', realTimeDashboard);
  fastify.decorate('predictiveAnalytics', predictiveAnalytics);
  fastify.decorate('reportEngine', reportEngine);

  // Register CORS
  await fastify.register(cors, {
    origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
    credentials: true
  });

  // Register Swagger with enhanced documentation
  await fastify.register(swagger, {
    swagger: {
      info: {
        title: 'Urnlabs Enhanced Analytics API',
        description: 'Production-ready real-time analytics platform with ClickHouse, Kafka, ML predictions, and custom reporting',
        version: '2.0.0',
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
        { name: 'metrics', description: 'Performance and business metrics with real-time streaming' },
        { name: 'dashboard', description: 'Real-time dashboard widgets and visualizations' },
        { name: 'roi', description: 'ROI calculations and cost analysis' },
        { name: 'reports', description: 'Automated reporting system with custom templates' },
        { name: 'intelligence', description: 'Business intelligence and predictive insights' },
        { name: 'streaming', description: 'Real-time data streaming and event processing' },
        { name: 'ml', description: 'Machine learning predictions and anomaly detection' }
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

  // Enhanced health check endpoint
  fastify.get('/health', async (request, reply) => {
    try {
      // Check all service connections
      await prisma.$queryRaw`SELECT 1`;
      await redis.ping();
      const clickHouseHealthy = await clickHouse.healthCheck();
      const kafkaProducerHealthy = await kafkaProducer.healthCheck();
      const kafkaConsumerHealthy = await kafkaConsumer.healthCheck();

      const allHealthy = clickHouseHealthy && kafkaProducerHealthy && kafkaConsumerHealthy;

      return {
        status: allHealthy ? 'healthy' : 'degraded',
        timestamp: new Date().toISOString(),
        version: '2.0.0',
        services: {
          database: 'connected',
          redis: 'connected',
          clickhouse: clickHouseHealthy ? 'connected' : 'disconnected',
          kafka_producer: kafkaProducerHealthy ? 'connected' : 'disconnected',
          kafka_consumer: kafkaConsumerHealthy ? 'running' : 'stopped',
          metrics_collector: 'running',
          roi_calculator: 'running',
          dashboard_service: 'running',
          reporting_service: 'running',
          intelligence_service: 'running',
          realtime_dashboard: 'running',
          predictive_analytics: 'running',
          report_engine: 'running'
        },
        websocket: {
          port: wsPort,
          connected_clients: realTimeDashboard.getStats().connectedClients
        },
        ml_models: predictiveAnalytics.getStats(),
        kafka_metrics: {
          producer: kafkaProducer.getMetrics(),
          consumer: kafkaConsumer.getMetrics()
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

  // Add new enhanced API endpoints
  
  // Real-time metrics endpoint
  fastify.get('/api/v1/realtime/metrics', async (request, reply) => {
    try {
      const cached = await redis.get('realtime_metrics');
      if (cached) {
        return JSON.parse(cached);
      }
      
      reply.status(404);
      return { error: 'No real-time metrics available' };
    } catch (error) {
      reply.status(500);
      return { error: 'Failed to fetch real-time metrics' };
    }
  });

  // Predictive analytics endpoints
  fastify.get('/api/v1/predictions/:modelId', async (request, reply) => {
    try {
      const { modelId } = request.params as { modelId: string };
      const cached = await redis.get(`predictions:${modelId}`);
      
      if (cached) {
        return JSON.parse(cached);
      }
      
      reply.status(404);
      return { error: 'Predictions not found' };
    } catch (error) {
      reply.status(500);
      return { error: 'Failed to fetch predictions' };
    }
  });

  fastify.get('/api/v1/models', async (request, reply) => {
    try {
      const models = predictiveAnalytics.getModels();
      return { models, stats: predictiveAnalytics.getStats() };
    } catch (error) {
      reply.status(500);
      return { error: 'Failed to fetch models' };
    }
  });

  // Anomaly detection endpoint
  fastify.get('/api/v1/anomalies', async (request, reply) => {
    try {
      const cached = await redis.get('anomalies:recent');
      if (cached) {
        return JSON.parse(cached);
      }
      
      return { anomalies: [] };
    } catch (error) {
      reply.status(500);
      return { error: 'Failed to fetch anomalies' };
    }
  });

  // Report generation endpoint
  fastify.post('/api/v1/reports/generate', async (request, reply) => {
    try {
      const { templateId, filters } = request.body as { templateId: string; filters?: Record<string, any> };
      const report = await reportEngine.generateReport(templateId, filters);
      return report;
    } catch (error) {
      reply.status(500);
      return { error: 'Failed to generate report' };
    }
  });

  // Dashboard export endpoint
  fastify.post('/api/v1/dashboard/export', async (request, reply) => {
    try {
      const config = request.body as any;
      const result = await reportEngine.generateDashboardReport(config);
      return result;
    } catch (error) {
      reply.status(500);
      return { error: 'Failed to export dashboard' };
    }
  });

  // ClickHouse statistics endpoint
  fastify.get('/api/v1/clickhouse/stats', async (request, reply) => {
    try {
      const stats = await clickHouse.getStats();
      return { stats };
    } catch (error) {
      reply.status(500);
      return { error: 'Failed to fetch ClickHouse statistics' };
    }
  });

  // Register existing API routes
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

  // Enhanced graceful shutdown handling
  const gracefulShutdown = async (signal: string) => {
    fastify.log.info(`Received ${signal}, shutting down gracefully`);
    
    try {
      // Close analytics services
      await kafkaConsumer.stop();
      await kafkaProducer.disconnect();
      await clickHouse.disconnect();
      await realTimeDashboard.destroy();
      predictiveAnalytics.destroy();
      reportEngine.destroy();
      
      // Close original services
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

async function startEnhanced() {
  try {
    const fastify = await buildEnhancedServer();
    
    const port = parseInt(process.env.PORT || '7003');
    const host = process.env.HOST || '0.0.0.0';
    const wsPort = parseInt(process.env.WEBSOCKET_PORT || '8080');
    
    await fastify.listen({ port, host });
    
    fastify.log.info(`🚀 Enhanced Analytics service running on http://${host}:${port}`);
    fastify.log.info(`📊 API documentation available at http://${host}:${port}/docs`);
    fastify.log.info(`❤️  Health check available at http://${host}:${port}/health`);
    fastify.log.info(`🔄 Real-time dashboard WebSocket on ws://${host}:${wsPort}`);
    fastify.log.info(`📈 ClickHouse analytics warehouse connected`);
    fastify.log.info(`🚰 Kafka streaming pipeline active`);
    fastify.log.info(`🤖 Predictive analytics models loaded`);
    fastify.log.info(`📋 Custom reporting engine ready`);
  } catch (error) {
    console.error('Failed to start enhanced analytics server:', error);
    process.exit(1);
  }
}

// Start server if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  startEnhanced();
}

export { buildEnhancedServer, startEnhanced };