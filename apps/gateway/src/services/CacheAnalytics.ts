import Redis from 'ioredis';
import logger from '../lib/logger.js';
import redisManager from '../lib/redis.js';

export interface CacheMetrics {
  requestCount: number;
  hitCount: number;
  missCount: number;
  hitRate: number;
  avgResponseTime: number;
  totalSize: number;
  memoryEfficiency: number;
}

export interface EndpointMetrics {
  url: string;
  method: string;
  hitRate: number;
  requestCount: number;
  avgResponseTime: number;
  lastAccessed: Date;
  cacheSize: number;
  optimalTtl: number;
}

export interface CachePerformanceReport {
  summary: CacheMetrics;
  endpoints: EndpointMetrics[];
  recommendations: CacheRecommendation[];
  trends: {
    hourly: Array<{ timestamp: Date; hitRate: number; requestCount: number }>;
    daily: Array<{ timestamp: Date; hitRate: number; requestCount: number }>;
  };
  alerts: CacheAlert[];
}

export interface CacheRecommendation {
  type: 'ttl_optimization' | 'policy_adjustment' | 'memory_optimization' | 'invalidation_strategy';
  priority: 'low' | 'medium' | 'high' | 'critical';
  endpoint?: string;
  message: string;
  details: string;
  expectedImpact: {
    hitRateImprovement?: number;
    memoryReduction?: number;
    responseTimeImprovement?: number;
  };
  action: {
    type: string;
    parameters: Record<string, any>;
  };
}

export interface CacheAlert {
  id: string;
  type: 'low_hit_rate' | 'high_memory_usage' | 'cache_thrashing' | 'policy_violation';
  severity: 'info' | 'warning' | 'error' | 'critical';
  message: string;
  details: string;
  timestamp: Date;
  endpoint?: string;
  threshold?: number;
  currentValue?: number;
  resolved: boolean;
}

export interface CacheHealthCheck {
  overall: 'healthy' | 'warning' | 'critical';
  components: {
    hitRate: { status: 'healthy' | 'warning' | 'critical'; value: number; threshold: number };
    memoryUsage: { status: 'healthy' | 'warning' | 'critical'; value: number; threshold: number };
    responseTime: { status: 'healthy' | 'warning' | 'critical'; value: number; threshold: number };
    errorRate: { status: 'healthy' | 'warning' | 'critical'; value: number; threshold: number };
  };
  recommendations: string[];
}

export class CacheAnalytics {
  private redis: Redis;
  private readonly metricsPrefix: string = 'cache:analytics:';
  private readonly endpointMetricsPrefix: string = 'cache:endpoint:';
  private readonly alertsKey: string = 'cache:alerts';
  private readonly trendsKey: string = 'cache:trends';

  // Thresholds for health checks and alerts
  private readonly thresholds = {
    hitRate: { warning: 70, critical: 50 },
    memoryUsage: { warning: 80, critical: 90 },
    responseTime: { warning: 200, critical: 500 },
    errorRate: { warning: 5, critical: 10 }
  };

  constructor() {
    this.redis = redisManager.getClient();
  }

