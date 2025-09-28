/**
 * Gateway WAF Engine
 *
 * Enterprise-grade Web Application Firewall engine specifically designed
 * for the Urnlabs API Gateway. Integrates with existing security services
 * and provides comprehensive protection against web attacks.
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { Redis } from 'ioredis';
import { WAFService } from '../../../../packages/security/src/services/waf/waf-service.js';
import { WAFConfig, ThreatLevel, WAFAction, WAFRule, AttackPattern } from '../../../../packages/security/src/services/waf/types.js';
import { ThreatIntelligence } from './ThreatIntelligence.js';
import { logger } from '../lib/logger.js';

interface WAFEngineConfig extends WAFConfig {
  enableRealTimeBlocking: boolean;
  enableGeoBlocking: boolean;
  enableBehaviorAnalysis: boolean;
  enableMachineLearning: boolean;
  bypassTokens: string[];
  whitelistedIPs: string[];
  maxRequestSize: number;
  customRules: WAFRule[];
}

interface RequestContext {
  ip: string;
  userAgent: string;
  method: string;
  url: string;
  headers: Record<string, any>;
  body?: any;
  query?: Record<string, any>;
  params?: Record<string, any>;
  timestamp: number;
  sessionId?: string;
  userId?: string;
}

interface WAFDecision {
  action: WAFAction;
  reason: string;
  threatLevel: ThreatLevel;
  riskScore: number;
  attackPatterns: AttackPattern[];
  recommendedAction: string;
  metadata: Record<string, any>;
}

/**
 * Advanced WAF Engine for the API Gateway
 */
export class WAFEngine {
  private wafService: WAFService;
  private threatIntelligence: ThreatIntelligence;
  private redis: Redis;
  private config: WAFEngineConfig;
  private attackPatterns: Map<string, AttackPattern[]> = new Map();
  private ipReputationCache: Map<string, number> = new Map();
  private behaviorProfiles: Map<string, any> = new Map();

  constructor(redis: Redis, config: WAFEngineConfig, threatIntelligence: ThreatIntelligence) {
    this.redis = redis;
    this.config = config;
    this.threatIntelligence = threatIntelligence;
    this.wafService = new WAFService(config, redis);

    this.initializeEngine();
  }

  /**
   * Initialize the WAF engine with patterns and rules
   */
  private async initializeEngine(): Promise<void> {
    try {
      // Load attack patterns
      await this.loadAttackPatterns();

      // Initialize behavior analysis
      if (this.config.enableBehaviorAnalysis) {
        await this.initializeBehaviorAnalysis();
      }

      // Load threat intelligence feeds
      if (this.config.enableMachineLearning) {
        await this.threatIntelligence.updateThreatFeeds();
      }

      logger.info('WAF Engine initialized successfully');
    } catch (error) {
      logger.error({ error }, 'Failed to initialize WAF Engine');
      throw error;
    }
  }

