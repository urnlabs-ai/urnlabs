import { v4 as uuidv4 } from 'uuid';
import type { AgentTask, AgentConfig } from '../types/AgentTypes';
import { AuditLogger } from './AuditLogger';

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
  condition: string; // JSON path or expression
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

export class GovernanceController {
  private policies: Map<string, GovernancePolicy> = new Map();
  private approvalRequests: Map<string, ApprovalRequest> = new Map();
  private auditLogger: AuditLogger;
  private isInitialized = false;

  constructor() {
    this.auditLogger = new AuditLogger();
  }

  /**
   * Initialize governance controller with default policies
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      await this.auditLogger.initialize();
      await this.loadDefaultPolicies();
      
      this.isInitialized = true;

      await this.auditLogger.log({
        action: 'governance_controller_initialized',
        actor: 'system',
        timestamp: new Date(),
        outcome: 'success',
        riskLevel: 'low',
        details: {
          policiesLoaded: this.policies.size
        }
      });

    } catch (error) {
      throw new Error(`Failed to initialize GovernanceController: ${error}`);
    }
  }

  /**
   * Validate a task against governance policies
   */
  async validateTask(task: AgentTask): Promise<GovernanceResult> {
    const result: GovernanceResult = {
      approved: true,
      warnings: [],
      requiredApprovals: [],
      policyViolations: []
    };

    try {
      // Apply all relevant policies
      for (const policy of this.policies.values()) {
        if (!policy.enabled) continue;

        const policyResult = await this.evaluatePolicy(policy, task);
        
        if (!policyResult.passed) {
          result.policyViolations.push(...policyResult.violations);
          
          // Check if any violation requires denial
          const hasCriticalViolation = policyResult.violations.some(v => 
            v.severity === 'critical' || 
            policy.rules.find(r => r.id === v.ruleId)?.action === 'deny'
          );

          if (hasCriticalViolation) {
            result.approved = false;
            result.reason = 'Critical policy violations detected';
          }

          // Check if approval is required
          const requiresApproval = policyResult.violations.some(v =>
            policy.rules.find(r => r.id === v.ruleId)?.action === 'require_approval'
          );

          if (requiresApproval && !result.requiredApprovals.includes(policy.name)) {
            result.requiredApprovals.push(policy.name);
          }

          // Collect warnings
          policyResult.violations.forEach(v => {
            if (v.severity === 'low' || v.severity === 'medium') {
              result.warnings.push(v.message);
            }
          });
        }
      }

      // Log governance check
      const auditId = await this.auditLogger.log({
        action: 'task_governance_check',
        actor: 'system',
        timestamp: new Date(),
        outcome: result.approved ? 'success' : 'failure',
        riskLevel: result.policyViolations.length > 0 ? 'high' : 'low',
        details: {
          taskId: task.id,
          taskType: task.type,
          approved: result.approved,
          violations: result.policyViolations.length,
          warnings: result.warnings.length,
          approvalsRequired: result.requiredApprovals.length
        }
      });

      result.auditId = auditId;

    } catch (error) {
      result.approved = false;
      result.reason = `Governance evaluation failed: ${error}`;
    }

    return result;
  }

