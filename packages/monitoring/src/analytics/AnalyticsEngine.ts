import Redis from 'ioredis';
import { MetricsData } from '../metrics/MetricsCollector.js';

interface TrendPoint {
  timestamp: number;
  value: number;
  trend: 'increasing' | 'decreasing' | 'stable';
  changeRate: number; // percentage change
}

interface CapacityPrediction {
  metric: string;
  currentValue: number;
  predictedValue: number;
  timeframe: string; // '1d', '7d', '30d'
  confidence: number; // 0-1
  threshold: number;
  estimatedDaysUntilThreshold: number | null;
  recommendation: string;
}

interface CostOptimization {
  service: string;
  currentCost: number;
  potentialSaving: number;
  recommendation: string;
  confidence: number;
  effort: 'low' | 'medium' | 'high';
  impact: 'low' | 'medium' | 'high';
}

interface AnomalyDetection {
  metric: string;
  timestamp: number;
  value: number;
  expectedValue: number;
  deviation: number;
  severity: 'low' | 'medium' | 'high';
  probability: number; // 0-1
  context: string;
}

interface InsightReport {
  summary: string;
  trends: TrendPoint[];
  capacityPredictions: CapacityPrediction[];
  costOptimizations: CostOptimization[];
  anomalies: AnomalyDetection[];
  recommendations: string[];
  timestamp: number;
}

export class AnalyticsEngine {
  private redis: Redis;
  private analysisHistory: Map<string, any[]> = new Map();

  constructor(redisUrl: string) {
    this.redis = new Redis(redisUrl);
  }

  public async analyzeMetrics(
    metricsData: MetricsData[],
    timeframe: '1h' | '1d' | '7d' | '30d' = '1d'
  ): Promise<InsightReport> {
    const trends = await this.analyzeTrends(metricsData, timeframe);
    const capacityPredictions = await this.predictCapacity(metricsData, timeframe);
    const costOptimizations = await this.analyzeCostOptimizations(metricsData);
    const anomalies = await this.detectAnomalies(metricsData);
    const recommendations = this.generateRecommendations(trends, capacityPredictions, costOptimizations, anomalies);

    const report: InsightReport = {
      summary: this.generateSummary(trends, capacityPredictions, anomalies),
      trends,
      capacityPredictions,
      costOptimizations,
      anomalies,
      recommendations,
      timestamp: Date.now()
    };

    // Store report for historical analysis
    await this.storeReport(report, timeframe);

    return report;
  }

  private async analyzeTrends(metricsData: MetricsData[], timeframe: string): Promise<TrendPoint[]> {
    const trends: TrendPoint[] = [];

    if (metricsData.length < 2) return trends;

    const metrics = [
      { path: 'api.responseTime', name: 'API Response Time' },
      { path: 'api.throughput', name: 'API Throughput' },
      { path: 'api.errorRate', name: 'API Error Rate' },
      { path: 'agents.performance', name: 'Agent Performance' },
      { path: 'agents.successRate', name: 'Agent Success Rate' },
      { path: 'workflows.successRate', name: 'Workflow Success Rate' },
      { path: 'system.memory', name: 'System Memory Usage' },
      { path: 'system.cpu', name: 'System CPU Usage' }
    ];

    for (const metric of metrics) {
      const values = this.extractMetricValues(metricsData, metric.path);
      if (values.length >= 2) {
        const trendPoint = this.calculateTrend(values, metric.name);
        if (trendPoint) trends.push(trendPoint);
      }
    }

    return trends;
  }

  private extractMetricValues(metricsData: MetricsData[], path: string): Array<{ timestamp: number; value: number }> {
    return metricsData
      .map(data => {
        const value = this.getNestedValue(data, path);
        return value !== null ? { timestamp: data.timestamp, value } : null;
      })
      .filter((item): item is { timestamp: number; value: number } => item !== null);
  }

  private getNestedValue(obj: any, path: string): number | null {
    const parts = path.split('.');
    let current = obj;

    for (const part of parts) {
      if (current && typeof current === 'object' && part in current) {
        current = current[part];
      } else {
        return null;
      }
    }

    // Handle arrays (get latest value)
    if (Array.isArray(current) && current.length > 0) {
      const latest = current[current.length - 1];
      return typeof latest === 'object' && 'value' in latest ? latest.value : latest;
    }

    return typeof current === 'number' ? current : null;
  }

