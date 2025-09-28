import { EventEmitter } from 'events';
import { PrismaClient } from '@prisma/client';
import { logger } from '../lib/logger.js';

export interface WorkflowMetrics {
  workflowId: string;
  executionId: string;
  agentId: string;
  startTime: number;
  endTime: number;
  duration: number;
  status: 'success' | 'failure' | 'timeout' | 'cancelled';
  stepsExecuted: number;
  resourcesUsed: {
    cpu: number;
    memory: number;
    io: number;
    network: number;
  };
  errorMessage?: string;
  metadata?: Record<string, any>;
}

export interface PerformanceFeatures {
  // Temporal features
  hourOfDay: number;
  dayOfWeek: number;
  monthOfYear: number;

  // Workflow characteristics
  workflowComplexity: number;
  stepCount: number;
  avgStepDuration: number;
  parallelismFactor: number;

  // Resource utilization
  cpuUtilization: number;
  memoryUtilization: number;
  ioThroughput: number;
  networkLatency: number;

  // Historical patterns
  avgExecutionTime: number;
  successRate: number;
  recentErrorRate: number;
  queueingDelay: number;

  // Agent performance
  agentLoadFactor: number;
  agentResponseTime: number;
  agentThroughput: number;
  agentErrorRate: number;
}

export interface PerformanceAnomaly {
  id: string;
  workflowId: string;
  executionId: string;
  timestamp: number;
  type: 'latency' | 'throughput' | 'error_rate' | 'resource_usage' | 'queue_buildup';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  metrics: Partial<WorkflowMetrics>;
  expectedValue: number;
  actualValue: number;
  deviationScore: number;
  confidence: number;
}

export interface OptimizationRecommendation {
  id: string;
  workflowId: string;
  category: 'scaling' | 'resource_allocation' | 'caching' | 'parallelization' | 'agent_optimization';
  priority: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  expectedImpact: {
    performanceGain: number; // Percentage improvement
    costImplication: number; // Cost change estimate
    riskLevel: 'low' | 'medium' | 'high';
  };
  implementation: {
    effort: 'low' | 'medium' | 'high';
    timeframe: 'immediate' | 'short_term' | 'long_term';
    dependencies: string[];
    steps: string[];
  };
  confidence: number;
  basedOnMetrics: string[];
  timestamp: number;
}

export interface MLModelConfig {
  anomalyDetection: {
    enabled: boolean;
    algorithm: 'isolation_forest' | 'one_class_svm' | 'gaussian_mixture';
    contamination: number;
    windowSize: number;
    minSamples: number;
  };
  performancePrediction: {
    enabled: boolean;
    model: 'linear_regression' | 'random_forest' | 'gradient_boosting' | 'neural_network';
    features: string[];
    trainingWindow: number;
    retrainInterval: number;
  };
  clustering: {
    enabled: boolean;
    algorithm: 'kmeans' | 'dbscan' | 'hierarchical';
    clusters: number;
    features: string[];
  };
  optimization: {
    enabled: boolean;
    objectives: ('latency' | 'throughput' | 'cost' | 'reliability')[];
    constraints: Record<string, number>;
  };
}

export class MLWorkflowAnalyzer extends EventEmitter {
  private prisma: PrismaClient;
  private config: MLModelConfig;
  private models: Map<string, any> = new Map();
  private isTraining: boolean = false;
  private lastTrainingTime: number = 0;
  private performanceHistory: Map<string, WorkflowMetrics[]> = new Map();
  private anomalies: Map<string, PerformanceAnomaly[]> = new Map();
  private recommendations: Map<string, OptimizationRecommendation[]> = new Map();

  private readonly DEFAULT_CONFIG: MLModelConfig = {
    anomalyDetection: {
      enabled: true,
      algorithm: 'isolation_forest',
      contamination: 0.1,
      windowSize: 100,
      minSamples: 50
    },
    performancePrediction: {
      enabled: true,
      model: 'random_forest',
      features: [
        'hourOfDay', 'dayOfWeek', 'workflowComplexity', 'stepCount',
        'cpuUtilization', 'memoryUtilization', 'agentLoadFactor'
      ],
      trainingWindow: 7 * 24 * 60 * 60 * 1000, // 7 days
      retrainInterval: 24 * 60 * 60 * 1000 // 24 hours
    },
    clustering: {
      enabled: true,
      algorithm: 'kmeans',
      clusters: 5,
      features: ['workflowComplexity', 'avgExecutionTime', 'resourcesUsed']
    },
    optimization: {
      enabled: true,
      objectives: ['latency', 'throughput', 'cost'],
      constraints: {
        maxCost: 1000,
        minReliability: 0.99,
        maxLatency: 5000
      }
    }
  };

  constructor(prisma?: PrismaClient, config?: Partial<MLModelConfig>) {
    super();
    this.prisma = prisma || new PrismaClient();
    this.config = { ...this.DEFAULT_CONFIG, ...config };
    this.initializeAnalyzer();
  }

