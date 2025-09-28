import { EventEmitter } from 'events';
import { z } from 'zod';
import { logger } from '../core/Logger.js';
import type { AgentMetrics, AgentConfig } from '../types/AgentTypes.js';
import type { PerformanceMetric } from './PerformanceOptimizer.js';
import type { AgentLoadState } from './LoadBalancer.js';
import type { ResourceUsage } from './ResourceAllocationEngine.js';

// Metrics collection schemas and types
export const MetricsCollectorConfigSchema = z.object({
  enabled: z.boolean().default(true),
  collectionInterval: z.number().min(1000).default(10000), // 10 seconds
  retentionPeriod: z.number().min(3600000).default(86400000), // 24 hours
  batchSize: z.number().min(1).default(100),
  enableSystemMetrics: z.boolean().default(true),
  enableApplicationMetrics: z.boolean().default(true),
  enableResourceMetrics: z.boolean().default(true),
  enableNetworkMetrics: z.boolean().default(true),
  alertingThresholds: z.object({
    cpuUsage: z.number().min(0).max(100).default(80),
    memoryUsage: z.number().min(0).max(100).default(85),
    diskUsage: z.number().min(0).max(100).default(90),
    responseTime: z.number().min(0).default(5000),
    errorRate: z.number().min(0).max(100).default(5)
  }),
  exportConfig: z.object({
    prometheus: z.object({
      enabled: z.boolean().default(true),
      port: z.number().min(1024).max(65535).default(9090),
      path: z.string().default('/metrics')
    }),
    influxdb: z.object({
      enabled: z.boolean().default(false),
      url: z.string().optional(),
      database: z.string().default('urnlabs_metrics'),
      token: z.string().optional()
    }),
    elasticsearch: z.object({
      enabled: z.boolean().default(false),
      url: z.string().optional(),
      index: z.string().default('urnlabs-metrics')
    })
  })
});

export const SystemMetricsSchema = z.object({
  timestamp: z.date(),
  cpu: z.object({
    usage: z.number().min(0).max(100),
    cores: z.number().min(1),
    loadAverage: z.array(z.number()).length(3),
    processes: z.number().min(0)
  }),
  memory: z.object({
    total: z.number().min(0),
    used: z.number().min(0),
    free: z.number().min(0),
    cached: z.number().min(0),
    usage: z.number().min(0).max(100)
  }),
  disk: z.object({
    total: z.number().min(0),
    used: z.number().min(0),
    free: z.number().min(0),
    usage: z.number().min(0).max(100),
    iops: z.number().min(0)
  }),
  network: z.object({
    bytesIn: z.number().min(0),
    bytesOut: z.number().min(0),
    packetsIn: z.number().min(0),
    packetsOut: z.number().min(0),
    connections: z.number().min(0)
  })
});

export const ApplicationMetricsSchema = z.object({
  timestamp: z.date(),
  agents: z.object({
    total: z.number().min(0),
    active: z.number().min(0),
    idle: z.number().min(0),
    failed: z.number().min(0)
  }),
  tasks: z.object({
    total: z.number().min(0),
    pending: z.number().min(0),
    processing: z.number().min(0),
    completed: z.number().min(0),
    failed: z.number().min(0),
    throughput: z.number().min(0)
  }),
  allocations: z.object({
    active: z.number().min(0),
    successRate: z.number().min(0).max(100),
    averageWaitTime: z.number().min(0),
    resourceUtilization: z.number().min(0).max(100)
  }),
  performance: z.object({
    averageResponseTime: z.number().min(0),
    p95ResponseTime: z.number().min(0),
    p99ResponseTime: z.number().min(0),
    errorRate: z.number().min(0).max(100),
    qualityScore: z.number().min(0).max(100)
  })
});

