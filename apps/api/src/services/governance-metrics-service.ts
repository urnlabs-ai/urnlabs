import { PrismaClient } from '@prisma/client';
import { logger, logBusinessMetric } from '@/lib/logger.js';

// ============================================================================
// GOVERNANCE METRICS COLLECTION SERVICE
// ============================================================================

/**
 * Service for collecting and analyzing governance-related metrics including
 * policy violations, RBAC activities, audit trail integrity, and compliance status
 */

export interface GovernanceMetrics {
  // Policy violation metrics
  policyViolations: {
    total: number;
    byPolicy: Record<string, number>;
    bySeverity: Record<string, number>;
    byResource: Record<string, number>;
    recentTrend: number; // Percentage change over last period
  };

  // RBAC metrics
  rbacMetrics: {
    activeUsers: number;
    roleAssignments: number;
    permissionChanges: number;
    failedAccessAttempts: number;
    privilegedOperations: number;
  };

  // Audit trail metrics
  auditMetrics: {
    totalEvents: number;
    integrityScore: number; // 0-1 score based on chain validation
    tamperingIncidents: number;
    archivedEvents: number;
    retentionCompliance: number; // Percentage of policies applied correctly
  };

  // Compliance metrics
  complianceMetrics: {
    activeTrails: number;
    byFramework: Record<string, number>;
    verificationStatus: Record<string, number>;
    pendingReviews: number;
    expiredPolicies: number;
  };

  // Performance metrics
  performanceMetrics: {
    avgResponseTime: number;
    throughput: number; // Events per second
    errorRate: number;
    availabilityScore: number;
  };

  // Time-series data
  timeSeries: {
    hourly: Array<{
      timestamp: Date;
      violations: number;
      auditEvents: number;
      rbacChanges: number;
    }>;
    daily: Array<{
      date: Date;
      violations: number;
      auditEvents: number;
      rbacChanges: number;
      integrityScore: number;
    }>;
  };
}

export interface MetricsQuery {
  organizationId?: string;
  startDate?: Date;
  endDate?: Date;
  granularity?: 'hour' | 'day' | 'week' | 'month';
  includeTimeSeries?: boolean;
  includeDetails?: boolean;
}

export class GovernanceMetricsService {
  constructor(private prisma: PrismaClient) {}

  /**
   * Collect comprehensive governance metrics for an organization
   */
  public async collectMetrics(query: MetricsQuery): Promise<GovernanceMetrics> {
    const startTime = Date.now();

    try {
      const { organizationId, startDate, endDate, includeTimeSeries = false } = query;

      // Default time range: last 24 hours
      const defaultStart = startDate || new Date(Date.now() - 24 * 60 * 60 * 1000);
      const defaultEnd = endDate || new Date();

      // Collect metrics in parallel for better performance
      const [
        policyViolations,
        rbacMetrics,
        auditMetrics,
        complianceMetrics,
        performanceMetrics,
        timeSeries
      ] = await Promise.all([
        this.collectPolicyViolationMetrics(organizationId, defaultStart, defaultEnd),
        this.collectRBACMetrics(organizationId, defaultStart, defaultEnd),
        this.collectAuditMetrics(organizationId, defaultStart, defaultEnd),
        this.collectComplianceMetrics(organizationId, defaultStart, defaultEnd),
        this.collectPerformanceMetrics(organizationId, defaultStart, defaultEnd),
        includeTimeSeries ? this.collectTimeSeriesMetrics(organizationId, defaultStart, defaultEnd, query.granularity) : null
      ]);

      const metrics: GovernanceMetrics = {
        policyViolations,
        rbacMetrics,
        auditMetrics,
        complianceMetrics,
        performanceMetrics,
        timeSeries: timeSeries || { hourly: [], daily: [] }
      };

      // Log performance metric
      const duration = Date.now() - startTime;
      logBusinessMetric('governance_metrics_collection', duration, 'ms', {
        organizationId: organizationId || 'global'
      });

      return metrics;

    } catch (error) {
      logger.error('Failed to collect governance metrics', { error, query });
      throw new Error('Metrics collection failed');
    }
  }