  private async initializeAnalyzer(): Promise<void> {
    try {
      // Load historical data
      await this.loadHistoricalMetrics();

      // Initialize ML models
      await this.initializeModels();

      // Start periodic analysis
      this.startPeriodicAnalysis();

      logger.info('ML Workflow Analyzer initialized', {
        modelsEnabled: Object.keys(this.config).filter(k => this.config[k as keyof MLModelConfig].enabled),
        historicalDataPoints: Array.from(this.performanceHistory.values())
          .reduce((sum, metrics) => sum + metrics.length, 0)
      });
    } catch (error) {
      logger.error('Failed to initialize ML Workflow Analyzer', { error });
      throw error;
    }
  }

  private async loadHistoricalMetrics(): Promise<void> {
    try {
      // Load workflow execution metrics from database
      const oneWeekAgo = new Date(Date.now() - (7 * 24 * 60 * 60 * 1000));

      const executions = await this.prisma.workflowExecution.findMany({
        where: {
          createdAt: {
            gte: oneWeekAgo
          }
        },
        orderBy: {
          startTime: 'desc'
        }
      });

      for (const execution of executions) {
        const metrics: WorkflowMetrics = {
          workflowId: execution.workflowId,
          executionId: execution.executionId,
          agentId: execution.agentId,
          startTime: Number(execution.startTime),
          endTime: Number(execution.endTime),
          duration: execution.duration,
          status: execution.status as 'success' | 'failure' | 'timeout' | 'cancelled',
          stepsExecuted: execution.stepsExecuted,
          resourcesUsed: {
            cpu: execution.cpuUsage,
            memory: execution.memoryUsage,
            io: execution.ioOperations,
            network: execution.networkUsage
          },
          errorMessage: execution.errorMessage || undefined,
          metadata: execution.metadata as Record<string, any> || {}
        };

        if (!this.performanceHistory.has(metrics.workflowId)) {
          this.performanceHistory.set(metrics.workflowId, []);
        }
        this.performanceHistory.get(metrics.workflowId)!.push(metrics);
      }

      logger.info('Historical metrics loaded', {
        totalExecutions: executions.length,
        uniqueWorkflows: this.performanceHistory.size
      });
    } catch (error) {
      logger.error('Failed to load historical metrics', { error });
    }
  }

  private async initializeModels(): Promise<void> {
    try {
      // Initialize Python-based ML models using subprocess
      // This would typically use a dedicated ML service or library
      // For now, we'll simulate with TypeScript-based statistical models

      if (this.config.anomalyDetection.enabled) {
        await this.initializeAnomalyDetectionModel();
      }

      if (this.config.performancePrediction.enabled) {
        await this.initializePerformancePredictionModel();
      }

      if (this.config.clustering.enabled) {
        await this.initializeClusteringModel();
      }

      logger.info('ML models initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize ML models', { error });
    }
  }

  private async initializeAnomalyDetectionModel(): Promise<void> {
    // Simplified anomaly detection using statistical methods
    // In production, this would use sklearn IsolationForest or similar
    const model = {
      name: 'isolation_forest',
      algorithm: this.config.anomalyDetection.algorithm,
      contamination: this.config.anomalyDetection.contamination,
      windowSize: this.config.anomalyDetection.windowSize,
      thresholds: new Map<string, { mean: number; std: number }>()
    };

    // Calculate statistical thresholds for each workflow
    for (const [workflowId, metrics] of this.performanceHistory.entries()) {
      if (metrics.length >= this.config.anomalyDetection.minSamples) {
        const durations = metrics.map(m => m.duration);
        const throughputs = metrics.map(m => m.throughput);
        const errorRates = metrics.map(m => m.errorCount / m.stepsExecuted || 0);

        model.thresholds.set(workflowId, {
          mean: this.calculateMean(durations),
          std: this.calculateStandardDeviation(durations)
        });
      }
    }

    this.models.set('anomaly_detector', model);
    logger.info('Anomaly detection model initialized', {
      algorithm: model.algorithm,
      workflowsWithThresholds: model.thresholds.size
    });
  }

  private async initializePerformancePredictionModel(): Promise<void> {
    // Simplified performance prediction using historical averages and trends
    // In production, this would use RandomForest or GradientBoosting
    const model = {
      name: 'performance_predictor',
      algorithm: this.config.performancePrediction.model,
      features: this.config.performancePrediction.features,
      predictions: new Map<string, { duration: number; throughput: number; confidence: number }>()
    };

    // Build simple prediction models for each workflow
    for (const [workflowId, metrics] of this.performanceHistory.entries()) {
      if (metrics.length >= 10) {
        const recentMetrics = metrics.slice(-50); // Last 50 executions
        const features = recentMetrics.map(m => this.extractFeatures(m));

        // Simple linear trend analysis
        const avgDuration = this.calculateMean(recentMetrics.map(m => m.duration));
        const avgThroughput = this.calculateMean(recentMetrics.map(m => m.throughput));

        model.predictions.set(workflowId, {
          duration: avgDuration,
          throughput: avgThroughput,
          confidence: Math.min(0.95, recentMetrics.length / 100)
        });
      }
    }

    this.models.set('performance_predictor', model);
    logger.info('Performance prediction model initialized', {
      algorithm: model.algorithm,
      workflowsWithPredictions: model.predictions.size
    });
  }

