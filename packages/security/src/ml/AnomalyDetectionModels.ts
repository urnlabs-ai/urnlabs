/**
 * Anomaly Detection Models
 *
 * Implements multiple anomaly detection algorithms:
 * - Isolation Forest for unsupervised outlier detection
 * - Statistical models (Z-score, moving averages)
 * - LSTM for sequential pattern analysis
 * - Clustering-based anomaly detection
 */

import { EventEmitter } from 'events';
import axios from 'axios';

export interface AnomalyResult {
  modelName: string;
  anomalyScore: number; // 0-1 score
  isAnomaly: boolean;
  confidence: number;
  features: Record<string, any>;
  explanation: string;
}

export interface ModelMetrics {
  name: string;
  accuracy: number;
  precision: number;
  recall: number;
  f1Score: number;
  lastTrained: Date;
  trainingDataSize: number;
  false_positive_rate: number;
  true_positive_rate: number;
}

export interface FeatureVector {
  // Temporal features
  hour: number;
  dayOfWeek: number;
  isWeekend: boolean;
  isBusinessHours: boolean;

  // Categorical features (encoded)
  eventType_encoded: number;
  category_encoded: number;
  severity_encoded: number;
  outcome_encoded: number;
  actorType_encoded: number;

  // Numerical features
  duration: number;
  failureRate: number;
  actionsPerSession: number;
  uniqueResourcesCount: number;
  timeSinceLastEvent: number;
  eventFrequency: number;

  // Derived features
  riskScore: number;
  complianceFlags: number;
}

export class AnomalyDetectionModels extends EventEmitter {
  private models: Map<string, any> = new Map();
  private modelMetrics: Map<string, ModelMetrics> = new Map();
  private featureStatistics: Map<string, { mean: number; std: number; min: number; max: number }> = new Map();
  private isInitialized: boolean = false;

  private readonly ANOMALY_THRESHOLD = 0.6;
  private readonly ML_SERVICE_TIMEOUT = 5000; // 5 seconds

  constructor(
    private config: any,
    private pythonMLServiceUrl?: string
  ) {
    super();
  }

  /**
   * Initialize anomaly detection models
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // Initialize statistical models
      await this.initializeStatisticalModels();

      // Initialize ML models (if Python service is available)
      if (this.pythonMLServiceUrl) {
        await this.initializeMLModels();
      }

      this.isInitialized = true;
      this.emit('initialized');

    } catch (error) {
      throw new Error(`Failed to initialize AnomalyDetectionModels: ${error.message}`);
    }
  }

  /**
   * Detect anomalies in feature vector
   */
  async detectAnomalies(features: Record<string, any>): Promise<AnomalyResult[]> {
    const results: AnomalyResult[] = [];

    try {
      // Convert features to standardized vector
      const featureVector = this.prepareFeatureVector(features);

      // Run statistical models
      results.push(...await this.runStatisticalModels(featureVector, features));

      // Run ML models if available
      if (this.pythonMLServiceUrl) {
        results.push(...await this.runMLModels(featureVector, features));
      }

      return results.filter(result => result.isAnomaly);

    } catch (error) {
      this.emit('detectionError', { features, error: error.message });
      return [];
    }
  }

  /**
   * Initialize statistical anomaly detection models
   */
  private async initializeStatisticalModels(): Promise<void> {
    // Z-Score model
    this.models.set('zscore', {
      name: 'Z-Score',
      type: 'statistical',
      threshold: 2.5, // Standard deviations
      features: ['duration', 'eventFrequency', 'actionsPerSession']
    });

    // Moving Average model
    this.models.set('moving_average', {
      name: 'Moving Average',
      type: 'statistical',
      windowSize: 100,
      threshold: 2.0,
      movingAverages: new Map(),
      features: ['eventFrequency', 'duration']
    });

    // Interquartile Range (IQR) model
    this.models.set('iqr', {
      name: 'IQR Outlier Detection',
      type: 'statistical',
      multiplier: 1.5,
      features: ['duration', 'actionsPerSession', 'riskScore']
    });

    // Initialize feature statistics
    await this.initializeFeatureStatistics();
  }

