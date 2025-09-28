import { EventEmitter } from 'events';
import Redis from 'ioredis';
import { logger } from '../core/Logger.js';
import { PatternAnalyzer, WorkflowPattern, CachePattern } from './PatternAnalyzer.js';

export interface CacheConfig {
  redis: {
    host: string;
    port: number;
    password?: string;
    db?: number;
    keyPrefix?: string;
  };
  policies: {
    defaultTTL: number;
    maxCacheSize: number;
    evictionPolicy: 'lru' | 'lfu' | 'ttl' | 'intelligent';
    compressionEnabled: boolean;
    compressionThreshold: number;
  };
  performance: {
    maxMemoryUsage: number;
    targetHitRatio: number;
    prefetchEnabled: boolean;
    warmupOnStart: boolean;
  };
  analytics: {
    metricsEnabled: boolean;
    metricsRetention: number;
    alertThresholds: {
      hitRatio: number;
      memoryUsage: number;
      latency: number;
    };
  };
}

export interface CacheEntry {
  key: string;
  value: any;
  metadata: {
    size: number;
    createdAt: number;
    lastAccessed: number;
    accessCount: number;
    ttl: number;
    tags: string[];
    dependencies: string[];
    pattern?: string;
    compressed: boolean;
  };
}

export interface CacheMetrics {
  hits: number;
  misses: number;
  hitRatio: number;
  totalRequests: number;
  avgLatency: number;
  memoryUsage: number;
  evictions: number;
  compressionRatio: number;
  patternHits: Map<string, number>;
  timestamp: number;
}

export interface CacheOperation {
  type: 'get' | 'set' | 'delete' | 'invalidate' | 'warm' | 'evict';
  key: string;
  value?: any;
  options?: {
    ttl?: number;
    tags?: string[];
    dependencies?: string[];
    pattern?: string;
    priority?: 'low' | 'medium' | 'high' | 'critical';
  };
  startTime: number;
  endTime?: number;
  success: boolean;
  error?: string;
  metadata?: Record<string, any>;
}

export class IntelligentCacheManager extends EventEmitter {
  private redis: Redis;
  private patternAnalyzer: PatternAnalyzer;
  private config: CacheConfig;
  private metrics: CacheMetrics;
  private operations: CacheOperation[] = [];
  private warmupQueue: Set<string> = new Set();
  private prefetchQueue: Set<string> = new Set();
  private isWarming = false;
  private isPrefetching = false;

  private readonly DEFAULT_CONFIG: CacheConfig = {
    redis: {
      host: 'localhost',
      port: 6379,
      db: 0,
      keyPrefix: 'intelligent-cache:'
    },
    policies: {
      defaultTTL: 3600, // 1 hour
      maxCacheSize: 1024 * 1024 * 1024, // 1GB
      evictionPolicy: 'intelligent',
      compressionEnabled: true,
      compressionThreshold: 1024 // 1KB
    },
    performance: {
      maxMemoryUsage: 0.8, // 80% of available memory
      targetHitRatio: 0.85,
      prefetchEnabled: true,
      warmupOnStart: true
    },
    analytics: {
      metricsEnabled: true,
      metricsRetention: 7 * 24 * 60 * 60 * 1000, // 7 days
      alertThresholds: {
        hitRatio: 0.7,
        memoryUsage: 0.9,
        latency: 100 // ms
      }
    }
  };

  constructor(
    redisClient?: Redis,
    patternAnalyzer?: PatternAnalyzer,
    config?: Partial<CacheConfig>
  ) {
    super();

    this.config = this.mergeConfig(config);
    this.redis = redisClient || this.createRedisClient();
    this.patternAnalyzer = patternAnalyzer || new PatternAnalyzer();

    this.metrics = {
      hits: 0,
      misses: 0,
      hitRatio: 0,
      totalRequests: 0,
      avgLatency: 0,
      memoryUsage: 0,
      evictions: 0,
      compressionRatio: 0,
      patternHits: new Map(),
      timestamp: Date.now()
    };

    this.initialize();
  }

  private createRedisClient(): Redis {
    const client = new Redis({
      host: this.config.redis.host,
      port: this.config.redis.port,
      password: this.config.redis.password,
      db: this.config.redis.db,
      keyPrefix: this.config.redis.keyPrefix,
      enableReadyCheck: true,
      maxRetriesPerRequest: 3,
      lazyConnect: true
    });

    client.on('connect', () => {
      logger.info('Intelligent cache Redis connection established');
    });

    client.on('error', (error) => {
      logger.error('Intelligent cache Redis connection error', { error });
      this.emit('redis-error', error);
    });

    return client;
  }

