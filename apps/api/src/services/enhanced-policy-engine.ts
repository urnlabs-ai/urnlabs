import { PrismaClient } from '@prisma/client';
import { 
  Policy, 
  PolicyDefinition, 
  PolicyCondition,
  PolicyConditionGroup,
  PolicyAction,
  validatePolicy,
  validatePolicyDefinition,
  PolicyValidationError,
  POLICY_SCHEMA_VERSION
} from '../lib/schemas/policy.js';
import { logger } from '../lib/logger.js';
import { EventEmitter } from 'events';
import { z } from 'zod';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

/**
 * Enhanced Policy Evaluation Context
 */
export interface EnhancedPolicyEvaluationContext {
  // Core context
  userId: string;
  organizationId: string;
  sessionId?: string;
  requestId?: string;

  // Resource context
  resource?: {
    type: string;
    id: string;
    attributes?: Record<string, any>;
  };

  // Action context
  action?: {
    type: string;
    method?: string;
    parameters?: Record<string, any>;
  };

  // Request metadata
  request?: {
    ipAddress?: string;
    userAgent?: string;
    timestamp: Date;
    endpoint?: string;
    httpMethod?: string;
    headers?: Record<string, string>;
    body?: any;
  };

  // User context
  user?: {
    roles: string[];
    permissions: string[];
    groups?: string[];
    attributes?: Record<string, any>;
    mfaVerified?: boolean;
    lastLogin?: Date;
  };

  // Environment context
  environment?: {
    name: string; // development, staging, production
    region?: string;
    dataCenter?: string;
    compliance?: string[];
  };

  // Business context
  business?: {
    department?: string;
    project?: string;
    costCenter?: string;
    budget?: number;
    approvalChain?: string[];
  };

  // Temporal context
  temporal?: {
    timezone?: string;
    businessHours?: boolean;
    holiday?: boolean;
    workday?: boolean;
  };

  // Additional metadata
  metadata?: Record<string, any>;
}

/**
 * Enhanced Policy Evaluation Result
 */
export interface EnhancedPolicyEvaluationResult {
  // Core result
  decision: 'allow' | 'deny' | 'require_approval' | 'conditional_allow';
  policyId: string;
  ruleId?: string;
  confidence: number; // 0.0 to 1.0

  // Detailed information
  reasoning: string;
  appliedRules: string[];
  conditions: {
    matched: PolicyCondition[];
    failed: PolicyCondition[];
  };

  // Actions and requirements
  actions: PolicyAction[];
  requirements?: {
    approvers?: string[];
    conditions?: string[];
    timeout?: Date;
    escalation?: string[];
  };

  // Compliance and risk
  complianceFrameworks: string[];
  riskScore: number; // 0.0 to 10.0
  violationSeverity?: 'info' | 'warning' | 'error' | 'critical';

  // Performance metrics
  evaluationTime: number;
  cacheHit: boolean;
  
  // Audit trail
  auditTrail: {
    policyVersion: string;
    schemaVersion: string;
    evaluationId: string;
    timestamp: Date;
  };

  // Additional metadata
  metadata?: Record<string, any>;
}

/**
 * Policy Evaluation Cache Entry
 */
interface PolicyCacheEntry {
  policy: Policy;
  compiledRules?: CompiledPolicyRule[];
  lastAccess: Date;
  accessCount: number;
  validUntil: Date;
  hitCount: number;
}

/**
 * Compiled Policy Rule for Performance
 */
interface CompiledPolicyRule {
  ruleId: string;
  conditions: CompiledCondition[];
  action: PolicyAction;
  priority: number;
  resourcePatterns: RegExp[];
  actionPatterns: RegExp[];
}

/**
 * Compiled Condition for Fast Evaluation
 */
interface CompiledCondition {
  conditionId: string;
  fieldPath: string[];
  operator: string;
  value: any;
  compiledRegex?: RegExp;
  evaluator: (contextValue: any) => boolean;
}

/**
 * Enhanced Rule-Based Policy Evaluation Engine
 *
 * Implements Task 5.1 requirements:
 * - Core policy evaluation engine with JSON Schema validation
 * - Custom business logic processing with complex conditional statements
 * - Policy execution context with comprehensive request metadata
 * - Performance optimization with compiled rules and multi-level caching
 */
export class EnhancedPolicyEvaluationEngine extends EventEmitter {
  private readonly ajv: Ajv;
  private readonly policyCache = new Map<string, PolicyCacheEntry>();
  private readonly evaluationCache = new Map<string, EnhancedPolicyEvaluationResult>();
  private readonly ruleCompilerCache = new Map<string, CompiledPolicyRule[]>();
  
