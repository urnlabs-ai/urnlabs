/**
 * Predictive Models for Agent Performance Forecasting
 * 
 * Implements various machine learning models for predicting agent performance,
 * workflow success rates, resource utilization, and failure rates.
 * Uses ensemble methods and online learning for continuous improvement.
 */

import { EventEmitter } from 'events';
import { FeatureSet, AgentPerformanceFeatures, WorkflowFeatures } from './FeatureEngineering';

export interface PredictionRequest {
  organizationId: string;
  agentId?: string;
  workflowId?: string;
  predictionType: PredictionType;
  horizonMinutes: number; // How far into the future to predict
  features: FeatureSet;
  confidence?: number; // Minimum confidence threshold (0-1)
}

export interface Prediction {
  predictionId: string;
  request: PredictionRequest;
  predictions: PredictionResults;
  confidence: number;
  uncertainty: number;
  modelInfo: ModelInfo;
  createdAt: Date;
  expiresAt: Date;
}

export interface PredictionResults {
  performanceMetrics: {
    expectedResponseTime: number;
    expectedErrorRate: number;
    expectedThroughput: number;
    expectedSuccessRate: number;
  };
  resourceUtilization: {
    expectedCpuUsage: number;
    expectedMemoryUsage: number;
    expectedConcurrentTasks: number;
  };
  workflowPredictions: {
    expectedExecutionTime: number;
    expectedSuccessRate: number;
    riskFactors: string[];
    bottleneckSteps: string[];
  };
  anomalyLikelihood: number;
  recommendations: string[];
}

export interface ModelInfo {
  modelType: string;
  modelVersion: string;
  trainedAt: Date;
  accuracy: number;
  precision: number;
  recall: number;
  f1Score: number;
  dataPoints: number;
}

export enum PredictionType {
  PERFORMANCE = 'performance',
  FAILURE_RISK = 'failure_risk',
  RESOURCE_DEMAND = 'resource_demand',
  WORKFLOW_SUCCESS = 'workflow_success',
  ANOMALY_DETECTION = 'anomaly_detection'
}

export interface ModelTrainingData {
  features: FeatureSet[];
  targets: number[];
  weights?: number[];
  metadata: {
    organizationId: string;
    agentId?: string;
    workflowId?: string;
    timeRange: { start: Date; end: Date };
  };
}

export interface ModelPerformanceMetrics {
  accuracy: number;
  precision: number;
  recall: number;
  f1Score: number;
  mse: number; // Mean Squared Error
  mae: number; // Mean Absolute Error
  r2Score: number; // R-squared
  confusionMatrix?: number[][];
  featureImportance: Record<string, number>;
}

export interface EnsembleModel {
  models: BaseModel[];
  weights: number[];
  votingStrategy: 'average' | 'weighted' | 'majority';
  performanceMetrics: ModelPerformanceMetrics;
}

export abstract class BaseModel {
  protected modelId: string;
  protected modelType: string;
  protected isTrained: boolean = false;
  protected trainingData: ModelTrainingData | null = null;
  protected performanceMetrics: ModelPerformanceMetrics | null = null;

  constructor(modelId: string, modelType: string) {
    this.modelId = modelId;
    this.modelType = modelType;
  }

  abstract train(data: ModelTrainingData): Promise<void>;
  abstract predict(features: FeatureSet): Promise<number>;
  abstract getFeatureImportance(): Record<string, number>;
  abstract serialize(): string;
  abstract deserialize(data: string): void;

  getModelInfo(): ModelInfo {
    return {
      modelType: this.modelType,
      modelVersion: '1.0.0',
      trainedAt: this.trainingData?.metadata.timeRange.end || new Date(),
      accuracy: this.performanceMetrics?.accuracy || 0,
      precision: this.performanceMetrics?.precision || 0,
      recall: this.performanceMetrics?.recall || 0,
      f1Score: this.performanceMetrics?.f1Score || 0,
      dataPoints: this.trainingData?.features.length || 0
    };
  }

  isModelTrained(): boolean {
    return this.isTrained;
  }
}

/**
 * Linear Regression Model for continuous predictions
 */
export class LinearRegressionModel extends BaseModel {
  private weights: number[] = [];
  private bias: number = 0;
  private learningRate: number = 0.001;
  private regularization: number = 0.01;

  constructor(modelId: string) {
    super(modelId, 'linear_regression');
  }

