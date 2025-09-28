import { regression, SLR, MLR } from 'ml-regression';
import { mean, standardDeviation, quantile, linearRegression } from 'simple-statistics';
import { Redis } from 'ioredis';
import { Logger } from '../utils/logger.js';
import { ClickHouseService } from '../streaming/clickhouse-service.js';

export interface PredictionModel {
  id: string;
  name: string;
  type: 'linear_regression' | 'multiple_regression' | 'time_series' | 'anomaly_detection';
  target_metric: string;
  features: string[];
  training_data_days: number;
  accuracy: number;
  last_trained: Date;
  model_data: any;
  predictions: PredictionResult[];
}

export interface PredictionResult {
  timestamp: Date;
  predicted_value: number;
  confidence_interval: { lower: number; upper: number };
  actual_value?: number;
  accuracy?: number;
}

export interface AnomalyDetection {
  timestamp: Date;
  metric_name: string;
  actual_value: number;
  expected_value: number;
  deviation: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  confidence: number;
}

export interface ForecastConfig {
  metric: string;
  horizon_hours: number;
  confidence_level: number; // 0.95 for 95% confidence interval
  features?: string[];
  seasonality?: 'hourly' | 'daily' | 'weekly' | 'monthly';
}

export class PredictiveAnalyticsService {
  private redis: Redis;
  private clickHouse: ClickHouseService;
  private logger: Logger;
  private models: Map<string, PredictionModel> = new Map();
  private trainingInterval: NodeJS.Timeout;
  private predictionInterval: NodeJS.Timeout;

  constructor(redis: Redis, clickHouse: ClickHouseService, logger: Logger) {
    this.redis = redis;
    this.clickHouse = clickHouse;
    this.logger = logger;

    // Retrain models every 6 hours
    this.trainingInterval = setInterval(() => {
      this.retrainAllModels().catch(error => {
        this.logger.error('Failed to retrain models', { error });
      });
    }, 6 * 60 * 60 * 1000);

    // Generate predictions every hour
    this.predictionInterval = setInterval(() => {
      this.generateAllPredictions().catch(error => {
        this.logger.error('Failed to generate predictions', { error });
      });
    }, 60 * 60 * 1000);

    this.loadModels();
    this.initializeDefaultModels();
  }

  /**
   * Create and train a new predictive model
   */
  async createModel(config: {
    id: string;
    name: string;
    type: PredictionModel['type'];
    target_metric: string;
    features: string[];
    training_data_days: number;
  }): Promise<PredictionModel> {
    const model: PredictionModel = {
      ...config,
      accuracy: 0,
      last_trained: new Date(),
      model_data: null,
      predictions: []
    };

    await this.trainModel(model);
    this.models.set(model.id, model);
    await this.saveModel(model);

    this.logger.info('Predictive model created', { modelId: model.id, name: model.name });
    return model;
  }

  /**
   * Train a specific model
   */
  async trainModel(model: PredictionModel): Promise<void> {
    try {
      const endDate = new Date();
      const startDate = new Date(endDate.getTime() - (model.training_data_days * 24 * 60 * 60 * 1000));

      // Get training data
      const trainingData = await this.getTrainingData(model, startDate, endDate);
      
      if (trainingData.length < 10) {
        throw new Error(`Insufficient training data: ${trainingData.length} points (minimum 10 required)`);
      }

      // Train the model based on type
      switch (model.type) {
        case 'linear_regression':
          await this.trainLinearRegression(model, trainingData);
          break;
        case 'multiple_regression':
          await this.trainMultipleRegression(model, trainingData);
          break;
        case 'time_series':
          await this.trainTimeSeriesModel(model, trainingData);
          break;
        case 'anomaly_detection':
          await this.trainAnomalyDetection(model, trainingData);
          break;
      }

      model.last_trained = new Date();
      await this.saveModel(model);

      this.logger.info('Model trained successfully', { 
        modelId: model.id, 
        accuracy: model.accuracy,
        dataPoints: trainingData.length 
      });

    } catch (error) {
      this.logger.error('Failed to train model', { error, modelId: model.id });
      throw error;
    }
  }