  private async initializeClusteringModel(): Promise<void> {
    // Simplified clustering using k-means-like grouping
    const model = {
      name: 'workflow_clusterer',
      algorithm: this.config.clustering.algorithm,
      clusters: this.config.clustering.clusters,
      clusterAssignments: new Map<string, number>(),
      clusterCentroids: [] as Array<{ complexity: number; duration: number; resources: number }>
    };

    const allMetrics = Array.from(this.performanceHistory.values()).flat();
    if (allMetrics.length >= this.config.clustering.clusters) {
      // Simple clustering based on complexity, duration, and resource usage
      const features = allMetrics.map(m => ({
        workflowId: m.workflowId,
        complexity: m.stepsExecuted,
        duration: m.duration,
        resources: (m.resourcesUsed.cpu + m.resourcesUsed.memory) / 2
      }));

      // Simplified k-means clustering
      const clusters = this.performKMeansClustering(features, this.config.clustering.clusters);

      clusters.assignments.forEach((cluster, index) => {
        model.clusterAssignments.set(features[index].workflowId, cluster);
      });

      model.clusterCentroids = clusters.centroids;
    }

    this.models.set('workflow_clusterer', model);
    logger.info('Clustering model initialized', {
      algorithm: model.algorithm,
      clusters: model.clusters,
      assignedWorkflows: model.clusterAssignments.size
    });
  }

  public async analyzeWorkflowMetrics(metrics: WorkflowMetrics): Promise<void> {
    try {
      // Store metrics in history
      if (!this.performanceHistory.has(metrics.workflowId)) {
        this.performanceHistory.set(metrics.workflowId, []);
      }
      this.performanceHistory.get(metrics.workflowId)!.push(metrics);

      // Perform real-time analysis
      await Promise.all([
        this.detectAnomalies(metrics),
        this.updatePerformanceModels(metrics),
        this.generateOptimizationRecommendations(metrics)
      ]);

      // Persist to database
      await this.persistMetrics(metrics);

      this.emit('metricsAnalyzed', { metrics, workflowId: metrics.workflowId });
    } catch (error) {
      logger.error('Failed to analyze workflow metrics', { error, workflowId: metrics.workflowId });
    }
  }

  private async detectAnomalies(metrics: WorkflowMetrics): Promise<void> {
    const anomalyDetector = this.models.get('anomaly_detector');
    if (!anomalyDetector) return;

    const workflowHistory = this.performanceHistory.get(metrics.workflowId) || [];
    if (workflowHistory.length < this.config.anomalyDetection.minSamples) return;

    const threshold = anomalyDetector.thresholds.get(metrics.workflowId);
    if (!threshold) return;

    // Check for duration anomalies
    const durationZScore = Math.abs((metrics.duration - threshold.mean) / threshold.std);
    if (durationZScore > 2.5) { // 2.5 sigma threshold
      const anomaly: PerformanceAnomaly = {
        id: `anomaly_${metrics.executionId}_duration`,
        workflowId: metrics.workflowId,
        executionId: metrics.executionId,
        timestamp: Date.now(),
        type: 'latency',
        severity: durationZScore > 3 ? 'critical' : 'high',
        description: `Execution duration ${metrics.duration}ms significantly exceeds normal range (expected: ${threshold.mean.toFixed(0)}±${threshold.std.toFixed(0)}ms)`,
        metrics,
        expectedValue: threshold.mean,
        actualValue: metrics.duration,
        deviationScore: durationZScore,
        confidence: Math.min(0.95, durationZScore / 4)
      };

      if (!this.anomalies.has(metrics.workflowId)) {
        this.anomalies.set(metrics.workflowId, []);
      }
      this.anomalies.get(metrics.workflowId)!.push(anomaly);

      logger.warn('Performance anomaly detected', anomaly);
      this.emit('anomalyDetected', anomaly);
    }

    // Check for error rate anomalies
    const errorRate = metrics.errorCount / metrics.stepsExecuted;
    const recentExecutions = workflowHistory.slice(-20);
    const avgErrorRate = this.calculateMean(recentExecutions.map(m => m.errorCount / m.stepsExecuted || 0));

    if (errorRate > avgErrorRate * 2 && errorRate > 0.1) {
      const anomaly: PerformanceAnomaly = {
        id: `anomaly_${metrics.executionId}_errors`,
        workflowId: metrics.workflowId,
        executionId: metrics.executionId,
        timestamp: Date.now(),
        type: 'error_rate',
        severity: errorRate > 0.5 ? 'critical' : 'high',
        description: `Error rate ${(errorRate * 100).toFixed(1)}% significantly exceeds normal range (expected: ${(avgErrorRate * 100).toFixed(1)}%)`,
        metrics,
        expectedValue: avgErrorRate,
        actualValue: errorRate,
        deviationScore: errorRate / avgErrorRate,
        confidence: 0.85
      };

      if (!this.anomalies.has(metrics.workflowId)) {
        this.anomalies.set(metrics.workflowId, []);
      }
      this.anomalies.get(metrics.workflowId)!.push(anomaly);

      logger.warn('Error rate anomaly detected', anomaly);
      this.emit('anomalyDetected', anomaly);
    }
  }

