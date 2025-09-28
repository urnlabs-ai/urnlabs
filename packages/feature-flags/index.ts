/**
 * Feature Flag Management System
 * Provides gradual rollouts, A/B testing, and automated toggle management
 */

export interface FeatureFlag {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  rolloutPercentage: number;
  environment: string;
  conditions?: FeatureFlagCondition[];
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface FeatureFlagCondition {
  type: 'user_percentage' | 'user_attribute' | 'environment' | 'time_window';
  operator: 'equals' | 'not_equals' | 'in' | 'not_in' | 'greater_than' | 'less_than';
  value: any;
}

export interface FeatureFlagEvaluation {
  flagId: string;
  enabled: boolean;
  variant?: string;
  reason: string;
  timestamp: Date;
}

export interface FeatureFlagContext {
  userId?: string;
  userAttributes?: Record<string, any>;
  environment: string;
  timestamp?: Date;
}

export class FeatureFlagManager {
  private flags: Map<string, FeatureFlag> = new Map();
  private listeners: Map<string, ((flag: FeatureFlag) => void)[]> = new Map();

  constructor(private defaultEnvironment: string = 'production') {}

  /**
   * Register a feature flag
   */
  register(flag: FeatureFlag): void {
    this.flags.set(flag.id, flag);
    this.notifyListeners(flag.id, flag);
  }

  /**
   * Evaluate a feature flag for a given context
   */
  evaluate(flagId: string, context: FeatureFlagContext): FeatureFlagEvaluation {
    const flag = this.flags.get(flagId);

    if (!flag) {
      return {
        flagId,
        enabled: false,
        reason: 'Flag not found',
        timestamp: new Date()
      };
    }

    // Check environment
    if (flag.environment !== context.environment) {
      return {
        flagId,
        enabled: false,
        reason: `Flag not enabled for environment: ${context.environment}`,
        timestamp: new Date()
      };
    }

    // Check if flag is globally disabled
    if (!flag.enabled) {
      return {
        flagId,
        enabled: false,
        reason: 'Flag globally disabled',
        timestamp: new Date()
      };
    }

    // Evaluate conditions
    if (flag.conditions && flag.conditions.length > 0) {
      for (const condition of flag.conditions) {
        if (!this.evaluateCondition(condition, context)) {
          return {
            flagId,
            enabled: false,
            reason: `Condition not met: ${condition.type}`,
            timestamp: new Date()
          };
        }
      }
    }

    // Check rollout percentage
    if (flag.rolloutPercentage < 100) {
      const hash = this.hashContext(flagId, context);
      const percentage = (hash % 100) + 1;

      if (percentage > flag.rolloutPercentage) {
        return {
          flagId,
          enabled: false,
          reason: `Outside rollout percentage: ${percentage} > ${flag.rolloutPercentage}`,
          timestamp: new Date()
        };
      }
    }

    return {
      flagId,
      enabled: true,
      reason: 'All conditions met',
      timestamp: new Date()
    };
  }

  /**
   * Check if a feature flag is enabled
   */
  isEnabled(flagId: string, context: FeatureFlagContext): boolean {
    return this.evaluate(flagId, context).enabled;
  }

  /**
   * Update a feature flag
   */
  update(flagId: string, updates: Partial<FeatureFlag>): void {
    const flag = this.flags.get(flagId);
    if (!flag) {
      throw new Error(`Feature flag not found: ${flagId}`);
    }

    const updatedFlag = {
      ...flag,
      ...updates,
      updatedAt: new Date()
    };

    this.flags.set(flagId, updatedFlag);
    this.notifyListeners(flagId, updatedFlag);
  }

  /**
   * Get all feature flags
   */
  getAll(): FeatureFlag[] {
    return Array.from(this.flags.values());
  }

  /**
   * Get a specific feature flag
   */
  get(flagId: string): FeatureFlag | undefined {
    return this.flags.get(flagId);
  }

  /**
   * Subscribe to flag changes
   */
  subscribe(flagId: string, listener: (flag: FeatureFlag) => void): () => void {
    if (!this.listeners.has(flagId)) {
      this.listeners.set(flagId, []);
    }

    this.listeners.get(flagId)!.push(listener);

    // Return unsubscribe function
    return () => {
      const listeners = this.listeners.get(flagId);
      if (listeners) {
        const index = listeners.indexOf(listener);
        if (index > -1) {
          listeners.splice(index, 1);
        }
      }
    };
  }

