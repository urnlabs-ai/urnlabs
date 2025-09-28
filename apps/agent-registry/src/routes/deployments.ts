import { FastifyPluginAsync } from 'fastify';
import { DockerOrchestratorService } from '../services/docker-orchestrator.js';
import { MarketplaceService } from '../services/marketplace.js';
import { DeploymentError } from '../types/index.js';

interface DeploymentRoutesOptions {
  dockerOrchestratorService: DockerOrchestratorService;
  marketplaceService: MarketplaceService;
}

export const deploymentRoutes: FastifyPluginAsync<DeploymentRoutesOptions> = async (fastify, options) => {
  const { dockerOrchestratorService, marketplaceService } = options;

  // Authentication middleware
  fastify.addHook('preHandler', async (request, reply) => {
    try {
      await request.jwtVerify();
    } catch (err) {
      reply.send(err);
    }
  });

  // Get deployment by ID
  fastify.get('/:deploymentId', {
    schema: {
      tags: ['deployments'],
      summary: 'Get deployment by ID',
      params: {
        type: 'object',
        properties: {
          deploymentId: { type: 'string' }
        },
        required: ['deploymentId']
      }
    }
  }, async (request, reply) => {
    try {
      const { deploymentId } = request.params as any;
      const result = await marketplaceService.getDeployment(deploymentId);
      return reply.send(result);
    } catch (error) {
      fastify.log.error('Get deployment error:', error);
      return reply.code(500).send({
        success: false,
        error: 'Internal server error'
      });
    }
  });

  // Stop deployment
  fastify.post('/:deploymentId/stop', {
    schema: {
      tags: ['deployments'],
      summary: 'Stop deployment',
      params: {
        type: 'object',
        properties: {
          deploymentId: { type: 'string' }
        },
        required: ['deploymentId']
      }
    }
  }, async (request, reply) => {
    try {
      const { deploymentId } = request.params as any;
      const result = await dockerOrchestratorService.stopDeployment(deploymentId);
      
      // Update deployment status in marketplace
      await marketplaceService.updateDeploymentStatus(deploymentId, 'stopped');
      
      return reply.send(result);
    } catch (error) {
      if (error instanceof DeploymentError) {
        return reply.code(422).send({
          success: false,
          error: error.message
        });
      }

      fastify.log.error('Stop deployment error:', error);
      return reply.code(500).send({
        success: false,
        error: 'Internal server error'
      });
    }
  });

  // Restart deployment
  fastify.post('/:deploymentId/restart', {
    schema: {
      tags: ['deployments'],
      summary: 'Restart deployment',
      params: {
        type: 'object',
        properties: {
          deploymentId: { type: 'string' }
        },
        required: ['deploymentId']
      }
    }
  }, async (request, reply) => {
    try {
      const { deploymentId } = request.params as any;
      const result = await dockerOrchestratorService.restartDeployment(deploymentId);
      return reply.send(result);
    } catch (error) {
      if (error instanceof DeploymentError) {
        return reply.code(422).send({
          success: false,
          error: error.message
        });
      }

      fastify.log.error('Restart deployment error:', error);
      return reply.code(500).send({
        success: false,
        error: 'Internal server error'
      });
    }
  });

  // Scale deployment
  fastify.post('/:deploymentId/scale', {
    schema: {
      tags: ['deployments'],
      summary: 'Scale deployment',
      params: {
        type: 'object',
        properties: {
          deploymentId: { type: 'string' }
        },
        required: ['deploymentId']
      },
      body: {
        type: 'object',
        properties: {
          replicas: { type: 'number', minimum: 0, maximum: 10 }
        },
        required: ['replicas']
      }
    }
  }, async (request, reply) => {
    try {
      const { deploymentId } = request.params as any;
      const { replicas } = request.body as any;
      
      // Get current deployment
      const deploymentResponse = await marketplaceService.getDeployment(deploymentId);
      if (!deploymentResponse.success || !deploymentResponse.data) {
        return reply.code(404).send({
          success: false,
          error: 'Deployment not found'
        });
      }

      const result = await dockerOrchestratorService.scaleDeployment(
        deploymentId, 
        replicas, 
        deploymentResponse.data
      );
      
      return reply.send(result);
    } catch (error) {
      if (error instanceof DeploymentError) {
        return reply.code(422).send({
          success: false,
          error: error.message
        });
      }

      fastify.log.error('Scale deployment error:', error);
      return reply.code(500).send({
        success: false,
        error: 'Internal server error'
      });
    }
  });

  // Get deployment logs
  fastify.get('/:deploymentId/logs', {
    schema: {
      tags: ['deployments'],
      summary: 'Get deployment logs',
      params: {
        type: 'object',
        properties: {
          deploymentId: { type: 'string' }
        },
        required: ['deploymentId']
      },
      querystring: {
        type: 'object',
        properties: {
          lines: { type: 'number', minimum: 1, maximum: 1000, default: 100 }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { deploymentId } = request.params as any;
      const { lines } = request.query as any;
      
      const result = await dockerOrchestratorService.getContainerLogs(deploymentId, lines);
      return reply.send(result);
    } catch (error) {
      if (error instanceof DeploymentError) {
        return reply.code(422).send({
          success: false,
          error: error.message
        });
      }

      fastify.log.error('Get deployment logs error:', error);
      return reply.code(500).send({
        success: false,
        error: 'Internal server error'
      });
    }
  });

  // Get deployment statistics
  fastify.get('/:deploymentId/stats', {
    schema: {
      tags: ['deployments'],
      summary: 'Get deployment statistics',
      params: {
        type: 'object',
        properties: {
          deploymentId: { type: 'string' }
        },
        required: ['deploymentId']
      }
    }
  }, async (request, reply) => {
    try {
      const { deploymentId } = request.params as any;
      const result = await dockerOrchestratorService.getContainerStats(deploymentId);
      return reply.send(result);
    } catch (error) {
      if (error instanceof DeploymentError) {
        return reply.code(422).send({
          success: false,
          error: error.message
        });
      }

      fastify.log.error('Get deployment stats error:', error);
      return reply.code(500).send({
        success: false,
        error: 'Internal server error'
      });
    }
  });
};