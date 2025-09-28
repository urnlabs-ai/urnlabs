import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import axios from 'axios';
import { MetricsCollector } from './metrics/MetricsCollector.js';
import { PerformanceOptimizer } from './performance/PerformanceOptimizer.js';
import { MetricsWebSocketServer } from './websocket/MetricsWebSocketServer.js';
import { AlertingEngine } from './alerts/AlertingEngine.js';
import { AnalyticsEngine } from './analytics/AnalyticsEngine.js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const fastify = Fastify({
  logger: {
    level: process.env.LOG_LEVEL || 'info',
    transport: process.env.NODE_ENV === 'development' ? {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'HH:MM:ss Z',
        ignore: 'pid,hostname'
      }
    } : undefined
  },
  trustProxy: true
});

// Initialize performance monitoring components
const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
const apiEndpoint = process.env.API_ENDPOINT || 'http://localhost:7001';
const agentsEndpoint = process.env.AGENTS_ENDPOINT || 'http://localhost:7002';
const gatewayEndpoint = process.env.GATEWAY_URL || 'http://localhost:7000';
const websocketPort = parseInt(process.env.WEBSOCKET_PORT || '8080');

const metricsCollector = new MetricsCollector(redisUrl, apiEndpoint, agentsEndpoint, gatewayEndpoint);
const performanceOptimizer = new PerformanceOptimizer(redisUrl);
const alertingEngine = new AlertingEngine(redisUrl);
const analyticsEngine = new AnalyticsEngine(redisUrl);
let websocketServer: MetricsWebSocketServer;

// Initialize WebSocket server for real-time metrics
try {
  websocketServer = new MetricsWebSocketServer(websocketPort, metricsCollector, performanceOptimizer);
  console.log(`WebSocket server started on port ${websocketPort}`);
} catch (error) {
  console.error('Failed to start WebSocket server:', error);
}

// Register plugins
await fastify.register(cors, { origin: true });
await fastify.register(helmet);

// Health check
fastify.get('/health', async (request, reply) => {
  return {
    status: 'healthy',
    service: 'monitoring',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  };
});

// Dashboard route
fastify.get('/dashboard/ui', async (request, reply) => {
  try {
    const dashboardHtml = readFileSync(join(__dirname, 'dashboard.html'), 'utf-8');
    reply.type('text/html').send(dashboardHtml);
  } catch (error) {
    fastify.log.error('Failed to serve dashboard:', error);
    reply.status(500).send({ error: 'Failed to load dashboard' });
  }
});

// System metrics endpoint
fastify.get('/metrics', async (request, reply) => {
  return {
    system: {
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      cpu: process.cpuUsage()
    },
    timestamp: new Date().toISOString()
  };
});

// Enhanced Prometheus metrics endpoint
fastify.get('/metrics/prometheus', async (request, reply) => {
  try {
    const apiUrl = process.env.API_URL || 'http://localhost:3000';
    const organizationId = request.query.org || undefined;

    // Get enhanced metrics from our new collectors
    const [governanceMetrics, urnlabsMetrics] = await Promise.allSettled([
      axios.get(`${apiUrl}/governance/metrics/prometheus`, {
        params: { organizationId },
        timeout: 10000
      }),
      metricsCollector.getPrometheusMetrics()
    ]);

    // Set Prometheus content type
    reply.type('text/plain; version=0.0.4; charset=utf-8');

    // Combine all metrics
    const systemMetrics = generateSystemMetrics();
    const governanceData = governanceMetrics.status === 'fulfilled' ? governanceMetrics.value.data : '';
    const urnlabsData = urnlabsMetrics.status === 'fulfilled' ? urnlabsMetrics.value : '';

    return [systemMetrics, governanceData, urnlabsData].filter(Boolean).join('\n');
  } catch (error) {
    fastify.log.error('Failed to fetch metrics', error);

    // Return available metrics if some fail
    reply.type('text/plain; version=0.0.4; charset=utf-8');
    try {
      const urnlabsMetrics = await metricsCollector.getPrometheusMetrics();
      return `${generateSystemMetrics()}\n${urnlabsMetrics}`;
    } catch {
      return generateSystemMetrics();
    }
  }
});

