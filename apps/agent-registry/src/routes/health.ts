import { FastifyPluginAsync } from 'fastify';
import { HealthMonitorService } from '../services/health-monitor.js';

interface HealthRoutesOptions {
  healthMonitorService: HealthMonitorService;
}

export const healthRoutes: FastifyPluginAsync<HealthRoutesOptions> = async (fastify, options) => {
  const { healthMonitorService } = options;

  // Authentication middleware
  fastify.addHook('preHandler', async (request, reply) => {
    try {
      await request.jwtVerify();
    } catch (err) {
      reply.send(err);
    }
  });

  // Get organization health overview
  fastify.get('/overview', {
    schema: {
      tags: ['health'],
      summary: 'Get organization health overview'
    }
  }, async (request, reply) => {
    try {
      const organizationId = (request.user as any).organizationId;
      const result = await healthMonitorService.getOrganizationHealthOverview(organizationId);
      
      return reply.send({
        success: true,
        data: result
      });
    } catch (error) {
      fastify.log.error('Get health overview error:', error);
      return reply.code(500).send({
        success: false,
        error: 'Internal server error'
      });
    }
  });
};