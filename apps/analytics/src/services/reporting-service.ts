import { PrismaClient } from '@prisma/client';
import { Redis } from 'ioredis';
import * as cron from 'node-cron';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import * as nodemailer from 'nodemailer';
import { 
  AnalyticsReport, 
  ReportSchedule, 
  ReportFormat, 
  ReportSection,
  DashboardWidget 
} from '../types/metrics.js';
import { Logger } from '../utils/logger.js';
import { DashboardService } from './dashboard-service.js';
import { ROICalculator } from './roi-calculator.js';
import { MetricsCollector } from './metrics-collector.js';

export interface ReportTemplate {
  id: string;
  name: string;
  description: string;
  sections: ReportTemplateSection[];
  default_schedule: ReportSchedule;
  default_format: ReportFormat;
}

export interface ReportTemplateSection {
  title: string;
  description?: string;
  widget_types: string[];
  metrics: string[];
  custom_content?: string;
}

export interface GeneratedReport {
  id: string;
  report_id: string;
  generated_at: Date;
  format: ReportFormat;
  file_path?: string;
  email_sent?: boolean;
  slack_sent?: boolean;
  webhook_sent?: boolean;
  size_bytes: number;
  generation_time_ms: number;
}

export class ReportingService {
  private prisma: PrismaClient;
  private redis: Redis;
  private logger: Logger;
  private dashboardService: DashboardService;
  private roiCalculator: ROICalculator;
  private metricsCollector: MetricsCollector;
  private mailTransporter: nodemailer.Transporter;
  private scheduledJobs: Map<string, cron.ScheduledTask> = new Map();

  constructor(
    prisma: PrismaClient,
    redis: Redis,
    logger: Logger,
    dashboardService: DashboardService,
    roiCalculator: ROICalculator,
    metricsCollector: MetricsCollector,
    emailConfig: any
  ) {
    this.prisma = prisma;
    this.redis = redis;
    this.logger = logger;
    this.dashboardService = dashboardService;
    this.roiCalculator = roiCalculator;
    this.metricsCollector = metricsCollector;

    // Initialize email transporter
    this.mailTransporter = nodemailer.createTransporter(emailConfig);

    // Load and schedule existing reports
    this.initializeScheduledReports();
  }

  /**
   * Create a new analytics report
   */
  async createReport(report: Omit<AnalyticsReport, 'id' | 'last_generated' | 'next_generation'>): Promise<AnalyticsReport> {
    const fullReport: AnalyticsReport = {
      id: this.generateReportId(),
      last_generated: null,
      next_generation: this.calculateNextGeneration(report.schedule),
      ...report
    };

    // Store report configuration
    await this.redis.hset(
      'analytics:reports',
      fullReport.id,
      JSON.stringify(fullReport)
    );

    // Schedule the report
    await this.scheduleReport(fullReport);

    this.logger.info('Analytics report created', {
      report_id: fullReport.id,
      name: fullReport.name,
      schedule: fullReport.schedule
    });

    return fullReport;
  }

  /**
   * Generate report immediately
   */
  async generateReport(reportId: string): Promise<GeneratedReport> {
    const startTime = Date.now();
    
    const report = await this.getReport(reportId);
    if (!report) {
      throw new Error(`Report ${reportId} not found`);
    }

    this.logger.info('Starting report generation', { 
      report_id: reportId, 
      name: report.name 
    });

    try {
      const generatedReport: GeneratedReport = {
        id: this.generateGeneratedReportId(),
        report_id: reportId,
        generated_at: new Date(),
        format: report.format,
        size_bytes: 0,
        generation_time_ms: 0
      };

      // Generate report content based on format
      switch (report.format) {
        case ReportFormat.PDF:
          await this.generatePDFReport(report, generatedReport);
          break;
        
        case ReportFormat.EMAIL:
          await this.generateEmailReport(report, generatedReport);
          break;
        
        case ReportFormat.SLACK:
          await this.generateSlackReport(report, generatedReport);
          break;
        
        case ReportFormat.WEBHOOK:
          await this.generateWebhookReport(report, generatedReport);
          break;
      }

      generatedReport.generation_time_ms = Date.now() - startTime;

      // Update report last generated time
      report.last_generated = new Date();
      report.next_generation = this.calculateNextGeneration(report.schedule);
      
      await this.redis.hset(
        'analytics:reports',
        reportId,
        JSON.stringify(report)
      );

      // Store generated report record
      await this.redis.lpush(
        `report:generated:${reportId}`,
        JSON.stringify(generatedReport)
      );

      // Keep only last 10 generated reports
      await this.redis.ltrim(`report:generated:${reportId}`, 0, 9);

      this.logger.info('Report generated successfully', {
        report_id: reportId,
        generated_report_id: generatedReport.id,
        generation_time_ms: generatedReport.generation_time_ms,
        size_bytes: generatedReport.size_bytes
      });

      return generatedReport;
    } catch (error) {
      this.logger.error('Failed to generate report', {
        report_id: reportId,
        error
      });
      throw error;
    }
  }

