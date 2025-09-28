import { PrismaClient } from '@prisma/client';
import {
  PermissionCheckRequest,
  PermissionCheckResult,
  parsePermission,
  isHighRiskPermission,
  getRequiredApprovalLevel,
  SYSTEM_ROLES,
  type Role,
  type UserPermission,
  type PermissionConditions,
} from '@/lib/schemas/rbac.js';
import { logSecurityEvent } from '@/lib/logger.js';
import { PermissionCacheManager } from '@/lib/redis.js';

export interface AuthorizationContext {
  userId: string;
  organizationId?: string;
  sessionId?: string;
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
  timestamp?: Date;
}

export interface PolicyContext {
  policyId?: string;
  policyType?: string;
  policyCategory?: string;
  complianceFrameworks?: string[];
  riskLevel?: string;
}

export interface ResourceContext {
  resourceType: string;
  resourceId?: string;
  ownerId?: string;
  organizationId?: string;
  metadata?: Record<string, any>;
}

export class AuthorizationService {
  constructor(private prisma: PrismaClient) {}

  /**
   * Enhanced permission check with policy-aware evaluation
   */
  async checkPermission(
    request: PermissionCheckRequest,
    policyContext?: PolicyContext,
    resourceContext?: ResourceContext
  ): Promise<PermissionCheckResult> {
    const startTime = Date.now();
    const cacheKey = this.buildCacheKey(request, policyContext, resourceContext);

    // Check cache first
    const cached = await this.getFromCache(cacheKey);
    if (cached) {
      return {
        ...cached,
        metadata: {
          ...cached.metadata,
          cacheHit: true,
        },
      };
    }

    try {
      const result = await this.evaluatePermission(request, policyContext, resourceContext);

      // Cache successful results
      if (result.allowed || result.source === 'denied') {
        await this.setCache(cacheKey, result);
      }

      // Log security event for sensitive permissions
      if (isHighRiskPermission(request.permission)) {
        await this.logPermissionCheck(request, result, policyContext, resourceContext);
      }

      const evaluationTimeMs = Date.now() - startTime;
      return {
        ...result,
        metadata: {
          ...result.metadata,
          evaluationTimeMs,
          cacheHit: false,
        },
      };
    } catch (error) {
      const evaluationTimeMs = Date.now() - startTime;
      const errorResult: PermissionCheckResult = {
        allowed: false,
        reason: error instanceof Error ? error.message : 'Authorization evaluation failed',
        source: 'denied',
        metadata: {
          checkTimestamp: new Date(),
          evaluationTimeMs,
          rulesEvaluated: 0,
          cacheHit: false,
        },
      };

      // Log authorization errors
      logSecurityEvent('authorization_error', 'high', {
        userId: request.userId,
        permission: request.permission,
        error: error instanceof Error ? error.message : 'Unknown error',
        context: request.context,
      });

      return errorResult;
    }
  }

  /**
   * Check multiple permissions at once for efficiency
   */
  async checkMultiplePermissions(
    userId: string,
    permissions: string[],
    context: AuthorizationContext,
    resourceContext?: ResourceContext
  ): Promise<Record<string, PermissionCheckResult>> {
    const results: Record<string, PermissionCheckResult> = {};

    // Process permissions in parallel
    const checkPromises = permissions.map(async (permission) => {
      const request: PermissionCheckRequest = {
        userId,
        permission,
        resourceType: resourceContext?.resourceType,
        resourceId: resourceContext?.resourceId,
        context: {
          organizationId: context.organizationId,
          sessionId: context.sessionId,
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
          timestamp: context.timestamp,
        },
      };

      const result = await this.checkPermission(request, undefined, resourceContext);
      return { permission, result };
    });

    const resolvedChecks = await Promise.all(checkPromises);
    resolvedChecks.forEach(({ permission, result }) => {
      results[permission] = result;
    });

    return results;
  }

