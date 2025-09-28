/**
 * DDoS Protection and Enhanced Rate Limiting Service
 *
 * Provides advanced rate limiting, bot detection, IP reputation scoring,
 * and automated traffic shaping to protect against DDoS attacks.
 */

import { EventEmitter } from 'events';
import Redis from 'ioredis';
import crypto from 'crypto';
import { auditLoggingService } from './audit-logging';

interface RateLimitRule {
  id: string;
  name: string;
  path: string;
  method: string;
  windowMs: number;
  maxRequests: number;
  burst: number;
  skipSuccessfulRequests: boolean;
  skipFailedRequests: boolean;
  enabled: boolean;
}

interface IPReputationData {
  ip: string;
  score: number; // 0-100, higher is better
  lastSeen: Date;
  requestCount: number;
  blockedCount: number;
  suspiciousActivities: string[];
  whitelisted: boolean;
  blacklisted: boolean;
  geoLocation?: {
    country: string;
    region: string;
    city: string;
  };
  userAgent?: string;
  lastUserAgent?: string;
}

interface BotDetectionResult {
  isBot: boolean;
  confidence: number;
  indicators: string[];
  botType?: 'good' | 'bad' | 'unknown';
  action: 'allow' | 'challenge' | 'block';
}

interface DDoSMetrics {
  totalRequests: number;
  blockedRequests: number;
  suspiciousRequests: number;
  uniqueIPs: number;
  topIPs: Array<{ ip: string; requests: number }>;
  requestsPerSecond: number;
  averageResponseTime: number;
  errorRate: number;
}

interface TrafficPattern {
  timestamp: Date;
  requestsPerSecond: number;
  uniqueIPs: number;
  errorRate: number;
  averageResponseTime: number;
}

interface Challenge {
  id: string;
  ip: string;
  type: 'captcha' | 'javascript' | 'proof_of_work';
  challenge: string;
  expectedResponse: string;
  expiresAt: Date;
  attempts: number;
  maxAttempts: number;
}

class DDoSProtectionService extends EventEmitter {
  private redis: Redis;
  private rateLimitRules: Map<string, RateLimitRule> = new Map();
  private ipReputations: Map<string, IPReputationData> = new Map();
  private challenges: Map<string, Challenge> = new Map();
  private trafficPatterns: TrafficPattern[] = [];
  private attackInProgress = false;
  private goodBotUserAgents: Set<string>;
  private badBotSignatures: Set<string>;

  constructor(redisUrl?: string) {
    super();
    this.redis = new Redis(redisUrl || process.env.REDIS_URL || 'redis://localhost:6379');
    this.initializeRules();
    this.initializeBotDetection();
    this.startTrafficAnalysis();
  }

  /**
   * Initialize default rate limiting rules
   */
  private initializeRules(): void {
    const defaultRules: RateLimitRule[] = [
      {
        id: 'api-general',
        name: 'General API Rate Limit',
        path: '/api/*',
        method: '*',
        windowMs: 60000, // 1 minute
        maxRequests: 100,
        burst: 10,
        skipSuccessfulRequests: false,
        skipFailedRequests: false,
        enabled: true
      },
      {
        id: 'auth-endpoints',
        name: 'Authentication Rate Limit',
        path: '/auth/*',
        method: 'POST',
        windowMs: 300000, // 5 minutes
        maxRequests: 10,
        burst: 3,
        skipSuccessfulRequests: true,
        skipFailedRequests: false,
        enabled: true
      },
      {
        id: 'upload-endpoints',
        name: 'Upload Rate Limit',
        path: '/upload/*',
        method: 'POST',
        windowMs: 60000,
        maxRequests: 5,
        burst: 2,
        skipSuccessfulRequests: false,
        skipFailedRequests: false,
        enabled: true
      },
      {
        id: 'search-endpoints',
        name: 'Search Rate Limit',
        path: '/search',
        method: 'GET',
        windowMs: 60000,
        maxRequests: 50,
        burst: 5,
        skipSuccessfulRequests: false,
        skipFailedRequests: false,
        enabled: true
      }
    ];

    defaultRules.forEach(rule => this.rateLimitRules.set(rule.id, rule));
  }

