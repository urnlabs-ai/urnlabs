/**
 * Alert Manager - Real-time Security Alert Management
 * Handles alert creation, escalation, notification, and lifecycle management
 */

import EventEmitter from 'events';
import { Logger } from 'pino';
import WebSocket from 'ws';
import axios from 'axios';
import Redis from 'ioredis';
import {
  IDSAlert,
  AlertStatus,
  SecuritySeverity,
  AlertingConfiguration,
  NotificationChannel,
  EscalationRule,
  SuppressionRule
} from './types';

export interface AlertNotification {
  alertId: string;
  channel: string;
  status: 'sent' | 'failed' | 'pending';
  timestamp: Date;
  error?: string;
}

export interface AlertMetrics {
  totalAlerts: number;
  alertsBySeverity: Record<SecuritySeverity, number>;
  alertsByStatus: Record<AlertStatus, number>;
  averageResponseTime: number;
  escalationRate: number;
  falsePositiveRate: number;
}

export class AlertManager extends EventEmitter {
  private config: AlertingConfiguration;
  private logger: Logger;
  private alerts: Map<string, IDSAlert> = new Map();
  private notifications: Map<string, AlertNotification[]> = new Map();
  private redis: Redis;
  private websocketServer?: WebSocket.Server;
  private connectedClients: Set<WebSocket> = new Set();
  private suppressions: Map<string, Date> = new Map();
  private escalationTimers: Map<string, NodeJS.Timeout> = new Map();
  private isInitialized: boolean = false;