  /**
   * Validate agent configuration
   */
  async validateAgentConfig(config: AgentConfig): Promise<{
    valid: boolean;
    errors: string[];
    warnings: string[];
  }> {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Check security clearance levels
      if (config.securityClearance === 'restricted' && !config.auditRequired) {
        errors.push('Agents with restricted security clearance must have audit enabled');
      }

      // Validate governance level
      if (config.governanceLevel === 'strict' && config.maxConcurrentTasks > 3) {
        warnings.push('Strict governance level recommends max 3 concurrent tasks');
      }

      // Check capability combinations
      const securityCapabilities = config.capabilities.filter(cap => 
        cap.name.includes('security') || cap.name.includes('compliance')
      );
      
      if (securityCapabilities.length > 0 && !config.auditRequired) {
        errors.push('Agents with security capabilities must have audit enabled');
      }

      // Validate timeout settings
      if (config.timeout > 1800000) { // 30 minutes
        warnings.push('Task timeout exceeds recommended maximum (30 minutes)');
      }

      // Log validation
      await this.auditLogger.log({
        action: 'agent_config_validation',
        actor: 'system',
        timestamp: new Date(),
        outcome: errors.length === 0 ? 'success' : 'failure',
        riskLevel: errors.length > 0 ? 'medium' : 'low',
        details: {
          agentId: config.id,
          role: config.role,
          errors: errors.length,
          warnings: warnings.length,
          governanceLevel: config.governanceLevel,
          securityClearance: config.securityClearance
        }
      });

    } catch (error) {
      errors.push(`Validation error: ${error}`);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Request approval for a task
   */
  async requestApproval(
    taskId: string,
    requesterId: string,
    approverIds: string[],
    reason: string,
    expirationHours: number = 24
  ): Promise<string> {
    const approvalId = uuidv4();
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + expirationHours);

    const request: ApprovalRequest = {
      id: approvalId,
      taskId,
      requesterId,
      approverIds,
      reason,
      status: 'pending',
      createdAt: new Date(),
      expiresAt
    };

    this.approvalRequests.set(approvalId, request);

    await this.auditLogger.log({
      action: 'approval_requested',
      actor: requesterId,
      timestamp: new Date(),
      outcome: 'success',
      riskLevel: 'medium',
      details: {
        approvalId,
        taskId,
        approverIds,
        expirationHours
      }
    });

    return approvalId;
  }

  /**
   * Approve or reject an approval request
   */
  async processApproval(
    approvalId: string,
    approverId: string,
    approved: boolean,
    reason?: string
  ): Promise<void> {
    const request = this.approvalRequests.get(approvalId);
    if (!request) {
      throw new Error(`Approval request ${approvalId} not found`);
    }

    if (!request.approverIds.includes(approverId)) {
      throw new Error(`User ${approverId} is not authorized to approve this request`);
    }

    if (request.status !== 'pending') {
      throw new Error(`Approval request ${approvalId} is already ${request.status}`);
    }

    if (new Date() > request.expiresAt) {
      request.status = 'expired';
      throw new Error(`Approval request ${approvalId} has expired`);
    }

    if (approved) {
      request.status = 'approved';
      request.approvedBy = approverId;
      request.approvedAt = new Date();
    } else {
      request.status = 'rejected';
      request.rejectedBy = approverId;
      request.rejectedAt = new Date();
      request.rejectionReason = reason;
    }

    await this.auditLogger.log({
      action: approved ? 'approval_granted' : 'approval_rejected',
      actor: approverId,
      timestamp: new Date(),
      outcome: 'success',
      riskLevel: 'medium',
      details: {
        approvalId,
        taskId: request.taskId,
        reason
      }
    });
  }

  /**
   * Get approval status
   */
  async getApprovalStatus(approvalId: string): Promise<ApprovalRequest | null> {
    return this.approvalRequests.get(approvalId) || null;
  }

  /**
   * Add a custom policy
   */
  async addPolicy(policy: GovernancePolicy): Promise<void> {
    this.policies.set(policy.id, policy);

    await this.auditLogger.log({
      action: 'policy_added',
      actor: 'system',
      timestamp: new Date(),
      outcome: 'success',
      riskLevel: 'low',
      details: {
        policyId: policy.id,
        policyName: policy.name,
        type: policy.type,
        level: policy.level
      }
    });
  }

  /**
   * Remove a policy
   */
  async removePolicy(policyId: string): Promise<void> {
    const policy = this.policies.get(policyId);
    if (policy) {
      this.policies.delete(policyId);

      await this.auditLogger.log({
        action: 'policy_removed',
        actor: 'system',
        timestamp: new Date(),
        outcome: 'success',
        riskLevel: 'medium',
        details: {
          policyId,
          policyName: policy.name
        }
      });
    }
  }

  /**
   * List all policies
   */
  async listPolicies(): Promise<GovernancePolicy[]> {
    return Array.from(this.policies.values());
  }

  /**
   * Private methods
   */

