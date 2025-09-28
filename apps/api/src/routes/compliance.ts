import { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';
import { PrismaClient } from '@prisma/client';
import { logger } from '../lib/logger.js';
import { PolicyEngineService } from '../services/policy-engine-service.js';
import { ComplianceReportGenerator } from '../services/compliance-report-generator.js';
import { ViolationDetectionService } from '../services/violation-detection-service.js';
import { z } from 'zod';

/**
 * Compliance Dashboard API Routes
 *
 * Provides endpoints for compliance monitoring, reporting, and real-time violation detection
 */

// Input validation schemas
const ComplianceQuerySchema = z.object({
  organizationId: z.string(),
  framework: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  severity: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  status: z.enum(['compliant', 'non_compliant', 'partial', 'unknown']).optional(),
  limit: z.number().min(1).max(1000).default(100),
  offset: z.number().min(0).default(0)
});

const ReportRequestSchema = z.object({
  organizationId: z.string(),
  framework: z.string().optional(),
  startDate: z.string(),
  endDate: z.string(),
  format: z.enum(['pdf', 'csv', 'json']).default('json'),
  includeDetails: z.boolean().default(true),
  includePolicyViolations: z.boolean().default(true),
  includeMetrics: z.boolean().default(true)
});

const ViolationAlertConfigSchema = z.object({
  organizationId: z.string(),
  enabled: z.boolean(),
  thresholds: z.object({
    critical: z.number().min(1).max(100),
    high: z.number().min(1).max(100),
    medium: z.number().min(1).max(100),
    low: z.number().min(1).max(100)
  }),
  notificationChannels: z.array(z.enum(['email', 'slack', 'webhook'])),
  escalationRules: z.array(z.object({
    severity: z.enum(['low', 'medium', 'high', 'critical']),
    threshold: z.number(),
    action: z.enum(['notify', 'escalate', 'block'])
  }))
});

interface AuthenticatedRequest extends FastifyRequest {
  user?: {
    id: string;
    organizationId: string;
    permissions: string[];
  };
}

export async function complianceRoutes(fastify: FastifyInstance) {
  const prisma = new PrismaClient();
  const policyEngineService = new PolicyEngineService(prisma, {
    cacheEnabled: true,
    cacheExpirationSeconds: 300,
    metricsEnabled: true
  });
  const reportGenerator = new ComplianceReportGenerator(prisma);
  const violationDetector = new ViolationDetectionService(prisma, policyEngineService);

  // Middleware for authentication and organization access
  const requireAuth = async (request: AuthenticatedRequest, reply: FastifyReply) => {
    if (!request.user?.id) {
      return reply.status(401).send({
        error: 'Authentication required',
        code: 'COMPLIANCE_AUTH_REQUIRED'
      });
    }
  };

  const requireComplianceAccess = async (request: AuthenticatedRequest, reply: FastifyReply) => {
    if (!request.user?.permissions?.includes('compliance:read')) {
      return reply.status(403).send({
        error: 'Compliance read access required',
        code: 'COMPLIANCE_ACCESS_DENIED'
      });
    }
  };

  /**
   * GET /compliance/dashboard
   * Get compliance dashboard overview
   */
  fastify.get('/compliance/dashboard', {
    preHandler: [requireAuth, requireComplianceAccess]
  }, async (request: AuthenticatedRequest, reply: FastifyReply) => {
    try {
      const organizationId = request.user!.organizationId;
      const { framework, startDate, endDate } = request.query as any;

      const dateRange = {
        start: startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
        end: endDate ? new Date(endDate) : new Date()
      };

      // Get compliance overview
      const [
        complianceRules,
        recentViolations,
        policyStatistics,
        riskMetrics,
        frameworkStatus
      ] = await Promise.all([
        // Active compliance rules
        prisma.complianceRule.findMany({
          where: {
            organizationId,
            status: 'active',
            ...(framework && { framework })
          },
          include: {
            policy: {
              select: { id: true, name: true, status: true }
            }
          }
        }),

        // Recent policy violations
        violationDetector.getRecentViolations(organizationId, {
          limit: 10,
          startDate: dateRange.start,
          endDate: dateRange.end
        }),

        // Policy evaluation statistics
        policyEngineService.getPolicyStatistics(organizationId),

        // Risk assessment metrics
        violationDetector.getRiskMetrics(organizationId, dateRange),

        // Framework compliance status
        getFrameworkComplianceStatus(organizationId, framework, dateRange)
      ]);

      const dashboardData = {
        overview: {
          totalRules: complianceRules.length,
          activeRules: complianceRules.filter(r => r.status === 'active').length,
          recentViolations: recentViolations.length,
          riskScore: riskMetrics.overallRiskScore,
          complianceRate: calculateComplianceRate(complianceRules)
        },
        complianceRules: complianceRules.map(rule => ({
          id: rule.id,
          name: rule.name,
          framework: rule.framework,
          severity: rule.severity,
          status: rule.complianceStatus,
          lastAuditDate: rule.lastAuditDate,
          nextAuditDate: rule.nextAuditDate,
          policy: rule.policy ? {
            id: rule.policy.id,
            name: rule.policy.name,
            status: rule.policy.status
          } : null
        })),
        recentViolations: recentViolations.map(violation => ({
          id: violation.id,
          policyId: violation.policyId,
          severity: violation.severity,
          description: violation.description,
          timestamp: violation.timestamp,
          status: violation.status,
          riskScore: violation.riskScore
        })),
        frameworkStatus,
        riskMetrics: {
          overallScore: riskMetrics.overallRiskScore,
          trendDirection: riskMetrics.trendDirection,
          byFramework: riskMetrics.byFramework,
          bySeverity: riskMetrics.bySeverity
        },
        policyStatistics
      };

      return reply.send({
        success: true,
        data: dashboardData,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error('Failed to get compliance dashboard', {
        organizationId: request.user?.organizationId,
        error: error.message
      });

      return reply.status(500).send({
        error: 'Failed to retrieve compliance dashboard',
        code: 'COMPLIANCE_DASHBOARD_ERROR'
      });
    }
  });

  /**
   * GET /compliance/violations
   * Get policy violations with filtering and pagination
   */
  fastify.get('/compliance/violations', {
    preHandler: [requireAuth, requireComplianceAccess]
  }, async (request: AuthenticatedRequest, reply: FastifyReply) => {
    try {
      const organizationId = request.user!.organizationId;
      const queryParams = ComplianceQuerySchema.parse(request.query);

      const violations = await violationDetector.getViolations(organizationId, {
        framework: queryParams.framework,
        severity: queryParams.severity,
        startDate: queryParams.startDate ? new Date(queryParams.startDate) : undefined,
        endDate: queryParams.endDate ? new Date(queryParams.endDate) : undefined,
        limit: queryParams.limit,
        offset: queryParams.offset
      });

      const totalCount = await violationDetector.getViolationCount(organizationId, {
        framework: queryParams.framework,
        severity: queryParams.severity,
        startDate: queryParams.startDate ? new Date(queryParams.startDate) : undefined,
        endDate: queryParams.endDate ? new Date(queryParams.endDate) : undefined
      });

      return reply.send({
        success: true,
        data: {
          violations,
          pagination: {
            total: totalCount,
            limit: queryParams.limit,
            offset: queryParams.offset,
            hasMore: (queryParams.offset + queryParams.limit) < totalCount
          }
        }
      });

    } catch (error) {
      logger.error('Failed to get policy violations', {
        organizationId: request.user?.organizationId,
        error: error.message
      });

      return reply.status(500).send({
        error: 'Failed to retrieve policy violations',
        code: 'COMPLIANCE_VIOLATIONS_ERROR'
      });
    }
  });

  /**
   * GET /compliance/frameworks
   * Get available compliance frameworks and their status
   */
  fastify.get('/compliance/frameworks', {
    preHandler: [requireAuth, requireComplianceAccess]
  }, async (request: AuthenticatedRequest, reply: FastifyReply) => {
    try {
      const organizationId = request.user!.organizationId;

      const frameworks = await getComplianceFrameworks(organizationId);

      return reply.send({
        success: true,
        data: { frameworks }
      });

    } catch (error) {
      logger.error('Failed to get compliance frameworks', {
        organizationId: request.user?.organizationId,
        error: error.message
      });

      return reply.status(500).send({
        error: 'Failed to retrieve compliance frameworks',
        code: 'COMPLIANCE_FRAMEWORKS_ERROR'
      });
    }
  });

  /**
   * POST /compliance/reports/generate
   * Generate compliance report in specified format
   */
  fastify.post('/compliance/reports/generate', {
    preHandler: [requireAuth, requireComplianceAccess]
  }, async (request: AuthenticatedRequest, reply: FastifyReply) => {
    try {
      const organizationId = request.user!.organizationId;
      const reportParams = ReportRequestSchema.parse(request.body);

      if (reportParams.organizationId !== organizationId) {
        return reply.status(403).send({
          error: 'Organization access denied',
          code: 'COMPLIANCE_ORG_ACCESS_DENIED'
        });
      }

      const reportData = await reportGenerator.generateReport({
        organizationId,
        framework: reportParams.framework,
        startDate: new Date(reportParams.startDate),
        endDate: new Date(reportParams.endDate),
        format: reportParams.format,
        options: {
          includeDetails: reportParams.includeDetails,
          includePolicyViolations: reportParams.includePolicyViolations,
          includeMetrics: reportParams.includeMetrics
        }
      });

      // Set appropriate content type based on format
      const contentTypes = {
        pdf: 'application/pdf',
        csv: 'text/csv',
        json: 'application/json'
      };

      reply.header('Content-Type', contentTypes[reportParams.format]);

      if (reportParams.format !== 'json') {
        const filename = `compliance-report-${organizationId}-${Date.now()}.${reportParams.format}`;
        reply.header('Content-Disposition', `attachment; filename="${filename}"`);
      }

      return reply.send(reportData);

    } catch (error) {
      logger.error('Failed to generate compliance report', {
        organizationId: request.user?.organizationId,
        error: error.message
      });

      return reply.status(500).send({
        error: 'Failed to generate compliance report',
        code: 'COMPLIANCE_REPORT_ERROR'
      });
    }
  });

  /**
   * GET /compliance/metrics
   * Get compliance metrics and trends
   */
  fastify.get('/compliance/metrics', {
    preHandler: [requireAuth, requireComplianceAccess]
  }, async (request: AuthenticatedRequest, reply: FastifyReply) => {
    try {
      const organizationId = request.user!.organizationId;
      const { framework, period = '30d' } = request.query as any;

      const metrics = await getComplianceMetrics(organizationId, {
        framework,
        period
      });

      return reply.send({
        success: true,
        data: { metrics }
      });

    } catch (error) {
      logger.error('Failed to get compliance metrics', {
        organizationId: request.user?.organizationId,
        error: error.message
      });

      return reply.status(500).send({
        error: 'Failed to retrieve compliance metrics',
        code: 'COMPLIANCE_METRICS_ERROR'
      });
    }
  });

  /**
   * POST /compliance/alerts/configure
   * Configure real-time violation detection alerts
   */
  fastify.post('/compliance/alerts/configure', {
    preHandler: [requireAuth, requireComplianceAccess]
  }, async (request: AuthenticatedRequest, reply: FastifyReply) => {
    try {
      const organizationId = request.user!.organizationId;
      const alertConfig = ViolationAlertConfigSchema.parse(request.body);

      if (alertConfig.organizationId !== organizationId) {
        return reply.status(403).send({
          error: 'Organization access denied',
          code: 'COMPLIANCE_ORG_ACCESS_DENIED'
        });
      }

      await violationDetector.configureAlerts(organizationId, alertConfig);

      return reply.send({
        success: true,
        message: 'Alert configuration updated successfully'
      });

    } catch (error) {
      logger.error('Failed to configure compliance alerts', {
        organizationId: request.user?.organizationId,
        error: error.message
      });

      return reply.status(500).send({
        error: 'Failed to configure compliance alerts',
        code: 'COMPLIANCE_ALERTS_CONFIG_ERROR'
      });
    }
  });

  /**
   * GET /compliance/audit-trail
   * Get audit trail for compliance-related activities
   */
  fastify.get('/compliance/audit-trail', {
    preHandler: [requireAuth, requireComplianceAccess]
  }, async (request: AuthenticatedRequest, reply: FastifyReply) => {
    try {
      const organizationId = request.user!.organizationId;
      const queryParams = ComplianceQuerySchema.parse(request.query);

      const auditLogs = await prisma.auditLog.findMany({
        where: {
          organizationId,
          eventType: {
            in: ['policy_evaluation', 'compliance_check', 'violation_detected', 'policy_updated']
          },
          ...(queryParams.startDate && {
            eventTimestamp: {
              gte: new Date(queryParams.startDate)
            }
          }),
          ...(queryParams.endDate && {
            eventTimestamp: {
              lte: new Date(queryParams.endDate)
            }
          }),
          ...(queryParams.severity && {
            severity: queryParams.severity
          })
        },
        include: {
          policy: {
            select: { id: true, name: true, type: true }
          }
        },
        orderBy: {
          eventTimestamp: 'desc'
        },
        take: queryParams.limit,
        skip: queryParams.offset
      });

      const totalCount = await prisma.auditLog.count({
        where: {
          organizationId,
          eventType: {
            in: ['policy_evaluation', 'compliance_check', 'violation_detected', 'policy_updated']
          }
        }
      });

      return reply.send({
        success: true,
        data: {
          auditLogs: auditLogs.map(log => ({
            id: log.id,
            eventType: log.eventType,
            action: log.action,
            outcome: log.outcome,
            severity: log.severity,
            actorId: log.actorId,
            resourceType: log.resourceType,
            resourceId: log.resourceId,
            metadata: log.metadata,
            eventTimestamp: log.eventTimestamp,
            policy: log.policy
          })),
          pagination: {
            total: totalCount,
            limit: queryParams.limit,
            offset: queryParams.offset,
            hasMore: (queryParams.offset + queryParams.limit) < totalCount
          }
        }
      });

    } catch (error) {
      logger.error('Failed to get compliance audit trail', {
        organizationId: request.user?.organizationId,
        error: error.message
      });

      return reply.status(500).send({
        error: 'Failed to retrieve compliance audit trail',
        code: 'COMPLIANCE_AUDIT_ERROR'
      });
    }
  });
}

// Helper functions
async function getFrameworkComplianceStatus(organizationId: string, framework?: string, dateRange?: { start: Date; end: Date }) {
  const prisma = new PrismaClient();

  const frameworks = ['SOC2', 'GDPR', 'CCPA', 'HIPAA', 'PCI_DSS', 'ISO27001'];
  const targetFrameworks = framework ? [framework] : frameworks;

  const status = await Promise.all(
    targetFrameworks.map(async (fw) => {
      const rules = await prisma.complianceRule.findMany({
        where: {
          organizationId,
          framework: fw,
          status: 'active'
        }
      });

      const compliantRules = rules.filter(r => r.complianceStatus === 'compliant').length;
      const totalRules = rules.length;
      const complianceRate = totalRules > 0 ? (compliantRules / totalRules) * 100 : 0;

      return {
        framework: fw,
        totalRules,
        compliantRules,
        complianceRate: Math.round(complianceRate * 100) / 100,
        status: complianceRate >= 95 ? 'compliant' : complianceRate >= 80 ? 'partial' : 'non_compliant'
      };
    })
  );

  return status;
}

function calculateComplianceRate(rules: any[]): number {
  if (rules.length === 0) return 0;

  const compliantRules = rules.filter(r => r.complianceStatus === 'compliant').length;
  return Math.round((compliantRules / rules.length) * 100 * 100) / 100;
}

async function getComplianceFrameworks(organizationId: string) {
  const prisma = new PrismaClient();

  const frameworks = await prisma.complianceRule.groupBy({
    by: ['framework'],
    where: {
      organizationId,
      status: 'active'
    },
    _count: {
      framework: true
    }
  });

  return frameworks.map(fw => ({
    name: fw.framework,
    rulesCount: fw._count.framework
  }));
}

async function getComplianceMetrics(organizationId: string, options: { framework?: string; period: string }) {
  const prisma = new PrismaClient();

  // Calculate period start date
  const periodDays = {
    '7d': 7,
    '30d': 30,
    '90d': 90,
    '1y': 365
  };

  const days = periodDays[options.period as keyof typeof periodDays] || 30;
  const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const [violationTrends, policyMetrics, riskTrends] = await Promise.all([
    // Violation trends over time
    prisma.auditLog.groupBy({
      by: ['eventTimestamp'],
      where: {
        organizationId,
        eventType: 'violation_detected',
        eventTimestamp: { gte: startDate },
        ...(options.framework && {
          complianceFrameworks: { has: options.framework }
        })
      },
      _count: true
    }),

    // Policy evaluation metrics
    prisma.performanceMetric.findMany({
      where: {
        organizationId,
        category: 'policy_evaluation',
        timestamp: { gte: startDate }
      },
      orderBy: { timestamp: 'asc' }
    }),

    // Risk score trends
    prisma.auditLog.findMany({
      where: {
        organizationId,
        eventType: 'risk_assessment',
        eventTimestamp: { gte: startDate }
      },
      select: {
        eventTimestamp: true,
        metadata: true
      },
      orderBy: { eventTimestamp: 'asc' }
    })
  ]);

  return {
    violationTrends,
    policyMetrics,
    riskTrends
  };
}