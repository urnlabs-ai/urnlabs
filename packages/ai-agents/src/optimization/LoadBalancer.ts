import { EventEmitter } from 'events';
import { z } from 'zod';
import { logger } from '../core/Logger.js';

// Load balancing schemas and types
export const LoadBalancingAlgorithmSchema = z.enum([
  'round_robin',           // Simple round-robin distribution
  'weighted_round_robin',  // Round-robin with agent weights
  'least_connections',     // Route to agent with fewest active tasks
  'least_response_time',   // Route to agent with fastest response time
  'resource_aware',        // Consider resource utilization
  'performance_weighted',  // Weight by agent performance scores
  'adaptive_weighted',     // Dynamically adjust weights
  'consistent_hash',       // Hash-based routing for sticky sessions
  'priority_queue'         // Priority-based routing
]);

export const LoadBalancerConfigSchema = z.object({
  algorithm: LoadBalancingAlgorithmSchema.default('adaptive_weighted'),
  rebalanceEnabled: z.boolean().default(true),
  rebalanceInterval: z.number().min(10000).default(60000), // 1 minute
  rebalanceThreshold: z.number().min(0).max(100).default(25), // 25% load difference
  healthCheckWeight: z.number().min(0).max(100).default(20),
  responseTimeWeight: z.number().min(0).max(100).default(30),
  resourceUtilizationWeight: z.number().min(0).max(100).default(25),
  performanceWeight: z.number().min(0).max(100).default(25),
  stickySessions: z.boolean().default(false),
  sessionTimeoutMs: z.number().min(60000).default(1800000), // 30 minutes
  circuitBreaker: z.object({
    enabled: z.boolean().default(true),
    failureThreshold: z.number().min(1).default(5),
    recoveryTimeMs: z.number().min(30000).default(60000), // 1 minute
    halfOpenMaxCalls: z.number().min(1).default(3)
  }),
  rateLimiting: z.object({
    enabled: z.boolean().default(true),
    maxRequestsPerMinute: z.number().min(1).default(1000),
    burstSize: z.number().min(1).default(100)
  })
});

export const AgentLoadStateSchema = z.object({
  agentId: z.string(),
  currentLoad: z.number().min(0).max(100),
  activeConnections: z.number().min(0),
  averageResponseTime: z.number().min(0),
  requestsPerMinute: z.number().min(0),
  successRate: z.number().min(0).max(100),
  resourceUtilization: z.object({
    cpu: z.number().min(0).max(100),
    memory: z.number().min(0).max(100),
    disk: z.number().min(0).max(100)
  }),
  weight: z.number().min(0).default(1),
  isHealthy: z.boolean().default(true),
  lastUpdate: z.date(),
  circuitState: z.enum(['closed', 'open', 'half_open']).default('closed'),
  failureCount: z.number().min(0).default(0),
  lastFailure: z.date().optional()
});

export const RoutingDecisionSchema = z.object({
  taskId: z.string(),
  selectedAgent: z.string(),
  algorithm: LoadBalancingAlgorithmSchema,
  score: z.number().min(0),
  timestamp: z.date(),
  metadata: z.record(z.any()).optional(),
  alternativeAgents: z.array(z.string()).default([]),
  decisionTime: z.number().min(0), // Time taken to make decision in ms
  reason: z.string().optional()
});

export const RebalanceResultSchema = z.object({
  timestamp: z.date(),
  reason: z.string(),
  affectedAgents: z.array(z.string()),
  tasksRelocated: z.number().min(0),
  loadImprovement: z.number(),
  success: z.boolean(),
  metrics: z.object({
    beforeRebalance: z.record(z.number()),
    afterRebalance: z.record(z.number())
  }).optional()
});

// Type exports
export type LoadBalancingAlgorithm = z.infer<typeof LoadBalancingAlgorithmSchema>;
export type LoadBalancerConfig = z.infer<typeof LoadBalancerConfigSchema>;
export type AgentLoadState = z.infer<typeof AgentLoadStateSchema>;
export type RoutingDecision = z.infer<typeof RoutingDecisionSchema>;
export type RebalanceResult = z.infer<typeof RebalanceResultSchema>;

