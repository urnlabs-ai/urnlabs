import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { buildServer } from '../server.js';
import { FastifyInstance } from 'fastify';

describe('Analytics API Integration Tests', () => {
  let server: FastifyInstance;

  beforeEach(async () => {
    // Mock environment variables
    process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
    process.env.REDIS_HOST = 'localhost';
    process.env.REDIS_PORT = '6379';
    
    server = await buildServer();
  });

  afterEach(async () => {
    await server.close();
  });

  describe('Health Check', () => {
    it('should return healthy status', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/health'
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.status).toBe('healthy');
      expect(body.services).toBeDefined();
    });
  });

  describe('Metrics API', () => {
    it('should record a performance metric', async () => {
      const metric = {
        service: 'api',
        metric_type: 'timer',
        value: 150,
        unit: 'ms',
        tags: { endpoint: '/test' }
      };

      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/metrics',
        payload: metric
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
    });

    it('should validate metric payload', async () => {
      const invalidMetric = {
        service: 'api',
        // missing required fields
      };

      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/metrics',
        payload: invalidMetric
      });

      expect(response.statusCode).toBe(400);
    });

    it('should record agent metric', async () => {
      const agentMetric = {
        service: 'agents',
        agent_id: 'agent-123',
        metric_type: 'timer',
        value: 2500,
        unit: 'ms',
        success: true,
        execution_time_ms: 2500,
        cost_cents: 5,
        tokens_used: 150,
        tags: { workflow_id: 'workflow-456' }
      };

      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/metrics/agent',
        payload: agentMetric
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
    });

    it('should record business metric', async () => {
      const businessMetric = {
        metric_name: 'customer_satisfaction',
        value: 4.8,
        dimension: { category: 'support' },
        revenue_impact_cents: 10000
      };

      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/metrics/business',
        payload: businessMetric
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
    });

    it('should query metrics', async () => {
      const query = {
        metric_name: 'api.response_time',
        start_time: '2024-01-01T00:00:00Z',
        end_time: '2024-01-02T00:00:00Z',
        aggregation: {
          function: 'avg',
          interval: '1h'
        }
      };

      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/metrics/query',
        payload: query
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data).toBeDefined();
      expect(body.metadata).toBeDefined();
    });

    it('should get real-time metrics', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/metrics/realtime/api?metric_type=timer'
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(Array.isArray(body)).toBe(true);
    });

    it('should get agent performance summary', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/metrics/agent/agent-123/summary?hours=24'
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.total_executions).toBeDefined();
      expect(body.success_rate).toBeDefined();
      expect(body.avg_execution_time_ms).toBeDefined();
    });
  });

  describe('Dashboard API', () => {
    it('should create a widget', async () => {
      const widget = {
        title: 'API Response Time',
        type: 'line_chart',
        config: {
          query: 'api.response_time',
          time_range: '24h',
          aggregation: 'avg'
        },
        data_source: 'metrics',
        refresh_interval_seconds: 300,
        position: { x: 0, y: 0, width: 6, height: 4 }
      };

      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/dashboard/widgets',
        payload: widget
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.id).toBeDefined();
      expect(body.title).toBe('API Response Time');
    });

    it('should get widget data', async () => {
      // First create a widget
      const widget = {
        title: 'Test Widget',
        type: 'counter',
        config: {
          query: 'test.metric',
          time_range: '1h'
        },
        data_source: 'metrics',
        refresh_interval_seconds: 300,
        position: { x: 0, y: 0, width: 3, height: 2 }
      };

      const createResponse = await server.inject({
        method: 'POST',
        url: '/api/v1/dashboard/widgets',
        payload: widget
      });

      const createdWidget = JSON.parse(createResponse.body);

      // Then get its data
      const dataResponse = await server.inject({
        method: 'GET',
        url: `/api/v1/dashboard/widgets/${createdWidget.id}/data`
      });

      expect(dataResponse.statusCode).toBe(200);
    });

    it('should create dashboard', async () => {
      const dashboard = {
        name: 'Main Dashboard',
        description: 'Primary analytics dashboard',
        widgets: [],
        created_by: 'user-123',
        is_public: false,
        tags: ['analytics', 'main']
      };

      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/dashboard',
        payload: dashboard
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.id).toBeDefined();
      expect(body.name).toBe('Main Dashboard');
    });
  });

  describe('ROI API', () => {
    it('should calculate ROI', async () => {
      const request = {
        period_start: '2024-01-01T00:00:00Z',
        period_end: '2024-01-31T23:59:59Z',
        include_projections: false
      };

      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/roi/calculate',
        payload: request
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.roi_percent).toBeDefined();
      expect(body.total_cost_cents).toBeDefined();
      expect(body.breakdown).toBeDefined();
    });

    it('should get ROI summary', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/roi/summary?periods=30d'
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.current_period).toBeDefined();
      expect(body.previous_period).toBeDefined();
      expect(body.change).toBeDefined();
      expect(body.trends).toBeDefined();
    });

    it('should get cost breakdown', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/roi/costs?period_start=2024-01-01T00:00:00Z&period_end=2024-01-31T23:59:59Z&group_by=agent'
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.total_cost_cents).toBeDefined();
      expect(body.breakdown).toBeDefined();
      expect(body.top_costs).toBeDefined();
    });

    it('should get savings analysis', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/roi/savings?period_start=2024-01-01T00:00:00Z&period_end=2024-01-31T23:59:59Z'
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.total_savings_cents).toBeDefined();
      expect(body.projected_annual_savings_cents).toBeDefined();
      expect(body.savings_by_category).toBeDefined();
    });
  });

  describe('Reports API', () => {
    it('should create report', async () => {
      const report = {
        name: 'Weekly Performance Report',
        description: 'Weekly summary of system performance',
        schedule: 'weekly',
        recipients: ['admin@urnlabs.ai'],
        format: 'email',
        sections: [
          {
            title: 'Performance Metrics',
            widget_ids: ['widget-123']
          }
        ]
      };

      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/reports',
        payload: report
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.id).toBeDefined();
      expect(body.name).toBe('Weekly Performance Report');
    });

    it('should test report configuration', async () => {
      const reportConfig = {
        name: 'Test Report',
        description: 'Test report configuration',
        schedule: 'daily',
        recipients: ['test@example.com'],
        format: 'pdf',
        sections: [
          {
            title: 'Test Section',
            widget_ids: ['test-widget']
          }
        ]
      };

      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/reports/test',
        payload: reportConfig
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.preview).toBeDefined();
      expect(body.validation_errors).toBeDefined();
    });
  });

  describe('Intelligence API', () => {
    it('should generate business insights', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/intelligence/insights/generate'
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(Array.isArray(body)).toBe(true);
    });

    it('should analyze trends', async () => {
      const trendRequest = {
        metric: 'api.response_time',
        start_time: '2024-01-01T00:00:00Z',
        end_time: '2024-01-07T23:59:59Z',
        forecast_days: 7
      };

      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/intelligence/trends',
        payload: trendRequest
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.trend_direction).toBeDefined();
      expect(body.forecast).toBeDefined();
      expect(body.anomalies).toBeDefined();
    });

    it('should create alert rule', async () => {
      const alertRule = {
        name: 'High Response Time Alert',
        description: 'Alert when API response time exceeds threshold',
        metric_query: 'api.response_time',
        condition: {
          operator: 'gt',
          aggregation: 'avg',
          time_window_minutes: 5
        },
        threshold_value: 1000,
        severity: 'high',
        channels: [
          {
            type: 'email',
            config: { email: 'alerts@urnlabs.ai' }
          }
        ],
        enabled: true,
        cooldown_minutes: 60
      };

      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/intelligence/alerts',
        payload: alertRule
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.id).toBeDefined();
      expect(body.name).toBe('High Response Time Alert');
    });

    it('should get optimization opportunities', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/intelligence/optimization'
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(Array.isArray(body)).toBe(true);
    });

    it('should get performance summary', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/intelligence/performance?time_range=24h'
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.services).toBeDefined();
      expect(body.overall_health).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should handle validation errors', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/metrics',
        payload: { invalid: 'data' }
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Validation Error');
    });

    it('should handle 404 errors', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/nonexistent'
      });

      expect(response.statusCode).toBe(404);
    });
  });
});