import { EventEmitter } from 'events';
import { logger } from '../core/Logger.js';

export interface WorkflowPattern {
  id: string;
  workflowId: string;
  frequency: number;
  confidence: number;
  pattern: {
    inputTypes: string[];
    outputTypes: string[];
    executionTime: number;
    resourceUsage: {
      cpu: number;
      memory: number;
      io: number;
    };
    dependencies: string[];
    cacheableSteps: string[];
    seasonality?: {
      hourly: number[];
      daily: number[];
      weekly: number[];
    };
  };
  usage: {
    totalExecutions: number;
    recentExecutions: number;
    lastExecuted: number;
    avgExecutionTime: number;
    cacheHitRate?: number;
  };
  predictions: {
    nextExecution?: number;
    expectedLoad: number;
    resourceRequirements: {
      cpu: number;
      memory: number;
      io: number;
    };
  };
  metadata: Record<string, any>;
}

export interface CachePattern {
  id: string;
  key: string;
  type: 'workflow_result' | 'agent_response' | 'database_query' | 'api_response' | 'computation_result';
  accessPattern: {
    frequency: number;
    recency: number;
    size: number;
    ttl: number;
    hotness: number;
  };
  dependencies: string[];
  invalidationTriggers: string[];
  warmupTriggers: string[];
  costBenefit: {
    storageSize: number;
    computationCost: number;
    accessSpeedup: number;
    hitRatio: number;
  };
}

export interface PatternAnalysisConfig {
  minSampleSize: number;
  confidenceThreshold: number;
  patternDetectionWindow: number;
  seasonalityAnalysis: boolean;
  maxPatternsPerWorkflow: number;
  analysisInterval: number;
}

export class PatternAnalyzer extends EventEmitter {
  private patterns: Map<string, WorkflowPattern> = new Map();
  private cachePatterns: Map<string, CachePattern> = new Map();
  private executionHistory: Map<string, any[]> = new Map();
  private config: PatternAnalysisConfig;
  private analysisTimer?: NodeJS.Timeout;
  private isAnalyzing = false;

  private readonly DEFAULT_CONFIG: PatternAnalysisConfig = {
    minSampleSize: 10,
    confidenceThreshold: 0.7,
    patternDetectionWindow: 7 * 24 * 60 * 60 * 1000, // 7 days
    seasonalityAnalysis: true,
    maxPatternsPerWorkflow: 5,
    analysisInterval: 60 * 60 * 1000 // 1 hour
  };

  constructor(config?: Partial<PatternAnalysisConfig>) {
    super();
    this.config = { ...this.DEFAULT_CONFIG, ...config };
    this.startPeriodicAnalysis();
  }

  public async recordExecution(execution: {
    workflowId: string;
    executionId: string;
    startTime: number;
    endTime: number;
    duration: number;
    inputData: any;
    outputData: any;
    steps: any[];
    resources: {
      cpu: number;
      memory: number;
      io: number;
    };
    status: 'success' | 'failure' | 'timeout';
    metadata?: Record<string, any>;
  }): Promise<void> {
    try {
      // Store execution in history
      if (!this.executionHistory.has(execution.workflowId)) {
        this.executionHistory.set(execution.workflowId, []);
      }

      const history = this.executionHistory.get(execution.workflowId)!;
      history.push({
        ...execution,
        timestamp: Date.now()
      });

      // Keep only recent history within the detection window
      const cutoffTime = Date.now() - this.config.patternDetectionWindow;
      const filteredHistory = history.filter(h => h.timestamp > cutoffTime);
      this.executionHistory.set(execution.workflowId, filteredHistory);

      // Trigger pattern analysis if we have enough samples
      if (filteredHistory.length >= this.config.minSampleSize) {
        await this.analyzePatterns(execution.workflowId);
      }

      this.emit('executionRecorded', { workflowId: execution.workflowId, execution });
    } catch (error) {
      logger.error('Failed to record execution for pattern analysis', {
        error,
        workflowId: execution.workflowId,
        executionId: execution.executionId
      });
    }
  }

