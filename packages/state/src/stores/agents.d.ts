import { Agent, AnalyticsData, AnalyticsParams, ListParams } from '@urnlabs/api-client';
interface AgentState {
    agents: Agent[];
    currentAgent: Agent | null;
    agentAnalytics: Record<string, AnalyticsData>;
    isLoading: boolean;
    error: string | null;
    total: number;
    page: number;
    hasMore: boolean;
    fetchAgents: (params?: ListParams) => Promise<void>;
    fetchAgent: (id: string) => Promise<void>;
    createAgent: (data: Omit<Agent, 'id' | 'createdAt' | 'updatedAt' | 'metrics'>) => Promise<{
        success: boolean;
        error?: string;
    }>;
    updateAgent: (id: string, data: Partial<Agent>) => Promise<{
        success: boolean;
        error?: string;
    }>;
    deleteAgent: (id: string) => Promise<{
        success: boolean;
        error?: string;
    }>;
    fetchAgentAnalytics: (agentId: string, params: AnalyticsParams) => Promise<void>;
    setCurrentAgent: (agent: Agent | null) => void;
    clearError: () => void;
    resetState: () => void;
}
export declare const useAgentStore: import("zustand").UseBoundStore<Omit<Omit<import("zustand").StoreApi<AgentState>, "persist"> & {
    persist: {
        setOptions: (options: Partial<import("zustand/middleware").PersistOptions<AgentState, {
            agents: {
                status: "error" | "active" | "inactive";
                type: "integration" | "custom" | "conversation" | "data-processing";
                id: string;
                name: string;
                organizationId: string;
                createdAt: string;
                updatedAt: string;
                configuration: Record<string, any>;
                metrics: {
                    successRate: number;
                    totalExecutions: number;
                    averageResponseTime: number;
                    lastExecutedAt?: string | undefined;
                };
                createdBy: string;
                description?: string | undefined;
            }[];
            currentAgent: {
                status: "error" | "active" | "inactive";
                type: "integration" | "custom" | "conversation" | "data-processing";
                id: string;
                name: string;
                organizationId: string;
                createdAt: string;
                updatedAt: string;
                configuration: Record<string, any>;
                metrics: {
                    successRate: number;
                    totalExecutions: number;
                    averageResponseTime: number;
                    lastExecutedAt?: string | undefined;
                };
                createdBy: string;
                description?: string | undefined;
            } | null;
            page: number;
            total: number;
        }>>) => void;
        clearStorage: () => void;
        rehydrate: () => Promise<void> | void;
        hasHydrated: () => boolean;
        onHydrate: (fn: (state: AgentState) => void) => () => void;
        onFinishHydration: (fn: (state: AgentState) => void) => () => void;
        getOptions: () => Partial<import("zustand/middleware").PersistOptions<AgentState, {
            agents: {
                status: "error" | "active" | "inactive";
                type: "integration" | "custom" | "conversation" | "data-processing";
                id: string;
                name: string;
                organizationId: string;
                createdAt: string;
                updatedAt: string;
                configuration: Record<string, any>;
                metrics: {
                    successRate: number;
                    totalExecutions: number;
                    averageResponseTime: number;
                    lastExecutedAt?: string | undefined;
                };
                createdBy: string;
                description?: string | undefined;
            }[];
            currentAgent: {
                status: "error" | "active" | "inactive";
                type: "integration" | "custom" | "conversation" | "data-processing";
                id: string;
                name: string;
                organizationId: string;
                createdAt: string;
                updatedAt: string;
                configuration: Record<string, any>;
                metrics: {
                    successRate: number;
                    totalExecutions: number;
                    averageResponseTime: number;
                    lastExecutedAt?: string | undefined;
                };
                createdBy: string;
                description?: string | undefined;
            } | null;
            page: number;
            total: number;
        }>>;
    };
}, "setState"> & {
    setState(nextStateOrUpdater: AgentState | Partial<AgentState> | ((state: import("immer").WritableDraft<AgentState>) => void), shouldReplace?: boolean | undefined): void;
}>;
export declare const useAgents: () => {
    status: "error" | "active" | "inactive";
    type: "integration" | "custom" | "conversation" | "data-processing";
    id: string;
    name: string;
    organizationId: string;
    createdAt: string;
    updatedAt: string;
    configuration: Record<string, any>;
    metrics: {
        successRate: number;
        totalExecutions: number;
        averageResponseTime: number;
        lastExecutedAt?: string | undefined;
    };
    createdBy: string;
    description?: string | undefined;
}[];
export declare const useCurrentAgent: () => {
    status: "error" | "active" | "inactive";
    type: "integration" | "custom" | "conversation" | "data-processing";
    id: string;
    name: string;
    organizationId: string;
    createdAt: string;
    updatedAt: string;
    configuration: Record<string, any>;
    metrics: {
        successRate: number;
        totalExecutions: number;
        averageResponseTime: number;
        lastExecutedAt?: string | undefined;
    };
    createdBy: string;
    description?: string | undefined;
} | null;
export declare const useAgentAnalytics: (agentId: string) => {
    metrics: {
        value: number;
        timestamp: string;
        name: string;
        unit: string;
        metadata?: Record<string, any> | undefined;
    }[];
    period: "hour" | "day" | "week" | "month" | "year";
    endDate: string;
    startDate: string;
    aggregations: {
        minimum: number;
        maximum: number;
        total: number;
        average: number;
        trend: number;
    };
};
export declare const useAgentLoading: () => boolean;
export declare const useAgentError: () => string | null;
export declare const useAgentsByStatus: (status: Agent["status"]) => {
    status: "error" | "active" | "inactive";
    type: "integration" | "custom" | "conversation" | "data-processing";
    id: string;
    name: string;
    organizationId: string;
    createdAt: string;
    updatedAt: string;
    configuration: Record<string, any>;
    metrics: {
        successRate: number;
        totalExecutions: number;
        averageResponseTime: number;
        lastExecutedAt?: string | undefined;
    };
    createdBy: string;
    description?: string | undefined;
}[];
export declare const useAgentsByType: (type: Agent["type"]) => {
    status: "error" | "active" | "inactive";
    type: "integration" | "custom" | "conversation" | "data-processing";
    id: string;
    name: string;
    organizationId: string;
    createdAt: string;
    updatedAt: string;
    configuration: Record<string, any>;
    metrics: {
        successRate: number;
        totalExecutions: number;
        averageResponseTime: number;
        lastExecutedAt?: string | undefined;
    };
    createdBy: string;
    description?: string | undefined;
}[];
export declare const useActiveAgents: () => {
    status: "error" | "active" | "inactive";
    type: "integration" | "custom" | "conversation" | "data-processing";
    id: string;
    name: string;
    organizationId: string;
    createdAt: string;
    updatedAt: string;
    configuration: Record<string, any>;
    metrics: {
        successRate: number;
        totalExecutions: number;
        averageResponseTime: number;
        lastExecutedAt?: string | undefined;
    };
    createdBy: string;
    description?: string | undefined;
}[];
export declare const useAgentMetrics: () => {
    total: number;
    active: number;
    inactive: number;
    error: number;
    successRate: number;
};
export {};
//# sourceMappingURL=agents.d.ts.map