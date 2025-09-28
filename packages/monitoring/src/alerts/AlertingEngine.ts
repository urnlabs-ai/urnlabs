import { EventEmitter } from 'events';
import axios from 'axios';
import Redis from 'ioredis';

export interface AlertRule {
  id: string;
  name: string;
  description: string;
  metric: string;
  operator: 'gt' | 'lt' | 'eq' | 'ne' | 'gte' | 'lte';
  threshold: number;
  duration: number; // milliseconds
  severity: 'low' | 'medium' | 'high' | 'critical';
  enabled: boolean;
  tags?: Record<string, string>;
  suppressionRules?: {
    duration: number; // minutes
    conditions?: Record<string, any>;
  };
}

export interface Alert {
  id: string;
  ruleId: string;
  metric: string;
  value: number;
  threshold: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  timestamp: number;
  status: 'firing' | 'resolved' | 'suppressed' | 'acknowledged';
  tags?: Record<string, string>;
  acknowledgedBy?: string;
  acknowledgedAt?: number;
  resolvedAt?: number;
}

export interface NotificationChannel {
  id: string;
  type: 'slack' | 'email' | 'webhook' | 'pagerduty' | 'sms';
  name: string;
  config: Record<string, any>;
  enabled: boolean;
  severityFilters?: string[];
  tagFilters?: Record<string, string>;
}

export interface EscalationPolicy {
  id: string;
  name: string;
  description: string;
  steps: Array<{
    delay: number; // minutes
    channels: string[];
    condition?: string; // if alert is still unacknowledged
  }>;
  enabled: boolean;
}

export class AlertingEngine extends EventEmitter {
  private redis: Redis;
  private alertRules = new Map<string, AlertRule>();
  private activeAlerts = new Map<string, Alert>();
  private notificationChannels = new Map<string, NotificationChannel>();
  private escalationPolicies = new Map<string, EscalationPolicy>();
  private suppressedAlerts = new Set<string>();
  private evaluationInterval: NodeJS.Timeout | null = null;
  private escalationTimeouts = new Map<string, NodeJS.Timeout>();

  constructor(private redisUrl: string) {
    super();
    this.redis = new Redis(redisUrl);
    this.initializeAlerting();
  }

  private initializeAlerting(): void {
    // Load persisted rules and channels from Redis
    this.loadPersistedData();

    // Start alert evaluation every 30 seconds
    this.evaluationInterval = setInterval(() => {
      this.evaluateRules();
    }, 30000);

    // Setup default rules
    this.setupDefaultRules();
  }

  private async loadPersistedData(): Promise<void> {
    try {
      // Load alert rules
      const rulesData = await this.redis.get('alert:rules');
      if (rulesData) {
        const rules = JSON.parse(rulesData) as AlertRule[];
        rules.forEach(rule => this.alertRules.set(rule.id, rule));
      }

      // Load notification channels
      const channelsData = await this.redis.get('alert:channels');
      if (channelsData) {
        const channels = JSON.parse(channelsData) as NotificationChannel[];
        channels.forEach(channel => this.notificationChannels.set(channel.id, channel));
      }

      // Load escalation policies
      const policiesData = await this.redis.get('alert:policies');
      if (policiesData) {
        const policies = JSON.parse(policiesData) as EscalationPolicy[];
        policies.forEach(policy => this.escalationPolicies.set(policy.id, policy));
      }

      // Load active alerts
      const alertsData = await this.redis.get('alert:active');
      if (alertsData) {
        const alerts = JSON.parse(alertsData) as Alert[];
        alerts.forEach(alert => this.activeAlerts.set(alert.id, alert));
      }
    } catch (error) {
      console.error('Failed to load persisted alerting data:', error);
    }
  }

  private setupDefaultRules(): void {
    const defaultRules: AlertRule[] = [
      {
        id: 'high_response_time',
        name: 'High API Response Time',
        description: 'API response time exceeds 2 seconds',
        metric: 'api.response_time',
        operator: 'gt',
        threshold: 2000,
        duration: 60000, // 1 minute
        severity: 'high',
        enabled: true,
        tags: { service: 'api' }
      },
      {
        id: 'high_error_rate',
        name: 'High Error Rate',
        description: 'API error rate exceeds 5%',
        metric: 'api.error_rate',
        operator: 'gt',
        threshold: 5,
        duration: 120000, // 2 minutes
        severity: 'critical',
        enabled: true,
        tags: { service: 'api' }
      },
      {
        id: 'low_agent_success_rate',
        name: 'Low Agent Success Rate',
        description: 'Agent success rate below 90%',
        metric: 'agents.success_rate',
        operator: 'lt',
        threshold: 90,
        duration: 300000, // 5 minutes
        severity: 'medium',
        enabled: true,
        tags: { service: 'agents' }
      },
      {
        id: 'high_memory_usage',
        name: 'High Memory Usage',
        description: 'System memory usage exceeds 80%',
        metric: 'system.memory_usage_percent',
        operator: 'gt',
        threshold: 80,
        duration: 180000, // 3 minutes
        severity: 'high',
        enabled: true,
        tags: { service: 'system' }
      },
      {
        id: 'workflow_failure_spike',
        name: 'Workflow Failure Spike',
        description: 'Workflow failure rate exceeds 15%',
        metric: 'workflows.failure_rate',
        operator: 'gt',
        threshold: 15,
        duration: 240000, // 4 minutes
        severity: 'high',
        enabled: true,
        tags: { service: 'workflows' }
      }
    ];

    defaultRules.forEach(rule => {
      if (!this.alertRules.has(rule.id)) {
        this.alertRules.set(rule.id, rule);
      }
    });

    this.persistRules();
  }

