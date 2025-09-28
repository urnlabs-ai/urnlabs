/**
 * Capacity Planner for Resource Requirement Prediction and Scaling Recommendations
 *
 * Provides intelligent capacity planning capabilities including resource forecasting,
 * cost optimization, scaling recommendations, and infrastructure planning based on
 * workload predictions and business constraints.
 */

import { EventEmitter } from 'events';
import { z } from 'zod';
import { logger } from '../core/Logger.js';
import type { WorkloadPredictionResult, ResourceDemandPrediction } from './WorkloadPredictionService.js';

// Core capacity planning schemas
export const ResourceCapacitySchema = z.object({
  cpu: z.object({
    total: z.number().min(0),
    available: z.number().min(0),
    reserved: z.number().min(0).default(0),
    utilizationTarget: z.number().min(0).max(100).default(70)
  }),
  memory: z.object({
    totalGB: z.number().min(0),
    availableGB: z.number().min(0),
    reservedGB: z.number().min(0).default(0),
    utilizationTarget: z.number().min(0).max(100).default(80)
  }),
  storage: z.object({
    totalGB: z.number().min(0),
    availableGB: z.number().min(0),
    reservedGB: z.number().min(0).default(0),
    iopsCapacity: z.number().min(0),
    utilizationTarget: z.number().min(0).max(100).default(85)
  }),
  network: z.object({
    bandwidthMbps: z.number().min(0),
    availableMbps: z.number().min(0),
    reservedMbps: z.number().min(0).default(0),
    utilizationTarget: z.number().min(0).max(100).default(75)
  })
});

export const CapacityConstraintsSchema = z.object({
  budget: z.object({
    monthlyLimit: z.number().min(0),
    currency: z.string().default('USD'),
    costPerUnit: z.record(z.number()).optional()
  }),
  sla: z.object({
    availabilityTarget: z.number().min(0).max(100).default(99.9),
    responseTimeTarget: z.number().min(0).default(1000), // milliseconds
    maxDowntimeMinutes: z.number().min(0).default(43.2) // 99.9% uptime
  }),
  business: z.object({
    growthRate: z.number().min(-1).default(0.1), // 10% annual growth
    peakSeasonMultiplier: z.number().min(1).default(1.5),
    maintenanceWindows: z.array(z.string()).default([]),
    complianceRequirements: z.array(z.string()).default([])
  }),
  technical: z.object({
    minInstances: z.number().min(1).default(1),
    maxInstances: z.number().min(1).default(100),
    scalingCooldown: z.number().min(60000).default(300000), // 5 minutes
    redundancyFactor: z.number().min(1).default(1.2)
  })
});

export const CapacityPlanSchema = z.object({
  planId: z.string(),
  organizationId: z.string(),
  name: z.string(),
  description: z.string(),
  timeHorizon: z.enum(['short', 'medium', 'long']),

  // Current state
  currentCapacity: ResourceCapacitySchema,
  currentUtilization: z.record(z.number()),

  // Planned capacity changes
  plannedCapacity: z.array(z.object({
    timestamp: z.number(),
    capacity: ResourceCapacitySchema,
    reason: z.string(),
    cost: z.number().optional(),
    riskLevel: z.enum(['low', 'medium', 'high'])
  })),

  // Cost analysis
  costAnalysis: z.object({
    currentMonthlyCost: z.number(),
    projectedMonthlyCost: z.number(),
    savingsOpportunities: z.array(z.object({
      description: z.string(),
      potentialSavings: z.number(),
      implementationEffort: z.enum(['low', 'medium', 'high'])
    })),
    costOptimizationScore: z.number().min(0).max(100)
  }),

  // Risk assessment
  riskAssessment: z.object({
    capacityRisks: z.array(z.object({
      type: z.string(),
      probability: z.number().min(0).max(1),
      impact: z.enum(['low', 'medium', 'high', 'critical']),
      mitigation: z.string()
    })),
    overallRiskScore: z.number().min(0).max(100)
  }),

  // Recommendations
  recommendations: z.object({
    immediate: z.array(z.string()),
    shortTerm: z.array(z.string()),
    longTerm: z.array(z.string())
  }),

  // Metadata
  confidence: z.number().min(0).max(1),
  lastUpdated: z.number(),
  validUntil: z.number()
});

export const ScalingActionSchema = z.object({
  actionId: z.string(),
  type: z.enum(['scale_up', 'scale_down', 'optimize', 'migrate']),
  resource: z.enum(['cpu', 'memory', 'storage', 'network', 'all']),
  priority: z.enum(['low', 'medium', 'high', 'critical']),

  details: z.object({
    currentValue: z.number(),
    targetValue: z.number(),
    estimatedDuration: z.number(), // minutes
    estimatedCost: z.number(),
    rollbackPlan: z.string()
  }),

  schedule: z.object({
    executeAt: z.number(),
    deadline: z.number().optional(),
    maintenanceWindow: z.boolean().default(false)
  }),

  prerequisites: z.array(z.string()).default([]),
  risks: z.array(z.string()).default([]),
  benefits: z.array(z.string()).default([])
});

export type ResourceCapacity = z.infer<typeof ResourceCapacitySchema>;
export type CapacityConstraints = z.infer<typeof CapacityConstraintsSchema>;
export type CapacityPlan = z.infer<typeof CapacityPlanSchema>;
export type ScalingAction = z.infer<typeof ScalingActionSchema>;

export interface CapacityPlannerConfig {
  // Planning parameters
  planningHorizons: {
    short: number; // hours
    medium: number; // hours
    long: number; // hours
  };

  // Resource thresholds
  utilizationThresholds: {
    warning: number; // percentage
    critical: number; // percentage
    scaleUp: number; // percentage
    scaleDown: number; // percentage
  };

  // Cost optimization
  costOptimization: {
    enabled: boolean;
    rightsizingThreshold: number; // percentage of waste to trigger rightsizing
    spotInstanceUsage: boolean;
    reservedInstancePlanning: boolean;
  };

  // Planning frequency
  planUpdateInterval: number; // milliseconds
  forecastAccuracyTarget: number; // percentage

  // Safety margins
  safetyMargins: {
    cpu: number; // percentage buffer
    memory: number; // percentage buffer
    storage: number; // percentage buffer
    network: number; // percentage buffer
  };
}

export class CapacityPlanner extends EventEmitter {
  private config: CapacityPlannerConfig;
  private activePlans: Map<string, CapacityPlan>;
  private plannedActions: Map<string, ScalingAction[]>;
  private costModels: Map<string, any>;
  private lastPlanUpdate: number;

