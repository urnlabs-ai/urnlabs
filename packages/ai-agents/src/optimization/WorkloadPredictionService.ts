/**
 * Workload Prediction Service
 *
 * Comprehensive predictive analytics system that forecasts workflow demand patterns
 * and resource requirements using historical execution data, machine learning models,
 * and real-time workload analysis.
 */

import { EventEmitter } from 'events';
import { z } from 'zod';
import { logger } from '../core/Logger.js';
import { TimeSeriesAnalyzer, TimeSeries, TimeSeriesAnalysisResult } from './TimeSeriesAnalyzer.js';
import type { PerformanceMetric } from '../types/PerformanceTypes.js';

// Core prediction schemas
export const WorkloadDemandSchema = z.object({
  timestamp: z.number(),
  expectedWorkflows: z.number().min(0),
  expectedConcurrentTasks: z.number().min(0),
  expectedQueueDepth: z.number().min(0),
  workflowTypes: z.record(z.number()),
  confidenceLevel: z.number().min(0).max(1)
});

export const ResourceDemandPredictionSchema = z.object({
  timestamp: z.number(),
  resources: z.object({
    cpu: z.object({
      cores: z.number().min(0),
      utilization: z.number().min(0).max(100)
    }),
    memory: z.object({
      totalMB: z.number().min(0),
      utilization: z.number().min(0).max(100)
    }),
    storage: z.object({
      totalGB: z.number().min(0),
      iopsRequired: z.number().min(0)
    }),
    network: z.object({
      bandwidthMbps: z.number().min(0),
      connectionsRequired: z.number().min(0)
    })
  }),
  scalingRecommendation: z.object({
    action: z.enum(['scale_up', 'scale_down', 'maintain', 'auto_scale']),
    targetCapacity: z.number().min(0),
    urgency: z.enum(['low', 'medium', 'high', 'critical']),
    estimatedCost: z.number().min(0).optional()
  }),
  confidence: z.number().min(0).max(1)
});

export const WorkloadPatternSchema = z.object({
  patternId: z.string(),
  name: z.string(),
  description: z.string(),
  frequency: z.enum(['hourly', 'daily', 'weekly', 'monthly', 'irregular']),
  characteristics: z.object({
    peakHours: z.array(z.number().min(0).max(23)),
    peakDays: z.array(z.number().min(0).max(6)),
    seasonalMultipliers: z.record(z.number()),
    burstCapability: z.number().min(1),
    baselineLoad: z.number().min(0)
  }),
  triggers: z.array(z.object({
    type: z.string(),
    condition: z.string(),
    probability: z.number().min(0).max(1)
  })),
  historicalAccuracy: z.number().min(0).max(1)
});

export const PredictionConfigSchema = z.object({
  // Prediction horizons
  shortTermHours: z.number().min(1).max(24).default(4),
  mediumTermHours: z.number().min(24).max(168).default(48),
  longTermHours: z.number().min(168).max(8760).default(720),

  // Model parameters
  modelUpdateInterval: z.number().min(300000).default(3600000), // 1 hour
  historicalDataDays: z.number().min(7).max(365).default(90),
  minimumDataPoints: z.number().min(50).default(100),

  // Prediction accuracy
  targetAccuracy: z.number().min(0.7).max(0.99).default(0.85),
  confidenceThreshold: z.number().min(0.5).max(0.95).default(0.8),

  // Resource prediction
  resourcePredictionInterval: z.number().min(60000).default(300000), // 5 minutes
  scalingCooldown: z.number().min(300000).default(600000), // 10 minutes

  // Pattern recognition
  enablePatternDetection: z.boolean().default(true),
  patternMinOccurrences: z.number().min(3).default(5),
  patternConfidenceThreshold: z.number().min(0.6).default(0.75)
});

export type WorkloadDemand = z.infer<typeof WorkloadDemandSchema>;
export type ResourceDemandPrediction = z.infer<typeof ResourceDemandPredictionSchema>;
export type WorkloadPattern = z.infer<typeof WorkloadPatternSchema>;
export type PredictionConfig = z.infer<typeof PredictionConfigSchema>;

export interface WorkloadPredictionResult {
  predictionId: string;
  organizationId: string;
  timestamp: number;
  horizon: 'short' | 'medium' | 'long';

  // Core predictions
  workloadDemand: WorkloadDemand[];
  resourceDemand: ResourceDemandPrediction[];

  // Pattern analysis
  detectedPatterns: WorkloadPattern[];
  anomalyProbability: number;

  // Model performance
  accuracy: number;
  confidence: number;
  modelVersion: string;

  // Recommendations
  recommendations: {
    immediate: string[];
    planned: string[];
    strategic: string[];
  };
}

