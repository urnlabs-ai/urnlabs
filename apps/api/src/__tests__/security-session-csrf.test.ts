import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { FastifyInstance } from 'fastify';
import { build } from '../server.js';
import crypto from 'crypto';

/**
 * Session Hijacking Prevention and CSRF Protection Tests
 *
 * Comprehensive security testing for session security including:
 * - Session hijacking prevention
 * - CSRF token validation
 * - Session fixation attacks
 * - Concurrent session management
 * - Cookie security attributes
 * - Cross-origin request validation
 */
describe('Session and CSRF Security Tests', () => {
  let app: FastifyInstance;
  let testUser: any;
  let validSessionToken: string;
  let csrfToken: string;

  beforeAll(async () => {
    app = build({
      logger: false,
      disableRequestLogging: true,
    });

    await app.ready();

    testUser = {
      id: 'session-test-user-123',
      email: 'sessiontest@example.com',
      role: 'user',
      isActive: true,
      organizationId: 'test-org',
      passwordHash: '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj3z3z3z3z3z',
      lastLoginAt: new Date(),
      lastActivityAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
      firstName: 'Session',
      lastName: 'Test',
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

    // Create valid session
    const loginResponse = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: {
        email: testUser.email,
        password: 'password123',
      },
    });

    if (loginResponse.statusCode === 200) {
      const { sessionToken } = loginResponse.json();
      validSessionToken = sessionToken;
    }

    // Get CSRF token
    const csrfResponse = await app.inject({
      method: 'GET',
      url: '/csrf-token',
    });

    if (csrfResponse.statusCode === 200) {
      const { csrfToken: token } = csrfResponse.json();
      csrfToken = token;
    }
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    setupSessionMocks();
  });

  function setupSessionMocks() {
    vi.mocked(app.prisma.user.findUnique).mockResolvedValue(testUser);

    // Mock session storage
    vi.mocked(app.prisma.session.findUnique).mockImplementation(async ({ where }) => {
      if (where.id === 'valid-session-id') {
        return {
          id: 'valid-session-id',
          userId: testUser.id,
          token: validSessionToken,
          expiresAt: new Date(Date.now() + 3600000), // 1 hour
          createdAt: new Date(),
          lastAccessedAt: new Date(),
          ipAddress: '127.0.0.1',
          userAgent: 'test-browser',
          isActive: true,
        };
      }
      return null;
    });
  }

  describe('Session Hijacking Prevention', () => {
    it('should invalidate sessions on IP address change', async () => {
      // Original request from IP 127.0.0.1
      const originalResponse = await app.inject({
        method: 'GET',
        url: '/users/profile',
        headers: {
          authorization: `Bearer ${validSessionToken}`,
          'x-forwarded-for': '127.0.0.1',
        },
      });

      expect(originalResponse.statusCode).toBe(200);

      // Same session from different IP (potential hijacking)
      const hijackedResponse = await app.inject({
        method: 'GET',
        url: '/users/profile',
        headers: {
          authorization: `Bearer ${validSessionToken}`,
          'x-forwarded-for': '192.168.1.100', // Different IP
        },
      });

      expect(hijackedResponse.statusCode).toBe(401);
      expect(hijackedResponse.json()).toMatchObject({
        error: 'SESSION_HIJACK_DETECTED',
        message: 'Session security violation detected',
      });
    });

    it('should detect session fingerprint changes', async () => {
      // Original request with specific User-Agent
      const originalResponse = await app.inject({
        method: 'GET',
        url: '/users/profile',
        headers: {
          authorization: `Bearer ${validSessionToken}`,
          'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/91.0.4472.124',
        },
      });

      expect(originalResponse.statusCode).toBe(200);

      // Same session with different User-Agent (suspicious)
      const suspiciousResponse = await app.inject({
        method: 'GET',
        url: '/users/profile',
        headers: {
          authorization: `Bearer ${validSessionToken}`,
          'user-agent': 'curl/7.68.0', // Different User-Agent
        },
      });

      expect(suspiciousResponse.statusCode).toBe(401);
      expect(suspiciousResponse.json()).toMatchObject({
        error: 'SESSION_FINGERPRINT_MISMATCH',
        message: 'Session fingerprint validation failed',
      });
    });

    it('should implement session timeout security', async () => {
      // Mock expired session
      vi.mocked(app.prisma.session.findUnique).mockResolvedValueOnce({
        id: 'expired-session-id',
        userId: testUser.id,
        token: validSessionToken,
        expiresAt: new Date(Date.now() - 3600000), // Expired 1 hour ago
        createdAt: new Date(),
        lastAccessedAt: new Date(Date.now() - 7200000), // Last accessed 2 hours ago
        ipAddress: '127.0.0.1',
        userAgent: 'test-browser',
        isActive: true,
      });

      const response = await app.inject({
        method: 'GET',
        url: '/users/profile',
        headers: {
          authorization: `Bearer ${validSessionToken}`,
        },
      });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toMatchObject({
        error: 'SESSION_EXPIRED',
        message: 'Session has expired',
      });
    });

    it('should prevent concurrent session abuse', async () => {
      // Simulate multiple concurrent requests with same session
      const concurrentRequests = Array.from({ length: 10 }, () =>
        app.inject({
          method: 'GET',
          url: '/users/profile',
          headers: {
            authorization: `Bearer ${validSessionToken}`,
            'x-forwarded-for': '127.0.0.1',
          },
        })
      );

      const responses = await Promise.all(concurrentRequests);

      // Some requests should be blocked to prevent abuse
      const successfulRequests = responses.filter(r => r.statusCode === 200);
      const blockedRequests = responses.filter(r => r.statusCode === 429);

      expect(successfulRequests.length).toBeLessThan(10);
      expect(blockedRequests.length).toBeGreaterThan(0);
    });

    it('should regenerate session ID on privilege change', async () => {
      // Mock user role upgrade
      const upgradedUser = {
        ...testUser,
        role: 'admin',
      };

      vi.mocked(app.prisma.user.update).mockResolvedValueOnce(upgradedUser);

      const upgradeResponse = await app.inject({
        method: 'PUT',
        url: '/admin/users/promote',
        headers: {
          authorization: `Bearer ${validSessionToken}`,
          'x-csrf-token': csrfToken,
        },
        payload: {
          userId: testUser.id,
          newRole: 'admin',
        },
      });

      expect(upgradeResponse.statusCode).toBe(200);
      expect(upgradeResponse.json()).toHaveProperty('newSessionToken');

      // Old session should be invalidated
      const oldSessionResponse = await app.inject({
        method: 'GET',
        url: '/admin/users',
        headers: {
          authorization: `Bearer ${validSessionToken}`,
        },
      });

      expect(oldSessionResponse.statusCode).toBe(401);
    });
  });

  describe('CSRF Protection Tests', () => {
    it('should require CSRF token for state-changing operations', async () => {
      const stateChangingOperations = [
        { method: 'POST', url: '/users', payload: { firstName: 'Test', lastName: 'User' } },
        { method: 'PUT', url: '/users/profile', payload: { firstName: 'Updated' } },
        { method: 'DELETE', url: '/users/123', payload: {} },
        { method: 'PATCH', url: '/users/profile', payload: { timezone: 'EST' } },
      ];

      for (const operation of stateChangingOperations) {
        const response = await app.inject({
          method: operation.method as any,
          url: operation.url,
          headers: {
            authorization: `Bearer ${validSessionToken}`,
            // Missing CSRF token
          },
          payload: operation.payload,
        });

        expect(response.statusCode).toBe(403);
        expect(response.json()).toMatchObject({
          error: 'CSRF_TOKEN_MISSING',
          message: 'CSRF token is required',
        });
      }
    });

    it('should validate CSRF token authenticity', async () => {
      const fakeTokens = [
        'fake-csrf-token',
        crypto.randomBytes(32).toString('hex'),
        'malicious-token',
        '',
        null,
      ];

      for (const fakeToken of fakeTokens) {
        const response = await app.inject({
          method: 'POST',
          url: '/users',
          headers: {
            authorization: `Bearer ${validSessionToken}`,
            'x-csrf-token': fakeToken,
          },
          payload: {
            firstName: 'Test',
            lastName: 'User',
          },
        });

        expect(response.statusCode).toBe(403);
        expect(response.json()).toMatchObject({
          error: 'CSRF_TOKEN_INVALID',
          message: 'Invalid CSRF token',
        });
      }
    });

    it('should allow safe HTTP methods without CSRF token', async () => {
      const safeMethods = [
        { method: 'GET', url: '/users/profile' },
        { method: 'HEAD', url: '/users/profile' },
        { method: 'OPTIONS', url: '/users/profile' },
      ];

      for (const operation of safeMethods) {
        const response = await app.inject({
          method: operation.method as any,
          url: operation.url,
          headers: {
            authorization: `Bearer ${validSessionToken}`,
            // No CSRF token required for safe methods
          },
        });

        expect([200, 204, 404]).toContain(response.statusCode);
      }
    });

    it('should bind CSRF token to session', async () => {
      // Get CSRF token for one session
      const session1Response = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: {
          email: testUser.email,
          password: 'password123',
        },
      });

      const { sessionToken: session1Token } = session1Response.json();

      const csrf1Response = await app.inject({
        method: 'GET',
        url: '/csrf-token',
        headers: {
          authorization: `Bearer ${session1Token}`,
        },
      });

      const { csrfToken: csrf1Token } = csrf1Response.json();

      // Create another session
      const session2Response = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: {
          email: testUser.email,
          password: 'password123',
        },
      });

      const { sessionToken: session2Token } = session2Response.json();

      // Try to use session1's CSRF token with session2
      const crossSessionResponse = await app.inject({
        method: 'POST',
        url: '/users',
        headers: {
          authorization: `Bearer ${session2Token}`,
          'x-csrf-token': csrf1Token,
        },
        payload: {
          firstName: 'Test',
          lastName: 'User',
        },
      });

      expect(crossSessionResponse.statusCode).toBe(403);
      expect(crossSessionResponse.json()).toMatchObject({
        error: 'CSRF_TOKEN_INVALID',
        message: 'CSRF token does not match session',
      });
    });

    it('should implement double submit cookie pattern', async () => {
      // Set CSRF token in cookie
      const cookieResponse = await app.inject({
        method: 'GET',
        url: '/csrf-token',
      });

      const cookies = cookieResponse.headers['set-cookie'] as string[];
      const csrfCookie = cookies?.find(cookie => cookie.startsWith('csrf_token='));

      expect(csrfCookie).toBeDefined();
      expect(csrfCookie).toContain('HttpOnly');
      expect(csrfCookie).toContain('Secure');
      expect(csrfCookie).toContain('SameSite=Strict');
    });

    it('should prevent CSRF token fixation', async () => {
      // Attacker provides their own CSRF token
      const attackerCsrfToken = crypto.randomBytes(32).toString('hex');

      const response = await app.inject({
        method: 'POST',
        url: '/users',
        headers: {
          authorization: `Bearer ${validSessionToken}`,
          'x-csrf-token': attackerCsrfToken,
        },
        cookies: {
          csrf_token: attackerCsrfToken,
        },
        payload: {
          firstName: 'Test',
          lastName: 'User',
        },
      });

      expect(response.statusCode).toBe(403);
      expect(response.json()).toMatchObject({
        error: 'CSRF_TOKEN_INVALID',
        message: 'Invalid CSRF token',
      });
    });
  });

  describe('Cross-Origin Security', () => {
    it('should validate Origin header for CORS requests', async () => {
      const maliciousOrigins = [
        'https://malicious-site.com',
        'http://evil.example.com',
        'https://phishing-site.net',
        'null', // Data URLs and local files
      ];

      for (const origin of maliciousOrigins) {
        const response = await app.inject({
          method: 'POST',
          url: '/users',
          headers: {
            authorization: `Bearer ${validSessionToken}`,
            'x-csrf-token': csrfToken,
            origin,
          },
          payload: {
            firstName: 'Test',
            lastName: 'User',
          },
        });

        expect(response.statusCode).toBe(403);
        expect(response.json()).toMatchObject({
          error: 'INVALID_ORIGIN',
          message: 'Request from unauthorized origin',
        });
      }
    });

    it('should validate Referer header for additional protection', async () => {
      const maliciousReferers = [
        'https://attacker-site.com/csrf-attack',
        'http://evil.com/exploit',
        'https://phishing.net/steal-data',
      ];

      for (const referer of maliciousReferers) {
        const response = await app.inject({
          method: 'POST',
          url: '/users',
          headers: {
            authorization: `Bearer ${validSessionToken}`,
            'x-csrf-token': csrfToken,
            referer,
          },
          payload: {
            firstName: 'Test',
            lastName: 'User',
          },
        });

        expect(response.statusCode).toBe(403);
        expect(response.json()).toMatchObject({
          error: 'INVALID_REFERER',
          message: 'Request from unauthorized referer',
        });
      }
    });

    it('should implement SameSite cookie protection', async () => {
      const loginResponse = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: {
          email: testUser.email,
          password: 'password123',
        },
      });

      const cookies = loginResponse.headers['set-cookie'] as string[];
      const sessionCookie = cookies?.find(cookie => cookie.startsWith('session='));

      expect(sessionCookie).toBeDefined();
      expect(sessionCookie).toContain('SameSite=Strict');
      expect(sessionCookie).toContain('HttpOnly');
      expect(sessionCookie).toContain('Secure');
    });
  });

  describe('Session Management Security', () => {
    it('should implement secure session logout', async () => {
      const logoutResponse = await app.inject({
        method: 'POST',
        url: '/auth/logout',
        headers: {
          authorization: `Bearer ${validSessionToken}`,
          'x-csrf-token': csrfToken,
        },
      });

      expect(logoutResponse.statusCode).toBe(200);

      // Session should be invalidated
      const postLogoutResponse = await app.inject({
        method: 'GET',
        url: '/users/profile',
        headers: {
          authorization: `Bearer ${validSessionToken}`,
        },
      });

      expect(postLogoutResponse.statusCode).toBe(401);
    });

    it('should implement session cleanup on security violations', async () => {
      // Trigger multiple security violations
      const violations = [
        { 'x-forwarded-for': '192.168.1.100' }, // IP change
        { 'user-agent': 'curl/7.68.0' }, // User-Agent change
        { 'x-csrf-token': 'fake-token' }, // CSRF violation
      ];

      for (const violationHeaders of violations) {
        await app.inject({
          method: 'POST',
          url: '/users',
          headers: {
            authorization: `Bearer ${validSessionToken}`,
            ...violationHeaders,
          },
          payload: {
            firstName: 'Test',
            lastName: 'User',
          },
        });
      }

      // After multiple violations, session should be terminated
      const finalResponse = await app.inject({
        method: 'GET',
        url: '/users/profile',
        headers: {
          authorization: `Bearer ${validSessionToken}`,
        },
      });

      expect(finalResponse.statusCode).toBe(401);
      expect(finalResponse.json()).toMatchObject({
        error: 'SESSION_TERMINATED',
        message: 'Session terminated due to security violations',
      });
    });

    it('should limit concurrent sessions per user', async () => {
      const maxSessions = 3;
      const sessionTokens = [];

      // Create multiple sessions
      for (let i = 0; i < maxSessions + 2; i++) {
        const loginResponse = await app.inject({
          method: 'POST',
          url: '/auth/login',
          payload: {
            email: testUser.email,
            password: 'password123',
          },
          headers: {
            'x-forwarded-for': `192.168.1.${10 + i}`,
          },
        });

        if (loginResponse.statusCode === 200) {
          sessionTokens.push(loginResponse.json().sessionToken);
        }
      }

      // Should have limited number of active sessions
      expect(sessionTokens.length).toBeLessThanOrEqual(maxSessions);

      // Oldest sessions should be invalidated when limit exceeded
      if (sessionTokens.length > 0) {
        const oldestSessionResponse = await app.inject({
          method: 'GET',
          url: '/users/profile',
          headers: {
            authorization: `Bearer ${sessionTokens[0]}`,
          },
        });

        expect(oldestSessionResponse.statusCode).toBe(401);
      }
    });

    it('should implement session activity monitoring', async () => {
      // Make requests to update session activity
      const activityRequests = [
        { method: 'GET', url: '/users/profile' },
        { method: 'GET', url: '/users/settings' },
        { method: 'POST', url: '/users/activity', payload: { action: 'view_dashboard' } },
      ];

      for (const request of activityRequests) {
        const response = await app.inject({
          method: request.method as any,
          url: request.url,
          headers: {
            authorization: `Bearer ${validSessionToken}`,
            'x-csrf-token': request.method !== 'GET' ? csrfToken : undefined,
          },
          payload: request.payload,
        });

        expect([200, 201, 204]).toContain(response.statusCode);
      }

      // Session should remain active due to recent activity
      const sessionCheckResponse = await app.inject({
        method: 'GET',
        url: '/auth/session-status',
        headers: {
          authorization: `Bearer ${validSessionToken}`,
        },
      });

      expect(sessionCheckResponse.statusCode).toBe(200);
      expect(sessionCheckResponse.json()).toMatchObject({
        active: true,
        lastActivity: expect.any(String),
      });
    });
  });

  describe('Advanced Session Security', () => {
    it('should detect session token theft attempts', async () => {
      // Simulate token being used from multiple IPs rapidly
      const rapidRequests = [
        { ip: '192.168.1.100', userAgent: 'Chrome/91.0' },
        { ip: '10.0.0.50', userAgent: 'Firefox/89.0' },
        { ip: '172.16.0.10', userAgent: 'Safari/14.1' },
      ];

      const responses = await Promise.all(
        rapidRequests.map(req =>
          app.inject({
            method: 'GET',
            url: '/users/profile',
            headers: {
              authorization: `Bearer ${validSessionToken}`,
              'x-forwarded-for': req.ip,
              'user-agent': req.userAgent,
            },
          })
        )
      );

      // Should detect and block suspicious activity
      const blockedResponses = responses.filter(r => r.statusCode === 401);
      expect(blockedResponses.length).toBeGreaterThan(0);
    });

    it('should implement geo-location based session validation', async () => {
      // Mock user's typical location
      const typicalLocation = {
        country: 'US',
        region: 'CA',
        city: 'San Francisco',
      };

      // Request from unusual location
      const response = await app.inject({
        method: 'GET',
        url: '/users/profile',
        headers: {
          authorization: `Bearer ${validSessionToken}`,
          'cf-ipcountry': 'RU', // Russia (unusual for US user)
          'x-forwarded-for': '185.220.101.1', // Known Tor exit node
        },
      });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toMatchObject({
        error: 'SUSPICIOUS_LOCATION',
        message: 'Login from unusual location detected',
      });
    });

    it('should handle session token encryption/decryption securely', async () => {
      // Test that session tokens are properly encrypted
      const loginResponse = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: {
          email: testUser.email,
          password: 'password123',
        },
      });

      const { sessionToken } = loginResponse.json();

      // Token should not contain plaintext user data
      expect(sessionToken).not.toContain(testUser.id);
      expect(sessionToken).not.toContain(testUser.email);
      expect(sessionToken).not.toContain('admin');

      // Token should be properly formatted JWT or encrypted string
      expect(typeof sessionToken).toBe('string');
      expect(sessionToken.length).toBeGreaterThan(50);
    });
  });
});