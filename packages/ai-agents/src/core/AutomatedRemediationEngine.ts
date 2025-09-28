import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { GovernanceController, GovernanceResult } from './GovernanceController';
import { AuditLogger } from './AuditLogger';
import type { AgentTask } from '../types/AgentTypes';
import { ResponseActionExecutor } from '../services/ResponseActionExecutor';
import { EscalationManager } from '../services/EscalationManager';

/**
 * Enterprise Automated Remediation Engine for URN Labs AI Agent Platform
 *
 * Provides automated response to policy violations with configurable actions,
 * escalation procedures, and comprehensive audit trails for compliance.
 *
 * Features:
 * - Real-time policy violation response
 * - Configurable remediation actions
 * - Time-based escalation workflows
 * - Comprehensive audit trailing
 * - Integration with governance and compliance systems
 */

export interface RemediationAction {
  id: string;
  type: 'block_task' | 'revoke_access' | 'quarantine_data' | 'notify_admin' |
        'require_approval' | 'audit_log' | 'suspend_agent' | 'escalate' | 'custom';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  config: Record<string, any>;
  timeoutMs?: number;
  retryAttempts?: number;
  prerequisites?: string[]; // Required actions before this one
}

export interface RemediationPolicy {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  priority: number;

  // Triggers
  policyViolationTypes: string[];
  severityThresholds: ('low' | 'medium' | 'high' | 'critical')[];

  // Actions
  immediateActions: RemediationAction[];
  escalationActions: RemediationAction[];

  // Escalation Configuration
  escalationDelayMs: number;
  maxEscalationLevel: number;

  // Compliance and Audit
  complianceFrameworks: string[];
  auditRequired: boolean;
  retentionPeriodDays: number;
}

export interface RemediationExecution {
  id: string;
  violationId: string;
  policyId: string;
  remediationPolicyId: string;

  // Execution state
  status: 'initiated' | 'in_progress' | 'completed' | 'failed' | 'escalated';
  currentStep: number;
  totalSteps: number;

  // Actions and results
  executedActions: Array<{
    actionId: string;
    actionType: string;
    startedAt: Date;
    completedAt?: Date;
    status: 'pending' | 'running' | 'success' | 'failed' | 'skipped';
    result?: any;
    error?: string;
  }>;

  // Escalation tracking
  escalationLevel: number;
  escalatedAt?: Date;
  escalationReason?: string;

  // Metadata
  initiatedBy: string;
  initiatedAt: Date;
  completedAt?: Date;
  auditTrailId?: string;

  // Context
  taskContext?: AgentTask;
  violationContext: Record<string, any>;
}

export interface RemediationResult {
  success: boolean;
  executionId: string;
  actionsExecuted: number;
  actionsSucceeded: number;
  actionsFailed: number;
  escalated: boolean;
  auditTrailId?: string;
  errors: string[];
  warnings: string[];
}

export class AutomatedRemediationEngine extends EventEmitter {
  private governanceController: GovernanceController;
  private auditLogger: AuditLogger;
  private actionExecutor: ResponseActionExecutor;
  private escalationManager: EscalationManager;

  private remediationPolicies: Map<string, RemediationPolicy> = new Map();
  private activeExecutions: Map<string, RemediationExecution> = new Map();

  private isInitialized = false;
  private isRunning = false;

  constructor(
    governanceController?: GovernanceController,
    auditLogger?: AuditLogger,
    actionExecutor?: ResponseActionExecutor,
    escalationManager?: EscalationManager
  ) {
    super();

    this.governanceController = governanceController || new GovernanceController();
    this.auditLogger = auditLogger || new AuditLogger();
    this.actionExecutor = actionExecutor || new ResponseActionExecutor();
    this.escalationManager = escalationManager || new EscalationManager();

    this.setupEventHandlers();
  }

