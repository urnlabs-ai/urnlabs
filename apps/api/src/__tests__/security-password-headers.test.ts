import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { FastifyInstance } from 'fastify';
import { build } from '../server.js';
import bcrypt from 'bcrypt';

/**
 * Password Strength and Security Headers Validation Tests
 *
 * Comprehensive security testing for password policies and HTTP security headers:
 * - Password complexity validation
 * - Password history enforcement
 * - Security headers presence and configuration
 * - Content Security Policy validation
 * - Cookie security attributes
 * - CORS policy enforcement
 */
describe('Password Strength and Security Headers Tests', () => {
  let app: FastifyInstance;
  let testUser: any;
  let validToken: string;

  beforeAll(async () => {
    app = build({
      logger: false,
      disableRequestLogging: true,
    });

    await app.ready();

    testUser = {
      id: 'password-test-user-123',
      email: 'passwordtest@example.com',
      role: 'user',
      isActive: true,
      organizationId: 'test-org',
      passwordHash: await bcrypt.hash('CurrentPassword123!', 12),
      passwordHistory: JSON.stringify([
        await bcrypt.hash('OldPassword1!', 12),
        await bcrypt.hash('OldPassword2!', 12),
        await bcrypt.hash('OldPassword3!', 12),
      ]),
      lastPasswordChange: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 7 days ago
      lastLoginAt: new Date(),
      lastActivityAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
      firstName: 'Password',
      lastName: 'Test',
      profilePicture: null,
      timezone: 'UTC',
      language: 'en',
      emailVerified: true,
      emailVerifiedAt: new Date(),
      twoFactorEnabled: false,
      twoFactorSecret: null,
      backupCodes: null,
      loginAttempts: 0,
      lockedUntil: null,
      resetPasswordToken: null,
      resetPasswordExpires: null,
    };

    validToken = app.jwt.sign({
      userId: testUser.id,
      email: testUser.email,
      role: testUser.role,
      organizationId: testUser.organizationId,
      permissions: ['user:read', 'user:write'],
    });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    setupPasswordTestMocks();
  });

  function setupPasswordTestMocks() {
    vi.mocked(app.prisma.user.findUnique).mockResolvedValue(testUser);
    vi.mocked(app.prisma.user.update).mockImplementation(async ({ data }) => ({
      ...testUser,
      ...data,
    }));
  }

  describe('Password Strength Validation', () => {
    it('should enforce minimum password length', async () => {
      const shortPasswords = [
        'abc',      // Too short
        '12345',    // Too short
        'Pass1!',   // 7 characters (minimum should be 8+)
      ];

      for (const password of shortPasswords) {
        const response = await app.inject({
          method: 'POST',
          url: '/auth/change-password',
          headers: {
            authorization: `Bearer ${validToken}`,
            'x-csrf-token': 'valid-csrf-token',
          },
          payload: {
            currentPassword: 'CurrentPassword123!',
            newPassword: password,
          },
        });

        expect(response.statusCode).toBe(400);
        expect(response.json()).toMatchObject({
          error: 'WEAK_PASSWORD',
          message: expect.stringContaining('Password must be at least'),
        });
      }
    });

    it('should enforce password complexity requirements', async () => {
      const weakPasswords = [
        'password123',          // No uppercase, no special char
        'PASSWORD123',          // No lowercase, no special char
        'Password',             // No numbers, no special char
        'Password123',          // No special char
        'Password!',            // No numbers
        '12345678!',            // No letters
        'ABCDEFGH!',            // No lowercase, no numbers
        'abcdefgh!',            // No uppercase, no numbers
      ];

      for (const password of weakPasswords) {
        const response = await app.inject({
          method: 'POST',
          url: '/auth/change-password',
          headers: {
            authorization: `Bearer ${validToken}`,
            'x-csrf-token': 'valid-csrf-token',
          },
          payload: {
            currentPassword: 'CurrentPassword123!',
            newPassword: password,
          },
        });

        expect(response.statusCode).toBe(400);
        expect(response.json()).toMatchObject({
          error: 'WEAK_PASSWORD',
          message: expect.stringContaining('Password must contain'),
        });
      }
    });

    it('should reject common weak passwords', async () => {
      const commonWeakPasswords = [
        'Password123!',         // Too common
        'Welcome123!',          // Common corporate password
        'Admin123!',            // Common admin password
        'Test123!',             // Common test password
        'User123!',             // Common user password
        'Password1!',           // Sequential numbers
        'Qwerty123!',           // Keyboard pattern
        'Company123!',          // Common business password
      ];

      for (const password of commonWeakPasswords) {
        const response = await app.inject({
          method: 'POST',
          url: '/auth/change-password',
          headers: {
            authorization: `Bearer ${validToken}`,
            'x-csrf-token': 'valid-csrf-token',
          },
          payload: {
            currentPassword: 'CurrentPassword123!',
            newPassword: password,
          },
        });

        expect(response.statusCode).toBe(400);
        expect(response.json()).toMatchObject({
          error: 'WEAK_PASSWORD',
          message: expect.stringContaining('commonly used'),
        });
      }
    });

    it('should prevent password reuse', async () => {
      // Mock user with password history
      vi.mocked(app.prisma.user.findUnique).mockResolvedValue({
        ...testUser,
        passwordHistory: JSON.stringify([
          await bcrypt.hash('ReusedPassword123!', 12),
          await bcrypt.hash('AnotherOldPassword!', 12),
        ]),
      });

      const response = await app.inject({
        method: 'POST',
        url: '/auth/change-password',
        headers: {
          authorization: `Bearer ${validToken}`,
          'x-csrf-token': 'valid-csrf-token',
        },
        payload: {
          currentPassword: 'CurrentPassword123!',
          newPassword: 'ReusedPassword123!', // Previously used password
        },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({
        error: 'PASSWORD_REUSED',
        message: 'Password has been used recently and cannot be reused',
      });
    });

    it('should enforce password change frequency', async () => {
      // Mock user with recent password change
      vi.mocked(app.prisma.user.findUnique).mockResolvedValue({
        ...testUser,
        lastPasswordChange: new Date(Date.now() - 24 * 60 * 60 * 1000), // 1 day ago
      });

      const response = await app.inject({
        method: 'POST',
        url: '/auth/change-password',
        headers: {
          authorization: `Bearer ${validToken}`,
          'x-csrf-token': 'valid-csrf-token',
        },
        payload: {
          currentPassword: 'CurrentPassword123!',
          newPassword: 'NewValidPassword123!',
        },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({
        error: 'PASSWORD_CHANGE_TOO_SOON',
        message: expect.stringContaining('minimum time between password changes'),
      });
    });

    it('should validate strong passwords successfully', async () => {
      const strongPasswords = [
        'MyStr0ngP@ssw0rd!2024',
        'C0mplex!ty&Secur1ty',
        'Unbreakable#P@ssw0rd99',
        'Sup3r$ecure&C0mplex!',
        'My!NewStr0ng#P@ssw0rd',
      ];

      for (const password of strongPasswords) {
        vi.mocked(app.prisma.user.findUnique).mockResolvedValue({
          ...testUser,
          lastPasswordChange: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000), // 90 days ago
        });

        const response = await app.inject({
          method: 'POST',
          url: '/auth/change-password',
          headers: {
            authorization: `Bearer ${validToken}`,
            'x-csrf-token': 'valid-csrf-token',
          },
          payload: {
            currentPassword: 'CurrentPassword123!',
            newPassword: password,
          },
        });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toMatchObject({
          message: 'Password changed successfully',
        });
      }
    });

    it('should provide password strength feedback', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/check-password-strength',
        headers: {
          authorization: `Bearer ${validToken}`,
        },
        payload: {
          password: 'TestP@ssw0rd',
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        strength: expect.oneOf(['weak', 'fair', 'good', 'strong']),
        score: expect.any(Number),
        feedback: expect.arrayContaining([
          expect.objectContaining({
            type: expect.oneOf(['warning', 'suggestion']),
            message: expect.any(String),
          }),
        ]),
        requirements: expect.objectContaining({
          minLength: expect.any(Boolean),
          hasUppercase: expect.any(Boolean),
          hasLowercase: expect.any(Boolean),
          hasNumbers: expect.any(Boolean),
          hasSpecialChars: expect.any(Boolean),
        }),
      });
    });

    it('should handle password reset with strength validation', async () => {
      const weakResetPassword = 'weak123';

      const response = await app.inject({
        method: 'POST',
        url: '/auth/reset-password',
        payload: {
          token: 'valid-reset-token',
          newPassword: weakResetPassword,
        },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({
        error: 'WEAK_PASSWORD',
        message: expect.stringContaining('Password does not meet requirements'),
      });
    });
  });

  describe('Security Headers Validation', () => {
    it('should include X-Content-Type-Options header', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/users/profile',
        headers: {
          authorization: `Bearer ${validToken}`,
        },
      });

      expect(response.headers['x-content-type-options']).toBe('nosniff');
    });

    it('should include X-Frame-Options header', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/users/profile',
        headers: {
          authorization: `Bearer ${validToken}`,
        },
      });

      expect(response.headers['x-frame-options']).toBe('DENY');
    });

    it('should include X-XSS-Protection header', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/users/profile',
        headers: {
          authorization: `Bearer ${validToken}`,
        },
      });

      expect(response.headers['x-xss-protection']).toBe('1; mode=block');
    });

    it('should include Referrer-Policy header', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/users/profile',
        headers: {
          authorization: `Bearer ${validToken}`,
        },
      });

      expect(response.headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
    });

    it('should include comprehensive Content-Security-Policy', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/users/profile',
        headers: {
          authorization: `Bearer ${validToken}`,
        },
      });

      const csp = response.headers['content-security-policy'] as string;
      expect(csp).toBeDefined();

      // Check essential CSP directives
      expect(csp).toContain("default-src 'self'");
      expect(csp).toContain("frame-ancestors 'none'");
      expect(csp).toContain("base-uri 'self'");
      expect(csp).toContain("form-action 'self'");

      // Should not allow unsafe inline scripts in production
      expect(csp).not.toContain("'unsafe-eval'");
      expect(csp).not.toContain("'unsafe-inline'");
    });

    it('should include Permissions-Policy header', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/users/profile',
        headers: {
          authorization: `Bearer ${validToken}`,
        },
      });

      const permissionsPolicy = response.headers['permissions-policy'] as string;
      expect(permissionsPolicy).toBeDefined();

      // Check that dangerous permissions are disabled
      expect(permissionsPolicy).toContain('geolocation=()');
      expect(permissionsPolicy).toContain('microphone=()');
      expect(permissionsPolicy).toContain('camera=()');
      expect(permissionsPolicy).toContain('payment=()');
    });

    it('should include HSTS header in production', async () => {
      // Mock production environment
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const response = await app.inject({
        method: 'GET',
        url: '/users/profile',
        headers: {
          authorization: `Bearer ${validToken}`,
        },
      });

      const hsts = response.headers['strict-transport-security'] as string;
      expect(hsts).toBeDefined();
      expect(hsts).toContain('max-age=31536000');
      expect(hsts).toContain('includeSubDomains');
      expect(hsts).toContain('preload');

      // Restore environment
      process.env.NODE_ENV = originalEnv;
    });

    it('should set appropriate cache headers for sensitive endpoints', async () => {
      const sensitiveEndpoints = [
        '/auth/login',
        '/users/profile',
        '/mfa/setup',
        '/admin/users',
      ];

      for (const endpoint of sensitiveEndpoints) {
        const response = await app.inject({
          method: 'GET',
          url: endpoint,
          headers: {
            authorization: `Bearer ${validToken}`,
          },
        });

        // Sensitive endpoints should not be cached
        expect(response.headers['cache-control']).toContain('no-store');
        expect(response.headers['cache-control']).toContain('no-cache');
        expect(response.headers['cache-control']).toContain('must-revalidate');
        expect(response.headers['pragma']).toBe('no-cache');
        expect(response.headers['expires']).toBe('0');
      }
    });

    it('should set secure cookie attributes', async () => {
      const loginResponse = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: {
          email: testUser.email,
          password: 'CurrentPassword123!',
        },
      });

      const cookies = loginResponse.headers['set-cookie'] as string[];
      expect(cookies).toBeDefined();

      cookies.forEach(cookie => {
        // All cookies should have security attributes
        expect(cookie).toContain('HttpOnly');
        expect(cookie).toContain('Secure');
        expect(cookie).toContain('SameSite=Strict');

        // Session cookies should not have long expiration
        if (cookie.includes('session')) {
          expect(cookie).not.toContain('Max-Age=31536000'); // 1 year
        }
      });
    });

    it('should handle CORS properly', async () => {
      const allowedOrigins = [
        'https://app.urnlabs.com',
        'https://dashboard.urnlabs.com',
      ];

      const disallowedOrigins = [
        'https://malicious-site.com',
        'http://evil.example.com',
        'null',
      ];

      // Test allowed origins
      for (const origin of allowedOrigins) {
        const response = await app.inject({
          method: 'OPTIONS',
          url: '/users/profile',
          headers: {
            origin,
            'access-control-request-method': 'GET',
            'access-control-request-headers': 'authorization',
          },
        });

        expect(response.statusCode).toBe(204);
        expect(response.headers['access-control-allow-origin']).toBe(origin);
        expect(response.headers['access-control-allow-credentials']).toBe('true');
      }

      // Test disallowed origins
      for (const origin of disallowedOrigins) {
        const response = await app.inject({
          method: 'OPTIONS',
          url: '/users/profile',
          headers: {
            origin,
            'access-control-request-method': 'GET',
          },
        });

        expect(response.headers['access-control-allow-origin']).not.toBe(origin);
      }
    });

    it('should include security headers for error responses', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/nonexistent-endpoint',
      });

      expect(response.statusCode).toBe(404);

      // Security headers should be present even for error responses
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['x-frame-options']).toBe('DENY');
      expect(response.headers['x-xss-protection']).toBe('1; mode=block');
      expect(response.headers['content-security-policy']).toBeDefined();
    });

    it('should prevent information disclosure in headers', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/users/profile',
        headers: {
          authorization: `Bearer ${validToken}`,
        },
      });

      // Should not expose server information
      expect(response.headers['server']).toBeUndefined();
      expect(response.headers['x-powered-by']).toBeUndefined();

      // Should not expose framework versions
      const allHeaders = Object.keys(response.headers).join(' ').toLowerCase();
      expect(allHeaders).not.toContain('fastify');
      expect(allHeaders).not.toContain('node');
      expect(allHeaders).not.toContain('express');
    });

    it('should implement rate limiting headers', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/users/profile',
        headers: {
          authorization: `Bearer ${validToken}`,
        },
      });

      // Rate limiting headers should be present
      expect(response.headers['x-ratelimit-limit']).toBeDefined();
      expect(response.headers['x-ratelimit-remaining']).toBeDefined();
      expect(response.headers['x-ratelimit-reset']).toBeDefined();

      // Values should be valid
      expect(parseInt(response.headers['x-ratelimit-limit'] as string)).toBeGreaterThan(0);
      expect(parseInt(response.headers['x-ratelimit-remaining'] as string)).toBeGreaterThanOrEqual(0);
      expect(parseInt(response.headers['x-ratelimit-reset'] as string)).toBeGreaterThan(0);
    });

    it('should set appropriate content type headers', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/users/profile',
        headers: {
          authorization: `Bearer ${validToken}`,
        },
      });

      expect(response.headers['content-type']).toContain('application/json');
      expect(response.headers['content-type']).toContain('charset=utf-8');
    });
  });

  describe('Password Policy Enforcement', () => {
    it('should enforce password expiration warnings', async () => {
      // Mock user with password about to expire
      vi.mocked(app.prisma.user.findUnique).mockResolvedValue({
        ...testUser,
        lastPasswordChange: new Date(Date.now() - 85 * 24 * 60 * 60 * 1000), // 85 days ago
      });

      const response = await app.inject({
        method: 'GET',
        url: '/users/profile',
        headers: {
          authorization: `Bearer ${validToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['x-password-expires-soon']).toBe('true');
      expect(response.json()).toMatchObject({
        passwordExpiring: true,
        daysUntilExpiration: expect.any(Number),
      });
    });

    it('should force password change for expired passwords', async () => {
      // Mock user with expired password
      vi.mocked(app.prisma.user.findUnique).mockResolvedValue({
        ...testUser,
        lastPasswordChange: new Date(Date.now() - 91 * 24 * 60 * 60 * 1000), // 91 days ago
      });

      const response = await app.inject({
        method: 'GET',
        url: '/users/profile',
        headers: {
          authorization: `Bearer ${validToken}`,
        },
      });

      expect(response.statusCode).toBe(403);
      expect(response.json()).toMatchObject({
        error: 'PASSWORD_EXPIRED',
        message: 'Password has expired and must be changed',
        forcePasswordChange: true,
      });
    });

    it('should validate current password before allowing change', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/change-password',
        headers: {
          authorization: `Bearer ${validToken}`,
          'x-csrf-token': 'valid-csrf-token',
        },
        payload: {
          currentPassword: 'WrongCurrentPassword!',
          newPassword: 'NewValidPassword123!',
        },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({
        error: 'INVALID_CURRENT_PASSWORD',
        message: 'Current password is incorrect',
      });
    });

    it('should log password change events', async () => {
      const logSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

      vi.mocked(app.prisma.user.findUnique).mockResolvedValue({
        ...testUser,
        lastPasswordChange: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
      });

      const response = await app.inject({
        method: 'POST',
        url: '/auth/change-password',
        headers: {
          authorization: `Bearer ${validToken}`,
          'x-csrf-token': 'valid-csrf-token',
        },
        payload: {
          currentPassword: 'CurrentPassword123!',
          newPassword: 'NewValidPassword123!',
        },
      });

      expect(response.statusCode).toBe(200);
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('Password changed'),
        expect.objectContaining({
          userId: testUser.id,
          timestamp: expect.any(String),
        })
      );

      logSpy.mockRestore();
    });
  });
});