  /**
   * Initialize bot detection patterns
   */
  private initializeBotDetection(): void {
    this.goodBotUserAgents = new Set([
      'Googlebot',
      'Bingbot',
      'facebookexternalhit',
      'Twitterbot',
      'LinkedInBot',
      'Slackbot',
      'WhatsApp',
      'Applebot',
      'DuckDuckBot'
    ]);

    this.badBotSignatures = new Set([
      'sqlmap',
      'nikto',
      'nessus',
      'openvas',
      'w3af',
      'burp',
      'owasp',
      'acunetix',
      'netsparker',
      'AppScan',
      'WebInspect',
      'ZAP',
      'wget',
      'curl',
      'python-requests',
      'bot',
      'crawler',
      'spider',
      'scraper'
    ]);
  }

  /**
   * Check if request should be rate limited
   */
  async checkRateLimit(
    ip: string,
    path: string,
    method: string,
    userAgent?: string,
    headers?: Record<string, string>
  ): Promise<{
    allowed: boolean;
    remainingRequests?: number;
    resetTime?: number;
    reason?: string;
    action?: 'allow' | 'challenge' | 'block';
    challengeId?: string;
  }> {
    try {
      // Check IP reputation first
      const reputation = await this.getIPReputation(ip);

      if (reputation.blacklisted) {
        await this.logRateLimitEvent(ip, path, method, 'BLOCKED', 'IP blacklisted');
        return {
          allowed: false,
          reason: 'IP address is blacklisted',
          action: 'block'
        };
      }

      // Perform bot detection
      const botDetection = await this.detectBot(ip, userAgent, headers);

      if (botDetection.action === 'block') {
        await this.updateIPReputation(ip, -20, ['malicious_bot_detected']);
        await this.logRateLimitEvent(ip, path, method, 'BLOCKED', `Malicious bot detected: ${botDetection.indicators.join(', ')}`);
        return {
          allowed: false,
          reason: 'Malicious bot detected',
          action: 'block'
        };
      }

      if (botDetection.action === 'challenge') {
        const challenge = await this.createChallenge(ip, 'captcha');
        await this.logRateLimitEvent(ip, path, method, 'CHALLENGED', `Bot challenge required: ${botDetection.indicators.join(', ')}`);
        return {
          allowed: false,
          reason: 'Challenge required',
          action: 'challenge',
          challengeId: challenge.id
        };
      }

      // Find applicable rate limit rule
      const rule = this.findApplicableRule(path, method);
      if (!rule || !rule.enabled) {
        await this.updateRequestMetrics(ip, true);
        return { allowed: true };
      }

      // Check rate limit using sliding window algorithm
      const key = `rate_limit:${rule.id}:${ip}`;
      const now = Date.now();
      const windowStart = now - rule.windowMs;

      // Use Redis for distributed rate limiting
      const requests = await this.redis.zrangebyscore(key, windowStart, now);
      const requestCount = requests.length;

      // Apply reputation-based adjustments
      const adjustedMaxRequests = this.adjustLimitForReputation(rule.maxRequests, reputation);

      if (requestCount >= adjustedMaxRequests) {
        // Check if burst allowance is available
        const burstKey = `burst:${rule.id}:${ip}`;
        const burstCount = await this.redis.get(burstKey);

        if (!burstCount || parseInt(burstCount) < rule.burst) {
          // Allow burst request
          await this.redis.incr(burstKey);
          await this.redis.expire(burstKey, Math.ceil(rule.windowMs / 1000));
          await this.redis.zadd(key, now, `${now}-${Math.random()}`);
          await this.redis.expire(key, Math.ceil(rule.windowMs / 1000));

          await this.updateRequestMetrics(ip, true);
          await this.logRateLimitEvent(ip, path, method, 'BURST_ALLOWED', `Burst request allowed (${parseInt(burstCount || '0') + 1}/${rule.burst})`);

          return {
            allowed: true,
            remainingRequests: 0,
            resetTime: now + rule.windowMs
          };
        }

        // Rate limit exceeded
        await this.updateIPReputation(ip, -5, ['rate_limit_exceeded']);
        await this.updateRequestMetrics(ip, false);
        await this.logRateLimitEvent(ip, path, method, 'BLOCKED', `Rate limit exceeded: ${requestCount}/${adjustedMaxRequests} requests in ${rule.windowMs}ms`);

        return {
          allowed: false,
          remainingRequests: 0,
          resetTime: now + rule.windowMs,
          reason: `Rate limit exceeded: ${requestCount}/${adjustedMaxRequests} requests per ${rule.windowMs}ms`,
          action: 'block'
        };
      }

      // Request allowed
      await this.redis.zadd(key, now, `${now}-${Math.random()}`);
      await this.redis.expire(key, Math.ceil(rule.windowMs / 1000));

      // Clean old entries
      await this.redis.zremrangebyscore(key, 0, windowStart);

      await this.updateRequestMetrics(ip, true);
      await this.updateIPReputation(ip, 1, []);

      return {
        allowed: true,
        remainingRequests: adjustedMaxRequests - requestCount - 1,
        resetTime: now + rule.windowMs
      };

    } catch (error) {
      console.error('Rate limit check failed:', error);
      // Fail open for availability
      return { allowed: true };
    }
  }

