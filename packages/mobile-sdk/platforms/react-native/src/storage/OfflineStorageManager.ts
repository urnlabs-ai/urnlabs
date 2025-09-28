/**
 * Offline Storage Manager for React Native
 * Handles data caching, synchronization, and conflict resolution
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { ReactNativeStorageAdapter } from './AsyncStorageAdapter';

export interface OfflineOperation {
  id: string;
  type: 'CREATE' | 'UPDATE' | 'DELETE';
  endpoint: string;
  data?: any;
  timestamp: number;
  retryCount: number;
  maxRetries: number;
}

export interface SyncResult {
  success: boolean;
  operations: {
    successful: OfflineOperation[];
    failed: OfflineOperation[];
  };
  conflicts: ConflictResolution[];
}

export interface ConflictResolution {
  operationId: string;
  conflict: 'version_mismatch' | 'data_changed' | 'not_found';
  resolution: 'local_wins' | 'remote_wins' | 'merge' | 'manual';
  resolvedData?: any;
}

export interface CacheConfig {
  ttl: number; // Time to live in milliseconds
  maxSize: number; // Maximum number of entries
  syncStrategy: 'immediate' | 'background' | 'manual';
}

export class OfflineStorageManager {
  private storage: ReactNativeStorageAdapter;
  private pendingOperationsKey = 'pending_operations';
  private cachePrefix = 'cache_';
  private metadataPrefix = 'metadata_';
  private config: CacheConfig;

  constructor(config: Partial<CacheConfig> = {}) {
    this.storage = new ReactNativeStorageAdapter();
    this.config = {
      ttl: 24 * 60 * 60 * 1000, // 24 hours default
      maxSize: 1000,
      syncStrategy: 'background',
      ...config
    };
  }

  /**
   * Cache data with metadata
   */
  async cacheData(key: string, data: any, ttl?: number): Promise<void> {
    const cacheKey = this.cachePrefix + key;
    const metadataKey = this.metadataPrefix + key;

    const metadata = {
      timestamp: Date.now(),
      ttl: ttl || this.config.ttl,
      version: Date.now().toString(),
      size: JSON.stringify(data).length
    };

    await Promise.all([
      this.storage.set(cacheKey, data),
      this.storage.set(metadataKey, metadata)
    ]);
  }

  /**
   * Get cached data if valid
   */
  async getCachedData<T>(key: string): Promise<T | null> {
    const cacheKey = this.cachePrefix + key;
    const metadataKey = this.metadataPrefix + key;

    try {
      const [data, metadata] = await Promise.all([
        this.storage.get<T>(cacheKey),
        this.storage.get<any>(metadataKey)
      ]);

      if (!data || !metadata) {
        return null;
      }

      // Check if data is expired
      const now = Date.now();
      const expiry = metadata.timestamp + metadata.ttl;

      if (now > expiry) {
        // Clean up expired data
        await this.removeCachedData(key);
        return null;
      }

      return data;
    } catch (error) {
      console.error('Error getting cached data:', error);
      return null;
    }
  }

  /**
   * Remove cached data
   */
  async removeCachedData(key: string): Promise<void> {
    const cacheKey = this.cachePrefix + key;
    const metadataKey = this.metadataPrefix + key;

    await Promise.all([
      this.storage.remove(cacheKey),
      this.storage.remove(metadataKey)
    ]);
  }

  /**
   * Queue offline operation
   */
  async queueOperation(operation: Omit<OfflineOperation, 'id' | 'timestamp' | 'retryCount'>): Promise<string> {
    const operationId = `op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const fullOperation: OfflineOperation = {
      id: operationId,
      timestamp: Date.now(),
      retryCount: 0,
      ...operation
    };

    const pendingOps = await this.getPendingOperations();
    pendingOps.push(fullOperation);

    await this.storage.set(this.pendingOperationsKey, pendingOps);

    return operationId;
  }

  /**
   * Get all pending operations
   */
  async getPendingOperations(): Promise<OfflineOperation[]> {
    return (await this.storage.get<OfflineOperation[]>(this.pendingOperationsKey)) || [];
  }

  /**
   * Sync pending operations when online
   */
  async syncOperations(apiClient: any): Promise<SyncResult> {
    const pendingOps = await this.getPendingOperations();
    const result: SyncResult = {
      success: true,
      operations: {
        successful: [],
        failed: []
      },
      conflicts: []
    };

    if (pendingOps.length === 0) {
      return result;
    }

    // Check network connectivity
    const netInfo = await NetInfo.fetch();
    if (!netInfo.isConnected) {
      result.success = false;
      return result;
    }

    // Sort operations by timestamp to maintain order
    const sortedOps = pendingOps.sort((a, b) => a.timestamp - b.timestamp);

    for (const operation of sortedOps) {
      try {
        const success = await this.executeOperation(operation, apiClient);

        if (success) {
          result.operations.successful.push(operation);
        } else {
          // Increment retry count
          operation.retryCount++;

          if (operation.retryCount >= operation.maxRetries) {
            result.operations.failed.push(operation);
          } else {
            // Keep for retry
            continue;
          }
        }
      } catch (error) {
        console.error('Operation failed:', error);
        operation.retryCount++;

        if (operation.retryCount >= operation.maxRetries) {
          result.operations.failed.push(operation);
        }
      }
    }

    // Update pending operations (remove successful and permanently failed ones)
    const remainingOps = pendingOps.filter(op =>
      !result.operations.successful.some(s => s.id === op.id) &&
      !result.operations.failed.some(f => f.id === op.id)
    );

    await this.storage.set(this.pendingOperationsKey, remainingOps);

    result.success = result.operations.failed.length === 0;
    return result;
  }

  /**
   * Execute a single operation
   */
  private async executeOperation(operation: OfflineOperation, apiClient: any): Promise<boolean> {
    try {
      let response;

      switch (operation.type) {
        case 'CREATE':
          response = await apiClient.post(operation.endpoint, operation.data);
          break;
        case 'UPDATE':
          response = await apiClient.put(operation.endpoint, operation.data);
          break;
        case 'DELETE':
          response = await apiClient.delete(operation.endpoint);
          break;
        default:
          throw new Error(`Unknown operation type: ${operation.type}`);
      }

      return response.status >= 200 && response.status < 300;
    } catch (error) {
      console.error(`Failed to execute operation ${operation.id}:`, error);
      return false;
    }
  }

  /**
   * Clean up cache based on size and TTL
   */
  async cleanupCache(): Promise<void> {
    const keys = await this.storage.keys();
    const cacheKeys = keys.filter(key => key.startsWith(this.cachePrefix));

    if (cacheKeys.length <= this.config.maxSize) {
      return;
    }

    // Get metadata for all cached items
    const metadataPromises = cacheKeys.map(async (key) => {
      const metadataKey = key.replace(this.cachePrefix, this.metadataPrefix);
      const metadata = await this.storage.get<any>(metadataKey);
      return { key, metadata };
    });

    const cacheItems = await Promise.all(metadataPromises);

    // Sort by last access time (oldest first)
    const sortedItems = cacheItems
      .filter(item => item.metadata)
      .sort((a, b) => a.metadata.timestamp - b.metadata.timestamp);

    // Remove oldest items to get under maxSize
    const itemsToRemove = sortedItems.slice(0, sortedItems.length - this.config.maxSize);

    for (const item of itemsToRemove) {
      const cacheKey = item.key;
      const dataKey = cacheKey.replace(this.cachePrefix, '');
      await this.removeCachedData(dataKey);
    }
  }

  /**
   * Get cache statistics
   */
  async getCacheStats(): Promise<{
    totalItems: number;
    totalSize: number;
    pendingOperations: number;
    oldestItem: number | null;
    newestItem: number | null;
  }> {
    const keys = await this.storage.keys();
    const cacheKeys = keys.filter(key => key.startsWith(this.cachePrefix));
    const pendingOps = await this.getPendingOperations();

    let totalSize = 0;
    let oldestTimestamp: number | null = null;
    let newestTimestamp: number | null = null;

    for (const key of cacheKeys) {
      const metadataKey = key.replace(this.cachePrefix, this.metadataPrefix);
      const metadata = await this.storage.get<any>(metadataKey);

      if (metadata) {
        totalSize += metadata.size || 0;

        if (oldestTimestamp === null || metadata.timestamp < oldestTimestamp) {
          oldestTimestamp = metadata.timestamp;
        }

        if (newestTimestamp === null || metadata.timestamp > newestTimestamp) {
          newestTimestamp = metadata.timestamp;
        }
      }
    }

    return {
      totalItems: cacheKeys.length,
      totalSize,
      pendingOperations: pendingOps.length,
      oldestItem: oldestTimestamp,
      newestItem: newestTimestamp
    };
  }

  /**
   * Clear all offline data
   */
  async clearAllData(): Promise<void> {
    const keys = await this.storage.keys();
    const offlineKeys = keys.filter(key =>
      key.startsWith(this.cachePrefix) ||
      key.startsWith(this.metadataPrefix) ||
      key === this.pendingOperationsKey
    );

    await Promise.all(offlineKeys.map(key => this.storage.remove(key)));
  }
}