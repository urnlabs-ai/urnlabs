/**
 * Anomaly Detector - Machine Learning-based Anomaly Detection
 * Implements statistical and ML-based anomaly detection algorithms
 */

import EventEmitter from 'events';
import { Logger } from 'pino';
import * as tf from '@tensorflow/tfjs-node';
import { Matrix } from 'ml-matrix';
import * as stats from 'simple-statistics';
import {
  SecurityEvent,
  IDSConfiguration,
  AnomalyDetectionResult,
  AnomalyFeature,
  MLModel,
  MLModelType,
  MLModelStatus,
  TrainingDataInfo
} from './types';

export interface AnomalyDetectionModels {
  isolation_forest: tf.LayersModel | null;
  autoencoder: tf.LayersModel | null;
  lstm: tf.LayersModel | null;
  statistical: StatisticalModel | null;
}

export interface StatisticalModel {
  features: FeatureStatistics[];
  thresholds: Map<string, number>;
  zscore_threshold: number;
  mad_threshold: number;
}

export interface FeatureStatistics {
  name: string;
  mean: number;
  std: number;
  median: number;
  mad: number; // Median Absolute Deviation
  min: number;
  max: number;
  percentiles: { p25: number; p75: number; p95: number; p99: number };
  distribution: string;
}

export interface TrainingData {
  features: number[][];
  labels: number[];
  metadata: any[];
  timestamps: Date[];
}

export class AnomalyDetector extends EventEmitter {
  private config: IDSConfiguration;
  private logger: Logger;
  private models: AnomalyDetectionModels;
  private isInitialized: boolean = false;
  private trainingData: TrainingData;
  private featureExtractor: FeatureExtractor;
  private retrainingInterval?: NodeJS.Timeout;
  private modelMetrics: Map<string, any> = new Map();

  constructor(config: IDSConfiguration, logger: Logger) {
    super();
    this.config = config;
    this.logger = logger.child({ component: 'AnomalyDetector' });
    this.featureExtractor = new FeatureExtractor(logger);
    this.models = {
      isolation_forest: null,
      autoencoder: null,
      lstm: null,
      statistical: null
    };
    this.trainingData = {
      features: [],
      labels: [],
      metadata: [],
      timestamps: []
    };
  }

  /**
   * Initialize the anomaly detector
   */
  async initialize(): Promise<void> {
    try {
      this.logger.info('Initializing Anomaly Detector...');

      // Load or create models
      await this.initializeModels();

      // Load training data
      await this.loadTrainingData();

      // Start periodic retraining
      this.startPeriodicRetraining();

      this.isInitialized = true;
      this.logger.info('Anomaly Detector initialized successfully');

    } catch (error) {
      this.logger.error('Failed to initialize Anomaly Detector:', error);
      throw error;
    }
  }

  /**
   * Stop the anomaly detector
   */
  async stop(): Promise<void> {
    if (this.retrainingInterval) {
      clearInterval(this.retrainingInterval);
    }

    // Dispose of TensorFlow models
    Object.values(this.models).forEach(model => {
      if (model && typeof model.dispose === 'function') {
        model.dispose();
      }
    });

    this.logger.info('Anomaly Detector stopped');
  }

  /**
   * Detect anomalies in security event
   */
  async detectAnomalies(event: SecurityEvent): Promise<AnomalyDetectionResult> {
    if (!this.isInitialized) {
      throw new Error('Anomaly Detector not initialized');
    }

    try {
      // Extract features from event
      const features = await this.featureExtractor.extractFeatures(event);

      // Run multiple detection algorithms
      const results = await Promise.all([
        this.detectWithStatisticalModel(features),
        this.detectWithAutoencoder(features),
        this.detectWithIsolationForest(features),
        this.detectWithLSTM(features)
      ]);

      // Combine results using ensemble method
      const combinedResult = this.combineDetectionResults(results, features);

      // Log significant anomalies
      if (combinedResult.isAnomalous && combinedResult.confidence > 0.8) {
        this.logger.warn(`High-confidence anomaly detected in event ${event.id}`, {
          anomalyScore: combinedResult.anomalyScore,
          confidence: combinedResult.confidence,
          features: combinedResult.features.length
        });

        this.emit('anomalyDetected', combinedResult, event);
      }

      // Update training data with new sample
      await this.updateTrainingData(features, combinedResult.isAnomalous, event);

      return combinedResult;

    } catch (error) {
      this.logger.error(`Error detecting anomalies in event ${event.id}:`, error);
      return this.createDefaultResult();
    }
  }

