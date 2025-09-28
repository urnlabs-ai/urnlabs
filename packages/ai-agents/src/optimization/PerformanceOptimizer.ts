import { EventEmitter } from 'events';
import { z } from 'zod';
import { logger } from '../core/Logger.js';

// Performance optimization schemas and types
export const OptimizationStrategySchema = z.enum([
  'throughput_maximization',    // Focus on maximum task completion
  'latency_minimization',      // Focus on fastest response times
  'resource_efficiency',       // Optimize resource utilization
  'cost_optimization',         // Minimize operational costs
  'quality_assurance',         // Prioritize output quality
  'sla_compliance',           // Ensure SLA targets are met
  'adaptive_optimization'      // Dynamically adapt strategy
]);

export const PerformanceMetricSchema = z.object({
  agentId: z.string(),
  timestamp: z.date(),
  throughput: z.number().min(0),                    // Tasks per minute
  averageLatency: z.number().min(0),               // Average response time in ms
  p50Latency: z.number().min(0),                   // 50th percentile latency
  p95Latency: z.number().min(0),                   // 95th percentile latency
  p99Latency: z.number().min(0),                   // 99th percentile latency
  errorRate: z.number().min(0).max(100),           // Error percentage
  successRate: z.number().min(0).max(100),         // Success percentage
  qualityScore: z.number().min(0).max(100),        // Average quality score
  resourceUtilization: z.object({
    cpu: z.number().min(0).max(100),
    memory: z.number().min(0).max(100),
    disk: z.number().min(0).max(100),
    network: z.number().min(0).max(100)
  }),
  costMetrics: z.object({
    costPerTask: z.number().min(0),
    totalCost: z.number().min(0),
    efficiency: z.number().min(0).max(100)           // Cost efficiency score
  }),
  slaMetrics: z.object({
    slaTarget: z.number().min(0),                    // Target SLA in ms
    slaCompliance: z.number().min(0).max(100),       // SLA compliance percentage
    slaViolations: z.number().min(0)                 // Number of SLA violations
  })
});

export const OptimizationRuleSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  enabled: z.boolean().default(true),
  priority: z.number().min(1).max(10).default(5),
  conditions: z.array(z.object({
    metric: z.string(),
    operator: z.enum(['<', '>', '<=', '>=', '==', '!=']),
    value: z.number(),
    duration: z.number().optional()                 // Duration in ms for sustained condition
  })),
  actions: z.array(z.object({
    type: z.enum([
      'scale_up',
      'scale_down',
      'reallocate_resources',
      'adjust_priority',
      'change_algorithm',
      'throttle_requests',
      'alert',
      'circuit_break'
    ]),
    parameters: z.record(z.any())
  })),
  cooldown: z.number().min(0).default(300000),      // 5 minutes default cooldown
  lastTriggered: z.date().optional()
});

export const OptimizationRecommendationSchema = z.object({
  id: z.string(),
  timestamp: z.date(),
  type: z.enum([
    'resource_adjustment',
    'algorithm_change',
    'scaling_recommendation',
    'configuration_tuning',
    'performance_alert'
  ]),
  priority: z.enum(['low', 'medium', 'high', 'critical']),
  title: z.string(),
  description: z.string(),
  impact: z.object({
    estimatedImprovement: z.number().min(0).max(100),
    affectedAgents: z.array(z.string()),
    estimatedCost: z.number().optional(),
    riskLevel: z.enum(['low', 'medium', 'high'])
  }),
  actions: z.array(z.object({
    description: z.string(),
    parameters: z.record(z.any())
  })),
  metrics: z.object({
    currentPerformance: z.record(z.number()),
    targetPerformance: z.record(z.number())
  }),
  autoApplicable: z.boolean().default(false),
  expiresAt: z.date().optional()
});

