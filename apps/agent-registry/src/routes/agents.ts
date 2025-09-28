import { FastifyPluginAsync } from 'fastify';
import { AgentRegistryService } from '../services/agent-registry.js';
import { HealthMonitorService } from '../services/health-monitor.js';
import {
  AgentRegistrationSchema,
  AgentUpdateSchema,
  AgentDiscoveryQuerySchema,
  HeartbeatSchema,
  ValidationError,
  AgentNotFoundError
} from '../types/index.js';

interface AgentRoutesOptions {
  agentRegistryService: AgentRegistryService;
  healthMonitorService: HealthMonitorService;
}

export const agentRoutes: FastifyPluginAsync<AgentRoutesOptions> = async (fastify, options) => {
  const { agentRegistryService, healthMonitorService } = options;

  // Authentication middleware
  fastify.addHook('preHandler', async (request, reply) => {
    try {
      await request.jwtVerify();
    } catch (err) {
      reply.send(err);
    }
  });

  // Register a new agent
  fastify.post('/', {
    schema: {
      tags: ['agents'],
      summary: 'Register a new agent',
      body: AgentRegistrationSchema,
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: { type: 'object' },
            message: { type: 'string' }
          }
        },
        400: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            error: { type: 'string' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const registration = request.body as any;
      const organizationId = (request.user as any).organizationId;

      if (!organizationId) {
        return reply.code(400).send({
          success: false,
          error: 'Organization ID is required'
        });
      }

      const result = await agentRegistryService.registerAgent(registration, organizationId);
      return reply.send(result);

    } catch (error) {
      if (error instanceof ValidationError) {
        return reply.code(400).send({
          success: false,
          error: error.message
        });
      }

      fastify.log.error('Agent registration error:', error);
      return reply.code(500).send({
        success: false,
        error: 'Internal server error'
      });
    }
  });

  // Discover agents
  fastify.get('/', {
    schema: {
      tags: ['agents'],
      summary: 'Discover agents',
      querystring: {
        type: 'object',
        properties: {
          capabilities: { type: 'array', items: { type: 'string' } },
          type: { type: 'string' },
          status: { type: 'array', items: { type: 'string' } },
          healthStatus: { type: 'array', items: { type: 'string' } },
          specializations: { type: 'array', items: { type: 'string' } },
          minVersion: { type: 'string' },
          maxVersion: { type: 'string' },
          loadBalancing: { type: 'string' },
          limit: { type: 'number', minimum: 1, maximum: 100, default: 10 },
          offset: { type: 'number', minimum: 0, default: 0 }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: { type: 'array' },
            meta: { type: 'object' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const query = {
        ...request.query as any,
        organizationId: (request.user as any).organizationId
      };

      const result = await agentRegistryService.discoverAgents(query);
      return reply.send(result);

    } catch (error) {
      fastify.log.error('Agent discovery error:', error);
      return reply.code(500).send({
        success: false,
        error: 'Internal server error'
      });
    }
  });

  // Get agent by ID
  fastify.get('/:agentId', {
    schema: {
      tags: ['agents'],
      summary: 'Get agent by ID',
      params: {
        type: 'object',
        properties: {
          agentId: { type: 'string' }
        },
        required: ['agentId']
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: { type: 'object' }
          }
        },
        404: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            error: { type: 'string' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { agentId } = request.params as any;
      const result = await agentRegistryService.getAgent(agentId);
      return reply.send(result);

    } catch (error) {
      if (error instanceof AgentNotFoundError) {
        return reply.code(404).send({
          success: false,
          error: error.message
        });
      }

      fastify.log.error('Get agent error:', error);
      return reply.code(500).send({
        success: false,
        error: 'Internal server error'
      });
    }
  });

  // Update agent
  fastify.put('/:agentId', {
    schema: {
      tags: ['agents'],
      summary: 'Update agent',
      params: {
        type: 'object',
        properties: {
          agentId: { type: 'string' }
        },
        required: ['agentId']
      },
      body: AgentUpdateSchema,
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: { type: 'object' },
            message: { type: 'string' }
          }
        },
        404: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            error: { type: 'string' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { agentId } = request.params as any;
      const update = request.body as any;
      const organizationId = (request.user as any).organizationId;

      const result = await agentRegistryService.updateAgent(agentId, update, organizationId);
      return reply.send(result);

    } catch (error) {
      if (error instanceof AgentNotFoundError) {
        return reply.code(404).send({
          success: false,
          error: error.message
        });
      }

      if (error instanceof ValidationError) {
        return reply.code(400).send({
          success: false,
          error: error.message
        });
      }

      fastify.log.error('Update agent error:', error);
      return reply.code(500).send({
        success: false,
        error: 'Internal server error'
      });
    }
  });

  // Deregister agent
  fastify.delete('/:agentId', {
    schema: {
      tags: ['agents'],
      summary: 'Deregister agent',
      params: {
        type: 'object',
        properties: {
          agentId: { type: 'string' }
        },
        required: ['agentId']
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' }
          }
        },
        404: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            error: { type: 'string' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { agentId } = request.params as any;
      const organizationId = (request.user as any).organizationId;

      const result = await agentRegistryService.deregisterAgent(agentId, organizationId);
      return reply.send(result);

    } catch (error) {
      if (error instanceof AgentNotFoundError) {
        return reply.code(404).send({
          success: false,
          error: error.message
        });
      }

      fastify.log.error('Deregister agent error:', error);
      return reply.code(500).send({
        success: false,
        error: 'Internal server error'
      });
    }
  });

  // Send heartbeat
  fastify.post('/:agentId/heartbeat', {
    schema: {
      tags: ['agents'],
      summary: 'Send agent heartbeat',
      params: {
        type: 'object',
        properties: {
          agentId: { type: 'string' }
        },
        required: ['agentId']
      },
      body: {
        type: 'object',
        properties: {
          status: { type: 'string' },
          healthStatus: { type: 'string' },
          metrics: { type: 'object' },
          metadata: { type: 'object' }
        },
        required: ['status', 'healthStatus']
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { agentId } = request.params as any;
      const heartbeatData = request.body as any;

      const heartbeat = {
        agentId,
        timestamp: new Date(),
        ...heartbeatData
      };

      await healthMonitorService.processHeartbeat(heartbeat);

      return reply.send({
        success: true,
        message: 'Heartbeat processed successfully'
      });

    } catch (error) {
      fastify.log.error('Heartbeat processing error:', error);
      return reply.code(500).send({
        success: false,
        error: 'Internal server error'
      });
    }
  });

  // Get agent health
  fastify.get('/:agentId/health', {
    schema: {
      tags: ['agents'],
      summary: 'Get agent health status',
      params: {
        type: 'object',
        properties: {
          agentId: { type: 'string' }
        },
        required: ['agentId']
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: { type: 'object' }
          }
        },
        404: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            error: { type: 'string' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { agentId } = request.params as any;
      const health = await healthMonitorService.getAgentHealth(agentId);

      if (!health) {
        return reply.code(404).send({
          success: false,
          error: 'Agent health information not found'
        });
      }

      return reply.send({
        success: true,
        data: health
      });

    } catch (error) {
      fastify.log.error('Get agent health error:', error);
      return reply.code(500).send({
        success: false,
        error: 'Internal server error'
      });
    }
  });

  // Trigger health check
  fastify.post('/:agentId/health-check', {
    schema: {
      tags: ['agents'],
      summary: 'Trigger agent health check',
      params: {
        type: 'object',
        properties: {
          agentId: { type: 'string' }
        },
        required: ['agentId']
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { agentId } = request.params as any;
      await healthMonitorService.triggerHealthCheck(agentId);

      return reply.send({
        success: true,
        message: 'Health check triggered successfully'
      });

    } catch (error) {
      fastify.log.error('Trigger health check error:', error);
      return reply.code(500).send({
        success: false,
        error: 'Internal server error'
      });
    }
  });

  // Get agents by capability
  fastify.get('/by-capability/:capability', {
    schema: {
      tags: ['agents'],
      summary: 'Get agents by capability',
      params: {
        type: 'object',
        properties: {
          capability: { type: 'string' }
        },
        required: ['capability']
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: { type: 'array' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { capability } = request.params as any;
      const organizationId = (request.user as any).organizationId;

      const result = await agentRegistryService.getAgentsByCapability(capability, organizationId);
      return reply.send(result);

    } catch (error) {
      fastify.log.error('Get agents by capability error:', error);
      return reply.code(500).send({
        success: false,
        error: 'Internal server error'
      });
    }
  });
};