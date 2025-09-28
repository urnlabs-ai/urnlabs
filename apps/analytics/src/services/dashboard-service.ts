import { Redis } from 'ioredis';
import { PrismaClient } from '@prisma/client';
import { ChartJSNodeCanvas } from 'chartjs-node-canvas';
import { 
  DashboardWidget, 
  WidgetType, 
  WidgetConfig,
  TimeSeriesData,
  MetricQuery
} from '../types/metrics.js';
import { Logger } from '../utils/logger.js';
import { MetricsCollector } from './metrics-collector.js';

export interface DashboardLayout {
  id: string;
  name: string;
  description: string;
  widgets: DashboardWidget[];
  created_by: string;
  is_public: boolean;
  tags: string[];
}

export interface ChartData {
  type: string;
  data: any;
  options: any;
}

export class DashboardService {
  private redis: Redis;
  private prisma: PrismaClient;
  private logger: Logger;
  private metricsCollector: MetricsCollector;
  private chartRenderer: ChartJSNodeCanvas;

  constructor(
    redis: Redis,
    prisma: PrismaClient,
    logger: Logger,
    metricsCollector: MetricsCollector
  ) {
    this.redis = redis;
    this.prisma = prisma;
    this.logger = logger;
    this.metricsCollector = metricsCollector;
    
    // Initialize chart renderer
    this.chartRenderer = new ChartJSNodeCanvas({
      width: 800,
      height: 400,
      backgroundColour: 'white'
    });
  }

  /**
   * Create a new dashboard widget
   */
  async createWidget(widget: Omit<DashboardWidget, 'id'>): Promise<DashboardWidget> {
    const fullWidget: DashboardWidget = {
      id: this.generateWidgetId(),
      ...widget
    };

    // Store widget configuration
    await this.redis.hset(
      'dashboard:widgets',
      fullWidget.id,
      JSON.stringify(fullWidget)
    );

    // Cache initial data
    await this.refreshWidgetData(fullWidget.id);

    this.logger.info('Dashboard widget created', {
      widget_id: fullWidget.id,
      type: fullWidget.type,
      title: fullWidget.title
    });

    return fullWidget;
  }

  /**
   * Get dashboard widget by ID
   */
  async getWidget(widgetId: string): Promise<DashboardWidget | null> {
    const widgetData = await this.redis.hget('dashboard:widgets', widgetId);
    
    if (!widgetData) {
      return null;
    }

    return JSON.parse(widgetData);
  }

  /**
   * Update dashboard widget
   */
  async updateWidget(
    widgetId: string, 
    updates: Partial<DashboardWidget>
  ): Promise<DashboardWidget | null> {
    const existingWidget = await this.getWidget(widgetId);
    
    if (!existingWidget) {
      return null;
    }

    const updatedWidget = { ...existingWidget, ...updates };
    
    await this.redis.hset(
      'dashboard:widgets',
      widgetId,
      JSON.stringify(updatedWidget)
    );

    // Refresh data if config changed
    if (updates.config || updates.data_source) {
      await this.refreshWidgetData(widgetId);
    }

    this.logger.info('Dashboard widget updated', { widget_id: widgetId });
    
    return updatedWidget;
  }

  /**
   * Delete dashboard widget
   */
  async deleteWidget(widgetId: string): Promise<boolean> {
    const result = await this.redis.hdel('dashboard:widgets', widgetId);
    
    // Clean up cached data
    await this.redis.del(`widget:data:${widgetId}`);
    
    this.logger.info('Dashboard widget deleted', { widget_id: widgetId });
    
    return result > 0;
  }

  /**
   * Get widget data for rendering
   */
  async getWidgetData(widgetId: string): Promise<any> {
    // Check cache first
    const cachedData = await this.redis.get(`widget:data:${widgetId}`);
    
    if (cachedData) {
      return JSON.parse(cachedData);
    }

    // Generate fresh data
    return await this.refreshWidgetData(widgetId);
  }