  private mergeConfig(userConfig?: Partial<CacheConfig>): CacheConfig {
    return {
      redis: { ...this.DEFAULT_CONFIG.redis, ...userConfig?.redis },
      policies: { ...this.DEFAULT_CONFIG.policies, ...userConfig?.policies },
      performance: { ...this.DEFAULT_CONFIG.performance, ...userConfig?.performance },
      analytics: { ...this.DEFAULT_CONFIG.analytics, ...userConfig?.analytics }
    };
  }

  private async initialize(): Promise<void> {
    try {
      await this.redis.connect();

      // Set up Redis memory policies
      await this.configureRedisMemoryPolicy();

      // Load existing patterns
      this.patternAnalyzer.on('patternsAnalyzed', this.onPatternsAnalyzed.bind(this));

      // Start performance monitoring
      this.startPerformanceMonitoring();

      // Warm up cache if enabled
      if (this.config.performance.warmupOnStart) {
        await this.warmupCache();
      }

      logger.info('Intelligent cache manager initialized', {
        config: this.config,
        redis: {
          host: this.config.redis.host,
          port: this.config.redis.port,
          db: this.config.redis.db
        }
      });

    } catch (error) {
      logger.error('Failed to initialize intelligent cache manager', { error });
      throw error;
    }
  }

  private async configureRedisMemoryPolicy(): Promise<void> {
    try {
      // Configure Redis eviction policy based on our intelligent strategy
      if (this.config.policies.evictionPolicy === 'intelligent') {
        await this.redis.config('SET', 'maxmemory-policy', 'allkeys-lru');
      } else {
        await this.redis.config('SET', 'maxmemory-policy', `allkeys-${this.config.policies.evictionPolicy}`);
      }

      // Set memory limit
      const maxMemory = Math.floor(this.config.policies.maxCacheSize);
      await this.redis.config('SET', 'maxmemory', maxMemory.toString());

      logger.info('Redis memory policy configured', {
        policy: this.config.policies.evictionPolicy,
        maxMemory: maxMemory
      });

    } catch (error) {
      logger.error('Failed to configure Redis memory policy', { error });
    }
  }

  private onPatternsAnalyzed(event: { workflowId: string; patterns: WorkflowPattern[] }): void {
    logger.info('Processing new workflow patterns for cache optimization', {
      workflowId: event.workflowId,
      patternCount: event.patterns.length
    });

    // Generate cache warming suggestions based on patterns
    event.patterns.forEach(pattern => {
      if (pattern.confidence > 0.7) {
        this.schedulePatternBasedWarming(pattern);
      }
    });

    // Update prefetch strategies
    this.updatePrefetchStrategies(event.patterns);
  }

  private async schedulePatternBasedWarming(pattern: WorkflowPattern): Promise<void> {
    try {
      // Add to warmup queue based on pattern predictions
      if (pattern.predictions.nextExecution) {
        const timeUntilExecution = pattern.predictions.nextExecution - Date.now();
        const warmupTime = Math.max(0, timeUntilExecution - (5 * 60 * 1000)); // 5 minutes before

        setTimeout(() => {
          this.warmupPatternCache(pattern);
        }, warmupTime);

        logger.debug('Scheduled pattern-based cache warming', {
          pattern: pattern.id,
          warmupTime: new Date(Date.now() + warmupTime).toISOString()
        });
      }

      // Add to immediate warmup if high confidence and recent activity
      if (pattern.confidence > 0.8 && pattern.usage.recentExecutions > 0) {
        this.warmupQueue.add(`pattern:${pattern.id}`);
      }

    } catch (error) {
      logger.error('Failed to schedule pattern-based warming', { error, pattern: pattern.id });
    }
  }

  private updatePrefetchStrategies(patterns: WorkflowPattern[]): void {
    // Update prefetch queue based on pattern analysis
    patterns.forEach(pattern => {
      if (pattern.confidence > 0.6 && pattern.frequency > 0.1) {
        pattern.pattern.cacheableSteps.forEach(step => {
          this.prefetchQueue.add(`step:${pattern.workflowId}:${step}`);
        });
      }
    });

    // Trigger prefetch process if enabled
    if (this.config.performance.prefetchEnabled && !this.isPrefetching) {
      this.processPrefetchQueue();
    }
  }

