import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { z } from 'zod';

export async function agentRoutes(
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions
) {
  // Get agent status
  fastify.get('/status', async (request, reply) => {
    const agents = await request.server.prisma.agent.findMany({
      select: {
        id: true,
        name: true,
        type: true,
        status: true,
        version: true,
        capabilities: true,
      },
    });

    return reply.send({
      agents,
      totalAgents: agents.length,
      activeAgents: agents.filter(a => a.status === 'active').length,
    });
  });

  // Get running tasks
  fastify.get('/tasks', async (request, reply) => {
    const runningTasks = await request.server.prisma.taskExecution.findMany({
      where: { status: 'running' },
      include: {
        agent: { select: { name: true, type: true } },
        workflowRun: { select: { workflowId: true } },
      },
    });

    return reply.send({
      runningTasks,
      totalRunning: runningTasks.length,
    });
  });
}