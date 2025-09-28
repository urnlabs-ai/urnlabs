import { EventEmitter } from 'events';
import { z } from 'zod';
import { logger } from '../core/Logger.js';
import type { AgentConfig, AgentMetrics, BaseAgent, AgentRegistry } from '../types/AgentTypes.js';
import type { ResourceRequirement } from './ResourceAllocationEngine.js';

// Agent pool schemas and types
export const AgentPoolConfigSchema = z.object({
  minPoolSize: z.number().min(1).default(2),
  maxPoolSize: z.number().min(1).default(10),
  scalingPolicy: z.enum(['reactive', 'predictive', 'aggressive', 'conservative']).default('reactive'),
  scaleUpThreshold: z.number().min(0).max(100).default(80),
  scaleDownThreshold: z.number().min(0).max(100).default(30),
  scaleUpCooldown: z.number().min(1000).default(300000), // 5 minutes
  scaleDownCooldown: z.number().min(1000).default(600000), // 10 minutes
  healthCheckInterval: z.number().min(1000).default(30000), // 30 seconds
  autoRemoveFailedAgents: z.boolean().default(true),
  maxFailureThreshold: z.number().min(1).default(3),
  resourceOptimization: z.object({
    enabled: z.boolean().default(true),
    targetUtilization: z.number().min(0).max(100).default(70),
    consolidationEnabled: z.boolean().default(true)
  })
});

export const AgentPoolStateSchema = z.object({
  agentId: z.string(),
  status: z.enum(['active', 'idle', 'busy', 'failed', 'scaling_up', 'scaling_down']),
  currentLoad: z.number().min(0).max(100),
  activeTaskCount: z.number().min(0),
  totalResourcesAllocated: z.object({
    memoryMB: z.number().min(0),
    cpuCores: z.number().min(0),
    diskGB: z.number().min(0)
  }),
  resourceCapacity: z.object({
    maxMemoryMB: z.number().min(0),
    maxCpuCores: z.number().min(0),
    maxDiskGB: z.number().min(0)
  }),
  healthScore: z.number().min(0).max(100),
  lastHealthCheck: z.date(),
  failureCount: z.number().min(0),
  lastFailure: z.date().optional(),
  createdAt: z.date(),
  lastActivity: z.date()
});

export const ScalingEventSchema = z.object({
  type: z.enum(['scale_up', 'scale_down', 'agent_added', 'agent_removed', 'health_check_failed']),
  timestamp: z.date(),
  agentId: z.string().optional(),
  reason: z.string(),
  poolSize: z.number(),
  targetPoolSize: z.number().optional(),
  metadata: z.record(z.any()).optional()
});

// Type exports
export type AgentPoolConfig = z.infer<typeof AgentPoolConfigSchema>;
export type AgentPoolState = z.infer<typeof AgentPoolStateSchema>;
export type ScalingEvent = z.infer<typeof ScalingEventSchema>;

// Agent template for creating new instances
export interface AgentTemplate {
  role: string;
  capabilities: string[];
  resourceLimits: {
    maxMemoryMB: number;
    maxCpuCores: number;
    maxDiskGB: number;
  };
  configuration?: Record<string, any>;
}

// Pool statistics interface
export interface PoolStatistics {
  totalAgents: number;
  activeAgents: number;
  idleAgents: number;
  busyAgents: number;
  failedAgents: number;
  averageLoad: number;
  totalResourceUtilization: {
    memory: number;
    cpu: number;
    disk: number;
  };
  healthScore: number;
  uptime: number;
}

/**
 * Agent Pool Manager
 *
 * Manages a dynamic pool of agents with automatic scaling, health monitoring,
 * and resource optimization. Handles agent lifecycle, failure recovery,
 * and performance-based scaling decisions.
 */
export class AgentPoolManager extends EventEmitter {
  private readonly config: AgentPoolConfig;
  private readonly agentRegistry: AgentRegistry;
  private readonly agentTemplates: Map<string, AgentTemplate> = new Map();

