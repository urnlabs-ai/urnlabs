/**
 * Open Policy Agent (OPA) Integration
 * Bridge between Access Control Matrix and OPA policy decisions
 */

import { 
  AccessRequest, 
  AccessDecision, 
  Permission, 
  Role, 
  PolicyConflict,
  AccessCondition
} from './types';
import { OPAIntegrationService } from '../opa/OPAIntegrationService';
import { PolicyManager } from '../opa/PolicyManager';
import { AccessControlMatrix } from './AccessControlMatrix';

export interface OPAPolicyQuery {
  input: {
    user: {
      id: string;
      email: string;
      roles: string[];
      groups: string[];
      attributes: Record<string, any>;
    };
    resource: {
      type: string;
      id: string;
      attributes: Record<string, any>;
    };
    action: string;
    context: {
      time: string;
      ip: string;
      environment: string;
      session: Record<string, any>;
    };
  };
}

export interface OPAPolicyResult {
  allow: boolean;
  reasons: string[];
  conditions: AccessCondition[];
  violations: string[];
  metadata: Record<string, any>;
}

export class OPAIntegration {
  private opaService: OPAIntegrationService;
  private policyManager: PolicyManager;
  private accessMatrix: AccessControlMatrix;

  constructor(
    opaService: OPAIntegrationService,
    policyManager: PolicyManager,
    accessMatrix: AccessControlMatrix
  ) {
    this.opaService = opaService;
    this.policyManager = policyManager;
    this.accessMatrix = accessMatrix;
  }

  /**
   * Evaluate access request using both ACM and OPA
   */
  async evaluateAccessWithOPA(request: AccessRequest): Promise<AccessDecision> {
    try {
      // First, get decision from Access Control Matrix
      const acmDecision = await this.accessMatrix.evaluateAccess(request);
      
      // Prepare OPA query
      const opaQuery = await this.prepareOPAQuery(request);
      
      // Query OPA for additional policy evaluation
      const opaResult = await this.queryOPA(opaQuery);
      
      // Combine decisions
      const finalDecision = this.combineDecisions(acmDecision, opaResult, request);
      
      // Log combined evaluation
      await this.logCombinedEvaluation(request, acmDecision, opaResult, finalDecision);
      
      return finalDecision;
      
    } catch (error) {
      console.error('Error in OPA integration:', error);
      
      // Fallback to ACM-only decision
      return this.accessMatrix.evaluateAccess(request);
    }
  }

  /**
   * Sync ACM roles and permissions to OPA policies
   */
  async syncToOPA(roles: Role[], permissions: Permission[]): Promise<void> {
    try {
      // Convert roles to OPA policies
      const rolePolicies = this.convertRolesToOPAPolicies(roles);
      
      // Convert permissions to OPA policies
      const permissionPolicies = this.convertPermissionsToOPAPolicies(permissions);
      
      // Create comprehensive policy document
      const policyDocument = this.createComprehensivePolicyDocument(rolePolicies, permissionPolicies);
      
      // Upload to OPA
      await this.policyManager.createPolicy({
        name: 'access-control-matrix',
        description: 'Auto-generated policies from Access Control Matrix',
        version: '1.0',
        rules: policyDocument,
        metadata: {
          source: 'ACM',
          syncedAt: new Date().toISOString(),
          rolesCount: roles.length,
          permissionsCount: permissions.length,
        },
      });
      
      console.log(`Successfully synced ${roles.length} roles and ${permissions.length} permissions to OPA`);
      
    } catch (error) {
      console.error('Error syncing to OPA:', error);
      throw new Error(`Failed to sync ACM data to OPA: ${error.message}`);
    }
  }

  /**
   * Validate OPA policies against ACM rules
   */
  async validateOPAPolicies(): Promise<PolicyConflict[]> {
    const conflicts: PolicyConflict[] = [];
    
    try {
      // Get all OPA policies
      const opaPolicies = await this.policyManager.getAllPolicies();
      
      // Check each policy for conflicts with ACM
      for (const policy of opaPolicies) {
        const policyConflicts = await this.detectPolicyConflicts(policy);
        conflicts.push(...policyConflicts);
      }
      
      return conflicts;
      
    } catch (error) {
      console.error('Error validating OPA policies:', error);
      return [];
    }
  }

