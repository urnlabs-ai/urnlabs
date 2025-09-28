/**
 * Comprehensive error handling system for the SDK
 */

import { SDKError, SDKErrorCode } from '../core/types';
import { Logger } from './logger';

export interface ErrorContext {
  component?: string;
  operation?: string;
  userId?: string;
  sessionId?: string;
  requestId?: string;
  metadata?: Record<string, any>;
}

export interface ErrorHandlerConfig {
  enableReporting: boolean;
  reportEndpoint?: string;
  maxRetries: number;
  retryDelay: number;
  enableStackTrace: boolean;
  sanitizeData: boolean;
  logger?: Logger;
}

export interface ErrorReport {
  error: SDKError;
  context: ErrorContext;
  timestamp: string;
  userAgent?: string;
  platform?: string;
  sdkVersion?: string;
  stackTrace?: string;
}

export class ErrorHandler {
  private config: ErrorHandlerConfig;
  private logger?: Logger;
  private errorQueue: ErrorReport[] = [];
  private retryQueue: ErrorReport[] = [];

  constructor(config: Partial<ErrorHandlerConfig> = {}) {
    this.config = {
      enableReporting: false,
      maxRetries: 3,
      retryDelay: 1000,
      enableStackTrace: true,
      sanitizeData: true,
      ...config
    };

    this.logger = config.logger;
  }

  /**
   * Handle an error with context
   */
  public handleError(
    error: Error | SDKError,
    context: ErrorContext = {}
  ): SDKError {
    const sdkError = this.normalizeError(error, context);

    // Log the error
    if (this.logger) {
      this.logger.error(
        `${context.component || 'SDK'} Error: ${sdkError.message}`,
        sdkError,
        {
          code: sdkError.code,
          statusCode: sdkError.statusCode,
          operation: context.operation,
          ...context.metadata
        }
      );
    }

    // Report error if enabled
    if (this.config.enableReporting) {
      this.reportError(sdkError, context);
    }

    return sdkError;
  }