  /**
   * Record cache access metrics
   */
  async recordAccess(
    url: string,
    method: string,
    hit: boolean,
    responseTime: number,
    size?: number
  ): Promise<void> {
    try {
      const timestamp = Date.now();
      const hour = Math.floor(timestamp / (1000 * 60 * 60));
      const day = Math.floor(timestamp / (1000 * 60 * 60 * 24));

      const pipeline = this.redis.pipeline();

      // Global metrics
      const globalKey = `${this.metricsPrefix}global`;
      pipeline.hincrby(globalKey, 'requestCount', 1);
      if (hit) {
        pipeline.hincrby(globalKey, 'hitCount', 1);
      } else {
        pipeline.hincrby(globalKey, 'missCount', 1);
      }

      // Update response time (running average)
      const responseTimeKey = `${globalKey}:responseTime`;
      pipeline.lpush(responseTimeKey, responseTime);
      pipeline.ltrim(responseTimeKey, 0, 999); // Keep last 1000 entries

      if (size) {
        pipeline.hincrby(globalKey, 'totalSize', size);
      }

      // Endpoint-specific metrics
      const endpointKey = `${this.endpointMetricsPrefix}${this.hashEndpoint(method, url)}`;
      pipeline.hincrby(endpointKey, 'requestCount', 1);
      if (hit) {
        pipeline.hincrby(endpointKey, 'hitCount', 1);
      } else {
        pipeline.hincrby(endpointKey, 'missCount', 1);
      }
      pipeline.hset(endpointKey, 'lastAccessed', timestamp);
      pipeline.hset(endpointKey, 'url', url);
      pipeline.hset(endpointKey, 'method', method);

      // Trend data
      const hourlyKey = `${this.trendsKey}:hourly:${hour}`;
      pipeline.hincrby(hourlyKey, 'requestCount', 1);
      if (hit) {
        pipeline.hincrby(hourlyKey, 'hitCount', 1);
      }
      pipeline.expire(hourlyKey, 7 * 24 * 60 * 60); // Keep for 7 days

      const dailyKey = `${this.trendsKey}:daily:${day}`;
      pipeline.hincrby(dailyKey, 'requestCount', 1);
      if (hit) {
        pipeline.hincrby(dailyKey, 'hitCount', 1);
      }
      pipeline.expire(dailyKey, 30 * 24 * 60 * 60); // Keep for 30 days

      // Set expiration for metrics
      pipeline.expire(globalKey, 24 * 60 * 60); // 24 hours
      pipeline.expire(responseTimeKey, 24 * 60 * 60);
      pipeline.expire(endpointKey, 7 * 24 * 60 * 60); // 7 days

      await pipeline.exec();

      // Check for alerts (async)
      this.checkAlerts(url, method, hit, responseTime).catch(error => {
        logger.error({ error }, 'Failed to check cache alerts');
      });

    } catch (error: any) {
      logger.error({ error, url, method }, 'Failed to record cache access metrics');
    }
  }

  /**
   * Get comprehensive cache performance report
   */
  async getPerformanceReport(): Promise<CachePerformanceReport> {
    try {
      // Get global metrics
      const summary = await this.getGlobalMetrics();

      // Get endpoint metrics
      const endpoints = await this.getEndpointMetrics();

      // Get trend data
      const trends = await this.getTrendData();

      // Generate recommendations
      const recommendations = await this.generateRecommendations(summary, endpoints);

      // Get active alerts
      const alerts = await this.getActiveAlerts();

      return {
        summary,
        endpoints,
        recommendations,
        trends,
        alerts
      };
    } catch (error: any) {
      logger.error({ error }, 'Failed to generate cache performance report');
      throw error;
    }
  }

  /**
   * Get global cache metrics
   */
  private async getGlobalMetrics(): Promise<CacheMetrics> {
    const globalKey = `${this.metricsPrefix}global`;
    const metrics = await this.redis.hgetall(globalKey);
    const responseTimeKey = `${globalKey}:responseTime`;
    const responseTimes = await this.redis.lrange(responseTimeKey, 0, -1);

    const requestCount = parseInt(metrics.requestCount || '0');
    const hitCount = parseInt(metrics.hitCount || '0');
    const missCount = parseInt(metrics.missCount || '0');
    const totalSize = parseInt(metrics.totalSize || '0');

    const hitRate = requestCount > 0 ? (hitCount / requestCount) * 100 : 0;

    const avgResponseTime = responseTimes.length > 0
      ? responseTimes.reduce((sum, time) => sum + parseInt(time), 0) / responseTimes.length
      : 0;

    // Memory efficiency is based on hit rate and cache utilization
    const memoryEfficiency = hitRate > 0 ? Math.min(100, hitRate * 1.2) : 0;

    return {
      requestCount,
      hitCount,
      missCount,
      hitRate: Math.round(hitRate * 100) / 100,
      avgResponseTime: Math.round(avgResponseTime * 100) / 100,
      totalSize,
      memoryEfficiency: Math.round(memoryEfficiency * 100) / 100
    };
  }

  /**
   * Get endpoint-specific metrics
   */
  private async getEndpointMetrics(): Promise<EndpointMetrics[]> {
    const pattern = `${this.endpointMetricsPrefix}*`;
    const keys = await this.redis.keys(pattern);
    const endpoints: EndpointMetrics[] = [];

    if (keys.length === 0) {
      return endpoints;
    }

    const pipeline = this.redis.pipeline();
    for (const key of keys) {
      pipeline.hgetall(key);
    }

    const results = await pipeline.exec();

    for (let i = 0; i < results!.length; i++) {
      const result = results![i];
      if (result && result[1]) {
        const metrics = result[1] as Record<string, string>;
        const requestCount = parseInt(metrics.requestCount || '0');
        const hitCount = parseInt(metrics.hitCount || '0');
        const hitRate = requestCount > 0 ? (hitCount / requestCount) * 100 : 0;

        endpoints.push({
          url: metrics.url || 'unknown',
          method: metrics.method || 'GET',
          hitRate: Math.round(hitRate * 100) / 100,
          requestCount,
          avgResponseTime: parseFloat(metrics.avgResponseTime || '0'),
          lastAccessed: new Date(parseInt(metrics.lastAccessed || '0')),
          cacheSize: parseInt(metrics.cacheSize || '0'),
          optimalTtl: await this.calculateOptimalTtl(metrics.url, hitRate, requestCount)
        });
      }
    }

    return endpoints.sort((a, b) => b.requestCount - a.requestCount);
  }

