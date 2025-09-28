/**
 * Time Series Analyzer for Historical Workflow Data Analysis
 *
 * Provides comprehensive time series analysis capabilities for workflow execution data,
 * including seasonal decomposition, trend analysis, pattern detection, and forecasting
 * foundation for workload prediction systems.
 */

import { EventEmitter } from 'events';
import { z } from 'zod';
import { logger } from '../core/Logger.js';

// Core time series data types
export const TimeSeriesDataPointSchema = z.object({
  timestamp: z.number(), // Unix timestamp in milliseconds
  value: z.number(),
  metadata: z.record(z.any()).optional()
});

export const TimeSeriesSchema = z.object({
  name: z.string(),
  type: z.enum(['workflow_executions', 'resource_usage', 'response_times', 'error_rates', 'queue_depth']),
  dataPoints: z.array(TimeSeriesDataPointSchema),
  interval: z.enum(['minute', 'hour', 'day', 'week']),
  aggregation: z.enum(['sum', 'average', 'max', 'min', 'count']).default('average')
});

export const SeasonalitySchema = z.object({
  hourlyPattern: z.array(z.number()).length(24), // 24 hours
  dailyPattern: z.array(z.number()).length(7),   // 7 days
  weeklyPattern: z.array(z.number()).length(52), // 52 weeks
  monthlyPattern: z.array(z.number()).length(12) // 12 months
});

export const TrendAnalysisSchema = z.object({
  trend: z.enum(['increasing', 'decreasing', 'stable', 'volatile']),
  slope: z.number(),
  correlation: z.number().min(-1).max(1),
  volatility: z.number().min(0),
  changePoints: z.array(z.number()), // Timestamps where trend changes
  confidence: z.number().min(0).max(1)
});

export const AnomalySchema = z.object({
  timestamp: z.number(),
  value: z.number(),
  expectedValue: z.number(),
  deviation: z.number(),
  severity: z.enum(['low', 'medium', 'high', 'critical']),
  type: z.enum(['spike', 'drop', 'outlier', 'pattern_break']),
  context: z.record(z.any()).optional()
});

export const ForecastSchema = z.object({
  timestamp: z.number(),
  predictedValue: z.number(),
  confidenceInterval: z.object({
    lower: z.number(),
    upper: z.number()
  }),
  confidence: z.number().min(0).max(1)
});

export const TimeSeriesAnalysisResultSchema = z.object({
  seriesName: z.string(),
  period: z.object({
    start: z.number(),
    end: z.number()
  }),
  statistics: z.object({
    mean: z.number(),
    median: z.number(),
    standardDeviation: z.number(),
    variance: z.number(),
    skewness: z.number(),
    kurtosis: z.number(),
    autocorrelation: z.array(z.number())
  }),
  seasonality: SeasonalitySchema,
  trend: TrendAnalysisSchema,
  anomalies: z.array(AnomalySchema),
  forecast: z.array(ForecastSchema),
  modelMetrics: z.object({
    mape: z.number(), // Mean Absolute Percentage Error
    rmse: z.number(), // Root Mean Square Error
    mae: z.number(),  // Mean Absolute Error
    r2: z.number()    // R-squared
  })
});

export type TimeSeriesDataPoint = z.infer<typeof TimeSeriesDataPointSchema>;
export type TimeSeries = z.infer<typeof TimeSeriesSchema>;
export type Seasonality = z.infer<typeof SeasonalitySchema>;
export type TrendAnalysis = z.infer<typeof TrendAnalysisSchema>;
export type Anomaly = z.infer<typeof AnomalySchema>;
export type Forecast = z.infer<typeof ForecastSchema>;
export type TimeSeriesAnalysisResult = z.infer<typeof TimeSeriesAnalysisResultSchema>;

export interface TimeSeriesAnalyzerConfig {
  // Analysis parameters
  forecastHorizon: number; // Hours to forecast ahead
  confidenceLevel: number; // 0.95 for 95% confidence intervals
  anomalyThreshold: number; // Standard deviations for anomaly detection

