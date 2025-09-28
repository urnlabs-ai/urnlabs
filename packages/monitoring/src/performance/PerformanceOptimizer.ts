import Redis from 'ioredis';
import { performance } from 'perf_hooks';

interface CacheConfig {
  ttl: number;
  maxSize: number;
  strategy: 'lru' | 'fifo' | 'lfu';
}

interface CompressionConfig {
  enabled: boolean;
  threshold: number; // bytes
  level: number; // 1-9
}

interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  skipSuccessfulRequests: boolean;
}

interface PerformanceMetrics {
  responseTime: number;
  cacheHitRate: number;
  compressionRatio: number;
  throughput: number;
  errorRate: number;
  memoryUsage: number;
}

export class PerformanceOptimizer {
  private redis: Redis;
  private cache = new Map<string, { data: any; timestamp: number; accessCount: number }>();
  private responseTimeHistory: number[] = [];
  private requestCount = 0;
  private errorCount = 0;
  private cacheHits = 0;
  private cacheMisses = 0;

  constructor(
    private redisUrl: string,
    private cacheConfig: CacheConfig = {
      ttl: 300000, // 5 minutes
      maxSize: 1000,
      strategy: 'lru'
    },
    private compressionConfig: CompressionConfig = {
      enabled: true,
      threshold: 1024, // 1KB
      level: 6
    },
    private rateLimitConfig: RateLimitConfig = {
      windowMs: 60000, // 1 minute
      maxRequests: 1000,
      skipSuccessfulRequests: false
    }
  ) {
    this.redis = new Redis(redisUrl, {
      retryDelayOnFailover: 100,
      enableReadyCheck: false,
      maxRetriesPerRequest: null,
      lazyConnect: true
    });

    // Initialize cache cleanup
    this.initializeCacheCleanup();
  }

  private initializeCacheCleanup(): void {
    // Clean cache every 5 minutes
    setInterval(() => {
      this.cleanupCache();
    }, 300000);

    // Reset metrics every hour
    setInterval(() => {
      this.resetMetrics();
    }, 3600000);
  }

  public async optimizeResponse<T>(
    key: string,
    dataFetcher: () => Promise<T>,
    options: {
      cacheTtl?: number;
      enableCompression?: boolean;
      skipCache?: boolean;
    } = {}
  ): Promise<{ data: T; metrics: { cached: boolean; responseTime: number; compressed: boolean } }> {
    const startTime = performance.now();
    this.requestCount++;

    try {
      // Check cache first (unless skipped)
      if (!options.skipCache) {
        const cachedResult = await this.getFromCache<T>(key);
        if (cachedResult) {
          this.cacheHits++;
          const responseTime = performance.now() - startTime;
          this.responseTimeHistory.push(responseTime);

          return {
            data: cachedResult,
            metrics: {
              cached: true,
              responseTime,
              compressed: false
            }
          };
        }
        this.cacheMisses++;
      }

      // Fetch fresh data
      const data = await dataFetcher();
      const responseTime = performance.now() - startTime;
      this.responseTimeHistory.push(responseTime);

      // Cache the result
      if (!options.skipCache) {
        await this.setCache(key, data, options.cacheTtl || this.cacheConfig.ttl);
      }

      // Apply compression if needed
      const compressed = this.shouldCompress(data);

      return {
        data,
        metrics: {
          cached: false,
          responseTime,
          compressed
        }
      };
    } catch (error) {
      this.errorCount++;
      const responseTime = performance.now() - startTime;
      this.responseTimeHistory.push(responseTime);
      throw error;
    }
  }

  private async getFromCache<T>(key: string): Promise<T | null> {
    try {
      // Try memory cache first
      const memoryResult = this.cache.get(key);
      if (memoryResult && Date.now() - memoryResult.timestamp < this.cacheConfig.ttl) {
        memoryResult.accessCount++;
        return memoryResult.data as T;
      }

      // Try Redis cache
      const redisResult = await this.redis.get(key);
      if (redisResult) {
        const parsed = JSON.parse(redisResult);

        // Update memory cache
        this.cache.set(key, {
          data: parsed,
          timestamp: Date.now(),
          accessCount: 1
        });

        return parsed as T;
      }

      return null;
    } catch (error) {
      console.error('Cache get error:', error);
      return null;
    }
  }

  private async setCache<T>(key: string, data: T, ttl: number): Promise<void> {
    try {
      // Set in memory cache
      this.cache.set(key, {
        data,
        timestamp: Date.now(),
        accessCount: 1
      });

      // Ensure cache size limits
      if (this.cache.size > this.cacheConfig.maxSize) {
        this.evictFromCache();
      }

      // Set in Redis with TTL
      await this.redis.setex(key, Math.floor(ttl / 1000), JSON.stringify(data));
    } catch (error) {
      console.error('Cache set error:', error);
    }
  }

  private evictFromCache(): void {
    const entries = Array.from(this.cache.entries());

    switch (this.cacheConfig.strategy) {
      case 'lru':
        // Remove least recently used (oldest timestamp)
        entries.sort(([, a], [, b]) => a.timestamp - b.timestamp);
        break;
      case 'lfu':
        // Remove least frequently used (lowest access count)
        entries.sort(([, a], [, b]) => a.accessCount - b.accessCount);
        break;
      case 'fifo':
      default:
        // First in, first out (already in insertion order)
        break;
    }

    // Remove 10% of cache entries
    const toRemove = Math.ceil(entries.length * 0.1);
    for (let i = 0; i < toRemove; i++) {
      this.cache.delete(entries[i][0]);
    }
  }

