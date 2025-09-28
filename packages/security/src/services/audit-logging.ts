import crypto from 'crypto';
import { EventEmitter } from 'events';
import { encryptionService } from './encryption';

export interface AuditEvent {
  id: string;
  timestamp: Date;
  eventType: string;
  category: 'AUTHENTICATION' | 'AUTHORIZATION' | 'DATA_ACCESS' | 'SYSTEM' | 'SECURITY' | 'COMPLIANCE';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  source: {
    service: string;
    version: string;
    instance: string;
    ip: string;
  };
  actor: {
    userId?: string;
    sessionId?: string;
    deviceId?: string;
    userAgent?: string;
    type: 'USER' | 'SYSTEM' | 'SERVICE' | 'ANONYMOUS';
  };
  target: {
    resource: string;
    resourceId?: string;
    resourceType: string;
  };
  action: string;
  outcome: 'SUCCESS' | 'FAILURE' | 'PARTIAL';
  details: Record<string, any>;
  metadata: {
    correlationId?: string;
    requestId?: string;
    traceId?: string;
    duration?: number;
    errorCode?: string;
    errorMessage?: string;
  };
  signature?: string;
  compliance: {
    gdpr?: boolean;
    sox?: boolean;
    iso27001?: boolean;
    pci?: boolean;
  };
}

export interface AuditQuery {
  startDate?: Date;
  endDate?: Date;
  eventTypes?: string[];
  categories?: AuditEvent['category'][];
  severities?: AuditEvent['severity'][];
  actorIds?: string[];
  resources?: string[];
  outcomes?: AuditEvent['outcome'][];
  correlationId?: string;
  limit?: number;
  offset?: number;
  sortBy?: 'timestamp' | 'severity' | 'category';
  sortOrder?: 'asc' | 'desc';
}

export interface AuditStatistics {
  totalEvents: number;
  eventsByCategory: Record<string, number>;
  eventsBySeverity: Record<string, number>;
  eventsByOutcome: Record<string, number>;
  topActors: Array<{ actorId: string; count: number }>;
  topResources: Array<{ resource: string; count: number }>;
  anomalies: Array<{
    type: string;
    description: string;
    count: number;
    riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  }>;
}

export interface ComplianceReport {
  reportId: string;
  generatedAt: Date;
  period: { start: Date; end: Date };
  framework: 'GDPR' | 'SOX' | 'ISO27001' | 'PCI' | 'ALL';
  summary: {
    totalEvents: number;
    complianceScore: number;
    violations: number;
    warnings: number;
  };
  findings: Array<{
    category: string;
    description: string;
    severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    count: number;
    remediation: string;
  }>;
  evidence: Array<{
    control: string;
    requirement: string;
    status: 'COMPLIANT' | 'NON_COMPLIANT' | 'PARTIAL';
    evidence: string[];
  }>;
}

export class AuditLoggingService extends EventEmitter {
  private auditEvents: Map<string, AuditEvent> = new Map();
  private eventChain: string[] = [];
  private signingKey: Buffer;
  private encryptionKey: Buffer;
  private readonly maxEventsInMemory = 10000;

  constructor() {
    super();
    this.signingKey = encryptionService.generateKey();
    this.encryptionKey = encryptionService.generateKey();
    this.setupPeriodicTasks();
  }

  /**
   * Log an audit event
   */
  async logEvent(eventData: Omit<AuditEvent, 'id' | 'timestamp' | 'signature'>): Promise<string> {
    const event: AuditEvent = {
      id: encryptionService.generateUUID(),
      timestamp: new Date(),
      ...eventData,
      signature: ''
    };

    // Create tamper-proof signature
    event.signature = this.createEventSignature(event);

    // Store the event
    this.auditEvents.set(event.id, event);

    // Add to event chain for integrity verification
    this.eventChain.push(event.id);

    // Emit event for real-time processing
    this.emit('auditEvent', event);

    // Check for anomalies
    await this.checkForAnomalies(event);

    // Manage memory usage
    this.manageMemoryUsage();

    return event.id;
  }

