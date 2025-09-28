import { MaestroService, TaskResult } from './maestro-service.js';
export interface AgentInfo {
    name: string;
    type: string;
    source: 'nodejs' | 'go';
    status: 'active' | 'idle' | 'busy' | 'error';
    capabilities: string[];
    lastActivity?: string;
}
export interface ExecuteTaskRequest {
    agentType: string;
    task: string;
    parameters?: Record<string, any>;
    priority?: 'low' | 'normal' | 'high';
    timeout?: number;
}
export interface WorkflowStep {
    agentType: string;
    task: string;
    parameters?: Record<string, any>;
}
export interface Workflow {
    name: string;
    steps: WorkflowStep[];
    parallel?: boolean;
}
export interface SystemStatus {
    totalAgents: number;
    activeAgents: number;
    nodeAgents: {
        total: number;
        active: number;
        agents: AgentInfo[];
    };
    goAgents: {
        total: number;
        active: number;
        agents: AgentInfo[];
    };
    runningTasks: number;
    queuedTasks: number;
    systemHealth: 'healthy' | 'degraded' | 'unhealthy';
}
export declare class AgentOrchestrator {
    private nodeClient;
    private maestroService;
    private agentMapping;
    constructor(nodeAgentsEndpoint: string, maestroService: MaestroService);
    /**
     * Initialize agent routing mapping
     */
    private initializeAgentMapping;
    /**
     * Determine which service should handle the agent type
     */
    private getServiceForAgent;
    /**
     * Execute a task with intelligent agent routing
     */
    executeTask(request: ExecuteTaskRequest): Promise<TaskResult>;
    /**
     * Execute task using Go URN-MAESTRO service
     */
    private executeGoTask;
    /**
     * Execute task using Node.js agent service
     */
    private executeNodeTask;
    /**
     * Execute with fallback between services
     */
    private executeWithFallback;
    /**
     * Execute a workflow across multiple agents
     */
    executeWorkflow(workflow: Workflow): Promise<TaskResult>;
    /**
     * Get comprehensive system status
     */
    getSystemStatus(): Promise<SystemStatus>;
    /**
     * Get available agents from both services
     */
    getAllAgents(): Promise<{
        nodejs: AgentInfo[];
        go: AgentInfo[];
    }>;
}
//# sourceMappingURL=agent-orchestrator.d.ts.map