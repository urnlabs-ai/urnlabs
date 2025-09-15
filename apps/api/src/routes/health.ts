import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { z } from 'zod';
import { testConnection, databaseHealth } from '@/lib/database.js';
import { config } from '@/lib/config.js';
import Redis from 'ioredis';

interface HealthStatus {
  status: 'healthy' | 'unhealthy' | 'degraded';
  timestamp: string;
  uptime: number;
  environment: string;
  version: string;
  checks: {
    database: {
      status: 'healthy' | 'unhealthy';
      responseTime?: number;
      error?: string;
    };
    redis?: {
      status: 'healthy' | 'unhealthy';
      responseTime?: number;
      error?: string;
    };
    external: {
      github?: {
        status: 'healthy' | 'unhealthy' | 'disabled';
        responseTime?: number;
        error?: string;
      };
      slack?: {
        status: 'healthy' | 'unhealthy' | 'disabled';
        responseTime?: number;
        error?: string;
      };
    };
  };
  metrics: {
    memoryUsage: {
      used: number;
      total: number;
      percentage: number;
    };
    cpuUsage?: number;
    activeConnections: number;
  };
}

export async function healthRoutes(
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions
) {
  // Basic health check
  fastify.get('/', {
    schema: {
      tags: ['Health'],
      summary: 'Basic health check',
      description: 'Returns basic application health status',
    },
  }, async (_request, reply) => {
    return reply.send({
      status: 'healthy',
      timestamp: new Date().toISOString(),
    });
  });

  // Detailed health check
  fastify.get('/detailed', {
    schema: {
      tags: ['Health'],
      summary: 'Detailed health check',
      description: 'Returns comprehensive application health status including dependencies',
    },
  }, async (request, reply) => {
    const startTime = Date.now();
    const health: HealthStatus = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'unknown',
      version: process.env.npm_package_version || '1.0.0',
      checks: {
        database: { status: 'healthy' },
        external: {},
      },
      metrics: {
        memoryUsage: {
          used: 0,
          total: 0,
          percentage: 0,
        },
        activeConnections: 0,
      },
    };

    // Check database connectivity and schema via shared db module
    const db = await databaseHealth();
    if (db.ready) {
      const rt = db.details.latencyMs ?? 0;
      health.checks.database = { status: 'healthy', responseTime: rt } as any;
      if (rt > 1000) health.status = 'degraded';
    } else {
      health.checks.database = { status: 'unhealthy', error: db.details.error } as any;
      health.status = 'unhealthy';
    }

    // Check Redis if configured
    if (process.env.REDIS_URL) {
      const redisStart = Date.now();
      const client = new Redis(process.env.REDIS_URL, { lazyConnect: true, connectTimeout: 1500 });
      try {
        await client.connect();
        await client.ping();
        const rt = Date.now() - redisStart;
        health.checks.redis = { status: 'healthy', responseTime: rt } as any;
        if (rt > 1000 && health.status === 'healthy') health.status = 'degraded';
      } catch (error) {
        health.checks.redis = {
          status: 'unhealthy',
          error: error instanceof Error ? error.message : 'Unknown Redis error',
        };
        if (health.status === 'healthy') {
          health.status = 'degraded';
        }
      } finally {
        try { await client.quit(); } catch { client.disconnect(); }
      }
    }

    // Check external services
    // GitHub API check
    if (process.env.GITHUB_TOKEN) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 2000);
      try {
        const githubStart = Date.now();
        const response = await fetch('https://api.github.com/rate_limit', {
          headers: {
            'Authorization': `Bearer ${process.env.GITHUB_TOKEN}`,
            'User-Agent': 'Urnlabs-API/1.0.0',
          },
          signal: controller.signal,
        });
        const githubResponseTime = Date.now() - githubStart;
        health.checks.external.github = {
          status: response.ok ? 'healthy' : 'unhealthy',
          responseTime: githubResponseTime,
        };
        if (!response.ok && health.status === 'healthy') health.status = 'degraded';
      } catch (error) {
        health.checks.external.github = {
          status: 'unhealthy',
          error: error instanceof Error ? (error.name === 'AbortError' ? 'timeout' : error.message) : 'Unknown GitHub API error',
        };
        if (health.status === 'healthy') health.status = 'degraded';
      } finally {
        clearTimeout(timeout);
      }
    } else {
      health.checks.external.github = { status: 'disabled' };
    }

    // Slack API check
    if (process.env.SLACK_BOT_TOKEN) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 2000);
      try {
        const slackStart = Date.now();
        const response = await fetch('https://slack.com/api/auth.test', {
          headers: { 'Authorization': `Bearer ${process.env.SLACK_BOT_TOKEN}` },
          signal: controller.signal,
        });
        const slackResponseTime = Date.now() - slackStart;
        health.checks.external.slack = {
          status: response.ok ? 'healthy' : 'unhealthy',
          responseTime: slackResponseTime,
        };
        if (!response.ok && health.status === 'healthy') health.status = 'degraded';
      } catch (error) {
        health.checks.external.slack = {
          status: 'unhealthy',
          error: error instanceof Error ? (error.name === 'AbortError' ? 'timeout' : error.message) : 'Unknown Slack API error',
        };
        if (health.status === 'healthy') health.status = 'degraded';
      } finally {
        clearTimeout(timeout);
      }
    } else {
      health.checks.external.slack = { status: 'disabled' };
    }

    // Memory usage metrics
    const memUsage = process.memoryUsage();
    health.metrics.memoryUsage = {
      used: memUsage.heapUsed,
      total: memUsage.heapTotal,
      percentage: Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100),
    };

    // High memory usage warning
    if (health.metrics.memoryUsage.percentage > 90) {
      health.status = health.status === 'healthy' ? 'degraded' : health.status;
    }

    // Active connections (approximation based on process stats)
    health.metrics.activeConnections = 0; // Will be updated with actual metrics

    const statusCode = health.status === 'healthy' ? 200 : 
                      health.status === 'degraded' ? 200 : 503;

    return reply.status(statusCode).send(health);
  });

  // Readiness probe (for Kubernetes)
  fastify.get('/ready', {
    schema: {
      tags: ['Health'],
      summary: 'Readiness probe',
      description: 'Kubernetes readiness probe endpoint',
    },
  }, async (_request, reply) => {
    const requireSchema = process.env.READINESS_REQUIRE_SCHEMA !== undefined
      ? /^(true|1|yes)$/i.test(String(process.env.READINESS_REQUIRE_SCHEMA))
      : config.NODE_ENV === 'development';
    const db = await databaseHealth();
    if (requireSchema) {
      const hasSchema = Boolean(db.details.schema?.users && db.details.schema?.agents && db.details.schema?.workflows);
      if (db.ready && hasSchema) {
        return reply.send({ status: 'ready', timestamp: new Date().toISOString(), latencyMs: db.details.latencyMs });
      }
      return reply.status(503).send({ status: 'not ready', error: db.details.error || 'schema not initialized', timestamp: new Date().toISOString() });
    } else {
      if (db.ready) {
        const warn = db.details.schema && (!db.details.schema.users || !db.details.schema.agents || !db.details.schema.workflows);
        return reply.send({ status: 'ready', timestamp: new Date().toISOString(), latencyMs: db.details.latencyMs, warning: warn ? 'schema not fully initialized' : undefined });
      }
      return reply.status(503).send({ status: 'not ready', error: db.details.error, timestamp: new Date().toISOString() });
    }
  });

  // Liveness probe (for Kubernetes)
  fastify.get('/live', {
    schema: {
      tags: ['Health'],
      summary: 'Liveness probe',
      description: 'Kubernetes liveness probe endpoint',
    },
  }, async (_request, reply) => {
    return reply.send({
      status: 'alive',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    });
  });
}