  /**
   * Initialize ML-based models via Python service
   */
  private async initializeMLModels(): Promise<void> {
    try {
      // Check if Python ML service is available
      const response = await axios.get(`${this.pythonMLServiceUrl}/health`, {
        timeout: this.ML_SERVICE_TIMEOUT
      });

      if (response.status === 200) {
        // Initialize Isolation Forest
        await this.initializeIsolationForest();

        // Initialize LSTM for sequential analysis
        await this.initializeLSTM();

        // Initialize clustering model
        await this.initializeClustering();
      }
    } catch (error) {
      console.warn('Python ML service not available, using statistical models only:', error.message);
    }
  }

  /**
   * Initialize Isolation Forest model
   */
  private async initializeIsolationForest(): Promise<void> {
    try {
      const response = await axios.post(`${this.pythonMLServiceUrl}/models/isolation_forest/initialize`, {
        contamination: 0.1, // Expected proportion of outliers
        n_estimators: 100,
        random_state: 42
      }, { timeout: this.ML_SERVICE_TIMEOUT });

      if (response.data.success) {
        this.models.set('isolation_forest', {
          name: 'Isolation Forest',
          type: 'ml',
          endpoint: '/models/isolation_forest/predict',
          initialized: true
        });
      }
    } catch (error) {
      console.warn('Failed to initialize Isolation Forest:', error.message);
    }
  }

  /**
   * Initialize LSTM model for sequential analysis
   */
  private async initializeLSTM(): Promise<void> {
    try {
      const response = await axios.post(`${this.pythonMLServiceUrl}/models/lstm/initialize`, {
        sequence_length: 10,
        features: ['hour', 'eventType_encoded', 'duration', 'eventFrequency'],
        hidden_units: 50,
        dropout_rate: 0.2
      }, { timeout: this.ML_SERVICE_TIMEOUT });

      if (response.data.success) {
        this.models.set('lstm', {
          name: 'LSTM Sequential',
          type: 'ml',
          endpoint: '/models/lstm/predict',
          initialized: true,
          sequenceLength: 10
        });
      }
    } catch (error) {
      console.warn('Failed to initialize LSTM:', error.message);
    }
  }

  /**
   * Initialize clustering-based anomaly detection
   */
  private async initializeClustering(): Promise<void> {
    try {
      const response = await axios.post(`${this.pythonMLServiceUrl}/models/clustering/initialize`, {
        algorithm: 'kmeans',
        n_clusters: 5,
        contamination: 0.1
      }, { timeout: this.ML_SERVICE_TIMEOUT });

      if (response.data.success) {
        this.models.set('clustering', {
          name: 'K-Means Clustering',
          type: 'ml',
          endpoint: '/models/clustering/predict',
          initialized: true
        });
      }
    } catch (error) {
      console.warn('Failed to initialize clustering model:', error.message);
    }
  }