  // Core cache operations with intelligence
  public async get(key: string, options?: {
    pattern?: string;
    tags?: string[];
    updateAccess?: boolean;
  }): Promise<any> {
    const operation: CacheOperation = {
      type: 'get',
      key,
      startTime: Date.now(),
      success: false
    };

    try {
      // Record access for pattern learning
      if (options?.pattern) {
        this.recordPatternAccess(options.pattern, key);
      }

      // Get from Redis
      const rawValue = await this.redis.get(key);

      if (rawValue) {
        const entry: CacheEntry = JSON.parse(rawValue);

        // Update access metadata if enabled
        if (options?.updateAccess !== false) {
          entry.metadata.lastAccessed = Date.now();
          entry.metadata.accessCount++;
          await this.redis.set(key, JSON.stringify(entry), 'EX', entry.metadata.ttl);
        }

        // Decompress if needed
        const value = entry.metadata.compressed ?
          this.decompress(entry.value) : entry.value;

        // Record successful operation
        operation.endTime = Date.now();
        operation.success = true;
        operation.metadata = { compressed: entry.metadata.compressed, size: entry.metadata.size };

        this.recordMetrics('hit', operation);
        this.emit('cache-hit', { key, pattern: options?.pattern });

        return value;
      } else {
        // Cache miss
        operation.endTime = Date.now();
        operation.success = false;

        this.recordMetrics('miss', operation);
        this.emit('cache-miss', { key, pattern: options?.pattern });

        // Trigger intelligent prefetch if patterns suggest it
        this.triggerIntelligentPrefetch(key, options?.pattern);

        return null;
      }

    } catch (error) {
      operation.endTime = Date.now();
      operation.error = error instanceof Error ? error.message : String(error);
      operation.success = false;

      logger.error('Cache get operation failed', { error, key });
      this.recordMetrics('error', operation);

      return null;
    } finally {
      this.operations.push(operation);
    }
  }

  public async set(key: string, value: any, options?: {
    ttl?: number;
    tags?: string[];
    dependencies?: string[];
    pattern?: string;
    priority?: 'low' | 'medium' | 'high' | 'critical';
    force?: boolean;
  }): Promise<boolean> {
    const operation: CacheOperation = {
      type: 'set',
      key,
      value,
      options,
      startTime: Date.now(),
      success: false
    };

    try {
      // Calculate intelligent TTL if not provided
      const ttl = options?.ttl || this.calculateIntelligentTTL(key, options?.pattern);

      // Check if compression is beneficial
      const serializedValue = JSON.stringify(value);
      const shouldCompress = this.config.policies.compressionEnabled &&
        serializedValue.length > this.config.policies.compressionThreshold;

      // Create cache entry
      const entry: CacheEntry = {
        key,
        value: shouldCompress ? this.compress(value) : value,
        metadata: {
          size: serializedValue.length,
          createdAt: Date.now(),
          lastAccessed: Date.now(),
          accessCount: 1,
          ttl,
          tags: options?.tags || [],
          dependencies: options?.dependencies || [],
          pattern: options?.pattern,
          compressed: shouldCompress
        }
      };

      // Check memory constraints before setting
      if (!options?.force && !(await this.checkMemoryConstraints(entry.metadata.size))) {
        await this.performIntelligentEviction(entry.metadata.size);
      }

      // Set in Redis with TTL
      await this.redis.set(key, JSON.stringify(entry), 'EX', ttl);

      // Update indexes for intelligent operations
      await this.updateCacheIndexes(entry);

      // Record successful operation
      operation.endTime = Date.now();
      operation.success = true;
      operation.metadata = {
        ttl,
        compressed: shouldCompress,
        size: entry.metadata.size
      };

      this.recordMetrics('set', operation);
      this.emit('cache-set', { key, ttl, pattern: options?.pattern });

      logger.debug('Cache entry set with intelligent configuration', {
        key,
        ttl,
        compressed: shouldCompress,
        size: entry.metadata.size
      });

      return true;

    } catch (error) {
      operation.endTime = Date.now();
      operation.error = error instanceof Error ? error.message : String(error);
      operation.success = false;

      logger.error('Cache set operation failed', { error, key });
      this.recordMetrics('error', operation);

      return false;
    } finally {
      this.operations.push(operation);
    }
  }

