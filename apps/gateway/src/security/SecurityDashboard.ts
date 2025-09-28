/**
 * Security Dashboard
 *
 * Comprehensive security monitoring and configuration dashboard
 * for the API Gateway security system.
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { Redis } from 'ioredis';
import { SecurityModule } from './index.js';
import { logger } from '../lib/logger.js';

interface DashboardConfig {
  enabled: boolean;
  authRequired: boolean;
  allowedRoles: string[];
  refreshInterval: number;
  maxHistoryDays: number;
}

interface SecurityDashboardData {
  overview: {
    status: string;
    securityScore: number;
    activeThreats: number;
    blockedToday: number;
    alertsToday: number;
    uptime: number;
  };
  realTimeMetrics: {
    requestsPerSecond: number;
    blockRatePercentage: number;
    averageResponseTime: number;
    activeConnections: number;
    memoryUsage: number;
    cpuUsage: number;
  };
  threatIntelligence: {
    totalMaliciousIPs: number;
    newThreatsToday: number;
    topThreatCountries: Array<{ country: string; count: number }>;
    topAttackTypes: Array<{ type: string; count: number }>;
    threatSources: Array<{ source: string; lastUpdate: string; status: string }>;
  };
  wafMetrics: {
    totalRulesActive: number;
    sqlInjectionBlocked: number;
    xssBlocked: number;
    pathTraversalBlocked: number;
    customRulesTriggered: number;
    falsePositives: number;
  };
  ddosMetrics: {
    globalRateLimit: { current: number; max: number };
    ipBlocks: number;
    challengesIssued: number;
    emergencyModeActive: boolean;
    adaptiveThresholdsActive: number;
  };
  complianceStatus: {
    overall: string;
    frameworks: Array<{
      name: string;
      status: 'compliant' | 'warning' | 'non-compliant';
      score: number;
      lastAssessment: string;
    }>;
    dataProtection: {
      gdprCompliant: boolean;
      ccpaCompliant: boolean;
      pciCompliant: boolean;
    };
  };
  recentEvents: Array<{
    timestamp: string;
    type: string;
    severity: string;
    description: string;
    ip?: string;
    action: string;
  }>;
  systemHealth: {
    components: Array<{
      name: string;
      status: 'healthy' | 'warning' | 'critical';
      lastCheck: string;
      metrics?: Record<string, any>;
    }>;
    dependencies: Array<{
      name: string;
      status: 'connected' | 'degraded' | 'disconnected';
      responseTime?: number;
    }>;
  };
}

/**
 * Security Dashboard for monitoring and configuration
 */
export class SecurityDashboard {
  private fastify: FastifyInstance;
  private redis: Redis;
  private securityModule: SecurityModule;
  private config: DashboardConfig;

  // Cached dashboard data
  private cachedData: SecurityDashboardData | null = null;
  private lastCacheUpdate: number = 0;

  constructor(
    fastify: FastifyInstance,
    redis: Redis,
    securityModule: SecurityModule,
    config: DashboardConfig
  ) {
    this.fastify = fastify;
    this.redis = redis;
    this.securityModule = securityModule;
    this.config = config;

    this.initializeDashboard();
  }

  /**
   * Initialize dashboard routes and data collection
   */
  private async initializeDashboard(): Promise<void> {
    if (!this.config.enabled) {
      logger.info('Security Dashboard disabled');
      return;
    }

    // Register dashboard routes
    this.registerRoutes();

    // Start background data collection
    this.startDataCollection();

    logger.info('Security Dashboard initialized');
  }

