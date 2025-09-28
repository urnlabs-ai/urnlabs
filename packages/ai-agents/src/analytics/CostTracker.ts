/**
 * Cost Tracking System
 *
 * Provides comprehensive cost attribution and tracking for AI agents, workflows,
 * and infrastructure resources with real-time monitoring and historical analysis.
 */

import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import { EventEmitter } from 'events';

export interface CostAllocation {
  agentId?: string;
  workflowId?: string;
  workflowRunId?: string;
  organizationId: string;
  costType: CostType;
  category: CostCategory;
  amount: number;
  currency: string;
  unit: string;
  quantity: number;
  timestamp: Date;
  metadata?: Record<string, any>;
}

export interface ResourceCost {
  resourceType: ResourceType;
  resourceId: string;
  costPerUnit: number;
  unitType: string;
  usageMetrics: ResourceUsageMetrics;
  totalCost: number;
  billingPeriod: BillingPeriod;
}

export interface ResourceUsageMetrics {
  computeTime?: number; // milliseconds
  memoryUsage?: number; // MB-seconds
  storageUsage?: number; // GB-hours
  networkUsage?: number; // GB
  apiCalls?: number; // count
  tokens?: number; // AI model tokens
}

export interface CostBreakdown {
  totalCost: number;
  currency: string;
  period: BillingPeriod;
  breakdown: {
    agents: CostSummary;
    workflows: CostSummary;
    infrastructure: CostSummary;
    external: CostSummary;
  };
  topCostDrivers: CostDriver[];
  trends: CostTrend[];
}

export interface CostSummary {
  amount: number;
  percentage: number;
  change: number; // percentage change from previous period
  items: CostItem[];
}

export interface CostItem {
  id: string;
  name: string;
  cost: number;
  usage: number;
  efficiency: number; // cost per unit of output
}

export interface CostDriver {
  resource: string;
  cost: number;
  impact: number; // percentage of total cost
  trend: 'increasing' | 'decreasing' | 'stable';
  optimization?: string; // suggested optimization
}

export interface CostTrend {
  date: Date;
  amount: number;
  category: CostCategory;
}

export interface BillingPeriod {
  start: Date;
  end: Date;
  type: 'hourly' | 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly';
}

export interface CostThreshold {
  id: string;
  name: string;
  type: ThresholdType;
  value: number;
  period: BillingPeriod;
  conditions: Record<string, any>;
  alertChannels: string[];
  isActive: boolean;
}

export interface CostAlert {
  id: string;
  thresholdId: string;
  type: 'warning' | 'critical' | 'budget_exceeded';
  message: string;
  currentValue: number;
  thresholdValue: number;
  timestamp: Date;
  metadata: Record<string, any>;
}

export interface CostOptimization {
  id: string;
  type: OptimizationType;
  description: string;
  potentialSavings: number;
  implementationEffort: 'low' | 'medium' | 'high';
  priority: 'low' | 'medium' | 'high' | 'critical';
  category: CostCategory;
  actionItems: string[];
  estimatedImpact: {
    costReduction: number;
    performanceImpact: number;
    implementationTime: number;
  };
}

export enum CostType {
  COMPUTE = 'compute',
  STORAGE = 'storage',
  NETWORK = 'network',
  AI_MODEL = 'ai_model',
  EXTERNAL_API = 'external_api',
  INFRASTRUCTURE = 'infrastructure',
  LICENSING = 'licensing',
  OPERATIONAL = 'operational'
}

export enum CostCategory {
  DIRECT = 'direct', // Directly attributable to agent/workflow
  INDIRECT = 'indirect', // Shared infrastructure costs
  OVERHEAD = 'overhead', // Administrative and management costs
  EXTERNAL = 'external' // Third-party services
}

export enum ResourceType {
  CPU = 'cpu',
  MEMORY = 'memory',
  STORAGE = 'storage',
  NETWORK = 'network',
  DATABASE = 'database',
  CACHE = 'cache',
  AI_MODEL = 'ai_model',
  API_GATEWAY = 'api_gateway'
}

export enum ThresholdType {
  ABSOLUTE = 'absolute', // Fixed amount
  PERCENTAGE = 'percentage', // Percentage of budget
  RATE = 'rate' // Cost per unit time
}

export enum OptimizationType {
  RESOURCE_SCALING = 'resource_scaling',
  CACHE_OPTIMIZATION = 'cache_optimization',
  BATCH_PROCESSING = 'batch_processing',
  MODEL_OPTIMIZATION = 'model_optimization',
  WORKFLOW_OPTIMIZATION = 'workflow_optimization',
  INFRASTRUCTURE_RIGHTSIZING = 'infrastructure_rightsizing'
}

