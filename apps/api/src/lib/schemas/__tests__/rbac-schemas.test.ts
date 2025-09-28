import { describe, it, expect } from 'vitest';
import {
  validateRole,
  validateUserPermission,
  validateRolePermission,
  validatePermissionCheckRequest,
  parsePermission,
  buildPermission,
  isHighRiskPermission,
  getRequiredApprovalLevel,
  validateRoleAssignment,
  SYSTEM_ROLES,
  type Role,
  type UserPermission,
  type RolePermission,
  type PermissionCheckRequest,
} from '../rbac';

describe('RBAC Schema Validation', () => {
  const mockUuid = '123e4567-e89b-12d3-a456-426614174000';
  const mockDate = new Date('2024-01-01T00:00:00Z');

  describe('Permission Format Validation', () => {
    it('should validate correct permission formats', () => {
      const validPermissions = [
        'policy_management:create:policy',
        'compliance:assess:policy',
        'audit:read:audit_log',
        'enforcement:override:policy',
        'administration:manage:role',
      ];

      validPermissions.forEach(permission => {
        expect(() => parsePermission(permission)).not.toThrow();

        const { category, action, resourceType } = parsePermission(permission);
        expect(category).toBeDefined();
        expect(action).toBeDefined();
        expect(resourceType).toBeDefined();

        // Rebuild permission should match original
        const rebuilt = buildPermission(category, action, resourceType);
        expect(rebuilt).toBe(permission);
      });
    });

    it('should reject invalid permission formats', () => {
      const invalidPermissions = [
        'policy_management:create', // Missing resource type
        'policy_management', // Missing action and resource
        'policy_management:create:policy:extra', // Too many parts
        'policy-management:create:policy', // Invalid category format
        'policy_management:CREATE:policy', // Invalid action case
        'policy_management:create:Policy', // Invalid resource case
        '', // Empty string
        'policy_management::policy', // Empty action
      ];

      invalidPermissions.forEach(permission => {
        expect(() => parsePermission(permission)).toThrow();
      });
    });
  });

  describe('Role Schema Validation', () => {
    it('should validate a complete role object', () => {
      const validRole: Role = {
        id: mockUuid,
        name: 'custom_data_manager',
        displayName: 'Custom Data Manager',
        description: 'Manages data-related policies',
        scope: 'organization',
        organizationId: mockUuid,
        isSystemRole: false,
        isActive: true,
        createdBy: mockUuid,
        createdAt: mockDate,
        updatedAt: mockDate,
      };

      expect(() => validateRole(validRole)).not.toThrow();
      const validated = validateRole(validRole);
      expect(validated).toEqual(validRole);
    });

    it('should reject roles with invalid names', () => {
      const invalidRoles = [
        { name: 'Policy Manager' }, // Spaces not allowed
        { name: 'policy-manager' }, // Hyphens not allowed
        { name: 'PolicyManager' }, // CamelCase not allowed
        { name: 'policy_Manager' }, // Mixed case not allowed
        { name: '' }, // Empty name
      ];

      invalidRoles.forEach(roleData => {
        const role = {
          id: mockUuid,
          displayName: 'Test Role',
          scope: 'organization',
          createdAt: mockDate,
          updatedAt: mockDate,
          ...roleData,
        };

        expect(() => validateRole(role)).toThrow();
      });
    });

    it('should validate system roles', () => {
      Object.values(SYSTEM_ROLES).forEach(systemRole => {
        const role: Role = {
          id: systemRole.id,
          name: systemRole.name,
          displayName: systemRole.displayName,
          description: systemRole.description,
          scope: 'organization',
          isSystemRole: true,
          isActive: true,
          createdAt: mockDate,
          updatedAt: mockDate,
        };

        expect(() => validateRole(role)).not.toThrow();
        expect(role.name).toMatch(/^[a-z_]+$/);
        expect(systemRole.permissions.length).toBeGreaterThan(0);
      });
    });
  });

  describe('User Permission Schema Validation', () => {
    it('should validate a complete user permission', () => {
      const validPermission: UserPermission = {
        id: mockUuid,
        userId: mockUuid,
        permission: 'policy_management:read:policy',
        resourceType: 'policy',
        resourceId: mockUuid,
        grantedBy: mockUuid,
        grantedAt: mockDate,
        expiresAt: new Date(mockDate.getTime() + 86400000),
        isActive: true,
        conditions: {
          requires_approval: false,
          scope: 'organization',
        },
      };

      expect(() => validateUserPermission(validPermission)).not.toThrow();
      const validated = validateUserPermission(validPermission);
      expect(validated).toEqual(validPermission);
    });

    it('should validate minimal user permission', () => {
      const minimalPermission = {
        id: mockUuid,
        userId: mockUuid,
        permission: 'policy_management:read:policy',
        grantedAt: mockDate,
        isActive: true,
        conditions: {},
      };

      expect(() => validateUserPermission(minimalPermission)).not.toThrow();
    });

    it('should reject invalid permission formats in user permissions', () => {
      const invalidPermission = {
        id: mockUuid,
        userId: mockUuid,
        permission: 'invalid_format',
        grantedAt: mockDate,
        isActive: true,
        conditions: {},
      };

      expect(() => validateUserPermission(invalidPermission)).toThrow();
    });
  });

  describe('Role Permission Schema Validation', () => {
    it('should validate role permission mapping', () => {
      const validRolePermission: RolePermission = {
        id: mockUuid,
        roleId: 'role_policy_admin',
        permission: 'policy_management:create:policy',
        resourceType: 'policy',
        conditions: {
          requires_approval: true,
          scope: 'organization',
        },
      };

      expect(() => validateRolePermission(validRolePermission)).not.toThrow();
      const validated = validateRolePermission(validRolePermission);
      expect(validated).toEqual(validRolePermission);
    });

    it('should validate system role permissions', () => {
      Object.values(SYSTEM_ROLES).forEach(systemRole => {
        systemRole.permissions.forEach(permission => {
          const rolePermission: RolePermission = {
            id: mockUuid,
            roleId: systemRole.id,
            permission,
            resourceType: parsePermission(permission).resourceType,
            conditions: {},
          };

          expect(() => validateRolePermission(rolePermission)).not.toThrow();
        });
      });
    });
  });

  describe('Permission Check Request Schema', () => {
    it('should validate permission check request', () => {
      const validRequest: PermissionCheckRequest = {
        userId: mockUuid,
        permission: 'policy_management:read:policy',
        resourceType: 'policy',
        resourceId: mockUuid,
        context: {
          organizationId: mockUuid,
          sessionId: 'session_123',
          ipAddress: '192.168.1.100',
          userAgent: 'Mozilla/5.0 Test Browser',
          timestamp: mockDate,
        },
      };

      expect(() => validatePermissionCheckRequest(validRequest)).not.toThrow();
      const validated = validatePermissionCheckRequest(validRequest);
      expect(validated).toEqual(validRequest);
    });

    it('should validate minimal permission check request', () => {
      const minimalRequest = {
        userId: mockUuid,
        permission: 'policy_management:read:policy',
      };

      expect(() => validatePermissionCheckRequest(minimalRequest)).not.toThrow();
    });
  });

  describe('Permission Helper Functions', () => {
    it('should identify high-risk permissions correctly', () => {
      const highRiskPermissions = [
        'administration:delete:system',
        'enforcement:override:policy',
        'administration:configure:system',
        'administration:manage:role',
        'policy_management:delete:policy',
      ];

      const lowRiskPermissions = [
        'policy_management:read:policy',
        'compliance:report:policy',
        'audit:read:audit_log',
      ];

      highRiskPermissions.forEach(permission => {
        expect(isHighRiskPermission(permission)).toBe(true);
      });

      lowRiskPermissions.forEach(permission => {
        expect(isHighRiskPermission(permission)).toBe(false);
      });
    });

    it('should determine required approval levels correctly', () => {
      const adminApprovalRequired = [
        'administration:manage:role',
        'enforcement:override:policy',
        'administration:configure:system',
      ];

      const managerApprovalRequired = [
        'policy_management:delete:policy',
        'policy_management:approve:policy',
        'enforcement:configure:policy',
      ];

      const noApprovalRequired = [
        'policy_management:read:policy',
        'policy_management:create:policy_template',
        'audit:read:audit_log',
      ];

      adminApprovalRequired.forEach(permission => {
        expect(getRequiredApprovalLevel(permission)).toBe('admin');
      });

      managerApprovalRequired.forEach(permission => {
        expect(getRequiredApprovalLevel(permission)).toBe('manager');
      });

      noApprovalRequired.forEach(permission => {
        expect(getRequiredApprovalLevel(permission)).toBe('none');
      });
    });
  });

  describe('Role Assignment Validation', () => {
    it('should validate resource-scoped role assignments', () => {
      const resourceRole: Role = {
        id: mockUuid,
        name: 'resource_manager',
        displayName: 'Resource Manager',
        scope: 'resource',
        organizationId: mockUuid,
        isSystemRole: false,
        isActive: true,
        createdAt: mockDate,
        updatedAt: mockDate,
      };

      // Valid resource-scoped assignment
      const validAssignment = {
        userId: mockUuid,
        roleId: mockUuid,
        assignedBy: mockUuid,
        resourceType: 'policy' as const,
        resourceId: mockUuid,
      };

      const result = validateRoleAssignment(resourceRole, validAssignment);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);

      // Invalid resource-scoped assignment (missing resource context)
      const invalidAssignment = {
        userId: mockUuid,
        roleId: mockUuid,
        assignedBy: mockUuid,
      };

      const invalidResult = validateRoleAssignment(resourceRole, invalidAssignment);
      expect(invalidResult.valid).toBe(false);
      expect(invalidResult.errors.length).toBeGreaterThan(0);
    });

    it('should validate organization-scoped role assignments', () => {
      const orgRole: Role = {
        id: mockUuid,
        name: 'org_manager',
        displayName: 'Organization Manager',
        scope: 'organization',
        organizationId: mockUuid,
        isSystemRole: false,
        isActive: true,
        createdAt: mockDate,
        updatedAt: mockDate,
      };

      const assignment = {
        userId: mockUuid,
        roleId: mockUuid,
        assignedBy: mockUuid,
      };

      const result = validateRoleAssignment(orgRole, assignment);
      expect(result.valid).toBe(true);
    });

    it('should validate system role assignment expiration', () => {
      const systemRole: Role = {
        id: 'role_policy_admin',
        name: 'policy_administrator',
        displayName: 'Policy Administrator',
        scope: 'organization',
        organizationId: mockUuid,
        isSystemRole: true,
        isActive: true,
        createdAt: mockDate,
        updatedAt: mockDate,
      };

      // Very long expiration should trigger warning
      const longExpiration = new Date();
      longExpiration.setFullYear(longExpiration.getFullYear() + 5); // 5 years

      const assignment = {
        userId: mockUuid,
        roleId: 'role_policy_admin',
        assignedBy: mockUuid,
        expiresAt: longExpiration,
      };

      const result = validateRoleAssignment(systemRole, assignment);
      expect(result.valid).toBe(false);
      expect(result.errors.some(error => error.includes('reasonable expiration'))).toBe(true);
    });
  });

  describe('Permission Conditions Validation', () => {
    it('should validate permission conditions', () => {
      const validConditions = {
        requires_approval: true,
        requires_mfa: false,
        scope: 'organization' as const,
        resource_constraints: ['policy_id_123', 'policy_id_456'],
        time_restrictions: {
          start_time: '09:00',
          end_time: '17:00',
          days_of_week: [1, 2, 3, 4, 5], // Monday to Friday
        },
        ip_restrictions: ['192.168.1.0/24', '10.0.0.0/8'],
        framework_scope: true,
        category: 'security',
      };

      const permission: UserPermission = {
        id: mockUuid,
        userId: mockUuid,
        permission: 'policy_management:create:policy',
        grantedAt: mockDate,
        isActive: true,
        conditions: validConditions,
      };

      expect(() => validateUserPermission(permission)).not.toThrow();
    });

    it('should validate time restrictions format', () => {
      const timeConditions = {
        time_restrictions: {
          start_time: '09:00',
          end_time: '17:00',
          days_of_week: [0, 1, 2, 3, 4, 5, 6], // Sunday to Saturday
        },
      };

      const permission: UserPermission = {
        id: mockUuid,
        userId: mockUuid,
        permission: 'policy_management:read:policy',
        grantedAt: mockDate,
        isActive: true,
        conditions: timeConditions,
      };

      expect(() => validateUserPermission(permission)).not.toThrow();

      // Invalid day of week
      const invalidTimeConditions = {
        time_restrictions: {
          days_of_week: [7, 8], // Invalid days
        },
      };

      const invalidPermission = {
        ...permission,
        conditions: invalidTimeConditions,
      };

      expect(() => validateUserPermission(invalidPermission)).toThrow();
    });
  });

  describe('System Roles Configuration', () => {
    it('should have valid permissions for all system roles', () => {
      Object.entries(SYSTEM_ROLES).forEach(([roleName, roleConfig]) => {
        expect(roleConfig.id).toBeDefined();
        expect(roleConfig.name).toMatch(/^[a-z_]+$/);
        expect(roleConfig.displayName).toBeDefined();
        expect(roleConfig.description).toBeDefined();
        expect(Array.isArray(roleConfig.permissions)).toBe(true);
        expect(roleConfig.permissions.length).toBeGreaterThan(0);

        // All permissions should be valid format
        roleConfig.permissions.forEach(permission => {
          expect(() => parsePermission(permission)).not.toThrow();
        });
      });
    });

    it('should have appropriate permission distribution across roles', () => {
      const adminPermissions = SYSTEM_ROLES.POLICY_ADMINISTRATOR.permissions;
      const managerPermissions = SYSTEM_ROLES.POLICY_MANAGER.permissions;
      const viewerPermissions = SYSTEM_ROLES.POLICY_VIEWER.permissions;

      // Admin should have the most permissions
      expect(adminPermissions.length).toBeGreaterThan(managerPermissions.length);
      expect(managerPermissions.length).toBeGreaterThan(viewerPermissions.length);

      // Viewer should only have read permissions
      viewerPermissions.forEach(permission => {
        const { action } = parsePermission(permission);
        expect(['read', 'report']).toContain(action);
      });

      // Manager should not have critical admin permissions
      const adminOnlyActions = ['delete', 'override', 'manage', 'configure'];
      managerPermissions.forEach(permission => {
        const { action, category } = parsePermission(permission);
        if (adminOnlyActions.includes(action)) {
          expect(category).not.toBe('administration');
        }
      });
    });
  });
});