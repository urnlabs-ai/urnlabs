/**
 * Report Distribution
 *
 * Comprehensive distribution system for delivering reports through multiple channels
 * including email, Slack, Teams, webhooks, and cloud storage with tracking,
 * retry logic, and delivery confirmation.
 */

import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import { EventEmitter } from 'events';
import nodemailer from 'nodemailer';
import { WebClient as SlackWebClient } from '@slack/web-api';
import axios from 'axios';
import AWS from 'aws-sdk';
import { promises as fs } from 'fs';
import path from 'path';
import {
  ExecutiveReport,
  ExportFormat
} from './ReportGenerator';
import {
  DistributionConfig,
  ReportRecipient,
  DistributionChannel,
  DeliveryOptions,
  NotificationSettings,
  DistributionResult,
  DeliveryStatus,
  RecipientRole
} from './ReportScheduler';

export interface DeliveryRequest {
  id: string;
  reportId: string;
  report: ExecutiveReport;
  exports: { [key in ExportFormat]?: string };
  distribution: DistributionConfig;
  createdAt: Date;
  priority: DeliveryPriority;
  metadata: DeliveryMetadata;
}

export interface DeliveryMetadata {
  organizationId: string;
  scheduleId?: string;
  executionId?: string;
  requestedBy: string;
  tags: string[];
  trackingEnabled: boolean;
}

export interface ChannelConfig {
  type: DistributionChannel;
  config: ChannelConfiguration;
  isActive: boolean;
  priority: number;
  fallbackChannel?: DistributionChannel;
}

export interface ChannelConfiguration {
  // Email configuration
  smtp?: SMTPConfig;

  // Slack configuration
  slack?: SlackConfig;

  // Teams configuration
  teams?: TeamsConfig;

  // Webhook configuration
  webhook?: WebhookConfig;

  // Cloud storage configuration
  cloudStorage?: CloudStorageConfig;

  // API configuration
  api?: APIConfig;
}

export interface SMTPConfig {
  host: string;
  port: number;
  secure: boolean;
  auth: {
    user: string;
    pass: string;
  };
  from: string;
  replyTo?: string;
  templates: EmailTemplateConfig;
}

export interface EmailTemplateConfig {
  executiveSummary: string;
  fullReport: string;
  failureNotification: string;
  deliveryConfirmation: string;
}

export interface SlackConfig {
  token: string;
  channels: SlackChannelConfig[];
  botName: string;
  iconEmoji?: string;
  templates: SlackTemplateConfig;
}

export interface SlackChannelConfig {
  id: string;
  name: string;
  recipientRoles: RecipientRole[];
  format: SlackMessageFormat;
}

export interface SlackTemplateConfig {
  executiveSummary: string;
  reportNotification: string;
  errorAlert: string;
}

export interface TeamsConfig {
  webhookUrl: string;
  channels: TeamsChannelConfig[];
  templates: TeamsTemplateConfig;
}

export interface TeamsChannelConfig {
  id: string;
  name: string;
  webhookUrl: string;
  recipientRoles: RecipientRole[];
}

export interface TeamsTemplateConfig {
  reportCard: string;
  summaryMessage: string;
  errorAlert: string;
}

export interface WebhookConfig {
  url: string;
  method: 'POST' | 'PUT' | 'PATCH';
  headers: Record<string, string>;
  authentication: WebhookAuth;
  retryConfig: RetryConfig;
  timeoutMs: number;
}

export interface WebhookAuth {
  type: 'none' | 'bearer' | 'basic' | 'apikey';
  token?: string;
  username?: string;
  password?: string;
  apiKey?: string;
  apiKeyHeader?: string;
}

export interface CloudStorageConfig {
  provider: CloudProvider;
  bucket: string;
  region?: string;
  credentials: CloudCredentials;
  path: string;
  publicAccess: boolean;
  encryption: boolean;
}

export interface CloudCredentials {
  accessKeyId?: string;
  secretAccessKey?: string;
  sessionToken?: string;
  connectionString?: string;
}

export interface APIConfig {
  baseUrl: string;
  endpoints: APIEndpointConfig[];
  authentication: APIAuth;
  rateLimit: RateLimitConfig;
}

export interface APIEndpointConfig {
  path: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  recipientTypes: RecipientRole[];
  format: ExportFormat;
}

