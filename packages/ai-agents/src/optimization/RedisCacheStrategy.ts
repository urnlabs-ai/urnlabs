import Redis from 'ioredis';
import { EventEmitter } from 'events';
import { logger } from '../core/Logger.js';
import { IntelligentCacheManager, CacheConfig } from './IntelligentCacheManager.js';
import { PatternAnalyzer } from './PatternAnalyzer.js';
import { CacheWarmer } from './CacheWarmer.js';
import { CacheOptimizer } from './CacheOptimizer.js';

export interface RedisCacheStrategyConfig extends Partial<CacheConfig> {
  redis: {
    host: string;
    port: number;
    password?: string;
    db?: number;
    keyPrefix?: string;
    enablePipelining?: boolean;
    maxRetriesPerRequest?: number;
    connectTimeout?: number;
    commandTimeout?: number;
  };
  clustering?: {
    enabled: boolean;
    nodes?: Array<{ host: string; port: number }>;
    redisOptions?: Record<string, any>;
  };
  monitoring?: {
    metricsInterval: number;
    healthCheckInterval: number;
    alertThresholds: {
      latency: number;
      errorRate: number;
      memoryUsage: number;
    };
  };
}

export interface ConnectionHealth {
  connected: boolean;
  latency: number;
  memoryUsage: number;
  keyCount: number;
  uptime: number;
  lastError?: string;
  lastCheck: number;
}

export interface RedisMetrics {
  connections: {
    active: number;
    failed: number;
    total: number;
  };
  operations: {
    commands: number;
    errors: number;
    avgLatency: number;
  };
  memory: {
    used: number;
    peak: number;
    fragmentation: number;
  };
  performance: {
    hitRate: number;
    missRate: number;
    evictions: number;
  };
  timestamp: number;
}

export class RedisCacheStrategy extends EventEmitter {
  private config: RedisCacheStrategyConfig;
  private redisClient: Redis;
  private cacheManager: IntelligentCacheManager;
  private patternAnalyzer: PatternAnalyzer;
  private cacheWarmer: CacheWarmer;
  private cacheOptimizer: CacheOptimizer;

  private health: ConnectionHealth;
  private metrics: RedisMetrics;
  private isInitialized = false;
  private healthCheckTimer?: NodeJS.Timeout;
  private metricsTimer?: NodeJS.Timeout;

  private readonly DEFAULT_CONFIG: RedisCacheStrategyConfig = {
    redis: {
      host: 'localhost',
      port: 6379,
      db: 1, // Use a separate DB for caching
      keyPrefix: 'intelligent-cache:',
      enablePipelining: true,
      maxRetriesPerRequest: 3,
      connectTimeout: 10000,
      commandTimeout: 5000
    },
    monitoring: {
      metricsInterval: 30000, // 30 seconds
      healthCheckInterval: 60000, // 1 minute
      alertThresholds: {
        latency: 100, // ms
        errorRate: 0.05, // 5%
        memoryUsage: 0.9 // 90%
      }
    },
    policies: {
      defaultTTL: 3600,
      maxCacheSize: 2 * 1024 * 1024 * 1024, // 2GB
      evictionPolicy: 'intelligent',
      compressionEnabled: true,
      compressionThreshold: 1024
    },
    performance: {
      maxMemoryUsage: 0.85,
      targetHitRatio: 0.8,
      prefetchEnabled: true,
      warmupOnStart: true
    }
  };

  constructor(config?: Partial<RedisCacheStrategyConfig>) {
    super();

    this.config = this.mergeConfig(config);
    this.initializeMetrics();
    this.initializeHealth();
  }

  private mergeConfig(userConfig?: Partial<RedisCacheStrategyConfig>): RedisCacheStrategyConfig {
    return {
      ...this.DEFAULT_CONFIG,
      ...userConfig,
      redis: { ...this.DEFAULT_CONFIG.redis, ...userConfig?.redis },
      monitoring: { ...this.DEFAULT_CONFIG.monitoring, ...userConfig?.monitoring },
      policies: { ...this.DEFAULT_CONFIG.policies, ...userConfig?.policies },
      performance: { ...this.DEFAULT_CONFIG.performance, ...userConfig?.performance }
    };
  }

