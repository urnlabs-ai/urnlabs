import { PrismaClient } from '@prisma/client';
import { PolicyEvaluationEngine } from './policy-evaluation-engine';
import { PrismaPolicyLoader } from './policy-loader';
import { PrismaPolicyAuditLogger } from './policy-audit-logger';
import { logger } from '../lib/logger';
import Redis from 'ioredis';
import { EventEmitter } from 'events';

/**
 * Policy Engine Service Configuration
 */
export interface PolicyEngineServiceConfig {
  // Caching configuration
  redis?: {
    host: string;
    port: number;
    password?: string;
    db?: number;
    keyPrefix?: string;
  };
  cache?: {
    enabled: boolean;
    ttlSeconds: number;
    maxSize: number;
  };

  // Performance configuration
  performance?: {
    evaluationTimeoutMs: number;
    maxConcurrentEvaluations: number;
    preloadPolicies: boolean;
  };

  // Monitoring configuration
  monitoring?: {
    enabled: boolean;
    metricsInterval: number;
    alertThresholds: {
      evaluationTimeMs: number;
      errorRate: number;
      cacheHitRate: number;
    };
  };
}

/**
 * Policy Engine Service Metrics
 */
export interface PolicyEngineMetrics {
  evaluations: {
    total: number;
    allowed: number;
    denied: number;
    approvalRequired: number;
    errors: number;
  };
  performance: {
    averageEvaluationTime: number;
    maxEvaluationTime: number;
    timeouts: number;
  };
  cache: {
    hits: number;
    misses: number;
    hitRate: number;
    size: number;
  };
  timestamp: Date;
}

/**
 * Main Policy Engine Service
 *
 * Orchestrates all policy engine components and provides:
 * - High-performance policy evaluation
 * - Distributed caching with Redis
 * - Comprehensive monitoring and metrics
 * - Violation handling and reporting
 * - Background optimization
 */
export class PolicyEngineService extends EventEmitter {
  private readonly engine: PolicyEvaluationEngine;
  private readonly policyLoader: PrismaPolicyLoader;
  private readonly auditLogger: PrismaPolicyAuditLogger;
  private readonly redis?: Redis;

  // Performance tracking
  private metrics: PolicyEngineMetrics;
  private metricsResetTime: Date;
  private activeConcurrentEvaluations = 0;

