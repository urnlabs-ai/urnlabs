import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Redis } from 'ioredis';
import { PrismaClient } from '@prisma/client';
import { MetricsCollector } from '../services/metrics-collector.js';
import { Logger } from '../utils/logger.js';
import { MetricType } from '../types/metrics.js';

// Mock dependencies
vi.mock('ioredis');
vi.mock('@prisma/client');
vi.mock('../utils/logger.js');

describe('MetricsCollector', () => {
  let metricsCollector: MetricsCollector;
  let mockRedis: vi.Mocked<Redis>;
  let mockPrisma: vi.Mocked<PrismaClient>;
  let mockLogger: vi.Mocked<Logger>;

  beforeEach(() => {
    mockRedis = {
      zadd: vi.fn(),
      setex: vi.fn(),
      get: vi.fn(),
      keys: vi.fn(),
      zrangebyscore: vi.fn(),
      zremrangebyscore: vi.fn(),
      del: vi.fn()
    } as any;

    mockPrisma = {
      performanceMetric: {
        createMany: vi.fn(),
        findMany: vi.fn(),
        deleteMany: vi.fn()
      },
      businessMetric: {
        create: vi.fn(),
        findMany: vi.fn()
      }
    } as any;

    mockLogger = {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn()
    } as any;

    metricsCollector = new MetricsCollector(mockRedis, mockPrisma, mockLogger);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('recordMetric', () => {
    it('should record a performance metric successfully', async () => {
      const metric = {
        service: 'api',
        metric_type: MetricType.TIMER,
        value: 150,
        unit: 'ms',
        tags: { endpoint: '/health' }
      };

      await metricsCollector.recordMetric(metric);

      expect(mockRedis.setex).toHaveBeenCalled();
      expect(mockRedis.zadd).toHaveBeenCalled();
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Metric recorded',
        expect.objectContaining({
          service: 'api',
          type: MetricType.TIMER,
          value: 150
        })
      );
    });

    it('should handle errors gracefully', async () => {
      const metric = {
        service: 'api',
        metric_type: MetricType.TIMER,
        value: 150,
        unit: 'ms',
        tags: {}
      };

      mockRedis.setex.mockRejectedValue(new Error('Redis error'));

      await expect(metricsCollector.recordMetric(metric)).rejects.toThrow('Redis error');
    });
  });

  describe('recordAgentMetric', () => {
    it('should record agent performance metric', async () => {
      const agentMetric = {
        service: 'agents',
        agent_id: 'agent-123',
        metric_type: MetricType.TIMER,
        value: 2500,
        unit: 'ms',
        success: true,
        execution_time_ms: 2500,
        cost_cents: 5,
        tokens_used: 150,
        tags: { workflow_id: 'workflow-456' }
      };

      await metricsCollector.recordAgentMetric(agentMetric);

      expect(mockRedis.zadd).toHaveBeenCalledWith(
        'agent:metrics:agent-123',
        expect.any(Number),
        expect.any(String)
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Agent metric recorded',
        expect.objectContaining({
          agent_id: 'agent-123',
          success: true,
          execution_time_ms: 2500,
          cost_cents: 5
        })
      );
    });
  });

  describe('recordBusinessMetric', () => {
    it('should record business metric in database', async () => {
      const businessMetric = {
        metric_name: 'customer_satisfaction',
        value: 4.8,
        dimension: { category: 'support' },
        revenue_impact_cents: 10000
      };

      await metricsCollector.recordBusinessMetric(businessMetric);

      expect(mockPrisma.businessMetric.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          metric_name: 'customer_satisfaction',
          value: 4.8,
          dimension: { category: 'support' },
          revenue_impact_cents: 10000
        })
      });
    });
  });

  describe('queryMetrics', () => {
    it('should return cached results when available', async () => {
      const query = {
        metric_name: 'api.response_time',
        time_range: {
          start: new Date('2024-01-01'),
          end: new Date('2024-01-02')
        }
      };

      const cachedData = [
        { timestamp: new Date('2024-01-01T12:00:00Z'), value: 150 }
      ];

      mockRedis.get.mockResolvedValue(JSON.stringify(cachedData));

      const result = await metricsCollector.queryMetrics(query);

      expect(result.metadata.cache_hit).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data[0].value).toBe(150);
    });

    it('should query database when cache miss', async () => {
      const query = {
        metric_name: 'api.response_time',
        time_range: {
          start: new Date('2024-01-01'),
          end: new Date('2024-01-02')
        }
      };

      mockRedis.get.mockResolvedValue(null);

      const result = await metricsCollector.queryMetrics(query);

      expect(result.metadata.cache_hit).toBe(false);
      expect(mockRedis.setex).toHaveBeenCalled(); // Cache the result
    });
  });

  describe('getAgentPerformanceSummary', () => {
    it('should calculate agent performance summary', async () => {
      const agentMetrics = [
        '{"success": true, "execution_time_ms": 1000, "cost_cents": 2, "tokens_used": 100}',
        '{"success": true, "execution_time_ms": 1500, "cost_cents": 3, "tokens_used": 150}',
        '{"success": false, "execution_time_ms": 2000, "cost_cents": 4, "tokens_used": 200}'
      ];

      mockRedis.zrangebyscore.mockResolvedValue(agentMetrics);

      const summary = await metricsCollector.getAgentPerformanceSummary('agent-123', 24);

      expect(summary.total_executions).toBe(3);
      expect(summary.success_rate).toBeCloseTo(0.667, 2);
      expect(summary.avg_execution_time_ms).toBeCloseTo(1500, 0);
      expect(summary.total_cost_cents).toBe(9);
      expect(summary.tokens_used).toBe(450);
    });

    it('should handle empty metrics gracefully', async () => {
      mockRedis.zrangebyscore.mockResolvedValue([]);

      const summary = await metricsCollector.getAgentPerformanceSummary('agent-123', 24);

      expect(summary.total_executions).toBe(0);
      expect(summary.success_rate).toBe(0);
      expect(summary.avg_execution_time_ms).toBe(0);
      expect(summary.total_cost_cents).toBe(0);
      expect(summary.tokens_used).toBe(0);
    });
  });

  describe('cleanup', () => {
    it('should remove old metrics from database and Redis', async () => {
      const olderThanDays = 30;
      const cutoffDate = new Date(Date.now() - (olderThanDays * 24 * 60 * 60 * 1000));

      mockRedis.keys.mockResolvedValue(['metrics:api:timer:123', 'metrics:agents:counter:456']);
      mockRedis.get
        .mockResolvedValueOnce(JSON.stringify({ timestamp: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000) }))
        .mockResolvedValueOnce(JSON.stringify({ timestamp: new Date() }));

      await metricsCollector.cleanup(olderThanDays);

      expect(mockPrisma.performanceMetric.deleteMany).toHaveBeenCalledWith({
        where: {
          timestamp: { lt: expect.any(Date) }
        }
      });
      expect(mockRedis.del).toHaveBeenCalledWith('metrics:api:timer:123');
      expect(mockRedis.del).not.toHaveBeenCalledWith('metrics:agents:counter:456');
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Metrics cleanup completed',
        expect.objectContaining({
          older_than_days: olderThanDays
        })
      );
    });
  });
});