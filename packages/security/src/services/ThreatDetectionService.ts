/**
 * Threat Detection Integration Service
 *
 * Integrates ML-based threat detection with the audit logging system.
 * Provides real-time threat detection, incident response, and monitoring.
 */

import { EventEmitter } from 'events';
import { AuditLoggingService, AuditEvent } from './audit-logging';
import { ThreatDetectionEngine, ThreatEvent, ThreatDetectionConfig } from '../ml/ThreatDetectionEngine';
import Redis from 'ioredis';

export interface IncidentResponse {
  incidentId: string;
  threatId: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  status: 'DETECTED' | 'INVESTIGATING' | 'CONTAINED' | 'RESOLVED';
  triggeredAt: Date;
  actions: {
    automated: string[];
    manual: string[];
    pending: string[];
  };
  affectedResources: string[];
  responseTeam: string[];
  timeline: Array<{
    timestamp: Date;
    action: string;
    performer: string;
    status: string;
  }>;
}

export interface ThreatAlert {
  id: string;
  threatEvent: ThreatEvent;
  alertLevel: 'INFO' | 'WARNING' | 'CRITICAL';
  recipients: string[];
  channels: string[];
  sentAt: Date;
  acknowledged: boolean;
  acknowledgedBy?: string;
  acknowledgedAt?: Date;
}

export interface ThreatDetectionMetrics {
  detectionEngine: {
    eventsProcessed: number;
    threatsDetected: number;
    falsePositives: number;
    averageDetectionTime: number;
  };
  incidents: {
    total: number;
    byStatus: Record<string, number>;
    bySeverity: Record<string, number>;
    avgResolutionTime: number;
  };
  alerts: {
    sent: number;
    acknowledged: number;
    pending: number;
  };
}

export class ThreatDetectionService extends EventEmitter {
  private threatEngine: ThreatDetectionEngine;
  private auditService: AuditLoggingService;
  private redis: Redis;
  private incidents: Map<string, IncidentResponse> = new Map();
  private alerts: Map<string, ThreatAlert> = new Map();
  private isInitialized: boolean = false;

  private readonly REAL_TIME_STREAM_KEY = 'audit_events_stream';
  private readonly THREAT_ALERTS_KEY = 'threat_alerts';
  private readonly INCIDENTS_KEY = 'security_incidents';

  constructor(
    auditService: AuditLoggingService,
    private config: {
      threatDetection: ThreatDetectionConfig;
      incidentResponse: {
        autoContainment: boolean;
        escalationThresholds: Record<string, number>;
        responseTeamEmails: string[];
        slackWebhook?: string;
      };
      alerting: {
        emailService?: any;
        slackService?: any;
        webhookUrls: string[];
      };
      redisUrl?: string;
    }
  ) {
    super();

    this.auditService = auditService;
    this.redis = new Redis(this.config.redisUrl || process.env.REDIS_URL || 'redis://localhost:6379');

    // Initialize threat detection engine
    this.threatEngine = new ThreatDetectionEngine(
      this.config.threatDetection,
      { redisUrl: this.config.redisUrl }
    );

    this.setupEventHandlers();
  }

  /**
   * Initialize the threat detection service
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // Initialize threat detection engine
      await this.threatEngine.initialize();

      // Setup real-time audit event processing
      await this.setupRealTimeProcessing();

      // Load existing incidents and alerts
      await this.loadPersistedData();

      this.isInitialized = true;
      this.emit('initialized');

    } catch (error) {
      throw new Error(`Failed to initialize ThreatDetectionService: ${error.message}`);
    }
  }

  /**
   * Process an audit event for threat detection
   */
  async processAuditEvent(auditEvent: AuditEvent): Promise<void> {
    try {
      // Detect threats using ML engine
      const threats = await this.threatEngine.processAuditEvent(auditEvent);

      // Process each detected threat
      for (const threat of threats) {
        await this.handleThreatDetection(threat, auditEvent);
      }

      // Stream event to real-time processors
      await this.streamAuditEvent(auditEvent);

    } catch (error) {
      this.emit('processingError', {
        auditEvent,
        error: error.message,
        timestamp: new Date()
      });
    }
  }

