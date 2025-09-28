import { FastifyRequest } from 'fastify';
import { WebSocket } from 'ws';
import { EventEmitter } from 'events';
export interface WebSocketMessage {
    type: string;
    data: any;
    timestamp: string;
    id: string;
}
export interface ClientConnection {
    id: string;
    socket: WebSocket;
    userId?: string;
    organizationId?: string;
    subscriptions: Set<string>;
    lastActivity: Date;
}
export declare class WebSocketManager extends EventEmitter {
    private connections;
    private isActive;
    constructor();
    shutdown(): Promise<void>;
    handleConnection(connection: any, request: FastifyRequest): void;
    private handleMessage;
    private handleDisconnection;
    private handleAuthentication;
    private handleSubscription;
    private handleUnsubscription;
    sendMessage(connectionId: string, message: WebSocketMessage): void;
    broadcast(type: string, data: any, filter?: (connection: ClientConnection) => boolean): void;
    broadcastToOrganization(organizationId: string, type: string, data: any): void;
    broadcastToUser(userId: string, type: string, data: any): void;
    broadcastToSubscribers(channel: string, type: string, data: any): void;
    getConnectionStats(): any;
    private setupCleanupInterval;
}
//# sourceMappingURL=websocket-manager.d.ts.map