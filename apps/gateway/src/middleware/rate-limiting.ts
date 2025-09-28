import { FastifyRequest, FastifyReply, preHandlerAsyncHookHandler } from 'fastify';
import AdvancedRateLimiter, { RateLimitConfig, RateLimitResult } from '../lib/rate-limiter.js';
import config from '../lib/config.js';
import logger from '../lib/logger.js';

export class RateLimitingMiddleware {
  private rateLimiter: AdvancedRateLimiter;

  constructor() {
    const rateLimitConfig: RateLimitConfig = {
      global: config.rateLimiting.advanced.global,
      perUser: config.rateLimiting.advanced.perUser,
      perEndpoint: config.rateLimiting.advanced.perEndpoint,
      perIp: config.rateLimiting.advanced.perIp,
      bypass: config.rateLimiting.advanced.bypass
    };

    this.rateLimiter = new AdvancedRateLimiter(rateLimitConfig);
  }

  /**
   * Create rate limiting middleware with specific policies
   */
  createMiddleware(policyIds?: string[]): preHandlerAsyncHookHandler {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const result = await this.rateLimiter.checkRateLimit(request, policyIds);

        // Add rate limit headers
        for (const [header, value] of Object.entries(result.headers)) {
          reply.header(header, value);
        }

        if (!result.allowed) {
          logger.warn({
            ip: request.ip,
            url: request.url,
            method: request.method,
            userId: (request as any).user?.userId,
            key: result.key,
            algorithm: result.algorithm,
            limit: result.limit,
            remaining: result.remaining
          }, 'Rate limit exceeded');

          return reply.status(429).send({
            error: 'Too Many Requests',
            message: this.getRateLimitMessage(result),
            statusCode: 429,
            limit: result.limit,
            remaining: result.remaining,
            resetTime: result.resetTime,
            retryAfter: result.retryAfter
          });
        }

        // Log rate limit info for monitoring
        if (result.remaining < 10) {
          logger.warn({
            ip: request.ip,
            url: request.url,
            remaining: result.remaining,
            limit: result.limit,
            key: result.key
          }, 'Rate limit approaching');
        }

      } catch (error) {
        logger.error({
          error,
          ip: request.ip,
          url: request.url
        }, 'Rate limiting middleware error');

        // Fail open - allow request if rate limiting fails
        return;
      }
    };
  }

  /**
   * Create endpoint-specific rate limiting middleware
   */
  createEndpointMiddleware(
    maxRequests: number,
    windowSize: number,
    algorithm: 'sliding-window' | 'token-bucket' | 'fixed-window' = 'sliding-window'
  ): preHandlerAsyncHookHandler {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const customPolicy = {
          id: `endpoint-${request.method}-${request.routerPath}`,
          name: `Endpoint Rate Limit for ${request.method} ${request.routerPath}`,
          algorithm,
          windowSize,
          maxRequests,
          keyGenerator: 'endpoint' as const,
          headers: true,
          message: 'Too many requests to this endpoint',
          statusCode: 429
        };

        const tempRateLimiter = new AdvancedRateLimiter({
          global: customPolicy,
          perUser: customPolicy,
          perEndpoint: customPolicy,
          perIp: customPolicy,
          bypass: config.rateLimiting.advanced.bypass
        });

        const result = await tempRateLimiter.checkRateLimit(request, ['endpoint']);

        // Add rate limit headers
        for (const [header, value] of Object.entries(result.headers)) {
          reply.header(header, value);
        }

        if (!result.allowed) {
          return reply.status(429).send({
            error: 'Too Many Requests',
            message: `Rate limit exceeded for ${request.method} ${request.routerPath}`,
            statusCode: 429,
            limit: result.limit,
            remaining: result.remaining,
            resetTime: result.resetTime,
            retryAfter: result.retryAfter
          });
        }

      } catch (error) {
        logger.error({
          error,
          ip: request.ip,
          url: request.url
        }, 'Endpoint rate limiting error');

        // Fail open
        return;
      }
    };
  }

  /**
   * Create user tier-based rate limiting middleware
   */
  createTierMiddleware(
    tier: 'basic' | 'premium' | 'enterprise'
  ): preHandlerAsyncHookHandler {
    const tierLimits = {
      basic: { maxRequests: 100, windowSize: 60 },
      premium: { maxRequests: 1000, windowSize: 60 },
      enterprise: { maxRequests: 10000, windowSize: 60 }
    };

    const limits = tierLimits[tier];

    return async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const userTier = (request as any).user?.tier || 'basic';

        // Only apply if user's tier matches or is lower
        if (this.compareTiers(userTier, tier) <= 0) {
          const tierPolicy = {
            id: `tier-${tier}`,
            name: `${tier.charAt(0).toUpperCase() + tier.slice(1)} Tier Rate Limit`,
            algorithm: 'token-bucket' as const,
            windowSize: limits.windowSize,
            maxRequests: limits.maxRequests,
            keyGenerator: 'user' as const,
            headers: true,
            message: `Rate limit for ${tier} tier exceeded`,
            statusCode: 429
          };

          const tempRateLimiter = new AdvancedRateLimiter({
            global: tierPolicy,
            perUser: tierPolicy,
            perEndpoint: tierPolicy,
            perIp: tierPolicy,
            bypass: config.rateLimiting.advanced.bypass
          });

          const result = await tempRateLimiter.checkRateLimit(request, ['tier']);

          // Add rate limit headers
          for (const [header, value] of Object.entries(result.headers)) {
            reply.header(header, value);
          }

          if (!result.allowed) {
            return reply.status(429).send({
              error: 'Too Many Requests',
              message: `Rate limit exceeded for ${tier} tier`,
              statusCode: 429,
              limit: result.limit,
              remaining: result.remaining,
              resetTime: result.resetTime,
              retryAfter: result.retryAfter,
              upgradeInfo: tier === 'basic' ? 'Upgrade to premium for higher limits' : undefined
            });
          }
        }

      } catch (error) {
        logger.error({
          error,
          tier,
          ip: request.ip,
          url: request.url
        }, 'Tier rate limiting error');

        // Fail open
        return;
      }
    };
  }

  /**
   * Get rate limit status for monitoring
   */
  async getRateLimitStatus(request: FastifyRequest, policyId: string) {
    return await this.rateLimiter.getStatus(request, policyId);
  }

  /**
   * Reset rate limit for admin operations
   */
  async resetRateLimit(key: string, policyId: string): Promise<boolean> {
    return await this.rateLimiter.resetLimit(key, policyId);
  }

  /**
   * Get rate limiting statistics
   */
  async getStats() {
    return await this.rateLimiter.getStats();
  }

  /**
   * Get appropriate rate limit message
   */
  private getRateLimitMessage(result: RateLimitResult): string {
    const policy = this.getPolicyFromKey(result.key);

    if (policy?.message) {
      return policy.message;
    }

    switch (result.algorithm) {
      case 'sliding-window':
        return `Rate limit exceeded. Try again in ${result.retryAfter} seconds.`;
      case 'token-bucket':
        return `Rate limit exceeded. Tokens will be refilled over time.`;
      case 'fixed-window':
        return `Rate limit exceeded. Window resets at ${new Date(result.resetTime).toISOString()}.`;
      default:
        return 'Rate limit exceeded. Please try again later.';
    }
  }

  /**
   * Get policy configuration from key
   */
  private getPolicyFromKey(key: string) {
    const policies = [
      config.rateLimiting.advanced.global,
      config.rateLimiting.advanced.perUser,
      config.rateLimiting.advanced.perEndpoint,
      config.rateLimiting.advanced.perIp
    ];

    const policyId = key.split(':')[0];
    return policies.find(p => p.id === policyId);
  }

  /**
   * Compare user tiers
   */
  private compareTiers(tier1: string, tier2: string): number {
    const tierOrder = ['basic', 'premium', 'enterprise'];
    const index1 = tierOrder.indexOf(tier1);
    const index2 = tierOrder.indexOf(tier2);
    return index1 - index2;
  }

  /**
   * Create adaptive rate limiting based on system load
   */
  createAdaptiveMiddleware(
    baseMaxRequests: number,
    basalMetricThreshold: number = 0.8
  ): preHandlerAsyncHookHandler {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        // Get system metrics
        const memoryUsage = process.memoryUsage();
        const memoryUtilization = memoryUsage.heapUsed / memoryUsage.heapTotal;

        // Adjust rate limits based on system load
        let adjustedMaxRequests = baseMaxRequests;

        if (memoryUtilization > basalMetricThreshold) {
          const loadFactor = Math.max(0.1, 1 - (memoryUtilization - basalMetricThreshold) * 2);
          adjustedMaxRequests = Math.floor(baseMaxRequests * loadFactor);
        }

        const adaptivePolicy = {
          id: 'adaptive',
          name: 'Adaptive Rate Limit',
          algorithm: 'sliding-window' as const,
          windowSize: 60,
          maxRequests: adjustedMaxRequests,
          keyGenerator: 'composite' as const,
          headers: true,
          message: 'System under high load - rate limit reduced',
          statusCode: 429
        };

        const tempRateLimiter = new AdvancedRateLimiter({
          global: adaptivePolicy,
          perUser: adaptivePolicy,
          perEndpoint: adaptivePolicy,
          perIp: adaptivePolicy,
          bypass: config.rateLimiting.advanced.bypass
        });

        const result = await tempRateLimiter.checkRateLimit(request, ['adaptive']);

        // Add adaptive headers
        reply.header('X-RateLimit-Adaptive', 'true');
        reply.header('X-RateLimit-Load-Factor', (adjustedMaxRequests / baseMaxRequests).toFixed(2));

        for (const [header, value] of Object.entries(result.headers)) {
          reply.header(header, value);
        }

        if (!result.allowed) {
          return reply.status(503).send({
            error: 'Service Temporarily Overloaded',
            message: 'System is under high load. Please try again later.',
            statusCode: 503,
            limit: result.limit,
            remaining: result.remaining,
            resetTime: result.resetTime,
            retryAfter: result.retryAfter
          });
        }

      } catch (error) {
        logger.error({
          error,
          ip: request.ip,
          url: request.url
        }, 'Adaptive rate limiting error');

        // Fail open
        return;
      }
    };
  }
}

export default RateLimitingMiddleware;