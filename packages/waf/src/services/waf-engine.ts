import { Request, Response, NextFunction } from 'express';
import Redis from 'ioredis';
import geoip from 'geoip-lite';
import useragent from 'useragent';
import { isIPv4, isIPv6, process as processIP } from 'ipaddr.js';
import winston from 'winston';
import { z } from 'zod';

// Security rule schemas
const SecurityRuleSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  category: z.enum(['sql_injection', 'xss', 'lfi', 'rfi', 'command_injection', 'csrf', 'dos', 'bot', 'geo', 'custom']),
  severity: z.enum(['low', 'medium', 'high', 'critical']),
  pattern: z.string(),
  action: z.enum(['allow', 'block', 'challenge', 'log']),
  enabled: z.boolean(),
  conditions: z.object({
    methods: z.array(z.string()).optional(),
    paths: z.array(z.string()).optional(),
    headers: z.record(z.string()).optional(),
    countries: z.array(z.string()).optional(),
    userAgents: z.array(z.string()).optional()
  }).optional()
});

const ThreatDetectionResultSchema = z.object({
  blocked: z.boolean(),
  riskScore: z.number(),
  threats: z.array(z.object({
    rule: z.string(),
    category: z.string(),
    severity: z.string(),
    confidence: z.number(),
    description: z.string()
  })),
  action: z.enum(['allow', 'block', 'challenge', 'rate_limit']),
  metadata: z.record(z.any())
});

export type SecurityRule = z.infer<typeof SecurityRuleSchema>;
export type ThreatDetectionResult = z.infer<typeof ThreatDetectionResultSchema>;

export class WAFEngine {
  private redis: Redis;
  private logger: winston.Logger;
  private rules: Map<string, SecurityRule> = new Map();
  private owasp_rules: SecurityRule[] = [];

  constructor(redis: Redis, logger: winston.Logger) {
    this.redis = redis;
    this.logger = logger;
    this.initializeOWASPRules();
    this.loadCustomRules();
  }