  /**
   * Collect policy violation metrics
   */
  private async collectPolicyViolationMetrics(
    organizationId?: string,
    startDate?: Date,
    endDate?: Date
  ) {
    const whereClause = {
      ...(organizationId && { organizationId }),
      ...(startDate && endDate && {
        detectedAt: {
          gte: startDate,
          lte: endDate
        }
      })
    };

    // Get total violations
    const total = await this.prisma.policyViolation.count({ where: whereClause });

    // Get violations by policy type
    const byPolicyRaw = await this.prisma.policyViolation.groupBy({
      by: ['policyType'],
      where: whereClause,
      _count: { id: true }
    });

    const byPolicy: Record<string, number> = {};
    byPolicyRaw.forEach(item => {
      byPolicy[item.policyType] = item._count.id;
    });

    // Get violations by severity
    const bySeverityRaw = await this.prisma.policyViolation.groupBy({
      by: ['severity'],
      where: whereClause,
      _count: { id: true }
    });

    const bySeverity: Record<string, number> = {};
    bySeverityRaw.forEach(item => {
      bySeverity[item.severity] = item._count.id;
    });

    // Get violations by resource type
    const byResourceRaw = await this.prisma.policyViolation.groupBy({
      by: ['resourceType'],
      where: whereClause,
      _count: { id: true }
    });

    const byResource: Record<string, number> = {};
    byResourceRaw.forEach(item => {
      byResource[item.resourceType] = item._count.id;
    });

    // Calculate recent trend (last 24h vs previous 24h)
    const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const previous24h = new Date(Date.now() - 48 * 60 * 60 * 1000);

    const [recentCount, previousCount] = await Promise.all([
      this.prisma.policyViolation.count({
        where: {
          ...whereClause,
          detectedAt: { gte: last24h }
        }
      }),
      this.prisma.policyViolation.count({
        where: {
          ...whereClause,
          detectedAt: { gte: previous24h, lt: last24h }
        }
      })
    ]);

    const recentTrend = previousCount > 0
      ? ((recentCount - previousCount) / previousCount) * 100
      : recentCount > 0 ? 100 : 0;

    return {
      total,
      byPolicy,
      bySeverity,
      byResource,
      recentTrend
    };
  }

  /**
   * Collect RBAC-related metrics
   */
  private async collectRBACMetrics(
    organizationId?: string,
    startDate?: Date,
    endDate?: Date
  ) {
    const whereClause = {
      ...(organizationId && { organizationId }),
      ...(startDate && endDate && {
        createdAt: {
          gte: startDate,
          lte: endDate
        }
      })
    };

    // Active users with role assignments
    const activeUsers = await this.prisma.userRole.groupBy({
      by: ['userId'],
      where: whereClause,
      _count: { userId: true }
    });

    // Total role assignments
    const roleAssignments = await this.prisma.userRole.count({ where: whereClause });

    // Permission changes (audit events related to RBAC)
    const permissionChanges = await this.prisma.auditLog.count({
      where: {
        ...whereClause,
        eventType: {
          in: ['role_assignment', 'role_removal', 'permission_grant', 'permission_revoke']
        }
      }
    });

    // Failed access attempts
    const failedAccessAttempts = await this.prisma.auditLog.count({
      where: {
        ...whereClause,
        eventType: 'access_denied',
        severity: { in: ['warning', 'error'] }
      }
    });

    // Privileged operations (high-risk actions)
    const privilegedOperations = await this.prisma.auditLog.count({
      where: {
        ...whereClause,
        eventType: {
          in: ['admin_action', 'system_change', 'data_export', 'user_impersonation']
        }
      }
    });

    return {
      activeUsers: activeUsers.length,
      roleAssignments,
      permissionChanges,
      failedAccessAttempts,
      privilegedOperations
    };
  }

