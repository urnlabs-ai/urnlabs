import { PrismaClient } from '@prisma/client';
import { Redis } from 'ioredis';
import { 
  ROICalculation, 
  ROIBreakdown, 
  BusinessMetric, 
  AgentPerformanceMetric 
} from '../types/metrics.js';
import { Logger } from '../utils/logger.js';

export interface ROIConfig {
  // Hourly rates for calculating human labor savings
  average_hourly_rate_cents: number;
  senior_hourly_rate_cents: number;
  junior_hourly_rate_cents: number;
  
  // Infrastructure cost factors
  server_cost_per_hour_cents: number;
  ai_api_cost_multiplier: number;
  
  // Financial parameters
  discount_rate: number;
  tax_rate: number;
}

export class ROICalculator {
  private prisma: PrismaClient;
  private redis: Redis;
  private logger: Logger;
  private config: ROIConfig;

  constructor(
    prisma: PrismaClient, 
    redis: Redis, 
    logger: Logger,
    config: ROIConfig
  ) {
    this.prisma = prisma;
    this.redis = redis;
    this.logger = logger;
    this.config = config;
  }

  /**
   * Calculate ROI for a specific time period
   */
  async calculateROI(
    periodStart: Date, 
    periodEnd: Date,
    includeProjections: boolean = false
  ): Promise<ROICalculation> {
    this.logger.info('Starting ROI calculation', { 
      period_start: periodStart, 
      period_end: periodEnd,
      include_projections: includeProjections
    });

    const breakdown = await this.calculateROIBreakdown(periodStart, periodEnd);
    
    const totalCostCents = this.calculateTotalCosts(breakdown);
    const totalBenefitsCents = this.calculateTotalBenefits(breakdown);
    const roiPercent = totalCostCents > 0 ? 
      ((totalBenefitsCents - totalCostCents) / totalCostCents) * 100 : 0;
    
    const paybackPeriodDays = await this.calculatePaybackPeriod(
      periodStart, 
      periodEnd, 
      totalCostCents
    );

    const npvCents = this.calculateNetPresentValue(
      breakdown, 
      periodStart, 
      periodEnd
    );

    const efficiencyGains = await this.calculateEfficiencyGains(
      periodStart, 
      periodEnd
    );

    const roiCalculation: ROICalculation = {
      id: this.generateROIId(),
      period_start: periodStart,
      period_end: periodEnd,
      total_cost_cents: totalCostCents,
      total_revenue_cents: breakdown.revenue_generation.total || 0,
      cost_savings_cents: this.calculateTotalSavings(breakdown),
      efficiency_gains_percent: efficiencyGains,
      roi_percent: roiPercent,
      payback_period_days: paybackPeriodDays,
      net_present_value_cents: npvCents,
      breakdown
    };

    // Store calculation in database
    await this.storeROICalculation(roiCalculation);

    this.logger.info('ROI calculation completed', {
      roi_percent: roiPercent,
      total_cost_cents: totalCostCents,
      payback_period_days: paybackPeriodDays
    });

    return roiCalculation;
  }

  /**
   * Calculate detailed ROI breakdown
   */
  private async calculateROIBreakdown(
    periodStart: Date, 
    periodEnd: Date
  ): Promise<ROIBreakdown> {
    const [
      agentCosts,
      infrastructureCosts,
      humanLaborSavings,
      revenueGeneration,
      efficiencyImprovements
    ] = await Promise.all([
      this.calculateAgentCosts(periodStart, periodEnd),
      this.calculateInfrastructureCosts(periodStart, periodEnd),
      this.calculateHumanLaborSavings(periodStart, periodEnd),
      this.calculateRevenueGeneration(periodStart, periodEnd),
      this.calculateEfficiencyImprovements(periodStart, periodEnd)
    ]);

    return {
      agent_costs: agentCosts,
      infrastructure_costs: infrastructureCosts,
      human_labor_savings: humanLaborSavings,
      revenue_generation: revenueGeneration,
      efficiency_improvements: efficiencyImprovements
    };
  }

  /**
   * Calculate costs associated with AI agents
   */
  private async calculateAgentCosts(
    periodStart: Date, 
    periodEnd: Date
  ): Promise<Record<string, number>> {
    const agentMetrics = await this.prisma.performanceMetric.findMany({
      where: {
        timestamp: {
          gte: periodStart,
          lte: periodEnd
        },
        service: 'agents'
      }
    });

    const costsByAgent: Record<string, number> = {};
    
    for (const metric of agentMetrics) {
      const agentId = metric.tags['agent_id'] as string;
      if (!agentId) continue;

      if (!costsByAgent[agentId]) {
        costsByAgent[agentId] = 0;
      }

      // Extract cost from metadata or calculate based on usage
      const cost = (metric.metadata as any)?.cost_cents || 
                   this.estimateAgentCost(metric);
      
      costsByAgent[agentId] += cost;
    }

    costsByAgent.total = Object.values(costsByAgent).reduce((sum, cost) => sum + cost, 0);
    
    return costsByAgent;
  }