  /**
   * Prepare feature vector for ML models
   */
  private prepareFeatureVector(features: Record<string, any>): FeatureVector {
    // Encode categorical variables
    const eventTypeEncoding = { 'LOGIN': 0, 'LOGOUT': 1, 'ACCESS': 2, 'MODIFY': 3, 'DELETE': 4, 'OTHER': 5 };
    const categoryEncoding = { 'AUTHENTICATION': 0, 'AUTHORIZATION': 1, 'DATA_ACCESS': 2, 'SYSTEM': 3, 'SECURITY': 4, 'COMPLIANCE': 5 };
    const severityEncoding = { 'LOW': 0, 'MEDIUM': 1, 'HIGH': 2, 'CRITICAL': 3 };
    const outcomeEncoding = { 'SUCCESS': 0, 'FAILURE': 1, 'PARTIAL': 2 };
    const actorTypeEncoding = { 'USER': 0, 'SYSTEM': 1, 'SERVICE': 2, 'ANONYMOUS': 3 };

    return {
      // Temporal features
      hour: features.hour || 12,
      dayOfWeek: features.dayOfWeek || 1,
      isWeekend: features.isWeekend ? 1 : 0,
      isBusinessHours: features.isBusinessHours ? 1 : 0,

      // Categorical features (encoded)
      eventType_encoded: eventTypeEncoding[features.eventType] || 5,
      category_encoded: categoryEncoding[features.category] || 5,
      severity_encoded: severityEncoding[features.severity] || 0,
      outcome_encoded: outcomeEncoding[features.outcome] || 0,
      actorType_encoded: actorTypeEncoding[features.actorType] || 0,

      // Numerical features
      duration: features.duration || 0,
      failureRate: features.failureRate || 0,
      actionsPerSession: features.actionsPerSession || 1,
      uniqueResourcesCount: features.uniqueResourcesAccessed || 1,
      timeSinceLastEvent: features.timeSinceLastEvent || 0,
      eventFrequency: features.eventFrequency || 1,

      // Derived features
      riskScore: this.calculateRiskScore(features),
      complianceFlags: features.complianceFlags ? features.complianceFlags.length : 0
    };
  }

  /**
   * Run statistical anomaly detection models
   */
  private async runStatisticalModels(featureVector: FeatureVector, originalFeatures: Record<string, any>): Promise<AnomalyResult[]> {
    const results: AnomalyResult[] = [];

    // Z-Score anomaly detection
    const zscoreResult = this.runZScoreDetection(featureVector);
    if (zscoreResult.isAnomaly) {
      results.push(zscoreResult);
    }

    // Moving average anomaly detection
    const movingAvgResult = this.runMovingAverageDetection(featureVector);
    if (movingAvgResult.isAnomaly) {
      results.push(movingAvgResult);
    }

    // IQR anomaly detection
    const iqrResult = this.runIQRDetection(featureVector);
    if (iqrResult.isAnomaly) {
      results.push(iqrResult);
    }

    return results;
  }

  /**
   * Z-Score based anomaly detection
   */
  private runZScoreDetection(featureVector: FeatureVector): AnomalyResult {
    const model = this.models.get('zscore');
    const features = ['duration', 'eventFrequency', 'actionsPerSession'];

    let maxZScore = 0;
    let anomalousFeature = '';

    for (const feature of features) {
      const value = featureVector[feature as keyof FeatureVector] as number;
      const stats = this.featureStatistics.get(feature);

      if (stats && stats.std > 0) {
        const zScore = Math.abs((value - stats.mean) / stats.std);
        if (zScore > maxZScore) {
          maxZScore = zScore;
          anomalousFeature = feature;
        }
      }
    }

    const isAnomaly = maxZScore > model.threshold;
    const anomalyScore = Math.min(maxZScore / 4.0, 1.0); // Normalize to 0-1

    return {
      modelName: 'Z-Score',
      anomalyScore,
      isAnomaly,
      confidence: isAnomaly ? Math.min(maxZScore / model.threshold, 1.0) : 0,
      features: { zScore: maxZScore, feature: anomalousFeature },
      explanation: isAnomaly
        ? `${anomalousFeature} deviates ${maxZScore.toFixed(2)} standard deviations from normal`
        : 'No significant deviations detected'
    };
  }

  /**
   * Moving average based anomaly detection
   */
  private runMovingAverageDetection(featureVector: FeatureVector): AnomalyResult {
    const model = this.models.get('moving_average');
    const features = ['eventFrequency', 'duration'];

    let maxDeviation = 0;
    let anomalousFeature = '';

    for (const feature of features) {
      const value = featureVector[feature as keyof FeatureVector] as number;
      const movingAvg = this.getMovingAverage(feature, value);

      if (movingAvg > 0) {
        const deviation = Math.abs(value - movingAvg) / movingAvg;
        if (deviation > maxDeviation) {
          maxDeviation = deviation;
          anomalousFeature = feature;
        }
      }
    }

    const isAnomaly = maxDeviation > model.threshold;
    const anomalyScore = Math.min(maxDeviation / 3.0, 1.0);

    return {
      modelName: 'Moving Average',
      anomalyScore,
      isAnomaly,
      confidence: isAnomaly ? Math.min(maxDeviation / model.threshold, 1.0) : 0,
      features: { deviation: maxDeviation, feature: anomalousFeature },
      explanation: isAnomaly
        ? `${anomalousFeature} deviates ${(maxDeviation * 100).toFixed(1)}% from moving average`
        : 'Values within normal range of moving averages'
    };
  }

