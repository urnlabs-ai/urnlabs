/**
 * Security Module Integration
 *
 * Centralized security module that integrates WAF Engine, DDoS Protection,
 * Security Headers, and Threat Intelligence for comprehensive API Gateway protection.
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { Redis } from 'ioredis';

// Import security components
import { WAFEngine, createWAFMiddleware, DEFAULT_WAF_ENGINE_CONFIG } from './WAFEngine.js';
import { DDoSProtection, createDDoSProtectionMiddleware, DEFAULT_DDOS_CONFIG } from './DDoSProtection.js';
import { SecurityHeaders, createSecurityHeadersMiddleware, DEFAULT_SECURITY_HEADERS_CONFIG, DEVELOPMENT_SECURITY_HEADERS_CONFIG } from './SecurityHeaders.js';
import { ThreatIntelligence, createThreatIntelligence, DEFAULT_THREAT_INTEL_CONFIG } from './ThreatIntelligence.js';

import { logger } from '../lib/logger.js';

interface SecurityModuleConfig {
  enabled: boolean;
  environment: 'development' | 'staging' | 'production';

  // Component configurations
  waf: typeof DEFAULT_WAF_ENGINE_CONFIG;
  ddos: typeof DEFAULT_DDOS_CONFIG;
  headers: typeof DEFAULT_SECURITY_HEADERS_CONFIG;
  threatIntel: typeof DEFAULT_THREAT_INTEL_CONFIG;

  // Integration settings
  integration: {
    enableRealTimeBlocking: boolean;
    enableIncidentResponse: boolean;
    enableSecurityDashboard: boolean;
    enableMetricsCollection: boolean;
    enableAlerting: boolean;
  };

  // Monitoring and alerting
  monitoring: {
    securityEventsThreshold: number;
    alertingWebhook?: string;
    slackWebhook?: string;
    emailAlerts?: string[];
  };

  // Performance settings
  performance: {
    enableAsyncProcessing: boolean;
    batchSize: number;
    processingTimeout: number;
  };
}

interface SecurityEvent {
  type: 'WAF_BLOCK' | 'DDOS_BLOCK' | 'THREAT_DETECTED' | 'SECURITY_VIOLATION';
  severity: 'low' | 'medium' | 'high' | 'critical';
  ip: string;
  userAgent?: string;
  url: string;
  method: string;
  timestamp: number;
  details: Record<string, any>;
  action: string;
  blocked: boolean;
}

interface SecurityMetrics {
  totalRequests: number;
  blockedRequests: number;
  challengedRequests: number;
  wafBlocks: number;
  ddosBlocks: number;
  threatDetections: number;
  averageProcessingTime: number;
  topBlockedIPs: Array<{ ip: string; count: number }>;
  topAttackTypes: Array<{ type: string; count: number }>;
  securityScore: number;
}

/**
 * Comprehensive Security Module
 */
export class SecurityModule {
  private config: SecurityModuleConfig;
  private redis: Redis;
  private fastify: FastifyInstance;

  // Security components
  private wafEngine: WAFEngine;
  private ddosProtection: DDoSProtection;
  private securityHeaders: SecurityHeaders;
  private threatIntelligence: ThreatIntelligence;

  // Metrics and monitoring
  private securityEvents: SecurityEvent[] = [];
  private metrics: SecurityMetrics = {
    totalRequests: 0,
    blockedRequests: 0,
    challengedRequests: 0,
    wafBlocks: 0,
    ddosBlocks: 0,
    threatDetections: 0,
    averageProcessingTime: 0,
    topBlockedIPs: [],
    topAttackTypes: [],
    securityScore: 100
  };

  constructor(fastify: FastifyInstance, redis: Redis, config: SecurityModuleConfig) {
    this.fastify = fastify;
    this.redis = redis;
    this.config = config;

    this.initializeSecurityModule();
  }

  /**
   * Initialize the security module
   */
  private async initializeSecurityModule(): Promise<void> {
    try {
      if (!this.config.enabled) {
        logger.info('Security module disabled');
        return;
      }

      // Initialize threat intelligence first (needed by other components)
      this.threatIntelligence = createThreatIntelligence(this.redis, this.config.threatIntel);

      // Initialize security components
      await this.initializeComponents();

      // Register middleware
      await this.registerMiddleware();

      // Start monitoring
      this.startMonitoring();

      // Setup security dashboard routes
      if (this.config.integration.enableSecurityDashboard) {
        this.setupSecurityRoutes();
      }

      logger.info('Security module initialized successfully');
    } catch (error) {
      logger.error({ error }, 'Failed to initialize security module');
      throw error;
    }
  }