  /**
   * Train models with new data
   */
  async trainModels(trainingData?: TrainingData): Promise<void> {
    try {
      this.logger.info('Starting model training...');

      const data = trainingData || this.trainingData;
      if (data.features.length < 100) {
        this.logger.warn('Insufficient training data, skipping training');
        return;
      }

      // Train statistical model
      await this.trainStatisticalModel(data);

      // Train autoencoder
      await this.trainAutoencoder(data);

      // Train isolation forest (simplified implementation)
      await this.trainIsolationForest(data);

      // Train LSTM model
      await this.trainLSTM(data);

      this.logger.info('Model training completed successfully');
      this.emit('modelsRetrained', this.getModelMetrics());

    } catch (error) {
      this.logger.error('Error training models:', error);
      throw error;
    }
  }

  /**
   * Statistical anomaly detection
   */
  private async detectWithStatisticalModel(features: number[]): Promise<DetectionResult> {
    if (!this.models.statistical) {
      return { isAnomalous: false, score: 0, confidence: 0, method: 'statistical' };
    }

    const model = this.models.statistical;
    const anomalies: number[] = [];

    features.forEach((value, index) => {
      if (index < model.features.length) {
        const featureStats = model.features[index];
        
        // Z-score test
        const zscore = Math.abs((value - featureStats.mean) / featureStats.std);
        if (zscore > model.zscore_threshold) {
          anomalies.push(zscore);
        }

        // Modified Z-score (MAD) test
        const madScore = Math.abs((value - featureStats.median) / featureStats.mad);
        if (madScore > model.mad_threshold) {
          anomalies.push(madScore);
        }
      }
    });

    const score = anomalies.length > 0 ? Math.max(...anomalies) / 10 : 0; // Normalize to 0-1
    const isAnomalous = anomalies.length > 0;
    const confidence = isAnomalous ? Math.min(1, score * 2) : 0.9;

    return { isAnomalous, score, confidence, method: 'statistical' };
  }

  /**
   * Autoencoder-based anomaly detection
   */
  private async detectWithAutoencoder(features: number[]): Promise<DetectionResult> {
    if (!this.models.autoencoder) {
      return { isAnomalous: false, score: 0, confidence: 0, method: 'autoencoder' };
    }

    try {
      const inputTensor = tf.tensor2d([features]);
      const reconstruction = this.models.autoencoder.predict(inputTensor) as tf.Tensor;
      const reconstructionData = await reconstruction.data();
      
      // Calculate reconstruction error
      let error = 0;
      for (let i = 0; i < features.length; i++) {
        error += Math.pow(features[i] - reconstructionData[i], 2);
      }
      error = Math.sqrt(error / features.length);

      // Clean up tensors
      inputTensor.dispose();
      reconstruction.dispose();

      const threshold = 0.1; // This would be learned during training
      const isAnomalous = error > threshold;
      const score = Math.min(1, error / threshold);
      const confidence = 0.8;

      return { isAnomalous, score, confidence, method: 'autoencoder' };

    } catch (error) {
      this.logger.error('Error in autoencoder detection:', error);
      return { isAnomalous: false, score: 0, confidence: 0, method: 'autoencoder' };
    }
  }

