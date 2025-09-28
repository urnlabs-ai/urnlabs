import { EventEmitter } from 'events';
import { encryptionService } from './encryption';
import { auditLoggingService } from './audit-logging';

export interface DataSubject {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  dateOfBirth?: Date;
  nationality?: string;
  consentRecord: ConsentRecord;
  dataProcessingActivities: DataProcessingActivity[];
  rights: DataSubjectRights;
  createdAt: Date;
  updatedAt: Date;
  metadata?: Record<string, any>;
}

export interface ConsentRecord {
  consentId: string;
  dataSubjectId: string;
  purposes: ConsentPurpose[];
  consentDate: Date;
  consentMethod: 'explicit' | 'opt-in' | 'pre-ticked' | 'implied';
  consentSource: string;
  withdrawalDate?: Date;
  withdrawalMethod?: string;
  version: string;
  lawfulBasis: LawfulBasis[];
  isActive: boolean;
  renewalRequired?: Date;
  history: ConsentHistoryEntry[];
}

export interface ConsentPurpose {
  purposeId: string;
  name: string;
  description: string;
  category: 'necessary' | 'functional' | 'analytical' | 'marketing' | 'social';
  granted: boolean;
  grantedAt?: Date;
  withdrawnAt?: Date;
  dataTypes: string[];
  retentionPeriod?: number; // in days
  thirdParties?: string[];
}

export interface LawfulBasis {
  basis: 'consent' | 'contract' | 'legal_obligation' | 'vital_interests' | 'public_task' | 'legitimate_interests';
  description: string;
  evidence?: string;
}

export interface ConsentHistoryEntry {
  timestamp: Date;
  action: 'granted' | 'withdrawn' | 'updated' | 'renewed';
  purposeIds: string[];
  method: string;
  ipAddress: string;
  userAgent: string;
  evidence: string;
}

export interface DataProcessingActivity {
  activityId: string;
  name: string;
  description: string;
  controller: DataController;
  processors: DataProcessor[];
  categories: PersonalDataCategory[];
  purposes: string[];
  lawfulBasis: LawfulBasis[];
  recipients: DataRecipient[];
  retentionPeriod: number;
  location: DataLocation;
  securityMeasures: SecurityMeasure[];
  transferMechanisms?: TransferMechanism[];
  createdAt: Date;
  updatedAt: Date;
}

export interface DataController {
  name: string;
  contactDetails: ContactDetails;
  representative?: ContactDetails;
  dpoContact?: ContactDetails;
}

export interface DataProcessor {
  name: string;
  contactDetails: ContactDetails;
  location: string;
  adequacyDecision?: boolean;
  contractualSafeguards: string[];
}

export interface ContactDetails {
  name: string;
  email: string;
  phone?: string;
  address?: string;
}

export interface PersonalDataCategory {
  category: string;
  description: string;
  sensitivity: 'normal' | 'sensitive' | 'criminal' | 'biometric';
  fields: string[];
}

export interface DataRecipient {
  name: string;
  type: 'internal' | 'external' | 'third_party' | 'public_authority';
  location: string;
  purpose: string;
  adequacyDecision?: boolean;
}

export interface DataLocation {
  country: string;
  region?: string;
  adequacyDecision: boolean;
  safeguards?: string[];
}

export interface SecurityMeasure {
  type: 'technical' | 'organizational';
  measure: string;
  description: string;
  implemented: boolean;
  evidence?: string;
}

export interface TransferMechanism {
  mechanism: 'adequacy_decision' | 'standard_contractual_clauses' | 'binding_corporate_rules' | 'certification' | 'derogation';
  description: string;
  documentation: string[];
}

export interface DataSubjectRights {
  accessRight: RightExercise[];
  rectificationRight: RightExercise[];
  erasureRight: RightExercise[];
  restrictionRight: RightExercise[];
  portabilityRight: RightExercise[];
  objectionRight: RightExercise[];
}

export interface RightExercise {
  requestId: string;
  rightType: 'access' | 'rectification' | 'erasure' | 'restriction' | 'portability' | 'objection';
  requestDate: Date;
  requestMethod: string;
  requestDetails: string;
  status: 'pending' | 'under_review' | 'approved' | 'rejected' | 'completed';
  responseDate?: Date;
  responseDetails?: string;
  evidence?: string[];
  deadline: Date;
}