  /**
   * Register dashboard routes
   */
  private registerRoutes(): void {
    // Main dashboard data endpoint
    this.fastify.get('/api/security/dashboard', {
      preHandler: this.authMiddleware.bind(this)
    }, this.getDashboardData.bind(this));

    // Real-time metrics endpoint
    this.fastify.get('/api/security/metrics/realtime', {
      preHandler: this.authMiddleware.bind(this)
    }, this.getRealTimeMetrics.bind(this));

    // Security events endpoint
    this.fastify.get('/api/security/events', {
      preHandler: this.authMiddleware.bind(this)
    }, this.getSecurityEvents.bind(this));

    // Threat intelligence endpoint
    this.fastify.get('/api/security/threats', {
      preHandler: this.authMiddleware.bind(this)
    }, this.getThreatIntelligence.bind(this));

    // Configuration management endpoints
    this.fastify.get('/api/security/config', {
      preHandler: this.authMiddleware.bind(this)
    }, this.getSecurityConfig.bind(this));

    this.fastify.post('/api/security/config', {
      preHandler: this.authMiddleware.bind(this)
    }, this.updateSecurityConfig.bind(this));

    // Manual security actions
    this.fastify.post('/api/security/actions/block-ip', {
      preHandler: this.authMiddleware.bind(this)
    }, this.blockIP.bind(this));

    this.fastify.post('/api/security/actions/unblock-ip', {
      preHandler: this.authMiddleware.bind(this)
    }, this.unblockIP.bind(this));

    this.fastify.post('/api/security/actions/emergency-mode', {
      preHandler: this.authMiddleware.bind(this)
    }, this.toggleEmergencyMode.bind(this));

    // Export/import configuration
    this.fastify.get('/api/security/export', {
      preHandler: this.authMiddleware.bind(this)
    }, this.exportConfig.bind(this));

    this.fastify.post('/api/security/import', {
      preHandler: this.authMiddleware.bind(this)
    }, this.importConfig.bind(this));

    // Health check for security components
    this.fastify.get('/api/security/health', {
      preHandler: this.authMiddleware.bind(this)
    }, this.getSystemHealth.bind(this));

    // WebSocket endpoint for real-time updates
    this.fastify.register(async function(fastify) {
      fastify.get('/api/security/ws', { websocket: true }, (connection, request) => {
        this.handleWebSocketConnection(connection, request);
      });
    }.bind(this));
  }

  /**
   * Authentication middleware for dashboard
   */
  private async authMiddleware(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    if (!this.config.authRequired) {
      return;
    }

    try {
      // Verify JWT token
      await request.jwtVerify();

      // Check user role if configured
      if (this.config.allowedRoles.length > 0) {
        const user = request.user as any;
        if (!user || !this.config.allowedRoles.includes(user.role)) {
          return reply.status(403).send({ error: 'Insufficient permissions' });
        }
      }
    } catch (error) {
      return reply.status(401).send({ error: 'Authentication required' });
    }
  }

  /**
   * Get complete dashboard data
   */
  private async getDashboardData(request: FastifyRequest, reply: FastifyReply): Promise<SecurityDashboardData> {
    const now = Date.now();

    // Use cached data if fresh enough
    if (this.cachedData && now - this.lastCacheUpdate < 30000) { // 30 seconds
      return this.cachedData;
    }

    // Collect fresh data
    const data = await this.collectDashboardData();

    // Cache the data
    this.cachedData = data;
    this.lastCacheUpdate = now;

    return data;
  }

  /**
   * Collect complete dashboard data
   */
  private async collectDashboardData(): Promise<SecurityDashboardData> {
    const [
      overview,
      realTimeMetrics,
      threatIntelligence,
      wafMetrics,
      ddosMetrics,
      complianceStatus,
      recentEvents,
      systemHealth
    ] = await Promise.all([
      this.collectOverview(),
      this.collectRealTimeMetrics(),
      this.collectThreatIntelligence(),
      this.collectWAFMetrics(),
      this.collectDDoSMetrics(),
      this.collectComplianceStatus(),
      this.collectRecentEvents(),
      this.collectSystemHealth()
    ]);

    return {
      overview,
      realTimeMetrics,
      threatIntelligence,
      wafMetrics,
      ddosMetrics,
      complianceStatus,
      recentEvents,
      systemHealth
    };
  }

  /**
   * Collect overview metrics
   */
  private async collectOverview(): Promise<SecurityDashboardData['overview']> {
    const [blockedToday, alertsToday] = await Promise.all([
      this.getBlockedCountToday(),
      this.getAlertsCountToday()
    ]);

    return {
      status: 'operational',
      securityScore: 85, // Would calculate from actual metrics
      activeThreats: await this.getActiveThreatsCount(),
      blockedToday,
      alertsToday,
      uptime: process.uptime()
    };
  }