  public addAlertRule(rule: AlertRule): void {
    this.alertRules.set(rule.id, rule);
    this.persistRules();
    this.emit('rule_added', rule);
  }

  public removeAlertRule(ruleId: string): boolean {
    const removed = this.alertRules.delete(ruleId);
    if (removed) {
      this.persistRules();
      this.emit('rule_removed', ruleId);
    }
    return removed;
  }

  public updateAlertRule(ruleId: string, updates: Partial<AlertRule>): boolean {
    const rule = this.alertRules.get(ruleId);
    if (!rule) return false;

    const updatedRule = { ...rule, ...updates };
    this.alertRules.set(ruleId, updatedRule);
    this.persistRules();
    this.emit('rule_updated', updatedRule);
    return true;
  }

  public addNotificationChannel(channel: NotificationChannel): void {
    this.notificationChannels.set(channel.id, channel);
    this.persistChannels();
    this.emit('channel_added', channel);
  }

  public addEscalationPolicy(policy: EscalationPolicy): void {
    this.escalationPolicies.set(policy.id, policy);
    this.persistPolicies();
    this.emit('policy_added', policy);
  }

  private async evaluateRules(): Promise<void> {
    try {
      // Get current metrics from Redis
      const metricsKeys = await this.redis.keys('metrics:*');
      if (metricsKeys.length === 0) return;

      // Get the latest metrics
      const latestKey = metricsKeys.sort().pop();
      if (!latestKey) return;

      const metricsData = await this.redis.get(latestKey);
      if (!metricsData) return;

      const metrics = JSON.parse(metricsData);
      const timestamp = Date.now();

      // Evaluate each rule
      for (const rule of this.alertRules.values()) {
        if (!rule.enabled) continue;

        const metricValue = this.extractMetricValue(metrics, rule.metric);
        if (metricValue === null) continue;

        const shouldAlert = this.evaluateCondition(metricValue, rule.operator, rule.threshold);
        const alertId = `${rule.id}_${Math.floor(timestamp / rule.duration)}`;

        if (shouldAlert) {
          await this.handleAlert(rule, metricValue, alertId, timestamp);
        } else {
          await this.resolveAlert(alertId, timestamp);
        }
      }
    } catch (error) {
      console.error('Error evaluating alert rules:', error);
    }
  }

  private extractMetricValue(metrics: any, metricPath: string): number | null {
    const parts = metricPath.split('.');
    let current = metrics;

    for (const part of parts) {
      if (current && typeof current === 'object' && part in current) {
        current = current[part];
      } else {
        return null;
      }
    }

    // Handle array of metric points
    if (Array.isArray(current) && current.length > 0) {
      const latest = current[current.length - 1];
      return typeof latest === 'object' && 'value' in latest ? latest.value : latest;
    }

    return typeof current === 'number' ? current : null;
  }

  private evaluateCondition(value: number, operator: string, threshold: number): boolean {
    switch (operator) {
      case 'gt': return value > threshold;
      case 'gte': return value >= threshold;
      case 'lt': return value < threshold;
      case 'lte': return value <= threshold;
      case 'eq': return value === threshold;
      case 'ne': return value !== threshold;
      default: return false;
    }
  }

