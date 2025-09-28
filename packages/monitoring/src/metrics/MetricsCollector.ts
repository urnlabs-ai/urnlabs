import { EventEmitter } from 'events';
import Redis from 'ioredis';
import axios from 'axios';

interface MetricPoint {
  timestamp: number;
  value: number;
  labels?: Record<string, string>;
}

interface ApiMetrics {
  responseTime: MetricPoint[];
  requestCount: MetricPoint[];
  errorRate: MetricPoint[];
  throughput: MetricPoint[];
}

interface AgentMetrics {
  performance: MetricPoint[];
  successRate: MetricPoint[];
  executionTime: MetricPoint[];
  resourceUsage: MetricPoint[];
}

interface WorkflowMetrics {
  successRate: MetricPoint[];
  averageExecutionTime: MetricPoint[];
  failureRate: MetricPoint[];
  queueLength: MetricPoint[];
}

interface SystemMetrics {
  cpu: MetricPoint[];
  memory: MetricPoint[];
  disk: MetricPoint[];
  network: MetricPoint[];
}

export interface MetricsData {
  api: ApiMetrics;
  agents: AgentMetrics;
  workflows: WorkflowMetrics;
  system: SystemMetrics;
  timestamp: number;
}

export class MetricsCollector extends EventEmitter {
  private redis: Redis;
  private metricsCache: Map<string, MetricPoint[]> = new Map();
  private collectionInterval: NodeJS.Timeout | null = null;
  private readonly CACHE_TTL = 3600; // 1 hour
  private readonly MAX_CACHE_SIZE = 1000;

  constructor(
    private redisUrl: string,
    private apiEndpoint: string,
    private agentsEndpoint: string,
    private gatewayEndpoint: string
  ) {
    super();
    this.redis = new Redis(redisUrl);
    this.initializeMetricsCollection();
  }

  private initializeMetricsCollection(): void {
    // Collect metrics every 15 seconds
    this.collectionInterval = setInterval(async () => {
      try {
        await this.collectAllMetrics();
      } catch (error) {
        console.error('Failed to collect metrics:', error);
        this.emit('error', error);
      }
    }, 15000);

    // Emit metrics data every 5 seconds for real-time updates
    setInterval(() => {
      this.emit('metrics', this.getCurrentMetrics());
    }, 5000);
  }

  private async collectAllMetrics(): Promise<void> {
    const timestamp = Date.now();

    // Collect metrics in parallel for better performance
    const [apiMetrics, agentMetrics, workflowMetrics, systemMetrics] = await Promise.allSettled([
      this.collectApiMetrics(timestamp),
      this.collectAgentMetrics(timestamp),
      this.collectWorkflowMetrics(timestamp),
      this.collectSystemMetrics(timestamp)
    ]);

    // Store metrics in Redis for persistence
    await this.storeMetricsInRedis(timestamp, {
      api: apiMetrics.status === 'fulfilled' ? apiMetrics.value : this.getEmptyApiMetrics(),
      agents: agentMetrics.status === 'fulfilled' ? agentMetrics.value : this.getEmptyAgentMetrics(),
      workflows: workflowMetrics.status === 'fulfilled' ? workflowMetrics.value : this.getEmptyWorkflowMetrics(),
      system: systemMetrics.status === 'fulfilled' ? systemMetrics.value : this.getEmptySystemMetrics()
    });
  }

  private async collectApiMetrics(timestamp: number): Promise<ApiMetrics> {
    try {
      // Get API health and performance data
      const healthResponse = await axios.get(`${this.apiEndpoint}/health`, { timeout: 5000 });
      const metricsResponse = await axios.get(`${this.gatewayEndpoint}/metrics/detailed`, { timeout: 5000 });

      const apiData = metricsResponse.data;

      const metrics: ApiMetrics = {
        responseTime: [{
          timestamp,
          value: apiData.avgResponseTime || 0,
          labels: { service: 'api' }
        }],
        requestCount: [{
          timestamp,
          value: apiData.requestCount || 0,
          labels: { service: 'api' }
        }],
        errorRate: [{
          timestamp,
          value: (apiData.errorCount / Math.max(apiData.requestCount, 1)) * 100,
          labels: { service: 'api' }
        }],
        throughput: [{
          timestamp,
          value: apiData.throughput || 0,
          labels: { service: 'api' }
        }]
      };

      this.updateCache('api_metrics', metrics.responseTime);
      return metrics;
    } catch (error) {
      console.error('Failed to collect API metrics:', error);
      return this.getEmptyApiMetrics();
    }
  }