  /**
   * Generate PDF report
   */
  private async generatePDFReport(
    report: AnalyticsReport, 
    generatedReport: GeneratedReport
  ): Promise<void> {
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    // Add title page
    let page = pdfDoc.addPage([612, 792]); // Letter size
    let yPosition = 750;

    page.drawText(report.name, {
      x: 50,
      y: yPosition,
      size: 24,
      font: boldFont,
      color: rgb(0, 0, 0)
    });

    yPosition -= 40;
    page.drawText(`Generated: ${new Date().toLocaleDateString()}`, {
      x: 50,
      y: yPosition,
      size: 12,
      font: font,
      color: rgb(0.5, 0.5, 0.5)
    });

    yPosition -= 60;

    // Add report description
    if (report.description) {
      page.drawText(report.description, {
        x: 50,
        y: yPosition,
        size: 12,
        font: font,
        color: rgb(0, 0, 0)
      });
      yPosition -= 40;
    }

    // Process each section
    for (const section of report.sections) {
      if (yPosition < 100) {
        page = pdfDoc.addPage([612, 792]);
        yPosition = 750;
      }

      // Section title
      page.drawText(section.title, {
        x: 50,
        y: yPosition,
        size: 18,
        font: boldFont,
        color: rgb(0, 0, 0)
      });
      yPosition -= 30;

      // Section description
      if (section.description) {
        page.drawText(section.description, {
          x: 50,
          y: yPosition,
          size: 10,
          font: font,
          color: rgb(0.3, 0.3, 0.3)
        });
        yPosition -= 25;
      }

      // Add widget data
      for (const widgetId of section.widget_ids) {
        const widgetData = await this.getWidgetSummaryForReport(widgetId);
        if (widgetData) {
          page.drawText(`${widgetData.title}: ${widgetData.summary}`, {
            x: 70,
            y: yPosition,
            size: 10,
            font: font,
            color: rgb(0, 0, 0)
          });
          yPosition -= 20;
        }
      }

      // Add custom content
      if (section.custom_content) {
        const lines = section.custom_content.split('\n');
        for (const line of lines) {
          if (yPosition < 50) {
            page = pdfDoc.addPage([612, 792]);
            yPosition = 750;
          }
          page.drawText(line, {
            x: 70,
            y: yPosition,
            size: 10,
            font: font,
            color: rgb(0, 0, 0)
          });
          yPosition -= 15;
        }
      }

      yPosition -= 30;
    }

    // Add ROI summary if requested
    if (this.shouldIncludeROI(report)) {
      const roiData = await this.getROISummaryForReport();
      if (roiData) {
        if (yPosition < 150) {
          page = pdfDoc.addPage([612, 792]);
          yPosition = 750;
        }

        page.drawText('ROI Summary', {
          x: 50,
          y: yPosition,
          size: 18,
          font: boldFont,
          color: rgb(0, 0, 0)
        });
        yPosition -= 30;

        page.drawText(`ROI: ${roiData.roi_percent.toFixed(2)}%`, {
          x: 70,
          y: yPosition,
          size: 12,
          font: font,
          color: rgb(0, 0, 0)
        });
        yPosition -= 20;

        page.drawText(`Total Cost: $${(roiData.total_cost_cents / 100).toFixed(2)}`, {
          x: 70,
          y: yPosition,
          size: 12,
          font: font,
          color: rgb(0, 0, 0)
        });
        yPosition -= 20;

        page.drawText(`Cost Savings: $${(roiData.cost_savings_cents / 100).toFixed(2)}`, {
          x: 70,
          y: yPosition,
          size: 12,
          font: font,
          color: rgb(0, 0, 0)
        });
      }
    }

    // Save PDF
    const pdfBytes = await pdfDoc.save();
    const filePath = `/tmp/report_${generatedReport.id}.pdf`;
    
    // In production, you'd save to persistent storage
    require('fs').writeFileSync(filePath, pdfBytes);
    
    generatedReport.file_path = filePath;
    generatedReport.size_bytes = pdfBytes.length;

    // Send via email if recipients specified
    if (report.recipients.length > 0) {
      await this.sendPDFReport(report, generatedReport, pdfBytes);
    }
  }

  /**
   * Generate email report
   */
  private async generateEmailReport(
    report: AnalyticsReport, 
    generatedReport: GeneratedReport
  ): Promise<void> {
    const emailContent = await this.generateEmailContent(report);
    
    for (const recipient of report.recipients) {
      const mailOptions = {
        from: process.env.ANALYTICS_EMAIL_FROM || 'analytics@urnlabs.ai',
        to: recipient,
        subject: `Analytics Report: ${report.name}`,
        html: emailContent,
        attachments: await this.generateEmailAttachments(report)
      };

      await this.mailTransporter.sendMail(mailOptions);
    }

    generatedReport.email_sent = true;
    generatedReport.size_bytes = emailContent.length;
  }

