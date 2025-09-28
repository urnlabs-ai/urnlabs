import { createClient, RedisClientType } from 'redis';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import {
  FlagConfig,
  FlagConfigSchema,
  EvaluationContext,
  EvaluationContextSchema,
  FlagEvaluationResult,
  FlagEvent,
  FlagEventSchema,
  FeatureFlagClient,
  FeatureFlagMetrics,
  FlagState,
  TargetingStrategy,
  Environment
} from './types';

export class FeatureFlagClientImpl implements FeatureFlagClient {
  private redis: RedisClientType;
  private metrics: FeatureFlagMetrics;
  private cachePrefix = 'feature_flag:';
  private eventPrefix = 'flag_event:';
  private metricsPrefix = 'flag_metrics:';

  constructor(redisUrl: string = 'redis://localhost:6379') {
    this.redis = createClient({ url: redisUrl });
    this.metrics = {
      flagEvaluations: 0,
      flagUpdates: 0,
      emergencyDisables: 0,
      evaluationLatency: 0,
      cacheHitRate: 0
    };
    this.initializeConnection();
  }

  private async initializeConnection(): Promise<void> {
    try {
      await this.redis.connect();
      console.log('Feature flag Redis client connected');
    } catch (error) {
      console.error('Failed to connect to Redis:', error);
      throw error;
    }
  }

  private generateFlagKey(flagName: string, environment: Environment): string {
    return `${this.cachePrefix}${environment}:${flagName}`;
  }

  private generateEventKey(): string {
    return `${this.eventPrefix}${Date.now()}:${uuidv4()}`;
  }

  private async recordEvent(event: FlagEvent): Promise<void> {
    try {
      const validatedEvent = FlagEventSchema.parse(event);
      const eventKey = this.generateEventKey();
      
      await this.redis.setEx(eventKey, 86400, JSON.stringify(validatedEvent)); // 24 hour TTL
      
      // Publish to event stream for real-time monitoring
      await this.redis.publish('feature_flag_events', JSON.stringify(validatedEvent));
    } catch (error) {
      console.error('Failed to record flag event:', error);
    }
  }

  private async updateMetrics(operation: string, latency?: number): Promise<void> {
    const timestamp = Date.now();
    
    try {
      switch (operation) {
        case 'evaluation':
          this.metrics.flagEvaluations++;
          if (latency) this.metrics.evaluationLatency = latency;
          await this.redis.incr(`${this.metricsPrefix}evaluations:${timestamp}`);
          break;
        case 'update':
          this.metrics.flagUpdates++;
          await this.redis.incr(`${this.metricsPrefix}updates:${timestamp}`);
          break;
        case 'emergency_disable':
          this.metrics.emergencyDisables++;
          await this.redis.incr(`${this.metricsPrefix}emergency_disables:${timestamp}`);
          break;
      }
    } catch (error) {
      console.error('Failed to update metrics:', error);
    }
  }

  private hashUserId(userId: string, flagName: string): number {
    const hash = crypto.createHash('sha256');
    hash.update(`${userId}:${flagName}`);
    const hashValue = hash.digest('hex');
    return parseInt(hashValue.substring(0, 8), 16) % 100;
  }

  private evaluateTargetingRules(flag: FlagConfig, context: EvaluationContext): boolean {
    const { targeting } = flag;

    // Check user whitelist first
    if (context.userId && targeting.userList.includes(context.userId)) {
      return true;
    }

    // Check IP whitelist
    if (context.ipAddress && targeting.ipWhitelist.includes(context.ipAddress)) {
      return true;
    }

    // Apply targeting rules
    for (const rule of targeting.rules) {
      const contextValue = context.userAttributes[rule.attribute];
      if (!contextValue) continue;

      switch (rule.operator) {
        case 'equals':
          if (contextValue !== rule.value) return false;
          break;
        case 'not_equals':
          if (contextValue === rule.value) return false;
          break;
        case 'contains':
          if (typeof contextValue === 'string' && typeof rule.value === 'string') {
            if (!contextValue.includes(rule.value)) return false;
          }
          break;
        case 'greater_than':
          if (typeof contextValue === 'number' && typeof rule.value === 'number') {
            if (contextValue <= rule.value) return false;
          }
          break;
        case 'less_than':
          if (typeof contextValue === 'number' && typeof rule.value === 'number') {
            if (contextValue >= rule.value) return false;
          }
          break;
        case 'in':
          if (Array.isArray(rule.value) && !rule.value.includes(contextValue)) {
            return false;
          }
          break;
        case 'not_in':
          if (Array.isArray(rule.value) && rule.value.includes(contextValue)) {
            return false;
          }
          break;
      }
    }

    // Apply percentage rollout
    if (targeting.strategy === TargetingStrategy.PERCENTAGE && context.userId) {
      const userHash = this.hashUserId(context.userId, flag.name);
      return userHash < flag.rolloutPercentage;
    }

    return false;
  }