export const MetricsSummarySchema = z.object({
  timeRange: z.object({
    start: z.date(),
    end: z.date(),
    duration: z.number().min(0)
  }),
  system: z.object({
    avgCpuUsage: z.number().min(0).max(100),
    avgMemoryUsage: z.number().min(0).max(100),
    avgDiskUsage: z.number().min(0).max(100),
    peakValues: z.object({
      cpu: z.number().min(0).max(100),
      memory: z.number().min(0).max(100),
      disk: z.number().min(0).max(100)
    })
  }),
  application: z.object({
    totalTasks: z.number().min(0),
    taskThroughput: z.number().min(0),
    averageResponseTime: z.number().min(0),
    successRate: z.number().min(0).max(100),
    resourceEfficiency: z.number().min(0).max(100)
  }),
  trends: z.array(z.object({
    metric: z.string(),
    trend: z.enum(['increasing', 'decreasing', 'stable']),
    changeRate: z.number()
  }))
});

// Type exports
export type MetricsCollectorConfig = z.infer<typeof MetricsCollectorConfigSchema>;
export type SystemMetrics = z.infer<typeof SystemMetricsSchema>;
export type ApplicationMetrics = z.infer<typeof ApplicationMetricsSchema>;
export type MetricsSummary = z.infer<typeof MetricsSummarySchema>;

// Metrics aggregation interface
export interface MetricsAggregation {
  timeWindow: string;
  aggregationType: 'sum' | 'avg' | 'min' | 'max' | 'count';
  data: Record<string, number>;
}

// Alert interface
export interface MetricsAlert {
  id: string;
  timestamp: Date;
  severity: 'low' | 'medium' | 'high' | 'critical';
  metric: string;
  value: number;
  threshold: number;
  message: string;
  agentId?: string;
  resolved: boolean;
  resolvedAt?: Date;
}

/**
 * Resource Metrics Collector
 *
 * Comprehensive metrics collection system that gathers system, application,
 * and resource utilization metrics for the resource allocation engine.
 * Provides real-time monitoring, alerting, and metrics export capabilities.
 */
export class ResourceMetricsCollector extends EventEmitter {
  private readonly config: MetricsCollectorConfig;

  private systemMetrics: SystemMetrics[] = [];
  private applicationMetrics: ApplicationMetrics[] = [];
  private agentMetrics: Map<string, PerformanceMetric[]> = new Map();
  private alerts: Map<string, MetricsAlert> = new Map();

  private collectionTimer?: NodeJS.Timeout;
  private cleanupTimer?: NodeJS.Timeout;
  private exportTimer?: NodeJS.Timeout;

  private isRunning = false;
  private lastCollectionTime = 0;

  constructor(config: Partial<MetricsCollectorConfig> = {}) {
    super();

    this.config = MetricsCollectorConfigSchema.parse(config);
    this.setupEventHandlers();
  }

  /**
   * Initialize the metrics collector
   */
  async initialize(): Promise<void> {
    try {
      logger.info('Initializing Resource Metrics Collector...');

      if (this.config.enabled) {
        // Start metrics collection
        this.startMetricsCollection();

        // Start cleanup process
        this.startMetricsCleanup();

        // Start metrics export if enabled
        if (this.config.exportConfig.prometheus.enabled) {
          this.startPrometheusExport();
        }
      }

      this.isRunning = true;

      logger.info({
        config: {
          collectionInterval: this.config.collectionInterval,
          enableSystemMetrics: this.config.enableSystemMetrics,
          enableApplicationMetrics: this.config.enableApplicationMetrics,
          prometheusEnabled: this.config.exportConfig.prometheus.enabled
        }
      }, 'Resource Metrics Collector initialized successfully');

      this.emit('collector:initialized', {
        timestamp: new Date(),
        config: this.config
      });

    } catch (error) {
      logger.error({ error }, 'Failed to initialize Resource Metrics Collector');
      throw error;
    }
  }

  /**
   * Record agent performance metrics
   */
  async recordAgentMetrics(agentId: string, metrics: PerformanceMetric): Promise<void> {
    try {
      if (!this.agentMetrics.has(agentId)) {
        this.agentMetrics.set(agentId, []);
      }

      const agentMetricsList = this.agentMetrics.get(agentId)!;
      agentMetricsList.push(metrics);

      // Keep only recent metrics
      const maxMetrics = 1000;
      if (agentMetricsList.length > maxMetrics) {
        agentMetricsList.splice(0, agentMetricsList.length - maxMetrics);
      }

      // Check for performance alerts
      await this.checkPerformanceAlerts(agentId, metrics);

      this.emit('metrics:agent_updated', {
        agentId,
        metrics,
        timestamp: new Date()
      });

    } catch (error) {
      logger.error({
        error,
        agentId
      }, 'Failed to record agent metrics');
    }
  }

