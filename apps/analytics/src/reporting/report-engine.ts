import * as cron from 'node-cron';
import * as ExcelJS from 'exceljs';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import * as nodemailer from 'nodemailer';
import { Redis } from 'ioredis';
import { Logger } from '../utils/logger.js';
import { ClickHouseService } from '../streaming/clickhouse-service.js';
import { PredictiveAnalyticsService } from '../ml/predictive-analytics.js';

export interface ReportTemplate {
  id: string;
  name: string;
  description?: string;
  type: 'performance' | 'financial' | 'operational' | 'executive' | 'custom';
  format: 'pdf' | 'excel' | 'csv' | 'json' | 'html';
  schedule: string; // cron expression
  queries: ReportQuery[];
  visualizations: ReportVisualization[];
  recipients: string[];
  filters?: Record<string, any>;
  timeRange: { relative: string } | { start: Date; end: Date };
  active: boolean;
  created_at: Date;
  last_generated?: Date;
}

export interface ReportQuery {
  id: string;
  name: string;
  sql: string;
  parameters?: Record<string, any>;
  cache_duration?: number; // seconds
}

export interface ReportVisualization {
  id: string;
  name: string;
  type: 'table' | 'chart' | 'metric' | 'gauge' | 'text';
  query_id: string;
  config: {
    chartType?: 'line' | 'bar' | 'pie' | 'area' | 'scatter';
    xAxis?: string;
    yAxis?: string;
    groupBy?: string;
    aggregation?: string;
    colors?: string[];
    title?: string;
    description?: string;
  };
}

export interface GeneratedReport {
  id: string;
  template_id: string;
  name: string;
  format: string;
  generated_at: Date;
  file_path: string;
  file_size: number;
  metadata: {
    record_count: number;
    query_execution_time: number;
    generation_time: number;
    filters_applied: Record<string, any>;
    time_range: { start: Date; end: Date };
  };
}

export interface ReportSchedule {
  template_id: string;
  cron_expression: string;
  next_run: Date;
  last_run?: Date;
  active: boolean;
  task?: cron.ScheduledTask;
}

export class ReportEngineService {
  private redis: Redis;
  private clickHouse: ClickHouseService;
  private predictiveAnalytics: PredictiveAnalyticsService;
  private logger: Logger;
  private emailTransporter: nodemailer.Transporter;
  private templates: Map<string, ReportTemplate> = new Map();
  private schedules: Map<string, ReportSchedule> = new Map();
  private reportsPath: string;

  constructor(
    redis: Redis,
    clickHouse: ClickHouseService,
    predictiveAnalytics: PredictiveAnalyticsService,
    logger: Logger,
    emailConfig: any
  ) {
    this.redis = redis;
    this.clickHouse = clickHouse;
    this.predictiveAnalytics = predictiveAnalytics;
    this.logger = logger;
    this.reportsPath = process.env.REPORTS_PATH || '/tmp/reports';

    // Initialize email transporter
    this.emailTransporter = nodemailer.createTransporter(emailConfig);

    this.loadTemplates();
    this.initializeSchedules();
    this.createDefaultTemplates();
  }

  /**
   * Create a new report template
   */
  async createTemplate(template: Omit<ReportTemplate, 'id' | 'created_at'>): Promise<ReportTemplate> {
    const fullTemplate: ReportTemplate = {
      ...template,
      id: this.generateId(),
      created_at: new Date()
    };

    this.templates.set(fullTemplate.id, fullTemplate);
    await this.saveTemplate(fullTemplate);

    if (fullTemplate.active) {
      await this.scheduleReport(fullTemplate.id, fullTemplate.schedule);
    }

    this.logger.info('Report template created', { 
      templateId: fullTemplate.id, 
      name: fullTemplate.name 
    });

    return fullTemplate;
  }

