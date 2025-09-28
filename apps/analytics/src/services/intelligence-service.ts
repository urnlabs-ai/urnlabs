import { PrismaClient } from '@prisma/client';
import { Redis } from 'ioredis';
import { 
  AlertRule, 
  AlertSeverity, 
  AlertCondition,
  AlertChannel,
  TimeSeriesData,
  MetricQuery 
} from '../types/metrics.js';
import { Logger } from '../utils/logger.js';
import { MetricsCollector } from './metrics-collector.js';
import { ROICalculator } from './roi-calculator.js';

export interface BusinessInsight {
  id: string;
  type: InsightType;
  title: string;
  description: string;
  impact: InsightImpact;
  confidence: number;
  data_points: any[];
  recommendations: string[];
  created_at: Date;
  expires_at?: Date;
  metadata: Record<string, any>;
}

export interface TrendAnalysis {
  metric: string;
  trend_direction: 'up' | 'down' | 'stable';
  trend_strength: number;
  change_percent: number;
  significance: number;
  forecast: number[];
  anomalies: AnomalyDetection[];
}

export interface AnomalyDetection {
  timestamp: Date;
  expected_value: number;
  actual_value: number;
  deviation_score: number;
  anomaly_type: 'spike' | 'drop' | 'plateau' | 'drift';
  severity: 'low' | 'medium' | 'high';
}

export interface PerformanceOptimization {
  service: string;
  current_performance: Record<string, number>;
  bottlenecks: Bottleneck[];
  optimization_opportunities: OptimizationOpportunity[];
  estimated_improvement: Record<string, number>;
  implementation_effort: 'low' | 'medium' | 'high';
}

export interface Bottleneck {
  component: string;
  metric: string;
  current_value: number;
  threshold: number;
  impact_score: number;
  description: string;
}

export interface OptimizationOpportunity {
  id: string;
  title: string;
  description: string;
  category: string;
  estimated_savings_cents: number;
  estimated_performance_gain: number;
  implementation_difficulty: number;
  priority_score: number;
}

export enum InsightType {
  PERFORMANCE_TREND = 'performance_trend',
  COST_OPTIMIZATION = 'cost_optimization',
  ANOMALY_DETECTION = 'anomaly_detection',
  PREDICTIVE_ALERT = 'predictive_alert',
  ROI_IMPROVEMENT = 'roi_improvement',
  CAPACITY_PLANNING = 'capacity_planning',
  SECURITY_RISK = 'security_risk'
}

export enum InsightImpact {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

export class IntelligenceService {
  private prisma: PrismaClient;
  private redis: Redis;
  private logger: Logger;
  private metricsCollector: MetricsCollector;
  private roiCalculator: ROICalculator;
  private activeAlerts: Map<string, AlertRule> = new Map();
  private alertCooldowns: Map<string, Date> = new Map();

  constructor(
    prisma: PrismaClient,
    redis: Redis,
    logger: Logger,
    metricsCollector: MetricsCollector,
    roiCalculator: ROICalculator
  ) {
    this.prisma = prisma;
    this.redis = redis;
    this.logger = logger;
    this.metricsCollector = metricsCollector;
    this.roiCalculator = roiCalculator;

    // Initialize alert monitoring
    this.initializeAlertMonitoring();
  }

  /**
   * Generate business insights from current data
   */
  async generateBusinessInsights(): Promise<BusinessInsight[]> {
    const insights: BusinessInsight[] = [];

    try {
      // Generate different types of insights
      const [
        performanceInsights,
        costInsights,
        anomalies,
        roiInsights,
        capacityInsights
      ] = await Promise.all([
        this.generatePerformanceInsights(),
        this.generateCostOptimizationInsights(),
        this.generateAnomalyInsights(),
        this.generateROIInsights(),
        this.generateCapacityInsights()
      ]);

      insights.push(
        ...performanceInsights,
        ...costInsights,
        ...anomalies,
        ...roiInsights,
        ...capacityInsights
      );

      // Store insights
      for (const insight of insights) {
        await this.storeInsight(insight);
      }

      this.logger.info('Generated business insights', { 
        count: insights.length 
      });

      return insights;
    } catch (error) {
      this.logger.error('Failed to generate business insights', { error });
      throw error;
    }
  }

