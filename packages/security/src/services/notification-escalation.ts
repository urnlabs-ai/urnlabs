import { EventEmitter } from 'events';
import { SecurityIncident, IncidentSeverity, IncidentStatus } from './incident-response';
import axios from 'axios';
import * as fs from 'fs/promises';

export interface NotificationChannel {
  id: string;
  name: string;
  type: 'slack' | 'email' | 'sms' | 'webhook' | 'teams' | 'pagerduty' | 'discord';
  config: NotificationChannelConfig;
  enabled: boolean;
  severityFilters: IncidentSeverity[];
  statusFilters: IncidentStatus[];
  teamFilters: string[];
  timeFilters?: TimeFilter[];
  rateLimits?: RateLimitConfig;
}

export interface NotificationChannelConfig {
  // Slack
  webhookUrl?: string;
  channel?: string;
  username?: string;
  iconEmoji?: string;

  // Email
  smtpHost?: string;
  smtpPort?: number;
  smtpUser?: string;
  smtpPassword?: string;
  fromEmail?: string;
  toEmails?: string[];

  // SMS
  twilioAccountSid?: string;
  twilioAuthToken?: string;
  fromPhone?: string;
  toPhones?: string[];

  // Webhook
  url?: string;
  method?: 'POST' | 'PUT' | 'PATCH';
  headers?: Record<string, string>;

  // PagerDuty
  integrationKey?: string;

  // Teams
  connectorUrl?: string;
}

export interface TimeFilter {
  days: number[]; // 0-6 (Sunday-Saturday)
  startHour: number; // 0-23
  endHour: number; // 0-23
  timezone: string;
}

export interface RateLimitConfig {
  maxNotifications: number;
  windowMinutes: number;
  burstLimit?: number;
}

export interface EscalationPolicy {
  id: string;
  name: string;
  description: string;
  triggers: EscalationTrigger[];
  steps: EscalationStep[];
  enabled: boolean;
  priority: number;
}

export interface EscalationTrigger {
  type: 'time_based' | 'status_unchanged' | 'severity_increase' | 'manual' | 'condition';
  condition?: string;
  delayMinutes?: number;
  maxEscalations?: number;
}

export interface EscalationStep {
  stepNumber: number;
  name: string;
  delayMinutes: number;
  channels: string[];
  assignees: string[];
  actions: EscalationAction[];
  conditions?: string[];
}

export interface EscalationAction {
  type: 'notify' | 'assign' | 'escalate' | 'create_ticket' | 'call_oncall' | 'page';
  target: string;
  parameters?: Record<string, any>;
}

export interface NotificationTemplate {
  id: string;
  name: string;
  description: string;
  channelType: string;
  eventTypes: string[];
  template: {
    subject?: string;
    body: string;
    attachments?: NotificationAttachment[];
  };
  variables: string[];
}

export interface NotificationAttachment {
  type: 'incident_report' | 'timeline' | 'metrics' | 'evidence' | 'logs';
  format: 'json' | 'pdf' | 'csv' | 'html';
  include: string[];
}

export interface NotificationQueue {
  id: string;
  incidentId: string;
  channelId: string;
  templateId: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  scheduledAt: Date;
  attempts: number;
  maxAttempts: number;
  status: 'pending' | 'sending' | 'sent' | 'failed' | 'cancelled';
  error?: string;
  sentAt?: Date;
  metadata: Record<string, any>;
}

export interface OnCallSchedule {
  id: string;
  name: string;
  team: string;
  rotations: OnCallRotation[];
  enabled: boolean;
}

export interface OnCallRotation {
  id: string;
  name: string;
  type: 'daily' | 'weekly' | 'monthly';
  participants: OnCallParticipant[];
  startDate: Date;
  timezone: string;
  handoffTime: string; // HH:MM format
}

export interface OnCallParticipant {
  userId: string;
  name: string;
  email: string;
  phone?: string;
  slackUserId?: string;
  order: number;
  backup?: boolean;
}

export interface WarRoom {
  id: string;
  incidentId: string;
  name: string;
  type: 'slack' | 'teams' | 'zoom' | 'discord';
  url?: string;
  channelId?: string;
  participants: string[];
  createdAt: Date;
  active: boolean;
}

