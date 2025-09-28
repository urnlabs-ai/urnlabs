import { PrismaClient } from '@prisma/client';
export interface UnifiedAgent {
    id: string;
    name: string;
    type: string;
    source: 'nodejs' | 'go';
    status: 'active' | 'idle' | 'busy' | 'error' | 'offline';
    description: string;
    capabilities: string[];
    tools: string[];
    version: string;
    endpoint?: string;
    lastHeartbeat: Date;
    metadata: Record<string, any>;
    performance: {
        tasksCompleted: number;
        averageResponseTime: number;
        successRate: number;
        lastUsed?: Date;
    };
}
export interface AgentCapability {
    name: string;
    description: string;
    requiredTools: string[];
    supportedAgents: string[];
}
export interface AgentExecutionRequest {
    agentId: string;
    task: string;
    parameters?: Record<string, any>;
    priority?: 'low' | 'normal' | 'high';
    timeout?: number;
    requestId?: string;
}
export interface AgentExecutionResult {
    success: boolean;
    result?: any;
    error?: string;
    duration: number;
    agentId: string;
    requestId?: string;
    metadata?: Record<string, any>;
}
export declare class UnifiedAgentRegistry {
    private prisma;
    private agents;
    private capabilities;
    private nodeAgentsEndpoint;
    private bridgeEndpoint;
    private maestroEndpoint;
    private lastSync;
    private syncInterval;
    constructor(prisma: PrismaClient, nodeAgentsEndpoint?: string, bridgeEndpoint?: string, maestroEndpoint?: string);
    /**
     * Initialize predefined capabilities for different agent types
     */
    private initializeCapabilities;
    /**
     * Start periodic synchronization with agent services
     */
    private startPeriodicSync;
    /**
     * Synchronize agents from all services
     */
    syncAgents(): Promise<void>;
    /**
     * Fetch agents from Node.js service
     */
    private fetchNodeAgents;
    /**
     * Fetch agents from bridge service (which aggregates Go agents)
     */
    private fetchBridgeAgents;
    /**
     * Update agent information in database
     */
    private updateAgentDatabase;
    /**
     * Get all agents
     */
    getAllAgents(): UnifiedAgent[];
    /**
     * Get agents by source
     */
    getAgentsBySource(source: 'nodejs' | 'go'): UnifiedAgent[];
    /**
     * Get agents by capability
     */
    getAgentsByCapability(capability: string): UnifiedAgent[];
    /**
     * Get agent by ID
     */
    getAgent(id: string): UnifiedAgent | null;
    /**
     * Find best agent for a task
     */
    findBestAgentForTask(requiredCapabilities: string[], preferredSource?: 'nodejs' | 'go'): UnifiedAgent | null;
    /**
     * Execute task on specific agent
     */
    executeTask(request: AgentExecutionRequest): Promise<AgentExecutionResult>;
    /**
     * Execute task on Node.js agent
     */
    private executeNodeTask;
    /**
     * Execute task on Go agent via bridge
     */
    private executeGoTask;
    /**
     * Get system statistics
     */
    getStatistics(): {
        totalAgents: number;
        nodeAgents: number;
        goAgents: number;
        activeAgents: number;
        capabilities: string[];
        lastSync: Date;
        averageResponseTime: number;
        totalTasksCompleted: number;
    };
    /**
     * Health check for the registry
     */
    healthCheck(): Promise<{
        status: 'healthy' | 'degraded' | 'unhealthy';
        details: {
            agentsResponding: number;
            totalAgents: number;
            lastSync: string;
            errors: string[];
        };
    }>;
    /**
     * Cleanup resources
     */
    cleanup(): void;
}
//# sourceMappingURL=agent-registry.d.ts.map