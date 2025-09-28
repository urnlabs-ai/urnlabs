import { Router, Request, Response } from 'express';
import { z } from 'zod';
import Redis from 'ioredis';
import winston from 'winston';
import { WAFEngine, SecurityRule } from '../services/waf-engine.js';
import { WAFMiddleware } from '../middleware/waf-middleware.js';

// API schemas
const CreateRuleSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  category: z.enum(['sql_injection', 'xss', 'lfi', 'rfi', 'command_injection', 'csrf', 'dos', 'bot', 'geo', 'custom']),
  severity: z.enum(['low', 'medium', 'high', 'critical']),
  pattern: z.string().min(1),
  action: z.enum(['allow', 'block', 'challenge', 'log']),
  enabled: z.boolean().default(true),
  conditions: z.object({
    methods: z.array(z.string()).optional(),
    paths: z.array(z.string()).optional(),
    headers: z.record(z.string()).optional(),
    countries: z.array(z.string()).optional(),
    userAgents: z.array(z.string()).optional()
  }).optional()
});

const UpdateRuleSchema = CreateRuleSchema.partial().omit({ id: true });

const WhitelistUpdateSchema = z.object({
  ips: z.array(z.string().ip()),
  reason: z.string().optional()
});

const BypassTokenUpdateSchema = z.object({
  tokens: z.array(z.string()),
  reason: z.string().optional()
});

const TestRequestSchema = z.object({
  method: z.string().default('GET'),
  path: z.string().default('/'),
  headers: z.record(z.string()).optional(),
  body: z.string().optional(),
  clientIP: z.string().ip().optional()
});

interface WAFAPIOptions {
  wafEngine: WAFEngine;
  wafMiddleware?: WAFMiddleware;
  redis: Redis;
  logger: winston.Logger;
  requireAuth?: boolean;
  adminApiKey?: string;
}

export class WAFAPIRouter {
  private router: Router;
  private wafEngine: WAFEngine;
  private wafMiddleware?: WAFMiddleware;
  private redis: Redis;
  private logger: winston.Logger;
  private requireAuth: boolean;
  private adminApiKey?: string;