  /**
   * Get effective permissions for a user including role-based and direct permissions
   */
  async getUserEffectivePermissions(
    userId: string,
    organizationId?: string,
    resourceType?: string,
    resourceId?: string
  ): Promise<{
    permissions: UserPermission[];
    roles: Role[];
    summary: {
      totalPermissions: number;
      directPermissions: number;
      roleBasedPermissions: number;
      highRiskPermissions: string[];
    };
  }> {
    // Check cache first
    try {
      const cachedPermissions = await PermissionCacheManager.getCachedUserPermissions(
        userId,
        organizationId,
        resourceType,
        resourceId
      );
      if (cachedPermissions) {
        return cachedPermissions;
      }
    } catch (error) {
      // Log cache error but continue with database lookup
      logSecurityEvent('cache_error', 'low', {
        userId,
        operation: 'getUserEffectivePermissions',
        error: error instanceof Error ? error.message : 'Unknown cache error',
      });
    }
    // Get direct permissions
    const directPermissions = await this.prisma.userPermission.findMany({
      where: {
        userId,
        isActive: true,
        ...(resourceType && { resourceType }),
        ...(resourceId && { resourceId }),
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: new Date() } },
        ],
      },
    });

    // Get user roles and their permissions
    const userRoles = await this.prisma.userRole.findMany({
      where: {
        userId,
        isActive: true,
        ...(resourceType && { resourceType }),
        ...(resourceId && { resourceId }),
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: new Date() } },
        ],
      },
      include: {
        role: {
          include: {
            permissions: true,
          },
        },
      },
    });

    // Extract role-based permissions
    const roleBasedPermissions: UserPermission[] = [];
    const roles: Role[] = [];

    userRoles.forEach((userRole) => {
      roles.push(userRole.role as Role);

      userRole.role.permissions.forEach((rolePermission) => {
        roleBasedPermissions.push({
          id: `role-${rolePermission.id}`,
          userId,
          permission: rolePermission.permission,
          resourceType: rolePermission.resourceType,
          resourceId: resourceId || null,
          grantedBy: userRole.assignedBy,
          grantedAt: userRole.assignedAt,
          expiresAt: userRole.expiresAt,
          isActive: true,
          conditions: rolePermission.conditions as PermissionConditions,
        });
      });
    });

    // Combine and deduplicate permissions
    const allPermissions = [...directPermissions, ...roleBasedPermissions];
    const uniquePermissions = this.deduplicatePermissions(allPermissions);

    // Identify high-risk permissions
    const highRiskPermissions = uniquePermissions
      .filter(p => isHighRiskPermission(p.permission))
      .map(p => p.permission);

    const result = {
      permissions: uniquePermissions,
      roles,
      summary: {
        totalPermissions: uniquePermissions.length,
        directPermissions: directPermissions.length,
        roleBasedPermissions: roleBasedPermissions.length,
        highRiskPermissions,
      },
    };

    // Cache the result
    try {
      await PermissionCacheManager.cacheUserPermissions(
        userId,
        organizationId,
        resourceType,
        resourceId,
        result
      );
    } catch (error) {
      // Log cache error but don't fail the operation
      logSecurityEvent('cache_error', 'low', {
        userId,
        operation: 'cacheUserPermissions',
        error: error instanceof Error ? error.message : 'Unknown cache error',
      });
    }

    return result;
  }

  /**
   * Policy-aware permission evaluation with approval workflows
   */
  async evaluatePermissionForPolicy(
    userId: string,
    permission: string,
    policyId: string,
    context: AuthorizationContext
  ): Promise<{
    allowed: boolean;
    requiresApproval: boolean;
    approvalLevel: 'none' | 'manager' | 'admin';
    conditions: PermissionConditions;
    delegated: boolean;
  }> {
    // Get policy details
    const policy = await this.prisma.policy.findUnique({
      where: { id: policyId },
      include: {
        organization: true,
        owner: true,
        assignments: {
          where: { isActive: true },
        },
      },
    });

    if (!policy) {
      throw new Error(`Policy not found: ${policyId}`);
    }

    // Check basic permission
    const permissionResult = await this.checkPermission({
      userId,
      permission,
      resourceType: 'policy',
      resourceId: policyId,
      context,
    });

    if (!permissionResult.allowed) {
      return {
        allowed: false,
        requiresApproval: false,
        approvalLevel: 'none',
        conditions: {},
        delegated: false,
      };
    }

    // Check if user has delegated access through policy assignments
    const hasDelegatedAccess = policy.assignments.some(
      assignment => assignment.assigneeType === 'user' && assignment.assigneeId === userId
    );

    // Determine approval requirements
    const approvalLevel = getRequiredApprovalLevel(permission);
    const requiresApproval = approvalLevel !== 'none' ||
                            policy.riskLevel === 'critical' ||
                            policy.complianceFrameworks.length > 0;

    // Build conditions based on policy context
    const conditions: PermissionConditions = {
      requires_approval: requiresApproval,
      scope: hasDelegatedAccess ? 'assigned_resources' : 'organization',
      framework_scope: policy.complianceFrameworks.length > 0,
      category: policy.category,
      ...(permissionResult.conditions || {}),
    };

    return {
      allowed: true,
      requiresApproval,
      approvalLevel,
      conditions,
      delegated: hasDelegatedAccess,
    };
  }

  /**
   * Create approval workflow for sensitive policy operations
   */
  async createApprovalWorkflow(
    requesterId: string,
    permission: string,
    resourceType: string,
    resourceId: string,
    justification: string,
    context: AuthorizationContext
  ): Promise<{
    workflowId: string;
    requiredApprovers: string[];
    approvalLevel: 'manager' | 'admin';
  }> {
    const approvalLevel = getRequiredApprovalLevel(permission);

    if (approvalLevel === 'none') {
      throw new Error('Approval workflow not required for this permission');
    }

    // Find required approvers based on organizational hierarchy
    const requiredApprovers = await this.findRequiredApprovers(
      requesterId,
      approvalLevel,
      context.organizationId
    );

    // Create workflow record (simplified - in production would integrate with workflow engine)
    const workflow = await this.prisma.auditLog.create({
      data: {
        eventId: `approval-${Date.now()}`,
        eventType: 'approval_workflow_created',
        resourceType,
        resourceId,
        actorType: 'user',
        actorId: requesterId,
        organizationId: context.organizationId,
        action: 'request_approval',
        outcome: 'pending',
        severity: 'info',
        metadata: {
          permission,
          justification,
          requiredApprovers,
          approvalLevel,
          context,
        },
        eventHash: this.generateEventHash({
          permission,
          resourceType,
          resourceId,
          requesterId,
          timestamp: new Date(),
        }),
      },
    });

    // Log security event
    logSecurityEvent('approval_workflow_created', 'info', {
      workflowId: workflow.id,
      requesterId,
      permission,
      resourceType,
      resourceId,
      approvalLevel,
      requiredApprovers,
    });

    return {
      workflowId: workflow.id,
      requiredApprovers,
      approvalLevel,
    };
  }

  /**
   * Assign policy management permissions to user/role
   */
  async assignPolicyPermissions(
    assigneeType: 'user' | 'role',
    assigneeId: string,
    permissions: string[],
    policyIds: string[],
    assignedBy: string,
    expiresAt?: Date
  ): Promise<void> {
    const validPermissions = permissions.filter(p => {
      try {
        const { category } = parsePermission(p);
        return ['policy_management', 'compliance', 'enforcement'].includes(category);
      } catch {
        return false;
      }
    });

    if (validPermissions.length === 0) {
      throw new Error('No valid policy management permissions provided');
    }

    if (assigneeType === 'user') {
      // Create direct user permissions for each policy
      const userPermissions = policyIds.flatMap(policyId =>
        validPermissions.map(permission => ({
          userId: assigneeId,
          permission,
          resourceType: 'policy' as const,
          resourceId: policyId,
          grantedBy: assignedBy,
          grantedAt: new Date(),
          expiresAt,
          isActive: true,
          conditions: {
            requires_approval: isHighRiskPermission(permission),
            scope: 'assigned_resources' as const,
          },
        }))
      );

      await this.prisma.userPermission.createMany({
        data: userPermissions,
      });
    } else {
      // Create role permissions
      const rolePermissions = validPermissions.map(permission => ({
        roleId: assigneeId,
        permission,
        resourceType: 'policy' as const,
        conditions: {
          requires_approval: isHighRiskPermission(permission),
          scope: 'organization' as const,
        },
      }));

      await this.prisma.rolePermission.createMany({
        data: rolePermissions,
      });
    }

    // Log assignment
    logSecurityEvent('policy_permissions_assigned', 'info', {
      assigneeType,
      assigneeId,
      permissions: validPermissions,
      policyIds,
      assignedBy,
      expiresAt,
    });
  }

  /**
   * Initialize system roles for policy management
   */
  async initializeSystemRoles(organizationId: string): Promise<void> {
    const existingRoles = await this.prisma.role.findMany({
      where: {
        organizationId,
        isSystemRole: true,
      },
    });

    const existingRoleNames = new Set(existingRoles.map(r => r.name));

    // Create missing system roles
    for (const [roleKey, roleData] of Object.entries(SYSTEM_ROLES)) {
      if (!existingRoleNames.has(roleData.name)) {
        // Create role
        const role = await this.prisma.role.create({
          data: {
            id: roleData.id,
            name: roleData.name,
            displayName: roleData.displayName,
            description: roleData.description,
            scope: 'organization',
            organizationId,
            isSystemRole: true,
            isActive: true,
          },
        });

        // Create role permissions
        const rolePermissions = roleData.permissions.map(permission => ({
          roleId: role.id,
          permission,
          resourceType: this.extractResourceTypeFromPermission(permission),
          conditions: {
            requires_approval: isHighRiskPermission(permission),
            scope: 'organization' as const,
          },
        }));

        await this.prisma.rolePermission.createMany({
          data: rolePermissions,
        });
      }
    }
  }

  // Private helper methods

  private async evaluatePermission(
    request: PermissionCheckRequest,
    policyContext?: PolicyContext,
    resourceContext?: ResourceContext
  ): Promise<PermissionCheckResult> {
    let rulesEvaluated = 0;
    const checkTimestamp = new Date();

    // Get user's effective permissions
    const effectivePermissions = await this.getUserEffectivePermissions(
      request.userId,
      request.context?.organizationId,
      request.resourceType,
      request.resourceId
    );

    rulesEvaluated += effectivePermissions.permissions.length;

    // Find matching permissions
    const matchingPermission = effectivePermissions.permissions.find(p =>
      p.permission === request.permission &&
      (!request.resourceType || p.resourceType === request.resourceType) &&
      (!request.resourceId || p.resourceId === request.resourceId)
    );

    if (!matchingPermission) {
      return {
        allowed: false,
        reason: 'Permission not granted',
        source: 'denied',
        metadata: {
          checkTimestamp,
          evaluationTimeMs: 0, // Will be set by caller
          rulesEvaluated,
        },
      };
    }

    // Evaluate conditions
    const conditionsResult = await this.evaluateConditions(
      matchingPermission.conditions,
      request,
      policyContext,
      resourceContext
    );

    if (!conditionsResult.allowed) {
      return {
        allowed: false,
        reason: conditionsResult.reason,
        source: 'denied',
        conditions: matchingPermission.conditions,
        metadata: {
          checkTimestamp,
          evaluationTimeMs: 0, // Will be set by caller
          rulesEvaluated,
        },
      };
    }

    return {
      allowed: true,
      reason: 'Permission granted',
      source: matchingPermission.grantedBy ? 'direct' : 'role',
      conditions: matchingPermission.conditions,
      requiresApproval: matchingPermission.conditions.requires_approval || false,
      riskLevel: isHighRiskPermission(request.permission) ? 'high' : 'medium',
      metadata: {
        checkTimestamp,
        evaluationTimeMs: 0, // Will be set by caller
        rulesEvaluated,
      },
    };
  }

  private async evaluateConditions(
    conditions: PermissionConditions,
    request: PermissionCheckRequest,
    policyContext?: PolicyContext,
    resourceContext?: ResourceContext
  ): Promise<{ allowed: boolean; reason: string }> {
    // Check scope restrictions
    if (conditions.scope) {
      switch (conditions.scope) {
        case 'own_policies':
          if (resourceContext?.ownerId !== request.userId) {
            return { allowed: false, reason: 'Access limited to own policies' };
          }
          break;
        case 'organization':
          if (!request.context?.organizationId ||
              resourceContext?.organizationId !== request.context.organizationId) {
            return { allowed: false, reason: 'Access limited to organization resources' };
          }
          break;
        case 'assigned_resources':
          // Would check if user has explicit assignment to the resource
          // For now, allow if resourceId is specified
          if (!request.resourceId) {
            return { allowed: false, reason: 'Access limited to assigned resources' };
          }
          break;
      }
    }

    // Check time restrictions
    if (conditions.time_restrictions) {
      const now = new Date();
      const currentTime = now.getHours() * 60 + now.getMinutes();
      const currentDay = now.getDay();

      if (conditions.time_restrictions.start_time && conditions.time_restrictions.end_time) {
        const [startHour, startMin] = conditions.time_restrictions.start_time.split(':').map(Number);
        const [endHour, endMin] = conditions.time_restrictions.end_time.split(':').map(Number);
        const startTime = startHour * 60 + startMin;
        const endTime = endHour * 60 + endMin;

        if (currentTime < startTime || currentTime > endTime) {
          return { allowed: false, reason: 'Access outside allowed time window' };
        }
      }

      if (conditions.time_restrictions.days_of_week?.length) {
        if (!conditions.time_restrictions.days_of_week.includes(currentDay)) {
          return { allowed: false, reason: 'Access not allowed on this day' };
        }
      }
    }

    // Check IP restrictions
    if (conditions.ip_restrictions?.length && request.context?.ipAddress) {
      const allowed = conditions.ip_restrictions.some(pattern => {
        // Simple pattern matching - in production would use proper CIDR matching
        return request.context!.ipAddress!.includes(pattern);
      });

      if (!allowed) {
        return { allowed: false, reason: 'Access denied from this IP address' };
      }
    }

    // Check framework scope for compliance-related operations
    if (conditions.framework_scope && policyContext?.complianceFrameworks?.length) {
      const { category } = parsePermission(request.permission);
      if (category === 'compliance' && !policyContext.complianceFrameworks.length) {
        return { allowed: false, reason: 'Compliance operations require framework context' };
      }
    }

    return { allowed: true, reason: 'All conditions satisfied' };
  }

  private buildCacheKey(
    request: PermissionCheckRequest,
    policyContext?: PolicyContext,
    resourceContext?: ResourceContext
  ): string {
    const parts = [
      request.userId,
      request.permission,
      request.resourceType || '',
      request.resourceId || '',
      request.context?.organizationId || '',
      policyContext?.policyId || '',
      resourceContext?.resourceType || '',
      resourceContext?.resourceId || '',
    ];
    return parts.join(':');
  }

  private async getFromCache(cacheKey: string): Promise<PermissionCheckResult | null> {
    try {
      const [userId, permission, resourceType, resourceId, organizationId] = cacheKey.split(':');
      const cached = await PermissionCacheManager.getCachedPermissionCheck(
        userId,
        permission,
        resourceType || undefined,
        resourceId || undefined,
        organizationId || undefined
      );
      return cached;
    } catch (error) {
      // Log cache error but don't fail the permission check
      logSecurityEvent('cache_error', 'low', {
        cacheKey,
        operation: 'get',
        error: error instanceof Error ? error.message : 'Unknown cache error',
      });
      return null;
    }
  }

  private async setCache(cacheKey: string, result: PermissionCheckResult): Promise<void> {
    try {
      const [userId, permission, resourceType, resourceId, organizationId] = cacheKey.split(':');
      await PermissionCacheManager.cachePermissionCheck(
        userId,
        permission,
        resourceType || undefined,
        resourceId || undefined,
        organizationId || undefined,
        result.allowed,
        {
          reason: result.reason,
          source: result.source,
          conditions: result.conditions,
          evaluationTimeMs: result.metadata?.evaluationTimeMs,
          rulesEvaluated: result.metadata?.rulesEvaluated,
        }
      );
    } catch (error) {
      // Log cache error but don't fail the permission check
      logSecurityEvent('cache_error', 'low', {
        cacheKey,
        operation: 'set',
        error: error instanceof Error ? error.message : 'Unknown cache error',
      });
    }
  }

  private async logPermissionCheck(
    request: PermissionCheckRequest,
    result: PermissionCheckResult,
    policyContext?: PolicyContext,
    resourceContext?: ResourceContext
  ): Promise<void> {
    logSecurityEvent('permission_check', result.allowed ? 'info' : 'warning', {
      userId: request.userId,
      permission: request.permission,
      allowed: result.allowed,
      reason: result.reason,
      source: result.source,
      policyContext,
      resourceContext,
      context: request.context,
    });
  }

  private deduplicatePermissions(permissions: UserPermission[]): UserPermission[] {
    const seen = new Set<string>();
    const unique: UserPermission[] = [];

    for (const permission of permissions) {
      const key = `${permission.permission}:${permission.resourceType}:${permission.resourceId || ''}`;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(permission);
      }
    }

    return unique;
  }

  private async findRequiredApprovers(
    requesterId: string,
    approvalLevel: 'manager' | 'admin',
    organizationId?: string
  ): Promise<string[]> {
    // Find users with appropriate approval roles
    const approverRoles = approvalLevel === 'admin'
      ? ['policy_administrator', 'compliance_officer']
      : ['policy_manager', 'policy_administrator', 'compliance_officer'];

    const approvers = await this.prisma.userRole.findMany({
      where: {
        isActive: true,
        role: {
          name: { in: approverRoles },
          organizationId,
          isActive: true,
        },
        user: {
          id: { not: requesterId }, // Don't include the requester
          isActive: true,
        },
      },
      include: {
        user: {
          select: { id: true, email: true, firstName: true, lastName: true },
        },
      },
    });

    return approvers.map(a => a.user.id);
  }

  private extractResourceTypeFromPermission(permission: string): string {
    try {
      const { resourceType } = parsePermission(permission);
      return resourceType;
    } catch {
      return 'global';
    }
  }

  private generateEventHash(data: Record<string, any>): string {
    // Simple hash function - in production would use crypto.createHash
    return Buffer.from(JSON.stringify(data)).toString('base64').slice(0, 32);
  }
}