import { EventEmitter } from 'events';
import { promises as fs } from 'fs';
import { join } from 'path';
import { auditLoggingService, AuditEvent } from '../services/audit-logging';
import { encryptionService } from '../services/encryption';
import { PolicyEvaluationResult, PolicyDecision } from './OPAIntegrationService';

export interface DecisionLogEntry {
  id: string;
  timestamp: Date;
  evaluationId: string;
  policyId?: string;
  policyVersion?: string;
  policyName?: string;
  decision: PolicyDecision;
  input: Record<string, any>;
  inputHash: string;
  context: {
    requestId?: string;
    userId?: string;
    sessionId?: string;
    resource: string;
    action: string;
    ip?: string;
    userAgent?: string;
    environment?: string;
  };
  performance: {
    executionTime: number;
    cached: boolean;
    cacheHit?: boolean;
  };
  compliance: {
    gdpr: boolean;
    sox: boolean;
    iso27001: boolean;
    pci: boolean;
    retentionPeriod: number; // Days
  };
  security: {
    sensitivity: 'PUBLIC' | 'INTERNAL' | 'CONFIDENTIAL' | 'RESTRICTED';
    classification: string[];
    redacted: boolean;
  };
  metadata: {
    correlationId?: string;
    traceId?: string;
    spanId?: string;
    parentDecisionId?: string;
    childDecisions?: string[];
  };
}

export interface DecisionLogQuery {
  startDate?: Date;
  endDate?: Date;
  policyIds?: string[];
  userIds?: string[];
  resources?: string[];
  actions?: string[];
  decisions?: boolean[];
  correlationIds?: string[];
  environments?: string[];
  limit?: number;
  offset?: number;
  sortBy?: 'timestamp' | 'executionTime' | 'policy';
  sortOrder?: 'asc' | 'desc';
  includeInput?: boolean;
  includeRedacted?: boolean;
}

export interface DecisionLogStatistics {
  totalDecisions: number;
  decisionsByPolicy: Record<string, number>;
  decisionsByUser: Record<string, number>;
  decisionsByResource: Record<string, number>;
  decisionsByAction: Record<string, number>;
  decisionsByOutcome: { allow: number; deny: number };
  averageExecutionTime: number;
  cacheHitRate: number;
  complianceBreakdown: Record<string, number>;
  anomalies: Array<{
    type: string;
    description: string;
    count: number;
    riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    affectedDecisions: string[];
  }>;
  trends: {
    hourlyDistribution: Record<number, number>;
    dailyDistribution: Record<string, number>;
    weeklyDistribution: Record<string, number>;
  };
}

export interface DecisionReplayRequest {
  decisionId: string;
  newInput?: Record<string, any>;
  newPolicy?: string;
  replayReason: string;
  replayedBy: string;
}

export interface DecisionReplayResult {
  replayId: string;
  originalDecision: DecisionLogEntry;
  newDecision: PolicyDecision;
  differences: {
    resultChanged: boolean;
    reasonsChanged: boolean;
    executionTimeChanged: boolean;
    details: Record<string, any>;
  };
  replayedAt: Date;
  replayedBy: string;
  reason: string;
}

export class DecisionLogger extends EventEmitter {
  private decisionLogs = new Map<string, DecisionLogEntry>();
  private logDirectory: string;
  private maxLogsInMemory: number;
  private retentionPeriods: Record<string, number>; // Days by compliance framework
  private encryptLogs: boolean;
  private compressionEnabled: boolean;

  constructor(config: {
    logDirectory: string;
    maxLogsInMemory?: number;
    retentionPeriods?: Record<string, number>;
    encryptLogs?: boolean;
    compressionEnabled?: boolean;
  }) {
    super();
    this.logDirectory = config.logDirectory;
    this.maxLogsInMemory = config.maxLogsInMemory || 50000;
    this.retentionPeriods = config.retentionPeriods || {
      gdpr: 2555, // 7 years
      sox: 2555, // 7 years
      iso27001: 1095, // 3 years
      pci: 365, // 1 year
      default: 1095 // 3 years
    };
    this.encryptLogs = config.encryptLogs !== false;
    this.compressionEnabled = config.compressionEnabled !== false;

    this.initialize();
  }

