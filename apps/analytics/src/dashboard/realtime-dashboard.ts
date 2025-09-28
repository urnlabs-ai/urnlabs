import { EventEmitter } from 'events';
import { WebSocketServer, WebSocket } from 'ws';
import { Redis } from 'ioredis';
import { Logger } from '../utils/logger.js';
import { ClickHouseService } from '../streaming/clickhouse-service.js';
import { KafkaProducerService } from '../streaming/kafka-producer.js';

export interface DashboardWidget {
  id: string;
  type: 'chart' | 'metric' | 'table' | 'gauge' | 'map' | 'heatmap';
  title: string;
  description?: string;
  query: string;
  refreshInterval: number; // seconds
  visualization: {
    chartType?: 'line' | 'bar' | 'pie' | 'area' | 'scatter';
    xAxis?: string;
    yAxis?: string;
    groupBy?: string;
    colors?: string[];
    thresholds?: { warning: number; critical: number };
  };
  filters?: Record<string, any>;
  timeRange: { start: Date; end: Date; } | { relative: string }; // e.g., { relative: '1h' }
}

export interface DashboardConfig {
  id: string;
  name: string;
  description?: string;
  widgets: DashboardWidget[];
  layout: Array<{ widgetId: string; x: number; y: number; width: number; height: number }>;
  refreshInterval: number; // global refresh interval in seconds
  permissions: {
    view: string[];
    edit: string[];
  };
}

export interface RealTimeMetrics {
  timestamp: Date;
  performance: {
    avg_response_time: number;
    requests_per_second: number;
    error_rate: number;
    active_users: number;
  };
  agents: {
    active_agents: number;
    success_rate: number;
    avg_execution_time: number;
    total_cost_today: number;
  };
  infrastructure: {
    cpu_usage: number;
    memory_usage: number;
    disk_usage: number;
    network_throughput: number;
  };
  business: {
    revenue_today: number;
    cost_savings_today: number;
    automation_rate: number;
    user_satisfaction: number;
  };
}

export class RealTimeDashboardService extends EventEmitter {
  private wss: WebSocketServer | null = null;
  private clients: Map<string, WebSocket> = new Map();
  private dashboards: Map<string, DashboardConfig> = new Map();
  private widgetRefreshTimers: Map<string, NodeJS.Timeout> = new Map();
  private redis: Redis;
  private clickHouse: ClickHouseService;
  private kafkaProducer: KafkaProducerService;
  private logger: Logger;
  private metricsUpdateInterval: NodeJS.Timeout;

  constructor(
    redis: Redis,
    clickHouse: ClickHouseService,
    kafkaProducer: KafkaProducerService,
    logger: Logger
  ) {
    super();
    this.redis = redis;
    this.clickHouse = clickHouse;
    this.kafkaProducer = kafkaProducer;
    this.logger = logger;

    // Update real-time metrics every 5 seconds
    this.metricsUpdateInterval = setInterval(() => {
      this.updateRealTimeMetrics().catch(error => {
        this.logger.error('Failed to update real-time metrics', { error });
      });
    }, 5000);

    this.loadDashboardConfigs();
  }

  /**
   * Initialize WebSocket server
   */
  initializeWebSocketServer(port: number = 8080): void {
    this.wss = new WebSocketServer({ port });

    this.wss.on('connection', (ws, request) => {
      const clientId = this.generateClientId();
      this.clients.set(clientId, ws);

      this.logger.info('Dashboard client connected', { 
        clientId, 
        clientCount: this.clients.size,
        userAgent: request.headers['user-agent']
      });

      ws.on('message', (data) => {
        this.handleClientMessage(clientId, data.toString()).catch(error => {
          this.logger.error('Failed to handle client message', { error, clientId });
        });
      });

      ws.on('close', () => {
        this.clients.delete(clientId);
        this.logger.info('Dashboard client disconnected', { 
          clientId, 
          clientCount: this.clients.size 
        });
      });

      ws.on('error', (error) => {
        this.logger.error('WebSocket client error', { error, clientId });
        this.clients.delete(clientId);
      });

      // Send initial dashboard list
      this.sendToClient(clientId, {
        type: 'dashboard_list',
        dashboards: Array.from(this.dashboards.values()).map(d => ({
          id: d.id,
          name: d.name,
          description: d.description
        }))
      });
    });

    this.logger.info('Real-time dashboard WebSocket server started', { port });
  }