// Routing constraint interface
export interface RoutingConstraint {
  requiresStickiness?: boolean;
  sessionId?: string;
  preferredAgents?: string[];
  excludedAgents?: string[];
  maxLatency?: number;
  minPerformanceScore?: number;
  taskPriority?: 'low' | 'medium' | 'high' | 'critical';
  resourceRequirements?: {
    minMemoryMB?: number;
    minCpuCores?: number;
    minDiskGB?: number;
  };
}

// Session interface for sticky sessions
interface Session {
  sessionId: string;
  agentId: string;
  createdAt: Date;
  lastAccessed: Date;
  taskCount: number;
}

/**
 * Load Balancer
 *
 * Intelligent workload distribution system that routes tasks to agents
 * based on configurable algorithms, real-time performance metrics,
 * and resource utilization. Supports sticky sessions, circuit breakers,
 * and automatic rebalancing.
 */
export class LoadBalancer extends EventEmitter {
  private readonly config: LoadBalancerConfig;

  private agentStates: Map<string, AgentLoadState> = new Map();
  private routingHistory: RoutingDecision[] = [];
  private rebalanceHistory: RebalanceResult[] = [];
  private sessions: Map<string, Session> = new Map();

  private roundRobinIndex = 0;
  private rebalanceTimer?: NodeJS.Timeout;
  private sessionCleanupTimer?: NodeJS.Timeout;
  private metricsUpdateTimer?: NodeJS.Timeout;

  private isRunning = false;

  constructor(config: Partial<LoadBalancerConfig> = {}) {
    super();

    this.config = LoadBalancerConfigSchema.parse(config);
    this.setupEventHandlers();
  }

  /**
   * Initialize the load balancer
   */
  async initialize(): Promise<void> {
    try {
      logger.info('Initializing Load Balancer...');

      // Start monitoring and rebalancing
      this.startRebalancing();
      this.startSessionCleanup();
      this.startMetricsUpdating();

      this.isRunning = true;

      logger.info({
        config: {
          algorithm: this.config.algorithm,
          rebalanceEnabled: this.config.rebalanceEnabled,
          stickySessions: this.config.stickySessions,
          circuitBreaker: this.config.circuitBreaker.enabled
        }
      }, 'Load Balancer initialized successfully');

      this.emit('balancer:initialized', {
        timestamp: new Date(),
        config: this.config
      });

    } catch (error) {
      logger.error({ error }, 'Failed to initialize Load Balancer');
      throw error;
    }
  }

  /**
   * Register an agent with the load balancer
   */
  async registerAgent(agentId: string, initialState?: Partial<AgentLoadState>): Promise<void> {
    const agentState: AgentLoadState = {
      agentId,
      currentLoad: 0,
      activeConnections: 0,
      averageResponseTime: 100,
      requestsPerMinute: 0,
      successRate: 100,
      resourceUtilization: { cpu: 0, memory: 0, disk: 0 },
      weight: 1,
      isHealthy: true,
      lastUpdate: new Date(),
      circuitState: 'closed',
      failureCount: 0,
      ...initialState
    };

    this.agentStates.set(agentId, agentState);

    logger.info({
      agentId,
      agentState: {
        weight: agentState.weight,
        isHealthy: agentState.isHealthy
      }
    }, 'Agent registered with load balancer');

    this.emit('agent:registered', {
      agentId,
      agentState,
      totalAgents: this.agentStates.size
    });
  }

  /**
   * Unregister an agent from the load balancer
   */
  async unregisterAgent(agentId: string): Promise<void> {
    const removed = this.agentStates.delete(agentId);

    if (removed) {
      // Clean up sessions for this agent
      const sessionsToRemove = Array.from(this.sessions.entries())
        .filter(([, session]) => session.agentId === agentId)
        .map(([sessionId]) => sessionId);

      for (const sessionId of sessionsToRemove) {
        this.sessions.delete(sessionId);
      }

      logger.info({
        agentId,
        sessionsRemoved: sessionsToRemove.length,
        remainingAgents: this.agentStates.size
      }, 'Agent unregistered from load balancer');

      this.emit('agent:unregistered', {
        agentId,
        sessionsRemoved: sessionsToRemove.length,
        totalAgents: this.agentStates.size
      });
    }
  }

