import { EventEmitter } from 'events';
import { encryptionService } from './encryption';
import { auditLoggingService } from './audit-logging';
import { gdprComplianceService } from './gdpr-compliance';

export interface SecurityIncident {
  incidentId: string;
  title: string;
  description: string;
  type: IncidentType;
  category: IncidentCategory;
  severity: IncidentSeverity;
  priority: IncidentPriority;
  status: IncidentStatus;
  source: IncidentSource;
  detectedAt: Date;
  reportedAt?: Date;
  assignedTo?: string;
  assignedTeam?: string;
  escalatedTo?: string;
  resolvedAt?: Date;
  closedAt?: Date;
  affectedSystems: AffectedSystem[];
  affectedUsers: AffectedUser[];
  indicators: ThreatIndicator[];
  timeline: IncidentTimelineEntry[];
  response: IncidentResponse;
  forensics: ForensicsData;
  lessons: LessonsLearned;
  relatedIncidents: string[];
  tags: string[];
  metadata: Record<string, any>;
}

export type IncidentType =
  | 'malware'
  | 'phishing'
  | 'data_breach'
  | 'unauthorized_access'
  | 'ddos'
  | 'insider_threat'
  | 'social_engineering'
  | 'system_compromise'
  | 'data_theft'
  | 'ransomware'
  | 'vulnerability_exploit'
  | 'policy_violation'
  | 'other';

export type IncidentCategory =
  | 'confidentiality'
  | 'integrity'
  | 'availability'
  | 'privacy'
  | 'compliance'
  | 'physical'
  | 'operational';

export type IncidentSeverity = 'low' | 'medium' | 'high' | 'critical';
export type IncidentPriority = 'low' | 'medium' | 'high' | 'urgent';
export type IncidentStatus =
  | 'detected'
  | 'triaged'
  | 'investigating'
  | 'containing'
  | 'eradicating'
  | 'recovering'
  | 'resolved'
  | 'closed'
  | 'false_positive';

export interface IncidentSource {
  type: 'automated' | 'manual' | 'external' | 'customer';
  detector: string;
  confidence: number;
  rawData?: any;
}

export interface AffectedSystem {
  systemId: string;
  name: string;
  type: 'server' | 'database' | 'application' | 'network' | 'endpoint' | 'cloud_service';
  criticality: 'low' | 'medium' | 'high' | 'critical';
  compromised: boolean;
  isolationStatus: 'none' | 'network' | 'full' | 'offline';
  evidence: string[];
}

export interface AffectedUser {
  userId: string;
  email: string;
  role: string;
  impactType: 'account_compromise' | 'data_exposure' | 'service_disruption';
  notified: boolean;
  notifiedAt?: Date;
  actions: string[];
}

export interface ThreatIndicator {
  type: 'ip' | 'domain' | 'hash' | 'email' | 'url' | 'file' | 'registry' | 'process';
  value: string;
  confidence: number;
  source: string;
  firstSeen: Date;
  lastSeen: Date;
  tags: string[];
  context?: string;
}

export interface IncidentTimelineEntry {
  timestamp: Date;
  event: string;
  description: string;
  actor: string;
  evidence?: string[];
  automated: boolean;
}

export interface IncidentResponse {
  containmentActions: ResponseAction[];
  eradicationActions: ResponseAction[];
  recoveryActions: ResponseAction[];
  communicationPlan: CommunicationPlan;
  escalationMatrix: EscalationMatrix;
  resourcesDeployed: ResourceDeployment[];
}

export interface ResponseAction {
  actionId: string;
  type: ActionType;
  description: string;
  assignedTo: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped';
  startedAt?: Date;
  completedAt?: Date;
  evidence?: string[];
  outcome?: string;
  dependencies?: string[];
  automation?: AutomationConfig;
}

export type ActionType =
  | 'isolate_system'
  | 'block_ip'
  | 'disable_account'
  | 'patch_vulnerability'
  | 'update_firewall'
  | 'backup_data'
  | 'forensic_imaging'
  | 'malware_removal'
  | 'password_reset'
  | 'notify_stakeholders'
  | 'document_evidence'
  | 'legal_hold'
  | 'restore_from_backup'
  | 'system_hardening'
  | 'threat_hunting';

export interface AutomationConfig {
  enabled: boolean;
  script?: string;
  apiEndpoint?: string;
  parameters?: Record<string, any>;
  approvalRequired: boolean;
}

export interface CommunicationPlan {
  internalNotifications: NotificationConfig[];
  externalNotifications: NotificationConfig[];
  mediaResponse?: MediaResponsePlan;
  customerCommunication?: CustomerCommunicationPlan;
}

export interface NotificationConfig {
  recipient: string;
  method: 'email' | 'sms' | 'slack' | 'phone' | 'dashboard';
  triggers: string[];
  template: string;
  urgency: 'low' | 'medium' | 'high' | 'urgent';
}

