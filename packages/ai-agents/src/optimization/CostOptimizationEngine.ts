import { EventEmitter } from 'events';
import { Logger } from '../core/Logger';
import { MetricsCollector } from '../monitoring/MetricsCollector';
import { ResourceAllocationEngine } from './ResourceAllocationEngine';
import { AutoScalingEngine } from './AutoScalingEngine';

/**
 * Cost Optimization Engine
 *
 * Provides intelligent cost optimization for resource allocation and scaling decisions.
 * Balances performance requirements with cost constraints to maximize ROI.
 *
 * Key Features:
 * - Real-time cost analysis and optimization
 * - Performance vs cost trade-off analysis
 * - Cost threshold monitoring and alerting
 * - ROI calculation and cost savings tracking
 * - Integration with auto-scaling and resource allocation
 */
export class CostOptimizationEngine extends EventEmitter {
  private logger: Logger;
  private metricsCollector: MetricsCollector;
  private resourceAllocation: ResourceAllocationEngine;
  private autoScaling: AutoScalingEngine;
  private isOptimizing: boolean = false;
  private costPolicies: Map<string, CostPolicy> = new Map();
  private costThresholds: CostThresholds;
  private optimizationHistory: CostOptimizationRecord[] = [];

  constructor(
    resourceAllocation: ResourceAllocationEngine,
    autoScaling: AutoScalingEngine,
    metricsCollector: MetricsCollector,
    config: CostOptimizationConfig = {}
  ) {
    super();
    this.logger = new Logger('CostOptimizationEngine');
    this.resourceAllocation = resourceAllocation;
    this.autoScaling = autoScaling;
    this.metricsCollector = metricsCollector;

    this.costThresholds = {
      hourly: config.hourlyBudget || 100,
      daily: config.dailyBudget || 2000,
      monthly: config.monthlyBudget || 50000,
      performanceThreshold: config.performanceThreshold || 0.8,
      costPerformanceRatio: config.costPerformanceRatio || 0.7,
      ...config.thresholds
    };

    this.initializeDefaultPolicies();
    this.setupOptimizationScheduler();
  }

  /**
   * Analyze current costs and generate optimization recommendations
   */
  async analyzeCosts(): Promise<CostAnalysisResult> {
    try {
      this.logger.info('Starting cost analysis...');

      const currentUsage = await this.getCurrentResourceUsage();
      const costBreakdown = await this.calculateCostBreakdown(currentUsage);
      const performanceMetrics = await this.getPerformanceMetrics();
      const recommendations = await this.generateOptimizationRecommendations(
        currentUsage,
        costBreakdown,
        performanceMetrics
      );

      const result: CostAnalysisResult = {
        timestamp: new Date(),
        currentCosts: costBreakdown,
        performanceMetrics,
        recommendations,
        projectedSavings: this.calculateProjectedSavings(recommendations),
        riskAssessment: this.assessOptimizationRisks(recommendations, performanceMetrics)
      };

      this.emit('analysis-complete', result);
      this.logger.info('Cost analysis completed', {
        currentCost: costBreakdown.total,
        projectedSavings: result.projectedSavings.total,
        recommendationCount: recommendations.length
      });

      return result;
    } catch (error) {
      this.logger.error('Failed to analyze costs', error);
      throw new Error(`Cost analysis failed: ${error.message}`);
    }
  }

