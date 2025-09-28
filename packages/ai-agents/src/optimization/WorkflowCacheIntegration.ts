import { EventEmitter } from 'events';
import { logger } from '../core/Logger.js';
import { RedisCacheStrategy } from './RedisCacheStrategy.js';
import { PatternAnalyzer } from './PatternAnalyzer.js';

export interface WorkflowExecutionContext {
  workflowId: string;
  executionId: string;
  agentId: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  status: 'pending' | 'running' | 'success' | 'failure' | 'timeout' | 'cancelled';
  steps: Array<{
    id: string;
    name: string;
    type: string;
    startTime: number;
    endTime?: number;
    duration?: number;
    status: 'pending' | 'running' | 'success' | 'failure' | 'skipped';
    input?: any;
    output?: any;
    error?: string;
    metadata?: Record<string, any>;
  }>;
  inputData?: any;
  outputData?: any;
  resources?: {
    cpu: number;
    memory: number;
    io: number;
    network: number;
  };
  errorMessage?: string;
  metadata?: Record<string, any>;
}

export interface CacheableStep {
  stepId: string;
  stepType: string;
  cacheKey: string;
  ttl?: number;
  dependencies?: string[];
  tags?: string[];
  priority?: 'low' | 'medium' | 'high' | 'critical';
}

export interface CacheHit {
  key: string;
  stepId: string;
  value: any;
  hitTime: number;
  source: 'cache' | 'computation';
  timeSaved?: number;
}

export interface WorkflowCacheConfig {
  enabled: boolean;
  defaultTTL: number;
  cacheableStepTypes: string[];
  skipCacheForUsers?: string[];
  skipCacheForWorkflows?: string[];
  invalidationRules: {
    onDataUpdate?: string[];
    onConfigChange?: string[];
    onError?: boolean;
  };
  warmupRules: {
    onSchedule?: string[]; // cron expressions
    onDemand?: boolean;
    predictive?: boolean;
  };
  performance: {
    maxCacheableSteps: number;
    asyncWarmup: boolean;
    prefetchRelated: boolean;
  };
}

export class WorkflowCacheIntegration extends EventEmitter {
  private cacheStrategy: RedisCacheStrategy;
  private patternAnalyzer: PatternAnalyzer;
  private config: WorkflowCacheConfig;
  private activeExecutions: Map<string, WorkflowExecutionContext> = new Map();
  private cacheHits: Map<string, CacheHit[]> = new Map();
  private stepCacheMap: Map<string, CacheableStep> = new Map();

  private readonly DEFAULT_CONFIG: WorkflowCacheConfig = {
    enabled: true,
    defaultTTL: 3600, // 1 hour
    cacheableStepTypes: [
      'data_retrieval',
      'api_call',
      'database_query',
      'computation',
      'ai_inference',
      'file_processing'
    ],
    invalidationRules: {
      onDataUpdate: ['user_data', 'configuration', 'model_update'],
      onConfigChange: ['system_config', 'workflow_config'],
      onError: true
    },
    warmupRules: {
      onDemand: true,
      predictive: true
    },
    performance: {
      maxCacheableSteps: 50,
      asyncWarmup: true,
      prefetchRelated: true
    }
  };

  constructor(
    cacheStrategy: RedisCacheStrategy,
    config?: Partial<WorkflowCacheConfig>
  ) {
    super();

    this.cacheStrategy = cacheStrategy;
    this.config = { ...this.DEFAULT_CONFIG, ...config };

    this.initializeIntegration();

    logger.info('Workflow cache integration initialized', {
      enabled: this.config.enabled,
      cacheableStepTypes: this.config.cacheableStepTypes.length
    });
  }

  private initializeIntegration(): void {
    // Listen to cache strategy events
    this.cacheStrategy.on('cache-hit', this.onCacheHit.bind(this));
    this.cacheStrategy.on('cache-miss', this.onCacheMiss.bind(this));
    this.cacheStrategy.on('optimization-completed', this.onOptimizationCompleted.bind(this));

    // Set up cache invalidation patterns
    this.setupInvalidationHandlers();
  }

