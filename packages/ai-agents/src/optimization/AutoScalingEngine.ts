/**
 * Auto-Scaling Engine
 *
 * Predictive auto-scaling system that proactively scales Docker containers
 * based on workload predictions and performance metrics. Integrates with
 * WorkloadPredictionService and ResourceAllocationEngine for intelligent
 * scaling decisions.
 */

import { EventEmitter } from 'events';
import { z } from 'zod';
import { logger } from '../core/Logger.js';
import { WorkloadPredictionService, WorkloadPredictionResult } from './WorkloadPredictionService.js';
import { ResourceAllocationEngine } from './ResourceAllocationEngine.js';
import type { ResourceMetrics } from '../types/PerformanceTypes.js';

// Core scaling schemas
export const ScalingPolicySchema = z.object({
  policyId: z.string(),
  name: z.string(),
  description: z.string(),
  targetService: z.string(),
  enabled: z.boolean().default(true),

  // Scaling thresholds
  scaleUpThreshold: z.object({
    cpu: z.number().min(0).max(100).default(70),
    memory: z.number().min(0).max(100).default(80),
    queueDepth: z.number().min(0).default(10),
    responseTime: z.number().min(0).default(5000), // ms
    customMetrics: z.record(z.number()).default({})
  }),

  scaleDownThreshold: z.object({
    cpu: z.number().min(0).max(100).default(20),
    memory: z.number().min(0).max(100).default(30),
    queueDepth: z.number().min(0).default(2),
    responseTime: z.number().min(0).default(1000), // ms
    customMetrics: z.record(z.number()).default({})
  }),

  // Scaling behavior
  scalingBehavior: z.object({
    minReplicas: z.number().min(1).default(1),
    maxReplicas: z.number().min(1).default(50),
    scaleUpFactor: z.number().min(1).max(10).default(2),
    scaleDownFactor: z.number().min(0.1).max(1).default(0.5),
    cooldownPeriodMs: z.number().min(60000).default(300000), // 5 minutes
    predictionHorizonHours: z.number().min(0.25).max(24).default(2)
  }),

  // Advanced settings
  predictiveScaling: z.object({
    enabled: z.boolean().default(true),
    confidence: z.number().min(0.5).max(1).default(0.8),
    leadTimeMinutes: z.number().min(1).max(60).default(5),
    maxPredictiveScale: z.number().min(1).max(5).default(3)
  }),

  constraints: z.object({
    allowScaleToZero: z.boolean().default(false),
    resourceLimits: z.object({
      maxCpuCores: z.number().optional(),
      maxMemoryGB: z.number().optional(),
      maxCostPerHour: z.number().optional()
    }).optional(),
    scheduleRestrictions: z.array(z.object({
      dayOfWeek: z.number().min(0).max(6),
      startHour: z.number().min(0).max(23),
      endHour: z.number().min(0).max(23),
      action: z.enum(['allow', 'deny'])
    })).default([])
  })
});

export const ScalingActionSchema = z.object({
  actionId: z.string(),
  policyId: z.string(),
  serviceId: z.string(),
  timestamp: z.number(),
  action: z.enum(['scale_up', 'scale_down', 'maintain', 'predictive_scale']),

  // Current state
  currentReplicas: z.number().min(0),
  targetReplicas: z.number().min(0),

  // Trigger information
  trigger: z.object({
    type: z.enum(['threshold', 'predictive', 'manual', 'schedule']),
    metrics: z.record(z.number()),
    confidence: z.number().min(0).max(1).optional(),
    prediction: z.any().optional()
  }),

  // Execution details
  execution: z.object({
    status: z.enum(['pending', 'in_progress', 'completed', 'failed', 'cancelled']),
    startTime: z.number().optional(),
    endTime: z.number().optional(),
    error: z.string().optional(),
    actualReplicas: z.number().optional()
  }),

  // Impact assessment
  impact: z.object({
    estimatedCostChange: z.number().optional(),
    estimatedPerformanceChange: z.number().optional(),
    resourceUtilizationChange: z.record(z.number()).optional()
  }).optional()
});

