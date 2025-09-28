import { PrismaClient } from '@prisma/client';
import { logger } from '../lib/logger.js';

/**
 * Compliance Report Generator Service
 *
 * Generates comprehensive compliance reports in multiple formats (PDF, CSV, JSON)
 * Supports various compliance frameworks and customizable report options
 */

export interface ReportRequest {
  organizationId: string;
  framework?: string;
  startDate: Date;
  endDate: Date;
  format: 'pdf' | 'csv' | 'json';
  options: ReportOptions;
}

export interface ReportOptions {
  includeDetails: boolean;
  includePolicyViolations: boolean;
  includeMetrics: boolean;
  includeTrends: boolean;
  includeRecommendations: boolean;
  customSections?: string[];
}

export interface ComplianceReport {
  metadata: ReportMetadata;
  executiveSummary: ExecutiveSummary;
  complianceStatus: ComplianceStatus;
  policyViolations?: PolicyViolation[];
  metrics?: ComplianceMetrics;
  trends?: ComplianceTrends;
  recommendations?: Recommendation[];
  auditTrail?: AuditEntry[];
  appendices?: Appendix[];
}

export interface ReportMetadata {
  reportId: string;
  organizationId: string;
  organizationName: string;
  framework?: string;
  generatedAt: Date;
  reportPeriod: {
    start: Date;
    end: Date;
  };
  reportType: string;
  version: string;
  generatedBy: string;
}

export interface ExecutiveSummary {
  overallComplianceScore: number;
  complianceStatus: 'compliant' | 'partial' | 'non_compliant';
  totalPolicies: number;
  activePolicies: number;
  violationCount: number;
  criticalViolations: number;
  riskScore: number;
  keyFindings: string[];
  majorRecommendations: string[];
}

export interface ComplianceStatus {
  frameworks: FrameworkStatus[];
  policyCategories: CategoryStatus[];
  controlEffectiveness: ControlStatus[];
}

export interface FrameworkStatus {
  name: string;
  displayName: string;
  totalControls: number;
  implementedControls: number;
  effectiveControls: number;
  complianceRate: number;
  status: 'compliant' | 'partial' | 'non_compliant';
  lastAssessment: Date;
  nextAssessment: Date;
}

export interface CategoryStatus {
  category: string;
  displayName: string;
  policyCount: number;
  complianceRate: number;
  violationCount: number;
  riskLevel: string;
}

export interface ControlStatus {
  controlId: string;
  name: string;
  framework: string;
  status: 'effective' | 'ineffective' | 'not_implemented';
  lastTested: Date;
  testResult: string;
  evidence: string[];
}

export interface PolicyViolation {
  id: string;
  policyId: string;
  policyName: string;
  violationType: string;
  severity: string;
  description: string;
  timestamp: Date;
  userId?: string;
  riskScore: number;
  status: string;
  framework: string[];
  remediation?: string;
}

export interface ComplianceMetrics {
  policyEvaluations: {
    total: number;
    successful: number;
    failed: number;
    averageResponseTime: number;
  };
  violationTrends: {
    daily: ViolationTrendPoint[];
    weekly: ViolationTrendPoint[];
    monthly: ViolationTrendPoint[];
  };
  riskMetrics: {
    currentScore: number;
    previousScore: number;
    trend: 'improving' | 'stable' | 'degrading';
    byCategory: Record<string, number>;
  };
  performanceIndicators: KPI[];
}

export interface ViolationTrendPoint {
  date: Date;
  count: number;
  severity: Record<string, number>;
}

export interface KPI {
  name: string;
  value: number;
  unit: string;
  target: number;
  status: 'on_track' | 'at_risk' | 'off_track';
  trend: 'improving' | 'stable' | 'degrading';
}

export interface ComplianceTrends {
  complianceRateOverTime: TrendPoint[];
  violationRateOverTime: TrendPoint[];
  riskScoreOverTime: TrendPoint[];
  policyEffectivenessOverTime: TrendPoint[];
}

export interface TrendPoint {
  date: Date;
  value: number;
  label?: string;
}

