import Redis from 'ioredis';
import { EventEmitter } from 'events';
import logger from '../lib/logger.js';

export interface CircuitBreakerConfig {
  id: string;
  service: string;
  failureThreshold: number;
  successThreshold: number;
  timeout: number;
  resetTimeout: number;
  requestVolumeThreshold: number;
  timeWindow: number;
  errorThresholdPercentage: number;
  slowCallThreshold: number;
  slowCallRateThreshold: number;
  halfOpenMaxCalls: number;
  monitoringEnabled: boolean;
}

export type CircuitBreakerState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerMetrics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  slowRequests: number;
  averageResponseTime: number;
  errorRate: number;
  slowCallRate: number;
  lastStateChange: number;
  stateChanges: number;
}

export interface CircuitBreakerCall {
  service: string;
  operation: string;
  timestamp: number;
  success: boolean;
  responseTime: number;
  error?: string;
  statusCode?: number;
}

export interface CircuitBreakerEvents {
  stateChange: (service: string, oldState: CircuitBreakerState, newState: CircuitBreakerState) => void;
  callCompleted: (call: CircuitBreakerCall) => void;
  callRejected: (service: string, reason: string) => void;
  thresholdExceeded: (service: string, metric: string, value: number, threshold: number) => void;
  healthCheck: (service: string, healthy: boolean) => void;
}

export class CircuitBreaker extends EventEmitter {
  private redis: Redis;
  private config: CircuitBreakerConfig;
  private state: CircuitBreakerState = 'CLOSED';
  private failureCount = 0;
  private successCount = 0;
  private halfOpenCallCount = 0;
  private lastFailureTime = 0;
  private lastStateChange = Date.now();
  private metrics: CircuitBreakerMetrics;
  private monitoring: NodeJS.Timeout | null = null;

  constructor(redis: Redis, config: CircuitBreakerConfig) {
    super();
    this.redis = redis;
    this.config = { ...this.getDefaultConfig(), ...config };
    this.metrics = this.initializeMetrics();

    this.startMonitoring();
    logger.info(`Circuit breaker created for service: ${this.config.service}`, { config: this.config });
  }

  private getDefaultConfig(): Partial<CircuitBreakerConfig> {
    return {
      failureThreshold: 5,
      successThreshold: 3,
      timeout: 60000,
      resetTimeout: 60000,
      requestVolumeThreshold: 10,
      timeWindow: 60000,
      errorThresholdPercentage: 50,
      slowCallThreshold: 1000,
      slowCallRateThreshold: 50,
      halfOpenMaxCalls: 3,
      monitoringEnabled: true
    };
  }

  private initializeMetrics(): CircuitBreakerMetrics {
    return {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      slowRequests: 0,
      averageResponseTime: 0,
      errorRate: 0,
      slowCallRate: 0,
      lastStateChange: this.lastStateChange,
      stateChanges: 0
    };
  }

  private startMonitoring(): void {
    if (!this.config.monitoringEnabled) return;

    this.monitoring = setInterval(async () => {
      await this.updateMetrics();
      await this.evaluateState();
      await this.persistState();
    }, 10000); // Monitor every 10 seconds
  }

  public async callAllowed(): Promise<boolean> {
    const now = Date.now();

    switch (this.state) {
      case 'CLOSED':
        return true;

      case 'OPEN':
        if (now - this.lastFailureTime >= this.config.resetTimeout) {
          await this.setState('HALF_OPEN');
          this.halfOpenCallCount = 0;
          return true;
        }
        this.emit('callRejected', this.config.service, 'Circuit breaker is OPEN');
        return false;

      case 'HALF_OPEN':
        if (this.halfOpenCallCount < this.config.halfOpenMaxCalls) {
          this.halfOpenCallCount++;
          return true;
        }
        this.emit('callRejected', this.config.service, 'Half-open call limit exceeded');
        return false;

      default:
        return false;
    }
  }