export class CostTracker extends EventEmitter {
  private redis: Redis;
  private prisma: PrismaClient;
  private costingRules: Map<string, any> = new Map();
  private thresholds: Map<string, CostThreshold> = new Map();
  private trackingInterval: NodeJS.Timeout | null = null;

  constructor(
    private config: {
      redis: Redis;
      prisma: PrismaClient;
      costingRules?: Record<string, any>;
      trackingIntervalMs?: number;
      defaultCurrency?: string;
    }
  ) {
    super();
    this.redis = config.redis;
    this.prisma = config.prisma;
    this.loadCostingRules(config.costingRules || {});
    this.initializeTracking();
  }

  /**
   * Initialize cost tracking system
   */
  private async initializeTracking(): Promise<void> {
    // Load existing thresholds
    await this.loadThresholds();

    // Start periodic cost tracking
    const interval = this.config.trackingIntervalMs || 60000; // 1 minute
    this.trackingInterval = setInterval(async () => {
      try {
        await this.collectResourceUsage();
        await this.evaluateThresholds();
      } catch (error) {
        this.emit('error', error);
      }
    }, interval);

    this.emit('initialized');
  }

  /**
   * Track cost allocation for specific resource usage
   */
  async trackCost(allocation: CostAllocation): Promise<void> {
    try {
      // Store cost allocation in Redis for real-time aggregation
      const key = this.getCostKey(allocation.organizationId, allocation.timestamp);
      await this.redis.zadd(key, allocation.timestamp.getTime(), JSON.stringify(allocation));

      // Set expiration for cleanup (30 days)
      await this.redis.expire(key, 30 * 24 * 60 * 60);

      // Store in time-series for analytics
      const timeSeriesKey = `cost_timeseries:${allocation.organizationId}:${allocation.costType}`;
      await this.redis.zadd(timeSeriesKey, allocation.timestamp.getTime(), allocation.amount);

      // Update real-time aggregations
      await this.updateAggregations(allocation);

      // Emit event for real-time monitoring
      this.emit('costTracked', allocation);

      // Check thresholds
      await this.checkCostThresholds(allocation);

    } catch (error) {
      this.emit('error', new Error(`Failed to track cost: ${error.message}`));
    }
  }

  /**
   * Track resource usage and calculate costs
   */
  async trackResourceUsage(
    resourceType: ResourceType,
    resourceId: string,
    usage: ResourceUsageMetrics,
    context: {
      agentId?: string;
      workflowId?: string;
      workflowRunId?: string;
      organizationId: string;
    }
  ): Promise<number> {
    try {
      const costRule = this.costingRules.get(resourceType) || this.getDefaultCostRule(resourceType);
      const cost = this.calculateResourceCost(resourceType, usage, costRule);

      const allocation: CostAllocation = {
        ...context,
        costType: this.mapResourceTypeToCostType(resourceType),
        category: CostCategory.DIRECT,
        amount: cost,
        currency: this.config.defaultCurrency || 'USD',
        unit: costRule.unit,
        quantity: this.getUsageQuantity(resourceType, usage),
        timestamp: new Date(),
        metadata: {
          resourceType,
          resourceId,
          usage,
          costRule: costRule.name
        }
      };

      await this.trackCost(allocation);
      return cost;

    } catch (error) {
      this.emit('error', new Error(`Failed to track resource usage: ${error.message}`));
      return 0;
    }
  }

  /**
   * Get cost breakdown for organization and period
   */
  async getCostBreakdown(
    organizationId: string,
    period: BillingPeriod
  ): Promise<CostBreakdown> {
    try {
      const startTime = period.start.getTime();
      const endTime = period.end.getTime();

      // Get all cost allocations for the period
      const allocations = await this.getCostAllocations(organizationId, period);

      // Calculate totals and breakdowns
      const totalCost = allocations.reduce((sum, allocation) => sum + allocation.amount, 0);

      const breakdown = this.calculateCostBreakdown(allocations);
      const topCostDrivers = await this.getTopCostDrivers(organizationId, period);
      const trends = await this.getCostTrends(organizationId, period);

      return {
        totalCost,
        currency: this.config.defaultCurrency || 'USD',
        period,
        breakdown,
        topCostDrivers,
        trends
      };

    } catch (error) {
      this.emit('error', new Error(`Failed to get cost breakdown: ${error.message}`));
      throw error;
    }
  }