  async evaluateFlag(flagName: string, context: EvaluationContext): Promise<FlagEvaluationResult> {
    const startTime = Date.now();
    
    try {
      // Validate input
      const validatedContext = EvaluationContextSchema.parse(context);
      
      // Get flag configuration from cache
      const flag = await this.getFlagConfig(flagName, validatedContext.environment);
      
      if (!flag) {
        const result: FlagEvaluationResult = {
          flagName,
          enabled: false,
          reason: 'flag_not_found',
          evaluatedAt: new Date(),
          trackingData: {}
        };
        
        await this.updateMetrics('evaluation', Date.now() - startTime);
        return result;
      }

      let enabled = false;
      let reason = 'disabled';

      // Check flag state
      switch (flag.state) {
        case FlagState.DISABLED:
          enabled = false;
          reason = 'flag_disabled';
          break;
        case FlagState.ENABLED:
          enabled = true;
          reason = 'flag_enabled';
          break;
        case FlagState.KILL_SWITCH:
          enabled = false;
          reason = 'kill_switch_activated';
          break;
        case FlagState.CANARY:
        case FlagState.GRADUAL_ROLLOUT:
          enabled = this.evaluateTargetingRules(flag, validatedContext);
          reason = enabled ? 'targeting_rules_matched' : 'targeting_rules_not_matched';
          break;
      }

      const result: FlagEvaluationResult = {
        flagName,
        enabled,
        reason,
        evaluatedAt: new Date(),
        trackingData: {
          flagId: flag.id,
          rolloutPercentage: flag.rolloutPercentage,
          targetingStrategy: flag.targeting.strategy,
          userId: validatedContext.userId,
          environment: validatedContext.environment
        }
      };

      // Record evaluation event
      await this.recordEvent({
        eventType: 'flag_evaluated',
        flagName,
        flagId: flag.id,
        userId: validatedContext.userId,
        environment: validatedContext.environment,
        timestamp: new Date(),
        metadata: { enabled, reason }
      });

      await this.updateMetrics('evaluation', Date.now() - startTime);
      
      return result;
    } catch (error) {
      console.error('Flag evaluation error:', error);
      
      // Fail safe - return disabled
      return {
        flagName,
        enabled: false,
        reason: 'evaluation_error',
        evaluatedAt: new Date(),
        trackingData: { error: (error as Error).message }
      };
    }
  }

  async getAllFlags(environment: Environment): Promise<FlagConfig[]> {
    try {
      const pattern = `${this.cachePrefix}${environment}:*`;
      const keys = await this.redis.keys(pattern);
      
      if (keys.length === 0) {
        return [];
      }

      const flagData = await this.redis.mGet(keys);
      const flags: FlagConfig[] = [];

      for (const data of flagData) {
        if (data) {
          try {
            const flag = JSON.parse(data);
            flags.push(FlagConfigSchema.parse(flag));
          } catch (error) {
            console.error('Failed to parse flag data:', error);
          }
        }
      }

      return flags;
    } catch (error) {
      console.error('Failed to get all flags:', error);
      return [];
    }
  }

  async getFlagConfig(flagName: string, environment: Environment): Promise<FlagConfig | null> {
    try {
      const key = this.generateFlagKey(flagName, environment);
      const data = await this.redis.get(key);
      
      if (!data) {
        return null;
      }

      const flag = JSON.parse(data);
      return FlagConfigSchema.parse(flag);
    } catch (error) {
      console.error('Failed to get flag config:', error);
      return null;
    }
  }

  async updateFlag(flagId: string, updates: Partial<FlagConfig>): Promise<FlagConfig> {
    try {
      // First, find the existing flag
      const allEnvs = [Environment.DEVELOPMENT, Environment.STAGING, Environment.PRODUCTION];
      let existingFlag: FlagConfig | null = null;
      let flagEnvironment: Environment | null = null;

      for (const env of allEnvs) {
        const flags = await this.getAllFlags(env);
        const found = flags.find(f => f.id === flagId);
        if (found) {
          existingFlag = found;
          flagEnvironment = env;
          break;
        }
      }

      if (!existingFlag || !flagEnvironment) {
        throw new Error(`Flag with ID ${flagId} not found`);
      }

      // Merge updates
      const updatedFlag: FlagConfig = {
        ...existingFlag,
        ...updates,
        id: flagId, // Ensure ID doesn't change
        updatedAt: new Date()
      };

      // Validate updated flag
      const validatedFlag = FlagConfigSchema.parse(updatedFlag);

      // Save to cache
      const key = this.generateFlagKey(validatedFlag.name, flagEnvironment);
      await this.redis.set(key, JSON.stringify(validatedFlag));

      // Record update event
      await this.recordEvent({
        eventType: 'flag_updated',
        flagName: validatedFlag.name,
        flagId: validatedFlag.id,
        environment: flagEnvironment,
        timestamp: new Date(),
        metadata: updates,
        previousState: existingFlag.state,
        newState: validatedFlag.state
      });

      await this.updateMetrics('update');

      return validatedFlag;
    } catch (error) {
      console.error('Failed to update flag:', error);
      throw error;
    }
  }