  /**
   * IQR based anomaly detection
   */
  private runIQRDetection(featureVector: FeatureVector): AnomalyResult {
    const model = this.models.get('iqr');
    const features = ['duration', 'actionsPerSession', 'riskScore'];

    let isAnomaly = false;
    let anomalousFeatures: string[] = [];
    let maxOutlierScore = 0;

    for (const feature of features) {
      const value = featureVector[feature as keyof FeatureVector] as number;
      const stats = this.featureStatistics.get(feature);

      if (stats) {
        // Calculate IQR (using simplified quartiles)
        const q1 = stats.mean - (0.675 * stats.std); // Approximate Q1
        const q3 = stats.mean + (0.675 * stats.std); // Approximate Q3
        const iqr = q3 - q1;

        const lowerBound = q1 - (model.multiplier * iqr);
        const upperBound = q3 + (model.multiplier * iqr);

        if (value < lowerBound || value > upperBound) {
          isAnomaly = true;
          anomalousFeatures.push(feature);

          const outlierScore = Math.max(
            (lowerBound - value) / iqr,
            (value - upperBound) / iqr,
            0
          );
          maxOutlierScore = Math.max(maxOutlierScore, outlierScore);
        }
      }
    }

    const anomalyScore = Math.min(maxOutlierScore / 2.0, 1.0);

    return {
      modelName: 'IQR Outlier Detection',
      anomalyScore,
      isAnomaly,
      confidence: isAnomaly ? Math.min(maxOutlierScore / 3.0, 1.0) : 0,
      features: { outlierFeatures: anomalousFeatures, outlierScore: maxOutlierScore },
      explanation: isAnomaly
        ? `Outliers detected in: ${anomalousFeatures.join(', ')}`
        : 'No outliers detected'
    };
  }

  /**
   * Run ML-based anomaly detection models
   */
  private async runMLModels(featureVector: FeatureVector, originalFeatures: Record<string, any>): Promise<AnomalyResult[]> {
    const results: AnomalyResult[] = [];

    try {
      // Isolation Forest
      if (this.models.has('isolation_forest')) {
        const isolationResult = await this.runIsolationForest(featureVector);
        if (isolationResult.isAnomaly) {
          results.push(isolationResult);
        }
      }

      // LSTM Sequential Analysis
      if (this.models.has('lstm')) {
        const lstmResult = await this.runLSTM(featureVector);
        if (lstmResult.isAnomaly) {
          results.push(lstmResult);
        }
      }

      // Clustering-based detection
      if (this.models.has('clustering')) {
        const clusteringResult = await this.runClustering(featureVector);
        if (clusteringResult.isAnomaly) {
          results.push(clusteringResult);
        }
      }

    } catch (error) {
      console.error('Error running ML models:', error.message);
    }

    return results;
  }

  /**
   * Run Isolation Forest anomaly detection
   */
  private async runIsolationForest(featureVector: FeatureVector): Promise<AnomalyResult> {
    try {
      const model = this.models.get('isolation_forest');
      const response = await axios.post(
        `${this.pythonMLServiceUrl}${model.endpoint}`,
        { features: Object.values(featureVector) },
        { timeout: this.ML_SERVICE_TIMEOUT }
      );

      const result = response.data;
      const isAnomaly = result.anomaly_score > this.ANOMALY_THRESHOLD;

      return {
        modelName: 'Isolation Forest',
        anomalyScore: result.anomaly_score,
        isAnomaly,
        confidence: result.confidence || result.anomaly_score,
        features: { isolationScore: result.anomaly_score },
        explanation: isAnomaly
          ? `Isolation Forest detected anomaly (score: ${result.anomaly_score.toFixed(3)})`
          : 'Normal behavior detected by Isolation Forest'
      };

    } catch (error) {
      return {
        modelName: 'Isolation Forest',
        anomalyScore: 0,
        isAnomaly: false,
        confidence: 0,
        features: { error: error.message },
        explanation: 'Isolation Forest model unavailable'
      };
    }
  }

