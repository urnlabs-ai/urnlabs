import { FastifyRequest } from 'fastify';
import { SocketStream } from '@fastify/websocket';
import { EventEmitter } from 'events';

import { logger } from '@/lib/logger.js';
import { features } from '@/lib/config.js';

export interface WebSocketMessage {
  type: string;
  data: any;
  timestamp: string;
  id: string;
}

export interface ClientConnection {
  id: string;
  socket: SocketStream;
  userId?: string;
  organizationId?: string;
  subscriptions: Set<string>;
  lastActivity: Date;
}

export class WebSocketManager extends EventEmitter {
  private connections = new Map<string, ClientConnection>();
  private isActive: boolean = false;

  constructor() {
    super();
    this.isActive = features.websockets;
    
    if (this.isActive) {
      this.setupCleanupInterval();
    }
  }

  async shutdown(): Promise<void> {
    if (!this.isActive) return;

    logger.info('Shutting down WebSocket manager...');

    // Close all connections
    for (const connection of this.connections.values()) {
      try {
        connection.socket.end();
      } catch (error) {
        logger.error(error, `Error closing WebSocket connection ${connection.id}`);
      }
    }

    this.connections.clear();
    this.isActive = false;

    logger.info('WebSocket manager shut down');
  }

  handleConnection(connection: SocketStream, request: FastifyRequest): void {
    if (!this.isActive) {
      connection.end();
      return;
    }

    const connectionId = crypto.randomUUID();
    const clientConnection: ClientConnection = {
      id: connectionId,
      socket: connection,
      subscriptions: new Set(),
      lastActivity: new Date(),
    };

    this.connections.set(connectionId, clientConnection);

    logger.info({
      connectionId,
      ip: request.ip,
      userAgent: request.headers['user-agent'],
    }, 'New WebSocket connection established');

    // Set up connection handlers
    connection.on('message', (message) => {
      this.handleMessage(connectionId, message);
    });

    connection.on('close', () => {
      this.handleDisconnection(connectionId);
    });

    connection.on('error', (error) => {
      logger.error({
        connectionId,
        error: error.message,
      }, 'WebSocket connection error');
      this.handleDisconnection(connectionId);
    });

    // Send welcome message
    this.sendMessage(connectionId, {
      type: 'welcome',
      data: {
        connectionId,
        timestamp: new Date().toISOString(),
        features: {
          realTimeUpdates: true,
          workflowMonitoring: true,
          taskTracking: true,
        },
      },
      timestamp: new Date().toISOString(),
      id: crypto.randomUUID(),
    });
  }

  private handleMessage(connectionId: string, rawMessage: Buffer): void {
    const connection = this.connections.get(connectionId);
    if (!connection) return;

    try {
      const message = JSON.parse(rawMessage.toString());
      connection.lastActivity = new Date();

      logger.debug({
        connectionId,
        messageType: message.type,
      }, 'WebSocket message received');

      switch (message.type) {
        case 'authenticate':
          this.handleAuthentication(connectionId, message.data);
          break;

        case 'subscribe':
          this.handleSubscription(connectionId, message.data);
          break;

        case 'unsubscribe':
          this.handleUnsubscription(connectionId, message.data);
          break;

        case 'ping':
          this.sendMessage(connectionId, {
            type: 'pong',
            data: { timestamp: new Date().toISOString() },
            timestamp: new Date().toISOString(),
            id: crypto.randomUUID(),
          });
          break;

        default:
          logger.warn({
            connectionId,
            messageType: message.type,
          }, 'Unknown WebSocket message type');
      }

    } catch (error) {
      logger.error({
        connectionId,
        error: error instanceof Error ? error.message : String(error),
      }, 'Error processing WebSocket message');

      this.sendMessage(connectionId, {
        type: 'error',
        data: { message: 'Invalid message format' },
        timestamp: new Date().toISOString(),
        id: crypto.randomUUID(),
      });
    }
  }

  private handleDisconnection(connectionId: string): void {
    const connection = this.connections.get(connectionId);
    if (!connection) return;

    logger.info({
      connectionId,
      userId: connection.userId,
      subscriptions: Array.from(connection.subscriptions),
    }, 'WebSocket connection closed');

    this.connections.delete(connectionId);
  }

  private handleAuthentication(connectionId: string, authData: any): void {
    const connection = this.connections.get(connectionId);
    if (!connection) return;

    // TODO: Implement JWT token validation
    // For now, accept the provided userId and organizationId
    connection.userId = authData.userId;
    connection.organizationId = authData.organizationId;

    this.sendMessage(connectionId, {
      type: 'authenticated',
      data: {
        userId: connection.userId,
        organizationId: connection.organizationId,
      },
      timestamp: new Date().toISOString(),
      id: crypto.randomUUID(),
    });

    logger.info({
      connectionId,
      userId: connection.userId,
      organizationId: connection.organizationId,
    }, 'WebSocket connection authenticated');
  }