  /**
   * Initialize the remediation engine
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // Initialize dependencies
      await this.governanceController.initialize();
      await this.auditLogger.initialize();
      await this.actionExecutor.initialize();
      await this.escalationManager.initialize();

      // Load default remediation policies
      await this.loadDefaultPolicies();

      // Start monitoring
      this.isRunning = true;
      this.isInitialized = true;

      await this.auditLogger.log({
        timestamp: new Date(),
        action: 'remediation_engine_initialized',
        actor: 'system',
        outcome: 'success',
        riskLevel: 'low',
        details: {
          policiesLoaded: this.remediationPolicies.size,
          executorInitialized: true,
          escalationManagerInitialized: true
        },
        complianceFrameworks: ['SOX', 'GDPR', 'HIPAA', 'PCI']
      });

      this.emit('initialized');

    } catch (error) {
      await this.auditLogger.log({
        timestamp: new Date(),
        action: 'remediation_engine_initialization_failed',
        actor: 'system',
        outcome: 'failure',
        riskLevel: 'critical',
        details: {
          error: error instanceof Error ? error.message : String(error)
        }
      });

      throw new Error(`Failed to initialize AutomatedRemediationEngine: ${error}`);
    }
  }

  /**
   * Process policy violations and execute automated remediation
   */
  async processViolation(
    violationId: string,
    governanceResult: GovernanceResult,
    taskContext?: AgentTask
  ): Promise<RemediationResult> {
    if (!this.isInitialized || !this.isRunning) {
      throw new Error('Remediation engine not initialized or not running');
    }

    const executionId = uuidv4();
    const startTime = new Date();

    try {
      // Find applicable remediation policies
      const applicablePolicies = this.findApplicablePolicies(governanceResult);

      if (applicablePolicies.length === 0) {
        await this.auditLogger.log({
          timestamp: startTime,
          action: 'no_remediation_policy_found',
          actor: 'system',
          outcome: 'success',
          riskLevel: 'low',
          details: {
            violationId,
            policyViolations: governanceResult.policyViolations.length,
            taskId: taskContext?.id
          }
        });

        return {
          success: true,
          executionId,
          actionsExecuted: 0,
          actionsSucceeded: 0,
          actionsFailed: 0,
          escalated: false,
          errors: [],
          warnings: ['No applicable remediation policies found']
        };
      }

      // Execute remediation for highest priority policy
      const selectedPolicy = applicablePolicies[0]; // Already sorted by priority

      const execution: RemediationExecution = {
        id: executionId,
        violationId,
        policyId: governanceResult.policyViolations[0]?.policyId || '',
        remediationPolicyId: selectedPolicy.id,
        status: 'initiated',
        currentStep: 0,
        totalSteps: selectedPolicy.immediateActions.length,
        executedActions: [],
        escalationLevel: 0,
        initiatedBy: 'system',
        initiatedAt: startTime,
        taskContext,
        violationContext: {
          violations: governanceResult.policyViolations,
          warnings: governanceResult.warnings,
          requiredApprovals: governanceResult.requiredApprovals
        }
      };

      this.activeExecutions.set(executionId, execution);

      // Start audit trail
      const auditTrailId = await this.auditLogger.log({
        timestamp: startTime,
        action: 'remediation_execution_started',
        actor: 'system',
        resource: 'remediation_execution',
        resourceId: executionId,
        outcome: 'pending',
        riskLevel: this.determineRiskLevel(governanceResult),
        details: {
          violationId,
          remediationPolicyId: selectedPolicy.id,
          totalActions: selectedPolicy.immediateActions.length,
          policyViolations: governanceResult.policyViolations,
          taskId: taskContext?.id
        },
        complianceFrameworks: selectedPolicy.complianceFrameworks
      });

      execution.auditTrailId = auditTrailId;

      // Execute immediate actions
      const result = await this.executeRemediationActions(execution, selectedPolicy);

      // Update final status
      execution.status = result.success ? 'completed' : 'failed';
      execution.completedAt = new Date();

      await this.auditLogger.log({
        timestamp: new Date(),
        action: 'remediation_execution_completed',
        actor: 'system',
        resource: 'remediation_execution',
        resourceId: executionId,
        outcome: result.success ? 'success' : 'failure',
        riskLevel: result.escalated ? 'high' : 'medium',
        details: {
          violationId,
          actionsExecuted: result.actionsExecuted,
          actionsSucceeded: result.actionsSucceeded,
          actionsFailed: result.actionsFailed,
          escalated: result.escalated,
          errors: result.errors,
          executionTimeMs: new Date().getTime() - startTime.getTime()
        },
        complianceFrameworks: selectedPolicy.complianceFrameworks
      });

      // Clean up completed execution
      this.activeExecutions.delete(executionId);

      this.emit('remediation_completed', {
        executionId,
        violationId,
        result
      });

      return result;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      await this.auditLogger.log({
        timestamp: new Date(),
        action: 'remediation_execution_error',
        actor: 'system',
        resource: 'remediation_execution',
        resourceId: executionId,
        outcome: 'failure',
        riskLevel: 'critical',
        details: {
          violationId,
          error: errorMessage,
          taskId: taskContext?.id
        }
      });

      this.activeExecutions.delete(executionId);

      return {
        success: false,
        executionId,
        actionsExecuted: 0,
        actionsSucceeded: 0,
        actionsFailed: 0,
        escalated: false,
        errors: [errorMessage],
        warnings: []
      };
    }
  }