  private initializeOWASPRules(): void {
    // OWASP Top 10 2021 Protection Rules
    this.owasp_rules = [
      // A01: Broken Access Control
      {
        id: 'OWASP-A01-001',
        name: 'Directory Traversal Protection',
        description: 'Detects directory traversal attempts',
        category: 'lfi',
        severity: 'high',
        pattern: '(?:\\.\\./|\\.\\.\\\\|%2e%2e%2f|%2e%2e%5c)',
        action: 'block',
        enabled: true
      },

      // A02: Cryptographic Failures
      {
        id: 'OWASP-A02-001',
        name: 'Sensitive Data Exposure',
        description: 'Detects attempts to access sensitive files',
        category: 'lfi',
        severity: 'critical',
        pattern: '(?:passwd|shadow|hosts|config|database|\.env|\.key|\.pem|private)',
        action: 'block',
        enabled: true
      },

      // A03: Injection
      {
        id: 'OWASP-A03-001',
        name: 'SQL Injection Protection',
        description: 'Detects SQL injection attempts',
        category: 'sql_injection',
        severity: 'critical',
        pattern: '(?i)(?:union|select|insert|update|delete|drop|create|alter|exec|execute|sp_|xp_|cmdshell)',
        action: 'block',
        enabled: true
      },
      {
        id: 'OWASP-A03-002',
        name: 'XSS Protection',
        description: 'Detects cross-site scripting attempts',
        category: 'xss',
        severity: 'high',
        pattern: '(?:<script|javascript:|onload=|onerror=|onclick=|onmouseover=)',
        action: 'block',
        enabled: true
      },
      {
        id: 'OWASP-A03-003',
        name: 'Command Injection Protection',
        description: 'Detects command injection attempts',
        category: 'command_injection',
        severity: 'critical',
        pattern: '(?:;|\\||&|`|\\$\\(|\\${|>|<|\\*|\\?)',
        action: 'block',
        enabled: true
      },

      // A04: Insecure Design (Application logic protection)
      {
        id: 'OWASP-A04-001',
        name: 'Business Logic Bypass',
        description: 'Detects attempts to bypass business logic',
        category: 'custom',
        severity: 'medium',
        pattern: '(?:admin|test|debug|bypass|override)',
        action: 'log',
        enabled: true
      },

      // A05: Security Misconfiguration
      {
        id: 'OWASP-A05-001',
        name: 'Admin Interface Protection',
        description: 'Blocks access to admin interfaces',
        category: 'custom',
        severity: 'high',
        pattern: '(?:admin|administrator|management|config|setup)',
        action: 'block',
        enabled: true,
        conditions: {
          paths: ['/admin', '/administrator', '/config', '/setup', '/management']
        }
      },

      // A06: Vulnerable and Outdated Components
      {
        id: 'OWASP-A06-001',
        name: 'Known Vulnerable User Agents',
        description: 'Blocks known vulnerable user agents',
        category: 'bot',
        severity: 'medium',
        pattern: '(?:sqlmap|nikto|nessus|openvas|burp|zap)',
        action: 'block',
        enabled: true
      },

      // A07: Identification and Authentication Failures
      {
        id: 'OWASP-A07-001',
        name: 'Brute Force Protection',
        description: 'Detects brute force attacks on authentication',
        category: 'dos',
        severity: 'high',
        pattern: '(?:login|signin|auth|password)',
        action: 'rate_limit',
        enabled: true,
        conditions: {
          paths: ['/login', '/signin', '/auth', '/authenticate']
        }
      },

      // A08: Software and Data Integrity Failures
      {
        id: 'OWASP-A08-001',
        name: 'File Upload Protection',
        description: 'Protects against malicious file uploads',
        category: 'custom',
        severity: 'high',
        pattern: '(?:\\.php|\\.jsp|\\.asp|\\.exe|\\.sh|\\.bat)',
        action: 'block',
        enabled: true
      },

      // A09: Security Logging and Monitoring Failures
      {
        id: 'OWASP-A09-001',
        name: 'Log Injection Protection',
        description: 'Prevents log injection attacks',
        category: 'custom',
        severity: 'medium',
        pattern: '(?:\\r\\n|\\n|\\r|%0a|%0d)',
        action: 'block',
        enabled: true
      },

      // A10: Server-Side Request Forgery (SSRF)
      {
        id: 'OWASP-A10-001',
        name: 'SSRF Protection',
        description: 'Detects server-side request forgery attempts',
        category: 'custom',
        severity: 'high',
        pattern: '(?:localhost|127\\.0\\.0\\.1|192\\.168|10\\.|172\\.16|file://|ftp://)',
        action: 'block',
        enabled: true
      }
    ];

    // Load OWASP rules into the rules map
    this.owasp_rules.forEach(rule => {
      this.rules.set(rule.id, rule);
    });

    this.logger.info('Loaded OWASP Top 10 protection rules', {
      rulesCount: this.owasp_rules.length
    });
  }

  private async loadCustomRules(): Promise<void> {
    try {
      const customRulesData = await this.redis.hgetall('waf:custom_rules');

      for (const [ruleId, ruleData] of Object.entries(customRulesData)) {
        try {
          const rule = SecurityRuleSchema.parse(JSON.parse(ruleData));
          this.rules.set(ruleId, rule);
        } catch (error) {
          this.logger.warn('Failed to parse custom rule', { ruleId, error });
        }
      }

      this.logger.info('Loaded custom WAF rules', {
        customRulesCount: Object.keys(customRulesData).length
      });
    } catch (error) {
      this.logger.error('Failed to load custom rules from Redis', { error });
    }
  }