  private setupInvalidationHandlers(): void {
    // Listen for data updates
    if (this.config.invalidationRules.onDataUpdate) {
      this.config.invalidationRules.onDataUpdate.forEach(dataType => {
        this.on(`data-updated:${dataType}`, async () => {
          await this.invalidateByTag(dataType);
        });
      });
    }

    // Listen for configuration changes
    if (this.config.invalidationRules.onConfigChange) {
      this.config.invalidationRules.onConfigChange.forEach(configType => {
        this.on(`config-changed:${configType}`, async () => {
          await this.invalidateByTag(configType);
        });
      });
    }
  }

  private onCacheHit(event: { key: string; pattern?: string }): void {
    logger.debug('Cache hit recorded', { key: event.key, pattern: event.pattern });
    this.emit('workflow-cache-hit', event);
  }

  private onCacheMiss(event: { key: string; pattern?: string }): void {
    logger.debug('Cache miss recorded', { key: event.key, pattern: event.pattern });
    this.emit('workflow-cache-miss', event);

    // Trigger predictive warming if enabled
    if (this.config.warmupRules.predictive && event.pattern) {
      this.triggerPredictiveWarmup(event.key, event.pattern);
    }
  }

  private onOptimizationCompleted(session: any): void {
    logger.info('Cache optimization completed', {
      sessionId: session.id,
      rulesApplied: session.rulesApplied,
      recommendations: session.recommendations.length
    });

    this.emit('cache-optimized', session);
  }

  private async triggerPredictiveWarmup(missedKey: string, pattern: string): Promise<void> {
    try {
      if (this.config.performance.asyncWarmup) {
        // Async warmup - don't block current execution
        setImmediate(async () => {
          await this.warmupRelatedWorkflows(missedKey, pattern);
        });
      } else {
        await this.warmupRelatedWorkflows(missedKey, pattern);
      }
    } catch (error) {
      logger.error('Predictive warmup failed', { error, missedKey, pattern });
    }
  }

  private async warmupRelatedWorkflows(missedKey: string, pattern: string): Promise<void> {
    try {
      // Extract workflow ID from cache key
      const workflowIdMatch = missedKey.match(/workflow:([^:]+)/);
      if (workflowIdMatch) {
        const workflowId = workflowIdMatch[1];
        await this.cacheStrategy.warmupWorkflow(workflowId, {
          priority: 'medium',
          strategy: 'demand-based'
        });

        logger.debug('Related workflow warmup triggered', {
          workflowId,
          missedKey,
          pattern
        });
      }
    } catch (error) {
      logger.error('Related workflow warmup failed', { error, missedKey, pattern });
    }
  }

  // Workflow execution hooks
  public async onWorkflowStart(context: WorkflowExecutionContext): Promise<void> {
    try {
      if (!this.config.enabled) return;

      logger.info('Workflow execution started', {
        workflowId: context.workflowId,
        executionId: context.executionId,
        agentId: context.agentId
      });

      // Store execution context
      this.activeExecutions.set(context.executionId, context);

      // Initialize cache hits tracking
      this.cacheHits.set(context.executionId, []);

      // Analyze workflow for caching opportunities
      await this.analyzeWorkflowForCaching(context);

      // Pre-warm cache if patterns suggest high probability of execution
      if (this.config.warmupRules.predictive) {
        await this.preWarmWorkflowCache(context);
      }

      this.emit('workflow-started', context);

    } catch (error) {
      logger.error('Workflow start hook failed', { error, executionId: context.executionId });
    }
  }