  private agents: Map<string, AgentPoolState> = new Map();
  private allocations: Map<string, string[]> = new Map(); // agentId -> taskIds
  private scalingHistory: ScalingEvent[] = [];

  private lastScaleUp: Date = new Date(0);
  private lastScaleDown: Date = new Date(0);
  private healthCheckTimer?: NodeJS.Timeout;
  private scalingTimer?: NodeJS.Timeout;

  private isRunning = false;
  private poolStartTime: Date = new Date();

  constructor(
    config: Partial<AgentPoolConfig> = {},
    agentRegistry: AgentRegistry
  ) {
    super();

    this.config = AgentPoolConfigSchema.parse(config);
    this.agentRegistry = agentRegistry;

    this.setupEventHandlers();
  }

  /**
   * Initialize the agent pool manager
   */
  async initialize(): Promise<void> {
    try {
      logger.info('Initializing Agent Pool Manager...');

      // Load existing agents from registry
      await this.loadExistingAgents();

      // Ensure minimum pool size
      await this.ensureMinimumPoolSize();

      // Start monitoring and scaling
      this.startHealthChecking();
      this.startScalingMonitoring();

      this.isRunning = true;
      this.poolStartTime = new Date();

      logger.info({
        config: this.config,
        agentCount: this.agents.size,
        minPoolSize: this.config.minPoolSize,
        maxPoolSize: this.config.maxPoolSize
      }, 'Agent Pool Manager initialized successfully');

      this.emit('pool:initialized', {
        timestamp: new Date(),
        agentCount: this.agents.size,
        config: this.config
      });

    } catch (error) {
      logger.error({ error }, 'Failed to initialize Agent Pool Manager');
      throw error;
    }
  }

  /**
   * Register an agent template for creating new instances
   */
  registerAgentTemplate(role: string, template: AgentTemplate): void {
    this.agentTemplates.set(role, template);

    logger.info({
      role,
      template: {
        capabilities: template.capabilities,
        resourceLimits: template.resourceLimits
      }
    }, 'Agent template registered');

    this.emit('template:registered', { role, template });
  }

  /**
   * Add a new agent to the pool
   */
  async addAgent(agent: BaseAgent): Promise<void> {
    try {
      // Initialize the agent
      await agent.initialize();

      // Register with agent registry
      await this.agentRegistry.register(agent);

      // Create pool state
      const template = this.agentTemplates.get(agent.config.role);
      const poolState: AgentPoolState = {
        agentId: agent.id,
        status: 'idle',
        currentLoad: 0,
        activeTaskCount: 0,
        totalResourcesAllocated: {
          memoryMB: 0,
          cpuCores: 0,
          diskGB: 0
        },
        resourceCapacity: template?.resourceLimits || {
          maxMemoryMB: 1024,
          maxCpuCores: 2,
          maxDiskGB: 10
        },
        healthScore: 100,
        lastHealthCheck: new Date(),
        failureCount: 0,
        createdAt: new Date(),
        lastActivity: new Date()
      };

      this.agents.set(agent.id, poolState);
      this.allocations.set(agent.id, []);

      logger.info({
        agentId: agent.id,
        role: agent.config.role,
        poolSize: this.agents.size
      }, 'Agent added to pool');

      this.emit('agent:added', {
        agentId: agent.id,
        poolState,
        poolSize: this.agents.size
      });

      // Record scaling event
      this.recordScalingEvent({
        type: 'agent_added',
        timestamp: new Date(),
        agentId: agent.id,
        reason: 'manual_addition',
        poolSize: this.agents.size
      });

    } catch (error) {
      logger.error({
        error,
        agentId: agent.id
      }, 'Failed to add agent to pool');
      throw error;
    }
  }

