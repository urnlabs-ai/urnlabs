import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import { ModelManager } from './models/model-manager.js';
import { VectorDatabaseManager } from './vector/vector-manager.js';
import { MLPipelineManager } from './pipeline/pipeline-manager.js';
import { AgentOrchestrator } from './orchestrator/agent-orchestrator.js';
import { MLOpsManager } from './monitoring/mlops-manager.js';
import { AutoMLService } from './automl/automl-service.js';
import { logger } from './lib/logger.js';
import { config } from './lib/config.js';
import { registerRoutes } from './routes/index.js';

export interface MLPlatformServer {
  modelManager: ModelManager;
  vectorManager: VectorDatabaseManager;
  pipelineManager: MLPipelineManager;
  orchestrator: AgentOrchestrator;
  mlopsManager: MLOpsManager;
  automlService: AutoMLService;
}

async function createServer(): Promise<ReturnType<typeof Fastify> & { platform: MLPlatformServer }> {
  const fastify = Fastify({
    logger: logger,
    requestTimeout: 300000, // 5 minutes for ML operations
  });

  // Register WebSocket support
  await fastify.register(websocket);

  // CORS configuration
  await fastify.register(import('@fastify/cors'), {
    origin: config.NODE_ENV === 'production' 
      ? ['https://urnlabs.ai', 'https://api.urnlabs.ai']
      : true,
    credentials: true,
  });

  // Rate limiting
  await fastify.register(import('@fastify/rate-limit'), {
    max: 1000,
    timeWindow: '1 minute',
    errorResponseBuilder: () => ({
      error: 'Rate limit exceeded. Please try again later.',
      retryAfter: 60
    })
  });

  // Request logging
  fastify.addHook('onRequest', async (request) => {
    logger.info(`Incoming request: ${request.method} ${request.url}`, {
      userAgent: request.headers['user-agent'],
      ip: request.ip,
      requestId: request.id
    });
  });

  // Initialize ML Platform Services
  logger.info('Initializing ML Platform services...');

  const modelManager = new ModelManager();
  const vectorManager = new VectorDatabaseManager();
  const pipelineManager = new MLPipelineManager(modelManager, vectorManager);
  const orchestrator = new AgentOrchestrator(modelManager, pipelineManager);
  const mlopsManager = new MLOpsManager();
  const automlService = new AutoMLService(modelManager, mlopsManager);

  // Wait for all services to initialize
  await Promise.all([
    vectorManager.initialize(),
    mlopsManager.initialize(),
    automlService.initialize()
  ]);

  const platform: MLPlatformServer = {
    modelManager,
    vectorManager,
    pipelineManager,
    orchestrator,
    mlopsManager,
    automlService
  };

  // Attach platform to fastify instance
  (fastify as any).platform = platform;

  // Register all routes
  await registerRoutes(fastify, platform);

  // Health check endpoint
  fastify.get('/health', async () => {
    const modelHealth = await modelManager.healthCheck();
    const vectorHealth = await vectorManager.healthCheck();
    const pipelineHealth = await pipelineManager.healthCheck();

    return {
      status: 'healthy',
      timestamp: new Date(),
      services: {
        models: modelHealth,
        vectors: vectorHealth,
        pipelines: pipelineHealth,
        orchestrator: true,
        mlops: true,
        automl: true
      },
      version: process.env.npm_package_version || '1.0.0'
    };
  });

  // Global error handler
  fastify.setErrorHandler(async (error, request, reply) => {
    logger.error('Request error:', {
      error: error.message,
      stack: error.stack,
      url: request.url,
      method: request.method,
      requestId: request.id
    });

    const statusCode = error.statusCode || 500;
    const message = statusCode === 500 ? 'Internal Server Error' : error.message;

    await reply.status(statusCode).send({
      error: message,
      requestId: request.id,
      timestamp: new Date()
    });
  });

  // Graceful shutdown
  const gracefulShutdown = async (signal: string) => {
    logger.info(`Received ${signal}, starting graceful shutdown...`);

    try {
      await pipelineManager.shutdown();
      await vectorManager.disconnect();
      await fastify.close();
      logger.info('Graceful shutdown completed');
      process.exit(0);
    } catch (error) {
      logger.error('Error during graceful shutdown:', error);
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  return fastify as any;
}

async function start() {
  try {
    const server = await createServer();
    
    const host = config.HOST || '0.0.0.0';
    const port = config.PORT || 7005;

    await server.listen({ port, host });
    
    logger.info(`🚀 ML Platform server started on ${host}:${port}`);
    logger.info(`📊 Health check available at http://${host}:${port}/health`);
    logger.info(`📖 API documentation available at http://${host}:${port}/docs`);

  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Start server if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  start();
}

export { createServer, start };