  /**
   * Update agent state with new metrics
   */
  async updateAgentState(agentId: string, updates: Partial<AgentLoadState>): Promise<void> {
    const currentState = this.agentStates.get(agentId);

    if (!currentState) {
      logger.warn({ agentId }, 'Attempted to update non-existent agent state');
      return;
    }

    const updatedState: AgentLoadState = {
      ...currentState,
      ...updates,
      lastUpdate: new Date()
    };

    // Update circuit breaker state based on health
    if (updates.isHealthy === false || (updates.successRate !== undefined && updates.successRate < 50)) {
      updatedState.failureCount = currentState.failureCount + 1;
      updatedState.lastFailure = new Date();

      if (updatedState.failureCount >= this.config.circuitBreaker.failureThreshold) {
        updatedState.circuitState = 'open';

        // Schedule recovery attempt
        setTimeout(() => {
          const state = this.agentStates.get(agentId);
          if (state && state.circuitState === 'open') {
            state.circuitState = 'half_open';
            this.agentStates.set(agentId, state);
            this.emit('circuit:half_open', { agentId });
          }
        }, this.config.circuitBreaker.recoveryTimeMs);

        this.emit('circuit:open', { agentId, failureCount: updatedState.failureCount });
      }
    } else if (updates.isHealthy === true && updates.successRate && updates.successRate > 80) {
      // Reset circuit breaker on recovery
      if (currentState.circuitState !== 'closed') {
        updatedState.circuitState = 'closed';
        updatedState.failureCount = 0;
        this.emit('circuit:closed', { agentId });
      }
    }

    this.agentStates.set(agentId, updatedState);

    this.emit('agent:state_updated', {
      agentId,
      oldState: currentState,
      newState: updatedState
    });
  }

  /**
   * Route a task to the best available agent
   */
  async routeTask(taskId: string, constraints?: RoutingConstraint): Promise<RoutingDecision | null> {
    const startTime = Date.now();

    try {
      // Check for sticky session
      if (this.config.stickySessions && constraints?.sessionId) {
        const sessionAgent = this.getSessionAgent(constraints.sessionId);
        if (sessionAgent && this.isAgentEligible(sessionAgent, constraints)) {
          const decision = this.createRoutingDecision(
            taskId,
            sessionAgent,
            'consistent_hash',
            100,
            startTime,
            'sticky_session'
          );

          this.recordRoutingDecision(decision);
          this.updateSessionActivity(constraints.sessionId);

          return decision;
        }
      }

      // Get eligible agents
      const eligibleAgents = this.getEligibleAgents(constraints);

      if (eligibleAgents.length === 0) {
        logger.warn({
          taskId,
          constraints,
          totalAgents: this.agentStates.size
        }, 'No eligible agents available for routing');

        this.emit('routing:no_agents', {
          taskId,
          constraints,
          timestamp: new Date()
        });

        return null;
      }

      // Apply load balancing algorithm
      const selectedAgent = this.applyLoadBalancingAlgorithm(eligibleAgents, constraints);

      if (!selectedAgent) {
        logger.warn({
          taskId,
          algorithm: this.config.algorithm,
          eligibleAgents: eligibleAgents.length
        }, 'Load balancing algorithm failed to select agent');

        return null;
      }

      // Calculate selection score
      const score = this.calculateAgentScore(selectedAgent, constraints);

      // Create routing decision
      const decision = this.createRoutingDecision(
        taskId,
        selectedAgent.agentId,
        this.config.algorithm,
        score,
        startTime,
        `selected_by_${this.config.algorithm}`
      );

      // Add alternative agents
      decision.alternativeAgents = eligibleAgents
        .filter(agent => agent.agentId !== selectedAgent.agentId)
        .sort((a, b) => this.calculateAgentScore(b, constraints) - this.calculateAgentScore(a, constraints))
        .slice(0, 3)
        .map(agent => agent.agentId);

      this.recordRoutingDecision(decision);

      // Create session if needed
      if (this.config.stickySessions && constraints?.sessionId) {
        this.createSession(constraints.sessionId, selectedAgent.agentId);
      }

      logger.debug({
        taskId,
        selectedAgent: selectedAgent.agentId,
        algorithm: this.config.algorithm,
        score,
        decisionTime: decision.decisionTime
      }, 'Task routed successfully');

      this.emit('routing:success', {
        decision,
        eligibleAgents: eligibleAgents.length
      });

      return decision;

    } catch (error) {
      logger.error({
        error,
        taskId,
        algorithm: this.config.algorithm
      }, 'Failed to route task');

      this.emit('routing:error', {
        taskId,
        error,
        timestamp: new Date()
      });

      return null;
    }
  }

