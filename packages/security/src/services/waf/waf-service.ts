import { EventEmitter } from 'events';
import { Redis } from 'ioredis';
import { createHash } from 'crypto';
import { UAParser } from 'ua-parser-js';
import * as geoip from 'geoip-lite';
import { WAFConfig, WAFRule, ThreatLevel, RequestAnalysis, WAFStats, WAFEvent } from './types.js';
import { OWASP_RULES } from './rules/owasp-rules.js';
import { API_PROTECTION_RULES } from './rules/api-rules.js';
import { RATE_LIMITING_RULES } from './rules/rate-limiting.js';
import { logger } from '../../utils/logger.js';

interface FastifyRequest {
  method: string;
  url: string;
  headers: Record<string, string | string[]>;
  body?: any;
  query?: Record<string, any>;
  params?: Record<string, any>;
  ip: string;
}

interface FastifyReply {
  status: (code: number) => FastifyReply;
  send: (payload: any) => FastifyReply;
  header: (name: string, value: string) => FastifyReply;
}

/**
 * Enterprise-grade Web Application Firewall Service
 * Provides real-time threat detection, OWASP Top 10 protection,
 * and comprehensive security monitoring
 */
export class WAFService extends EventEmitter {
  private config: WAFConfig;
  private redis: Redis;
  private rules: Map<string, WAFRule> = new Map();
  private stats: WAFStats;
  private uaParser: UAParser;
  private isEnabled: boolean = true;

  constructor(config: WAFConfig, redis: Redis) {
    super();
    this.config = config;
    this.redis = redis;
    this.uaParser = new UAParser();
    this.stats = this.initializeStats();

    this.loadDefaultRules();
    this.setupEventHandlers();

    logger.info('WAF Service initialized with comprehensive protection');
  }

  /**
   * Main WAF middleware for analyzing incoming requests
   */
  async analyzeRequest(request: FastifyRequest, reply: FastifyReply): Promise<RequestAnalysis> {
    if (!this.isEnabled) {
      return { allowed: true, threatLevel: 'none', ruleMatches: [] };
    }

    const startTime = Date.now();
    const requestId = this.generateRequestId(request);

    try {
      // Increment request counter
      await this.incrementStat('totalRequests');

      // Create request fingerprint
      const fingerprint = this.createRequestFingerprint(request);

      // Parse user agent
      const userAgent = this.uaParser.setUA(request.headers['user-agent'] as string || '').getResult();

      // Get geolocation info
      const geo = geoip.lookup(request.ip);

      // Rate limiting check
      const rateLimitResult = await this.checkRateLimit(request, fingerprint);
      if (!rateLimitResult.allowed) {
        await this.logThreatEvent('rate_limit_exceeded', request, rateLimitResult);
        await this.incrementStat('blockedRequests');
        return {
          allowed: false,
          threatLevel: 'high',
          reason: 'Rate limit exceeded',
          ruleMatches: [rateLimitResult.rule],
          action: 'block'
        };
      }

      // Run through WAF rules
      const analysis = await this.performThreatAnalysis(request, {
        fingerprint,
        userAgent,
        geo,
        requestId
      });

      // Log metrics
      const processingTime = Date.now() - startTime;
      await this.updatePerformanceMetrics(processingTime);

      // Handle result based on threat level
      if (!analysis.allowed) {
        await this.handleBlockedRequest(request, analysis);
        await this.incrementStat('blockedRequests');
      } else {
        await this.incrementStat('allowedRequests');
      }

      return analysis;

    } catch (error: any) {
      logger.error({ error, requestId }, 'WAF analysis failed');
      await this.incrementStat('errors');

      // Fail open by default (configurable)
      return {
        allowed: this.config.failOpen !== false,
        threatLevel: 'unknown',
        ruleMatches: [],
        error: error.message
      };
    }
  }

