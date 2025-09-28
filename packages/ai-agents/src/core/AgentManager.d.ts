import { EventEmitter } from 'events';
import type { BaseAgent, AgentConfig, AgentTask, AgentMetrics, AgentRegistry } from '../types/AgentTypes';
/**
 * Central agent management system for URN Labs AI Agent Platform
 * Handles agent lifecycle, task distribution, and performance monitoring
 */
export declare class AgentManager extends EventEmitter implements AgentRegistry {
    private agents;
    private taskQueue;
    private activeExecutions;
    private auditLogger;
    private governanceController;
    private isInitialized;
    constructor();
    /**
     * Initialize the agent manager
     */
    initialize(): Promise<void>;
    /**
     * Register a new agent
     */
    register(agent: BaseAgent): Promise<void>;
    /**
     * Unregister an agent
     */
    unregister(agentId: string): Promise<void>;
    /**
     * Get an agent by ID
     */
    getAgent(agentId: string): Promise<BaseAgent | null>;
    /**
     * List all agents with optional filters
     */
    listAgents(filters?: Partial<AgentConfig>): Promise<BaseAgent[]>;
    /**
     * Get agents by role
     */
    getAgentsByRole(role: string): Promise<BaseAgent[]>;
    /**
     * Get agent metrics
     */
    getAgentMetrics(agentId: string): Promise<AgentMetrics>;
    /**
     * Execute a task on the most suitable agent
     */
    executeTask(task: Omit<AgentTask, 'id' | 'createdAt' | 'updatedAt' | 'status'>): Promise<string>;
    /**
     * Get task status
     */
    getTaskStatus(taskId: string): Promise<{
        status: string;
        agentId?: string;
        result?: any;
        error?: string;
    }>;
    /**
     * Get system health
     */
    getSystemHealth(): Promise<{
        status: 'healthy' | 'degraded' | 'unhealthy';
        agents: Record<string, any>;
        queues: Record<string, number>;
        activeExecutions: number;
    }>;
    /**
     * Shutdown agent manager
     */
    shutdown(): Promise<void>;
    /**
     * Private methods
     */
    private validateAgentConfig;
    private findSuitableAgent;
    private setupEventHandlers;
    private startTaskProcessor;
    private executeAgentTask;
    private startHealthMonitoring;
}
//# sourceMappingURL=AgentManager.d.ts.map