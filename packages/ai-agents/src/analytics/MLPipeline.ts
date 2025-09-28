/**
 * Machine Learning Pipeline for Model Training and Validation
 * 
 * Handles the complete ML lifecycle including data preparation, feature engineering,
 * model training, validation, versioning, and deployment. Supports A/B testing
 * and continuous learning for model improvement.
 */

import { EventEmitter } from 'events';
import { PrismaClient } from '@prisma/client';
import FeatureEngineering, { FeatureSet } from './FeatureEngineering';
import PredictiveModels, { ModelTrainingData, PredictionType, ModelPerformanceMetrics } from './PredictiveModels';

export interface PipelineConfig {
  organizationId: string;
  pipelineName: string;
  description?: string;
  modelTypes: string[];
  validationStrategy: 'holdout' | 'cross_validation' | 'time_series_split';
  validationSplit: number; // 0.2 for 80/20 split
  hyperparameters: Record<string, any>;
  retraining: {
    enabled: boolean;
    schedule: string; // cron expression
    triggerConditions: {
      performanceDrop: number; // percentage drop to trigger retraining
      dataPoints: number; // minimum new data points
      timePeriod: number; // days since last training
    };
  };
  abTesting: {
    enabled: boolean;
    trafficSplit: number; // percentage of traffic for new model
    successMetrics: string[];
    duration: number; // test duration in days
  };
}

export interface TrainingJob {
  jobId: string;
  pipelineId: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  config: PipelineConfig;
  startedAt?: Date;
  completedAt?: Date;
  duration?: number;
  metrics: {
    dataPoints: number;
    featuresGenerated: number;
    modelsCreated: number;
    bestModelAccuracy: number;
    validationScore: number;
  };
  models: Array<{
    modelId: string;
    modelType: string;
    performance: ModelPerformanceMetrics;
    isChampion: boolean;
  }>;
  error?: string;
  logs: TrainingLog[];
}

export interface TrainingLog {
  timestamp: Date;
  level: 'info' | 'warning' | 'error';
  message: string;
  metadata?: any;
}

export interface ModelVersion {
  versionId: string;
  modelId: string;
  version: string;
  status: 'training' | 'validating' | 'staging' | 'production' | 'retired';
  performance: ModelPerformanceMetrics;
  deployedAt?: Date;
  retiredAt?: Date;
  trainingData: {
    dataPoints: number;
    timeRange: { start: Date; end: Date };
    features: string[];
  };
  abTestResults?: ABTestResults;
}

export interface ABTestResults {
  testId: string;
  startDate: Date;
  endDate: Date;
  controlModel: string;
  challengerModel: string;
  trafficSplit: number;
  metrics: {
    controlPerformance: Record<string, number>;
    challengerPerformance: Record<string, number>;
    statisticalSignificance: number;
    confidenceInterval: number;
  };
  winner: 'control' | 'challenger' | 'inconclusive';
  recommendation: string;
}

export interface PipelineMetrics {
  pipelineId: string;
  totalTrainingJobs: number;
  successfulJobs: number;
  avgTrainingTime: number;
  modelsInProduction: number;
  avgModelAccuracy: number;
  lastTrainingDate: Date;
  dataQualityScore: number;
  featureImportance: Record<string, number>;
}

export class MLPipeline extends EventEmitter {
  private prisma: PrismaClient;
  private featureEngineering: FeatureEngineering;
  private predictiveModels: PredictiveModels;
  private pipelines: Map<string, PipelineConfig> = new Map();
  private trainingJobs: Map<string, TrainingJob> = new Map();
  private modelVersions: Map<string, ModelVersion[]> = new Map();
  private abTests: Map<string, ABTestResults> = new Map();

  constructor(prisma?: PrismaClient) {
    super();
    this.prisma = prisma || new PrismaClient();
    this.featureEngineering = new FeatureEngineering(this.prisma);
    this.predictiveModels = new PredictiveModels();
    
    // Set up event listeners
    this.setupEventListeners();
  }

