import { FastifyRequest } from 'fastify';
import { encryptionService } from './encryption';

export interface AccessPolicy {
  id: string;
  name: string;
  resource: string;
  actions: string[];
  conditions?: AccessCondition[];
  effect: 'ALLOW' | 'DENY';
  priority: number;
  createdAt: Date;
  updatedAt: Date;
  metadata?: Record<string, any>;
}

export interface AccessCondition {
  type: 'ip' | 'time' | 'location' | 'device' | 'mfa' | 'risk' | 'attribute';
  operator: 'equals' | 'contains' | 'startsWith' | 'endsWith' | 'in' | 'gt' | 'lt' | 'between';
  value: any;
  metadata?: Record<string, any>;
}

export interface AccessRequest {
  userId: string;
  resource: string;
  action: string;
  context: {
    ip?: string;
    userAgent?: string;
    timestamp: Date;
    location?: {
      country?: string;
      region?: string;
      city?: string;
    };
    device?: {
      id?: string;
      type?: string;
      trusted?: boolean;
    };
    session?: {
      id: string;
      mfaVerified: boolean;
      riskScore: number;
    };
    attributes?: Record<string, any>;
  };
}

export interface AccessDecision {
  decision: 'ALLOW' | 'DENY';
  reason: string;
  appliedPolicies: string[];
  riskScore: number;
  recommendations?: string[];
  auditTrail: {
    requestId: string;
    timestamp: Date;
    policies: AccessPolicy[];
    conditions: AccessCondition[];
  };
}

export interface NetworkSegment {
  id: string;
  name: string;
  cidr: string;
  allowedServices: string[];
  securityLevel: 'PUBLIC' | 'INTERNAL' | 'RESTRICTED' | 'CLASSIFIED';
  rules: NetworkRule[];
  metadata?: Record<string, any>;
}

export interface NetworkRule {
  id: string;
  source: string;
  destination: string;
  protocol: 'TCP' | 'UDP' | 'ICMP' | 'ANY';
  ports: number[] | 'ANY';
  action: 'ALLOW' | 'DENY' | 'LOG';
  priority: number;
  conditions?: NetworkCondition[];
}

export interface NetworkCondition {
  type: 'time' | 'rate' | 'geolocation' | 'reputation';
  value: any;
}

export class AccessControlService {
  private policies: Map<string, AccessPolicy> = new Map();
  private networkSegments: Map<string, NetworkSegment> = new Map();
  private accessCache: Map<string, { decision: AccessDecision; expires: Date }> = new Map();
  private readonly cacheTimeout = 5 * 60 * 1000; // 5 minutes

  constructor() {
    this.initializeDefaultPolicies();
    this.initializeNetworkSegments();
  }