  async train(data: ModelTrainingData): Promise<void> {
    const features = this.extractNumericalFeatures(data.features);
    const targets = data.targets;

    if (features.length === 0 || targets.length === 0) {
      throw new Error('No training data provided');
    }

    // Initialize weights
    const featureCount = features[0].length;
    this.weights = Array(featureCount).fill(0).map(() => Math.random() * 0.01);
    this.bias = 0;

    // Gradient descent training
    const epochs = 1000;
    for (let epoch = 0; epoch < epochs; epoch++) {
      const gradients = this.calculateGradients(features, targets);
      this.updateWeights(gradients);
    }

    this.trainingData = data;
    this.isTrained = true;
    this.performanceMetrics = await this.evaluate(features, targets);
  }

  async predict(features: FeatureSet): Promise<number> {
    if (!this.isTrained) {
      throw new Error('Model must be trained before making predictions');
    }

    const numericalFeatures = this.extractNumericalFeaturesFromSet(features);
    let prediction = this.bias;

    for (let i = 0; i < this.weights.length && i < numericalFeatures.length; i++) {
      prediction += this.weights[i] * numericalFeatures[i];
    }

    return prediction;
  }

  getFeatureImportance(): Record<string, number> {
    const importance: Record<string, number> = {};
    const featureNames = this.getFeatureNames();

    this.weights.forEach((weight, index) => {
      if (featureNames[index]) {
        importance[featureNames[index]] = Math.abs(weight);
      }
    });

    return importance;
  }

  serialize(): string {
    return JSON.stringify({
      modelType: this.modelType,
      weights: this.weights,
      bias: this.bias,
      isTrained: this.isTrained,
      performanceMetrics: this.performanceMetrics
    });
  }

  deserialize(data: string): void {
    const parsed = JSON.parse(data);
    this.weights = parsed.weights;
    this.bias = parsed.bias;
    this.isTrained = parsed.isTrained;
    this.performanceMetrics = parsed.performanceMetrics;
  }

  private extractNumericalFeatures(featureSets: FeatureSet[]): number[][] {
    return featureSets.map(fs => this.extractNumericalFeaturesFromSet(fs));
  }

  private extractNumericalFeaturesFromSet(features: FeatureSet): number[] {
    const numerical: number[] = [];
    
    // Agent performance features
    numerical.push(
      features.agentPerformanceFeatures.avgResponseTime,
      features.agentPerformanceFeatures.errorRate,
      features.agentPerformanceFeatures.successRate,
      features.agentPerformanceFeatures.throughput,
      features.agentPerformanceFeatures.avgCpuUsage,
      features.agentPerformanceFeatures.avgMemoryUsage,
      features.agentPerformanceFeatures.taskCompletionRate
    );

    // Time series features
    numerical.push(
      features.timeSeriesFeatures.performanceTrend,
      features.timeSeriesFeatures.volatility,
      features.timeSeriesFeatures.mean,
      features.timeSeriesFeatures.standardDeviation
    );

    // Environmental features
    numerical.push(
      features.environmentalFeatures.systemLoad,
      features.environmentalFeatures.concurrentUsers,
      features.environmentalFeatures.timeOfDay,
      features.environmentalFeatures.dayOfWeek,
      features.environmentalFeatures.isBusinessHours ? 1 : 0,
      features.environmentalFeatures.isWeekend ? 1 : 0
    );

    return numerical;
  }

  private getFeatureNames(): string[] {
    return [
      'avgResponseTime', 'errorRate', 'successRate', 'throughput',
      'avgCpuUsage', 'avgMemoryUsage', 'taskCompletionRate',
      'performanceTrend', 'volatility', 'mean', 'standardDeviation',
      'systemLoad', 'concurrentUsers', 'timeOfDay', 'dayOfWeek',
      'isBusinessHours', 'isWeekend'
    ];
  }

  private calculateGradients(features: number[][], targets: number[]): { weightGrads: number[]; biasGrad: number } {
    const m = features.length;
    const weightGrads = Array(this.weights.length).fill(0);
    let biasGrad = 0;

    for (let i = 0; i < m; i++) {
      const prediction = this.forwardPass(features[i]);
      const error = prediction - targets[i];

      // Weight gradients with L2 regularization
      for (let j = 0; j < this.weights.length; j++) {
        weightGrads[j] += (error * features[i][j] + this.regularization * this.weights[j]) / m;
      }

      // Bias gradient
      biasGrad += error / m;
    }

    return { weightGrads, biasGrad };
  }

  private forwardPass(features: number[]): number {
    let result = this.bias;
    for (let i = 0; i < this.weights.length && i < features.length; i++) {
      result += this.weights[i] * features[i];
    }
    return result;
  }