  public async recordCall(call: CircuitBreakerCall): Promise<void> {
    const now = Date.now();

    // Update metrics
    this.metrics.totalRequests++;

    if (call.success) {
      this.metrics.successfulRequests++;
      this.successCount++;

      if (this.state === 'HALF_OPEN' && this.successCount >= this.config.successThreshold) {
        await this.setState('CLOSED');
        this.resetCounters();
      }
    } else {
      this.metrics.failedRequests++;
      this.failureCount++;
      this.lastFailureTime = now;

      if (this.state === 'HALF_OPEN') {
        await this.setState('OPEN');
      }
    }

    // Check slow calls
    if (call.responseTime > this.config.slowCallThreshold) {
      this.metrics.slowRequests++;
    }

    // Update average response time
    this.updateAverageResponseTime(call.responseTime);

    // Store call data for time window analysis
    await this.storeCall(call);

    // Evaluate state based on current metrics
    await this.evaluateState();

    this.emit('callCompleted', call);
  }

  private async setState(newState: CircuitBreakerState): Promise<void> {
    const oldState = this.state;
    this.state = newState;
    this.lastStateChange = Date.now();
    this.metrics.lastStateChange = this.lastStateChange;
    this.metrics.stateChanges++;

    logger.info(`Circuit breaker state changed`, {
      service: this.config.service,
      oldState,
      newState,
      timestamp: this.lastStateChange
    });

    this.emit('stateChange', this.config.service, oldState, newState);
    await this.persistState();
  }

  private async evaluateState(): Promise<void> {
    if (this.state === 'OPEN' || this.state === 'HALF_OPEN') {
      return; // State transitions handled in recordCall
    }

    const now = Date.now();
    const timeWindowStart = now - this.config.timeWindow;

    // Get calls within time window
    const recentCalls = await this.getRecentCalls(timeWindowStart);

    if (recentCalls.length < this.config.requestVolumeThreshold) {
      return; // Not enough data to make decision
    }

    // Calculate error rate
    const failedCalls = recentCalls.filter(call => !call.success).length;
    const errorRate = (failedCalls / recentCalls.length) * 100;

    // Calculate slow call rate
    const slowCalls = recentCalls.filter(call => call.responseTime > this.config.slowCallThreshold).length;
    const slowCallRate = (slowCalls / recentCalls.length) * 100;

    // Update metrics
    this.metrics.errorRate = errorRate;
    this.metrics.slowCallRate = slowCallRate;

    // Check thresholds
    if (errorRate >= this.config.errorThresholdPercentage) {
      this.emit('thresholdExceeded', this.config.service, 'errorRate', errorRate, this.config.errorThresholdPercentage);

      if (this.state === 'CLOSED') {
        await this.setState('OPEN');
      }
    }

    if (slowCallRate >= this.config.slowCallRateThreshold) {
      this.emit('thresholdExceeded', this.config.service, 'slowCallRate', slowCallRate, this.config.slowCallRateThreshold);
    }

    // Check failure count threshold
    if (this.failureCount >= this.config.failureThreshold && this.state === 'CLOSED') {
      await this.setState('OPEN');
    }
  }

  private async updateMetrics(): Promise<void> {
    const now = Date.now();
    const timeWindowStart = now - this.config.timeWindow;
    const recentCalls = await this.getRecentCalls(timeWindowStart);

    if (recentCalls.length > 0) {
      const totalResponseTime = recentCalls.reduce((sum, call) => sum + call.responseTime, 0);
      this.metrics.averageResponseTime = totalResponseTime / recentCalls.length;
    }
  }

  private updateAverageResponseTime(responseTime: number): void {
    const totalRequests = this.metrics.totalRequests;
    const currentAverage = this.metrics.averageResponseTime;

    // Calculate new average using incremental formula
    this.metrics.averageResponseTime = ((currentAverage * (totalRequests - 1)) + responseTime) / totalRequests;
  }

