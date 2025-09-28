import { Workflow, Execution, ListParams } from '@urnlabs/api-client';
interface WorkflowState {
    workflows: Workflow[];
    currentWorkflow: Workflow | null;
    executions: Execution[];
    currentExecution: Execution | null;
    isLoading: boolean;
    error: string | null;
    total: number;
    page: number;
    hasMore: boolean;
    fetchWorkflows: (params?: ListParams) => Promise<void>;
    fetchWorkflow: (id: string) => Promise<void>;
    createWorkflow: (data: Omit<Workflow, 'id' | 'createdAt' | 'updatedAt' | 'version'>) => Promise<{
        success: boolean;
        error?: string;
    }>;
    updateWorkflow: (id: string, data: Partial<Workflow>) => Promise<{
        success: boolean;
        error?: string;
    }>;
    deleteWorkflow: (id: string) => Promise<{
        success: boolean;
        error?: string;
    }>;
    duplicateWorkflow: (id: string, name?: string) => Promise<{
        success: boolean;
        error?: string;
    }>;
    executeWorkflow: (id: string, input?: Record<string, any>) => Promise<{
        success: boolean;
        executionId?: string;
        error?: string;
    }>;
    fetchExecutions: (params?: ListParams & {
        workflowId?: string;
    }) => Promise<void>;
    fetchExecution: (id: string) => Promise<void>;
    cancelExecution: (id: string) => Promise<{
        success: boolean;
        error?: string;
    }>;
    retryExecution: (id: string) => Promise<{
        success: boolean;
        executionId?: string;
        error?: string;
    }>;
    setCurrentWorkflow: (workflow: Workflow | null) => void;
    setCurrentExecution: (execution: Execution | null) => void;
    clearError: () => void;
    resetState: () => void;
}
export declare const useWorkflowStore: import("zustand").UseBoundStore<Omit<Omit<import("zustand").StoreApi<WorkflowState>, "persist"> & {
    persist: {
        setOptions: (options: Partial<import("zustand/middleware").PersistOptions<WorkflowState, {
            workflows: {
                version: number;
                status: "active" | "paused" | "draft" | "archived";
                id: string;
                name: string;
                organizationId: string;
                createdAt: string;
                updatedAt: string;
                createdBy: string;
                settings: {
                    timeout: number;
                    retryAttempts: number;
                    concurrency: number;
                    webhookUrl?: string | undefined;
                };
                nodes: {
                    type: "output" | "action" | "condition" | "trigger";
                    id: string;
                    data: Record<string, any>;
                    position: {
                        x: number;
                        y: number;
                    };
                    inputs?: string[] | undefined;
                    outputs?: string[] | undefined;
                }[];
                edges: {
                    id: string;
                    source: string;
                    target: string;
                    data?: Record<string, any> | undefined;
                    sourceHandle?: string | undefined;
                    targetHandle?: string | undefined;
                }[];
                description?: string | undefined;
                lastExecutedAt?: string | undefined;
            }[];
            currentWorkflow: {
                version: number;
                status: "active" | "paused" | "draft" | "archived";
                id: string;
                name: string;
                organizationId: string;
                createdAt: string;
                updatedAt: string;
                createdBy: string;
                settings: {
                    timeout: number;
                    retryAttempts: number;
                    concurrency: number;
                    webhookUrl?: string | undefined;
                };
                nodes: {
                    type: "output" | "action" | "condition" | "trigger";
                    id: string;
                    data: Record<string, any>;
                    position: {
                        x: number;
                        y: number;
                    };
                    inputs?: string[] | undefined;
                    outputs?: string[] | undefined;
                }[];
                edges: {
                    id: string;
                    source: string;
                    target: string;
                    data?: Record<string, any> | undefined;
                    sourceHandle?: string | undefined;
                    targetHandle?: string | undefined;
                }[];
                description?: string | undefined;
                lastExecutedAt?: string | undefined;
            } | null;
            page: number;
            total: number;
        }>>) => void;
        clearStorage: () => void;
        rehydrate: () => Promise<void> | void;
        hasHydrated: () => boolean;
        onHydrate: (fn: (state: WorkflowState) => void) => () => void;
        onFinishHydration: (fn: (state: WorkflowState) => void) => () => void;
        getOptions: () => Partial<import("zustand/middleware").PersistOptions<WorkflowState, {
            workflows: {
                version: number;
                status: "active" | "paused" | "draft" | "archived";
                id: string;
                name: string;
                organizationId: string;
                createdAt: string;
                updatedAt: string;
                createdBy: string;
                settings: {
                    timeout: number;
                    retryAttempts: number;
                    concurrency: number;
                    webhookUrl?: string | undefined;
                };
                nodes: {
                    type: "output" | "action" | "condition" | "trigger";
                    id: string;
                    data: Record<string, any>;
                    position: {
                        x: number;
                        y: number;
                    };
                    inputs?: string[] | undefined;
                    outputs?: string[] | undefined;
                }[];
                edges: {
                    id: string;
                    source: string;
                    target: string;
                    data?: Record<string, any> | undefined;
                    sourceHandle?: string | undefined;
                    targetHandle?: string | undefined;
                }[];
                description?: string | undefined;
                lastExecutedAt?: string | undefined;
            }[];
            currentWorkflow: {
                version: number;
                status: "active" | "paused" | "draft" | "archived";
                id: string;
                name: string;
                organizationId: string;
                createdAt: string;
                updatedAt: string;
                createdBy: string;
                settings: {
                    timeout: number;
                    retryAttempts: number;
                    concurrency: number;
                    webhookUrl?: string | undefined;
                };
                nodes: {
                    type: "output" | "action" | "condition" | "trigger";
                    id: string;
                    data: Record<string, any>;
                    position: {
                        x: number;
                        y: number;
                    };
                    inputs?: string[] | undefined;
                    outputs?: string[] | undefined;
                }[];
                edges: {
                    id: string;
                    source: string;
                    target: string;
                    data?: Record<string, any> | undefined;
                    sourceHandle?: string | undefined;
                    targetHandle?: string | undefined;
                }[];
                description?: string | undefined;
                lastExecutedAt?: string | undefined;
            } | null;
            page: number;
            total: number;
        }>>;
    };
}, "setState"> & {
    setState(nextStateOrUpdater: WorkflowState | Partial<WorkflowState> | ((state: import("immer").WritableDraft<WorkflowState>) => void), shouldReplace?: boolean | undefined): void;
}>;
export declare const useWorkflows: () => {
    version: number;
    status: "active" | "paused" | "draft" | "archived";
    id: string;
    name: string;
    organizationId: string;
    createdAt: string;
    updatedAt: string;
    createdBy: string;
    settings: {
        timeout: number;
        retryAttempts: number;
        concurrency: number;
        webhookUrl?: string | undefined;
    };
    nodes: {
        type: "output" | "action" | "condition" | "trigger";
        id: string;
        data: Record<string, any>;
        position: {
            x: number;
            y: number;
        };
        inputs?: string[] | undefined;
        outputs?: string[] | undefined;
    }[];
    edges: {
        id: string;
        source: string;
        target: string;
        data?: Record<string, any> | undefined;
        sourceHandle?: string | undefined;
        targetHandle?: string | undefined;
    }[];
    description?: string | undefined;
    lastExecutedAt?: string | undefined;
}[];
export declare const useCurrentWorkflow: () => {
    version: number;
    status: "active" | "paused" | "draft" | "archived";
    id: string;
    name: string;
    organizationId: string;
    createdAt: string;
    updatedAt: string;
    createdBy: string;
    settings: {
        timeout: number;
        retryAttempts: number;
        concurrency: number;
        webhookUrl?: string | undefined;
    };
    nodes: {
        type: "output" | "action" | "condition" | "trigger";
        id: string;
        data: Record<string, any>;
        position: {
            x: number;
            y: number;
        };
        inputs?: string[] | undefined;
        outputs?: string[] | undefined;
    }[];
    edges: {
        id: string;
        source: string;
        target: string;
        data?: Record<string, any> | undefined;
        sourceHandle?: string | undefined;
        targetHandle?: string | undefined;
    }[];
    description?: string | undefined;
    lastExecutedAt?: string | undefined;
} | null;
export declare const useExecutions: () => {
    status: "completed" | "pending" | "cancelled" | "running" | "failed";
    workflowId: string;
    id: string;
    organizationId: string;
    input: Record<string, any>;
    startedAt: string;
    logs: {
        message: string;
        level: "error" | "info" | "warn" | "debug";
        timestamp: string;
        metadata?: Record<string, any> | undefined;
    }[];
    error?: {
        message: string;
        code: string;
        details?: Record<string, any> | undefined;
    } | undefined;
    output?: Record<string, any> | undefined;
    agentId?: string | undefined;
    duration?: number | undefined;
    cost?: number | undefined;
    completedAt?: string | undefined;
}[];
export declare const useCurrentExecution: () => {
    status: "completed" | "pending" | "cancelled" | "running" | "failed";
    workflowId: string;
    id: string;
    organizationId: string;
    input: Record<string, any>;
    startedAt: string;
    logs: {
        message: string;
        level: "error" | "info" | "warn" | "debug";
        timestamp: string;
        metadata?: Record<string, any> | undefined;
    }[];
    error?: {
        message: string;
        code: string;
        details?: Record<string, any> | undefined;
    } | undefined;
    output?: Record<string, any> | undefined;
    agentId?: string | undefined;
    duration?: number | undefined;
    cost?: number | undefined;
    completedAt?: string | undefined;
} | null;
export declare const useWorkflowLoading: () => boolean;
export declare const useWorkflowError: () => string | null;
export {};
//# sourceMappingURL=workflows.d.ts.map