  /**
   * Isolation Forest-based anomaly detection
   */
  private async detectWithIsolationForest(features: number[]): Promise<DetectionResult> {
    // Simplified isolation forest implementation
    // In production, you would use a proper implementation
    
    if (!this.models.isolation_forest) {
      return { isAnomalous: false, score: 0, confidence: 0, method: 'isolation_forest' };
    }

    try {
      const inputTensor = tf.tensor2d([features]);
      const prediction = this.models.isolation_forest.predict(inputTensor) as tf.Tensor;
      const predictionData = await prediction.data();
      
      // Clean up tensors
      inputTensor.dispose();
      prediction.dispose();

      const score = predictionData[0];
      const isAnomalous = score < -0.1; // Negative scores indicate anomalies
      const confidence = 0.7;

      return { isAnomalous, score: Math.abs(score), confidence, method: 'isolation_forest' };

    } catch (error) {
      this.logger.error('Error in isolation forest detection:', error);
      return { isAnomalous: false, score: 0, confidence: 0, method: 'isolation_forest' };
    }
  }

  /**
   * LSTM-based anomaly detection
   */
  private async detectWithLSTM(features: number[]): Promise<DetectionResult> {
    if (!this.models.lstm) {
      return { isAnomalous: false, score: 0, confidence: 0, method: 'lstm' };
    }

    try {
      // For LSTM, we need sequence data
      // This is a simplified implementation
      const inputTensor = tf.tensor3d([[[...features]]]);
      const prediction = this.models.lstm.predict(inputTensor) as tf.Tensor;
      const predictionData = await prediction.data();
      
      // Clean up tensors
      inputTensor.dispose();
      prediction.dispose();

      const score = predictionData[0];
      const isAnomalous = score > 0.5;
      const confidence = 0.6;

      return { isAnomalous, score, confidence, method: 'lstm' };

    } catch (error) {
      this.logger.error('Error in LSTM detection:', error);
      return { isAnomalous: false, score: 0, confidence: 0, method: 'lstm' };
    }
  }

  /**
   * Combine results from multiple detection methods
   */
  private combineDetectionResults(results: DetectionResult[], features: number[]): AnomalyDetectionResult {
    const weights = {
      statistical: 0.3,
      autoencoder: 0.3,
      isolation_forest: 0.25,
      lstm: 0.15
    };

    let weightedScore = 0;
    let weightedConfidence = 0;
    let anomalyCount = 0;

    results.forEach(result => {
      const weight = weights[result.method as keyof typeof weights] || 0.1;
      weightedScore += result.score * weight;
      weightedConfidence += result.confidence * weight;
      if (result.isAnomalous) anomalyCount++;
    });

    const isAnomalous = anomalyCount >= 2; // At least 2 methods agree
    const finalScore = Math.min(1, weightedScore);
    const finalConfidence = weightedConfidence;

    // Generate feature analysis
    const anomalyFeatures = this.analyzeAnomalousFeatures(features);

    return {
      isAnomalous,
      anomalyScore: finalScore * 100,
      confidence: finalConfidence,
      features: anomalyFeatures,
      explanation: this.generateExplanation(results, anomalyFeatures),
      recommendations: this.generateRecommendations(isAnomalous, finalScore, anomalyFeatures)
    };
  }

  /**
   * Analyze which features are anomalous
   */
  private analyzeAnomalousFeatures(features: number[]): AnomalyFeature[] {
    if (!this.models.statistical) {
      return [];
    }

    const anomalyFeatures: AnomalyFeature[] = [];
    const model = this.models.statistical;

    features.forEach((value, index) => {
      if (index < model.features.length) {
        const featureStats = model.features[index];
        const zscore = Math.abs((value - featureStats.mean) / featureStats.std);
        
        if (zscore > 2) { // 2 standard deviations
          anomalyFeatures.push({
            name: `feature_${index}`,
            value,
            expectedValue: featureStats.mean,
            deviation: zscore,
            importance: Math.min(1, zscore / 5) // Normalize importance
          });
        }
      }
    });

    return anomalyFeatures.sort((a, b) => b.importance - a.importance);
  }

