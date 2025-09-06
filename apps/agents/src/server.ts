import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import { PrismaClient } from '@prisma/client';

import { logger } from '@/lib/logger.js';
import { config } from '@/lib/config.js';
import { AgentOrchestrator } from '@/orchestrator/agent-orchestrator.js';
import { QueueManager } from '@/queue/queue-manager.js';
import { WebSocketManager } from '@/lib/websocket-manager.js';
import { agentRoutes } from '@/routes/agents.js';
import { workflowRoutes } from '@/routes/workflows.js';
import { healthRoutes } from '@/routes/health.js';

declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient;
    orchestrator: AgentOrchestrator;
    queueManager: QueueManager;
    wsManager: WebSocketManager;
  }
}

async function buildServer() {
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

  // Initialize core services
  const queueManager = new QueueManager(config.REDIS_URL);
  const wsManager = new WebSocketManager();
  const orchestrator = new AgentOrchestrator(prisma, queueManager, wsManager);

  // Decorate Fastify instance
  server.decorate('prisma', prisma);
  server.decorate('orchestrator', orchestrator);
  server.decorate('queueManager', queueManager);
  server.decorate('wsManager', wsManager);

  // WebSocket support
  await server.register(websocket);

  // Graceful shutdown
  server.addHook('onClose', async () => {
    logger.info('Shutting down AI Agent Service...');
    await orchestrator.shutdown();
    await queueManager.shutdown();
    await wsManager.shutdown();
    await prisma.$disconnect();
  });

  // Health checks
  server.addHook('onReady', async () => {
    // Initialize orchestrator
    await orchestrator.initialize();
    
    // Start processing queues
    await queueManager.startProcessing();
    
    logger.info('AI Agent Service initialized successfully');
  });

  // Routes
  await server.register(healthRoutes, { prefix: '/health' });
  await server.register(agentRoutes, { prefix: '/agents' });
  await server.register(workflowRoutes, { prefix: '/workflows' });

  // WebSocket endpoint for real-time updates
  server.register(async function (fastify) {
    fastify.get('/ws', { websocket: true }, (connection, req) => {
      wsManager.handleConnection(connection, req);
    });
  });

  return server;
}

async function start() {
  try {
    const server = await buildServer();
    
    await server.listen({
      port: config.AGENT_SERVICE_PORT,
      host: config.HOST,
    });

    logger.info({
      port: config.AGENT_SERVICE_PORT,
      host: config.HOST,
      environment: config.NODE_ENV,
    }, 'AI Agent Service started successfully');

  } catch (error) {
    logger.error(error, 'Failed to start AI Agent Service');
    process.exit(1);
  }
}

// Handle uncaught exceptions and unhandled rejections
process.on('uncaughtException', (error) => {
  logger.error(error, 'Uncaught exception in AI Agent Service');
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.error({ reason }, 'Unhandled rejection in AI Agent Service');
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('Received SIGTERM, shutting down AI Agent Service gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('Received SIGINT, shutting down AI Agent Service gracefully');
  process.exit(0);
});

if (import.meta.url === `file://${process.argv[1]}`) {
  start();
}

export { buildServer };