  private handleSubscription(connectionId: string, subscriptionData: any): void {
    const connection = this.connections.get(connectionId);
    if (!connection) return;

    const { channel } = subscriptionData;
    if (!channel) {
      this.sendMessage(connectionId, {
        type: 'error',
        data: { message: 'Channel name required for subscription' },
        timestamp: new Date().toISOString(),
        id: crypto.randomUUID(),
      });
      return;
    }

    connection.subscriptions.add(channel);

    this.sendMessage(connectionId, {
      type: 'subscribed',
      data: { channel },
      timestamp: new Date().toISOString(),
      id: crypto.randomUUID(),
    });

    logger.debug({
      connectionId,
      channel,
      totalSubscriptions: connection.subscriptions.size,
    }, 'WebSocket subscription added');
  }

  private handleUnsubscription(connectionId: string, unsubscriptionData: any): void {
    const connection = this.connections.get(connectionId);
    if (!connection) return;

    const { channel } = unsubscriptionData;
    if (!channel) return;

    connection.subscriptions.delete(channel);

    this.sendMessage(connectionId, {
      type: 'unsubscribed',
      data: { channel },
      timestamp: new Date().toISOString(),
      id: crypto.randomUUID(),
    });

    logger.debug({
      connectionId,
      channel,
      totalSubscriptions: connection.subscriptions.size,
    }, 'WebSocket subscription removed');
  }

  public sendMessage(connectionId: string, message: WebSocketMessage): void {
    if (!this.isActive) return;

    const connection = this.connections.get(connectionId);
    if (!connection) return;

    try {
      connection.socket.send(JSON.stringify(message));
    } catch (error) {
      logger.error({
        connectionId,
        error: error instanceof Error ? error.message : String(error),
      }, 'Error sending WebSocket message');
      
      // Remove dead connection
      this.handleDisconnection(connectionId);
    }
  }

  public broadcast(type: string, data: any, filter?: (connection: ClientConnection) => boolean): void {
    if (!this.isActive) return;

    const message: WebSocketMessage = {
      type,
      data,
      timestamp: new Date().toISOString(),
      id: crypto.randomUUID(),
    };

    let sentCount = 0;
    let filteredCount = 0;

    for (const connection of this.connections.values()) {
      if (filter && !filter(connection)) {
        filteredCount++;
        continue;
      }

      this.sendMessage(connection.id, message);
      sentCount++;
    }

    logger.debug({
      type,
      sentCount,
      filteredCount,
      totalConnections: this.connections.size,
    }, 'WebSocket broadcast sent');
  }

  public broadcastToOrganization(organizationId: string, type: string, data: any): void {
    this.broadcast(type, data, (connection) => {
      return connection.organizationId === organizationId;
    });
  }

  public broadcastToUser(userId: string, type: string, data: any): void {
    this.broadcast(type, data, (connection) => {
      return connection.userId === userId;
    });
  }

  public broadcastToSubscribers(channel: string, type: string, data: any): void {
    this.broadcast(type, data, (connection) => {
      return connection.subscriptions.has(channel);
    });
  }

  public getConnectionStats(): any {
    const stats = {
      totalConnections: this.connections.size,
      authenticatedConnections: 0,
      subscriptionsByChannel: new Map<string, number>(),
      connectionsByOrganization: new Map<string, number>(),
    };

    for (const connection of this.connections.values()) {
      if (connection.userId) {
        stats.authenticatedConnections++;
      }

      if (connection.organizationId) {
        const count = stats.connectionsByOrganization.get(connection.organizationId) || 0;
        stats.connectionsByOrganization.set(connection.organizationId, count + 1);
      }

      for (const channel of connection.subscriptions) {
        const count = stats.subscriptionsByChannel.get(channel) || 0;
        stats.subscriptionsByChannel.set(channel, count + 1);
      }
    }

    return {
      ...stats,
      subscriptionsByChannel: Object.fromEntries(stats.subscriptionsByChannel),
      connectionsByOrganization: Object.fromEntries(stats.connectionsByOrganization),
    };
  }

  private setupCleanupInterval(): void {
    // Clean up inactive connections every 5 minutes
    setInterval(() => {
      const cutoff = new Date(Date.now() - 10 * 60 * 1000); // 10 minutes ago
      const inactiveConnections: string[] = [];

      for (const [connectionId, connection] of this.connections) {
        if (connection.lastActivity < cutoff) {
          inactiveConnections.push(connectionId);
        }
      }

      for (const connectionId of inactiveConnections) {
        logger.info({ connectionId }, 'Cleaning up inactive WebSocket connection');
        this.handleDisconnection(connectionId);
      }

      if (inactiveConnections.length > 0) {
        logger.info({
          cleanedUp: inactiveConnections.length,
          remaining: this.connections.size,
        }, 'WebSocket cleanup completed');
      }

    }, 5 * 60 * 1000); // Every 5 minutes
  }
}