  private calculateIntelligentTTL(key: string, pattern?: string): number {
    try {
      if (pattern) {
        const cachePatterns = this.patternAnalyzer.getCachePatterns().filter(p =>
          p.key.includes(pattern) || p.id.includes(pattern)
        );

        if (cachePatterns.length > 0) {
          const avgTTL = cachePatterns.reduce((sum, p) => sum + p.accessPattern.ttl, 0) / cachePatterns.length;
          return Math.floor(avgTTL);
        }
      }

      // Fallback to default with some intelligence based on key characteristics
      let multiplier = 1;

      // Longer TTL for database queries
      if (key.includes('db:') || key.includes('query:')) {
        multiplier = 2;
      }

      // Shorter TTL for user-specific data
      if (key.includes('user:') || key.includes('session:')) {
        multiplier = 0.5;
      }

      // Longer TTL for computational results
      if (key.includes('compute:') || key.includes('ml:')) {
        multiplier = 3;
      }

      return Math.floor(this.config.policies.defaultTTL * multiplier);

    } catch (error) {
      logger.error('Failed to calculate intelligent TTL', { error, key });
      return this.config.policies.defaultTTL;
    }
  }

  private async checkMemoryConstraints(size: number): Promise<boolean> {
    try {
      const memoryInfo = await this.redis.memory('usage');
      const currentUsage = memoryInfo / 1024 / 1024; // Convert to MB
      const maxAllowed = this.config.policies.maxCacheSize / 1024 / 1024;
      const usageRatio = currentUsage / maxAllowed;

      return usageRatio < this.config.performance.maxMemoryUsage;
    } catch (error) {
      logger.error('Failed to check memory constraints', { error });
      return true; // Assume OK if check fails
    }
  }

  private async performIntelligentEviction(requiredSpace: number): Promise<void> {
    try {
      logger.info('Performing intelligent cache eviction', { requiredSpace });

      if (this.config.policies.evictionPolicy === 'intelligent') {
        await this.performPatternBasedEviction(requiredSpace);
      } else {
        // Fall back to Redis built-in eviction
        await this.redis.memory('purge');
      }

      this.metrics.evictions++;
    } catch (error) {
      logger.error('Intelligent eviction failed', { error });
    }
  }

  private async performPatternBasedEviction(requiredSpace: number): Promise<void> {
    try {
      // Get all cache keys
      const keys = await this.redis.keys('*');
      const candidates: Array<{ key: string; score: number; size: number }> = [];

      // Score each key for eviction (lower score = higher eviction priority)
      for (const key of keys) {
        const rawEntry = await this.redis.get(key);
        if (rawEntry) {
          const entry: CacheEntry = JSON.parse(rawEntry);
          const score = this.calculateEvictionScore(entry);
          candidates.push({ key, score, size: entry.metadata.size });
        }
      }

      // Sort by eviction score (ascending - lowest score first)
      candidates.sort((a, b) => a.score - b.score);

      // Evict entries until we have enough space
      let freedSpace = 0;
      const evictedKeys: string[] = [];

      for (const candidate of candidates) {
        if (freedSpace >= requiredSpace) break;

        await this.redis.del(candidate.key);
        await this.removeFromIndexes(candidate.key);

        freedSpace += candidate.size;
        evictedKeys.push(candidate.key);
      }

      logger.info('Pattern-based eviction completed', {
        evictedKeys: evictedKeys.length,
        freedSpace,
        requiredSpace
      });

    } catch (error) {
      logger.error('Pattern-based eviction failed', { error });
    }
  }

  private calculateEvictionScore(entry: CacheEntry): number {
    const now = Date.now();

    // Factors for eviction scoring (lower score = higher eviction priority)
    const ageScore = (now - entry.metadata.lastAccessed) / (1000 * 60 * 60); // Hours since last access
    const frequencyScore = Math.max(1, entry.metadata.accessCount / 10); // Normalized access count
    const sizeScore = entry.metadata.size / (1024 * 1024); // Size in MB
    const ttlScore = Math.max(0, (entry.metadata.createdAt + entry.metadata.ttl * 1000 - now) / (1000 * 60 * 60)); // Hours until expiry

    // Pattern-based scoring
    let patternScore = 1;
    if (entry.metadata.pattern) {
      const patterns = this.patternAnalyzer.getCachePatterns().filter(p =>
        p.id.includes(entry.metadata.pattern!) || p.key.includes(entry.metadata.pattern!)
      );

      if (patterns.length > 0) {
        const avgHotness = patterns.reduce((sum, p) => sum + p.accessPattern.hotness, 0) / patterns.length;
        patternScore = 2 - avgHotness; // Higher hotness = lower eviction score
      }
    }

    // Final score (lower = more likely to be evicted)
    return (ageScore * sizeScore) / (frequencyScore * ttlScore * patternScore);
  }

