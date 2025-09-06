import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { z } from 'zod';

export async function workflowsRoutes(
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions
) {
  // List available workflows
  fastify.get('/', {
    schema: {
      tags: ['Workflows'],
      summary: 'List available workflows',
      description: 'Get list of all available AI workflows',
      security: [{ bearerAuth: [] }],
    },
  }, async (_request, reply) => {
    return reply.send({
      workflows: [
        {
          id: 'feature-development',
          name: 'Feature Development',
          description: 'Complete feature development from requirements to deployment',
          status: 'active',
          agents: ['architecture-agent', 'code-reviewer', 'testing-agent'],
        }
      ]
    });
  });
}