  private initializeMetrics(): void {
    this.metrics = {
      connections: { active: 0, failed: 0, total: 0 },
      operations: { commands: 0, errors: 0, avgLatency: 0 },
      memory: { used: 0, peak: 0, fragmentation: 0 },
      performance: { hitRate: 0, missRate: 0, evictions: 0 },
      timestamp: Date.now()
    };
  }

  private initializeHealth(): void {
    this.health = {
      connected: false,
      latency: 0,
      memoryUsage: 0,
      keyCount: 0,
      uptime: 0,
      lastCheck: Date.now()
    };
  }

  public async initialize(): Promise<void> {
    if (this.isInitialized) {
      logger.warn('Redis cache strategy already initialized');
      return;
    }

    try {
      logger.info('Initializing Redis cache strategy', {
        host: this.config.redis.host,
        port: this.config.redis.port,
        db: this.config.redis.db
      });

      // Create Redis connection
      await this.createRedisConnection();

      // Initialize pattern analyzer
      this.patternAnalyzer = new PatternAnalyzer();

      // Initialize cache manager with Redis client
      this.cacheManager = new IntelligentCacheManager(
        this.redisClient,
        this.patternAnalyzer,
        this.config
      );

      // Initialize cache warmer
      this.cacheWarmer = new CacheWarmer(
        this.patternAnalyzer,
        this.cacheManager
      );

      // Initialize cache optimizer
      this.cacheOptimizer = new CacheOptimizer(
        this.cacheManager,
        this.patternAnalyzer,
        this.cacheWarmer
      );

      // Start monitoring
      this.startMonitoring();

      // Warm up cache if enabled
      if (this.config.performance?.warmupOnStart) {
        await this.cacheWarmer.systemStartupWarmup();
      }

      this.isInitialized = true;

      logger.info('Redis cache strategy initialized successfully');
      this.emit('initialized');

    } catch (error) {
      logger.error('Failed to initialize Redis cache strategy', { error });
      throw error;
    }
  }

  private async createRedisConnection(): Promise<void> {
    try {
      if (this.config.clustering?.enabled && this.config.clustering.nodes) {
        // Create Redis Cluster connection
        this.redisClient = new Redis.Cluster(
          this.config.clustering.nodes,
          {
            redisOptions: {
              ...this.config.redis,
              ...this.config.clustering.redisOptions
            },
            enableReadyCheck: true,
            maxRetriesPerRequest: this.config.redis.maxRetriesPerRequest
          }
        );

        logger.info('Created Redis Cluster connection', {
          nodes: this.config.clustering.nodes.length
        });

      } else {
        // Create single Redis connection
        this.redisClient = new Redis({
          host: this.config.redis.host,
          port: this.config.redis.port,
          password: this.config.redis.password,
          db: this.config.redis.db,
          keyPrefix: this.config.redis.keyPrefix,
          enablePipelining: this.config.redis.enablePipelining,
          maxRetriesPerRequest: this.config.redis.maxRetriesPerRequest,
          connectTimeout: this.config.redis.connectTimeout,
          commandTimeout: this.config.redis.commandTimeout,
          enableReadyCheck: true,
          lazyConnect: true
        });

        logger.info('Created Redis connection', {
          host: this.config.redis.host,
          port: this.config.redis.port,
          db: this.config.redis.db
        });
      }

      // Set up event listeners
      this.setupRedisEventListeners();

      // Connect to Redis
      await this.redisClient.connect();

      // Configure Redis for caching
      await this.configureRedisForCaching();

    } catch (error) {
      logger.error('Redis connection failed', { error });
      throw error;
    }
  }