  /**
   * Record allocation for load tracking
   */
  async recordAllocation(agentId: string, taskId: string): Promise<void> {
    const agentState = this.agentStates.get(agentId);

    if (agentState) {
      agentState.activeConnections++;
      agentState.lastUpdate = new Date();
      this.agentStates.set(agentId, agentState);

      this.emit('allocation:recorded', {
        agentId,
        taskId,
        activeConnections: agentState.activeConnections
      });
    }
  }

  /**
   * Record deallocation for load tracking
   */
  async recordDeallocation(agentId: string, taskId: string): Promise<void> {
    const agentState = this.agentStates.get(agentId);

    if (agentState) {
      agentState.activeConnections = Math.max(0, agentState.activeConnections - 1);
      agentState.lastUpdate = new Date();
      this.agentStates.set(agentId, agentState);

      this.emit('deallocation:recorded', {
        agentId,
        taskId,
        activeConnections: agentState.activeConnections
      });
    }
  }

  /**
   * Perform load rebalancing
   */
  async rebalance(): Promise<RebalanceResult> {
    try {
      const beforeMetrics = this.getLoadMetrics();

      logger.info({
        algorithm: this.config.algorithm,
        beforeMetrics
      }, 'Starting load rebalancing');

      const result = await this.performRebalancing();

      const afterMetrics = this.getLoadMetrics();
      result.metrics = {
        beforeRebalance: beforeMetrics,
        afterRebalance: afterMetrics
      };

      this.rebalanceHistory.push(result);

      // Keep only last 100 rebalance results
      if (this.rebalanceHistory.length > 100) {
        this.rebalanceHistory = this.rebalanceHistory.slice(-100);
      }

      this.emit('rebalance:completed', result);

      logger.info({
        result: {
          success: result.success,
          tasksRelocated: result.tasksRelocated,
          loadImprovement: result.loadImprovement
        }
      }, 'Load rebalancing completed');

      return result;

    } catch (error) {
      logger.error({ error }, 'Failed to perform load rebalancing');

      const result: RebalanceResult = {
        timestamp: new Date(),
        reason: 'rebalancing_error',
        affectedAgents: [],
        tasksRelocated: 0,
        loadImprovement: 0,
        success: false
      };

      this.emit('rebalance:failed', { result, error });
      return result;
    }
  }

  /**
   * Get current load balancer statistics
   */
  getStatistics(): {
    totalAgents: number;
    healthyAgents: number;
    averageLoad: number;
    totalConnections: number;
    algorithmUsage: Record<string, number>;
    circuitBreakerStatus: Record<string, string>;
    rebalanceHistory: RebalanceResult[];
  } {
    const agents = Array.from(this.agentStates.values());

    const totalAgents = agents.length;
    const healthyAgents = agents.filter(agent => agent.isHealthy && agent.circuitState === 'closed').length;
    const averageLoad = totalAgents > 0 ? agents.reduce((sum, agent) => sum + agent.currentLoad, 0) / totalAgents : 0;
    const totalConnections = agents.reduce((sum, agent) => sum + agent.activeConnections, 0);

    // Calculate algorithm usage from recent routing decisions
    const recentDecisions = this.routingHistory.slice(-1000);
    const algorithmUsage: Record<string, number> = {};
    for (const decision of recentDecisions) {
      algorithmUsage[decision.algorithm] = (algorithmUsage[decision.algorithm] || 0) + 1;
    }

    // Get circuit breaker status
    const circuitBreakerStatus: Record<string, string> = {};
    for (const [agentId, state] of this.agentStates) {
      circuitBreakerStatus[agentId] = state.circuitState;
    }

    return {
      totalAgents,
      healthyAgents,
      averageLoad,
      totalConnections,
      algorithmUsage,
      circuitBreakerStatus,
      rebalanceHistory: this.rebalanceHistory.slice(-10) // Last 10 rebalances
    };
  }