  /**
   * Add a custom remediation policy
   */
  async addRemediationPolicy(policy: RemediationPolicy): Promise<void> {
    this.remediationPolicies.set(policy.id, policy);

    await this.auditLogger.log({
      timestamp: new Date(),
      action: 'remediation_policy_added',
      actor: 'system',
      resource: 'remediation_policy',
      resourceId: policy.id,
      outcome: 'success',
      riskLevel: 'low',
      details: {
        policyName: policy.name,
        immediateActions: policy.immediateActions.length,
        escalationActions: policy.escalationActions.length,
        complianceFrameworks: policy.complianceFrameworks
      }
    });
  }

  /**
   * Remove a remediation policy
   */
  async removeRemediationPolicy(policyId: string): Promise<void> {
    const policy = this.remediationPolicies.get(policyId);
    if (policy) {
      this.remediationPolicies.delete(policyId);

      await this.auditLogger.log({
        timestamp: new Date(),
        action: 'remediation_policy_removed',
        actor: 'system',
        resource: 'remediation_policy',
        resourceId: policyId,
        outcome: 'success',
        riskLevel: 'medium',
        details: {
          policyName: policy.name
        }
      });
    }
  }

  /**
   * Get all active remediation executions
   */
  getActiveExecutions(): RemediationExecution[] {
    return Array.from(this.activeExecutions.values());
  }

  /**
   * Get remediation execution by ID
   */
  getExecution(executionId: string): RemediationExecution | undefined {
    return this.activeExecutions.get(executionId);
  }

  /**
   * List all remediation policies
   */
  listRemediationPolicies(): RemediationPolicy[] {
    return Array.from(this.remediationPolicies.values());
  }

  /**
   * Stop the remediation engine
   */
  async stop(): Promise<void> {
    this.isRunning = false;

    // Wait for active executions to complete or force stop after timeout
    const timeoutMs = 30000; // 30 seconds
    const startTime = Date.now();

    while (this.activeExecutions.size > 0 && (Date.now() - startTime) < timeoutMs) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // Force clear any remaining executions
    this.activeExecutions.clear();

    await this.auditLogger.log({
      timestamp: new Date(),
      action: 'remediation_engine_stopped',
      actor: 'system',
      outcome: 'success',
      riskLevel: 'low',
      details: {
        forcedStop: (Date.now() - startTime) >= timeoutMs
      }
    });

    this.emit('stopped');
  }

  /**
   * Private methods
   */

  private setupEventHandlers(): void {
    // Handle escalation events
    this.escalationManager.on('escalation_triggered', async (data) => {
      await this.handleEscalation(data.executionId, data.reason);
    });

    // Handle action execution events
    this.actionExecutor.on('action_completed', (data) => {
      this.emit('action_completed', data);
    });

    this.actionExecutor.on('action_failed', (data) => {
      this.emit('action_failed', data);
    });
  }

  private findApplicablePolicies(governanceResult: GovernanceResult): RemediationPolicy[] {
    const policies: RemediationPolicy[] = [];

    for (const policy of this.remediationPolicies.values()) {
      if (!policy.enabled) continue;

      // Check if any violation types match
      const hasMatchingViolationType = governanceResult.policyViolations.some(violation =>
        policy.policyViolationTypes.includes(violation.policyId) ||
        policy.policyViolationTypes.includes('*') // Wildcard for all violations
      );

      if (!hasMatchingViolationType) continue;

      // Check severity thresholds
      const hasMatchingSeverity = governanceResult.policyViolations.some(violation =>
        policy.severityThresholds.includes(violation.severity)
      );

      if (hasMatchingSeverity) {
        policies.push(policy);
      }
    }

    // Sort by priority (higher number = higher priority)
    return policies.sort((a, b) => b.priority - a.priority);
  }