export const AutoScalingConfigSchema = z.object({
  // Engine settings
  evaluationIntervalMs: z.number().min(30000).default(60000), // 1 minute
  metricsWindowMs: z.number().min(60000).default(300000), // 5 minutes
  predictionUpdateIntervalMs: z.number().min(300000).default(600000), // 10 minutes

  // Global limits
  globalLimits: z.object({
    maxTotalReplicas: z.number().min(1).default(200),
    maxConcurrentScalingActions: z.number().min(1).default(10),
    maxCostPerHour: z.number().min(0).optional(),
    emergencyScaleDownThreshold: z.number().min(50).max(100).default(95)
  }),

  // Prediction settings
  predictionSettings: z.object({
    useHistoricalData: z.boolean().default(true),
    historicalDataDays: z.number().min(1).max(90).default(30),
    confidenceThreshold: z.number().min(0.5).max(1).default(0.7),
    anomalyDetectionEnabled: z.boolean().default(true)
  }),

  // Safety settings
  safetySettings: z.object({
    enableSafetyLimits: z.boolean().default(true),
    minStabilityPeriodMs: z.number().min(60000).default(300000), // 5 minutes
    maxScalingVelocity: z.number().min(1).default(5), // replicas per minute
    requireManualApprovalAbove: z.number().optional() // replica count
  })
});

export type ScalingPolicy = z.infer<typeof ScalingPolicySchema>;
export type ScalingAction = z.infer<typeof ScalingActionSchema>;
export type AutoScalingConfig = z.infer<typeof AutoScalingConfigSchema>;

// Container orchestration interface
export interface ContainerOrchestrator {
  getCurrentReplicas(serviceId: string): Promise<number>;
  scaleService(serviceId: string, targetReplicas: number): Promise<boolean>;
  getServiceMetrics(serviceId: string): Promise<ResourceMetrics>;
  getServiceHealth(serviceId: string): Promise<{
    healthy: boolean;
    replicas: { total: number; ready: number; unhealthy: number };
  }>;
}

// Docker-based orchestrator implementation
export class DockerOrchestrator implements ContainerOrchestrator {
  async getCurrentReplicas(serviceId: string): Promise<number> {
    try {
      // In a real implementation, this would use Docker API
      // For now, simulate with stored state
      return Math.floor(Math.random() * 10) + 1;
    } catch (error) {
      logger.error({ error, serviceId }, 'Failed to get current replicas');
      throw error;
    }
  }

  async scaleService(serviceId: string, targetReplicas: number): Promise<boolean> {
    try {
      logger.info({ serviceId, targetReplicas }, 'Scaling Docker service');

      // In a real implementation:
      // const docker = new Docker();
      // const service = docker.getService(serviceId);
      // await service.update({ TaskTemplate: { ... }, Mode: { Replicated: { Replicas: targetReplicas } } });

      // Simulate scaling delay
      await new Promise(resolve => setTimeout(resolve, 2000));

      return true;
    } catch (error) {
      logger.error({ error, serviceId, targetReplicas }, 'Failed to scale service');
      return false;
    }
  }

  async getServiceMetrics(serviceId: string): Promise<ResourceMetrics> {
    try {
      // In a real implementation, this would collect metrics from Docker stats
      return {
        timestamp: Date.now(),
        cpu: {
          usage: Math.random() * 100,
          cores: 2,
          throttling: 0
        },
        memory: {
          usage: Math.random() * 8192,
          limit: 8192,
          cache: 512
        },
        network: {
          rxBytes: Math.random() * 1000000,
          txBytes: Math.random() * 1000000,
          connections: Math.floor(Math.random() * 100)
        },
        disk: {
          usage: Math.random() * 100,
          iops: Math.random() * 1000
        }
      };
    } catch (error) {
      logger.error({ error, serviceId }, 'Failed to get service metrics');
      throw error;
    }
  }

  async getServiceHealth(serviceId: string): Promise<{
    healthy: boolean;
    replicas: { total: number; ready: number; unhealthy: number };
  }> {
    const total = await this.getCurrentReplicas(serviceId);
    const ready = Math.floor(total * 0.9); // 90% ready
    const unhealthy = total - ready;

    return {
      healthy: ready > 0 && unhealthy < total * 0.2, // Less than 20% unhealthy
      replicas: { total, ready, unhealthy }
    };
  }
}

/**
 * Auto-Scaling Engine Implementation
 */
