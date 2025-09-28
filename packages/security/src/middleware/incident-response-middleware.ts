import { FastifyRequest, FastifyReply } from 'fastify';
import { EventEmitter } from 'events';
import { Redis } from 'ioredis';
import { AutomatedIncidentResponseOrchestrator, SecurityEvent } from '../services/automated-incident-response.js';
import { logger } from '../utils/logger.js';

/**
 * Incident Response Middleware
 * Monitors requests for security events and triggers automated response
 */
export class IncidentResponseMiddleware extends EventEmitter {
  private orchestrator: AutomatedIncidentResponseOrchestrator;
  private redis: Redis;
  private config: IncidentResponseConfig;
  private detectionRules: Map<string, DetectionRule> = new Map();
  private recentEvents: Map<string, SecurityEvent[]> = new Map();
  private suppressionCache: Set<string> = new Set();

  constructor(redis: Redis, config: IncidentResponseConfig) {
    super();
    this.redis = redis;
    this.config = config;
    this.orchestrator = new AutomatedIncidentResponseOrchestrator(redis, config.automation);

    this.loadDetectionRules();
    this.setupEventHandlers();
    this.startPeriodicCleanup();
  }

  /**
   * Main middleware function
   */
  public middleware() {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        // Extract security-relevant information from request
        const requestContext = this.extractRequestContext(request);

        // Check for security anomalies
        const anomalies = await this.detectAnomalies(requestContext);

        // Process detected anomalies
        if (anomalies.length > 0) {
          await this.processSecurityAnomalies(anomalies, requestContext);
        }

        // Add incident response headers
        this.addSecurityHeaders(reply, requestContext);

      } catch (error) {
        logger.error('Incident response middleware error', {
          error: error.message,
          requestId: request.id,
          url: request.url
        });
      }
    };
  }

  /**
   * Process webhook events from external security tools
   */
  public async processWebhookEvent(webhookData: any): Promise<void> {
    try {
      const securityEvent = this.parseWebhookEvent(webhookData);

      if (securityEvent) {
        await this.orchestrator.processSecurityEvent(securityEvent);
      }

    } catch (error) {
      logger.error('Failed to process webhook security event', {
        error: error.message,
        webhook: webhookData
      });
    }
  }

  /**
   * Extract security-relevant context from request
   */
  private extractRequestContext(request: FastifyRequest): RequestSecurityContext {
    return {
      requestId: request.id,
      ip: request.ip,
      userAgent: request.headers['user-agent'] as string,
      method: request.method,
      url: request.url,
      headers: request.headers,
      timestamp: new Date(),
      userId: (request as any).user?.userId,
      sessionId: (request as any).sessionId,
      geoLocation: this.getGeoLocation(request.ip),
      riskScore: 0 // Will be calculated
    };
  }

  /**
   * Detect security anomalies in request
   */
  private async detectAnomalies(context: RequestSecurityContext): Promise<SecurityAnomaly[]> {
    const anomalies: SecurityAnomaly[] = [];

    // Check against detection rules
    for (const [ruleId, rule] of this.detectionRules) {
      if (await this.evaluateDetectionRule(rule, context)) {
        anomalies.push({
          ruleId,
          type: rule.type,
          severity: rule.severity,
          description: rule.description,
          indicators: rule.indicators,
          confidence: rule.confidence,
          context
        });
      }
    }

    // Check for patterns indicating attacks
    await this.checkForAttackPatterns(context, anomalies);

    // Check rate limiting violations
    await this.checkRateLimitingViolations(context, anomalies);

    // Check for suspicious user behavior
    if (context.userId) {
      await this.checkUserBehaviorAnomalies(context, anomalies);
    }

    return anomalies;
  }

  /**
   * Process detected security anomalies
   */
  private async processSecurityAnomalies(
    anomalies: SecurityAnomaly[],
    context: RequestSecurityContext
  ): Promise<void> {
    for (const anomaly of anomalies) {
      // Check if this anomaly should be suppressed
      const suppressionKey = this.getSuppressionKey(anomaly, context);
      if (this.suppressionCache.has(suppressionKey)) {
        continue;
      }

      // Create security event
      const securityEvent = this.createSecurityEvent(anomaly, context);

      // Check if this requires immediate automated response
      if (this.requiresAutomatedResponse(anomaly)) {
        logger.warn('Security anomaly detected - triggering automated response', {
          ruleId: anomaly.ruleId,
          type: anomaly.type,
          severity: anomaly.severity,
          ip: context.ip,
          requestId: context.requestId
        });

        // Trigger automated incident response
        const response = await this.orchestrator.processSecurityEvent(securityEvent);

        // Log the response
        logger.info('Automated incident response completed', {
          ruleId: anomaly.ruleId,
          incidentId: response.incidentId,
          action: response.action,
          success: response.success
        });

        // Add to suppression cache to prevent duplicate responses
        this.suppressionCache.add(suppressionKey);
        setTimeout(() => {
          this.suppressionCache.delete(suppressionKey);
        }, this.config.suppressionTimeout || 300000); // 5 minutes default
      }

      // Store event for pattern analysis
      await this.storeSecurityEvent(securityEvent);

      // Emit event for other systems
      this.emit('security_anomaly', {
        anomaly,
        context,
        event: securityEvent
      });
    }
  }

  /**
   * Check for known attack patterns
   */
  private async checkForAttackPatterns(
    context: RequestSecurityContext,
    anomalies: SecurityAnomaly[]
  ): Promise<void> {
    // SQL Injection patterns
    if (this.detectSQLInjection(context.url)) {
      anomalies.push({
        ruleId: 'sql_injection_attempt',
        type: 'sql_injection',
        severity: 'high',
        description: 'Potential SQL injection attempt detected',
        indicators: ['malicious_url_pattern'],
        confidence: 0.8,
        context
      });
    }

    // XSS patterns
    if (this.detectXSS(context)) {
      anomalies.push({
        ruleId: 'xss_attempt',
        type: 'cross_site_scripting',
        severity: 'medium',
        description: 'Potential XSS attempt detected',
        indicators: ['malicious_script_pattern'],
        confidence: 0.7,
        context
      });
    }

    // Brute force patterns
    if (await this.detectBruteForce(context)) {
      anomalies.push({
        ruleId: 'brute_force_attempt',
        type: 'brute_force',
        severity: 'high',
        description: 'Brute force attack detected',
        indicators: ['excessive_login_attempts'],
        confidence: 0.9,
        context
      });
    }

    // Directory traversal
    if (this.detectDirectoryTraversal(context.url)) {
      anomalies.push({
        ruleId: 'directory_traversal',
        type: 'path_traversal',
        severity: 'medium',
        description: 'Directory traversal attempt detected',
        indicators: ['path_traversal_pattern'],
        confidence: 0.6,
        context
      });
    }
  }

  /**
   * Check for rate limiting violations that indicate attacks
   */
  private async checkRateLimitingViolations(
    context: RequestSecurityContext,
    anomalies: SecurityAnomaly[]
  ): Promise<void> {
    const key = `rate_limit_violations:${context.ip}`;
    const violations = await this.redis.get(key);

    if (violations && parseInt(violations) > this.config.rateLimitThreshold) {
      anomalies.push({
        ruleId: 'excessive_rate_limit_violations',
        type: 'abuse',
        severity: 'medium',
        description: 'Excessive rate limit violations detected',
        indicators: ['rate_limit_abuse'],
        confidence: 0.8,
        context
      });
    }
  }

  /**
   * Check for suspicious user behavior
   */
  private async checkUserBehaviorAnomalies(
    context: RequestSecurityContext,
    anomalies: SecurityAnomaly[]
  ): Promise<void> {
    if (!context.userId) return;

    // Check for unusual access patterns
    const userKey = `user_behavior:${context.userId}`;
    const recentActivity = await this.redis.lrange(userKey, 0, 100);

    // Analyze for anomalies (simplified)
    const locations = recentActivity.map(activity => {
      try {
        return JSON.parse(activity).geoLocation;
      } catch {
        return null;
      }
    }).filter(Boolean);

    // Check for impossible travel
    if (this.detectImpossibleTravel(locations, context.geoLocation)) {
      anomalies.push({
        ruleId: 'impossible_travel',
        type: 'account_takeover',
        severity: 'high',
        description: 'Impossible travel detected - potential account compromise',
        indicators: ['geolocation_anomaly'],
        confidence: 0.9,
        context
      });
    }
  }

  /**
   * Create security event from anomaly
   */
  private createSecurityEvent(
    anomaly: SecurityAnomaly,
    context: RequestSecurityContext
  ): SecurityEvent {
    return {
      id: `EVT-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type: anomaly.type,
      severity: anomaly.severity,
      title: `Security Anomaly: ${anomaly.description}`,
      description: `Detected ${anomaly.type} anomaly from IP ${context.ip}`,
      timestamp: context.timestamp.toISOString(),
      source: {
        system: 'gateway',
        component: 'incident-response-middleware',
        ipAddress: context.ip,
        userId: context.userId
      },
      indicators: anomaly.indicators.map(indicator => ({
        type: indicator,
        value: this.extractIndicatorValue(indicator, context),
        confidence: anomaly.confidence
      }))
    };
  }

  /**
   * Load detection rules
   */
  private loadDetectionRules(): void {
    // High-severity rules that trigger immediate response
    this.detectionRules.set('multiple_failed_auth', {
      id: 'multiple_failed_auth',
      type: 'brute_force',
      severity: 'high',
      description: 'Multiple failed authentication attempts',
      indicators: ['failed_login_count'],
      confidence: 0.9,
      conditions: {
        failed_attempts_threshold: 5,
        time_window: 300000 // 5 minutes
      }
    });

    this.detectionRules.set('suspicious_user_agent', {
      id: 'suspicious_user_agent',
      type: 'reconnaissance',
      severity: 'medium',
      description: 'Suspicious user agent detected',
      indicators: ['user_agent_pattern'],
      confidence: 0.7,
      conditions: {
        suspicious_patterns: ['sqlmap', 'nmap', 'nikto', 'burp', 'scanner']
      }
    });

    this.detectionRules.set('admin_access_anomaly', {
      id: 'admin_access_anomaly',
      type: 'privilege_escalation',
      severity: 'critical',
      description: 'Anomalous admin access detected',
      indicators: ['admin_endpoint_access'],
      confidence: 0.8,
      conditions: {
        admin_paths: ['/admin', '/api/admin', '/management']
      }
    });

    logger.info('Loaded incident response detection rules', {
      ruleCount: this.detectionRules.size
    });
  }

  /**
   * Add security headers to response
   */
  private addSecurityHeaders(reply: FastifyReply, context: RequestSecurityContext): void {
    reply.header('X-Request-ID', context.requestId);
    reply.header('X-Security-Scan', 'active');

    if (context.riskScore > 0.5) {
      reply.header('X-Risk-Level', 'elevated');
    }
  }

  /**
   * Detection helper methods
   */
  private detectSQLInjection(url: string): boolean {
    const sqlPatterns = [
      /(\bunion\b.*\bselect\b)/i,
      /(\bselect\b.*\bfrom\b)/i,
      /(\binsert\b.*\binto\b)/i,
      /(\bdelete\b.*\bfrom\b)/i,
      /(\bdrop\b.*\btable\b)/i,
      /'.*(\bor\b|\band\b).*'/i
    ];

    return sqlPatterns.some(pattern => pattern.test(url));
  }

  private detectXSS(context: RequestSecurityContext): boolean {
    const xssPatterns = [
      /<script[^>]*>.*?<\/script>/gi,
      /javascript:/gi,
      /on\w+\s*=/gi,
      /<iframe[^>]*>/gi
    ];

    const checkString = context.url + JSON.stringify(context.headers);
    return xssPatterns.some(pattern => pattern.test(checkString));
  }

  private async detectBruteForce(context: RequestSecurityContext): Promise<boolean> {
    if (!context.url.includes('/auth/login')) return false;

    const key = `login_attempts:${context.ip}`;
    const attempts = await this.redis.incr(key);
    await this.redis.expire(key, 300); // 5 minutes

    return attempts > 5;
  }

  private detectDirectoryTraversal(url: string): boolean {
    const traversalPatterns = [
      /\.\.\//g,
      /\.\.\\\\g,
      /%2e%2e%2f/gi,
      /%2e%2e%5c/gi
    ];

    return traversalPatterns.some(pattern => pattern.test(url));
  }

  private detectImpossibleTravel(
    recentLocations: any[],
    currentLocation: any
  ): boolean {
    if (!recentLocations.length || !currentLocation) return false;

    const lastLocation = recentLocations[0];
    if (!lastLocation) return false;

    // Simplified impossible travel detection
    // In production, use proper geolocation distance calculation
    const distance = this.calculateDistance(lastLocation, currentLocation);
    const timeDiff = Date.now() - new Date(lastLocation.timestamp).getTime();
    const maxSpeed = 1000; // km/h (commercial aircraft speed)

    return distance > (maxSpeed * (timeDiff / 3600000));
  }

  private calculateDistance(loc1: any, loc2: any): number {
    // Simplified distance calculation - use proper geolocation library in production
    return Math.abs(loc1.lat - loc2.lat) + Math.abs(loc1.lon - loc2.lon) * 111; // Rough km
  }

  private getGeoLocation(ip: string): any {
    // In production, use GeoIP service
    return {
      ip,
      country: 'Unknown',
      city: 'Unknown',
      lat: 0,
      lon: 0,
      timestamp: new Date()
    };
  }

  private requiresAutomatedResponse(anomaly: SecurityAnomaly): boolean {
    const autoResponseTypes = [
      'brute_force',
      'sql_injection',
      'account_takeover',
      'privilege_escalation'
    ];

    return autoResponseTypes.includes(anomaly.type) &&
           ['high', 'critical'].includes(anomaly.severity);
  }

  private getSuppressionKey(anomaly: SecurityAnomaly, context: RequestSecurityContext): string {
    return `${anomaly.ruleId}:${context.ip}`;
  }

  private async evaluateDetectionRule(
    rule: DetectionRule,
    context: RequestSecurityContext
  ): Promise<boolean> {
    // Simplified rule evaluation - implement proper rule engine in production
    switch (rule.id) {
      case 'suspicious_user_agent':
        const userAgent = context.userAgent?.toLowerCase() || '';
        return rule.conditions.suspicious_patterns.some((pattern: string) =>
          userAgent.includes(pattern.toLowerCase())
        );

      case 'admin_access_anomaly':
        return rule.conditions.admin_paths.some((path: string) =>
          context.url.startsWith(path)
        );

      default:
        return false;
    }
  }

  private extractIndicatorValue(indicator: string, context: RequestSecurityContext): string {
    switch (indicator) {
      case 'user_agent_pattern':
        return context.userAgent || '';
      case 'admin_endpoint_access':
        return context.url;
      case 'malicious_url_pattern':
        return context.url;
      default:
        return '';
    }
  }

  private parseWebhookEvent(webhookData: any): SecurityEvent | null {
    // Parse webhook events from external security tools
    // Implementation depends on the specific tools being integrated
    return null;
  }

  private async storeSecurityEvent(event: SecurityEvent): Promise<void> {
    const key = `security_events:${new Date().toISOString().split('T')[0]}`;
    await this.redis.lpush(key, JSON.stringify(event));
    await this.redis.expire(key, 2592000); // 30 days
  }

  private setupEventHandlers(): void {
    this.on('security_anomaly', (data) => {
      logger.info('Security anomaly detected', {
        ruleId: data.anomaly.ruleId,
        type: data.anomaly.type,
        severity: data.anomaly.severity,
        ip: data.context.ip
      });
    });
  }

  private startPeriodicCleanup(): void {
    setInterval(() => {
      // Clean up old events and caches
      this.recentEvents.clear();
      logger.debug('Periodic cleanup completed');
    }, 3600000); // 1 hour
  }

  /**
   * Get middleware statistics
   */
  public getStats(): object {
    return {
      detectionRules: this.detectionRules.size,
      recentEvents: this.recentEvents.size,
      suppressionCache: this.suppressionCache.size,
      automationStatus: this.orchestrator.getAutomationStatus()
    };
  }
}

// Type definitions
interface RequestSecurityContext {
  requestId: string;
  ip: string;
  userAgent: string;
  method: string;
  url: string;
  headers: any;
  timestamp: Date;
  userId?: string;
  sessionId?: string;
  geoLocation?: any;
  riskScore: number;
}

interface SecurityAnomaly {
  ruleId: string;
  type: string;
  severity: string;
  description: string;
  indicators: string[];
  confidence: number;
  context: RequestSecurityContext;
}

interface DetectionRule {
  id: string;
  type: string;
  severity: string;
  description: string;
  indicators: string[];
  confidence: number;
  conditions: Record<string, any>;
}

interface IncidentResponseConfig {
  suppressionTimeout?: number;
  rateLimitThreshold: number;
  automation: {
    notifications: any;
    ticketing?: any;
  };
}

export { IncidentResponseMiddleware, IncidentResponseConfig };