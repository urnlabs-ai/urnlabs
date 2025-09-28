import { WebhookEvent, WebhookConfig, RetryConfig } from '../types/index.js';
import { webhookLogger, logError, createPerformanceLogger, logSecurityEvent } from '../lib/logger.js';
import { retryConfig } from '../lib/config.js';
import Redis from 'ioredis';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';

export interface WebhookHandler {
  source: string;
  eventTypes: string[];
  handler: (event: WebhookEvent) => Promise<void>;
  retryConfig?: Partial<RetryConfig>;
}

export interface WebhookProcessorConfig {
  redis: Redis;
  concurrency?: number;
  processingTimeout?: number;
  maxRetries?: number;
  rateLimits?: Map<string, { windowMs: number; maxRequests: number }>;
}

export class WebhookProcessor {
  private redis: Redis;
  private handlers: Map<string, WebhookHandler[]> = new Map();
  private processingQueue: string = 'webhook_processing_queue';
  private retryQueue: string = 'webhook_retry_queue';
  private deadLetterQueue: string = 'webhook_dead_letter_queue';
  private concurrency: number;
  private processingTimeout: number;
  private maxRetries: number;
  private rateLimits: Map<string, { windowMs: number; maxRequests: number }>;
  private isProcessing: boolean = false;

  constructor(config: WebhookProcessorConfig) {
    this.redis = config.redis;
    this.concurrency = config.concurrency || 5;
    this.processingTimeout = config.processingTimeout || 30000;
    this.maxRetries = config.maxRetries || retryConfig.maxAttempts;
    this.rateLimits = config.rateLimits || new Map();

    this.setupQueues();
    webhookLogger.info('Webhook processor initialized', {
      concurrency: this.concurrency,
      processingTimeout: this.processingTimeout,
      maxRetries: this.maxRetries,
    });
  }

  /**
   * Register a webhook handler
   */
  registerHandler(handler: WebhookHandler): void {
    for (const eventType of handler.eventTypes) {
      const key = `${handler.source}:${eventType}`;
      
      if (!this.handlers.has(key)) {
        this.handlers.set(key, []);
      }
      
      this.handlers.get(key)!.push(handler);
    }

    webhookLogger.info('Webhook handler registered', {
      source: handler.source,
      eventTypes: handler.eventTypes,
    });
  }

  /**
   * Process incoming webhook
   */
  async processWebhook(
    source: string,
    eventType: string,
    payload: any,
    signature?: string,
    metadata?: Record<string, any>
  ): Promise<{ eventId: string; queued: boolean }> {
    const perf = createPerformanceLogger('webhook-process');
    const eventId = uuidv4();

    try {
      // Verify signature if provided
      if (signature && !this.verifySignature(source, payload, signature)) {
        logSecurityEvent('webhook_signature_invalid', {
          source,
          eventType,
          eventId,
          signature,
        });
        throw new Error('Invalid webhook signature');
      }

      // Check rate limits
      if (!(await this.checkRateLimit(source))) {
        logSecurityEvent('webhook_rate_limit_exceeded', {
          source,
          eventType,
          eventId,
        });
        throw new Error('Rate limit exceeded');
      }

      // Create webhook event
      const event: WebhookEvent = {
        id: eventId,
        source,
        type: eventType,
        payload,
        signature,
        timestamp: new Date(),
        processed: false,
        retryCount: 0,
      };

      // Add to processing queue
      await this.queueEvent(event);

      perf.end(true, { eventId, source, eventType });
      webhookLogger.info('Webhook queued for processing', {
        eventId,
        source,
        eventType,
      });

      return { eventId, queued: true };
    } catch (error) {
      perf.end(false, { eventId, source, eventType, error: (error as Error).message });
      logError(webhookLogger, 'Failed to process webhook', error as Error, {
        eventId,
        source,
        eventType,
      });
      throw error;
    }
  }

  /**
   * Start processing webhooks
   */
  async startProcessing(): Promise<void> {
    if (this.isProcessing) {
      return;
    }

    this.isProcessing = true;
    webhookLogger.info('Starting webhook processing');

    // Start multiple workers for concurrent processing
    const workers = Array.from({ length: this.concurrency }, (_, i) =>
      this.processWorker(`worker-${i}`)
    );

    // Start retry processor
    workers.push(this.retryProcessor());

    await Promise.all(workers);
  }

