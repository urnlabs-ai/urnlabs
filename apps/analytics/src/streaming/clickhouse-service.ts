import { createClient, ClickHouseClient } from '@clickhouse/client';
import { Logger } from '../utils/logger.js';
import { StreamingMetric } from './kafka-producer.js';

export interface ClickHouseConfig {
  url?: string;
  username?: string;
  password?: string;
  database?: string;
  session_timeout?: number;
  request_timeout?: number;
  compression?: boolean;
}

export interface QueryOptions {
  format?: string;
  timeout?: number;
  parameters?: Record<string, any>;
}

export interface AggregationQuery {
  table: string;
  groupBy: string[];
  aggregations: Record<string, string>; // e.g., { avg_value: 'avg(value)', count: 'count()' }
  filters?: Record<string, any>;
  timeRange?: { start: Date; end: Date };
  orderBy?: string;
  limit?: number;
}

export class ClickHouseService {
  private client: ClickHouseClient;
  private logger: Logger;
  private connected: boolean = false;

  constructor(logger: Logger, config?: ClickHouseConfig) {
    this.logger = logger;
    
    const defaultConfig: ClickHouseConfig = {
      url: process.env.CLICKHOUSE_URL || 'http://localhost:8123',
      username: process.env.CLICKHOUSE_USER || 'clickhouse',
      password: process.env.CLICKHOUSE_PASSWORD || 'clickhouse',
      database: process.env.CLICKHOUSE_DATABASE || 'analytics',
      session_timeout: 30000,
      request_timeout: 30000,
      compression: true
    };

    const finalConfig = { ...defaultConfig, ...config };

    this.client = createClient({
      url: finalConfig.url,
      username: finalConfig.username,
      password: finalConfig.password,
      database: finalConfig.database,
      session_timeout: finalConfig.session_timeout,
      request_timeout: finalConfig.request_timeout,
      compression: finalConfig.compression ? { request: true, response: true } : undefined,
      clickhouse_settings: {
        insert_quorum: 'auto',
        insert_quorum_timeout: 30000,
        select_sequential_consistency: 1,
        max_execution_time: 30,
        max_memory_usage: '4000000000' // 4GB
      }
    });
  }

