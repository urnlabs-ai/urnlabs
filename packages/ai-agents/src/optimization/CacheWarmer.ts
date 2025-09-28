import { EventEmitter } from 'events';
import { logger } from '../core/Logger.js';
import { PatternAnalyzer, WorkflowPattern } from './PatternAnalyzer.js';
import { IntelligentCacheManager } from './IntelligentCacheManager.js';

export interface WarmupStrategy {
  id: string;
  name: string;
  description: string;
  trigger: 'schedule' | 'pattern' | 'demand' | 'system_event' | 'prediction';
  priority: 'low' | 'medium' | 'high' | 'critical';
  conditions: {
    minConfidence?: number;
    minFrequency?: number;
    timeWindow?: number;
    resourceThreshold?: number;
  };
  targets: {
    workflowIds?: string[];
    patterns?: string[];
    keyPrefixes?: string[];
    tags?: string[];
  };
  timing: {
    schedule?: string; // Cron expression
    leadTime?: number; // Milliseconds before predicted execution
    batchSize?: number;
    maxConcurrency?: number;
  };
  warmupData: {
    computeMode: 'historical' | 'synthetic' | 'hybrid';
    sampleSize?: number;
    freshness?: number; // Maximum age of data to use
  };
}

export interface WarmupTask {
  id: string;
  strategyId: string;
  workflowId?: string;
  pattern?: string;
  keys: string[];
  priority: 'low' | 'medium' | 'high' | 'critical';
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  progress: {
    total: number;
    completed: number;
    failed: number;
    skipped: number;
  };
  estimatedDuration?: number;
  actualDuration?: number;
  metadata: {
    triggeredBy: string;
    targetHitRatio?: number;
    computedValues?: number;
    cacheSize?: number;
    error?: string;
  };
}

export interface WarmupConfig {
  enabled: boolean;
  maxConcurrentTasks: number;
  maxWarmupDuration: number; // Maximum time for a single warmup task
  defaultBatchSize: number;
  retryAttempts: number;
  retryDelay: number;
  scheduleInterval: number; // How often to check for scheduled warmups
  predictiveLeadTime: number; // Default lead time for predictive warmups
  resourceLimits: {
    maxCpuUsage: number; // Percentage
    maxMemoryUsage: number; // Percentage
    maxNetworkBandwidth: number; // Mbps
  };
  strategies: WarmupStrategy[];
}

export interface ComputedWarmupValue {
  key: string;
  value: any;
  metadata: {
    source: 'historical' | 'computed' | 'predicted';
    confidence: number;
    computationTime: number;
    size: number;
    dependencies: string[];
    ttl?: number;
  };
}

export class CacheWarmer extends EventEmitter {
  private patternAnalyzer: PatternAnalyzer;
  private cacheManager: IntelligentCacheManager;
  private config: WarmupConfig;
  private activeTasks: Map<string, WarmupTask> = new Map();
  private taskQueue: WarmupTask[] = [];
  private strategies: Map<string, WarmupStrategy> = new Map();
  private scheduleTimer?: NodeJS.Timeout;
  private isProcessing = false;
  private resourceMonitor: NodeJS.Timeout | null = null;

  private readonly DEFAULT_CONFIG: WarmupConfig = {
    enabled: true,
    maxConcurrentTasks: 3,
    maxWarmupDuration: 5 * 60 * 1000, // 5 minutes
    defaultBatchSize: 50,
    retryAttempts: 3,
    retryDelay: 5000,
    scheduleInterval: 60 * 1000, // 1 minute
    predictiveLeadTime: 5 * 60 * 1000, // 5 minutes
    resourceLimits: {
      maxCpuUsage: 70,
      maxMemoryUsage: 80,
      maxNetworkBandwidth: 100
    },
    strategies: []
  };

  constructor(
    patternAnalyzer: PatternAnalyzer,
    cacheManager: IntelligentCacheManager,
    config?: Partial<WarmupConfig>
  ) {
    super();

    this.patternAnalyzer = patternAnalyzer;
    this.cacheManager = cacheManager;
    this.config = { ...this.DEFAULT_CONFIG, ...config };

    this.initializeDefaultStrategies();
    this.setupEventListeners();
    this.startScheduledProcessing();

    logger.info('Cache warmer initialized', {
      strategies: this.strategies.size,
      maxConcurrentTasks: this.config.maxConcurrentTasks
    });
  }