export interface MediaResponsePlan {
  spokesperson: string;
  keyMessages: string[];
  factSheet?: string;
  pressRelease?: string;
}

export interface CustomerCommunicationPlan {
  segments: CustomerSegment[];
  channels: string[];
  timeline: CommunicationTimeline[];
}

export interface CustomerSegment {
  segment: string;
  criteria: string;
  message: string;
  priority: number;
}

export interface CommunicationTimeline {
  timing: string;
  audience: string;
  message: string;
  channel: string;
}

export interface EscalationMatrix {
  levels: EscalationLevel[];
  criteria: EscalationCriteria[];
}

export interface EscalationLevel {
  level: number;
  name: string;
  roles: string[];
  contacts: string[];
  timeThreshold: number; // minutes
}

export interface EscalationCriteria {
  condition: string;
  targetLevel: number;
  autoEscalate: boolean;
}

export interface ResourceDeployment {
  resourceType: 'personnel' | 'tools' | 'external_services';
  resource: string;
  deployedAt: Date;
  cost?: number;
  effectiveness?: number;
}

export interface ForensicsData {
  evidenceCollected: Evidence[];
  analysisResults: AnalysisResult[];
  timeline: ForensicsTimeline[];
  chainOfCustody: CustodyRecord[];
  findings: ForensicsFindings;
}

export interface Evidence {
  evidenceId: string;
  type: 'disk_image' | 'memory_dump' | 'network_logs' | 'system_logs' | 'file_sample' | 'registry_export';
  source: string;
  collectedAt: Date;
  collectedBy: string;
  hash: string;
  size: number;
  location: string;
  integrity: boolean;
}

export interface AnalysisResult {
  analysisId: string;
  evidenceId: string;
  tool: string;
  analysisType: string;
  results: any;
  findings: string[];
  confidence: number;
  analysedAt: Date;
  analysedBy: string;
}

export interface ForensicsTimeline {
  timestamp: Date;
  event: string;
  source: string;
  evidence: string;
  confidence: number;
}

export interface CustodyRecord {
  evidenceId: string;
  transferredAt: Date;
  from: string;
  to: string;
  purpose: string;
  signature: string;
}

export interface ForensicsFindings {
  attackVector: string;
  attackTimeline: Date[];
  toolsUsed: string[];
  dataAccessed: string[];
  persistenceMechanisms: string[];
  lateralMovement: string[];
  exfiltrationMethods: string[];
  attribution: AttributionData;
}

export interface AttributionData {
  threatActor?: string;
  campaign?: string;
  ttps: string[]; // Tactics, Techniques, and Procedures
  confidence: number;
  indicators: ThreatIndicator[];
}

export interface LessonsLearned {
  improvements: Improvement[];
  recommendations: Recommendation[];
  processChanges: ProcessChange[];
  trainingNeeds: TrainingNeed[];
  toolGaps: ToolGap[];
}

export interface Improvement {
  area: string;
  description: string;
  priority: 'low' | 'medium' | 'high';
  owner: string;
  deadline?: Date;
  status: 'proposed' | 'approved' | 'in_progress' | 'completed';
}

export interface Recommendation {
  category: string;
  recommendation: string;
  justification: string;
  cost?: number;
  timeToImplement?: number;
  riskReduction: number;
}

export interface ProcessChange {
  process: string;
  currentState: string;
  proposedState: string;
  impact: string;
  effort: 'low' | 'medium' | 'high';
}

export interface TrainingNeed {
  audience: string;
  topic: string;
  urgency: 'low' | 'medium' | 'high';
  deliveryMethod: string;
}

export interface ToolGap {
  capability: string;
  currentGap: string;
  proposedSolution: string;
  cost?: number;
}

export interface PlaybookTemplate {
  templateId: string;
  name: string;
  description: string;
  incidentTypes: IncidentType[];
  phases: PlaybookPhase[];
  automations: AutomationRule[];
  escalationRules: EscalationRule[];
}

export interface PlaybookPhase {
  phase: string;
  actions: ResponseAction[];
  criteria: string[];
  timeLimit?: number;
}

export interface AutomationRule {
  ruleId: string;
  trigger: string;
  conditions: string[];
  actions: ResponseAction[];
  approvalRequired: boolean;
}

export interface EscalationRule {
  ruleId: string;
  conditions: string[];
  targetLevel: number;
  autoExecute: boolean;
  notification: NotificationConfig;
}

export class IncidentResponseService extends EventEmitter {
  private incidents: Map<string, SecurityIncident> = new Map();
  private playbookTemplates: Map<string, PlaybookTemplate> = new Map();
  private activePlaybooks: Map<string, string> = new Map(); // incidentId -> templateId
  private threatIntelligence: Map<string, ThreatIndicator> = new Map();

  private readonly slaTargets = {
    detection: 15, // minutes
    triage: 30, // minutes
    containment: 2 * 60, // 2 hours
    communication: 1 * 60, // 1 hour
    resolution: 24 * 60 // 24 hours
  };