  private async collectAgentMetrics(timestamp: number): Promise<AgentMetrics> {
    try {
      const agentsResponse = await axios.get(`${this.agentsEndpoint}/metrics`, { timeout: 5000 });
      const agentsData = agentsResponse.data;

      const metrics: AgentMetrics = {
        performance: [{
          timestamp,
          value: agentsData.averagePerformanceScore || 0,
          labels: { type: 'performance' }
        }],
        successRate: [{
          timestamp,
          value: agentsData.successRate || 0,
          labels: { type: 'success_rate' }
        }],
        executionTime: [{
          timestamp,
          value: agentsData.averageExecutionTime || 0,
          labels: { type: 'execution_time' }
        }],
        resourceUsage: [{
          timestamp,
          value: agentsData.resourceUsage || 0,
          labels: { type: 'resource_usage' }
        }]
      };

      this.updateCache('agent_metrics', metrics.performance);
      return metrics;
    } catch (error) {
      console.error('Failed to collect agent metrics:', error);
      return this.getEmptyAgentMetrics();
    }
  }

  private async collectWorkflowMetrics(timestamp: number): Promise<WorkflowMetrics> {
    try {
      const workflowResponse = await axios.get(`${this.agentsEndpoint}/workflows/metrics`, { timeout: 5000 });
      const workflowData = workflowResponse.data;

      const metrics: WorkflowMetrics = {
        successRate: [{
          timestamp,
          value: workflowData.successRate || 0,
          labels: { type: 'workflow_success' }
        }],
        averageExecutionTime: [{
          timestamp,
          value: workflowData.averageExecutionTime || 0,
          labels: { type: 'workflow_execution' }
        }],
        failureRate: [{
          timestamp,
          value: workflowData.failureRate || 0,
          labels: { type: 'workflow_failure' }
        }],
        queueLength: [{
          timestamp,
          value: workflowData.queueLength || 0,
          labels: { type: 'queue_length' }
        }]
      };

      this.updateCache('workflow_metrics', metrics.successRate);
      return metrics;
    } catch (error) {
      console.error('Failed to collect workflow metrics:', error);
      return this.getEmptyWorkflowMetrics();
    }
  }

  private async collectSystemMetrics(timestamp: number): Promise<SystemMetrics> {
    const memUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();

    const metrics: SystemMetrics = {
      cpu: [{
        timestamp,
        value: (cpuUsage.user + cpuUsage.system) / 1000000, // Convert to seconds
        labels: { type: 'cpu_usage' }
      }],
      memory: [{
        timestamp,
        value: memUsage.heapUsed / 1024 / 1024, // Convert to MB
        labels: { type: 'memory_usage' }
      }],
      disk: [{
        timestamp,
        value: 0, // Placeholder - would need system-specific implementation
        labels: { type: 'disk_usage' }
      }],
      network: [{
        timestamp,
        value: 0, // Placeholder - would need network monitoring
        labels: { type: 'network_usage' }
      }]
    };

    this.updateCache('system_metrics', metrics.memory);
    return metrics;
  }

  private updateCache(key: string, data: MetricPoint[]): void {
    const existing = this.metricsCache.get(key) || [];
    const updated = [...existing, ...data].slice(-this.MAX_CACHE_SIZE);
    this.metricsCache.set(key, updated);
  }

  private async storeMetricsInRedis(timestamp: number, metrics: Omit<MetricsData, 'timestamp'>): Promise<void> {
    const key = `metrics:${Math.floor(timestamp / 60000)}`; // Store by minute
    const data = { ...metrics, timestamp };

    try {
      await this.redis.setex(key, this.CACHE_TTL, JSON.stringify(data));

      // Also maintain a sorted set for time-series queries
      await this.redis.zadd('metrics_timeline', timestamp, key);

      // Remove old entries (older than 24 hours)
      const cutoff = timestamp - (24 * 60 * 60 * 1000);
      await this.redis.zremrangebyscore('metrics_timeline', 0, cutoff);
    } catch (error) {
      console.error('Failed to store metrics in Redis:', error);
    }
  }

  public async getHistoricalMetrics(startTime: number, endTime: number): Promise<MetricsData[]> {
    try {
      const keys = await this.redis.zrangebyscore('metrics_timeline', startTime, endTime);
      const pipeline = this.redis.pipeline();

      keys.forEach(key => pipeline.get(key));
      const results = await pipeline.exec();

      return results
        ?.map(([err, data]) => err ? null : JSON.parse(data as string))
        .filter(Boolean) as MetricsData[] || [];
    } catch (error) {
      console.error('Failed to get historical metrics:', error);
      return [];
    }
  }