  /**
   * Initialize default security policies
   */
  private initializeDefaultPolicies(): void {
    const defaultPolicies: AccessPolicy[] = [
      {
        id: 'admin-full-access',
        name: 'Administrator Full Access',
        resource: '*',
        actions: ['*'],
        effect: 'ALLOW',
        priority: 100,
        conditions: [
          { type: 'mfa', operator: 'equals', value: true },
          { type: 'risk', operator: 'lt', value: 30 }
        ],
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: 'user-read-access',
        name: 'User Read Access',
        resource: '/api/v1/user/*',
        actions: ['GET'],
        effect: 'ALLOW',
        priority: 50,
        conditions: [
          { type: 'time', operator: 'between', value: ['06:00', '22:00'] }
        ],
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: 'deny-suspicious-activity',
        name: 'Deny Suspicious Activity',
        resource: '*',
        actions: ['*'],
        effect: 'DENY',
        priority: 200,
        conditions: [
          { type: 'risk', operator: 'gt', value: 80 }
        ],
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ];

    defaultPolicies.forEach(policy => {
      this.policies.set(policy.id, policy);
    });
  }

  /**
   * Initialize network micro-segments
   */
  private initializeNetworkSegments(): void {
    const segments: NetworkSegment[] = [
      {
        id: 'dmz',
        name: 'DMZ Network',
        cidr: '10.0.1.0/24',
        allowedServices: ['gateway', 'api'],
        securityLevel: 'PUBLIC',
        rules: [
          {
            id: 'dmz-inbound',
            source: '0.0.0.0/0',
            destination: '10.0.1.0/24',
            protocol: 'TCP',
            ports: [80, 443],
            action: 'ALLOW',
            priority: 10
          }
        ]
      },
      {
        id: 'internal',
        name: 'Internal Services',
        cidr: '10.0.2.0/24',
        allowedServices: ['api', 'database', 'agents'],
        securityLevel: 'INTERNAL',
        rules: [
          {
            id: 'internal-access',
            source: '10.0.1.0/24',
            destination: '10.0.2.0/24',
            protocol: 'TCP',
            ports: [3000, 5432, 6379],
            action: 'ALLOW',
            priority: 20
          }
        ]
      },
      {
        id: 'restricted',
        name: 'Restricted Zone',
        cidr: '10.0.3.0/24',
        allowedServices: ['monitoring', 'security'],
        securityLevel: 'RESTRICTED',
        rules: [
          {
            id: 'restricted-deny-all',
            source: '0.0.0.0/0',
            destination: '10.0.3.0/24',
            protocol: 'ANY',
            ports: 'ANY',
            action: 'DENY',
            priority: 100
          }
        ]
      }
    ];

    segments.forEach(segment => {
      this.networkSegments.set(segment.id, segment);
    });
  }

  /**
   * Evaluate access request against policies
   */
  async evaluateAccess(request: AccessRequest): Promise<AccessDecision> {
    const requestId = encryptionService.generateUUID();
    const cacheKey = this.generateCacheKey(request);

    // Check cache first
    const cached = this.accessCache.get(cacheKey);
    if (cached && cached.expires > new Date()) {
      return cached.decision;
    }

    // Calculate risk score
    const riskScore = await this.calculateRiskScore(request);

    // Get applicable policies
    const applicablePolicies = this.getApplicablePolicies(request);

    // Sort by priority (higher priority first)
    applicablePolicies.sort((a, b) => b.priority - a.priority);

    // Evaluate policies
    let decision: 'ALLOW' | 'DENY' = 'DENY';
    let reason = 'No applicable policies found';
    const appliedPolicies: string[] = [];

    for (const policy of applicablePolicies) {
      const policyResult = await this.evaluatePolicy(policy, request, riskScore);

      if (policyResult.matches) {
        decision = policy.effect;
        reason = `Policy ${policy.name} matched: ${policyResult.reason}`;
        appliedPolicies.push(policy.id);

        // First matching policy determines the decision
        break;
      }
    }

    const accessDecision: AccessDecision = {
      decision,
      reason,
      appliedPolicies,
      riskScore,
      recommendations: this.generateRecommendations(request, riskScore),
      auditTrail: {
        requestId,
        timestamp: new Date(),
        policies: applicablePolicies,
        conditions: applicablePolicies.flatMap(p => p.conditions || [])
      }
    };

    // Cache the decision
    this.accessCache.set(cacheKey, {
      decision: accessDecision,
      expires: new Date(Date.now() + this.cacheTimeout)
    });

    return accessDecision;
  }

  /**
   * Calculate risk score for access request
   */
  private async calculateRiskScore(request: AccessRequest): Promise<number> {
    let riskScore = 0;

    // Base risk factors
    if (!request.context.session?.mfaVerified) {
      riskScore += 30;
    }

    if (!request.context.device?.trusted) {
      riskScore += 20;
    }

    // Time-based risk
    const hour = new Date().getHours();
    if (hour < 6 || hour > 22) {
      riskScore += 15;
    }

    // Location-based risk (simplified)
    if (!request.context.location?.country) {
      riskScore += 10;
    }

    // Session risk
    if (request.context.session?.riskScore) {
      riskScore += request.context.session.riskScore;
    }

    return Math.min(riskScore, 100);
  }

  /**
   * Get policies applicable to the request
   */
  private getApplicablePolicies(request: AccessRequest): AccessPolicy[] {
    return Array.from(this.policies.values()).filter(policy => {
      return this.matchesResource(policy.resource, request.resource) &&
             this.matchesAction(policy.actions, request.action);
    });
  }

  /**
   * Check if resource pattern matches request resource
   */
  private matchesResource(pattern: string, resource: string): boolean {
    if (pattern === '*') return true;

    // Convert glob pattern to regex
    const regexPattern = pattern
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.');

    return new RegExp(`^${regexPattern}$`).test(resource);
  }

  /**
   * Check if action is allowed
   */
  private matchesAction(allowedActions: string[], requestedAction: string): boolean {
    return allowedActions.includes('*') || allowedActions.includes(requestedAction);
  }

  /**
   * Evaluate a specific policy against the request
   */
  private async evaluatePolicy(
    policy: AccessPolicy,
    request: AccessRequest,
    riskScore: number
  ): Promise<{ matches: boolean; reason: string }> {
    if (!policy.conditions || policy.conditions.length === 0) {
      return { matches: true, reason: 'No conditions to evaluate' };
    }

    for (const condition of policy.conditions) {
      const conditionResult = await this.evaluateCondition(condition, request, riskScore);

      if (!conditionResult.matches) {
        return {
          matches: false,
          reason: `Condition failed: ${conditionResult.reason}`
        };
      }
    }

    return { matches: true, reason: 'All conditions passed' };
  }

  /**
   * Evaluate a specific condition
   */
  private async evaluateCondition(
    condition: AccessCondition,
    request: AccessRequest,
    riskScore: number
  ): Promise<{ matches: boolean; reason: string }> {
    switch (condition.type) {
      case 'ip':
        return this.evaluateIPCondition(condition, request.context.ip);

      case 'time':
        return this.evaluateTimeCondition(condition);

      case 'mfa':
        return this.evaluateMFACondition(condition, request.context.session?.mfaVerified);

      case 'risk':
        return this.evaluateRiskCondition(condition, riskScore);

      case 'device':
        return this.evaluateDeviceCondition(condition, request.context.device);

      case 'location':
        return this.evaluateLocationCondition(condition, request.context.location);

      default:
        return { matches: false, reason: `Unknown condition type: ${condition.type}` };
    }
  }

  /**
   * Evaluate IP-based condition
   */
  private evaluateIPCondition(
    condition: AccessCondition,
    ip?: string
  ): { matches: boolean; reason: string } {
    if (!ip) {
      return { matches: false, reason: 'No IP address provided' };
    }

    // Simplified IP evaluation (in production, use proper CIDR matching)
    const matches = condition.operator === 'equals' ? ip === condition.value : true;

    return {
      matches,
      reason: matches ? 'IP condition satisfied' : 'IP condition failed'
    };
  }

  /**
   * Evaluate time-based condition
   */
  private evaluateTimeCondition(condition: AccessCondition): { matches: boolean; reason: string } {
    const now = new Date();
    const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

    let matches = false;

    switch (condition.operator) {
      case 'between':
        const [start, end] = condition.value;
        matches = currentTime >= start && currentTime <= end;
        break;
      default:
        matches = false;
    }

    return {
      matches,
      reason: matches ? 'Time condition satisfied' : 'Outside allowed time window'
    };
  }

  /**
   * Evaluate MFA condition
   */
  private evaluateMFACondition(
    condition: AccessCondition,
    mfaVerified?: boolean
  ): { matches: boolean; reason: string } {
    const matches = condition.operator === 'equals' ? mfaVerified === condition.value : false;

    return {
      matches,
      reason: matches ? 'MFA condition satisfied' : 'MFA verification required'
    };
  }

  /**
   * Evaluate risk condition
   */
  private evaluateRiskCondition(
    condition: AccessCondition,
    riskScore: number
  ): { matches: boolean; reason: string } {
    let matches = false;

    switch (condition.operator) {
      case 'lt':
        matches = riskScore < condition.value;
        break;
      case 'gt':
        matches = riskScore > condition.value;
        break;
      case 'equals':
        matches = riskScore === condition.value;
        break;
    }

    return {
      matches,
      reason: matches ? 'Risk condition satisfied' : `Risk score ${riskScore} does not meet condition`
    };
  }

  /**
   * Evaluate device condition
   */
  private evaluateDeviceCondition(
    condition: AccessCondition,
    device?: AccessRequest['context']['device']
  ): { matches: boolean; reason: string } {
    if (!device) {
      return { matches: false, reason: 'No device information provided' };
    }

    // Simplified device evaluation
    const matches = condition.operator === 'equals' ? device.trusted === condition.value : true;

    return {
      matches,
      reason: matches ? 'Device condition satisfied' : 'Device not trusted'
    };
  }

  /**
   * Evaluate location condition
   */
  private evaluateLocationCondition(
    condition: AccessCondition,
    location?: AccessRequest['context']['location']
  ): { matches: boolean; reason: string } {
    if (!location) {
      return { matches: false, reason: 'No location information provided' };
    }

    // Simplified location evaluation
    const matches = true; // Implement actual geo-blocking logic

    return {
      matches,
      reason: matches ? 'Location condition satisfied' : 'Location blocked'
    };
  }

  /**
   * Generate cache key for access request
   */
  private generateCacheKey(request: AccessRequest): string {
    const key = `${request.userId}:${request.resource}:${request.action}:${request.context.ip}`;
    return encryptionService.createHMAC(key, 'cache-key');
  }

  /**
   * Generate security recommendations
   */
  private generateRecommendations(request: AccessRequest, riskScore: number): string[] {
    const recommendations: string[] = [];

    if (!request.context.session?.mfaVerified) {
      recommendations.push('Enable multi-factor authentication');
    }

    if (!request.context.device?.trusted) {
      recommendations.push('Register and verify device');
    }

    if (riskScore > 50) {
      recommendations.push('Review recent activity for suspicious behavior');
    }

    return recommendations;
  }

  /**
   * Add or update access policy
   */
  addPolicy(policy: AccessPolicy): void {
    this.policies.set(policy.id, policy);
    this.clearAccessCache();
  }

  /**
   * Remove access policy
   */
  removePolicy(policyId: string): boolean {
    const removed = this.policies.delete(policyId);
    if (removed) {
      this.clearAccessCache();
    }
    return removed;
  }

  /**
   * Get all policies
   */
  getPolicies(): AccessPolicy[] {
    return Array.from(this.policies.values());
  }

  /**
   * Clear access cache
   */
  private clearAccessCache(): void {
    this.accessCache.clear();
  }

  /**
   * Check network access between segments
   */
  checkNetworkAccess(sourceIP: string, destinationIP: string, port: number, protocol: string): boolean {
    // Simplified network access check
    // In production, implement proper CIDR matching and rule evaluation

    const sourceSegment = this.findSegmentByIP(sourceIP);
    const destinationSegment = this.findSegmentByIP(destinationIP);

    if (!sourceSegment || !destinationSegment) {
      return false; // Deny if segments not found
    }

    // Check if there's a rule allowing this traffic
    return destinationSegment.rules.some(rule => {
      return rule.action === 'ALLOW' &&
             this.matchesNetworkRule(rule, sourceSegment.cidr, destinationIP, port, protocol);
    });
  }

  /**
   * Find network segment by IP address
   */
  private findSegmentByIP(ip: string): NetworkSegment | undefined {
    // Simplified IP-to-segment mapping
    // In production, implement proper CIDR matching
    return Array.from(this.networkSegments.values())[0];
  }

  /**
   * Check if network rule matches the traffic
   */
  private matchesNetworkRule(
    rule: NetworkRule,
    sourceSegment: string,
    destinationIP: string,
    port: number,
    protocol: string
  ): boolean {
    // Simplified rule matching
    // In production, implement comprehensive rule evaluation
    return rule.protocol === protocol || rule.protocol === 'ANY';
  }
}

export const accessControlService = new AccessControlService();