  public async analyzePatterns(workflowId: string): Promise<void> {
    if (this.isAnalyzing) {
      logger.debug('Pattern analysis already in progress, skipping', { workflowId });
      return;
    }

    this.isAnalyzing = true;

    try {
      const history = this.executionHistory.get(workflowId);
      if (!history || history.length < this.config.minSampleSize) {
        return;
      }

      logger.info('Starting pattern analysis', {
        workflowId,
        historySize: history.length
      });

      // Analyze temporal patterns
      const temporalPatterns = await this.analyzeTemporalPatterns(workflowId, history);

      // Analyze resource usage patterns
      const resourcePatterns = await this.analyzeResourcePatterns(workflowId, history);

      // Analyze input/output patterns
      const ioPatterns = await this.analyzeIOPatterns(workflowId, history);

      // Analyze cacheable patterns
      const cacheablePatterns = await this.analyzeCacheablePatterns(workflowId, history);

      // Merge and evaluate patterns
      const patterns = this.mergePatterns(workflowId, {
        temporal: temporalPatterns,
        resource: resourcePatterns,
        io: ioPatterns,
        cacheable: cacheablePatterns
      });

      // Store significant patterns
      for (const pattern of patterns) {
        if (pattern.confidence >= this.config.confidenceThreshold) {
          this.patterns.set(pattern.id, pattern);

          // Generate cache patterns from workflow patterns
          const cachePattern = this.generateCachePattern(pattern);
          if (cachePattern) {
            this.cachePatterns.set(cachePattern.id, cachePattern);
          }
        }
      }

      logger.info('Pattern analysis completed', {
        workflowId,
        patternsFound: patterns.length,
        significantPatterns: patterns.filter(p => p.confidence >= this.config.confidenceThreshold).length
      });

      this.emit('patternsAnalyzed', {
        workflowId,
        patterns: patterns.filter(p => p.confidence >= this.config.confidenceThreshold)
      });

    } catch (error) {
      logger.error('Pattern analysis failed', { error, workflowId });
    } finally {
      this.isAnalyzing = false;
    }
  }

  private async analyzeTemporalPatterns(workflowId: string, history: any[]): Promise<any[]> {
    const patterns: any[] = [];

    try {
      // Analyze execution frequency patterns
      const executions = history.sort((a, b) => a.startTime - b.startTime);
      const intervals = [];

      for (let i = 1; i < executions.length; i++) {
        intervals.push(executions[i].startTime - executions[i - 1].startTime);
      }

      if (intervals.length > 5) {
        const avgInterval = intervals.reduce((sum, int) => sum + int, 0) / intervals.length;
        const stdDev = Math.sqrt(
          intervals.reduce((sum, int) => sum + Math.pow(int - avgInterval, 2), 0) / intervals.length
        );

        // Check for regular patterns (low standard deviation)
        if (stdDev < avgInterval * 0.3) {
          patterns.push({
            type: 'temporal_frequency',
            frequency: 1000 / avgInterval, // executions per second
            interval: avgInterval,
            confidence: Math.min(0.95, 0.5 + (0.5 * (avgInterval * 0.3 - stdDev) / (avgInterval * 0.3))),
            metadata: { avgInterval, stdDev, sampleSize: intervals.length }
          });
        }
      }

      // Analyze hourly patterns if seasonality analysis is enabled
      if (this.config.seasonalityAnalysis) {
        const hourlyDistribution = new Array(24).fill(0);
        const dailyDistribution = new Array(7).fill(0);

        executions.forEach(exec => {
          const date = new Date(exec.startTime);
          hourlyDistribution[date.getHours()]++;
          dailyDistribution[date.getDay()]++;
        });

        // Check for significant hourly patterns
        const maxHourly = Math.max(...hourlyDistribution);
        const avgHourly = hourlyDistribution.reduce((sum, count) => sum + count, 0) / 24;

        if (maxHourly > avgHourly * 2) {
          const peakHours = hourlyDistribution
            .map((count, hour) => ({ hour, count }))
            .filter(item => item.count > avgHourly * 1.5)
            .map(item => item.hour);

          patterns.push({
            type: 'temporal_seasonality_hourly',
            peakHours,
            distribution: hourlyDistribution,
            confidence: Math.min(0.9, maxHourly / (avgHourly * 3)),
            metadata: { maxHourly, avgHourly }
          });
        }

        // Check for significant daily patterns
        const maxDaily = Math.max(...dailyDistribution);
        const avgDaily = dailyDistribution.reduce((sum, count) => sum + count, 0) / 7;

        if (maxDaily > avgDaily * 1.5) {
          const peakDays = dailyDistribution
            .map((count, day) => ({ day, count }))
            .filter(item => item.count > avgDaily * 1.2)
            .map(item => item.day);

          patterns.push({
            type: 'temporal_seasonality_daily',
            peakDays,
            distribution: dailyDistribution,
            confidence: Math.min(0.8, maxDaily / (avgDaily * 2)),
            metadata: { maxDaily, avgDaily }
          });
        }
      }

    } catch (error) {
      logger.error('Temporal pattern analysis failed', { error, workflowId });
    }

    return patterns;
  }