  /**
   * Get trend data for hourly and daily patterns
   */
  private async getTrendData(): Promise<{
    hourly: Array<{ timestamp: Date; hitRate: number; requestCount: number }>;
    daily: Array<{ timestamp: Date; hitRate: number; requestCount: number }>;
  }> {
    const now = Date.now();
    const currentHour = Math.floor(now / (1000 * 60 * 60));
    const currentDay = Math.floor(now / (1000 * 60 * 60 * 24));

    // Get last 24 hours
    const hourlyPromises = [];
    for (let i = 23; i >= 0; i--) {
      const hour = currentHour - i;
      const key = `${this.trendsKey}:hourly:${hour}`;
      hourlyPromises.push(this.redis.hgetall(key));
    }

    // Get last 30 days
    const dailyPromises = [];
    for (let i = 29; i >= 0; i--) {
      const day = currentDay - i;
      const key = `${this.trendsKey}:daily:${day}`;
      dailyPromises.push(this.redis.hgetall(key));
    }

    const [hourlyResults, dailyResults] = await Promise.all([
      Promise.all(hourlyPromises),
      Promise.all(dailyPromises)
    ]);

    const hourly = hourlyResults.map((result, index) => {
      const hour = currentHour - (23 - index);
      const requestCount = parseInt(result.requestCount || '0');
      const hitCount = parseInt(result.hitCount || '0');
      const hitRate = requestCount > 0 ? (hitCount / requestCount) * 100 : 0;

      return {
        timestamp: new Date(hour * 1000 * 60 * 60),
        hitRate: Math.round(hitRate * 100) / 100,
        requestCount
      };
    });

    const daily = dailyResults.map((result, index) => {
      const day = currentDay - (29 - index);
      const requestCount = parseInt(result.requestCount || '0');
      const hitCount = parseInt(result.hitCount || '0');
      const hitRate = requestCount > 0 ? (hitCount / requestCount) * 100 : 0;

      return {
        timestamp: new Date(day * 1000 * 60 * 60 * 24),
        hitRate: Math.round(hitRate * 100) / 100,
        requestCount
      };
    });

    return { hourly, daily };
  }

  /**
   * Generate performance recommendations
   */
  private async generateRecommendations(
    summary: CacheMetrics,
    endpoints: EndpointMetrics[]
  ): Promise<CacheRecommendation[]> {
    const recommendations: CacheRecommendation[] = [];

    // Global hit rate recommendation
    if (summary.hitRate < this.thresholds.hitRate.critical) {
      recommendations.push({
        type: 'policy_adjustment',
        priority: 'critical',
        message: 'Cache hit rate is critically low',
        details: `Current hit rate is ${summary.hitRate}%. Review cache policies and TTL settings.`,
        expectedImpact: {
          hitRateImprovement: 20,
          responseTimeImprovement: 150
        },
        action: {
          type: 'review_cache_policies',
          parameters: { currentHitRate: summary.hitRate }
        }
      });
    } else if (summary.hitRate < this.thresholds.hitRate.warning) {
      recommendations.push({
        type: 'ttl_optimization',
        priority: 'medium',
        message: 'Cache hit rate could be improved',
        details: `Current hit rate is ${summary.hitRate}%. Consider optimizing TTL values for popular endpoints.`,
        expectedImpact: {
          hitRateImprovement: 10,
          responseTimeImprovement: 75
        },
        action: {
          type: 'optimize_ttl',
          parameters: { currentHitRate: summary.hitRate }
        }
      });
    }

    // Memory efficiency recommendation
    if (summary.memoryEfficiency < 60) {
      recommendations.push({
        type: 'memory_optimization',
        priority: 'medium',
        message: 'Cache memory efficiency is low',
        details: 'Cache is not providing sufficient value for memory used. Review cached content size and frequency.',
        expectedImpact: {
          memoryReduction: 25,
          hitRateImprovement: 5
        },
        action: {
          type: 'optimize_memory_usage',
          parameters: { efficiency: summary.memoryEfficiency }
        }
      });
    }

    // Endpoint-specific recommendations
    for (const endpoint of endpoints.slice(0, 10)) { // Top 10 endpoints
      if (endpoint.hitRate < 30 && endpoint.requestCount > 100) {
        recommendations.push({
          type: 'policy_adjustment',
          priority: 'high',
          endpoint: `${endpoint.method} ${endpoint.url}`,
          message: `Poor cache performance for popular endpoint`,
          details: `${endpoint.url} has only ${endpoint.hitRate}% hit rate with ${endpoint.requestCount} requests.`,
          expectedImpact: {
            hitRateImprovement: 40
          },
          action: {
            type: 'review_endpoint_policy',
            parameters: {
              url: endpoint.url,
              method: endpoint.method,
              currentHitRate: endpoint.hitRate
            }
          }
        });
      }

      // TTL optimization for high-traffic endpoints
      if (endpoint.requestCount > 1000 && endpoint.optimalTtl !== 300) {
        recommendations.push({
          type: 'ttl_optimization',
          priority: 'medium',
          endpoint: `${endpoint.method} ${endpoint.url}`,
          message: 'TTL optimization opportunity detected',
          details: `Optimal TTL for this endpoint is ${endpoint.optimalTtl}s instead of default 300s.`,
          expectedImpact: {
            hitRateImprovement: 15
          },
          action: {
            type: 'adjust_ttl',
            parameters: {
              url: endpoint.url,
              currentTtl: 300,
              optimalTtl: endpoint.optimalTtl
            }
          }
        });
      }
    }

    return recommendations.sort((a, b) => {
      const priorityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
      return priorityOrder[b.priority] - priorityOrder[a.priority];
    });
  }

