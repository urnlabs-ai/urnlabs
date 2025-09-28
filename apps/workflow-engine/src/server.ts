/**
 * Workflow Engine Server
 * Main server application for the workflow engine service
 */

import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import websocket from '@fastify/websocket';
import { WorkflowEngine, WorkflowEngineConfig } from '@/core/workflow-engine.js';
import { AgentExecutorService } from '@/services/agent-executor.js';
import { VersioningEngine } from '@/core/versioning-engine.js';
import { WorkflowController } from '@/controllers/workflow-controller.js';
import pino from 'pino';

/**
 * Server configuration
 */
interface ServerConfig {
  port: number;
  host: string;
  logger: {
    level: string;
    prettyPrint: boolean;
  };
  cors: {
    origin: string | string[];
    credentials: boolean;
  };
  swagger: {
    routePrefix: string;
    exposeRoute: boolean;
  };
  workflow: WorkflowEngineConfig;
  agentRegistry: {
    baseUrl: string;
    timeout: number;
    retries: number;
    apiKey?: string;
  };
}

/**
 * Default server configuration
 */
const defaultConfig: ServerConfig = {
  port: parseInt(process.env.PORT || '7005'),
  host: process.env.HOST || '0.0.0.0',
  logger: {
    level: process.env.LOG_LEVEL || 'info',
    prettyPrint: process.env.NODE_ENV !== 'production'
  },
  cors: {
    origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:3000'],
    credentials: true
  },
  swagger: {
    routePrefix: '/docs',
    exposeRoute: process.env.NODE_ENV !== 'production'
  },
  workflow: {
    redis: {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
      db: parseInt(process.env.REDIS_DB || '0')
    },
    concurrency: {
      maxParallelSteps: parseInt(process.env.MAX_PARALLEL_STEPS || '10'),
      maxParallelWorkflows: parseInt(process.env.MAX_PARALLEL_WORKFLOWS || '5'),
      stepTimeout: parseInt(process.env.STEP_TIMEOUT || '300000') // 5 minutes
    },
    monitoring: {
      enableMetrics: process.env.ENABLE_METRICS === 'true',
      enableLogs: process.env.ENABLE_LOGS !== 'false',
      logLevel: (process.env.LOG_LEVEL || 'info') as 'debug' | 'info' | 'warn' | 'error'
    },
    agents: {
      registryUrl: process.env.AGENT_REGISTRY_URL || 'http://localhost:7003',
      defaultTimeout: parseInt(process.env.AGENT_TIMEOUT || '30000')
    }
  },
  agentRegistry: {
    baseUrl: process.env.AGENT_REGISTRY_URL || 'http://localhost:7003',
    timeout: parseInt(process.env.AGENT_TIMEOUT || '30000'),
    retries: parseInt(process.env.AGENT_RETRIES || '3'),
    apiKey: process.env.AGENT_REGISTRY_API_KEY
  }
};

/**
 * Workflow Engine Server
 */
export class WorkflowEngineServer {
  private fastify: FastifyInstance;
  private config: ServerConfig;
  private workflowEngine: WorkflowEngine;
  private versioningEngine: VersioningEngine;
  private agentExecutor: AgentExecutorService;
  private workflowController: WorkflowController;