export const PerformanceOptimizerConfigSchema = z.object({
  strategy: OptimizationStrategySchema.default('adaptive_optimization'),
  enabled: z.boolean().default(true),
  optimizationInterval: z.number().min(10000).default(60000),    // 1 minute
  metricsCollectionInterval: z.number().min(1000).default(10000), // 10 seconds
  performanceTargets: z.object({
    maxLatency: z.number().min(1).default(5000),                 // 5 seconds
    minThroughput: z.number().min(0.1).default(10),              // 10 tasks/min
    minSuccessRate: z.number().min(0).max(100).default(95),      // 95%
    maxErrorRate: z.number().min(0).max(100).default(5),         // 5%
    minQualityScore: z.number().min(0).max(100).default(80),     // 80%
    maxCostPerTask: z.number().min(0).default(1.0),              // $1.00
    slaTarget: z.number().min(1).default(3000)                   // 3 seconds
  }),
  alerting: z.object({
    enabled: z.boolean().default(true),
    performanceDegradationThreshold: z.number().min(0).max(100).default(20), // 20% degradation
    consecutiveFailuresThreshold: z.number().min(1).default(3),
    slaViolationThreshold: z.number().min(0).max(100).default(10)  // 10% SLA violations
  }),
  autoOptimization: z.object({
    enabled: z.boolean().default(true),
    maxResourceAdjustment: z.number().min(0).max(100).default(25), // 25% max adjustment
    conservativeMode: z.boolean().default(true),
    requiresApproval: z.boolean().default(false)
  }),
  machineLearning: z.object({
    enabled: z.boolean().default(true),
    predictionWindowMs: z.number().min(60000).default(300000),     // 5 minutes
    modelUpdateInterval: z.number().min(300000).default(3600000),  // 1 hour
    confidenceThreshold: z.number().min(0).max(1).default(0.8)
  })
});

// Type exports
export type OptimizationStrategy = z.infer<typeof OptimizationStrategySchema>;
export type PerformanceMetric = z.infer<typeof PerformanceMetricSchema>;
export type OptimizationRule = z.infer<typeof OptimizationRuleSchema>;
export type OptimizationRecommendation = z.infer<typeof OptimizationRecommendationSchema>;
export type PerformanceOptimizerConfig = z.infer<typeof PerformanceOptimizerConfigSchema>;

// Task completion metrics interface
export interface TaskCompletionMetrics {
  duration: number;
  success: boolean;
  qualityScore?: number;
  resourceUsage?: Record<string, number>;
  errorType?: string;
  slaViolation?: boolean;
}

// Performance trend interface
export interface PerformanceTrend {
  metric: string;
  agentId: string;
  trend: 'improving' | 'degrading' | 'stable';
  changeRate: number;
  confidence: number;
  forecastValue?: number;
}

/**
 * Performance Optimizer
 *
 * Real-time performance optimization system that continuously monitors
 * agent performance, identifies bottlenecks, and automatically applies
 * optimizations to improve throughput, reduce latency, and ensure
 * resource efficiency.
 */
export class PerformanceOptimizer extends EventEmitter {
  private readonly config: PerformanceOptimizerConfig;

  private metrics: Map<string, PerformanceMetric[]> = new Map();
  private rules: Map<string, OptimizationRule> = new Map();
  private recommendations: Map<string, OptimizationRecommendation> = new Map();
  private trends: Map<string, PerformanceTrend[]> = new Map();

  private taskCompletions: Map<string, TaskCompletionMetrics[]> = new Map();
  private latencyMeasurements: Map<string, number[]> = new Map();

  private metricsTimer?: NodeJS.Timeout;
  private optimizationTimer?: NodeJS.Timeout;
  private trendAnalysisTimer?: NodeJS.Timeout;

  private isRunning = false;

  constructor(config: Partial<PerformanceOptimizerConfig> = {}) {
    super();

    this.config = PerformanceOptimizerConfigSchema.parse(config);
    this.setupDefaultRules();
    this.setupEventHandlers();
  }

  /**
   * Initialize the performance optimizer
   */
  async initialize(): Promise<void> {
    try {
      logger.info('Initializing Performance Optimizer...');

      if (this.config.enabled) {
        this.startMetricsCollection();
        this.startOptimization();
        this.startTrendAnalysis();
      }

      this.isRunning = true;

      logger.info({
        config: {
          strategy: this.config.strategy,
          optimizationInterval: this.config.optimizationInterval,
          autoOptimization: this.config.autoOptimization.enabled,
          alerting: this.config.alerting.enabled
        }
      }, 'Performance Optimizer initialized successfully');

      this.emit('optimizer:initialized', {
        timestamp: new Date(),
        config: this.config
      });

    } catch (error) {
      logger.error({ error }, 'Failed to initialize Performance Optimizer');
      throw error;
    }
  }

  /**
   * Record task completion metrics for an agent
   */
  async recordTaskCompletion(
    agentId: string,
    taskId: string,
    metrics?: TaskCompletionMetrics
  ): Promise<void> {
    if (!metrics) return;

    try {
      // Store task completion metrics
      if (!this.taskCompletions.has(agentId)) {
        this.taskCompletions.set(agentId, []);
      }

      const completions = this.taskCompletions.get(agentId)!;
      completions.push(metrics);

      // Keep only last 1000 completions per agent
      if (completions.length > 1000) {
        completions.splice(0, completions.length - 1000);
      }

      // Record latency measurement
      if (!this.latencyMeasurements.has(agentId)) {
        this.latencyMeasurements.set(agentId, []);
      }

      const latencies = this.latencyMeasurements.get(agentId)!;
      latencies.push(metrics.duration);

      // Keep only last 100 latency measurements per agent
      if (latencies.length > 100) {
        latencies.splice(0, latencies.length - 100);
      }

      // Update real-time metrics
      await this.updateAgentMetrics(agentId);

      // Check for immediate optimization needs
      await this.checkImmediateOptimization(agentId, metrics);

      this.emit('metrics:task_completed', {
        agentId,
        taskId,
        metrics,
        timestamp: new Date()
      });

    } catch (error) {
      logger.error({
        error,
        agentId,
        taskId
      }, 'Failed to record task completion metrics');
    }
  }

