import { PrismaClient } from '@prisma/client';
import { AuditLogger } from './policy-evaluation-engine';
import {
  PolicyEvaluationContext,
  PolicyEvaluationResult
} from './policy-evaluation-engine';
import { logger } from '../lib/logger';
import crypto from 'crypto';

/**
 * Audit log entry for policy evaluation
 */
export interface PolicyAuditLogEntry {
  id: string;
  timestamp: Date;
  policyId: string;
  userId: string;
  organizationId: string;
  action: string;
  resource?: string;
  decision: 'allow' | 'deny' | 'require_approval';
  ruleMatched?: string;
  evaluationTime: number;
  context: Record<string, any>;
  result: Record<string, any>;
  severity: 'info' | 'warning' | 'error' | 'critical';
  ipAddress?: string;
  userAgent?: string;
  sessionId?: string;
  requestId?: string;

  // Integrity fields for tamper detection
  contentHash: string;
  previousHash?: string;
  chainIndex: number;
}

/**
 * Policy audit statistics
 */
export interface PolicyAuditStatistics {
  totalEvaluations: number;
  allowedRequests: number;
  deniedRequests: number;
  approvalRequests: number;
  averageEvaluationTime: number;
  topDeniedPolicies: Array<{ policyId: string; count: number }>;
  topUsers: Array<{ userId: string; count: number }>;
  violationsByRisk: Record<string, number>;
  timeRange: {
    from: Date;
    to: Date;
  };
}

/**
 * Prisma-based policy audit logger implementation
 *
 * Provides comprehensive audit logging for policy evaluations with
 * integrity protection and analytics capabilities
 */
export class PrismaPolicyAuditLogger implements AuditLogger {
  private chainCounter = 0;
  private lastHash: string | null = null;

  constructor(private readonly prisma: PrismaClient) {
    this.initializeChain();
  }

  /**
   * Log policy evaluation for audit trail
   */
  async logPolicyEvaluation(
    policyId: string,
    context: PolicyEvaluationContext,
    result: PolicyEvaluationResult
  ): Promise<void> {
    try {
      const entry = await this.createAuditLogEntry(policyId, context, result);

      await this.prisma.policyAuditLog.create({
        data: {
          id: entry.id,
          timestamp: entry.timestamp,
          policyId: entry.policyId,
          userId: entry.userId,
          organizationId: entry.organizationId,
          action: entry.action,
          resource: entry.resource,
          decision: entry.decision,
          ruleMatched: entry.ruleMatched,
          evaluationTime: entry.evaluationTime,
          context: entry.context,
          result: entry.result,
          severity: entry.severity,
          ipAddress: entry.ipAddress,
          userAgent: entry.userAgent,
          sessionId: entry.sessionId,
          requestId: entry.requestId,
          contentHash: entry.contentHash,
          previousHash: entry.previousHash,
          chainIndex: entry.chainIndex
        }
      });

      // Update chain state
      this.lastHash = entry.contentHash;
      this.chainCounter++;

      // Log high-severity events
      if (entry.severity === 'critical' || entry.severity === 'error') {
        logger.warn('High-severity policy evaluation', {
          policyId,
          userId: context.userId,
          decision: entry.decision,
          severity: entry.severity,
          resource: entry.resource,
          ruleMatched: entry.ruleMatched
        });
      }

    } catch (error) {
      logger.error('Failed to log policy evaluation', {
        policyId,
        userId: context.userId,
        error: error.message
      });

      // Don't throw - audit logging failures shouldn't break the application
      // But we should alert monitoring systems
      this.alertAuditFailure(policyId, context, error);
    }
  }

