import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';

const fastify = Fastify({
  logger: {
    level: process.env.LOG_LEVEL || 'info',
    transport: process.env.NODE_ENV === 'development' ? {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'HH:MM:ss Z',
        ignore: 'pid,hostname'
      }
    } : undefined
  },
  trustProxy: true
});

// Register plugins
await fastify.register(cors, { origin: true });
await fastify.register(helmet);

// Health check
fastify.get('/health', async (request, reply) => {
  return { 
    status: 'healthy', 
    service: 'monitoring',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  };
});

// Metrics endpoint
fastify.get('/metrics', async (request, reply) => {
  return {
    system: {
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      cpu: process.cpuUsage()
    },
    timestamp: new Date().toISOString()
  };
});

// Start server
const start = async () => {
  try {
    const port = parseInt(process.env.MONITORING_PORT || '7006');
    await fastify.listen({ port, host: '0.0.0.0' });
    fastify.log.info(`Monitoring service running on port ${port}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();