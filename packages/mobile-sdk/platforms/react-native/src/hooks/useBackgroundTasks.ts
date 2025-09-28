/**
 * Background task management hook for React Native
 * Handles background sync, data refresh, and long-running operations
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { AppState, Platform } from 'react-native';
import BackgroundJob from 'react-native-background-job';
import { useUrnlabsSDK } from './useUrnlabsSDK';
import { useOfflineData } from './useOfflineData';

export interface BackgroundTask {
  id: string;
  name: string;
  type: 'sync' | 'upload' | 'download' | 'analytics' | 'custom';
  priority: 'low' | 'normal' | 'high';
  interval?: number; // in milliseconds
  maxRetries: number;
  retryCount: number;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  startTime?: number;
  endTime?: number;
  error?: string;
  progress?: number;
}

export interface BackgroundTaskOptions {
  interval?: number;
  maxRetries?: number;
  priority?: 'low' | 'normal' | 'high';
  runOnAppBackground?: boolean;
  runOnAppForeground?: boolean;
  requiresNetwork?: boolean;
}

export interface BackgroundSyncConfig {
  enabled: boolean;
  interval: number; // in milliseconds
  maxBatchSize: number;
  retryFailedOperations: boolean;
  syncOnAppForeground: boolean;
  syncOnNetworkReconnect: boolean;
}

/**
 * Background tasks management hook
 */
