import axios from 'axios';
import { format, subHours, subDays, subMonths, startOfDay, endOfDay, eachHourOfInterval, eachDayOfInterval } from 'date-fns';

export interface MetricDataPoint {
  timestamp: Date;
  value: number;
  metadata?: Record<string, any>;
}

export interface AggregatedMetric {
  name: string;
  data: MetricDataPoint[];
  summary: {
    current: number;
    previous: number;
    change: number;
    changePercent: number;
    trend: 'up' | 'down' | 'stable';
  };
}

export interface BusinessKPI {
  id: string;
  name: string;
  value: number;
  target: number;
  unit: string;
  change: number;
  changePercent: number;
  trend: 'up' | 'down' | 'stable';
  status: 'good' | 'warning' | 'critical';
  category: 'performance' | 'cost' | 'quality' | 'usage';
}

export interface PerformanceMetrics {
  apiResponseTime: AggregatedMetric;
  errorRate: AggregatedMetric;
  throughput: AggregatedMetric;
  uptime: AggregatedMetric;
}

export interface CostMetrics {
  totalCost: AggregatedMetric;
  costPerExecution: AggregatedMetric;
  costSavings: AggregatedMetric;
  efficiency: AggregatedMetric;
}

export interface UsageMetrics {
  activeUsers: AggregatedMetric;
  executionsCount: AggregatedMetric;
  dataProcessed: AggregatedMetric;
  userEngagement: AggregatedMetric;
}

export interface ROIMetrics {
  totalROI: number;
  monthlySavings: number;
  automationEfficiency: number;
  timeToValue: number;
  productivityGain: number;
}

export interface TimeRange {
  start: Date;
  end: Date;
  granularity: 'hour' | 'day' | 'week' | 'month';
}

export class MetricsAggregator {
  private apiBaseUrl: string;
  private prometheusUrl: string;
  private cache: Map<string, { data: any; timestamp: number; ttl: number }> = new Map();

  constructor(apiBaseUrl: string = 'http://localhost:7001', prometheusUrl: string = 'http://localhost:9090') {
    this.apiBaseUrl = apiBaseUrl;
    this.prometheusUrl = prometheusUrl;
  }

  /**
   * Get comprehensive business KPIs
   */
  async getBusinessKPIs(timeRange: TimeRange): Promise<BusinessKPI[]> {
    const cacheKey = `business_kpis_${timeRange.start.getTime()}_${timeRange.end.getTime()}`;
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached;

    try {
      const [performance, cost, usage, roi] = await Promise.all([
        this.getPerformanceMetrics(timeRange),
        this.getCostMetrics(timeRange),
        this.getUsageMetrics(timeRange),
        this.getROIMetrics(timeRange)
      ]);

      const kpis: BusinessKPI[] = [
        // Performance KPIs
        {
          id: 'api_response_time',
          name: 'API Response Time',
          value: performance.apiResponseTime.summary.current,
          target: 200,
          unit: 'ms',
          change: performance.apiResponseTime.summary.change,
          changePercent: performance.apiResponseTime.summary.changePercent,
          trend: performance.apiResponseTime.summary.trend,
          status: performance.apiResponseTime.summary.current <= 200 ? 'good' : 
                 performance.apiResponseTime.summary.current <= 500 ? 'warning' : 'critical',
          category: 'performance'
        },
        {
          id: 'error_rate',
          name: 'Error Rate',
          value: performance.errorRate.summary.current,
          target: 1,
          unit: '%',
          change: performance.errorRate.summary.change,
          changePercent: performance.errorRate.summary.changePercent,
          trend: performance.errorRate.summary.trend,
          status: performance.errorRate.summary.current <= 1 ? 'good' : 
                 performance.errorRate.summary.current <= 5 ? 'warning' : 'critical',
          category: 'performance'
        },
        {
          id: 'uptime',
          name: 'System Uptime',
          value: performance.uptime.summary.current,
          target: 99.9,
          unit: '%',
          change: performance.uptime.summary.change,
          changePercent: performance.uptime.summary.changePercent,
          trend: performance.uptime.summary.trend,
          status: performance.uptime.summary.current >= 99.9 ? 'good' : 
                 performance.uptime.summary.current >= 99 ? 'warning' : 'critical',
          category: 'performance'
        },

        // Cost KPIs
        {
          id: 'total_cost',
          name: 'Total Operating Cost',
          value: cost.totalCost.summary.current,
          target: 10000,
          unit: '$',
          change: cost.totalCost.summary.change,
          changePercent: cost.totalCost.summary.changePercent,
          trend: cost.totalCost.summary.trend,
          status: cost.totalCost.summary.current <= 10000 ? 'good' : 
                 cost.totalCost.summary.current <= 15000 ? 'warning' : 'critical',
          category: 'cost'
        },
        {
          id: 'cost_savings',
          name: 'Monthly Cost Savings',
          value: cost.costSavings.summary.current,
          target: 50000,
          unit: '$',
          change: cost.costSavings.summary.change,
          changePercent: cost.costSavings.summary.changePercent,
          trend: cost.costSavings.summary.trend,
          status: cost.costSavings.summary.current >= 50000 ? 'good' : 
                 cost.costSavings.summary.current >= 25000 ? 'warning' : 'critical',
          category: 'cost'
        },

        // Usage KPIs
        {
          id: 'active_users',
          name: 'Monthly Active Users',
          value: usage.activeUsers.summary.current,
          target: 1000,
          unit: 'users',
          change: usage.activeUsers.summary.change,
          changePercent: usage.activeUsers.summary.changePercent,
          trend: usage.activeUsers.summary.trend,
          status: usage.activeUsers.summary.current >= 1000 ? 'good' : 
                 usage.activeUsers.summary.current >= 500 ? 'warning' : 'critical',
          category: 'usage'
        },
        {
          id: 'execution_count',
          name: 'Daily Executions',
          value: usage.executionsCount.summary.current,
          target: 10000,
          unit: 'executions',
          change: usage.executionsCount.summary.change,
          changePercent: usage.executionsCount.summary.changePercent,
          trend: usage.executionsCount.summary.trend,
          status: usage.executionsCount.summary.current >= 10000 ? 'good' : 
                 usage.executionsCount.summary.current >= 5000 ? 'warning' : 'critical',
          category: 'usage'
        },

        // Quality KPIs
        {
          id: 'automation_efficiency',
          name: 'Automation Efficiency',
          value: roi.automationEfficiency,
          target: 85,
          unit: '%',
          change: 0, // Would calculate from historical data
          changePercent: 0,
          trend: 'stable',
          status: roi.automationEfficiency >= 85 ? 'good' : 
                 roi.automationEfficiency >= 70 ? 'warning' : 'critical',
          category: 'quality'
        },
        {
          id: 'total_roi',
          name: 'Total ROI',
          value: roi.totalROI,
          target: 300,
          unit: '%',
          change: 0,
          changePercent: 0,
          trend: 'up',
          status: roi.totalROI >= 300 ? 'good' : 
                 roi.totalROI >= 200 ? 'warning' : 'critical',
          category: 'quality'
        }
      ];

      this.setCache(cacheKey, kpis, 5 * 60 * 1000); // Cache for 5 minutes
      return kpis;
    } catch (error) {
      console.error('Error fetching business KPIs:', error);
      return this.getMockKPIs();
    }
  }

