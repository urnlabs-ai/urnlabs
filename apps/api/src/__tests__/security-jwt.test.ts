import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { FastifyInstance } from 'fastify';
import { build } from '../server.js';
import { createJWTService } from '@/services/jwt-service.js';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

/**
 * JWT Security Tests
 *
 * Comprehensive security testing for JWT authentication including:
 * - Token manipulation attacks
 * - Algorithm confusion attacks
 * - Token expiration and validation
 * - Key rotation security
 * - Signature verification bypass attempts
 */
describe('JWT Security Tests', () => {
  let app: FastifyInstance;
  let jwtService: any;
  let validToken: string;
  let validUserId: string;

  beforeAll(async () => {
    app = build({
      logger: false,
      disableRequestLogging: true,
    });

    await app.ready();
    jwtService = createJWTService(app);
    validUserId = 'test-user-123';

    // Mock database user for validation
    vi.mocked(app.prisma.user.findUnique).mockResolvedValue({
      id: validUserId,
      email: 'test@example.com',
      role: 'user',
      isActive: true,
      organizationId: 'test-org',
      lastLoginAt: new Date(),
      lastActivityAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
      passwordHash: 'hashed',
      firstName: 'Test',
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
    });

    // Generate valid token for baseline tests
    validToken = await jwtService.generateAccessToken({
      userId: validUserId,
      email: 'test@example.com',
      role: 'user',
      organizationId: 'test-org',
      permissions: ['read:profile'],
    });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Token Manipulation Attacks', () => {
    it('should reject tokens with modified payload', async () => {
      // Decode token and modify payload
      const decoded = jwt.decode(validToken, { complete: true }) as any;
      const modifiedPayload = {
        ...decoded.payload,
        role: 'admin', // Privilege escalation attempt
        permissions: ['admin:*'],
      };

      // Re-encode with same header and signature (should fail)
      const modifiedToken = `${decoded.header}.${Buffer.from(JSON.stringify(modifiedPayload)).toString('base64url')}.${decoded.signature}`;

      const response = await app.inject({
        method: 'GET',
        url: '/users/profile',
        headers: {
          authorization: `Bearer ${modifiedToken}`,
        },
      });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toMatchObject({
        error: 'Unauthorized',
        message: 'Invalid or expired token',
      });
    });

    it('should reject tokens with modified header (algorithm confusion)', async () => {
      const payload = {
        userId: validUserId,
        email: 'test@example.com',
        role: 'admin',
        permissions: ['admin:*'],
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
      };

      // Create token with 'none' algorithm
      const noneToken = jwt.sign(payload, '', { algorithm: 'none' as any });

      const response = await app.inject({
        method: 'GET',
        url: '/users/profile',
        headers: {
          authorization: `Bearer ${noneToken}`,
        },
      });

      expect(response.statusCode).toBe(401);
    });

    it('should reject tokens with HS256 when expecting RS256', async () => {
      const payload = {
        userId: validUserId,
        email: 'test@example.com',
        role: 'admin',
        permissions: ['admin:*'],
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
      };

      // Try to sign with HMAC using public key as secret
      const publicKey = process.env.JWT_PUBLIC_KEY || 'test-secret';
      const hmacToken = jwt.sign(payload, publicKey, { algorithm: 'HS256' });

      const response = await app.inject({
        method: 'GET',
        url: '/users/profile',
        headers: {
          authorization: `Bearer ${hmacToken}`,
        },
      });

      expect(response.statusCode).toBe(401);
    });

    it('should reject tokens with invalid signature', async () => {
      const decoded = jwt.decode(validToken, { complete: true }) as any;
      const invalidSignature = crypto.randomBytes(32).toString('base64url');
      const invalidToken = `${decoded.header}.${decoded.payload}.${invalidSignature}`;

      const response = await app.inject({
        method: 'GET',
        url: '/users/profile',
        headers: {
          authorization: `Bearer ${invalidToken}`,
        },
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('Token Expiration and Timing Attacks', () => {
    it('should reject expired tokens', async () => {
      const expiredPayload = {
        userId: validUserId,
        email: 'test@example.com',
        role: 'user',
        permissions: ['read:profile'],
        iat: Math.floor(Date.now() / 1000) - 7200, // 2 hours ago
        exp: Math.floor(Date.now() / 1000) - 3600, // 1 hour ago (expired)
      };

      // Create properly signed but expired token
      const privateKey = process.env.JWT_PRIVATE_KEY || crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;
      const expiredToken = jwt.sign(expiredPayload, privateKey, { algorithm: 'RS256' });

      const response = await app.inject({
        method: 'GET',
        url: '/users/profile',
        headers: {
          authorization: `Bearer ${expiredToken}`,
        },
      });

      expect(response.statusCode).toBe(401);
    });

    it('should reject tokens issued in the future', async () => {
      const futurePayload = {
        userId: validUserId,
        email: 'test@example.com',
        role: 'user',
        permissions: ['read:profile'],
        iat: Math.floor(Date.now() / 1000) + 3600, // 1 hour in the future
        exp: Math.floor(Date.now() / 1000) + 7200, // 2 hours in the future
      };

      const privateKey = process.env.JWT_PRIVATE_KEY || crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;
      const futureToken = jwt.sign(futurePayload, privateKey, { algorithm: 'RS256' });

      const response = await app.inject({
        method: 'GET',
        url: '/users/profile',
        headers: {
          authorization: `Bearer ${futureToken}`,
        },
      });

      expect(response.statusCode).toBe(401);
    });

    it('should warn when token is about to expire', async () => {
      // Create token that expires in 30 minutes
      const soonExpiringPayload = {
        userId: validUserId,
        email: 'test@example.com',
        role: 'user',
        permissions: ['read:profile'],
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 1800, // 30 minutes
      };

      const privateKey = process.env.JWT_PRIVATE_KEY || crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;
      const soonExpiringToken = jwt.sign(soonExpiringPayload, privateKey, { algorithm: 'RS256' });

      const response = await app.inject({
        method: 'GET',
        url: '/users/profile',
        headers: {
          authorization: `Bearer ${soonExpiringToken}`,
        },
      });

      expect(response.headers['x-token-expires-soon']).toBe('true');
      expect(parseInt(response.headers['x-token-expires-in'] as string)).toBeLessThan(3600);
    });
  });

  describe('Token Structure Validation', () => {
    it('should reject malformed tokens', async () => {
      const malformedTokens = [
        'invalid.token',                    // Too few parts
        'invalid.token.signature.extra',    // Too many parts
        'not-base64.token.signature',       // Invalid base64
        '',                                 // Empty token
        'Bearer token-without-bearer',      // Invalid format
      ];

      for (const malformedToken of malformedTokens) {
        const response = await app.inject({
          method: 'GET',
          url: '/users/profile',
          headers: {
            authorization: `Bearer ${malformedToken}`,
          },
        });

        expect(response.statusCode).toBe(401);
      }
    });

    it('should reject tokens with missing required claims', async () => {
      const incompletePayload = {
        // Missing userId
        email: 'test@example.com',
        role: 'user',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
      };

      const privateKey = process.env.JWT_PRIVATE_KEY || crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;
      const incompleteToken = jwt.sign(incompletePayload, privateKey, { algorithm: 'RS256' });

      const response = await app.inject({
        method: 'GET',
        url: '/users/profile',
        headers: {
          authorization: `Bearer ${incompleteToken}`,
        },
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('User Validation Security', () => {
    it('should reject tokens for non-existent users', async () => {
      vi.mocked(app.prisma.user.findUnique).mockResolvedValueOnce(null);

      const response = await app.inject({
        method: 'GET',
        url: '/users/profile',
        headers: {
          authorization: `Bearer ${validToken}`,
        },
      });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toMatchObject({
        error: 'Unauthorized',
        message: 'User account not found',
      });
    });

    it('should reject tokens for inactive users', async () => {
      vi.mocked(app.prisma.user.findUnique).mockResolvedValueOnce({
        id: validUserId,
        email: 'test@example.com',
        role: 'user',
        isActive: false, // User is inactive
        organizationId: 'test-org',
        lastLoginAt: new Date(),
        lastActivityAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
        passwordHash: 'hashed',
        firstName: 'Test',
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
        error: 'Forbidden',
        message: 'User account is deactivated',
      });
    });

    it('should handle database errors gracefully', async () => {
      vi.mocked(app.prisma.user.findUnique).mockRejectedValueOnce(new Error('Database connection failed'));

      const response = await app.inject({
        method: 'GET',
        url: '/users/profile',
        headers: {
          authorization: `Bearer ${validToken}`,
        },
      });

      expect(response.statusCode).toBe(500);
      expect(response.json()).toMatchObject({
        error: 'Internal Server Error',
        message: 'Authentication service unavailable',
      });
    });
  });

  describe('Authorization Header Validation', () => {
    it('should reject requests without authorization header', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/users/profile',
      });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toMatchObject({
        error: 'Unauthorized',
        message: 'Authorization token required',
      });
    });

    it('should reject requests with invalid authorization scheme', async () => {
      const invalidSchemes = [
        'Basic dGVzdDp0ZXN0',    // Basic auth
        'Digest username="test"', // Digest auth
        'Token abc123',          // Custom scheme
        'Bearer',                // Missing token
        'bearer token',          // Wrong case
      ];

      for (const invalidScheme of invalidSchemes) {
        const response = await app.inject({
          method: 'GET',
          url: '/users/profile',
          headers: {
            authorization: invalidScheme,
          },
        });

        expect(response.statusCode).toBe(401);
      }
    });
  });

  describe('Refresh Token Security', () => {
    it('should validate refresh token properly', async () => {
      const refreshToken = await jwtService.generateRefreshToken(validUserId);

      // Mock refresh token storage validation
      vi.mocked(app.prisma.refreshToken.findUnique).mockResolvedValue({
        id: 'refresh-1',
        token: refreshToken,
        userId: validUserId,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
        createdAt: new Date(),
        lastUsedAt: new Date(),
        isRevoked: false,
        deviceInfo: 'test-device',
        ipAddress: '127.0.0.1',
      });

      const response = await app.inject({
        method: 'POST',
        url: '/auth/refresh',
        payload: {
          refreshToken,
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toHaveProperty('accessToken');
    });

    it('should reject revoked refresh tokens', async () => {
      const refreshToken = await jwtService.generateRefreshToken(validUserId);

      vi.mocked(app.prisma.refreshToken.findUnique).mockResolvedValue({
        id: 'refresh-1',
        token: refreshToken,
        userId: validUserId,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        createdAt: new Date(),
        lastUsedAt: new Date(),
        isRevoked: true, // Token is revoked
        deviceInfo: 'test-device',
        ipAddress: '127.0.0.1',
      });

      const response = await app.inject({
        method: 'POST',
        url: '/auth/refresh',
        payload: {
          refreshToken,
        },
      });

      expect(response.statusCode).toBe(401);
    });
  });
});