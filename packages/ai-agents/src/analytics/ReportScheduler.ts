/**
 * Report Scheduler
 *
 * Automated scheduling system for generating and distributing reports
 * on configurable schedules with timezone support, error handling,
 * and flexible distribution mechanisms.
 */

import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import { EventEmitter } from 'events';
import { CronJob } from 'cron';
import {
  ReportGenerator,
  ExecutiveReportType,
  ReportPeriod,
  ExecutiveReport,
  ReportGenerationConfig,
  ExportFormat
} from './ReportGenerator';
import { ExecutiveSummaryGenerator } from './ExecutiveSummary';
import { ReportDistribution } from './ReportDistribution';

export interface ScheduledReport {
  id: string;
  name: string;
  description: string;
  organizationId: string;
  reportType: ExecutiveReportType;
  reportPeriod: ReportPeriod;
  schedule: ReportSchedule;
  config: ReportGenerationConfig;
  distribution: DistributionConfig;
  timezone: string;
  isActive: boolean;
  metadata: ScheduleMetadata;
  createdAt: Date;
  updatedAt: Date;
  lastRunAt?: Date;
  nextRunAt?: Date;
}

export interface ReportSchedule {
  type: ScheduleType;
  cronExpression: string;
  frequency: ScheduleFrequency;
  time: ScheduleTime;
  daysOfWeek?: DayOfWeek[];
  daysOfMonth?: number[];
  excludeDates?: Date[];
  startDate?: Date;
  endDate?: Date;
}

export interface ScheduleTime {
  hour: number;
  minute: number;
  second?: number;
}

export interface DistributionConfig {
  channels: DistributionChannel[];
  recipients: ReportRecipient[];
  formats: ExportFormat[];
  deliveryOptions: DeliveryOptions;
  notificationSettings: NotificationSettings;
}

export interface ReportRecipient {
  id: string;
  name: string;
  email: string;
  role: RecipientRole;
  preferences: RecipientPreferences;
  isActive: boolean;
}

export interface RecipientPreferences {
  formats: ExportFormat[];
  deliveryTime?: ScheduleTime;
  timezone?: string;
  language?: string;
  customizations?: Record<string, any>;
}

export interface DeliveryOptions {
  retryAttempts: number;
  retryDelay: number; // minutes
  failureNotification: boolean;
  deliveryConfirmation: boolean;
  encryptAttachments: boolean;
  passwordProtected: boolean;
}

export interface NotificationSettings {
  onSuccess: boolean;
  onFailure: boolean;
  onScheduleChange: boolean;
  channels: NotificationChannel[];
  escalation: EscalationConfig;
}

export interface EscalationConfig {
  enabled: boolean;
  attempts: number;
  delayMinutes: number;
  escalationRecipients: string[];
}

export interface ScheduleMetadata {
  createdBy: string;
  tags: string[];
  department?: string;
  priority: SchedulePriority;
  costCenter?: string;
  approvalRequired: boolean;
  approvedBy?: string;
  approvedAt?: Date;
}

export interface ScheduleExecution {
  id: string;
  scheduleId: string;
  organizationId: string;
  startedAt: Date;
  completedAt?: Date;
  status: ExecutionStatus;
  reportId?: string;
  distributionResults: DistributionResult[];
  errors: ExecutionError[];
  metrics: ExecutionMetrics;
  duration?: number; // milliseconds
}

export interface DistributionResult {
  channel: DistributionChannel;
  recipientId: string;
  status: DeliveryStatus;
  attemptCount: number;
  deliveredAt?: Date;
  error?: string;
  trackingId?: string;
}

export interface ExecutionError {
  code: string;
  message: string;
  timestamp: Date;
  severity: ErrorSeverity;
  recoverable: boolean;
  context?: Record<string, any>;
}

export interface ExecutionMetrics {
  generationTimeMs: number;
  distributionTimeMs: number;
  totalRecipients: number;
  successfulDeliveries: number;
  failedDeliveries: number;
  retryAttempts: number;
  filesGenerated: number;
  totalFileSize: number; // bytes
}