  public async onStepStart(
    executionId: string,
    stepId: string,
    stepType: string,
    input: any
  ): Promise<any> {
    try {
      if (!this.config.enabled || !this.isCacheableStep(stepType)) {
        return null; // No caching for this step
      }

      const context = this.activeExecutions.get(executionId);
      if (!context) {
        logger.warn('Step started for unknown execution', { executionId, stepId });
        return null;
      }

      // Generate cache key for this step
      const cacheKey = this.generateStepCacheKey(context.workflowId, stepId, stepType, input);

      // Try to get cached result
      const cachedResult = await this.cacheStrategy.get(cacheKey, {
        pattern: context.workflowId,
        tags: [stepType, context.workflowId]
      });

      if (cachedResult) {
        // Cache hit - record and return cached result
        const hit: CacheHit = {
          key: cacheKey,
          stepId,
          value: cachedResult,
          hitTime: Date.now(),
          source: 'cache'
        };

        const executionHits = this.cacheHits.get(executionId) || [];
        executionHits.push(hit);
        this.cacheHits.set(executionId, executionHits);

        logger.debug('Step cache hit', {
          executionId,
          stepId,
          stepType,
          cacheKey
        });

        this.emit('step-cache-hit', {
          executionId,
          stepId,
          stepType,
          cacheKey,
          result: cachedResult
        });

        return cachedResult;
      }

      // Cache miss - prepare for caching the result
      const cacheableStep: CacheableStep = {
        stepId,
        stepType,
        cacheKey,
        ttl: this.calculateStepTTL(stepType, context),
        dependencies: this.extractStepDependencies(input),
        tags: [stepType, context.workflowId, context.agentId],
        priority: this.calculateStepPriority(stepType, context)
      };

      this.stepCacheMap.set(`${executionId}:${stepId}`, cacheableStep);

      logger.debug('Step cache miss - prepared for caching', {
        executionId,
        stepId,
        stepType,
        cacheKey
      });

      return null; // No cached result available

    } catch (error) {
      logger.error('Step start hook failed', { error, executionId, stepId, stepType });
      return null;
    }
  }

  public async onStepComplete(
    executionId: string,
    stepId: string,
    stepType: string,
    result: any,
    duration: number,
    status: 'success' | 'failure'
  ): Promise<void> {
    try {
      if (!this.config.enabled || status !== 'success') {
        return; // Only cache successful results
      }

      const cacheableStepKey = `${executionId}:${stepId}`;
      const cacheableStep = this.stepCacheMap.get(cacheableStepKey);

      if (!cacheableStep) {
        return; // Step was not prepared for caching
      }

      // Cache the step result
      await this.cacheStrategy.set(cacheableStep.cacheKey, result, {
        ttl: cacheableStep.ttl,
        tags: cacheableStep.tags,
        dependencies: cacheableStep.dependencies,
        pattern: executionId,
        priority: cacheableStep.priority
      });

      // Calculate time that could have been saved
      const potentialTimeSaved = duration;

      // Record the cache set
      const hit: CacheHit = {
        key: cacheableStep.cacheKey,
        stepId,
        value: result,
        hitTime: Date.now(),
        source: 'computation',
        timeSaved: potentialTimeSaved
      };

      const executionHits = this.cacheHits.get(executionId) || [];
      executionHits.push(hit);
      this.cacheHits.set(executionId, executionHits);

      // Clean up
      this.stepCacheMap.delete(cacheableStepKey);

      logger.debug('Step result cached', {
        executionId,
        stepId,
        stepType,
        cacheKey: cacheableStep.cacheKey,
        duration,
        ttl: cacheableStep.ttl
      });

      this.emit('step-cached', {
        executionId,
        stepId,
        stepType,
        cacheKey: cacheableStep.cacheKey,
        result,
        duration
      });

    } catch (error) {
      logger.error('Step complete hook failed', { error, executionId, stepId, stepType });
    }
  }

