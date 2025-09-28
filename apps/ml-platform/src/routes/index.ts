import { FastifyInstance } from 'fastify';
import { MLPlatformServer } from '../server.js';
import { modelRoutes } from './models.js';
import { vectorRoutes } from './vectors.js';
import { pipelineRoutes } from './pipelines.js';
import { orchestratorRoutes } from './orchestrator.js';
import { mlopsRoutes } from './mlops.js';
import { automlRoutes } from './automl.js';
import { logger } from '../lib/logger.js';

export async function registerRoutes(
  fastify: FastifyInstance, 
  platform: MLPlatformServer
): Promise<void> {
  // Add platform to fastify context
  fastify.decorate('platform', platform);

  // API versioning
  await fastify.register(async function(fastify) {
    // Health check (already defined in server.ts, but add detailed version here)
    fastify.get('/health/detailed', async () => {
      const [modelHealth, vectorHealth, pipelineHealth] = await Promise.all([
        platform.modelManager.healthCheck(),
        platform.vectorManager.healthCheck(),
        platform.pipelineManager.healthCheck()
      ]);

      const services = {
        models: modelHealth,
        vectors: vectorHealth,
        pipelines: pipelineHealth,
        orchestrator: true,
        mlops: await platform.mlopsManager.healthCheck(),
        automl: true
      };

      const allHealthy = Object.values(services).every(status => 
        typeof status === 'boolean' ? status : Object.values(status).every(s => s)
      );

      return {
        status: allHealthy ? 'healthy' : 'degraded',
        timestamp: new Date(),
        services,
        version: process.env.npm_package_version || '1.0.0',
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        platform: {
          node: process.version,
          arch: process.arch,
          platform: process.platform
        }
      };
    });

    // Metrics endpoint for Prometheus
    fastify.get('/metrics', async (request, reply) => {
      const metrics = platform.mlopsManager.getPrometheusMetrics();
      reply.type('text/plain');
      return metrics;
    });

    // Platform info
    fastify.get('/info', async () => {
      const providers = platform.modelManager.getProviders();
      const vectorProviders = platform.vectorManager.getAvailableProviders();
      const automlAlgorithms = platform.automlService.getAvailableAlgorithms();
      const orchestratorTools = platform.orchestrator.getAvailableTools();
      const collaborationPatterns = platform.orchestrator.getCollaborationPatterns();

      return {
        platform: 'Urnlabs AI/ML Platform',
        version: process.env.npm_package_version || '1.0.0',
        capabilities: {
          modelProviders: providers.map(p => ({
            id: p.id,
            name: p.name,
            type: p.type,
            isActive: p.isActive,
            modelCount: p.models.length,
            capabilities: p.capabilities
          })),
          vectorDatabases: vectorProviders,
          automlAlgorithms,
          orchestrationTools: orchestratorTools,
          collaborationPatterns: collaborationPatterns.map(p => ({
            id: p.id,
            name: p.name,
            description: p.description
          }))
        },
        features: {
          fineTuning: true,
          customTraining: true,
          vectorSearch: true,
          multiAgentOrchestration: true,
          autoML: true,
          mlops: true,
          realTimeInference: true
        }
      };
    });

  }, { prefix: '/api/v1' });

  // Register feature-specific routes
  await fastify.register(modelRoutes, { prefix: '/api/v1/models' });
  await fastify.register(vectorRoutes, { prefix: '/api/v1/vectors' });
  await fastify.register(pipelineRoutes, { prefix: '/api/v1/pipelines' });
  await fastify.register(orchestratorRoutes, { prefix: '/api/v1/orchestrator' });
  await fastify.register(mlopsRoutes, { prefix: '/api/v1/mlops' });
  await fastify.register(automlRoutes, { prefix: '/api/v1/automl' });

  // WebSocket routes for real-time updates
  await fastify.register(async function(fastify) {
    fastify.get('/ws', { websocket: true }, (connection, req) => {
      logger.info('WebSocket connection established');
      
      connection.socket.on('message', (message) => {
        try {
          const data = JSON.parse(message.toString());
          handleWebSocketMessage(data, connection, platform);
        } catch (error) {
          logger.error('WebSocket message error:', error);
          connection.socket.send(JSON.stringify({
            type: 'error',
            message: 'Invalid message format'
          }));
        }
      });

      connection.socket.on('close', () => {
        logger.info('WebSocket connection closed');
      });

      // Send welcome message
      connection.socket.send(JSON.stringify({
        type: 'welcome',
        message: 'Connected to Urnlabs ML Platform',
        timestamp: new Date()
      }));
    });
  }, { prefix: '/api/v1' });

  logger.info('All API routes registered successfully');
}