  /**
   * Collect audit trail integrity metrics
   */
  private async collectAuditMetrics(
    organizationId?: string,
    startDate?: Date,
    endDate?: Date
  ) {
    const whereClause = {
      ...(organizationId && { organizationId }),
      ...(startDate && endDate && {
        timestamp: {
          gte: startDate,
          lte: endDate
        }
      })
    };

    // Total audit events
    const totalEvents = await this.prisma.auditLog.count({ where: whereClause });

    // Get recent integrity checks
    const integrityChecks = await this.prisma.auditLogIntegrityCheck.findMany({
      where: {
        ...whereClause,
        createdAt: {
          gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // Last 7 days
        }
      },
      orderBy: { createdAt: 'desc' },
      take: 10
    });

    // Calculate average integrity score
    const avgIntegrityScore = integrityChecks.length > 0
      ? integrityChecks.reduce((sum, check) => sum + check.integrityScore, 0) / integrityChecks.length
      : 1.0;

    // Count tampering incidents
    const tamperingIncidents = integrityChecks.filter(check =>
      check.tamperingDetected || check.status === 'failed'
    ).length;

    // Archived events count
    const archivedEvents = await this.prisma.auditLogArchive.count({
      where: {
        ...(organizationId && { organizationId }),
        archiveDate: {
          gte: startDate,
          lte: endDate
        }
      }
    });

    // Retention compliance calculation
    const retentionPolicies = await this.prisma.auditRetentionPolicy.count({
      where: {
        ...(organizationId && { organizationId }),
        isActive: true
      }
    });

    const appliedPolicies = await this.prisma.auditLogArchive.groupBy({
      by: ['archiveReason'],
      where: {
        ...(organizationId && { organizationId }),
        archiveReason: 'retention_policy'
      },
      _count: { id: true }
    });

    const retentionCompliance = retentionPolicies > 0
      ? (appliedPolicies.length / retentionPolicies) * 100
      : 100;

    return {
      totalEvents,
      integrityScore: avgIntegrityScore,
      tamperingIncidents,
      archivedEvents,
      retentionCompliance
    };
  }

  /**
   * Collect compliance framework metrics
   */
  private async collectComplianceMetrics(
    organizationId?: string,
    startDate?: Date,
    endDate?: Date
  ) {
    const whereClause = {
      ...(organizationId && { organizationId }),
      ...(startDate && endDate && {
        createdAt: {
          gte: startDate,
          lte: endDate
        }
      })
    };

    // Active compliance trails
    const activeTrails = await this.prisma.complianceTrail.count({
      where: {
        ...whereClause,
        verificationStatus: { in: ['active', 'verified'] }
      }
    });

    // Trails by compliance framework
    const byFrameworkRaw = await this.prisma.complianceTrail.groupBy({
      by: ['complianceFramework'],
      where: whereClause,
      _count: { id: true }
    });

    const byFramework: Record<string, number> = {};
    byFrameworkRaw.forEach(item => {
      byFramework[item.complianceFramework] = item._count.id;
    });

    // Verification status distribution
    const verificationStatusRaw = await this.prisma.complianceTrail.groupBy({
      by: ['verificationStatus'],
      where: whereClause,
      _count: { id: true }
    });

    const verificationStatus: Record<string, number> = {};
    verificationStatusRaw.forEach(item => {
      verificationStatus[item.verificationStatus] = item._count.id;
    });

    // Pending reviews (trails that need verification)
    const pendingReviews = await this.prisma.complianceTrail.count({
      where: {
        ...whereClause,
        verificationStatus: 'active',
        endDate: { lte: new Date() } // Past end date = needs review
      }
    });

    // Expired retention policies
    const expiredPolicies = await this.prisma.auditRetentionPolicy.count({
      where: {
        ...whereClause,
        isActive: true,
        updatedAt: {
          lte: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000) // Over 1 year old
        }
      }
    });