export class NotificationEscalationService extends EventEmitter {
  private channels: Map<string, NotificationChannel> = new Map();
  private escalationPolicies: Map<string, EscalationPolicy> = new Map();
  private templates: Map<string, NotificationTemplate> = new Map();
  private notificationQueue: NotificationQueue[] = [];
  private onCallSchedules: Map<string, OnCallSchedule> = new Map();
  private activeEscalations: Map<string, any> = new Map();
  private warRooms: Map<string, WarRoom> = new Map();
  private rateLimitTracking: Map<string, any[]> = new Map();
  private processingInterval: NodeJS.Timeout | null = null;

  constructor() {
    super();
    this.initializeService();
  }

  private initializeService(): void {
    this.setupDefaultChannels();
    this.setupDefaultEscalationPolicies();
    this.setupDefaultTemplates();
    this.setupDefaultOnCallSchedules();
    this.startQueueProcessor();
  }

  /**
   * Send incident notification
   */
  async sendIncidentNotification(
    incident: SecurityIncident,
    eventType: string,
    channels?: string[]
  ): Promise<void> {
    const applicableChannels = channels
      ? channels.map(id => this.channels.get(id)).filter(Boolean) as NotificationChannel[]
      : this.getApplicableChannels(incident, eventType);

    for (const channel of applicableChannels) {
      if (!this.canSendNotification(channel, incident)) {
        continue;
      }

      const template = this.getTemplate(channel.type, eventType);
      if (!template) {
        console.warn(`No template found for ${channel.type}:${eventType}`);
        continue;
      }

      await this.queueNotification(incident, channel, template, eventType);
    }
  }

  /**
   * Start escalation for incident
   */
  async startEscalation(incident: SecurityIncident): Promise<void> {
    const applicablePolicies = this.getApplicableEscalationPolicies(incident);

    for (const policy of applicablePolicies) {
      const escalationId = `${incident.incidentId}_${policy.id}`;

      if (this.activeEscalations.has(escalationId)) {
        continue; // Already escalating
      }

      const escalation = {
        id: escalationId,
        incidentId: incident.incidentId,
        policyId: policy.id,
        currentStep: 0,
        startedAt: new Date(),
        status: 'active',
        timeouts: [] as NodeJS.Timeout[]
      };

      this.activeEscalations.set(escalationId, escalation);
      await this.scheduleEscalationStep(escalation, policy, incident, 0);

      this.emit('escalation_started', { escalationId, incidentId: incident.incidentId, policyId: policy.id });
    }
  }

  /**
   * Stop escalation for incident
   */
  stopEscalation(incidentId: string, reason: string = 'Manual stop'): void {
    for (const [escalationId, escalation] of this.activeEscalations.entries()) {
      if (escalation.incidentId === incidentId) {
        // Clear all timeouts
        escalation.timeouts.forEach((timeout: NodeJS.Timeout) => clearTimeout(timeout));

        escalation.status = 'stopped';
        escalation.stoppedAt = new Date();
        escalation.reason = reason;

        this.activeEscalations.delete(escalationId);
        this.emit('escalation_stopped', { escalationId, incidentId, reason });
      }
    }
  }

  /**
   * Create war room for incident
   */
  async createWarRoom(incident: SecurityIncident, type: 'slack' | 'teams' | 'zoom' = 'slack'): Promise<string> {
    const warRoomId = `warroom_${incident.incidentId}`;

    // Check if war room already exists
    if (this.warRooms.has(warRoomId)) {
      const existing = this.warRooms.get(warRoomId)!;
      if (existing.active) {
        return existing.id;
      }
    }

    const warRoom: WarRoom = {
      id: warRoomId,
      incidentId: incident.incidentId,
      name: `Incident ${incident.incidentId} - ${incident.title}`,
      type,
      participants: [],
      createdAt: new Date(),
      active: true
    };

    try {
      if (type === 'slack') {
        await this.createSlackWarRoom(warRoom, incident);
      } else if (type === 'teams') {
        await this.createTeamsWarRoom(warRoom, incident);
      }

      this.warRooms.set(warRoomId, warRoom);
      this.emit('war_room_created', { warRoomId, incidentId: incident.incidentId, type });

      return warRoomId;
    } catch (error) {
      console.error(`Failed to create war room for incident ${incident.incidentId}:`, error);
      throw error;
    }
  }

