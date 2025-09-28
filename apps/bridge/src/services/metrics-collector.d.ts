import Redis from 'ioredis';
export interface TaskMetrics {
    agentType: string;
    success: boolean;
    duration: number;
    timestamp: number;
}
export interface SystemMetrics {
    totalTasks: number;
    successfulTasks: number;
    failedTasks: number;
    averageResponseTime: number;
    agentUsage: Record<string, number>;
    errorRate: number;
    tasksPerMinute: number;
    lastUpdated: string;
}
export declare class MetricsCollector {
    private redis;
    private metricsKeyPrefix;
    constructor(redis: Redis);
    /**
     * Record task execution metrics
     */
    recordTaskExecution(agentType: string, success: boolean, duration: number): Promise<void>;
    /**
     * Get comprehensive system metrics
     */
    getMetrics(): Promise<SystemMetrics>;
    /**
     * Get metrics for a specific time range
     */
    getMetricsInRange(startTime: number, endTime: number): Promise<TaskMetrics[]>;
    /**
     * Get agent performance statistics
     */
    getAgentStats(agentType: string): Promise<{
        totalTasks: number;
        successRate: number;
        averageResponseTime: number;
        lastUsed: string | null;
    }>;
    /**
     * Reset all metrics (useful for testing or maintenance)
     */
    resetMetrics(): Promise<void>;
    /**
     * Get real-time system health based on metrics
     */
    getSystemHealth(): Promise<{
        status: 'healthy' | 'degraded' | 'unhealthy';
        score: number;
        reasons: string[];
    }>;
}
//# sourceMappingURL=metrics-collector.d.ts.map