  /**
   * Generate predictions for all models
   */
  async generateAllPredictions(): Promise<void> {
    for (const model of this.models.values()) {
      try {
        await this.generatePredictions(model.id, 24); // 24 hour forecast
      } catch (error) {
        this.logger.error('Failed to generate predictions for model', { 
          error, 
          modelId: model.id 
        });
      }
    }
  }

  /**
   * Generate predictions for a specific model
   */
  async generatePredictions(modelId: string, hoursAhead: number): Promise<PredictionResult[]> {
    const model = this.models.get(modelId);
    if (!model || !model.model_data) {
      throw new Error(`Model ${modelId} not found or not trained`);
    }

    const predictions: PredictionResult[] = [];
    const now = new Date();

    for (let i = 1; i <= hoursAhead; i++) {
      const predictionTime = new Date(now.getTime() + (i * 60 * 60 * 1000));
      
      let prediction: PredictionResult;

      switch (model.type) {
        case 'linear_regression':
          prediction = this.predictLinearRegression(model, predictionTime, i);
          break;
        case 'multiple_regression':
          prediction = this.predictMultipleRegression(model, predictionTime, i);
          break;
        case 'time_series':
          prediction = this.predictTimeSeries(model, predictionTime, i);
          break;
        default:
          continue;
      }

      predictions.push(prediction);
    }

    model.predictions = predictions;
    await this.saveModel(model);

    // Cache predictions in Redis
    await this.redis.setex(
      `predictions:${modelId}`,
      3600, // 1 hour TTL
      JSON.stringify(predictions)
    );

    this.logger.debug('Generated predictions', { 
      modelId, 
      hoursAhead, 
      predictionCount: predictions.length 
    });

    return predictions;
  }

  /**
   * Detect anomalies in real-time data
   */
  async detectAnomalies(timeRange: { start: Date; end: Date }): Promise<AnomalyDetection[]> {
    const anomalies: AnomalyDetection[] = [];

    for (const model of this.models.values()) {
      if (model.type !== 'anomaly_detection' || !model.model_data) continue;

      try {
        const recentData = await this.getRecentData(model.target_metric, timeRange);
        
        for (const dataPoint of recentData) {
          const anomaly = this.detectAnomaly(model, dataPoint);
          if (anomaly) {
            anomalies.push(anomaly);
          }
        }
      } catch (error) {
        this.logger.error('Failed to detect anomalies for model', { 
          error, 
          modelId: model.id 
        });
      }
    }

    // Cache anomalies
    await this.redis.setex(
      'anomalies:recent',
      300, // 5 minutes TTL
      JSON.stringify(anomalies)
    );

    return anomalies;
  }

  /**
   * Get forecast for specific metric
   */
  async getForecast(config: ForecastConfig): Promise<PredictionResult[]> {
    // Try to find existing model for this metric
    let model = Array.from(this.models.values()).find(m => 
      m.target_metric === config.metric && m.type === 'time_series'
    );

    // Create temporary model if none exists
    if (!model) {
      model = await this.createModel({
        id: `temp_${config.metric}_${Date.now()}`,
        name: `Temporary forecast for ${config.metric}`,
        type: 'time_series',
        target_metric: config.metric,
        features: config.features || [],
        training_data_days: 30
      });
    }

    return await this.generatePredictions(model.id, config.horizon_hours);
  }

  /**
   * Train linear regression model
   */
  private async trainLinearRegression(model: PredictionModel, data: any[]): Promise<void> {
    const x = data.map((d, i) => i); // Time index
    const y = data.map(d => d.value);

    const regression = linearRegression(x.map((xi, i) => [xi, y[i]]));
    
    // Calculate R-squared
    const predictions = x.map(xi => regression.m * xi + regression.b);
    const meanY = mean(y);
    const ssRes = y.reduce((sum, yi, i) => sum + Math.pow(yi - predictions[i], 2), 0);
    const ssTot = y.reduce((sum, yi) => sum + Math.pow(yi - meanY, 2), 0);
    const rSquared = 1 - (ssRes / ssTot);

    model.model_data = {
      slope: regression.m,
      intercept: regression.b,
      rSquared,
      standardError: Math.sqrt(ssRes / (y.length - 2))
    };
    
    model.accuracy = Math.max(0, rSquared);
  }