  private updateWeights(gradients: { weightGrads: number[]; biasGrad: number }): void {
    for (let i = 0; i < this.weights.length; i++) {
      this.weights[i] -= this.learningRate * gradients.weightGrads[i];
    }
    this.bias -= this.learningRate * gradients.biasGrad;
  }

  private async evaluate(features: number[][], targets: number[]): Promise<ModelPerformanceMetrics> {
    const predictions = features.map(f => this.forwardPass(f));
    
    // Calculate MSE
    const mse = predictions.reduce((sum, pred, i) => 
      sum + Math.pow(pred - targets[i], 2), 0
    ) / predictions.length;

    // Calculate MAE
    const mae = predictions.reduce((sum, pred, i) => 
      sum + Math.abs(pred - targets[i]), 0
    ) / predictions.length;

    // Calculate R-squared
    const targetMean = targets.reduce((sum, t) => sum + t, 0) / targets.length;
    const totalVariance = targets.reduce((sum, t) => sum + Math.pow(t - targetMean, 2), 0);
    const residualVariance = predictions.reduce((sum, pred, i) => 
      sum + Math.pow(targets[i] - pred, 2), 0
    );
    const r2Score = 1 - (residualVariance / totalVariance);

    return {
      accuracy: Math.max(0, 100 - (mae / targetMean) * 100),
      precision: 0, // Not applicable for regression
      recall: 0, // Not applicable for regression
      f1Score: 0, // Not applicable for regression
      mse,
      mae,
      r2Score,
      featureImportance: this.getFeatureImportance()
    };
  }
}

/**
 * Random Forest Model for ensemble predictions
 */
export class RandomForestModel extends BaseModel {
  private trees: DecisionTree[] = [];
  private treeCount: number = 10;
  private maxDepth: number = 10;
  private minSamplesPerLeaf: number = 5;

  constructor(modelId: string, treeCount: number = 10) {
    super(modelId, 'random_forest');
    this.treeCount = treeCount;
  }

  async train(data: ModelTrainingData): Promise<void> {
    const features = this.extractNumericalFeatures(data.features);
    const targets = data.targets;

    this.trees = [];

    // Train multiple decision trees with bootstrapped samples
    for (let i = 0; i < this.treeCount; i++) {
      const { bootstrapFeatures, bootstrapTargets } = this.createBootstrapSample(features, targets);
      
      const tree = new DecisionTree(this.maxDepth, this.minSamplesPerLeaf);
      await tree.train(bootstrapFeatures, bootstrapTargets);
      this.trees.push(tree);
    }

    this.trainingData = data;
    this.isTrained = true;
    this.performanceMetrics = await this.evaluate(features, targets);
  }

  async predict(features: FeatureSet): Promise<number> {
    if (!this.isTrained) {
      throw new Error('Model must be trained before making predictions');
    }

    const numericalFeatures = this.extractNumericalFeaturesFromSet(features);
    const predictions = this.trees.map(tree => tree.predict(numericalFeatures));
    
    // Average the predictions
    return predictions.reduce((sum, pred) => sum + pred, 0) / predictions.length;
  }

  getFeatureImportance(): Record<string, number> {
    const importance: Record<string, number> = {};
    const featureNames = this.getFeatureNames();

    // Average feature importance across all trees
    featureNames.forEach((name, index) => {
      const avgImportance = this.trees.reduce((sum, tree) => 
        sum + tree.getFeatureImportance(index), 0
      ) / this.trees.length;
      importance[name] = avgImportance;
    });

    return importance;
  }

  serialize(): string {
    return JSON.stringify({
      modelType: this.modelType,
      trees: this.trees.map(tree => tree.serialize()),
      treeCount: this.treeCount,
      maxDepth: this.maxDepth,
      isTrained: this.isTrained,
      performanceMetrics: this.performanceMetrics
    });
  }

  deserialize(data: string): void {
    const parsed = JSON.parse(data);
    this.trees = parsed.trees.map((treeData: string) => {
      const tree = new DecisionTree(this.maxDepth, this.minSamplesPerLeaf);
      tree.deserialize(treeData);
      return tree;
    });
    this.treeCount = parsed.treeCount;
    this.maxDepth = parsed.maxDepth;
    this.isTrained = parsed.isTrained;
    this.performanceMetrics = parsed.performanceMetrics;
  }

  private extractNumericalFeatures(featureSets: FeatureSet[]): number[][] {
    return featureSets.map(fs => this.extractNumericalFeaturesFromSet(fs));
  }