  /**
   * Calculate optimal TTL for an endpoint based on access patterns
   */
  private async calculateOptimalTtl(url: string, hitRate: number, requestCount: number): Promise<number> {
    // Simple heuristic - can be made more sophisticated
    const baseTtl = 300; // 5 minutes

    if (requestCount < 10) {
      return baseTtl; // Not enough data
    }

    if (hitRate > 80) {
      return Math.min(3600, baseTtl * 2); // Can cache longer
    } else if (hitRate < 30) {
      return Math.max(60, baseTtl / 2); // Cache for shorter time
    }

    return baseTtl;
  }

  /**
   * Check for cache alerts based on metrics
   */
  private async checkAlerts(url: string, method: string, hit: boolean, responseTime: number): Promise<void> {
    try {
      const alerts: CacheAlert[] = [];

      // Check response time alert
      if (responseTime > this.thresholds.responseTime.critical) {
        alerts.push({
          id: `response-time-${Date.now()}`,
          type: 'cache_thrashing',
          severity: 'critical',
          message: 'High response time detected',
          details: `Response time of ${responseTime}ms exceeds critical threshold of ${this.thresholds.responseTime.critical}ms`,
          timestamp: new Date(),
          endpoint: `${method} ${url}`,
          threshold: this.thresholds.responseTime.critical,
          currentValue: responseTime,
          resolved: false
        });
      }

      // Get recent hit rate for this endpoint
      const endpointKey = `${this.endpointMetricsPrefix}${this.hashEndpoint(method, url)}`;
      const metrics = await this.redis.hgetall(endpointKey);
      const requestCount = parseInt(metrics.requestCount || '0');
      const hitCount = parseInt(metrics.hitCount || '0');

      if (requestCount > 50) { // Only alert if we have enough data
        const hitRate = (hitCount / requestCount) * 100;

        if (hitRate < this.thresholds.hitRate.critical) {
          alerts.push({
            id: `hit-rate-${this.hashEndpoint(method, url)}-${Date.now()}`,
            type: 'low_hit_rate',
            severity: 'warning',
            message: 'Low cache hit rate',
            details: `Hit rate of ${hitRate.toFixed(2)}% is below critical threshold`,
            timestamp: new Date(),
            endpoint: `${method} ${url}`,
            threshold: this.thresholds.hitRate.critical,
            currentValue: hitRate,
            resolved: false
          });
        }
      }

      // Store alerts
      if (alerts.length > 0) {
        const pipeline = this.redis.pipeline();
        for (const alert of alerts) {
          pipeline.zadd(this.alertsKey, Date.now(), JSON.stringify(alert));
        }
        // Keep alerts for 7 days
        pipeline.expire(this.alertsKey, 7 * 24 * 60 * 60);
        await pipeline.exec();

        logger.warn({ alerts: alerts.length, endpoint: `${method} ${url}` }, 'Cache alerts generated');
      }
    } catch (error: any) {
      logger.error({ error }, 'Failed to check cache alerts');
    }
  }