  public async analyzeRequest(req: Request): Promise<ThreatDetectionResult> {
    const startTime = Date.now();
    const clientIP = this.getClientIP(req);
    const userAgent = req.get('User-Agent') || '';
    const threats: any[] = [];
    let riskScore = 0;
    let blocked = false;
    let action: 'allow' | 'block' | 'challenge' | 'rate_limit' = 'allow';

    try {
      // Geographic analysis
      const geoData = geoip.lookup(clientIP);
      const country = geoData?.country || 'Unknown';

      // User agent analysis
      const parsedUA = useragent.parse(userAgent);
      const isBot = this.detectBot(userAgent);

      // Rate limiting check
      const rateLimitResult = await this.checkRateLimit(clientIP, req.path);
      if (rateLimitResult.blocked) {
        threats.push({
          rule: 'RATE_LIMIT',
          category: 'dos',
          severity: 'high',
          confidence: 1.0,
          description: `Rate limit exceeded: ${rateLimitResult.reason}`
        });
        riskScore += 80;
        blocked = true;
        action = 'rate_limit';
      }

      // Analyze against all security rules
      for (const rule of this.rules.values()) {
        if (!rule.enabled) continue;

        const ruleResult = await this.evaluateRule(rule, req, {
          clientIP,
          country,
          userAgent,
          isBot,
          parsedUA
        });

        if (ruleResult.matched) {
          threats.push({
            rule: rule.id,
            category: rule.category,
            severity: rule.severity,
            confidence: ruleResult.confidence,
            description: rule.description
          });

          // Add to risk score based on severity
          const severityScore = {
            low: 10,
            medium: 25,
            high: 50,
            critical: 80
          }[rule.severity];

          riskScore += severityScore * ruleResult.confidence;

          // Determine action based on rule
          if (rule.action === 'block' && ruleResult.confidence > 0.7) {
            blocked = true;
            action = 'block';
          } else if (rule.action === 'challenge' && !blocked) {
            action = 'challenge';
          }
        }
      }

      // Behavioral analysis
      const behaviorAnalysis = await this.analyzeBehavior(clientIP, req);
      if (behaviorAnalysis.suspicious) {
        threats.push({
          rule: 'BEHAVIOR_ANALYSIS',
          category: 'custom',
          severity: 'medium',
          confidence: behaviorAnalysis.confidence,
          description: behaviorAnalysis.reason
        });
        riskScore += 30 * behaviorAnalysis.confidence;
      }

      // Normalize risk score (0-100)
      riskScore = Math.min(100, Math.max(0, riskScore));

      const result: ThreatDetectionResult = {
        blocked,
        riskScore,
        threats,
        action,
        metadata: {
          clientIP,
          country,
          userAgent: parsedUA.toString(),
          isBot,
          processingTime: Date.now() - startTime,
          requestPath: req.path,
          requestMethod: req.method
        }
      };

      // Log the analysis result
      this.logger.info('WAF request analysis completed', {
        clientIP,
        path: req.path,
        method: req.method,
        riskScore,
        threatsCount: threats.length,
        action,
        blocked,
        processingTime: result.metadata.processingTime
      });

      // Store analysis result for behavior tracking
      await this.storeAnalysisResult(clientIP, result);

      return result;

    } catch (error) {
      this.logger.error('WAF analysis failed', {
        error: error.message,
        clientIP,
        path: req.path,
        method: req.method
      });

      return {
        blocked: false,
        riskScore: 0,
        threats: [],
        action: 'allow',
        metadata: {
          error: 'Analysis failed',
          processingTime: Date.now() - startTime
        }
      };
    }
  }

  private async evaluateRule(
    rule: SecurityRule,
    req: Request,
    context: {
      clientIP: string;
      country: string;
      userAgent: string;
      isBot: boolean;
      parsedUA: any;
    }
  ): Promise<{ matched: boolean; confidence: number }> {
    let matched = false;
    let confidence = 0;

    try {
      // Check rule conditions first
      if (rule.conditions) {
        // Method condition
        if (rule.conditions.methods && !rule.conditions.methods.includes(req.method)) {
          return { matched: false, confidence: 0 };
        }

        // Path condition
        if (rule.conditions.paths) {
          const pathMatched = rule.conditions.paths.some(path =>
            req.path.toLowerCase().includes(path.toLowerCase())
          );
          if (!pathMatched) {
            return { matched: false, confidence: 0 };
          }
        }

        // Country condition
        if (rule.conditions.countries && !rule.conditions.countries.includes(context.country)) {
          return { matched: false, confidence: 0 };
        }

        // User agent condition
        if (rule.conditions.userAgents) {
          const uaMatched = rule.conditions.userAgents.some(ua =>
            context.userAgent.toLowerCase().includes(ua.toLowerCase())
          );
          if (!uaMatched) {
            return { matched: false, confidence: 0 };
          }
        }
      }

      // Evaluate pattern against different parts of the request
      const regex = new RegExp(rule.pattern, 'gi');

      // Check URL path
      if (regex.test(req.path)) {
        matched = true;
        confidence = Math.max(confidence, 0.9);
      }

      // Check query parameters
      const queryString = new URL(req.url, 'http://localhost').search;
      if (queryString && regex.test(queryString)) {
        matched = true;
        confidence = Math.max(confidence, 0.8);
      }

      // Check request body (if present)
      if (req.body && typeof req.body === 'string') {
        if (regex.test(req.body)) {
          matched = true;
          confidence = Math.max(confidence, 0.9);
        }
      }

      // Check headers
      for (const [header, value] of Object.entries(req.headers)) {
        if (typeof value === 'string' && regex.test(value)) {
          matched = true;
          confidence = Math.max(confidence, 0.7);
        }
      }

      // Check user agent specifically
      if (regex.test(context.userAgent)) {
        matched = true;
        confidence = Math.max(confidence, 0.8);
      }

      return { matched, confidence };

    } catch (error) {
      this.logger.warn('Rule evaluation failed', {
        ruleId: rule.id,
        error: error.message
      });
      return { matched: false, confidence: 0 };
    }
  }