  /**
   * Detect if request is from a bot
   */
  private async detectBot(
    ip: string,
    userAgent?: string,
    headers?: Record<string, string>
  ): Promise<BotDetectionResult> {
    const indicators: string[] = [];
    let confidence = 0;
    let botType: 'good' | 'bad' | 'unknown' = 'unknown';

    if (!userAgent) {
      indicators.push('Missing User-Agent header');
      confidence += 30;
      botType = 'bad';
    } else {
      // Check for good bots
      for (const goodBot of this.goodBotUserAgents) {
        if (userAgent.includes(goodBot)) {
          indicators.push(`Identified as ${goodBot}`);
          return {
            isBot: true,
            confidence: 95,
            indicators,
            botType: 'good',
            action: 'allow'
          };
        }
      }

      // Check for bad bot signatures
      const lowerUA = userAgent.toLowerCase();
      for (const badSignature of this.badBotSignatures) {
        if (lowerUA.includes(badSignature.toLowerCase())) {
          indicators.push(`Contains bad bot signature: ${badSignature}`);
          confidence += 40;
          botType = 'bad';
        }
      }

      // Check for suspicious patterns
      if (userAgent.length < 10) {
        indicators.push('Unusually short User-Agent');
        confidence += 25;
      }

      if (userAgent.length > 500) {
        indicators.push('Unusually long User-Agent');
        confidence += 20;
      }

      if (/^[a-zA-Z0-9\s\-_.]+$/.test(userAgent) && userAgent.length < 50) {
        indicators.push('Simple User-Agent pattern');
        confidence += 20;
      }
    }

    // Check headers for bot patterns
    if (headers) {
      if (!headers['accept']) {
        indicators.push('Missing Accept header');
        confidence += 15;
      }

      if (!headers['accept-language']) {
        indicators.push('Missing Accept-Language header');
        confidence += 10;
      }

      if (headers['x-forwarded-for']) {
        const forwardedIPs = headers['x-forwarded-for'].split(',').length;
        if (forwardedIPs > 3) {
          indicators.push('Multiple proxy hops detected');
          confidence += 15;
        }
      }
    }

    // Check request frequency patterns
    const requestPattern = await this.getRequestPattern(ip);
    if (requestPattern.requestsPerMinute > 100) {
      indicators.push('High request frequency');
      confidence += 25;
      botType = 'bad';
    }

    if (requestPattern.uniformTiming) {
      indicators.push('Uniform request timing pattern');
      confidence += 20;
      botType = 'bad';
    }

    // Determine action based on confidence and bot type
    let action: 'allow' | 'challenge' | 'block' = 'allow';

    if (botType === 'bad' && confidence > 70) {
      action = 'block';
    } else if (confidence > 50) {
      action = 'challenge';
    }

    return {
      isBot: confidence > 30,
      confidence,
      indicators,
      botType,
      action
    };
  }