  /**
   * Handle a detected threat
   */
  private async handleThreatDetection(threat: ThreatEvent, originalEvent: AuditEvent): Promise<void> {
    try {
      // Log threat detection
      await this.logThreatDetection(threat, originalEvent);

      // Create incident if severity warrants it
      if (threat.severity === 'HIGH' || threat.severity === 'CRITICAL') {
        const incident = await this.createIncident(threat);
        await this.executeAutomatedResponse(incident, threat);
      }

      // Send alerts based on severity
      await this.sendThreatAlert(threat);

      // Update metrics
      this.updateThreatMetrics(threat);

      this.emit('threatDetected', {
        threat,
        originalEvent,
        timestamp: new Date()
      });

    } catch (error) {
      this.emit('threatHandlingError', {
        threat,
        error: error.message,
        timestamp: new Date()
      });
    }
  }

  /**
   * Log threat detection as audit event
   */
  private async logThreatDetection(threat: ThreatEvent, originalEvent: AuditEvent): Promise<void> {
    await this.auditService.logEvent({
      eventType: 'THREAT_DETECTED',
      category: 'SECURITY',
      severity: threat.severity,
      source: {
        service: 'threat-detection-service',
        version: '1.0.0',
        instance: process.env.HOSTNAME || 'unknown',
        ip: '127.0.0.1'
      },
      actor: {
        type: 'SYSTEM',
        userId: 'threat-detection-engine'
      },
      target: {
        resource: 'security-monitoring',
        resourceType: 'threat-detection'
      },
      action: 'detect_threat',
      outcome: 'SUCCESS',
      details: {
        threatId: threat.id,
        threatType: threat.threatType,
        confidence: threat.confidence,
        riskScore: threat.riskScore,
        originalEventId: originalEvent.id,
        mitigationRecommendations: threat.mitigationRecommendations
      },
      metadata: {
        correlationId: threat.id,
        requestId: originalEvent.id
      },
      compliance: {
        iso27001: true,
        sox: true
      }
    });
  }