  async connect(): Promise<void> {
    try {
      // Test connection with a simple query
      await this.client.ping();
      this.connected = true;
      this.logger.info('ClickHouse client connected successfully');
    } catch (error) {
      this.logger.error('Failed to connect to ClickHouse', { error });
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    try {
      await this.client.close();
      this.connected = false;
      this.logger.info('ClickHouse client disconnected');
    } catch (error) {
      this.logger.error('Error disconnecting ClickHouse client', { error });
      throw error;
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Insert performance metrics
   */
  async insertPerformanceMetrics(metrics: StreamingMetric[]): Promise<void> {
    const values = metrics.map(metric => ({
      id: metric.id,
      timestamp: metric.timestamp,
      service: metric.data.service,
      metric_type: metric.data.metric_type,
      value: metric.data.value,
      unit: metric.data.unit,
      tags: metric.data.tags || {}
    }));

    await this.client.insert({
      table: 'performance_metrics',
      values,
      format: 'JSONEachRow'
    });

    this.logger.debug('Inserted performance metrics', { count: values.length });
  }

  /**
   * Insert agent metrics
   */
  async insertAgentMetrics(metrics: StreamingMetric[]): Promise<void> {
    const values = metrics.map(metric => ({
      id: metric.id,
      timestamp: metric.timestamp,
      service: metric.service,
      agent_id: metric.data.agent_id,
      workflow_id: metric.data.workflow_id || null,
      success: metric.data.success ? 1 : 0,
      execution_time_ms: metric.data.execution_time_ms,
      cost_cents: metric.data.cost_cents,
      tokens_used: metric.data.tokens_used || null,
      tags: metric.data.tags || {}
    }));

    await this.client.insert({
      table: 'agent_metrics',
      values,
      format: 'JSONEachRow'
    });

    this.logger.debug('Inserted agent metrics', { count: values.length });
  }

  /**
   * Insert business metrics
   */
  async insertBusinessMetrics(metrics: StreamingMetric[]): Promise<void> {
    const values = metrics.map(metric => ({
      id: metric.id,
      timestamp: metric.timestamp,
      metric_name: metric.data.metric_name,
      value: metric.data.value,
      unit: metric.data.unit,
      dimension: metric.data.dimension || {},
      cost_savings_cents: metric.data.cost_savings_cents || null,
      revenue_impact_cents: metric.data.revenue_impact_cents || null
    }));

    await this.client.insert({
      table: 'business_metrics',
      values,
      format: 'JSONEachRow'
    });

    this.logger.debug('Inserted business metrics', { count: values.length });
  }

  /**
   * Insert API metrics
   */
  async insertApiMetrics(metrics: StreamingMetric[]): Promise<void> {
    const values = metrics.map(metric => ({
      id: metric.id,
      timestamp: metric.timestamp,
      method: metric.data.method,
      endpoint: metric.data.endpoint,
      status_code: metric.data.status_code,
      response_time_ms: metric.data.response_time_ms,
      request_size_bytes: metric.data.request_size_bytes,
      response_size_bytes: metric.data.response_size_bytes,
      user_id: metric.data.user_id || null,
      ip_address: metric.data.ip_address,
      user_agent: metric.data.user_agent,
      error_message: metric.data.error_message || null
    }));

    await this.client.insert({
      table: 'api_requests',
      values,
      format: 'JSONEachRow'
    });

    this.logger.debug('Inserted API metrics', { count: values.length });
  }

  /**
   * Insert workflow metrics
   */
  async insertWorkflowMetrics(metrics: StreamingMetric[]): Promise<void> {
    const values = metrics.map(metric => ({
      id: metric.id,
      timestamp: metric.timestamp,
      workflow_id: metric.data.workflow_id,
      workflow_name: metric.data.workflow_name,
      execution_id: metric.data.execution_id,
      status: metric.data.status,
      duration_ms: metric.data.duration_ms || null,
      agent_count: metric.data.agent_count,
      total_cost_cents: metric.data.total_cost_cents,
      success_rate: metric.data.success_rate,
      error_message: metric.data.error_message || null,
      metadata: metric.data.metadata || {}
    }));

    await this.client.insert({
      table: 'workflow_executions',
      values,
      format: 'JSONEachRow'
    });

    this.logger.debug('Inserted workflow metrics', { count: values.length });
  }

  /**
   * Insert user behavior metrics
   */
  async insertUserBehaviorMetrics(metrics: StreamingMetric[]): Promise<void> {
    const values = metrics.map(metric => ({
      id: metric.id,
      timestamp: metric.timestamp,
      user_id: metric.data.user_id,
      session_id: metric.data.session_id,
      event_type: metric.data.event_type,
      page_path: metric.data.page_path,
      duration_ms: metric.data.duration_ms,
      metadata: metric.data.metadata || {}
    }));

    await this.client.insert({
      table: 'user_behavior',
      values,
      format: 'JSONEachRow'
    });

    this.logger.debug('Inserted user behavior metrics', { count: values.length });
  }

  /**
   * Insert error logs
   */
  async insertErrorLogs(metrics: StreamingMetric[]): Promise<void> {
    const values = metrics.map(metric => ({
      id: metric.id,
      timestamp: metric.timestamp,
      service: metric.data.service,
      level: metric.data.level,
      message: metric.data.message,
      stack_trace: metric.data.stack_trace || null,
      request_id: metric.data.request_id || null,
      user_id: metric.data.user_id || null,
      metadata: metric.data.metadata || {}
    }));

    await this.client.insert({
      table: 'error_logs',
      values,
      format: 'JSONEachRow'
    });

    this.logger.debug('Inserted error logs', { count: values.length });
  }

  /**
   * Insert resource utilization metrics
   */
  async insertResourceMetrics(metrics: StreamingMetric[]): Promise<void> {
    const values = metrics.map(metric => ({
      id: metric.id,
      timestamp: metric.timestamp,
      service: metric.data.service,
      instance_id: metric.data.instance_id,
      cpu_percent: metric.data.cpu_percent,
      memory_percent: metric.data.memory_percent,
      disk_percent: metric.data.disk_percent,
      network_in_bytes: metric.data.network_in_bytes,
      network_out_bytes: metric.data.network_out_bytes
    }));

    await this.client.insert({
      table: 'resource_utilization',
      values,
      format: 'JSONEachRow'
    });

    this.logger.debug('Inserted resource metrics', { count: values.length });
  }

  /**
   * Execute a custom query
   */
  async query<T = any>(sql: string, options?: QueryOptions): Promise<T[]> {
    try {
      const result = await this.client.query({
        query: sql,
        format: options?.format || 'JSONEachRow',
        query_params: options?.parameters || {},
        clickhouse_settings: options?.timeout ? { max_execution_time: options.timeout } : undefined
      });

      const data = await result.json<T>();
      return Array.isArray(data) ? data : [data];
    } catch (error) {
      this.logger.error('ClickHouse query failed', { error, sql });
      throw error;
    }
  }

  /**
   * Execute aggregation query with time series support
   */
  async aggregateQuery(query: AggregationQuery): Promise<any[]> {
    let sql = `SELECT ${query.groupBy.join(', ')}`;
    
    // Add aggregations
    const aggregations = Object.entries(query.aggregations)
      .map(([alias, expr]) => `${expr} AS ${alias}`)
      .join(', ');
    
    if (aggregations) {
      sql += `, ${aggregations}`;
    }
    
    sql += ` FROM ${query.table}`;
    
    // Add WHERE conditions
    const conditions: string[] = [];
    
    if (query.timeRange) {
      conditions.push(`timestamp >= '${query.timeRange.start.toISOString()}'`);
      conditions.push(`timestamp <= '${query.timeRange.end.toISOString()}'`);
    }
    
    if (query.filters) {
      for (const [field, value] of Object.entries(query.filters)) {
        if (Array.isArray(value)) {
          conditions.push(`${field} IN (${value.map(v => `'${v}'`).join(', ')})`);
        } else {
          conditions.push(`${field} = '${value}'`);
        }
      }
    }
    
    if (conditions.length > 0) {
      sql += ` WHERE ${conditions.join(' AND ')}`;
    }
    
    // Add GROUP BY
    if (query.groupBy.length > 0) {
      sql += ` GROUP BY ${query.groupBy.join(', ')}`;
    }
    
    // Add ORDER BY
    if (query.orderBy) {
      sql += ` ORDER BY ${query.orderBy}`;
    }
    
    // Add LIMIT
    if (query.limit) {
      sql += ` LIMIT ${query.limit}`;
    }

    return this.query(sql);
  }

  /**
   * Get real-time metrics for dashboard
   */
  async getRealTimeMetrics(timeRange: { start: Date; end: Date }): Promise<{
    performance: any[];
    agents: any[];
    api: any[];
    errors: any[];
  }> {
    const [performance, agents, api, errors] = await Promise.all([
      // Performance metrics
      this.aggregateQuery({
        table: 'performance_metrics',
        groupBy: ['service', 'toStartOfMinute(timestamp) as minute'],
        aggregations: {
          avg_value: 'avg(value)',
          max_value: 'max(value)',
          count: 'count()'
        },
        timeRange,
        orderBy: 'minute DESC',
        limit: 1000
      }),
      
      // Agent performance
      this.aggregateQuery({
        table: 'agent_metrics',
        groupBy: ['agent_id', 'toStartOfMinute(timestamp) as minute'],
        aggregations: {
          success_rate: 'avg(success) * 100',
          avg_execution_time: 'avg(execution_time_ms)',
          total_cost: 'sum(cost_cents)',
          execution_count: 'count()'
        },
        timeRange,
        orderBy: 'minute DESC',
        limit: 1000
      }),
      
      // API performance
      this.aggregateQuery({
        table: 'api_requests',
        groupBy: ['endpoint', 'toStartOfMinute(timestamp) as minute'],
        aggregations: {
          avg_response_time: 'avg(response_time_ms)',
          request_count: 'count()',
          error_rate: 'countIf(status_code >= 400) / count() * 100'
        },
        timeRange,
        orderBy: 'minute DESC',
        limit: 1000
      }),
      
      // Error analysis
      this.aggregateQuery({
        table: 'error_logs',
        groupBy: ['service', 'level', 'toStartOfMinute(timestamp) as minute'],
        aggregations: {
          error_count: 'count()'
        },
        timeRange,
        orderBy: 'minute DESC',
        limit: 500
      })
    ]);

    return { performance, agents, api, errors };
  }

  /**
   * Get historical trends for predictive analysis
   */
  async getHistoricalTrends(days: number = 30): Promise<{
    daily_metrics: any[];
    agent_performance: any[];
    cost_trends: any[];
  }> {
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - (days * 24 * 60 * 60 * 1000));

    const [daily_metrics, agent_performance, cost_trends] = await Promise.all([
      // Daily metrics trends
      this.aggregateQuery({
        table: 'performance_metrics',
        groupBy: ['service', 'toDate(timestamp) as day'],
        aggregations: {
          avg_value: 'avg(value)',
          total_requests: 'count()',
          p95_value: 'quantile(0.95)(value)'
        },
        timeRange: { start: startDate, end: endDate },
        orderBy: 'day DESC'
      }),
      
      // Agent performance trends
      this.aggregateQuery({
        table: 'agent_metrics',
        groupBy: ['agent_id', 'toDate(timestamp) as day'],
        aggregations: {
          success_rate: 'avg(success) * 100',
          avg_cost: 'avg(cost_cents)',
          total_executions: 'count()',
          avg_tokens: 'avg(tokens_used)'
        },
        timeRange: { start: startDate, end: endDate },
        orderBy: 'day DESC'
      }),
      
      // Cost trends
      this.aggregateQuery({
        table: 'agent_metrics',
        groupBy: ['toDate(timestamp) as day'],
        aggregations: {
          total_cost: 'sum(cost_cents)',
          avg_cost_per_execution: 'avg(cost_cents)',
          total_tokens: 'sum(tokens_used)',
          unique_agents: 'uniq(agent_id)'
        },
        timeRange: { start: startDate, end: endDate },
        orderBy: 'day DESC'
      })
    ]);

    return { daily_metrics, agent_performance, cost_trends };
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.client.ping();
      return true;
    } catch (error) {
      this.logger.error('ClickHouse health check failed', { error });
      return false;
    }
  }

  /**
   * Get database statistics
   */
  async getStats(): Promise<any> {
    const stats = await this.query(`
      SELECT 
        table,
        sum(rows) as total_rows,
        sum(bytes_on_disk) as total_size_bytes,
        max(modification_time) as last_modified
      FROM system.parts
      WHERE database = 'analytics'
        AND active = 1
      GROUP BY table
      ORDER BY total_rows DESC
    `);

    return stats;
  }
}