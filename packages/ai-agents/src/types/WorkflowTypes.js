import { z } from 'zod';
// Workflow system types for deterministic, auditable processes
export const WorkflowStatusSchema = z.enum([
    'pending',
    'running',
    'paused',
    'completed',
    'failed',
    'cancelled'
]);
export const WorkflowStepTypeSchema = z.enum([
    'agent_task',
    'condition',
    'parallel',
    'sequential',
    'approval',
    'webhook',
    'delay'
]);
export const WorkflowStepSchema = z.object({
    id: z.string(),
    name: z.string(),
    type: WorkflowStepTypeSchema,
    description: z.string().optional(),
    agentId: z.string().optional(),
    taskType: z.string().optional(),
    payload: z.record(z.any()).optional(),
    condition: z.string().optional(), // JavaScript expression for conditional steps
    timeout: z.number().default(300000), // 5 minutes
    retryAttempts: z.number().default(3),
    onSuccess: z.string().optional(), // Next step ID on success
    onFailure: z.string().optional(), // Next step ID on failure
    requiresApproval: z.boolean().default(false),
    approvers: z.array(z.string()).default([]),
    governanceChecks: z.array(z.string()).default([]),
    dependencies: z.array(z.string()).default([]),
    metadata: z.record(z.any()).default({})
});
export const WorkflowDefinitionSchema = z.object({
    id: z.string(),
    name: z.string(),
    description: z.string(),
    version: z.string(),
    category: z.string(),
    tags: z.array(z.string()).default([]),
    steps: z.array(WorkflowStepSchema),
    startStep: z.string(),
    endSteps: z.array(z.string()),
    maxExecutionTime: z.number().default(3600000), // 1 hour
    maxRetries: z.number().default(3),
    governanceLevel: z.enum(['basic', 'standard', 'strict']).default('standard'),
    requiresApproval: z.boolean().default(false),
    approvers: z.array(z.string()).default([]),
    permissions: z.array(z.string()).default([]),
    triggers: z.array(z.object({
        type: z.string(),
        condition: z.string(),
        enabled: z.boolean()
    })).default([]),
    rollbackStrategy: z.enum(['none', 'automatic', 'manual']).default('automatic'),
    createdBy: z.string(),
    createdAt: z.date(),
    updatedAt: z.date(),
    enabled: z.boolean().default(true)
});
export const WorkflowExecutionSchema = z.object({
    id: z.string(),
    workflowId: z.string(),
    workflowVersion: z.string(),
    status: WorkflowStatusSchema,
    currentStep: z.string().optional(),
    input: z.record(z.any()),
    output: z.record(z.any()).optional(),
    context: z.record(z.any()).default({}),
    startTime: z.date(),
    endTime: z.date().optional(),
    executionTime: z.number().optional(),
    error: z.string().optional(),
    stepExecutions: z.array(z.object({
        stepId: z.string(),
        status: z.enum(['pending', 'running', 'completed', 'failed', 'skipped']),
        startTime: z.date(),
        endTime: z.date().optional(),
        input: z.record(z.any()).optional(),
        output: z.record(z.any()).optional(),
        error: z.string().optional(),
        retryCount: z.number().default(0),
        agentResponse: z.any().optional(),
        metadata: z.record(z.any()).default({})
    })).default([]),
    approvals: z.array(z.object({
        stepId: z.string(),
        approver: z.string(),
        status: z.enum(['pending', 'approved', 'rejected']),
        timestamp: z.date(),
        comments: z.string().optional()
    })).default([]),
    auditTrail: z.array(z.object({
        timestamp: z.date(),
        action: z.string(),
        actor: z.string(),
        details: z.record(z.any())
    })).default([]),
    metrics: z.object({
        totalSteps: z.number(),
        completedSteps: z.number(),
        failedSteps: z.number(),
        skippedSteps: z.number(),
        averageStepTime: z.number(),
        resourceUsage: z.record(z.number()).default({}),
        qualityScore: z.number().optional(),
        complianceScore: z.number().optional()
    }),
    triggeredBy: z.object({
        type: z.string(),
        user: z.string().optional(),
        system: z.string().optional(),
        event: z.string().optional()
    }),
    priority: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
    tags: z.array(z.string()).default([])
});
// Workflow Event Types
export const WorkflowEventSchema = z.object({
    id: z.string(),
    executionId: z.string(),
    workflowId: z.string(),
    type: z.enum([
        'workflow_started',
        'workflow_completed',
        'workflow_failed',
        'workflow_paused',
        'workflow_resumed',
        'workflow_cancelled',
        'step_started',
        'step_completed',
        'step_failed',
        'approval_requested',
        'approval_granted',
        'approval_rejected'
    ]),
    timestamp: z.date(),
    data: z.record(z.any()),
    severity: z.enum(['info', 'warning', 'error', 'critical'])
});
// Workflow Template Types
export const WorkflowTemplateSchema = z.object({
    id: z.string(),
    name: z.string(),
    description: z.string(),
    category: z.string(),
    tags: z.array(z.string()),
    template: WorkflowDefinitionSchema.omit({ id: true, createdBy: true, createdAt: true, updatedAt: true }),
    parameters: z.array(z.object({
        name: z.string(),
        type: z.string(),
        description: z.string(),
        required: z.boolean(),
        defaultValue: z.any().optional(),
        validation: z.string().optional()
    })),
    version: z.string(),
    createdBy: z.string(),
    createdAt: z.date(),
    updatedAt: z.date()
});
// Standard Workflow Templates for URN Labs
export const STANDARD_WORKFLOWS = {
    FEATURE_DEVELOPMENT: 'feature-development-v1',
    CODE_REVIEW: 'code-review-v1',
    DEPLOYMENT: 'deployment-v1',
    SECURITY_AUDIT: 'security-audit-v1',
    PERFORMANCE_OPTIMIZATION: 'performance-optimization-v1',
    BUG_FIX: 'bug-fix-v1',
    DOCUMENTATION_UPDATE: 'docs-update-v1'
};
//# sourceMappingURL=WorkflowTypes.js.map