  /**
   * Record system metrics
   */
  async recordSystemMetrics(metrics: SystemMetrics): Promise<void> {
    try {
      this.systemMetrics.push(metrics);

      // Keep only recent metrics
      const maxMetrics = 8640; // 24 hours at 10-second intervals
      if (this.systemMetrics.length > maxMetrics) {
        this.systemMetrics.splice(0, this.systemMetrics.length - maxMetrics);
      }

      // Check for system alerts
      await this.checkSystemAlerts(metrics);

      this.emit('metrics:system_updated', {
        metrics,
        timestamp: new Date()
      });

    } catch (error) {
      logger.error({ error }, 'Failed to record system metrics');
    }
  }

  /**
   * Record application metrics
   */
  async recordApplicationMetrics(metrics: ApplicationMetrics): Promise<void> {
    try {
      this.applicationMetrics.push(metrics);

      // Keep only recent metrics
      const maxMetrics = 8640; // 24 hours at 10-second intervals
      if (this.applicationMetrics.length > maxMetrics) {
        this.applicationMetrics.splice(0, this.applicationMetrics.length - maxMetrics);
      }

      // Check for application alerts
      await this.checkApplicationAlerts(metrics);

      this.emit('metrics:application_updated', {
        metrics,
        timestamp: new Date()
      });

    } catch (error) {
      logger.error({ error }, 'Failed to record application metrics');
    }
  }

  /**
   * Get current system metrics
   */
  getCurrentSystemMetrics(): SystemMetrics | null {
    return this.systemMetrics.length > 0 ? this.systemMetrics[this.systemMetrics.length - 1] : null;
  }

  /**
   * Get current application metrics
   */
  getCurrentApplicationMetrics(): ApplicationMetrics | null {
    return this.applicationMetrics.length > 0 ? this.applicationMetrics[this.applicationMetrics.length - 1] : null;
  }

  /**
   * Get agent metrics for a specific agent
   */
  getAgentMetrics(agentId: string, limit = 100): PerformanceMetric[] {
    const metrics = this.agentMetrics.get(agentId) || [];
    return metrics.slice(-limit);
  }

  /**
   * Get metrics aggregation for a time window
   */
  getMetricsAggregation(
    metric: string,
    timeWindow: string,
    aggregationType: 'sum' | 'avg' | 'min' | 'max' | 'count' = 'avg'
  ): MetricsAggregation {
    const cutoffTime = this.parseTimeWindow(timeWindow);
    const data: Record<string, number> = {};

    // Aggregate system metrics
    if (metric.startsWith('system.')) {
      const systemMetricName = metric.replace('system.', '');
      const recentMetrics = this.systemMetrics.filter(m => m.timestamp.getTime() > cutoffTime);

      data[metric] = this.aggregateValues(
        recentMetrics.map(m => this.extractSystemMetricValue(m, systemMetricName)),
        aggregationType
      );
    }

    // Aggregate application metrics
    if (metric.startsWith('application.')) {
      const appMetricName = metric.replace('application.', '');
      const recentMetrics = this.applicationMetrics.filter(m => m.timestamp.getTime() > cutoffTime);

      data[metric] = this.aggregateValues(
        recentMetrics.map(m => this.extractApplicationMetricValue(m, appMetricName)),
        aggregationType
      );
    }

    // Aggregate agent metrics
    if (metric.startsWith('agent.')) {
      for (const [agentId, metrics] of this.agentMetrics) {
        const agentMetricName = metric.replace('agent.', '');
        const recentMetrics = metrics.filter(m => m.timestamp.getTime() > cutoffTime);

        data[`${metric}.${agentId}`] = this.aggregateValues(
          recentMetrics.map(m => this.extractAgentMetricValue(m, agentMetricName)),
          aggregationType
        );
      }
    }

    return {
      timeWindow,
      aggregationType,
      data
    };
  }

