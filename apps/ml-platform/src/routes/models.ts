import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { ModelRequest, ModelResponse } from '../types/index.js';
import { logger, logModelInference } from '../lib/logger.js';

// Request schemas
const completionRequestSchema = z.object({
  model: z.string(),
  provider: z.string().optional(),
  messages: z.array(z.object({
    role: z.enum(['system', 'user', 'assistant', 'function']),
    content: z.string(),
    name: z.string().optional(),
    functionCall: z.object({
      name: z.string(),
      arguments: z.string()
    }).optional()
  })).optional(),
  prompt: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().min(1).max(100000).optional(),
  stream: z.boolean().optional(),
  functions: z.array(z.object({
    name: z.string(),
    description: z.string(),
    parameters: z.record(z.any())
  })).optional(),
  systemPrompt: z.string().optional(),
  metadata: z.record(z.any()).optional()
});

const embeddingRequestSchema = z.object({
  text: z.string().min(1),
  model: z.string().optional()
});

const compareModelsSchema = z.object({
  prompt: z.string().min(1),
  models: z.array(z.string()).min(2),
  criteria: z.array(z.string()).optional()
});

const batchRequestSchema = z.object({
  requests: z.array(completionRequestSchema).min(1).max(100),
  batchId: z.string().optional()
});