  private async checkRateLimit(clientIP: string, path: string): Promise<{
    blocked: boolean;
    reason?: string;
    remaining?: number;
  }> {
    try {
      const now = Date.now();
      const window = 60 * 1000; // 1 minute window
      const maxRequests = 100; // Max requests per window

      // General rate limiting
      const generalKey = `rate_limit:${clientIP}`;
      const generalCount = await this.redis.incr(generalKey);

      if (generalCount === 1) {
        await this.redis.expire(generalKey, 60);
      }

      if (generalCount > maxRequests) {
        return {
          blocked: true,
          reason: `General rate limit exceeded: ${generalCount}/${maxRequests}`,
          remaining: 0
        };
      }

      // Path-specific rate limiting for sensitive endpoints
      const sensitiveEndpoints = ['/login', '/signup', '/auth', '/reset-password'];
      const isSensitive = sensitiveEndpoints.some(endpoint => path.includes(endpoint));

      if (isSensitive) {
        const sensitiveKey = `rate_limit:sensitive:${clientIP}`;
        const sensitiveCount = await this.redis.incr(sensitiveKey);
        const sensitiveMax = 10; // Much stricter for sensitive endpoints

        if (sensitiveCount === 1) {
          await this.redis.expire(sensitiveKey, 60);
        }

        if (sensitiveCount > sensitiveMax) {
          return {
            blocked: true,
            reason: `Sensitive endpoint rate limit exceeded: ${sensitiveCount}/${sensitiveMax}`,
            remaining: 0
          };
        }
      }

      return {
        blocked: false,
        remaining: maxRequests - generalCount
      };

    } catch (error) {
      this.logger.error('Rate limit check failed', { error, clientIP, path });
      return { blocked: false };
    }
  }

  private async analyzeBehavior(clientIP: string, req: Request): Promise<{
    suspicious: boolean;
    confidence: number;
    reason?: string;
  }> {
    try {
      const now = Date.now();
      const window = 300; // 5 minute window

      // Get recent request history
      const historyKey = `behavior:${clientIP}`;
      const history = await this.redis.lrange(historyKey, 0, 100);

      // Analyze request patterns
      const recentRequests = history
        .map(entry => JSON.parse(entry))
        .filter(entry => (now - entry.timestamp) < (window * 1000));

      if (recentRequests.length === 0) {
        return { suspicious: false, confidence: 0 };
      }

      // Check for suspicious patterns
      let suspiciousScore = 0;
      let reasons: string[] = [];

      // 1. Rapid successive requests
      if (recentRequests.length > 20) {
        suspiciousScore += 0.3;
        reasons.push('High frequency requests');
      }

      // 2. Multiple error responses
      const errorRequests = recentRequests.filter(r => r.status >= 400);
      if (errorRequests.length > 5) {
        suspiciousScore += 0.4;
        reasons.push('Multiple error responses');
      }

      // 3. Scanning behavior (accessing many different paths)
      const uniquePaths = new Set(recentRequests.map(r => r.path));
      if (uniquePaths.size > 10) {
        suspiciousScore += 0.3;
        reasons.push('Path scanning behavior');
      }

      // 4. Accessing admin/sensitive paths
      const adminPaths = ['/admin', '/config', '/debug', '/.env', '/backup'];
      const adminAccess = recentRequests.filter(r =>
        adminPaths.some(path => r.path.includes(path))
      );
      if (adminAccess.length > 0) {
        suspiciousScore += 0.5;
        reasons.push('Admin path access attempts');
      }

      // Store current request in history
      const requestData = {
        timestamp: now,
        path: req.path,
        method: req.method,
        userAgent: req.get('User-Agent'),
        status: 0 // Will be updated later
      };

      await this.redis.lpush(historyKey, JSON.stringify(requestData));
      await this.redis.ltrim(historyKey, 0, 99); // Keep last 100 requests
      await this.redis.expire(historyKey, 3600); // Expire after 1 hour

      const confidence = Math.min(1.0, suspiciousScore);

      return {
        suspicious: confidence > 0.6,
        confidence,
        reason: reasons.join(', ')
      };

    } catch (error) {
      this.logger.error('Behavior analysis failed', { error, clientIP });
      return { suspicious: false, confidence: 0 };
    }
  }

