import { EventEmitter } from 'events';
import { logger } from '../utils/logger.js';
import type {
  SecurityContext,
  AccessRequest,
  AccessDecision,
  PolicyEvaluation,
  ZeroTrustPolicy,
  PolicyRule,
  PolicyCondition,
  Identity,
  DeviceTrust,
  NetworkSegment,
  RiskAssessment
} from '../types/security-types.js';

export class AccessControlEngine extends EventEmitter {
  private policies: Map<string, ZeroTrustPolicy> = new Map();
  private accessCache: Map<string, { decision: AccessDecision; timestamp: Date }> = new Map();
  private requestHistory: AccessRequest[] = [];
  private cacheExpiryMs: number = 5 * 60 * 1000; // 5 minutes

  constructor() {
    super();
    this.initializeAccessControl();
    this.setupDefaultPolicies();
    this.startCacheCleanup();
  }

  private initializeAccessControl(): void {
    logger.info('Initializing access control engine');
  }

  private setupDefaultPolicies(): void {
    // Create default zero-trust policies

    // Admin access policy
    this.createPolicy({
      id: 'admin-access',
      name: 'Administrator Access Policy',
      description: 'Strict controls for administrative access',
      rules: [
        {
          id: 'admin-mfa-required',
          type: 'REQUIRE_MFA',
          conditions: [
            { field: 'user_role', operator: 'contains', value: 'admin' },
            { field: 'resource_type', operator: 'equals', value: 'administrative' }
          ],
          actions: [
            { type: 'REQUIRE_VERIFICATION', parameters: { method: 'MFA' } },
            { type: 'LOG', parameters: { level: 'HIGH' } }
          ]
        },
        {
          id: 'admin-device-cert',
          type: 'REQUIRE_DEVICE_CERT',
          conditions: [
            { field: 'user_role', operator: 'contains', value: 'admin' },
            { field: 'trust_level', operator: 'in', value: ['UNKNOWN', 'LOW'] }
          ],
          actions: [
            { type: 'REQUIRE_VERIFICATION', parameters: { method: 'CERTIFICATE' } }
          ]
        }
      ],
      enabled: true,
      priority: 100,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    // High-risk resource policy
    this.createPolicy({
      id: 'high-risk-resource',
      name: 'High-Risk Resource Protection',
      description: 'Enhanced protection for sensitive resources',
      rules: [
        {
          id: 'sensitive-data-access',
          type: 'REQUIRE_MFA',
          conditions: [
            { field: 'resource_classification', operator: 'in', value: ['CONFIDENTIAL', 'TOP_SECRET'] }
          ],
          actions: [
            { type: 'REQUIRE_VERIFICATION', parameters: { method: 'MFA' } },
            { type: 'ENCRYPT', parameters: { level: 'HIGH' } },
            { type: 'LOG', parameters: { level: 'CRITICAL' } }
          ]
        }
      ],
      enabled: true,
      priority: 90,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    // Time-based access policy
    this.createPolicy({
      id: 'time-based-access',
      name: 'Time-Based Access Controls',
      description: 'Restrict access based on time and location',
      rules: [
        {
          id: 'business-hours-only',
          type: 'DENY',
          conditions: [
            { field: 'time_of_day', operator: 'in', value: [0, 1, 2, 3, 4, 5, 6, 22, 23] },
            { field: 'user_role', operator: 'equals', value: 'user' }
          ],
          actions: [
            { type: 'BLOCK', parameters: { reason: 'Outside business hours' } },
            { type: 'ALERT', parameters: { severity: 'MEDIUM' } }
          ]
        }
      ],
      enabled: true,
      priority: 70,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    // Device trust policy
    this.createPolicy({
      id: 'device-trust',
      name: 'Device Trust Requirements',
      description: 'Enforce device trust levels for access',
      rules: [
        {
          id: 'unknown-device-deny',
          type: 'DENY',
          conditions: [
            { field: 'device_trust_level', operator: 'equals', value: 'UNKNOWN' },
            { field: 'resource_sensitivity', operator: 'in', value: ['HIGH', 'CRITICAL'] }
          ],
          actions: [
            { type: 'BLOCK', parameters: { reason: 'Unknown device accessing sensitive resource' } },
            { type: 'ALERT', parameters: { severity: 'HIGH' } }
          ]
        }
      ],
      enabled: true,
      priority: 80,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    logger.info('Default access control policies created', {
      policyCount: this.policies.size
    });
  }

  public createPolicy(policy: ZeroTrustPolicy): void {
    this.policies.set(policy.id, policy);

    logger.info('Access control policy created', {
      policyId: policy.id,
      name: policy.name,
      priority: policy.priority,
      ruleCount: policy.rules.length
    });

    this.emit('policyCreated', policy);
  }

  public async evaluateAccess(request: AccessRequest): Promise<AccessDecision> {
    logger.debug('Evaluating access request', {
      requestId: request.id,
      userId: request.userId,
      resource: request.resource,
      action: request.action
    });

    try {
      // Check cache first
      const cacheKey = this.generateCacheKey(request);
      const cachedDecision = this.getCachedDecision(cacheKey);
      if (cachedDecision) {
        logger.debug('Access decision retrieved from cache', {
          requestId: request.id,
          decision: cachedDecision.result
        });
        return cachedDecision;
      }

      // Perform comprehensive access evaluation
      const decision = await this.performAccessEvaluation(request);

      // Cache the decision
      this.cacheDecision(cacheKey, decision);

      // Store request history
      this.requestHistory.push(request);

      // Emit access event
      this.emit('accessEvaluated', { request, decision });

      logger.info('Access evaluation completed', {
        requestId: request.id,
        decision: decision.result,
        userId: request.userId,
        resource: request.resource
      });

      return decision;

    } catch (error) {
      logger.error('Access evaluation failed', {
        requestId: request.id,
        error: error.message
      });

      return {
        result: 'DENY',
        reason: 'Access evaluation system error'
      };
    }
  }

  private async performAccessEvaluation(request: AccessRequest): Promise<AccessDecision> {
    const evaluations: PolicyEvaluation[] = [];

    // Get applicable policies sorted by priority
    const applicablePolicies = this.getApplicablePolicies(request);

    // Evaluate each policy
    for (const policy of applicablePolicies) {
      const evaluation = await this.evaluatePolicy(policy, request);
      evaluations.push(evaluation);

      // Handle immediate deny decisions
      if (evaluation.result === 'MATCH') {
        const denyRule = policy.rules.find(rule => rule.type === 'DENY');
        if (denyRule && evaluation.matchedRules.includes(denyRule.id)) {
          return {
            result: 'DENY',
            reason: `Denied by policy: ${policy.name}`,
            policyEvaluations: evaluations
          };
        }
      }
    }

    // Analyze all evaluations to make final decision
    return this.makeFinalDecision(request, evaluations);
  }

  private getApplicablePolicies(request: AccessRequest): ZeroTrustPolicy[] {
    return Array.from(this.policies.values())
      .filter(policy => policy.enabled)
      .sort((a, b) => b.priority - a.priority); // Higher priority first
  }

  private async evaluatePolicy(policy: ZeroTrustPolicy, request: AccessRequest): Promise<PolicyEvaluation> {
    const startTime = Date.now();
    const matchedRules: string[] = [];

    try {
      for (const rule of policy.rules) {
        const ruleMatches = await this.evaluateRule(rule, request);
        if (ruleMatches) {
          matchedRules.push(rule.id);
        }
      }

      const executionTime = Date.now() - startTime;

      return {
        policyId: policy.id,
        policyName: policy.name,
        result: matchedRules.length > 0 ? 'MATCH' : 'NO_MATCH',
        matchedRules,
        executionTime
      };

    } catch (error) {
      logger.error('Policy evaluation failed', {
        policyId: policy.id,
        error: error.message
      });

      return {
        policyId: policy.id,
        policyName: policy.name,
        result: 'ERROR',
        matchedRules: [],
        executionTime: Date.now() - startTime
      };
    }
  }

  private async evaluateRule(rule: PolicyRule, request: AccessRequest): Promise<boolean> {
    // All conditions must be true for rule to match
    for (const condition of rule.conditions) {
      const conditionMet = await this.evaluateCondition(condition, request);
      if (!conditionMet) {
        return false;
      }
    }
    return true;
  }

  private async evaluateCondition(condition: PolicyCondition, request: AccessRequest): Promise<boolean> {
    const value = this.extractValue(condition.field, request);

    switch (condition.operator) {
      case 'equals':
        return value === condition.value;

      case 'contains':
        if (typeof value === 'string' && typeof condition.value === 'string') {
          return value.toLowerCase().includes(condition.value.toLowerCase());
        }
        if (Array.isArray(value)) {
          return value.includes(condition.value);
        }
        return false;

      case 'startsWith':
        return typeof value === 'string' && typeof condition.value === 'string' &&
               value.toLowerCase().startsWith(condition.value.toLowerCase());

      case 'endsWith':
        return typeof value === 'string' && typeof condition.value === 'string' &&
               value.toLowerCase().endsWith(condition.value.toLowerCase());

      case 'regex':
        if (typeof value === 'string' && typeof condition.value === 'string') {
          const regex = new RegExp(condition.value, 'i');
          return regex.test(value);
        }
        return false;

      case 'in':
        return Array.isArray(condition.value) && condition.value.includes(value);

      case 'notIn':
        return Array.isArray(condition.value) && !condition.value.includes(value);

      default:
        logger.warn('Unknown condition operator', { operator: condition.operator });
        return false;
    }
  }

  private extractValue(field: string, request: AccessRequest): any {
    const context = request.context;
    const now = new Date();

    switch (field) {
      // Request fields
      case 'user_id':
        return request.userId;
      case 'device_id':
        return request.deviceId;
      case 'resource':
      case 'resource_name':
        return request.resource;
      case 'action':
        return request.action;

      // Identity fields
      case 'user_role':
      case 'user_roles':
        return context.identity.roles;
      case 'user_email':
        return context.identity.email;
      case 'verification_level':
        return context.identity.verificationLevel.level;

      // Device fields
      case 'device_trust_level':
        return context.device.trustLevel;
      case 'device_platform':
        return context.device.metadata.platform;
      case 'device_compliance':
        return context.device.complianceStatus.isCompliant;

      // Session fields
      case 'session_risk_score':
        return context.session.riskScore;
      case 'session_ip':
        return context.session.ipAddress;

      // Network fields
      case 'network_segment':
        return context.networkSegment.id;
      case 'isolation_level':
        return context.networkSegment.isolationLevel;

      // Time-based fields
      case 'time_of_day':
        return now.getHours();
      case 'day_of_week':
        return now.getDay();
      case 'is_weekend':
        const day = now.getDay();
        return day === 0 || day === 6;

      // Risk assessment fields
      case 'risk_score':
        return context.riskAssessment.overallScore;

      // Resource classification (would come from resource metadata)
      case 'resource_classification':
      case 'resource_sensitivity':
        return this.getResourceClassification(request.resource);

      // Location fields
      case 'location_country':
        return context.device.metadata.location?.country;
      case 'location_trusted':
        return this.isLocationTrusted(context.device.metadata.location);

      default:
        // Try to extract from request context attributes
        return (request as any)[field] || context.identity.attributes[field];
    }
  }

  private getResourceClassification(resource: string): string {
    // In production, this would query a resource registry
    // For demo, classify based on resource name patterns
    const sensitivePatterns = [
      /admin/i,
      /secret/i,
      /confidential/i,
      /private/i,
      /secure/i,
      /financial/i,
      /payment/i,
      /user.*data/i
    ];

    const isHighSensitivity = sensitivePatterns.some(pattern => pattern.test(resource));
    return isHighSensitivity ? 'CONFIDENTIAL' : 'PUBLIC';
  }

  private isLocationTrusted(location: any): boolean {
    if (!location) return false;

    // Define trusted countries/regions
    const trustedCountries = ['US', 'CA', 'GB', 'DE', 'FR', 'JP', 'AU'];
    return trustedCountries.includes(location.country);
  }

  private makeFinalDecision(request: AccessRequest, evaluations: PolicyEvaluation[]): AccessDecision {
    const conditions: any[] = [];
    let highestPriorityMatch: PolicyEvaluation | null = null;

    // Find the highest priority policy that matched
    for (const evaluation of evaluations) {
      if (evaluation.result === 'MATCH' && !highestPriorityMatch) {
        highestPriorityMatch = evaluation;
        break; // Evaluations are already sorted by priority
      }
    }

    if (!highestPriorityMatch) {
      // No policies matched - default allow with basic conditions
      const riskScore = request.context.riskAssessment.overallScore;

      if (riskScore > 70) {
        conditions.push({
          field: 'additional_verification',
          operator: 'equals',
          value: true
        });
      }

      return {
        result: 'CONDITIONAL',
        reason: 'Default allow with risk-based conditions',
        conditions: conditions.length > 0 ? conditions : undefined,
        policyEvaluations: evaluations
      };
    }

    // Get the matched policy
    const policy = this.policies.get(highestPriorityMatch.policyId);
    if (!policy) {
      return {
        result: 'DENY',
        reason: 'Policy not found',
        policyEvaluations: evaluations
      };
    }

    // Find the first matched rule to determine action
    const matchedRule = policy.rules.find(rule =>
      highestPriorityMatch!.matchedRules.includes(rule.id)
    );

    if (!matchedRule) {
      return {
        result: 'DENY',
        reason: 'No matched rule found',
        policyEvaluations: evaluations
      };
    }

    // Determine decision based on rule type
    switch (matchedRule.type) {
      case 'ALLOW':
        return {
          result: 'ALLOW',
          reason: `Allowed by policy: ${policy.name}`,
          policyEvaluations: evaluations
        };

      case 'DENY':
        return {
          result: 'DENY',
          reason: `Denied by policy: ${policy.name}`,
          policyEvaluations: evaluations
        };

      case 'REQUIRE_MFA':
        conditions.push({
          field: 'mfa_verified',
          operator: 'equals',
          value: true
        });
        break;

      case 'REQUIRE_DEVICE_CERT':
        conditions.push({
          field: 'device_certificate_valid',
          operator: 'equals',
          value: true
        });
        break;
    }

    return {
      result: 'CONDITIONAL',
      reason: `Conditional access by policy: ${policy.name}`,
      conditions,
      policyEvaluations: evaluations
    };
  }

  private generateCacheKey(request: AccessRequest): string {
    const keyData = {
      userId: request.userId,
      deviceId: request.deviceId,
      resource: request.resource,
      action: request.action,
      riskScore: request.context.riskAssessment.overallScore,
      trustLevel: request.context.device.trustLevel,
      verificationLevel: request.context.identity.verificationLevel.level
    };

    return Buffer.from(JSON.stringify(keyData)).toString('base64');
  }

  private getCachedDecision(cacheKey: string): AccessDecision | null {
    const cached = this.accessCache.get(cacheKey);
    if (!cached) return null;

    const isExpired = Date.now() - cached.timestamp.getTime() > this.cacheExpiryMs;
    if (isExpired) {
      this.accessCache.delete(cacheKey);
      return null;
    }

    return cached.decision;
  }

  private cacheDecision(cacheKey: string, decision: AccessDecision): void {
    // Only cache stable decisions (not conditional ones that might change quickly)
    if (decision.result === 'ALLOW' || decision.result === 'DENY') {
      this.accessCache.set(cacheKey, {
        decision,
        timestamp: new Date()
      });
    }
  }

  private startCacheCleanup(): void {
    // Clean up expired cache entries every 5 minutes
    setInterval(() => {
      const now = Date.now();
      for (const [key, cached] of this.accessCache.entries()) {
        if (now - cached.timestamp.getTime() > this.cacheExpiryMs) {
          this.accessCache.delete(key);
        }
      }
    }, 5 * 60 * 1000);
  }

  public getAccessMetrics(): {
    totalRequests: number;
    allowedRequests: number;
    deniedRequests: number;
    conditionalRequests: number;
    cachedDecisions: number;
    averageEvaluationTime: number;
    policyCount: number;
  } {
    const totalRequests = this.requestHistory.length;
    let allowedRequests = 0;
    let deniedRequests = 0;
    let conditionalRequests = 0;
    let totalEvaluationTime = 0;

    // In production, these metrics would be tracked in real-time
    // For demo, we'll simulate some metrics
    allowedRequests = Math.floor(totalRequests * 0.7);
    deniedRequests = Math.floor(totalRequests * 0.2);
    conditionalRequests = totalRequests - allowedRequests - deniedRequests;

    return {
      totalRequests,
      allowedRequests,
      deniedRequests,
      conditionalRequests,
      cachedDecisions: this.accessCache.size,
      averageEvaluationTime: totalRequests > 0 ? 25 : 0, // Simulated average
      policyCount: this.policies.size
    };
  }

  public getPolicies(): ZeroTrustPolicy[] {
    return Array.from(this.policies.values());
  }

  public getPolicy(policyId: string): ZeroTrustPolicy | undefined {
    return this.policies.get(policyId);
  }

  public updatePolicy(policy: ZeroTrustPolicy): boolean {
    const existing = this.policies.get(policy.id);
    if (!existing) {
      return false;
    }

    policy.updatedAt = new Date();
    this.policies.set(policy.id, policy);

    // Clear cache since policies changed
    this.accessCache.clear();

    logger.info('Access control policy updated', {
      policyId: policy.id,
      name: policy.name
    });

    this.emit('policyUpdated', policy);
    return true;
  }

  public deletePolicy(policyId: string): boolean {
    const deleted = this.policies.delete(policyId);

    if (deleted) {
      // Clear cache since policies changed
      this.accessCache.clear();

      logger.info('Access control policy deleted', { policyId });
      this.emit('policyDeleted', { policyId });
    }

    return deleted;
  }

  public shutdown(): void {
    this.policies.clear();
    this.accessCache.clear();
    this.requestHistory.length = 0;

    logger.info('Access control engine shut down');
  }
}