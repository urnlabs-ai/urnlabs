/**
 * ML-Based Threat Detection Engine
 *
 * Provides real-time threat detection using machine learning models for:
 * - Anomaly detection using statistical and ML algorithms
 * - Behavioral analysis for user and system patterns
 * - Risk scoring and threat classification
 * - Real-time processing of audit log streams
 */

import { EventEmitter } from 'events';
import { AuditEvent } from '../services/audit-logging';
import { BehavioralAnalyzer } from './BehavioralAnalyzer';
import { AnomalyDetectionModels } from './AnomalyDetectionModels';
import Redis from 'ioredis';

export interface ThreatEvent {
  id: string;
  timestamp: Date;
  threatType: 'ANOMALY' | 'BEHAVIORAL' | 'STATISTICAL' | 'PATTERN' | 'BRUTE_FORCE' | 'PRIVILEGE_ESCALATION' | 'DATA_EXFILTRATION';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  confidence: number; // 0-1 confidence score
  riskScore: number; // 0-100 risk assessment
  description: string;
  evidence: {
    auditEventIds: string[];
    features: Record<string, any>;
    modelPredictions: Record<string, number>;
    statisticalValues: Record<string, number>;
  };
  actor: {
    userId?: string;
    sessionId?: string;
    ipAddress?: string;
    userAgent?: string;
    geoLocation?: string;
  };
  target: {
    resource: string;
    resourceType: string;
    action: string;
  };
  timeline: {
    detectedAt: Date;
    firstSeenAt: Date;
    lastSeenAt: Date;
    duration: number;
  };
  mitigationRecommendations: string[];
}

export interface DetectionMetrics {
  totalEventsProcessed: number;
  threatsDetected: number;
  falsePositives: number;
  truePositives: number;
  accuracy: number;
  precision: number;
  recall: number;
  f1Score: number;
  processingLatency: {
    avg: number;
    p95: number;
    p99: number;
  };
  modelPerformance: Record<string, {
    accuracy: number;
    lastTrained: Date;
    predictions: number;
  }>;
}

export interface ThreatDetectionConfig {
  // Processing settings
  realTimeProcessing: boolean;
  batchSize: number;
  maxProcessingLatency: number; // milliseconds

  // ML model settings
  enableStatisticalModels: boolean;
  enableBehavioralAnalysis: boolean;
  enableAnomalyDetection: boolean;

  // Thresholds
  anomalyThreshold: number; // 0-1
  behavioralThreshold: number; // 0-1
  riskScoreThreshold: number; // 0-100

  // Model retraining
  retrainingInterval: number; // hours
  minDataPointsForRetraining: number;

  // Performance monitoring
  enableMetrics: boolean;
  metricsRetentionDays: number;
}

export class ThreatDetectionEngine extends EventEmitter {
  private behavioralAnalyzer: BehavioralAnalyzer;
  private anomalyModels: AnomalyDetectionModels;
  private redis: Redis;
  private isInitialized: boolean = false;
  private processedEvents: number = 0;
  private detectedThreats: number = 0;
  private processingTimes: number[] = [];

  constructor(
    private config: ThreatDetectionConfig,
    private options: {
      redisUrl?: string;
      pythonMLServiceUrl?: string;
    } = {}
  ) {
    super();

    this.redis = new Redis(this.options.redisUrl || process.env.REDIS_URL || 'redis://localhost:6379');
    this.behavioralAnalyzer = new BehavioralAnalyzer(config);
    this.anomalyModels = new AnomalyDetectionModels(config, this.options.pythonMLServiceUrl);

    this.setupEventHandlers();
    this.setupPeriodicTasks();
  }