export class AutoScalingEngine extends EventEmitter {
  private readonly config: AutoScalingConfig;
  private readonly workloadPredictor: WorkloadPredictionService;
  private readonly resourceAllocator: ResourceAllocationEngine;
  private readonly orchestrator: ContainerOrchestrator;

  private policies: Map<string, ScalingPolicy> = new Map();
  private activeActions: Map<string, ScalingAction> = new Map();
  private actionHistory: ScalingAction[] = [];
  private serviceMetrics: Map<string, ResourceMetrics[]> = new Map();
  private lastPredictionUpdate: number = 0;
  private predictions: Map<string, WorkloadPredictionResult> = new Map();

  private evaluationTimer?: NodeJS.Timeout;
  private predictionTimer?: NodeJS.Timeout;
  private isRunning = false;

  constructor(
    config: Partial<AutoScalingConfig> = {},
    workloadPredictor: WorkloadPredictionService,
    resourceAllocator: ResourceAllocationEngine,
    orchestrator: ContainerOrchestrator = new DockerOrchestrator()
  ) {
    super();

    this.config = AutoScalingConfigSchema.parse(config);
    this.workloadPredictor = workloadPredictor;
    this.resourceAllocator = resourceAllocator;
    this.orchestrator = orchestrator;

    this.setupEventHandlers();
  }

  /**
   * Initialize the auto-scaling engine
   */
  async initialize(): Promise<void> {
    try {
      logger.info('Initializing Auto-Scaling Engine...');

      // Start evaluation cycle
      this.startEvaluationCycle();

      // Start prediction updates
      this.startPredictionUpdates();

      this.isRunning = true;

      logger.info({
        config: this.config,
        policies: this.policies.size
      }, 'Auto-Scaling Engine initialized successfully');

      this.emit('engine:initialized', {
        timestamp: new Date(),
        config: this.config
      });

    } catch (error) {
      logger.error({ error }, 'Failed to initialize Auto-Scaling Engine');
      throw error;
    }
  }

  /**
   * Add or update a scaling policy
   */
  async addPolicy(policy: Partial<ScalingPolicy> & { targetService: string }): Promise<void> {
    try {
      const validatedPolicy = ScalingPolicySchema.parse({
        policyId: policy.policyId || this.generatePolicyId(),
        name: policy.name || `Policy for ${policy.targetService}`,
        description: policy.description || 'Auto-generated scaling policy',
        ...policy
      });

      this.policies.set(validatedPolicy.policyId, validatedPolicy);

      logger.info({
        policyId: validatedPolicy.policyId,
        targetService: validatedPolicy.targetService
      }, 'Scaling policy added');

      this.emit('policy:added', {
        policy: validatedPolicy,
        timestamp: new Date()
      });

    } catch (error) {
      logger.error({ error, policy }, 'Failed to add scaling policy');
      throw error;
    }
  }

  /**
   * Remove a scaling policy
   */
  async removePolicy(policyId: string): Promise<void> {
    try {
      const policy = this.policies.get(policyId);
      if (!policy) {
        throw new Error(`Policy ${policyId} not found`);
      }

      // Cancel any active actions for this policy
      for (const [actionId, action] of this.activeActions) {
        if (action.policyId === policyId) {
          await this.cancelScalingAction(actionId);
        }
      }

      this.policies.delete(policyId);

      logger.info({ policyId }, 'Scaling policy removed');

      this.emit('policy:removed', {
        policyId,
        timestamp: new Date()
      });

    } catch (error) {
      logger.error({ error, policyId }, 'Failed to remove scaling policy');
      throw error;
    }
  }

  /**
   * Manually trigger scaling for a service
   */
  async manualScale(
    serviceId: string,
    targetReplicas: number,
    reason?: string
  ): Promise<ScalingAction> {
    try {
      const policy = Array.from(this.policies.values())
        .find(p => p.targetService === serviceId);

      if (!policy) {
        throw new Error(`No policy found for service ${serviceId}`);
      }

      const currentReplicas = await this.orchestrator.getCurrentReplicas(serviceId);

      const action: ScalingAction = {
        actionId: this.generateActionId(),
        policyId: policy.policyId,
        serviceId,
        timestamp: Date.now(),
        action: targetReplicas > currentReplicas ? 'scale_up' :
                targetReplicas < currentReplicas ? 'scale_down' : 'maintain',
        currentReplicas,
        targetReplicas,
        trigger: {
          type: 'manual',
          metrics: {},
          confidence: 1.0
        },
        execution: {
          status: 'pending'
        }
      };

      await this.executeScalingAction(action);
      return action;

    } catch (error) {
      logger.error({ error, serviceId, targetReplicas }, 'Manual scaling failed');
      throw error;
    }
  }