  /**
   * Initialize security components
   */
  private async initializeComponents(): Promise<void> {
    // Adjust configurations based on environment
    const headerConfig = this.config.environment === 'development'
      ? { ...DEVELOPMENT_SECURITY_HEADERS_CONFIG, ...this.config.headers }
      : this.config.headers;

    // Initialize components
    this.wafEngine = new (WAFEngine as any)(this.redis, this.config.waf, this.threatIntelligence);
    this.ddosProtection = new DDoSProtection(this.redis, this.config.ddos, this.threatIntelligence);
    this.securityHeaders = new SecurityHeaders(headerConfig);
  }

  /**
   * Register security middleware with Fastify
   */
  private async registerMiddleware(): Promise<void> {
    // Security headers (applied first)
    this.fastify.addHook('onRequest', this.securityHeaders.middleware());

    // DDoS protection (applied early to prevent resource exhaustion)
    this.fastify.addHook('preHandler', this.ddosProtection.middleware());

    // WAF protection (applied before route handling)
    this.fastify.addHook('preHandler', this.wafEngine.middleware());

    // Security event monitoring
    this.fastify.addHook('onResponse', this.createSecurityMonitoringHook());

    logger.info('Security middleware registered successfully');
  }

  /**
   * Create security monitoring hook
   */
  private createSecurityMonitoringHook() {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      const processingTime = reply.getResponseTime();

      // Update metrics
      this.metrics.totalRequests++;
      this.updateAverageProcessingTime(processingTime);

      // Check for security events based on response status
      if (reply.statusCode === 403 || reply.statusCode === 429) {
        this.metrics.blockedRequests++;

        const event: SecurityEvent = {
          type: reply.statusCode === 403 ? 'WAF_BLOCK' : 'DDOS_BLOCK',
          severity: 'medium',
          ip: request.ip,
          userAgent: request.headers['user-agent'] as string,
          url: request.url,
          method: request.method,
          timestamp: Date.now(),
          details: {
            statusCode: reply.statusCode,
            processingTime
          },
          action: 'blocked',
          blocked: true
        };

        await this.handleSecurityEvent(event);
      }
    };
  }

  /**
   * Handle security events
   */
  private async handleSecurityEvent(event: SecurityEvent): Promise<void> {
    try {
      // Store event
      this.securityEvents.push(event);

      // Keep only recent events (last 1000)
      if (this.securityEvents.length > 1000) {
        this.securityEvents = this.securityEvents.slice(-1000);
      }

      // Store in Redis for persistence
      await this.redis.lpush('security:events', JSON.stringify(event));
      await this.redis.ltrim('security:events', 0, 9999); // Keep last 10k events

      // Update metrics based on event type
      this.updateMetricsFromEvent(event);

      // Send alerts for critical events
      if (event.severity === 'critical' || event.severity === 'high') {
        await this.sendAlert(event);
      }

      // Log event
      logger.warn({
        type: event.type,
        severity: event.severity,
        ip: event.ip,
        url: event.url,
        action: event.action
      }, 'Security event detected');

    } catch (error) {
      logger.error({ error, event }, 'Failed to handle security event');
    }
  }

  /**
   * Update metrics from security event
   */
  private updateMetricsFromEvent(event: SecurityEvent): void {
    switch (event.type) {
      case 'WAF_BLOCK':
        this.metrics.wafBlocks++;
        break;
      case 'DDOS_BLOCK':
        this.metrics.ddosBlocks++;
        break;
      case 'THREAT_DETECTED':
        this.metrics.threatDetections++;
        break;
    }

    // Update top blocked IPs
    this.updateTopBlockedIPs(event.ip);

    // Update top attack types
    this.updateTopAttackTypes(event.type);

    // Update security score
    this.updateSecurityScore();
  }

  /**
   * Setup security dashboard routes
   */
  private setupSecurityRoutes(): void {
    // Security dashboard
    this.fastify.get('/api/security/dashboard', async (request, reply) => {
      return {
        metrics: this.metrics,
        recentEvents: this.securityEvents.slice(-50),
        status: this.getSecurityStatus(),
        timestamp: Date.now()
      };
    });

    // Security metrics
    this.fastify.get('/api/security/metrics', async (request, reply) => {
      return this.metrics;
    });

    // Security events
    this.fastify.get('/api/security/events', async (request, reply) => {
      const limit = parseInt((request.query as any).limit || '100');
      const events = await this.redis.lrange('security:events', 0, limit - 1);

      return {
        events: events.map(e => JSON.parse(e)),
        total: await this.redis.llen('security:events')
      };
    });

    // Security configuration
    this.fastify.get('/api/security/config', async (request, reply) => {
      return {
        waf: this.wafEngine.getSecurityStatus ? this.wafEngine.getSecurityStatus() : {},
        headers: this.securityHeaders.getSecurityStatus(),
        environment: this.config.environment,
        enabled: this.config.enabled
      };
    });

    // IP reputation lookup
    this.fastify.get('/api/security/ip/:ip', async (request, reply) => {
      const ip = (request.params as any).ip;
      const reputation = await this.threatIntelligence.getDetailedIPReputation(ip);
      const geoLocation = await this.threatIntelligence.getGeoLocation(ip);

      return {
        ip,
        reputation,
        geoLocation,
        timestamp: Date.now()
      };
    });

    // Manual block/unblock IP
    this.fastify.post('/api/security/block/:ip', async (request, reply) => {
      const ip = (request.params as any).ip;
      const duration = (request.body as any).duration || 3600; // 1 hour default

      await this.redis.setex(`security:manual_block:${ip}`, duration, JSON.stringify({
        timestamp: Date.now(),
        duration,
        reason: 'Manual block'
      }));

      return { success: true, ip, duration };
    });

    this.fastify.delete('/api/security/block/:ip', async (request, reply) => {
      const ip = (request.params as any).ip;
      await this.redis.del(`security:manual_block:${ip}`);

      return { success: true, ip, action: 'unblocked' };
    });

    logger.info('Security dashboard routes registered');
  }

  /**
   * Start monitoring processes
   */
  private startMonitoring(): void {
    if (!this.config.integration.enableMetricsCollection) {
      return;
    }

    // Update metrics every minute
    setInterval(() => {
      this.updatePeriodicMetrics();
    }, 60000);

    // Clean up old events every hour
    setInterval(() => {
      this.cleanupOldEvents();
    }, 3600000);

    logger.info('Security monitoring started');
  }

  /**
   * Send security alerts
   */
  private async sendAlert(event: SecurityEvent): Promise<void> {
    if (!this.config.integration.enableAlerting) {
      return;
    }

    try {
      const alertData = {
        title: `Security Alert: ${event.type}`,
        severity: event.severity,
        ip: event.ip,
        url: event.url,
        timestamp: new Date(event.timestamp).toISOString(),
        details: event.details
      };

      // Slack webhook
      if (this.config.monitoring.slackWebhook) {
        await this.sendSlackAlert(alertData);
      }

      // Generic webhook
      if (this.config.monitoring.alertingWebhook) {
        await this.sendWebhookAlert(alertData);
      }

    } catch (error) {
      logger.error({ error, event }, 'Failed to send security alert');
    }
  }

  /**
   * Send Slack alert
   */
  private async sendSlackAlert(alertData: any): Promise<void> {
    // Implementation would send formatted message to Slack
    logger.info({ alertData }, 'Slack alert sent');
  }

  /**
   * Send webhook alert
   */
  private async sendWebhookAlert(alertData: any): Promise<void> {
    // Implementation would send HTTP POST to webhook URL
    logger.info({ alertData }, 'Webhook alert sent');
  }

  /**
   * Get overall security status
   */
  private getSecurityStatus(): Record<string, any> {
    return {
      overall: this.config.enabled ? 'enabled' : 'disabled',
      wafEnabled: this.config.waf.blockingEnabled,
      ddosEnabled: this.config.ddos.enabled,
      threatIntelEnabled: this.config.threatIntel.enabled,
      securityScore: this.metrics.securityScore,
      activeThreats: this.getActiveThreats(),
      environment: this.config.environment
    };
  }

  /**
   * Get active threats
   */
  private getActiveThreats(): number {
    const recentThreshold = Date.now() - (5 * 60 * 1000); // Last 5 minutes
    return this.securityEvents.filter(
      event => event.timestamp > recentThreshold && event.blocked
    ).length;
  }

  // Utility methods
  private updateAverageProcessingTime(processingTime: number): void {
    const currentAvg = this.metrics.averageProcessingTime;
    const totalRequests = this.metrics.totalRequests;

    this.metrics.averageProcessingTime = (
      (currentAvg * (totalRequests - 1)) + processingTime
    ) / totalRequests;
  }

  private updateTopBlockedIPs(ip: string): void {
    const existing = this.metrics.topBlockedIPs.find(item => item.ip === ip);
    if (existing) {
      existing.count++;
    } else {
      this.metrics.topBlockedIPs.push({ ip, count: 1 });
    }

    // Keep only top 10
    this.metrics.topBlockedIPs.sort((a, b) => b.count - a.count);
    this.metrics.topBlockedIPs = this.metrics.topBlockedIPs.slice(0, 10);
  }

  private updateTopAttackTypes(type: string): void {
    const existing = this.metrics.topAttackTypes.find(item => item.type === type);
    if (existing) {
      existing.count++;
    } else {
      this.metrics.topAttackTypes.push({ type, count: 1 });
    }

    // Keep only top 10
    this.metrics.topAttackTypes.sort((a, b) => b.count - a.count);
    this.metrics.topAttackTypes = this.metrics.topAttackTypes.slice(0, 10);
  }

  private updateSecurityScore(): void {
    const totalRequests = this.metrics.totalRequests;
    const blockedRequests = this.metrics.blockedRequests;

    if (totalRequests === 0) {
      this.metrics.securityScore = 100;
      return;
    }

    const blockRate = blockedRequests / totalRequests;

    // Security score decreases as block rate increases
    // But we also want to reward active protection
    let score = 100;

    if (blockRate > 0.1) { // More than 10% blocked
      score -= 30;
    } else if (blockRate > 0.05) { // More than 5% blocked
      score -= 15;
    } else if (blockRate > 0.02) { // More than 2% blocked
      score -= 5;
    }

    // Adjust based on threat detection effectiveness
    const threatDetectionRate = this.metrics.threatDetections / totalRequests;
    if (threatDetectionRate > 0.01) { // Good threat detection
      score += 5;
    }

    this.metrics.securityScore = Math.max(Math.min(score, 100), 0);
  }

  private updatePeriodicMetrics(): void {
    // Update security score
    this.updateSecurityScore();

    // Log current metrics
    logger.debug({ metrics: this.metrics }, 'Security metrics updated');
  }

  private cleanupOldEvents(): void {
    const cutoff = Date.now() - (24 * 60 * 60 * 1000); // 24 hours ago
    this.securityEvents = this.securityEvents.filter(event => event.timestamp > cutoff);
  }
}

