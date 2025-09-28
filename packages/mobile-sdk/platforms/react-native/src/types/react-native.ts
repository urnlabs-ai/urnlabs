/**
 * React Native specific TypeScript definitions
 * Extends core SDK types with React Native platform features
 */

import { BiometryTypes } from 'react-native-biometrics';
import { FirebaseMessagingTypes } from '@react-native-firebase/messaging';
import {
  SDKConfig,
  FileUpload,
  WorkflowExecution,
  Agent,
  AuthState,
  ApiResponse
} from '@urnlabs/mobile-sdk-core';

// React Native specific configuration
export interface ReactNativeSDKConfig extends SDKConfig {
  platform: {
    enableBiometrics: boolean;
    enablePushNotifications: boolean;
    enableBackgroundSync: boolean;
    enableFileOperations: boolean;
    enableOfflineMode: boolean;
  };
  pushNotifications: {
    firebaseConfig?: {
      apiKey: string;
      authDomain: string;
      projectId: string;
      storageBucket: string;
      messagingSenderId: string;
      appId: string;
    };
    enableForegroundNotifications: boolean;
    enableBackgroundNotifications: boolean;
    badgeCount: boolean;
  };
  biometrics: {
    promptMessage: string;
    cancelButtonText: string;
    fallbackButtonText: string;
    allowDeviceCredentials: boolean;
  };
  fileOperations: {
    maxFileSize: number; // in bytes
    allowedFileTypes: string[];
    enableImagePicker: boolean;
    enableDocumentPicker: boolean;
    uploadTimeout: number;
    downloadTimeout: number;
  };
  offline: {
    cacheSize: number; // in MB
    cacheTTL: number; // in milliseconds
    maxPendingOperations: number;
    syncStrategy: 'immediate' | 'background' | 'manual';
    conflictResolution: 'local_wins' | 'remote_wins' | 'merge' | 'manual';
  };
}

// React Native SDK instance interface
export interface ReactNativeSDK {
  // Core functionality
  config: ReactNativeSDKConfig;
  auth: AuthManager;
  http: HttpClient;
  websocket: WebSocketClient;
  storage: OfflineStorageManager;

  // React Native specific managers
  biometrics: BiometricManager;
  pushNotifications: PushNotificationManager;
  fileOperations: FileOperationManager;
  backgroundTasks: BackgroundTaskManager;

  // SDK methods
  initialize(): Promise<void>;
  destroy(): Promise<void>;
  isInitialized(): boolean;
  getVersion(): string;
  checkHealth(): Promise<HealthStatus>;
}

// Manager interfaces
export interface BiometricManager {
  isAvailable(): Promise<boolean>;
  getBiometryType(): Promise<BiometryTypes | null>;
  authenticate(options?: BiometricAuthOptions): Promise<BiometricAuthResult>;
  authenticateAndSign(payload: string, options?: BiometricAuthOptions): Promise<BiometricAuthResult>;
  storeCredentials(username: string, password: string, service?: string): Promise<boolean>;
  retrieveCredentials(service?: string): Promise<KeychainCredentials | null>;
  setupBiometricLogin(password: string): Promise<boolean>;
  disableBiometricLogin(): Promise<boolean>;
}

export interface PushNotificationManager {
  requestPermission(): Promise<boolean>;
  checkPermission(): Promise<NotificationPermission>;
  getFCMToken(): Promise<string | null>;
  registerDevice(): Promise<boolean>;
  unregisterDevice(): Promise<boolean>;
  sendTestNotification(): Promise<void>;
  setBadgeCount(count: number): void;
  clearAllNotifications(): void;
  markAsRead(notificationId: string): void;
  markAllAsRead(): void;
}

export interface FileOperationManager {
  pickFile(options?: FilePickerOptions): Promise<FileInfo[]>;
  pickImage(options?: ImagePickerOptions): Promise<FileInfo | null>;
  uploadFile(file: FileInfo, options?: FileUploadOptions): Promise<FileInfo>;
  downloadFile(fileId: string, url: string, options?: FileDownloadOptions): Promise<string>;
  deleteFile(filePath: string): Promise<void>;
  getFileInfo(filePath: string): Promise<FileStats>;
}

