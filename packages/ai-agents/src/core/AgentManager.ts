import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import type { 
  BaseAgent, 
  AgentConfig, 
  AgentTask, 
  AgentResponse, 
  AgentEvent, 
  AgentMetrics,
  AgentRegistry 
} from '../types/AgentTypes';
import { AuditLogger } from './AuditLogger';
import { GovernanceController } from './GovernanceController';

/**
 * Central agent management system for URN Labs AI Agent Platform
 * Handles agent lifecycle, task distribution, and performance monitoring
 */
export class AgentManager extends EventEmitter implements AgentRegistry {
  private agents: Map<string, BaseAgent> = new Map();
  private taskQueue: Map<string, AgentTask[]> = new Map();
  private activeExecutions: Map<string, Promise<AgentResponse>> = new Map();
  private auditLogger: AuditLogger;
  private governanceController: GovernanceController;
  private isInitialized = false;

  constructor() {
    super();
    this.auditLogger = new AuditLogger();
    this.governanceController = new GovernanceController();
  }

  /**
   * Initialize the agent manager
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      await this.auditLogger.initialize();
      await this.governanceController.initialize();
      
      this.setupEventHandlers();
      this.startTaskProcessor();
      this.startHealthMonitoring();
      
      this.isInitialized = true;
      
      await this.auditLogger.log({
        action: 'agent_manager_initialized',
        actor: 'system',
        timestamp: new Date(),
        details: {
          registeredAgents: this.agents.size,
          taskQueues: this.taskQueue.size
        }
      });
    } catch (error) {
      throw new Error(`Failed to initialize AgentManager: ${error}`);
    }
  }

  /**
   * Register a new agent
   */
  async register(agent: BaseAgent): Promise<void> {
    if (!this.isInitialized) {
      throw new Error('AgentManager must be initialized before registering agents');
    }

    if (this.agents.has(agent.id)) {
      throw new Error(`Agent with ID ${agent.id} is already registered`);
    }

    try {
      // Initialize the agent
      await agent.initialize();
      
      // Validate agent configuration
      await this.validateAgentConfig(agent.config);
      
      // Register the agent
      this.agents.set(agent.id, agent);
      this.taskQueue.set(agent.id, []);
      
      // Log registration
      await this.auditLogger.log({
        action: 'agent_registered',
        actor: 'system',
        timestamp: new Date(),
        details: {
          agentId: agent.id,
          role: agent.config.role,
          capabilities: agent.config.capabilities.map(c => c.name),
          version: agent.config.version
        }
      });

      this.emit('agent_registered', { agentId: agent.id, config: agent.config });
      
    } catch (error) {
      throw new Error(`Failed to register agent ${agent.id}: ${error}`);
    }
  }