  /**
   * Add participant to war room
   */
  async addWarRoomParticipant(warRoomId: string, userId: string): Promise<void> {
    const warRoom = this.warRooms.get(warRoomId);
    if (!warRoom || !warRoom.active) {
      throw new Error(`Active war room ${warRoomId} not found`);
    }

    if (!warRoom.participants.includes(userId)) {
      warRoom.participants.push(userId);

      if (warRoom.type === 'slack' && warRoom.channelId) {
        await this.inviteToSlackChannel(warRoom.channelId, userId);
      }

      this.emit('war_room_participant_added', { warRoomId, userId });
    }
  }

  /**
   * Get current on-call person for team
   */
  getCurrentOnCall(team: string): OnCallParticipant | null {
    const schedule = Array.from(this.onCallSchedules.values())
      .find(s => s.team === team && s.enabled);

    if (!schedule) {
      return null;
    }

    const now = new Date();

    for (const rotation of schedule.rotations) {
      const currentParticipant = this.calculateCurrentOnCall(rotation, now);
      if (currentParticipant) {
        return currentParticipant;
      }
    }

    return null;
  }

  /**
   * Private helper methods
   */

  private getApplicableChannels(incident: SecurityIncident, eventType: string): NotificationChannel[] {
    return Array.from(this.channels.values()).filter(channel => {
      if (!channel.enabled) return false;

      // Check severity filter
      if (channel.severityFilters.length > 0 && !channel.severityFilters.includes(incident.severity)) {
        return false;
      }

      // Check status filter
      if (channel.statusFilters.length > 0 && !channel.statusFilters.includes(incident.status)) {
        return false;
      }

      // Check team filter
      if (channel.teamFilters.length > 0 && incident.assignedTeam && !channel.teamFilters.includes(incident.assignedTeam)) {
        return false;
      }

      // Check time filter
      if (channel.timeFilters && !this.isWithinTimeFilter(channel.timeFilters)) {
        return false;
      }

      return true;
    });
  }

  private canSendNotification(channel: NotificationChannel, incident: SecurityIncident): boolean {
    if (!channel.rateLimits) return true;

    const key = `${channel.id}_${incident.incidentId}`;
    const now = new Date();
    const windowStart = new Date(now.getTime() - channel.rateLimits.windowMinutes * 60 * 1000);

    // Get recent notifications for this channel/incident
    const recentNotifications = this.rateLimitTracking.get(key) || [];
    const validNotifications = recentNotifications.filter(timestamp => timestamp > windowStart);

    // Update tracking
    this.rateLimitTracking.set(key, validNotifications);

    return validNotifications.length < channel.rateLimits.maxNotifications;
  }

  private getTemplate(channelType: string, eventType: string): NotificationTemplate | undefined {
    return Array.from(this.templates.values()).find(template =>
      template.channelType === channelType && template.eventTypes.includes(eventType)
    );
  }