  private setupRedisEventListeners(): void {
    this.redisClient.on('connect', () => {
      logger.info('Redis connected successfully');
      this.health.connected = true;
      this.metrics.connections.active++;
      this.metrics.connections.total++;
      this.emit('connected');
    });

    this.redisClient.on('ready', () => {
      logger.info('Redis ready for operations');
      this.emit('ready');
    });

    this.redisClient.on('error', (error) => {
      logger.error('Redis connection error', { error });
      this.health.connected = false;
      this.health.lastError = error.message;
      this.metrics.connections.failed++;
      this.metrics.operations.errors++;
      this.emit('error', error);
    });

    this.redisClient.on('close', () => {
      logger.warn('Redis connection closed');
      this.health.connected = false;
      this.metrics.connections.active = Math.max(0, this.metrics.connections.active - 1);
      this.emit('disconnected');
    });

    this.redisClient.on('reconnecting', () => {
      logger.info('Redis reconnecting...');
      this.emit('reconnecting');
    });

    // Monitor command execution
    this.redisClient.on('select', (db) => {
      logger.debug('Redis database selected', { db });
    });
  }

  private async configureRedisForCaching(): Promise<void> {
    try {
      // Set memory policy for cache optimization
      await this.redisClient.config('SET', 'maxmemory-policy', 'allkeys-lru');

      // Set maximum memory limit
      if (this.config.policies?.maxCacheSize) {
        await this.redisClient.config('SET', 'maxmemory', this.config.policies.maxCacheSize.toString());
      }

      // Enable RDB persistence for cache resilience
      await this.redisClient.config('SET', 'save', '900 1 300 10 60 10000');

      // Configure timeout settings
      await this.redisClient.config('SET', 'timeout', '300');

      // Set TCP keepalive
      await this.redisClient.config('SET', 'tcp-keepalive', '60');

      logger.info('Redis configured for intelligent caching');

    } catch (error) {
      logger.error('Failed to configure Redis for caching', { error });
      // Don't throw here as these are optimization settings
    }
  }

  private startMonitoring(): void {
    // Start health checks
    this.healthCheckTimer = setInterval(
      () => this.performHealthCheck(),
      this.config.monitoring?.healthCheckInterval || 60000
    );

    // Start metrics collection
    this.metricsTimer = setInterval(
      () => this.collectMetrics(),
      this.config.monitoring?.metricsInterval || 30000
    );

    logger.info('Redis monitoring started', {
      healthCheckInterval: this.config.monitoring?.healthCheckInterval,
      metricsInterval: this.config.monitoring?.metricsInterval
    });
  }

  private async performHealthCheck(): Promise<void> {
    const startTime = Date.now();

    try {
      // Test Redis connectivity with a simple ping
      const pingResult = await this.redisClient.ping();
      const latency = Date.now() - startTime;

      // Get memory info
      const memoryInfo = await this.redisClient.memory('usage');

      // Get key count
      const keyCount = await this.redisClient.dbsize();

      // Get server info
      const serverInfo = await this.redisClient.info('server');
      const uptimeMatch = serverInfo.match(/uptime_in_seconds:(\d+)/);
      const uptime = uptimeMatch ? parseInt(uptimeMatch[1]) : 0;

      // Update health status
      this.health = {
        connected: pingResult === 'PONG',
        latency,
        memoryUsage: memoryInfo,
        keyCount,
        uptime,
        lastCheck: Date.now()
      };

      // Check alert thresholds
      this.checkAlertThresholds();

      logger.debug('Health check completed', {
        connected: this.health.connected,
        latency,
        keyCount,
        memoryUsage: memoryInfo
      });

    } catch (error) {
      logger.error('Health check failed', { error });

      this.health.connected = false;
      this.health.lastError = error instanceof Error ? error.message : String(error);
      this.health.latency = Date.now() - startTime;
      this.health.lastCheck = Date.now();

      this.emit('health-check-failed', error);
    }
  }

