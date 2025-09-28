import { FastifyPluginAsync } from 'fastify';
import { AutoMLService } from '../automl/automl-service.js';
import { ModelManager } from '../models/model-manager.js';
import { MLOpsManager } from '../monitoring/mlops-manager.js';
import { logger } from '../lib/logger.js';
import {
  CreateAutoMLJobRequest,
  AutoMLJobType,
  AutoMLJobStatus,
  OptimizationMetric
} from '../types/index.js';

const automlRoutes: FastifyPluginAsync = async (fastify) => {
  // Initialize services
  const modelManager = new ModelManager();
  const mlopsManager = new MLOpsManager();
  const automlService = new AutoMLService(modelManager, mlopsManager);

  // AutoML Job Management
  fastify.post<{ Body: CreateAutoMLJobRequest }>('/jobs', async (request, reply) => {
    try {
      const job = await automlService.createJob(request.body);

      logger.automl.info('AutoML job created', {
        jobId: job.id,
        type: job.type,
        dataset: job.config.dataset
      });

      return {
        success: true,
        data: job
      };
    } catch (error) {
      logger.automl.error('Failed to create AutoML job', { error });
      return reply.status(500).send({
        success: false,
        error: 'Failed to create AutoML job'
      });
    }
  });

  fastify.get('/jobs', async (request, reply) => {
    try {
      const { status, type } = request.query as {
        status?: AutoMLJobStatus;
        type?: AutoMLJobType;
      };

      const jobs = await automlService.listJobs({ status, type });

      return {
        success: true,
        data: jobs
      };
    } catch (error) {
      logger.automl.error('Failed to list AutoML jobs', { error });
      return reply.status(500).send({
        success: false,
        error: 'Failed to list AutoML jobs'
      });
    }
  });

  fastify.get<{ Params: { jobId: string } }>('/jobs/:jobId', async (request, reply) => {
    try {
      const job = await automlService.getJob(request.params.jobId);

      if (!job) {
        return reply.status(404).send({
          success: false,
          error: 'AutoML job not found'
        });
      }

      return {
        success: true,
        data: job
      };
    } catch (error) {
      logger.automl.error('Failed to get AutoML job', {
        jobId: request.params.jobId,
        error
      });
      return reply.status(500).send({
        success: false,
        error: 'Failed to get AutoML job'
      });
    }
  });

  fastify.post<{ Params: { jobId: string } }>('/jobs/:jobId/start', async (request, reply) => {
    try {
      await automlService.startJob(request.params.jobId);

      logger.automl.info('AutoML job started', {
        jobId: request.params.jobId
      });

      return {
        success: true,
        message: 'AutoML job started successfully'
      };
    } catch (error) {
      logger.automl.error('Failed to start AutoML job', {
        jobId: request.params.jobId,
        error
      });
      return reply.status(500).send({
        success: false,
        error: 'Failed to start AutoML job'
      });
    }
  });

  fastify.post<{ Params: { jobId: string } }>('/jobs/:jobId/stop', async (request, reply) => {
    try {
      await automlService.stopJob(request.params.jobId);

      logger.automl.info('AutoML job stopped', {
        jobId: request.params.jobId
      });

      return {
        success: true,
        message: 'AutoML job stopped successfully'
      };
    } catch (error) {
      logger.automl.error('Failed to stop AutoML job', {
        jobId: request.params.jobId,
        error
      });
      return reply.status(500).send({
        success: false,
        error: 'Failed to stop AutoML job'
      });
    }
  });

  fastify.delete<{ Params: { jobId: string } }>('/jobs/:jobId', async (request, reply) => {
    try {
      await automlService.deleteJob(request.params.jobId);

      logger.automl.info('AutoML job deleted', {
        jobId: request.params.jobId
      });

      return {
        success: true,
        message: 'AutoML job deleted successfully'
      };
    } catch (error) {
      logger.automl.error('Failed to delete AutoML job', {
        jobId: request.params.jobId,
        error
      });
      return reply.status(500).send({
        success: false,
        error: 'Failed to delete AutoML job'
      });
    }
  });

  // Job Progress and Results
  fastify.get<{ Params: { jobId: string } }>('/jobs/:jobId/progress', async (request, reply) => {
    try {
      const progress = await automlService.getJobProgress(request.params.jobId);

      return {
        success: true,
        data: progress
      };
    } catch (error) {
      logger.automl.error('Failed to get job progress', {
        jobId: request.params.jobId,
        error
      });
      return reply.status(500).send({
        success: false,
        error: 'Failed to get job progress'
      });
    }
  });

  fastify.get<{ Params: { jobId: string } }>('/jobs/:jobId/results', async (request, reply) => {
    try {
      const results = await automlService.getJobResults(request.params.jobId);

      if (!results) {
        return reply.status(404).send({
          success: false,
          error: 'Job results not available'
        });
      }

      return {
        success: true,
        data: results
      };
    } catch (error) {
      logger.automl.error('Failed to get job results', {
        jobId: request.params.jobId,
        error
      });
      return reply.status(500).send({
        success: false,
        error: 'Failed to get job results'
      });
    }
  });

  fastify.get<{ Params: { jobId: string } }>('/jobs/:jobId/logs', async (request, reply) => {
    try {
      const logs = await automlService.getJobLogs(request.params.jobId);

      return {
        success: true,
        data: logs
      };
    } catch (error) {
      logger.automl.error('Failed to get job logs', {
        jobId: request.params.jobId,
        error
      });
      return reply.status(500).send({
        success: false,
        error: 'Failed to get job logs'
      });
    }
  });

  // Model Management
  fastify.get<{ Params: { jobId: string } }>('/jobs/:jobId/models', async (request, reply) => {
    try {
      const models = await automlService.getBestModels(request.params.jobId);

      return {
        success: true,
        data: models
      };
    } catch (error) {
      logger.automl.error('Failed to get best models', {
        jobId: request.params.jobId,
        error
      });
      return reply.status(500).send({
        success: false,
        error: 'Failed to get best models'
      });
    }
  });

  fastify.post<{
    Params: { jobId: string, modelId: string },
    Body: { name: string; version?: string }
  }>('/jobs/:jobId/models/:modelId/deploy', async (request, reply) => {
    try {
      const { jobId, modelId } = request.params;
      const { name, version } = request.body;

      const deployment = await automlService.deployModel(jobId, modelId, name, version);

      logger.automl.info('AutoML model deployed', {
        jobId,
        modelId,
        deploymentId: deployment.id,
        name
      });

      return {
        success: true,
        data: deployment
      };
    } catch (error) {
      logger.automl.error('Failed to deploy AutoML model', {
        jobId: request.params.jobId,
        modelId: request.params.modelId,
        error
      });
      return reply.status(500).send({
        success: false,
        error: 'Failed to deploy AutoML model'
      });
    }
  });

  // Hyperparameter Optimization
  fastify.post<{
    Body: {
      algorithm: string;
      searchSpace: Record<string, any>;
      objective: OptimizationMetric;
      maxTrials: number;
      dataset: string;
    }
  }>('/optimization', async (request, reply) => {
    try {
      const optimization = await automlService.createOptimization(request.body);

      logger.automl.info('Hyperparameter optimization created', {
        optimizationId: optimization.id,
        algorithm: request.body.algorithm,
        maxTrials: request.body.maxTrials
      });

      return {
        success: true,
        data: optimization
      };
    } catch (error) {
      logger.automl.error('Failed to create hyperparameter optimization', { error });
      return reply.status(500).send({
        success: false,
        error: 'Failed to create hyperparameter optimization'
      });
    }
  });

  fastify.get<{ Params: { optimizationId: string } }>('/optimization/:optimizationId', async (request, reply) => {
    try {
      const optimization = await automlService.getOptimization(request.params.optimizationId);

      if (!optimization) {
        return reply.status(404).send({
          success: false,
          error: 'Optimization not found'
        });
      }

      return {
        success: true,
        data: optimization
      };
    } catch (error) {
      logger.automl.error('Failed to get optimization', {
        optimizationId: request.params.optimizationId,
        error
      });
      return reply.status(500).send({
        success: false,
        error: 'Failed to get optimization'
      });
    }
  });

  fastify.get<{ Params: { optimizationId: string } }>('/optimization/:optimizationId/trials', async (request, reply) => {
    try {
      const trials = await automlService.getOptimizationTrials(request.params.optimizationId);

      return {
        success: true,
        data: trials
      };
    } catch (error) {
      logger.automl.error('Failed to get optimization trials', {
        optimizationId: request.params.optimizationId,
        error
      });
      return reply.status(500).send({
        success: false,
        error: 'Failed to get optimization trials'
      });
    }
  });

  // Algorithm and Template Management
  fastify.get('/algorithms', async (request, reply) => {
    try {
      const algorithms = await automlService.getAvailableAlgorithms();

      return {
        success: true,
        data: algorithms
      };
    } catch (error) {
      logger.automl.error('Failed to get available algorithms', { error });
      return reply.status(500).send({
        success: false,
        error: 'Failed to get available algorithms'
      });
    }
  });

  fastify.get<{ Params: { algorithm: string } }>('/algorithms/:algorithm', async (request, reply) => {
    try {
      const algorithm = await automlService.getAlgorithmInfo(request.params.algorithm);

      if (!algorithm) {
        return reply.status(404).send({
          success: false,
          error: 'Algorithm not found'
        });
      }

      return {
        success: true,
        data: algorithm
      };
    } catch (error) {
      logger.automl.error('Failed to get algorithm info', {
        algorithm: request.params.algorithm,
        error
      });
      return reply.status(500).send({
        success: false,
        error: 'Failed to get algorithm info'
      });
    }
  });

  fastify.get('/templates', async (request, reply) => {
    try {
      const { type } = request.query as { type?: AutoMLJobType };
      const templates = await automlService.getJobTemplates(type);

      return {
        success: true,
        data: templates
      };
    } catch (error) {
      logger.automl.error('Failed to get job templates', { error });
      return reply.status(500).send({
        success: false,
        error: 'Failed to get job templates'
      });
    }
  });

  fastify.post<{
    Body: {
      name: string;
      type: AutoMLJobType;
      config: any;
      description?: string;
    }
  }>('/templates', async (request, reply) => {
    try {
      const template = await automlService.createJobTemplate(request.body);

      logger.automl.info('Job template created', {
        templateId: template.id,
        name: template.name,
        type: template.type
      });

      return {
        success: true,
        data: template
      };
    } catch (error) {
      logger.automl.error('Failed to create job template', { error });
      return reply.status(500).send({
        success: false,
        error: 'Failed to create job template'
      });
    }
  });

  // Analytics and Insights
  fastify.get('/analytics/performance', async (request, reply) => {
    try {
      const { timeRange = '7d' } = request.query as { timeRange?: string };
      const analytics = await automlService.getPerformanceAnalytics(timeRange);

      return {
        success: true,
        data: analytics
      };
    } catch (error) {
      logger.automl.error('Failed to get performance analytics', { error });
      return reply.status(500).send({
        success: false,
        error: 'Failed to get performance analytics'
      });
    }
  });

  fastify.get('/analytics/algorithms', async (request, reply) => {
    try {
      const analytics = await automlService.getAlgorithmAnalytics();

      return {
        success: true,
        data: analytics
      };
    } catch (error) {
      logger.automl.error('Failed to get algorithm analytics', { error });
      return reply.status(500).send({
        success: false,
        error: 'Failed to get algorithm analytics'
      });
    }
  });

  fastify.post<{
    Body: {
      jobIds: string[];
      metrics: string[];
    }
  }>('/analytics/compare', async (request, reply) => {
    try {
      const comparison = await automlService.compareJobs(
        request.body.jobIds,
        request.body.metrics
      );

      logger.automl.info('Jobs compared', {
        jobIds: request.body.jobIds,
        metrics: request.body.metrics
      });

      return {
        success: true,
        data: comparison
      };
    } catch (error) {
      logger.automl.error('Failed to compare jobs', { error });
      return reply.status(500).send({
        success: false,
        error: 'Failed to compare jobs'
      });
    }
  });

  // Dataset Analysis
  fastify.post<{
    Body: { dataset: string; target?: string }
  }>('/datasets/analyze', async (request, reply) => {
    try {
      const analysis = await automlService.analyzeDataset(
        request.body.dataset,
        request.body.target
      );

      logger.automl.info('Dataset analyzed', {
        dataset: request.body.dataset,
        target: request.body.target
      });

      return {
        success: true,
        data: analysis
      };
    } catch (error) {
      logger.automl.error('Failed to analyze dataset', { error });
      return reply.status(500).send({
        success: false,
        error: 'Failed to analyze dataset'
      });
    }
  });

  fastify.post<{
    Body: {
      dataset: string;
      target: string;
      algorithms?: string[];
    }
  }>('/recommendations', async (request, reply) => {
    try {
      const { dataset, target, algorithms } = request.body;
      const recommendations = await automlService.getAlgorithmRecommendations(
        dataset,
        target,
        algorithms
      );

      return {
        success: true,
        data: recommendations
      };
    } catch (error) {
      logger.automl.error('Failed to get algorithm recommendations', { error });
      return reply.status(500).send({
        success: false,
        error: 'Failed to get algorithm recommendations'
      });
    }
  });

  // Health and Status
  fastify.get('/health', async (request, reply) => {
    try {
      const health = await automlService.getHealth();

      return {
        success: true,
        data: health
      };
    } catch (error) {
      logger.automl.error('Failed to get AutoML health', { error });
      return reply.status(500).send({
        success: false,
        error: 'Failed to get AutoML health'
      });
    }
  });

  fastify.get('/stats', async (request, reply) => {
    try {
      const stats = await automlService.getStats();

      return {
        success: true,
        data: stats
      };
    } catch (error) {
      logger.automl.error('Failed to get AutoML stats', { error });
      return reply.status(500).send({
        success: false,
        error: 'Failed to get AutoML stats'
      });
    }
  });

  // WebSocket endpoint for real-time job updates
  fastify.get('/ws/jobs/:jobId', { websocket: true }, (connection, request) => {
    const jobId = (request.params as any).jobId;

    logger.automl.info('WebSocket connection established for AutoML job', { jobId });

    connection.socket.on('message', async (message) => {
      try {
        const data = JSON.parse(message.toString());

        if (data.type === 'subscribe') {
          // Subscribe to job updates
          await automlService.subscribeToJob(jobId, (update) => {
            connection.socket.send(JSON.stringify({
              type: 'job_update',
              data: update
            }));
          });
        }
      } catch (error) {
        logger.automl.error('WebSocket message error', { error });
        connection.socket.send(JSON.stringify({
          type: 'error',
          message: 'Invalid message format'
        }));
      }
    });

    connection.socket.on('close', () => {
      logger.automl.info('WebSocket connection closed for AutoML job', { jobId });
    });
  });

  // Export and Import
  fastify.get<{
    Params: { jobId: string },
    Querystring: { format?: 'json' | 'zip' }
  }>('/jobs/:jobId/export', async (request, reply) => {
    try {
      const { jobId } = request.params;
      const { format = 'json' } = request.query;

      const data = await automlService.exportJob(jobId, format);

      const contentType = format === 'zip' ? 'application/zip' : 'application/json';
      const filename = `automl-job-${jobId}.${format}`;

      reply.header('Content-Type', contentType);
      reply.header('Content-Disposition', `attachment; filename="${filename}"`);

      return data;
    } catch (error) {
      logger.automl.error('Failed to export AutoML job', {
        jobId: request.params.jobId,
        error
      });
      return reply.status(500).send({
        success: false,
        error: 'Failed to export AutoML job'
      });
    }
  });
};

export default automlRoutes;