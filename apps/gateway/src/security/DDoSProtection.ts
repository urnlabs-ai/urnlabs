/**
 * Advanced DDoS Protection for API Gateway
 *
 * Comprehensive DDoS protection system with adaptive rate limiting,
 * connection management, and automated incident response.
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { Redis } from 'ioredis';
import { ThreatIntelligence } from './ThreatIntelligence.js';
import { logger } from '../lib/logger.js';

interface DDoSConfig {
  enabled: boolean;

  // Rate limiting configuration
  globalRateLimit: {
    windowMs: number;
    max: number;
  };

  ipRateLimit: {
    windowMs: number;
    max: number;
    burst: number;
  };

  pathRateLimit: {
    [path: string]: {
      windowMs: number;
      max: number;
    };
  };

  // Connection limiting
  maxConcurrentConnections: number;
  maxConnectionsPerIP: number;

  // Detection thresholds
  suspiciousThreshold: number;
  attackThreshold: number;

  // Protection modes
  adaptiveMode: boolean;
  autoBlockingEnabled: boolean;
  challengeMode: boolean;

  // Whitelisting
  whitelistedIPs: string[];
  trustedProxies: string[];

  // Response configuration
  blockDuration: number;
  challengeDuration: number;

  // Advanced features
  enableGeoBlocking: boolean;
  enableBehaviorAnalysis: boolean;
  enableEmergencyMode: boolean;
}

interface ConnectionInfo {
  ip: string;
  userAgent: string;
  timestamp: number;
  requestCount: number;
  lastRequestTime: number;
  suspiciousScore: number;
  blocked: boolean;
  challengeRequired: boolean;
  geoInfo?: any;
}

interface AttackPattern {
  type: 'volumetric' | 'protocol' | 'application';
  severity: 'low' | 'medium' | 'high' | 'critical';
  confidence: number;
  indicators: string[];
  timestamp: number;
}

interface DDoSDecision {
  action: 'allow' | 'challenge' | 'rate_limit' | 'block' | 'emergency_block';
  reason: string;
  remainingRequests?: number;
  resetTime?: number;
  challengeId?: string;
  blockDuration?: number;
  metadata: Record<string, any>;
}

/**
 * Advanced DDoS Protection Engine
 */
export class DDoSProtection {
  private redis: Redis;
  private config: DDoSConfig;
  private threatIntelligence: ThreatIntelligence;

  // In-memory tracking for performance
  private connectionMap: Map<string, ConnectionInfo> = new Map();
  private globalRequestCount: number = 0;
  private lastGlobalReset: number = Date.now();

  // Attack detection
  private detectedPatterns: Map<string, AttackPattern> = new Map();
  private emergencyMode: boolean = false;
  private emergencyModeStart: number = 0;

  constructor(redis: Redis, config: DDoSConfig, threatIntelligence: ThreatIntelligence) {
    this.redis = redis;
    this.config = config;
    this.threatIntelligence = threatIntelligence;

    this.initializeProtection();
  }

  /**
   * Initialize DDoS protection
   */
  private async initializeProtection(): Promise<void> {
    try {
      // Start background monitoring
      this.startBackgroundMonitoring();

      // Load existing blocks from Redis
      await this.loadExistingBlocks();

      logger.info('DDoS Protection initialized successfully');
    } catch (error) {
      logger.error({ error }, 'Failed to initialize DDoS Protection');
      throw error;
    }
  }