export interface BackgroundTaskManager {
  registerTask(name: string, taskFn: () => Promise<void>, options?: BackgroundTaskOptions): string;
  executeTask(taskId: string): Promise<void>;
  cancelTask(taskId: string): void;
  removeTask(taskId: string): void;
  getTasksByStatus(status: BackgroundTaskStatus): BackgroundTask[];
  startBackgroundSync(): void;
  stopBackgroundSync(): void;
}

// Biometric authentication types
export interface BiometricAuthOptions {
  promptMessage?: string;
  cancelButtonText?: string;
  fallbackButtonText?: string;
  disableDeviceFallback?: boolean;
}

export interface BiometricAuthResult {
  success: boolean;
  signature?: string;
  error?: string;
  userCancel?: boolean;
  userFallback?: boolean;
  systemCancel?: boolean;
  passcodeFallback?: boolean;
}

export interface KeychainCredentials {
  username: string;
  password: string;
  service?: string;
}

// Push notification types
export interface NotificationPermission {
  hasPermission: boolean;
  authorizationStatus: number;
  isProvisional?: boolean;
}

export interface PushNotification {
  id: string;
  title: string;
  body: string;
  data?: Record<string, any>;
  imageUrl?: string;
  actionUrl?: string;
  timestamp: number;
  read: boolean;
}

export interface NotificationChannel {
  id: string;
  name: string;
  description?: string;
  importance: 'low' | 'default' | 'high' | 'max';
  sound?: string;
  vibration?: boolean;
  lights?: boolean;
}

// File operation types
export interface FilePickerOptions {
  type?: string[];
  allowMultiSelection?: boolean;
  maxSize?: number;
}

export interface ImagePickerOptions {
  source?: 'camera' | 'gallery';
  quality?: number;
  maxWidth?: number;
  maxHeight?: number;
  mediaType?: 'photo' | 'video' | 'mixed';
}

export interface FileInfo {
  id: string;
  name: string;
  size: number;
  type: string;
  uri: string;
  uploadedAt?: string;
  localPath?: string;
}

export interface FileUploadOptions {
  onProgress?: (progress: number) => void;
  resumable?: boolean;
  quality?: number;
  maxWidth?: number;
  maxHeight?: number;
  timeout?: number;
}

export interface FileDownloadOptions {
  onProgress?: (progress: number) => void;
  resumable?: boolean;
  destination?: string;
  timeout?: number;
}

export interface FileStats {
  name: string;
  size: number;
  isFile: boolean;
  isDirectory: boolean;
  mtime: Date;
  path: string;
}

export interface UploadProgress {
  fileId: string;
  progress: number;
  status: 'pending' | 'uploading' | 'completed' | 'failed' | 'cancelled';
  error?: string;
}

export interface DownloadProgress {
  fileId: string;
  progress: number;
  status: 'pending' | 'downloading' | 'completed' | 'failed' | 'cancelled';
  localPath?: string;
  error?: string;
}

// Background task types
export interface BackgroundTask {
  id: string;
  name: string;
  type: 'sync' | 'upload' | 'download' | 'analytics' | 'custom';
  priority: 'low' | 'normal' | 'high';
  interval?: number;
  maxRetries: number;
  retryCount: number;
  status: BackgroundTaskStatus;
  startTime?: number;
  endTime?: number;
  error?: string;
  progress?: number;
}

export type BackgroundTaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

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
  interval: number;
  maxBatchSize: number;
  retryFailedOperations: boolean;
  syncOnAppForeground: boolean;
  syncOnNetworkReconnect: boolean;
}

// Offline storage types
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
  ttl: number;
  maxSize: number;
  syncStrategy: 'immediate' | 'background' | 'manual';
}

export interface CacheStats {
  totalItems: number;
  totalSize: number;
  pendingOperations: number;
  oldestItem: number | null;
  newestItem: number | null;
}

// Hook return types
export interface OfflineState {
  isOnline: boolean;
  isSyncing: boolean;
  pendingOperationsCount: number;
  lastSyncTime: number | null;
  syncError: string | null;
}

