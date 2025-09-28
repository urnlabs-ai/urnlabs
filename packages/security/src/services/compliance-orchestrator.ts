import { EventEmitter } from 'events';
import { Redis } from 'ioredis';
import { ComplianceAutomationService } from './compliance-automation.js';
import { logger } from '../utils/logger.js';
import { promises as fs } from 'fs';
import * as path from 'path';
import axios from 'axios';

/**
 * Compliance Orchestrator
 * Coordinates automated compliance monitoring across all security components
 */
export class ComplianceOrchestrator extends EventEmitter {
  private redis: Redis;
  private complianceService: ComplianceAutomationService;
  private scheduledJobs: Map<string, NodeJS.Timeout> = new Map();
  private complianceMonitors: Map<string, ComplianceMonitor> = new Map();
  private config: ComplianceOrchestratorConfig;

  constructor(redis: Redis, config: ComplianceOrchestratorConfig) {
    super();
    this.redis = redis;
    this.config = config;
    this.complianceService = new ComplianceAutomationService();

    this.initializeMonitors();
    this.scheduleAutomatedChecks();
  }

  /**
   * Run comprehensive compliance assessment
   */
  public async runComplianceAssessment(frameworks?: string[]): Promise<ComplianceAssessmentResult> {
    const startTime = Date.now();

    try {
      logger.info('Starting comprehensive compliance assessment', {
        frameworks: frameworks || 'all',
        timestamp: new Date().toISOString()
      });

      const results: FrameworkAssessmentResult[] = [];
      const targetFrameworks = frameworks || ['soc2', 'iso27001', 'pci_dss', 'gdpr'];

      // Run assessments for each framework
      for (const frameworkId of targetFrameworks) {
        const monitor = this.complianceMonitors.get(frameworkId);
        if (monitor) {
          const result = await this.runFrameworkAssessment(frameworkId, monitor);
          results.push(result);
        }
      }

      // Generate consolidated report
      const consolidatedReport = await this.generateConsolidatedReport(results);

      // Store assessment results
      await this.storeAssessmentResults(consolidatedReport);

      // Generate alerts for non-compliance
      await this.processComplianceAlerts(results);

      const totalDuration = Date.now() - startTime;

      const assessmentResult: ComplianceAssessmentResult = {
        id: `ASSESS-${Date.now()}`,
        timestamp: new Date(),
        frameworks: results,
        overallStatus: this.calculateOverallStatus(results),
        summary: {
          totalControls: results.reduce((sum, r) => sum + r.totalControls, 0),
          compliantControls: results.reduce((sum, r) => sum + r.compliantControls, 0),
          nonCompliantControls: results.reduce((sum, r) => sum + r.nonCompliantControls, 0),
          partiallyCompliantControls: results.reduce((sum, r) => sum + r.partiallyCompliantControls, 0),
          criticalFindings: results.reduce((sum, r) => sum + r.criticalFindings, 0),
          highFindings: results.reduce((sum, r) => sum + r.highFindings, 0)
        },
        duration: totalDuration,
        consolidatedReport
      };

      this.emit('assessment_completed', assessmentResult);

      logger.info('Compliance assessment completed', {
        assessmentId: assessmentResult.id,
        overallStatus: assessmentResult.overallStatus,
        duration: totalDuration,
        frameworks: results.length
      });

      return assessmentResult;

    } catch (error) {
      logger.error('Compliance assessment failed', {
        error: error.message,
        stack: error.stack
      });

      throw error;
    }
  }