  private async updatePerformanceModels(metrics: WorkflowMetrics): Promise<void> {
    // Update models with new data point
    const features = this.extractFeatures(metrics);

    // Update prediction model
    const predictor = this.models.get('performance_predictor');
    if (predictor) {
      const workflowHistory = this.performanceHistory.get(metrics.workflowId) || [];
      if (workflowHistory.length >= 10) {
        const recentMetrics = workflowHistory.slice(-30);
        const avgDuration = this.calculateMean(recentMetrics.map(m => m.duration));
        const avgThroughput = this.calculateMean(recentMetrics.map(m => m.throughput));

        predictor.predictions.set(metrics.workflowId, {
          duration: avgDuration,
          throughput: avgThroughput,
          confidence: Math.min(0.95, recentMetrics.length / 50)
        });
      }
    }

    // Update clustering if needed
    const clusterer = this.models.get('workflow_clusterer');
    if (clusterer && !clusterer.clusterAssignments.has(metrics.workflowId)) {
      // Assign new workflow to nearest cluster
      const features = {
        complexity: metrics.stepsExecuted,
        duration: metrics.duration,
        resources: (metrics.resourcesUsed.cpu + metrics.resourcesUsed.memory) / 2
      };

      let nearestCluster = 0;
      let minDistance = Infinity;

      clusterer.clusterCentroids.forEach((centroid, index) => {
        const distance = Math.sqrt(
          Math.pow(features.complexity - centroid.complexity, 2) +
          Math.pow(features.duration - centroid.duration, 2) +
          Math.pow(features.resources - centroid.resources, 2)
        );
        if (distance < minDistance) {
          minDistance = distance;
          nearestCluster = index;
        }
      });

      clusterer.clusterAssignments.set(metrics.workflowId, nearestCluster);
    }
  }

  private async generateOptimizationRecommendations(metrics: WorkflowMetrics): Promise<void> {
    const recommendations: OptimizationRecommendation[] = [];
    const workflowHistory = this.performanceHistory.get(metrics.workflowId) || [];

    if (workflowHistory.length < 10) return; // Need sufficient history

    // Analyze performance trends
    const recentMetrics = workflowHistory.slice(-20);
    const avgDuration = this.calculateMean(recentMetrics.map(m => m.duration));
    const avgThroughput = this.calculateMean(recentMetrics.map(m => m.throughput));
    const avgCpuUsage = this.calculateMean(recentMetrics.map(m => m.resourcesUsed.cpu));
    const avgMemoryUsage = this.calculateMean(recentMetrics.map(m => m.resourcesUsed.memory));

    // Recommendation 1: Resource scaling
    if (avgCpuUsage > 80 || avgMemoryUsage > 80) {
      recommendations.push({
        id: `rec_${metrics.workflowId}_scaling_${Date.now()}`,
        workflowId: metrics.workflowId,
        category: 'scaling',
        priority: avgCpuUsage > 90 || avgMemoryUsage > 90 ? 'high' : 'medium',
        title: 'Scale up resources for improved performance',
        description: `High resource utilization detected (CPU: ${avgCpuUsage.toFixed(1)}%, Memory: ${avgMemoryUsage.toFixed(1)}%). Consider increasing resource allocation or horizontal scaling.`,
        expectedImpact: {
          performanceGain: Math.min(50, (avgCpuUsage - 70) * 2),
          costImplication: 25, // 25% cost increase estimate
          riskLevel: 'low'
        },
        implementation: {
          effort: 'low',
          timeframe: 'immediate',
          dependencies: ['infrastructure_team'],
          steps: [
            'Analyze current resource bottlenecks',
            'Increase CPU/memory allocation by 50%',
            'Monitor performance improvement',
            'Adjust scaling policies'
          ]
        },
        confidence: 0.85,
        basedOnMetrics: ['cpu_utilization', 'memory_utilization', 'execution_duration'],
        timestamp: Date.now()
      });
    }

    // Recommendation 2: Caching optimization
    const errorRate = this.calculateMean(recentMetrics.map(m => m.errorCount / m.stepsExecuted || 0));
    if (avgDuration > 5000 && metrics.stepsExecuted > 10) {
      recommendations.push({
        id: `rec_${metrics.workflowId}_caching_${Date.now()}`,
        workflowId: metrics.workflowId,
        category: 'caching',
        priority: 'medium',
        title: 'Implement intelligent caching for workflow steps',
        description: `Workflow has high latency (${avgDuration.toFixed(0)}ms) with multiple steps. Implementing caching could reduce redundant computations.`,
        expectedImpact: {
          performanceGain: 30,
          costImplication: 10,
          riskLevel: 'low'
        },
        implementation: {
          effort: 'medium',
          timeframe: 'short_term',
          dependencies: ['caching_service'],
          steps: [
            'Identify cacheable workflow steps',
            'Implement cache layer with TTL policies',
            'Add cache warming strategies',
            'Monitor cache hit rates'
          ]
        },
        confidence: 0.75,
        basedOnMetrics: ['execution_duration', 'step_count'],
        timestamp: Date.now()
      });
    }

    // Recommendation 3: Parallelization
    if (metrics.stepsExecuted > 5 && avgDuration > 3000) {
      const parallelizationOpportunity = this.analyzeParallelizationOpportunity(recentMetrics);
      if (parallelizationOpportunity > 0.3) {
        recommendations.push({
          id: `rec_${metrics.workflowId}_parallel_${Date.now()}`,
          workflowId: metrics.workflowId,
          category: 'parallelization',
          priority: 'high',
          title: 'Optimize workflow parallelization',
          description: `Workflow shows high parallelization potential (${(parallelizationOpportunity * 100).toFixed(0)}%). Consider breaking down sequential steps into parallel execution paths.`,
          expectedImpact: {
            performanceGain: parallelizationOpportunity * 60,
            costImplication: 15,
            riskLevel: 'medium'
          },
          implementation: {
            effort: 'high',
            timeframe: 'long_term',
            dependencies: ['workflow_engine', 'orchestration_service'],
            steps: [
              'Analyze step dependencies',
              'Identify parallelizable step groups',
              'Implement parallel execution framework',
              'Test and validate parallel workflows'
            ]
          },
          confidence: 0.70,
          basedOnMetrics: ['step_count', 'execution_duration', 'parallelism_factor'],
          timestamp: Date.now()
        });
      }
    }

    // Store recommendations
    if (recommendations.length > 0) {
      if (!this.recommendations.has(metrics.workflowId)) {
        this.recommendations.set(metrics.workflowId, []);
      }
      this.recommendations.get(metrics.workflowId)!.push(...recommendations);

      // Keep only recent recommendations (last 50)
      const allRecs = this.recommendations.get(metrics.workflowId)!;
      if (allRecs.length > 50) {
        this.recommendations.set(metrics.workflowId, allRecs.slice(-50));
      }

      logger.info('Generated optimization recommendations', {
        workflowId: metrics.workflowId,
        recommendations: recommendations.length
      });

      this.emit('recommendationsGenerated', { workflowId: metrics.workflowId, recommendations });
    }
  }

