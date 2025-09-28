import { z } from 'zod';

// ============================================================================
// RBAC CORE SCHEMAS
// ============================================================================

/**
 * Permission format: category:action:resource_type
 * Examples:
 * - policy_management:create:policy
 * - compliance:assess:policy
 * - audit:read:audit_log
 */
export const PermissionFormatSchema = z.string().regex(
  /^[a-z_]+:[a-z_]+:[a-z_]+$/,
  'Permission must be in format "category:action:resource_type"'
);

/**
 * Resource types that can be managed by the RBAC system
 */
export const ResourceTypeSchema = z.enum([
  'global',
  'policy',
  'policy_template',
  'policy_assignment',
  'compliance_rule',
  'audit_log',
  'security_event',
  'role',
  'system',
]);

/**
 * Permission categories for policy management
 */
export const PermissionCategorySchema = z.enum([
  'policy_management',
  'compliance',
  'audit',
  'enforcement',
  'administration',
]);

/**
 * Actions that can be performed on resources
 */
export const PermissionActionSchema = z.enum([
  'create',
  'read',
  'update',
  'delete',
  'approve',
  'assign',
  'evaluate',
  'configure',
  'manage',
  'export',
  'investigate',
  'respond',
  'backup',
  'override',
  'publish',
  'archive',
]);

/**
 * Risk levels for permissions
 */
export const RiskLevelSchema = z.enum(['low', 'medium', 'high', 'critical']);

/**
 * Role scopes
 */
export const RoleScopeSchema = z.enum(['global', 'organization', 'resource']);

// ============================================================================
// PERMISSION CONDITIONS SCHEMA
// ============================================================================

/**
 * Conditions that can be applied to permissions for fine-grained control
 */
export const PermissionConditionsSchema = z.object({
  requires_approval: z.boolean().optional(),
  requires_mfa: z.boolean().optional(),
  scope: z.enum(['global', 'organization', 'own_policies', 'assigned_resources']).optional(),
  resource_constraints: z.array(z.string()).optional(),
  time_restrictions: z.object({
    start_time: z.string().optional(),
    end_time: z.string().optional(),
    days_of_week: z.array(z.number().min(0).max(6)).optional(),
  }).optional(),
  ip_restrictions: z.array(z.string()).optional(),
  framework_scope: z.boolean().optional(),
  category: z.string().optional(),
});

export type PermissionConditions = z.infer<typeof PermissionConditionsSchema>;

// ============================================================================
// ROLE SCHEMAS
// ============================================================================

/**
 * Role definition schema
 */