  /**
   * Apply cost optimization recommendations
   */
  async applyOptimizations(recommendations: CostOptimizationRecommendation[]): Promise<OptimizationResult> {
    if (this.isOptimizing) {
      throw new Error('Optimization already in progress');
    }

    this.isOptimizing = true;
    const startTime = Date.now();
    const appliedOptimizations: AppliedOptimization[] = [];

    try {
      this.logger.info('Applying cost optimizations', { count: recommendations.length });

      for (const recommendation of recommendations) {
        try {
          const result = await this.applyRecommendation(recommendation);
          appliedOptimizations.push(result);

          this.emit('optimization-applied', {
            recommendation,
            result,
            timestamp: new Date()
          });

          // Wait between optimizations to allow metrics to stabilize
          await this.sleep(2000);
        } catch (error) {
          this.logger.error(`Failed to apply optimization: ${recommendation.type}`, error);
          appliedOptimizations.push({
            recommendation,
            success: false,
            error: error.message,
            timestamp: new Date()
          });
        }
      }

      const result: OptimizationResult = {
        timestamp: new Date(),
        duration: Date.now() - startTime,
        appliedOptimizations,
        totalSavings: appliedOptimizations
          .filter(opt => opt.success)
          .reduce((sum, opt) => sum + (opt.estimatedSavings || 0), 0),
        successRate: appliedOptimizations.filter(opt => opt.success).length / appliedOptimizations.length
      };

      this.optimizationHistory.push({
        ...result,
        id: `opt_${Date.now()}`
      });

      this.emit('optimization-complete', result);
      this.logger.info('Cost optimization completed', {
        applied: appliedOptimizations.filter(opt => opt.success).length,
        failed: appliedOptimizations.filter(opt => !opt.success).length,
        totalSavings: result.totalSavings
      });

      return result;
    } finally {
      this.isOptimizing = false;
    }
  }

  /**
   * Get current cost status and projections
   */
  async getCostStatus(): Promise<CostStatus> {
    const currentUsage = await this.getCurrentResourceUsage();
    const costBreakdown = await this.calculateCostBreakdown(currentUsage);
    const projections = await this.generateCostProjections(currentUsage);
    const budgetStatus = this.checkBudgetStatus(costBreakdown, projections);

    return {
      timestamp: new Date(),
      currentCosts: costBreakdown,
      projections,
      budgetStatus,
      optimizationOpportunities: await this.identifyOptimizationOpportunities(currentUsage),
      trends: this.analyzeCostTrends()
    };
  }

  /**
   * Set cost optimization policy for a service
   */
  async setCostPolicy(serviceId: string, policy: Partial<CostPolicy>): Promise<void> {
    const fullPolicy: CostPolicy = {
      serviceId,
      maxHourlyCost: policy.maxHourlyCost || 50,
      maxDailyCost: policy.maxDailyCost || 1000,
      performanceTarget: policy.performanceTarget || 0.8,
      costPerformanceWeight: policy.costPerformanceWeight || 0.5,
      allowedOptimizations: policy.allowedOptimizations || ['scale_down', 'resource_reallocation'],
      aggressiveness: policy.aggressiveness || 'moderate',
      ...policy
    };

    this.costPolicies.set(serviceId, fullPolicy);
    this.logger.info('Cost policy updated', { serviceId, policy: fullPolicy });

    this.emit('policy-updated', { serviceId, policy: fullPolicy });
  }

  /**
   * Calculate ROI for a specific optimization
   */
  async calculateROI(optimization: CostOptimizationRecommendation): Promise<ROIAnalysis> {
    const currentCosts = await this.getCurrentResourceUsage();
    const projectedCosts = this.projectOptimizationImpact(optimization, currentCosts);
    const performanceImpact = await this.estimatePerformanceImpact(optimization);

    const monthlySavings = (currentCosts.monthlyCost - projectedCosts.monthlyCost);
    const implementationCost = this.estimateImplementationCost(optimization);
    const paybackPeriod = implementationCost / monthlySavings;

    return {
      optimization,
      currentMonthlyCost: currentCosts.monthlyCost,
      projectedMonthlyCost: projectedCosts.monthlyCost,
      monthlySavings,
      annualSavings: monthlySavings * 12,
      implementationCost,
      paybackPeriod,
      performanceImpact,
      riskLevel: this.assessOptimizationRisk(optimization),
      confidence: this.calculateConfidenceScore(optimization, currentCosts)
    };
  }