  /**
   * Analyze trends in metrics data
   */
  async analyzeTrends(
    metric: string, 
    timeRange: { start: Date; end: Date },
    forecastDays: number = 7
  ): Promise<TrendAnalysis> {
    const query: MetricQuery = {
      metric_name: metric,
      time_range: timeRange,
      aggregation: {
        function: 'avg',
        interval: '1h'
      }
    };

    const result = await this.metricsCollector.queryMetrics(query);
    
    if (result.data.length < 2) {
      throw new Error('Insufficient data for trend analysis');
    }

    // Calculate trend
    const values = result.data.map(d => d.value);
    const trend = this.calculateTrendDirection(values);
    const changePercent = this.calculateChangePercent(values);
    
    // Detect anomalies
    const anomalies = this.detectAnomalies(result.data);
    
    // Generate forecast
    const forecast = this.generateForecast(values, forecastDays);

    return {
      metric,
      trend_direction: trend.direction,
      trend_strength: trend.strength,
      change_percent: changePercent,
      significance: trend.significance,
      forecast,
      anomalies
    };
  }

  /**
   * Create alert rule
   */
  async createAlertRule(rule: Omit<AlertRule, 'id'>): Promise<AlertRule> {
    const fullRule: AlertRule = {
      id: this.generateAlertId(),
      ...rule
    };

    // Store alert rule
    await this.redis.hset(
      'analytics:alerts',
      fullRule.id,
      JSON.stringify(fullRule)
    );

    // Add to active monitoring
    if (fullRule.enabled) {
      this.activeAlerts.set(fullRule.id, fullRule);
    }

    this.logger.info('Alert rule created', {
      alert_id: fullRule.id,
      name: fullRule.name,
      severity: fullRule.severity
    });

    return fullRule;
  }

  /**
   * Evaluate alert rules
   */
  async evaluateAlerts(): Promise<void> {
    for (const [alertId, rule] of this.activeAlerts) {
      try {
        // Check cooldown
        const lastAlert = this.alertCooldowns.get(alertId);
        if (lastAlert && Date.now() - lastAlert.getTime() < rule.cooldown_minutes * 60 * 1000) {
          continue;
        }

        const shouldAlert = await this.evaluateAlertRule(rule);
        
        if (shouldAlert) {
          await this.triggerAlert(rule);
          this.alertCooldowns.set(alertId, new Date());
        }
      } catch (error) {
        this.logger.error('Failed to evaluate alert rule', {
          alert_id: alertId,
          error
        });
      }
    }
  }

  /**
   * Identify performance optimization opportunities
   */
  async identifyOptimizationOpportunities(): Promise<PerformanceOptimization[]> {
    const services = await this.getMonitoredServices();
    const optimizations: PerformanceOptimization[] = [];

    for (const service of services) {
      const performance = await this.analyzeServicePerformance(service);
      const bottlenecks = await this.identifyBottlenecks(service);
      const opportunities = await this.findOptimizationOpportunities(service, bottlenecks);

      optimizations.push({
        service,
        current_performance: performance,
        bottlenecks,
        optimization_opportunities: opportunities,
        estimated_improvement: this.calculateEstimatedImprovement(opportunities),
        implementation_effort: this.assessImplementationEffort(opportunities)
      });
    }

    return optimizations;
  }

  /**
   * Generate performance insights
   */
  private async generatePerformanceInsights(): Promise<BusinessInsight[]> {
    const insights: BusinessInsight[] = [];
    const services = await this.getMonitoredServices();

    for (const service of services) {
      const trends = await this.analyzeTrends(
        `${service}.response_time`,
        {
          start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
          end: new Date()
        }
      );

      if (trends.trend_direction === 'up' && trends.trend_strength > 0.5) {
        insights.push({
          id: this.generateInsightId(),
          type: InsightType.PERFORMANCE_TREND,
          title: `Performance Degradation Detected in ${service}`,
          description: `Response time has increased by ${trends.change_percent.toFixed(1)}% over the past week`,
          impact: trends.change_percent > 20 ? InsightImpact.HIGH : InsightImpact.MEDIUM,
          confidence: trends.significance,
          data_points: [trends],
          recommendations: [
            'Review recent deployments for performance regressions',
            'Check for increased load or traffic patterns',
            'Analyze slow queries and optimize database performance',
            'Consider scaling resources if capacity limits are reached'
          ],
          created_at: new Date(),
          metadata: {
            service,
            metric: `${service}.response_time`,
            trend_data: trends
          }
        });
      }
    }

    return insights;
  }

