import { EventEmitter } from 'events';
import type { WorkflowDefinition, WorkflowExecution } from '../types/WorkflowTypes';
export type WorkflowContext = Record<string, any>;
export interface WorkflowStepExecution {
    id: string;
    stepId: string;
    status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
    startTime: Date;
    endTime?: Date;
    input?: Record<string, any>;
    output?: Record<string, any>;
    error?: string;
    retryCount: number;
    agentResponse?: any;
    metadata: Record<string, any>;
}
/**
 * Deterministic workflow engine for URN Labs AI Agent Platform
 * Provides orchestration, governance, and audit trails for multi-step processes
 */
export declare class WorkflowEngine extends EventEmitter {
    private workflows;
    private executions;
    private auditLogger;
    private governanceController;
    private isInitialized;
    private executionQueue;
    private processingExecution;
    constructor();
    /**
     * Initialize the workflow engine
     */
    initialize(): Promise<void>;
    /**
     * Register a workflow definition
     */
    registerWorkflow(workflow: WorkflowDefinition): Promise<void>;
    /**
     * Start a workflow execution
     */
    executeWorkflow(workflowId: string, context: WorkflowContext, priority?: 'low' | 'medium' | 'high' | 'critical'): Promise<string>;
    /**
     * Get workflow execution status
     */
    getExecutionStatus(executionId: string): Promise<WorkflowExecution | null>;
    /**
     * Cancel a workflow execution
     */
    cancelExecution(executionId: string, reason: string): Promise<void>;
    /**
     * List workflows with optional filtering
     */
    listWorkflows(filters?: {
        category?: string;
        tags?: string[];
        enabled?: boolean;
    }): Promise<WorkflowDefinition[]>;
    /**
     * Get workflow execution metrics
     */
    getExecutionMetrics(timeframe?: '1h' | '24h' | '7d' | '30d'): Promise<{
        totalExecutions: number;
        successRate: number;
        averageExecutionTime: number;
        statusDistribution: Record<string, number>;
        workflowDistribution: Record<string, number>;
        errorTypes: Record<string, number>;
    }>;
    /**
     * Private methods
     */
    private validateWorkflowDefinition;
    private queueExecution;
    private getPriorityNumber;
    private startExecutionProcessor;
    private processExecution;
    private executeStep;
    private executeStepByType;
    private executeAgentTask;
    private executeConditionStep;
    private executeApprovalStep;
    private executeDelayStep;
    private evaluateCondition;
    private getVariableValue;
    private prepareStepInput;
    private categorizeError;
    private setupEventHandlers;
}
//# sourceMappingURL=WorkflowEngine.d.ts.map