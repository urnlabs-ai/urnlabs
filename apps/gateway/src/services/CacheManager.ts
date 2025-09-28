import Redis from 'ioredis';
import { createHash } from 'crypto';
import logger from '../lib/logger.js';
import redisManager from '../lib/redis.js';
import { getCachePoliciesForEnvironment } from '../config/cache-policies.js';

export interface CacheEntry {
  data: any;
  headers: Record<string, string>;
  statusCode: number;
  contentType: string;
  timestamp: number;
  ttl: number;
  size: number;
  etag?: string;
  lastModified?: string;
  tags?: string[];
}

export interface CacheOptions {
  ttl?: number;
  tags?: string[];
  varyHeaders?: string[];
  conditions?: {
    methods?: string[];
    statusCodes?: number[];
    contentTypes?: string[];
    maxSize?: number;
    userRoles?: string[];
  };
}

export interface CacheStats {
  hits: number;
  misses: number;
  hitRate: number;
  totalRequests: number;
  totalSize: number;
  entriesCount: number;
  avgResponseTime: number;
  memoryUsage: {
    used: number;
    percentage: number;
  };
}

export interface CachePolicy {
  id: string;
  name: string;
  pattern: string;
  ttl: number;
  enabled: boolean;
  conditions: CacheOptions['conditions'];
  varyHeaders: string[];
  tags: string[];
  priority: number;
}

export class CacheManager {
  private redis: Redis;
  private readonly keyPrefix: string = 'cache:response:';
  private readonly metaKeyPrefix: string = 'cache:meta:';
  private readonly tagKeyPrefix: string = 'cache:tag:';
  private readonly statsKey: string = 'cache:stats';
  private policies: Map<string, CachePolicy> = new Map();

  constructor() {
    this.redis = redisManager.getClient();
    this.initializeDefaultPolicies();
  }

  private initializeDefaultPolicies(): void {
    const env = process.env.NODE_ENV || 'development';
    const defaultPolicies = getCachePoliciesForEnvironment(env);

    defaultPolicies.forEach(policy => {
      this.policies.set(policy.id, policy);
    });

    logger.info({
      environment: env,
      policiesLoaded: defaultPolicies.length
    }, 'Cache policies initialized');
  }

  /**
   * Generate cache key based on request parameters
   */
  generateCacheKey(
    method: string,
    url: string,
    headers: Record<string, string> = {},
    userContext?: { userId?: string; role?: string }
  ): string {
    const policy = this.findMatchingPolicy(url);
    const varyHeaders = policy?.varyHeaders || [];

    const keyComponents: string[] = [method, url];

    // Add vary headers to key
    for (const header of varyHeaders) {
      const value = headers[header.toLowerCase()];
      if (value) {
        keyComponents.push(`${header}:${value}`);
      }
    }

    // Add user context if available
    if (userContext?.userId) {
      keyComponents.push(`user:${userContext.userId}`);
    }

    if (userContext?.role) {
      keyComponents.push(`role:${userContext.role}`);
    }

    const keyString = keyComponents.join('|');
    const hash = createHash('sha256').update(keyString).digest('hex');

    return `${this.keyPrefix}${hash}`;
  }

  /**
   * Find matching cache policy for a URL
   */
  private findMatchingPolicy(url: string): CachePolicy | null {
    const sortedPolicies = Array.from(this.policies.values())
      .filter(policy => policy.enabled)
      .sort((a, b) => b.priority - a.priority);

    for (const policy of sortedPolicies) {
      if (this.matchesPattern(url, policy.pattern)) {
        return policy;
      }
    }

    return null;
  }

  /**
   * Check if URL matches pattern (simple glob-style matching)
   */
  private matchesPattern(url: string, pattern: string): boolean {
    const regex = new RegExp(
      pattern
        .replace(/\*/g, '.*')
        .replace(/\?/g, '.')
    );
    return regex.test(url);
  }

