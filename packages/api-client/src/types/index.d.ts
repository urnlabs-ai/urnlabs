import { z } from 'zod';
export declare const UserSchema: z.ZodObject<{
    id: z.ZodString;
    email: z.ZodString;
    name: z.ZodString;
    role: z.ZodEnum<["admin", "user", "viewer"]>;
    organizationId: z.ZodString;
    createdAt: z.ZodString;
    updatedAt: z.ZodString;
    lastLoginAt: z.ZodOptional<z.ZodString>;
    isActive: z.ZodBoolean;
    avatar: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    id: string;
    name: string;
    organizationId: string;
    createdAt: string;
    updatedAt: string;
    email: string;
    role: "user" | "admin" | "viewer";
    isActive: boolean;
    avatar?: string | undefined;
    lastLoginAt?: string | undefined;
}, {
    id: string;
    name: string;
    organizationId: string;
    createdAt: string;
    updatedAt: string;
    email: string;
    role: "user" | "admin" | "viewer";
    isActive: boolean;
    avatar?: string | undefined;
    lastLoginAt?: string | undefined;
}>;
export declare const OrganizationSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    plan: z.ZodEnum<["starter", "professional", "enterprise"]>;
    settings: z.ZodObject<{
        timezone: z.ZodString;
        dateFormat: z.ZodString;
        currency: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        timezone: string;
        dateFormat: string;
        currency: string;
    }, {
        timezone: string;
        dateFormat: string;
        currency: string;
    }>;
    createdAt: z.ZodString;
    updatedAt: z.ZodString;
    isActive: z.ZodBoolean;
    limits: z.ZodObject<{
        workflows: z.ZodNumber;
        executions: z.ZodNumber;
        users: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        users: number;
        workflows: number;
        executions: number;
    }, {
        users: number;
        workflows: number;
        executions: number;
    }>;
}, "strip", z.ZodTypeAny, {
    id: string;
    name: string;
    createdAt: string;
    updatedAt: string;
    isActive: boolean;
    settings: {
        timezone: string;
        dateFormat: string;
        currency: string;
    };
    plan: "enterprise" | "starter" | "professional";
    limits: {
        users: number;
        workflows: number;
        executions: number;
    };
}, {
    id: string;
    name: string;
    createdAt: string;
    updatedAt: string;
    isActive: boolean;
    settings: {
        timezone: string;
        dateFormat: string;
        currency: string;
    };
    plan: "enterprise" | "starter" | "professional";
    limits: {
        users: number;
        workflows: number;
        executions: number;
    };
}>;
export declare const WorkflowNodeSchema: z.ZodObject<{
    id: z.ZodString;
    type: z.ZodEnum<["trigger", "action", "condition", "output"]>;
    position: z.ZodObject<{
        x: z.ZodNumber;
        y: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        x: number;
        y: number;
    }, {
        x: number;
        y: number;
    }>;
    data: z.ZodRecord<z.ZodString, z.ZodAny>;
    inputs: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    outputs: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    type: "output" | "action" | "condition" | "trigger";
    id: string;
    data: Record<string, any>;
    position: {
        x: number;
        y: number;
    };
    inputs?: string[] | undefined;
    outputs?: string[] | undefined;
}, {
    type: "output" | "action" | "condition" | "trigger";
    id: string;
    data: Record<string, any>;
    position: {
        x: number;
        y: number;
    };
    inputs?: string[] | undefined;
    outputs?: string[] | undefined;
}>;
export declare const WorkflowEdgeSchema: z.ZodObject<{
    id: z.ZodString;
    source: z.ZodString;
    target: z.ZodString;
    sourceHandle: z.ZodOptional<z.ZodString>;
    targetHandle: z.ZodOptional<z.ZodString>;
    data: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
}, "strip", z.ZodTypeAny, {
    id: string;
    source: string;
    target: string;
    data?: Record<string, any> | undefined;
    sourceHandle?: string | undefined;
    targetHandle?: string | undefined;
}, {
    id: string;
    source: string;
    target: string;
    data?: Record<string, any> | undefined;
    sourceHandle?: string | undefined;
    targetHandle?: string | undefined;
}>;
export declare const WorkflowSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    description: z.ZodOptional<z.ZodString>;
    status: z.ZodEnum<["draft", "active", "paused", "archived"]>;
    organizationId: z.ZodString;
    createdBy: z.ZodString;
    nodes: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        type: z.ZodEnum<["trigger", "action", "condition", "output"]>;
        position: z.ZodObject<{
            x: z.ZodNumber;
            y: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            x: number;
            y: number;
        }, {
            x: number;
            y: number;
        }>;
        data: z.ZodRecord<z.ZodString, z.ZodAny>;
        inputs: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        outputs: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    }, "strip", z.ZodTypeAny, {
        type: "output" | "action" | "condition" | "trigger";
        id: string;
        data: Record<string, any>;
        position: {
            x: number;
            y: number;
        };
        inputs?: string[] | undefined;
        outputs?: string[] | undefined;
    }, {
        type: "output" | "action" | "condition" | "trigger";
        id: string;
        data: Record<string, any>;
        position: {
            x: number;
            y: number;
        };
        inputs?: string[] | undefined;
        outputs?: string[] | undefined;
    }>, "many">;
    edges: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        source: z.ZodString;
        target: z.ZodString;
        sourceHandle: z.ZodOptional<z.ZodString>;
        targetHandle: z.ZodOptional<z.ZodString>;
        data: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
    }, "strip", z.ZodTypeAny, {
        id: string;
        source: string;
        target: string;
        data?: Record<string, any> | undefined;
        sourceHandle?: string | undefined;
        targetHandle?: string | undefined;
    }, {
        id: string;
        source: string;
        target: string;
        data?: Record<string, any> | undefined;
        sourceHandle?: string | undefined;
        targetHandle?: string | undefined;
    }>, "many">;
    settings: z.ZodObject<{
        timeout: z.ZodNumber;
        retryAttempts: z.ZodNumber;
        concurrency: z.ZodNumber;
        webhookUrl: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        timeout: number;
        retryAttempts: number;
        concurrency: number;
        webhookUrl?: string | undefined;
    }, {
        timeout: number;
        retryAttempts: number;
        concurrency: number;
        webhookUrl?: string | undefined;
    }>;
    version: z.ZodNumber;
    createdAt: z.ZodString;
    updatedAt: z.ZodString;
    lastExecutedAt: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
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
}, {
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
}>;
export declare const AgentSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    type: z.ZodEnum<["conversation", "data-processing", "integration", "custom"]>;
    description: z.ZodOptional<z.ZodString>;
    configuration: z.ZodRecord<z.ZodString, z.ZodAny>;
    status: z.ZodEnum<["active", "inactive", "error"]>;
    organizationId: z.ZodString;
    createdBy: z.ZodString;
    metrics: z.ZodObject<{
        totalExecutions: z.ZodNumber;
        successRate: z.ZodNumber;
        averageResponseTime: z.ZodNumber;
        lastExecutedAt: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        successRate: number;
        totalExecutions: number;
        averageResponseTime: number;
        lastExecutedAt?: string | undefined;
    }, {
        successRate: number;
        totalExecutions: number;
        averageResponseTime: number;
        lastExecutedAt?: string | undefined;
    }>;
    createdAt: z.ZodString;
    updatedAt: z.ZodString;
}, "strip", z.ZodTypeAny, {
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
}, {
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
}>;
export declare const ExecutionSchema: z.ZodObject<{
    id: z.ZodString;
    workflowId: z.ZodString;
    agentId: z.ZodOptional<z.ZodString>;
    status: z.ZodEnum<["pending", "running", "completed", "failed", "cancelled"]>;
    startedAt: z.ZodString;
    completedAt: z.ZodOptional<z.ZodString>;
    duration: z.ZodOptional<z.ZodNumber>;
    input: z.ZodRecord<z.ZodString, z.ZodAny>;
    output: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
    error: z.ZodOptional<z.ZodObject<{
        code: z.ZodString;
        message: z.ZodString;
        details: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
    }, "strip", z.ZodTypeAny, {
        message: string;
        code: string;
        details?: Record<string, any> | undefined;
    }, {
        message: string;
        code: string;
        details?: Record<string, any> | undefined;
    }>>;
    logs: z.ZodArray<z.ZodObject<{
        timestamp: z.ZodString;
        level: z.ZodEnum<["debug", "info", "warn", "error"]>;
        message: z.ZodString;
        metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
    }, "strip", z.ZodTypeAny, {
        message: string;
        level: "error" | "info" | "warn" | "debug";
        timestamp: string;
        metadata?: Record<string, any> | undefined;
    }, {
        message: string;
        level: "error" | "info" | "warn" | "debug";
        timestamp: string;
        metadata?: Record<string, any> | undefined;
    }>, "many">;
    cost: z.ZodOptional<z.ZodNumber>;
    organizationId: z.ZodString;
}, "strip", z.ZodTypeAny, {
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
}, {
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
}>;
export declare const MetricSchema: z.ZodObject<{
    name: z.ZodString;
    value: z.ZodNumber;
    unit: z.ZodString;
    timestamp: z.ZodString;
    metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
}, "strip", z.ZodTypeAny, {
    value: number;
    timestamp: string;
    name: string;
    unit: string;
    metadata?: Record<string, any> | undefined;
}, {
    value: number;
    timestamp: string;
    name: string;
    unit: string;
    metadata?: Record<string, any> | undefined;
}>;
export declare const AnalyticsDataSchema: z.ZodObject<{
    period: z.ZodEnum<["hour", "day", "week", "month", "year"]>;
    startDate: z.ZodString;
    endDate: z.ZodString;
    metrics: z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        value: z.ZodNumber;
        unit: z.ZodString;
        timestamp: z.ZodString;
        metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
    }, "strip", z.ZodTypeAny, {
        value: number;
        timestamp: string;
        name: string;
        unit: string;
        metadata?: Record<string, any> | undefined;
    }, {
        value: number;
        timestamp: string;
        name: string;
        unit: string;
        metadata?: Record<string, any> | undefined;
    }>, "many">;
    aggregations: z.ZodObject<{
        total: z.ZodNumber;
        average: z.ZodNumber;
        minimum: z.ZodNumber;
        maximum: z.ZodNumber;
        trend: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        minimum: number;
        maximum: number;
        total: number;
        average: number;
        trend: number;
    }, {
        minimum: number;
        maximum: number;
        total: number;
        average: number;
        trend: number;
    }>;
}, "strip", z.ZodTypeAny, {
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
}, {
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
export declare const ApiResponseSchema: z.ZodObject<{
    success: z.ZodBoolean;
    data: z.ZodOptional<z.ZodAny>;
    error: z.ZodOptional<z.ZodObject<{
        code: z.ZodString;
        message: z.ZodString;
        details: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
    }, "strip", z.ZodTypeAny, {
        message: string;
        code: string;
        details?: Record<string, any> | undefined;
    }, {
        message: string;
        code: string;
        details?: Record<string, any> | undefined;
    }>>;
    meta: z.ZodObject<{
        timestamp: z.ZodString;
        requestId: z.ZodString;
        version: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        version: string;
        timestamp: string;
        requestId: string;
    }, {
        version: string;
        timestamp: string;
        requestId: string;
    }>;
}, "strip", z.ZodTypeAny, {
    meta: {
        version: string;
        timestamp: string;
        requestId: string;
    };
    success: boolean;
    error?: {
        message: string;
        code: string;
        details?: Record<string, any> | undefined;
    } | undefined;
    data?: any;
}, {
    meta: {
        version: string;
        timestamp: string;
        requestId: string;
    };
    success: boolean;
    error?: {
        message: string;
        code: string;
        details?: Record<string, any> | undefined;
    } | undefined;
    data?: any;
}>;
export declare const PaginatedResponseSchema: z.ZodObject<{
    data: z.ZodArray<z.ZodAny, "many">;
    pagination: z.ZodObject<{
        page: z.ZodNumber;
        limit: z.ZodNumber;
        total: z.ZodNumber;
        totalPages: z.ZodNumber;
        hasNext: z.ZodBoolean;
        hasPrevious: z.ZodBoolean;
    }, "strip", z.ZodTypeAny, {
        total: number;
        limit: number;
        page: number;
        totalPages: number;
        hasNext: boolean;
        hasPrevious: boolean;
    }, {
        total: number;
        limit: number;
        page: number;
        totalPages: number;
        hasNext: boolean;
        hasPrevious: boolean;
    }>;
    meta: z.ZodObject<{
        timestamp: z.ZodString;
        requestId: z.ZodString;
        version: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        version: string;
        timestamp: string;
        requestId: string;
    }, {
        version: string;
        timestamp: string;
        requestId: string;
    }>;
}, "strip", z.ZodTypeAny, {
    meta: {
        version: string;
        timestamp: string;
        requestId: string;
    };
    data: any[];
    pagination: {
        total: number;
        limit: number;
        page: number;
        totalPages: number;
        hasNext: boolean;
        hasPrevious: boolean;
    };
}, {
    meta: {
        version: string;
        timestamp: string;
        requestId: string;
    };
    data: any[];
    pagination: {
        total: number;
        limit: number;
        page: number;
        totalPages: number;
        hasNext: boolean;
        hasPrevious: boolean;
    };
}>;
export type User = z.infer<typeof UserSchema>;
export type Organization = z.infer<typeof OrganizationSchema>;
export type WorkflowNode = z.infer<typeof WorkflowNodeSchema>;
export type WorkflowEdge = z.infer<typeof WorkflowEdgeSchema>;
export type Workflow = z.infer<typeof WorkflowSchema>;
export type Agent = z.infer<typeof AgentSchema>;
export type Execution = z.infer<typeof ExecutionSchema>;
export type Metric = z.infer<typeof MetricSchema>;
export type AnalyticsData = z.infer<typeof AnalyticsDataSchema>;
export type ApiResponse<T = any> = z.infer<typeof ApiResponseSchema> & {
    data?: T;
};
export type PaginatedResponse<T = any> = z.infer<typeof PaginatedResponseSchema> & {
    data: T[];
};
export interface ListParams {
    page?: number;
    limit?: number;
    sort?: string;
    filter?: Record<string, any>;
    search?: string;
}
export interface AnalyticsParams {
    startDate: string;
    endDate: string;
    period: 'hour' | 'day' | 'week' | 'month' | 'year';
    metrics?: string[];
    groupBy?: string;
}
export interface AuthTokens {
    accessToken: string;
    refreshToken: string;
    expiresAt: string;
    tokenType: string;
}
export interface LoginCredentials {
    email: string;
    password: string;
}
export interface RegisterData {
    email: string;
    password: string;
    name: string;
    organizationName?: string;
}
export interface WebSocketMessage {
    type: string;
    payload: any;
    timestamp: string;
    id: string;
}
export interface WorkflowExecutionUpdate {
    executionId: string;
    workflowId: string;
    status: Execution['status'];
    progress: number;
    currentNode?: string;
    logs?: Execution['logs'];
}
export interface SystemNotification {
    id: string;
    type: 'info' | 'warning' | 'error' | 'success';
    title: string;
    message: string;
    action?: {
        label: string;
        url: string;
    };
    timestamp: string;
    read: boolean;
}
//# sourceMappingURL=index.d.ts.map