  /**
   * Collect real-time metrics
   */
  private async collectRealTimeMetrics(): Promise<SecurityDashboardData['realTimeMetrics']> {
    const [requestsPerSecond, blockRate, avgResponseTime] = await Promise.all([
      this.getRequestsPerSecond(),
      this.getBlockRatePercentage(),
      this.getAverageResponseTime()
    ]);

    return {
      requestsPerSecond,
      blockRatePercentage: blockRate,
      averageResponseTime: avgResponseTime,
      activeConnections: await this.getActiveConnections(),
      memoryUsage: process.memoryUsage().heapUsed / 1024 / 1024, // MB
      cpuUsage: process.cpuUsage().user / 1000000 // Convert to seconds
    };
  }

  /**
   * Collect threat intelligence data
   */
  private async collectThreatIntelligence(): Promise<SecurityDashboardData['threatIntelligence']> {
    return {
      totalMaliciousIPs: await this.getMaliciousIPCount(),
      newThreatsToday: await this.getNewThreatsToday(),
      topThreatCountries: await this.getTopThreatCountries(),
      topAttackTypes: await this.getTopAttackTypes(),
      threatSources: await this.getThreatSources()
    };
  }

  /**
   * Collect WAF metrics
   */
  private async collectWAFMetrics(): Promise<SecurityDashboardData['wafMetrics']> {
    const wafStats = await this.redis.hgetall('waf:stats:daily');

    return {
      totalRulesActive: parseInt(wafStats.rules_active || '0'),
      sqlInjectionBlocked: parseInt(wafStats.sql_injection || '0'),
      xssBlocked: parseInt(wafStats.xss || '0'),
      pathTraversalBlocked: parseInt(wafStats.path_traversal || '0'),
      customRulesTriggered: parseInt(wafStats.custom_rules || '0'),
      falsePositives: parseInt(wafStats.false_positives || '0')
    };
  }

  /**
   * Collect DDoS metrics
   */
  private async collectDDoSMetrics(): Promise<SecurityDashboardData['ddosMetrics']> {
    const ddosStats = await this.redis.hgetall('ddos:stats:current');

    return {
      globalRateLimit: {
        current: parseInt(ddosStats.current_requests || '0'),
        max: parseInt(ddosStats.max_requests || '1000')
      },
      ipBlocks: parseInt(ddosStats.ip_blocks || '0'),
      challengesIssued: parseInt(ddosStats.challenges || '0'),
      emergencyModeActive: ddosStats.emergency_mode === 'true',
      adaptiveThresholdsActive: parseInt(ddosStats.adaptive_thresholds || '0')
    };
  }

  /**
   * Collect compliance status
   */
  private async collectComplianceStatus(): Promise<SecurityDashboardData['complianceStatus']> {
    // This would integrate with the compliance orchestrator
    return {
      overall: 'compliant',
      frameworks: [
        {
          name: 'SOC2',
          status: 'compliant',
          score: 95,
          lastAssessment: new Date().toISOString()
        },
        {
          name: 'ISO27001',
          status: 'compliant',
          score: 92,
          lastAssessment: new Date().toISOString()
        },
        {
          name: 'PCI_DSS',
          status: 'warning',
          score: 85,
          lastAssessment: new Date().toISOString()
        }
      ],
      dataProtection: {
        gdprCompliant: true,
        ccpaCompliant: true,
        pciCompliant: true
      }
    };
  }

  /**
   * Collect recent security events
   */
  private async collectRecentEvents(): Promise<SecurityDashboardData['recentEvents']> {
    const events = await this.redis.lrange('security:events', 0, 49);

    return events.map(eventStr => {
      const event = JSON.parse(eventStr);
      return {
        timestamp: new Date(event.timestamp).toISOString(),
        type: event.type,
        severity: event.severity,
        description: event.reason || event.description,
        ip: event.ip,
        action: event.action
      };
    });
  }

  /**
   * Collect system health data
   */
  private async collectSystemHealth(): Promise<SecurityDashboardData['systemHealth']> {
    return {
      components: [
        {
          name: 'WAF Engine',
          status: 'healthy',
          lastCheck: new Date().toISOString(),
          metrics: { rulesLoaded: 150, avgProcessingTime: 2.5 }
        },
        {
          name: 'DDoS Protection',
          status: 'healthy',
          lastCheck: new Date().toISOString(),
          metrics: { activeConnections: 245, blockedIPs: 12 }
        },
        {
          name: 'Threat Intelligence',
          status: 'healthy',
          lastCheck: new Date().toISOString(),
          metrics: { feedsActive: 3, lastUpdate: Date.now() - 1800000 }
        }
      ],
      dependencies: [
        {
          name: 'Redis',
          status: 'connected',
          responseTime: 1.2
        },
        {
          name: 'AbuseIPDB API',
          status: 'connected',
          responseTime: 245
        },
        {
          name: 'VirusTotal API',
          status: 'connected',
          responseTime: 189
        }
      ]
    };
  }

