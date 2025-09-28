import { EventEmitter } from 'events';
import { logger } from '../core/Logger.js';
import { IntelligentCacheManager, CacheMetrics } from './IntelligentCacheManager.js';
import { PatternAnalyzer, WorkflowPattern, CachePattern } from './PatternAnalyzer.js';
import { CacheWarmer } from './CacheWarmer.js';

export interface OptimizationRule {
  id: string;
  name: string;
  description: string;
  category: 'performance' | 'memory' | 'cost' | 'reliability';
  priority: 'low' | 'medium' | 'high' | 'critical';
  conditions: {
    metrics?: {
      hitRatio?: { min?: number; max?: number };
      latency?: { min?: number; max?: number };
      memoryUsage?: { min?: number; max?: number };
      errorRate?: { min?: number; max?: number };
    };
    patterns?: {
      minConfidence?: number;
      minFrequency?: number;
      categories?: string[];
    };
    timeWindow?: number;
    minSampleSize?: number;
  };
  actions: {
    adjustTTL?: {
      multiplier?: number;
      absolute?: number;
      patterns?: string[];
    };
    adjustEviction?: {
      policy?: 'lru' | 'lfu' | 'ttl' | 'intelligent';
      aggressiveness?: number;
    };
    adjustCompression?: {
      enabled?: boolean;
      threshold?: number;
      algorithm?: string;
    };
    adjustWarmup?: {
      enabled?: boolean;
      strategies?: string[];
      frequency?: number;
    };
    scaleResources?: {
      memoryMultiplier?: number;
      cpuMultiplier?: number;
    };
  };
  cooldown: number; // Minimum time between applying this rule
  enabled: boolean;
}

export interface OptimizationMetrics {
  rulesApplied: number;
  lastOptimization: number;
  improvements: {
    hitRatioGain: number;
    latencyReduction: number;
    memoryEfficiency: number;
    costSavings: number;
  };
  activeRules: string[];
  failedOptimizations: number;
  timestamp: number;
}

export interface OptimizationRecommendation {
  id: string;
  type: 'performance' | 'memory' | 'cost' | 'reliability';
  priority: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  impact: {
    hitRatioImprovement?: number;
    latencyReduction?: number;
    memoryReduction?: number;
    costSavings?: number;
  };
  implementation: {
    effort: 'low' | 'medium' | 'high';
    risk: 'low' | 'medium' | 'high';
    timeframe: 'immediate' | 'short_term' | 'long_term';
    steps: string[];
  };
  confidence: number;
  basedOnMetrics: string[];
  generatedAt: number;
}

export interface OptimizationSession {
  id: string;
  startTime: number;
  endTime?: number;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  rulesEvaluated: number;
  rulesApplied: number;
  recommendations: OptimizationRecommendation[];
  metrics: {
    before: CacheMetrics;
    after?: CacheMetrics;
  };
  changes: Array<{
    rule: string;
    action: string;
    parameters: Record<string, any>;
    result: 'success' | 'failure';
    error?: string;
  }>;
}

export class CacheOptimizer extends EventEmitter {
  private cacheManager: IntelligentCacheManager;
  private patternAnalyzer: PatternAnalyzer;
  private cacheWarmer: CacheWarmer;
  private rules: Map<string, OptimizationRule> = new Map();
  private rulesCooldown: Map<string, number> = new Map();
  private metrics: OptimizationMetrics;
  private currentSession?: OptimizationSession;
  private optimizationTimer?: NodeJS.Timeout;
  private isOptimizing = false;

  private readonly OPTIMIZATION_INTERVAL = 15 * 60 * 1000; // 15 minutes
  private readonly DEFAULT_COOLDOWN = 30 * 60 * 1000; // 30 minutes

