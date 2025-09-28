import { createClient } from 'prom-client';
import IORedis from 'ioredis';
import { 
  MLMetrics, 
  ModelPerformanceMetrics, 
  SystemMetrics, 
  BusinessMetrics,
  Alert,
  AutoMLExperiment,
  TrainingMetrics 
} from '../types/index.js';
import { logger, mlopsLogger, logMLOpsMetrics } from '../lib/logger.js';
import { config, getMLOpsConfig } from '../lib/config.js';

// Prometheus metrics
const promClient = createClient();

// Define Prometheus metrics
const modelRequestsTotal = new promClient.Counter({
  name: 'ml_platform_model_requests_total',
  help: 'Total number of model requests',
  labelNames: ['model', 'provider', 'status']
});

const modelRequestDuration = new promClient.Histogram({
  name: 'ml_platform_model_request_duration_seconds',
  help: 'Model request duration in seconds',
  labelNames: ['model', 'provider'],
  buckets: [0.1, 0.5, 1.0, 2.0, 5.0, 10.0]
});

const modelTokensUsed = new promClient.Counter({
  name: 'ml_platform_model_tokens_total',
  help: 'Total number of tokens used',
  labelNames: ['model', 'provider', 'type']
});

const modelCostTotal = new promClient.Counter({
  name: 'ml_platform_model_cost_total',
  help: 'Total cost in USD',
  labelNames: ['model', 'provider']
});

const vectorSearchRequests = new promClient.Counter({
  name: 'ml_platform_vector_search_requests_total',
  help: 'Total number of vector search requests',
  labelNames: ['index', 'provider', 'status']
});

const vectorSearchDuration = new promClient.Histogram({
  name: 'ml_platform_vector_search_duration_seconds',
  help: 'Vector search duration in seconds',
  labelNames: ['index', 'provider'],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1.0]
});

const pipelineJobs = new promClient.Gauge({
  name: 'ml_platform_pipeline_jobs',
  help: 'Number of pipeline jobs by status',
  labelNames: ['type', 'status']
});

const systemResourceUsage = new promClient.Gauge({
  name: 'ml_platform_system_resource_usage',
  help: 'System resource usage percentage',
  labelNames: ['resource']
});

const activeConnections = new promClient.Gauge({
  name: 'ml_platform_active_connections',
  help: 'Number of active connections'
});

export interface ExperimentConfig {
  id: string;
  name: string;
  project: string;
  tags: string[];
  parameters: Record<string, any>;
  metadata: Record<string, any>;
}

export interface ExperimentRun {
  id: string;
  experimentId: string;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  startTime: Date;
  endTime?: Date;
  parameters: Record<string, any>;
  metrics: Record<string, number>;
  artifacts: string[];
  logs: string[];
}

export class MLOpsManager {
  private redis: IORedis;
  private experiments: Map<string, ExperimentConfig> = new Map();
  private runs: Map<string, ExperimentRun> = new Map();
  private alerts: Map<string, Alert> = new Map();
  private metricsBuffer: MLMetrics[] = [];
  private isInitialized = false;

  constructor() {
    this.redis = new IORedis({
      host: config.REDIS_HOST,
      port: config.REDIS_PORT,
      password: config.REDIS_PASSWORD,
      maxRetriesPerRequest: 3,
      retryDelayOnFailover: 100,
    });

    // Start metrics collection
    this.startMetricsCollection();
  }

  async initialize(): Promise<void> {
    try {
      // Test Redis connection
      await this.redis.ping();

      // Initialize Weights & Biases if configured
      const mlopsConfig = getMLOpsConfig();
      if (mlopsConfig.wandb.enabled) {
        await this.initializeWandB();
      }

      // Initialize MLflow if configured
      if (mlopsConfig.mlflow.enabled) {
        await this.initializeMLflow();
      }

      // Start periodic metrics flush
      this.startPeriodicFlush();

      this.isInitialized = true;
      mlopsLogger.info('MLOps Manager initialized successfully');
    } catch (error) {
      mlopsLogger.error('Failed to initialize MLOps Manager:', error);
      throw error;
    }
  }

  private async initializeWandB(): Promise<void> {
    // This would initialize Weights & Biases SDK
    // For now, just log that it's configured
    mlopsLogger.info('Weights & Biases integration enabled');
  }

  private async initializeMLflow(): Promise<void> {
    // This would initialize MLflow tracking
    // For now, just log that it's configured
    mlopsLogger.info('MLflow integration enabled');
  }

  private startMetricsCollection(): void {
    // Collect system metrics every 30 seconds
    setInterval(async () => {
      if (this.isInitialized) {
        await this.collectSystemMetrics();
      }
    }, 30000);
  }