  private extractFeatures(metrics: WorkflowMetrics): PerformanceFeatures {
    const date = new Date(metrics.startTime);
    const workflowHistory = this.performanceHistory.get(metrics.workflowId) || [];
    const recentHistory = workflowHistory.slice(-20);

    return {
      // Temporal features
      hourOfDay: date.getHours(),
      dayOfWeek: date.getDay(),
      monthOfYear: date.getMonth(),

      // Workflow characteristics
      workflowComplexity: metrics.stepsExecuted * (1 + metrics.errorCount * 0.1),
      stepCount: metrics.stepsExecuted,
      avgStepDuration: metrics.duration / metrics.stepsExecuted,
      parallelismFactor: this.estimateParallelismFactor(metrics),

      // Resource utilization
      cpuUtilization: metrics.resourcesUsed.cpu,
      memoryUtilization: metrics.resourcesUsed.memory,
      ioThroughput: metrics.resourcesUsed.io,
      networkLatency: metrics.resourcesUsed.network,

      // Historical patterns
      avgExecutionTime: recentHistory.length > 0 ?
        this.calculateMean(recentHistory.map(m => m.duration)) : metrics.duration,
      successRate: recentHistory.length > 0 ?
        recentHistory.filter(m => m.status === 'success').length / recentHistory.length : 1,
      recentErrorRate: recentHistory.length > 0 ?
        this.calculateMean(recentHistory.map(m => m.errorCount / m.stepsExecuted || 0)) : 0,
      queueingDelay: metrics.queueTime,

      // Agent performance
      agentLoadFactor: this.calculateAgentLoadFactor(metrics.agentId),
      agentResponseTime: metrics.latency,
      agentThroughput: metrics.throughput,
      agentErrorRate: metrics.errorCount / metrics.stepsExecuted || 0
    };
  }

  // Utility methods for statistical calculations
  private calculateMean(values: number[]): number {
    return values.length > 0 ? values.reduce((sum, val) => sum + val, 0) / values.length : 0;
  }

  private calculateStandardDeviation(values: number[]): number {
    const mean = this.calculateMean(values);
    const squaredDiffs = values.map(val => Math.pow(val - mean, 2));
    return Math.sqrt(this.calculateMean(squaredDiffs));
  }

