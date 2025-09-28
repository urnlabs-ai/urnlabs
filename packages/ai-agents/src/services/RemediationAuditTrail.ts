import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import { AuditLogger } from '../core/AuditLogger';

/**
 * Remediation Audit Trail Service
 *
 * Provides specialized audit tracking for automated remediation workflows,
 * ensuring complete traceability and compliance for all remediation actions.
 */

export interface RemediationAuditEntry {
  id: string;
  timestamp: Date;

  // Remediation context
  remediationExecutionId: string;
  violationId: string;
  policyId: string;
  remediationPolicyId: string;

  // Action details
  actionType: string;
  actionId: string;
  actionStatus: 'initiated' | 'in_progress' | 'completed' | 'failed' | 'cancelled';

  // Actor information
  actor: string;
  actorType: 'system' | 'user' | 'service';

  // Resource context
  resourceType: string;
  resourceId: string;
  resourceState?: any;

  // Execution details
  executionTimeMs?: number;
  result?: any;
  error?: string;

  // Decision context
  decisionRationale?: string;
  alternativesConsidered?: string[];
  approvalRequired: boolean;
  approvalStatus?: 'pending' | 'approved' | 'rejected';

  // Compliance metadata
  complianceFrameworks: string[];
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  dataClassification: 'public' | 'internal' | 'confidential' | 'restricted';
  retentionPeriodDays: number;

  // Chain integrity
  previousEntryHash?: string;
  entryHash: string;

  // Additional metadata
  metadata: Record<string, any>;
}

export interface RemediationAuditQuery {
  remediationExecutionId?: string;
  violationId?: string;
  policyId?: string;
  actionType?: string;
  actor?: string;
  resourceType?: string;
  startDate?: Date;
  endDate?: Date;
  complianceFramework?: string;
  riskLevel?: 'low' | 'medium' | 'high' | 'critical';
  limit?: number;
  offset?: number;
}

export interface RemediationAuditReport {
  id: string;
  reportType: 'compliance' | 'performance' | 'incident' | 'trend';
  generatedAt: Date;
  generatedBy: string;

  timeRange: {
    startDate: Date;
    endDate: Date;
  };

  filters: RemediationAuditQuery;

  summary: {
    totalRemediations: number;
    successfulRemediations: number;
    failedRemediations: number;
    escalatedRemediations: number;
    averageExecutionTime: number;
    topViolationTypes: Array<{ type: string; count: number }>;
    topRemediationActions: Array<{ action: string; count: number }>;
  };

  complianceMetrics: {
    framework: string;
    totalRequiredActions: number;
    completedActions: number;
    complianceRate: number;
    outstandingIssues: number;
  }[];

  recommendations: string[];

  data: RemediationAuditEntry[];
}

export class RemediationAuditTrail extends EventEmitter {
  private prisma: PrismaClient;
  private redis: Redis;
  private auditLogger: AuditLogger;

  private isInitialized = false;
  private bufferSize = 1000;
  private flushInterval = 30000; // 30 seconds
  private buffer: RemediationAuditEntry[] = [];

  // Chain integrity tracking
  private lastEntryHash: string | null = null;
  private integrityChainValid = true;

  constructor(prisma?: PrismaClient, redis?: Redis, auditLogger?: AuditLogger) {
    super();

    this.prisma = prisma || new PrismaClient();
    this.redis = redis || new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
    this.auditLogger = auditLogger || new AuditLogger();
  }

