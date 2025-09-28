/**
 * Feature Engineering for Predictive Analytics
 * 
 * Processes raw agent and workflow data to create features for ML models.
 * Handles time-series data transformation, statistical feature extraction,
 * and domain-specific feature creation for agent performance prediction.
 */

import { PrismaClient } from '@prisma/client';
import { EventEmitter } from 'events';

export interface FeatureSet {
  agentPerformanceFeatures: AgentPerformanceFeatures;
  workflowFeatures: WorkflowFeatures;
  timeSeriesFeatures: TimeSeriesFeatures;
  environmentalFeatures: EnvironmentalFeatures;
  metadata: FeatureMetadata;
}

export interface AgentPerformanceFeatures {
  // Basic performance metrics
  avgResponseTime: number;
  p95ResponseTime: number;
  p99ResponseTime: number;
  errorRate: number;
  successRate: number;
  throughput: number;
  
  // Resource utilization
  avgCpuUsage: number;
  maxCpuUsage: number;
  avgMemoryUsage: number;
  maxMemoryUsage: number;
  
  // Agent-specific features
  concurrentExecutions: number;
  taskCompletionRate: number;
  averageTaskDuration: number;
  toolUsageFrequency: Record<string, number>;
  
  // Behavioral patterns
  timeOfDayPerformance: number[];
  dayOfWeekPerformance: number[];
  workloadDistribution: Record<string, number>;
  
  // Quality metrics
  retryRate: number;
  escalationRate: number;
  userSatisfactionScore: number;
}

export interface WorkflowFeatures {
  // Workflow execution metrics
  totalRuns: number;
  successfulRuns: number;
  failedRuns: number;
  avgExecutionTime: number;
  p95ExecutionTime: number;
  
  // Step-level analysis
  stepSuccessRates: Record<string, number>;
  stepDurations: Record<string, number>;
  criticalPathDuration: number;
  
  // Dependencies and complexity
  stepCount: number;
  dependencyDepth: number;
  parallelExecutionRatio: number;
  conditionalBranchCount: number;
  
  // Resource patterns
  peakResourceUsage: number;
  resourceEfficiency: number;
  costPerExecution: number;
}

export interface TimeSeriesFeatures {
  // Trend analysis
  performanceTrend: number; // -1 to 1, negative = declining
  volatility: number;
  seasonality: Record<string, number>;
  
  // Statistical features
  mean: number;
  median: number;
  standardDeviation: number;
  skewness: number;
  kurtosis: number;
  
  // Time-based patterns
  hourlyPatterns: number[];
  dailyPatterns: number[];
  weeklyPatterns: number[];
  monthlyPatterns: number[];
  
  // Change point detection
  changePoints: Array<{
    timestamp: Date;
    severity: number;
    direction: 'increase' | 'decrease';
  }>;
  
  // Lag features
  lag1: number;
  lag7: number;
  lag30: number;
  movingAverage7: number;
  movingAverage30: number;
}

export interface EnvironmentalFeatures {
  // System load
  systemLoad: number;
  concurrentUsers: number;
  apiRequestVolume: number;
  
  // Infrastructure
  availableResources: number;
  networkLatency: number;
  databasePerformance: number;
  
  // External factors
  timeOfDay: number; // 0-23
  dayOfWeek: number; // 0-6
  isBusinessHours: boolean;
  isWeekend: boolean;
  isHoliday: boolean;
  
  // Organizational context
  organizationSize: number;
  planType: string;
  userActivityLevel: number;
}

export interface FeatureMetadata {
  generatedAt: Date;
  timeRange: {
    start: Date;
    end: Date;
  };
  dataPoints: number;
  featureVersion: string;
  organizationId: string;
  agentId?: string;
  workflowId?: string;
}

export class FeatureEngineering extends EventEmitter {
  private prisma: PrismaClient;
  private featureCache: Map<string, { features: FeatureSet; timestamp: Date }>;
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  constructor(prisma?: PrismaClient) {
    super();
    this.prisma = prisma || new PrismaClient();
    this.featureCache = new Map();
  }