  constructor() {
    super();
    this.initializeDefaultPlaybooks();
    this.setupAutomationRules();
    this.startThreatIntelligenceFeeds();
    this.setupPeriodicTasks();
  }

  /**
   * Create a new security incident
   */
  async createIncident(incidentData: Partial<SecurityIncident>): Promise<string> {
    const incidentId = encryptionService.generateUUID();

    const incident: SecurityIncident = {
      incidentId,
      title: incidentData.title || 'Security Incident',
      description: incidentData.description || 'Security incident detected',
      type: incidentData.type || 'other',
      category: incidentData.category || 'operational',
      severity: incidentData.severity || 'medium',
      priority: this.calculatePriority(incidentData.severity || 'medium', incidentData.category || 'operational'),
      status: 'detected',
      source: incidentData.source || {
        type: 'automated',
        detector: 'security-monitor',
        confidence: 0.8
      },
      detectedAt: new Date(),
      affectedSystems: incidentData.affectedSystems || [],
      affectedUsers: incidentData.affectedUsers || [],
      indicators: incidentData.indicators || [],
      timeline: [{
        timestamp: new Date(),
        event: 'incident_created',
        description: 'Security incident created',
        actor: 'system',
        automated: true
      }],
      response: {
        containmentActions: [],
        eradicationActions: [],
        recoveryActions: [],
        communicationPlan: this.getDefaultCommunicationPlan(),
        escalationMatrix: this.getDefaultEscalationMatrix(),
        resourcesDeployed: []
      },
      forensics: {
        evidenceCollected: [],
        analysisResults: [],
        timeline: [],
        chainOfCustody: [],
        findings: {
          attackVector: 'unknown',
          attackTimeline: [],
          toolsUsed: [],
          dataAccessed: [],
          persistenceMechanisms: [],
          lateralMovement: [],
          exfiltrationMethods: [],
          attribution: {
            ttps: [],
            confidence: 0,
            indicators: []
          }
        }
      },
      lessons: {
        improvements: [],
        recommendations: [],
        processChanges: [],
        trainingNeeds: [],
        toolGaps: []
      },
      relatedIncidents: [],
      tags: incidentData.tags || [],
      metadata: incidentData.metadata || {}
    };

    this.incidents.set(incidentId, incident);

    // Auto-assign playbook based on incident type
    await this.assignPlaybook(incidentId, incident.type);

    // Auto-triage if possible
    await this.autoTriage(incidentId);

    // Log incident creation
    await auditLoggingService.logEvent({
      eventType: 'SECURITY_INCIDENT_CREATED',
      category: 'SECURITY',
      severity: incident.severity.toUpperCase() as any,
      source: {
        service: 'incident-response',
        version: '1.0.0',
        instance: process.env.HOSTNAME || 'localhost',
        ip: 'system'
      },
      actor: {
        type: 'SYSTEM'
      },
      target: {
        resource: 'security-incident',
        resourceId: incidentId,
        resourceType: 'SECURITY_INCIDENT'
      },
      action: 'CREATE',
      outcome: 'SUCCESS',
      details: {
        type: incident.type,
        category: incident.category,
        severity: incident.severity,
        priority: incident.priority
      },
      metadata: {
        correlationId: incidentId
      },
      compliance: {
        gdpr: incident.type === 'data_breach',
        sox: false,
        iso27001: true,
        pci: false
      }
    });

    this.emit('incidentCreated', { incidentId, incident });

    return incidentId;
  }

  /**
   * Update incident status and execute appropriate actions
   */
  async updateIncidentStatus(incidentId: string, newStatus: IncidentStatus, notes?: string): Promise<void> {
    const incident = this.incidents.get(incidentId);
    if (!incident) {
      throw new Error('Incident not found');
    }

    const oldStatus = incident.status;
    incident.status = newStatus;

    // Add timeline entry
    incident.timeline.push({
      timestamp: new Date(),
      event: 'status_change',
      description: `Status changed from ${oldStatus} to ${newStatus}`,
      actor: 'system',
      automated: true
    });

    if (notes) {
      incident.timeline.push({
        timestamp: new Date(),
        event: 'notes_added',
        description: notes,
        actor: 'system',
        automated: false
      });
    }

    // Execute status-specific actions
    switch (newStatus) {
      case 'triaged':
        await this.executeTriageActions(incidentId);
        break;
      case 'investigating':
        await this.executeInvestigationActions(incidentId);
        break;
      case 'containing':
        await this.executeContainmentActions(incidentId);
        break;
      case 'eradicating':
        await this.executeEradicationActions(incidentId);
        break;
      case 'recovering':
        await this.executeRecoveryActions(incidentId);
        break;
      case 'resolved':
        await this.executeResolutionActions(incidentId);
        incident.resolvedAt = new Date();
        break;
      case 'closed':
        await this.executeClosureActions(incidentId);
        incident.closedAt = new Date();
        break;
    }

    // Check if GDPR notification is required
    if (incident.type === 'data_breach' && newStatus === 'triaged') {
      await this.checkGDPRNotificationRequirements(incidentId);
    }

    // Log status change
    await auditLoggingService.logEvent({
      eventType: 'INCIDENT_STATUS_CHANGE',
      category: 'SECURITY',
      severity: 'MEDIUM',
      source: {
        service: 'incident-response',
        version: '1.0.0',
        instance: process.env.HOSTNAME || 'localhost',
        ip: 'system'
      },
      actor: {
        type: 'SYSTEM'
      },
      target: {
        resource: 'security-incident',
        resourceId: incidentId,
        resourceType: 'SECURITY_INCIDENT'
      },
      action: 'UPDATE_STATUS',
      outcome: 'SUCCESS',
      details: {
        oldStatus,
        newStatus,
        notes
      },
      metadata: {
        correlationId: incidentId
      },
      compliance: {
        gdpr: incident.type === 'data_breach',
        sox: false,
        iso27001: true,
        pci: false
      }
    });

    this.emit('incidentStatusChanged', { incidentId, oldStatus, newStatus });
  }