  /**
   * Perform comprehensive threat analysis
   */
  private async performThreatAnalysis(
    request: FastifyRequest,
    context: {
      fingerprint: string;
      userAgent: UAParser.IResult;
      geo: geoip.Lookup | null;
      requestId: string;
    }
  ): Promise<RequestAnalysis> {
    const ruleMatches: string[] = [];
    let maxThreatLevel: ThreatLevel = 'none';
    let blockingRule: WAFRule | null = null;

    // Check geolocation restrictions
    if (context.geo && this.config.geoBlocking?.enabled) {
      const geoResult = this.checkGeoRestrictions(context.geo);
      if (!geoResult.allowed) {
        return {
          allowed: false,
          threatLevel: 'high',
          reason: `Blocked country: ${context.geo.country}`,
          ruleMatches: ['geo_blocking'],
          action: 'block'
        };
      }
    }

    // Check bot detection
    const botResult = this.detectBot(request, context.userAgent);
    if (botResult.isBot && !botResult.isAllowed) {
      return {
        allowed: false,
        threatLevel: 'medium',
        reason: 'Malicious bot detected',
        ruleMatches: ['bot_detection'],
        action: 'block'
      };
    }

    // Run through all active rules
    for (const [ruleId, rule] of this.rules) {
      if (!rule.enabled) continue;

      const match = await this.evaluateRule(rule, request, context);
      if (match.matched) {
        ruleMatches.push(ruleId);

        if (this.compareThreatLevel(match.threatLevel, maxThreatLevel) > 0) {
          maxThreatLevel = match.threatLevel;
        }

        if (rule.action === 'block') {
          blockingRule = rule;
          break; // Stop on first blocking rule
        }
      }
    }

    // Determine final action
    const shouldBlock = blockingRule !== null ||
                       (maxThreatLevel === 'critical' && this.config.blockOnCritical);

    return {
      allowed: !shouldBlock,
      threatLevel: maxThreatLevel,
      ruleMatches,
      reason: blockingRule?.description || `Threat level: ${maxThreatLevel}`,
      action: shouldBlock ? 'block' : 'allow'
    };
  }

  /**
   * Evaluate a specific WAF rule against the request
   */
  private async evaluateRule(
    rule: WAFRule,
    request: FastifyRequest,
    context: any
  ): Promise<{ matched: boolean; threatLevel: ThreatLevel }> {
    try {
      // SQL Injection detection
      if (rule.category === 'sql_injection') {
        return this.detectSQLInjection(request, rule);
      }

      // XSS detection
      if (rule.category === 'xss') {
        return this.detectXSS(request, rule);
      }

      // Path traversal detection
      if (rule.category === 'path_traversal') {
        return this.detectPathTraversal(request, rule);
      }

      // Command injection detection
      if (rule.category === 'command_injection') {
        return this.detectCommandInjection(request, rule);
      }

      // Custom rule evaluation
      if (rule.customPattern) {
        return this.evaluateCustomPattern(request, rule);
      }

      return { matched: false, threatLevel: 'none' };

    } catch (error: any) {
      logger.error({ error, ruleId: rule.id }, 'Rule evaluation failed');
      return { matched: false, threatLevel: 'none' };
    }
  }

