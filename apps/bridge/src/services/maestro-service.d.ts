export interface GoAgent {
    name: string;
    type: string;
    description: string;
    version: string;
    capabilities: string[];
    tools: string[];
    status: 'active' | 'idle' | 'busy' | 'error';
}
export interface TaskRequest {
    agentType: string;
    task: string;
    parameters?: Record<string, any>;
    timeout?: number;
}
export interface TaskResult {
    success: boolean;
    result?: any;
    error?: string;
    duration: number;
    agentUsed: string;
    metadata?: Record<string, any>;
}
export interface SystemMetrics {
    totalAgents: number;
    activeAgents: number;
    tasksExecuted: number;
    averageResponseTime: number;
    errorRate: number;
    systemLoad: number;
    memory: {
        used: number;
        total: number;
    };
    uptime: number;
}
export declare class MaestroService {
    private client;
    private baseUrl;
    constructor(baseUrl: string);
    /**
     * Get all available Go agents from URN-MAESTRO
     */
    getAgents(): Promise<GoAgent[]>;
    /**
     * Get specific agent information
     */
    getAgent(agentType: string): Promise<GoAgent | null>;
    /**
     * Execute a task using URN-MAESTRO agents
     */
    executeTask(request: TaskRequest): Promise<TaskResult>;
    /**
     * Get system metrics from URN-MAESTRO
     */
    getMetrics(): Promise<SystemMetrics>;
    /**
     * Get health status from URN-MAESTRO
     */
    getHealth(): Promise<{
        status: string;
        details?: any;
    }>;
    /**
     * Get available tools from URN-MAESTRO
     */
    getTools(): Promise<any[]>;
    /**
     * Execute a workflow in URN-MAESTRO
     */
    executeWorkflow(workflow: {
        name: string;
        steps: Array<{
            agentType: string;
            task: string;
            parameters?: Record<string, any>;
        }>;
        parallel?: boolean;
    }): Promise<TaskResult>;
    /**
     * Get real-time status updates
     */
    getStatus(): Promise<{
        agents: Record<string, {
            status: string;
            lastActivity: string;
        }>;
        system: {
            load: number;
            memory: number;
            uptime: number;
        };
        tasks: {
            running: number;
            queued: number;
            completed: number;
        };
    }>;
    /**
     * Check if URN-MAESTRO service is reachable
     */
    isHealthy(): Promise<boolean>;
}
//# sourceMappingURL=maestro-service.d.ts.map