/**
 * Predictive Scaler for Real-Time Auto-Scaling Decisions
 *
 * Implements intelligent auto-scaling logic that combines real-time metrics
 * with predictive analytics to make proactive scaling decisions, ensuring
 * optimal performance while minimizing costs.
 */

import { EventEmitter } from 'events';
import { z } from 'zod';
import { logger } from '../core/Logger.js';
import type { WorkloadPredictionResult, WorkloadDemand } from './WorkloadPredictionService.js';
import type { CapacityPlan, ScalingAction, ResourceCapacity } from './CapacityPlanner.js';

// Core scaling schemas
export const ScalingMetricsSchema = z.object({
  timestamp: z.number(),
  organizationId: z.string(),

  // Current system metrics
  currentMetrics: z.object({
    cpu: z.object({
      utilization: z.number().min(0).max(100),
      cores: z.number().min(0),
      loadAverage: z.number().min(0).optional()
    }),
    memory: z.object({
      utilization: z.number().min(0).max(100),
      usedGB: z.number().min(0),
      availableGB: z.number().min(0)
    }),
    storage: z.object({
      utilization: z.number().min(0).max(100),
      usedGB: z.number().min(0),
      availableGB: z.number().min(0),
      iopsUsage: z.number().min(0).optional()
    }),
    network: z.object({
      utilization: z.number().min(0).max(100),
      bandwidthUsedMbps: z.number().min(0),
      connectionsActive: z.number().min(0).optional()
    }),
    queue: z.object({
      depth: z.number().min(0),
      waitTime: z.number().min(0),
      throughput: z.number().min(0)
    })
  }),

  // Performance indicators
  performance: z.object({
    responseTime: z.number().min(0),
    errorRate: z.number().min(0).max(100),
    throughput: z.number().min(0),
    concurrentUsers: z.number().min(0)
  }),

  // Trend indicators
  trends: z.object({
    cpuTrend: z.enum(['increasing', 'decreasing', 'stable']),
    memoryTrend: z.enum(['increasing', 'decreasing', 'stable']),
    loadTrend: z.enum(['increasing', 'decreasing', 'stable']),
    confidence: z.number().min(0).max(1)
  })
});

export const ScalingDecisionSchema = z.object({
  decisionId: z.string(),
  timestamp: z.number(),
  organizationId: z.string(),

  // Decision details
  action: z.enum(['scale_up', 'scale_down', 'maintain', 'optimize']),
  resource: z.enum(['cpu', 'memory', 'storage', 'network', 'instances']),
  urgency: z.enum(['low', 'medium', 'high', 'critical']),

  // Scaling parameters
  currentCapacity: z.number(),
  targetCapacity: z.number(),
  scalingFactor: z.number(),

  // Decision rationale
  triggers: z.array(z.object({
    type: z.enum(['reactive', 'predictive', 'scheduled', 'manual']),
    metric: z.string(),
    threshold: z.number(),
    currentValue: z.number(),
    severity: z.enum(['low', 'medium', 'high', 'critical'])
  })),

  // Predictions used
  predictiveFactor: z.number().min(0).max(1),
  forecastHorizon: z.number(), // minutes
  confidence: z.number().min(0).max(1),

  // Risk assessment
  risks: z.array(z.string()),
  expectedOutcome: z.string(),
  rollbackPlan: z.string(),

  // Execution details
  executeAt: z.number(),
  estimatedDuration: z.number(),
  estimatedCost: z.number().optional()
});

export const ScalingRuleSchema = z.object({
  ruleId: z.string(),
  name: z.string(),
  description: z.string(),
  enabled: z.boolean().default(true),

  // Trigger conditions
  conditions: z.array(z.object({
    metric: z.string(),
    operator: z.enum(['gt', 'lt', 'gte', 'lte', 'eq']),
    threshold: z.number(),
    duration: z.number(), // seconds the condition must be true
    aggregation: z.enum(['avg', 'max', 'min', 'sum']).default('avg')
  })),

  // Scaling action
  action: z.object({
    type: z.enum(['scale_up', 'scale_down']),
    resource: z.enum(['cpu', 'memory', 'storage', 'network', 'instances']),
    adjustment: z.object({
      type: z.enum(['absolute', 'percentage', 'step']),
      value: z.number(),
      min: z.number().optional(),
      max: z.number().optional()
    }),
    cooldown: z.number().min(60).default(300) // seconds
  }),

  // Scheduling
  schedule: z.object({
    timezone: z.string().default('UTC'),
    activeHours: z.object({
      start: z.number().min(0).max(23),
      end: z.number().min(0).max(23)
    }).optional(),
    activeDays: z.array(z.number().min(0).max(6)).optional(), // 0=Sunday
    excludeDates: z.array(z.string()).default([])
  }).optional(),

  // Metadata
  priority: z.number().min(0).max(100).default(50),
  tags: z.array(z.string()).default([]),
  lastTriggered: z.number().optional()
});

export type ScalingMetrics = z.infer<typeof ScalingMetricsSchema>;
export type ScalingDecision = z.infer<typeof ScalingDecisionSchema>;
export type ScalingRule = z.infer<typeof ScalingRuleSchema>;

export interface PredictiveScalerConfig {
  // Scaling parameters
  scaling: {
    enabled: boolean;
    mode: 'reactive' | 'predictive' | 'hybrid';
    aggressiveness: 'conservative' | 'balanced' | 'aggressive';
    cooldownPeriod: number; // seconds
    maxScalingSteps: number;
  };

  // Prediction integration
  prediction: {
    enabled: boolean;
    horizonMinutes: number;
    confidenceThreshold: number;
    weightFactor: number; // How much to weight predictions vs current metrics
  };

  // Safety mechanisms
  safety: {
    minInstances: number;
    maxInstances: number;
    maxScalingRate: number; // percentage per minute
    safeguardThresholds: Record<string, number>;
    emergencyMode: boolean;
  };

  // Performance tuning
  performance: {
    metricsInterval: number; // milliseconds
    decisionInterval: number; // milliseconds
    batchSize: number;
    parallelProcessing: boolean;
  };