  /**
   * Get routing history for analysis
   */
  getRoutingHistory(limit = 100): RoutingDecision[] {
    return this.routingHistory
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
  }

  /**
   * Update load balancing algorithm
   */
  updateAlgorithm(algorithm: LoadBalancingAlgorithm): void {
    const oldAlgorithm = this.config.algorithm;
    this.config.algorithm = algorithm;

    logger.info({
      oldAlgorithm,
      newAlgorithm: algorithm
    }, 'Load balancing algorithm updated');

    this.emit('algorithm:updated', {
      oldAlgorithm,
      newAlgorithm: algorithm,
      timestamp: new Date()
    });
  }

  /**
   * Shutdown the load balancer
   */
  async shutdown(): Promise<void> {
    try {
      logger.info('Shutting down Load Balancer...');

      this.isRunning = false;

      // Clear timers
      if (this.rebalanceTimer) {
        clearInterval(this.rebalanceTimer);
      }
      if (this.sessionCleanupTimer) {
        clearInterval(this.sessionCleanupTimer);
      }
      if (this.metricsUpdateTimer) {
        clearInterval(this.metricsUpdateTimer);
      }

      // Clear state
      this.agentStates.clear();
      this.sessions.clear();

      this.emit('balancer:shutdown', { timestamp: new Date() });

      logger.info('Load Balancer shutdown complete');

    } catch (error) {
      logger.error({ error }, 'Error during Load Balancer shutdown');
      throw error;
    }
  }

  // Private helper methods

  private getEligibleAgents(constraints?: RoutingConstraint): AgentLoadState[] {
    const agents = Array.from(this.agentStates.values());

    return agents.filter(agent => {
      // Basic health and circuit breaker checks
      if (!agent.isHealthy || agent.circuitState === 'open') {
        return false;
      }

      // Half-open circuit breaker with limited calls
      if (agent.circuitState === 'half_open') {
        // Allow limited number of calls for testing
        return agent.activeConnections < this.config.circuitBreaker.halfOpenMaxCalls;
      }

      // Check constraints
      if (constraints) {
        // Excluded agents
        if (constraints.excludedAgents?.includes(agent.agentId)) {
          return false;
        }

        // Performance requirements
        if (constraints.minPerformanceScore && agent.successRate < constraints.minPerformanceScore) {
          return false;
        }

        // Latency requirements
        if (constraints.maxLatency && agent.averageResponseTime > constraints.maxLatency) {
          return false;
        }

        // Resource requirements
        if (constraints.resourceRequirements) {
          const { cpu, memory, disk } = agent.resourceUtilization;
          const { minCpuCores, minMemoryMB, minDiskGB } = constraints.resourceRequirements;

          if (minCpuCores && cpu > 90) return false;
          if (minMemoryMB && memory > 90) return false;
          if (minDiskGB && disk > 90) return false;
        }
      }

      return true;
    });
  }

  private isAgentEligible(agentId: string, constraints?: RoutingConstraint): boolean {
    const agent = this.agentStates.get(agentId);
    if (!agent) return false;

    return this.getEligibleAgents(constraints).some(eligible => eligible.agentId === agentId);
  }

  private applyLoadBalancingAlgorithm(
    eligibleAgents: AgentLoadState[],
    constraints?: RoutingConstraint
  ): AgentLoadState | null {
    if (eligibleAgents.length === 0) return null;

    switch (this.config.algorithm) {
      case 'round_robin':
        return this.roundRobinSelection(eligibleAgents);

      case 'weighted_round_robin':
        return this.weightedRoundRobinSelection(eligibleAgents);

      case 'least_connections':
        return this.leastConnectionsSelection(eligibleAgents);

      case 'least_response_time':
        return this.leastResponseTimeSelection(eligibleAgents);

      case 'resource_aware':
        return this.resourceAwareSelection(eligibleAgents);

      case 'performance_weighted':
        return this.performanceWeightedSelection(eligibleAgents);

      case 'adaptive_weighted':
        return this.adaptiveWeightedSelection(eligibleAgents, constraints);

      case 'consistent_hash':
        return this.consistentHashSelection(eligibleAgents, constraints);

      case 'priority_queue':
        return this.priorityQueueSelection(eligibleAgents, constraints);

      default:
        return eligibleAgents[0];
    }
  }