  /**
   * Generate cost optimization insights
   */
  private async generateCostOptimizationInsights(): Promise<BusinessInsight[]> {
    const insights: BusinessInsight[] = [];
    
    // Analyze recent ROI data
    const roiData = await this.roiCalculator.calculateROI(
      new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      new Date()
    );

    // Check for high-cost, low-value agents
    const agentCosts = roiData.breakdown.agent_costs;
    const highCostAgents = Object.entries(agentCosts)
      .filter(([agent, cost]) => cost > 1000) // $10+ per month
      .sort(([,a], [,b]) => b - a);

    if (highCostAgents.length > 0) {
      insights.push({
        id: this.generateInsightId(),
        type: InsightType.COST_OPTIMIZATION,
        title: 'High-Cost AI Agents Identified',
        description: `${highCostAgents.length} agents have high operational costs`,
        impact: InsightImpact.MEDIUM,
        confidence: 0.9,
        data_points: highCostAgents,
        recommendations: [
          'Review usage patterns for high-cost agents',
          'Optimize prompts to reduce token usage',
          'Consider switching to more cost-effective models',
          'Implement caching for frequently requested operations'
        ],
        created_at: new Date(),
        metadata: {
          total_cost_cents: Object.values(agentCosts).reduce((sum, cost) => sum + cost, 0),
          high_cost_agents: highCostAgents
        }
      });
    }

    return insights;
  }

  /**
   * Generate anomaly insights
   */
  private async generateAnomalyInsights(): Promise<BusinessInsight[]> {
    const insights: BusinessInsight[] = [];
    const services = await this.getMonitoredServices();

    for (const service of services) {
      const anomalies = await this.detectServiceAnomalies(service);
      
      const highSeverityAnomalies = anomalies.filter(a => a.severity === 'high');
      
      if (highSeverityAnomalies.length > 0) {
        insights.push({
          id: this.generateInsightId(),
          type: InsightType.ANOMALY_DETECTION,
          title: `Anomalies Detected in ${service}`,
          description: `${highSeverityAnomalies.length} high-severity anomalies detected`,
          impact: InsightImpact.HIGH,
          confidence: 0.8,
          data_points: highSeverityAnomalies,
          recommendations: [
            'Investigate root cause of anomalous behavior',
            'Check for external factors affecting performance',
            'Review recent configuration changes',
            'Monitor for recurring patterns'
          ],
          created_at: new Date(),
          expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000), // Expire in 24 hours
          metadata: {
            service,
            anomaly_count: anomalies.length,
            detection_method: 'statistical_analysis'
          }
        });
      }
    }

    return insights;
  }

  /**
   * Generate ROI insights
   */
  private async generateROIInsights(): Promise<BusinessInsight[]> {
    const insights: BusinessInsight[] = [];
    
    const roiData = await this.roiCalculator.calculateROI(
      new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      new Date()
    );

    if (roiData.roi_percent < 0) {
      insights.push({
        id: this.generateInsightId(),
        type: InsightType.ROI_IMPROVEMENT,
        title: 'Negative ROI Detected',
        description: `Current ROI is ${roiData.roi_percent.toFixed(1)}%, indicating costs exceed benefits`,
        impact: InsightImpact.CRITICAL,
        confidence: 0.95,
        data_points: [roiData],
        recommendations: [
          'Reduce operational costs through optimization',
          'Increase automation to improve labor savings',
          'Focus on high-value use cases',
          'Review and optimize agent efficiency'
        ],
        created_at: new Date(),
        metadata: {
          roi_percent: roiData.roi_percent,
          total_cost_cents: roiData.total_cost_cents,
          payback_period_days: roiData.payback_period_days
        }
      });
    } else if (roiData.roi_percent > 200) {
      insights.push({
        id: this.generateInsightId(),
        type: InsightType.ROI_IMPROVEMENT,
        title: 'Excellent ROI Performance',
        description: `Current ROI is ${roiData.roi_percent.toFixed(1)}%, indicating strong value delivery`,
        impact: InsightImpact.HIGH,
        confidence: 0.9,
        data_points: [roiData],
        recommendations: [
          'Scale successful automation patterns',
          'Expand to similar use cases',
          'Document best practices for replication',
          'Consider increasing investment in high-performing areas'
        ],
        created_at: new Date(),
        metadata: {
          roi_percent: roiData.roi_percent,
          key_success_factors: roiData.breakdown
        }
      });
    }

    return insights;
  }