  public async onWorkflowComplete(
    executionId: string,
    status: 'success' | 'failure' | 'timeout' | 'cancelled',
    duration: number
  ): Promise<void> {
    try {
      const context = this.activeExecutions.get(executionId);
      if (!context) {
        logger.warn('Workflow completed for unknown execution', { executionId });
        return;
      }

      // Update context
      context.endTime = Date.now();
      context.duration = duration;
      context.status = status;

      // Calculate cache performance for this execution
      const hits = this.cacheHits.get(executionId) || [];
      const cacheHitsCount = hits.filter(h => h.source === 'cache').length;
      const totalCacheableSteps = hits.length;
      const hitRatio = totalCacheableSteps > 0 ? cacheHitsCount / totalCacheableSteps : 0;
      const timeSaved = hits
        .filter(h => h.source === 'cache' && h.timeSaved)
        .reduce((sum, h) => sum + (h.timeSaved || 0), 0);

      logger.info('Workflow execution completed', {
        workflowId: context.workflowId,
        executionId,
        status,
        duration,
        cacheMetrics: {
          hitRatio,
          cacheHits: cacheHitsCount,
          totalCacheableSteps,
          timeSaved
        }
      });

      // Record execution for pattern analysis
      if (this.patternAnalyzer) {
        await this.patternAnalyzer.recordExecution({
          workflowId: context.workflowId,
          executionId: context.executionId,
          startTime: context.startTime,
          endTime: context.endTime || Date.now(),
          duration: context.duration || duration,
          inputData: context.inputData,
          outputData: context.outputData,
          steps: context.steps,
          resources: context.resources || { cpu: 0, memory: 0, io: 0 },
          status: status as 'success' | 'failure' | 'timeout',
          metadata: {
            ...context.metadata,
            cacheMetrics: {
              hitRatio,
              cacheHits: cacheHitsCount,
              totalCacheableSteps,
              timeSaved
            }
          }
        });
      }

      // Handle errors - invalidate related cache if needed
      if (status === 'failure' && this.config.invalidationRules.onError) {
        await this.invalidateWorkflowCache(context.workflowId);
      }

      // Clean up
      this.activeExecutions.delete(executionId);
      this.cacheHits.delete(executionId);

      this.emit('workflow-completed', {
        context,
        cacheMetrics: {
          hitRatio,
          cacheHits: cacheHitsCount,
          totalCacheableSteps,
          timeSaved
        }
      });

    } catch (error) {
      logger.error('Workflow complete hook failed', { error, executionId });
    }
  }

  // Helper methods
  private async analyzeWorkflowForCaching(context: WorkflowExecutionContext): Promise<void> {
    try {
      // Count cacheable steps
      const cacheableSteps = context.steps?.filter(step =>
        this.isCacheableStep(step.type)
      ) || [];

      if (cacheableSteps.length > this.config.performance.maxCacheableSteps) {
        logger.warn('Workflow has too many cacheable steps, performance may be impacted', {
          workflowId: context.workflowId,
          cacheableSteps: cacheableSteps.length,
          maxAllowed: this.config.performance.maxCacheableSteps
        });
      }

      logger.debug('Workflow analyzed for caching', {
        workflowId: context.workflowId,
        totalSteps: context.steps?.length || 0,
        cacheableSteps: cacheableSteps.length
      });

    } catch (error) {
      logger.error('Workflow analysis for caching failed', { error, workflowId: context.workflowId });
    }
  }

  private async preWarmWorkflowCache(context: WorkflowExecutionContext): Promise<void> {
    try {
      // Check if this workflow has patterns that suggest warming
      if (this.patternAnalyzer) {
        const patterns = this.patternAnalyzer.getWorkflowPatterns(context.workflowId);
        const highConfidencePatterns = patterns.filter(p => p.confidence > 0.7);

        if (highConfidencePatterns.length > 0) {
          await this.cacheStrategy.warmupWorkflow(context.workflowId, {
            priority: 'medium',
            strategy: 'predictive-pattern'
          });

          logger.debug('Pre-warmed workflow cache based on patterns', {
            workflowId: context.workflowId,
            patterns: highConfidencePatterns.length
          });
        }
      }

    } catch (error) {
      logger.error('Pre-warm workflow cache failed', { error, workflowId: context.workflowId });
    }
  }

  private isCacheableStep(stepType: string): boolean {
    return this.config.cacheableStepTypes.includes(stepType);
  }

  private generateStepCacheKey(
    workflowId: string,
    stepId: string,
    stepType: string,
    input: any
  ): string {
    // Create a deterministic cache key based on step and input
    const inputHash = this.hashInput(input);
    return `workflow:${workflowId}:step:${stepType}:${stepId}:${inputHash}`;
  }

  private hashInput(input: any): string {
    try {
      // Simple hash for input data (in production, use a proper hash function)
      const inputStr = JSON.stringify(input);
      let hash = 0;
      for (let i = 0; i < inputStr.length; i++) {
        const char = inputStr.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32-bit integer
      }
      return Math.abs(hash).toString(36);
    } catch (error) {
      return 'unknown';
    }
  }

