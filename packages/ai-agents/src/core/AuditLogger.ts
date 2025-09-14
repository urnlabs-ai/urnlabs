import { v4 as uuidv4 } from 'uuid';
import * as winston from 'winston';

/**
 * Enterprise-grade audit logging system for URN Labs AI Agent Platform
 * Provides comprehensive audit trails for compliance (SOX, GDPR, HIPAA, PCI)
 */

export interface AuditLogEntry {
  id?: string;
  timestamp: Date;
  action: string;
  actor: string; // user ID, agent ID, or 'system'
  resource?: string; // what was acted upon
  resourceId?: string;
  outcome: 'success' | 'failure' | 'pending';
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  details: Record<string, any>;
  sessionId?: string;
  ip?: string;
  userAgent?: string;
  correlationId?: string;
  complianceFrameworks?: string[]; // ['SOX', 'GDPR', 'HIPAA', etc.]
  dataClassification?: 'public' | 'internal' | 'confidential' | 'restricted';
  retentionPeriod?: number; // days
}

export interface AuditQuery {
  startDate?: Date;
  endDate?: Date;
  actor?: string;
  action?: string;
  resource?: string;
  outcome?: 'success' | 'failure' | 'pending';
  riskLevel?: 'low' | 'medium' | 'high' | 'critical';
  complianceFramework?: string;
  limit?: number;
  offset?: number;
  sortBy?: 'timestamp' | 'riskLevel' | 'actor' | 'action';
  sortOrder?: 'asc' | 'desc';
}

export class AuditLogger {
  private logger: winston.Logger;
  private isInitialized = false;
  private buffer: AuditLogEntry[] = [];
  private bufferSize = 1000;
  private flushInterval = 30000; // 30 seconds
  private retentionPolicies: Map<string, number> = new Map();

  constructor() {
    this.setupLogger();
    this.setupRetentionPolicies();
  }

  /**
   * Initialize the audit logger
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // Start buffer flush interval
      setInterval(() => this.flushBuffer(), this.flushInterval);

      // Set up log rotation and retention
      await this.setupLogRotation();

      this.isInitialized = true;

      await this.log({
        timestamp: new Date(),
        action: 'audit_logger_initialized',
        actor: 'system',
        outcome: 'success',
        riskLevel: 'low',
        details: {
          bufferSize: this.bufferSize,
          flushInterval: this.flushInterval
        }
      });

    } catch (error) {
      throw new Error(`Failed to initialize AuditLogger: ${error}`);
    }
  }

  /**
   * Log an audit entry
   */
  async log(entry: Omit<AuditLogEntry, 'id'>): Promise<string> {
    const auditEntry: AuditLogEntry = {
      id: uuidv4(),
      ...entry,
      timestamp: entry.timestamp || new Date(),
      complianceFrameworks: entry.complianceFrameworks || this.getApplicableFrameworks(entry.action),
      dataClassification: entry.dataClassification || this.classifyData(entry.details),
      retentionPeriod: entry.retentionPeriod || this.getRetentionPeriod(entry.complianceFrameworks)
    };

    // Add to buffer for batch processing
    this.buffer.push(auditEntry);

    // Immediate flush for critical entries
    if (auditEntry.riskLevel === 'critical' || auditEntry.outcome === 'failure') {
      await this.flushBuffer();
    }

    // Flush if buffer is full
    if (this.buffer.length >= this.bufferSize) {
      await this.flushBuffer();
    }

    return auditEntry.id!;
  }

  /**
   * Log agent activity
   */
  async logAgentActivity(
    agentId: string,
    action: string,
    details: Record<string, any>,
    outcome: 'success' | 'failure' | 'pending' = 'success',
    riskLevel: 'low' | 'medium' | 'high' | 'critical' = 'low'
  ): Promise<string> {
    return this.log({
      timestamp: new Date(),
      action: `agent.${action}`,
      actor: agentId,
      resource: 'agent_system',
      outcome,
      riskLevel,
      details: {
        agentId,
        ...details
      }
    });
  }

  /**
   * Log workflow activity
   */
  async logWorkflowActivity(
    workflowId: string,
    executionId: string,
    action: string,
    details: Record<string, any>,
    outcome: 'success' | 'failure' | 'pending' = 'success',
    riskLevel: 'low' | 'medium' | 'high' | 'critical' = 'low'
  ): Promise<string> {
    return this.log({
      timestamp: new Date(),
      action: `workflow.${action}`,
      actor: 'system',
      resource: 'workflow',
      resourceId: workflowId,
      outcome,
      riskLevel,
      details: {
        workflowId,
        executionId,
        ...details
      },
      correlationId: executionId
    });
  }

