/**
 * IDS Engine - Core Intrusion Detection System
 * Main orchestration component for threat detection and response
 */

import EventEmitter from 'events';
import { Logger } from 'pino';
import {
  SecurityEvent,
  SecurityEventType,
  SecuritySeverity,
  IDSConfiguration,
  IDSAlert,
  IDSMetrics,
  UserBehaviorProfile,
  ThreatIntelligence,
  IDSRule,
  AnomalyDetectionResult,
  MLModel
} from './types';
import { RuleEngine } from './rule-engine';
import { BehavioralAnalyzer } from './behavioral-analyzer';
import { AnomalyDetector } from './anomaly-detector';
import { ThreatIntelligenceService } from './threat-intelligence';
import { AlertManager } from './alert-manager';
import { MetricsCollector } from './metrics-collector';

export class IDSEngine extends EventEmitter {
  private config: IDSConfiguration;
  private logger: Logger;
  private ruleEngine: RuleEngine;
  private behavioralAnalyzer: BehavioralAnalyzer;
  private anomalyDetector: AnomalyDetector;
  private threatIntel: ThreatIntelligenceService;
  private alertManager: AlertManager;
  private metricsCollector: MetricsCollector;
  private isRunning: boolean = false;
  private processingQueue: SecurityEvent[] = [];
  private metrics: IDSMetrics;

  constructor(config: IDSConfiguration, logger: Logger) {
    super();
    this.config = config;
    this.logger = logger.child({ component: 'IDS-Engine' });
    
    // Initialize components
    this.ruleEngine = new RuleEngine(config.rules, logger);
    this.behavioralAnalyzer = new BehavioralAnalyzer(config, logger);
    this.anomalyDetector = new AnomalyDetector(config, logger);
    this.threatIntel = new ThreatIntelligenceService(config.integrations.threatIntelligence, logger);
    this.alertManager = new AlertManager(config.alerting, logger);
    this.metricsCollector = new MetricsCollector(logger);

    this.metrics = {
      eventsProcessed: 0,
      alertsGenerated: 0,
      falsePositives: 0,
      truePositives: 0,
      detectionRate: 0,
      responseTime: 0,
      systemLoad: {
        cpu: 0,
        memory: 0,
        disk: 0,
        network: 0
      },
      threatIntelUpdates: 0
    };

    this.setupEventHandlers();
  }

  /**
   * Start the IDS engine
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      this.logger.warn('IDS Engine is already running');
      return;
    }

    try {
      this.logger.info('Starting IDS Engine...');

      // Initialize components
      await this.ruleEngine.initialize();
      await this.behavioralAnalyzer.initialize();
      await this.anomalyDetector.initialize();
      await this.threatIntel.initialize();
      await this.alertManager.initialize();
      await this.metricsCollector.initialize();

      // Start processing
      this.isRunning = true;
      this.startProcessingLoop();

      // Start metrics collection
      this.startMetricsCollection();

      this.logger.info('IDS Engine started successfully');
      this.emit('started');

    } catch (error) {
      this.logger.error('Failed to start IDS Engine:', error);
      throw error;
    }
  }

  /**
   * Stop the IDS engine
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      this.logger.warn('IDS Engine is not running');
      return;
    }

    try {
      this.logger.info('Stopping IDS Engine...');
      this.isRunning = false;

      // Stop components
      await this.ruleEngine.stop();
      await this.behavioralAnalyzer.stop();
      await this.anomalyDetector.stop();
      await this.threatIntel.stop();
      await this.alertManager.stop();
      await this.metricsCollector.stop();

      this.logger.info('IDS Engine stopped successfully');
      this.emit('stopped');

    } catch (error) {
      this.logger.error('Error stopping IDS Engine:', error);
      throw error;
    }
  }

  /**
   * Process a security event
   */
  async processEvent(event: SecurityEvent): Promise<void> {
    if (!this.isRunning) {
      this.logger.warn('IDS Engine is not running, event discarded');
      return;
    }

    const startTime = Date.now();
    
    try {
      this.logger.debug(`Processing security event: ${event.id}`);

      // Add to processing queue
      this.processingQueue.push(event);

      // Enrich event with threat intelligence
      const enrichedEvent = await this.enrichWithThreatIntel(event);

      // Analyze with rule engine
      const ruleResults = await this.ruleEngine.analyzeEvent(enrichedEvent);

      // Perform behavioral analysis
      const behavioralResults = await this.behavioralAnalyzer.analyzeEvent(enrichedEvent);

      // Detect anomalies
      const anomalyResults = await this.anomalyDetector.detectAnomalies(enrichedEvent);

      // Calculate overall risk score
      const riskScore = this.calculateRiskScore(ruleResults, behavioralResults, anomalyResults);

      // Update event with analysis results
      enrichedEvent.riskScore = riskScore;
      enrichedEvent.details.anomalyScore = anomalyResults.anomalyScore;
      enrichedEvent.details.baselineDeviation = behavioralResults.deviationScore;

      // Generate alerts if necessary
      if (this.shouldGenerateAlert(enrichedEvent, ruleResults, behavioralResults, anomalyResults)) {
        await this.generateAlert(enrichedEvent, ruleResults, behavioralResults, anomalyResults);
      }

      // Update metrics
      this.updateMetrics(enrichedEvent, startTime);

      // Update behavioral profiles
      if (enrichedEvent.source.userId) {
        await this.behavioralAnalyzer.updateUserProfile(enrichedEvent.source.userId, enrichedEvent);
      }

      this.emit('eventProcessed', enrichedEvent);

    } catch (error) {
      this.logger.error(`Error processing event ${event.id}:`, error);
      this.emit('processingError', event, error);
    } finally {
      // Remove from processing queue
      const index = this.processingQueue.findIndex(e => e.id === event.id);
      if (index !== -1) {
        this.processingQueue.splice(index, 1);
      }
    }
  }