  constructor(config: AlertingConfiguration, logger: Logger) {
    super();
    this.config = config;
    this.logger = logger.child({ component: 'AlertManager' });
    
    // Initialize Redis for alert persistence
    this.redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
      retryDelayOnFailover: 100,
      maxRetriesPerRequest: 3
    });
  }

  /**
   * Initialize the alert manager
   */
  async initialize(): Promise<void> {
    try {
      this.logger.info('Initializing Alert Manager...');

      // Test Redis connection
      await this.redis.ping();

      // Load existing alerts from Redis
      await this.loadExistingAlerts();

      // Initialize WebSocket server for real-time notifications
      await this.initializeWebSocketServer();

      // Start cleanup routines
      this.startCleanupRoutines();

      this.isInitialized = true;
      this.logger.info('Alert Manager initialized successfully');

    } catch (error) {
      this.logger.error('Failed to initialize Alert Manager:', error);
      throw error;
    }
  }

  /**
   * Stop the alert manager
   */
  async stop(): Promise<void> {
    // Clear all escalation timers
    for (const timer of this.escalationTimers.values()) {
      clearTimeout(timer);
    }
    this.escalationTimers.clear();

    // Close WebSocket server
    if (this.websocketServer) {
      this.websocketServer.close();
    }

    // Close Redis connection
    this.redis.disconnect();

    this.logger.info('Alert Manager stopped');
  }

  /**
   * Create a new security alert
   */
  async createAlert(alert: IDSAlert): Promise<void> {
    if (!this.isInitialized) {
      throw new Error('Alert Manager not initialized');
    }

    try {
      // Check if alert should be suppressed
      if (this.shouldSuppressAlert(alert)) {
        this.logger.debug(`Alert suppressed: ${alert.id}`);
        return;
      }

      // Store alert
      this.alerts.set(alert.id, alert);
      
      // Persist to Redis
      await this.persistAlert(alert);

      // Send notifications
      await this.sendAlertNotifications(alert);

      // Set up escalation if needed
      this.setupEscalation(alert);

      // Broadcast to connected clients
      this.broadcastAlert(alert);

      this.logger.info(`Created alert: ${alert.id} (${alert.severity})`);
      this.emit('alertCreated', alert);

    } catch (error) {
      this.logger.error(`Error creating alert ${alert.id}:`, error);
      throw error;
    }
  }

  /**
   * Update alert status
   */
  async updateAlertStatus(alertId: string, status: AlertStatus, resolution?: string): Promise<void> {
    const alert = this.alerts.get(alertId);
    if (!alert) {
      throw new Error(`Alert not found: ${alertId}`);
    }

    const oldStatus = alert.status;
    alert.status = status;

    if (status === AlertStatus.RESOLVED) {
      alert.resolvedAt = new Date();
      alert.resolution = resolution;
      
      // Clear escalation timer
      const timer = this.escalationTimers.get(alertId);
      if (timer) {
        clearTimeout(timer);
        this.escalationTimers.delete(alertId);
      }
    }

    // Update in storage
    await this.persistAlert(alert);

    // Broadcast update
    this.broadcastAlertUpdate(alert);

    this.logger.info(`Alert ${alertId} status changed: ${oldStatus} -> ${status}`);
    this.emit('alertStatusChanged', alert, oldStatus);
  }

  /**
   * Assign alert to analyst
   */
  async assignAlert(alertId: string, assigneeId: string): Promise<void> {
    const alert = this.alerts.get(alertId);
    if (!alert) {
      throw new Error(`Alert not found: ${alertId}`);
    }

    alert.assignedTo = assigneeId;
    if (alert.status === AlertStatus.OPEN) {
      alert.status = AlertStatus.INVESTIGATING;
    }

    await this.persistAlert(alert);
    this.broadcastAlertUpdate(alert);

    this.logger.info(`Alert ${alertId} assigned to ${assigneeId}`);
    this.emit('alertAssigned', alert, assigneeId);
  }

  /**
   * Get alert by ID
   */
  getAlert(alertId: string): IDSAlert | undefined {
    return this.alerts.get(alertId);
  }

  /**
   * Get alerts with filtering
   */
  getAlerts(filters?: {
    status?: AlertStatus[];
    severity?: SecuritySeverity[];
    assignedTo?: string;
    timeRange?: { start: Date; end: Date };
    limit?: number;
    offset?: number;
  }): IDSAlert[] {
    let alerts = Array.from(this.alerts.values());

    if (filters) {
      if (filters.status) {
        alerts = alerts.filter(alert => filters.status!.includes(alert.status));
      }

      if (filters.severity) {
        alerts = alerts.filter(alert => filters.severity!.includes(alert.severity));
      }

      if (filters.assignedTo) {
        alerts = alerts.filter(alert => alert.assignedTo === filters.assignedTo);
      }

      if (filters.timeRange) {
        alerts = alerts.filter(alert => 
          alert.timestamp >= filters.timeRange!.start && 
          alert.timestamp <= filters.timeRange!.end
        );
      }
    }

    // Sort by timestamp (newest first)
    alerts.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    // Apply pagination
    if (filters?.offset) {
      alerts = alerts.slice(filters.offset);
    }
    if (filters?.limit) {
      alerts = alerts.slice(0, filters.limit);
    }

    return alerts;
  }

  /**
   * Get alert metrics
   */
  getMetrics(): AlertMetrics {
    const alerts = Array.from(this.alerts.values());
    
    const metrics: AlertMetrics = {
      totalAlerts: alerts.length,
      alertsBySeverity: {
        [SecuritySeverity.LOW]: 0,
        [SecuritySeverity.MEDIUM]: 0,
        [SecuritySeverity.HIGH]: 0,
        [SecuritySeverity.CRITICAL]: 0
      },
      alertsByStatus: {
        [AlertStatus.OPEN]: 0,
        [AlertStatus.INVESTIGATING]: 0,
        [AlertStatus.RESOLVED]: 0,
        [AlertStatus.FALSE_POSITIVE]: 0,
        [AlertStatus.ESCALATED]: 0
      },
      averageResponseTime: 0,
      escalationRate: 0,
      falsePositiveRate: 0
    };

    let totalResponseTime = 0;
    let responseTimeCount = 0;
    let escalatedCount = 0;
    let falsePositiveCount = 0;

    for (const alert of alerts) {
      // Count by severity
      metrics.alertsBySeverity[alert.severity]++;

      // Count by status
      metrics.alertsByStatus[alert.status]++;

      // Calculate response time
      if (alert.resolvedAt) {
        const responseTime = alert.resolvedAt.getTime() - alert.timestamp.getTime();
        totalResponseTime += responseTime;
        responseTimeCount++;
      }

      // Count escalations
      if (alert.status === AlertStatus.ESCALATED) {
        escalatedCount++;
      }

      // Count false positives
      if (alert.status === AlertStatus.FALSE_POSITIVE) {
        falsePositiveCount++;
      }
    }

    // Calculate averages and rates
    if (responseTimeCount > 0) {
      metrics.averageResponseTime = totalResponseTime / responseTimeCount;
    }

    if (alerts.length > 0) {
      metrics.escalationRate = (escalatedCount / alerts.length) * 100;
      metrics.falsePositiveRate = (falsePositiveCount / alerts.length) * 100;
    }

    return metrics;
  }

  /**
   * Check if alert should be suppressed
   */
  private shouldSuppressAlert(alert: IDSAlert): boolean {
    for (const rule of this.config.suppressionRules) {
      if (this.matchesSuppressionRule(alert, rule)) {
        const suppressionKey = `${rule.pattern}:${alert.source.ip}`;
        const lastSuppression = this.suppressions.get(suppressionKey);
        
        if (lastSuppression && 
            (Date.now() - lastSuppression.getTime()) < (rule.duration * 1000)) {
          return true;
        }

        // Update suppression timestamp
        this.suppressions.set(suppressionKey, new Date());
      }
    }

    return false;
  }

  /**
   * Check if alert matches suppression rule
   */
  private matchesSuppressionRule(alert: IDSAlert, rule: SuppressionRule): boolean {
    // Simple pattern matching - in production, use more sophisticated matching
    return alert.title.includes(rule.pattern) || 
           alert.description.includes(rule.pattern);
  }

  /**
   * Send alert notifications to configured channels
   */
  private async sendAlertNotifications(alert: IDSAlert): Promise<void> {
    const notificationPromises: Promise<void>[] = [];

    for (const channel of this.config.notificationChannels) {
      if (this.shouldNotifyChannel(channel, alert)) {
        notificationPromises.push(this.sendToChannel(channel, alert));
      }
    }

    try {
      await Promise.allSettled(notificationPromises);
    } catch (error) {
      this.logger.error('Error sending notifications:', error);
    }
  }

  /**
   * Check if channel should receive notification for this alert
   */
  private shouldNotifyChannel(channel: NotificationChannel, alert: IDSAlert): boolean {
    return channel.severityFilter.length === 0 || 
           channel.severityFilter.includes(alert.severity);
  }

  /**
   * Send notification to specific channel
   */
  private async sendToChannel(channel: NotificationChannel, alert: IDSAlert): Promise<void> {
    const notification: AlertNotification = {
      alertId: alert.id,
      channel: channel.name,
      status: 'pending',
      timestamp: new Date()
    };

    try {
      switch (channel.type) {
        case 'email':
          await this.sendEmailNotification(channel, alert);
          break;
        case 'slack':
          await this.sendSlackNotification(channel, alert);
          break;
        case 'webhook':
          await this.sendWebhookNotification(channel, alert);
          break;
        case 'sms':
          await this.sendSMSNotification(channel, alert);
          break;
        default:
          throw new Error(`Unknown notification channel type: ${channel.type}`);
      }

      notification.status = 'sent';
      this.logger.debug(`Notification sent to ${channel.name} for alert ${alert.id}`);

    } catch (error) {
      notification.status = 'failed';
      notification.error = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to send notification to ${channel.name}:`, error);
    }

    // Store notification record
    const alertNotifications = this.notifications.get(alert.id) || [];
    alertNotifications.push(notification);
    this.notifications.set(alert.id, alertNotifications);
  }

  /**
   * Send email notification
   */
  private async sendEmailNotification(channel: NotificationChannel, alert: IDSAlert): Promise<void> {
    // Implementation would use SMTP client
    this.logger.debug(`Sending email notification for alert ${alert.id}`);
    
    // Simulate email sending
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  /**
   * Send Slack notification
   */
  private async sendSlackNotification(channel: NotificationChannel, alert: IDSAlert): Promise<void> {
    const webhookUrl = channel.configuration.webhookUrl;
    if (!webhookUrl) {
      throw new Error('Slack webhook URL not configured');
    }

    const message = {
      text: `🚨 Security Alert: ${alert.title}`,
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: `🚨 ${alert.severity} Security Alert`
          }
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Alert:* ${alert.title}\n*Description:* ${alert.description}\n*Source:* ${alert.source.ip}\n*Time:* ${alert.timestamp.toISOString()}`
          }
        },
        {
          type: 'actions',
          elements: [
            {
              type: 'button',
              text: {
                type: 'plain_text',
                text: 'View Alert'
              },
              url: `${process.env.DASHBOARD_URL}/alerts/${alert.id}`
            }
          ]
        }
      ]
    };

    await axios.post(webhookUrl, message);
  }

  /**
   * Send webhook notification
   */
  private async sendWebhookNotification(channel: NotificationChannel, alert: IDSAlert): Promise<void> {
    const endpoints = channel.configuration.endpoints || [];
    
    for (const endpoint of endpoints) {
      await axios({
        method: endpoint.method || 'POST',
        url: endpoint.url,
        headers: endpoint.headers || {},
        data: {
          alert,
          timestamp: new Date(),
          source: 'urnlabs-ids'
        }
      });
    }
  }

  /**
   * Send SMS notification
   */
  private async sendSMSNotification(channel: NotificationChannel, alert: IDSAlert): Promise<void> {
    // Implementation would use SMS provider API
    this.logger.debug(`Sending SMS notification for alert ${alert.id}`);
    
    // Simulate SMS sending
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  /**
   * Setup escalation for alert
   */
  private setupEscalation(alert: IDSAlert): void {
    for (const rule of this.config.escalationRules) {
      if (this.matchesEscalationRule(alert, rule)) {
        const timer = setTimeout(async () => {
          await this.escalateAlert(alert.id, rule);
        }, rule.delay * 1000);

        this.escalationTimers.set(alert.id, timer);
        break; // Only set up first matching escalation
      }
    }
  }

  /**
   * Check if alert matches escalation rule
   */
  private matchesEscalationRule(alert: IDSAlert, rule: EscalationRule): boolean {
    // Simple condition evaluation - in production, use expression parser
    return alert.severity === SecuritySeverity.CRITICAL || 
           alert.severity === SecuritySeverity.HIGH;
  }

  /**
   * Escalate alert
   */
  private async escalateAlert(alertId: string, rule: EscalationRule): Promise<void> {
    const alert = this.alerts.get(alertId);
    if (!alert || alert.status !== AlertStatus.OPEN) {
      return; // Alert already handled
    }

    this.logger.warn(`Escalating alert ${alertId} due to timeout`);

    // Update alert status
    alert.status = AlertStatus.ESCALATED;
    await this.persistAlert(alert);

    // Execute escalation action
    await this.executeEscalationAction(alert, rule);

    this.broadcastAlertUpdate(alert);
    this.emit('alertEscalated', alert);
  }

  /**
   * Execute escalation action
   */
  private async executeEscalationAction(alert: IDSAlert, rule: EscalationRule): Promise<void> {
    switch (rule.action) {
      case 'notify_manager':
        await this.notifyManager(alert, rule.target);
        break;
      case 'create_ticket':
        await this.createTicket(alert, rule.target);
        break;
      case 'page_oncall':
        await this.pageOnCall(alert, rule.target);
        break;
      default:
        this.logger.warn(`Unknown escalation action: ${rule.action}`);
    }
  }

  /**
   * Notify manager
   */
  private async notifyManager(alert: IDSAlert, target: string): Promise<void> {
    this.logger.info(`Notifying manager ${target} about escalated alert ${alert.id}`);
    // Implementation would send manager notification
  }

  /**
   * Create support ticket
   */
  private async createTicket(alert: IDSAlert, target: string): Promise<void> {
    this.logger.info(`Creating ticket in ${target} for alert ${alert.id}`);
    // Implementation would integrate with ticketing system
  }

  /**
   * Page on-call engineer
   */
  private async pageOnCall(alert: IDSAlert, target: string): Promise<void> {
    this.logger.info(`Paging on-call ${target} for alert ${alert.id}`);
    // Implementation would integrate with paging system
  }

  /**
   * Initialize WebSocket server for real-time notifications
   */
  private async initializeWebSocketServer(): Promise<void> {
    const port = parseInt(process.env.ALERT_WS_PORT || '8080');
    
    this.websocketServer = new WebSocket.Server({ port });

    this.websocketServer.on('connection', (ws) => {
      this.connectedClients.add(ws);
      
      ws.on('close', () => {
        this.connectedClients.delete(ws);
      });

      ws.on('error', (error) => {
        this.logger.error('WebSocket error:', error);
        this.connectedClients.delete(ws);
      });

      // Send initial alert count
      ws.send(JSON.stringify({
        type: 'alert_count',
        data: { total: this.alerts.size }
      }));
    });

    this.logger.info(`Alert WebSocket server listening on port ${port}`);
  }

  /**
   * Broadcast alert to connected clients
   */
  private broadcastAlert(alert: IDSAlert): void {
    const message = JSON.stringify({
      type: 'new_alert',
      data: alert
    });

    this.connectedClients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  }

  /**
   * Broadcast alert update to connected clients
   */
  private broadcastAlertUpdate(alert: IDSAlert): void {
    const message = JSON.stringify({
      type: 'alert_update',
      data: alert
    });

    this.connectedClients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  }

  /**
   * Persist alert to Redis
   */
  private async persistAlert(alert: IDSAlert): Promise<void> {
    const key = `alert:${alert.id}`;
    await this.redis.setex(key, 86400 * 30, JSON.stringify(alert)); // 30 days TTL
  }

  /**
   * Load existing alerts from Redis
   */
  private async loadExistingAlerts(): Promise<void> {
    try {
      const keys = await this.redis.keys('alert:*');
      
      for (const key of keys) {
        const alertData = await this.redis.get(key);
        if (alertData) {
          const alert = JSON.parse(alertData);
          alert.timestamp = new Date(alert.timestamp);
          if (alert.resolvedAt) {
            alert.resolvedAt = new Date(alert.resolvedAt);
          }
          this.alerts.set(alert.id, alert);
        }
      }

      this.logger.info(`Loaded ${this.alerts.size} existing alerts from Redis`);

    } catch (error) {
      this.logger.error('Error loading existing alerts:', error);
    }
  }

  /**
   * Start cleanup routines
   */
  private startCleanupRoutines(): void {
    // Clean up old suppressions every hour
    setInterval(() => {
      const now = Date.now();
      for (const [key, timestamp] of this.suppressions.entries()) {
        if (now - timestamp.getTime() > 3600000) { // 1 hour
          this.suppressions.delete(key);
        }
      }
    }, 3600000);

    // Clean up old notifications every day
    setInterval(() => {
      const cutoff = new Date(Date.now() - 86400000 * 7); // 7 days ago
      for (const [alertId, notifications] of this.notifications.entries()) {
        const filtered = notifications.filter(n => n.timestamp > cutoff);
        if (filtered.length !== notifications.length) {
          this.notifications.set(alertId, filtered);
        }
      }
    }, 86400000);
  }
}