  /**
   * Run assessment for specific framework
   */
  private async runFrameworkAssessment(
    frameworkId: string,
    monitor: ComplianceMonitor
  ): Promise<FrameworkAssessmentResult> {
    logger.info('Running framework assessment', { frameworkId });

    const controls = await monitor.getControls();
    const assessmentResults: ControlAssessmentResult[] = [];

    // Assess each control
    for (const control of controls) {
      try {
        const result = await this.assessControl(control, monitor);
        assessmentResults.push(result);
      } catch (error) {
        logger.error('Control assessment failed', {
          frameworkId,
          controlId: control.id,
          error: error.message
        });

        assessmentResults.push({
          controlId: control.id,
          status: 'error',
          findings: [{
            severity: 'high',
            description: `Assessment failed: ${error.message}`,
            recommendation: 'Manual review required'
          }],
          evidence: [],
          lastChecked: new Date()
        });
      }
    }

    // Calculate framework statistics
    const compliantControls = assessmentResults.filter(r => r.status === 'compliant').length;
    const nonCompliantControls = assessmentResults.filter(r => r.status === 'non_compliant').length;
    const partiallyCompliantControls = assessmentResults.filter(r => r.status === 'partially_compliant').length;
    const criticalFindings = assessmentResults.reduce((sum, r) =>
      sum + r.findings.filter(f => f.severity === 'critical').length, 0);
    const highFindings = assessmentResults.reduce((sum, r) =>
      sum + r.findings.filter(f => f.severity === 'high').length, 0);

    return {
      frameworkId,
      frameworkName: monitor.getName(),
      totalControls: controls.length,
      compliantControls,
      nonCompliantControls,
      partiallyCompliantControls,
      criticalFindings,
      highFindings,
      compliancePercentage: (compliantControls / controls.length) * 100,
      overallStatus: this.calculateFrameworkStatus(compliantControls, nonCompliantControls, partiallyCompliantControls, controls.length),
      controlResults: assessmentResults,
      lastAssessed: new Date()
    };
  }

  /**
   * Assess individual compliance control
   */
  private async assessControl(
    control: ComplianceControl,
    monitor: ComplianceMonitor
  ): Promise<ControlAssessmentResult> {
    const findings: ComplianceFinding[] = [];
    const evidence: Evidence[] = [];

    // Run automated checks if available
    if (control.automatedCheck && control.checkScript) {
      try {
        const automatedResult = await this.runAutomatedCheck(control);
        findings.push(...automatedResult.findings);
        evidence.push(...automatedResult.evidence);
      } catch (error) {
        findings.push({
          severity: 'medium',
          description: `Automated check failed: ${error.message}`,
          recommendation: 'Review automated check configuration'
        });
      }
    }

    // Collect evidence from integrated systems
    const systemEvidence = await this.collectSystemEvidence(control);
    evidence.push(...systemEvidence);

    // Evaluate control status based on findings and evidence
    const status = this.evaluateControlStatus(control, findings, evidence);

    return {
      controlId: control.id,
      status,
      findings,
      evidence,
      lastChecked: new Date()
    };
  }

  /**
   * Run automated compliance check
   */
  private async runAutomatedCheck(control: ComplianceControl): Promise<AutomatedCheckResult> {
    const findings: ComplianceFinding[] = [];
    const evidence: Evidence[] = [];

    switch (control.checkScript) {
      case 'check_encryption_at_rest':
        return await this.checkEncryptionAtRest(control);

      case 'check_access_controls':
        return await this.checkAccessControls(control);

      case 'check_audit_logging':
        return await this.checkAuditLogging(control);

      case 'check_incident_response':
        return await this.checkIncidentResponse(control);

      case 'check_vulnerability_management':
        return await this.checkVulnerabilityManagement(control);

      case 'check_backup_procedures':
        return await this.checkBackupProcedures(control);

      case 'check_network_security':
        return await this.checkNetworkSecurity(control);

      case 'check_data_retention':
        return await this.checkDataRetention(control);

      default:
        throw new Error(`Unknown check script: ${control.checkScript}`);
    }
  }