  /**
   * Log security event
   */
  async logSecurityEvent(
    event: string,
    actor: string,
    details: Record<string, any>,
    riskLevel: 'low' | 'medium' | 'high' | 'critical' = 'medium'
  ): Promise<string> {
    return this.log({
      timestamp: new Date(),
      action: `security.${event}`,
      actor,
      resource: 'security_system',
      outcome: 'success',
      riskLevel,
      details,
      complianceFrameworks: ['SOX', 'PCI', 'GDPR', 'HIPAA'],
      dataClassification: 'confidential'
    });
  }

  /**
   * Log compliance event
   */
  async logComplianceEvent(
    framework: string,
    event: string,
    actor: string,
    details: Record<string, any>,
    outcome: 'success' | 'failure' | 'pending' = 'success'
  ): Promise<string> {
    return this.log({
      timestamp: new Date(),
      action: `compliance.${framework.toLowerCase()}.${event}`,
      actor,
      resource: 'compliance_system',
      outcome,
      riskLevel: outcome === 'failure' ? 'high' : 'medium',
      details,
      complianceFrameworks: [framework],
      dataClassification: 'restricted'
    });
  }

  /**
   * Query audit logs
   */
  async query(query: AuditQuery): Promise<{
    entries: AuditLogEntry[];
    total: number;
    hasMore: boolean;
  }> {
    // This would typically query a database
    // For now, return empty results as this is a mock implementation
    return {
      entries: [],
      total: 0,
      hasMore: false
    };
  }

  /**
   * Export audit logs for compliance reporting
   */
  async export(query: AuditQuery, format: 'json' | 'csv' | 'pdf' = 'json'): Promise<Buffer> {
    const results = await this.query(query);
    
    switch (format) {
      case 'json':
        return Buffer.from(JSON.stringify(results.entries, null, 2));
      case 'csv':
        return this.exportToCsv(results.entries);
      case 'pdf':
        return this.exportToPdf(results.entries);
      default:
        throw new Error(`Unsupported export format: ${format}`);
    }
  }

  /**
   * Generate compliance report
   */
  async generateComplianceReport(
    framework: string,
    startDate: Date,
    endDate: Date
  ): Promise<{
    framework: string;
    period: { start: Date; end: Date };
    totalEvents: number;
    riskDistribution: Record<string, number>;
    outcomeDistribution: Record<string, number>;
    topActors: Array<{ actor: string; eventCount: number }>;
    criticalEvents: AuditLogEntry[];
    complianceScore: number;
    recommendations: string[];
  }> {
    const query: AuditQuery = {
      startDate,
      endDate,
      complianceFramework: framework
    };

    const results = await this.query(query);
    
    // Calculate metrics
    const riskDistribution = this.calculateRiskDistribution(results.entries);
    const outcomeDistribution = this.calculateOutcomeDistribution(results.entries);
    const topActors = this.getTopActors(results.entries);
    const criticalEvents = results.entries.filter(e => e.riskLevel === 'critical');
    const complianceScore = this.calculateComplianceScore(results.entries);
    const recommendations = this.generateRecommendations(results.entries, framework);

    return {
      framework,
      period: { start: startDate, end: endDate },
      totalEvents: results.total,
      riskDistribution,
      outcomeDistribution,
      topActors,
      criticalEvents,
      complianceScore,
      recommendations
    };
  }

  /**
   * Private methods
   */

