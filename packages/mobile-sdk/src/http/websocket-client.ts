/**
 * WebSocket client for real-time communication
 */

import {
  WebSocketClient,
  RealtimeMessage,
  RealtimeSubscription,
  SDKError,
  SDKErrorCode
} from '../core/types';

export interface WebSocketConfig {
  url: string;
  protocols?: string[];
  reconnectAttempts: number;
  reconnectDelay: number;
  heartbeatInterval: number;
  connectionTimeout: number;
  enableLogging: boolean;
}

export interface WebSocketMessage {
  type: string;
  channel?: string;
  payload: any;
  id?: string;
  timestamp?: string;
}

export class UrnlabsWebSocketClient implements WebSocketClient {
  private config: WebSocketConfig;
  private ws: WebSocket | null = null;
  private isConnected = false;
  private isConnecting = false;
  private subscriptions = new Map<string, RealtimeSubscription>();
  private messageQueue: WebSocketMessage[] = [];
  private reconnectAttempt = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private connectionPromise: Promise<void> | null = null;

  constructor(config: Partial<WebSocketConfig>) {
    this.config = {
      url: 'wss://ws.urnlabs.com',
      protocols: [],
      reconnectAttempts: 5,
      reconnectDelay: 1000,
      heartbeatInterval: 30000,
      connectionTimeout: 10000,
      enableLogging: true,
      ...config
    };
  }

  /**
   * Connect to WebSocket server
   */
  public async connect(): Promise<void> {
    if (this.isConnected || this.isConnecting) {
      return this.connectionPromise || Promise.resolve();
    }

    this.isConnecting = true;
    this.connectionPromise = this.performConnection();

    try {
      await this.connectionPromise;
    } finally {
      this.isConnecting = false;
      this.connectionPromise = null;
    }
  }