  private async loadDefaultPolicies(): Promise<void> {
    const defaultPolicies: GovernancePolicy[] = [
      {
        id: 'data-protection-policy',
        name: 'Data Protection Policy',
        type: 'data',
        level: 'standard',
        description: 'Prevents processing of sensitive data without proper authorization',
        rules: [
          {
            id: 'sensitive-data-check',
            condition: 'payload.code',
            operator: 'matches',
            value: /(password|secret|key|token|ssn|credit.card)/i,
            action: 'flag',
            message: 'Potential sensitive data detected in code payload'
          },
          {
            id: 'pii-protection',
            condition: 'payload',
            operator: 'matches',
            value: /\b\d{3}-\d{2}-\d{4}\b|\b\d{16}\b/,
            action: 'deny',
            message: 'PII data (SSN/Credit Card) detected - processing denied'
          }
        ],
        enabled: true,
        priority: 1,
        auditRequired: true,
        complianceFrameworks: ['GDPR', 'PCI', 'HIPAA']
      },
      {
        id: 'resource-limits-policy',
        name: 'Resource Limits Policy',
        type: 'resource',
        level: 'standard',
        description: 'Enforces resource usage limits',
        rules: [
          {
            id: 'concurrent-tasks-limit',
            condition: 'priority',
            operator: 'equals',
            value: 'critical',
            action: 'require_approval',
            message: 'Critical priority tasks require approval'
          },
          {
            id: 'large-payload-check',
            condition: 'payload',
            operator: 'greater_than',
            value: 1048576, // 1MB
            action: 'flag',
            message: 'Large payload detected - may impact performance'
          }
        ],
        enabled: true,
        priority: 2,
        auditRequired: true,
        complianceFrameworks: ['SOX']
      },
      {
        id: 'security-policy',
        name: 'Security Policy',
        type: 'security',
        level: 'strict',
        description: 'Enforces security controls and restrictions',
        rules: [
          {
            id: 'external-request-check',
            condition: 'payload.url',
            operator: 'exists',
            value: true,
            action: 'require_approval',
            message: 'Tasks with external URLs require security approval'
          },
          {
            id: 'code-execution-check',
            condition: 'type',
            operator: 'equals',
            value: 'code_execution',
            action: 'deny',
            message: 'Direct code execution tasks are not permitted'
          }
        ],
        enabled: true,
        priority: 1,
        auditRequired: true,
        complianceFrameworks: ['SOX', 'PCI']
      }
    ];

    for (const policy of defaultPolicies) {
      this.policies.set(policy.id, policy);
    }
  }

  private async evaluatePolicy(
    policy: GovernancePolicy,
    task: AgentTask
  ): Promise<{
    passed: boolean;
    violations: Array<{
      policyId: string;
      ruleId: string;
      severity: 'low' | 'medium' | 'high' | 'critical';
      message: string;
    }>;
  }> {
    const violations = [];

    for (const rule of policy.rules) {
      try {
        const violates = await this.evaluateRule(rule, task);
        if (violates) {
          violations.push({
            policyId: policy.id,
            ruleId: rule.id,
            severity: this.determineSeverity(policy.type, rule.action),
            message: rule.message
          });
        }
      } catch (error) {
        violations.push({
          policyId: policy.id,
          ruleId: rule.id,
          severity: 'high',
          message: `Rule evaluation failed: ${error}`
        });
      }
    }

    return {
      passed: violations.length === 0,
      violations
    };
  }

  private async evaluateRule(rule: GovernanceRule, task: AgentTask): Promise<boolean> {
    const value = this.extractValue(rule.condition, task);

    switch (rule.operator) {
      case 'equals':
        return value === rule.value;
      
      case 'contains':
        return typeof value === 'string' && value.includes(rule.value);
      
      case 'matches':
        if (rule.value instanceof RegExp) {
          return rule.value.test(String(value));
        }
        return new RegExp(rule.value).test(String(value));
      
      case 'greater_than':
        return Number(value) > Number(rule.value);
      
      case 'less_than':
        return Number(value) < Number(rule.value);
      
      case 'exists':
        return (value !== undefined && value !== null) === rule.value;
      
      default:
        return false;
    }
  }

  private extractValue(path: string, task: AgentTask): any {
    const parts = path.split('.');
    let current: any = task;

    for (const part of parts) {
      if (current === null || current === undefined) {
        return undefined;
      }
      current = current[part];
    }

    return current;
  }

  private determineSeverity(
    policyType: GovernancePolicy['type'],
    action: GovernanceRule['action']
  ): 'low' | 'medium' | 'high' | 'critical' {
    if (action === 'deny') return 'critical';
    if (action === 'require_approval') return 'high';
    if (policyType === 'security' || policyType === 'data') return 'high';
    if (policyType === 'compliance') return 'medium';
    return 'low';
  }
}