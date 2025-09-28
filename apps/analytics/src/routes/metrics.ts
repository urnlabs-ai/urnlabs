import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { MetricsCollector } from '../services/metrics-collector.js';
import { PerformanceMetric, AgentPerformanceMetric, BusinessMetric, MetricType } from '../types/metrics.js';

const recordMetricSchema = z.object({
  service: z.string(),
  endpoint: z.string().optional(),
  metric_type: z.nativeEnum(MetricType),
  value: z.number(),
  unit: z.string(),
  tags: z.record(z.string()),
  metadata: z.record(z.any()).optional()
});

const recordAgentMetricSchema = z.object({
  service: z.string(),
  agent_id: z.string(),
  workflow_id: z.string().optional(),
  task_id: z.string().optional(),
  metric_type: z.nativeEnum(MetricType),
  value: z.number(),
  unit: z.string(),
  success: z.boolean(),
  execution_time_ms: z.number(),
  cost_cents: z.number(),
  tokens_used: z.number().optional(),
  tags: z.record(z.string()),
  metadata: z.record(z.any()).optional()
});

const recordBusinessMetricSchema = z.object({
  metric_name: z.string(),
  value: z.number(),
  dimension: z.record(z.string()),
  business_unit: z.string().optional(),
  revenue_impact_cents: z.number().optional(),
  cost_savings_cents: z.number().optional()
});

const queryMetricsSchema = z.object({
  metric_name: z.string(),
  start_time: z.string().datetime(),
  end_time: z.string().datetime(),
  filters: z.record(z.any()).optional(),
  aggregation: z.object({
    function: z.enum(['avg', 'sum', 'min', 'max', 'count', 'percentile']),
    interval: z.string().optional(),
    percentile: z.number().optional()
  }).optional(),
  group_by: z.array(z.string()).optional()
});

export default async function metricsRoutes(fastify: FastifyInstance) {
  const metricsCollector = fastify.metricsCollector as MetricsCollector;

  // Record performance metric
  fastify.post('/metrics', {
    schema: {
      body: recordMetricSchema,
      response: {
        200: z.object({
          success: z.boolean(),
          message: z.string()
        })
      }
    }
  }, async (request, reply) => {
    try {
      await metricsCollector.recordMetric(request.body);
      
      return {
        success: true,
        message: 'Metric recorded successfully'
      };
    } catch (error) {
      fastify.log.error('Failed to record metric', error);
      reply.status(500);
      return {
        success: false,
        message: 'Failed to record metric'
      };
    }
  });

  // Record agent performance metric
  fastify.post('/metrics/agent', {
    schema: {
      body: recordAgentMetricSchema,
      response: {
        200: z.object({
          success: z.boolean(),
          message: z.string()
        })
      }
    }
  }, async (request, reply) => {
    try {
      await metricsCollector.recordAgentMetric(request.body);
      
      return {
        success: true,
        message: 'Agent metric recorded successfully'
      };
    } catch (error) {
      fastify.log.error('Failed to record agent metric', error);
      reply.status(500);
      return {
        success: false,
        message: 'Failed to record agent metric'
      };
    }
  });

  // Record business metric
  fastify.post('/metrics/business', {
    schema: {
      body: recordBusinessMetricSchema,
      response: {
        200: z.object({
          success: z.boolean(),
          message: z.string()
        })
      }
    }
  }, async (request, reply) => {
    try {
      await metricsCollector.recordBusinessMetric(request.body);
      
      return {
        success: true,
        message: 'Business metric recorded successfully'
      };
    } catch (error) {
      fastify.log.error('Failed to record business metric', error);
      reply.status(500);
      return {
        success: false,
        message: 'Failed to record business metric'
      };
    }
  });

  // Query metrics
  fastify.post('/metrics/query', {
    schema: {
      body: queryMetricsSchema,
      response: {
        200: z.object({
          data: z.array(z.object({
            timestamp: z.string().datetime(),
            value: z.number(),
            metadata: z.record(z.any()).optional()
          })),
          metadata: z.object({
            total_points: z.number(),
            query_time_ms: z.number(),
            cache_hit: z.boolean()
          })
        })
      }
    }
  }, async (request, reply) => {
    try {
      const { metric_name, start_time, end_time, filters, aggregation, group_by } = request.body;
      
      const query = {
        metric_name,
        time_range: {
          start: new Date(start_time),
          end: new Date(end_time)
        },
        filters,
        aggregation,
        group_by
      };

      const result = await metricsCollector.queryMetrics(query);
      
      return {
        data: result.data.map(point => ({
          timestamp: point.timestamp.toISOString(),
          value: point.value,
          metadata: point.metadata
        })),
        metadata: result.metadata
      };
    } catch (error) {
      fastify.log.error('Failed to query metrics', error);
      reply.status(500);
      return {
        data: [],
        metadata: {
          total_points: 0,
          query_time_ms: 0,
          cache_hit: false
        }
      };
    }
  });

  // Get real-time metrics for a service
  fastify.get('/metrics/realtime/:service', {
    schema: {
      params: z.object({
        service: z.string()
      }),
      querystring: z.object({
        metric_type: z.nativeEnum(MetricType).optional()
      }),
      response: {
        200: z.array(z.object({
          id: z.string(),
          timestamp: z.string().datetime(),
          service: z.string(),
          endpoint: z.string().optional(),
          metric_type: z.nativeEnum(MetricType),
          value: z.number(),
          unit: z.string(),
          tags: z.record(z.string()),
          metadata: z.record(z.any()).optional()
        }))
      }
    }
  }, async (request, reply) => {
    try {
      const { service } = request.params;
      const { metric_type } = request.query;
      
      const metrics = await metricsCollector.getRealTimeMetrics(service, metric_type);
      
      return metrics.map(metric => ({
        ...metric,
        timestamp: metric.timestamp.toISOString()
      }));
    } catch (error) {
      fastify.log.error('Failed to get real-time metrics', error);
      reply.status(500);
      return [];
    }
  });

  // Get agent performance summary
  fastify.get('/metrics/agent/:agentId/summary', {
    schema: {
      params: z.object({
        agentId: z.string()
      }),
      querystring: z.object({
        hours: z.number().optional().default(24)
      }),
      response: {
        200: z.object({
          total_executions: z.number(),
          success_rate: z.number(),
          avg_execution_time_ms: z.number(),
          total_cost_cents: z.number(),
          avg_cost_per_execution_cents: z.number(),
          tokens_used: z.number()
        })
      }
    }
  }, async (request, reply) => {
    try {
      const { agentId } = request.params;
      const { hours } = request.query;
      
      const summary = await metricsCollector.getAgentPerformanceSummary(agentId, hours);
      
      return summary;
    } catch (error) {
      fastify.log.error('Failed to get agent performance summary', error);
      reply.status(500);
      return {
        total_executions: 0,
        success_rate: 0,
        avg_execution_time_ms: 0,
        total_cost_cents: 0,
        avg_cost_per_execution_cents: 0,
        tokens_used: 0
      };
    }
  });

  // Health check endpoint
  fastify.get('/metrics/health', async (request, reply) => {
    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      service: 'analytics-metrics'
    };
  });
}