  /**
   * Add response action to incident
   */
  async addResponseAction(
    incidentId: string,
    action: Omit<ResponseAction, 'actionId'>
  ): Promise<string> {
    const incident = this.incidents.get(incidentId);
    if (!incident) {
      throw new Error('Incident not found');
    }

    const actionId = encryptionService.generateUUID();
    const responseAction: ResponseAction = {
      actionId,
      ...action
    };

    // Add to appropriate action list
    switch (action.type) {
      case 'isolate_system':
      case 'block_ip':
      case 'disable_account':
        incident.response.containmentActions.push(responseAction);
        break;
      case 'malware_removal':
      case 'patch_vulnerability':
      case 'system_hardening':
        incident.response.eradicationActions.push(responseAction);
        break;
      case 'restore_from_backup':
      case 'password_reset':
        incident.response.recoveryActions.push(responseAction);
        break;
    }

    // Execute if automation is enabled and no approval required
    if (responseAction.automation?.enabled && !responseAction.automation.approvalRequired) {
      await this.executeAutomatedAction(incidentId, actionId);
    }

    // Add timeline entry
    incident.timeline.push({
      timestamp: new Date(),
      event: 'action_added',
      description: `Response action added: ${action.description}`,
      actor: 'system',
      automated: true
    });

    this.emit('responseActionAdded', { incidentId, actionId, action: responseAction });

    return actionId;
  }

  /**
   * Execute automated response action
   */
  async executeAutomatedAction(incidentId: string, actionId: string): Promise<void> {
    const incident = this.incidents.get(incidentId);
    if (!incident) {
      throw new Error('Incident not found');
    }

    // Find the action
    const allActions = [
      ...incident.response.containmentActions,
      ...incident.response.eradicationActions,
      ...incident.response.recoveryActions
    ];

    const action = allActions.find(a => a.actionId === actionId);
    if (!action || !action.automation?.enabled) {
      throw new Error('Action not found or automation not enabled');
    }

    action.status = 'in_progress';
    action.startedAt = new Date();

    try {
      // Execute automation based on type
      switch (action.type) {
        case 'block_ip':
          await this.blockIPAddress(action.automation.parameters?.ip);
          break;
        case 'disable_account':
          await this.disableUserAccount(action.automation.parameters?.userId);
          break;
        case 'isolate_system':
          await this.isolateSystem(action.automation.parameters?.systemId);
          break;
        default:
          throw new Error(`Automation not implemented for action type: ${action.type}`);
      }

      action.status = 'completed';
      action.completedAt = new Date();
      action.outcome = 'Automated action executed successfully';

    } catch (error) {
      action.status = 'failed';
      action.completedAt = new Date();
      action.outcome = `Automation failed: ${error}`;
    }

    // Add timeline entry
    incident.timeline.push({
      timestamp: new Date(),
      event: 'automated_action_executed',
      description: `Automated action ${action.type} ${action.status}`,
      actor: 'automation',
      automated: true
    });

    this.emit('automatedActionExecuted', { incidentId, actionId, status: action.status });
  }

