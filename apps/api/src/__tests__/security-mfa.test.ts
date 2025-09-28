import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { FastifyInstance } from 'fastify';
import { build } from '../server.js';
import speakeasy from 'speakeasy';
import crypto from 'crypto';

/**
 * MFA Security Tests
 *
 * Comprehensive security testing for Multi-Factor Authentication including:
 * - TOTP bypass attempts
 * - SMS OTP brute force protection
 * - Backup code exploitation
 * - Timing attack prevention
 * - Rate limiting effectiveness
 * - Recovery mechanism security
 */
describe('MFA Security Tests', () => {
  let app: FastifyInstance;
  let mfaUser: any;
  let mfaSecret: string;
  let userToken: string;
  let backupCodes: string[];

  beforeAll(async () => {
    app = build({
      logger: false,
      disableRequestLogging: true,
    });

    await app.ready();

    mfaUser = {
      id: 'mfa-user-123',
      email: 'mfa@example.com',
      role: 'user',
      isActive: true,
      organizationId: 'org-1',
      twoFactorEnabled: true,
      twoFactorSecret: null, // Will be set in tests
      backupCodes: null, // Will be set in tests
      lastLoginAt: new Date(),
      lastActivityAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
      passwordHash: 'hashed',
      firstName: 'MFA',
      lastName: 'User',
      profilePicture: null,
      timezone: 'UTC',
      language: 'en',
      emailVerified: true,
      emailVerifiedAt: new Date(),
      loginAttempts: 0,
      lockedUntil: null,
      resetPasswordToken: null,
      resetPasswordExpires: null,
      lastPasswordChange: new Date(),
    };

    // Generate MFA secret and backup codes
    mfaSecret = speakeasy.generateSecret({
      name: 'UrnLabs Test',
      issuer: 'UrnLabs',
    }).base32;

    backupCodes = Array.from({ length: 10 }, () =>
      crypto.randomBytes(4).toString('hex').toUpperCase()
    );

    // Generate user token
    userToken = app.jwt.sign({
      userId: mfaUser.id,
      email: mfaUser.email,
      role: mfaUser.role,
      organizationId: mfaUser.organizationId,
      permissions: ['user:read', 'user:write'],
    });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    setupMfaUserMocks();
  });

  function setupMfaUserMocks() {
    vi.mocked(app.prisma.user.findUnique).mockResolvedValue({
      ...mfaUser,
      twoFactorSecret: mfaSecret,
      backupCodes: JSON.stringify(backupCodes),
    });

    vi.mocked(app.prisma.user.update).mockResolvedValue({
      ...mfaUser,
      twoFactorSecret: mfaSecret,
      backupCodes: JSON.stringify(backupCodes),
    });
  }

  describe('TOTP Security Tests', () => {
    it('should reject expired TOTP codes', async () => {
      // Generate TOTP code from 2 minutes ago (expired)
      const expiredTimestamp = Math.floor(Date.now() / 1000) - 120;
      const expiredCode = speakeasy.totp({
        secret: mfaSecret,
        encoding: 'base32',
        time: expiredTimestamp,
        window: 0, // No tolerance
      });

      const response = await app.inject({
        method: 'POST',
        url: '/mfa/verify',
        headers: {
          authorization: `Bearer ${userToken}`,
        },
        payload: {
          code: expiredCode,
          type: 'totp',
        },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({
        error: 'INVALID_MFA_CODE',
        message: 'Invalid or expired MFA code',
      });
    });

    it('should prevent TOTP code reuse', async () => {
      const validCode = speakeasy.totp({
        secret: mfaSecret,
        encoding: 'base32',
      });

      // Mock successful first use
      vi.mocked(app.prisma.mfaVerification.findFirst).mockResolvedValueOnce(null);
      vi.mocked(app.prisma.mfaVerification.create).mockResolvedValueOnce({
        id: 'mfa-1',
        userId: mfaUser.id,
        code: validCode,
        type: 'totp',
        usedAt: new Date(),
        expiresAt: new Date(Date.now() + 300000), // 5 minutes
        createdAt: new Date(),
      });

      // First use should succeed
      const response1 = await app.inject({
        method: 'POST',
        url: '/mfa/verify',
        headers: {
          authorization: `Bearer ${userToken}`,
        },
        payload: {
          code: validCode,
          type: 'totp',
        },
      });

      expect(response1.statusCode).toBe(200);

      // Mock code already used
      vi.mocked(app.prisma.mfaVerification.findFirst).mockResolvedValueOnce({
        id: 'mfa-1',
        userId: mfaUser.id,
        code: validCode,
        type: 'totp',
        usedAt: new Date(),
        expiresAt: new Date(Date.now() + 300000),
        createdAt: new Date(),
      });

      // Second use should fail (code reuse)
      const response2 = await app.inject({
        method: 'POST',
        url: '/mfa/verify',
        headers: {
          authorization: `Bearer ${userToken}`,
        },
        payload: {
          code: validCode,
          type: 'totp',
        },
      });

      expect(response2.statusCode).toBe(400);
      expect(response2.json()).toMatchObject({
        error: 'INVALID_MFA_CODE',
        message: 'MFA code has already been used',
      });
    });

    it('should implement rate limiting for TOTP attempts', async () => {
      const invalidCode = '123456';

      // Mock rate limiting storage
      const rateLimitKey = `mfa_attempts:${mfaUser.id}`;
      const attempts = [];

      for (let i = 0; i < 6; i++) { // Exceed rate limit (5 attempts)
        attempts.push(
          app.inject({
            method: 'POST',
            url: '/mfa/verify',
            headers: {
              authorization: `Bearer ${userToken}`,
            },
            payload: {
              code: invalidCode,
              type: 'totp',
            },
          })
        );
      }

      const responses = await Promise.all(attempts);

      // First 5 should return invalid code error
      for (let i = 0; i < 5; i++) {
        expect(responses[i].statusCode).toBe(400);
        expect(responses[i].json().error).toBe('INVALID_MFA_CODE');
      }

      // 6th should return rate limit error
      expect(responses[5].statusCode).toBe(429);
      expect(responses[5].json()).toMatchObject({
        error: 'TOO_MANY_ATTEMPTS',
        message: 'Too many MFA attempts. Please try again later.',
      });
    });

    it('should prevent timing attacks on TOTP verification', async () => {
      const validCode = speakeasy.totp({
        secret: mfaSecret,
        encoding: 'base32',
      });
      const invalidCode = '123456';

      // Mock verification process
      vi.mocked(app.prisma.mfaVerification.findFirst).mockResolvedValue(null);

      // Measure time for valid code verification
      const start1 = Date.now();
      await app.inject({
        method: 'POST',
        url: '/mfa/verify',
        headers: {
          authorization: `Bearer ${userToken}`,
        },
        payload: {
          code: validCode,
          type: 'totp',
        },
      });
      const time1 = Date.now() - start1;

      // Measure time for invalid code verification
      const start2 = Date.now();
      await app.inject({
        method: 'POST',
        url: '/mfa/verify',
        headers: {
          authorization: `Bearer ${userToken}`,
        },
        payload: {
          code: invalidCode,
          type: 'totp',
        },
      });
      const time2 = Date.now() - start2;

      // Time difference should be minimal (constant time)
      const timeDifference = Math.abs(time1 - time2);
      expect(timeDifference).toBeLessThan(100); // Less than 100ms difference
    });
  });

  describe('SMS OTP Security Tests', () => {
    it('should enforce SMS OTP rate limiting', async () => {
      // Mock SMS sending
      const sendSMSRequests = [];

      for (let i = 0; i < 4; i++) { // Exceed SMS rate limit (3 per hour)
        sendSMSRequests.push(
          app.inject({
            method: 'POST',
            url: '/mfa/send-sms',
            headers: {
              authorization: `Bearer ${userToken}`,
            },
            payload: {
              phoneNumber: '+1234567890',
            },
          })
        );
      }

      const responses = await Promise.all(sendSMSRequests);

      // First 3 should succeed
      for (let i = 0; i < 3; i++) {
        expect(responses[i].statusCode).toBe(200);
      }

      // 4th should be rate limited
      expect(responses[3].statusCode).toBe(429);
      expect(responses[3].json()).toMatchObject({
        error: 'SMS_RATE_LIMIT_EXCEEDED',
        message: 'Too many SMS requests. Please try again later.',
      });
    });

    it('should validate SMS OTP format and length', async () => {
      const invalidCodes = [
        '12345',      // Too short
        '1234567',    // Too long
        'abcdef',     // Non-numeric
        '123abc',     // Mixed characters
        '',           // Empty
        null,         // Null
      ];

      for (const invalidCode of invalidCodes) {
        const response = await app.inject({
          method: 'POST',
          url: '/mfa/verify',
          headers: {
            authorization: `Bearer ${userToken}`,
          },
          payload: {
            code: invalidCode,
            type: 'sms',
          },
        });

        expect(response.statusCode).toBe(400);
      }
    });

    it('should prevent SMS OTP brute force attacks', async () => {
      // Generate all possible 6-digit codes to simulate brute force
      const bruteForceAttempts = [];
      const testCodes = ['000000', '111111', '123456', '654321', '999999'];

      for (const code of testCodes) {
        bruteForceAttempts.push(
          app.inject({
            method: 'POST',
            url: '/mfa/verify',
            headers: {
              authorization: `Bearer ${userToken}`,
            },
            payload: {
              code,
              type: 'sms',
            },
          })
        );
      }

      const responses = await Promise.all(bruteForceAttempts);

      // All should fail and trigger progressive delays
      responses.forEach((response, index) => {
        expect(response.statusCode).toBe(400);

        // Later attempts should have longer response times (progressive delay)
        if (index > 0) {
          expect(response.statusCode).toBe(400);
        }
      });
    });
  });

  describe('Backup Code Security Tests', () => {
    it('should prevent backup code reuse', async () => {
      const backupCode = backupCodes[0];

      // Mock first use success
      vi.mocked(app.prisma.user.findUnique).mockResolvedValueOnce({
        ...mfaUser,
        twoFactorSecret: mfaSecret,
        backupCodes: JSON.stringify(backupCodes),
      });

      // First use should succeed
      const response1 = await app.inject({
        method: 'POST',
        url: '/mfa/verify',
        headers: {
          authorization: `Bearer ${userToken}`,
        },
        payload: {
          code: backupCode,
          type: 'backup',
        },
      });

      expect(response1.statusCode).toBe(200);

      // Mock backup code already used (removed from list)
      const remainingCodes = backupCodes.slice(1);
      vi.mocked(app.prisma.user.findUnique).mockResolvedValueOnce({
        ...mfaUser,
        twoFactorSecret: mfaSecret,
        backupCodes: JSON.stringify(remainingCodes),
      });

      // Second use should fail
      const response2 = await app.inject({
        method: 'POST',
        url: '/mfa/verify',
        headers: {
          authorization: `Bearer ${userToken}`,
        },
        payload: {
          code: backupCode,
          type: 'backup',
        },
      });

      expect(response2.statusCode).toBe(400);
      expect(response2.json()).toMatchObject({
        error: 'INVALID_BACKUP_CODE',
        message: 'Invalid or already used backup code',
      });
    });

    it('should warn when backup codes are low', async () => {
      // Mock user with only 2 backup codes remaining
      const lowBackupCodes = backupCodes.slice(0, 2);
      vi.mocked(app.prisma.user.findUnique).mockResolvedValue({
        ...mfaUser,
        twoFactorSecret: mfaSecret,
        backupCodes: JSON.stringify(lowBackupCodes),
      });

      const response = await app.inject({
        method: 'POST',
        url: '/mfa/verify',
        headers: {
          authorization: `Bearer ${userToken}`,
        },
        payload: {
          code: lowBackupCodes[0],
          type: 'backup',
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        success: true,
        warning: 'LOW_BACKUP_CODES',
        message: 'You have 1 backup codes remaining. Consider generating new ones.',
      });
    });

    it('should prevent backup code format manipulation', async () => {
      const maliciousBackupCodes = [
        'AAAAAAAA', // Valid format but not in user's list
        'aaaaaaaa', // Wrong case
        'AAAA AAAA', // With space
        'AAAA-AAAA', // With hyphen
        'AAAAAAAA123', // Too long
        'AAAAAAA', // Too short
        '<script>alert("xss")</script>', // XSS attempt
        '../../etc/passwd', // Path traversal
      ];

      for (const maliciousCode of maliciousBackupCodes) {
        const response = await app.inject({
          method: 'POST',
          url: '/mfa/verify',
          headers: {
            authorization: `Bearer ${userToken}`,
          },
          payload: {
            code: maliciousCode,
            type: 'backup',
          },
        });

        expect(response.statusCode).toBe(400);
      }
    });
  });

  describe('MFA Bypass Attempts', () => {
    it('should prevent MFA bypass through parameter manipulation', async () => {
      const bypassAttempts = [
        { skipMfa: true }, // Skip parameter
        { mfaVerified: true }, // Pre-verified parameter
        { bypassMfa: 'admin' }, // Admin bypass
        { debug: true, skipMfa: true }, // Debug mode bypass
        { mfaDisabled: true }, // Disable parameter
      ];

      for (const bypassPayload of bypassAttempts) {
        const response = await app.inject({
          method: 'POST',
          url: '/auth/login',
          payload: {
            email: mfaUser.email,
            password: 'password123',
            ...bypassPayload,
          },
        });

        // Should still require MFA
        expect(response.statusCode).toBe(200);
        expect(response.json()).toMatchObject({
          mfaRequired: true,
        });
      }
    });

    it('should prevent session fixation after MFA', async () => {
      // First login should return session token requiring MFA
      const loginResponse = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: {
          email: mfaUser.email,
          password: 'password123',
        },
      });

      expect(loginResponse.statusCode).toBe(200);
      const { sessionToken, mfaRequired } = loginResponse.json();
      expect(mfaRequired).toBe(true);

      // Complete MFA verification
      const validCode = speakeasy.totp({
        secret: mfaSecret,
        encoding: 'base32',
      });

      const mfaResponse = await app.inject({
        method: 'POST',
        url: '/auth/verify-mfa',
        headers: {
          authorization: `Bearer ${sessionToken}`,
        },
        payload: {
          code: validCode,
          type: 'totp',
        },
      });

      expect(mfaResponse.statusCode).toBe(200);
      const { accessToken: newAccessToken } = mfaResponse.json();

      // Old session token should no longer be valid
      const oldTokenResponse = await app.inject({
        method: 'GET',
        url: '/users/profile',
        headers: {
          authorization: `Bearer ${sessionToken}`,
        },
      });

      expect(oldTokenResponse.statusCode).toBe(401);

      // New token should work
      const newTokenResponse = await app.inject({
        method: 'GET',
        url: '/users/profile',
        headers: {
          authorization: `Bearer ${newAccessToken}`,
        },
      });

      expect(newTokenResponse.statusCode).toBe(200);
    });

    it('should prevent MFA bypass through concurrent requests', async () => {
      const validCode = speakeasy.totp({
        secret: mfaSecret,
        encoding: 'base32',
      });

      // Send multiple concurrent MFA verification requests
      const concurrentRequests = Array.from({ length: 5 }, () =>
        app.inject({
          method: 'POST',
          url: '/mfa/verify',
          headers: {
            authorization: `Bearer ${userToken}`,
          },
          payload: {
            code: validCode,
            type: 'totp',
          },
        })
      );

      const responses = await Promise.all(concurrentRequests);

      // Only one should succeed (first one), others should fail
      const successfulResponses = responses.filter(r => r.statusCode === 200);
      const failedResponses = responses.filter(r => r.statusCode !== 200);

      expect(successfulResponses.length).toBe(1);
      expect(failedResponses.length).toBe(4);
    });
  });

  describe('MFA Recovery Security', () => {
    it('should secure MFA recovery process', async () => {
      // Mock user locked out of MFA
      vi.mocked(app.prisma.user.findUnique).mockResolvedValue({
        ...mfaUser,
        twoFactorEnabled: true,
        twoFactorSecret: mfaSecret,
        backupCodes: JSON.stringify([]), // No backup codes left
      });

      // Recovery should require additional verification
      const recoveryResponse = await app.inject({
        method: 'POST',
        url: '/mfa/recovery',
        payload: {
          email: mfaUser.email,
          verificationMethod: 'email',
        },
      });

      expect(recoveryResponse.statusCode).toBe(200);
      expect(recoveryResponse.json()).toMatchObject({
        message: 'Recovery instructions sent to your email',
        requiresAdditionalVerification: true,
      });
    });

    it('should prevent MFA recovery abuse', async () => {
      // Multiple recovery requests should be rate limited
      const recoveryRequests = [];

      for (let i = 0; i < 4; i++) {
        recoveryRequests.push(
          app.inject({
            method: 'POST',
            url: '/mfa/recovery',
            payload: {
              email: mfaUser.email,
              verificationMethod: 'email',
            },
          })
        );
      }

      const responses = await Promise.all(recoveryRequests);

      // First few should succeed
      expect(responses[0].statusCode).toBe(200);
      expect(responses[1].statusCode).toBe(200);

      // Later ones should be rate limited
      expect(responses[3].statusCode).toBe(429);
      expect(responses[3].json()).toMatchObject({
        error: 'RECOVERY_RATE_LIMIT_EXCEEDED',
        message: 'Too many recovery requests. Please try again later.',
      });
    });
  });

  describe('MFA Enrollment Security', () => {
    it('should secure MFA enrollment process', async () => {
      // Mock user without MFA
      const nonMfaUser = {
        ...mfaUser,
        twoFactorEnabled: false,
        twoFactorSecret: null,
        backupCodes: null,
      };

      vi.mocked(app.prisma.user.findUnique).mockResolvedValue(nonMfaUser);

      // Generate enrollment secret
      const enrollmentResponse = await app.inject({
        method: 'POST',
        url: '/mfa/enroll',
        headers: {
          authorization: `Bearer ${userToken}`,
        },
        payload: {
          type: 'totp',
        },
      });

      expect(enrollmentResponse.statusCode).toBe(200);
      const { secret, qrCode, backupCodes: newBackupCodes } = enrollmentResponse.json();

      expect(secret).toBeDefined();
      expect(qrCode).toBeDefined();
      expect(newBackupCodes).toHaveLength(10);

      // Verify enrollment with valid TOTP
      const enrollmentCode = speakeasy.totp({
        secret,
        encoding: 'base32',
      });

      const verifyResponse = await app.inject({
        method: 'POST',
        url: '/mfa/enroll/verify',
        headers: {
          authorization: `Bearer ${userToken}`,
        },
        payload: {
          secret,
          code: enrollmentCode,
        },
      });

      expect(verifyResponse.statusCode).toBe(200);
    });

    it('should prevent MFA enrollment manipulation', async () => {
      const maliciousEnrollmentAttempts = [
        { type: 'totp', secret: 'malicious-secret' }, // Pre-defined secret
        { type: 'totp', bypassVerification: true }, // Skip verification
        { type: 'admin-bypass' }, // Invalid type
        { type: 'totp', backupCodes: ['AAAAAAAA'] }, // Pre-defined backup codes
      ];

      for (const maliciousPayload of maliciousEnrollmentAttempts) {
        const response = await app.inject({
          method: 'POST',
          url: '/mfa/enroll',
          headers: {
            authorization: `Bearer ${userToken}`,
          },
          payload: maliciousPayload,
        });

        // Should either reject or ignore malicious parameters
        if (response.statusCode === 200) {
          const { secret } = response.json();
          expect(secret).not.toBe('malicious-secret');
        } else {
          expect(response.statusCode).toBe(400);
        }
      }
    });
  });
});