  /**
   * Get performance metrics
   */
  async getPerformanceMetrics(timeRange: TimeRange): Promise<PerformanceMetrics> {
    const cacheKey = `performance_metrics_${timeRange.start.getTime()}_${timeRange.end.getTime()}`;
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached;

    try {
      const [responseTime, errorRate, throughput, uptime] = await Promise.all([
        this.queryPrometheus('avg_over_time(http_request_duration_seconds_avg[5m])', timeRange),
        this.queryPrometheus('rate(http_requests_total{status=~"5.."}[5m]) * 100', timeRange),
        this.queryPrometheus('rate(http_requests_total[5m])', timeRange),
        this.queryPrometheus('up', timeRange)
      ]);

      const metrics: PerformanceMetrics = {
        apiResponseTime: this.aggregateMetricData('API Response Time', responseTime, 'ms'),
        errorRate: this.aggregateMetricData('Error Rate', errorRate, '%'),
        throughput: this.aggregateMetricData('Throughput', throughput, 'req/s'),
        uptime: this.aggregateMetricData('Uptime', uptime, '%', true)
      };

      this.setCache(cacheKey, metrics, 2 * 60 * 1000); // Cache for 2 minutes
      return metrics;
    } catch (error) {
      console.error('Error fetching performance metrics:', error);
      return this.getMockPerformanceMetrics(timeRange);
    }
  }

  /**
   * Get cost metrics
   */
  async getCostMetrics(timeRange: TimeRange): Promise<CostMetrics> {
    const cacheKey = `cost_metrics_${timeRange.start.getTime()}_${timeRange.end.getTime()}`;
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached;

    try {
      // Query cost data from analytics service
      const response = await axios.get(`${this.apiBaseUrl}/api/analytics/cost-metrics`, {
        params: {
          start: timeRange.start.toISOString(),
          end: timeRange.end.toISOString(),
          granularity: timeRange.granularity
        }
      });

      const metrics: CostMetrics = {
        totalCost: this.aggregateMetricData('Total Cost', response.data.totalCost, '$'),
        costPerExecution: this.aggregateMetricData('Cost per Execution', response.data.costPerExecution, '$'),
        costSavings: this.aggregateMetricData('Cost Savings', response.data.costSavings, '$'),
        efficiency: this.aggregateMetricData('Cost Efficiency', response.data.efficiency, '%')
      };

      this.setCache(cacheKey, metrics, 5 * 60 * 1000); // Cache for 5 minutes
      return metrics;
    } catch (error) {
      console.error('Error fetching cost metrics:', error);
      return this.getMockCostMetrics(timeRange);
    }
  }