  // Performance configuration
  private readonly maxPolicyCacheSize = 10000;
  private readonly maxEvaluationCacheSize = 50000;
  private readonly policyTTL = 30 * 60 * 1000; // 30 minutes
  private readonly evaluationTTL = 5 * 60 * 1000; // 5 minutes
  
  // Statistics
  private stats = {
    evaluations: 0,
    cacheHits: 0,
    cacheMisses: 0,
    compilationTime: 0,
    evaluationTime: 0,
    errors: 0
  };

  constructor(
    private readonly prisma: PrismaClient,
    private readonly config: {
      enableCaching?: boolean;
      enableCompilation?: boolean;
      enableValidation?: boolean;
      performanceMode?: 'standard' | 'optimized' | 'ultra';
      maxConcurrentEvaluations?: number;
    } = {}
  ) {
    super();

    // Initialize AJV for JSON Schema validation
    this.ajv = new Ajv({
      allErrors: true,
      verbose: true,
      strict: false,
      removeAdditional: false,
      useDefaults: true,
      coerceTypes: true
    });
    addFormats(this.ajv);

    // Set default configuration
    this.config = {
      enableCaching: true,
      enableCompilation: true,
      enableValidation: true,
      performanceMode: 'optimized',
      maxConcurrentEvaluations: 100,
      ...config
    };

    // Start background optimization
    this.startBackgroundOptimization();
  }

  /**
   * Enhanced policy evaluation with comprehensive context processing
   */
  async evaluatePolicy(
    policyId: string,
    context: EnhancedPolicyEvaluationContext
  ): Promise<EnhancedPolicyEvaluationResult> {
    const startTime = performance.now();
    const evaluationId = crypto.randomUUID();

    try {
      this.stats.evaluations++;

      // Generate cache key for the evaluation
      const cacheKey = this.generateEvaluationCacheKey(policyId, context);
      
      // Check evaluation cache first
      if (this.config.enableCaching) {
        const cachedResult = this.evaluationCache.get(cacheKey);
        if (cachedResult && this.isEvaluationCacheValid(cachedResult)) {
          this.stats.cacheHits++;
          cachedResult.cacheHit = true;
          return cachedResult;
        }
      }

      this.stats.cacheMisses++;

      // Load and validate policy
      const policy = await this.loadAndValidatePolicy(policyId);
      if (!policy) {
        throw new Error(`Policy not found: ${policyId}`);
      }

      // Enhance context with additional metadata
      const enhancedContext = await this.enhanceContext(context);

      // Compile policy rules for performance
      const compiledRules = await this.compilePolicy(policy);

      // Evaluate policy using compiled rules
      const result = await this.evaluateCompiledPolicy(
        policy,
        compiledRules,
        enhancedContext,
        evaluationId
      );

      // Cache the result
      if (this.config.enableCaching) {
        this.cacheEvaluationResult(cacheKey, result);
      }

      // Update performance metrics
      result.evaluationTime = performance.now() - startTime;
      this.stats.evaluationTime += result.evaluationTime;

      // Emit evaluation event for monitoring
      this.emit('policyEvaluated', {
        policyId,
        evaluationId,
        context: enhancedContext,
        result,
        performance: {
          evaluationTime: result.evaluationTime,
          cacheHit: result.cacheHit
        }
      });

      return result;

    } catch (error) {
      this.stats.errors++;
      
      logger.error('Enhanced policy evaluation failed', {
        policyId,
        evaluationId,
        error: error.message,
        stack: error.stack,
        context: {
          userId: context.userId,
          organizationId: context.organizationId,
          resource: context.resource,
          action: context.action
        }
      });

      // Return denial result for security
      return {
        decision: 'deny',
        policyId,
        confidence: 0.0,
        reasoning: `Policy evaluation failed: ${error.message}`,
        appliedRules: [],
        conditions: { matched: [], failed: [] },
        actions: [{
          type: 'deny',
          severity: 'error',
          message: 'Policy evaluation error - access denied for security'
        }],
        complianceFrameworks: [],
        riskScore: 10.0,
        violationSeverity: 'critical',
        evaluationTime: performance.now() - startTime,
        cacheHit: false,
        auditTrail: {
          policyVersion: 'unknown',
          schemaVersion: POLICY_SCHEMA_VERSION,
          evaluationId,
          timestamp: new Date()
        }
      };
    }
  }