  /**
   * Initialize the threat detection engine
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // Initialize sub-components
      await this.behavioralAnalyzer.initialize();
      await this.anomalyModels.initialize();

      // Load pre-trained models and baselines
      await this.loadModelBaselines();

      // Setup real-time stream processing
      if (this.config.realTimeProcessing) {
        await this.setupRealTimeProcessing();
      }

      this.isInitialized = true;
      this.emit('initialized');

    } catch (error) {
      throw new Error(`Failed to initialize ThreatDetectionEngine: ${error.message}`);
    }
  }

  /**
   * Process a single audit event for threat detection
   */
  async processAuditEvent(auditEvent: AuditEvent): Promise<ThreatEvent[]> {
    const startTime = Date.now();
    const threats: ThreatEvent[] = [];

    try {
      // Extract features for ML processing
      const features = this.extractFeatures(auditEvent);

      // Run parallel threat detection analyses
      const [
        anomalyResults,
        behavioralResults,
        statisticalResults
      ] = await Promise.all([
        this.config.enableAnomalyDetection ? this.anomalyModels.detectAnomalies(features) : [],
        this.config.enableBehavioralAnalysis ? this.behavioralAnalyzer.analyzeBehavior(auditEvent) : [],
        this.detectStatisticalAnomalies(auditEvent)
      ]);

      // Process and score threats
      threats.push(
        ...this.processAnomalyResults(auditEvent, anomalyResults),
        ...this.processBehavioralResults(auditEvent, behavioralResults),
        ...this.processStatisticalResults(auditEvent, statisticalResults)
      );

      // Filter by thresholds and confidence
      const filteredThreats = this.filterAndScoreThreats(threats);

      // Update metrics and cache
      this.updateProcessingMetrics(startTime);
      await this.cacheEventFeatures(auditEvent.id, features);

      // Emit high-priority threats immediately
      filteredThreats.forEach(threat => {
        if (threat.severity === 'CRITICAL' || threat.severity === 'HIGH') {
          this.emit('threatDetected', threat);
        }
      });

      return filteredThreats;

    } catch (error) {
      this.emit('processingError', { auditEvent, error: error.message });
      throw error;
    }
  }

  /**
   * Process multiple audit events in batch
   */
  async processBatch(auditEvents: AuditEvent[]): Promise<ThreatEvent[]> {
    const allThreats: ThreatEvent[] = [];
    const batchSize = this.config.batchSize || 100;

    for (let i = 0; i < auditEvents.length; i += batchSize) {
      const batch = auditEvents.slice(i, i + batchSize);

      const batchPromises = batch.map(event => this.processAuditEvent(event));
      const batchResults = await Promise.all(batchPromises);

      batchResults.forEach(threats => allThreats.push(...threats));
    }

    // Perform cross-event correlation analysis
    const correlatedThreats = await this.correlateThreats(allThreats);

    return correlatedThreats;
  }

  /**
   * Extract features from audit event for ML processing
   */
  private extractFeatures(auditEvent: AuditEvent): Record<string, any> {
    const now = new Date();
    const hour = auditEvent.timestamp.getHours();
    const dayOfWeek = auditEvent.timestamp.getDay();

    return {
      // Temporal features
      hour,
      dayOfWeek,
      isWeekend: dayOfWeek === 0 || dayOfWeek === 6,
      isBusinessHours: hour >= 9 && hour <= 17,

      // Actor features
      actorType: auditEvent.actor.type,
      hasUserId: !!auditEvent.actor.userId,
      hasSessionId: !!auditEvent.actor.sessionId,

      // Event features
      eventType: auditEvent.eventType,
      category: auditEvent.category,
      severity: auditEvent.severity,
      outcome: auditEvent.outcome,
      action: auditEvent.action,

      // Target features
      resourceType: auditEvent.target.resourceType,
      hasResourceId: !!auditEvent.target.resourceId,

      // Metadata features
      hasDuration: !!auditEvent.metadata.duration,
      duration: auditEvent.metadata.duration || 0,
      hasErrorCode: !!auditEvent.metadata.errorCode,

      // Network features
      sourceIP: auditEvent.source.ip,
      sourceService: auditEvent.source.service,
      userAgent: auditEvent.actor.userAgent,

      // Compliance features
      complianceFlags: Object.keys(auditEvent.compliance).filter(key => auditEvent.compliance[key]),

      // Derived features
      timeSinceLastEvent: 0, // Will be calculated based on history
      eventFrequency: 0, // Will be calculated based on recent activity
      uniqueResourcesAccessed: 0, // Will be calculated from session history
    };
  }

