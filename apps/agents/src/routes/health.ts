import { FastifyInstance, FastifyPluginOptions } from 'fastify';

export async function healthRoutes(
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions
) {
  // Basic health check
  fastify.get('/', async (_request, reply) => {
    return reply.send({
      status: 'healthy',
      service: 'urnlabs-agents',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    });
  });

  // Detailed health check
  fastify.get('/detailed', async (request, reply) => {
    const queueStats = await request.server.queueManager.getQueueStats();
    const wsStats = request.server.wsManager.getConnectionStats();
    
    return reply.send({
      status: 'healthy',
      service: 'urnlabs-agents',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      components: {
        database: { status: 'healthy' },
        queue: { status: 'healthy', ...queueStats },
        websockets: { status: 'healthy', ...wsStats },
        orchestrator: { status: 'healthy' },
      },
      memory: process.memoryUsage(),
    });
  });
}