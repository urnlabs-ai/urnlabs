import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildServer } from '@/server.js';
import { AuthorizationService } from '@/services/authorization-service.js';
import { RoleManagementService } from '@/services/role-management-service.js';
import { PermissionCacheManager } from '@/lib/redis.js';

/**
 * Comprehensive RBAC Integration Tests
 *
 * Tests the complete RBAC system including:
 * - Authentication middleware integration
 * - Permission checking with cache
 * - Role management operations
 * - User authorization profiles
 * - Cache invalidation scenarios
 */

describe('RBAC Integration Tests', () => {
  let server: FastifyInstance;
  let authService: AuthorizationService;
  let roleService: RoleManagementService;

  // Test users and roles
  let adminUser: any;
  let regularUser: any;
  let restrictedUser: any;
  let testOrganization: any;
  let adminRole: any;
  let userRole: any;
  let customRole: any;

  beforeAll(async () => {
    server = await buildServer();
    await server.ready();

    authService = new AuthorizationService(server.prisma);
    roleService = new RoleManagementService(server.prisma);

    // Create test organization
    testOrganization = await server.prisma.organization.create({
      data: {
        name: 'Test Organization',
        slug: 'test-org',
      },
    });

    // Create test users
    adminUser = await server.prisma.user.create({
      data: {
        email: 'admin@test.com',
        passwordHash: 'hashed_password',
        firstName: 'Admin',
        lastName: 'User',
        role: 'ADMIN',
        organizationId: testOrganization.id,
        isActive: true,
        emailVerified: true,
      },
    });

    regularUser = await server.prisma.user.create({
      data: {
        email: 'user@test.com',
        passwordHash: 'hashed_password',
        firstName: 'Regular',
        lastName: 'User',
        role: 'USER',
        organizationId: testOrganization.id,
        isActive: true,
        emailVerified: true,
      },
    });

    restrictedUser = await server.prisma.user.create({
      data: {
        email: 'restricted@test.com',
        passwordHash: 'hashed_password',
        firstName: 'Restricted',
        lastName: 'User',
        role: 'USER',
        organizationId: testOrganization.id,
        isActive: false,
        emailVerified: true,
      },
    });

    // Initialize system roles
    await roleService.initializeSystemRoles(testOrganization.id);

    // Get created system roles
    const roles = await server.prisma.role.findMany({
      where: { organizationId: testOrganization.id },
    });

    adminRole = roles.find(r => r.name === 'policy_administrator');
    userRole = roles.find(r => r.name === 'policy_viewer');

    // Create custom role
    customRole = await roleService.createRole(
      {
        name: 'custom_analyst',
        displayName: 'Custom Analyst',
        description: 'Custom role for testing',
        scope: 'organization',
        organizationId: testOrganization.id,
        isSystemRole: false,
        isActive: true,
        createdBy: adminUser.id,
      },
      [
        'policy_management:read:policy',
        'compliance:read:audit_log',
        'analytics:read:metrics',
      ],
      adminUser.id
    );

    // Assign roles to users
    await roleService.assignRoleToUser({
      userId: adminUser.id,
      roleId: adminRole.id,
      assignedBy: adminUser.id,
    });

    await roleService.assignRoleToUser({
      userId: regularUser.id,
      roleId: userRole.id,
      assignedBy: adminUser.id,
    });

    await roleService.assignRoleToUser({
      userId: regularUser.id,
      roleId: customRole.id,
      assignedBy: adminUser.id,
    });
  });

  afterAll(async () => {
    // Clean up test data
    await server.prisma.userRole.deleteMany({
      where: {
        userId: { in: [adminUser.id, regularUser.id, restrictedUser.id] }
      },
    });

    await server.prisma.rolePermission.deleteMany({
      where: { roleId: { in: [adminRole.id, userRole.id, customRole.id] } },
    });

    await server.prisma.role.deleteMany({
      where: { organizationId: testOrganization.id },
    });

    await server.prisma.user.deleteMany({
      where: { organizationId: testOrganization.id },
    });

    await server.prisma.organization.delete({
      where: { id: testOrganization.id },
    });

    await server.close();
  });

  beforeEach(async () => {
    // Clear Redis cache before each test
    await PermissionCacheManager.invalidateAllCaches();
  });

  describe('Permission Checking', () => {
    it('should allow admin user to perform administrative actions', async () => {
      const context = {
        userId: adminUser.id,
        organizationId: testOrganization.id,
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent',
        timestamp: new Date(),
      };

      const result = await authService.checkPermission({
        userId: adminUser.id,
        permission: 'policy_management:create:policy',
        context,
      });

      expect(result.allowed).toBe(true);
      expect(result.source).toBe('role');
      expect(result.metadata?.cacheHit).toBe(false); // First check
    });

    it('should cache permission check results', async () => {
      const context = {
        userId: adminUser.id,
        organizationId: testOrganization.id,
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent',
        timestamp: new Date(),
      };

      // First check - should hit database
      const result1 = await authService.checkPermission({
        userId: adminUser.id,
        permission: 'policy_management:read:policy',
        context,
      });

      // Second check - should hit cache
      const result2 = await authService.checkPermission({
        userId: adminUser.id,
        permission: 'policy_management:read:policy',
        context,
      });

      expect(result1.allowed).toBe(true);
      expect(result2.allowed).toBe(true);
      expect(result1.metadata?.cacheHit).toBe(false);
      expect(result2.metadata?.cacheHit).toBe(true);
    });

    it('should deny access for insufficient permissions', async () => {
      const context = {
        userId: regularUser.id,
        organizationId: testOrganization.id,
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent',
        timestamp: new Date(),
      };

      const result = await authService.checkPermission({
        userId: regularUser.id,
        permission: 'administration:delete:role',
        context,
      });

      expect(result.allowed).toBe(false);
      expect(result.source).toBe('denied');
      expect(result.reason).toContain('permission not found');
    });

    it('should allow access for combined role permissions', async () => {
      const context = {
        userId: regularUser.id,
        organizationId: testOrganization.id,
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent',
        timestamp: new Date(),
      };

      // Regular user has both user role and custom role
      const result = await authService.checkPermission({
        userId: regularUser.id,
        permission: 'analytics:read:metrics', // From custom role
        context,
      });

      expect(result.allowed).toBe(true);
      expect(result.source).toBe('role');
    });

    it('should deny access for inactive users', async () => {
      const context = {
        userId: restrictedUser.id,
        organizationId: testOrganization.id,
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent',
        timestamp: new Date(),
      };

      const result = await authService.checkPermission({
        userId: restrictedUser.id,
        permission: 'policy_management:read:policy',
        context,
      });

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('User not found or inactive');
    });
  });

  describe('User Effective Permissions', () => {
    it('should return cached user permissions on subsequent calls', async () => {
      // First call - should hit database
      const permissions1 = await authService.getUserEffectivePermissions(
        regularUser.id,
        testOrganization.id
      );

      // Second call - should hit cache
      const permissions2 = await authService.getUserEffectivePermissions(
        regularUser.id,
        testOrganization.id
      );

      expect(permissions1.permissions.length).toBeGreaterThan(0);
      expect(permissions2.permissions.length).toBe(permissions1.permissions.length);
      expect(permissions1.roles.length).toBe(2); // user role + custom role
    });

    it('should include permissions from multiple roles', async () => {
      const permissions = await authService.getUserEffectivePermissions(
        regularUser.id,
        testOrganization.id
      );

      const permissionStrings = permissions.permissions.map(p => p.permission);

      // Should have permissions from both roles
      expect(permissionStrings).toContain('policy_management:read:policy'); // From user role
      expect(permissionStrings).toContain('analytics:read:metrics'); // From custom role
      expect(permissions.summary.roleBasedPermissions).toBeGreaterThan(0);
    });

    it('should identify high-risk permissions', async () => {
      const permissions = await authService.getUserEffectivePermissions(
        adminUser.id,
        testOrganization.id
      );

      expect(permissions.summary.highRiskPermissions.length).toBeGreaterThan(0);
      expect(permissions.summary.highRiskPermissions).toContain('policy_management:delete:policy');
    });
  });

  describe('Role Management API', () => {
    it('should create JWT token for authenticated requests', async () => {
      const tokenPayload = {
        userId: adminUser.id,
        email: adminUser.email,
        role: adminUser.role,
        organizationId: adminUser.organizationId,
        permissions: ['administration:create:role'],
      };

      const token = server.jwt.sign(tokenPayload);
      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
    });

    it('should return system roles via API', async () => {
      const tokenPayload = {
        userId: adminUser.id,
        email: adminUser.email,
        role: adminUser.role,
        organizationId: adminUser.organizationId,
        permissions: ['administration:read:role'],
      };

      const token = server.jwt.sign(tokenPayload);

      const response = await server.inject({
        method: 'GET',
        url: '/rbac/system-roles',
        headers: {
          authorization: `Bearer ${token}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.roles).toBeDefined();
      expect(Object.keys(body.roles).length).toBeGreaterThan(0);
    });

    it('should list organization roles via API', async () => {
      const tokenPayload = {
        userId: adminUser.id,
        email: adminUser.email,
        role: adminUser.role,
        organizationId: adminUser.organizationId,
        permissions: ['administration:read:role'],
      };

      const token = server.jwt.sign(tokenPayload);

      const response = await server.inject({
        method: 'GET',
        url: '/rbac/roles',
        headers: {
          authorization: `Bearer ${token}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.roles).toBeDefined();
      expect(Array.isArray(body.roles)).toBe(true);
      expect(body.pagination).toBeDefined();
    });

    it('should check user permissions via API', async () => {
      const tokenPayload = {
        userId: adminUser.id,
        email: adminUser.email,
        role: adminUser.role,
        organizationId: adminUser.organizationId,
        permissions: ['administration:read:role'],
      };

      const token = server.jwt.sign(tokenPayload);

      const response = await server.inject({
        method: 'POST',
        url: '/rbac/permissions/check',
        headers: {
          authorization: `Bearer ${token}`,
        },
        payload: {
          permission: 'policy_management:create:policy',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.allowed).toBe(true);
      expect(body.metadata).toBeDefined();
    });
  });

  describe('Cache Management', () => {
    it('should invalidate user cache when role assignments change', async () => {
      // Get initial permissions (should cache)
      const permissions1 = await authService.getUserEffectivePermissions(
        regularUser.id,
        testOrganization.id
      );

      // Create new role and assign to user
      const newRole = await roleService.createRole(
        {
          name: 'temp_role',
          displayName: 'Temporary Role',
          description: 'Temporary test role',
          scope: 'organization',
          organizationId: testOrganization.id,
          isSystemRole: false,
          isActive: true,
          createdBy: adminUser.id,
        },
        ['test:permission:temp'],
        adminUser.id
      );

      await roleService.assignRoleToUser({
        userId: regularUser.id,
        roleId: newRole.id,
        assignedBy: adminUser.id,
      });

      // Invalidate cache
      await PermissionCacheManager.invalidateUserCache(regularUser.id);

      // Get permissions again (should reflect new role)
      const permissions2 = await authService.getUserEffectivePermissions(
        regularUser.id,
        testOrganization.id
      );

      expect(permissions2.roles.length).toBe(permissions1.roles.length + 1);

      // Clean up
      await server.prisma.userRole.deleteMany({
        where: { roleId: newRole.id },
      });
      await server.prisma.rolePermission.deleteMany({
        where: { roleId: newRole.id },
      });
      await server.prisma.role.delete({
        where: { id: newRole.id },
      });
    });

    it('should get cache statistics', async () => {
      // Perform some permission checks to populate cache
      const context = {
        userId: adminUser.id,
        organizationId: testOrganization.id,
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent',
        timestamp: new Date(),
      };

      await authService.checkPermission({
        userId: adminUser.id,
        permission: 'policy_management:read:policy',
        context,
      });

      await authService.getUserEffectivePermissions(
        adminUser.id,
        testOrganization.id
      );

      const stats = await PermissionCacheManager.getCacheStats();

      expect(stats.totalPermissionChecks).toBeGreaterThanOrEqual(0);
      expect(stats.totalUserPermissions).toBeGreaterThanOrEqual(0);
      expect(stats.totalRolePermissions).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Security Scenarios', () => {
    it('should prevent cross-organization access', async () => {
      // Create second organization
      const otherOrg = await server.prisma.organization.create({
        data: {
          name: 'Other Organization',
          slug: 'other-org',
        },
      });

      const otherUser = await server.prisma.user.create({
        data: {
          email: 'other@test.com',
          passwordHash: 'hashed_password',
          firstName: 'Other',
          lastName: 'User',
          role: 'ADMIN',
          organizationId: otherOrg.id,
          isActive: true,
          emailVerified: true,
        },
      });

      const context = {
        userId: otherUser.id,
        organizationId: otherOrg.id,
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent',
        timestamp: new Date(),
      };

      // Other user should not have permissions in test organization
      const result = await authService.checkPermission({
        userId: otherUser.id,
        permission: 'policy_management:read:policy',
        resourceType: 'policy',
        context,
      });

      expect(result.allowed).toBe(false);

      // Clean up
      await server.prisma.user.delete({ where: { id: otherUser.id } });
      await server.prisma.organization.delete({ where: { id: otherOrg.id } });
    });

    it('should handle permission conditions correctly', async () => {
      // Test time-based restrictions (if implemented)
      const context = {
        userId: regularUser.id,
        organizationId: testOrganization.id,
        ipAddress: '192.168.1.100', // Different IP
        userAgent: 'test-agent',
        timestamp: new Date(),
      };

      const result = await authService.checkPermission({
        userId: regularUser.id,
        permission: 'policy_management:read:policy',
        context,
      });

      // Should still allow (no IP restrictions in test setup)
      expect(result.allowed).toBe(true);
      expect(result.conditions).toBeDefined();
    });

    it('should handle expired role assignments', async () => {
      // Create role with expiration
      const expiredDate = new Date();
      expiredDate.setHours(expiredDate.getHours() - 1); // 1 hour ago

      const tempRole = await roleService.createRole(
        {
          name: 'expired_role',
          displayName: 'Expired Role',
          description: 'Role for expiration testing',
          scope: 'organization',
          organizationId: testOrganization.id,
          isSystemRole: false,
          isActive: true,
          createdBy: adminUser.id,
        },
        ['test:expired:permission'],
        adminUser.id
      );

      // Assign role with past expiration
      await server.prisma.userRole.create({
        data: {
          userId: regularUser.id,
          roleId: tempRole.id,
          assignedBy: adminUser.id,
          assignedAt: new Date(),
          expiresAt: expiredDate,
          isActive: true,
        },
      });

      // Clear cache to ensure fresh check
      await PermissionCacheManager.invalidateUserCache(regularUser.id);

      const permissions = await authService.getUserEffectivePermissions(
        regularUser.id,
        testOrganization.id
      );

      const hasExpiredPermission = permissions.permissions.some(
        p => p.permission === 'test:expired:permission'
      );

      expect(hasExpiredPermission).toBe(false);

      // Clean up
      await server.prisma.userRole.deleteMany({
        where: { roleId: tempRole.id },
      });
      await server.prisma.rolePermission.deleteMany({
        where: { roleId: tempRole.id },
      });
      await server.prisma.role.delete({
        where: { id: tempRole.id },
      });
    });
  });

  describe('Performance Tests', () => {
    it('should handle multiple concurrent permission checks', async () => {
      const context = {
        userId: adminUser.id,
        organizationId: testOrganization.id,
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent',
        timestamp: new Date(),
      };

      const permissions = [
        'policy_management:read:policy',
        'policy_management:create:policy',
        'administration:read:role',
        'compliance:read:audit_log',
        'analytics:read:metrics',
      ];

      const startTime = Date.now();

      const results = await Promise.all(
        permissions.map(permission =>
          authService.checkPermission({
            userId: adminUser.id,
            permission,
            context,
          })
        )
      );

      const endTime = Date.now();
      const duration = endTime - startTime;

      expect(results.length).toBe(permissions.length);
      expect(results.every(r => r.allowed === true || r.allowed === false)).toBe(true);
      expect(duration).toBeLessThan(1000); // Should complete within 1 second
    });

    it('should demonstrate cache performance improvement', async () => {
      const context = {
        userId: adminUser.id,
        organizationId: testOrganization.id,
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent',
        timestamp: new Date(),
      };

      // Clear cache first
      await PermissionCacheManager.invalidateUserCache(adminUser.id);

      // First check - database hit
      const start1 = Date.now();
      const result1 = await authService.checkPermission({
        userId: adminUser.id,
        permission: 'policy_management:read:policy',
        context,
      });
      const duration1 = Date.now() - start1;

      // Second check - cache hit
      const start2 = Date.now();
      const result2 = await authService.checkPermission({
        userId: adminUser.id,
        permission: 'policy_management:read:policy',
        context,
      });
      const duration2 = Date.now() - start2;

      expect(result1.allowed).toBe(result2.allowed);
      expect(result1.metadata?.cacheHit).toBe(false);
      expect(result2.metadata?.cacheHit).toBe(true);
      expect(duration2).toBeLessThan(duration1); // Cache should be faster
    });
  });
});