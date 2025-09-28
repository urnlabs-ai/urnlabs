import { FastifyRequest } from 'fastify';
import logger from './logger.js';
import { redisManager } from './redis.js';

export interface RateLimitPolicy {
  id: string;
  name: string;
  algorithm: 'sliding-window' | 'token-bucket' | 'fixed-window';
  windowSize: number; // in seconds
  maxRequests: number;
  keyGenerator: 'ip' | 'user' | 'endpoint' | 'composite';
  skipOnError?: boolean;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
  headers?: boolean;
  message?: string;
  statusCode?: number;
  onLimitReached?: (request: FastifyRequest, key: string) => void;
}

export interface RateLimitConfig {
  global: RateLimitPolicy;
  perUser: RateLimitPolicy;
  perEndpoint: RateLimitPolicy;
  perIp: RateLimitPolicy;
  bypass: BypassConfig;
}

export interface BypassConfig {
  adminUsers: string[];
  monitoringIps: string[];
  internalServices: string[];
  bypassHeader?: string;
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetTime: number;
  retryAfter?: number;
  headers: Record<string, string>;
  key: string;
  algorithm: string;
}

export interface RateLimitStatus {
  current: number;
  limit: number;
  windowStart: number;
  windowEnd: number;
  tokens?: number; // for token bucket
}

export class AdvancedRateLimiter {
  private config: RateLimitConfig;
  private keyPrefix = 'rate_limit:';

  constructor(config: RateLimitConfig) {
    this.config = config;
  }

  /**
   * Main rate limiting check method
   */
  async checkRateLimit(request: FastifyRequest, policyIds?: string[]): Promise<RateLimitResult> {
    // Check for bypass conditions first
    if (await this.shouldBypass(request)) {
      return this.createBypassResult();
    }

    // Determine which policies to apply
    const policiesToCheck = policyIds
      ? policyIds.map(id => this.getPolicyById(id)).filter(p => p) as RateLimitPolicy[]
      : [this.config.global, this.config.perUser, this.config.perEndpoint, this.config.perIp];

    // Check each policy - fail fast on first violation
    for (const policy of policiesToCheck) {
      const result = await this.checkPolicy(request, policy);
      if (!result.allowed) {
        logger.warn({
          policy: policy.id,
          key: result.key,
          remaining: result.remaining,
          limit: result.limit,
          ip: request.ip,
          url: request.url
        }, 'Rate limit exceeded');

        return result;
      }
    }

    // All policies passed - return success result from most restrictive policy
    const mostRestrictive = policiesToCheck.reduce((prev, current) =>
      prev.maxRequests < current.maxRequests ? prev : current
    );

    return await this.checkPolicy(request, mostRestrictive);
  }

  /**
   * Check individual rate limit policy
   */
  private async checkPolicy(request: FastifyRequest, policy: RateLimitPolicy): Promise<RateLimitResult> {
    const key = this.generateKey(request, policy);

    switch (policy.algorithm) {
      case 'sliding-window':
        return await this.checkSlidingWindow(key, policy);

      case 'token-bucket':
        return await this.checkTokenBucket(key, policy);

      case 'fixed-window':
        return await this.checkFixedWindow(key, policy);

      default:
        throw new Error(`Unknown rate limiting algorithm: ${policy.algorithm}`);
    }
  }

  /**
   * Sliding window rate limiting implementation
   */
  private async checkSlidingWindow(key: string, policy: RateLimitPolicy): Promise<RateLimitResult> {
    const now = Date.now();
    const windowStart = now - (policy.windowSize * 1000);
    const redisKey = `${this.keyPrefix}sliding:${key}`;

    try {
      // Use Redis pipeline for atomic operations
      const multi = redisManager.getClient().multi();

      // Remove expired entries
      multi.zremrangebyscore(redisKey, 0, windowStart);

      // Count current requests in window
      multi.zcard(redisKey);

      // Add current request
      multi.zadd(redisKey, now, `${now}-${Math.random()}`);

      // Set expiration
      multi.expire(redisKey, policy.windowSize);

      const results = await multi.exec();
      const currentCount = results?.[1]?.[1] as number || 0;

      const allowed = currentCount < policy.maxRequests;
      const remaining = Math.max(0, policy.maxRequests - currentCount - 1);
      const resetTime = now + (policy.windowSize * 1000);

      return this.createResult(allowed, policy, remaining, resetTime, key);

    } catch (error) {
      logger.error({ error, key, policy: policy.id }, 'Sliding window rate limit check failed');
      return this.createErrorResult(policy, key);
    }
  }

