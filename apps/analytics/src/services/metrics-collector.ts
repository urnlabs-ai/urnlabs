import { Redis } from 'ioredis';
import { PrismaClient } from '@prisma/client';
import { 
  PerformanceMetric, 
  AgentPerformanceMetric, 
  BusinessMetric, 
  MetricType,
  TimeSeriesData,
  MetricQuery,
  QueryResult
} from '../types/metrics.js';
import { Logger } from '../utils/logger.js';

export class MetricsCollector {
  private redis: Redis;
  private prisma: PrismaClient;
  private logger: Logger;
  private metricsBuffer: Map<string, PerformanceMetric[]> = new Map();
  private bufferFlushInterval: NodeJS.Timeout;

  constructor(redis: Redis, prisma: PrismaClient, logger: Logger) {
    this.redis = redis;
    this.prisma = prisma;
    this.logger = logger;
    
    // Flush metrics buffer every 10 seconds
    this.bufferFlushInterval = setInterval(() => {
      this.flushMetricsBuffer().catch(error => {
        this.logger.error('Failed to flush metrics buffer', { error });
      });
    }, 10000);
  }

  /**
   * Record a performance metric
   */
  async recordMetric(metric: Omit<PerformanceMetric, 'id' | 'timestamp'>): Promise<void> {
    const fullMetric: PerformanceMetric = {
      id: this.generateMetricId(),
      timestamp: new Date(),
      ...metric
    };

    // Add to buffer for batch processing
    const bufferKey = `${metric.service}:${metric.metric_type}`;
    if (!this.metricsBuffer.has(bufferKey)) {
      this.metricsBuffer.set(bufferKey, []);
    }
    this.metricsBuffer.get(bufferKey)!.push(fullMetric);

    // Also store in Redis for real-time access
    await this.storeInRedis(fullMetric);

    this.logger.debug('Metric recorded', { 
      service: metric.service, 
      type: metric.metric_type, 
      value: metric.value 
    });
  }

  /**
   * Record agent-specific performance metric
   */
  async recordAgentMetric(metric: Omit<AgentPerformanceMetric, 'id' | 'timestamp'>): Promise<void> {
    const fullMetric: AgentPerformanceMetric = {
      id: this.generateMetricId(),
      timestamp: new Date(),
      ...metric
    };

    // Store agent metrics separately for specialized queries
    await this.redis.zadd(
      `agent:metrics:${metric.agent_id}`,
      Date.now(),
      JSON.stringify(fullMetric)
    );

    // Also record as general performance metric
    await this.recordMetric(fullMetric);

    this.logger.info('Agent metric recorded', {
      agent_id: metric.agent_id,
      success: metric.success,
      execution_time_ms: metric.execution_time_ms,
      cost_cents: metric.cost_cents
    });
  }

  /**
   * Record business metric
   */
  async recordBusinessMetric(metric: Omit<BusinessMetric, 'id' | 'timestamp'>): Promise<void> {
    const fullMetric: BusinessMetric = {
      id: this.generateMetricId(),
      timestamp: new Date(),
      ...metric
    };

    // Store in database immediately for business metrics
    await this.prisma.businessMetric.create({
      data: {
        id: fullMetric.id,
        timestamp: fullMetric.timestamp,
        metric_name: fullMetric.metric_name,
        value: fullMetric.value,
        dimension: fullMetric.dimension,
        business_unit: fullMetric.business_unit,
        revenue_impact_cents: fullMetric.revenue_impact_cents,
        cost_savings_cents: fullMetric.cost_savings_cents
      }
    });

    this.logger.info('Business metric recorded', {
      metric_name: metric.metric_name,
      value: metric.value,
      revenue_impact_cents: metric.revenue_impact_cents
    });
  }

  /**
   * Query metrics with time range and filters
   */
  async queryMetrics(query: MetricQuery): Promise<QueryResult> {
    const startTime = Date.now();
    
    try {
      // Check Redis cache first
      const cacheKey = this.getCacheKey(query);
      const cached = await this.redis.get(cacheKey);
      
      if (cached) {
        const data = JSON.parse(cached);
        return {
          data: data.map((item: any) => ({
            ...item,
            timestamp: new Date(item.timestamp)
          })),
          metadata: {
            total_points: data.length,
            query_time_ms: Date.now() - startTime,
            cache_hit: true
          }
        };
      }

      // Query from database
      const data = await this.executeQuery(query);
      
      // Cache result for 5 minutes
      await this.redis.setex(cacheKey, 300, JSON.stringify(data));

      return {
        data,
        metadata: {
          total_points: data.length,
          query_time_ms: Date.now() - startTime,
          cache_hit: false
        }
      };
    } catch (error) {
      this.logger.error('Failed to query metrics', { error, query });
      throw error;
    }
  }

