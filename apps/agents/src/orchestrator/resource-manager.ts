import { EventEmitter } from 'events';
import { logger } from '@/lib/logger.js';

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

export class ResourceManager extends EventEmitter {
  private limits: ResourceLimits;
  private currentUsage: ResourceUsage;
  private allocations: Map<string, ResourceAllocation> = new Map();
  private monitoringInterval?: NodeJS.Timeout;

  constructor(limits: ResourceLimits) {
    super();
    this.limits = limits;
    this.currentUsage = {
      concurrentTasks: 0,
      memoryUsageMB: 0,
      cpuUsagePercent: 0,
      diskUsageGB: 0,
      networkBandwidthMbps: 0,
      timestamp: new Date(),
    };

    this.startMonitoring();
  }

  async allocateResources(
    agentId: string,
    taskId: string,
    requiredResources: {
      memoryMB: number;
      cpuCores?: number;
      diskGB?: number;
    }
  ): Promise<boolean> {
    // Check if resources are available
    if (!this.canAllocateResources(requiredResources)) {
      logger.warn({
        agentId,
        taskId,
        requiredResources,
        currentUsage: this.currentUsage,
        limits: this.limits,
      }, 'Insufficient resources for allocation');
      
      this.emit('resource:allocation_failed', {
        agentId,
        taskId,
        requiredResources,
        reason: 'insufficient_resources',
      });
      
      return false;
    }

    // Check concurrent task limit
    if (this.currentUsage.concurrentTasks >= this.limits.maxConcurrentTasks) {
      logger.warn({
        agentId,
        taskId,
        concurrentTasks: this.currentUsage.concurrentTasks,
        maxConcurrentTasks: this.limits.maxConcurrentTasks,
      }, 'Maximum concurrent tasks reached');
      
      this.emit('resource:allocation_failed', {
        agentId,
        taskId,
        requiredResources,
        reason: 'max_concurrent_tasks_reached',
      });
      
      return false;
    }

    // Allocate resources
    const allocation: ResourceAllocation = {
      agentId,
      taskId,
      allocatedAt: new Date(),
      resources: requiredResources,
    };

    this.allocations.set(taskId, allocation);
    
    // Update current usage
    this.currentUsage.concurrentTasks++;
    this.currentUsage.memoryUsageMB += requiredResources.memoryMB;
    
    if (requiredResources.diskGB) {
      this.currentUsage.diskUsageGB += requiredResources.diskGB;
    }

    logger.info({
      agentId,
      taskId,
      allocatedResources: requiredResources,
      totalAllocations: this.allocations.size,
    }, 'Resources allocated');

    this.emit('resource:allocated', {
      agentId,
      taskId,
      allocation,
      currentUsage: this.currentUsage,
    });

    return true;
  }

  deallocateResources(taskId: string): void {
    const allocation = this.allocations.get(taskId);
    
    if (!allocation) {
      logger.warn({ taskId }, 'Attempted to deallocate non-existent resource allocation');
      return;
    }

    // Update current usage
    this.currentUsage.concurrentTasks = Math.max(0, this.currentUsage.concurrentTasks - 1);
    this.currentUsage.memoryUsageMB = Math.max(0, this.currentUsage.memoryUsageMB - allocation.resources.memoryMB);
    
    if (allocation.resources.diskGB) {
      this.currentUsage.diskUsageGB = Math.max(0, this.currentUsage.diskUsageGB - allocation.resources.diskGB);
    }

    this.allocations.delete(taskId);

    logger.info({
      agentId: allocation.agentId,
      taskId,
      deallocatedResources: allocation.resources,
      totalAllocations: this.allocations.size,
    }, 'Resources deallocated');

    this.emit('resource:deallocated', {
      agentId: allocation.agentId,
      taskId,
      allocation,
      currentUsage: this.currentUsage,
    });
  }

  canAllocateResources(requiredResources: {
    memoryMB: number;
    cpuCores?: number;
    diskGB?: number;
  }): boolean {
    // Check memory limit
    if (this.currentUsage.memoryUsageMB + requiredResources.memoryMB > this.limits.maxMemoryUsageMB) {
      return false;
    }

    // Check disk limit
    if (requiredResources.diskGB) {
      if (this.currentUsage.diskUsageGB + requiredResources.diskGB > this.limits.maxDiskUsageGB) {
        return false;
      }
    }

    // Check CPU usage (approximate)
    if (this.currentUsage.cpuUsagePercent > this.limits.maxCpuUsagePercent * 0.9) {
      return false;
    }

    return true;
  }