  /**
   * Generate explanation for detection result
   */
  private generateExplanation(results: DetectionResult[], features: AnomalyFeature[]): string {
    if (features.length === 0) {
      return 'No significant anomalies detected in the analyzed features.';
    }

    const explanations: string[] = [];
    
    if (features.length > 0) {
      explanations.push(`${features.length} features showed anomalous behavior`);
    }

    const triggeredMethods = results.filter(r => r.isAnomalous).map(r => r.method);
    if (triggeredMethods.length > 0) {
      explanations.push(`Detected by: ${triggeredMethods.join(', ')}`);
    }

    const topFeature = features[0];
    if (topFeature) {
      explanations.push(`Most anomalous feature: ${topFeature.name} (deviation: ${topFeature.deviation.toFixed(2)})`);
    }

    return explanations.join('. ');
  }

  /**
   * Generate recommendations based on detection results
   */
  private generateRecommendations(isAnomalous: boolean, score: number, features: AnomalyFeature[]): string[] {
    const recommendations: string[] = [];

    if (!isAnomalous) {
      recommendations.push('No immediate action required');
      return recommendations;
    }

    if (score > 0.8) {
      recommendations.push('High-priority investigation required');
      recommendations.push('Consider implementing immediate protective measures');
    } else if (score > 0.5) {
      recommendations.push('Monitor closely for additional anomalous behavior');
      recommendations.push('Review recent activity patterns');
    }

    if (features.length > 3) {
      recommendations.push('Multiple behavioral deviations detected - comprehensive review recommended');
    }

    return recommendations;
  }

  /**
   * Initialize detection models
   */
  private async initializeModels(): Promise<void> {
    try {
      // Initialize statistical model
      this.models.statistical = {
        features: [],
        thresholds: new Map(),
        zscore_threshold: 3,
        mad_threshold: 3.5
      };

      // Initialize autoencoder
      this.models.autoencoder = tf.sequential({
        layers: [
          tf.layers.dense({ inputShape: [20], units: 16, activation: 'relu' }),
          tf.layers.dense({ units: 8, activation: 'relu' }),
          tf.layers.dense({ units: 4, activation: 'relu' }),
          tf.layers.dense({ units: 8, activation: 'relu' }),
          tf.layers.dense({ units: 16, activation: 'relu' }),
          tf.layers.dense({ units: 20, activation: 'linear' })
        ]
      });

      this.models.autoencoder.compile({
        optimizer: 'adam',
        loss: 'meanSquaredError'
      });

      // Initialize simplified isolation forest
      this.models.isolation_forest = tf.sequential({
        layers: [
          tf.layers.dense({ inputShape: [20], units: 16, activation: 'relu' }),
          tf.layers.dense({ units: 8, activation: 'relu' }),
          tf.layers.dense({ units: 1, activation: 'tanh' })
        ]
      });

      this.models.isolation_forest.compile({
        optimizer: 'adam',
        loss: 'meanSquaredError'
      });

      // Initialize LSTM
      this.models.lstm = tf.sequential({
        layers: [
          tf.layers.lstm({ units: 32, returnSequences: false, inputShape: [1, 20] }),
          tf.layers.dense({ units: 16, activation: 'relu' }),
          tf.layers.dense({ units: 1, activation: 'sigmoid' })
        ]
      });

      this.models.lstm.compile({
        optimizer: 'adam',
        loss: 'binaryCrossentropy',
        metrics: ['accuracy']
      });

      this.logger.info('All anomaly detection models initialized');

    } catch (error) {
      this.logger.error('Error initializing models:', error);
      throw error;
    }
  }

