import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { AuthorizationService } from '../authorization-service';

// Mock Prisma
const mockPrisma = {
  userPermission: {
    findMany: vi.fn(),
  },
  userRole: {
    findMany: vi.fn(),
  },
  role: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
  },
  rolePermission: {
    createMany: vi.fn(),
    upsert: vi.fn(),
  },
  policy: {
    findUnique: vi.fn(),
  },
  policyAssignment: {
    createMany: vi.fn(),
  },
  auditLog: {
    create: vi.fn(),
  },
} as unknown as PrismaClient;

describe('AuthorizationService', () => {
  let authService: AuthorizationService;

  beforeEach(() => {
    authService = new AuthorizationService(mockPrisma);
    vi.clearAllMocks();
  });

  describe('checkPermission', () => {
    it('should allow access when user has direct permission', async () => {
      // Mock user permissions
      (mockPrisma.userPermission.findMany as vi.Mock).mockResolvedValue([
        {
          id: 'perm1',
          userId: 'user1',
          permission: 'policy_management:read:policy',
          resourceType: 'policy',
          resourceId: null,
          grantedBy: 'admin1',
          grantedAt: new Date(),
          expiresAt: null,
          isActive: true,
          conditions: {},
        },
      ]);

      // Mock user roles (empty)
      (mockPrisma.userRole.findMany as vi.Mock).mockResolvedValue([]);

      const request = {
        userId: 'user1',
        permission: 'policy_management:read:policy',
        resourceType: 'policy',
        context: {
          organizationId: 'org1',
          sessionId: 'session1',
          ipAddress: '127.0.0.1',
          userAgent: 'test',
          timestamp: new Date(),
        },
      };

      const result = await authService.checkPermission(request);

      expect(result.allowed).toBe(true);
      expect(result.source).toBe('direct');
      expect(result.reason).toBe('Permission granted');
    });

    it('should deny access when user lacks permission', async () => {
      // Mock empty permissions
      (mockPrisma.userPermission.findMany as vi.Mock).mockResolvedValue([]);
      (mockPrisma.userRole.findMany as vi.Mock).mockResolvedValue([]);

      const request = {
        userId: 'user1',
        permission: 'policy_management:delete:policy',
        resourceType: 'policy',
        context: {
          organizationId: 'org1',
        },
      };

      const result = await authService.checkPermission(request);

      expect(result.allowed).toBe(false);
      expect(result.source).toBe('denied');
      expect(result.reason).toBe('Permission not granted');
    });

    it('should allow access through role-based permissions', async () => {
      // Mock direct permissions (empty)
      (mockPrisma.userPermission.findMany as vi.Mock).mockResolvedValue([]);

      // Mock role-based permissions
      (mockPrisma.userRole.findMany as vi.Mock).mockResolvedValue([
        {
          id: 'userRole1',
          userId: 'user1',
          roleId: 'role1',
          assignedBy: 'admin1',
          assignedAt: new Date(),
          expiresAt: null,
          isActive: true,
          role: {
            id: 'role1',
            name: 'policy_manager',
            displayName: 'Policy Manager',
            scope: 'organization',
            permissions: [
              {
                id: 'rolePerm1',
                roleId: 'role1',
                permission: 'policy_management:read:policy',
                resourceType: 'policy',
                conditions: {},
              },
            ],
          },
        },
      ]);

      const request = {
        userId: 'user1',
        permission: 'policy_management:read:policy',
        resourceType: 'policy',
        context: {
          organizationId: 'org1',
        },
      };

      const result = await authService.checkPermission(request);

      expect(result.allowed).toBe(true);
      expect(result.source).toBe('role');
      expect(result.reason).toBe('Permission granted');
    });

    it('should evaluate conditions properly', async () => {
      // Mock permissions with time restrictions
      (mockPrisma.userPermission.findMany as vi.Mock).mockResolvedValue([
        {
          id: 'perm1',
          userId: 'user1',
          permission: 'policy_management:read:policy',
          resourceType: 'policy',
          resourceId: null,
          grantedBy: 'admin1',
          grantedAt: new Date(),
          expiresAt: null,
          isActive: true,
          conditions: {
            time_restrictions: {
              start_time: '23:00', // 11 PM
              end_time: '01:00',   // 1 AM (next day)
            },
          },
        },
      ]);

      (mockPrisma.userRole.findMany as vi.Mock).mockResolvedValue([]);

      const request = {
        userId: 'user1',
        permission: 'policy_management:read:policy',
        resourceType: 'policy',
        context: {
          organizationId: 'org1',
        },
      };

      // Mock current time to be during business hours (should be denied)
      const originalDate = Date;
      const mockDate = new Date('2023-01-01T14:00:00Z'); // 2 PM
      global.Date = jest.fn(() => mockDate) as any;
      global.Date.now = jest.fn(() => mockDate.getTime());

      const result = await authService.checkPermission(request);

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('Access outside allowed time window');

      // Restore original Date
      global.Date = originalDate;
    });

    it('should cache permission results', async () => {
      // Mock user permissions
      (mockPrisma.userPermission.findMany as vi.Mock).mockResolvedValue([
        {
          id: 'perm1',
          userId: 'user1',
          permission: 'policy_management:read:policy',
          resourceType: 'policy',
          resourceId: null,
          grantedBy: 'admin1',
          grantedAt: new Date(),
          expiresAt: null,
          isActive: true,
          conditions: {},
        },
      ]);

      (mockPrisma.userRole.findMany as vi.Mock).mockResolvedValue([]);

      const request = {
        userId: 'user1',
        permission: 'policy_management:read:policy',
        resourceType: 'policy',
        context: {
          organizationId: 'org1',
        },
      };

      // First call
      const result1 = await authService.checkPermission(request);
      expect(result1.allowed).toBe(true);
      expect(result1.metadata.cacheHit).toBe(false);

      // Second call should hit cache
      const result2 = await authService.checkPermission(request);
      expect(result2.allowed).toBe(true);
      expect(result2.metadata.cacheHit).toBe(true);

      // Prisma should only be called once
      expect(mockPrisma.userPermission.findMany).toHaveBeenCalledTimes(1);
    });
  });

  describe('checkMultiplePermissions', () => {
    it('should check multiple permissions efficiently', async () => {
      // Mock user permissions
      (mockPrisma.userPermission.findMany as vi.Mock).mockResolvedValue([
        {
          id: 'perm1',
          userId: 'user1',
          permission: 'policy_management:read:policy',
          resourceType: 'policy',
          resourceId: null,
          grantedBy: 'admin1',
          grantedAt: new Date(),
          expiresAt: null,
          isActive: true,
          conditions: {},
        },
      ]);

      (mockPrisma.userRole.findMany as vi.Mock).mockResolvedValue([]);

      const context = {
        userId: 'user1',
        organizationId: 'org1',
        sessionId: 'session1',
        ipAddress: '127.0.0.1',
        userAgent: 'test',
        timestamp: new Date(),
      };

      const permissions = [
        'policy_management:read:policy',
        'policy_management:update:policy',
      ];

      const results = await authService.checkMultiplePermissions(
        'user1',
        permissions,
        context
      );

      expect(Object.keys(results)).toHaveLength(2);
      expect(results['policy_management:read:policy'].allowed).toBe(true);
      expect(results['policy_management:update:policy'].allowed).toBe(false);
    });
  });

  describe('getUserEffectivePermissions', () => {
    it('should return combined direct and role-based permissions', async () => {
      // Mock direct permissions
      (mockPrisma.userPermission.findMany as vi.Mock).mockResolvedValue([
        {
          id: 'perm1',
          userId: 'user1',
          permission: 'policy_management:read:policy',
          resourceType: 'policy',
          resourceId: null,
          grantedBy: 'admin1',
          grantedAt: new Date(),
          expiresAt: null,
          isActive: true,
          conditions: {},
        },
      ]);

      // Mock role-based permissions
      (mockPrisma.userRole.findMany as vi.Mock).mockResolvedValue([
        {
          id: 'userRole1',
          userId: 'user1',
          roleId: 'role1',
          assignedBy: 'admin1',
          assignedAt: new Date(),
          expiresAt: null,
          isActive: true,
          role: {
            id: 'role1',
            name: 'policy_manager',
            displayName: 'Policy Manager',
            scope: 'organization',
            permissions: [
              {
                id: 'rolePerm1',
                roleId: 'role1',
                permission: 'policy_management:update:policy',
                resourceType: 'policy',
                conditions: {},
              },
            ],
          },
        },
      ]);

      const result = await authService.getUserEffectivePermissions('user1', 'org1');

      expect(result.permissions).toHaveLength(2); // Direct + role-based
      expect(result.roles).toHaveLength(1);
      expect(result.summary.totalPermissions).toBe(2);
      expect(result.summary.directPermissions).toBe(1);
      expect(result.summary.roleBasedPermissions).toBe(1);
    });

    it('should identify high-risk permissions', async () => {
      // Mock permissions with high-risk permission
      (mockPrisma.userPermission.findMany as vi.Mock).mockResolvedValue([
        {
          id: 'perm1',
          userId: 'user1',
          permission: 'policy_management:delete:policy',
          resourceType: 'policy',
          resourceId: null,
          grantedBy: 'admin1',
          grantedAt: new Date(),
          expiresAt: null,
          isActive: true,
          conditions: {},
        },
      ]);

      (mockPrisma.userRole.findMany as vi.Mock).mockResolvedValue([]);

      const result = await authService.getUserEffectivePermissions('user1', 'org1');

      expect(result.summary.highRiskPermissions).toContain('policy_management:delete:policy');
    });
  });

  describe('evaluatePermissionForPolicy', () => {
    it('should evaluate policy-specific permissions', async () => {
      // Mock policy
      (mockPrisma.policy.findUnique as vi.Mock).mockResolvedValue({
        id: 'policy1',
        name: 'Test Policy',
        ownerId: 'user1',
        riskLevel: 'medium',
        complianceFrameworks: ['SOC2'],
        organization: { id: 'org1' },
        assignments: [
          {
            assigneeType: 'user',
            assigneeId: 'user1',
            isActive: true,
          },
        ],
      });

      // Mock base permission check
      jest.spyOn(authService, 'checkPermission').mockResolvedValue({
        allowed: true,
        reason: 'Permission granted',
        source: 'direct',
        metadata: {
          checkTimestamp: new Date(),
          evaluationTimeMs: 10,
          rulesEvaluated: 1,
        },
      });

      const context = {
        userId: 'user1',
        organizationId: 'org1',
        sessionId: 'session1',
        ipAddress: '127.0.0.1',
        userAgent: 'test',
        timestamp: new Date(),
      };

      const result = await authService.evaluatePermissionForPolicy(
        'user1',
        'policy_management:read:policy',
        'policy1',
        context
      );

      expect(result.allowed).toBe(true);
      expect(result.delegated).toBe(true); // User has delegated access through assignment
      expect(result.conditions.framework_scope).toBe(true); // Policy has compliance frameworks
    });

    it('should require approval for critical policies', async () => {
      // Mock critical policy
      (mockPrisma.policy.findUnique as vi.Mock).mockResolvedValue({
        id: 'policy1',
        name: 'Critical Policy',
        ownerId: 'admin1',
        riskLevel: 'critical',
        complianceFrameworks: ['GDPR', 'HIPAA'],
        organization: { id: 'org1' },
        assignments: [],
      });

      // Mock base permission check
      jest.spyOn(authService, 'checkPermission').mockResolvedValue({
        allowed: true,
        reason: 'Permission granted',
        source: 'role',
        metadata: {
          checkTimestamp: new Date(),
          evaluationTimeMs: 10,
          rulesEvaluated: 1,
        },
      });

      const context = {
        userId: 'user1',
        organizationId: 'org1',
        sessionId: 'session1',
        ipAddress: '127.0.0.1',
        userAgent: 'test',
        timestamp: new Date(),
      };

      const result = await authService.evaluatePermissionForPolicy(
        'user1',
        'policy_management:update:policy',
        'policy1',
        context
      );

      expect(result.allowed).toBe(true);
      expect(result.requiresApproval).toBe(true); // Critical policy requires approval
      expect(result.approvalLevel).toBe('manager');
      expect(result.delegated).toBe(false); // No direct assignment
    });
  });

  describe('createApprovalWorkflow', () => {
    it('should create approval workflow for high-risk operations', async () => {
      // Mock audit log creation
      (mockPrisma.auditLog.create as vi.Mock).mockResolvedValue({
        id: 'audit1',
        eventId: 'approval-123',
        eventType: 'approval_workflow_created',
      });

      // Mock finding approvers
      (mockPrisma.userRole.findMany as vi.Mock).mockResolvedValue([
        {
          user: { id: 'admin1', email: 'admin@test.com', firstName: 'Admin', lastName: 'User' },
        },
      ]);

      const context = {
        userId: 'user1',
        organizationId: 'org1',
        sessionId: 'session1',
        ipAddress: '127.0.0.1',
        userAgent: 'test',
        timestamp: new Date(),
      };

      const result = await authService.createApprovalWorkflow(
        'user1',
        'policy_management:delete:policy',
        'policy',
        'policy1',
        'Need to delete outdated policy',
        context
      );

      expect(result.workflowId).toBeDefined();
      expect(result.requiredApprovers).toContain('admin1');
      expect(result.approvalLevel).toBe('manager');
      expect(mockPrisma.auditLog.create).toHaveBeenCalled();
    });

    it('should throw error for permissions that do not require approval', async () => {
      const context = {
        userId: 'user1',
        organizationId: 'org1',
        sessionId: 'session1',
        ipAddress: '127.0.0.1',
        userAgent: 'test',
        timestamp: new Date(),
      };

      await expect(
        authService.createApprovalWorkflow(
          'user1',
          'policy_management:read:policy',
          'policy',
          'policy1',
          'Just reading',
          context
        )
      ).rejects.toThrow('Approval workflow not required for this permission');
    });
  });

  describe('assignPolicyPermissions', () => {
    it('should assign policy-specific permissions to user', async () => {
      // Mock createMany for user permissions
      (mockPrisma.userPermission.createMany as vi.Mock).mockResolvedValue({
        count: 2,
      });

      await authService.assignPolicyPermissions(
        'user',
        'user1',
        ['policy_management:read:policy', 'policy_management:update:policy'],
        ['policy1', 'policy2'],
        'admin1'
      );

      expect(mockPrisma.userPermission.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({
            userId: 'user1',
            permission: 'policy_management:read:policy',
            resourceType: 'policy',
            resourceId: 'policy1',
            grantedBy: 'admin1',
          }),
        ]),
      });
    });

    it('should assign policy-specific permissions to role', async () => {
      // Mock createMany for role permissions
      (mockPrisma.rolePermission.createMany as vi.Mock).mockResolvedValue({
        count: 2,
      });

      await authService.assignPolicyPermissions(
        'role',
        'role1',
        ['policy_management:read:policy', 'policy_management:update:policy'],
        ['policy1'],
        'admin1'
      );

      expect(mockPrisma.rolePermission.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({
            roleId: 'role1',
            permission: 'policy_management:read:policy',
            resourceType: 'policy',
          }),
        ]),
      });
    });

    it('should filter out invalid permissions', async () => {
      await expect(
        authService.assignPolicyPermissions(
          'user',
          'user1',
          ['invalid:permission:format'],
          ['policy1'],
          'admin1'
        )
      ).rejects.toThrow('No valid policy management permissions provided');
    });
  });

  describe('initializeSystemRoles', () => {
    it('should create missing system roles', async () => {
      // Mock existing roles (empty)
      (mockPrisma.role.findMany as vi.Mock).mockResolvedValue([]);

      // Mock role creation
      (mockPrisma.role.create as vi.Mock).mockResolvedValue({
        id: 'role1',
        name: 'policy_administrator',
      });

      // Mock permission creation
      (mockPrisma.rolePermission.createMany as vi.Mock).mockResolvedValue({
        count: 10,
      });

      await authService.initializeSystemRoles('org1');

      // Should create all system roles
      expect(mockPrisma.role.create).toHaveBeenCalledTimes(5);
      expect(mockPrisma.rolePermission.createMany).toHaveBeenCalledTimes(5);
    });

    it('should skip existing system roles', async () => {
      // Mock existing roles
      (mockPrisma.role.findMany as vi.Mock).mockResolvedValue([
        { name: 'policy_administrator' },
        { name: 'policy_manager' },
      ]);

      await authService.initializeSystemRoles('org1');

      // Should create only missing roles
      const expectedCalls = 5 - 2;
      expect(mockPrisma.role.create).toHaveBeenCalledTimes(expectedCalls);
    });
  });
});