  /**
   * Check if request is cacheable based on policy
   */
  isCacheable(
    method: string,
    url: string,
    statusCode: number,
    contentType: string,
    size: number,
    userRole?: string
  ): boolean {
    const policy = this.findMatchingPolicy(url);
    if (!policy || !policy.enabled) {
      return false;
    }

    const conditions = policy.conditions;
    if (!conditions) {
      return true;
    }

    // Check method
    if (conditions.methods && !conditions.methods.includes(method)) {
      return false;
    }

    // Check status code
    if (conditions.statusCodes && !conditions.statusCodes.includes(statusCode)) {
      return false;
    }

    // Check content type
    if (conditions.contentTypes) {
      const matches = conditions.contentTypes.some(ct => {
        if (ct.endsWith('/*')) {
          const prefix = ct.slice(0, -2);
          return contentType.startsWith(prefix);
        }
        return contentType === ct;
      });
      if (!matches) {
        return false;
      }
    }

    // Check size
    if (conditions.maxSize && size > conditions.maxSize) {
      return false;
    }

    // Check user role
    if (conditions.userRoles && userRole && !conditions.userRoles.includes(userRole)) {
      return false;
    }

    return true;
  }

  /**
   * Store response in cache
   */
  async set(
    key: string,
    data: any,
    headers: Record<string, string>,
    statusCode: number,
    options: CacheOptions = {}
  ): Promise<boolean> {
    try {
      const contentType = headers['content-type'] || 'application/octet-stream';
      const size = Buffer.byteLength(JSON.stringify(data));

      // Check if cacheable
      const url = this.extractUrlFromKey(key);
      if (!this.isCacheable('GET', url, statusCode, contentType, size)) {
        return false;
      }

      const policy = this.findMatchingPolicy(url);
      const ttl = options.ttl || policy?.ttl || 300;
      const tags = options.tags || policy?.tags || [];

      const entry: CacheEntry = {
        data,
        headers,
        statusCode,
        contentType,
        timestamp: Date.now(),
        ttl,
        size,
        etag: this.generateETag(data),
        lastModified: new Date().toISOString(),
        tags
      };

      const pipeline = this.redis.pipeline();

      // Store the cache entry
      pipeline.setex(key, ttl, JSON.stringify(entry));

      // Store metadata
      const metaKey = `${this.metaKeyPrefix}${key.replace(this.keyPrefix, '')}`;
      pipeline.setex(metaKey, ttl, JSON.stringify({
        url,
        size,
        timestamp: entry.timestamp,
        ttl,
        tags
      }));

      // Add to tag sets for invalidation
      for (const tag of tags) {
        const tagKey = `${this.tagKeyPrefix}${tag}`;
        pipeline.sadd(tagKey, key);
        pipeline.expire(tagKey, ttl + 300); // Tag expires slightly later
      }

      await pipeline.exec();

      // Update stats
      await this.updateStats('set', size);

      logger.debug({ key, size, ttl, tags }, 'Response cached successfully');
      return true;
    } catch (error: any) {
      logger.error({ error, key }, 'Failed to cache response');
      return false;
    }
  }

  /**
   * Retrieve response from cache
   */
  async get(key: string): Promise<CacheEntry | null> {
    try {
      const result = await this.redis.get(key);
      if (!result) {
        await this.updateStats('miss');
        return null;
      }

      const entry: CacheEntry = JSON.parse(result);

      // Check if entry is still valid
      const age = Date.now() - entry.timestamp;
      if (age > entry.ttl * 1000) {
        await this.del(key);
        await this.updateStats('miss');
        return null;
      }

      await this.updateStats('hit');
      logger.debug({ key, age }, 'Cache hit');
      return entry;
    } catch (error: any) {
      logger.error({ error, key }, 'Failed to retrieve from cache');
      await this.updateStats('miss');
      return null;
    }
  }