  /**
   * Bulk policy evaluation with performance optimization
   */
  async evaluateMultiplePolicies(
    policyIds: string[],
    context: EnhancedPolicyEvaluationContext
  ): Promise<{
    aggregatedResult: EnhancedPolicyEvaluationResult;
    individualResults: EnhancedPolicyEvaluationResult[];
    summary: {
      allowed: number;
      denied: number;
      requireApproval: number;
      conditionalAllow: number;
      totalEvaluationTime: number;
    };
  }> {
    const startTime = performance.now();
    
    // Evaluate policies in parallel with concurrency control
    const concurrencyLimit = this.config.maxConcurrentEvaluations || 10;
    const chunks = this.chunkArray(policyIds, concurrencyLimit);
    const allResults: EnhancedPolicyEvaluationResult[] = [];

    for (const chunk of chunks) {
      const chunkResults = await Promise.all(
        chunk.map(policyId => this.evaluatePolicy(policyId, context))
      );
      allResults.push(...chunkResults);
    }

    // Aggregate results using business logic
    const aggregatedResult = this.aggregatePolicyResults(allResults, context);
    
    // Calculate summary statistics
    const summary = {
      allowed: allResults.filter(r => r.decision === 'allow').length,
      denied: allResults.filter(r => r.decision === 'deny').length,
      requireApproval: allResults.filter(r => r.decision === 'require_approval').length,
      conditionalAllow: allResults.filter(r => r.decision === 'conditional_allow').length,
      totalEvaluationTime: performance.now() - startTime
    };

    return {
      aggregatedResult,
      individualResults: allResults,
      summary
    };
  }

  /**
   * Load and validate policy with caching
   */
  private async loadAndValidatePolicy(policyId: string): Promise<Policy | null> {
    // Check policy cache
    if (this.config.enableCaching) {
      const cached = this.policyCache.get(policyId);
      if (cached && this.isPolicyCacheValid(cached)) {
        cached.lastAccess = new Date();
        cached.accessCount++;
        cached.hitCount++;
        return cached.policy;
      }
    }

    // Load from database
    const policyRecord = await this.prisma.policy.findUnique({
      where: { id: policyId },
      include: {
        versions: {
          orderBy: { changedAt: 'desc' },
          take: 1
        }
      }
    });

    if (!policyRecord) {
      return null;
    }

    // Transform database record to Policy schema
    const policy: Policy = {
      metadata: {
        id: policyRecord.id,
        name: policyRecord.name,
        description: policyRecord.description || '',
        version: policyRecord.version,
        createdAt: policyRecord.createdAt,
        updatedAt: policyRecord.updatedAt,
        createdBy: policyRecord.createdBy,
        updatedBy: policyRecord.updatedBy,
        organizationId: policyRecord.organizationId,
        classification: policyRecord.classification as any,
        owner: policyRecord.ownerId || policyRecord.createdBy,
        tags: policyRecord.tags,
        status: policyRecord.status as any,
        effectiveDate: policyRecord.effectiveDate,
        expirationDate: policyRecord.expirationDate || undefined,
        complianceFrameworks: policyRecord.complianceFrameworks as any[],
        riskLevel: policyRecord.riskLevel as any
      },
      definition: policyRecord.rules as PolicyDefinition
    };

    // Validate policy if enabled
    if (this.config.enableValidation) {
      try {
        validatePolicy(policy);
      } catch (error) {
        logger.error('Policy validation failed', {
          policyId,
          error: error.message
        });
        throw error;
      }
    }

    // Cache the validated policy
    if (this.config.enableCaching) {
      this.cachePolicyWithManagement(policyId, policy);
    }

    return policy;
  }

  /**
   * Compile policy for optimized evaluation
   */
  private async compilePolicy(policy: Policy): Promise<CompiledPolicyRule[]> {
    const cacheKey = `${policy.metadata.id}:${policy.metadata.version}`;
    
    // Check compilation cache
    if (this.config.enableCompilation) {
      const cached = this.ruleCompilerCache.get(cacheKey);
      if (cached) {
        return cached;
      }
    }

    const startTime = performance.now();
    const compiledRules: CompiledPolicyRule[] = [];

    // Compile based on policy type
    switch (policy.definition.type) {
      case 'access_control':
        compiledRules.push(...this.compileAccessControlRules(policy.definition));
        break;
      case 'workflow_approval':
        compiledRules.push(...this.compileWorkflowApprovalRules(policy.definition));
        break;
      case 'data_retention':
        compiledRules.push(...this.compileDataRetentionRules(policy.definition));
        break;
      case 'security_scanning':
        compiledRules.push(...this.compileSecurityScanningRules(policy.definition));
        break;
      case 'compliance':
        compiledRules.push(...this.compileComplianceRules(policy.definition));
        break;
    }

    // Cache compiled rules
    if (this.config.enableCompilation) {
      this.ruleCompilerCache.set(cacheKey, compiledRules);
    }

    this.stats.compilationTime += performance.now() - startTime;
    
    return compiledRules;
  }

