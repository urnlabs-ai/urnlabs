import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { WAFService } from './waf-service.js';
import { WAFRule, WAFConfig, WAFStats, ThreatLevel, WAFRuleCategory } from './types.js';
import { logger } from '../../utils/logger.js';

interface WAFAPIRequest extends FastifyRequest {
  waf?: WAFService;
}

/**
 * WAF Management API Routes
 * Provides REST API endpoints for managing WAF rules, configuration, and monitoring
 */
export async function registerWAFAPI(fastify: FastifyInstance, wafService: WAFService) {
  const prefix = '/api/security/waf';

  // WAF Statistics
  fastify.get(`${prefix}/stats`, {
    schema: {
      description: 'Get WAF statistics and metrics',
      tags: ['WAF'],
      response: {
        200: {
          type: 'object',
          properties: {
            totalRequests: { type: 'number' },
            blockedRequests: { type: 'number' },
            allowedRequests: { type: 'number' },
            avgProcessingTime: { type: 'number' },
            errors: { type: 'number' },
            threatsByLevel: { type: 'object' },
            threatsByCategory: { type: 'object' },
            topBlockedIPs: { type: 'array' },
            topThreatRules: { type: 'array' }
          }
        }
      }
    }
  }, async (request: WAFAPIRequest, reply: FastifyReply) => {
    try {
      const stats = await wafService.getStats();
      return reply.send(stats);
    } catch (error: any) {
      logger.error({ error }, 'Failed to get WAF stats');
      return reply.status(500).send({ error: 'Failed to retrieve statistics' });
    }
  });

  // Get All Rules
  fastify.get(`${prefix}/rules`, {
    schema: {
      description: 'Get all WAF rules',
      tags: ['WAF'],
      querystring: {
        type: 'object',
        properties: {
          category: { type: 'string', enum: ['sql_injection', 'xss', 'path_traversal', 'command_injection', 'rate_limiting', 'custom'] },
          enabled: { type: 'boolean' },
          threatLevel: { type: 'string', enum: ['none', 'low', 'medium', 'high', 'critical'] }
        }
      },
      response: {
        200: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              name: { type: 'string' },
              description: { type: 'string' },
              category: { type: 'string' },
              threatLevel: { type: 'string' },
              action: { type: 'string' },
              enabled: { type: 'boolean' },
              createdAt: { type: 'string' },
              updatedAt: { type: 'string' }
            }
          }
        }
      }
    }
  }, async (request: WAFAPIRequest, reply: FastifyReply) => {
    try {
      const { category, enabled, threatLevel } = request.query as any;
      let rules = wafService.getRules();

      // Apply filters
      if (category) {
        rules = rules.filter(rule => rule.category === category);
      }
      if (enabled !== undefined) {
        rules = rules.filter(rule => rule.enabled === enabled);
      }
      if (threatLevel) {
        rules = rules.filter(rule => rule.threatLevel === threatLevel);
      }

      return reply.send(rules);
    } catch (error: any) {
      logger.error({ error }, 'Failed to get WAF rules');
      return reply.status(500).send({ error: 'Failed to retrieve rules' });
    }
  });

  // Get Rule by ID
  fastify.get(`${prefix}/rules/:ruleId`, {
    schema: {
      description: 'Get a specific WAF rule by ID',
      tags: ['WAF'],
      params: {
        type: 'object',
        properties: {
          ruleId: { type: 'string' }
        },
        required: ['ruleId']
      },
      response: {
        200: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            description: { type: 'string' },
            category: { type: 'string' },
            threatLevel: { type: 'string' },
            action: { type: 'string' },
            enabled: { type: 'boolean' }
          }
        },
        404: {
          type: 'object',
          properties: {
            error: { type: 'string' }
          }
        }
      }
    }
  }, async (request: WAFAPIRequest, reply: FastifyReply) => {
    try {
      const { ruleId } = request.params as any;
      const rules = wafService.getRules();
      const rule = rules.find(r => r.id === ruleId);

      if (!rule) {
        return reply.status(404).send({ error: 'Rule not found' });
      }

      return reply.send(rule);
    } catch (error: any) {
      logger.error({ error }, 'Failed to get WAF rule');
      return reply.status(500).send({ error: 'Failed to retrieve rule' });
    }
  });

  // Create New Rule
  fastify.post(`${prefix}/rules`, {
    schema: {
      description: 'Create a new WAF rule',
      tags: ['WAF'],
      body: {
        type: 'object',
        properties: {
          name: { type: 'string', minLength: 1 },
          description: { type: 'string', minLength: 1 },
          category: { type: 'string', enum: ['sql_injection', 'xss', 'path_traversal', 'command_injection', 'csrf', 'lfi', 'rfi', 'ssrf', 'xxe', 'rate_limiting', 'bot_detection', 'geo_blocking', 'custom'] },
          threatLevel: { type: 'string', enum: ['none', 'low', 'medium', 'high', 'critical'] },
          action: { type: 'string', enum: ['allow', 'block', 'log', 'challenge'] },
          enabled: { type: 'boolean', default: true },
          customPattern: { type: 'string' },
          patterns: { type: 'array', items: { type: 'string' } },
          methods: { type: 'array', items: { type: 'string' } },
          paths: { type: 'array', items: { type: 'string' } },
          headers: { type: 'object' },
          rateLimit: {
            type: 'object',
            properties: {
              maxRequests: { type: 'number' },
              window: { type: 'number' },
              byIP: { type: 'boolean' },
              byUserAgent: { type: 'boolean' },
              bySession: { type: 'boolean' }
            }
          },
          metadata: { type: 'object' },
          tags: { type: 'array', items: { type: 'string' } }
        },
        required: ['name', 'description', 'category', 'threatLevel', 'action']
      },
      response: {
        201: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            message: { type: 'string' }
          }
        }
      }
    }
  }, async (request: WAFAPIRequest, reply: FastifyReply) => {
    try {
      const ruleData = request.body as any;

      // Generate unique ID
      const ruleId = `custom_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      const newRule: WAFRule = {
        id: ruleId,
        name: ruleData.name,
        description: ruleData.description,
        category: ruleData.category,
        threatLevel: ruleData.threatLevel,
        action: ruleData.action,
        enabled: ruleData.enabled !== false,
        customPattern: ruleData.customPattern,
        patterns: ruleData.patterns || [],
        methods: ruleData.methods,
        paths: ruleData.paths,
        headers: ruleData.headers,
        rateLimit: ruleData.rateLimit,
        metadata: ruleData.metadata || {},
        tags: ruleData.tags || [],
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: 'api', // TODO: Get from authentication context
        version: '1.0'
      };

      await wafService.addRule(newRule);

      return reply.status(201).send({
        id: ruleId,
        message: 'Rule created successfully'
      });
    } catch (error: any) {
      logger.error({ error }, 'Failed to create WAF rule');
      return reply.status(500).send({ error: 'Failed to create rule' });
    }
  });

  // Update Rule
  fastify.put(`${prefix}/rules/:ruleId`, {
    schema: {
      description: 'Update an existing WAF rule',
      tags: ['WAF'],
      params: {
        type: 'object',
        properties: {
          ruleId: { type: 'string' }
        },
        required: ['ruleId']
      },
      body: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          description: { type: 'string' },
          threatLevel: { type: 'string', enum: ['none', 'low', 'medium', 'high', 'critical'] },
          action: { type: 'string', enum: ['allow', 'block', 'log', 'challenge'] },
          enabled: { type: 'boolean' },
          customPattern: { type: 'string' },
          patterns: { type: 'array', items: { type: 'string' } },
          methods: { type: 'array', items: { type: 'string' } },
          paths: { type: 'array', items: { type: 'string' } },
          headers: { type: 'object' },
          rateLimit: { type: 'object' },
          metadata: { type: 'object' },
          tags: { type: 'array', items: { type: 'string' } }
        }
      }
    }
  }, async (request: WAFAPIRequest, reply: FastifyReply) => {
    try {
      const { ruleId } = request.params as any;
      const updates = request.body as any;

      // Add updatedAt timestamp
      updates.updatedAt = new Date();

      await wafService.updateRule(ruleId, updates);

      return reply.send({ message: 'Rule updated successfully' });
    } catch (error: any) {
      logger.error({ error }, 'Failed to update WAF rule');

      if (error.message.includes('not found')) {
        return reply.status(404).send({ error: 'Rule not found' });
      }

      return reply.status(500).send({ error: 'Failed to update rule' });
    }
  });

  // Delete Rule
  fastify.delete(`${prefix}/rules/:ruleId`, {
    schema: {
      description: 'Delete a WAF rule',
      tags: ['WAF'],
      params: {
        type: 'object',
        properties: {
          ruleId: { type: 'string' }
        },
        required: ['ruleId']
      }
    }
  }, async (request: WAFAPIRequest, reply: FastifyReply) => {
    try {
      const { ruleId } = request.params as any;
      await wafService.removeRule(ruleId);

      return reply.send({ message: 'Rule deleted successfully' });
    } catch (error: any) {
      logger.error({ error }, 'Failed to delete WAF rule');
      return reply.status(500).send({ error: 'Failed to delete rule' });
    }
  });

  // Enable/Disable WAF
  fastify.post(`${prefix}/toggle`, {
    schema: {
      description: 'Enable or disable the WAF',
      tags: ['WAF'],
      body: {
        type: 'object',
        properties: {
          enabled: { type: 'boolean' }
        },
        required: ['enabled']
      }
    }
  }, async (request: WAFAPIRequest, reply: FastifyReply) => {
    try {
      const { enabled } = request.body as any;
      wafService.setEnabled(enabled);

      return reply.send({
        message: `WAF ${enabled ? 'enabled' : 'disabled'} successfully`,
        enabled
      });
    } catch (error: any) {
      logger.error({ error }, 'Failed to toggle WAF');
      return reply.status(500).send({ error: 'Failed to toggle WAF' });
    }
  });

  // Add IP Bypass
  fastify.post(`${prefix}/bypass`, {
    schema: {
      description: 'Add IP address to WAF bypass list',
      tags: ['WAF'],
      body: {
        type: 'object',
        properties: {
          ip: { type: 'string', format: 'ipv4' },
          duration: { type: 'number', minimum: 1, default: 3600 },
          reason: { type: 'string' }
        },
        required: ['ip']
      }
    }
  }, async (request: WAFAPIRequest, reply: FastifyReply) => {
    try {
      const { ip, duration = 3600, reason } = request.body as any;

      await wafService.addBypass(ip, duration);

      logger.info({ ip, duration, reason }, 'IP bypass added via API');

      return reply.send({
        message: 'IP bypass added successfully',
        ip,
        duration,
        expiresAt: new Date(Date.now() + duration * 1000).toISOString()
      });
    } catch (error: any) {
      logger.error({ error }, 'Failed to add IP bypass');
      return reply.status(500).send({ error: 'Failed to add IP bypass' });
    }
  });

  // Check IP Bypass Status
  fastify.get(`${prefix}/bypass/:ip`, {
    schema: {
      description: 'Check if IP is bypassed',
      tags: ['WAF'],
      params: {
        type: 'object',
        properties: {
          ip: { type: 'string' }
        },
        required: ['ip']
      }
    }
  }, async (request: WAFAPIRequest, reply: FastifyReply) => {
    try {
      const { ip } = request.params as any;
      const isBypassed = await wafService.isIPBypassed(ip);

      return reply.send({
        ip,
        bypassed: isBypassed
      });
    } catch (error: any) {
      logger.error({ error }, 'Failed to check IP bypass status');
      return reply.status(500).send({ error: 'Failed to check bypass status' });
    }
  });

  // WAF Health Check
  fastify.get(`${prefix}/health`, {
    schema: {
      description: 'WAF health check endpoint',
      tags: ['WAF'],
      response: {
        200: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            enabled: { type: 'boolean' },
            rulesCount: { type: 'number' },
            uptime: { type: 'number' },
            lastError: { type: 'string' }
          }
        }
      }
    }
  }, async (request: WAFAPIRequest, reply: FastifyReply) => {
    try {
      const rules = wafService.getRules();
      const stats = await wafService.getStats();

      return reply.send({
        status: 'healthy',
        enabled: true, // TODO: Get from WAF service
        rulesCount: rules.length,
        uptime: process.uptime(),
        version: '1.0.0',
        lastError: null // TODO: Track last error
      });
    } catch (error: any) {
      logger.error({ error }, 'WAF health check failed');
      return reply.status(500).send({
        status: 'unhealthy',
        error: error.message
      });
    }
  });

  // WAF Events (Recent threats)
  fastify.get(`${prefix}/events`, {
    schema: {
      description: 'Get recent WAF security events',
      tags: ['WAF'],
      querystring: {
        type: 'object',
        properties: {
          limit: { type: 'number', minimum: 1, maximum: 1000, default: 100 },
          threatLevel: { type: 'string', enum: ['none', 'low', 'medium', 'high', 'critical'] },
          type: { type: 'string' },
          ip: { type: 'string' },
          hours: { type: 'number', minimum: 1, maximum: 168, default: 24 }
        }
      }
    }
  }, async (request: WAFAPIRequest, reply: FastifyReply) => {
    try {
      const { limit = 100, threatLevel, type, ip, hours = 24 } = request.query as any;

      // TODO: Implement actual event retrieval from Redis
      // This is a placeholder implementation
      const events = []; // await wafService.getEvents({ limit, threatLevel, type, ip, hours });

      return reply.send({
        events,
        total: events.length,
        filters: { limit, threatLevel, type, ip, hours }
      });
    } catch (error: any) {
      logger.error({ error }, 'Failed to get WAF events');
      return reply.status(500).send({ error: 'Failed to retrieve events' });
    }
  });

  // WAF Configuration
  fastify.get(`${prefix}/config`, {
    schema: {
      description: 'Get WAF configuration',
      tags: ['WAF']
    }
  }, async (request: WAFAPIRequest, reply: FastifyReply) => {
    try {
      // TODO: Get config from WAF service
      const config = {
        enabled: true,
        failOpen: false,
        blockOnCritical: true,
        logAllRequests: false
      };

      return reply.send(config);
    } catch (error: any) {
      logger.error({ error }, 'Failed to get WAF config');
      return reply.status(500).send({ error: 'Failed to retrieve configuration' });
    }
  });

  // Update WAF Configuration
  fastify.put(`${prefix}/config`, {
    schema: {
      description: 'Update WAF configuration',
      tags: ['WAF'],
      body: {
        type: 'object',
        properties: {
          enabled: { type: 'boolean' },
          failOpen: { type: 'boolean' },
          blockOnCritical: { type: 'boolean' },
          logAllRequests: { type: 'boolean' },
          rateLimiting: {
            type: 'object',
            properties: {
              enabled: { type: 'boolean' },
              maxRequests: { type: 'number' },
              window: { type: 'number' }
            }
          },
          geoBlocking: {
            type: 'object',
            properties: {
              enabled: { type: 'boolean' },
              blockedCountries: { type: 'array', items: { type: 'string' } },
              allowedCountries: { type: 'array', items: { type: 'string' } }
            }
          },
          botProtection: {
            type: 'object',
            properties: {
              enabled: { type: 'boolean' },
              challengeUnknownBots: { type: 'boolean' },
              allowSearchEngines: { type: 'boolean' },
              blockHeadlessBrowsers: { type: 'boolean' }
            }
          }
        }
      }
    }
  }, async (request: WAFAPIRequest, reply: FastifyReply) => {
    try {
      const configUpdates = request.body as any;

      // TODO: Update WAF service configuration
      logger.info({ configUpdates }, 'WAF configuration updated via API');

      return reply.send({
        message: 'Configuration updated successfully',
        config: configUpdates
      });
    } catch (error: any) {
      logger.error({ error }, 'Failed to update WAF config');
      return reply.status(500).send({ error: 'Failed to update configuration' });
    }
  });

  // WAF Rule Testing
  fastify.post(`${prefix}/test-rule`, {
    schema: {
      description: 'Test a WAF rule against sample data',
      tags: ['WAF'],
      body: {
        type: 'object',
        properties: {
          ruleId: { type: 'string' },
          testData: {
            type: 'object',
            properties: {
              url: { type: 'string' },
              method: { type: 'string' },
              headers: { type: 'object' },
              body: { type: 'string' },
              query: { type: 'object' }
            },
            required: ['url', 'method']
          }
        },
        required: ['ruleId', 'testData']
      }
    }
  }, async (request: WAFAPIRequest, reply: FastifyReply) => {
    try {
      const { ruleId, testData } = request.body as any;

      // TODO: Implement rule testing functionality
      const testResult = {
        ruleId,
        matched: false,
        threatLevel: 'none',
        reason: 'Rule test not implemented yet'
      };

      return reply.send({
        testResult,
        testData
      });
    } catch (error: any) {
      logger.error({ error }, 'Failed to test WAF rule');
      return reply.status(500).send({ error: 'Failed to test rule' });
    }
  });

  // WAF Cleanup
  fastify.post(`${prefix}/cleanup`, {
    schema: {
      description: 'Cleanup old WAF data and logs',
      tags: ['WAF']
    }
  }, async (request: WAFAPIRequest, reply: FastifyReply) => {
    try {
      await wafService.cleanup();

      return reply.send({
        message: 'Cleanup completed successfully'
      });
    } catch (error: any) {
      logger.error({ error }, 'Failed to cleanup WAF data');
      return reply.status(500).send({ error: 'Failed to cleanup data' });
    }
  });

  logger.info(`WAF API routes registered at ${prefix}`);
}

export default registerWAFAPI;