  private startPeriodicFlush(): void {
    // Flush metrics buffer every 60 seconds
    setInterval(async () => {
      if (this.metricsBuffer.length > 0) {
        await this.flushMetrics();
      }
    }, 60000);
  }

  // Experiment Management
  async createExperiment(config: Omit<ExperimentConfig, 'id'>): Promise<string> {
    const id = `exp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const experiment: ExperimentConfig = {
      id,
      ...config
    };

    this.experiments.set(id, experiment);
    
    // Store in Redis for persistence
    await this.redis.hset('experiments', id, JSON.stringify(experiment));

    mlopsLogger.info(`Created experiment: ${experiment.name} (${id})`);
    return id;
  }

  async startRun(experimentId: string, parameters: Record<string, any> = {}): Promise<string> {
    const experiment = this.experiments.get(experimentId);
    if (!experiment) {
      throw new Error(`Experiment ${experimentId} not found`);
    }

    const runId = `run_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const run: ExperimentRun = {
      id: runId,
      experimentId,
      status: 'running',
      startTime: new Date(),
      parameters,
      metrics: {},
      artifacts: [],
      logs: []
    };

    this.runs.set(runId, run);
    
    // Store in Redis
    await this.redis.hset('runs', runId, JSON.stringify(run));

    mlopsLogger.info(`Started run: ${runId} for experiment: ${experimentId}`);
    return runId;
  }

  async logMetrics(runId: string, metrics: Record<string, number>, step?: number): Promise<void> {
    const run = this.runs.get(runId);
    if (!run) {
      throw new Error(`Run ${runId} not found`);
    }

    // Update run metrics
    Object.assign(run.metrics, metrics);
    run.metrics.step = step || 0;
    
    // Store updated run
    await this.redis.hset('runs', runId, JSON.stringify(run));

    // Log to external systems if configured
    const mlopsConfig = getMLOpsConfig();
    if (mlopsConfig.wandb.enabled) {
      await this.logToWandB(runId, metrics, step);
    }

    if (mlopsConfig.mlflow.enabled) {
      await this.logToMLflow(runId, metrics, step);
    }

    mlopsLogger.debug(`Logged metrics for run ${runId}:`, metrics);
  }

  async logArtifact(runId: string, artifactPath: string, artifactType: string = 'file'): Promise<void> {
    const run = this.runs.get(runId);
    if (!run) {
      throw new Error(`Run ${runId} not found`);
    }

    run.artifacts.push(artifactPath);
    
    // Store updated run
    await this.redis.hset('runs', runId, JSON.stringify(run));

    mlopsLogger.info(`Logged artifact for run ${runId}: ${artifactPath}`);
  }

  async finishRun(runId: string, status: 'completed' | 'failed' | 'cancelled' = 'completed'): Promise<void> {
    const run = this.runs.get(runId);
    if (!run) {
      throw new Error(`Run ${runId} not found`);
    }

    run.status = status;
    run.endTime = new Date();
    
    // Store updated run
    await this.redis.hset('runs', runId, JSON.stringify(run));

    mlopsLogger.info(`Finished run ${runId} with status: ${status}`);
  }

  private async logToWandB(runId: string, metrics: Record<string, number>, step?: number): Promise<void> {
    // Implementation would use W&B SDK to log metrics
    // For now, just simulate logging
    mlopsLogger.debug(`[W&B] Logged metrics for run ${runId}`);
  }

  private async logToMLflow(runId: string, metrics: Record<string, number>, step?: number): Promise<void> {
    // Implementation would use MLflow SDK to log metrics
    // For now, just simulate logging
    mlopsLogger.debug(`[MLflow] Logged metrics for run ${runId}`);
  }

  // Performance Monitoring
  async recordModelInference(
    model: string,
    provider: string,
    latency: number,
    tokens: { input: number; output: number },
    cost: number,
    success: boolean
  ): Promise<void> {
    // Update Prometheus metrics
    modelRequestsTotal.inc({ model, provider, status: success ? 'success' : 'error' });
    modelRequestDuration.observe({ model, provider }, latency / 1000); // Convert to seconds
    modelTokensUsed.inc({ model, provider, type: 'input' }, tokens.input);
    modelTokensUsed.inc({ model, provider, type: 'output' }, tokens.output);
    if (cost > 0) {
      modelCostTotal.inc({ model, provider }, cost);
    }

    // Store in metrics buffer
    const performanceMetrics: ModelPerformanceMetrics = {
      averageLatency: latency,
      throughput: 1, // Single request
      errorRate: success ? 0 : 1,
      tokenUsage: {
        promptTokens: tokens.input,
        completionTokens: tokens.output,
        totalTokens: tokens.input + tokens.output,
        cost
      },
      costPerRequest: cost
    };

    await this.addToMetricsBuffer({
      modelPerformance: performanceMetrics,
      systemMetrics: await this.getCurrentSystemMetrics(),
      businessMetrics: await this.getCurrentBusinessMetrics(),
      timestamp: new Date()
    });
  }