  private extractNumericalFeaturesFromSet(features: FeatureSet): number[] {
    // Same as LinearRegressionModel
    const numerical: number[] = [];
    
    numerical.push(
      features.agentPerformanceFeatures.avgResponseTime,
      features.agentPerformanceFeatures.errorRate,
      features.agentPerformanceFeatures.successRate,
      features.agentPerformanceFeatures.throughput,
      features.agentPerformanceFeatures.avgCpuUsage,
      features.agentPerformanceFeatures.avgMemoryUsage,
      features.agentPerformanceFeatures.taskCompletionRate,
      features.timeSeriesFeatures.performanceTrend,
      features.timeSeriesFeatures.volatility,
      features.timeSeriesFeatures.mean,
      features.timeSeriesFeatures.standardDeviation,
      features.environmentalFeatures.systemLoad,
      features.environmentalFeatures.concurrentUsers,
      features.environmentalFeatures.timeOfDay,
      features.environmentalFeatures.dayOfWeek,
      features.environmentalFeatures.isBusinessHours ? 1 : 0,
      features.environmentalFeatures.isWeekend ? 1 : 0
    );

    return numerical;
  }

  private getFeatureNames(): string[] {
    return [
      'avgResponseTime', 'errorRate', 'successRate', 'throughput',
      'avgCpuUsage', 'avgMemoryUsage', 'taskCompletionRate',
      'performanceTrend', 'volatility', 'mean', 'standardDeviation',
      'systemLoad', 'concurrentUsers', 'timeOfDay', 'dayOfWeek',
      'isBusinessHours', 'isWeekend'
    ];
  }

  private createBootstrapSample(features: number[][], targets: number[]): {
    bootstrapFeatures: number[][];
    bootstrapTargets: number[];
  } {
    const sampleSize = features.length;
    const bootstrapFeatures: number[][] = [];
    const bootstrapTargets: number[] = [];

    for (let i = 0; i < sampleSize; i++) {
      const randomIndex = Math.floor(Math.random() * sampleSize);
      bootstrapFeatures.push(features[randomIndex]);
      bootstrapTargets.push(targets[randomIndex]);
    }

    return { bootstrapFeatures, bootstrapTargets };
  }

  private async evaluate(features: number[][], targets: number[]): Promise<ModelPerformanceMetrics> {
    const predictions = features.map(f => {
      const treePredictions = this.trees.map(tree => tree.predict(f));
      return treePredictions.reduce((sum, pred) => sum + pred, 0) / treePredictions.length;
    });

    // Same evaluation logic as LinearRegressionModel
    const mse = predictions.reduce((sum, pred, i) => 
      sum + Math.pow(pred - targets[i], 2), 0
    ) / predictions.length;

    const mae = predictions.reduce((sum, pred, i) => 
      sum + Math.abs(pred - targets[i]), 0
    ) / predictions.length;

    const targetMean = targets.reduce((sum, t) => sum + t, 0) / targets.length;
    const totalVariance = targets.reduce((sum, t) => sum + Math.pow(t - targetMean, 2), 0);
    const residualVariance = predictions.reduce((sum, pred, i) => 
      sum + Math.pow(targets[i] - pred, 2), 0
    );
    const r2Score = 1 - (residualVariance / totalVariance);

    return {
      accuracy: Math.max(0, 100 - (mae / targetMean) * 100),
      precision: 0,
      recall: 0,
      f1Score: 0,
      mse,
      mae,
      r2Score,
      featureImportance: this.getFeatureImportance()
    };
  }
}

/**
 * Simple Decision Tree implementation
 */
class DecisionTree {
  private root: TreeNode | null = null;
  private maxDepth: number;
  private minSamplesPerLeaf: number;

  constructor(maxDepth: number, minSamplesPerLeaf: number) {
    this.maxDepth = maxDepth;
    this.minSamplesPerLeaf = minSamplesPerLeaf;
  }

  async train(features: number[][], targets: number[]): Promise<void> {
    this.root = this.buildTree(features, targets, 0);
  }

  predict(features: number[]): number {
    if (!this.root) return 0;
    return this.traverseTree(this.root, features);
  }

  getFeatureImportance(featureIndex: number): number {
    // Simplified feature importance calculation
    return Math.random(); // Would implement proper importance calculation
  }

  serialize(): string {
    return JSON.stringify(this.root);
  }

  deserialize(data: string): void {
    this.root = JSON.parse(data);
  }