  /**
   * Detect statistical anomalies using simple heuristics
   */
  private async detectStatisticalAnomalies(auditEvent: AuditEvent): Promise<any[]> {
    const anomalies = [];

    // Check for unusual time patterns
    const hour = auditEvent.timestamp.getHours();
    if (hour < 6 || hour > 22) {
      anomalies.push({
        type: 'OFF_HOURS_ACCESS',
        score: 0.7,
        description: 'Access detected outside normal business hours',
        features: { hour, timestamp: auditEvent.timestamp }
      });
    }

    // Check for failure patterns
    if (auditEvent.outcome === 'FAILURE') {
      const recentFailures = await this.getRecentFailureCount(
        auditEvent.actor.userId,
        auditEvent.source.ip,
        15 // last 15 minutes
      );

      if (recentFailures >= 5) {
        anomalies.push({
          type: 'BRUTE_FORCE_PATTERN',
          score: 0.9,
          description: 'Multiple failed attempts detected',
          features: { failureCount: recentFailures, timeWindow: 15 }
        });
      }
    }

    // Check for privilege escalation
    if (auditEvent.action.toLowerCase().includes('escalate') ||
        auditEvent.action.toLowerCase().includes('privilege')) {
      anomalies.push({
        type: 'PRIVILEGE_ESCALATION',
        score: 0.8,
        description: 'Privilege escalation attempt detected',
        features: { action: auditEvent.action }
      });
    }

    // Check for unusual data access patterns
    if (auditEvent.category === 'DATA_ACCESS' && auditEvent.severity === 'HIGH') {
      const dataAccessRate = await this.getDataAccessRate(auditEvent.actor.userId, 60);
      if (dataAccessRate > 100) { // More than 100 data access events in last hour
        anomalies.push({
          type: 'DATA_EXFILTRATION',
          score: 0.85,
          description: 'Unusual high-volume data access detected',
          features: { accessRate: dataAccessRate, timeWindow: 60 }
        });
      }
    }

    return anomalies;
  }

  /**
   * Process anomaly detection results into threat events
   */
  private processAnomalyResults(auditEvent: AuditEvent, anomalyResults: any[]): ThreatEvent[] {
    return anomalyResults.map(anomaly => this.createThreatEvent(
      auditEvent,
      'ANOMALY',
      anomaly.score,
      anomaly.description,
      {
        auditEventIds: [auditEvent.id],
        features: anomaly.features || {},
        modelPredictions: { anomalyScore: anomaly.score },
        statisticalValues: {}
      }
    ));
  }

  /**
   * Process behavioral analysis results into threat events
   */
  private processBehavioralResults(auditEvent: AuditEvent, behavioralResults: any[]): ThreatEvent[] {
    return behavioralResults.map(behavior => this.createThreatEvent(
      auditEvent,
      'BEHAVIORAL',
      behavior.confidence,
      behavior.description,
      {
        auditEventIds: [auditEvent.id],
        features: behavior.features || {},
        modelPredictions: behavior.predictions || {},
        statisticalValues: behavior.statistics || {}
      }
    ));
  }

  /**
   * Process statistical analysis results into threat events
   */
  private processStatisticalResults(auditEvent: AuditEvent, statisticalResults: any[]): ThreatEvent[] {
    return statisticalResults.map(stat => {
      let threatType: ThreatEvent['threatType'] = 'STATISTICAL';

      // Map specific patterns to threat types
      if (stat.type === 'BRUTE_FORCE_PATTERN') threatType = 'BRUTE_FORCE';
      else if (stat.type === 'PRIVILEGE_ESCALATION') threatType = 'PRIVILEGE_ESCALATION';
      else if (stat.type === 'DATA_EXFILTRATION') threatType = 'DATA_EXFILTRATION';

      return this.createThreatEvent(
        auditEvent,
        threatType,
        stat.score,
        stat.description,
        {
          auditEventIds: [auditEvent.id],
          features: stat.features || {},
          modelPredictions: {},
          statisticalValues: { score: stat.score, type: stat.type }
        }
      );
    });
  }