  // Cost optimization
  cost: {
    enabled: boolean;
    budgetLimit: number;
    costWeightFactor: number;
    spotInstanceUsage: boolean;
  };
}

export interface ScalingEvent {
  eventId: string;
  timestamp: number;
  type: 'scale_up' | 'scale_down' | 'optimization' | 'failure';
  before: ResourceCapacity;
  after: ResourceCapacity;
  duration: number;
  success: boolean;
  metrics: ScalingMetrics;
  decision: ScalingDecision;
  outcome: {
    performanceImprovement: number;
    costImpact: number;
    stabilityScore: number;
  };
}

export class PredictiveScaler extends EventEmitter {
  private config: PredictiveScalerConfig;
  private scalingRules: Map<string, ScalingRule>;
  private recentDecisions: Map<string, ScalingDecision[]>;
  private scalingHistory: Map<string, ScalingEvent[]>;
  private lastMetrics: Map<string, ScalingMetrics>;
  private cooldownTracker: Map<string, number>;
  private isProcessing: Map<string, boolean>;

  // Performance tracking
  private decisionLatency: number[];
  private scalingSuccess: number;
  private totalScalingAttempts: number;

  constructor(config: Partial<PredictiveScalerConfig> = {}) {
    super();

    this.config = {
      scaling: {
        enabled: true,
        mode: 'hybrid',
        aggressiveness: 'balanced',
        cooldownPeriod: 300, // 5 minutes
        maxScalingSteps: 3
      },
      prediction: {
        enabled: true,
        horizonMinutes: 15,
        confidenceThreshold: 0.7,
        weightFactor: 0.4 // 40% prediction, 60% current metrics
      },
      safety: {
        minInstances: 1,
        maxInstances: 50,
        maxScalingRate: 50, // 50% per minute max
        safeguardThresholds: {
          cpu: 95,
          memory: 90,
          errorRate: 10
        },
        emergencyMode: false
      },
      performance: {
        metricsInterval: 30000, // 30 seconds
        decisionInterval: 60000, // 1 minute
        batchSize: 10,
        parallelProcessing: true
      },
      cost: {
        enabled: true,
        budgetLimit: 10000, // $10k monthly
        costWeightFactor: 0.3,
        spotInstanceUsage: true
      },
      ...config
    };

    this.scalingRules = new Map();
    this.recentDecisions = new Map();
    this.scalingHistory = new Map();
    this.lastMetrics = new Map();
    this.cooldownTracker = new Map();
    this.isProcessing = new Map();

    this.decisionLatency = [];
    this.scalingSuccess = 0;
    this.totalScalingAttempts = 0;

    // Initialize default scaling rules
    this.initializeDefaultRules();

    // Start monitoring loops
    this.startMonitoring();

    logger.info('PredictiveScaler initialized', { config: this.config });
  }