  /**
   * Compile access control rules for fast evaluation
   */
  private compileAccessControlRules(definition: any): CompiledPolicyRule[] {
    const rules: CompiledPolicyRule[] = [];

    definition.rules.forEach((rule: any, index: number) => {
      const compiledRule: CompiledPolicyRule = {
        ruleId: `access_control_${index}`,
        conditions: this.compileConditions(rule.conditions),
        action: rule.action,
        priority: 100 - index, // Higher priority for earlier rules
        resourcePatterns: [new RegExp(this.globToRegex(rule.resource))],
        actionPatterns: rule.permissions.map((perm: string) => new RegExp(this.globToRegex(perm)))
      };

      rules.push(compiledRule);
    });

    return rules;
  }

  /**
   * Compile workflow approval rules
   */
  private compileWorkflowApprovalRules(definition: any): CompiledPolicyRule[] {
    const rules: CompiledPolicyRule[] = [];

    definition.rules.forEach((rule: any, index: number) => {
      const compiledRule: CompiledPolicyRule = {
        ruleId: `workflow_approval_${index}`,
        conditions: this.compileConditions(rule.conditions),
        action: rule.approvalRequired ? 
          { type: 'require_approval', data: { approvers: rule.approvers } } :
          { type: 'allow' },
        priority: 100 - index,
        resourcePatterns: [new RegExp(this.globToRegex(rule.workflowType))],
        actionPatterns: [/.*$/] // Match all actions
      };

      rules.push(compiledRule);
    });

    return rules;
  }

  /**
   * Compile data retention rules
   */
  private compileDataRetentionRules(definition: any): CompiledPolicyRule[] {
    const rules: CompiledPolicyRule[] = [];

    definition.rules.forEach((rule: any, index: number) => {
      const compiledRule: CompiledPolicyRule = {
        ruleId: `data_retention_${index}`,
        conditions: rule.conditions ? this.compileConditions(rule.conditions) : [],
        action: { 
          type: 'audit',
          data: { 
            retentionAction: rule.action.type,
            retentionPeriod: rule.retentionPeriod
          }
        },
        priority: 100 - index,
        resourcePatterns: [new RegExp(this.globToRegex(rule.dataType))],
        actionPatterns: [/.*$/]
      };

      rules.push(compiledRule);
    });

    return rules;
  }

  /**
   * Compile security scanning rules
   */
  private compileSecurityScanningRules(definition: any): CompiledPolicyRule[] {
    const rules: CompiledPolicyRule[] = [];

    definition.rules.forEach((rule: any, index: number) => {
      const compiledRule: CompiledPolicyRule = {
        ruleId: `security_scanning_${index}`,
        conditions: rule.conditions ? this.compileConditions(rule.conditions) : [],
        action: rule.action,
        priority: 100 - index,
        resourcePatterns: rule.targets.map((target: string) => new RegExp(this.globToRegex(target))),
        actionPatterns: [new RegExp(this.globToRegex(rule.scanType))]
      };

      rules.push(compiledRule);
    });

    return rules;
  }

  /**
   * Compile compliance rules
   */
  private compileComplianceRules(definition: any): CompiledPolicyRule[] {
    const rules: CompiledPolicyRule[] = [];

    definition.rules.forEach((rule: any, index: number) => {
      const compiledRule: CompiledPolicyRule = {
        ruleId: `compliance_${index}`,
        conditions: rule.conditions ? this.compileConditions(rule.conditions) : [],
        action: rule.action,
        priority: 100 - index,
        resourcePatterns: [/.*$/], // Compliance rules typically apply broadly
        actionPatterns: [/.*$/]
      };

      rules.push(compiledRule);
    });

    return rules;
  }

  /**
   * Compile condition groups into optimized evaluators
   */
  private compileConditions(conditionGroup: PolicyConditionGroup): CompiledCondition[] {
    const compiled: CompiledCondition[] = [];

    conditionGroup.conditions.forEach((condition, index) => {
      const compiledCondition: CompiledCondition = {
        conditionId: `condition_${index}`,
        fieldPath: condition.field.split('.'),
        operator: condition.operator,
        value: condition.value,
        evaluator: this.createConditionEvaluator(condition)
      };

      // Pre-compile regex patterns for string operations
      if (condition.operator === 'contains' || condition.operator === 'not_contains') {
        if (typeof condition.value === 'string') {
          compiledCondition.compiledRegex = new RegExp(this.escapeRegex(condition.value), 'i');
        }
      }

      compiled.push(compiledCondition);
    });

    // Handle nested conditions recursively
    if (conditionGroup.nested) {
      for (const nestedGroup of conditionGroup.nested) {
        compiled.push(...this.compileConditions(nestedGroup));
      }
    }

    return compiled;
  }