function handleWebSocketMessage(
  data: any, 
  connection: any, 
  platform: MLPlatformServer
): void {
  switch (data.type) {
    case 'subscribe':
      handleSubscription(data, connection, platform);
      break;
    
    case 'unsubscribe':
      handleUnsubscription(data, connection);
      break;
    
    case 'ping':
      connection.socket.send(JSON.stringify({
        type: 'pong',
        timestamp: new Date()
      }));
      break;
    
    default:
      connection.socket.send(JSON.stringify({
        type: 'error',
        message: `Unknown message type: ${data.type}`
      }));
  }
}

function handleSubscription(
  data: any, 
  connection: any, 
  platform: MLPlatformServer
): void {
  const { channel } = data;
  
  switch (channel) {
    case 'pipeline_jobs':
      // Subscribe to pipeline job updates
      // This would integrate with the pipeline manager's event system
      connection.socket.send(JSON.stringify({
        type: 'subscribed',
        channel: 'pipeline_jobs',
        message: 'Subscribed to pipeline job updates'
      }));
      break;
    
    case 'automl_experiments':
      // Subscribe to AutoML experiment updates
      platform.automlService.on('experimentCompleted', (job, experiment, current, total) => {
        connection.socket.send(JSON.stringify({
          type: 'automl_experiment_update',
          jobId: job.id,
          experiment,
          progress: {
            current,
            total,
            percentage: Math.round((current / total) * 100)
          }
        }));
      });
      
      connection.socket.send(JSON.stringify({
        type: 'subscribed',
        channel: 'automl_experiments',
        message: 'Subscribed to AutoML experiment updates'
      }));
      break;
    
    case 'workflow_executions':
      // Subscribe to workflow execution updates
      platform.orchestrator.on('workflowCompleted', (execution) => {
        connection.socket.send(JSON.stringify({
          type: 'workflow_completed',
          execution: {
            id: execution.id,
            workflowId: execution.workflowId,
            status: execution.status,
            duration: execution.completedAt 
              ? execution.completedAt.getTime() - execution.startedAt.getTime()
              : null
          }
        }));
      });
      
      connection.socket.send(JSON.stringify({
        type: 'subscribed',
        channel: 'workflow_executions',
        message: 'Subscribed to workflow execution updates'
      }));
      break;
    
    default:
      connection.socket.send(JSON.stringify({
        type: 'error',
        message: `Unknown channel: ${channel}`
      }));
  }
}

function handleUnsubscription(data: any, connection: any): void {
  const { channel } = data;
  
  // Remove listeners (this would need proper listener management)
  connection.socket.send(JSON.stringify({
    type: 'unsubscribed',
    channel,
    message: `Unsubscribed from ${channel}`
  }));
}

// Error handler for routes
export function setupErrorHandling(fastify: FastifyInstance): void {
  fastify.setNotFoundHandler(async (request, reply) => {
    reply.status(404).send({
      error: 'Not Found',
      message: `Route ${request.method} ${request.url} not found`,
      statusCode: 404,
      timestamp: new Date()
    });
  });

  fastify.setErrorHandler(async (error, request, reply) => {
    const statusCode = error.statusCode || 500;
    
    logger.error('Request error:', {
      error: error.message,
      stack: error.stack,
      url: request.url,
      method: request.method,
      statusCode
    });

    reply.status(statusCode).send({
      error: error.name || 'Internal Server Error',
      message: statusCode === 500 ? 'An internal server error occurred' : error.message,
      statusCode,
      timestamp: new Date(),
      requestId: request.id
    });
  });
}

// Type augmentation for Fastify
declare module 'fastify' {
  interface FastifyInstance {
    platform: MLPlatformServer;
  }
}