  /**
   * Process real-time metrics and make scaling decisions
   */
  async processMetrics(
    metrics: ScalingMetrics,
    prediction?: WorkloadPredictionResult,
    capacityPlan?: CapacityPlan
  ): Promise<ScalingDecision | null> {
    const startTime = Date.now();

    try {
      const organizationId = metrics.organizationId;

      // Check if already processing for this organization
      if (this.isProcessing.get(organizationId)) {
        logger.debug('Scaling decision already in progress', { organizationId });
        return null;
      }

      this.isProcessing.set(organizationId, true);

      logger.debug('Processing scaling metrics', {
        organizationId,
        cpuUtilization: metrics.currentMetrics.cpu.utilization,
        memoryUtilization: metrics.currentMetrics.memory.utilization
      });

      // Store current metrics
      this.lastMetrics.set(organizationId, metrics);

      // Check if we're in cooldown period
      if (this.isInCooldown(organizationId)) {
        logger.debug('Scaling in cooldown period', { organizationId });
        return null;
      }

      // Evaluate scaling rules
      const triggeredRules = await this.evaluateScalingRules(metrics);

      // Analyze metrics for scaling needs
      const reactiveDecision = await this.analyzeReactiveScaling(metrics);

      // Analyze predictions for proactive scaling
      const predictiveDecision = await this.analyzePredictiveScaling(
        metrics,
        prediction,
        capacityPlan
      );

      // Combine reactive and predictive decisions
      const finalDecision = await this.combineScalingDecisions(
        reactiveDecision,
        predictiveDecision,
        triggeredRules,
        metrics
      );

      if (finalDecision) {
        // Validate decision against safety constraints
        const validatedDecision = await this.validateScalingDecision(finalDecision, metrics);

        if (validatedDecision) {
          // Record decision
          this.recordDecision(organizationId, validatedDecision);

          // Execute if immediate
          if (validatedDecision.urgency === 'critical' || validatedDecision.urgency === 'high') {
            await this.executeScalingDecision(validatedDecision);
          }

          // Update performance metrics
          const latency = Date.now() - startTime;
          this.decisionLatency.push(latency);
          if (this.decisionLatency.length > 100) {
            this.decisionLatency.shift(); // Keep last 100 measurements
          }

          this.emit('scalingDecision', validatedDecision);

          logger.info('Scaling decision made', {
            organizationId,
            decisionId: validatedDecision.decisionId,
            action: validatedDecision.action,
            resource: validatedDecision.resource,
            urgency: validatedDecision.urgency,
            latency
          });

          return validatedDecision;
        }
      }

      return null;

    } catch (error) {
      logger.error('Scaling metrics processing failed', {
        organizationId: metrics.organizationId,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    } finally {
      this.isProcessing.set(metrics.organizationId, false);
    }
  }

  /**
   * Add or update a scaling rule
   */
  addScalingRule(rule: ScalingRule): void {
    try {
      const validatedRule = ScalingRuleSchema.parse(rule);
      this.scalingRules.set(validatedRule.ruleId, validatedRule);

      logger.info('Scaling rule added', {
        ruleId: validatedRule.ruleId,
        name: validatedRule.name,
        enabled: validatedRule.enabled
      });

      this.emit('ruleAdded', validatedRule);
    } catch (error) {
      logger.error('Failed to add scaling rule', {
        ruleId: rule.ruleId,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Execute a scaling decision
   */
  async executeScalingDecision(decision: ScalingDecision): Promise<ScalingEvent> {
    const startTime = Date.now();

    try {
      this.totalScalingAttempts++;

      logger.info('Executing scaling decision', {
        decisionId: decision.decisionId,
        action: decision.action,
        resource: decision.resource,
        targetCapacity: decision.targetCapacity
      });

      // Get current capacity
      const currentMetrics = this.lastMetrics.get(decision.organizationId);
      if (!currentMetrics) {
        throw new Error('No current metrics available for scaling execution');
      }

      const beforeCapacity = this.metricsToCapacity(currentMetrics);

      // Simulate scaling execution (in production, this would integrate with infrastructure APIs)
      const success = await this.performScaling(decision);

      // Calculate new capacity
      const afterCapacity = this.calculateNewCapacity(beforeCapacity, decision);

      // Create scaling event
      const event: ScalingEvent = {
        eventId: this.generateEventId(),
        timestamp: startTime,
        type: decision.action === 'scale_up' ? 'scale_up' :
              decision.action === 'scale_down' ? 'scale_down' : 'optimization',
        before: beforeCapacity,
        after: afterCapacity,
        duration: Date.now() - startTime,
        success,
        metrics: currentMetrics,
        decision,
        outcome: {
          performanceImprovement: success ? this.estimatePerformanceImprovement(decision) : 0,
          costImpact: this.calculateCostImpact(beforeCapacity, afterCapacity),
          stabilityScore: success ? 0.9 : 0.3
        }
      };

      // Record scaling event
      this.recordScalingEvent(decision.organizationId, event);

      // Update success rate
      if (success) {
        this.scalingSuccess++;
      }

      // Set cooldown period
      this.setCooldown(decision.organizationId);

      this.emit('scalingExecuted', event);

      logger.info('Scaling decision executed', {
        decisionId: decision.decisionId,
        success,
        duration: event.duration,
        costImpact: event.outcome.costImpact
      });

      return event;

    } catch (error) {
      logger.error('Scaling execution failed', {
        decisionId: decision.decisionId,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Get scaling recommendations for manual review
   */
  async getScalingRecommendations(
    organizationId: string,
    timeHorizon: number = 60 // minutes
  ): Promise<{
    immediate: ScalingDecision[];
    planned: ScalingDecision[];
    summary: {
      totalRecommendations: number;
      estimatedCostImpact: number;
      riskLevel: 'low' | 'medium' | 'high';
      confidence: number;
    };
  }> {
    try {
      const currentMetrics = this.lastMetrics.get(organizationId);
      if (!currentMetrics) {
        throw new Error('No metrics available for recommendations');
      }

      // Get recent decisions to avoid duplicates
      const recentDecisions = this.recentDecisions.get(organizationId) || [];
      const cutoff = Date.now() - (timeHorizon * 60 * 1000);
      const relevantDecisions = recentDecisions.filter(d => d.timestamp > cutoff);

      // Analyze current state
      const immediate = await this.generateImmediateRecommendations(currentMetrics);
      const planned = await this.generatePlannedRecommendations(currentMetrics, timeHorizon);

      // Filter out recent decisions
      const filteredImmediate = immediate.filter(rec =>
        !relevantDecisions.some(recent =>
          recent.resource === rec.resource && recent.action === rec.action
        )
      );

      const filteredPlanned = planned.filter(rec =>
        !relevantDecisions.some(recent =>
          recent.resource === rec.resource && recent.action === rec.action
        )
      );

      // Calculate summary
      const totalRecommendations = filteredImmediate.length + filteredPlanned.length;
      const estimatedCostImpact = [...filteredImmediate, ...filteredPlanned]
        .reduce((sum, rec) => sum + (rec.estimatedCost || 0), 0);

      const riskLevel = this.assessRecommendationRisk(filteredImmediate, filteredPlanned);
      const confidence = this.calculateRecommendationConfidence(currentMetrics);

      logger.info('Scaling recommendations generated', {
        organizationId,
        immediate: filteredImmediate.length,
        planned: filteredPlanned.length,
        estimatedCostImpact,
        riskLevel
      });

      return {
        immediate: filteredImmediate,
        planned: filteredPlanned,
        summary: {
          totalRecommendations,
          estimatedCostImpact,
          riskLevel,
          confidence
        }
      };

    } catch (error) {
      logger.error('Failed to generate scaling recommendations', {
        organizationId,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  // Private methods

  private async evaluateScalingRules(metrics: ScalingMetrics): Promise<ScalingRule[]> {
    const triggeredRules: ScalingRule[] = [];

    for (const rule of this.scalingRules.values()) {
      if (!rule.enabled) continue;

      // Check schedule constraints
      if (!this.isRuleScheduleActive(rule)) continue;

      // Check cooldown
      if (rule.lastTriggered &&
          Date.now() - rule.lastTriggered < rule.action.cooldown * 1000) {
        continue;
      }

      // Evaluate conditions
      const conditionsMet = await this.evaluateRuleConditions(rule.conditions, metrics);

      if (conditionsMet) {
        triggeredRules.push(rule);
        rule.lastTriggered = Date.now();
      }
    }

    return triggeredRules.sort((a, b) => b.priority - a.priority);
  }

  private async evaluateRuleConditions(
    conditions: ScalingRule['conditions'],
    metrics: ScalingMetrics
  ): Promise<boolean> {
    for (const condition of conditions) {
      const metricValue = this.getMetricValue(metrics, condition.metric);
      if (metricValue === null) continue;

      const conditionMet = this.evaluateCondition(
        metricValue,
        condition.operator,
        condition.threshold
      );

      if (!conditionMet) return false;
    }

    return conditions.length > 0;
  }

  private getMetricValue(metrics: ScalingMetrics, metricPath: string): number | null {
    const parts = metricPath.split('.');
    let value: any = metrics;

    for (const part of parts) {
      if (value && typeof value === 'object' && part in value) {
        value = value[part];
      } else {
        return null;
      }
    }

    return typeof value === 'number' ? value : null;
  }

  private evaluateCondition(value: number, operator: string, threshold: number): boolean {
    switch (operator) {
      case 'gt': return value > threshold;
      case 'lt': return value < threshold;
      case 'gte': return value >= threshold;
      case 'lte': return value <= threshold;
      case 'eq': return value === threshold;
      default: return false;
    }
  }

  private async analyzeReactiveScaling(metrics: ScalingMetrics): Promise<ScalingDecision | null> {
    const { currentMetrics } = metrics;
    const urgentThresholds = this.config.safety.safeguardThresholds;

    // Check for critical resource exhaustion
    if (currentMetrics.cpu.utilization > urgentThresholds.cpu) {
      return this.createScalingDecision(metrics, {
        action: 'scale_up',
        resource: 'cpu',
        urgency: 'critical',
        triggers: [{
          type: 'reactive',
          metric: 'cpu.utilization',
          threshold: urgentThresholds.cpu,
          currentValue: currentMetrics.cpu.utilization,
          severity: 'critical'
        }],
        scalingFactor: this.calculateScalingFactor(currentMetrics.cpu.utilization, urgentThresholds.cpu)
      });
    }

    if (currentMetrics.memory.utilization > urgentThresholds.memory) {
      return this.createScalingDecision(metrics, {
        action: 'scale_up',
        resource: 'memory',
        urgency: 'critical',
        triggers: [{
          type: 'reactive',
          metric: 'memory.utilization',
          threshold: urgentThresholds.memory,
          currentValue: currentMetrics.memory.utilization,
          severity: 'critical'
        }],
        scalingFactor: this.calculateScalingFactor(currentMetrics.memory.utilization, urgentThresholds.memory)
      });
    }

    // Check performance degradation
    if (metrics.performance.errorRate > urgentThresholds.errorRate) {
      return this.createScalingDecision(metrics, {
        action: 'scale_up',
        resource: 'instances',
        urgency: 'high',
        triggers: [{
          type: 'reactive',
          metric: 'performance.errorRate',
          threshold: urgentThresholds.errorRate,
          currentValue: metrics.performance.errorRate,
          severity: 'high'
        }],
        scalingFactor: 1.5 // Scale up instances by 50%
      });
    }

    return null;
  }

  private async analyzePredictiveScaling(
    metrics: ScalingMetrics,
    prediction?: WorkloadPredictionResult,
    capacityPlan?: CapacityPlan
  ): Promise<ScalingDecision | null> {
    if (!this.config.prediction.enabled || !prediction) {
      return null;
    }

    const horizonMs = this.config.prediction.horizonMinutes * 60 * 1000;
    const targetTime = Date.now() + horizonMs;

    // Find predicted demand closest to target time
    const targetDemand = prediction.workloadDemand.find(demand =>
      Math.abs(demand.timestamp - targetTime) < (30 * 60 * 1000) // Within 30 minutes
    );

    if (!targetDemand || targetDemand.confidenceLevel < this.config.prediction.confidenceThreshold) {
      return null;
    }

    // Find corresponding resource demand
    const resourceDemand = prediction.resourceDemand.find(resource =>
      Math.abs(resource.timestamp - targetTime) < (30 * 60 * 1000)
    );

    if (!resourceDemand) return null;

    // Calculate predicted scaling need
    const currentCapacity = this.metricsToCapacity(metrics);
    const requiredCapacity = resourceDemand.resources;

    // Check if predictive scaling is needed
    const cpuScalingNeeded = requiredCapacity.cpu.cores > currentCapacity.cpu.total * 0.8;
    const memoryScalingNeeded = requiredCapacity.memory.totalMB > currentCapacity.memory.totalGB * 1024 * 0.8;

    if (cpuScalingNeeded) {
      return this.createScalingDecision(metrics, {
        action: 'scale_up',
        resource: 'cpu',
        urgency: 'medium',
        triggers: [{
          type: 'predictive',
          metric: 'predicted.cpu.demand',
          threshold: currentCapacity.cpu.total * 0.8,
          currentValue: requiredCapacity.cpu.cores,
          severity: 'medium'
        }],
        scalingFactor: requiredCapacity.cpu.cores / currentCapacity.cpu.total,
        predictiveFactor: this.config.prediction.weightFactor,
        forecastHorizon: this.config.prediction.horizonMinutes
      });
    }

    if (memoryScalingNeeded) {
      return this.createScalingDecision(metrics, {
        action: 'scale_up',
        resource: 'memory',
        urgency: 'medium',
        triggers: [{
          type: 'predictive',
          metric: 'predicted.memory.demand',
          threshold: currentCapacity.memory.totalGB * 0.8,
          currentValue: requiredCapacity.memory.totalMB / 1024,
          severity: 'medium'
        }],
        scalingFactor: (requiredCapacity.memory.totalMB / 1024) / currentCapacity.memory.totalGB,
        predictiveFactor: this.config.prediction.weightFactor,
        forecastHorizon: this.config.prediction.horizonMinutes
      });
    }

    return null;
  }

  private async combineScalingDecisions(
    reactive: ScalingDecision | null,
    predictive: ScalingDecision | null,
    triggeredRules: ScalingRule[],
    metrics: ScalingMetrics
  ): Promise<ScalingDecision | null> {
    // Priority order: reactive > rules > predictive
    if (reactive) {
      return reactive;
    }

    if (triggeredRules.length > 0) {
      const highestPriorityRule = triggeredRules[0];
      return this.ruleToScalingDecision(highestPriorityRule, metrics);
    }

    if (predictive && this.config.scaling.mode !== 'reactive') {
      return predictive;
    }

    return null;
  }

  private async validateScalingDecision(
    decision: ScalingDecision,
    metrics: ScalingMetrics
  ): Promise<ScalingDecision | null> {
    // Check safety constraints
    const currentCapacity = this.metricsToCapacity(metrics);
    const newCapacity = this.calculateNewCapacity(currentCapacity, decision);

    // Validate against instance limits
    const estimatedInstances = Math.ceil(newCapacity.cpu.total / 2); // Assume 2 cores per instance
    if (estimatedInstances < this.config.safety.minInstances ||
        estimatedInstances > this.config.safety.maxInstances) {
      logger.warn('Scaling decision violates instance limits', {
        decisionId: decision.decisionId,
        estimatedInstances,
        limits: {
          min: this.config.safety.minInstances,
          max: this.config.safety.maxInstances
        }
      });
      return null;
    }

    // Check scaling rate limits
    const scalingRate = Math.abs(decision.scalingFactor - 1) * 100;
    if (scalingRate > this.config.safety.maxScalingRate) {
      logger.warn('Scaling decision exceeds rate limit', {
        decisionId: decision.decisionId,
        scalingRate,
        limit: this.config.safety.maxScalingRate
      });

      // Adjust scaling factor
      const adjustedFactor = decision.scalingFactor > 1
        ? 1 + (this.config.safety.maxScalingRate / 100)
        : 1 - (this.config.safety.maxScalingRate / 100);

      decision.scalingFactor = adjustedFactor;
      decision.targetCapacity = decision.currentCapacity * adjustedFactor;
    }

    // Check budget constraints if cost optimization is enabled
    if (this.config.cost.enabled) {
      const costImpact = this.calculateCostImpact(currentCapacity, newCapacity);
      if (costImpact > this.config.cost.budgetLimit * 0.1) { // 10% of budget
        logger.warn('Scaling decision exceeds cost threshold', {
          decisionId: decision.decisionId,
          costImpact,
          threshold: this.config.cost.budgetLimit * 0.1
        });

        // Only proceed if urgency is critical
        if (decision.urgency !== 'critical') {
          return null;
        }
      }
    }

    return decision;
  }

  private createScalingDecision(
    metrics: ScalingMetrics,
    params: {
      action: ScalingDecision['action'];
      resource: ScalingDecision['resource'];
      urgency: ScalingDecision['urgency'];
      triggers: ScalingDecision['triggers'];
      scalingFactor: number;
      predictiveFactor?: number;
      forecastHorizon?: number;
    }
  ): ScalingDecision {
    const currentCapacity = this.getCurrentResourceValue(metrics, params.resource);

    return {
      decisionId: this.generateDecisionId(),
      timestamp: Date.now(),
      organizationId: metrics.organizationId,
      action: params.action,
      resource: params.resource,
      urgency: params.urgency,
      currentCapacity,
      targetCapacity: currentCapacity * params.scalingFactor,
      scalingFactor: params.scalingFactor,
      triggers: params.triggers,
      predictiveFactor: params.predictiveFactor || 0,
      forecastHorizon: params.forecastHorizon || 0,
      confidence: this.calculateDecisionConfidence(params.triggers, metrics),
      risks: this.assessDecisionRisks(params.action, params.resource, params.scalingFactor),
      expectedOutcome: this.generateExpectedOutcome(params.action, params.resource),
      rollbackPlan: this.generateRollbackPlan(params.action, params.resource, currentCapacity),
      executeAt: Date.now() + this.getExecutionDelay(params.urgency),
      estimatedDuration: this.estimateExecutionDuration(params.action, params.resource),
      estimatedCost: this.estimateScalingCost(currentCapacity, currentCapacity * params.scalingFactor)
    };
  }

  private getCurrentResourceValue(metrics: ScalingMetrics, resource: string): number {
    switch (resource) {
      case 'cpu': return metrics.currentMetrics.cpu.cores;
      case 'memory': return metrics.currentMetrics.memory.usedGB + metrics.currentMetrics.memory.availableGB;
      case 'storage': return metrics.currentMetrics.storage.usedGB + metrics.currentMetrics.storage.availableGB;
      case 'network': return metrics.currentMetrics.network.bandwidthUsedMbps;
      case 'instances': return Math.ceil(metrics.currentMetrics.cpu.cores / 2); // Estimate
      default: return 1;
    }
  }

  private calculateScalingFactor(currentValue: number, threshold: number): number {
    const base = this.config.scaling.aggressiveness === 'conservative' ? 1.2 :
                 this.config.scaling.aggressiveness === 'balanced' ? 1.5 : 2.0;

    const severity = Math.max(1, currentValue / threshold);
    return base * Math.min(severity, 3); // Cap at 3x scaling
  }

  private ruleToScalingDecision(rule: ScalingRule, metrics: ScalingMetrics): ScalingDecision {
    const currentCapacity = this.getCurrentResourceValue(metrics, rule.action.resource);
    let targetCapacity = currentCapacity;

    switch (rule.action.adjustment.type) {
      case 'absolute':
        targetCapacity = rule.action.adjustment.value;
        break;
      case 'percentage':
        targetCapacity = currentCapacity * (1 + rule.action.adjustment.value / 100);
        break;
      case 'step':
        targetCapacity = rule.action.type === 'scale_up'
          ? currentCapacity + rule.action.adjustment.value
          : currentCapacity - rule.action.adjustment.value;
        break;
    }

    // Apply min/max constraints
    if (rule.action.adjustment.min) {
      targetCapacity = Math.max(targetCapacity, rule.action.adjustment.min);
    }
    if (rule.action.adjustment.max) {
      targetCapacity = Math.min(targetCapacity, rule.action.adjustment.max);
    }

    return {
      decisionId: this.generateDecisionId(),
      timestamp: Date.now(),
      organizationId: metrics.organizationId,
      action: rule.action.type,
      resource: rule.action.resource,
      urgency: 'medium',
      currentCapacity,
      targetCapacity,
      scalingFactor: targetCapacity / currentCapacity,
      triggers: [{
        type: 'reactive',
        metric: rule.name,
        threshold: 0,
        currentValue: 1,
        severity: 'medium'
      }],
      predictiveFactor: 0,
      forecastHorizon: 0,
      confidence: 0.8,
      risks: [`Rule-based scaling: ${rule.name}`],
      expectedOutcome: `Execute scaling rule: ${rule.name}`,
      rollbackPlan: `Disable rule ${rule.ruleId} and revert changes`,
      executeAt: Date.now(),
      estimatedDuration: 5,
      estimatedCost: this.estimateScalingCost(currentCapacity, targetCapacity)
    };
  }

  private metricsToCapacity(metrics: ScalingMetrics): ResourceCapacity {
    return {
      cpu: {
        total: metrics.currentMetrics.cpu.cores,
        available: metrics.currentMetrics.cpu.cores * (1 - metrics.currentMetrics.cpu.utilization / 100),
        reserved: 0,
        utilizationTarget: 70
      },
      memory: {
        totalGB: metrics.currentMetrics.memory.usedGB + metrics.currentMetrics.memory.availableGB,
        availableGB: metrics.currentMetrics.memory.availableGB,
        reservedGB: 0,
        utilizationTarget: 80
      },
      storage: {
        totalGB: metrics.currentMetrics.storage.usedGB + metrics.currentMetrics.storage.availableGB,
        availableGB: metrics.currentMetrics.storage.availableGB,
        reservedGB: 0,
        iopsCapacity: metrics.currentMetrics.storage.iopsUsage || 1000,
        utilizationTarget: 85
      },
      network: {
        bandwidthMbps: metrics.currentMetrics.network.bandwidthUsedMbps,
        availableMbps: metrics.currentMetrics.network.bandwidthUsedMbps * (1 - metrics.currentMetrics.network.utilization / 100),
        reservedMbps: 0,
        utilizationTarget: 75
      }
    };
  }

  private calculateNewCapacity(current: ResourceCapacity, decision: ScalingDecision): ResourceCapacity {
    const newCapacity = JSON.parse(JSON.stringify(current)); // Deep copy

    switch (decision.resource) {
      case 'cpu':
        newCapacity.cpu.total = decision.targetCapacity;
        newCapacity.cpu.available = decision.targetCapacity * 0.8; // Assume 80% available
        break;
      case 'memory':
        newCapacity.memory.totalGB = decision.targetCapacity;
        newCapacity.memory.availableGB = decision.targetCapacity * 0.8;
        break;
      case 'storage':
        newCapacity.storage.totalGB = decision.targetCapacity;
        newCapacity.storage.availableGB = decision.targetCapacity * 0.8;
        break;
      case 'network':
        newCapacity.network.bandwidthMbps = decision.targetCapacity;
        newCapacity.network.availableMbps = decision.targetCapacity * 0.8;
        break;
      case 'instances':
        // Scale all resources proportionally
        const factor = decision.scalingFactor;
        newCapacity.cpu.total *= factor;
        newCapacity.cpu.available *= factor;
        newCapacity.memory.totalGB *= factor;
        newCapacity.memory.availableGB *= factor;
        break;
    }

    return newCapacity;
  }

  private async performScaling(decision: ScalingDecision): Promise<boolean> {
    // Simulate scaling operation
    // In production, this would integrate with cloud provider APIs

    const delay = Math.random() * 2000 + 1000; // 1-3 seconds
    await new Promise(resolve => setTimeout(resolve, delay));

    // Simulate 90% success rate
    return Math.random() > 0.1;
  }

  private estimatePerformanceImprovement(decision: ScalingDecision): number {
    switch (decision.action) {
      case 'scale_up':
        return Math.min((decision.scalingFactor - 1) * 100, 50); // Max 50% improvement
      case 'scale_down':
        return 0; // No performance improvement
      case 'optimize':
        return 10; // Modest improvement
      default:
        return 0;
    }
  }

  private calculateCostImpact(before: ResourceCapacity, after: ResourceCapacity): number {
    // Simplified cost calculation
    const cpuCostDiff = (after.cpu.total - before.cpu.total) * 0.1; // $0.1 per core per hour
    const memoryCostDiff = (after.memory.totalGB - before.memory.totalGB) * 0.01; // $0.01 per GB per hour

    return (cpuCostDiff + memoryCostDiff) * 24 * 30; // Monthly cost
  }

  private initializeDefaultRules(): void {
    // High CPU utilization rule
    this.addScalingRule({
      ruleId: 'high-cpu',
      name: 'High CPU Utilization',
      description: 'Scale up when CPU utilization exceeds 80% for 5 minutes',
      enabled: true,
      conditions: [{
        metric: 'currentMetrics.cpu.utilization',
        operator: 'gt',
        threshold: 80,
        duration: 300,
        aggregation: 'avg'
      }],
      action: {
        type: 'scale_up',
        resource: 'cpu',
        adjustment: {
          type: 'percentage',
          value: 25,
          min: 1,
          max: 100
        },
        cooldown: 300
      },
      priority: 80
    });

    // High memory utilization rule
    this.addScalingRule({
      ruleId: 'high-memory',
      name: 'High Memory Utilization',
      description: 'Scale up when memory utilization exceeds 85% for 3 minutes',
      enabled: true,
      conditions: [{
        metric: 'currentMetrics.memory.utilization',
        operator: 'gt',
        threshold: 85,
        duration: 180,
        aggregation: 'avg'
      }],
      action: {
        type: 'scale_up',
        resource: 'memory',
        adjustment: {
          type: 'percentage',
          value: 30,
          min: 1,
          max: 100
        },
        cooldown: 300
      },
      priority: 85
    });

    // Low utilization scale down rule
    this.addScalingRule({
      ruleId: 'low-utilization',
      name: 'Low Resource Utilization',
      description: 'Scale down when resources are under-utilized for 10 minutes',
      enabled: true,
      conditions: [
        {
          metric: 'currentMetrics.cpu.utilization',
          operator: 'lt',
          threshold: 30,
          duration: 600,
          aggregation: 'avg'
        },
        {
          metric: 'currentMetrics.memory.utilization',
          operator: 'lt',
          threshold: 40,
          duration: 600,
          aggregation: 'avg'
        }
      ],
      action: {
        type: 'scale_down',
        resource: 'instances',
        adjustment: {
          type: 'percentage',
          value: -20,
          min: this.config.safety.minInstances,
          max: this.config.safety.maxInstances
        },
        cooldown: 600
      },
      priority: 30
    });
  }

  private isInCooldown(organizationId: string): boolean {
    const lastCooldown = this.cooldownTracker.get(organizationId) || 0;
    return Date.now() - lastCooldown < this.config.scaling.cooldownPeriod * 1000;
  }

  private setCooldown(organizationId: string): void {
    this.cooldownTracker.set(organizationId, Date.now());
  }

  private isRuleScheduleActive(rule: ScalingRule): boolean {
    if (!rule.schedule) return true;

    const now = new Date();
    const currentHour = now.getHours();
    const currentDay = now.getDay();

    // Check active hours
    if (rule.schedule.activeHours) {
      const { start, end } = rule.schedule.activeHours;
      if (start <= end) {
        if (currentHour < start || currentHour > end) return false;
      } else {
        // Crosses midnight
        if (currentHour < start && currentHour > end) return false;
      }
    }

    // Check active days
    if (rule.schedule.activeDays && !rule.schedule.activeDays.includes(currentDay)) {
      return false;
    }

    // Check excluded dates
    const currentDate = now.toISOString().split('T')[0];
    if (rule.schedule.excludeDates.includes(currentDate)) {
      return false;
    }

    return true;
  }

  private recordDecision(organizationId: string, decision: ScalingDecision): void {
    const decisions = this.recentDecisions.get(organizationId) || [];
    decisions.push(decision);

    // Keep only last 100 decisions
    if (decisions.length > 100) {
      decisions.shift();
    }

    this.recentDecisions.set(organizationId, decisions);
  }

  private recordScalingEvent(organizationId: string, event: ScalingEvent): void {
    const events = this.scalingHistory.get(organizationId) || [];
    events.push(event);

    // Keep only last 1000 events
    if (events.length > 1000) {
      events.shift();
    }

    this.scalingHistory.set(organizationId, events);
  }

  private startMonitoring(): void {
    // Start decision processing loop
    setInterval(() => {
      this.processQueuedDecisions();
    }, this.config.performance.decisionInterval);

    // Cleanup old data
    setInterval(() => {
      this.cleanupOldData();
    }, 60 * 60 * 1000); // Every hour
  }

  private async processQueuedDecisions(): Promise<void> {
    const now = Date.now();

    for (const [organizationId, decisions] of this.recentDecisions) {
      const pendingDecisions = decisions.filter(d =>
        d.executeAt <= now && d.executeAt > now - (5 * 60 * 1000) // Within last 5 minutes
      );

      for (const decision of pendingDecisions) {
        try {
          await this.executeScalingDecision(decision);
        } catch (error) {
          logger.error('Failed to execute queued scaling decision', {
            decisionId: decision.decisionId,
            organizationId,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }
    }
  }

  private cleanupOldData(): void {
    const cutoff = Date.now() - (24 * 60 * 60 * 1000); // 24 hours ago

    for (const [organizationId, decisions] of this.recentDecisions) {
      const recentDecisions = decisions.filter(d => d.timestamp > cutoff);
      this.recentDecisions.set(organizationId, recentDecisions);
    }

    for (const [organizationId, events] of this.scalingHistory) {
      const recentEvents = events.filter(e => e.timestamp > cutoff);
      this.scalingHistory.set(organizationId, recentEvents);
    }
  }

  private async generateImmediateRecommendations(metrics: ScalingMetrics): Promise<ScalingDecision[]> {
    const recommendations: ScalingDecision[] = [];

    // Check current resource utilization
    const { currentMetrics } = metrics;

    if (currentMetrics.cpu.utilization > 75) {
      recommendations.push(this.createScalingDecision(metrics, {
        action: 'scale_up',
        resource: 'cpu',
        urgency: 'high',
        triggers: [{
          type: 'reactive',
          metric: 'cpu.utilization',
          threshold: 75,
          currentValue: currentMetrics.cpu.utilization,
          severity: 'high'
        }],
        scalingFactor: 1.3
      }));
    }

    if (currentMetrics.memory.utilization > 80) {
      recommendations.push(this.createScalingDecision(metrics, {
        action: 'scale_up',
        resource: 'memory',
        urgency: 'high',
        triggers: [{
          type: 'reactive',
          metric: 'memory.utilization',
          threshold: 80,
          currentValue: currentMetrics.memory.utilization,
          severity: 'high'
        }],
        scalingFactor: 1.25
      }));
    }

    return recommendations;
  }

  private async generatePlannedRecommendations(
    metrics: ScalingMetrics,
    timeHorizon: number
  ): Promise<ScalingDecision[]> {
    const recommendations: ScalingDecision[] = [];

    // Check if scaling down is possible
    const { currentMetrics } = metrics;

    if (currentMetrics.cpu.utilization < 30 && currentMetrics.memory.utilization < 40) {
      recommendations.push(this.createScalingDecision(metrics, {
        action: 'scale_down',
        resource: 'instances',
        urgency: 'low',
        triggers: [{
          type: 'reactive',
          metric: 'resource.utilization',
          threshold: 30,
          currentValue: (currentMetrics.cpu.utilization + currentMetrics.memory.utilization) / 2,
          severity: 'low'
        }],
        scalingFactor: 0.8
      }));
    }

    return recommendations;
  }

  private assessRecommendationRisk(
    immediate: ScalingDecision[],
    planned: ScalingDecision[]
  ): 'low' | 'medium' | 'high' {
    const highUrgencyCount = immediate.filter(r => r.urgency === 'high' || r.urgency === 'critical').length;
    const totalChanges = immediate.length + planned.length;

    if (highUrgencyCount > 2 || totalChanges > 5) return 'high';
    if (highUrgencyCount > 0 || totalChanges > 2) return 'medium';
    return 'low';
  }

  private calculateRecommendationConfidence(metrics: ScalingMetrics): number {
    // Base confidence on metrics quality and trend stability
    return Math.min(
      metrics.trends.confidence * 0.6 +
      (100 - Math.abs(50 - metrics.currentMetrics.cpu.utilization)) / 100 * 0.4,
      0.95
    );
  }

  private calculateDecisionConfidence(triggers: ScalingDecision['triggers'], metrics: ScalingMetrics): number {
    let confidence = 0.5; // Base confidence

    // Higher confidence for reactive triggers
    const reactiveCount = triggers.filter(t => t.type === 'reactive').length;
    confidence += reactiveCount * 0.2;

    // Factor in trend confidence
    confidence += metrics.trends.confidence * 0.3;

    // Factor in severity
    const criticalCount = triggers.filter(t => t.severity === 'critical').length;
    confidence += criticalCount * 0.2;

    return Math.min(confidence, 0.95);
  }

  private assessDecisionRisks(
    action: ScalingDecision['action'],
    resource: ScalingDecision['resource'],
    scalingFactor: number
  ): string[] {
    const risks: string[] = [];

    if (action === 'scale_up') {
      risks.push('Increased infrastructure costs');
      if (scalingFactor > 2) {
        risks.push('Aggressive scaling may cause resource waste');
      }
    }

    if (action === 'scale_down') {
      risks.push('Potential performance degradation');
      risks.push('Risk of capacity shortage during load spikes');
    }

    if (resource === 'instances') {
      risks.push('Service disruption during instance changes');
    }

    return risks;
  }

  private generateExpectedOutcome(action: ScalingDecision['action'], resource: ScalingDecision['resource']): string {
    switch (action) {
      case 'scale_up':
        return `Improved ${resource} capacity and performance, reduced latency`;
      case 'scale_down':
        return `Reduced costs, optimized resource utilization`;
      case 'optimize':
        return `Better resource efficiency without capacity changes`;
      default:
        return 'No changes to current capacity';
    }
  }

  private generateRollbackPlan(
    action: ScalingDecision['action'],
    resource: ScalingDecision['resource'],
    originalCapacity: number
  ): string {
    return `Revert ${resource} capacity to ${originalCapacity} units if performance issues occur`;
  }

  private getExecutionDelay(urgency: ScalingDecision['urgency']): number {
    switch (urgency) {
      case 'critical': return 0; // Immediate
      case 'high': return 30000; // 30 seconds
      case 'medium': return 120000; // 2 minutes
      case 'low': return 300000; // 5 minutes
      default: return 60000; // 1 minute
    }
  }

  private estimateExecutionDuration(action: ScalingDecision['action'], resource: ScalingDecision['resource']): number {
    // Duration in minutes
    const baseDurations = {
      cpu: 3,
      memory: 2,
      storage: 8,
      network: 5,
      instances: 10
    };

    return baseDurations[resource as keyof typeof baseDurations] || 5;
  }

  private estimateScalingCost(currentCapacity: number, targetCapacity: number): number {
    const difference = Math.abs(targetCapacity - currentCapacity);
    return difference * 0.1 * 24 * 30; // $0.1 per unit per hour, monthly cost
  }

  private generateDecisionId(): string {
    return `decision_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateEventId(): string {
    return `event_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get current scaling metrics and status
   */
  getMetrics(): {
    activeRules: number;
    recentDecisions: number;
    scalingHistory: number;
    successRate: number;
    averageDecisionLatency: number;
    config: PredictiveScalerConfig;
  } {
    const totalDecisions = Array.from(this.recentDecisions.values())
      .reduce((sum, decisions) => sum + decisions.length, 0);

    const totalEvents = Array.from(this.scalingHistory.values())
      .reduce((sum, events) => sum + events.length, 0);

    const successRate = this.totalScalingAttempts > 0
      ? (this.scalingSuccess / this.totalScalingAttempts) * 100
      : 0;

    const averageLatency = this.decisionLatency.length > 0
      ? this.decisionLatency.reduce((sum, lat) => sum + lat, 0) / this.decisionLatency.length
      : 0;

    return {
      activeRules: this.scalingRules.size,
      recentDecisions: totalDecisions,
      scalingHistory: totalEvents,
      successRate,
      averageDecisionLatency: averageLatency,
      config: this.config
    };
  }

  /**
   * Get scaling history for an organization
   */
  getScalingHistory(organizationId: string): ScalingEvent[] {
    return this.scalingHistory.get(organizationId) || [];
  }

  /**
   * Get active scaling rules
   */
  getScalingRules(): ScalingRule[] {
    return Array.from(this.scalingRules.values());
  }

  /**
   * Remove a scaling rule
   */
  removeScalingRule(ruleId: string): boolean {
    const deleted = this.scalingRules.delete(ruleId);
    if (deleted) {
      logger.info('Scaling rule removed', { ruleId });
      this.emit('ruleRemoved', ruleId);
    }
    return deleted;
  }

  /**
   * Update scaler configuration
   */
  updateConfig(newConfig: Partial<PredictiveScalerConfig>): void {
    this.config = { ...this.config, ...newConfig };
    logger.info('PredictiveScaler configuration updated', { config: newConfig });
    this.emit('configUpdated', this.config);
  }

  /**
   * Enable or disable scaling
   */
  setScalingEnabled(enabled: boolean): void {
    this.config.scaling.enabled = enabled;
    logger.info(`Scaling ${enabled ? 'enabled' : 'disabled'}`);
    this.emit('scalingToggled', enabled);
  }

  /**
   * Clear all scaling data
   */
  clearHistory(): void {
    this.recentDecisions.clear();
    this.scalingHistory.clear();
    this.cooldownTracker.clear();
    this.decisionLatency.length = 0;
    this.scalingSuccess = 0;
    this.totalScalingAttempts = 0;
    logger.info('PredictiveScaler history cleared');
  }
}