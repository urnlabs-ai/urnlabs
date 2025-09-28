import { WebSocketServer, WebSocket } from 'ws';
import { EventEmitter } from 'events';
import { IncomingMessage } from 'http';
import { MetricsCollector, MetricsData } from '../metrics/MetricsCollector.js';
import { PerformanceOptimizer } from '../performance/PerformanceOptimizer.js';

interface WebSocketClient {
  id: string;
  ws: WebSocket;
  subscriptions: Set<string>;
  lastPing: number;
  isAlive: boolean;
}

interface MetricsSubscription {
  type: 'metrics' | 'alerts' | 'performance';
  filters?: {
    services?: string[];
    metrics?: string[];
    timeRange?: { start: number; end: number };
  };
}

interface WebSocketMessage {
  type: 'subscribe' | 'unsubscribe' | 'ping' | 'request_data';
  subscription?: MetricsSubscription;
  data?: any;
  requestId?: string;
}

export class MetricsWebSocketServer extends EventEmitter {
  private wss: WebSocketServer;
  private clients = new Map<string, WebSocketClient>();
  private metricsCollector: MetricsCollector;
  private performanceOptimizer: PerformanceOptimizer;
  private heartbeatInterval: NodeJS.Timeout;

  constructor(
    port: number,
    metricsCollector: MetricsCollector,
    performanceOptimizer: PerformanceOptimizer
  ) {
    super();

    this.metricsCollector = metricsCollector;
    this.performanceOptimizer = performanceOptimizer;

    this.wss = new WebSocketServer({
      port,
      perMessageDeflate: false,
      clientTracking: false
    });

    this.initializeWebSocketServer();
    this.startHeartbeat();
  }

  private initializeWebSocketServer(): void {
    this.wss.on('connection', (ws: WebSocket, request: IncomingMessage) => {
      const clientId = this.generateClientId();
      const client: WebSocketClient = {
        id: clientId,
        ws,
        subscriptions: new Set(),
        lastPing: Date.now(),
        isAlive: true
      };

      this.clients.set(clientId, client);

      console.log(`WebSocket client connected: ${clientId}`);
      this.emit('client_connected', { clientId, clientsCount: this.clients.size });

      // Send welcome message
      this.sendToClient(client, {
        type: 'connected',
        data: {
          clientId,
          timestamp: Date.now(),
          availableSubscriptions: ['metrics', 'alerts', 'performance']
        }
      });

      ws.on('message', async (data: Buffer) => {
        try {
          const message: WebSocketMessage = JSON.parse(data.toString());
          await this.handleMessage(client, message);
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
          this.sendError(client, 'Invalid message format');
        }
      });

      ws.on('pong', () => {
        client.isAlive = true;
        client.lastPing = Date.now();
      });

      ws.on('close', () => {
        console.log(`WebSocket client disconnected: ${clientId}`);
        this.clients.delete(clientId);
        this.emit('client_disconnected', { clientId, clientsCount: this.clients.size });
      });

      ws.on('error', (error) => {
        console.error(`WebSocket client error (${clientId}):`, error);
        this.clients.delete(clientId);
      });
    });

    // Listen to metrics collector events
    this.metricsCollector.on('metrics', (metrics: MetricsData) => {
      this.broadcastToSubscribers('metrics', metrics);
    });

    this.metricsCollector.on('error', (error) => {
      this.broadcastToSubscribers('alerts', {
        type: 'error',
        message: 'Metrics collection error',
        error: error.message,
        timestamp: Date.now()
      });
    });
  }

  private async handleMessage(client: WebSocketClient, message: WebSocketMessage): Promise<void> {
    switch (message.type) {
      case 'subscribe':
        if (message.subscription) {
          await this.handleSubscription(client, message.subscription);
        }
        break;

      case 'unsubscribe':
        if (message.subscription) {
          this.handleUnsubscription(client, message.subscription);
        }
        break;

      case 'ping':
        client.lastPing = Date.now();
        this.sendToClient(client, { type: 'pong', data: { timestamp: Date.now() } });
        break;

      case 'request_data':
        await this.handleDataRequest(client, message);
        break;

      default:
        this.sendError(client, `Unknown message type: ${message.type}`);
    }
  }

  private async handleSubscription(client: WebSocketClient, subscription: MetricsSubscription): Promise<void> {
    const subscriptionKey = this.getSubscriptionKey(subscription);
    client.subscriptions.add(subscriptionKey);

    console.log(`Client ${client.id} subscribed to: ${subscriptionKey}`);

    this.sendToClient(client, {
      type: 'subscription_confirmed',
      data: {
        subscription: subscriptionKey,
        timestamp: Date.now()
      }
    });

    // Send initial data based on subscription type
    await this.sendInitialData(client, subscription);
  }