  /**
   * Collect digital evidence
   */
  async collectEvidence(
    incidentId: string,
    evidenceData: Omit<Evidence, 'evidenceId' | 'collectedAt' | 'hash' | 'integrity'>
  ): Promise<string> {
    const incident = this.incidents.get(incidentId);
    if (!incident) {
      throw new Error('Incident not found');
    }

    const evidenceId = encryptionService.generateUUID();
    const evidence: Evidence = {
      evidenceId,
      ...evidenceData,
      collectedAt: new Date(),
      hash: encryptionService.createHMAC(evidenceData.source + evidenceData.location, evidenceId),
      integrity: true
    };

    incident.forensics.evidenceCollected.push(evidence);

    // Create chain of custody record
    const custodyRecord: CustodyRecord = {
      evidenceId,
      transferredAt: new Date(),
      from: 'system',
      to: evidenceData.collectedBy,
      purpose: 'Initial collection',
      signature: encryptionService.createHMAC(evidenceId + evidenceData.collectedBy, 'custody')
    };

    incident.forensics.chainOfCustody.push(custodyRecord);

    // Add timeline entry
    incident.timeline.push({
      timestamp: new Date(),
      event: 'evidence_collected',
      description: `Evidence collected: ${evidence.type} from ${evidence.source}`,
      actor: evidence.collectedBy,
      evidence: [evidenceId],
      automated: false
    });

    this.emit('evidenceCollected', { incidentId, evidenceId, evidence });

    return evidenceId;
  }

  /**
   * Generate incident report
   */
  async generateIncidentReport(incidentId: string): Promise<any> {
    const incident = this.incidents.get(incidentId);
    if (!incident) {
      throw new Error('Incident not found');
    }

    const report = {
      incident: {
        id: incident.incidentId,
        title: incident.title,
        description: incident.description,
        type: incident.type,
        category: incident.category,
        severity: incident.severity,
        priority: incident.priority,
        status: incident.status,
        detectedAt: incident.detectedAt,
        resolvedAt: incident.resolvedAt,
        duration: incident.resolvedAt
          ? incident.resolvedAt.getTime() - incident.detectedAt.getTime()
          : Date.now() - incident.detectedAt.getTime()
      },
      impact: {
        affectedSystems: incident.affectedSystems.length,
        affectedUsers: incident.affectedUsers.length,
        businessImpact: this.calculateBusinessImpact(incident),
        financialImpact: this.calculateFinancialImpact(incident)
      },
      response: {
        totalActions: incident.response.containmentActions.length +
                     incident.response.eradicationActions.length +
                     incident.response.recoveryActions.length,
        completedActions: this.getCompletedActions(incident).length,
        responseTime: this.calculateResponseTime(incident),
        containmentTime: this.calculateContainmentTime(incident)
      },
      forensics: {
        evidenceCollected: incident.forensics.evidenceCollected.length,
        analysisCompleted: incident.forensics.analysisResults.length,
        findings: incident.forensics.findings
      },
      lessons: incident.lessons,
      timeline: incident.timeline,
      slaCompliance: this.calculateSLACompliance(incident)
    };

    return report;
  }

  /**
   * Private helper methods
   */

  private calculatePriority(severity: IncidentSeverity, category: IncidentCategory): IncidentPriority {
    if (severity === 'critical') return 'urgent';
    if (severity === 'high' && (category === 'confidentiality' || category === 'availability')) return 'high';
    if (severity === 'medium') return 'medium';
    return 'low';
  }

  private async assignPlaybook(incidentId: string, incidentType: IncidentType): Promise<void> {
    // Find appropriate playbook template
    const template = Array.from(this.playbookTemplates.values())
      .find(t => t.incidentTypes.includes(incidentType));

    if (template) {
      this.activePlaybooks.set(incidentId, template.templateId);
      await this.initializePlaybookActions(incidentId, template);
    }
  }

  private async initializePlaybookActions(incidentId: string, template: PlaybookTemplate): Promise<void> {
    const incident = this.incidents.get(incidentId);
    if (!incident) return;

    // Add predefined actions from playbook
    for (const phase of template.phases) {
      for (const action of phase.actions) {
        const newAction: ResponseAction = {
          ...action,
          actionId: encryptionService.generateUUID(),
          status: 'pending'
        };

        switch (phase.phase) {
          case 'containment':
            incident.response.containmentActions.push(newAction);
            break;
          case 'eradication':
            incident.response.eradicationActions.push(newAction);
            break;
          case 'recovery':
            incident.response.recoveryActions.push(newAction);
            break;
        }
      }
    }
  }

  private async autoTriage(incidentId: string): Promise<void> {
    const incident = this.incidents.get(incidentId);
    if (!incident) return;

    // Auto-triage based on indicators and threat intelligence
    let confidence = incident.source.confidence;

    // Check threat indicators against intelligence
    for (const indicator of incident.indicators) {
      const knownThreat = this.threatIntelligence.get(indicator.value);
      if (knownThreat) {
        confidence = Math.max(confidence, knownThreat.confidence);
        incident.severity = this.escalateSeverity(incident.severity);
      }
    }

    // Auto-escalate if high confidence and critical systems affected
    const hasCriticalSystems = incident.affectedSystems.some(s => s.criticality === 'critical');
    if (confidence > 0.8 && hasCriticalSystems) {
      incident.severity = 'critical';
      incident.priority = 'urgent';
    }

    // Update status to triaged if auto-triage was successful
    if (confidence > 0.7) {
      await this.updateIncidentStatus(incidentId, 'triaged', 'Auto-triaged based on threat intelligence');
    }
  }