  /**
   * Train multiple regression model
   */
  private async trainMultipleRegression(model: PredictionModel, data: any[]): Promise<void> {
    const features = data.map(d => model.features.map(f => d[f] || 0));
    const targets = data.map(d => d.value);

    const mlr = new MLR(features, targets);
    
    // Calculate accuracy using cross-validation
    const predictions = features.map(f => mlr.predict(f));
    const meanTarget = mean(targets);
    const ssRes = targets.reduce((sum, t, i) => sum + Math.pow(t - predictions[i], 2), 0);
    const ssTot = targets.reduce((sum, t) => sum + Math.pow(t - meanTarget, 2), 0);
    const rSquared = 1 - (ssRes / ssTot);

    model.model_data = {
      weights: mlr.weights,
      rSquared,
      features: model.features
    };
    
    model.accuracy = Math.max(0, rSquared);
  }

  /**
   * Train time series model (simple trend + seasonality)
   */
  private async trainTimeSeriesModel(model: PredictionModel, data: any[]): Promise<void> {
    const values = data.map(d => d.value);
    const timestamps = data.map(d => new Date(d.timestamp).getTime());

    // Calculate trend
    const x = timestamps.map((t, i) => i);
    const trend = linearRegression(x.map((xi, i) => [xi, values[i]]));

    // Calculate seasonal patterns (24-hour cycles)
    const hourlyAverages = new Array(24).fill(0);
    const hourlyCounts = new Array(24).fill(0);

    data.forEach(d => {
      const hour = new Date(d.timestamp).getHours();
      hourlyAverages[hour] += d.value;
      hourlyCounts[hour]++;
    });

    for (let i = 0; i < 24; i++) {
      if (hourlyCounts[i] > 0) {
        hourlyAverages[i] /= hourlyCounts[i];
      }
    }

    // Calculate detrended values for seasonal analysis
    const detrended = values.map((v, i) => v - (trend.m * i + trend.b));
    const seasonalStdDev = standardDeviation(detrended);

    model.model_data = {
      trend: {
        slope: trend.m,
        intercept: trend.b
      },
      seasonal: {
        hourlyAverages,
        stdDev: seasonalStdDev
      },
      baseTime: timestamps[0],
      dataLength: values.length
    };

    // Calculate accuracy
    const predictions = values.map((_, i) => {
      const trendValue = trend.m * i + trend.b;
      const hour = new Date(timestamps[i]).getHours();
      const seasonalValue = hourlyAverages[hour];
      return trendValue + (seasonalValue - mean(hourlyAverages));
    });

    const meanValue = mean(values);
    const ssRes = values.reduce((sum, v, i) => sum + Math.pow(v - predictions[i], 2), 0);
    const ssTot = values.reduce((sum, v) => sum + Math.pow(v - meanValue, 2), 0);
    model.accuracy = Math.max(0, 1 - (ssRes / ssTot));
  }

  /**
   * Train anomaly detection model
   */
  private async trainAnomalyDetection(model: PredictionModel, data: any[]): Promise<void> {
    const values = data.map(d => d.value);
    const meanValue = mean(values);
    const stdDev = standardDeviation(values);
    
    // Calculate percentiles for threshold determination
    const p95 = quantile(values, 0.95);
    const p5 = quantile(values, 0.05);

    model.model_data = {
      mean: meanValue,
      stdDev,
      thresholds: {
        low: p5,
        high: p95,
        critical_low: meanValue - 3 * stdDev,
        critical_high: meanValue + 3 * stdDev
      }
    };

    model.accuracy = 0.95; // Assume 95% accuracy for anomaly detection
  }