  /**
   * Add or update an optimization rule
   */
  addOptimizationRule(rule: OptimizationRule): void {
    this.rules.set(rule.id, rule);

    logger.info({
      ruleId: rule.id,
      ruleName: rule.name,
      enabled: rule.enabled,
      priority: rule.priority
    }, 'Optimization rule added');

    this.emit('rule:added', {
      rule,
      timestamp: new Date()
    });
  }

  /**
   * Remove an optimization rule
   */
  removeOptimizationRule(ruleId: string): void {
    const removed = this.rules.delete(ruleId);

    if (removed) {
      logger.info({ ruleId }, 'Optimization rule removed');

      this.emit('rule:removed', {
        ruleId,
        timestamp: new Date()
      });
    }
  }

  /**
   * Get current performance metrics for an agent
   */
  getAgentMetrics(agentId: string): PerformanceMetric | null {
    const agentMetrics = this.metrics.get(agentId);
    return agentMetrics && agentMetrics.length > 0 ? agentMetrics[agentMetrics.length - 1] : null;
  }

  /**
   * Get performance trends for an agent
   */
  getAgentTrends(agentId: string): PerformanceTrend[] {
    return this.trends.get(agentId) || [];
  }

  /**
   * Get current optimization recommendations
   */
  getRecommendations(priority?: 'low' | 'medium' | 'high' | 'critical'): OptimizationRecommendation[] {
    const allRecommendations = Array.from(this.recommendations.values());

    const activeRecommendations = allRecommendations.filter(rec => {
      if (rec.expiresAt && rec.expiresAt < new Date()) return false;
      if (priority && rec.priority !== priority) return false;
      return true;
    });

    return activeRecommendations.sort((a, b) => {
      const priorityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
      return priorityOrder[b.priority] - priorityOrder[a.priority];
    });
  }

  /**
   * Apply an optimization recommendation
   */
  async applyRecommendation(recommendationId: string): Promise<boolean> {
    try {
      const recommendation = this.recommendations.get(recommendationId);

      if (!recommendation) {
        logger.warn({ recommendationId }, 'Attempted to apply non-existent recommendation');
        return false;
      }

      logger.info({
        recommendationId,
        type: recommendation.type,
        priority: recommendation.priority,
        affectedAgents: recommendation.impact.affectedAgents
      }, 'Applying optimization recommendation');

      // Apply each action in the recommendation
      for (const action of recommendation.actions) {
        await this.executeOptimizationAction(action, recommendation);
      }

      // Remove applied recommendation
      this.recommendations.delete(recommendationId);

      this.emit('recommendation:applied', {
        recommendation,
        timestamp: new Date()
      });

      return true;

    } catch (error) {
      logger.error({
        error,
        recommendationId
      }, 'Failed to apply optimization recommendation');

      this.emit('recommendation:failed', {
        recommendationId,
        error,
        timestamp: new Date()
      });

      return false;
    }
  }

  /**
   * Force optimization for specific agents
   */
  async optimizeAllocations(agentIds?: string[]): Promise<void> {
    try {
      const targetAgents = agentIds || Array.from(this.metrics.keys());

      logger.info({
        agentCount: targetAgents.length,
        strategy: this.config.strategy
      }, 'Performing manual optimization');

      for (const agentId of targetAgents) {
        await this.optimizeAgent(agentId);
      }

      this.emit('optimization:manual', {
        agentIds: targetAgents,
        timestamp: new Date()
      });

    } catch (error) {
      logger.error({ error }, 'Failed to perform manual optimization');
    }
  }

  /**
   * Update optimization strategy
   */
  updateStrategy(strategy: OptimizationStrategy): void {
    const oldStrategy = this.config.strategy;
    this.config.strategy = strategy;

    logger.info({
      oldStrategy,
      newStrategy: strategy
    }, 'Optimization strategy updated');

    this.emit('strategy:updated', {
      oldStrategy,
      newStrategy: strategy,
      timestamp: new Date()
    });
  }