  private async collectMetrics(): Promise<void> {
    try {
      // Get Redis info
      const info = await this.redisClient.info('all');

      // Parse memory statistics
      const memoryMatch = info.match(/used_memory:(\d+)/);
      const memoryPeakMatch = info.match(/used_memory_peak:(\d+)/);
      const fragmentationMatch = info.match(/mem_fragmentation_ratio:([\d.]+)/);

      // Parse connection statistics
      const connectionsMatch = info.match(/connected_clients:(\d+)/);
      const commandsMatch = info.match(/total_commands_processed:(\d+)/);

      // Parse keyspace statistics
      const keyspaceHitsMatch = info.match(/keyspace_hits:(\d+)/);
      const keyspaceMissesMatch = info.match(/keyspace_misses:(\d+)/);
      const evictionsMatch = info.match(/evicted_keys:(\d+)/);

      // Update metrics
      const newMetrics: RedisMetrics = {
        connections: {
          active: connectionsMatch ? parseInt(connectionsMatch[1]) : this.metrics.connections.active,
          failed: this.metrics.connections.failed,
          total: this.metrics.connections.total
        },
        operations: {
          commands: commandsMatch ? parseInt(commandsMatch[1]) : this.metrics.operations.commands,
          errors: this.metrics.operations.errors,
          avgLatency: this.health.latency
        },
        memory: {
          used: memoryMatch ? parseInt(memoryMatch[1]) : 0,
          peak: memoryPeakMatch ? parseInt(memoryPeakMatch[1]) : 0,
          fragmentation: fragmentationMatch ? parseFloat(fragmentationMatch[1]) : 1.0
        },
        performance: {
          hitRate: this.calculateHitRate(keyspaceHitsMatch, keyspaceMissesMatch),
          missRate: this.calculateMissRate(keyspaceHitsMatch, keyspaceMissesMatch),
          evictions: evictionsMatch ? parseInt(evictionsMatch[1]) : 0
        },
        timestamp: Date.now()
      };

      this.metrics = newMetrics;

      this.emit('metrics-updated', this.metrics);

      logger.debug('Metrics collected', {
        memoryUsed: this.metrics.memory.used,
        hitRate: this.metrics.performance.hitRate,
        connections: this.metrics.connections.active
      });

    } catch (error) {
      logger.error('Metrics collection failed', { error });
    }
  }

  private calculateHitRate(hitsMatch: RegExpMatchArray | null, missesMatch: RegExpMatchArray | null): number {
    const hits = hitsMatch ? parseInt(hitsMatch[1]) : 0;
    const misses = missesMatch ? parseInt(missesMatch[1]) : 0;
    const total = hits + misses;
    return total > 0 ? hits / total : 0;
  }

  private calculateMissRate(hitsMatch: RegExpMatchArray | null, missesMatch: RegExpMatchArray | null): number {
    const hits = hitsMatch ? parseInt(hitsMatch[1]) : 0;
    const misses = missesMatch ? parseInt(missesMatch[1]) : 0;
    const total = hits + misses;
    return total > 0 ? misses / total : 0;
  }

  private checkAlertThresholds(): void {
    if (!this.config.monitoring?.alertThresholds) return;

    const thresholds = this.config.monitoring.alertThresholds;

    // Check latency threshold
    if (this.health.latency > thresholds.latency) {
      this.emit('alert', {
        type: 'high-latency',
        value: this.health.latency,
        threshold: thresholds.latency,
        severity: 'warning'
      });
    }

    // Check memory usage threshold
    const memoryUsagePercent = this.config.policies?.maxCacheSize ?
      this.metrics.memory.used / this.config.policies.maxCacheSize : 0;

    if (memoryUsagePercent > thresholds.memoryUsage) {
      this.emit('alert', {
        type: 'high-memory-usage',
        value: memoryUsagePercent,
        threshold: thresholds.memoryUsage,
        severity: 'critical'
      });
    }

    // Check error rate threshold
    const errorRate = this.metrics.operations.commands > 0 ?
      this.metrics.operations.errors / this.metrics.operations.commands : 0;

    if (errorRate > thresholds.errorRate) {
      this.emit('alert', {
        type: 'high-error-rate',
        value: errorRate,
        threshold: thresholds.errorRate,
        severity: 'critical'
      });
    }
  }

