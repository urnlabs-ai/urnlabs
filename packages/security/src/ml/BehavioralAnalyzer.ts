/**
 * Behavioral Analysis Engine
 *
 * Analyzes user and system behavior patterns to detect:
 * - Deviations from normal behavior baselines
 * - Unusual access patterns and timings
 * - Anomalous resource usage patterns
 * - Suspicious session behaviors
 */

import { EventEmitter } from 'events';
import { AuditEvent } from '../services/audit-logging';
import Redis from 'ioredis';

export interface BehavioralBaseline {
  userId: string;
  createdAt: Date;
  updatedAt: Date;
  patterns: {
    // Temporal patterns
    activeHours: number[]; // Hours when user is typically active
    activeDays: number[]; // Days of week when user is active
    sessionDuration: { min: number; max: number; avg: number };

    // Access patterns
    commonResources: string[]; // Frequently accessed resources
    commonActions: string[]; // Frequently performed actions
    accessFrequency: { resource: string; avgPerDay: number }[];

    // Geographic patterns
    commonLocations: string[]; // Common IP ranges/locations
    timeZone: string;

    // Device patterns
    commonUserAgents: string[];
    commonDevices: string[];

    // Behavioral metrics
    failureRate: number; // Normal failure rate for this user
    averageActionsPerSession: number;
    typicalResponseTimes: number[];
  };
  statistics: {
    totalSessions: number;
    totalActions: number;
    lastActive: Date;
    confidenceScore: number; // How confident we are in this baseline
  };
}

export interface BehavioralAnomaly {
  type: 'TEMPORAL' | 'ACCESS_PATTERN' | 'GEOGRAPHIC' | 'DEVICE' | 'FREQUENCY' | 'SESSION';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  confidence: number;
  description: string;
  features: Record<string, any>;
  predictions: Record<string, number>;
  statistics: Record<string, number>;
  deviationScore: number; // How much this deviates from baseline
}

export interface SessionContext {
  sessionId: string;
  userId?: string;
  startTime: Date;
  lastActivity: Date;
  actions: number;
  uniqueResources: Set<string>;
  failures: number;
  ipAddress: string;
  userAgent: string;
  geoLocation?: string;
}

export class BehavioralAnalyzer extends EventEmitter {
  private redis: Redis;
  private baselines: Map<string, BehavioralBaseline> = new Map();
  private activeSessions: Map<string, SessionContext> = new Map();
  private isInitialized: boolean = false;

  private readonly BASELINE_CONFIDENCE_THRESHOLD = 0.7;
  private readonly MIN_EVENTS_FOR_BASELINE = 100;
  private readonly SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutes

  constructor(
    private config: any,
    redisUrl?: string
  ) {
    super();
    this.redis = new Redis(redisUrl || process.env.REDIS_URL || 'redis://localhost:6379');
    this.setupPeriodicCleanup();
  }

  /**
   * Initialize the behavioral analyzer
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      await this.loadBaselines();
      this.isInitialized = true;
      this.emit('initialized');
    } catch (error) {
      throw new Error(`Failed to initialize BehavioralAnalyzer: ${error.message}`);
    }
  }

  /**
   * Analyze behavior patterns in an audit event
   */
  async analyzeBehavior(auditEvent: AuditEvent): Promise<BehavioralAnomaly[]> {
    const anomalies: BehavioralAnomaly[] = [];

    try {
      // Update session context
      await this.updateSessionContext(auditEvent);

      // Get or create baseline for this user
      const baseline = await this.getOrCreateBaseline(auditEvent.actor.userId || 'anonymous');

      // Perform behavioral analysis if we have sufficient baseline data
      if (baseline && baseline.statistics.confidenceScore >= this.BASELINE_CONFIDENCE_THRESHOLD) {
        anomalies.push(
          ...await this.analyzeTemporalPatterns(auditEvent, baseline),
          ...await this.analyzeAccessPatterns(auditEvent, baseline),
          ...await this.analyzeGeographicPatterns(auditEvent, baseline),
          ...await this.analyzeDevicePatterns(auditEvent, baseline),
          ...await this.analyzeFrequencyPatterns(auditEvent, baseline),
          ...await this.analyzeSessionPatterns(auditEvent, baseline)
        );
      }

      // Update baseline with new data
      await this.updateBaseline(auditEvent);

      return anomalies.filter(anomaly => anomaly.deviationScore > 2.0); // Only significant deviations

    } catch (error) {
      this.emit('analysisError', { auditEvent, error: error.message });
      return [];
    }
  }

