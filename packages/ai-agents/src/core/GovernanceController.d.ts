import type { AgentTask, AgentConfig } from '../types/AgentTypes';
/**
 * Enterprise governance controller for URN Labs AI Agent Platform
 * Enforces policies, compliance, and security controls across all agent operations
 */
export interface GovernancePolicy {
    id: string;
    name: string;
    type: 'security' | 'compliance' | 'resource' | 'data' | 'operational';
    level: 'basic' | 'standard' | 'strict';
    description: string;
    rules: GovernanceRule[];
    enabled: boolean;
    priority: number;
    auditRequired: boolean;
    complianceFrameworks: string[];
}
export interface GovernanceRule {
    id: string;
    condition: string;
    operator: 'equals' | 'contains' | 'matches' | 'greater_than' | 'less_than' | 'exists';
    value: any;
    action: 'allow' | 'deny' | 'require_approval' | 'flag' | 'sanitize';
    message: string;
}
export interface GovernanceResult {
    approved: boolean;
    reason?: string;
    warnings: string[];
    requiredApprovals: string[];
    policyViolations: Array<{
        policyId: string;
        ruleId: string;
        severity: 'low' | 'medium' | 'high' | 'critical';
        message: string;
    }>;
    sanitizedData?: any;
    auditId?: string;
}
export interface ApprovalRequest {
    id: string;
    taskId: string;
    requesterId: string;
    approverIds: string[];
    reason: string;
    status: 'pending' | 'approved' | 'rejected' | 'expired';
    createdAt: Date;
    expiresAt: Date;
    approvedBy?: string;
    approvedAt?: Date;
    rejectedBy?: string;
    rejectedAt?: Date;
    rejectionReason?: string;
}
export declare class GovernanceController {
    private policies;
    private approvalRequests;
    private auditLogger;
    private isInitialized;
    constructor();
    /**
     * Initialize governance controller with default policies
     */
    initialize(): Promise<void>;
    /**
     * Validate a task against governance policies
     */
    validateTask(task: AgentTask): Promise<GovernanceResult>;
    /**
     * Validate agent configuration
     */
    validateAgentConfig(config: AgentConfig): Promise<{
        valid: boolean;
        errors: string[];
        warnings: string[];
    }>;
    /**
     * Request approval for a task
     */
    requestApproval(taskId: string, requesterId: string, approverIds: string[], reason: string, expirationHours?: number): Promise<string>;
    /**
     * Approve or reject an approval request
     */
    processApproval(approvalId: string, approverId: string, approved: boolean, reason?: string): Promise<void>;
    /**
     * Get approval status
     */
    getApprovalStatus(approvalId: string): Promise<ApprovalRequest | null>;
    /**
     * Add a custom policy
     */
    addPolicy(policy: GovernancePolicy): Promise<void>;
    /**
     * Remove a policy
     */
    removePolicy(policyId: string): Promise<void>;
    /**
     * List all policies
     */
    listPolicies(): Promise<GovernancePolicy[]>;
    /**
     * Private methods
     */
    private loadDefaultPolicies;
    private evaluatePolicy;
    private evaluateRule;
    private extractValue;
    private determineSeverity;
}
//# sourceMappingURL=GovernanceController.d.ts.map