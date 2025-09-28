import { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';
import { Redis } from 'ioredis';
import { WAFService } from './waf-service.js';
import { WAFConfig, WAFMiddlewareOptions, RequestAnalysis } from './types.js';
import { logger } from '../../utils/logger.js';

/**
 * WAF Middleware for Fastify integration
 * Provides seamless integration with existing Fastify applications
 */
export class WAFMiddleware {
  private wafService: WAFService;
  private config: WAFConfig;
  private options: WAFMiddlewareOptions;

  constructor(options: WAFMiddlewareOptions) {
    this.config = options.config;
    this.options = options;
    this.wafService = new WAFService(this.config, options.redisClient);

    // Setup event handlers
    this.setupEventHandlers();
  }

  /**
   * Create Fastify middleware function
   */
  createMiddleware() {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      // Skip WAF for bypassed IPs
      if (await this.wafService.isIPBypassed(request.ip)) {
        return;
      }

      try {
        // Execute beforeAnalysis hook
        if (this.options.beforeAnalysis) {
          await this.options.beforeAnalysis(request);
        }

        // Analyze request
        const analysis = await this.wafService.analyzeRequest(request, reply);

        // Execute afterAnalysis hook
        if (this.options.afterAnalysis) {
          await this.options.afterAnalysis(request, analysis);
        }

        // Handle blocked requests
        if (!analysis.allowed) {
          await this.handleBlockedRequest(request, reply, analysis);
          return;
        }

        // Log allowed requests if configured
        if (this.config.logAllRequests) {
          this.logAllowedRequest(request, analysis);
        }

      } catch (error: any) {
        logger.error({ error, request: { ip: request.ip, url: request.url } }, 'WAF middleware error');

        // Execute error hook
        if (this.options.onError) {
          await this.options.onError(error, { request, reply });
        }

        // Fail open or closed based on configuration
        if (!this.config.failOpen) {
          return reply.status(500).send({
            error: 'Security check failed',
            message: 'Unable to process request'
          });
        }
      }
    };
  }

  /**
   * Register WAF middleware with Fastify instance
   */
  static async register(fastify: FastifyInstance, options: WAFMiddlewareOptions) {
    const wafMiddleware = new WAFMiddleware(options);

    // Register as Fastify hook
    fastify.addHook('preHandler', wafMiddleware.createMiddleware());

    // Decorate Fastify instance with WAF methods
    fastify.decorate('waf', {
      getStats: () => wafMiddleware.wafService.getStats(),
      addRule: (rule: any) => wafMiddleware.wafService.addRule(rule),
      removeRule: (ruleId: string) => wafMiddleware.wafService.removeRule(ruleId),
      updateRule: (ruleId: string, updates: any) => wafMiddleware.wafService.updateRule(ruleId, updates),
      getRules: () => wafMiddleware.wafService.getRules(),
      setEnabled: (enabled: boolean) => wafMiddleware.wafService.setEnabled(enabled),
      addBypass: (ip: string, duration?: number) => wafMiddleware.wafService.addBypass(ip, duration),
      isIPBypassed: (ip: string) => wafMiddleware.wafService.isIPBypassed(ip),
      cleanup: () => wafMiddleware.wafService.cleanup()
    });

    logger.info('WAF middleware registered successfully');
  }

  /**
   * Handle blocked requests
   */
  private async handleBlockedRequest(
    request: FastifyRequest,
    reply: FastifyReply,
    analysis: RequestAnalysis
  ): Promise<void> {
    const statusCode = this.getStatusCodeForThreat(analysis.threatLevel);
    const errorResponse = this.createErrorResponse(analysis);

    // Log blocked request
    logger.warn({
      ip: request.ip,
      url: request.url,
      method: request.method,
      userAgent: request.headers['user-agent'],
      analysis
    }, 'WAF blocked malicious request');

    // Set security headers
    reply.header('X-WAF-Status', 'blocked');
    reply.header('X-WAF-Rule-Matches', analysis.ruleMatches.join(','));
    reply.header('X-WAF-Threat-Level', analysis.threatLevel);

    // Return appropriate error response
    return reply.status(statusCode).send(errorResponse);
  }

  /**
   * Log allowed requests
   */
  private logAllowedRequest(request: FastifyRequest, analysis: RequestAnalysis): void {
    logger.debug({
      ip: request.ip,
      url: request.url,
      method: request.method,
      userAgent: request.headers['user-agent'],
      threatLevel: analysis.threatLevel,
      ruleMatches: analysis.ruleMatches,
      processingTime: analysis.processingTime
    }, 'WAF allowed request');
  }

  /**
   * Get appropriate HTTP status code for threat level
   */
  private getStatusCodeForThreat(threatLevel: string): number {
    switch (threatLevel) {
      case 'critical':
      case 'high':
        return 403; // Forbidden
      case 'medium':
        return 429; // Too Many Requests
      case 'low':
        return 400; // Bad Request
      default:
        return 403;
    }
  }

  /**
   * Create error response for blocked requests
   */
  private createErrorResponse(analysis: RequestAnalysis): any {
    const baseResponse = {
      error: 'Request Blocked',
      message: analysis.reason || 'Security threat detected',
      threatLevel: analysis.threatLevel,
      timestamp: new Date().toISOString()
    };

    // Use custom error pages if configured
    if (this.config.customErrorPages) {
      switch (analysis.action) {
        case 'block':
          if (this.config.customErrorPages.blocked) {
            return { ...baseResponse, customPage: this.config.customErrorPages.blocked };
          }
          break;
        case 'log':
          // Rate limit specific
          if (analysis.ruleMatches.some(rule => rule.includes('rate_limit')) &&
              this.config.customErrorPages.rateLimit) {
            return { ...baseResponse, customPage: this.config.customErrorPages.rateLimit };
          }
          break;
      }

      // Geo blocking
      if (analysis.ruleMatches.some(rule => rule.includes('geo_blocking')) &&
          this.config.customErrorPages.geoBlocked) {
        return { ...baseResponse, customPage: this.config.customErrorPages.geoBlocked };
      }
    }

    return baseResponse;
  }

  /**
   * Setup event handlers for WAF events
   */
  private setupEventHandlers(): void {
    this.wafService.on('threatDetected', (event) => {
      if (this.options.onThreatDetected) {
        this.options.onThreatDetected(event);
      }

      // Send real-time alerts if configured
      this.sendRealTimeAlert('threat_detected', event);
    });

    this.wafService.on('threatBlocked', (event) => {
      if (this.options.onRequestBlocked) {
        this.options.onRequestBlocked(event);
      }

      // Send real-time alerts if configured
      this.sendRealTimeAlert('threat_blocked', event);
    });
  }

  /**
   * Send real-time alerts for security events
   */
  private async sendRealTimeAlert(type: string, event: any): Promise<void> {
    if (!this.config.monitoring.realTimeAlerts) {
      return;
    }

    try {
      const alert = {
        type,
        timestamp: new Date().toISOString(),
        event,
        severity: this.getSeverityLevel(event.threatLevel),
        source: 'WAF'
      };

      // Email notifications
      if (this.config.monitoring.emailNotifications) {
        await this.sendEmailAlert(alert);
      }

      // Slack notifications
      if (this.config.monitoring.slackWebhook) {
        await this.sendSlackAlert(alert);
      }

      // Webhook notifications
      if (this.config.monitoring.webhookUrl) {
        await this.sendWebhookAlert(alert);
      }

    } catch (error: any) {
      logger.error({ error }, 'Failed to send real-time alert');
    }
  }

  /**
   * Get severity level for alerting
   */
  private getSeverityLevel(threatLevel: string): string {
    switch (threatLevel) {
      case 'critical':
        return 'critical';
      case 'high':
        return 'high';
      case 'medium':
        return 'medium';
      case 'low':
        return 'low';
      default:
        return 'info';
    }
  }

  /**
   * Send email alert (placeholder - integrate with email service)
   */
  private async sendEmailAlert(alert: any): Promise<void> {
    // TODO: Integrate with email service (SendGrid, AWS SES, etc.)
    logger.info({ alert }, 'Email alert would be sent');
  }

  /**
   * Send Slack alert
   */
  private async sendSlackAlert(alert: any): Promise<void> {
    try {
      const webhookUrl = this.config.monitoring.slackWebhook;
      if (!webhookUrl) return;

      const payload = {
        text: `🚨 WAF Security Alert`,
        attachments: [
          {
            color: this.getSlackColor(alert.severity),
            title: `${alert.type.replace('_', ' ').toUpperCase()}`,
            fields: [
              {
                title: 'IP Address',
                value: alert.event.ip,
                short: true
              },
              {
                title: 'Threat Level',
                value: alert.event.threatLevel,
                short: true
              },
              {
                title: 'URL',
                value: alert.event.url,
                short: false
              },
              {
                title: 'Reason',
                value: alert.event.reason,
                short: false
              },
              {
                title: 'Rules Matched',
                value: alert.event.ruleMatches.join(', '),
                short: false
              }
            ],
            timestamp: alert.timestamp
          }
        ]
      };

      // Use fetch or http client to send to Slack
      // TODO: Implement actual HTTP request
      logger.info({ payload }, 'Slack alert would be sent');

    } catch (error: any) {
      logger.error({ error }, 'Failed to send Slack alert');
    }
  }

  /**
   * Send webhook alert
   */
  private async sendWebhookAlert(alert: any): Promise<void> {
    try {
      const webhookUrl = this.config.monitoring.webhookUrl;
      if (!webhookUrl) return;

      // TODO: Implement actual HTTP request
      logger.info({ alert, webhookUrl }, 'Webhook alert would be sent');

    } catch (error: any) {
      logger.error({ error }, 'Failed to send webhook alert');
    }
  }

  /**
   * Get Slack color for severity
   */
  private getSlackColor(severity: string): string {
    switch (severity) {
      case 'critical':
        return '#FF0000'; // Red
      case 'high':
        return '#FF8C00'; // Orange
      case 'medium':
        return '#FFD700'; // Yellow
      case 'low':
        return '#32CD32'; // Green
      default:
        return '#808080'; // Gray
    }
  }

  /**
   * Get WAF service instance
   */
  getWAFService(): WAFService {
    return this.wafService;
  }

  /**
   * Get WAF configuration
   */
  getConfig(): WAFConfig {
    return this.config;
  }

  /**
   * Update WAF configuration
   */
  updateConfig(updates: Partial<WAFConfig>): void {
    this.config = { ...this.config, ...updates };
    // TODO: Update WAF service configuration
  }
}

