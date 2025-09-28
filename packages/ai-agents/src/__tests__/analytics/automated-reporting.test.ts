/**
 * Automated Reporting System Integration Tests
 *
 * Tests the complete automated reporting workflow including report generation,
 * executive summary creation, scheduling, and distribution.
 */

import { jest } from '@jest/globals';
import {
  ReportGenerator,
  ExecutiveSummaryGenerator,
  ReportScheduler,
  ReportDistribution,
  ExecutiveReportType,
  ReportPeriod,
  ExportFormat,
  DistributionChannel,
  RecipientRole,
  ScheduleFrequency,
  AudienceLevel
} from '../../analytics';

// Mock dependencies
const mockPrisma = {
  // Mock Prisma client methods
} as any;

const mockRedis = {
  setex: jest.fn(),
  get: jest.fn(),
  del: jest.fn(),
  exists: jest.fn()
} as any;

const mockCostTracker = {
  getCostSummary: jest.fn().mockResolvedValue({
    totalCost: 150000,
    itemCount: 1500
  })
} as any;

const mockRoiCalculator = {
  calculateROI: jest.fn().mockResolvedValue({
    totalSavings: 275000,
    roiPercentage: 183.3,
    paybackPeriod: 6.5
  })
} as any;

const mockBudgetManager = {
  getCurrentBudgetReport: jest.fn().mockResolvedValue({
    utilizationPercentage: 87.2
  })
} as any;

const mockCostReportGenerator = {} as any;