  /**
   * Create optimized condition evaluator function
   */
  private createConditionEvaluator(condition: PolicyCondition): (contextValue: any) => boolean {
    switch (condition.operator) {
      case 'equals':
        return (contextValue) => contextValue === condition.value;
      
      case 'not_equals':
        return (contextValue) => contextValue !== condition.value;
      
      case 'contains':
        return (contextValue) => String(contextValue).toLowerCase().includes(String(condition.value).toLowerCase());
      
      case 'not_contains':
        return (contextValue) => !String(contextValue).toLowerCase().includes(String(condition.value).toLowerCase());
      
      case 'greater_than':
        return (contextValue) => Number(contextValue) > Number(condition.value);
      
      case 'less_than':
        return (contextValue) => Number(contextValue) < Number(condition.value);
      
      case 'in':
        const inValues = Array.isArray(condition.value) ? condition.value : [condition.value];
        return (contextValue) => inValues.includes(String(contextValue));
      
      case 'not_in':
        const notInValues = Array.isArray(condition.value) ? condition.value : [condition.value];
        return (contextValue) => !notInValues.includes(String(contextValue));
      
      case 'exists':
        return (contextValue) => contextValue !== undefined && contextValue !== null;
      
      case 'not_exists':
        return (contextValue) => contextValue === undefined || contextValue === null;
      
      default:
        throw new Error(`Unsupported operator: ${condition.operator}`);
    }
  }

  /**
   * Evaluate compiled policy with optimized performance
   */
  private async evaluateCompiledPolicy(
    policy: Policy,
    compiledRules: CompiledPolicyRule[],
    context: EnhancedPolicyEvaluationContext,
    evaluationId: string
  ): Promise<EnhancedPolicyEvaluationResult> {
    const appliedRules: string[] = [];
    const matchedConditions: PolicyCondition[] = [];
    const failedConditions: PolicyCondition[] = [];
    const actions: PolicyAction[] = [];
    let finalDecision: 'allow' | 'deny' | 'require_approval' | 'conditional_allow' = 'allow';
    let confidence = 1.0;
    let riskScore = 0.0;
    let reasoning = 'No applicable rules found - default allow';

    // Sort rules by priority for evaluation order
    const sortedRules = compiledRules.sort((a, b) => b.priority - a.priority);

    for (const rule of sortedRules) {
      // Check if rule applies to current resource/action
      if (!this.ruleApplies(rule, context)) {
        continue;
      }

      // Evaluate rule conditions
      const conditionResults = await this.evaluateRuleConditions(rule, context);
      
      if (conditionResults.allMatched) {
        appliedRules.push(rule.ruleId);
        matchedConditions.push(...conditionResults.matched);
        actions.push(rule.action);

        // Update decision based on rule action
        if (rule.action.type === 'deny') {
          finalDecision = 'deny';
          confidence = Math.max(confidence, 0.95);
          riskScore = Math.max(riskScore, 8.0);
          reasoning = `Access denied by rule ${rule.ruleId}: ${rule.action.message || 'No message'}`;
          break; // Deny rules are final
        } else if (rule.action.type === 'require_approval') {
          finalDecision = 'require_approval';
          confidence = Math.max(confidence, 0.9);
          riskScore = Math.max(riskScore, 5.0);
          reasoning = `Approval required by rule ${rule.ruleId}: ${rule.action.message || 'No message'}`;
        } else if (rule.action.type === 'allow') {
          if (finalDecision === 'allow') {
            reasoning = `Access allowed by rule ${rule.ruleId}: ${rule.action.message || 'No message'}`;
          }
          confidence = Math.max(confidence, 0.8);
          riskScore = Math.max(riskScore, 1.0);
        }
      } else {
        failedConditions.push(...conditionResults.failed);
      }
    }

    // Calculate final confidence and risk scores
    confidence = this.calculateConfidence(appliedRules.length, compiledRules.length, context);
    riskScore = this.calculateRiskScore(finalDecision, policy, context);

    return {
      decision: finalDecision,
      policyId: policy.metadata.id,
      ruleId: appliedRules[0],
      confidence,
      reasoning,
      appliedRules,
      conditions: {
        matched: matchedConditions,
        failed: failedConditions
      },
      actions,
      complianceFrameworks: policy.metadata.complianceFrameworks,
      riskScore,
      violationSeverity: this.determineViolationSeverity(finalDecision, riskScore),
      evaluationTime: 0, // Will be set by caller
      cacheHit: false,
      auditTrail: {
        policyVersion: policy.metadata.version,
        schemaVersion: POLICY_SCHEMA_VERSION,
        evaluationId,
        timestamp: new Date()
      }
    };
  }