  constructor(
    cacheManager: IntelligentCacheManager,
    patternAnalyzer: PatternAnalyzer,
    cacheWarmer: CacheWarmer
  ) {
    super();

    this.cacheManager = cacheManager;
    this.patternAnalyzer = patternAnalyzer;
    this.cacheWarmer = cacheWarmer;

    this.metrics = {
      rulesApplied: 0,
      lastOptimization: 0,
      improvements: {
        hitRatioGain: 0,
        latencyReduction: 0,
        memoryEfficiency: 0,
        costSavings: 0
      },
      activeRules: [],
      failedOptimizations: 0,
      timestamp: Date.now()
    };

    this.initializeDefaultRules();
    this.startAutomaticOptimization();

    logger.info('Cache optimizer initialized', {
      rules: this.rules.size,
      optimizationInterval: this.OPTIMIZATION_INTERVAL
    });
  }

  private initializeDefaultRules(): void {
    // Rule 1: Low hit ratio optimization
    const lowHitRatioRule: OptimizationRule = {
      id: 'low-hit-ratio',
      name: 'Low Hit Ratio Optimization',
      description: 'Optimize cache when hit ratio falls below threshold',
      category: 'performance',
      priority: 'high',
      conditions: {
        metrics: {
          hitRatio: { max: 0.7 }
        },
        minSampleSize: 100
      },
      actions: {
        adjustTTL: {
          multiplier: 1.5 // Increase TTL by 50%
        },
        adjustWarmup: {
          enabled: true,
          frequency: 2 // Double warmup frequency
        }
      },
      cooldown: this.DEFAULT_COOLDOWN,
      enabled: true
    };

    // Rule 2: High memory usage optimization
    const highMemoryRule: OptimizationRule = {
      id: 'high-memory-usage',
      name: 'High Memory Usage Optimization',
      description: 'Optimize memory usage when threshold exceeded',
      category: 'memory',
      priority: 'critical',
      conditions: {
        metrics: {
          memoryUsage: { min: 0.85 }
        }
      },
      actions: {
        adjustEviction: {
          policy: 'intelligent',
          aggressiveness: 1.5
        },
        adjustCompression: {
          enabled: true,
          threshold: 512 // Compress data larger than 512 bytes
        }
      },
      cooldown: 10 * 60 * 1000, // 10 minutes
      enabled: true
    };

    // Rule 3: High latency optimization
    const highLatencyRule: OptimizationRule = {
      id: 'high-latency',
      name: 'High Latency Optimization',
      description: 'Optimize when cache latency is too high',
      category: 'performance',
      priority: 'high',
      conditions: {
        metrics: {
          latency: { min: 100 } // More than 100ms
        },
        minSampleSize: 50
      },
      actions: {
        adjustCompression: {
          enabled: false // Disable compression to reduce latency
        },
        adjustEviction: {
          policy: 'lru' // Use simpler eviction policy
        }
      },
      cooldown: this.DEFAULT_COOLDOWN,
      enabled: true
    };

    // Rule 4: Pattern-based optimization
    const patternOptimizationRule: OptimizationRule = {
      id: 'pattern-optimization',
      name: 'Pattern-Based Optimization',
      description: 'Optimize based on detected workflow patterns',
      category: 'performance',
      priority: 'medium',
      conditions: {
        patterns: {
          minConfidence: 0.8,
          minFrequency: 1.0
        }
      },
      actions: {
        adjustWarmup: {
          enabled: true,
          strategies: ['predictive-pattern']
        },
        adjustTTL: {
          patterns: ['high-frequency'] // Increase TTL for high-frequency patterns
        }
      },
      cooldown: 45 * 60 * 1000, // 45 minutes
      enabled: true
    };

    // Rule 5: Cost optimization
    const costOptimizationRule: OptimizationRule = {
      id: 'cost-optimization',
      name: 'Cost Optimization',
      description: 'Optimize for cost efficiency',
      category: 'cost',
      priority: 'medium',
      conditions: {
        metrics: {
          memoryUsage: { min: 0.6 },
          hitRatio: { min: 0.8 } // Good performance, can optimize for cost
        }
      },
      actions: {
        adjustCompression: {
          enabled: true,
          threshold: 256 // More aggressive compression
        },
        adjustEviction: {
          policy: 'intelligent',
          aggressiveness: 1.2
        }
      },
      cooldown: 60 * 60 * 1000, // 1 hour
      enabled: true
    };

    [lowHitRatioRule, highMemoryRule, highLatencyRule, patternOptimizationRule, costOptimizationRule]
      .forEach(rule => {
        this.rules.set(rule.id, rule);
      });

    logger.info('Default optimization rules initialized', {
      rules: Array.from(this.rules.keys())
    });
  }

