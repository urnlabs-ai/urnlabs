import { z } from 'zod';
// Core agent types for the URN Labs AI Agent System
export const AgentRoleSchema = z.enum([
    'code_reviewer',
    'architect',
    'deployment',
    'content',
    'security',
    'performance',
    'qa',
    'monitoring'
]);
export const AgentStatusSchema = z.enum([
    'idle',
    'processing',
    'completed',
    'failed',
    'paused'
]);
export const AgentCapabilitySchema = z.object({
    name: z.string(),
    description: z.string(),
    version: z.string(),
    enabled: z.boolean(),
    configuration: z.record(z.any()).optional()
});
export const AgentMetricsSchema = z.object({
    tasksCompleted: z.number(),
    averageProcessingTime: z.number(),
    successRate: z.number(),
    lastActivity: z.date(),
    errorCount: z.number(),
    performanceScore: z.number().min(0).max(100)
});
export const AgentConfigSchema = z.object({
    id: z.string(),
    name: z.string(),
    role: AgentRoleSchema,
    description: z.string(),
    version: z.string(),
    capabilities: z.array(AgentCapabilitySchema),
    maxConcurrentTasks: z.number().default(5),
    timeout: z.number().default(300000), // 5 minutes
    retryAttempts: z.number().default(3),
    enabled: z.boolean().default(true),
    governanceLevel: z.enum(['basic', 'standard', 'strict']).default('standard'),
    auditRequired: z.boolean().default(true),
    securityClearance: z.enum(['public', 'internal', 'confidential', 'secret']).default('internal')
});
export const AgentTaskSchema = z.object({
    id: z.string(),
    agentId: z.string(),
    type: z.string(),
    priority: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
    payload: z.record(z.any()),
    context: z.record(z.any()).optional(),
    requiredCapabilities: z.array(z.string()),
    deadline: z.date().optional(),
    dependencies: z.array(z.string()).default([]),
    governanceChecks: z.array(z.string()).default([]),
    auditTrail: z.array(z.any()).default([]),
    createdAt: z.date(),
    updatedAt: z.date(),
    completedAt: z.date().optional(),
    status: AgentStatusSchema,
    result: z.record(z.any()).optional(),
    error: z.string().optional(),
    metrics: z.object({
        processingTime: z.number().optional(),
        resourceUsage: z.record(z.number()).optional(),
        qualityScore: z.number().optional()
    }).optional()
});
export const AgentResponseSchema = z.object({
    success: z.boolean(),
    data: z.record(z.any()).optional(),
    error: z.string().optional(),
    warnings: z.array(z.string()).default([]),
    metadata: z.object({
        processingTime: z.number(),
        agentVersion: z.string(),
        timestamp: z.date(),
        resourceUsage: z.record(z.number()).optional(),
        qualityScore: z.number().optional(),
        confidenceScore: z.number().optional()
    }),
    auditInfo: z.object({
        userId: z.string(),
        sessionId: z.string(),
        governanceLevel: z.string(),
        complianceChecks: z.array(z.string()),
        riskAssessment: z.string()
    })
});
// Agent Event Types
export const AgentEventSchema = z.object({
    id: z.string(),
    agentId: z.string(),
    type: z.enum(['task_started', 'task_completed', 'task_failed', 'agent_error', 'compliance_violation']),
    timestamp: z.date(),
    data: z.record(z.any()),
    severity: z.enum(['info', 'warning', 'error', 'critical']),
    category: z.string().optional()
});
//# sourceMappingURL=AgentTypes.js.map