  private async updateCacheIndexes(entry: CacheEntry): Promise<void> {
    try {
      // Update pattern index
      if (entry.metadata.pattern) {
        await this.redis.sadd(`index:pattern:${entry.metadata.pattern}`, entry.key);
      }

      // Update tag indexes
      for (const tag of entry.metadata.tags) {
        await this.redis.sadd(`index:tag:${tag}`, entry.key);
      }

      // Update dependency indexes
      for (const dep of entry.metadata.dependencies) {
        await this.redis.sadd(`index:dependency:${dep}`, entry.key);
      }

      // Update size index for monitoring
      await this.redis.zadd('index:size', entry.metadata.size, entry.key);

      // Update access frequency index
      await this.redis.zadd('index:frequency', entry.metadata.accessCount, entry.key);

    } catch (error) {
      logger.error('Failed to update cache indexes', { error, key: entry.key });
    }
  }

  private async removeFromIndexes(key: string): Promise<void> {
    try {
      // Remove from all indexes
      const indexKeys = await this.redis.keys('index:*');
      for (const indexKey of indexKeys) {
        if (indexKey.includes(':tag:') || indexKey.includes(':pattern:') || indexKey.includes(':dependency:')) {
          await this.redis.srem(indexKey, key);
        } else if (indexKey.includes(':size') || indexKey.includes(':frequency')) {
          await this.redis.zrem(indexKey, key);
        }
      }
    } catch (error) {
      logger.error('Failed to remove from indexes', { error, key });
    }
  }

  // Pattern-based cache warming
  private async warmupCache(): Promise<void> {
    if (this.isWarming) {
      logger.debug('Cache warming already in progress');
      return;
    }

    this.isWarming = true;

    try {
      logger.info('Starting intelligent cache warmup');

      const patterns = this.patternAnalyzer.getAllPatterns();

      // Warm up based on workflow patterns
      for (const pattern of patterns.workflow) {
        if (pattern.confidence > 0.7) {
          await this.warmupPatternCache(pattern);
        }
      }

      // Process warmup queue
      for (const queueItem of this.warmupQueue) {
        await this.processWarmupItem(queueItem);
      }

      this.warmupQueue.clear();

      logger.info('Cache warmup completed');
      this.emit('warmup-completed');

    } catch (error) {
      logger.error('Cache warmup failed', { error });
    } finally {
      this.isWarming = false;
    }
  }

  private async warmupPatternCache(pattern: WorkflowPattern): Promise<void> {
    try {
      // Generate cache keys that would be useful for this pattern
      const cacheKeys = this.generateWarmupKeys(pattern);

      for (const cacheKey of cacheKeys) {
        // Check if already cached
        const exists = await this.redis.exists(cacheKey);
        if (!exists) {
          // Simulate or compute likely cache values
          const value = await this.computeWarmupValue(pattern, cacheKey);
          if (value) {
            await this.set(cacheKey, value, {
              pattern: pattern.id,
              ttl: this.calculateIntelligentTTL(cacheKey, pattern.id),
              tags: ['warmup', pattern.workflowId]
            });
          }
        }
      }

      logger.debug('Pattern cache warmup completed', {
        pattern: pattern.id,
        keysWarmed: cacheKeys.length
      });

    } catch (error) {
      logger.error('Pattern cache warmup failed', { error, pattern: pattern.id });
    }
  }

  private generateWarmupKeys(pattern: WorkflowPattern): string[] {
    const keys: string[] = [];

    // Generate keys based on pattern characteristics
    const baseKey = `workflow:${pattern.workflowId}`;

    // Common result caches
    keys.push(`${baseKey}:result`);
    keys.push(`${baseKey}:metadata`);

    // Step-specific caches
    pattern.pattern.cacheableSteps.forEach(step => {
      keys.push(`${baseKey}:step:${step}`);
      keys.push(`${baseKey}:step:${step}:result`);
    });

    // Input-based caches for common input types
    pattern.pattern.inputTypes.forEach(inputType => {
      keys.push(`${baseKey}:input:${inputType}`);
    });

    return keys;
  }