  private cleanupCache(): void {
    const now = Date.now();
    for (const [key, value] of this.cache.entries()) {
      if (now - value.timestamp > this.cacheConfig.ttl) {
        this.cache.delete(key);
      }
    }
  }

  private shouldCompress(data: any): boolean {
    if (!this.compressionConfig.enabled) return false;

    const jsonString = JSON.stringify(data);
    return jsonString.length > this.compressionConfig.threshold;
  }

  public async checkRateLimit(identifier: string): Promise<{
    allowed: boolean;
    remaining: number;
    resetTime: number;
  }> {
    const key = `rate_limit:${identifier}`;
    const window = Math.floor(Date.now() / this.rateLimitConfig.windowMs);
    const windowKey = `${key}:${window}`;

    try {
      const current = await this.redis.incr(windowKey);

      if (current === 1) {
        await this.redis.expire(windowKey, Math.ceil(this.rateLimitConfig.windowMs / 1000));
      }

      const allowed = current <= this.rateLimitConfig.maxRequests;
      const remaining = Math.max(0, this.rateLimitConfig.maxRequests - current);
      const resetTime = (window + 1) * this.rateLimitConfig.windowMs;

      return { allowed, remaining, resetTime };
    } catch (error) {
      console.error('Rate limit check error:', error);
      // Fail open - allow request if Redis is down
      return {
        allowed: true,
        remaining: this.rateLimitConfig.maxRequests,
        resetTime: Date.now() + this.rateLimitConfig.windowMs
      };
    }
  }

  public getPerformanceMetrics(): PerformanceMetrics {
    const recentResponseTimes = this.responseTimeHistory.slice(-100);
    const avgResponseTime = recentResponseTimes.length > 0
      ? recentResponseTimes.reduce((sum, time) => sum + time, 0) / recentResponseTimes.length
      : 0;

    const totalCacheRequests = this.cacheHits + this.cacheMisses;
    const cacheHitRate = totalCacheRequests > 0 ? (this.cacheHits / totalCacheRequests) * 100 : 0;

    const errorRate = this.requestCount > 0 ? (this.errorCount / this.requestCount) * 100 : 0;

    const throughput = this.requestCount / (Date.now() / 1000); // requests per second approximation

    const memoryUsage = process.memoryUsage().heapUsed / 1024 / 1024; // MB

    return {
      responseTime: avgResponseTime,
      cacheHitRate,
      compressionRatio: 0, // Would need compression library integration
      throughput,
      errorRate,
      memoryUsage
    };
  }

  public async getDetailedMetrics(): Promise<{
    performance: PerformanceMetrics;
    cache: {
      memorySize: number;
      redisConnected: boolean;
      hitRate: number;
    };
    rateLimit: {
      windowMs: number;
      maxRequests: number;
    };
    responseTimePercentiles: {
      p50: number;
      p90: number;
      p95: number;
      p99: number;
    };
  }> {
    const performance = this.getPerformanceMetrics();

    // Calculate percentiles
    const sortedTimes = [...this.responseTimeHistory].sort((a, b) => a - b);
    const percentiles = {
      p50: this.getPercentile(sortedTimes, 50),
      p90: this.getPercentile(sortedTimes, 90),
      p95: this.getPercentile(sortedTimes, 95),
      p99: this.getPercentile(sortedTimes, 99)
    };

    const totalCacheRequests = this.cacheHits + this.cacheMisses;
    const hitRate = totalCacheRequests > 0 ? (this.cacheHits / totalCacheRequests) * 100 : 0;

    return {
      performance,
      cache: {
        memorySize: this.cache.size,
        redisConnected: this.redis.status === 'ready',
        hitRate
      },
      rateLimit: {
        windowMs: this.rateLimitConfig.windowMs,
        maxRequests: this.rateLimitConfig.maxRequests
      },
      responseTimePercentiles: percentiles
    };
  }

  private getPercentile(sortedArray: number[], percentile: number): number {
    if (sortedArray.length === 0) return 0;
    const index = Math.ceil((percentile / 100) * sortedArray.length) - 1;
    return sortedArray[Math.max(0, Math.min(index, sortedArray.length - 1))];
  }

  private resetMetrics(): void {
    // Keep some history but reset counters
    this.responseTimeHistory = this.responseTimeHistory.slice(-1000);
    this.requestCount = Math.floor(this.requestCount * 0.1); // Keep 10% for trending
    this.errorCount = Math.floor(this.errorCount * 0.1);
    this.cacheHits = Math.floor(this.cacheHits * 0.1);
    this.cacheMisses = Math.floor(this.cacheMisses * 0.1);
  }

  public async invalidateCache(pattern?: string): Promise<number> {
    let deletedCount = 0;

    try {
      if (pattern) {
        // Redis pattern matching
        const keys = await this.redis.keys(pattern);
        if (keys.length > 0) {
          deletedCount += await this.redis.del(...keys);
        }

        // Memory cache pattern matching
        for (const key of this.cache.keys()) {
          if (this.matchPattern(key, pattern)) {
            this.cache.delete(key);
            deletedCount++;
          }
        }
      } else {
        // Clear all caches
        await this.redis.flushdb();
        this.cache.clear();
        deletedCount = -1; // Indicate full flush
      }

      return deletedCount;
    } catch (error) {
      console.error('Cache invalidation error:', error);
      return 0;
    }
  }

  private matchPattern(str: string, pattern: string): boolean {
    // Simple pattern matching with * wildcard
    const regexPattern = pattern.replace(/\*/g, '.*');
    return new RegExp(`^${regexPattern}$`).test(str);
  }

  public destroy(): void {
    this.redis.disconnect();
    this.cache.clear();
  }
}