export function useBackgroundTasks() {
  const { sdk } = useUrnlabsSDK();
  const { syncData, isOnline, pendingOperationsCount } = useOfflineData();
  const [tasks, setTasks] = useState<Map<string, BackgroundTask>>(new Map());
  const [isBackgroundMode, setIsBackgroundMode] = useState(false);
  const [backgroundSyncConfig, setBackgroundSyncConfig] = useState<BackgroundSyncConfig>({
    enabled: true,
    interval: 5 * 60 * 1000, // 5 minutes
    maxBatchSize: 50,
    retryFailedOperations: true,
    syncOnAppForeground: true,
    syncOnNetworkReconnect: true
  });

  const backgroundJobRef = useRef<any>(null);
  const intervalsRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const appStateRef = useRef(AppState.currentState);

  // Generate unique task ID
  const generateTaskId = useCallback(() => {
    return `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }, []);

  // Update task
  const updateTask = useCallback((taskId: string, update: Partial<BackgroundTask>) => {
    setTasks(prev => {
      const newMap = new Map(prev);
      const current = newMap.get(taskId);
      if (current) {
        newMap.set(taskId, { ...current, ...update });
      }
      return newMap;
    });
  }, []);

  // Register background task
  const registerTask = useCallback((
    name: string,
    taskFn: () => Promise<void>,
    options: BackgroundTaskOptions = {}
  ): string => {
    const taskId = generateTaskId();
    const task: BackgroundTask = {
      id: taskId,
      name,
      type: 'custom',
      priority: options.priority || 'normal',
      interval: options.interval,
      maxRetries: options.maxRetries || 3,
      retryCount: 0,
      status: 'pending'
    };

    setTasks(prev => new Map(prev).set(taskId, task));

    // Setup interval if specified
    if (options.interval) {
      const intervalId = setInterval(async () => {
        const currentTask = tasks.get(taskId);
        if (!currentTask || currentTask.status === 'cancelled') {
          return;
        }

        // Check conditions
        if (options.requiresNetwork && !isOnline) {
          return;
        }

        if (options.runOnAppBackground && !isBackgroundMode) {
          return;
        }

        if (options.runOnAppForeground && isBackgroundMode) {
          return;
        }

        await executeTask(taskId, taskFn);
      }, options.interval);

      intervalsRef.current.set(taskId, intervalId);
    }

    return taskId;
  }, [generateTaskId, tasks, isOnline, isBackgroundMode]);

  // Execute task
  const executeTask = useCallback(async (taskId: string, taskFn: () => Promise<void>) => {
    const task = tasks.get(taskId);
    if (!task || task.status === 'running' || task.status === 'cancelled') {
      return;
    }

    updateTask(taskId, {
      status: 'running',
      startTime: Date.now(),
      error: undefined
    });

    try {
      await taskFn();

      updateTask(taskId, {
        status: 'completed',
        endTime: Date.now(),
        progress: 100
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Task execution failed';
      const currentTask = tasks.get(taskId);

      if (currentTask && currentTask.retryCount < currentTask.maxRetries) {
        // Retry task
        updateTask(taskId, {
          retryCount: currentTask.retryCount + 1,
          status: 'pending',
          error: errorMessage
        });

        // Schedule retry with exponential backoff
        const retryDelay = Math.min(1000 * Math.pow(2, currentTask.retryCount), 30000);
        setTimeout(() => executeTask(taskId, taskFn), retryDelay);
      } else {
        // Mark as failed
        updateTask(taskId, {
          status: 'failed',
          endTime: Date.now(),
          error: errorMessage
        });
      }
    }
  }, [tasks, updateTask]);

  // Cancel task
  const cancelTask = useCallback((taskId: string) => {
    updateTask(taskId, { status: 'cancelled' });

    // Clear interval if exists
    const intervalId = intervalsRef.current.get(taskId);
    if (intervalId) {
      clearInterval(intervalId);
      intervalsRef.current.delete(taskId);
    }
  }, [updateTask]);

  // Remove task
  const removeTask = useCallback((taskId: string) => {
    cancelTask(taskId);
    setTasks(prev => {
      const newMap = new Map(prev);
      newMap.delete(taskId);
      return newMap;
    });
  }, [cancelTask]);

  // Start background sync
  const startBackgroundSync = useCallback(() => {
    if (!backgroundSyncConfig.enabled) {
      return;
    }

    const syncTaskId = registerTask(
      'Background Sync',
      async () => {
        if (pendingOperationsCount > 0) {
          await syncData();
        }

        // Additional background operations
        await sdk.analytics?.flush?.();
        await sdk.telemetry?.send?.();
      },
      {
        interval: backgroundSyncConfig.interval,
        priority: 'normal',
        requiresNetwork: true,
        runOnAppBackground: true
      }
    );

    return syncTaskId;
  }, [backgroundSyncConfig, pendingOperationsCount, syncData, sdk, registerTask]);

  // Stop background sync
  const stopBackgroundSync = useCallback(() => {
    // Cancel all sync tasks
    Array.from(tasks.values())
      .filter(task => task.name === 'Background Sync')
      .forEach(task => cancelTask(task.id));
  }, [tasks, cancelTask]);

  // Start background job (Platform specific)
  const startBackgroundJob = useCallback(() => {
    if (Platform.OS === 'android' && !backgroundJobRef.current) {
      BackgroundJob.start({
        jobKey: 'urnlabs_background_sync',
        period: backgroundSyncConfig.interval,
        requiredNetworkType: 'unmetered', // WiFi only for background sync

        onSuccess: () => {
          console.log('Background job executed successfully');
        },

        onError: (error: any) => {
          console.error('Background job failed:', error);
        }
      });

      backgroundJobRef.current = true;
    }
  }, [backgroundSyncConfig.interval]);

  // Stop background job
  const stopBackgroundJob = useCallback(() => {
    if (Platform.OS === 'android' && backgroundJobRef.current) {
      BackgroundJob.stop({
        jobKey: 'urnlabs_background_sync'
      });

      backgroundJobRef.current = null;
    }
  }, []);

  // Handle app state changes
  const handleAppStateChange = useCallback((nextAppState: string) => {
    const isGoingToBackground = appStateRef.current.match(/active|foreground/) && nextAppState === 'background';
    const isComingToForeground = appStateRef.current === 'background' && nextAppState === 'active';

    appStateRef.current = nextAppState;
    setIsBackgroundMode(nextAppState === 'background');

    if (isGoingToBackground) {
      startBackgroundJob();
    } else if (isComingToForeground) {
      stopBackgroundJob();

      // Trigger foreground sync if enabled
      if (backgroundSyncConfig.syncOnAppForeground && pendingOperationsCount > 0) {
        setTimeout(() => syncData(), 1000);
      }
    }
  }, [startBackgroundJob, stopBackgroundJob, backgroundSyncConfig.syncOnAppForeground, pendingOperationsCount, syncData]);

  // Cleanup all tasks
  const clearAllTasks = useCallback(() => {
    // Cancel all running tasks
    Array.from(tasks.values()).forEach(task => {
      if (task.status === 'running' || task.status === 'pending') {
        cancelTask(task.id);
      }
    });

    // Clear all intervals
    intervalsRef.current.forEach(intervalId => clearInterval(intervalId));
    intervalsRef.current.clear();

    // Clear tasks
    setTasks(new Map());
  }, [tasks, cancelTask]);

  // Get tasks by status
  const getTasksByStatus = useCallback((status: BackgroundTask['status']) => {
    return Array.from(tasks.values()).filter(task => task.status === status);
  }, [tasks]);

  // Setup app state listener
  useEffect(() => {
    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription?.remove();
  }, [handleAppStateChange]);

  // Start background sync on mount
  useEffect(() => {
    if (backgroundSyncConfig.enabled) {
      startBackgroundSync();
    }

    return () => {
      stopBackgroundSync();
      stopBackgroundJob();
    };
  }, [backgroundSyncConfig.enabled, startBackgroundSync, stopBackgroundSync, stopBackgroundJob]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearAllTasks();
      stopBackgroundJob();
    };
  }, [clearAllTasks, stopBackgroundJob]);

  return {
    // Task management
    tasks: Array.from(tasks.values()),
    registerTask,
    executeTask,
    cancelTask,
    removeTask,
    clearAllTasks,

    // Task queries
    getTasksByStatus,
    runningTasks: getTasksByStatus('running'),
    pendingTasks: getTasksByStatus('pending'),
    completedTasks: getTasksByStatus('completed'),
    failedTasks: getTasksByStatus('failed'),

    // Background sync
    backgroundSyncConfig,
    setBackgroundSyncConfig,
    startBackgroundSync,
    stopBackgroundSync,

    // Background job
    startBackgroundJob,
    stopBackgroundJob,

    // State
    isBackgroundMode,
    hasActiveTasks: Array.from(tasks.values()).some(task =>
      task.status === 'running' || task.status === 'pending'
    )
  };
}