  /**
   * Create a standardized threat event
   */
  private createThreatEvent(
    auditEvent: AuditEvent,
    threatType: ThreatEvent['threatType'],
    confidence: number,
    description: string,
    evidence: ThreatEvent['evidence']
  ): ThreatEvent {
    const riskScore = this.calculateRiskScore(auditEvent, confidence, threatType);
    const severity = this.calculateSeverity(riskScore, confidence);

    return {
      id: `threat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
      threatType,
      severity,
      confidence,
      riskScore,
      description,
      evidence,
      actor: {
        userId: auditEvent.actor.userId,
        sessionId: auditEvent.actor.sessionId,
        ipAddress: auditEvent.source.ip,
        userAgent: auditEvent.actor.userAgent
      },
      target: {
        resource: auditEvent.target.resource,
        resourceType: auditEvent.target.resourceType,
        action: auditEvent.action
      },
      timeline: {
        detectedAt: new Date(),
        firstSeenAt: auditEvent.timestamp,
        lastSeenAt: auditEvent.timestamp,
        duration: 0
      },
      mitigationRecommendations: this.generateMitigationRecommendations(threatType, severity)
    };
  }

  /**
   * Calculate risk score based on multiple factors
   */
  private calculateRiskScore(auditEvent: AuditEvent, confidence: number, threatType: ThreatEvent['threatType']): number {
    let baseScore = confidence * 50; // Start with confidence-based score

    // Severity multiplier
    const severityMultiplier = {
      'LOW': 1.0,
      'MEDIUM': 1.5,
      'HIGH': 2.0,
      'CRITICAL': 2.5
    };
    baseScore *= severityMultiplier[auditEvent.severity] || 1.0;

    // Threat type multiplier
    const threatMultiplier = {
      'BRUTE_FORCE': 2.0,
      'PRIVILEGE_ESCALATION': 2.5,
      'DATA_EXFILTRATION': 3.0,
      'ANOMALY': 1.5,
      'BEHAVIORAL': 1.2,
      'STATISTICAL': 1.0,
      'PATTERN': 1.3
    };
    baseScore *= threatMultiplier[threatType] || 1.0;

    // Outcome impact
    if (auditEvent.outcome === 'FAILURE') baseScore *= 1.5;

    // Actor type risk
    const actorRisk = {
      'ANONYMOUS': 2.0,
      'USER': 1.0,
      'SERVICE': 0.8,
      'SYSTEM': 0.5
    };
    baseScore *= actorRisk[auditEvent.actor.type] || 1.0;

    return Math.min(Math.round(baseScore), 100);
  }

  /**
   * Calculate severity based on risk score and confidence
   */
  private calculateSeverity(riskScore: number, confidence: number): ThreatEvent['severity'] {
    const adjustedScore = riskScore * confidence;

    if (adjustedScore >= 80) return 'CRITICAL';
    if (adjustedScore >= 60) return 'HIGH';
    if (adjustedScore >= 40) return 'MEDIUM';
    return 'LOW';
  }

  /**
   * Generate mitigation recommendations based on threat type and severity
   */
  private generateMitigationRecommendations(threatType: ThreatEvent['threatType'], severity: ThreatEvent['severity']): string[] {
    const recommendations: string[] = [];

    // Common recommendations
    recommendations.push('Review and correlate with other security events');
    recommendations.push('Verify actor identity and authorization');

    // Threat-specific recommendations
    switch (threatType) {
      case 'BRUTE_FORCE':
        recommendations.push('Implement account lockout policies');
        recommendations.push('Enable multi-factor authentication');
        recommendations.push('Consider IP blocking for repeated attempts');
        break;

      case 'PRIVILEGE_ESCALATION':
        recommendations.push('Review privilege assignment and access controls');
        recommendations.push('Audit administrative access patterns');
        recommendations.push('Implement just-in-time access controls');
        break;

      case 'DATA_EXFILTRATION':
        recommendations.push('Monitor and limit data export capabilities');
        recommendations.push('Implement data loss prevention (DLP) controls');
        recommendations.push('Review data access permissions');
        break;

      case 'ANOMALY':
      case 'BEHAVIORAL':
        recommendations.push('Investigate user behavior patterns');
        recommendations.push('Verify account has not been compromised');
        break;
    }

    // Severity-specific recommendations
    if (severity === 'CRITICAL' || severity === 'HIGH') {
      recommendations.push('Consider immediate incident response procedures');
      recommendations.push('Escalate to security operations center (SOC)');
      if (severity === 'CRITICAL') {
        recommendations.push('Consider temporary account suspension');
      }
    }

    return recommendations;
  }

  /**
   * Filter and score threats based on configured thresholds
   */
  private filterAndScoreThreats(threats: ThreatEvent[]): ThreatEvent[] {
    return threats.filter(threat => {
      // Apply confidence threshold
      if (threat.confidence < this.config.anomalyThreshold) return false;

      // Apply risk score threshold
      if (threat.riskScore < this.config.riskScoreThreshold) return false;

      return true;
    }).sort((a, b) => b.riskScore - a.riskScore); // Sort by risk score descending
  }

  /**
   * Correlate threats across multiple events to detect coordinated attacks
   */
  private async correlateThreats(threats: ThreatEvent[]): Promise<ThreatEvent[]> {
    // Group threats by actor and time window
    const actorGroups = new Map<string, ThreatEvent[]>();

    threats.forEach(threat => {
      const actorKey = threat.actor.userId || threat.actor.ipAddress || 'unknown';
      if (!actorGroups.has(actorKey)) {
        actorGroups.set(actorKey, []);
      }
      actorGroups.get(actorKey)!.push(threat);
    });

    // Analyze patterns within actor groups
    const correlatedThreats = [...threats];

    for (const [actorKey, actorThreats] of actorGroups) {
      if (actorThreats.length >= 3) {
        // Multiple threats from same actor - potential coordinated attack
        const coordinatedThreat = this.createCoordinatedThreatEvent(actorThreats);
        correlatedThreats.push(coordinatedThreat);
      }
    }

    return correlatedThreats;
  }

  /**
   * Create a coordinated threat event from multiple related threats
   */
  private createCoordinatedThreatEvent(relatedThreats: ThreatEvent[]): ThreatEvent {
    const maxRiskScore = Math.max(...relatedThreats.map(t => t.riskScore));
    const avgConfidence = relatedThreats.reduce((sum, t) => sum + t.confidence, 0) / relatedThreats.length;

    return {
      id: `coordinated_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
      threatType: 'PATTERN',
      severity: maxRiskScore >= 80 ? 'CRITICAL' : maxRiskScore >= 60 ? 'HIGH' : 'MEDIUM',
      confidence: Math.min(avgConfidence * 1.2, 1.0), // Boost confidence for coordinated attacks
      riskScore: Math.min(maxRiskScore * 1.3, 100), // Boost risk score
      description: `Coordinated attack pattern detected across ${relatedThreats.length} events`,
      evidence: {
        auditEventIds: relatedThreats.flatMap(t => t.evidence.auditEventIds),
        features: { relatedThreatCount: relatedThreats.length },
        modelPredictions: {},
        statisticalValues: { coordinationScore: relatedThreats.length }
      },
      actor: relatedThreats[0].actor,
      target: relatedThreats[0].target,
      timeline: {
        detectedAt: new Date(),
        firstSeenAt: new Date(Math.min(...relatedThreats.map(t => t.timeline.firstSeenAt.getTime()))),
        lastSeenAt: new Date(Math.max(...relatedThreats.map(t => t.timeline.lastSeenAt.getTime()))),
        duration: 0
      },
      mitigationRecommendations: [
        'Immediate investigation required for coordinated attack pattern',
        'Consider blocking actor access pending investigation',
        'Review all related security events and logs',
        'Escalate to incident response team immediately'
      ]
    };
  }