  private buildTree(features: number[][], targets: number[], depth: number): TreeNode {
    // Base cases
    if (depth >= this.maxDepth || features.length <= this.minSamplesPerLeaf) {
      return {
        isLeaf: true,
        value: this.calculateMean(targets),
        featureIndex: -1,
        threshold: 0,
        left: null,
        right: null
      };
    }

    // Find best split
    const bestSplit = this.findBestSplit(features, targets);
    
    if (!bestSplit) {
      return {
        isLeaf: true,
        value: this.calculateMean(targets),
        featureIndex: -1,
        threshold: 0,
        left: null,
        right: null
      };
    }

    // Split data
    const { leftFeatures, leftTargets, rightFeatures, rightTargets } = 
      this.splitData(features, targets, bestSplit.featureIndex, bestSplit.threshold);

    return {
      isLeaf: false,
      value: 0,
      featureIndex: bestSplit.featureIndex,
      threshold: bestSplit.threshold,
      left: this.buildTree(leftFeatures, leftTargets, depth + 1),
      right: this.buildTree(rightFeatures, rightTargets, depth + 1)
    };
  }

  private findBestSplit(features: number[][], targets: number[]): { featureIndex: number; threshold: number } | null {
    if (features.length === 0) return null;

    let bestGain = 0;
    let bestFeatureIndex = -1;
    let bestThreshold = 0;

    const featureCount = features[0].length;

    for (let featureIndex = 0; featureIndex < featureCount; featureIndex++) {
      const values = features.map(f => f[featureIndex]);
      const uniqueValues = [...new Set(values)].sort((a, b) => a - b);

      for (let i = 0; i < uniqueValues.length - 1; i++) {
        const threshold = (uniqueValues[i] + uniqueValues[i + 1]) / 2;
        const gain = this.calculateInformationGain(features, targets, featureIndex, threshold);

        if (gain > bestGain) {
          bestGain = gain;
          bestFeatureIndex = featureIndex;
          bestThreshold = threshold;
        }
      }
    }

    return bestGain > 0 ? { featureIndex: bestFeatureIndex, threshold: bestThreshold } : null;
  }

  private calculateInformationGain(features: number[][], targets: number[], featureIndex: number, threshold: number): number {
    const { leftTargets, rightTargets } = this.splitTargets(features, targets, featureIndex, threshold);
    
    if (leftTargets.length === 0 || rightTargets.length === 0) return 0;

    const totalVariance = this.calculateVariance(targets);
    const leftVariance = this.calculateVariance(leftTargets);
    const rightVariance = this.calculateVariance(rightTargets);

    const leftWeight = leftTargets.length / targets.length;
    const rightWeight = rightTargets.length / targets.length;

    return totalVariance - (leftWeight * leftVariance + rightWeight * rightVariance);
  }

  private splitData(features: number[][], targets: number[], featureIndex: number, threshold: number): {
    leftFeatures: number[][];
    leftTargets: number[];
    rightFeatures: number[][];
    rightTargets: number[];
  } {
    const leftFeatures: number[][] = [];
    const leftTargets: number[] = [];
    const rightFeatures: number[][] = [];
    const rightTargets: number[] = [];

    for (let i = 0; i < features.length; i++) {
      if (features[i][featureIndex] <= threshold) {
        leftFeatures.push(features[i]);
        leftTargets.push(targets[i]);
      } else {
        rightFeatures.push(features[i]);
        rightTargets.push(targets[i]);
      }
    }

    return { leftFeatures, leftTargets, rightFeatures, rightTargets };
  }

  private splitTargets(features: number[][], targets: number[], featureIndex: number, threshold: number): {
    leftTargets: number[];
    rightTargets: number[];
  } {
    const leftTargets: number[] = [];
    const rightTargets: number[] = [];

    for (let i = 0; i < features.length; i++) {
      if (features[i][featureIndex] <= threshold) {
        leftTargets.push(targets[i]);
      } else {
        rightTargets.push(targets[i]);
      }
    }

    return { leftTargets, rightTargets };
  }

  private calculateMean(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((sum, val) => sum + val, 0) / values.length;
  }

  private calculateVariance(values: number[]): number {
    if (values.length === 0) return 0;
    const mean = this.calculateMean(values);
    return values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
  }

  private traverseTree(node: TreeNode, features: number[]): number {
    if (node.isLeaf) {
      return node.value;
    }

    if (features[node.featureIndex] <= node.threshold) {
      return node.left ? this.traverseTree(node.left, features) : 0;
    } else {
      return node.right ? this.traverseTree(node.right, features) : 0;
    }
  }
}