export interface DataBreachIncident {
  incidentId: string;
  detectedAt: Date;
  reportedAt?: Date;
  dataController: string;
  dataProcessor?: string;
  affectedDataSubjects: number;
  dataCategories: string[];
  breachType: 'confidentiality' | 'integrity' | 'availability';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  cause: string;
  technicalMeasures: string[];
  organizationalMeasures: string[];
  riskAssessment: RiskAssessment;
  notificationRequired: {
    supervisoryAuthority: boolean;
    dataSubjects: boolean;
  };
  notifications: BreachNotification[];
  remediationActions: RemediationAction[];
  status: 'discovered' | 'contained' | 'investigated' | 'resolved';
}

export interface RiskAssessment {
  likelihood: 'low' | 'medium' | 'high';
  impact: 'low' | 'medium' | 'high';
  riskLevel: 'low' | 'medium' | 'high' | 'very_high';
  factors: string[];
  mitigation: string[];
}

export interface BreachNotification {
  type: 'supervisory_authority' | 'data_subject';
  sentAt: Date;
  recipient: string;
  method: string;
  content: string;
  acknowledged?: boolean;
  acknowledgedAt?: Date;
}

export interface RemediationAction {
  action: string;
  assignedTo: string;
  deadline: Date;
  status: 'pending' | 'in_progress' | 'completed';
  completedAt?: Date;
  evidence?: string;
}

export interface GDPRReport {
  reportId: string;
  reportType: 'compliance_status' | 'consent_overview' | 'data_breach' | 'subject_rights' | 'processing_activities';
  period: { start: Date; end: Date };
  generatedAt: Date;
  generatedBy: string;
  summary: Record<string, any>;
  details: Record<string, any>;
  recommendations: string[];
  complianceScore: number;
}

export class GDPRComplianceService extends EventEmitter {
  private dataSubjects: Map<string, DataSubject> = new Map();
  private consentRecords: Map<string, ConsentRecord> = new Map();
  private processingActivities: Map<string, DataProcessingActivity> = new Map();
  private breachIncidents: Map<string, DataBreachIncident> = new Map();
  private rightExercises: Map<string, RightExercise> = new Map();

  private readonly consentVersion = '1.0';
  private readonly retentionPeriods = {
    marketing: 365 * 2, // 2 years
    analytics: 365 * 3, // 3 years
    necessary: 365 * 7, // 7 years
    functional: 365 * 1 // 1 year
  };

  constructor() {
    super();
    this.initializeDefaultProcessingActivities();
    this.setupPeriodicTasks();
  }

  /**
   * Register a new data subject
   */
  async registerDataSubject(subjectData: Omit<DataSubject, 'id' | 'consentRecord' | 'dataProcessingActivities' | 'rights' | 'createdAt' | 'updatedAt'>): Promise<string> {
    const subjectId = encryptionService.generateUUID();

    const dataSubject: DataSubject = {
      id: subjectId,
      ...subjectData,
      consentRecord: this.createEmptyConsentRecord(subjectId),
      dataProcessingActivities: [],
      rights: this.createEmptyRights(),
      createdAt: new Date(),
      updatedAt: new Date()
    };

    this.dataSubjects.set(subjectId, dataSubject);

    // Log registration
    await auditLoggingService.logEvent({
      eventType: 'DATA_SUBJECT_REGISTRATION',
      category: 'DATA_ACCESS',
      severity: 'LOW',
      source: {
        service: 'gdpr-compliance',
        version: '1.0.0',
        instance: process.env.HOSTNAME || 'localhost',
        ip: 'system'
      },
      actor: {
        type: 'SYSTEM'
      },
      target: {
        resource: 'data-subject',
        resourceId: subjectId,
        resourceType: 'PERSONAL_DATA'
      },
      action: 'REGISTER',
      outcome: 'SUCCESS',
      details: {
        email: subjectData.email,
        hasName: !!(subjectData.firstName || subjectData.lastName)
      },
      metadata: {
        correlationId: encryptionService.generateUUID()
      },
      compliance: {
        gdpr: true,
        sox: false,
        iso27001: false,
        pci: false
      }
    });

    this.emit('dataSubjectRegistered', { subjectId, email: subjectData.email });

    return subjectId;
  }