  /**
   * Remove an agent from the pool
   */
  async removeAgent(agentId: string, reason = 'manual_removal'): Promise<void> {
    try {
      const poolState = this.agents.get(agentId);
      if (!poolState) {
        logger.warn({ agentId }, 'Attempted to remove non-existent agent');
        return;
      }

      // Get active allocations
      const activeAllocations = this.allocations.get(agentId) || [];

      if (activeAllocations.length > 0 && reason !== 'force_removal') {
        logger.warn({
          agentId,
          activeAllocations: activeAllocations.length
        }, 'Cannot remove agent with active allocations');
        throw new Error('Agent has active allocations');
      }

      // Clean up active allocations if forced
      if (activeAllocations.length > 0) {
        logger.warn({
          agentId,
          activeAllocations: activeAllocations.length
        }, 'Force removing agent with active allocations');

        for (const taskId of activeAllocations) {
          this.emit('allocation:orphaned', { agentId, taskId });
        }
      }

      // Update status
      poolState.status = 'scaling_down';
      this.agents.set(agentId, poolState);

      // Unregister from agent registry
      await this.agentRegistry.unregister(agentId);

      // Remove from pool
      this.agents.delete(agentId);
      this.allocations.delete(agentId);

      logger.info({
        agentId,
        reason,
        poolSize: this.agents.size
      }, 'Agent removed from pool');

      this.emit('agent:removed', {
        agentId,
        reason,
        poolSize: this.agents.size,
        orphanedTasks: activeAllocations
      });

      // Record scaling event
      this.recordScalingEvent({
        type: 'agent_removed',
        timestamp: new Date(),
        agentId,
        reason,
        poolSize: this.agents.size
      });

    } catch (error) {
      logger.error({
        error,
        agentId,
        reason
      }, 'Failed to remove agent from pool');
      throw error;
    }
  }

  /**
   * Allocate an agent for a task
   */
  async allocateAgent(agentId: string, taskId: string, requirements: ResourceRequirement): Promise<boolean> {
    try {
      const poolState = this.agents.get(agentId);
      if (!poolState) {
        logger.warn({ agentId, taskId }, 'Attempted to allocate non-existent agent');
        return false;
      }

      if (poolState.status === 'failed') {
        logger.warn({ agentId, taskId }, 'Attempted to allocate failed agent');
        return false;
      }

      // Check resource capacity
      if (!this.canAllocateResources(agentId, requirements)) {
        logger.warn({
          agentId,
          taskId,
          requirements,
          currentAllocation: poolState.totalResourcesAllocated,
          capacity: poolState.resourceCapacity
        }, 'Insufficient resources for allocation');
        return false;
      }

      // Update pool state
      const allocations = this.allocations.get(agentId) || [];
      allocations.push(taskId);
      this.allocations.set(agentId, allocations);

      poolState.activeTaskCount = allocations.length;
      poolState.totalResourcesAllocated.memoryMB += requirements.memoryMB;
      poolState.totalResourcesAllocated.cpuCores += requirements.cpuCores || 0;
      poolState.totalResourcesAllocated.diskGB += requirements.diskGB || 0;

      // Update load and status
      poolState.currentLoad = this.calculateAgentLoad(poolState);
      poolState.status = poolState.currentLoad > 0 ? 'busy' : 'idle';
      poolState.lastActivity = new Date();

      this.agents.set(agentId, poolState);

      logger.debug({
        agentId,
        taskId,
        currentLoad: poolState.currentLoad,
        activeTaskCount: poolState.activeTaskCount
      }, 'Agent allocated for task');

      this.emit('allocation:created', {
        agentId,
        taskId,
        requirements,
        poolState
      });

      return true;

    } catch (error) {
      logger.error({
        error,
        agentId,
        taskId
      }, 'Failed to allocate agent');
      return false;
    }
  }