  /**
   * Get metrics summary for a time period
   */
  getMetricsSummary(timeWindow = '24h'): MetricsSummary {
    const cutoffTime = this.parseTimeWindow(timeWindow);
    const endTime = new Date();
    const startTime = new Date(cutoffTime);

    // System metrics summary
    const recentSystemMetrics = this.systemMetrics.filter(m => m.timestamp.getTime() > cutoffTime);
    const systemSummary = {
      avgCpuUsage: this.calculateAverage(recentSystemMetrics.map(m => m.cpu.usage)),
      avgMemoryUsage: this.calculateAverage(recentSystemMetrics.map(m => m.memory.usage)),
      avgDiskUsage: this.calculateAverage(recentSystemMetrics.map(m => m.disk.usage)),
      peakValues: {
        cpu: Math.max(...recentSystemMetrics.map(m => m.cpu.usage), 0),
        memory: Math.max(...recentSystemMetrics.map(m => m.memory.usage), 0),
        disk: Math.max(...recentSystemMetrics.map(m => m.disk.usage), 0)
      }
    };

    // Application metrics summary
    const recentAppMetrics = this.applicationMetrics.filter(m => m.timestamp.getTime() > cutoffTime);
    const applicationSummary = {
      totalTasks: this.sumValues(recentAppMetrics.map(m => m.tasks.total)),
      taskThroughput: this.calculateAverage(recentAppMetrics.map(m => m.tasks.throughput)),
      averageResponseTime: this.calculateAverage(recentAppMetrics.map(m => m.performance.averageResponseTime)),
      successRate: this.calculateAverage(recentAppMetrics.map(m => m.allocations.successRate)),
      resourceEfficiency: this.calculateAverage(recentAppMetrics.map(m => m.allocations.resourceUtilization))
    };

    // Calculate trends
    const trends = this.calculateTrends(cutoffTime);

    return {
      timeRange: {
        start: startTime,
        end: endTime,
        duration: endTime.getTime() - startTime.getTime()
      },
      system: systemSummary,
      application: applicationSummary,
      trends
    };
  }

  /**
   * Get active alerts
   */
  getActiveAlerts(severity?: 'low' | 'medium' | 'high' | 'critical'): MetricsAlert[] {
    const alerts = Array.from(this.alerts.values()).filter(alert => !alert.resolved);

    if (severity) {
      return alerts.filter(alert => alert.severity === severity);
    }

    return alerts.sort((a, b) => {
      const severityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
      return severityOrder[b.severity] - severityOrder[a.severity];
    });
  }

  /**
   * Resolve an alert
   */
  resolveAlert(alertId: string): boolean {
    const alert = this.alerts.get(alertId);

    if (alert && !alert.resolved) {
      alert.resolved = true;
      alert.resolvedAt = new Date();
      this.alerts.set(alertId, alert);

      this.emit('alert:resolved', {
        alert,
        timestamp: new Date()
      });

      return true;
    }

    return false;
  }