  /**
   * Record consent for a data subject
   */
  async recordConsent(
    dataSubjectId: string,
    purposes: ConsentPurpose[],
    context: {
      method: ConsentRecord['consentMethod'];
      source: string;
      ipAddress: string;
      userAgent: string;
      evidence?: string;
    }
  ): Promise<string> {
    const subject = this.dataSubjects.get(dataSubjectId);
    if (!subject) {
      throw new Error('Data subject not found');
    }

    const consentId = encryptionService.generateUUID();

    // Determine lawful basis
    const lawfulBasis: LawfulBasis[] = purposes.map(purpose => ({
      basis: purpose.category === 'necessary' ? 'legal_obligation' : 'consent',
      description: `Processing for ${purpose.name}`,
      evidence: context.evidence
    }));

    const consentRecord: ConsentRecord = {
      consentId,
      dataSubjectId,
      purposes,
      consentDate: new Date(),
      consentMethod: context.method,
      consentSource: context.source,
      version: this.consentVersion,
      lawfulBasis,
      isActive: true,
      history: [{
        timestamp: new Date(),
        action: 'granted',
        purposeIds: purposes.map(p => p.purposeId),
        method: context.source,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        evidence: context.evidence || 'Consent granted'
      }]
    };

    // Calculate renewal date (if needed for marketing consent)
    if (purposes.some(p => p.category === 'marketing')) {
      consentRecord.renewalRequired = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000); // 1 year
    }

    this.consentRecords.set(consentId, consentRecord);
    subject.consentRecord = consentRecord;
    subject.updatedAt = new Date();

    // Log consent
    await auditLoggingService.logEvent({
      eventType: 'CONSENT_GRANTED',
      category: 'DATA_ACCESS',
      severity: 'LOW',
      source: {
        service: 'gdpr-compliance',
        version: '1.0.0',
        instance: process.env.HOSTNAME || 'localhost',
        ip: context.ipAddress
      },
      actor: {
        userId: dataSubjectId,
        userAgent: context.userAgent,
        type: 'USER'
      },
      target: {
        resource: 'consent-record',
        resourceId: consentId,
        resourceType: 'CONSENT'
      },
      action: 'GRANT',
      outcome: 'SUCCESS',
      details: {
        purposes: purposes.map(p => ({ id: p.purposeId, name: p.name, category: p.category })),
        method: context.method,
        source: context.source
      },
      metadata: {
        correlationId: encryptionService.generateUUID(),
        consentVersion: this.consentVersion
      },
      compliance: {
        gdpr: true,
        sox: false,
        iso27001: false,
        pci: false
      }
    });

    this.emit('consentGranted', { dataSubjectId, consentId, purposes });