  private async executeRemediationActions(
    execution: RemediationExecution,
    policy: RemediationPolicy
  ): Promise<RemediationResult> {
    execution.status = 'in_progress';

    let actionsExecuted = 0;
    let actionsSucceeded = 0;
    let actionsFailed = 0;
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Execute immediate actions
      for (const action of policy.immediateActions) {
        execution.currentStep++;
        actionsExecuted++;

        const actionResult = await this.executeAction(execution, action);

        if (actionResult.success) {
          actionsSucceeded++;
        } else {
          actionsFailed++;
          errors.push(actionResult.error || 'Unknown action error');
        }

        // Check if execution should be stopped due to critical action failure
        if (!actionResult.success && action.severity === 'critical') {
          break;
        }
      }

      // Check if escalation is needed
      const needsEscalation = this.shouldEscalate(execution, policy, actionsFailed);

      if (needsEscalation) {
        await this.triggerEscalation(execution, policy);
        return {
          success: actionsFailed === 0,
          executionId: execution.id,
          actionsExecuted,
          actionsSucceeded,
          actionsFailed,
          escalated: true,
          auditTrailId: execution.auditTrailId,
          errors,
          warnings
        };
      }

      return {
        success: actionsFailed === 0,
        executionId: execution.id,
        actionsExecuted,
        actionsSucceeded,
        actionsFailed,
        escalated: false,
        auditTrailId: execution.auditTrailId,
        errors,
        warnings
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      errors.push(errorMessage);

      return {
        success: false,
        executionId: execution.id,
        actionsExecuted,
        actionsSucceeded,
        actionsFailed: actionsExecuted - actionsSucceeded,
        escalated: false,
        auditTrailId: execution.auditTrailId,
        errors,
        warnings
      };
    }
  }

  private async executeAction(
    execution: RemediationExecution,
    action: RemediationAction
  ): Promise<{ success: boolean; error?: string }> {
    const actionExecution: ActionExecution = {
      actionId: action.id,
      actionType: action.type,
      startedAt: new Date(),
      status: 'running'
    };

    execution.executedActions.push(actionExecution);

    try {
      const result = await this.actionExecutor.executeAction(action, execution);

      actionExecution.completedAt = new Date();
      actionExecution.status = 'success';
      actionExecution.result = result;

      return { success: true };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      actionExecution.completedAt = new Date();
      actionExecution.status = 'failed';
      actionExecution.error = errorMessage;

      return { success: false, error: errorMessage };
    }
  }

  private shouldEscalate(
    execution: RemediationExecution,
    policy: RemediationPolicy,
    failedActions: number
  ): boolean {
    // Escalate if there are failed critical actions
    const hasCriticalFailures = execution.executedActions.some(action =>
      action.status === 'failed' &&
      policy.immediateActions.find(a => a.id === action.actionId)?.severity === 'critical'
    );

    // Escalate if failure rate is too high
    const failureRate = failedActions / execution.executedActions.length;

    return hasCriticalFailures || failureRate > 0.5 || policy.escalationActions.length > 0;
  }

  private async triggerEscalation(
    execution: RemediationExecution,
    policy: RemediationPolicy
  ): Promise<void> {
    execution.status = 'escalated';
    execution.escalationLevel++;
    execution.escalatedAt = new Date();
    execution.escalationReason = 'Failed immediate actions require escalation';

    await this.escalationManager.triggerEscalation({
      executionId: execution.id,
      violationId: execution.violationId,
      escalationLevel: execution.escalationLevel,
      escalationActions: policy.escalationActions,
      delayMs: policy.escalationDelayMs,
      maxLevel: policy.maxEscalationLevel
    });

    await this.auditLogger.log({
      timestamp: new Date(),
      action: 'remediation_escalated',
      actor: 'system',
      resource: 'remediation_execution',
      resourceId: execution.id,
      outcome: 'success',
      riskLevel: 'high',
      details: {
        violationId: execution.violationId,
        escalationLevel: execution.escalationLevel,
        escalationReason: execution.escalationReason,
        escalationActions: policy.escalationActions.length
      },
      complianceFrameworks: policy.complianceFrameworks
    });
  }

  private async handleEscalation(executionId: string, reason: string): Promise<void> {
    const execution = this.activeExecutions.get(executionId);
    if (!execution) return;

    // Update execution status
    execution.escalationLevel++;
    execution.escalatedAt = new Date();
    execution.escalationReason = reason;

    this.emit('execution_escalated', {
      executionId,
      escalationLevel: execution.escalationLevel,
      reason
    });
  }

  private determineRiskLevel(governanceResult: GovernanceResult): 'low' | 'medium' | 'high' | 'critical' {
    const criticalViolations = governanceResult.policyViolations.filter(v => v.severity === 'critical');
    const highViolations = governanceResult.policyViolations.filter(v => v.severity === 'high');

    if (criticalViolations.length > 0) return 'critical';
    if (highViolations.length > 0) return 'high';
    if (governanceResult.policyViolations.length > 0) return 'medium';
    return 'low';
  }

