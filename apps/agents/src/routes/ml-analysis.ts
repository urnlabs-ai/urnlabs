import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { MLWorkflowAnalyzer, WorkflowMetrics } from '../services/MLWorkflowAnalyzer.js';
import { logger } from '../lib/logger.js';

export default async function mlAnalysisRoutes(fastify: FastifyInstance) {
  const analyzer = new MLWorkflowAnalyzer(fastify.prisma);

  // Health check endpoint
  fastify.get('/ml-analysis/health', async (request: FastifyRequest, reply: FastifyReply) => {
    return reply.send({
      status: 'healthy',
      service: 'ml-workflow-analyzer',
      timestamp: new Date().toISOString()
    });
  });

  // Submit workflow metrics for analysis
  fastify.post<{
    Body: WorkflowMetrics
  }>('/ml-analysis/metrics', {
    schema: {
      body: {
        type: 'object',
        required: ['workflowId', 'executionId', 'agentId', 'startTime', 'endTime', 'duration', 'status', 'stepsExecuted', 'resourcesUsed'],
        properties: {
          workflowId: { type: 'string' },
          executionId: { type: 'string' },
          agentId: { type: 'string' },
          startTime: { type: 'number' },
          endTime: { type: 'number' },
          duration: { type: 'number' },
          status: { type: 'string', enum: ['success', 'failure', 'timeout', 'cancelled'] },
          stepsExecuted: { type: 'number' },
          resourcesUsed: {
            type: 'object',
            required: ['cpu', 'memory', 'io', 'network'],
            properties: {
              cpu: { type: 'number' },
              memory: { type: 'number' },
              io: { type: 'number' },
              network: { type: 'number' }
            }
          },
          errorMessage: { type: 'string' },
          metadata: { type: 'object' }
        }
      }
    }
  }, async (request: FastifyRequest<{ Body: WorkflowMetrics }>, reply: FastifyReply) => {
    try {
      await analyzer.recordWorkflowExecution(request.body);

      logger.info('Workflow metrics recorded', {
        workflowId: request.body.workflowId,
        executionId: request.body.executionId,
        duration: request.body.duration,
        status: request.body.status
      });

      return reply.send({
        success: true,
        message: 'Metrics recorded successfully',
        executionId: request.body.executionId
      });
    } catch (error: any) {
      logger.error('Failed to record workflow metrics', {
        error: error.message,
        workflowId: request.body.workflowId
      });

      return reply.status(500).send({
        success: false,
        error: 'Failed to record metrics'
      });
    }
  });

  // Get performance analysis for a specific workflow
  fastify.get<{
    Params: { workflowId: string }
    Querystring: { timeWindow?: string }
  }>('/ml-analysis/workflows/:workflowId/performance', async (request: FastifyRequest<{
    Params: { workflowId: string }
    Querystring: { timeWindow?: string }
  }>, reply: FastifyReply) => {
    try {
      const { workflowId } = request.params;
      const timeWindow = request.query.timeWindow || '24h';

      const analysis = await analyzer.analyzeWorkflowPerformance(workflowId, timeWindow);

      return reply.send({
        workflowId,
        timeWindow,
        analysis,
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      logger.error('Failed to analyze workflow performance', {
        error: error.message,
        workflowId: request.params.workflowId
      });

      return reply.status(500).send({
        error: 'Failed to analyze workflow performance'
      });
    }
  });

  // Get anomaly detection results
  fastify.get<{
    Querystring: { timeWindow?: string; threshold?: number }
  }>('/ml-analysis/anomalies', async (request: FastifyRequest<{
    Querystring: { timeWindow?: string; threshold?: number }
  }>, reply: FastifyReply) => {
    try {
      const timeWindow = request.query.timeWindow || '24h';
      const threshold = request.query.threshold || 2.0;

      const anomalies = await analyzer.detectAnomalies(timeWindow, threshold);

      return reply.send({
        timeWindow,
        threshold,
        anomalies,
        count: anomalies.length,
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      logger.error('Failed to detect anomalies', {
        error: error.message
      });

      return reply.status(500).send({
        error: 'Failed to detect anomalies'
      });
    }
  });

  // Get performance predictions
  fastify.get<{
    Params: { workflowId: string }
    Querystring: { horizon?: string }
  }>('/ml-analysis/workflows/:workflowId/predictions', async (request: FastifyRequest<{
    Params: { workflowId: string }
    Querystring: { horizon?: string }
  }>, reply: FastifyReply) => {
    try {
      const { workflowId } = request.params;
      const horizon = request.query.horizon || '1h';

      const predictions = await analyzer.predictPerformance(workflowId, horizon);

      return reply.send({
        workflowId,
        horizon,
        predictions,
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      logger.error('Failed to predict performance', {
        error: error.message,
        workflowId: request.params.workflowId
      });

      return reply.status(500).send({
        error: 'Failed to predict performance'
      });
    }
  });

  // Get workflow clustering analysis
  fastify.get<{
    Querystring: { clusters?: number; timeWindow?: string }
  }>('/ml-analysis/clustering', async (request: FastifyRequest<{
    Querystring: { clusters?: number; timeWindow?: string }
  }>, reply: FastifyReply) => {
    try {
      const clusters = request.query.clusters || 3;
      const timeWindow = request.query.timeWindow || '7d';

      const clustering = await analyzer.clusterWorkflows(clusters, timeWindow);

      return reply.send({
        clusters,
        timeWindow,
        clustering,
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      logger.error('Failed to cluster workflows', {
        error: error.message
      });

      return reply.status(500).send({
        error: 'Failed to cluster workflows'
      });
    }
  });

  // Get optimization recommendations
  fastify.get<{
    Params: { workflowId: string }
  }>('/ml-analysis/workflows/:workflowId/optimize', async (request: FastifyRequest<{
    Params: { workflowId: string }
  }>, reply: FastifyReply) => {
    try {
      const { workflowId } = request.params;

      const recommendations = await analyzer.generateOptimizationRecommendations(workflowId);

      return reply.send({
        workflowId,
        recommendations,
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      logger.error('Failed to generate optimization recommendations', {
        error: error.message,
        workflowId: request.params.workflowId
      });

      return reply.status(500).send({
        error: 'Failed to generate optimization recommendations'
      });
    }
  });

  // Get comprehensive analytics dashboard data
  fastify.get('/ml-analysis/dashboard', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const [
        recentAnomalies,
        performanceMetrics,
        clusteringSummary
      ] = await Promise.all([
        analyzer.detectAnomalies('24h', 2.0),
        analyzer.getPerformanceMetrics('24h'),
        analyzer.clusterWorkflows(3, '7d')
      ]);

      return reply.send({
        summary: {
          totalAnomalies: recentAnomalies.length,
          avgPerformance: performanceMetrics.avgDuration,
          totalWorkflows: performanceMetrics.totalExecutions,
          clusters: clusteringSummary.clusters.length
        },
        anomalies: recentAnomalies.slice(0, 10), // Top 10 recent anomalies
        performance: performanceMetrics,
        clustering: {
          ...clusteringSummary,
          clusters: clusteringSummary.clusters.map(cluster => ({
            ...cluster,
            workflows: cluster.workflows.slice(0, 5) // Top 5 workflows per cluster
          }))
        },
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      logger.error('Failed to generate dashboard data', {
        error: error.message
      });

      return reply.status(500).send({
        error: 'Failed to generate dashboard data'
      });
    }
  });

  logger.info('ML Analysis routes registered');
}