export interface HistoricalWorkloadData {
  organizationId: string;
  timeRange: {
    start: number;
    end: number;
  };
  workflowExecutions: Array<{
    timestamp: number;
    workflowId: string;
    duration: number;
    resourceUsage: {
      cpu: number;
      memory: number;
      storage: number;
      network: number;
    };
    status: 'success' | 'failure' | 'timeout';
    queueWaitTime: number;
  }>;
  systemMetrics: Array<{
    timestamp: number;
    cpuUtilization: number;
    memoryUtilization: number;
    activeConnections: number;
    queueDepth: number;
  }>;
}

export class WorkloadPredictionService extends EventEmitter {
  private timeSeriesAnalyzer: TimeSeriesAnalyzer;
  private config: PredictionConfig;
  private predictionCache: Map<string, WorkloadPredictionResult>;
  private patterns: Map<string, WorkloadPattern>;
  private lastModelUpdate: number;
  private modelMetrics: Map<string, number>;

  constructor(config: Partial<PredictionConfig> = {}) {
    super();

    this.config = PredictionConfigSchema.parse(config);
    this.timeSeriesAnalyzer = new TimeSeriesAnalyzer({
      forecastHorizon: this.config.longTermHours,
      confidenceLevel: this.config.confidenceThreshold
    });

    this.predictionCache = new Map();
    this.patterns = new Map();
    this.lastModelUpdate = 0;
    this.modelMetrics = new Map();

    // Initialize background tasks
    this.setupPeriodicTasks();

    logger.info('WorkloadPredictionService initialized', { config: this.config });
  }

