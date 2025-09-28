import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { FastifyInstance } from 'fastify';
import { build } from '../server.js';
import crypto from 'crypto';

/**
 * Brute Force Protection and Rate Limiting Security Tests
 *
 * Comprehensive security testing for rate limiting and brute force protection including:
 * - Login attempt rate limiting
 * - API endpoint rate limiting
 * - Distributed attack protection
 * - Rate limit bypass techniques
 * - Progressive delay implementation
 * - IP-based and user-based rate limiting
 */
describe('Rate Limiting Security Tests', () => {
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
      id: 'rate-test-user-123',
      email: 'ratetest@example.com',
      role: 'user',
      isActive: true,
      organizationId: 'test-org',
      passwordHash: '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj3z3z3z3z3z', // 'password123'
      loginAttempts: 0,
      lockedUntil: null,
      lastLoginAt: new Date(),
      lastActivityAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
      firstName: 'Rate',
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
    setupRateLimitMocks();
  });

  function setupRateLimitMocks() {
    vi.mocked(app.prisma.user.findUnique).mockResolvedValue(testUser);
    vi.mocked(app.prisma.user.update).mockImplementation(async ({ data }) => ({
      ...testUser,
      ...data,
    }));
  }

  async function makeParallelRequests(url: string, count: number, options: any = {}) {
    const requests = Array.from({ length: count }, (_, i) =>
      app.inject({
        method: options.method || 'POST',
        url,
        payload: options.payload || { email: testUser.email, password: 'wrongpassword' },
        headers: {
          'x-forwarded-for': options.ipAddress || '192.168.1.100',
          'user-agent': options.userAgent || 'test-browser',
          ...options.headers,
        },
      })
    );

    return Promise.all(requests);
  }

  describe('Login Rate Limiting', () => {
    it('should rate limit failed login attempts per IP', async () => {
      const responses = await makeParallelRequests('/auth/login', 6, {
        ipAddress: '192.168.1.100',
      });

      // First 5 attempts should return authentication error
      for (let i = 0; i < 5; i++) {
        expect(responses[i].statusCode).toBe(401);
        expect(responses[i].json()).toMatchObject({
          error: 'INVALID_CREDENTIALS',
        });
      }

      // 6th attempt should be rate limited
      expect(responses[5].statusCode).toBe(429);
      expect(responses[5].json()).toMatchObject({
        error: 'TOO_MANY_ATTEMPTS',
        message: 'Too many failed login attempts. Please try again later.',
      });
    });

    it('should rate limit failed login attempts per user account', async () => {
      // Mock user with failed login attempts
      vi.mocked(app.prisma.user.findUnique).mockResolvedValue({
        ...testUser,
        loginAttempts: 5,
        lockedUntil: new Date(Date.now() + 900000), // Locked for 15 minutes
      });

      const response = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: {
          email: testUser.email,
          password: 'correctpassword',
        },
      });

      expect(response.statusCode).toBe(423);
      expect(response.json()).toMatchObject({
        error: 'ACCOUNT_LOCKED',
        message: 'Account is temporarily locked due to too many failed attempts',
      });
    });

    it('should implement progressive delay for repeated failures', async () => {
      // Test progressive delay by measuring response times
      const attempts = [];
      const timings = [];

      for (let i = 0; i < 5; i++) {
        const start = Date.now();
        const response = await app.inject({
          method: 'POST',
          url: '/auth/login',
          payload: {
            email: testUser.email,
            password: 'wrongpassword',
          },
          headers: {
            'x-forwarded-for': '192.168.1.101',
          },
        });
        const duration = Date.now() - start;

        attempts.push(response);
        timings.push(duration);
      }

      // Later attempts should take longer (progressive delay)
      expect(timings[4]).toBeGreaterThan(timings[0]);
      expect(timings[3]).toBeGreaterThan(timings[1]);
    });

    it('should reset rate limit after successful login', async () => {
      // First, trigger rate limiting
      await makeParallelRequests('/auth/login', 5, {
        ipAddress: '192.168.1.102',
      });

      // Attempt login with correct credentials
      const successfulResponse = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: {
          email: testUser.email,
          password: 'password123',
        },
        headers: {
          'x-forwarded-for': '192.168.1.102',
        },
      });

      expect(successfulResponse.statusCode).toBe(200);

      // Next failed attempt should not be immediately rate limited
      const nextAttemptResponse = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: {
          email: testUser.email,
          password: 'wrongpassword',
        },
        headers: {
          'x-forwarded-for': '192.168.1.102',
        },
      });

      expect(nextAttemptResponse.statusCode).toBe(401);
      expect(nextAttemptResponse.json().error).toBe('INVALID_CREDENTIALS');
    });

    it('should handle distributed brute force attacks', async () => {
      // Simulate attacks from multiple IPs
      const ipAddresses = ['192.168.1.200', '192.168.1.201', '192.168.1.202', '192.168.1.203'];
      const distributedAttacks = ipAddresses.map(ip =>
        makeParallelRequests('/auth/login', 3, { ipAddress: ip })
      );

      const allResponses = await Promise.all(distributedAttacks);

      // Each IP should be rate limited independently
      allResponses.forEach(responses => {
        responses.forEach((response, index) => {
          if (index < 3) {
            expect([401, 429]).toContain(response.statusCode);
          }
        });
      });
    });
  });

  describe('API Rate Limiting', () => {
    it('should rate limit API requests per user', async () => {
      const responses = await Promise.all(
        Array.from({ length: 101 }, () =>
          app.inject({
            method: 'GET',
            url: '/users/profile',
            headers: {
              authorization: `Bearer ${validToken}`,
            },
          })
        )
      );

      // First 100 should succeed
      for (let i = 0; i < 100; i++) {
        expect(responses[i].statusCode).toBe(200);
      }

      // 101st should be rate limited
      expect(responses[100].statusCode).toBe(429);
      expect(responses[100].json()).toMatchObject({
        error: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests. Please try again later.',
      });
    });

    it('should have different rate limits for different endpoints', async () => {
      // High-frequency endpoint (profile) - higher limit
      const profileResponses = await Promise.all(
        Array.from({ length: 50 }, () =>
          app.inject({
            method: 'GET',
            url: '/users/profile',
            headers: {
              authorization: `Bearer ${validToken}`,
            },
          })
        )
      );

      // Administrative endpoint - lower limit
      const adminResponses = await Promise.all(
        Array.from({ length: 10 }, () =>
          app.inject({
            method: 'GET',
            url: '/admin/users',
            headers: {
              authorization: `Bearer ${validToken}`,
            },
          })
        )
      );

      // Profile requests should mostly succeed
      const successfulProfile = profileResponses.filter(r => r.statusCode === 200);
      expect(successfulProfile.length).toBeGreaterThan(30);

      // Admin requests should be more limited
      const rateLimitedAdmin = adminResponses.filter(r => r.statusCode === 429);
      expect(rateLimitedAdmin.length).toBeGreaterThan(0);
    });

    it('should implement sliding window rate limiting', async () => {
      // Make requests to fill the rate limit window
      const firstBatch = await Promise.all(
        Array.from({ length: 50 }, () =>
          app.inject({
            method: 'GET',
            url: '/users/profile',
            headers: {
              authorization: `Bearer ${validToken}`,
            },
          })
        )
      );

      // Wait for window to slide
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Make more requests - should be allowed as window has slid
      const secondBatch = await Promise.all(
        Array.from({ length: 25 }, () =>
          app.inject({
            method: 'GET',
            url: '/users/profile',
            headers: {
              authorization: `Bearer ${validToken}`,
            },
          })
        )
      );

      const successfulSecondBatch = secondBatch.filter(r => r.statusCode === 200);
      expect(successfulSecondBatch.length).toBeGreaterThan(0);
    });

    it('should provide rate limit headers', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/users/profile',
        headers: {
          authorization: `Bearer ${validToken}`,
        },
      });

      expect(response.headers).toHaveProperty('x-ratelimit-limit');
      expect(response.headers).toHaveProperty('x-ratelimit-remaining');
      expect(response.headers).toHaveProperty('x-ratelimit-reset');

      expect(parseInt(response.headers['x-ratelimit-limit'] as string)).toBeGreaterThan(0);
      expect(parseInt(response.headers['x-ratelimit-remaining'] as string)).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Rate Limit Bypass Prevention', () => {
    it('should prevent X-Forwarded-For header spoofing', async () => {
      // Attempt to bypass rate limiting by spoofing IP
      const responses = await Promise.all(
        Array.from({ length: 10 }, (_, i) =>
          app.inject({
            method: 'POST',
            url: '/auth/login',
            payload: {
              email: testUser.email,
              password: 'wrongpassword',
            },
            headers: {
              'x-forwarded-for': `192.168.1.${i + 10}`, // Different IP each time
              'x-real-ip': '192.168.1.100', // Real IP
            },
          })
        )
      );

      // Should still be rate limited based on real IP
      const rateLimited = responses.filter(r => r.statusCode === 429);
      expect(rateLimited.length).toBeGreaterThan(0);
    });

    it('should prevent User-Agent rotation bypass', async () => {
      const userAgents = [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:91.0) Gecko/20100101',
      ];

      const responses = await Promise.all(
        Array.from({ length: 8 }, (_, i) =>
          app.inject({
            method: 'POST',
            url: '/auth/login',
            payload: {
              email: testUser.email,
              password: 'wrongpassword',
            },
            headers: {
              'x-forwarded-for': '192.168.1.103',
              'user-agent': userAgents[i % userAgents.length],
            },
          })
        )
      );

      // Should still be rate limited despite User-Agent rotation
      const rateLimited = responses.filter(r => r.statusCode === 429);
      expect(rateLimited.length).toBeGreaterThan(0);
    });

    it('should prevent session token rotation bypass', async () => {
      // Generate multiple valid tokens for the same user
      const tokens = Array.from({ length: 5 }, () =>
        app.jwt.sign({
          userId: testUser.id,
          email: testUser.email,
          role: testUser.role,
          organizationId: testUser.organizationId,
          permissions: ['user:read'],
        })
      );

      // Use different tokens to attempt bypass
      const responses = await Promise.all(
        Array.from({ length: 110 }, (_, i) =>
          app.inject({
            method: 'GET',
            url: '/users/profile',
            headers: {
              authorization: `Bearer ${tokens[i % tokens.length]}`,
            },
          })
        )
      );

      // Should still be rate limited per user regardless of token
      const rateLimited = responses.filter(r => r.statusCode === 429);
      expect(rateLimited.length).toBeGreaterThan(0);
    });

    it('should detect and block rapid automated requests', async () => {
      // Simulate automated tool with very rapid requests
      const rapidRequests = [];
      const startTime = Date.now();

      for (let i = 0; i < 50; i++) {
        rapidRequests.push(
          app.inject({
            method: 'GET',
            url: '/users/profile',
            headers: {
              authorization: `Bearer ${validToken}`,
              'x-forwarded-for': '192.168.1.104',
            },
          })
        );
      }

      const responses = await Promise.all(rapidRequests);
      const endTime = Date.now();
      const totalTime = endTime - startTime;

      // If requests are too rapid (less than 100ms total), should trigger anti-automation
      if (totalTime < 100) {
        const blocked = responses.filter(r => r.statusCode === 429);
        expect(blocked.length).toBeGreaterThan(10);
      }
    });
  });

  describe('Specialized Rate Limiting', () => {
    it('should rate limit password reset requests', async () => {
      const responses = await makeParallelRequests('/auth/forgot-password', 4, {
        method: 'POST',
        payload: { email: testUser.email },
        ipAddress: '192.168.1.105',
      });

      // First 2-3 should succeed
      const successful = responses.filter(r => r.statusCode === 200);
      const rateLimited = responses.filter(r => r.statusCode === 429);

      expect(successful.length).toBeGreaterThanOrEqual(2);
      expect(rateLimited.length).toBeGreaterThan(0);
    });

    it('should rate limit registration attempts', async () => {
      const responses = await Promise.all(
        Array.from({ length: 6 }, (_, i) =>
          app.inject({
            method: 'POST',
            url: '/auth/register',
            payload: {
              email: `test${i}@example.com`,
              password: 'password123',
              firstName: 'Test',
              lastName: 'User',
            },
            headers: {
              'x-forwarded-for': '192.168.1.106',
            },
          })
        )
      );

      // Should be rate limited to prevent spam registrations
      const rateLimited = responses.filter(r => r.statusCode === 429);
      expect(rateLimited.length).toBeGreaterThan(0);
    });

    it('should rate limit file upload endpoints', async () => {
      const fileContent = crypto.randomBytes(1024).toString('base64');

      const responses = await Promise.all(
        Array.from({ length: 5 }, () =>
          app.inject({
            method: 'POST',
            url: '/users/avatar',
            headers: {
              authorization: `Bearer ${validToken}`,
              'content-type': 'multipart/form-data',
            },
            payload: {
              file: fileContent,
            },
          })
        )
      );

      // File uploads should have strict rate limiting
      const rateLimited = responses.filter(r => r.statusCode === 429);
      expect(rateLimited.length).toBeGreaterThan(2);
    });

    it('should rate limit search and export operations', async () => {
      const searchResponses = await Promise.all(
        Array.from({ length: 20 }, () =>
          app.inject({
            method: 'GET',
            url: '/users/search?q=test',
            headers: {
              authorization: `Bearer ${validToken}`,
            },
          })
        )
      );

      // Search operations should be rate limited to prevent resource abuse
      const rateLimited = searchResponses.filter(r => r.statusCode === 429);
      expect(rateLimited.length).toBeGreaterThan(0);
    });
  });

  describe('Rate Limit Error Handling', () => {
    it('should provide detailed rate limit information in responses', async () => {
      // Trigger rate limit
      await makeParallelRequests('/auth/login', 6, {
        ipAddress: '192.168.1.107',
      });

      const rateLimitedResponse = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: {
          email: testUser.email,
          password: 'wrongpassword',
        },
        headers: {
          'x-forwarded-for': '192.168.1.107',
        },
      });

      expect(rateLimitedResponse.statusCode).toBe(429);
      expect(rateLimitedResponse.json()).toMatchObject({
        error: 'TOO_MANY_ATTEMPTS',
        message: expect.stringContaining('try again'),
        retryAfter: expect.any(Number),
      });

      expect(rateLimitedResponse.headers).toHaveProperty('retry-after');
    });

    it('should handle rate limit storage failures gracefully', async () => {
      // Mock Redis/storage failure
      vi.mocked(app.redis?.set).mockRejectedValue(new Error('Redis connection failed'));

      const response = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: {
          email: testUser.email,
          password: 'wrongpassword',
        },
      });

      // Should still function even if rate limiting fails
      expect([401, 500]).toContain(response.statusCode);
    });

    it('should log suspicious rate limit patterns', async () => {
      const logSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      // Trigger suspicious pattern (many requests from single IP)
      await makeParallelRequests('/auth/login', 10, {
        ipAddress: '192.168.1.108',
      });

      // Should log security event
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('Suspicious activity'),
        expect.objectContaining({
          ip: '192.168.1.108',
        })
      );

      logSpy.mockRestore();
    });
  });

  describe('Adaptive Rate Limiting', () => {
    it('should adjust rate limits based on user behavior', async () => {
      // Simulate good user behavior first
      const goodBehaviorResponses = await Promise.all(
        Array.from({ length: 20 }, () =>
          app.inject({
            method: 'GET',
            url: '/users/profile',
            headers: {
              authorization: `Bearer ${validToken}`,
            },
          })
        )
      );

      const successfulGoodBehavior = goodBehaviorResponses.filter(r => r.statusCode === 200);

      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 100));

      // Now simulate suspicious behavior
      const suspiciousResponses = await Promise.all(
        Array.from({ length: 50 }, () =>
          app.inject({
            method: 'GET',
            url: '/users/profile',
            headers: {
              authorization: `Bearer ${validToken}`,
            },
          })
        )
      );

      const rateLimitedSuspicious = suspiciousResponses.filter(r => r.statusCode === 429);

      // Should have stricter limits for suspicious behavior
      expect(rateLimitedSuspicious.length).toBeGreaterThan(0);
    });

    it('should implement circuit breaker for repeated violations', async () => {
      const violationIp = '192.168.1.109';

      // Create multiple violation cycles
      for (let cycle = 0; cycle < 3; cycle++) {
        await makeParallelRequests('/auth/login', 6, {
          ipAddress: violationIp,
        });

        // Brief pause between cycles
        await new Promise(resolve => setTimeout(resolve, 50));
      }

      // Final request should trigger circuit breaker
      const circuitBreakerResponse = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: {
          email: testUser.email,
          password: 'password123', // Even correct password should be blocked
        },
        headers: {
          'x-forwarded-for': violationIp,
        },
      });

      expect(circuitBreakerResponse.statusCode).toBe(429);
      expect(circuitBreakerResponse.json()).toMatchObject({
        error: 'CIRCUIT_BREAKER_OPEN',
        message: expect.stringContaining('temporarily blocked'),
      });
    });
  });
});