  /**
   * Create security incident
   */
  private async createIncident(threat: ThreatEvent): Promise<IncidentResponse> {
    const incident: IncidentResponse = {
      incidentId: `INC_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      threatId: threat.id,
      severity: threat.severity,
      status: 'DETECTED',
      triggeredAt: new Date(),
      actions: {
        automated: [],
        manual: [],
        pending: threat.mitigationRecommendations
      },
      affectedResources: [threat.target.resource],
      responseTeam: this.config.incidentResponse.responseTeamEmails,
      timeline: [{
        timestamp: new Date(),
        action: 'Incident created from threat detection',
        performer: 'threat-detection-service',
        status: 'DETECTED'
      }]
    };

    // Store incident
    this.incidents.set(incident.incidentId, incident);
    await this.redis.hset(this.INCIDENTS_KEY, incident.incidentId, JSON.stringify(incident));

    // Log incident creation
    await this.auditService.logEvent({
      eventType: 'INCIDENT_CREATED',
      category: 'SECURITY',
      severity: threat.severity,
      source: {
        service: 'threat-detection-service',
        version: '1.0.0',
        instance: process.env.HOSTNAME || 'unknown',
        ip: '127.0.0.1'
      },
      actor: {
        type: 'SYSTEM',
        userId: 'incident-response-system'
      },
      target: {
        resource: 'security-incident',
        resourceType: 'incident',
        resourceId: incident.incidentId
      },
      action: 'create_incident',
      outcome: 'SUCCESS',
      details: {
        incidentId: incident.incidentId,
        threatId: threat.id,
        severity: threat.severity,
        triggeredBy: 'threat-detection'
      },
      metadata: {
        correlationId: incident.incidentId
      },
      compliance: {
        iso27001: true,
        sox: true
      }
    });

    this.emit('incidentCreated', incident);
    return incident;
  }

  /**
   * Execute automated response actions
   */
  private async executeAutomatedResponse(incident: IncidentResponse, threat: ThreatEvent): Promise<void> {
    if (!this.config.incidentResponse.autoContainment) {
      return;
    }

    const automatedActions: string[] = [];

    try {
      // Block suspicious IP if geographic anomaly
      if (threat.threatType === 'GEOGRAPHIC' && threat.actor.ipAddress) {
        await this.blockSuspiciousIP(threat.actor.ipAddress);
        automatedActions.push(`Blocked suspicious IP: ${threat.actor.ipAddress}`);
      }

      // Suspend user session if behavioral anomaly
      if (threat.threatType === 'BEHAVIORAL' && threat.actor.sessionId) {
        await this.suspendUserSession(threat.actor.sessionId);
        automatedActions.push(`Suspended user session: ${threat.actor.sessionId}`);
      }

      // Rate limit if brute force detected
      if (threat.threatType === 'BRUTE_FORCE') {
        await this.implementRateLimit(threat.actor.ipAddress || 'unknown');
        automatedActions.push('Implemented enhanced rate limiting');
      }

      // Alert security team for privilege escalation
      if (threat.threatType === 'PRIVILEGE_ESCALATION') {
        await this.alertSecurityTeam(incident, threat);
        automatedActions.push('Alerted security team immediately');
      }

      // Update incident with automated actions
      incident.actions.automated = automatedActions;
      incident.timeline.push({
        timestamp: new Date(),
        action: `Automated response executed: ${automatedActions.join(', ')}`,
        performer: 'automated-response-system',
        status: 'CONTAINED'
      });

      if (automatedActions.length > 0) {
        incident.status = 'CONTAINED';
      }

      // Persist updated incident
      await this.redis.hset(this.INCIDENTS_KEY, incident.incidentId, JSON.stringify(incident));

    } catch (error) {
      this.emit('automatedResponseError', {
        incident,
        threat,
        error: error.message
      });
    }
  }

  /**
   * Send threat alert to configured channels
   */
  private async sendThreatAlert(threat: ThreatEvent): Promise<void> {
    const alert: ThreatAlert = {
      id: `ALERT_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      threatEvent: threat,
      alertLevel: this.calculateAlertLevel(threat),
      recipients: this.getAlertRecipients(threat),
      channels: this.getAlertChannels(threat),
      sentAt: new Date(),
      acknowledged: false
    };

    try {
      // Send email alerts
      if (this.config.alerting.emailService) {
        await this.sendEmailAlert(alert);
      }

      // Send Slack alerts
      if (this.config.alerting.slackService) {
        await this.sendSlackAlert(alert);
      }

      // Send webhook alerts
      for (const webhookUrl of this.config.alerting.webhookUrls) {
        await this.sendWebhookAlert(alert, webhookUrl);
      }

      // Store alert
      this.alerts.set(alert.id, alert);
      await this.redis.hset(this.THREAT_ALERTS_KEY, alert.id, JSON.stringify(alert));

      this.emit('alertSent', alert);

    } catch (error) {
      this.emit('alertError', {
        alert,
        error: error.message
      });
    }
  }

  /**
   * Calculate alert level based on threat characteristics
   */
  private calculateAlertLevel(threat: ThreatEvent): ThreatAlert['alertLevel'] {
    if (threat.severity === 'CRITICAL' || threat.riskScore >= 90) {
      return 'CRITICAL';
    } else if (threat.severity === 'HIGH' || threat.riskScore >= 70) {
      return 'WARNING';
    }
    return 'INFO';
  }

  /**
   * Get alert recipients based on threat severity
   */
  private getAlertRecipients(threat: ThreatEvent): string[] {
    const recipients = [...this.config.incidentResponse.responseTeamEmails];

    // Add additional recipients for high severity threats
    if (threat.severity === 'CRITICAL') {
      // In practice, would include CISO, security managers, etc.
      recipients.push('security-team@urnlabs.ai');
    }

    return recipients;
  }