  /**
   * Stop processing webhooks
   */
  async stopProcessing(): Promise<void> {
    this.isProcessing = false;
    webhookLogger.info('Stopping webhook processing');
  }

  /**
   * Get processing statistics
   */
  async getStats(): Promise<{
    queueSize: number;
    retryQueueSize: number;
    deadLetterQueueSize: number;
    processed: number;
    failed: number;
  }> {
    const [queueSize, retryQueueSize, deadLetterQueueSize, processed, failed] = await Promise.all([
      this.redis.llen(this.processingQueue),
      this.redis.llen(this.retryQueue),
      this.redis.llen(this.deadLetterQueue),
      this.redis.get('webhook_stats:processed').then(val => parseInt(val || '0')),
      this.redis.get('webhook_stats:failed').then(val => parseInt(val || '0')),
    ]);

    return {
      queueSize,
      retryQueueSize,
      deadLetterQueueSize,
      processed,
      failed,
    };
  }

  /**
   * Queue webhook event for processing
   */
  private async queueEvent(event: WebhookEvent): Promise<void> {
    const serializedEvent = JSON.stringify(event);
    await this.redis.lpush(this.processingQueue, serializedEvent);
  }

  /**
   * Process worker
   */
  private async processWorker(workerId: string): Promise<void> {
    webhookLogger.info('Webhook worker started', { workerId });

    while (this.isProcessing) {
      try {
        // Block and wait for next event (with timeout)
        const result = await this.redis.brpop(this.processingQueue, 5);
        
        if (!result) {
          continue; // Timeout, continue loop
        }

        const [, eventData] = result;
        const event: WebhookEvent = JSON.parse(eventData);

        await this.processEvent(event, workerId);
      } catch (error) {
        logError(webhookLogger, 'Worker error', error as Error, { workerId });
        // Continue processing other events
      }
    }

    webhookLogger.info('Webhook worker stopped', { workerId });
  }

  /**
   * Process individual webhook event
   */
  private async processEvent(event: WebhookEvent, workerId: string): Promise<void> {
    const perf = createPerformanceLogger('webhook-event-process');
    
    try {
      const key = `${event.source}:${event.type}`;
      const handlers = this.handlers.get(key) || [];

      if (handlers.length === 0) {
        webhookLogger.warn('No handlers found for webhook event', {
          eventId: event.id,
          source: event.source,
          type: event.type,
        });
        return;
      }

      // Process with timeout
      await Promise.race([
        this.executeHandlers(event, handlers),
        this.createTimeout(this.processingTimeout),
      ]);

      // Mark as processed
      event.processed = true;
      await this.redis.incr('webhook_stats:processed');

      perf.end(true, { eventId: event.id, workerId, handlers: handlers.length });
      webhookLogger.info('Webhook event processed successfully', {
        eventId: event.id,
        source: event.source,
        type: event.type,
        workerId,
      });
    } catch (error) {
      perf.end(false, { eventId: event.id, workerId, error: (error as Error).message });
      await this.handleProcessingError(event, error as Error);
    }
  }

  /**
   * Execute all handlers for an event
   */
  private async executeHandlers(event: WebhookEvent, handlers: WebhookHandler[]): Promise<void> {
    const promises = handlers.map(async (handler) => {
      try {
        await handler.handler(event);
      } catch (error) {
        logError(webhookLogger, 'Handler execution failed', error as Error, {
          eventId: event.id,
          source: handler.source,
          handlerEventTypes: handler.eventTypes,
        });
        throw error;
      }
    });

    await Promise.all(promises);
  }