  /**
   * Create a challenge for suspicious requests
   */
  private async createChallenge(ip: string, type: 'captcha' | 'javascript' | 'proof_of_work'): Promise<Challenge> {
    const challengeId = crypto.randomUUID();
    let challenge = '';
    let expectedResponse = '';

    switch (type) {
      case 'captcha':
        // Generate simple math captcha
        const num1 = Math.floor(Math.random() * 10) + 1;
        const num2 = Math.floor(Math.random() * 10) + 1;
        challenge = `What is ${num1} + ${num2}?`;
        expectedResponse = (num1 + num2).toString();
        break;

      case 'javascript':
        // Generate JavaScript evaluation challenge
        const jsNum = Math.floor(Math.random() * 100) + 1;
        challenge = `btoa("${jsNum}")`;
        expectedResponse = Buffer.from(jsNum.toString()).toString('base64');
        break;

      case 'proof_of_work':
        // Generate proof of work challenge
        const target = '0000';
        const nonce = Math.random().toString(36).substring(2);
        challenge = `Find a value that when appended to "${nonce}" produces a SHA256 hash starting with "${target}"`;
        expectedResponse = 'pow_verification_needed';
        break;
    }

    const challengeObj: Challenge = {
      id: challengeId,
      ip,
      type,
      challenge,
      expectedResponse,
      expiresAt: new Date(Date.now() + 300000), // 5 minutes
      attempts: 0,
      maxAttempts: 3
    };

    this.challenges.set(challengeId, challengeObj);

    // Set expiration cleanup
    setTimeout(() => {
      this.challenges.delete(challengeId);
    }, 300000);

    return challengeObj;
  }

  /**
   * Verify challenge response
   */
  async verifyChallenge(challengeId: string, response: string): Promise<{
    success: boolean;
    reason?: string;
    remainingAttempts?: number;
  }> {
    const challenge = this.challenges.get(challengeId);

    if (!challenge) {
      return {
        success: false,
        reason: 'Challenge not found or expired'
      };
    }

    if (challenge.expiresAt < new Date()) {
      this.challenges.delete(challengeId);
      return {
        success: false,
        reason: 'Challenge expired'
      };
    }

    challenge.attempts++;

    if (challenge.attempts > challenge.maxAttempts) {
      this.challenges.delete(challengeId);
      await this.updateIPReputation(challenge.ip, -10, ['challenge_failed_max_attempts']);
      return {
        success: false,
        reason: 'Maximum attempts exceeded'
      };
    }

    const isCorrect = response.trim() === challenge.expectedResponse;

    if (isCorrect) {
      this.challenges.delete(challengeId);
      await this.updateIPReputation(challenge.ip, 10, ['challenge_solved']);

      await auditLoggingService.logEvent({
        eventType: 'CHALLENGE_VERIFIED',
        category: 'SECURITY',
        severity: 'LOW',
        source: {
          service: 'ddos-protection',
          version: '1.0.0',
          instance: process.env.HOSTNAME || 'localhost',
          ip: challenge.ip
        },
        actor: {
          type: 'USER',
          ip: challenge.ip
        },
        target: {
          resource: 'ddos-challenge',
          resourceType: 'SECURITY_CONTROL'
        },
        action: 'SOLVE_CHALLENGE',
        outcome: 'SUCCESS',
        details: {
          challengeType: challenge.type,
          attempts: challenge.attempts
        },
        metadata: {
          challengeId
        },
        compliance: {
          gdpr: false,
          sox: false,
          iso27001: true,
          pci: false
        }
      });

      return { success: true };
    } else {
      await this.updateIPReputation(challenge.ip, -2, ['challenge_failed']);
      return {
        success: false,
        reason: 'Incorrect response',
        remainingAttempts: challenge.maxAttempts - challenge.attempts
      };
    }
  }

