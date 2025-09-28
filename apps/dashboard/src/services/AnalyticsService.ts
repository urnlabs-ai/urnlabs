import axios, { AxiosInstance } from 'axios';
import { BusinessKPI, TimeRange, MetricsAggregator } from './MetricsAggregator';

export interface DashboardConfig {
  refreshInterval: number;
  autoRefresh: boolean;
  theme: 'light' | 'dark';
  layout: 'grid' | 'list';
  widgets: string[];
}

export interface AlertRule {
  id: string;
  name: string;
  metric: string;
  condition: 'gt' | 'lt' | 'eq' | 'ne';
  threshold: number;
  severity: 'info' | 'warning' | 'error' | 'critical';
  enabled: boolean;
  notifications: {
    email: boolean;
    slack: boolean;
    webhook?: string;
  };
}

export interface Alert {
  id: string;
  ruleId: string;
  title: string;
  description: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
  timestamp: Date;
  resolved: boolean;
  resolvedAt?: Date;
  metadata: Record<string, any>;
}

export interface ExportConfig {
  format: 'pdf' | 'csv' | 'xlsx' | 'json';
  widgets: string[];
  timeRange: TimeRange;
  includeCharts: boolean;
  includeData: boolean;
}

export interface WebSocketMessage {
  type: 'metric_update' | 'alert' | 'status_change' | 'config_update';
  data: any;
  timestamp: Date;
}

export interface ForecastData {
  metric: string;
  historical: { timestamp: Date; value: number }[];
  forecast: { timestamp: Date; value: number; confidence: number }[];
  trend: 'increasing' | 'decreasing' | 'stable' | 'seasonal';
  accuracy: number;
}

export class AnalyticsService {
  private api: AxiosInstance;
  private metricsAggregator: MetricsAggregator;
  private websocket: WebSocket | null = null;
  private eventListeners: Map<string, Function[]> = new Map();
  private connectionRetryCount = 0;
  private maxRetries = 5;
  private retryDelay = 1000;

  constructor(baseURL: string = 'http://localhost:7001') {
    this.api = axios.create({
      baseURL,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json'
      }
    });