  private roundRobinSelection(agents: AgentLoadState[]): AgentLoadState {
    const selected = agents[this.roundRobinIndex % agents.length];
    this.roundRobinIndex = (this.roundRobinIndex + 1) % agents.length;
    return selected;
  }

  private weightedRoundRobinSelection(agents: AgentLoadState[]): AgentLoadState {
    const totalWeight = agents.reduce((sum, agent) => sum + agent.weight, 0);
    let randomWeight = Math.random() * totalWeight;

    for (const agent of agents) {
      randomWeight -= agent.weight;
      if (randomWeight <= 0) {
        return agent;
      }
    }

    return agents[0];
  }

  private leastConnectionsSelection(agents: AgentLoadState[]): AgentLoadState {
    return agents.reduce((min, agent) =>
      agent.activeConnections < min.activeConnections ? agent : min
    );
  }

  private leastResponseTimeSelection(agents: AgentLoadState[]): AgentLoadState {
    return agents.reduce((min, agent) =>
      agent.averageResponseTime < min.averageResponseTime ? agent : min
    );
  }

  private resourceAwareSelection(agents: AgentLoadState[]): AgentLoadState {
    return agents.reduce((best, agent) => {
      const agentResourceScore = this.calculateResourceScore(agent);
      const bestResourceScore = this.calculateResourceScore(best);
      return agentResourceScore > bestResourceScore ? agent : best;
    });
  }

  private performanceWeightedSelection(agents: AgentLoadState[]): AgentLoadState {
    return agents.reduce((best, agent) => {
      const agentScore = this.calculatePerformanceScore(agent);
      const bestScore = this.calculatePerformanceScore(best);
      return agentScore > bestScore ? agent : best;
    });
  }

  private adaptiveWeightedSelection(agents: AgentLoadState[], constraints?: RoutingConstraint): AgentLoadState {
    const scoredAgents = agents.map(agent => ({
      agent,
      score: this.calculateAdaptiveScore(agent, constraints)
    }));

    return scoredAgents.reduce((best, current) =>
      current.score > best.score ? current : best
    ).agent;
  }

  private consistentHashSelection(agents: AgentLoadState[], constraints?: RoutingConstraint): AgentLoadState {
    const key = constraints?.sessionId || 'default';
    const hash = this.simpleHash(key);
    const index = hash % agents.length;
    return agents[index];
  }

  private priorityQueueSelection(agents: AgentLoadState[], constraints?: RoutingConstraint): AgentLoadState {
    const priority = constraints?.taskPriority || 'medium';
    const priorityWeights = {
      critical: 4,
      high: 3,
      medium: 2,
      low: 1
    };

    const weight = priorityWeights[priority];

    // Prefer agents with lower load for higher priority tasks
    if (priority === 'critical' || priority === 'high') {
      return this.leastConnectionsSelection(agents);
    }

    return this.performanceWeightedSelection(agents);
  }

  private calculateResourceScore(agent: AgentLoadState): number {
    const { cpu, memory, disk } = agent.resourceUtilization;
    const averageUtilization = (cpu + memory + disk) / 3;
    return 100 - averageUtilization; // Higher score for lower utilization
  }

  private calculatePerformanceScore(agent: AgentLoadState): number {
    return (
      agent.successRate * 0.4 +
      (100 - agent.currentLoad) * 0.3 +
      (1000 / Math.max(agent.averageResponseTime, 1)) * 0.3
    );
  }