  /**
   * Get usage metrics
   */
  async getUsageMetrics(timeRange: TimeRange): Promise<UsageMetrics> {
    const cacheKey = `usage_metrics_${timeRange.start.getTime()}_${timeRange.end.getTime()}`;
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached;

    try {
      const response = await axios.get(`${this.apiBaseUrl}/api/analytics/usage-metrics`, {
        params: {
          start: timeRange.start.toISOString(),
          end: timeRange.end.toISOString(),
          granularity: timeRange.granularity
        }
      });

      const metrics: UsageMetrics = {
        activeUsers: this.aggregateMetricData('Active Users', response.data.activeUsers, 'users'),
        executionsCount: this.aggregateMetricData('Executions', response.data.executionsCount, 'count'),
        dataProcessed: this.aggregateMetricData('Data Processed', response.data.dataProcessed, 'GB'),
        userEngagement: this.aggregateMetricData('User Engagement', response.data.userEngagement, 'score')
      };

      this.setCache(cacheKey, metrics, 3 * 60 * 1000); // Cache for 3 minutes
      return metrics;
    } catch (error) {
      console.error('Error fetching usage metrics:', error);
      return this.getMockUsageMetrics(timeRange);
    }
  }

  /**
   * Get ROI metrics
   */
  async getROIMetrics(timeRange: TimeRange): Promise<ROIMetrics> {
    const cacheKey = `roi_metrics_${timeRange.start.getTime()}_${timeRange.end.getTime()}`;
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached;

    try {
      const response = await axios.get(`${this.apiBaseUrl}/api/analytics/roi-metrics`, {
        params: {
          start: timeRange.start.toISOString(),
          end: timeRange.end.toISOString()
        }
      });

      const metrics: ROIMetrics = response.data;
      this.setCache(cacheKey, metrics, 10 * 60 * 1000); // Cache for 10 minutes
      return metrics;
    } catch (error) {
      console.error('Error fetching ROI metrics:', error);
      return this.getMockROIMetrics();
    }
  }

  /**
   * Query Prometheus metrics
   */
  private async queryPrometheus(query: string, timeRange: TimeRange): Promise<MetricDataPoint[]> {
    try {
      const response = await axios.get(`${this.prometheusUrl}/api/v1/query_range`, {
        params: {
          query,
          start: Math.floor(timeRange.start.getTime() / 1000),
          end: Math.floor(timeRange.end.getTime() / 1000),
          step: this.getStepSize(timeRange.granularity)
        }
      });

      if (response.data.status === 'success' && response.data.data.result.length > 0) {
        const result = response.data.data.result[0];
        return result.values.map(([timestamp, value]: [number, string]) => ({
          timestamp: new Date(timestamp * 1000),
          value: parseFloat(value)
        }));
      }

      return [];
    } catch (error) {
      console.error('Error querying Prometheus:', error);
      return [];
    }
  }

  /**
   * Aggregate metric data with summary statistics
   */
  private aggregateMetricData(
    name: string, 
    data: MetricDataPoint[], 
    unit: string,
    isPercentage: boolean = false
  ): AggregatedMetric {
    if (data.length === 0) {
      return {
        name,
        data: [],
        summary: {
          current: 0,
          previous: 0,
          change: 0,
          changePercent: 0,
          trend: 'stable'
        }
      };
    }

    // Sort data by timestamp
    const sortedData = [...data].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    
    // Calculate current and previous values
    const current = sortedData[sortedData.length - 1]?.value || 0;
    const midpoint = Math.floor(sortedData.length / 2);
    const previous = sortedData[midpoint]?.value || 0;
    
    // Calculate change
    const change = current - previous;
    const changePercent = previous !== 0 ? (change / previous) * 100 : 0;
    
    // Determine trend
    let trend: 'up' | 'down' | 'stable' = 'stable';
    if (Math.abs(changePercent) > 5) {
      trend = changePercent > 0 ? 'up' : 'down';
    }

    // For percentage metrics, convert to percentage
    const processedData = isPercentage ? sortedData.map(point => ({
      ...point,
      value: point.value * 100
    })) : sortedData;

    return {
      name,
      data: processedData,
      summary: {
        current: isPercentage ? current * 100 : current,
        previous: isPercentage ? previous * 100 : previous,
        change: isPercentage ? change * 100 : change,
        changePercent,
        trend
      }
    };
  }