  private performKMeansClustering(features: any[], k: number): { assignments: number[]; centroids: any[] } {
    // Simplified k-means implementation
    const assignments = new Array(features.length).fill(0);
    const centroids = [];

    // Initialize centroids randomly
    for (let i = 0; i < k; i++) {
      const randomIndex = Math.floor(Math.random() * features.length);
      centroids.push({ ...features[randomIndex] });
    }

    // Perform clustering iterations (simplified)
    for (let iter = 0; iter < 10; iter++) {
      // Assign points to nearest centroids
      for (let i = 0; i < features.length; i++) {
        let minDistance = Infinity;
        let nearestCluster = 0;

        for (let j = 0; j < k; j++) {
          const distance = this.calculateEuclideanDistance(features[i], centroids[j]);
          if (distance < minDistance) {
            minDistance = distance;
            nearestCluster = j;
          }
        }
        assignments[i] = nearestCluster;
      }

      // Update centroids
      for (let j = 0; j < k; j++) {
        const clusterPoints = features.filter((_, i) => assignments[i] === j);
        if (clusterPoints.length > 0) {
          centroids[j] = {
            complexity: this.calculateMean(clusterPoints.map(p => p.complexity)),
            duration: this.calculateMean(clusterPoints.map(p => p.duration)),
            resources: this.calculateMean(clusterPoints.map(p => p.resources))
          };
        }
      }
    }

    return { assignments, centroids };
  }

  private calculateEuclideanDistance(point1: any, point2: any): number {
    return Math.sqrt(
      Math.pow(point1.complexity - point2.complexity, 2) +
      Math.pow(point1.duration - point2.duration, 2) +
      Math.pow(point1.resources - point2.resources, 2)
    );
  }

  private estimateParallelismFactor(metrics: WorkflowMetrics): number {
    // Estimate based on resource utilization patterns
    const cpuEfficiency = Math.min(1, metrics.resourcesUsed.cpu / 100);
    const ioWaitRatio = metrics.resourcesUsed.io / (metrics.resourcesUsed.cpu + metrics.resourcesUsed.io || 1);
    return Math.max(0.1, cpuEfficiency * (1 - ioWaitRatio));
  }

  private calculateAgentLoadFactor(agentId: string): number {
    // Calculate load based on recent agent activity
    const allMetrics = Array.from(this.performanceHistory.values()).flat();
    const agentMetrics = allMetrics.filter(m => m.agentId === agentId);
    const recentAgentMetrics = agentMetrics.slice(-10);

    if (recentAgentMetrics.length === 0) return 0.5;

    const avgCpuUsage = this.calculateMean(recentAgentMetrics.map(m => m.resourcesUsed.cpu));
    return Math.min(1, avgCpuUsage / 100);
  }

  private analyzeParallelizationOpportunity(metrics: WorkflowMetrics[]): number {
    // Analyze patterns to estimate parallelization potential
    const avgStepsPerWorkflow = this.calculateMean(metrics.map(m => m.stepsExecuted));
    const avgDurationPerStep = this.calculateMean(metrics.map(m => m.duration / m.stepsExecuted));
    const avgCpuUtilization = this.calculateMean(metrics.map(m => m.resourcesUsed.cpu));

    // Higher potential if many steps, reasonable CPU usage, and not already highly parallel
    const stepsFactor = Math.min(1, avgStepsPerWorkflow / 10);
    const cpuFactor = avgCpuUtilization < 80 ? 1 : 0.5;
    const durationFactor = avgDurationPerStep > 1000 ? 1 : 0.7;

    return stepsFactor * cpuFactor * durationFactor;
  }

  private async persistMetrics(metrics: WorkflowMetrics): Promise<void> {
    try {
      await this.prisma.workflowExecution.upsert({
        where: { executionId: metrics.executionId },
        update: {
          endTime: BigInt(metrics.endTime),
          duration: metrics.duration,
          status: metrics.status,
          metadata: metrics.metadata || {}
        },
        create: {
          workflowId: metrics.workflowId,
          executionId: metrics.executionId,
          agentId: metrics.agentId,
          startTime: BigInt(metrics.startTime),
          endTime: BigInt(metrics.endTime),
          duration: metrics.duration,
          status: metrics.status,
          stepsExecuted: metrics.stepsExecuted,
          cpuUsage: metrics.resourcesUsed.cpu,
          memoryUsage: metrics.resourcesUsed.memory,
          ioOperations: metrics.resourcesUsed.io,
          networkUsage: metrics.resourcesUsed.network,
          errorMessage: metrics.errorMessage,
          metadata: metrics.metadata || {}
        }
      });
    } catch (error) {
      logger.error('Failed to persist workflow metrics', { error, executionId: metrics.executionId });
    }
  }

  private startPeriodicAnalysis(): void {
    // Retrain models periodically
    setInterval(async () => {
      if (!this.isTraining && Date.now() - this.lastTrainingTime > this.config.performancePrediction.retrainInterval) {
        await this.retrainModels();
      }
    }, 60000); // Check every minute

    // Clean up old data
    setInterval(() => {
      this.cleanupOldData();
    }, 3600000); // Clean up every hour
  }