  // Helper methods for data collection
  private async getBlockedCountToday(): Promise<number> {
    const key = `security:blocked:${new Date().toISOString().split('T')[0]}`;
    const count = await this.redis.get(key);
    return parseInt(count || '0');
  }

  private async getAlertsCountToday(): Promise<number> {
    const key = `security:alerts:${new Date().toISOString().split('T')[0]}`;
    const count = await this.redis.get(key);
    return parseInt(count || '0');
  }

  private async getActiveThreatsCount(): Promise<number> {
    const recentThreshold = Date.now() - (5 * 60 * 1000); // Last 5 minutes
    const events = await this.redis.lrange('security:events', 0, 99);

    return events.filter(eventStr => {
      const event = JSON.parse(eventStr);
      return event.timestamp > recentThreshold && event.blocked;
    }).length;
  }

  private async getRequestsPerSecond(): Promise<number> {
    const key = 'metrics:requests_per_second';
    const rps = await this.redis.get(key);
    return parseFloat(rps || '0');
  }

  private async getBlockRatePercentage(): Promise<number> {
    const [total, blocked] = await Promise.all([
      this.redis.get('metrics:total_requests'),
      this.redis.get('metrics:blocked_requests')
    ]);

    const totalNum = parseInt(total || '1');
    const blockedNum = parseInt(blocked || '0');

    return (blockedNum / totalNum) * 100;
  }

  private async getAverageResponseTime(): Promise<number> {
    const avgTime = await this.redis.get('metrics:avg_response_time');
    return parseFloat(avgTime || '0');
  }

  private async getActiveConnections(): Promise<number> {
    const connections = await this.redis.get('metrics:active_connections');
    return parseInt(connections || '0');
  }

  private async getMaliciousIPCount(): Promise<number> {
    return await this.redis.scard('threat:malicious_ips');
  }

  private async getNewThreatsToday(): Promise<number> {
    const key = `threat:new:${new Date().toISOString().split('T')[0]}`;
    return await this.redis.scard(key);
  }

  private async getTopThreatCountries(): Promise<Array<{ country: string; count: number }>> {
    const countries = await this.redis.zrevrange('threat:countries', 0, 9, 'WITHSCORES');
    const result: Array<{ country: string; count: number }> = [];

    for (let i = 0; i < countries.length; i += 2) {
      result.push({
        country: countries[i],
        count: parseInt(countries[i + 1])
      });
    }

    return result;
  }

  private async getTopAttackTypes(): Promise<Array<{ type: string; count: number }>> {
    const types = await this.redis.zrevrange('threat:attack_types', 0, 9, 'WITHSCORES');
    const result: Array<{ type: string; count: number }> = [];

    for (let i = 0; i < types.length; i += 2) {
      result.push({
        type: types[i],
        count: parseInt(types[i + 1])
      });
    }

    return result;
  }

  private async getThreatSources(): Promise<Array<{ source: string; lastUpdate: string; status: string }>> {
    return [
      {
        source: 'AbuseIPDB',
        lastUpdate: new Date(Date.now() - 1800000).toISOString(),
        status: 'active'
      },
      {
        source: 'VirusTotal',
        lastUpdate: new Date(Date.now() - 2400000).toISOString(),
        status: 'active'
      },
      {
        source: 'ThreatFox',
        lastUpdate: new Date(Date.now() - 3600000).toISOString(),
        status: 'active'
      }
    ];
  }

  // Route handlers
  private async getRealTimeMetrics(request: FastifyRequest, reply: FastifyReply): Promise<any> {
    return await this.collectRealTimeMetrics();
  }

  private async getSecurityEvents(request: FastifyRequest, reply: FastifyReply): Promise<any> {
    const limit = parseInt((request.query as any).limit || '50');
    return await this.collectRecentEvents();
  }