  /**
   * Get or create IP reputation data
   */
  private async getIPReputation(ip: string): Promise<IPReputationData> {
    let reputation = this.ipReputations.get(ip);

    if (!reputation) {
      reputation = {
        ip,
        score: 50, // Neutral score
        lastSeen: new Date(),
        requestCount: 0,
        blockedCount: 0,
        suspiciousActivities: [],
        whitelisted: false,
        blacklisted: false
      };

      this.ipReputations.set(ip, reputation);
    }

    return reputation;
  }

  /**
   * Update IP reputation score
   */
  private async updateIPReputation(ip: string, scoreChange: number, activities: string[]): Promise<void> {
    const reputation = await this.getIPReputation(ip);

    reputation.score = Math.max(0, Math.min(100, reputation.score + scoreChange));
    reputation.lastSeen = new Date();
    reputation.requestCount++;

    if (scoreChange < 0) {
      reputation.blockedCount++;
      reputation.suspiciousActivities.push(...activities);

      // Auto-blacklist if score is very low
      if (reputation.score < 10) {
        reputation.blacklisted = true;
        this.emit('ipBlacklisted', reputation);
      }
    }

    // Auto-whitelist trusted IPs
    if (reputation.score > 90 && reputation.requestCount > 100) {
      reputation.whitelisted = true;
    }
  }

  /**
   * Get request pattern for IP
   */
  private async getRequestPattern(ip: string): Promise<{
    requestsPerMinute: number;
    uniformTiming: boolean;
    lastRequests: number[];
  }> {
    const key = `pattern:${ip}`;
    const now = Date.now();
    const minuteAgo = now - 60000;

    // Get recent request timestamps
    const timestamps = await this.redis.zrangebyscore(key, minuteAgo, now);
    const requestTimes = timestamps.map(ts => parseInt(ts));

    // Calculate requests per minute
    const requestsPerMinute = requestTimes.length;

    // Check for uniform timing (potential bot behavior)
    let uniformTiming = false;
    if (requestTimes.length > 5) {
      const intervals = [];
      for (let i = 1; i < requestTimes.length; i++) {
        intervals.push(requestTimes[i] - requestTimes[i - 1]);
      }

      const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      const variance = intervals.reduce((sum, interval) => sum + Math.pow(interval - avgInterval, 2), 0) / intervals.length;
      const stdDev = Math.sqrt(variance);

      // If standard deviation is very low, timing is very uniform
      uniformTiming = stdDev < avgInterval * 0.1;
    }

    // Add current request
    await this.redis.zadd(key, now, now.toString());
    await this.redis.expire(key, 60);

    // Clean old entries
    await this.redis.zremrangebyscore(key, 0, minuteAgo);

    return {
      requestsPerMinute,
      uniformTiming,
      lastRequests: requestTimes
    };
  }

  /**
   * Find applicable rate limit rule
   */
  private findApplicableRule(path: string, method: string): RateLimitRule | null {
    for (const rule of this.rateLimitRules.values()) {
      if (this.matchesRule(path, method, rule)) {
        return rule;
      }
    }
    return null;
  }

  /**
   * Check if request matches rule pattern
   */
  private matchesRule(path: string, method: string, rule: RateLimitRule): boolean {
    const methodMatches = rule.method === '*' || rule.method.toUpperCase() === method.toUpperCase();

    if (!methodMatches) return false;

    if (rule.path === '*') return true;

    // Convert glob pattern to regex
    const pattern = rule.path
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.')
      .replace(/\+/g, '\\+');

    const regex = new RegExp(`^${pattern}$`);
    return regex.test(path);
  }