  /**
   * Generate a report from template
   */
  async generateReport(templateId: string, customFilters?: Record<string, any>): Promise<GeneratedReport> {
    const template = this.templates.get(templateId);
    if (!template) {
      throw new Error(`Template ${templateId} not found`);
    }

    const startTime = Date.now();
    this.logger.info('Starting report generation', { templateId, name: template.name });

    try {
      // Resolve time range
      const timeRange = this.resolveTimeRange(template.timeRange);
      
      // Apply filters
      const filters = { ...template.filters, ...customFilters };

      // Execute queries
      const queryResults = new Map<string, any[]>();
      let totalRecords = 0;
      
      for (const query of template.queries) {
        const result = await this.executeQuery(query, timeRange, filters);
        queryResults.set(query.id, result);
        totalRecords += result.length;
      }

      // Generate report file
      const report = await this.generateReportFile(template, queryResults, timeRange, filters);
      
      const generationTime = Date.now() - startTime;
      
      const generatedReport: GeneratedReport = {
        id: this.generateId(),
        template_id: templateId,
        name: `${template.name}_${new Date().toISOString().split('T')[0]}`,
        format: template.format,
        generated_at: new Date(),
        file_path: report.filePath,
        file_size: report.fileSize,
        metadata: {
          record_count: totalRecords,
          query_execution_time: report.queryTime,
          generation_time: generationTime,
          filters_applied: filters,
          time_range: timeRange
        }
      };

      // Save report metadata
      await this.saveGeneratedReport(generatedReport);

      // Send to recipients if configured
      if (template.recipients.length > 0) {
        await this.sendReport(generatedReport, template.recipients);
      }

      // Update template last generated time
      template.last_generated = new Date();
      await this.saveTemplate(template);

      this.logger.info('Report generated successfully', {
        templateId,
        reportId: generatedReport.id,
        generationTime,
        fileSize: report.fileSize,
        recordCount: totalRecords
      });

      return generatedReport;

    } catch (error) {
      this.logger.error('Failed to generate report', { error, templateId });
      throw error;
    }
  }

  /**
   * Schedule a report for automatic generation
   */
  async scheduleReport(templateId: string, cronExpression: string): Promise<void> {
    const template = this.templates.get(templateId);
    if (!template) {
      throw new Error(`Template ${templateId} not found`);
    }

    // Cancel existing schedule if any
    const existingSchedule = this.schedules.get(templateId);
    if (existingSchedule?.task) {
      existingSchedule.task.stop();
    }

    // Create new schedule
    const task = cron.schedule(cronExpression, async () => {
      try {
        await this.generateReport(templateId);
      } catch (error) {
        this.logger.error('Scheduled report generation failed', { 
          error, 
          templateId, 
          cronExpression 
        });
      }
    }, {
      scheduled: false,
      timezone: process.env.TIMEZONE || 'UTC'
    });

    const schedule: ReportSchedule = {
      template_id: templateId,
      cron_expression: cronExpression,
      next_run: this.getNextCronExecution(cronExpression),
      active: true,
      task
    };

    this.schedules.set(templateId, schedule);
    task.start();

    this.logger.info('Report scheduled', { 
      templateId, 
      cronExpression, 
      nextRun: schedule.next_run 
    });
  }

  /**
   * Generate interactive dashboard report
   */
  async generateDashboardReport(config: {
    title: string;
    widgets: Array<{
      title: string;
      query: string;
      visualization: ReportVisualization;
    }>;
    timeRange: { start: Date; end: Date };
    format: 'html' | 'pdf';
  }): Promise<{ filePath: string; fileSize: number }> {
    const startTime = Date.now();
    
    // Execute all widget queries
    const widgetData = [];
    for (const widget of config.widgets) {
      const data = await this.clickHouse.query(
        this.replacePlaceholders(widget.query, config.timeRange)
      );
      widgetData.push({
        ...widget,
        data
      });
    }

    if (config.format === 'html') {
      return await this.generateHTMLDashboard(config, widgetData);
    } else {
      return await this.generatePDFDashboard(config, widgetData);
    }
  }

