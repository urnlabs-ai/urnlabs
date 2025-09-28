import httpProxy from '@fastify/http-proxy';
import axios from 'axios';
import config from '../lib/config.js';
import logger from '../lib/logger.js';
import { redisManager } from '../lib/redis.js';
export class ProxyManager {
    fastify;
    healthChecks = new Map();
    constructor(fastify) {
        this.fastify = fastify;
    }
    async registerRoutes() {
        const routes = [
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
    async registerProxy(route) {
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
                    },
                },
                preHandler: async (request, reply) => {
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
            });
            logger.info({ prefix: route.prefix, target: route.target }, 'Registered proxy route');
        }
        catch (error) {
            logger.error({ error, route }, 'Failed to register proxy route');
            throw error;
        }
    }
    getServiceNameFromPrefix(prefix) {
        const serviceMap = {
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
    async startHealthChecks() {
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
    async checkServiceHealth(serviceName, service) {
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
            }
            else {
                logger.warn({
                    service: serviceName,
                    responseTime,
                    status: response.status,
                    data: response.data
                }, 'Health check failed');
            }
        }
        catch (error) {
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
    async storeHealthStatus(serviceName, status) {
        try {
            const key = `health:${serviceName}`;
            await redisManager.set(key, JSON.stringify(status), 300); // 5 minutes TTL
        }
        catch (error) {
            logger.error({ error, service: serviceName }, 'Failed to store health status');
        }
    }
    async isServiceHealthy(serviceName) {
        const service = config.services[serviceName];
        return service && service.status === 'healthy';
    }
    async getServiceStatus(serviceName) {
        try {
            const key = `health:${serviceName}`;
            const status = await redisManager.get(key);
            return status ? JSON.parse(status) : null;
        }
        catch (error) {
            logger.error({ error, service: serviceName }, 'Failed to get service status');
            return null;
        }
    }
    async getAllServiceStatuses() {
        const statuses = {};
        for (const serviceName of Object.keys(config.services)) {
            statuses[serviceName] = await this.getServiceStatus(serviceName);
        }
        return statuses;
    }
    stopHealthChecks() {
        for (const [serviceName, intervalId] of this.healthChecks.entries()) {
            clearInterval(intervalId);
            logger.info({ service: serviceName }, 'Stopped health check');
        }
        this.healthChecks.clear();
    }
}
export default ProxyManager;
//# sourceMappingURL=proxy.js.map