  private async computeWarmupValue(pattern: WorkflowPattern, cacheKey: string): Promise<any> {
    // This is a placeholder for computing likely cache values
    // In a real implementation, this would:
    // 1. Analyze historical data to predict likely values
    // 2. Pre-compute common operations
    // 3. Generate synthetic but realistic data

    if (cacheKey.includes(':metadata')) {
      return {
        workflowId: pattern.workflowId,
        avgDuration: pattern.usage.avgExecutionTime,
        lastExecution: pattern.usage.lastExecuted,
        predictedNext: pattern.predictions.nextExecution
      };
    }

    if (cacheKey.includes(':result')) {
      return {
        status: 'success',
        timestamp: Date.now(),
        computedAt: Date.now(),
        source: 'warmup'
      };
    }

    return null; // Skip warming for this key
  }

  private async processWarmupItem(item: string): Promise<void> {
    try {
      // Process different types of warmup items
      if (item.startsWith('pattern:')) {
        const patternId = item.replace('pattern:', '');
        const patterns = this.patternAnalyzer.getAllPatterns().workflow;
        const pattern = patterns.find(p => p.id === patternId);
        if (pattern) {
          await this.warmupPatternCache(pattern);
        }
      }
      // Add more warmup item types as needed

    } catch (error) {
      logger.error('Failed to process warmup item', { error, item });
    }
  }

  // Intelligent prefetching
  private async processPrefetchQueue(): Promise<void> {
    if (this.isPrefetching) return;

    this.isPrefetching = true;

    try {
      for (const prefetchItem of this.prefetchQueue) {
        await this.processPrefetchItem(prefetchItem);
      }

      this.prefetchQueue.clear();

    } catch (error) {
      logger.error('Prefetch processing failed', { error });
    } finally {
      this.isPrefetching = false;
    }
  }

  private async processPrefetchItem(item: string): Promise<void> {
    try {
      // Process different types of prefetch items
      if (item.startsWith('step:')) {
        const [, workflowId, stepType] = item.split(':');
        await this.prefetchStepData(workflowId, stepType);
      }
      // Add more prefetch item types as needed

    } catch (error) {
      logger.error('Failed to process prefetch item', { error, item });
    }
  }

  private async prefetchStepData(workflowId: string, stepType: string): Promise<void> {
    try {
      const cacheKey = `workflow:${workflowId}:step:${stepType}:prefetch`;

      // Check if already exists
      const exists = await this.redis.exists(cacheKey);
      if (!exists) {
        // Generate prefetch data based on patterns
        const prefetchData = await this.generatePrefetchData(workflowId, stepType);
        if (prefetchData) {
          await this.set(cacheKey, prefetchData, {
            tags: ['prefetch', workflowId, stepType],
            ttl: 1800 // 30 minutes for prefetch data
          });

          logger.debug('Prefetch data generated', { workflowId, stepType });
        }
      }

    } catch (error) {
      logger.error('Step data prefetch failed', { error, workflowId, stepType });
    }
  }

  private async generatePrefetchData(workflowId: string, stepType: string): Promise<any> {
    // Placeholder for intelligent prefetch data generation
    // This would analyze patterns and predict likely data needs
    return {
      workflowId,
      stepType,
      prefetchedAt: Date.now(),
      predictions: {
        likelyInputs: [],
        expectedDuration: 1000,
        resourceRequirements: { cpu: 50, memory: 50 }
      }
    };
  }

  private triggerIntelligentPrefetch(key: string, pattern?: string): void {
    if (!this.config.performance.prefetchEnabled) return;

    try {
      // Analyze miss pattern and trigger related prefetches
      if (pattern) {
        const relatedPatterns = this.patternAnalyzer.getCachePatterns()
          .filter(p => p.id.includes(pattern) || p.key.includes(pattern));

        relatedPatterns.forEach(p => {
          // Add related cache keys to prefetch queue
          const relatedKey = this.generateRelatedKey(key, p);
          if (relatedKey) {
            this.prefetchQueue.add(relatedKey);
          }
        });

        // Process prefetch queue asynchronously
        setTimeout(() => this.processPrefetchQueue(), 100);
      }

    } catch (error) {
      logger.error('Intelligent prefetch trigger failed', { error, key, pattern });
    }
  }