  /**
   * Adjust rate limit based on IP reputation
   */
  private adjustLimitForReputation(baseLimit: number, reputation: IPReputationData): number {
    if (reputation.whitelisted) {
      return baseLimit * 2; // Double limit for whitelisted IPs
    }

    if (reputation.score > 80) {
      return Math.floor(baseLimit * 1.5); // 50% more for trusted IPs
    }

    if (reputation.score < 30) {
      return Math.floor(baseLimit * 0.3); // Reduce to 30% for suspicious IPs
    }

    if (reputation.score < 50) {
      return Math.floor(baseLimit * 0.7); // Reduce to 70% for below-average IPs
    }

    return baseLimit;
  }

  /**
   * Update request metrics
   */
  private async updateRequestMetrics(ip: string, allowed: boolean): Promise<void> {
    const now = Date.now();
    const key = 'ddos:metrics';

    await this.redis.hincrby(key, 'total_requests', 1);

    if (!allowed) {
      await this.redis.hincrby(key, 'blocked_requests', 1);
    }

    await this.redis.sadd('ddos:unique_ips', ip);
    await this.redis.expire(key, 3600); // 1 hour
    await this.redis.expire('ddos:unique_ips', 3600);
  }

  /**
   * Log rate limiting events
   */
  private async logRateLimitEvent(
    ip: string,
    path: string,
    method: string,
    action: string,
    reason: string
  ): Promise<void> {
    await auditLoggingService.logEvent({
      eventType: 'RATE_LIMIT_EVENT',
      category: 'SECURITY',
      severity: action === 'BLOCKED' ? 'MEDIUM' : 'LOW',
      source: {
        service: 'ddos-protection',
        version: '1.0.0',
        instance: process.env.HOSTNAME || 'localhost',
        ip
      },
      actor: {
        type: 'USER',
        ip
      },
      target: {
        resource: path,
        resourceType: 'ENDPOINT'
      },
      action: `RATE_LIMIT_${action}`,
      outcome: action === 'BLOCKED' ? 'FAILURE' : 'SUCCESS',
      details: {
        method,
        reason,
        path
      },
      metadata: {
        ip,
        userAgent: 'unknown'
      },
      compliance: {
        gdpr: false,
        sox: false,
        iso27001: true,
        pci: false
      }
    });
  }

  /**
   * Start traffic analysis for DDoS detection
   */
  private startTrafficAnalysis(): void {
    setInterval(async () => {
      await this.analyzeTrafficPatterns();
    }, 10000); // Analyze every 10 seconds
  }

  /**
   * Analyze traffic patterns for DDoS detection
   */
  private async analyzeTrafficPatterns(): Promise<void> {
    try {
      const metrics = await this.getDDoSMetrics();

      const pattern: TrafficPattern = {
        timestamp: new Date(),
        requestsPerSecond: metrics.requestsPerSecond,
        uniqueIPs: metrics.uniqueIPs,
        errorRate: metrics.errorRate,
        averageResponseTime: metrics.averageResponseTime
      };

      this.trafficPatterns.push(pattern);

      // Keep only last hour of patterns
      const oneHourAgo = new Date(Date.now() - 3600000);
      this.trafficPatterns = this.trafficPatterns.filter(p => p.timestamp > oneHourAgo);

      // Detect DDoS attack
      const isDDoSDetected = this.detectDDoSAttack(pattern);

      if (isDDoSDetected && !this.attackInProgress) {
        this.attackInProgress = true;
        this.emit('ddosAttackDetected', pattern);
        await this.activateEmergencyMeasures();
      } else if (!isDDoSDetected && this.attackInProgress) {
        this.attackInProgress = false;
        this.emit('ddosAttackEnded', pattern);
        await this.deactivateEmergencyMeasures();
      }

    } catch (error) {
      console.error('Traffic analysis failed:', error);
    }
  }