  /**
   * Deallocate an agent after task completion
   */
  async deallocateAgent(agentId: string, taskId: string): Promise<void> {
    try {
      const poolState = this.agents.get(agentId);
      if (!poolState) {
        logger.warn({ agentId, taskId }, 'Attempted to deallocate non-existent agent');
        return;
      }

      const allocations = this.allocations.get(agentId) || [];
      const taskIndex = allocations.indexOf(taskId);

      if (taskIndex === -1) {
        logger.warn({ agentId, taskId }, 'Attempted to deallocate non-allocated task');
        return;
      }

      // Remove task allocation
      allocations.splice(taskIndex, 1);
      this.allocations.set(agentId, allocations);

      // Update pool state (approximate resource deallocation)
      poolState.activeTaskCount = allocations.length;
      poolState.currentLoad = this.calculateAgentLoad(poolState);
      poolState.status = poolState.currentLoad > 0 ? 'busy' : 'idle';
      poolState.lastActivity = new Date();

      // Reset failed status if agent becomes idle
      if (poolState.status === 'idle' && poolState.status === 'failed') {
        poolState.status = 'idle';
        poolState.failureCount = 0;
      }

      this.agents.set(agentId, poolState);

      logger.debug({
        agentId,
        taskId,
        currentLoad: poolState.currentLoad,
        activeTaskCount: poolState.activeTaskCount
      }, 'Agent deallocated from task');

      this.emit('allocation:removed', {
        agentId,
        taskId,
        poolState
      });

    } catch (error) {
      logger.error({
        error,
        agentId,
        taskId
      }, 'Failed to deallocate agent');
    }
  }

  /**
   * Check if an agent can allocate additional resources
   */
  canAllocateResources(agentId: string, requirements: ResourceRequirement): boolean {
    const poolState = this.agents.get(agentId);
    if (!poolState) return false;

    const { totalResourcesAllocated, resourceCapacity } = poolState;

    // Check memory
    if (totalResourcesAllocated.memoryMB + requirements.memoryMB > resourceCapacity.maxMemoryMB) {
      return false;
    }

    // Check CPU
    if (requirements.cpuCores) {
      if (totalResourcesAllocated.cpuCores + requirements.cpuCores > resourceCapacity.maxCpuCores) {
        return false;
      }
    }

    // Check disk
    if (requirements.diskGB) {
      if (totalResourcesAllocated.diskGB + requirements.diskGB > resourceCapacity.maxDiskGB) {
        return false;
      }
    }

    return true;
  }

  /**
   * Get available agents that can handle new allocations
   */
  async getAvailableAgents(): Promise<BaseAgent[]> {
    const availableAgents: BaseAgent[] = [];

    for (const [agentId, poolState] of this.agents) {
      if (poolState.status === 'failed') continue;
      if (poolState.currentLoad >= 100) continue;

      try {
        const agent = await this.agentRegistry.getAgent(agentId);
        if (agent) {
          availableAgents.push(agent);
        }
      } catch (error) {
        logger.warn({ agentId, error }, 'Failed to get agent from registry');
      }
    }

    return availableAgents;
  }

  /**
   * Get all agents in the pool
   */
  async getAllAgents(): Promise<BaseAgent[]> {
    const allAgents: BaseAgent[] = [];

    for (const agentId of this.agents.keys()) {
      try {
        const agent = await this.agentRegistry.getAgent(agentId);
        if (agent) {
          allAgents.push(agent);
        }
      } catch (error) {
        logger.warn({ agentId, error }, 'Failed to get agent from registry');
      }
    }

    return allAgents;
  }

  /**
   * Get agent metrics from the registry
   */
  async getAgentMetrics(agentId: string): Promise<AgentMetrics | null> {
    try {
      return await this.agentRegistry.getAgentMetrics(agentId);
    } catch (error) {
      logger.warn({ agentId, error }, 'Failed to get agent metrics');
      return null;
    }
  }