  /**
   * Get optimization statistics
   */
  getStatistics(): {
    totalAgents: number;
    averagePerformance: Record<string, number>;
    optimizationRules: number;
    activeRecommendations: number;
    totalOptimizations: number;
    performanceTrends: Record<string, string>;
  } {
    const agents = Array.from(this.metrics.keys());
    const totalAgents = agents.length;

    // Calculate average performance across all agents
    const averagePerformance: Record<string, number> = {};
    if (totalAgents > 0) {
      const allMetrics = agents.map(agentId => this.getAgentMetrics(agentId)).filter(Boolean) as PerformanceMetric[];

      if (allMetrics.length > 0) {
        averagePerformance.throughput = allMetrics.reduce((sum, m) => sum + m.throughput, 0) / allMetrics.length;
        averagePerformance.averageLatency = allMetrics.reduce((sum, m) => sum + m.averageLatency, 0) / allMetrics.length;
        averagePerformance.successRate = allMetrics.reduce((sum, m) => sum + m.successRate, 0) / allMetrics.length;
        averagePerformance.qualityScore = allMetrics.reduce((sum, m) => sum + m.qualityScore, 0) / allMetrics.length;
        averagePerformance.cpuUtilization = allMetrics.reduce((sum, m) => sum + m.resourceUtilization.cpu, 0) / allMetrics.length;
        averagePerformance.memoryUtilization = allMetrics.reduce((sum, m) => sum + m.resourceUtilization.memory, 0) / allMetrics.length;
        averagePerformance.slaCompliance = allMetrics.reduce((sum, m) => sum + m.slaMetrics.slaCompliance, 0) / allMetrics.length;
      }
    }

    // Count trends
    const performanceTrends: Record<string, string> = {};
    for (const [agentId, trends] of this.trends) {
      const latestTrend = trends.find(t => t.metric === 'averageLatency');
      performanceTrends[agentId] = latestTrend?.trend || 'stable';
    }

    return {
      totalAgents,
      averagePerformance,
      optimizationRules: this.rules.size,
      activeRecommendations: this.getRecommendations().length,
      totalOptimizations: 0, // Would track applied optimizations
      performanceTrends
    };
  }

  /**
   * Shutdown the performance optimizer
   */
  async shutdown(): Promise<void> {
    try {
      logger.info('Shutting down Performance Optimizer...');

      this.isRunning = false;

      // Clear timers
      if (this.metricsTimer) {
        clearInterval(this.metricsTimer);
      }
      if (this.optimizationTimer) {
        clearInterval(this.optimizationTimer);
      }
      if (this.trendAnalysisTimer) {
        clearInterval(this.trendAnalysisTimer);
      }

      // Clear data
      this.metrics.clear();
      this.recommendations.clear();
      this.trends.clear();
      this.taskCompletions.clear();
      this.latencyMeasurements.clear();

      this.emit('optimizer:shutdown', { timestamp: new Date() });

      logger.info('Performance Optimizer shutdown complete');

    } catch (error) {
      logger.error({ error }, 'Error during Performance Optimizer shutdown');
      throw error;
    }
  }

  // Private helper methods