  /**
   * Handle client messages
   */
  private async handleClientMessage(clientId: string, message: string): Promise<void> {
    try {
      const data = JSON.parse(message);

      switch (data.type) {
        case 'subscribe_dashboard':
          await this.subscribeDashboard(clientId, data.dashboardId);
          break;

        case 'unsubscribe_dashboard':
          await this.unsubscribeDashboard(clientId, data.dashboardId);
          break;

        case 'update_widget':
          await this.updateWidget(data.dashboardId, data.widget);
          break;

        case 'create_dashboard':
          await this.createDashboard(data.dashboard);
          break;

        case 'delete_dashboard':
          await this.deleteDashboard(data.dashboardId);
          break;

        case 'refresh_widget':
          await this.refreshWidget(data.dashboardId, data.widgetId);
          break;

        default:
          this.logger.warn('Unknown message type', { type: data.type, clientId });
      }
    } catch (error) {
      this.logger.error('Failed to parse client message', { error, message, clientId });
    }
  }

  /**
   * Subscribe client to dashboard updates
   */
  private async subscribeDashboard(clientId: string, dashboardId: string): Promise<void> {
    const dashboard = this.dashboards.get(dashboardId);
    if (!dashboard) {
      this.sendToClient(clientId, {
        type: 'error',
        message: `Dashboard ${dashboardId} not found`
      });
      return;
    }

    // Send dashboard configuration
    this.sendToClient(clientId, {
      type: 'dashboard_config',
      dashboard
    });

    // Start widget refresh timers for this dashboard
    for (const widget of dashboard.widgets) {
      const timerId = `${dashboardId}:${widget.id}`;
      
      if (!this.widgetRefreshTimers.has(timerId)) {
        const timer = setInterval(async () => {
          await this.refreshWidget(dashboardId, widget.id);
        }, widget.refreshInterval * 1000);
        
        this.widgetRefreshTimers.set(timerId, timer);
      }
    }

    // Send initial widget data
    for (const widget of dashboard.widgets) {
      await this.refreshWidget(dashboardId, widget.id);
    }

    this.logger.info('Client subscribed to dashboard', { clientId, dashboardId });
  }

  /**
   * Unsubscribe client from dashboard updates
   */
  private async unsubscribeDashboard(clientId: string, dashboardId: string): Promise<void> {
    // Stop widget refresh timers if no clients are subscribed
    const dashboard = this.dashboards.get(dashboardId);
    if (dashboard) {
      for (const widget of dashboard.widgets) {
        const timerId = `${dashboardId}:${widget.id}`;
        const timer = this.widgetRefreshTimers.get(timerId);
        
        if (timer) {
          clearInterval(timer);
          this.widgetRefreshTimers.delete(timerId);
        }
      }
    }

    this.logger.info('Client unsubscribed from dashboard', { clientId, dashboardId });
  }

  /**
   * Refresh widget data
   */
  private async refreshWidget(dashboardId: string, widgetId: string): Promise<void> {
    const dashboard = this.dashboards.get(dashboardId);
    if (!dashboard) return;

    const widget = dashboard.widgets.find(w => w.id === widgetId);
    if (!widget) return;

    try {
      // Execute widget query
      const timeRange = this.resolveTimeRange(widget.timeRange);
      const data = await this.executeWidgetQuery(widget, timeRange);

      // Broadcast widget update to all connected clients
      this.broadcast({
        type: 'widget_update',
        dashboardId,
        widgetId,
        data,
        timestamp: new Date()
      });

      this.logger.debug('Widget refreshed', { dashboardId, widgetId, dataPoints: data.length });
    } catch (error) {
      this.logger.error('Failed to refresh widget', { error, dashboardId, widgetId });
      
      this.broadcast({
        type: 'widget_error',
        dashboardId,
        widgetId,
        error: error.message,
        timestamp: new Date()
      });
    }
  }

  /**
   * Execute widget query against ClickHouse
   */
  private async executeWidgetQuery(widget: DashboardWidget, timeRange: { start: Date; end: Date }): Promise<any[]> {
    let query = widget.query;

    // Replace time range placeholders
    query = query.replace('{START_TIME}', `'${timeRange.start.toISOString()}'`);
    query = query.replace('{END_TIME}', `'${timeRange.end.toISOString()}'`);

    // Add filters if specified
    if (widget.filters && Object.keys(widget.filters).length > 0) {
      const filterConditions = Object.entries(widget.filters)
        .map(([field, value]) => {
          if (Array.isArray(value)) {
            return `${field} IN (${value.map(v => `'${v}'`).join(', ')})`;
          }
          return `${field} = '${value}'`;
        })
        .join(' AND ');

      if (query.toLowerCase().includes('where')) {
        query += ` AND ${filterConditions}`;
      } else {
        query += ` WHERE ${filterConditions}`;
      }
    }

    return await this.clickHouse.query(query);
  }

