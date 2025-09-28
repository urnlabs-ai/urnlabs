/**
 * Core types and interfaces for Urnlabs Mobile SDKs
 * Shared across all platform implementations
 */

// Authentication Types
export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  tokenType: 'Bearer';
}

export interface UserCredentials {
  username: string;
  password: string;
}

export interface AuthUser {
  id: string;
  username: string;
  email: string;
  roles: string[];
  permissions: string[];
  profile?: Record<string, any>;
}

export interface AuthState {
  isAuthenticated: boolean;
  user: AuthUser | null;
  tokens: AuthTokens | null;
  isLoading: boolean;
  error: string | null;
}

// API Response Types
export interface ApiResponse<T = any> {
  success: boolean;
  data: T;
  message?: string;
  errors?: string[];
  metadata?: {
    timestamp: string;
    requestId: string;
    version: string;
  };
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

// Workflow Types
export interface WorkflowDefinition {
  id: string;
  name: string;
  description: string;
  version: string;
  steps: WorkflowStep[];
  triggers: WorkflowTrigger[];
  variables: Record<string, any>;
  metadata: {
    createdAt: string;
    updatedAt: string;
    createdBy: string;
    tags: string[];
  };
}

export interface WorkflowStep {
  id: string;
  name: string;
  type: 'agent' | 'human' | 'system' | 'condition' | 'loop';
  config: Record<string, any>;
  dependencies: string[];
  timeout?: number;
  retryCount?: number;
}

export interface WorkflowTrigger {
  id: string;
  type: 'manual' | 'schedule' | 'webhook' | 'event';
  config: Record<string, any>;
  enabled: boolean;
}

export interface WorkflowExecution {
  id: string;
  workflowId: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  startTime: string;
  endTime?: string;
  progress: number;
  currentStep?: string;
  result?: any;
  error?: string;
  logs: WorkflowLog[];
}

export interface WorkflowLog {
  timestamp: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  stepId?: string;
  metadata?: Record<string, any>;
}

// Agent Types
export interface Agent {
  id: string;
  name: string;
  type: string;
  description: string;
  capabilities: string[];
  config: Record<string, any>;
  status: 'active' | 'inactive' | 'busy' | 'error';
  metadata: {
    createdAt: string;
    updatedAt: string;
    version: string;
    tags: string[];
  };
}

export interface AgentExecution {
  id: string;
  agentId: string;
  workflowExecutionId?: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  input: any;
  output?: any;
  startTime: string;
  endTime?: string;
  duration?: number;
  error?: string;
  metrics: {
    cpuUsage?: number;
    memoryUsage?: number;
    tokenCount?: number;
    cost?: number;
  };
}

// File Types
export interface FileUpload {
  id: string;
  name: string;
  size: number;
  type: string;
  url: string;
  uploadedAt: string;
  metadata?: Record<string, any>;
}

export interface FileUploadProgress {
  fileId: string;
  loaded: number;
  total: number;
  progress: number;
  status: 'pending' | 'uploading' | 'completed' | 'failed';
}

// Real-time Types
export interface RealtimeMessage {
  type: 'workflow_update' | 'agent_status' | 'notification' | 'error';
  payload: any;
  timestamp: string;
  id: string;
}

export interface RealtimeSubscription {
  id: string;
  channel: string;
  filters?: Record<string, any>;
  callback: (message: RealtimeMessage) => void;
}

// Configuration Types
export interface SDKConfig {
  apiUrl: string;
  websocketUrl: string;
  apiKey?: string;
  timeout: number;
  retryAttempts: number;
  retryDelay: number;
  enableLogging: boolean;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  enableOffline: boolean;
  certificatePinning?: {
    enabled: boolean;
    certificates: string[];
  };
}

// Error Types
export interface SDKError extends Error {
  code: string;
  statusCode?: number;
  details?: Record<string, any>;
  timestamp: string;
}

export type SDKErrorCode =
  | 'NETWORK_ERROR'
  | 'AUTH_ERROR'
  | 'VALIDATION_ERROR'
  | 'TIMEOUT_ERROR'
  | 'PERMISSION_ERROR'
  | 'SERVER_ERROR'
  | 'OFFLINE_ERROR'
  | 'UNKNOWN_ERROR';

// Storage Interface
export interface StorageAdapter {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T): Promise<void>;
  remove(key: string): Promise<void>;
  clear(): Promise<void>;
  keys(): Promise<string[]>;
}

// HTTP Client Interface
export interface HttpClientConfig {
  baseURL: string;
  timeout: number;
  headers: Record<string, string>;
  retryAttempts: number;
  retryDelay: number;
  certificatePinning?: {
    enabled: boolean;
    certificates: string[];
  };
}

export interface HttpResponse<T = any> {
  data: T;
  status: number;
  statusText: string;
  headers: Record<string, string>;
}

export interface HttpClient {
  get<T>(url: string, config?: any): Promise<HttpResponse<T>>;
  post<T>(url: string, data?: any, config?: any): Promise<HttpResponse<T>>;
  put<T>(url: string, data?: any, config?: any): Promise<HttpResponse<T>>;
  delete<T>(url: string, config?: any): Promise<HttpResponse<T>>;
  patch<T>(url: string, data?: any, config?: any): Promise<HttpResponse<T>>;
}

// WebSocket Interface
export interface WebSocketClient {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  send(message: any): Promise<void>;
  subscribe(channel: string, callback: (message: any) => void): string;
  unsubscribe(subscriptionId: string): void;
  isConnected(): boolean;
}

// Event Types
export interface SDKEvent {
  type: string;
  data: any;
  timestamp: string;
}

export interface EventEmitter {
  on(event: string, callback: (data: any) => void): void;
  off(event: string, callback?: (data: any) => void): void;
  emit(event: string, data: any): void;
}