  /**
   * Unregister an agent
   */
  async unregister(agentId: string): Promise<void> {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent ${agentId} not found`);
    }

    try {
      // Cancel any pending tasks
      const pendingTasks = this.taskQueue.get(agentId) || [];
      for (const task of pendingTasks) {
        await this.auditLogger.log({
          action: 'task_cancelled',
          actor: 'system',
          timestamp: new Date(),
          details: {
            taskId: task.id,
            agentId,
            reason: 'Agent unregistered'
          }
        });
      }

      // Cleanup agent
      await agent.cleanup();
      
      // Remove from registry
      this.agents.delete(agentId);
      this.taskQueue.delete(agentId);
      this.activeExecutions.delete(agentId);

      // Log unregistration
      await this.auditLogger.log({
        action: 'agent_unregistered',
        actor: 'system',
        timestamp: new Date(),
        details: {
          agentId,
          cancelledTasks: pendingTasks.length
        }
      });

      this.emit('agent_unregistered', { agentId });

    } catch (error) {
      throw new Error(`Failed to unregister agent ${agentId}: ${error}`);
    }
  }

  /**
   * Get an agent by ID
   */
  async getAgent(agentId: string): Promise<BaseAgent | null> {
    return this.agents.get(agentId) || null;
  }

  /**
   * List all agents with optional filters
   */
  async listAgents(filters?: Partial<AgentConfig>): Promise<BaseAgent[]> {
    const agents = Array.from(this.agents.values());
    
    if (!filters) return agents;
    
    return agents.filter(agent => {
      return Object.entries(filters).every(([key, value]) => {
        return agent.config[key as keyof AgentConfig] === value;
      });
    });
  }

  /**
   * Get agents by role
   */
  async getAgentsByRole(role: string): Promise<BaseAgent[]> {
    return this.listAgents({ role: role as any });
  }

  /**
   * Get agent metrics
   */
  async getAgentMetrics(agentId: string): Promise<AgentMetrics> {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent ${agentId} not found`);
    }
    return agent.metrics;
  }

  /**
   * Execute a task on the most suitable agent
   */
  async executeTask(task: Omit<AgentTask, 'id' | 'createdAt' | 'updatedAt' | 'status'>): Promise<string> {
    const taskId = uuidv4();
    const fullTask: AgentTask = {
      ...task,
      id: taskId,
      createdAt: new Date(),
      updatedAt: new Date(),
      status: 'pending' as const,
      auditTrail: []
    };

    // Governance checks
    const governanceResult = await this.governanceController.validateTask(fullTask);
    if (!governanceResult.approved) {
      throw new Error(`Task rejected by governance: ${governanceResult.reason}`);
    }

    // Find suitable agent
    const suitableAgent = await this.findSuitableAgent(fullTask);
    if (!suitableAgent) {
      throw new Error(`No suitable agent found for task ${taskId}`);
    }

    // Queue task
    const queue = this.taskQueue.get(suitableAgent.id) || [];
    queue.push(fullTask);
    this.taskQueue.set(suitableAgent.id, queue);

    // Log task queued
    await this.auditLogger.log({
      action: 'task_queued',
      actor: 'system',
      timestamp: new Date(),
      details: {
        taskId,
        agentId: suitableAgent.id,
        taskType: fullTask.type,
        priority: fullTask.priority
      }
    });

    this.emit('task_queued', { taskId, agentId: suitableAgent.id, task: fullTask });

    return taskId;
  }

  /**
   * Get task status
   */
  async getTaskStatus(taskId: string): Promise<{
    status: string;
    agentId?: string;
    result?: any;
    error?: string;
  }> {
    // Search through all agent queues and active executions
    for (const [agentId, queue] of this.taskQueue.entries()) {
      const task = queue.find(t => t.id === taskId);
      if (task) {
        return {
          status: task.status,
          agentId,
          result: task.result,
          error: task.error
        };
      }
    }

    throw new Error(`Task ${taskId} not found`);
  }

  /**
   * Get system health
   */
  async getSystemHealth(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    agents: Record<string, any>;
    queues: Record<string, number>;
    activeExecutions: number;
  }> {
    const agentHealth: Record<string, any> = {};
    const queueSizes: Record<string, number> = {};
    
    let healthyAgents = 0;
    let totalAgents = 0;

    for (const [agentId, agent] of this.agents.entries()) {
      totalAgents++;
      const health = await agent.getHealth();
      agentHealth[agentId] = health;
      
      if (health.status === 'healthy') {
        healthyAgents++;
      }

      queueSizes[agentId] = this.taskQueue.get(agentId)?.length || 0;
    }

    const healthPercentage = totalAgents > 0 ? (healthyAgents / totalAgents) : 1;
    let overallStatus: 'healthy' | 'degraded' | 'unhealthy';

    if (healthPercentage >= 0.9) {
      overallStatus = 'healthy';
    } else if (healthPercentage >= 0.7) {
      overallStatus = 'degraded';
    } else {
      overallStatus = 'unhealthy';
    }

    return {
      status: overallStatus,
      agents: agentHealth,
      queues: queueSizes,
      activeExecutions: this.activeExecutions.size
    };
  }

  /**
   * Shutdown agent manager
   */
  async shutdown(): Promise<void> {
    if (!this.isInitialized) return;

    try {
      // Cancel all active executions
      const cancelPromises = Array.from(this.activeExecutions.keys()).map(async (agentId) => {
        const agent = this.agents.get(agentId);
        if (agent) {
          await agent.cleanup();
        }
      });

      await Promise.all(cancelPromises);

      // Clear all data structures
      this.agents.clear();
      this.taskQueue.clear();
      this.activeExecutions.clear();

      await this.auditLogger.log({
        action: 'agent_manager_shutdown',
        actor: 'system',
        timestamp: new Date(),
        details: {}
      });

      this.isInitialized = false;

    } catch (error) {
      throw new Error(`Failed to shutdown AgentManager: ${error}`);
    }
  }

  /**
   * Private methods
   */

  private async validateAgentConfig(config: AgentConfig): Promise<void> {
    // Validate configuration against governance policies
    const validation = await this.governanceController.validateAgentConfig(config);
    if (!validation.valid) {
      throw new Error(`Agent configuration validation failed: ${validation.errors.join(', ')}`);
    }
  }

  private async findSuitableAgent(task: AgentTask): Promise<BaseAgent | null> {
    const agents = Array.from(this.agents.values());
    
    // Filter by capabilities
    const capableAgents = agents.filter(agent => {
      return task.requiredCapabilities.every(capability =>
        agent.config.capabilities.some(cap => cap.name === capability && cap.enabled)
      );
    });

    if (capableAgents.length === 0) return null;

    // Filter by availability (not at max concurrent tasks)
    const availableAgents = capableAgents.filter(agent => {
      const queueSize = this.taskQueue.get(agent.id)?.length || 0;
      const activeExecution = this.activeExecutions.has(agent.id) ? 1 : 0;
      return (queueSize + activeExecution) < agent.config.maxConcurrentTasks;
    });

    if (availableAgents.length === 0) return capableAgents[0]; // Return first capable agent even if busy

    // Select agent with best performance score and lowest queue
    return availableAgents.reduce((best, current) => {
      const bestQueue = this.taskQueue.get(best.id)?.length || 0;
      const currentQueue = this.taskQueue.get(current.id)?.length || 0;
      
      if (currentQueue < bestQueue) return current;
      if (currentQueue > bestQueue) return best;
      
      return current.metrics.performanceScore > best.metrics.performanceScore ? current : best;
    });
  }

  private setupEventHandlers(): void {
    this.on('task_completed', async (event: { taskId: string; agentId: string; result: any }) => {
      await this.auditLogger.log({
        action: 'task_completed',
        actor: event.agentId,
        timestamp: new Date(),
        details: {
          taskId: event.taskId,
          result: event.result
        }
      });
    });

    this.on('task_failed', async (event: { taskId: string; agentId: string; error: string }) => {
      await this.auditLogger.log({
        action: 'task_failed',
        actor: event.agentId,
        timestamp: new Date(),
        details: {
          taskId: event.taskId,
          error: event.error
        }
      });
    });
  }

  private startTaskProcessor(): void {
    setInterval(async () => {
      for (const [agentId, queue] of this.taskQueue.entries()) {
        if (queue.length === 0 || this.activeExecutions.has(agentId)) continue;

        const agent = this.agents.get(agentId);
        if (!agent) continue;

        const task = queue.shift();
        if (!task) continue;

        // Start task execution
        const executionPromise = this.executeAgentTask(agent, task);
        this.activeExecutions.set(agentId, executionPromise);

        // Handle completion
        executionPromise
          .then((result) => {
            this.activeExecutions.delete(agentId);
            this.emit('task_completed', { taskId: task.id, agentId, result });
          })
          .catch((error) => {
            this.activeExecutions.delete(agentId);
            this.emit('task_failed', { taskId: task.id, agentId, error: error.message });
          });
      }
    }, 1000); // Process tasks every second
  }

  private async executeAgentTask(agent: BaseAgent, task: AgentTask): Promise<AgentResponse> {
    try {
      // Update task status
      task.status = 'processing';
      task.updatedAt = new Date();

      // Execute task
      const result = await agent.processTask(task);

      // Update task with result
      task.status = 'completed';
      task.completedAt = new Date();
      task.result = result.data;
      task.updatedAt = new Date();

      return result;
    } catch (error) {
      task.status = 'failed';
      task.error = error instanceof Error ? error.message : String(error);
      task.updatedAt = new Date();
      throw error;
    }
  }

  private startHealthMonitoring(): void {
    setInterval(async () => {
      const health = await this.getSystemHealth();
      
      if (health.status !== 'healthy') {
        this.emit('health_degraded', health);
      }

      // Log health metrics
      await this.auditLogger.log({
        action: 'health_check',
        actor: 'system',
        timestamp: new Date(),
        details: health
      });
    }, 30000); // Health check every 30 seconds
  }
}