  /**
   * Run LSTM sequential analysis
   */
  private async runLSTM(featureVector: FeatureVector): Promise<AnomalyResult> {
    try {
      const model = this.models.get('lstm');

      // For LSTM, we need a sequence of features
      // In practice, you'd maintain a sliding window of recent events
      const sequence = Array(model.sequenceLength).fill(Object.values(featureVector));

      const response = await axios.post(
        `${this.pythonMLServiceUrl}${model.endpoint}`,
        { sequence },
        { timeout: this.ML_SERVICE_TIMEOUT }
      );

      const result = response.data;
      const isAnomaly = result.prediction_error > this.ANOMALY_THRESHOLD;

      return {
        modelName: 'LSTM Sequential',
        anomalyScore: result.prediction_error,
        isAnomaly,
        confidence: result.confidence || result.prediction_error,
        features: { predictionError: result.prediction_error, sequence_length: model.sequenceLength },
        explanation: isAnomaly
          ? `LSTM detected unusual sequence pattern (error: ${result.prediction_error.toFixed(3)})`
          : 'Sequence pattern within normal range'
      };

    } catch (error) {
      return {
        modelName: 'LSTM Sequential',
        anomalyScore: 0,
        isAnomaly: false,
        confidence: 0,
        features: { error: error.message },
        explanation: 'LSTM model unavailable'
      };
    }
  }

  /**
   * Run clustering-based anomaly detection
   */
  private async runClustering(featureVector: FeatureVector): Promise<AnomalyResult> {
    try {
      const model = this.models.get('clustering');
      const response = await axios.post(
        `${this.pythonMLServiceUrl}${model.endpoint}`,
        { features: Object.values(featureVector) },
        { timeout: this.ML_SERVICE_TIMEOUT }
      );

      const result = response.data;
      const isAnomaly = result.distance_to_centroid > this.ANOMALY_THRESHOLD;

      return {
        modelName: 'K-Means Clustering',
        anomalyScore: result.distance_to_centroid,
        isAnomaly,
        confidence: result.confidence || result.distance_to_centroid,
        features: {
          distanceToCentroid: result.distance_to_centroid,
          assignedCluster: result.cluster_id
        },
        explanation: isAnomaly
          ? `Point far from cluster centroids (distance: ${result.distance_to_centroid.toFixed(3)})`
          : `Point belongs to cluster ${result.cluster_id}`
      };

    } catch (error) {
      return {
        modelName: 'K-Means Clustering',
        anomalyScore: 0,
        isAnomaly: false,
        confidence: 0,
        features: { error: error.message },
        explanation: 'Clustering model unavailable'
      };
    }
  }

  /**
   * Calculate simple risk score from features
   */
  private calculateRiskScore(features: Record<string, any>): number {
    let score = 0;

    // Severity impact
    const severityScores = { 'LOW': 1, 'MEDIUM': 3, 'HIGH': 6, 'CRITICAL': 10 };
    score += severityScores[features.severity] || 1;

    // Outcome impact
    if (features.outcome === 'FAILURE') score += 5;
    if (features.outcome === 'PARTIAL') score += 2;

    // Time-based risk
    if (!features.isBusinessHours) score += 2;
    if (features.isWeekend) score += 1;

    // Actor type risk
    const actorRisk = { 'ANONYMOUS': 5, 'USER': 1, 'SERVICE': 0.5, 'SYSTEM': 0.2 };
    score += actorRisk[features.actorType] || 1;

    return Math.min(score, 10);
  }