  /**
   * Get alert channels based on threat characteristics
   */
  private getAlertChannels(threat: ThreatEvent): string[] {
    const channels = ['email'];

    if (threat.severity === 'HIGH' || threat.severity === 'CRITICAL') {
      channels.push('slack', 'webhook');
    }

    return channels;
  }

  /**
   * Send email alert
   */
  private async sendEmailAlert(alert: ThreatAlert): Promise<void> {
    // Implementation would use actual email service
    console.log(`Email alert sent for threat ${alert.threatEvent.id}`);
  }

  /**
   * Send Slack alert
   */
  private async sendSlackAlert(alert: ThreatAlert): Promise<void> {
    // Implementation would use Slack API
    console.log(`Slack alert sent for threat ${alert.threatEvent.id}`);
  }

  /**
   * Send webhook alert
   */
  private async sendWebhookAlert(alert: ThreatAlert, webhookUrl: string): Promise<void> {
    // Implementation would make HTTP POST to webhook
    console.log(`Webhook alert sent to ${webhookUrl} for threat ${alert.threatEvent.id}`);
  }

  /**
   * Automated response actions
   */
  private async blockSuspiciousIP(ipAddress: string): Promise<void> {
    // Implementation would integrate with firewall/WAF
    console.log(`Blocked suspicious IP: ${ipAddress}`);
  }

  private async suspendUserSession(sessionId: string): Promise<void> {
    // Implementation would invalidate session
    console.log(`Suspended user session: ${sessionId}`);
  }

  private async implementRateLimit(ipAddress: string): Promise<void> {
    // Implementation would configure rate limiting
    console.log(`Implemented rate limit for IP: ${ipAddress}`);
  }

  private async alertSecurityTeam(incident: IncidentResponse, threat: ThreatEvent): Promise<void> {
    // Implementation would send immediate alerts
    console.log(`Security team alerted for incident: ${incident.incidentId}`);
  }

