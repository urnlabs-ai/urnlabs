export interface PerformanceMetric {
  id: string;
  timestamp: Date;
  service: string;
  endpoint?: string;
  metric_type: MetricType;
  value: number;
  unit: string;
  tags: Record<string, string>;
  metadata?: Record<string, any>;
}

export interface AgentPerformanceMetric extends PerformanceMetric {
  agent_id: string;
  workflow_id?: string;
  task_id?: string;
  success: boolean;
  execution_time_ms: number;
  cost_cents: number;
  tokens_used?: number;
}

export interface BusinessMetric {
  id: string;
  timestamp: Date;
  metric_name: string;
  value: number;
  dimension: Record<string, string>;
  business_unit?: string;
  revenue_impact_cents?: number;
  cost_savings_cents?: number;
}

export interface ROICalculation {
  id: string;
  period_start: Date;
  period_end: Date;
  total_cost_cents: number;
  total_revenue_cents: number;
  cost_savings_cents: number;
  efficiency_gains_percent: number;
  roi_percent: number;
  payback_period_days: number;
  net_present_value_cents: number;
  breakdown: ROIBreakdown;
}

export interface ROIBreakdown {
  agent_costs: Record<string, number>;
  infrastructure_costs: Record<string, number>;
  human_labor_savings: Record<string, number>;
  revenue_generation: Record<string, number>;
  efficiency_improvements: Record<string, number>;
}

export interface DashboardWidget {
  id: string;
  title: string;
  type: WidgetType;
  config: WidgetConfig;
  data_source: string;
  refresh_interval_seconds: number;
  position: { x: number; y: number; width: number; height: number };
}

export interface AnalyticsReport {
  id: string;
  name: string;
  description: string;
  schedule: ReportSchedule;
  recipients: string[];
  format: ReportFormat;
  sections: ReportSection[];
  last_generated: Date | null;
  next_generation: Date;
}

export enum MetricType {
  COUNTER = 'counter',
  GAUGE = 'gauge',
  HISTOGRAM = 'histogram',
  TIMER = 'timer'
}

export enum WidgetType {
  LINE_CHART = 'line_chart',
  BAR_CHART = 'bar_chart',
  PIE_CHART = 'pie_chart',
  GAUGE = 'gauge',
  COUNTER = 'counter',
  TABLE = 'table',
  HEATMAP = 'heatmap'
}

export interface WidgetConfig {
  query: string;
  time_range: string;
  aggregation?: string;
  grouping?: string[];
  filters?: Record<string, any>;
  visualization_options?: Record<string, any>;
}

export enum ReportSchedule {
  HOURLY = 'hourly',
  DAILY = 'daily',
  WEEKLY = 'weekly',
  MONTHLY = 'monthly',
  QUARTERLY = 'quarterly'
}

export enum ReportFormat {
  PDF = 'pdf',
  EMAIL = 'email',
  SLACK = 'slack',
  WEBHOOK = 'webhook'
}

export interface ReportSection {
  title: string;
  description?: string;
  widget_ids: string[];
  custom_content?: string;
}

export interface AlertRule {
  id: string;
  name: string;
  description: string;
  metric_query: string;
  condition: AlertCondition;
  threshold_value: number;
  severity: AlertSeverity;
  channels: AlertChannel[];
  enabled: boolean;
  cooldown_minutes: number;
}

export interface AlertCondition {
  operator: 'gt' | 'lt' | 'eq' | 'gte' | 'lte';
  aggregation: 'avg' | 'sum' | 'min' | 'max' | 'count';
  time_window_minutes: number;
}

export enum AlertSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

export interface AlertChannel {
  type: 'email' | 'slack' | 'webhook' | 'sms';
  config: Record<string, any>;
}

export interface TimeSeriesData {
  timestamp: Date;
  value: number;
  metadata?: Record<string, any>;
}

export interface MetricQuery {
  metric_name: string;
  time_range: {
    start: Date;
    end: Date;
  };
  filters?: Record<string, any>;
  aggregation?: {
    function: 'avg' | 'sum' | 'min' | 'max' | 'count' | 'percentile';
    interval?: string;
    percentile?: number;
  };
  group_by?: string[];
}

export interface QueryResult {
  data: TimeSeriesData[];
  metadata: {
    total_points: number;
    query_time_ms: number;
    cache_hit: boolean;
  };
}