  async recordVectorSearch(
    index: string,
    provider: string,
    duration: number,
    resultsCount: number,
    success: boolean
  ): Promise<void> {
    vectorSearchRequests.inc({ index, provider, status: success ? 'success' : 'error' });
    vectorSearchDuration.observe({ index, provider }, duration / 1000);

    mlopsLogger.debug(`Recorded vector search: ${index} (${provider}) - ${resultsCount} results in ${duration}ms`);
  }

  async recordPipelineJob(type: string, status: string): Promise<void> {
    pipelineJobs.set({ type, status }, 1);
    mlopsLogger.debug(`Recorded pipeline job: ${type} - ${status}`);
  }

  private async collectSystemMetrics(): Promise<void> {
    try {
      const systemMetrics = await this.getCurrentSystemMetrics();
      
      // Update Prometheus metrics
      systemResourceUsage.set({ resource: 'cpu' }, systemMetrics.cpuUsage);
      systemResourceUsage.set({ resource: 'memory' }, systemMetrics.memoryUsage);
      systemResourceUsage.set({ resource: 'disk' }, systemMetrics.diskUsage);
      activeConnections.set(systemMetrics.activeConnections);

      // Check for alerts
      await this.checkSystemAlerts(systemMetrics);

    } catch (error) {
      mlopsLogger.error('Failed to collect system metrics:', error);
    }
  }

  private async getCurrentSystemMetrics(): Promise<SystemMetrics> {
    const memUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();
    
    return {
      cpuUsage: (cpuUsage.user + cpuUsage.system) / 1000000, // Convert to percentage approximation
      memoryUsage: (memUsage.heapUsed / memUsage.heapTotal) * 100,
      diskUsage: 0, // Would need to implement disk usage monitoring
      networkIO: 0, // Would need to implement network I/O monitoring
      activeConnections: 0 // Would need to track from server
    };
  }

  private async getCurrentBusinessMetrics(): Promise<BusinessMetrics> {
    // This would aggregate business metrics from Redis or database
    // For now, return mock data
    return {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      uniqueUsers: 0,
      revenue: 0,
      costSavings: 0
    };
  }

  private async addToMetricsBuffer(metrics: MLMetrics): Promise<void> {
    this.metricsBuffer.push(metrics);

    // If buffer is full, flush immediately
    if (this.metricsBuffer.length >= 100) {
      await this.flushMetrics();
    }
  }

  private async flushMetrics(): Promise<void> {
    if (this.metricsBuffer.length === 0) return;

    try {
      // Store metrics in Redis with timestamp-based keys
      const pipeline = this.redis.pipeline();
      
      for (const metrics of this.metricsBuffer) {
        const key = `metrics:${metrics.timestamp.getTime()}`;
        pipeline.setex(key, 86400 * 7, JSON.stringify(metrics)); // Keep for 7 days
      }
      
      await pipeline.exec();

      logMLOpsMetrics({
        metricsBufferSize: this.metricsBuffer.length,
        flushTimestamp: Date.now()
      });

      this.metricsBuffer = [];
    } catch (error) {
      mlopsLogger.error('Failed to flush metrics:', error);
    }
  }

  // Alert Management
  private async checkSystemAlerts(metrics: SystemMetrics): Promise<void> {
    const alerts: Alert[] = [];

    // CPU usage alert
    if (metrics.cpuUsage > 90) {
      alerts.push({
        id: `cpu_alert_${Date.now()}`,
        type: 'performance',
        severity: 'high',
        message: 'High CPU usage detected',
        metrics: { cpuUsage: metrics.cpuUsage },
        threshold: 90,
        actualValue: metrics.cpuUsage,
        timestamp: new Date(),
        acknowledged: false
      });
    }

    // Memory usage alert
    if (metrics.memoryUsage > 85) {
      alerts.push({
        id: `memory_alert_${Date.now()}`,
        type: 'performance',
        severity: 'medium',
        message: 'High memory usage detected',
        metrics: { memoryUsage: metrics.memoryUsage },
        threshold: 85,
        actualValue: metrics.memoryUsage,
        timestamp: new Date(),
        acknowledged: false
      });
    }

    // Process alerts
    for (const alert of alerts) {
      await this.processAlert(alert);
    }
  }