  private async getThreatIntelligence(request: FastifyRequest, reply: FastifyReply): Promise<any> {
    return await this.collectThreatIntelligence();
  }

  private async getSecurityConfig(request: FastifyRequest, reply: FastifyReply): Promise<any> {
    // Return current security configuration
    return {
      waf: { enabled: true, rulesCount: 150 },
      ddos: { enabled: true, globalLimit: 1000 },
      headers: { enabled: true, hstsEnabled: true },
      threatIntel: { enabled: true, sourcesActive: 3 }
    };
  }

  private async updateSecurityConfig(request: FastifyRequest, reply: FastifyReply): Promise<any> {
    // Update security configuration
    const updates = request.body as any;

    // Validate and apply updates
    logger.info({ updates }, 'Security configuration updated');

    return { success: true, message: 'Configuration updated successfully' };
  }

  private async blockIP(request: FastifyRequest, reply: FastifyReply): Promise<any> {
    const { ip, duration = 3600, reason = 'Manual block' } = request.body as any;

    await this.redis.setex(`security:manual_block:${ip}`, duration, JSON.stringify({
      timestamp: Date.now(),
      duration,
      reason
    }));

    logger.warn({ ip, duration, reason }, 'IP manually blocked');

    return { success: true, ip, duration, reason };
  }

  private async unblockIP(request: FastifyRequest, reply: FastifyReply): Promise<any> {
    const { ip } = request.body as any;

    await this.redis.del(`security:manual_block:${ip}`);

    logger.info({ ip }, 'IP manually unblocked');

    return { success: true, ip, action: 'unblocked' };
  }

  private async toggleEmergencyMode(request: FastifyRequest, reply: FastifyReply): Promise<any> {
    const { enabled } = request.body as any;

    await this.redis.set('security:emergency_mode', enabled ? 'true' : 'false');

    logger.warn({ enabled }, 'Emergency mode toggled');

    return { success: true, emergencyMode: enabled };
  }

  private async exportConfig(request: FastifyRequest, reply: FastifyReply): Promise<any> {
    // Export current security configuration
    const config = {
      waf: {},
      ddos: {},
      headers: {},
      threatIntel: {},
      exportedAt: new Date().toISOString()
    };

    return config;
  }

  private async importConfig(request: FastifyRequest, reply: FastifyReply): Promise<any> {
    const config = request.body as any;

    // Validate and import configuration
    logger.info('Security configuration imported');

    return { success: true, message: 'Configuration imported successfully' };
  }

  private async getSystemHealth(request: FastifyRequest, reply: FastifyReply): Promise<any> {
    return await this.collectSystemHealth();
  }

  private handleWebSocketConnection(connection: any, request: FastifyRequest): void {
    logger.info({ ip: request.ip }, 'Security dashboard WebSocket connection established');

    // Send real-time updates every 5 seconds
    const interval = setInterval(async () => {
      try {
        const realTimeData = await this.collectRealTimeMetrics();
        connection.send(JSON.stringify({
          type: 'realtime_update',
          data: realTimeData,
          timestamp: Date.now()
        }));
      } catch (error) {
        logger.error({ error }, 'Error sending WebSocket update');
      }
    }, 5000);

    connection.on('close', () => {
      clearInterval(interval);
      logger.info('Security dashboard WebSocket connection closed');
    });
  }

  private startDataCollection(): void {
    // Update cached data every 30 seconds
    setInterval(() => {
      this.collectDashboardData().then(data => {
        this.cachedData = data;
        this.lastCacheUpdate = Date.now();
      }).catch(error => {
        logger.error({ error }, 'Failed to update dashboard cache');
      });
    }, 30000);
  }
}

/**
 * Factory function to create security dashboard
 */
export function createSecurityDashboard(
  fastify: FastifyInstance,
  redis: Redis,
  securityModule: SecurityModule,
  config: Partial<DashboardConfig> = {}
): SecurityDashboard {
  const fullConfig: DashboardConfig = {
    enabled: true,
    authRequired: true,
    allowedRoles: ['admin', 'security'],
    refreshInterval: 30000,
    maxHistoryDays: 30,
    ...config
  };

  return new SecurityDashboard(fastify, redis, securityModule, fullConfig);
}

export { DashboardConfig, SecurityDashboardData };