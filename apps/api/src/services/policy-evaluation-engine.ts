import {
  Policy,
  PolicyDefinition,
  PolicyCondition,
  PolicyConditionGroup,
  PolicyAction,
  AccessControlPolicy,
  WorkflowApprovalPolicy,
  DataRetentionPolicy,
  SecurityScanningPolicy,
  CompliancePolicy,
  validatePolicy
} from '../lib/schemas/policy';
import { logger } from '../lib/logger';

/**
 * Context interface for policy evaluation
 */
export interface PolicyEvaluationContext {
  userId: string;
  organizationId: string;
  resource?: string;
  action?: string;
  timestamp: Date;
  requestData?: Record<string, any>;
  userRoles?: string[];
  userPermissions?: string[];
  metadata?: Record<string, any>;
}

/**
 * Result of policy evaluation
 */
export interface PolicyEvaluationResult {
  allowed: boolean;
  policyId: string;
  ruleMatched?: string;
  action: PolicyAction;
  message?: string;
  metadata?: Record<string, any>;
  evaluationTime: number;
  requiresApproval?: boolean;
  approvers?: string[];
  violationSeverity?: 'info' | 'warning' | 'error' | 'critical';
}

/**
 * Aggregated evaluation result for multiple policies
 */
export interface PolicyEvaluationSummary {
  finalDecision: 'allow' | 'deny' | 'require_approval';
  results: PolicyEvaluationResult[];
  blockedBy?: PolicyEvaluationResult[];
  approvalRequired?: PolicyEvaluationResult[];
  warnings?: PolicyEvaluationResult[];
  totalEvaluationTime: number;
  appliedPolicies: number;
}

/**
 * Policy cache entry
 */
interface PolicyCacheEntry {
  policy: Policy;
  lastAccess: Date;
  accessCount: number;
}

/**
 * Core Policy Evaluation Engine
 *
 * Responsible for:
 * - Loading and caching policies
 * - Evaluating policy conditions against context
 * - Executing policy actions
 * - Aggregating multiple policy results
 */
export class PolicyEvaluationEngine {
  private policyCache = new Map<string, PolicyCacheEntry>();
  private readonly cacheMaxSize = 1000;
  private readonly cacheMaxAge = 30 * 60 * 1000; // 30 minutes

  constructor(
    private readonly policyLoader: PolicyLoader,
    private readonly auditLogger: AuditLogger
  ) {}

  /**
   * Evaluate a single policy against the given context
   */
  async evaluatePolicy(
    policy: Policy,
    context: PolicyEvaluationContext
  ): Promise<PolicyEvaluationResult> {
    const startTime = Date.now();

    try {
      // Validate policy structure
      validatePolicy(policy);

      // Check if policy is active and within effective dates
      if (!this.isPolicyActive(policy, context.timestamp)) {
        return {
          allowed: true,
          policyId: policy.metadata.id,
          action: { type: 'allow', message: 'Policy not active' },
          evaluationTime: Date.now() - startTime
        };
      }

      // Evaluate based on policy type
      const result = await this.evaluatePolicyDefinition(
        policy.definition,
        context,
        policy.metadata.id
      );

      // Log evaluation for audit
      await this.auditLogger.logPolicyEvaluation(policy.metadata.id, context, result);

      result.evaluationTime = Date.now() - startTime;
      return result;

    } catch (error) {
      logger.error('Policy evaluation failed', {
        policyId: policy.metadata.id,
        error: error.message,
        context
      });

      return {
        allowed: false,
        policyId: policy.metadata.id,
        action: {
          type: 'deny',
          severity: 'error',
          message: `Policy evaluation error: ${error.message}`
        },
        evaluationTime: Date.now() - startTime
      };
    }
  }

  /**
   * Evaluate multiple policies and aggregate results
   */
  async evaluateMultiplePolicies(
    policyIds: string[],
    context: PolicyEvaluationContext
  ): Promise<PolicyEvaluationSummary> {
    const startTime = Date.now();
    const results: PolicyEvaluationResult[] = [];
    const blockedBy: PolicyEvaluationResult[] = [];
    const approvalRequired: PolicyEvaluationResult[] = [];
    const warnings: PolicyEvaluationResult[] = [];

    // Load and evaluate policies in parallel
    const policies = await Promise.all(
      policyIds.map(id => this.loadPolicy(id))
    );

    const evaluationPromises = policies
      .filter(policy => policy !== null)
      .map(policy => this.evaluatePolicy(policy!, context));

    const evaluationResults = await Promise.all(evaluationPromises);
    results.push(...evaluationResults);

    // Categorize results
    for (const result of evaluationResults) {
      if (!result.allowed) {
        if (result.action.type === 'require_approval') {
          approvalRequired.push(result);
        } else {
          blockedBy.push(result);
        }
      } else if (result.action.severity === 'warning') {
        warnings.push(result);
      }
    }

    // Determine final decision
    let finalDecision: 'allow' | 'deny' | 'require_approval' = 'allow';

    if (blockedBy.length > 0) {
      finalDecision = 'deny';
    } else if (approvalRequired.length > 0) {
      finalDecision = 'require_approval';
    }

    return {
      finalDecision,
      results,
      blockedBy: blockedBy.length > 0 ? blockedBy : undefined,
      approvalRequired: approvalRequired.length > 0 ? approvalRequired : undefined,
      warnings: warnings.length > 0 ? warnings : undefined,
      totalEvaluationTime: Date.now() - startTime,
      appliedPolicies: results.length
    };
  }