  private async analyzeResourcePatterns(workflowId: string, history: any[]): Promise<any[]> {
    const patterns: any[] = [];

    try {
      const cpuUsages = history.map(h => h.resources?.cpu || 0);
      const memoryUsages = history.map(h => h.resources?.memory || 0);
      const ioUsages = history.map(h => h.resources?.io || 0);

      const avgCpu = cpuUsages.reduce((sum, cpu) => sum + cpu, 0) / cpuUsages.length;
      const avgMemory = memoryUsages.reduce((sum, mem) => sum + mem, 0) / memoryUsages.length;
      const avgIo = ioUsages.reduce((sum, io) => sum + io, 0) / ioUsages.length;

      // Classify resource usage patterns
      let resourceProfile = 'balanced';
      let confidence = 0.6;

      if (avgCpu > 80) {
        resourceProfile = 'cpu_intensive';
        confidence = Math.min(0.9, avgCpu / 100);
      } else if (avgMemory > 80) {
        resourceProfile = 'memory_intensive';
        confidence = Math.min(0.9, avgMemory / 100);
      } else if (avgIo > 80) {
        resourceProfile = 'io_intensive';
        confidence = Math.min(0.9, avgIo / 100);
      }

      patterns.push({
        type: 'resource_usage',
        profile: resourceProfile,
        avgCpu,
        avgMemory,
        avgIo,
        confidence,
        metadata: { sampleSize: history.length }
      });

      // Analyze resource consistency
      const cpuStdDev = Math.sqrt(
        cpuUsages.reduce((sum, cpu) => sum + Math.pow(cpu - avgCpu, 2), 0) / cpuUsages.length
      );

      if (cpuStdDev < avgCpu * 0.2) {
        patterns.push({
          type: 'resource_consistency',
          resource: 'cpu',
          consistency: 'high',
          avgUsage: avgCpu,
          stdDev: cpuStdDev,
          confidence: Math.min(0.85, (avgCpu * 0.2 - cpuStdDev) / (avgCpu * 0.2)),
          metadata: { predictable: true }
        });
      }

    } catch (error) {
      logger.error('Resource pattern analysis failed', { error, workflowId });
    }

    return patterns;
  }