  private detectBot(userAgent: string): boolean {
    const botPatterns = [
      /bot/i, /crawler/i, /spider/i, /scraper/i,
      /curl/i, /wget/i, /python/i, /java/i,
      /postman/i, /insomnia/i, /httpie/i,
      /googlebot/i, /bingbot/i, /slurp/i,
      /facebookexternalhit/i, /twitterbot/i,
      /linkedinbot/i, /whatsapp/i, /telegram/i
    ];

    return botPatterns.some(pattern => pattern.test(userAgent));
  }

  private getClientIP(req: Request): string {
    return (
      (req.headers['x-forwarded-for'] as string)?.split(',')[0] ||
      req.headers['x-real-ip'] as string ||
      req.connection.remoteAddress ||
      req.socket.remoteAddress ||
      '127.0.0.1'
    );
  }

  private async storeAnalysisResult(clientIP: string, result: ThreatDetectionResult): Promise<void> {
    try {
      const key = `waf:analysis:${clientIP}`;
      const data = {
        timestamp: Date.now(),
        riskScore: result.riskScore,
        threatsCount: result.threats.length,
        action: result.action,
        blocked: result.blocked
      };

      await this.redis.lpush(key, JSON.stringify(data));
      await this.redis.ltrim(key, 0, 99); // Keep last 100 analyses
      await this.redis.expire(key, 3600); // Expire after 1 hour

    } catch (error) {
      this.logger.error('Failed to store analysis result', { error, clientIP });
    }
  }

  public async addCustomRule(rule: SecurityRule): Promise<void> {
    try {
      SecurityRuleSchema.parse(rule);

      this.rules.set(rule.id, rule);
      await this.redis.hset('waf:custom_rules', rule.id, JSON.stringify(rule));

      this.logger.info('Added custom WAF rule', { ruleId: rule.id, category: rule.category });
    } catch (error) {
      this.logger.error('Failed to add custom rule', { error, ruleId: rule.id });
      throw error;
    }
  }

  public async removeCustomRule(ruleId: string): Promise<void> {
    try {
      this.rules.delete(ruleId);
      await this.redis.hdel('waf:custom_rules', ruleId);

      this.logger.info('Removed custom WAF rule', { ruleId });
    } catch (error) {
      this.logger.error('Failed to remove custom rule', { error, ruleId });
      throw error;
    }
  }

  public async updateRule(ruleId: string, updates: Partial<SecurityRule>): Promise<void> {
    try {
      const existingRule = this.rules.get(ruleId);
      if (!existingRule) {
        throw new Error(`Rule ${ruleId} not found`);
      }

      const updatedRule = { ...existingRule, ...updates };
      SecurityRuleSchema.parse(updatedRule);

      this.rules.set(ruleId, updatedRule);

      // Only update in Redis if it's a custom rule (not OWASP)
      if (!ruleId.startsWith('OWASP-')) {
        await this.redis.hset('waf:custom_rules', ruleId, JSON.stringify(updatedRule));
      }

      this.logger.info('Updated WAF rule', { ruleId, updates });
    } catch (error) {
      this.logger.error('Failed to update rule', { error, ruleId });
      throw error;
    }
  }

  public getAllRules(): SecurityRule[] {
    return Array.from(this.rules.values());
  }

  public getRule(ruleId: string): SecurityRule | undefined {
    return this.rules.get(ruleId);
  }

  public async getStatistics(): Promise<any> {
    try {
      const stats = {
        rulesCount: this.rules.size,
        owaspRulesCount: this.owasp_rules.length,
        customRulesCount: this.rules.size - this.owasp_rules.length,
        enabledRulesCount: Array.from(this.rules.values()).filter(r => r.enabled).length
      };

      return stats;
    } catch (error) {
      this.logger.error('Failed to get WAF statistics', { error });
      throw error;
    }
  }
}