  /**
   * Get real-time cost metrics
   */
  async getRealTimeCosts(organizationId: string): Promise<{
    currentCosts: Record<string, number>;
    hourlyRate: number;
    dailyProjection: number;
    monthlyProjection: number;
    alerts: CostAlert[];
  }> {
    try {
      const now = new Date();
      const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      // Get current hour costs
      const currentHourCosts = await this.getCostSummary(organizationId, {
        start: hourAgo,
        end: now,
        type: 'hourly'
      });

      // Calculate hourly rate
      const hourlyRate = currentHourCosts.total;

      // Project daily and monthly costs
      const dailyProjection = hourlyRate * 24;
      const monthlyProjection = dailyProjection * 30;

      // Get current costs by category
      const currentCosts = await this.getCurrentCostsByCategory(organizationId);

      // Get active alerts
      const alerts = await this.getActiveAlerts(organizationId);

      return {
        currentCosts,
        hourlyRate,
        dailyProjection,
        monthlyProjection,
        alerts
      };

    } catch (error) {
      this.emit('error', new Error(`Failed to get real-time costs: ${error.message}`));
      throw error;
    }
  }

  /**
   * Identify cost optimization opportunities
   */
  async identifyOptimizations(
    organizationId: string,
    period: BillingPeriod
  ): Promise<CostOptimization[]> {
    try {
      const optimizations: CostOptimization[] = [];
      const breakdown = await this.getCostBreakdown(organizationId, period);

      // Analyze compute costs
      optimizations.push(...await this.analyzeComputeOptimizations(organizationId, period));

      // Analyze workflow efficiency
      optimizations.push(...await this.analyzeWorkflowOptimizations(organizationId, period));

      // Analyze AI model usage
      optimizations.push(...await this.analyzeModelOptimizations(organizationId, period));

      // Analyze infrastructure utilization
      optimizations.push(...await this.analyzeInfrastructureOptimizations(organizationId, period));

      // Sort by potential savings
      return optimizations.sort((a, b) => b.potentialSavings - a.potentialSavings);

    } catch (error) {
      this.emit('error', new Error(`Failed to identify optimizations: ${error.message}`));
      throw error;
    }
  }

  /**
   * Set cost threshold
   */
  async setThreshold(threshold: CostThreshold): Promise<void> {
    try {
      this.thresholds.set(threshold.id, threshold);

      // Store in Redis for persistence
      const key = `cost_threshold:${threshold.id}`;
      await this.redis.setex(key, 86400, JSON.stringify(threshold)); // 24 hours

      this.emit('thresholdSet', threshold);

    } catch (error) {
      this.emit('error', new Error(`Failed to set threshold: ${error.message}`));
    }
  }

  /**
   * Load costing rules for different resources
   */
  private loadCostingRules(rules: Record<string, any>): void {
    // Default costing rules
    const defaultRules = {
      [ResourceType.CPU]: {
        name: 'CPU Hours',
        unit: 'cpu-hour',
        costPerUnit: 0.05, // $0.05 per CPU hour
        billing: 'hourly'
      },
      [ResourceType.MEMORY]: {
        name: 'Memory Usage',
        unit: 'gb-hour',
        costPerUnit: 0.01, // $0.01 per GB hour
        billing: 'hourly'
      },
      [ResourceType.STORAGE]: {
        name: 'Storage',
        unit: 'gb-month',
        costPerUnit: 0.10, // $0.10 per GB month
        billing: 'monthly'
      },
      [ResourceType.NETWORK]: {
        name: 'Network Transfer',
        unit: 'gb',
        costPerUnit: 0.09, // $0.09 per GB
        billing: 'usage'
      },
      [ResourceType.AI_MODEL]: {
        name: 'AI Model Tokens',
        unit: 'token',
        costPerUnit: 0.0001, // $0.0001 per token
        billing: 'usage'
      }
    };

    // Merge with custom rules
    Object.entries({ ...defaultRules, ...rules }).forEach(([type, rule]) => {
      this.costingRules.set(type, rule);
    });
  }

  /**
   * Calculate cost for resource usage
   */
  private calculateResourceCost(
    resourceType: ResourceType,
    usage: ResourceUsageMetrics,
    costRule: any
  ): number {
    switch (resourceType) {
      case ResourceType.CPU:
        return (usage.computeTime || 0) / (1000 * 60 * 60) * costRule.costPerUnit; // ms to hours

      case ResourceType.MEMORY:
        return (usage.memoryUsage || 0) / (1024 * 60 * 60) * costRule.costPerUnit; // MB-seconds to GB-hours

      case ResourceType.STORAGE:
        return (usage.storageUsage || 0) * costRule.costPerUnit; // GB-hours

      case ResourceType.NETWORK:
        return (usage.networkUsage || 0) * costRule.costPerUnit; // GB

      case ResourceType.AI_MODEL:
        return (usage.tokens || 0) * costRule.costPerUnit; // tokens

      default:
        return 0;
    }
  }