  /**
   * Initialize the remediation audit trail
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // Test connections
      await this.prisma.$connect();
      await this.redis.ping();
      await this.auditLogger.initialize();

      // Load last entry hash for chain integrity
      await this.loadLastEntryHash();

      // Start periodic buffer flush
      setInterval(() => this.flushBuffer(), this.flushInterval);

      this.isInitialized = true;

      await this.logEntry({
        remediationExecutionId: 'system',
        violationId: 'system',
        policyId: 'system',
        remediationPolicyId: 'system',
        actionType: 'system_initialization',
        actionId: 'audit_trail_init',
        actionStatus: 'completed',
        actor: 'system',
        actorType: 'system',
        resourceType: 'audit_trail',
        resourceId: 'remediation_audit_trail',
        approvalRequired: false,
        complianceFrameworks: ['SOX', 'GDPR', 'HIPAA'],
        riskLevel: 'low',
        dataClassification: 'internal',
        retentionPeriodDays: 2555,
        metadata: {
          version: '1.0.0',
          bufferSize: this.bufferSize,
          flushInterval: this.flushInterval
        }
      });

      this.emit('initialized');

    } catch (error) {
      throw new Error(`Failed to initialize RemediationAuditTrail: ${error}`);
    }
  }

  /**
   * Log a remediation audit entry
   */
  async logEntry(entry: Omit<RemediationAuditEntry, 'id' | 'timestamp' | 'entryHash' | 'previousEntryHash'>): Promise<string> {
    const auditEntry: RemediationAuditEntry = {
      id: uuidv4(),
      timestamp: new Date(),
      previousEntryHash: this.lastEntryHash,
      entryHash: '', // Will be calculated
      ...entry
    };

    // Calculate entry hash for chain integrity
    auditEntry.entryHash = await this.calculateEntryHash(auditEntry);
    this.lastEntryHash = auditEntry.entryHash;

    // Add to buffer
    this.buffer.push(auditEntry);

    // Store in Redis for real-time access
    await this.redis.setex(
      `remediation_audit:${auditEntry.id}`,
      86400, // 24 hours
      JSON.stringify(auditEntry)
    );

    // Emit event for real-time processing
    this.emit('entry_logged', auditEntry);

    // Flush buffer if full
    if (this.buffer.length >= this.bufferSize) {
      await this.flushBuffer();
    }

    return auditEntry.id;
  }

  /**
   * Log remediation execution start
   */
  async logRemediationStart(
    executionId: string,
    violationId: string,
    policyId: string,
    remediationPolicyId: string,
    context: Record<string, any>
  ): Promise<string> {
    return await this.logEntry({
      remediationExecutionId: executionId,
      violationId,
      policyId,
      remediationPolicyId,
      actionType: 'remediation_execution',
      actionId: 'start',
      actionStatus: 'initiated',
      actor: 'remediation_engine',
      actorType: 'system',
      resourceType: 'remediation_execution',
      resourceId: executionId,
      approvalRequired: false,
      complianceFrameworks: ['SOX', 'GDPR', 'HIPAA', 'PCI'],
      riskLevel: this.determineRiskLevel(context),
      dataClassification: 'confidential',
      retentionPeriodDays: 2555,
      metadata: {
        context,
        phase: 'initiation'
      }
    });
  }

  /**
   * Log remediation action execution
   */
  async logActionExecution(
    executionId: string,
    violationId: string,
    actionType: string,
    actionId: string,
    status: RemediationAuditEntry['actionStatus'],
    result?: any,
    error?: string,
    executionTimeMs?: number
  ): Promise<string> {
    return await this.logEntry({
      remediationExecutionId: executionId,
      violationId,
      policyId: 'unknown', // Would be provided by context
      remediationPolicyId: 'unknown', // Would be provided by context
      actionType,
      actionId,
      actionStatus: status,
      actor: 'response_action_executor',
      actorType: 'system',
      resourceType: 'remediation_action',
      resourceId: actionId,
      executionTimeMs,
      result,
      error,
      approvalRequired: actionType === 'require_approval',
      complianceFrameworks: this.getComplianceFrameworksForAction(actionType),
      riskLevel: status === 'failed' ? 'high' : 'medium',
      dataClassification: 'confidential',
      retentionPeriodDays: 2555,
      metadata: {
        actionType,
        executionResult: result,
        phase: 'execution'
      }
    });
  }

