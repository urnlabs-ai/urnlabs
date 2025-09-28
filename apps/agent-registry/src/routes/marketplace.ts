import { FastifyPluginAsync } from 'fastify';
import { MarketplaceService } from '../services/marketplace.js';
import {
  MarketplaceSearchSchema,
  AgentInstallationSchema,
  ValidationError
} from '../types/index.js';

interface MarketplaceRoutesOptions {
  marketplaceService: MarketplaceService;
}

export const marketplaceRoutes: FastifyPluginAsync<MarketplaceRoutesOptions> = async (fastify, options) => {
  const { marketplaceService } = options;

  // Authentication middleware
  fastify.addHook('preHandler', async (request, reply) => {
    try {
      await request.jwtVerify();
    } catch (err) {
      reply.send(err);
    }
  });

  // Search marketplace
  fastify.get('/', {
    schema: {
      tags: ['marketplace'],
      summary: 'Search marketplace items',
      querystring: {
        type: 'object',
        properties: {
          query: { type: 'string' },
          type: { type: 'string', enum: ['agent', 'template', 'all'] },
          category: { type: 'string' },
          capabilities: { type: 'array', items: { type: 'string' } },
          tags: { type: 'array', items: { type: 'string' } },
          verified: { type: 'boolean' },
          minRating: { type: 'number', minimum: 0, maximum: 5 },
          sortBy: { type: 'string', enum: ['relevance', 'rating', 'downloads', 'updated', 'name'] },
          sortOrder: { type: 'string', enum: ['asc', 'desc'] },
          limit: { type: 'number', minimum: 1, maximum: 100, default: 20 },
          offset: { type: 'number', minimum: 0, default: 0 }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const query = request.query as any;
      const result = await marketplaceService.searchMarketplace(query);
      return reply.send(result);
    } catch (error) {
      fastify.log.error('Marketplace search error:', error);
      return reply.code(500).send({
        success: false,
        error: 'Internal server error'
      });
    }
  });

  // Get featured items
  fastify.get('/featured', {
    schema: {
      tags: ['marketplace'],
      summary: 'Get featured marketplace items',
      querystring: {
        type: 'object',
        properties: {
          limit: { type: 'number', minimum: 1, maximum: 50, default: 10 }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { limit } = request.query as any;
      const result = await marketplaceService.getFeaturedItems(limit);
      return reply.send(result);
    } catch (error) {
      fastify.log.error('Get featured items error:', error);
      return reply.code(500).send({
        success: false,
        error: 'Internal server error'
      });
    }
  });

  // Get marketplace item by ID
  fastify.get('/:itemId', {
    schema: {
      tags: ['marketplace'],
      summary: 'Get marketplace item by ID',
      params: {
        type: 'object',
        properties: {
          itemId: { type: 'string' }
        },
        required: ['itemId']
      }
    }
  }, async (request, reply) => {
    try {
      const { itemId } = request.params as any;
      const result = await marketplaceService.getMarketplaceItem(itemId);
      return reply.send(result);
    } catch (error) {
      fastify.log.error('Get marketplace item error:', error);
      return reply.code(500).send({
        success: false,
        error: 'Internal server error'
      });
    }
  });

  // Install/deploy agent
  fastify.post('/install', {
    schema: {
      tags: ['marketplace'],
      summary: 'Install agent from marketplace',
      body: AgentInstallationSchema
    }
  }, async (request, reply) => {
    try {
      const installation = {
        ...request.body as any,
        organizationId: (request.user as any).organizationId
      };
      
      const result = await marketplaceService.installAgent(installation);
      return reply.send(result);
    } catch (error) {
      if (error instanceof ValidationError) {
        return reply.code(400).send({
          success: false,
          error: error.message
        });
      }

      fastify.log.error('Agent installation error:', error);
      return reply.code(500).send({
        success: false,
        error: 'Internal server error'
      });
    }
  });

  // Get user deployments
  fastify.get('/deployments', {
    schema: {
      tags: ['marketplace'],
      summary: 'Get user deployments'
    }
  }, async (request, reply) => {
    try {
      const organizationId = (request.user as any).organizationId;
      const result = await marketplaceService.getDeployments(organizationId);
      return reply.send(result);
    } catch (error) {
      fastify.log.error('Get deployments error:', error);
      return reply.code(500).send({
        success: false,
        error: 'Internal server error'
      });
    }
  });
};