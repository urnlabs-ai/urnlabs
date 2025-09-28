import { FastifyRequest, FastifyReply } from 'fastify';
import axios from 'axios';

interface PerformanceMetrics {
  endpoint: string;
  method: string;
  responseTime: number;
  statusCode: number;
  timestamp: number;
  userAgent?: string;
  ip?: string;
  cacheHit?: boolean;
}

class PerformanceMonitor {
  private metrics: PerformanceMetrics[] = [];
  private readonly MAX_METRICS = 1000;
  private monitoringEndpoint: string;

  constructor() {
    this.monitoringEndpoint = process.env.MONITORING_ENDPOINT || 'http://localhost:7006';
  }

  public middleware() {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      const startTime = Date.now();

      // Track response completion
      reply.raw.on('finish', async () => {
        const responseTime = Date.now() - startTime;

        const metric: PerformanceMetrics = {
          endpoint: request.url,
          method: request.method,
          responseTime,
          statusCode: reply.statusCode,
          timestamp: startTime,
          userAgent: request.headers['user-agent'],
          ip: request.ip,
          cacheHit: reply.getHeader('x-cache-hit') === 'true'
        };

        this.addMetric(metric);

        // Send to monitoring service if response time is concerning
        if (responseTime > 2000 || reply.statusCode >= 500) {
          this.sendToMonitoring(metric);
        }
      });
    };
  }

  private addMetric(metric: PerformanceMetrics): void {
    this.metrics.push(metric);

    // Keep only recent metrics
    if (this.metrics.length > this.MAX_METRICS) {
      this.metrics = this.metrics.slice(-this.MAX_METRICS);
    }
  }

  private async sendToMonitoring(metric: PerformanceMetrics): Promise<void> {
    try {
      await axios.post(`${this.monitoringEndpoint}/metrics/api-performance`, {
        metric,
        source: 'api-service'
      }, { timeout: 5000 });
    } catch (error) {
      // Don't log monitoring failures to avoid spam
    }
  }

  public getMetrics(limit = 100): PerformanceMetrics[] {
    return this.metrics.slice(-limit);
  }

  public getAverageResponseTime(minutes = 5): number {
    const cutoff = Date.now() - (minutes * 60 * 1000);
    const recentMetrics = this.metrics.filter(m => m.timestamp > cutoff);

    if (recentMetrics.length === 0) return 0;

    const total = recentMetrics.reduce((sum, m) => sum + m.responseTime, 0);
    return total / recentMetrics.length;
  }

  public getErrorRate(minutes = 5): number {
    const cutoff = Date.now() - (minutes * 60 * 1000);
    const recentMetrics = this.metrics.filter(m => m.timestamp > cutoff);

    if (recentMetrics.length === 0) return 0;

    const errors = recentMetrics.filter(m => m.statusCode >= 400).length;
    return (errors / recentMetrics.length) * 100;
  }

  public getThroughput(minutes = 5): number {
    const cutoff = Date.now() - (minutes * 60 * 1000);
    const recentMetrics = this.metrics.filter(m => m.timestamp > cutoff);

    return recentMetrics.length / minutes; // requests per minute
  }
}

// Singleton instance
export const performanceMonitor = new PerformanceMonitor();

// Cache middleware for performance optimization
export const cacheMiddleware = () => {
  const cache = new Map<string, { data: any; timestamp: number; ttl: number }>();

  return async (request: FastifyRequest, reply: FastifyReply) => {
    // Only cache GET requests
    if (request.method !== 'GET') return;

    // Skip cache for certain endpoints
    if (request.url.includes('/auth/') || request.url.includes('/health')) {
      return;
    }

    const cacheKey = `${request.method}:${request.url}`;
    const cached = cache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < cached.ttl) {
      reply.header('x-cache-hit', 'true');
      reply.send(cached.data);
      return;
    }

    // Hook into the reply to cache the response
    const originalSend = reply.send.bind(reply);
    reply.send = function(payload: any) {
      // Cache successful responses
      if (reply.statusCode < 400) {
        const ttl = request.url.includes('/metrics') ? 30000 : 300000; // 30s for metrics, 5min for others
        cache.set(cacheKey, {
          data: payload,
          timestamp: Date.now(),
          ttl
        });

        // Cleanup old cache entries
        if (cache.size > 500) {
          const entries = Array.from(cache.entries());
          const sorted = entries.sort(([,a], [,b]) => a.timestamp - b.timestamp);
          const toDelete = sorted.slice(0, 100);
          toDelete.forEach(([key]) => cache.delete(key));
        }
      }

      reply.header('x-cache-hit', 'false');
      return originalSend(payload);
    };
  };
};

// Rate limiting middleware
export const rateLimitMiddleware = () => {
  const requests = new Map<string, number[]>();

  return async (request: FastifyRequest, reply: FastifyReply) => {
    const identifier = request.ip;
    const now = Date.now();
    const windowMs = 60000; // 1 minute
    const maxRequests = 100; // requests per minute

    const userRequests = requests.get(identifier) || [];
    const recentRequests = userRequests.filter(timestamp => now - timestamp < windowMs);

    if (recentRequests.length >= maxRequests) {
      reply.status(429).send({
        error: 'Too Many Requests',
        message: 'Rate limit exceeded',
        retryAfter: Math.ceil(windowMs / 1000)
      });
      return;
    }

    recentRequests.push(now);
    requests.set(identifier, recentRequests);

    // Cleanup old entries
    if (requests.size > 1000) {
      const cutoff = now - windowMs * 2;
      for (const [key, timestamps] of requests.entries()) {
        const recent = timestamps.filter(t => t > cutoff);
        if (recent.length === 0) {
          requests.delete(key);
        } else {
          requests.set(key, recent);
        }
      }
    }
  };
};

// Health check enhancement
export const healthMetrics = () => {
  return {
    performance: {
      averageResponseTime: performanceMonitor.getAverageResponseTime(),
      errorRate: performanceMonitor.getErrorRate(),
      throughput: performanceMonitor.getThroughput()
    },
    timestamp: Date.now()
  };
};