  /**
   * Refresh widget data from data source
   */
  async refreshWidgetData(widgetId: string): Promise<any> {
    const widget = await this.getWidget(widgetId);
    
    if (!widget) {
      throw new Error(`Widget ${widgetId} not found`);
    }

    try {
      const data = await this.generateWidgetData(widget);
      
      // Cache data with TTL based on refresh interval
      await this.redis.setex(
        `widget:data:${widgetId}`,
        widget.refresh_interval_seconds,
        JSON.stringify(data)
      );

      return data;
    } catch (error) {
      this.logger.error('Failed to refresh widget data', {
        widget_id: widgetId,
        error
      });
      throw error;
    }
  }

  /**
   * Generate widget data based on type and configuration
   */
  private async generateWidgetData(widget: DashboardWidget): Promise<any> {
    switch (widget.type) {
      case WidgetType.LINE_CHART:
        return await this.generateLineChartData(widget);
      
      case WidgetType.BAR_CHART:
        return await this.generateBarChartData(widget);
      
      case WidgetType.PIE_CHART:
        return await this.generatePieChartData(widget);
      
      case WidgetType.GAUGE:
        return await this.generateGaugeData(widget);
      
      case WidgetType.COUNTER:
        return await this.generateCounterData(widget);
      
      case WidgetType.TABLE:
        return await this.generateTableData(widget);
      
      case WidgetType.HEATMAP:
        return await this.generateHeatmapData(widget);
      
      default:
        throw new Error(`Unsupported widget type: ${widget.type}`);
    }
  }

