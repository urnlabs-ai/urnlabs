import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import httpProxy from '@fastify/http-proxy';
import axios from 'axios';
import config from '../lib/config.js';
import logger from '../lib/logger.js';
import { ServiceEndpoint, ProxyRoute } from '../types/index.js';

export class ProxyManager {
  private fastify: FastifyInstance;
  private healthChecks: Map<string, NodeJS.Timeout> = new Map();

  constructor(fastify: FastifyInstance) {
    this.fastify = fastify;
  }

  async registerRoutes(): Promise<void> {
    const routes: ProxyRoute[] = [
      {
        prefix: '/api',
        target: config.services.api.url,
        changeOrigin: true,
        pathRewrite: { '^/api': '' }
      },
      {
        prefix: '/agents',
        target: config.services.agents.url,
        changeOrigin: true,
        pathRewrite: { '^/agents': '' }
      },
      {
        prefix: '/bridge',
        target: config.services.bridge.url,
        changeOrigin: true,
        pathRewrite: { '^/bridge': '' }
      },
      {
        prefix: '/maestro',
        target: config.services.maestro.url,
        changeOrigin: true,
        pathRewrite: { '^/maestro': '' }
      },
      {
        prefix: '/monitoring',
        target: config.services.monitoring.url,
        changeOrigin: true,
        pathRewrite: { '^/monitoring': '' }
      },
      {
        prefix: '/mcp',
        target: config.services.mcpIntegration.url,
        changeOrigin: true,
        pathRewrite: { '^/mcp': '' }
      },
      {
        prefix: '/testing',
        target: config.services.testing.url,
        changeOrigin: true,
        pathRewrite: { '^/testing': '' }
      },
      {
        prefix: '/security',
        target: config.services.security.url,
        changeOrigin: true,
        pathRewrite: { '^/security': '' }
      }
    ];

    for (const route of routes) {
      await this.registerProxy(route);
    }

    // Dashboard is served as static files
    await this.fastify.register(require('@fastify/static'), {
      root: '/app/apps/dashboard/dist',
      prefix: '/dashboard',
      decorateReply: false
    });
  }

  private async registerProxy(route: ProxyRoute): Promise<void> {
    try {
      await this.fastify.register(httpProxy, {
        upstream: route.target,
        prefix: route.prefix,
        http2: false,
        replyOptions: {
          rewriteRequestHeaders: (originalReq, headers) => {
            return {
              ...headers,
              'x-forwarded-for': originalReq.ip,
              'x-forwarded-proto': originalReq.protocol,
              'x-forwarded-host': originalReq.hostname,
              'x-gateway-version': '1.0.0'
            };
          }
        },
        preHandler: async (request: FastifyRequest, reply: FastifyReply) => {
          // Add request tracking
          const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          request.headers['x-request-id'] = requestId;
          
          logger.info({
            requestId,
            method: request.method,
            url: request.url,
            service: route.prefix,
            userAgent: request.headers['user-agent'],
            ip: request.ip
          }, 'Proxying request');

          // Check service health before proxying
          const serviceName = this.getServiceNameFromPrefix(route.prefix);
          if (serviceName && !await this.isServiceHealthy(serviceName)) {
            return reply.status(503).send({
              error: 'Service Unavailable',
              message: `${serviceName} service is currently unavailable`,
              requestId
            });
          }
        },
        onError: (reply, error) => {
          logger.error({ error, route: route.prefix }, 'Proxy error');
          reply.status(502).send({
            error: 'Bad Gateway',
            message: 'Service temporarily unavailable'
          });
        }
      });

      logger.info({ prefix: route.prefix, target: route.target }, 'Registered proxy route');
    } catch (error) {
      logger.error({ error, route }, 'Failed to register proxy route');
      throw error;
    }
  }

  private getServiceNameFromPrefix(prefix: string): string | null {
    const serviceMap: Record<string, string> = {
      '/api': 'api',
      '/agents': 'agents',
      '/bridge': 'bridge',
      '/maestro': 'maestro',
      '/monitoring': 'monitoring',
      '/mcp': 'mcpIntegration',
      '/testing': 'testing',
      '/security': 'security'
    };
    return serviceMap[prefix] || null;
  }

  async startHealthChecks(): Promise<void> {
    for (const [serviceName, service] of Object.entries(config.services)) {
      const intervalId = setInterval(async () => {
        await this.checkServiceHealth(serviceName, service);
      }, 30000); // Check every 30 seconds

      this.healthChecks.set(serviceName, intervalId);
      
      // Initial health check
      await this.checkServiceHealth(serviceName, service);
    }

    logger.info('Started health checks for all services');
  }

  private async checkServiceHealth(serviceName: string, service: ServiceEndpoint): Promise<void> {
    const startTime = Date.now();
    
    try {
      const response = await axios.get(`${service.url}${service.healthCheck}`, {
        timeout: service.timeout,
        validateStatus: (status) => status < 500
      });

      const responseTime = Date.now() - startTime;
      const isHealthy = response.status >= 200 && response.status < 400;
      
      service.status = isHealthy ? 'healthy' : 'unhealthy';
      service.lastCheck = new Date();

      // Store health status in Redis
      await this.storeHealthStatus(serviceName, {
        status: service.status,
        responseTime,
        timestamp: service.lastCheck,
        details: response.data
      });

      if (isHealthy) {
        logger.debug({ 
          service: serviceName, 
          responseTime, 
          status: response.status 
        }, 'Health check passed');
      } else {
        logger.warn({ 
          service: serviceName, 
          responseTime, 
          status: response.status,
          data: response.data
        }, 'Health check failed');
      }

    } catch (error) {
      const responseTime = Date.now() - startTime;
      service.status = 'unhealthy';
      service.lastCheck = new Date();

      await this.storeHealthStatus(serviceName, {
        status: 'unhealthy',
        responseTime,
        timestamp: service.lastCheck,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      logger.error({ 
        service: serviceName, 
        error: error instanceof Error ? error.message : error,
        responseTime
      }, 'Health check error');
    }
  }

  private async storeHealthStatus(serviceName: string, status: any): Promise<void> {
    try {
      const key = `health:${serviceName}`;
      await redisManager.set(key, JSON.stringify(status), 300); // 5 minutes TTL
    } catch (error) {
      logger.error({ error, service: serviceName }, 'Failed to store health status');
    }
  }

  async isServiceHealthy(serviceName: string): Promise<boolean> {
    const service = (config.services as any)[serviceName];
    return service && service.status === 'healthy';
  }

  async getServiceStatus(serviceName: string): Promise<any> {
    try {
      const key = `health:${serviceName}`;
      const status = await redisManager.get(key);
      return status ? JSON.parse(status) : null;
    } catch (error) {
      logger.error({ error, service: serviceName }, 'Failed to get service status');
      return null;
    }
  }

  async getAllServiceStatuses(): Promise<Record<string, any>> {
    const statuses: Record<string, any> = {};
    
    for (const serviceName of Object.keys(config.services)) {
      statuses[serviceName] = await this.getServiceStatus(serviceName);
    }

    return statuses;
  }

  stopHealthChecks(): void {
    for (const [serviceName, intervalId] of this.healthChecks.entries()) {
      clearInterval(intervalId);
      logger.info({ service: serviceName }, 'Stopped health check');
    }
    this.healthChecks.clear();
  }
}

export default ProxyManager;