  private async handleAlert(rule: AlertRule, value: number, alertId: string, timestamp: number): Promise<void> {
    const existingAlert = this.activeAlerts.get(alertId);

    if (!existingAlert) {
      // Create new alert
      const alert: Alert = {
        id: alertId,
        ruleId: rule.id,
        metric: rule.metric,
        value,
        threshold: rule.threshold,
        severity: rule.severity,
        message: `${rule.name}: ${rule.metric} is ${value} (threshold: ${rule.threshold})`,
        timestamp,
        status: 'firing',
        tags: rule.tags
      };

      this.activeAlerts.set(alertId, alert);
      await this.sendNotification(alert);
      await this.startEscalation(alert);

      this.emit('alert_fired', alert);
    } else if (existingAlert.status === 'resolved') {
      // Re-fire resolved alert
      existingAlert.status = 'firing';
      existingAlert.timestamp = timestamp;
      existingAlert.value = value;
      existingAlert.resolvedAt = undefined;

      await this.sendNotification(existingAlert);
      await this.startEscalation(existingAlert);

      this.emit('alert_fired', existingAlert);
    }

    await this.persistAlerts();
  }

  private async resolveAlert(alertId: string, timestamp: number): Promise<void> {
    const alert = this.activeAlerts.get(alertId);
    if (alert && alert.status === 'firing') {
      alert.status = 'resolved';
      alert.resolvedAt = timestamp;

      // Cancel escalation
      const escalationTimeout = this.escalationTimeouts.get(alertId);
      if (escalationTimeout) {
        clearTimeout(escalationTimeout);
        this.escalationTimeouts.delete(alertId);
      }

      await this.sendNotification(alert);
      this.emit('alert_resolved', alert);
      await this.persistAlerts();
    }
  }

  private async sendNotification(alert: Alert): Promise<void> {
    const promises: Promise<void>[] = [];

    for (const channel of this.notificationChannels.values()) {
      if (!channel.enabled) continue;

      // Check severity filters
      if (channel.severityFilters && !channel.severityFilters.includes(alert.severity)) {
        continue;
      }

      // Check tag filters
      if (channel.tagFilters && alert.tags) {
        const matchesTags = Object.entries(channel.tagFilters).every(
          ([key, value]) => alert.tags?.[key] === value
        );
        if (!matchesTags) continue;
      }

      promises.push(this.sendToChannel(channel, alert));
    }

    await Promise.allSettled(promises);
  }

  private async sendToChannel(channel: NotificationChannel, alert: Alert): Promise<void> {
    try {
      switch (channel.type) {
        case 'slack':
          await this.sendSlackNotification(channel, alert);
          break;
        case 'email':
          await this.sendEmailNotification(channel, alert);
          break;
        case 'webhook':
          await this.sendWebhookNotification(channel, alert);
          break;
        case 'pagerduty':
          await this.sendPagerDutyNotification(channel, alert);
          break;
        default:
          console.warn(`Unsupported notification channel type: ${channel.type}`);
      }
    } catch (error) {
      console.error(`Failed to send notification to ${channel.name}:`, error);
    }
  }

  private async sendSlackNotification(channel: NotificationChannel, alert: Alert): Promise<void> {
    const { webhookUrl } = channel.config;
    if (!webhookUrl) throw new Error('Slack webhook URL not configured');

    const color = this.getSeverityColor(alert.severity);
    const status = alert.status === 'firing' ? '🚨 FIRING' : '✅ RESOLVED';

    const payload = {
      attachments: [{
        color,
        title: `${status} ${alert.message}`,
        fields: [
          { title: 'Severity', value: alert.severity.toUpperCase(), short: true },
          { title: 'Metric', value: alert.metric, short: true },
          { title: 'Value', value: alert.value.toString(), short: true },
          { title: 'Threshold', value: alert.threshold.toString(), short: true },
          { title: 'Time', value: new Date(alert.timestamp).toISOString(), short: false }
        ],
        footer: 'Urnlabs Monitoring',
        ts: Math.floor(alert.timestamp / 1000)
      }]
    };

    await axios.post(webhookUrl, payload);
  }

  private async sendEmailNotification(channel: NotificationChannel, alert: Alert): Promise<void> {
    // Email implementation would require SMTP configuration
    console.log(`Email notification: ${alert.message}`);
  }

  private async sendWebhookNotification(channel: NotificationChannel, alert: Alert): Promise<void> {
    const { url, method = 'POST', headers = {} } = channel.config;
    if (!url) throw new Error('Webhook URL not configured');

    await axios({
      method,
      url,
      headers,
      data: {
        alert,
        timestamp: Date.now(),
        source: 'urnlabs-monitoring'
      }
    });
  }

  private async sendPagerDutyNotification(channel: NotificationChannel, alert: Alert): Promise<void> {
    const { integrationKey } = channel.config;
    if (!integrationKey) throw new Error('PagerDuty integration key not configured');

    const eventAction = alert.status === 'firing' ? 'trigger' : 'resolve';

    const payload = {
      routing_key: integrationKey,
      event_action: eventAction,
      dedup_key: alert.id,
      payload: {
        summary: alert.message,
        severity: alert.severity,
        source: 'urnlabs-monitoring',
        custom_details: {
          metric: alert.metric,
          value: alert.value,
          threshold: alert.threshold,
          tags: alert.tags
        }
      }
    };

    await axios.post('https://events.pagerduty.com/v2/enqueue', payload);
  }

