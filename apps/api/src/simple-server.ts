import Fastify from 'fastify';
import { PrismaClient } from '@prisma/client';
import { config } from '@/lib/config.js';
import { logger } from '@/lib/logger.js';

const server = Fastify({
  logger: logger,
});

const prisma = new PrismaClient();
server.decorate('prisma', prisma);

// Basic health check
server.get('/health', async (request, reply) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return reply.send({
      status: 'healthy',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return reply.status(503).send({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
    });
  }
});

// Simple API endpoint
server.get('/api/test', async (request, reply) => {
  return reply.send({
    message: 'Urnlabs AI Agent Platform API is working!',
    timestamp: new Date().toISOString(),
  });
});

async function start() {
  try {
    await server.listen({
      port: config.PORT,
      host: config.HOST,
    });

    logger.info({
      port: config.PORT,
      host: config.HOST,
      environment: config.NODE_ENV,
    }, 'Simple Urnlabs API server started successfully');

  } catch (error) {
    logger.error(error, 'Failed to start server');
    process.exit(1);
  }
}

start();