  /**
   * Resolve time range from relative or absolute values
   */
  private resolveTimeRange(timeRange: DashboardWidget['timeRange']): { start: Date; end: Date } {
    if ('relative' in timeRange) {
      const now = new Date();
      const match = timeRange.relative.match(/^(\d+)([smhd])$/);
      
      if (!match) {
        throw new Error(`Invalid relative time range: ${timeRange.relative}`);
      }

      const value = parseInt(match[1]);
      const unit = match[2];
      
      let milliseconds = 0;
      switch (unit) {
        case 's': milliseconds = value * 1000; break;
        case 'm': milliseconds = value * 60 * 1000; break;
        case 'h': milliseconds = value * 60 * 60 * 1000; break;
        case 'd': milliseconds = value * 24 * 60 * 60 * 1000; break;
      }

      return {
        start: new Date(now.getTime() - milliseconds),
        end: now
      };
    }

    return timeRange;
  }

  /**
   * Update real-time metrics
   */
  private async updateRealTimeMetrics(): Promise<void> {
    try {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - (60 * 60 * 1000));
      const oneDayAgo = new Date(now.getTime() - (24 * 60 * 60 * 1000));

      const [
        performanceMetrics,
        agentMetrics,
        infraMetrics,
        businessMetrics
      ] = await Promise.all([
        // Performance metrics (last hour)
        this.clickHouse.aggregateQuery({
          table: 'api_requests',
          groupBy: [],
          aggregations: {
            avg_response_time: 'avg(response_time_ms)',
            requests_per_second: 'count() / 3600',
            error_rate: 'countIf(status_code >= 400) / count() * 100',
            active_users: 'uniq(user_id)'
          },
          timeRange: { start: oneHourAgo, end: now }
        }),

        // Agent metrics (last hour)
        this.clickHouse.aggregateQuery({
          table: 'agent_metrics',
          groupBy: [],
          aggregations: {
            active_agents: 'uniq(agent_id)',
            success_rate: 'avg(success) * 100',
            avg_execution_time: 'avg(execution_time_ms)',
            total_cost_today: 'sum(cost_cents) / 100'
          },
          timeRange: { start: oneHourAgo, end: now }
        }),

        // Infrastructure metrics (last 5 minutes)
        this.clickHouse.aggregateQuery({
          table: 'resource_utilization',
          groupBy: [],
          aggregations: {
            cpu_usage: 'avg(cpu_percent)',
            memory_usage: 'avg(memory_percent)',
            disk_usage: 'avg(disk_percent)',
            network_throughput: 'avg(network_in_bytes + network_out_bytes)'
          },
          timeRange: { start: new Date(now.getTime() - (5 * 60 * 1000)), end: now }
        }),

        // Business metrics (today)
        this.clickHouse.aggregateQuery({
          table: 'business_metrics',
          groupBy: [],
          aggregations: {
            revenue_today: 'sum(revenue_impact_cents) / 100',
            cost_savings_today: 'sum(cost_savings_cents) / 100',
            automation_rate: 'avg(value)',
            user_satisfaction: 'avg(value)'
          },
          timeRange: { start: oneDayAgo, end: now },
          filters: { metric_name: ['daily_revenue', 'cost_savings', 'automation_rate', 'user_satisfaction'] }
        })
      ]);

      const metrics: RealTimeMetrics = {
        timestamp: now,
        performance: {
          avg_response_time: performanceMetrics[0]?.avg_response_time || 0,
          requests_per_second: performanceMetrics[0]?.requests_per_second || 0,
          error_rate: performanceMetrics[0]?.error_rate || 0,
          active_users: performanceMetrics[0]?.active_users || 0
        },
        agents: {
          active_agents: agentMetrics[0]?.active_agents || 0,
          success_rate: agentMetrics[0]?.success_rate || 0,
          avg_execution_time: agentMetrics[0]?.avg_execution_time || 0,
          total_cost_today: agentMetrics[0]?.total_cost_today || 0
        },
        infrastructure: {
          cpu_usage: infraMetrics[0]?.cpu_usage || 0,
          memory_usage: infraMetrics[0]?.memory_usage || 0,
          disk_usage: infraMetrics[0]?.disk_usage || 0,
          network_throughput: infraMetrics[0]?.network_throughput || 0
        },
        business: {
          revenue_today: businessMetrics[0]?.revenue_today || 0,
          cost_savings_today: businessMetrics[0]?.cost_savings_today || 0,
          automation_rate: businessMetrics[0]?.automation_rate || 0,
          user_satisfaction: businessMetrics[0]?.user_satisfaction || 0
        }
      };

      // Cache metrics in Redis
      await this.redis.setex(
        'realtime_metrics',
        60, // 1 minute TTL
        JSON.stringify(metrics)
      );

      // Broadcast to all connected clients
      this.broadcast({
        type: 'realtime_metrics',
        metrics
      });

    } catch (error) {
      this.logger.error('Failed to update real-time metrics', { error });
    }
  }

  /**
   * Create a new dashboard
   */
  async createDashboard(dashboard: DashboardConfig): Promise<void> {
    this.dashboards.set(dashboard.id, dashboard);
    await this.saveDashboardConfig(dashboard);
    
    this.broadcast({
      type: 'dashboard_created',
      dashboard: {
        id: dashboard.id,
        name: dashboard.name,
        description: dashboard.description
      }
    });

    this.logger.info('Dashboard created', { dashboardId: dashboard.id, name: dashboard.name });
  }

  /**
   * Update widget configuration
   */
  async updateWidget(dashboardId: string, widget: DashboardWidget): Promise<void> {
    const dashboard = this.dashboards.get(dashboardId);
    if (!dashboard) return;

    const widgetIndex = dashboard.widgets.findIndex(w => w.id === widget.id);
    if (widgetIndex >= 0) {
      dashboard.widgets[widgetIndex] = widget;
    } else {
      dashboard.widgets.push(widget);
    }

    await this.saveDashboardConfig(dashboard);
    
    this.broadcast({
      type: 'widget_updated',
      dashboardId,
      widget
    });

    this.logger.info('Widget updated', { dashboardId, widgetId: widget.id });
  }

  /**
   * Delete dashboard
   */
  async deleteDashboard(dashboardId: string): Promise<void> {
    const dashboard = this.dashboards.get(dashboardId);
    if (!dashboard) return;

    // Stop all widget timers
    for (const widget of dashboard.widgets) {
      const timerId = `${dashboardId}:${widget.id}`;
      const timer = this.widgetRefreshTimers.get(timerId);
      if (timer) {
        clearInterval(timer);
        this.widgetRefreshTimers.delete(timerId);
      }
    }

    this.dashboards.delete(dashboardId);
    await this.redis.del(`dashboard:${dashboardId}`);
    
    this.broadcast({
      type: 'dashboard_deleted',
      dashboardId
    });

    this.logger.info('Dashboard deleted', { dashboardId });
  }

  /**
   * Load dashboard configurations from Redis
   */
  private async loadDashboardConfigs(): Promise<void> {
    try {
      const keys = await this.redis.keys('dashboard:*');
      
      for (const key of keys) {
        const configData = await this.redis.get(key);
        if (configData) {
          const dashboard: DashboardConfig = JSON.parse(configData);
          this.dashboards.set(dashboard.id, dashboard);
        }
      }

      this.logger.info('Loaded dashboard configurations', { count: this.dashboards.size });
    } catch (error) {
      this.logger.error('Failed to load dashboard configurations', { error });
    }
  }

  /**
   * Save dashboard configuration to Redis
   */
  private async saveDashboardConfig(dashboard: DashboardConfig): Promise<void> {
    await this.redis.set(
      `dashboard:${dashboard.id}`,
      JSON.stringify(dashboard)
    );
  }

  /**
   * Send message to specific client
   */
  private sendToClient(clientId: string, message: any): void {
    const client = this.clients.get(clientId);
    if (client && client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(message));
    }
  }

  /**
   * Broadcast message to all connected clients
   */
  private broadcast(message: any): void {
    const messageStr = JSON.stringify(message);
    
    for (const [clientId, client] of this.clients.entries()) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(messageStr);
      } else {
        this.clients.delete(clientId);
      }
    }
  }

  /**
   * Generate unique client ID
   */
  private generateClientId(): string {
    return `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get dashboard statistics
   */
  getStats(): {
    connectedClients: number;
    activeDashboards: number;
    activeWidgets: number;
    activeTimers: number;
  } {
    return {
      connectedClients: this.clients.size,
      activeDashboards: this.dashboards.size,
      activeWidgets: Array.from(this.dashboards.values()).reduce((sum, d) => sum + d.widgets.length, 0),
      activeTimers: this.widgetRefreshTimers.size
    };
  }

  /**
   * Cleanup resources
   */
  async destroy(): Promise<void> {
    // Clear all timers
    for (const timer of this.widgetRefreshTimers.values()) {
      clearInterval(timer);
    }
    this.widgetRefreshTimers.clear();

    if (this.metricsUpdateInterval) {
      clearInterval(this.metricsUpdateInterval);
    }

    // Close WebSocket server
    if (this.wss) {
      this.wss.close();
    }

    // Close all client connections
    for (const client of this.clients.values()) {
      client.close();
    }
    this.clients.clear();

    this.logger.info('Real-time dashboard service destroyed');
  }
}