  /**
   * Detect DDoS attack based on traffic patterns
   */
  private detectDDoSAttack(currentPattern: TrafficPattern): boolean {
    if (this.trafficPatterns.length < 10) {
      return false; // Need baseline data
    }

    const recentPatterns = this.trafficPatterns.slice(-10);
    const averageRPS = recentPatterns.reduce((sum, p) => sum + p.requestsPerSecond, 0) / recentPatterns.length;
    const averageErrorRate = recentPatterns.reduce((sum, p) => sum + p.errorRate, 0) / recentPatterns.length;

    // DDoS indicators
    const rpsThreshold = averageRPS * 3; // 3x normal traffic
    const errorRateThreshold = 0.1; // 10% error rate
    const uniqueIPRatio = currentPattern.uniqueIPs / currentPattern.requestsPerSecond;

    return (
      currentPattern.requestsPerSecond > rpsThreshold ||
      currentPattern.errorRate > errorRateThreshold ||
      uniqueIPRatio < 0.01 // Very few unique IPs for high traffic
    );
  }

  /**
   * Activate emergency DDoS protection measures
   */
  private async activateEmergencyMeasures(): Promise<void> {
    console.log('🚨 DDoS attack detected - activating emergency measures');

    // Reduce rate limits by 50%
    for (const rule of this.rateLimitRules.values()) {
      if (rule.enabled) {
        rule.maxRequests = Math.floor(rule.maxRequests * 0.5);
        rule.burst = Math.floor(rule.burst * 0.5);
      }
    }

    // Enable stricter bot detection
    this.setBotDetectionSensitivity('high');

    // Log emergency activation
    await auditLoggingService.logEvent({
      eventType: 'DDOS_PROTECTION_ACTIVATED',
      category: 'SECURITY',
      severity: 'HIGH',
      source: {
        service: 'ddos-protection',
        version: '1.0.0',
        instance: process.env.HOSTNAME || 'localhost',
        ip: 'localhost'
      },
      actor: { type: 'SYSTEM' },
      target: {
        resource: 'ddos-protection',
        resourceType: 'SECURITY_CONTROL'
      },
      action: 'ACTIVATE_EMERGENCY_MEASURES',
      outcome: 'SUCCESS',
      details: {
        reason: 'DDoS attack detected',
        measures: ['reduced_rate_limits', 'strict_bot_detection']
      },
      metadata: {},
      compliance: {
        gdpr: false,
        sox: false,
        iso27001: true,
        pci: false
      }
    });
  }

  /**
   * Deactivate emergency DDoS protection measures
   */
  private async deactivateEmergencyMeasures(): Promise<void> {
    console.log('✅ DDoS attack ended - deactivating emergency measures');

    // Restore original rate limits
    this.initializeRules();

    // Reset bot detection sensitivity
    this.setBotDetectionSensitivity('normal');

    // Log emergency deactivation
    await auditLoggingService.logEvent({
      eventType: 'DDOS_PROTECTION_DEACTIVATED',
      category: 'SECURITY',
      severity: 'MEDIUM',
      source: {
        service: 'ddos-protection',
        version: '1.0.0',
        instance: process.env.HOSTNAME || 'localhost',
        ip: 'localhost'
      },
      actor: { type: 'SYSTEM' },
      target: {
        resource: 'ddos-protection',
        resourceType: 'SECURITY_CONTROL'
      },
      action: 'DEACTIVATE_EMERGENCY_MEASURES',
      outcome: 'SUCCESS',
      details: {
        reason: 'DDoS attack ended'
      },
      metadata: {},
      compliance: {
        gdpr: false,
        sox: false,
        iso27001: true,
        pci: false
      }
    });
  }

  /**
   * Set bot detection sensitivity
   */
  private setBotDetectionSensitivity(level: 'low' | 'normal' | 'high'): void {
    // This would adjust bot detection thresholds
    console.log(`Bot detection sensitivity set to: ${level}`);
  }