  private initializeDefaultStrategies(): void {
    // Strategy 1: Pattern-based predictive warming
    const predictiveStrategy: WarmupStrategy = {
      id: 'predictive-pattern',
      name: 'Predictive Pattern Warming',
      description: 'Warm cache based on predicted workflow execution patterns',
      trigger: 'prediction',
      priority: 'high',
      conditions: {
        minConfidence: 0.7,
        minFrequency: 0.1
      },
      targets: {},
      timing: {
        leadTime: this.config.predictiveLeadTime,
        batchSize: 25,
        maxConcurrency: 2
      },
      warmupData: {
        computeMode: 'hybrid',
        sampleSize: 10,
        freshness: 24 * 60 * 60 * 1000 // 24 hours
      }
    };

    // Strategy 2: Scheduled high-frequency warming
    const scheduledStrategy: WarmupStrategy = {
      id: 'scheduled-high-frequency',
      name: 'Scheduled High-Frequency Warming',
      description: 'Warm frequently accessed cache entries on schedule',
      trigger: 'schedule',
      priority: 'medium',
      conditions: {
        minFrequency: 1.0 // At least once per hour
      },
      targets: {},
      timing: {
        schedule: '0 */2 * * *', // Every 2 hours
        batchSize: 100,
        maxConcurrency: 3
      },
      warmupData: {
        computeMode: 'historical',
        sampleSize: 20
      }
    };

    // Strategy 3: System startup warming
    const startupStrategy: WarmupStrategy = {
      id: 'system-startup',
      name: 'System Startup Warming',
      description: 'Warm critical cache entries on system startup',
      trigger: 'system_event',
      priority: 'critical',
      conditions: {},
      targets: {
        tags: ['critical', 'startup']
      },
      timing: {
        batchSize: 50,
        maxConcurrency: 5
      },
      warmupData: {
        computeMode: 'historical',
        sampleSize: 5
      }
    };

    // Strategy 4: Demand-based warming
    const demandStrategy: WarmupStrategy = {
      id: 'demand-based',
      name: 'Demand-Based Warming',
      description: 'Warm cache based on recent demand patterns',
      trigger: 'demand',
      priority: 'medium',
      conditions: {
        minConfidence: 0.6,
        timeWindow: 60 * 60 * 1000 // 1 hour
      },
      targets: {},
      timing: {
        batchSize: 30,
        maxConcurrency: 2
      },
      warmupData: {
        computeMode: 'synthetic',
        sampleSize: 15
      }
    };

    [predictiveStrategy, scheduledStrategy, startupStrategy, demandStrategy].forEach(strategy => {
      this.strategies.set(strategy.id, strategy);
    });

    // Add user-defined strategies
    this.config.strategies.forEach(strategy => {
      this.strategies.set(strategy.id, strategy);
    });

    logger.info('Default warmup strategies initialized', {
      strategies: Array.from(this.strategies.keys())
    });
  }

  private setupEventListeners(): void {
    // Listen for pattern analysis results
    this.patternAnalyzer.on('patternsAnalyzed', this.onPatternsAnalyzed.bind(this));

    // Listen for cache events
    this.cacheManager.on('cache-miss', this.onCacheMiss.bind(this));
    this.cacheManager.on('pattern-invalidated', this.onPatternInvalidated.bind(this));

    logger.debug('Cache warmer event listeners set up');
  }

  private onPatternsAnalyzed(event: { workflowId: string; patterns: WorkflowPattern[] }): void {
    try {
      logger.debug('Processing patterns for warmup opportunities', {
        workflowId: event.workflowId,
        patterns: event.patterns.length
      });

      // Generate warmup tasks based on new patterns
      event.patterns.forEach(pattern => {
        this.evaluatePatternForWarmup(pattern);
      });

    } catch (error) {
      logger.error('Failed to process patterns for warmup', { error, workflowId: event.workflowId });
    }
  }

  private onCacheMiss(event: { key: string; pattern?: string }): void {
    try {
      // Trigger demand-based warming for related keys
      const demandStrategy = this.strategies.get('demand-based');
      if (demandStrategy && event.pattern) {
        this.scheduleDemandBasedWarmup(event.key, event.pattern, demandStrategy);
      }

    } catch (error) {
      logger.error('Failed to process cache miss for warmup', { error, key: event.key });
    }
  }

  private onPatternInvalidated(event: { pattern: string; invalidated: number }): void {
    try {
      // Cancel any pending warmup tasks for the invalidated pattern
      this.cancelPatternWarmupTasks(event.pattern);

      // Schedule immediate re-warming if pattern is still active
      const patterns = this.patternAnalyzer.getAllPatterns().workflow
        .filter(p => p.id === event.pattern || p.workflowId === event.pattern);

      patterns.forEach(pattern => {
        if (pattern.confidence > 0.7) {
          this.scheduleImmediateWarmup(pattern);
        }
      });

    } catch (error) {
      logger.error('Failed to process pattern invalidation for warmup', { error, pattern: event.pattern });
    }
  }