  /**
   * Update session context for tracking user sessions
   */
  private async updateSessionContext(auditEvent: AuditEvent): Promise<void> {
    const sessionId = auditEvent.actor.sessionId || `${auditEvent.actor.userId}_${auditEvent.source.ip}`;

    let session = this.activeSessions.get(sessionId);
    if (!session) {
      session = {
        sessionId,
        userId: auditEvent.actor.userId,
        startTime: auditEvent.timestamp,
        lastActivity: auditEvent.timestamp,
        actions: 0,
        uniqueResources: new Set(),
        failures: 0,
        ipAddress: auditEvent.source.ip,
        userAgent: auditEvent.actor.userAgent || '',
        geoLocation: await this.getGeoLocation(auditEvent.source.ip)
      };
    }

    // Update session data
    session.lastActivity = auditEvent.timestamp;
    session.actions++;
    session.uniqueResources.add(auditEvent.target.resource);
    if (auditEvent.outcome === 'FAILURE') {
      session.failures++;
    }

    this.activeSessions.set(sessionId, session);

    // Cache session data in Redis for persistence
    await this.redis.setex(
      `session:${sessionId}`,
      this.SESSION_TIMEOUT / 1000,
      JSON.stringify(session, this.sessionSerializer)
    );
  }

  /**
   * Analyze temporal behavior patterns
   */
  private async analyzeTemporalPatterns(auditEvent: AuditEvent, baseline: BehavioralBaseline): Promise<BehavioralAnomaly[]> {
    const anomalies: BehavioralAnomaly[] = [];
    const hour = auditEvent.timestamp.getHours();
    const dayOfWeek = auditEvent.timestamp.getDay();

    // Check if user is active at unusual hours
    const isActiveHour = baseline.patterns.activeHours.includes(hour);
    if (!isActiveHour && baseline.patterns.activeHours.length > 0) {
      const deviationScore = this.calculateTemporalDeviation(hour, baseline.patterns.activeHours);
      if (deviationScore > 2.0) {
        anomalies.push({
          type: 'TEMPORAL',
          severity: deviationScore > 4.0 ? 'HIGH' : 'MEDIUM',
          confidence: Math.min(deviationScore / 4.0, 1.0),
          description: `User active at unusual hour (${hour}:00) - typical hours: ${baseline.patterns.activeHours.join(', ')}`,
          features: { currentHour: hour, typicalHours: baseline.patterns.activeHours },
          predictions: { hourlyActivityScore: deviationScore },
          statistics: { deviationFromNormal: deviationScore },
          deviationScore
        });
      }
    }

    // Check if user is active on unusual days
    const isActiveDay = baseline.patterns.activeDays.includes(dayOfWeek);
    if (!isActiveDay && baseline.patterns.activeDays.length > 0) {
      const deviationScore = this.calculateDayDeviation(dayOfWeek, baseline.patterns.activeDays);
      if (deviationScore > 2.0) {
        anomalies.push({
          type: 'TEMPORAL',
          severity: 'MEDIUM',
          confidence: Math.min(deviationScore / 3.0, 1.0),
          description: `User active on unusual day (${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dayOfWeek]})`,
          features: { currentDay: dayOfWeek, typicalDays: baseline.patterns.activeDays },
          predictions: { dailyActivityScore: deviationScore },
          statistics: { deviationFromNormal: deviationScore },
          deviationScore
        });
      }
    }

    return anomalies;
  }