  /**
   * Gradually increase rollout percentage
   */
  async gradualRollout(
    flagId: string,
    targetPercentage: number,
    stepSize: number = 10,
    stepInterval: number = 300000 // 5 minutes
  ): Promise<void> {
    const flag = this.flags.get(flagId);
    if (!flag) {
      throw new Error(`Feature flag not found: ${flagId}`);
    }

    let currentPercentage = flag.rolloutPercentage;

    while (currentPercentage < targetPercentage) {
      const nextPercentage = Math.min(currentPercentage + stepSize, targetPercentage);

      this.update(flagId, { rolloutPercentage: nextPercentage });

      if (nextPercentage < targetPercentage) {
        await new Promise(resolve => setTimeout(resolve, stepInterval));
      }

      currentPercentage = nextPercentage;
    }
  }

  /**
   * Emergency disable a feature flag
   */
  emergencyDisable(flagId: string): void {
    this.update(flagId, {
      enabled: false,
      rolloutPercentage: 0,
      metadata: {
        ...this.flags.get(flagId)?.metadata,
        emergencyDisabled: true,
        emergencyDisabledAt: new Date().toISOString()
      }
    });
  }

  private evaluateCondition(condition: FeatureFlagCondition, context: FeatureFlagContext): boolean {
    switch (condition.type) {
      case 'user_percentage':
        if (!context.userId) return false;
        const hash = this.hashString(context.userId);
        const percentage = (hash % 100) + 1;
        return percentage <= condition.value;

      case 'user_attribute':
        const userValue = context.userAttributes?.[condition.operator];
        return this.compareValues(userValue, condition.operator, condition.value);

      case 'environment':
        return this.compareValues(context.environment, condition.operator, condition.value);

      case 'time_window':
        const now = context.timestamp || new Date();
        return this.compareValues(now.getTime(), condition.operator, condition.value);

      default:
        return false;
    }
  }

  private compareValues(actual: any, operator: string, expected: any): boolean {
    switch (operator) {
      case 'equals':
        return actual === expected;
      case 'not_equals':
        return actual !== expected;
      case 'in':
        return Array.isArray(expected) && expected.includes(actual);
      case 'not_in':
        return Array.isArray(expected) && !expected.includes(actual);
      case 'greater_than':
        return actual > expected;
      case 'less_than':
        return actual < expected;
      default:
        return false;
    }
  }

  private hashContext(flagId: string, context: FeatureFlagContext): number {
    const str = `${flagId}-${context.userId || 'anonymous'}-${context.environment}`;
    return this.hashString(str);
  }

  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }

  private notifyListeners(flagId: string, flag: FeatureFlag): void {
    const listeners = this.listeners.get(flagId);
    if (listeners) {
      listeners.forEach(listener => listener(flag));
    }
  }
}

/**
 * A/B Testing utilities
 */
export class ABTestManager {
  constructor(private featureFlagManager: FeatureFlagManager) {}

  /**
   * Create an A/B test
   */
  createABTest(
    testId: string,
    variants: string[],
    trafficSplit: number[],
    environment: string = 'production'
  ): void {
    if (variants.length !== trafficSplit.length) {
      throw new Error('Variants and traffic split arrays must have the same length');
    }

    if (trafficSplit.reduce((sum, split) => sum + split, 0) !== 100) {
      throw new Error('Traffic split must sum to 100');
    }

    variants.forEach((variant, index) => {
      const flagId = `${testId}_${variant}`;
      this.featureFlagManager.register({
        id: flagId,
        name: `${testId} - Variant ${variant}`,
        description: `A/B test variant ${variant} for test ${testId}`,
        enabled: true,
        rolloutPercentage: trafficSplit[index],
        environment,
        conditions: [{
          type: 'user_percentage',
          operator: 'less_than',
          value: trafficSplit.slice(0, index + 1).reduce((sum, split) => sum + split, 0)
        }],
        metadata: {
          abTest: testId,
          variant,
          trafficSplit: trafficSplit[index]
        },
        createdAt: new Date(),
        updatedAt: new Date()
      });
    });
  }

  /**
   * Get the assigned variant for a user
   */
  getVariant(testId: string, context: FeatureFlagContext): string | null {
    const flags = this.featureFlagManager.getAll()
      .filter(flag => flag.metadata?.abTest === testId);

    for (const flag of flags) {
      if (this.featureFlagManager.isEnabled(flag.id, context)) {
        return flag.metadata?.variant || null;
      }
    }

    return null;
  }
}

/**
 * Feature flag middleware for Express
 */
export function createFeatureFlagMiddleware(
  featureFlagManager: FeatureFlagManager,
  contextExtractor: (req: any) => FeatureFlagContext
) {
  return (req: any, res: any, next: any) => {
    const context = contextExtractor(req);

    req.featureFlags = {
      isEnabled: (flagId: string) => featureFlagManager.isEnabled(flagId, context),
      evaluate: (flagId: string) => featureFlagManager.evaluate(flagId, context),
      context
    };

    next();
  };
}

export default FeatureFlagManager;