  constructor(options: WAFAPIOptions) {
    this.router = Router();
    this.wafEngine = options.wafEngine;
    this.wafMiddleware = options.wafMiddleware;
    this.redis = options.redis;
    this.logger = options.logger;
    this.requireAuth = options.requireAuth !== false;
    this.adminApiKey = options.adminApiKey;

    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware(): void {
    // JSON parsing
    this.router.use(express.json({ limit: '10mb' }));

    // API Key authentication if required
    if (this.requireAuth) {
      this.router.use((req, res, next) => {
        const apiKey = req.headers['x-api-key'] as string;

        if (!apiKey || apiKey !== this.adminApiKey) {
          return res.status(401).json({
            error: 'Unauthorized',
            message: 'Valid API key required for WAF management'
          });
        }

        next();
      });
    }

    // Request logging
    this.router.use((req, res, next) => {
      this.logger.info('WAF API request', {
        method: req.method,
        path: req.path,
        ip: req.ip,
        userAgent: req.get('User-Agent')
      });
      next();
    });
  }

  private setupRoutes(): void {
    // Health check
    this.router.get('/health', this.getHealth.bind(this));

    // Statistics and monitoring
    this.router.get('/stats', this.getStatistics.bind(this));
    this.router.get('/metrics', this.getMetrics.bind(this));

    // Rule management
    this.router.get('/rules', this.getRules.bind(this));
    this.router.get('/rules/:id', this.getRule.bind(this));
    this.router.post('/rules', this.createRule.bind(this));
    this.router.put('/rules/:id', this.updateRule.bind(this));
    this.router.delete('/rules/:id', this.deleteRule.bind(this));
    this.router.post('/rules/:id/toggle', this.toggleRule.bind(this));

    // Whitelist management
    this.router.get('/whitelist', this.getWhitelist.bind(this));
    this.router.put('/whitelist', this.updateWhitelist.bind(this));

    // Bypass token management
    this.router.get('/bypass-tokens', this.getBypassTokens.bind(this));
    this.router.put('/bypass-tokens', this.updateBypassTokens.bind(this));

    // Analysis and testing
    this.router.post('/analyze', this.analyzeRequest.bind(this));
    this.router.post('/test-rule', this.testRule.bind(this));

    // Incident response
    this.router.get('/incidents', this.getIncidents.bind(this));
    this.router.get('/blocked-ips', this.getBlockedIPs.bind(this));
    this.router.post('/unblock-ip', this.unblockIP.bind(this));

    // Configuration
    this.router.get('/config', this.getConfiguration.bind(this));
    this.router.put('/config', this.updateConfiguration.bind(this));

    // Bulk operations
    this.router.post('/rules/bulk-import', this.bulkImportRules.bind(this));
    this.router.post('/rules/bulk-export', this.bulkExportRules.bind(this));
  }

  // Health and status endpoints
  private async getHealth(req: Request, res: Response): Promise<void> {
    try {
      const stats = await this.wafEngine.getStatistics();
      const redisStatus = await this.checkRedisHealth();

      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        components: {
          waf_engine: 'healthy',
          redis: redisStatus ? 'healthy' : 'unhealthy',
          rules_loaded: stats.rulesCount
        }
      });
    } catch (error) {
      this.logger.error('Health check failed', { error });
      res.status(503).json({
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error.message
      });
    }
  }

  private async getStatistics(req: Request, res: Response): Promise<void> {
    try {
      const stats = await this.wafEngine.getStatistics();
      const additionalStats = await this.getAdditionalStats();

      res.json({
        ...stats,
        ...additionalStats,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      this.logger.error('Failed to get statistics', { error });
      res.status(500).json({ error: 'Failed to retrieve statistics' });
    }
  }

  private async getMetrics(req: Request, res: Response): Promise<void> {
    try {
      // Return Prometheus-style metrics
      const stats = await this.wafEngine.getStatistics();

      const metrics = `
# HELP waf_rules_total Total number of WAF rules
# TYPE waf_rules_total gauge
waf_rules_total ${stats.rulesCount}

# HELP waf_rules_enabled Number of enabled WAF rules
# TYPE waf_rules_enabled gauge
waf_rules_enabled ${stats.enabledRulesCount}

# HELP waf_rules_owasp Number of OWASP rules
# TYPE waf_rules_owasp gauge
waf_rules_owasp ${stats.owaspRulesCount}

# HELP waf_rules_custom Number of custom rules
# TYPE waf_rules_custom gauge
waf_rules_custom ${stats.customRulesCount}
`;

      res.setHeader('Content-Type', 'text/plain');
      res.send(metrics);
    } catch (error) {
      this.logger.error('Failed to get metrics', { error });
      res.status(500).json({ error: 'Failed to retrieve metrics' });
    }
  }

  // Rule management endpoints
  private async getRules(req: Request, res: Response): Promise<void> {
    try {
      const { category, enabled, severity } = req.query;
      let rules = this.wafEngine.getAllRules();

      // Apply filters
      if (category) {
        rules = rules.filter(rule => rule.category === category);
      }
      if (enabled !== undefined) {
        const isEnabled = enabled === 'true';
        rules = rules.filter(rule => rule.enabled === isEnabled);
      }
      if (severity) {
        rules = rules.filter(rule => rule.severity === severity);
      }

      res.json({
        rules,
        count: rules.length,
        filters: { category, enabled, severity }
      });
    } catch (error) {
      this.logger.error('Failed to get rules', { error });
      res.status(500).json({ error: 'Failed to retrieve rules' });
    }
  }

  private async getRule(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const rule = this.wafEngine.getRule(id);

      if (!rule) {
        return res.status(404).json({ error: 'Rule not found' });
      }

      res.json(rule);
    } catch (error) {
      this.logger.error('Failed to get rule', { error, ruleId: req.params.id });
      res.status(500).json({ error: 'Failed to retrieve rule' });
    }
  }

  private async createRule(req: Request, res: Response): Promise<void> {
    try {
      const ruleData = CreateRuleSchema.parse(req.body);

      // Check if rule already exists
      if (this.wafEngine.getRule(ruleData.id)) {
        return res.status(409).json({ error: 'Rule with this ID already exists' });
      }

      await this.wafEngine.addCustomRule(ruleData);

      this.logger.info('WAF rule created', { ruleId: ruleData.id, category: ruleData.category });

      res.status(201).json({
        message: 'Rule created successfully',
        rule: ruleData
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Invalid rule data', details: error.errors });
      }

      this.logger.error('Failed to create rule', { error });
      res.status(500).json({ error: 'Failed to create rule' });
    }
  }

  private async updateRule(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const updates = UpdateRuleSchema.parse(req.body);

      await this.wafEngine.updateRule(id, updates);

      this.logger.info('WAF rule updated', { ruleId: id, updates });

      res.json({
        message: 'Rule updated successfully',
        rule: this.wafEngine.getRule(id)
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Invalid update data', details: error.errors });
      }

      if (error.message.includes('not found')) {
        return res.status(404).json({ error: 'Rule not found' });
      }

      this.logger.error('Failed to update rule', { error, ruleId: req.params.id });
      res.status(500).json({ error: 'Failed to update rule' });
    }
  }

  private async deleteRule(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      // Prevent deletion of OWASP rules
      if (id.startsWith('OWASP-')) {
        return res.status(403).json({ error: 'Cannot delete OWASP rules' });
      }

      await this.wafEngine.removeCustomRule(id);

      this.logger.info('WAF rule deleted', { ruleId: id });

      res.json({ message: 'Rule deleted successfully' });
    } catch (error) {
      this.logger.error('Failed to delete rule', { error, ruleId: req.params.id });
      res.status(500).json({ error: 'Failed to delete rule' });
    }
  }

  private async toggleRule(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const rule = this.wafEngine.getRule(id);

      if (!rule) {
        return res.status(404).json({ error: 'Rule not found' });
      }

      await this.wafEngine.updateRule(id, { enabled: !rule.enabled });

      this.logger.info('WAF rule toggled', { ruleId: id, enabled: !rule.enabled });

      res.json({
        message: `Rule ${!rule.enabled ? 'enabled' : 'disabled'} successfully`,
        rule: this.wafEngine.getRule(id)
      });
    } catch (error) {
      this.logger.error('Failed to toggle rule', { error, ruleId: req.params.id });
      res.status(500).json({ error: 'Failed to toggle rule' });
    }
  }

  // Whitelist management
  private async getWhitelist(req: Request, res: Response): Promise<void> {
    try {
      const whitelist = await this.redis.smembers('waf:whitelist');
      res.json({ whitelist, count: whitelist.length });
    } catch (error) {
      this.logger.error('Failed to get whitelist', { error });
      res.status(500).json({ error: 'Failed to retrieve whitelist' });
    }
  }

  private async updateWhitelist(req: Request, res: Response): Promise<void> {
    try {
      const { ips, reason } = WhitelistUpdateSchema.parse(req.body);

      await this.redis.del('waf:whitelist');
      if (ips.length > 0) {
        await this.redis.sadd('waf:whitelist', ...ips);
      }

      // Update middleware if available
      if (this.wafMiddleware) {
        this.wafMiddleware.updateWhitelist(ips);
      }

      this.logger.info('WAF whitelist updated', { count: ips.length, reason });

      res.json({
        message: 'Whitelist updated successfully',
        whitelist: ips,
        count: ips.length
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Invalid whitelist data', details: error.errors });
      }

      this.logger.error('Failed to update whitelist', { error });
      res.status(500).json({ error: 'Failed to update whitelist' });
    }
  }

  // Bypass token management
  private async getBypassTokens(req: Request, res: Response): Promise<void> {
    try {
      const tokens = await this.redis.smembers('waf:bypass_tokens');
      res.json({ tokens: tokens.map(t => `${t.substring(0, 8)}...`), count: tokens.length });
    } catch (error) {
      this.logger.error('Failed to get bypass tokens', { error });
      res.status(500).json({ error: 'Failed to retrieve bypass tokens' });
    }
  }

  private async updateBypassTokens(req: Request, res: Response): Promise<void> {
    try {
      const { tokens, reason } = BypassTokenUpdateSchema.parse(req.body);

      await this.redis.del('waf:bypass_tokens');
      if (tokens.length > 0) {
        await this.redis.sadd('waf:bypass_tokens', ...tokens);
      }

      // Update middleware if available
      if (this.wafMiddleware) {
        this.wafMiddleware.updateBypassTokens(tokens);
      }

      this.logger.info('WAF bypass tokens updated', { count: tokens.length, reason });

      res.json({
        message: 'Bypass tokens updated successfully',
        count: tokens.length
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Invalid bypass token data', details: error.errors });
      }

      this.logger.error('Failed to update bypass tokens', { error });
      res.status(500).json({ error: 'Failed to update bypass tokens' });
    }
  }

  // Analysis and testing endpoints
  private async analyzeRequest(req: Request, res: Response): Promise<void> {
    try {
      const testRequest = TestRequestSchema.parse(req.body);

      // Create mock request object
      const mockReq = {
        method: testRequest.method,
        path: testRequest.path,
        url: testRequest.path,
        headers: testRequest.headers || {},
        body: testRequest.body,
        connection: { remoteAddress: testRequest.clientIP || '127.0.0.1' },
        socket: { remoteAddress: testRequest.clientIP || '127.0.0.1' },
        get: (header: string) => testRequest.headers?.[header.toLowerCase()]
      } as any;

      const result = await this.wafEngine.analyzeRequest(mockReq);

      res.json({
        analysis: result,
        testRequest
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Invalid test request data', details: error.errors });
      }

      this.logger.error('Failed to analyze test request', { error });
      res.status(500).json({ error: 'Failed to analyze request' });
    }
  }

  private async testRule(req: Request, res: Response): Promise<void> {
    try {
      const { rule, testString } = req.body;

      if (!rule || !testString) {
        return res.status(400).json({ error: 'Rule and test string are required' });
      }

      const regex = new RegExp(rule.pattern, 'gi');
      const matches = regex.test(testString);

      res.json({
        rule: rule,
        testString,
        matches,
        explanation: matches ? 'Rule pattern matches the test string' : 'Rule pattern does not match the test string'
      });
    } catch (error) {
      this.logger.error('Failed to test rule', { error });
      res.status(500).json({ error: 'Failed to test rule' });
    }
  }

  // Incident and monitoring endpoints
  private async getIncidents(req: Request, res: Response): Promise<void> {
    try {
      const { limit = 100, offset = 0 } = req.query;

      // Get recent blocked requests from Redis
      const incidents = await this.redis.lrange('waf:incidents', offset as number, (offset as number) + (limit as number) - 1);

      const parsedIncidents = incidents.map(incident => JSON.parse(incident));

      res.json({
        incidents: parsedIncidents,
        count: parsedIncidents.length,
        pagination: { limit, offset }
      });
    } catch (error) {
      this.logger.error('Failed to get incidents', { error });
      res.status(500).json({ error: 'Failed to retrieve incidents' });
    }
  }

  private async getBlockedIPs(req: Request, res: Response): Promise<void> {
    try {
      const blockedIPs = await this.redis.smembers('waf:blocked_ips');
      res.json({ blockedIPs, count: blockedIPs.length });
    } catch (error) {
      this.logger.error('Failed to get blocked IPs', { error });
      res.status(500).json({ error: 'Failed to retrieve blocked IPs' });
    }
  }

  private async unblockIP(req: Request, res: Response): Promise<void> {
    try {
      const { ip } = req.body;

      if (!ip) {
        return res.status(400).json({ error: 'IP address is required' });
      }

      await this.redis.srem('waf:blocked_ips', ip);

      this.logger.info('IP unblocked', { ip });

      res.json({ message: 'IP unblocked successfully', ip });
    } catch (error) {
      this.logger.error('Failed to unblock IP', { error });
      res.status(500).json({ error: 'Failed to unblock IP' });
    }
  }

  // Configuration management
  private async getConfiguration(req: Request, res: Response): Promise<void> {
    try {
      const config = await this.redis.hgetall('waf:config');
      res.json(config);
    } catch (error) {
      this.logger.error('Failed to get configuration', { error });
      res.status(500).json({ error: 'Failed to retrieve configuration' });
    }
  }

  private async updateConfiguration(req: Request, res: Response): Promise<void> {
    try {
      const { config } = req.body;

      if (!config || typeof config !== 'object') {
        return res.status(400).json({ error: 'Valid configuration object is required' });
      }

      await this.redis.hmset('waf:config', config);

      this.logger.info('WAF configuration updated', { config });

      res.json({ message: 'Configuration updated successfully', config });
    } catch (error) {
      this.logger.error('Failed to update configuration', { error });
      res.status(500).json({ error: 'Failed to update configuration' });
    }
  }

  // Bulk operations
  private async bulkImportRules(req: Request, res: Response): Promise<void> {
    try {
      const { rules } = req.body;

      if (!Array.isArray(rules)) {
        return res.status(400).json({ error: 'Rules must be an array' });
      }

      const results = [];
      for (const rule of rules) {
        try {
          const validatedRule = CreateRuleSchema.parse(rule);
          await this.wafEngine.addCustomRule(validatedRule);
          results.push({ id: validatedRule.id, status: 'success' });
        } catch (error) {
          results.push({ id: rule.id || 'unknown', status: 'error', error: error.message });
        }
      }

      this.logger.info('Bulk import completed', { totalRules: rules.length, results });

      res.json({
        message: 'Bulk import completed',
        results,
        summary: {
          total: rules.length,
          successful: results.filter(r => r.status === 'success').length,
          failed: results.filter(r => r.status === 'error').length
        }
      });
    } catch (error) {
      this.logger.error('Failed to bulk import rules', { error });
      res.status(500).json({ error: 'Failed to bulk import rules' });
    }
  }

  private async bulkExportRules(req: Request, res: Response): Promise<void> {
    try {
      const { includeOwasp = false } = req.body;

      let rules = this.wafEngine.getAllRules();

      if (!includeOwasp) {
        rules = rules.filter(rule => !rule.id.startsWith('OWASP-'));
      }

      res.json({
        rules,
        exportedAt: new Date().toISOString(),
        count: rules.length,
        includeOwasp
      });
    } catch (error) {
      this.logger.error('Failed to bulk export rules', { error });
      res.status(500).json({ error: 'Failed to bulk export rules' });
    }
  }

  // Helper methods
  private async checkRedisHealth(): Promise<boolean> {
    try {
      await this.redis.ping();
      return true;
    } catch (error) {
      return false;
    }
  }

  private async getAdditionalStats(): Promise<any> {
    try {
      const whitelistCount = await this.redis.scard('waf:whitelist');
      const bypassTokenCount = await this.redis.scard('waf:bypass_tokens');
      const blockedIPCount = await this.redis.scard('waf:blocked_ips');
      const incidentCount = await this.redis.llen('waf:incidents');

      return {
        whitelistCount,
        bypassTokenCount,
        blockedIPCount,
        incidentCount
      };
    } catch (error) {
      this.logger.error('Failed to get additional stats', { error });
      return {};
    }
  }

  public getRouter(): Router {
    return this.router;
  }
}

// Factory function to create WAF API router
export function createWAFAPIRouter(options: WAFAPIOptions): Router {
  const wafAPIRouter = new WAFAPIRouter(options);
  return wafAPIRouter.getRouter();
}