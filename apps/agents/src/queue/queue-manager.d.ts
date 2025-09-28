import { EventEmitter } from 'events';
import { TaskExecutionContext } from '@/orchestrator/agent-orchestrator.js';
export interface TaskJob {
    context: TaskExecutionContext;
    retryCount?: number;
    priority?: number;
}
export declare class QueueManager extends EventEmitter {
    private redis;
    private taskQueue;
    private taskWorker;
    private orchestrator;
    constructor(redisUrl: string);
    setOrchestrator(orchestrator: any): void;
    startProcessing(): Promise<void>;
    shutdown(): Promise<void>;
    addTask(context: TaskExecutionContext, priority?: number): Promise<string>;
    getQueueStats(): Promise<any>;
    getJobStatus(jobId: string): Promise<any>;
    retryFailedJobs(): Promise<number>;
    cleanQueue(maxAge?: number): Promise<void>;
    private processTask;
    private setupEventListeners;
}
//# sourceMappingURL=queue-manager.d.ts.map