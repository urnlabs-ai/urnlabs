export { ApiClient } from './client';
export { WebSocketClient } from './websocket';
export * from './types';
export type { ApiClientConfig } from './client';
export type { WebSocketClientConfig, WebSocketEventHandler } from './websocket';
export declare function createApiClient(config?: {
    baseUrl?: string;
    apiKey?: string;
    timeout?: number;
    retries?: number;
    debug?: boolean;
}): ApiClient;
export declare function getApiClient(): ApiClient;
export declare function createWebSocketClient(config?: {
    url?: string;
    reconnectAttempts?: number;
    reconnectInterval?: number;
    heartbeatInterval?: number;
    debug?: boolean;
}): WebSocketClient;
export declare function getWebSocketClient(): WebSocketClient;
export declare function isApiError(error: any): error is {
    response?: {
        status: number;
        data?: any;
    };
};
export declare function getErrorMessage(error: any): string;
export declare function getErrorCode(error: any): string | null;
export declare function enableDebugMode(): void;
export declare function disableDebugMode(): void;
export declare const VERSION = "1.0.0";
//# sourceMappingURL=index.d.ts.map