export const RoleSchema = z.object({
  id: z.string(),
  name: z.string().regex(/^[a-z_]+$/, 'Role name must be snake_case'),
  displayName: z.string().min(1).max(255),
  description: z.string().optional(),
  scope: RoleScopeSchema,
  organizationId: z.string().optional(),
  isSystemRole: z.boolean().default(false),
  isActive: z.boolean().default(true),
  createdBy: z.string().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type Role = z.infer<typeof RoleSchema>;

/**
 * User role assignment schema
 */
export const UserRoleAssignmentSchema = z.object({
  id: z.string(),
  userId: z.string(),
  roleId: z.string(),
  assignedBy: z.string(),
  assignedAt: z.date(),
  expiresAt: z.date().optional(),
  isActive: z.boolean().default(true),
  resourceType: ResourceTypeSchema.optional(),
  resourceId: z.string().optional(),
});

export type UserRoleAssignment = z.infer<typeof UserRoleAssignmentSchema>;

// ============================================================================
// PERMISSION SCHEMAS
// ============================================================================

/**
 * Role permission mapping schema
 */
export const RolePermissionSchema = z.object({
  id: z.string(),
  roleId: z.string(),
  permission: PermissionFormatSchema,
  resourceType: ResourceTypeSchema,
  conditions: PermissionConditionsSchema,
});

export type RolePermission = z.infer<typeof RolePermissionSchema>;

/**
 * Enhanced user permission schema
 */
export const UserPermissionSchema = z.object({
  id: z.string(),
  userId: z.string(),
  permission: PermissionFormatSchema,
  resourceType: ResourceTypeSchema.optional(),
  resourceId: z.string().optional(),
  grantedBy: z.string().optional(),
  grantedAt: z.date(),
  expiresAt: z.date().optional(),
  isActive: z.boolean().default(true),
  conditions: PermissionConditionsSchema,
});

export type UserPermission = z.infer<typeof UserPermissionSchema>;

/**
 * Policy permission definition schema
 */
export const PolicyPermissionDefinitionSchema = z.object({
  id: z.string(),
  category: PermissionCategorySchema,
  action: PermissionActionSchema,
  resourceType: ResourceTypeSchema,
  description: z.string().min(1),
  requiresApproval: z.boolean().default(false),
  riskLevel: RiskLevelSchema,
});

export type PolicyPermissionDefinition = z.infer<typeof PolicyPermissionDefinitionSchema>;

// ============================================================================
// PERMISSION CHECK SCHEMAS
// ============================================================================

/**
 * Permission check request schema
 */
export const PermissionCheckRequestSchema = z.object({
  userId: z.string(),
  permission: PermissionFormatSchema,
  resourceType: ResourceTypeSchema.optional(),
  resourceId: z.string().optional(),
  context: z.object({
    organizationId: z.string().optional(),
    sessionId: z.string().optional(),
    ipAddress: z.string().optional(),
    userAgent: z.string().optional(),
    timestamp: z.date().optional(),
  }).optional(),
});

export type PermissionCheckRequest = z.infer<typeof PermissionCheckRequestSchema>;

/**
 * Permission check result schema
 */
export const PermissionCheckResultSchema = z.object({
  allowed: z.boolean(),
  reason: z.string(),
  source: z.enum(['direct', 'role', 'inherited', 'denied']),
  conditions: PermissionConditionsSchema.optional(),
  requiresApproval: z.boolean().default(false),
  riskLevel: RiskLevelSchema.optional(),
  metadata: z.object({
    checkTimestamp: z.date(),
    evaluationTimeMs: z.number(),
    rulesEvaluated: z.number(),
    cacheHit: z.boolean().optional(),
  }),
});

export type PermissionCheckResult = z.infer<typeof PermissionCheckResultSchema>;

// ============================================================================
// BULK OPERATIONS SCHEMAS
// ============================================================================

/**
 * Bulk role assignment schema
 */
export const BulkRoleAssignmentSchema = z.object({
  assignments: z.array(z.object({
    userId: z.string(),
    roleId: z.string(),
    expiresAt: z.date().optional(),
    resourceType: ResourceTypeSchema.optional(),
    resourceId: z.string().optional(),
  })),
  assignedBy: z.string(),
  reason: z.string().optional(),
});

export type BulkRoleAssignment = z.infer<typeof BulkRoleAssignmentSchema>;

/**
 * Bulk permission grant schema
 */
export const BulkPermissionGrantSchema = z.object({
  grants: z.array(z.object({
    userId: z.string(),
    permission: PermissionFormatSchema,
    resourceType: ResourceTypeSchema.optional(),
    resourceId: z.string().optional(),
    expiresAt: z.date().optional(),
    conditions: PermissionConditionsSchema.optional(),
  })),
  grantedBy: z.string(),
  reason: z.string().optional(),
});

export type BulkPermissionGrant = z.infer<typeof BulkPermissionGrantSchema>;

// ============================================================================
// SYSTEM ROLE DEFINITIONS
// ============================================================================

/**
 * Predefined system roles with their permissions
 */
export const SYSTEM_ROLES = {
  POLICY_ADMINISTRATOR: {
    id: 'role_policy_admin',
    name: 'policy_administrator',
    displayName: 'Policy Administrator',
    description: 'Full access to all policy management functions',
    permissions: [
      'policy_management:create:policy',
      'policy_management:read:policy',
      'policy_management:update:policy',
      'policy_management:delete:policy',
      'policy_management:approve:policy',
      'policy_management:publish:policy',
      'policy_management:archive:policy',
      'policy_management:create:policy_template',
      'policy_management:read:policy_template',
      'policy_management:update:policy_template',
      'policy_management:delete:policy_template',
      'policy_management:create:policy_assignment',
      'policy_management:read:policy_assignment',
      'policy_management:update:policy_assignment',
      'policy_management:delete:policy_assignment',
      'enforcement:evaluate:policy',
      'enforcement:override:policy',
      'enforcement:configure:policy',
      'administration:manage:role',
      'administration:assign:role',
      'administration:configure:system',
      'administration:backup:policy',
    ],
  },

  POLICY_MANAGER: {
    id: 'role_policy_manager',
    name: 'policy_manager',
    displayName: 'Policy Manager',
    description: 'Manage policies within assigned areas',
    permissions: [
      'policy_management:create:policy',
      'policy_management:read:policy',
      'policy_management:update:policy',
      'policy_management:archive:policy',
      'policy_management:create:policy_template',
      'policy_management:read:policy_template',
      'policy_management:update:policy_template',
      'policy_management:create:policy_assignment',
      'policy_management:read:policy_assignment',
      'policy_management:update:policy_assignment',
      'enforcement:evaluate:policy',
      'enforcement:configure:policy',
    ],
  },

  POLICY_REVIEWER: {
    id: 'role_policy_reviewer',
    name: 'policy_reviewer',
    displayName: 'Policy Reviewer',
    description: 'Review and approve policy changes',
    permissions: [
      'policy_management:read:policy',
      'policy_management:approve:policy',
      'policy_management:publish:policy',
      'policy_management:read:policy_template',
      'policy_management:read:policy_assignment',
      'compliance:assess:policy',
      'compliance:report:policy',
      'audit:read:audit_log',
    ],
  },

  POLICY_VIEWER: {
    id: 'role_policy_viewer',
    name: 'policy_viewer',
    displayName: 'Policy Viewer',
    description: 'Read-only access to policies and compliance status',
    permissions: [
      'policy_management:read:policy',
      'policy_management:read:policy_template',
      'policy_management:read:policy_assignment',
      'compliance:read:compliance_rule',
      'compliance:report:policy',
    ],
  },

  COMPLIANCE_OFFICER: {
    id: 'role_compliance_officer',
    name: 'compliance_officer',
    displayName: 'Compliance Officer',
    description: 'Manage compliance frameworks and audit requirements',
    permissions: [
      'policy_management:read:policy',
      'policy_management:approve:policy',
      'compliance:create:compliance_rule',
      'compliance:read:compliance_rule',
      'compliance:update:compliance_rule',
      'compliance:delete:compliance_rule',
      'compliance:assess:policy',
      'compliance:report:policy',
      'audit:read:audit_log',
      'audit:export:audit_log',
    ],
  },

  SECURITY_ANALYST: {
    id: 'role_security_analyst',
    name: 'security_analyst',
    displayName: 'Security Analyst',
    description: 'Manage security policies and investigate violations',
    permissions: [
      'policy_management:read:policy',
      'policy_management:create:policy',
      'policy_management:update:policy',
      'enforcement:evaluate:policy',
      'enforcement:configure:policy',
      'audit:read:audit_log',
      'audit:investigate:security_event',
      'audit:respond:security_event',
    ],
  },

  AUDITOR: {
    id: 'role_auditor',
    name: 'auditor',
    displayName: 'Auditor',
    description: 'Read-only access to audit logs and compliance reports',
    permissions: [
      'policy_management:read:policy',
      'policy_management:read:policy_assignment',
      'compliance:read:compliance_rule',
      'compliance:assess:policy',
      'compliance:report:policy',
      'audit:read:audit_log',
      'audit:export:audit_log',
      'audit:investigate:security_event',
    ],
  },
} as const;

// ============================================================================
// PERMISSION HELPER FUNCTIONS
// ============================================================================

/**
 * Parse a permission string into its components
 */
export function parsePermission(permission: string) {
  const result = PermissionFormatSchema.safeParse(permission);
  if (!result.success) {
    throw new Error(`Invalid permission format: ${permission}`);
  }

  const [category, action, resourceType] = permission.split(':');
  return { category, action, resourceType };
}

/**
 * Build a permission string from components
 */
export function buildPermission(
  category: string,
  action: string,
  resourceType: string
): string {
  const permission = `${category}:${action}:${resourceType}`;
  const result = PermissionFormatSchema.safeParse(permission);
  if (!result.success) {
    throw new Error(`Invalid permission components: ${category}:${action}:${resourceType}`);
  }
  return permission;
}

/**
 * Check if a permission is high-risk
 */
export function isHighRiskPermission(permission: string): boolean {
  const { action, resourceType } = parsePermission(permission);

  const highRiskActions = ['delete', 'override', 'configure', 'manage', 'backup'];
  const criticalResources = ['system', 'role'];

  return highRiskActions.includes(action) || criticalResources.includes(resourceType);
}

/**
 * Get required approval level for permission
 */
export function getRequiredApprovalLevel(permission: string): 'none' | 'manager' | 'admin' {
  const { action, category } = parsePermission(permission);

  if (category === 'administration' || action === 'override') {
    return 'admin';
  }

  if (['delete', 'approve', 'configure'].includes(action)) {
    return 'manager';
  }

  return 'none';
}

/**
 * Validate role assignment for specific context
 */
export function validateRoleAssignment(
  role: Role,
  assignment: Partial<UserRoleAssignment>
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Resource-scoped roles must have resource context
  if (role.scope === 'resource') {
    if (!assignment.resourceType || !assignment.resourceId) {
      errors.push('Resource-scoped roles require resourceType and resourceId');
    }
  }

  // Organization-scoped roles must have organization context
  if (role.scope === 'organization') {
    if (!role.organizationId) {
      errors.push('Organization-scoped roles require organizationId');
    }
  }

  // System roles should not be assigned to external users
  if (role.isSystemRole && assignment.expiresAt) {
    const now = new Date();
    const maxSystemRoleExpiry = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000); // 1 year
    if (assignment.expiresAt > maxSystemRoleExpiry) {
      errors.push('System roles should have reasonable expiration periods');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// ============================================================================
// VALIDATION FUNCTIONS
// ============================================================================

export function validateRole(data: unknown): Role {
  return RoleSchema.parse(data);
}

export function validateUserPermission(data: unknown): UserPermission {
  return UserPermissionSchema.parse(data);
}

export function validateRolePermission(data: unknown): RolePermission {
  return RolePermissionSchema.parse(data);
}

export function validatePermissionCheckRequest(data: unknown): PermissionCheckRequest {
  return PermissionCheckRequestSchema.parse(data);
}

export function validatePermissionCheckResult(data: unknown): PermissionCheckResult {
  return PermissionCheckResultSchema.parse(data);
}

// ============================================================================
// TYPE EXPORTS
// ============================================================================

export type {
  PermissionConditions,
  Role,
  UserRoleAssignment,
  RolePermission,
  UserPermission,
  PolicyPermissionDefinition,
  PermissionCheckRequest,
  PermissionCheckResult,
  BulkRoleAssignment,
  BulkPermissionGrant,
};