  /**
   * Initialize decision logger
   */
  private async initialize(): Promise<void> {
    try {
      await fs.mkdir(this.logDirectory, { recursive: true });
      await fs.mkdir(join(this.logDirectory, 'archived'), { recursive: true });
      await fs.mkdir(join(this.logDirectory, 'encrypted'), { recursive: true });
      this.setupPeriodicTasks();
    } catch (error) {
      console.error('Failed to initialize DecisionLogger:', error);
      throw error;
    }
  }

  /**
   * Log a policy evaluation decision
   */
  async logDecision(
    evaluationResult: PolicyEvaluationResult,
    additionalContext?: Partial<DecisionLogEntry>
  ): Promise<string> {
    const logId = encryptionService.generateUUID();

    // Determine compliance requirements
    const compliance = this.determineComplianceRequirements(evaluationResult);

    // Determine security classification
    const security = this.determineSecurityClassification(evaluationResult);

    // Create decision log entry
    const logEntry: DecisionLogEntry = {
      id: logId,
      timestamp: evaluationResult.timestamp,
      evaluationId: evaluationResult.evaluationId,
      policyId: additionalContext?.policyId,
      policyVersion: additionalContext?.policyVersion,
      policyName: additionalContext?.policyName,
      decision: evaluationResult.decision,
      input: security.redacted ? this.redactSensitiveData(evaluationResult.input.input) : evaluationResult.input.input,
      inputHash: encryptionService.createHash(JSON.stringify(evaluationResult.input.input)),
      context: {
        requestId: evaluationResult.input.context?.requestId,
        userId: evaluationResult.input.context?.userId,
        sessionId: evaluationResult.input.context?.sessionId,
        resource: evaluationResult.input.context?.resource || 'unknown',
        action: evaluationResult.input.context?.action || 'unknown',
        ip: evaluationResult.input.context?.ip,
        userAgent: evaluationResult.input.context?.userAgent,
        environment: process.env.NODE_ENV || 'development'
      },
      performance: {
        executionTime: evaluationResult.executionTime,
        cached: evaluationResult.cached || false
      },
      compliance,
      security,
      metadata: {
        correlationId: evaluationResult.input.context?.requestId,
        traceId: additionalContext?.metadata?.traceId,
        spanId: additionalContext?.metadata?.spanId,
        parentDecisionId: additionalContext?.metadata?.parentDecisionId,
        childDecisions: []
      },
      ...additionalContext
    };

    // Store in memory
    this.decisionLogs.set(logId, logEntry);

    // Manage memory usage
    this.manageMemoryUsage();

    // Persist to storage
    await this.persistLogEntry(logEntry);

    // Log to audit system
    await this.logToAuditSystem(logEntry);

    // Emit event for real-time processing
    this.emit('decisionLogged', logEntry);

    // Check for anomalies
    await this.checkForAnomalies(logEntry);

    return logId;
  }

  /**
   * Determine compliance requirements for decision
   */
  private determineComplianceRequirements(evaluationResult: PolicyEvaluationResult): DecisionLogEntry['compliance'] {
    const context = evaluationResult.input.context;
    const resource = context?.resource || '';
    const action = context?.action || '';

    // Default compliance settings
    let compliance = {
      gdpr: false,
      sox: false,
      iso27001: true, // All security decisions are ISO 27001 relevant
      pci: false,
      retentionPeriod: this.retentionPeriods.default
    };

    // GDPR - Personal data access
    if (resource.includes('user') || resource.includes('personal') || resource.includes('profile')) {
      compliance.gdpr = true;
      compliance.retentionPeriod = this.retentionPeriods.gdpr;
    }

    // SOX - Financial data access
    if (resource.includes('financial') || resource.includes('accounting') || resource.includes('revenue')) {
      compliance.sox = true;
      compliance.retentionPeriod = this.retentionPeriods.sox;
    }

    // PCI - Payment data access
    if (resource.includes('payment') || resource.includes('card') || resource.includes('transaction')) {
      compliance.pci = true;
      compliance.retentionPeriod = this.retentionPeriods.pci;
    }

    return compliance;
  }