  private performConnection(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.log('info', `Connecting to WebSocket: ${this.config.url}`);

        this.ws = new WebSocket(this.config.url, this.config.protocols);

        const connectionTimeout = setTimeout(() => {
          if (this.ws && this.ws.readyState === WebSocket.CONNECTING) {
            this.ws.close();
            reject(this.createError('TIMEOUT_ERROR', 'WebSocket connection timeout'));
          }
        }, this.config.connectionTimeout);

        this.ws.onopen = () => {
          clearTimeout(connectionTimeout);
          this.isConnected = true;
          this.reconnectAttempt = 0;
          this.log('info', 'WebSocket connected successfully');

          // Start heartbeat
          this.startHeartbeat();

          // Send queued messages
          this.flushMessageQueue();

          resolve();
        };

        this.ws.onmessage = (event) => {
          try {
            const message: RealtimeMessage = JSON.parse(event.data);
            this.handleMessage(message);
          } catch (error) {
            this.log('error', 'Failed to parse WebSocket message', { error, data: event.data });
          }
        };

        this.ws.onclose = (event) => {
          clearTimeout(connectionTimeout);
          this.handleDisconnection(event);

          if (!this.isConnecting) {
            reject(this.createError('NETWORK_ERROR', `WebSocket connection closed: ${event.reason}`));
          }
        };

        this.ws.onerror = (error) => {
          clearTimeout(connectionTimeout);
          this.log('error', 'WebSocket error', { error });

          if (!this.isConnecting) {
            reject(this.createError('NETWORK_ERROR', 'WebSocket connection error'));
          }
        };

      } catch (error) {
        reject(this.createError('NETWORK_ERROR', 'Failed to create WebSocket connection', error));
      }
    });
  }

  /**
   * Disconnect from WebSocket server
   */
  public async disconnect(): Promise<void> {
    this.log('info', 'Disconnecting WebSocket...');

    // Clear reconnection timer
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    // Clear heartbeat timer
    this.stopHeartbeat();

    // Close WebSocket connection
    if (this.ws) {
      this.ws.close(1000, 'Client disconnect');
      this.ws = null;
    }

    this.isConnected = false;
    this.isConnecting = false;
  }

  /**
   * Send message to server
   */
  public async send(message: any): Promise<void> {
    const wsMessage: WebSocketMessage = {
      type: 'message',
      payload: message,
      id: this.generateMessageId(),
      timestamp: new Date().toISOString()
    };

    if (this.isConnected && this.ws?.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify(wsMessage));
        this.log('debug', 'Message sent', { message: wsMessage });
      } catch (error) {
        this.log('error', 'Failed to send message', { error, message: wsMessage });
        throw this.createError('NETWORK_ERROR', 'Failed to send WebSocket message');
      }
    } else {
      // Queue message for later sending
      this.messageQueue.push(wsMessage);
      this.log('debug', 'Message queued (not connected)', { message: wsMessage });

      // Try to reconnect if not connected
      if (!this.isConnected && !this.isConnecting) {
        this.scheduleReconnect();
      }
    }
  }

  /**
   * Subscribe to a channel
   */
  public subscribe(channel: string, callback: (message: any) => void): string {
    const subscriptionId = this.generateSubscriptionId();
    const subscription: RealtimeSubscription = {
      id: subscriptionId,
      channel,
      callback
    };

    this.subscriptions.set(subscriptionId, subscription);

    // Send subscription message if connected
    if (this.isConnected) {
      this.sendSubscriptionMessage('subscribe', channel, subscriptionId);
    }

    this.log('debug', 'Subscribed to channel', { channel, subscriptionId });
    return subscriptionId;
  }

  /**
   * Unsubscribe from a channel
   */
  public unsubscribe(subscriptionId: string): void {
    const subscription = this.subscriptions.get(subscriptionId);
    if (subscription) {
      this.subscriptions.delete(subscriptionId);

      // Send unsubscription message if connected
      if (this.isConnected) {
        this.sendSubscriptionMessage('unsubscribe', subscription.channel, subscriptionId);
      }

      this.log('debug', 'Unsubscribed from channel', {
        channel: subscription.channel,
        subscriptionId
      });
    }
  }

  /**
   * Check if WebSocket is connected
   */
  public isConnected(): boolean {
    return this.isConnected && this.ws?.readyState === WebSocket.OPEN;
  }

  private handleMessage(message: RealtimeMessage): void {
    this.log('debug', 'Received message', { message });

    // Handle heartbeat responses
    if (message.type === 'pong') {
      return;
    }

    // Distribute message to subscribers
    for (const subscription of this.subscriptions.values()) {
      if (subscription.channel === '*' || subscription.channel === message.type) {
        try {
          subscription.callback(message);
        } catch (error) {
          this.log('error', 'Error in subscription callback', { error, subscription });
        }
      }
    }
  }

  private handleDisconnection(event: CloseEvent): void {
    this.isConnected = false;
    this.stopHeartbeat();

    this.log('warn', 'WebSocket disconnected', {
      code: event.code,
      reason: event.reason,
      wasClean: event.wasClean
    });

    // Schedule reconnection if not a clean close
    if (!event.wasClean && event.code !== 1000) {
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempt >= this.config.reconnectAttempts) {
      this.log('error', 'Max reconnection attempts reached');
      return;
    }

    if (this.reconnectTimer) {
      return; // Already scheduled
    }

    const delay = this.config.reconnectDelay * Math.pow(2, this.reconnectAttempt);
    this.reconnectAttempt++;

    this.log('info', `Scheduling reconnection attempt ${this.reconnectAttempt} in ${delay}ms`);

    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      try {
        await this.connect();
        this.resubscribeAll();
      } catch (error) {
        this.log('error', 'Reconnection attempt failed', { error });
        this.scheduleReconnect();
      }
    }, delay);
  }

  private resubscribeAll(): void {
    this.log('info', 'Resubscribing to all channels');
    for (const subscription of this.subscriptions.values()) {
      this.sendSubscriptionMessage('subscribe', subscription.channel, subscription.id);
    }
  }

  private sendSubscriptionMessage(action: 'subscribe' | 'unsubscribe', channel: string, subscriptionId: string): void {
    const message: WebSocketMessage = {
      type: action,
      channel,
      payload: { subscriptionId },
      id: this.generateMessageId(),
      timestamp: new Date().toISOString()
    };

    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      if (this.isConnected && this.ws?.readyState === WebSocket.OPEN) {
        const pingMessage: WebSocketMessage = {
          type: 'ping',
          payload: {},
          id: this.generateMessageId(),
          timestamp: new Date().toISOString()
        };
        this.ws.send(JSON.stringify(pingMessage));
      }
    }, this.config.heartbeatInterval);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private flushMessageQueue(): void {
    if (this.messageQueue.length > 0) {
      this.log('info', `Sending ${this.messageQueue.length} queued messages`);

      for (const message of this.messageQueue) {
        try {
          this.ws!.send(JSON.stringify(message));
        } catch (error) {
          this.log('error', 'Failed to send queued message', { error, message });
        }
      }

      this.messageQueue = [];
    }
  }

  private generateMessageId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateSubscriptionId(): string {
    return `sub_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private createError(code: SDKErrorCode, message: string, originalError?: any): SDKError {
    const error = new Error(message) as SDKError;
    error.name = 'WebSocketError';
    error.code = code;
    error.details = { originalError };
    error.timestamp = new Date().toISOString();
    return error;
  }

  private log(level: 'debug' | 'info' | 'warn' | 'error', message: string, data?: any): void {
    if (!this.config.enableLogging) {
      return;
    }

    if (typeof console !== 'undefined') {
      console[level === 'debug' ? 'log' : level](`[WebSocketClient] ${message}`, data || '');
    }
  }
}

/**
 * Factory function to create WebSocket client
 */
export function createWebSocketClient(config: Partial<WebSocketConfig>): UrnlabsWebSocketClient {
  return new UrnlabsWebSocketClient(config);
}