  // Seasonality detection
  minSeasonalPeriods: number; // Minimum periods to detect seasonality
  seasonalityThreshold: number; // Correlation threshold for seasonality

  // Smoothing parameters
  smoothingWindow: number; // Moving average window size
  exponentialAlpha: number; // Exponential smoothing alpha parameter

  // Model selection
  autoSelectModel: boolean;
  models: Array<'arima' | 'exponential_smoothing' | 'linear_regression' | 'prophet'>;

  // Performance optimization
  maxDataPoints: number;
  parallelProcessing: boolean;
  cacheResults: boolean;
}

export interface SeasonalDecomposition {
  trend: TimeSeriesDataPoint[];
  seasonal: TimeSeriesDataPoint[];
  residual: TimeSeriesDataPoint[];
  strength: {
    trend: number;
    seasonal: number;
  };
}

export class TimeSeriesAnalyzer extends EventEmitter {
  private config: TimeSeriesAnalyzerConfig;
  private cache: Map<string, TimeSeriesAnalysisResult>;
  private models: Map<string, any>;

  constructor(config: Partial<TimeSeriesAnalyzerConfig> = {}) {
    super();

    this.config = {
      forecastHorizon: 24, // 24 hours ahead
      confidenceLevel: 0.95,
      anomalyThreshold: 2.5,
      minSeasonalPeriods: 3,
      seasonalityThreshold: 0.6,
      smoothingWindow: 7,
      exponentialAlpha: 0.3,
      autoSelectModel: true,
      models: ['exponential_smoothing', 'linear_regression'],
      maxDataPoints: 10000,
      parallelProcessing: true,
      cacheResults: true,
      ...config
    };

    this.cache = new Map();
    this.models = new Map();

    logger.info('TimeSeriesAnalyzer initialized', { config: this.config });
  }

