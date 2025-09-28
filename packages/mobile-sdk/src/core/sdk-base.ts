/**
 * Base SDK class that provides common functionality across all platform implementations
 */

import { EventEmitter as NodeEventEmitter } from 'events';
import {
  SDKConfig,
  AuthState,
  HttpClient,
  WebSocketClient,
  StorageAdapter,
  EventEmitter,
  SDKEvent,
  SDKError,
  SDKErrorCode
} from './types';

export abstract class UrnlabsSDKBase implements EventEmitter {
  protected config: SDKConfig;
  protected httpClient: HttpClient;
  protected wsClient: WebSocketClient | null = null;
  protected storage: StorageAdapter;
  protected eventEmitter: NodeEventEmitter;
  protected authState: AuthState;
  protected isInitialized = false;

  constructor(config: Partial<SDKConfig>, httpClient: HttpClient, storage: StorageAdapter) {
    this.config = this.mergeConfig(config);
    this.httpClient = httpClient;
    this.storage = storage;
    this.eventEmitter = new NodeEventEmitter();
    this.authState = {
      isAuthenticated: false,
      user: null,
      tokens: null,
      isLoading: false,
      error: null
    };
  }

  private mergeConfig(userConfig: Partial<SDKConfig>): SDKConfig {
    const defaultConfig: SDKConfig = {
      apiUrl: 'https://api.urnlabs.com',
      websocketUrl: 'wss://ws.urnlabs.com',
      timeout: 30000,
      retryAttempts: 3,
      retryDelay: 1000,
      enableLogging: true,
      logLevel: 'info',
      enableOffline: true,
      certificatePinning: {
        enabled: false,
        certificates: []
      }
    };

    return { ...defaultConfig, ...userConfig };
  }

  /**
   * Initialize the SDK
   */
  public async initialize(): Promise<void> {
    try {
      this.log('info', 'Initializing Urnlabs SDK...');

      // Restore authentication state from storage
      await this.restoreAuthState();

      // Initialize WebSocket if needed
      if (this.config.websocketUrl) {
        await this.initializeWebSocket();
      }

      this.isInitialized = true;
      this.emit('sdk:initialized', { timestamp: new Date().toISOString() });
      this.log('info', 'SDK initialized successfully');
    } catch (error) {
      const sdkError = this.createError('UNKNOWN_ERROR', 'Failed to initialize SDK', error);
      this.log('error', 'SDK initialization failed', { error: sdkError });
      throw sdkError;
    }
  }

  /**
   * Cleanup and shutdown the SDK
   */
  public async shutdown(): Promise<void> {
    try {
      this.log('info', 'Shutting down SDK...');

      if (this.wsClient?.isConnected()) {
        await this.wsClient.disconnect();
      }

      this.eventEmitter.removeAllListeners();
      this.isInitialized = false;

      this.emit('sdk:shutdown', { timestamp: new Date().toISOString() });
      this.log('info', 'SDK shutdown complete');
    } catch (error) {
      this.log('error', 'Error during SDK shutdown', { error });
    }
  }

  /**
   * Get current authentication state
   */
  public getAuthState(): AuthState {
    return { ...this.authState };
  }

  /**
   * Check if SDK is ready for use
   */
  public isReady(): boolean {
    return this.isInitialized;
  }

  /**
   * Get SDK configuration
   */
  public getConfig(): SDKConfig {
    return { ...this.config };
  }

  // Event Emitter Implementation
  public on(event: string, callback: (data: any) => void): void {
    this.eventEmitter.on(event, callback);
  }

  public off(event: string, callback?: (data: any) => void): void {
    if (callback) {
      this.eventEmitter.off(event, callback);
    } else {
      this.eventEmitter.removeAllListeners(event);
    }
  }

  public emit(event: string, data: any): void {
    const sdkEvent: SDKEvent = {
      type: event,
      data,
      timestamp: new Date().toISOString()
    };
    this.eventEmitter.emit(event, sdkEvent);
  }

  // Protected utility methods

  protected async restoreAuthState(): Promise<void> {
    try {
      const storedTokens = await this.storage.get('auth_tokens');
      const storedUser = await this.storage.get('auth_user');

      if (storedTokens && storedUser) {
        // Check if tokens are still valid
        if (storedTokens.expiresAt > Date.now()) {
          this.authState = {
            isAuthenticated: true,
            user: storedUser,
            tokens: storedTokens,
            isLoading: false,
            error: null
          };
          this.log('info', 'Authentication state restored from storage');
        } else {
          // Tokens expired, clear storage
          await this.clearAuthState();
          this.log('info', 'Stored tokens expired, cleared auth state');
        }
      }
    } catch (error) {
      this.log('error', 'Failed to restore auth state', { error });
      await this.clearAuthState();
    }
  }

  protected async saveAuthState(): Promise<void> {
    try {
      if (this.authState.tokens && this.authState.user) {
        await this.storage.set('auth_tokens', this.authState.tokens);
        await this.storage.set('auth_user', this.authState.user);
        this.log('debug', 'Authentication state saved to storage');
      }
    } catch (error) {
      this.log('error', 'Failed to save auth state', { error });
    }
  }

  protected async clearAuthState(): Promise<void> {
    try {
      await this.storage.remove('auth_tokens');
      await this.storage.remove('auth_user');
      this.authState = {
        isAuthenticated: false,
        user: null,
        tokens: null,
        isLoading: false,
        error: null
      };
      this.log('debug', 'Authentication state cleared');
    } catch (error) {
      this.log('error', 'Failed to clear auth state', { error });
    }
  }

  protected async initializeWebSocket(): Promise<void> {
    if (!this.wsClient) {
      return;
    }

    try {
      await this.wsClient.connect();
      this.log('info', 'WebSocket connected successfully');

      // Set up WebSocket event handlers
      this.wsClient.subscribe('*', (message) => {
        this.emit('realtime:message', message);
      });

    } catch (error) {
      this.log('error', 'Failed to initialize WebSocket', { error });
      // Don't throw here, WebSocket is optional
    }
  }

  protected createError(
    code: SDKErrorCode,
    message: string,
    originalError?: any,
    statusCode?: number,
    details?: Record<string, any>
  ): SDKError {
    const error = new Error(message) as SDKError;
    error.name = 'SDKError';
    error.code = code;
    error.statusCode = statusCode;
    error.details = details;
    error.timestamp = new Date().toISOString();

    if (originalError) {
      error.stack = originalError.stack;
    }

    return error;
  }

  protected log(level: 'debug' | 'info' | 'warn' | 'error', message: string, data?: any): void {
    if (!this.config.enableLogging) {
      return;
    }

    const levels = ['debug', 'info', 'warn', 'error'];
    const configLevel = levels.indexOf(this.config.logLevel);
    const currentLevel = levels.indexOf(level);

    if (currentLevel >= configLevel) {
      const logData = {
        timestamp: new Date().toISOString(),
        level,
        message,
        ...data
      };

      // Emit log event for platform-specific logging
      this.emit('sdk:log', logData);

      // Default console logging (can be overridden by platforms)
      if (typeof console !== 'undefined') {
        console[level === 'debug' ? 'log' : level](`[UrnlabsSDK] ${message}`, data || '');
      }
    }
  }

  // Abstract methods that must be implemented by platform-specific SDKs
  protected abstract createWebSocketClient(): WebSocketClient | null;
  protected abstract handlePlatformSpecificSetup(): Promise<void>;
}