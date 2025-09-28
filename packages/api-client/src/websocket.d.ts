import { WebSocketMessage, WorkflowExecutionUpdate, SystemNotification } from './types';
export interface WebSocketClientConfig {
    url: string;
    reconnectAttempts?: number;
    reconnectInterval?: number;
    heartbeatInterval?: number;
    debug?: boolean;
}
export type WebSocketEventHandler = (message: WebSocketMessage) => void;
export declare class WebSocketClient {
    private config;
    private socket;
    private eventHandlers;
    private reconnectAttempts;
    private heartbeatTimer;
    private reconnectTimer;
    private isConnecting;
    private isClosing;
    constructor(config: WebSocketClientConfig);
    connect(): Promise<void>;
    disconnect(): void;
    send(message: Omit<WebSocketMessage, 'id' | 'timestamp'>): void;
    on(eventType: string, handler: WebSocketEventHandler): void;
    off(eventType: string, handler: WebSocketEventHandler): void;
    onWorkflowExecution(handler: (update: WorkflowExecutionUpdate) => void): () => void;
    onSystemNotification(handler: (notification: SystemNotification) => void): () => void;
    onAgentMetrics(handler: (metrics: any) => void): () => void;
    isConnected(): boolean;
    getReadyState(): number | null;
    subscribeToWorkflow(workflowId: string): void;
    unsubscribeFromWorkflow(workflowId: string): void;
    subscribeToAgent(agentId: string): void;
    unsubscribeFromAgent(agentId: string): void;
    subscribeToNotifications(): void;
    private handleMessage;
    private startHeartbeat;
    private stopHeartbeat;
    private shouldReconnect;
    private scheduleReconnect;
    private clearReconnectTimer;
    private generateId;
}
//# sourceMappingURL=websocket.d.ts.map