  /**
   * Train statistical model
   */
  private async trainStatisticalModel(data: TrainingData): Promise<void> {
    if (!this.models.statistical || data.features.length === 0) return;

    const features = data.features;
    const numFeatures = features[0].length;
    
    this.models.statistical.features = [];

    for (let i = 0; i < numFeatures; i++) {
      const featureValues = features.map(row => row[i]);
      
      const mean = stats.mean(featureValues);
      const std = stats.standardDeviation(featureValues);
      const median = stats.median(featureValues);
      const mad = stats.medianAbsoluteDeviation(featureValues);
      const min = stats.min(featureValues);
      const max = stats.max(featureValues);
      
      this.models.statistical.features.push({
        name: `feature_${i}`,
        mean,
        std,
        median,
        mad,
        min,
        max,
        percentiles: {
          p25: stats.quantile(featureValues, 0.25),
          p75: stats.quantile(featureValues, 0.75),
          p95: stats.quantile(featureValues, 0.95),
          p99: stats.quantile(featureValues, 0.99)
        },
        distribution: 'normal' // Simplified
      });
    }

    this.logger.info('Statistical model trained successfully');
  }

  /**
   * Train autoencoder model
   */
  private async trainAutoencoder(data: TrainingData): Promise<void> {
    if (!this.models.autoencoder || data.features.length === 0) return;

    try {
      // Filter normal samples for training autoencoder
      const normalSamples = data.features.filter((_, index) => data.labels[index] === 0);
      
      if (normalSamples.length < 50) {
        this.logger.warn('Insufficient normal samples for autoencoder training');
        return;
      }

      const xs = tf.tensor2d(normalSamples);
      
      await this.models.autoencoder.fit(xs, xs, {
        epochs: 50,
        batchSize: 32,
        validationSplit: 0.2,
        verbose: 0
      });

      xs.dispose();
      this.logger.info('Autoencoder model trained successfully');

    } catch (error) {
      this.logger.error('Error training autoencoder:', error);
    }
  }

  /**
   * Train isolation forest model (simplified)
   */
  private async trainIsolationForest(data: TrainingData): Promise<void> {
    if (!this.models.isolation_forest || data.features.length === 0) return;

    try {
      // Simplified training - in production use proper isolation forest
      const xs = tf.tensor2d(data.features);
      const ys = tf.tensor2d(data.labels.map(label => [label === 1 ? -1 : 1]));
      
      await this.models.isolation_forest.fit(xs, ys, {
        epochs: 30,
        batchSize: 32,
        verbose: 0
      });

      xs.dispose();
      ys.dispose();
      this.logger.info('Isolation forest model trained successfully');

    } catch (error) {
      this.logger.error('Error training isolation forest:', error);
    }
  }

  /**
   * Train LSTM model
   */
  private async trainLSTM(data: TrainingData): Promise<void> {
    if (!this.models.lstm || data.features.length === 0) return;

    try {
      // Reshape data for LSTM (add time dimension)
      const sequences = data.features.map(features => [features]);
      const xs = tf.tensor3d(sequences);
      const ys = tf.tensor2d(data.labels.map(label => [label]));
      
      await this.models.lstm.fit(xs, ys, {
        epochs: 30,
        batchSize: 16,
        validationSplit: 0.2,
        verbose: 0
      });

      xs.dispose();
      ys.dispose();
      this.logger.info('LSTM model trained successfully');

    } catch (error) {
      this.logger.error('Error training LSTM:', error);
    }
  }

  /**
   * Load training data from storage
   */
  private async loadTrainingData(): Promise<void> {
    // Implementation would load from database
    this.logger.info('Training data loaded');
  }

  /**
   * Update training data with new sample
   */
  private async updateTrainingData(features: number[], isAnomalous: boolean, event: SecurityEvent): Promise<void> {
    this.trainingData.features.push(features);
    this.trainingData.labels.push(isAnomalous ? 1 : 0);
    this.trainingData.metadata.push({ eventId: event.id, eventType: event.type });
    this.trainingData.timestamps.push(new Date());

    // Keep only recent data (last 10000 samples)
    if (this.trainingData.features.length > 10000) {
      this.trainingData.features.shift();
      this.trainingData.labels.shift();
      this.trainingData.metadata.shift();
      this.trainingData.timestamps.shift();
    }
  }

  /**
   * Start periodic retraining
   */
  private startPeriodicRetraining(): void {
    this.retrainingInterval = setInterval(() => {
      if (this.trainingData.features.length > 100) {
        this.trainModels().catch(error => {
          this.logger.error('Error during periodic retraining:', error);
        });
      }
    }, 3600000); // Every hour
  }