  /**
   * Create a new ML pipeline
   */
  async createPipeline(config: PipelineConfig): Promise<string> {
    const pipelineId = this.generatePipelineId(config.pipelineName);
    
    // Validate configuration
    await this.validatePipelineConfig(config);
    
    this.pipelines.set(pipelineId, config);
    this.modelVersions.set(pipelineId, []);
    
    this.emit('pipelineCreated', {
      pipelineId,
      organizationId: config.organizationId,
      pipelineName: config.pipelineName
    });

    // Set up automatic retraining if enabled
    if (config.retraining.enabled) {
      await this.scheduleRetraining(pipelineId, config.retraining.schedule);
    }

    return pipelineId;
  }

  /**
   * Start training job for a pipeline
   */
  async startTraining(
    pipelineId: string,
    timeRange?: { start: Date; end: Date }
  ): Promise<string> {
    const config = this.pipelines.get(pipelineId);
    if (!config) {
      throw new Error(`Pipeline ${pipelineId} not found`);
    }

    const jobId = this.generateJobId();
    const defaultTimeRange = timeRange || {
      start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
      end: new Date()
    };

    const job: TrainingJob = {
      jobId,
      pipelineId,
      status: 'pending',
      config,
      metrics: {
        dataPoints: 0,
        featuresGenerated: 0,
        modelsCreated: 0,
        bestModelAccuracy: 0,
        validationScore: 0
      },
      models: [],
      logs: []
    };

    this.trainingJobs.set(jobId, job);

    // Start training asynchronously
    this.executeTrainingJob(jobId, defaultTimeRange).catch(error => {
      this.handleTrainingError(jobId, error);
    });

    this.emit('trainingStarted', {
      jobId,
      pipelineId,
      organizationId: config.organizationId
    });

    return jobId;
  }

  /**
   * Execute the complete training pipeline
   */
  private async executeTrainingJob(
    jobId: string,
    timeRange: { start: Date; end: Date }
  ): Promise<void> {
    const job = this.trainingJobs.get(jobId)!;
    job.status = 'running';
    job.startedAt = new Date();

    try {
      this.addTrainingLog(jobId, 'info', 'Starting training pipeline');

      // Step 1: Data Collection and Validation
      const trainingData = await this.collectTrainingData(jobId, timeRange);
      
      // Step 2: Feature Engineering
      this.addTrainingLog(jobId, 'info', 'Generating features');
      const features = await this.generateFeatures(jobId, trainingData);
      job.metrics.featuresGenerated = features.length;
      job.metrics.dataPoints = features.length;

      // Step 3: Data Validation and Quality Checks
      await this.validateDataQuality(jobId, features);

      // Step 4: Model Training
      this.addTrainingLog(jobId, 'info', 'Training models');
      const models = await this.trainModels(jobId, features);
      job.metrics.modelsCreated = models.length;

      // Step 5: Model Validation
      this.addTrainingLog(jobId, 'info', 'Validating models');
      const validationResults = await this.validateModels(jobId, models, features);
      job.metrics.validationScore = validationResults.averageScore;

      // Step 6: Model Selection
      const championModel = await this.selectChampionModel(jobId, validationResults);
      job.metrics.bestModelAccuracy = championModel.performance.accuracy;

      // Step 7: Model Versioning
      await this.versionModel(jobId, championModel);

      // Step 8: A/B Testing Setup (if enabled)
      if (job.config.abTesting.enabled) {
        await this.setupABTest(jobId, championModel);
      }

      // Complete the job
      job.status = 'completed';
      job.completedAt = new Date();
      job.duration = job.completedAt.getTime() - job.startedAt!.getTime();

      this.addTrainingLog(jobId, 'info', 'Training pipeline completed successfully');
      
      this.emit('trainingCompleted', {
        jobId,
        pipelineId: job.pipelineId,
        duration: job.duration,
        metrics: job.metrics
      });

    } catch (error) {
      this.handleTrainingError(jobId, error);
    }
  }

