import { AnalyticsData, AnalyticsParams } from '@urnlabs/api-client';
interface AnalyticsState {
    systemAnalytics: AnalyticsData | null;
    workflowAnalytics: Record<string, AnalyticsData>;
    agentAnalytics: Record<string, AnalyticsData>;
    isLoading: boolean;
    error: string | null;
    lastUpdated: Record<string, string>;
    cacheExpiry: number;
    fetchSystemAnalytics: (params: AnalyticsParams, forceRefresh?: boolean) => Promise<void>;
    fetchWorkflowAnalytics: (workflowId: string, params: AnalyticsParams, forceRefresh?: boolean) => Promise<void>;
    fetchAgentAnalytics: (agentId: string, params: AnalyticsParams, forceRefresh?: boolean) => Promise<void>;
    clearCache: (type?: 'system' | 'workflow' | 'agent', id?: string) => void;
    clearError: () => void;
    resetState: () => void;
}
export declare const useAnalyticsStore: import("zustand").UseBoundStore<Omit<Omit<import("zustand").StoreApi<AnalyticsState>, "persist"> & {
    persist: {
        setOptions: (options: Partial<import("zustand/middleware").PersistOptions<AnalyticsState, {
            systemAnalytics: {
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
            } | null;
            workflowAnalytics: Record<string, {
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
            }>;
            agentAnalytics: Record<string, {
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
            }>;
            lastUpdated: Record<string, string>;
            cacheExpiry: number;
        }>>) => void;
        clearStorage: () => void;
        rehydrate: () => Promise<void> | void;
        hasHydrated: () => boolean;
        onHydrate: (fn: (state: AnalyticsState) => void) => () => void;
        onFinishHydration: (fn: (state: AnalyticsState) => void) => () => void;
        getOptions: () => Partial<import("zustand/middleware").PersistOptions<AnalyticsState, {
            systemAnalytics: {
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
            } | null;
            workflowAnalytics: Record<string, {
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
            }>;
            agentAnalytics: Record<string, {
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
            }>;
            lastUpdated: Record<string, string>;
            cacheExpiry: number;
        }>>;
    };
}, "setState"> & {
    setState(nextStateOrUpdater: AnalyticsState | Partial<AnalyticsState> | ((state: import("immer").WritableDraft<AnalyticsState>) => void), shouldReplace?: boolean | undefined): void;
}>;
export declare const useSystemAnalytics: () => {
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
} | null;
export declare const useWorkflowAnalytics: (workflowId: string) => {
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
export declare const useAnalyticsLoading: () => boolean;
export declare const useAnalyticsError: () => string | null;
export declare const useSystemMetrics: () => {
    totalExecutions: any;
    successfulExecutions: any;
    failedExecutions: any;
    averageExecutionTime: any;
    successRate: any;
    totalWorkflows: any;
    activeAgents: any;
} | null;
export declare const useTrendData: (type: "system" | "workflow" | "agent", id?: string) => {
    executionTrends: any;
    performanceTrends: any;
    errorTrends: any;
} | null;
export declare const useTopPerformers: () => {
    topWorkflows: any;
    topAgents: any;
    mostUsedNodes: any;
} | null;
export declare const useCacheStatus: (type: "system" | "workflow" | "agent", id?: string) => {
    isStale: boolean;
    lastUpdated: null;
    cacheAge?: never;
} | {
    isStale: boolean;
    lastUpdated: string;
    cacheAge: number;
} | null;
export {};
//# sourceMappingURL=analytics.d.ts.map