export enum ScheduleType {
  CRON = 'cron',
  INTERVAL = 'interval',
  TRIGGERED = 'triggered',
  ONE_TIME = 'one_time'
}

export enum ScheduleFrequency {
  DAILY = 'daily',
  WEEKLY = 'weekly',
  MONTHLY = 'monthly',
  QUARTERLY = 'quarterly',
  YEARLY = 'yearly',
  CUSTOM = 'custom'
}

export enum DayOfWeek {
  SUNDAY = 0,
  MONDAY = 1,
  TUESDAY = 2,
  WEDNESDAY = 3,
  THURSDAY = 4,
  FRIDAY = 5,
  SATURDAY = 6
}

export enum DistributionChannel {
  EMAIL = 'email',
  SLACK = 'slack',
  TEAMS = 'teams',
  WEBHOOK = 'webhook',
  FTP = 'ftp',
  S3 = 's3',
  SHAREPOINT = 'sharepoint',
  API = 'api'
}

export enum RecipientRole {
  CEO = 'ceo',
  CFO = 'cfo',
  COO = 'coo',
  CTO = 'cto',
  VP = 'vp',
  DIRECTOR = 'director',
  MANAGER = 'manager',
  ANALYST = 'analyst',
  STAKEHOLDER = 'stakeholder'
}

export enum NotificationChannel {
  EMAIL = 'email',
  SLACK = 'slack',
  SMS = 'sms',
  WEBHOOK = 'webhook'
}

export enum SchedulePriority {
  CRITICAL = 'critical',
  HIGH = 'high',
  MEDIUM = 'medium',
  LOW = 'low'
}

export enum ExecutionStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
  RETRYING = 'retrying'
}

export enum DeliveryStatus {
  PENDING = 'pending',
  DELIVERED = 'delivered',
  FAILED = 'failed',
  BOUNCED = 'bounced',
  BLOCKED = 'blocked'
}

export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

export class ReportScheduler extends EventEmitter {
  private prisma: PrismaClient;
  private redis: Redis;
  private reportGenerator: ReportGenerator;
  private summaryGenerator: ExecutiveSummaryGenerator;
  private distribution: ReportDistribution;
  private scheduledJobs: Map<string, CronJob> = new Map();
  private executionQueue: Set<string> = new Set();
  private maxConcurrentExecutions: number = 5;

  constructor(config: {
    prisma: PrismaClient;
    redis: Redis;
    reportGenerator: ReportGenerator;
    summaryGenerator: ExecutiveSummaryGenerator;
    distribution: ReportDistribution;
    maxConcurrentExecutions?: number;
  }) {
    super();
    this.prisma = config.prisma;
    this.redis = config.redis;
    this.reportGenerator = config.reportGenerator;
    this.summaryGenerator = config.summaryGenerator;
    this.distribution = config.distribution;
    this.maxConcurrentExecutions = config.maxConcurrentExecutions || 5;
  }

  /**
   * Initialize scheduler and load existing schedules
   */
  async initialize(): Promise<void> {
    try {
      this.emit('schedulerInitializing');

      // Load existing schedules from database
      const schedules = await this.loadSchedules();

      // Setup cron jobs for active schedules
      for (const schedule of schedules) {
        if (schedule.isActive) {
          await this.setupCronJob(schedule);
        }
      }

      // Setup cleanup jobs
      await this.setupMaintenanceJobs();

      this.emit('schedulerInitialized', { scheduleCount: schedules.length });
    } catch (error) {
      this.emit('schedulerInitializationFailed', { error: error.message });
      throw error;
    }
  }

