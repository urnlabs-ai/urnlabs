/**
 * Urnlabs React Native SDK - Main entry point
 */

// Re-export core types and utilities
export * from '@urnlabs/mobile-sdk-core';

// React Native specific exports
export { UrnlabsReactNativeSDK, createUrnlabsSDK } from './UrnlabsSDK';
export { ReactNativeStorageAdapter } from './storage/AsyncStorageAdapter';
export { OfflineStorageManager } from './storage/OfflineStorageManager';
export { ReactNativeWebSocketClient } from './websocket/ReactNativeWebSocketClient';

// React Native specific types
export * from './types/react-native';

// React components and hooks
export { UrnlabsProvider, useUrnlabs } from './context/UrnlabsProvider';

// Core hooks
export {
  useUrnlabsSDK,
  useAuth,
  useNetworkStatus,
  useWorkflow,
  useAgents,
  useRealtime,
  useFileUpload
} from './hooks/useUrnlabsSDK';

// Enhanced hooks
export {
  useOfflineData,
  useCachedQuery,
  useOfflineMutation
} from './hooks/useOfflineData';

export {
  useFileOperations
} from './hooks/useFileOperations';

export {
  usePushNotifications
} from './hooks/usePushNotifications';

export {
  useBiometricAuth
} from './hooks/useBiometricAuth';

export {
  useBackgroundTasks
} from './hooks/useBackgroundTasks';

// Version information
export const REACT_NATIVE_SDK_VERSION = '1.0.0';
export const REACT_NATIVE_SDK_NAME = 'Urnlabs React Native SDK';