  /**
   * Generate capacity insights
   */
  private async generateCapacityInsights(): Promise<BusinessInsight[]> {
    const insights: BusinessInsight[] = [];
    
    // Analyze resource utilization trends
    const utilizationTrends = await this.analyzeResourceUtilization();
    
    for (const [resource, trend] of Object.entries(utilizationTrends)) {
      if (trend.current_utilization > 80) {
        insights.push({
          id: this.generateInsightId(),
          type: InsightType.CAPACITY_PLANNING,
          title: `High Resource Utilization: ${resource}`,
          description: `${resource} utilization is at ${trend.current_utilization}%`,
          impact: trend.current_utilization > 90 ? InsightImpact.CRITICAL : InsightImpact.HIGH,
          confidence: 0.85,
          data_points: [trend],
          recommendations: [
            'Plan for capacity expansion',
            'Optimize resource usage',
            'Implement auto-scaling if available',
            'Monitor for performance degradation'
          ],
          created_at: new Date(),
          metadata: {
            resource,
            utilization_data: trend
          }
        });
      }
    }

    return insights;
  }

  /**
   * Helper methods
   */
  private calculateTrendDirection(values: number[]): {
    direction: 'up' | 'down' | 'stable';
    strength: number;
    significance: number;
  } {
    if (values.length < 2) {
      return { direction: 'stable', strength: 0, significance: 0 };
    }

    const n = values.length;
    const sumX = n * (n - 1) / 2;
    const sumY = values.reduce((sum, val) => sum + val, 0);
    const sumXY = values.reduce((sum, val, idx) => sum + val * idx, 0);
    const sumX2 = n * (n - 1) * (2 * n - 1) / 6;

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const strength = Math.abs(slope) / (Math.max(...values) - Math.min(...values) || 1);
    
    // Simple significance test (would use proper statistical tests in production)
    const significance = Math.min(1, strength * Math.sqrt(n) / 10);

    return {
      direction: slope > 0.01 ? 'up' : slope < -0.01 ? 'down' : 'stable',
      strength: Math.min(1, strength),
      significance
    };
  }

  private calculateChangePercent(values: number[]): number {
    if (values.length < 2) return 0;
    
    const start = values[0];
    const end = values[values.length - 1];
    
    if (start === 0) return end > 0 ? 100 : 0;
    
    return ((end - start) / start) * 100;
  }

  private detectAnomalies(data: TimeSeriesData[]): AnomalyDetection[] {
    if (data.length < 10) return [];

    const values = data.map(d => d.value);
    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    const stdDev = Math.sqrt(
      values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length
    );

    const anomalies: AnomalyDetection[] = [];
    
    for (let i = 0; i < data.length; i++) {
      const value = data[i].value;
      const deviationScore = Math.abs(value - mean) / stdDev;
      
      if (deviationScore > 2) { // 2 standard deviations
        let anomalyType: 'spike' | 'drop' | 'plateau' | 'drift' = 'spike';
        let severity: 'low' | 'medium' | 'high' = 'low';
        
        if (value > mean) {
          anomalyType = 'spike';
        } else {
          anomalyType = 'drop';
        }
        
        if (deviationScore > 3) severity = 'high';
        else if (deviationScore > 2.5) severity = 'medium';
        
        anomalies.push({
          timestamp: data[i].timestamp,
          expected_value: mean,
          actual_value: value,
          deviation_score: deviationScore,
          anomaly_type: anomalyType,
          severity
        });
      }
    }

    return anomalies;
  }

  private generateForecast(values: number[], days: number): number[] {
    // Simple linear regression forecast (would use more sophisticated methods in production)
    if (values.length < 2) return [];

    const n = values.length;
    const trend = this.calculateTrendDirection(values);
    const lastValue = values[values.length - 1];
    const avgChange = trend.direction === 'up' ? 
      trend.strength * 0.1 : 
      trend.direction === 'down' ? -trend.strength * 0.1 : 0;

    const forecast: number[] = [];
    for (let i = 1; i <= days; i++) {
      forecast.push(Math.max(0, lastValue + avgChange * i));
    }

    return forecast;
  }

  private async evaluateAlertRule(rule: AlertRule): Promise<boolean> {
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - rule.condition.time_window_minutes * 60 * 1000);

    const query: MetricQuery = {
      metric_name: rule.metric_query,
      time_range: { start: startTime, end: endTime },
      aggregation: {
        function: rule.condition.aggregation,
        interval: '1m'
      }
    };

    const result = await this.metricsCollector.queryMetrics(query);
    
    if (result.data.length === 0) return false;

    let value: number;
    switch (rule.condition.aggregation) {
      case 'avg':
        value = result.data.reduce((sum, d) => sum + d.value, 0) / result.data.length;
        break;
      case 'sum':
        value = result.data.reduce((sum, d) => sum + d.value, 0);
        break;
      case 'min':
        value = Math.min(...result.data.map(d => d.value));
        break;
      case 'max':
        value = Math.max(...result.data.map(d => d.value));
        break;
      case 'count':
        value = result.data.length;
        break;
      default:
        value = result.data[result.data.length - 1].value;
    }