  /**
   * Main DDoS protection middleware
   */
  public middleware() {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      const startTime = Date.now();

      try {
        // Quick bypass for whitelisted IPs
        if (this.isWhitelisted(request.ip)) {
          return;
        }

        // Get or create connection info
        const connectionInfo = await this.getConnectionInfo(request);

        // Check for existing blocks
        if (connectionInfo.blocked) {
          return this.handleBlocked(connectionInfo, reply);
        }

        // Analyze request for DDoS patterns
        const decision = await this.analyzeRequest(request, connectionInfo);

        // Apply protection decision
        await this.applyDecision(decision, connectionInfo, request, reply);

        // Update connection tracking
        await this.updateConnectionInfo(request, connectionInfo);

        // Log metrics
        this.logMetrics(request, decision, Date.now() - startTime);

      } catch (error) {
        logger.error({ error, url: request.url, ip: request.ip }, 'DDoS Protection error');
        // Fail open to maintain availability
        return;
      }
    };
  }

  /**
   * Analyze request for DDoS patterns
   */
  private async analyzeRequest(request: FastifyRequest, connectionInfo: ConnectionInfo): Promise<DDoSDecision> {
    const now = Date.now();

    // Emergency mode check
    if (this.emergencyMode) {
      return this.handleEmergencyMode(request, connectionInfo);
    }

    // Global rate limit check
    const globalDecision = this.checkGlobalRateLimit();
    if (globalDecision.action !== 'allow') {
      return globalDecision;
    }

    // IP-based rate limit check
    const ipDecision = await this.checkIPRateLimit(request, connectionInfo);
    if (ipDecision.action !== 'allow') {
      return ipDecision;
    }

    // Path-specific rate limit check
    const pathDecision = await this.checkPathRateLimit(request);
    if (pathDecision.action !== 'allow') {
      return pathDecision;
    }

    // Connection limit check
    const connectionDecision = await this.checkConnectionLimits(request);
    if (connectionDecision.action !== 'allow') {
      return connectionDecision;
    }

    // Behavioral analysis
    const behaviorDecision = await this.analyzeBehavior(request, connectionInfo);
    if (behaviorDecision.action !== 'allow') {
      return behaviorDecision;
    }

    // Pattern detection
    const patternDecision = await this.detectAttackPatterns(request, connectionInfo);
    if (patternDecision.action !== 'allow') {
      return patternDecision;
    }

    return {
      action: 'allow',
      reason: 'Request passed all DDoS checks',
      metadata: { timestamp: now }
    };
  }

  /**
   * Check global rate limits
   */
  private checkGlobalRateLimit(): DDoSDecision {
    const now = Date.now();
    const windowMs = this.config.globalRateLimit.windowMs;

    // Reset window if needed
    if (now - this.lastGlobalReset > windowMs) {
      this.globalRequestCount = 0;
      this.lastGlobalReset = now;
    }

    this.globalRequestCount++;

    if (this.globalRequestCount > this.config.globalRateLimit.max) {
      // Trigger emergency mode if global limits severely exceeded
      if (this.globalRequestCount > this.config.globalRateLimit.max * 2) {
        this.activateEmergencyMode('Global rate limit severely exceeded');
      }

      return {
        action: 'rate_limit',
        reason: 'Global rate limit exceeded',
        remainingRequests: 0,
        resetTime: this.lastGlobalReset + windowMs,
        metadata: {
          globalRequestCount: this.globalRequestCount,
          globalLimit: this.config.globalRateLimit.max
        }
      };
    }

    return {
      action: 'allow',
      reason: 'Within global rate limits',
      remainingRequests: this.config.globalRateLimit.max - this.globalRequestCount,
      metadata: { globalRequestCount: this.globalRequestCount }
    };
  }

  /**
   * Check IP-based rate limits with adaptive thresholds
   */
  private async checkIPRateLimit(request: FastifyRequest, connectionInfo: ConnectionInfo): Promise<DDoSDecision> {
    const now = Date.now();
    const windowMs = this.config.ipRateLimit.windowMs;
    const baseLimit = this.config.ipRateLimit.max;

    // Get current request count for this IP
    const key = `ddos:ip:${request.ip}`;
    const requestCount = await this.redis.incr(key);

    if (requestCount === 1) {
      await this.redis.expire(key, Math.ceil(windowMs / 1000));
    }

    // Adaptive limit based on reputation and behavior
    let adaptiveLimit = baseLimit;

    if (this.config.adaptiveMode) {
      const reputation = await this.threatIntelligence.getIPReputation(request.ip);
      const behaviorScore = connectionInfo.suspiciousScore;

      // Reduce limit for suspicious IPs
      if (reputation < 0.5 || behaviorScore > 0.7) {
        adaptiveLimit = Math.floor(baseLimit * 0.5);
      } else if (reputation < 0.7 || behaviorScore > 0.5) {
        adaptiveLimit = Math.floor(baseLimit * 0.75);
      }
    }

    // Check for burst requests
    const timeSinceLastRequest = now - connectionInfo.lastRequestTime;
    if (timeSinceLastRequest < 100 && requestCount > this.config.ipRateLimit.burst) {
      // Potential burst attack
      await this.logSuspiciousActivity(request.ip, 'burst_requests', {
        requestCount,
        timeDiff: timeSinceLastRequest
      });

      return {
        action: 'challenge',
        reason: 'Burst request pattern detected',
        challengeId: await this.generateChallenge(request.ip),
        metadata: { requestCount, adaptiveLimit, burstDetected: true }
      };
    }

    if (requestCount > adaptiveLimit) {
      // Escalate to block if severely exceeded
      if (requestCount > adaptiveLimit * 2) {
        await this.blockIP(request.ip, 'rate_limit_exceeded', this.config.blockDuration);

        return {
          action: 'block',
          reason: 'IP rate limit severely exceeded',
          blockDuration: this.config.blockDuration,
          metadata: { requestCount, adaptiveLimit }
        };
      }

      return {
        action: 'rate_limit',
        reason: 'IP rate limit exceeded',
        remainingRequests: 0,
        resetTime: now + windowMs,
        metadata: { requestCount, adaptiveLimit }
      };
    }

    return {
      action: 'allow',
      reason: 'Within IP rate limits',
      remainingRequests: adaptiveLimit - requestCount,
      metadata: { requestCount, adaptiveLimit }
    };
  }

  /**
   * Check path-specific rate limits
   */
  private async checkPathRateLimit(request: FastifyRequest): Promise<DDoSDecision> {
    const path = this.normalizePath(request.url);
    const pathConfig = this.config.pathRateLimit[path];

    if (!pathConfig) {
      return { action: 'allow', reason: 'No path-specific limits', metadata: {} };
    }

    const key = `ddos:path:${request.ip}:${path}`;
    const requestCount = await this.redis.incr(key);

    if (requestCount === 1) {
      await this.redis.expire(key, Math.ceil(pathConfig.windowMs / 1000));
    }

    if (requestCount > pathConfig.max) {
      return {
        action: 'rate_limit',
        reason: `Path rate limit exceeded for ${path}`,
        remainingRequests: 0,
        resetTime: Date.now() + pathConfig.windowMs,
        metadata: { path, requestCount, limit: pathConfig.max }
      };
    }

    return {
      action: 'allow',
      reason: 'Within path rate limits',
      remainingRequests: pathConfig.max - requestCount,
      metadata: { path, requestCount }
    };
  }

  /**
   * Check connection limits
   */
  private async checkConnectionLimits(request: FastifyRequest): Promise<DDoSDecision> {
    // Check global connection count
    const globalConnections = this.connectionMap.size;
    if (globalConnections > this.config.maxConcurrentConnections) {
      return {
        action: 'rate_limit',
        reason: 'Global connection limit exceeded',
        metadata: { globalConnections, limit: this.config.maxConcurrentConnections }
      };
    }

    // Check per-IP connection count
    const ipConnections = Array.from(this.connectionMap.values())
      .filter(conn => conn.ip === request.ip).length;

    if (ipConnections > this.config.maxConnectionsPerIP) {
      return {
        action: 'challenge',
        reason: 'Per-IP connection limit exceeded',
        challengeId: await this.generateChallenge(request.ip),
        metadata: { ipConnections, limit: this.config.maxConnectionsPerIP }
      };
    }

    return { action: 'allow', reason: 'Within connection limits', metadata: {} };
  }

  /**
   * Analyze behavioral patterns
   */
  private async analyzeBehavior(request: FastifyRequest, connectionInfo: ConnectionInfo): Promise<DDoSDecision> {
    if (!this.config.enableBehaviorAnalysis) {
      return { action: 'allow', reason: 'Behavior analysis disabled', metadata: {} };
    }

    const now = Date.now();
    let suspiciousScore = connectionInfo.suspiciousScore;

    // Analyze request patterns
    const patterns = this.analyzeBehaviorPatterns(request, connectionInfo);

    // Update suspicious score based on patterns
    patterns.forEach(pattern => {
      switch (pattern.type) {
        case 'rapid_requests':
          suspiciousScore += 0.3;
          break;
        case 'unusual_user_agent':
          suspiciousScore += 0.2;
          break;
        case 'missing_headers':
          suspiciousScore += 0.1;
          break;
        case 'suspicious_patterns':
          suspiciousScore += 0.4;
          break;
      }
    });

    // Cap the score
    suspiciousScore = Math.min(suspiciousScore, 1.0);
    connectionInfo.suspiciousScore = suspiciousScore;

    // Determine action based on score
    if (suspiciousScore >= this.config.attackThreshold) {
      await this.blockIP(request.ip, 'behavioral_analysis', this.config.blockDuration);

      return {
        action: 'block',
        reason: 'Malicious behavior detected',
        blockDuration: this.config.blockDuration,
        metadata: { suspiciousScore, patterns }
      };
    }

    if (suspiciousScore >= this.config.suspiciousThreshold) {
      return {
        action: 'challenge',
        reason: 'Suspicious behavior detected',
        challengeId: await this.generateChallenge(request.ip),
        metadata: { suspiciousScore, patterns }
      };
    }

    return { action: 'allow', reason: 'Normal behavior', metadata: { suspiciousScore } };
  }

  /**
   * Detect attack patterns
   */
  private async detectAttackPatterns(request: FastifyRequest, connectionInfo: ConnectionInfo): Promise<DDoSDecision> {
    const patterns: AttackPattern[] = [];

    // Volumetric attack detection
    if (this.globalRequestCount > this.config.globalRateLimit.max * 1.5) {
      patterns.push({
        type: 'volumetric',
        severity: 'high',
        confidence: 0.8,
        indicators: ['high_global_volume'],
        timestamp: Date.now()
      });
    }

    // Protocol attack detection
    const protocolAnomalies = this.detectProtocolAnomalies(request);
    if (protocolAnomalies.length > 0) {
      patterns.push({
        type: 'protocol',
        severity: 'medium',
        confidence: 0.6,
        indicators: protocolAnomalies,
        timestamp: Date.now()
      });
    }

    // Application layer attack detection
    const appAnomalies = this.detectApplicationAnomalies(request);
    if (appAnomalies.length > 0) {
      patterns.push({
        type: 'application',
        severity: 'medium',
        confidence: 0.7,
        indicators: appAnomalies,
        timestamp: Date.now()
      });
    }

    // Store detected patterns
    if (patterns.length > 0) {
      const patternKey = `${request.ip}_${Date.now()}`;
      this.detectedPatterns.set(patternKey, patterns[0]);

      // Check if this should trigger emergency mode
      const criticalPatterns = patterns.filter(p => p.severity === 'critical').length;
      const highPatterns = patterns.filter(p => p.severity === 'high').length;

      if (criticalPatterns > 0 || highPatterns > 2) {
        this.activateEmergencyMode('Critical attack patterns detected');
      }

      return {
        action: 'challenge',
        reason: 'Attack patterns detected',
        challengeId: await this.generateChallenge(request.ip),
        metadata: { patterns }
      };
    }

    return { action: 'allow', reason: 'No attack patterns detected', metadata: {} };
  }

  /**
   * Handle emergency mode
   */
  private handleEmergencyMode(request: FastifyRequest, connectionInfo: ConnectionInfo): DDoSDecision {
    // Only allow highly trusted IPs in emergency mode
    const isTrusted = this.config.trustedProxies.includes(request.ip) ||
                     connectionInfo.suspiciousScore < 0.1;

    if (!isTrusted) {
      return {
        action: 'emergency_block',
        reason: 'Emergency mode active - blocking non-trusted traffic',
        blockDuration: this.config.blockDuration * 2,
        metadata: { emergencyMode: true, emergencyStart: this.emergencyModeStart }
      };
    }

    return {
      action: 'allow',
      reason: 'Trusted traffic allowed during emergency mode',
      metadata: { emergencyMode: true, trusted: true }
    };
  }

  /**
   * Apply DDoS protection decision
   */
  private async applyDecision(
    decision: DDoSDecision,
    connectionInfo: ConnectionInfo,
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    switch (decision.action) {
      case 'rate_limit':
        await this.handleRateLimit(decision, reply);
        break;
      case 'challenge':
        await this.handleChallenge(decision, connectionInfo, reply);
        break;
      case 'block':
      case 'emergency_block':
        await this.handleBlock(decision, connectionInfo, reply);
        break;
      case 'allow':
        // Request continues normally
        break;
    }

    // Log the decision
    await this.logDecision(request, decision);
  }

  /**
   * Handle rate limit response
   */
  private async handleRateLimit(decision: DDoSDecision, reply: FastifyReply): Promise<void> {
    const headers: Record<string, any> = {
      'X-RateLimit-Limit': this.config.ipRateLimit.max,
      'X-RateLimit-Remaining': decision.remainingRequests || 0,
      'Retry-After': Math.ceil((decision.resetTime || Date.now()) / 1000)
    };

    if (decision.resetTime) {
      headers['X-RateLimit-Reset'] = Math.ceil(decision.resetTime / 1000);
    }

    Object.entries(headers).forEach(([key, value]) => {
      reply.header(key, value);
    });

    return reply.status(429).send({
      error: 'Rate limit exceeded',
      code: 'RATE_LIMIT_EXCEEDED',
      message: decision.reason,
      retryAfter: headers['Retry-After']
    });
  }

  /**
   * Handle challenge response
   */
  private async handleChallenge(
    decision: DDoSDecision,
    connectionInfo: ConnectionInfo,
    reply: FastifyReply
  ): Promise<void> {
    connectionInfo.challengeRequired = true;

    return reply.status(429).send({
      error: 'Security challenge required',
      code: 'CHALLENGE_REQUIRED',
      challengeId: decision.challengeId,
      message: decision.reason,
      instructions: 'Complete the security challenge to continue'
    });
  }

  /**
   * Handle block response
   */
  private async handleBlock(
    decision: DDoSDecision,
    connectionInfo: ConnectionInfo,
    reply: FastifyReply
  ): Promise<void> {
    connectionInfo.blocked = true;

    const statusCode = decision.action === 'emergency_block' ? 503 : 429;

    return reply.status(statusCode).send({
      error: 'Request blocked',
      code: decision.action === 'emergency_block' ? 'EMERGENCY_BLOCK' : 'BLOCKED',
      message: decision.reason,
      blockDuration: decision.blockDuration
    });
  }

  /**
   * Handle already blocked IP
   */
  private async handleBlocked(connectionInfo: ConnectionInfo, reply: FastifyReply): Promise<void> {
    return reply.status(429).send({
      error: 'IP address blocked',
      code: 'IP_BLOCKED',
      message: 'Your IP address has been temporarily blocked due to suspicious activity'
    });
  }

  // Utility methods
  private isWhitelisted(ip: string): boolean {
    return this.config.whitelistedIPs.includes(ip);
  }

  private async getConnectionInfo(request: FastifyRequest): Promise<ConnectionInfo> {
    let connectionInfo = this.connectionMap.get(request.ip);

    if (!connectionInfo) {
      // Check Redis for persistent data
      const redisData = await this.redis.get(`ddos:connection:${request.ip}`);

      connectionInfo = redisData ? JSON.parse(redisData) : {
        ip: request.ip,
        userAgent: request.headers['user-agent'] as string || '',
        timestamp: Date.now(),
        requestCount: 0,
        lastRequestTime: 0,
        suspiciousScore: 0,
        blocked: false,
        challengeRequired: false
      };

      this.connectionMap.set(request.ip, connectionInfo);
    }

    return connectionInfo;
  }

  private async updateConnectionInfo(request: FastifyRequest, connectionInfo: ConnectionInfo): Promise<void> {
    connectionInfo.requestCount++;
    connectionInfo.lastRequestTime = Date.now();

    // Persist to Redis
    await this.redis.setex(
      `ddos:connection:${request.ip}`,
      3600, // 1 hour TTL
      JSON.stringify(connectionInfo)
    );
  }

  private normalizePath(url: string): string {
    // Remove query parameters and normalize path
    return url.split('?')[0].replace(/\/+/g, '/');
  }

  private analyzeBehaviorPatterns(request: FastifyRequest, connectionInfo: ConnectionInfo): Array<{type: string, confidence: number}> {
    const patterns: Array<{type: string, confidence: number}> = [];

    // Rapid request pattern
    const timeDiff = Date.now() - connectionInfo.lastRequestTime;
    if (timeDiff < 50) {
      patterns.push({ type: 'rapid_requests', confidence: 0.8 });
    }

    // Unusual user agent
    const userAgent = request.headers['user-agent'] as string || '';
    if (!userAgent || userAgent.length < 10 || /bot|crawler|spider/i.test(userAgent)) {
      patterns.push({ type: 'unusual_user_agent', confidence: 0.6 });
    }

    // Missing common headers
    const commonHeaders = ['accept', 'accept-language', 'accept-encoding'];
    const missingHeaders = commonHeaders.filter(header => !request.headers[header]);
    if (missingHeaders.length > 1) {
      patterns.push({ type: 'missing_headers', confidence: 0.4 });
    }

    return patterns;
  }

  private detectProtocolAnomalies(request: FastifyRequest): string[] {
    const anomalies: string[] = [];

    // Check for unusual HTTP methods
    if (!['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'].includes(request.method)) {
      anomalies.push('unusual_http_method');
    }

    // Check for malformed headers
    const headerString = JSON.stringify(request.headers);
    if (headerString.includes('\x00') || headerString.includes('\r\n')) {
      anomalies.push('malformed_headers');
    }

    return anomalies;
  }

  private detectApplicationAnomalies(request: FastifyRequest): string[] {
    const anomalies: string[] = [];

    // Check URL patterns
    const url = request.url;
    if (url.length > 2000) {
      anomalies.push('oversized_url');
    }

    if (/[<>"\']/.test(url)) {
      anomalies.push('suspicious_url_characters');
    }

    return anomalies;
  }

  private async blockIP(ip: string, reason: string, duration: number): Promise<void> {
    await this.redis.setex(`ddos:blocked:${ip}`, duration / 1000, JSON.stringify({
      reason,
      timestamp: Date.now(),
      duration
    }));

    logger.warn({ ip, reason, duration }, 'IP blocked by DDoS protection');
  }

  private async generateChallenge(ip: string): Promise<string> {
    const challengeId = `challenge_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    await this.redis.setex(`ddos:challenge:${challengeId}`, 300, JSON.stringify({
      ip,
      timestamp: Date.now()
    }));

    return challengeId;
  }

  private activateEmergencyMode(reason: string): void {
    if (!this.emergencyMode) {
      this.emergencyMode = true;
      this.emergencyModeStart = Date.now();

      logger.error({ reason }, 'Emergency mode activated');

      // Auto-deactivate after 10 minutes
      setTimeout(() => {
        this.emergencyMode = false;
        logger.info('Emergency mode deactivated');
      }, 600000);
    }
  }

  private async logSuspiciousActivity(ip: string, type: string, metadata: any): Promise<void> {
    await this.redis.lpush('ddos:suspicious_activity', JSON.stringify({
      ip,
      type,
      metadata,
      timestamp: Date.now()
    }));
  }

  private async logDecision(request: FastifyRequest, decision: DDoSDecision): Promise<void> {
    if (decision.action !== 'allow') {
      logger.warn({
        ip: request.ip,
        method: request.method,
        url: request.url,
        userAgent: request.headers['user-agent'],
        decision
      }, 'DDoS Protection Decision');
    }
  }

  private logMetrics(request: FastifyRequest, decision: DDoSDecision, processingTime: number): void {
    logger.debug({
      processingTime,
      action: decision.action,
      ip: request.ip
    }, 'DDoS Protection Metrics');
  }

  private startBackgroundMonitoring(): void {
    // Clean up old connections every 5 minutes
    setInterval(() => {
      const now = Date.now();
      const staleThreshold = 5 * 60 * 1000; // 5 minutes

      for (const [ip, info] of this.connectionMap.entries()) {
        if (now - info.lastRequestTime > staleThreshold) {
          this.connectionMap.delete(ip);
        }
      }
    }, 300000);

    // Monitor attack patterns every minute
    setInterval(() => {
      this.analyzeAttackTrends();
    }, 60000);
  }

  private async loadExistingBlocks(): Promise<void> {
    // Load blocked IPs from Redis
    const keys = await this.redis.keys('ddos:blocked:*');

    for (const key of keys) {
      const ip = key.replace('ddos:blocked:', '');
      const connectionInfo = this.connectionMap.get(ip);

      if (connectionInfo) {
        connectionInfo.blocked = true;
      }
    }
  }

  private analyzeAttackTrends(): void {
    // Analyze patterns and adjust emergency mode if needed
    const recentPatterns = Array.from(this.detectedPatterns.values())
      .filter(pattern => Date.now() - pattern.timestamp < 300000); // Last 5 minutes

    const criticalCount = recentPatterns.filter(p => p.severity === 'critical').length;
    const highCount = recentPatterns.filter(p => p.severity === 'high').length;

    if (criticalCount > 5 || highCount > 10) {
      this.activateEmergencyMode('High volume of attack patterns detected');
    }
  }
}

/**
 * Factory function to create DDoS protection middleware
 */
export function createDDoSProtectionMiddleware(
  redis: Redis,
  config: DDoSConfig,
  threatIntelligence: ThreatIntelligence
) {
  const ddosProtection = new DDoSProtection(redis, config, threatIntelligence);
  return ddosProtection.middleware();
}

/**
 * Default DDoS protection configuration
 */
export const DEFAULT_DDOS_CONFIG: DDoSConfig = {
  enabled: true,

  globalRateLimit: {
    windowMs: 60000, // 1 minute
    max: 10000 // 10k requests per minute globally
  },

  ipRateLimit: {
    windowMs: 60000, // 1 minute
    max: 100, // 100 requests per minute per IP
    burst: 20 // 20 requests in rapid succession
  },

  pathRateLimit: {
    '/api/auth/login': {
      windowMs: 900000, // 15 minutes
      max: 5 // 5 login attempts per 15 minutes
    },
    '/api/auth/register': {
      windowMs: 3600000, // 1 hour
      max: 3 // 3 registrations per hour
    }
  },

  maxConcurrentConnections: 1000,
  maxConnectionsPerIP: 10,

  suspiciousThreshold: 0.6,
  attackThreshold: 0.8,

  adaptiveMode: true,
  autoBlockingEnabled: true,
  challengeMode: true,

  whitelistedIPs: ['127.0.0.1', '::1'],
  trustedProxies: [],

  blockDuration: 300000, // 5 minutes
  challengeDuration: 600000, // 10 minutes

  enableGeoBlocking: true,
  enableBehaviorAnalysis: true,
  enableEmergencyMode: true
};