  /**
   * Check if a compiled rule applies to the current context
   */
  private ruleApplies(rule: CompiledPolicyRule, context: EnhancedPolicyEvaluationContext): boolean {
    // Check resource patterns
    if (context.resource) {
      const resourceString = `${context.resource.type}:${context.resource.id}`;
      const resourceMatches = rule.resourcePatterns.some(pattern => pattern.test(resourceString));
      if (!resourceMatches) {
        return false;
      }
    }

    // Check action patterns  
    if (context.action) {
      const actionString = context.action.type;
      const actionMatches = rule.actionPatterns.some(pattern => pattern.test(actionString));
      if (!actionMatches) {
        return false;
      }
    }

    return true;
  }

  /**
   * Evaluate rule conditions with compiled evaluators
   */
  private async evaluateRuleConditions(
    rule: CompiledPolicyRule,
    context: EnhancedPolicyEvaluationContext
  ): Promise<{
    allMatched: boolean;
    matched: PolicyCondition[];
    failed: PolicyCondition[];
  }> {
    const matched: PolicyCondition[] = [];
    const failed: PolicyCondition[] = [];
    let allMatched = true;

    for (const condition of rule.conditions) {
      const contextValue = this.getContextValue(condition.fieldPath, context);
      const conditionMatched = condition.evaluator(contextValue);

      const policyCondition: PolicyCondition = {
        field: condition.fieldPath.join('.'),
        operator: condition.operator as any,
        value: condition.value
      };

      if (conditionMatched) {
        matched.push(policyCondition);
      } else {
        failed.push(policyCondition);
        allMatched = false;
      }
    }

    return { allMatched, matched, failed };
  }

  /**
   * Extract value from context using compiled field path
   */
  private getContextValue(fieldPath: string[], context: EnhancedPolicyEvaluationContext): any {
    let value: any = context;

    for (const key of fieldPath) {
      if (value && typeof value === 'object') {
        value = value[key];
      } else {
        return undefined;
      }
    }

    return value;
  }

  /**
   * Enhance context with additional metadata and computed values
   */
  private async enhanceContext(
    context: EnhancedPolicyEvaluationContext
  ): Promise<EnhancedPolicyEvaluationContext> {
    const enhanced = { ...context };

    // Add computed temporal context
    if (!enhanced.temporal) {
      enhanced.temporal = {
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        businessHours: this.isBusinessHours(enhanced.request?.timestamp || new Date()),
        holiday: false, // Could be enhanced with holiday API
        workday: this.isWorkday(enhanced.request?.timestamp || new Date())
      };
    }

    // Enhance user context with additional data if needed
    if (enhanced.userId && enhanced.organizationId) {
      try {
        const userDetails = await this.prisma.user.findUnique({
          where: { id: enhanced.userId },
          select: {
            roles: {
              select: {
                role: {
                  select: { name: true }
                }
              }
            },
            permissions: {
              select: { permission: true }
            },
            lastLoginAt: true,
            mfaEnabled: true
          }
        });

        if (userDetails) {
          enhanced.user = {
            ...enhanced.user,
            roles: enhanced.user?.roles || userDetails.roles.map(r => r.role.name),
            permissions: enhanced.user?.permissions || userDetails.permissions.map(p => p.permission),
            mfaVerified: userDetails.mfaEnabled,
            lastLogin: userDetails.lastLoginAt || undefined
          };
        }
      } catch (error) {
        logger.warn('Failed to enhance user context', {
          userId: enhanced.userId,
          error: error.message
        });
      }
    }

    return enhanced;
  }

  /**
   * Aggregate multiple policy results using business logic
   */
  private aggregatePolicyResults(
    results: EnhancedPolicyEvaluationResult[],
    context: EnhancedPolicyEvaluationContext
  ): EnhancedPolicyEvaluationResult {
    // Business logic for aggregation:
    // 1. Any DENY result makes the final decision DENY
    // 2. Any REQUIRE_APPROVAL without DENY makes it REQUIRE_APPROVAL  
    // 3. All ALLOW makes it ALLOW
    // 4. Mix of ALLOW and CONDITIONAL_ALLOW makes it CONDITIONAL_ALLOW

    const decisions = results.map(r => r.decision);
    const hasDeny = decisions.includes('deny');
    const hasRequireApproval = decisions.includes('require_approval');
    const hasConditionalAllow = decisions.includes('conditional_allow');

    let finalDecision: 'allow' | 'deny' | 'require_approval' | 'conditional_allow';

    if (hasDeny) {
      finalDecision = 'deny';
    } else if (hasRequireApproval) {
      finalDecision = 'require_approval';
    } else if (hasConditionalAllow) {
      finalDecision = 'conditional_allow';
    } else {
      finalDecision = 'allow';
    }

    // Aggregate other fields
    const allActions = results.flatMap(r => r.actions);
    const allAppliedRules = results.flatMap(r => r.appliedRules);
    const allMatchedConditions = results.flatMap(r => r.conditions.matched);
    const allFailedConditions = results.flatMap(r => r.conditions.failed);
    const maxRiskScore = Math.max(...results.map(r => r.riskScore));
    const avgConfidence = results.reduce((sum, r) => sum + r.confidence, 0) / results.length;
    const totalEvaluationTime = results.reduce((sum, r) => sum + r.evaluationTime, 0);

    return {
      decision: finalDecision,
      policyId: 'aggregated',
      confidence: avgConfidence,
      reasoning: this.generateAggregatedReasoning(results, finalDecision),
      appliedRules: allAppliedRules,
      conditions: {
        matched: allMatchedConditions,
        failed: allFailedConditions
      },
      actions: allActions,
      complianceFrameworks: [...new Set(results.flatMap(r => r.complianceFrameworks))],
      riskScore: maxRiskScore,
      violationSeverity: this.determineViolationSeverity(finalDecision, maxRiskScore),
      evaluationTime: totalEvaluationTime,
      cacheHit: results.every(r => r.cacheHit),
      auditTrail: {
        policyVersion: 'aggregated',
        schemaVersion: POLICY_SCHEMA_VERSION,
        evaluationId: crypto.randomUUID(),
        timestamp: new Date()
      }
    };
  }