  private evaluatePatternForWarmup(pattern: WorkflowPattern): void {
    try {
      // Find applicable strategies for this pattern
      const applicableStrategies = Array.from(this.strategies.values())
        .filter(strategy => this.isStrategyApplicable(strategy, pattern));

      applicableStrategies.forEach(strategy => {
        this.schedulePatternWarmup(pattern, strategy);
      });

    } catch (error) {
      logger.error('Failed to evaluate pattern for warmup', { error, pattern: pattern.id });
    }
  }

  private isStrategyApplicable(strategy: WarmupStrategy, pattern: WorkflowPattern): boolean {
    // Check confidence threshold
    if (strategy.conditions.minConfidence && pattern.confidence < strategy.conditions.minConfidence) {
      return false;
    }

    // Check frequency threshold
    if (strategy.conditions.minFrequency && pattern.frequency < strategy.conditions.minFrequency) {
      return false;
    }

    // Check target criteria
    if (strategy.targets.workflowIds && !strategy.targets.workflowIds.includes(pattern.workflowId)) {
      return false;
    }

    if (strategy.targets.patterns && !strategy.targets.patterns.some(p => pattern.id.includes(p))) {
      return false;
    }

    return true;
  }

  private schedulePatternWarmup(pattern: WorkflowPattern, strategy: WarmupStrategy): void {
    try {
      const task = this.createWarmupTask(strategy, pattern);

      // Calculate scheduling delay based on strategy
      let delay = 0;

      if (strategy.trigger === 'prediction' && pattern.predictions.nextExecution) {
        const timeUntilExecution = pattern.predictions.nextExecution - Date.now();
        delay = Math.max(0, timeUntilExecution - (strategy.timing.leadTime || 0));
      }

      if (delay > 0) {
        setTimeout(() => {
          this.queueTask(task);
        }, delay);

        logger.debug('Scheduled pattern warmup with delay', {
          pattern: pattern.id,
          strategy: strategy.id,
          delay: delay
        });
      } else {
        this.queueTask(task);
      }

    } catch (error) {
      logger.error('Failed to schedule pattern warmup', { error, pattern: pattern.id, strategy: strategy.id });
    }
  }