describe('Automated Reporting System', () => {
  let reportGenerator: ReportGenerator;
  let summaryGenerator: ExecutiveSummaryGenerator;
  let reportScheduler: ReportScheduler;
  let reportDistribution: ReportDistribution;

  beforeEach(() => {
    jest.clearAllMocks();

    reportGenerator = new ReportGenerator({
      prisma: mockPrisma,
      redis: mockRedis,
      costTracker: mockCostTracker,
      roiCalculator: mockRoiCalculator,
      budgetManager: mockBudgetManager,
      costReportGenerator: mockCostReportGenerator
    });

    summaryGenerator = new ExecutiveSummaryGenerator({
      prisma: mockPrisma,
      redis: mockRedis
    });

    reportDistribution = new ReportDistribution({
      prisma: mockPrisma,
      redis: mockRedis,
      channelConfigs: []
    });

    reportScheduler = new ReportScheduler({
      prisma: mockPrisma,
      redis: mockRedis,
      reportGenerator,
      summaryGenerator,
      distribution: reportDistribution
    });
  });

  describe('ReportGenerator', () => {
    it('should generate executive report with all required sections', async () => {
      const organizationId = 'org_123';
      const report = await reportGenerator.generateExecutiveReport(
        organizationId,
        ExecutiveReportType.EXECUTIVE_SUMMARY,
        ReportPeriod.MONTHLY
      );

      expect(report).toBeDefined();
      expect(report.id).toMatch(/^exec_/);
      expect(report.organizationId).toBe(organizationId);
      expect(report.type).toBe(ExecutiveReportType.EXECUTIVE_SUMMARY);
      expect(report.period).toBe(ReportPeriod.MONTHLY);
      expect(report.executiveSummary).toBeDefined();
      expect(report.metrics).toBeDefined();
      expect(report.insights).toBeDefined();
      expect(report.recommendations).toBeDefined();
      expect(report.status).toBe('completed');
    });

    it('should export report to multiple formats', async () => {
      const report = await reportGenerator.generateExecutiveReport(
        'org_123',
        ExecutiveReportType.EXECUTIVE_SUMMARY,
        ReportPeriod.MONTHLY
      );

      const exports = await reportGenerator.exportReport(
        report,
        [ExportFormat.PDF, ExportFormat.EXCEL, ExportFormat.HTML],
        './test-output'
      );

      expect(exports).toBeDefined();
      expect(exports[ExportFormat.PDF]).toBeDefined();
      expect(exports[ExportFormat.EXCEL]).toBeDefined();
      expect(exports[ExportFormat.HTML]).toBeDefined();
    });

    it('should generate trend analysis for metrics', async () => {
      const trendAnalysis = await reportGenerator.generateTrendAnalysis(
        'org_123',
        ['roi', 'cost_savings', 'automation_rate'],
        12
      );

      expect(trendAnalysis).toBeDefined();
      expect(trendAnalysis.roi).toBeDefined();
      expect(trendAnalysis.cost_savings).toBeDefined();
      expect(trendAnalysis.automation_rate).toBeDefined();
    });
  });

  describe('ExecutiveSummaryGenerator', () => {
    it('should generate executive summary from full report', async () => {
      const report = await reportGenerator.generateExecutiveReport(
        'org_123',
        ExecutiveReportType.EXECUTIVE_SUMMARY,
        ReportPeriod.MONTHLY
      );

      const summary = await summaryGenerator.generateSummary(report);

      expect(summary).toBeDefined();
      expect(summary.keyMetrics).toBeDefined();
      expect(summary.keyMetrics.length).toBeGreaterThan(0);
      expect(summary.highlights).toBeDefined();
      expect(summary.recommendations).toBeDefined();
      expect(summary.outlook).toBeDefined();
    });

    it('should generate audience-specific summary', async () => {
      const report = await reportGenerator.generateExecutiveReport(
        'org_123',
        ExecutiveReportType.EXECUTIVE_SUMMARY,
        ReportPeriod.MONTHLY
      );

      const ceoSummary = await summaryGenerator.generateAudienceSpecificSummary(
        report,
        AudienceLevel.C_LEVEL
      );

      const boardSummary = await summaryGenerator.generateAudienceSpecificSummary(
        report,
        AudienceLevel.BOARD_LEVEL
      );

      expect(ceoSummary).toBeDefined();
      expect(boardSummary).toBeDefined();
      expect(ceoSummary.keyMetrics.length).toBeGreaterThan(0);
      expect(boardSummary.keyMetrics.length).toBeGreaterThan(0);
    });

    it('should create dashboard summary with metrics and alerts', async () => {
      const dashboardData = await summaryGenerator.createDashboardSummary(
        'org_123',
        'month'
      );

      expect(dashboardData.summary).toBeDefined();
      expect(dashboardData.dashboardMetrics).toBeDefined();
      expect(dashboardData.alerts).toBeDefined();
      expect(dashboardData.dashboardMetrics.length).toBeGreaterThan(0);
    });
  });

  describe('ReportScheduler', () => {
    it('should create scheduled report', async () => {
      const scheduleConfig = {
        name: 'Monthly Executive Report',
        description: 'Automated monthly executive summary',
        organizationId: 'org_123',
        reportType: ExecutiveReportType.EXECUTIVE_SUMMARY,
        reportPeriod: ReportPeriod.MONTHLY,
        schedule: {
          type: 'cron' as any,
          cronExpression: '0 9 1 * *', // 9 AM on 1st of every month
          frequency: ScheduleFrequency.MONTHLY,
          time: { hour: 9, minute: 0 }
        },
        distribution: {
          channels: [DistributionChannel.EMAIL],
          recipients: [{
            id: 'recipient_1',
            name: 'CEO',
            email: 'ceo@company.com',
            role: RecipientRole.CEO,
            preferences: {
              formats: [ExportFormat.PDF, ExportFormat.HTML]
            },
            isActive: true
          }],
          formats: [ExportFormat.PDF, ExportFormat.HTML],
          deliveryOptions: {
            retryAttempts: 3,
            retryDelay: 60,
            failureNotification: true,
            deliveryConfirmation: true,
            encryptAttachments: false,
            passwordProtected: false
          },
          notificationSettings: {
            onSuccess: true,
            onFailure: true,
            onScheduleChange: false,
            channels: ['email' as any],
            escalation: {
              enabled: false,
              attempts: 0,
              delayMinutes: 0,
              escalationRecipients: []
            }
          }
        },
        timezone: 'UTC',
        isActive: true,
        metadata: {
          createdBy: 'admin',
          tags: ['executive', 'monthly'],
          priority: 'high' as any,
          approvalRequired: false
        }
      };

      const scheduledReport = await reportScheduler.createScheduledReport(scheduleConfig);

      expect(scheduledReport).toBeDefined();
      expect(scheduledReport.id).toMatch(/^schedule_/);
      expect(scheduledReport.name).toBe('Monthly Executive Report');
      expect(scheduledReport.isActive).toBe(true);
      expect(scheduledReport.nextRunAt).toBeDefined();
    });

    it('should execute scheduled report immediately', async () => {
      // First create a schedule
      const scheduleConfig = {
        name: 'Test Report',
        description: 'Test execution',
        organizationId: 'org_123',
        reportType: ExecutiveReportType.EXECUTIVE_SUMMARY,
        reportPeriod: ReportPeriod.WEEKLY,
        schedule: {
          type: 'cron' as any,
          cronExpression: '0 9 * * 1', // 9 AM every Monday
          frequency: ScheduleFrequency.WEEKLY,
          time: { hour: 9, minute: 0 }
        },
        distribution: {
          channels: [DistributionChannel.EMAIL],
          recipients: [],
          formats: [ExportFormat.PDF],
          deliveryOptions: {
            retryAttempts: 1,
            retryDelay: 30,
            failureNotification: false,
            deliveryConfirmation: false,
            encryptAttachments: false,
            passwordProtected: false
          },
          notificationSettings: {
            onSuccess: false,
            onFailure: false,
            onScheduleChange: false,
            channels: [],
            escalation: {
              enabled: false,
              attempts: 0,
              delayMinutes: 0,
              escalationRecipients: []
            }
          }
        },
        timezone: 'UTC',
        isActive: true,
        metadata: {
          createdBy: 'admin',
          tags: ['test'],
          priority: 'medium' as any,
          approvalRequired: false
        }
      };

      const schedule = await reportScheduler.createScheduledReport(scheduleConfig);

      // Mock Redis for schedule storage
      mockRedis.get.mockResolvedValue(JSON.stringify(schedule));

      const execution = await reportScheduler.executeScheduleNow(schedule.id);

      expect(execution).toBeDefined();
      expect(execution.scheduleId).toBe(schedule.id);
      expect(execution.status).toBe('completed');
      expect(execution.metrics).toBeDefined();
    });

    it('should get schedule statistics', async () => {
      const stats = await reportScheduler.getScheduleStatistics('org_123', 'month');

      expect(stats).toBeDefined();
      expect(stats.totalSchedules).toBeDefined();
      expect(stats.activeSchedules).toBeDefined();
      expect(stats.totalExecutions).toBeDefined();
      expect(stats.successfulExecutions).toBeDefined();
      expect(stats.failedExecutions).toBeDefined();
      expect(stats.averageExecutionTime).toBeDefined();
    });
  });

  describe('ReportDistribution', () => {
    it('should distribute report to recipients', async () => {
      const report = await reportGenerator.generateExecutiveReport(
        'org_123',
        ExecutiveReportType.EXECUTIVE_SUMMARY,
        ReportPeriod.MONTHLY
      );

      const exports = {
        [ExportFormat.PDF]: '/tmp/report.pdf',
        [ExportFormat.HTML]: '/tmp/report.html'
      };

      const distributionConfig = {
        channels: [DistributionChannel.EMAIL],
        recipients: [{
          id: 'recipient_1',
          name: 'Test User',
          email: 'test@company.com',
          role: RecipientRole.ANALYST,
          preferences: {
            formats: [ExportFormat.PDF]
          },
          isActive: true
        }],
        formats: [ExportFormat.PDF],
        deliveryOptions: {
          retryAttempts: 3,
          retryDelay: 60,
          failureNotification: true,
          deliveryConfirmation: true,
          encryptAttachments: false,
          passwordProtected: false
        },
        notificationSettings: {
          onSuccess: true,
          onFailure: true,
          onScheduleChange: false,
          channels: ['email' as any],
          escalation: {
            enabled: false,
            attempts: 0,
            delayMinutes: 0,
            escalationRecipients: []
          }
        }
      };

      const results = await reportDistribution.distributeReport(
        report,
        exports,
        distributionConfig
      );

      expect(results).toBeDefined();
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].recipientId).toBe('recipient_1');
      expect(results[0].channel).toBe(DistributionChannel.EMAIL);
    });

    it('should send notifications', async () => {
      const notification = {
        subject: 'Test Notification',
        message: 'This is a test notification',
        recipients: ['test@company.com'],
        channels: ['email' as any]
      };

      await expect(reportDistribution.sendNotification(notification))
        .resolves.not.toThrow();
    });

    it('should get delivery analytics', async () => {
      const analytics = await reportDistribution.getDeliveryAnalytics('org_123', 'month');

      expect(analytics).toBeDefined();
      expect(analytics.totalDeliveries).toBeDefined();
      expect(analytics.successfulDeliveries).toBeDefined();
      expect(analytics.failedDeliveries).toBeDefined();
      expect(analytics.deliveryRate).toBeDefined();
      expect(analytics.channelPerformance).toBeDefined();
      expect(analytics.errorAnalysis).toBeDefined();
    });

    it('should track delivery events', async () => {
      const trackingId = 'tracking_123';

      await expect(reportDistribution.trackDeliveryEvent(
        trackingId,
        'delivered' as any,
        { timestamp: new Date() }
      )).resolves.not.toThrow();

      expect(mockRedis.setex).toHaveBeenCalled();
    });
  });

  describe('Integration Tests', () => {
    it('should complete full automated reporting workflow', async () => {
      // 1. Generate report
      const report = await reportGenerator.generateExecutiveReport(
        'org_123',
        ExecutiveReportType.EXECUTIVE_SUMMARY,
        ReportPeriod.MONTHLY
      );

      // 2. Generate executive summary
      const summary = await summaryGenerator.generateSummary(report);

      // 3. Export report
      const exports = await reportGenerator.exportReport(
        report,
        [ExportFormat.PDF, ExportFormat.HTML],
        './test-output'
      );

      // 4. Distribute report
      const distributionConfig = {
        channels: [DistributionChannel.EMAIL],
        recipients: [{
          id: 'recipient_1',
          name: 'Test Executive',
          email: 'executive@company.com',
          role: RecipientRole.CEO,
          preferences: {
            formats: [ExportFormat.PDF]
          },
          isActive: true
        }],
        formats: [ExportFormat.PDF],
        deliveryOptions: {
          retryAttempts: 3,
          retryDelay: 60,
          failureNotification: true,
          deliveryConfirmation: true,
          encryptAttachments: false,
          passwordProtected: false
        },
        notificationSettings: {
          onSuccess: true,
          onFailure: true,
          onScheduleChange: false,
          channels: ['email' as any],
          escalation: {
            enabled: false,
            attempts: 0,
            delayMinutes: 0,
            escalationRecipients: []
          }
        }
      };

      const distributionResults = await reportDistribution.distributeReport(
        report,
        exports,
        distributionConfig
      );

      // Verify complete workflow
      expect(report).toBeDefined();
      expect(summary).toBeDefined();
      expect(exports).toBeDefined();
      expect(distributionResults).toBeDefined();

      expect(report.executiveSummary.keyMetrics.length).toBeGreaterThan(0);
      expect(summary.highlights.length).toBeGreaterThan(0);
      expect(Object.keys(exports).length).toBeGreaterThan(0);
      expect(distributionResults.length).toBeGreaterThan(0);
    });

    it('should handle error scenarios gracefully', async () => {
      // Test error handling in report generation
      mockCostTracker.getCostSummary.mockRejectedValueOnce(new Error('Database error'));

      await expect(reportGenerator.generateExecutiveReport(
        'org_123',
        ExecutiveReportType.EXECUTIVE_SUMMARY,
        ReportPeriod.MONTHLY
      )).rejects.toThrow('Failed to generate executive report');
    });

    it('should validate report quality and completeness', async () => {
      const report = await reportGenerator.generateExecutiveReport(
        'org_123',
        ExecutiveReportType.EXECUTIVE_SUMMARY,
        ReportPeriod.MONTHLY
      );

      // Validate report structure
      expect(report.executiveSummary).toBeDefined();
      expect(report.executiveSummary.keyMetrics).toBeInstanceOf(Array);
      expect(report.executiveSummary.highlights).toBeInstanceOf(Array);
      expect(report.executiveSummary.recommendations).toBeInstanceOf(Array);

      // Validate metrics
      expect(report.metrics.financial).toBeDefined();
      expect(report.metrics.operational).toBeDefined();
      expect(report.metrics.performance).toBeDefined();
      expect(report.metrics.quality).toBeDefined();
      expect(report.metrics.strategic).toBeDefined();

      // Validate insights and recommendations
      expect(report.insights).toBeInstanceOf(Array);
      expect(report.recommendations).toBeInstanceOf(Array);

      // Validate metadata
      expect(report.metadata.generatedBy).toBeDefined();
      expect(report.metadata.qualityScore).toBeGreaterThan(0);
      expect(report.metadata.confidenceLevel).toBeGreaterThan(0);
    });
  });
});