  private async retrainModels(): Promise<void> {
    if (this.isTraining) return;

    this.isTraining = true;
    this.lastTrainingTime = Date.now();

    try {
      logger.info('Starting ML model retraining');

      // Reload recent data
      await this.loadHistoricalMetrics();

      // Reinitialize models with updated data
      await this.initializeModels();

      logger.info('ML model retraining completed successfully');
      this.emit('modelsRetrained', { timestamp: Date.now() });
    } catch (error) {
      logger.error('Failed to retrain ML models', { error });
    } finally {
      this.isTraining = false;
    }
  }

  private cleanupOldData(): void {
    const cutoffTime = Date.now() - (7 * 24 * 60 * 60 * 1000); // 7 days ago

    for (const [workflowId, metrics] of this.performanceHistory.entries()) {
      const filteredMetrics = metrics.filter(m => m.startTime > cutoffTime);
      this.performanceHistory.set(workflowId, filteredMetrics);
    }

    for (const [workflowId, anomalies] of this.anomalies.entries()) {
      const filteredAnomalies = anomalies.filter(a => a.timestamp > cutoffTime);
      this.anomalies.set(workflowId, filteredAnomalies);
    }

    for (const [workflowId, recommendations] of this.recommendations.entries()) {
      const filteredRecommendations = recommendations.filter(r => r.timestamp > cutoffTime);
      this.recommendations.set(workflowId, filteredRecommendations);
    }
  }

  // Public API methods
  public async getWorkflowAnalysis(workflowId: string): Promise<any> {
    const history = this.performanceHistory.get(workflowId) || [];
    const anomalies = this.anomalies.get(workflowId) || [];
    const recommendations = this.recommendations.get(workflowId) || [];

    const predictor = this.models.get('performance_predictor');
    const prediction = predictor?.predictions.get(workflowId) || null;

    const clusterer = this.models.get('workflow_clusterer');
    const cluster = clusterer?.clusterAssignments.get(workflowId) || null;

    return {
      workflowId,
      analysis: {
        totalExecutions: history.length,
        averageDuration: this.calculateMean(history.map(m => m.duration)),
        successRate: history.length > 0 ?
          history.filter(m => m.status === 'success').length / history.length : 0,
        averageThroughput: this.calculateMean(history.map(m => m.throughput)),
        recentAnomalies: anomalies.slice(-10),
        activeRecommendations: recommendations.filter(r => r.timestamp > Date.now() - 86400000), // Last 24h
        prediction,
        cluster
      },
      trends: {
        durationTrend: this.calculateTrend(history.slice(-20).map(m => m.duration)),
        throughputTrend: this.calculateTrend(history.slice(-20).map(m => m.throughput)),
        errorRateTrend: this.calculateTrend(history.slice(-20).map(m => m.errorCount / m.stepsExecuted || 0))
      },
      timestamp: Date.now()
    };
  }

  public async getAllWorkflowsAnalysis(): Promise<any> {
    const workflowIds = Array.from(this.performanceHistory.keys());
    const analyses = await Promise.all(
      workflowIds.map(id => this.getWorkflowAnalysis(id))
    );

    const totalExecutions = Array.from(this.performanceHistory.values())
      .reduce((sum, metrics) => sum + metrics.length, 0);

    const totalAnomalies = Array.from(this.anomalies.values())
      .reduce((sum, anomalies) => sum + anomalies.length, 0);

    const totalRecommendations = Array.from(this.recommendations.values())
      .reduce((sum, recommendations) => sum + recommendations.length, 0);

    return {
      overview: {
        totalWorkflows: workflowIds.length,
        totalExecutions,
        totalAnomalies,
        totalRecommendations,
        modelsActive: Array.from(this.models.keys()),
        lastTrainingTime: this.lastTrainingTime
      },
      workflows: analyses,
      timestamp: Date.now()
    };
  }

  private calculateTrend(values: number[]): 'increasing' | 'decreasing' | 'stable' {
    if (values.length < 2) return 'stable';

    const firstHalf = values.slice(0, Math.floor(values.length / 2));
    const secondHalf = values.slice(Math.floor(values.length / 2));

    const firstHalfAvg = this.calculateMean(firstHalf);
    const secondHalfAvg = this.calculateMean(secondHalf);

    const changeRatio = Math.abs((secondHalfAvg - firstHalfAvg) / firstHalfAvg);

    if (changeRatio < 0.1) return 'stable';
    return secondHalfAvg > firstHalfAvg ? 'increasing' : 'decreasing';
  }

  // Additional public API methods for the REST interface
  public async recordWorkflowExecution(metrics: WorkflowMetrics): Promise<void> {
    await this.analyzeWorkflowMetrics(metrics);
    await this.persistMetrics(metrics);
  }

  public async analyzeWorkflowPerformance(workflowId: string, timeWindow: string = '24h'): Promise<any> {
    return await this.getWorkflowAnalysis(workflowId);
  }

