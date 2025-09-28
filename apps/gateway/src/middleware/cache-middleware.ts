import { FastifyRequest, FastifyReply, HookHandlerDoneFunction } from 'fastify';
import { createHash } from 'crypto';
import CacheManager, { CacheOptions } from '../services/CacheManager.js';
import CacheAnalytics from '../services/CacheAnalytics.js';
import logger from '../lib/logger.js';
import redisManager from '../lib/redis.js';

export interface CacheMiddlewareConfig {
  enabled: boolean;
  defaultTtl: number;
  maxSize: number;
  ignoreHeaders: string[];
  bypassHeader: string;
  etagEnabled: boolean;
  conditionalRequestsEnabled: boolean;
  compressionEnabled: boolean;
  debugMode: boolean;
}

export interface CachedResponse {
  data: any;
  headers: Record<string, string>;
  statusCode: number;
  etag?: string;
  lastModified?: string;
  cacheControl?: string;
}

interface RequestContext {
  startTime: number;
  cacheKey?: string;
  cacheable?: boolean;
  bypassCache?: boolean;
  userContext?: {
    userId: string;
    role: string;
  };
}

export class CacheMiddleware {
  private cacheManager: CacheManager;
  private analytics: CacheAnalytics;
  private config: CacheMiddlewareConfig;

  constructor(config: Partial<CacheMiddlewareConfig> = {}) {
    this.cacheManager = new CacheManager();
    this.analytics = new CacheAnalytics();

    this.config = {
      enabled: true,
      defaultTtl: 300, // 5 minutes
      maxSize: 1024 * 1024, // 1MB
      ignoreHeaders: ['authorization', 'cookie', 'set-cookie', 'x-request-id'],
      bypassHeader: 'x-cache-bypass',
      etagEnabled: true,
      conditionalRequestsEnabled: true,
      compressionEnabled: true,
      debugMode: process.env.NODE_ENV === 'development',
      ...config
    };
  }

  /**
   * Create response caching middleware for Fastify
   */
  middleware() {
    return async (request: FastifyRequest, reply: FastifyReply, done: HookHandlerDoneFunction) => {
      try {
        // Skip if caching is disabled
        if (!this.config.enabled || !redisManager.isHealthy()) {
          return done();
        }

        // Initialize request context
        const context: RequestContext = {
          startTime: Date.now()
        };

        // Check for cache bypass
        if (this.shouldBypassCache(request)) {
          context.bypassCache = true;
          if (this.config.debugMode) {
            reply.header('X-Cache-Status', 'BYPASS');
          }
          return done();
        }

        // Extract user context if available
        context.userContext = this.extractUserContext(request);

        // Generate cache key
        context.cacheKey = this.cacheManager.generateCacheKey(
          request.method,
          request.url,
          request.headers as Record<string, string>,
          context.userContext
        );

        // Handle conditional requests (If-None-Match, If-Modified-Since)
        if (this.config.conditionalRequestsEnabled && this.handleConditionalRequest(request, reply)) {
          return; // 304 Not Modified sent
        }

        // Try to serve from cache for GET requests
        if (request.method === 'GET') {
          const cached = await this.cacheManager.get(context.cacheKey);

          if (cached) {
            await this.serveFromCache(request, reply, cached, context);
            return;
          }
        }

        // Set up response interception for cacheable requests
        if (this.isCacheableMethod(request.method)) {
          this.setupResponseInterception(request, reply, context);
        }

        done();
      } catch (error: any) {
        logger.error({ error, url: request.url }, 'Cache middleware error');
        done();
      }
    };
  }

  /**
   * Check if cache should be bypassed
   */
  private shouldBypassCache(request: FastifyRequest): boolean {
    // Check bypass header
    if (request.headers[this.config.bypassHeader]) {
      return true;
    }

    // Bypass for non-cacheable methods
    if (!this.isCacheableMethod(request.method)) {
      return true;
    }

    // Bypass if Cache-Control: no-cache present
    const cacheControl = request.headers['cache-control'];
    if (cacheControl && cacheControl.includes('no-cache')) {
      return true;
    }

    return false;
  }

