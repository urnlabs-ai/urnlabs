/**
 * Retry Mechanisms and Error Handling System
 * Implements exponential backoff, circuit breaker patterns, and comprehensive error handling
 */

import { 
  RetryPolicy, 
  ExecutionError, 
  CircuitBreakerState,
  StepExecution 
} from '@/types/workflow.js';

/**
 * Default retry policy configuration
 */
export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 3,
  baseDelay: 1000,
  maxDelay: 300000,
  backoffMultiplier: 2,
  retryableErrors: [
    'NETWORK_ERROR',
    'TIMEOUT_ERROR',
    'RATE_LIMIT_ERROR',
    'TEMPORARY_FAILURE',
    'SERVICE_UNAVAILABLE'
  ],
  nonRetryableErrors: [
    'AUTHENTICATION_ERROR',
    'AUTHORIZATION_ERROR',
    'VALIDATION_ERROR',
    'NOT_FOUND_ERROR',
    'CONFIGURATION_ERROR'
  ]
};

/**
 * Circuit breaker configuration
 */
export interface CircuitBreakerConfig {
  failureThreshold: number;
  timeoutDuration: number;
  monitoringPeriod: number;
  minimumRequestThreshold: number;
}

export const DEFAULT_CIRCUIT_BREAKER_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  timeoutDuration: 60000, // 1 minute
  monitoringPeriod: 10000, // 10 seconds
  minimumRequestThreshold: 3
};

/**
 * Retry execution result
 */
export interface RetryResult<T> {
  success: boolean;
  result?: T;
  error?: ExecutionError;
  attempts: number;
  totalDelay: number;
  finalAttempt: boolean;
}

/**
 * Retry Engine with exponential backoff and circuit breaker
 */
export class RetryEngine {
  private circuitBreakers: Map<string, CircuitBreakerState> = new Map();
  private config: CircuitBreakerConfig;

  constructor(config: Partial<CircuitBreakerConfig> = {}) {
    this.config = { ...DEFAULT_CIRCUIT_BREAKER_CONFIG, ...config };
  }

  /**
   * Execute operation with retry logic
   */
  public async executeWithRetry<T>(
    operation: () => Promise<T>,
    retryPolicy: Partial<RetryPolicy> = {},
    resourceId?: string
  ): Promise<RetryResult<T>> {
    const policy = { ...DEFAULT_RETRY_POLICY, ...retryPolicy };
    
    // Check circuit breaker if resource ID is provided
    if (resourceId && this.isCircuitBreakerOpen(resourceId)) {
      return {
        success: false,
        error: {
          code: 'CIRCUIT_BREAKER_OPEN',
          message: `Circuit breaker is open for resource: ${resourceId}`,
          retryable: false,
          category: 'system'
        },
        attempts: 0,
        totalDelay: 0,
        finalAttempt: true
      };
    }

    let lastError: ExecutionError | undefined;
    let totalDelay = 0;

    for (let attempt = 1; attempt <= policy.maxAttempts; attempt++) {
      try {
        const result = await operation();
        
        // Reset circuit breaker on success
        if (resourceId) {
          this.recordSuccess(resourceId);
        }

        return {
          success: true,
          result,
          attempts: attempt,
          totalDelay,
          finalAttempt: attempt === policy.maxAttempts
        };

      } catch (error) {
        lastError = this.normalizeError(error);
        
        // Record failure for circuit breaker
        if (resourceId) {
          this.recordFailure(resourceId);
        }

        // Check if error is retryable
        if (!this.isRetryable(lastError, policy)) {
          return {
            success: false,
            error: lastError,
            attempts: attempt,
            totalDelay,
            finalAttempt: true
          };
        }

        // Don't delay after the last attempt
        if (attempt < policy.maxAttempts) {
          const delay = this.calculateDelay(attempt, policy);
          totalDelay += delay;
          await this.sleep(delay);
        }
      }
    }

    return {
      success: false,
      error: lastError!,
      attempts: policy.maxAttempts,
      totalDelay,
      finalAttempt: true
    };
  }