  public async detectAnomalies(timeWindow: string = '24h', threshold: number = 2.0): Promise<any[]> {
    const cutoffTime = this.parseTimeWindow(timeWindow);
    const allAnomalies: any[] = [];

    for (const [workflowId, anomalies] of this.anomalies.entries()) {
      const recentAnomalies = anomalies
        .filter(a => a.timestamp > cutoffTime)
        .map(a => ({ ...a, workflowId }));
      allAnomalies.push(...recentAnomalies);
    }

    return allAnomalies.sort((a, b) => b.timestamp - a.timestamp);
  }

  public async predictPerformance(workflowId: string, horizon: string = '1h'): Promise<any> {
    const predictor = this.models.get('performance_predictor');
    const prediction = predictor?.predictions.get(workflowId);

    if (!prediction) {
      return {
        prediction: null,
        confidence: 0,
        message: 'Insufficient data for prediction'
      };
    }

    return {
      workflowId,
      prediction,
      horizon,
      confidence: prediction.confidence || 0.8,
      timestamp: Date.now()
    };
  }

  public async clusterWorkflows(clusters: number = 3, timeWindow: string = '7d'): Promise<any> {
    const cutoffTime = this.parseTimeWindow(timeWindow);
    const clusterer = this.models.get('workflow_clusterer');

    if (!clusterer) {
      return {
        clusters: [],
        message: 'Clustering model not available'
      };
    }

    const clusterData: any = {
      clusters: [],
      totalWorkflows: 0,
      timestamp: Date.now()
    };

    // Group workflows by cluster
    const clusterGroups = new Map<number, any[]>();

    for (const [workflowId, clusterAssignment] of clusterer.clusterAssignments.entries()) {
      const metrics = this.performanceHistory.get(workflowId) || [];
      const recentMetrics = metrics.filter(m => m.startTime > cutoffTime);

      if (recentMetrics.length > 0) {
        if (!clusterGroups.has(clusterAssignment)) {
          clusterGroups.set(clusterAssignment, []);
        }

        clusterGroups.get(clusterAssignment)!.push({
          workflowId,
          metricsCount: recentMetrics.length,
          avgDuration: this.calculateMean(recentMetrics.map(m => m.duration)),
          successRate: recentMetrics.filter(m => m.status === 'success').length / recentMetrics.length
        });
      }
    }

    // Convert to output format
    for (const [clusterId, workflows] of clusterGroups.entries()) {
      clusterData.clusters.push({
        id: clusterId,
        workflowCount: workflows.length,
        avgDuration: this.calculateMean(workflows.map(w => w.avgDuration)),
        avgSuccessRate: this.calculateMean(workflows.map(w => w.successRate)),
        workflows: workflows.slice(0, 10) // Limit to top 10 workflows
      });
    }

    clusterData.totalWorkflows = Array.from(clusterGroups.values())
      .reduce((sum, workflows) => sum + workflows.length, 0);

    return clusterData;
  }

  public async generateOptimizationRecommendations(workflowId: string): Promise<any[]> {
    const recommendations = this.recommendations.get(workflowId) || [];
    const recentRecommendations = recommendations.filter(r =>
      r.timestamp > Date.now() - 86400000 // Last 24 hours
    );

    return recentRecommendations.map(rec => ({
      ...rec,
      workflowId
    }));
  }

  public async getPerformanceMetrics(timeWindow: string = '24h'): Promise<any> {
    const cutoffTime = this.parseTimeWindow(timeWindow);
    let totalExecutions = 0;
    let totalDuration = 0;
    let successCount = 0;

    for (const metrics of this.performanceHistory.values()) {
      const recentMetrics = metrics.filter(m => m.startTime > cutoffTime);
      totalExecutions += recentMetrics.length;
      totalDuration += recentMetrics.reduce((sum, m) => sum + m.duration, 0);
      successCount += recentMetrics.filter(m => m.status === 'success').length;
    }

    return {
      totalExecutions,
      avgDuration: totalExecutions > 0 ? totalDuration / totalExecutions : 0,
      successRate: totalExecutions > 0 ? successCount / totalExecutions : 0,
      timeWindow,
      timestamp: Date.now()
    };
  }

  private parseTimeWindow(timeWindow: string): number {
    const now = Date.now();
    const match = timeWindow.match(/^(\d+)([hdwm])$/);

    if (!match) return now - 86400000; // Default to 24 hours

    const value = parseInt(match[1]);
    const unit = match[2];

    const multipliers = {
      'h': 3600000,      // Hours
      'd': 86400000,     // Days
      'w': 604800000,    // Weeks
      'm': 2592000000    // Months (30 days)
    };

    return now - (value * (multipliers[unit as keyof typeof multipliers] || 86400000));
  }

  public destroy(): void {
    this.removeAllListeners();
    this.performanceHistory.clear();
    this.anomalies.clear();
    this.recommendations.clear();
    this.models.clear();
    logger.info('ML Workflow Analyzer destroyed');
  }
}

export default MLWorkflowAnalyzer;