    return consentId;
  }

  /**
   * Withdraw consent for specific purposes
   */
  async withdrawConsent(
    dataSubjectId: string,
    purposeIds: string[],
    context: {
      method: string;
      ipAddress: string;
      userAgent: string;
      reason?: string;
    }
  ): Promise<void> {
    const subject = this.dataSubjects.get(dataSubjectId);
    if (!subject) {
      throw new Error('Data subject not found');
    }

    const consentRecord = subject.consentRecord;
    if (!consentRecord.isActive) {
      throw new Error('No active consent record found');
    }

    // Update purposes
    const withdrawnPurposes = consentRecord.purposes.filter(p => purposeIds.includes(p.purposeId));
    withdrawnPurposes.forEach(purpose => {
      purpose.granted = false;
      purpose.withdrawnAt = new Date();
    });

    // Add to history
    consentRecord.history.push({
      timestamp: new Date(),
      action: 'withdrawn',
      purposeIds,
      method: context.method,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      evidence: context.reason || 'Consent withdrawn'
    });

    // Check if all consent is withdrawn
    const hasActiveConsent = consentRecord.purposes.some(p => p.granted);
    if (!hasActiveConsent) {
      consentRecord.isActive = false;
      consentRecord.withdrawalDate = new Date();
      consentRecord.withdrawalMethod = context.method;
    }

    subject.updatedAt = new Date();

    // Log withdrawal
    await auditLoggingService.logEvent({
      eventType: 'CONSENT_WITHDRAWN',
      category: 'DATA_ACCESS',
      severity: 'MEDIUM',
      source: {
        service: 'gdpr-compliance',
        version: '1.0.0',
        instance: process.env.HOSTNAME || 'localhost',
        ip: context.ipAddress
      },
      actor: {
        userId: dataSubjectId,
        userAgent: context.userAgent,
        type: 'USER'
      },
      target: {
        resource: 'consent-record',
        resourceId: consentRecord.consentId,
        resourceType: 'CONSENT'
      },
      action: 'WITHDRAW',
      outcome: 'SUCCESS',
      details: {
        withdrawnPurposes: withdrawnPurposes.map(p => ({ id: p.purposeId, name: p.name })),
        method: context.method,
        reason: context.reason,
        allConsentWithdrawn: !hasActiveConsent
      },
      metadata: {
        correlationId: encryptionService.generateUUID()
      },
      compliance: {
        gdpr: true,
        sox: false,
        iso27001: false,
        pci: false
      }
    });

    this.emit('consentWithdrawn', { dataSubjectId, purposeIds, allConsentWithdrawn: !hasActiveConsent });

    // Trigger data deletion if all consent withdrawn
    if (!hasActiveConsent) {
      await this.scheduleDataDeletion(dataSubjectId, 'consent_withdrawn');
    }
  }

  /**
   * Handle data subject access request (Article 15)
   */
  async handleAccessRequest(dataSubjectId: string, requestContext: any): Promise<RightExercise> {
    const subject = this.dataSubjects.get(dataSubjectId);
    if (!subject) {
      throw new Error('Data subject not found');
    }

    const requestId = encryptionService.generateUUID();
    const deadline = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

    const rightExercise: RightExercise = {
      requestId,
      rightType: 'access',
      requestDate: new Date(),
      requestMethod: requestContext.method || 'web_form',
      requestDetails: requestContext.details || 'Data access request',
      status: 'pending',
      deadline
    };

    subject.rights.accessRight.push(rightExercise);
    subject.updatedAt = new Date();
    this.rightExercises.set(requestId, rightExercise);

    // Log the request
    await auditLoggingService.logEvent({
      eventType: 'DATA_ACCESS_REQUEST',
      category: 'DATA_ACCESS',
      severity: 'MEDIUM',
      source: {
        service: 'gdpr-compliance',
        version: '1.0.0',
        instance: process.env.HOSTNAME || 'localhost',
        ip: requestContext.ipAddress || 'unknown'
      },
      actor: {
        userId: dataSubjectId,
        userAgent: requestContext.userAgent,
        type: 'USER'
      },
      target: {
        resource: 'data-access-request',
        resourceId: requestId,
        resourceType: 'GDPR_REQUEST'
      },
      action: 'REQUEST',
      outcome: 'SUCCESS',
      details: {
        rightType: 'access',
        deadline: deadline.toISOString(),
        requestMethod: requestContext.method
      },
      metadata: {
        correlationId: encryptionService.generateUUID()
      },
      compliance: {
        gdpr: true,
        sox: false,
        iso27001: false,
        pci: false
      }
    });

    this.emit('accessRequestReceived', { dataSubjectId, requestId, deadline });

    // Auto-process if possible
    await this.processAccessRequest(requestId);

    return rightExercise;
  }

  /**
   * Handle right to erasure request (Article 17)
   */
  async handleErasureRequest(
    dataSubjectId: string,
    requestContext: any,
    grounds: string[]
  ): Promise<RightExercise> {
    const subject = this.dataSubjects.get(dataSubjectId);
    if (!subject) {
      throw new Error('Data subject not found');
    }

    const requestId = encryptionService.generateUUID();
    const deadline = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

    const rightExercise: RightExercise = {
      requestId,
      rightType: 'erasure',
      requestDate: new Date(),
      requestMethod: requestContext.method || 'web_form',
      requestDetails: `Erasure request. Grounds: ${grounds.join(', ')}`,
      status: 'under_review',
      deadline
    };

    subject.rights.erasureRight.push(rightExercise);
    subject.updatedAt = new Date();
    this.rightExercises.set(requestId, rightExercise);

    // Log the request
    await auditLoggingService.logEvent({
      eventType: 'DATA_ERASURE_REQUEST',
      category: 'DATA_ACCESS',
      severity: 'HIGH',
      source: {
        service: 'gdpr-compliance',
        version: '1.0.0',
        instance: process.env.HOSTNAME || 'localhost',
        ip: requestContext.ipAddress || 'unknown'
      },
      actor: {
        userId: dataSubjectId,
        userAgent: requestContext.userAgent,
        type: 'USER'
      },
      target: {
        resource: 'data-erasure-request',
        resourceId: requestId,
        resourceType: 'GDPR_REQUEST'
      },
      action: 'REQUEST',
      outcome: 'SUCCESS',
      details: {
        rightType: 'erasure',
        grounds,
        deadline: deadline.toISOString()
      },
      metadata: {
        correlationId: encryptionService.generateUUID()
      },
      compliance: {
        gdpr: true,
        sox: false,
        iso27001: false,
        pci: false
      }
    });

    this.emit('erasureRequestReceived', { dataSubjectId, requestId, grounds, deadline });

    // Evaluate erasure request
    await this.evaluateErasureRequest(requestId, grounds);

    return rightExercise;
  }

  /**
   * Report a data breach
   */
  async reportDataBreach(breachData: Omit<DataBreachIncident, 'incidentId' | 'detectedAt' | 'notifications' | 'remediationActions' | 'status'>): Promise<string> {
    const incidentId = encryptionService.generateUUID();

    const incident: DataBreachIncident = {
      incidentId,
      detectedAt: new Date(),
      ...breachData,
      notifications: [],
      remediationActions: [],
      status: 'discovered'
    };

    this.breachIncidents.set(incidentId, incident);

    // Determine notification requirements
    const { notificationRequired } = incident;

    // Auto-notify supervisory authority if required (within 72 hours)
    if (notificationRequired.supervisoryAuthority) {
      await this.scheduleSupervisoryAuthorityNotification(incidentId);
    }

    // Auto-notify data subjects if required (without undue delay)
    if (notificationRequired.dataSubjects) {
      await this.scheduleDataSubjectNotification(incidentId);
    }

    // Log the breach
    await auditLoggingService.logEvent({
      eventType: 'DATA_BREACH_REPORTED',
      category: 'SECURITY',
      severity: 'CRITICAL',
      source: {
        service: 'gdpr-compliance',
        version: '1.0.0',
        instance: process.env.HOSTNAME || 'localhost',
        ip: 'system'
      },
      actor: {
        type: 'SYSTEM'
      },
      target: {
        resource: 'data-breach',
        resourceId: incidentId,
        resourceType: 'SECURITY_INCIDENT'
      },
      action: 'REPORT',
      outcome: 'SUCCESS',
      details: {
        breachType: incident.breachType,
        severity: incident.severity,
        affectedDataSubjects: incident.affectedDataSubjects,
        dataCategories: incident.dataCategories,
        notificationRequired
      },
      metadata: {
        correlationId: encryptionService.generateUUID()
      },
      compliance: {
        gdpr: true,
        sox: false,
        iso27001: true,
        pci: false
      }
    });

    this.emit('dataBreachReported', { incidentId, severity: incident.severity, affectedDataSubjects: incident.affectedDataSubjects });

    return incidentId;
  }

  /**
   * Generate GDPR compliance report
   */
  async generateComplianceReport(
    reportType: GDPRReport['reportType'],
    period: { start: Date; end: Date }
  ): Promise<GDPRReport> {
    const reportId = encryptionService.generateUUID();

    const report: GDPRReport = {
      reportId,
      reportType,
      period,
      generatedAt: new Date(),
      generatedBy: 'system',
      summary: {},
      details: {},
      recommendations: [],
      complianceScore: 0
    };

    switch (reportType) {
      case 'compliance_status':
        await this.generateComplianceStatusReport(report);
        break;
      case 'consent_overview':
        await this.generateConsentOverviewReport(report);
        break;
      case 'data_breach':
        await this.generateDataBreachReport(report);
        break;
      case 'subject_rights':
        await this.generateSubjectRightsReport(report);
        break;
      case 'processing_activities':
        await this.generateProcessingActivitiesReport(report);
        break;
    }

    // Calculate overall compliance score
    report.complianceScore = this.calculateComplianceScore(report);

    return report;
  }

  /**
   * Check consent validity for data processing
   */
  checkConsentValidity(dataSubjectId: string, purposeId: string): {
    valid: boolean;
    reason: string;
    renewalRequired?: boolean;
  } {
    const subject = this.dataSubjects.get(dataSubjectId);
    if (!subject) {
      return { valid: false, reason: 'Data subject not found' };
    }

    const consentRecord = subject.consentRecord;
    if (!consentRecord.isActive) {
      return { valid: false, reason: 'No active consent' };
    }

    const purpose = consentRecord.purposes.find(p => p.purposeId === purposeId);
    if (!purpose) {
      return { valid: false, reason: 'Purpose not found in consent record' };
    }

    if (!purpose.granted) {
      return { valid: false, reason: 'Consent not granted for this purpose' };
    }

    // Check if renewal is required
    if (consentRecord.renewalRequired && consentRecord.renewalRequired < new Date()) {
      return {
        valid: false,
        reason: 'Consent renewal required',
        renewalRequired: true
      };
    }

    // Check retention period
    if (purpose.retentionPeriod) {
      const expiryDate = new Date(purpose.grantedAt!.getTime() + purpose.retentionPeriod * 24 * 60 * 60 * 1000);
      if (expiryDate < new Date()) {
        return { valid: false, reason: 'Retention period exceeded' };
      }
    }

    return { valid: true, reason: 'Valid consent' };
  }

  /**
   * Private helper methods
   */

  private createEmptyConsentRecord(dataSubjectId: string): ConsentRecord {
    return {
      consentId: encryptionService.generateUUID(),
      dataSubjectId,
      purposes: [],
      consentDate: new Date(),
      consentMethod: 'explicit',
      consentSource: 'registration',
      version: this.consentVersion,
      lawfulBasis: [],
      isActive: false,
      history: []
    };
  }

  private createEmptyRights(): DataSubjectRights {
    return {
      accessRight: [],
      rectificationRight: [],
      erasureRight: [],
      restrictionRight: [],
      portabilityRight: [],
      objectionRight: []
    };
  }

  private initializeDefaultProcessingActivities(): void {
    // Initialize common processing activities
    const defaultActivities: DataProcessingActivity[] = [
      {
        activityId: 'user-registration',
        name: 'User Registration and Account Management',
        description: 'Processing of user data for account creation and management',
        controller: {
          name: 'Urnlabs AI Platform',
          contactDetails: {
            name: 'Data Protection Officer',
            email: 'dpo@urnlabs.ai',
            phone: '+1-555-0123',
            address: '123 AI Street, Tech City, TC 12345'
          }
        },
        processors: [],
        categories: [
          {
            category: 'Identity Data',
            description: 'Basic identity information',
            sensitivity: 'normal',
            fields: ['email', 'firstName', 'lastName', 'phone']
          }
        ],
        purposes: ['Account management', 'Service provision'],
        lawfulBasis: [
          {
            basis: 'contract',
            description: 'Processing necessary for the performance of a contract',
            evidence: 'Terms of Service acceptance'
          }
        ],
        recipients: [],
        retentionPeriod: 365 * 7, // 7 years
        location: {
          country: 'US',
          region: 'North America',
          adequacyDecision: false,
          safeguards: ['Standard Contractual Clauses']
        },
        securityMeasures: [
          {
            type: 'technical',
            measure: 'Encryption at rest and in transit',
            description: 'AES-256 encryption for all personal data',
            implemented: true,
            evidence: 'Security audit report'
          }
        ],
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ];

    defaultActivities.forEach(activity => {
      this.processingActivities.set(activity.activityId, activity);
    });
  }

  private async processAccessRequest(requestId: string): Promise<void> {
    const request = this.rightExercises.get(requestId);
    if (!request) return;

    try {
      // Auto-compile data subject information
      const dataSubject = Array.from(this.dataSubjects.values())
        .find(s => s.rights.accessRight.some(r => r.requestId === requestId));

      if (dataSubject) {
        const response = {
          personalData: this.sanitizePersonalData(dataSubject),
          consentRecord: dataSubject.consentRecord,
          processingActivities: dataSubject.dataProcessingActivities,
          rightsExercised: dataSubject.rights
        };

        request.status = 'completed';
        request.responseDate = new Date();
        request.responseDetails = 'Data access report generated and sent';
        request.evidence = [JSON.stringify(response)];

        this.emit('accessRequestCompleted', { requestId, dataSubjectId: dataSubject.id, response });
      }
    } catch (error) {
      request.status = 'rejected';
      request.responseDate = new Date();
      request.responseDetails = `Error processing request: ${error}`;
    }
  }

  private async evaluateErasureRequest(requestId: string, grounds: string[]): Promise<void> {
    const request = this.rightExercises.get(requestId);
    if (!request) return;

    // Simplified evaluation - in production, implement proper legal assessment
    const validGrounds = [
      'personal_data_no_longer_necessary',
      'consent_withdrawn',
      'personal_data_unlawfully_processed',
      'compliance_with_legal_obligation'
    ];

    const hasValidGrounds = grounds.some(ground => validGrounds.includes(ground));

    if (hasValidGrounds) {
      request.status = 'approved';
      request.responseDate = new Date();
      request.responseDetails = 'Erasure request approved';

      // Schedule actual data deletion
      const dataSubject = Array.from(this.dataSubjects.values())
        .find(s => s.rights.erasureRight.some(r => r.requestId === requestId));

      if (dataSubject) {
        await this.scheduleDataDeletion(dataSubject.id, 'erasure_request');
      }
    } else {
      request.status = 'rejected';
      request.responseDate = new Date();
      request.responseDetails = 'Erasure request rejected - insufficient grounds';
    }
  }

  private async scheduleDataDeletion(dataSubjectId: string, reason: string): Promise<void> {
    // Schedule data deletion (implement with job queue in production)
    this.emit('dataDeletionScheduled', { dataSubjectId, reason, scheduledFor: new Date() });
  }

  private async scheduleSupervisoryAuthorityNotification(incidentId: string): Promise<void> {
    // Schedule notification to supervisory authority within 72 hours
    const notificationDeadline = new Date(Date.now() + 72 * 60 * 60 * 1000);
    this.emit('supervisoryAuthorityNotificationScheduled', { incidentId, deadline: notificationDeadline });
  }

  private async scheduleDataSubjectNotification(incidentId: string): Promise<void> {
    // Schedule notification to affected data subjects without undue delay
    this.emit('dataSubjectNotificationScheduled', { incidentId });
  }

  private sanitizePersonalData(dataSubject: DataSubject): any {
    // Remove sensitive internal fields before sharing with data subject
    const { id, consentRecord, dataProcessingActivities, rights, ...sanitizedData } = dataSubject;
    return {
      ...sanitizedData,
      subjectId: id
    };
  }

  private async generateComplianceStatusReport(report: GDPRReport): Promise<void> {
    report.summary = {
      totalDataSubjects: this.dataSubjects.size,
      activeConsents: Array.from(this.consentRecords.values()).filter(c => c.isActive).length,
      processingActivities: this.processingActivities.size,
      dataBreaches: this.breachIncidents.size,
      pendingRequests: Array.from(this.rightExercises.values()).filter(r => r.status === 'pending').length
    };

    report.details = {
      consentBreakdown: this.getConsentBreakdown(),
      breachSummary: this.getBreachSummary(),
      rightsExercised: this.getRightsExerciseSummary()
    };

    report.recommendations = this.generateComplianceRecommendations();
  }

  private async generateConsentOverviewReport(report: GDPRReport): Promise<void> {
    const consents = Array.from(this.consentRecords.values());

    report.summary = {
      totalConsents: consents.length,
      activeConsents: consents.filter(c => c.isActive).length,
      withdrawnConsents: consents.filter(c => !c.isActive).length,
      renewalsDue: consents.filter(c => c.renewalRequired && c.renewalRequired < new Date()).length
    };

    report.details = {
      purposeBreakdown: this.getPurposeBreakdown(consents),
      methodBreakdown: this.getMethodBreakdown(consents),
      renewalSchedule: this.getRenewalSchedule(consents)
    };
  }

  private async generateDataBreachReport(report: GDPRReport): Promise<void> {
    const breaches = Array.from(this.breachIncidents.values());

    report.summary = {
      totalBreaches: breaches.length,
      severity: {
        critical: breaches.filter(b => b.severity === 'critical').length,
        high: breaches.filter(b => b.severity === 'high').length,
        medium: breaches.filter(b => b.severity === 'medium').length,
        low: breaches.filter(b => b.severity === 'low').length
      },
      totalAffectedSubjects: breaches.reduce((sum, b) => sum + b.affectedDataSubjects, 0)
    };
  }

  private async generateSubjectRightsReport(report: GDPRReport): Promise<void> {
    const requests = Array.from(this.rightExercises.values());

    report.summary = {
      totalRequests: requests.length,
      byType: {
        access: requests.filter(r => r.rightType === 'access').length,
        rectification: requests.filter(r => r.rightType === 'rectification').length,
        erasure: requests.filter(r => r.rightType === 'erasure').length,
        restriction: requests.filter(r => r.rightType === 'restriction').length,
        portability: requests.filter(r => r.rightType === 'portability').length,
        objection: requests.filter(r => r.rightType === 'objection').length
      },
      completionRate: requests.filter(r => r.status === 'completed').length / requests.length * 100
    };
  }

  private async generateProcessingActivitiesReport(report: GDPRReport): Promise<void> {
    const activities = Array.from(this.processingActivities.values());

    report.summary = {
      totalActivities: activities.length,
      byCategory: this.getCategoryBreakdown(activities),
      retentionCompliance: this.getRetentionCompliance(activities)
    };
  }

  private calculateComplianceScore(report: GDPRReport): number {
    // Simplified compliance scoring
    let score = 100;

    // Deduct points for issues
    if (report.summary.pendingRequests > 0) score -= 10;
    if (report.summary.dataBreaches > 0) score -= 20;

    return Math.max(0, score);
  }

  private getConsentBreakdown(): any {
    const consents = Array.from(this.consentRecords.values());
    return {
      byPurpose: this.getPurposeBreakdown(consents),
      byMethod: this.getMethodBreakdown(consents)
    };
  }

  private getPurposeBreakdown(consents: ConsentRecord[]): any {
    const breakdown: any = {};
    consents.forEach(consent => {
      consent.purposes.forEach(purpose => {
        if (!breakdown[purpose.category]) {
          breakdown[purpose.category] = { granted: 0, withdrawn: 0 };
        }
        if (purpose.granted) {
          breakdown[purpose.category].granted++;
        } else {
          breakdown[purpose.category].withdrawn++;
        }
      });
    });
    return breakdown;
  }

  private getMethodBreakdown(consents: ConsentRecord[]): any {
    const breakdown: any = {};
    consents.forEach(consent => {
      const method = consent.consentMethod;
      breakdown[method] = (breakdown[method] || 0) + 1;
    });
    return breakdown;
  }

  private getRenewalSchedule(consents: ConsentRecord[]): any {
    return consents
      .filter(c => c.renewalRequired)
      .map(c => ({
        consentId: c.consentId,
        dataSubjectId: c.dataSubjectId,
        renewalDue: c.renewalRequired,
        overdue: c.renewalRequired! < new Date()
      }));
  }

  private getBreachSummary(): any {
    const breaches = Array.from(this.breachIncidents.values());
    return {
      totalBreaches: breaches.length,
      bySeverity: {
        critical: breaches.filter(b => b.severity === 'critical').length,
        high: breaches.filter(b => b.severity === 'high').length,
        medium: breaches.filter(b => b.severity === 'medium').length,
        low: breaches.filter(b => b.severity === 'low').length
      },
      recentBreaches: breaches
        .filter(b => b.detectedAt > new Date(Date.now() - 30 * 24 * 60 * 60 * 1000))
        .length
    };
  }

  private getRightsExerciseSummary(): any {
    const requests = Array.from(this.rightExercises.values());
    return {
      totalRequests: requests.length,
      completedOnTime: requests.filter(r =>
        r.status === 'completed' &&
        r.responseDate &&
        r.responseDate <= r.deadline
      ).length,
      overdue: requests.filter(r =>
        r.status !== 'completed' &&
        new Date() > r.deadline
      ).length
    };
  }

  private getCategoryBreakdown(activities: DataProcessingActivity[]): any {
    const breakdown: any = {};
    activities.forEach(activity => {
      activity.categories.forEach(category => {
        const key = category.sensitivity;
        breakdown[key] = (breakdown[key] || 0) + 1;
      });
    });
    return breakdown;
  }

  private getRetentionCompliance(activities: DataProcessingActivity[]): any {
    return {
      totalActivities: activities.length,
      withRetentionPolicies: activities.filter(a => a.retentionPeriod > 0).length,
      complianceRate: activities.filter(a => a.retentionPeriod > 0).length / activities.length * 100
    };
  }

  private generateComplianceRecommendations(): string[] {
    const recommendations: string[] = [];

    const overdueRenewals = Array.from(this.consentRecords.values())
      .filter(c => c.renewalRequired && c.renewalRequired < new Date()).length;

    if (overdueRenewals > 0) {
      recommendations.push(`${overdueRenewals} consent renewals are overdue`);
    }

    const pendingRequests = Array.from(this.rightExercises.values())
      .filter(r => r.status === 'pending').length;

    if (pendingRequests > 0) {
      recommendations.push(`${pendingRequests} data subject requests are pending`);
    }

    const unhandledBreaches = Array.from(this.breachIncidents.values())
      .filter(b => b.status !== 'resolved').length;

    if (unhandledBreaches > 0) {
      recommendations.push(`${unhandledBreaches} data breaches require attention`);
    }

    return recommendations;
  }

  private setupPeriodicTasks(): void {
    // Check for expired consents daily
    setInterval(() => {
      this.checkExpiredConsents();
    }, 24 * 60 * 60 * 1000);

    // Check for overdue requests hourly
    setInterval(() => {
      this.checkOverdueRequests();
    }, 60 * 60 * 1000);
  }

  private checkExpiredConsents(): void {
    const now = new Date();
    Array.from(this.consentRecords.values()).forEach(consent => {
      if (consent.renewalRequired && consent.renewalRequired < now && consent.isActive) {
        this.emit('consentExpired', { consentId: consent.consentId, dataSubjectId: consent.dataSubjectId });
      }
    });
  }

  private checkOverdueRequests(): void {
    const now = new Date();
    Array.from(this.rightExercises.values()).forEach(request => {
      if (request.deadline < now && request.status !== 'completed') {
        this.emit('requestOverdue', { requestId: request.requestId, deadline: request.deadline });
      }
    });
  }
}

export const gdprComplianceService = new GDPRComplianceService();