  /**
   * Get step size for Prometheus queries based on granularity
   */
  private getStepSize(granularity: string): string {
    switch (granularity) {
      case 'hour': return '5m';
      case 'day': return '1h';
      case 'week': return '6h';
      case 'month': return '1d';
      default: return '5m';
    }
  }

  /**
   * Cache management
   */
  private getFromCache(key: string): any {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < cached.ttl) {
      return cached.data;
    }
    this.cache.delete(key);
    return null;
  }

  private setCache(key: string, data: any, ttl: number): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl
    });
  }

  /**
   * Mock data generators for development/fallback
   */
  private getMockKPIs(): BusinessKPI[] {
    return [
      {
        id: 'api_response_time',
        name: 'API Response Time',
        value: 145,
        target: 200,
        unit: 'ms',
        change: -15,
        changePercent: -9.4,
        trend: 'down',
        status: 'good',
        category: 'performance'
      },
      {
        id: 'error_rate',
        name: 'Error Rate',
        value: 0.8,
        target: 1,
        unit: '%',
        change: -0.2,
        changePercent: -20,
        trend: 'down',
        status: 'good',
        category: 'performance'
      }
      // ... more mock KPIs would be added
    ];
  }

  private getMockPerformanceMetrics(timeRange: TimeRange): PerformanceMetrics {
    const dataPoints = this.generateMockDataPoints(timeRange, 150, 50);
    return {
      apiResponseTime: this.aggregateMetricData('API Response Time', dataPoints, 'ms'),
      errorRate: this.aggregateMetricData('Error Rate', this.generateMockDataPoints(timeRange, 0.8, 0.3), '%'),
      throughput: this.aggregateMetricData('Throughput', this.generateMockDataPoints(timeRange, 500, 100), 'req/s'),
      uptime: this.aggregateMetricData('Uptime', this.generateMockDataPoints(timeRange, 0.999, 0.001), '%', true)
    };
  }

  private getMockCostMetrics(timeRange: TimeRange): CostMetrics {
    return {
      totalCost: this.aggregateMetricData('Total Cost', this.generateMockDataPoints(timeRange, 8500, 1000), '$'),
      costPerExecution: this.aggregateMetricData('Cost per Execution', this.generateMockDataPoints(timeRange, 0.15, 0.03), '$'),
      costSavings: this.aggregateMetricData('Cost Savings', this.generateMockDataPoints(timeRange, 65000, 5000), '$'),
      efficiency: this.aggregateMetricData('Cost Efficiency', this.generateMockDataPoints(timeRange, 88, 5), '%')
    };
  }

  private getMockUsageMetrics(timeRange: TimeRange): UsageMetrics {
    return {
      activeUsers: this.aggregateMetricData('Active Users', this.generateMockDataPoints(timeRange, 1250, 150), 'users'),
      executionsCount: this.aggregateMetricData('Executions', this.generateMockDataPoints(timeRange, 12500, 2000), 'count'),
      dataProcessed: this.aggregateMetricData('Data Processed', this.generateMockDataPoints(timeRange, 450, 50), 'GB'),
      userEngagement: this.aggregateMetricData('User Engagement', this.generateMockDataPoints(timeRange, 7.8, 1), 'score')
    };
  }

  private getMockROIMetrics(): ROIMetrics {
    return {
      totalROI: 425,
      monthlySavings: 75000,
      automationEfficiency: 92,
      timeToValue: 30,
      productivityGain: 340
    };
  }

  private generateMockDataPoints(timeRange: TimeRange, baseValue: number, variance: number): MetricDataPoint[] {
    const points: MetricDataPoint[] = [];
    const intervals = timeRange.granularity === 'hour' ? 
      eachHourOfInterval({ start: timeRange.start, end: timeRange.end }) :
      eachDayOfInterval({ start: timeRange.start, end: timeRange.end });

    intervals.forEach(timestamp => {
      const variation = (Math.random() - 0.5) * variance * 2;
      points.push({
        timestamp,
        value: Math.max(0, baseValue + variation)
      });
    });

    return points;
  }

  /**
   * Create time range helper methods
   */
  static createTimeRange(period: string): TimeRange {
    const end = new Date();
    let start: Date;
    let granularity: 'hour' | 'day' | 'week' | 'month';

    switch (period) {
      case '1h':
        start = subHours(end, 1);
        granularity = 'hour';
        break;
      case '24h':
        start = subHours(end, 24);
        granularity = 'hour';
        break;
      case '7d':
        start = subDays(end, 7);
        granularity = 'day';
        break;
      case '30d':
        start = subDays(end, 30);
        granularity = 'day';
        break;
      case '90d':
        start = subDays(end, 90);
        granularity = 'week';
        break;
      case '1y':
        start = subDays(end, 365);
        granularity = 'month';
        break;
      default:
        start = subHours(end, 24);
        granularity = 'hour';
    }

    return { start, end, granularity };
  }
}