  // Utility methods
  private generateEvaluationCacheKey(
    policyId: string,
    context: EnhancedPolicyEvaluationContext
  ): string {
    const keyData = {
      policyId,
      userId: context.userId,
      organizationId: context.organizationId,
      resource: context.resource,
      action: context.action,
      userRoles: context.user?.roles?.sort(),
      userPermissions: context.user?.permissions?.sort()
    };

    return require('crypto')
      .createHash('sha256')
      .update(JSON.stringify(keyData))
      .digest('hex');
  }

  private isEvaluationCacheValid(result: EnhancedPolicyEvaluationResult): boolean {
    const age = Date.now() - result.auditTrail.timestamp.getTime();
    return age < this.evaluationTTL;
  }

  private isPolicyCacheValid(entry: PolicyCacheEntry): boolean {
    return entry.validUntil > new Date();
  }

  private cachePolicyWithManagement(policyId: string, policy: Policy): void {
    // Manage cache size
    if (this.policyCache.size >= this.maxPolicyCacheSize) {
      this.evictLeastUsedPolicyEntries();
    }

    this.policyCache.set(policyId, {
      policy,
      lastAccess: new Date(),
      accessCount: 1,
      validUntil: new Date(Date.now() + this.policyTTL),
      hitCount: 0
    });
  }

  private cacheEvaluationResult(
    cacheKey: string,
    result: EnhancedPolicyEvaluationResult
  ): void {
    // Manage cache size
    if (this.evaluationCache.size >= this.maxEvaluationCacheSize) {
      this.evictOldestEvaluationEntries();
    }

    this.evaluationCache.set(cacheKey, { ...result, cacheHit: false });
  }

  private evictLeastUsedPolicyEntries(): void {
    const entries = Array.from(this.policyCache.entries())
      .sort(([, a], [, b]) => a.accessCount - b.accessCount);

    const toRemove = entries.slice(0, Math.floor(this.maxPolicyCacheSize * 0.1));
    toRemove.forEach(([key]) => this.policyCache.delete(key));
  }

  private evictOldestEvaluationEntries(): void {
    const entries = Array.from(this.evaluationCache.entries())
      .sort(([, a], [, b]) => 
        a.auditTrail.timestamp.getTime() - b.auditTrail.timestamp.getTime()
      );

    const toRemove = entries.slice(0, Math.floor(this.maxEvaluationCacheSize * 0.1));
    toRemove.forEach(([key]) => this.evaluationCache.delete(key));
  }

  private calculateConfidence(
    appliedRules: number,
    totalRules: number,
    context: EnhancedPolicyEvaluationContext
  ): number {
    let baseConfidence = appliedRules > 0 ? 0.8 : 0.6;
    
    // Increase confidence for MFA verified users
    if (context.user?.mfaVerified) {
      baseConfidence += 0.1;
    }

    // Decrease confidence for suspicious patterns
    if (context.request?.ipAddress && this.isSuspiciousIP(context.request.ipAddress)) {
      baseConfidence -= 0.2;
    }

    return Math.max(0.0, Math.min(1.0, baseConfidence));
  }

  private calculateRiskScore(
    decision: string,
    policy: Policy,
    context: EnhancedPolicyEvaluationContext
  ): number {
    let baseRisk = 0.0;

    switch (decision) {
      case 'deny':
        baseRisk = 8.0;
        break;
      case 'require_approval':
        baseRisk = 5.0;
        break;
      case 'conditional_allow':
        baseRisk = 3.0;
        break;
      case 'allow':
        baseRisk = 1.0;
        break;
    }

    // Adjust based on policy risk level
    switch (policy.metadata.riskLevel) {
      case 'critical':
        baseRisk += 3.0;
        break;
      case 'high':
        baseRisk += 2.0;
        break;
      case 'medium':
        baseRisk += 1.0;
        break;
    }

    return Math.min(10.0, baseRisk);
  }