  private async analyzeIOPatterns(workflowId: string, history: any[]): Promise<any[]> {
    const patterns: any[] = [];

    try {
      // Analyze input data patterns
      const inputSizes = history.map(h => this.calculateDataSize(h.inputData));
      const outputSizes = history.map(h => this.calculateDataSize(h.outputData));

      const avgInputSize = inputSizes.reduce((sum, size) => sum + size, 0) / inputSizes.length;
      const avgOutputSize = outputSizes.reduce((sum, size) => sum + size, 0) / outputSizes.length;

      // Detect consistent input/output sizes
      const inputStdDev = Math.sqrt(
        inputSizes.reduce((sum, size) => sum + Math.pow(size - avgInputSize, 2), 0) / inputSizes.length
      );

      if (inputStdDev < avgInputSize * 0.3) {
        patterns.push({
          type: 'io_consistency',
          direction: 'input',
          avgSize: avgInputSize,
          stdDev: inputStdDev,
          confidence: Math.min(0.8, (avgInputSize * 0.3 - inputStdDev) / (avgInputSize * 0.3)),
          metadata: { predictable: true, sampleSize: inputSizes.length }
        });
      }

      // Analyze input/output ratio patterns
      const ioRatios = history.map((h, i) => {
        const inputSize = inputSizes[i];
        const outputSize = outputSizes[i];
        return inputSize > 0 ? outputSize / inputSize : 0;
      });

      const avgIoRatio = ioRatios.reduce((sum, ratio) => sum + ratio, 0) / ioRatios.length;
      const ioRatioStdDev = Math.sqrt(
        ioRatios.reduce((sum, ratio) => sum + Math.pow(ratio - avgIoRatio, 2), 0) / ioRatios.length
      );

      if (ioRatioStdDev < avgIoRatio * 0.4) {
        patterns.push({
          type: 'io_transformation',
          avgRatio: avgIoRatio,
          stdDev: ioRatioStdDev,
          transformationType: avgIoRatio > 1 ? 'expansion' : 'compression',
          confidence: Math.min(0.8, (avgIoRatio * 0.4 - ioRatioStdDev) / (avgIoRatio * 0.4)),
          metadata: { avgInputSize, avgOutputSize }
        });
      }

    } catch (error) {
      logger.error('I/O pattern analysis failed', { error, workflowId });
    }

    return patterns;
  }

  private async analyzeCacheablePatterns(workflowId: string, history: any[]): Promise<any[]> {
    const patterns: any[] = [];

    try {
      // Analyze step patterns for caching opportunities
      const stepAnalysis = new Map<string, {
        count: number;
        avgDuration: number;
        inputVariability: number;
        outputConsistency: number;
      }>();

      history.forEach(execution => {
        if (execution.steps && Array.isArray(execution.steps)) {
          execution.steps.forEach(step => {
            const stepKey = step.type || step.name || 'unknown';

            if (!stepAnalysis.has(stepKey)) {
              stepAnalysis.set(stepKey, {
                count: 0,
                avgDuration: 0,
                inputVariability: 0,
                outputConsistency: 0
              });
            }

            const analysis = stepAnalysis.get(stepKey)!;
            analysis.count++;
            analysis.avgDuration = (analysis.avgDuration * (analysis.count - 1) + step.duration) / analysis.count;
          });
        }
      });

      // Identify high-value caching candidates
      for (const [stepType, analysis] of stepAnalysis.entries()) {
        if (analysis.count >= 5 && analysis.avgDuration > 1000) { // More than 1 second
          const cacheValue = this.calculateCacheValue(analysis);

          if (cacheValue > 0.5) {
            patterns.push({
              type: 'cacheable_step',
              stepType,
              frequency: analysis.count,
              avgDuration: analysis.avgDuration,
              cacheValue,
              confidence: Math.min(0.9, cacheValue),
              metadata: {
                totalTimeSavings: analysis.avgDuration * analysis.count,
                recommendedTTL: this.calculateOptimalTTL(analysis)
              }
            });
          }
        }
      }

      // Analyze duplicate input patterns
      const inputHashes = history.map(h => this.hashData(h.inputData));
      const duplicateInputs = this.findDuplicates(inputHashes);

      if (duplicateInputs.size > 0) {
        patterns.push({
          type: 'duplicate_inputs',
          duplicateCount: Array.from(duplicateInputs.values()).reduce((sum, count) => sum + count, 0),
          uniqueInputs: inputHashes.length - duplicateInputs.size,
          duplicateRatio: duplicateInputs.size / inputHashes.length,
          confidence: Math.min(0.85, duplicateInputs.size / inputHashes.length),
          metadata: { potentialCacheHits: duplicateInputs }
        });
      }

    } catch (error) {
      logger.error('Cacheable pattern analysis failed', { error, workflowId });
    }

    return patterns;
  }

