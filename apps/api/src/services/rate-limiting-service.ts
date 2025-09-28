import { FastifyRequest, FastifyReply } from 'fastify';
import { getRedisClient } from '@/lib/redis.js';
import { logger } from '@/lib/logger.js';
import { getSessionService } from '@/services/session-service.js';

// ============================================================================
// REDIS-BACKED RATE LIMITING SERVICE
// ============================================================================

export interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Maximum requests per window
  keyGenerator?: (request: FastifyRequest) => string;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
  onLimitReached?: (request: FastifyRequest, reply: FastifyReply) => void;
}

export interface RateLimitRule {
  path: string;
  method?: string;
  config: RateLimitConfig;
  authenticatedConfig?: RateLimitConfig; // Different limits for authenticated users
}

export class RateLimitingService {
  private redisClient: any;
  private useRedis = false;
  private memoryStore = new Map<string, { count: number; resetTime: number }>();
  private rules: RateLimitRule[] = [];

  constructor() {
    this.initializeRedis();
    this.setupDefaultRules();
  }

  private async initializeRedis(): Promise<void> {
    try {
      this.redisClient = getRedisClient();
      if (this.redisClient) {
        this.useRedis = true;
        logger.info('Rate limiting service using Redis backend');
      } else {
        logger.warn('Rate limiting service using in-memory storage (not recommended for production)');
      }
    } catch (error) {
      logger.warn('Failed to connect to Redis for rate limiting, using in-memory storage', { error });
    }
  }

  private setupDefaultRules(): void {
    this.rules = [
      // Authentication endpoints - strict limits
      {
        path: '/auth/login',
        method: 'POST',
        config: {
          windowMs: 15 * 60 * 1000, // 15 minutes
          maxRequests: 5, // 5 attempts per 15 minutes
        },
      },
      {
        path: '/auth/register',
        method: 'POST',
        config: {
          windowMs: 60 * 60 * 1000, // 1 hour
          maxRequests: 3, // 3 registrations per hour
        },
      },
      {
        path: '/auth/reset-password',
        method: 'POST',
        config: {
          windowMs: 60 * 60 * 1000, // 1 hour
          maxRequests: 5, // 5 reset attempts per hour
        },
      },

      // MFA endpoints
      {
        path: '/mfa/verify',
        method: 'POST',
        config: {
          windowMs: 15 * 60 * 1000, // 15 minutes
          maxRequests: 10, // 10 attempts per 15 minutes
        },
      },
      {
        path: '/mfa/setup',
        method: 'POST',
        config: {
          windowMs: 60 * 60 * 1000, // 1 hour
          maxRequests: 5, // 5 setup attempts per hour
        },
      },

      // SSO endpoints
      {
        path: '/sso/auth',
        config: {
          windowMs: 15 * 60 * 1000, // 15 minutes
          maxRequests: 20, // 20 SSO attempts per 15 minutes
        },
      },

      // General API endpoints
      {
        path: '/users',
        config: {
          windowMs: 60 * 1000, // 1 minute
          maxRequests: 100, // 100 requests per minute
        },
        authenticatedConfig: {
          windowMs: 60 * 1000, // 1 minute
          maxRequests: 200, // Higher limit for authenticated users
        },
      },
      {
        path: '/agents',
        config: {
          windowMs: 60 * 1000, // 1 minute
          maxRequests: 50, // 50 requests per minute
        },
        authenticatedConfig: {
          windowMs: 60 * 1000, // 1 minute
          maxRequests: 150, // Higher limit for authenticated users
        },
      },
      {
        path: '/workflows',
        config: {
          windowMs: 60 * 1000, // 1 minute
          maxRequests: 30, // 30 requests per minute
        },
        authenticatedConfig: {
          windowMs: 60 * 1000, // 1 minute
          maxRequests: 100, // Higher limit for authenticated users
        },
      },

      // Global fallback
      {
        path: '/',
        config: {
          windowMs: 60 * 1000, // 1 minute
          maxRequests: 300, // 300 requests per minute globally
        },
        authenticatedConfig: {
          windowMs: 60 * 1000, // 1 minute
          maxRequests: 600, // Higher limit for authenticated users
        },
      },
    ];
  }