  /**
   * Handle async errors
   */
  public async handleAsyncError<T>(
    operation: () => Promise<T>,
    context: ErrorContext = {}
  ): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      throw this.handleError(error as Error, context);
    }
  }

  /**
   * Create a standardized SDK error
   */
  public createError(
    code: SDKErrorCode,
    message: string,
    context: ErrorContext = {},
    originalError?: Error
  ): SDKError {
    const error = new Error(message) as SDKError;
    error.name = 'SDKError';
    error.code = code;
    error.timestamp = new Date().toISOString();
    error.details = {
      component: context.component,
      operation: context.operation,
      ...context.metadata
    };

    if (originalError) {
      error.stack = originalError.stack;
      error.details.originalError = {
        name: originalError.name,
        message: originalError.message
      };
    }

    return error;
  }

  /**
   * Create an authentication error
   */
  public createAuthError(
    message: string,
    context: ErrorContext = {},
    statusCode?: number
  ): SDKError {
    const error = this.createError('AUTH_ERROR', message, context);
    error.statusCode = statusCode || 401;
    return error;
  }

  /**
   * Create a network error
   */
  public createNetworkError(
    message: string,
    context: ErrorContext = {},
    statusCode?: number
  ): SDKError {
    const error = this.createError('NETWORK_ERROR', message, context);
    error.statusCode = statusCode;
    return error;
  }

  /**
   * Create a validation error
   */
  public createValidationError(
    message: string,
    context: ErrorContext = {},
    validationErrors?: Record<string, string[]>
  ): SDKError {
    const error = this.createError('VALIDATION_ERROR', message, context);
    error.statusCode = 400;
    if (validationErrors) {
      error.details.validationErrors = validationErrors;
    }
    return error;
  }

  /**
   * Create a timeout error
   */
  public createTimeoutError(
    message: string,
    context: ErrorContext = {},
    timeoutMs?: number
  ): SDKError {
    const error = this.createError('TIMEOUT_ERROR', message, context);
    error.statusCode = 408;
    if (timeoutMs) {
      error.details.timeoutMs = timeoutMs;
    }
    return error;
  }

  /**
   * Create a permission error
   */
  public createPermissionError(
    message: string,
    context: ErrorContext = {},
    requiredPermissions?: string[]
  ): SDKError {
    const error = this.createError('PERMISSION_ERROR', message, context);
    error.statusCode = 403;
    if (requiredPermissions) {
      error.details.requiredPermissions = requiredPermissions;
    }
    return error;
  }

  /**
   * Create a server error
   */
  public createServerError(
    message: string,
    context: ErrorContext = {},
    statusCode?: number
  ): SDKError {
    const error = this.createError('SERVER_ERROR', message, context);
    error.statusCode = statusCode || 500;
    return error;
  }

  /**
   * Check if an error is retryable
   */
  public isRetryableError(error: SDKError): boolean {
    const retryableCodes: SDKErrorCode[] = [
      'NETWORK_ERROR',
      'TIMEOUT_ERROR',
      'SERVER_ERROR'
    ];

    if (retryableCodes.includes(error.code)) {
      return true;
    }

    // Check status codes
    if (error.statusCode) {
      const retryableStatusCodes = [408, 429, 500, 502, 503, 504];
      return retryableStatusCodes.includes(error.statusCode);
    }

    return false;
  }

  /**
   * Get user-friendly error message
   */
  public getUserFriendlyMessage(error: SDKError): string {
    const friendlyMessages: Record<SDKErrorCode, string> = {
      'NETWORK_ERROR': 'Network connection failed. Please check your internet connection and try again.',
      'AUTH_ERROR': 'Authentication failed. Please check your credentials and try again.',
      'VALIDATION_ERROR': 'The provided data is invalid. Please check your input and try again.',
      'TIMEOUT_ERROR': 'The request timed out. Please try again.',
      'PERMISSION_ERROR': 'You do not have permission to perform this action.',
      'SERVER_ERROR': 'A server error occurred. Please try again later.',
      'OFFLINE_ERROR': 'You are currently offline. Please check your connection.',
      'UNKNOWN_ERROR': 'An unexpected error occurred. Please try again.'
    };

    return friendlyMessages[error.code] || error.message;
  }

  /**
   * Set up global error handlers
   */
  public setupGlobalHandlers(): void {
    // Handle unhandled promise rejections
    if (typeof window !== 'undefined') {
      window.addEventListener('unhandledrejection', (event) => {
        const error = this.createError(
          'UNKNOWN_ERROR',
          'Unhandled promise rejection',
          { component: 'Global' },
          event.reason
        );
        this.handleError(error);
        event.preventDefault();
      });

      // Handle uncaught errors
      window.addEventListener('error', (event) => {
        const error = this.createError(
          'UNKNOWN_ERROR',
          event.message || 'Uncaught error',
          { 
            component: 'Global',
            metadata: {
              filename: event.filename,
              lineNumber: event.lineno,
              columnNumber: event.colno
            }
          },
          event.error
        );
        this.handleError(error);
      });
    } else if (typeof process !== 'undefined') {
      // Node.js environment
      process.on('unhandledRejection', (reason) => {
        const error = this.createError(
          'UNKNOWN_ERROR',
          'Unhandled promise rejection',
          { component: 'Global' },
          reason as Error
        );
        this.handleError(error);
      });

      process.on('uncaughtException', (err) => {
        const error = this.createError(
          'UNKNOWN_ERROR',
          'Uncaught exception',
          { component: 'Global' },
          err
        );
        this.handleError(error);
      });
    }
  }

  /**
   * Get recent errors
   */
  public getRecentErrors(count: number = 50): ErrorReport[] {
    return this.errorQueue.slice(-count);
  }

  /**
   * Clear error queue
   */
  public clearErrors(): void {
    this.errorQueue = [];
    this.retryQueue = [];
  }

  /**
   * Export errors for debugging
   */
  public exportErrors(): string {
    const exportData = {
      timestamp: new Date().toISOString(),
      errors: this.errorQueue,
      retryQueue: this.retryQueue,
      config: {
        ...this.config,
        logger: undefined // Don't serialize logger
      }
    };

    return JSON.stringify(exportData, null, 2);
  }

  private normalizeError(error: Error | SDKError, context: ErrorContext): SDKError {
    // If it's already an SDKError, enhance it with context
    if ('code' in error && error.code) {
      const sdkError = error as SDKError;
      if (context.component && !sdkError.details?.component) {
        sdkError.details = { ...sdkError.details, component: context.component };
      }
      if (context.operation && !sdkError.details?.operation) {
        sdkError.details = { ...sdkError.details, operation: context.operation };
      }
      return sdkError;
    }

    // Convert regular Error to SDKError
    let code: SDKErrorCode = 'UNKNOWN_ERROR';
    let statusCode: number | undefined;

    // Try to infer error type from message or properties
    if (error.message.toLowerCase().includes('network') || 
        error.message.toLowerCase().includes('fetch')) {
      code = 'NETWORK_ERROR';
    } else if (error.message.toLowerCase().includes('timeout')) {
      code = 'TIMEOUT_ERROR';
      statusCode = 408;
    } else if (error.message.toLowerCase().includes('unauthorized') ||
               error.message.toLowerCase().includes('authentication')) {
      code = 'AUTH_ERROR';
      statusCode = 401;
    } else if (error.message.toLowerCase().includes('forbidden') ||
               error.message.toLowerCase().includes('permission')) {
      code = 'PERMISSION_ERROR';
      statusCode = 403;
    } else if (error.message.toLowerCase().includes('validation') ||
               error.message.toLowerCase().includes('invalid')) {
      code = 'VALIDATION_ERROR';
      statusCode = 400;
    }

    return this.createError(code, error.message, context, error);
  }

  private async reportError(error: SDKError, context: ErrorContext): Promise<void> {
    const report: ErrorReport = {
      error: this.config.sanitizeData ? this.sanitizeError(error) : error,
      context: this.config.sanitizeData ? this.sanitizeContext(context) : context,
      timestamp: new Date().toISOString(),
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
      platform: typeof navigator !== 'undefined' ? navigator.platform : process?.platform,
      sdkVersion: '1.0.0' // Should be imported from package.json
    };

    if (this.config.enableStackTrace && error.stack) {
      report.stackTrace = error.stack;
    }

    this.errorQueue.push(report);

    // Limit queue size
    if (this.errorQueue.length > 1000) {
      this.errorQueue.shift();
    }

    // Send to remote endpoint if configured
    if (this.config.reportEndpoint) {
      this.sendErrorReport(report);
    }
  }

  private async sendErrorReport(report: ErrorReport): Promise<void> {
    // Add to retry queue
    this.retryQueue.push(report);

    // Implement retry logic here
    // This would integrate with the HTTP client when available
  }

  private sanitizeError(error: SDKError): SDKError {
    const sanitized = { ...error };
    
    // Remove sensitive data from error details
    if (sanitized.details) {
      sanitized.details = this.sanitizeObject(sanitized.details);
    }

    return sanitized;
  }

  private sanitizeContext(context: ErrorContext): ErrorContext {
    return {
      ...context,
      metadata: context.metadata ? this.sanitizeObject(context.metadata) : undefined
    };
  }

  private sanitizeObject(obj: Record<string, any>): Record<string, any> {
    const sensitiveKeys = [
      'password', 'token', 'apikey', 'secret', 'authorization',
      'cookie', 'session', 'auth', 'credential', 'key'
    ];

    const sanitized: Record<string, any> = {};

    for (const [key, value] of Object.entries(obj)) {
      const isKeywordSensitive = sensitiveKeys.some(sensitive => 
        key.toLowerCase().includes(sensitive)
      );

      if (isKeywordSensitive) {
        sanitized[key] = '[REDACTED]';
      } else if (typeof value === 'object' && value !== null) {
        sanitized[key] = this.sanitizeObject(value);
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }
}

/**
 * Create a default error handler instance
 */
export function createErrorHandler(config: Partial<ErrorHandlerConfig> = {}): ErrorHandler {
  return new ErrorHandler(config);
}

/**
 * Global error handler instance
 */
export const defaultErrorHandler = createErrorHandler({
  enableReporting: false,
  enableStackTrace: true,
  sanitizeData: true
});