// Real-time metrics endpoint
fastify.get('/metrics/realtime', async (request, reply) => {
  try {
    const metrics = metricsCollector.getCurrentMetrics();
    const performance = await performanceOptimizer.getDetailedMetrics();

    return {
      metrics,
      performance,
      websocket: websocketServer ? websocketServer.getServerStats() : null,
      timestamp: Date.now()
    };
  } catch (error) {
    fastify.log.error('Failed to get real-time metrics', error);
    return {
      error: 'Failed to retrieve real-time metrics',
      timestamp: Date.now()
    };
  }
});

// Performance optimization endpoint
fastify.post('/performance/optimize', async (request, reply) => {
  try {
    const { cacheKey, invalidatePattern } = request.body as { cacheKey?: string; invalidatePattern?: string };

    if (invalidatePattern) {
      const deletedCount = await performanceOptimizer.invalidateCache(invalidatePattern);
      return {
        success: true,
        action: 'cache_invalidation',
        deletedCount,
        timestamp: Date.now()
      };
    }

    if (cacheKey) {
      const deletedCount = await performanceOptimizer.invalidateCache(cacheKey);
      return {
        success: true,
        action: 'cache_key_deletion',
        deletedCount,
        timestamp: Date.now()
      };
    }

    return {
      success: false,
      error: 'No optimization action specified',
      timestamp: Date.now()
    };
  } catch (error) {
    fastify.log.error('Performance optimization error', error);
    return {
      success: false,
      error: 'Performance optimization failed',
      timestamp: Date.now()
    };
  }
});

// Historical metrics endpoint
fastify.get('/metrics/historical', async (request, reply) => {
  try {
    const { startTime, endTime } = request.query as { startTime?: string; endTime?: string };

    const start = startTime ? parseInt(startTime) : Date.now() - (24 * 60 * 60 * 1000); // 24 hours ago
    const end = endTime ? parseInt(endTime) : Date.now();

    const historicalData = await metricsCollector.getHistoricalMetrics(start, end);

    return {
      data: historicalData,
      timeRange: { start, end },
      count: historicalData.length,
      timestamp: Date.now()
    };
  } catch (error) {
    fastify.log.error('Failed to get historical metrics', error);
    return {
      error: 'Failed to retrieve historical metrics',
      timestamp: Date.now()
    };
  }
});