  /**
   * Execute report query with filters
   */
  private async executeQuery(
    query: ReportQuery, 
    timeRange: { start: Date; end: Date }, 
    filters: Record<string, any>
  ): Promise<any[]> {
    let sql = query.sql;

    // Replace time range placeholders
    sql = this.replacePlaceholders(sql, timeRange);

    // Apply filters
    if (Object.keys(filters).length > 0) {
      const filterConditions = Object.entries(filters)
        .map(([field, value]) => {
          if (Array.isArray(value)) {
            return `${field} IN (${value.map(v => `'${v}'`).join(', ')})`;
          }
          return `${field} = '${value}'`;
        })
        .join(' AND ');

      if (sql.toLowerCase().includes('where')) {
        sql += ` AND ${filterConditions}`;
      } else {
        sql += ` WHERE ${filterConditions}`;
      }
    }

    // Apply parameters
    if (query.parameters) {
      for (const [param, value] of Object.entries(query.parameters)) {
        sql = sql.replace(new RegExp(`{${param}}`, 'g'), String(value));
      }
    }

    return await this.clickHouse.query(sql);
  }

  /**
   * Generate report file based on format
   */
  private async generateReportFile(
    template: ReportTemplate,
    queryResults: Map<string, any[]>,
    timeRange: { start: Date; end: Date },
    filters: Record<string, any>
  ): Promise<{ filePath: string; fileSize: number; queryTime: number }> {
    const queryTime = 0; // Would be tracked during query execution
    
    switch (template.format) {
      case 'excel':
        return await this.generateExcelReport(template, queryResults, timeRange);
      case 'pdf':
        return await this.generatePDFReport(template, queryResults, timeRange);
      case 'csv':
        return await this.generateCSVReport(template, queryResults);
      case 'json':
        return await this.generateJSONReport(template, queryResults, timeRange, filters);
      case 'html':
        return await this.generateHTMLReport(template, queryResults, timeRange);
      default:
        throw new Error(`Unsupported report format: ${template.format}`);
    }
  }

  /**
   * Generate Excel report
   */
  private async generateExcelReport(
    template: ReportTemplate,
    queryResults: Map<string, any[]>,
    timeRange: { start: Date; end: Date }
  ): Promise<{ filePath: string; fileSize: number; queryTime: number }> {
    const workbook = new ExcelJS.Workbook();
    
    // Add metadata sheet
    const metaSheet = workbook.addWorksheet('Report Info');
    metaSheet.addRow(['Report Name', template.name]);
    metaSheet.addRow(['Generated At', new Date().toISOString()]);
    metaSheet.addRow(['Time Range', `${timeRange.start.toISOString()} to ${timeRange.end.toISOString()}`]);
    
    // Add data sheets
    for (const [queryId, data] of queryResults.entries()) {
      const query = template.queries.find(q => q.id === queryId);
      const sheetName = query?.name || queryId;
      
      const sheet = workbook.addWorksheet(sheetName);
      
      if (data.length > 0) {
        // Add headers
        const headers = Object.keys(data[0]);
        sheet.addRow(headers);
        
        // Add data
        data.forEach(row => {
          sheet.addRow(headers.map(h => row[h]));
        });
        
        // Auto-fit columns
        sheet.columns.forEach(column => {
          column.width = 15;
        });
        
        // Style headers
        const headerRow = sheet.getRow(1);
        headerRow.font = { bold: true };
        headerRow.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFE0E0E0' }
        };
      }
    }

    const fileName = `${template.name.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}.xlsx`;
    const filePath = `${this.reportsPath}/${fileName}`;
    
    await workbook.xlsx.writeFile(filePath);
    
    // Get file size
    const fs = await import('fs');
    const stats = await fs.promises.stat(filePath);
    
