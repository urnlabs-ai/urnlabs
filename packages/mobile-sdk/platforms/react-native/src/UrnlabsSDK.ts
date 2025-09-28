/**
 * React Native implementation of the Urnlabs SDK
 */

import {
  UrnlabsSDKBase,
  SDKConfig,
  WebSocketClient,
  createHttpClient,
  createWebSocketClient,
  AuthManager
} from '@urnlabs/mobile-sdk-core';
import { ReactNativeStorageAdapter } from './storage/AsyncStorageAdapter';
import { ReactNativeWebSocketClient } from './websocket/ReactNativeWebSocketClient';
import NetInfo from '@react-native-community/netinfo';

export class UrnlabsReactNativeSDK extends UrnlabsSDKBase {
  private netInfoUnsubscribe?: () => void;

  constructor(config: Partial<SDKConfig>) {
    const storage = new ReactNativeStorageAdapter();
    const httpClient = createHttpClient({
      baseURL: config.apiUrl || 'https://api.urnlabs.com',
      timeout: config.timeout || 30000,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'UrnlabsSDK-ReactNative/1.0.0'
      },
      retryAttempts: config.retryAttempts || 3,
      retryDelay: config.retryDelay || 1000
    });

    super(config, httpClient, storage);
    this.setupNetworkMonitoring();
  }

  protected createWebSocketClient(): WebSocketClient | null {
    if (!this.config.websocketUrl) {
      return null;
    }

    return new ReactNativeWebSocketClient({
      url: this.config.websocketUrl,
      reconnectAttempts: 5,
      reconnectDelay: 1000,
      heartbeatInterval: 30000,
      connectionTimeout: 10000,
      enableLogging: this.config.enableLogging
    });
  }

  protected async handlePlatformSpecificSetup(): Promise<void> {
    // React Native specific setup
    this.log('info', 'Setting up React Native specific features');

    // Set up auth token interceptor
    this.setupAuthInterceptor();

    // Set up network change listener
    this.setupNetworkChangeListener();
  }

  private setupAuthInterceptor(): void {
    // Auto-inject auth token into HTTP requests
    this.httpClient.setHeader('X-Platform', 'react-native');
  }

  private setupNetworkMonitoring(): void {
    this.netInfoUnsubscribe = NetInfo.addEventListener(state => {
      this.log('debug', 'Network state changed', {
        isConnected: state.isConnected,
        type: state.type
      });

      this.emit('network:changed', {
        isConnected: state.isConnected,
        connectionType: state.type,
        isInternetReachable: state.isInternetReachable
      });

      // Reconnect WebSocket if network is back
      if (state.isConnected && this.wsClient && !this.wsClient.isConnected()) {
        this.wsClient.connect().catch(error => {
          this.log('error', 'Failed to reconnect WebSocket after network recovery', { error });
        });
      }
    });
  }

  private setupNetworkChangeListener(): void {
    this.on('network:changed', (event) => {
      if (!event.data.isConnected) {
        this.log('warn', 'Network disconnected - entering offline mode');
        this.emit('sdk:offline', { timestamp: new Date().toISOString() });
      } else {
        this.log('info', 'Network reconnected - exiting offline mode');
        this.emit('sdk:online', { timestamp: new Date().toISOString() });
      }
    });
  }

  /**
   * Check network connectivity
   */
  public async checkNetworkConnectivity(): Promise<{
    isConnected: boolean;
    connectionType: string;
    isInternetReachable: boolean | null;
  }> {
    const state = await NetInfo.fetch();
    return {
      isConnected: state.isConnected || false,
      connectionType: state.type,
      isInternetReachable: state.isInternetReachable
    };
  }

  /**
   * Enable or disable offline mode
   */
  public setOfflineMode(enabled: boolean): void {
    if (enabled) {
      this.log('info', 'Offline mode enabled');
      this.emit('sdk:offline_mode_enabled', { timestamp: new Date().toISOString() });
    } else {
      this.log('info', 'Offline mode disabled');
      this.emit('sdk:offline_mode_disabled', { timestamp: new Date().toISOString() });
    }
  }

  /**
   * Cleanup React Native specific resources
   */
  public async shutdown(): Promise<void> {
    // Cleanup network monitoring
    if (this.netInfoUnsubscribe) {
      this.netInfoUnsubscribe();
      this.netInfoUnsubscribe = undefined;
    }

    // Call parent shutdown
    await super.shutdown();
  }
}

/**
 * Factory function to create React Native SDK instance
 */
export function createUrnlabsSDK(config: Partial<SDKConfig>): UrnlabsReactNativeSDK {
  return new UrnlabsReactNativeSDK(config);
}