export interface NetworkState {
  isConnected: boolean;
  connectionType: string;
  isOnline: boolean;
}

export interface AuthHookState extends AuthState {
  isLoading: boolean;
  error: string | null;
  login: (credentials: UserCredentials) => Promise<void>;
  logout: () => Promise<void>;
  refreshTokens: () => Promise<void>;
}

export interface WorkflowHookState {
  workflows: WorkflowExecution[];
  currentWorkflow: WorkflowExecution | null;
  isLoading: boolean;
  error: string | null;
  fetchWorkflows: () => Promise<void>;
  fetchWorkflow: (id: string) => Promise<WorkflowExecution>;
  executeWorkflow: (id: string, input?: any) => Promise<WorkflowExecution>;
  cancelWorkflow: (executionId: string) => Promise<void>;
}

export interface AgentsHookState {
  agents: Agent[];
  isLoading: boolean;
  error: string | null;
  fetchAgents: () => Promise<void>;
  getAgent: (id: string) => Agent | undefined;
}

export interface RealtimeHookState {
  messages: any[];
  isConnected: boolean;
  sendMessage: (message: any) => Promise<void>;
  clearMessages: () => void;
}

// Health check types
export interface HealthStatus {
  sdk: {
    initialized: boolean;
    version: string;
  };
  network: {
    connected: boolean;
    connectionType: string;
  };
  authentication: {
    authenticated: boolean;
    tokenValid: boolean;
  };
  storage: {
    available: boolean;
    size: number;
  };
  features: {
    biometrics: boolean;
    pushNotifications: boolean;
    fileOperations: boolean;
    backgroundTasks: boolean;
  };
}

// Error types
export interface ReactNativeSDKError extends Error {
  code: ReactNativeErrorCode;
  platform: 'ios' | 'android';
  nativeError?: any;
  timestamp: string;
}

export type ReactNativeErrorCode =
  | 'BIOMETRIC_NOT_AVAILABLE'
  | 'BIOMETRIC_AUTH_FAILED'
  | 'PUSH_NOTIFICATION_PERMISSION_DENIED'
  | 'FILE_OPERATION_FAILED'
  | 'BACKGROUND_TASK_FAILED'
  | 'KEYCHAIN_ACCESS_DENIED'
  | 'NETWORK_NOT_AVAILABLE'
  | 'STORAGE_QUOTA_EXCEEDED'
  | 'PLATFORM_NOT_SUPPORTED';

// Event types
export interface ReactNativeSDKEvent {
  type: ReactNativeEventType;
  data: any;
  timestamp: string;
  platform: 'ios' | 'android';
}

export type ReactNativeEventType =
  | 'biometric_auth_success'
  | 'biometric_auth_failed'
  | 'push_notification_received'
  | 'push_notification_opened'
  | 'file_upload_progress'
  | 'file_upload_completed'
  | 'file_download_progress'
  | 'file_download_completed'
  | 'background_sync_started'
  | 'background_sync_completed'
  | 'offline_operation_queued'
  | 'network_status_changed'
  | 'app_state_changed';

// Context provider types
export interface UrnlabsProviderProps {
  config: ReactNativeSDKConfig;
  children: React.ReactNode;
  onError?: (error: ReactNativeSDKError) => void;
  onEvent?: (event: ReactNativeSDKEvent) => void;
}

export interface UrnlabsContextValue {
  sdk: ReactNativeSDK;
  isInitialized: boolean;
  error: ReactNativeSDKError | null;
  health: HealthStatus | null;
}

// Utility types
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export type RequiredFields<T, K extends keyof T> = T & Required<Pick<T, K>>;

export type OptionalFields<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

// Platform detection types
export interface PlatformCapabilities {
  biometrics: {
    available: boolean;
    types: BiometryTypes[];
  };
  pushNotifications: {
    available: boolean;
    firebaseSupported: boolean;
  };
  fileSystem: {
    available: boolean;
    documentsDirectory: string;
    cacheDirectory: string;
  };
  backgroundTasks: {
    available: boolean;
    restrictions: string[];
  };
  keychain: {
    available: boolean;
    biometricProtection: boolean;
  };
}