  /**
   * Main WAF middleware function
   */
  public middleware() {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      const startTime = Date.now();

      try {
        const context = this.buildRequestContext(request);

        // Quick bypass checks
        if (await this.shouldBypass(context)) {
          this.logBypass(context);
          return;
        }

        // Perform comprehensive analysis
        const decision = await this.analyzeRequest(context);

        // Apply decision
        await this.applyDecision(decision, context, reply);

        // Log metrics
        this.logMetrics(context, decision, Date.now() - startTime);

      } catch (error) {
        logger.error({ error, url: request.url, ip: request.ip }, 'WAF Engine error');
        // Fail open for critical errors to maintain availability
        return;
      }
    };
  }

  /**
   * Build request context for analysis
   */
  private buildRequestContext(request: FastifyRequest): RequestContext {
    return {
      ip: request.ip,
      userAgent: request.headers['user-agent'] as string || '',
      method: request.method,
      url: request.url,
      headers: request.headers,
      body: request.body,
      query: request.query as Record<string, any>,
      params: request.params as Record<string, any>,
      timestamp: Date.now(),
      sessionId: this.extractSessionId(request),
      userId: this.extractUserId(request)
    };
  }

  /**
   * Comprehensive request analysis
   */
  private async analyzeRequest(context: RequestContext): Promise<WAFDecision> {
    const analysisPromises = [
      this.analyzeSignatureBased(context),
      this.analyzeAnomaly(context),
      this.analyzeReputation(context),
      this.analyzeBehavior(context),
      this.analyzeGeoLocation(context)
    ];

    const results = await Promise.all(analysisPromises);

    return this.consolidateAnalysis(results, context);
  }

  /**
   * Signature-based attack detection
   */
  private async analyzeSignatureBased(context: RequestContext): Promise<Partial<WAFDecision>> {
    const patterns = await this.getAttackPatterns(context.url);
    const detectedPatterns: AttackPattern[] = [];
    let riskScore = 0;

    // SQL Injection detection
    const sqlInjectionScore = this.detectSQLInjection(context);
    if (sqlInjectionScore > 0.7) {
      detectedPatterns.push({
        type: 'sql_injection',
        confidence: sqlInjectionScore,
        evidence: this.extractSQLInjectionEvidence(context)
      });
      riskScore += sqlInjectionScore * 0.8;
    }

    // XSS detection
    const xssScore = this.detectXSS(context);
    if (xssScore > 0.6) {
      detectedPatterns.push({
        type: 'xss',
        confidence: xssScore,
        evidence: this.extractXSSEvidence(context)
      });
      riskScore += xssScore * 0.7;
    }

    // Command injection detection
    const cmdInjectionScore = this.detectCommandInjection(context);
    if (cmdInjectionScore > 0.8) {
      detectedPatterns.push({
        type: 'command_injection',
        confidence: cmdInjectionScore,
        evidence: this.extractCommandInjectionEvidence(context)
      });
      riskScore += cmdInjectionScore * 0.9;
    }

    // Path traversal detection
    const pathTraversalScore = this.detectPathTraversal(context);
    if (pathTraversalScore > 0.6) {
      detectedPatterns.push({
        type: 'path_traversal',
        confidence: pathTraversalScore,
        evidence: this.extractPathTraversalEvidence(context)
      });
      riskScore += pathTraversalScore * 0.6;
    }

    return {
      attackPatterns: detectedPatterns,
      riskScore: Math.min(riskScore, 1.0),
      metadata: { analysisType: 'signature_based' }
    };
  }

  /**
   * Anomaly-based detection
   */
  private async analyzeAnomaly(context: RequestContext): Promise<Partial<WAFDecision>> {
    let anomalyScore = 0;
    const anomalies: string[] = [];

    // Request size anomaly
    const requestSize = this.calculateRequestSize(context);
    if (requestSize > this.config.maxRequestSize) {
      anomalyScore += 0.6;
      anomalies.push(`oversized_request:${requestSize}`);
    }

    // Header anomalies
    const headerAnomalyScore = this.detectHeaderAnomalies(context);
    anomalyScore += headerAnomalyScore * 0.4;
    if (headerAnomalyScore > 0.5) {
      anomalies.push('suspicious_headers');
    }

    // Request frequency anomaly
    const frequencyScore = await this.analyzeRequestFrequency(context);
    anomalyScore += frequencyScore * 0.5;
    if (frequencyScore > 0.7) {
      anomalies.push('high_frequency');
    }

    return {
      riskScore: Math.min(anomalyScore, 1.0),
      metadata: {
        analysisType: 'anomaly_based',
        anomalies,
        requestSize
      }
    };
  }

  /**
   * IP reputation analysis
   */
  private async analyzeReputation(context: RequestContext): Promise<Partial<WAFDecision>> {
    const reputation = await this.getIPReputation(context.ip);
    let riskScore = 0;

    if (reputation < 0.3) {
      riskScore = 0.9;
    } else if (reputation < 0.5) {
      riskScore = 0.6;
    } else if (reputation < 0.7) {
      riskScore = 0.3;
    }

    return {
      riskScore,
      metadata: {
        analysisType: 'reputation',
        ipReputation: reputation
      }
    };
  }

  /**
   * Behavioral analysis
   */
  private async analyzeBehavior(context: RequestContext): Promise<Partial<WAFDecision>> {
    if (!this.config.enableBehaviorAnalysis) {
      return { riskScore: 0 };
    }

    const profile = await this.getBehaviorProfile(context.ip);
    const currentBehavior = this.extractBehaviorFeatures(context);

    const anomalyScore = this.calculateBehaviorAnomaly(profile, currentBehavior);

    // Update behavior profile
    await this.updateBehaviorProfile(context.ip, currentBehavior);

    return {
      riskScore: anomalyScore,
      metadata: {
        analysisType: 'behavioral',
        behaviorScore: anomalyScore
      }
    };
  }

  /**
   * Geolocation analysis
   */
  private async analyzeGeoLocation(context: RequestContext): Promise<Partial<WAFDecision>> {
    if (!this.config.enableGeoBlocking) {
      return { riskScore: 0 };
    }

    const geoInfo = await this.threatIntelligence.getGeoLocation(context.ip);
    let riskScore = 0;

    // Check against blocked countries
    if (geoInfo && this.config.blockedCountries?.includes(geoInfo.country)) {
      riskScore = 1.0;
    }

    // Check high-risk regions
    if (geoInfo && this.config.highRiskCountries?.includes(geoInfo.country)) {
      riskScore = 0.6;
    }

    return {
      riskScore,
      metadata: {
        analysisType: 'geolocation',
        geoInfo
      }
    };
  }

  /**
   * Consolidate analysis results into final decision
   */
  private consolidateAnalysis(results: Partial<WAFDecision>[], context: RequestContext): WAFDecision {
    let totalRiskScore = 0;
    let attackPatterns: AttackPattern[] = [];
    let metadata: Record<string, any> = {};

    results.forEach(result => {
      totalRiskScore += result.riskScore || 0;
      if (result.attackPatterns) {
        attackPatterns = [...attackPatterns, ...result.attackPatterns];
      }
      if (result.metadata) {
        metadata = { ...metadata, ...result.metadata };
      }
    });

    // Normalize risk score
    const normalizedRiskScore = Math.min(totalRiskScore / results.length, 1.0);

    // Determine threat level
    let threatLevel: ThreatLevel;
    if (normalizedRiskScore >= 0.8) {
      threatLevel = 'CRITICAL';
    } else if (normalizedRiskScore >= 0.6) {
      threatLevel = 'HIGH';
    } else if (normalizedRiskScore >= 0.4) {
      threatLevel = 'MEDIUM';
    } else if (normalizedRiskScore >= 0.2) {
      threatLevel = 'LOW';
    } else {
      threatLevel = 'NONE';
    }

    // Determine action
    let action: WAFAction;
    let reason: string;
    let recommendedAction: string;

    if (threatLevel === 'CRITICAL') {
      action = 'block';
      reason = 'Critical threat detected';
      recommendedAction = 'Block immediately and investigate';
    } else if (threatLevel === 'HIGH') {
      action = 'challenge';
      reason = 'High-risk request detected';
      recommendedAction = 'Challenge user and monitor closely';
    } else if (threatLevel === 'MEDIUM') {
      action = 'monitor';
      reason = 'Suspicious activity detected';
      recommendedAction = 'Log and monitor for patterns';
    } else {
      action = 'allow';
      reason = 'Request appears legitimate';
      recommendedAction = 'Allow with standard monitoring';
    }

    return {
      action,
      reason,
      threatLevel,
      riskScore: normalizedRiskScore,
      attackPatterns,
      recommendedAction,
      metadata: {
        ...metadata,
        analysisTimestamp: Date.now(),
        requestId: this.generateRequestId(context)
      }
    };
  }

  /**
   * Apply WAF decision
   */
  private async applyDecision(decision: WAFDecision, context: RequestContext, reply: FastifyReply): Promise<void> {
    switch (decision.action) {
      case 'block':
        await this.handleBlock(decision, context, reply);
        break;
      case 'challenge':
        await this.handleChallenge(decision, context, reply);
        break;
      case 'monitor':
        await this.handleMonitor(decision, context);
        break;
      case 'allow':
        await this.handleAllow(decision, context);
        break;
    }
  }

  /**
   * Handle block action
   */
  private async handleBlock(decision: WAFDecision, context: RequestContext, reply: FastifyReply): Promise<void> {
    // Log security event
    await this.logSecurityEvent('REQUEST_BLOCKED', decision, context);

    // Update threat intelligence
    await this.threatIntelligence.reportMaliciousIP(context.ip, decision.attackPatterns);

    // Return block response
    return reply.status(403).send({
      error: 'Request blocked by WAF',
      code: 'WAF_BLOCKED',
      requestId: decision.metadata.requestId,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Handle challenge action
   */
  private async handleChallenge(decision: WAFDecision, context: RequestContext, reply: FastifyReply): Promise<void> {
    // Log security event
    await this.logSecurityEvent('REQUEST_CHALLENGED', decision, context);

    // Generate challenge
    const challengeId = await this.generateChallenge(context);

    return reply.status(429).send({
      error: 'Security challenge required',
      code: 'WAF_CHALLENGE',
      challengeId,
      requestId: decision.metadata.requestId,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Handle monitor action
   */
  private async handleMonitor(decision: WAFDecision, context: RequestContext): Promise<void> {
    await this.logSecurityEvent('REQUEST_MONITORED', decision, context);
    // Request continues but is logged for analysis
  }

  /**
   * Handle allow action
   */
  private async handleAllow(decision: WAFDecision, context: RequestContext): Promise<void> {
    // Optional: Log legitimate requests for baseline learning
    if (this.config.enableMachineLearning) {
      await this.logLegitimateRequest(context);
    }
  }

  // Utility methods
  private async shouldBypass(context: RequestContext): Promise<boolean> {
    // Check whitelist
    if (this.config.whitelistedIPs.includes(context.ip)) {
      return true;
    }

    // Check bypass tokens
    const authHeader = context.headers.authorization;
    if (authHeader && this.config.bypassTokens.some(token => authHeader.includes(token))) {
      return true;
    }

    return false;
  }

  private detectSQLInjection(context: RequestContext): number {
    const sqlPatterns = [
      /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|UNION|ALTER)\b)/i,
      /(\b(OR|AND)\s+\d+\s*=\s*\d+)/i,
      /([\'"]\s*;\s*--)/i,
      /(\bEXEC\s*\()/i
    ];

    return this.calculatePatternScore(context, sqlPatterns);
  }

  private detectXSS(context: RequestContext): number {
    const xssPatterns = [
      /<script[^>]*>.*?<\/script>/i,
      /javascript:/i,
      /on\w+\s*=/i,
      /<iframe[^>]*>/i,
      /eval\s*\(/i
    ];

    return this.calculatePatternScore(context, xssPatterns);
  }

  private detectCommandInjection(context: RequestContext): number {
    const cmdPatterns = [
      /[;&|`].*?(ls|cat|pwd|whoami|id|uname)/i,
      /\$\([^)]*\)/,
      /\|\s*(nc|netcat|curl|wget)/i
    ];

    return this.calculatePatternScore(context, cmdPatterns);
  }

  private detectPathTraversal(context: RequestContext): number {
    const traversalPatterns = [
      /\.\.\//,
      /\.\.\\/,
      /%2e%2e%2f/i,
      /%252e%252e%252f/i
    ];

    return this.calculatePatternScore(context, traversalPatterns);
  }

  private calculatePatternScore(context: RequestContext, patterns: RegExp[]): number {
    const testString = `${context.url} ${JSON.stringify(context.query)} ${JSON.stringify(context.body)}`;

    let matches = 0;
    patterns.forEach(pattern => {
      if (pattern.test(testString)) {
        matches++;
      }
    });

    return Math.min(matches / patterns.length, 1.0);
  }

  private async getIPReputation(ip: string): Promise<number> {
    const cached = this.ipReputationCache.get(ip);
    if (cached !== undefined) {
      return cached;
    }

    const reputation = await this.threatIntelligence.getIPReputation(ip);
    this.ipReputationCache.set(ip, reputation);

    // Cache for 1 hour
    setTimeout(() => this.ipReputationCache.delete(ip), 3600000);

    return reputation;
  }

  private extractSessionId(request: FastifyRequest): string | undefined {
    const cookies = request.headers.cookie;
    if (cookies) {
      const match = cookies.match(/sessionId=([^;]+)/);
      return match ? match[1] : undefined;
    }
    return undefined;
  }

  private extractUserId(request: FastifyRequest): string | undefined {
    // Extract from JWT token or session
    const authHeader = request.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        // This would need proper JWT decoding
        const token = authHeader.substring(7);
        // Implementation would decode JWT and extract user ID
        return undefined; // Placeholder
      } catch (error) {
        return undefined;
      }
    }
    return undefined;
  }

  private generateRequestId(context: RequestContext): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private async logSecurityEvent(event: string, decision: WAFDecision, context: RequestContext): Promise<void> {
    logger.warn({
      event,
      decision,
      context: {
        ip: context.ip,
        method: context.method,
        url: context.url,
        userAgent: context.userAgent,
        timestamp: context.timestamp
      }
    }, 'WAF Security Event');

    // Store in Redis for real-time monitoring
    await this.redis.lpush('waf:security_events', JSON.stringify({
      event,
      decision,
      context,
      timestamp: Date.now()
    }));
  }

  private logBypass(context: RequestContext): void {
    logger.info({
      ip: context.ip,
      url: context.url,
      method: context.method
    }, 'WAF Bypass - Whitelisted request');
  }

  private logMetrics(context: RequestContext, decision: WAFDecision, processingTime: number): void {
    logger.debug({
      processingTime,
      action: decision.action,
      threatLevel: decision.threatLevel,
      riskScore: decision.riskScore
    }, 'WAF Processing Metrics');
  }

  // Placeholder methods for advanced features
  private async loadAttackPatterns(): Promise<void> {
    // Load and compile attack patterns from configuration
  }

  private async initializeBehaviorAnalysis(): Promise<void> {
    // Initialize behavior analysis models
  }

  private async getAttackPatterns(url: string): Promise<AttackPattern[]> {
    return this.attackPatterns.get(url) || [];
  }

  private extractSQLInjectionEvidence(context: RequestContext): string[] {
    // Extract specific SQL injection evidence
    return [];
  }

  private extractXSSEvidence(context: RequestContext): string[] {
    // Extract specific XSS evidence
    return [];
  }

  private extractCommandInjectionEvidence(context: RequestContext): string[] {
    // Extract specific command injection evidence
    return [];
  }

  private extractPathTraversalEvidence(context: RequestContext): string[] {
    // Extract specific path traversal evidence
    return [];
  }

  private calculateRequestSize(context: RequestContext): number {
    // Calculate total request size
    return JSON.stringify(context).length;
  }

  private detectHeaderAnomalies(context: RequestContext): number {
    // Analyze headers for anomalies
    return 0;
  }

  private async analyzeRequestFrequency(context: RequestContext): Promise<number> {
    // Analyze request frequency patterns
    return 0;
  }

  private async getBehaviorProfile(ip: string): Promise<any> {
    // Get or create behavior profile for IP
    return this.behaviorProfiles.get(ip) || {};
  }

  private extractBehaviorFeatures(context: RequestContext): any {
    // Extract behavioral features from request
    return {};
  }

  private calculateBehaviorAnomaly(profile: any, currentBehavior: any): number {
    // Calculate behavioral anomaly score
    return 0;
  }

  private async updateBehaviorProfile(ip: string, behavior: any): Promise<void> {
    // Update behavior profile
    this.behaviorProfiles.set(ip, behavior);
  }

  private async generateChallenge(context: RequestContext): Promise<string> {
    // Generate security challenge
    return `challenge_${Date.now()}`;
  }

  private async logLegitimateRequest(context: RequestContext): Promise<void> {
    // Log legitimate request for ML training
  }
}

/**
 * Factory function to create WAF middleware
 */
export function createWAFMiddleware(redis: Redis, config: WAFEngineConfig, threatIntelligence: ThreatIntelligence) {
  const wafEngine = new WAFEngine(redis, config, threatIntelligence);
  return wafEngine.middleware();
}

/**
 * Default WAF configuration
 */
export const DEFAULT_WAF_ENGINE_CONFIG: WAFEngineConfig = {
  enableRealTimeBlocking: true,
  enableGeoBlocking: true,
  enableBehaviorAnalysis: true,
  enableMachineLearning: true,
  bypassTokens: [],
  whitelistedIPs: ['127.0.0.1', '::1'],
  maxRequestSize: 10 * 1024 * 1024, // 10MB
  customRules: [],
  blockingEnabled: true,
  logLevel: 'info',
  maxRiskScore: 0.8,
  challengeThreshold: 0.6,
  blockedCountries: [],
  highRiskCountries: []
};