export async function modelRoutes(fastify: FastifyInstance): Promise<void> {
  const { modelManager, mlopsManager } = fastify.platform;

  // Get all providers
  fastify.get('/providers', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const providers = modelManager.getProviders();
      
      return {
        success: true,
        data: providers,
        count: providers.length,
        timestamp: new Date()
      };
    } catch (error) {
      logger.error('Failed to get providers:', error);
      reply.status(500);
      return {
        success: false,
        error: 'Failed to retrieve providers',
        timestamp: new Date()
      };
    }
  });

  // Get specific provider
  fastify.get('/providers/:providerId', async (request: FastifyRequest<{
    Params: { providerId: string }
  }>, reply: FastifyReply) => {
    try {
      const { providerId } = request.params;
      const provider = modelManager.getProvider(providerId);
      
      if (!provider) {
        reply.status(404);
        return {
          success: false,
          error: `Provider ${providerId} not found`,
          timestamp: new Date()
        };
      }

      return {
        success: true,
        data: provider,
        timestamp: new Date()
      };
    } catch (error) {
      logger.error('Failed to get provider:', error);
      reply.status(500);
      return {
        success: false,
        error: 'Failed to retrieve provider',
        timestamp: new Date()
      };
    }
  });

  // Get all models
  fastify.get('/', async (request: FastifyRequest<{
    Querystring: { provider?: string; type?: string; capability?: string }
  }>, reply: FastifyReply) => {
    try {
      const { provider, type, capability } = request.query;
      let models = modelManager.getModels(provider);

      // Filter by type
      if (type) {
        models = models.filter(model => model.type === type);
      }

      // Filter by capability
      if (capability) {
        models = models.filter(model => model.capabilities.includes(capability as any));
      }

      return {
        success: true,
        data: models,
        count: models.length,
        filters: { provider, type, capability },
        timestamp: new Date()
      };
    } catch (error) {
      logger.error('Failed to get models:', error);
      reply.status(500);
      return {
        success: false,
        error: 'Failed to retrieve models',
        timestamp: new Date()
      };
    }
  });

  // Get specific model
  fastify.get('/:modelId', async (request: FastifyRequest<{
    Params: { modelId: string }
    Querystring: { provider?: string }
  }>, reply: FastifyReply) => {
    try {
      const { modelId } = request.params;
      const { provider } = request.query;
      
      const model = modelManager.getModel(modelId, provider);
      
      if (!model) {
        reply.status(404);
        return {
          success: false,
          error: `Model ${modelId} not found`,
          timestamp: new Date()
        };
      }

      return {
        success: true,
        data: model,
        timestamp: new Date()
      };
    } catch (error) {
      logger.error('Failed to get model:', error);
      reply.status(500);
      return {
        success: false,
        error: 'Failed to retrieve model',
        timestamp: new Date()
      };
    }
  });

  // Generate completion
  fastify.post('/completions', async (request: FastifyRequest<{
    Body: z.infer<typeof completionRequestSchema>
  }>, reply: FastifyReply) => {
    try {
      const validatedBody = completionRequestSchema.parse(request.body);
      const startTime = Date.now();

      const modelRequest: ModelRequest = {
        ...validatedBody,
        metadata: {
          ...validatedBody.metadata,
          requestId: request.id,
          userAgent: request.headers['user-agent'],
          ip: request.ip
        }
      };

      const response = await modelManager.generateCompletion(modelRequest);
      const duration = Date.now() - startTime;

      // Log metrics
      logModelInference(
        response.model,
        response.provider,
        response.usage.totalTokens,
        duration,
        response.usage.cost
      );

      // Record metrics for MLOps
      await mlopsManager.recordModelInference(
        response.model,
        response.provider,
        duration,
        {
          input: response.usage.promptTokens,
          output: response.usage.completionTokens
        },
        response.usage.cost || 0,
        true
      );

      return {
        success: true,
        data: response,
        performance: {
          duration,
          tokensPerSecond: response.usage.totalTokens / (duration / 1000)
        },
        timestamp: new Date()
      };

    } catch (error) {
      const duration = Date.now() - Date.now();
      
      // Record failed inference
      await mlopsManager.recordModelInference(
        'unknown',
        'unknown',
        duration,
        { input: 0, output: 0 },
        0,
        false
      );

      logger.error('Completion request failed:', error);
      
      if (error instanceof z.ZodError) {
        reply.status(400);
        return {
          success: false,
          error: 'Invalid request format',
          details: error.errors,
          timestamp: new Date()
        };
      }

      reply.status(500);
      return {
        success: false,
        error: 'Failed to generate completion',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date()
      };
    }
  });

  // Generate embeddings
  fastify.post('/embeddings', async (request: FastifyRequest<{
    Body: z.infer<typeof embeddingRequestSchema>
  }>, reply: FastifyReply) => {
    try {
      const { text, model } = embeddingRequestSchema.parse(request.body);
      const startTime = Date.now();

      const embedding = await modelManager.generateEmbedding(text, model);
      const duration = Date.now() - startTime;

      return {
        success: true,
        data: {
          embedding,
          dimensions: embedding.length,
          model: model || 'text-embedding-3-small',
          text: text.substring(0, 100) + (text.length > 100 ? '...' : '')
        },
        performance: {
          duration
        },
        timestamp: new Date()
      };

    } catch (error) {
      logger.error('Embedding request failed:', error);
      
      if (error instanceof z.ZodError) {
        reply.status(400);
        return {
          success: false,
          error: 'Invalid request format',
          details: error.errors,
          timestamp: new Date()
        };
      }

      reply.status(500);
      return {
        success: false,
        error: 'Failed to generate embedding',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date()
      };
    }
  });

  // Compare models
  fastify.post('/compare', async (request: FastifyRequest<{
    Body: z.infer<typeof compareModelsSchema>
  }>, reply: FastifyReply) => {
    try {
      const { prompt, models, criteria } = compareModelsSchema.parse(request.body);
      const startTime = Date.now();

      const comparison = await modelManager.compareModels(prompt, models, criteria);
      const duration = Date.now() - startTime;

      return {
        success: true,
        data: comparison,
        performance: {
          duration,
          modelsCompared: models.length
        },
        timestamp: new Date()
      };

    } catch (error) {
      logger.error('Model comparison failed:', error);
      
      if (error instanceof z.ZodError) {
        reply.status(400);
        return {
          success: false,
          error: 'Invalid request format',
          details: error.errors,
          timestamp: new Date()
        };
      }

      reply.status(500);
      return {
        success: false,
        error: 'Failed to compare models',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date()
      };
    }
  });

  // Batch completions
  fastify.post('/batch', async (request: FastifyRequest<{
    Body: z.infer<typeof batchRequestSchema>
  }>, reply: FastifyReply) => {
    try {
      const { requests, batchId } = batchRequestSchema.parse(request.body);
      const startTime = Date.now();
      const actualBatchId = batchId || `batch_${Date.now()}`;

      // Process requests in parallel (with concurrency limit)
      const maxConcurrency = 5;
      const results: Array<{ success: boolean; data?: ModelResponse; error?: string; index: number }> = [];

      for (let i = 0; i < requests.length; i += maxConcurrency) {
        const batch = requests.slice(i, i + maxConcurrency);
        const batchPromises = batch.map(async (req, batchIndex) => {
          const globalIndex = i + batchIndex;
          try {
            const modelRequest: ModelRequest = {
              ...req,
              metadata: {
                ...req.metadata,
                batchId: actualBatchId,
                batchIndex: globalIndex,
                requestId: `${request.id}_${globalIndex}`
              }
            };

            const response = await modelManager.generateCompletion(modelRequest);
            return { success: true, data: response, index: globalIndex };
          } catch (error) {
            return {
              success: false,
              error: error instanceof Error ? error.message : 'Unknown error',
              index: globalIndex
            };
          }
        });

        const batchResults = await Promise.all(batchPromises);
        results.push(...batchResults);
      }

      const duration = Date.now() - startTime;
      const successCount = results.filter(r => r.success).length;
      const failureCount = results.length - successCount;

      return {
        success: true,
        data: {
          batchId: actualBatchId,
          results: results.sort((a, b) => a.index - b.index),
          summary: {
            total: requests.length,
            successful: successCount,
            failed: failureCount,
            successRate: (successCount / requests.length) * 100
          }
        },
        performance: {
          duration,
          requestsPerSecond: requests.length / (duration / 1000)
        },
        timestamp: new Date()
      };

    } catch (error) {
      logger.error('Batch completion failed:', error);
      
      if (error instanceof z.ZodError) {
        reply.status(400);
        return {
          success: false,
          error: 'Invalid request format',
          details: error.errors,
          timestamp: new Date()
        };
      }

      reply.status(500);
      return {
        success: false,
        error: 'Failed to process batch',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date()
      };
    }
  });

  // Get model capabilities
  fastify.get('/:modelId/capabilities', async (request: FastifyRequest<{
    Params: { modelId: string }
    Querystring: { provider?: string }
  }>, reply: FastifyReply) => {
    try {
      const { modelId } = request.params;
      const { provider } = request.query;

      const capabilities = modelManager.getModelCapabilities(modelId, provider);
      
      if (capabilities.length === 0) {
        reply.status(404);
        return {
          success: false,
          error: `Model ${modelId} not found`,
          timestamp: new Date()
        };
      }

      return {
        success: true,
        data: {
          modelId,
          provider,
          capabilities
        },
        timestamp: new Date()
      };

    } catch (error) {
      logger.error('Failed to get model capabilities:', error);
      reply.status(500);
      return {
        success: false,
        error: 'Failed to retrieve model capabilities',
        timestamp: new Date()
      };
    }
  });

  // Model health check
  fastify.get('/health', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const health = await modelManager.healthCheck();
      const allHealthy = Object.values(health).every(status => status);

      return {
        success: true,
        data: {
          overall: allHealthy ? 'healthy' : 'degraded',
          providers: health
        },
        timestamp: new Date()
      };

    } catch (error) {
      logger.error('Model health check failed:', error);
      reply.status(500);
      return {
        success: false,
        error: 'Health check failed',
        timestamp: new Date()
      };
    }
  });

  // Get model usage statistics
  fastify.get('/stats', async (request: FastifyRequest<{
    Querystring: { 
      period?: string;
      model?: string;
      provider?: string;
    }
  }>, reply: FastifyReply) => {
    try {
      const { period = '24h', model, provider } = request.query;

      // This would integrate with MLOps metrics
      // For now, return mock statistics
      const stats = {
        period,
        totalRequests: Math.floor(Math.random() * 10000),
        successfulRequests: Math.floor(Math.random() * 9500),
        failedRequests: Math.floor(Math.random() * 500),
        averageLatency: 150 + Math.random() * 300,
        totalTokens: Math.floor(Math.random() * 1000000),
        totalCost: Math.random() * 100,
        topModels: [
          { model: 'gpt-3.5-turbo', requests: Math.floor(Math.random() * 1000) },
          { model: 'claude-3-haiku', requests: Math.floor(Math.random() * 800) },
          { model: 'gpt-4', requests: Math.floor(Math.random() * 600) }
        ]
      };

      return {
        success: true,
        data: stats,
        filters: { period, model, provider },
        timestamp: new Date()
      };

    } catch (error) {
      logger.error('Failed to get model stats:', error);
      reply.status(500);
      return {
        success: false,
        error: 'Failed to retrieve statistics',
        timestamp: new Date()
      };
    }
  });
}