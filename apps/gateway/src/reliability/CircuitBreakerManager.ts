import { EventEmitter } from 'events';
import Redis from 'ioredis';
import logger from '../lib/logger.js';

export interface CircuitBreakerConfig {
  failureThreshold: number;
  recoveryTimeout: number;
  requestVolumeThreshold: number;
  timeWindow: number;
  errorThresholdPercentage: number;
  slowCallThreshold: number;
  slowCallRateThreshold: number;
  halfOpenMaxCalls: number;
}

export interface CircuitBreakerState {
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  failureCount: number;
  successCount: number;
  requestCount: number;
  lastFailureTime: number;
  nextAttemptTime: number;
  halfOpenCallsCount: number;
  slowCallCount: number;
  totalResponseTime: number;
  averageResponseTime: number;
}

export interface ServiceCall {
  serviceName: string;
  method: string;
  url: string;
  startTime: number;
  endTime?: number;
  success?: boolean;
  responseTime?: number;
  error?: string;
  statusCode?: number;
}

export class CircuitBreakerManager extends EventEmitter {
  private redis: Redis;
  private circuitBreakers: Map<string, CircuitBreakerState> = new Map();
  private configs: Map<string, CircuitBreakerConfig> = new Map();
  private timers: Map<string, NodeJS.Timeout> = new Map();
  private readonly DEFAULT_CONFIG: CircuitBreakerConfig = {
    failureThreshold: 5,
    recoveryTimeout: 60000, // 1 minute
    requestVolumeThreshold: 10,
    timeWindow: 60000, // 1 minute
    errorThresholdPercentage: 50,
    slowCallThreshold: 1000, // 1 second
    slowCallRateThreshold: 50, // 50%
    halfOpenMaxCalls: 3
  };

  constructor(redis: Redis) {
    super();
    this.redis = redis;
    this.initializeCircuitBreakers();
  }

  private async initializeCircuitBreakers(): Promise<void> {
    try {
      // Load existing circuit breaker states from Redis
      const keys = await this.redis.keys('circuit_breaker:*');
      for (const key of keys) {
        const serviceName = key.replace('circuit_breaker:', '');
        const state = await this.getStateFromRedis(serviceName);
        if (state) {
          this.circuitBreakers.set(serviceName, state);
        }
      }
      logger.info('Circuit breaker states loaded from Redis', { count: keys.length });
    } catch (error) {
      logger.error('Failed to initialize circuit breakers from Redis', { error });
    }
  }

  public async registerService(serviceName: string, config?: Partial<CircuitBreakerConfig>): Promise<void> {
    const finalConfig = { ...this.DEFAULT_CONFIG, ...config };
    this.configs.set(serviceName, finalConfig);

    if (!this.circuitBreakers.has(serviceName)) {
      const initialState: CircuitBreakerState = {
        state: 'CLOSED',
        failureCount: 0,
        successCount: 0,
        requestCount: 0,
        lastFailureTime: 0,
        nextAttemptTime: 0,
        halfOpenCallsCount: 0,
        slowCallCount: 0,
        totalResponseTime: 0,
        averageResponseTime: 0
      };

      this.circuitBreakers.set(serviceName, initialState);
      await this.saveStateToRedis(serviceName, initialState);
    }

    logger.info('Circuit breaker registered for service', { serviceName, config: finalConfig });
    this.emit('serviceRegistered', { serviceName, config: finalConfig });
  }

  public async recordCall(call: ServiceCall): Promise<void> {
    const { serviceName } = call;
    const state = this.circuitBreakers.get(serviceName);
    const config = this.configs.get(serviceName);

    if (!state || !config) {
      logger.warn('Circuit breaker not registered for service', { serviceName });
      return;
    }

    // Calculate response time
    const responseTime = call.endTime ? call.endTime - call.startTime : 0;
    call.responseTime = responseTime;

    // Update state based on call result
    const isSlowCall = responseTime > config.slowCallThreshold;
    const isFailure = !call.success || (call.statusCode && call.statusCode >= 500);

    state.requestCount++;
    state.totalResponseTime += responseTime;
    state.averageResponseTime = state.totalResponseTime / state.requestCount;

    if (isSlowCall) {
      state.slowCallCount++;
    }

    if (isFailure) {
      state.failureCount++;
      state.lastFailureTime = Date.now();

      logger.warn('Circuit breaker recorded failure', {
        serviceName,
        error: call.error,
        statusCode: call.statusCode,
        responseTime,
        failureCount: state.failureCount
      });
    } else {
      state.successCount++;
    }

    // Check if state should change
    await this.evaluateStateTransition(serviceName, state, config);
    await this.saveStateToRedis(serviceName, state);

    this.emit('callRecorded', { serviceName, call, state: { ...state } });
  }

