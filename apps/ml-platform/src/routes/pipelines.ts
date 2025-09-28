import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { FineTuningJob, HyperParameters } from '../types/index.js';
import { logger } from '../lib/logger.js';

// Request schemas
const createDatasetSchema = z.object({
  name: z.string().min(1).max(100),
  type: z.enum(['text', 'conversation', 'classification', 'completion']),
  format: z.enum(['jsonl', 'csv', 'json']),
  filePath: z.string().min(1),
  metadata: z.record(z.any()).optional()
});

const fineTuningJobSchema = z.object({
  modelId: z.string().min(1),
  provider: z.string().min(1),
  datasetId: z.string().min(1),
  hyperparameters: z.object({
    learningRate: z.number().min(0.00001).max(1).optional(),
    batchSize: z.number().min(1).max(512).optional(),
    epochs: z.number().min(1).max(100).optional(),
    warmupSteps: z.number().min(0).optional(),
    weightDecay: z.number().min(0).max(1).optional(),
    gradient_accumulation_steps: z.number().min(1).optional()
  }).optional(),
  metadata: z.record(z.any()).optional()
});

const customTrainingJobSchema = z.object({
  modelArchitecture: z.string().min(1),
  datasetId: z.string().min(1),
  hyperparameters: z.record(z.any()),
  outputPath: z.string().min(1)
});

const deploymentSchema = z.object({
  modelId: z.string().min(1),
  modelPath: z.string().min(1),
  deployment: z.object({
    name: z.string().min(1),
    environment: z.enum(['development', 'staging', 'production']),
    resources: z.object({
      cpu: z.string(),
      memory: z.string(),
      gpu: z.string().optional()
    }),
    scaling: z.object({
      minReplicas: z.number().min(1),
      maxReplicas: z.number().min(1),
      targetCPU: z.number().min(1).max(100)
    })
  })
});