    // Evaluate condition
    switch (rule.condition.operator) {
      case 'gt':
        return value > rule.threshold_value;
      case 'gte':
        return value >= rule.threshold_value;
      case 'lt':
        return value < rule.threshold_value;
      case 'lte':
        return value <= rule.threshold_value;
      case 'eq':
        return value === rule.threshold_value;
      default:
        return false;
    }
  }

  private async triggerAlert(rule: AlertRule): Promise<void> {
    this.logger.warn('Alert triggered', {
      alert_id: rule.id,
      name: rule.name,
      severity: rule.severity
    });

    // Send to configured channels
    for (const channel of rule.channels) {
      try {
        await this.sendAlert(rule, channel);
      } catch (error) {
        this.logger.error('Failed to send alert', {
          alert_id: rule.id,
          channel_type: channel.type,
          error
        });
      }
    }
  }

  private async sendAlert(rule: AlertRule, channel: AlertChannel): Promise<void> {
    const alertMessage = `🚨 Alert: ${rule.name}\n${rule.description}\nSeverity: ${rule.severity.toUpperCase()}`;

    switch (channel.type) {
      case 'email':
        // Implementation would send email
        break;
      case 'slack':
        // Implementation would send to Slack
        break;
      case 'webhook':
        // Implementation would call webhook
        break;
      case 'sms':
        // Implementation would send SMS
        break;
    }
  }

  private async storeInsight(insight: BusinessInsight): Promise<void> {
    await this.redis.lpush('business:insights', JSON.stringify(insight));
    await this.redis.ltrim('business:insights', 0, 99); // Keep last 100 insights
  }

  private async initializeAlertMonitoring(): Promise<void> {
    // Load existing alert rules
    const alertIds = await this.redis.hkeys('analytics:alerts');
    
    for (const alertId of alertIds) {
      const alertData = await this.redis.hget('analytics:alerts', alertId);
      if (alertData) {
        const rule = JSON.parse(alertData) as AlertRule;
        if (rule.enabled) {
          this.activeAlerts.set(alertId, rule);
        }
      }
    }

    // Start alert evaluation loop
    setInterval(async () => {
      await this.evaluateAlerts();
    }, 60000); // Evaluate every minute
  }

  private async getMonitoredServices(): Promise<string[]> {
    // Return list of services being monitored
    return ['api', 'agents', 'gateway', 'dashboard'];
  }

  private async analyzeServicePerformance(service: string): Promise<Record<string, number>> {
    // Implementation would analyze service performance metrics
    return {
      response_time_ms: 150,
      throughput_rps: 100,
      error_rate: 0.01,
      cpu_utilization: 45,
      memory_utilization: 60
    };
  }

  private async identifyBottlenecks(service: string): Promise<Bottleneck[]> {
    // Implementation would identify performance bottlenecks
    return [];
  }

  private async findOptimizationOpportunities(
    service: string, 
    bottlenecks: Bottleneck[]
  ): Promise<OptimizationOpportunity[]> {
    // Implementation would find optimization opportunities
    return [];
  }

  private calculateEstimatedImprovement(
    opportunities: OptimizationOpportunity[]
  ): Record<string, number> {
    return {
      cost_savings_cents: opportunities.reduce((sum, opp) => sum + opp.estimated_savings_cents, 0),
      performance_gain: opportunities.reduce((sum, opp) => sum + opp.estimated_performance_gain, 0)
    };
  }

  private assessImplementationEffort(opportunities: OptimizationOpportunity[]): 'low' | 'medium' | 'high' {
    const avgDifficulty = opportunities.reduce((sum, opp) => sum + opp.implementation_difficulty, 0) / opportunities.length;
    
    if (avgDifficulty < 3) return 'low';
    if (avgDifficulty < 7) return 'medium';
    return 'high';
  }

  private async detectServiceAnomalies(service: string): Promise<AnomalyDetection[]> {
    // Implementation would detect anomalies for specific service
    return [];
  }

  private async analyzeResourceUtilization(): Promise<Record<string, any>> {
    // Implementation would analyze resource utilization
    return {
      cpu: { current_utilization: 75, trend: 'up' },
      memory: { current_utilization: 82, trend: 'stable' },
      storage: { current_utilization: 45, trend: 'up' }
    };
  }

  private generateInsightId(): string {
    return `insight_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateAlertId(): string {
    return `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}