  // Cache management
  private localCache = new Map<string, { data: any; expires: Date }>();
  private readonly cacheConfig: Required<PolicyEngineServiceConfig['cache']>;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly config: PolicyEngineServiceConfig
  ) {
    super();
    // Initialize components
    this.policyLoader = new PrismaPolicyLoader(prisma);
    this.auditLogger = new PrismaPolicyAuditLogger(prisma);
    this.engine = new PolicyEvaluationEngine(this.policyLoader, this.auditLogger);

    // Initialize Redis if configured
    if (config.redis) {
      this.redis = new Redis({
        host: config.redis.host,
        port: config.redis.port,
        password: config.redis.password,
        db: config.redis.db || 0,
        keyPrefix: config.redis.keyPrefix || 'policy:',
        retryDelayOnFailover: 100,
        maxRetriesPerRequest: 3,
        lazyConnect: true
      });

      this.redis.on('error', (error) => {
        logger.error('Redis connection error', { error: error.message });
      });

      this.redis.on('connect', () => {
        logger.info('Redis connected for policy engine');
      });
    }

    // Initialize cache configuration with defaults
    this.cacheConfig = {
      enabled: config.cache?.enabled ?? true,
      ttlSeconds: config.cache?.ttlSeconds ?? 300, // 5 minutes
      maxSize: config.cache?.maxSize ?? 10000
    };

    // Initialize metrics
    this.resetMetrics();

    // Start monitoring if enabled
    if (config.monitoring?.enabled) {
      this.startMonitoring();
    }

    // Preload policies if configured
    if (config.performance?.preloadPolicies) {
      this.preloadPolicies();
    }
  }

  /**
   * Evaluate policies for a resource with caching and performance optimization
   */
  async evaluateForResource(
    resourceType: string,
    resourceId: string,
    action: string,
    context: any
  ) {
    const startTime = Date.now();
    let fromCache = false;

    try {
      // Check concurrency limits
      if (this.config.performance?.maxConcurrentEvaluations) {
        if (this.activeConcurrentEvaluations >= this.config.performance.maxConcurrentEvaluations) {
          throw new Error('Maximum concurrent evaluations exceeded');
        }
      }

      this.activeConcurrentEvaluations++;

      // Generate cache key
      const cacheKey = this.generateCacheKey(resourceType, resourceId, action, context);

      // Try cache first
      if (this.cacheConfig.enabled) {
        const cached = await this.getFromCache(cacheKey);
        if (cached) {
          fromCache = true;
          this.updateMetrics('cache_hit');
          return cached;
        } else {
          this.updateMetrics('cache_miss');
        }
      }

      // Evaluate with timeout
      const timeoutMs = this.config.performance?.evaluationTimeoutMs || 10000;
      const evaluationPromise = this.engine.evaluateForResource(
        resourceType,
        resourceId,
        action,
        context
      );

      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Policy evaluation timeout')), timeoutMs);
      });

      const result = await Promise.race([evaluationPromise, timeoutPromise]);

      // Cache the result
      if (this.cacheConfig.enabled) {
        await this.setInCache(cacheKey, result);
      }

      // Update metrics
      this.updateMetrics('evaluation_success', Date.now() - startTime, result);

      // Emit event for violation detection
      this.emit('policyEvaluated', {
        organizationId: context.organizationId,
        policyId: result.policyId,
        context,
        result
      });

      return result;

    } catch (error) {
      const evaluationTime = Date.now() - startTime;
      this.updateMetrics('evaluation_error', evaluationTime);

      logger.error('Policy evaluation failed', {
        resourceType,
        resourceId,
        action,
        userId: context.userId,
        evaluationTime,
        error: error.message
      });

      throw error;

    } finally {
      this.activeConcurrentEvaluations--;
    }
  }

  /**
   * Bulk evaluate policies for multiple resources
   */
  async evaluateMultipleResources(
    evaluations: Array<{
      resourceType: string;
      resourceId: string;
      action: string;
      context: any;
    }>
  ) {
    const results = await Promise.allSettled(
      evaluations.map(evaluation =>
        this.evaluateForResource(
          evaluation.resourceType,
          evaluation.resourceId,
          evaluation.action,
          evaluation.context
        )
      )
    );

    return results.map((result, index) => ({
      evaluation: evaluations[index],
      result: result.status === 'fulfilled' ? result.value : null,
      error: result.status === 'rejected' ? result.reason : null
    }));
  }

  /**
   * Handle policy violations with escalation
   */
  async handlePolicyViolation(
    policyId: string,
    context: any,
    violation: {
      type: string;
      description: string;
      severity: 'low' | 'medium' | 'high' | 'critical';
      metadata?: Record<string, any>;
    }
  ) {
    try {
      // Log the violation
      await this.auditLogger.logPolicyViolation(policyId, context, violation);

      // Handle based on severity
      switch (violation.severity) {
        case 'critical':
          await this.handleCriticalViolation(policyId, context, violation);
          break;

        case 'high':
          await this.handleHighSeverityViolation(policyId, context, violation);
          break;

        case 'medium':
          await this.handleMediumSeverityViolation(policyId, context, violation);
          break;

        case 'low':
          await this.handleLowSeverityViolation(policyId, context, violation);
          break;
      }

      // Update violation metrics
      this.updateViolationMetrics(violation.severity);

    } catch (error) {
      logger.error('Failed to handle policy violation', {
        policyId,
        violationType: violation.type,
        severity: violation.severity,
        error: error.message
      });
    }
  }

  /**
   * Get policy engine metrics
   */
  getMetrics(): PolicyEngineMetrics {
    return { ...this.metrics };
  }

  /**
   * Get audit statistics
   */
  async getAuditStatistics(
    organizationId: string,
    fromDate: Date,
    toDate: Date
  ) {
    return this.auditLogger.getAuditStatistics(organizationId, fromDate, toDate);
  }

  /**
   * Export audit logs for compliance
   */
  async exportAuditLogs(
    organizationId: string,
    fromDate: Date,
    toDate: Date,
    format: 'json' | 'csv' = 'json'
  ) {
    return this.auditLogger.exportAuditLogs(organizationId, fromDate, toDate, format);
  }

  /**
   * Verify audit log integrity
   */
  async verifyAuditIntegrity(
    organizationId: string,
    fromDate?: Date,
    toDate?: Date
  ) {
    return this.auditLogger.verifyAuditIntegrity(organizationId, fromDate, toDate);
  }

  /**
   * Invalidate cache for organization
   */
  async invalidateCache(organizationId: string) {
    try {
      if (this.redis) {
        const pattern = `policy:${organizationId}:*`;
        const keys = await this.redis.keys(pattern);
        if (keys.length > 0) {
          await this.redis.del(...keys);
        }
      }

      // Clear local cache entries for organization
      for (const [key, _] of this.localCache.entries()) {
        if (key.includes(organizationId)) {
          this.localCache.delete(key);
        }
      }

      logger.info('Cache invalidated for organization', { organizationId });

    } catch (error) {
      logger.error('Failed to invalidate cache', {
        organizationId,
        error: error.message
      });
    }
  }

  /**
   * Preload policies for better performance
   */
  async preloadPolicies() {
    try {
      // Get all active organizations
      const organizations = await this.prisma.organization.findMany({
        where: { status: 'active' },
        select: { id: true }
      });

      // Preload policies for each organization
      await Promise.all(
        organizations.map(org =>
          this.policyLoader.preloadPoliciesForOrganization(org.id)
        )
      );

      logger.info('Policies preloaded', {
        organizationCount: organizations.length
      });

    } catch (error) {
      logger.error('Failed to preload policies', {
        error: error.message
      });
    }
  }

  /**
   * Health check for the policy engine
   */
  async healthCheck(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    components: Record<string, 'healthy' | 'unhealthy'>;
    metrics: PolicyEngineMetrics;
  }> {
    const components: Record<string, 'healthy' | 'unhealthy'> = {};

    try {
      // Check database connectivity
      await this.prisma.$queryRaw`SELECT 1`;
      components.database = 'healthy';
    } catch {
      components.database = 'unhealthy';
    }

    // Check Redis connectivity
    if (this.redis) {
      try {
        await this.redis.ping();
        components.redis = 'healthy';
      } catch {
        components.redis = 'unhealthy';
      }
    }

    // Check cache performance
    const cacheHitRate = this.metrics.cache.hitRate;
    components.cache = cacheHitRate > 0.5 ? 'healthy' : 'unhealthy';

    // Check evaluation performance
    const avgEvaluationTime = this.metrics.performance.averageEvaluationTime;
    const timeoutThreshold = this.config.monitoring?.alertThresholds?.evaluationTimeMs || 1000;
    components.performance = avgEvaluationTime < timeoutThreshold ? 'healthy' : 'unhealthy';

    // Determine overall status
    const unhealthyComponents = Object.values(components).filter(status => status === 'unhealthy');
    let status: 'healthy' | 'degraded' | 'unhealthy';

    if (unhealthyComponents.length === 0) {
      status = 'healthy';
    } else if (unhealthyComponents.length === 1) {
      status = 'degraded';
    } else {
      status = 'unhealthy';
    }

    return {
      status,
      components,
      metrics: this.getMetrics()
    };
  }

  /**
   * Graceful shutdown
   */
  async shutdown() {
    try {
      if (this.redis) {
        await this.redis.quit();
      }

      logger.info('Policy engine service shut down gracefully');

    } catch (error) {
      logger.error('Error during policy engine shutdown', {
        error: error.message
      });
    }
  }

  // Private methods

  private generateCacheKey(
    resourceType: string,
    resourceId: string,
    action: string,
    context: any
  ): string {
    const keyData = {
      resourceType,
      resourceId,
      action,
      userId: context.userId,
      organizationId: context.organizationId,
      roles: context.userRoles?.sort() || [],
      permissions: context.userPermissions?.sort() || []
    };

    const hash = require('crypto')
      .createHash('md5')
      .update(JSON.stringify(keyData))
      .digest('hex');

    return `eval:${context.organizationId}:${hash}`;
  }

  private async getFromCache(key: string): Promise<any> {
    try {
      // Try Redis first
      if (this.redis) {
        const cached = await this.redis.get(key);
        if (cached) {
          return JSON.parse(cached);
        }
      }

      // Try local cache
      const localEntry = this.localCache.get(key);
      if (localEntry && localEntry.expires > new Date()) {
        return localEntry.data;
      }

      return null;

    } catch (error) {
      logger.warn('Cache retrieval failed', {
        key,
        error: error.message
      });
      return null;
    }
  }

  private async setInCache(key: string, data: any): Promise<void> {
    try {
      const serialized = JSON.stringify(data);

      // Set in Redis
      if (this.redis) {
        await this.redis.setex(key, this.cacheConfig.ttlSeconds, serialized);
      }

      // Set in local cache
      const expires = new Date(Date.now() + this.cacheConfig.ttlSeconds * 1000);
      this.localCache.set(key, { data, expires });

      // Manage local cache size
      if (this.localCache.size > this.cacheConfig.maxSize) {
        this.evictLocalCacheEntries();
      }

    } catch (error) {
      logger.warn('Cache storage failed', {
        key,
        error: error.message
      });
    }
  }

  private evictLocalCacheEntries(): void {
    const now = new Date();
    const entries = Array.from(this.localCache.entries());

    // Remove expired entries first
    entries.forEach(([key, entry]) => {
      if (entry.expires <= now) {
        this.localCache.delete(key);
      }
    });

    // If still over limit, remove oldest entries
    if (this.localCache.size > this.cacheConfig.maxSize) {
      const remainingEntries = Array.from(this.localCache.entries())
        .sort(([, a], [, b]) => a.expires.getTime() - b.expires.getTime());

      const toRemove = remainingEntries.slice(0, this.localCache.size - this.cacheConfig.maxSize);
      toRemove.forEach(([key]) => this.localCache.delete(key));
    }
  }

  private updateMetrics(
    type: 'evaluation_success' | 'evaluation_error' | 'cache_hit' | 'cache_miss',
    evaluationTime?: number,
    result?: any
  ): void {
    const now = Date.now();

    switch (type) {
      case 'evaluation_success':
        this.metrics.evaluations.total++;
        if (result?.finalDecision === 'allow') {
          this.metrics.evaluations.allowed++;
        } else if (result?.finalDecision === 'deny') {
          this.metrics.evaluations.denied++;
        } else if (result?.finalDecision === 'require_approval') {
          this.metrics.evaluations.approvalRequired++;
        }

        if (evaluationTime) {
          this.updatePerformanceMetrics(evaluationTime);
        }
        break;

      case 'evaluation_error':
        this.metrics.evaluations.total++;
        this.metrics.evaluations.errors++;
        if (evaluationTime) {
          this.updatePerformanceMetrics(evaluationTime);
        }
        break;

      case 'cache_hit':
        this.metrics.cache.hits++;
        break;

      case 'cache_miss':
        this.metrics.cache.misses++;
        break;
    }

    // Update cache hit rate
    const totalCacheRequests = this.metrics.cache.hits + this.metrics.cache.misses;
    this.metrics.cache.hitRate = totalCacheRequests > 0
      ? this.metrics.cache.hits / totalCacheRequests
      : 0;

    this.metrics.timestamp = new Date();
  }

  private updatePerformanceMetrics(evaluationTime: number): void {
    if (evaluationTime > this.metrics.performance.maxEvaluationTime) {
      this.metrics.performance.maxEvaluationTime = evaluationTime;
    }

    // Update average evaluation time
    const totalEvaluations = this.metrics.evaluations.total;
    const currentAvg = this.metrics.performance.averageEvaluationTime;
    this.metrics.performance.averageEvaluationTime =
      (currentAvg * (totalEvaluations - 1) + evaluationTime) / totalEvaluations;
  }

  private updateViolationMetrics(severity: string): void {
    // This would update specific violation metrics
    // Implementation depends on detailed metrics requirements
  }

  private resetMetrics(): void {
    this.metrics = {
      evaluations: {
        total: 0,
        allowed: 0,
        denied: 0,
        approvalRequired: 0,
        errors: 0
      },
      performance: {
        averageEvaluationTime: 0,
        maxEvaluationTime: 0,
        timeouts: 0
      },
      cache: {
        hits: 0,
        misses: 0,
        hitRate: 0,
        size: 0
      },
      timestamp: new Date()
    };
    this.metricsResetTime = new Date();
  }

  private startMonitoring(): void {
    const interval = this.config.monitoring?.metricsInterval || 60000; // 1 minute

    setInterval(() => {
      this.logMetrics();
      this.checkAlertThresholds();
    }, interval);
  }

  private logMetrics(): void {
    logger.info('Policy engine metrics', this.metrics);
  }

  private checkAlertThresholds(): void {
    const thresholds = this.config.monitoring?.alertThresholds;
    if (!thresholds) return;

    // Check evaluation time threshold
    if (this.metrics.performance.averageEvaluationTime > thresholds.evaluationTimeMs) {
      logger.warn('Policy evaluation time threshold exceeded', {
        current: this.metrics.performance.averageEvaluationTime,
        threshold: thresholds.evaluationTimeMs
      });
    }

    // Check error rate threshold
    const errorRate = this.metrics.evaluations.total > 0
      ? this.metrics.evaluations.errors / this.metrics.evaluations.total
      : 0;

    if (errorRate > thresholds.errorRate) {
      logger.warn('Policy evaluation error rate threshold exceeded', {
        current: errorRate,
        threshold: thresholds.errorRate
      });
    }

    // Check cache hit rate threshold
    if (this.metrics.cache.hitRate < thresholds.cacheHitRate) {
      logger.warn('Policy cache hit rate below threshold', {
        current: this.metrics.cache.hitRate,
        threshold: thresholds.cacheHitRate
      });
    }
  }

  private async handleCriticalViolation(policyId: string, context: any, violation: any): Promise<void> {
    // Immediate escalation for critical violations
    logger.critical('Critical policy violation', {
      policyId,
      userId: context.userId,
      violation: violation.type,
      description: violation.description
    });

    // Could trigger immediate security team alerts, account suspension, etc.
  }

  private async handleHighSeverityViolation(policyId: string, context: any, violation: any): Promise<void> {
    // Escalation for high severity violations
    logger.error('High severity policy violation', {
      policyId,
      userId: context.userId,
      violation: violation.type,
      description: violation.description
    });

    // Could trigger security team notifications, additional monitoring, etc.
  }

  private async handleMediumSeverityViolation(policyId: string, context: any, violation: any): Promise<void> {
    // Standard handling for medium severity violations
    logger.warn('Medium severity policy violation', {
      policyId,
      userId: context.userId,
      violation: violation.type,
      description: violation.description
    });
  }

  private async handleLowSeverityViolation(policyId: string, context: any, violation: any): Promise<void> {
    // Informational logging for low severity violations
    logger.info('Low severity policy violation', {
      policyId,
      userId: context.userId,
      violation: violation.type,
      description: violation.description
    });
  }
}