  private async evaluateStateTransition(
    serviceName: string,
    state: CircuitBreakerState,
    config: CircuitBreakerConfig
  ): Promise<void> {
    const now = Date.now();

    switch (state.state) {
      case 'CLOSED':
        if (this.shouldOpenCircuit(state, config)) {
          await this.openCircuit(serviceName, state, config);
        }
        break;

      case 'OPEN':
        if (now >= state.nextAttemptTime) {
          await this.halfOpenCircuit(serviceName, state);
        }
        break;

      case 'HALF_OPEN':
        if (state.halfOpenCallsCount >= config.halfOpenMaxCalls) {
          const successRate = state.successCount / state.halfOpenCallsCount;
          if (successRate >= 0.5) { // 50% success rate to close
            await this.closeCircuit(serviceName, state);
          } else {
            await this.openCircuit(serviceName, state, config);
          }
        }
        break;
    }
  }

  private shouldOpenCircuit(state: CircuitBreakerState, config: CircuitBreakerConfig): boolean {
    if (state.requestCount < config.requestVolumeThreshold) {
      return false;
    }

    const errorRate = (state.failureCount / state.requestCount) * 100;
    const slowCallRate = (state.slowCallCount / state.requestCount) * 100;

    return errorRate >= config.errorThresholdPercentage ||
           slowCallRate >= config.slowCallRateThreshold ||
           state.failureCount >= config.failureThreshold;
  }

  private async openCircuit(serviceName: string, state: CircuitBreakerState, config: CircuitBreakerConfig): Promise<void> {
    state.state = 'OPEN';
    state.nextAttemptTime = Date.now() + config.recoveryTimeout;

    // Clear existing timer if any
    if (this.timers.has(serviceName)) {
      clearTimeout(this.timers.get(serviceName)!);
    }

    // Set timer to transition to HALF_OPEN
    const timer = setTimeout(async () => {
      await this.halfOpenCircuit(serviceName, state);
    }, config.recoveryTimeout);

    this.timers.set(serviceName, timer);

    logger.warn('Circuit breaker opened', {
      serviceName,
      failureCount: state.failureCount,
      errorRate: (state.failureCount / state.requestCount) * 100,
      nextAttemptTime: new Date(state.nextAttemptTime).toISOString()
    });

    this.emit('circuitOpened', { serviceName, state: { ...state } });
  }

  private async halfOpenCircuit(serviceName: string, state: CircuitBreakerState): Promise<void> {
    state.state = 'HALF_OPEN';
    state.halfOpenCallsCount = 0;
    state.successCount = 0;
    state.failureCount = 0;

    logger.info('Circuit breaker half-opened', { serviceName });
    this.emit('circuitHalfOpened', { serviceName, state: { ...state } });
  }

  private async closeCircuit(serviceName: string, state: CircuitBreakerState): Promise<void> {
    state.state = 'CLOSED';
    state.failureCount = 0;
    state.successCount = 0;
    state.requestCount = 0;
    state.halfOpenCallsCount = 0;
    state.slowCallCount = 0;
    state.totalResponseTime = 0;
    state.averageResponseTime = 0;
    state.lastFailureTime = 0;
    state.nextAttemptTime = 0;

    // Clear timer
    if (this.timers.has(serviceName)) {
      clearTimeout(this.timers.get(serviceName)!);
      this.timers.delete(serviceName);
    }

    logger.info('Circuit breaker closed', { serviceName });
    this.emit('circuitClosed', { serviceName, state: { ...state } });
  }

