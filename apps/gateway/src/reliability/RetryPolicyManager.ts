import { EventEmitter } from 'events';
import Redis from 'ioredis';
import logger from '../lib/logger.js';

export interface RetryPolicy {
  id: string;
  name: string;
  maxAttempts: number;
  baseDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
  jitter: boolean;
  jitterType: 'uniform' | 'exponential';
  retryableStatusCodes: number[];
  retryableErrors: string[];
  circuitBreakerIntegration: boolean;
  timeoutPerAttempt: number;
}

export interface RetryAttempt {
  attempt: number;
  delay: number;
  timestamp: number;
  error?: string;
  statusCode?: number;
  responseTime?: number;
}

export interface RetryExecution {
  id: string;
  serviceName: string;
  url: string;
  method: string;
  policyId: string;
  attempts: RetryAttempt[];
  totalTime: number;
  success: boolean;
  finalError?: string;
  startTime: number;
  endTime?: number;
}

export class RetryPolicyManager extends EventEmitter {
  private redis: Redis;
  private policies: Map<string, RetryPolicy> = new Map();
  private executions: Map<string, RetryExecution> = new Map();
  private activeRetries: Map<string, NodeJS.Timeout> = new Map();

  private readonly DEFAULT_POLICY: RetryPolicy = {
    id: 'default',
    name: 'Default Retry Policy',
    maxAttempts: 3,
    baseDelay: 1000, // 1 second
    maxDelay: 30000, // 30 seconds
    backoffMultiplier: 2,
    jitter: true,
    jitterType: 'uniform',
    retryableStatusCodes: [408, 429, 500, 502, 503, 504],
    retryableErrors: ['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND'],
    circuitBreakerIntegration: true,
    timeoutPerAttempt: 10000 // 10 seconds
  };

  constructor(redis: Redis) {
    super();
    this.redis = redis;
    this.initializePolicies();
  }

  private async initializePolicies(): Promise<void> {
    try {
      // Load existing policies from Redis
      const keys = await this.redis.keys('retry_policy:*');
      for (const key of keys) {
        const policyId = key.replace('retry_policy:', '');
        const policy = await this.loadPolicyFromRedis(policyId);
        if (policy) {
          this.policies.set(policyId, policy);
        }
      }

      // Add default policy if not exists
      if (!this.policies.has('default')) {
        this.policies.set('default', this.DEFAULT_POLICY);
        await this.savePolicyToRedis(this.DEFAULT_POLICY);
      }

      logger.info('Retry policies initialized', { count: this.policies.size });
    } catch (error) {
      logger.error('Failed to initialize retry policies', { error });
    }
  }

  public async createPolicy(policy: Partial<RetryPolicy>): Promise<RetryPolicy> {
    const fullPolicy: RetryPolicy = {
      ...this.DEFAULT_POLICY,
      ...policy,
      id: policy.id || `policy_${Date.now()}`
    };

    this.policies.set(fullPolicy.id, fullPolicy);
    await this.savePolicyToRedis(fullPolicy);

    logger.info('Retry policy created', { policyId: fullPolicy.id, policy: fullPolicy });
    this.emit('policyCreated', { policy: fullPolicy });

    return fullPolicy;
  }

  public async updatePolicy(policyId: string, updates: Partial<RetryPolicy>): Promise<RetryPolicy | null> {
    const existing = this.policies.get(policyId);
    if (!existing) {
      return null;
    }

    const updatedPolicy = { ...existing, ...updates, id: policyId };
    this.policies.set(policyId, updatedPolicy);
    await this.savePolicyToRedis(updatedPolicy);

    logger.info('Retry policy updated', { policyId, updates });
    this.emit('policyUpdated', { policyId, policy: updatedPolicy });

    return updatedPolicy;
  }

  public async deletePolicy(policyId: string): Promise<boolean> {
    if (policyId === 'default') {
      throw new Error('Cannot delete default retry policy');
    }

    const deleted = this.policies.delete(policyId);
    if (deleted) {
      await this.redis.del(`retry_policy:${policyId}`);
      logger.info('Retry policy deleted', { policyId });
      this.emit('policyDeleted', { policyId });
    }

    return deleted;
  }

  public getPolicy(policyId: string): RetryPolicy | null {
    return this.policies.get(policyId) || null;
  }

  public getAllPolicies(): RetryPolicy[] {
    return Array.from(this.policies.values());
  }