  private async queueNotification(
    incident: SecurityIncident,
    channel: NotificationChannel,
    template: NotificationTemplate,
    eventType: string
  ): Promise<void> {
    const queueItem: NotificationQueue = {
      id: `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      incidentId: incident.incidentId,
      channelId: channel.id,
      templateId: template.id,
      priority: this.calculateNotificationPriority(incident),
      scheduledAt: new Date(),
      attempts: 0,
      maxAttempts: 3,
      status: 'pending',
      metadata: {
        eventType,
        incidentTitle: incident.title,
        incidentSeverity: incident.severity
      }
    };

    this.notificationQueue.push(queueItem);
    this.sortNotificationQueue();

    this.emit('notification_queued', { queueItemId: queueItem.id, incidentId: incident.incidentId });
  }

  private calculateNotificationPriority(incident: SecurityIncident): 'low' | 'medium' | 'high' | 'urgent' {
    switch (incident.severity) {
      case 'critical': return 'urgent';
      case 'high': return 'high';
      case 'medium': return 'medium';
      case 'low': return 'low';
      default: return 'medium';
    }
  }

  private sortNotificationQueue(): void {
    const priorityOrder = { urgent: 4, high: 3, medium: 2, low: 1 };

    this.notificationQueue.sort((a, b) => {
      const priorityDiff = priorityOrder[b.priority] - priorityOrder[a.priority];
      if (priorityDiff !== 0) return priorityDiff;

      return a.scheduledAt.getTime() - b.scheduledAt.getTime();
    });
  }

  private startQueueProcessor(): void {
    this.processingInterval = setInterval(async () => {
      await this.processNotificationQueue();
    }, 5000); // Process every 5 seconds
  }

  private async processNotificationQueue(): Promise<void> {
    const pendingNotifications = this.notificationQueue.filter(item =>
      item.status === 'pending' && item.scheduledAt <= new Date()
    );

    for (const notification of pendingNotifications.slice(0, 10)) { // Process max 10 at a time
      await this.processNotification(notification);
    }

    // Clean up old completed/failed notifications
    this.cleanupNotificationQueue();
  }

  private async processNotification(notification: NotificationQueue): Promise<void> {
    notification.status = 'sending';
    notification.attempts++;

    try {
      const channel = this.channels.get(notification.channelId);
      const template = this.templates.get(notification.templateId);

      if (!channel || !template) {
        throw new Error('Channel or template not found');
      }

      // Get incident data (in production, this would fetch from database)
      const incident = { incidentId: notification.incidentId } as SecurityIncident;

      await this.sendNotification(channel, template, incident, notification.metadata);

      notification.status = 'sent';
      notification.sentAt = new Date();

      // Track for rate limiting
      const key = `${channel.id}_${incident.incidentId}`;
      const tracking = this.rateLimitTracking.get(key) || [];
      tracking.push(new Date());
      this.rateLimitTracking.set(key, tracking);

      this.emit('notification_sent', {
        notificationId: notification.id,
        channelId: channel.id,
        incidentId: incident.incidentId
      });

    } catch (error) {
      notification.error = String(error);

      if (notification.attempts >= notification.maxAttempts) {
        notification.status = 'failed';
        this.emit('notification_failed', {
          notificationId: notification.id,
          error: notification.error
        });
      } else {
        notification.status = 'pending';
        notification.scheduledAt = new Date(Date.now() + 60000 * notification.attempts); // Exponential backoff
      }
    }
  }

  private async sendNotification(
    channel: NotificationChannel,
    template: NotificationTemplate,
    incident: SecurityIncident,
    metadata: Record<string, any>
  ): Promise<void> {
    const message = this.renderTemplate(template, incident, metadata);

    switch (channel.type) {
      case 'slack':
        await this.sendSlackNotification(channel, message);
        break;
      case 'email':
        await this.sendEmailNotification(channel, message);
        break;
      case 'sms':
        await this.sendSMSNotification(channel, message);
        break;
      case 'webhook':
        await this.sendWebhookNotification(channel, message, incident);
        break;
      case 'teams':
        await this.sendTeamsNotification(channel, message);
        break;
      case 'pagerduty':
        await this.sendPagerDutyNotification(channel, message, incident);
        break;
      default:
        throw new Error(`Unsupported channel type: ${channel.type}`);
    }
  }

  private renderTemplate(
    template: NotificationTemplate,
    incident: SecurityIncident,
    metadata: Record<string, any>
  ): any {
    const variables = {
      incident,
      metadata,
      timestamp: new Date().toISOString(),
      ...this.getTemplateVariables(incident)
    };

    return {
      subject: this.interpolateString(template.template.subject || '', variables),
      body: this.interpolateString(template.template.body, variables),
      attachments: template.template.attachments || []
    };
  }

  private interpolateString(template: string, variables: Record<string, any>): string {
    return template.replace(/\{\{([^}]+)\}\}/g, (match, path) => {
      const value = this.getNestedValue(variables, path.trim());
      return value !== undefined ? String(value) : match;
    });
  }

  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }

  private getTemplateVariables(incident: SecurityIncident): Record<string, any> {
    return {
      incidentId: incident.incidentId,
      title: incident.title,
      severity: incident.severity,
      status: incident.status,
      type: incident.type,
      assignedTeam: incident.assignedTeam,
      detectedAt: incident.detectedAt,
      affectedSystemsCount: incident.affectedSystems.length,
      affectedUsersCount: incident.affectedUsers.length,
      dashboardUrl: `https://security.urnlabs.ai/incidents/${incident.incidentId}`,
      severityEmoji: this.getSeverityEmoji(incident.severity),
      statusEmoji: this.getStatusEmoji(incident.status)
    };
  }

  private getSeverityEmoji(severity: IncidentSeverity): string {
    const emojiMap = {
      low: '🟢',
      medium: '🟡',
      high: '🟠',
      critical: '🔴'
    };
    return emojiMap[severity] || '⚪';
  }

  private getStatusEmoji(status: IncidentStatus): string {
    const emojiMap = {
      detected: '🔍',
      triaged: '📋',
      investigating: '🔬',
      containing: '🚧',
      eradicating: '🛠️',
      recovering: '📈',
      resolved: '✅',
      closed: '📁',
      false_positive: '❌'
    };
    return emojiMap[status] || '❓';
  }