  private async updateAgentMetrics(agentId: string): Promise<void> {
    const completions = this.taskCompletions.get(agentId) || [];
    const latencies = this.latencyMeasurements.get(agentId) || [];

    if (completions.length === 0) return;

    // Calculate metrics from recent completions
    const recentCompletions = completions.slice(-50); // Last 50 tasks
    const timeWindow = 60000; // 1 minute
    const now = Date.now();
    const recentTasks = recentCompletions.filter(completion =>
      now - completion.duration < timeWindow // Approximate recent tasks
    );

    // Calculate performance metrics
    const throughput = (recentTasks.length / timeWindow) * 60000; // Tasks per minute
    const successfulTasks = recentTasks.filter(t => t.success);
    const successRate = recentTasks.length > 0 ? (successfulTasks.length / recentTasks.length) * 100 : 100;
    const errorRate = 100 - successRate;

    // Calculate latency percentiles
    const sortedLatencies = [...latencies].sort((a, b) => a - b);
    const p50Index = Math.floor(sortedLatencies.length * 0.5);
    const p95Index = Math.floor(sortedLatencies.length * 0.95);
    const p99Index = Math.floor(sortedLatencies.length * 0.99);

    const p50Latency = sortedLatencies[p50Index] || 0;
    const p95Latency = sortedLatencies[p95Index] || 0;
    const p99Latency = sortedLatencies[p99Index] || 0;
    const averageLatency = latencies.length > 0 ? latencies.reduce((sum, l) => sum + l, 0) / latencies.length : 0;

    // Calculate quality score
    const qualityScores = recentTasks.map(t => t.qualityScore || 80).filter(Boolean);
    const qualityScore = qualityScores.length > 0 ? qualityScores.reduce((sum, q) => sum + q, 0) / qualityScores.length : 80;

    // Calculate SLA metrics
    const slaViolations = recentTasks.filter(t => t.duration > this.config.performanceTargets.slaTarget).length;
    const slaCompliance = recentTasks.length > 0 ? ((recentTasks.length - slaViolations) / recentTasks.length) * 100 : 100;

    // Create performance metric
    const metric: PerformanceMetric = {
      agentId,
      timestamp: new Date(),
      throughput,
      averageLatency,
      p50Latency,
      p95Latency,
      p99Latency,
      errorRate,
      successRate,
      qualityScore,
      resourceUtilization: {
        cpu: 50, // Would be retrieved from agent monitoring
        memory: 60,
        disk: 30,
        network: 20
      },
      costMetrics: {
        costPerTask: 0.1, // Would be calculated from actual costs
        totalCost: recentTasks.length * 0.1,
        efficiency: Math.min(100, (throughput / 100) * 100) // Efficiency based on throughput
      },
      slaMetrics: {
        slaTarget: this.config.performanceTargets.slaTarget,
        slaCompliance,
        slaViolations
      }
    };

    // Store metric
    if (!this.metrics.has(agentId)) {
      this.metrics.set(agentId, []);
    }

    const agentMetrics = this.metrics.get(agentId)!;
    agentMetrics.push(metric);

    // Keep only last 100 metrics per agent
    if (agentMetrics.length > 100) {
      agentMetrics.splice(0, agentMetrics.length - 100);
    }

    this.emit('metrics:updated', {
      agentId,
      metric,
      timestamp: new Date()
    });
  }

  private async checkImmediateOptimization(agentId: string, metrics: TaskCompletionMetrics): Promise<void> {
    // Check for immediate performance issues
    if (metrics.duration > this.config.performanceTargets.maxLatency) {
      await this.createRecommendation({
        type: 'performance_alert',
        priority: 'high',
        title: `High latency detected for agent ${agentId}`,
        description: `Task took ${metrics.duration}ms, exceeding target of ${this.config.performanceTargets.maxLatency}ms`,
        impact: {
          estimatedImprovement: 30,
          affectedAgents: [agentId],
          riskLevel: 'medium'
        },
        actions: [{
          description: 'Review agent resource allocation and consider scaling',
          parameters: { agentId, issue: 'high_latency' }
        }]
      });
    }

    if (!metrics.success) {
      await this.createRecommendation({
        type: 'performance_alert',
        priority: 'medium',
        title: `Task failure detected for agent ${agentId}`,
        description: `Task failed with error: ${metrics.errorType || 'Unknown error'}`,
        impact: {
          estimatedImprovement: 20,
          affectedAgents: [agentId],
          riskLevel: 'medium'
        },
        actions: [{
          description: 'Investigate task failure and check agent health',
          parameters: { agentId, issue: 'task_failure', errorType: metrics.errorType }
        }]
      });
    }

    if (metrics.slaViolation) {
      await this.createRecommendation({
        type: 'performance_alert',
        priority: 'critical',
        title: `SLA violation for agent ${agentId}`,
        description: 'Task exceeded SLA target time',
        impact: {
          estimatedImprovement: 50,
          affectedAgents: [agentId],
          riskLevel: 'high'
        },
        actions: [{
          description: 'Immediate resource allocation review required',
          parameters: { agentId, issue: 'sla_violation' }
        }]
      });
    }
  }

  private async optimizeAgent(agentId: string): Promise<void> {
    const metrics = this.getAgentMetrics(agentId);
    if (!metrics) return;

    // Apply optimization strategy
    switch (this.config.strategy) {
      case 'throughput_maximization':
        await this.optimizeForThroughput(agentId, metrics);
        break;

      case 'latency_minimization':
        await this.optimizeForLatency(agentId, metrics);
        break;

      case 'resource_efficiency':
        await this.optimizeForResourceEfficiency(agentId, metrics);
        break;

      case 'cost_optimization':
        await this.optimizeForCost(agentId, metrics);
        break;

      case 'quality_assurance':
        await this.optimizeForQuality(agentId, metrics);
        break;

      case 'sla_compliance':
        await this.optimizeForSLA(agentId, metrics);
        break;

      case 'adaptive_optimization':
        await this.adaptiveOptimization(agentId, metrics);
        break;
    }
  }