  /**
   * Generate comprehensive feature set for an agent
   */
  async generateAgentFeatures(
    agentId: string,
    organizationId: string,
    timeRange: { start: Date; end: Date }
  ): Promise<FeatureSet> {
    const cacheKey = `agent:${agentId}:${timeRange.start.getTime()}:${timeRange.end.getTime()}`;
    
    // Check cache
    const cached = this.featureCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp.getTime() < this.CACHE_TTL) {
      return cached.features;
    }

    try {
      // Gather raw data
      const [
        performanceMetrics,
        workflowRuns,
        auditLogs,
        agent,
        organization
      ] = await Promise.all([
        this.getPerformanceMetrics(agentId, timeRange),
        this.getWorkflowRuns(agentId, timeRange),
        this.getAuditLogs(agentId, timeRange),
        this.getAgent(agentId),
        this.getOrganization(organizationId)
      ]);

      // Generate feature sets
      const agentPerformanceFeatures = await this.extractAgentPerformanceFeatures(
        performanceMetrics,
        workflowRuns,
        auditLogs
      );

      const workflowFeatures = await this.extractWorkflowFeatures(workflowRuns);
      
      const timeSeriesFeatures = await this.extractTimeSeriesFeatures(
        performanceMetrics,
        timeRange
      );

      const environmentalFeatures = await this.extractEnvironmentalFeatures(
        organizationId,
        timeRange,
        organization
      );

      const features: FeatureSet = {
        agentPerformanceFeatures,
        workflowFeatures,
        timeSeriesFeatures,
        environmentalFeatures,
        metadata: {
          generatedAt: new Date(),
          timeRange,
          dataPoints: performanceMetrics.length,
          featureVersion: '1.0.0',
          organizationId,
          agentId
        }
      };

      // Cache the result
      this.featureCache.set(cacheKey, { features, timestamp: new Date() });

      this.emit('featuresGenerated', { agentId, organizationId, featureCount: this.countFeatures(features) });

      return features;

    } catch (error) {
      this.emit('featureGenerationError', { agentId, organizationId, error: error.message });
      throw error;
    }
  }

  /**
   * Generate workflow-specific features
   */
  async generateWorkflowFeatures(
    workflowId: string,
    organizationId: string,
    timeRange: { start: Date; end: Date }
  ): Promise<FeatureSet> {
    const cacheKey = `workflow:${workflowId}:${timeRange.start.getTime()}:${timeRange.end.getTime()}`;
    
    const cached = this.featureCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp.getTime() < this.CACHE_TTL) {
      return cached.features;
    }

    try {
      const [
        workflowRuns,
        performanceMetrics,
        workflow,
        organization
      ] = await Promise.all([
        this.getWorkflowRunsForWorkflow(workflowId, timeRange),
        this.getWorkflowPerformanceMetrics(workflowId, timeRange),
        this.getWorkflow(workflowId),
        this.getOrganization(organizationId)
      ]);

      const features: FeatureSet = {
        agentPerformanceFeatures: await this.extractAgentPerformanceFeatures(
          performanceMetrics,
          workflowRuns,
          []
        ),
        workflowFeatures: await this.extractWorkflowFeatures(workflowRuns),
        timeSeriesFeatures: await this.extractTimeSeriesFeatures(
          performanceMetrics,
          timeRange
        ),
        environmentalFeatures: await this.extractEnvironmentalFeatures(
          organizationId,
          timeRange,
          organization
        ),
        metadata: {
          generatedAt: new Date(),
          timeRange,
          dataPoints: workflowRuns.length,
          featureVersion: '1.0.0',
          organizationId,
          workflowId
        }
      };

      this.featureCache.set(cacheKey, { features, timestamp: new Date() });
      return features;

    } catch (error) {
      this.emit('featureGenerationError', { workflowId, organizationId, error: error.message });
      throw error;
    }
  }

  /**
   * Extract agent performance features from raw metrics
   */
  private async extractAgentPerformanceFeatures(
    metrics: any[],
    workflowRuns: any[],
    auditLogs: any[]
  ): Promise<AgentPerformanceFeatures> {
    const responseTimeMetrics = metrics.filter(m => m.metric === 'response_time');
    const errorMetrics = metrics.filter(m => m.metric === 'error_rate');
    const cpuMetrics = metrics.filter(m => m.metric === 'cpu_usage');
    const memoryMetrics = metrics.filter(m => m.metric === 'memory_usage');

    // Basic performance calculations
    const responseTimes = responseTimeMetrics.map(m => m.value);
    const avgResponseTime = this.calculateMean(responseTimes);
    const p95ResponseTime = this.calculatePercentile(responseTimes, 95);
    const p99ResponseTime = this.calculatePercentile(responseTimes, 99);

    const errorRates = errorMetrics.map(m => m.value);
    const errorRate = this.calculateMean(errorRates);
    const successRate = 100 - errorRate;

    // Resource utilization
    const cpuValues = cpuMetrics.map(m => m.value);
    const memoryValues = memoryMetrics.map(m => m.value);

    // Workflow analysis
    const successfulRuns = workflowRuns.filter(r => r.status === 'completed').length;
    const totalRuns = workflowRuns.length;
    const taskCompletionRate = totalRuns > 0 ? (successfulRuns / totalRuns) * 100 : 0;

    // Time-based performance patterns
    const timeOfDayPerformance = this.calculateTimeOfDayPerformance(metrics);
    const dayOfWeekPerformance = this.calculateDayOfWeekPerformance(metrics);

    return {
      avgResponseTime,
      p95ResponseTime,
      p99ResponseTime,
      errorRate,
      successRate,
      throughput: this.calculateThroughput(metrics),
      avgCpuUsage: this.calculateMean(cpuValues),
      maxCpuUsage: Math.max(...cpuValues, 0),
      avgMemoryUsage: this.calculateMean(memoryValues),
      maxMemoryUsage: Math.max(...memoryValues, 0),
      concurrentExecutions: this.calculateConcurrentExecutions(workflowRuns),
      taskCompletionRate,
      averageTaskDuration: this.calculateAverageTaskDuration(workflowRuns),
      toolUsageFrequency: this.extractToolUsageFrequency(auditLogs),
      timeOfDayPerformance,
      dayOfWeekPerformance,
      workloadDistribution: this.calculateWorkloadDistribution(workflowRuns),
      retryRate: this.calculateRetryRate(auditLogs),
      escalationRate: this.calculateEscalationRate(auditLogs),
      userSatisfactionScore: this.calculateUserSatisfactionScore(auditLogs)
    };
  }

  /**
   * Extract workflow-specific features
   */
  private async extractWorkflowFeatures(workflowRuns: any[]): Promise<WorkflowFeatures> {
    const successfulRuns = workflowRuns.filter(r => r.status === 'completed');
    const failedRuns = workflowRuns.filter(r => r.status === 'failed');
    
    const executionTimes = successfulRuns
      .map(r => {
        if (r.completedAt && r.startedAt) {
          return new Date(r.completedAt).getTime() - new Date(r.startedAt).getTime();
        }
        return 0;
      })
      .filter(time => time > 0);

    return {
      totalRuns: workflowRuns.length,
      successfulRuns: successfulRuns.length,
      failedRuns: failedRuns.length,
      avgExecutionTime: this.calculateMean(executionTimes),
      p95ExecutionTime: this.calculatePercentile(executionTimes, 95),
      stepSuccessRates: this.calculateStepSuccessRates(workflowRuns),
      stepDurations: this.calculateStepDurations(workflowRuns),
      criticalPathDuration: this.calculateCriticalPathDuration(workflowRuns),
      stepCount: this.calculateAverageStepCount(workflowRuns),
      dependencyDepth: this.calculateDependencyDepth(workflowRuns),
      parallelExecutionRatio: this.calculateParallelExecutionRatio(workflowRuns),
      conditionalBranchCount: this.calculateConditionalBranchCount(workflowRuns),
      peakResourceUsage: this.calculatePeakResourceUsage(workflowRuns),
      resourceEfficiency: this.calculateResourceEfficiency(workflowRuns),
      costPerExecution: this.calculateCostPerExecution(workflowRuns)
    };
  }

  /**
   * Extract time series features for trend analysis
   */
  private async extractTimeSeriesFeatures(
    metrics: any[],
    timeRange: { start: Date; end: Date }
  ): Promise<TimeSeriesFeatures> {
    if (metrics.length === 0) {
      return this.getEmptyTimeSeriesFeatures();
    }

    // Sort by timestamp
    const sortedMetrics = metrics.sort((a, b) => 
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    const values = sortedMetrics.map(m => m.value);
    
    // Statistical measures
    const mean = this.calculateMean(values);
    const median = this.calculateMedian(values);
    const standardDeviation = this.calculateStandardDeviation(values);
    const skewness = this.calculateSkewness(values);
    const kurtosis = this.calculateKurtosis(values);

    // Trend analysis
    const performanceTrend = this.calculateTrend(values);
    const volatility = this.calculateVolatility(values);

    // Patterns
    const hourlyPatterns = this.calculateHourlyPatterns(sortedMetrics);
    const dailyPatterns = this.calculateDailyPatterns(sortedMetrics);
    const weeklyPatterns = this.calculateWeeklyPatterns(sortedMetrics);
    const monthlyPatterns = this.calculateMonthlyPatterns(sortedMetrics);

    // Change points
    const changePoints = this.detectChangePoints(sortedMetrics);

    // Lag features
    const lag1 = values.length > 1 ? values[values.length - 2] : 0;
    const lag7 = values.length > 7 ? values[values.length - 8] : 0;
    const lag30 = values.length > 30 ? values[values.length - 31] : 0;

    return {
      performanceTrend,
      volatility,
      seasonality: this.calculateSeasonality(sortedMetrics),
      mean,
      median,
      standardDeviation,
      skewness,
      kurtosis,
      hourlyPatterns,
      dailyPatterns,
      weeklyPatterns,
      monthlyPatterns,
      changePoints,
      lag1,
      lag7,
      lag30,
      movingAverage7: this.calculateMovingAverage(values, 7),
      movingAverage30: this.calculateMovingAverage(values, 30)
    };
  }

  /**
   * Extract environmental and contextual features
   */
  private async extractEnvironmentalFeatures(
    organizationId: string,
    timeRange: { start: Date; end: Date },
    organization: any
  ): Promise<EnvironmentalFeatures> {
    const now = new Date();
    
    // System load metrics (simplified - would get from monitoring system)
    const systemLoad = await this.calculateSystemLoad(organizationId, timeRange);
    const concurrentUsers = await this.calculateConcurrentUsers(organizationId, timeRange);
    const apiRequestVolume = await this.calculateApiRequestVolume(organizationId, timeRange);

    return {
      systemLoad,
      concurrentUsers,
      apiRequestVolume,
      availableResources: await this.calculateAvailableResources(),
      networkLatency: await this.calculateNetworkLatency(),
      databasePerformance: await this.calculateDatabasePerformance(organizationId, timeRange),
      timeOfDay: now.getHours(),
      dayOfWeek: now.getDay(),
      isBusinessHours: this.isBusinessHours(now),
      isWeekend: this.isWeekend(now),
      isHoliday: await this.isHoliday(now),
      organizationSize: await this.calculateOrganizationSize(organizationId),
      planType: organization?.planType || 'free',
      userActivityLevel: await this.calculateUserActivityLevel(organizationId, timeRange)
    };
  }

  // Helper methods for statistical calculations
  private calculateMean(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((sum, val) => sum + val, 0) / values.length;
  }

  private calculateMedian(values: number[]): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  private calculatePercentile(values: number[], percentile: number): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[Math.max(0, Math.min(index, sorted.length - 1))];
  }

  private calculateStandardDeviation(values: number[]): number {
    if (values.length === 0) return 0;
    const mean = this.calculateMean(values);
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
    return Math.sqrt(variance);
  }

  private calculateSkewness(values: number[]): number {
    if (values.length === 0) return 0;
    const mean = this.calculateMean(values);
    const std = this.calculateStandardDeviation(values);
    if (std === 0) return 0;
    
    const skew = values.reduce((sum, val) => sum + Math.pow((val - mean) / std, 3), 0) / values.length;
    return skew;
  }

  private calculateKurtosis(values: number[]): number {
    if (values.length === 0) return 0;
    const mean = this.calculateMean(values);
    const std = this.calculateStandardDeviation(values);
    if (std === 0) return 0;
    
    const kurt = values.reduce((sum, val) => sum + Math.pow((val - mean) / std, 4), 0) / values.length;
    return kurt - 3; // Excess kurtosis
  }

  private calculateTrend(values: number[]): number {
    if (values.length < 2) return 0;
    
    // Simple linear regression slope
    const n = values.length;
    const x = Array.from({ length: n }, (_, i) => i);
    const meanX = this.calculateMean(x);
    const meanY = this.calculateMean(values);
    
    const numerator = x.reduce((sum, xi, i) => sum + (xi - meanX) * (values[i] - meanY), 0);
    const denominator = x.reduce((sum, xi) => sum + Math.pow(xi - meanX, 2), 0);
    
    return denominator === 0 ? 0 : numerator / denominator;
  }

  private calculateVolatility(values: number[]): number {
    if (values.length < 2) return 0;
    
    const returns = [];
    for (let i = 1; i < values.length; i++) {
      if (values[i - 1] !== 0) {
        returns.push((values[i] - values[i - 1]) / values[i - 1]);
      }
    }
    
    return this.calculateStandardDeviation(returns);
  }

  private calculateMovingAverage(values: number[], window: number): number {
    if (values.length < window) return this.calculateMean(values);
    const recent = values.slice(-window);
    return this.calculateMean(recent);
  }

  // Time pattern analysis
  private calculateTimeOfDayPerformance(metrics: any[]): number[] {
    const hourlyPerformance = Array(24).fill(0);
    const hourlyCounts = Array(24).fill(0);
    
    metrics.forEach(metric => {
      const hour = new Date(metric.timestamp).getHours();
      hourlyPerformance[hour] += metric.value;
      hourlyCounts[hour]++;
    });
    
    return hourlyPerformance.map((sum, i) => 
      hourlyCounts[i] > 0 ? sum / hourlyCounts[i] : 0
    );
  }

  private calculateDayOfWeekPerformance(metrics: any[]): number[] {
    const weeklyPerformance = Array(7).fill(0);
    const weeklyCounts = Array(7).fill(0);
    
    metrics.forEach(metric => {
      const day = new Date(metric.timestamp).getDay();
      weeklyPerformance[day] += metric.value;
      weeklyCounts[day]++;
    });
    
    return weeklyPerformance.map((sum, i) => 
      weeklyCounts[i] > 0 ? sum / weeklyCounts[i] : 0
    );
  }

  private calculateHourlyPatterns(metrics: any[]): number[] {
    return this.calculateTimeOfDayPerformance(metrics);
  }

  private calculateDailyPatterns(metrics: any[]): number[] {
    return this.calculateDayOfWeekPerformance(metrics);
  }

  private calculateWeeklyPatterns(metrics: any[]): number[] {
    // Group by week of year
    const weeklyData: Record<number, number[]> = {};
    
    metrics.forEach(metric => {
      const date = new Date(metric.timestamp);
      const week = this.getWeekOfYear(date);
      if (!weeklyData[week]) weeklyData[week] = [];
      weeklyData[week].push(metric.value);
    });
    
    return Object.values(weeklyData).map(values => this.calculateMean(values));
  }

  private calculateMonthlyPatterns(metrics: any[]): number[] {
    const monthlyData = Array(12).fill(0).map(() => [] as number[]);
    
    metrics.forEach(metric => {
      const month = new Date(metric.timestamp).getMonth();
      monthlyData[month].push(metric.value);
    });
    
    return monthlyData.map(values => this.calculateMean(values));
  }

  private detectChangePoints(metrics: any[]): Array<{
    timestamp: Date;
    severity: number;
    direction: 'increase' | 'decrease';
  }> {
    const changePoints = [];
    const windowSize = Math.min(10, Math.floor(metrics.length / 4));
    
    if (metrics.length < windowSize * 2) return changePoints;
    
    for (let i = windowSize; i < metrics.length - windowSize; i++) {
      const before = metrics.slice(i - windowSize, i).map(m => m.value);
      const after = metrics.slice(i, i + windowSize).map(m => m.value);
      
      const meanBefore = this.calculateMean(before);
      const meanAfter = this.calculateMean(after);
      const stdBefore = this.calculateStandardDeviation(before);
      
      if (stdBefore > 0) {
        const change = (meanAfter - meanBefore) / stdBefore;
        if (Math.abs(change) > 2) { // Significant change
          changePoints.push({
            timestamp: new Date(metrics[i].timestamp),
            severity: Math.abs(change),
            direction: change > 0 ? 'increase' : 'decrease'
          });
        }
      }
    }
    
    return changePoints;
  }

  // Domain-specific calculations
  private calculateThroughput(metrics: any[]): number {
    const throughputMetrics = metrics.filter(m => m.metric === 'throughput');
    if (throughputMetrics.length === 0) return 0;
    return this.calculateMean(throughputMetrics.map(m => m.value));
  }

  private calculateConcurrentExecutions(workflowRuns: any[]): number {
    // Simplified calculation - would need more sophisticated overlap detection
    const runningRuns = workflowRuns.filter(r => r.status === 'running');
    return runningRuns.length;
  }

  private calculateAverageTaskDuration(workflowRuns: any[]): number {
    const durations = workflowRuns
      .filter(r => r.completedAt && r.startedAt)
      .map(r => new Date(r.completedAt).getTime() - new Date(r.startedAt).getTime());
    
    return this.calculateMean(durations);
  }

  private extractToolUsageFrequency(auditLogs: any[]): Record<string, number> {
    const toolUsage: Record<string, number> = {};
    
    auditLogs.forEach(log => {
      if (log.resourceType === 'tool' && log.action === 'execute') {
        const tool = log.resourceId || 'unknown';
        toolUsage[tool] = (toolUsage[tool] || 0) + 1;
      }
    });
    
    return toolUsage;
  }

  private calculateWorkloadDistribution(workflowRuns: any[]): Record<string, number> {
    const distribution: Record<string, number> = {};
    
    workflowRuns.forEach(run => {
      const type = run.workflow?.type || 'unknown';
      distribution[type] = (distribution[type] || 0) + 1;
    });
    
    return distribution;
  }

  private calculateRetryRate(auditLogs: any[]): number {
    const totalActions = auditLogs.length;
    const retryActions = auditLogs.filter(log => 
      log.action.includes('retry') || log.metadata?.isRetry
    ).length;
    
    return totalActions > 0 ? (retryActions / totalActions) * 100 : 0;
  }

  private calculateEscalationRate(auditLogs: any[]): number {
    const totalActions = auditLogs.length;
    const escalations = auditLogs.filter(log => 
      log.action.includes('escalat') || log.severity === 'critical'
    ).length;
    
    return totalActions > 0 ? (escalations / totalActions) * 100 : 0;
  }

  private calculateUserSatisfactionScore(auditLogs: any[]): number {
    // Simplified calculation based on success/failure rates
    const outcomes = auditLogs.map(log => log.outcome);
    const successCount = outcomes.filter(o => o === 'success').length;
    return outcomes.length > 0 ? (successCount / outcomes.length) * 100 : 50;
  }

  // Workflow-specific calculations
  private calculateStepSuccessRates(workflowRuns: any[]): Record<string, number> {
    const stepStats: Record<string, { total: number; successful: number }> = {};
    
    workflowRuns.forEach(run => {
      if (run.executions) {
        run.executions.forEach((execution: any) => {
          const stepName = execution.stepName || execution.stepId;
          if (!stepStats[stepName]) {
            stepStats[stepName] = { total: 0, successful: 0 };
          }
          stepStats[stepName].total++;
          if (execution.status === 'completed') {
            stepStats[stepName].successful++;
          }
        });
      }
    });
    
    const successRates: Record<string, number> = {};
    Object.entries(stepStats).forEach(([step, stats]) => {
      successRates[step] = stats.total > 0 ? (stats.successful / stats.total) * 100 : 0;
    });
    
    return successRates;
  }

  private calculateStepDurations(workflowRuns: any[]): Record<string, number> {
    const stepDurations: Record<string, number[]> = {};
    
    workflowRuns.forEach(run => {
      if (run.executions) {
        run.executions.forEach((execution: any) => {
          const stepName = execution.stepName || execution.stepId;
          if (execution.completedAt && execution.startedAt) {
            const duration = new Date(execution.completedAt).getTime() - 
                           new Date(execution.startedAt).getTime();
            if (!stepDurations[stepName]) stepDurations[stepName] = [];
            stepDurations[stepName].push(duration);
          }
        });
      }
    });
    
    const avgDurations: Record<string, number> = {};
    Object.entries(stepDurations).forEach(([step, durations]) => {
      avgDurations[step] = this.calculateMean(durations);
    });
    
    return avgDurations;
  }

  // Placeholder methods for complex calculations
  private calculateCriticalPathDuration(workflowRuns: any[]): number {
    // Would implement critical path analysis
    return 0;
  }

  private calculateAverageStepCount(workflowRuns: any[]): number {
    const stepCounts = workflowRuns.map(run => 
      run.executions ? run.executions.length : 0
    );
    return this.calculateMean(stepCounts);
  }

  private calculateDependencyDepth(workflowRuns: any[]): number {
    // Would analyze step dependencies
    return 1;
  }

  private calculateParallelExecutionRatio(workflowRuns: any[]): number {
    // Would calculate parallel vs sequential execution ratio
    return 0.5;
  }

  private calculateConditionalBranchCount(workflowRuns: any[]): number {
    // Would count conditional branches in workflows
    return 0;
  }

  private calculatePeakResourceUsage(workflowRuns: any[]): number {
    // Would calculate peak resource usage during workflow execution
    return 0;
  }

  private calculateResourceEfficiency(workflowRuns: any[]): number {
    // Would calculate resource efficiency score
    return 75;
  }

  private calculateCostPerExecution(workflowRuns: any[]): number {
    // Would calculate cost per workflow execution
    return 0;
  }

  private calculateSeasonality(metrics: any[]): Record<string, number> {
    // Would implement seasonal decomposition
    return {
      yearly: 0,
      quarterly: 0,
      monthly: 0,
      weekly: 0,
      daily: 0
    };
  }

  // Environmental feature calculations
  private async calculateSystemLoad(organizationId: string, timeRange: { start: Date; end: Date }): Promise<number> {
    // Would get from monitoring system
    return 50;
  }

  private async calculateConcurrentUsers(organizationId: string, timeRange: { start: Date; end: Date }): Promise<number> {
    // Would calculate from session data
    return 10;
  }

  private async calculateApiRequestVolume(organizationId: string, timeRange: { start: Date; end: Date }): Promise<number> {
    // Would get from API gateway metrics
    return 1000;
  }

  private async calculateAvailableResources(): Promise<number> {
    // Would get from infrastructure monitoring
    return 80;
  }

  private async calculateNetworkLatency(): Promise<number> {
    // Would get from network monitoring
    return 50;
  }

  private async calculateDatabasePerformance(organizationId: string, timeRange: { start: Date; end: Date }): Promise<number> {
    // Would get database performance metrics
    return 95;
  }

  private async calculateOrganizationSize(organizationId: string): Promise<number> {
    const userCount = await this.prisma.user.count({
      where: { organizationId }
    });
    return userCount;
  }

  private async calculateUserActivityLevel(organizationId: string, timeRange: { start: Date; end: Date }): Promise<number> {
    const activityCount = await this.prisma.auditLog.count({
      where: {
        organizationId,
        eventTimestamp: {
          gte: timeRange.start,
          lte: timeRange.end
        }
      }
    });
    return activityCount;
  }

  // Utility methods
  private isBusinessHours(date: Date): boolean {
    const hour = date.getHours();
    const day = date.getDay();
    return day >= 1 && day <= 5 && hour >= 9 && hour <= 17;
  }

  private isWeekend(date: Date): boolean {
    const day = date.getDay();
    return day === 0 || day === 6;
  }

  private async isHoliday(date: Date): Promise<boolean> {
    // Would check against holiday API or database
    return false;
  }

  private getWeekOfYear(date: Date): number {
    const firstDay = new Date(date.getFullYear(), 0, 1);
    const days = Math.floor((date.getTime() - firstDay.getTime()) / (24 * 60 * 60 * 1000));
    return Math.ceil((days + firstDay.getDay() + 1) / 7);
  }

  private countFeatures(features: FeatureSet): number {
    return Object.keys(features.agentPerformanceFeatures).length +
           Object.keys(features.workflowFeatures).length +
           Object.keys(features.timeSeriesFeatures).length +
           Object.keys(features.environmentalFeatures).length;
  }

  private getEmptyTimeSeriesFeatures(): TimeSeriesFeatures {
    return {
      performanceTrend: 0,
      volatility: 0,
      seasonality: {},
      mean: 0,
      median: 0,
      standardDeviation: 0,
      skewness: 0,
      kurtosis: 0,
      hourlyPatterns: Array(24).fill(0),
      dailyPatterns: Array(7).fill(0),
      weeklyPatterns: [],
      monthlyPatterns: Array(12).fill(0),
      changePoints: [],
      lag1: 0,
      lag7: 0,
      lag30: 0,
      movingAverage7: 0,
      movingAverage30: 0
    };
  }

  // Data fetching methods
  private async getPerformanceMetrics(agentId: string, timeRange: { start: Date; end: Date }) {
    return this.prisma.performanceMetric.findMany({
      where: {
        agentId,
        timestamp: {
          gte: timeRange.start,
          lte: timeRange.end
        }
      },
      orderBy: { timestamp: 'asc' }
    });
  }

  private async getWorkflowRuns(agentId: string, timeRange: { start: Date; end: Date }) {
    return this.prisma.workflowRun.findMany({
      where: {
        startedAt: {
          gte: timeRange.start,
          lte: timeRange.end
        }
      },
      include: {
        executions: true,
        workflow: true
      }
    });
  }

  private async getAuditLogs(agentId: string, timeRange: { start: Date; end: Date }) {
    return this.prisma.auditLog.findMany({
      where: {
        eventTimestamp: {
          gte: timeRange.start,
          lte: timeRange.end
        },
        metadata: {
          path: ['agentId'],
          equals: agentId
        }
      }
    });
  }

  private async getAgent(agentId: string) {
    return this.prisma.agent.findUnique({
      where: { id: agentId }
    });
  }

  private async getOrganization(organizationId: string) {
    return this.prisma.organization.findUnique({
      where: { id: organizationId }
    });
  }

  private async getWorkflowRunsForWorkflow(workflowId: string, timeRange: { start: Date; end: Date }) {
    return this.prisma.workflowRun.findMany({
      where: {
        workflowId,
        startedAt: {
          gte: timeRange.start,
          lte: timeRange.end
        }
      },
      include: {
        executions: true
      }
    });
  }

  private async getWorkflowPerformanceMetrics(workflowId: string, timeRange: { start: Date; end: Date }) {
    return this.prisma.performanceMetric.findMany({
      where: {
        workflowId,
        timestamp: {
          gte: timeRange.start,
          lte: timeRange.end
        }
      },
      orderBy: { timestamp: 'asc' }
    });
  }

  private async getWorkflow(workflowId: string) {
    return this.prisma.workflow.findUnique({
      where: { id: workflowId },
      include: {
        steps: true
      }
    });
  }

  /**
   * Clear feature cache
   */
  clearCache(): void {
    this.featureCache.clear();
    this.emit('cacheCleared');
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return {
      size: this.featureCache.size,
      entries: Array.from(this.featureCache.keys())
    };
  }
}

export default FeatureEngineering;