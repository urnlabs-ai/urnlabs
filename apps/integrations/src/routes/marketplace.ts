import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { MarketplaceService } from '../marketplace/marketplace-service.js';
import { marketplaceLogger, logError } from '../lib/logger.js';
import { z } from 'zod';

// Request schemas
const connectorParamsSchema = z.object({
  connectorId: z.string(),
});

const instanceParamsSchema = z.object({
  instanceId: z.string(),
});

const searchQuerySchema = z.object({
  q: z.string().optional(),
  category: z.string().optional(),
  limit: z.string().transform(Number).optional().default('20'),
  offset: z.string().transform(Number).optional().default('0'),
});

const installConnectorSchema = z.object({
  name: z.string().min(1),
  config: z.record(z.any()),
  credentials: z.record(z.string()),
});

const updateConfigSchema = z.object({
  config: z.record(z.any()),
  credentials: z.record(z.string()).optional(),
});

const toggleConnectorSchema = z.object({
  enabled: z.boolean(),
});

const testConnectionSchema = z.object({
  config: z.record(z.any()),
  credentials: z.record(z.string()),
});

export async function marketplaceRoutes(fastify: FastifyInstance) {
  const marketplaceService = new MarketplaceService();

  // Get all connectors
  fastify.get('/connectors', {
    schema: {
      querystring: z.object({
        category: z.string().optional(),
      }),
      response: {
        200: {
          type: 'object',
          properties: {
            connectors: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  name: { type: 'string' },
                  description: { type: 'string' },
                  version: { type: 'string' },
                  author: { type: 'string' },
                  category: { type: 'string' },
                  icon: { type: 'string' },
                  installCount: { type: 'number' },
                  rating: { type: 'number' },
                  verified: { type: 'boolean' },
                },
              },
            },
          },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { category } = request.query as { category?: string };
      const connectors = marketplaceService.getConnectors(category);
      
      return reply.send({ connectors });
    } catch (error) {
      logError(marketplaceLogger, 'Failed to get connectors', error as Error);
      return reply.code(500).send({ error: 'Failed to get connectors' });
    }
  });

  // Search connectors
  fastify.get('/connectors/search', {
    schema: {
      querystring: searchQuerySchema,
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { q, category, limit, offset } = searchQuerySchema.parse(request.query);
      
      if (!q) {
        const connectors = marketplaceService.getConnectors(category);
        const paginatedConnectors = connectors.slice(offset, offset + limit);
        
        return reply.send({
          connectors: paginatedConnectors,
          total: connectors.length,
          limit,
          offset,
        });
      }

      const connectors = marketplaceService.searchConnectors(q, category);
      const paginatedConnectors = connectors.slice(offset, offset + limit);
      
      return reply.send({
        connectors: paginatedConnectors,
        total: connectors.length,
        limit,
        offset,
        query: q,
      });
    } catch (error) {
      logError(marketplaceLogger, 'Failed to search connectors', error as Error, { query: request.query });
      return reply.code(500).send({ error: 'Failed to search connectors' });
    }
  });

  // Get connector by ID
  fastify.get('/connectors/:connectorId', {
    schema: {
      params: connectorParamsSchema,
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { connectorId } = connectorParamsSchema.parse(request.params);
      const connector = marketplaceService.getConnector(connectorId);
      
      if (!connector) {
        return reply.code(404).send({ error: 'Connector not found' });
      }
      
      return reply.send({ connector });
    } catch (error) {
      logError(marketplaceLogger, 'Failed to get connector', error as Error, { params: request.params });
      return reply.code(500).send({ error: 'Failed to get connector' });
    }
  });

  // Install connector
  fastify.post('/connectors/:connectorId/install', {
    schema: {
      params: connectorParamsSchema,
      body: installConnectorSchema,
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { connectorId } = connectorParamsSchema.parse(request.params);
      const { name, config, credentials } = installConnectorSchema.parse(request.body);
      
      const instance = await marketplaceService.installConnector(
        connectorId,
        name,
        config,
        credentials
      );
      
      return reply.code(201).send({ instance });
    } catch (error) {
      logError(marketplaceLogger, 'Failed to install connector', error as Error, {
        params: request.params,
        body: request.body,
      });
      
      if ((error as Error).message.includes('not found')) {
        return reply.code(404).send({ error: 'Connector not found' });
      }
      
      if ((error as Error).message.includes('validation')) {
        return reply.code(400).send({ error: 'Invalid configuration', details: (error as Error).message });
      }
      
      return reply.code(500).send({ error: 'Failed to install connector' });
    }
  });

  // Test connector connection
  fastify.post('/connectors/:connectorId/test', {
    schema: {
      params: connectorParamsSchema,
      body: testConnectionSchema,
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { connectorId } = connectorParamsSchema.parse(request.params);
      const { config, credentials } = testConnectionSchema.parse(request.body);
      
      const result = await marketplaceService.testConnectorConnection(
        connectorId,
        config,
        credentials
      );
      
      if (result.success) {
        return reply.send(result);
      } else {
        return reply.code(400).send(result);
      }
    } catch (error) {
      logError(marketplaceLogger, 'Failed to test connector connection', error as Error, {
        params: request.params,
      });
      
      return reply.code(500).send({
        success: false,
        message: 'Connection test failed',
      });
    }
  });

  // Get marketplace categories
  fastify.get('/categories', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const categories = marketplaceService.getCategories();
      return reply.send({ categories });
    } catch (error) {
      logError(marketplaceLogger, 'Failed to get categories', error as Error);
      return reply.code(500).send({ error: 'Failed to get categories' });
    }
  });

  // Get installed connectors
  fastify.get('/instances', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const instances = marketplaceService.getInstalledConnectors();
      return reply.send({ instances });
    } catch (error) {
      logError(marketplaceLogger, 'Failed to get installed connectors', error as Error);
      return reply.code(500).send({ error: 'Failed to get installed connectors' });
    }
  });

  // Get connector instance by ID
  fastify.get('/instances/:instanceId', {
    schema: {
      params: instanceParamsSchema,
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { instanceId } = instanceParamsSchema.parse(request.params);
      const instance = marketplaceService.getConnectorInstance(instanceId);
      
      if (!instance) {
        return reply.code(404).send({ error: 'Connector instance not found' });
      }
      
      return reply.send({ instance });
    } catch (error) {
      logError(marketplaceLogger, 'Failed to get connector instance', error as Error, { params: request.params });
      return reply.code(500).send({ error: 'Failed to get connector instance' });
    }
  });

  // Update connector instance configuration
  fastify.put('/instances/:instanceId/config', {
    schema: {
      params: instanceParamsSchema,
      body: updateConfigSchema,
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { instanceId } = instanceParamsSchema.parse(request.params);
      const { config, credentials } = updateConfigSchema.parse(request.body);
      
      const success = await marketplaceService.updateConnectorConfig(
        instanceId,
        config,
        credentials
      );
      
      if (success) {
        return reply.send({ status: 'updated' });
      } else {
        return reply.code(400).send({ error: 'Failed to update configuration' });
      }
    } catch (error) {
      logError(marketplaceLogger, 'Failed to update connector config', error as Error, {
        params: request.params,
      });
      
      if ((error as Error).message.includes('not found')) {
        return reply.code(404).send({ error: 'Connector instance not found' });
      }
      
      return reply.code(500).send({ error: 'Failed to update configuration' });
    }
  });

  // Enable/disable connector instance
  fastify.patch('/instances/:instanceId/toggle', {
    schema: {
      params: instanceParamsSchema,
      body: toggleConnectorSchema,
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { instanceId } = instanceParamsSchema.parse(request.params);
      const { enabled } = toggleConnectorSchema.parse(request.body);
      
      const success = await marketplaceService.toggleConnector(instanceId, enabled);
      
      if (success) {
        return reply.send({ status: enabled ? 'enabled' : 'disabled' });
      } else {
        return reply.code(400).send({ error: 'Failed to toggle connector' });
      }
    } catch (error) {
      logError(marketplaceLogger, 'Failed to toggle connector', error as Error, {
        params: request.params,
        body: request.body,
      });
      
      if ((error as Error).message.includes('not found')) {
        return reply.code(404).send({ error: 'Connector instance not found' });
      }
      
      return reply.code(500).send({ error: 'Failed to toggle connector' });
    }
  });

  // Uninstall connector instance
  fastify.delete('/instances/:instanceId', {
    schema: {
      params: instanceParamsSchema,
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { instanceId } = instanceParamsSchema.parse(request.params);
      
      const success = await marketplaceService.uninstallConnector(instanceId);
      
      if (success) {
        return reply.send({ status: 'uninstalled' });
      } else {
        return reply.code(400).send({ error: 'Failed to uninstall connector' });
      }
    } catch (error) {
      logError(marketplaceLogger, 'Failed to uninstall connector', error as Error, { params: request.params });
      
      if ((error as Error).message.includes('not found')) {
        return reply.code(404).send({ error: 'Connector instance not found' });
      }
      
      return reply.code(500).send({ error: 'Failed to uninstall connector' });
    }
  });

  // Health check
  fastify.get('/health/marketplace', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const health = await marketplaceService.healthCheck();
      
      if (health.status === 'ok') {
        return reply.send(health);
      } else {
        return reply.code(503).send(health);
      }
    } catch (error) {
      logError(marketplaceLogger, 'Marketplace health check failed', error as Error);
      return reply.code(503).send({
        status: 'error',
        details: 'Health check failed',
      });
    }
  });

  marketplaceLogger.info('Marketplace routes registered');
}