  /**
   * Check encryption at rest compliance
   */
  private async checkEncryptionAtRest(control: ComplianceControl): Promise<AutomatedCheckResult> {
    const findings: ComplianceFinding[] = [];
    const evidence: Evidence[] = [];

    try {
      // Check database encryption
      const dbEncryptionStatus = await this.checkDatabaseEncryption();
      evidence.push({
        id: `evidence-${Date.now()}-1`,
        type: 'configuration',
        title: 'Database Encryption Status',
        description: 'Database encryption configuration check',
        content: JSON.stringify(dbEncryptionStatus),
        collectedAt: new Date()
      });

      if (!dbEncryptionStatus.encrypted) {
        findings.push({
          severity: 'critical',
          description: 'Database encryption at rest is not enabled',
          recommendation: 'Enable database encryption using TDE or similar mechanism'
        });
      }

      // Check file system encryption
      const fsEncryptionStatus = await this.checkFileSystemEncryption();
      evidence.push({
        id: `evidence-${Date.now()}-2`,
        type: 'configuration',
        title: 'File System Encryption Status',
        description: 'File system encryption configuration check',
        content: JSON.stringify(fsEncryptionStatus),
        collectedAt: new Date()
      });

      if (!fsEncryptionStatus.encrypted) {
        findings.push({
          severity: 'high',
          description: 'File system encryption is not properly configured',
          recommendation: 'Configure file system encryption for sensitive data storage'
        });
      }

    } catch (error) {
      findings.push({
        severity: 'medium',
        description: `Encryption check failed: ${error.message}`,
        recommendation: 'Manual verification of encryption configuration required'
      });
    }

    return { findings, evidence };
  }

  /**
   * Check access controls compliance
   */
  private async checkAccessControls(control: ComplianceControl): Promise<AutomatedCheckResult> {
    const findings: ComplianceFinding[] = [];
    const evidence: Evidence[] = [];

    try {
      // Check MFA enforcement
      const mfaStatus = await this.checkMFAEnforcement();
      evidence.push({
        id: `evidence-${Date.now()}-3`,
        type: 'configuration',
        title: 'MFA Enforcement Status',
        description: 'Multi-factor authentication enforcement check',
        content: JSON.stringify(mfaStatus),
        collectedAt: new Date()
      });

      if (!mfaStatus.enforced) {
        findings.push({
          severity: 'high',
          description: 'Multi-factor authentication is not enforced for all users',
          recommendation: 'Implement mandatory MFA for all user accounts'
        });
      }

      // Check role-based access controls
      const rbacStatus = await this.checkRBACImplementation();
      evidence.push({
        id: `evidence-${Date.now()}-4`,
        type: 'configuration',
        title: 'RBAC Implementation Status',
        description: 'Role-based access control implementation check',
        content: JSON.stringify(rbacStatus),
        collectedAt: new Date()
      });

      if (!rbacStatus.implemented) {
        findings.push({
          severity: 'medium',
          description: 'Role-based access controls are not properly implemented',
          recommendation: 'Implement comprehensive RBAC system'
        });
      }

    } catch (error) {
      findings.push({
        severity: 'medium',
        description: `Access control check failed: ${error.message}`,
        recommendation: 'Manual verification of access controls required'
      });
    }

    return { findings, evidence };
  }

  /**
   * Check audit logging compliance
   */
  private async checkAuditLogging(control: ComplianceControl): Promise<AutomatedCheckResult> {
    const findings: ComplianceFinding[] = [];
    const evidence: Evidence[] = [];

    try {
      // Check audit log configuration
      const auditLogStatus = await this.checkAuditLogConfiguration();
      evidence.push({
        id: `evidence-${Date.now()}-5`,
        type: 'configuration',
        title: 'Audit Log Configuration',
        description: 'Audit logging configuration and retention check',
        content: JSON.stringify(auditLogStatus),
        collectedAt: new Date()
      });

      if (!auditLogStatus.configured) {
        findings.push({
          severity: 'critical',
          description: 'Audit logging is not properly configured',
          recommendation: 'Configure comprehensive audit logging for all system activities'
        });
      }

      if (auditLogStatus.retentionDays < 365) {
        findings.push({
          severity: 'medium',
          description: `Audit log retention period is ${auditLogStatus.retentionDays} days, which may not meet compliance requirements`,
          recommendation: 'Extend audit log retention to at least 365 days'
        });
      }

    } catch (error) {
      findings.push({
        severity: 'medium',
        description: `Audit logging check failed: ${error.message}`,
        recommendation: 'Manual verification of audit logging configuration required'
      });
    }

    return { findings, evidence };
  }

