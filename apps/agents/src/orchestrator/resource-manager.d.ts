import { EventEmitter } from 'events';
export interface ResourceLimits {
    maxConcurrentTasks: number;
    maxMemoryUsageMB: number;
    maxCpuUsagePercent: number;
    maxDiskUsageGB: number;
    maxNetworkBandwidthMbps?: number;
}
export interface ResourceUsage {
    concurrentTasks: number;
    memoryUsageMB: number;
    cpuUsagePercent: number;
    diskUsageGB: number;
    networkBandwidthMbps: number;
    timestamp: Date;
}
export interface ResourceAllocation {
    agentId: string;
    taskId: string;
    allocatedAt: Date;
    resources: {
        memoryMB: number;
        cpuCores?: number;
        diskGB?: number;
    };
}
export declare class ResourceManager extends EventEmitter {
    private limits;
    private currentUsage;
    private allocations;
    private monitoringInterval?;
    constructor(limits: ResourceLimits);
    allocateResources(agentId: string, taskId: string, requiredResources: {
        memoryMB: number;
        cpuCores?: number;
        diskGB?: number;
    }): Promise<boolean>;
    deallocateResources(taskId: string): void;
    canAllocateResources(requiredResources: {
        memoryMB: number;
        cpuCores?: number;
        diskGB?: number;
    }): boolean;
    getCurrentUsage(): ResourceUsage;
    getLimits(): ResourceLimits;
    getResourceUtilization(): {
        memory: number;
        cpu: number;
        disk: number;
        concurrentTasks: number;
    };
    getAllocations(): ResourceAllocation[];
    getAllocationByTask(taskId: string): ResourceAllocation | undefined;
    getAllocationsByAgent(agentId: string): ResourceAllocation[];
    updateLimits(newLimits: Partial<ResourceLimits>): void;
    private startMonitoring;
    private updateSystemMetrics;
    stop(): void;
    getRecommendedAllocation(agentType: string): {
        memoryMB: number;
        cpuCores?: number;
        diskGB?: number;
    };
}
//# sourceMappingURL=resource-manager.d.ts.map