  // Public API methods
  public async get(key: string, options?: Record<string, any>): Promise<any> {
    if (!this.isInitialized) {
      throw new Error('Redis cache strategy not initialized');
    }

    return await this.cacheManager.get(key, options);
  }

  public async set(key: string, value: any, options?: Record<string, any>): Promise<boolean> {
    if (!this.isInitialized) {
      throw new Error('Redis cache strategy not initialized');
    }

    return await this.cacheManager.set(key, value, options);
  }

  public async del(key: string): Promise<boolean> {
    if (!this.isInitialized) {
      throw new Error('Redis cache strategy not initialized');
    }

    try {
      const result = await this.redisClient.del(key);
      return result > 0;
    } catch (error) {
      logger.error('Cache delete failed', { error, key });
      return false;
    }
  }

  public async invalidatePattern(pattern: string): Promise<number> {
    if (!this.isInitialized) {
      throw new Error('Redis cache strategy not initialized');
    }

    return await this.cacheManager.invalidateByPattern(pattern);
  }

  public async invalidateTags(tags: string[]): Promise<number> {
    if (!this.isInitialized) {
      throw new Error('Redis cache strategy not initialized');
    }

    return await this.cacheManager.invalidateByTags(tags);
  }

  public async warmupWorkflow(workflowId: string, options?: Record<string, any>): Promise<string> {
    if (!this.isInitialized) {
      throw new Error('Redis cache strategy not initialized');
    }

    return await this.cacheWarmer.warmupWorkflow(workflowId, options);
  }

  public async runOptimization(): Promise<any> {
    if (!this.isInitialized) {
      throw new Error('Redis cache strategy not initialized');
    }

    return await this.cacheOptimizer.runOptimizationCycle();
  }

  public getHealth(): ConnectionHealth {
    return { ...this.health };
  }

  public getMetrics(): RedisMetrics {
    return { ...this.metrics };
  }

  public getCacheMetrics(): any {
    if (!this.isInitialized) {
      return null;
    }

    return this.cacheManager.getMetrics();
  }

  public async getAnalytics(): Promise<any> {
    if (!this.isInitialized) {
      throw new Error('Redis cache strategy not initialized');
    }

    return await this.cacheManager.analyzeCacheEfficiency();
  }

  public async flushCache(): Promise<void> {
    try {
      await this.redisClient.flushdb();
      logger.info('Cache flushed successfully');
    } catch (error) {
      logger.error('Cache flush failed', { error });
      throw error;
    }
  }

  public async destroy(): Promise<void> {
    try {
      logger.info('Destroying Redis cache strategy');

      // Stop monitoring
      if (this.healthCheckTimer) {
        clearInterval(this.healthCheckTimer);
      }
      if (this.metricsTimer) {
        clearInterval(this.metricsTimer);
      }

      // Destroy components
      if (this.cacheOptimizer) {
        this.cacheOptimizer.destroy();
      }
      if (this.cacheWarmer) {
        this.cacheWarmer.destroy();
      }
      if (this.cacheManager) {
        await this.cacheManager.destroy();
      }
      if (this.patternAnalyzer) {
        this.patternAnalyzer.destroy();
      }

      // Close Redis connection
      if (this.redisClient) {
        await this.redisClient.quit();
      }

      this.removeAllListeners();
      this.isInitialized = false;

      logger.info('Redis cache strategy destroyed successfully');

    } catch (error) {
      logger.error('Failed to destroy Redis cache strategy', { error });
      throw error;
    }
  }
}

export default RedisCacheStrategy;