  /**
   * Evaluate policies for a specific resource and action
   */
  async evaluateForResource(
    resourceType: string,
    resourceId: string,
    action: string,
    context: PolicyEvaluationContext
  ): Promise<PolicyEvaluationSummary> {
    // Find applicable policies for the resource
    const applicablePolicies = await this.policyLoader.findPoliciesForResource(
      resourceType,
      context.organizationId,
      action
    );

    const enhancedContext: PolicyEvaluationContext = {
      ...context,
      resource: `${resourceType}:${resourceId}`,
      action
    };

    return this.evaluateMultiplePolicies(
      applicablePolicies.map(p => p.metadata.id),
      enhancedContext
    );
  }

  /**
   * Evaluate policy definition based on its type
   */
  private async evaluatePolicyDefinition(
    definition: PolicyDefinition,
    context: PolicyEvaluationContext,
    policyId: string
  ): Promise<PolicyEvaluationResult> {
    switch (definition.type) {
      case 'access_control':
        return this.evaluateAccessControlPolicy(definition, context, policyId);

      case 'workflow_approval':
        return this.evaluateWorkflowApprovalPolicy(definition, context, policyId);

      case 'data_retention':
        return this.evaluateDataRetentionPolicy(definition, context, policyId);

      case 'security_scanning':
        return this.evaluateSecurityScanningPolicy(definition, context, policyId);

      case 'compliance':
        return this.evaluateCompliancePolicy(definition, context, policyId);

      default:
        throw new Error(`Unsupported policy type: ${(definition as any).type}`);
    }
  }

  /**
   * Evaluate access control policy
   */
  private async evaluateAccessControlPolicy(
    policy: AccessControlPolicy,
    context: PolicyEvaluationContext,
    policyId: string
  ): Promise<PolicyEvaluationResult> {
    // Check each rule
    for (const rule of policy.rules) {
      // Check if resource matches
      if (context.resource && !this.matchesResource(rule.resource, context.resource)) {
        continue;
      }

      // Check if action is in required permissions
      if (context.action && !rule.permissions.some(perm =>
        this.matchesPermission(perm, context.action!)
      )) {
        continue;
      }

      // Evaluate conditions
      const conditionResult = await this.evaluateConditions(rule.conditions, context);

      if (conditionResult) {
        return {
          allowed: rule.action.type === 'allow',
          policyId,
          ruleMatched: `${rule.resource}:${rule.permissions.join(',')}`,
          action: rule.action,
          requiresApproval: rule.action.type === 'require_approval'
        };
      }
    }

    // No rules matched, use default action
    return {
      allowed: policy.defaultAction.type === 'allow',
      policyId,
      action: policy.defaultAction,
      requiresApproval: policy.defaultAction.type === 'require_approval'
    };
  }

  /**
   * Evaluate workflow approval policy
   */
  private async evaluateWorkflowApprovalPolicy(
    policy: WorkflowApprovalPolicy,
    context: PolicyEvaluationContext,
    policyId: string
  ): Promise<PolicyEvaluationResult> {
    for (const rule of policy.rules) {
      // Check workflow type
      if (context.metadata?.workflowType !== rule.workflowType) {
        continue;
      }

      // Evaluate conditions
      const conditionResult = await this.evaluateConditions(rule.conditions, context);

      if (conditionResult && rule.approvalRequired) {
        const approvers = rule.approvers
          .filter(approver => approver.required || rule.approvers.length === 1)
          .map(approver => approver.userId || approver.roleId)
          .filter(Boolean) as string[];

        return {
          allowed: false,
          policyId,
          ruleMatched: rule.workflowType,
          action: { type: 'require_approval', message: 'Workflow requires approval' },
          requiresApproval: true,
          approvers
        };
      }
    }

    return {
      allowed: true,
      policyId,
      action: { type: 'allow', message: 'No approval required' }
    };
  }