  /**
   * Create OPA policy from ACM role
   */
  private convertRolesToOPAPolicies(roles: Role[]): string[] {
    const policies: string[] = [];
    
    for (const role of roles) {
      if (!role.isActive) continue;
      
      const rolePolicy = `
# Role: ${role.name}
# Description: ${role.description}
allow {
  input.user.roles[_] == "${role.id}"
  ${this.convertPermissionsToOPAConditions(role.permissions)}
}`;
      
      policies.push(rolePolicy);
    }
    
    return policies;
  }

  /**
   * Convert permissions to OPA policy conditions
   */
  private convertPermissionsToOPAConditions(permissions: Permission[]): string {
    const conditions: string[] = [];
    
    for (const permission of permissions) {
      if (!permission.isActive) continue;
      
      let condition = `input.action == "${permission.action}"`;
      
      // Add resource matching
      if (permission.resource !== '*') {
        if (permission.resource.includes('*')) {
          // Convert glob pattern to OPA regex
          const regexPattern = permission.resource.replace(/\*/g, '.*');
          condition += `\n  regex.match("^${regexPattern}$", input.resource.id)`;
        } else {
          condition += `\n  input.resource.id == "${permission.resource}"`;
        }
      }
      
      // Add access conditions
      if (permission.conditions) {
        for (const accessCondition of permission.conditions) {
          const opaCondition = this.convertAccessConditionToOPA(accessCondition);
          if (opaCondition) {
            condition += `\n  ${opaCondition}`;
          }
        }
      }
      
      // Add effect
      if (permission.effect === 'DENY') {
        condition = `not (${condition})`;
      }
      
      conditions.push(condition);
    }
    
    return conditions.length > 0 ? conditions.join('\n  ') : 'true';
  }

  /**
   * Convert ACM access condition to OPA condition
   */
  private convertAccessConditionToOPA(condition: AccessCondition): string | null {
    switch (condition.type) {
      case 'temporal':
        return this.convertTemporalConditionToOPA(condition);
      case 'context':
        return this.convertContextConditionToOPA(condition);
      case 'attribute':
        return this.convertAttributeConditionToOPA(condition);
      case 'location':
        return this.convertLocationConditionToOPA(condition);
      case 'device':
        return this.convertDeviceConditionToOPA(condition);
      case 'risk':
        return this.convertRiskConditionToOPA(condition);
      default:
        console.warn(`Unknown condition type for OPA conversion: ${condition.type}`);
        return null;
    }
  }

  /**
   * Convert temporal condition to OPA
   */
  private convertTemporalConditionToOPA(condition: AccessCondition): string {
    switch (condition.field) {
      case 'time':
        if (condition.operator === 'between') {
          const [start, end] = condition.value;
          return `time.format(time.now_ns(), "15:04", "UTC") >= "${start}"\n  time.format(time.now_ns(), "15:04", "UTC") <= "${end}"`;
        }
        break;
      case 'day_of_week':
        if (condition.operator === 'in') {
          const days = condition.value.join(', ');
          return `time.weekday(time.now_ns()) in [${days}]`;
        }
        break;
    }
    
    return 'true';
  }

  /**
   * Convert context condition to OPA
   */
  private convertContextConditionToOPA(condition: AccessCondition): string {
    const field = `input.context.${condition.field}`;
    
    switch (condition.operator) {
      case 'equals':
        return `${field} == "${condition.value}"`;
      case 'contains':
        return `contains(${field}, "${condition.value}")`;
      case 'in':
        const values = condition.value.map((v: any) => `"${v}"`).join(', ');
        return `${field} in [${values}]`;
      default:
        return 'true';
    }
  }

  /**
   * Convert attribute condition to OPA
   */
  private convertAttributeConditionToOPA(condition: AccessCondition): string {
    const field = `input.user.attributes.${condition.field}`;
    
    switch (condition.operator) {
      case 'equals':
        return `${field} == "${condition.value}"`;
      case 'gt':
        return `${field} > ${condition.value}`;
      case 'lt':
        return `${field} < ${condition.value}`;
      default:
        return 'true';
    }
  }

