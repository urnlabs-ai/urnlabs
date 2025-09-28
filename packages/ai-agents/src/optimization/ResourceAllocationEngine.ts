import { EventEmitter } from 'events';
import { z } from 'zod';
import { logger } from '../core/Logger.js';
import type { AgentMetrics, AgentTask, AgentRole } from '../types/AgentTypes.js';
import { AgentPoolManager } from './AgentPoolManager.js';
import { LoadBalancer } from './LoadBalancer.js';
import { PerformanceOptimizer } from './PerformanceOptimizer.js';

// Core allocation schemas and types
export const ResourceRequirementSchema = z.object({
  memoryMB: z.number().min(1),
  cpuCores: z.number().min(0.1).optional(),
  diskGB: z.number().min(0.1).optional(),
  networkBandwidthMbps: z.number().min(0.1).optional(),
  gpuUnits: z.number().min(0).optional(),
  estimatedDurationMs: z.number().min(1).optional()
});

export const AgentPerformanceSchema = z.object({
  agentId: z.string(),
  role: z.string(),
  currentLoad: z.number().min(0).max(100),
  averageResponseTime: z.number().min(0),
  successRate: z.number().min(0).max(100),
  resourceEfficiency: z.number().min(0).max(100),
  qualityScore: z.number().min(0).max(100),
  availability: z.boolean(),
  lastActivity: z.date(),
  specializations: z.array(z.string()).default([]),
  costPerTask: z.number().min(0).optional(),
  slaCompliance: z.number().min(0).max(100).default(100)
});

export const AllocationStrategySchema = z.enum([
  'performance_first',    // Prioritize fastest agents
  'cost_optimized',      // Prioritize cost-effective agents
  'load_balanced',       // Distribute load evenly
  'sla_focused',         // Ensure SLA compliance
  'resource_efficient',  // Optimize resource utilization
  'quality_first',       // Prioritize highest quality agents
  'adaptive'             // Dynamically adapt strategy
]);

export const AllocationConstraintSchema = z.object({
  requiredCapabilities: z.array(z.string()).default([]),
  excludedAgents: z.array(z.string()).default([]),
  preferredAgents: z.array(z.string()).default([]),
  maxLatencyMs: z.number().optional(),
  minQualityScore: z.number().min(0).max(100).optional(),
  maxCostPerTask: z.number().min(0).optional(),
  geographicRegion: z.string().optional(),
  securityClearance: z.enum(['public', 'internal', 'confidential', 'secret']).optional(),
  complianceRequirements: z.array(z.string()).default([])
});

export const AllocationResultSchema = z.object({
  taskId: z.string(),
  agentId: z.string().optional(),
  success: z.boolean(),
  reason: z.string().optional(),
  estimatedCompletionTime: z.date().optional(),
  estimatedCost: z.number().optional(),
  allocationScore: z.number().min(0).max(100).optional(),
  alternativeAgents: z.array(z.string()).default([]),
  metadata: z.record(z.any()).optional()
});

export const AllocationConfigSchema = z.object({
  strategy: AllocationStrategySchema.default('adaptive'),
  enablePreemption: z.boolean().default(false),
  maxQueueSize: z.number().min(1).default(1000),
  allocationTimeoutMs: z.number().min(1000).default(30000),
  performanceUpdateIntervalMs: z.number().min(1000).default(10000),
  rebalanceIntervalMs: z.number().min(10000).default(60000),
  loadThresholds: z.object({
    low: z.number().min(0).max(100).default(20),
    medium: z.number().min(0).max(100).default(60),
    high: z.number().min(0).max(100).default(80),
    critical: z.number().min(0).max(100).default(95)
  }),
  qualityThresholds: z.object({
    minimum: z.number().min(0).max(100).default(50),
    target: z.number().min(0).max(100).default(80),
    excellent: z.number().min(0).max(100).default(95)
  }),
  costOptimization: z.object({
    enabled: z.boolean().default(true),
    maxCostIncrease: z.number().min(0).default(20),
    budgetLimitPerHour: z.number().min(0).optional()
  })
});

