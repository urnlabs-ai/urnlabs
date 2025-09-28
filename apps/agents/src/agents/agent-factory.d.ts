export interface Agent {
    id: string;
    type: string;
    name: string;
    description: string;
    capabilities: string[];
    tools: string[];
    execute: (task: AgentTask) => Promise<AgentResult>;
}
export interface AgentTask {
    id: string;
    type: string;
    input: Record<string, any>;
    context?: Record<string, any>;
}
export interface AgentResult {
    success: boolean;
    output?: any;
    error?: string;
    metadata?: Record<string, any>;
}
export declare class AgentFactory {
    private agents;
    constructor();
    private initializeDefaultAgents;
    registerAgent(agent: Agent): void;
    getAgent(agentId: string): Agent | undefined;
    getAllAgents(): Agent[];
    getAgentsByType(type: string): Agent[];
    executeAgentTask(agentId: string, task: AgentTask): Promise<AgentResult>;
}
//# sourceMappingURL=agent-factory.d.ts.map