  private setupLogger(): void {
    this.logger = winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      ),
      transports: [
        new winston.transports.File({ 
          filename: 'logs/audit-error.log', 
          level: 'error',
          maxsize: 100 * 1024 * 1024, // 100MB
          maxFiles: 10
        }),
        new winston.transports.File({ 
          filename: 'logs/audit.log',
          maxsize: 100 * 1024 * 1024, // 100MB
          maxFiles: 30
        })
      ]
    });

    // Add console transport in development
    if (process.env.NODE_ENV !== 'production') {
      this.logger.add(new winston.transports.Console({
        format: winston.format.simple()
      }));
    }
  }

  private setupRetentionPolicies(): void {
    // Default retention periods by compliance framework (in days)
    this.retentionPolicies.set('SOX', 2555); // 7 years
    this.retentionPolicies.set('GDPR', 2190); // 6 years
    this.retentionPolicies.set('HIPAA', 2190); // 6 years
    this.retentionPolicies.set('PCI', 365); // 1 year
    this.retentionPolicies.set('default', 2555); // 7 years default
  }

  private async setupLogRotation(): Promise<void> {
    // Set up daily log rotation
    // This would typically use logrotate or similar
  }

  private async flushBuffer(): Promise<void> {
    if (this.buffer.length === 0) return;

    const entries = [...this.buffer];
    this.buffer = [];

    try {
      // Write to persistent storage (database, file system, etc.)
      for (const entry of entries) {
        this.logger.info('AUDIT', entry);
      }
    } catch (error) {
      // Restore buffer on failure
      this.buffer.unshift(...entries);
      throw error;
    }
  }

  private getApplicableFrameworks(action: string): string[] {
    const frameworks: string[] = [];
    
    if (action.includes('security') || action.includes('auth') || action.includes('permission')) {
      frameworks.push('SOX', 'PCI');
    }
    
    if (action.includes('data') || action.includes('privacy') || action.includes('gdpr')) {
      frameworks.push('GDPR');
    }
    
    if (action.includes('health') || action.includes('medical') || action.includes('phi')) {
      frameworks.push('HIPAA');
    }
    
    return frameworks.length > 0 ? frameworks : ['SOX']; // Default to SOX
  }

  private classifyData(details: Record<string, any>): 'public' | 'internal' | 'confidential' | 'restricted' {
    // Simple classification logic - in practice this would be more sophisticated
    if (details.password || details.secret || details.token) {
      return 'restricted';
    }
    
    if (details.email || details.phone || details.address) {
      return 'confidential';
    }
    
    if (details.internal || details.private) {
      return 'internal';
    }
    
    return 'public';
  }

  private getRetentionPeriod(frameworks?: string[]): number {
    if (!frameworks || frameworks.length === 0) {
      return this.retentionPolicies.get('default')!;
    }
    
    // Return the maximum retention period for any applicable framework
    return Math.max(...frameworks.map(f => this.retentionPolicies.get(f) || 365));
  }

  private exportToCsv(entries: AuditLogEntry[]): Buffer {
    const headers = ['timestamp', 'action', 'actor', 'resource', 'outcome', 'riskLevel', 'details'];
    const rows = entries.map(entry => [
      entry.timestamp.toISOString(),
      entry.action,
      entry.actor,
      entry.resource || '',
      entry.outcome,
      entry.riskLevel,
      JSON.stringify(entry.details)
    ]);
    
    const csvContent = [headers, ...rows].map(row => row.join(',')).join('\n');
    return Buffer.from(csvContent);
  }

  private exportToPdf(entries: AuditLogEntry[]): Buffer {
    // This would generate a PDF report
    // For now, return JSON as buffer
    return Buffer.from(JSON.stringify(entries, null, 2));
  }

  private calculateRiskDistribution(entries: AuditLogEntry[]): Record<string, number> {
    const distribution = { low: 0, medium: 0, high: 0, critical: 0 };
    entries.forEach(entry => {
      distribution[entry.riskLevel]++;
    });
    return distribution;
  }

  private calculateOutcomeDistribution(entries: AuditLogEntry[]): Record<string, number> {
    const distribution = { success: 0, failure: 0, pending: 0 };
    entries.forEach(entry => {
      distribution[entry.outcome]++;
    });
    return distribution;
  }

  private getTopActors(entries: AuditLogEntry[]): Array<{ actor: string; eventCount: number }> {
    const actorCounts: Record<string, number> = {};
    entries.forEach(entry => {
      actorCounts[entry.actor] = (actorCounts[entry.actor] || 0) + 1;
    });
    
    return Object.entries(actorCounts)
      .map(([actor, eventCount]) => ({ actor, eventCount }))
      .sort((a, b) => b.eventCount - a.eventCount)
      .slice(0, 10);
  }

  private calculateComplianceScore(entries: AuditLogEntry[]): number {
    if (entries.length === 0) return 100;
    
    const failureCount = entries.filter(e => e.outcome === 'failure').length;
    const criticalCount = entries.filter(e => e.riskLevel === 'critical').length;
    
    const failureScore = Math.max(0, 100 - (failureCount / entries.length) * 50);
    const criticalScore = Math.max(0, 100 - (criticalCount / entries.length) * 100);
    
    return Math.round((failureScore + criticalScore) / 2);
  }

  private generateRecommendations(entries: AuditLogEntry[], framework: string): string[] {
    const recommendations: string[] = [];
    
    const failureCount = entries.filter(e => e.outcome === 'failure').length;
    const criticalCount = entries.filter(e => e.riskLevel === 'critical').length;
    
    if (failureCount > entries.length * 0.05) {
      recommendations.push('High failure rate detected. Review and strengthen error handling procedures.');
    }
    
    if (criticalCount > 0) {
      recommendations.push('Critical security events detected. Conduct immediate security review.');
    }
    
    if (framework === 'GDPR') {
      const dataProcessing = entries.filter(e => e.action.includes('data')).length;
      if (dataProcessing > 0) {
        recommendations.push('Ensure all data processing activities have proper consent and legal basis.');
      }
    }
    
    return recommendations;
  }
}