  /**
   * Log remediation escalation
   */
  async logEscalation(
    executionId: string,
    violationId: string,
    escalationLevel: number,
    escalationReason: string,
    escalationActions: any[]
  ): Promise<string> {
    return await this.logEntry({
      remediationExecutionId: executionId,
      violationId,
      policyId: 'unknown',
      remediationPolicyId: 'unknown',
      actionType: 'escalation',
      actionId: `escalation_level_${escalationLevel}`,
      actionStatus: 'initiated',
      actor: 'escalation_manager',
      actorType: 'system',
      resourceType: 'escalation',
      resourceId: `${executionId}_escalation_${escalationLevel}`,
      decisionRationale: escalationReason,
      approvalRequired: escalationLevel >= 2,
      complianceFrameworks: ['SOX', 'GDPR', 'HIPAA'],
      riskLevel: escalationLevel >= 3 ? 'critical' : 'high',
      dataClassification: 'restricted',
      retentionPeriodDays: 2555,
      metadata: {
        escalationLevel,
        escalationReason,
        escalationActions: escalationActions.length,
        phase: 'escalation'
      }
    });
  }

  /**
   * Log approval process
   */
  async logApprovalProcess(
    executionId: string,
    violationId: string,
    approvalRequestId: string,
    approvalStatus: 'pending' | 'approved' | 'rejected',
    approver?: string,
    reason?: string
  ): Promise<string> {
    return await this.logEntry({
      remediationExecutionId: executionId,
      violationId,
      policyId: 'unknown',
      remediationPolicyId: 'unknown',
      actionType: 'approval_process',
      actionId: approvalRequestId,
      actionStatus: approvalStatus === 'approved' ? 'completed' :
                    approvalStatus === 'rejected' ? 'failed' : 'in_progress',
      actor: approver || 'approval_system',
      actorType: approver ? 'user' : 'system',
      resourceType: 'approval_request',
      resourceId: approvalRequestId,
      approvalRequired: true,
      approvalStatus,
      decisionRationale: reason,
      complianceFrameworks: ['SOX', 'GDPR'],
      riskLevel: approvalStatus === 'rejected' ? 'high' : 'medium',
      dataClassification: 'confidential',
      retentionPeriodDays: 2555,
      metadata: {
        approvalRequestId,
        approvalStatus,
        approver,
        reason,
        phase: 'approval'
      }
    });
  }

  /**
   * Query remediation audit entries
   */
  async queryEntries(query: RemediationAuditQuery): Promise<RemediationAuditEntry[]> {
    const whereClause: any = {};

    if (query.remediationExecutionId) {
      whereClause.remediationExecutionId = query.remediationExecutionId;
    }

    if (query.violationId) {
      whereClause.violationId = query.violationId;
    }

    if (query.actionType) {
      whereClause.actionType = query.actionType;
    }

    if (query.startDate || query.endDate) {
      whereClause.timestamp = {};
      if (query.startDate) whereClause.timestamp.gte = query.startDate;
      if (query.endDate) whereClause.timestamp.lte = query.endDate;
    }

    if (query.riskLevel) {
      whereClause.riskLevel = query.riskLevel;
    }

    const entries = await this.prisma.remediationAuditEntry.findMany({
      where: whereClause,
      orderBy: { timestamp: 'desc' },
      take: query.limit || 100,
      skip: query.offset || 0
    });

    return entries as RemediationAuditEntry[];
  }