  private escalateSeverity(currentSeverity: IncidentSeverity): IncidentSeverity {
    switch (currentSeverity) {
      case 'low': return 'medium';
      case 'medium': return 'high';
      case 'high': return 'critical';
      case 'critical': return 'critical';
    }
  }

  private async executeTriageActions(incidentId: string): Promise<void> {
    // Initial assessment and classification
    const incident = this.incidents.get(incidentId);
    if (!incident) return;

    // Auto-assign to appropriate team
    incident.assignedTeam = this.determineAssignedTeam(incident.type);

    // Start initial containment if automated
    const urgentActions = incident.response.containmentActions
      .filter(a => a.priority === 'urgent' && a.automation?.enabled);

    for (const action of urgentActions) {
      await this.executeAutomatedAction(incidentId, action.actionId);
    }
  }

  private async executeInvestigationActions(incidentId: string): Promise<void> {
    // Start forensic collection and analysis
    const incident = this.incidents.get(incidentId);
    if (!incident) return;

    // Auto-collect standard evidence
    for (const system of incident.affectedSystems) {
      if (system.compromised) {
        await this.collectEvidence(incidentId, {
          type: 'system_logs',
          source: system.name,
          collectedBy: 'automated-forensics',
          size: 0,
          location: `/forensics/${incidentId}/${system.systemId}/logs`
        });
      }
    }
  }

  private async executeContainmentActions(incidentId: string): Promise<void> {
    const incident = this.incidents.get(incidentId);
    if (!incident) return;

    // Execute all pending containment actions
    const pendingActions = incident.response.containmentActions
      .filter(a => a.status === 'pending');

    for (const action of pendingActions) {
      if (action.automation?.enabled) {
        await this.executeAutomatedAction(incidentId, action.actionId);
      }
    }
  }

  private async executeEradicationActions(incidentId: string): Promise<void> {
    const incident = this.incidents.get(incidentId);
    if (!incident) return;

    // Execute eradication actions
    const pendingActions = incident.response.eradicationActions
      .filter(a => a.status === 'pending');

    for (const action of pendingActions) {
      if (action.automation?.enabled) {
        await this.executeAutomatedAction(incidentId, action.actionId);
      }
    }
  }

  private async executeRecoveryActions(incidentId: string): Promise<void> {
    const incident = this.incidents.get(incidentId);
    if (!incident) return;

    // Execute recovery actions
    const pendingActions = incident.response.recoveryActions
      .filter(a => a.status === 'pending');

    for (const action of pendingActions) {
      if (action.automation?.enabled) {
        await this.executeAutomatedAction(incidentId, action.actionId);
      }
    }
  }

  private async executeResolutionActions(incidentId: string): Promise<void> {
    // Generate incident report and lessons learned
    const report = await this.generateIncidentReport(incidentId);

    // Auto-generate lessons learned recommendations
    await this.generateLessonsLearned(incidentId);

    this.emit('incidentResolved', { incidentId, report });
  }

  private async executeClosureActions(incidentId: string): Promise<void> {
    // Final documentation and archival
    const incident = this.incidents.get(incidentId);
    if (!incident) return;

    // Archive evidence
    await this.archiveEvidence(incidentId);

    // Update threat intelligence
    await this.updateThreatIntelligence(incident);

    this.emit('incidentClosed', { incidentId });
  }

  private async checkGDPRNotificationRequirements(incidentId: string): Promise<void> {
    const incident = this.incidents.get(incidentId);
    if (!incident || incident.type !== 'data_breach') return;

    // Determine if personal data is involved
    const personalDataInvolved = incident.affectedSystems.some(s =>
      s.name.includes('user') || s.name.includes('personal') || s.name.includes('customer')
    );

    if (personalDataInvolved) {
      // Report to GDPR compliance service
      await gdprComplianceService.reportDataBreach({
        reportedAt: new Date(),
        dataController: 'Urnlabs AI Platform',
        affectedDataSubjects: incident.affectedUsers.length,
        dataCategories: ['identity_data', 'contact_data'],
        breachType: 'confidentiality',
        severity: incident.severity,
        description: incident.description,
        cause: 'Security incident',
        technicalMeasures: incident.response.containmentActions.map(a => a.description),
        organizationalMeasures: incident.response.eradicationActions.map(a => a.description),
        riskAssessment: {
          likelihood: incident.severity === 'critical' ? 'high' : 'medium',
          impact: incident.severity === 'critical' ? 'high' : 'medium',
          riskLevel: incident.severity === 'critical' ? 'very_high' : 'high',
          factors: ['unauthorized_access', 'data_exposure'],
          mitigation: ['immediate_containment', 'system_isolation']
        },
        notificationRequired: {
          supervisoryAuthority: incident.severity === 'high' || incident.severity === 'critical',
          dataSubjects: incident.affectedUsers.length > 0
        }
      });
    }
  }