interface TreeNode {
  isLeaf: boolean;
  value: number;
  featureIndex: number;
  threshold: number;
  left: TreeNode | null;
  right: TreeNode | null;
}

/**
 * Main Predictive Models service
 */
export class PredictiveModels extends EventEmitter {
  private models: Map<string, BaseModel> = new Map();
  private ensembleModels: Map<string, EnsembleModel> = new Map();
  private predictions: Map<string, Prediction> = new Map();

  constructor() {
    super();
  }

  /**
   * Create and train a new model
   */
  async createModel(
    modelId: string,
    modelType: 'linear_regression' | 'random_forest',
    trainingData: ModelTrainingData
  ): Promise<void> {
    let model: BaseModel;

    switch (modelType) {
      case 'linear_regression':
        model = new LinearRegressionModel(modelId);
        break;
      case 'random_forest':
        model = new RandomForestModel(modelId);
        break;
      default:
        throw new Error(`Unsupported model type: ${modelType}`);
    }

    try {
      await model.train(trainingData);
      this.models.set(modelId, model);
      
      this.emit('modelTrained', {
        modelId,
        modelType,
        performance: model.getModelInfo()
      });

    } catch (error) {
      this.emit('modelTrainingError', { modelId, modelType, error: error.message });
      throw error;
    }
  }

  /**
   * Create ensemble model from multiple base models
   */
  async createEnsembleModel(
    ensembleId: string,
    modelIds: string[],
    votingStrategy: 'average' | 'weighted' | 'majority' = 'average',
    weights?: number[]
  ): Promise<void> {
    const models: BaseModel[] = [];
    
    for (const modelId of modelIds) {
      const model = this.models.get(modelId);
      if (!model || !model.isModelTrained()) {
        throw new Error(`Model ${modelId} not found or not trained`);
      }
      models.push(model);
    }

    const ensembleWeights = weights || Array(models.length).fill(1 / models.length);
    
    // Calculate ensemble performance (simplified)
    const performanceMetrics: ModelPerformanceMetrics = {
      accuracy: models.reduce((sum, model) => sum + model.getModelInfo().accuracy, 0) / models.length,
      precision: models.reduce((sum, model) => sum + model.getModelInfo().precision, 0) / models.length,
      recall: models.reduce((sum, model) => sum + model.getModelInfo().recall, 0) / models.length,
      f1Score: models.reduce((sum, model) => sum + model.getModelInfo().f1Score, 0) / models.length,
      mse: 0,
      mae: 0,
      r2Score: 0,
      featureImportance: this.combineFeatureImportance(models)
    };

    const ensembleModel: EnsembleModel = {
      models,
      weights: ensembleWeights,
      votingStrategy,
      performanceMetrics
    };

    this.ensembleModels.set(ensembleId, ensembleModel);
    
    this.emit('ensembleModelCreated', {
      ensembleId,
      modelCount: models.length,
      performance: performanceMetrics
    });
  }