  /**
   * Generate line chart data
   */
  private async generateLineChartData(widget: DashboardWidget): Promise<ChartData> {
    const query = this.parseQuery(widget.config);
    const result = await this.metricsCollector.queryMetrics(query);

    const labels = result.data.map(point => 
      point.timestamp.toISOString().substr(0, 16).replace('T', ' ')
    );
    const values = result.data.map(point => point.value);

    return {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: widget.title,
          data: values,
          borderColor: '#3B82F6',
          backgroundColor: 'rgba(59, 130, 246, 0.1)',
          tension: 0.4
        }]
      },
      options: {
        responsive: true,
        plugins: {
          title: {
            display: true,
            text: widget.title
          }
        },
        scales: {
          y: {
            beginAtZero: true
          }
        }
      }
    };
  }

  /**
   * Generate bar chart data
   */
  private async generateBarChartData(widget: DashboardWidget): Promise<ChartData> {
    const query = this.parseQuery(widget.config);
    const result = await this.metricsCollector.queryMetrics(query);

    // Group data if grouping is specified
    const groupedData = this.groupData(result.data, widget.config.grouping);
    
    const labels = Object.keys(groupedData);
    const values = Object.values(groupedData);

    return {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: widget.title,
          data: values,
          backgroundColor: [
            '#3B82F6', '#EF4444', '#10B981', '#F59E0B',
            '#8B5CF6', '#06B6D4', '#84CC16', '#F97316'
          ]
        }]
      },
      options: {
        responsive: true,
        plugins: {
          title: {
            display: true,
            text: widget.title
          }
        },
        scales: {
          y: {
            beginAtZero: true
          }
        }
      }
    };
  }

  /**
   * Generate pie chart data
   */
  private async generatePieChartData(widget: DashboardWidget): Promise<ChartData> {
    const query = this.parseQuery(widget.config);
    const result = await this.metricsCollector.queryMetrics(query);

    const groupedData = this.groupData(result.data, widget.config.grouping);
    
    const labels = Object.keys(groupedData);
    const values = Object.values(groupedData);

    return {
      type: 'pie',
      data: {
        labels,
        datasets: [{
          data: values,
          backgroundColor: [
            '#3B82F6', '#EF4444', '#10B981', '#F59E0B',
            '#8B5CF6', '#06B6D4', '#84CC16', '#F97316'
          ]
        }]
      },
      options: {
        responsive: true,
        plugins: {
          title: {
            display: true,
            text: widget.title
          },
          legend: {
            position: 'bottom'
          }
        }
      }
    };
  }

  /**
   * Generate gauge data
   */
  private async generateGaugeData(widget: DashboardWidget): Promise<any> {
    const query = this.parseQuery(widget.config);
    const result = await this.metricsCollector.queryMetrics(query);

    const value = result.data.length > 0 ? 
      result.data[result.data.length - 1].value : 0;

    const maxValue = widget.config.visualization_options?.max_value || 100;
    const minValue = widget.config.visualization_options?.min_value || 0;

    return {
      type: 'gauge',
      value,
      min: minValue,
      max: maxValue,
      title: widget.title,
      unit: widget.config.visualization_options?.unit || '',
      thresholds: widget.config.visualization_options?.thresholds || [
        { value: maxValue * 0.6, color: '#10B981' },
        { value: maxValue * 0.8, color: '#F59E0B' },
        { value: maxValue, color: '#EF4444' }
      ]
    };
  }

  /**
   * Generate counter data
   */
  private async generateCounterData(widget: DashboardWidget): Promise<any> {
    const query = this.parseQuery(widget.config);
    const result = await this.metricsCollector.queryMetrics(query);

    const currentValue = result.data.length > 0 ? 
      result.data.reduce((sum, point) => sum + point.value, 0) : 0;

    // Calculate previous period for comparison
    const previousQuery = { ...query };
    const periodLength = query.time_range.end.getTime() - query.time_range.start.getTime();
    previousQuery.time_range.start = new Date(query.time_range.start.getTime() - periodLength);
    previousQuery.time_range.end = query.time_range.start;

    const previousResult = await this.metricsCollector.queryMetrics(previousQuery);
    const previousValue = previousResult.data.length > 0 ? 
      previousResult.data.reduce((sum, point) => sum + point.value, 0) : 0;

    const change = previousValue > 0 ? 
      ((currentValue - previousValue) / previousValue) * 100 : 0;

    return {
      type: 'counter',
      value: currentValue,
      previous_value: previousValue,
      change_percent: change,
      title: widget.title,
      unit: widget.config.visualization_options?.unit || '',
      format: widget.config.visualization_options?.format || 'number'
    };
  }

  /**
   * Generate table data
   */
  private async generateTableData(widget: DashboardWidget): Promise<any> {
    const query = this.parseQuery(widget.config);
    const result = await this.metricsCollector.queryMetrics(query);

    const columns = widget.config.visualization_options?.columns || [
      { key: 'timestamp', label: 'Time', type: 'datetime' },
      { key: 'value', label: 'Value', type: 'number' }
    ];

    const rows = result.data.map(point => ({
      timestamp: point.timestamp,
      value: point.value,
      ...point.metadata
    }));

    return {
      type: 'table',
      columns,
      rows,
      title: widget.title,
      total_rows: rows.length
    };
  }

  /**
   * Generate heatmap data
   */
  private async generateHeatmapData(widget: DashboardWidget): Promise<any> {
    const query = this.parseQuery(widget.config);
    const result = await this.metricsCollector.queryMetrics(query);

    // Process data into heatmap format
    const heatmapData = this.processHeatmapData(result.data, widget.config);

    return {
      type: 'heatmap',
      data: heatmapData,
      title: widget.title,
      config: widget.config.visualization_options || {}
    };
  }

  /**
   * Render widget as image
   */
  async renderWidgetImage(widgetId: string): Promise<Buffer> {
    const widget = await this.getWidget(widgetId);
    
    if (!widget) {
      throw new Error(`Widget ${widgetId} not found`);
    }

    const data = await this.getWidgetData(widgetId);

    if (data.type === 'line' || data.type === 'bar' || data.type === 'pie') {
      return await this.chartRenderer.renderToBuffer(data);
    } else {
      // For non-chart widgets, generate a simple visualization
      return await this.renderCustomWidget(widget, data);
    }
  }

  /**
   * Get all widgets for a dashboard
   */
  async getDashboardWidgets(dashboardId: string): Promise<DashboardWidget[]> {
    const widgetIds = await this.redis.lrange(`dashboard:${dashboardId}:widgets`, 0, -1);
    const widgets: DashboardWidget[] = [];

    for (const widgetId of widgetIds) {
      const widget = await this.getWidget(widgetId);
      if (widget) {
        widgets.push(widget);
      }
    }

    return widgets;
  }

  /**
   * Create dashboard layout
   */
  async createDashboard(layout: Omit<DashboardLayout, 'id'>): Promise<DashboardLayout> {
    const dashboard: DashboardLayout = {
      id: this.generateDashboardId(),
      ...layout
    };

    // Store dashboard configuration
    await this.redis.hset(
      'dashboards',
      dashboard.id,
      JSON.stringify(dashboard)
    );

    // Store widget references
    const widgetIds = dashboard.widgets.map(w => w.id);
    await this.redis.lpush(`dashboard:${dashboard.id}:widgets`, ...widgetIds);

    this.logger.info('Dashboard created', {
      dashboard_id: dashboard.id,
      widget_count: dashboard.widgets.length
    });

    return dashboard;
  }

  /**
   * Helper methods
   */
  private parseQuery(config: WidgetConfig): MetricQuery {
    const timeRange = this.parseTimeRange(config.time_range);
    
    return {
      metric_name: config.query,
      time_range: timeRange,
      filters: config.filters,
      aggregation: config.aggregation ? {
        function: config.aggregation as any,
        interval: '5m'
      } : undefined,
      group_by: config.grouping
    };
  }

  private parseTimeRange(timeRange: string): { start: Date; end: Date } {
    const now = new Date();
    const end = new Date(now);
    let start: Date;

    switch (timeRange) {
      case '1h':
        start = new Date(now.getTime() - 60 * 60 * 1000);
        break;
      case '24h':
        start = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case '7d':
        start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      default:
        start = new Date(now.getTime() - 60 * 60 * 1000); // Default to 1 hour
    }

    return { start, end };
  }

  private groupData(data: TimeSeriesData[], groupBy?: string[]): Record<string, number> {
    if (!groupBy || groupBy.length === 0) {
      return { 'Total': data.reduce((sum, point) => sum + point.value, 0) };
    }

    const grouped: Record<string, number> = {};
    
    for (const point of data) {
      const key = groupBy.map(field => 
        point.metadata?.[field] || 'Unknown'
      ).join(' - ');
      
      grouped[key] = (grouped[key] || 0) + point.value;
    }

    return grouped;
  }

  private processHeatmapData(data: TimeSeriesData[], config: WidgetConfig): any[][] {
    // Simplified heatmap processing - would be more sophisticated in production
    const matrix: any[][] = [];
    
    // Group data by hour and day for a weekly heatmap
    const hourly: Record<string, Record<string, number>> = {};
    
    for (const point of data) {
      const day = point.timestamp.toDateString();
      const hour = point.timestamp.getHours().toString();
      
      if (!hourly[day]) hourly[day] = {};
      hourly[day][hour] = (hourly[day][hour] || 0) + point.value;
    }

    // Convert to matrix format
    for (const [day, hours] of Object.entries(hourly)) {
      const row = [];
      for (let h = 0; h < 24; h++) {
        row.push(hours[h.toString()] || 0);
      }
      matrix.push([day, ...row]);
    }

    return matrix;
  }

  private async renderCustomWidget(widget: DashboardWidget, data: any): Promise<Buffer> {
    // This would render custom widgets like gauges, counters, etc.
    // For now, return a placeholder
    return Buffer.from('Custom widget rendering not implemented');
  }

  private generateWidgetId(): string {
    return `widget_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateDashboardId(): string {
    return `dashboard_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}