  /**
   * SQL Injection detection
   */
  private detectSQLInjection(request: FastifyRequest, rule: WAFRule): { matched: boolean; threatLevel: ThreatLevel } {
    const sqlPatterns = [
      /union\s+(all\s+)?select/i,
      /select\s+.*\s+from\s+/i,
      /insert\s+into\s+/i,
      /delete\s+from\s+/i,
      /update\s+.*\s+set\s+/i,
      /drop\s+(table|database)/i,
      /exec\s*\(/i,
      /script\s*\>/i,
      /1=1|1=2/,
      /or\s+1=1/i,
      /and\s+1=1/i,
      /'\s*or\s*'1'='1/i,
      /'\s*or\s*1=1\s*--/i,
      /benchmark\s*\(/i,
      /sleep\s*\(/i,
      /waitfor\s+delay/i
    ];

    const testStrings = [
      request.url,
      JSON.stringify(request.query || {}),
      JSON.stringify(request.body || {}),
      ...(Object.values(request.headers) as string[])
    ];

    for (const testStr of testStrings) {
      if (typeof testStr === 'string') {
        for (const pattern of sqlPatterns) {
          if (pattern.test(testStr)) {
            return { matched: true, threatLevel: 'high' };
          }
        }
      }
    }

    return { matched: false, threatLevel: 'none' };
  }

  /**
   * XSS detection
   */
  private detectXSS(request: FastifyRequest, rule: WAFRule): { matched: boolean; threatLevel: ThreatLevel } {
    const xssPatterns = [
      /<script[^>]*>.*?<\/script>/gi,
      /<iframe[^>]*>.*?<\/iframe>/gi,
      /<object[^>]*>.*?<\/object>/gi,
      /<embed[^>]*>/gi,
      /<link[^>]*>/gi,
      /javascript:/gi,
      /vbscript:/gi,
      /on\w+\s*=/gi,
      /expression\s*\(/gi,
      /<img[^>]*src[^>]*>/gi,
      /document\.cookie/gi,
      /document\.write/gi,
      /eval\s*\(/gi,
      /setTimeout\s*\(/gi,
      /setInterval\s*\(/gi
    ];

    const testStrings = [
      request.url,
      JSON.stringify(request.query || {}),
      JSON.stringify(request.body || {}),
      ...(Object.values(request.headers) as string[])
    ];

    for (const testStr of testStrings) {
      if (typeof testStr === 'string') {
        const decoded = decodeURIComponent(testStr).toLowerCase();
        for (const pattern of xssPatterns) {
          if (pattern.test(decoded)) {
            return { matched: true, threatLevel: 'high' };
          }
        }
      }
    }

    return { matched: false, threatLevel: 'none' };
  }

  /**
   * Path traversal detection
   */
  private detectPathTraversal(request: FastifyRequest, rule: WAFRule): { matched: boolean; threatLevel: ThreatLevel } {
    const pathTraversalPatterns = [
      /\.\.\//g,
      /\.\.\\\\g,
      /\.\.\%2f/gi,
      /\.\.\%2F/gi,
      /\.\.\%5c/gi,
      /\.\.\%5C/gi,
      /%2e%2e%2f/gi,
      /%2e%2e%5c/gi,
      /\/etc\/passwd/gi,
      /\/etc\/shadow/gi,
      /\/proc\/version/gi,
      /\/windows\/system32/gi,
      /\/boot\.ini/gi
    ];

    const testString = request.url + JSON.stringify(request.query || {});

    for (const pattern of pathTraversalPatterns) {
      if (pattern.test(testString)) {
        return { matched: true, threatLevel: 'high' };
      }
    }

    return { matched: false, threatLevel: 'none' };
  }

  /**
   * Command injection detection
   */
  private detectCommandInjection(request: FastifyRequest, rule: WAFRule): { matched: boolean; threatLevel: ThreatLevel } {
    const commandPatterns = [
      /[;&|`$(){}[\]]/,
      /\|\s*\w+/,
      /;\s*\w+/,
      /&&\s*\w+/,
      /\|\|\s*\w+/,
      /`.*`/,
      /\$\(.*\)/,
      /\${.*}/,
      /nc\s+-l/i,
      /curl\s+/i,
      /wget\s+/i,
      /bash\s+/i,
      /sh\s+/i,
      /cmd\s+/i,
      /powershell\s+/i,
      /rm\s+-rf/i,
      /del\s+/i
    ];

    const testStrings = [
      request.url,
      JSON.stringify(request.query || {}),
      JSON.stringify(request.body || {}),
      ...(Object.values(request.headers) as string[])
    ];

    for (const testStr of testStrings) {
      if (typeof testStr === 'string') {
        for (const pattern of commandPatterns) {
          if (pattern.test(testStr)) {
            return { matched: true, threatLevel: 'high' };
          }
        }
      }
    }

    return { matched: false, threatLevel: 'none' };
  }

  /**
   * Evaluate custom pattern rules
   */
  private evaluateCustomPattern(request: FastifyRequest, rule: WAFRule): { matched: boolean; threatLevel: ThreatLevel } {
    if (!rule.customPattern) {
      return { matched: false, threatLevel: 'none' };
    }

    const pattern = new RegExp(rule.customPattern, 'gi');
    const testString = request.url + JSON.stringify(request.query || {}) + JSON.stringify(request.body || {});

    return {
      matched: pattern.test(testString),
      threatLevel: rule.threatLevel || 'medium'
    };
  }

  /**
   * Check rate limiting
   */
  private async checkRateLimit(request: FastifyRequest, fingerprint: string): Promise<{ allowed: boolean; rule?: string }> {
    const rateLimitKey = `waf:rate_limit:${fingerprint}`;
    const windowKey = `waf:rate_window:${fingerprint}`;

    try {
      const requests = await this.redis.incr(rateLimitKey);

      if (requests === 1) {
        await this.redis.expire(rateLimitKey, this.config.rateLimiting.window);
        await this.redis.expire(windowKey, this.config.rateLimiting.window);
      }

      if (requests > this.config.rateLimiting.maxRequests) {
        await this.redis.setex(`waf:blocked:${fingerprint}`, 300, Date.now().toString());
        return { allowed: false, rule: 'rate_limit_exceeded' };
      }

      return { allowed: true };
    } catch (error: any) {
      logger.error({ error }, 'Rate limit check failed');
      return { allowed: true }; // Fail open
    }
  }

  /**
   * Check geographic restrictions
   */
  private checkGeoRestrictions(geo: geoip.Lookup): { allowed: boolean } {
    if (!this.config.geoBlocking?.enabled) {
      return { allowed: true };
    }

    const { blockedCountries = [], allowedCountries = [] } = this.config.geoBlocking;

    // If allowlist is specified, only allow those countries
    if (allowedCountries.length > 0) {
      return { allowed: allowedCountries.includes(geo.country) };
    }

    // Otherwise, block specific countries
    return { allowed: !blockedCountries.includes(geo.country) };
  }

  /**
   * Bot detection
   */
  private detectBot(request: FastifyRequest, userAgent: UAParser.IResult): { isBot: boolean; isAllowed: boolean } {
    const ua = request.headers['user-agent'] as string || '';

    // Known good bots
    const allowedBots = [
      'googlebot',
      'bingbot',
      'slurp', // Yahoo
      'duckduckbot',
      'facebookexternalhit',
      'twitterbot',
      'linkedinbot'
    ];

    // Suspicious bot patterns
    const maliciousBotPatterns = [
      /bot|crawler|spider|scraper/i,
      /headless|phantom|selenium/i,
      /curl|wget|python|java/i,
      /^$/  // Empty user agent
    ];

    const isKnownGoodBot = allowedBots.some(bot => ua.toLowerCase().includes(bot));

    if (isKnownGoodBot) {
      return { isBot: true, isAllowed: true };
    }

    const isSuspiciousBot = maliciousBotPatterns.some(pattern => pattern.test(ua));

    return {
      isBot: isSuspiciousBot,
      isAllowed: false
    };
  }

  /**
   * Create request fingerprint for tracking
   */
  private createRequestFingerprint(request: FastifyRequest): string {
    const fingerprint = `${request.ip}-${request.headers['user-agent']}-${request.headers['accept-language']}`;
    return createHash('sha256').update(fingerprint).digest('hex').substring(0, 32);
  }

  /**
   * Generate unique request ID
   */
  private generateRequestId(request: FastifyRequest): string {
    return createHash('md5')
      .update(`${request.ip}-${request.method}-${request.url}-${Date.now()}`)
      .digest('hex');
  }

  /**
   * Handle blocked requests
   */
  private async handleBlockedRequest(request: FastifyRequest, analysis: RequestAnalysis): Promise<void> {
    const event: WAFEvent = {
      id: this.generateRequestId(request),
      timestamp: new Date(),
      type: 'threat_blocked',
      ip: request.ip,
      url: request.url,
      method: request.method,
      threatLevel: analysis.threatLevel,
      ruleMatches: analysis.ruleMatches,
      reason: analysis.reason || 'Security threat detected',
      userAgent: request.headers['user-agent'] as string || 'unknown'
    };

    // Store event for analysis
    await this.storeThreatEvent(event);

    // Emit event for real-time monitoring
    this.emit('threatBlocked', event);

    logger.warn({
      event,
      analysis
    }, 'WAF blocked malicious request');
  }

  /**
   * Log threat events
   */
  private async logThreatEvent(type: string, request: FastifyRequest, details: any): Promise<void> {
    const event: WAFEvent = {
      id: this.generateRequestId(request),
      timestamp: new Date(),
      type,
      ip: request.ip,
      url: request.url,
      method: request.method,
      threatLevel: details.threatLevel || 'medium',
      ruleMatches: details.ruleMatches || [],
      reason: details.reason || type,
      userAgent: request.headers['user-agent'] as string || 'unknown'
    };

    await this.storeThreatEvent(event);
    this.emit('threatDetected', event);
  }

  /**
   * Store threat event in Redis
   */
  private async storeThreatEvent(event: WAFEvent): Promise<void> {
    try {
      const key = `waf:events:${event.timestamp.toISOString().split('T')[0]}`;
      await this.redis.lpush(key, JSON.stringify(event));
      await this.redis.expire(key, 86400 * 30); // Keep for 30 days
    } catch (error: any) {
      logger.error({ error }, 'Failed to store threat event');
    }
  }

  /**
   * Load default protection rules
   */
  private loadDefaultRules(): void {
    // Load OWASP rules
    OWASP_RULES.forEach(rule => {
      this.rules.set(rule.id, rule);
    });

    // Load API protection rules
    API_PROTECTION_RULES.forEach(rule => {
      this.rules.set(rule.id, rule);
    });

    // Load rate limiting rules
    RATE_LIMITING_RULES.forEach(rule => {
      this.rules.set(rule.id, rule);
    });

    logger.info(`Loaded ${this.rules.size} WAF protection rules`);
  }

  /**
   * Add custom rule
   */
  async addRule(rule: WAFRule): Promise<void> {
    this.rules.set(rule.id, rule);
    await this.persistRule(rule);
    logger.info({ ruleId: rule.id }, 'Added custom WAF rule');
  }

  /**
   * Remove rule
   */
  async removeRule(ruleId: string): Promise<void> {
    this.rules.delete(ruleId);
    await this.redis.hdel('waf:custom_rules', ruleId);
    logger.info({ ruleId }, 'Removed WAF rule');
  }

  /**
   * Update rule
   */
  async updateRule(ruleId: string, updates: Partial<WAFRule>): Promise<void> {
    const rule = this.rules.get(ruleId);
    if (!rule) {
      throw new Error(`Rule ${ruleId} not found`);
    }

    const updatedRule = { ...rule, ...updates };
    this.rules.set(ruleId, updatedRule);
    await this.persistRule(updatedRule);
    logger.info({ ruleId }, 'Updated WAF rule');
  }

  /**
   * Get all rules
   */
  getRules(): WAFRule[] {
    return Array.from(this.rules.values());
  }

  /**
   * Get WAF statistics
   */
  async getStats(): Promise<WAFStats> {
    const stats = await this.redis.hgetall('waf:stats');
    return {
      ...this.stats,
      ...Object.fromEntries(
        Object.entries(stats).map(([k, v]) => [k, parseInt(v) || 0])
      )
    };
  }

  /**
   * Enable/disable WAF
   */
  setEnabled(enabled: boolean): void {
    this.isEnabled = enabled;
    logger.info({ enabled }, 'WAF enabled state changed');
  }

  /**
   * Bypass WAF for specific IPs
   */
  async addBypass(ip: string, duration: number = 3600): Promise<void> {
    await this.redis.setex(`waf:bypass:${ip}`, duration, Date.now().toString());
    logger.info({ ip, duration }, 'Added WAF bypass');
  }

  /**
   * Check if IP is bypassed
   */
  async isIPBypassed(ip: string): Promise<boolean> {
    const exists = await this.redis.exists(`waf:bypass:${ip}`);
    return exists === 1;
  }

  /**
   * Cleanup old events and stats
   */
  async cleanup(): Promise<void> {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Cleanup old events
    const keys = await this.redis.keys('waf:events:*');
    for (const key of keys) {
      const date = key.split(':')[2];
      if (new Date(date) < thirtyDaysAgo) {
        await this.redis.del(key);
      }
    }

    logger.info('WAF cleanup completed');
  }

  /**
   * Private helper methods
   */
  private initializeStats(): WAFStats {
    return {
      totalRequests: 0,
      blockedRequests: 0,
      allowedRequests: 0,
      avgProcessingTime: 0,
      errors: 0
    };
  }

  private setupEventHandlers(): void {
    this.on('threatBlocked', (event: WAFEvent) => {
      logger.warn({ event }, 'Threat blocked by WAF');
    });

    this.on('threatDetected', (event: WAFEvent) => {
      logger.info({ event }, 'Threat detected by WAF');
    });
  }

  private async persistRule(rule: WAFRule): Promise<void> {
    try {
      await this.redis.hset('waf:custom_rules', rule.id, JSON.stringify(rule));
    } catch (error: any) {
      logger.error({ error }, 'Failed to persist WAF rule');
    }
  }

  private async incrementStat(stat: keyof WAFStats): Promise<void> {
    try {
      await this.redis.hincrby('waf:stats', stat, 1);
    } catch (error: any) {
      logger.error({ error }, 'Failed to increment WAF stat');
    }
  }

  private async updatePerformanceMetrics(processingTime: number): Promise<void> {
    try {
      await this.redis.lpush('waf:processing_times', processingTime);
      await this.redis.ltrim('waf:processing_times', 0, 999); // Keep last 1000 samples
    } catch (error: any) {
      logger.error({ error }, 'Failed to update performance metrics');
    }
  }

  private compareThreatLevel(level1: ThreatLevel, level2: ThreatLevel): number {
    const levels = { none: 0, low: 1, medium: 2, high: 3, critical: 4, unknown: 0 };
    return levels[level1] - levels[level2];
  }
}