import { WebSocket } from 'ws';
export interface WebSocketMessage {
    type: string;
    data: any;
    timestamp?: string;
}
export interface ConnectedClient {
    id: string;
    socket: WebSocket;
    subscriptions: Set<string>;
    connectedAt: Date;
    lastActivity: Date;
}
export declare class WebSocketManager {
    private clients;
    private messageHandlers;
    private heartbeatInterval;
    constructor();
    /**
     * Initialize message handlers for different message types
     */
    private initializeMessageHandlers;
    /**
     * Add a new WebSocket connection
     */
    addConnection(socket: WebSocket): string;
    /**
     * Remove a WebSocket connection
     */
    removeConnection(socket: WebSocket): void;
    /**
     * Handle incoming WebSocket message
     */
    handleMessage(socket: WebSocket, message: WebSocketMessage): Promise<void>;
    /**
     * Broadcast message to all connected clients
     */
    broadcast(message: WebSocketMessage, channel?: string): void;
    /**
     * Send message to specific client
     */
    private sendToClient;
    /**
     * Send message to specific client by ID
     */
    sendToClientById(clientId: string, message: WebSocketMessage): boolean;
    /**
     * Find client by socket connection
     */
    private findClientBySocket;
    /**
     * Generate unique client ID
     */
    private generateClientId;
    /**
     * Start heartbeat to keep connections alive and clean up dead ones
     */
    private startHeartbeat;
    /**
     * Get connection statistics
     */
    getStats(): {
        totalClients: number;
        activeClients: number;
        subscriptionCounts: Record<string, number>;
        clientDetails: Array<{
            id: string;
            connectedAt: string;
            lastActivity: string;
            subscriptions: string[];
            uptime: number;
        }>;
    };
    /**
     * Cleanup resources
     */
    cleanup(): void;
    /**
     * Broadcast agent status updates
     */
    broadcastAgentStatus(agentType: string, status: string, data?: any): void;
    /**
     * Broadcast task execution updates
     */
    broadcastTaskUpdate(taskId: string, status: string, result?: any): void;
    /**
     * Broadcast system health updates
     */
    broadcastSystemHealth(health: {
        status: string;
        score: number;
        reasons: string[];
    }): void;
}
//# sourceMappingURL=websocket-manager.d.ts.map