  /**
   * Create tamper-proof signature for audit event
   */
  private createEventSignature(event: AuditEvent): string {
    const eventData = {
      id: event.id,
      timestamp: event.timestamp.toISOString(),
      eventType: event.eventType,
      category: event.category,
      severity: event.severity,
      source: event.source,
      actor: event.actor,
      target: event.target,
      action: event.action,
      outcome: event.outcome,
      details: event.details,
      metadata: event.metadata
    };

    const dataString = JSON.stringify(eventData, Object.keys(eventData).sort());
    const previousEventId = this.eventChain.length > 0 ? this.eventChain[this.eventChain.length - 1] : '';
    const chainData = `${previousEventId}:${dataString}`;

    return encryptionService.createHMAC(chainData, this.signingKey.toString('hex'));
  }

  /**
   * Verify event integrity
   */
  verifyEventIntegrity(eventId: string): boolean {
    const event = this.auditEvents.get(eventId);
    if (!event) {
      return false;
    }

    const tempEvent = { ...event, signature: '' };
    const expectedSignature = this.createEventSignature(tempEvent);

    return event.signature === expectedSignature;
  }

  /**
   * Verify chain integrity
   */
  verifyChainIntegrity(): { valid: boolean; brokenAt?: string } {
    for (let i = 0; i < this.eventChain.length; i++) {
      const eventId = this.eventChain[i];
      if (!this.verifyEventIntegrity(eventId)) {
        return { valid: false, brokenAt: eventId };
      }
    }

    return { valid: true };
  }