// Type exports
export type ResourceRequirement = z.infer<typeof ResourceRequirementSchema>;
export type AgentPerformance = z.infer<typeof AgentPerformanceSchema>;
export type AllocationStrategy = z.infer<typeof AllocationStrategySchema>;
export type AllocationConstraint = z.infer<typeof AllocationConstraintSchema>;
export type AllocationResult = z.infer<typeof AllocationResultSchema>;
export type AllocationConfig = z.infer<typeof AllocationConfigSchema>;

// Allocation request interface
export interface AllocationRequest {
  taskId: string;
  taskType: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  resourceRequirements: ResourceRequirement;
  constraints: AllocationConstraint;
  deadline?: Date;
  contextData?: Record<string, any>;
}

// Event interfaces
export interface AllocationEvent {
  type: 'allocation_success' | 'allocation_failed' | 'agent_reassigned' | 'performance_degraded' | 'resource_optimized';
  timestamp: Date;
  data: Record<string, any>;
}

/**
 * Dynamic Resource Allocation Engine
 *
 * Intelligently allocates agent resources based on real-time performance metrics,
 * predicted workloads, and optimization strategies. Provides automatic load balancing,
 * performance optimization, and resource efficiency management.
 */
export class ResourceAllocationEngine extends EventEmitter {
  private readonly config: AllocationConfig;
  private readonly agentPoolManager: AgentPoolManager;
  private readonly loadBalancer: LoadBalancer;
  private readonly performanceOptimizer: PerformanceOptimizer;

  private agentPerformance: Map<string, AgentPerformance> = new Map();
  private allocationHistory: Map<string, AllocationResult> = new Map();
  private pendingAllocations: Map<string, AllocationRequest> = new Map();

  private performanceUpdateTimer?: NodeJS.Timeout;
  private rebalanceTimer?: NodeJS.Timeout;
  private isRunning = false;

  constructor(
    config: Partial<AllocationConfig> = {},
    agentPoolManager: AgentPoolManager,
    loadBalancer: LoadBalancer,
    performanceOptimizer: PerformanceOptimizer
  ) {
    super();

    this.config = AllocationConfigSchema.parse(config);
    this.agentPoolManager = agentPoolManager;
    this.loadBalancer = loadBalancer;
    this.performanceOptimizer = performanceOptimizer;

    this.setupEventHandlers();
  }

  /**
   * Initialize the resource allocation engine
   */
  async initialize(): Promise<void> {
    try {
      logger.info('Initializing Resource Allocation Engine...');

      // Initialize sub-components
      await this.agentPoolManager.initialize();
      await this.loadBalancer.initialize();
      await this.performanceOptimizer.initialize();

      // Start performance monitoring
      this.startPerformanceMonitoring();

      // Start rebalancing
      this.startRebalancing();

      this.isRunning = true;

      logger.info({
        config: this.config,
        agentCount: this.agentPoolManager.getAgentCount()
      }, 'Resource Allocation Engine initialized successfully');

      this.emit('engine:initialized', {
        timestamp: new Date(),
        config: this.config
      });

    } catch (error) {
      logger.error({ error }, 'Failed to initialize Resource Allocation Engine');
      throw error;
    }
  }

