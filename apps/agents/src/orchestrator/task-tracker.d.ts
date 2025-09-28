import { EventEmitter } from 'events';
export interface Task {
    id: string;
    workflowRunId?: string;
    agentId: string;
    type: string;
    status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
    input: Record<string, any>;
    output?: Record<string, any>;
    error?: string;
    metadata: {
        priority: 'low' | 'normal' | 'high' | 'urgent';
        createdAt: Date;
        startedAt?: Date;
        completedAt?: Date;
        retryCount: number;
        maxRetries: number;
        timeoutMs?: number;
    };
}
export interface TaskMetrics {
    totalTasks: number;
    pendingTasks: number;
    runningTasks: number;
    completedTasks: number;
    failedTasks: number;
    averageExecutionTime: number;
    successRate: number;
}
export declare class TaskTracker extends EventEmitter {
    private tasks;
    private tasksByWorkflow;
    private tasksByAgent;
    private taskHistory;
    private maxHistorySize;
    constructor();
    createTask(agentId: string, type: string, input: Record<string, any>, options?: {
        workflowRunId?: string;
        priority?: 'low' | 'normal' | 'high' | 'urgent';
        maxRetries?: number;
        timeoutMs?: number;
    }): string;
    updateTaskStatus(taskId: string, status: Task['status'], data?: {
        output?: Record<string, any>;
        error?: string;
    }): void;
    getTask(taskId: string): Task | undefined;
    getTasksByStatus(status: Task['status']): Task[];
    getTasksByAgent(agentId: string): Task[];
    getTasksByWorkflow(workflowRunId: string): Task[];
    getPendingTasksByPriority(): Task[];
    retryTask(taskId: string): boolean;
    cancelTask(taskId: string): boolean;
    getMetrics(): TaskMetrics;
    private moveTaskToHistory;
    private cleanupOldTasks;
}
//# sourceMappingURL=task-tracker.d.ts.map