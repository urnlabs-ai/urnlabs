import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { z } from 'zod';

const executeWorkflowSchema = z.object({
  workflowId: z.string(),
  input: z.record(z.any()).optional(),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
});

export async function workflowRoutes(
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions
) {
  // Execute workflow
  fastify.post('/execute', async (request, reply) => {
    const { workflowId, input, priority } = executeWorkflowSchema.parse(request.body);

    try {
      const workflowRunId = await request.server.orchestrator.executeWorkflow({
        workflowId,
        userId: 'system', // TODO: Get from authentication
        organizationId: 'urnlabs', // TODO: Get from authentication
        input,
        priority,
      });

      return reply.send({
        workflowRunId,
        status: 'started',
        message: 'Workflow execution started',
      });

    } catch (error) {
      return reply.status(400).send({
        error: 'Failed to start workflow',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // Get workflow status
  fastify.get('/:workflowRunId/status', async (request, reply) => {
    const { workflowRunId } = request.params as { workflowRunId: string };

    try {
      const status = await request.server.orchestrator.getWorkflowStatus(workflowRunId);
      return reply.send(status);

    } catch (error) {
      return reply.status(404).send({
        error: 'Workflow run not found',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // Cancel workflow
  fastify.post('/:workflowRunId/cancel', async (request, reply) => {
    const { workflowRunId } = request.params as { workflowRunId: string };

    try {
      await request.server.orchestrator.cancelWorkflow(workflowRunId);
      return reply.send({
        message: 'Workflow cancelled successfully',
      });

    } catch (error) {
      return reply.status(400).send({
        error: 'Failed to cancel workflow',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });
}