  /**
   * Generate compliance report
   */
  async generateComplianceReport(
    startDate: Date,
    endDate: Date,
    complianceFramework?: string,
    reportType: RemediationAuditReport['reportType'] = 'compliance'
  ): Promise<RemediationAuditReport> {
    const query: RemediationAuditQuery = {
      startDate,
      endDate,
      complianceFramework
    };

    const entries = await this.queryEntries(query);

    // Calculate summary metrics
    const totalRemediations = new Set(entries.map(e => e.remediationExecutionId)).size;
    const successfulRemediations = entries.filter(e =>
      e.actionType === 'remediation_execution' && e.actionStatus === 'completed'
    ).length;
    const failedRemediations = entries.filter(e =>
      e.actionType === 'remediation_execution' && e.actionStatus === 'failed'
    ).length;
    const escalatedRemediations = entries.filter(e => e.actionType === 'escalation').length;

    const executionTimes = entries
      .filter(e => e.executionTimeMs !== undefined)
      .map(e => e.executionTimeMs!);
    const averageExecutionTime = executionTimes.length > 0 ?
      executionTimes.reduce((a, b) => a + b, 0) / executionTimes.length : 0;

    // Top violation types
    const violationTypes: Record<string, number> = {};
    entries.forEach(e => {
      if (e.policyId && e.policyId !== 'unknown') {
        violationTypes[e.policyId] = (violationTypes[e.policyId] || 0) + 1;
      }
    });

    const topViolationTypes = Object.entries(violationTypes)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 10)
      .map(([type, count]) => ({ type, count }));

    // Top remediation actions
    const actionTypes: Record<string, number> = {};
    entries.forEach(e => {
      actionTypes[e.actionType] = (actionTypes[e.actionType] || 0) + 1;
    });