  private determineAssignedTeam(incidentType: IncidentType): string {
    const teamMapping: Record<IncidentType, string> = {
      'malware': 'security-team',
      'phishing': 'security-team',
      'data_breach': 'privacy-team',
      'unauthorized_access': 'security-team',
      'ddos': 'infrastructure-team',
      'insider_threat': 'security-team',
      'social_engineering': 'security-team',
      'system_compromise': 'infrastructure-team',
      'data_theft': 'privacy-team',
      'ransomware': 'security-team',
      'vulnerability_exploit': 'security-team',
      'policy_violation': 'compliance-team',
      'other': 'security-team'
    };

    return teamMapping[incidentType] || 'security-team';
  }

  private async blockIPAddress(ip: string): Promise<void> {
    // Implement IP blocking automation
    console.log(`Blocking IP address: ${ip}`);
    // In production, integrate with firewall/WAF APIs
  }

  private async disableUserAccount(userId: string): Promise<void> {
    // Implement account disabling automation
    console.log(`Disabling user account: ${userId}`);
    // In production, integrate with identity management APIs
  }

  private async isolateSystem(systemId: string): Promise<void> {
    // Implement system isolation automation
    console.log(`Isolating system: ${systemId}`);
    // In production, integrate with network management APIs
  }

  private getDefaultCommunicationPlan(): CommunicationPlan {
    return {
      internalNotifications: [
        {
          recipient: 'security-team',
          method: 'slack',
          triggers: ['incident_created', 'status_change'],
          template: 'security_incident_notification',
          urgency: 'high'
        }
      ],
      externalNotifications: []
    };
  }

  private getDefaultEscalationMatrix(): EscalationMatrix {
    return {
      levels: [
        {
          level: 1,
          name: 'Security Team',
          roles: ['security_analyst', 'incident_responder'],
          contacts: ['security-team@urnlabs.ai'],
          timeThreshold: 30
        },
        {
          level: 2,
          name: 'Security Manager',
          roles: ['security_manager'],
          contacts: ['security-manager@urnlabs.ai'],
          timeThreshold: 120
        },
        {
          level: 3,
          name: 'CISO',
          roles: ['ciso'],
          contacts: ['ciso@urnlabs.ai'],
          timeThreshold: 240
        }
      ],
      criteria: [
        {
          condition: 'severity = critical',
          targetLevel: 2,
          autoEscalate: true
        },
        {
          condition: 'no_response_in_timeframe',
          targetLevel: 2,
          autoEscalate: true
        }
      ]
    };
  }

  private getCompletedActions(incident: SecurityIncident): ResponseAction[] {
    return [
      ...incident.response.containmentActions,
      ...incident.response.eradicationActions,
      ...incident.response.recoveryActions
    ].filter(a => a.status === 'completed');
  }

  private calculateResponseTime(incident: SecurityIncident): number {
    const firstResponse = incident.timeline.find(t =>
      t.event === 'status_change' && t.description.includes('triaged')
    );

    if (firstResponse) {
      return firstResponse.timestamp.getTime() - incident.detectedAt.getTime();
    }

    return 0;
  }

  private calculateContainmentTime(incident: SecurityIncident): number {
    const containmentEntry = incident.timeline.find(t =>
      t.event === 'status_change' && t.description.includes('containing')
    );

    if (containmentEntry) {
      return containmentEntry.timestamp.getTime() - incident.detectedAt.getTime();
    }

    return 0;
  }

  private calculateBusinessImpact(incident: SecurityIncident): string {
    if (incident.affectedSystems.some(s => s.criticality === 'critical')) {
      return 'high';
    }
    if (incident.affectedUsers.length > 1000) {
      return 'medium';
    }
    return 'low';
  }

  private calculateFinancialImpact(incident: SecurityIncident): number {
    // Simplified financial impact calculation
    let impact = 0;

    impact += incident.affectedUsers.length * 50; // $50 per affected user
    impact += incident.response.resourcesDeployed.reduce((sum, r) => sum + (r.cost || 0), 0);

    if (incident.type === 'data_breach') {
      impact += 100000; // Base cost for data breach
    }

    return impact;
  }

  private calculateSLACompliance(incident: SecurityIncident): any {
    const responseTime = this.calculateResponseTime(incident);
    const containmentTime = this.calculateContainmentTime(incident);

    return {
      detection: responseTime <= this.slaTargets.detection * 60000,
      triage: responseTime <= this.slaTargets.triage * 60000,
      containment: containmentTime <= this.slaTargets.containment * 60000,
      overall: responseTime <= this.slaTargets.triage * 60000 &&
               containmentTime <= this.slaTargets.containment * 60000
    };
  }