  /**
   * Calculate infrastructure costs
   */
  private async calculateInfrastructureCosts(
    periodStart: Date, 
    periodEnd: Date
  ): Promise<Record<string, number>> {
    const periodHours = (periodEnd.getTime() - periodStart.getTime()) / (1000 * 60 * 60);
    
    const costs = {
      server_costs: periodHours * this.config.server_cost_per_hour_cents,
      ai_api_costs: 0,
      storage_costs: 0,
      monitoring_costs: 0
    };

    // Calculate AI API costs from usage metrics
    const apiMetrics = await this.prisma.performanceMetric.findMany({
      where: {
        timestamp: { gte: periodStart, lte: periodEnd },
        service: { in: ['openai', 'anthropic', 'azure-ai'] }
      }
    });

    costs.ai_api_costs = apiMetrics.reduce((sum, metric) => {
      return sum + ((metric.metadata as any)?.cost_cents || 0);
    }, 0);

    costs.storage_costs = this.estimateStorageCosts(periodHours);
    costs.monitoring_costs = this.estimateMonitoringCosts(periodHours);

    return {
      ...costs,
      total: Object.values(costs).reduce((sum, cost) => sum + cost, 0)
    };
  }

  /**
   * Calculate human labor savings from automation
   */
  private async calculateHumanLaborSavings(
    periodStart: Date, 
    periodEnd: Date
  ): Promise<Record<string, number>> {
    const automationMetrics = await this.prisma.businessMetric.findMany({
      where: {
        timestamp: { gte: periodStart, lte: periodEnd },
        metric_name: { contains: 'automation' }
      }
    });

    const savings = {
      task_automation: 0,
      workflow_optimization: 0,
      reduced_errors: 0,
      faster_processing: 0
    };

    for (const metric of automationMetrics) {
      const hours_saved = metric.value;
      const hourly_rate = this.getHourlyRateForTask(metric.dimension);
      const saving = hours_saved * hourly_rate;

      if (metric.metric_name.includes('task_automation')) {
        savings.task_automation += saving;
      } else if (metric.metric_name.includes('workflow')) {
        savings.workflow_optimization += saving;
      } else if (metric.metric_name.includes('error')) {
        savings.reduced_errors += saving;
      } else if (metric.metric_name.includes('processing')) {
        savings.faster_processing += saving;
      }
    }

    return {
      ...savings,
      total: Object.values(savings).reduce((sum, saving) => sum + saving, 0)
    };
  }

  /**
   * Calculate revenue generation from AI services
   */
  private async calculateRevenueGeneration(
    periodStart: Date, 
    periodEnd: Date
  ): Promise<Record<string, number>> {
    const revenueMetrics = await this.prisma.businessMetric.findMany({
      where: {
        timestamp: { gte: periodStart, lte: periodEnd },
        revenue_impact_cents: { gt: 0 }
      }
    });

    const revenue = {
      new_customer_acquisition: 0,
      customer_retention_improvement: 0,
      upsell_opportunities: 0,
      faster_time_to_market: 0
    };

    for (const metric of revenueMetrics) {
      const impact = metric.revenue_impact_cents || 0;
      
      if (metric.dimension.category === 'acquisition') {
        revenue.new_customer_acquisition += impact;
      } else if (metric.dimension.category === 'retention') {
        revenue.customer_retention_improvement += impact;
      } else if (metric.dimension.category === 'upsell') {
        revenue.upsell_opportunities += impact;
      } else if (metric.dimension.category === 'time_to_market') {
        revenue.faster_time_to_market += impact;
      }
    }

    return {
      ...revenue,
      total: Object.values(revenue).reduce((sum, rev) => sum + rev, 0)
    };
  }

  /**
   * Calculate efficiency improvements
   */
  private async calculateEfficiencyImprovements(
    periodStart: Date, 
    periodEnd: Date
  ): Promise<Record<string, number>> {
    const efficiencyMetrics = await this.prisma.performanceMetric.findMany({
      where: {
        timestamp: { gte: periodStart, lte: periodEnd },
        metric_type: 'timer'
      }
    });

    const improvements = {
      response_time_improvement: 0,
      throughput_increase: 0,
      error_rate_reduction: 0,
      resource_utilization: 0
    };

    // Calculate average improvements vs baseline
    for (const metric of efficiencyMetrics) {
      const baseline = await this.getBaselineMetric(metric.service, metric.endpoint);
      if (baseline) {
        const improvement = (baseline - metric.value) / baseline;
        
        if (metric.tags.type === 'response_time') {
          improvements.response_time_improvement += improvement;
        } else if (metric.tags.type === 'throughput') {
          improvements.throughput_increase += improvement;
        }
      }
    }

    return improvements;
  }

  /**
   * Calculate payback period in days
   */
  private async calculatePaybackPeriod(
    periodStart: Date, 
    periodEnd: Date, 
    totalCostCents: number
  ): Promise<number> {
    const periodDays = (periodEnd.getTime() - periodStart.getTime()) / (1000 * 60 * 60 * 24);
    const dailyBenefits = await this.calculateDailyBenefits(periodStart, periodEnd);
    
    if (dailyBenefits <= 0) {
      return Infinity;
    }

    return totalCostCents / dailyBenefits;
  }