  /**
   * Get current auto-scaling status
   */
  getStatus(): {
    isRunning: boolean;
    policies: number;
    activeActions: number;
    totalServices: number;
    lastEvaluation: number;
    nextEvaluation: number;
  } {
    const uniqueServices = new Set(Array.from(this.policies.values()).map(p => p.targetService));

    return {
      isRunning: this.isRunning,
      policies: this.policies.size,
      activeActions: this.activeActions.size,
      totalServices: uniqueServices.size,
      lastEvaluation: Date.now(),
      nextEvaluation: Date.now() + this.config.evaluationIntervalMs
    };
  }

  /**
   * Get scaling policies
   */
  getPolicies(): ScalingPolicy[] {
    return Array.from(this.policies.values());
  }

  /**
   * Get scaling history
   */
  getScalingHistory(limit = 50): ScalingAction[] {
    return this.actionHistory
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);
  }

  /**
   * Shutdown the auto-scaling engine
   */
  async shutdown(): Promise<void> {
    try {
      logger.info('Shutting down Auto-Scaling Engine...');

      this.isRunning = false;

      // Clear timers
      if (this.evaluationTimer) {
        clearInterval(this.evaluationTimer);
      }
      if (this.predictionTimer) {
        clearInterval(this.predictionTimer);
      }

      // Cancel active actions
      const cancelPromises = Array.from(this.activeActions.keys())
        .map(actionId => this.cancelScalingAction(actionId));

      await Promise.all(cancelPromises);

      this.emit('engine:shutdown', { timestamp: new Date() });

      logger.info('Auto-Scaling Engine shutdown complete');

    } catch (error) {
      logger.error({ error }, 'Error during Auto-Scaling Engine shutdown');
      throw error;
    }
  }

  // Private helper methods

  private setupEventHandlers(): void {
    // Handle workload prediction events
    this.workloadPredictor.on('predictionGenerated', (data) => {
      this.handlePredictionUpdate(data);
    });

    // Handle resource allocation events
    this.resourceAllocator.on('allocation:success', (data) => {
      this.handleResourceAllocation(data);
    });
  }

  private startEvaluationCycle(): void {
    this.evaluationTimer = setInterval(async () => {
      try {
        await this.evaluateScalingPolicies();
      } catch (error) {
        logger.error({ error }, 'Error during scaling evaluation');
      }
    }, this.config.evaluationIntervalMs);
  }

  private startPredictionUpdates(): void {
    this.predictionTimer = setInterval(async () => {
      try {
        await this.updatePredictions();
      } catch (error) {
        logger.error({ error }, 'Error updating predictions');
      }
    }, this.config.predictionUpdateIntervalMs);
  }

  private async evaluateScalingPolicies(): Promise<void> {
    if (!this.isRunning) return;

    logger.debug('Evaluating scaling policies...');

    for (const [policyId, policy] of this.policies) {
      if (!policy.enabled) continue;

      try {
        await this.evaluatePolicy(policy);
      } catch (error) {
        logger.error({
          error,
          policyId,
          targetService: policy.targetService
        }, 'Error evaluating scaling policy');
      }
    }
  }

  private async evaluatePolicy(policy: ScalingPolicy): Promise<void> {
    const serviceId = policy.targetService;

    // Check if service is currently scaling
    const activeAction = Array.from(this.activeActions.values())
      .find(action => action.serviceId === serviceId &&
             action.execution.status === 'in_progress');

    if (activeAction) {
      logger.debug({ serviceId, actionId: activeAction.actionId }, 'Service currently scaling, skipping evaluation');
      return;
    }

    // Get current metrics
    const currentMetrics = await this.orchestrator.getServiceMetrics(serviceId);
    this.updateServiceMetrics(serviceId, currentMetrics);

    // Get current replicas
    const currentReplicas = await this.orchestrator.getCurrentReplicas(serviceId);

    // Check thresholds
    const scaleDecision = await this.makeScalingDecision(policy, currentMetrics, currentReplicas);

    if (scaleDecision.shouldScale) {
      await this.initiateScaling(policy, scaleDecision, currentReplicas);
    }
  }

  private async makeScalingDecision(
    policy: ScalingPolicy,
    metrics: ResourceMetrics,
    currentReplicas: number
  ): Promise<{
    shouldScale: boolean;
    action: 'scale_up' | 'scale_down' | 'maintain';
    targetReplicas: number;
    reason: string;
    confidence: number;
  }> {
    // Check reactive scaling (threshold-based)
    const reactiveDecision = this.checkReactiveScaling(policy, metrics, currentReplicas);

    // Check predictive scaling if enabled
    let predictiveDecision = { shouldScale: false, action: 'maintain' as const, targetReplicas: currentReplicas, reason: '', confidence: 0 };

    if (policy.predictiveScaling.enabled) {
      predictiveDecision = await this.checkPredictiveScaling(policy, currentReplicas);
    }

    // Combine decisions (predictive takes precedence if confidence is high)
    if (predictiveDecision.shouldScale && predictiveDecision.confidence >= policy.predictiveScaling.confidence) {
      return predictiveDecision;
    }

    return reactiveDecision;
  }

  private checkReactiveScaling(
    policy: ScalingPolicy,
    metrics: ResourceMetrics,
    currentReplicas: number
  ): {
    shouldScale: boolean;
    action: 'scale_up' | 'scale_down' | 'maintain';
    targetReplicas: number;
    reason: string;
    confidence: number;
  } {
    const { scaleUpThreshold, scaleDownThreshold, scalingBehavior } = policy;

    // Check scale-up conditions
    const cpuHigh = metrics.cpu.usage > scaleUpThreshold.cpu;
    const memoryHigh = (metrics.memory.usage / metrics.memory.limit) * 100 > scaleUpThreshold.memory;

    if ((cpuHigh || memoryHigh) && currentReplicas < scalingBehavior.maxReplicas) {
      const targetReplicas = Math.min(
        Math.ceil(currentReplicas * scalingBehavior.scaleUpFactor),
        scalingBehavior.maxReplicas
      );

      return {
        shouldScale: true,
        action: 'scale_up',
        targetReplicas,
        reason: `Thresholds exceeded - CPU: ${metrics.cpu.usage.toFixed(1)}%, Memory: ${((metrics.memory.usage / metrics.memory.limit) * 100).toFixed(1)}%`,
        confidence: 0.9
      };
    }

    // Check scale-down conditions
    const cpuLow = metrics.cpu.usage < scaleDownThreshold.cpu;
    const memoryLow = (metrics.memory.usage / metrics.memory.limit) * 100 < scaleDownThreshold.memory;

    if (cpuLow && memoryLow && currentReplicas > scalingBehavior.minReplicas) {
      const targetReplicas = Math.max(
        Math.floor(currentReplicas * scalingBehavior.scaleDownFactor),
        scalingBehavior.minReplicas
      );

      return {
        shouldScale: true,
        action: 'scale_down',
        targetReplicas,
        reason: `Resource utilization low - CPU: ${metrics.cpu.usage.toFixed(1)}%, Memory: ${((metrics.memory.usage / metrics.memory.limit) * 100).toFixed(1)}%`,
        confidence: 0.8
      };
    }

    return {
      shouldScale: false,
      action: 'maintain',
      targetReplicas: currentReplicas,
      reason: 'All thresholds within normal ranges',
      confidence: 0.7
    };
  }

  private async checkPredictiveScaling(
    policy: ScalingPolicy,
    currentReplicas: number
  ): Promise<{
    shouldScale: boolean;
    action: 'scale_up' | 'scale_down' | 'maintain';
    targetReplicas: number;
    reason: string;
    confidence: number;
  }> {
    const serviceId = policy.targetService;
    const prediction = this.predictions.get(serviceId);

    if (!prediction || prediction.confidence < policy.predictiveScaling.confidence) {
      return {
        shouldScale: false,
        action: 'maintain',
        targetReplicas: currentReplicas,
        reason: 'Insufficient prediction confidence',
        confidence: 0
      };
    }

    // Analyze predicted demand for the next horizon
    const horizonMs = policy.scalingBehavior.predictionHorizonHours * 60 * 60 * 1000;
    const futureTime = Date.now() + (policy.predictiveScaling.leadTimeMinutes * 60 * 1000);

    const futureDemand = prediction.workloadDemand.find(demand =>
      Math.abs(demand.timestamp - futureTime) < horizonMs / 2
    );

    if (!futureDemand) {
      return {
        shouldScale: false,
        action: 'maintain',
        targetReplicas: currentReplicas,
        reason: 'No prediction data for target time',
        confidence: 0
      };
    }

    // Estimate required replicas based on predicted workload
    const workloadFactor = futureDemand.expectedWorkflows / Math.max(1, currentReplicas);
    const predictedReplicas = Math.ceil(currentReplicas * Math.max(0.5, workloadFactor));

    const targetReplicas = Math.min(
      Math.max(predictedReplicas, policy.scalingBehavior.minReplicas),
      Math.min(
        policy.scalingBehavior.maxReplicas,
        currentReplicas * policy.predictiveScaling.maxPredictiveScale
      )
    );

    if (targetReplicas !== currentReplicas) {
      return {
        shouldScale: true,
        action: targetReplicas > currentReplicas ? 'scale_up' : 'scale_down',
        targetReplicas,
        reason: `Predictive scaling based on forecasted demand: ${futureDemand.expectedWorkflows} workflows`,
        confidence: prediction.confidence
      };
    }

    return {
      shouldScale: false,
      action: 'maintain',
      targetReplicas: currentReplicas,
      reason: 'Predicted demand matches current capacity',
      confidence: prediction.confidence
    };
  }

  private async initiateScaling(
    policy: ScalingPolicy,
    decision: {
      shouldScale: boolean;
      action: 'scale_up' | 'scale_down' | 'maintain';
      targetReplicas: number;
      reason: string;
      confidence: number;
    },
    currentReplicas: number
  ): Promise<void> {
    // Check cooldown period
    const lastAction = this.actionHistory
      .filter(action => action.serviceId === policy.targetService)
      .sort((a, b) => b.timestamp - a.timestamp)[0];

    if (lastAction &&
        (Date.now() - lastAction.timestamp) < policy.scalingBehavior.cooldownPeriodMs) {
      logger.debug({
        serviceId: policy.targetService,
        cooldownRemaining: policy.scalingBehavior.cooldownPeriodMs - (Date.now() - lastAction.timestamp)
      }, 'Scaling action skipped due to cooldown period');
      return;
    }

    // Create scaling action
    const action: ScalingAction = {
      actionId: this.generateActionId(),
      policyId: policy.policyId,
      serviceId: policy.targetService,
      timestamp: Date.now(),
      action: decision.action,
      currentReplicas,
      targetReplicas: decision.targetReplicas,
      trigger: {
        type: decision.confidence > 0.85 ? 'predictive' : 'threshold',
        metrics: {},
        confidence: decision.confidence
      },
      execution: {
        status: 'pending'
      }
    };

    await this.executeScalingAction(action);
  }

  private async executeScalingAction(action: ScalingAction): Promise<void> {
    try {
      this.activeActions.set(action.actionId, action);

      // Update execution status
      action.execution.status = 'in_progress';
      action.execution.startTime = Date.now();

      logger.info({
        actionId: action.actionId,
        serviceId: action.serviceId,
        action: action.action,
        currentReplicas: action.currentReplicas,
        targetReplicas: action.targetReplicas
      }, 'Executing scaling action');

      this.emit('scaling:started', { action });

      // Execute the scaling
      const success = await this.orchestrator.scaleService(
        action.serviceId,
        action.targetReplicas
      );

      // Update execution status
      action.execution.endTime = Date.now();

      if (success) {
        action.execution.status = 'completed';
        action.execution.actualReplicas = action.targetReplicas;

        logger.info({
          actionId: action.actionId,
          serviceId: action.serviceId,
          duration: action.execution.endTime - action.execution.startTime!
        }, 'Scaling action completed successfully');

        this.emit('scaling:completed', { action });
      } else {
        action.execution.status = 'failed';
        action.execution.error = 'Orchestrator scaling failed';

        logger.error({
          actionId: action.actionId,
          serviceId: action.serviceId
        }, 'Scaling action failed');

        this.emit('scaling:failed', { action });
      }

      // Move to history and remove from active
      this.actionHistory.push(action);
      this.activeActions.delete(action.actionId);

      // Trim history to prevent memory growth
      if (this.actionHistory.length > 1000) {
        this.actionHistory = this.actionHistory.slice(-500);
      }

    } catch (error) {
      action.execution.status = 'failed';
      action.execution.error = error instanceof Error ? error.message : 'Unknown error';
      action.execution.endTime = Date.now();

      this.actionHistory.push(action);
      this.activeActions.delete(action.actionId);

      logger.error({
        error,
        actionId: action.actionId,
        serviceId: action.serviceId
      }, 'Scaling action execution failed');

      this.emit('scaling:error', { action, error });
    }
  }

  private async cancelScalingAction(actionId: string): Promise<void> {
    const action = this.activeActions.get(actionId);
    if (!action) return;

    action.execution.status = 'cancelled';
    action.execution.endTime = Date.now();

    this.actionHistory.push(action);
    this.activeActions.delete(actionId);

    logger.info({ actionId }, 'Scaling action cancelled');
    this.emit('scaling:cancelled', { action });
  }

  private updateServiceMetrics(serviceId: string, metrics: ResourceMetrics): void {
    if (!this.serviceMetrics.has(serviceId)) {
      this.serviceMetrics.set(serviceId, []);
    }

    const serviceMetricsList = this.serviceMetrics.get(serviceId)!;
    serviceMetricsList.push(metrics);

    // Keep only recent metrics (based on metrics window)
    const cutoffTime = Date.now() - this.config.metricsWindowMs;
    const filteredMetrics = serviceMetricsList.filter(m => m.timestamp > cutoffTime);
    this.serviceMetrics.set(serviceId, filteredMetrics);
  }

  private async updatePredictions(): Promise<void> {
    if (Date.now() - this.lastPredictionUpdate < this.config.predictionUpdateIntervalMs) {
      return;
    }

    const services = new Set(Array.from(this.policies.values()).map(p => p.targetService));

    for (const serviceId of services) {
      try {
        // Create historical data from service metrics
        const metrics = this.serviceMetrics.get(serviceId) || [];
        if (metrics.length < 10) continue; // Need minimum data

        const historicalData = this.convertMetricsToHistoricalData(serviceId, metrics);

        // Generate prediction
        const prediction = await this.workloadPredictor.generateWorkloadPrediction(
          serviceId,
          historicalData,
          'short'
        );

        this.predictions.set(serviceId, prediction);

      } catch (error) {
        logger.error({ error, serviceId }, 'Failed to update prediction for service');
      }
    }

    this.lastPredictionUpdate = Date.now();
  }

  private convertMetricsToHistoricalData(serviceId: string, metrics: ResourceMetrics[]): any {
    return {
      organizationId: serviceId,
      timeRange: {
        start: metrics[0]?.timestamp || Date.now() - 3600000,
        end: Date.now()
      },
      workflowExecutions: metrics.map((metric, index) => ({
        timestamp: metric.timestamp,
        workflowId: `workflow_${index}`,
        duration: 30000, // 30 seconds average
        resourceUsage: {
          cpu: metric.cpu.usage / 100,
          memory: metric.memory.usage,
          storage: metric.disk?.usage || 0,
          network: (metric.network.rxBytes + metric.network.txBytes) / 1000000 // Convert to MB
        },
        status: 'success' as const,
        queueWaitTime: 0
      })),
      systemMetrics: metrics.map(metric => ({
        timestamp: metric.timestamp,
        cpuUtilization: metric.cpu.usage,
        memoryUtilization: (metric.memory.usage / metric.memory.limit) * 100,
        activeConnections: metric.network.connections,
        queueDepth: 0
      }))
    };
  }

  private handlePredictionUpdate(data: any): void {
    logger.debug({ organizationId: data.organizationId }, 'Received prediction update');
    // Prediction updates are handled in the updatePredictions method
  }

  private handleResourceAllocation(data: any): void {
    logger.debug({
      taskId: data.request.taskId,
      agentId: data.result.agentId
    }, 'Resource allocation completed');
    // Could trigger immediate scaling evaluation if needed
  }

  private generatePolicyId(): string {
    return `policy_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateActionId(): string {
    return `action_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}