  /**
   * Query audit events
   */
  queryEvents(query: AuditQuery): AuditEvent[] {
    let events = Array.from(this.auditEvents.values());

    // Apply filters
    if (query.startDate) {
      events = events.filter(e => e.timestamp >= query.startDate!);
    }

    if (query.endDate) {
      events = events.filter(e => e.timestamp <= query.endDate!);
    }

    if (query.eventTypes && query.eventTypes.length > 0) {
      events = events.filter(e => query.eventTypes!.includes(e.eventType));
    }

    if (query.categories && query.categories.length > 0) {
      events = events.filter(e => query.categories!.includes(e.category));
    }

    if (query.severities && query.severities.length > 0) {
      events = events.filter(e => query.severities!.includes(e.severity));
    }

    if (query.actorIds && query.actorIds.length > 0) {
      events = events.filter(e =>
        e.actor.userId && query.actorIds!.includes(e.actor.userId)
      );
    }

    if (query.resources && query.resources.length > 0) {
      events = events.filter(e =>
        query.resources!.some(resource => e.target.resource.includes(resource))
      );
    }

    if (query.outcomes && query.outcomes.length > 0) {
      events = events.filter(e => query.outcomes!.includes(e.outcome));
    }

    if (query.correlationId) {
      events = events.filter(e => e.metadata.correlationId === query.correlationId);
    }

    // Sort events
    const sortBy = query.sortBy || 'timestamp';
    const sortOrder = query.sortOrder || 'desc';

    events.sort((a, b) => {
      let aValue: any, bValue: any;

      switch (sortBy) {
        case 'timestamp':
          aValue = a.timestamp.getTime();
          bValue = b.timestamp.getTime();
          break;
        case 'severity':
          const severityOrder = { LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 };
          aValue = severityOrder[a.severity];
          bValue = severityOrder[b.severity];
          break;
        case 'category':
          aValue = a.category;
          bValue = b.category;
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

    return events.slice(offset, offset + limit);
  }

  /**
   * Generate audit statistics
   */
  generateStatistics(period?: { start: Date; end: Date }): AuditStatistics {
    let events = Array.from(this.auditEvents.values());

    if (period) {
      events = events.filter(e =>
        e.timestamp >= period.start && e.timestamp <= period.end
      );
    }

    const stats: AuditStatistics = {
      totalEvents: events.length,
      eventsByCategory: {},
      eventsBySeverity: {},
      eventsByOutcome: {},
      topActors: [],
      topResources: [],
      anomalies: []
    };

    // Count by category
    events.forEach(event => {
      stats.eventsByCategory[event.category] = (stats.eventsByCategory[event.category] || 0) + 1;
    });

    // Count by severity
    events.forEach(event => {
      stats.eventsBySeverity[event.severity] = (stats.eventsBySeverity[event.severity] || 0) + 1;
    });

    // Count by outcome
    events.forEach(event => {
      stats.eventsByOutcome[event.outcome] = (stats.eventsByOutcome[event.outcome] || 0) + 1;
    });

    // Top actors
    const actorCounts = new Map<string, number>();
    events.forEach(event => {
      if (event.actor.userId) {
        actorCounts.set(event.actor.userId, (actorCounts.get(event.actor.userId) || 0) + 1);
      }
    });

    stats.topActors = Array.from(actorCounts.entries())
      .map(([actorId, count]) => ({ actorId, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Top resources
    const resourceCounts = new Map<string, number>();
    events.forEach(event => {
      resourceCounts.set(event.target.resource, (resourceCounts.get(event.target.resource) || 0) + 1);
    });

    stats.topResources = Array.from(resourceCounts.entries())
      .map(([resource, count]) => ({ resource, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Detect anomalies
    stats.anomalies = this.detectAnomalies(events);

    return stats;
  }

  /**
   * Detect anomalies in audit events
   */
  private detectAnomalies(events: AuditEvent[]): AuditStatistics['anomalies'] {
    const anomalies: AuditStatistics['anomalies'] = [];

    // Check for unusual failure rates
    const failureRate = events.filter(e => e.outcome === 'FAILURE').length / events.length;
    if (failureRate > 0.1) { // More than 10% failures
      anomalies.push({
        type: 'HIGH_FAILURE_RATE',
        description: `Failure rate is ${(failureRate * 100).toFixed(1)}%`,
        count: events.filter(e => e.outcome === 'FAILURE').length,
        riskLevel: failureRate > 0.3 ? 'CRITICAL' : 'HIGH'
      });
    }

    // Check for unusual access patterns
    const hourCounts = new Map<number, number>();
    events.forEach(event => {
      const hour = event.timestamp.getHours();
      hourCounts.set(hour, (hourCounts.get(hour) || 0) + 1);
    });

    const offHoursActivity = Array.from(hourCounts.entries())
      .filter(([hour]) => hour < 6 || hour > 22)
      .reduce((sum, [, count]) => sum + count, 0);

    if (offHoursActivity > events.length * 0.2) { // More than 20% outside business hours
      anomalies.push({
        type: 'OFF_HOURS_ACTIVITY',
        description: 'Unusual activity detected outside business hours',
        count: offHoursActivity,
        riskLevel: 'MEDIUM'
      });
    }

    // Check for privilege escalation attempts
    const privilegeEvents = events.filter(e =>
      e.eventType.includes('privilege') ||
      e.action.includes('escalate') ||
      e.details.privilegeChange
    );

    if (privilegeEvents.length > 0) {
      anomalies.push({
        type: 'PRIVILEGE_ESCALATION',
        description: 'Privilege escalation attempts detected',
        count: privilegeEvents.length,
        riskLevel: 'HIGH'
      });
    }

    return anomalies;
  }

  /**
   * Generate compliance report
   */
  async generateComplianceReport(
    framework: ComplianceReport['framework'],
    period: { start: Date; end: Date }
  ): Promise<ComplianceReport> {
    const events = this.queryEvents({
      startDate: period.start,
      endDate: period.end
    });

    const report: ComplianceReport = {
      reportId: encryptionService.generateUUID(),
      generatedAt: new Date(),
      period,
      framework,
      summary: {
        totalEvents: events.length,
        complianceScore: 0,
        violations: 0,
        warnings: 0
      },
      findings: [],
      evidence: []
    };

    // Framework-specific compliance checks
    switch (framework) {
      case 'GDPR':
        this.addGDPRCompliance(report, events);
        break;
      case 'SOX':
        this.addSOXCompliance(report, events);
        break;
      case 'ISO27001':
        this.addISO27001Compliance(report, events);
        break;
      case 'PCI':
        this.addPCICompliance(report, events);
        break;
      case 'ALL':
        this.addGDPRCompliance(report, events);
        this.addSOXCompliance(report, events);
        this.addISO27001Compliance(report, events);
        this.addPCICompliance(report, events);
        break;
    }

    // Calculate compliance score
    const totalFindings = report.findings.length;
    const violations = report.findings.filter(f => f.severity === 'HIGH' || f.severity === 'CRITICAL').length;
    report.summary.violations = violations;
    report.summary.warnings = totalFindings - violations;
    report.summary.complianceScore = Math.max(0, 100 - (violations * 20) - ((totalFindings - violations) * 5));

    return report;
  }

  /**
   * Add GDPR compliance checks
   */
  private addGDPRCompliance(report: ComplianceReport, events: AuditEvent[]): void {
    // Check for data access events
    const dataAccessEvents = events.filter(e =>
      e.category === 'DATA_ACCESS' &&
      e.compliance.gdpr
    );

    if (dataAccessEvents.length === 0) {
      report.findings.push({
        category: 'GDPR',
        description: 'No GDPR-tagged data access events found',
        severity: 'MEDIUM',
        count: 0,
        remediation: 'Ensure all personal data access is properly tagged and logged'
      });
    }

    // Check for consent tracking
    const consentEvents = events.filter(e =>
      e.details.consentGiven !== undefined ||
      e.details.consentWithdrawn !== undefined
    );

    report.evidence.push({
      control: 'GDPR-CONSENT',
      requirement: 'Article 7 - Consent tracking and withdrawal',
      status: consentEvents.length > 0 ? 'COMPLIANT' : 'NON_COMPLIANT',
      evidence: consentEvents.map(e => e.id)
    });
  }

  /**
   * Add SOX compliance checks
   */
  private addSOXCompliance(report: ComplianceReport, events: AuditEvent[]): void {
    // Check for financial data access
    const financialEvents = events.filter(e =>
      e.target.resource.includes('financial') ||
      e.target.resource.includes('accounting') ||
      e.compliance.sox
    );

    report.evidence.push({
      control: 'SOX-FINANCIAL-ACCESS',
      requirement: 'Section 404 - Internal controls over financial reporting',
      status: financialEvents.length > 0 ? 'COMPLIANT' : 'PARTIAL',
      evidence: financialEvents.map(e => e.id)
    });
  }

  /**
   * Add ISO 27001 compliance checks
   */
  private addISO27001Compliance(report: ComplianceReport, events: AuditEvent[]): void {
    // Check for security events
    const securityEvents = events.filter(e =>
      e.category === 'SECURITY' ||
      e.compliance.iso27001
    );

    report.evidence.push({
      control: 'ISO27001-SECURITY-MONITORING',
      requirement: 'A.12.4.1 - Event logging',
      status: securityEvents.length > 0 ? 'COMPLIANT' : 'NON_COMPLIANT',
      evidence: securityEvents.map(e => e.id)
    });
  }

  /**
   * Add PCI compliance checks
   */
  private addPCICompliance(report: ComplianceReport, events: AuditEvent[]): void {
    // Check for payment data access
    const paymentEvents = events.filter(e =>
      e.target.resource.includes('payment') ||
      e.target.resource.includes('card') ||
      e.compliance.pci
    );

    report.evidence.push({
      control: 'PCI-PAYMENT-ACCESS',
      requirement: 'Requirement 10 - Log and monitor all access to network resources',
      status: paymentEvents.length > 0 ? 'COMPLIANT' : 'PARTIAL',
      evidence: paymentEvents.map(e => e.id)
    });
  }

  /**
   * Check for anomalies in new events
   */
  private async checkForAnomalies(event: AuditEvent): Promise<void> {
    // Real-time anomaly detection
    if (event.severity === 'CRITICAL') {
      this.emit('criticalEvent', event);
    }

    if (event.outcome === 'FAILURE' && event.category === 'AUTHENTICATION') {
      // Check for brute force attacks
      const recentFailures = this.queryEvents({
        startDate: new Date(Date.now() - 15 * 60 * 1000), // Last 15 minutes
        actorIds: event.actor.userId ? [event.actor.userId] : undefined,
        outcomes: ['FAILURE'],
        categories: ['AUTHENTICATION']
      });

      if (recentFailures.length >= 5) {
        this.emit('anomaly', {
          type: 'BRUTE_FORCE_ATTACK',
          actor: event.actor,
          count: recentFailures.length,
          events: recentFailures
        });
      }
    }
  }

  /**
   * Setup periodic maintenance tasks
   */
  private setupPeriodicTasks(): void {
    // Archive old events every hour
    setInterval(() => {
      this.archiveOldEvents();
    }, 60 * 60 * 1000);

    // Generate automated reports every day
    setInterval(() => {
      this.generateAutomatedReports();
    }, 24 * 60 * 60 * 1000);
  }

  /**
   * Archive old events to persistent storage
   */
  private archiveOldEvents(): void {
    // In production, implement actual archival to database or file system
    const cutoffDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 7 days ago

    for (const [eventId, event] of this.auditEvents.entries()) {
      if (event.timestamp < cutoffDate) {
        // Archive event (implement actual archival logic)
        this.auditEvents.delete(eventId);
      }
    }
  }

  /**
   * Generate automated compliance reports
   */
  private async generateAutomatedReports(): Promise<void> {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    try {
      const report = await this.generateComplianceReport('ALL', {
        start: yesterday,
        end: today
      });

      this.emit('dailyReport', report);
    } catch (error) {
      console.error('Failed to generate automated report:', error);
    }
  }

  /**
   * Manage memory usage
   */
  private manageMemoryUsage(): void {
    if (this.auditEvents.size > this.maxEventsInMemory) {
      // Remove oldest events
      const eventsToRemove = this.auditEvents.size - this.maxEventsInMemory;
      const sortedEvents = Array.from(this.auditEvents.entries())
        .sort(([, a], [, b]) => a.timestamp.getTime() - b.timestamp.getTime());

      for (let i = 0; i < eventsToRemove; i++) {
        const [eventId] = sortedEvents[i];
        this.auditEvents.delete(eventId);
      }
    }
  }

  /**
   * Export events for external analysis
   */
  exportEvents(query: AuditQuery, format: 'JSON' | 'CSV' | 'XML' = 'JSON'): string {
    const events = this.queryEvents(query);

    switch (format) {
      case 'JSON':
        return JSON.stringify(events, null, 2);

      case 'CSV':
        return this.convertToCSV(events);

      case 'XML':
        return this.convertToXML(events);

      default:
        throw new Error(`Unsupported export format: ${format}`);
    }
  }

  /**
   * Convert events to CSV format
   */
  private convertToCSV(events: AuditEvent[]): string {
    if (events.length === 0) return '';

    const headers = [
      'ID', 'Timestamp', 'Event Type', 'Category', 'Severity',
      'Actor ID', 'Resource', 'Action', 'Outcome'
    ];

    const rows = events.map(event => [
      event.id,
      event.timestamp.toISOString(),
      event.eventType,
      event.category,
      event.severity,
      event.actor.userId || '',
      event.target.resource,
      event.action,
      event.outcome
    ]);

    return [headers, ...rows].map(row => row.join(',')).join('\n');
  }

  /**
   * Convert events to XML format
   */
  private convertToXML(events: AuditEvent[]): string {
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<auditEvents>\n';

    events.forEach(event => {
      xml += `  <event id="${event.id}">\n`;
      xml += `    <timestamp>${event.timestamp.toISOString()}</timestamp>\n`;
      xml += `    <eventType>${event.eventType}</eventType>\n`;
      xml += `    <category>${event.category}</category>\n`;
      xml += `    <severity>${event.severity}</severity>\n`;
      xml += `    <outcome>${event.outcome}</outcome>\n`;
      xml += `  </event>\n`;
    });

    xml += '</auditEvents>';
    return xml;
  }
}

export const auditLoggingService = new AuditLoggingService();