  /**
   * Calculate exponential backoff delay
   */
  private calculateDelay(attempt: number, policy: RetryPolicy): number {
    const exponentialDelay = policy.baseDelay * Math.pow(policy.backoffMultiplier, attempt - 1);
    
    // Add jitter to prevent thundering herd
    const jitter = Math.random() * 0.1 * exponentialDelay;
    
    return Math.min(exponentialDelay + jitter, policy.maxDelay);
  }

  /**
   * Check if error is retryable
   */
  private isRetryable(error: ExecutionError, policy: RetryPolicy): boolean {
    // Check non-retryable errors first
    if (policy.nonRetryableErrors.includes(error.code)) {
      return false;
    }

    // Check retryable errors
    if (policy.retryableErrors.includes(error.code)) {
      return true;
    }

    // Use error.retryable flag as fallback
    return error.retryable;
  }

  /**
   * Normalize error to ExecutionError format
   */
  private normalizeError(error: any): ExecutionError {
    if (error.code && error.message) {
      return error as ExecutionError;
    }

    // Handle standard JavaScript errors
    if (error instanceof Error) {
      return {
        code: error.name || 'UNKNOWN_ERROR',
        message: error.message,
        stack: error.stack,
        retryable: true,
        category: 'system'
      };
    }

    // Handle string errors
    if (typeof error === 'string') {
      return {
        code: 'STRING_ERROR',
        message: error,
        retryable: true,
        category: 'unknown'
      };
    }

    // Handle unknown error types
    return {
      code: 'UNKNOWN_ERROR',
      message: 'An unknown error occurred',
      details: { originalError: error },
      retryable: true,
      category: 'unknown'
    };
  }

  /**
   * Sleep for specified duration
   */
  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Check if circuit breaker is open for resource
   */
  private isCircuitBreakerOpen(resourceId: string): boolean {
    const state = this.circuitBreakers.get(resourceId);
    if (!state) {
      return false;
    }

    const now = new Date();

    switch (state.state) {
      case 'closed':
        return false;

      case 'open':
        // Check if timeout has passed
        if (state.nextAttemptTime && now >= state.nextAttemptTime) {
          // Move to half-open state
          state.state = 'half-open';
          return false;
        }
        return true;

      case 'half-open':
        return false;

      default:
        return false;
    }
  }

  /**
   * Record successful operation for circuit breaker
   */
  private recordSuccess(resourceId: string): void {
    const state = this.circuitBreakers.get(resourceId);
    if (state) {
      // Reset failures and close circuit
      state.failures = 0;
      state.state = 'closed';
      state.lastFailureTime = undefined;
      state.nextAttemptTime = undefined;
    }
  }

  /**
   * Record failed operation for circuit breaker
   */
  private recordFailure(resourceId: string): void {
    let state = this.circuitBreakers.get(resourceId);
    if (!state) {
      state = {
        failures: 0,
        state: 'closed'
      };
      this.circuitBreakers.set(resourceId, state);
    }

    state.failures++;
    state.lastFailureTime = new Date();

    // Open circuit breaker if threshold exceeded
    if (state.failures >= this.config.failureThreshold) {
      state.state = 'open';
      state.nextAttemptTime = new Date(Date.now() + this.config.timeoutDuration);
    }
  }

  /**
   * Get circuit breaker state
   */
  public getCircuitBreakerState(resourceId: string): CircuitBreakerState | undefined {
    return this.circuitBreakers.get(resourceId);
  }

  /**
   * Reset circuit breaker
   */
  public resetCircuitBreaker(resourceId: string): void {
    this.circuitBreakers.delete(resourceId);
  }

  /**
   * Get all circuit breaker states
   */
  public getAllCircuitBreakerStates(): Map<string, CircuitBreakerState> {
    return new Map(this.circuitBreakers);
  }
}

/**
 * Error Classification System
 */