  /**
   * Convert location condition to OPA
   */
  private convertLocationConditionToOPA(condition: AccessCondition): string {
    const field = `input.context.location.${condition.field}`;
    
    switch (condition.operator) {
      case 'equals':
        return `${field} == "${condition.value}"`;
      case 'in':
        const values = condition.value.map((v: any) => `"${v}"`).join(', ');
        return `${field} in [${values}]`;
      default:
        return 'true';
    }
  }

  /**
   * Convert device condition to OPA
   */
  private convertDeviceConditionToOPA(condition: AccessCondition): string {
    const field = `input.context.device.${condition.field}`;
    
    switch (condition.operator) {
      case 'equals':
        return `${field} == ${JSON.stringify(condition.value)}`;
      default:
        return 'true';
    }
  }

  /**
   * Convert risk condition to OPA
   */
  private convertRiskConditionToOPA(condition: AccessCondition): string {
    const field = 'input.user.riskScore';
    
    switch (condition.operator) {
      case 'lt':
        return `${field} < ${condition.value}`;
      case 'gt':
        return `${field} > ${condition.value}`;
      case 'equals':
        return `${field} == ${condition.value}`;
      case 'between':
        const [min, max] = condition.value;
        return `${field} >= ${min}\n  ${field} <= ${max}`;
      default:
        return 'true';
    }
  }

  /**
   * Convert permissions to OPA policies
   */
  private convertPermissionsToOPAPolicies(permissions: Permission[]): string[] {
    const policies: string[] = [];
    
    // Group permissions by resource for better organization
    const permissionsByResource = new Map<string, Permission[]>();
    
    for (const permission of permissions) {
      if (!permission.isActive) continue;
      
      if (!permissionsByResource.has(permission.resource)) {
        permissionsByResource.set(permission.resource, []);
      }
      permissionsByResource.get(permission.resource)!.push(permission);
    }
    
    // Create policies for each resource
    for (const [resource, resourcePermissions] of permissionsByResource) {
      const resourcePolicy = `
# Resource: ${resource}
allow {
  ${this.convertPermissionsToOPAConditions(resourcePermissions)}
}`;
      
      policies.push(resourcePolicy);
    }
    
    return policies;
  }

  /**
   * Create comprehensive policy document
   */
  private createComprehensivePolicyDocument(rolePolicies: string[], permissionPolicies: string[]): string {
    return `
package access_control_matrix

import future.keywords.if
import future.keywords.in

# Default deny
default allow = false

# Helper functions
is_admin {
  input.user.roles[_] == "admin"
}

is_emergency_access {
  input.context.emergency == true
}

time_in_business_hours {
  hour := time.format(time.now_ns(), "15", "UTC")
  to_number(hour) >= 9
  to_number(hour) <= 17
}

# Role-based policies
${rolePolicies.join('\n\n')}

# Permission-based policies
${permissionPolicies.join('\n\n')}

# Emergency access override
allow {
  is_emergency_access
  is_admin
}

# High-risk actions require additional validation
require_mfa {
  input.action in ["DELETE", "ADMIN"]
  not input.context.mfa_verified
}

# Audit logging requirements
require_audit {
  input.action in ["CREATE", "UPDATE", "DELETE"]
}

# Geographic restrictions
geographic_restriction {
  input.context.location.country != "US"
  input.resource.sensitivity == "HIGH"
}

deny[msg] {
  require_mfa
  msg := "Multi-factor authentication required for this action"
}

deny[msg] {
  geographic_restriction
  msg := "Access denied due to geographic restrictions"
}
`;
  }

  /**
   * Prepare OPA query from access request
   */
  private async prepareOPAQuery(request: AccessRequest): Promise<OPAPolicyQuery> {
    // Get user details
    const user = await this.getUserForOPA(request.userId);
    
    // Parse resource
    const resource = this.parseResourceForOPA(request.resource);
    
    return {
      input: {
        user,
        resource,
        action: request.action,
        context: {
          time: request.timestamp.toISOString(),
          ip: request.context.ip,
          environment: request.context.environment,
          session: {
            id: request.sessionId,
            mfa_verified: request.context.session?.mfaVerified || false,
            risk_score: request.context.session?.riskScore || 0,
          },
        },
      },
    };
  }

