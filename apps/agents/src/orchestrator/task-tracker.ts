import { EventEmitter } from 'events';
import { logger } from '@/lib/logger.js';

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

export class TaskTracker extends EventEmitter {
  private tasks: Map<string, Task> = new Map();
  private tasksByWorkflow: Map<string, Set<string>> = new Map();
  private tasksByAgent: Map<string, Set<string>> = new Map();
  private taskHistory: Task[] = [];
  private maxHistorySize = 1000;

  constructor() {
    super();
    
    // Clean up completed tasks periodically
    setInterval(() => {
      this.cleanupOldTasks();
    }, 60000); // Every minute
  }

  createTask(
    agentId: string,
    type: string,
    input: Record<string, any>,
    options: {
      workflowRunId?: string;
      priority?: 'low' | 'normal' | 'high' | 'urgent';
      maxRetries?: number;
      timeoutMs?: number;
    } = {}
  ): string {
    const taskId = `task_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    
    const task: Task = {
      id: taskId,
      workflowRunId: options.workflowRunId,
      agentId,
      type,
      status: 'pending',
      input,
      metadata: {
        priority: options.priority || 'normal',
        createdAt: new Date(),
        retryCount: 0,
        maxRetries: options.maxRetries || 3,
        timeoutMs: options.timeoutMs,
      },
    };

    this.tasks.set(taskId, task);

    // Index by workflow
    if (options.workflowRunId) {
      if (!this.tasksByWorkflow.has(options.workflowRunId)) {
        this.tasksByWorkflow.set(options.workflowRunId, new Set());
      }
      this.tasksByWorkflow.get(options.workflowRunId)!.add(taskId);
    }

    // Index by agent
    if (!this.tasksByAgent.has(agentId)) {
      this.tasksByAgent.set(agentId, new Set());
    }
    this.tasksByAgent.get(agentId)!.add(taskId);

    this.emit('task:created', { taskId, task });
    
    logger.info({
      taskId,
      agentId,
      type,
      priority: task.metadata.priority,
      workflowRunId: options.workflowRunId,
    }, 'Task created');

    return taskId;
  }

  updateTaskStatus(
    taskId: string,
    status: Task['status'],
    data: {
      output?: Record<string, any>;
      error?: string;
    } = {}
  ): void {
    const task = this.tasks.get(taskId);
    
    if (!task) {
      logger.warn({ taskId }, 'Attempted to update non-existent task');
      return;
    }

    const oldStatus = task.status;
    task.status = status;

    if (status === 'running' && !task.metadata.startedAt) {
      task.metadata.startedAt = new Date();
    }

    if (status === 'completed' || status === 'failed' || status === 'cancelled') {
      task.metadata.completedAt = new Date();
      
      if (data.output) {
        task.output = data.output;
      }
      
      if (data.error) {
        task.error = data.error;
      }

      // Move to history
      this.moveTaskToHistory(task);
    }

    this.emit('task:status_changed', {
      taskId,
      oldStatus,
      newStatus: status,
      task,
    });

    logger.debug({
      taskId,
      oldStatus,
      newStatus: status,
      agentId: task.agentId,
    }, 'Task status updated');
  }

  getTask(taskId: string): Task | undefined {
    return this.tasks.get(taskId);
  }

  getTasksByStatus(status: Task['status']): Task[] {
    return Array.from(this.tasks.values()).filter(task => task.status === status);
  }

  getTasksByAgent(agentId: string): Task[] {
    const taskIds = this.tasksByAgent.get(agentId) || new Set();
    return Array.from(taskIds)
      .map(id => this.tasks.get(id))
      .filter((task): task is Task => task !== undefined);
  }

  getTasksByWorkflow(workflowRunId: string): Task[] {
    const taskIds = this.tasksByWorkflow.get(workflowRunId) || new Set();
    return Array.from(taskIds)
      .map(id => this.tasks.get(id))
      .filter((task): task is Task => task !== undefined);
  }

  getPendingTasksByPriority(): Task[] {
    const pendingTasks = this.getTasksByStatus('pending');
    
    // Sort by priority (urgent > high > normal > low) and creation time
    return pendingTasks.sort((a, b) => {
      const priorityOrder = { urgent: 4, high: 3, normal: 2, low: 1 };
      const priorityDiff = priorityOrder[b.metadata.priority] - priorityOrder[a.metadata.priority];
      
      if (priorityDiff !== 0) {
        return priorityDiff;
      }
      
      return a.metadata.createdAt.getTime() - b.metadata.createdAt.getTime();
    });
  }

  retryTask(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    
    if (!task) {
      return false;
    }

    if (task.status !== 'failed') {
      return false;
    }

    if (task.metadata.retryCount >= task.metadata.maxRetries) {
      logger.warn({ taskId }, 'Task exceeded maximum retry attempts');
      return false;
    }

    task.metadata.retryCount++;
    task.status = 'pending';
    task.error = undefined;
    task.output = undefined;
    task.metadata.startedAt = undefined;
    task.metadata.completedAt = undefined;

    this.emit('task:retried', { taskId, retryCount: task.metadata.retryCount });
    
    logger.info({
      taskId,
      retryCount: task.metadata.retryCount,
      maxRetries: task.metadata.maxRetries,
    }, 'Task queued for retry');

    return true;
  }

  cancelTask(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    
    if (!task) {
      return false;
    }

    if (task.status === 'completed' || task.status === 'failed' || task.status === 'cancelled') {
      return false;
    }

    this.updateTaskStatus(taskId, 'cancelled');
    return true;
  }

  getMetrics(): TaskMetrics {
    const allTasks = Array.from(this.tasks.values()).concat(this.taskHistory);
    
    const totalTasks = allTasks.length;
    const pendingTasks = allTasks.filter(t => t.status === 'pending').length;
    const runningTasks = allTasks.filter(t => t.status === 'running').length;
    const completedTasks = allTasks.filter(t => t.status === 'completed').length;
    const failedTasks = allTasks.filter(t => t.status === 'failed').length;

    // Calculate average execution time for completed tasks
    const completedTasksWithTiming = allTasks.filter(
      t => t.status === 'completed' && t.metadata.startedAt && t.metadata.completedAt
    );
    
    const averageExecutionTime = completedTasksWithTiming.length > 0
      ? completedTasksWithTiming.reduce((sum, task) => {
          const duration = task.metadata.completedAt!.getTime() - task.metadata.startedAt!.getTime();
          return sum + duration;
        }, 0) / completedTasksWithTiming.length
      : 0;

    const finishedTasks = completedTasks + failedTasks;
    const successRate = finishedTasks > 0 ? (completedTasks / finishedTasks) * 100 : 0;

    return {
      totalTasks,
      pendingTasks,
      runningTasks,
      completedTasks,
      failedTasks,
      averageExecutionTime,
      successRate,
    };
  }

  private moveTaskToHistory(task: Task): void {
    // Remove from active tasks
    this.tasks.delete(task.id);
    
    // Remove from indexes
    if (task.workflowRunId) {
      this.tasksByWorkflow.get(task.workflowRunId)?.delete(task.id);
    }
    this.tasksByAgent.get(task.agentId)?.delete(task.id);
    
    // Add to history
    this.taskHistory.unshift({ ...task });
    
    // Keep history size manageable
    if (this.taskHistory.length > this.maxHistorySize) {
      this.taskHistory = this.taskHistory.slice(0, this.maxHistorySize);
    }
  }

  private cleanupOldTasks(): void {
    const cutoffTime = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours ago
    
    let cleanedCount = 0;
    
    for (const [taskId, task] of this.tasks.entries()) {
      if (
        (task.status === 'completed' || task.status === 'failed' || task.status === 'cancelled') &&
        task.metadata.completedAt &&
        task.metadata.completedAt < cutoffTime
      ) {
        this.moveTaskToHistory(task);
        cleanedCount++;
      }
    }
    
    if (cleanedCount > 0) {
      logger.debug({ cleanedCount }, 'Cleaned up old completed tasks');
    }
  }
}