export class ErrorClassifier {
  /**
   * Classify error and determine appropriate handling strategy
   */
  public static classifyError(error: any): ExecutionError {
    let classified = this.normalizeError(error);

    // Apply classification rules
    classified = this.applyClassificationRules(classified);

    return classified;
  }

  /**
   * Normalize error to standard format
   */
  private static normalizeError(error: any): ExecutionError {
    if (error.code && error.message) {
      return error as ExecutionError;
    }

    // Network errors
    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      return {
        code: 'NETWORK_ERROR',
        message: `Network error: ${error.message}`,
        retryable: true,
        category: 'network'
      };
    }

    // Timeout errors
    if (error.code === 'ETIMEDOUT' || error.message?.includes('timeout')) {
      return {
        code: 'TIMEOUT_ERROR',
        message: error.message || 'Operation timed out',
        retryable: true,
        category: 'timeout'
      };
    }

    // HTTP errors
    if (error.response?.status) {
      return this.classifyHttpError(error);
    }

    // Default classification
    return {
      code: error.name || 'UNKNOWN_ERROR',
      message: error.message || 'An unknown error occurred',
      stack: error.stack,
      retryable: false,
      category: 'unknown'
    };
  }

  /**
   * Classify HTTP errors
   */
  private static classifyHttpError(error: any): ExecutionError {
    const status = error.response.status;
    const message = error.response.data?.message || error.message;

    if (status >= 500) {
      return {
        code: 'SERVER_ERROR',
        message: `Server error (${status}): ${message}`,
        retryable: true,
        category: 'system'
      };
    }

    if (status === 429) {
      return {
        code: 'RATE_LIMIT_ERROR',
        message: 'Rate limit exceeded',
        retryable: true,
        category: 'resource'
      };
    }

    if (status === 401) {
      return {
        code: 'AUTHENTICATION_ERROR',
        message: 'Authentication failed',
        retryable: false,
        category: 'authentication'
      };
    }

    if (status === 403) {
      return {
        code: 'AUTHORIZATION_ERROR',
        message: 'Authorization failed',
        retryable: false,
        category: 'authorization'
      };
    }

    if (status === 404) {
      return {
        code: 'NOT_FOUND_ERROR',
        message: 'Resource not found',
        retryable: false,
        category: 'validation'
      };
    }

    if (status >= 400) {
      return {
        code: 'CLIENT_ERROR',
        message: `Client error (${status}): ${message}`,
        retryable: false,
        category: 'validation'
      };
    }

    return {
      code: 'HTTP_ERROR',
      message: `HTTP error (${status}): ${message}`,
      retryable: false,
      category: 'unknown'
    };
  }

  /**
   * Apply classification rules based on error content
   */
  private static applyClassificationRules(error: ExecutionError): ExecutionError {
    const message = error.message.toLowerCase();

    // Database connection errors
    if (message.includes('connection') && message.includes('database')) {
      return {
        ...error,
        code: 'DATABASE_CONNECTION_ERROR',
        retryable: true,
        category: 'resource'
      };
    }

    // Out of memory errors
    if (message.includes('out of memory') || message.includes('heap')) {
      return {
        ...error,
        code: 'OUT_OF_MEMORY_ERROR',
        retryable: false,
        category: 'resource'
      };
    }

    // Permission errors
    if (message.includes('permission') || message.includes('access denied')) {
      return {
        ...error,
        code: 'PERMISSION_ERROR',
        retryable: false,
        category: 'authorization'
      };
    }

    return error;
  }
}

/**
 * Dead Letter Queue for permanently failed tasks
 */
export class DeadLetterQueue {
  private queue: Array<{
    stepExecution: StepExecution;
    error: ExecutionError;
    timestamp: Date;
    retryCount: number;
  }> = [];

  /**
   * Add failed step execution to dead letter queue
   */
  public addFailedExecution(
    stepExecution: StepExecution,
    error: ExecutionError,
    retryCount: number
  ): void {
    this.queue.push({
      stepExecution: { ...stepExecution },
      error: { ...error },
      timestamp: new Date(),
      retryCount
    });
  }