  private determineViolationSeverity(
    decision: string,
    riskScore: number
  ): 'info' | 'warning' | 'error' | 'critical' | undefined {
    if (decision === 'allow') {
      return undefined;
    }

    if (riskScore >= 8.0) return 'critical';
    if (riskScore >= 6.0) return 'error';
    if (riskScore >= 4.0) return 'warning';
    return 'info';
  }

  private generateAggregatedReasoning(
    results: EnhancedPolicyEvaluationResult[],
    finalDecision: string
  ): string {
    const deniedResults = results.filter(r => r.decision === 'deny');
    const approvalResults = results.filter(r => r.decision === 'require_approval');
    
    if (deniedResults.length > 0) {
      return `Access denied by ${deniedResults.length} policy(ies): ${deniedResults.map(r => r.reasoning).join('; ')}`;
    }
    
    if (approvalResults.length > 0) {
      return `Approval required by ${approvalResults.length} policy(ies): ${approvalResults.map(r => r.reasoning).join('; ')}`;
    }
    
    return `Access allowed after evaluating ${results.length} policy(ies)`;
  }

  private isBusinessHours(timestamp: Date): boolean {
    const hour = timestamp.getHours();
    const day = timestamp.getDay();
    return day >= 1 && day <= 5 && hour >= 9 && hour <= 17;
  }

  private isWorkday(timestamp: Date): boolean {
    const day = timestamp.getDay();
    return day >= 1 && day <= 5;
  }

  private isSuspiciousIP(ipAddress: string): boolean {
    // Simple implementation - could be enhanced with threat intelligence
    const suspiciousPatterns = [
      /^10\./, // Internal networks from external
      /^192\.168\./, // Internal networks from external
      /^172\.16\./ // Internal networks from external
    ];
    
    return suspiciousPatterns.some(pattern => pattern.test(ipAddress));
  }

  private globToRegex(glob: string): string {
    return glob
      .replace(/\*\*/g, '.*')
      .replace(/\*/g, '[^/]*')
      .replace(/\?/g, '.');
  }

  private escapeRegex(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }

  private startBackgroundOptimization(): void {
    // Start periodic cache cleanup
    setInterval(() => {
      this.cleanupCaches();
    }, 5 * 60 * 1000); // Every 5 minutes

    // Start metrics reporting
    setInterval(() => {
      this.reportMetrics();
    }, 30 * 1000); // Every 30 seconds
  }

  private cleanupCaches(): void {
    // Remove expired evaluation cache entries
    for (const [key, result] of this.evaluationCache.entries()) {
      if (!this.isEvaluationCacheValid(result)) {
        this.evaluationCache.delete(key);
      }
    }

    // Remove expired policy cache entries
    for (const [key, entry] of this.policyCache.entries()) {
      if (!this.isPolicyCacheValid(entry)) {
        this.policyCache.delete(key);
      }
    }
  }

  private reportMetrics(): void {
    const metrics = {
      ...this.stats,
      policyCacheSize: this.policyCache.size,
      evaluationCacheSize: this.evaluationCache.size,
      ruleCompilerCacheSize: this.ruleCompilerCache.size,
      cacheHitRate: this.stats.evaluations > 0 ? 
        this.stats.cacheHits / this.stats.evaluations : 0,
      averageEvaluationTime: this.stats.evaluations > 0 ? 
        this.stats.evaluationTime / this.stats.evaluations : 0
    };

    this.emit('metrics', metrics);
    
    logger.info('Enhanced policy engine metrics', metrics);
  }

  /**
   * Get current engine statistics
   */
  getStatistics() {
    return {
      ...this.stats,
      policyCacheSize: this.policyCache.size,
      evaluationCacheSize: this.evaluationCache.size,
      ruleCompilerCacheSize: this.ruleCompilerCache.size,
      cacheHitRate: this.stats.evaluations > 0 ? 
        this.stats.cacheHits / this.stats.evaluations : 0,
      averageEvaluationTime: this.stats.evaluations > 0 ? 
        this.stats.evaluationTime / this.stats.evaluations : 0
    };
  }

  /**
   * Clear all caches - useful for testing or policy updates
   */
  clearAllCaches(): void {
    this.policyCache.clear();
    this.evaluationCache.clear();
    this.ruleCompilerCache.clear();
  }

  /**
   * Shutdown the engine gracefully
   */
  async shutdown(): Promise<void> {
    this.removeAllListeners();
    this.clearAllCaches();
    
    logger.info('Enhanced policy evaluation engine shut down');
  }
}