import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import websocket from '@fastify/websocket';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { PrismaClient } from '@prisma/client';
import { Redis } from 'ioredis';
import pino from 'pino';

// Services
import { AgentRegistryService } from './services/agent-registry.js';
import { HealthMonitorService } from './services/health-monitor.js';
import { MarketplaceService } from './services/marketplace.js';
import { DockerOrchestratorService } from './services/docker-orchestrator.js';

// Routes
import { agentRoutes } from './routes/agents.js';
import { marketplaceRoutes } from './routes/marketplace.js';
import { healthRoutes } from './routes/health.js';
import { deploymentRoutes } from './routes/deployments.js';

// Types
import { HealthCheckResult } from './types/index.js';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true
    }
  }
});

class AgentRegistryServer {
  private fastify: ReturnType<typeof Fastify>;
  private prisma: PrismaClient;
  private redis: Redis;
  private agentRegistryService: AgentRegistryService;
  private healthMonitorService: HealthMonitorService;
  private marketplaceService: MarketplaceService;
  private dockerOrchestratorService: DockerOrchestratorService;

  constructor() {
    this.fastify = Fastify({ 
      logger,
      requestIdHeader: 'x-request-id',
      trustProxy: true
    });

    // Initialize database connections
    this.prisma = new PrismaClient({
      log: ['error', 'warn'],
      errorFormat: 'pretty'
    });

    this.redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
      retryDelayOnFailover: 100,
      maxRetriesPerRequest: 3,
      lazyConnect: true
    });

    // Initialize services
    this.agentRegistryService = new AgentRegistryService(this.prisma, this.redis);
    this.healthMonitorService = new HealthMonitorService(this.prisma, this.redis);
    this.marketplaceService = new MarketplaceService(this.prisma, this.redis);
    this.dockerOrchestratorService = new DockerOrchestratorService(this.redis);
  }

  async start(): Promise<void> {
    try {
      // Register plugins
      await this.registerPlugins();

      // Setup routes
      await this.setupRoutes();

      // Connect to databases
      await this.connectDatabases();

      // Start services
      await this.startServices();

      // Start server
      const port = parseInt(process.env.PORT || '7003');
      const host = process.env.HOST || '0.0.0.0';

      await this.fastify.listen({ port, host });
      
      logger.info(`Agent Registry server started on ${host}:${port}`);
      logger.info(`Swagger documentation available at http://${host}:${port}/docs`);

    } catch (error) {
      logger.error('Failed to start server:', error);
      await this.shutdown();
      process.exit(1);
    }
  }

  async shutdown(): Promise<void> {
    try {
      logger.info('Shutting down Agent Registry server...');

      // Stop services
      await this.stopServices();

      // Close database connections
      await this.disconnectDatabases();

      // Close Fastify server
      await this.fastify.close();

      logger.info('Agent Registry server shutdown complete');
    } catch (error) {
      logger.error('Error during shutdown:', error);
    }
  }

  private async registerPlugins(): Promise<void> {
    // Security plugins
    await this.fastify.register(helmet, {
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", "data:", "https:"]
        }
      }
    });

    await this.fastify.register(cors, {
      origin: process.env.NODE_ENV === 'production' 
        ? [process.env.FRONTEND_URL || 'https://urnlabs.ai']
        : true,
      credentials: true
    });

    // Rate limiting
    await this.fastify.register(rateLimit, {
      max: 100,
      timeWindow: '1 minute'
    });

    // JWT authentication
    await this.fastify.register(jwt, {
      secret: process.env.JWT_SECRET || 'super-secret-jwt-key-change-in-production'
    });

    // WebSocket support
    await this.fastify.register(websocket);

    // API documentation
    await this.fastify.register(swagger, {
      swagger: {
        info: {
          title: 'Urnlabs Agent Registry API',
          description: 'AI Agent Registry and Discovery System',
          version: '1.0.0'
        },
        host: process.env.API_HOST || 'localhost:7003',
        schemes: ['http', 'https'],
        consumes: ['application/json'],
        produces: ['application/json'],
        tags: [
          { name: 'agents', description: 'Agent registration and discovery' },
          { name: 'marketplace', description: 'Agent marketplace operations' },
          { name: 'deployments', description: 'Agent deployment management' },
          { name: 'health', description: 'Health monitoring and status' }
        ]
      }
    });

    await this.fastify.register(swaggerUi, {
      routePrefix: '/docs',
      uiConfig: {
        docExpansion: 'list',
        deepLinking: false
      }
    });
  }

  private async setupRoutes(): Promise<void> {
    // Health check endpoint
    this.fastify.get('/health', async (request, reply) => {
      const healthResult = await this.performHealthCheck();
      
      reply.code(healthResult.status === 'healthy' ? 200 : 503);
      return healthResult;
    });

    // API routes
    await this.fastify.register(agentRoutes, { 
      prefix: '/api/v1/agents',
      agentRegistryService: this.agentRegistryService,
      healthMonitorService: this.healthMonitorService
    });

    await this.fastify.register(marketplaceRoutes, { 
      prefix: '/api/v1/marketplace',
      marketplaceService: this.marketplaceService
    });

    await this.fastify.register(deploymentRoutes, { 
      prefix: '/api/v1/deployments',
      dockerOrchestratorService: this.dockerOrchestratorService,
      marketplaceService: this.marketplaceService
    });

    await this.fastify.register(healthRoutes, { 
      prefix: '/api/v1/health',
      healthMonitorService: this.healthMonitorService
    });

    // WebSocket endpoint for real-time updates
    this.fastify.register(async (fastify) => {
      fastify.get('/ws', { websocket: true }, (connection, req) => {
        logger.info('New WebSocket connection established');

        connection.socket.on('message', (message) => {
          logger.info('WebSocket message received:', message.toString());
        });

        connection.socket.on('close', () => {
          logger.info('WebSocket connection closed');
        });

        // Send welcome message
        connection.socket.send(JSON.stringify({
          type: 'welcome',
          data: { message: 'Connected to Agent Registry WebSocket' },
          timestamp: new Date()
        }));
      });
    });

    // Root endpoint
    this.fastify.get('/', async (request, reply) => {
      return {
        service: 'Urnlabs Agent Registry',
        version: '1.0.0',
        status: 'running',
        endpoints: {
          health: '/health',
          docs: '/docs',
          api: '/api/v1',
          websocket: '/ws'
        }
      };
    });
  }

  private async connectDatabases(): Promise<void> {
    try {
      // Test Prisma connection
      await this.prisma.$connect();
      logger.info('Connected to PostgreSQL database');

      // Test Redis connection
      await this.redis.connect();
      logger.info('Connected to Redis cache');

    } catch (error) {
      logger.error('Database connection failed:', error);
      throw error;
    }
  }

  private async disconnectDatabases(): Promise<void> {
    try {
      await this.prisma.$disconnect();
      logger.info('Disconnected from PostgreSQL');

      await this.redis.disconnect();
      logger.info('Disconnected from Redis');

    } catch (error) {
      logger.error('Error disconnecting from databases:', error);
    }
  }

  private async startServices(): Promise<void> {
    try {
      // Start health monitoring service
      await this.healthMonitorService.start(8081);
      logger.info('Health monitoring service started');

      // Start Docker orchestrator
      await this.dockerOrchestratorService.start();
      logger.info('Docker orchestrator service started');

      // Setup service event listeners
      this.setupServiceEventListeners();

    } catch (error) {
      logger.error('Failed to start services:', error);
      throw error;
    }
  }

  private async stopServices(): Promise<void> {
    try {
      await this.healthMonitorService.stop();
      logger.info('Health monitoring service stopped');

      await this.dockerOrchestratorService.stop();
      logger.info('Docker orchestrator service stopped');

    } catch (error) {
      logger.error('Error stopping services:', error);
    }
  }

  private setupServiceEventListeners(): void {
    // Health monitoring events
    this.healthMonitorService.on('agentHealthUpdate', (data) => {
      logger.debug('Agent health update:', data);
      // Broadcast to WebSocket clients if needed
    });

    // Docker orchestrator events
    this.dockerOrchestratorService.on('deploymentStarted', (data) => {
      logger.info('Deployment started:', data);
    });

    this.dockerOrchestratorService.on('deploymentStopped', (data) => {
      logger.info('Deployment stopped:', data);
    });

    this.dockerOrchestratorService.on('deploymentFailed', (data) => {
      logger.error('Deployment failed:', data);
    });

    this.dockerOrchestratorService.on('containerError', (data) => {
      logger.error('Container error:', data);
    });
  }

  private async performHealthCheck(): Promise<HealthCheckResult> {
    const result: HealthCheckResult = {
      status: 'healthy',
      timestamp: new Date(),
      details: {},
      version: '1.0.0',
      uptime: process.uptime()
    };

    try {
      // Check database connection
      await this.prisma.$queryRaw`SELECT 1`;
      result.details.database = { status: 'connected' };
    } catch (error) {
      result.status = 'unhealthy';
      result.details.database = { status: 'disconnected' };
    }

    try {
      // Check Redis connection
      const startTime = Date.now();
      await this.redis.ping();
      const latency = Date.now() - startTime;
      result.details.redis = { status: 'connected', latency };
    } catch (error) {
      result.status = 'unhealthy';
      result.details.redis = { status: 'disconnected' };
    }

    try {
      // Check Docker connection
      // This would require Docker service to be injected properly
      result.details.docker = { status: 'available' };
    } catch (error) {
      result.status = 'degraded';
      result.details.docker = { status: 'unavailable' };
    }

    // Get agent statistics
    try {
      // This would query the actual agent counts
      result.details.agents = {
        total: 0,
        healthy: 0,
        unhealthy: 0
      };
    } catch (error) {
      logger.error('Error getting agent statistics:', error);
    }

    return result;
  }
}

// Start server if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const server = new AgentRegistryServer();

  // Graceful shutdown handling
  process.on('SIGTERM', async () => {
    logger.info('SIGTERM received, shutting down gracefully');
    await server.shutdown();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    logger.info('SIGINT received, shutting down gracefully');
    await server.shutdown();
    process.exit(0);
  });

  process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception:', error);
    process.exit(1);
  });

  process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled rejection at:', promise, 'reason:', reason);
    process.exit(1);
  });

  // Start the server
  server.start().catch((error) => {
    logger.error('Failed to start server:', error);
    process.exit(1);
  });
}

export { AgentRegistryServer };