  /**
   * Get current DDoS protection metrics
   */
  async getDDoSMetrics(): Promise<DDoSMetrics> {
    const metricsKey = 'ddos:metrics';
    const metrics = await this.redis.hgetall(metricsKey);

    const totalRequests = parseInt(metrics.total_requests || '0');
    const blockedRequests = parseInt(metrics.blocked_requests || '0');
    const uniqueIPs = await this.redis.scard('ddos:unique_ips');

    // Calculate requests per second (approximate)
    const requestsPerSecond = totalRequests / 60; // Assuming 1-minute window

    return {
      totalRequests,
      blockedRequests,
      suspiciousRequests: 0, // Would be calculated from reputation data
      uniqueIPs,
      topIPs: [], // Would be calculated from request patterns
      requestsPerSecond,
      averageResponseTime: 0, // Would be measured from actual responses
      errorRate: blockedRequests / Math.max(totalRequests, 1)
    };
  }

  /**
   * Add rate limiting rule
   */
  addRule(rule: RateLimitRule): void {
    this.rateLimitRules.set(rule.id, rule);
  }

  /**
   * Remove rate limiting rule
   */
  removeRule(ruleId: string): boolean {
    return this.rateLimitRules.delete(ruleId);
  }

  /**
   * Get all rate limiting rules
   */
  getRules(): RateLimitRule[] {
    return Array.from(this.rateLimitRules.values());
  }

  /**
   * Whitelist an IP address
   */
  async whitelistIP(ip: string, reason: string): Promise<void> {
    const reputation = await this.getIPReputation(ip);
    reputation.whitelisted = true;
    reputation.blacklisted = false;
    reputation.score = 100;

    await auditLoggingService.logEvent({
      eventType: 'IP_WHITELISTED',
      category: 'SECURITY',
      severity: 'LOW',
      source: {
        service: 'ddos-protection',
        version: '1.0.0',
        instance: process.env.HOSTNAME || 'localhost',
        ip: 'localhost'
      },
      actor: { type: 'ADMIN' },
      target: {
        resource: ip,
        resourceType: 'IP_ADDRESS'
      },
      action: 'WHITELIST_IP',
      outcome: 'SUCCESS',
      details: { reason },
      metadata: { ip },
      compliance: {
        gdpr: false,
        sox: false,
        iso27001: true,
        pci: false
      }
    });
  }

  /**
   * Blacklist an IP address
   */
  async blacklistIP(ip: string, reason: string): Promise<void> {
    const reputation = await this.getIPReputation(ip);
    reputation.blacklisted = true;
    reputation.whitelisted = false;
    reputation.score = 0;

    await auditLoggingService.logEvent({
      eventType: 'IP_BLACKLISTED',
      category: 'SECURITY',
      severity: 'MEDIUM',
      source: {
        service: 'ddos-protection',
        version: '1.0.0',
        instance: process.env.HOSTNAME || 'localhost',
        ip: 'localhost'
      },
      actor: { type: 'ADMIN' },
      target: {
        resource: ip,
        resourceType: 'IP_ADDRESS'
      },
      action: 'BLACKLIST_IP',
      outcome: 'SUCCESS',
      details: { reason },
      metadata: { ip },
      compliance: {
        gdpr: false,
        sox: false,
        iso27001: true,
        pci: false
      }
    });
  }

  /**
   * Get IP reputation information
   */
  getIPReputationInfo(ip: string): IPReputationData | null {
    return this.ipReputations.get(ip) || null;
  }

  /**
   * Get service statistics
   */
  getStatistics(): any {
    return {
      rules: this.rateLimitRules.size,
      ipReputations: this.ipReputations.size,
      activeChallenges: this.challenges.size,
      attackInProgress: this.attackInProgress,
      trafficPatterns: this.trafficPatterns.length
    };
  }
}

export const ddosProtectionService = new DDoSProtectionService();
export type { RateLimitRule, IPReputationData, BotDetectionResult, DDoSMetrics, Challenge };