  constructor(config: Partial<ServerConfig> = {}) {
    this.config = { ...defaultConfig, ...config };
    
    // Initialize Fastify
    this.fastify = Fastify({
      logger: pino({
        level: this.config.logger.level,
        transport: this.config.logger.prettyPrint ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'HH:MM:ss Z',
            ignore: 'pid,hostname'
          }
        } : undefined
      })
    });

    // Initialize services
    this.initializeServices();
  }

  /**
   * Initialize all services
   */
  private initializeServices(): void {
    // Initialize agent executor
    this.agentExecutor = new AgentExecutorService(this.config.agentRegistry);

    // Initialize versioning engine
    this.versioningEngine = new VersioningEngine();

    // Initialize workflow engine
    this.workflowEngine = new WorkflowEngine(
      this.config.workflow,
      this.agentExecutor
    );

    // Initialize controller
    this.workflowController = new WorkflowController(
      this.workflowEngine,
      this.versioningEngine
    );
  }

  /**
   * Start the server
   */
  public async start(): Promise<void> {
    try {
      // Register plugins
      await this.registerPlugins();

      // Register routes
      await this.registerRoutes();

      // Start server
      await this.fastify.listen({
        port: this.config.port,
        host: this.config.host
      });

      this.fastify.log.info(
        `Workflow Engine Server started on ${this.config.host}:${this.config.port}`
      );

      // Set up graceful shutdown
      this.setupGracefulShutdown();

    } catch (error) {
      this.fastify.log.error('Failed to start server:', error);
      process.exit(1);
    }
  }

  /**
   * Register Fastify plugins
   */
  private async registerPlugins(): Promise<void> {
    // CORS
    await this.fastify.register(cors, this.config.cors);

    // Security headers
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

    // WebSocket support
    await this.fastify.register(websocket);

    // Swagger documentation
    if (this.config.swagger.exposeRoute) {
      await this.fastify.register(swagger, {
        swagger: {
          info: {
            title: 'Workflow Engine API',
            description: 'Production-ready AI workflow orchestration engine',
            version: '1.0.0'
          },
          host: `${this.config.host}:${this.config.port}`,
          schemes: ['http', 'https'],
          consumes: ['application/json'],
          produces: ['application/json'],
          tags: [
            { name: 'workflows', description: 'Workflow management' },
            { name: 'executions', description: 'Workflow execution' },
            { name: 'versions', description: 'Version management' },
            { name: 'templates', description: 'Workflow templates' },
            { name: 'health', description: 'Health and monitoring' }
          ]
        }
      });

      await this.fastify.register(swaggerUi, {
        routePrefix: this.config.swagger.routePrefix,
        uiConfig: {
          docExpansion: 'list',
          deepLinking: false
        }
      });
    }
  }

  /**
   * Register API routes
   */
  private async registerRoutes(): Promise<void> {
    // Health check route (outside versioned API)
    this.fastify.get('/health', async (request, reply) => {
      return {
        status: 'ok',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        uptime: process.uptime()
      };
    });

    // API versioning
    this.fastify.register(async (fastify) => {
      fastify.addHook('preHandler', async (request, reply) => {
        // Add request ID for tracing
        request.headers['x-request-id'] = request.headers['x-request-id'] || 
          `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      });

      // Register workflow controller routes
      await this.workflowController.registerRoutes(fastify);
    }, { prefix: '/api/v1' });

    // Redirect root to documentation
    this.fastify.get('/', async (request, reply) => {
      return reply.redirect('/docs');
    });
  }

  /**
   * Setup graceful shutdown
   */
  private setupGracefulShutdown(): void {
    const gracefulShutdown = async (signal: string) => {
      this.fastify.log.info(`Received ${signal}, starting graceful shutdown`);
      
      try {
        // Stop accepting new requests
        await this.fastify.close();
        
        // Shutdown workflow engine
        await this.workflowEngine.shutdown();
        
        this.fastify.log.info('Graceful shutdown completed');
        process.exit(0);
      } catch (error) {
        this.fastify.log.error('Error during shutdown:', error);
        process.exit(1);
      }
    };

    // Handle shutdown signals
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      this.fastify.log.fatal('Uncaught exception:', error);
      process.exit(1);
    });

    process.on('unhandledRejection', (reason, promise) => {
      this.fastify.log.fatal('Unhandled rejection at:', promise, 'reason:', reason);
      process.exit(1);
    });
  }

  /**
   * Stop the server
   */
  public async stop(): Promise<void> {
    await this.fastify.close();
    await this.workflowEngine.shutdown();
  }

  /**
   * Get Fastify instance (for testing)
   */
  public getFastify(): FastifyInstance {
    return this.fastify;
  }

  /**
   * Get workflow engine instance
   */
  public getWorkflowEngine(): WorkflowEngine {
    return this.workflowEngine;
  }
}

/**
 * Start server if this file is run directly
 */
if (import.meta.url === `file://${process.argv[1]}`) {
  const server = new WorkflowEngineServer();
  await server.start();
}

export default WorkflowEngineServer;