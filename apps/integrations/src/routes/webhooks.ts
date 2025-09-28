import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { WebhookProcessor } from '../webhooks/webhook-processor.js';
import { webhookLogger, logError, logWebhookEvent } from '../lib/logger.js';
import { z } from 'zod';
import Redis from 'ioredis';
import { config } from '../lib/config.js';

// Request schemas
const webhookEventSchema = z.object({
  source: z.string().min(1),
  eventType: z.string().min(1),
  payload: z.any(),
  signature: z.string().optional(),
  metadata: z.record(z.any()).optional(),
});

const webhookStatsParamsSchema = z.object({
  source: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
});

export async function webhookRoutes(fastify: FastifyInstance) {
  // Initialize Redis and webhook processor
  const redis = new Redis(config.REDIS_URL);
  const webhookProcessor = new WebhookProcessor({
    redis,
    concurrency: 5,
    processingTimeout: 30000,
    maxRetries: 3,
    rateLimits: new Map([
      ['github', { windowMs: 60000, maxRequests: 1000 }],
      ['slack', { windowMs: 60000, maxRequests: 500 }],
      ['jira', { windowMs: 60000, maxRequests: 200 }],
      ['gitlab', { windowMs: 60000, maxRequests: 300 }],
    ]),
  });

  // Start webhook processing
  webhookProcessor.startProcessing().catch(error => {
    logError(webhookLogger, 'Failed to start webhook processor', error);
  });

  // Register example handlers
  webhookProcessor.registerHandler({
    source: 'github',
    eventTypes: ['push', 'pull_request', 'issues'],
    handler: async (event) => {
      logWebhookEvent('github_event_processed', event.payload, {
        eventId: event.id,
        type: event.type,
      });
      
      // Process GitHub webhook logic here
      // This could trigger workflows, update databases, send notifications, etc.
    },
  });

  webhookProcessor.registerHandler({
    source: 'slack',
    eventTypes: ['message', 'app_mention', 'button_click'],
    handler: async (event) => {
      logWebhookEvent('slack_event_processed', event.payload, {
        eventId: event.id,
        type: event.type,
      });
      
      // Process Slack webhook logic here
    },
  });

  // Generic webhook endpoint
  fastify.post('/webhooks/:source/:eventType', {
    schema: {
      params: z.object({
        source: z.string(),
        eventType: z.string(),
      }),
      headers: z.object({
        'x-signature': z.string().optional(),
        'x-github-delivery': z.string().optional(),
        'x-slack-signature': z.string().optional(),
      }).passthrough(),
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { source, eventType } = request.params as { source: string; eventType: string };
      const payload = request.body;
      const headers = request.headers;

      // Extract signature based on source
      let signature: string | undefined;
      if (source === 'github' && headers['x-hub-signature-256']) {
        signature = headers['x-hub-signature-256'] as string;
      } else if (source === 'slack' && headers['x-slack-signature']) {
        signature = headers['x-slack-signature'] as string;
      } else if (headers['x-signature']) {
        signature = headers['x-signature'] as string;
      }

      const metadata = {
        userAgent: headers['user-agent'],
        deliveryId: headers['x-github-delivery'] || headers['x-slack-request-timestamp'],
        ip: request.ip,
      };

      logWebhookEvent('webhook_received', payload, {
        source,
        eventType,
        signature: signature ? '[REDACTED]' : undefined,
        metadata,
      });

      const result = await webhookProcessor.processWebhook(
        source,
        eventType,
        payload,
        signature,
        metadata
      );

      return reply.send({
        eventId: result.eventId,
        status: result.queued ? 'queued' : 'rejected',
        message: 'Webhook received and queued for processing',
      });
    } catch (error) {
      logError(webhookLogger, 'Webhook processing failed', error as Error, {
        params: request.params,
        headers: request.headers,
      });

      if ((error as Error).message.includes('signature')) {
        return reply.code(401).send({
          error: 'Invalid signature',
          message: 'Webhook signature verification failed',
        });
      }

      if ((error as Error).message.includes('rate limit')) {
        return reply.code(429).send({
          error: 'Rate limit exceeded',
          message: 'Too many webhook requests',
        });
      }

      return reply.code(500).send({
        error: 'Webhook processing failed',
        message: 'Internal server error',
      });
    }
  });

  // GitHub-specific webhook endpoint
  fastify.post('/webhooks/github', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const payload = request.body as any;
      const signature = request.headers['x-hub-signature-256'] as string;
      const deliveryId = request.headers['x-github-delivery'] as string;
      const eventType = request.headers['x-github-event'] as string;

      if (!eventType) {
        return reply.code(400).send({ error: 'Missing x-github-event header' });
      }

      const result = await webhookProcessor.processWebhook(
        'github',
        eventType,
        payload,
        signature,
        { deliveryId, userAgent: request.headers['user-agent'] }
      );

      return reply.send({ eventId: result.eventId, status: 'accepted' });
    } catch (error) {
      logError(webhookLogger, 'GitHub webhook failed', error as Error);
      return reply.code(500).send({ error: 'Webhook processing failed' });
    }
  });

  // Slack-specific webhook endpoint
  fastify.post('/webhooks/slack', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const payload = request.body as any;
      const signature = request.headers['x-slack-signature'] as string;
      const timestamp = request.headers['x-slack-request-timestamp'] as string;

      // Slack sends different event types in the payload
      const eventType = payload.type || payload.event?.type || 'unknown';

      const result = await webhookProcessor.processWebhook(
        'slack',
        eventType,
        payload,
        signature,
        { timestamp, userAgent: request.headers['user-agent'] }
      );

      return reply.send({ eventId: result.eventId, status: 'accepted' });
    } catch (error) {
      logError(webhookLogger, 'Slack webhook failed', error as Error);
      return reply.code(500).send({ error: 'Webhook processing failed' });
    }
  });

  // Manual webhook trigger (for testing)
  fastify.post('/webhooks/manual', {
    schema: {
      body: webhookEventSchema,
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { source, eventType, payload, signature, metadata } = webhookEventSchema.parse(request.body);

      const result = await webhookProcessor.processWebhook(
        source,
        eventType,
        payload,
        signature,
        metadata
      );

      return reply.send({
        eventId: result.eventId,
        status: result.queued ? 'queued' : 'rejected',
        message: 'Manual webhook triggered successfully',
      });
    } catch (error) {
      logError(webhookLogger, 'Manual webhook failed', error as Error, { body: request.body });
      return reply.code(500).send({ error: 'Manual webhook processing failed' });
    }
  });

  // Get webhook processing statistics
  fastify.get('/webhooks/stats', {
    schema: {
      querystring: webhookStatsParamsSchema,
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const stats = await webhookProcessor.getStats();
      
      return reply.send({
        stats,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logError(webhookLogger, 'Failed to get webhook stats', error as Error);
      return reply.code(500).send({ error: 'Failed to get webhook statistics' });
    }
  });

  // Get dead letter queue items
  fastify.get('/webhooks/dead-letter', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const deadLetterEvents = await redis.lrange('webhook_dead_letter_queue', 0, 99);
      const events = deadLetterEvents.map(eventData => JSON.parse(eventData));

      return reply.send({
        events,
        count: events.length,
        totalInQueue: await redis.llen('webhook_dead_letter_queue'),
      });
    } catch (error) {
      logError(webhookLogger, 'Failed to get dead letter events', error as Error);
      return reply.code(500).send({ error: 'Failed to get dead letter events' });
    }
  });

  // Retry dead letter event
  fastify.post('/webhooks/dead-letter/:index/retry', {
    schema: {
      params: z.object({
        index: z.string().transform(Number),
      }),
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { index } = request.params as { index: number };
      
      // Get event from dead letter queue
      const eventData = await redis.lindex('webhook_dead_letter_queue', index);
      if (!eventData) {
        return reply.code(404).send({ error: 'Event not found in dead letter queue' });
      }

      const event = JSON.parse(eventData);
      
      // Reset retry count and error
      event.retryCount = 0;
      delete event.error;

      // Remove from dead letter queue and requeue for processing
      await redis.lrem('webhook_dead_letter_queue', 1, eventData);
      await webhookProcessor.processWebhook(
        event.source,
        event.type,
        event.payload,
        event.signature,
        { retry: true }
      );

      return reply.send({
        eventId: event.id,
        status: 'requeued',
        message: 'Event moved from dead letter queue to processing queue',
      });
    } catch (error) {
      logError(webhookLogger, 'Failed to retry dead letter event', error as Error, { params: request.params });
      return reply.code(500).send({ error: 'Failed to retry dead letter event' });
    }
  });

  // Health check
  fastify.get('/health/webhooks', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const health = await webhookProcessor.healthCheck();
      
      if (health.status === 'ok') {
        return reply.send(health);
      } else {
        return reply.code(503).send(health);
      }
    } catch (error) {
      logError(webhookLogger, 'Webhook health check failed', error as Error);
      return reply.code(503).send({
        status: 'error',
        details: 'Health check failed',
      });
    }
  });

  // Graceful shutdown
  fastify.addHook('onClose', async () => {
    await webhookProcessor.stopProcessing();
    await redis.disconnect();
    webhookLogger.info('Webhook processor stopped and Redis disconnected');
  });

  webhookLogger.info('Webhook routes registered');
}