export async function pipelineRoutes(fastify: FastifyInstance): Promise<void> {
  const { pipelineManager } = fastify.platform;

  // Dataset Management

  // Create dataset
  fastify.post('/datasets', async (request: FastifyRequest<{
    Body: z.infer<typeof createDatasetSchema>
  }>, reply: FastifyReply) => {
    try {
      const { name, type, format, filePath, metadata } = createDatasetSchema.parse(request.body);

      const dataset = await pipelineManager.createDataset(
        name,
        type,
        format,
        filePath,
        metadata
      );

      return {
        success: true,
        data: dataset,
        message: `Dataset ${name} created successfully`,
        timestamp: new Date()
      };

    } catch (error) {
      logger.error('Failed to create dataset:', error);
      
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
        error: 'Failed to create dataset',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date()
      };
    }
  });

  // Validate dataset
  fastify.post('/datasets/validate', async (request: FastifyRequest<{
    Body: {
      name: string;
      type: 'text' | 'conversation' | 'classification' | 'completion';
      format: 'jsonl' | 'csv' | 'json';
      filePath: string;
    }
  }>, reply: FastifyReply) => {
    try {
      const { name, type, format, filePath } = request.body;

      // Create temporary dataset for validation
      const dataset = {
        id: `temp_${Date.now()}`,
        name,
        type,
        format,
        path: filePath,
        size: 0,
        samples: 0
      };

      const validation = await pipelineManager.validateDataset(dataset);

      return {
        success: true,
        data: {
          dataset: { name, type, format, filePath },
          validation
        },
        timestamp: new Date()
      };

    } catch (error) {
      logger.error('Dataset validation failed:', error);
      reply.status(500);
      return {
        success: false,
        error: 'Dataset validation failed',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date()
      };
    }
  });

  // Fine-tuning Jobs

  // Create fine-tuning job
  fastify.post('/fine-tuning', async (request: FastifyRequest<{
    Body: z.infer<typeof fineTuningJobSchema> & { datasetPath?: string }
  }>, reply: FastifyReply) => {
    try {
      const { 
        modelId, 
        provider, 
        datasetId, 
        datasetPath,
        hyperparameters, 
        metadata 
      } = fineTuningJobSchema.extend({
        datasetPath: z.string().optional()
      }).parse(request.body);

      // Create dataset if path provided instead of ID
      let dataset: any;
      if (datasetPath && !datasetId) {
        dataset = await pipelineManager.createDataset(
          `dataset_${Date.now()}`,
          'conversation',
          'jsonl',
          datasetPath
        );
      } else {
        // In a real implementation, retrieve dataset by ID
        dataset = {
          id: datasetId,
          name: `Dataset ${datasetId}`,
          type: 'conversation',
          format: 'jsonl',
          path: datasetPath || '/tmp/dataset.jsonl',
          size: 1024,
          samples: 100
        };
      }

      const job = await pipelineManager.createFineTuningJob(
        modelId,
        provider,
        dataset,
        hyperparameters,
        metadata
      );

      return {
        success: true,
        data: job,
        message: `Fine-tuning job ${job.id} created successfully`,
        timestamp: new Date()
      };

    } catch (error) {
      logger.error('Failed to create fine-tuning job:', error);
      
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
        error: 'Failed to create fine-tuning job',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date()
      };
    }
  });

  // Get fine-tuning job
  fastify.get('/fine-tuning/:jobId', async (request: FastifyRequest<{
    Params: { jobId: string }
  }>, reply: FastifyReply) => {
    try {
      const { jobId } = request.params;
      const job = pipelineManager.getFineTuningJob(jobId);

      if (!job) {
        reply.status(404);
        return {
          success: false,
          error: `Fine-tuning job ${jobId} not found`,
          timestamp: new Date()
        };
      }

      return {
        success: true,
        data: job,
        timestamp: new Date()
      };

    } catch (error) {
      logger.error('Failed to get fine-tuning job:', error);
      reply.status(500);
      return {
        success: false,
        error: 'Failed to retrieve fine-tuning job',
        timestamp: new Date()
      };
    }
  });

  // List all fine-tuning jobs
  fastify.get('/fine-tuning', async (request: FastifyRequest<{
    Querystring: { 
      status?: string; 
      provider?: string; 
      limit?: number; 
      offset?: number 
    }
  }>, reply: FastifyReply) => {
    try {
      const { status, provider, limit = 50, offset = 0 } = request.query;
      
      let jobs = pipelineManager.getAllFineTuningJobs();

      // Apply filters
      if (status) {
        jobs = jobs.filter(job => job.status === status);
      }
      if (provider) {
        jobs = jobs.filter(job => job.provider === provider);
      }

      // Apply pagination
      const total = jobs.length;
      const paginatedJobs = jobs.slice(offset, offset + limit);

      return {
        success: true,
        data: paginatedJobs,
        pagination: {
          total,
          limit,
          offset,
          count: paginatedJobs.length
        },
        filters: { status, provider },
        timestamp: new Date()
      };

    } catch (error) {
      logger.error('Failed to list fine-tuning jobs:', error);
      reply.status(500);
      return {
        success: false,
        error: 'Failed to retrieve fine-tuning jobs',
        timestamp: new Date()
      };
    }
  });

  // Cancel fine-tuning job
  fastify.delete('/fine-tuning/:jobId', async (request: FastifyRequest<{
    Params: { jobId: string }
  }>, reply: FastifyReply) => {
    try {
      const { jobId } = request.params;
      const cancelled = await pipelineManager.cancelJob(jobId);

      if (!cancelled) {
        reply.status(404);
        return {
          success: false,
          error: `Job ${jobId} not found or cannot be cancelled`,
          timestamp: new Date()
        };
      }

      return {
        success: true,
        data: {
          jobId,
          status: 'cancelled',
          message: `Job ${jobId} cancelled successfully`
        },
        timestamp: new Date()
      };

    } catch (error) {
      logger.error('Failed to cancel fine-tuning job:', error);
      reply.status(500);
      return {
        success: false,
        error: 'Failed to cancel job',
        timestamp: new Date()
      };
    }
  });

  // Custom Training Jobs

  // Create custom training job
  fastify.post('/training', async (request: FastifyRequest<{
    Body: z.infer<typeof customTrainingJobSchema>
  }>, reply: FastifyReply) => {
    try {
      const { 
        modelArchitecture, 
        datasetId, 
        hyperparameters, 
        outputPath 
      } = customTrainingJobSchema.parse(request.body);

      // Mock dataset for now
      const dataset = {
        id: datasetId,
        name: `Dataset ${datasetId}`,
        type: 'classification' as const,
        format: 'csv' as const,
        path: '/tmp/training_data.csv',
        size: 2048,
        samples: 1000
      };

      const jobId = await pipelineManager.createCustomTrainingJob(
        modelArchitecture,
        dataset,
        hyperparameters,
        outputPath
      );

      return {
        success: true,
        data: {
          jobId,
          modelArchitecture,
          datasetId,
          outputPath,
          status: 'pending',
          message: `Custom training job ${jobId} created successfully`
        },
        timestamp: new Date()
      };

    } catch (error) {
      logger.error('Failed to create training job:', error);
      
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
        error: 'Failed to create training job',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date()
      };
    }
  });

  // Model Deployment

  // Deploy model
  fastify.post('/deploy', async (request: FastifyRequest<{
    Body: z.infer<typeof deploymentSchema>
  }>, reply: FastifyReply) => {
    try {
      const { modelId, modelPath, deployment } = deploymentSchema.parse(request.body);

      const deploymentId = await pipelineManager.deployModel(
        modelId,
        modelPath,
        deployment
      );

      return {
        success: true,
        data: {
          deploymentId,
          modelId,
          deployment,
          status: 'pending',
          message: `Deployment ${deploymentId} created successfully`
        },
        timestamp: new Date()
      };

    } catch (error) {
      logger.error('Failed to deploy model:', error);
      
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
        error: 'Failed to deploy model',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date()
      };
    }
  });

  // Queue Management

  // Get queue statistics
  fastify.get('/queues/stats', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const stats = await pipelineManager.getQueueStats();

      return {
        success: true,
        data: stats,
        timestamp: new Date()
      };

    } catch (error) {
      logger.error('Failed to get queue stats:', error);
      reply.status(500);
      return {
        success: false,
        error: 'Failed to retrieve queue statistics',
        timestamp: new Date()
      };
    }
  });

  // Pipeline health check
  fastify.get('/health', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const isHealthy = await pipelineManager.healthCheck();

      return {
        success: true,
        data: {
          status: isHealthy ? 'healthy' : 'unhealthy',
          details: {
            redis: isHealthy,
            queues: isHealthy,
            workers: isHealthy
          }
        },
        timestamp: new Date()
      };

    } catch (error) {
      logger.error('Pipeline health check failed:', error);
      reply.status(500);
      return {
        success: false,
        error: 'Health check failed',
        timestamp: new Date()
      };
    }
  });

  // Get job logs
  fastify.get('/jobs/:jobId/logs', async (request: FastifyRequest<{
    Params: { jobId: string }
    Querystring: { limit?: number; offset?: number }
  }>, reply: FastifyReply) => {
    try {
      const { jobId } = request.params;
      const { limit = 100, offset = 0 } = request.query;

      // Mock logs for now
      const logs = Array.from({ length: Math.min(limit, 50) }, (_, i) => ({
        timestamp: new Date(Date.now() - (i * 60000)),
        level: ['info', 'debug', 'warn', 'error'][Math.floor(Math.random() * 4)],
        message: `Job ${jobId} log entry ${offset + i + 1}`,
        metadata: {
          step: Math.floor(Math.random() * 10),
          progress: Math.random() * 100
        }
      })).reverse();

      return {
        success: true,
        data: {
          jobId,
          logs,
          pagination: {
            limit,
            offset,
            count: logs.length,
            hasMore: offset + limit < 1000 // Mock total
          }
        },
        timestamp: new Date()
      };

    } catch (error) {
      logger.error('Failed to get job logs:', error);
      reply.status(500);
      return {
        success: false,
        error: 'Failed to retrieve job logs',
        timestamp: new Date()
      };
    }
  });

  // Download model artifacts
  fastify.get('/jobs/:jobId/artifacts/:artifactName', async (request: FastifyRequest<{
    Params: { jobId: string; artifactName: string }
  }>, reply: FastifyReply) => {
    try {
      const { jobId, artifactName } = request.params;

      // Mock artifact download
      const artifactContent = `Mock artifact content for job ${jobId}, artifact ${artifactName}`;
      
      reply.type('application/octet-stream');
      reply.header('Content-Disposition', `attachment; filename="${artifactName}"`);
      
      return artifactContent;

    } catch (error) {
      logger.error('Failed to download artifact:', error);
      reply.status(500);
      return {
        success: false,
        error: 'Failed to download artifact',
        timestamp: new Date()
      };
    }
  });

  // Get supported providers and models for fine-tuning
  fastify.get('/fine-tuning/supported', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // Mock supported configurations
      const supported = {
        providers: {
          openai: {
            models: ['gpt-3.5-turbo', 'davinci-002', 'babbage-002'],
            formats: ['jsonl'],
            maxFileSize: '100MB',
            maxSamples: 50000
          },
          huggingface: {
            models: ['bert-base-uncased', 'roberta-base', 'distilbert-base'],
            formats: ['jsonl', 'csv'],
            maxFileSize: '500MB',
            maxSamples: 100000
          }
        },
        hyperparameters: {
          learningRate: {
            type: 'float',
            min: 0.00001,
            max: 1.0,
            default: 0.0001,
            description: 'Learning rate for training'
          },
          batchSize: {
            type: 'integer',
            min: 1,
            max: 512,
            default: 16,
            description: 'Batch size for training'
          },
          epochs: {
            type: 'integer',
            min: 1,
            max: 100,
            default: 3,
            description: 'Number of training epochs'
          }
        }
      };

      return {
        success: true,
        data: supported,
        timestamp: new Date()
      };

    } catch (error) {
      logger.error('Failed to get supported configurations:', error);
      reply.status(500);
      return {
        success: false,
        error: 'Failed to retrieve supported configurations',
        timestamp: new Date()
      };
    }
  });
}