  /**
   * Delete cache entry
   */
  async del(key: string): Promise<boolean> {
    try {
      const pipeline = this.redis.pipeline();

      // Get metadata to clean up tags
      const metaKey = `${this.metaKeyPrefix}${key.replace(this.keyPrefix, '')}`;
      const metaResult = await this.redis.get(metaKey);

      if (metaResult) {
        const meta = JSON.parse(metaResult);
        // Remove from tag sets
        for (const tag of meta.tags || []) {
          const tagKey = `${this.tagKeyPrefix}${tag}`;
          pipeline.srem(tagKey, key);
        }
        pipeline.del(metaKey);
      }

      pipeline.del(key);
      await pipeline.exec();

      logger.debug({ key }, 'Cache entry deleted');
      return true;
    } catch (error: any) {
      logger.error({ error, key }, 'Failed to delete cache entry');
      return false;
    }
  }

  /**
   * Invalidate cache by tags
   */
  async invalidateByTags(tags: string[]): Promise<number> {
    try {
      let totalDeleted = 0;

      for (const tag of tags) {
        const tagKey = `${this.tagKeyPrefix}${tag}`;
        const keys = await this.redis.smembers(tagKey);

        if (keys.length > 0) {
          const pipeline = this.redis.pipeline();

          for (const key of keys) {
            pipeline.del(key);
            // Also delete metadata
            const metaKey = `${this.metaKeyPrefix}${key.replace(this.keyPrefix, '')}`;
            pipeline.del(metaKey);
          }

          // Delete the tag set
          pipeline.del(tagKey);

          await pipeline.exec();
          totalDeleted += keys.length;
        }
      }

      logger.info({ tags, deleted: totalDeleted }, 'Cache invalidated by tags');
      return totalDeleted;
    } catch (error: any) {
      logger.error({ error, tags }, 'Failed to invalidate cache by tags');
      return 0;
    }
  }