    return {
      filePath,
      fileSize: stats.size,
      queryTime: 0
    };
  }

  /**
   * Generate PDF report
   */
  private async generatePDFReport(
    template: ReportTemplate,
    queryResults: Map<string, any[]>,
    timeRange: { start: Date; end: Date }
  ): Promise<{ filePath: string; fileSize: number; queryTime: number }> {
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    
    let page = pdfDoc.addPage([595, 842]); // A4 size
    let yPosition = 800;
    
    // Title
    page.drawText(template.name, {
      x: 50,
      y: yPosition,
      size: 20,
      font: boldFont,
      color: rgb(0, 0, 0)
    });
    yPosition -= 30;
    
    // Metadata
    page.drawText(`Generated: ${new Date().toISOString()}`, {
      x: 50,
      y: yPosition,
      size: 10,
      font,
      color: rgb(0.5, 0.5, 0.5)
    });
    yPosition -= 15;
    
    page.drawText(`Period: ${timeRange.start.toISOString()} to ${timeRange.end.toISOString()}`, {
      x: 50,
      y: yPosition,
      size: 10,
      font,
      color: rgb(0.5, 0.5, 0.5)
    });
    yPosition -= 40;
    
    // Add data sections
    for (const [queryId, data] of queryResults.entries()) {
      const query = template.queries.find(q => q.id === queryId);
      
      // Section title
      page.drawText(query?.name || queryId, {
        x: 50,
        y: yPosition,
        size: 14,
        font: boldFont,
        color: rgb(0, 0, 0)
      });
      yPosition -= 25;
      
      // Summary stats
      page.drawText(`Records: ${data.length}`, {
        x: 50,
        y: yPosition,
        size: 10,
        font,
        color: rgb(0, 0, 0)
      });
      yPosition -= 30;
      
      // Check if new page needed
      if (yPosition < 100) {
        page = pdfDoc.addPage([595, 842]);
        yPosition = 800;
      }
    }

    const fileName = `${template.name.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}.pdf`;
    const filePath = `${this.reportsPath}/${fileName}`;
    
    const pdfBytes = await pdfDoc.save();
    const fs = await import('fs');
    await fs.promises.writeFile(filePath, pdfBytes);
    
    return {
      filePath,
      fileSize: pdfBytes.length,
      queryTime: 0
    };
  }

  /**
   * Generate CSV report
   */
  private async generateCSVReport(
    template: ReportTemplate,
    queryResults: Map<string, any[]>
  ): Promise<{ filePath: string; fileSize: number; queryTime: number }> {
    const fs = await import('fs');
    const fileName = `${template.name.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}.csv`;
    const filePath = `${this.reportsPath}/${fileName}`;
    
    let csvContent = '';
    
    for (const [queryId, data] of queryResults.entries()) {
      const query = template.queries.find(q => q.id === queryId);
      
      csvContent += `\n# ${query?.name || queryId}\n`;
      
      if (data.length > 0) {
        // Headers
        const headers = Object.keys(data[0]);
        csvContent += headers.join(',') + '\n';
        
        // Data
        data.forEach(row => {
          const values = headers.map(h => {
            const value = row[h];
            if (typeof value === 'string' && value.includes(',')) {
              return `"${value.replace(/"/g, '""')}"`;
            }
            return String(value || '');
          });
          csvContent += values.join(',') + '\n';
        });
      }
      csvContent += '\n';
    }
    
    await fs.promises.writeFile(filePath, csvContent);
    const stats = await fs.promises.stat(filePath);
    
    return {
      filePath,
      fileSize: stats.size,
      queryTime: 0
    };
  }

  /**
   * Generate JSON report
   */
  private async generateJSONReport(
    template: ReportTemplate,
    queryResults: Map<string, any[]>,
    timeRange: { start: Date; end: Date },
    filters: Record<string, any>
  ): Promise<{ filePath: string; fileSize: number; queryTime: number }> {
    const reportData = {
      metadata: {
        name: template.name,
        generated_at: new Date().toISOString(),
        time_range: timeRange,
        filters,
        total_records: Array.from(queryResults.values()).reduce((sum, data) => sum + data.length, 0)
      },
      data: Object.fromEntries(queryResults)
    };
    
    const fileName = `${template.name.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}.json`;
    const filePath = `${this.reportsPath}/${fileName}`;
    
    const jsonContent = JSON.stringify(reportData, null, 2);
    const fs = await import('fs');
    await fs.promises.writeFile(filePath, jsonContent);
    
    return {
      filePath,
      fileSize: Buffer.byteLength(jsonContent),
      queryTime: 0
    };
  }

  /**
   * Generate HTML report
   */
  private async generateHTMLReport(
    template: ReportTemplate,
    queryResults: Map<string, any[]>,
    timeRange: { start: Date; end: Date }
  ): Promise<{ filePath: string; fileSize: number; queryTime: number }> {
    let htmlContent = `
<!DOCTYPE html>
<html>
<head>
    <title>${template.name}</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        h1 { color: #333; }
        h2 { color: #666; border-bottom: 1px solid #ccc; }
        table { border-collapse: collapse; width: 100%; margin: 20px 0; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        th { background-color: #f5f5f5; font-weight: bold; }
        .metadata { background-color: #f9f9f9; padding: 10px; border-radius: 5px; }
    </style>
</head>
<body>
    <h1>${template.name}</h1>
    
    <div class="metadata">
        <p><strong>Generated:</strong> ${new Date().toISOString()}</p>
        <p><strong>Period:</strong> ${timeRange.start.toISOString()} to ${timeRange.end.toISOString()}</p>
        <p><strong>Total Records:</strong> ${Array.from(queryResults.values()).reduce((sum, data) => sum + data.length, 0)}</p>
    </div>
`;

    for (const [queryId, data] of queryResults.entries()) {
      const query = template.queries.find(q => q.id === queryId);
      
      htmlContent += `
    <h2>${query?.name || queryId}</h2>
    <p>Records: ${data.length}</p>
`;

      if (data.length > 0) {
        htmlContent += `
    <table>
        <thead>
            <tr>
`;
        const headers = Object.keys(data[0]);
        headers.forEach(header => {
          htmlContent += `                <th>${header}</th>\n`;
        });
        
        htmlContent += `
            </tr>
        </thead>
        <tbody>
`;
        
        data.slice(0, 100).forEach(row => { // Limit to first 100 rows
          htmlContent += `            <tr>\n`;
          headers.forEach(header => {
            htmlContent += `                <td>${row[header] || ''}</td>\n`;
          });
          htmlContent += `            </tr>\n`;
        });
        
        if (data.length > 100) {
          htmlContent += `            <tr><td colspan="${headers.length}"><em>... and ${data.length - 100} more rows</em></td></tr>\n`;
        }
        
        htmlContent += `
        </tbody>
    </table>
`;
      }
    }

    htmlContent += `
</body>
</html>
`;

    const fileName = `${template.name.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}.html`;
    const filePath = `${this.reportsPath}/${fileName}`;
    
    const fs = await import('fs');
    await fs.promises.writeFile(filePath, htmlContent);
    
    return {
      filePath,
      fileSize: Buffer.byteLength(htmlContent),
      queryTime: 0
    };
  }

  /**
   * Send report via email
   */
  private async sendReport(report: GeneratedReport, recipients: string[]): Promise<void> {
    const fs = await import('fs');
    
    try {
      const mailOptions = {
        from: process.env.EMAIL_FROM || 'reports@urnlabs.ai',
        to: recipients.join(', '),
        subject: `Report: ${report.name}`,
        html: `
          <h2>${report.name}</h2>
          <p>Report generated on ${report.generated_at.toISOString()}</p>
          <p>Records: ${report.metadata.record_count}</p>
          <p>Time Range: ${report.metadata.time_range.start.toISOString()} to ${report.metadata.time_range.end.toISOString()}</p>
          <p>Please find the report attached.</p>
        `,
        attachments: [{
          filename: `${report.name}.${report.format}`,
          path: report.file_path
        }]
      };

      await this.emailTransporter.sendMail(mailOptions);
      
      this.logger.info('Report sent via email', { 
        reportId: report.id, 
        recipients: recipients.length 
      });

    } catch (error) {
      this.logger.error('Failed to send report via email', { 
        error, 
        reportId: report.id 
      });
      throw error;
    }
  }

  /**
   * Utility methods
   */
  private resolveTimeRange(timeRange: ReportTemplate['timeRange']): { start: Date; end: Date } {
    if ('relative' in timeRange) {
      const now = new Date();
      const match = timeRange.relative.match(/^(\d+)([smhd])$/);
      
      if (!match) {
        throw new Error(`Invalid relative time range: ${timeRange.relative}`);
      }

      const value = parseInt(match[1]);
      const unit = match[2];
      
      let milliseconds = 0;
      switch (unit) {
        case 's': milliseconds = value * 1000; break;
        case 'm': milliseconds = value * 60 * 1000; break;
        case 'h': milliseconds = value * 60 * 60 * 1000; break;
        case 'd': milliseconds = value * 24 * 60 * 60 * 1000; break;
      }

      return {
        start: new Date(now.getTime() - milliseconds),
        end: now
      };
    }

    return timeRange;
  }

  private replacePlaceholders(sql: string, timeRange: { start: Date; end: Date }): string {
    return sql
      .replace(/{START_TIME}/g, `'${timeRange.start.toISOString()}'`)
      .replace(/{END_TIME}/g, `'${timeRange.end.toISOString()}'`);
  }

  private generateId(): string {
    return `report_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private getNextCronExecution(cronExpression: string): Date {
    // Simplified - in production, use a proper cron parser
    return new Date(Date.now() + 24 * 60 * 60 * 1000); // Tomorrow
  }

  private async generateHTMLDashboard(config: any, widgetData: any[]): Promise<{ filePath: string; fileSize: number }> {
    // Simplified implementation
    const fileName = `dashboard_${Date.now()}.html`;
    const filePath = `${this.reportsPath}/${fileName}`;
    const content = `<html><body><h1>${config.title}</h1></body></html>`;
    
    const fs = await import('fs');
    await fs.promises.writeFile(filePath, content);
    
    return {
      filePath,
      fileSize: Buffer.byteLength(content)
    };
  }

  private async generatePDFDashboard(config: any, widgetData: any[]): Promise<{ filePath: string; fileSize: number }> {
    // Simplified implementation
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage();
    
    const fileName = `dashboard_${Date.now()}.pdf`;
    const filePath = `${this.reportsPath}/${fileName}`;
    
    const pdfBytes = await pdfDoc.save();
    const fs = await import('fs');
    await fs.promises.writeFile(filePath, pdfBytes);
    
    return {
      filePath,
      fileSize: pdfBytes.length
    };
  }

  private async loadTemplates(): Promise<void> {
    // Load from Redis
  }

  private async saveTemplate(template: ReportTemplate): Promise<void> {
    await this.redis.set(`report_template:${template.id}`, JSON.stringify(template));
  }

  private async saveGeneratedReport(report: GeneratedReport): Promise<void> {
    await this.redis.set(`generated_report:${report.id}`, JSON.stringify(report));
  }

  private initializeSchedules(): void {
    // Initialize cron schedules
  }

  private createDefaultTemplates(): void {
    // Create default report templates
  }

  /**
   * Get all templates
   */
  getTemplates(): ReportTemplate[] {
    return Array.from(this.templates.values());
  }

  /**
   * Get template by ID
   */
  getTemplate(id: string): ReportTemplate | undefined {
    return this.templates.get(id);
  }

  /**
   * Delete template
   */
  async deleteTemplate(id: string): Promise<void> {
    const schedule = this.schedules.get(id);
    if (schedule?.task) {
      schedule.task.stop();
    }
    
    this.templates.delete(id);
    this.schedules.delete(id);
    await this.redis.del(`report_template:${id}`);
    
    this.logger.info('Report template deleted', { templateId: id });
  }

  /**
   * Get service statistics
   */
  getStats(): {
    totalTemplates: number;
    activeSchedules: number;
    totalReportsGenerated: number;
  } {
    return {
      totalTemplates: this.templates.size,
      activeSchedules: Array.from(this.schedules.values()).filter(s => s.active).length,
      totalReportsGenerated: 0 // Would be tracked
    };
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    // Stop all scheduled tasks
    for (const schedule of this.schedules.values()) {
      if (schedule.task) {
        schedule.task.stop();
      }
    }
    
    this.logger.info('Report engine service destroyed');
  }
}