  /**
   * Setup real-time processing using Redis streams
   */
  private async setupRealTimeProcessing(): Promise<void> {
    const streamKey = 'audit_events_stream';

    // Listen for new audit events in Redis stream
    setInterval(async () => {
      try {
        const results = await this.redis.xread('COUNT', 10, 'BLOCK', 1000, 'STREAMS', streamKey, '$');

        if (results && results.length > 0) {
          for (const [stream, messages] of results) {
            for (const [messageId, fields] of messages) {
              try {
                const auditEvent = JSON.parse(fields[1]); // Assuming event data is in field[1]
                await this.processAuditEvent(auditEvent);
              } catch (error) {
                console.error('Error processing stream message:', error);
              }
            }
          }
        }
      } catch (error) {
        if (error.message !== 'Connection is closed.') {
          console.error('Redis stream processing error:', error);
        }
      }
    }, 1000);
  }

  /**
   * Load model baselines and configurations
   */
  private async loadModelBaselines(): Promise<void> {
    try {
      // Load behavioral baselines
      await this.behavioralAnalyzer.loadBaselines();

      // Load anomaly detection models
      await this.anomalyModels.loadModels();

    } catch (error) {
      console.warn('Could not load model baselines, will start fresh:', error.message);
    }
  }

  /**
   * Helper methods for statistical analysis
   */
  private async getRecentFailureCount(userId?: string, ipAddress?: string, timeWindowMinutes: number = 15): Promise<number> {
    const key = `failures:${userId || ipAddress || 'unknown'}`;
    const cutoff = Date.now() - (timeWindowMinutes * 60 * 1000);

    // Use Redis sorted set to track failures with timestamps
    await this.redis.zremrangebyscore(key, '-inf', cutoff);
    return await this.redis.zcard(key);
  }