  /**
   * Allocate an agent for a task based on performance and constraints
   */
  async allocateAgent(request: AllocationRequest): Promise<AllocationResult> {
    try {
      logger.debug({
        taskId: request.taskId,
        taskType: request.taskType,
        priority: request.priority
      }, 'Processing allocation request');

      // Validate request
      const validatedRequest = this.validateAllocationRequest(request);

      // Add to pending allocations
      this.pendingAllocations.set(request.taskId, validatedRequest);

      // Find suitable agents
      const suitableAgents = await this.findSuitableAgents(validatedRequest);

      if (suitableAgents.length === 0) {
        const result: AllocationResult = {
          taskId: request.taskId,
          success: false,
          reason: 'No suitable agents available',
          alternativeAgents: []
        };

        this.allocationHistory.set(request.taskId, result);
        this.pendingAllocations.delete(request.taskId);

        this.emit('allocation:failed', { request, result });
        return result;
      }

      // Select optimal agent
      const selectedAgent = await this.selectOptimalAgent(suitableAgents, validatedRequest);

      // Attempt allocation
      const allocationSuccess = await this.agentPoolManager.allocateAgent(
        selectedAgent.agentId,
        request.taskId,
        validatedRequest.resourceRequirements
      );

      if (!allocationSuccess) {
        // Try alternative agents
        for (const agent of suitableAgents.slice(1, 4)) { // Try up to 3 alternatives
          const altSuccess = await this.agentPoolManager.allocateAgent(
            agent.agentId,
            request.taskId,
            validatedRequest.resourceRequirements
          );

          if (altSuccess) {
            selectedAgent.agentId = agent.agentId;
            break;
          }
        }

        if (!allocationSuccess) {
          const result: AllocationResult = {
            taskId: request.taskId,
            success: false,
            reason: 'Agent allocation failed',
            alternativeAgents: suitableAgents.slice(1).map(a => a.agentId)
          };

          this.allocationHistory.set(request.taskId, result);
          this.pendingAllocations.delete(request.taskId);

          this.emit('allocation:failed', { request, result });
          return result;
        }
      }

      // Calculate estimates
      const estimates = await this.calculateEstimates(selectedAgent, validatedRequest);

      const result: AllocationResult = {
        taskId: request.taskId,
        agentId: selectedAgent.agentId,
        success: true,
        reason: 'Successfully allocated',
        estimatedCompletionTime: estimates.completionTime,
        estimatedCost: estimates.cost,
        allocationScore: selectedAgent.score,
        alternativeAgents: suitableAgents.slice(1, 4).map(a => a.agentId),
        metadata: {
          strategy: this.config.strategy,
          allocationTime: new Date(),
          agentLoad: selectedAgent.currentLoad,
          resourceUtilization: estimates.resourceUtilization
        }
      };

      // Update tracking
      this.allocationHistory.set(request.taskId, result);
      this.pendingAllocations.delete(request.taskId);

      // Update load balancer
      await this.loadBalancer.recordAllocation(selectedAgent.agentId, request.taskId);

      this.emit('allocation:success', { request, result });

      logger.info({
        taskId: request.taskId,
        agentId: selectedAgent.agentId,
        allocationScore: selectedAgent.score,
        estimatedCompletion: estimates.completionTime
      }, 'Agent allocated successfully');

      return result;

    } catch (error) {
      logger.error({
        error,
        taskId: request.taskId
      }, 'Failed to allocate agent');

      const result: AllocationResult = {
        taskId: request.taskId,
        success: false,
        reason: `Allocation error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        alternativeAgents: []
      };

      this.allocationHistory.set(request.taskId, result);
      this.pendingAllocations.delete(request.taskId);

      this.emit('allocation:error', { request, result, error });
      return result;
    }
  }

  /**
   * Deallocate an agent after task completion
   */
  async deallocateAgent(taskId: string, completionMetrics?: {
    duration: number;
    success: boolean;
    qualityScore?: number;
    resourceUsage?: Record<string, number>;
  }): Promise<void> {
    try {
      const allocation = this.allocationHistory.get(taskId);

      if (!allocation || !allocation.agentId) {
        logger.warn({ taskId }, 'Attempted to deallocate non-existent allocation');
        return;
      }

      // Update agent performance metrics
      if (completionMetrics) {
        await this.updateAgentPerformance(allocation.agentId, taskId, completionMetrics);
      }

      // Deallocate from pool manager
      await this.agentPoolManager.deallocateAgent(allocation.agentId, taskId);

      // Update load balancer
      await this.loadBalancer.recordDeallocation(allocation.agentId, taskId);

      // Update performance optimizer
      await this.performanceOptimizer.recordTaskCompletion(
        allocation.agentId,
        taskId,
        completionMetrics
      );

      this.emit('deallocation:success', {
        taskId,
        agentId: allocation.agentId,
        completionMetrics
      });

      logger.info({
        taskId,
        agentId: allocation.agentId,
        duration: completionMetrics?.duration,
        success: completionMetrics?.success
      }, 'Agent deallocated successfully');

    } catch (error) {
      logger.error({ error, taskId }, 'Failed to deallocate agent');
      this.emit('deallocation:error', { taskId, error });
    }
  }

  /**
   * Get current allocation status and metrics
   */
  getAllocationStatus(): {
    totalAllocations: number;
    pendingAllocations: number;
    agentUtilization: Record<string, number>;
    averageResponseTime: number;
    successRate: number;
    resourceEfficiency: number;
  } {
    const activeAllocations = Array.from(this.allocationHistory.values())
      .filter(allocation => allocation.success && allocation.agentId);

    const agentUtilization: Record<string, number> = {};
    for (const [agentId, performance] of this.agentPerformance) {
      agentUtilization[agentId] = performance.currentLoad;
    }

    const successfulAllocations = activeAllocations.filter(a => a.success);
    const totalResponseTime = Array.from(this.agentPerformance.values())
      .reduce((sum, perf) => sum + perf.averageResponseTime, 0);

    return {
      totalAllocations: this.allocationHistory.size,
      pendingAllocations: this.pendingAllocations.size,
      agentUtilization,
      averageResponseTime: totalResponseTime / Math.max(this.agentPerformance.size, 1),
      successRate: (successfulAllocations.length / Math.max(this.allocationHistory.size, 1)) * 100,
      resourceEfficiency: this.calculateOverallResourceEfficiency()
    };
  }

  /**
   * Update allocation strategy dynamically
   */
  updateStrategy(strategy: AllocationStrategy): void {
    const oldStrategy = this.config.strategy;
    this.config.strategy = strategy;

    logger.info({
      oldStrategy,
      newStrategy: strategy
    }, 'Allocation strategy updated');

    this.emit('strategy:updated', {
      oldStrategy,
      newStrategy: strategy,
      timestamp: new Date()
    });
  }

  /**
   * Get performance metrics for a specific agent
   */
  getAgentPerformance(agentId: string): AgentPerformance | undefined {
    return this.agentPerformance.get(agentId);
  }

  /**
   * Get allocation history for analysis
   */
  getAllocationHistory(limit = 100): AllocationResult[] {
    return Array.from(this.allocationHistory.values())
      .sort((a, b) => (b.metadata?.allocationTime || 0) - (a.metadata?.allocationTime || 0))
      .slice(0, limit);
  }

  /**
   * Shutdown the allocation engine
   */
  async shutdown(): Promise<void> {
    try {
      logger.info('Shutting down Resource Allocation Engine...');

      this.isRunning = false;

      // Clear timers
      if (this.performanceUpdateTimer) {
        clearInterval(this.performanceUpdateTimer);
      }
      if (this.rebalanceTimer) {
        clearInterval(this.rebalanceTimer);
      }

      // Shutdown sub-components
      await this.agentPoolManager.shutdown();
      await this.loadBalancer.shutdown();
      await this.performanceOptimizer.shutdown();

      this.emit('engine:shutdown', { timestamp: new Date() });

      logger.info('Resource Allocation Engine shutdown complete');

    } catch (error) {
      logger.error({ error }, 'Error during Resource Allocation Engine shutdown');
      throw error;
    }
  }

  // Private helper methods

  private validateAllocationRequest(request: AllocationRequest): AllocationRequest {
    // Validate resource requirements
    ResourceRequirementSchema.parse(request.resourceRequirements);
    AllocationConstraintSchema.parse(request.constraints);

    return request;
  }

  private async findSuitableAgents(request: AllocationRequest): Promise<Array<{
    agentId: string;
    performance: AgentPerformance;
    score: number;
    currentLoad: number;
  }>> {
    const availableAgents = await this.agentPoolManager.getAvailableAgents();
    const suitableAgents: Array<{
      agentId: string;
      performance: AgentPerformance;
      score: number;
      currentLoad: number;
    }> = [];

    for (const agent of availableAgents) {
      const performance = this.agentPerformance.get(agent.id);
      if (!performance || !performance.availability) continue;

      // Check constraints
      if (!this.checkAgentConstraints(agent, request.constraints)) continue;

      // Check resource capacity
      if (!await this.agentPoolManager.canAllocateResources(agent.id, request.resourceRequirements)) continue;

      // Calculate allocation score
      const score = this.calculateAllocationScore(performance, request);

      suitableAgents.push({
        agentId: agent.id,
        performance,
        score,
        currentLoad: performance.currentLoad
      });
    }

    // Sort by score (descending)
    return suitableAgents.sort((a, b) => b.score - a.score);
  }

  private checkAgentConstraints(agent: any, constraints: AllocationConstraint): boolean {
    // Check required capabilities
    if (constraints.requiredCapabilities?.length > 0) {
      const agentCapabilities = agent.capabilities || [];
      const hasRequired = constraints.requiredCapabilities.every(cap =>
        agentCapabilities.some((ac: any) => ac.name === cap)
      );
      if (!hasRequired) return false;
    }

    // Check excluded agents
    if (constraints.excludedAgents?.includes(agent.id)) return false;

    // Check security clearance
    if (constraints.securityClearance && agent.config?.securityClearance) {
      const clearanceLevels = ['public', 'internal', 'confidential', 'secret'];
      const requiredLevel = clearanceLevels.indexOf(constraints.securityClearance);
      const agentLevel = clearanceLevels.indexOf(agent.config.securityClearance);
      if (agentLevel < requiredLevel) return false;
    }

    return true;
  }

  private calculateAllocationScore(performance: AgentPerformance, request: AllocationRequest): number {
    let score = 0;
    const weights = this.getStrategyWeights(this.config.strategy);

    // Performance factors
    score += (performance.successRate / 100) * weights.successRate;
    score += ((100 - performance.currentLoad) / 100) * weights.availability;
    score += (performance.qualityScore / 100) * weights.quality;
    score += (performance.resourceEfficiency / 100) * weights.efficiency;
    score += (performance.slaCompliance / 100) * weights.slaCompliance;

    // Response time factor (lower is better)
    const normalizedResponseTime = Math.max(0, 100 - (performance.averageResponseTime / 1000));
    score += (normalizedResponseTime / 100) * weights.responseTime;

    // Cost factor (lower is better, if available)
    if (performance.costPerTask && weights.cost > 0) {
      const normalizedCost = Math.max(0, 100 - (performance.costPerTask / 10)); // Normalize to 0-100
      score += (normalizedCost / 100) * weights.cost;
    }

    // Priority boost
    if (request.priority === 'critical') score *= 1.2;
    else if (request.priority === 'high') score *= 1.1;

    // Preferred agent boost
    if (request.constraints.preferredAgents?.includes(performance.agentId)) {
      score *= 1.15;
    }

    return Math.min(100, Math.max(0, score));
  }

  private getStrategyWeights(strategy: AllocationStrategy): Record<string, number> {
    const weights: Record<AllocationStrategy, Record<string, number>> = {
      performance_first: {
        successRate: 25, availability: 20, quality: 20, efficiency: 10,
        responseTime: 15, slaCompliance: 5, cost: 5
      },
      cost_optimized: {
        cost: 30, efficiency: 25, successRate: 15, availability: 10,
        quality: 10, responseTime: 5, slaCompliance: 5
      },
      load_balanced: {
        availability: 35, efficiency: 20, successRate: 15, quality: 10,
        responseTime: 10, slaCompliance: 5, cost: 5
      },
      sla_focused: {
        slaCompliance: 35, successRate: 25, responseTime: 20, quality: 10,
        availability: 5, efficiency: 3, cost: 2
      },
      resource_efficient: {
        efficiency: 30, availability: 25, cost: 20, successRate: 10,
        quality: 8, responseTime: 4, slaCompliance: 3
      },
      quality_first: {
        quality: 35, successRate: 25, slaCompliance: 15, responseTime: 10,
        efficiency: 8, availability: 4, cost: 3
      },
      adaptive: {
        successRate: 20, availability: 18, quality: 18, efficiency: 15,
        responseTime: 12, slaCompliance: 10, cost: 7
      }
    };

    return weights[strategy];
  }

  private async selectOptimalAgent(
    suitableAgents: Array<{ agentId: string; performance: AgentPerformance; score: number; currentLoad: number }>,
    request: AllocationRequest
  ): Promise<{ agentId: string; performance: AgentPerformance; score: number; currentLoad: number }> {
    // For adaptive strategy, dynamically adjust based on current conditions
    if (this.config.strategy === 'adaptive') {
      const systemLoad = this.calculateSystemLoad();

      if (systemLoad > this.config.loadThresholds.high) {
        // High load: prioritize availability and efficiency
        return suitableAgents.sort((a, b) =>
          (b.performance.resourceEfficiency + (100 - b.currentLoad)) -
          (a.performance.resourceEfficiency + (100 - a.currentLoad))
        )[0];
      } else if (systemLoad < this.config.loadThresholds.low) {
        // Low load: prioritize quality and performance
        return suitableAgents.sort((a, b) =>
          (b.performance.qualityScore + b.performance.successRate) -
          (a.performance.qualityScore + a.performance.successRate)
        )[0];
      }
    }

    // Default: return highest scoring agent
    return suitableAgents[0];
  }

  private async calculateEstimates(
    selectedAgent: { agentId: string; performance: AgentPerformance; score: number; currentLoad: number },
    request: AllocationRequest
  ): Promise<{
    completionTime: Date;
    cost: number;
    resourceUtilization: Record<string, number>;
  }> {
    const baseDuration = request.resourceRequirements.estimatedDurationMs || 300000; // 5 min default

    // Adjust duration based on agent performance
    const performanceFactor = selectedAgent.performance.successRate / 100;
    const loadFactor = 1 + (selectedAgent.currentLoad / 100) * 0.5; // Up to 50% longer under load

    const adjustedDuration = baseDuration * loadFactor / performanceFactor;
    const completionTime = new Date(Date.now() + adjustedDuration);

    // Calculate cost
    const baseCost = selectedAgent.performance.costPerTask || 0.1; // Default cost
    const priorityMultiplier = request.priority === 'critical' ? 1.5 :
                              request.priority === 'high' ? 1.2 : 1.0;
    const cost = baseCost * priorityMultiplier;

    // Calculate resource utilization
    const resourceUtilization = {
      memory: request.resourceRequirements.memoryMB,
      cpu: request.resourceRequirements.cpuCores || 1,
      disk: request.resourceRequirements.diskGB || 0,
      network: request.resourceRequirements.networkBandwidthMbps || 0
    };

    return { completionTime, cost, resourceUtilization };
  }

  private async updateAgentPerformance(
    agentId: string,
    taskId: string,
    metrics: {
      duration: number;
      success: boolean;
      qualityScore?: number;
      resourceUsage?: Record<string, number>;
    }
  ): Promise<void> {
    const currentPerf = this.agentPerformance.get(agentId);
    if (!currentPerf) return;

    // Update metrics using exponential moving average
    const alpha = 0.2; // Smoothing factor

    const newResponseTime = currentPerf.averageResponseTime * (1 - alpha) + metrics.duration * alpha;
    const newSuccessRate = currentPerf.successRate * (1 - alpha) + (metrics.success ? 100 : 0) * alpha;
    const newQualityScore = metrics.qualityScore ?
      currentPerf.qualityScore * (1 - alpha) + metrics.qualityScore * alpha :
      currentPerf.qualityScore;

    const updatedPerformance: AgentPerformance = {
      ...currentPerf,
      averageResponseTime: newResponseTime,
      successRate: newSuccessRate,
      qualityScore: newQualityScore,
      lastActivity: new Date()
    };

    this.agentPerformance.set(agentId, updatedPerformance);

    this.emit('performance:updated', {
      agentId,
      taskId,
      oldPerformance: currentPerf,
      newPerformance: updatedPerformance
    });
  }

  private calculateSystemLoad(): number {
    const allLoads = Array.from(this.agentPerformance.values()).map(p => p.currentLoad);
    return allLoads.length > 0 ? allLoads.reduce((sum, load) => sum + load, 0) / allLoads.length : 0;
  }

  private calculateOverallResourceEfficiency(): number {
    const efficiencies = Array.from(this.agentPerformance.values()).map(p => p.resourceEfficiency);
    return efficiencies.length > 0 ? efficiencies.reduce((sum, eff) => sum + eff, 0) / efficiencies.length : 0;
  }

  private setupEventHandlers(): void {
    // Handle agent pool events
    this.agentPoolManager.on('agent:added', (data) => {
      this.emit('allocation:agent_added', data);
    });

    this.agentPoolManager.on('agent:removed', (data) => {
      this.agentPerformance.delete(data.agentId);
      this.emit('allocation:agent_removed', data);
    });

    // Handle load balancer events
    this.loadBalancer.on('rebalance:completed', (data) => {
      this.emit('allocation:rebalanced', data);
    });

    // Handle performance optimizer events
    this.performanceOptimizer.on('optimization:applied', (data) => {
      this.emit('allocation:optimized', data);
    });
  }

  private startPerformanceMonitoring(): void {
    this.performanceUpdateTimer = setInterval(async () => {
      try {
        await this.updateAgentPerformanceMetrics();
      } catch (error) {
        logger.error({ error }, 'Error updating agent performance metrics');
      }
    }, this.config.performanceUpdateIntervalMs);
  }

  private startRebalancing(): void {
    this.rebalanceTimer = setInterval(async () => {
      try {
        await this.performRebalancing();
      } catch (error) {
        logger.error({ error }, 'Error during rebalancing');
      }
    }, this.config.rebalanceIntervalMs);
  }

  private async updateAgentPerformanceMetrics(): Promise<void> {
    const agents = await this.agentPoolManager.getAllAgents();

    for (const agent of agents) {
      const metrics = await this.agentPoolManager.getAgentMetrics(agent.id);
      if (!metrics) continue;

      const performance: AgentPerformance = {
        agentId: agent.id,
        role: agent.config.role,
        currentLoad: (metrics.tasksCompleted / agent.config.maxConcurrentTasks) * 100,
        averageResponseTime: metrics.averageProcessingTime,
        successRate: metrics.successRate,
        resourceEfficiency: metrics.performanceScore || 80,
        qualityScore: metrics.performanceScore || 80,
        availability: agent.config.enabled,
        lastActivity: metrics.lastActivity,
        specializations: agent.capabilities?.map(c => c.name) || [],
        slaCompliance: 100 // Would be calculated from actual SLA metrics
      };

      this.agentPerformance.set(agent.id, performance);
    }
  }

  private async performRebalancing(): Promise<void> {
    if (!this.isRunning) return;

    const systemLoad = this.calculateSystemLoad();

    if (systemLoad > this.config.loadThresholds.high) {
      logger.info({ systemLoad }, 'High system load detected, initiating rebalancing');

      // Trigger load balancer rebalancing
      await this.loadBalancer.rebalance();

      // Trigger performance optimization
      await this.performanceOptimizer.optimizeAllocations();

      this.emit('rebalance:completed', {
        timestamp: new Date(),
        systemLoad,
        reason: 'high_load'
      });
    }
  }
}