// Enhanced alerts endpoint
fastify.get('/alerts', async (request, reply) => {
  try {
    const apiUrl = process.env.API_URL || 'http://localhost:3000';
    const organizationId = request.query.org || undefined;

    // Get both governance alerts and monitoring alerts
    const [governanceAlerts, monitoringAlerts] = await Promise.allSettled([
      axios.get(`${apiUrl}/governance/alerts`, {
        params: { organizationId },
        timeout: 5000
      }),
      Promise.resolve({ data: alertingEngine.getActiveAlerts() })
    ]);

    const governance = governanceAlerts.status === 'fulfilled' ? governanceAlerts.value.data : [];
    const monitoring = monitoringAlerts.status === 'fulfilled' ? monitoringAlerts.value.data : [];

    return {
      governance: governance,
      monitoring: monitoring,
      total: governance.length + monitoring.length,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    fastify.log.error('Failed to fetch alerts', error);
    return {
      governance: [],
      monitoring: alertingEngine.getActiveAlerts(),
      total: alertingEngine.getActiveAlerts().length,
      timestamp: new Date().toISOString(),
      error: 'Failed to fetch governance alerts'
    };
  }
});

// Alert management endpoints
fastify.post('/alerts/rules', async (request, reply) => {
  try {
    const rule = request.body as any;
    alertingEngine.addAlertRule(rule);
    return { success: true, message: 'Alert rule added', ruleId: rule.id };
  } catch (error) {
    fastify.log.error('Failed to add alert rule', error);
    return { success: false, error: 'Failed to add alert rule' };
  }
});

fastify.put('/alerts/rules/:ruleId', async (request, reply) => {
  try {
    const { ruleId } = request.params as { ruleId: string };
    const updates = request.body as any;
    const success = alertingEngine.updateAlertRule(ruleId, updates);
    return { success, message: success ? 'Alert rule updated' : 'Rule not found' };
  } catch (error) {
    fastify.log.error('Failed to update alert rule', error);
    return { success: false, error: 'Failed to update alert rule' };
  }
});

fastify.delete('/alerts/rules/:ruleId', async (request, reply) => {
  try {
    const { ruleId } = request.params as { ruleId: string };
    const success = alertingEngine.removeAlertRule(ruleId);
    return { success, message: success ? 'Alert rule removed' : 'Rule not found' };
  } catch (error) {
    fastify.log.error('Failed to remove alert rule', error);
    return { success: false, error: 'Failed to remove alert rule' };
  }
});

fastify.post('/alerts/:alertId/acknowledge', async (request, reply) => {
  try {
    const { alertId } = request.params as { alertId: string };
    const { acknowledgedBy } = request.body as { acknowledgedBy: string };
    const success = alertingEngine.acknowledgeAlert(alertId, acknowledgedBy);
    return { success, message: success ? 'Alert acknowledged' : 'Alert not found' };
  } catch (error) {
    fastify.log.error('Failed to acknowledge alert', error);
    return { success: false, error: 'Failed to acknowledge alert' };
  }
});

fastify.post('/alerts/channels', async (request, reply) => {
  try {
    const channel = request.body as any;
    alertingEngine.addNotificationChannel(channel);
    return { success: true, message: 'Notification channel added', channelId: channel.id };
  } catch (error) {
    fastify.log.error('Failed to add notification channel', error);
    return { success: false, error: 'Failed to add notification channel' };
  }
});

fastify.get('/alerts/rules', async (request, reply) => {
  return { rules: alertingEngine.getAlertRules() };
});

fastify.get('/alerts/channels', async (request, reply) => {
  return { channels: alertingEngine.getNotificationChannels() };
});

fastify.get('/alerts/policies', async (request, reply) => {
  return { policies: alertingEngine.getEscalationPolicies() };
});

// Analytics endpoints
fastify.get('/analytics/insights', async (request, reply) => {
  try {
    const { timeframe = '1d', startTime, endTime } = request.query as {
      timeframe?: '1h' | '1d' | '7d' | '30d';
      startTime?: string;
      endTime?: string;
    };

    let metricsData;
    if (startTime && endTime) {
      metricsData = await metricsCollector.getHistoricalMetrics(parseInt(startTime), parseInt(endTime));
    } else {
      // Get recent data based on timeframe
      const now = Date.now();
      const timeframes = {
        '1h': 60 * 60 * 1000,
        '1d': 24 * 60 * 60 * 1000,
        '7d': 7 * 24 * 60 * 60 * 1000,
        '30d': 30 * 24 * 60 * 60 * 1000
      };
      const start = now - timeframes[timeframe];
      metricsData = await metricsCollector.getHistoricalMetrics(start, now);
    }

    const insights = await analyticsEngine.analyzeMetrics(metricsData, timeframe);
    return insights;
  } catch (error) {
    fastify.log.error('Failed to generate analytics insights', error);
    return {
      error: 'Failed to generate insights',
      timestamp: Date.now()
    };
  }
});

fastify.get('/analytics/reports', async (request, reply) => {
  try {
    const { startTime, endTime } = request.query as { startTime?: string; endTime?: string };

    const start = startTime ? parseInt(startTime) : Date.now() - (7 * 24 * 60 * 60 * 1000); // 7 days ago
    const end = endTime ? parseInt(endTime) : Date.now();

    const reports = await analyticsEngine.getHistoricalReports(start, end);

    return {
      reports,
      timeRange: { start, end },
      count: reports.length,
      timestamp: Date.now()
    };
  } catch (error) {
    fastify.log.error('Failed to get analytics reports', error);
    return {
      error: 'Failed to get analytics reports',
      timestamp: Date.now()
    };
  }
});

// Dashboard metrics endpoint
fastify.get('/dashboard', async (request, reply) => {
  try {
    const apiUrl = process.env.API_URL || 'http://localhost:3000';
    const organizationId = request.query.org || undefined;
    const includeTimeSeries = request.query.timeSeries === 'true';

    const response = await axios.get(`${apiUrl}/governance/metrics`, {
      params: {
        organizationId,
        includeTimeSeries,
        granularity: request.query.granularity || 'hour'
      },
      timeout: 15000
    });

    return {
      governance: response.data,
      system: {
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        cpu: process.cpuUsage()
      },
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    fastify.log.error('Failed to fetch dashboard metrics', error);
    return {
      governance: null,
      system: {
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        cpu: process.cpuUsage()
      },
      timestamp: new Date().toISOString(),
      error: 'Failed to fetch governance metrics'
    };
  }
});

// Generate system metrics in Prometheus format
function generateSystemMetrics(): string {
  const lines: string[] = [];
  const memory = process.memoryUsage();
  const cpu = process.cpuUsage();

  // System uptime
  lines.push('# HELP nodejs_process_uptime_seconds Process uptime in seconds');
  lines.push('# TYPE nodejs_process_uptime_seconds gauge');
  lines.push(`nodejs_process_uptime_seconds ${process.uptime()}`);

  // Memory metrics
  lines.push('# HELP nodejs_memory_usage_bytes Node.js memory usage by type');
  lines.push('# TYPE nodejs_memory_usage_bytes gauge');
  lines.push(`nodejs_memory_usage_bytes{type="rss"} ${memory.rss}`);
  lines.push(`nodejs_memory_usage_bytes{type="heapTotal"} ${memory.heapTotal}`);
  lines.push(`nodejs_memory_usage_bytes{type="heapUsed"} ${memory.heapUsed}`);
  lines.push(`nodejs_memory_usage_bytes{type="external"} ${memory.external}`);

  // CPU metrics
  lines.push('# HELP nodejs_cpu_usage_micros Node.js CPU usage in microseconds');
  lines.push('# TYPE nodejs_cpu_usage_micros counter');
  lines.push(`nodejs_cpu_usage_micros{type="user"} ${cpu.user}`);
  lines.push(`nodejs_cpu_usage_micros{type="system"} ${cpu.system}`);

  return lines.join('\n');
}

// Graceful shutdown handling
const gracefulShutdown = async () => {
  console.log('Received shutdown signal, cleaning up...');

  try {
    // Cleanup monitoring components
    if (websocketServer) {
      websocketServer.destroy();
    }

    metricsCollector.destroy();
    performanceOptimizer.destroy();
    alertingEngine.destroy();
    analyticsEngine.destroy();

    // Close Fastify server
    await fastify.close();

    console.log('Graceful shutdown completed');
    process.exit(0);
  } catch (error) {
    console.error('Error during shutdown:', error);
    process.exit(1);
  }
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// Start server
const start = async () => {
  try {
    const port = parseInt(process.env.MONITORING_PORT || '7006');
    await fastify.listen({ port, host: '0.0.0.0' });
    fastify.log.info(`Monitoring service running on port ${port}`);

    if (websocketServer) {
      fastify.log.info(`WebSocket server running on port ${websocketPort}`);
    }
  } catch (err) {
    fastify.log.error(err);
    await gracefulShutdown();
  }
};

start();