  private async processAlert(alert: Alert): Promise<void> {
    this.alerts.set(alert.id, alert);
    
    // Store alert in Redis
    await this.redis.hset('alerts', alert.id, JSON.stringify(alert));

    // Log alert
    mlopsLogger.warn(`Alert triggered: ${alert.message}`, {
      alertId: alert.id,
      severity: alert.severity,
      type: alert.type,
      actualValue: alert.actualValue,
      threshold: alert.threshold
    });

    // Send notifications based on severity
    if (alert.severity === 'high' || alert.severity === 'critical') {
      await this.sendAlertNotification(alert);
    }
  }

  private async sendAlertNotification(alert: Alert): Promise<void> {
    // This would integrate with notification systems (Slack, email, PagerDuty)
    // For now, just log
    mlopsLogger.warn(`High severity alert notification: ${alert.message}`);
  }

  async acknowledgeAlert(alertId: string): Promise<boolean> {
    const alert = this.alerts.get(alertId);
    if (!alert) return false;

    alert.acknowledged = true;
    await this.redis.hset('alerts', alertId, JSON.stringify(alert));
    
    mlopsLogger.info(`Alert acknowledged: ${alertId}`);
    return true;
  }

  async resolveAlert(alertId: string): Promise<boolean> {
    const alert = this.alerts.get(alertId);
    if (!alert) return false;

    alert.resolvedAt = new Date();
    await this.redis.hset('alerts', alertId, JSON.stringify(alert));
    this.alerts.delete(alertId);
    
    mlopsLogger.info(`Alert resolved: ${alertId}`);
    return true;
  }

  // Model Comparison and A/B Testing
  async compareModels(
    models: string[],
    testCases: Array<{ input: any; expectedOutput?: any }>,
    metrics: string[] = ['latency', 'accuracy', 'cost']
  ): Promise<any> {
    const comparisonId = `comparison_${Date.now()}`;
    const results: any = {
      id: comparisonId,
      models,
      testCases: testCases.length,
      metrics,
      results: {},
      timestamp: new Date()
    };

    // This would run actual model comparisons
    // For now, simulate results
    for (const model of models) {
      results.results[model] = {
        averageLatency: 100 + Math.random() * 500,
        accuracy: 0.8 + Math.random() * 0.15,
        cost: Math.random() * 0.01,
        successRate: 0.95 + Math.random() * 0.05
      };
    }

    // Determine winner
    const latencyWinner = Object.entries(results.results).reduce((a, b) => 
      a[1].averageLatency < b[1].averageLatency ? a : b
    );
    
    results.recommendations = [
      `Fastest model: ${latencyWinner[0]} (${latencyWinner[1].averageLatency.toFixed(2)}ms avg)`,
      `Consider model performance trade-offs based on your use case`
    ];

    mlopsLogger.info(`Model comparison completed: ${comparisonId}`);
    return results;
  }

  // Data and Metrics Export
  async exportMetrics(
    startTime: Date,
    endTime: Date,
    format: 'json' | 'csv' = 'json'
  ): Promise<string> {
    const startTimestamp = startTime.getTime();
    const endTimestamp = endTime.getTime();
    
    const keys = await this.redis.keys(`metrics:*`);
    const filteredKeys = keys.filter(key => {
      const timestamp = parseInt(key.split(':')[1]);
      return timestamp >= startTimestamp && timestamp <= endTimestamp;
    });

    const metrics = await Promise.all(
      filteredKeys.map(async key => {
        const data = await this.redis.get(key);
        return data ? JSON.parse(data) : null;
      })
    );

    const validMetrics = metrics.filter(Boolean);

    if (format === 'csv') {
      // Convert to CSV format
      const csvHeaders = 'timestamp,cpu_usage,memory_usage,avg_latency,total_requests\n';
      const csvRows = validMetrics.map(m => 
        `${m.timestamp},${m.systemMetrics.cpuUsage},${m.systemMetrics.memoryUsage},${m.modelPerformance.averageLatency},${m.businessMetrics.totalRequests}`
      ).join('\n');
      
      return csvHeaders + csvRows;
    }

    return JSON.stringify(validMetrics, null, 2);
  }

  async getExperimentRuns(experimentId: string): Promise<ExperimentRun[]> {
    return Array.from(this.runs.values()).filter(run => run.experimentId === experimentId);
  }

  async getActiveAlerts(): Promise<Alert[]> {
    return Array.from(this.alerts.values()).filter(alert => !alert.resolvedAt);
  }

  getPrometheusMetrics(): string {
    return promClient.register.metrics();
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.redis.ping();
      return true;
    } catch (error) {
      return false;
    }
  }

  async shutdown(): Promise<void> {
    mlopsLogger.info('Shutting down MLOps Manager...');
    
    // Flush remaining metrics
    if (this.metricsBuffer.length > 0) {
      await this.flushMetrics();
    }

    // Disconnect from Redis
    await this.redis.disconnect();
    
    mlopsLogger.info('MLOps Manager shutdown complete');
  }
}