/**
 * React Native WebSocket client implementation
 */

import { UrnlabsWebSocketClient, WebSocketConfig } from '@urnlabs/mobile-sdk-core';

export class ReactNativeWebSocketClient extends UrnlabsWebSocketClient {
  constructor(config: Partial<WebSocketConfig>) {
    super({
      ...config,
      // React Native specific defaults
      reconnectAttempts: config.reconnectAttempts || 5,
      reconnectDelay: config.reconnectDelay || 1000,
      heartbeatInterval: config.heartbeatInterval || 30000,
      connectionTimeout: config.connectionTimeout || 10000
    });
  }

  /**
   * Override connection method to handle React Native specific WebSocket
   */
  protected createWebSocketConnection(url: string, protocols?: string[]): WebSocket {
    // In React Native, WebSocket is available globally
    return new WebSocket(url, protocols);
  }

  /**
   * Handle React Native app state changes
   */
  public handleAppStateChange(nextAppState: string): void {
    if (nextAppState === 'active' && !this.isConnected()) {
      // App became active and WebSocket is not connected, try to reconnect
      this.connect().catch(error => {
        console.warn('Failed to reconnect WebSocket when app became active:', error);
      });
    } else if (nextAppState === 'background') {
      // App went to background, optionally disconnect to save resources
      // This depends on your app's requirements
      this.log('info', 'App went to background, WebSocket remains connected');
    }
  }

  /**
   * Get connection status for React Native components
   */
  public getConnectionInfo(): {
    isConnected: boolean;
    readyState: number;
    url?: string;
  } {
    return {
      isConnected: this.isConnected(),
      readyState: this.ws?.readyState || WebSocket.CLOSED,
      url: this.config.url
    };
  }
}