  private calculateStepTTL(stepType: string, context: WorkflowExecutionContext): number {
    // Adjust TTL based on step type and context
    let ttl = this.config.defaultTTL;

    switch (stepType) {
      case 'database_query':
        ttl = 1800; // 30 minutes
        break;
      case 'api_call':
        ttl = 900; // 15 minutes
        break;
      case 'ai_inference':
        ttl = 7200; // 2 hours
        break;
      case 'file_processing':
        ttl = 3600; // 1 hour
        break;
      case 'computation':
        ttl = 14400; // 4 hours
        break;
      default:
        ttl = this.config.defaultTTL;
    }

    return ttl;
  }

  private extractStepDependencies(input: any): string[] {
    const dependencies: string[] = [];

    try {
      if (input && typeof input === 'object') {
        // Extract common dependency patterns
        if (input.userId) dependencies.push(`user:${input.userId}`);
        if (input.datasetId) dependencies.push(`dataset:${input.datasetId}`);
        if (input.modelId) dependencies.push(`model:${input.modelId}`);
        if (input.configId) dependencies.push(`config:${input.configId}`);
      }
    } catch (error) {
      logger.debug('Failed to extract step dependencies', { error });
    }

    return dependencies;
  }

  private calculateStepPriority(
    stepType: string,
    context: WorkflowExecutionContext
  ): 'low' | 'medium' | 'high' | 'critical' {
    // Higher priority for expensive operations
    switch (stepType) {
      case 'ai_inference':
      case 'computation':
        return 'high';
      case 'database_query':
      case 'api_call':
        return 'medium';
      default:
        return 'low';
    }
  }

  private async invalidateByTag(tag: string): Promise<void> {
    try {
      const invalidated = await this.cacheStrategy.invalidateTags([tag]);
      logger.info('Cache invalidated by tag', { tag, invalidated });
    } catch (error) {
      logger.error('Cache invalidation by tag failed', { error, tag });
    }
  }

  private async invalidateWorkflowCache(workflowId: string): Promise<void> {
    try {
      const invalidated = await this.cacheStrategy.invalidatePattern(`workflow:${workflowId}:*`);
      logger.info('Workflow cache invalidated', { workflowId, invalidated });
    } catch (error) {
      logger.error('Workflow cache invalidation failed', { error, workflowId });
    }
  }

  // Public API methods
  public async getWorkflowCacheStats(workflowId: string): Promise<any> {
    try {
      const analytics = await this.cacheStrategy.getAnalytics();
      const patterns = this.patternAnalyzer?.getWorkflowPatterns(workflowId) || [];

      return {
        workflowId,
        patterns: patterns.length,
        analytics: analytics?.patterns?.workflowPatterns || 0,
        cacheEfficiency: analytics?.overview || {},
        timestamp: Date.now()
      };

    } catch (error) {
      logger.error('Failed to get workflow cache stats', { error, workflowId });
      throw error;
    }
  }

  public async optimizeWorkflowCache(workflowId?: string): Promise<any> {
    try {
      if (workflowId) {
        // Optimize specific workflow
        await this.cacheStrategy.warmupWorkflow(workflowId, { priority: 'high' });
        return { workflowId, action: 'warmup_triggered' };
      } else {
        // Run global optimization
        return await this.cacheStrategy.runOptimization();
      }

    } catch (error) {
      logger.error('Workflow cache optimization failed', { error, workflowId });
      throw error;
    }
  }

  public getConfig(): WorkflowCacheConfig {
    return { ...this.config };
  }

  public updateConfig(updates: Partial<WorkflowCacheConfig>): void {
    this.config = { ...this.config, ...updates };
    logger.info('Workflow cache config updated', { updates });
  }

  public async destroy(): Promise<void> {
    try {
      this.activeExecutions.clear();
      this.cacheHits.clear();
      this.stepCacheMap.clear();
      this.removeAllListeners();

      logger.info('Workflow cache integration destroyed');

    } catch (error) {
      logger.error('Failed to destroy workflow cache integration', { error });
      throw error;
    }
  }
}

export default WorkflowCacheIntegration;