  private mergePatterns(workflowId: string, analysisResults: {
    temporal: any[];
    resource: any[];
    io: any[];
    cacheable: any[];
  }): WorkflowPattern[] {
    const mergedPatterns: WorkflowPattern[] = [];

    try {
      // Combine all analysis results into cohesive workflow patterns
      const allPatterns = [
        ...analysisResults.temporal,
        ...analysisResults.resource,
        ...analysisResults.io,
        ...analysisResults.cacheable
      ];

      // Group patterns by relevance and create workflow patterns
      const temporalData = analysisResults.temporal.find(p => p.type === 'temporal_frequency');
      const resourceData = analysisResults.resource.find(p => p.type === 'resource_usage');
      const cacheableData = analysisResults.cacheable.filter(p => p.type === 'cacheable_step');

      const history = this.executionHistory.get(workflowId) || [];
      const recentExecutions = history.filter(h => h.timestamp > Date.now() - (24 * 60 * 60 * 1000));

      // Create main workflow pattern
      const pattern: WorkflowPattern = {
        id: `pattern_${workflowId}_${Date.now()}`,
        workflowId,
        frequency: temporalData?.frequency || (recentExecutions.length / 24),
        confidence: this.calculateOverallConfidence(allPatterns),
        pattern: {
          inputTypes: this.extractInputTypes(history),
          outputTypes: this.extractOutputTypes(history),
          executionTime: history.reduce((sum, h) => sum + h.duration, 0) / history.length,
          resourceUsage: {
            cpu: resourceData?.avgCpu || 0,
            memory: resourceData?.avgMemory || 0,
            io: resourceData?.avgIo || 0
          },
          dependencies: this.extractDependencies(history),
          cacheableSteps: cacheableData.map(c => c.stepType),
          seasonality: this.extractSeasonality(analysisResults.temporal)
        },
        usage: {
          totalExecutions: history.length,
          recentExecutions: recentExecutions.length,
          lastExecuted: Math.max(...history.map(h => h.startTime)),
          avgExecutionTime: history.reduce((sum, h) => sum + h.duration, 0) / history.length
        },
        predictions: {
          nextExecution: this.predictNextExecution(temporalData),
          expectedLoad: this.calculateExpectedLoad(temporalData, resourceData),
          resourceRequirements: {
            cpu: resourceData?.avgCpu || 50,
            memory: resourceData?.avgMemory || 50,
            io: resourceData?.avgIo || 50
          }
        },
        metadata: {
          analysisTimestamp: Date.now(),
          patterns: allPatterns,
          sampleSize: history.length
        }
      };

      mergedPatterns.push(pattern);

    } catch (error) {
      logger.error('Pattern merging failed', { error, workflowId });
    }

    return mergedPatterns;
  }

  private generateCachePattern(workflowPattern: WorkflowPattern): CachePattern | null {
    try {
      if (workflowPattern.pattern.cacheableSteps.length === 0) {
        return null;
      }

      const cachePattern: CachePattern = {
        id: `cache_${workflowPattern.workflowId}_${Date.now()}`,
        key: `workflow:${workflowPattern.workflowId}`,
        type: 'workflow_result',
        accessPattern: {
          frequency: workflowPattern.frequency,
          recency: Date.now() - workflowPattern.usage.lastExecuted,
          size: this.estimateCacheSize(workflowPattern),
          ttl: this.calculateOptimalTTL({
            count: workflowPattern.usage.totalExecutions,
            avgDuration: workflowPattern.usage.avgExecutionTime
          }),
          hotness: this.calculateHotness(workflowPattern)
        },
        dependencies: workflowPattern.pattern.dependencies,
        invalidationTriggers: this.generateInvalidationTriggers(workflowPattern),
        warmupTriggers: this.generateWarmupTriggers(workflowPattern),
        costBenefit: {
          storageSize: this.estimateCacheSize(workflowPattern),
          computationCost: workflowPattern.usage.avgExecutionTime,
          accessSpeedup: this.calculateAccessSpeedup(workflowPattern),
          hitRatio: this.estimateHitRatio(workflowPattern)
        }
      };

      return cachePattern;
    } catch (error) {
      logger.error('Cache pattern generation failed', { error, workflowId: workflowPattern.workflowId });
      return null;
    }
  }

