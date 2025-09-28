import type {
  User,
  Role,
  Permission
} from '../types/auth.js';
import type {
  ResourceAction,
  PermissionCheck,
  PolicyRule,
  PolicyCondition,
  AuthorizationContext,
  AuthorizationResult,
  AccessPattern
} from '../types/rbac.js';
import { SecurityEventService } from '../audit/security-event-service.js';
import { logger } from '../lib/logger.js';

export class AuthorizationService {
  constructor(
    private securityEventService: SecurityEventService
  ) {}

  /**
   * Check if user has permission to perform action on resource
   */
  async checkPermission(check: PermissionCheck): Promise<AuthorizationResult> {
    try {
      const user = await this.getUserWithRolesAndPermissions(check.userId);
      if (!user) {
        return this.createDeniedResult('User not found', check);
      }

      if (!user.isActive) {
        return this.createDeniedResult('User account is inactive', check);
      }

      const context: AuthorizationContext = {
        user: {
          id: user.id,
          roles: user.roles.map(r => r.name),
          attributes: {
            email: user.email,
            username: user.username,
            emailVerified: user.emailVerified,
            mfaEnabled: user.mfaEnabled
          }
        },
        resource: {
          type: check.resource,
          attributes: check.context || {}
        },
        action: check.action,
        environment: {
          ipAddress: check.context?.ipAddress || 'unknown',
          userAgent: check.context?.userAgent || 'unknown',
          timestamp: new Date()
        }
      };

      // Check direct permissions first
      const directPermission = await this.checkDirectPermission(user, check.resource, check.action);
      if (directPermission.allowed) {
        await this.logAccessEvent(context, 'ALLOWED', 'Direct permission');
        return directPermission;
      }

      // Check role-based permissions
      const rolePermission = await this.checkRolePermissions(user, check.resource, check.action);
      if (rolePermission.allowed) {
        await this.logAccessEvent(context, 'ALLOWED', 'Role-based permission');
        return rolePermission;
      }

      // Check policy-based permissions
      const policyPermission = await this.evaluatePolicies(context);
      if (policyPermission.allowed) {
        await this.logAccessEvent(context, 'ALLOWED', 'Policy-based permission');
        return policyPermission;
      }

      // Check resource hierarchy permissions
      const hierarchyPermission = await this.checkResourceHierarchy(user, check.resource, check.action);
      if (hierarchyPermission.allowed) {
        await this.logAccessEvent(context, 'ALLOWED', 'Hierarchy-based permission');
        return hierarchyPermission;
      }

      // Access denied
      const deniedResult = this.createDeniedResult('No matching permissions found', check, context);
      await this.logAccessEvent(context, 'DENIED', deniedResult.reason);
      
      return deniedResult;

    } catch (error) {
      logger.error('Permission check failed', { error, check });
      const errorResult = this.createDeniedResult('Permission check error', check);
      await this.logAccessEvent({} as AuthorizationContext, 'ERROR', error.message);
      return errorResult;
    }
  }

