import { PrismaClient } from '@prisma/client';
import {
  Role,
  UserRoleAssignment,
  BulkRoleAssignment,
  BulkPermissionGrant,
  SYSTEM_ROLES,
  validateRole,
  validateRoleAssignment,
  isHighRiskPermission,
  parsePermission,
  type PermissionConditions,
} from '@/lib/schemas/rbac.js';
import { logSecurityEvent } from '@/lib/logger.js';

export interface RoleTemplate {
  name: string;
  displayName: string;
  description: string;
  permissions: string[];
  conditions?: PermissionConditions;
  inheritFrom?: string[]; // Other roles to inherit permissions from
}

export interface RoleDelegation {
  id: string;
  fromUserId: string;
  toUserId: string;
  roleId: string;
  delegatedPermissions: string[];
  conditions: PermissionConditions;
  expiresAt: Date;
  isActive: boolean;
}

export interface PolicyRoleBinding {
  roleId: string;
  policyIds: string[];
  permissions: string[];
  scope: 'read' | 'manage' | 'admin';
  conditions?: PermissionConditions;
}

export class RoleManagementService {
  constructor(private prisma: PrismaClient) {}

  /**
   * Create a custom role with fine-grained permissions
   */
  async createRole(
    roleData: Omit<Role, 'id' | 'createdAt' | 'updatedAt'>,
    permissions: string[],
    createdBy: string
  ): Promise<Role> {
    try {
      // Validate role data
      const validatedRole = validateRole({
        ...roleData,
        id: `role_${Date.now()}`,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Validate permissions format
      const validPermissions = permissions.filter(permission => {
        try {
          parsePermission(permission);
          return true;
        } catch {
          return false;
        }
      });

      if (validPermissions.length === 0) {
        throw new Error('No valid permissions provided');
      }

      // Check for high-risk permissions and require elevated authorization
      const highRiskPermissions = validPermissions.filter(isHighRiskPermission);
      if (highRiskPermissions.length > 0) {
        // In production, would require additional approval workflow
        logSecurityEvent('high_risk_role_creation', 'warning', {
          roleName: roleData.name,
          createdBy,
          highRiskPermissions,
        });
      }

      // Create role and permissions in transaction
      const result = await this.prisma.$transaction(async (tx) => {
        // Create the role
        const role = await tx.role.create({
          data: {
            id: validatedRole.id,
            name: validatedRole.name,
            displayName: validatedRole.displayName,
            description: validatedRole.description,
            scope: validatedRole.scope,
            organizationId: validatedRole.organizationId,
            isSystemRole: false,
            isActive: true,
            createdBy,
          },
        });

        // Create role permissions
        const rolePermissions = validPermissions.map(permission => {
          const { resourceType } = parsePermission(permission);
          return {
            roleId: role.id,
            permission,
            resourceType,
            conditions: {
              requires_approval: isHighRiskPermission(permission),
              scope: roleData.scope === 'organization' ? 'organization' : 'global',
            },
          };
        });

        await tx.rolePermission.createMany({
          data: rolePermissions,
        });

        return role;
      });

      logSecurityEvent('role_created', 'info', {
        roleId: result.id,
        roleName: result.name,
        createdBy,
        permissionCount: validPermissions.length,
        scope: result.scope,
      });

      return result as Role;
    } catch (error) {
      logSecurityEvent('role_creation_failed', 'error', {
        roleName: roleData.name,
        createdBy,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Create role from template with inheritance
   */
  async createRoleFromTemplate(
    template: RoleTemplate,
    organizationId: string,
    createdBy: string,
    customizations?: {
      additionalPermissions?: string[];
      removedPermissions?: string[];
      conditions?: PermissionConditions;
    }
  ): Promise<Role> {
    let allPermissions = [...template.permissions];

    // Inherit permissions from parent roles
    if (template.inheritFrom?.length) {
      for (const parentRoleName of template.inheritFrom) {
        const parentRole = await this.prisma.role.findFirst({
          where: {
            name: parentRoleName,
            organizationId,
            isActive: true,
          },
          include: {
            permissions: true,
          },
        });

        if (parentRole) {
          const inheritedPermissions = parentRole.permissions.map(p => p.permission);
          allPermissions.push(...inheritedPermissions);
        }
      }
    }

    // Apply customizations
    if (customizations?.additionalPermissions) {
      allPermissions.push(...customizations.additionalPermissions);
    }

    if (customizations?.removedPermissions) {
      allPermissions = allPermissions.filter(
        p => !customizations.removedPermissions!.includes(p)
      );
    }

    // Remove duplicates
    allPermissions = [...new Set(allPermissions)];

    const roleData: Omit<Role, 'id' | 'createdAt' | 'updatedAt'> = {
      name: template.name,
      displayName: template.displayName,
      description: template.description,
      scope: 'organization',
      organizationId,
      isSystemRole: false,
      isActive: true,
      createdBy,
    };

    return this.createRole(roleData, allPermissions, createdBy);
  }

  /**
   * Assign role to user with fine-grained context
   */
  async assignRoleToUser(
    assignment: {
      userId: string;
      roleId: string;
      assignedBy: string;
      expiresAt?: Date;
      resourceType?: string;
      resourceId?: string;
      conditions?: PermissionConditions;
    }
  ): Promise<UserRoleAssignment> {
    try {
      // Get role details for validation
      const role = await this.prisma.role.findUnique({
        where: { id: assignment.roleId },
        include: { permissions: true },
      });

      if (!role) {
        throw new Error(`Role not found: ${assignment.roleId}`);
      }

      if (!role.isActive) {
        throw new Error('Cannot assign inactive role');
      }

      // Validate assignment context
      const validation = validateRoleAssignment(role as Role, assignment);
      if (!validation.valid) {
        throw new Error(`Invalid role assignment: ${validation.errors.join(', ')}`);
      }

      // Check for existing assignment
      const existingAssignment = await this.prisma.userRole.findFirst({
        where: {
          userId: assignment.userId,
          roleId: assignment.roleId,
          resourceType: assignment.resourceType,
          resourceId: assignment.resourceId,
          isActive: true,
        },
      });

      if (existingAssignment) {
        throw new Error('User already has this role assignment');
      }

      // Create assignment
      const userRole = await this.prisma.userRole.create({
        data: {
          userId: assignment.userId,
          roleId: assignment.roleId,
          assignedBy: assignment.assignedBy,
          assignedAt: new Date(),
          expiresAt: assignment.expiresAt,
          isActive: true,
          resourceType: assignment.resourceType,
          resourceId: assignment.resourceId,
        },
      });

      // Log high-risk role assignments
      const hasHighRiskPermissions = role.permissions.some(p => isHighRiskPermission(p.permission));
      if (hasHighRiskPermissions) {
        logSecurityEvent('high_risk_role_assigned', 'warning', {
          userId: assignment.userId,
          roleId: assignment.roleId,
          roleName: role.name,
          assignedBy: assignment.assignedBy,
          resourceType: assignment.resourceType,
          resourceId: assignment.resourceId,
          expiresAt: assignment.expiresAt,
        });
      }

      logSecurityEvent('role_assigned', 'info', {
        userId: assignment.userId,
        roleId: assignment.roleId,
        roleName: role.name,
        assignedBy: assignment.assignedBy,
        scope: role.scope,
      });

      return userRole as UserRoleAssignment;
    } catch (error) {
      logSecurityEvent('role_assignment_failed', 'error', {
        userId: assignment.userId,
        roleId: assignment.roleId,
        assignedBy: assignment.assignedBy,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Bulk role assignments with validation and approval
   */
  async bulkAssignRoles(
    assignments: BulkRoleAssignment,
    approvedBy?: string
  ): Promise<{
    successful: UserRoleAssignment[];
    failed: { assignment: any; error: string }[];
    requiresApproval: boolean;
  }> {
    const successful: UserRoleAssignment[] = [];
    const failed: { assignment: any; error: string }[] = [];
    let requiresApproval = false;

    // Check if bulk assignment requires approval
    if (assignments.assignments.length > 10) {
      requiresApproval = true;
    }

    // Check for high-risk roles
    const roleIds = [...new Set(assignments.assignments.map(a => a.roleId))];
    const roles = await this.prisma.role.findMany({
      where: { id: { in: roleIds } },
      include: { permissions: true },
    });

    const hasHighRiskRoles = roles.some(role =>
      role.permissions.some(p => isHighRiskPermission(p.permission))
    );

    if (hasHighRiskRoles) {
      requiresApproval = true;
    }

    if (requiresApproval && !approvedBy) {
      throw new Error('Bulk role assignment requires approval');
    }

    // Process assignments
    for (const assignment of assignments.assignments) {
      try {
        const result = await this.assignRoleToUser({
          ...assignment,
          assignedBy: assignments.assignedBy,
        });
        successful.push(result);
      } catch (error) {
        failed.push({
          assignment,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    logSecurityEvent('bulk_role_assignment', 'info', {
      assignedBy: assignments.assignedBy,
      approvedBy,
      totalAssignments: assignments.assignments.length,
      successful: successful.length,
      failed: failed.length,
      reason: assignments.reason,
    });

    return { successful, failed, requiresApproval };
  }

  /**
   * Create policy-specific role binding
   */
  async createPolicyRoleBinding(
    binding: PolicyRoleBinding,
    createdBy: string
  ): Promise<void> {
    try {
      // Validate role exists
      const role = await this.prisma.role.findUnique({
        where: { id: binding.roleId },
      });

      if (!role) {
        throw new Error(`Role not found: ${binding.roleId}`);
      }

      // Validate policies exist
      const policies = await this.prisma.policy.findMany({
        where: { id: { in: binding.policyIds } },
      });

      if (policies.length !== binding.policyIds.length) {
        throw new Error('Some policies not found');
      }

      // Build permissions based on scope
      const scopePermissions = this.getScopePermissions(binding.scope);
      const finalPermissions = binding.permissions.length > 0
        ? binding.permissions
        : scopePermissions;

      // Create policy assignments
      const assignments = binding.policyIds.map(policyId => ({
        policyId,
        assigneeType: 'role' as const,
        assigneeId: binding.roleId,
        assignedBy: createdBy,
        assignedAt: new Date(),
        effectiveDate: new Date(),
        isActive: true,
      }));

      await this.prisma.policyAssignment.createMany({
        data: assignments,
      });

      // Create or update role permissions for policies
      const rolePermissions = finalPermissions.map(permission => ({
        roleId: binding.roleId,
        permission,
        resourceType: 'policy' as const,
        conditions: {
          scope: 'assigned_resources',
          ...binding.conditions,
        },
      }));

      // Use upsert to handle existing permissions
      for (const rolePermission of rolePermissions) {
        await this.prisma.rolePermission.upsert({
          where: {
            roleId_permission_resourceType: {
              roleId: rolePermission.roleId,
              permission: rolePermission.permission,
              resourceType: rolePermission.resourceType,
            },
          },
          update: {
            conditions: rolePermission.conditions,
          },
          create: rolePermission,
        });
      }

      logSecurityEvent('policy_role_binding_created', 'info', {
        roleId: binding.roleId,
        policyCount: binding.policyIds.length,
        permissions: finalPermissions,
        scope: binding.scope,
        createdBy,
      });
    } catch (error) {
      logSecurityEvent('policy_role_binding_failed', 'error', {
        roleId: binding.roleId,
        policyIds: binding.policyIds,
        createdBy,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Delegate role permissions temporarily
   */
  async createRoleDelegation(
    fromUserId: string,
    toUserId: string,
    roleId: string,
    permissions: string[],
    expiresAt: Date,
    conditions?: PermissionConditions
  ): Promise<RoleDelegation> {
    try {
      // Validate delegation is allowed
      const userRole = await this.prisma.userRole.findFirst({
        where: {
          userId: fromUserId,
          roleId,
          isActive: true,
        },
        include: {
          role: {
            include: {
              permissions: true,
            },
          },
        },
      });

      if (!userRole) {
        throw new Error('User does not have the role to delegate');
      }

      // Validate delegated permissions are subset of role permissions
      const rolePermissions = userRole.role.permissions.map(p => p.permission);
      const invalidPermissions = permissions.filter(p => !rolePermissions.includes(p));

      if (invalidPermissions.length > 0) {
        throw new Error(`Cannot delegate permissions not in role: ${invalidPermissions.join(', ')}`);
      }

      // Check delegation expiry limits
      const maxDelegationPeriod = 30 * 24 * 60 * 60 * 1000; // 30 days
      if (expiresAt.getTime() - Date.now() > maxDelegationPeriod) {
        throw new Error('Delegation period exceeds maximum allowed duration');
      }

      // Create delegation record (simplified - would be in separate table in production)
      const delegationId = `delegation_${Date.now()}`;

      // Create temporary user permissions for delegated permissions
      const userPermissions = permissions.map(permission => {
        const { resourceType } = parsePermission(permission);
        return {
          userId: toUserId,
          permission,
          resourceType,
          resourceId: null,
          grantedBy: fromUserId,
          grantedAt: new Date(),
          expiresAt,
          isActive: true,
          conditions: {
            scope: 'organization',
            delegation_id: delegationId,
            ...conditions,
          },
        };
      });

      await this.prisma.userPermission.createMany({
        data: userPermissions,
      });

      const delegation: RoleDelegation = {
        id: delegationId,
        fromUserId,
        toUserId,
        roleId,
        delegatedPermissions: permissions,
        conditions: conditions || {},
        expiresAt,
        isActive: true,
      };

      logSecurityEvent('role_delegation_created', 'info', {
        delegationId,
        fromUserId,
        toUserId,
        roleId,
        permissions,
        expiresAt,
      });

      return delegation;
    } catch (error) {
      logSecurityEvent('role_delegation_failed', 'error', {
        fromUserId,
        toUserId,
        roleId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Get user's complete authorization profile
   */
  async getUserAuthorizationProfile(
    userId: string,
    organizationId?: string
  ): Promise<{
    directPermissions: string[];
    roleBasedPermissions: string[];
    delegatedPermissions: string[];
    temporaryPermissions: string[];
    roles: Role[];
    summary: {
      totalPermissions: number;
      highRiskPermissions: string[];
      expiringPermissions: Array<{ permission: string; expiresAt: Date }>;
      roleCount: number;
      lastUpdated: Date;
    };
  }> {
    // Get all active user permissions
    const userPermissions = await this.prisma.userPermission.findMany({
      where: {
        userId,
        isActive: true,
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: new Date() } },
        ],
      },
      orderBy: { grantedAt: 'desc' },
    });

    // Get user roles and role permissions
    const userRoles = await this.prisma.userRole.findMany({
      where: {
        userId,
        isActive: true,
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: new Date() } },
        ],
        ...(organizationId && {
          role: { organizationId },
        }),
      },
      include: {
        role: {
          include: {
            permissions: true,
          },
        },
      },
      orderBy: { assignedAt: 'desc' },
    });

    // Categorize permissions
    const directPermissions: string[] = [];
    const delegatedPermissions: string[] = [];
    const temporaryPermissions: string[] = [];

    userPermissions.forEach(perm => {
      if (perm.conditions && (perm.conditions as any).delegation_id) {
        delegatedPermissions.push(perm.permission);
      } else if (perm.expiresAt) {
        temporaryPermissions.push(perm.permission);
      } else {
        directPermissions.push(perm.permission);
      }
    });

    // Get role-based permissions
    const roleBasedPermissions: string[] = [];
    const roles: Role[] = [];

    userRoles.forEach(userRole => {
      roles.push(userRole.role as Role);
      userRole.role.permissions.forEach(rolePermission => {
        roleBasedPermissions.push(rolePermission.permission);
      });
    });

    // Calculate summary
    const allPermissions = [
      ...directPermissions,
      ...roleBasedPermissions,
      ...delegatedPermissions,
      ...temporaryPermissions,
    ];

    const uniquePermissions = [...new Set(allPermissions)];
    const highRiskPermissions = uniquePermissions.filter(isHighRiskPermission);

    const expiringPermissions = userPermissions
      .filter(p => p.expiresAt && p.expiresAt.getTime() - Date.now() < 7 * 24 * 60 * 60 * 1000) // 7 days
      .map(p => ({ permission: p.permission, expiresAt: p.expiresAt! }));

    return {
      directPermissions,
      roleBasedPermissions,
      delegatedPermissions,
      temporaryPermissions,
      roles,
      summary: {
        totalPermissions: uniquePermissions.length,
        highRiskPermissions,
        expiringPermissions,
        roleCount: roles.length,
        lastUpdated: new Date(),
      },
    };
  }

  /**
   * Initialize system roles for an organization
   */
  async initializeSystemRoles(organizationId: string): Promise<void> {
    const existingRoles = await this.prisma.role.findMany({
      where: {
        organizationId,
        isSystemRole: true,
      },
    });

    const existingRoleNames = new Set(existingRoles.map(r => r.name));

    for (const [roleKey, roleData] of Object.entries(SYSTEM_ROLES)) {
      if (!existingRoleNames.has(roleData.name)) {
        await this.createRole(
          {
            name: roleData.name,
            displayName: roleData.displayName,
            description: roleData.description,
            scope: 'organization',
            organizationId,
            isSystemRole: true,
            isActive: true,
            createdBy: 'system',
          },
          roleData.permissions,
          'system'
        );
      }
    }

    logSecurityEvent('system_roles_initialized', 'info', {
      organizationId,
      roleCount: Object.keys(SYSTEM_ROLES).length,
    });
  }

  // Private helper methods

  private getScopePermissions(scope: 'read' | 'manage' | 'admin'): string[] {
    const basePermissions = {
      read: [
        'policy_management:read:policy',
        'policy_management:read:policy_assignment',
      ],
      manage: [
        'policy_management:read:policy',
        'policy_management:update:policy',
        'policy_management:create:policy_assignment',
        'policy_management:update:policy_assignment',
        'enforcement:evaluate:policy',
      ],
      admin: [
        'policy_management:create:policy',
        'policy_management:read:policy',
        'policy_management:update:policy',
        'policy_management:delete:policy',
        'policy_management:approve:policy',
        'policy_management:publish:policy',
        'policy_management:create:policy_assignment',
        'policy_management:read:policy_assignment',
        'policy_management:update:policy_assignment',
        'policy_management:delete:policy_assignment',
        'enforcement:evaluate:policy',
        'enforcement:override:policy',
        'enforcement:configure:policy',
      ],
    };

    return basePermissions[scope] || basePermissions.read;
  }
}