  /**
   * Get pool statistics
   */
  getPoolStatistics(): PoolStatistics {
    const states = Array.from(this.agents.values());

    const totalAgents = states.length;
    const activeAgents = states.filter(s => s.status === 'active' || s.status === 'busy').length;
    const idleAgents = states.filter(s => s.status === 'idle').length;
    const busyAgents = states.filter(s => s.status === 'busy').length;
    const failedAgents = states.filter(s => s.status === 'failed').length;

    const totalLoad = states.reduce((sum, s) => sum + s.currentLoad, 0);
    const averageLoad = totalAgents > 0 ? totalLoad / totalAgents : 0;

    const totalMemoryUsed = states.reduce((sum, s) => sum + s.totalResourcesAllocated.memoryMB, 0);
    const totalMemoryCapacity = states.reduce((sum, s) => sum + s.resourceCapacity.maxMemoryMB, 0);
    const totalCpuUsed = states.reduce((sum, s) => sum + s.totalResourcesAllocated.cpuCores, 0);
    const totalCpuCapacity = states.reduce((sum, s) => sum + s.resourceCapacity.maxCpuCores, 0);
    const totalDiskUsed = states.reduce((sum, s) => sum + s.totalResourcesAllocated.diskGB, 0);
    const totalDiskCapacity = states.reduce((sum, s) => sum + s.resourceCapacity.maxDiskGB, 0);

    const totalHealthScore = states.reduce((sum, s) => sum + s.healthScore, 0);
    const healthScore = totalAgents > 0 ? totalHealthScore / totalAgents : 100;

    const uptime = Date.now() - this.poolStartTime.getTime();

    return {
      totalAgents,
      activeAgents,
      idleAgents,
      busyAgents,
      failedAgents,
      averageLoad,
      totalResourceUtilization: {
        memory: totalMemoryCapacity > 0 ? (totalMemoryUsed / totalMemoryCapacity) * 100 : 0,
        cpu: totalCpuCapacity > 0 ? (totalCpuUsed / totalCpuCapacity) * 100 : 0,
        disk: totalDiskCapacity > 0 ? (totalDiskUsed / totalDiskCapacity) * 100 : 0
      },
      healthScore,
      uptime
    };
  }

  /**
   * Get current pool state
   */
  getPoolState(): AgentPoolState[] {
    return Array.from(this.agents.values());
  }

  /**
   * Get agent count
   */
  getAgentCount(): number {
    return this.agents.size;
  }

  /**
   * Get scaling history
   */
  getScalingHistory(limit = 100): ScalingEvent[] {
    return this.scalingHistory
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
  }

  /**
   * Force scale up the pool
   */
  async scaleUp(targetSize?: number): Promise<void> {
    const currentSize = this.agents.size;
    const target = targetSize || Math.min(currentSize + 1, this.config.maxPoolSize);

    if (target <= currentSize) {
      logger.info({ currentSize, target }, 'Scale up not needed');
      return;
    }

    await this.performScaleUp(target, 'manual_scale_up');
  }

  /**
   * Force scale down the pool
   */
  async scaleDown(targetSize?: number): Promise<void> {
    const currentSize = this.agents.size;
    const target = targetSize || Math.max(currentSize - 1, this.config.minPoolSize);

    if (target >= currentSize) {
      logger.info({ currentSize, target }, 'Scale down not needed');
      return;
    }

    await this.performScaleDown(target, 'manual_scale_down');
  }

  /**
   * Shutdown the agent pool manager
   */
  async shutdown(): Promise<void> {
    try {
      logger.info('Shutting down Agent Pool Manager...');

      this.isRunning = false;

      // Clear timers
      if (this.healthCheckTimer) {
        clearInterval(this.healthCheckTimer);
      }
      if (this.scalingTimer) {
        clearInterval(this.scalingTimer);
      }

      // Remove all agents
      const agentIds = Array.from(this.agents.keys());
      for (const agentId of agentIds) {
        await this.removeAgent(agentId, 'shutdown');
      }

      this.emit('pool:shutdown', { timestamp: new Date() });

      logger.info('Agent Pool Manager shutdown complete');

    } catch (error) {
      logger.error({ error }, 'Error during Agent Pool Manager shutdown');
      throw error;
    }
  }

  // Private helper methods

