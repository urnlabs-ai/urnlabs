import pino from 'pino';
export declare const logger: import("pino").Logger<never>;
export declare const createRequestLogger: (requestId: string, method: string, url: string) => pino.Logger<never>;
export declare const createUserLogger: (userId: string) => pino.Logger<never>;
export declare const createAgentLogger: (agentId: string, workflowId?: string) => pino.Logger<never>;
export declare const logPerformance: (operation: string, duration: number, metadata?: Record<string, unknown>) => void;
export declare const logError: (error: Error, context?: Record<string, unknown>) => void;
export declare const logSecurityEvent: (event: string, severity: "low" | "medium" | "high" | "critical", details: Record<string, unknown>) => void;
export declare const logBusinessMetric: (metric: string, value: number, unit: string, tags?: Record<string, string>) => void;
//# sourceMappingURL=logger.d.ts.map