  /**
   * Token bucket rate limiting implementation
   */
  private async checkTokenBucket(key: string, policy: RateLimitPolicy): Promise<RateLimitResult> {
    const now = Date.now();
    const redisKey = `${this.keyPrefix}bucket:${key}`;

    try {
      // Lua script for atomic token bucket operations
      const luaScript = `
        local key = KEYS[1]
        local capacity = tonumber(ARGV[1])
        local refill_rate = tonumber(ARGV[2])
        local window_size = tonumber(ARGV[3])
        local now = tonumber(ARGV[4])

        local bucket = redis.call('HMGET', key, 'tokens', 'last_refill')
        local tokens = tonumber(bucket[1]) or capacity
        local last_refill = tonumber(bucket[2]) or now

        -- Calculate tokens to add based on time elapsed
        local time_elapsed = (now - last_refill) / 1000
        local tokens_to_add = math.floor(time_elapsed * refill_rate)
        tokens = math.min(capacity, tokens + tokens_to_add)

        local allowed = 0
        if tokens > 0 then
          tokens = tokens - 1
          allowed = 1
        end

        -- Update bucket state
        redis.call('HMSET', key, 'tokens', tokens, 'last_refill', now)
        redis.call('EXPIRE', key, window_size)

        return {allowed, tokens}
      `;

      const refillRate = policy.maxRequests / policy.windowSize; // tokens per second
      const result = await redisManager.getClient().eval(
        luaScript,
        1,
        redisKey,
        policy.maxRequests.toString(),
        refillRate.toString(),
        policy.windowSize.toString(),
        now.toString()
      ) as [number, number];

      const [allowed, tokens] = result;
      const remaining = tokens;
      const resetTime = now + (policy.windowSize * 1000);

      return this.createResult(allowed === 1, policy, remaining, resetTime, key);

    } catch (error) {
      logger.error({ error, key, policy: policy.id }, 'Token bucket rate limit check failed');
      return this.createErrorResult(policy, key);
    }
  }

  /**
   * Fixed window rate limiting implementation
   */
  private async checkFixedWindow(key: string, policy: RateLimitPolicy): Promise<RateLimitResult> {
    const now = Date.now();
    const windowStart = Math.floor(now / (policy.windowSize * 1000)) * policy.windowSize * 1000;
    const windowEnd = windowStart + (policy.windowSize * 1000);
    const redisKey = `${this.keyPrefix}fixed:${key}:${windowStart}`;

    try {
      const currentCount = await redisManager.getClient().incr(redisKey);

      if (currentCount === 1) {
        // First request in this window - set expiration
        await redisManager.getClient().expire(redisKey, policy.windowSize);
      }

      const allowed = currentCount <= policy.maxRequests;
      const remaining = Math.max(0, policy.maxRequests - currentCount);
      const resetTime = windowEnd;

      return this.createResult(allowed, policy, remaining, resetTime, key);

    } catch (error) {
      logger.error({ error, key, policy: policy.id }, 'Fixed window rate limit check failed');
      return this.createErrorResult(policy, key);
    }
  }

  /**
   * Generate rate limiting key based on policy
   */
  private generateKey(request: FastifyRequest, policy: RateLimitPolicy): string {
    const parts: string[] = [policy.id];

    switch (policy.keyGenerator) {
      case 'ip':
        parts.push(request.ip);
        break;

      case 'user':
        const userId = (request as any).user?.userId || 'anonymous';
        parts.push(userId);
        break;

      case 'endpoint':
        parts.push(`${request.method}:${request.routerPath || request.url}`);
        break;

      case 'composite':
        const userIdComposite = (request as any).user?.userId || 'anonymous';
        parts.push(request.ip, userIdComposite, `${request.method}:${request.routerPath || request.url}`);
        break;

      default:
        parts.push(request.ip);
    }

    return parts.join(':');
  }

  /**
   * Check if request should bypass rate limiting
   */
  private async shouldBypass(request: FastifyRequest): Promise<boolean> {
    const { bypass } = this.config;

    // Check bypass header
    if (bypass.bypassHeader && request.headers[bypass.bypassHeader]) {
      return true;
    }

    // Check admin users
    const userId = (request as any).user?.userId;
    if (userId && bypass.adminUsers.includes(userId)) {
      return true;
    }

    // Check monitoring IPs
    if (bypass.monitoringIps.includes(request.ip)) {
      return true;
    }

    // Check internal services
    const userAgent = request.headers['user-agent'] || '';
    if (bypass.internalServices.some(service => userAgent.includes(service))) {
      return true;
    }

    return false;
  }

  /**
   * Get policy by ID
   */
  private getPolicyById(id: string): RateLimitPolicy | null {
    const policies = [
      this.config.global,
      this.config.perUser,
      this.config.perEndpoint,
      this.config.perIp
    ];

    return policies.find(p => p.id === id) || null;
  }