export interface APIAuth {
  type: 'bearer' | 'oauth2' | 'apikey';
  token?: string;
  clientId?: string;
  clientSecret?: string;
  scope?: string;
  apiKey?: string;
}

export interface RateLimitConfig {
  requestsPerSecond: number;
  burstLimit: number;
  retryAfterMs: number;
}

export interface RetryConfig {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  retryableStatusCodes: number[];
}

export interface DeliveryTracking {
  id: string;
  deliveryId: string;
  recipientId: string;
  channel: DistributionChannel;
  status: DeliveryStatus;
  events: DeliveryEvent[];
  metadata: TrackingMetadata;
}

export interface DeliveryEvent {
  type: DeliveryEventType;
  timestamp: Date;
  data: Record<string, any>;
  userAgent?: string;
  ipAddress?: string;
}

export interface TrackingMetadata {
  trackingPixelUrl?: string;
  linkClickTracking: boolean;
  readReceipts: boolean;
  downloadTracking: boolean;
  forwardingDetection: boolean;
}

export interface NotificationRequest {
  subject: string;
  message: string;
  recipients: string[];
  channels: NotificationChannel[];
  priority?: NotificationPriority;
  metadata?: Record<string, any>;
}

export interface DistributionAnalytics {
  totalDeliveries: number;
  successfulDeliveries: number;
  failedDeliveries: number;
  deliveryRate: number;
  averageDeliveryTime: number;
  channelPerformance: ChannelPerformance[];
  recipientEngagement: RecipientEngagement[];
  errorAnalysis: ErrorAnalysis;
}

export interface ChannelPerformance {
  channel: DistributionChannel;
  deliveryCount: number;
  successRate: number;
  averageDeliveryTime: number;
  errorRate: number;
  topErrors: string[];
}

export interface RecipientEngagement {
  recipientId: string;
  deliveryCount: number;
  openRate: number;
  clickRate: number;
  downloadCount: number;
  lastEngagement: Date;
  preferredChannel: DistributionChannel;
}

export interface ErrorAnalysis {
  totalErrors: number;
  errorsByType: Record<string, number>;
  errorsByChannel: Record<DistributionChannel, number>;
  recoveryRate: number;
  averageResolutionTime: number;
}

export enum DeliveryPriority {
  URGENT = 'urgent',
  HIGH = 'high',
  NORMAL = 'normal',
  LOW = 'low'
}

export enum CloudProvider {
  AWS_S3 = 'aws_s3',
  AZURE_BLOB = 'azure_blob',
  GOOGLE_CLOUD = 'google_cloud',
  DROPBOX = 'dropbox',
  SHAREPOINT = 'sharepoint'
}

export enum SlackMessageFormat {
  RICH_TEXT = 'rich_text',
  BLOCKS = 'blocks',
  ATTACHMENTS = 'attachments'
}

export enum NotificationChannel {
  EMAIL = 'email',
  SLACK = 'slack',
  SMS = 'sms',
  WEBHOOK = 'webhook',
  PUSH = 'push'
}

export enum NotificationPriority {
  CRITICAL = 'critical',
  HIGH = 'high',
  MEDIUM = 'medium',
  LOW = 'low'
}

export enum DeliveryEventType {
  SENT = 'sent',
  DELIVERED = 'delivered',
  OPENED = 'opened',
  CLICKED = 'clicked',
  DOWNLOADED = 'downloaded',
  BOUNCED = 'bounced',
  FAILED = 'failed',
  FORWARDED = 'forwarded',
  UNSUBSCRIBED = 'unsubscribed'
}

export class ReportDistribution extends EventEmitter {
  private prisma: PrismaClient;
  private redis: Redis;
  private emailTransporter: nodemailer.Transporter;
  private slackClient: SlackWebClient;
  private s3Client: AWS.S3;
  private channelConfigs: Map<DistributionChannel, ChannelConfig> = new Map();
  private deliveryQueue: DeliveryRequest[] = [];
  private isProcessing: boolean = false;
  private maxConcurrentDeliveries: number = 10;

  constructor(config: {
    prisma: PrismaClient;
    redis: Redis;
    channelConfigs: ChannelConfig[];
    maxConcurrentDeliveries?: number;
  }) {
    super();
    this.prisma = config.prisma;
    this.redis = config.redis;
    this.maxConcurrentDeliveries = config.maxConcurrentDeliveries || 10;

    this.initializeChannels(config.channelConfigs);
  }