  /**
   * Initialize feature statistics for statistical models
   */
  private async initializeFeatureStatistics(): Promise<void> {
    // In practice, these would be calculated from historical data
    // For now, use reasonable defaults
    const defaultStats = {
      duration: { mean: 1000, std: 500, min: 0, max: 10000 },
      eventFrequency: { mean: 10, std: 5, min: 1, max: 100 },
      actionsPerSession: { mean: 15, std: 8, min: 1, max: 50 },
      riskScore: { mean: 3, std: 2, min: 0, max: 10 },
      timeSinceLastEvent: { mean: 300000, std: 200000, min: 0, max: 3600000 }
    };

    for (const [feature, stats] of Object.entries(defaultStats)) {
      this.featureStatistics.set(feature, stats);
    }
  }

  /**
   * Get moving average for a feature
   */
  private getMovingAverage(feature: string, newValue: number): number {
    const model = this.models.get('moving_average');
    if (!model.movingAverages.has(feature)) {
      model.movingAverages.set(feature, []);
    }

    const values = model.movingAverages.get(feature);
    values.push(newValue);

    // Keep only the last N values
    if (values.length > model.windowSize) {
      values.shift();
    }

    // Calculate moving average
    return values.reduce((sum, val) => sum + val, 0) / values.length;
  }

  /**
   * Load pre-trained models
   */
  async loadModels(): Promise<void> {
    try {
      // Load model configurations and statistics
      await this.initializeFeatureStatistics();

      // If Python service is available, load trained models
      if (this.pythonMLServiceUrl) {
        await this.loadMLModels();
      }

    } catch (error) {
      console.warn('Could not load trained models:', error.message);
    }
  }

  /**
   * Load ML models from Python service
   */
  private async loadMLModels(): Promise<void> {
    try {
      const response = await axios.get(`${this.pythonMLServiceUrl}/models/status`, {
        timeout: this.ML_SERVICE_TIMEOUT
      });

      const modelStatuses = response.data.models;

      for (const [modelName, status] of Object.entries(modelStatuses)) {
        if (status.loaded && this.models.has(modelName)) {
          const model = this.models.get(modelName);
          model.initialized = true;
          model.lastLoaded = new Date();
        }
      }

    } catch (error) {
      console.warn('Could not load ML model status:', error.message);
    }
  }

  /**
   * Retrain models with new data
   */
  async retrain(): Promise<void> {
    try {
      // Update feature statistics
      await this.updateFeatureStatistics();

      // Retrain ML models if available
      if (this.pythonMLServiceUrl) {
        await this.retrainMLModels();
      }

      this.emit('modelsRetrained', {
        timestamp: new Date(),
        modelsRetrained: Array.from(this.models.keys())
      });

    } catch (error) {
      this.emit('retrainingError', error);
    }
  }

  /**
   * Update feature statistics with new data
   */
  private async updateFeatureStatistics(): Promise<void> {
    // In practice, would recalculate statistics from recent data
    // For now, just update timestamps
    for (const [feature, stats] of this.featureStatistics) {
      // Slight drift to simulate learning
      stats.mean *= (0.99 + Math.random() * 0.02);
      stats.std *= (0.99 + Math.random() * 0.02);
    }
  }

  /**
   * Retrain ML models via Python service
   */
  private async retrainMLModels(): Promise<void> {
    try {
      const response = await axios.post(`${this.pythonMLServiceUrl}/models/retrain`, {
        models: Array.from(this.models.keys()).filter(name =>
          this.models.get(name).type === 'ml'
        )
      }, { timeout: 30000 }); // Longer timeout for retraining

      if (response.data.success) {
        console.log('ML models retrained successfully');
      }

    } catch (error) {
      console.error('Failed to retrain ML models:', error.message);
    }
  }

  /**
   * Get model performance metrics
   */
  getModelMetrics(): ModelMetrics[] {
    return Array.from(this.modelMetrics.values());
  }

  /**
   * Shutdown the anomaly detection models
   */
  async shutdown(): Promise<void> {
    this.isInitialized = false;
  }
}