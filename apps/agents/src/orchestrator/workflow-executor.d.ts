import { PrismaClient } from '@prisma/client';
import { EventEmitter } from 'events';
import { AgentFactory } from '@/agents/agent-factory.js';
export interface WorkflowStep {
    id: string;
    workflowId: string;
    agentId: string;
    name: string;
    description: string;
    order: number;
    config: Record<string, any>;
    dependsOn?: string[];
}
export interface WorkflowExecution {
    id: string;
    workflowId: string;
    status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
    input: Record<string, any>;
    output?: Record<string, any>;
    error?: string;
    startedAt?: Date;
    completedAt?: Date;
    steps: WorkflowStepExecution[];
}
export interface WorkflowStepExecution {
    id: string;
    stepId: string;
    status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
    input?: Record<string, any>;
    output?: Record<string, any>;
    error?: string;
    startedAt?: Date;
    completedAt?: Date;
}
export declare class WorkflowExecutor extends EventEmitter {
    private prisma;
    private agentFactory;
    private executions;
    constructor(prisma: PrismaClient, agentFactory: AgentFactory);
    executeWorkflow(workflowId: string, input: Record<string, any>): Promise<string>;
    private runWorkflow;
    getExecution(executionId: string): WorkflowExecution | undefined;
    getAllExecutions(): WorkflowExecution[];
    cancelExecution(executionId: string): Promise<boolean>;
}
//# sourceMappingURL=workflow-executor.d.ts.map