  private calculateAdaptiveScore(agent: AgentLoadState, constraints?: RoutingConstraint): number {
    let score = 0;

    // Health and circuit breaker
    score += agent.isHealthy ? this.config.healthCheckWeight : 0;
    score += agent.circuitState === 'closed' ? 10 : 0;

    // Response time (lower is better)
    const responseTimeScore = Math.max(0, 100 - (agent.averageResponseTime / 100));
    score += responseTimeScore * (this.config.responseTimeWeight / 100);

    // Resource utilization (lower is better)
    const resourceScore = this.calculateResourceScore(agent);
    score += resourceScore * (this.config.resourceUtilizationWeight / 100);

    // Performance
    const performanceScore = this.calculatePerformanceScore(agent);
    score += performanceScore * (this.config.performanceWeight / 100);

    // Preferred agents boost
    if (constraints?.preferredAgents?.includes(agent.agentId)) {
      score *= 1.2;
    }

    return score;
  }

  private calculateAgentScore(agent: AgentLoadState, constraints?: RoutingConstraint): number {
    return this.calculateAdaptiveScore(agent, constraints);
  }

  private createRoutingDecision(
    taskId: string,
    agentId: string,
    algorithm: LoadBalancingAlgorithm,
    score: number,
    startTime: number,
    reason?: string
  ): RoutingDecision {
    return {
      taskId,
      selectedAgent: agentId,
      algorithm,
      score,
      timestamp: new Date(),
      alternativeAgents: [],
      decisionTime: Date.now() - startTime,
      reason
    };
  }

  private recordRoutingDecision(decision: RoutingDecision): void {
    this.routingHistory.push(decision);

    // Keep only last 10000 decisions
    if (this.routingHistory.length > 10000) {
      this.routingHistory = this.routingHistory.slice(-10000);
    }
  }

  private getSessionAgent(sessionId: string): string | null {
    const session = this.sessions.get(sessionId);

    if (!session) return null;

    // Check if session is expired
    const now = new Date();
    if (now.getTime() - session.lastAccessed.getTime() > this.config.sessionTimeoutMs) {
      this.sessions.delete(sessionId);
      return null;
    }

    return session.agentId;
  }

  private createSession(sessionId: string, agentId: string): void {
    const session: Session = {
      sessionId,
      agentId,
      createdAt: new Date(),
      lastAccessed: new Date(),
      taskCount: 1
    };

    this.sessions.set(sessionId, session);

    this.emit('session:created', {
      sessionId,
      agentId,
      timestamp: new Date()
    });
  }

  private updateSessionActivity(sessionId: string): void {
    const session = this.sessions.get(sessionId);

    if (session) {
      session.lastAccessed = new Date();
      session.taskCount++;
      this.sessions.set(sessionId, session);
    }
  }

  private getLoadMetrics(): Record<string, number> {
    const agents = Array.from(this.agentStates.values());

    if (agents.length === 0) {
      return { averageLoad: 0, loadVariance: 0, maxLoad: 0, minLoad: 0 };
    }

    const loads = agents.map(agent => agent.currentLoad);
    const averageLoad = loads.reduce((sum, load) => sum + load, 0) / loads.length;
    const maxLoad = Math.max(...loads);
    const minLoad = Math.min(...loads);
    const loadVariance = loads.reduce((sum, load) => sum + Math.pow(load - averageLoad, 2), 0) / loads.length;

    return { averageLoad, loadVariance, maxLoad, minLoad };
  }