  /**
   * Enrich event with threat intelligence data
   */
  private async enrichWithThreatIntel(event: SecurityEvent): Promise<SecurityEvent> {
    try {
      const threatData = await this.threatIntel.checkIndicators({
        ip: event.source.ip,
        userAgent: event.source.userAgent,
        domain: this.extractDomain(event.target.endpoint),
        url: event.target.endpoint
      });

      if (threatData.length > 0) {
        event.details.threatIntelData = threatData;
        event.riskScore = Math.max(event.riskScore, Math.max(...threatData.map(t => t.confidence)));
        
        this.logger.info(`Event ${event.id} matched ${threatData.length} threat indicators`);
      }

      return event;

    } catch (error) {
      this.logger.error('Error enriching event with threat intelligence:', error);
      return event;
    }
  }

  /**
   * Calculate overall risk score
   */
  private calculateRiskScore(
    ruleResults: any,
    behavioralResults: any,
    anomalyResults: AnomalyDetectionResult
  ): number {
    const weights = {
      rules: 0.4,
      behavioral: 0.3,
      anomaly: 0.3
    };

    const ruleScore = ruleResults.maxSeverity || 0;
    const behavioralScore = behavioralResults.riskScore || 0;
    const anomalyScore = anomalyResults.anomalyScore || 0;

    return Math.min(100, 
      (ruleScore * weights.rules) +
      (behavioralScore * weights.behavioral) +
      (anomalyScore * weights.anomaly)
    );
  }

  /**
   * Determine if an alert should be generated
   */
  private shouldGenerateAlert(
    event: SecurityEvent,
    ruleResults: any,
    behavioralResults: any,
    anomalyResults: AnomalyDetectionResult
  ): boolean {
    // Check if risk score exceeds threshold
    if (event.riskScore >= this.config.thresholds.riskScore) {
      return true;
    }

    // Check if anomaly score exceeds threshold
    if (anomalyResults.anomalyScore >= this.config.thresholds.anomalyScore) {
      return true;
    }

    // Check if behavioral deviation exceeds threshold
    if (behavioralResults.deviationScore >= this.config.thresholds.behavioralDeviation) {
      return true;
    }

    // Check rule-based triggers
    if (ruleResults.triggered && ruleResults.severity >= SecuritySeverity.MEDIUM) {
      return true;
    }

    return false;
  }