  public async executeWithRetry<T>(
    fn: () => Promise<T>,
    context: {
      serviceName: string;
      url: string;
      method: string;
      policyId?: string;
    }
  ): Promise<T> {
    const policyId = context.policyId || 'default';
    const policy = this.policies.get(policyId);

    if (!policy) {
      throw new Error(`Retry policy not found: ${policyId}`);
    }

    const executionId = `${context.serviceName}_${Date.now()}_${Math.random()}`;
    const execution: RetryExecution = {
      id: executionId,
      serviceName: context.serviceName,
      url: context.url,
      method: context.method,
      policyId,
      attempts: [],
      totalTime: 0,
      success: false,
      startTime: Date.now()
    };

    this.executions.set(executionId, execution);

    try {
      const result = await this.executeWithRetryLogic(fn, policy, execution);
      execution.success = true;
      execution.endTime = Date.now();
      execution.totalTime = execution.endTime - execution.startTime;

      logger.info('Retry execution completed successfully', {
        executionId,
        serviceName: context.serviceName,
        attempts: execution.attempts.length,
        totalTime: execution.totalTime
      });

      this.emit('executionCompleted', { execution });
      return result;

    } catch (error: any) {
      execution.success = false;
      execution.endTime = Date.now();
      execution.totalTime = execution.endTime - execution.startTime;
      execution.finalError = error.message;

      logger.error('Retry execution failed', {
        executionId,
        serviceName: context.serviceName,
        attempts: execution.attempts.length,
        totalTime: execution.totalTime,
        error: error.message
      });

      this.emit('executionFailed', { execution });
      throw error;

    } finally {
      // Clean up
      this.executions.delete(executionId);
      if (this.activeRetries.has(executionId)) {
        clearTimeout(this.activeRetries.get(executionId)!);
        this.activeRetries.delete(executionId);
      }
    }
  }

  private async executeWithRetryLogic<T>(
    fn: () => Promise<T>,
    policy: RetryPolicy,
    execution: RetryExecution
  ): Promise<T> {
    let lastError: Error;

    for (let attempt = 1; attempt <= policy.maxAttempts; attempt++) {
      const attemptStart = Date.now();

      try {
        // Create timeout wrapper
        const result = await this.executeWithTimeout(fn, policy.timeoutPerAttempt);

        const attemptEnd = Date.now();
        const responseTime = attemptEnd - attemptStart;

        execution.attempts.push({
          attempt,
          delay: 0,
          timestamp: attemptStart,
          responseTime
        });

        // Success - log and return
        logger.debug('Retry attempt succeeded', {
          executionId: execution.id,
          attempt,
          responseTime
        });

        return result;

      } catch (error: any) {
        const attemptEnd = Date.now();
        const responseTime = attemptEnd - attemptStart;

        const retryAttempt: RetryAttempt = {
          attempt,
          delay: 0,
          timestamp: attemptStart,
          error: error.message,
          statusCode: error.statusCode,
          responseTime
        };

        execution.attempts.push(retryAttempt);
        lastError = error;

        // Check if error is retryable
        if (!this.isRetryableError(error, policy)) {
          logger.debug('Error is not retryable', {
            executionId: execution.id,
            attempt,
            error: error.message,
            statusCode: error.statusCode
          });
          throw error;
        }

        // If this is the last attempt, don't wait
        if (attempt === policy.maxAttempts) {
          logger.debug('Max attempts reached', {
            executionId: execution.id,
            attempt,
            maxAttempts: policy.maxAttempts
          });
          break;
        }

        // Calculate delay for next attempt
        const delay = this.calculateDelay(attempt, policy);
        retryAttempt.delay = delay;

        logger.warn('Retry attempt failed, retrying after delay', {
          executionId: execution.id,
          attempt,
          delay,
          error: error.message,
          statusCode: error.statusCode
        });

        this.emit('attemptFailed', {
          execution,
          attempt: retryAttempt,
          willRetry: true
        });

        // Wait before next attempt
        await this.delay(delay, execution.id);
      }
    }

    // All attempts failed
    throw lastError!;
  }