  /**
   * Export metrics in Prometheus format
   */
  exportPrometheusMetrics(): string {
    const lines: string[] = [];

    // System metrics
    const currentSystemMetrics = this.getCurrentSystemMetrics();
    if (currentSystemMetrics) {
      lines.push(`# HELP system_cpu_usage System CPU usage percentage`);
      lines.push(`# TYPE system_cpu_usage gauge`);
      lines.push(`system_cpu_usage ${currentSystemMetrics.cpu.usage}`);

      lines.push(`# HELP system_memory_usage System memory usage percentage`);
      lines.push(`# TYPE system_memory_usage gauge`);
      lines.push(`system_memory_usage ${currentSystemMetrics.memory.usage}`);

      lines.push(`# HELP system_disk_usage System disk usage percentage`);
      lines.push(`# TYPE system_disk_usage gauge`);
      lines.push(`system_disk_usage ${currentSystemMetrics.disk.usage}`);
    }

    // Application metrics
    const currentAppMetrics = this.getCurrentApplicationMetrics();
    if (currentAppMetrics) {
      lines.push(`# HELP application_agents_total Total number of agents`);
      lines.push(`# TYPE application_agents_total gauge`);
      lines.push(`application_agents_total ${currentAppMetrics.agents.total}`);

      lines.push(`# HELP application_tasks_throughput Task throughput per minute`);
      lines.push(`# TYPE application_tasks_throughput gauge`);
      lines.push(`application_tasks_throughput ${currentAppMetrics.tasks.throughput}`);

      lines.push(`# HELP application_response_time_avg Average response time in milliseconds`);
      lines.push(`# TYPE application_response_time_avg gauge`);
      lines.push(`application_response_time_avg ${currentAppMetrics.performance.averageResponseTime}`);
    }

    // Agent metrics
    for (const [agentId, metrics] of this.agentMetrics) {
      const latestMetrics = metrics[metrics.length - 1];
      if (latestMetrics) {
        lines.push(`# HELP agent_throughput Agent throughput per minute`);
        lines.push(`# TYPE agent_throughput gauge`);
        lines.push(`agent_throughput{agent_id="${agentId}"} ${latestMetrics.throughput}`);

        lines.push(`# HELP agent_response_time Agent average response time`);
        lines.push(`# TYPE agent_response_time gauge`);
        lines.push(`agent_response_time{agent_id="${agentId}"} ${latestMetrics.averageLatency}`);

        lines.push(`# HELP agent_success_rate Agent success rate percentage`);
        lines.push(`# TYPE agent_success_rate gauge`);
        lines.push(`agent_success_rate{agent_id="${agentId}"} ${latestMetrics.successRate}`);
      }
    }

    return lines.join('\n') + '\n';
  }

  /**
   * Shutdown the metrics collector
   */
  async shutdown(): Promise<void> {
    try {
      logger.info('Shutting down Resource Metrics Collector...');

      this.isRunning = false;

      // Clear timers
      if (this.collectionTimer) {
        clearInterval(this.collectionTimer);
      }
      if (this.cleanupTimer) {
        clearInterval(this.cleanupTimer);
      }
      if (this.exportTimer) {
        clearInterval(this.exportTimer);
      }

      // Clear data
      this.systemMetrics = [];
      this.applicationMetrics = [];
      this.agentMetrics.clear();
      this.alerts.clear();

      this.emit('collector:shutdown', { timestamp: new Date() });

      logger.info('Resource Metrics Collector shutdown complete');

    } catch (error) {
      logger.error({ error }, 'Error during Resource Metrics Collector shutdown');
      throw error;
    }
  }

  // Private helper methods

  private startMetricsCollection(): void {
    this.collectionTimer = setInterval(async () => {
      try {
        if (this.config.enableSystemMetrics) {
          await this.collectSystemMetrics();
        }

        if (this.config.enableApplicationMetrics) {
          await this.collectApplicationMetrics();
        }

        this.lastCollectionTime = Date.now();

      } catch (error) {
        logger.error({ error }, 'Error during metrics collection');
      }
    }, this.config.collectionInterval);
  }