  private calculateTrend(values: Array<{ timestamp: number; value: number }>, metricName: string): TrendPoint | null {
    if (values.length < 2) return null;

    // Sort by timestamp
    values.sort((a, b) => a.timestamp - b.timestamp);

    const latest = values[values.length - 1];
    const previous = values[values.length - 2];

    const changeRate = ((latest.value - previous.value) / previous.value) * 100;

    let trend: 'increasing' | 'decreasing' | 'stable';
    if (Math.abs(changeRate) < 5) {
      trend = 'stable';
    } else if (changeRate > 0) {
      trend = 'increasing';
    } else {
      trend = 'decreasing';
    }

    return {
      timestamp: latest.timestamp,
      value: latest.value,
      trend,
      changeRate: Math.round(changeRate * 100) / 100
    };
  }

  private async predictCapacity(metricsData: MetricsData[], timeframe: string): Promise<CapacityPrediction[]> {
    const predictions: CapacityPrediction[] = [];

    const capacityMetrics = [
      { path: 'system.memory', threshold: 80, name: 'Memory Usage' },
      { path: 'system.cpu', threshold: 75, name: 'CPU Usage' },
      { path: 'api.throughput', threshold: 1000, name: 'API Throughput' },
      { path: 'workflows.queueLength', threshold: 100, name: 'Workflow Queue' }
    ];

    for (const metric of capacityMetrics) {
      const values = this.extractMetricValues(metricsData, metric.path);
      if (values.length >= 3) {
        const prediction = this.linearRegression(values, metric.threshold, metric.name);
        if (prediction) predictions.push(prediction);
      }
    }

    return predictions;
  }

