import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { IntelligenceService } from '../services/intelligence-service.js';
import { InsightType, InsightImpact, AlertSeverity } from '../types/metrics.js';

const createAlertRuleSchema = z.object({
  name: z.string(),
  description: z.string(),
  metric_query: z.string(),
  condition: z.object({
    operator: z.enum(['gt', 'lt', 'eq', 'gte', 'lte']),
    aggregation: z.enum(['avg', 'sum', 'min', 'max', 'count']),
    time_window_minutes: z.number()
  }),
  threshold_value: z.number(),
  severity: z.nativeEnum(AlertSeverity),
  channels: z.array(z.object({
    type: z.enum(['email', 'slack', 'webhook', 'sms']),
    config: z.record(z.any())
  })),
  enabled: z.boolean().default(true),
  cooldown_minutes: z.number().default(60)
});

const analyzeTrendsSchema = z.object({
  metric: z.string(),
  start_time: z.string().datetime(),
  end_time: z.string().datetime(),
  forecast_days: z.number().optional().default(7)
});

export default async function intelligenceRoutes(fastify: FastifyInstance) {
  const intelligenceService = fastify.intelligenceService as IntelligenceService;

  // Generate business insights
  fastify.post('/intelligence/insights/generate', {
    schema: {
      response: {
        200: z.array(z.object({
          id: z.string(),
          type: z.nativeEnum(InsightType),
          title: z.string(),
          description: z.string(),
          impact: z.nativeEnum(InsightImpact),
          confidence: z.number(),
          data_points: z.array(z.any()),
          recommendations: z.array(z.string()),
          created_at: z.string().datetime(),
          expires_at: z.string().datetime().optional(),
          metadata: z.record(z.any())
        }))
      }
    }
  }, async (request, reply) => {
    try {
      const insights = await intelligenceService.generateBusinessInsights();
      
      return insights.map(insight => ({
        ...insight,
        created_at: insight.created_at.toISOString(),
        expires_at: insight.expires_at?.toISOString()
      }));
    } catch (error) {
      fastify.log.error('Failed to generate business insights', error);
      reply.status(500);
      return { error: 'Failed to generate business insights' };
    }
  });

  // Get recent insights
  fastify.get('/intelligence/insights', {
    schema: {
      querystring: z.object({
        type: z.nativeEnum(InsightType).optional(),
        impact: z.nativeEnum(InsightImpact).optional(),
        limit: z.number().optional().default(20)
      }),
      response: {
        200: z.array(z.object({
          id: z.string(),
          type: z.nativeEnum(InsightType),
          title: z.string(),
          description: z.string(),
          impact: z.nativeEnum(InsightImpact),
          confidence: z.number(),
          created_at: z.string().datetime(),
          expires_at: z.string().datetime().optional()
        }))
      }
    }
  }, async (request, reply) => {
    try {
      // Implementation would fetch recent insights from Redis
      // For now, return empty array
      return [];
    } catch (error) {
      fastify.log.error('Failed to get insights', error);
      reply.status(500);
      return { error: 'Failed to get insights' };
    }
  });

  // Analyze trends for a metric
  fastify.post('/intelligence/trends', {
    schema: {
      body: analyzeTrendsSchema,
      response: {
        200: z.object({
          metric: z.string(),
          trend_direction: z.enum(['up', 'down', 'stable']),
          trend_strength: z.number(),
          change_percent: z.number(),
          significance: z.number(),
          forecast: z.array(z.number()),
          anomalies: z.array(z.object({
            timestamp: z.string().datetime(),
            expected_value: z.number(),
            actual_value: z.number(),
            deviation_score: z.number(),
            anomaly_type: z.enum(['spike', 'drop', 'plateau', 'drift']),
            severity: z.enum(['low', 'medium', 'high'])
          }))
        })
      }
    }
  }, async (request, reply) => {
    try {
      const { metric, start_time, end_time, forecast_days } = request.body;
      
      const analysis = await intelligenceService.analyzeTrends(
        metric,
        {
          start: new Date(start_time),
          end: new Date(end_time)
        },
        forecast_days
      );
      
      return {
        ...analysis,
        anomalies: analysis.anomalies.map(anomaly => ({
          ...anomaly,
          timestamp: anomaly.timestamp.toISOString()
        }))
      };
    } catch (error) {
      fastify.log.error('Failed to analyze trends', error);
      reply.status(500);
      return { error: 'Failed to analyze trends' };
    }
  });

  // Create alert rule
  fastify.post('/intelligence/alerts', {
    schema: {
      body: createAlertRuleSchema,
      response: {
        201: z.object({
          id: z.string(),
          name: z.string(),
          description: z.string(),
          metric_query: z.string(),
          condition: z.object({
            operator: z.enum(['gt', 'lt', 'eq', 'gte', 'lte']),
            aggregation: z.enum(['avg', 'sum', 'min', 'max', 'count']),
            time_window_minutes: z.number()
          }),
          threshold_value: z.number(),
          severity: z.nativeEnum(AlertSeverity),
          channels: z.array(z.object({
            type: z.enum(['email', 'slack', 'webhook', 'sms']),
            config: z.record(z.any())
          })),
          enabled: z.boolean(),
          cooldown_minutes: z.number()
        })
      }
    }
  }, async (request, reply) => {
    try {
      const alertRule = await intelligenceService.createAlertRule(request.body);
      reply.status(201);
      return alertRule;
    } catch (error) {
      fastify.log.error('Failed to create alert rule', error);
      reply.status(500);
      return { error: 'Failed to create alert rule' };
    }
  });

  // Get optimization opportunities
  fastify.get('/intelligence/optimization', {
    schema: {
      response: {
        200: z.array(z.object({
          service: z.string(),
          current_performance: z.record(z.number()),
          bottlenecks: z.array(z.object({
            component: z.string(),
            metric: z.string(),
            current_value: z.number(),
            threshold: z.number(),
            impact_score: z.number(),
            description: z.string()
          })),
          optimization_opportunities: z.array(z.object({
            id: z.string(),
            title: z.string(),
            description: z.string(),
            category: z.string(),
            estimated_savings_cents: z.number(),
            estimated_performance_gain: z.number(),
            implementation_difficulty: z.number(),
            priority_score: z.number()
          })),
          estimated_improvement: z.record(z.number()),
          implementation_effort: z.enum(['low', 'medium', 'high'])
        }))
      }
    }
  }, async (request, reply) => {
    try {
      const optimizations = await intelligenceService.identifyOptimizationOpportunities();
      return optimizations;
    } catch (error) {
      fastify.log.error('Failed to get optimization opportunities', error);
      reply.status(500);
      return { error: 'Failed to get optimization opportunities' };
    }
  });

  // Evaluate alerts manually
  fastify.post('/intelligence/alerts/evaluate', {
    schema: {
      response: {
        200: z.object({
          alerts_evaluated: z.number(),
          alerts_triggered: z.number(),
          evaluation_time_ms: z.number()
        })
      }
    }
  }, async (request, reply) => {
    try {
      const startTime = Date.now();
      
      await intelligenceService.evaluateAlerts();
      
      const evaluationTime = Date.now() - startTime;
      
      return {
        alerts_evaluated: 0, // Would be tracked in implementation
        alerts_triggered: 0, // Would be tracked in implementation
        evaluation_time_ms: evaluationTime
      };
    } catch (error) {
      fastify.log.error('Failed to evaluate alerts', error);
      reply.status(500);
      return { error: 'Failed to evaluate alerts' };
    }
  });

  // Get performance metrics summary
  fastify.get('/intelligence/performance', {
    schema: {
      querystring: z.object({
        services: z.string().optional(), // Comma-separated list
        time_range: z.enum(['1h', '24h', '7d', '30d']).optional().default('24h')
      }),
      response: {
        200: z.object({
          services: z.array(z.object({
            name: z.string(),
            status: z.enum(['healthy', 'warning', 'critical']),
            metrics: z.object({
              response_time_ms: z.number(),
              throughput_rps: z.number(),
              error_rate: z.number(),
              cpu_utilization: z.number(),
              memory_utilization: z.number()
            }),
            trends: z.object({
              response_time: z.enum(['up', 'down', 'stable']),
              throughput: z.enum(['up', 'down', 'stable']),
              errors: z.enum(['up', 'down', 'stable'])
            }),
            alerts: z.number()
          })),
          overall_health: z.enum(['healthy', 'warning', 'critical']),
          total_alerts: z.number()
        })
      }
    }
  }, async (request, reply) => {
    try {
      // Implementation would analyze current performance across services
      return {
        services: [
          {
            name: 'api',
            status: 'healthy' as const,
            metrics: {
              response_time_ms: 150,
              throughput_rps: 100,
              error_rate: 0.01,
              cpu_utilization: 45,
              memory_utilization: 60
            },
            trends: {
              response_time: 'stable' as const,
              throughput: 'up' as const,
              errors: 'down' as const
            },
            alerts: 0
          }
        ],
        overall_health: 'healthy' as const,
        total_alerts: 0
      };
    } catch (error) {
      fastify.log.error('Failed to get performance summary', error);
      reply.status(500);
      return { error: 'Failed to get performance summary' };
    }
  });

  // Health check endpoint
  fastify.get('/intelligence/health', async (request, reply) => {
    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      service: 'analytics-intelligence'
    };
  });
}