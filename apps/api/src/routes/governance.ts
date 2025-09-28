import { FastifyPluginAsync } from 'fastify';
import { GovernanceMetricsService } from '@/services/governance-metrics-service.js';
import { AuditLogAggregationService } from '@/services/audit-log-aggregation-service.js';
import { authMiddleware } from '@/middleware/auth.js';

// ============================================================================
// GOVERNANCE DASHBOARD API ROUTES
// ============================================================================

/**
 * API routes for governance dashboard, metrics, and monitoring
 */

// Request/Response schemas - Using JSON Schema format for Fastify compatibility


const governanceRoutes: FastifyPluginAsync = async (fastify) => {
  const metricsService = new GovernanceMetricsService(fastify.prisma);
  const aggregationService = new AuditLogAggregationService(fastify.prisma);

  // Apply authentication middleware
  fastify.addHook('preHandler', authMiddleware);

  // ============================================================================
  // METRICS ENDPOINTS
  // ============================================================================

  /**
   * GET /governance/metrics - Get comprehensive governance metrics
   */
  fastify.get(
    '/metrics',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            organizationId: { type: 'string' },
            startDate: { type: 'string', format: 'date-time' },
            endDate: { type: 'string', format: 'date-time' },
            granularity: { type: 'string', enum: ['hour', 'day', 'week', 'month'], default: 'hour' },
            includeTimeSeries: { type: 'boolean', default: false },
            includeDetails: { type: 'boolean', default: false }
          },
          additionalProperties: false
        },
        response: {
          200: {
            type: 'object',
            properties: {
              metrics: { type: 'object', additionalProperties: true },
              query: { type: 'object', additionalProperties: true },
              timestamp: { type: 'string' },
              processingTime: { type: 'number' }
            },
              additionalProperties: false
          }
        },
      },
    },
    async (request, reply) => {
      const startTime = Date.now();

      try {
        const { organizationId, startDate, endDate, granularity, includeTimeSeries, includeDetails } = request.query;

        const metrics = await metricsService.collectMetrics({
          organizationId,
          startDate,
          endDate,
          granularity,
          includeTimeSeries,
          includeDetails,
        });

        const processingTime = Date.now() - startTime;

        reply.send({
          metrics,
          query: request.query,
          timestamp: new Date().toISOString(),
          processingTime,
        });
      } catch (error) {
        fastify.log.error('Failed to collect governance metrics', { error, query: request.query });
        reply.status(500).send({
          error: 'Failed to collect governance metrics',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );

  /**
   * GET /governance/metrics/prometheus - Export metrics in Prometheus format
   */
  fastify.get(
    '/metrics/prometheus',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            organizationId: { type: 'string' }
          },
          additionalProperties: false
        },
      },
    },
    async (request, reply) => {
      try {
        const { organizationId } = request.query;

        const prometheusMetrics = await metricsService.exportPrometheusMetrics(organizationId);

        reply.type('text/plain; version=0.0.4; charset=utf-8');
        reply.send(prometheusMetrics);
      } catch (error) {
        fastify.log.error('Failed to export Prometheus metrics', { error, query: request.query });
        reply.status(500).send('# Error generating metrics\\n');
      }
    }
  );

  // ============================================================================
  // ALERTS ENDPOINTS
  // ============================================================================

  /**
   * GET /governance/alerts - Get real-time governance alerts
   */
  fastify.get(
    '/alerts',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            organizationId: { type: 'string' },
            severity: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
            type: { type: 'string', enum: ['violation', 'integrity', 'compliance', 'performance'] },
            limit: { type: 'number', minimum: 1, maximum: 100, default: 50 }
          },
          additionalProperties: false
        },
        response: {
          200: {
            type: 'object',
            properties: {
              alerts: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    type: { type: 'string', enum: ['violation', 'integrity', 'compliance', 'performance'] },
                    severity: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
                    message: { type: 'string' },
                    timestamp: { type: 'string', format: 'date-time' },
                    metadata: { type: 'object', additionalProperties: true }
                  },
                          additionalProperties: false
                }
              },
              totalCount: { type: 'number' },
              query: { type: 'object', additionalProperties: true },
              timestamp: { type: 'string' }
            },
              additionalProperties: false
          }
        },
      },
    },
    async (request, reply) => {
      try {
        const { organizationId, severity, type, limit } = request.query;

        let alerts = await metricsService.getGovernanceAlerts(organizationId);

        // Apply filters
        if (severity) {
          alerts = alerts.filter(alert => alert.severity === severity);
        }

        if (type) {
          alerts = alerts.filter(alert => alert.type === type);
        }

        // Apply limit
        const limitedAlerts = alerts.slice(0, limit);

        reply.send({
          alerts: limitedAlerts,
          totalCount: alerts.length,
          query: request.query,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        fastify.log.error('Failed to get governance alerts', { error, query: request.query });
        reply.status(500).send({
          error: 'Failed to get governance alerts',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );

  // ============================================================================
  // DASHBOARD ENDPOINTS
  // ============================================================================

  /**
   * GET /governance/dashboard - Get dashboard summary data
   */
  fastify.get(
    '/dashboard',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            organizationId: { type: 'string' },
            timeRange: { type: 'string', enum: ['1h', '6h', '24h', '7d', '30d'], default: '24h' },
            includeTimeSeries: { type: 'boolean', default: true }
          },
          additionalProperties: false
        },
        response: {
          200: {
            type: 'object',
            properties: {
              summary: {
                type: 'object',
                properties: {
                  totalViolations: { type: 'number' },
                  activeUsers: { type: 'number' },
                  integrityScore: { type: 'number' },
                  complianceTrails: { type: 'number' },
                  availabilityScore: { type: 'number' }
                },
                      additionalProperties: false
              },
              alerts: { type: 'array', items: { type: 'object', additionalProperties: true } },
              timeSeries: { type: 'array', items: { type: 'object', additionalProperties: true } },
              trends: {
                type: 'object',
                properties: {
                  violationsTrend: { type: 'number' },
                  integrityTrend: { type: 'number' },
                  performanceTrend: { type: 'number' }
                },
                      additionalProperties: false
              },
              query: { type: 'object', additionalProperties: true },
              timestamp: { type: 'string' }
            },
              additionalProperties: false
          }
        },
      },
    },
    async (request, reply) => {
      try {
        const { organizationId, timeRange, includeTimeSeries } = request.query;

        // Calculate date range based on timeRange
        const endDate = new Date();
        const startDate = new Date();

        switch (timeRange) {
          case '1h':
            startDate.setHours(startDate.getHours() - 1);
            break;
          case '6h':
            startDate.setHours(startDate.getHours() - 6);
            break;
          case '24h':
            startDate.setHours(startDate.getHours() - 24);
            break;
          case '7d':
            startDate.setDate(startDate.getDate() - 7);
            break;
          case '30d':
            startDate.setDate(startDate.getDate() - 30);
            break;
        }

        // Collect metrics and alerts in parallel
        const [metrics, alerts] = await Promise.all([
          metricsService.collectMetrics({
            organizationId,
            startDate,
            endDate,
            includeTimeSeries,
            granularity: timeRange === '1h' || timeRange === '6h' ? 'hour' : 'day',
          }),
          metricsService.getGovernanceAlerts(organizationId),
        ]);

        // Build dashboard summary
        const summary = {
          totalViolations: metrics.policyViolations.total,
          activeUsers: metrics.rbacMetrics.activeUsers,
          integrityScore: metrics.auditMetrics.integrityScore,
          complianceTrails: metrics.complianceMetrics.activeTrails,
          availabilityScore: metrics.performanceMetrics.availabilityScore,
        };

        // Calculate trends (simplified - compare with previous period)
        const trends = {
          violationsTrend: metrics.policyViolations.recentTrend,
          integrityTrend: 0, // Would need historical data for real trend
          performanceTrend: 0, // Would need historical data for real trend
        };

        reply.send({
          summary,
          alerts: alerts.slice(0, 10), // Top 10 alerts
          timeSeries: includeTimeSeries ? metrics.timeSeries : undefined,
          trends,
          query: request.query,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        fastify.log.error('Failed to get dashboard data', { error, query: request.query });
        reply.status(500).send({
          error: 'Failed to get dashboard data',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );

  /**
   * GET /governance/dashboard/violations - Get detailed violation analytics
   */
  fastify.get(
    '/dashboard/violations',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            organizationId: { type: 'string' },
            timeRange: { type: 'string', enum: ['24h', '7d', '30d'] },
            groupBy: { type: 'string', enum: ['policy', 'severity', 'resource', 'user'] }
          },
          required: [],
          additionalProperties: false
        },
        response: {
          200: {
            type: 'object',
            properties: {
              summary: { type: 'object', additionalProperties: true },
              timeSeries: { type: 'array', items: {} },
              query: { type: 'object', additionalProperties: true },
              timestamp: { type: 'string' }
            },
            additionalProperties: false
          }
        }
      },
    },
    async (request, reply) => {
      try {
        const { organizationId, timeRange, groupBy } = request.query;

        // Calculate date range
        const endDate = new Date();
        const startDate = new Date();
        if (timeRange === '24h') startDate.setHours(startDate.getHours() - 24);
        else if (timeRange === '7d') startDate.setDate(startDate.getDate() - 7);
        else if (timeRange === '30d') startDate.setDate(startDate.getDate() - 30);

        const metrics = await metricsService.collectMetrics({
          organizationId,
          startDate,
          endDate,
          includeTimeSeries: true,
          granularity: 'day',
        });

        // Extract violation data based on groupBy parameter
        let groupedData: Record<string, number> = {};
        switch (groupBy) {
          case 'policy':
            groupedData = metrics.policyViolations.byPolicy;
            break;
          case 'severity':
            groupedData = metrics.policyViolations.bySeverity;
            break;
          case 'resource':
            groupedData = metrics.policyViolations.byResource;
            break;
          default:
            groupedData = metrics.policyViolations.byPolicy;
        }

        reply.send({
          violations: {
            total: metrics.policyViolations.total,
            trend: metrics.policyViolations.recentTrend,
            groupedData,
            timeSeries: metrics.timeSeries.daily?.map(ts => ({
              date: ts.date || ts.timestamp,
              violations: ts.violations,
            })) || [],
          },
          query: request.query,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        fastify.log.error('Failed to get violation analytics', { error, query: request.query });
        reply.status(500).send({
          error: 'Failed to get violation analytics',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );

  /**
   * GET /governance/dashboard/compliance - Get compliance status overview
   */
  fastify.get(
    '/dashboard/compliance',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            organizationId: { type: 'string' },
            framework: { type: 'string', enum: ['GDPR', 'SOX', 'HIPAA', 'PCI-DSS', 'ISO27001', 'CCPA'] }
          },
          additionalProperties: false
        },
        response: {
          200: {
            type: 'object',
            properties: {
              compliance: {
                type: 'object',
                properties: {
                  activeTrails: { type: 'number' },
                  byFramework: { type: 'object', additionalProperties: true },
                  verificationStatus: { type: 'object', additionalProperties: true },
                  pendingReviews: { type: 'number' },
                  expiredPolicies: { type: 'number' }
                },
                      additionalProperties: false
              },
              integrity: {
                type: 'object',
                properties: {
                  score: { type: 'number' },
                  tamperingIncidents: { type: 'number' },
                  recentChecks: { type: 'array', items: { type: 'object', additionalProperties: true } }
                },
                      additionalProperties: false
              },
              query: { type: 'object', additionalProperties: true },
              timestamp: { type: 'string' }
            },
              additionalProperties: false
          }
        }
      },
    },
    async (request, reply) => {
      try {
        const { organizationId, framework } = request.query;

        const [metrics, recentChecks] = await Promise.all([
          metricsService.collectMetrics({ organizationId }),
          // Get recent integrity checks
          fastify.prisma.auditLogIntegrityCheck.findMany({
            where: {
              ...(organizationId && { organizationId }),
              createdAt: {
                gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // Last 7 days
              },
            },
            orderBy: { createdAt: 'desc' },
            take: 10,
          }),
        ]);

        // Filter by framework if specified
        let frameworkData = metrics.complianceMetrics.byFramework;
        if (framework) {
          frameworkData = { [framework]: frameworkData[framework] || 0 };
        }

        reply.send({
          compliance: {
            activeTrails: metrics.complianceMetrics.activeTrails,
            byFramework: frameworkData,
            verificationStatus: metrics.complianceMetrics.verificationStatus,
            pendingReviews: metrics.complianceMetrics.pendingReviews,
            expiredPolicies: metrics.complianceMetrics.expiredPolicies,
          },
          integrity: {
            score: metrics.auditMetrics.integrityScore,
            tamperingIncidents: metrics.auditMetrics.tamperingIncidents,
            recentChecks: recentChecks.map(check => ({
              id: check.id,
              type: check.checkType,
              status: check.status,
              score: check.integrityScore,
              timestamp: check.createdAt,
            })),
          },
          query: request.query,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        fastify.log.error('Failed to get compliance overview', { error, query: request.query });
        reply.status(500).send({
          error: 'Failed to get compliance overview',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );

  /**
   * POST /governance/dashboard/integrity-check - Run integrity check on demand
   */
  fastify.post(
    '/dashboard/integrity-check',
    {
      schema: {
        body: {
          type: 'object',
          properties: {
            organizationId: { type: 'string' },
            checkType: { type: 'string', enum: ['integrity_verification', 'tamper_detection', 'chain_validation'], default: 'integrity_verification' },
            timeRange: { type: 'string', enum: ['1h', '24h', '7d'], default: '24h' }
          },
          additionalProperties: false
        },
        response: {
          200: {
            type: 'object',
            properties: {
              checkId: { type: 'string' },
              status: { type: 'string' },
              integrityScore: { type: 'number' },
              eventsChecked: { type: 'number' },
              issuesFound: { type: 'number' },
              timestamp: { type: 'string' }
            },
              additionalProperties: false
          }
        }
      },
    },
    async (request, reply) => {
      try {
        const { organizationId, checkType, timeRange } = request.body;

        // Calculate date range
        const endDate = new Date();
        const startDate = new Date();
        if (timeRange === '1h') startDate.setHours(startDate.getHours() - 1);
        else if (timeRange === '24h') startDate.setHours(startDate.getHours() - 24);
        else if (timeRange === '7d') startDate.setDate(startDate.getDate() - 7);

        // Run integrity check
        const result = await aggregationService.verifyLogIntegrity(
          organizationId || '',
          startDate,
          endDate
        );

        // Create integrity check record
        const integrityCheck = await fastify.prisma.auditLogIntegrityCheck.create({
          data: {
            checkType,
            organizationId,
            startDate,
            endDate,
            eventCount: result.totalEvents,
            status: result.isValid ? 'passed' : 'failed',
            integrityScore: result.validEvents / Math.max(result.totalEvents, 1),
            issuesFound: result.invalidEvents.length,
            tamperingDetected: !result.isValid,
            checkResults: {
              validEvents: result.validEvents,
              invalidEvents: result.invalidEvents,
              brokenChainAt: result.brokenChainAt,
            },
            failedEvents: result.invalidEvents,
            executedBy: 'system', // Would get from auth context
            executionTime: 0, // Would measure actual execution time
          },
        });

        reply.send({
          checkId: integrityCheck.id,
          status: integrityCheck.status,
          integrityScore: integrityCheck.integrityScore,
          eventsChecked: integrityCheck.eventCount,
          issuesFound: integrityCheck.issuesFound,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        fastify.log.error('Failed to run integrity check', { error, body: request.body });
        reply.status(500).send({
          error: 'Failed to run integrity check',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );
};

export default governanceRoutes;