  /**
   * Analyze access pattern behaviors
   */
  private async analyzeAccessPatterns(auditEvent: AuditEvent, baseline: BehavioralBaseline): Promise<BehavioralAnomaly[]> {
    const anomalies: BehavioralAnomaly[] = [];

    // Check for unusual resource access
    const isCommonResource = baseline.patterns.commonResources.includes(auditEvent.target.resource);
    if (!isCommonResource && baseline.patterns.commonResources.length > 0) {
      const deviationScore = this.calculateResourceDeviation(auditEvent.target.resource, baseline);
      if (deviationScore > 2.5) {
        anomalies.push({
          type: 'ACCESS_PATTERN',
          severity: deviationScore > 4.0 ? 'HIGH' : 'MEDIUM',
          confidence: Math.min(deviationScore / 4.0, 1.0),
          description: `Access to unusual resource: ${auditEvent.target.resource}`,
          features: {
            resource: auditEvent.target.resource,
            commonResources: baseline.patterns.commonResources
          },
          predictions: { resourceAccessScore: deviationScore },
          statistics: { deviationFromNormal: deviationScore },
          deviationScore
        });
      }
    }

    // Check for unusual actions
    const isCommonAction = baseline.patterns.commonActions.includes(auditEvent.action);
    if (!isCommonAction && baseline.patterns.commonActions.length > 0) {
      const deviationScore = this.calculateActionDeviation(auditEvent.action, baseline);
      if (deviationScore > 2.0) {
        anomalies.push({
          type: 'ACCESS_PATTERN',
          severity: 'MEDIUM',
          confidence: Math.min(deviationScore / 3.0, 1.0),
          description: `Unusual action performed: ${auditEvent.action}`,
          features: {
            action: auditEvent.action,
            commonActions: baseline.patterns.commonActions
          },
          predictions: { actionPatternScore: deviationScore },
          statistics: { deviationFromNormal: deviationScore },
          deviationScore
        });
      }
    }

    return anomalies;
  }

  /**
   * Analyze geographic behavior patterns
   */
  private async analyzeGeographicPatterns(auditEvent: AuditEvent, baseline: BehavioralBaseline): Promise<BehavioralAnomaly[]> {
    const anomalies: BehavioralAnomaly[] = [];
    const currentLocation = await this.getGeoLocation(auditEvent.source.ip);

    if (currentLocation && baseline.patterns.commonLocations.length > 0) {
      const isCommonLocation = baseline.patterns.commonLocations.some(loc =>
        this.areLocationsClose(currentLocation, loc)
      );

      if (!isCommonLocation) {
        const deviationScore = this.calculateLocationDeviation(currentLocation, baseline.patterns.commonLocations);
        if (deviationScore > 3.0) {
          anomalies.push({
            type: 'GEOGRAPHIC',
            severity: deviationScore > 5.0 ? 'CRITICAL' : 'HIGH',
            confidence: Math.min(deviationScore / 5.0, 1.0),
            description: `Access from unusual location: ${currentLocation}`,
            features: {
              currentLocation,
              commonLocations: baseline.patterns.commonLocations
            },
            predictions: { locationDeviationScore: deviationScore },
            statistics: { deviationFromNormal: deviationScore },
            deviationScore
          });
        }
      }
    }

    return anomalies;
  }

  /**
   * Analyze device behavior patterns
   */
  private async analyzeDevicePatterns(auditEvent: AuditEvent, baseline: BehavioralBaseline): Promise<BehavioralAnomaly[]> {
    const anomalies: BehavioralAnomaly[] = [];
    const userAgent = auditEvent.actor.userAgent || '';

    // Check for unusual user agent
    if (userAgent && baseline.patterns.commonUserAgents.length > 0) {
      const isCommonUserAgent = baseline.patterns.commonUserAgents.some(ua =>
        this.calculateUserAgentSimilarity(userAgent, ua) > 0.8
      );

      if (!isCommonUserAgent) {
        const deviationScore = this.calculateUserAgentDeviation(userAgent, baseline.patterns.commonUserAgents);
        if (deviationScore > 2.0) {
          anomalies.push({
            type: 'DEVICE',
            severity: deviationScore > 4.0 ? 'HIGH' : 'MEDIUM',
            confidence: Math.min(deviationScore / 4.0, 1.0),
            description: `Access from unusual device/browser: ${userAgent.substring(0, 50)}...`,
            features: {
              userAgent,
              commonUserAgents: baseline.patterns.commonUserAgents
            },
            predictions: { deviceDeviationScore: deviationScore },
            statistics: { deviationFromNormal: deviationScore },
            deviationScore
          });
        }
      }
    }

    return anomalies;
  }

  /**
   * Analyze frequency behavior patterns
   */
  private async analyzeFrequencyPatterns(auditEvent: AuditEvent, baseline: BehavioralBaseline): Promise<BehavioralAnomaly[]> {
    const anomalies: BehavioralAnomaly[] = [];

    // Get recent activity for this user
    const recentActivity = await this.getRecentUserActivity(auditEvent.actor.userId || 'anonymous', 60); // Last hour

    // Check for unusual activity frequency
    if (recentActivity > baseline.patterns.averageActionsPerSession * 3) {
      const deviationScore = recentActivity / baseline.patterns.averageActionsPerSession;
      anomalies.push({
        type: 'FREQUENCY',
        severity: deviationScore > 10 ? 'CRITICAL' : deviationScore > 5 ? 'HIGH' : 'MEDIUM',
        confidence: Math.min(deviationScore / 10.0, 1.0),
        description: `Unusually high activity frequency: ${recentActivity} actions in last hour (normal: ${baseline.patterns.averageActionsPerSession})`,
        features: {
          recentActivity,
          normalActivity: baseline.patterns.averageActionsPerSession
        },
        predictions: { frequencyDeviationScore: deviationScore },
        statistics: { deviationFromNormal: deviationScore },
        deviationScore
      });
    }

    return anomalies;
  }