  /**
   * Get all items in dead letter queue
   */
  public getItems(): Array<{
    stepExecution: StepExecution;
    error: ExecutionError;
    timestamp: Date;
    retryCount: number;
  }> {
    return [...this.queue];
  }

  /**
   * Remove item from dead letter queue
   */
  public removeItem(stepExecutionId: string): boolean {
    const index = this.queue.findIndex(
      item => item.stepExecution.id === stepExecutionId
    );
    
    if (index !== -1) {
      this.queue.splice(index, 1);
      return true;
    }
    
    return false;
  }

  /**
   * Clear all items from dead letter queue
   */
  public clear(): void {
    this.queue = [];
  }

  /**
   * Get queue size
   */
  public size(): number {
    return this.queue.length;
  }

  /**
   * Get items by error category
   */
  public getItemsByCategory(category: string): Array<{
    stepExecution: StepExecution;
    error: ExecutionError;
    timestamp: Date;
    retryCount: number;
  }> {
    return this.queue.filter(item => item.error.category === category);
  }
}

/**
 * Comprehensive Error Handler
 */
export class ErrorHandler {
  private retryEngine: RetryEngine;
  private deadLetterQueue: DeadLetterQueue;

  constructor(
    retryEngine?: RetryEngine,
    deadLetterQueue?: DeadLetterQueue
  ) {
    this.retryEngine = retryEngine || new RetryEngine();
    this.deadLetterQueue = deadLetterQueue || new DeadLetterQueue();
  }

  /**
   * Handle step execution error with retry logic
   */
  public async handleStepError(
    stepExecution: StepExecution,
    error: any,
    retryPolicy?: Partial<RetryPolicy>
  ): Promise<{
    shouldRetry: boolean;
    retryAfter?: number;
    finalError?: ExecutionError;
  }> {
    const classifiedError = ErrorClassifier.classifyError(error);
    const policy = { ...DEFAULT_RETRY_POLICY, ...retryPolicy };

    // Check if we've exceeded max retry attempts
    if (stepExecution.retryCount >= policy.maxAttempts) {
      // Add to dead letter queue
      this.deadLetterQueue.addFailedExecution(
        stepExecution,
        classifiedError,
        stepExecution.retryCount
      );

      return {
        shouldRetry: false,
        finalError: classifiedError
      };
    }

    // Check if error is retryable
    if (!this.isRetryable(classifiedError, policy)) {
      this.deadLetterQueue.addFailedExecution(
        stepExecution,
        classifiedError,
        stepExecution.retryCount
      );

      return {
        shouldRetry: false,
        finalError: classifiedError
      };
    }

    // Calculate retry delay
    const retryAfter = this.calculateRetryDelay(
      stepExecution.retryCount + 1,
      policy
    );

    return {
      shouldRetry: true,
      retryAfter
    };
  }

  /**
   * Calculate retry delay
   */
  private calculateRetryDelay(attempt: number, policy: RetryPolicy): number {
    const exponentialDelay = policy.baseDelay * Math.pow(policy.backoffMultiplier, attempt - 1);
    const jitter = Math.random() * 0.1 * exponentialDelay;
    return Math.min(exponentialDelay + jitter, policy.maxDelay);
  }

  /**
   * Check if error is retryable
   */
  private isRetryable(error: ExecutionError, policy: RetryPolicy): boolean {
    if (policy.nonRetryableErrors.includes(error.code)) {
      return false;
    }
    
    if (policy.retryableErrors.includes(error.code)) {
      return true;
    }
    
    return error.retryable;
  }

  /**
   * Get dead letter queue
   */
  public getDeadLetterQueue(): DeadLetterQueue {
    return this.deadLetterQueue;
  }

  /**
   * Get retry engine
   */
  public getRetryEngine(): RetryEngine {
    return this.retryEngine;
  }
}