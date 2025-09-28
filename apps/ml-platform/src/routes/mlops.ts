import { FastifyPluginAsync } from 'fastify';
import { MLOpsManager } from '../monitoring/mlops-manager.js';
import { logger } from '../lib/logger.js';
import {
  CreateExperimentRequest,
  LogMetricsRequest,
  CreateAlertRequest,
  CompareModelsRequest,
  ExperimentStatus
} from '../types/index.js';

const mlopsRoutes: FastifyPluginAsync = async (fastify) => {
  // Initialize MLOps manager
  const mlopsManager = new MLOpsManager();

  // Experiment Management
  fastify.post<{ Body: CreateExperimentRequest }>('/experiments', async (request, reply) => {
    try {
      const experiment = await mlopsManager.createExperiment(request.body);

      logger.mlops.info('Experiment created', {
        experimentId: experiment.id,
        name: experiment.name,
        projectId: experiment.projectId
      });

      return {
        success: true,
        data: experiment
      };
    } catch (error) {
      logger.mlops.error('Failed to create experiment', { error });
      return reply.status(500).send({
        success: false,
        error: 'Failed to create experiment'
      });
    }
  });

  fastify.get('/experiments', async (request, reply) => {
    try {
      const { projectId, status } = request.query as {
        projectId?: string;
        status?: ExperimentStatus;
      };

      const experiments = await mlopsManager.listExperiments({
        projectId,
        status
      });

      return {
        success: true,
        data: experiments
      };
    } catch (error) {
      logger.mlops.error('Failed to list experiments', { error });
      return reply.status(500).send({
        success: false,
        error: 'Failed to list experiments'
      });
    }
  });

  fastify.get<{ Params: { experimentId: string } }>('/experiments/:experimentId', async (request, reply) => {
    try {
      const experiment = await mlopsManager.getExperiment(request.params.experimentId);

      if (!experiment) {
        return reply.status(404).send({
          success: false,
          error: 'Experiment not found'
        });
      }

      return {
        success: true,
        data: experiment
      };
    } catch (error) {
      logger.mlops.error('Failed to get experiment', {
        experimentId: request.params.experimentId,
        error
      });
      return reply.status(500).send({
        success: false,
        error: 'Failed to get experiment'
      });
    }
  });

  fastify.patch<{
    Params: { experimentId: string },
    Body: { status: ExperimentStatus; notes?: string }
  }>('/experiments/:experimentId/status', async (request, reply) => {
    try {
      const { experimentId } = request.params;
      const { status, notes } = request.body;

      await mlopsManager.updateExperimentStatus(experimentId, status, notes);

      logger.mlops.info('Experiment status updated', {
        experimentId,
        status,
        notes
      });

      return {
        success: true,
        message: 'Experiment status updated successfully'
      };
    } catch (error) {
      logger.mlops.error('Failed to update experiment status', {
        experimentId: request.params.experimentId,
        error
      });
      return reply.status(500).send({
        success: false,
        error: 'Failed to update experiment status'
      });
    }
  });

  fastify.delete<{ Params: { experimentId: string } }>('/experiments/:experimentId', async (request, reply) => {
    try {
      await mlopsManager.deleteExperiment(request.params.experimentId);

      logger.mlops.info('Experiment deleted', {
        experimentId: request.params.experimentId
      });

      return {
        success: true,
        message: 'Experiment deleted successfully'
      };
    } catch (error) {
      logger.mlops.error('Failed to delete experiment', {
        experimentId: request.params.experimentId,
        error
      });
      return reply.status(500).send({
        success: false,
        error: 'Failed to delete experiment'
      });
    }
  });

  // Metrics and Logging
  fastify.post<{
    Params: { experimentId: string },
    Body: LogMetricsRequest
  }>('/experiments/:experimentId/metrics', async (request, reply) => {
    try {
      const { experimentId } = request.params;
      await mlopsManager.logMetrics(experimentId, request.body.metrics, request.body.step);

      logger.mlops.info('Metrics logged', {
        experimentId,
        metricsCount: Object.keys(request.body.metrics).length,
        step: request.body.step
      });

      return {
        success: true,
        message: 'Metrics logged successfully'
      };
    } catch (error) {
      logger.mlops.error('Failed to log metrics', {
        experimentId: request.params.experimentId,
        error
      });
      return reply.status(500).send({
        success: false,
        error: 'Failed to log metrics'
      });
    }
  });

  fastify.get<{
    Params: { experimentId: string },
    Querystring: { metric?: string; start?: number; end?: number }
  }>('/experiments/:experimentId/metrics', async (request, reply) => {
    try {
      const { experimentId } = request.params;
      const { metric, start, end } = request.query;

      const metrics = await mlopsManager.getMetrics(experimentId, {
        metric,
        start,
        end
      });

      return {
        success: true,
        data: metrics
      };
    } catch (error) {
      logger.mlops.error('Failed to get metrics', {
        experimentId: request.params.experimentId,
        error
      });
      return reply.status(500).send({
        success: false,
        error: 'Failed to get metrics'
      });
    }
  });

  fastify.post<{
    Params: { experimentId: string },
    Body: { artifacts: Record<string, any> }
  }>('/experiments/:experimentId/artifacts', async (request, reply) => {
    try {
      const { experimentId } = request.params;
      await mlopsManager.logArtifacts(experimentId, request.body.artifacts);

      logger.mlops.info('Artifacts logged', {
        experimentId,
        artifactCount: Object.keys(request.body.artifacts).length
      });

      return {
        success: true,
        message: 'Artifacts logged successfully'
      };
    } catch (error) {
      logger.mlops.error('Failed to log artifacts', {
        experimentId: request.params.experimentId,
        error
      });
      return reply.status(500).send({
        success: false,
        error: 'Failed to log artifacts'
      });
    }
  });

  fastify.get<{ Params: { experimentId: string } }>('/experiments/:experimentId/artifacts', async (request, reply) => {
    try {
      const artifacts = await mlopsManager.getArtifacts(request.params.experimentId);

      return {
        success: true,
        data: artifacts
      };
    } catch (error) {
      logger.mlops.error('Failed to get artifacts', {
        experimentId: request.params.experimentId,
        error
      });
      return reply.status(500).send({
        success: false,
        error: 'Failed to get artifacts'
      });
    }
  });

  // Model Management
  fastify.post<{
    Params: { experimentId: string },
    Body: {
      modelName: string;
      version: string;
      metadata?: Record<string, any>;
    }
  }>('/experiments/:experimentId/models', async (request, reply) => {
    try {
      const { experimentId } = request.params;
      const { modelName, version, metadata } = request.body;

      const modelVersion = await mlopsManager.registerModel(
        experimentId,
        modelName,
        version,
        metadata
      );

      logger.mlops.info('Model registered', {
        experimentId,
        modelName,
        version,
        modelVersionId: modelVersion.id
      });

      return {
        success: true,
        data: modelVersion
      };
    } catch (error) {
      logger.mlops.error('Failed to register model', {
        experimentId: request.params.experimentId,
        error
      });
      return reply.status(500).send({
        success: false,
        error: 'Failed to register model'
      });
    }
  });

  fastify.get<{
    Querystring: { name?: string; version?: string }
  }>('/models', async (request, reply) => {
    try {
      const { name, version } = request.query;
      const models = await mlopsManager.listModels({ name, version });

      return {
        success: true,
        data: models
      };
    } catch (error) {
      logger.mlops.error('Failed to list models', { error });
      return reply.status(500).send({
        success: false,
        error: 'Failed to list models'
      });
    }
  });

  fastify.get<{ Params: { modelId: string } }>('/models/:modelId', async (request, reply) => {
    try {
      const model = await mlopsManager.getModel(request.params.modelId);

      if (!model) {
        return reply.status(404).send({
          success: false,
          error: 'Model not found'
        });
      }

      return {
        success: true,
        data: model
      };
    } catch (error) {
      logger.mlops.error('Failed to get model', {
        modelId: request.params.modelId,
        error
      });
      return reply.status(500).send({
        success: false,
        error: 'Failed to get model'
      });
    }
  });

  fastify.post<{ Body: CompareModelsRequest }>('/models/compare', async (request, reply) => {
    try {
      const comparison = await mlopsManager.compareModels(
        request.body.modelIds,
        request.body.metrics
      );

      logger.mlops.info('Models compared', {
        modelIds: request.body.modelIds,
        metrics: request.body.metrics
      });

      return {
        success: true,
        data: comparison
      };
    } catch (error) {
      logger.mlops.error('Failed to compare models', { error });
      return reply.status(500).send({
        success: false,
        error: 'Failed to compare models'
      });
    }
  });

  // Alert Management
  fastify.post<{ Body: CreateAlertRequest }>('/alerts', async (request, reply) => {
    try {
      const alert = await mlopsManager.createAlert(request.body);

      logger.mlops.info('Alert created', {
        alertId: alert.id,
        name: alert.name,
        condition: alert.condition
      });

      return {
        success: true,
        data: alert
      };
    } catch (error) {
      logger.mlops.error('Failed to create alert', { error });
      return reply.status(500).send({
        success: false,
        error: 'Failed to create alert'
      });
    }
  });

  fastify.get('/alerts', async (request, reply) => {
    try {
      const { active, experimentId } = request.query as {
        active?: boolean;
        experimentId?: string;
      };

      const alerts = await mlopsManager.listAlerts({ active, experimentId });

      return {
        success: true,
        data: alerts
      };
    } catch (error) {
      logger.mlops.error('Failed to list alerts', { error });
      return reply.status(500).send({
        success: false,
        error: 'Failed to list alerts'
      });
    }
  });

  fastify.get<{ Params: { alertId: string } }>('/alerts/:alertId', async (request, reply) => {
    try {
      const alert = await mlopsManager.getAlert(request.params.alertId);

      if (!alert) {
        return reply.status(404).send({
          success: false,
          error: 'Alert not found'
        });
      }

      return {
        success: true,
        data: alert
      };
    } catch (error) {
      logger.mlops.error('Failed to get alert', {
        alertId: request.params.alertId,
        error
      });
      return reply.status(500).send({
        success: false,
        error: 'Failed to get alert'
      });
    }
  });

  fastify.patch<{
    Params: { alertId: string },
    Body: { active: boolean }
  }>('/alerts/:alertId/status', async (request, reply) => {
    try {
      const { alertId } = request.params;
      const { active } = request.body;

      await mlopsManager.updateAlertStatus(alertId, active);

      logger.mlops.info('Alert status updated', { alertId, active });

      return {
        success: true,
        message: 'Alert status updated successfully'
      };
    } catch (error) {
      logger.mlops.error('Failed to update alert status', {
        alertId: request.params.alertId,
        error
      });
      return reply.status(500).send({
        success: false,
        error: 'Failed to update alert status'
      });
    }
  });

  fastify.delete<{ Params: { alertId: string } }>('/alerts/:alertId', async (request, reply) => {
    try {
      await mlopsManager.deleteAlert(request.params.alertId);

      logger.mlops.info('Alert deleted', {
        alertId: request.params.alertId
      });

      return {
        success: true,
        message: 'Alert deleted successfully'
      };
    } catch (error) {
      logger.mlops.error('Failed to delete alert', {
        alertId: request.params.alertId,
        error
      });
      return reply.status(500).send({
        success: false,
        error: 'Failed to delete alert'
      });
    }
  });

  // Dashboard and Analytics
  fastify.get('/dashboard', async (request, reply) => {
    try {
      const dashboard = await mlopsManager.getDashboard();

      return {
        success: true,
        data: dashboard
      };
    } catch (error) {
      logger.mlops.error('Failed to get dashboard', { error });
      return reply.status(500).send({
        success: false,
        error: 'Failed to get dashboard'
      });
    }
  });

  fastify.get('/metrics/system', async (request, reply) => {
    try {
      const metrics = await mlopsManager.getSystemMetrics();

      return {
        success: true,
        data: metrics
      };
    } catch (error) {
      logger.mlops.error('Failed to get system metrics', { error });
      return reply.status(500).send({
        success: false,
        error: 'Failed to get system metrics'
      });
    }
  });

  fastify.get<{
    Querystring: {
      start?: string;
      end?: string;
      granularity?: 'minute' | 'hour' | 'day';
    }
  }>('/analytics/trends', async (request, reply) => {
    try {
      const { start, end, granularity = 'hour' } = request.query;

      const trends = await mlopsManager.getAnalyticsTrends({
        start: start ? new Date(start) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        end: end ? new Date(end) : new Date(),
        granularity
      });

      return {
        success: true,
        data: trends
      };
    } catch (error) {
      logger.mlops.error('Failed to get analytics trends', { error });
      return reply.status(500).send({
        success: false,
        error: 'Failed to get analytics trends'
      });
    }
  });

  // Health and Status
  fastify.get('/health', async (request, reply) => {
    try {
      const health = await mlopsManager.getHealth();

      return {
        success: true,
        data: health
      };
    } catch (error) {
      logger.mlops.error('Failed to get MLOps health', { error });
      return reply.status(500).send({
        success: false,
        error: 'Failed to get MLOps health'
      });
    }
  });

  // WebSocket endpoint for real-time metrics
  fastify.get('/ws/metrics', { websocket: true }, (connection, request) => {
    logger.mlops.info('WebSocket connection established for metrics');

    connection.socket.on('message', async (message) => {
      try {
        const data = JSON.parse(message.toString());

        if (data.type === 'subscribe') {
          const { experimentId, metrics } = data;

          // Subscribe to real-time metrics
          await mlopsManager.subscribeToMetrics(experimentId, metrics, (update) => {
            connection.socket.send(JSON.stringify({
              type: 'metric_update',
              data: update
            }));
          });
        }
      } catch (error) {
        logger.mlops.error('WebSocket message error', { error });
        connection.socket.send(JSON.stringify({
          type: 'error',
          message: 'Invalid message format'
        }));
      }
    });

    connection.socket.on('close', () => {
      logger.mlops.info('WebSocket connection closed for metrics');
    });
  });

  // Export data
  fastify.get<{
    Params: { experimentId: string },
    Querystring: { format?: 'json' | 'csv' }
  }>('/experiments/:experimentId/export', async (request, reply) => {
    try {
      const { experimentId } = request.params;
      const { format = 'json' } = request.query;

      const data = await mlopsManager.exportExperimentData(experimentId, format);

      const contentType = format === 'csv' ? 'text/csv' : 'application/json';
      const filename = `experiment-${experimentId}.${format}`;

      reply.header('Content-Type', contentType);
      reply.header('Content-Disposition', `attachment; filename="${filename}"`);

      return data;
    } catch (error) {
      logger.mlops.error('Failed to export experiment data', {
        experimentId: request.params.experimentId,
        error
      });
      return reply.status(500).send({
        success: false,
        error: 'Failed to export experiment data'
      });
    }
  });
};

export default mlopsRoutes;