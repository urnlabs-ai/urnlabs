import { FastifyRequest, FastifyReply } from 'fastify';
import { Redis } from 'ioredis';
import { WAFService } from '../services/waf/waf-service.js';
import { WAFConfig, ThreatLevel, WAFAction } from '../services/waf/types.js';
import { logger } from '../utils/logger.js';

/**
 * WAF Integration Middleware for Gateway
 * Provides enterprise-grade Web Application Firewall protection
 * with real-time threat detection and automated response
 */
export class WAFIntegrationMiddleware {
  private wafService: WAFService;
  private redis: Redis;
  private config: WAFConfig;
  private bypassTokens: Set<string> = new Set();

  constructor(redis: Redis, config: WAFConfig) {
    this.redis = redis;
    this.config = config;
    this.wafService = new WAFService(config, redis);
    this.setupBypassTokens();
    this.setupEventHandlers();
  }

  /**
   * Main WAF middleware function
   */
  public middleware() {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      const startTime = Date.now();

      try {
        // Check for bypass tokens (for legitimate automated traffic)
        if (this.shouldBypass(request)) {
          this.logBypass(request);
          return;
        }

        // Analyze request for threats
        const analysis = await this.wafService.analyzeRequest({
          method: request.method,
          url: request.url,
          headers: request.headers,
          body: request.body,
          query: request.query,
          params: request.params,
          ip: request.ip
        });

        // Process WAF decision
        await this.processWAFDecision(analysis, request, reply);

        // Log processing time
        const processingTime = Date.now() - startTime;
        if (processingTime > this.config.performance.maxProcessingTime) {
          logger.warn('WAF processing time exceeded threshold', {
            processingTime,
            threshold: this.config.performance.maxProcessingTime,
            requestId: request.id,
            url: request.url
          });
        }

      } catch (error) {
        logger.error('WAF middleware error', {
          error: error.message,
          requestId: request.id,
          url: request.url,
          ip: request.ip
        });

        // Fail-open strategy for availability
        if (this.config.failOpen) {
          logger.warn('WAF failing open due to error', {
            requestId: request.id,
            error: error.message
          });
          return;
        }

        // Fail-closed strategy for security
        reply.status(503).send({
          error: 'Security service temporarily unavailable',
          requestId: request.id
        });
        return;
      }
    };
  }

  /**
   * Process WAF analysis decision
   */
  private async processWAFDecision(
    analysis: any,
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    const { action, threatLevel, rules, score, metadata } = analysis;

    switch (action) {
      case WAFAction.BLOCK:
        await this.handleBlock(analysis, request, reply);
        break;

      case WAFAction.CHALLENGE:
        await this.handleChallenge(analysis, request, reply);
        break;

      case WAFAction.MONITOR:
        await this.handleMonitor(analysis, request, reply);
        break;

      case WAFAction.RATE_LIMIT:
        await this.handleRateLimit(analysis, request, reply);
        break;

      case WAFAction.ALLOW:
        await this.handleAllow(analysis, request, reply);
        break;

      default:
        logger.warn('Unknown WAF action', { action, requestId: request.id });
        break;
    }
  }

  /**
   * Handle blocked requests
   */
  private async handleBlock(
    analysis: any,
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    const { rules, score, metadata } = analysis;

    // Log security event
    logger.security('Request blocked by WAF', {
      requestId: request.id,
      ip: request.ip,
      userAgent: request.headers['user-agent'],
      url: request.url,
      method: request.method,
      rules: rules.map((r: any) => r.id),
      score,
      metadata
    });

    // Update threat intelligence
    await this.updateThreatIntelligence(request.ip, 'blocked', rules);

    // Send security headers
    reply.header('X-WAF-Action', 'blocked');
    reply.header('X-WAF-Request-ID', request.id);
    reply.header('X-Content-Type-Options', 'nosniff');

    // Return security response
    reply.status(403).send({
      error: 'Access denied',
      message: 'Request blocked by security policy',
      requestId: request.id,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Handle challenge requests (CAPTCHA, etc.)
   */
  private async handleChallenge(
    analysis: any,
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    const { rules, score } = analysis;

    // Check if client has valid challenge token
    const challengeToken = request.headers['x-challenge-token'] as string;
    if (challengeToken && await this.validateChallengeToken(challengeToken)) {
      logger.info('Challenge token validated', {
        requestId: request.id,
        ip: request.ip
      });
      return; // Allow request to proceed
    }

    // Generate challenge
    const challenge = await this.generateChallenge(request.ip);

    logger.info('Challenge issued to client', {
      requestId: request.id,
      ip: request.ip,
      challengeType: challenge.type,
      rules: rules.map((r: any) => r.id)
    });

    reply.header('X-WAF-Action', 'challenge');
    reply.header('X-Challenge-Type', challenge.type);

    reply.status(429).send({
      error: 'Security challenge required',
      challenge: challenge.data,
      requestId: request.id
    });
  }

  /**
   * Handle monitored requests
   */
  private async handleMonitor(
    analysis: any,
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    const { rules, score, metadata } = analysis;

    // Log for monitoring
    logger.info('Request monitored by WAF', {
      requestId: request.id,
      ip: request.ip,
      url: request.url,
      rules: rules.map((r: any) => r.id),
      score,
      metadata
    });

    // Add monitoring headers
    reply.header('X-WAF-Action', 'monitor');
    reply.header('X-WAF-Score', score.toString());

    // Update analytics
    await this.updateAnalytics('monitor', rules, score);
  }

  /**
   * Handle rate limited requests
   */
  private async handleRateLimit(
    analysis: any,
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    const { metadata } = analysis;
    const { resetTime, remaining } = metadata.rateLimit || {};

    logger.info('Request rate limited', {
      requestId: request.id,
      ip: request.ip,
      resetTime,
      remaining
    });

    reply.header('X-WAF-Action', 'rate-limit');
    reply.header('X-RateLimit-Remaining', remaining?.toString() || '0');
    reply.header('X-RateLimit-Reset', resetTime?.toString() || '');
    reply.header('Retry-After', '60');

    reply.status(429).send({
      error: 'Rate limit exceeded',
      message: 'Too many requests',
      retryAfter: 60,
      requestId: request.id
    });
  }

  /**
   * Handle allowed requests
   */
  private async handleAllow(
    analysis: any,
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    // Add security headers for allowed requests
    reply.header('X-WAF-Action', 'allow');
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('X-Frame-Options', 'DENY');
    reply.header('X-XSS-Protection', '1; mode=block');

    // Update analytics
    await this.updateAnalytics('allow', [], analysis.score);
  }

  /**
   * Check if request should bypass WAF
   */
  private shouldBypass(request: FastifyRequest): boolean {
    // Check bypass token in headers
    const bypassToken = request.headers['x-waf-bypass'] as string;
    if (bypassToken && this.bypassTokens.has(bypassToken)) {
      return true;
    }

    // Check for internal service requests
    const userAgent = request.headers['user-agent'] as string;
    if (userAgent && userAgent.includes('UrnLabs-Internal')) {
      return true;
    }

    // Check for health check endpoints
    if (request.url === '/health' || request.url === '/ping') {
      return true;
    }

    return false;
  }

  /**
   * Generate security challenge (CAPTCHA, proof of work, etc.)
   */
  private async generateChallenge(ip: string): Promise<any> {
    const challengeId = `challenge:${ip}:${Date.now()}`;
    const challenge = {
      type: 'captcha',
      id: challengeId,
      data: {
        siteKey: this.config.captcha?.siteKey,
        action: 'verify_human'
      }
    };

    // Store challenge in Redis with expiration
    await this.redis.setex(challengeId, 300, JSON.stringify(challenge));

    return challenge;
  }

  /**
   * Validate challenge token
   */
  private async validateChallengeToken(token: string): Promise<boolean> {
    try {
      const challengeData = await this.redis.get(`challenge_token:${token}`);
      if (challengeData) {
        await this.redis.del(`challenge_token:${token}`);
        return true;
      }
      return false;
    } catch (error) {
      logger.error('Challenge token validation error', { error: error.message, token });
      return false;
    }
  }

  /**
   * Update threat intelligence data
   */
  private async updateThreatIntelligence(
    ip: string,
    action: string,
    rules: any[]
  ): Promise<void> {
    try {
      const key = `threat_intel:${ip}`;
      const data = {
        lastAction: action,
        timestamp: Date.now(),
        rules: rules.map(r => r.id),
        count: 1
      };

      const existing = await this.redis.get(key);
      if (existing) {
        const parsed = JSON.parse(existing);
        data.count = parsed.count + 1;
      }

      await this.redis.setex(key, 86400, JSON.stringify(data)); // 24 hours
    } catch (error) {
      logger.error('Threat intelligence update error', { error: error.message, ip });
    }
  }

  /**
   * Update WAF analytics
   */
  private async updateAnalytics(
    action: string,
    rules: any[],
    score: number
  ): Promise<void> {
    try {
      const key = `waf_analytics:${new Date().toISOString().split('T')[0]}`;
      const analytics = {
        action,
        count: 1,
        rules: rules.length,
        avgScore: score,
        timestamp: Date.now()
      };

      await this.redis.hincrby(key, `${action}_count`, 1);
      await this.redis.hincrbyfloat(key, `${action}_score`, score);
      await this.redis.expire(key, 2592000); // 30 days
    } catch (error) {
      logger.error('Analytics update error', { error: error.message });
    }
  }

  /**
   * Setup bypass tokens for legitimate automated traffic
   */
  private setupBypassTokens(): void {
    // Load bypass tokens from environment or configuration
    const tokens = process.env.WAF_BYPASS_TOKENS?.split(',') || [];
    tokens.forEach(token => this.bypassTokens.add(token.trim()));
  }

  /**
   * Setup event handlers for WAF events
   */
  private setupEventHandlers(): void {
    this.wafService.on('threat_detected', (event) => {
      logger.security('WAF threat detected', event);
    });

    this.wafService.on('rule_triggered', (event) => {
      logger.info('WAF rule triggered', event);
    });

    this.wafService.on('performance_warning', (event) => {
      logger.warn('WAF performance warning', event);
    });
  }

  /**
   * Log bypass events
   */
  private logBypass(request: FastifyRequest): void {
    logger.info('WAF bypass granted', {
      requestId: request.id,
      ip: request.ip,
      url: request.url,
      userAgent: request.headers['user-agent']
    });
  }

  /**
   * Get WAF statistics
   */
  public async getStats(): Promise<any> {
    return this.wafService.getStats();
  }

  /**
   * Update WAF configuration
   */
  public async updateConfig(newConfig: Partial<WAFConfig>): Promise<void> {
    this.config = { ...this.config, ...newConfig };
    await this.wafService.updateConfig(this.config);
  }

  /**
   * Add custom WAF rule
   */
  public async addRule(rule: any): Promise<void> {
    await this.wafService.addRule(rule);
  }

  /**
   * Enable/disable WAF
   */
  public setEnabled(enabled: boolean): void {
    this.wafService.setEnabled(enabled);
  }
}

/**
 * Factory function to create WAF middleware
 */
export function createWAFMiddleware(redis: Redis, config: WAFConfig): WAFIntegrationMiddleware {
  return new WAFIntegrationMiddleware(redis, config);
}

/**
 * Default WAF configuration for production
 */
export const DEFAULT_WAF_CONFIG: WAFConfig = {
  enabled: true,
  failOpen: false,
  performance: {
    maxProcessingTime: 50, // 50ms max processing time
    cacheResults: true,
    cacheTTL: 300
  },
  logging: {
    level: 'info',
    includeRequestBody: false,
    sanitizeHeaders: true
  },
  rateLimit: {
    global: {
      max: 1000,
      timeWindow: 60000 // 1 minute
    },
    perIP: {
      max: 100,
      timeWindow: 60000
    }
  },
  geoBlocking: {
    enabled: true,
    blockedCountries: ['CN', 'RU'], // Example blocked countries
    allowedCountries: []
  },
  captcha: {
    enabled: true,
    siteKey: process.env.CAPTCHA_SITE_KEY,
    secretKey: process.env.CAPTCHA_SECRET_KEY,
    threshold: 0.5
  }
};