  /**
   * Query OPA with prepared input
   */
  private async queryOPA(query: OPAPolicyQuery): Promise<OPAPolicyResult> {
    try {
      const result = await this.opaService.evaluatePolicy('access_control_matrix', query.input);
      
      return {
        allow: result.allow || false,
        reasons: result.reasons || [],
        conditions: result.conditions || [],
        violations: result.violations || [],
        metadata: result.metadata || {},
      };
      
    } catch (error) {
      console.error('Error querying OPA:', error);
      
      // Return permissive default on OPA failure
      return {
        allow: true,
        reasons: ['OPA query failed - defaulting to permissive'],
        conditions: [],
        violations: [`OPA evaluation error: ${error.message}`],
        metadata: { error: error.message },
      };
    }
  }

  /**
   * Combine ACM and OPA decisions
   */
  private combineDecisions(
    acmDecision: AccessDecision,
    opaResult: OPAPolicyResult,
    request: AccessRequest
  ): AccessDecision {
    // Both systems must allow for final ALLOW
    const finalDecision = acmDecision.decision === 'ALLOW' && opaResult.allow ? 'ALLOW' : 'DENY';
    
    // Combine reasons
    const reasons = [
      `ACM: ${acmDecision.reason}`,
      `OPA: ${opaResult.reasons.join(', ') || (opaResult.allow ? 'Allowed' : 'Denied')}`,
    ];
    
    // Combine conditions
    const conditions = [
      ...(acmDecision.conditions || []),
      ...opaResult.conditions,
    ];
    
    // Combine violations
    const violations = [
      ...(opaResult.violations || []),
    ];
    
    // Adjust risk score if OPA found violations
    let adjustedRiskScore = acmDecision.riskAssessment.totalScore;
    if (violations.length > 0) {
      adjustedRiskScore = Math.min(adjustedRiskScore + violations.length * 10, 100);
    }
    
    return {
      ...acmDecision,
      decision: finalDecision,
      reason: reasons.join(' | '),
      conditions,
      riskAssessment: {
        ...acmDecision.riskAssessment,
        totalScore: adjustedRiskScore,
        violations,
      },
      recommendations: [
        ...acmDecision.recommendations,
        ...violations.map(v => `Address violation: ${v}`),
      ],
      requiresReview: acmDecision.requiresReview || violations.length > 0,
    };
  }

  /**
   * Get user data formatted for OPA
   */
  private async getUserForOPA(userId: string): Promise<any> {
    // This would integrate with UserManager to get user details
    return {
      id: userId,
      email: `user-${userId}@example.com`,
      roles: [],
      groups: [],
      attributes: {},
    };
  }

  /**
   * Parse resource for OPA evaluation
   */
  private parseResourceForOPA(resource: string): any {
    // Parse resource string into structured format
    const parts = resource.split('/');
    
    return {
      type: parts[1] || 'unknown',
      id: resource,
      attributes: {
        path: resource,
        segments: parts,
      },
    };
  }

  /**
   * Detect conflicts between OPA policies and ACM
   */
  private async detectPolicyConflicts(policy: any): Promise<PolicyConflict[]> {
    // Implementation would analyze OPA policy against ACM rules
    return [];
  }

  /**
   * Log combined evaluation for audit
   */
  private async logCombinedEvaluation(
    request: AccessRequest,
    acmDecision: AccessDecision,
    opaResult: OPAPolicyResult,
    finalDecision: AccessDecision
  ): Promise<void> {
    const logEntry = {
      id: finalDecision.id,
      requestId: request.id,
      userId: request.userId,
      resource: request.resource,
      action: request.action,
      acmDecision: acmDecision.decision,
      acmReason: acmDecision.reason,
      opaDecision: opaResult.allow ? 'ALLOW' : 'DENY',
      opaReasons: opaResult.reasons,
      finalDecision: finalDecision.decision,
      finalReason: finalDecision.reason,
      violations: opaResult.violations,
      timestamp: new Date(),
    };
    
    // Log to audit system
    console.log('Combined ACM+OPA evaluation:', logEntry);
  }
}