  public async callAllowed(serviceName: string): Promise<boolean> {
    const state = this.circuitBreakers.get(serviceName);
    if (!state) {
      return true; // Allow if no circuit breaker configured
    }

    switch (state.state) {
      case 'CLOSED':
        return true;

      case 'OPEN':
        return Date.now() >= state.nextAttemptTime;

      case 'HALF_OPEN':
        const config = this.configs.get(serviceName);
        return state.halfOpenCallsCount < (config?.halfOpenMaxCalls || 3);

      default:
        return true;
    }
  }

  public getState(serviceName: string): CircuitBreakerState | null {
    return this.circuitBreakers.get(serviceName) || null;
  }

  public getAllStates(): Map<string, CircuitBreakerState> {
    return new Map(this.circuitBreakers);
  }

  public getConfig(serviceName: string): CircuitBreakerConfig | null {
    return this.configs.get(serviceName) || null;
  }

  public async updateConfig(serviceName: string, config: Partial<CircuitBreakerConfig>): Promise<void> {
    const existing = this.configs.get(serviceName) || this.DEFAULT_CONFIG;
    const newConfig = { ...existing, ...config };
    this.configs.set(serviceName, newConfig);

    await this.redis.setex(
      `circuit_breaker_config:${serviceName}`,
      3600, // 1 hour TTL
      JSON.stringify(newConfig)
    );

    logger.info('Circuit breaker config updated', { serviceName, config: newConfig });
    this.emit('configUpdated', { serviceName, config: newConfig });
  }

  public async getStats(): Promise<any> {
    const states = Array.from(this.circuitBreakers.entries());
    const stats = {
      services: states.length,
      closed: 0,
      open: 0,
      halfOpen: 0,
      totalRequests: 0,
      totalFailures: 0,
      averageResponseTime: 0,
      details: {} as any
    };

    let totalResponseTime = 0;
    let totalRequests = 0;

    for (const [serviceName, state] of states) {
      stats.details[serviceName] = {
        state: state.state,
        failureCount: state.failureCount,
        successCount: state.successCount,
        requestCount: state.requestCount,
        averageResponseTime: state.averageResponseTime,
        lastFailureTime: state.lastFailureTime ? new Date(state.lastFailureTime).toISOString() : null,
        nextAttemptTime: state.nextAttemptTime ? new Date(state.nextAttemptTime).toISOString() : null
      };

      // Aggregate stats
      switch (state.state) {
        case 'CLOSED': stats.closed++; break;
        case 'OPEN': stats.open++; break;
        case 'HALF_OPEN': stats.halfOpen++; break;
      }

      stats.totalRequests += state.requestCount;
      stats.totalFailures += state.failureCount;
      totalResponseTime += state.totalResponseTime;
      totalRequests += state.requestCount;
    }

    stats.averageResponseTime = totalRequests > 0 ? totalResponseTime / totalRequests : 0;

    return stats;
  }

  private async saveStateToRedis(serviceName: string, state: CircuitBreakerState): Promise<void> {
    try {
      await this.redis.setex(
        `circuit_breaker:${serviceName}`,
        300, // 5 minutes TTL
        JSON.stringify(state)
      );
    } catch (error) {
      logger.error('Failed to save circuit breaker state to Redis', { serviceName, error });
    }
  }

  private async getStateFromRedis(serviceName: string): Promise<CircuitBreakerState | null> {
    try {
      const data = await this.redis.get(`circuit_breaker:${serviceName}`);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      logger.error('Failed to load circuit breaker state from Redis', { serviceName, error });
      return null;
    }
  }

  public async reset(serviceName: string): Promise<void> {
    const state = this.circuitBreakers.get(serviceName);
    if (state) {
      await this.closeCircuit(serviceName, state);
      await this.saveStateToRedis(serviceName, state);
      logger.info('Circuit breaker reset', { serviceName });
    }
  }

  public async resetAll(): Promise<void> {
    for (const serviceName of this.circuitBreakers.keys()) {
      await this.reset(serviceName);
    }
    logger.info('All circuit breakers reset');
  }

  public destroy(): void {
    // Clear all timers
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
    this.removeAllListeners();
  }
}