  /**
   * Get optimization history and performance tracking
   */
  getOptimizationHistory(limit: number = 50): CostOptimizationRecord[] {
    return this.optimizationHistory
      .slice(-limit)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  /**
   * Private Methods
   */

  private initializeDefaultPolicies(): void {
    // Default cost policies for common services
    const defaultPolicies = [
      {
        serviceId: 'workflow-executor',
        maxHourlyCost: 25,
        maxDailyCost: 500,
        performanceTarget: 0.85,
        allowedOptimizations: ['scale_down', 'resource_reallocation']
      },
      {
        serviceId: 'agent-orchestrator',
        maxHourlyCost: 30,
        maxDailyCost: 600,
        performanceTarget: 0.9,
        allowedOptimizations: ['scale_down', 'instance_type_optimization']
      }
    ];

    defaultPolicies.forEach(policy => {
      this.setCostPolicy(policy.serviceId, policy);
    });
  }

  private setupOptimizationScheduler(): void {
    // Run cost analysis every hour
    setInterval(() => {
      this.runScheduledOptimization();
    }, 60 * 60 * 1000);

    // Run budget checks every 15 minutes
    setInterval(() => {
      this.checkBudgetAlerts();
    }, 15 * 60 * 1000);
  }

  private async runScheduledOptimization(): Promise<void> {
    try {
      const analysis = await this.analyzeCosts();
      const highImpactRecommendations = analysis.recommendations
        .filter(rec => rec.impact === 'high' && rec.confidence > 0.8)
        .slice(0, 3); // Apply only top 3 high-confidence recommendations

      if (highImpactRecommendations.length > 0) {
        await this.applyOptimizations(highImpactRecommendations);
      }
    } catch (error) {
      this.logger.error('Scheduled optimization failed', error);
    }
  }

  private async checkBudgetAlerts(): Promise<void> {
    const status = await this.getCostStatus();

    if (status.budgetStatus.hourlyUsage > 0.9) {
      this.emit('budget-alert', {
        type: 'hourly',
        usage: status.budgetStatus.hourlyUsage,
        currentCost: status.currentCosts.hourly,
        budget: this.costThresholds.hourly
      });
    }

    if (status.budgetStatus.dailyUsage > 0.8) {
      this.emit('budget-alert', {
        type: 'daily',
        usage: status.budgetStatus.dailyUsage,
        currentCost: status.currentCosts.daily,
        budget: this.costThresholds.daily
      });
    }
  }

  private async getCurrentResourceUsage(): Promise<ResourceUsage> {
    // Implementation would integrate with cloud provider APIs
    // This is a simplified version for demonstration
    const metrics = await this.metricsCollector.getMetrics([
      'cpu_usage',
      'memory_usage',
      'storage_usage',
      'network_usage'
    ], { timeRange: '1h' });

    return {
      cpu: {
        allocated: metrics.cpu_usage?.allocated || 0,
        used: metrics.cpu_usage?.used || 0,
        cost: (metrics.cpu_usage?.allocated || 0) * 0.05 // $0.05 per CPU hour
      },
      memory: {
        allocated: metrics.memory_usage?.allocated || 0,
        used: metrics.memory_usage?.used || 0,
        cost: (metrics.memory_usage?.allocated || 0) * 0.01 // $0.01 per GB hour
      },
      storage: {
        allocated: metrics.storage_usage?.allocated || 0,
        used: metrics.storage_usage?.used || 0,
        cost: (metrics.storage_usage?.allocated || 0) * 0.1 // $0.10 per GB month
      },
      network: {
        used: metrics.network_usage?.used || 0,
        cost: (metrics.network_usage?.used || 0) * 0.09 // $0.09 per GB
      },
      hourlyCost: 0,
      dailyCost: 0,
      monthlyCost: 0
    };
  }

  private async calculateCostBreakdown(usage: ResourceUsage): Promise<CostBreakdown> {
    const hourlyCost = usage.cpu.cost + usage.memory.cost + usage.storage.cost / 730 + usage.network.cost;

    return {
      hourly: hourlyCost,
      daily: hourlyCost * 24,
      monthly: hourlyCost * 730,
      total: hourlyCost,
      breakdown: {
        compute: usage.cpu.cost + usage.memory.cost,
        storage: usage.storage.cost / 730,
        network: usage.network.cost,
        other: 0
      }
    };
  }

  private async getPerformanceMetrics(): Promise<PerformanceMetrics> {
    const metrics = await this.metricsCollector.getMetrics([
      'response_time',
      'throughput',
      'error_rate',
      'availability'
    ], { timeRange: '1h' });

    return {
      responseTime: metrics.response_time?.avg || 0,
      throughput: metrics.throughput?.current || 0,
      errorRate: metrics.error_rate?.current || 0,
      availability: metrics.availability?.current || 1,
      performanceScore: this.calculatePerformanceScore(metrics)
    };
  }

  private calculatePerformanceScore(metrics: any): number {
    // Weighted performance score calculation
    const responseTimeScore = Math.max(0, 1 - (metrics.response_time?.avg || 0) / 1000);
    const throughputScore = Math.min(1, (metrics.throughput?.current || 0) / 1000);
    const errorRateScore = Math.max(0, 1 - (metrics.error_rate?.current || 0));
    const availabilityScore = metrics.availability?.current || 1;

    return (responseTimeScore * 0.3 + throughputScore * 0.2 + errorRateScore * 0.2 + availabilityScore * 0.3);
  }

  private async generateOptimizationRecommendations(
    usage: ResourceUsage,
    costs: CostBreakdown,
    performance: PerformanceMetrics
  ): Promise<CostOptimizationRecommendation[]> {
    const recommendations: CostOptimizationRecommendation[] = [];

    // Check for over-provisioned resources
    if (usage.cpu.used / usage.cpu.allocated < 0.6 && performance.performanceScore > 0.8) {
      recommendations.push({
        id: `cpu_optimization_${Date.now()}`,
        type: 'resource_reduction',
        description: 'Reduce CPU allocation by 20%',
        currentCost: usage.cpu.cost,
        projectedCost: usage.cpu.cost * 0.8,
        estimatedSavings: usage.cpu.cost * 0.2,
        confidence: 0.85,
        impact: 'medium',
        riskLevel: 'low',
        performanceImpact: 'minimal',
        implementation: {
          type: 'auto_scaling',
          parameters: { cpuReduction: 0.2 }
        }
      });
    }

    // Check for memory optimization
    if (usage.memory.used / usage.memory.allocated < 0.5) {
      recommendations.push({
        id: `memory_optimization_${Date.now()}`,
        type: 'resource_reduction',
        description: 'Reduce memory allocation by 25%',
        currentCost: usage.memory.cost,
        projectedCost: usage.memory.cost * 0.75,
        estimatedSavings: usage.memory.cost * 0.25,
        confidence: 0.9,
        impact: 'medium',
        riskLevel: 'low',
        performanceImpact: 'minimal',
        implementation: {
          type: 'resource_reallocation',
          parameters: { memoryReduction: 0.25 }
        }
      });
    }

    // Check for scheduling optimization
    if (costs.hourly > this.costThresholds.hourly * 0.8) {
      recommendations.push({
        id: `scheduling_optimization_${Date.now()}`,
        type: 'scheduling',
        description: 'Implement smart scheduling to reduce peak costs',
        currentCost: costs.hourly,
        projectedCost: costs.hourly * 0.85,
        estimatedSavings: costs.hourly * 0.15,
        confidence: 0.7,
        impact: 'high',
        riskLevel: 'medium',
        performanceImpact: 'low',
        implementation: {
          type: 'scheduling',
          parameters: { loadBalancing: true, peakShifting: true }
        }
      });
    }

    return recommendations;
  }

  private calculateProjectedSavings(recommendations: CostOptimizationRecommendation[]): ProjectedSavings {
    const totalSavings = recommendations.reduce((sum, rec) => sum + rec.estimatedSavings, 0);

    return {
      hourly: totalSavings,
      daily: totalSavings * 24,
      monthly: totalSavings * 730,
      annual: totalSavings * 8760,
      total: totalSavings
    };
  }

  private assessOptimizationRisks(
    recommendations: CostOptimizationRecommendation[],
    performance: PerformanceMetrics
  ): RiskAssessment {
    const highRiskCount = recommendations.filter(rec => rec.riskLevel === 'high').length;
    const mediumRiskCount = recommendations.filter(rec => rec.riskLevel === 'medium').length;

    return {
      overall: highRiskCount > 0 ? 'high' : mediumRiskCount > 2 ? 'medium' : 'low',
      performanceRisk: performance.performanceScore < 0.7 ? 'high' : 'low',
      costRisk: recommendations.length > 5 ? 'medium' : 'low',
      recommendations: recommendations.filter(rec => rec.riskLevel !== 'low').map(rec => ({
        type: rec.type,
        risk: rec.riskLevel,
        mitigation: this.generateRiskMitigation(rec)
      }))
    };
  }

  private generateRiskMitigation(recommendation: CostOptimizationRecommendation): string {
    switch (recommendation.type) {
      case 'resource_reduction':
        return 'Monitor performance closely and rollback if degradation occurs';
      case 'scheduling':
        return 'Implement gradual rollout with performance monitoring';
      default:
        return 'Implement with monitoring and rollback plan';
    }
  }

  private async applyRecommendation(recommendation: CostOptimizationRecommendation): Promise<AppliedOptimization> {
    const startTime = Date.now();

    try {
      switch (recommendation.implementation.type) {
        case 'auto_scaling':
          await this.applyAutoScalingOptimization(recommendation);
          break;
        case 'resource_reallocation':
          await this.applyResourceReallocation(recommendation);
          break;
        case 'scheduling':
          await this.applySchedulingOptimization(recommendation);
          break;
        default:
          throw new Error(`Unknown optimization type: ${recommendation.implementation.type}`);
      }

      return {
        recommendation,
        success: true,
        timestamp: new Date(),
        duration: Date.now() - startTime,
        estimatedSavings: recommendation.estimatedSavings
      };
    } catch (error) {
      return {
        recommendation,
        success: false,
        error: error.message,
        timestamp: new Date(),
        duration: Date.now() - startTime
      };
    }
  }

  private async applyAutoScalingOptimization(recommendation: CostOptimizationRecommendation): Promise<void> {
    // Integration with AutoScalingEngine
    const params = recommendation.implementation.parameters;

    if (params.cpuReduction) {
      // Adjust auto-scaling policies to reduce CPU allocation
      this.logger.info('Applying CPU reduction optimization', { reduction: params.cpuReduction });
      // Implementation would call autoScaling.updatePolicy()
    }
  }

  private async applyResourceReallocation(recommendation: CostOptimizationRecommendation): Promise<void> {
    // Integration with ResourceAllocationEngine
    const params = recommendation.implementation.parameters;

    if (params.memoryReduction) {
      // Adjust resource allocation to reduce memory
      this.logger.info('Applying memory reduction optimization', { reduction: params.memoryReduction });
      // Implementation would call resourceAllocation.updateAllocation()
    }
  }

  private async applySchedulingOptimization(recommendation: CostOptimizationRecommendation): Promise<void> {
    // Implement scheduling-based cost optimization
    const params = recommendation.implementation.parameters;

    this.logger.info('Applying scheduling optimization', params);
    // Implementation would integrate with workflow scheduler
  }

  private projectOptimizationImpact(
    optimization: CostOptimizationRecommendation,
    currentUsage: ResourceUsage
  ): ResourceUsage {
    // Project the impact of applying this optimization
    const projected = { ...currentUsage };

    switch (optimization.type) {
      case 'resource_reduction':
        projected.cpu.cost *= 0.8;
        projected.memory.cost *= 0.75;
        break;
      case 'scheduling':
        projected.hourlyCost *= 0.85;
        break;
    }

    return projected;
  }

  private async estimatePerformanceImpact(optimization: CostOptimizationRecommendation): Promise<PerformanceImpact> {
    // Estimate performance impact based on optimization type
    switch (optimization.type) {
      case 'resource_reduction':
        return {
          responseTime: 0.05, // 5% increase
          throughput: -0.02, // 2% decrease
          availability: 0.0 // No impact
        };
      case 'scheduling':
        return {
          responseTime: 0.02, // 2% increase
          throughput: 0.0, // No impact
          availability: 0.0 // No impact
        };
      default:
        return {
          responseTime: 0.0,
          throughput: 0.0,
          availability: 0.0
        };
    }
  }

  private estimateImplementationCost(optimization: CostOptimizationRecommendation): number {
    // Estimate cost to implement the optimization
    switch (optimization.type) {
      case 'resource_reduction':
        return 50; // $50 for configuration changes
      case 'scheduling':
        return 200; // $200 for scheduling logic implementation
      default:
        return 100;
    }
  }

  private assessOptimizationRisk(optimization: CostOptimizationRecommendation): 'low' | 'medium' | 'high' {
    if (optimization.confidence < 0.6) return 'high';
    if (optimization.estimatedSavings > 1000) return 'medium';
    return 'low';
  }

  private calculateConfidenceScore(
    optimization: CostOptimizationRecommendation,
    currentUsage: ResourceUsage
  ): number {
    // Calculate confidence based on historical data and current metrics
    let confidence = 0.8; // Base confidence

    // Adjust based on usage patterns
    if (currentUsage.cpu.used / currentUsage.cpu.allocated < 0.5) {
      confidence += 0.1; // High confidence for under-utilized resources
    }

    return Math.min(1.0, confidence);
  }

  private checkBudgetStatus(costs: CostBreakdown, projections: CostProjection): BudgetStatus {
    return {
      hourlyUsage: costs.hourly / this.costThresholds.hourly,
      dailyUsage: costs.daily / this.costThresholds.daily,
      monthlyUsage: costs.monthly / this.costThresholds.monthly,
      isOverBudget: costs.monthly > this.costThresholds.monthly,
      projectedOverrun: projections.monthly > this.costThresholds.monthly
    };
  }

  private async generateCostProjections(usage: ResourceUsage): Promise<CostProjection> {
    // Generate cost projections based on current trends
    const currentHourly = usage.hourlyCost;
    const growthRate = 0.05; // 5% monthly growth assumption

    return {
      hourly: currentHourly,
      daily: currentHourly * 24,
      weekly: currentHourly * 24 * 7,
      monthly: currentHourly * 730 * (1 + growthRate),
      quarterly: currentHourly * 730 * 3 * (1 + growthRate * 3)
    };
  }

  private async identifyOptimizationOpportunities(usage: ResourceUsage): Promise<OptimizationOpportunity[]> {
    const opportunities: OptimizationOpportunity[] = [];

    // Identify under-utilized resources
    if (usage.cpu.used / usage.cpu.allocated < 0.6) {
      opportunities.push({
        type: 'cpu_optimization',
        description: 'CPU utilization is below 60%',
        potentialSavings: usage.cpu.cost * 0.2,
        confidence: 0.8
      });
    }

    if (usage.memory.used / usage.memory.allocated < 0.5) {
      opportunities.push({
        type: 'memory_optimization',
        description: 'Memory utilization is below 50%',
        potentialSavings: usage.memory.cost * 0.25,
        confidence: 0.9
      });
    }

    return opportunities;
  }

  private analyzeCostTrends(): CostTrend[] {
    // Analyze historical cost data for trends
    const history = this.optimizationHistory.slice(-30); // Last 30 records

    if (history.length < 2) {
      return [];
    }

    return [
      {
        metric: 'total_cost',
        direction: 'stable', // Would calculate from actual data
        change: 0.02, // 2% change
        period: '30d'
      }
    ];
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Type Definitions
 */

export interface CostOptimizationConfig {
  hourlyBudget?: number;
  dailyBudget?: number;
  monthlyBudget?: number;
  performanceThreshold?: number;
  costPerformanceRatio?: number;
  thresholds?: Partial<CostThresholds>;
}

export interface CostThresholds {
  hourly: number;
  daily: number;
  monthly: number;
  performanceThreshold: number;
  costPerformanceRatio: number;
}

export interface CostPolicy {
  serviceId: string;
  maxHourlyCost: number;
  maxDailyCost: number;
  performanceTarget: number;
  costPerformanceWeight: number;
  allowedOptimizations: OptimizationType[];
  aggressiveness: 'conservative' | 'moderate' | 'aggressive';
}

export interface ResourceUsage {
  cpu: {
    allocated: number;
    used: number;
    cost: number;
  };
  memory: {
    allocated: number;
    used: number;
    cost: number;
  };
  storage: {
    allocated: number;
    used: number;
    cost: number;
  };
  network: {
    used: number;
    cost: number;
  };
  hourlyCost: number;
  dailyCost: number;
  monthlyCost: number;
}

export interface CostBreakdown {
  hourly: number;
  daily: number;
  monthly: number;
  total: number;
  breakdown: {
    compute: number;
    storage: number;
    network: number;
    other: number;
  };
}

export interface PerformanceMetrics {
  responseTime: number;
  throughput: number;
  errorRate: number;
  availability: number;
  performanceScore: number;
}

export interface CostOptimizationRecommendation {
  id: string;
  type: OptimizationType;
  description: string;
  currentCost: number;
  projectedCost: number;
  estimatedSavings: number;
  confidence: number;
  impact: 'low' | 'medium' | 'high';
  riskLevel: 'low' | 'medium' | 'high';
  performanceImpact: string;
  implementation: {
    type: string;
    parameters: Record<string, any>;
  };
}

export interface CostAnalysisResult {
  timestamp: Date;
  currentCosts: CostBreakdown;
  performanceMetrics: PerformanceMetrics;
  recommendations: CostOptimizationRecommendation[];
  projectedSavings: ProjectedSavings;
  riskAssessment: RiskAssessment;
}

export interface ProjectedSavings {
  hourly: number;
  daily: number;
  monthly: number;
  annual: number;
  total: number;
}

export interface RiskAssessment {
  overall: 'low' | 'medium' | 'high';
  performanceRisk: 'low' | 'medium' | 'high';
  costRisk: 'low' | 'medium' | 'high';
  recommendations: Array<{
    type: string;
    risk: string;
    mitigation: string;
  }>;
}

export interface AppliedOptimization {
  recommendation: CostOptimizationRecommendation;
  success: boolean;
  error?: string;
  timestamp: Date;
  duration?: number;
  estimatedSavings?: number;
}

export interface OptimizationResult {
  timestamp: Date;
  duration: number;
  appliedOptimizations: AppliedOptimization[];
  totalSavings: number;
  successRate: number;
}

export interface CostOptimizationRecord extends OptimizationResult {
  id: string;
}

export interface CostStatus {
  timestamp: Date;
  currentCosts: CostBreakdown;
  projections: CostProjection;
  budgetStatus: BudgetStatus;
  optimizationOpportunities: OptimizationOpportunity[];
  trends: CostTrend[];
}

export interface CostProjection {
  hourly: number;
  daily: number;
  weekly: number;
  monthly: number;
  quarterly: number;
}

export interface BudgetStatus {
  hourlyUsage: number;
  dailyUsage: number;
  monthlyUsage: number;
  isOverBudget: boolean;
  projectedOverrun: boolean;
}

export interface OptimizationOpportunity {
  type: string;
  description: string;
  potentialSavings: number;
  confidence: number;
}

export interface CostTrend {
  metric: string;
  direction: 'increasing' | 'decreasing' | 'stable';
  change: number;
  period: string;
}

export interface ROIAnalysis {
  optimization: CostOptimizationRecommendation;
  currentMonthlyCost: number;
  projectedMonthlyCost: number;
  monthlySavings: number;
  annualSavings: number;
  implementationCost: number;
  paybackPeriod: number;
  performanceImpact: PerformanceImpact;
  riskLevel: 'low' | 'medium' | 'high';
  confidence: number;
}

export interface PerformanceImpact {
  responseTime: number;
  throughput: number;
  availability: number;
}

export type OptimizationType = 'resource_reduction' | 'resource_reallocation' | 'scheduling' | 'instance_optimization' | 'storage_optimization';