  /**
   * Generate comprehensive workload predictions for an organization
   */
  async generateWorkloadPrediction(
    organizationId: string,
    historicalData: HistoricalWorkloadData,
    horizon: 'short' | 'medium' | 'long' = 'medium'
  ): Promise<WorkloadPredictionResult> {
    try {
      logger.info('Generating workload prediction', {
        organizationId,
        horizon,
        dataPoints: historicalData.workflowExecutions.length
      });

      // Check cache first
      const cacheKey = this.generateCacheKey(organizationId, horizon);
      const cached = this.getCachedPrediction(cacheKey);
      if (cached && this.isCacheValid(cached)) {
        logger.debug('Returning cached prediction', { organizationId, horizon });
        return cached;
      }

      // Validate historical data
      if (!this.validateHistoricalData(historicalData)) {
        throw new Error('Insufficient or invalid historical data for prediction');
      }

      // Convert historical data to time series
      const timeSeries = await this.convertToTimeSeries(historicalData);

      // Analyze time series patterns
      const analysisResults = await Promise.all(
        timeSeries.map(series => this.timeSeriesAnalyzer.analyze(series))
      );

      // Detect workload patterns
      const detectedPatterns = await this.detectWorkloadPatterns(analysisResults, historicalData);

      // Generate workload demand predictions
      const workloadDemand = await this.generateWorkloadDemandPrediction(
        analysisResults,
        detectedPatterns,
        this.getHorizonHours(horizon)
      );

      // Generate resource demand predictions
      const resourceDemand = await this.generateResourceDemandPrediction(
        analysisResults,
        workloadDemand,
        historicalData
      );

      // Calculate prediction accuracy and confidence
      const accuracy = await this.calculatePredictionAccuracy(analysisResults);
      const confidence = this.calculateOverallConfidence(analysisResults);

      // Detect anomaly probability
      const anomalyProbability = this.calculateAnomalyProbability(analysisResults);

      // Generate recommendations
      const recommendations = await this.generateRecommendations(
        workloadDemand,
        resourceDemand,
        detectedPatterns,
        anomalyProbability
      );

      const result: WorkloadPredictionResult = {
        predictionId: this.generatePredictionId(),
        organizationId,
        timestamp: Date.now(),
        horizon,
        workloadDemand,
        resourceDemand,
        detectedPatterns,
        anomalyProbability,
        accuracy,
        confidence,
        modelVersion: this.getModelVersion(),
        recommendations
      };

      // Cache the result
      this.predictionCache.set(cacheKey, result);

      // Update model metrics
      await this.updateModelMetrics(result);

      // Emit prediction event
      this.emit('predictionGenerated', {
        organizationId,
        predictionId: result.predictionId,
        horizon,
        confidence,
        accuracy
      });

      logger.info('Workload prediction generated successfully', {
        organizationId,
        predictionId: result.predictionId,
        confidence,
        accuracy,
        patterns: detectedPatterns.length
      });

      return result;

    } catch (error) {
      logger.error('Workload prediction generation failed', {
        organizationId,
        horizon,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Get real-time workload prediction for immediate scaling decisions
   */
  async getRealTimeWorkloadPrediction(organizationId: string): Promise<{
    nextHourDemand: WorkloadDemand;
    next15MinutesDemand: WorkloadDemand;
    scalingRecommendation: ResourceDemandPrediction['scalingRecommendation'];
    confidence: number;
  }> {
    try {
      // Get recent prediction
      const prediction = await this.getLatestPrediction(organizationId);
      if (!prediction) {
        throw new Error('No recent predictions available for real-time analysis');
      }

      const now = Date.now();
      const next15Minutes = now + (15 * 60 * 1000);
      const nextHour = now + (60 * 60 * 1000);

      // Find predictions closest to target times
      const next15MinutesDemand = this.interpolateWorkloadDemand(prediction.workloadDemand, next15Minutes);
      const nextHourDemand = this.interpolateWorkloadDemand(prediction.workloadDemand, nextHour);

      // Get most recent resource demand prediction
      const latestResourceDemand = prediction.resourceDemand[0];
      const scalingRecommendation = latestResourceDemand?.scalingRecommendation || {
        action: 'maintain' as const,
        targetCapacity: 1,
        urgency: 'low' as const
      };

      return {
        nextHourDemand,
        next15MinutesDemand,
        scalingRecommendation,
        confidence: prediction.confidence
      };

    } catch (error) {
      logger.error('Real-time workload prediction failed', {
        organizationId,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Analyze workload trends over time
   */
  async analyzeWorkloadTrends(
    organizationId: string,
    timeRange: { start: number; end: number },
    historicalData: HistoricalWorkloadData
  ): Promise<{
    trends: {
      workloadGrowth: number; // Percentage change per month
      peakHourShift: number; // Hour shift in peak times
      resourceEfficiency: number; // Improvement in resource utilization
      patternStability: number; // How stable patterns are
    };
    insights: string[];
    recommendations: string[];
  }> {
    try {
      logger.info('Analyzing workload trends', {
        organizationId,
        timeRange,
        dataPoints: historicalData.workflowExecutions.length
      });

      // Convert to time series for trend analysis
      const timeSeries = await this.convertToTimeSeries(historicalData);
      const analysisResults = await Promise.all(
        timeSeries.map(series => this.timeSeriesAnalyzer.analyze(series))
      );

      // Calculate trend metrics
      const workloadTrend = analysisResults.find(r => r.seriesName === 'workflow_executions');
      const workloadGrowth = workloadTrend ? this.calculateGrowthRate(workloadTrend.trend) : 0;

      // Analyze peak hour changes
      const peakHourShift = this.analyzePeakHourShift(analysisResults);

      // Calculate resource efficiency trends
      const resourceEfficiency = await this.calculateResourceEfficiencyTrend(historicalData);

      // Measure pattern stability
      const patternStability = this.calculatePatternStability(analysisResults);

      // Generate insights
      const insights = this.generateTrendInsights({
        workloadGrowth,
        peakHourShift,
        resourceEfficiency,
        patternStability
      });

      // Generate recommendations
      const recommendations = this.generateTrendRecommendations({
        workloadGrowth,
        peakHourShift,
        resourceEfficiency,
        patternStability
      });

      logger.info('Workload trend analysis completed', {
        organizationId,
        workloadGrowth,
        patternStability
      });

      return {
        trends: {
          workloadGrowth,
          peakHourShift,
          resourceEfficiency,
          patternStability
        },
        insights,
        recommendations
      };

    } catch (error) {
      logger.error('Workload trend analysis failed', {
        organizationId,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Detect capacity bottlenecks and predict when they will occur
   */
  async predictCapacityBottlenecks(
    organizationId: string,
    currentCapacity: {
      cpu: number;
      memory: number;
      storage: number;
      network: number;
    },
    prediction: WorkloadPredictionResult
  ): Promise<{
    bottlenecks: Array<{
      resource: 'cpu' | 'memory' | 'storage' | 'network';
      predictedTime: number;
      severity: 'warning' | 'critical';
      currentUtilization: number;
      predictedUtilization: number;
      recommendations: string[];
    }>;
    timeToBottleneck: number; // Milliseconds until first bottleneck
    overallRisk: 'low' | 'medium' | 'high' | 'critical';
  }> {
    try {
      const bottlenecks: any[] = [];
      let earliestBottleneck = Infinity;

      // Analyze each resource type
      for (const resourceType of ['cpu', 'memory', 'storage', 'network'] as const) {
        const bottleneck = await this.analyzeResourceBottleneck(
          resourceType,
          currentCapacity[resourceType],
          prediction.resourceDemand
        );

        if (bottleneck) {
          bottlenecks.push(bottleneck);
          earliestBottleneck = Math.min(earliestBottleneck, bottleneck.predictedTime);
        }
      }

      // Calculate overall risk
      const timeToBottleneck = earliestBottleneck === Infinity ? -1 : earliestBottleneck - Date.now();
      const overallRisk = this.calculateOverallBottleneckRisk(bottlenecks, timeToBottleneck);

      logger.info('Capacity bottleneck prediction completed', {
        organizationId,
        bottlenecks: bottlenecks.length,
        timeToBottleneck,
        overallRisk
      });

      return {
        bottlenecks,
        timeToBottleneck,
        overallRisk
      };

    } catch (error) {
      logger.error('Capacity bottleneck prediction failed', {
        organizationId,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  // Private helper methods

  private async convertToTimeSeries(data: HistoricalWorkloadData): Promise<TimeSeries[]> {
    const series: TimeSeries[] = [];

    // Convert workflow executions to time series
    const executionCounts = this.aggregateExecutionCounts(data.workflowExecutions);
    series.push({
      name: 'workflow_executions',
      type: 'workflow_executions',
      dataPoints: executionCounts,
      interval: 'hour',
      aggregation: 'count'
    });

    // Convert resource usage to time series
    const cpuUsage = this.extractResourceMetrics(data.workflowExecutions, 'cpu');
    series.push({
      name: 'cpu_usage',
      type: 'resource_usage',
      dataPoints: cpuUsage,
      interval: 'hour',
      aggregation: 'average'
    });

    const memoryUsage = this.extractResourceMetrics(data.workflowExecutions, 'memory');
    series.push({
      name: 'memory_usage',
      type: 'resource_usage',
      dataPoints: memoryUsage,
      interval: 'hour',
      aggregation: 'average'
    });

    // Convert system metrics to time series
    const queueDepth = data.systemMetrics.map(m => ({
      timestamp: m.timestamp,
      value: m.queueDepth
    }));
    series.push({
      name: 'queue_depth',
      type: 'queue_depth',
      dataPoints: queueDepth,
      interval: 'hour',
      aggregation: 'average'
    });

    return series;
  }

  private aggregateExecutionCounts(executions: HistoricalWorkloadData['workflowExecutions']): Array<{ timestamp: number; value: number }> {
    const hourlyBuckets = new Map<number, number>();

    executions.forEach(execution => {
      const hour = Math.floor(execution.timestamp / (60 * 60 * 1000)) * (60 * 60 * 1000);
      hourlyBuckets.set(hour, (hourlyBuckets.get(hour) || 0) + 1);
    });

    return Array.from(hourlyBuckets.entries()).map(([timestamp, value]) => ({
      timestamp,
      value
    }));
  }

  private extractResourceMetrics(executions: HistoricalWorkloadData['workflowExecutions'], resource: 'cpu' | 'memory' | 'storage' | 'network'): Array<{ timestamp: number; value: number }> {
    const hourlyBuckets = new Map<number, number[]>();

    executions.forEach(execution => {
      const hour = Math.floor(execution.timestamp / (60 * 60 * 1000)) * (60 * 60 * 1000);
      const values = hourlyBuckets.get(hour) || [];
      values.push(execution.resourceUsage[resource]);
      hourlyBuckets.set(hour, values);
    });

    return Array.from(hourlyBuckets.entries()).map(([timestamp, values]) => ({
      timestamp,
      value: values.reduce((sum, v) => sum + v, 0) / values.length
    }));
  }

  private async detectWorkloadPatterns(
    analysisResults: TimeSeriesAnalysisResult[],
    historicalData: HistoricalWorkloadData
  ): Promise<WorkloadPattern[]> {
    const patterns: WorkloadPattern[] = [];

    // Detect daily patterns
    const workflowAnalysis = analysisResults.find(r => r.seriesName === 'workflow_executions');
    if (workflowAnalysis?.seasonality) {
      const dailyPattern = this.createDailyPattern(workflowAnalysis.seasonality);
      if (dailyPattern) patterns.push(dailyPattern);

      const weeklyPattern = this.createWeeklyPattern(workflowAnalysis.seasonality);
      if (weeklyPattern) patterns.push(weeklyPattern);
    }

    // Detect burst patterns
    const burstPattern = await this.detectBurstPattern(historicalData);
    if (burstPattern) patterns.push(burstPattern);

    return patterns;
  }

  private createDailyPattern(seasonality: TimeSeriesAnalysisResult['seasonality']): WorkloadPattern | null {
    const peakHours = seasonality.hourlyPattern
      .map((value, hour) => ({ hour, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 3)
      .map(p => p.hour);

    if (peakHours.length === 0) return null;

    return {
      patternId: 'daily_peak',
      name: 'Daily Peak Pattern',
      description: 'Regular daily workload peaks during business hours',
      frequency: 'daily',
      characteristics: {
        peakHours,
        peakDays: [1, 2, 3, 4, 5], // Monday to Friday
        seasonalMultipliers: {},
        burstCapability: 1.5,
        baselineLoad: Math.min(...seasonality.hourlyPattern)
      },
      triggers: [{
        type: 'time_based',
        condition: 'business_hours',
        probability: 0.8
      }],
      historicalAccuracy: 0.85
    };
  }

  private createWeeklyPattern(seasonality: TimeSeriesAnalysisResult['seasonality']): WorkloadPattern | null {
    const peakDays = seasonality.dailyPattern
      .map((value, day) => ({ day, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 2)
      .map(p => p.day);

    if (peakDays.length === 0) return null;

    return {
      patternId: 'weekly_cycle',
      name: 'Weekly Cycle Pattern',
      description: 'Weekly workload cycle with weekday peaks',
      frequency: 'weekly',
      characteristics: {
        peakHours: [9, 10, 14, 15],
        peakDays,
        seasonalMultipliers: {},
        burstCapability: 1.3,
        baselineLoad: Math.min(...seasonality.dailyPattern)
      },
      triggers: [{
        type: 'calendar_based',
        condition: 'weekday',
        probability: 0.7
      }],
      historicalAccuracy: 0.78
    };
  }

  private async detectBurstPattern(data: HistoricalWorkloadData): Promise<WorkloadPattern | null> {
    // Analyze execution patterns for burst detection
    const executions = data.workflowExecutions;
    if (executions.length < 50) return null;

    const burstThreshold = this.calculateBurstThreshold(executions);
    const bursts = this.identifyBursts(executions, burstThreshold);

    if (bursts.length < 3) return null;

    return {
      patternId: 'burst_pattern',
      name: 'Burst Pattern',
      description: 'Irregular high-intensity workload bursts',
      frequency: 'irregular',
      characteristics: {
        peakHours: [],
        peakDays: [],
        seasonalMultipliers: {},
        burstCapability: Math.max(...bursts.map(b => b.intensity)),
        baselineLoad: this.calculateBaselineLoad(executions)
      },
      triggers: [{
        type: 'event_driven',
        condition: 'high_demand',
        probability: 0.6
      }],
      historicalAccuracy: 0.65
    };
  }

  private async generateWorkloadDemandPrediction(
    analysisResults: TimeSeriesAnalysisResult[],
    patterns: WorkloadPattern[],
    horizonHours: number
  ): Promise<WorkloadDemand[]> {
    const predictions: WorkloadDemand[] = [];
    const workflowAnalysis = analysisResults.find(r => r.seriesName === 'workflow_executions');

    if (!workflowAnalysis) return predictions;

    // Generate predictions for each hour in the horizon
    const now = Date.now();
    const hourMs = 60 * 60 * 1000;

    for (let h = 1; h <= horizonHours; h++) {
      const timestamp = now + (h * hourMs);
      const forecastPoint = workflowAnalysis.forecast.find(f =>
        Math.abs(f.timestamp - timestamp) < hourMs / 2
      );

      if (forecastPoint) {
        // Apply pattern adjustments
        const patternMultiplier = this.calculatePatternMultiplier(patterns, timestamp);
        const adjustedValue = forecastPoint.predictedValue * patternMultiplier;

        predictions.push({
          timestamp,
          expectedWorkflows: Math.max(0, Math.round(adjustedValue)),
          expectedConcurrentTasks: Math.round(adjustedValue * 0.3), // Estimate
          expectedQueueDepth: Math.round(adjustedValue * 0.1), // Estimate
          workflowTypes: { default: adjustedValue },
          confidenceLevel: forecastPoint.confidence
        });
      }
    }

    return predictions;
  }

  private async generateResourceDemandPrediction(
    analysisResults: TimeSeriesAnalysisResult[],
    workloadDemand: WorkloadDemand[],
    historicalData: HistoricalWorkloadData
  ): Promise<ResourceDemandPrediction[]> {
    const predictions: ResourceDemandPrediction[] = [];

    // Calculate average resource consumption per workflow
    const avgResourcePerWorkflow = this.calculateAverageResourceConsumption(historicalData);

    for (const demand of workloadDemand) {
      const expectedWorkflows = demand.expectedWorkflows;

      // Predict resource requirements
      const cpuRequired = expectedWorkflows * avgResourcePerWorkflow.cpu;
      const memoryRequired = expectedWorkflows * avgResourcePerWorkflow.memory;
      const storageRequired = expectedWorkflows * avgResourcePerWorkflow.storage;
      const networkRequired = expectedWorkflows * avgResourcePerWorkflow.network;

      // Generate scaling recommendation
      const scalingRecommendation = this.generateScalingRecommendation(
        { cpu: cpuRequired, memory: memoryRequired, storage: storageRequired, network: networkRequired },
        demand.confidenceLevel
      );

      predictions.push({
        timestamp: demand.timestamp,
        resources: {
          cpu: {
            cores: cpuRequired,
            utilization: Math.min(cpuRequired * 100, 100)
          },
          memory: {
            totalMB: memoryRequired,
            utilization: Math.min(memoryRequired / 1024 * 100, 100)
          },
          storage: {
            totalGB: storageRequired,
            iopsRequired: expectedWorkflows * 10 // Estimate
          },
          network: {
            bandwidthMbps: networkRequired,
            connectionsRequired: expectedWorkflows
          }
        },
        scalingRecommendation,
        confidence: demand.confidenceLevel
      });
    }

    return predictions;
  }

  private calculateAverageResourceConsumption(data: HistoricalWorkloadData): {
    cpu: number;
    memory: number;
    storage: number;
    network: number;
  } {
    const executions = data.workflowExecutions;
    if (executions.length === 0) {
      return { cpu: 0.1, memory: 256, storage: 1, network: 0.1 };
    }

    const totals = executions.reduce((acc, exec) => ({
      cpu: acc.cpu + exec.resourceUsage.cpu,
      memory: acc.memory + exec.resourceUsage.memory,
      storage: acc.storage + exec.resourceUsage.storage,
      network: acc.network + exec.resourceUsage.network
    }), { cpu: 0, memory: 0, storage: 0, network: 0 });

    return {
      cpu: totals.cpu / executions.length,
      memory: totals.memory / executions.length,
      storage: totals.storage / executions.length,
      network: totals.network / executions.length
    };
  }

  private generateScalingRecommendation(
    requiredResources: { cpu: number; memory: number; storage: number; network: number },
    confidence: number
  ): ResourceDemandPrediction['scalingRecommendation'] {
    // Simplified scaling logic
    const maxResourceUtilization = Math.max(
      requiredResources.cpu / 4, // Assume 4 core baseline
      requiredResources.memory / 8192, // Assume 8GB baseline
      requiredResources.storage / 100, // Assume 100GB baseline
      requiredResources.network / 100 // Assume 100Mbps baseline
    );

    let action: ResourceDemandPrediction['scalingRecommendation']['action'];
    let urgency: ResourceDemandPrediction['scalingRecommendation']['urgency'];

    if (maxResourceUtilization > 0.9) {
      action = 'scale_up';
      urgency = 'critical';
    } else if (maxResourceUtilization > 0.7) {
      action = 'scale_up';
      urgency = 'high';
    } else if (maxResourceUtilization < 0.3) {
      action = 'scale_down';
      urgency = 'low';
    } else {
      action = 'maintain';
      urgency = 'low';
    }

    return {
      action,
      targetCapacity: Math.ceil(maxResourceUtilization * 100),
      urgency,
      estimatedCost: maxResourceUtilization * 100 // Simplified cost estimate
    };
  }

  private async generateRecommendations(
    workloadDemand: WorkloadDemand[],
    resourceDemand: ResourceDemandPrediction[],
    patterns: WorkloadPattern[],
    anomalyProbability: number
  ): Promise<WorkloadPredictionResult['recommendations']> {
    const immediate: string[] = [];
    const planned: string[] = [];
    const strategic: string[] = [];

    // Immediate recommendations (next 4 hours)
    const nearTermDemand = workloadDemand.slice(0, 4);
    const highDemandHours = nearTermDemand.filter(d => d.expectedWorkflows > 10).length;

    if (highDemandHours > 2) {
      immediate.push('Prepare for high workload in next 4 hours - consider pre-scaling resources');
    }

    if (anomalyProbability > 0.3) {
      immediate.push('Anomaly detected - monitor system closely and have incident response ready');
    }

    // Planned recommendations (next 48 hours)
    const urgentScaling = resourceDemand.filter(r => r.scalingRecommendation.urgency === 'high' || r.scalingRecommendation.urgency === 'critical');
    if (urgentScaling.length > 0) {
      planned.push(`Plan capacity scaling: ${urgentScaling.length} periods require resource adjustments`);
    }

    // Strategic recommendations (long-term)
    const dailyPattern = patterns.find(p => p.patternId === 'daily_peak');
    if (dailyPattern) {
      strategic.push('Implement predictive auto-scaling based on daily patterns to optimize costs');
    }

    const burstPattern = patterns.find(p => p.patternId === 'burst_pattern');
    if (burstPattern) {
      strategic.push('Consider burst-capable infrastructure to handle irregular load spikes');
    }

    return { immediate, planned, strategic };
  }

  // Additional helper methods for various calculations
  private calculatePatternMultiplier(patterns: WorkloadPattern[], timestamp: number): number {
    const date = new Date(timestamp);
    const hour = date.getHours();
    const dayOfWeek = date.getDay();

    let multiplier = 1.0;

    patterns.forEach(pattern => {
      if (pattern.frequency === 'daily' && pattern.characteristics.peakHours.includes(hour)) {
        multiplier *= 1.2;
      }
      if (pattern.frequency === 'weekly' && pattern.characteristics.peakDays.includes(dayOfWeek)) {
        multiplier *= 1.1;
      }
    });

    return multiplier;
  }

  private calculateBurstThreshold(executions: HistoricalWorkloadData['workflowExecutions']): number {
    const hourlyGroups = this.groupExecutionsByHour(executions);
    const counts = Array.from(hourlyGroups.values()).map(group => group.length);
    const mean = counts.reduce((sum, c) => sum + c, 0) / counts.length;
    const std = Math.sqrt(counts.reduce((sum, c) => sum + Math.pow(c - mean, 2), 0) / counts.length);
    return mean + (2 * std);
  }

  private identifyBursts(executions: HistoricalWorkloadData['workflowExecutions'], threshold: number): Array<{ timestamp: number; intensity: number }> {
    const hourlyGroups = this.groupExecutionsByHour(executions);
    const bursts: Array<{ timestamp: number; intensity: number }> = [];

    hourlyGroups.forEach((group, hour) => {
      if (group.length > threshold) {
        bursts.push({
          timestamp: hour,
          intensity: group.length / threshold
        });
      }
    });

    return bursts;
  }

  private groupExecutionsByHour(executions: HistoricalWorkloadData['workflowExecutions']): Map<number, typeof executions> {
    const groups = new Map<number, typeof executions>();

    executions.forEach(execution => {
      const hour = Math.floor(execution.timestamp / (60 * 60 * 1000)) * (60 * 60 * 1000);
      const group = groups.get(hour) || [];
      group.push(execution);
      groups.set(hour, group);
    });

    return groups;
  }

  private calculateBaselineLoad(executions: HistoricalWorkloadData['workflowExecutions']): number {
    const hourlyGroups = this.groupExecutionsByHour(executions);
    const counts = Array.from(hourlyGroups.values()).map(group => group.length);
    return counts.sort((a, b) => a - b)[Math.floor(counts.length * 0.1)]; // 10th percentile
  }

  private validateHistoricalData(data: HistoricalWorkloadData): boolean {
    return data.workflowExecutions.length >= this.config.minimumDataPoints &&
           data.systemMetrics.length >= this.config.minimumDataPoints;
  }

  private getHorizonHours(horizon: 'short' | 'medium' | 'long'): number {
    switch (horizon) {
      case 'short': return this.config.shortTermHours;
      case 'medium': return this.config.mediumTermHours;
      case 'long': return this.config.longTermHours;
    }
  }

  private generateCacheKey(organizationId: string, horizon: string): string {
    return `${organizationId}_${horizon}_${Math.floor(Date.now() / this.config.modelUpdateInterval)}`;
  }

  private getCachedPrediction(cacheKey: string): WorkloadPredictionResult | undefined {
    return this.predictionCache.get(cacheKey);
  }

  private isCacheValid(prediction: WorkloadPredictionResult): boolean {
    const age = Date.now() - prediction.timestamp;
    return age < this.config.modelUpdateInterval;
  }

  private generatePredictionId(): string {
    return `pred_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private getModelVersion(): string {
    return `v1.0.${Math.floor(this.lastModelUpdate / this.config.modelUpdateInterval)}`;
  }

  private async calculatePredictionAccuracy(results: TimeSeriesAnalysisResult[]): Promise<number> {
    // Average model R² scores across all time series
    const r2Scores = results.map(r => r.modelMetrics.r2);
    return r2Scores.reduce((sum, r2) => sum + r2, 0) / r2Scores.length;
  }

  private calculateOverallConfidence(results: TimeSeriesAnalysisResult[]): number {
    // Combine trend confidence and forecast confidence
    const trendConfidences = results.map(r => r.trend.confidence);
    const avgTrendConfidence = trendConfidences.reduce((sum, c) => sum + c, 0) / trendConfidences.length;

    return Math.min(avgTrendConfidence, 0.95); // Cap at 95%
  }

  private calculateAnomalyProbability(results: TimeSeriesAnalysisResult[]): number {
    // Higher probability if recent anomalies detected
    const recentAnomalies = results.flatMap(r => r.anomalies)
      .filter(a => a.timestamp > Date.now() - (24 * 60 * 60 * 1000)); // Last 24 hours

    return Math.min(recentAnomalies.length * 0.1, 1.0);
  }

  private async updateModelMetrics(result: WorkloadPredictionResult): Promise<void> {
    this.modelMetrics.set('accuracy', result.accuracy);
    this.modelMetrics.set('confidence', result.confidence);
    this.modelMetrics.set('lastUpdate', Date.now());
  }

  private async getLatestPrediction(organizationId: string): Promise<WorkloadPredictionResult | null> {
    // Find most recent prediction for organization
    for (const [key, prediction] of this.predictionCache) {
      if (prediction.organizationId === organizationId && this.isCacheValid(prediction)) {
        return prediction;
      }
    }
    return null;
  }

  private interpolateWorkloadDemand(demands: WorkloadDemand[], targetTimestamp: number): WorkloadDemand {
    // Find closest demand predictions
    const sortedDemands = demands.sort((a, b) => Math.abs(a.timestamp - targetTimestamp) - Math.abs(b.timestamp - targetTimestamp));

    if (sortedDemands.length === 0) {
      return {
        timestamp: targetTimestamp,
        expectedWorkflows: 0,
        expectedConcurrentTasks: 0,
        expectedQueueDepth: 0,
        workflowTypes: {},
        confidenceLevel: 0.5
      };
    }

    // Return closest match (simple approach)
    return sortedDemands[0];
  }

  private setupPeriodicTasks(): void {
    // Update models periodically
    setInterval(() => {
      this.lastModelUpdate = Date.now();
      this.emit('modelUpdated', { timestamp: this.lastModelUpdate });
    }, this.config.modelUpdateInterval);

    // Clean up old cache entries
    setInterval(() => {
      const cutoff = Date.now() - (this.config.modelUpdateInterval * 2);
      for (const [key, prediction] of this.predictionCache) {
        if (prediction.timestamp < cutoff) {
          this.predictionCache.delete(key);
        }
      }
    }, this.config.modelUpdateInterval);
  }

  // Additional analysis methods for trend analysis
  private calculateGrowthRate(trend: TimeSeriesAnalysisResult['trend']): number {
    // Convert slope to monthly growth percentage
    const monthlyMs = 30 * 24 * 60 * 60 * 1000;
    return trend.slope * monthlyMs * 100;
  }

  private analyzePeakHourShift(results: TimeSeriesAnalysisResult[]): number {
    // Analyze how peak hours have shifted over time
    // This is a simplified implementation
    return 0; // Placeholder
  }

  private async calculateResourceEfficiencyTrend(data: HistoricalWorkloadData): Promise<number> {
    // Calculate improvement in resource utilization over time
    // This is a simplified implementation
    return 0.05; // 5% improvement placeholder
  }

  private calculatePatternStability(results: TimeSeriesAnalysisResult[]): number {
    // Measure how stable patterns are over time
    const seasonalStrengths = results.map(r => r.trend.correlation);
    const avgStrength = seasonalStrengths.reduce((sum, s) => sum + Math.abs(s), 0) / seasonalStrengths.length;
    return avgStrength;
  }

  private generateTrendInsights(trends: any): string[] {
    const insights: string[] = [];

    if (trends.workloadGrowth > 20) {
      insights.push(`Workload is growing rapidly at ${trends.workloadGrowth.toFixed(1)}% per month`);
    }

    if (trends.patternStability > 0.8) {
      insights.push('Workload patterns are highly stable and predictable');
    }

    if (trends.resourceEfficiency > 0) {
      insights.push(`Resource efficiency is improving by ${(trends.resourceEfficiency * 100).toFixed(1)}% per month`);
    }

    return insights;
  }

  private generateTrendRecommendations(trends: any): string[] {
    const recommendations: string[] = [];

    if (trends.workloadGrowth > 15) {
      recommendations.push('Plan for significant infrastructure scaling in the next quarter');
    }

    if (trends.patternStability > 0.7) {
      recommendations.push('Implement predictive auto-scaling to optimize costs');
    }

    return recommendations;
  }

  private async analyzeResourceBottleneck(
    resourceType: 'cpu' | 'memory' | 'storage' | 'network',
    currentCapacity: number,
    resourceDemands: ResourceDemandPrediction[]
  ): Promise<any> {
    // Find when resource utilization exceeds 90%
    for (const demand of resourceDemands) {
      const resourceInfo = demand.resources[resourceType];
      let utilization = 0;

      switch (resourceType) {
        case 'cpu':
          utilization = resourceInfo.utilization;
          break;
        case 'memory':
          utilization = resourceInfo.utilization;
          break;
        case 'storage':
          utilization = (resourceInfo.totalGB / currentCapacity) * 100;
          break;
        case 'network':
          utilization = (resourceInfo.bandwidthMbps / currentCapacity) * 100;
          break;
      }

      if (utilization > 90) {
        return {
          resource: resourceType,
          predictedTime: demand.timestamp,
          severity: utilization > 95 ? 'critical' : 'warning',
          currentUtilization: utilization - 20, // Estimate current
          predictedUtilization: utilization,
          recommendations: [`Scale up ${resourceType} capacity before ${new Date(demand.timestamp).toISOString()}`]
        };
      }
    }

    return null;
  }

  private calculateOverallBottleneckRisk(bottlenecks: any[], timeToBottleneck: number): 'low' | 'medium' | 'high' | 'critical' {
    if (bottlenecks.length === 0) return 'low';

    if (timeToBottleneck < 60 * 60 * 1000) return 'critical'; // Less than 1 hour
    if (timeToBottleneck < 24 * 60 * 60 * 1000) return 'high'; // Less than 1 day
    if (timeToBottleneck < 7 * 24 * 60 * 60 * 1000) return 'medium'; // Less than 1 week

    return 'low';
  }

  /**
   * Get service metrics and status
   */
  getMetrics(): {
    cacheSize: number;
    patternsDetected: number;
    lastModelUpdate: number;
    modelMetrics: Record<string, number>;
  } {
    return {
      cacheSize: this.predictionCache.size,
      patternsDetected: this.patterns.size,
      lastModelUpdate: this.lastModelUpdate,
      modelMetrics: Object.fromEntries(this.modelMetrics)
    };
  }

  /**
   * Clear all caches and reset patterns
   */
  clearCache(): void {
    this.predictionCache.clear();
    this.patterns.clear();
    this.timeSeriesAnalyzer.clearCache();
    logger.info('WorkloadPredictionService cache cleared');
  }
}