  private async optimizeForThroughput(agentId: string, metrics: PerformanceMetric): Promise<void> {
    if (metrics.throughput < this.config.performanceTargets.minThroughput) {
      await this.createRecommendation({
        type: 'scaling_recommendation',
        priority: 'medium',
        title: `Low throughput for agent ${agentId}`,
        description: `Current throughput: ${metrics.throughput.toFixed(2)} tasks/min, target: ${this.config.performanceTargets.minThroughput}`,
        impact: {
          estimatedImprovement: 40,
          affectedAgents: [agentId],
          riskLevel: 'low'
        },
        actions: [{
          description: 'Scale up agent resources or adjust task allocation',
          parameters: { agentId, optimization: 'throughput', action: 'scale_up' }
        }]
      });
    }
  }

  private async optimizeForLatency(agentId: string, metrics: PerformanceMetric): Promise<void> {
    if (metrics.averageLatency > this.config.performanceTargets.maxLatency) {
      await this.createRecommendation({
        type: 'resource_adjustment',
        priority: 'high',
        title: `High latency for agent ${agentId}`,
        description: `Current latency: ${metrics.averageLatency}ms, target: ${this.config.performanceTargets.maxLatency}ms`,
        impact: {
          estimatedImprovement: 50,
          affectedAgents: [agentId],
          riskLevel: 'medium'
        },
        actions: [{
          description: 'Increase CPU allocation or optimize processing pipeline',
          parameters: { agentId, optimization: 'latency', action: 'increase_cpu' }
        }]
      });
    }
  }

  private async optimizeForResourceEfficiency(agentId: string, metrics: PerformanceMetric): Promise<void> {
    const avgUtilization = (metrics.resourceUtilization.cpu + metrics.resourceUtilization.memory) / 2;

    if (avgUtilization < 30) {
      await this.createRecommendation({
        type: 'resource_adjustment',
        priority: 'low',
        title: `Low resource utilization for agent ${agentId}`,
        description: `Average utilization: ${avgUtilization.toFixed(1)}%`,
        impact: {
          estimatedImprovement: 25,
          affectedAgents: [agentId],
          riskLevel: 'low'
        },
        actions: [{
          description: 'Consider reducing resource allocation or increasing task load',
          parameters: { agentId, optimization: 'efficiency', action: 'reduce_resources' }
        }]
      });
    }
  }

  private async optimizeForCost(agentId: string, metrics: PerformanceMetric): Promise<void> {
    if (metrics.costMetrics.costPerTask > this.config.performanceTargets.maxCostPerTask) {
      await this.createRecommendation({
        type: 'cost_optimization',
        priority: 'medium',
        title: `High cost per task for agent ${agentId}`,
        description: `Current cost: $${metrics.costMetrics.costPerTask.toFixed(3)}, target: $${this.config.performanceTargets.maxCostPerTask}`,
        impact: {
          estimatedImprovement: 30,
          affectedAgents: [agentId],
          estimatedCost: -metrics.costMetrics.costPerTask * 0.3,
          riskLevel: 'low'
        },
        actions: [{
          description: 'Optimize resource allocation or switch to more cost-effective instance type',
          parameters: { agentId, optimization: 'cost', action: 'optimize_resources' }
        }]
      });
    }
  }

  private async optimizeForQuality(agentId: string, metrics: PerformanceMetric): Promise<void> {
    if (metrics.qualityScore < this.config.performanceTargets.minQualityScore) {
      await this.createRecommendation({
        type: 'configuration_tuning',
        priority: 'high',
        title: `Low quality score for agent ${agentId}`,
        description: `Current quality: ${metrics.qualityScore.toFixed(1)}, target: ${this.config.performanceTargets.minQualityScore}`,
        impact: {
          estimatedImprovement: 35,
          affectedAgents: [agentId],
          riskLevel: 'medium'
        },
        actions: [{
          description: 'Review agent configuration and adjust quality parameters',
          parameters: { agentId, optimization: 'quality', action: 'tune_configuration' }
        }]
      });
    }
  }

  private async optimizeForSLA(agentId: string, metrics: PerformanceMetric): Promise<void> {
    if (metrics.slaMetrics.slaCompliance < 90) {
      await this.createRecommendation({
        type: 'performance_alert',
        priority: 'critical',
        title: `SLA compliance issue for agent ${agentId}`,
        description: `SLA compliance: ${metrics.slaMetrics.slaCompliance.toFixed(1)}%, violations: ${metrics.slaMetrics.slaViolations}`,
        impact: {
          estimatedImprovement: 60,
          affectedAgents: [agentId],
          riskLevel: 'high'
        },
        actions: [{
          description: 'Immediate attention required to meet SLA targets',
          parameters: { agentId, optimization: 'sla', action: 'emergency_optimization' }
        }]
      });
    }
  }