  private generateRelatedKey(missedKey: string, cachePattern: CachePattern): string | null {
    // Generate related cache keys that might be needed soon
    const keyParts = missedKey.split(':');

    if (keyParts.length >= 2) {
      const baseKey = keyParts.slice(0, -1).join(':');
      return `${baseKey}:related:${cachePattern.type}`;
    }

    return null;
  }

  // Utility methods
  private compress(data: any): string {
    // Simple compression using gzip (in real implementation, use zlib)
    return Buffer.from(JSON.stringify(data)).toString('base64');
  }

  private decompress(compressedData: string): any {
    // Simple decompression
    return JSON.parse(Buffer.from(compressedData, 'base64').toString());
  }

  private recordPatternAccess(pattern: string, key: string): void {
    const currentCount = this.metrics.patternHits.get(pattern) || 0;
    this.metrics.patternHits.set(pattern, currentCount + 1);
  }

  private recordMetrics(type: 'hit' | 'miss' | 'set' | 'error', operation: CacheOperation): void {
    this.metrics.totalRequests++;

    if (type === 'hit') {
      this.metrics.hits++;
    } else if (type === 'miss') {
      this.metrics.misses++;
    }

    this.metrics.hitRatio = this.metrics.hits / (this.metrics.hits + this.metrics.misses) || 0;

    if (operation.endTime) {
      const latency = operation.endTime - operation.startTime;
      this.metrics.avgLatency = (this.metrics.avgLatency + latency) / 2;
    }

    this.metrics.timestamp = Date.now();

    // Check alert thresholds
    this.checkAlertThresholds();
  }

  private checkAlertThresholds(): void {
    const thresholds = this.config.analytics.alertThresholds;

    if (this.metrics.hitRatio < thresholds.hitRatio) {
      this.emit('alert', {
        type: 'low-hit-ratio',
        value: this.metrics.hitRatio,
        threshold: thresholds.hitRatio
      });
    }

    if (this.metrics.avgLatency > thresholds.latency) {
      this.emit('alert', {
        type: 'high-latency',
        value: this.metrics.avgLatency,
        threshold: thresholds.latency
      });
    }
  }

  private startPerformanceMonitoring(): void {
    setInterval(async () => {
      try {
        await this.updateMemoryMetrics();
        await this.cleanupExpiredMetrics();

        this.emit('metrics-updated', this.metrics);

      } catch (error) {
        logger.error('Performance monitoring update failed', { error });
      }
    }, 60000); // Every minute

    logger.info('Performance monitoring started');
  }

  private async updateMemoryMetrics(): Promise<void> {
    try {
      const memoryInfo = await this.redis.memory('usage');
      this.metrics.memoryUsage = memoryInfo / this.config.policies.maxCacheSize;

      // Calculate compression ratio
      const compressedEntries = await this.redis.eval(`
        local keys = redis.call('keys', '*')
        local compressed = 0
        local total = 0
        for i=1,#keys do
          local entry = redis.call('get', keys[i])
          if entry then
            local data = cjson.decode(entry)
            total = total + 1
            if data.metadata and data.metadata.compressed then
              compressed = compressed + 1
            end
          end
        end
        return {compressed, total}
      `, 0) as number[];

      if (compressedEntries[1] > 0) {
        this.metrics.compressionRatio = compressedEntries[0] / compressedEntries[1];
      }

    } catch (error) {
      logger.error('Memory metrics update failed', { error });
    }
  }

  private async cleanupExpiredMetrics(): Promise<void> {
    const cutoffTime = Date.now() - this.config.analytics.metricsRetention;
    this.operations = this.operations.filter(op => op.startTime > cutoffTime);
  }

  // Public API methods
  public async invalidateByPattern(pattern: string): Promise<number> {
    try {
      const keys = await this.redis.smembers(`index:pattern:${pattern}`);
      let invalidated = 0;

      for (const key of keys) {
        const success = await this.redis.del(key);
        if (success) {
          invalidated++;
          await this.removeFromIndexes(key);
        }
      }

      logger.info('Cache invalidation by pattern completed', {
        pattern,
        invalidated
      });

      this.emit('pattern-invalidated', { pattern, invalidated });

      return invalidated;

    } catch (error) {
      logger.error('Pattern invalidation failed', { error, pattern });
      return 0;
    }
  }