  private scheduleDemandBasedWarmup(missedKey: string, pattern: string, strategy: WarmupStrategy): void {
    try {
      // Generate related keys that might be needed soon
      const relatedKeys = this.generateRelatedKeys(missedKey, pattern);

      if (relatedKeys.length > 0) {
        const task: WarmupTask = {
          id: `demand-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          strategyId: strategy.id,
          pattern: pattern,
          keys: relatedKeys,
          priority: strategy.priority,
          status: 'pending',
          createdAt: Date.now(),
          progress: {
            total: relatedKeys.length,
            completed: 0,
            failed: 0,
            skipped: 0
          },
          metadata: {
            triggeredBy: `cache-miss:${missedKey}`
          }
        };

        this.queueTask(task);

        logger.debug('Scheduled demand-based warmup', {
          missedKey,
          pattern,
          relatedKeys: relatedKeys.length
        });
      }

    } catch (error) {
      logger.error('Failed to schedule demand-based warmup', { error, missedKey, pattern });
    }
  }

  private scheduleImmediateWarmup(pattern: WorkflowPattern): void {
    try {
      const strategy = this.strategies.get('predictive-pattern');
      if (strategy) {
        const task = this.createWarmupTask(strategy, pattern);
        task.priority = 'high'; // Boost priority for immediate warmup
        this.queueTask(task);

        logger.debug('Scheduled immediate warmup after invalidation', { pattern: pattern.id });
      }

    } catch (error) {
      logger.error('Failed to schedule immediate warmup', { error, pattern: pattern.id });
    }
  }

  private createWarmupTask(strategy: WarmupStrategy, pattern?: WorkflowPattern): WarmupTask {
    const keys = pattern ? this.generateWarmupKeys(pattern) : this.generateStrategyKeys(strategy);

    return {
      id: `warmup-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      strategyId: strategy.id,
      workflowId: pattern?.workflowId,
      pattern: pattern?.id,
      keys: keys,
      priority: strategy.priority,
      status: 'pending',
      createdAt: Date.now(),
      progress: {
        total: keys.length,
        completed: 0,
        failed: 0,
        skipped: 0
      },
      estimatedDuration: this.estimateWarmupDuration(keys.length, strategy),
      metadata: {
        triggeredBy: strategy.trigger
      }
    };
  }

  private generateWarmupKeys(pattern: WorkflowPattern): string[] {
    const keys: string[] = [];
    const baseKey = `workflow:${pattern.workflowId}`;

    // Main workflow result
    keys.push(`${baseKey}:result`);
    keys.push(`${baseKey}:metadata`);

    // Cacheable steps
    pattern.pattern.cacheableSteps.forEach(step => {
      keys.push(`${baseKey}:step:${step}`);
      keys.push(`${baseKey}:step:${step}:result`);
      keys.push(`${baseKey}:step:${step}:metadata`);
    });

    // Input/output type caches
    pattern.pattern.inputTypes.forEach(inputType => {
      keys.push(`${baseKey}:input:${inputType}`);
    });

    pattern.pattern.outputTypes.forEach(outputType => {
      keys.push(`${baseKey}:output:${outputType}`);
    });

    // Dependencies
    pattern.pattern.dependencies.forEach(dep => {
      keys.push(`${baseKey}:dependency:${dep}`);
    });

    return keys;
  }

  private generateStrategyKeys(strategy: WarmupStrategy): string[] {
    const keys: string[] = [];

    // Generate keys based on strategy targets
    if (strategy.targets.keyPrefixes) {
      strategy.targets.keyPrefixes.forEach(prefix => {
        // Generate common suffixes for the prefix
        keys.push(`${prefix}:result`);
        keys.push(`${prefix}:metadata`);
        keys.push(`${prefix}:config`);
      });
    }

    if (strategy.targets.tags) {
      // This would require integration with cache manager to find keys by tags
      // For now, generate common patterns
      strategy.targets.tags.forEach(tag => {
        keys.push(`tag:${tag}:data`);
        keys.push(`tag:${tag}:metadata`);
      });
    }

    return keys;
  }

  private generateRelatedKeys(missedKey: string, pattern: string): string[] {
    const keys: string[] = [];
    const keyParts = missedKey.split(':');

    if (keyParts.length >= 2) {
      const baseKey = keyParts.slice(0, -1).join(':');

      // Generate related keys that might be accessed soon
      keys.push(`${baseKey}:metadata`);
      keys.push(`${baseKey}:config`);
      keys.push(`${baseKey}:dependencies`);

      // Add pattern-specific keys
      if (pattern) {
        keys.push(`${baseKey}:pattern:${pattern}`);
        keys.push(`${baseKey}:pattern:${pattern}:metadata`);
      }

      // Add sibling keys
      const lastPart = keyParts[keyParts.length - 1];
      if (lastPart === 'result') {
        keys.push(`${baseKey}:input`);
        keys.push(`${baseKey}:output`);
      } else if (lastPart === 'metadata') {
        keys.push(`${baseKey}:result`);
        keys.push(`${baseKey}:config`);
      }
    }

    return keys.filter(key => key !== missedKey); // Don't include the missed key itself
  }

  private estimateWarmupDuration(keyCount: number, strategy: WarmupStrategy): number {
    // Base duration per key in milliseconds
    const baseTimePerKey = 100;

    // Adjust based on compute mode
    let multiplier = 1;
    switch (strategy.warmupData.computeMode) {
      case 'historical':
        multiplier = 0.5; // Historical data is faster to retrieve
        break;
      case 'synthetic':
        multiplier = 1.5; // Synthetic data requires computation
        break;
      case 'hybrid':
        multiplier = 1.0; // Balanced approach
        break;
    }

    // Adjust for concurrency
    const concurrency = strategy.timing.maxConcurrency || 1;
    const parallelFactor = Math.max(0.3, 1 / concurrency);

    return Math.floor(keyCount * baseTimePerKey * multiplier * parallelFactor);
  }

  private queueTask(task: WarmupTask): void {
    // Insert task in priority order
    let insertIndex = this.taskQueue.length;
    for (let i = 0; i < this.taskQueue.length; i++) {
      if (this.getTaskPriorityScore(task) > this.getTaskPriorityScore(this.taskQueue[i])) {
        insertIndex = i;
        break;
      }
    }

    this.taskQueue.splice(insertIndex, 0, task);

    logger.debug('Queued warmup task', {
      taskId: task.id,
      priority: task.priority,
      keys: task.keys.length,
      queuePosition: insertIndex,
      queueSize: this.taskQueue.length
    });

    this.emit('task-queued', task);

    // Process queue if not already processing
    if (!this.isProcessing) {
      this.processTaskQueue();
    }
  }

  private getTaskPriorityScore(task: WarmupTask): number {
    const priorityScores = {
      critical: 100,
      high: 75,
      medium: 50,
      low: 25
    };

    let score = priorityScores[task.priority];

    // Boost score for time-sensitive tasks
    if (task.estimatedDuration && task.estimatedDuration < 30000) { // Less than 30 seconds
      score += 10;
    }

    // Boost score for smaller tasks
    if (task.keys.length < 20) {
      score += 5;
    }

    return score;
  }

  private async processTaskQueue(): Promise<void> {
    if (this.isProcessing || this.taskQueue.length === 0) {
      return;
    }

    this.isProcessing = true;

    try {
      logger.debug('Starting task queue processing', {
        queueSize: this.taskQueue.length,
        activeTasks: this.activeTasks.size,
        maxConcurrency: this.config.maxConcurrentTasks
      });

      while (this.taskQueue.length > 0 && this.activeTasks.size < this.config.maxConcurrentTasks) {
        // Check resource constraints
        if (!(await this.checkResourceAvailability())) {
          logger.debug('Resource constraints exceeded, pausing task processing');
          break;
        }

        const task = this.taskQueue.shift();
        if (task) {
          this.processTask(task);
        }
      }

    } catch (error) {
      logger.error('Task queue processing failed', { error });
    } finally {
      this.isProcessing = false;

      // Schedule next processing if there are still tasks
      if (this.taskQueue.length > 0) {
        setTimeout(() => {
          this.processTaskQueue();
        }, 1000);
      }
    }
  }

  private async checkResourceAvailability(): Promise<boolean> {
    try {
      // Check CPU usage (simplified - in production, use proper system monitoring)
      const cpuUsage = process.cpuUsage();
      const cpuPercent = (cpuUsage.user + cpuUsage.system) / 1000000; // Convert to percentage estimate

      if (cpuPercent > this.config.resourceLimits.maxCpuUsage) {
        return false;
      }

      // Check memory usage
      const memoryUsage = process.memoryUsage();
      const memoryPercent = (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100;

      if (memoryPercent > this.config.resourceLimits.maxMemoryUsage) {
        return false;
      }

      return true;

    } catch (error) {
      logger.error('Resource availability check failed', { error });
      return true; // Assume available if check fails
    }
  }

  private async processTask(task: WarmupTask): Promise<void> {
    const startTime = Date.now();

    try {
      logger.info('Starting warmup task', {
        taskId: task.id,
        strategy: task.strategyId,
        keys: task.keys.length,
        priority: task.priority
      });

      task.status = 'running';
      task.startedAt = startTime;
      this.activeTasks.set(task.id, task);

      this.emit('task-started', task);

      // Get strategy configuration
      const strategy = this.strategies.get(task.strategyId);
      if (!strategy) {
        throw new Error(`Strategy not found: ${task.strategyId}`);
      }

      // Process keys in batches
      const batchSize = strategy.timing.batchSize || this.config.defaultBatchSize;
      const batches = this.createBatches(task.keys, batchSize);

      for (const batch of batches) {
        if (task.status === 'cancelled') {
          break;
        }

        await this.processBatch(task, batch, strategy);

        // Brief pause between batches to avoid overwhelming the system
        await this.sleep(100);
      }

      // Complete task
      task.status = task.progress.failed > 0 ? 'failed' : 'completed';
      task.completedAt = Date.now();
      task.actualDuration = task.completedAt - startTime;

      logger.info('Warmup task completed', {
        taskId: task.id,
        status: task.status,
        duration: task.actualDuration,
        progress: task.progress
      });

      this.emit('task-completed', task);

    } catch (error) {
      task.status = 'failed';
      task.completedAt = Date.now();
      task.actualDuration = Date.now() - startTime;
      task.metadata.error = error instanceof Error ? error.message : String(error);

      logger.error('Warmup task failed', {
        error,
        taskId: task.id,
        duration: task.actualDuration
      });

      this.emit('task-failed', task);

    } finally {
      this.activeTasks.delete(task.id);

      // Continue processing queue
      if (this.taskQueue.length > 0) {
        setTimeout(() => {
          this.processTaskQueue();
        }, 500);
      }
    }
  }

  private createBatches<T>(items: T[], batchSize: number): T[][] {
    const batches: T[][] = [];
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }
    return batches;
  }

  private async processBatch(task: WarmupTask, keys: string[], strategy: WarmupStrategy): Promise<void> {
    const batchPromises = keys.map(async (key) => {
      try {
        // Check if key is already cached
        const exists = await this.cacheManager.get(key);
        if (exists !== null) {
          task.progress.skipped++;
          return;
        }

        // Compute warmup value
        const warmupValue = await this.computeWarmupValue(key, task, strategy);

        if (warmupValue) {
          // Store in cache
          const success = await this.cacheManager.set(warmupValue.key, warmupValue.value, {
            ttl: warmupValue.metadata.ttl,
            tags: ['warmup', task.strategyId],
            pattern: task.pattern,
            priority: 'medium'
          });

          if (success) {
            task.progress.completed++;
            task.metadata.computedValues = (task.metadata.computedValues || 0) + 1;
            task.metadata.cacheSize = (task.metadata.cacheSize || 0) + warmupValue.metadata.size;
          } else {
            task.progress.failed++;
          }
        } else {
          task.progress.skipped++;
        }

      } catch (error) {
        task.progress.failed++;
        logger.error('Batch item processing failed', { error, key, taskId: task.id });
      }
    });

    await Promise.all(batchPromises);
  }

  private async computeWarmupValue(key: string, task: WarmupTask, strategy: WarmupStrategy): Promise<ComputedWarmupValue | null> {
    const startTime = Date.now();

    try {
      let value: any;
      let source: 'historical' | 'computed' | 'predicted';
      let confidence = 0.5;

      switch (strategy.warmupData.computeMode) {
        case 'historical':
          value = await this.computeHistoricalValue(key, task, strategy);
          source = 'historical';
          confidence = 0.8;
          break;

        case 'synthetic':
          value = await this.computeSyntheticValue(key, task, strategy);
          source = 'computed';
          confidence = 0.6;
          break;

        case 'hybrid':
          // Try historical first, fall back to synthetic
          value = await this.computeHistoricalValue(key, task, strategy);
          if (!value) {
            value = await this.computeSyntheticValue(key, task, strategy);
            source = 'computed';
            confidence = 0.6;
          } else {
            source = 'historical';
            confidence = 0.8;
          }
          break;

        default:
          return null;
      }

      if (!value) {
        return null;
      }

      const computationTime = Date.now() - startTime;
      const serializedSize = JSON.stringify(value).length;

      return {
        key,
        value,
        metadata: {
          source,
          confidence,
          computationTime,
          size: serializedSize,
          dependencies: this.extractDependencies(key, value),
          ttl: this.calculateWarmupTTL(key, strategy)
        }
      };

    } catch (error) {
      logger.error('Warmup value computation failed', { error, key, taskId: task.id });
      return null;
    }
  }

  private async computeHistoricalValue(key: string, task: WarmupTask, strategy: WarmupStrategy): Promise<any> {
    try {
      // In a real implementation, this would:
      // 1. Query historical execution data
      // 2. Find the most recent/common value for this key
      // 3. Validate the data is still fresh enough

      if (task.workflowId) {
        const history = this.patternAnalyzer.getExecutionHistory(task.workflowId);
        const recentExecutions = history
          .filter(h => Date.now() - h.timestamp < (strategy.warmupData.freshness || 24 * 60 * 60 * 1000))
          .slice(0, strategy.warmupData.sampleSize || 10);

        if (recentExecutions.length > 0) {
          // Extract relevant data from historical executions
          if (key.includes(':result')) {
            return this.extractResultFromHistory(recentExecutions);
          } else if (key.includes(':metadata')) {
            return this.extractMetadataFromHistory(recentExecutions);
          } else if (key.includes(':step:')) {
            return this.extractStepDataFromHistory(key, recentExecutions);
          }
        }
      }

      return null; // No suitable historical data found

    } catch (error) {
      logger.error('Historical value computation failed', { error, key });
      return null;
    }
  }

  private async computeSyntheticValue(key: string, task: WarmupTask, strategy: WarmupStrategy): Promise<any> {
    try {
      // Generate synthetic but realistic data based on key type
      if (key.includes(':result')) {
        return {
          status: 'success',
          data: this.generateSyntheticResultData(task),
          timestamp: Date.now(),
          source: 'warmup_synthetic'
        };
      }

      if (key.includes(':metadata')) {
        return {
          workflowId: task.workflowId,
          pattern: task.pattern,
          estimatedDuration: 1000,
          estimatedResources: { cpu: 50, memory: 50, io: 20 },
          tags: ['synthetic', 'warmup'],
          createdAt: Date.now()
        };
      }

      if (key.includes(':step:')) {
        const stepName = this.extractStepNameFromKey(key);
        return {
          stepName,
          status: 'ready',
          estimatedDuration: 500,
          dependencies: [],
          configuration: {},
          createdAt: Date.now()
        };
      }

      // Generic synthetic data
      return {
        key,
        value: 'synthetic_warmup_data',
        confidence: 0.5,
        createdAt: Date.now(),
        source: 'synthetic'
      };

    } catch (error) {
      logger.error('Synthetic value computation failed', { error, key });
      return null;
    }
  }

  private extractResultFromHistory(executions: any[]): any {
    // Get the most common successful result pattern
    const successfulResults = executions
      .filter(e => e.status === 'success' && e.outputData)
      .map(e => e.outputData);

    if (successfulResults.length > 0) {
      // Return the most recent successful result as a template
      return {
        ...successfulResults[0],
        _warmup: true,
        _source: 'historical',
        _timestamp: Date.now()
      };
    }

    return null;
  }

  private extractMetadataFromHistory(executions: any[]): any {
    const durations = executions.map(e => e.duration);
    const avgDuration = durations.reduce((sum, d) => sum + d, 0) / durations.length;

    return {
      avgDuration,
      executionCount: executions.length,
      successRate: executions.filter(e => e.status === 'success').length / executions.length,
      lastExecution: Math.max(...executions.map(e => e.timestamp)),
      _warmup: true,
      _source: 'historical'
    };
  }

  private extractStepDataFromHistory(key: string, executions: any[]): any {
    const stepName = this.extractStepNameFromKey(key);

    // Find step data from executions
    const stepData = executions
      .flatMap(e => e.steps || [])
      .filter(s => s.name === stepName || s.type === stepName);

    if (stepData.length > 0) {
      const avgDuration = stepData.reduce((sum, s) => sum + (s.duration || 0), 0) / stepData.length;
      const successRate = stepData.filter(s => s.status === 'success').length / stepData.length;

      return {
        stepName,
        avgDuration,
        successRate,
        executionCount: stepData.length,
        _warmup: true,
        _source: 'historical'
      };
    }

    return null;
  }

  private generateSyntheticResultData(task: WarmupTask): any {
    return {
      workflowId: task.workflowId,
      success: true,
      synthetic: true,
      estimatedOutput: 'warmup_placeholder',
      confidence: 0.5
    };
  }

  private extractStepNameFromKey(key: string): string {
    const parts = key.split(':');
    const stepIndex = parts.indexOf('step');
    return stepIndex >= 0 && stepIndex + 1 < parts.length ? parts[stepIndex + 1] : 'unknown';
  }

  private extractDependencies(key: string, value: any): string[] {
    const dependencies: string[] = [];

    // Extract dependencies from key structure
    const parts = key.split(':');
    if (parts.length > 2) {
      dependencies.push(parts.slice(0, -1).join(':')); // Parent key
    }

    // Extract dependencies from value if it contains dependency information
    if (value && typeof value === 'object') {
      if (value.dependencies && Array.isArray(value.dependencies)) {
        dependencies.push(...value.dependencies);
      }
      if (value.requires && Array.isArray(value.requires)) {
        dependencies.push(...value.requires);
      }
    }

    return [...new Set(dependencies)]; // Remove duplicates
  }

  private calculateWarmupTTL(key: string, strategy: WarmupStrategy): number {
    let baseTTL = 3600; // 1 hour default

    // Adjust TTL based on key type
    if (key.includes(':result')) {
      baseTTL = 7200; // 2 hours for results
    } else if (key.includes(':metadata')) {
      baseTTL = 1800; // 30 minutes for metadata
    } else if (key.includes(':step:')) {
      baseTTL = 3600; // 1 hour for step data
    }

    // Adjust based on strategy priority
    if (strategy.priority === 'critical') {
      baseTTL *= 2;
    } else if (strategy.priority === 'low') {
      baseTTL *= 0.5;
    }

    return Math.floor(baseTTL);
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private cancelPatternWarmupTasks(pattern: string): void {
    // Cancel queued tasks
    this.taskQueue = this.taskQueue.filter(task => {
      if (task.pattern === pattern || task.workflowId === pattern) {
        task.status = 'cancelled';
        this.emit('task-cancelled', task);
        return false;
      }
      return true;
    });

    // Cancel active tasks
    for (const [taskId, task] of this.activeTasks.entries()) {
      if (task.pattern === pattern || task.workflowId === pattern) {
        task.status = 'cancelled';
        this.emit('task-cancelled', task);
      }
    }

    logger.info('Cancelled warmup tasks for pattern', {
      pattern,
      cancelledTasks: this.taskQueue.length + this.activeTasks.size
    });
  }

  private startScheduledProcessing(): void {
    this.scheduleTimer = setInterval(() => {
      this.processScheduledStrategies();
    }, this.config.scheduleInterval);

    logger.debug('Scheduled processing started', {
      interval: this.config.scheduleInterval
    });
  }

  private processScheduledStrategies(): void {
    try {
      const scheduledStrategies = Array.from(this.strategies.values())
        .filter(s => s.trigger === 'schedule' && s.timing.schedule);

      scheduledStrategies.forEach(strategy => {
        if (this.shouldExecuteScheduledStrategy(strategy)) {
          this.executeScheduledStrategy(strategy);
        }
      });

    } catch (error) {
      logger.error('Scheduled strategy processing failed', { error });
    }
  }

  private shouldExecuteScheduledStrategy(strategy: WarmupStrategy): boolean {
    // Simple cron-like check (in production, use a proper cron library)
    // For now, just check if it's time for scheduled strategies
    const now = new Date();
    const hour = now.getHours();

    // Example: Execute high-frequency strategy every 2 hours
    if (strategy.id === 'scheduled-high-frequency') {
      return hour % 2 === 0 && now.getMinutes() < 5; // First 5 minutes of even hours
    }

    return false;
  }

  private executeScheduledStrategy(strategy: WarmupStrategy): void {
    try {
      logger.info('Executing scheduled warmup strategy', { strategy: strategy.id });

      // Generate tasks for patterns that match the strategy
      const patterns = this.patternAnalyzer.getAllPatterns().workflow
        .filter(pattern => this.isStrategyApplicable(strategy, pattern));

      patterns.forEach(pattern => {
        const task = this.createWarmupTask(strategy, pattern);
        this.queueTask(task);
      });

      this.emit('scheduled-strategy-executed', { strategy: strategy.id, tasks: patterns.length });

    } catch (error) {
      logger.error('Scheduled strategy execution failed', { error, strategy: strategy.id });
    }
  }

  // Public API methods
  public addStrategy(strategy: WarmupStrategy): void {
    this.strategies.set(strategy.id, strategy);
    logger.info('Warmup strategy added', { strategy: strategy.id });
  }

  public removeStrategy(strategyId: string): void {
    this.strategies.delete(strategyId);
    this.cancelStrategyTasks(strategyId);
    logger.info('Warmup strategy removed', { strategy: strategyId });
  }

  private cancelStrategyTasks(strategyId: string): void {
    // Cancel queued tasks
    this.taskQueue = this.taskQueue.filter(task => {
      if (task.strategyId === strategyId) {
        task.status = 'cancelled';
        this.emit('task-cancelled', task);
        return false;
      }
      return true;
    });

    // Cancel active tasks
    for (const [taskId, task] of this.activeTasks.entries()) {
      if (task.strategyId === strategyId) {
        task.status = 'cancelled';
        this.emit('task-cancelled', task);
      }
    }
  }

  public async warmupWorkflow(workflowId: string, options?: {
    priority?: 'low' | 'medium' | 'high' | 'critical';
    strategy?: string;
  }): Promise<string> {
    try {
      const patterns = this.patternAnalyzer.getWorkflowPatterns(workflowId);
      const strategy = this.strategies.get(options?.strategy || 'predictive-pattern');

      if (!strategy) {
        throw new Error(`Strategy not found: ${options?.strategy || 'predictive-pattern'}`);
      }

      if (patterns.length === 0) {
        // Create a basic task for workflows without patterns
        const task: WarmupTask = {
          id: `manual-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          strategyId: strategy.id,
          workflowId,
          keys: [`workflow:${workflowId}:result`, `workflow:${workflowId}:metadata`],
          priority: options?.priority || 'medium',
          status: 'pending',
          createdAt: Date.now(),
          progress: { total: 2, completed: 0, failed: 0, skipped: 0 },
          metadata: { triggeredBy: 'manual' }
        };

        this.queueTask(task);
        return task.id;

      } else {
        // Use the most confident pattern
        const bestPattern = patterns.sort((a, b) => b.confidence - a.confidence)[0];
        const task = this.createWarmupTask(strategy, bestPattern);

        if (options?.priority) {
          task.priority = options.priority;
        }

        this.queueTask(task);
        return task.id;
      }

    } catch (error) {
      logger.error('Manual workflow warmup failed', { error, workflowId });
      throw error;
    }
  }

  public getTaskStatus(taskId: string): WarmupTask | null {
    return this.activeTasks.get(taskId) || null;
  }

  public getQueueStatus(): {
    queueSize: number;
    activeTasks: number;
    totalProcessed: number;
    strategies: number;
  } {
    const totalProcessed = this.operations
      ? this.operations.filter(op => op.type === 'warmup').length
      : 0;

    return {
      queueSize: this.taskQueue.length,
      activeTasks: this.activeTasks.size,
      totalProcessed,
      strategies: this.strategies.size
    };
  }

  public async systemStartupWarmup(): Promise<void> {
    try {
      logger.info('Starting system startup warmup');

      const startupStrategy = this.strategies.get('system-startup');
      if (startupStrategy) {
        this.executeScheduledStrategy(startupStrategy);
      }

      // Warm up critical patterns
      const patterns = this.patternAnalyzer.getAllPatterns().workflow
        .filter(p => p.confidence > 0.8)
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, 10); // Top 10 most confident patterns

      patterns.forEach(pattern => {
        const task = this.createWarmupTask(startupStrategy!, pattern);
        task.priority = 'critical';
        this.queueTask(task);
      });

      this.emit('startup-warmup-initiated', { patterns: patterns.length });

    } catch (error) {
      logger.error('System startup warmup failed', { error });
    }
  }

  public destroy(): void {
    if (this.scheduleTimer) {
      clearInterval(this.scheduleTimer);
    }

    if (this.resourceMonitor) {
      clearInterval(this.resourceMonitor);
    }

    // Cancel all active tasks
    for (const [taskId, task] of this.activeTasks.entries()) {
      task.status = 'cancelled';
      this.emit('task-cancelled', task);
    }

    this.activeTasks.clear();
    this.taskQueue = [];
    this.removeAllListeners();

    logger.info('Cache warmer destroyed');
  }
}

export default CacheWarmer;