  /**
   * Get real-time metrics for a service
   */
  async getRealTimeMetrics(service: string, metricType?: MetricType): Promise<PerformanceMetric[]> {
    const pattern = metricType 
      ? `metrics:${service}:${metricType}:*`
      : `metrics:${service}:*`;
    
    const keys = await this.redis.keys(pattern);
    const metrics: PerformanceMetric[] = [];

    for (const key of keys) {
      const data = await this.redis.get(key);
      if (data) {
        const metric = JSON.parse(data);
        metric.timestamp = new Date(metric.timestamp);
        metrics.push(metric);
      }
    }

    return metrics.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  /**
   * Get agent performance summary
   */
  async getAgentPerformanceSummary(agentId: string, hours: number = 24): Promise<{
    total_executions: number;
    success_rate: number;
    avg_execution_time_ms: number;
    total_cost_cents: number;
    avg_cost_per_execution_cents: number;
    tokens_used: number;
  }> {
    const since = Date.now() - (hours * 60 * 60 * 1000);
    
    const metrics = await this.redis.zrangebyscore(
      `agent:metrics:${agentId}`,
      since,
      '+inf'
    );

    if (metrics.length === 0) {
      return {
        total_executions: 0,
        success_rate: 0,
        avg_execution_time_ms: 0,
        total_cost_cents: 0,
        avg_cost_per_execution_cents: 0,
        tokens_used: 0
      };
    }

    const parsed = metrics.map(m => JSON.parse(m) as AgentPerformanceMetric);
    const successful = parsed.filter(m => m.success);

    return {
      total_executions: parsed.length,
      success_rate: successful.length / parsed.length,
      avg_execution_time_ms: parsed.reduce((sum, m) => sum + m.execution_time_ms, 0) / parsed.length,
      total_cost_cents: parsed.reduce((sum, m) => sum + m.cost_cents, 0),
      avg_cost_per_execution_cents: parsed.reduce((sum, m) => sum + m.cost_cents, 0) / parsed.length,
      tokens_used: parsed.reduce((sum, m) => sum + (m.tokens_used || 0), 0)
    };
  }

  /**
   * Clean up old metrics
   */
  async cleanup(olderThanDays: number = 30): Promise<void> {
    const cutoffDate = new Date(Date.now() - (olderThanDays * 24 * 60 * 60 * 1000));
    
    // Clean up database
    await this.prisma.performanceMetric.deleteMany({
      where: {
        timestamp: {
          lt: cutoffDate
        }
      }
    });

    // Clean up Redis
    const keys = await this.redis.keys('metrics:*');
    for (const key of keys) {
      const data = await this.redis.get(key);
      if (data) {
        const metric = JSON.parse(data);
        if (new Date(metric.timestamp) < cutoffDate) {
          await this.redis.del(key);
        }
      }
    }

    this.logger.info('Metrics cleanup completed', { 
      cutoff_date: cutoffDate,
      older_than_days: olderThanDays 
    });
  }

  /**
   * Flush metrics buffer to database
   */
  private async flushMetricsBuffer(): Promise<void> {
    if (this.metricsBuffer.size === 0) {
      return;
    }

    const allMetrics: PerformanceMetric[] = [];
    for (const metrics of this.metricsBuffer.values()) {
      allMetrics.push(...metrics);
    }

    if (allMetrics.length === 0) {
      return;
    }

    try {
      // Batch insert to database
      await this.prisma.performanceMetric.createMany({
        data: allMetrics.map(metric => ({
          id: metric.id,
          timestamp: metric.timestamp,
          service: metric.service,
          endpoint: metric.endpoint,
          metric_type: metric.metric_type,
          value: metric.value,
          unit: metric.unit,
          tags: metric.tags,
          metadata: metric.metadata
        }))
      });

      this.logger.debug('Flushed metrics to database', { count: allMetrics.length });
      
      // Clear buffer
      this.metricsBuffer.clear();
    } catch (error) {
      this.logger.error('Failed to flush metrics buffer', { error, count: allMetrics.length });
    }
  }

  /**
   * Store metric in Redis for real-time access
   */
  private async storeInRedis(metric: PerformanceMetric): Promise<void> {
    const key = `metrics:${metric.service}:${metric.metric_type}:${metric.id}`;
    
    // Store with 1 hour TTL for real-time metrics
    await this.redis.setex(key, 3600, JSON.stringify(metric));
    
    // Add to time-series sorted set
    const tsKey = `ts:${metric.service}:${metric.metric_type}`;
    await this.redis.zadd(tsKey, metric.timestamp.getTime(), JSON.stringify({
      timestamp: metric.timestamp,
      value: metric.value,
      metadata: { id: metric.id, tags: metric.tags }
    }));
    
    // Keep only last 24 hours in time-series
    const dayAgo = Date.now() - (24 * 60 * 60 * 1000);
    await this.redis.zremrangebyscore(tsKey, 0, dayAgo);
  }

  /**
   * Execute metric query against database
   */
  private async executeQuery(query: MetricQuery): Promise<TimeSeriesData[]> {
    // This would be implemented based on your database schema
    // For now, return mock data structure
    const data: TimeSeriesData[] = [];
    
    // Implementation would depend on specific database schema and query requirements
    // This is a placeholder for the actual query implementation
    
    return data;
  }

  /**
   * Generate cache key for query
   */
  private getCacheKey(query: MetricQuery): string {
    return `query:${Buffer.from(JSON.stringify(query)).toString('base64')}`;
  }

  /**
   * Generate unique metric ID
   */
  private generateMetricId(): string {
    return `metric_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    if (this.bufferFlushInterval) {
      clearInterval(this.bufferFlushInterval);
    }
  }
}