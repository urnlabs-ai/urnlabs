import { z } from 'zod';
export declare const AgentRoleSchema: z.ZodEnum<["code_reviewer", "architect", "deployment", "content", "security", "performance", "qa", "monitoring"]>;
export declare const AgentStatusSchema: z.ZodEnum<["idle", "processing", "completed", "failed", "paused"]>;
export declare const AgentCapabilitySchema: z.ZodObject<{
    name: z.ZodString;
    description: z.ZodString;
    version: z.ZodString;
    enabled: z.ZodBoolean;
    configuration: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
}, "strip", z.ZodTypeAny, {
    version: string;
    description: string;
    name: string;
    enabled: boolean;
    configuration?: Record<string, any> | undefined;
}, {
    version: string;
    description: string;
    name: string;
    enabled: boolean;
    configuration?: Record<string, any> | undefined;
}>;
export declare const AgentMetricsSchema: z.ZodObject<{
    tasksCompleted: z.ZodNumber;
    averageProcessingTime: z.ZodNumber;
    successRate: z.ZodNumber;
    lastActivity: z.ZodDate;
    errorCount: z.ZodNumber;
    performanceScore: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    tasksCompleted: number;
    averageProcessingTime: number;
    successRate: number;
    lastActivity: Date;
    errorCount: number;
    performanceScore: number;
}, {
    tasksCompleted: number;
    averageProcessingTime: number;
    successRate: number;
    lastActivity: Date;
    errorCount: number;
    performanceScore: number;
}>;
export declare const AgentConfigSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    role: z.ZodEnum<["code_reviewer", "architect", "deployment", "content", "security", "performance", "qa", "monitoring"]>;
    description: z.ZodString;
    version: z.ZodString;
    capabilities: z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        description: z.ZodString;
        version: z.ZodString;
        enabled: z.ZodBoolean;
        configuration: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
    }, "strip", z.ZodTypeAny, {
        version: string;
        description: string;
        name: string;
        enabled: boolean;
        configuration?: Record<string, any> | undefined;
    }, {
        version: string;
        description: string;
        name: string;
        enabled: boolean;
        configuration?: Record<string, any> | undefined;
    }>, "many">;
    maxConcurrentTasks: z.ZodDefault<z.ZodNumber>;
    timeout: z.ZodDefault<z.ZodNumber>;
    retryAttempts: z.ZodDefault<z.ZodNumber>;
    enabled: z.ZodDefault<z.ZodBoolean>;
    governanceLevel: z.ZodDefault<z.ZodEnum<["basic", "standard", "strict"]>>;
    auditRequired: z.ZodDefault<z.ZodBoolean>;
    securityClearance: z.ZodDefault<z.ZodEnum<["public", "internal", "confidential", "secret"]>>;
}, "strip", z.ZodTypeAny, {
    timeout: number;
    version: string;
    description: string;
    id: string;
    name: string;
    capabilities: {
        version: string;
        description: string;
        name: string;
        enabled: boolean;
        configuration?: Record<string, any> | undefined;
    }[];
    maxConcurrentTasks: number;
    role: "content" | "security" | "deployment" | "monitoring" | "performance" | "qa" | "code_reviewer" | "architect";
    enabled: boolean;
    retryAttempts: number;
    governanceLevel: "basic" | "standard" | "strict";
    auditRequired: boolean;
    securityClearance: "secret" | "public" | "internal" | "confidential";
}, {
    version: string;
    description: string;
    id: string;
    name: string;
    capabilities: {
        version: string;
        description: string;
        name: string;
        enabled: boolean;
        configuration?: Record<string, any> | undefined;
    }[];
    role: "content" | "security" | "deployment" | "monitoring" | "performance" | "qa" | "code_reviewer" | "architect";
    timeout?: number | undefined;
    maxConcurrentTasks?: number | undefined;
    enabled?: boolean | undefined;
    retryAttempts?: number | undefined;
    governanceLevel?: "basic" | "standard" | "strict" | undefined;
    auditRequired?: boolean | undefined;
    securityClearance?: "secret" | "public" | "internal" | "confidential" | undefined;
}>;
export declare const AgentTaskSchema: z.ZodObject<{
    id: z.ZodString;
    agentId: z.ZodString;
    type: z.ZodString;
    priority: z.ZodDefault<z.ZodEnum<["low", "medium", "high", "critical"]>>;
    payload: z.ZodRecord<z.ZodString, z.ZodAny>;
    context: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
    requiredCapabilities: z.ZodArray<z.ZodString, "many">;
    deadline: z.ZodOptional<z.ZodDate>;
    dependencies: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    governanceChecks: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    auditTrail: z.ZodDefault<z.ZodArray<z.ZodAny, "many">>;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
    completedAt: z.ZodOptional<z.ZodDate>;
    status: z.ZodEnum<["idle", "processing", "completed", "failed", "paused"]>;
    result: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
    error: z.ZodOptional<z.ZodString>;
    metrics: z.ZodOptional<z.ZodObject<{
        processingTime: z.ZodOptional<z.ZodNumber>;
        resourceUsage: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodNumber>>;
        qualityScore: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        processingTime?: number | undefined;
        resourceUsage?: Record<string, number> | undefined;
        qualityScore?: number | undefined;
    }, {
        processingTime?: number | undefined;
        resourceUsage?: Record<string, number> | undefined;
        qualityScore?: number | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    agentId: string;
    status: "completed" | "failed" | "paused" | "idle" | "processing";
    type: string;
    id: string;
    createdAt: Date;
    updatedAt: Date;
    priority: "medium" | "low" | "high" | "critical";
    payload: Record<string, any>;
    requiredCapabilities: string[];
    dependencies: string[];
    governanceChecks: string[];
    auditTrail: any[];
    error?: string | undefined;
    result?: Record<string, any> | undefined;
    completedAt?: Date | undefined;
    context?: Record<string, any> | undefined;
    deadline?: Date | undefined;
    metrics?: {
        processingTime?: number | undefined;
        resourceUsage?: Record<string, number> | undefined;
        qualityScore?: number | undefined;
    } | undefined;
}, {
    agentId: string;
    status: "completed" | "failed" | "paused" | "idle" | "processing";
    type: string;
    id: string;
    createdAt: Date;
    updatedAt: Date;
    payload: Record<string, any>;
    requiredCapabilities: string[];
    error?: string | undefined;
    result?: Record<string, any> | undefined;
    priority?: "medium" | "low" | "high" | "critical" | undefined;
    completedAt?: Date | undefined;
    context?: Record<string, any> | undefined;
    deadline?: Date | undefined;
    dependencies?: string[] | undefined;
    governanceChecks?: string[] | undefined;
    auditTrail?: any[] | undefined;
    metrics?: {
        processingTime?: number | undefined;
        resourceUsage?: Record<string, number> | undefined;
        qualityScore?: number | undefined;
    } | undefined;
}>;
export declare const AgentResponseSchema: z.ZodObject<{
    success: z.ZodBoolean;
    data: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
    error: z.ZodOptional<z.ZodString>;
    warnings: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    metadata: z.ZodObject<{
        processingTime: z.ZodNumber;
        agentVersion: z.ZodString;
        timestamp: z.ZodDate;
        resourceUsage: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodNumber>>;
        qualityScore: z.ZodOptional<z.ZodNumber>;
        confidenceScore: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        timestamp: Date;
        processingTime: number;
        agentVersion: string;
        resourceUsage?: Record<string, number> | undefined;
        qualityScore?: number | undefined;
        confidenceScore?: number | undefined;
    }, {
        timestamp: Date;
        processingTime: number;
        agentVersion: string;
        resourceUsage?: Record<string, number> | undefined;
        qualityScore?: number | undefined;
        confidenceScore?: number | undefined;
    }>;
    auditInfo: z.ZodObject<{
        userId: z.ZodString;
        sessionId: z.ZodString;
        governanceLevel: z.ZodString;
        complianceChecks: z.ZodArray<z.ZodString, "many">;
        riskAssessment: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        userId: string;
        governanceLevel: string;
        sessionId: string;
        complianceChecks: string[];
        riskAssessment: string;
    }, {
        userId: string;
        governanceLevel: string;
        sessionId: string;
        complianceChecks: string[];
        riskAssessment: string;
    }>;
}, "strip", z.ZodTypeAny, {
    success: boolean;
    metadata: {
        timestamp: Date;
        processingTime: number;
        agentVersion: string;
        resourceUsage?: Record<string, number> | undefined;
        qualityScore?: number | undefined;
        confidenceScore?: number | undefined;
    };
    warnings: string[];
    auditInfo: {
        userId: string;
        governanceLevel: string;
        sessionId: string;
        complianceChecks: string[];
        riskAssessment: string;
    };
    error?: string | undefined;
    data?: Record<string, any> | undefined;
}, {
    success: boolean;
    metadata: {
        timestamp: Date;
        processingTime: number;
        agentVersion: string;
        resourceUsage?: Record<string, number> | undefined;
        qualityScore?: number | undefined;
        confidenceScore?: number | undefined;
    };
    auditInfo: {
        userId: string;
        governanceLevel: string;
        sessionId: string;
        complianceChecks: string[];
        riskAssessment: string;
    };
    error?: string | undefined;
    data?: Record<string, any> | undefined;
    warnings?: string[] | undefined;
}>;
export type AgentRole = z.infer<typeof AgentRoleSchema>;
export type AgentStatus = z.infer<typeof AgentStatusSchema>;
export type AgentCapability = z.infer<typeof AgentCapabilitySchema>;
export type AgentMetrics = z.infer<typeof AgentMetricsSchema>;
export type AgentConfig = z.infer<typeof AgentConfigSchema>;
export type AgentTask = z.infer<typeof AgentTaskSchema>;
export type AgentResponse = z.infer<typeof AgentResponseSchema>;
export interface BaseAgent {
    readonly id: string;
    readonly config: AgentConfig;
    readonly metrics: AgentMetrics;
    initialize(): Promise<void>;
    processTask(task: AgentTask): Promise<AgentResponse>;
    validateTask(task: AgentTask): Promise<boolean>;
    cleanup(): Promise<void>;
    getHealth(): Promise<{
        status: 'healthy' | 'degraded' | 'unhealthy';
        details: Record<string, any>;
    }>;
    checkCompliance(task: AgentTask): Promise<{
        compliant: boolean;
        violations: string[];
        riskLevel: 'low' | 'medium' | 'high' | 'critical';
    }>;
}
export declare const AgentEventSchema: z.ZodObject<{
    id: z.ZodString;
    agentId: z.ZodString;
    type: z.ZodEnum<["task_started", "task_completed", "task_failed", "agent_error", "compliance_violation"]>;
    timestamp: z.ZodDate;
    data: z.ZodRecord<z.ZodString, z.ZodAny>;
    severity: z.ZodEnum<["info", "warning", "error", "critical"]>;
    category: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    agentId: string;
    type: "task_completed" | "task_failed" | "task_started" | "agent_error" | "compliance_violation";
    timestamp: Date;
    severity: "error" | "info" | "warning" | "critical";
    id: string;
    data: Record<string, any>;
    category?: string | undefined;
}, {
    agentId: string;
    type: "task_completed" | "task_failed" | "task_started" | "agent_error" | "compliance_violation";
    timestamp: Date;
    severity: "error" | "info" | "warning" | "critical";
    id: string;
    data: Record<string, any>;
    category?: string | undefined;
}>;
export type AgentEvent = z.infer<typeof AgentEventSchema>;
export interface AgentRegistry {
    register(agent: BaseAgent): Promise<void>;
    unregister(agentId: string): Promise<void>;
    getAgent(agentId: string): Promise<BaseAgent | null>;
    listAgents(filters?: Partial<AgentConfig>): Promise<BaseAgent[]>;
    getAgentsByRole(role: AgentRole): Promise<BaseAgent[]>;
    getAgentMetrics(agentId: string): Promise<AgentMetrics>;
}
//# sourceMappingURL=AgentTypes.d.ts.map