  /**
   * Check if method is cacheable
   */
  private isCacheableMethod(method: string): boolean {
    return ['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase());
  }

  /**
   * Extract user context from request
   */
  private extractUserContext(request: FastifyRequest): { userId: string; role: string } | undefined {
    try {
      // Try to get user from JWT or other auth mechanism
      const user = (request as any).user;
      if (user && user.userId) {
        return {
          userId: user.userId,
          role: user.role || 'USER'
        };
      }
    } catch {
      // Ignore extraction errors
    }
    return undefined;
  }

  /**
   * Handle conditional requests (304 Not Modified)
   */
  private handleConditionalRequest(request: FastifyRequest, reply: FastifyReply): boolean {
    const ifNoneMatch = request.headers['if-none-match'];
    const ifModifiedSince = request.headers['if-modified-since'];

    // This would be enhanced with actual ETag comparison
    // For now, return false to proceed with normal request handling
    if (ifNoneMatch || ifModifiedSince) {
      // TODO: Implement proper conditional request handling
      return false;
    }

    return false;
  }

  /**
   * Serve response from cache
   */
  private async serveFromCache(
    request: FastifyRequest,
    reply: FastifyReply,
    cached: any,
    context: RequestContext
  ): Promise<void> {
    const responseTime = Date.now() - context.startTime;

    try {
      // Set cached headers (exclude ignored headers)
      Object.entries(cached.headers).forEach(([key, value]) => {
        if (!this.config.ignoreHeaders.includes(key.toLowerCase())) {
          reply.header(key, value);
        }
      });

      // Set cache-specific headers
      reply.header('X-Cache-Status', 'HIT');
      reply.header('X-Cache-Age', Math.floor((Date.now() - cached.timestamp) / 1000).toString());

      if (cached.etag && this.config.etagEnabled) {
        reply.header('ETag', cached.etag);
      }

      if (cached.lastModified) {
        reply.header('Last-Modified', cached.lastModified);
      }

      if (this.config.debugMode) {
        reply.header('X-Cache-Key', this.hashForDebug(context.cacheKey!));
        reply.header('X-Cache-TTL', cached.ttl.toString());
      }

      // Send cached response
      reply.status(cached.statusCode).send(cached.data);

      // Record analytics
      await this.analytics.recordAccess(
        request.url,
        request.method,
        true, // cache hit
        responseTime
      );

      logger.debug({
        url: request.url,
        method: request.method,
        responseTime,
        cacheAge: Math.floor((Date.now() - cached.timestamp) / 1000)
      }, 'Cache hit');

    } catch (error: any) {
      logger.error({ error, url: request.url }, 'Failed to serve from cache');

      // Remove corrupted cache entry and continue with normal request
      await this.cacheManager.del(context.cacheKey!);

      // Set up response interception for the request
      this.setupResponseInterception(request, reply, context);
    }
  }

  /**
   * Set up response interception to cache the response
   */
  private setupResponseInterception(
    request: FastifyRequest,
    reply: FastifyReply,
    context: RequestContext
  ): void {
    const originalSend = reply.send.bind(reply);

    reply.send = function(payload: any) {
      // Capture response details before sending
      const statusCode = reply.statusCode;
      const headers = reply.getHeaders();
      const responseTime = Date.now() - context.startTime;

      // Set cache miss header
      reply.header('X-Cache-Status', 'MISS');

      if (this.config.debugMode && context.cacheKey) {
        reply.header('X-Cache-Key', this.hashForDebug(context.cacheKey));
      }

      // Send the response first
      const result = originalSend(payload);

      // Then cache it asynchronously (fire and forget)
      this.cacheResponseAsync(
        request,
        context,
        payload,
        headers as Record<string, string>,
        statusCode,
        responseTime
      ).catch(error => {
        logger.error({ error, url: request.url }, 'Failed to cache response');
      });

      return result;
    }.bind(this);
  }

  /**
   * Cache response asynchronously
   */
  private async cacheResponseAsync(
    request: FastifyRequest,
    context: RequestContext,
    payload: any,
    headers: Record<string, string>,
    statusCode: number,
    responseTime: number
  ): Promise<void> {
    try {
      if (!context.cacheKey || context.bypassCache) {
        await this.analytics.recordAccess(request.url, request.method, false, responseTime);
        return;
      }

      const contentType = headers['content-type'] || 'application/octet-stream';
      const size = this.calculateResponseSize(payload);

      // Check if response is cacheable
      const userRole = context.userContext?.role;
      const cacheable = this.cacheManager.isCacheable(
        request.method,
        request.url,
        statusCode,
        contentType,
        size,
        userRole
      );

      if (!cacheable) {
        await this.analytics.recordAccess(request.url, request.method, false, responseTime);
        return;
      }

      // Prepare cache options
      const cacheOptions: CacheOptions = {
        ttl: this.extractTtlFromHeaders(headers) || this.config.defaultTtl
      };

      // Cache the response
      const success = await this.cacheManager.set(
        context.cacheKey,
        payload,
        headers,
        statusCode,
        cacheOptions
      );

      // Record analytics
      await this.analytics.recordAccess(
        request.url,
        request.method,
        false, // cache miss (we're storing it now)
        responseTime,
        size
      );

      if (success) {
        logger.debug({
          url: request.url,
          method: request.method,
          statusCode,
          size,
          ttl: cacheOptions.ttl,
          responseTime
        }, 'Response cached');
      }

    } catch (error: any) {
      logger.error({ error, url: request.url }, 'Failed to cache response');

      // Still record analytics for the miss
      await this.analytics.recordAccess(request.url, request.method, false, responseTime);
    }
  }

  /**
   * Calculate response size in bytes
   */
  private calculateResponseSize(payload: any): number {
    if (typeof payload === 'string') {
      return Buffer.byteLength(payload, 'utf8');
    } else if (Buffer.isBuffer(payload)) {
      return payload.length;
    } else if (typeof payload === 'object') {
      return Buffer.byteLength(JSON.stringify(payload), 'utf8');
    } else {
      return Buffer.byteLength(String(payload), 'utf8');
    }
  }

  /**
   * Extract TTL from response headers
   */
  private extractTtlFromHeaders(headers: Record<string, string>): number | null {
    const cacheControl = headers['cache-control'];
    if (cacheControl) {
      const maxAgeMatch = cacheControl.match(/max-age=(\d+)/);
      if (maxAgeMatch) {
        return parseInt(maxAgeMatch[1]);
      }

      if (cacheControl.includes('no-cache') || cacheControl.includes('no-store')) {
        return 0; // Don't cache
      }
    }

    const expires = headers['expires'];
    if (expires) {
      const expiresDate = new Date(expires);
      const now = new Date();
      const ttl = Math.floor((expiresDate.getTime() - now.getTime()) / 1000);
      return ttl > 0 ? ttl : 0;
    }

    return null;
  }

  /**
   * Hash key for debug purposes (shortened)
   */
  private hashForDebug(key: string): string {
    return createHash('md5').update(key).digest('hex').substring(0, 8);
  }

  /**
   * Create endpoint-specific middleware with custom options
   */
  createEndpointMiddleware(options: CacheOptions) {
    return async (request: FastifyRequest, reply: FastifyReply, done: HookHandlerDoneFunction) => {
      // Store custom options in request context for use by main middleware
      (request as any).cacheOptions = options;
      return this.middleware()(request, reply, done);
    };
  }

  /**
   * Get cache statistics
   */
  async getStats() {
    return {
      cache: await this.cacheManager.getStats(),
      analytics: await this.analytics.getPerformanceReport(),
      health: await this.analytics.getHealthCheck()
    };
  }

  /**
   * Get cache health status
   */
  async getHealth() {
    return this.analytics.getHealthCheck();
  }

  /**
   * Invalidate cache by tags
   */
  async invalidateByTags(tags: string[]) {
    return this.cacheManager.invalidateByTags(tags);
  }

  /**
   * Invalidate cache by pattern
   */
  async invalidateByPattern(pattern: string): Promise<number> {
    try {
      // This is a simplified implementation
      // In production, you might want more sophisticated pattern matching
      const keys = await redisManager.getClient().keys(`cache:response:*`);
      let deleted = 0;

      for (const key of keys) {
        // Simple pattern matching - can be enhanced
        if (pattern === '*' || key.includes(pattern)) {
          const success = await this.cacheManager.del(key);
          if (success) deleted++;
        }
      }

      logger.info({ pattern, deleted }, 'Cache invalidated by pattern');
      return deleted;
    } catch (error: any) {
      logger.error({ error, pattern }, 'Failed to invalidate cache by pattern');
      return 0;
    }
  }

  /**
   * Clear all cache
   */
  async clearAll() {
    return this.cacheManager.clear();
  }

  /**
   * Warm cache for specific endpoints
   */
  async warmCache(endpoints: Array<{ method: string; url: string; headers?: Record<string, string> }>) {
    return this.cacheManager.warmCache(endpoints);
  }

  /**
   * Update middleware configuration
   */
  updateConfig(newConfig: Partial<CacheMiddlewareConfig>) {
    this.config = { ...this.config, ...newConfig };
    logger.info({ config: this.config }, 'Cache middleware configuration updated');
  }

  /**
   * Get current configuration
   */
  getConfig(): CacheMiddlewareConfig {
    return { ...this.config };
  }

  /**
   * Add cache policy
   */
  addPolicy(policy: any) {
    this.cacheManager.addPolicy(policy);
  }

  /**
   * Remove cache policy
   */
  removePolicy(policyId: string) {
    return this.cacheManager.removePolicy(policyId);
  }

  /**
   * Get all cache policies
   */
  getPolicies() {
    return this.cacheManager.getPolicies();
  }
}

export default CacheMiddleware;