  private async loadExistingAgents(): Promise<void> {
    try {
      const agents = await this.agentRegistry.listAgents();

      for (const agent of agents) {
        const poolState: AgentPoolState = {
          agentId: agent.id,
          status: 'idle',
          currentLoad: 0,
          activeTaskCount: 0,
          totalResourcesAllocated: {
            memoryMB: 0,
            cpuCores: 0,
            diskGB: 0
          },
          resourceCapacity: {
            maxMemoryMB: 1024,
            maxCpuCores: 2,
            maxDiskGB: 10
          },
          healthScore: 100,
          lastHealthCheck: new Date(),
          failureCount: 0,
          createdAt: new Date(),
          lastActivity: new Date()
        };

        this.agents.set(agent.id, poolState);
        this.allocations.set(agent.id, []);
      }

      logger.info({ agentCount: agents.length }, 'Loaded existing agents into pool');

    } catch (error) {
      logger.warn({ error }, 'Failed to load existing agents');
    }
  }

  private async ensureMinimumPoolSize(): Promise<void> {
    const currentSize = this.agents.size;

    if (currentSize < this.config.minPoolSize) {
      logger.info({
        currentSize,
        minPoolSize: this.config.minPoolSize
      }, 'Scaling up to minimum pool size');

      await this.performScaleUp(this.config.minPoolSize, 'min_pool_size');
    }
  }

  private calculateAgentLoad(poolState: AgentPoolState): number {
    const memoryLoad = (poolState.totalResourcesAllocated.memoryMB / poolState.resourceCapacity.maxMemoryMB) * 100;
    const cpuLoad = (poolState.totalResourcesAllocated.cpuCores / poolState.resourceCapacity.maxCpuCores) * 100;
    const diskLoad = (poolState.totalResourcesAllocated.diskGB / poolState.resourceCapacity.maxDiskGB) * 100;

    return Math.max(memoryLoad, cpuLoad, diskLoad);
  }

  private startHealthChecking(): void {
    this.healthCheckTimer = setInterval(async () => {
      try {
        await this.performHealthChecks();
      } catch (error) {
        logger.error({ error }, 'Error during health check');
      }
    }, this.config.healthCheckInterval);
  }

  private startScalingMonitoring(): void {
    this.scalingTimer = setInterval(async () => {
      try {
        await this.evaluateScaling();
      } catch (error) {
        logger.error({ error }, 'Error during scaling evaluation');
      }
    }, 60000); // Check every minute
  }

  private async performHealthChecks(): Promise<void> {
    const healthCheckPromises = Array.from(this.agents.keys()).map(async (agentId) => {
      try {
        const agent = await this.agentRegistry.getAgent(agentId);
        if (!agent) {
          await this.markAgentAsFailed(agentId, 'agent_not_found');
          return;
        }

        const health = await agent.getHealth();
        const poolState = this.agents.get(agentId);

        if (poolState) {
          poolState.healthScore = health.status === 'healthy' ? 100 :
                                 health.status === 'degraded' ? 60 : 20;
          poolState.lastHealthCheck = new Date();

          if (health.status === 'unhealthy') {
            await this.markAgentAsFailed(agentId, 'health_check_failed');
          } else if (poolState.status === 'failed' && health.status === 'healthy') {
            // Recover from failed state
            poolState.status = 'idle';
            poolState.failureCount = 0;
            this.emit('agent:recovered', { agentId, health });
          }

          this.agents.set(agentId, poolState);
        }

      } catch (error) {
        logger.warn({ agentId, error }, 'Health check failed for agent');
        await this.markAgentAsFailed(agentId, 'health_check_error');
      }
    });

    await Promise.allSettled(healthCheckPromises);
  }

  private async markAgentAsFailed(agentId: string, reason: string): Promise<void> {
    const poolState = this.agents.get(agentId);
    if (!poolState) return;

    poolState.failureCount++;
    poolState.lastFailure = new Date();
    poolState.status = 'failed';

    this.agents.set(agentId, poolState);

    logger.warn({
      agentId,
      reason,
      failureCount: poolState.failureCount,
      maxFailureThreshold: this.config.maxFailureThreshold
    }, 'Agent marked as failed');

    this.emit('agent:failed', {
      agentId,
      reason,
      failureCount: poolState.failureCount
    });

    // Record scaling event
    this.recordScalingEvent({
      type: 'health_check_failed',
      timestamp: new Date(),
      agentId,
      reason,
      poolSize: this.agents.size
    });

    // Auto-remove if threshold exceeded
    if (this.config.autoRemoveFailedAgents &&
        poolState.failureCount >= this.config.maxFailureThreshold) {

      logger.info({
        agentId,
        failureCount: poolState.failureCount
      }, 'Auto-removing failed agent');

      await this.removeAgent(agentId, 'auto_removal_failed');
    }
  }