  /**
   * Initialize distribution system
   */
  async initialize(): Promise<void> {
    try {
      this.emit('distributionInitializing');

      // Initialize email transporter
      await this.initializeEmailTransporter();

      // Initialize Slack client
      await this.initializeSlackClient();

      // Initialize cloud storage
      await this.initializeCloudStorage();

      // Start processing queue
      this.startQueueProcessor();

      this.emit('distributionInitialized');
    } catch (error) {
      this.emit('distributionInitializationFailed', { error: error.message });
      throw error;
    }
  }

  /**
   * Distribute report to configured recipients
   */
  async distributeReport(
    report: ExecutiveReport,
    exports: { [key in ExportFormat]?: string },
    distribution: DistributionConfig
  ): Promise<DistributionResult[]> {
    try {
      const deliveryRequest: DeliveryRequest = {
        id: `delivery_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        reportId: report.id,
        report,
        exports,
        distribution,
        createdAt: new Date(),
        priority: DeliveryPriority.NORMAL,
        metadata: {
          organizationId: report.organizationId,
          requestedBy: 'system',
          tags: ['scheduled_report'],
          trackingEnabled: true
        }
      };

      // Add to delivery queue
      this.deliveryQueue.push(deliveryRequest);

      // Process immediately if queue is not busy
      if (!this.isProcessing) {
        this.processDeliveryQueue();
      }

      // Return placeholder results - actual results will be updated asynchronously
      return distribution.recipients.map(recipient => ({
        channel: distribution.channels[0] || DistributionChannel.EMAIL,
        recipientId: recipient.id,
        status: DeliveryStatus.PENDING,
        attemptCount: 0
      }));

    } catch (error) {
      this.emit('distributionFailed', { reportId: report.id, error: error.message });
      throw error;
    }
  }

  /**
   * Send notification
   */
  async sendNotification(notification: NotificationRequest): Promise<void> {
    try {
      const deliveryPromises = notification.channels.map(async channel => {
        switch (channel) {
          case NotificationChannel.EMAIL:
            return this.sendEmailNotification(notification);
          case NotificationChannel.SLACK:
            return this.sendSlackNotification(notification);
          case NotificationChannel.SMS:
            return this.sendSMSNotification(notification);
          case NotificationChannel.WEBHOOK:
            return this.sendWebhookNotification(notification);
          default:
            throw new Error(`Unsupported notification channel: ${channel}`);
        }
      });

      await Promise.allSettled(deliveryPromises);
      this.emit('notificationSent', { notification });

    } catch (error) {
      this.emit('notificationFailed', { notification, error: error.message });
      throw error;
    }
  }

  /**
   * Get delivery analytics
   */
  async getDeliveryAnalytics(
    organizationId: string,
    timeframe: 'day' | 'week' | 'month' = 'month'
  ): Promise<DistributionAnalytics> {
    return this.calculateDeliveryAnalytics(organizationId, timeframe);
  }

  /**
   * Track delivery event
   */
  async trackDeliveryEvent(
    trackingId: string,
    eventType: DeliveryEventType,
    metadata?: Record<string, any>
  ): Promise<void> {
    try {
      const event: DeliveryEvent = {
        type: eventType,
        timestamp: new Date(),
        data: metadata || {},
        userAgent: metadata?.userAgent,
        ipAddress: metadata?.ipAddress
      };

      await this.saveDeliveryEvent(trackingId, event);
      this.emit('deliveryEventTracked', { trackingId, eventType });

    } catch (error) {
      this.emit('trackingFailed', { trackingId, error: error.message });
    }
  }

  /**
   * Get delivery tracking information
   */
  async getDeliveryTracking(deliveryId: string): Promise<DeliveryTracking | null> {
    return this.loadDeliveryTracking(deliveryId);
  }

  /**
   * Update channel configuration
   */
  async updateChannelConfig(
    channel: DistributionChannel,
    config: ChannelConfig
  ): Promise<void> {
    this.channelConfigs.set(channel, config);
    await this.reinitializeChannel(channel);
    this.emit('channelConfigUpdated', { channel });
  }

  /**
   * Test channel connectivity
   */
  async testChannel(channel: DistributionChannel): Promise<boolean> {
    try {
      switch (channel) {
        case DistributionChannel.EMAIL:
          return this.testEmailConnection();
        case DistributionChannel.SLACK:
          return this.testSlackConnection();
        case DistributionChannel.WEBHOOK:
          return this.testWebhookConnection();
        case DistributionChannel.S3:
          return this.testS3Connection();
        default:
          return false;
      }
    } catch (error) {
      this.emit('channelTestFailed', { channel, error: error.message });
      return false;
    }
  }

  /**
   * Initialize distribution channels
   */
  private initializeChannels(channelConfigs: ChannelConfig[]): void {
    channelConfigs.forEach(config => {
      this.channelConfigs.set(config.type, config);
    });
  }

  /**
   * Initialize email transporter
   */
  private async initializeEmailTransporter(): Promise<void> {
    const emailConfig = this.channelConfigs.get(DistributionChannel.EMAIL);
    if (emailConfig?.config.smtp) {
      this.emailTransporter = nodemailer.createTransporter({
        host: emailConfig.config.smtp.host,
        port: emailConfig.config.smtp.port,
        secure: emailConfig.config.smtp.secure,
        auth: emailConfig.config.smtp.auth
      });

      // Verify connection
      await this.emailTransporter.verify();
      this.emit('emailTransporterInitialized');
    }
  }

  /**
   * Initialize Slack client
   */
  private async initializeSlackClient(): Promise<void> {
    const slackConfig = this.channelConfigs.get(DistributionChannel.SLACK);
    if (slackConfig?.config.slack) {
      this.slackClient = new SlackWebClient(slackConfig.config.slack.token);

      // Test connection
      await this.slackClient.auth.test();
      this.emit('slackClientInitialized');
    }
  }

  /**
   * Initialize cloud storage
   */
  private async initializeCloudStorage(): Promise<void> {
    const s3Config = this.channelConfigs.get(DistributionChannel.S3);
    if (s3Config?.config.cloudStorage) {
      this.s3Client = new AWS.S3({
        accessKeyId: s3Config.config.cloudStorage.credentials.accessKeyId,
        secretAccessKey: s3Config.config.cloudStorage.credentials.secretAccessKey,
        region: s3Config.config.cloudStorage.region
      });

      this.emit('cloudStorageInitialized');
    }
  }

  /**
   * Start processing delivery queue
   */
  private startQueueProcessor(): void {
    setInterval(async () => {
      if (!this.isProcessing && this.deliveryQueue.length > 0) {
        await this.processDeliveryQueue();
      }
    }, 5000); // Check every 5 seconds
  }

  /**
   * Process delivery queue
   */
  private async processDeliveryQueue(): Promise<void> {
    if (this.isProcessing || this.deliveryQueue.length === 0) {
      return;
    }

    this.isProcessing = true;

    try {
      // Process up to maxConcurrentDeliveries at once
      const batch = this.deliveryQueue.splice(0, this.maxConcurrentDeliveries);
      const processingPromises = batch.map(request => this.processDeliveryRequest(request));

      await Promise.allSettled(processingPromises);

    } catch (error) {
      this.emit('queueProcessingFailed', { error: error.message });
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Process individual delivery request
   */
  private async processDeliveryRequest(request: DeliveryRequest): Promise<DistributionResult[]> {
    const results: DistributionResult[] = [];

    this.emit('deliveryStarted', { deliveryId: request.id });

    try {
      // Process each recipient
      for (const recipient of request.distribution.recipients) {
        if (!recipient.isActive) continue;

        // Process each channel for this recipient
        for (const channel of request.distribution.channels) {
          const result = await this.deliverToRecipient(
            request,
            recipient,
            channel
          );
          results.push(result);
        }
      }

      this.emit('deliveryCompleted', {
        deliveryId: request.id,
        results,
        successCount: results.filter(r => r.status === DeliveryStatus.DELIVERED).length,
        failureCount: results.filter(r => r.status === DeliveryStatus.FAILED).length
      });

    } catch (error) {
      this.emit('deliveryRequestFailed', {
        deliveryId: request.id,
        error: error.message
      });
    }

    return results;
  }

  /**
   * Deliver to specific recipient via specific channel
   */
  private async deliverToRecipient(
    request: DeliveryRequest,
    recipient: ReportRecipient,
    channel: DistributionChannel
  ): Promise<DistributionResult> {
    const result: DistributionResult = {
      channel,
      recipientId: recipient.id,
      status: DeliveryStatus.PENDING,
      attemptCount: 0
    };

    const maxAttempts = request.distribution.deliveryOptions.retryAttempts || 3;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      result.attemptCount = attempt;

      try {
        switch (channel) {
          case DistributionChannel.EMAIL:
            await this.deliverViaEmail(request, recipient);
            break;
          case DistributionChannel.SLACK:
            await this.deliverViaSlack(request, recipient);
            break;
          case DistributionChannel.TEAMS:
            await this.deliverViaTeams(request, recipient);
            break;
          case DistributionChannel.WEBHOOK:
            await this.deliverViaWebhook(request, recipient);
            break;
          case DistributionChannel.S3:
            await this.deliverViaS3(request, recipient);
            break;
          default:
            throw new Error(`Unsupported delivery channel: ${channel}`);
        }

        result.status = DeliveryStatus.DELIVERED;
        result.deliveredAt = new Date();
        break; // Success, no need to retry

      } catch (error) {
        result.error = error.message;

        if (attempt === maxAttempts) {
          result.status = DeliveryStatus.FAILED;
        } else {
          // Wait before retry
          const delayMs = request.distribution.deliveryOptions.retryDelay * 60 * 1000 || 60000;
          await this.delay(delayMs);
        }
      }
    }

    // Save delivery result
    await this.saveDeliveryResult(request.id, result);

    return result;
  }

  /**
   * Deliver via email
   */
  private async deliverViaEmail(
    request: DeliveryRequest,
    recipient: ReportRecipient
  ): Promise<void> {
    if (!this.emailTransporter) {
      throw new Error('Email transporter not initialized');
    }

    const emailConfig = this.channelConfigs.get(DistributionChannel.EMAIL);
    if (!emailConfig?.config.smtp) {
      throw new Error('Email configuration not found');
    }

    // Prepare attachments
    const attachments = Object.entries(request.exports)
      .filter(([format]) => recipient.preferences.formats.includes(format as ExportFormat))
      .map(([format, filePath]) => ({
        filename: `${request.report.title}_${format}.${this.getFileExtension(format as ExportFormat)}`,
        path: filePath
      }));

    // Generate email content
    const emailContent = this.generateEmailContent(request.report, recipient);

    // Send email
    await this.emailTransporter.sendMail({
      from: emailConfig.config.smtp.from,
      to: recipient.email,
      subject: `Executive Report: ${request.report.title}`,
      html: emailContent,
      attachments
    });

    this.emit('emailDelivered', {
      deliveryId: request.id,
      recipientId: recipient.id,
      recipientEmail: recipient.email
    });
  }

  /**
   * Deliver via Slack
   */
  private async deliverViaSlack(
    request: DeliveryRequest,
    recipient: ReportRecipient
  ): Promise<void> {
    if (!this.slackClient) {
      throw new Error('Slack client not initialized');
    }

    const slackConfig = this.channelConfigs.get(DistributionChannel.SLACK);
    if (!slackConfig?.config.slack) {
      throw new Error('Slack configuration not found');
    }

    // Find appropriate channel for recipient role
    const channel = slackConfig.config.slack.channels.find(ch =>
      ch.recipientRoles.includes(recipient.role)
    );

    if (!channel) {
      throw new Error(`No Slack channel configured for role: ${recipient.role}`);
    }

    // Generate Slack message
    const message = this.generateSlackMessage(request.report, recipient);

    // Send Slack message
    await this.slackClient.chat.postMessage({
      channel: channel.id,
      text: message.text,
      blocks: message.blocks,
      username: slackConfig.config.slack.botName
    });

    this.emit('slackDelivered', {
      deliveryId: request.id,
      recipientId: recipient.id,
      channelId: channel.id
    });
  }

  /**
   * Deliver via Microsoft Teams
   */
  private async deliverViaTeams(
    request: DeliveryRequest,
    recipient: ReportRecipient
  ): Promise<void> {
    const teamsConfig = this.channelConfigs.get(DistributionChannel.TEAMS);
    if (!teamsConfig?.config.teams) {
      throw new Error('Teams configuration not found');
    }

    // Find appropriate channel for recipient role
    const channel = teamsConfig.config.teams.channels.find(ch =>
      ch.recipientRoles.includes(recipient.role)
    );

    if (!channel) {
      throw new Error(`No Teams channel configured for role: ${recipient.role}`);
    }

    // Generate Teams adaptive card
    const card = this.generateTeamsCard(request.report, recipient);

    // Send to Teams webhook
    await axios.post(channel.webhookUrl, card, {
      headers: { 'Content-Type': 'application/json' }
    });

    this.emit('teamsDelivered', {
      deliveryId: request.id,
      recipientId: recipient.id,
      channelId: channel.id
    });
  }

  /**
   * Deliver via webhook
   */
  private async deliverViaWebhook(
    request: DeliveryRequest,
    recipient: ReportRecipient
  ): Promise<void> {
    const webhookConfig = this.channelConfigs.get(DistributionChannel.WEBHOOK);
    if (!webhookConfig?.config.webhook) {
      throw new Error('Webhook configuration not found');
    }

    const payload = {
      reportId: request.report.id,
      recipientId: recipient.id,
      reportData: request.report,
      exports: request.exports,
      timestamp: new Date().toISOString()
    };

    // Prepare headers
    const headers = {
      ...webhookConfig.config.webhook.headers,
      'Content-Type': 'application/json'
    };

    // Add authentication
    this.addWebhookAuthentication(headers, webhookConfig.config.webhook.authentication);

    // Send webhook
    await axios({
      method: webhookConfig.config.webhook.method,
      url: webhookConfig.config.webhook.url,
      data: payload,
      headers,
      timeout: webhookConfig.config.webhook.timeoutMs
    });

    this.emit('webhookDelivered', {
      deliveryId: request.id,
      recipientId: recipient.id,
      webhookUrl: webhookConfig.config.webhook.url
    });
  }

  /**
   * Deliver via S3
   */
  private async deliverViaS3(
    request: DeliveryRequest,
    recipient: ReportRecipient
  ): Promise<void> {
    if (!this.s3Client) {
      throw new Error('S3 client not initialized');
    }

    const s3Config = this.channelConfigs.get(DistributionChannel.S3);
    if (!s3Config?.config.cloudStorage) {
      throw new Error('S3 configuration not found');
    }

    // Upload each export format
    for (const [format, filePath] of Object.entries(request.exports)) {
      if (!recipient.preferences.formats.includes(format as ExportFormat)) continue;

      const fileContent = await fs.readFile(filePath);
      const key = `${s3Config.config.cloudStorage.path}/${request.report.id}/${recipient.id}/${format}.${this.getFileExtension(format as ExportFormat)}`;

      await this.s3Client.upload({
        Bucket: s3Config.config.cloudStorage.bucket,
        Key: key,
        Body: fileContent,
        ServerSideEncryption: s3Config.config.cloudStorage.encryption ? 'AES256' : undefined,
        ACL: s3Config.config.cloudStorage.publicAccess ? 'public-read' : 'private'
      }).promise();
    }

    this.emit('s3Delivered', {
      deliveryId: request.id,
      recipientId: recipient.id,
      bucket: s3Config.config.cloudStorage.bucket
    });
  }

  /**
   * Send email notification
   */
  private async sendEmailNotification(notification: NotificationRequest): Promise<void> {
    if (!this.emailTransporter) {
      throw new Error('Email transporter not initialized');
    }

    const emailConfig = this.channelConfigs.get(DistributionChannel.EMAIL);
    if (!emailConfig?.config.smtp) {
      throw new Error('Email configuration not found');
    }

    await this.emailTransporter.sendMail({
      from: emailConfig.config.smtp.from,
      to: notification.recipients,
      subject: notification.subject,
      html: this.formatNotificationHtml(notification.message),
      priority: this.getEmailPriority(notification.priority)
    });
  }

  /**
   * Send Slack notification
   */
  private async sendSlackNotification(notification: NotificationRequest): Promise<void> {
    if (!this.slackClient) {
      throw new Error('Slack client not initialized');
    }

    const slackConfig = this.channelConfigs.get(DistributionChannel.SLACK);
    if (!slackConfig?.config.slack) {
      throw new Error('Slack configuration not found');
    }

    // Send to first available channel (notifications are not recipient-specific)
    const channel = slackConfig.config.slack.channels[0];
    if (!channel) {
      throw new Error('No Slack channels configured');
    }

    await this.slackClient.chat.postMessage({
      channel: channel.id,
      text: `**${notification.subject}**\n${notification.message}`,
      username: slackConfig.config.slack.botName
    });
  }

  /**
   * Send SMS notification
   */
  private async sendSMSNotification(notification: NotificationRequest): Promise<void> {
    // SMS implementation would go here
    // This is a placeholder for SMS service integration
    this.emit('smsNotificationSent', { notification });
  }

  /**
   * Send webhook notification
   */
  private async sendWebhookNotification(notification: NotificationRequest): Promise<void> {
    const webhookConfig = this.channelConfigs.get(DistributionChannel.WEBHOOK);
    if (!webhookConfig?.config.webhook) {
      throw new Error('Webhook configuration not found');
    }

    const payload = {
      type: 'notification',
      subject: notification.subject,
      message: notification.message,
      recipients: notification.recipients,
      priority: notification.priority,
      timestamp: new Date().toISOString(),
      metadata: notification.metadata
    };

    const headers = {
      ...webhookConfig.config.webhook.headers,
      'Content-Type': 'application/json'
    };

    this.addWebhookAuthentication(headers, webhookConfig.config.webhook.authentication);

    await axios({
      method: webhookConfig.config.webhook.method,
      url: webhookConfig.config.webhook.url,
      data: payload,
      headers,
      timeout: webhookConfig.config.webhook.timeoutMs
    });
  }

  // Helper methods
  private getFileExtension(format: ExportFormat): string {
    switch (format) {
      case ExportFormat.PDF: return 'pdf';
      case ExportFormat.EXCEL: return 'xlsx';
      case ExportFormat.HTML: return 'html';
      case ExportFormat.JSON: return 'json';
      case ExportFormat.CSV: return 'csv';
      default: return 'txt';
    }
  }

  private generateEmailContent(report: ExecutiveReport, recipient: ReportRecipient): string {
    return `
      <h1>${report.title}</h1>
      <p>Dear ${recipient.name},</p>
      <p>Please find attached your ${report.type} report for ${report.period}.</p>

      <h2>Executive Summary</h2>
      <h3>Key Metrics:</h3>
      <ul>
        ${report.executiveSummary.keyMetrics.map(metric =>
          `<li><strong>${metric.name}:</strong> ${metric.value}${metric.unit} (${metric.changePercent > 0 ? '+' : ''}${metric.changePercent}%)</li>`
        ).join('')}
      </ul>

      <h3>Key Highlights:</h3>
      <ul>
        ${report.executiveSummary.highlights.map(highlight => `<li>${highlight}</li>`).join('')}
      </ul>

      <p>Best regards,<br>AI Analytics Team</p>
    `;
  }

  private generateSlackMessage(report: ExecutiveReport, recipient: ReportRecipient): any {
    return {
      text: `Executive Report: ${report.title}`,
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: `📊 ${report.title}`
          }
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Period:* ${report.period}\n*Generated:* ${report.generatedAt.toLocaleDateString()}`
          }
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: '*Key Metrics:*\n' + report.executiveSummary.keyMetrics.slice(0, 3).map(metric =>
              `• *${metric.name}:* ${metric.value}${metric.unit} (${metric.changePercent > 0 ? '+' : ''}${metric.changePercent}%)`
            ).join('\n')
          }
        }
      ]
    };
  }

  private generateTeamsCard(report: ExecutiveReport, recipient: ReportRecipient): any {
    return {
      '@type': 'MessageCard',
      '@context': 'http://schema.org/extensions',
      summary: `Executive Report: ${report.title}`,
      themeColor: '0076D7',
      sections: [{
        activityTitle: `📊 ${report.title}`,
        activitySubtitle: `${report.period} • Generated ${report.generatedAt.toLocaleDateString()}`,
        facts: report.executiveSummary.keyMetrics.slice(0, 4).map(metric => ({
          name: metric.name,
          value: `${metric.value}${metric.unit} (${metric.changePercent > 0 ? '+' : ''}${metric.changePercent}%)`
        }))
      }]
    };
  }

  private addWebhookAuthentication(headers: Record<string, string>, auth: WebhookAuth): void {
    switch (auth.type) {
      case 'bearer':
        headers['Authorization'] = `Bearer ${auth.token}`;
        break;
      case 'basic':
        const credentials = Buffer.from(`${auth.username}:${auth.password}`).toString('base64');
        headers['Authorization'] = `Basic ${credentials}`;
        break;
      case 'apikey':
        if (auth.apiKeyHeader) {
          headers[auth.apiKeyHeader] = auth.apiKey || '';
        }
        break;
    }
  }

  private formatNotificationHtml(message: string): string {
    return `
      <html>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
          <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
            ${message.replace(/\n/g, '<br>')}
          </div>
        </body>
      </html>
    `;
  }

  private getEmailPriority(priority?: NotificationPriority): 'high' | 'normal' | 'low' {
    switch (priority) {
      case NotificationPriority.CRITICAL:
      case NotificationPriority.HIGH:
        return 'high';
      case NotificationPriority.LOW:
        return 'low';
      default:
        return 'normal';
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Channel testing methods
  private async testEmailConnection(): Promise<boolean> {
    try {
      if (this.emailTransporter) {
        await this.emailTransporter.verify();
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  private async testSlackConnection(): Promise<boolean> {
    try {
      if (this.slackClient) {
        await this.slackClient.auth.test();
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  private async testWebhookConnection(): Promise<boolean> {
    const webhookConfig = this.channelConfigs.get(DistributionChannel.WEBHOOK);
    if (!webhookConfig?.config.webhook) return false;

    try {
      await axios.get(webhookConfig.config.webhook.url, {
        timeout: 5000
      });
      return true;
    } catch {
      return false;
    }
  }

  private async testS3Connection(): Promise<boolean> {
    try {
      if (this.s3Client) {
        await this.s3Client.listBuckets().promise();
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  // Database operations (mock implementations)
  private async saveDeliveryResult(deliveryId: string, result: DistributionResult): Promise<void> {
    const key = `delivery_result:${deliveryId}:${result.recipientId}`;
    await this.redis.setex(key, 86400 * 7, JSON.stringify(result)); // Keep for 7 days
  }

  private async saveDeliveryEvent(trackingId: string, event: DeliveryEvent): Promise<void> {
    const key = `delivery_event:${trackingId}`;
    const events = await this.redis.get(key);
    const eventList = events ? JSON.parse(events) : [];
    eventList.push(event);
    await this.redis.setex(key, 86400 * 30, JSON.stringify(eventList)); // Keep for 30 days
  }

  private async loadDeliveryTracking(deliveryId: string): Promise<DeliveryTracking | null> {
    const key = `delivery_tracking:${deliveryId}`;
    const data = await this.redis.get(key);
    return data ? JSON.parse(data) : null;
  }

  private async calculateDeliveryAnalytics(
    organizationId: string,
    timeframe: string
  ): Promise<DistributionAnalytics> {
    // Mock implementation - replace with actual analytics calculation
    return {
      totalDeliveries: 486,
      successfulDeliveries: 451,
      failedDeliveries: 35,
      deliveryRate: 92.8,
      averageDeliveryTime: 12.5,
      channelPerformance: [
        {
          channel: DistributionChannel.EMAIL,
          deliveryCount: 320,
          successRate: 94.1,
          averageDeliveryTime: 8.2,
          errorRate: 5.9,
          topErrors: ['Invalid email address', 'Mailbox full']
        },
        {
          channel: DistributionChannel.SLACK,
          deliveryCount: 166,
          successRate: 98.8,
          averageDeliveryTime: 2.1,
          errorRate: 1.2,
          topErrors: ['Channel not found']
        }
      ],
      recipientEngagement: [],
      errorAnalysis: {
        totalErrors: 35,
        errorsByType: {
          'delivery_failed': 20,
          'authentication_error': 8,
          'timeout': 7
        },
        errorsByChannel: {
          [DistributionChannel.EMAIL]: 25,
          [DistributionChannel.SLACK]: 5,
          [DistributionChannel.WEBHOOK]: 5
        },
        recoveryRate: 68.6,
        averageResolutionTime: 4.2
      }
    };
  }

  private async reinitializeChannel(channel: DistributionChannel): Promise<void> {
    switch (channel) {
      case DistributionChannel.EMAIL:
        await this.initializeEmailTransporter();
        break;
      case DistributionChannel.SLACK:
        await this.initializeSlackClient();
        break;
      case DistributionChannel.S3:
        await this.initializeCloudStorage();
        break;
      // Add other channels as needed
    }
  }
}

export default ReportDistribution;