export interface Recommendation {
  id: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  category: string;
  title: string;
  description: string;
  impact: string;
  effort: 'low' | 'medium' | 'high';
  timeframe: string;
  responsible: string[];
  frameworks: string[];
  relatedPolicies: string[];
}

export interface AuditEntry {
  id: string;
  timestamp: Date;
  eventType: string;
  resourceType: string;
  resourceId: string;
  action: string;
  outcome: string;
  actorId: string;
  details: Record<string, any>;
}

export interface Appendix {
  title: string;
  type: 'policy_list' | 'violation_details' | 'metrics_detail' | 'methodology';
  content: any;
}

export class ComplianceReportGenerator {
  private readonly prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  /**
   * Generate comprehensive compliance report
   */
  async generateReport(request: ReportRequest): Promise<string | Buffer> {
    try {
      logger.info('Generating compliance report', {
        organizationId: request.organizationId,
        format: request.format,
        framework: request.framework,
        period: { start: request.startDate, end: request.endDate }
      });

      // Gather all report data
      const reportData = await this.gatherReportData(request);

      // Generate report in requested format
      switch (request.format) {
        case 'json':
          return JSON.stringify(reportData, null, 2);
        case 'csv':
          return this.generateCSVReport(reportData);
        case 'pdf':
          return await this.generatePDFReport(reportData);
        default:
          throw new Error(`Unsupported report format: ${request.format}`);
      }

    } catch (error) {
      logger.error('Failed to generate compliance report', {
        organizationId: request.organizationId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Generate executive summary report
   */
  async generateExecutiveSummary(
    organizationId: string,
    framework?: string,
    dateRange?: { start: Date; end: Date }
  ): Promise<ExecutiveSummary> {
    try {
      const defaultDateRange = {
        start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
        end: new Date()
      };

      const period = dateRange || defaultDateRange;

      const [
        organization,
        policies,
        violations,
        complianceRules,
        riskMetrics
      ] = await Promise.all([
        this.prisma.organization.findUnique({
          where: { id: organizationId },
          select: { name: true }
        }),
        this.getPolicyStatistics(organizationId, framework),
        this.getViolationStatistics(organizationId, period, framework),
        this.getComplianceRuleStatistics(organizationId, framework),
        this.calculateRiskMetrics(organizationId, period)
      ]);

      const overallComplianceScore = this.calculateOverallComplianceScore(
        policies,
        violations,
        complianceRules
      );

      const complianceStatus = this.determineComplianceStatus(overallComplianceScore);

      const keyFindings = await this.generateKeyFindings(
        organizationId,
        period,
        framework
      );

      const majorRecommendations = await this.generateMajorRecommendations(
        violations,
        complianceRules,
        riskMetrics
      );

      return {
        overallComplianceScore,
        complianceStatus,
        totalPolicies: policies.total,
        activePolicies: policies.active,
        violationCount: violations.total,
        criticalViolations: violations.critical,
        riskScore: riskMetrics.overallScore,
        keyFindings,
        majorRecommendations
      };

    } catch (error) {
      logger.error('Failed to generate executive summary', {
        organizationId,
        error: error.message
      });
      throw error;
    }
  }

  // Private methods for data gathering

  private async gatherReportData(request: ReportRequest): Promise<ComplianceReport> {
    const [
      organization,
      executiveSummary,
      complianceStatus,
      policyViolations,
      metrics,
      trends,
      recommendations,
      auditTrail
    ] = await Promise.all([
      this.getOrganizationInfo(request.organizationId),
      this.generateExecutiveSummary(
        request.organizationId,
        request.framework,
        { start: request.startDate, end: request.endDate }
      ),
      this.getComplianceStatus(request.organizationId, request.framework),
      request.options.includePolicyViolations ?
        this.getPolicyViolations(request.organizationId, request.startDate, request.endDate, request.framework) :
        undefined,
      request.options.includeMetrics ?
        this.getComplianceMetrics(request.organizationId, request.startDate, request.endDate) :
        undefined,
      request.options.includeTrends ?
        this.getComplianceTrends(request.organizationId, request.startDate, request.endDate) :
        undefined,
      request.options.includeRecommendations ?
        this.generateRecommendations(request.organizationId, request.framework) :
        undefined,
      request.options.includeDetails ?
        this.getAuditTrail(request.organizationId, request.startDate, request.endDate) :
        undefined
    ]);

    const metadata: ReportMetadata = {
      reportId: this.generateReportId(),
      organizationId: request.organizationId,
      organizationName: organization.name,
      framework: request.framework,
      generatedAt: new Date(),
      reportPeriod: {
        start: request.startDate,
        end: request.endDate
      },
      reportType: 'compliance_assessment',
      version: '1.0.0',
      generatedBy: 'compliance_report_generator'
    };

    return {
      metadata,
      executiveSummary,
      complianceStatus,
      policyViolations,
      metrics,
      trends,
      recommendations,
      auditTrail,
      appendices: this.generateAppendices(request)
    };
  }

  private async getOrganizationInfo(organizationId: string) {
    return await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { id: true, name: true, slug: true }
    });
  }

  private async getPolicyStatistics(organizationId: string, framework?: string) {
    const whereClause: any = { organizationId };
    if (framework) {
      whereClause.complianceFrameworks = { has: framework };
    }

    const [total, active] = await Promise.all([
      this.prisma.policy.count({ where: whereClause }),
      this.prisma.policy.count({
        where: { ...whereClause, status: 'active' }
      })
    ]);

    return { total, active };
  }

  private async getViolationStatistics(
    organizationId: string,
    period: { start: Date; end: Date },
    framework?: string
  ) {
    const whereClause: any = {
      organizationId,
      eventType: 'violation_detected',
      eventTimestamp: {
        gte: period.start,
        lte: period.end
      }
    };

    if (framework) {
      whereClause.complianceFrameworks = { has: framework };
    }

    const [total, critical] = await Promise.all([
      this.prisma.auditLog.count({ where: whereClause }),
      this.prisma.auditLog.count({
        where: { ...whereClause, severity: 'critical' }
      })
    ]);

    return { total, critical };
  }

  private async getComplianceRuleStatistics(organizationId: string, framework?: string) {
    const whereClause: any = { organizationId, status: 'active' };
    if (framework) {
      whereClause.framework = framework;
    }

    const rules = await this.prisma.complianceRule.findMany({
      where: whereClause,
      select: { complianceStatus: true }
    });

    const compliant = rules.filter(r => r.complianceStatus === 'compliant').length;
    const total = rules.length;

    return { total, compliant, complianceRate: total > 0 ? (compliant / total) * 100 : 0 };
  }

  private async calculateRiskMetrics(
    organizationId: string,
    period: { start: Date; end: Date }
  ) {
    const violations = await this.prisma.auditLog.findMany({
      where: {
        organizationId,
        eventType: 'violation_detected',
        eventTimestamp: {
          gte: period.start,
          lte: period.end
        }
      },
      select: { severity: true, metadata: true }
    });

    const riskScores = violations.map(v => {
      const severityScores = { low: 2, medium: 5, high: 7.5, critical: 9 };
      return severityScores[v.severity as keyof typeof severityScores] || 5;
    });

    const overallScore = riskScores.length > 0 ?
      riskScores.reduce((sum, score) => sum + score, 0) / riskScores.length :
      0;

    return { overallScore };
  }

  private calculateOverallComplianceScore(
    policies: any,
    violations: any,
    complianceRules: any
  ): number {
    // Weighted scoring algorithm
    const policyScore = policies.active / Math.max(policies.total, 1) * 30; // 30% weight
    const violationScore = Math.max(0, 30 - violations.total * 2); // 30% weight (penalty based)
    const complianceScore = complianceRules.complianceRate * 0.4; // 40% weight

    return Math.round((policyScore + violationScore + complianceScore) * 100) / 100;
  }

  private determineComplianceStatus(score: number): 'compliant' | 'partial' | 'non_compliant' {
    if (score >= 90) return 'compliant';
    if (score >= 70) return 'partial';
    return 'non_compliant';
  }

  private async generateKeyFindings(
    organizationId: string,
    period: { start: Date; end: Date },
    framework?: string
  ): Promise<string[]> {
    // Generate key findings based on data analysis
    const findings: string[] = [];

    const violations = await this.getViolationStatistics(organizationId, period, framework);
    if (violations.critical > 0) {
      findings.push(`${violations.critical} critical policy violations detected during the reporting period`);
    }

    const complianceRules = await this.getComplianceRuleStatistics(organizationId, framework);
    if (complianceRules.complianceRate < 80) {
      findings.push(`Compliance rate of ${complianceRules.complianceRate.toFixed(1)}% is below target threshold`);
    }

    if (findings.length === 0) {
      findings.push('No significant compliance issues identified during the reporting period');
    }

    return findings;
  }

  private async generateMajorRecommendations(
    violations: any,
    complianceRules: any,
    riskMetrics: any
  ): Promise<string[]> {
    const recommendations: string[] = [];

    if (violations.critical > 0) {
      recommendations.push('Immediate review and remediation of critical policy violations required');
    }

    if (complianceRules.complianceRate < 90) {
      recommendations.push('Implement additional controls to improve compliance rate');
    }

    if (riskMetrics.overallScore > 7) {
      recommendations.push('Enhance risk monitoring and mitigation strategies');
    }

    if (recommendations.length === 0) {
      recommendations.push('Maintain current compliance practices and continue monitoring');
    }

    return recommendations;
  }

  private async getComplianceStatus(organizationId: string, framework?: string): Promise<ComplianceStatus> {
    // Implementation would gather detailed compliance status
    return {
      frameworks: [],
      policyCategories: [],
      controlEffectiveness: []
    };
  }

  private async getPolicyViolations(
    organizationId: string,
    startDate: Date,
    endDate: Date,
    framework?: string
  ): Promise<PolicyViolation[]> {
    const whereClause: any = {
      organizationId,
      eventType: 'violation_detected',
      eventTimestamp: { gte: startDate, lte: endDate }
    };

    if (framework) {
      whereClause.complianceFrameworks = { has: framework };
    }

    const auditLogs = await this.prisma.auditLog.findMany({
      where: whereClause,
      include: {
        policy: {
          select: { name: true, complianceFrameworks: true }
        }
      },
      orderBy: { eventTimestamp: 'desc' }
    });

    return auditLogs.map(log => ({
      id: log.id,
      policyId: log.policyId || '',
      policyName: log.policy?.name || 'Unknown Policy',
      violationType: log.metadata?.violationType || 'policy_violation',
      severity: log.severity,
      description: log.metadata?.description || 'Policy violation detected',
      timestamp: log.eventTimestamp,
      userId: log.actorId,
      riskScore: log.metadata?.riskScore || 0,
      status: log.metadata?.status || 'new',
      framework: log.policy?.complianceFrameworks || [],
      remediation: log.metadata?.remediation
    }));
  }

  private async getComplianceMetrics(
    organizationId: string,
    startDate: Date,
    endDate: Date
  ): Promise<ComplianceMetrics> {
    // Implementation would gather detailed metrics
    return {
      policyEvaluations: {
        total: 0,
        successful: 0,
        failed: 0,
        averageResponseTime: 0
      },
      violationTrends: {
        daily: [],
        weekly: [],
        monthly: []
      },
      riskMetrics: {
        currentScore: 0,
        previousScore: 0,
        trend: 'stable',
        byCategory: {}
      },
      performanceIndicators: []
    };
  }

  private async getComplianceTrends(
    organizationId: string,
    startDate: Date,
    endDate: Date
  ): Promise<ComplianceTrends> {
    // Implementation would calculate compliance trends
    return {
      complianceRateOverTime: [],
      violationRateOverTime: [],
      riskScoreOverTime: [],
      policyEffectivenessOverTime: []
    };
  }

  private async generateRecommendations(
    organizationId: string,
    framework?: string
  ): Promise<Recommendation[]> {
    // Implementation would generate AI-powered recommendations
    return [];
  }

  private async getAuditTrail(
    organizationId: string,
    startDate: Date,
    endDate: Date
  ): Promise<AuditEntry[]> {
    const auditLogs = await this.prisma.auditLog.findMany({
      where: {
        organizationId,
        eventTimestamp: { gte: startDate, lte: endDate },
        eventType: {
          in: ['policy_evaluation', 'compliance_check', 'violation_detected']
        }
      },
      orderBy: { eventTimestamp: 'desc' },
      take: 1000 // Limit for performance
    });

    return auditLogs.map(log => ({
      id: log.id,
      timestamp: log.eventTimestamp,
      eventType: log.eventType,
      resourceType: log.resourceType,
      resourceId: log.resourceId || '',
      action: log.action,
      outcome: log.outcome,
      actorId: log.actorId || '',
      details: log.metadata || {}
    }));
  }

  private generateAppendices(request: ReportRequest): Appendix[] {
    const appendices: Appendix[] = [];

    if (request.options.includeDetails) {
      appendices.push({
        title: 'Report Methodology',
        type: 'methodology',
        content: {
          dataCollection: 'Automated policy evaluation and audit log analysis',
          analysisMethod: 'Risk-based compliance assessment',
          reportingStandards: 'Industry best practices and regulatory requirements'
        }
      });
    }

    return appendices;
  }

  private generateCSVReport(reportData: ComplianceReport): string {
    const csvLines: string[] = [];

    // Header with metadata
    csvLines.push('Compliance Report');
    csvLines.push(`Organization,${reportData.metadata.organizationName}`);
    csvLines.push(`Framework,${reportData.metadata.framework || 'All'}`);
    csvLines.push(`Report Period,${reportData.metadata.reportPeriod.start.toISOString()} to ${reportData.metadata.reportPeriod.end.toISOString()}`);
    csvLines.push(`Generated At,${reportData.metadata.generatedAt.toISOString()}`);
    csvLines.push('');

    // Executive Summary
    csvLines.push('Executive Summary');
    csvLines.push(`Overall Compliance Score,${reportData.executiveSummary.overallComplianceScore}`);
    csvLines.push(`Compliance Status,${reportData.executiveSummary.complianceStatus}`);
    csvLines.push(`Total Policies,${reportData.executiveSummary.totalPolicies}`);
    csvLines.push(`Active Policies,${reportData.executiveSummary.activePolicies}`);
    csvLines.push(`Violation Count,${reportData.executiveSummary.violationCount}`);
    csvLines.push(`Critical Violations,${reportData.executiveSummary.criticalViolations}`);
    csvLines.push(`Risk Score,${reportData.executiveSummary.riskScore}`);
    csvLines.push('');

    // Policy Violations
    if (reportData.policyViolations && reportData.policyViolations.length > 0) {
      csvLines.push('Policy Violations');
      csvLines.push('ID,Policy Name,Type,Severity,Description,Timestamp,Risk Score,Status');
      reportData.policyViolations.forEach(violation => {
        csvLines.push(`${violation.id},${violation.policyName},${violation.violationType},${violation.severity},"${violation.description}",${violation.timestamp.toISOString()},${violation.riskScore},${violation.status}`);
      });
      csvLines.push('');
    }

    return csvLines.join('\n');
  }

  private async generatePDFReport(reportData: ComplianceReport): Promise<Buffer> {
    // In production, this would use a PDF generation library like Puppeteer or PDFKit
    // For now, return a placeholder buffer
    const pdfContent = `
      Compliance Report - ${reportData.metadata.organizationName}

      Executive Summary:
      - Compliance Score: ${reportData.executiveSummary.overallComplianceScore}%
      - Status: ${reportData.executiveSummary.complianceStatus}
      - Total Violations: ${reportData.executiveSummary.violationCount}
      - Critical Violations: ${reportData.executiveSummary.criticalViolations}

      Generated on: ${reportData.metadata.generatedAt.toISOString()}
    `;

    return Buffer.from(pdfContent, 'utf-8');
  }

  private generateReportId(): string {
    return `report_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}