  /**
   * Check multiple permissions at once
   */
  async checkPermissions(checks: PermissionCheck[]): Promise<AuthorizationResult[]> {
    const results = await Promise.allSettled(
      checks.map(check => this.checkPermission(check))
    );

    return results.map((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value;
      } else {
        logger.error('Permission check failed', { error: result.reason, check: checks[index] });
        return this.createDeniedResult('Permission check failed', checks[index]);
      }
    });
  }

  /**
   * Get all permissions for a user
   */
  async getUserPermissions(userId: string): Promise<{
    directPermissions: Permission[];
    rolePermissions: Permission[];
    allPermissions: Permission[];
  }> {
    try {
      const user = await this.getUserWithRolesAndPermissions(userId);
      if (!user) {
        throw new Error('User not found');
      }

      const directPermissions = user.permissions || [];
      const rolePermissions = user.roles.flatMap(role => role.permissions || []);
      
      // Remove duplicates
      const allPermissions = this.deduplicatePermissions([
        ...directPermissions,
        ...rolePermissions
      ]);

      return {
        directPermissions,
        rolePermissions,
        allPermissions
      };
    } catch (error) {
      logger.error('Failed to get user permissions', { error, userId });
      throw error;
    }
  }

  /**
   * Get effective roles for a user (including inherited roles)
   */
  async getUserEffectiveRoles(userId: string): Promise<Role[]> {
    try {
      const user = await this.getUserWithRolesAndPermissions(userId);
      if (!user) {
        throw new Error('User not found');
      }

      const directRoles = user.roles || [];
      const inheritedRoles = await this.getInheritedRoles(directRoles);
      
      return this.deduplicateRoles([...directRoles, ...inheritedRoles]);
    } catch (error) {
      logger.error('Failed to get effective roles', { error, userId });
      throw error;
    }
  }

  /**
   * Evaluate policy rules against context
   */
  async evaluatePolicies(context: AuthorizationContext): Promise<AuthorizationResult> {
    try {
      const policies = await this.getApplicablePolicies(context);
      const appliedPolicies: string[] = [];
      let finalDecision = false;
      let reason = 'No applicable policies';

      // Sort policies by priority (higher priority first)
      const sortedPolicies = policies.sort((a, b) => b.priority - a.priority);

      for (const policy of sortedPolicies) {
        if (await this.evaluatePolicy(policy, context)) {
          appliedPolicies.push(policy.id);
          
          if (policy.effect === 'ALLOW') {
            finalDecision = true;
            reason = `Allowed by policy: ${policy.name}`;
            break; // First ALLOW wins
          } else if (policy.effect === 'DENY') {
            finalDecision = false;
            reason = `Denied by policy: ${policy.name}`;
            break; // DENY takes precedence
          }
        }
      }

      return {
        allowed: finalDecision,
        reason,
        appliedPolicies,
        context,
        evaluatedAt: new Date()
      };
    } catch (error) {
      logger.error('Policy evaluation failed', { error, context });
      return this.createDeniedResult('Policy evaluation error', context);
    }
  }

  /**
   * Create or update a policy rule
   */
  async createPolicy(policy: Omit<PolicyRule, 'id' | 'createdAt' | 'updatedAt'>): Promise<PolicyRule> {
    try {
      const newPolicy: PolicyRule = {
        ...policy,
        id: this.generateId(),
        createdAt: new Date(),
        updatedAt: new Date()
      };

      await this.storePolicyRule(newPolicy);
      
      logger.info('Policy created', { policyId: newPolicy.id, name: newPolicy.name });
      return newPolicy;
    } catch (error) {
      logger.error('Failed to create policy', { error, policy });
      throw error;
    }
  }

  /**
   * Analyze access patterns for anomaly detection
   */
  async analyzeAccessPatterns(userId: string, timeframe: {
    startDate: Date;
    endDate: Date;
  }): Promise<{
    patterns: AccessPattern[];
    anomalies: AccessPattern[];
    riskScore: number;
  }> {
    try {
      const accessEvents = await this.getAccessEvents(userId, timeframe);
      const patterns = this.buildAccessPatterns(accessEvents);
      const anomalies = this.detectAnomalies(patterns);
      const riskScore = this.calculateRiskScore(patterns, anomalies);

      return {
        patterns,
        anomalies,
        riskScore
      };
    } catch (error) {
      logger.error('Access pattern analysis failed', { error, userId });
      throw error;
    }
  }

  /**
   * Generate permission report for compliance
   */
  async generatePermissionReport(filters?: {
    userIds?: string[];
    resources?: string[];
    startDate?: Date;
    endDate?: Date;
  }): Promise<{
    users: Array<{
      userId: string;
      username: string;
      roles: string[];
      permissions: string[];
      lastAccess: Date;
      riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
    }>;
    roles: Array<{
      roleName: string;
      permissions: string[];
      userCount: number;
    }>;
    resources: Array<{
      resource: string;
      authorizedUsers: number;
      recentAccess: number;
    }>;
    summary: {
      totalUsers: number;
      totalRoles: number;
      totalPermissions: number;
      totalResources: number;
    };
  }> {
    try {
      // TODO: Implement comprehensive permission reporting
      throw new Error('Permission report generation not implemented yet');
    } catch (error) {
      logger.error('Permission report generation failed', { error, filters });
      throw error;
    }
  }

  /**
   * Check direct user permissions
   */
  private async checkDirectPermission(user: User, resource: string, action: string): Promise<AuthorizationResult> {
    const permission = user.permissions?.find(p => 
      p.resource === resource && p.action === action
    );

    if (permission) {
      return {
        allowed: true,
        reason: `Direct permission: ${permission.name}`,
        appliedPolicies: [],
        context: {} as AuthorizationContext,
        evaluatedAt: new Date()
      };
    }

    return this.createDeniedResult('No direct permission', { userId: user.id, resource, action });
  }

  /**
   * Check role-based permissions
   */
  private async checkRolePermissions(user: User, resource: string, action: string): Promise<AuthorizationResult> {
    for (const role of user.roles) {
      const permission = role.permissions?.find(p => 
        p.resource === resource && p.action === action
      );
      
      if (permission) {
        return {
          allowed: true,
          reason: `Role permission: ${role.name} -> ${permission.name}`,
          appliedPolicies: [],
          context: {} as AuthorizationContext,
          evaluatedAt: new Date()
        };
      }
    }

    return this.createDeniedResult('No role permission', { userId: user.id, resource, action });
  }

  /**
   * Check resource hierarchy for inherited permissions
   */
  private async checkResourceHierarchy(user: User, resource: string, action: string): Promise<AuthorizationResult> {
    // TODO: Implement resource hierarchy checking
    return this.createDeniedResult('No hierarchy permission', { userId: user.id, resource, action });
  }

  /**
   * Evaluate a single policy against context
   */
  private async evaluatePolicy(policy: PolicyRule, context: AuthorizationContext): Promise<boolean> {
    try {
      // Check if policy is active
      if (!policy.isActive) {
        return false;
      }

      // Check subjects (users, roles, groups)
      const subjectMatch = this.matchSubjects(policy.subjects, context);
      if (!subjectMatch) {
        return false;
      }

      // Check actions
      const actionMatch = policy.actions.includes('*') || policy.actions.includes(context.action);
      if (!actionMatch) {
        return false;
      }

      // Check resources
      const resourceMatch = policy.resources.includes('*') || 
        policy.resources.includes(context.resource.type) ||
        policy.resources.some(r => this.matchWildcard(r, context.resource.type));
      if (!resourceMatch) {
        return false;
      }

      // Check conditions
      if (policy.conditions && policy.conditions.length > 0) {
        const conditionsMatch = await this.evaluateConditions(policy.conditions, context);
        if (!conditionsMatch) {
          return false;
        }
      }

      return true;
    } catch (error) {
      logger.error('Policy evaluation error', { error, policyId: policy.id });
      return false;
    }
  }

  /**
   * Evaluate policy conditions
   */
  private async evaluateConditions(conditions: PolicyCondition[], context: AuthorizationContext): Promise<boolean> {
    for (const condition of conditions) {
      const value = this.extractContextValue(condition.field, context);
      const result = this.evaluateCondition(condition, value);
      
      if (!result) {
        return false;
      }
    }
    
    return true;
  }

  /**
   * Evaluate a single condition
   */
  private evaluateCondition(condition: PolicyCondition, value: any): boolean {
    const { operator, value: expectedValue } = condition;

    switch (operator) {
      case 'eq':
        return value === expectedValue;
      case 'ne':
        return value !== expectedValue;
      case 'gt':
        return value > expectedValue;
      case 'gte':
        return value >= expectedValue;
      case 'lt':
        return value < expectedValue;
      case 'lte':
        return value <= expectedValue;
      case 'in':
        return Array.isArray(expectedValue) && expectedValue.includes(value);
      case 'nin':
        return Array.isArray(expectedValue) && !expectedValue.includes(value);
      case 'contains':
        return typeof value === 'string' && value.includes(expectedValue);
      case 'startsWith':
        return typeof value === 'string' && value.startsWith(expectedValue);
      case 'endsWith':
        return typeof value === 'string' && value.endsWith(expectedValue);
      default:
        return false;
    }
  }

  /**
   * Extract value from context based on field path
   */
  private extractContextValue(field: string, context: AuthorizationContext): any {
    const path = field.split('.');
    let current: any = context;
    
    for (const segment of path) {
      if (current && typeof current === 'object' && segment in current) {
        current = current[segment];
      } else {
        return undefined;
      }
    }
    
    return current;
  }

  /**
   * Match policy subjects against context
   */
  private matchSubjects(subjects: string[], context: AuthorizationContext): boolean {
    if (subjects.includes('*')) {
      return true;
    }

    // Check user ID
    if (subjects.includes(context.user.id)) {
      return true;
    }

    // Check roles
    for (const role of context.user.roles) {
      if (subjects.includes(role)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Match wildcard patterns
   */
  private matchWildcard(pattern: string, value: string): boolean {
    if (pattern === '*') {
      return true;
    }
    
    const regex = new RegExp(pattern.replace(/\*/g, '.*'));
    return regex.test(value);
  }

  /**
   * Create denied authorization result
   */
  private createDeniedResult(
    reason: string, 
    check: PermissionCheck | AuthorizationContext, 
    context?: AuthorizationContext
  ): AuthorizationResult {
    return {
      allowed: false,
      reason,
      appliedPolicies: [],
      context: context || {} as AuthorizationContext,
      evaluatedAt: new Date()
    };
  }

  /**
   * Remove duplicate permissions
   */
  private deduplicatePermissions(permissions: Permission[]): Permission[] {
    const seen = new Set<string>();
    return permissions.filter(permission => {
      const key = `${permission.resource}:${permission.action}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  /**
   * Remove duplicate roles
   */
  private deduplicateRoles(roles: Role[]): Role[] {
    const seen = new Set<string>();
    return roles.filter(role => {
      if (seen.has(role.id)) {
        return false;
      }
      seen.add(role.id);
      return true;
    });
  }

  /**
   * Log access event for audit trail
   */
  private async logAccessEvent(
    context: AuthorizationContext, 
    result: 'ALLOWED' | 'DENIED' | 'ERROR', 
    reason: string
  ): Promise<void> {
    try {
      await this.securityEventService.logSecurityEvent({
        userId: context.user?.id,
        eventType: result === 'DENIED' ? 'PERMISSION_DENIED' as any : 'LOGIN_SUCCESS' as any,
        description: `Access ${result.toLowerCase()}: ${reason}`,
        severity: result === 'DENIED' ? 'MEDIUM' as any : 'LOW' as any,
        ipAddress: context.environment?.ipAddress || 'unknown',
        userAgent: context.environment?.userAgent || 'unknown',
        metadata: {
          resource: context.resource?.type,
          action: context.action,
          result,
          reason
        }
      });
    } catch (error) {
      logger.error('Failed to log access event', { error });
    }
  }

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return `pol_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Database and external service methods (to be implemented)
  private async getUserWithRolesAndPermissions(userId: string): Promise<User | null> {
    // TODO: Implement database query
    throw new Error('Not implemented');
  }

  private async getInheritedRoles(roles: Role[]): Promise<Role[]> {
    // TODO: Implement role hierarchy resolution
    return [];
  }

  private async getApplicablePolicies(context: AuthorizationContext): Promise<PolicyRule[]> {
    // TODO: Implement policy retrieval
    return [];
  }

  private async storePolicyRule(policy: PolicyRule): Promise<void> {
    // TODO: Implement policy storage
    throw new Error('Not implemented');
  }

  private async getAccessEvents(userId: string, timeframe: any): Promise<any[]> {
    // TODO: Implement access event retrieval
    return [];
  }

  private buildAccessPatterns(events: any[]): AccessPattern[] {
    // TODO: Implement access pattern analysis
    return [];
  }

  private detectAnomalies(patterns: AccessPattern[]): AccessPattern[] {
    // TODO: Implement anomaly detection
    return [];
  }

  private calculateRiskScore(patterns: AccessPattern[], anomalies: AccessPattern[]): number {
    // TODO: Implement risk score calculation
    return 0;
  }
}