    return {
      activeTrails,
      byFramework,
      verificationStatus,
      pendingReviews,
      expiredPolicies
    };
  }

  /**
   * Collect performance metrics for governance operations
   */
  private async collectPerformanceMetrics(
    organizationId?: string,
    startDate?: Date,
    endDate?: Date
  ) {
    // This would typically integrate with APM tools
    // For now, we'll provide basic metrics from audit logs

    const recentLogs = await this.prisma.auditLog.findMany({
      where: {
        ...(organizationId && { organizationId }),
        timestamp: {
          gte: new Date(Date.now() - 60 * 60 * 1000) // Last hour
        }
      },
      select: {
        timestamp: true,
        metadata: true
      },
      orderBy: { timestamp: 'desc' }
    });

    // Calculate throughput (events per second)
    const throughput = recentLogs.length / 3600; // Events per second over last hour

    // Estimate avg response time from metadata (if available)
    const responseTimes = recentLogs
      .map(log => log.metadata?.responseTime)
      .filter(time => typeof time === 'number') as number[];

    const avgResponseTime = responseTimes.length > 0
      ? responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length
      : 0;

    // Calculate error rate
    const errorEvents = await this.prisma.auditLog.count({
      where: {
        ...(organizationId && { organizationId }),
        severity: { in: ['error', 'critical'] },
        timestamp: {
          gte: new Date(Date.now() - 60 * 60 * 1000)
        }
      }
    });

    const errorRate = recentLogs.length > 0 ? (errorEvents / recentLogs.length) * 100 : 0;

    // Availability score (based on successful operations)
    const availabilityScore = Math.max(0, 100 - errorRate);

    return {
      avgResponseTime,
      throughput,
      errorRate,
      availabilityScore
    };
  }

  /**
   * Collect time-series metrics for trending analysis
   */
  private async collectTimeSeriesMetrics(
    organizationId?: string,
    startDate?: Date,
    endDate?: Date,
    granularity: 'hour' | 'day' | 'week' | 'month' = 'hour'
  ) {
    const defaultStart = startDate || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const defaultEnd = endDate || new Date();

    // Generate time buckets based on granularity
    const buckets = this.generateTimeBuckets(defaultStart, defaultEnd, granularity);

    const timeSeries = await Promise.all(
      buckets.map(async (bucket) => {
        const [violations, auditEvents, rbacChanges] = await Promise.all([
          this.prisma.policyViolation.count({
            where: {
              ...(organizationId && { organizationId }),
              detectedAt: {
                gte: bucket.start,
                lt: bucket.end
              }
            }
          }),
          this.prisma.auditLog.count({
            where: {
              ...(organizationId && { organizationId }),
              timestamp: {
                gte: bucket.start,
                lt: bucket.end
              }
            }
          }),
          this.prisma.auditLog.count({
            where: {
              ...(organizationId && { organizationId }),
              eventType: {
                in: ['role_assignment', 'role_removal', 'permission_grant', 'permission_revoke']
              },
              timestamp: {
                gte: bucket.start,
                lt: bucket.end
              }
            }
          })
        ]);

        return {
          timestamp: bucket.start,
          violations,
          auditEvents,
          rbacChanges
        };
      })
    );

    // For daily granularity, also include integrity scores
    let dailyData: any[] = [];
    if (granularity === 'day') {
      dailyData = await Promise.all(
        buckets.map(async (bucket) => {
          const integrityChecks = await this.prisma.auditLogIntegrityCheck.findMany({
            where: {
              ...(organizationId && { organizationId }),
              createdAt: {
                gte: bucket.start,
                lt: bucket.end
              }
            }
          });

          const avgIntegrityScore = integrityChecks.length > 0
            ? integrityChecks.reduce((sum, check) => sum + check.integrityScore, 0) / integrityChecks.length
            : 1.0;

          const baseData = timeSeries.find(ts => ts.timestamp.getTime() === bucket.start.getTime());

          return {
            date: bucket.start,
            violations: baseData?.violations || 0,
            auditEvents: baseData?.auditEvents || 0,
            rbacChanges: baseData?.rbacChanges || 0,
            integrityScore: avgIntegrityScore
          };
        })
      );
    }

    return {
      hourly: granularity === 'hour' ? timeSeries : [],
      daily: granularity === 'day' ? dailyData : []
    };
  }

  /**
   * Generate time buckets for time-series data
   */
  private generateTimeBuckets(
    startDate: Date,
    endDate: Date,
    granularity: 'hour' | 'day' | 'week' | 'month'
  ): Array<{ start: Date; end: Date }> {
    const buckets: Array<{ start: Date; end: Date }> = [];
    let current = new Date(startDate);

    while (current < endDate) {
      const next = new Date(current);

      switch (granularity) {
        case 'hour':
          next.setHours(next.getHours() + 1);
          break;
        case 'day':
          next.setDate(next.getDate() + 1);
          break;
        case 'week':
          next.setDate(next.getDate() + 7);
          break;
        case 'month':
          next.setMonth(next.getMonth() + 1);
          break;
      }

      buckets.push({
        start: new Date(current),
        end: new Date(Math.min(next.getTime(), endDate.getTime()))
      });

      current = next;
    }

    return buckets;
  }

  /**
   * Export metrics in Prometheus format
   */
  public async exportPrometheusMetrics(organizationId?: string): Promise<string> {
    const metrics = await this.collectMetrics({ organizationId, includeTimeSeries: false });

    const lines: string[] = [];

    // Policy violation metrics
    lines.push('# HELP governance_policy_violations_total Total number of policy violations');
    lines.push('# TYPE governance_policy_violations_total counter');
    lines.push(`governance_policy_violations_total{org="${organizationId || 'global'}"} ${metrics.policyViolations.total}`);

    // RBAC metrics
    lines.push('# HELP governance_rbac_active_users Number of users with active role assignments');
    lines.push('# TYPE governance_rbac_active_users gauge');
    lines.push(`governance_rbac_active_users{org="${organizationId || 'global'}"} ${metrics.rbacMetrics.activeUsers}`);

    // Audit metrics
    lines.push('# HELP governance_audit_integrity_score Audit trail integrity score (0-1)');
    lines.push('# TYPE governance_audit_integrity_score gauge');
    lines.push(`governance_audit_integrity_score{org="${organizationId || 'global'}"} ${metrics.auditMetrics.integrityScore}`);

    // Compliance metrics
    lines.push('# HELP governance_compliance_active_trails Number of active compliance trails');
    lines.push('# TYPE governance_compliance_active_trails gauge');
    lines.push(`governance_compliance_active_trails{org="${organizationId || 'global'}"} ${metrics.complianceMetrics.activeTrails}`);

    // Performance metrics
    lines.push('# HELP governance_performance_availability_score Service availability score (0-100)');
    lines.push('# TYPE governance_performance_availability_score gauge');
    lines.push(`governance_performance_availability_score{org="${organizationId || 'global'}"} ${metrics.performanceMetrics.availabilityScore}`);

    return lines.join('\n') + '\n';
  }

  /**
   * Get real-time alerts based on metric thresholds
   */
  public async getGovernanceAlerts(organizationId?: string): Promise<Array<{
    type: 'violation' | 'integrity' | 'compliance' | 'performance';
    severity: 'low' | 'medium' | 'high' | 'critical';
    message: string;
    timestamp: Date;
    metadata?: Record<string, any>;
  }>> {
    const metrics = await this.collectMetrics({ organizationId, includeTimeSeries: false });
    const alerts: any[] = [];

    // Check for high violation rates
    if (metrics.policyViolations.recentTrend > 50) {
      alerts.push({
        type: 'violation',
        severity: metrics.policyViolations.recentTrend > 100 ? 'critical' : 'high',
        message: `Policy violations increased by ${metrics.policyViolations.recentTrend.toFixed(1)}% in the last 24 hours`,
        timestamp: new Date(),
        metadata: { trend: metrics.policyViolations.recentTrend }
      });
    }

    // Check for integrity issues
    if (metrics.auditMetrics.integrityScore < 0.95) {
      alerts.push({
        type: 'integrity',
        severity: metrics.auditMetrics.integrityScore < 0.8 ? 'critical' : 'high',
        message: `Audit trail integrity score is ${(metrics.auditMetrics.integrityScore * 100).toFixed(1)}%`,
        timestamp: new Date(),
        metadata: { integrityScore: metrics.auditMetrics.integrityScore }
      });
    }

    // Check for tampering incidents
    if (metrics.auditMetrics.tamperingIncidents > 0) {
      alerts.push({
        type: 'integrity',
        severity: 'critical',
        message: `${metrics.auditMetrics.tamperingIncidents} tampering incident(s) detected in audit trail`,
        timestamp: new Date(),
        metadata: { incidents: metrics.auditMetrics.tamperingIncidents }
      });
    }

    // Check for pending compliance reviews
    if (metrics.complianceMetrics.pendingReviews > 5) {
      alerts.push({
        type: 'compliance',
        severity: 'medium',
        message: `${metrics.complianceMetrics.pendingReviews} compliance trail(s) pending review`,
        timestamp: new Date(),
        metadata: { pendingReviews: metrics.complianceMetrics.pendingReviews }
      });
    }

    // Check for performance issues
    if (metrics.performanceMetrics.availabilityScore < 95) {
      alerts.push({
        type: 'performance',
        severity: metrics.performanceMetrics.availabilityScore < 90 ? 'high' : 'medium',
        message: `Governance service availability is ${metrics.performanceMetrics.availabilityScore.toFixed(1)}%`,
        timestamp: new Date(),
        metadata: { availabilityScore: metrics.performanceMetrics.availabilityScore }
      });
    }

    return alerts;
  }
}