  private async loadDefaultPolicies(): Promise<void> {
    const defaultPolicies: RemediationPolicy[] = [
      {
        id: 'critical-security-violations',
        name: 'Critical Security Violations',
        description: 'Immediate response for critical security policy violations',
        enabled: true,
        priority: 100,
        policyViolationTypes: ['security-policy', 'data-protection-policy'],
        severityThresholds: ['critical'],
        immediateActions: [
          {
            id: 'block-task-immediate',
            type: 'block_task',
            severity: 'critical',
            description: 'Immediately block the violating task',
            config: { immediate: true, reason: 'Critical security violation detected' }
          },
          {
            id: 'notify-security-team',
            type: 'notify_admin',
            severity: 'high',
            description: 'Notify security team of critical violation',
            config: {
              recipients: ['security-team@urnlabs.ai'],
              urgency: 'critical',
              escalationTimeoutMs: 300000 // 5 minutes
            }
          },
          {
            id: 'create-security-incident',
            type: 'custom',
            severity: 'high',
            description: 'Create security incident for tracking',
            config: {
              action: 'create_incident',
              severity: 'critical',
              assignTo: 'security-team'
            }
          }
        ],
        escalationActions: [
          {
            id: 'suspend-agent-access',
            type: 'suspend_agent',
            severity: 'critical',
            description: 'Suspend agent access pending investigation',
            config: { duration: '24h', reason: 'Critical security violation' }
          }
        ],
        escalationDelayMs: 600000, // 10 minutes
        maxEscalationLevel: 2,
        complianceFrameworks: ['SOX', 'PCI', 'ISO27001'],
        auditRequired: true,
        retentionPeriodDays: 2555 // 7 years for SOX compliance
      },
      {
        id: 'data-protection-violations',
        name: 'Data Protection Violations',
        description: 'Response for data protection and privacy violations',
        enabled: true,
        priority: 90,
        policyViolationTypes: ['data-protection-policy'],
        severityThresholds: ['high', 'critical'],
        immediateActions: [
          {
            id: 'quarantine-data',
            type: 'quarantine_data',
            severity: 'high',
            description: 'Quarantine potentially sensitive data',
            config: { quarantineLocation: 'secure-vault', ttl: '24h' }
          },
          {
            id: 'audit-data-access',
            type: 'audit_log',
            severity: 'medium',
            description: 'Enhanced audit logging for data access',
            config: {
              logLevel: 'detailed',
              complianceFrameworks: ['GDPR', 'CCPA', 'HIPAA']
            }
          }
        ],
        escalationActions: [
          {
            id: 'notify-dpo',
            type: 'notify_admin',
            severity: 'high',
            description: 'Notify Data Protection Officer',
            config: {
              recipients: ['dpo@urnlabs.ai'],
              urgency: 'high',
              complianceRequired: true
            }
          }
        ],
        escalationDelayMs: 1800000, // 30 minutes
        maxEscalationLevel: 1,
        complianceFrameworks: ['GDPR', 'CCPA', 'HIPAA'],
        auditRequired: true,
        retentionPeriodDays: 2555
      },
      {
        id: 'resource-limit-violations',
        name: 'Resource Limit Violations',
        description: 'Response for resource usage limit violations',
        enabled: true,
        priority: 50,
        policyViolationTypes: ['resource-limits-policy'],
        severityThresholds: ['medium', 'high'],
        immediateActions: [
          {
            id: 'throttle-task',
            type: 'custom',
            severity: 'medium',
            description: 'Throttle task execution',
            config: {
              action: 'throttle',
              rate: '50%',
              duration: '15m'
            }
          },
          {
            id: 'notify-ops-team',
            type: 'notify_admin',
            severity: 'low',
            description: 'Notify operations team',
            config: {
              recipients: ['ops-team@urnlabs.ai'],
              urgency: 'medium'
            }
          }
        ],
        escalationActions: [
          {
            id: 'require-manual-approval',
            type: 'require_approval',
            severity: 'medium',
            description: 'Require manual approval for continued execution',
            config: {
              approvers: ['ops-manager@urnlabs.ai'],
              timeoutMs: 3600000 // 1 hour
            }
          }
        ],
        escalationDelayMs: 900000, // 15 minutes
        maxEscalationLevel: 1,
        complianceFrameworks: ['SOX'],
        auditRequired: true,
        retentionPeriodDays: 90
      }
    ];

    for (const policy of defaultPolicies) {
      this.remediationPolicies.set(policy.id, policy);
    }
  }
}