  /**
   * Setup real-time audit event processing
   */
  private async setupRealTimeProcessing(): Promise<void> {
    // Listen for audit events from the audit service
    this.auditService.on('auditEvent', async (auditEvent: AuditEvent) => {
      await this.processAuditEvent(auditEvent);
    });

    // Setup Redis stream processing for distributed environments
    setInterval(async () => {
      try {
        const results = await this.redis.xread(
          'COUNT', 10,
          'BLOCK', 1000,
          'STREAMS', this.REAL_TIME_STREAM_KEY, '$'
        );

        if (results && results.length > 0) {
          for (const [stream, messages] of results) {
            for (const [messageId, fields] of messages) {
              try {
                const auditEvent = JSON.parse(fields[1]);
                await this.processAuditEvent(auditEvent);
              } catch (error) {
                console.error('Error processing Redis stream message:', error);
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
   * Stream audit event to Redis for real-time processing
   */
  private async streamAuditEvent(auditEvent: AuditEvent): Promise<void> {
    try {
      await this.redis.xadd(
        this.REAL_TIME_STREAM_KEY,
        '*',
        'event', JSON.stringify(auditEvent)
      );
    } catch (error) {
      console.error('Error streaming audit event:', error);
    }
  }

  /**
   * Load persisted incidents and alerts
   */
  private async loadPersistedData(): Promise<void> {
    try {
      // Load incidents
      const incidentData = await this.redis.hgetall(this.INCIDENTS_KEY);
      for (const [incidentId, data] of Object.entries(incidentData)) {
        try {
          const incident = JSON.parse(data);
          incident.triggeredAt = new Date(incident.triggeredAt);
          incident.timeline = incident.timeline.map((item: any) => ({
            ...item,
            timestamp: new Date(item.timestamp)
          }));
          this.incidents.set(incidentId, incident);
        } catch (error) {
          console.error(`Error loading incident ${incidentId}:`, error);
        }
      }

      // Load alerts
      const alertData = await this.redis.hgetall(this.THREAT_ALERTS_KEY);
      for (const [alertId, data] of Object.entries(alertData)) {
        try {
          const alert = JSON.parse(data);
          alert.sentAt = new Date(alert.sentAt);
          if (alert.acknowledgedAt) {
            alert.acknowledgedAt = new Date(alert.acknowledgedAt);
          }
          this.alerts.set(alertId, alert);
        } catch (error) {
          console.error(`Error loading alert ${alertId}:`, error);
        }
      }

    } catch (error) {
      console.warn('Could not load persisted data:', error.message);
    }
  }

  /**
   * Setup event handlers
   */
  private setupEventHandlers(): void {
    this.threatEngine.on('threatDetected', (threat: ThreatEvent) => {
      this.emit('engineThreatDetected', threat);
    });

    this.threatEngine.on('metricsUpdate', (metrics) => {
      this.emit('engineMetricsUpdate', metrics);
    });

    this.threatEngine.on('processingError', (error) => {
      this.emit('engineProcessingError', error);
    });
  }

  /**
   * Update threat detection metrics
   */
  private updateThreatMetrics(threat: ThreatEvent): void {
    // In practice, would update comprehensive metrics
    this.emit('metricsUpdate', {
      threatDetected: true,
      threatType: threat.threatType,
      severity: threat.severity,
      riskScore: threat.riskScore,
      timestamp: new Date()
    });
  }

  /**
   * Get threat detection metrics
   */
  getMetrics(): ThreatDetectionMetrics {
    const engineMetrics = this.threatEngine.getMetrics();

    const incidentsByStatus = {};
    const incidentsBySeverity = {};

    for (const incident of this.incidents.values()) {
      incidentsByStatus[incident.status] = (incidentsByStatus[incident.status] || 0) + 1;
      incidentsBySeverity[incident.severity] = (incidentsBySeverity[incident.severity] || 0) + 1;
    }

    const acknowledgedAlerts = Array.from(this.alerts.values()).filter(a => a.acknowledged).length;

    return {
      detectionEngine: {
        eventsProcessed: engineMetrics.totalEventsProcessed,
        threatsDetected: engineMetrics.threatsDetected,
        falsePositives: engineMetrics.falsePositives,
        averageDetectionTime: engineMetrics.processingLatency.avg
      },
      incidents: {
        total: this.incidents.size,
        byStatus: incidentsByStatus,
        bySeverity: incidentsBySeverity,
        avgResolutionTime: 0 // Would calculate from resolved incidents
      },
      alerts: {
        sent: this.alerts.size,
        acknowledged: acknowledgedAlerts,
        pending: this.alerts.size - acknowledgedAlerts
      }
    };
  }

  /**
   * Acknowledge an alert
   */
  async acknowledgeAlert(alertId: string, acknowledgedBy: string): Promise<void> {
    const alert = this.alerts.get(alertId);
    if (alert) {
      alert.acknowledged = true;
      alert.acknowledgedBy = acknowledgedBy;
      alert.acknowledgedAt = new Date();

      await this.redis.hset(this.THREAT_ALERTS_KEY, alertId, JSON.stringify(alert));
      this.emit('alertAcknowledged', alert);
    }
  }

  /**
   * Update incident status
   */
  async updateIncident(incidentId: string, updates: Partial<IncidentResponse>): Promise<void> {
    const incident = this.incidents.get(incidentId);
    if (incident) {
      Object.assign(incident, updates);

      if (updates.status) {
        incident.timeline.push({
          timestamp: new Date(),
          action: `Status updated to ${updates.status}`,
          performer: 'incident-manager',
          status: updates.status
        });
      }

      await this.redis.hset(this.INCIDENTS_KEY, incidentId, JSON.stringify(incident));
      this.emit('incidentUpdated', incident);
    }
  }

  /**
   * Shutdown the service
   */
  async shutdown(): Promise<void> {
    await this.threatEngine.shutdown();
    await this.redis.quit();
    this.isInitialized = false;
  }
}