  private async getDataAccessRate(userId?: string, timeWindowMinutes: number = 60): Promise<number> {
    const key = `data_access:${userId || 'unknown'}`;
    const cutoff = Date.now() - (timeWindowMinutes * 60 * 1000);

    await this.redis.zremrangebyscore(key, '-inf', cutoff);
    return await this.redis.zcard(key);
  }

  private async cacheEventFeatures(eventId: string, features: Record<string, any>): Promise<void> {
    const key = `event_features:${eventId}`;
    await this.redis.setex(key, 3600, JSON.stringify(features)); // Cache for 1 hour
  }

  /**
   * Setup periodic tasks
   */
  private setupPeriodicTasks(): void {
    // Model retraining
    if (this.config.retrainingInterval > 0) {
      setInterval(async () => {
        try {
          await this.retrainModels();
        } catch (error) {
          console.error('Model retraining failed:', error);
        }
      }, this.config.retrainingInterval * 60 * 60 * 1000);
    }

    // Metrics collection
    if (this.config.enableMetrics) {
      setInterval(() => {
        this.publishMetrics();
      }, 60 * 1000); // Every minute
    }
  }

  private setupEventHandlers(): void {
    this.on('threatDetected', (threat: ThreatEvent) => {
      console.log(`Threat detected: ${threat.threatType} (${threat.severity})`);
    });

    this.on('processingError', (error) => {
      console.error('Processing error:', error);
    });
  }

  /**
   * Retrain ML models with new data
   */
  private async retrainModels(): Promise<void> {
    if (this.processedEvents < this.config.minDataPointsForRetraining) {
      return; // Not enough data for retraining
    }

    try {
      await this.anomalyModels.retrain();
      await this.behavioralAnalyzer.updateBaselines();

      this.emit('modelsRetrained', {
        timestamp: new Date(),
        processedEvents: this.processedEvents
      });
    } catch (error) {
      this.emit('retrainingError', error);
    }
  }

  /**
   * Update processing metrics
   */
  private updateProcessingMetrics(startTime: number): void {
    const processingTime = Date.now() - startTime;
    this.processingTimes.push(processingTime);

    // Keep only last 1000 measurements
    if (this.processingTimes.length > 1000) {
      this.processingTimes = this.processingTimes.slice(-1000);
    }

    this.processedEvents++;
  }

  /**
   * Publish metrics for monitoring
   */
  private publishMetrics(): void {
    if (this.processingTimes.length === 0) return;

    const sortedTimes = [...this.processingTimes].sort((a, b) => a - b);
    const metrics: DetectionMetrics = {
      totalEventsProcessed: this.processedEvents,
      threatsDetected: this.detectedThreats,
      falsePositives: 0, // Would need feedback mechanism to track
      truePositives: 0, // Would need feedback mechanism to track
      accuracy: 0, // Would calculate based on feedback
      precision: 0, // Would calculate based on feedback
      recall: 0, // Would calculate based on feedback
      f1Score: 0, // Would calculate based on feedback
      processingLatency: {
        avg: this.processingTimes.reduce((sum, time) => sum + time, 0) / this.processingTimes.length,
        p95: sortedTimes[Math.floor(sortedTimes.length * 0.95)],
        p99: sortedTimes[Math.floor(sortedTimes.length * 0.99)]
      },
      modelPerformance: {} // Would be populated by individual models
    };

    this.emit('metricsUpdate', metrics);
  }

  /**
   * Get current detection metrics
   */
  getMetrics(): DetectionMetrics {
    const sortedTimes = [...this.processingTimes].sort((a, b) => a - b);

    return {
      totalEventsProcessed: this.processedEvents,
      threatsDetected: this.detectedThreats,
      falsePositives: 0,
      truePositives: 0,
      accuracy: 0,
      precision: 0,
      recall: 0,
      f1Score: 0,
      processingLatency: {
        avg: this.processingTimes.length > 0
          ? this.processingTimes.reduce((sum, time) => sum + time, 0) / this.processingTimes.length
          : 0,
        p95: sortedTimes.length > 0 ? sortedTimes[Math.floor(sortedTimes.length * 0.95)] : 0,
        p99: sortedTimes.length > 0 ? sortedTimes[Math.floor(sortedTimes.length * 0.99)] : 0
      },
      modelPerformance: {}
    };
  }

  /**
   * Shutdown the threat detection engine
   */
  async shutdown(): Promise<void> {
    await this.behavioralAnalyzer.shutdown();
    await this.anomalyModels.shutdown();
    await this.redis.quit();
    this.isInitialized = false;
  }
}