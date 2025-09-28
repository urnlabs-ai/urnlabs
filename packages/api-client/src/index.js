// Export main classes
export { ApiClient } from './client';
export { WebSocketClient } from './websocket';
// Export all types
export * from './types';
// Create default API client instance
let defaultApiClient = null;
export function createApiClient(config = {}) {
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
export function getApiClient() {
    if (!defaultApiClient) {
        throw new Error('API client not initialized. Call createApiClient() first.');
    }
    return defaultApiClient;
}
// Create default WebSocket client
let defaultWebSocketClient = null;
export function createWebSocketClient(config = {}) {
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
export function getWebSocketClient() {
    if (!defaultWebSocketClient) {
        throw new Error('WebSocket client not initialized. Call createWebSocketClient() first.');
    }
    return defaultWebSocketClient;
}
// Utility functions
export function isApiError(error) {
    return error && typeof error === 'object' && 'response' in error;
}
export function getErrorMessage(error) {
    if (isApiError(error)) {
        return error.response?.data?.error?.message || error.response?.data?.message || 'An API error occurred';
    }
    if (error instanceof Error) {
        return error.message;
    }
    return 'An unknown error occurred';
}
export function getErrorCode(error) {
    if (isApiError(error)) {
        return error.response?.data?.error?.code || null;
    }
    return null;
}
// Development helpers
export function enableDebugMode() {
    if (defaultApiClient) {
        defaultApiClient.config.debug = true;
    }
    if (defaultWebSocketClient) {
        defaultWebSocketClient.config.debug = true;
    }
}
export function disableDebugMode() {
    if (defaultApiClient) {
        defaultApiClient.config.debug = false;
    }
    if (defaultWebSocketClient) {
        defaultWebSocketClient.config.debug = false;
    }
}
// Version info
export const VERSION = '1.0.0';
//# sourceMappingURL=index.js.map