  private async adaptiveOptimization(agentId: string, metrics: PerformanceMetric): Promise<void> {
    // Adaptive strategy considers multiple factors
    const issues: string[] = [];

    if (metrics.averageLatency > this.config.performanceTargets.maxLatency) issues.push('latency');
    if (metrics.throughput < this.config.performanceTargets.minThroughput) issues.push('throughput');
    if (metrics.successRate < this.config.performanceTargets.minSuccessRate) issues.push('reliability');
    if (metrics.qualityScore < this.config.performanceTargets.minQualityScore) issues.push('quality');
    if (metrics.slaMetrics.slaCompliance < 90) issues.push('sla');

    if (issues.length > 0) {
      const priorityIssue = this.determinePriorityIssue(issues, metrics);

      await this.createRecommendation({
        type: 'configuration_tuning',
        priority: issues.includes('sla') ? 'critical' : issues.length > 2 ? 'high' : 'medium',
        title: `Multiple performance issues for agent ${agentId}`,
        description: `Issues detected: ${issues.join(', ')}. Priority issue: ${priorityIssue}`,
        impact: {
          estimatedImprovement: 40 + (issues.length * 10),
          affectedAgents: [agentId],
          riskLevel: issues.length > 2 ? 'high' : 'medium'
        },
        actions: [{
          description: `Address ${priorityIssue} issue first, then optimize other areas`,
          parameters: { agentId, optimization: 'adaptive', priorityIssue, allIssues: issues }
        }]
      });
    }
  }

  private determinePriorityIssue(issues: string[], metrics: PerformanceMetric): string {
    // Prioritize based on business impact
    if (issues.includes('sla')) return 'sla';
    if (issues.includes('reliability')) return 'reliability';
    if (issues.includes('latency')) return 'latency';
    if (issues.includes('quality')) return 'quality';
    if (issues.includes('throughput')) return 'throughput';
    return issues[0];
  }