  /**
   * Channel-specific notification implementations
   */

  private async sendSlackNotification(channel: NotificationChannel, message: any): Promise<void> {
    const { webhookUrl, username, iconEmoji } = channel.config;

    if (!webhookUrl) {
      throw new Error('Slack webhook URL not configured');
    }

    const payload = {
      username: username || 'Security Bot',
      icon_emoji: iconEmoji || ':shield:',
      text: message.subject,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: message.body
          }
        }
      ],
      attachments: message.attachments.map((att: any) => ({
        color: this.getSlackColor(att.severity || 'medium'),
        fields: att.fields || []
      }))
    };

    await axios.post(webhookUrl, payload, {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  private async sendEmailNotification(channel: NotificationChannel, message: any): Promise<void> {
    // Email implementation would use nodemailer or similar
    console.log(`Email notification: ${message.subject} - ${message.body}`);
  }

  private async sendSMSNotification(channel: NotificationChannel, message: any): Promise<void> {
    // SMS implementation would use Twilio or similar
    console.log(`SMS notification: ${message.body}`);
  }

  private async sendWebhookNotification(
    channel: NotificationChannel,
    message: any,
    incident: SecurityIncident
  ): Promise<void> {
    const { url, method = 'POST', headers = {} } = channel.config;

    if (!url) {
      throw new Error('Webhook URL not configured');
    }

    const payload = {
      message,
      incident,
      timestamp: new Date().toISOString(),
      source: 'urnlabs-security'
    };

    await axios({
      method,
      url,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      },
      data: payload
    });
  }

  private async sendTeamsNotification(channel: NotificationChannel, message: any): Promise<void> {
    const { connectorUrl } = channel.config;

    if (!connectorUrl) {
      throw new Error('Teams connector URL not configured');
    }

    const payload = {
      '@type': 'MessageCard',
      '@context': 'http://schema.org/extensions',
      themeColor: this.getTeamsColor(message.severity || 'medium'),
      summary: message.subject,
      sections: [{
        activityTitle: message.subject,
        activitySubtitle: new Date().toLocaleString(),
        text: message.body,
        markdown: true
      }]
    };

    await axios.post(connectorUrl, payload, {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  private async sendPagerDutyNotification(
    channel: NotificationChannel,
    message: any,
    incident: SecurityIncident
  ): Promise<void> {
    const { integrationKey } = channel.config;

    if (!integrationKey) {
      throw new Error('PagerDuty integration key not configured');
    }

    const payload = {
      routing_key: integrationKey,
      event_action: 'trigger',
      dedup_key: incident.incidentId,
      payload: {
        summary: message.subject,
        severity: incident.severity,
        source: 'urnlabs-security',
        custom_details: {
          incident_id: incident.incidentId,
          incident_type: incident.type,
          affected_systems: incident.affectedSystems.length,
          description: message.body
        }
      }
    };

    await axios.post('https://events.pagerduty.com/v2/enqueue', payload);
  }

  private getSlackColor(severity: string): string {
    const colorMap = {
      low: 'good',
      medium: 'warning',
      high: 'danger',
      critical: 'danger'
    };
    return colorMap[severity as keyof typeof colorMap] || 'warning';
  }

  private getTeamsColor(severity: string): string {
    const colorMap = {
      low: '00FF00',
      medium: 'FFA500',
      high: 'FF4500',
      critical: 'DC143C'
    };
    return colorMap[severity as keyof typeof colorMap] || 'FFA500';
  }

  /**
   * Escalation methods
   */

  private getApplicableEscalationPolicies(incident: SecurityIncident): EscalationPolicy[] {
    return Array.from(this.escalationPolicies.values())
      .filter(policy => policy.enabled)
      .sort((a, b) => b.priority - a.priority);
  }

  private async scheduleEscalationStep(
    escalation: any,
    policy: EscalationPolicy,
    incident: SecurityIncident,
    stepIndex: number
  ): Promise<void> {
    if (stepIndex >= policy.steps.length) {
      escalation.status = 'completed';
      this.activeEscalations.delete(escalation.id);
      return;
    }

    const step = policy.steps[stepIndex];

    const timeout = setTimeout(async () => {
      try {
        await this.executeEscalationStep(escalation, step, incident);
        escalation.currentStep = stepIndex + 1;

        // Schedule next step
        await this.scheduleEscalationStep(escalation, policy, incident, stepIndex + 1);
      } catch (error) {
        console.error(`Escalation step failed:`, error);
      }
    }, step.delayMinutes * 60 * 1000);

    escalation.timeouts.push(timeout);
  }

  private async executeEscalationStep(escalation: any, step: EscalationStep, incident: SecurityIncident): Promise<void> {
    // Send notifications to escalation channels
    for (const channelId of step.channels) {
      const channel = this.channels.get(channelId);
      if (channel) {
        await this.sendIncidentNotification(incident, 'escalation', [channelId]);
      }
    }

    // Execute escalation actions
    for (const action of step.actions) {
      await this.executeEscalationAction(action, incident, escalation);
    }

    this.emit('escalation_step_executed', {
      escalationId: escalation.id,
      stepNumber: step.stepNumber,
      incidentId: incident.incidentId
    });
  }

  private async executeEscalationAction(
    action: EscalationAction,
    incident: SecurityIncident,
    escalation: any
  ): Promise<void> {
    switch (action.type) {
      case 'call_oncall':
        await this.callOnCall(action.target, incident);
        break;
      case 'page':
        await this.sendPage(action.target, incident);
        break;
      case 'create_ticket':
        await this.createTicket(incident, action.parameters);
        break;
      case 'assign':
        await this.assignIncident(incident, action.target);
        break;
      default:
        console.warn(`Unknown escalation action type: ${action.type}`);
    }
  }

  /**
   * War room methods
   */

  private async createSlackWarRoom(warRoom: WarRoom, incident: SecurityIncident): Promise<void> {
    // This would integrate with Slack API to create a channel
    const channelName = `incident-${incident.incidentId}-warroom`;

    // Simulated Slack channel creation
    warRoom.channelId = `C${Date.now()}`;
    warRoom.url = `https://urnlabs.slack.com/channels/${channelName}`;

    console.log(`Created Slack war room: ${channelName}`);
  }

  private async createTeamsWarRoom(warRoom: WarRoom, incident: SecurityIncident): Promise<void> {
    // This would integrate with Teams API to create a team/channel
    warRoom.url = `https://teams.microsoft.com/l/team/incident-${incident.incidentId}`;

    console.log(`Created Teams war room for incident: ${incident.incidentId}`);
  }

  private async inviteToSlackChannel(channelId: string, userId: string): Promise<void> {
    // This would use Slack API to invite user to channel
    console.log(`Invited user ${userId} to Slack channel ${channelId}`);
  }

  /**
   * Setup methods
   */

  private setupDefaultChannels(): void {
    const defaultChannels: NotificationChannel[] = [
      {
        id: 'security_team_slack',
        name: 'Security Team Slack',
        type: 'slack',
        config: {
          webhookUrl: process.env.SECURITY_SLACK_WEBHOOK,
          channel: '#security-incidents',
          username: 'Security Bot',
          iconEmoji: ':shield:'
        },
        enabled: true,
        severityFilters: ['medium', 'high', 'critical'],
        statusFilters: [],
        teamFilters: ['security-team', 'privacy-team']
      },
      {
        id: 'critical_pagerduty',
        name: 'Critical Incidents PagerDuty',
        type: 'pagerduty',
        config: {
          integrationKey: process.env.PAGERDUTY_INTEGRATION_KEY
        },
        enabled: true,
        severityFilters: ['critical'],
        statusFilters: ['detected', 'triaged'],
        teamFilters: []
      },
      {
        id: 'executive_email',
        name: 'Executive Team Email',
        type: 'email',
        config: {
          smtpHost: 'smtp.urnlabs.ai',
          smtpPort: 587,
          fromEmail: 'security@urnlabs.ai',
          toEmails: ['ciso@urnlabs.ai', 'cto@urnlabs.ai']
        },
        enabled: true,
        severityFilters: ['critical'],
        statusFilters: ['detected'],
        teamFilters: [],
        timeFilters: [{
          days: [1, 2, 3, 4, 5], // Monday-Friday
          startHour: 9,
          endHour: 17,
          timezone: 'UTC'
        }]
      }
    ];

    defaultChannels.forEach(channel => this.channels.set(channel.id, channel));
  }

  private setupDefaultEscalationPolicies(): void {
    const defaultPolicies: EscalationPolicy[] = [
      {
        id: 'critical_incident_escalation',
        name: 'Critical Incident Escalation',
        description: 'Escalation policy for critical security incidents',
        triggers: [
          { type: 'time_based', delayMinutes: 15, maxEscalations: 3 },
          { type: 'status_unchanged', delayMinutes: 30 }
        ],
        steps: [
          {
            stepNumber: 1,
            name: 'Security Team',
            delayMinutes: 0,
            channels: ['security_team_slack'],
            assignees: ['security-team'],
            actions: [
              { type: 'notify', target: 'security_team_slack' }
            ]
          },
          {
            stepNumber: 2,
            name: 'Security Manager',
            delayMinutes: 15,
            channels: ['critical_pagerduty'],
            assignees: ['security-manager'],
            actions: [
              { type: 'page', target: 'security-manager' },
              { type: 'call_oncall', target: 'security-team' }
            ]
          },
          {
            stepNumber: 3,
            name: 'Executive Team',
            delayMinutes: 30,
            channels: ['executive_email'],
            assignees: ['ciso'],
            actions: [
              { type: 'notify', target: 'executive_email' },
              { type: 'create_ticket', target: 'executive-dashboard' }
            ]
          }
        ],
        enabled: true,
        priority: 10
      }
    ];

    defaultPolicies.forEach(policy => this.escalationPolicies.set(policy.id, policy));
  }

  private setupDefaultTemplates(): void {
    const defaultTemplates: NotificationTemplate[] = [
      {
        id: 'slack_incident_created',
        name: 'Slack Incident Created',
        description: 'Template for new security incidents in Slack',
        channelType: 'slack',
        eventTypes: ['incident_created', 'incident_updated'],
        template: {
          subject: '{{severityEmoji}} Security Incident: {{incident.title}}',
          body: `*Incident Details:*
• *ID:* {{incident.incidentId}}
• *Type:* {{incident.type}}
• *Severity:* {{severityEmoji}} {{incident.severity}}
• *Status:* {{statusEmoji}} {{incident.status}}
• *Affected Systems:* {{affectedSystemsCount}}
• *Affected Users:* {{affectedUsersCount}}
• *Detected:* {{incident.detectedAt}}

*Description:*
{{incident.description}}

*Dashboard:* <{{dashboardUrl}}|View Details>`
        },
        variables: ['incident', 'severityEmoji', 'statusEmoji', 'affectedSystemsCount', 'affectedUsersCount', 'dashboardUrl']
      },
      {
        id: 'email_critical_incident',
        name: 'Email Critical Incident',
        description: 'Email template for critical security incidents',
        channelType: 'email',
        eventTypes: ['incident_created', 'escalation'],
        template: {
          subject: 'CRITICAL SECURITY INCIDENT: {{incident.title}}',
          body: `A critical security incident has been detected and requires immediate attention.

Incident ID: {{incident.incidentId}}
Title: {{incident.title}}
Type: {{incident.type}}
Severity: {{incident.severity}}
Status: {{incident.status}}

Detection Time: {{incident.detectedAt}}
Affected Systems: {{affectedSystemsCount}}
Affected Users: {{affectedUsersCount}}

Description:
{{incident.description}}

Please access the security dashboard for more details: {{dashboardUrl}}

This is an automated notification from the Urnlabs Security Incident Response System.`
        },
        variables: ['incident', 'affectedSystemsCount', 'affectedUsersCount', 'dashboardUrl']
      }
    ];

    defaultTemplates.forEach(template => this.templates.set(template.id, template));
  }

  private setupDefaultOnCallSchedules(): void {
    const defaultSchedules: OnCallSchedule[] = [
      {
        id: 'security_team_oncall',
        name: 'Security Team On-Call',
        team: 'security-team',
        rotations: [
          {
            id: 'weekly_rotation',
            name: 'Weekly Security Rotation',
            type: 'weekly',
            participants: [
              {
                userId: 'security_analyst_1',
                name: 'Security Analyst 1',
                email: 'analyst1@urnlabs.ai',
                phone: '+1234567890',
                slackUserId: 'U123456',
                order: 1,
                backup: false
              },
              {
                userId: 'security_analyst_2',
                name: 'Security Analyst 2',
                email: 'analyst2@urnlabs.ai',
                phone: '+1234567891',
                slackUserId: 'U123457',
                order: 2,
                backup: false
              }
            ],
            startDate: new Date(),
            timezone: 'UTC',
            handoffTime: '09:00'
          }
        ],
        enabled: true
      }
    ];

    defaultSchedules.forEach(schedule => this.onCallSchedules.set(schedule.id, schedule));
  }

  /**
   * Helper methods
   */

  private isWithinTimeFilter(timeFilters: TimeFilter[]): boolean {
    const now = new Date();
    const currentDay = now.getDay();
    const currentHour = now.getHours();

    return timeFilters.some(filter => {
      const inDayRange = filter.days.includes(currentDay);
      const inTimeRange = currentHour >= filter.startHour && currentHour <= filter.endHour;
      return inDayRange && inTimeRange;
    });
  }

  private calculateCurrentOnCall(rotation: OnCallRotation, now: Date): OnCallParticipant | null {
    // Simplified on-call calculation
    const daysSinceStart = Math.floor((now.getTime() - rotation.startDate.getTime()) / (24 * 60 * 60 * 1000));

    let rotationIndex = 0;
    if (rotation.type === 'weekly') {
      rotationIndex = Math.floor(daysSinceStart / 7) % rotation.participants.length;
    } else if (rotation.type === 'daily') {
      rotationIndex = daysSinceStart % rotation.participants.length;
    }

    const sortedParticipants = rotation.participants.sort((a, b) => a.order - b.order);
    return sortedParticipants[rotationIndex] || null;
  }

  private cleanupNotificationQueue(): void {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours ago

    this.notificationQueue = this.notificationQueue.filter(item => {
      const isRecent = item.scheduledAt > cutoff;
      const isActive = ['pending', 'sending'].includes(item.status);
      return isRecent || isActive;
    });
  }

  private async callOnCall(team: string, incident: SecurityIncident): Promise<void> {
    const onCallPerson = this.getCurrentOnCall(team);
    if (onCallPerson && onCallPerson.phone) {
      // This would integrate with a phone service
      console.log(`Calling on-call person ${onCallPerson.name} at ${onCallPerson.phone} for incident ${incident.incidentId}`);
    }
  }

  private async sendPage(target: string, incident: SecurityIncident): Promise<void> {
    // This would send a page notification
    console.log(`Sending page to ${target} for incident ${incident.incidentId}`);
  }

  private async createTicket(incident: SecurityIncident, parameters?: Record<string, any>): Promise<void> {
    // This would create a ticket in ticketing system
    console.log(`Creating ticket for incident ${incident.incidentId}`);
  }

  private async assignIncident(incident: SecurityIncident, assignee: string): Promise<void> {
    // This would assign the incident to the specified person/team
    console.log(`Assigning incident ${incident.incidentId} to ${assignee}`);
  }

  /**
   * Public API methods
   */

  public addNotificationChannel(channel: NotificationChannel): void {
    this.channels.set(channel.id, channel);
    this.emit('channel_added', channel);
  }

  public addEscalationPolicy(policy: EscalationPolicy): void {
    this.escalationPolicies.set(policy.id, policy);
    this.emit('escalation_policy_added', policy);
  }

  public addNotificationTemplate(template: NotificationTemplate): void {
    this.templates.set(template.id, template);
    this.emit('template_added', template);
  }

  public getNotificationChannels(): NotificationChannel[] {
    return Array.from(this.channels.values());
  }

  public getEscalationPolicies(): EscalationPolicy[] {
    return Array.from(this.escalationPolicies.values());
  }

  public getActiveEscalations(): any[] {
    return Array.from(this.activeEscalations.values());
  }

  public getWarRooms(): WarRoom[] {
    return Array.from(this.warRooms.values());
  }

  public async testNotificationChannel(channelId: string): Promise<boolean> {
    const channel = this.channels.get(channelId);
    if (!channel) {
      throw new Error(`Channel ${channelId} not found`);
    }

    const testIncident = {
      incidentId: 'test_incident',
      title: 'Test Notification',
      severity: 'medium' as IncidentSeverity,
      status: 'detected' as IncidentStatus,
      description: 'This is a test notification to verify channel configuration.'
    } as SecurityIncident;

    try {
      await this.sendIncidentNotification(testIncident, 'test', [channelId]);
      return true;
    } catch (error) {
      console.error(`Test notification failed for channel ${channelId}:`, error);
      return false;
    }
  }

  public destroy(): void {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
    }

    // Clear all escalation timeouts
    for (const escalation of this.activeEscalations.values()) {
      escalation.timeouts.forEach((timeout: NodeJS.Timeout) => clearTimeout(timeout));
    }

    this.removeAllListeners();
  }
}

export const notificationEscalationService = new NotificationEscalationService();