  private handleUnsubscription(client: WebSocketClient, subscription: MetricsSubscription): void {
    const subscriptionKey = this.getSubscriptionKey(subscription);
    client.subscriptions.delete(subscriptionKey);

    console.log(`Client ${client.id} unsubscribed from: ${subscriptionKey}`);

    this.sendToClient(client, {
      type: 'unsubscription_confirmed',
      data: {
        subscription: subscriptionKey,
        timestamp: Date.now()
      }
    });
  }

  private async handleDataRequest(client: WebSocketClient, message: WebSocketMessage): Promise<void> {
    try {
      const { data, requestId } = message;

      if (data?.type === 'historical_metrics') {
        const { startTime, endTime } = data;
        const historicalData = await this.metricsCollector.getHistoricalMetrics(startTime, endTime);

        this.sendToClient(client, {
          type: 'data_response',
          data: {
            requestId,
            type: 'historical_metrics',
            data: historicalData,
            timestamp: Date.now()
          }
        });
      } else if (data?.type === 'performance_metrics') {
        const performanceData = await this.performanceOptimizer.getDetailedMetrics();

        this.sendToClient(client, {
          type: 'data_response',
          data: {
            requestId,
            type: 'performance_metrics',
            data: performanceData,
            timestamp: Date.now()
          }
        });
      } else {
        this.sendError(client, 'Invalid data request type', requestId);
      }
    } catch (error) {
      console.error('Error handling data request:', error);
      this.sendError(client, 'Error processing data request', message.requestId);
    }
  }

  private async sendInitialData(client: WebSocketClient, subscription: MetricsSubscription): Promise<void> {
    try {
      switch (subscription.type) {
        case 'metrics':
          const currentMetrics = this.metricsCollector.getCurrentMetrics();
          this.sendToClient(client, {
            type: 'metrics_update',
            data: currentMetrics
          });
          break;

        case 'performance':
          const performanceMetrics = await this.performanceOptimizer.getDetailedMetrics();
          this.sendToClient(client, {
            type: 'performance_update',
            data: performanceMetrics
          });
          break;

        case 'alerts':
          // Send recent alerts if any
          this.sendToClient(client, {
            type: 'alerts_update',
            data: {
              alerts: [],
              timestamp: Date.now()
            }
          });
          break;
      }
    } catch (error) {
      console.error('Error sending initial data:', error);
    }
  }

  private broadcastToSubscribers(subscriptionType: string, data: any): void {
    const message = {
      type: `${subscriptionType}_update`,
      data: {
        ...data,
        timestamp: Date.now()
      }
    };

    for (const client of this.clients.values()) {
      if (client.subscriptions.has(subscriptionType) && client.ws.readyState === WebSocket.OPEN) {
        try {
          client.ws.send(JSON.stringify(message));
        } catch (error) {
          console.error(`Error sending to client ${client.id}:`, error);
          this.clients.delete(client.id);
        }
      }
    }
  }

  private sendToClient(client: WebSocketClient, message: any): void {
    if (client.ws.readyState === WebSocket.OPEN) {
      try {
        client.ws.send(JSON.stringify(message));
      } catch (error) {
        console.error(`Error sending message to client ${client.id}:`, error);
        this.clients.delete(client.id);
      }
    }
  }

  private sendError(client: WebSocketClient, message: string, requestId?: string): void {
    this.sendToClient(client, {
      type: 'error',
      data: {
        message,
        requestId,
        timestamp: Date.now()
      }
    });
  }

  private getSubscriptionKey(subscription: MetricsSubscription): string {
    const filters = subscription.filters;
    if (!filters) return subscription.type;

    const parts = [subscription.type];
    if (filters.services) parts.push(`services:${filters.services.join(',')}`);
    if (filters.metrics) parts.push(`metrics:${filters.metrics.join(',')}`);

    return parts.join('|');
  }

  private generateClientId(): string {
    return `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      for (const [clientId, client] of this.clients.entries()) {
        if (!client.isAlive) {
          console.log(`Terminating inactive client: ${clientId}`);
          client.ws.terminate();
          this.clients.delete(clientId);
          continue;
        }

        client.isAlive = false;
        if (client.ws.readyState === WebSocket.OPEN) {
          client.ws.ping();
        }
      }
    }, 30000); // 30 seconds
  }

  public getConnectedClients(): Array<{ id: string; subscriptions: string[]; lastPing: number }> {
    return Array.from(this.clients.values()).map(client => ({
      id: client.id,
      subscriptions: Array.from(client.subscriptions),
      lastPing: client.lastPing
    }));
  }

  public broadcastAlert(alert: any): void {
    this.broadcastToSubscribers('alerts', {
      type: 'alert',
      alert,
      timestamp: Date.now()
    });
  }

  public getServerStats(): {
    connectedClients: number;
    totalConnections: number;
    uptime: number;
  } {
    return {
      connectedClients: this.clients.size,
      totalConnections: this.wss.clients.size,
      uptime: process.uptime()
    };
  }

  public destroy(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    // Close all client connections
    for (const client of this.clients.values()) {
      client.ws.close();
    }

    this.wss.close();
    this.removeAllListeners();
  }
}