  /**
   * Collect and prepare training data
   */
  private async collectTrainingData(
    jobId: string,
    timeRange: { start: Date; end: Date }
  ): Promise<{ agents: any[]; workflows: any[]; performanceMetrics: any[] }> {
    const job = this.trainingJobs.get(jobId)!;
    
    this.addTrainingLog(jobId, 'info', 'Collecting training data');

    const [agents, workflows, performanceMetrics] = await Promise.all([
      this.prisma.agent.findMany({
        where: { organizationId: job.config.organizationId },
        include: { performanceMetrics: true }
      }),
      this.prisma.workflow.findMany({
        where: { organizationId: job.config.organizationId },
        include: { runs: true, performanceMetrics: true }
      }),
      this.prisma.performanceMetric.findMany({
        where: {
          organizationId: job.config.organizationId,
          timestamp: {
            gte: timeRange.start,
            lte: timeRange.end
          }
        }
      })
    ]);

    this.addTrainingLog(jobId, 'info', 
      `Collected data: ${agents.length} agents, ${workflows.length} workflows, ${performanceMetrics.length} metrics`
    );

    return { agents, workflows, performanceMetrics };
  }

  /**
   * Generate features for training
   */
  private async generateFeatures(
    jobId: string,
    trainingData: { agents: any[]; workflows: any[]; performanceMetrics: any[] }
  ): Promise<FeatureSet[]> {
    const job = this.trainingJobs.get(jobId)!;
    const features: FeatureSet[] = [];

    // Generate features for each agent
    for (const agent of trainingData.agents) {
      try {
        const agentFeatures = await this.featureEngineering.generateAgentFeatures(
          agent.id,
          job.config.organizationId,
          { start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), end: new Date() }
        );
        features.push(agentFeatures);
      } catch (error) {
        this.addTrainingLog(jobId, 'warning', 
          `Failed to generate features for agent ${agent.id}: ${error.message}`
        );
      }
    }