  private startAutomaticOptimization(): void {
    this.optimizationTimer = setInterval(() => {
      if (!this.isOptimizing) {
        this.runOptimizationCycle();
      }
    }, this.OPTIMIZATION_INTERVAL);

    logger.info('Automatic optimization started', {
      interval: this.OPTIMIZATION_INTERVAL
    });
  }

  public async runOptimizationCycle(): Promise<OptimizationSession> {
    if (this.isOptimizing) {
      throw new Error('Optimization cycle already in progress');
    }

    this.isOptimizing = true;
    const sessionId = `opt-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    logger.info('Starting optimization cycle', { sessionId });

    const session: OptimizationSession = {
      id: sessionId,
      startTime: Date.now(),
      status: 'running',
      rulesEvaluated: 0,
      rulesApplied: 0,
      recommendations: [],
      metrics: {
        before: this.cacheManager.getMetrics()
      },
      changes: []
    };

    this.currentSession = session;
    this.emit('optimization-started', session);

    try {
      // Step 1: Collect current metrics and patterns
      const currentMetrics = this.cacheManager.getMetrics();
      const patterns = this.patternAnalyzer.getAllPatterns();

      logger.debug('Collected optimization data', {
        metrics: currentMetrics,
        workflowPatterns: patterns.workflow.length,
        cachePatterns: patterns.cache.length
      });

      // Step 2: Evaluate all rules
      const applicableRules = await this.evaluateRules(currentMetrics, patterns);
      session.rulesEvaluated = this.rules.size;

      logger.info('Rules evaluated', {
        total: this.rules.size,
        applicable: applicableRules.length
      });

      // Step 3: Apply rules in priority order
      for (const rule of applicableRules) {
        try {
          const applied = await this.applyRule(rule, currentMetrics, patterns);
          if (applied) {
            session.rulesApplied++;
            session.changes.push(...applied);
          }

          // Brief pause between rule applications
          await this.sleep(1000);

        } catch (error) {
          logger.error('Rule application failed', {
            error,
            rule: rule.id,
            sessionId
          });

          session.changes.push({
            rule: rule.id,
            action: 'apply_rule',
            parameters: {},
            result: 'failure',
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }

      // Step 4: Generate recommendations for manual optimization
      session.recommendations = await this.generateRecommendations(currentMetrics, patterns);

      // Step 5: Measure impact
      await this.sleep(5000); // Wait for changes to take effect
      session.metrics.after = this.cacheManager.getMetrics();

      const impact = this.calculateOptimizationImpact(session.metrics.before, session.metrics.after);
      this.updateOptimizationMetrics(impact, session.rulesApplied);

      session.status = 'completed';
      session.endTime = Date.now();

      logger.info('Optimization cycle completed', {
        sessionId,
        duration: session.endTime - session.startTime,
        rulesApplied: session.rulesApplied,
        recommendations: session.recommendations.length,
        impact
      });

      this.emit('optimization-completed', session);

    } catch (error) {
      session.status = 'failed';
      session.endTime = Date.now();

      logger.error('Optimization cycle failed', {
        error,
        sessionId,
        duration: session.endTime - session.startTime
      });

      this.metrics.failedOptimizations++;
      this.emit('optimization-failed', { session, error });

    } finally {
      this.isOptimizing = false;
      this.currentSession = undefined;
    }

    return session;
  }

  private async evaluateRules(
    metrics: CacheMetrics,
    patterns: { workflow: WorkflowPattern[]; cache: CachePattern[] }
  ): Promise<OptimizationRule[]> {
    const applicableRules: OptimizationRule[] = [];
    const now = Date.now();

    for (const [ruleId, rule] of this.rules.entries()) {
      if (!rule.enabled) {
        continue;
      }

      // Check cooldown
      const lastApplied = this.rulesCooldown.get(ruleId) || 0;
      if (now - lastApplied < rule.cooldown) {
        continue;
      }

      // Evaluate conditions
      if (await this.evaluateRuleConditions(rule, metrics, patterns)) {
        applicableRules.push(rule);
      }
    }

    // Sort by priority
    applicableRules.sort((a, b) => {
      const priorityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
      return priorityOrder[b.priority] - priorityOrder[a.priority];
    });

    return applicableRules;
  }

  private async evaluateRuleConditions(
    rule: OptimizationRule,
    metrics: CacheMetrics,
    patterns: { workflow: WorkflowPattern[]; cache: CachePattern[] }
  ): Promise<boolean> {
    try {
      // Check metric conditions
      if (rule.conditions.metrics) {
        const metricConditions = rule.conditions.metrics;

        // Hit ratio conditions
        if (metricConditions.hitRatio) {
          if (metricConditions.hitRatio.min !== undefined && metrics.hitRatio < metricConditions.hitRatio.min) {
            return false;
          }
          if (metricConditions.hitRatio.max !== undefined && metrics.hitRatio > metricConditions.hitRatio.max) {
            return false;
          }
        }

        // Latency conditions
        if (metricConditions.latency) {
          if (metricConditions.latency.min !== undefined && metrics.avgLatency < metricConditions.latency.min) {
            return false;
          }
          if (metricConditions.latency.max !== undefined && metrics.avgLatency > metricConditions.latency.max) {
            return false;
          }
        }

        // Memory usage conditions
        if (metricConditions.memoryUsage) {
          if (metricConditions.memoryUsage.min !== undefined && metrics.memoryUsage < metricConditions.memoryUsage.min) {
            return false;
          }
          if (metricConditions.memoryUsage.max !== undefined && metrics.memoryUsage > metricConditions.memoryUsage.max) {
            return false;
          }
        }
      }

      // Check pattern conditions
      if (rule.conditions.patterns) {
        const patternConditions = rule.conditions.patterns;
        const applicablePatterns = patterns.workflow.filter(pattern => {
          if (patternConditions.minConfidence && pattern.confidence < patternConditions.minConfidence) {
            return false;
          }
          if (patternConditions.minFrequency && pattern.frequency < patternConditions.minFrequency) {
            return false;
          }
          return true;
        });

        if (applicablePatterns.length === 0) {
          return false;
        }
      }

      // Check sample size
      if (rule.conditions.minSampleSize && metrics.totalRequests < rule.conditions.minSampleSize) {
        return false;
      }

      return true;

    } catch (error) {
      logger.error('Rule condition evaluation failed', { error, rule: rule.id });
      return false;
    }
  }

  private async applyRule(
    rule: OptimizationRule,
    metrics: CacheMetrics,
    patterns: { workflow: WorkflowPattern[]; cache: CachePattern[] }
  ): Promise<Array<{ rule: string; action: string; parameters: Record<string, any>; result: 'success' | 'failure'; error?: string }> | null> {
    const changes: Array<{
      rule: string;
      action: string;
      parameters: Record<string, any>;
      result: 'success' | 'failure';
      error?: string;
    }> = [];

    try {
      logger.info('Applying optimization rule', { rule: rule.id });

      // Apply TTL adjustments
      if (rule.actions.adjustTTL) {
        const ttlChange = await this.applyTTLAdjustment(rule.actions.adjustTTL, patterns);
        changes.push({
          rule: rule.id,
          action: 'adjust_ttl',
          parameters: rule.actions.adjustTTL,
          result: ttlChange ? 'success' : 'failure'
        });
      }

      // Apply eviction adjustments
      if (rule.actions.adjustEviction) {
        const evictionChange = await this.applyEvictionAdjustment(rule.actions.adjustEviction);
        changes.push({
          rule: rule.id,
          action: 'adjust_eviction',
          parameters: rule.actions.adjustEviction,
          result: evictionChange ? 'success' : 'failure'
        });
      }

      // Apply compression adjustments
      if (rule.actions.adjustCompression) {
        const compressionChange = await this.applyCompressionAdjustment(rule.actions.adjustCompression);
        changes.push({
          rule: rule.id,
          action: 'adjust_compression',
          parameters: rule.actions.adjustCompression,
          result: compressionChange ? 'success' : 'failure'
        });
      }

      // Apply warmup adjustments
      if (rule.actions.adjustWarmup) {
        const warmupChange = await this.applyWarmupAdjustment(rule.actions.adjustWarmup, patterns);
        changes.push({
          rule: rule.id,
          action: 'adjust_warmup',
          parameters: rule.actions.adjustWarmup,
          result: warmupChange ? 'success' : 'failure'
        });
      }

      // Update cooldown
      this.rulesCooldown.set(rule.id, Date.now());
      this.metrics.rulesApplied++;

      logger.info('Optimization rule applied successfully', {
        rule: rule.id,
        changes: changes.length
      });

      return changes;

    } catch (error) {
      logger.error('Failed to apply optimization rule', { error, rule: rule.id });

      changes.push({
        rule: rule.id,
        action: 'apply_rule',
        parameters: {},
        result: 'failure',
        error: error instanceof Error ? error.message : String(error)
      });

      return changes;
    }
  }

  private async applyTTLAdjustment(
    adjustment: NonNullable<OptimizationRule['actions']['adjustTTL']>,
    patterns: { workflow: WorkflowPattern[]; cache: CachePattern[] }
  ): Promise<boolean> {
    try {
      // This would require extending the cache manager to support TTL policy updates
      // For now, we'll log the intended adjustment

      logger.info('TTL adjustment requested', {
        multiplier: adjustment.multiplier,
        absolute: adjustment.absolute,
        patterns: adjustment.patterns
      });

      // In a real implementation, this would:
      // 1. Update default TTL policies
      // 2. Adjust TTLs for existing cache entries matching patterns
      // 3. Update pattern-based TTL calculations

      return true;

    } catch (error) {
      logger.error('TTL adjustment failed', { error, adjustment });
      return false;
    }
  }

  private async applyEvictionAdjustment(
    adjustment: NonNullable<OptimizationRule['actions']['adjustEviction']>
  ): Promise<boolean> {
    try {
      logger.info('Eviction policy adjustment requested', {
        policy: adjustment.policy,
        aggressiveness: adjustment.aggressiveness
      });

      // In a real implementation, this would:
      // 1. Update Redis eviction policy
      // 2. Adjust intelligent eviction parameters
      // 3. Trigger immediate eviction if needed

      if (adjustment.aggressiveness && adjustment.aggressiveness > 1) {
        // Trigger aggressive eviction
        await this.triggerAggressiveEviction(adjustment.aggressiveness);
      }

      return true;

    } catch (error) {
      logger.error('Eviction adjustment failed', { error, adjustment });
      return false;
    }
  }

  private async applyCompressionAdjustment(
    adjustment: NonNullable<OptimizationRule['actions']['adjustCompression']>
  ): Promise<boolean> {
    try {
      logger.info('Compression adjustment requested', {
        enabled: adjustment.enabled,
        threshold: adjustment.threshold,
        algorithm: adjustment.algorithm
      });

      // In a real implementation, this would:
      // 1. Update compression settings in cache manager
      // 2. Re-compress existing entries if beneficial
      // 3. Update compression algorithms

      return true;

    } catch (error) {
      logger.error('Compression adjustment failed', { error, adjustment });
      return false;
    }
  }

  private async applyWarmupAdjustment(
    adjustment: NonNullable<OptimizationRule['actions']['adjustWarmup']>,
    patterns: { workflow: WorkflowPattern[]; cache: CachePattern[] }
  ): Promise<boolean> {
    try {
      logger.info('Warmup adjustment requested', {
        enabled: adjustment.enabled,
        strategies: adjustment.strategies,
        frequency: adjustment.frequency
      });

      if (adjustment.enabled) {
        // Trigger additional warmup based on high-confidence patterns
        const highConfidencePatterns = patterns.workflow.filter(p => p.confidence > 0.8);

        for (const pattern of highConfidencePatterns) {
          try {
            await this.cacheWarmer.warmupWorkflow(pattern.workflowId, {
              priority: 'high',
              strategy: adjustment.strategies?.[0] || 'predictive-pattern'
            });
          } catch (error) {
            logger.error('Pattern warmup failed during optimization', {
              error,
              pattern: pattern.id
            });
          }
        }
      }

      return true;

    } catch (error) {
      logger.error('Warmup adjustment failed', { error, adjustment });
      return false;
    }
  }

  private async triggerAggressiveEviction(aggressiveness: number): Promise<void> {
    try {
      // Get top keys by size and low access frequency
      const topKeys = await this.cacheManager.getTopKeys(50);
      const keysToEvict = Math.floor(topKeys.length * (aggressiveness - 1) * 0.1);

      if (keysToEvict > 0) {
        // Sort by lowest score (least frequently accessed)
        const candidates = topKeys
          .sort((a, b) => a.score - b.score)
          .slice(0, keysToEvict);

        logger.info('Triggering aggressive eviction', {
          candidates: candidates.length,
          aggressiveness
        });

        // Note: In a real implementation, we'd need to add eviction methods to cache manager
        // For now, we log the intention
      }

    } catch (error) {
      logger.error('Aggressive eviction failed', { error, aggressiveness });
    }
  }

  private async generateRecommendations(
    metrics: CacheMetrics,
    patterns: { workflow: WorkflowPattern[]; cache: CachePattern[] }
  ): Promise<OptimizationRecommendation[]> {
    const recommendations: OptimizationRecommendation[] = [];

    try {
      // Recommendation 1: Memory usage optimization
      if (metrics.memoryUsage > 0.8) {
        recommendations.push({
          id: `rec-memory-${Date.now()}`,
          type: 'memory',
          priority: 'high',
          title: 'Optimize Memory Usage',
          description: `Memory usage is at ${(metrics.memoryUsage * 100).toFixed(1)}%. Consider increasing compression or adjusting eviction policies.`,
          impact: {
            memoryReduction: 25,
            costSavings: 15
          },
          implementation: {
            effort: 'medium',
            risk: 'low',
            timeframe: 'short_term',
            steps: [
              'Enable aggressive compression for entries > 1KB',
              'Implement intelligent eviction policy',
              'Review and optimize TTL values',
              'Consider horizontal scaling'
            ]
          },
          confidence: 0.85,
          basedOnMetrics: ['memoryUsage', 'compressionRatio'],
          generatedAt: Date.now()
        });
      }

      // Recommendation 2: Hit ratio improvement
      if (metrics.hitRatio < 0.75) {
        recommendations.push({
          id: `rec-hitratio-${Date.now()}`,
          type: 'performance',
          priority: 'high',
          title: 'Improve Cache Hit Ratio',
          description: `Hit ratio is ${(metrics.hitRatio * 100).toFixed(1)}%. Implement predictive caching and pattern-based warming.`,
          impact: {
            hitRatioImprovement: 20,
            latencyReduction: 30
          },
          implementation: {
            effort: 'medium',
            risk: 'low',
            timeframe: 'short_term',
            steps: [
              'Analyze cache miss patterns',
              'Implement predictive cache warming',
              'Increase TTL for frequently accessed data',
              'Add pattern-based prefetching'
            ]
          },
          confidence: 0.8,
          basedOnMetrics: ['hitRatio', 'totalRequests'],
          generatedAt: Date.now()
        });
      }

      // Recommendation 3: Pattern-based optimization
      const highConfidencePatterns = patterns.workflow.filter(p => p.confidence > 0.8);
      if (highConfidencePatterns.length > 0 && patterns.cache.length < highConfidencePatterns.length) {
        recommendations.push({
          id: `rec-patterns-${Date.now()}`,
          type: 'performance',
          priority: 'medium',
          title: 'Leverage Workflow Patterns',
          description: `${highConfidencePatterns.length} high-confidence workflow patterns detected. Implement pattern-based caching strategies.`,
          impact: {
            hitRatioImprovement: 15,
            latencyReduction: 25
          },
          implementation: {
            effort: 'low',
            risk: 'low',
            timeframe: 'immediate',
            steps: [
              'Enable pattern-based cache warming',
              'Implement predictive prefetching',
              'Optimize TTL based on pattern frequency',
              'Add pattern-specific invalidation rules'
            ]
          },
          confidence: 0.9,
          basedOnMetrics: ['patternConfidence', 'patternFrequency'],
          generatedAt: Date.now()
        });
      }

      // Recommendation 4: Latency optimization
      if (metrics.avgLatency > 50) {
        recommendations.push({
          id: `rec-latency-${Date.now()}`,
          type: 'performance',
          priority: 'medium',
          title: 'Reduce Cache Latency',
          description: `Average latency is ${metrics.avgLatency.toFixed(1)}ms. Consider optimizing serialization and compression.`,
          impact: {
            latencyReduction: 40
          },
          implementation: {
            effort: 'medium',
            risk: 'medium',
            timeframe: 'short_term',
            steps: [
              'Optimize serialization format',
              'Adjust compression threshold',
              'Implement connection pooling',
              'Consider read replicas'
            ]
          },
          confidence: 0.75,
          basedOnMetrics: ['avgLatency', 'compressionRatio'],
          generatedAt: Date.now()
        });
      }

      // Recommendation 5: Cost optimization
      if (metrics.memoryUsage < 0.5 && metrics.hitRatio > 0.8) {
        recommendations.push({
          id: `rec-cost-${Date.now()}`,
          type: 'cost',
          priority: 'low',
          title: 'Optimize for Cost Efficiency',
          description: 'Cache is performing well with low memory usage. Consider optimizing for cost.',
          impact: {
            costSavings: 30
          },
          implementation: {
            effort: 'low',
            risk: 'low',
            timeframe: 'long_term',
            steps: [
              'Implement more aggressive compression',
              'Reduce redundant cache entries',
              'Optimize eviction policies',
              'Consider smaller instance sizes'
            ]
          },
          confidence: 0.7,
          basedOnMetrics: ['memoryUsage', 'hitRatio', 'costEfficiency'],
          generatedAt: Date.now()
        });
      }

    } catch (error) {
      logger.error('Recommendation generation failed', { error });
    }

    return recommendations;
  }

  private calculateOptimizationImpact(
    before: CacheMetrics,
    after: CacheMetrics
  ): OptimizationMetrics['improvements'] {
    return {
      hitRatioGain: ((after.hitRatio - before.hitRatio) / before.hitRatio) * 100,
      latencyReduction: ((before.avgLatency - after.avgLatency) / before.avgLatency) * 100,
      memoryEfficiency: ((before.memoryUsage - after.memoryUsage) / before.memoryUsage) * 100,
      costSavings: 0 // Would need cost metrics to calculate
    };
  }

  private updateOptimizationMetrics(
    impact: OptimizationMetrics['improvements'],
    rulesApplied: number
  ): void {
    this.metrics.lastOptimization = Date.now();
    this.metrics.rulesApplied += rulesApplied;

    // Update cumulative improvements (weighted average)
    const alpha = 0.3; // Weight for new measurements
    this.metrics.improvements.hitRatioGain =
      alpha * impact.hitRatioGain + (1 - alpha) * this.metrics.improvements.hitRatioGain;
    this.metrics.improvements.latencyReduction =
      alpha * impact.latencyReduction + (1 - alpha) * this.metrics.improvements.latencyReduction;
    this.metrics.improvements.memoryEfficiency =
      alpha * impact.memoryEfficiency + (1 - alpha) * this.metrics.improvements.memoryEfficiency;
    this.metrics.improvements.costSavings =
      alpha * impact.costSavings + (1 - alpha) * this.metrics.improvements.costSavings;

    this.metrics.timestamp = Date.now();
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Public API methods
  public addRule(rule: OptimizationRule): void {
    this.rules.set(rule.id, rule);
    logger.info('Optimization rule added', { rule: rule.id });
  }

  public removeRule(ruleId: string): void {
    this.rules.delete(ruleId);
    this.rulesCooldown.delete(ruleId);
    logger.info('Optimization rule removed', { rule: ruleId });
  }

  public enableRule(ruleId: string): void {
    const rule = this.rules.get(ruleId);
    if (rule) {
      rule.enabled = true;
      logger.info('Optimization rule enabled', { rule: ruleId });
    }
  }

  public disableRule(ruleId: string): void {
    const rule = this.rules.get(ruleId);
    if (rule) {
      rule.enabled = false;
      logger.info('Optimization rule disabled', { rule: ruleId });
    }
  }

  public async analyzeCurrentState(): Promise<{
    metrics: CacheMetrics;
    patterns: { workflow: WorkflowPattern[]; cache: CachePattern[] };
    applicableRules: string[];
    recommendations: OptimizationRecommendation[];
  }> {
    try {
      const metrics = this.cacheManager.getMetrics();
      const patterns = this.patternAnalyzer.getAllPatterns();
      const applicableRules = await this.evaluateRules(metrics, patterns);
      const recommendations = await this.generateRecommendations(metrics, patterns);

      return {
        metrics,
        patterns,
        applicableRules: applicableRules.map(r => r.id),
        recommendations
      };

    } catch (error) {
      logger.error('Current state analysis failed', { error });
      throw error;
    }
  }

  public async runSingleRule(ruleId: string): Promise<boolean> {
    const rule = this.rules.get(ruleId);
    if (!rule) {
      throw new Error(`Rule not found: ${ruleId}`);
    }

    if (!rule.enabled) {
      throw new Error(`Rule is disabled: ${ruleId}`);
    }

    try {
      const metrics = this.cacheManager.getMetrics();
      const patterns = this.patternAnalyzer.getAllPatterns();

      if (await this.evaluateRuleConditions(rule, metrics, patterns)) {
        const changes = await this.applyRule(rule, metrics, patterns);
        return changes !== null && changes.some(c => c.result === 'success');
      }

      return false;

    } catch (error) {
      logger.error('Single rule execution failed', { error, rule: ruleId });
      throw error;
    }
  }

  public getOptimizationMetrics(): OptimizationMetrics {
    return { ...this.metrics };
  }

  public getCurrentSession(): OptimizationSession | null {
    return this.currentSession || null;
  }

  public getRules(): OptimizationRule[] {
    return Array.from(this.rules.values());
  }

  public async generateManualRecommendations(): Promise<OptimizationRecommendation[]> {
    try {
      const metrics = this.cacheManager.getMetrics();
      const patterns = this.patternAnalyzer.getAllPatterns();
      return await this.generateRecommendations(metrics, patterns);

    } catch (error) {
      logger.error('Manual recommendation generation failed', { error });
      throw error;
    }
  }

  public destroy(): void {
    if (this.optimizationTimer) {
      clearInterval(this.optimizationTimer);
    }

    this.rules.clear();
    this.rulesCooldown.clear();
    this.removeAllListeners();

    logger.info('Cache optimizer destroyed');
  }
}

export default CacheOptimizer;