  async createFlag(config: Omit<FlagConfig, 'id' | 'createdAt' | 'updatedAt'>): Promise<FlagConfig> {
    try {
      const now = new Date();
      const flag: FlagConfig = {
        ...config,
        id: uuidv4(),
        createdAt: now,
        updatedAt: now
      };

      // Validate flag
      const validatedFlag = FlagConfigSchema.parse(flag);

      // Save to cache
      const key = this.generateFlagKey(validatedFlag.name, validatedFlag.environment);
      await this.redis.set(key, JSON.stringify(validatedFlag));

      // Record creation event
      await this.recordEvent({
        eventType: 'flag_created',
        flagName: validatedFlag.name,
        flagId: validatedFlag.id,
        environment: validatedFlag.environment,
        timestamp: now,
        metadata: config
      });

      return validatedFlag;
    } catch (error) {
      console.error('Failed to create flag:', error);
      throw error;
    }
  }

  async deleteFlag(flagId: string): Promise<void> {
    try {
      // Find and delete the flag
      const allEnvs = [Environment.DEVELOPMENT, Environment.STAGING, Environment.PRODUCTION];
      
      for (const env of allEnvs) {
        const flags = await this.getAllFlags(env);
        const flag = flags.find(f => f.id === flagId);
        
        if (flag) {
          const key = this.generateFlagKey(flag.name, env);
          await this.redis.del(key);

          // Record deletion event
          await this.recordEvent({
            eventType: 'flag_deleted',
            flagName: flag.name,
            flagId: flag.id,
            environment: env,
            timestamp: new Date(),
            metadata: { deletedFlag: flag }
          });

          return;
        }
      }

      throw new Error(`Flag with ID ${flagId} not found`);
    } catch (error) {
      console.error('Failed to delete flag:', error);
      throw error;
    }
  }

  async emergencyDisableFlag(flagName: string, environment: Environment, reason: string): Promise<void> {
    try {
      const flag = await this.getFlagConfig(flagName, environment);
      
      if (!flag) {
        throw new Error(`Flag ${flagName} not found in ${environment}`);
      }

      // Update flag to kill switch state
      await this.updateFlag(flag.id, {
        state: FlagState.KILL_SWITCH,
        metadata: {
          ...flag.metadata,
          emergencyDisabled: true,
          emergencyReason: reason,
          emergencyDisabledAt: new Date().toISOString()
        }
      });

      // Record emergency disable event
      await this.recordEvent({
        eventType: 'flag_emergency_disabled',
        flagName: flag.name,
        flagId: flag.id,
        environment,
        timestamp: new Date(),
        metadata: { reason },
        previousState: flag.state,
        newState: FlagState.KILL_SWITCH
      });

      await this.updateMetrics('emergency_disable');

      console.log(`Emergency disable activated for flag ${flagName} in ${environment}: ${reason}`);
    } catch (error) {
      console.error('Failed to emergency disable flag:', error);
      throw error;
    }
  }

  async getMetrics(): Promise<FeatureFlagMetrics> {
    try {
      // Get recent metrics from Redis
      const now = Date.now();
      const oneHourAgo = now - (60 * 60 * 1000);

      const evaluationKeys = await this.redis.keys(`${this.metricsPrefix}evaluations:*`);
      const updateKeys = await this.redis.keys(`${this.metricsPrefix}updates:*`);
      const emergencyKeys = await this.redis.keys(`${this.metricsPrefix}emergency_disables:*`);

      // Filter keys from the last hour and sum values
      const recentEvaluations = await this.sumRecentMetrics(evaluationKeys, oneHourAgo);
      const recentUpdates = await this.sumRecentMetrics(updateKeys, oneHourAgo);
      const recentEmergencyDisables = await this.sumRecentMetrics(emergencyKeys, oneHourAgo);

      return {
        flagEvaluations: recentEvaluations,
        flagUpdates: recentUpdates,
        emergencyDisables: recentEmergencyDisables,
        evaluationLatency: this.metrics.evaluationLatency,
        cacheHitRate: this.calculateCacheHitRate()
      };
    } catch (error) {
      console.error('Failed to get metrics:', error);
      return this.metrics;
    }
  }

  private async sumRecentMetrics(keys: string[], since: number): Promise<number> {
    let sum = 0;
    
    for (const key of keys) {
      const timestamp = parseInt(key.split(':').pop() || '0');
      if (timestamp >= since) {
        const value = await this.redis.get(key);
        sum += parseInt(value || '0');
      }
    }
    
    return sum;
  }

  private calculateCacheHitRate(): number {
    // Simple cache hit rate calculation - in production, implement more sophisticated tracking
    return Math.random() * 100; // Placeholder
  }

  async disconnect(): Promise<void> {
    try {
      await this.redis.disconnect();
      console.log('Feature flag Redis client disconnected');
    } catch (error) {
      console.error('Error disconnecting Redis client:', error);
    }
  }
}

export default FeatureFlagClientImpl;