  /**
   * Evaluate data retention policy
   */
  private async evaluateDataRetentionPolicy(
    policy: DataRetentionPolicy,
    context: PolicyEvaluationContext,
    policyId: string
  ): Promise<PolicyEvaluationResult> {
    for (const rule of policy.rules) {
      // Check data type
      if (context.metadata?.dataType !== rule.dataType) {
        continue;
      }

      // Evaluate conditions if present
      if (rule.conditions) {
        const conditionResult = await this.evaluateConditions(rule.conditions, context);
        if (!conditionResult) {
          continue;
        }
      }

      // Check if data is beyond retention period
      const dataAge = this.calculateDataAge(
        context.metadata?.createdAt || context.timestamp,
        context.timestamp
      );

      const retentionPeriodMs = this.convertToMs(
        rule.retentionPeriod.value,
        rule.retentionPeriod.unit
      );

      if (dataAge > retentionPeriodMs) {
        return {
          allowed: false,
          policyId,
          ruleMatched: rule.dataType,
          action: {
            type: 'block',
            severity: 'warning',
            message: `Data retention period exceeded. Action required: ${rule.action.type}`
          },
          metadata: {
            retentionAction: rule.action.type,
            retentionLocation: rule.action.location
          }
        };
      }
    }

    return {
      allowed: true,
      policyId,
      action: { type: 'allow', message: 'Within retention period' }
    };
  }

  /**
   * Evaluate security scanning policy
   */
  private async evaluateSecurityScanningPolicy(
    policy: SecurityScanningPolicy,
    context: PolicyEvaluationContext,
    policyId: string
  ): Promise<PolicyEvaluationResult> {
    for (const rule of policy.rules) {
      // Check if target matches
      if (!rule.targets.includes(context.resource || '')) {
        continue;
      }

      // Evaluate conditions if present
      if (rule.conditions) {
        const conditionResult = await this.evaluateConditions(rule.conditions, context);
        if (!conditionResult) {
          continue;
        }
      }

      // For security scanning, typically this would trigger scans
      // Here we return the configured action
      return {
        allowed: rule.action.type === 'allow',
        policyId,
        ruleMatched: `${rule.scanType}:${rule.targets.join(',')}`,
        action: rule.action,
        metadata: {
          scanType: rule.scanType,
          schedule: rule.schedule
        }
      };
    }

    return {
      allowed: true,
      policyId,
      action: { type: 'allow', message: 'No security scanning required' }
    };
  }

  /**
   * Evaluate compliance policy
   */
  private async evaluateCompliancePolicy(
    policy: CompliancePolicy,
    context: PolicyEvaluationContext,
    policyId: string
  ): Promise<PolicyEvaluationResult> {
    for (const rule of policy.rules) {
      // Evaluate conditions if present
      if (rule.conditions) {
        const conditionResult = await this.evaluateConditions(rule.conditions, context);
        if (!conditionResult) {
          continue;
        }
      }

      // For compliance policies, usually they define requirements
      return {
        allowed: rule.action.type === 'allow',
        policyId,
        ruleMatched: rule.controlId,
        action: rule.action,
        metadata: {
          framework: policy.framework,
          controlId: rule.controlId,
          requirement: rule.requirement,
          evidenceRequired: rule.evidenceRequired
        }
      };
    }

    return {
      allowed: true,
      policyId,
      action: { type: 'allow', message: 'Compliance requirements met' }
    };
  }

  /**
   * Evaluate policy conditions against context
   */
  private async evaluateConditions(
    conditionGroup: PolicyConditionGroup,
    context: PolicyEvaluationContext
  ): Promise<boolean> {
    const results: boolean[] = [];

    // Evaluate all direct conditions
    for (const condition of conditionGroup.conditions) {
      const result = await this.evaluateCondition(condition, context);
      results.push(result);
    }

    // Evaluate nested condition groups
    if (conditionGroup.nested) {
      for (const nestedGroup of conditionGroup.nested) {
        const result = await this.evaluateConditions(nestedGroup, context);
        results.push(result);
      }
    }

    // Apply logical operator
    if (conditionGroup.logicalOperator === 'OR') {
      return results.some(result => result);
    } else {
      return results.every(result => result);
    }
  }

  /**
   * Evaluate a single condition
   */
  private async evaluateCondition(
    condition: PolicyCondition,
    context: PolicyEvaluationContext
  ): Promise<boolean> {
    const contextValue = this.getContextValue(condition.field, context);

    switch (condition.operator) {
      case 'equals':
        return contextValue === condition.value;

      case 'not_equals':
        return contextValue !== condition.value;

      case 'contains':
        return String(contextValue).includes(String(condition.value));

      case 'not_contains':
        return !String(contextValue).includes(String(condition.value));

      case 'greater_than':
        return Number(contextValue) > Number(condition.value);

      case 'less_than':
        return Number(contextValue) < Number(condition.value);

      case 'in':
        return Array.isArray(condition.value) &&
               condition.value.includes(String(contextValue));

      case 'not_in':
        return Array.isArray(condition.value) &&
               !condition.value.includes(String(contextValue));

      case 'exists':
        return contextValue !== undefined && contextValue !== null;

      case 'not_exists':
        return contextValue === undefined || contextValue === null;

      default:
        throw new Error(`Unsupported operator: ${condition.operator}`);
    }
  }