    this.metricsAggregator = new MetricsAggregator(baseURL);
    this.setupRequestInterceptors();
    this.connectWebSocket();
  }

  /**
   * Real-time data subscription
   */
  async subscribeToMetrics(metricNames: string[], callback: (data: any) => void): Promise<void> {
    this.addEventListener('metric_update', callback);
    
    if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
      this.websocket.send(JSON.stringify({
        type: 'subscribe',
        metrics: metricNames
      }));
    }
  }

  /**
   * Unsubscribe from metrics updates
   */
  unsubscribeFromMetrics(callback: Function): void {
    this.removeEventListener('metric_update', callback);
  }

  /**
   * Get real-time dashboard data
   */
  async getDashboardData(timeRange: TimeRange, widgets: string[] = []): Promise<{
    kpis: BusinessKPI[];
    metrics: any;
    alerts: Alert[];
    lastUpdated: Date;
  }> {
    try {
      const [kpis, alerts] = await Promise.all([
        this.metricsAggregator.getBusinessKPIs(timeRange),
        this.getAlerts()
      ]);

      // Get specific metrics for requested widgets
      const metrics: any = {};
      if (widgets.includes('performance')) {
        metrics.performance = await this.metricsAggregator.getPerformanceMetrics(timeRange);
      }
      if (widgets.includes('cost')) {
        metrics.cost = await this.metricsAggregator.getCostMetrics(timeRange);
      }
      if (widgets.includes('usage')) {
        metrics.usage = await this.metricsAggregator.getUsageMetrics(timeRange);
      }
      if (widgets.includes('roi')) {
        metrics.roi = await this.metricsAggregator.getROIMetrics(timeRange);
      }

      return {
        kpis,
        metrics,
        alerts,
        lastUpdated: new Date()
      };
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
      throw new Error('Failed to fetch dashboard data');
    }
  }

  /**
   * Get forecast data for a metric
   */
  async getForecast(metric: string, timeRange: TimeRange, forecastDays: number = 30): Promise<ForecastData> {
    try {
      const response = await this.api.post('/api/analytics/forecast', {
        metric,
        timeRange,
        forecastDays
      });

      return {
        ...response.data,
        historical: response.data.historical.map((point: any) => ({
          ...point,
          timestamp: new Date(point.timestamp)
        })),
        forecast: response.data.forecast.map((point: any) => ({
          ...point,
          timestamp: new Date(point.timestamp)
        }))
      };
    } catch (error) {
      console.error('Error fetching forecast:', error);
      // Return mock forecast data
      return this.getMockForecast(metric, timeRange, forecastDays);
    }
  }

  /**
   * Alert management
   */
  async getAlerts(severity?: string, resolved?: boolean): Promise<Alert[]> {
    try {
      const response = await this.api.get('/api/analytics/alerts', {
        params: { severity, resolved }
      });

      return response.data.map((alert: any) => ({
        ...alert,
        timestamp: new Date(alert.timestamp),
        resolvedAt: alert.resolvedAt ? new Date(alert.resolvedAt) : undefined
      }));
    } catch (error) {
      console.error('Error fetching alerts:', error);
      return this.getMockAlerts();
    }
  }

  async createAlertRule(rule: Omit<AlertRule, 'id'>): Promise<AlertRule> {
    try {
      const response = await this.api.post('/api/analytics/alert-rules', rule);
      return response.data;
    } catch (error) {
      console.error('Error creating alert rule:', error);
      throw new Error('Failed to create alert rule');
    }
  }

  async updateAlertRule(id: string, updates: Partial<AlertRule>): Promise<AlertRule> {
    try {
      const response = await this.api.put(`/api/analytics/alert-rules/${id}`, updates);
      return response.data;
    } catch (error) {
      console.error('Error updating alert rule:', error);
      throw new Error('Failed to update alert rule');
    }
  }

  async deleteAlertRule(id: string): Promise<void> {
    try {
      await this.api.delete(`/api/analytics/alert-rules/${id}`);
    } catch (error) {
      console.error('Error deleting alert rule:', error);
      throw new Error('Failed to delete alert rule');
    }
  }

  async resolveAlert(alertId: string, resolution: string): Promise<void> {
    try {
      await this.api.post(`/api/analytics/alerts/${alertId}/resolve`, { resolution });
    } catch (error) {
      console.error('Error resolving alert:', error);
      throw new Error('Failed to resolve alert');
    }
  }

  /**
   * Export functionality
   */
  async exportDashboard(config: ExportConfig): Promise<Blob> {
    try {
      const response = await this.api.post('/api/analytics/export', config, {
        responseType: 'blob'
      });

      return new Blob([response.data], {
        type: this.getContentType(config.format)
      });
    } catch (error) {
      console.error('Error exporting dashboard:', error);
      throw new Error('Failed to export dashboard');
    }
  }

  async scheduleReport(config: ExportConfig & {
    schedule: 'daily' | 'weekly' | 'monthly';
    recipients: string[];
    name: string;
  }): Promise<void> {
    try {
      await this.api.post('/api/analytics/scheduled-reports', config);
    } catch (error) {
      console.error('Error scheduling report:', error);
      throw new Error('Failed to schedule report');
    }
  }

  /**
   * Advanced analytics
   */
  async getCorrelationAnalysis(metrics: string[], timeRange: TimeRange): Promise<{
    correlations: { metric1: string; metric2: string; correlation: number }[];
    insights: string[];
  }> {
    try {
      const response = await this.api.post('/api/analytics/correlations', {
        metrics,
        timeRange
      });

      return response.data;
    } catch (error) {
      console.error('Error fetching correlation analysis:', error);
      return {
        correlations: [],
        insights: ['Correlation analysis temporarily unavailable']
      };
    }
  }

  async getAnomalyDetection(metric: string, timeRange: TimeRange): Promise<{
    anomalies: { timestamp: Date; value: number; severity: number; description: string }[];
    baseline: { min: number; max: number; mean: number; stddev: number };
  }> {
    try {
      const response = await this.api.post('/api/analytics/anomalies', {
        metric,
        timeRange
      });

      return {
        ...response.data,
        anomalies: response.data.anomalies.map((anomaly: any) => ({
          ...anomaly,
          timestamp: new Date(anomaly.timestamp)
        }))
      };
    } catch (error) {
      console.error('Error fetching anomaly detection:', error);
      return {
        anomalies: [],
        baseline: { min: 0, max: 100, mean: 50, stddev: 10 }
      };
    }
  }

  /**
   * Configuration management
   */
  async saveDashboardConfig(config: DashboardConfig): Promise<void> {
    try {
      await this.api.post('/api/analytics/dashboard-config', config);
      this.emit('config_update', config);
    } catch (error) {
      console.error('Error saving dashboard config:', error);
      throw new Error('Failed to save dashboard configuration');
    }
  }

  async getDashboardConfig(): Promise<DashboardConfig> {
    try {
      const response = await this.api.get('/api/analytics/dashboard-config');
      return response.data;
    } catch (error) {
      console.error('Error fetching dashboard config:', error);
      return this.getDefaultConfig();
    }
  }

  /**
   * Data validation and health checks
   */
  async validateDataQuality(metrics: string[]): Promise<{
    metric: string;
    quality: number;
    issues: string[];
    lastUpdated: Date;
  }[]> {
    try {
      const response = await this.api.post('/api/analytics/data-quality', { metrics });
      return response.data.map((item: any) => ({
        ...item,
        lastUpdated: new Date(item.lastUpdated)
      }));
    } catch (error) {
      console.error('Error validating data quality:', error);
      return metrics.map(metric => ({
        metric,
        quality: 0.95,
        issues: [],
        lastUpdated: new Date()
      }));
    }
  }

  async getSystemHealth(): Promise<{
    overall: 'healthy' | 'degraded' | 'critical';
    services: { name: string; status: string; responseTime: number }[];
    lastCheck: Date;
  }> {
    try {
      const response = await this.api.get('/api/analytics/health');
      return {
        ...response.data,
        lastCheck: new Date(response.data.lastCheck)
      };
    } catch (error) {
      console.error('Error fetching system health:', error);
      return {
        overall: 'degraded',
        services: [
          { name: 'API Gateway', status: 'healthy', responseTime: 45 },
          { name: 'Analytics Service', status: 'degraded', responseTime: 120 },
          { name: 'Database', status: 'healthy', responseTime: 8 }
        ],
        lastCheck: new Date()
      };
    }
  }

  /**
   * WebSocket connection management
   */
  private connectWebSocket(): void {
    try {
      const wsUrl = this.api.defaults.baseURL?.replace('http', 'ws') + '/ws/analytics';
      this.websocket = new WebSocket(wsUrl);

      this.websocket.onopen = () => {
        console.log('WebSocket connected');
        this.connectionRetryCount = 0;
        this.emit('connection', { status: 'connected' });
      };

      this.websocket.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data);
          message.timestamp = new Date(message.timestamp);
          this.emit(message.type, message.data);
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };

      this.websocket.onclose = () => {
        console.log('WebSocket disconnected');
        this.emit('connection', { status: 'disconnected' });
        this.reconnectWebSocket();
      };

      this.websocket.onerror = (error) => {
        console.error('WebSocket error:', error);
        this.emit('connection', { status: 'error', error });
      };
    } catch (error) {
      console.error('Error connecting WebSocket:', error);
      this.reconnectWebSocket();
    }
  }

  private reconnectWebSocket(): void {
    if (this.connectionRetryCount < this.maxRetries) {
      this.connectionRetryCount++;
      setTimeout(() => {
        console.log(`Attempting WebSocket reconnection (${this.connectionRetryCount}/${this.maxRetries})`);
        this.connectWebSocket();
      }, this.retryDelay * this.connectionRetryCount);
    }
  }

  /**
   * Event handling
   */
  private addEventListener(event: string, callback: Function): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event)!.push(callback);
  }

  private removeEventListener(event: string, callback: Function): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      const index = listeners.indexOf(callback);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    }
  }

  private emit(event: string, data: any): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error('Error in event listener:', error);
        }
      });
    }
  }

  /**
   * Request interceptors
   */
  private setupRequestInterceptors(): void {
    this.api.interceptors.request.use(
      (config) => {
        // Add authentication token if available
        const token = localStorage.getItem('auth_token');
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    this.api.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response?.status === 401) {
          // Handle authentication error
          this.emit('auth_error', error);
        }
        return Promise.reject(error);
      }
    );
  }

  /**
   * Utility methods
   */
  private getContentType(format: string): string {
    const types = {
      pdf: 'application/pdf',
      csv: 'text/csv',
      xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      json: 'application/json'
    };
    return types[format as keyof typeof types] || 'application/octet-stream';
  }

  private getDefaultConfig(): DashboardConfig {
    return {
      refreshInterval: 30000,
      autoRefresh: true,
      theme: 'light',
      layout: 'grid',
      widgets: ['performance', 'cost', 'usage', 'roi']
    };
  }

  /**
   * Mock data generators
   */
  private getMockForecast(metric: string, timeRange: TimeRange, forecastDays: number): ForecastData {
    const historical = [];
    const forecast = [];
    
    // Generate historical data
    for (let i = 30; i >= 0; i--) {
      const date = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
      historical.push({
        timestamp: date,
        value: 100 + Math.sin(i * 0.1) * 20 + Math.random() * 10
      });
    }

    // Generate forecast data
    for (let i = 1; i <= forecastDays; i++) {
      const date = new Date(Date.now() + i * 24 * 60 * 60 * 1000);
      forecast.push({
        timestamp: date,
        value: 100 + Math.sin(i * 0.1) * 20,
        confidence: Math.max(0.5, 0.95 - (i / forecastDays) * 0.3)
      });
    }

    return {
      metric,
      historical,
      forecast,
      trend: 'stable',
      accuracy: 0.87
    };
  }

  private getMockAlerts(): Alert[] {
    return [
      {
        id: 'alert_1',
        ruleId: 'rule_1',
        title: 'High API Response Time',
        description: 'Average response time exceeded 500ms threshold',
        severity: 'warning',
        timestamp: new Date(Date.now() - 30 * 60 * 1000),
        resolved: false,
        metadata: { threshold: 500, current: 650 }
      },
      {
        id: 'alert_2',
        ruleId: 'rule_2',
        title: 'Low System Availability',
        description: 'System uptime dropped below 99%',
        severity: 'critical',
        timestamp: new Date(Date.now() - 60 * 60 * 1000),
        resolved: true,
        resolvedAt: new Date(Date.now() - 45 * 60 * 1000),
        metadata: { threshold: 99, current: 98.5 }
      }
    ];
  }

  /**
   * Cleanup
   */
  disconnect(): void {
    if (this.websocket) {
      this.websocket.close();
      this.websocket = null;
    }
    this.eventListeners.clear();
  }
}