  /**
   * Get model metrics
   */
  private getModelMetrics(): any {
    return {
      trainingSamples: this.trainingData.features.length,
      models: {
        statistical: this.models.statistical ? 'trained' : 'not_trained',
        autoencoder: this.models.autoencoder ? 'trained' : 'not_trained',
        isolation_forest: this.models.isolation_forest ? 'trained' : 'not_trained',
        lstm: this.models.lstm ? 'trained' : 'not_trained'
      },
      lastTraining: new Date().toISOString()
    };
  }

  /**
   * Create default result
   */
  private createDefaultResult(): AnomalyDetectionResult {
    return {
      isAnomalous: false,
      anomalyScore: 0,
      confidence: 0,
      features: [],
      explanation: 'Unable to perform anomaly detection',
      recommendations: ['Review system logs for errors']
    };
  }

  /**
   * Update configuration
   */
  async updateConfiguration(config: IDSConfiguration): Promise<void> {
    this.config = config;
    this.logger.info('Anomaly detector configuration updated');
  }
}

interface DetectionResult {
  isAnomalous: boolean;
  score: number;
  confidence: number;
  method: string;
}

/**
 * Feature Extractor - Extracts numerical features from security events
 */
class FeatureExtractor {
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger.child({ component: 'FeatureExtractor' });
  }

  /**
   * Extract numerical features from security event
   */
  async extractFeatures(event: SecurityEvent): Promise<number[]> {
    const features: number[] = [];

    // Temporal features
    const timestamp = event.timestamp;
    features.push(timestamp.getHours()); // 0-23
    features.push(timestamp.getDay()); // 0-6
    features.push(timestamp.getMonth()); // 0-11
    features.push(timestamp.getDate()); // 1-31

    // Event type encoding (simplified)
    features.push(this.encodeEventType(event.type));

    // Severity encoding
    features.push(this.encodeSeverity(event.severity));

    // Risk score
    features.push(event.riskScore || 0);

    // Confidence
    features.push(event.confidence || 0);

    // Source features
    if (event.source.ip) {
      features.push(...this.encodeIP(event.source.ip));
    } else {
      features.push(0, 0, 0, 0);
    }

    // Request size (if available)
    features.push(event.details.requestSize || 0);

    // Response time (if available)
    features.push(event.details.responseTime || 0);

    // Number of threat indicators
    features.push(event.details.threatIntelData?.length || 0);

    // Anomaly score (if available)
    features.push(event.details.anomalyScore || 0);

    // Baseline deviation (if available)
    features.push(event.details.baselineDeviation || 0);

    // Pad or truncate to fixed size (20 features)
    while (features.length < 20) {
      features.push(0);
    }

    return features.slice(0, 20);
  }

  private encodeEventType(type: string): number {
    const typeMap: { [key: string]: number } = {
      'SUSPICIOUS_LOGIN': 1,
      'BRUTE_FORCE_ATTACK': 2,
      'SQL_INJECTION': 3,
      'XSS_ATTEMPT': 4,
      'RATE_LIMIT_EXCEEDED': 5,
      'UNUSUAL_API_USAGE': 6,
      'ANOMALOUS_BEHAVIOR': 7,
      'MALICIOUS_IP': 8,
      'SUSPICIOUS_USER_AGENT': 9,
      'PRIVILEGE_ESCALATION': 10
    };

    return typeMap[type] || 0;
  }

  private encodeSeverity(severity: string): number {
    const severityMap: { [key: string]: number } = {
      'LOW': 1,
      'MEDIUM': 2,
      'HIGH': 3,
      'CRITICAL': 4
    };

    return severityMap[severity] || 0;
  }

  private encodeIP(ip: string): number[] {
    try {
      const parts = ip.split('.').map(part => parseInt(part, 10));
      return parts.length === 4 ? parts : [0, 0, 0, 0];
    } catch {
      return [0, 0, 0, 0];
    }
  }
}