  private async evaluateScaling(): Promise<void> {
    if (!this.isRunning) return;

    const stats = this.getPoolStatistics();
    const now = new Date();

    // Check scale up conditions
    if (stats.averageLoad > this.config.scaleUpThreshold &&
        stats.totalAgents < this.config.maxPoolSize &&
        now.getTime() - this.lastScaleUp.getTime() > this.config.scaleUpCooldown) {

      const targetSize = Math.min(stats.totalAgents + 1, this.config.maxPoolSize);
      await this.performScaleUp(targetSize, 'auto_scale_up_load');
    }

    // Check scale down conditions
    if (stats.averageLoad < this.config.scaleDownThreshold &&
        stats.totalAgents > this.config.minPoolSize &&
        now.getTime() - this.lastScaleDown.getTime() > this.config.scaleDownCooldown) {

      const targetSize = Math.max(stats.totalAgents - 1, this.config.minPoolSize);
      await this.performScaleDown(targetSize, 'auto_scale_down_load');
    }
  }

  private async performScaleUp(targetSize: number, reason: string): Promise<void> {
    const currentSize = this.agents.size;
    const agentsToAdd = targetSize - currentSize;

    if (agentsToAdd <= 0) return;

    logger.info({
      currentSize,
      targetSize,
      agentsToAdd,
      reason
    }, 'Scaling up agent pool');

    // Record scaling event
    this.recordScalingEvent({
      type: 'scale_up',
      timestamp: new Date(),
      reason,
      poolSize: currentSize,
      targetPoolSize: targetSize
    });

    // For now, we'll emit an event for the orchestrator to handle agent creation
    // In a full implementation, this would create new agent instances
    this.emit('scale:up_requested', {
      currentSize,
      targetSize,
      agentsToAdd,
      reason,
      timestamp: new Date()
    });

    this.lastScaleUp = new Date();
  }

  private async performScaleDown(targetSize: number, reason: string): Promise<void> {
    const currentSize = this.agents.size;
    const agentsToRemove = currentSize - targetSize;

    if (agentsToRemove <= 0) return;

    logger.info({
      currentSize,
      targetSize,
      agentsToRemove,
      reason
    }, 'Scaling down agent pool');

    // Find agents to remove (prefer idle agents with lowest health scores)
    const candidates = Array.from(this.agents.entries())
      .filter(([, state]) => state.status === 'idle' || state.status === 'failed')
      .sort((a, b) => a[1].healthScore - b[1].healthScore)
      .slice(0, agentsToRemove);

    // Record scaling event
    this.recordScalingEvent({
      type: 'scale_down',
      timestamp: new Date(),
      reason,
      poolSize: currentSize,
      targetPoolSize: targetSize
    });

    // Remove selected agents
    for (const [agentId] of candidates) {
      await this.removeAgent(agentId, reason);
    }

    this.lastScaleDown = new Date();
  }

  private recordScalingEvent(event: ScalingEvent): void {
    this.scalingHistory.push(event);

    // Keep only last 1000 events
    if (this.scalingHistory.length > 1000) {
      this.scalingHistory = this.scalingHistory.slice(-1000);
    }

    this.emit('scaling:event', event);
  }

  private setupEventHandlers(): void {
    // Handle allocation events for monitoring
    this.on('allocation:created', (data) => {
      logger.debug({
        agentId: data.agentId,
        taskId: data.taskId,
        currentLoad: data.poolState.currentLoad
      }, 'Allocation created');
    });

    this.on('allocation:removed', (data) => {
      logger.debug({
        agentId: data.agentId,
        taskId: data.taskId,
        currentLoad: data.poolState.currentLoad
      }, 'Allocation removed');
    });
  }
}