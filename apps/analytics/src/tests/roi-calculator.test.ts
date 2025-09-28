import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Redis } from 'ioredis';
import { PrismaClient } from '@prisma/client';
import { ROICalculator } from '../services/roi-calculator.js';
import { Logger } from '../utils/logger.js';

vi.mock('ioredis');
vi.mock('@prisma/client');
vi.mock('../utils/logger.js');

describe('ROICalculator', () => {
  let roiCalculator: ROICalculator;
  let mockRedis: vi.Mocked<Redis>;
  let mockPrisma: vi.Mocked<PrismaClient>;
  let mockLogger: vi.Mocked<Logger>;

  const mockConfig = {
    average_hourly_rate_cents: 5000,
    senior_hourly_rate_cents: 8000,
    junior_hourly_rate_cents: 3000,
    server_cost_per_hour_cents: 10,
    ai_api_cost_multiplier: 1.2,
    discount_rate: 0.1,
    tax_rate: 0.25
  };

  beforeEach(() => {
    mockRedis = {
      get: vi.fn(),
      setex: vi.fn()
    } as any;

    mockPrisma = {
      performanceMetric: {
        findMany: vi.fn()
      },
      businessMetric: {
        findMany: vi.fn()
      },
      roiCalculation: {
        create: vi.fn()
      }
    } as any;

    mockLogger = {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn()
    } as any;

    roiCalculator = new ROICalculator(mockPrisma, mockRedis, mockLogger, mockConfig);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('calculateROI', () => {
    it('should calculate ROI with positive returns', async () => {
      const periodStart = new Date('2024-01-01');
      const periodEnd = new Date('2024-01-31');

      // Mock agent costs
      mockPrisma.performanceMetric.findMany.mockResolvedValue([
        {
          id: '1',
          timestamp: new Date('2024-01-15'),
          service: 'agents',
          metric_type: 'timer',
          value: 1000,
          unit: 'ms',
          tags: { agent_id: 'agent-1' },
          metadata: { cost_cents: 100 }
        }
      ]);

      // Mock business metrics for automation savings
      mockPrisma.businessMetric.findMany.mockResolvedValue([
        {
          id: '1',
          timestamp: new Date('2024-01-15'),
          metric_name: 'automation_task_hours_saved',
          value: 10, // 10 hours saved
          dimension: { skill_level: 'average' },
          business_unit: 'operations',
          revenue_impact_cents: null,
          cost_savings_cents: 50000 // $500 in savings
        }
      ]);

      const result = await roiCalculator.calculateROI(periodStart, periodEnd);

      expect(result.period_start).toEqual(periodStart);
      expect(result.period_end).toEqual(periodEnd);
      expect(result.total_cost_cents).toBeGreaterThan(0);
      expect(result.cost_savings_cents).toBeGreaterThan(0);
      expect(result.roi_percent).toBeGreaterThan(0);
      expect(mockPrisma.roiCalculation.create).toHaveBeenCalled();
    });

    it('should handle zero costs scenario', async () => {
      const periodStart = new Date('2024-01-01');
      const periodEnd = new Date('2024-01-31');

      mockPrisma.performanceMetric.findMany.mockResolvedValue([]);
      mockPrisma.businessMetric.findMany.mockResolvedValue([]);

      const result = await roiCalculator.calculateROI(periodStart, periodEnd);

      expect(result.total_cost_cents).toBe(0);
      expect(result.roi_percent).toBe(0);
      expect(result.payback_period_days).toBe(Infinity);
    });

    it('should calculate breakdown correctly', async () => {
      const periodStart = new Date('2024-01-01');
      const periodEnd = new Date('2024-01-31');

      // Mock multiple agent metrics
      mockPrisma.performanceMetric.findMany.mockResolvedValue([
        {
          id: '1',
          timestamp: new Date('2024-01-15'),
          service: 'agents',
          metric_type: 'timer',
          value: 1000,
          unit: 'ms',
          tags: { agent_id: 'agent-1' },
          metadata: { cost_cents: 100 }
        },
        {
          id: '2',
          timestamp: new Date('2024-01-16'),
          service: 'agents',
          metric_type: 'timer',
          value: 1500,
          unit: 'ms',
          tags: { agent_id: 'agent-2' },
          metadata: { cost_cents: 150 }
        }
      ]);

      mockPrisma.businessMetric.findMany.mockResolvedValue([
        {
          id: '1',
          timestamp: new Date('2024-01-15'),
          metric_name: 'automation_task_hours_saved',
          value: 5,
          dimension: { skill_level: 'senior' },
          business_unit: 'engineering',
          revenue_impact_cents: null,
          cost_savings_cents: 40000
        }
      ]);

      const result = await roiCalculator.calculateROI(periodStart, periodEnd);

      expect(result.breakdown.agent_costs).toHaveProperty('agent-1');
      expect(result.breakdown.agent_costs).toHaveProperty('agent-2');
      expect(result.breakdown.human_labor_savings).toHaveProperty('total');
      expect(result.breakdown.infrastructure_costs).toHaveProperty('total');
    });
  });

  describe('calculatePaybackPeriod', () => {
    it('should calculate finite payback period with positive benefits', async () => {
      const periodStart = new Date('2024-01-01');
      const periodEnd = new Date('2024-01-31');
      const totalCost = 10000; // $100

      // Mock business metrics showing daily benefits
      mockPrisma.businessMetric.findMany.mockResolvedValue([
        {
          id: '1',
          timestamp: new Date('2024-01-15'),
          metric_name: 'daily_automation_savings',
          value: 2,
          dimension: { skill_level: 'average' },
          business_unit: 'operations',
          revenue_impact_cents: null,
          cost_savings_cents: 1000 // $10 per day
        }
      ]);

      const paybackPeriod = await (roiCalculator as any).calculatePaybackPeriod(
        periodStart,
        periodEnd,
        totalCost
      );

      expect(paybackPeriod).toBeGreaterThan(0);
      expect(paybackPeriod).toBeLessThan(Infinity);
    });

    it('should return Infinity for zero benefits', async () => {
      const periodStart = new Date('2024-01-01');
      const periodEnd = new Date('2024-01-31');
      const totalCost = 10000;

      mockPrisma.businessMetric.findMany.mockResolvedValue([]);

      const paybackPeriod = await (roiCalculator as any).calculatePaybackPeriod(
        periodStart,
        periodEnd,
        totalCost
      );

      expect(paybackPeriod).toBe(Infinity);
    });
  });

  describe('calculateNetPresentValue', () => {
    it('should calculate NPV with discount rate', () => {
      const breakdown = {
        agent_costs: { total: 5000 },
        infrastructure_costs: { total: 2000 },
        human_labor_savings: { total: 10000 },
        revenue_generation: { total: 5000 },
        efficiency_improvements: { total: 0 }
      };

      const periodStart = new Date('2024-01-01');
      const periodEnd = new Date('2024-12-31'); // 1 year

      const npv = (roiCalculator as any).calculateNetPresentValue(
        breakdown,
        periodStart,
        periodEnd
      );

      expect(npv).toBeGreaterThan(0); // Positive NPV with good returns
    });
  });

  describe('infrastructure cost calculations', () => {
    it('should calculate server costs based on time period', async () => {
      const periodStart = new Date('2024-01-01T00:00:00Z');
      const periodEnd = new Date('2024-01-01T24:00:00Z'); // 24 hours

      const costs = await (roiCalculator as any).calculateInfrastructureCosts(
        periodStart,
        periodEnd
      );

      expect(costs.server_costs).toBe(24 * mockConfig.server_cost_per_hour_cents);
      expect(costs.total).toBeGreaterThan(0);
    });

    it('should include AI API costs from metrics', async () => {
      const periodStart = new Date('2024-01-01');
      const periodEnd = new Date('2024-01-02');

      mockPrisma.performanceMetric.findMany.mockResolvedValue([
        {
          id: '1',
          timestamp: new Date('2024-01-01T12:00:00Z'),
          service: 'openai',
          metric_type: 'counter',
          value: 1,
          unit: 'requests',
          tags: {},
          metadata: { cost_cents: 50 }
        }
      ]);

      const costs = await (roiCalculator as any).calculateInfrastructureCosts(
        periodStart,
        periodEnd
      );

      expect(costs.ai_api_costs).toBe(50);
    });
  });

  describe('human labor savings calculations', () => {
    it('should calculate savings based on skill level', async () => {
      const periodStart = new Date('2024-01-01');
      const periodEnd = new Date('2024-01-31');

      mockPrisma.businessMetric.findMany.mockResolvedValue([
        {
          id: '1',
          timestamp: new Date('2024-01-15'),
          metric_name: 'automation_task_hours_saved',
          value: 10,
          dimension: { skill_level: 'senior' },
          business_unit: 'engineering',
          revenue_impact_cents: null,
          cost_savings_cents: null
        },
        {
          id: '2',
          timestamp: new Date('2024-01-16'),
          metric_name: 'automation_workflow_hours_saved',
          value: 5,
          dimension: { skill_level: 'junior' },
          business_unit: 'support',
          revenue_impact_cents: null,
          cost_savings_cents: null
        }
      ]);

      const savings = await (roiCalculator as any).calculateHumanLaborSavings(
        periodStart,
        periodEnd
      );

      // Senior hours should be worth more than junior hours
      expect(savings.task_automation).toBe(10 * mockConfig.senior_hourly_rate_cents);
      expect(savings.workflow_optimization).toBe(5 * mockConfig.junior_hourly_rate_cents);
    });
  });
});