  /**
   * Check incident response compliance
   */
  private async checkIncidentResponse(control: ComplianceControl): Promise<AutomatedCheckResult> {
    const findings: ComplianceFinding[] = [];
    const evidence: Evidence[] = [];

    try {
      // Check incident response automation
      const irStatus = await this.checkIncidentResponseAutomation();
      evidence.push({
        id: `evidence-${Date.now()}-6`,
        type: 'configuration',
        title: 'Incident Response Automation Status',
        description: 'Automated incident response system configuration',
        content: JSON.stringify(irStatus),
        collectedAt: new Date()
      });

      if (!irStatus.enabled) {
        findings.push({
          severity: 'high',
          description: 'Automated incident response is not enabled',
          recommendation: 'Enable automated incident response for critical security events'
        });
      }

      // Check incident response procedures documentation
      const proceduresStatus = await this.checkIncidentResponseProcedures();
      evidence.push({
        id: `evidence-${Date.now()}-7`,
        type: 'document',
        title: 'Incident Response Procedures',
        description: 'Incident response procedures documentation check',
        content: JSON.stringify(proceduresStatus),
        collectedAt: new Date()
      });

      if (!proceduresStatus.documented) {
        findings.push({
          severity: 'medium',
          description: 'Incident response procedures are not properly documented',
          recommendation: 'Document comprehensive incident response procedures'
        });
      }

    } catch (error) {
      findings.push({
        severity: 'medium',
        description: `Incident response check failed: ${error.message}`,
        recommendation: 'Manual verification of incident response capabilities required'
      });
    }

    return { findings, evidence };
  }

  /**
   * Check vulnerability management compliance
   */
  private async checkVulnerabilityManagement(control: ComplianceControl): Promise<AutomatedCheckResult> {
    const findings: ComplianceFinding[] = [];
    const evidence: Evidence[] = [];

    try {
      // Check vulnerability scanning automation
      const vulnScanStatus = await this.checkVulnerabilityScanning();
      evidence.push({
        id: `evidence-${Date.now()}-8`,
        type: 'test_result',
        title: 'Vulnerability Scanning Status',
        description: 'Automated vulnerability scanning configuration and results',
        content: JSON.stringify(vulnScanStatus),
        collectedAt: new Date()
      });

      if (!vulnScanStatus.automated) {
        findings.push({
          severity: 'high',
          description: 'Automated vulnerability scanning is not configured',
          recommendation: 'Implement automated vulnerability scanning in CI/CD pipeline'
        });
      }

      if (vulnScanStatus.criticalVulnerabilities > 0) {
        findings.push({
          severity: 'critical',
          description: `${vulnScanStatus.criticalVulnerabilities} critical vulnerabilities found`,
          recommendation: 'Immediately address all critical vulnerabilities'
        });
      }

      if (vulnScanStatus.highVulnerabilities > 5) {
        findings.push({
          severity: 'high',
          description: `${vulnScanStatus.highVulnerabilities} high-severity vulnerabilities found`,
          recommendation: 'Address high-severity vulnerabilities within SLA timeframes'
        });
      }

    } catch (error) {
      findings.push({
        severity: 'medium',
        description: `Vulnerability management check failed: ${error.message}`,
        recommendation: 'Manual verification of vulnerability management processes required'
      });
    }

    return { findings, evidence };
  }

  /**
   * Initialize compliance monitors for different frameworks
   */
  private initializeMonitors(): void {
    // SOC 2 Monitor
    this.complianceMonitors.set('soc2', new SOC2Monitor());

    // ISO 27001 Monitor
    this.complianceMonitors.set('iso27001', new ISO27001Monitor());

    // PCI DSS Monitor
    this.complianceMonitors.set('pci_dss', new PCIDSSMonitor());

    // GDPR Monitor
    this.complianceMonitors.set('gdpr', new GDPRMonitor());

    logger.info('Initialized compliance monitors', {
      monitors: Array.from(this.complianceMonitors.keys())
    });
  }

