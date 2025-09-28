/**
 * Compliance Validation Framework
 *
 * Provides automated compliance validation for:
 * - GDPR compliance checking
 * - SOX compliance validation
 * - ISO 27001 controls verification
 * - PCI DSS requirements validation
 * - Policy compliance automation
 * - Audit trail verification
 */

import { EventEmitter } from 'events';
import { SecurityTestConfig, SecurityTestResult, ComplianceResult, ComplianceFinding, Recommendation } from './SecurityTestFramework';

export interface ComplianceFramework {
  id: string;
  name: string;
  version: string;
  description: string;
  controls: ComplianceControl[];
  categories: ComplianceCategory[];
}

export interface ComplianceControl {
  id: string;
  title: string;
  description: string;
  category: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  requirements: string[];
  testCases: ComplianceTestCase[];
  evidence: EvidenceRequirement[];
}

export interface ComplianceTestCase {
  id: string;
  name: string;
  description: string;
  type: ComplianceTestType;
  automated: boolean;
  validator: string;
  parameters: Record<string, any>;
  expectedOutcome: 'PASS' | 'FAIL' | 'MANUAL';
}

export interface EvidenceRequirement {
  type: 'DOCUMENTATION' | 'CONFIGURATION' | 'LOG' | 'CERTIFICATE' | 'AUDIT_TRAIL';
  description: string;
  location?: string;
  validator?: string;
  required: boolean;
}

export interface ComplianceCategory {
  id: string;
  name: string;
  description: string;
  weight: number; // For scoring calculation
}

export interface ComplianceValidationResult {
  controlId: string;
  status: 'COMPLIANT' | 'NON_COMPLIANT' | 'PARTIAL' | 'NOT_APPLICABLE';
  score: number; // 0-100
  findings: ComplianceFinding[];
  evidence: CollectedEvidence[];
  recommendations: string[];
  lastValidated: Date;
  validatedBy: string;
}

export interface CollectedEvidence {
  type: string;
  description: string;
  location: string;
  content?: string;
  metadata: Record<string, any>;
  collected: Date;
}

export interface PolicyRule {
  id: string;
  name: string;
  description: string;
  framework: string;
  category: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  rule: string; // OPA Rego rule or validation logic
  parameters: Record<string, any>;
  enabled: boolean;
}

export interface AuditTrailValidation {
  startDate: Date;
  endDate: Date;
  events: AuditEventValidation[];
  integrity: IntegrityValidation;
  completeness: CompletenessValidation;
  timeline: TimelineValidation;
}

export interface AuditEventValidation {
  eventId: string;
  timestamp: Date;
  valid: boolean;
  issues: string[];
  signature?: SignatureValidation;
}

export interface IntegrityValidation {
  totalEvents: number;
  validEvents: number;
  invalidEvents: number;
  tamperingDetected: boolean;
  signatureVerification: boolean;
}

export interface CompletenessValidation {
  expectedEvents: number;
  actualEvents: number;
  missingEvents: string[];
  completenessRatio: number;
}

export interface TimelineValidation {
  chronologicalOrder: boolean;
  timeGaps: TimeGap[];
  duplicateTimestamps: number;
}

export interface TimeGap {
  start: Date;
  end: Date;
  duration: number;
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
}

export interface SignatureValidation {
  valid: boolean;
  algorithm: string;
  keyId: string;
  verificationTime: Date;
  error?: string;
}

export type ComplianceTestType =
  | 'CONFIGURATION_CHECK'
  | 'POLICY_VALIDATION'
  | 'ACCESS_CONTROL_TEST'
  | 'ENCRYPTION_VALIDATION'
  | 'AUDIT_LOG_VERIFICATION'
  | 'DATA_PROTECTION_CHECK'
  | 'INCIDENT_RESPONSE_TEST'
  | 'BACKUP_VALIDATION'
  | 'NETWORK_SECURITY_CHECK'
  | 'VULNERABILITY_ASSESSMENT';