  /**
   * Clear all cache entries
   */
  async clear(): Promise<boolean> {
    try {
      const pattern = `${this.keyPrefix}*`;
      const keys = await this.redis.keys(pattern);

      if (keys.length > 0) {
        const pipeline = this.redis.pipeline();
        for (const key of keys) {
          pipeline.del(key);
          // Also delete metadata and tags
          const metaKey = `${this.metaKeyPrefix}${key.replace(this.keyPrefix, '')}`;
          pipeline.del(metaKey);
        }

        // Clear all tag sets
        const tagKeys = await this.redis.keys(`${this.tagKeyPrefix}*`);
        for (const tagKey of tagKeys) {
          pipeline.del(tagKey);
        }

        await pipeline.exec();
      }

      // Reset stats
      await this.redis.del(this.statsKey);

      logger.info({ deletedKeys: keys.length }, 'Cache cleared');
      return true;
    } catch (error: any) {
      logger.error({ error }, 'Failed to clear cache');
      return false;
    }
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<CacheStats> {
    try {
      const stats = await this.redis.hgetall(this.statsKey);
      const hits = parseInt(stats.hits || '0');
      const misses = parseInt(stats.misses || '0');
      const totalRequests = hits + misses;
      const hitRate = totalRequests > 0 ? (hits / totalRequests) * 100 : 0;

      // Get memory usage info
      const info = await this.redis.info('memory');
      const memoryLines = info.split('\r\n');
      let usedMemory = 0;
      let maxMemory = 0;

      for (const line of memoryLines) {
        if (line.startsWith('used_memory:')) {
          usedMemory = parseInt(line.split(':')[1]);
        }
        if (line.startsWith('maxmemory:')) {
          maxMemory = parseInt(line.split(':')[1]);
        }
      }

      // Count cache entries
      const cacheKeys = await this.redis.keys(`${this.keyPrefix}*`);
      const entriesCount = cacheKeys.length;

      // Estimate total cache size
      let totalSize = 0;
      const metaKeys = await this.redis.keys(`${this.metaKeyPrefix}*`);

      if (metaKeys.length > 0) {
        const pipeline = this.redis.pipeline();
        for (const metaKey of metaKeys) {
          pipeline.get(metaKey);
        }
        const results = await pipeline.exec();

        for (const result of results || []) {
          if (result && result[1]) {
            try {
              const meta = JSON.parse(result[1] as string);
              totalSize += meta.size || 0;
            } catch {
              // Ignore parsing errors
            }
          }
        }
      }

      return {
        hits,
        misses,
        hitRate: Math.round(hitRate * 100) / 100,
        totalRequests,
        totalSize,
        entriesCount,
        avgResponseTime: parseFloat(stats.avgResponseTime || '0'),
        memoryUsage: {
          used: usedMemory,
          percentage: maxMemory > 0 ? Math.round((usedMemory / maxMemory) * 100) : 0
        }
      };
    } catch (error: any) {
      logger.error({ error }, 'Failed to get cache stats');
      return {
        hits: 0,
        misses: 0,
        hitRate: 0,
        totalRequests: 0,
        totalSize: 0,
        entriesCount: 0,
        avgResponseTime: 0,
        memoryUsage: { used: 0, percentage: 0 }
      };
    }
  }

  /**
   * Update cache statistics
   */
  private async updateStats(type: 'hit' | 'miss' | 'set', size?: number): Promise<void> {
    try {
      const pipeline = this.redis.pipeline();

      if (type === 'hit') {
        pipeline.hincrby(this.statsKey, 'hits', 1);
      } else if (type === 'miss') {
        pipeline.hincrby(this.statsKey, 'misses', 1);
      } else if (type === 'set' && size) {
        pipeline.hincrby(this.statsKey, 'totalSize', size);
      }

      pipeline.expire(this.statsKey, 86400); // Stats expire after 24 hours
      await pipeline.exec();
    } catch (error: any) {
      logger.error({ error, type }, 'Failed to update cache stats');
    }
  }

  /**
   * Generate ETag for response data
   */
  private generateETag(data: any): string {
    const content = typeof data === 'string' ? data : JSON.stringify(data);
    return createHash('md5').update(content).digest('hex');
  }

  /**
   * Extract URL from cache key (best effort)
   */
  private extractUrlFromKey(key: string): string {
    // This is a simplified extraction - in practice, you might want to store URL separately
    return key.replace(this.keyPrefix, '').split('|')[1] || '/';
  }

  /**
   * Warm cache for popular endpoints
   */
  async warmCache(endpoints: Array<{ method: string; url: string; headers?: Record<string, string> }>): Promise<void> {
    logger.info({ count: endpoints.length }, 'Starting cache warming');

    for (const endpoint of endpoints) {
      try {
        const key = this.generateCacheKey(endpoint.method, endpoint.url, endpoint.headers);
        const exists = await this.redis.exists(key);

        if (!exists) {
          // In a real implementation, you would make the actual request here
          // For now, we'll just log the warming intent
          logger.debug({ endpoint }, 'Cache warming needed for endpoint');
        }
      } catch (error: any) {
        logger.error({ error, endpoint }, 'Failed to warm cache for endpoint');
      }
    }
  }

  /**
   * Add or update cache policy
   */
  addPolicy(policy: CachePolicy): void {
    this.policies.set(policy.id, policy);
    logger.info({ policyId: policy.id, pattern: policy.pattern }, 'Cache policy added');
  }

  /**
   * Remove cache policy
   */
  removePolicy(policyId: string): boolean {
    const removed = this.policies.delete(policyId);
    if (removed) {
      logger.info({ policyId }, 'Cache policy removed');
    }
    return removed;
  }

  /**
   * Get all cache policies
   */
  getPolicies(): CachePolicy[] {
    return Array.from(this.policies.values());
  }

  /**
   * Get cache policy by ID
   */
  getPolicy(policyId: string): CachePolicy | undefined {
    return this.policies.get(policyId);
  }
}

export default CacheManager;