  private async storeCall(call: CircuitBreakerCall): Promise<void> {
    const key = `circuit_breaker:calls:${this.config.service}`;
    const callData = JSON.stringify(call);

    await this.redis.zadd(key, call.timestamp, callData);

    // Keep only calls within time window + buffer
    const cutoff = Date.now() - (this.config.timeWindow * 2);
    await this.redis.zremrangebyscore(key, 0, cutoff);
  }

  private async getRecentCalls(since: number): Promise<CircuitBreakerCall[]> {
    const key = `circuit_breaker:calls:${this.config.service}`;
    const callsData = await this.redis.zrangebyscore(key, since, '+inf');

    return callsData.map(data => {
      try {
        return JSON.parse(data) as CircuitBreakerCall;
      } catch (error) {
        logger.error('Failed to parse circuit breaker call data', { data, error });
        return null;
      }
    }).filter(call => call !== null) as CircuitBreakerCall[];
  }

  private async persistState(): Promise<void> {
    const stateData = {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      halfOpenCallCount: this.halfOpenCallCount,
      lastFailureTime: this.lastFailureTime,
      lastStateChange: this.lastStateChange,
      metrics: this.metrics
    };

    const key = `circuit_breaker:state:${this.config.service}`;
    await this.redis.setex(key, 3600, JSON.stringify(stateData)); // Expire in 1 hour
  }

  private async loadState(): Promise<void> {
    const key = `circuit_breaker:state:${this.config.service}`;
    const stateData = await this.redis.get(key);

    if (stateData) {
      try {
        const state = JSON.parse(stateData);
        this.state = state.state || 'CLOSED';
        this.failureCount = state.failureCount || 0;
        this.successCount = state.successCount || 0;
        this.halfOpenCallCount = state.halfOpenCallCount || 0;
        this.lastFailureTime = state.lastFailureTime || 0;
        this.lastStateChange = state.lastStateChange || Date.now();
        this.metrics = { ...this.metrics, ...state.metrics };
      } catch (error) {
        logger.error('Failed to load circuit breaker state', { service: this.config.service, error });
      }
    }
  }

  private resetCounters(): void {
    this.failureCount = 0;
    this.successCount = 0;
    this.halfOpenCallCount = 0;
  }

  public async reset(): Promise<void> {
    await this.setState('CLOSED');
    this.resetCounters();
    this.metrics = this.initializeMetrics();

    logger.info(`Circuit breaker reset`, { service: this.config.service });
  }

  public async forceOpen(): Promise<void> {
    await this.setState('OPEN');
    logger.warn(`Circuit breaker forced open`, { service: this.config.service });
  }

  public async forceClose(): Promise<void> {
    await this.setState('CLOSED');
    this.resetCounters();
    logger.warn(`Circuit breaker forced closed`, { service: this.config.service });
  }

  public getState(): CircuitBreakerState {
    return this.state;
  }

  public getMetrics(): CircuitBreakerMetrics {
    return { ...this.metrics };
  }

  public getConfig(): CircuitBreakerConfig {
    return { ...this.config };
  }

  public async getHealth(): Promise<{ healthy: boolean; state: CircuitBreakerState; metrics: CircuitBreakerMetrics }> {
    const healthy = this.state === 'CLOSED' || this.state === 'HALF_OPEN';

    this.emit('healthCheck', this.config.service, healthy);

    return {
      healthy,
      state: this.state,
      metrics: this.getMetrics()
    };
  }

  public async updateConfig(updates: Partial<CircuitBreakerConfig>): Promise<void> {
    this.config = { ...this.config, ...updates };
    logger.info(`Circuit breaker config updated`, {
      service: this.config.service,
      updates
    });
  }

  public destroy(): void {
    if (this.monitoring) {
      clearInterval(this.monitoring);
      this.monitoring = null;
    }

    this.removeAllListeners();
    logger.info(`Circuit breaker destroyed`, { service: this.config.service });
  }

  // Initialize from persisted state
  public async initialize(): Promise<void> {
    await this.loadState();
    logger.info(`Circuit breaker initialized`, {
      service: this.config.service,
      state: this.state,
      metrics: this.metrics
    });
  }
}

export default CircuitBreaker;