  /**
   * Generate Slack report
   */
  private async generateSlackReport(
    report: AnalyticsReport, 
    generatedReport: GeneratedReport
  ): Promise<void> {
    const slackContent = await this.generateSlackContent(report);
    
    // Send to Slack webhook
    const webhookUrl = process.env.SLACK_WEBHOOK_URL;
    if (webhookUrl) {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(slackContent)
      });

      generatedReport.slack_sent = response.ok;
      generatedReport.size_bytes = JSON.stringify(slackContent).length;
    }
  }

  /**
   * Generate webhook report
   */
  private async generateWebhookReport(
    report: AnalyticsReport, 
    generatedReport: GeneratedReport
  ): Promise<void> {
    const webhookData = await this.generateWebhookData(report);
    
    const webhookUrl = process.env.ANALYTICS_WEBHOOK_URL;
    if (webhookUrl) {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(webhookData)
      });

      generatedReport.webhook_sent = response.ok;
      generatedReport.size_bytes = JSON.stringify(webhookData).length;
    }
  }

  /**
   * Schedule report generation
   */
  private async scheduleReport(report: AnalyticsReport): Promise<void> {
    const cronExpression = this.getCronExpression(report.schedule);
    
    const task = cron.schedule(cronExpression, async () => {
      try {
        await this.generateReport(report.id);
      } catch (error) {
        this.logger.error('Scheduled report generation failed', {
          report_id: report.id,
          error
        });
      }
    }, {
      scheduled: true,
      timezone: 'UTC'
    });

    this.scheduledJobs.set(report.id, task);
    
    this.logger.info('Report scheduled', {
      report_id: report.id,
      schedule: report.schedule,
      cron_expression: cronExpression
    });
  }

  /**
   * Get report by ID
   */
  private async getReport(reportId: string): Promise<AnalyticsReport | null> {
    const reportData = await this.redis.hget('analytics:reports', reportId);
    return reportData ? JSON.parse(reportData) : null;
  }

  /**
   * Helper methods
   */
  private async initializeScheduledReports(): Promise<void> {
    const reportIds = await this.redis.hkeys('analytics:reports');
    
    for (const reportId of reportIds) {
      const report = await this.getReport(reportId);
      if (report) {
        await this.scheduleReport(report);
      }
    }
  }

  private getCronExpression(schedule: ReportSchedule): string {
    switch (schedule) {
      case ReportSchedule.HOURLY:
        return '0 * * * *';
      case ReportSchedule.DAILY:
        return '0 9 * * *'; // 9 AM daily
      case ReportSchedule.WEEKLY:
        return '0 9 * * 1'; // 9 AM on Mondays
      case ReportSchedule.MONTHLY:
        return '0 9 1 * *'; // 9 AM on 1st of month
      case ReportSchedule.QUARTERLY:
        return '0 9 1 */3 *'; // 9 AM on 1st of every 3rd month
      default:
        return '0 9 * * *'; // Default to daily
    }
  }

  private calculateNextGeneration(schedule: ReportSchedule): Date {
    const now = new Date();
    const next = new Date(now);

    switch (schedule) {
      case ReportSchedule.HOURLY:
        next.setHours(next.getHours() + 1);
        break;
      case ReportSchedule.DAILY:
        next.setDate(next.getDate() + 1);
        next.setHours(9, 0, 0, 0);
        break;
      case ReportSchedule.WEEKLY:
        next.setDate(next.getDate() + (7 - next.getDay() + 1) % 7 || 7);
        next.setHours(9, 0, 0, 0);
        break;
      case ReportSchedule.MONTHLY:
        next.setMonth(next.getMonth() + 1, 1);
        next.setHours(9, 0, 0, 0);
        break;
      case ReportSchedule.QUARTERLY:
        next.setMonth(next.getMonth() + 3, 1);
        next.setHours(9, 0, 0, 0);
        break;
    }

    return next;
  }

  private async getWidgetSummaryForReport(widgetId: string): Promise<any> {
    const widget = await this.dashboardService.getWidget(widgetId);
    if (!widget) return null;

    const data = await this.dashboardService.getWidgetData(widgetId);
    
    // Generate summary based on widget type
    let summary = '';
    switch (widget.type) {
      case 'counter':
        summary = `${data.value} ${data.unit || ''}`;
        break;
      case 'gauge':
        summary = `${data.value}/${data.max} ${data.unit || ''}`;
        break;
      default:
        summary = `Latest value: ${data.value || 'N/A'}`;
    }

    return {
      title: widget.title,
      summary,
      type: widget.type
    };
  }

  private async getROISummaryForReport(): Promise<any> {
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000); // Last 30 days
    
    return await this.roiCalculator.calculateROI(startDate, endDate);
  }

  private shouldIncludeROI(report: AnalyticsReport): boolean {
    return report.sections.some(section => 
      section.widget_ids.some(id => id.includes('roi')) ||
      section.title.toLowerCase().includes('roi')
    );
  }

  private async generateEmailContent(report: AnalyticsReport): Promise<string> {
    let html = `
      <html>
        <head>
          <title>${report.name}</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; }
            h1 { color: #333; }
            h2 { color: #666; border-bottom: 1px solid #ddd; }
            .section { margin: 20px 0; }
            .metric { margin: 10px 0; padding: 10px; background: #f5f5f5; }
          </style>
        </head>
        <body>
          <h1>${report.name}</h1>
          <p><strong>Generated:</strong> ${new Date().toLocaleString()}</p>
          <p>${report.description}</p>
    `;

    for (const section of report.sections) {
      html += `<div class="section"><h2>${section.title}</h2>`;
      
      if (section.description) {
        html += `<p>${section.description}</p>`;
      }

      for (const widgetId of section.widget_ids) {
        const widgetSummary = await this.getWidgetSummaryForReport(widgetId);
        if (widgetSummary) {
          html += `<div class="metric"><strong>${widgetSummary.title}:</strong> ${widgetSummary.summary}</div>`;
        }
      }

      if (section.custom_content) {
        html += `<div>${section.custom_content.replace(/\n/g, '<br>')}</div>`;
      }

      html += '</div>';
    }

    html += '</body></html>';
    return html;
  }

  private async generateSlackContent(report: AnalyticsReport): Promise<any> {
    const blocks = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: report.name
        }
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Generated:* ${new Date().toLocaleString()}\n${report.description}`
        }
      }
    ];

    for (const section of report.sections) {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*${section.title}*\n${section.description || ''}`
        }
      });

      for (const widgetId of section.widget_ids) {
        const widgetSummary = await this.getWidgetSummaryForReport(widgetId);
        if (widgetSummary) {
          blocks.push({
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `• *${widgetSummary.title}:* ${widgetSummary.summary}`
            }
          });
        }
      }
    }

    return { blocks };
  }

  private async generateWebhookData(report: AnalyticsReport): Promise<any> {
    const data = {
      report_id: report.id,
      name: report.name,
      description: report.description,
      generated_at: new Date().toISOString(),
      sections: []
    };

    for (const section of report.sections) {
      const sectionData = {
        title: section.title,
        description: section.description,
        widgets: []
      };

      for (const widgetId of section.widget_ids) {
        const widgetData = await this.dashboardService.getWidgetData(widgetId);
        if (widgetData) {
          sectionData.widgets.push(widgetData);
        }
      }

      data.sections.push(sectionData);
    }

    return data;
  }

  private async generateEmailAttachments(report: AnalyticsReport): Promise<any[]> {
    const attachments = [];

    // Add chart images as attachments
    for (const section of report.sections) {
      for (const widgetId of section.widget_ids) {
        try {
          const imageBuffer = await this.dashboardService.renderWidgetImage(widgetId);
          const widget = await this.dashboardService.getWidget(widgetId);
          
          if (widget && imageBuffer.length > 0) {
            attachments.push({
              filename: `${widget.title.replace(/[^a-zA-Z0-9]/g, '_')}.png`,
              content: imageBuffer,
              contentType: 'image/png'
            });
          }
        } catch (error) {
          this.logger.warn('Failed to generate widget image for email', {
            widget_id: widgetId,
            error
          });
        }
      }
    }

    return attachments;
  }

  private async sendPDFReport(
    report: AnalyticsReport, 
    generatedReport: GeneratedReport, 
    pdfBytes: Uint8Array
  ): Promise<void> {
    for (const recipient of report.recipients) {
      const mailOptions = {
        from: process.env.ANALYTICS_EMAIL_FROM || 'analytics@urnlabs.ai',
        to: recipient,
        subject: `Analytics Report: ${report.name}`,
        text: `Please find attached the analytics report: ${report.name}`,
        attachments: [{
          filename: `${report.name.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`,
          content: Buffer.from(pdfBytes),
          contentType: 'application/pdf'
        }]
      };

      await this.mailTransporter.sendMail(mailOptions);
    }

    generatedReport.email_sent = true;
  }

  private generateReportId(): string {
    return `report_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateGeneratedReportId(): string {
    return `gen_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Cleanup method
   */
  destroy(): void {
    for (const [reportId, task] of this.scheduledJobs) {
      task.destroy();
    }
    this.scheduledJobs.clear();
  }
}