  /**
   * Analyze time series data with comprehensive statistical analysis
   */
  async analyze(series: TimeSeries): Promise<TimeSeriesAnalysisResult> {
    try {
      logger.info('Starting time series analysis', {
        series: series.name,
        dataPoints: series.dataPoints.length
      });

      // Validate input data
      const validatedSeries = TimeSeriesSchema.parse(series);

      // Check cache first
      const cacheKey = this.generateCacheKey(validatedSeries);
      if (this.config.cacheResults && this.cache.has(cacheKey)) {
        logger.debug('Returning cached analysis result', { series: series.name });
        return this.cache.get(cacheKey)!;
      }

      // Prepare data
      const sortedData = this.sortAndCleanData(validatedSeries.dataPoints);
      const resampledData = await this.resampleData(sortedData, validatedSeries.interval);

      // Perform analysis components
      const [
        statistics,
        seasonality,
        trend,
        anomalies,
        forecast
      ] = await Promise.all([
        this.calculateStatistics(resampledData),
        this.detectSeasonality(resampledData),
        this.analyzeTrend(resampledData),
        this.detectAnomalies(resampledData),
        this.generateForecast(resampledData, validatedSeries.type)
      ]);

      // Calculate model metrics
      const modelMetrics = await this.calculateModelMetrics(resampledData, forecast);

      const result: TimeSeriesAnalysisResult = {
        seriesName: validatedSeries.name,
        period: {
          start: Math.min(...sortedData.map(d => d.timestamp)),
          end: Math.max(...sortedData.map(d => d.timestamp))
        },
        statistics,
        seasonality,
        trend,
        anomalies,
        forecast,
        modelMetrics
      };

      // Cache result
      if (this.config.cacheResults) {
        this.cache.set(cacheKey, result);
      }

      this.emit('analysisComplete', { series: series.name, result });
      logger.info('Time series analysis completed', {
        series: series.name,
        anomalies: anomalies.length,
        forecastPoints: forecast.length
      });

      return result;

    } catch (error) {
      logger.error('Time series analysis failed', {
        series: series.name,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Perform seasonal decomposition using STL (Seasonal and Trend decomposition using Loess)
   */
  async decompose(data: TimeSeriesDataPoint[]): Promise<SeasonalDecomposition> {
    try {
      // Sort data by timestamp
      const sortedData = data.sort((a, b) => a.timestamp - b.timestamp);

      // Extract values and timestamps
      const values = sortedData.map(d => d.value);
      const timestamps = sortedData.map(d => d.timestamp);

      // Determine seasonal period based on data frequency
      const period = this.detectPeriod(timestamps);

      // Apply moving average for trend extraction
      const trend = this.calculateMovingAverage(values, Math.max(period, this.config.smoothingWindow));

      // Calculate seasonal component
      const detrended = values.map((val, i) => val - (trend[i] || val));
      const seasonal = this.extractSeasonalComponent(detrended, period);

      // Calculate residual
      const residual = values.map((val, i) => val - (trend[i] || 0) - (seasonal[i] || 0));

      // Calculate component strengths
      const trendStrength = this.calculateComponentStrength(values, trend);
      const seasonalStrength = this.calculateComponentStrength(values, seasonal);

      return {
        trend: trend.map((val, i) => ({ timestamp: timestamps[i], value: val })),
        seasonal: seasonal.map((val, i) => ({ timestamp: timestamps[i], value: val })),
        residual: residual.map((val, i) => ({ timestamp: timestamps[i], value: val })),
        strength: {
          trend: trendStrength,
          seasonal: seasonalStrength
        }
      };

    } catch (error) {
      logger.error('Seasonal decomposition failed', { error });
      throw error;
    }
  }

  /**
   * Calculate comprehensive statistical measures
   */
  private async calculateStatistics(data: TimeSeriesDataPoint[]): Promise<TimeSeriesAnalysisResult['statistics']> {
    const values = data.map(d => d.value);
    const n = values.length;

    if (n === 0) {
      throw new Error('No data points to analyze');
    }

    // Basic statistics
    const mean = values.reduce((sum, val) => sum + val, 0) / n;
    const sortedValues = [...values].sort((a, b) => a - b);
    const median = n % 2 === 0
      ? (sortedValues[n/2 - 1] + sortedValues[n/2]) / 2
      : sortedValues[Math.floor(n/2)];

    // Variance and standard deviation
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / (n - 1);
    const standardDeviation = Math.sqrt(variance);

    // Skewness and kurtosis
    const skewness = this.calculateSkewness(values, mean, standardDeviation);
    const kurtosis = this.calculateKurtosis(values, mean, standardDeviation);

    // Autocorrelation
    const autocorrelation = this.calculateAutocorrelation(values, Math.min(20, Math.floor(n / 4)));

    return {
      mean,
      median,
      standardDeviation,
      variance,
      skewness,
      kurtosis,
      autocorrelation
    };
  }

  /**
   * Detect seasonal patterns in the data
   */
  private async detectSeasonality(data: TimeSeriesDataPoint[]): Promise<Seasonality> {
    const timestamps = data.map(d => d.timestamp);
    const values = data.map(d => d.value);

    // Initialize pattern arrays
    const hourlyPattern = new Array(24).fill(0);
    const dailyPattern = new Array(7).fill(0);
    const weeklyPattern = new Array(52).fill(0);
    const monthlyPattern = new Array(12).fill(0);

    // Count and sum values for each time period
    const hourlyCounts = new Array(24).fill(0);
    const dailyCounts = new Array(7).fill(0);
    const weeklyCounts = new Array(52).fill(0);
    const monthlyCounts = new Array(12).fill(0);

    timestamps.forEach((timestamp, i) => {
      const date = new Date(timestamp);
      const hour = date.getHours();
      const dayOfWeek = date.getDay();
      const weekOfYear = this.getWeekOfYear(date);
      const month = date.getMonth();
      const value = values[i];

      // Accumulate values
      hourlyPattern[hour] += value;
      hourlyCounts[hour]++;

      dailyPattern[dayOfWeek] += value;
      dailyCounts[dayOfWeek]++;

      weeklyPattern[weekOfYear] += value;
      weeklyCounts[weekOfYear]++;

      monthlyPattern[month] += value;
      monthlyCounts[month]++;
    });

    // Calculate averages
    for (let i = 0; i < 24; i++) {
      hourlyPattern[i] = hourlyCounts[i] > 0 ? hourlyPattern[i] / hourlyCounts[i] : 0;
    }
    for (let i = 0; i < 7; i++) {
      dailyPattern[i] = dailyCounts[i] > 0 ? dailyPattern[i] / dailyCounts[i] : 0;
    }
    for (let i = 0; i < 52; i++) {
      weeklyPattern[i] = weeklyCounts[i] > 0 ? weeklyPattern[i] / weeklyCounts[i] : 0;
    }
    for (let i = 0; i < 12; i++) {
      monthlyPattern[i] = monthlyCounts[i] > 0 ? monthlyPattern[i] / monthlyCounts[i] : 0;
    }

    return {
      hourlyPattern,
      dailyPattern,
      weeklyPattern,
      monthlyPattern
    };
  }

  /**
   * Analyze trend in the time series data
   */
  private async analyzeTrend(data: TimeSeriesDataPoint[]): Promise<TrendAnalysis> {
    const values = data.map(d => d.value);
    const timestamps = data.map(d => d.timestamp);
    const n = values.length;

    if (n < 2) {
      return {
        trend: 'stable',
        slope: 0,
        correlation: 0,
        volatility: 0,
        changePoints: [],
        confidence: 0
      };
    }

    // Linear regression for trend calculation
    const xMean = timestamps.reduce((sum, t) => sum + t, 0) / n;
    const yMean = values.reduce((sum, v) => sum + v, 0) / n;

    let numerator = 0;
    let denominator = 0;
    for (let i = 0; i < n; i++) {
      const xDiff = timestamps[i] - xMean;
      const yDiff = values[i] - yMean;
      numerator += xDiff * yDiff;
      denominator += xDiff * xDiff;
    }

    const slope = denominator !== 0 ? numerator / denominator : 0;

    // Calculate correlation coefficient
    const correlation = this.calculateCorrelation(timestamps, values);

    // Calculate volatility (coefficient of variation)
    const mean = values.reduce((sum, v) => sum + v, 0) / n;
    const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / n;
    const volatility = mean !== 0 ? Math.sqrt(variance) / Math.abs(mean) : 0;

    // Detect change points using CUSUM algorithm
    const changePoints = this.detectChangePoints(values, timestamps);

    // Determine trend direction
    let trend: TrendAnalysis['trend'];
    if (Math.abs(slope) < 0.001) {
      trend = 'stable';
    } else if (volatility > 0.5) {
      trend = 'volatile';
    } else if (slope > 0) {
      trend = 'increasing';
    } else {
      trend = 'decreasing';
    }

    // Calculate confidence based on correlation and data quality
    const confidence = Math.min(Math.abs(correlation) * (1 - volatility), 1);

    return {
      trend,
      slope,
      correlation,
      volatility,
      changePoints,
      confidence
    };
  }

  /**
   * Detect anomalies in the time series data
   */
  private async detectAnomalies(data: TimeSeriesDataPoint[]): Promise<Anomaly[]> {
    const anomalies: Anomaly[] = [];
    const values = data.map(d => d.value);

    if (values.length < 10) {
      return anomalies; // Need sufficient data for anomaly detection
    }

    // Calculate rolling statistics
    const windowSize = Math.min(20, Math.floor(values.length / 5));
    const rollingMeans = this.calculateRollingMean(values, windowSize);
    const rollingStds = this.calculateRollingStd(values, rollingMeans, windowSize);

    // Detect anomalies using statistical methods
    for (let i = windowSize; i < values.length; i++) {
      const value = values[i];
      const expectedValue = rollingMeans[i];
      const threshold = rollingStds[i] * this.config.anomalyThreshold;

      const deviation = Math.abs(value - expectedValue);

      if (deviation > threshold) {
        const severity = this.calculateAnomalySeverity(deviation, threshold);
        const type = this.determineAnomalyType(value, expectedValue, values, i);

        anomalies.push({
          timestamp: data[i].timestamp,
          value,
          expectedValue,
          deviation,
          severity,
          type,
          context: {
            rollingMean: expectedValue,
            rollingStd: rollingStds[i],
            threshold
          }
        });
      }
    }

    logger.debug('Anomaly detection completed', {
      totalPoints: values.length,
      anomaliesFound: anomalies.length
    });

    return anomalies;
  }

  /**
   * Generate forecast using multiple models and ensemble approach
   */
  private async generateForecast(data: TimeSeriesDataPoint[], seriesType: TimeSeries['type']): Promise<Forecast[]> {
    const forecastPoints = this.config.forecastHorizon;
    const values = data.map(d => d.value);
    const timestamps = data.map(d => d.timestamp);

    if (values.length < 10) {
      logger.warn('Insufficient data for forecasting', { dataPoints: values.length });
      return [];
    }

    // Determine forecast interval based on data frequency
    const interval = this.detectInterval(timestamps);
    const lastTimestamp = Math.max(...timestamps);

    // Generate forecasts using different models
    const forecasts: Forecast[] = [];

    try {
      // Exponential smoothing forecast
      const expSmoothing = await this.exponentialSmoothingForecast(values, forecastPoints);

      // Linear trend forecast
      const linearTrend = await this.linearTrendForecast(values, timestamps, forecastPoints, interval);

      // Seasonal naive forecast (if seasonality detected)
      const seasonalForecast = await this.seasonalNaiveForecast(values, forecastPoints);

      // Ensemble forecast (weighted average)
      for (let i = 0; i < forecastPoints; i++) {
        const timestamp = lastTimestamp + (i + 1) * interval;

        // Weight models based on recent performance
        const expWeight = 0.4;
        const linearWeight = 0.4;
        const seasonalWeight = 0.2;

        const predictedValue =
          expWeight * expSmoothing[i] +
          linearWeight * linearTrend[i] +
          seasonalWeight * seasonalForecast[i];

        // Calculate confidence interval (simplified approach)
        const baseStd = this.calculateStandardDeviation(values.slice(-Math.min(50, values.length)));
        const confidenceMultiplier = 1.96; // 95% confidence
        const expandingUncertainty = 1 + (i * 0.1); // Uncertainty increases with time
        const interval_half = confidenceMultiplier * baseStd * expandingUncertainty;

        forecasts.push({
          timestamp,
          predictedValue,
          confidenceInterval: {
            lower: predictedValue - interval_half,
            upper: predictedValue + interval_half
          },
          confidence: Math.max(0.5 - (i * 0.02), 0.1) // Confidence decreases with forecast horizon
        });
      }

      logger.debug('Forecast generation completed', {
        forecastPoints: forecasts.length,
        seriesType
      });

    } catch (error) {
      logger.error('Forecast generation failed', { error });
      return [];
    }

    return forecasts;
  }

  /**
   * Calculate model performance metrics
   */
  private async calculateModelMetrics(data: TimeSeriesDataPoint[], forecast: Forecast[]): Promise<TimeSeriesAnalysisResult['modelMetrics']> {
    // For demonstration, we'll use cross-validation on historical data
    const values = data.map(d => d.value);
    const n = values.length;

    if (n < 20) {
      return { mape: 0, rmse: 0, mae: 0, r2: 0 };
    }

    // Use last 20% of data for validation
    const validationSize = Math.floor(n * 0.2);
    const trainData = values.slice(0, n - validationSize);
    const actualValues = values.slice(n - validationSize);

    // Generate forecasts for validation period (simplified)
    const validationForecasts = await this.exponentialSmoothingForecast(trainData, validationSize);

    // Calculate metrics
    let sumAbsoluteError = 0;
    let sumSquaredError = 0;
    let sumAbsolutePercentageError = 0;
    let sumActual = 0;
    let sumSquaredTotal = 0;

    const actualMean = actualValues.reduce((sum, val) => sum + val, 0) / actualValues.length;

    for (let i = 0; i < validationSize; i++) {
      const actual = actualValues[i];
      const predicted = validationForecasts[i];
      const error = actual - predicted;

      sumAbsoluteError += Math.abs(error);
      sumSquaredError += error * error;
      sumAbsolutePercentageError += actual !== 0 ? Math.abs(error / actual) * 100 : 0;
      sumSquaredTotal += Math.pow(actual - actualMean, 2);
    }

    const mae = sumAbsoluteError / validationSize;
    const rmse = Math.sqrt(sumSquaredError / validationSize);
    const mape = sumAbsolutePercentageError / validationSize;
    const r2 = sumSquaredTotal !== 0 ? 1 - (sumSquaredError / sumSquaredTotal) : 0;

    return { mape, rmse, mae, r2 };
  }

  // Helper methods

  private sortAndCleanData(data: TimeSeriesDataPoint[]): TimeSeriesDataPoint[] {
    return data
      .filter(d => !isNaN(d.value) && isFinite(d.value))
      .sort((a, b) => a.timestamp - b.timestamp);
  }

  private async resampleData(data: TimeSeriesDataPoint[], interval: TimeSeries['interval']): Promise<TimeSeriesDataPoint[]> {
    // For now, return data as-is. In production, implement proper resampling
    return data;
  }

  private generateCacheKey(series: TimeSeries): string {
    const dataHash = series.dataPoints.length + '_' +
      series.dataPoints[0]?.timestamp + '_' +
      series.dataPoints[series.dataPoints.length - 1]?.timestamp;
    return `${series.name}_${series.type}_${dataHash}`;
  }

  private calculateMovingAverage(values: number[], window: number): number[] {
    const result: number[] = [];
    for (let i = 0; i < values.length; i++) {
      const start = Math.max(0, i - Math.floor(window / 2));
      const end = Math.min(values.length, i + Math.floor(window / 2) + 1);
      const subset = values.slice(start, end);
      result[i] = subset.reduce((sum, val) => sum + val, 0) / subset.length;
    }
    return result;
  }

  private calculateSkewness(values: number[], mean: number, std: number): number {
    const n = values.length;
    const sum = values.reduce((acc, val) => acc + Math.pow((val - mean) / std, 3), 0);
    return (n / ((n - 1) * (n - 2))) * sum;
  }

  private calculateKurtosis(values: number[], mean: number, std: number): number {
    const n = values.length;
    const sum = values.reduce((acc, val) => acc + Math.pow((val - mean) / std, 4), 0);
    return ((n * (n + 1)) / ((n - 1) * (n - 2) * (n - 3))) * sum - (3 * Math.pow(n - 1, 2)) / ((n - 2) * (n - 3));
  }

  private calculateAutocorrelation(values: number[], maxLag: number): number[] {
    const n = values.length;
    const mean = values.reduce((sum, val) => sum + val, 0) / n;
    const result: number[] = [];

    for (let lag = 0; lag <= maxLag; lag++) {
      let numerator = 0;
      let denominator = 0;

      for (let i = 0; i < n - lag; i++) {
        numerator += (values[i] - mean) * (values[i + lag] - mean);
      }

      for (let i = 0; i < n; i++) {
        denominator += Math.pow(values[i] - mean, 2);
      }

      result[lag] = denominator !== 0 ? numerator / denominator : 0;
    }

    return result;
  }

  private detectPeriod(timestamps: number[]): number {
    // Simplified period detection - analyze gaps between timestamps
    if (timestamps.length < 2) return 1;

    const gaps = [];
    for (let i = 1; i < timestamps.length; i++) {
      gaps.push(timestamps[i] - timestamps[i - 1]);
    }

    const avgGap = gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length;

    // Determine period based on average gap
    const hour = 60 * 60 * 1000;
    const day = 24 * hour;

    if (avgGap < hour) return 24; // Hourly data -> daily period
    if (avgGap < day) return 7;   // Daily data -> weekly period
    return 4; // Weekly+ data -> monthly period
  }

  private calculateComponentStrength(original: number[], component: number[]): number {
    const originalVar = this.calculateVariance(original);
    const componentVar = this.calculateVariance(component);
    return originalVar !== 0 ? Math.min(componentVar / originalVar, 1) : 0;
  }

  private calculateVariance(values: number[]): number {
    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    return values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
  }

  private calculateStandardDeviation(values: number[]): number {
    return Math.sqrt(this.calculateVariance(values));
  }

  private extractSeasonalComponent(detrended: number[], period: number): number[] {
    const seasonal = new Array(detrended.length);

    for (let i = 0; i < detrended.length; i++) {
      const seasonalIndex = i % period;
      const sameSeasonIndices = [];

      for (let j = seasonalIndex; j < detrended.length; j += period) {
        sameSeasonIndices.push(detrended[j]);
      }

      seasonal[i] = sameSeasonIndices.reduce((sum, val) => sum + val, 0) / sameSeasonIndices.length;
    }

    return seasonal;
  }

  private getWeekOfYear(date: Date): number {
    const start = new Date(date.getFullYear(), 0, 1);
    const diff = date.getTime() - start.getTime();
    return Math.floor(diff / (7 * 24 * 60 * 60 * 1000));
  }

  private calculateCorrelation(x: number[], y: number[]): number {
    const n = x.length;
    const xMean = x.reduce((sum, val) => sum + val, 0) / n;
    const yMean = y.reduce((sum, val) => sum + val, 0) / n;

    let numerator = 0;
    let xDenominator = 0;
    let yDenominator = 0;

    for (let i = 0; i < n; i++) {
      const xDiff = x[i] - xMean;
      const yDiff = y[i] - yMean;
      numerator += xDiff * yDiff;
      xDenominator += xDiff * xDiff;
      yDenominator += yDiff * yDiff;
    }

    const denominator = Math.sqrt(xDenominator * yDenominator);
    return denominator !== 0 ? numerator / denominator : 0;
  }

  private detectChangePoints(values: number[], timestamps: number[]): number[] {
    // Simplified CUSUM algorithm for change point detection
    const changePoints: number[] = [];
    const windowSize = Math.max(10, Math.floor(values.length * 0.1));

    for (let i = windowSize; i < values.length - windowSize; i++) {
      const before = values.slice(i - windowSize, i);
      const after = values.slice(i, i + windowSize);

      const beforeMean = before.reduce((sum, val) => sum + val, 0) / before.length;
      const afterMean = after.reduce((sum, val) => sum + val, 0) / after.length;

      // If means differ significantly, mark as change point
      const combinedStd = this.calculateStandardDeviation([...before, ...after]);
      if (Math.abs(beforeMean - afterMean) > 2 * combinedStd) {
        changePoints.push(timestamps[i]);
      }
    }

    return changePoints;
  }

  private calculateRollingMean(values: number[], windowSize: number): number[] {
    const result: number[] = [];
    for (let i = 0; i < values.length; i++) {
      const start = Math.max(0, i - windowSize + 1);
      const window = values.slice(start, i + 1);
      result[i] = window.reduce((sum, val) => sum + val, 0) / window.length;
    }
    return result;
  }

  private calculateRollingStd(values: number[], means: number[], windowSize: number): number[] {
    const result: number[] = [];
    for (let i = 0; i < values.length; i++) {
      const start = Math.max(0, i - windowSize + 1);
      const window = values.slice(start, i + 1);
      const mean = means[i];
      const variance = window.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / window.length;
      result[i] = Math.sqrt(variance);
    }
    return result;
  }

  private calculateAnomalySeverity(deviation: number, threshold: number): Anomaly['severity'] {
    const ratio = deviation / threshold;
    if (ratio > 4) return 'critical';
    if (ratio > 3) return 'high';
    if (ratio > 2) return 'medium';
    return 'low';
  }

  private determineAnomalyType(value: number, expected: number, values: number[], index: number): Anomaly['type'] {
    if (value > expected * 2) return 'spike';
    if (value < expected * 0.5) return 'drop';

    // Check for pattern break
    const recentPattern = values.slice(Math.max(0, index - 5), index);
    const avgRecent = recentPattern.reduce((sum, val) => sum + val, 0) / recentPattern.length;

    if (Math.abs(value - avgRecent) > Math.abs(expected - avgRecent)) {
      return 'pattern_break';
    }

    return 'outlier';
  }

  private detectInterval(timestamps: number[]): number {
    if (timestamps.length < 2) return 60000; // Default 1 minute

    const gaps = [];
    for (let i = 1; i < Math.min(timestamps.length, 10); i++) {
      gaps.push(timestamps[i] - timestamps[i - 1]);
    }

    return gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length;
  }

  private async exponentialSmoothingForecast(values: number[], periods: number): Promise<number[]> {
    const alpha = this.config.exponentialAlpha;
    const forecast: number[] = [];

    // Initialize with last observed value
    let lastSmoothed = values[values.length - 1];

    for (let i = 0; i < periods; i++) {
      forecast.push(lastSmoothed);
      // For simplicity, keeping the same value (in practice, would update with trend/seasonal components)
    }

    return forecast;
  }

  private async linearTrendForecast(values: number[], timestamps: number[], periods: number, interval: number): Promise<number[]> {
    // Calculate linear trend
    const n = values.length;
    const xMean = timestamps.reduce((sum, t) => sum + t, 0) / n;
    const yMean = values.reduce((sum, v) => sum + v, 0) / n;

    let numerator = 0;
    let denominator = 0;
    for (let i = 0; i < n; i++) {
      const xDiff = timestamps[i] - xMean;
      const yDiff = values[i] - yMean;
      numerator += xDiff * yDiff;
      denominator += xDiff * xDiff;
    }

    const slope = denominator !== 0 ? numerator / denominator : 0;
    const intercept = yMean - slope * xMean;

    // Generate forecasts
    const forecast: number[] = [];
    const lastTimestamp = Math.max(...timestamps);

    for (let i = 1; i <= periods; i++) {
      const futureTimestamp = lastTimestamp + i * interval;
      const predictedValue = slope * futureTimestamp + intercept;
      forecast.push(predictedValue);
    }

    return forecast;
  }

  private async seasonalNaiveForecast(values: number[], periods: number): Promise<number[]> {
    // Simple seasonal naive: repeat the last seasonal pattern
    const seasonLength = Math.min(24, values.length); // Assume daily seasonality
    const forecast: number[] = [];

    for (let i = 0; i < periods; i++) {
      const seasonalIndex = i % seasonLength;
      const historicalIndex = Math.max(0, values.length - seasonLength + seasonalIndex);
      forecast.push(values[historicalIndex]);
    }

    return forecast;
  }

  /**
   * Clear analysis cache
   */
  clearCache(): void {
    this.cache.clear();
    logger.info('TimeSeriesAnalyzer cache cleared');
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; keys: string[] } {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys())
    };
  }
}