  /**
   * Create new scheduled report
   */
  async createScheduledReport(
    reportConfig: Omit<ScheduledReport, 'id' | 'createdAt' | 'updatedAt' | 'nextRunAt'>
  ): Promise<ScheduledReport> {
    try {
      // Validate schedule configuration
      this.validateScheduleConfig(reportConfig.schedule);

      // Calculate next run time
      const nextRunAt = this.calculateNextRun(reportConfig.schedule, reportConfig.timezone);

      const scheduledReport: ScheduledReport = {
        ...reportConfig,
        id: `schedule_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        createdAt: new Date(),
        updatedAt: new Date(),
        nextRunAt
      };

      // Save to database
      await this.saveSchedule(scheduledReport);

      // Setup cron job if active
      if (scheduledReport.isActive) {
        await this.setupCronJob(scheduledReport);
      }

      this.emit('scheduleCreated', { scheduleId: scheduledReport.id });
      return scheduledReport;

    } catch (error) {
      this.emit('scheduleCreationFailed', { error: error.message });
      throw error;
    }
  }

  /**
   * Update existing scheduled report
   */
  async updateScheduledReport(
    scheduleId: string,
    updates: Partial<ScheduledReport>
  ): Promise<ScheduledReport> {
    try {
      const existingSchedule = await this.getSchedule(scheduleId);
      if (!existingSchedule) {
        throw new Error(`Schedule ${scheduleId} not found`);
      }

      // Remove existing cron job
      await this.removeCronJob(scheduleId);

      // Apply updates
      const updatedSchedule: ScheduledReport = {
        ...existingSchedule,
        ...updates,
        updatedAt: new Date()
      };

      // Recalculate next run if schedule changed
      if (updates.schedule || updates.timezone) {
        updatedSchedule.nextRunAt = this.calculateNextRun(
          updatedSchedule.schedule,
          updatedSchedule.timezone
        );
      }

      // Save updates
      await this.saveSchedule(updatedSchedule);

      // Setup new cron job if active
      if (updatedSchedule.isActive) {
        await this.setupCronJob(updatedSchedule);
      }

      this.emit('scheduleUpdated', { scheduleId });
      return updatedSchedule;

    } catch (error) {
      this.emit('scheduleUpdateFailed', { scheduleId, error: error.message });
      throw error;
    }
  }

  /**
   * Delete scheduled report
   */
  async deleteScheduledReport(scheduleId: string): Promise<void> {
    try {
      // Remove cron job
      await this.removeCronJob(scheduleId);

      // Remove from database
      await this.removeSchedule(scheduleId);

      this.emit('scheduleDeleted', { scheduleId });

    } catch (error) {
      this.emit('scheduleDeletionFailed', { scheduleId, error: error.message });
      throw error;
    }
  }

  /**
   * Execute scheduled report immediately
   */
  async executeScheduleNow(scheduleId: string): Promise<ScheduleExecution> {
    try {
      const schedule = await this.getSchedule(scheduleId);
      if (!schedule) {
        throw new Error(`Schedule ${scheduleId} not found`);
      }

      return await this.executeSchedule(schedule);

    } catch (error) {
      this.emit('immediateExecutionFailed', { scheduleId, error: error.message });
      throw error;
    }
  }

  /**
   * Get schedule execution history
   */
  async getExecutionHistory(
    scheduleId: string,
    limit: number = 50,
    offset: number = 0
  ): Promise<ScheduleExecution[]> {
    return this.loadExecutionHistory(scheduleId, limit, offset);
  }

  /**
   * Get all schedules for organization
   */
  async getSchedules(organizationId: string): Promise<ScheduledReport[]> {
    return this.loadSchedulesByOrganization(organizationId);
  }

  /**
   * Pause/resume schedule
   */
  async pauseSchedule(scheduleId: string): Promise<void> {
    await this.updateScheduledReport(scheduleId, { isActive: false });
  }

  async resumeSchedule(scheduleId: string): Promise<void> {
    await this.updateScheduledReport(scheduleId, { isActive: true });
  }

  /**
   * Get schedule statistics
   */
  async getScheduleStatistics(
    organizationId: string,
    timeframe: 'day' | 'week' | 'month' = 'month'
  ): Promise<ScheduleStatistics> {
    const stats = await this.calculateScheduleStatistics(organizationId, timeframe);
    return stats;
  }

  /**
   * Setup cron job for schedule
   */
  private async setupCronJob(schedule: ScheduledReport): Promise<void> {
    try {
      // Remove existing job if any
      await this.removeCronJob(schedule.id);

      const cronJob = new CronJob(
        schedule.schedule.cronExpression,
        async () => {
          await this.executeSchedule(schedule);
        },
        null,
        true,
        schedule.timezone
      );

      this.scheduledJobs.set(schedule.id, cronJob);
      this.emit('cronJobCreated', { scheduleId: schedule.id });

    } catch (error) {
      this.emit('cronJobCreationFailed', { scheduleId: schedule.id, error: error.message });
      throw error;
    }
  }

  /**
   * Remove cron job
   */
  private async removeCronJob(scheduleId: string): Promise<void> {
    const job = this.scheduledJobs.get(scheduleId);
    if (job) {
      job.destroy();
      this.scheduledJobs.delete(scheduleId);
      this.emit('cronJobRemoved', { scheduleId });
    }
  }

  /**
   * Execute scheduled report
   */
  private async executeSchedule(schedule: ScheduledReport): Promise<ScheduleExecution> {
    const executionId = `exec_${schedule.id}_${Date.now()}`;
    const startTime = Date.now();

    // Check if execution is already running
    if (this.executionQueue.has(schedule.id)) {
      throw new Error(`Schedule ${schedule.id} is already executing`);
    }

    // Check concurrent execution limit
    if (this.executionQueue.size >= this.maxConcurrentExecutions) {
      throw new Error('Maximum concurrent executions reached');
    }

    this.executionQueue.add(schedule.id);

    const execution: ScheduleExecution = {
      id: executionId,
      scheduleId: schedule.id,
      organizationId: schedule.organizationId,
      startedAt: new Date(),
      status: ExecutionStatus.RUNNING,
      distributionResults: [],
      errors: [],
      metrics: {
        generationTimeMs: 0,
        distributionTimeMs: 0,
        totalRecipients: schedule.distribution.recipients.length,
        successfulDeliveries: 0,
        failedDeliveries: 0,
        retryAttempts: 0,
        filesGenerated: 0,
        totalFileSize: 0
      }
    };

    try {
      this.emit('scheduleExecutionStarted', { scheduleId: schedule.id, executionId });

      // Generate report
      const generationStart = Date.now();
      const report = await this.reportGenerator.generateExecutiveReport(
        schedule.organizationId,
        schedule.reportType,
        schedule.reportPeriod,
        schedule.config
      );
      execution.metrics.generationTimeMs = Date.now() - generationStart;
      execution.reportId = report.id;

      // Export in required formats
      const exports = await this.reportGenerator.exportReport(
        report,
        schedule.distribution.formats,
        `/tmp/reports/${execution.id}`
      );
      execution.metrics.filesGenerated = Object.keys(exports).length;

      // Calculate total file size
      execution.metrics.totalFileSize = await this.calculateFileSize(Object.values(exports));

      // Distribute report
      const distributionStart = Date.now();
      const distributionResults = await this.distribution.distributeReport(
        report,
        exports,
        schedule.distribution
      );
      execution.metrics.distributionTimeMs = Date.now() - distributionStart;

      // Process distribution results
      execution.distributionResults = distributionResults;
      execution.metrics.successfulDeliveries = distributionResults.filter(
        r => r.status === DeliveryStatus.DELIVERED
      ).length;
      execution.metrics.failedDeliveries = distributionResults.filter(
        r => r.status === DeliveryStatus.FAILED
      ).length;

      execution.status = ExecutionStatus.COMPLETED;
      execution.completedAt = new Date();
      execution.duration = Date.now() - startTime;

      // Update schedule last run time
      await this.updateScheduleLastRun(schedule.id, new Date());

      this.emit('scheduleExecutionCompleted', {
        scheduleId: schedule.id,
        executionId,
        metrics: execution.metrics
      });

    } catch (error) {
      execution.status = ExecutionStatus.FAILED;
      execution.completedAt = new Date();
      execution.duration = Date.now() - startTime;
      execution.errors.push({
        code: 'EXECUTION_FAILED',
        message: error.message,
        timestamp: new Date(),
        severity: ErrorSeverity.HIGH,
        recoverable: true,
        context: { scheduleId: schedule.id }
      });

      this.emit('scheduleExecutionFailed', {
        scheduleId: schedule.id,
        executionId,
        error: error.message
      });

      // Handle failure notifications
      if (schedule.distribution.notificationSettings.onFailure) {
        await this.sendFailureNotification(schedule, execution, error.message);
      }

    } finally {
      this.executionQueue.delete(schedule.id);
      await this.saveExecution(execution);
    }

    return execution;
  }

  /**
   * Setup maintenance jobs for cleanup and monitoring
   */
  private async setupMaintenanceJobs(): Promise<void> {
    // Cleanup old executions (daily at 2 AM)
    const cleanupJob = new CronJob('0 2 * * *', async () => {
      await this.cleanupOldExecutions();
    });
    cleanupJob.start();

    // Monitor failed schedules (every hour)
    const monitorJob = new CronJob('0 * * * *', async () => {
      await this.monitorFailedSchedules();
    });
    monitorJob.start();

    this.emit('maintenanceJobsSetup');
  }

  /**
   * Validate schedule configuration
   */
  private validateScheduleConfig(schedule: ReportSchedule): void {
    if (!schedule.cronExpression) {
      throw new Error('Cron expression is required');
    }

    // Validate cron expression
    try {
      new CronJob(schedule.cronExpression, () => {}, null, false);
    } catch (error) {
      throw new Error(`Invalid cron expression: ${error.message}`);
    }

    if (schedule.time.hour < 0 || schedule.time.hour > 23) {
      throw new Error('Hour must be between 0 and 23');
    }

    if (schedule.time.minute < 0 || schedule.time.minute > 59) {
      throw new Error('Minute must be between 0 and 59');
    }
  }

  /**
   * Calculate next run time for schedule
   */
  private calculateNextRun(schedule: ReportSchedule, timezone: string): Date {
    try {
      const job = new CronJob(schedule.cronExpression, () => {}, null, false, timezone);
      return job.nextDate().toDate();
    } catch (error) {
      throw new Error(`Failed to calculate next run: ${error.message}`);
    }
  }

  /**
   * Send failure notification
   */
  private async sendFailureNotification(
    schedule: ScheduledReport,
    execution: ScheduleExecution,
    error: string
  ): Promise<void> {
    try {
      const notification = {
        subject: `Scheduled Report Failed: ${schedule.name}`,
        message: `
          Report: ${schedule.name}
          Schedule ID: ${schedule.id}
          Execution ID: ${execution.id}
          Error: ${error}
          Time: ${execution.startedAt.toISOString()}
        `,
        recipients: schedule.distribution.recipients
          .filter(r => r.isActive)
          .map(r => r.email),
        channels: schedule.distribution.notificationSettings.channels
      };

      await this.distribution.sendNotification(notification);

    } catch (notificationError) {
      this.emit('notificationFailed', {
        scheduleId: schedule.id,
        error: notificationError.message
      });
    }
  }

  /**
   * Cleanup old execution records
   */
  private async cleanupOldExecutions(): Promise<void> {
    try {
      const retentionDays = 90; // Keep 90 days of history
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

      const deletedCount = await this.deleteOldExecutions(cutoffDate);
      this.emit('executionCleanup', { deletedCount, cutoffDate });

    } catch (error) {
      this.emit('cleanupFailed', { error: error.message });
    }
  }

  /**
   * Monitor and retry failed schedules
   */
  private async monitorFailedSchedules(): Promise<void> {
    try {
      const failedExecutions = await this.getRecentFailedExecutions();

      for (const execution of failedExecutions) {
        const schedule = await this.getSchedule(execution.scheduleId);
        if (schedule && this.shouldRetryExecution(execution)) {
          await this.retryExecution(schedule, execution);
        }
      }

    } catch (error) {
      this.emit('monitoringFailed', { error: error.message });
    }
  }

  /**
   * Check if execution should be retried
   */
  private shouldRetryExecution(execution: ScheduleExecution): boolean {
    const maxRetries = 3;
    const retryWindow = 24 * 60 * 60 * 1000; // 24 hours

    return (
      execution.metrics.retryAttempts < maxRetries &&
      Date.now() - execution.startedAt.getTime() < retryWindow &&
      execution.errors.some(error => error.recoverable)
    );
  }

  /**
   * Retry failed execution
   */
  private async retryExecution(
    schedule: ScheduledReport,
    failedExecution: ScheduleExecution
  ): Promise<void> {
    try {
      this.emit('retryExecutionStarted', {
        scheduleId: schedule.id,
        originalExecutionId: failedExecution.id
      });

      // Update retry count
      failedExecution.metrics.retryAttempts++;
      await this.saveExecution(failedExecution);

      // Execute with retry context
      await this.executeSchedule(schedule);

    } catch (error) {
      this.emit('retryExecutionFailed', {
        scheduleId: schedule.id,
        error: error.message
      });
    }
  }

  // Database operations (these would be implemented with actual database calls)
  private async loadSchedules(): Promise<ScheduledReport[]> {
    // Mock implementation - replace with actual database query
    return [];
  }

  private async saveSchedule(schedule: ScheduledReport): Promise<void> {
    // Mock implementation - replace with actual database save
    await this.redis.setex(
      `schedule:${schedule.id}`,
      86400,
      JSON.stringify(schedule)
    );
  }

  private async getSchedule(scheduleId: string): Promise<ScheduledReport | null> {
    // Mock implementation - replace with actual database query
    const cached = await this.redis.get(`schedule:${scheduleId}`);
    return cached ? JSON.parse(cached) : null;
  }

  private async removeSchedule(scheduleId: string): Promise<void> {
    // Mock implementation - replace with actual database delete
    await this.redis.del(`schedule:${scheduleId}`);
  }

  private async loadSchedulesByOrganization(organizationId: string): Promise<ScheduledReport[]> {
    // Mock implementation - replace with actual database query
    return [];
  }

  private async loadExecutionHistory(
    scheduleId: string,
    limit: number,
    offset: number
  ): Promise<ScheduleExecution[]> {
    // Mock implementation - replace with actual database query
    return [];
  }

  private async saveExecution(execution: ScheduleExecution): Promise<void> {
    // Mock implementation - replace with actual database save
    await this.redis.setex(
      `execution:${execution.id}`,
      86400 * 7, // Keep for 7 days
      JSON.stringify(execution)
    );
  }

  private async updateScheduleLastRun(scheduleId: string, lastRunAt: Date): Promise<void> {
    const schedule = await this.getSchedule(scheduleId);
    if (schedule) {
      schedule.lastRunAt = lastRunAt;
      schedule.nextRunAt = this.calculateNextRun(schedule.schedule, schedule.timezone);
      await this.saveSchedule(schedule);
    }
  }

  private async calculateFileSize(filePaths: string[]): Promise<number> {
    // Mock implementation - replace with actual file size calculation
    return filePaths.length * 1024 * 1024; // 1MB per file mock
  }

  private async calculateScheduleStatistics(
    organizationId: string,
    timeframe: string
  ): Promise<ScheduleStatistics> {
    // Mock implementation - replace with actual statistics calculation
    return {
      totalSchedules: 12,
      activeSchedules: 8,
      totalExecutions: 156,
      successfulExecutions: 142,
      failedExecutions: 14,
      averageExecutionTime: 45.2,
      totalReportsGenerated: 142,
      totalDataDistributed: 1.2 * 1024 * 1024 * 1024 // 1.2GB
    };
  }

  private async deleteOldExecutions(cutoffDate: Date): Promise<number> {
    // Mock implementation - replace with actual cleanup
    return 25; // Mock deleted count
  }

  private async getRecentFailedExecutions(): Promise<ScheduleExecution[]> {
    // Mock implementation - replace with actual query
    return [];
  }
}

export interface ScheduleStatistics {
  totalSchedules: number;
  activeSchedules: number;
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  averageExecutionTime: number; // seconds
  totalReportsGenerated: number;
  totalDataDistributed: number; // bytes
}

export default ReportScheduler;