/**
 * Enterprise-grade audit logging system for URN Labs AI Agent Platform
 * Provides comprehensive audit trails for compliance (SOX, GDPR, HIPAA, PCI)
 */
export interface AuditLogEntry {
    id?: string;
    timestamp: Date;
    action: string;
    actor: string;
    resource?: string;
    resourceId?: string;
    outcome: 'success' | 'failure' | 'pending';
    riskLevel: 'low' | 'medium' | 'high' | 'critical';
    details: Record<string, any>;
    sessionId?: string;
    ip?: string;
    userAgent?: string;
    correlationId?: string;
    complianceFrameworks?: string[];
    dataClassification?: 'public' | 'internal' | 'confidential' | 'restricted';
    retentionPeriod?: number;
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
export declare class AuditLogger {
    private logger;
    private isInitialized;
    private buffer;
    private bufferSize;
    private flushInterval;
    private retentionPolicies;
    constructor();
    /**
     * Initialize the audit logger
     */
    initialize(): Promise<void>;
    /**
     * Log an audit entry
     */
    log(entry: Omit<AuditLogEntry, 'id'>): Promise<string>;
    /**
     * Log agent activity
     */
    logAgentActivity(agentId: string, action: string, details: Record<string, any>, outcome?: 'success' | 'failure' | 'pending', riskLevel?: 'low' | 'medium' | 'high' | 'critical'): Promise<string>;
    /**
     * Log workflow activity
     */
    logWorkflowActivity(workflowId: string, executionId: string, action: string, details: Record<string, any>, outcome?: 'success' | 'failure' | 'pending', riskLevel?: 'low' | 'medium' | 'high' | 'critical'): Promise<string>;
    /**
     * Log security event
     */
    logSecurityEvent(event: string, actor: string, details: Record<string, any>, riskLevel?: 'low' | 'medium' | 'high' | 'critical'): Promise<string>;
    /**
     * Log compliance event
     */
    logComplianceEvent(framework: string, event: string, actor: string, details: Record<string, any>, outcome?: 'success' | 'failure' | 'pending'): Promise<string>;
    /**
     * Query audit logs
     */
    query(_query: AuditQuery): Promise<{
        entries: AuditLogEntry[];
        total: number;
        hasMore: boolean;
    }>;
    /**
     * Export audit logs for compliance reporting
     */
    export(query: AuditQuery, format?: 'json' | 'csv' | 'pdf'): Promise<Buffer>;
    /**
     * Generate compliance report
     */
    generateComplianceReport(framework: string, startDate: Date, endDate: Date): Promise<{
        framework: string;
        period: {
            start: Date;
            end: Date;
        };
        totalEvents: number;
        riskDistribution: Record<string, number>;
        outcomeDistribution: Record<string, number>;
        topActors: Array<{
            actor: string;
            eventCount: number;
        }>;
        criticalEvents: AuditLogEntry[];
        complianceScore: number;
        recommendations: string[];
    }>;
    /**
     * Private methods
     */
    private setupLogger;
    private setupRetentionPolicies;
    private setupLogRotation;
    private flushBuffer;
    private getApplicableFrameworks;
    private classifyData;
    private getRetentionPeriod;
    private exportToCsv;
    private exportToPdf;
    private calculateRiskDistribution;
    private calculateOutcomeDistribution;
    private getTopActors;
    private calculateComplianceScore;
    private generateRecommendations;
}
//# sourceMappingURL=AuditLogger.d.ts.map