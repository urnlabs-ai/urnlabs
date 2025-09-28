/**
 * Retry utilities with exponential backoff and custom strategies
 */

export interface RetryConfig {
  maxAttempts: number;
  baseDelay: number;
  maxDelay: number;
  backoffFactor: number;
  jitter: boolean;
  retryCondition?: (error: any, attempt: number) => boolean;
  onRetry?: (error: any, attempt: number) => void;
}

export interface RetryResult<T> {
  result: T;
  attempts: number;
  totalTime: number;
}

/**
 * Retry a function with exponential backoff
 */
export async function retry<T>(
  fn: () => Promise<T>,
  config: Partial<RetryConfig> = {}
): Promise<RetryResult<T>> {
  const {
    maxAttempts = 3,
    baseDelay = 1000,
    maxDelay = 30000,
    backoffFactor = 2,
    jitter = true,
    retryCondition = () => true,
    onRetry
  } = config;

  const startTime = Date.now();
  let lastError: any;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const result = await fn();
      return {
        result,
        attempts: attempt,
        totalTime: Date.now() - startTime
      };
    } catch (error) {
      lastError = error;

      // Check if we should retry
      if (attempt === maxAttempts || !retryCondition(error, attempt)) {
        throw error;
      }

      // Calculate delay with exponential backoff
      const delay = calculateDelay(baseDelay, backoffFactor, attempt - 1, maxDelay, jitter);

      // Call retry callback if provided
      if (onRetry) {
        onRetry(error, attempt);
      }

      // Wait before retrying
      await sleep(delay);
    }
  }

  throw lastError;
}

/**
 * Calculate exponential backoff delay
 */
export function exponentialBackoff(
  baseDelay: number,
  attempt: number,
  maxDelay: number = 30000,
  jitter: boolean = true
): number {
  return calculateDelay(baseDelay, 2, attempt, maxDelay, jitter);
}

/**
 * Calculate delay with optional jitter
 */
function calculateDelay(
  baseDelay: number,
  backoffFactor: number,
  attempt: number,
  maxDelay: number,
  jitter: boolean
): number {
  let delay = baseDelay * Math.pow(backoffFactor, attempt);
  delay = Math.min(delay, maxDelay);

  if (jitter) {
    // Add random jitter to prevent thundering herd
    delay = delay * (0.5 + Math.random() * 0.5);
  }

  return Math.floor(delay);
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry with linear backoff
 */
export async function retryLinear<T>(
  fn: () => Promise<T>,
  attempts: number = 3,
  delay: number = 1000
): Promise<RetryResult<T>> {
  return retry(fn, {
    maxAttempts: attempts,
    baseDelay: delay,
    backoffFactor: 1, // Linear backoff
    jitter: false
  });
}

/**
 * Retry with fixed delay
 */
export async function retryFixed<T>(
  fn: () => Promise<T>,
  attempts: number = 3,
  delay: number = 1000
): Promise<RetryResult<T>> {
  return retry(fn, {
    maxAttempts: attempts,
    baseDelay: delay,
    backoffFactor: 1,
    maxDelay: delay,
    jitter: false
  });
}

/**
 * Retry for network errors only
 */
export async function retryNetworkErrors<T>(
  fn: () => Promise<T>,
  attempts: number = 3
): Promise<RetryResult<T>> {
  return retry(fn, {
    maxAttempts: attempts,
    retryCondition: (error) => {
      // Retry on network errors
      if (error.code) {
        const networkErrors = ['ECONNRESET', 'ENOTFOUND', 'ECONNABORTED', 'ETIMEDOUT', 'EAI_AGAIN'];
        return networkErrors.includes(error.code);
      }

      // Retry on HTTP status codes that might be temporary
      if (error.response?.status) {
        const retryableStatus = [408, 429, 500, 502, 503, 504];
        return retryableStatus.includes(error.response.status);
      }

      return false;
    }
  });
}

/**
 * Retry with circuit breaker pattern
 */
export class CircuitBreaker<T> {
  private failures = 0;
  private lastFailTime = 0;
  private state: 'closed' | 'open' | 'half-open' = 'closed';

  constructor(
    private fn: () => Promise<T>,
    private failureThreshold: number = 5,
    private timeoutMs: number = 60000,
    private retryTimeoutMs: number = 30000
  ) {}

  async execute(): Promise<T> {
    if (this.state === 'open') {
      if (Date.now() - this.lastFailTime > this.retryTimeoutMs) {
        this.state = 'half-open';
      } else {
        throw new Error('Circuit breaker is open');
      }
    }

    try {
      const result = await this.callWithTimeout();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private async callWithTimeout(): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Circuit breaker timeout'));
      }, this.timeoutMs);

      this.fn()
        .then(result => {
          clearTimeout(timeout);
          resolve(result);
        })
        .catch(error => {
          clearTimeout(timeout);
          reject(error);
        });
    });
  }

  private onSuccess(): void {
    this.failures = 0;
    this.state = 'closed';
  }

  private onFailure(): void {
    this.failures++;
    this.lastFailTime = Date.now();

    if (this.failures >= this.failureThreshold) {
      this.state = 'open';
    }
  }

  getState(): 'closed' | 'open' | 'half-open' {
    return this.state;
  }

  getFailures(): number {
    return this.failures;
  }

  reset(): void {
    this.failures = 0;
    this.state = 'closed';
    this.lastFailTime = 0;
  }
}