  // Utility methods
  private calculateDataSize(data: any): number {
    if (!data) return 0;
    return JSON.stringify(data).length;
  }

  private hashData(data: any): string {
    if (!data) return 'empty';
    return Buffer.from(JSON.stringify(data)).toString('base64').slice(0, 16);
  }

  private findDuplicates(hashes: string[]): Map<string, number> {
    const duplicates = new Map<string, number>();
    const counts = new Map<string, number>();

    hashes.forEach(hash => {
      const count = (counts.get(hash) || 0) + 1;
      counts.set(hash, count);
      if (count > 1) {
        duplicates.set(hash, count);
      }
    });

    return duplicates;
  }

  private calculateCacheValue(analysis: { count: number; avgDuration: number }): number {
    // Higher value for frequently used, long-running operations
    const frequencyScore = Math.min(1, analysis.count / 20);
    const durationScore = Math.min(1, analysis.avgDuration / 5000);
    return (frequencyScore + durationScore) / 2;
  }

  private calculateOptimalTTL(analysis: { count: number; avgDuration: number }): number {
    // Base TTL on execution frequency and duration
    const baseTime = 3600; // 1 hour
    const frequencyMultiplier = Math.max(0.5, Math.min(3, analysis.count / 10));
    const durationMultiplier = Math.max(0.5, Math.min(2, analysis.avgDuration / 2000));
    return Math.floor(baseTime * frequencyMultiplier * durationMultiplier);
  }

  private calculateOverallConfidence(patterns: any[]): number {
    if (patterns.length === 0) return 0;
    const avgConfidence = patterns.reduce((sum, p) => sum + (p.confidence || 0), 0) / patterns.length;
    return Math.min(0.95, avgConfidence);
  }

  private extractInputTypes(history: any[]): string[] {
    const types = new Set<string>();
    history.forEach(h => {
      if (h.inputData && typeof h.inputData === 'object') {
        Object.keys(h.inputData).forEach(key => types.add(key));
      }
    });
    return Array.from(types);
  }

  private extractOutputTypes(history: any[]): string[] {
    const types = new Set<string>();
    history.forEach(h => {
      if (h.outputData && typeof h.outputData === 'object') {
        Object.keys(h.outputData).forEach(key => types.add(key));
      }
    });
    return Array.from(types);
  }

  private extractDependencies(history: any[]): string[] {
    const dependencies = new Set<string>();
    history.forEach(h => {
      if (h.metadata?.dependencies && Array.isArray(h.metadata.dependencies)) {
        h.metadata.dependencies.forEach((dep: string) => dependencies.add(dep));
      }
    });
    return Array.from(dependencies);
  }

  private extractSeasonality(temporalPatterns: any[]): any {
    const seasonality: any = {};

    const hourlyPattern = temporalPatterns.find(p => p.type === 'temporal_seasonality_hourly');
    if (hourlyPattern) {
      seasonality.hourly = hourlyPattern.distribution;
    }

    const dailyPattern = temporalPatterns.find(p => p.type === 'temporal_seasonality_daily');
    if (dailyPattern) {
      seasonality.daily = dailyPattern.distribution;
    }

    return Object.keys(seasonality).length > 0 ? seasonality : undefined;
  }

  private predictNextExecution(temporalData: any): number | undefined {
    if (!temporalData || !temporalData.interval) return undefined;
    return Date.now() + temporalData.interval;
  }

  private calculateExpectedLoad(temporalData: any, resourceData: any): number {
    const frequencyScore = temporalData?.frequency || 1;
    const resourceScore = resourceData ? (resourceData.avgCpu + resourceData.avgMemory) / 200 : 0.5;
    return Math.min(1, frequencyScore * resourceScore);
  }

  private estimateCacheSize(pattern: WorkflowPattern): number {
    // Estimate based on input/output types and execution complexity
    const baseSize = 1024; // 1KB base
    const complexityMultiplier = Math.max(1, pattern.pattern.inputTypes.length + pattern.pattern.outputTypes.length);
    return Math.floor(baseSize * complexityMultiplier);
  }