  private async performRebalancing(): Promise<RebalanceResult> {
    const startTime = new Date();
    const agents = Array.from(this.agentStates.values());

    if (agents.length < 2) {
      return {
        timestamp: startTime,
        reason: 'insufficient_agents',
        affectedAgents: [],
        tasksRelocated: 0,
        loadImprovement: 0,
        success: false
      };
    }

    // Calculate load distribution
    const loadMetrics = this.getLoadMetrics();
    const loadImbalance = loadMetrics.maxLoad - loadMetrics.minLoad;

    if (loadImbalance < this.config.rebalanceThreshold) {
      return {
        timestamp: startTime,
        reason: 'load_balanced',
        affectedAgents: [],
        tasksRelocated: 0,
        loadImprovement: 0,
        success: true
      };
    }

    // Identify overloaded and underloaded agents
    const overloadedAgents = agents
      .filter(agent => agent.currentLoad > loadMetrics.averageLoad + this.config.rebalanceThreshold)
      .sort((a, b) => b.currentLoad - a.currentLoad);

    const underloadedAgents = agents
      .filter(agent => agent.currentLoad < loadMetrics.averageLoad - this.config.rebalanceThreshold)
      .sort((a, b) => a.currentLoad - b.currentLoad);

    let tasksRelocated = 0;
    const affectedAgents: string[] = [];

    // For demonstration, we'll emit rebalancing events
    // In a full implementation, this would involve actual task migration
    for (const overloaded of overloadedAgents) {
      const targetLoad = loadMetrics.averageLoad;
      const excessLoad = overloaded.currentLoad - targetLoad;

      if (excessLoad > 5 && underloadedAgents.length > 0) {
        const target = underloadedAgents[0];
        const tasksToMove = Math.ceil(excessLoad / 10); // Approximate tasks to move

        this.emit('rebalance:task_migration', {
          fromAgent: overloaded.agentId,
          toAgent: target.agentId,
          estimatedTasks: tasksToMove,
          reason: 'load_rebalancing'
        });

        affectedAgents.push(overloaded.agentId, target.agentId);
        tasksRelocated += tasksToMove;

        // Update simulated loads
        overloaded.currentLoad -= excessLoad * 0.5;
        target.currentLoad += excessLoad * 0.3; // Some overhead

        // Move target to end of underloaded list if it's no longer underloaded
        if (target.currentLoad >= loadMetrics.averageLoad - this.config.rebalanceThreshold) {
          underloadedAgents.shift();
        }
      }
    }

    const newLoadMetrics = this.getLoadMetrics();
    const loadImprovement = loadMetrics.loadVariance - newLoadMetrics.loadVariance;

    return {
      timestamp: startTime,
      reason: 'load_imbalance_detected',
      affectedAgents: [...new Set(affectedAgents)],
      tasksRelocated,
      loadImprovement,
      success: tasksRelocated > 0
    };
  }

  private simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }

  private startRebalancing(): void {
    if (!this.config.rebalanceEnabled) return;

    this.rebalanceTimer = setInterval(async () => {
      try {
        await this.rebalance();
      } catch (error) {
        logger.error({ error }, 'Error during automatic rebalancing');
      }
    }, this.config.rebalanceInterval);
  }

  private startSessionCleanup(): void {
    if (!this.config.stickySessions) return;

    this.sessionCleanupTimer = setInterval(() => {
      const now = new Date();
      const expiredSessions: string[] = [];

      for (const [sessionId, session] of this.sessions) {
        if (now.getTime() - session.lastAccessed.getTime() > this.config.sessionTimeoutMs) {
          expiredSessions.push(sessionId);
        }
      }

      for (const sessionId of expiredSessions) {
        this.sessions.delete(sessionId);
      }

      if (expiredSessions.length > 0) {
        this.emit('sessions:cleaned', {
          expiredSessions,
          remainingSessions: this.sessions.size,
          timestamp: now
        });
      }
    }, this.config.sessionTimeoutMs / 2); // Check every half timeout period
  }

  private startMetricsUpdating(): void {
    this.metricsUpdateTimer = setInterval(() => {
      // Update request rates and other time-based metrics
      const now = new Date();

      for (const [agentId, state] of this.agentStates) {
        // Decay request rate over time
        const timeSinceUpdate = now.getTime() - state.lastUpdate.getTime();
        const decayFactor = Math.exp(-timeSinceUpdate / 60000); // 1-minute decay

        state.requestsPerMinute *= decayFactor;
        this.agentStates.set(agentId, state);
      }
    }, 30000); // Update every 30 seconds
  }

  private setupEventHandlers(): void {
    // Handle circuit breaker events
    this.on('circuit:open', (data) => {
      logger.warn({
        agentId: data.agentId,
        failureCount: data.failureCount
      }, 'Circuit breaker opened for agent');
    });

    this.on('circuit:half_open', (data) => {
      logger.info({
        agentId: data.agentId
      }, 'Circuit breaker half-opened for agent');
    });

    this.on('circuit:closed', (data) => {
      logger.info({
        agentId: data.agentId
      }, 'Circuit breaker closed for agent');
    });
  }
}