  /**
   * Calculate Net Present Value
   */
  private calculateNetPresentValue(
    breakdown: ROIBreakdown, 
    periodStart: Date, 
    periodEnd: Date
  ): number {
    const periodYears = (periodEnd.getTime() - periodStart.getTime()) / (1000 * 60 * 60 * 24 * 365);
    const totalBenefits = this.calculateTotalBenefits(breakdown);
    const totalCosts = this.calculateTotalCosts(breakdown);
    
    // Simple NPV calculation (could be made more sophisticated)
    const discountFactor = Math.pow(1 + this.config.discount_rate, periodYears);
    
    return (totalBenefits / discountFactor) - totalCosts;
  }

  /**
   * Calculate efficiency gains percentage
   */
  private async calculateEfficiencyGains(
    periodStart: Date, 
    periodEnd: Date
  ): Promise<number> {
    const currentMetrics = await this.getAveragePerformanceMetrics(periodStart, periodEnd);
    const baselineMetrics = await this.getBaselinePerformanceMetrics();
    
    if (!baselineMetrics || Object.keys(baselineMetrics).length === 0) {
      return 0;
    }

    let totalImprovement = 0;
    let metricCount = 0;

    for (const [key, currentValue] of Object.entries(currentMetrics)) {
      const baselineValue = baselineMetrics[key];
      if (baselineValue && baselineValue > 0) {
        const improvement = (baselineValue - currentValue) / baselineValue;
        totalImprovement += improvement;
        metricCount++;
      }
    }

    return metricCount > 0 ? (totalImprovement / metricCount) * 100 : 0;
  }

  /**
   * Helper methods
   */
  private calculateTotalCosts(breakdown: ROIBreakdown): number {
    return (breakdown.agent_costs.total || 0) + 
           (breakdown.infrastructure_costs.total || 0);
  }

  private calculateTotalBenefits(breakdown: ROIBreakdown): number {
    return (breakdown.human_labor_savings.total || 0) + 
           (breakdown.revenue_generation.total || 0);
  }

  private calculateTotalSavings(breakdown: ROIBreakdown): number {
    return breakdown.human_labor_savings.total || 0;
  }

  private estimateAgentCost(metric: any): number {
    // Estimate based on execution time and service type
    const baseRate = 0.01; // 1 cent per second baseline
    return metric.value * baseRate * this.config.ai_api_cost_multiplier;
  }

  private getHourlyRateForTask(dimension: Record<string, any>): number {
    const skillLevel = dimension.skill_level || 'average';
    
    switch (skillLevel) {
      case 'senior':
        return this.config.senior_hourly_rate_cents;
      case 'junior':
        return this.config.junior_hourly_rate_cents;
      default:
        return this.config.average_hourly_rate_cents;
    }
  }

  private estimateStorageCosts(periodHours: number): number {
    // Rough estimate: $0.10 per GB per month
    const gbUsed = periodHours * 0.1; // Estimate GB usage
    return gbUsed * 10; // 10 cents per GB
  }

  private estimateMonitoringCosts(periodHours: number): number {
    // Rough estimate for monitoring infrastructure
    return periodHours * 0.5; // 0.5 cents per hour
  }

  private async getBaselineMetric(service: string, endpoint?: string): Promise<number | null> {
    // Get baseline from historical data (implementation would fetch from baseline table)
    return null;
  }

  private async calculateDailyBenefits(periodStart: Date, periodEnd: Date): Promise<number> {
    const breakdown = await this.calculateROIBreakdown(periodStart, periodEnd);
    const totalBenefits = this.calculateTotalBenefits(breakdown);
    const periodDays = (periodEnd.getTime() - periodStart.getTime()) / (1000 * 60 * 60 * 24);
    
    return periodDays > 0 ? totalBenefits / periodDays : 0;
  }

  private async getAveragePerformanceMetrics(
    periodStart: Date, 
    periodEnd: Date
  ): Promise<Record<string, number>> {
    // Implementation would calculate averages from performance metrics
    return {};
  }

  private async getBaselinePerformanceMetrics(): Promise<Record<string, number> | null> {
    // Implementation would fetch baseline metrics
    return null;
  }

  private async storeROICalculation(calculation: ROICalculation): Promise<void> {
    await this.prisma.roiCalculation.create({
      data: {
        id: calculation.id,
        period_start: calculation.period_start,
        period_end: calculation.period_end,
        total_cost_cents: calculation.total_cost_cents,
        total_revenue_cents: calculation.total_revenue_cents,
        cost_savings_cents: calculation.cost_savings_cents,
        efficiency_gains_percent: calculation.efficiency_gains_percent,
        roi_percent: calculation.roi_percent,
        payback_period_days: calculation.payback_period_days,
        net_present_value_cents: calculation.net_present_value_cents,
        breakdown: calculation.breakdown as any
      }
    });
  }

  private generateROIId(): string {
    return `roi_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}