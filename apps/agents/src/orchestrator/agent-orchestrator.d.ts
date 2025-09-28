import { PrismaClient } from '@prisma/client';
import { EventEmitter } from 'events';
import { QueueManager } from '@/queue/queue-manager.js';
import { WebSocketManager } from '@/lib/websocket-manager.js';
export interface WorkflowExecutionRequest {
    workflowId: string;
    userId: string;
    organizationId: string;
    input?: Record<string, any>;
    priority?: 'low' | 'normal' | 'high' | 'urgent';
    metadata?: Record<string, any>;
}
export interface TaskExecutionContext {
    workflowRunId: string;
    taskExecutionId: string;
    agentId: string;
    stepConfig: any;
    input: any;
    previousOutputs: Record<string, any>;
    organizationId: string;
}
export declare class AgentOrchestrator extends EventEmitter {
    private prisma;
    private queueManager;
    private wsManager;
    private agentFactory;
    private workflowExecutor;
    private taskTracker;
    private resourceManager;
    private isInitialized;
    private runningWorkflows;
    constructor(prisma: PrismaClient, queueManager: QueueManager, wsManager: WebSocketManager);
    initialize(): Promise<void>;
    shutdown(): Promise<void>;
    executeWorkflow(request: WorkflowExecutionRequest): Promise<string>;
    cancelWorkflow(workflowRunId: string): Promise<void>;
    getWorkflowStatus(workflowRunId: string): Promise<any>;
    executeTask(context: TaskExecutionContext): Promise<any>;
    private executeWorkflowAsync;
    private setupEventListeners;
    private loadActiveWorkflows;
}
//# sourceMappingURL=agent-orchestrator.d.ts.map