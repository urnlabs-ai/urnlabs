import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { SlackService } from '../slack/slack-service.js';
import { slackLogger, logError } from '../lib/logger.js';
import { z } from 'zod';

// Request schemas
const sendMessageSchema = z.object({
  channel: z.string().min(1),
  text: z.string().optional(),
  blocks: z.array(z.any()).optional(),
  threadTs: z.string().optional(),
});

const updateMessageSchema = z.object({
  text: z.string().optional(),
  blocks: z.array(z.any()).optional(),
});

const messageParamsSchema = z.object({
  channel: z.string(),
  timestamp: z.string(),
});

const userParamsSchema = z.object({
  userId: z.string(),
});

const channelParamsSchema = z.object({
  channelId: z.string(),
});

const notificationSchema = z.object({
  channel: z.string().min(1),
  title: z.string().min(1),
  message: z.string().min(1),
  actions: z.array(z.object({
    text: z.string(),
    actionId: z.string(),
    style: z.enum(['primary', 'danger']).optional(),
  })).optional(),
});

const workflowApprovalSchema = z.object({
  channel: z.string().min(1),
  workflowId: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  requester: z.string().min(1),
});

const modalSchema = z.object({
  triggerId: z.string().min(1),
  view: z.any(),
});

export async function slackRoutes(fastify: FastifyInstance) {
  const slackService = new SlackService();

  // Add Slack webhook/events route using the service's Express app
  fastify.register(async (fastify) => {
    const slackApp = slackService.getExpressApp();
    
    // Forward all Slack webhook requests to the Slack service
    fastify.all('/slack/*', async (request: FastifyRequest, reply: FastifyReply) => {
      return new Promise((resolve, reject) => {
        // Convert Fastify request/reply to Express req/res format
        const req = {
          ...request.raw,
          body: request.body,
          params: request.params,
          query: request.query,
          headers: request.headers,
        };
        
        const res = {
          ...reply.raw,
          json: (data: any) => {
            reply.send(data);
            resolve(data);
          },
          status: (code: number) => {
            reply.code(code);
            return res;
          },
          send: (data: any) => {
            reply.send(data);
            resolve(data);
          },
        };

        slackApp(req as any, res as any, (error?: any) => {
          if (error) {
            reject(error);
          } else {
            resolve(undefined);
          }
        });
      });
    });
  });

  // Send message
  fastify.post('/messages', {
    schema: {
      body: sendMessageSchema,
      response: {
        200: {
          type: 'object',
          properties: {
            ts: { type: 'string' },
            channel: { type: 'string' },
          },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const message = sendMessageSchema.parse(request.body);
      const result = await slackService.sendMessage(message);
      
      return reply.send(result);
    } catch (error) {
      logError(slackLogger, 'Failed to send message', error as Error, { body: request.body });
      return reply.code(500).send({ error: 'Failed to send message' });
    }
  });

  // Update message
  fastify.put('/messages/:channel/:timestamp', {
    schema: {
      params: messageParamsSchema,
      body: updateMessageSchema,
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { channel, timestamp } = messageParamsSchema.parse(request.params);
      const updates = updateMessageSchema.parse(request.body);
      
      const success = await slackService.updateMessage(channel, timestamp, updates);
      
      if (success) {
        return reply.send({ status: 'updated' });
      } else {
        return reply.code(400).send({ error: 'Failed to update message' });
      }
    } catch (error) {
      logError(slackLogger, 'Failed to update message', error as Error, { params: request.params });
      return reply.code(500).send({ error: 'Failed to update message' });
    }
  });

  // Delete message
  fastify.delete('/messages/:channel/:timestamp', {
    schema: {
      params: messageParamsSchema,
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { channel, timestamp } = messageParamsSchema.parse(request.params);
      
      const success = await slackService.deleteMessage(channel, timestamp);
      
      if (success) {
        return reply.send({ status: 'deleted' });
      } else {
        return reply.code(400).send({ error: 'Failed to delete message' });
      }
    } catch (error) {
      logError(slackLogger, 'Failed to delete message', error as Error, { params: request.params });
      return reply.code(500).send({ error: 'Failed to delete message' });
    }
  });

  // Get user info
  fastify.get('/users/:userId', {
    schema: {
      params: userParamsSchema,
      response: {
        200: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            realName: { type: 'string' },
            email: { type: 'string' },
            isBot: { type: 'boolean' },
            isAdmin: { type: 'boolean' },
          },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { userId } = userParamsSchema.parse(request.params);
      const user = await slackService.getUserInfo(userId);
      
      if (user) {
        return reply.send(user);
      } else {
        return reply.code(404).send({ error: 'User not found' });
      }
    } catch (error) {
      logError(slackLogger, 'Failed to get user info', error as Error, { params: request.params });
      return reply.code(500).send({ error: 'Failed to get user info' });
    }
  });

  // Get channel info
  fastify.get('/channels/:channelId', {
    schema: {
      params: channelParamsSchema,
      response: {
        200: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            isPrivate: { type: 'boolean' },
            isMember: { type: 'boolean' },
            memberCount: { type: 'number' },
          },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { channelId } = channelParamsSchema.parse(request.params);
      const channel = await slackService.getChannelInfo(channelId);
      
      if (channel) {
        return reply.send(channel);
      } else {
        return reply.code(404).send({ error: 'Channel not found' });
      }
    } catch (error) {
      logError(slackLogger, 'Failed to get channel info', error as Error, { params: request.params });
      return reply.code(500).send({ error: 'Failed to get channel info' });
    }
  });

  // Send notification
  fastify.post('/notifications', {
    schema: {
      body: notificationSchema,
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { channel, title, message, actions } = notificationSchema.parse(request.body);
      const result = await slackService.sendNotification(channel, title, message, actions);
      
      return reply.send(result);
    } catch (error) {
      logError(slackLogger, 'Failed to send notification', error as Error, { body: request.body });
      return reply.code(500).send({ error: 'Failed to send notification' });
    }
  });

  // Send workflow approval
  fastify.post('/workflow-approvals', {
    schema: {
      body: workflowApprovalSchema,
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { channel, workflowId, title, description, requester } = workflowApprovalSchema.parse(request.body);
      const result = await slackService.sendWorkflowApproval(channel, workflowId, title, description, requester);
      
      return reply.send(result);
    } catch (error) {
      logError(slackLogger, 'Failed to send workflow approval', error as Error, { body: request.body });
      return reply.code(500).send({ error: 'Failed to send workflow approval' });
    }
  });

  // Open modal
  fastify.post('/modals', {
    schema: {
      body: modalSchema,
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { triggerId, view } = modalSchema.parse(request.body);
      const success = await slackService.openModal(triggerId, view);
      
      if (success) {
        return reply.send({ status: 'opened' });
      } else {
        return reply.code(400).send({ error: 'Failed to open modal' });
      }
    } catch (error) {
      logError(slackLogger, 'Failed to open modal', error as Error, { body: request.body });
      return reply.code(500).send({ error: 'Failed to open modal' });
    }
  });

  // Health check
  fastify.get('/health/slack', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const health = await slackService.healthCheck();
      
      if (health.status === 'ok') {
        return reply.send(health);
      } else {
        return reply.code(503).send(health);
      }
    } catch (error) {
      logError(slackLogger, 'Health check failed', error as Error);
      return reply.code(503).send({ status: 'error', details: 'Health check failed' });
    }
  });

  slackLogger.info('Slack routes registered');
}