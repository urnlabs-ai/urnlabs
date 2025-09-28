// Export main classes
export { ApiClient } from './client';
export { WebSocketClient } from './websocket';

// Export all types
export * from './types';

// Export configuration interfaces
export type { ApiClientConfig } from './client';
export type { WebSocketClientConfig, WebSocketEventHandler } from './websocket';

// Create default API client instance
let defaultApiClient: ApiClient | null = null;

export function createApiClient(config: {
  baseUrl?: string;
  apiKey?: string;
  timeout?: number;
  retries?: number;
  debug?: boolean;
} = {}): ApiClient {
  const defaultConfig = {
    baseUrl: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api',
    timeout: 30000,
    retries: 3,
    debug: process.env.NODE_ENV === 'development',
    ...config
  };

  defaultApiClient = new ApiClient(defaultConfig);
  return defaultApiClient;
}

export function getApiClient(): ApiClient {
  if (!defaultApiClient) {
    throw new Error('API client not initialized. Call createApiClient() first.');
  }
  return defaultApiClient;
}

// Create default WebSocket client
let defaultWebSocketClient: WebSocketClient | null = null;

export function createWebSocketClient(config: {
  url?: string;
  reconnectAttempts?: number;
  reconnectInterval?: number;
  heartbeatInterval?: number;
  debug?: boolean;
} = {}): WebSocketClient {
  const apiClient = getApiClient();

  const defaultConfig = {
    url: apiClient.createWebSocketUrl('/ws'),
    reconnectAttempts: 5,
    reconnectInterval: 5000,
    heartbeatInterval: 30000,
    debug: process.env.NODE_ENV === 'development',
    ...config
  };

  defaultWebSocketClient = new WebSocketClient(defaultConfig);
  return defaultWebSocketClient;
}

export function getWebSocketClient(): WebSocketClient {
  if (!defaultWebSocketClient) {
    throw new Error('WebSocket client not initialized. Call createWebSocketClient() first.');
  }
  return defaultWebSocketClient;
}

// Utility functions
export function isApiError(error: any): error is { response?: { status: number; data?: any } } {
  return error && typeof error === 'object' && 'response' in error;
}

export function getErrorMessage(error: any): string {
  if (isApiError(error)) {
    return error.response?.data?.error?.message || error.response?.data?.message || 'An API error occurred';
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'An unknown error occurred';
}

export function getErrorCode(error: any): string | null {
  if (isApiError(error)) {
    return error.response?.data?.error?.code || null;
  }

  return null;
}

// Development helpers
export function enableDebugMode(): void {
  if (defaultApiClient) {
    (defaultApiClient as any).config.debug = true;
  }

  if (defaultWebSocketClient) {
    (defaultWebSocketClient as any).config.debug = true;
  }
}

export function disableDebugMode(): void {
  if (defaultApiClient) {
    (defaultApiClient as any).config.debug = false;
  }

  if (defaultWebSocketClient) {
    (defaultWebSocketClient as any).config.debug = false;
  }
}

// Version info
export const VERSION = '1.0.0';