  /**
   * Log policy violation with detailed information
   */
  async logPolicyViolation(
    policyId: string,
    context: PolicyEvaluationContext,
    violation: {
      type: string;
      description: string;
      severity: 'low' | 'medium' | 'high' | 'critical';
      metadata?: Record<string, any>;
    }
  ): Promise<void> {
    try {
      const entry: PolicyAuditLogEntry = {
        id: crypto.randomUUID(),
        timestamp: new Date(),
        policyId,
        userId: context.userId,
        organizationId: context.organizationId,
        action: 'violation',
        resource: context.resource,
        decision: 'deny',
        evaluationTime: 0,
        context: this.sanitizeContext(context),
        result: {
          violationType: violation.type,
          description: violation.description,
          metadata: violation.metadata
        },
        severity: this.mapViolationSeverity(violation.severity),
        ipAddress: context.metadata?.ipAddress,
        userAgent: context.metadata?.userAgent,
        sessionId: context.metadata?.sessionId,
        requestId: context.metadata?.requestId,
        contentHash: '',
        chainIndex: this.chainCounter + 1
      };

      // Calculate content hash
      entry.contentHash = this.calculateContentHash(entry);
      entry.previousHash = this.lastHash;

      await this.prisma.policyAuditLog.create({
        data: entry
      });

      // Update chain state
      this.lastHash = entry.contentHash;
      this.chainCounter++;

      // Alert for high-severity violations
      if (violation.severity === 'critical' || violation.severity === 'high') {
        await this.alertSecurityViolation(policyId, context, violation);
      }

    } catch (error) {
      logger.error('Failed to log policy violation', {
        policyId,
        userId: context.userId,
        violationType: violation.type,
        error: error.message
      });
    }
  }