  /**
   * Analyze session behavior patterns
   */
  private async analyzeSessionPatterns(auditEvent: AuditEvent, baseline: BehavioralBaseline): Promise<BehavioralAnomaly[]> {
    const anomalies: BehavioralAnomaly[] = [];
    const sessionId = auditEvent.actor.sessionId || `${auditEvent.actor.userId}_${auditEvent.source.ip}`;
    const session = this.activeSessions.get(sessionId);

    if (session) {
      const sessionDuration = auditEvent.timestamp.getTime() - session.startTime.getTime();

      // Check for unusually long sessions
      if (sessionDuration > baseline.patterns.sessionDuration.max * 2) {
        const deviationScore = sessionDuration / baseline.patterns.sessionDuration.max;
        anomalies.push({
          type: 'SESSION',
          severity: 'MEDIUM',
          confidence: Math.min(deviationScore / 3.0, 1.0),
          description: `Unusually long session duration: ${Math.round(sessionDuration / 60000)} minutes`,
          features: {
            sessionDuration: sessionDuration / 60000,
            normalDuration: baseline.patterns.sessionDuration.avg / 60000
          },
          predictions: { sessionDeviationScore: deviationScore },
          statistics: { deviationFromNormal: deviationScore },
          deviationScore
        });
      }

      // Check for unusual failure rate in session
      const sessionFailureRate = session.failures / session.actions;
      if (sessionFailureRate > baseline.patterns.failureRate * 3 && session.actions > 5) {
        const deviationScore = sessionFailureRate / baseline.patterns.failureRate;
        anomalies.push({
          type: 'SESSION',
          severity: deviationScore > 10 ? 'HIGH' : 'MEDIUM',
          confidence: Math.min(deviationScore / 10.0, 1.0),
          description: `Unusually high failure rate in session: ${(sessionFailureRate * 100).toFixed(1)}%`,
          features: {
            sessionFailureRate,
            normalFailureRate: baseline.patterns.failureRate
          },
          predictions: { failureRateDeviationScore: deviationScore },
          statistics: { deviationFromNormal: deviationScore },
          deviationScore
        });
      }
    }

    return anomalies;
  }

  /**
   * Get or create a behavioral baseline for a user
   */
  private async getOrCreateBaseline(userId: string): Promise<BehavioralBaseline | null> {
    // Check memory cache first
    if (this.baselines.has(userId)) {
      return this.baselines.get(userId)!;
    }

    // Try to load from Redis
    const cached = await this.redis.get(`baseline:${userId}`);
    if (cached) {
      try {
        const baseline = JSON.parse(cached);
        baseline.createdAt = new Date(baseline.createdAt);
        baseline.updatedAt = new Date(baseline.updatedAt);
        baseline.statistics.lastActive = new Date(baseline.statistics.lastActive);
        this.baselines.set(userId, baseline);
        return baseline;
      } catch (error) {
        console.error('Error parsing cached baseline:', error);
      }
    }

    // Create new baseline if user has enough historical data
    const eventCount = await this.getUserEventCount(userId);
    if (eventCount >= this.MIN_EVENTS_FOR_BASELINE) {
      return await this.createNewBaseline(userId);
    }

    return null;
  }

  /**
   * Create a new behavioral baseline for a user
   */
  private async createNewBaseline(userId: string): Promise<BehavioralBaseline> {
    // This would query historical audit events to build baseline
    // For now, return a minimal baseline structure
    const baseline: BehavioralBaseline = {
      userId,
      createdAt: new Date(),
      updatedAt: new Date(),
      patterns: {
        activeHours: [9, 10, 11, 12, 13, 14, 15, 16, 17], // Default business hours
        activeDays: [1, 2, 3, 4, 5], // Weekdays
        sessionDuration: { min: 5 * 60 * 1000, max: 2 * 60 * 60 * 1000, avg: 30 * 60 * 1000 },
        commonResources: [],
        commonActions: [],
        accessFrequency: [],
        commonLocations: [],
        timeZone: 'UTC',
        commonUserAgents: [],
        commonDevices: [],
        failureRate: 0.05, // 5% default failure rate
        averageActionsPerSession: 10,
        typicalResponseTimes: []
      },
      statistics: {
        totalSessions: 0,
        totalActions: 0,
        lastActive: new Date(),
        confidenceScore: 0.1 // Low confidence for new baseline
      }
    };

    this.baselines.set(userId, baseline);
    await this.saveBaseline(baseline);
    return baseline;
  }