  /**
   * Handle processing errors and retries
   */
  private async handleProcessingError(event: WebhookEvent, error: Error): Promise<void> {
    event.error = error.message;
    event.retryCount++;

    if (event.retryCount < this.maxRetries) {
      // Add to retry queue with exponential backoff
      const delay = Math.min(
        retryConfig.backoffMs * Math.pow(2, event.retryCount - 1),
        retryConfig.maxBackoffMs || 30000
      );
      
      const retryAt = Date.now() + delay;
      await this.redis.zadd(this.retryQueue, retryAt, JSON.stringify(event));

      webhookLogger.warn('Webhook event scheduled for retry', {
        eventId: event.id,
        retryCount: event.retryCount,
        retryAt: new Date(retryAt).toISOString(),
        error: error.message,
      });
    } else {
      // Send to dead letter queue
      await this.redis.lpush(this.deadLetterQueue, JSON.stringify(event));
      await this.redis.incr('webhook_stats:failed');

      logError(webhookLogger, 'Webhook event moved to dead letter queue', error, {
        eventId: event.id,
        retryCount: event.retryCount,
      });
    }
  }

  /**
   * Retry processor
   */
  private async retryProcessor(): Promise<void> {
    webhookLogger.info('Retry processor started');

    while (this.isProcessing) {
      try {
        const now = Date.now();
        
        // Get events ready for retry
        const results = await this.redis.zrangebyscore(
          this.retryQueue,
          0,
          now,
          'LIMIT',
          0,
          10
        );

        if (results.length === 0) {
          await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
          continue;
        }

        // Process retry events
        for (const eventData of results) {
          const event: WebhookEvent = JSON.parse(eventData);
          
          // Remove from retry queue and add back to processing queue
          await this.redis.zrem(this.retryQueue, eventData);
          await this.queueEvent(event);

          webhookLogger.info('Event moved from retry queue to processing queue', {
            eventId: event.id,
            retryCount: event.retryCount,
          });
        }
      } catch (error) {
        logError(webhookLogger, 'Retry processor error', error as Error);
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }

    webhookLogger.info('Retry processor stopped');
  }

  /**
   * Verify webhook signature
   */
  private verifySignature(source: string, payload: any, signature: string): boolean {
    try {
      // This is a simplified signature verification
      // In practice, each source would have its own signature method
      const expectedSignature = crypto
        .createHmac('sha256', 'webhook-secret') // This should come from config per source
        .update(JSON.stringify(payload))
        .digest('hex');

      return crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(`sha256=${expectedSignature}`)
      );
    } catch (error) {
      logError(webhookLogger, 'Signature verification failed', error as Error, { source });
      return false;
    }
  }

  /**
   * Check rate limits
   */
  private async checkRateLimit(source: string): Promise<boolean> {
    const rateLimit = this.rateLimits.get(source);
    if (!rateLimit) {
      return true; // No rate limit configured
    }

    const key = `rate_limit:${source}`;
    const now = Date.now();
    const window = now - rateLimit.windowMs;

    // Use Redis sorted set for sliding window rate limiting
    const pipeline = this.redis.pipeline();
    pipeline.zremrangebyscore(key, 0, window);
    pipeline.zadd(key, now, now);
    pipeline.zcard(key);
    pipeline.expire(key, Math.ceil(rateLimit.windowMs / 1000));

    const results = await pipeline.exec();
    const count = results?.[2]?.[1] as number;

    return count <= rateLimit.maxRequests;
  }

  /**
   * Create timeout promise
   */
  private createTimeout(ms: number): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`Processing timeout after ${ms}ms`)), ms);
    });
  }

  /**
   * Setup Redis queues
   */
  private setupQueues(): void {
    // Ensure queues exist (Redis will create them automatically)
    webhookLogger.info('Webhook queues configured', {
      processingQueue: this.processingQueue,
      retryQueue: this.retryQueue,
      deadLetterQueue: this.deadLetterQueue,
    });
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<{ status: 'ok' | 'error'; details?: any }> {
    try {
      const stats = await this.getStats();
      const redisStatus = await this.redis.ping();

      return {
        status: 'ok',
        details: {
          redis: redisStatus === 'PONG' ? 'connected' : 'disconnected',
          processing: this.isProcessing,
          stats,
          handlers: this.handlers.size,
        },
      };
    } catch (error) {
      return {
        status: 'error',
        details: (error as Error).message,
      };
    }
  }
}