  private async createRecommendation(partial: Partial<OptimizationRecommendation>): Promise<void> {
    const recommendation: OptimizationRecommendation = {
      id: `rec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
      type: partial.type || 'performance_alert',
      priority: partial.priority || 'medium',
      title: partial.title || 'Performance optimization needed',
      description: partial.description || '',
      impact: {
        estimatedImprovement: 25,
        affectedAgents: [],
        riskLevel: 'medium',
        ...partial.impact
      },
      actions: partial.actions || [],
      metrics: {
        currentPerformance: {},
        targetPerformance: {},
        ...partial.metrics
      },
      autoApplicable: this.config.autoOptimization.enabled && !this.config.autoOptimization.requiresApproval,
      expiresAt: new Date(Date.now() + 3600000) // 1 hour expiry
    };

    this.recommendations.set(recommendation.id, recommendation);

    this.emit('recommendation:created', {
      recommendation,
      timestamp: new Date()
    });

    // Auto-apply if enabled and safe
    if (recommendation.autoApplicable && recommendation.impact.riskLevel === 'low') {
      setTimeout(async () => {
        await this.applyRecommendation(recommendation.id);
      }, 5000); // 5 second delay for review
    }
  }

  private async executeOptimizationAction(action: any, recommendation: OptimizationRecommendation): Promise<void> {
    // This would integrate with the actual agent orchestration system
    // For now, we'll emit events that the orchestrator can listen to

    this.emit('optimization:action', {
      action,
      recommendation,
      timestamp: new Date()
    });

    logger.info({
      actionType: action.type,
      parameters: action.parameters,
      recommendationId: recommendation.id
    }, 'Optimization action executed');
  }

  private setupDefaultRules(): void {
    // High latency rule
    this.addOptimizationRule({
      id: 'high_latency_rule',
      name: 'High Latency Detection',
      description: 'Detects when agent latency exceeds acceptable thresholds',
      enabled: true,
      priority: 8,
      conditions: [{
        metric: 'averageLatency',
        operator: '>',
        value: this.config.performanceTargets.maxLatency,
        duration: 30000 // 30 seconds
      }],
      actions: [{
        type: 'alert',
        parameters: { severity: 'high', metric: 'latency' }
      }],
      cooldown: 300000 // 5 minutes
    });

    // Low throughput rule
    this.addOptimizationRule({
      id: 'low_throughput_rule',
      name: 'Low Throughput Detection',
      description: 'Detects when agent throughput falls below minimum requirements',
      enabled: true,
      priority: 6,
      conditions: [{
        metric: 'throughput',
        operator: '<',
        value: this.config.performanceTargets.minThroughput,
        duration: 60000 // 1 minute
      }],
      actions: [{
        type: 'scale_up',
        parameters: { reason: 'low_throughput' }
      }],
      cooldown: 600000 // 10 minutes
    });

    // SLA violation rule
    this.addOptimizationRule({
      id: 'sla_violation_rule',
      name: 'SLA Violation Detection',
      description: 'Detects SLA compliance issues',
      enabled: true,
      priority: 10,
      conditions: [{
        metric: 'slaCompliance',
        operator: '<',
        value: 90,
        duration: 60000
      }],
      actions: [{
        type: 'alert',
        parameters: { severity: 'critical', metric: 'sla' }
      }],
      cooldown: 180000 // 3 minutes
    });
  }

  private startMetricsCollection(): void {
    this.metricsTimer = setInterval(async () => {
      try {
        // Update metrics for all agents with recent activity
        for (const agentId of this.taskCompletions.keys()) {
          await this.updateAgentMetrics(agentId);
        }
      } catch (error) {
        logger.error({ error }, 'Error during metrics collection');
      }
    }, this.config.metricsCollectionInterval);
  }

  private startOptimization(): void {
    this.optimizationTimer = setInterval(async () => {
      try {
        // Run optimization for all agents
        for (const agentId of this.metrics.keys()) {
          await this.optimizeAgent(agentId);
        }
      } catch (error) {
        logger.error({ error }, 'Error during optimization cycle');
      }
    }, this.config.optimizationInterval);
  }

  private startTrendAnalysis(): void {
    this.trendAnalysisTimer = setInterval(async () => {
      try {
        await this.analyzeTrends();
      } catch (error) {
        logger.error({ error }, 'Error during trend analysis');
      }
    }, 300000); // 5 minutes
  }

  private async analyzeTrends(): Promise<void> {
    for (const [agentId, metricHistory] of this.metrics) {
      if (metricHistory.length < 5) continue; // Need at least 5 data points

      const trends = this.calculateMetricTrends(agentId, metricHistory);
      this.trends.set(agentId, trends);

      // Emit trend updates
      for (const trend of trends) {
        if (trend.trend === 'degrading' && trend.confidence > 0.7) {
          this.emit('trend:degradation', {
            agentId,
            trend,
            timestamp: new Date()
          });
        }
      }
    }
  }

  private calculateMetricTrends(agentId: string, metricHistory: PerformanceMetric[]): PerformanceTrend[] {
    const trends: PerformanceTrend[] = [];
    const metricsToAnalyze = ['throughput', 'averageLatency', 'successRate', 'qualityScore'];

    for (const metricName of metricsToAnalyze) {
      const values = metricHistory.slice(-10).map(m => (m as any)[metricName]).filter(v => v !== undefined);

      if (values.length < 3) continue;

      const trend = this.calculateTrend(values);
      trends.push({
        metric: metricName,
        agentId,
        trend: trend.direction,
        changeRate: trend.changeRate,
        confidence: trend.confidence,
        forecastValue: trend.forecast
      });
    }

    return trends;
  }

  private calculateTrend(values: number[]): {
    direction: 'improving' | 'degrading' | 'stable';
    changeRate: number;
    confidence: number;
    forecast: number;
  } {
    if (values.length < 2) {
      return { direction: 'stable', changeRate: 0, confidence: 0, forecast: values[0] || 0 };
    }

    // Simple linear regression
    const n = values.length;
    const x = Array.from({ length: n }, (_, i) => i);
    const y = values;

    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
    const sumXX = x.reduce((sum, xi) => sum + xi * xi, 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    // Calculate R-squared for confidence
    const yMean = sumY / n;
    const ssRes = y.reduce((sum, yi, i) => sum + Math.pow(yi - (slope * x[i] + intercept), 2), 0);
    const ssTot = y.reduce((sum, yi) => sum + Math.pow(yi - yMean, 2), 0);
    const rSquared = 1 - (ssRes / ssTot);

    const changeRate = Math.abs(slope);
    const direction = Math.abs(slope) < 0.1 ? 'stable' : slope > 0 ? 'improving' : 'degrading';
    const forecast = slope * n + intercept;

    return {
      direction,
      changeRate,
      confidence: Math.max(0, Math.min(1, rSquared)),
      forecast
    };
  }

  private setupEventHandlers(): void {
    // Handle recommendation events
    this.on('recommendation:created', (data) => {
      logger.info({
        recommendationId: data.recommendation.id,
        type: data.recommendation.type,
        priority: data.recommendation.priority,
        affectedAgents: data.recommendation.impact.affectedAgents.length
      }, 'Optimization recommendation created');
    });

    this.on('trend:degradation', (data) => {
      logger.warn({
        agentId: data.agentId,
        metric: data.trend.metric,
        changeRate: data.trend.changeRate,
        confidence: data.trend.confidence
      }, 'Performance degradation trend detected');
    });
  }
}