/**
 * Default WAF configuration
 */
export const DEFAULT_WAF_CONFIG: WAFConfig = {
  enabled: true,
  failOpen: false,
  blockOnCritical: true,
  logAllRequests: false,

  rateLimiting: {
    enabled: true,
    maxRequests: 100,
    window: 60,
    keyGenerator: 'ip'
  },

  geoBlocking: {
    enabled: false,
    blockedCountries: [],
    allowedCountries: [],
    blockUnknown: false
  },

  botProtection: {
    enabled: true,
    challengeUnknownBots: false,
    allowSearchEngines: true,
    blockHeadlessBrowsers: true
  },

  owaspProtection: {
    sqlInjection: true,
    xss: true,
    pathTraversal: true,
    commandInjection: true,
    csrf: true,
    xxe: true,
    lfi: true,
    rfi: true,
    ssrf: true
  },

  monitoring: {
    realTimeAlerts: true,
    emailNotifications: false,
    slackWebhook: undefined,
    webhookUrl: undefined
  },

  performance: {
    maxProcessingTime: 1000,
    enableCaching: true,
    cacheSize: 1000
  },

  bypass: {
    trustedIPs: ['127.0.0.1', '::1'],
    trustedNetworks: [],
    adminPaths: ['/admin/bypass']
  }
};

export default WAFMiddleware;