  /**
   * Create rate limit result
   */
  private createResult(
    allowed: boolean,
    policy: RateLimitPolicy,
    remaining: number,
    resetTime: number,
    key: string
  ): RateLimitResult {
    const headers: Record<string, string> = {};

    if (policy.headers !== false) {
      headers['X-RateLimit-Limit'] = policy.maxRequests.toString();
      headers['X-RateLimit-Remaining'] = remaining.toString();
      headers['X-RateLimit-Reset'] = Math.ceil(resetTime / 1000).toString();
      headers['X-RateLimit-Policy'] = policy.id;

      if (!allowed) {
        headers['Retry-After'] = Math.ceil((resetTime - Date.now()) / 1000).toString();
      }
    }

    return {
      allowed,
      limit: policy.maxRequests,
      remaining,
      resetTime,
      retryAfter: allowed ? undefined : Math.ceil((resetTime - Date.now()) / 1000),
      headers,
      key,
      algorithm: policy.algorithm
    };
  }

  /**
   * Create bypass result
   */
  private createBypassResult(): RateLimitResult {
    return {
      allowed: true,
      limit: Infinity,
      remaining: Infinity,
      resetTime: Date.now() + 3600000, // 1 hour from now
      headers: {
        'X-RateLimit-Bypass': 'true'
      },
      key: 'bypass',
      algorithm: 'bypass'
    };
  }

  /**
   * Create error fallback result
   */
  private createErrorResult(policy: RateLimitPolicy, key: string): RateLimitResult {
    // On error, allow request by default (fail open)
    return {
      allowed: !policy.skipOnError,
      limit: policy.maxRequests,
      remaining: policy.skipOnError ? 0 : policy.maxRequests,
      resetTime: Date.now() + (policy.windowSize * 1000),
      headers: {
        'X-RateLimit-Error': 'true'
      },
      key,
      algorithm: policy.algorithm
    };
  }

  /**
   * Get current rate limit status for a key
   */
  async getStatus(request: FastifyRequest, policyId: string): Promise<RateLimitStatus | null> {
    const policy = this.getPolicyById(policyId);
    if (!policy) return null;

    const key = this.generateKey(request, policy);
    const redisKey = `${this.keyPrefix}${policy.algorithm}:${key}`;

    try {
      switch (policy.algorithm) {
        case 'sliding-window': {
          const now = Date.now();
          const windowStart = now - (policy.windowSize * 1000);
          await redisManager.getClient().zremrangebyscore(redisKey, 0, windowStart);
          const current = await redisManager.getClient().zcard(redisKey);

          return {
            current,
            limit: policy.maxRequests,
            windowStart,
            windowEnd: now + (policy.windowSize * 1000)
          };
        }

        case 'token-bucket': {
          const bucket = await redisManager.getClient().hmget(redisKey, 'tokens', 'last_refill');
          const tokens = parseInt(bucket[0] || '0');

          return {
            current: policy.maxRequests - tokens,
            limit: policy.maxRequests,
            windowStart: Date.now(),
            windowEnd: Date.now() + (policy.windowSize * 1000),
            tokens
          };
        }

        case 'fixed-window': {
          const now = Date.now();
          const windowStart = Math.floor(now / (policy.windowSize * 1000)) * policy.windowSize * 1000;
          const windowKey = `${redisKey}:${windowStart}`;
          const current = await redisManager.getClient().get(windowKey);

          return {
            current: parseInt(current || '0'),
            limit: policy.maxRequests,
            windowStart,
            windowEnd: windowStart + (policy.windowSize * 1000)
          };
        }

        default:
          return null;
      }
    } catch (error) {
      logger.error({ error, key, policy: policyId }, 'Failed to get rate limit status');
      return null;
    }
  }

  /**
   * Reset rate limit for a specific key
   */
  async resetLimit(key: string, policyId: string): Promise<boolean> {
    const policy = this.getPolicyById(policyId);
    if (!policy) return false;

    try {
      const redisKey = `${this.keyPrefix}${policy.algorithm}:${key}`;
      await redisManager.getClient().del(redisKey);

      logger.info({ key, policyId }, 'Rate limit reset');
      return true;
    } catch (error) {
      logger.error({ error, key, policyId }, 'Failed to reset rate limit');
      return false;
    }
  }

  /**
   * Get rate limiting statistics
   */
  async getStats(): Promise<any> {
    const patterns = [
      `${this.keyPrefix}sliding:*`,
      `${this.keyPrefix}bucket:*`,
      `${this.keyPrefix}fixed:*`
    ];

    const stats: any = {
      policies: {
        global: this.config.global,
        perUser: this.config.perUser,
        perEndpoint: this.config.perEndpoint,
        perIp: this.config.perIp
      },
      activeKeys: {},
      timestamp: new Date().toISOString()
    };

    try {
      for (const pattern of patterns) {
        const keys = await redisManager.getClient().keys(pattern);
        const algorithm = pattern.split(':')[1];
        stats.activeKeys[algorithm] = keys.length;
      }
    } catch (error) {
      logger.error({ error }, 'Failed to get rate limiting stats');
    }

    return stats;
  }
}

export default AdvancedRateLimiter;