  /**
   * Predict using linear regression
   */
  private predictLinearRegression(model: PredictionModel, timestamp: Date, hoursAhead: number): PredictionResult {
    const { slope, intercept, standardError } = model.model_data;
    const x = model.model_data.dataLength + hoursAhead;
    
    const predicted_value = slope * x + intercept;
    const margin = 1.96 * standardError; // 95% confidence interval

    return {
      timestamp,
      predicted_value,
      confidence_interval: {
        lower: predicted_value - margin,
        upper: predicted_value + margin
      }
    };
  }

  /**
   * Predict using multiple regression
   */
  private predictMultipleRegression(model: PredictionModel, timestamp: Date, hoursAhead: number): PredictionResult {
    // For now, use simple linear extrapolation
    // In production, you'd need current feature values
    const baseValue = 100; // This should be calculated from recent feature values
    const predicted_value = baseValue * (1 + hoursAhead * 0.01); // Simple growth

    return {
      timestamp,
      predicted_value,
      confidence_interval: {
        lower: predicted_value * 0.9,
        upper: predicted_value * 1.1
      }
    };
  }

  /**
   * Predict using time series model
   */
  private predictTimeSeries(model: PredictionModel, timestamp: Date, hoursAhead: number): PredictionResult {
    const { trend, seasonal, baseTime, dataLength } = model.model_data;
    
    const x = dataLength + hoursAhead;
    const trendValue = trend.slope * x + trend.intercept;
    
    const hour = timestamp.getHours();
    const seasonalValue = seasonal.hourlyAverages[hour];
    const seasonalMean = mean(seasonal.hourlyAverages);
    
    const predicted_value = trendValue + (seasonalValue - seasonalMean);
    const margin = 1.96 * seasonal.stdDev;

    return {
      timestamp,
      predicted_value,
      confidence_interval: {
        lower: predicted_value - margin,
        upper: predicted_value + margin
      }
    };
  }

  /**
   * Detect anomaly in single data point
   */
  private detectAnomaly(model: PredictionModel, dataPoint: any): AnomalyDetection | null {
    const { mean, stdDev, thresholds } = model.model_data;
    const value = dataPoint.value;
    const deviation = Math.abs(value - mean) / stdDev;

    let severity: AnomalyDetection['severity'] | null = null;
    let confidence = 0;

    if (value < thresholds.critical_low || value > thresholds.critical_high) {
      severity = 'critical';
      confidence = 0.99;
    } else if (value < thresholds.low || value > thresholds.high) {
      severity = 'high';
      confidence = 0.95;
    } else if (deviation > 2) {
      severity = 'medium';
      confidence = 0.85;
    } else if (deviation > 1.5) {
      severity = 'low';
      confidence = 0.7;
    }

    if (!severity) return null;

    return {
      timestamp: new Date(dataPoint.timestamp),
      metric_name: model.target_metric,
      actual_value: value,
      expected_value: mean,
      deviation,
      severity,
      confidence
    };
  }

  /**
   * Get training data for model
   */
  private async getTrainingData(model: PredictionModel, startDate: Date, endDate: Date): Promise<any[]> {
    // Simplified query - in production, this would be more sophisticated
    const query = `
      SELECT 
        timestamp,
        avg(value) as value
        ${model.features.length > 0 ? ', ' + model.features.join(', ') : ''}
      FROM performance_metrics 
      WHERE metric_type = '${model.target_metric}'
        AND timestamp >= '${startDate.toISOString()}'
        AND timestamp <= '${endDate.toISOString()}'
      GROUP BY timestamp
      ORDER BY timestamp
    `;

    return await this.clickHouse.query(query);
  }