  private startMetricsCleanup(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanupOldMetrics();
    }, 3600000); // Clean up every hour
  }

  private startPrometheusExport(): void {
    // This would typically start an HTTP server for Prometheus scraping
    // For now, we'll just log that export is enabled
    logger.info({
      port: this.config.exportConfig.prometheus.port,
      path: this.config.exportConfig.prometheus.path
    }, 'Prometheus metrics export enabled');
  }

  private async collectSystemMetrics(): Promise<void> {
    try {
      // Get system metrics from Node.js process and OS
      const cpuUsage = process.cpuUsage();
      const memUsage = process.memoryUsage();

      // Simulate system metrics (in production, use proper system monitoring libraries)
      const systemMetrics: SystemMetrics = {
        timestamp: new Date(),
        cpu: {
          usage: Math.min(100, (cpuUsage.user + cpuUsage.system) / 10000), // Approximate CPU usage
          cores: require('os').cpus().length,
          loadAverage: require('os').loadavg(),
          processes: 1 // Would get from system
        },
        memory: {
          total: require('os').totalmem(),
          used: memUsage.heapUsed,
          free: require('os').freemem(),
          cached: 0, // Would get from system
          usage: (memUsage.heapUsed / require('os').totalmem()) * 100
        },
        disk: {
          total: 100 * 1024 * 1024 * 1024, // 100GB simulated
          used: 50 * 1024 * 1024 * 1024,   // 50GB simulated
          free: 50 * 1024 * 1024 * 1024,   // 50GB simulated
          usage: 50,                        // 50% simulated
          iops: 0                           // Would get from system
        },
        network: {
          bytesIn: 0,    // Would get from system
          bytesOut: 0,   // Would get from system
          packetsIn: 0,  // Would get from system
          packetsOut: 0, // Would get from system
          connections: 0 // Would get from system
        }
      };

      await this.recordSystemMetrics(systemMetrics);

    } catch (error) {
      logger.error({ error }, 'Failed to collect system metrics');
    }
  }

  private async collectApplicationMetrics(): Promise<void> {
    try {
      // These would be collected from the actual application state
      // For now, we'll simulate application metrics
      const applicationMetrics: ApplicationMetrics = {
        timestamp: new Date(),
        agents: {
          total: this.agentMetrics.size,
          active: Math.floor(this.agentMetrics.size * 0.8),
          idle: Math.floor(this.agentMetrics.size * 0.15),
          failed: Math.floor(this.agentMetrics.size * 0.05)
        },
        tasks: {
          total: 1000, // Would get from task manager
          pending: 50,
          processing: 30,
          completed: 900,
          failed: 20,
          throughput: 10 // Tasks per minute
        },
        allocations: {
          active: 30,
          successRate: 95,
          averageWaitTime: 200,
          resourceUtilization: 75
        },
        performance: {
          averageResponseTime: 1500,
          p95ResponseTime: 3000,
          p99ResponseTime: 5000,
          errorRate: 2,
          qualityScore: 85
        }
      };

      await this.recordApplicationMetrics(applicationMetrics);

    } catch (error) {
      logger.error({ error }, 'Failed to collect application metrics');
    }
  }

  private async checkSystemAlerts(metrics: SystemMetrics): Promise<void> {
    const { alertingThresholds } = this.config;

    // CPU usage alert
    if (metrics.cpu.usage > alertingThresholds.cpuUsage) {
      await this.createAlert({
        id: `system_cpu_${Date.now()}`,
        timestamp: new Date(),
        severity: metrics.cpu.usage > 95 ? 'critical' : 'high',
        metric: 'system.cpu.usage',
        value: metrics.cpu.usage,
        threshold: alertingThresholds.cpuUsage,
        message: `High CPU usage detected: ${metrics.cpu.usage.toFixed(1)}%`
      });
    }

    // Memory usage alert
    if (metrics.memory.usage > alertingThresholds.memoryUsage) {
      await this.createAlert({
        id: `system_memory_${Date.now()}`,
        timestamp: new Date(),
        severity: metrics.memory.usage > 95 ? 'critical' : 'high',
        metric: 'system.memory.usage',
        value: metrics.memory.usage,
        threshold: alertingThresholds.memoryUsage,
        message: `High memory usage detected: ${metrics.memory.usage.toFixed(1)}%`
      });
    }

    // Disk usage alert
    if (metrics.disk.usage > alertingThresholds.diskUsage) {
      await this.createAlert({
        id: `system_disk_${Date.now()}`,
        timestamp: new Date(),
        severity: metrics.disk.usage > 95 ? 'critical' : 'medium',
        metric: 'system.disk.usage',
        value: metrics.disk.usage,
        threshold: alertingThresholds.diskUsage,
        message: `High disk usage detected: ${metrics.disk.usage.toFixed(1)}%`
      });
    }
  }

  private async checkApplicationAlerts(metrics: ApplicationMetrics): Promise<void> {
    const { alertingThresholds } = this.config;

    // Response time alert
    if (metrics.performance.averageResponseTime > alertingThresholds.responseTime) {
      await this.createAlert({
        id: `app_response_time_${Date.now()}`,
        timestamp: new Date(),
        severity: metrics.performance.averageResponseTime > alertingThresholds.responseTime * 2 ? 'high' : 'medium',
        metric: 'application.performance.averageResponseTime',
        value: metrics.performance.averageResponseTime,
        threshold: alertingThresholds.responseTime,
        message: `High response time detected: ${metrics.performance.averageResponseTime}ms`
      });
    }

    // Error rate alert
    if (metrics.performance.errorRate > alertingThresholds.errorRate) {
      await this.createAlert({
        id: `app_error_rate_${Date.now()}`,
        timestamp: new Date(),
        severity: metrics.performance.errorRate > alertingThresholds.errorRate * 2 ? 'high' : 'medium',
        metric: 'application.performance.errorRate',
        value: metrics.performance.errorRate,
        threshold: alertingThresholds.errorRate,
        message: `High error rate detected: ${metrics.performance.errorRate.toFixed(1)}%`
      });
    }
  }

  private async checkPerformanceAlerts(agentId: string, metrics: PerformanceMetric): Promise<void> {
    const { alertingThresholds } = this.config;

    // Agent response time alert
    if (metrics.averageLatency > alertingThresholds.responseTime) {
      await this.createAlert({
        id: `agent_response_time_${agentId}_${Date.now()}`,
        timestamp: new Date(),
        severity: metrics.averageLatency > alertingThresholds.responseTime * 2 ? 'high' : 'medium',
        metric: 'agent.averageLatency',
        value: metrics.averageLatency,
        threshold: alertingThresholds.responseTime,
        message: `High response time for agent ${agentId}: ${metrics.averageLatency}ms`,
        agentId
      });
    }

    // Agent error rate alert
    if (metrics.errorRate > alertingThresholds.errorRate) {
      await this.createAlert({
        id: `agent_error_rate_${agentId}_${Date.now()}`,
        timestamp: new Date(),
        severity: metrics.errorRate > alertingThresholds.errorRate * 2 ? 'high' : 'medium',
        metric: 'agent.errorRate',
        value: metrics.errorRate,
        threshold: alertingThresholds.errorRate,
        message: `High error rate for agent ${agentId}: ${metrics.errorRate.toFixed(1)}%`,
        agentId
      });
    }
  }

  private async createAlert(alert: Omit<MetricsAlert, 'resolved'>): Promise<void> {
    const fullAlert: MetricsAlert = {
      ...alert,
      resolved: false
    };

    this.alerts.set(alert.id, fullAlert);

    logger.warn({
      alertId: alert.id,
      severity: alert.severity,
      metric: alert.metric,
      value: alert.value,
      threshold: alert.threshold,
      agentId: alert.agentId
    }, alert.message);

    this.emit('alert:created', {
      alert: fullAlert,
      timestamp: new Date()
    });
  }

  private cleanupOldMetrics(): void {
    const cutoffTime = Date.now() - this.config.retentionPeriod;

    // Clean up system metrics
    this.systemMetrics = this.systemMetrics.filter(m => m.timestamp.getTime() > cutoffTime);

    // Clean up application metrics
    this.applicationMetrics = this.applicationMetrics.filter(m => m.timestamp.getTime() > cutoffTime);

    // Clean up agent metrics
    for (const [agentId, metrics] of this.agentMetrics) {
      const filteredMetrics = metrics.filter(m => m.timestamp.getTime() > cutoffTime);
      this.agentMetrics.set(agentId, filteredMetrics);
    }

    // Clean up resolved alerts
    for (const [alertId, alert] of this.alerts) {
      if (alert.resolved && alert.resolvedAt && alert.resolvedAt.getTime() < cutoffTime) {
        this.alerts.delete(alertId);
      }
    }
  }

  private parseTimeWindow(timeWindow: string): number {
    const now = Date.now();
    const match = timeWindow.match(/^(\d+)([hdwm])$/);

    if (!match) return now - 86400000; // Default to 24 hours

    const value = parseInt(match[1]);
    const unit = match[2];

    const multipliers = {
      'h': 3600000,      // Hours
      'd': 86400000,     // Days
      'w': 604800000,    // Weeks
      'm': 2592000000    // Months (30 days)
    };

    return now - (value * (multipliers[unit as keyof typeof multipliers] || 86400000));
  }

  private aggregateValues(values: number[], type: 'sum' | 'avg' | 'min' | 'max' | 'count'): number {
    if (values.length === 0) return 0;

    switch (type) {
      case 'sum':
        return values.reduce((sum, val) => sum + val, 0);
      case 'avg':
        return values.reduce((sum, val) => sum + val, 0) / values.length;
      case 'min':
        return Math.min(...values);
      case 'max':
        return Math.max(...values);
      case 'count':
        return values.length;
      default:
        return 0;
    }
  }

  private calculateAverage(values: number[]): number {
    return values.length > 0 ? values.reduce((sum, val) => sum + val, 0) / values.length : 0;
  }

  private sumValues(values: number[]): number {
    return values.reduce((sum, val) => sum + val, 0);
  }

  private calculateTrends(cutoffTime: number): Array<{ metric: string; trend: 'increasing' | 'decreasing' | 'stable'; changeRate: number }> {
    const trends: Array<{ metric: string; trend: 'increasing' | 'decreasing' | 'stable'; changeRate: number }> = [];

    // System trends
    const systemMetrics = this.systemMetrics.filter(m => m.timestamp.getTime() > cutoffTime);
    if (systemMetrics.length > 10) {
      trends.push(this.calculateMetricTrend('system.cpu.usage', systemMetrics.map(m => m.cpu.usage)));
      trends.push(this.calculateMetricTrend('system.memory.usage', systemMetrics.map(m => m.memory.usage)));
    }

    // Application trends
    const appMetrics = this.applicationMetrics.filter(m => m.timestamp.getTime() > cutoffTime);
    if (appMetrics.length > 10) {
      trends.push(this.calculateMetricTrend('application.tasks.throughput', appMetrics.map(m => m.tasks.throughput)));
      trends.push(this.calculateMetricTrend('application.performance.averageResponseTime', appMetrics.map(m => m.performance.averageResponseTime)));
    }

    return trends;
  }

  private calculateMetricTrend(
    metricName: string,
    values: number[]
  ): { metric: string; trend: 'increasing' | 'decreasing' | 'stable'; changeRate: number } {
    if (values.length < 2) {
      return { metric: metricName, trend: 'stable', changeRate: 0 };
    }

    const firstHalf = values.slice(0, Math.floor(values.length / 2));
    const secondHalf = values.slice(Math.floor(values.length / 2));

    const firstAvg = this.calculateAverage(firstHalf);
    const secondAvg = this.calculateAverage(secondHalf);

    const changeRate = firstAvg > 0 ? Math.abs((secondAvg - firstAvg) / firstAvg) * 100 : 0;

    let trend: 'increasing' | 'decreasing' | 'stable' = 'stable';
    if (changeRate > 5) { // 5% threshold
      trend = secondAvg > firstAvg ? 'increasing' : 'decreasing';
    }

    return { metric: metricName, trend, changeRate };
  }

  private extractSystemMetricValue(metrics: SystemMetrics, metricName: string): number {
    const path = metricName.split('.');
    let value: any = metrics;

    for (const key of path) {
      value = value[key];
      if (value === undefined) return 0;
    }

    return typeof value === 'number' ? value : 0;
  }

  private extractApplicationMetricValue(metrics: ApplicationMetrics, metricName: string): number {
    const path = metricName.split('.');
    let value: any = metrics;

    for (const key of path) {
      value = value[key];
      if (value === undefined) return 0;
    }

    return typeof value === 'number' ? value : 0;
  }

  private extractAgentMetricValue(metrics: PerformanceMetric, metricName: string): number {
    return (metrics as any)[metricName] || 0;
  }

  private setupEventHandlers(): void {
    // Handle alert events
    this.on('alert:created', (data) => {
      logger.info({
        alertId: data.alert.id,
        severity: data.alert.severity,
        metric: data.alert.metric
      }, 'Metrics alert created');
    });

    this.on('alert:resolved', (data) => {
      logger.info({
        alertId: data.alert.id,
        resolvedAt: data.alert.resolvedAt
      }, 'Metrics alert resolved');
    });
  }
}