  /**
   * Update baseline with new audit event data
   */
  private async updateBaseline(auditEvent: AuditEvent): Promise<void> {
    const userId = auditEvent.actor.userId || 'anonymous';
    const baseline = this.baselines.get(userId);

    if (!baseline) return;

    // Update patterns
    const hour = auditEvent.timestamp.getHours();
    const dayOfWeek = auditEvent.timestamp.getDay();

    // Update active hours
    if (!baseline.patterns.activeHours.includes(hour)) {
      baseline.patterns.activeHours.push(hour);
      baseline.patterns.activeHours.sort((a, b) => a - b);
    }

    // Update active days
    if (!baseline.patterns.activeDays.includes(dayOfWeek)) {
      baseline.patterns.activeDays.push(dayOfWeek);
      baseline.patterns.activeDays.sort((a, b) => a - b);
    }

    // Update common resources
    if (!baseline.patterns.commonResources.includes(auditEvent.target.resource)) {
      baseline.patterns.commonResources.push(auditEvent.target.resource);
      // Keep only top 20 resources
      if (baseline.patterns.commonResources.length > 20) {
        baseline.patterns.commonResources = baseline.patterns.commonResources.slice(-20);
      }
    }

    // Update common actions
    if (!baseline.patterns.commonActions.includes(auditEvent.action)) {
      baseline.patterns.commonActions.push(auditEvent.action);
      // Keep only top 15 actions
      if (baseline.patterns.commonActions.length > 15) {
        baseline.patterns.commonActions = baseline.patterns.commonActions.slice(-15);
      }
    }

    // Update user agent patterns
    if (auditEvent.actor.userAgent) {
      const ua = auditEvent.actor.userAgent;
      if (!baseline.patterns.commonUserAgents.some(existing =>
        this.calculateUserAgentSimilarity(ua, existing) > 0.9
      )) {
        baseline.patterns.commonUserAgents.push(ua);
        // Keep only top 5 user agents
        if (baseline.patterns.commonUserAgents.length > 5) {
          baseline.patterns.commonUserAgents = baseline.patterns.commonUserAgents.slice(-5);
        }
      }
    }

    // Update location patterns
    const location = await this.getGeoLocation(auditEvent.source.ip);
    if (location && !baseline.patterns.commonLocations.includes(location)) {
      baseline.patterns.commonLocations.push(location);
      // Keep only top 5 locations
      if (baseline.patterns.commonLocations.length > 5) {
        baseline.patterns.commonLocations = baseline.patterns.commonLocations.slice(-5);
      }
    }

    // Update statistics
    baseline.statistics.totalActions++;
    baseline.statistics.lastActive = auditEvent.timestamp;
    baseline.updatedAt = new Date();

    // Update confidence score based on data volume
    const dataVolume = baseline.statistics.totalActions;
    baseline.statistics.confidenceScore = Math.min(dataVolume / (this.MIN_EVENTS_FOR_BASELINE * 2), 1.0);

    // Save updated baseline
    await this.saveBaseline(baseline);
  }

  /**
   * Helper methods for calculating deviations
   */
  private calculateTemporalDeviation(hour: number, activeHours: number[]): number {
    if (activeHours.length === 0) return 0;

    const minDistance = Math.min(...activeHours.map(h => Math.abs(hour - h)));
    return minDistance; // Simple distance-based deviation
  }

  private calculateDayDeviation(day: number, activeDays: number[]): number {
    if (activeDays.length === 0) return 0;

    const minDistance = Math.min(...activeDays.map(d => Math.abs(day - d)));
    return minDistance;
  }

  private calculateResourceDeviation(resource: string, baseline: BehavioralBaseline): number {
    // Simple heuristic: if resource is not in common resources, it's unusual
    return baseline.patterns.commonResources.length > 0 ? 3.0 : 0;
  }