  /**
   * Get audit statistics for a time period
   */
  async getAuditStatistics(
    organizationId: string,
    fromDate: Date,
    toDate: Date
  ): Promise<PolicyAuditStatistics> {
    try {
      const whereClause = {
        organizationId,
        timestamp: {
          gte: fromDate,
          lte: toDate
        }
      };

      const [
        totalEvaluations,
        allowedRequests,
        deniedRequests,
        approvalRequests,
        avgEvaluationTime,
        topDeniedPolicies,
        topUsers,
        violationsByRisk
      ] = await Promise.all([
        // Total evaluations
        this.prisma.policyAuditLog.count({ where: whereClause }),

        // Allowed requests
        this.prisma.policyAuditLog.count({
          where: { ...whereClause, decision: 'allow' }
        }),

        // Denied requests
        this.prisma.policyAuditLog.count({
          where: { ...whereClause, decision: 'deny' }
        }),

        // Approval requests
        this.prisma.policyAuditLog.count({
          where: { ...whereClause, decision: 'require_approval' }
        }),

        // Average evaluation time
        this.prisma.policyAuditLog.aggregate({
          where: whereClause,
          _avg: { evaluationTime: true }
        }),

        // Top denied policies
        this.prisma.policyAuditLog.groupBy({
          by: ['policyId'],
          where: { ...whereClause, decision: 'deny' },
          _count: { policyId: true },
          orderBy: { _count: { policyId: 'desc' } },
          take: 10
        }),

        // Top users by evaluations
        this.prisma.policyAuditLog.groupBy({
          by: ['userId'],
          where: whereClause,
          _count: { userId: true },
          orderBy: { _count: { userId: 'desc' } },
          take: 10
        }),

        // Violations by risk level
        this.prisma.policyAuditLog.groupBy({
          by: ['severity'],
          where: { ...whereClause, decision: 'deny' },
          _count: { severity: true }
        })
      ]);

      return {
        totalEvaluations,
        allowedRequests,
        deniedRequests,
        approvalRequests,
        averageEvaluationTime: avgEvaluationTime._avg.evaluationTime || 0,
        topDeniedPolicies: topDeniedPolicies.map(item => ({
          policyId: item.policyId,
          count: item._count.policyId
        })),
        topUsers: topUsers.map(item => ({
          userId: item.userId,
          count: item._count.userId
        })),
        violationsByRisk: violationsByRisk.reduce((acc, item) => {
          acc[item.severity] = item._count.severity;
          return acc;
        }, {} as Record<string, number>),
        timeRange: { from: fromDate, to: toDate }
      };

    } catch (error) {
      logger.error('Failed to get audit statistics', {
        organizationId,
        fromDate,
        toDate,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get audit logs for a specific policy
   */
  async getPolicyAuditLogs(
    policyId: string,
    organizationId: string,
    options: {
      limit?: number;
      offset?: number;
      fromDate?: Date;
      toDate?: Date;
      decision?: 'allow' | 'deny' | 'require_approval';
      severity?: 'info' | 'warning' | 'error' | 'critical';
    } = {}
  ): Promise<PolicyAuditLogEntry[]> {
    try {
      const {
        limit = 100,
        offset = 0,
        fromDate,
        toDate,
        decision,
        severity
      } = options;

      const whereClause: any = {
        policyId,
        organizationId
      };

      if (fromDate || toDate) {
        whereClause.timestamp = {};
        if (fromDate) whereClause.timestamp.gte = fromDate;
        if (toDate) whereClause.timestamp.lte = toDate;
      }

      if (decision) {
        whereClause.decision = decision;
      }

      if (severity) {
        whereClause.severity = severity;
      }

      const logs = await this.prisma.policyAuditLog.findMany({
        where: whereClause,
        orderBy: { timestamp: 'desc' },
        take: limit,
        skip: offset
      });

      return logs as PolicyAuditLogEntry[];

    } catch (error) {
      logger.error('Failed to get policy audit logs', {
        policyId,
        organizationId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Verify audit log integrity
   */
  async verifyAuditIntegrity(
    organizationId: string,
    fromDate?: Date,
    toDate?: Date
  ): Promise<{
    isValid: boolean;
    totalChecked: number;
    invalidEntries: Array<{ id: string; reason: string }>;
  }> {
    try {
      const whereClause: any = { organizationId };

      if (fromDate || toDate) {
        whereClause.timestamp = {};
        if (fromDate) whereClause.timestamp.gte = fromDate;
        if (toDate) whereClause.timestamp.lte = toDate;
      }

      const logs = await this.prisma.policyAuditLog.findMany({
        where: whereClause,
        orderBy: { chainIndex: 'asc' }
      });

      const invalidEntries: Array<{ id: string; reason: string }> = [];
      let previousHash: string | null = null;

      for (const log of logs) {
        // Verify content hash
        const calculatedHash = this.calculateContentHash(log as PolicyAuditLogEntry);
        if (calculatedHash !== log.contentHash) {
          invalidEntries.push({
            id: log.id,
            reason: 'Content hash mismatch'
          });
        }

        // Verify chain integrity
        if (previousHash !== null && log.previousHash !== previousHash) {
          invalidEntries.push({
            id: log.id,
            reason: 'Chain integrity violation'
          });
        }

        previousHash = log.contentHash;
      }

      return {
        isValid: invalidEntries.length === 0,
        totalChecked: logs.length,
        invalidEntries
      };

    } catch (error) {
      logger.error('Failed to verify audit integrity', {
        organizationId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Export audit logs for compliance reporting
   */
  async exportAuditLogs(
    organizationId: string,
    fromDate: Date,
    toDate: Date,
    format: 'json' | 'csv' = 'json'
  ): Promise<string> {
    try {
      const logs = await this.prisma.policyAuditLog.findMany({
        where: {
          organizationId,
          timestamp: {
            gte: fromDate,
            lte: toDate
          }
        },
        orderBy: { timestamp: 'asc' }
      });

      if (format === 'csv') {
        return this.convertToCSV(logs);
      } else {
        return JSON.stringify({
          exportDate: new Date().toISOString(),
          organizationId,
          timeRange: { from: fromDate, to: toDate },
          totalRecords: logs.length,
          logs
        }, null, 2);
      }

    } catch (error) {
      logger.error('Failed to export audit logs', {
        organizationId,
        fromDate,
        toDate,
        format,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Clean up old audit logs based on retention policy
   */
  async cleanupOldLogs(
    organizationId: string,
    retentionDays: number
  ): Promise<{ deletedCount: number }> {
    try {
      const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

      const result = await this.prisma.policyAuditLog.deleteMany({
        where: {
          organizationId,
          timestamp: {
            lt: cutoffDate
          }
        }
      });

      logger.info('Cleaned up old audit logs', {
        organizationId,
        retentionDays,
        deletedCount: result.count
      });

      return { deletedCount: result.count };

    } catch (error) {
      logger.error('Failed to cleanup old audit logs', {
        organizationId,
        retentionDays,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Create audit log entry from policy evaluation
   */
  private async createAuditLogEntry(
    policyId: string,
    context: PolicyEvaluationContext,
    result: PolicyEvaluationResult
  ): Promise<PolicyAuditLogEntry> {
    const entry: PolicyAuditLogEntry = {
      id: crypto.randomUUID(),
      timestamp: new Date(),
      policyId,
      userId: context.userId,
      organizationId: context.organizationId,
      action: context.action || 'unknown',
      resource: context.resource,
      decision: result.allowed
        ? (result.requiresApproval ? 'require_approval' : 'allow')
        : 'deny',
      ruleMatched: result.ruleMatched,
      evaluationTime: result.evaluationTime,
      context: this.sanitizeContext(context),
      result: {
        action: result.action,
        message: result.message,
        metadata: result.metadata,
        violationSeverity: result.violationSeverity
      },
      severity: this.determineSeverity(result),
      ipAddress: context.metadata?.ipAddress,
      userAgent: context.metadata?.userAgent,
      sessionId: context.metadata?.sessionId,
      requestId: context.metadata?.requestId,
      contentHash: '',
      previousHash: this.lastHash,
      chainIndex: this.chainCounter + 1
    };

    // Calculate content hash for integrity
    entry.contentHash = this.calculateContentHash(entry);

    return entry;
  }

  /**
   * Calculate content hash for integrity verification
   */
  private calculateContentHash(entry: PolicyAuditLogEntry): string {
    const content = {
      id: entry.id,
      timestamp: entry.timestamp.toISOString(),
      policyId: entry.policyId,
      userId: entry.userId,
      organizationId: entry.organizationId,
      action: entry.action,
      resource: entry.resource,
      decision: entry.decision,
      ruleMatched: entry.ruleMatched,
      evaluationTime: entry.evaluationTime,
      context: entry.context,
      result: entry.result,
      severity: entry.severity,
      chainIndex: entry.chainIndex,
      previousHash: entry.previousHash
    };

    return crypto
      .createHash('sha256')
      .update(JSON.stringify(content))
      .digest('hex');
  }

  /**
   * Sanitize context to remove sensitive information
   */
  private sanitizeContext(context: PolicyEvaluationContext): Record<string, any> {
    const sanitized = { ...context };

    // Remove sensitive fields
    if (sanitized.metadata) {
      const { headers, ...safeMetadata } = sanitized.metadata;
      sanitized.metadata = safeMetadata;
    }

    return sanitized;
  }

  /**
   * Determine severity based on policy result
   */
  private determineSeverity(result: PolicyEvaluationResult): 'info' | 'warning' | 'error' | 'critical' {
    if (result.violationSeverity) {
      return result.violationSeverity;
    }

    if (!result.allowed) {
      return result.action.severity || 'warning';
    }

    return 'info';
  }

  /**
   * Map violation severity to audit severity
   */
  private mapViolationSeverity(severity: string): 'info' | 'warning' | 'error' | 'critical' {
    switch (severity) {
      case 'low': return 'info';
      case 'medium': return 'warning';
      case 'high': return 'error';
      case 'critical': return 'critical';
      default: return 'info';
    }
  }

  /**
   * Initialize audit chain
   */
  private async initializeChain(): Promise<void> {
    try {
      const lastEntry = await this.prisma.policyAuditLog.findFirst({
        orderBy: { chainIndex: 'desc' }
      });

      if (lastEntry) {
        this.chainCounter = lastEntry.chainIndex;
        this.lastHash = lastEntry.contentHash;
      } else {
        this.chainCounter = 0;
        this.lastHash = null;
      }
    } catch (error) {
      logger.error('Failed to initialize audit chain', { error: error.message });
      this.chainCounter = 0;
      this.lastHash = null;
    }
  }

  /**
   * Alert audit failure to monitoring systems
   */
  private async alertAuditFailure(
    policyId: string,
    context: PolicyEvaluationContext,
    error: Error
  ): Promise<void> {
    // This would integrate with monitoring/alerting systems
    logger.critical('Audit logging failure', {
      policyId,
      userId: context.userId,
      organizationId: context.organizationId,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Alert security violation to security teams
   */
  private async alertSecurityViolation(
    policyId: string,
    context: PolicyEvaluationContext,
    violation: any
  ): Promise<void> {
    // This would integrate with security alerting systems
    logger.critical('High-severity policy violation', {
      policyId,
      userId: context.userId,
      organizationId: context.organizationId,
      violationType: violation.type,
      severity: violation.severity,
      description: violation.description,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Convert logs to CSV format
   */
  private convertToCSV(logs: any[]): string {
    if (logs.length === 0) return '';

    const headers = [
      'id', 'timestamp', 'policyId', 'userId', 'organizationId',
      'action', 'resource', 'decision', 'ruleMatched', 'evaluationTime',
      'severity', 'ipAddress', 'userAgent'
    ];

    const csvLines = [headers.join(',')];

    logs.forEach(log => {
      const row = headers.map(header => {
        const value = log[header];
        if (value === null || value === undefined) return '';
        if (typeof value === 'string' && value.includes(',')) {
          return `"${value.replace(/"/g, '""')}"`;
        }
        return String(value);
      });
      csvLines.push(row.join(','));
    });

    return csvLines.join('\n');
  }
}