    // Generate features for each workflow
    for (const workflow of trainingData.workflows) {
      try {
        const workflowFeatures = await this.featureEngineering.generateWorkflowFeatures(
          workflow.id,
          job.config.organizationId,
          { start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), end: new Date() }
        );
        features.push(workflowFeatures);
      } catch (error) {
        this.addTrainingLog(jobId, 'warning', 
          `Failed to generate features for workflow ${workflow.id}: ${error.message}`
        );
      }
    }

    return features;
  }

  /**
   * Validate data quality
   */
  private async validateDataQuality(jobId: string, features: FeatureSet[]): Promise<void> {
    this.addTrainingLog(jobId, 'info', 'Validating data quality');

    if (features.length === 0) {
      throw new Error('No features generated - insufficient training data');
    }

    if (features.length < 10) {
      this.addTrainingLog(jobId, 'warning', 
        `Low number of feature sets (${features.length}). Model accuracy may be limited.`
      );
    }

    // Check for missing or invalid values
    let invalidFeatures = 0;
    features.forEach((featureSet, index) => {
      if (!this.isValidFeatureSet(featureSet)) {
        invalidFeatures++;
        this.addTrainingLog(jobId, 'warning', 
          `Invalid feature set at index ${index}`
        );
      }
    });

    if (invalidFeatures / features.length > 0.2) {
      throw new Error(`Too many invalid feature sets (${invalidFeatures}/${features.length})`);
    }

    this.addTrainingLog(jobId, 'info', 
      `Data quality validation passed. ${features.length} valid feature sets.`
    );
  }

  /**
   * Train multiple models with different algorithms
   */
  private async trainModels(
    jobId: string,
    features: FeatureSet[]
  ): Promise<Array<{ modelId: string; modelType: string; performance: ModelPerformanceMetrics }>> {
    const job = this.trainingJobs.get(jobId)!;
    const models: Array<{ modelId: string; modelType: string; performance: ModelPerformanceMetrics }> = [];

    // Prepare training data
    const trainingData = this.prepareTrainingData(features, job.config.organizationId);

    // Train different model types
    for (const modelType of job.config.modelTypes) {
      try {
        const modelId = `${job.pipelineId}_${modelType}_${Date.now()}`;
        
        this.addTrainingLog(jobId, 'info', `Training ${modelType} model: ${modelId}`);

        await this.predictiveModels.createModel(
          modelId,
          modelType as 'linear_regression' | 'random_forest',
          trainingData
        );

        const performance = this.predictiveModels.getModelPerformance(modelId);
        if (performance) {
          models.push({
            modelId,
            modelType,
            performance
          });

          this.addTrainingLog(jobId, 'info', 
            `Model ${modelId} trained with accuracy: ${performance.accuracy.toFixed(2)}%`
          );
        }

      } catch (error) {
        this.addTrainingLog(jobId, 'error', 
          `Failed to train ${modelType} model: ${error.message}`
        );
      }
    }

    if (models.length === 0) {
      throw new Error('No models were successfully trained');
    }

    return models;
  }

  /**
   * Validate models using the specified validation strategy
   */
  private async validateModels(
    jobId: string,
    models: Array<{ modelId: string; modelType: string; performance: ModelPerformanceMetrics }>,
    features: FeatureSet[]
  ): Promise<{ models: any[]; averageScore: number }> {
    const job = this.trainingJobs.get(jobId)!;
    
    this.addTrainingLog(jobId, 'info', 
      `Validating ${models.length} models using ${job.config.validationStrategy}`
    );

    const validationResults = [];

    for (const model of models) {
      try {
        let validationScore: number;

        switch (job.config.validationStrategy) {
          case 'holdout':
            validationScore = await this.performHoldoutValidation(model.modelId, features, job.config.validationSplit);
            break;
          case 'cross_validation':
            validationScore = await this.performCrossValidation(model.modelId, features, 5);
            break;
          case 'time_series_split':
            validationScore = await this.performTimeSeriesValidation(model.modelId, features);
            break;
          default:
            validationScore = model.performance.accuracy;
        }

        validationResults.push({
          ...model,
          validationScore,
          isChampion: false
        });

        this.addTrainingLog(jobId, 'info', 
          `Model ${model.modelId} validation score: ${validationScore.toFixed(2)}`
        );

      } catch (error) {
        this.addTrainingLog(jobId, 'warning', 
          `Validation failed for model ${model.modelId}: ${error.message}`
        );
      }
    }

    const averageScore = validationResults.reduce((sum, result) => 
      sum + result.validationScore, 0
    ) / validationResults.length;

    return { models: validationResults, averageScore };
  }

  /**
   * Select the best performing model as champion
   */
  private async selectChampionModel(
    jobId: string,
    validationResults: { models: any[]; averageScore: number }
  ): Promise<any> {
    this.addTrainingLog(jobId, 'info', 'Selecting champion model');

    if (validationResults.models.length === 0) {
      throw new Error('No validated models available for selection');
    }

    // Sort by validation score and select the best
    const sortedModels = validationResults.models.sort((a, b) => 
      b.validationScore - a.validationScore
    );

    const champion = sortedModels[0];
    champion.isChampion = true;

    this.addTrainingLog(jobId, 'info', 
      `Champion model selected: ${champion.modelId} (${champion.modelType}) with score: ${champion.validationScore.toFixed(2)}`
    );

    // Update job with all models
    const job = this.trainingJobs.get(jobId)!;
    job.models = validationResults.models;

    return champion;
  }

  /**
   * Create a new version of the model
   */
  private async versionModel(jobId: string, championModel: any): Promise<string> {
    const job = this.trainingJobs.get(jobId)!;
    const versionId = this.generateVersionId();

    const modelVersion: ModelVersion = {
      versionId,
      modelId: championModel.modelId,
      version: this.getNextVersion(job.pipelineId),
      status: 'staging',
      performance: championModel.performance,
      trainingData: {
        dataPoints: job.metrics.dataPoints,
        timeRange: {
          start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
          end: new Date()
        },
        features: this.getFeatureNames()
      }
    };

    const versions = this.modelVersions.get(job.pipelineId) || [];
    versions.push(modelVersion);
    this.modelVersions.set(job.pipelineId, versions);

    this.addTrainingLog(jobId, 'info', 
      `Model version created: ${modelVersion.version} (${versionId})`
    );

    this.emit('modelVersionCreated', {
      pipelineId: job.pipelineId,
      versionId,
      version: modelVersion.version,
      performance: championModel.performance
    });

    return versionId;
  }

  /**
   * Set up A/B testing for model comparison
   */
  private async setupABTest(jobId: string, challengerModel: any): Promise<string> {
    const job = this.trainingJobs.get(jobId)!;
    
    if (!job.config.abTesting.enabled) {
      return '';
    }

    // Find current production model as control
    const versions = this.modelVersions.get(job.pipelineId) || [];
    const productionVersion = versions.find(v => v.status === 'production');

    if (!productionVersion) {
      this.addTrainingLog(jobId, 'info', 
        'No production model found. Deploying challenger directly to production.'
      );
      await this.deployToProduction(challengerModel.modelId);
      return '';
    }

    const testId = this.generateTestId();
    const abTest: ABTestResults = {
      testId,
      startDate: new Date(),
      endDate: new Date(Date.now() + job.config.abTesting.duration * 24 * 60 * 60 * 1000),
      controlModel: productionVersion.modelId,
      challengerModel: challengerModel.modelId,
      trafficSplit: job.config.abTesting.trafficSplit,
      metrics: {
        controlPerformance: {},
        challengerPerformance: {},
        statisticalSignificance: 0,
        confidenceInterval: 0.95
      },
      winner: 'inconclusive',
      recommendation: 'Test in progress'
    };

    this.abTests.set(testId, abTest);

    this.addTrainingLog(jobId, 'info', 
      `A/B test setup: ${testId}. Control: ${productionVersion.modelId}, Challenger: ${challengerModel.modelId}`
    );

    this.emit('abTestStarted', {
      testId,
      pipelineId: job.pipelineId,
      controlModel: productionVersion.modelId,
      challengerModel: challengerModel.modelId
    });

    return testId;
  }

  /**
   * Deploy model to production
   */
  async deployToProduction(modelId: string): Promise<void> {
    // Find the model version
    let targetVersion: ModelVersion | null = null;
    let pipelineId = '';

    for (const [pid, versions] of this.modelVersions.entries()) {
      const version = versions.find(v => v.modelId === modelId);
      if (version) {
        targetVersion = version;
        pipelineId = pid;
        break;
      }
    }

    if (!targetVersion) {
      throw new Error(`Model version not found for model: ${modelId}`);
    }

    // Retire current production model
    const versions = this.modelVersions.get(pipelineId)!;
    versions.forEach(version => {
      if (version.status === 'production') {
        version.status = 'retired';
        version.retiredAt = new Date();
      }
    });

    // Deploy new model
    targetVersion.status = 'production';
    targetVersion.deployedAt = new Date();

    this.emit('modelDeployed', {
      pipelineId,
      modelId,
      versionId: targetVersion.versionId,
      version: targetVersion.version
    });
  }

  /**
   * Get pipeline metrics and statistics
   */
  async getPipelineMetrics(pipelineId: string): Promise<PipelineMetrics | null> {
    const config = this.pipelines.get(pipelineId);
    if (!config) {
      return null;
    }

    const jobs = Array.from(this.trainingJobs.values())
      .filter(job => job.pipelineId === pipelineId);

    const successfulJobs = jobs.filter(job => job.status === 'completed');
    const versions = this.modelVersions.get(pipelineId) || [];
    const productionModels = versions.filter(v => v.status === 'production');

    const avgTrainingTime = successfulJobs.length > 0 ? 
      successfulJobs.reduce((sum, job) => sum + (job.duration || 0), 0) / successfulJobs.length : 0;

    const avgAccuracy = productionModels.length > 0 ?
      productionModels.reduce((sum, model) => sum + model.performance.accuracy, 0) / productionModels.length : 0;

    const lastTrainingDate = jobs.length > 0 ? 
      new Date(Math.max(...jobs.map(job => job.startedAt?.getTime() || 0))) : new Date();

    return {
      pipelineId,
      totalTrainingJobs: jobs.length,
      successfulJobs: successfulJobs.length,
      avgTrainingTime,
      modelsInProduction: productionModels.length,
      avgModelAccuracy: avgAccuracy,
      lastTrainingDate,
      dataQualityScore: 85, // Would calculate based on actual data quality metrics
      featureImportance: this.getAggregatedFeatureImportance(pipelineId)
    };
  }

  /**
   * Get training job status
   */
  getTrainingJob(jobId: string): TrainingJob | null {
    return this.trainingJobs.get(jobId) || null;
  }

  /**
   * List all training jobs for a pipeline
   */
  listTrainingJobs(pipelineId: string): TrainingJob[] {
    return Array.from(this.trainingJobs.values())
      .filter(job => job.pipelineId === pipelineId)
      .sort((a, b) => (b.startedAt?.getTime() || 0) - (a.startedAt?.getTime() || 0));
  }

  /**
   * Get model versions for a pipeline
   */
  getModelVersions(pipelineId: string): ModelVersion[] {
    return this.modelVersions.get(pipelineId) || [];
  }

  /**
   * Get A/B test results
   */
  getABTestResults(testId: string): ABTestResults | null {
    return this.abTests.get(testId) || null;
  }

  /**
   * Cancel a running training job
   */
  async cancelTrainingJob(jobId: string): Promise<void> {
    const job = this.trainingJobs.get(jobId);
    if (!job) {
      throw new Error(`Training job ${jobId} not found`);
    }

    if (job.status === 'running') {
      job.status = 'cancelled';
      job.completedAt = new Date();
      this.addTrainingLog(jobId, 'info', 'Training job cancelled by user');
      
      this.emit('trainingCancelled', { jobId, pipelineId: job.pipelineId });
    }
  }

  // Private helper methods
  private async validatePipelineConfig(config: PipelineConfig): Promise<void> {
    if (!config.organizationId) {
      throw new Error('Organization ID is required');
    }

    if (!config.modelTypes || config.modelTypes.length === 0) {
      throw new Error('At least one model type is required');
    }

    const validModelTypes = ['linear_regression', 'random_forest'];
    const invalidTypes = config.modelTypes.filter(type => !validModelTypes.includes(type));
    if (invalidTypes.length > 0) {
      throw new Error(`Invalid model types: ${invalidTypes.join(', ')}`);
    }

    if (config.validationSplit <= 0 || config.validationSplit >= 1) {
      throw new Error('Validation split must be between 0 and 1');
    }
  }

  private setupEventListeners(): void {
    // Clean up expired training jobs periodically
    setInterval(() => {
      this.cleanupExpiredJobs();
    }, 60 * 60 * 1000); // Every hour

    // Monitor A/B tests
    setInterval(() => {
      this.checkABTests();
    }, 24 * 60 * 60 * 1000); // Daily
  }

  private async scheduleRetraining(pipelineId: string, schedule: string): Promise<void> {
    // Would implement cron-based scheduling
    this.emit('retrainingScheduled', { pipelineId, schedule });
  }

  private prepareTrainingData(features: FeatureSet[], organizationId: string): ModelTrainingData {
    // Extract targets (simplified - would use actual target variables)
    const targets = features.map(f => f.agentPerformanceFeatures.avgResponseTime);

    return {
      features,
      targets,
      metadata: {
        organizationId,
        timeRange: {
          start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
          end: new Date()
        }
      }
    };
  }

  private isValidFeatureSet(featureSet: FeatureSet): boolean {
    // Basic validation - check for null/undefined values
    return !!(
      featureSet.agentPerformanceFeatures &&
      featureSet.timeSeriesFeatures &&
      featureSet.environmentalFeatures &&
      featureSet.metadata
    );
  }

  private async performHoldoutValidation(modelId: string, features: FeatureSet[], splitRatio: number): Promise<number> {
    // Split data and validate (simplified implementation)
    const splitIndex = Math.floor(features.length * (1 - splitRatio));
    const testFeatures = features.slice(splitIndex);
    
    // Would perform actual validation here
    return Math.random() * 100; // Placeholder
  }

  private async performCrossValidation(modelId: string, features: FeatureSet[], folds: number): Promise<number> {
    // K-fold cross validation (simplified implementation)
    const scores = [];
    const foldSize = Math.floor(features.length / folds);
    
    for (let i = 0; i < folds; i++) {
      // Would perform actual cross-validation here
      scores.push(Math.random() * 100);
    }
    
    return scores.reduce((sum, score) => sum + score, 0) / scores.length;
  }

  private async performTimeSeriesValidation(modelId: string, features: FeatureSet[]): Promise<number> {
    // Time series split validation (simplified implementation)
    return Math.random() * 100; // Placeholder
  }

  private getNextVersion(pipelineId: string): string {
    const versions = this.modelVersions.get(pipelineId) || [];
    const versionNumbers = versions.map(v => {
      const match = v.version.match(/v(\d+)/);
      return match ? parseInt(match[1]) : 0;
    });
    
    const nextVersion = Math.max(0, ...versionNumbers) + 1;
    return `v${nextVersion}`;
  }

  private getFeatureNames(): string[] {
    return [
      'avgResponseTime', 'errorRate', 'successRate', 'throughput',
      'avgCpuUsage', 'avgMemoryUsage', 'taskCompletionRate',
      'performanceTrend', 'volatility', 'mean', 'standardDeviation',
      'systemLoad', 'concurrentUsers', 'timeOfDay', 'dayOfWeek'
    ];
  }

  private getAggregatedFeatureImportance(pipelineId: string): Record<string, number> {
    const versions = this.modelVersions.get(pipelineId) || [];
    const productionVersions = versions.filter(v => v.status === 'production');
    
    // Would aggregate feature importance from production models
    return {
      avgResponseTime: 0.15,
      errorRate: 0.12,
      systemLoad: 0.10,
      timeOfDay: 0.08,
      performanceTrend: 0.07
    };
  }

  private addTrainingLog(jobId: string, level: 'info' | 'warning' | 'error', message: string, metadata?: any): void {
    const job = this.trainingJobs.get(jobId);
    if (job) {
      job.logs.push({
        timestamp: new Date(),
        level,
        message,
        metadata
      });
    }
  }

  private handleTrainingError(jobId: string, error: any): void {
    const job = this.trainingJobs.get(jobId);
    if (job) {
      job.status = 'failed';
      job.completedAt = new Date();
      job.error = error.message;
      
      this.addTrainingLog(jobId, 'error', `Training failed: ${error.message}`);
      
      this.emit('trainingFailed', {
        jobId,
        pipelineId: job.pipelineId,
        error: error.message
      });
    }
  }

  private cleanupExpiredJobs(): void {
    const cutoffDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 7 days ago
    const expiredJobs: string[] = [];

    this.trainingJobs.forEach((job, jobId) => {
      if (job.completedAt && job.completedAt < cutoffDate) {
        expiredJobs.push(jobId);
      }
    });

    expiredJobs.forEach(jobId => {
      this.trainingJobs.delete(jobId);
    });

    if (expiredJobs.length > 0) {
      this.emit('jobsCleanedUp', { count: expiredJobs.length });
    }
  }

  private checkABTests(): void {
    const now = new Date();
    
    this.abTests.forEach((test, testId) => {
      if (test.endDate <= now && test.winner === 'inconclusive') {
        // Analyze test results and determine winner
        this.analyzeABTest(testId);
      }
    });
  }

  private analyzeABTest(testId: string): void {
    const test = this.abTests.get(testId);
    if (!test) return;

    // Simplified analysis - would implement proper statistical testing
    const controlScore = Math.random() * 100;
    const challengerScore = Math.random() * 100;
    
    test.metrics.controlPerformance = { accuracy: controlScore };
    test.metrics.challengerPerformance = { accuracy: challengerScore };
    test.metrics.statisticalSignificance = Math.random();

    if (test.metrics.statisticalSignificance > 0.95) {
      test.winner = challengerScore > controlScore ? 'challenger' : 'control';
      test.recommendation = test.winner === 'challenger' ? 
        'Deploy challenger model to production' : 
        'Keep control model in production';
    } else {
      test.winner = 'inconclusive';
      test.recommendation = 'No significant difference detected. Consider longer test duration.';
    }

    this.emit('abTestCompleted', {
      testId,
      winner: test.winner,
      recommendation: test.recommendation
    });
  }

  // ID generation methods
  private generatePipelineId(name: string): string {
    return `pipeline_${name.toLowerCase().replace(/\s+/g, '_')}_${Date.now()}`;
  }

  private generateJobId(): string {
    return `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateVersionId(): string {
    return `version_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateTestId(): string {
    return `test_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get service statistics
   */
  getStats() {
    return {
      totalPipelines: this.pipelines.size,
      activeTrainingJobs: Array.from(this.trainingJobs.values())
        .filter(job => job.status === 'running').length,
      totalModels: Array.from(this.modelVersions.values())
        .reduce((sum, versions) => sum + versions.length, 0),
      activeABTests: Array.from(this.abTests.values())
        .filter(test => test.winner === 'inconclusive').length
    };
  }
}

export default MLPipeline;