  /**
   * Determine security classification for decision
   */
  private determineSecurityClassification(evaluationResult: PolicyEvaluationResult): DecisionLogEntry['security'] {
    const context = evaluationResult.input.context;
    const resource = context?.resource || '';
    const input = evaluationResult.input.input;

    let sensitivity: DecisionLogEntry['security']['sensitivity'] = 'INTERNAL';
    let classification: string[] = ['authorization'];
    let redacted = false;

    // Determine sensitivity based on resource and input
    if (resource.includes('public') || resource.includes('health')) {
      sensitivity = 'PUBLIC';
    } else if (resource.includes('secret') || resource.includes('key') || resource.includes('password')) {
      sensitivity = 'RESTRICTED';
      redacted = true;
      classification.push('secret-access');
    } else if (resource.includes('admin') || resource.includes('management')) {
      sensitivity = 'CONFIDENTIAL';
      classification.push('administrative');
    } else if (resource.includes('financial') || resource.includes('personal')) {
      sensitivity = 'CONFIDENTIAL';
      classification.push('sensitive-data');
    }

    // Check for sensitive data in input
    if (this.containsSensitiveData(input)) {
      sensitivity = 'CONFIDENTIAL';
      redacted = true;
      classification.push('contains-pii');
    }

    return { sensitivity, classification, redacted };
  }

  /**
   * Check if input contains sensitive data
   */
  private containsSensitiveData(input: Record<string, any>): boolean {
    const sensitiveKeys = [
      'password', 'secret', 'key', 'token', 'ssn', 'credit_card',
      'phone', 'email', 'address', 'dob', 'passport'
    ];

    const checkObject = (obj: any, depth = 0): boolean => {
      if (depth > 5) return false; // Prevent deep recursion

      if (typeof obj !== 'object' || obj === null) {
        return false;
      }

      for (const [key, value] of Object.entries(obj)) {
        // Check key names
        if (sensitiveKeys.some(sensitiveKey => key.toLowerCase().includes(sensitiveKey))) {
          return true;
        }

        // Check string values for patterns
        if (typeof value === 'string') {
          // Check for SSN pattern
          if (/\d{3}-\d{2}-\d{4}/.test(value)) return true;
          // Check for credit card pattern
          if (/\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}/.test(value)) return true;
          // Check for email pattern
          if (/\S+@\S+\.\S+/.test(value)) return true;
        }

        // Recursively check nested objects
        if (typeof value === 'object') {
          if (checkObject(value, depth + 1)) return true;
        }
      }

      return false;
    };