  private async startEscalation(alert: Alert): Promise<void> {
    // Find applicable escalation policies
    for (const policy of this.escalationPolicies.values()) {
      if (!policy.enabled) continue;

      // Simple escalation - start first step after delay
      if (policy.steps.length > 0) {
        const firstStep = policy.steps[0];
        const timeout = setTimeout(async () => {
          await this.executeEscalationStep(alert, firstStep, policy, 0);
        }, firstStep.delay * 60 * 1000);

        this.escalationTimeouts.set(`${alert.id}_${policy.id}`, timeout);
      }
    }
  }

  private async executeEscalationStep(
    alert: Alert,
    step: any,
    policy: EscalationPolicy,
    stepIndex: number
  ): Promise<void> {
    // Check if alert is still firing and unacknowledged
    const currentAlert = this.activeAlerts.get(alert.id);
    if (!currentAlert || currentAlert.status !== 'firing' || currentAlert.acknowledgedBy) {
      return;
    }

    // Send notifications to escalation channels
    for (const channelId of step.channels) {
      const channel = this.notificationChannels.get(channelId);
      if (channel) {
        await this.sendToChannel(channel, alert);
      }
    }

    // Schedule next escalation step
    const nextStepIndex = stepIndex + 1;
    if (nextStepIndex < policy.steps.length) {
      const nextStep = policy.steps[nextStepIndex];
      const timeout = setTimeout(async () => {
        await this.executeEscalationStep(alert, nextStep, policy, nextStepIndex);
      }, nextStep.delay * 60 * 1000);

      this.escalationTimeouts.set(`${alert.id}_${policy.id}_${nextStepIndex}`, timeout);
    }
  }

  public acknowledgeAlert(alertId: string, acknowledgedBy: string): boolean {
    const alert = this.activeAlerts.get(alertId);
    if (!alert) return false;

    alert.status = 'acknowledged';
    alert.acknowledgedBy = acknowledgedBy;
    alert.acknowledgedAt = Date.now();

    // Cancel escalations
    for (const [key, timeout] of this.escalationTimeouts.entries()) {
      if (key.startsWith(alertId)) {
        clearTimeout(timeout);
        this.escalationTimeouts.delete(key);
      }
    }

    this.persistAlerts();
    this.emit('alert_acknowledged', alert);
    return true;
  }

  private getSeverityColor(severity: string): string {
    switch (severity) {
      case 'critical': return '#DC2626'; // red-600
      case 'high': return '#EA580C'; // orange-600
      case 'medium': return '#CA8A04'; // yellow-600
      case 'low': return '#16A34A'; // green-600
      default: return '#6B7280'; // gray-500
    }
  }

  public getActiveAlerts(): Alert[] {
    return Array.from(this.activeAlerts.values());
  }

  public getAlertRules(): AlertRule[] {
    return Array.from(this.alertRules.values());
  }

  public getNotificationChannels(): NotificationChannel[] {
    return Array.from(this.notificationChannels.values());
  }

  public getEscalationPolicies(): EscalationPolicy[] {
    return Array.from(this.escalationPolicies.values());
  }

  private async persistRules(): Promise<void> {
    try {
      const rules = Array.from(this.alertRules.values());
      await this.redis.set('alert:rules', JSON.stringify(rules));
    } catch (error) {
      console.error('Failed to persist alert rules:', error);
    }
  }

  private async persistChannels(): Promise<void> {
    try {
      const channels = Array.from(this.notificationChannels.values());
      await this.redis.set('alert:channels', JSON.stringify(channels));
    } catch (error) {
      console.error('Failed to persist notification channels:', error);
    }
  }

  private async persistPolicies(): Promise<void> {
    try {
      const policies = Array.from(this.escalationPolicies.values());
      await this.redis.set('alert:policies', JSON.stringify(policies));
    } catch (error) {
      console.error('Failed to persist escalation policies:', error);
    }
  }

  private async persistAlerts(): Promise<void> {
    try {
      const alerts = Array.from(this.activeAlerts.values());
      await this.redis.set('alert:active', JSON.stringify(alerts));
    } catch (error) {
      console.error('Failed to persist active alerts:', error);
    }
  }

  public destroy(): void {
    if (this.evaluationInterval) {
      clearInterval(this.evaluationInterval);
    }

    // Clear all escalation timeouts
    for (const timeout of this.escalationTimeouts.values()) {
      clearTimeout(timeout);
    }

    this.redis.disconnect();
    this.removeAllListeners();
  }
}