  private async generateLessonsLearned(incidentId: string): Promise<void> {
    const incident = this.incidents.get(incidentId);
    if (!incident) return;

    // Auto-generate improvement recommendations
    const improvements: Improvement[] = [];

    if (this.calculateResponseTime(incident) > this.slaTargets.triage * 60000) {
      improvements.push({
        area: 'response_time',
        description: 'Improve incident detection and response time',
        priority: 'high',
        owner: 'security-team',
        status: 'proposed'
      });
    }

    if (incident.indicators.length === 0) {
      improvements.push({
        area: 'threat_detection',
        description: 'Enhance threat intelligence and indicator collection',
        priority: 'medium',
        owner: 'security-team',
        status: 'proposed'
      });
    }

    incident.lessons.improvements = improvements;
  }

  private async archiveEvidence(incidentId: string): Promise<void> {
    // Archive evidence for long-term storage
    const incident = this.incidents.get(incidentId);
    if (!incident) return;

    for (const evidence of incident.forensics.evidenceCollected) {
      // In production, move to secure long-term storage
      console.log(`Archiving evidence: ${evidence.evidenceId}`);
    }
  }

  private async updateThreatIntelligence(incident: SecurityIncident): Promise<void> {
    // Update threat intelligence based on incident findings
    for (const indicator of incident.indicators) {
      this.threatIntelligence.set(indicator.value, {
        ...indicator,
        confidence: Math.min(indicator.confidence + 0.1, 1.0)
      });
    }
  }

  private initializeDefaultPlaybooks(): void {
    // Initialize common incident response playbooks
    const dataBreachPlaybook: PlaybookTemplate = {
      templateId: 'data-breach-playbook',
      name: 'Data Breach Response',
      description: 'Standard response procedures for data breach incidents',
      incidentTypes: ['data_breach', 'data_theft'],
      phases: [
        {
          phase: 'containment',
          actions: [
            {
              actionId: 'isolate-affected-systems',
              type: 'isolate_system',
              description: 'Isolate affected systems to prevent further data access',
              assignedTo: 'security-team',
              priority: 'urgent',
              status: 'pending',
              automation: {
                enabled: true,
                approvalRequired: false
              }
            }
          ],
          criteria: ['threat_confirmed', 'systems_identified']
        }
      ],
      automations: [],
      escalationRules: []
    };

    this.playbookTemplates.set(dataBreachPlaybook.templateId, dataBreachPlaybook);
  }

  private setupAutomationRules(): void {
    // Setup automation rules for common scenarios
    this.on('incidentCreated', async ({ incidentId, incident }) => {
      if (incident.severity === 'critical') {
        await this.updateIncidentStatus(incidentId, 'investigating');
      }
    });
  }

  private startThreatIntelligenceFeeds(): void {
    // Initialize with known threat indicators
    const knownThreats = [
      {
        type: 'ip' as const,
        value: '192.168.100.100',
        confidence: 0.9,
        source: 'threat-feed',
        firstSeen: new Date(),
        lastSeen: new Date(),
        tags: ['malware', 'c2'],
        context: 'Known malware C2 server'
      }
    ];

    knownThreats.forEach(threat => {
      this.threatIntelligence.set(threat.value, threat);
    });
  }

  private setupPeriodicTasks(): void {
    // Check for overdue incidents every hour
    setInterval(() => {
      this.checkOverdueIncidents();
    }, 60 * 60 * 1000);

    // Update threat intelligence daily
    setInterval(() => {
      this.updateThreatIntelligenceFeeds();
    }, 24 * 60 * 60 * 1000);
  }

  private checkOverdueIncidents(): void {
    const now = new Date();

    Array.from(this.incidents.values()).forEach(incident => {
      if (incident.status !== 'resolved' && incident.status !== 'closed') {
        const timeSinceDetection = now.getTime() - incident.detectedAt.getTime();
        const slaThreshold = this.slaTargets.resolution * 60000;

        if (timeSinceDetection > slaThreshold) {
          this.emit('incidentOverdue', {
            incidentId: incident.incidentId,
            overdueDuration: timeSinceDetection - slaThreshold
          });
        }
      }
    });
  }

  private updateThreatIntelligenceFeeds(): void {
    // Update threat intelligence from external feeds
    // In production, integrate with threat intelligence APIs
    console.log('Updating threat intelligence feeds');
  }

  /**
   * Public query methods
   */

  getIncident(incidentId: string): SecurityIncident | undefined {
    return this.incidents.get(incidentId);
  }

  getActiveIncidents(): SecurityIncident[] {
    return Array.from(this.incidents.values())
      .filter(i => i.status !== 'resolved' && i.status !== 'closed');
  }

  getIncidentsByStatus(status: IncidentStatus): SecurityIncident[] {
    return Array.from(this.incidents.values())
      .filter(i => i.status === status);
  }

  getIncidentsByType(type: IncidentType): SecurityIncident[] {
    return Array.from(this.incidents.values())
      .filter(i => i.type === type);
  }

  getIncidentsByDateRange(startDate: Date, endDate: Date): SecurityIncident[] {
    return Array.from(this.incidents.values())
      .filter(i => i.detectedAt >= startDate && i.detectedAt <= endDate);
  }
}

export const incidentResponseService = new IncidentResponseService();