    return checkObject(input);
  }

  /**
   * Redact sensitive data from input
   */
  private redactSensitiveData(input: Record<string, any>): Record<string, any> {
    const sensitiveKeys = [
      'password', 'secret', 'key', 'token', 'ssn', 'credit_card'
    ];

    const redactObject = (obj: any): any => {
      if (typeof obj !== 'object' || obj === null) {
        return obj;
      }

      if (Array.isArray(obj)) {
        return obj.map(redactObject);
      }

      const redacted: Record<string, any> = {};

      for (const [key, value] of Object.entries(obj)) {
        if (sensitiveKeys.some(sensitiveKey => key.toLowerCase().includes(sensitiveKey))) {
          redacted[key] = '[REDACTED]';
        } else if (typeof value === 'string') {
          // Redact patterns
          let redactedValue = value;
          redactedValue = redactedValue.replace(/\d{3}-\d{2}-\d{4}/g, 'XXX-XX-XXXX'); // SSN
          redactedValue = redactedValue.replace(/\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}/g, 'XXXX-XXXX-XXXX-XXXX'); // Credit card
          redactedValue = redactedValue.replace(/\S+@\S+\.\S+/g, '[EMAIL_REDACTED]'); // Email
          redacted[key] = redactedValue;
        } else if (typeof value === 'object') {
          redacted[key] = redactObject(value);
        } else {
          redacted[key] = value;
        }
      }

      return redacted;
    };

    return redactObject(input);
  }

  /**
   * Persist log entry to storage
   */
  private async persistLogEntry(logEntry: DecisionLogEntry): Promise<void> {
    try {
      const fileName = `decision-${logEntry.timestamp.toISOString().split('T')[0]}.jsonl`;
      const filePath = join(this.logDirectory, fileName);

      let logData = JSON.stringify(logEntry);

      // Encrypt if required
      if (this.encryptLogs) {
        logData = encryptionService.encrypt(logData);
      }

      // Append to daily log file
      await fs.appendFile(filePath, logData + '\n');

    } catch (error) {
      console.error('Failed to persist log entry:', error);
      this.emit('persistError', { logEntry, error });
    }
  }

  /**
   * Log to audit system
   */
  private async logToAuditSystem(logEntry: DecisionLogEntry): Promise<void> {
    const auditEvent: Omit<AuditEvent, 'id' | 'timestamp' | 'signature'> = {
      eventType: 'POLICY_DECISION_LOGGED',
      category: 'AUTHORIZATION',
      severity: logEntry.decision.deny ? 'MEDIUM' : 'LOW',
      source: {
        service: 'decision-logger',
        version: '1.0.0',
        instance: process.env.HOSTNAME || 'unknown',
        ip: logEntry.context.ip || 'unknown'
      },
      actor: {
        userId: logEntry.context.userId,
        sessionId: logEntry.context.sessionId,
        type: logEntry.context.userId ? 'USER' : 'SYSTEM',
        userAgent: logEntry.context.userAgent
      },
      target: {
        resource: logEntry.context.resource,
        resourceType: 'POLICY_DECISION',
        resourceId: logEntry.id
      },
      action: logEntry.context.action,
      outcome: logEntry.decision.allow ? 'SUCCESS' : 'FAILURE',
      details: {
        decisionLogId: logEntry.id,
        evaluationId: logEntry.evaluationId,
        policyId: logEntry.policyId,
        policyVersion: logEntry.policyVersion,
        decision: logEntry.decision.result,
        allow: logEntry.decision.allow,
        deny: logEntry.decision.deny,
        reasons: logEntry.decision.reasons,
        executionTime: logEntry.performance.executionTime,
        cached: logEntry.performance.cached,
        inputHash: logEntry.inputHash,
        sensitivity: logEntry.security.sensitivity,
        redacted: logEntry.security.redacted
      },
      metadata: {
        correlationId: logEntry.metadata.correlationId,
        requestId: logEntry.context.requestId,
        traceId: logEntry.metadata.traceId,
        duration: logEntry.performance.executionTime
      },
      compliance: {
        gdpr: logEntry.compliance.gdpr,
        sox: logEntry.compliance.sox,
        iso27001: logEntry.compliance.iso27001,
        pci: logEntry.compliance.pci
      }
    };

    await auditLoggingService.logEvent(auditEvent);
  }

  /**
   * Query decision logs
   */
  queryDecisions(query: DecisionLogQuery): DecisionLogEntry[] {
    let decisions = Array.from(this.decisionLogs.values());

    // Apply filters
    if (query.startDate) {
      decisions = decisions.filter(d => d.timestamp >= query.startDate!);
    }

    if (query.endDate) {
      decisions = decisions.filter(d => d.timestamp <= query.endDate!);
    }

    if (query.policyIds && query.policyIds.length > 0) {
      decisions = decisions.filter(d => d.policyId && query.policyIds!.includes(d.policyId));
    }

    if (query.userIds && query.userIds.length > 0) {
      decisions = decisions.filter(d => d.context.userId && query.userIds!.includes(d.context.userId));
    }

    if (query.resources && query.resources.length > 0) {
      decisions = decisions.filter(d =>
        query.resources!.some(resource => d.context.resource.includes(resource))
      );
    }

    if (query.actions && query.actions.length > 0) {
      decisions = decisions.filter(d => query.actions!.includes(d.context.action));
    }

    if (query.decisions && query.decisions.length > 0) {
      decisions = decisions.filter(d => query.decisions!.includes(d.decision.result));
    }

    if (query.correlationIds && query.correlationIds.length > 0) {
      decisions = decisions.filter(d =>
        d.metadata.correlationId && query.correlationIds!.includes(d.metadata.correlationId)
      );
    }

    if (query.environments && query.environments.length > 0) {
      decisions = decisions.filter(d =>
        d.context.environment && query.environments!.includes(d.context.environment)
      );
    }

    // Filter redacted logs if not requested
    if (!query.includeRedacted) {
      decisions = decisions.filter(d => !d.security.redacted);
    }

    // Sort decisions
    const sortBy = query.sortBy || 'timestamp';
    const sortOrder = query.sortOrder || 'desc';

    decisions.sort((a, b) => {
      let aValue: any, bValue: any;

      switch (sortBy) {
        case 'timestamp':
          aValue = a.timestamp.getTime();
          bValue = b.timestamp.getTime();
          break;
        case 'executionTime':
          aValue = a.performance.executionTime;
          bValue = b.performance.executionTime;
          break;
        case 'policy':
          aValue = a.policyName || a.policyId || '';
          bValue = b.policyName || b.policyId || '';
          break;
        default:
          aValue = a.timestamp.getTime();
          bValue = b.timestamp.getTime();
      }

      if (sortOrder === 'asc') {
        return aValue > bValue ? 1 : -1;
      } else {
        return aValue < bValue ? 1 : -1;
      }
    });

    // Apply pagination
    const offset = query.offset || 0;
    const limit = query.limit || 100;

    let result = decisions.slice(offset, offset + limit);

    // Remove input if not requested
    if (!query.includeInput) {
      result = result.map(decision => ({
        ...decision,
        input: { '[REDACTED]': 'Input removed for query' }
      }));
    }

    return result;
  }

  /**
   * Generate decision log statistics
   */
  generateStatistics(period?: { start: Date; end: Date }): DecisionLogStatistics {
    let decisions = Array.from(this.decisionLogs.values());

    if (period) {
      decisions = decisions.filter(d =>
        d.timestamp >= period.start && d.timestamp <= period.end
      );
    }

    const stats: DecisionLogStatistics = {
      totalDecisions: decisions.length,
      decisionsByPolicy: {},
      decisionsByUser: {},
      decisionsByResource: {},
      decisionsByAction: {},
      decisionsByOutcome: { allow: 0, deny: 0 },
      averageExecutionTime: 0,
      cacheHitRate: 0,
      complianceBreakdown: {},
      anomalies: [],
      trends: {
        hourlyDistribution: {},
        dailyDistribution: {},
        weeklyDistribution: {}
      }
    };

    if (decisions.length === 0) {
      return stats;
    }

    let totalExecutionTime = 0;
    let cachedDecisions = 0;

    // Process each decision
    decisions.forEach(decision => {
      // Policy counts
      const policyKey = decision.policyName || decision.policyId || 'unknown';
      stats.decisionsByPolicy[policyKey] = (stats.decisionsByPolicy[policyKey] || 0) + 1;

      // User counts
      const userKey = decision.context.userId || 'anonymous';
      stats.decisionsByUser[userKey] = (stats.decisionsByUser[userKey] || 0) + 1;

      // Resource counts
      stats.decisionsByResource[decision.context.resource] =
        (stats.decisionsByResource[decision.context.resource] || 0) + 1;

      // Action counts
      stats.decisionsByAction[decision.context.action] =
        (stats.decisionsByAction[decision.context.action] || 0) + 1;

      // Outcome counts
      if (decision.decision.allow) {
        stats.decisionsByOutcome.allow++;
      } else {
        stats.decisionsByOutcome.deny++;
      }

      // Performance metrics
      totalExecutionTime += decision.performance.executionTime;
      if (decision.performance.cached) {
        cachedDecisions++;
      }

      // Compliance breakdown
      Object.keys(decision.compliance).forEach(framework => {
        if (framework !== 'retentionPeriod' && decision.compliance[framework]) {
          stats.complianceBreakdown[framework] = (stats.complianceBreakdown[framework] || 0) + 1;
        }
      });

      // Trends
      const hour = decision.timestamp.getHours();
      const day = decision.timestamp.toISOString().split('T')[0];
      const week = this.getWeekOfYear(decision.timestamp);

      stats.trends.hourlyDistribution[hour] = (stats.trends.hourlyDistribution[hour] || 0) + 1;
      stats.trends.dailyDistribution[day] = (stats.trends.dailyDistribution[day] || 0) + 1;
      stats.trends.weeklyDistribution[week] = (stats.trends.weeklyDistribution[week] || 0) + 1;
    });

    // Calculate averages and rates
    stats.averageExecutionTime = totalExecutionTime / decisions.length;
    stats.cacheHitRate = cachedDecisions / decisions.length;

    // Detect anomalies
    stats.anomalies = this.detectDecisionAnomalies(decisions);

    return stats;
  }

  /**
   * Detect anomalies in decision logs
   */
  private detectDecisionAnomalies(decisions: DecisionLogEntry[]): DecisionLogStatistics['anomalies'] {
    const anomalies: DecisionLogStatistics['anomalies'] = [];

    // High denial rate
    const denialRate = decisions.filter(d => d.decision.deny).length / decisions.length;
    if (denialRate > 0.3) {
      anomalies.push({
        type: 'HIGH_DENIAL_RATE',
        description: `Denial rate is ${(denialRate * 100).toFixed(1)}%`,
        count: decisions.filter(d => d.decision.deny).length,
        riskLevel: denialRate > 0.5 ? 'CRITICAL' : 'HIGH',
        affectedDecisions: decisions.filter(d => d.decision.deny).map(d => d.id)
      });
    }

    // Unusual access patterns by time
    const hourCounts = new Map<number, number>();
    decisions.forEach(decision => {
      const hour = decision.timestamp.getHours();
      hourCounts.set(hour, (hourCounts.get(hour) || 0) + 1);
    });

    const offHoursActivity = Array.from(hourCounts.entries())
      .filter(([hour]) => hour < 6 || hour > 22)
      .reduce((sum, [, count]) => sum + count, 0);

    if (offHoursActivity > decisions.length * 0.2) {
      anomalies.push({
        type: 'OFF_HOURS_POLICY_ACTIVITY',
        description: 'Unusual policy evaluation activity outside business hours',
        count: offHoursActivity,
        riskLevel: 'MEDIUM',
        affectedDecisions: decisions
          .filter(d => d.timestamp.getHours() < 6 || d.timestamp.getHours() > 22)
          .map(d => d.id)
      });
    }

    // Slow execution times
    const averageExecutionTime = decisions.reduce((sum, d) => sum + d.performance.executionTime, 0) / decisions.length;
    const slowDecisions = decisions.filter(d => d.performance.executionTime > averageExecutionTime * 3);

    if (slowDecisions.length > decisions.length * 0.1) {
      anomalies.push({
        type: 'SLOW_POLICY_EVALUATIONS',
        description: 'Unusually slow policy evaluation times detected',
        count: slowDecisions.length,
        riskLevel: 'MEDIUM',
        affectedDecisions: slowDecisions.map(d => d.id)
      });
    }

    return anomalies;
  }

  /**
   * Check for real-time anomalies
   */
  private async checkForAnomalies(logEntry: DecisionLogEntry): Promise<void> {
    // Check for repeated denials from same user
    if (logEntry.decision.deny && logEntry.context.userId) {
      const recentDenials = this.queryDecisions({
        startDate: new Date(Date.now() - 15 * 60 * 1000), // Last 15 minutes
        userIds: [logEntry.context.userId],
        decisions: [false]
      });

      if (recentDenials.length >= 10) {
        this.emit('anomaly', {
          type: 'REPEATED_DENIALS',
          logEntry,
          relatedDecisions: recentDenials,
          riskLevel: 'HIGH'
        });
      }
    }

    // Check for unusual resource access
    if (logEntry.security.sensitivity === 'RESTRICTED') {
      this.emit('sensitiveAccess', {
        logEntry,
        timestamp: new Date()
      });
    }
  }

  /**
   * Replay a decision with new input or policy
   */
  async replayDecision(request: DecisionReplayRequest): Promise<DecisionReplayResult> {
    const originalDecision = this.decisionLogs.get(request.decisionId);
    if (!originalDecision) {
      throw new Error(`Decision ${request.decisionId} not found`);
    }

    // This would typically use the OPA Integration Service
    // For now, we'll simulate the replay
    const newDecision: PolicyDecision = {
      result: !originalDecision.decision.result, // Simulate different result
      allow: !originalDecision.decision.allow,
      deny: !originalDecision.decision.deny,
      reasons: ['Replayed decision with different outcome']
    };

    const replayResult: DecisionReplayResult = {
      replayId: encryptionService.generateUUID(),
      originalDecision,
      newDecision,
      differences: {
        resultChanged: newDecision.result !== originalDecision.decision.result,
        reasonsChanged: JSON.stringify(newDecision.reasons) !== JSON.stringify(originalDecision.decision.reasons),
        executionTimeChanged: false, // Would be calculated in real replay
        details: {
          originalResult: originalDecision.decision.result,
          newResult: newDecision.result,
          inputChanged: !!request.newInput,
          policyChanged: !!request.newPolicy
        }
      },
      replayedAt: new Date(),
      replayedBy: request.replayedBy,
      reason: request.replayReason
    };

    // Log the replay
    await auditLoggingService.logEvent({
      eventType: 'POLICY_DECISION_REPLAY',
      category: 'SYSTEM',
      severity: 'MEDIUM',
      source: {
        service: 'decision-logger',
        version: '1.0.0',
        instance: process.env.HOSTNAME || 'unknown',
        ip: 'localhost'
      },
      actor: {
        userId: request.replayedBy,
        type: 'USER'
      },
      target: {
        resource: 'decision',
        resourceId: request.decisionId,
        resourceType: 'POLICY_DECISION'
      },
      action: 'REPLAY',
      outcome: 'SUCCESS',
      details: {
        replayId: replayResult.replayId,
        originalDecisionId: request.decisionId,
        reason: request.replayReason,
        differences: replayResult.differences
      },
      metadata: {
        requestId: encryptionService.generateUUID()
      },
      compliance: originalDecision.compliance
    });

    this.emit('decisionReplayed', replayResult);

    return replayResult;
  }

  /**
   * Get week of year
   */
  private getWeekOfYear(date: Date): string {
    const start = new Date(date.getFullYear(), 0, 1);
    const days = Math.floor((date.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
    const weekNumber = Math.ceil((days + start.getDay() + 1) / 7);
    return `${date.getFullYear()}-W${weekNumber.toString().padStart(2, '0')}`;
  }

  /**
   * Manage memory usage
   */
  private manageMemoryUsage(): void {
    if (this.decisionLogs.size > this.maxLogsInMemory) {
      // Remove oldest entries
      const logsToRemove = this.decisionLogs.size - this.maxLogsInMemory;
      const sortedLogs = Array.from(this.decisionLogs.entries())
        .sort(([, a], [, b]) => a.timestamp.getTime() - b.timestamp.getTime());

      for (let i = 0; i < logsToRemove; i++) {
        const [logId] = sortedLogs[i];
        this.decisionLogs.delete(logId);
      }
    }
  }

  /**
   * Setup periodic maintenance tasks
   */
  private setupPeriodicTasks(): void {
    // Archive old logs every day
    setInterval(() => {
      this.archiveOldLogs();
    }, 24 * 60 * 60 * 1000);

    // Generate daily statistics
    setInterval(() => {
      this.generateDailyStatistics();
    }, 24 * 60 * 60 * 1000);
  }

  /**
   * Archive old logs based on retention policies
   */
  private async archiveOldLogs(): Promise<void> {
    try {
      const now = new Date();

      for (const [logId, logEntry] of this.decisionLogs.entries()) {
        const retentionPeriod = logEntry.compliance.retentionPeriod;
        const cutoffDate = new Date(now.getTime() - retentionPeriod * 24 * 60 * 60 * 1000);

        if (logEntry.timestamp < cutoffDate) {
          // Archive the log (in production, move to cold storage)
          this.decisionLogs.delete(logId);
        }
      }
    } catch (error) {
      console.error('Failed to archive old logs:', error);
    }
  }

  /**
   * Generate and emit daily statistics
   */
  private generateDailyStatistics(): void {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const stats = this.generateStatistics({ start: yesterday, end: today });
    this.emit('dailyStatistics', stats);
  }

  /**
   * Get decision by ID
   */
  getDecision(decisionId: string): DecisionLogEntry | undefined {
    return this.decisionLogs.get(decisionId);
  }

  /**
   * Get all decisions for a correlation ID
   */
  getDecisionsByCorrelation(correlationId: string): DecisionLogEntry[] {
    return this.queryDecisions({ correlationIds: [correlationId] });
  }

  /**
   * Export decisions for compliance reporting
   */
  exportDecisions(
    query: DecisionLogQuery,
    format: 'JSON' | 'CSV' | 'XML' = 'JSON'
  ): string {
    const decisions = this.queryDecisions(query);

    switch (format) {
      case 'JSON':
        return JSON.stringify(decisions, null, 2);
      case 'CSV':
        return this.convertDecisionsToCSV(decisions);
      case 'XML':
        return this.convertDecisionsToXML(decisions);
      default:
        throw new Error(`Unsupported export format: ${format}`);
    }
  }

  /**
   * Convert decisions to CSV format
   */
  private convertDecisionsToCSV(decisions: DecisionLogEntry[]): string {
    if (decisions.length === 0) return '';

    const headers = [
      'ID', 'Timestamp', 'Policy ID', 'Decision', 'Resource',
      'Action', 'User ID', 'Execution Time', 'Cached'
    ];

    const rows = decisions.map(decision => [
      decision.id,
      decision.timestamp.toISOString(),
      decision.policyId || '',
      decision.decision.result,
      decision.context.resource,
      decision.context.action,
      decision.context.userId || '',
      decision.performance.executionTime,
      decision.performance.cached
    ]);

    return [headers, ...rows].map(row => row.join(',')).join('\n');
  }

  /**
   * Convert decisions to XML format
   */
  private convertDecisionsToXML(decisions: DecisionLogEntry[]): string {
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<decisions>\n';

    decisions.forEach(decision => {
      xml += `  <decision id="${decision.id}">\n`;
      xml += `    <timestamp>${decision.timestamp.toISOString()}</timestamp>\n`;
      xml += `    <policyId>${decision.policyId || ''}</policyId>\n`;
      xml += `    <result>${decision.decision.result}</result>\n`;
      xml += `    <resource>${decision.context.resource}</resource>\n`;
      xml += `    <action>${decision.context.action}</action>\n`;
      xml += `    <executionTime>${decision.performance.executionTime}</executionTime>\n`;
      xml += `  </decision>\n`;
    });

    xml += '</decisions>';
    return xml;
  }
}

export const decisionLogger = new DecisionLogger({
  logDirectory: process.env.DECISION_LOG_DIRECTORY || './logs/decisions',
  maxLogsInMemory: parseInt(process.env.MAX_DECISION_LOGS_IN_MEMORY || '50000'),
  encryptLogs: process.env.ENCRYPT_DECISION_LOGS !== 'false'
});