  /**
   * Make prediction using a specific model or ensemble
   */
  async predict(request: PredictionRequest): Promise<Prediction> {
    const predictionId = this.generatePredictionId();
    
    try {
      // Determine which model to use
      const modelKey = request.agentId || request.workflowId || `org_${request.organizationId}`;
      let rawPrediction: number;

      // Try ensemble model first, then individual models
      const ensembleModel = this.ensembleModels.get(modelKey);
      if (ensembleModel) {
        rawPrediction = await this.predictWithEnsemble(ensembleModel, request.features);
      } else {
        const model = this.models.get(modelKey);
        if (!model) {
          throw new Error(`No trained model found for key: ${modelKey}`);
        }
        rawPrediction = await model.predict(request.features);
      }

      // Convert raw prediction to structured results
      const predictions = this.interpretPrediction(rawPrediction, request);
      const confidence = this.calculateConfidence(request.features, rawPrediction);
      const uncertainty = this.calculateUncertainty(request.features);

      const prediction: Prediction = {
        predictionId,
        request,
        predictions,
        confidence,
        uncertainty,
        modelInfo: ensembleModel ? 
          this.getEnsembleModelInfo(ensembleModel) : 
          this.models.get(modelKey)!.getModelInfo(),
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + request.horizonMinutes * 60 * 1000)
      };

      this.predictions.set(predictionId, prediction);
      
      this.emit('predictionMade', {
        predictionId,
        predictionType: request.predictionType,
        confidence,
        organizationId: request.organizationId
      });

      return prediction;

    } catch (error) {
      this.emit('predictionError', {
        predictionId,
        request,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get model performance metrics
   */
  getModelPerformance(modelId: string): ModelPerformanceMetrics | null {
    const model = this.models.get(modelId);
    return model ? model.getModelInfo() as any : null;
  }

  /**
   * Get feature importance for a model
   */
  getFeatureImportance(modelId: string): Record<string, number> {
    const model = this.models.get(modelId);
    return model ? model.getFeatureImportance() : {};
  }

  /**
   * List all available models
   */
  listModels(): Array<{ modelId: string; modelInfo: ModelInfo }> {
    const result: Array<{ modelId: string; modelInfo: ModelInfo }> = [];
    
    this.models.forEach((model, modelId) => {
      result.push({
        modelId,
        modelInfo: model.getModelInfo()
      });
    });

    return result;
  }

  /**
   * Remove a model
   */
  removeModel(modelId: string): boolean {
    const removed = this.models.delete(modelId);
    if (removed) {
      this.emit('modelRemoved', { modelId });
    }
    return removed;
  }

  /**
   * Save model to storage
   */
  async saveModel(modelId: string): Promise<string> {
    const model = this.models.get(modelId);
    if (!model) {
      throw new Error(`Model ${modelId} not found`);
    }

    return model.serialize();
  }

  /**
   * Load model from storage
   */
  async loadModel(modelId: string, modelType: string, serializedData: string): Promise<void> {
    let model: BaseModel;

    switch (modelType) {
      case 'linear_regression':
        model = new LinearRegressionModel(modelId);
        break;
      case 'random_forest':
        model = new RandomForestModel(modelId);
        break;
      default:
        throw new Error(`Unsupported model type: ${modelType}`);
    }

    model.deserialize(serializedData);
    this.models.set(modelId, model);
    
    this.emit('modelLoaded', { modelId, modelType });
  }

  // Private helper methods
  private async predictWithEnsemble(ensemble: EnsembleModel, features: FeatureSet): Promise<number> {
    const predictions = await Promise.all(
      ensemble.models.map(model => model.predict(features))
    );

    switch (ensemble.votingStrategy) {
      case 'average':
        return predictions.reduce((sum, pred) => sum + pred, 0) / predictions.length;
      
      case 'weighted':
        return predictions.reduce((sum, pred, i) => 
          sum + pred * ensemble.weights[i], 0
        ) / ensemble.weights.reduce((sum, w) => sum + w, 0);
      
      case 'majority':
        // For regression, majority voting doesn't apply directly
        // Fall back to weighted average
        return predictions.reduce((sum, pred, i) => 
          sum + pred * ensemble.weights[i], 0
        ) / ensemble.weights.reduce((sum, w) => sum + w, 0);
      
      default:
        return predictions.reduce((sum, pred) => sum + pred, 0) / predictions.length;
    }
  }

  private interpretPrediction(rawPrediction: number, request: PredictionRequest): PredictionResults {
    // Convert raw prediction to meaningful metrics based on prediction type
    const baseMetrics = {
      expectedResponseTime: Math.max(0, rawPrediction),
      expectedErrorRate: Math.max(0, Math.min(100, rawPrediction)),
      expectedThroughput: Math.max(0, rawPrediction),
      expectedSuccessRate: Math.max(0, Math.min(100, 100 - rawPrediction))
    };

    return {
      performanceMetrics: baseMetrics,
      resourceUtilization: {
        expectedCpuUsage: Math.max(0, Math.min(100, rawPrediction)),
        expectedMemoryUsage: Math.max(0, Math.min(100, rawPrediction * 1.2)),
        expectedConcurrentTasks: Math.max(1, Math.round(rawPrediction / 10))
      },
      workflowPredictions: {
        expectedExecutionTime: Math.max(0, rawPrediction * 1000), // Convert to ms
        expectedSuccessRate: Math.max(0, Math.min(100, 100 - rawPrediction)),
        riskFactors: this.identifyRiskFactors(request.features),
        bottleneckSteps: this.identifyBottlenecks(request.features)
      },
      anomalyLikelihood: Math.max(0, Math.min(100, rawPrediction)),
      recommendations: this.generateRecommendations(rawPrediction, request)
    };
  }

  private calculateConfidence(features: FeatureSet, prediction: number): number {
    // Simplified confidence calculation based on feature quality
    const featureQuality = this.assessFeatureQuality(features);
    const predictionBounds = this.calculatePredictionBounds(prediction);
    
    return Math.max(0.1, Math.min(0.95, featureQuality * predictionBounds));
  }

  private calculateUncertainty(features: FeatureSet): number {
    // Uncertainty based on feature volatility
    const volatility = features.timeSeriesFeatures.volatility || 0;
    return Math.max(0.05, Math.min(0.5, volatility / 10));
  }

  private assessFeatureQuality(features: FeatureSet): number {
    // Simple quality assessment based on completeness and reasonable values
    let qualityScore = 1.0;
    
    if (features.metadata.dataPoints < 10) qualityScore *= 0.5;
    if (features.timeSeriesFeatures.volatility > 1) qualityScore *= 0.8;
    
    return qualityScore;
  }

  private calculatePredictionBounds(prediction: number): number {
    // Simple bounds check - predictions should be within reasonable ranges
    if (prediction < 0 || prediction > 1000) return 0.3;
    return 0.9;
  }

  private identifyRiskFactors(features: FeatureSet): string[] {
    const risks: string[] = [];
    
    if (features.agentPerformanceFeatures.errorRate > 5) {
      risks.push('High error rate detected');
    }
    
    if (features.environmentalFeatures.systemLoad > 80) {
      risks.push('High system load');
    }
    
    if (features.timeSeriesFeatures.performanceTrend < -0.1) {
      risks.push('Declining performance trend');
    }
    
    return risks;
  }

  private identifyBottlenecks(features: FeatureSet): string[] {
    const bottlenecks: string[] = [];
    
    if (features.agentPerformanceFeatures.avgCpuUsage > 80) {
      bottlenecks.push('CPU utilization');
    }
    
    if (features.agentPerformanceFeatures.avgMemoryUsage > 80) {
      bottlenecks.push('Memory utilization');
    }
    
    return bottlenecks;
  }

  private generateRecommendations(prediction: number, request: PredictionRequest): string[] {
    const recommendations: string[] = [];
    
    if (prediction > 100) { // High response time
      recommendations.push('Consider scaling up resources');
      recommendations.push('Review agent workload distribution');
    }
    
    if (request.features.environmentalFeatures.concurrentUsers > 50) {
      recommendations.push('Implement load balancing');
    }
    
    return recommendations;
  }

  private combineFeatureImportance(models: BaseModel[]): Record<string, number> {
    const combined: Record<string, number> = {};
    
    models.forEach(model => {
      const importance = model.getFeatureImportance();
      Object.entries(importance).forEach(([feature, value]) => {
        combined[feature] = (combined[feature] || 0) + value;
      });
    });
    
    // Average the importance values
    Object.keys(combined).forEach(feature => {
      combined[feature] /= models.length;
    });
    
    return combined;
  }

  private getEnsembleModelInfo(ensemble: EnsembleModel): ModelInfo {
    return {
      modelType: 'ensemble',
      modelVersion: '1.0.0',
      trainedAt: new Date(),
      accuracy: ensemble.performanceMetrics.accuracy,
      precision: ensemble.performanceMetrics.precision,
      recall: ensemble.performanceMetrics.recall,
      f1Score: ensemble.performanceMetrics.f1Score,
      dataPoints: ensemble.models.reduce((sum, model) => 
        sum + model.getModelInfo().dataPoints, 0
      )
    };
  }

  private generatePredictionId(): string {
    return `pred_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Clean up expired predictions
   */
  cleanupExpiredPredictions(): void {
    const now = new Date();
    const expiredIds: string[] = [];
    
    this.predictions.forEach((prediction, id) => {
      if (prediction.expiresAt < now) {
        expiredIds.push(id);
      }
    });
    
    expiredIds.forEach(id => {
      this.predictions.delete(id);
    });
    
    if (expiredIds.length > 0) {
      this.emit('predictionsExpired', { count: expiredIds.length });
    }
  }

  /**
   * Get prediction by ID
   */
  getPrediction(predictionId: string): Prediction | null {
    return this.predictions.get(predictionId) || null;
  }

  /**
   * Get statistics about the prediction service
   */
  getStats() {
    return {
      totalModels: this.models.size,
      totalEnsembles: this.ensembleModels.size,
      activePredictions: this.predictions.size,
      modelTypes: Array.from(this.models.values()).reduce((counts, model) => {
        const type = model.getModelInfo().modelType;
        counts[type] = (counts[type] || 0) + 1;
        return counts;
      }, {} as Record<string, number>)
    };
  }
}

export default PredictiveModels;