export class ComplianceValidator extends EventEmitter {
  private config: SecurityTestConfig;
  private frameworks: Map<string, ComplianceFramework> = new Map();
  private policyRules: PolicyRule[] = [];
  private validationResults: ComplianceValidationResult[] = [];

  constructor(config: SecurityTestConfig) {
    super();
    this.config = config;
    this.initializeFrameworks();
    this.loadPolicyRules();
  }

  /**
   * Validate compliance against all configured frameworks
   */
  async validate(): Promise<SecurityTestResult> {
    const startTime = Date.now();
    this.emit('complianceValidationStarted', { timestamp: new Date() });

    try {
      const complianceResults: ComplianceResult[] = [];
      const allFindings: ComplianceFinding[] = [];

      // Validate each configured framework
      for (const framework of this.config.compliance.frameworks) {
        const result = await this.validateFramework(framework);
        complianceResults.push(result);
        allFindings.push(...result.findings);
      }

      // Validate policies
      const policyResults = await this.validatePolicies();
      complianceResults.push(...policyResults);

      // Validate audit trails
      const auditValidation = await this.validateAuditTrails();

      const overallScore = this.calculateOverallComplianceScore(complianceResults);
      const status = overallScore >= this.config.thresholds.complianceThreshold ? 'PASS' : 'FAIL';

      const securityTestResult: SecurityTestResult = {
        id: crypto.randomUUID(),
        timestamp: new Date(),
        testType: 'COMPLIANCE_VALIDATION',
        status,
        score: overallScore,
        vulnerabilities: [],
        compliance: complianceResults,
        performance: {
          responseTime: 0,
          throughput: 0,
          errorRate: 0,
          resourceUsage: { cpu: 0, memory: 0, network: 0 }
        },
        recommendations: this.generateComplianceRecommendations(allFindings),
        metadata: {
          duration: Date.now() - startTime,
          testVersion: '1.0.0',
          environment: this.config.environment,
          coverage: this.calculateComplianceCoverage()
        }
      };

      this.emit('complianceValidationCompleted', {
        result: securityTestResult,
        auditValidation,
        timestamp: new Date()
      });

      return securityTestResult;
    } catch (error) {
      this.emit('complianceValidationError', { error, timestamp: new Date() });
      throw error;
    }
  }

  /**
   * Validate specific compliance framework
   */
  async validateFramework(frameworkId: string): Promise<ComplianceResult> {
    const framework = this.frameworks.get(frameworkId);
    if (!framework) {
      throw new Error(`Framework ${frameworkId} not found`);
    }

    this.emit('frameworkValidationStarted', { framework: frameworkId, timestamp: new Date() });

    const findings: ComplianceFinding[] = [];
    const controlResults: ComplianceValidationResult[] = [];

    // Validate each control in the framework
    for (const control of framework.controls) {
      const result = await this.validateControl(control);
      controlResults.push(result);
      findings.push(...result.findings);
    }

    const score = this.calculateFrameworkScore(controlResults);
    const status = this.determineFrameworkStatus(controlResults);

    const complianceResult: ComplianceResult = {
      framework: framework.name,
      standard: framework.version,
      status,
      score,
      findings
    };

    this.emit('frameworkValidationCompleted', {
      framework: frameworkId,
      result: complianceResult,
      timestamp: new Date()
    });

    return complianceResult;
  }