  /**
   * Generate security alert
   */
  private async generateAlert(
    event: SecurityEvent,
    ruleResults: any,
    behavioralResults: any,
    anomalyResults: AnomalyDetectionResult
  ): Promise<void> {
    try {
      const alert: IDSAlert = {
        id: `alert-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        eventId: event.id,
        ruleId: ruleResults.ruleId || 'system',
        timestamp: new Date(),
        severity: this.determineSeverity(event.riskScore),
        title: this.generateAlertTitle(event, ruleResults, anomalyResults),
        description: this.generateAlertDescription(event, ruleResults, behavioralResults, anomalyResults),
        source: event.source,
        target: event.target,
        evidence: {
          networkData: undefined,
          logData: undefined,
          behavioralData: behavioralResults.evidence,
          threatIntelData: event.details.threatIntelData
        },
        status: 'OPEN' as any
      };

      await this.alertManager.createAlert(alert);
      this.metrics.alertsGenerated++;

      this.logger.info(`Generated alert ${alert.id} for event ${event.id}`);
      this.emit('alertGenerated', alert);

    } catch (error) {
      this.logger.error('Error generating alert:', error);
    }
  }

  /**
   * Determine alert severity based on risk score
   */
  private determineSeverity(riskScore: number): SecuritySeverity {
    if (riskScore >= 90) return SecuritySeverity.CRITICAL;
    if (riskScore >= 70) return SecuritySeverity.HIGH;
    if (riskScore >= 40) return SecuritySeverity.MEDIUM;
    return SecuritySeverity.LOW;
  }

  /**
   * Generate alert title
   */
  private generateAlertTitle(
    event: SecurityEvent,
    ruleResults: any,
    anomalyResults: AnomalyDetectionResult
  ): string {
    if (ruleResults.triggered && ruleResults.ruleName) {
      return `Security Rule Triggered: ${ruleResults.ruleName}`;
    }

    if (anomalyResults.isAnomalous) {
      return `Anomalous Behavior Detected: ${event.type}`;
    }

    return `Security Event: ${event.type}`;
  }

  /**
   * Generate alert description
   */
  private generateAlertDescription(
    event: SecurityEvent,
    ruleResults: any,
    behavioralResults: any,
    anomalyResults: AnomalyDetectionResult
  ): string {
    const parts = [];

    parts.push(`Security event of type ${event.type} detected from ${event.source.ip}`);

    if (ruleResults.triggered) {
      parts.push(`Triggered security rule: ${ruleResults.ruleName}`);
    }

    if (anomalyResults.isAnomalous) {
      parts.push(`Anomaly detected with score ${anomalyResults.anomalyScore.toFixed(2)}`);
    }

    if (behavioralResults.deviationScore > 0) {
      parts.push(`Behavioral deviation score: ${behavioralResults.deviationScore.toFixed(2)}`);
    }

    if (event.details.threatIntelData && event.details.threatIntelData.length > 0) {
      parts.push(`Matched ${event.details.threatIntelData.length} threat intelligence indicators`);
    }

    return parts.join('. ');
  }

  /**
   * Update metrics
   */
  private updateMetrics(event: SecurityEvent, startTime: number): void {
    this.metrics.eventsProcessed++;
    this.metrics.responseTime = (this.metrics.responseTime + (Date.now() - startTime)) / 2;
    
    // Update detection rate
    this.metrics.detectionRate = 
      (this.metrics.truePositives / Math.max(1, this.metrics.eventsProcessed)) * 100;
  }

  /**
   * Setup event handlers
   */
  private setupEventHandlers(): void {
    this.ruleEngine.on('ruleTriggered', (rule: IDSRule, event: SecurityEvent) => {
      this.logger.info(`Rule ${rule.name} triggered for event ${event.id}`);
    });

    this.behavioralAnalyzer.on('anomalyDetected', (profile: UserBehaviorProfile, event: SecurityEvent) => {
      this.logger.info(`Behavioral anomaly detected for user ${profile.userId}`);
    });

    this.anomalyDetector.on('anomalyDetected', (result: AnomalyDetectionResult, event: SecurityEvent) => {
      this.logger.info(`Statistical anomaly detected for event ${event.id}`);
    });

    this.threatIntel.on('feedUpdated', (provider: string, indicators: number) => {
      this.logger.info(`Threat intelligence feed updated: ${provider} (${indicators} indicators)`);
      this.metrics.threatIntelUpdates++;
    });

    this.alertManager.on('alertEscalated', (alert: IDSAlert) => {
      this.logger.warn(`Alert ${alert.id} escalated`);
    });
  }

  /**
   * Start processing loop
   */
  private startProcessingLoop(): void {
    // Implementation would include real-time event processing
    this.logger.info('Processing loop started');
  }

  /**
   * Start metrics collection
   */
  private startMetricsCollection(): void {
    setInterval(() => {
      this.metricsCollector.collectSystemMetrics().then(systemLoad => {
        this.metrics.systemLoad = systemLoad;
        this.emit('metricsUpdated', this.metrics);
      }).catch(error => {
        this.logger.error('Error collecting system metrics:', error);
      });
    }, 30000); // Every 30 seconds
  }

  /**
   * Extract domain from URL
   */
  private extractDomain(url?: string): string | undefined {
    if (!url) return undefined;
    
    try {
      const parsed = new URL(url);
      return parsed.hostname;
    } catch {
      return undefined;
    }
  }

  /**
   * Get current metrics
   */
  getMetrics(): IDSMetrics {
    return { ...this.metrics };
  }

  /**
   * Get current configuration
   */
  getConfiguration(): IDSConfiguration {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  async updateConfiguration(newConfig: Partial<IDSConfiguration>): Promise<void> {
    this.config = { ...this.config, ...newConfig };
    
    // Update components with new configuration
    await this.ruleEngine.updateConfiguration(this.config.rules);
    await this.behavioralAnalyzer.updateConfiguration(this.config);
    await this.anomalyDetector.updateConfiguration(this.config);
    
    this.logger.info('IDS configuration updated');
    this.emit('configurationUpdated', this.config);
  }

  /**
   * Get processing queue status
   */
  getProcessingStatus(): { queueSize: number; isRunning: boolean; metrics: IDSMetrics } {
    return {
      queueSize: this.processingQueue.length,
      isRunning: this.isRunning,
      metrics: this.getMetrics()
    };
  }
}