/**
 * Factory function to create and register security module
 */
export async function createSecurityModule(
  fastify: FastifyInstance,
  redis: Redis,
  config: Partial<SecurityModuleConfig> = {}
): Promise<SecurityModule> {
  const fullConfig: SecurityModuleConfig = {
    ...DEFAULT_SECURITY_MODULE_CONFIG,
    ...config
  };

  return new SecurityModule(fastify, redis, fullConfig);
}

/**
 * Default security module configuration
 */
export const DEFAULT_SECURITY_MODULE_CONFIG: SecurityModuleConfig = {
  enabled: true,
  environment: 'production',

  waf: DEFAULT_WAF_ENGINE_CONFIG,
  ddos: DEFAULT_DDOS_CONFIG,
  headers: DEFAULT_SECURITY_HEADERS_CONFIG,
  threatIntel: DEFAULT_THREAT_INTEL_CONFIG,

  integration: {
    enableRealTimeBlocking: true,
    enableIncidentResponse: true,
    enableSecurityDashboard: true,
    enableMetricsCollection: true,
    enableAlerting: true
  },

  monitoring: {
    securityEventsThreshold: 100
  },

  performance: {
    enableAsyncProcessing: true,
    batchSize: 100,
    processingTimeout: 5000
  }
};

// Re-export components for direct use
export {
  WAFEngine,
  DDoSProtection,
  SecurityHeaders,
  ThreatIntelligence,
  createWAFMiddleware,
  createDDoSProtectionMiddleware,
  createSecurityHeadersMiddleware,
  createThreatIntelligence
};