  /**
   * Schedule automated compliance checks
   */
  private scheduleAutomatedChecks(): void {
    // Daily compliance checks
    const dailyCheck = setInterval(async () => {
      try {
        await this.runComplianceAssessment(['soc2']);
      } catch (error) {
        logger.error('Daily compliance check failed', { error: error.message });
      }
    }, 24 * 60 * 60 * 1000); // 24 hours

    // Weekly comprehensive assessment
    const weeklyCheck = setInterval(async () => {
      try {
        await this.runComplianceAssessment();
      } catch (error) {
        logger.error('Weekly compliance assessment failed', { error: error.message });
      }
    }, 7 * 24 * 60 * 60 * 1000); // 7 days

    this.scheduledJobs.set('daily', dailyCheck);
    this.scheduledJobs.set('weekly', weeklyCheck);

    logger.info('Scheduled automated compliance checks', {
      daily: true,
      weekly: true
    });
  }

  /**
   * Generate compliance dashboard data
   */
  public async generateComplianceDashboard(): Promise<ComplianceDashboard> {
    const assessmentHistory = await this.getAssessmentHistory(30); // Last 30 days
    const currentStatus = await this.getCurrentComplianceStatus();
    const upcomingDeadlines = await this.getUpcomingDeadlines();
    const actionItems = await this.getActionItems();

    return {
      timestamp: new Date(),
      overallStatus: currentStatus.overallStatus,
      frameworks: currentStatus.frameworks,
      complianceTrend: this.calculateComplianceTrend(assessmentHistory),
      upcomingDeadlines,
      actionItems,
      recentActivity: assessmentHistory.slice(0, 10)
    };
  }

  /**
   * Helper methods for system checks
   */
  private async checkDatabaseEncryption(): Promise<any> {
    // Implementation would check actual database encryption status
    return { encrypted: true, algorithm: 'AES-256' };
  }

  private async checkFileSystemEncryption(): Promise<any> {
    // Implementation would check file system encryption
    return { encrypted: true, algorithm: 'LUKS' };
  }

  private async checkMFAEnforcement(): Promise<any> {
    // Implementation would check MFA enforcement
    return { enforced: true, coverage: 100 };
  }

  private async checkRBACImplementation(): Promise<any> {
    // Implementation would check RBAC
    return { implemented: true, rolesConfigured: 5 };
  }

  private async checkAuditLogConfiguration(): Promise<any> {
    // Implementation would check audit logging
    return { configured: true, retentionDays: 365 };
  }

  private async checkIncidentResponseAutomation(): Promise<any> {
    // Implementation would check incident response automation
    return { enabled: true, playbooksConfigured: 3 };
  }

  private async checkIncidentResponseProcedures(): Promise<any> {
    // Implementation would check IR procedures
    return { documented: true, lastUpdated: new Date() };
  }

  private async checkVulnerabilityScanning(): Promise<any> {
    // Implementation would check vulnerability scanning
    return {
      automated: true,
      criticalVulnerabilities: 0,
      highVulnerabilities: 2,
      lastScan: new Date()
    };
  }

  private calculateOverallStatus(results: FrameworkAssessmentResult[]): ComplianceStatus {
    const totalCompliant = results.reduce((sum, r) => sum + r.compliantControls, 0);
    const totalControls = results.reduce((sum, r) => sum + r.totalControls, 0);
    const complianceRate = totalCompliant / totalControls;

    if (complianceRate >= 0.95) return 'compliant';
    if (complianceRate >= 0.80) return 'partially_compliant';
    return 'non_compliant';
  }