  /**
   * Check if request should be rate limited
   */
  async checkRateLimit(request: FastifyRequest, reply: FastifyReply): Promise<boolean> {
    const rule = this.findMatchingRule(request);
    if (!rule) return true; // Allow if no rule matches

    // Check if user is authenticated for different limits
    const sessionId = getSessionService().getSessionIdFromRequest(request);
    let isAuthenticated = false;
    let userRole = 'anonymous';

    if (sessionId) {
      const validation = await getSessionService().validateSession(request, sessionId);
      if (validation.valid && validation.session) {
        isAuthenticated = true;
        userRole = validation.session.role;
      }
    }

    // Choose appropriate config based on authentication
    const config = (isAuthenticated && rule.authenticatedConfig)
      ? rule.authenticatedConfig
      : rule.config;

    // Generate rate limit key
    const key = this.generateKey(request, rule, config);

    // Check current usage
    const usage = await this.getCurrentUsage(key, config.windowMs);
    const isAllowed = usage.count < config.maxRequests;

    if (isAllowed) {
      // Increment counter
      await this.incrementCounter(key, config.windowMs);
    } else {
      // Rate limit exceeded
      logger.warn('Rate limit exceeded', {
        key: this.maskKey(key),
        path: request.url,
        method: request.method,
        ip: request.ip,
        userAgent: request.headers['user-agent'],
        isAuthenticated,
        userRole,
        usage: usage.count,
        limit: config.maxRequests,
        windowMs: config.windowMs,
      });

      // Set rate limit headers
      reply.header('X-RateLimit-Limit', config.maxRequests);
      reply.header('X-RateLimit-Remaining', Math.max(0, config.maxRequests - usage.count));
      reply.header('X-RateLimit-Reset', usage.resetTime);
      reply.header('Retry-After', Math.ceil((usage.resetTime - Date.now()) / 1000));

      // Custom handler or default response
      if (config.onLimitReached) {
        config.onLimitReached(request, reply);
      } else {
        reply.code(429).send({
          error: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many requests',
          retryAfter: Math.ceil((usage.resetTime - Date.now()) / 1000),
          limit: config.maxRequests,
          windowMs: config.windowMs,
        });
      }

      return false;
    }

    // Set success headers
    reply.header('X-RateLimit-Limit', config.maxRequests);
    reply.header('X-RateLimit-Remaining', Math.max(0, config.maxRequests - usage.count - 1));
    reply.header('X-RateLimit-Reset', usage.resetTime);

    return true;
  }

  /**
   * Add a custom rate limiting rule
   */
  addRule(rule: RateLimitRule): void {
    // Insert at the beginning so custom rules take precedence
    this.rules.unshift(rule);
    logger.info('Rate limiting rule added', {
      path: rule.path,
      method: rule.method,
      windowMs: rule.config.windowMs,
      maxRequests: rule.config.maxRequests,
    });
  }

  /**
   * Get rate limiting statistics
   */
  async getStats(): Promise<{ activeKeys: number; totalRequests: number }> {
    if (this.useRedis && this.redisClient) {
      try {
        const keys = await this.redisClient.keys('ratelimit:*');
        return {
          activeKeys: keys.length,
          totalRequests: keys.length, // Simplified
        };
      } catch (error) {
        logger.error('Failed to get Redis rate limit stats', { error });
        return { activeKeys: 0, totalRequests: 0 };
      }
    } else {
      return {
        activeKeys: this.memoryStore.size,
        totalRequests: Array.from(this.memoryStore.values()).reduce((sum, item) => sum + item.count, 0),
      };
    }
  }

