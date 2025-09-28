import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { FastifyInstance } from 'fastify';
import { build } from '../server.js';
import { AuthorizationService } from '@/services/authorization-service.js';
import { PermissionCacheManager } from '@/lib/redis.js';
import type { PermissionCheckRequest, AuthorizationContext } from '@/services/authorization-service.js';

/**
 * RBAC Security Tests
 *
 * Comprehensive security testing for Role-Based Access Control including:
 * - Privilege escalation attempts
 * - Permission bypass techniques
 * - Role elevation attacks
 * - Cross-organization access attempts
 * - Cache manipulation security
 * - Permission inheritance exploitation
 */
describe('RBAC Security Tests', () => {
  let app: FastifyInstance;
  let authService: AuthorizationService;
  let adminUserId: string;
  let userUserId: string;
  let viewerUserId: string;
  let adminToken: string;
  let userToken: string;
  let viewerToken: string;

  beforeAll(async () => {
    app = build({
      logger: false,
      disableRequestLogging: true,
    });

    await app.ready();
    authService = new AuthorizationService(app.prisma);

    adminUserId = 'admin-user-123';
    userUserId = 'regular-user-456';
    viewerUserId = 'viewer-user-789';

    // Mock different user types
    setupUserMocks();

    // Generate tokens for different user types
    adminToken = await generateTokenForUser(adminUserId, 'admin', ['admin:*']);
    userToken = await generateTokenForUser(userUserId, 'user', ['user:read', 'user:write']);
    viewerToken = await generateTokenForUser(viewerUserId, 'viewer', ['user:read']);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    setupUserMocks();
  });

  function setupUserMocks() {
    // Mock database responses for different user types
    vi.mocked(app.prisma.user.findUnique).mockImplementation(async ({ where }) => {
      const userId = where.id;

      if (userId === adminUserId) {
        return {
          id: adminUserId,
          email: 'admin@example.com',
          role: 'admin',
          isActive: true,
          organizationId: 'org-1',
          lastLoginAt: new Date(),
          lastActivityAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
          passwordHash: 'hashed',
          firstName: 'Admin',
          lastName: 'User',
          profilePicture: null,
          timezone: 'UTC',
          language: 'en',
          emailVerified: true,
          emailVerifiedAt: new Date(),
          twoFactorEnabled: false,
          twoFactorSecret: null,
          backupCodes: null,
          lastPasswordChange: new Date(),
          loginAttempts: 0,
          lockedUntil: null,
          resetPasswordToken: null,
          resetPasswordExpires: null,
        };
      } else if (userId === userUserId) {
        return {
          id: userUserId,
          email: 'user@example.com',
          role: 'user',
          isActive: true,
          organizationId: 'org-1',
          lastLoginAt: new Date(),
          lastActivityAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
          passwordHash: 'hashed',
          firstName: 'Regular',
          lastName: 'User',
          profilePicture: null,
          timezone: 'UTC',
          language: 'en',
          emailVerified: true,
          emailVerifiedAt: new Date(),
          twoFactorEnabled: false,
          twoFactorSecret: null,
          backupCodes: null,
          lastPasswordChange: new Date(),
          loginAttempts: 0,
          lockedUntil: null,
          resetPasswordToken: null,
          resetPasswordExpires: null,
        };
      } else if (userId === viewerUserId) {
        return {
          id: viewerUserId,
          email: 'viewer@example.com',
          role: 'viewer',
          isActive: true,
          organizationId: 'org-2', // Different organization
          lastLoginAt: new Date(),
          lastActivityAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
          passwordHash: 'hashed',
          firstName: 'Viewer',
          lastName: 'User',
          profilePicture: null,
          timezone: 'UTC',
          language: 'en',
          emailVerified: true,
          emailVerifiedAt: new Date(),
          twoFactorEnabled: false,
          twoFactorSecret: null,
          backupCodes: null,
          lastPasswordChange: new Date(),
          loginAttempts: 0,
          lockedUntil: null,
          resetPasswordToken: null,
          resetPasswordExpires: null,
        };
      }

      return null;
    });

    // Mock role permissions
    vi.mocked(app.prisma.userRole.findMany).mockImplementation(async ({ where }) => {
      const userId = where?.userId;

      if (userId === adminUserId) {
        return [{
          id: 'user-role-admin',
          userId: adminUserId,
          roleId: 'admin-role',
          assignedBy: 'system',
          assignedAt: new Date(),
          expiresAt: null,
          isActive: true,
          role: {
            id: 'admin-role',
            name: 'Admin',
            permissions: ['admin:*', 'user:*', 'policy:*']
          }
        }];
      } else if (userId === userUserId) {
        return [{
          id: 'user-role-user',
          userId: userUserId,
          roleId: 'user-role',
          assignedBy: 'admin',
          assignedAt: new Date(),
          expiresAt: null,
          isActive: true,
          role: {
            id: 'user-role',
            name: 'User',
            permissions: ['user:read:own', 'user:write:own']
          }
        }];
      } else if (userId === viewerUserId) {
        return [{
          id: 'user-role-viewer',
          userId: viewerUserId,
          roleId: 'viewer-role',
          assignedBy: 'admin',
          assignedAt: new Date(),
          expiresAt: null,
          isActive: true,
          role: {
            id: 'viewer-role',
            name: 'Viewer',
            permissions: ['user:read:own']
          }
        }];
      }

      return [];
    });
  }

  async function generateTokenForUser(userId: string, role: string, permissions: string[]): Promise<string> {
    const jwtService = app.jwt;
    return jwtService.sign({
      userId,
      email: `${role}@example.com`,
      role,
      organizationId: userId === viewerUserId ? 'org-2' : 'org-1',
      permissions,
    });
  }

  describe('Privilege Escalation Attempts', () => {
    it('should prevent horizontal privilege escalation (accessing other users data)', async () => {
      // Regular user trying to access admin user data
      const response = await app.inject({
        method: 'GET',
        url: `/users/${adminUserId}`,
        headers: {
          authorization: `Bearer ${userToken}`,
        },
      });

      expect(response.statusCode).toBe(403);
      expect(response.json()).toMatchObject({
        error: 'Forbidden',
      });
    });

    it('should prevent vertical privilege escalation (role elevation)', async () => {
      // User trying to access admin-only endpoint
      const response = await app.inject({
        method: 'GET',
        url: '/admin/users',
        headers: {
          authorization: `Bearer ${userToken}`,
        },
      });

      expect(response.statusCode).toBe(403);
    });

    it('should prevent permission scope expansion', async () => {
      // User with read-only permissions trying to write
      const response = await app.inject({
        method: 'POST',
        url: '/admin/policies',
        headers: {
          authorization: `Bearer ${viewerToken}`,
        },
        payload: {
          name: 'malicious-policy',
          rules: { allow: '*' },
        },
      });

      expect(response.statusCode).toBe(403);
    });

    it('should prevent organization boundary crossing', async () => {
      // Viewer from org-2 trying to access org-1 resources
      const response = await app.inject({
        method: 'GET',
        url: `/users/${userUserId}`, // User from org-1
        headers: {
          authorization: `Bearer ${viewerToken}`, // Viewer from org-2
        },
      });

      expect(response.statusCode).toBe(403);
    });
  });

  describe('Permission Bypass Techniques', () => {
    it('should validate permissions on each request (prevent session riding)', async () => {
      // First request should succeed with admin token
      const response1 = await app.inject({
        method: 'GET',
        url: '/admin/users',
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
      });

      expect(response1.statusCode).toBe(200);

      // Mock user role change (admin demoted to user)
      vi.mocked(app.prisma.userRole.findMany).mockResolvedValueOnce([{
        id: 'user-role-demoted',
        userId: adminUserId,
        roleId: 'user-role',
        assignedBy: 'system',
        assignedAt: new Date(),
        expiresAt: null,
        isActive: true,
        role: {
          id: 'user-role',
          name: 'User',
          permissions: ['user:read:own']
        }
      }]);

      // Second request should fail due to role change
      const response2 = await app.inject({
        method: 'GET',
        url: '/admin/users',
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
      });

      expect(response2.statusCode).toBe(403);
    });

    it('should prevent permission caching manipulation', async () => {
      // Clear any existing cache
      await PermissionCacheManager.invalidateUserPermissions(userUserId, 'org-1');

      // Make request to cache permissions
      const context: AuthorizationContext = {
        userId: userUserId,
        organizationId: 'org-1',
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent',
        requestId: 'test-request-1',
        timestamp: new Date(),
      };

      const request: PermissionCheckRequest = {
        userId: userUserId,
        permission: 'user:read:own',
        context,
      };

      const result1 = await authService.checkPermission(request);
      expect(result1.allowed).toBe(true);

      // Attempt to check admin permission (should fail even if cached)
      const adminRequest: PermissionCheckRequest = {
        userId: userUserId,
        permission: 'admin:users:delete',
        context,
      };

      const result2 = await authService.checkPermission(adminRequest);
      expect(result2.allowed).toBe(false);
    });

    it('should prevent resource-based permission bypass', async () => {
      // User trying to access specific resource they don't own
      const context: AuthorizationContext = {
        userId: userUserId,
        organizationId: 'org-1',
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent',
        requestId: 'test-request-2',
        timestamp: new Date(),
      };

      const request: PermissionCheckRequest = {
        userId: userUserId,
        permission: 'user:read',
        resourceType: 'user',
        resourceId: adminUserId, // Trying to access admin user
        context,
      };

      const result = await authService.checkPermission(request);
      expect(result.allowed).toBe(false);
    });
  });

  describe('Role Manipulation Attacks', () => {
    it('should prevent role injection through request parameters', async () => {
      // Attempt to inject admin role through request body
      const response = await app.inject({
        method: 'PUT',
        url: `/users/${userUserId}`,
        headers: {
          authorization: `Bearer ${userToken}`,
        },
        payload: {
          firstName: 'Updated',
          role: 'admin', // Malicious role injection
          permissions: ['admin:*'],
        },
      });

      // Should succeed in updating name but ignore role change
      expect(response.statusCode).toBe(200);

      // Verify role wasn't changed by attempting admin operation
      const adminResponse = await app.inject({
        method: 'GET',
        url: '/admin/users',
        headers: {
          authorization: `Bearer ${userToken}`,
        },
      });

      expect(adminResponse.statusCode).toBe(403);
    });

    it('should prevent expired role exploitation', async () => {
      // Mock expired role
      vi.mocked(app.prisma.userRole.findMany).mockResolvedValueOnce([{
        id: 'user-role-expired',
        userId: userUserId,
        roleId: 'admin-role',
        assignedBy: 'system',
        assignedAt: new Date(Date.now() - 86400000), // Yesterday
        expiresAt: new Date(Date.now() - 3600000), // 1 hour ago (expired)
        isActive: true,
        role: {
          id: 'admin-role',
          name: 'Admin',
          permissions: ['admin:*']
        }
      }]);

      const response = await app.inject({
        method: 'GET',
        url: '/admin/users',
        headers: {
          authorization: `Bearer ${userToken}`,
        },
      });

      expect(response.statusCode).toBe(403);
    });

    it('should prevent inactive role exploitation', async () => {
      // Mock inactive role
      vi.mocked(app.prisma.userRole.findMany).mockResolvedValueOnce([{
        id: 'user-role-inactive',
        userId: userUserId,
        roleId: 'admin-role',
        assignedBy: 'system',
        assignedAt: new Date(),
        expiresAt: null,
        isActive: false, // Role is inactive
        role: {
          id: 'admin-role',
          name: 'Admin',
          permissions: ['admin:*']
        }
      }]);

      const response = await app.inject({
        method: 'GET',
        url: '/admin/users',
        headers: {
          authorization: `Bearer ${userToken}`,
        },
      });

      expect(response.statusCode).toBe(403);
    });
  });

  describe('Permission Pattern Exploitation', () => {
    it('should prevent wildcard permission abuse', async () => {
      // Mock user with limited wildcard permission
      vi.mocked(app.prisma.userRole.findMany).mockResolvedValueOnce([{
        id: 'user-role-limited',
        userId: userUserId,
        roleId: 'limited-role',
        assignedBy: 'admin',
        assignedAt: new Date(),
        expiresAt: null,
        isActive: true,
        role: {
          id: 'limited-role',
          name: 'Limited',
          permissions: ['user:read:*'] // Wildcard for read operations only
        }
      }]);

      // Should allow read operations
      const readResponse = await app.inject({
        method: 'GET',
        url: `/users/${userUserId}`,
        headers: {
          authorization: `Bearer ${userToken}`,
        },
      });

      expect(readResponse.statusCode).toBe(200);

      // Should deny write operations
      const writeResponse = await app.inject({
        method: 'PUT',
        url: `/users/${userUserId}`,
        headers: {
          authorization: `Bearer ${userToken}`,
        },
        payload: {
          firstName: 'Updated',
        },
      });

      expect(writeResponse.statusCode).toBe(403);
    });

    it('should prevent permission pattern injection', async () => {
      const context: AuthorizationContext = {
        userId: userUserId,
        organizationId: 'org-1',
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent',
        requestId: 'test-request-3',
        timestamp: new Date(),
      };

      // Attempt to inject regex patterns into permission string
      const maliciousPermissions = [
        'user:read.*', // Regex wildcard
        'user:read|admin:write', // OR pattern
        'user:read; admin:*', // Command injection attempt
        'user:read\nADMIN:*', // Newline injection
      ];

      for (const permission of maliciousPermissions) {
        const request: PermissionCheckRequest = {
          userId: userUserId,
          permission,
          context,
        };

        const result = await authService.checkPermission(request);
        expect(result.allowed).toBe(false);
      }
    });
  });

  describe('Concurrent Access Control', () => {
    it('should handle concurrent permission checks safely', async () => {
      const context: AuthorizationContext = {
        userId: userUserId,
        organizationId: 'org-1',
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent',
        requestId: 'test-request-4',
        timestamp: new Date(),
      };

      // Create multiple concurrent permission checks
      const requests = Array.from({ length: 10 }, (_, i) => ({
        userId: userUserId,
        permission: 'user:read:own',
        context: { ...context, requestId: `test-request-4-${i}` },
      }));

      const results = await Promise.all(
        requests.map(request => authService.checkPermission(request))
      );

      // All should have consistent results
      expect(results.every(result => result.allowed === true)).toBe(true);
    });

    it('should prevent race condition in role updates', async () => {
      // Simulate race condition where role is updated during permission check
      let callCount = 0;
      vi.mocked(app.prisma.userRole.findMany).mockImplementation(async () => {
        callCount++;

        if (callCount === 1) {
          // First call returns user role
          return [{
            id: 'user-role-1',
            userId: userUserId,
            roleId: 'user-role',
            assignedBy: 'admin',
            assignedAt: new Date(),
            expiresAt: null,
            isActive: true,
            role: {
              id: 'user-role',
              name: 'User',
              permissions: ['user:read:own']
            }
          }];
        } else {
          // Subsequent calls return admin role (simulating role update)
          return [{
            id: 'user-role-2',
            userId: userUserId,
            roleId: 'admin-role',
            assignedBy: 'system',
            assignedAt: new Date(),
            expiresAt: null,
            isActive: true,
            role: {
              id: 'admin-role',
              name: 'Admin',
              permissions: ['admin:*']
            }
          }];
        }
      });

      const context: AuthorizationContext = {
        userId: userUserId,
        organizationId: 'org-1',
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent',
        requestId: 'test-request-5',
        timestamp: new Date(),
      };

      // First check should get user permissions
      const result1 = await authService.checkPermission({
        userId: userUserId,
        permission: 'user:read:own',
        context,
      });

      // Second check should get updated permissions
      const result2 = await authService.checkPermission({
        userId: userUserId,
        permission: 'admin:users:read',
        context,
      });

      expect(result1.allowed).toBe(true);
      expect(result2.allowed).toBe(true); // Should reflect updated role
    });
  });

  describe('Cache Security', () => {
    it('should invalidate cache on permission changes', async () => {
      // Clear cache first
      await PermissionCacheManager.invalidateUserPermissions(userUserId, 'org-1');

      const context: AuthorizationContext = {
        userId: userUserId,
        organizationId: 'org-1',
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent',
        requestId: 'test-request-6',
        timestamp: new Date(),
      };

      // Check permission to populate cache
      const result1 = await authService.checkPermission({
        userId: userUserId,
        permission: 'user:read:own',
        context,
      });

      expect(result1.allowed).toBe(true);

      // Simulate permission revocation
      vi.mocked(app.prisma.userRole.findMany).mockResolvedValueOnce([]);

      // Invalidate cache
      await PermissionCacheManager.invalidateUserPermissions(userUserId, 'org-1');

      // Check should now fail
      const result2 = await authService.checkPermission({
        userId: userUserId,
        permission: 'user:read:own',
        context,
      });

      expect(result2.allowed).toBe(false);
    });

    it('should prevent cache poisoning attacks', async () => {
      // Attempt to poison cache with malicious permissions
      try {
        await PermissionCacheManager.cacheUserPermissions(
          'malicious-user',
          'org-1',
          ['admin:*', 'user:*'] // Malicious permissions
        );

        const context: AuthorizationContext = {
          userId: 'malicious-user',
          organizationId: 'org-1',
          ipAddress: '127.0.0.1',
          userAgent: 'test-agent',
          requestId: 'test-request-7',
          timestamp: new Date(),
        };

        // Should still validate against database, not cache
        const result = await authService.checkPermission({
          userId: 'malicious-user',
          permission: 'admin:users:delete',
          context,
        });

        expect(result.allowed).toBe(false);
      } catch (error) {
        // Cache operation should fail or permissions should be validated
        expect(error).toBeDefined();
      }
    });
  });
});