    const topRemediationActions = Object.entries(actionTypes)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 10)
      .map(([action, count]) => ({ action, count }));

    // Compliance metrics by framework
    const frameworks = complianceFramework ?
      [complianceFramework] :
      ['SOX', 'GDPR', 'HIPAA', 'PCI'];

    const complianceMetrics = frameworks.map(framework => {
      const frameworkEntries = entries.filter(e =>
        e.complianceFrameworks.includes(framework)
      );

      const totalRequiredActions = frameworkEntries.length;
      const completedActions = frameworkEntries.filter(e =>
        e.actionStatus === 'completed'
      ).length;

      return {
        framework,
        totalRequiredActions,
        completedActions,
        complianceRate: totalRequiredActions > 0 ?
          completedActions / totalRequiredActions : 0,
        outstandingIssues: frameworkEntries.filter(e =>
          e.actionStatus === 'failed' || e.riskLevel === 'critical'
        ).length
      };
    });

    // Generate recommendations
    const recommendations: string[] = [];

    if (failedRemediations / totalRemediations > 0.1) {
      recommendations.push('High failure rate detected. Review remediation policies and action configurations.');
    }

    if (escalatedRemediations / totalRemediations > 0.2) {
      recommendations.push('High escalation rate. Consider strengthening initial remediation actions.');
    }

    if (averageExecutionTime > 300000) { // 5 minutes
      recommendations.push('Long execution times detected. Optimize remediation action performance.');
    }

    const report: RemediationAuditReport = {
      id: uuidv4(),
      reportType,
      generatedAt: new Date(),
      generatedBy: 'remediation_audit_trail',
      timeRange: { startDate, endDate },
      filters: query,
      summary: {
        totalRemediations,
        successfulRemediations,
        failedRemediations,
        escalatedRemediations,
        averageExecutionTime,
        topViolationTypes,
        topRemediationActions
      },
      complianceMetrics,
      recommendations,
      data: entries
    };

    // Store report
    await this.redis.setex(
      `remediation_report:${report.id}`,
      86400,
      JSON.stringify(report)
    );

    this.emit('report_generated', {
      reportId: report.id,
      reportType,
      timeRange: report.timeRange,
      totalEntries: entries.length
    });

    return report;
  }

  /**
   * Verify audit trail integrity
   */
  async verifyIntegrity(startDate?: Date, endDate?: Date): Promise<{
    valid: boolean;
    totalEntries: number;
    verifiedEntries: number;
    brokenChains: number;
    issues: string[];
  }> {
    const query: RemediationAuditQuery = {};
    if (startDate) query.startDate = startDate;
    if (endDate) query.endDate = endDate;

    const entries = await this.queryEntries(query);
    entries.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    let verifiedEntries = 0;
    let brokenChains = 0;
    const issues: string[] = [];

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      const previousEntry = i > 0 ? entries[i - 1] : null;

      // Verify hash chain
      if (previousEntry && entry.previousEntryHash !== previousEntry.entryHash) {
        brokenChains++;
        issues.push(`Broken hash chain at entry ${entry.id}`);
      }

      // Verify entry hash
      const calculatedHash = await this.calculateEntryHash({
        ...entry,
        entryHash: '' // Exclude current hash from calculation
      });

      if (calculatedHash !== entry.entryHash) {
        issues.push(`Invalid entry hash for ${entry.id}`);
      } else {
        verifiedEntries++;
      }
    }

    return {
      valid: issues.length === 0,
      totalEntries: entries.length,
      verifiedEntries,
      brokenChains,
      issues
    };
  }

  /**
   * Stop the audit trail service
   */
  async stop(): Promise<void> {
    // Flush remaining buffer
    await this.flushBuffer();

    // Close connections
    await this.prisma.$disconnect();
    await this.redis.quit();

    this.emit('stopped');
  }

  /**
   * Private methods
   */

  private async flushBuffer(): Promise<void> {
    if (this.buffer.length === 0) return;

    const entriesToFlush = [...this.buffer];
    this.buffer = [];

    try {
      // Batch insert to database
      await this.prisma.remediationAuditEntry.createMany({
        data: entriesToFlush.map(entry => ({
          ...entry,
          metadata: entry.metadata as any // Prisma JSON type
        }))
      });

      this.emit('buffer_flushed', {
        entriesCount: entriesToFlush.length,
        timestamp: new Date()
      });

    } catch (error) {
      // Re-add to buffer if flush fails
      this.buffer.unshift(...entriesToFlush);

      this.emit('flush_error', {
        error: error instanceof Error ? error.message : String(error),
        entriesCount: entriesToFlush.length
      });
    }
  }

  private async calculateEntryHash(entry: Omit<RemediationAuditEntry, 'entryHash'>): Promise<string> {
    const crypto = await import('crypto');

    const hashContent = [
      entry.id,
      entry.timestamp.toISOString(),
      entry.remediationExecutionId,
      entry.violationId,
      entry.actionType,
      entry.actionId,
      entry.actor,
      entry.previousEntryHash || '',
      JSON.stringify(entry.metadata)
    ].join('|');

    return crypto.createHash('sha256').update(hashContent).digest('hex');
  }

  private async loadLastEntryHash(): Promise<void> {
    try {
      const lastEntry = await this.prisma.remediationAuditEntry.findFirst({
        orderBy: { timestamp: 'desc' },
        select: { entryHash: true }
      });

      this.lastEntryHash = lastEntry?.entryHash || null;
    } catch (error) {
      this.lastEntryHash = null;
    }
  }

  private determineRiskLevel(context: Record<string, any>): 'low' | 'medium' | 'high' | 'critical' {
    const violations = context.violations || [];
    const criticalCount = violations.filter((v: any) => v.severity === 'critical').length;
    const highCount = violations.filter((v: any) => v.severity === 'high').length;

    if (criticalCount > 0) return 'critical';
    if (highCount > 0) return 'high';
    if (violations.length > 0) return 'medium';
    return 'low';
  }

  private getComplianceFrameworksForAction(actionType: string): string[] {
    const frameworkMap: Record<string, string[]> = {
      'block_task': ['SOX', 'GDPR', 'HIPAA'],
      'revoke_access': ['SOX', 'GDPR', 'HIPAA', 'PCI'],
      'quarantine_data': ['GDPR', 'HIPAA', 'PCI'],
      'notify_admin': ['SOX', 'GDPR'],
      'require_approval': ['SOX'],
      'suspend_agent': ['SOX', 'GDPR'],
      'escalate': ['SOX', 'GDPR', 'HIPAA']
    };

    return frameworkMap[actionType] || ['SOX'];
  }
}