  private linearRegression(
    values: Array<{ timestamp: number; value: number }>,
    threshold: number,
    metricName: string
  ): CapacityPrediction | null {
    if (values.length < 3) return null;

    // Sort by timestamp
    values.sort((a, b) => a.timestamp - b.timestamp);

    const n = values.length;
    const sumX = values.reduce((sum, v, i) => sum + i, 0);
    const sumY = values.reduce((sum, v) => sum + v.value, 0);
    const sumXY = values.reduce((sum, v, i) => sum + i * v.value, 0);
    const sumXX = values.reduce((sum, v, i) => sum + i * i, 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    // Predict future values
    const currentValue = values[values.length - 1].value;
    const timeSteps = {
      '1d': 24,   // hours
      '7d': 168,  // hours
      '30d': 720  // hours
    };

    const steps = timeSteps['7d']; // Default to 7 days
    const predictedValue = intercept + slope * (n + steps);

    // Calculate confidence based on R-squared
    const meanY = sumY / n;
    const ssRes = values.reduce((sum, v, i) => {
      const predicted = intercept + slope * i;
      return sum + Math.pow(v.value - predicted, 2);
    }, 0);
    const ssTot = values.reduce((sum, v) => sum + Math.pow(v.value - meanY, 2), 0);
    const rSquared = 1 - (ssRes / ssTot);
    const confidence = Math.max(0, Math.min(1, rSquared));

    // Calculate days until threshold
    let daysUntilThreshold: number | null = null;
    if (slope > 0 && currentValue < threshold) {
      const stepsToThreshold = (threshold - currentValue) / slope;
      daysUntilThreshold = Math.max(0, stepsToThreshold);
    }

    const recommendation = this.generateCapacityRecommendation(
      currentValue,
      predictedValue,
      threshold,
      daysUntilThreshold,
      metricName
    );

    return {
      metric: metricName,
      currentValue: Math.round(currentValue * 100) / 100,
      predictedValue: Math.round(predictedValue * 100) / 100,
      timeframe: '7d',
      confidence: Math.round(confidence * 100) / 100,
      threshold,
      estimatedDaysUntilThreshold: daysUntilThreshold ? Math.round(daysUntilThreshold) : null,
      recommendation
    };
  }

  private generateCapacityRecommendation(
    current: number,
    predicted: number,
    threshold: number,
    daysUntil: number | null,
    metric: string
  ): string {
    if (current >= threshold) {
      return `${metric} is already above threshold. Immediate action required.`;
    }

    if (daysUntil !== null && daysUntil < 7) {
      return `${metric} will reach threshold in ${Math.round(daysUntil)} days. Plan capacity increase soon.`;
    }

    if (daysUntil !== null && daysUntil < 30) {
      return `${metric} will reach threshold in ${Math.round(daysUntil)} days. Consider capacity planning.`;
    }

    if (predicted > current * 1.5) {
      return `${metric} is growing rapidly. Monitor closely and prepare for scaling.`;
    }

    return `${metric} capacity appears stable. Continue monitoring.`;
  }

  private async analyzeCostOptimizations(metricsData: MetricsData[]): Promise<CostOptimization[]> {
    const optimizations: CostOptimization[] = [];

    if (metricsData.length === 0) return optimizations;

    const latest = metricsData[metricsData.length - 1];

    // Analyze API efficiency
    const avgResponseTime = this.getNestedValue(latest, 'api.responseTime.0.value') || 0;
    if (avgResponseTime > 1000) {
      optimizations.push({
        service: 'API',
        currentCost: 1000, // Placeholder
        potentialSaving: 300,
        recommendation: 'Optimize slow API endpoints to reduce server costs',
        confidence: 0.8,
        effort: 'medium',
        impact: 'high'
      });
    }

    // Analyze caching effectiveness
    const cacheHitRate = this.getNestedValue(latest, 'performance.cache.hitRate') || 0;
    if (cacheHitRate < 60) {
      optimizations.push({
        service: 'Caching',
        currentCost: 500,
        potentialSaving: 200,
        recommendation: 'Improve caching strategy to reduce database load',
        confidence: 0.7,
        effort: 'low',
        impact: 'medium'
      });
    }

    // Analyze resource utilization
    const memoryUsage = this.getNestedValue(latest, 'system.memory.0.value') || 0;
    if (memoryUsage < 40) {
      optimizations.push({
        service: 'Infrastructure',
        currentCost: 2000,
        potentialSaving: 600,
        recommendation: 'Consider downsizing instances due to low memory utilization',
        confidence: 0.6,
        effort: 'medium',
        impact: 'high'
      });
    }

    return optimizations;
  }

  private async detectAnomalies(metricsData: MetricsData[]): Promise<AnomalyDetection[]> {
    const anomalies: AnomalyDetection[] = [];

    if (metricsData.length < 10) return anomalies; // Need sufficient data

    const metrics = [
      'api.responseTime.0.value',
      'api.errorRate.0.value',
      'agents.successRate.0.value',
      'system.memory.0.value'
    ];

    for (const metricPath of metrics) {
      const values = metricsData
        .map(data => ({
          timestamp: data.timestamp,
          value: this.getNestedValue(data, metricPath)
        }))
        .filter(item => item.value !== null);

      if (values.length >= 10) {
        const anomaly = this.detectMetricAnomaly(values, metricPath);
        if (anomaly) anomalies.push(anomaly);
      }
    }

    return anomalies;
  }

  private detectMetricAnomaly(
    values: Array<{ timestamp: number; value: number }>,
    metricPath: string
  ): AnomalyDetection | null {
    if (values.length < 10) return null;

    // Use simple statistical approach (Z-score)
    const latest = values[values.length - 1];
    const historical = values.slice(0, -1);

    const mean = historical.reduce((sum, v) => sum + v.value, 0) / historical.length;
    const variance = historical.reduce((sum, v) => sum + Math.pow(v.value - mean, 2), 0) / historical.length;
    const stdDev = Math.sqrt(variance);

    if (stdDev === 0) return null; // No variation

    const zScore = Math.abs((latest.value - mean) / stdDev);

    // Consider anomaly if z-score > 2 (roughly 95% confidence)
    if (zScore > 2) {
      let severity: 'low' | 'medium' | 'high';
      if (zScore > 3) severity = 'high';
      else if (zScore > 2.5) severity = 'medium';
      else severity = 'low';

      return {
        metric: metricPath,
        timestamp: latest.timestamp,
        value: latest.value,
        expectedValue: Math.round(mean * 100) / 100,
        deviation: Math.round((latest.value - mean) * 100) / 100,
        severity,
        probability: Math.min(0.99, zScore / 4), // Rough probability mapping
        context: `Value deviates ${Math.round(zScore * 100) / 100} standard deviations from historical mean`
      };
    }

    return null;
  }

  private generateRecommendations(
    trends: TrendPoint[],
    predictions: CapacityPrediction[],
    optimizations: CostOptimization[],
    anomalies: AnomalyDetection[]
  ): string[] {
    const recommendations: string[] = [];

    // Trend-based recommendations
    const increasingTrends = trends.filter(t => t.trend === 'increasing' && Math.abs(t.changeRate) > 10);
    if (increasingTrends.length > 2) {
      recommendations.push('Multiple metrics are trending upward. Consider system health check.');
    }

    // Capacity recommendations
    const urgentCapacity = predictions.filter(p => p.estimatedDaysUntilThreshold && p.estimatedDaysUntilThreshold < 7);
    if (urgentCapacity.length > 0) {
      recommendations.push('Urgent: Some resources will reach capacity limits within a week.');
    }

    // Cost optimization recommendations
    const highImpactOptimizations = optimizations.filter(o => o.impact === 'high' && o.effort !== 'high');
    if (highImpactOptimizations.length > 0) {
      recommendations.push('High-impact, low-effort cost optimizations available.');
    }

    // Anomaly recommendations
    const highSeverityAnomalies = anomalies.filter(a => a.severity === 'high');
    if (highSeverityAnomalies.length > 0) {
      recommendations.push('High-severity anomalies detected. Investigate immediately.');
    }

    // General health recommendations
    if (recommendations.length === 0) {
      recommendations.push('System metrics appear normal. Continue regular monitoring.');
    }

    return recommendations;
  }

  private generateSummary(
    trends: TrendPoint[],
    predictions: CapacityPrediction[],
    anomalies: AnomalyDetection[]
  ): string {
    const increasingTrends = trends.filter(t => t.trend === 'increasing').length;
    const decreasingTrends = trends.filter(t => t.trend === 'decreasing').length;
    const urgentCapacity = predictions.filter(p => p.estimatedDaysUntilThreshold && p.estimatedDaysUntilThreshold < 7).length;
    const highAnomalies = anomalies.filter(a => a.severity === 'high').length;

    let status = 'healthy';
    if (highAnomalies > 0 || urgentCapacity > 0) {
      status = 'critical';
    } else if (increasingTrends > decreasingTrends && increasingTrends > 2) {
      status = 'warning';
    }

    return `System status: ${status}. ${trends.length} trends analyzed, ${predictions.length} capacity predictions, ${anomalies.length} anomalies detected.`;
  }

  private async storeReport(report: InsightReport, timeframe: string): Promise<void> {
    try {
      const key = `analytics:report:${timeframe}:${Math.floor(report.timestamp / 3600000)}`; // Hour-based key
      await this.redis.setex(key, 86400, JSON.stringify(report)); // 24-hour TTL

      // Maintain timeline
      await this.redis.zadd('analytics:timeline', report.timestamp, key);

      // Cleanup old reports (older than 30 days)
      const cutoff = report.timestamp - (30 * 24 * 60 * 60 * 1000);
      await this.redis.zremrangebyscore('analytics:timeline', 0, cutoff);
    } catch (error) {
      console.error('Failed to store analytics report:', error);
    }
  }

  public async getHistoricalReports(startTime: number, endTime: number): Promise<InsightReport[]> {
    try {
      const keys = await this.redis.zrangebyscore('analytics:timeline', startTime, endTime);
      const pipeline = this.redis.pipeline();

      keys.forEach(key => pipeline.get(key));
      const results = await pipeline.exec();

      return results
        ?.map(([err, data]) => err ? null : JSON.parse(data as string))
        .filter(Boolean) as InsightReport[] || [];
    } catch (error) {
      console.error('Failed to get historical reports:', error);
      return [];
    }
  }

  public destroy(): void {
    this.redis.disconnect();
  }
}