  constructor(config: Partial<CapacityPlannerConfig> = {}) {
    super();

    this.config = {
      planningHorizons: {
        short: 24,   // 24 hours
        medium: 168, // 1 week
        long: 720    // 1 month
      },
      utilizationThresholds: {
        warning: 70,
        critical: 85,
        scaleUp: 80,
        scaleDown: 30
      },
      costOptimization: {
        enabled: true,
        rightsizingThreshold: 20, // 20% waste triggers rightsizing
        spotInstanceUsage: true,
        reservedInstancePlanning: true
      },
      planUpdateInterval: 3600000, // 1 hour
      forecastAccuracyTarget: 85, // 85% accuracy target
      safetyMargins: {
        cpu: 20,    // 20% safety margin
        memory: 25, // 25% safety margin
        storage: 15, // 15% safety margin
        network: 30  // 30% safety margin
      },
      ...config
    };

    this.activePlans = new Map();
    this.plannedActions = new Map();
    this.costModels = new Map();
    this.lastPlanUpdate = 0;

    // Initialize cost models
    this.initializeCostModels();

    logger.info('CapacityPlanner initialized', { config: this.config });
  }

  /**
   * Create a comprehensive capacity plan based on workload predictions
   */
  async createCapacityPlan(
    organizationId: string,
    workloadPrediction: WorkloadPredictionResult,
    currentCapacity: ResourceCapacity,
    constraints: CapacityConstraints,
    timeHorizon: 'short' | 'medium' | 'long' = 'medium'
  ): Promise<CapacityPlan> {
    try {
      logger.info('Creating capacity plan', {
        organizationId,
        timeHorizon,
        predictionId: workloadPrediction.predictionId
      });

      // Calculate current utilization
      const currentUtilization = this.calculateCurrentUtilization(currentCapacity);

      // Generate planned capacity changes
      const plannedCapacity = await this.generatePlannedCapacity(
        workloadPrediction.resourceDemand,
        currentCapacity,
        constraints,
        timeHorizon
      );

      // Perform cost analysis
      const costAnalysis = await this.performCostAnalysis(
        currentCapacity,
        plannedCapacity,
        constraints.budget
      );

      // Assess risks
      const riskAssessment = await this.assessCapacityRisks(
        plannedCapacity,
        workloadPrediction,
        constraints
      );

      // Generate recommendations
      const recommendations = await this.generateCapacityRecommendations(
        plannedCapacity,
        costAnalysis,
        riskAssessment,
        workloadPrediction
      );

      // Calculate overall confidence
      const confidence = this.calculatePlanConfidence(
        workloadPrediction.confidence,
        riskAssessment.overallRiskScore,
        costAnalysis.costOptimizationScore
      );

      const plan: CapacityPlan = {
        planId: this.generatePlanId(),
        organizationId,
        name: `Capacity Plan - ${timeHorizon.toUpperCase()}`,
        description: `${timeHorizon} term capacity plan based on workload predictions`,
        timeHorizon,
        currentCapacity,
        currentUtilization,
        plannedCapacity,
        costAnalysis,
        riskAssessment,
        recommendations,
        confidence,
        lastUpdated: Date.now(),
        validUntil: Date.now() + this.config.planUpdateInterval
      };

      // Store the plan
      this.activePlans.set(plan.planId, plan);

      // Generate scaling actions
      const scalingActions = await this.generateScalingActions(plan);
      this.plannedActions.set(plan.planId, scalingActions);

      this.emit('planCreated', { planId: plan.planId, organizationId });

      logger.info('Capacity plan created successfully', {
        planId: plan.planId,
        organizationId,
        confidence,
        plannedChanges: plannedCapacity.length
      });

      return plan;

    } catch (error) {
      logger.error('Capacity plan creation failed', {
        organizationId,
        timeHorizon,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Optimize existing capacity based on utilization patterns
   */
  async optimizeCapacity(
    organizationId: string,
    currentCapacity: ResourceCapacity,
    utilizationHistory: Array<{
      timestamp: number;
      cpu: number;
      memory: number;
      storage: number;
      network: number;
    }>,
    constraints: CapacityConstraints
  ): Promise<{
    optimizedCapacity: ResourceCapacity;
    costSavings: number;
    performanceImpact: string;
    recommendations: string[];
  }> {
    try {
      logger.info('Optimizing capacity', {
        organizationId,
        historyPoints: utilizationHistory.length
      });

      // Analyze utilization patterns
      const utilizationAnalysis = this.analyzeUtilizationPatterns(utilizationHistory);

      // Identify optimization opportunities
      const optimizations = this.identifyOptimizationOpportunities(
        currentCapacity,
        utilizationAnalysis,
        constraints
      );

      // Calculate optimized capacity
      const optimizedCapacity = this.calculateOptimizedCapacity(
        currentCapacity,
        optimizations
      );

      // Estimate cost savings
      const costSavings = await this.estimateCostSavings(
        currentCapacity,
        optimizedCapacity,
        constraints.budget
      );

      // Assess performance impact
      const performanceImpact = this.assessPerformanceImpact(
        currentCapacity,
        optimizedCapacity,
        utilizationAnalysis
      );

      // Generate optimization recommendations
      const recommendations = this.generateOptimizationRecommendations(
        optimizations,
        costSavings,
        performanceImpact
      );

      logger.info('Capacity optimization completed', {
        organizationId,
        costSavings,
        performanceImpact
      });

      return {
        optimizedCapacity,
        costSavings,
        performanceImpact,
        recommendations
      };

    } catch (error) {
      logger.error('Capacity optimization failed', {
        organizationId,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Generate immediate scaling recommendations
   */
  async generateScalingRecommendations(
    organizationId: string,
    currentCapacity: ResourceCapacity,
    currentUtilization: Record<string, number>,
    urgency: 'low' | 'medium' | 'high' | 'critical' = 'medium'
  ): Promise<ScalingAction[]> {
    try {
      logger.info('Generating scaling recommendations', {
        organizationId,
        urgency,
        utilization: currentUtilization
      });

      const actions: ScalingAction[] = [];

      // Check each resource type against thresholds
      for (const [resource, utilization] of Object.entries(currentUtilization)) {
        if (!['cpu', 'memory', 'storage', 'network'].includes(resource)) continue;

        const resourceType = resource as 'cpu' | 'memory' | 'storage' | 'network';
        const action = this.evaluateResourceScaling(
          resourceType,
          utilization,
          currentCapacity[resourceType],
          urgency
        );

        if (action) {
          actions.push(action);
        }
      }

      // Sort actions by priority
      actions.sort((a, b) => {
        const priorityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
        return priorityOrder[b.priority] - priorityOrder[a.priority];
      });

      logger.info('Scaling recommendations generated', {
        organizationId,
        actionsCount: actions.length,
        criticalActions: actions.filter(a => a.priority === 'critical').length
      });

      return actions;

    } catch (error) {
      logger.error('Scaling recommendations generation failed', {
        organizationId,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Predict when capacity will be exhausted
   */
  async predictCapacityExhaustion(
    currentCapacity: ResourceCapacity,
    workloadPrediction: WorkloadPredictionResult
  ): Promise<{
    exhaustionPoints: Array<{
      resource: 'cpu' | 'memory' | 'storage' | 'network';
      exhaustionTime: number;
      daysUntilExhaustion: number;
      severity: 'warning' | 'critical';
    }>;
    overallTimeToExhaustion: number;
    recommendations: string[];
  }> {
    try {
      const exhaustionPoints: any[] = [];
      const now = Date.now();

      // Analyze each resource type
      for (const resourceType of ['cpu', 'memory', 'storage', 'network'] as const) {
        const exhaustionTime = this.calculateResourceExhaustionTime(
          resourceType,
          currentCapacity[resourceType],
          workloadPrediction.resourceDemand
        );

        if (exhaustionTime > 0) {
          const daysUntilExhaustion = (exhaustionTime - now) / (24 * 60 * 60 * 1000);

          exhaustionPoints.push({
            resource: resourceType,
            exhaustionTime,
            daysUntilExhaustion: Math.ceil(daysUntilExhaustion),
            severity: daysUntilExhaustion < 7 ? 'critical' : 'warning'
          });
        }
      }

      // Find overall time to exhaustion (earliest)
      const overallTimeToExhaustion = exhaustionPoints.length > 0
        ? Math.min(...exhaustionPoints.map(p => p.exhaustionTime))
        : -1;

      // Generate recommendations based on exhaustion timeline
      const recommendations = this.generateExhaustionRecommendations(exhaustionPoints);

      logger.info('Capacity exhaustion prediction completed', {
        exhaustionPoints: exhaustionPoints.length,
        overallDays: overallTimeToExhaustion > 0
          ? Math.ceil((overallTimeToExhaustion - now) / (24 * 60 * 60 * 1000))
          : -1
      });

      return {
        exhaustionPoints,
        overallTimeToExhaustion,
        recommendations
      };

    } catch (error) {
      logger.error('Capacity exhaustion prediction failed', { error });
      throw error;
    }
  }

  // Private helper methods

  private calculateCurrentUtilization(capacity: ResourceCapacity): Record<string, number> {
    return {
      cpu: ((capacity.cpu.total - capacity.cpu.available) / capacity.cpu.total) * 100,
      memory: ((capacity.memory.totalGB - capacity.memory.availableGB) / capacity.memory.totalGB) * 100,
      storage: ((capacity.storage.totalGB - capacity.storage.availableGB) / capacity.storage.totalGB) * 100,
      network: ((capacity.network.bandwidthMbps - capacity.network.availableMbps) / capacity.network.bandwidthMbps) * 100
    };
  }

  private async generatePlannedCapacity(
    resourceDemands: ResourceDemandPrediction[],
    currentCapacity: ResourceCapacity,
    constraints: CapacityConstraints,
    timeHorizon: 'short' | 'medium' | 'long'
  ): Promise<CapacityPlan['plannedCapacity']> {
    const plannedCapacity: CapacityPlan['plannedCapacity'] = [];
    const horizonHours = this.config.planningHorizons[timeHorizon];

    // Group demands by time periods
    const timePeriods = this.groupDemandsByTimePeriods(resourceDemands, horizonHours);

    for (const [periodStart, demands] of timePeriods) {
      // Calculate peak demand for this period
      const peakDemand = this.calculatePeakDemand(demands);

      // Determine required capacity with safety margins
      const requiredCapacity = this.calculateRequiredCapacity(
        peakDemand,
        constraints.technical.redundancyFactor
      );

      // Check if capacity change is needed
      if (this.shouldAdjustCapacity(requiredCapacity, currentCapacity)) {
        const newCapacity = this.adjustCapacity(currentCapacity, requiredCapacity);
        const cost = await this.estimateCapacityCost(newCapacity, constraints.budget);
        const riskLevel = this.assessCapacityChangeRisk(currentCapacity, newCapacity);

        plannedCapacity.push({
          timestamp: periodStart,
          capacity: newCapacity,
          reason: this.generateCapacityChangeReason(currentCapacity, requiredCapacity),
          cost,
          riskLevel
        });
      }
    }

    return plannedCapacity;
  }

  private async performCostAnalysis(
    currentCapacity: ResourceCapacity,
    plannedCapacity: CapacityPlan['plannedCapacity'],
    budget: CapacityConstraints['budget']
  ): Promise<CapacityPlan['costAnalysis']> {
    // Calculate current monthly cost
    const currentMonthlyCost = await this.calculateMonthlyCost(currentCapacity, budget);

    // Calculate projected monthly cost
    const futureCapacity = plannedCapacity.length > 0
      ? plannedCapacity[plannedCapacity.length - 1].capacity
      : currentCapacity;
    const projectedMonthlyCost = await this.calculateMonthlyCost(futureCapacity, budget);

    // Identify cost savings opportunities
    const savingsOpportunities = await this.identifyCostSavingsOpportunities(
      currentCapacity,
      futureCapacity,
      budget
    );

    // Calculate cost optimization score
    const costOptimizationScore = this.calculateCostOptimizationScore(
      currentMonthlyCost,
      projectedMonthlyCost,
      savingsOpportunities
    );

    return {
      currentMonthlyCost,
      projectedMonthlyCost,
      savingsOpportunities,
      costOptimizationScore
    };
  }

  private async assessCapacityRisks(
    plannedCapacity: CapacityPlan['plannedCapacity'],
    workloadPrediction: WorkloadPredictionResult,
    constraints: CapacityConstraints
  ): Promise<CapacityPlan['riskAssessment']> {
    const capacityRisks: any[] = [];

    // Risk: Insufficient capacity during peak times
    if (workloadPrediction.anomalyProbability > 0.3) {
      capacityRisks.push({
        type: 'anomaly_spike',
        probability: workloadPrediction.anomalyProbability,
        impact: 'high',
        mitigation: 'Implement auto-scaling with higher thresholds and emergency capacity reserves'
      });
    }

    // Risk: Budget overrun
    const budgetRisk = this.assessBudgetRisk(plannedCapacity, constraints.budget);
    if (budgetRisk.probability > 0.2) {
      capacityRisks.push(budgetRisk);
    }

    // Risk: SLA violations
    const slaRisk = this.assessSLARisk(plannedCapacity, constraints.sla);
    if (slaRisk.probability > 0.1) {
      capacityRisks.push(slaRisk);
    }

    // Calculate overall risk score
    const overallRiskScore = this.calculateOverallRiskScore(capacityRisks);

    return {
      capacityRisks,
      overallRiskScore
    };
  }

  private async generateCapacityRecommendations(
    plannedCapacity: CapacityPlan['plannedCapacity'],
    costAnalysis: CapacityPlan['costAnalysis'],
    riskAssessment: CapacityPlan['riskAssessment'],
    workloadPrediction: WorkloadPredictionResult
  ): Promise<CapacityPlan['recommendations']> {
    const immediate: string[] = [];
    const shortTerm: string[] = [];
    const longTerm: string[] = [];

    // Immediate recommendations (next 24 hours)
    const urgentChanges = plannedCapacity.filter(p =>
      p.timestamp < Date.now() + (24 * 60 * 60 * 1000) && p.riskLevel === 'high'
    );
    if (urgentChanges.length > 0) {
      immediate.push(`Implement ${urgentChanges.length} urgent capacity changes within 24 hours`);
    }

    if (riskAssessment.overallRiskScore > 70) {
      immediate.push('High capacity risk detected - implement monitoring and alerting');
    }

    // Short-term recommendations (next week)
    if (costAnalysis.projectedMonthlyCost > costAnalysis.currentMonthlyCost * 1.2) {
      shortTerm.push('Cost increase >20% projected - review optimization opportunities');
    }

    const costSavingsTotal = costAnalysis.savingsOpportunities
      .reduce((sum, opp) => sum + opp.potentialSavings, 0);
    if (costSavingsTotal > costAnalysis.currentMonthlyCost * 0.1) {
      shortTerm.push(`Implement cost optimizations for $${costSavingsTotal.toFixed(0)}/month savings`);
    }

    // Long-term recommendations (next month+)
    if (workloadPrediction.detectedPatterns.length > 0) {
      longTerm.push('Implement predictive scaling based on detected workload patterns');
    }

    if (costAnalysis.costOptimizationScore < 70) {
      longTerm.push('Develop comprehensive cost optimization strategy');
    }

    return { immediate, shortTerm, longTerm };
  }

  private groupDemandsByTimePeriods(
    demands: ResourceDemandPrediction[],
    horizonHours: number
  ): Map<number, ResourceDemandPrediction[]> {
    const periods = new Map<number, ResourceDemandPrediction[]>();
    const periodDuration = Math.max(1, Math.floor(horizonHours / 10)) * 60 * 60 * 1000; // 10 periods max

    demands.forEach(demand => {
      const periodStart = Math.floor(demand.timestamp / periodDuration) * periodDuration;
      const periodDemands = periods.get(periodStart) || [];
      periodDemands.push(demand);
      periods.set(periodStart, periodDemands);
    });

    return periods;
  }

  private calculatePeakDemand(demands: ResourceDemandPrediction[]): ResourceDemandPrediction {
    return demands.reduce((peak, current) => {
      const currentTotal = current.resources.cpu.cores +
                          current.resources.memory.totalMB +
                          current.resources.storage.totalGB +
                          current.resources.network.bandwidthMbps;

      const peakTotal = peak.resources.cpu.cores +
                       peak.resources.memory.totalMB +
                       peak.resources.storage.totalGB +
                       peak.resources.network.bandwidthMbps;

      return currentTotal > peakTotal ? current : peak;
    });
  }

  private calculateRequiredCapacity(
    peakDemand: ResourceDemandPrediction,
    redundancyFactor: number
  ): ResourceCapacity {
    const safetyMargins = this.config.safetyMargins;

    return {
      cpu: {
        total: Math.ceil(peakDemand.resources.cpu.cores * redundancyFactor * (1 + safetyMargins.cpu / 100)),
        available: Math.ceil(peakDemand.resources.cpu.cores * redundancyFactor * (1 + safetyMargins.cpu / 100)),
        reserved: 0,
        utilizationTarget: 70
      },
      memory: {
        totalGB: Math.ceil(peakDemand.resources.memory.totalMB / 1024 * redundancyFactor * (1 + safetyMargins.memory / 100)),
        availableGB: Math.ceil(peakDemand.resources.memory.totalMB / 1024 * redundancyFactor * (1 + safetyMargins.memory / 100)),
        reservedGB: 0,
        utilizationTarget: 80
      },
      storage: {
        totalGB: Math.ceil(peakDemand.resources.storage.totalGB * redundancyFactor * (1 + safetyMargins.storage / 100)),
        availableGB: Math.ceil(peakDemand.resources.storage.totalGB * redundancyFactor * (1 + safetyMargins.storage / 100)),
        reservedGB: 0,
        iopsCapacity: peakDemand.resources.storage.iopsRequired * redundancyFactor,
        utilizationTarget: 85
      },
      network: {
        bandwidthMbps: Math.ceil(peakDemand.resources.network.bandwidthMbps * redundancyFactor * (1 + safetyMargins.network / 100)),
        availableMbps: Math.ceil(peakDemand.resources.network.bandwidthMbps * redundancyFactor * (1 + safetyMargins.network / 100)),
        reservedMbps: 0,
        utilizationTarget: 75
      }
    };
  }

  private shouldAdjustCapacity(required: ResourceCapacity, current: ResourceCapacity): boolean {
    const cpuDiff = Math.abs(required.cpu.total - current.cpu.total) / current.cpu.total;
    const memoryDiff = Math.abs(required.memory.totalGB - current.memory.totalGB) / current.memory.totalGB;
    const storageDiff = Math.abs(required.storage.totalGB - current.storage.totalGB) / current.storage.totalGB;
    const networkDiff = Math.abs(required.network.bandwidthMbps - current.network.bandwidthMbps) / current.network.bandwidthMbps;

    // Adjust if any resource differs by more than 15%
    return cpuDiff > 0.15 || memoryDiff > 0.15 || storageDiff > 0.15 || networkDiff > 0.15;
  }

  private adjustCapacity(current: ResourceCapacity, required: ResourceCapacity): ResourceCapacity {
    return {
      cpu: {
        ...current.cpu,
        total: Math.max(required.cpu.total, current.cpu.total),
        available: Math.max(required.cpu.available, current.cpu.available)
      },
      memory: {
        ...current.memory,
        totalGB: Math.max(required.memory.totalGB, current.memory.totalGB),
        availableGB: Math.max(required.memory.availableGB, current.memory.availableGB)
      },
      storage: {
        ...current.storage,
        totalGB: Math.max(required.storage.totalGB, current.storage.totalGB),
        availableGB: Math.max(required.storage.availableGB, current.storage.availableGB),
        iopsCapacity: Math.max(required.storage.iopsCapacity, current.storage.iopsCapacity)
      },
      network: {
        ...current.network,
        bandwidthMbps: Math.max(required.network.bandwidthMbps, current.network.bandwidthMbps),
        availableMbps: Math.max(required.network.availableMbps, current.network.availableMbps)
      }
    };
  }

  private generateCapacityChangeReason(current: ResourceCapacity, required: ResourceCapacity): string {
    const reasons: string[] = [];

    if (required.cpu.total > current.cpu.total) reasons.push('CPU scaling required');
    if (required.memory.totalGB > current.memory.totalGB) reasons.push('Memory scaling required');
    if (required.storage.totalGB > current.storage.totalGB) reasons.push('Storage scaling required');
    if (required.network.bandwidthMbps > current.network.bandwidthMbps) reasons.push('Network scaling required');

    return reasons.join(', ') || 'Optimization adjustment';
  }

  private assessCapacityChangeRisk(current: ResourceCapacity, newCapacity: ResourceCapacity): 'low' | 'medium' | 'high' {
    const cpuChange = Math.abs(newCapacity.cpu.total - current.cpu.total) / current.cpu.total;
    const memoryChange = Math.abs(newCapacity.memory.totalGB - current.memory.totalGB) / current.memory.totalGB;

    const maxChange = Math.max(cpuChange, memoryChange);

    if (maxChange > 0.5) return 'high';
    if (maxChange > 0.2) return 'medium';
    return 'low';
  }

  private initializeCostModels(): void {
    // Default AWS-like pricing (simplified)
    this.costModels.set('aws', {
      cpu: 0.096, // per vCPU per hour
      memory: 0.012, // per GB per hour
      storage: 0.10, // per GB per month
      network: 0.09  // per GB transferred
    });

    // Default Azure-like pricing (simplified)
    this.costModels.set('azure', {
      cpu: 0.089,
      memory: 0.011,
      storage: 0.12,
      network: 0.087
    });
  }

  private async calculateMonthlyCost(capacity: ResourceCapacity, budget: CapacityConstraints['budget']): Promise<number> {
    const costModel = this.costModels.get('aws') || this.costModels.get('azure'); // Default to AWS
    if (!costModel) return 0;

    const hoursPerMonth = 24 * 30; // 720 hours

    const cpuCost = capacity.cpu.total * costModel.cpu * hoursPerMonth;
    const memoryCost = capacity.memory.totalGB * costModel.memory * hoursPerMonth;
    const storageCost = capacity.storage.totalGB * costModel.storage; // Already monthly
    const networkCost = (capacity.network.bandwidthMbps / 8 * 3600 * hoursPerMonth / 1024) * costModel.network; // Estimated data transfer

    return cpuCost + memoryCost + storageCost + networkCost;
  }

  private async estimateCapacityCost(capacity: ResourceCapacity, budget: CapacityConstraints['budget']): Promise<number> {
    return this.calculateMonthlyCost(capacity, budget);
  }

  private async identifyCostSavingsOpportunities(
    current: ResourceCapacity,
    future: ResourceCapacity,
    budget: CapacityConstraints['budget']
  ): Promise<CapacityPlan['costAnalysis']['savingsOpportunities']> {
    const opportunities: CapacityPlan['costAnalysis']['savingsOpportunities'] = [];

    // Right-sizing opportunity
    const currentCost = await this.calculateMonthlyCost(current, budget);
    const optimizedCapacity = this.rightSizeCapacity(current);
    const optimizedCost = await this.calculateMonthlyCost(optimizedCapacity, budget);

    if (currentCost - optimizedCost > currentCost * 0.05) { // 5% savings threshold
      opportunities.push({
        description: 'Right-size over-provisioned resources',
        potentialSavings: currentCost - optimizedCost,
        implementationEffort: 'medium'
      });
    }

    // Reserved instance opportunity
    if (this.config.costOptimization.reservedInstancePlanning) {
      const reservedSavings = currentCost * 0.3; // Assume 30% savings with reserved instances
      opportunities.push({
        description: 'Purchase reserved instances for stable workloads',
        potentialSavings: reservedSavings,
        implementationEffort: 'low'
      });
    }

    // Spot instance opportunity
    if (this.config.costOptimization.spotInstanceUsage) {
      const spotSavings = currentCost * 0.6; // Assume 60% savings with spot instances
      opportunities.push({
        description: 'Use spot instances for fault-tolerant workloads',
        potentialSavings: spotSavings,
        implementationEffort: 'high'
      });
    }

    return opportunities;
  }

  private rightSizeCapacity(capacity: ResourceCapacity): ResourceCapacity {
    // Reduce capacity by removing unused resources (simplified)
    return {
      cpu: {
        ...capacity.cpu,
        total: Math.ceil(capacity.cpu.total * 0.8),
        available: Math.ceil(capacity.cpu.available * 0.8)
      },
      memory: {
        ...capacity.memory,
        totalGB: Math.ceil(capacity.memory.totalGB * 0.8),
        availableGB: Math.ceil(capacity.memory.availableGB * 0.8)
      },
      storage: {
        ...capacity.storage,
        totalGB: Math.ceil(capacity.storage.totalGB * 0.9),
        availableGB: Math.ceil(capacity.storage.availableGB * 0.9)
      },
      network: {
        ...capacity.network,
        bandwidthMbps: Math.ceil(capacity.network.bandwidthMbps * 0.85),
        availableMbps: Math.ceil(capacity.network.availableMbps * 0.85)
      }
    };
  }

  private calculateCostOptimizationScore(
    currentCost: number,
    projectedCost: number,
    savingsOpportunities: CapacityPlan['costAnalysis']['savingsOpportunities']
  ): number {
    const totalSavings = savingsOpportunities.reduce((sum, opp) => sum + opp.potentialSavings, 0);
    const savingsPercentage = currentCost > 0 ? (totalSavings / currentCost) * 100 : 0;

    // Score based on cost efficiency and optimization potential
    let score = 50; // Base score

    // Bonus for cost reduction
    if (projectedCost < currentCost) {
      score += 20;
    }

    // Bonus for identified savings opportunities
    score += Math.min(savingsPercentage, 30); // Max 30 points for savings opportunities

    return Math.min(score, 100);
  }

  private calculatePlanConfidence(
    predictionConfidence: number,
    riskScore: number,
    costOptimizationScore: number
  ): number {
    // Weighted combination of factors
    const weights = {
      prediction: 0.4,
      risk: 0.3,
      cost: 0.3
    };

    const normalizedRisk = 1 - (riskScore / 100); // Invert risk score
    const normalizedCost = costOptimizationScore / 100;

    return (predictionConfidence * weights.prediction) +
           (normalizedRisk * weights.risk) +
           (normalizedCost * weights.cost);
  }

  private assessBudgetRisk(
    plannedCapacity: CapacityPlan['plannedCapacity'],
    budget: CapacityConstraints['budget']
  ): any {
    // Simplified budget risk assessment
    const totalPlannedCost = plannedCapacity.reduce((sum, p) => sum + (p.cost || 0), 0);
    const budgetExceedance = Math.max(0, totalPlannedCost - budget.monthlyLimit) / budget.monthlyLimit;

    return {
      type: 'budget_overrun',
      probability: Math.min(budgetExceedance, 1),
      impact: budgetExceedance > 0.2 ? 'critical' : 'medium',
      mitigation: 'Implement cost controls and optimization measures'
    };
  }

  private assessSLARisk(
    plannedCapacity: CapacityPlan['plannedCapacity'],
    sla: CapacityConstraints['sla']
  ): any {
    // Simplified SLA risk assessment
    const hasHighRiskChanges = plannedCapacity.some(p => p.riskLevel === 'high');

    return {
      type: 'sla_violation',
      probability: hasHighRiskChanges ? 0.3 : 0.1,
      impact: 'high',
      mitigation: 'Implement gradual capacity changes during maintenance windows'
    };
  }

  private calculateOverallRiskScore(risks: any[]): number {
    if (risks.length === 0) return 0;

    const weightedRisks = risks.map(risk => {
      const impactWeights = { low: 1, medium: 2, high: 3, critical: 4 };
      return risk.probability * impactWeights[risk.impact];
    });

    const totalWeightedRisk = weightedRisks.reduce((sum, risk) => sum + risk, 0);
    const maxPossibleRisk = risks.length * 4; // Max weight

    return (totalWeightedRisk / maxPossibleRisk) * 100;
  }

  private evaluateResourceScaling(
    resourceType: 'cpu' | 'memory' | 'storage' | 'network',
    utilization: number,
    capacity: ResourceCapacity[typeof resourceType],
    urgency: 'low' | 'medium' | 'high' | 'critical'
  ): ScalingAction | null {
    const thresholds = this.config.utilizationThresholds;

    let actionType: ScalingAction['type'] | null = null;
    let priority: ScalingAction['priority'] = 'low';
    let targetValue = 0;

    if (utilization > thresholds.scaleUp) {
      actionType = 'scale_up';
      priority = utilization > thresholds.critical ? 'critical' : 'high';
      targetValue = this.calculateScaleUpTarget(resourceType, capacity, utilization);
    } else if (utilization < thresholds.scaleDown) {
      actionType = 'scale_down';
      priority = 'low';
      targetValue = this.calculateScaleDownTarget(resourceType, capacity, utilization);
    }

    if (!actionType) return null;

    return {
      actionId: this.generateActionId(),
      type: actionType,
      resource: resourceType,
      priority,
      details: {
        currentValue: this.getCurrentResourceValue(resourceType, capacity),
        targetValue,
        estimatedDuration: this.estimateScalingDuration(actionType, resourceType),
        estimatedCost: this.estimateScalingCost(actionType, resourceType, targetValue),
        rollbackPlan: `Revert ${resourceType} to previous capacity configuration`
      },
      schedule: {
        executeAt: Date.now() + (priority === 'critical' ? 0 : 5 * 60 * 1000), // Immediate for critical, 5 min for others
        maintenanceWindow: priority === 'low'
      },
      prerequisites: [`Verify ${resourceType} monitoring is operational`],
      risks: [`Potential brief ${resourceType} performance impact during scaling`],
      benefits: [`Improved ${resourceType} utilization and performance`]
    };
  }

  private calculateScaleUpTarget(
    resourceType: 'cpu' | 'memory' | 'storage' | 'network',
    capacity: ResourceCapacity[typeof resourceType],
    utilization: number
  ): number {
    const targetUtilization = capacity.utilizationTarget;
    const currentValue = this.getCurrentResourceValue(resourceType, capacity);

    // Scale to achieve target utilization
    return Math.ceil(currentValue * (utilization / targetUtilization) * 1.2); // 20% buffer
  }

  private calculateScaleDownTarget(
    resourceType: 'cpu' | 'memory' | 'storage' | 'network',
    capacity: ResourceCapacity[typeof resourceType],
    utilization: number
  ): number {
    const targetUtilization = capacity.utilizationTarget;
    const currentValue = this.getCurrentResourceValue(resourceType, capacity);

    // Scale down to achieve target utilization
    return Math.floor(currentValue * (utilization / targetUtilization) * 1.1); // 10% buffer
  }

  private getCurrentResourceValue(
    resourceType: 'cpu' | 'memory' | 'storage' | 'network',
    capacity: ResourceCapacity[typeof resourceType]
  ): number {
    switch (resourceType) {
      case 'cpu': return (capacity as ResourceCapacity['cpu']).total;
      case 'memory': return (capacity as ResourceCapacity['memory']).totalGB;
      case 'storage': return (capacity as ResourceCapacity['storage']).totalGB;
      case 'network': return (capacity as ResourceCapacity['network']).bandwidthMbps;
    }
  }

  private estimateScalingDuration(actionType: ScalingAction['type'], resourceType: string): number {
    // Duration in minutes
    const baseDurations = {
      cpu: 5,
      memory: 3,
      storage: 15,
      network: 10
    };

    const typeFactor = actionType === 'scale_up' ? 1 : 0.5; // Scale down is faster
    return (baseDurations[resourceType as keyof typeof baseDurations] || 5) * typeFactor;
  }

  private estimateScalingCost(actionType: ScalingAction['type'], resourceType: string, targetValue: number): number {
    // Simplified cost estimation
    const costModels = this.costModels.get('aws') || {};
    const hourlyRate = costModels[resourceType] || 0.1;

    return actionType === 'scale_up' ? targetValue * hourlyRate * 24 : 0; // Daily cost for scale up
  }

  private async generateScalingActions(plan: CapacityPlan): Promise<ScalingAction[]> {
    const actions: ScalingAction[] = [];

    // Generate actions for each planned capacity change
    plan.plannedCapacity.forEach(plannedChange => {
      const currentCapacity = plan.currentCapacity;
      const newCapacity = plannedChange.capacity;

      // Check each resource type for changes
      (['cpu', 'memory', 'storage', 'network'] as const).forEach(resourceType => {
        const currentValue = this.getCurrentResourceValue(resourceType, currentCapacity[resourceType]);
        const newValue = this.getCurrentResourceValue(resourceType, newCapacity[resourceType]);

        if (Math.abs(newValue - currentValue) / currentValue > 0.05) { // 5% change threshold
          const action: ScalingAction = {
            actionId: this.generateActionId(),
            type: newValue > currentValue ? 'scale_up' : 'scale_down',
            resource: resourceType,
            priority: plannedChange.riskLevel === 'high' ? 'high' : 'medium',
            details: {
              currentValue,
              targetValue: newValue,
              estimatedDuration: this.estimateScalingDuration(
                newValue > currentValue ? 'scale_up' : 'scale_down',
                resourceType
              ),
              estimatedCost: plannedChange.cost || 0,
              rollbackPlan: `Revert to ${currentValue} ${resourceType} units`
            },
            schedule: {
              executeAt: plannedChange.timestamp,
              maintenanceWindow: plannedChange.riskLevel !== 'high'
            },
            prerequisites: [`Backup current ${resourceType} configuration`],
            risks: [`Potential service disruption during ${resourceType} scaling`],
            benefits: [`Optimized ${resourceType} capacity for predicted workload`]
          };

          actions.push(action);
        }
      });
    });

    return actions;
  }

  private analyzeUtilizationPatterns(
    history: Array<{
      timestamp: number;
      cpu: number;
      memory: number;
      storage: number;
      network: number;
    }>
  ): {
    averages: Record<string, number>;
    peaks: Record<string, number>;
    trends: Record<string, 'increasing' | 'decreasing' | 'stable'>;
    efficiency: number;
  } {
    if (history.length === 0) {
      return {
        averages: { cpu: 0, memory: 0, storage: 0, network: 0 },
        peaks: { cpu: 0, memory: 0, storage: 0, network: 0 },
        trends: { cpu: 'stable', memory: 'stable', storage: 'stable', network: 'stable' },
        efficiency: 0
      };
    }

    const resources = ['cpu', 'memory', 'storage', 'network'] as const;
    const averages: Record<string, number> = {};
    const peaks: Record<string, number> = {};
    const trends: Record<string, 'increasing' | 'decreasing' | 'stable'> = {};

    resources.forEach(resource => {
      const values = history.map(h => h[resource]);
      averages[resource] = values.reduce((sum, val) => sum + val, 0) / values.length;
      peaks[resource] = Math.max(...values);

      // Simple trend calculation
      const firstHalf = values.slice(0, Math.floor(values.length / 2));
      const secondHalf = values.slice(Math.floor(values.length / 2));

      const firstAvg = firstHalf.reduce((sum, val) => sum + val, 0) / firstHalf.length;
      const secondAvg = secondHalf.reduce((sum, val) => sum + val, 0) / secondHalf.length;

      if (secondAvg > firstAvg * 1.1) {
        trends[resource] = 'increasing';
      } else if (secondAvg < firstAvg * 0.9) {
        trends[resource] = 'decreasing';
      } else {
        trends[resource] = 'stable';
      }
    });

    // Calculate overall efficiency (how well resources are utilized)
    const totalAvgUtilization = Object.values(averages).reduce((sum, avg) => sum + avg, 0) / resources.length;
    const efficiency = Math.min(totalAvgUtilization / 70, 1); // Target 70% utilization

    return { averages, peaks, trends, efficiency };
  }

  private identifyOptimizationOpportunities(
    currentCapacity: ResourceCapacity,
    utilizationAnalysis: ReturnType<typeof this.analyzeUtilizationPatterns>,
    constraints: CapacityConstraints
  ): Array<{
    type: 'right_size' | 'spot_instance' | 'reserved_instance' | 'storage_tier';
    resource: 'cpu' | 'memory' | 'storage' | 'network' | 'all';
    currentValue: number;
    optimizedValue: number;
    estimatedSavings: number;
    riskLevel: 'low' | 'medium' | 'high';
  }> {
    const opportunities: any[] = [];

    // Right-sizing opportunities
    Object.entries(utilizationAnalysis.averages).forEach(([resource, avgUtilization]) => {
      if (avgUtilization < 40) { // Under-utilized
        const resourceType = resource as 'cpu' | 'memory' | 'storage' | 'network';
        const currentValue = this.getCurrentResourceValue(resourceType, currentCapacity[resourceType]);
        const optimizedValue = Math.ceil(currentValue * 0.7); // Reduce by 30%

        opportunities.push({
          type: 'right_size',
          resource: resourceType,
          currentValue,
          optimizedValue,
          estimatedSavings: (currentValue - optimizedValue) * 100, // Simplified savings
          riskLevel: 'low'
        });
      }
    });

    return opportunities;
  }

  private calculateOptimizedCapacity(
    currentCapacity: ResourceCapacity,
    optimizations: ReturnType<typeof this.identifyOptimizationOpportunities>
  ): ResourceCapacity {
    const optimized = JSON.parse(JSON.stringify(currentCapacity)); // Deep copy

    optimizations.forEach(opt => {
      if (opt.type === 'right_size') {
        switch (opt.resource) {
          case 'cpu':
            optimized.cpu.total = opt.optimizedValue;
            optimized.cpu.available = opt.optimizedValue;
            break;
          case 'memory':
            optimized.memory.totalGB = opt.optimizedValue;
            optimized.memory.availableGB = opt.optimizedValue;
            break;
          case 'storage':
            optimized.storage.totalGB = opt.optimizedValue;
            optimized.storage.availableGB = opt.optimizedValue;
            break;
          case 'network':
            optimized.network.bandwidthMbps = opt.optimizedValue;
            optimized.network.availableMbps = opt.optimizedValue;
            break;
        }
      }
    });

    return optimized;
  }

  private async estimateCostSavings(
    currentCapacity: ResourceCapacity,
    optimizedCapacity: ResourceCapacity,
    budget: CapacityConstraints['budget']
  ): Promise<number> {
    const currentCost = await this.calculateMonthlyCost(currentCapacity, budget);
    const optimizedCost = await this.calculateMonthlyCost(optimizedCapacity, budget);
    return Math.max(0, currentCost - optimizedCost);
  }

  private assessPerformanceImpact(
    currentCapacity: ResourceCapacity,
    optimizedCapacity: ResourceCapacity,
    utilizationAnalysis: ReturnType<typeof this.analyzeUtilizationPatterns>
  ): string {
    const reductions = {
      cpu: (currentCapacity.cpu.total - optimizedCapacity.cpu.total) / currentCapacity.cpu.total,
      memory: (currentCapacity.memory.totalGB - optimizedCapacity.memory.totalGB) / currentCapacity.memory.totalGB,
      storage: (currentCapacity.storage.totalGB - optimizedCapacity.storage.totalGB) / currentCapacity.storage.totalGB,
      network: (currentCapacity.network.bandwidthMbps - optimizedCapacity.network.bandwidthMbps) / currentCapacity.network.bandwidthMbps
    };

    const maxReduction = Math.max(...Object.values(reductions));

    if (maxReduction > 0.3) return 'High - Significant performance impact expected';
    if (maxReduction > 0.15) return 'Medium - Moderate performance impact possible';
    if (maxReduction > 0.05) return 'Low - Minimal performance impact expected';
    return 'Negligible - No significant performance impact expected';
  }

  private generateOptimizationRecommendations(
    optimizations: ReturnType<typeof this.identifyOptimizationOpportunities>,
    costSavings: number,
    performanceImpact: string
  ): string[] {
    const recommendations: string[] = [];

    if (optimizations.length > 0) {
      recommendations.push(`${optimizations.length} optimization opportunities identified`);

      const totalSavings = optimizations.reduce((sum, opt) => sum + opt.estimatedSavings, 0);
      if (totalSavings > 1000) {
        recommendations.push(`Implement optimizations for $${totalSavings.toFixed(0)}/month potential savings`);
      }
    }

    if (costSavings > 0) {
      recommendations.push(`Projected monthly savings: $${costSavings.toFixed(0)}`);
    }

    if (performanceImpact.startsWith('High') || performanceImpact.startsWith('Medium')) {
      recommendations.push('Test optimizations in staging environment before production deployment');
    }

    const lowRiskOptimizations = optimizations.filter(opt => opt.riskLevel === 'low');
    if (lowRiskOptimizations.length > 0) {
      recommendations.push(`Start with ${lowRiskOptimizations.length} low-risk optimizations`);
    }

    return recommendations;
  }

  private calculateResourceExhaustionTime(
    resourceType: 'cpu' | 'memory' | 'storage' | 'network',
    capacity: ResourceCapacity[typeof resourceType],
    resourceDemands: ResourceDemandPrediction[]
  ): number {
    if (resourceDemands.length === 0) return -1;

    const availableCapacity = this.getCurrentResourceValue(resourceType, capacity);

    // Find when demand exceeds capacity
    for (const demand of resourceDemands.sort((a, b) => a.timestamp - b.timestamp)) {
      let demandValue = 0;

      switch (resourceType) {
        case 'cpu':
          demandValue = demand.resources.cpu.cores;
          break;
        case 'memory':
          demandValue = demand.resources.memory.totalMB / 1024;
          break;
        case 'storage':
          demandValue = demand.resources.storage.totalGB;
          break;
        case 'network':
          demandValue = demand.resources.network.bandwidthMbps;
          break;
      }

      if (demandValue > availableCapacity * 0.9) { // 90% threshold
        return demand.timestamp;
      }
    }

    return -1; // No exhaustion predicted
  }

  private generateExhaustionRecommendations(exhaustionPoints: any[]): string[] {
    const recommendations: string[] = [];

    if (exhaustionPoints.length === 0) {
      recommendations.push('No capacity exhaustion predicted in the forecast period');
      return recommendations;
    }

    const criticalPoints = exhaustionPoints.filter(p => p.severity === 'critical');
    if (criticalPoints.length > 0) {
      recommendations.push(`URGENT: ${criticalPoints.length} resources will be exhausted within 7 days`);
      criticalPoints.forEach(point => {
        recommendations.push(`Scale up ${point.resource} capacity before ${new Date(point.predictedTime).toDateString()}`);
      });
    }

    const warningPoints = exhaustionPoints.filter(p => p.severity === 'warning');
    if (warningPoints.length > 0) {
      recommendations.push(`Plan capacity increases for ${warningPoints.length} resources within the month`);
    }

    // General recommendations
    if (exhaustionPoints.some(p => p.resource === 'storage')) {
      recommendations.push('Consider implementing data archiving and cleanup policies');
    }

    if (exhaustionPoints.some(p => p.resource === 'network')) {
      recommendations.push('Evaluate content delivery network (CDN) implementation');
    }

    return recommendations;
  }

  private generatePlanId(): string {
    return `plan_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateActionId(): string {
    return `action_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get all active capacity plans
   */
  getActivePlans(): CapacityPlan[] {
    return Array.from(this.activePlans.values());
  }

  /**
   * Get specific capacity plan
   */
  getPlan(planId: string): CapacityPlan | undefined {
    return this.activePlans.get(planId);
  }

  /**
   * Get planned actions for a specific plan
   */
  getPlannedActions(planId: string): ScalingAction[] {
    return this.plannedActions.get(planId) || [];
  }

  /**
   * Get service metrics
   */
  getMetrics(): {
    activePlans: number;
    totalActions: number;
    lastUpdate: number;
    costOptimizationEnabled: boolean;
  } {
    const totalActions = Array.from(this.plannedActions.values())
      .reduce((sum, actions) => sum + actions.length, 0);

    return {
      activePlans: this.activePlans.size,
      totalActions,
      lastUpdate: this.lastPlanUpdate,
      costOptimizationEnabled: this.config.costOptimization.enabled
    };
  }

  /**
   * Clear all plans and actions
   */
  clearPlans(): void {
    this.activePlans.clear();
    this.plannedActions.clear();
    logger.info('CapacityPlanner plans cleared');
  }
}