  public getCurrentMetrics(): MetricsData {
    return {
      api: this.getCachedApiMetrics(),
      agents: this.getCachedAgentMetrics(),
      workflows: this.getCachedWorkflowMetrics(),
      system: this.getCachedSystemMetrics(),
      timestamp: Date.now()
    };
  }

  public async getPrometheusMetrics(): Promise<string> {
    const metrics = this.getCurrentMetrics();
    const lines: string[] = [];

    // API Metrics
    lines.push('# HELP urnlabs_api_response_time_seconds API response time in seconds');
    lines.push('# TYPE urnlabs_api_response_time_seconds gauge');
    metrics.api.responseTime.forEach(point => {
      const labels = Object.entries(point.labels || {}).map(([k, v]) => `${k}="${v}"`).join(',');
      lines.push(`urnlabs_api_response_time_seconds{${labels}} ${point.value / 1000}`);
    });

    lines.push('# HELP urnlabs_api_requests_total Total API requests');
    lines.push('# TYPE urnlabs_api_requests_total counter');
    metrics.api.requestCount.forEach(point => {
      const labels = Object.entries(point.labels || {}).map(([k, v]) => `${k}="${v}"`).join(',');
      lines.push(`urnlabs_api_requests_total{${labels}} ${point.value}`);
    });

    // Agent Metrics
    lines.push('# HELP urnlabs_agent_performance_score Agent performance score');
    lines.push('# TYPE urnlabs_agent_performance_score gauge');
    metrics.agents.performance.forEach(point => {
      const labels = Object.entries(point.labels || {}).map(([k, v]) => `${k}="${v}"`).join(',');
      lines.push(`urnlabs_agent_performance_score{${labels}} ${point.value}`);
    });

    // Workflow Metrics
    lines.push('# HELP urnlabs_workflow_success_rate Workflow success rate percentage');
    lines.push('# TYPE urnlabs_workflow_success_rate gauge');
    metrics.workflows.successRate.forEach(point => {
      const labels = Object.entries(point.labels || {}).map(([k, v]) => `${k}="${v}"`).join(',');
      lines.push(`urnlabs_workflow_success_rate{${labels}} ${point.value}`);
    });

    // System Metrics
    lines.push('# HELP urnlabs_system_memory_usage_mb System memory usage in MB');
    lines.push('# TYPE urnlabs_system_memory_usage_mb gauge');
    metrics.system.memory.forEach(point => {
      const labels = Object.entries(point.labels || {}).map(([k, v]) => `${k}="${v}"`).join(',');
      lines.push(`urnlabs_system_memory_usage_mb{${labels}} ${point.value}`);
    });

    return lines.join('\n');
  }

  private getCachedApiMetrics(): ApiMetrics {
    const cached = this.metricsCache.get('api_metrics') || [];
    return {
      responseTime: cached.slice(-10),
      requestCount: cached.slice(-10),
      errorRate: cached.slice(-10),
      throughput: cached.slice(-10)
    };
  }

  private getCachedAgentMetrics(): AgentMetrics {
    const cached = this.metricsCache.get('agent_metrics') || [];
    return {
      performance: cached.slice(-10),
      successRate: cached.slice(-10),
      executionTime: cached.slice(-10),
      resourceUsage: cached.slice(-10)
    };
  }

  private getCachedWorkflowMetrics(): WorkflowMetrics {
    const cached = this.metricsCache.get('workflow_metrics') || [];
    return {
      successRate: cached.slice(-10),
      averageExecutionTime: cached.slice(-10),
      failureRate: cached.slice(-10),
      queueLength: cached.slice(-10)
    };
  }

  private getCachedSystemMetrics(): SystemMetrics {
    const cached = this.metricsCache.get('system_metrics') || [];
    return {
      cpu: cached.slice(-10),
      memory: cached.slice(-10),
      disk: cached.slice(-10),
      network: cached.slice(-10)
    };
  }

  private getEmptyApiMetrics(): ApiMetrics {
    return {
      responseTime: [],
      requestCount: [],
      errorRate: [],
      throughput: []
    };
  }

  private getEmptyAgentMetrics(): AgentMetrics {
    return {
      performance: [],
      successRate: [],
      executionTime: [],
      resourceUsage: []
    };
  }

  private getEmptyWorkflowMetrics(): WorkflowMetrics {
    return {
      successRate: [],
      averageExecutionTime: [],
      failureRate: [],
      queueLength: []
    };
  }

  private getEmptySystemMetrics(): SystemMetrics {
    return {
      cpu: [],
      memory: [],
      disk: [],
      network: []
    };
  }

  public destroy(): void {
    if (this.collectionInterval) {
      clearInterval(this.collectionInterval);
    }
    this.redis.disconnect();
    this.removeAllListeners();
  }
}