  /**
   * Get active alerts
   */
  async getActiveAlerts(): Promise<CacheAlert[]> {
    try {
      const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
      const alertData = await this.redis.zrangebyscore(this.alertsKey, oneDayAgo, '+inf');

      const alerts: CacheAlert[] = [];
      for (const data of alertData) {
        try {
          const alert = JSON.parse(data);
          if (!alert.resolved) {
            alerts.push({
              ...alert,
              timestamp: new Date(alert.timestamp)
            });
          }
        } catch {
          // Ignore invalid alert data
        }
      }

      return alerts.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    } catch (error: any) {
      logger.error({ error }, 'Failed to get active alerts');
      return [];
    }
  }

  /**
   * Perform cache health check
   */
  async getHealthCheck(): Promise<CacheHealthCheck> {
    try {
      const metrics = await this.getGlobalMetrics();

      const components = {
        hitRate: {
          status: this.getHealthStatus(metrics.hitRate, this.thresholds.hitRate),
          value: metrics.hitRate,
          threshold: this.thresholds.hitRate.warning
        },
        memoryUsage: {
          status: this.getHealthStatus(metrics.memoryEfficiency, { warning: 80, critical: 90 }),
          value: metrics.memoryEfficiency,
          threshold: 80
        },
        responseTime: {
          status: this.getHealthStatus(metrics.avgResponseTime, this.thresholds.responseTime, true),
          value: metrics.avgResponseTime,
          threshold: this.thresholds.responseTime.warning
        },
        errorRate: {
          status: 'healthy' as const, // Will be implemented when error tracking is added
          value: 0,
          threshold: this.thresholds.errorRate.warning
        }
      };

      const statuses = Object.values(components).map(c => c.status);
      const overall = statuses.includes('critical') ? 'critical' :
                    statuses.includes('warning') ? 'warning' : 'healthy';

      const recommendations: string[] = [];
      if (components.hitRate.status !== 'healthy') {
        recommendations.push('Optimize cache policies to improve hit rate');
      }
      if (components.memoryUsage.status !== 'healthy') {
        recommendations.push('Review cache size and eviction policies');
      }
      if (components.responseTime.status !== 'healthy') {
        recommendations.push('Investigate cache performance bottlenecks');
      }

      return {
        overall,
        components,
        recommendations
      };
    } catch (error: any) {
      logger.error({ error }, 'Failed to perform cache health check');
      return {
        overall: 'critical',
        components: {
          hitRate: { status: 'critical', value: 0, threshold: 70 },
          memoryUsage: { status: 'critical', value: 0, threshold: 80 },
          responseTime: { status: 'critical', value: 0, threshold: 200 },
          errorRate: { status: 'critical', value: 0, threshold: 5 }
        },
        recommendations: ['Cache system unavailable - check Redis connection']
      };
    }
  }

  /**
   * Get health status based on value and thresholds
   */
  private getHealthStatus(
    value: number,
    thresholds: { warning: number; critical: number },
    inverted: boolean = false
  ): 'healthy' | 'warning' | 'critical' {
    if (inverted) {
      // For metrics where higher is worse (like response time)
      if (value >= thresholds.critical) return 'critical';
      if (value >= thresholds.warning) return 'warning';
      return 'healthy';
    } else {
      // For metrics where higher is better (like hit rate)
      if (value <= thresholds.critical) return 'critical';
      if (value <= thresholds.warning) return 'warning';
      return 'healthy';
    }
  }

  /**
   * Hash endpoint for consistent key generation
   */
  private hashEndpoint(method: string, url: string): string {
    return Buffer.from(`${method}:${url}`).toString('base64').replace(/[/+=]/g, '_');
  }

  /**
   * Clear all analytics data
   */
  async clearAnalytics(): Promise<void> {
    try {
      const patterns = [
        `${this.metricsPrefix}*`,
        `${this.endpointMetricsPrefix}*`,
        `${this.trendsKey}*`,
        this.alertsKey
      ];

      for (const pattern of patterns) {
        const keys = await this.redis.keys(pattern);
        if (keys.length > 0) {
          await this.redis.del(...keys);
        }
      }

      logger.info('Cache analytics data cleared');
    } catch (error: any) {
      logger.error({ error }, 'Failed to clear analytics data');
    }
  }
}

export default CacheAnalytics;