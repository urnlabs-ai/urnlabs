/**
 * Enhanced offline data management hooks for React Native
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { AppState } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { OfflineStorageManager, SyncResult, OfflineOperation } from '../storage/OfflineStorageManager';
import { useUrnlabsSDK } from './useUrnlabsSDK';

export interface OfflineHookConfig {
  autoSync: boolean;
  syncOnAppForeground: boolean;
  syncOnNetworkReconnect: boolean;
  syncInterval?: number; // in milliseconds
}

export interface OfflineState {
  isOnline: boolean;
  isSyncing: boolean;
  pendingOperationsCount: number;
  lastSyncTime: number | null;
  syncError: string | null;
}

/**
 * Main offline data management hook
 */
export function useOfflineData(config: Partial<OfflineHookConfig> = {}) {
  const { sdk } = useUrnlabsSDK();
  const [offlineManager] = useState(() => new OfflineStorageManager());
  const [offlineState, setOfflineState] = useState<OfflineState>({
    isOnline: true,
    isSyncing: false,
    pendingOperationsCount: 0,
    lastSyncTime: null,
    syncError: null
  });

  const syncIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const defaultConfig: OfflineHookConfig = {
    autoSync: true,
    syncOnAppForeground: true,
    syncOnNetworkReconnect: true,
    syncInterval: 5 * 60 * 1000, // 5 minutes
    ...config
  };

  // Update pending operations count
  const updatePendingCount = useCallback(async () => {
    const operations = await offlineManager.getPendingOperations();
    setOfflineState(prev => ({
      ...prev,
      pendingOperationsCount: operations.length
    }));
  }, [offlineManager]);

  // Sync data with server
  const syncData = useCallback(async (): Promise<SyncResult | null> => {
    if (offlineState.isSyncing) {
      return null;
    }

    setOfflineState(prev => ({
      ...prev,
      isSyncing: true,
      syncError: null
    }));

    try {
      const result = await offlineManager.syncOperations(sdk.http);

      setOfflineState(prev => ({
        ...prev,
        isSyncing: false,
        lastSyncTime: Date.now(),
        syncError: result.success ? null : 'Some operations failed to sync'
      }));

      await updatePendingCount();
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Sync failed';

      setOfflineState(prev => ({
        ...prev,
        isSyncing: false,
        syncError: errorMessage
      }));

      return null;
    }
  }, [offlineManager, sdk.http, offlineState.isSyncing, updatePendingCount]);

  // Queue offline operation
  const queueOperation = useCallback(async (
    type: 'CREATE' | 'UPDATE' | 'DELETE',
    endpoint: string,
    data?: any,
    maxRetries = 3
  ): Promise<string> => {
    const operationId = await offlineManager.queueOperation({
      type,
      endpoint,
      data,
      maxRetries
    });

    await updatePendingCount();

    // Auto-sync if online and enabled
    if (defaultConfig.autoSync && offlineState.isOnline) {
      setTimeout(() => syncData(), 100);
    }

    return operationId;
  }, [offlineManager, updatePendingCount, defaultConfig.autoSync, offlineState.isOnline, syncData]);

  // Setup network monitoring
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      const isOnline = state.isConnected === true;

      setOfflineState(prev => ({
        ...prev,
        isOnline
      }));

      // Sync when coming back online
      if (isOnline && !offlineState.isOnline && defaultConfig.syncOnNetworkReconnect) {
        setTimeout(() => syncData(), 1000);
      }
    });

    // Get initial network state
    NetInfo.fetch().then(state => {
      setOfflineState(prev => ({
        ...prev,
        isOnline: state.isConnected === true
      }));
    });

    return unsubscribe;
  }, [defaultConfig.syncOnNetworkReconnect, syncData, offlineState.isOnline]);

  // Setup app state monitoring
  useEffect(() => {
    const handleAppStateChange = (nextAppState: string) => {
      if (nextAppState === 'active' && defaultConfig.syncOnAppForeground && offlineState.isOnline) {
        setTimeout(() => syncData(), 500);
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription?.remove();
  }, [defaultConfig.syncOnAppForeground, offlineState.isOnline, syncData]);

  // Setup periodic sync
  useEffect(() => {
    if (defaultConfig.autoSync && defaultConfig.syncInterval) {
      syncIntervalRef.current = setInterval(() => {
        if (offlineState.isOnline && !offlineState.isSyncing) {
          syncData();
        }
      }, defaultConfig.syncInterval);

      return () => {
        if (syncIntervalRef.current) {
          clearInterval(syncIntervalRef.current);
        }
      };
    }
  }, [defaultConfig.autoSync, defaultConfig.syncInterval, offlineState.isOnline, offlineState.isSyncing, syncData]);

  // Initialize pending count
  useEffect(() => {
    updatePendingCount();
  }, [updatePendingCount]);

  return {
    ...offlineState,
    syncData,
    queueOperation,
    offlineManager,
    clearOfflineData: offlineManager.clearAllData.bind(offlineManager),
    getCacheStats: offlineManager.getCacheStats.bind(offlineManager)
  };
}

/**
 * Hook for caching API responses with automatic offline handling
 */
export function useCachedQuery<T>(
  queryKey: string,
  queryFn: () => Promise<T>,
  options: {
    ttl?: number;
    staleWhileRevalidate?: boolean;
    retryOnReconnect?: boolean;
  } = {}
) {
  const { offlineManager, isOnline } = useOfflineData();
  const [data, setData] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isCached, setIsCached] = useState(false);

  const executeQuery = useCallback(async (useCache = true) => {
    setIsLoading(true);
    setError(null);

    try {
      // Try to get cached data first
      if (useCache) {
        const cachedData = await offlineManager.getCachedData<T>(queryKey);
        if (cachedData) {
          setData(cachedData);
          setIsCached(true);

          // If using stale-while-revalidate, continue to fetch fresh data
          if (!options.staleWhileRevalidate) {
            setIsLoading(false);
            return;
          }
        }
      }

      // Fetch fresh data if online
      if (isOnline) {
        const freshData = await queryFn();
        setData(freshData);
        setIsCached(false);

        // Cache the fresh data
        await offlineManager.cacheData(queryKey, freshData, options.ttl);
      } else if (!data) {
        // If offline and no cached data, throw error
        throw new Error('No cached data available and device is offline');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Query failed';
      setError(errorMessage);

      // If there's no cached data, don't show any data
      if (!isCached) {
        setData(null);
      }
    } finally {
      setIsLoading(false);
    }
  }, [queryKey, queryFn, offlineManager, isOnline, options.ttl, options.staleWhileRevalidate, data, isCached]);

  // Refetch data
  const refetch = useCallback(() => {
    return executeQuery(false);
  }, [executeQuery]);

  // Initial fetch
  useEffect(() => {
    executeQuery();
  }, [executeQuery]);

  // Refetch when coming back online
  useEffect(() => {
    if (isOnline && options.retryOnReconnect && error) {
      executeQuery(false);
    }
  }, [isOnline, options.retryOnReconnect, error, executeQuery]);

  return {
    data,
    isLoading,
    error,
    isCached,
    refetch
  };
}

/**
 * Hook for mutations with automatic offline queueing
 */
export function useOfflineMutation<TData, TVariables>(
  mutationFn: (variables: TVariables) => Promise<TData>,
  options: {
    endpoint?: string;
    optimisticUpdate?: (variables: TVariables) => TData;
    onSuccess?: (data: TData, variables: TVariables) => void;
    onError?: (error: Error, variables: TVariables) => void;
  } = {}
) {
  const { queueOperation, isOnline } = useOfflineData();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mutate = useCallback(async (variables: TVariables): Promise<TData | null> => {
    setIsLoading(true);
    setError(null);

    try {
      if (isOnline) {
        // Execute mutation immediately if online
        const result = await mutationFn(variables);
        options.onSuccess?.(result, variables);
        return result;
      } else {
        // Queue for later execution if offline
        if (options.endpoint) {
          await queueOperation('CREATE', options.endpoint, variables);
        }

        // Return optimistic result if available
        if (options.optimisticUpdate) {
          const optimisticResult = options.optimisticUpdate(variables);
          options.onSuccess?.(optimisticResult, variables);
          return optimisticResult;
        }

        return null;
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Mutation failed';
      setError(errorMessage);

      const error = new Error(errorMessage);
      options.onError?.(error, variables);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [mutationFn, isOnline, queueOperation, options]);

  return {
    mutate,
    isLoading,
    error
  };
}