  private calculateHotness(pattern: WorkflowPattern): number {
    const recencyScore = Math.max(0, 1 - (Date.now() - pattern.usage.lastExecuted) / (7 * 24 * 60 * 60 * 1000));
    const frequencyScore = Math.min(1, pattern.frequency);
    return (recencyScore + frequencyScore) / 2;
  }

  private generateInvalidationTriggers(pattern: WorkflowPattern): string[] {
    const triggers = ['data_update', 'config_change'];

    if (pattern.pattern.dependencies.length > 0) {
      triggers.push(...pattern.pattern.dependencies.map(dep => `dependency_${dep}_update`));
    }

    return triggers;
  }

  private generateWarmupTriggers(pattern: WorkflowPattern): string[] {
    const triggers = ['system_startup'];

    if (pattern.pattern.seasonality?.hourly) {
      triggers.push('peak_hour_approaching');
    }

    if (pattern.predictions.nextExecution) {
      triggers.push('scheduled_execution_approaching');
    }

    return triggers;
  }

  private calculateAccessSpeedup(pattern: WorkflowPattern): number {
    // Assume cache access is significantly faster than computation
    const computationTime = pattern.usage.avgExecutionTime;
    const cacheAccessTime = 10; // 10ms average cache access
    return Math.max(1, computationTime / cacheAccessTime);
  }

  private estimateHitRatio(pattern: WorkflowPattern): number {
    // Estimate based on frequency and input variability
    const baseHitRatio = 0.6;
    const frequencyBonus = Math.min(0.3, pattern.frequency / 10);
    return Math.min(0.95, baseHitRatio + frequencyBonus);
  }

  private startPeriodicAnalysis(): void {
    this.analysisTimer = setInterval(async () => {
      if (this.isAnalyzing) return;

      try {
        const workflowIds = Array.from(this.executionHistory.keys());
        for (const workflowId of workflowIds) {
          await this.analyzePatterns(workflowId);
        }
      } catch (error) {
        logger.error('Periodic pattern analysis failed', { error });
      }
    }, this.config.analysisInterval);

    logger.info('Pattern analyzer started with periodic analysis', {
      interval: this.config.analysisInterval
    });
  }

  // Public API methods
  public getWorkflowPatterns(workflowId: string): WorkflowPattern[] {
    return Array.from(this.patterns.values()).filter(p => p.workflowId === workflowId);
  }

  public getCachePatterns(type?: string): CachePattern[] {
    const patterns = Array.from(this.cachePatterns.values());
    return type ? patterns.filter(p => p.type === type) : patterns;
  }

  public getAllPatterns(): { workflow: WorkflowPattern[]; cache: CachePattern[] } {
    return {
      workflow: Array.from(this.patterns.values()),
      cache: Array.from(this.cachePatterns.values())
    };
  }

  public getExecutionHistory(workflowId: string): any[] {
    return this.executionHistory.get(workflowId) || [];
  }

  public clearPatterns(workflowId?: string): void {
    if (workflowId) {
      // Clear patterns for specific workflow
      const patternsToRemove = Array.from(this.patterns.keys())
        .filter(key => this.patterns.get(key)?.workflowId === workflowId);

      patternsToRemove.forEach(key => this.patterns.delete(key));

      const cachePatternsToRemove = Array.from(this.cachePatterns.keys())
        .filter(key => this.cachePatterns.get(key)?.key.includes(workflowId));

      cachePatternsToRemove.forEach(key => this.cachePatterns.delete(key));

      this.executionHistory.delete(workflowId);
    } else {
      // Clear all patterns
      this.patterns.clear();
      this.cachePatterns.clear();
      this.executionHistory.clear();
    }

    logger.info('Patterns cleared', { workflowId: workflowId || 'all' });
  }

  public destroy(): void {
    if (this.analysisTimer) {
      clearInterval(this.analysisTimer);
    }

    this.clearPatterns();
    this.removeAllListeners();

    logger.info('Pattern analyzer destroyed');
  }
}

export default PatternAnalyzer;