  private calculateFrameworkStatus(
    compliant: number,
    nonCompliant: number,
    partial: number,
    total: number
  ): ComplianceStatus {
    const complianceRate = compliant / total;

    if (complianceRate >= 0.95) return 'compliant';
    if (complianceRate >= 0.80) return 'partially_compliant';
    return 'non_compliant';
  }

  private evaluateControlStatus(
    control: ComplianceControl,
    findings: ComplianceFinding[],
    evidence: Evidence[]
  ): ComplianceStatus {
    const criticalFindings = findings.filter(f => f.severity === 'critical').length;
    const highFindings = findings.filter(f => f.severity === 'high').length;

    if (criticalFindings > 0) return 'non_compliant';
    if (highFindings > 2) return 'non_compliant';
    if (highFindings > 0) return 'partially_compliant';
    if (evidence.length === 0) return 'not_assessed';

    return 'compliant';
  }

  /**
   * Cleanup method
   */
  public cleanup(): void {
    for (const [name, job] of this.scheduledJobs) {
      clearInterval(job);
      logger.debug('Cleared scheduled job', { name });
    }
    this.scheduledJobs.clear();
  }
}

// Type definitions
interface ComplianceOrchestratorConfig {
  frameworks: string[];
  checkInterval: number;
  reportingEndpoint?: string;
}

interface ComplianceAssessmentResult {
  id: string;
  timestamp: Date;
  frameworks: FrameworkAssessmentResult[];
  overallStatus: ComplianceStatus;
  summary: ComplianceSummary;
  duration: number;
  consolidatedReport?: any;
}

interface FrameworkAssessmentResult {
  frameworkId: string;
  frameworkName: string;
  totalControls: number;
  compliantControls: number;
  nonCompliantControls: number;
  partiallyCompliantControls: number;
  criticalFindings: number;
  highFindings: number;
  compliancePercentage: number;
  overallStatus: ComplianceStatus;
  controlResults: ControlAssessmentResult[];
  lastAssessed: Date;
}

interface ControlAssessmentResult {
  controlId: string;
  status: ComplianceStatus | 'error';
  findings: ComplianceFinding[];
  evidence: Evidence[];
  lastChecked: Date;
}

interface AutomatedCheckResult {
  findings: ComplianceFinding[];
  evidence: Evidence[];
}

interface ComplianceSummary {
  totalControls: number;
  compliantControls: number;
  nonCompliantControls: number;
  partiallyCompliantControls: number;
  criticalFindings: number;
  highFindings: number;
}

interface ComplianceDashboard {
  timestamp: Date;
  overallStatus: ComplianceStatus;
  frameworks: any[];
  complianceTrend: any[];
  upcomingDeadlines: any[];
  actionItems: any[];
  recentActivity: any[];
}

type ComplianceStatus = 'compliant' | 'non_compliant' | 'partially_compliant' | 'not_assessed';

// Abstract base class for compliance monitors
abstract class ComplianceMonitor {
  abstract getName(): string;
  abstract getControls(): Promise<ComplianceControl[]>;
}

// Framework-specific monitors
class SOC2Monitor extends ComplianceMonitor {
  getName(): string {
    return 'SOC 2 Type II';
  }

  async getControls(): Promise<ComplianceControl[]> {
    // Return SOC 2 controls
    return [];
  }
}

class ISO27001Monitor extends ComplianceMonitor {
  getName(): string {
    return 'ISO 27001:2013';
  }

  async getControls(): Promise<ComplianceControl[]> {
    // Return ISO 27001 controls
    return [];
  }
}

class PCIDSSMonitor extends ComplianceMonitor {
  getName(): string {
    return 'PCI DSS v4.0';
  }

  async getControls(): Promise<ComplianceControl[]> {
    // Return PCI DSS controls
    return [];
  }
}

class GDPRMonitor extends ComplianceMonitor {
  getName(): string {
    return 'GDPR';
  }

  async getControls(): Promise<ComplianceControl[]> {
    // Return GDPR controls
    return [];
  }
}

export { ComplianceOrchestrator, ComplianceOrchestratorConfig, ComplianceAssessmentResult };