  /**
   * Validate individual compliance control
   */
  async validateControl(control: ComplianceControl): Promise<ComplianceValidationResult> {
    this.emit('controlValidationStarted', { control: control.id, timestamp: new Date() });

    const findings: ComplianceFinding[] = [];
    const evidence: CollectedEvidence[] = [];
    let passedTests = 0;
    let totalTests = control.testCases.length;

    // Execute test cases for the control
    for (const testCase of control.testCases) {
      try {
        const testResult = await this.executeTestCase(testCase);

        if (testResult.passed) {
          passedTests++;
        } else {
          findings.push({
            ruleId: testCase.id,
            description: `${testCase.name}: ${testResult.message}`,
            status: 'FAIL',
            evidence: testResult.evidence || 'No evidence collected',
            remediation: testResult.remediation || 'See control requirements'
          });
        }

        if (testResult.evidence) {
          evidence.push({
            type: testCase.type,
            description: testCase.description,
            location: testResult.location || 'System',
            content: testResult.evidence,
            metadata: testResult.metadata || {},
            collected: new Date()
          });
        }
      } catch (error) {
        findings.push({
          ruleId: testCase.id,
          description: `Test execution failed: ${error.message}`,
          status: 'FAIL',
          evidence: `Error: ${error.message}`,
          remediation: 'Fix test execution error and retry'
        });
      }
    }

    // Collect evidence for the control
    for (const evidenceReq of control.evidence) {
      try {
        const collectedEvidence = await this.collectEvidence(evidenceReq);
        if (collectedEvidence) {
          evidence.push(collectedEvidence);
        } else if (evidenceReq.required) {
          findings.push({
            ruleId: `${control.id}-evidence-${evidenceReq.type}`,
            description: `Required evidence not found: ${evidenceReq.description}`,
            status: 'FAIL',
            evidence: 'Evidence not available',
            remediation: 'Provide required evidence'
          });
        }
      } catch (error) {
        if (evidenceReq.required) {
          findings.push({
            ruleId: `${control.id}-evidence-${evidenceReq.type}`,
            description: `Evidence collection failed: ${error.message}`,
            status: 'FAIL',
            evidence: `Error: ${error.message}`,
            remediation: 'Fix evidence collection and retry'
          });
        }
      }
    }

    const score = totalTests > 0 ? Math.round((passedTests / totalTests) * 100) : 0;
    const status = this.determineControlStatus(findings, evidence, control);

    const result: ComplianceValidationResult = {
      controlId: control.id,
      status,
      score,
      findings,
      evidence,
      recommendations: this.generateControlRecommendations(control, findings),
      lastValidated: new Date(),
      validatedBy: 'SecurityTestFramework'
    };

    this.validationResults.push(result);
    this.emit('controlValidationCompleted', { control: control.id, result, timestamp: new Date() });

    return result;
  }

  /**
   * Validate policy compliance using OPA rules
   */
  async validatePolicies(): Promise<ComplianceResult[]> {
    const results: ComplianceResult[] = [];

    for (const policy of this.config.compliance.policies) {
      const findings: ComplianceFinding[] = [];

      for (const rule of policy.rules) {
        try {
          const ruleResult = await this.validatePolicyRule(rule);

          if (!ruleResult.passed) {
            findings.push({
              ruleId: rule.id,
              description: ruleResult.message,
              status: 'FAIL',
              evidence: ruleResult.evidence || 'Policy rule evaluation failed',
              remediation: ruleResult.remediation || 'Review and fix policy violation'
            });
          }
        } catch (error) {
          findings.push({
            ruleId: rule.id,
            description: `Policy rule evaluation error: ${error.message}`,
            status: 'FAIL',
            evidence: `Error: ${error.message}`,
            remediation: 'Fix policy rule and retry'
          });
        }
      }

      const score = this.calculatePolicyScore(policy.rules, findings);
      const status = findings.length === 0 ? 'COMPLIANT' : 'NON_COMPLIANT';

      results.push({
        framework: policy.framework,
        standard: policy.name,
        status,
        score,
        findings
      });
    }

    return results;
  }

  /**
   * Validate audit trail integrity and completeness
   */
  async validateAuditTrails(): Promise<AuditTrailValidation> {
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - (30 * 24 * 60 * 60 * 1000)); // Last 30 days

    // This would integrate with the actual audit logging service
    const auditEvents = await this.fetchAuditEvents(startDate, endDate);
    const eventValidations: AuditEventValidation[] = [];

    // Validate each audit event
    for (const event of auditEvents) {
      const validation = await this.validateAuditEvent(event);
      eventValidations.push(validation);
    }