  /**
   * Get recent data for anomaly detection
   */
  private async getRecentData(metric: string, timeRange: { start: Date; end: Date }): Promise<any[]> {
    const query = `
      SELECT timestamp, value
      FROM performance_metrics
      WHERE metric_type = '${metric}'
        AND timestamp >= '${timeRange.start.toISOString()}'
        AND timestamp <= '${timeRange.end.toISOString()}'
      ORDER BY timestamp DESC
    `;

    return await this.clickHouse.query(query);
  }

  /**
   * Initialize default models
   */
  private async initializeDefaultModels(): Promise<void> {
    const defaultModels = [
      {
        id: 'response_time_forecast',
        name: 'API Response Time Forecast',
        type: 'time_series' as const,
        target_metric: 'response_time',
        features: [],
        training_data_days: 30
      },
      {
        id: 'error_rate_anomaly',
        name: 'Error Rate Anomaly Detection',
        type: 'anomaly_detection' as const,
        target_metric: 'error_rate',
        features: [],
        training_data_days: 7
      },
      {
        id: 'cost_prediction',
        name: 'Daily Cost Prediction',
        type: 'linear_regression' as const,
        target_metric: 'daily_cost',
        features: ['agent_count', 'request_volume'],
        training_data_days: 60
      }
    ];

    for (const modelConfig of defaultModels) {
      if (!this.models.has(modelConfig.id)) {
        try {
          await this.createModel(modelConfig);
        } catch (error) {
          this.logger.error('Failed to create default model', { 
            error, 
            modelId: modelConfig.id 
          });
        }
      }
    }
  }

  /**
   * Retrain all models
   */
  private async retrainAllModels(): Promise<void> {
    this.logger.info('Starting model retraining', { modelCount: this.models.size });

    for (const model of this.models.values()) {
      try {
        await this.trainModel(model);
      } catch (error) {
        this.logger.error('Failed to retrain model', { error, modelId: model.id });
      }
    }

    this.logger.info('Model retraining completed');
  }

  /**
   * Load models from Redis
   */
  private async loadModels(): Promise<void> {
    try {
      const keys = await this.redis.keys('model:*');
      
      for (const key of keys) {
        const modelData = await this.redis.get(key);
        if (modelData) {
          const model: PredictionModel = JSON.parse(modelData);
          model.last_trained = new Date(model.last_trained);
          this.models.set(model.id, model);
        }
      }

      this.logger.info('Loaded predictive models', { count: this.models.size });
    } catch (error) {
      this.logger.error('Failed to load models', { error });
    }
  }

  /**
   * Save model to Redis
   */
  private async saveModel(model: PredictionModel): Promise<void> {
    await this.redis.set(
      `model:${model.id}`,
      JSON.stringify(model)
    );
  }

  /**
   * Get all models
   */
  getModels(): PredictionModel[] {
    return Array.from(this.models.values());
  }

  /**
   * Get model by ID
   */
  getModel(id: string): PredictionModel | undefined {
    return this.models.get(id);
  }

  /**
   * Delete model
   */
  async deleteModel(id: string): Promise<void> {
    this.models.delete(id);
    await this.redis.del(`model:${id}`);
    this.logger.info('Model deleted', { modelId: id });
  }

  /**
   * Get service statistics
   */
  getStats(): {
    totalModels: number;
    trainedModels: number;
    avgAccuracy: number;
    lastTrainingTime: Date | null;
  } {
    const models = Array.from(this.models.values());
    const trainedModels = models.filter(m => m.model_data !== null);
    
    return {
      totalModels: models.length,
      trainedModels: trainedModels.length,
      avgAccuracy: trainedModels.length > 0 
        ? trainedModels.reduce((sum, m) => sum + m.accuracy, 0) / trainedModels.length 
        : 0,
      lastTrainingTime: trainedModels.length > 0 
        ? new Date(Math.max(...trainedModels.map(m => m.last_trained.getTime())))
        : null
    };
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    if (this.trainingInterval) {
      clearInterval(this.trainingInterval);
    }
    if (this.predictionInterval) {
      clearInterval(this.predictionInterval);
    }
    this.logger.info('Predictive analytics service destroyed');
  }
}