  /**
   * Collect current resource usage metrics
   */
  private async collectResourceUsage(): Promise<void> {
    try {
      // This would integrate with system monitoring
      // For now, we'll collect from performance metrics
      const metrics = await this.prisma.performanceMetric.findMany({
        where: {
          timestamp: {
            gte: new Date(Date.now() - 60000) // Last minute
          }
        }
      });

      // Process and convert metrics to cost allocations
      for (const metric of metrics) {
        if (metric.organizationId) {
          const usage = this.convertMetricToUsage(metric);
          if (usage) {
            await this.trackResourceUsage(
              this.getResourceTypeFromMetric(metric),
              metric.id,
              usage,
              {
                organizationId: metric.organizationId,
                agentId: metric.agentId || undefined,
                workflowId: metric.workflowId || undefined
              }
            );
          }
        }
      }

    } catch (error) {
      this.emit('error', new Error(`Failed to collect resource usage: ${error.message}`));
    }
  }

  /**
   * Helper methods
   */
  private getCostKey(organizationId: string, timestamp: Date): string {
    const date = timestamp.toISOString().split('T')[0];
    return `costs:${organizationId}:${date}`;
  }

  private mapResourceTypeToCostType(resourceType: ResourceType): CostType {
    switch (resourceType) {
      case ResourceType.CPU:
      case ResourceType.MEMORY:
        return CostType.COMPUTE;
      case ResourceType.STORAGE:
        return CostType.STORAGE;
      case ResourceType.NETWORK:
        return CostType.NETWORK;
      case ResourceType.AI_MODEL:
        return CostType.AI_MODEL;
      default:
        return CostType.INFRASTRUCTURE;
    }
  }

  private getDefaultCostRule(resourceType: ResourceType): any {
    return this.costingRules.get(resourceType) || {
      name: 'Default',
      unit: 'unit',
      costPerUnit: 0.01,
      billing: 'usage'
    };
  }

  private getUsageQuantity(resourceType: ResourceType, usage: ResourceUsageMetrics): number {
    switch (resourceType) {
      case ResourceType.CPU:
        return usage.computeTime || 0;
      case ResourceType.MEMORY:
        return usage.memoryUsage || 0;
      case ResourceType.STORAGE:
        return usage.storageUsage || 0;
      case ResourceType.NETWORK:
        return usage.networkUsage || 0;
      case ResourceType.AI_MODEL:
        return usage.tokens || 0;
      default:
        return 1;
    }
  }

  // Additional helper methods would be implemented here...
  private async getCostAllocations(organizationId: string, period: BillingPeriod): Promise<CostAllocation[]> {
    // Implementation for fetching cost allocations from Redis
    return [];
  }

  private calculateCostBreakdown(allocations: CostAllocation[]): any {
    // Implementation for calculating breakdown
    return {
      agents: { amount: 0, percentage: 0, change: 0, items: [] },
      workflows: { amount: 0, percentage: 0, change: 0, items: [] },
      infrastructure: { amount: 0, percentage: 0, change: 0, items: [] },
      external: { amount: 0, percentage: 0, change: 0, items: [] }
    };
  }

  // ... other helper methods would be implemented here

  /**
   * Cleanup resources
   */
  async destroy(): Promise<void> {
    if (this.trackingInterval) {
      clearInterval(this.trackingInterval);
    }
    this.removeAllListeners();
  }

  // Placeholder implementations for referenced methods
  private async loadThresholds(): Promise<void> {}
  private async updateAggregations(allocation: CostAllocation): Promise<void> {}
  private async checkCostThresholds(allocation: CostAllocation): Promise<void> {}
  private async evaluateThresholds(): Promise<void> {}
  private async getTopCostDrivers(organizationId: string, period: BillingPeriod): Promise<CostDriver[]> { return []; }
  private async getCostTrends(organizationId: string, period: BillingPeriod): Promise<CostTrend[]> { return []; }
  private async getCostSummary(organizationId: string, period: BillingPeriod): Promise<any> { return { total: 0 }; }
  private async getCurrentCostsByCategory(organizationId: string): Promise<Record<string, number>> { return {}; }
  private async getActiveAlerts(organizationId: string): Promise<CostAlert[]> { return []; }
  private async analyzeComputeOptimizations(organizationId: string, period: BillingPeriod): Promise<CostOptimization[]> { return []; }
  private async analyzeWorkflowOptimizations(organizationId: string, period: BillingPeriod): Promise<CostOptimization[]> { return []; }
  private async analyzeModelOptimizations(organizationId: string, period: BillingPeriod): Promise<CostOptimization[]> { return []; }
  private async analyzeInfrastructureOptimizations(organizationId: string, period: BillingPeriod): Promise<CostOptimization[]> { return []; }
  private convertMetricToUsage(metric: any): ResourceUsageMetrics | null { return null; }
  private getResourceTypeFromMetric(metric: any): ResourceType { return ResourceType.CPU; }
}

export default CostTracker;