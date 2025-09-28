import { FastifyPluginAsync } from 'fastify';
import { AgentOrchestrator } from '../orchestrator/agent-orchestrator.js';
import { ModelManager } from '../models/model-manager.js';
import { MLPipelineManager } from '../pipeline/pipeline-manager.js';
import { logger } from '../lib/logger.js';
import {
  CreateWorkflowRequest,
  ExecuteWorkflowRequest,
  RegisterAgentRequest,
  RegisterToolRequest,
  CollaborationPattern,
  WorkflowStatus
} from '../types/index.js';

const orchestratorRoutes: FastifyPluginAsync = async (fastify) => {
  // Initialize managers
  const modelManager = new ModelManager();
  const pipelineManager = new MLPipelineManager(modelManager, fastify.redis as any);
  const orchestrator = new AgentOrchestrator(modelManager, pipelineManager);

  // Workflow Management
  fastify.post<{ Body: CreateWorkflowRequest }>('/workflows', async (request, reply) => {
    try {
      const workflow = await orchestrator.createWorkflow(request.body);

      logger.orchestrator.info('Workflow created', {
        workflowId: workflow.id,
        name: workflow.name,
        steps: workflow.steps.length
      });

      return {
        success: true,
        data: workflow
      };
    } catch (error) {
      logger.orchestrator.error('Failed to create workflow', { error });
      return reply.status(500).send({
        success: false,
        error: 'Failed to create workflow'
      });
    }
  });

  fastify.post<{
    Params: { workflowId: string },
    Body: ExecuteWorkflowRequest
  }>('/workflows/:workflowId/execute', async (request, reply) => {
    try {
      const { workflowId } = request.params;
      const execution = await orchestrator.executeWorkflow(workflowId, request.body);

      logger.orchestrator.info('Workflow execution started', {
        workflowId,
        executionId: execution.id,
        context: request.body
      });

      return {
        success: true,
        data: execution
      };
    } catch (error) {
      logger.orchestrator.error('Failed to execute workflow', {
        workflowId: request.params.workflowId,
        error
      });
      return reply.status(500).send({
        success: false,
        error: 'Failed to execute workflow'
      });
    }
  });

  fastify.get<{ Params: { workflowId: string } }>('/workflows/:workflowId', async (request, reply) => {
    try {
      const workflow = await orchestrator.getWorkflow(request.params.workflowId);

      if (!workflow) {
        return reply.status(404).send({
          success: false,
          error: 'Workflow not found'
        });
      }

      return {
        success: true,
        data: workflow
      };
    } catch (error) {
      logger.orchestrator.error('Failed to get workflow', {
        workflowId: request.params.workflowId,
        error
      });
      return reply.status(500).send({
        success: false,
        error: 'Failed to get workflow'
      });
    }
  });

  fastify.get('/workflows', async (request, reply) => {
    try {
      const workflows = await orchestrator.listWorkflows();

      return {
        success: true,
        data: workflows
      };
    } catch (error) {
      logger.orchestrator.error('Failed to list workflows', { error });
      return reply.status(500).send({
        success: false,
        error: 'Failed to list workflows'
      });
    }
  });

  fastify.delete<{ Params: { workflowId: string } }>('/workflows/:workflowId', async (request, reply) => {
    try {
      await orchestrator.deleteWorkflow(request.params.workflowId);

      logger.orchestrator.info('Workflow deleted', {
        workflowId: request.params.workflowId
      });

      return {
        success: true,
        message: 'Workflow deleted successfully'
      };
    } catch (error) {
      logger.orchestrator.error('Failed to delete workflow', {
        workflowId: request.params.workflowId,
        error
      });
      return reply.status(500).send({
        success: false,
        error: 'Failed to delete workflow'
      });
    }
  });

  // Workflow Execution Management
  fastify.get<{ Params: { executionId: string } }>('/executions/:executionId', async (request, reply) => {
    try {
      const execution = await orchestrator.getExecution(request.params.executionId);

      if (!execution) {
        return reply.status(404).send({
          success: false,
          error: 'Execution not found'
        });
      }

      return {
        success: true,
        data: execution
      };
    } catch (error) {
      logger.orchestrator.error('Failed to get execution', {
        executionId: request.params.executionId,
        error
      });
      return reply.status(500).send({
        success: false,
        error: 'Failed to get execution'
      });
    }
  });

  fastify.post<{ Params: { executionId: string } }>('/executions/:executionId/cancel', async (request, reply) => {
    try {
      await orchestrator.cancelExecution(request.params.executionId);

      logger.orchestrator.info('Execution cancelled', {
        executionId: request.params.executionId
      });

      return {
        success: true,
        message: 'Execution cancelled successfully'
      };
    } catch (error) {
      logger.orchestrator.error('Failed to cancel execution', {
        executionId: request.params.executionId,
        error
      });
      return reply.status(500).send({
        success: false,
        error: 'Failed to cancel execution'
      });
    }
  });

  fastify.get<{ Params: { executionId: string } }>('/executions/:executionId/logs', async (request, reply) => {
    try {
      const logs = await orchestrator.getExecutionLogs(request.params.executionId);

      return {
        success: true,
        data: logs
      };
    } catch (error) {
      logger.orchestrator.error('Failed to get execution logs', {
        executionId: request.params.executionId,
        error
      });
      return reply.status(500).send({
        success: false,
        error: 'Failed to get execution logs'
      });
    }
  });

  // Agent Management
  fastify.post<{ Body: RegisterAgentRequest }>('/agents', async (request, reply) => {
    try {
      await orchestrator.registerAgent(request.body);

      logger.orchestrator.info('Agent registered', {
        agentId: request.body.id,
        name: request.body.name,
        capabilities: request.body.capabilities
      });

      return {
        success: true,
        message: 'Agent registered successfully'
      };
    } catch (error) {
      logger.orchestrator.error('Failed to register agent', { error });
      return reply.status(500).send({
        success: false,
        error: 'Failed to register agent'
      });
    }
  });

  fastify.get('/agents', async (request, reply) => {
    try {
      const agents = await orchestrator.listAgents();

      return {
        success: true,
        data: agents
      };
    } catch (error) {
      logger.orchestrator.error('Failed to list agents', { error });
      return reply.status(500).send({
        success: false,
        error: 'Failed to list agents'
      });
    }
  });

  fastify.get<{ Params: { agentId: string } }>('/agents/:agentId', async (request, reply) => {
    try {
      const agent = await orchestrator.getAgent(request.params.agentId);

      if (!agent) {
        return reply.status(404).send({
          success: false,
          error: 'Agent not found'
        });
      }

      return {
        success: true,
        data: agent
      };
    } catch (error) {
      logger.orchestrator.error('Failed to get agent', {
        agentId: request.params.agentId,
        error
      });
      return reply.status(500).send({
        success: false,
        error: 'Failed to get agent'
      });
    }
  });

  fastify.delete<{ Params: { agentId: string } }>('/agents/:agentId', async (request, reply) => {
    try {
      await orchestrator.unregisterAgent(request.params.agentId);

      logger.orchestrator.info('Agent unregistered', {
        agentId: request.params.agentId
      });

      return {
        success: true,
        message: 'Agent unregistered successfully'
      };
    } catch (error) {
      logger.orchestrator.error('Failed to unregister agent', {
        agentId: request.params.agentId,
        error
      });
      return reply.status(500).send({
        success: false,
        error: 'Failed to unregister agent'
      });
    }
  });

  // Tool Management
  fastify.post<{ Body: RegisterToolRequest }>('/tools', async (request, reply) => {
    try {
      await orchestrator.registerTool(request.body);

      logger.orchestrator.info('Tool registered', {
        toolId: request.body.id,
        name: request.body.name,
        category: request.body.category
      });

      return {
        success: true,
        message: 'Tool registered successfully'
      };
    } catch (error) {
      logger.orchestrator.error('Failed to register tool', { error });
      return reply.status(500).send({
        success: false,
        error: 'Failed to register tool'
      });
    }
  });

  fastify.get('/tools', async (request, reply) => {
    try {
      const tools = await orchestrator.listTools();

      return {
        success: true,
        data: tools
      };
    } catch (error) {
      logger.orchestrator.error('Failed to list tools', { error });
      return reply.status(500).send({
        success: false,
        error: 'Failed to list tools'
      });
    }
  });

  fastify.get<{ Params: { toolId: string } }>('/tools/:toolId', async (request, reply) => {
    try {
      const tool = await orchestrator.getTool(request.params.toolId);

      if (!tool) {
        return reply.status(404).send({
          success: false,
          error: 'Tool not found'
        });
      }

      return {
        success: true,
        data: tool
      };
    } catch (error) {
      logger.orchestrator.error('Failed to get tool', {
        toolId: request.params.toolId,
        error
      });
      return reply.status(500).send({
        success: false,
        error: 'Failed to get tool'
      });
    }
  });

  fastify.delete<{ Params: { toolId: string } }>('/tools/:toolId', async (request, reply) => {
    try {
      await orchestrator.unregisterTool(request.params.toolId);

      logger.orchestrator.info('Tool unregistered', {
        toolId: request.params.toolId
      });

      return {
        success: true,
        message: 'Tool unregistered successfully'
      };
    } catch (error) {
      logger.orchestrator.error('Failed to unregister tool', {
        toolId: request.params.toolId,
        error
      });
      return reply.status(500).send({
        success: false,
        error: 'Failed to unregister tool'
      });
    }
  });

  // Collaboration Patterns
  fastify.post<{
    Body: {
      pattern: CollaborationPattern;
      agents: string[];
      task: string;
      context?: any;
    }
  }>('/collaborate', async (request, reply) => {
    try {
      const { pattern, agents, task, context } = request.body;
      const result = await orchestrator.collaborate(pattern, agents, task, context);

      logger.orchestrator.info('Collaboration completed', {
        pattern,
        agents,
        task: task.substring(0, 100) + '...'
      });

      return {
        success: true,
        data: result
      };
    } catch (error) {
      logger.orchestrator.error('Failed to execute collaboration', { error });
      return reply.status(500).send({
        success: false,
        error: 'Failed to execute collaboration'
      });
    }
  });

  // Health and Status
  fastify.get('/health', async (request, reply) => {
    try {
      const health = await orchestrator.getHealth();

      return {
        success: true,
        data: health
      };
    } catch (error) {
      logger.orchestrator.error('Failed to get orchestrator health', { error });
      return reply.status(500).send({
        success: false,
        error: 'Failed to get orchestrator health'
      });
    }
  });

  fastify.get('/stats', async (request, reply) => {
    try {
      const stats = await orchestrator.getStats();

      return {
        success: true,
        data: stats
      };
    } catch (error) {
      logger.orchestrator.error('Failed to get orchestrator stats', { error });
      return reply.status(500).send({
        success: false,
        error: 'Failed to get orchestrator stats'
      });
    }
  });

  // WebSocket endpoint for real-time workflow updates
  fastify.get('/ws/workflows/:workflowId', { websocket: true }, (connection, request) => {
    const workflowId = (request.params as any).workflowId;

    logger.orchestrator.info('WebSocket connection established for workflow', { workflowId });

    connection.socket.on('message', async (message) => {
      try {
        const data = JSON.parse(message.toString());

        if (data.type === 'subscribe') {
          // Subscribe to workflow updates
          await orchestrator.subscribeToWorkflow(workflowId, (update) => {
            connection.socket.send(JSON.stringify({
              type: 'workflow_update',
              data: update
            }));
          });
        }
      } catch (error) {
        logger.orchestrator.error('WebSocket message error', { error });
        connection.socket.send(JSON.stringify({
          type: 'error',
          message: 'Invalid message format'
        }));
      }
    });

    connection.socket.on('close', () => {
      logger.orchestrator.info('WebSocket connection closed for workflow', { workflowId });
    });
  });
};

export default orchestratorRoutes;