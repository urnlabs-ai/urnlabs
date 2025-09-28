import pino from 'pino';
export declare const logger: import("pino").Logger<never>;
export declare const createAgentLogger: (agentId: string, workflowId?: string, taskId?: string) => pino.Logger<never>;
export declare const createWorkflowLogger: (workflowId: string, workflowRunId: string) => pino.Logger<never>;
export declare const createQueueLogger: (queueName: string, jobId?: string) => pino.Logger<never>;
export declare const logAgentPerformance: (agentId: string, operation: string, duration: number, metadata?: Record<string, unknown>) => void;
export declare const logWorkflowExecution: (workflowId: string, runId: string, status: string, duration?: number, error?: string) => void;
export declare const logAgentCommunication: (fromAgent: string, toAgent: string, message: string, data?: Record<string, unknown>) => void;
export declare const logQueueOperation: (operation: string, queueName: string, jobId: string, status: string, duration?: number, error?: string) => void;
export declare const logResourceUsage: (component: string, memoryUsage: number, cpuUsage?: number, customMetrics?: Record<string, number>) => void;
export declare const logModelInteraction: (agentId: string, model: string, prompt: string, response: string, tokens: {
    input: number;
    output: number;
}, duration: number, cost?: number) => void;
export declare const logAgentError: (agentId: string, error: Error, context?: Record<string, unknown>) => void;
export declare const logSecurityEvent: (event: string, severity: "low" | "medium" | "high" | "critical", agentId?: string, details?: Record<string, unknown>) => void;
//# sourceMappingURL=logger.d.ts.map