  public async invalidateByTags(tags: string[]): Promise<number> {
    try {
      let allKeys = new Set<string>();

      for (const tag of tags) {
        const keys = await this.redis.smembers(`index:tag:${tag}`);
        keys.forEach(key => allKeys.add(key));
      }

      let invalidated = 0;
      for (const key of allKeys) {
        const success = await this.redis.del(key);
        if (success) {
          invalidated++;
          await this.removeFromIndexes(key);
        }
      }

      logger.info('Cache invalidation by tags completed', {
        tags,
        invalidated
      });

      this.emit('tags-invalidated', { tags, invalidated });

      return invalidated;

    } catch (error) {
      logger.error('Tag invalidation failed', { error, tags });
      return 0;
    }
  }

  public async invalidateByDependency(dependency: string): Promise<number> {
    try {
      const keys = await this.redis.smembers(`index:dependency:${dependency}`);
      let invalidated = 0;

      for (const key of keys) {
        const success = await this.redis.del(key);
        if (success) {
          invalidated++;
          await this.removeFromIndexes(key);
        }
      }

      logger.info('Cache invalidation by dependency completed', {
        dependency,
        invalidated
      });

      this.emit('dependency-invalidated', { dependency, invalidated });

      return invalidated;

    } catch (error) {
      logger.error('Dependency invalidation failed', { error, dependency });
      return 0;
    }
  }

  public getMetrics(): CacheMetrics {
    return { ...this.metrics };
  }

  public getOperationHistory(): CacheOperation[] {
    return [...this.operations];
  }

  public async getTopKeys(limit: number = 10): Promise<Array<{ key: string; score: number }>> {
    try {
      const topByFrequency = await this.redis.zrevrange('index:frequency', 0, limit - 1, 'WITHSCORES');
      const results: Array<{ key: string; score: number }> = [];

      for (let i = 0; i < topByFrequency.length; i += 2) {
        results.push({
          key: topByFrequency[i],
          score: parseFloat(topByFrequency[i + 1])
        });
      }

      return results;

    } catch (error) {
      logger.error('Failed to get top keys', { error });
      return [];
    }
  }

  public async analyzeCacheEfficiency(): Promise<any> {
    try {
      const totalKeys = await this.redis.dbsize();
      const memoryUsage = await this.redis.memory('usage');
      const patterns = this.patternAnalyzer.getAllPatterns();

      return {
        overview: {
          totalKeys,
          memoryUsage,
          hitRatio: this.metrics.hitRatio,
          avgLatency: this.metrics.avgLatency,
          compressionRatio: this.metrics.compressionRatio
        },
        patterns: {
          workflowPatterns: patterns.workflow.length,
          cachePatterns: patterns.cache.length,
          patternHits: Object.fromEntries(this.metrics.patternHits)
        },
        recommendations: await this.generateOptimizationRecommendations(),
        timestamp: Date.now()
      };

    } catch (error) {
      logger.error('Cache efficiency analysis failed', { error });
      return null;
    }
  }

  private async generateOptimizationRecommendations(): Promise<string[]> {
    const recommendations: string[] = [];

    // Hit ratio recommendations
    if (this.metrics.hitRatio < 0.7) {
      recommendations.push('Consider increasing TTL values or improving cache warming strategies');
    }

    // Memory usage recommendations
    if (this.metrics.memoryUsage > 0.9) {
      recommendations.push('Memory usage is high - consider increasing max cache size or optimizing eviction policy');
    }

    // Compression recommendations
    if (this.metrics.compressionRatio < 0.3 && this.config.policies.compressionEnabled) {
      recommendations.push('Low compression ratio - consider adjusting compression threshold');
    }

    // Pattern-based recommendations
    const patterns = this.patternAnalyzer.getAllPatterns();
    if (patterns.workflow.length > 0 && patterns.cache.length === 0) {
      recommendations.push('Workflow patterns detected but no cache patterns generated - review pattern analysis');
    }

    return recommendations;
  }

  public async destroy(): Promise<void> {
    try {
      this.patternAnalyzer.removeAllListeners();
      await this.redis.quit();
      this.removeAllListeners();

      logger.info('Intelligent cache manager destroyed');

    } catch (error) {
      logger.error('Failed to destroy cache manager', { error });
    }
  }
}

export default IntelligentCacheManager;