    // Validate integrity
    const integrity = this.validateAuditIntegrity(eventValidations);

    // Validate completeness
    const completeness = await this.validateAuditCompleteness(startDate, endDate, auditEvents);

    // Validate timeline
    const timeline = this.validateAuditTimeline(auditEvents);

    return {
      startDate,
      endDate,
      events: eventValidations,
      integrity,
      completeness,
      timeline
    };
  }

  private initializeFrameworks(): void {
    // Initialize GDPR framework
    this.frameworks.set('GDPR', this.createGDPRFramework());

    // Initialize ISO 27001 framework
    this.frameworks.set('ISO27001', this.createISO27001Framework());

    // Initialize SOX framework
    this.frameworks.set('SOX', this.createSOXFramework());

    // Initialize PCI DSS framework
    this.frameworks.set('PCI_DSS', this.createPCIDSSFramework());
  }

  private createGDPRFramework(): ComplianceFramework {
    return {
      id: 'GDPR',
      name: 'General Data Protection Regulation',
      version: '2018',
      description: 'EU General Data Protection Regulation compliance framework',
      categories: [
        { id: 'data-protection', name: 'Data Protection', description: 'Data protection principles', weight: 30 },
        { id: 'consent', name: 'Consent Management', description: 'Consent mechanisms', weight: 25 },
        { id: 'rights', name: 'Individual Rights', description: 'Data subject rights', weight: 25 },
        { id: 'security', name: 'Security', description: 'Technical and organizational measures', weight: 20 }
      ],
      controls: [
        {
          id: 'gdpr-data-minimization',
          title: 'Data Minimization',
          description: 'Ensure data processing is limited to what is necessary',
          category: 'data-protection',
          severity: 'HIGH',
          requirements: [
            'Collect only necessary personal data',
            'Implement data retention policies',
            'Regular review of data processing activities'
          ],
          testCases: [
            {
              id: 'gdpr-dm-1',
              name: 'Data Collection Assessment',
              description: 'Verify only necessary data is collected',
              type: 'CONFIGURATION_CHECK',
              automated: true,
              validator: 'dataCollectionValidator',
              parameters: { checkForms: true, checkAPIs: true },
              expectedOutcome: 'PASS'
            }
          ],
          evidence: [
            {
              type: 'DOCUMENTATION',
              description: 'Data processing records',
              required: true
            }
          ]
        },
        {
          id: 'gdpr-consent',
          title: 'Consent Management',
          description: 'Ensure proper consent mechanisms are in place',
          category: 'consent',
          severity: 'CRITICAL',
          requirements: [
            'Clear and unambiguous consent',
            'Ability to withdraw consent',
            'Consent records maintenance'
          ],
          testCases: [
            {
              id: 'gdpr-consent-1',
              name: 'Consent Mechanism Test',
              description: 'Verify consent collection and management',
              type: 'CONFIGURATION_CHECK',
              automated: true,
              validator: 'consentValidator',
              parameters: { checkWithdrawal: true },
              expectedOutcome: 'PASS'
            }
          ],
          evidence: [
            {
              type: 'LOG',
              description: 'Consent records',
              required: true
            }
          ]
        }
      ]
    };
  }

  private createISO27001Framework(): ComplianceFramework {
    return {
      id: 'ISO27001',
      name: 'ISO/IEC 27001',
      version: '2013',
      description: 'Information Security Management System standard',
      categories: [
        { id: 'isms', name: 'ISMS', description: 'Information Security Management System', weight: 25 },
        { id: 'access-control', name: 'Access Control', description: 'Access control measures', weight: 20 },
        { id: 'cryptography', name: 'Cryptography', description: 'Cryptographic controls', weight: 15 },
        { id: 'incident', name: 'Incident Management', description: 'Incident response', weight: 15 },
        { id: 'compliance', name: 'Compliance', description: 'Legal and regulatory compliance', weight: 25 }
      ],
      controls: [
        {
          id: 'iso-access-control',
          title: 'Access Control Policy',
          description: 'Establish and maintain access control policy',
          category: 'access-control',
          severity: 'HIGH',
          requirements: [
            'Document access control policy',
            'Implement role-based access control',
            'Regular access reviews'
          ],
          testCases: [
            {
              id: 'iso-ac-1',
              name: 'Access Control Implementation',
              description: 'Verify access control mechanisms',
              type: 'ACCESS_CONTROL_TEST',
              automated: true,
              validator: 'accessControlValidator',
              parameters: { checkRBAC: true },
              expectedOutcome: 'PASS'
            }
          ],
          evidence: [
            {
              type: 'DOCUMENTATION',
              description: 'Access control policy document',
              required: true
            },
            {
              type: 'CONFIGURATION',
              description: 'System access control settings',
              required: true
            }
          ]
        }
      ]
    };
  }

  private createSOXFramework(): ComplianceFramework {
    return {
      id: 'SOX',
      name: 'Sarbanes-Oxley Act',
      version: '2002',
      description: 'SOX compliance framework for financial reporting',
      categories: [
        { id: 'financial-reporting', name: 'Financial Reporting', description: 'Financial data integrity', weight: 40 },
        { id: 'internal-controls', name: 'Internal Controls', description: 'Internal control systems', weight: 35 },
        { id: 'audit-trail', name: 'Audit Trail', description: 'Audit and logging requirements', weight: 25 }
      ],
      controls: [
        {
          id: 'sox-audit-trail',
          title: 'Audit Trail Requirements',
          description: 'Maintain comprehensive audit trails for financial data',
          category: 'audit-trail',
          severity: 'CRITICAL',
          requirements: [
            'Log all financial data access',
            'Immutable audit records',
            'Audit trail retention'
          ],
          testCases: [
            {
              id: 'sox-audit-1',
              name: 'Audit Trail Verification',
              description: 'Verify audit trail completeness and integrity',
              type: 'AUDIT_LOG_VERIFICATION',
              automated: true,
              validator: 'auditTrailValidator',
              parameters: { checkIntegrity: true, checkCompleteness: true },
              expectedOutcome: 'PASS'
            }
          ],
          evidence: [
            {
              type: 'LOG',
              description: 'Audit log records',
              required: true
            },
            {
              type: 'CONFIGURATION',
              description: 'Logging configuration',
              required: true
            }
          ]
        }
      ]
    };
  }

  private createPCIDSSFramework(): ComplianceFramework {
    return {
      id: 'PCI_DSS',
      name: 'Payment Card Industry Data Security Standard',
      version: '4.0',
      description: 'PCI DSS compliance framework for payment card data protection',
      categories: [
        { id: 'network-security', name: 'Network Security', description: 'Secure network and systems', weight: 25 },
        { id: 'data-protection', name: 'Data Protection', description: 'Protect cardholder data', weight: 30 },
        { id: 'vulnerability', name: 'Vulnerability Management', description: 'Maintain vulnerability management program', weight: 20 },
        { id: 'access-control', name: 'Access Control', description: 'Implement strong access control measures', weight: 25 }
      ],
      controls: [
        {
          id: 'pci-encryption',
          title: 'Encrypt Transmission of Cardholder Data',
          description: 'Encrypt transmission of cardholder data across open, public networks',
          category: 'data-protection',
          severity: 'CRITICAL',
          requirements: [
            'Use strong cryptography for data transmission',
            'Verify encryption implementation',
            'Key management procedures'
          ],
          testCases: [
            {
              id: 'pci-enc-1',
              name: 'Encryption Validation',
              description: 'Verify encryption of cardholder data transmission',
              type: 'ENCRYPTION_VALIDATION',
              automated: true,
              validator: 'encryptionValidator',
              parameters: { checkTLS: true, checkCiphers: true },
              expectedOutcome: 'PASS'
            }
          ],
          evidence: [
            {
              type: 'CONFIGURATION',
              description: 'Encryption configuration',
              required: true
            },
            {
              type: 'CERTIFICATE',
              description: 'SSL/TLS certificates',
              required: true
            }
          ]
        }
      ]
    };
  }

  private loadPolicyRules(): void {
    // Load policy rules from configuration or database
    this.policyRules = [
      {
        id: 'password-policy',
        name: 'Password Policy Compliance',
        description: 'Ensure password policy meets security requirements',
        framework: 'GENERAL',
        category: 'AUTHENTICATION',
        severity: 'HIGH',
        rule: 'passwordPolicy',
        parameters: { minLength: 12, requireSpecialChars: true },
        enabled: true
      },
      {
        id: 'data-retention',
        name: 'Data Retention Policy',
        description: 'Ensure data retention policy is enforced',
        framework: 'GDPR',
        category: 'DATA_PROTECTION',
        severity: 'HIGH',
        rule: 'dataRetentionPolicy',
        parameters: { maxRetentionDays: 2555 }, // 7 years
        enabled: true
      }
    ];
  }

  private async executeTestCase(testCase: ComplianceTestCase): Promise<TestCaseResult> {
    // This would integrate with actual validators
    // For now, return mock results
    return {
      passed: true,
      message: `Test case ${testCase.name} passed`,
      evidence: 'Mock evidence',
      location: 'System configuration',
      metadata: { executedAt: new Date().toISOString() }
    };
  }

  private async collectEvidence(requirement: EvidenceRequirement): Promise<CollectedEvidence | null> {
    // This would integrate with actual evidence collection systems
    return {
      type: requirement.type,
      description: requirement.description,
      location: requirement.location || 'System',
      content: 'Mock evidence content',
      metadata: { collectedAt: new Date().toISOString() },
      collected: new Date()
    };
  }

  private async validatePolicyRule(rule: PolicyRule): Promise<PolicyRuleResult> {
    // This would integrate with OPA or other policy engines
    return {
      passed: true,
      message: `Policy rule ${rule.name} passed`,
      evidence: 'Policy evaluation results'
    };
  }

  private async fetchAuditEvents(startDate: Date, endDate: Date): Promise<any[]> {
    // This would integrate with the audit logging service
    return [];
  }

  private async validateAuditEvent(event: any): Promise<AuditEventValidation> {
    return {
      eventId: event.id,
      timestamp: event.timestamp,
      valid: true,
      issues: [],
      signature: {
        valid: true,
        algorithm: 'SHA-256',
        keyId: 'audit-key-1',
        verificationTime: new Date()
      }
    };
  }

  private validateAuditIntegrity(events: AuditEventValidation[]): IntegrityValidation {
    const validEvents = events.filter(e => e.valid).length;
    const invalidEvents = events.length - validEvents;

    return {
      totalEvents: events.length,
      validEvents,
      invalidEvents,
      tamperingDetected: invalidEvents > 0,
      signatureVerification: events.every(e => e.signature?.valid !== false)
    };
  }

  private async validateAuditCompleteness(startDate: Date, endDate: Date, events: any[]): Promise<CompletenessValidation> {
    // This would calculate expected events based on system activity
    const expectedEvents = 1000; // Mock value
    const actualEvents = events.length;

    return {
      expectedEvents,
      actualEvents,
      missingEvents: [],
      completenessRatio: actualEvents / expectedEvents
    };
  }

  private validateAuditTimeline(events: any[]): TimelineValidation {
    // Check chronological order and identify gaps
    const sortedEvents = events.sort((a, b) => a.timestamp - b.timestamp);
    const chronologicalOrder = JSON.stringify(events) === JSON.stringify(sortedEvents);

    return {
      chronologicalOrder,
      timeGaps: [],
      duplicateTimestamps: 0
    };
  }

  private calculateOverallComplianceScore(results: ComplianceResult[]): number {
    if (results.length === 0) return 0;

    const totalScore = results.reduce((sum, result) => sum + result.score, 0);
    return Math.round(totalScore / results.length);
  }

  private calculateFrameworkScore(controlResults: ComplianceValidationResult[]): number {
    if (controlResults.length === 0) return 0;

    const totalScore = controlResults.reduce((sum, result) => sum + result.score, 0);
    return Math.round(totalScore / controlResults.length);
  }

  private calculatePolicyScore(rules: any[], findings: ComplianceFinding[]): number {
    if (rules.length === 0) return 100;

    const failedRules = findings.length;
    const passedRules = rules.length - failedRules;
    return Math.round((passedRules / rules.length) * 100);
  }

  private determineFrameworkStatus(results: ComplianceValidationResult[]): 'COMPLIANT' | 'NON_COMPLIANT' | 'PARTIAL' {
    const compliantControls = results.filter(r => r.status === 'COMPLIANT').length;
    const totalControls = results.length;

    if (compliantControls === totalControls) return 'COMPLIANT';
    if (compliantControls === 0) return 'NON_COMPLIANT';
    return 'PARTIAL';
  }

  private determineControlStatus(
    findings: ComplianceFinding[],
    evidence: CollectedEvidence[],
    control: ComplianceControl
  ): 'COMPLIANT' | 'NON_COMPLIANT' | 'PARTIAL' | 'NOT_APPLICABLE' {
    const criticalFindings = findings.filter(f => f.status === 'FAIL').length;
    const requiredEvidence = control.evidence.filter(e => e.required).length;
    const collectedRequiredEvidence = evidence.filter(e =>
      control.evidence.some(req => req.type === e.type && req.required)
    ).length;

    if (criticalFindings > 0 || collectedRequiredEvidence < requiredEvidence) {
      return 'NON_COMPLIANT';
    }

    if (findings.some(f => f.status === 'WARNING')) {
      return 'PARTIAL';
    }

    return 'COMPLIANT';
  }

  private generateComplianceRecommendations(findings: ComplianceFinding[]): Recommendation[] {
    const recommendations: Recommendation[] = [];

    // Group findings by type and generate recommendations
    const findingsByType = findings.reduce((acc, finding) => {
      const key = finding.ruleId.split('-')[0];
      if (!acc[key]) acc[key] = [];
      acc[key].push(finding);
      return acc;
    }, {} as Record<string, ComplianceFinding[]>);

    for (const [type, typeFindings] of Object.entries(findingsByType)) {
      recommendations.push({
        type: 'HIGH',
        category: 'Compliance',
        title: `Address ${type} compliance issues`,
        description: `Found ${typeFindings.length} compliance issue(s) related to ${type}`,
        action: typeFindings[0]?.remediation || 'Review and address compliance findings',
        effort: typeFindings.length > 5 ? 'HIGH' : typeFindings.length > 2 ? 'MEDIUM' : 'LOW',
        impact: 'HIGH'
      });
    }

    return recommendations;
  }

  private generateControlRecommendations(control: ComplianceControl, findings: ComplianceFinding[]): string[] {
    const recommendations: string[] = [];

    if (findings.length === 0) {
      recommendations.push(`Control ${control.id} is compliant - maintain current implementation`);
    } else {
      recommendations.push(`Address ${findings.length} finding(s) for control ${control.id}`);
      findings.forEach(finding => {
        if (finding.remediation) {
          recommendations.push(finding.remediation);
        }
      });
    }

    return recommendations;
  }

  private calculateComplianceCoverage(): number {
    // Calculate coverage based on controls tested vs total available
    const totalControls = Array.from(this.frameworks.values())
      .reduce((sum, framework) => sum + framework.controls.length, 0);
    const testedControls = this.validationResults.length;

    if (totalControls === 0) return 100;
    return Math.round((testedControls / totalControls) * 100);
  }
}

// Helper interfaces
interface TestCaseResult {
  passed: boolean;
  message: string;
  evidence?: string;
  location?: string;
  metadata?: Record<string, any>;
  remediation?: string;
}

interface PolicyRuleResult {
  passed: boolean;
  message: string;
  evidence?: string;
  remediation?: string;
}