  /**
   * Extract value from context based on field path
   */
  private getContextValue(fieldPath: string, context: PolicyEvaluationContext): any {
    const keys = fieldPath.split('.');
    let value: any = context;

    for (const key of keys) {
      if (value && typeof value === 'object') {
        value = value[key];
      } else {
        return undefined;
      }
    }

    return value;
  }

  /**
   * Check if policy is currently active
   */
  private isPolicyActive(policy: Policy, timestamp: Date): boolean {
    const { status, effectiveDate, expirationDate } = policy.metadata;

    if (status !== 'active') {
      return false;
    }

    if (timestamp < effectiveDate) {
      return false;
    }

    if (expirationDate && timestamp > expirationDate) {
      return false;
    }

    return true;
  }

  /**
   * Load policy with caching
   */
  private async loadPolicy(policyId: string): Promise<Policy | null> {
    // Check cache first
    const cached = this.policyCache.get(policyId);

    if (cached && this.isCacheValid(cached)) {
      cached.lastAccess = new Date();
      cached.accessCount++;
      return cached.policy;
    }

    // Load from storage
    try {
      const policy = await this.policyLoader.loadPolicy(policyId);

      if (policy) {
        this.cachePolicy(policyId, policy);
      }

      return policy;
    } catch (error) {
      logger.error('Failed to load policy', { policyId, error: error.message });
      return null;
    }
  }

  /**
   * Cache policy with size management
   */
  private cachePolicy(policyId: string, policy: Policy): void {
    // Manage cache size
    if (this.policyCache.size >= this.cacheMaxSize) {
      this.evictOldestCacheEntry();
    }

    this.policyCache.set(policyId, {
      policy,
      lastAccess: new Date(),
      accessCount: 1
    });
  }

  /**
   * Check if cache entry is still valid
   */
  private isCacheValid(entry: PolicyCacheEntry): boolean {
    const age = Date.now() - entry.lastAccess.getTime();
    return age < this.cacheMaxAge;
  }

  /**
   * Evict oldest cache entry
   */
  private evictOldestCacheEntry(): void {
    let oldestId: string | null = null;
    let oldestTime = Date.now();

    for (const [id, entry] of this.policyCache.entries()) {
      if (entry.lastAccess.getTime() < oldestTime) {
        oldestTime = entry.lastAccess.getTime();
        oldestId = id;
      }
    }

    if (oldestId) {
      this.policyCache.delete(oldestId);
    }
  }

  /**
   * Utility methods
   */
  private matchesResource(pattern: string, resource: string): boolean {
    // Simple pattern matching - can be enhanced with regex or glob patterns
    return pattern === '*' || pattern === resource || resource.startsWith(pattern);
  }

  private matchesPermission(permission: string, action: string): boolean {
    return permission === '*' || permission === action;
  }

  private calculateDataAge(createdAt: Date, currentTime: Date): number {
    return currentTime.getTime() - createdAt.getTime();
  }

  private convertToMs(value: number, unit: string): number {
    switch (unit) {
      case 'days': return value * 24 * 60 * 60 * 1000;
      case 'months': return value * 30 * 24 * 60 * 60 * 1000;
      case 'years': return value * 365 * 24 * 60 * 60 * 1000;
      default: throw new Error(`Unsupported time unit: ${unit}`);
    }
  }

  /**
   * Clear cache - useful for testing or policy updates
   */
  clearCache(): void {
    this.policyCache.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; hitRate: number } {
    const totalAccess = Array.from(this.policyCache.values())
      .reduce((sum, entry) => sum + entry.accessCount, 0);

    return {
      size: this.policyCache.size,
      hitRate: totalAccess > 0 ? this.policyCache.size / totalAccess : 0
    };
  }
}

/**
 * Interface for loading policies from storage
 */
export interface PolicyLoader {
  loadPolicy(policyId: string): Promise<Policy | null>;
  findPoliciesForResource(
    resourceType: string,
    organizationId: string,
    action?: string
  ): Promise<Policy[]>;
}

/**
 * Interface for audit logging
 */
export interface AuditLogger {
  logPolicyEvaluation(
    policyId: string,
    context: PolicyEvaluationContext,
    result: PolicyEvaluationResult
  ): Promise<void>;
}