  /**
   * Clear rate limits for a specific key or pattern
   */
  async clearRateLimit(keyOrPattern: string): Promise<boolean> {
    try {
      if (this.useRedis && this.redisClient) {
        if (keyOrPattern.includes('*')) {
          const keys = await this.redisClient.keys(`ratelimit:${keyOrPattern}`);
          if (keys.length > 0) {
            await this.redisClient.del(...keys);
          }
        } else {
          await this.redisClient.del(`ratelimit:${keyOrPattern}`);
        }
      } else {
        const keys = Array.from(this.memoryStore.keys());
        const pattern = keyOrPattern.replace(/\*/g, '.*');
        const regex = new RegExp(pattern);

        for (const key of keys) {
          if (regex.test(key)) {
            this.memoryStore.delete(key);
          }
        }
      }
      return true;
    } catch (error) {
      logger.error('Failed to clear rate limit', { keyOrPattern, error });
      return false;
    }
  }

  // Private helper methods

  private findMatchingRule(request: FastifyRequest): RateLimitRule | null {
    for (const rule of this.rules) {
      const pathMatches = request.url.startsWith(rule.path);
      const methodMatches = !rule.method || request.method === rule.method;

      if (pathMatches && methodMatches) {
        return rule;
      }
    }
    return null;
  }

  private generateKey(request: FastifyRequest, rule: RateLimitRule, config: RateLimitConfig): string {
    if (config.keyGenerator) {
      return config.keyGenerator(request);
    }

    // Default key generation
    const sessionId = getSessionService().getSessionIdFromRequest(request);
    const identifier = sessionId || request.ip;
    const method = rule.method || request.method;

    return `${identifier}:${rule.path}:${method}`;
  }

  private async getCurrentUsage(key: string, windowMs: number): Promise<{ count: number; resetTime: number }> {
    const now = Date.now();
    const windowStart = now - windowMs;
    const resetTime = now + windowMs;

    if (this.useRedis && this.redisClient) {
      try {
        const redisKey = `ratelimit:${key}`;
        const current = await this.redisClient.get(redisKey);

        if (current) {
          const data = JSON.parse(current);
          if (data.resetTime > now) {
            return { count: data.count, resetTime: data.resetTime };
          }
        }

        return { count: 0, resetTime };
      } catch (error) {
        logger.error('Redis rate limit check failed', { error });
        return { count: 0, resetTime };
      }
    } else {
      const stored = this.memoryStore.get(key);
      if (stored && stored.resetTime > now) {
        return { count: stored.count, resetTime: stored.resetTime };
      }
      return { count: 0, resetTime };
    }
  }

  private async incrementCounter(key: string, windowMs: number): Promise<void> {
    const now = Date.now();
    const resetTime = now + windowMs;

    if (this.useRedis && this.redisClient) {
      try {
        const redisKey = `ratelimit:${key}`;
        const current = await this.redisClient.get(redisKey);

        let count = 1;
        if (current) {
          const data = JSON.parse(current);
          if (data.resetTime > now) {
            count = data.count + 1;
          }
        }

        const data = { count, resetTime };
        await this.redisClient.setex(redisKey, Math.ceil(windowMs / 1000), JSON.stringify(data));
      } catch (error) {
        logger.error('Failed to increment Redis rate limit counter', { error });
      }
    } else {
      const stored = this.memoryStore.get(key);
      let count = 1;

      if (stored && stored.resetTime > now) {
        count = stored.count + 1;
      }

      this.memoryStore.set(key, { count, resetTime });
    }
  }

  private maskKey(key: string): string {
    // Mask sensitive parts of the key for logging
    const parts = key.split(':');
    if (parts.length > 0) {
      const identifier = parts[0];
      if (identifier.length > 8) {
        parts[0] = `${identifier.substring(0, 4)}...${identifier.substring(identifier.length - 4)}`;
      }
    }
    return parts.join(':');
  }
}

// Singleton instance
let rateLimitingServiceInstance: RateLimitingService | null = null;

export function getRateLimitingService(): RateLimitingService {
  if (!rateLimitingServiceInstance) {
    rateLimitingServiceInstance = new RateLimitingService();
  }
  return rateLimitingServiceInstance;
}

export default RateLimitingService;