  getCurrentUsage(): ResourceUsage {
    return { ...this.currentUsage };
  }

  getLimits(): ResourceLimits {
    return { ...this.limits };
  }

  getResourceUtilization(): {
    memory: number;
    cpu: number;
    disk: number;
    concurrentTasks: number;
  } {
    return {
      memory: (this.currentUsage.memoryUsageMB / this.limits.maxMemoryUsageMB) * 100,
      cpu: (this.currentUsage.cpuUsagePercent / this.limits.maxCpuUsagePercent) * 100,
      disk: (this.currentUsage.diskUsageGB / this.limits.maxDiskUsageGB) * 100,
      concurrentTasks: (this.currentUsage.concurrentTasks / this.limits.maxConcurrentTasks) * 100,
    };
  }

  getAllocations(): ResourceAllocation[] {
    return Array.from(this.allocations.values());
  }

  getAllocationByTask(taskId: string): ResourceAllocation | undefined {
    return this.allocations.get(taskId);
  }

  getAllocationsByAgent(agentId: string): ResourceAllocation[] {
    return Array.from(this.allocations.values())
      .filter(allocation => allocation.agentId === agentId);
  }

  updateLimits(newLimits: Partial<ResourceLimits>): void {
    const oldLimits = { ...this.limits };
    this.limits = { ...this.limits, ...newLimits };

    logger.info({
      oldLimits,
      newLimits: this.limits,
    }, 'Resource limits updated');

    this.emit('resource:limits_updated', {
      oldLimits,
      newLimits: this.limits,
    });
  }

  private startMonitoring(): void {
    // Monitor system resources every 10 seconds
    this.monitoringInterval = setInterval(() => {
      this.updateSystemMetrics();
    }, 10000);

    logger.info('Resource monitoring started');
  }

  private async updateSystemMetrics(): Promise<void> {
    try {
      // Update memory usage from Node.js process
      const memUsage = process.memoryUsage();
      const systemMemoryMB = memUsage.heapUsed / 1024 / 1024;

      // Update CPU usage (simplified - in production, use proper system monitoring)
      const cpuUsage = process.cpuUsage();
      const cpuPercent = ((cpuUsage.user + cpuUsage.system) / 1000000) * 100;

      // Update current usage
      this.currentUsage = {
        ...this.currentUsage,
        memoryUsageMB: Math.max(this.currentUsage.memoryUsageMB, systemMemoryMB),
        cpuUsagePercent: cpuPercent,
        timestamp: new Date(),
      };

      // Check for resource warnings
      const utilization = this.getResourceUtilization();
      
      if (utilization.memory > 80) {
        this.emit('resource:warning', {
          type: 'memory',
          utilization: utilization.memory,
          message: 'High memory usage detected',
        });
      }

      if (utilization.cpu > 80) {
        this.emit('resource:warning', {
          type: 'cpu',
          utilization: utilization.cpu,
          message: 'High CPU usage detected',
        });
      }

      if (utilization.concurrentTasks > 80) {
        this.emit('resource:warning', {
          type: 'concurrent_tasks',
          utilization: utilization.concurrentTasks,
          message: 'High concurrent task count',
        });
      }

    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : 'Unknown error',
      }, 'Failed to update system metrics');
    }
  }

  stop(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = undefined;
    }

    logger.info('Resource monitoring stopped');
  }

  // Get recommended resource allocation for different agent types
  getRecommendedAllocation(agentType: string): {
    memoryMB: number;
    cpuCores?: number;
    diskGB?: number;
  } {
    const recommendations: Record<string, any> = {
      'code-reviewer': { memoryMB: 256, cpuCores: 1, diskGB: 1 },
      'architecture-agent': { memoryMB: 512, cpuCores: 2, diskGB: 2 },
      'deployment-agent': { memoryMB: 1024, cpuCores: 2, diskGB: 5 },
      'testing-agent': { memoryMB: 512, cpuCores: 1, diskGB: 2 },
      'default': { memoryMB: 256, cpuCores: 1, diskGB: 1 },
    };

    return recommendations[agentType] || recommendations.default;
  }
}