  private calculateActionDeviation(action: string, baseline: BehavioralBaseline): number {
    // Simple heuristic: if action is not in common actions, it's unusual
    return baseline.patterns.commonActions.length > 0 ? 2.5 : 0;
  }

  private calculateLocationDeviation(currentLocation: string, commonLocations: string[]): number {
    // Simple heuristic: if location is not close to any common location, it's unusual
    return commonLocations.length > 0 ? 4.0 : 0;
  }

  private calculateUserAgentDeviation(userAgent: string, commonUserAgents: string[]): number {
    if (commonUserAgents.length === 0) return 0;

    const maxSimilarity = Math.max(...commonUserAgents.map(ua =>
      this.calculateUserAgentSimilarity(userAgent, ua)
    ));

    return (1 - maxSimilarity) * 5; // Convert similarity to deviation score
  }

  private calculateUserAgentSimilarity(ua1: string, ua2: string): number {
    // Simple similarity calculation based on common words
    const words1 = ua1.toLowerCase().split(/[\s\/\(\)]+/);
    const words2 = ua2.toLowerCase().split(/[\s\/\(\)]+/);

    const commonWords = words1.filter(word => words2.includes(word));
    return commonWords.length / Math.max(words1.length, words2.length);
  }

  private areLocationsClose(loc1: string, loc2: string): boolean {
    // Simple string comparison - in practice would use geographic distance
    return loc1 === loc2;
  }

  /**
   * Helper methods for data access
   */
  private async getGeoLocation(ipAddress: string): Promise<string | undefined> {
    // In practice, would use IP geolocation service
    // For now, return a mock location based on IP
    if (ipAddress.startsWith('192.168.') || ipAddress.startsWith('10.') || ipAddress.startsWith('172.')) {
      return 'Internal Network';
    }
    return `Location_${ipAddress.split('.')[0]}`;
  }

  private async getUserEventCount(userId: string): Promise<number> {
    // In practice, would query audit log database
    // For now, return a mock count
    return Math.floor(Math.random() * 200) + 50;
  }

  private async getRecentUserActivity(userId: string, timeWindowMinutes: number): Promise<number> {
    const key = `activity:${userId}`;
    const cutoff = Date.now() - (timeWindowMinutes * 60 * 1000);

    await this.redis.zremrangebyscore(key, '-inf', cutoff);
    return await this.redis.zcard(key);
  }

  private sessionSerializer(key: string, value: any): any {
    if (value instanceof Set) {
      return Array.from(value);
    }
    return value;
  }

  /**
   * Load baselines from persistent storage
   */
  async loadBaselines(): Promise<void> {
    try {
      const keys = await this.redis.keys('baseline:*');
      for (const key of keys) {
        const cached = await this.redis.get(key);
        if (cached) {
          try {
            const baseline = JSON.parse(cached);
            baseline.createdAt = new Date(baseline.createdAt);
            baseline.updatedAt = new Date(baseline.updatedAt);
            baseline.statistics.lastActive = new Date(baseline.statistics.lastActive);
            this.baselines.set(baseline.userId, baseline);
          } catch (error) {
            console.error(`Error loading baseline ${key}:`, error);
          }
        }
      }
    } catch (error) {
      console.warn('Could not load baselines from Redis:', error.message);
    }
  }

  /**
   * Save baseline to persistent storage
   */
  private async saveBaseline(baseline: BehavioralBaseline): Promise<void> {
    try {
      await this.redis.setex(
        `baseline:${baseline.userId}`,
        7 * 24 * 60 * 60, // 7 days
        JSON.stringify(baseline)
      );
    } catch (error) {
      console.error('Error saving baseline:', error);
    }
  }

  /**
   * Update baselines with new training data
   */
  async updateBaselines(): Promise<void> {
    // In practice, would retrain baselines with recent data
    this.emit('baselinesUpdated', {
      timestamp: new Date(),
      baselineCount: this.baselines.size
    });
  }

  /**
   * Setup periodic cleanup of expired sessions
   */
  private setupPeriodicCleanup(): void {
    setInterval(() => {
      const now = Date.now();
      for (const [sessionId, session] of this.activeSessions) {
        if (now - session.lastActivity.getTime() > this.SESSION_TIMEOUT) {
          this.activeSessions.delete(sessionId);
        }
      }
    }, 5 * 60 * 1000); // Every 5 minutes
  }

  /**
   * Shutdown the behavioral analyzer
   */
  async shutdown(): Promise<void> {
    await this.redis.quit();
    this.isInitialized = false;
  }
}