  private async executeWithTimeout<T>(fn: () => Promise<T>, timeout: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Request timeout after ${timeout}ms`));
      }, timeout);

      fn()
        .then(result => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch(error => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  private isRetryableError(error: any, policy: RetryPolicy): boolean {
    // Check status code
    if (error.statusCode && policy.retryableStatusCodes.includes(error.statusCode)) {
      return true;
    }

    // Check error codes
    if (error.code && policy.retryableErrors.includes(error.code)) {
      return true;
    }

    // Check error message for common retryable patterns
    const errorMessage = error.message?.toLowerCase() || '';
    const retryablePatterns = [
      'timeout',
      'connection reset',
      'connection refused',
      'network error',
      'service unavailable',
      'bad gateway',
      'gateway timeout'
    ];

    return retryablePatterns.some(pattern => errorMessage.includes(pattern));
  }

  private calculateDelay(attempt: number, policy: RetryPolicy): number {
    // Calculate exponential backoff
    let delay = policy.baseDelay * Math.pow(policy.backoffMultiplier, attempt - 1);

    // Apply max delay limit
    delay = Math.min(delay, policy.maxDelay);

    // Apply jitter if enabled
    if (policy.jitter) {
      delay = this.applyJitter(delay, policy.jitterType);
    }

    return Math.round(delay);
  }

  private applyJitter(delay: number, jitterType: 'uniform' | 'exponential'): number {
    switch (jitterType) {
      case 'uniform':
        // Add random variation of ±25%
        const variation = delay * 0.25;
        return delay + (Math.random() * 2 - 1) * variation;

      case 'exponential':
        // Exponential jitter - more dramatic variation
        return delay * (0.5 + Math.random() * 0.5);

      default:
        return delay;
    }
  }

  private async delay(ms: number, executionId: string): Promise<void> {
    return new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        this.activeRetries.delete(executionId);
        resolve();
      }, ms);

      this.activeRetries.set(executionId, timer);
    });
  }

  public async getStats(): Promise<any> {
    const executions = Array.from(this.executions.values());
    const policies = Array.from(this.policies.values());

    const stats = {
      policies: policies.length,
      activeRetries: this.activeRetries.size,
      totalExecutions: 0,
      successfulExecutions: 0,
      failedExecutions: 0,
      averageAttempts: 0,
      averageExecutionTime: 0,
      policyUsage: {} as Record<string, number>,
      details: {
        policies: policies.map(p => ({
          id: p.id,
          name: p.name,
          maxAttempts: p.maxAttempts,
          baseDelay: p.baseDelay,
          maxDelay: p.maxDelay
        })),
        recentExecutions: executions.slice(-10).map(e => ({
          id: e.id,
          serviceName: e.serviceName,
          policyId: e.policyId,
          attempts: e.attempts.length,
          success: e.success,
          totalTime: e.totalTime,
          startTime: new Date(e.startTime).toISOString()
        }))
      }
    };

    // Calculate historical stats from Redis (implement as needed)
    // For now, return current stats
    return stats;
  }

  public getActiveRetries(): Array<{ executionId: string; serviceName: string; attempts: number }> {
    return Array.from(this.executions.values())
      .filter(e => !e.endTime)
      .map(e => ({
        executionId: e.id,
        serviceName: e.serviceName,
        attempts: e.attempts.length
      }));
  }

  public async cancelRetry(executionId: string): Promise<boolean> {
    const timer = this.activeRetries.get(executionId);
    if (timer) {
      clearTimeout(timer);
      this.activeRetries.delete(executionId);
      this.executions.delete(executionId);

      logger.info('Retry execution cancelled', { executionId });
      this.emit('executionCancelled', { executionId });
      return true;
    }

    return false;
  }

  private async savePolicyToRedis(policy: RetryPolicy): Promise<void> {
    try {
      await this.redis.setex(
        `retry_policy:${policy.id}`,
        86400, // 24 hours TTL
        JSON.stringify(policy)
      );
    } catch (error) {
      logger.error('Failed to save retry policy to Redis', { policyId: policy.id, error });
    }
  }

  private async loadPolicyFromRedis(policyId: string): Promise<RetryPolicy | null> {
    try {
      const data = await this.redis.get(`retry_policy:${policyId}`);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      logger.error('Failed to load retry policy from Redis', { policyId, error });
      return null;
    }
  }

  public destroy(): void {
    // Cancel all active retries
    for (const [executionId, timer] of this.activeRetries.entries()) {
      clearTimeout(timer);
      this.emit('executionCancelled', { executionId });
    }

    this.activeRetries.clear();
    this.executions.clear();
    this.removeAllListeners();
  }
}