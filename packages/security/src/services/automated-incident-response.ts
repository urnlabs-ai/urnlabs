import { EventEmitter } from 'events';
import { Redis } from 'ioredis';
import { SecurityIncident, IncidentSeverity, IncidentType, IncidentStatus } from './incident-response.js';
import { AutomatedIncidentClassifier } from './automated-incident-classifier.js';
import { AutomatedContainmentService } from './automated-containment.js';
import { NotificationEscalationService } from './notification-escalation.js';
import { logger } from '../utils/logger.js';
import axios from 'axios';

/**
 * Automated Incident Response Orchestrator
 * Coordinates automated response to security incidents
 */
export class AutomatedIncidentResponseOrchestrator extends EventEmitter {
  private redis: Redis;
  private classifier: AutomatedIncidentClassifier;
  private containment: AutomatedContainmentService;
  private notifications: NotificationEscalationService;
  private playbooks: Map<string, IncidentPlaybook> = new Map();
  private activeIncidents: Map<string, ActiveIncidentContext> = new Map();
  private automationEnabled: boolean = true;
  private config: AutomationConfig;

  constructor(redis: Redis, config: AutomationConfig) {
    super();
    this.redis = redis;
    this.config = config;

    this.classifier = new AutomatedIncidentClassifier(redis);
    this.containment = new AutomatedContainmentService(redis);
    this.notifications = new NotificationEscalationService(config.notifications);

    this.loadPlaybooks();
    this.setupEventHandlers();
  }

  /**
   * Process incoming security event and trigger automated response
   */
  public async processSecurityEvent(event: SecurityEvent): Promise<IncidentResponseResult> {
    const startTime = Date.now();

    try {
      logger.info('Processing security event for automated response', {
        eventId: event.id,
        eventType: event.type,
        severity: event.severity,
        source: event.source
      });

      // Step 1: Classify the incident
      const classification = await this.classifier.classifyIncident(event);

      // Step 2: Check if automation should be triggered
      if (!this.shouldTriggerAutomation(classification, event)) {
        return {
          success: true,
          action: 'manual_review_required',
          message: 'Event requires manual review',
          incidentId: null
        };
      }

      // Step 3: Create or update incident
      const incident = await this.createOrUpdateIncident(event, classification);

      // Step 4: Execute automated response playbook
      const responseResult = await this.executePlaybook(incident, event);

      // Step 5: Track the response
      await this.trackResponse(incident, responseResult, startTime);

      this.emit('incident_processed', {
        incidentId: incident.incidentId,
        classification,
        responseResult,
        processingTime: Date.now() - startTime
      });

      return {
        success: true,
        action: responseResult.action,
        message: responseResult.message,
        incidentId: incident.incidentId,
        automatedActions: responseResult.actions
      };

    } catch (error) {
      logger.error('Automated incident response failed', {
        eventId: event.id,
        error: error.message,
        stack: error.stack
      });

      this.emit('response_error', {
        eventId: event.id,
        error: error.message
      });

      return {
        success: false,
        action: 'error',
        message: `Automation failed: ${error.message}`,
        incidentId: null
      };
    }
  }

  /**
   * Execute incident response playbook
   */
  private async executePlaybook(
    incident: SecurityIncident,
    event: SecurityEvent
  ): Promise<PlaybookExecutionResult> {
    const playbookKey = this.getPlaybookKey(incident.type, incident.severity);
    const playbook = this.playbooks.get(playbookKey);

    if (!playbook) {
      logger.warn('No playbook found for incident', {
        incidentId: incident.incidentId,
        type: incident.type,
        severity: incident.severity
      });

      // Use default manual escalation
      return this.executeManualEscalation(incident, event);
    }

    logger.info('Executing automated playbook', {
      incidentId: incident.incidentId,
      playbookId: playbook.id,
      playbookName: playbook.name
    });

    const context: PlaybookExecutionContext = {
      incident,
      event,
      startTime: Date.now(),
      executedActions: [],
      results: {}
    };

    // Add to active incidents
    this.activeIncidents.set(incident.incidentId, {
      incident,
      playbook,
      context,
      status: 'executing'
    });

    try {
      // Execute playbook steps sequentially
      for (const step of playbook.steps) {
        if (!this.shouldExecuteStep(step, context)) {
          logger.debug('Skipping playbook step', {
            incidentId: incident.incidentId,
            stepId: step.id,
            reason: 'conditions_not_met'
          });
          continue;
        }

        const stepResult = await this.executePlaybookStep(step, context);
        context.executedActions.push({
          stepId: step.id,
          action: step.action,
          result: stepResult,
          timestamp: new Date()
        });

        // Check if step failed and we should abort
        if (!stepResult.success && step.critical) {
          logger.error('Critical playbook step failed', {
            incidentId: incident.incidentId,
            stepId: step.id,
            error: stepResult.error
          });

          // Escalate to manual intervention
          await this.escalateToManual(incident, stepResult.error);
          break;
        }

        // Add delay between steps if specified
        if (step.delayAfter) {
          await this.delay(step.delayAfter);
        }
      }

      // Update incident status
      await this.updateIncidentStatus(incident, context);

      return {
        success: true,
        action: 'automated_response_completed',
        message: `Automated response executed successfully`,
        actions: context.executedActions,
        playbookId: playbook.id
      };

    } catch (error) {
      logger.error('Playbook execution failed', {
        incidentId: incident.incidentId,
        playbookId: playbook.id,
        error: error.message
      });

      await this.escalateToManual(incident, error.message);

      return {
        success: false,
        action: 'escalated_to_manual',
        message: `Playbook execution failed: ${error.message}`,
        actions: context.executedActions,
        playbookId: playbook.id
      };
    } finally {
      this.activeIncidents.delete(incident.incidentId);
    }
  }

  /**
   * Execute individual playbook step
   */
  private async executePlaybookStep(
    step: PlaybookStep,
    context: PlaybookExecutionContext
  ): Promise<StepExecutionResult> {
    logger.debug('Executing playbook step', {
      incidentId: context.incident.incidentId,
      stepId: step.id,
      action: step.action
    });

    try {
      switch (step.action) {
        case 'isolate_system':
          return await this.executeIsolateSystem(step, context);

        case 'block_ip':
          return await this.executeBlockIP(step, context);

        case 'disable_user':
          return await this.executeDisableUser(step, context);

        case 'notify_team':
          return await this.executeNotifyTeam(step, context);

        case 'create_ticket':
          return await this.executeCreateTicket(step, context);

        case 'collect_forensics':
          return await this.executeCollectForensics(step, context);

        case 'update_firewall':
          return await this.executeUpdateFirewall(step, context);

        case 'rotate_credentials':
          return await this.executeRotateCredentials(step, context);

        case 'backup_evidence':
          return await this.executeBackupEvidence(step, context);

        case 'send_alert':
          return await this.executeSendAlert(step, context);

        default:
          throw new Error(`Unknown playbook action: ${step.action}`);
      }

    } catch (error) {
      return {
        success: false,
        message: `Step execution failed: ${error.message}`,
        error: error.message,
        timestamp: new Date()
      };
    }
  }

  /**
   * Isolate compromised system
   */
  private async executeIsolateSystem(
    step: PlaybookStep,
    context: PlaybookExecutionContext
  ): Promise<StepExecutionResult> {
    const systemId = step.parameters.systemId || context.event.source.systemId;

    if (!systemId) {
      return {
        success: false,
        message: 'System ID not found for isolation',
        error: 'Missing system identifier'
      };
    }

    const result = await this.containment.isolateSystem(systemId);

    return {
      success: result.success,
      message: result.message,
      data: { systemId, isolationId: result.isolationId }
    };
  }

  /**
   * Block malicious IP address
   */
  private async executeBlockIP(
    step: PlaybookStep,
    context: PlaybookExecutionContext
  ): Promise<StepExecutionResult> {
    const ipAddress = step.parameters.ipAddress || context.event.source.ipAddress;

    if (!ipAddress) {
      return {
        success: false,
        message: 'IP address not found for blocking',
        error: 'Missing IP address'
      };
    }

    // Block IP in WAF and firewall
    const wafResult = await this.containment.blockIP(ipAddress, 'automated_response');
    const firewallResult = await this.containment.updateFirewallRules([{
      action: 'block',
      source: ipAddress,
      reason: `Automated response to incident ${context.incident.incidentId}`
    }]);

    return {
      success: wafResult.success && firewallResult.success,
      message: `IP ${ipAddress} blocked in WAF and firewall`,
      data: { ipAddress, wafResult, firewallResult }
    };
  }

  /**
   * Disable compromised user account
   */
  private async executeDisableUser(
    step: PlaybookStep,
    context: PlaybookExecutionContext
  ): Promise<StepExecutionResult> {
    const userId = step.parameters.userId || context.event.source.userId;

    if (!userId) {
      return {
        success: false,
        message: 'User ID not found for disabling',
        error: 'Missing user identifier'
      };
    }

    const result = await this.containment.disableUser(userId, {
      reason: `Automated response to incident ${context.incident.incidentId}`,
      incidentId: context.incident.incidentId
    });

    return {
      success: result.success,
      message: result.message,
      data: { userId, disabledAt: new Date() }
    };
  }

  /**
   * Notify incident response team
   */
  private async executeNotifyTeam(
    step: PlaybookStep,
    context: PlaybookExecutionContext
  ): Promise<StepExecutionResult> {
    const team = step.parameters.team || 'security-team';
    const urgency = this.mapSeverityToUrgency(context.incident.severity);

    const result = await this.notifications.sendIncidentNotification({
      incidentId: context.incident.incidentId,
      title: context.incident.title,
      description: context.incident.description,
      severity: context.incident.severity,
      team,
      urgency,
      automatedResponse: true
    });

    return {
      success: result.success,
      message: `Team ${team} notified`,
      data: { team, notificationId: result.notificationId }
    };
  }

  /**
   * Create incident tracking ticket
   */
  private async executeCreateTicket(
    step: PlaybookStep,
    context: PlaybookExecutionContext
  ): Promise<StepExecutionResult> {
    const ticketData = {
      title: `Security Incident: ${context.incident.title}`,
      description: context.incident.description,
      priority: this.mapSeverityToPriority(context.incident.severity),
      labels: ['security', 'automated', context.incident.type],
      incidentId: context.incident.incidentId
    };

    try {
      // Create ticket in configured system (GitHub, Jira, etc.)
      const ticketResult = await this.createIncidentTicket(ticketData);

      return {
        success: true,
        message: `Incident ticket created: ${ticketResult.ticketId}`,
        data: { ticketId: ticketResult.ticketId, ticketUrl: ticketResult.url }
      };

    } catch (error) {
      return {
        success: false,
        message: 'Failed to create incident ticket',
        error: error.message
      };
    }
  }

  /**
   * Collect forensic evidence
   */
  private async executeCollectForensics(
    step: PlaybookStep,
    context: PlaybookExecutionContext
  ): Promise<StepExecutionResult> {
    const forensicsData = await this.containment.collectForensics({
      incidentId: context.incident.incidentId,
      systems: context.incident.affectedSystems,
      timeRange: {
        start: new Date(Date.now() - 3600000), // 1 hour before
        end: new Date()
      }
    });

    return {
      success: forensicsData.success,
      message: `Forensic evidence collected`,
      data: {
        evidenceId: forensicsData.evidenceId,
        artifacts: forensicsData.artifacts.length
      }
    };
  }

  /**
   * Update firewall rules
   */
  private async executeUpdateFirewall(
    step: PlaybookStep,
    context: PlaybookExecutionContext
  ): Promise<StepExecutionResult> {
    const rules = step.parameters.rules || this.generateFirewallRules(context);

    const result = await this.containment.updateFirewallRules(rules);

    return {
      success: result.success,
      message: `Firewall rules updated`,
      data: { rulesUpdated: rules.length }
    };
  }

  /**
   * Rotate compromised credentials
   */
  private async executeRotateCredentials(
    step: PlaybookStep,
    context: PlaybookExecutionContext
  ): Promise<StepExecutionResult> {
    const credentialTypes = step.parameters.credentialTypes || ['api_keys', 'passwords'];

    const results = await Promise.allSettled(
      credentialTypes.map(type => this.containment.rotateCredentials(type, {
        incidentId: context.incident.incidentId,
        reason: 'automated_security_response'
      }))
    );

    const successful = results.filter(r => r.status === 'fulfilled').length;

    return {
      success: successful > 0,
      message: `Rotated ${successful}/${credentialTypes.length} credential types`,
      data: { rotated: successful, total: credentialTypes.length }
    };
  }

  /**
   * Backup forensic evidence
   */
  private async executeBackupEvidence(
    step: PlaybookStep,
    context: PlaybookExecutionContext
  ): Promise<StepExecutionResult> {
    const backupResult = await this.containment.backupEvidence({
      incidentId: context.incident.incidentId,
      retention: step.parameters.retention || '7d',
      encrypted: true
    });

    return {
      success: backupResult.success,
      message: `Evidence backed up to secure storage`,
      data: { backupId: backupResult.backupId }
    };
  }

  /**
   * Send immediate alert
   */
  private async executeSendAlert(
    step: PlaybookStep,
    context: PlaybookExecutionContext
  ): Promise<StepExecutionResult> {
    const alertData = {
      type: 'security_incident',
      severity: context.incident.severity,
      title: context.incident.title,
      message: step.parameters.message || context.incident.description,
      incidentId: context.incident.incidentId,
      timestamp: new Date()
    };

    const channels = step.parameters.channels || ['slack', 'email', 'webhook'];
    const results = await Promise.allSettled(
      channels.map(channel => this.sendAlert(channel, alertData))
    );

    const successful = results.filter(r => r.status === 'fulfilled').length;

    return {
      success: successful > 0,
      message: `Alert sent to ${successful}/${channels.length} channels`,
      data: { channels: successful }
    };
  }

  /**
   * Load incident response playbooks
   */
  private loadPlaybooks(): void {
    // Critical incidents - immediate automated response
    this.playbooks.set('malware:critical', {
      id: 'malware_critical_v1',
      name: 'Critical Malware Response',
      description: 'Automated response for critical malware incidents',
      version: '1.0',
      steps: [
        {
          id: 'isolate_infected_system',
          action: 'isolate_system',
          description: 'Immediately isolate infected system',
          critical: true,
          timeout: 30000,
          parameters: {}
        },
        {
          id: 'block_malicious_ips',
          action: 'block_ip',
          description: 'Block malicious IP addresses',
          critical: false,
          timeout: 15000,
          parameters: {}
        },
        {
          id: 'notify_security_team',
          action: 'notify_team',
          description: 'Immediately notify security team',
          critical: true,
          timeout: 10000,
          parameters: { team: 'security-incident-response' }
        },
        {
          id: 'collect_forensics',
          action: 'collect_forensics',
          description: 'Collect forensic evidence',
          critical: false,
          timeout: 60000,
          parameters: {}
        },
        {
          id: 'create_incident_ticket',
          action: 'create_ticket',
          description: 'Create high-priority incident ticket',
          critical: false,
          timeout: 20000,
          parameters: {}
        }
      ]
    });

    // Data breach incidents
    this.playbooks.set('data_breach:critical', {
      id: 'data_breach_critical_v1',
      name: 'Critical Data Breach Response',
      description: 'Automated response for critical data breach incidents',
      version: '1.0',
      steps: [
        {
          id: 'disable_compromised_accounts',
          action: 'disable_user',
          description: 'Disable compromised user accounts',
          critical: true,
          timeout: 20000,
          parameters: {}
        },
        {
          id: 'rotate_credentials',
          action: 'rotate_credentials',
          description: 'Rotate potentially compromised credentials',
          critical: true,
          timeout: 45000,
          parameters: { credentialTypes: ['api_keys', 'database_passwords'] }
        },
        {
          id: 'backup_evidence',
          action: 'backup_evidence',
          description: 'Backup forensic evidence',
          critical: true,
          timeout: 60000,
          parameters: { retention: '30d' }
        },
        {
          id: 'notify_legal_team',
          action: 'notify_team',
          description: 'Notify legal and compliance teams',
          critical: true,
          timeout: 10000,
          parameters: { team: 'legal-compliance' }
        },
        {
          id: 'send_breach_alert',
          action: 'send_alert',
          description: 'Send immediate breach notification',
          critical: true,
          timeout: 15000,
          parameters: {
            channels: ['slack', 'email', 'sms'],
            message: 'CRITICAL: Potential data breach detected - immediate action required'
          }
        }
      ]
    });

    // DDoS attacks
    this.playbooks.set('ddos:high', {
      id: 'ddos_high_v1',
      name: 'High-Severity DDoS Response',
      description: 'Automated response for high-severity DDoS attacks',
      version: '1.0',
      steps: [
        {
          id: 'update_firewall_rules',
          action: 'update_firewall',
          description: 'Update firewall rules to block attack sources',
          critical: true,
          timeout: 30000,
          parameters: {}
        },
        {
          id: 'block_attack_ips',
          action: 'block_ip',
          description: 'Block attacking IP addresses',
          critical: true,
          timeout: 20000,
          parameters: {}
        },
        {
          id: 'notify_infrastructure_team',
          action: 'notify_team',
          description: 'Notify infrastructure team',
          critical: false,
          timeout: 10000,
          parameters: { team: 'infrastructure' }
        }
      ]
    });

    logger.info('Loaded incident response playbooks', {
      playbookCount: this.playbooks.size,
      playbooks: Array.from(this.playbooks.keys())
    });
  }

  /**
   * Helper methods
   */
  private shouldTriggerAutomation(classification: any, event: SecurityEvent): boolean {
    if (!this.automationEnabled) return false;

    // Only trigger automation for high/critical severity incidents
    if (!['high', 'critical'].includes(classification.severity)) return false;

    // Check if incident type supports automation
    const automatedTypes = ['malware', 'ddos', 'data_breach', 'unauthorized_access'];
    return automatedTypes.includes(classification.type);
  }

  private async createOrUpdateIncident(
    event: SecurityEvent,
    classification: any
  ): Promise<SecurityIncident> {
    // Implementation would create incident record
    return {
      incidentId: `INC-${Date.now()}`,
      title: event.title,
      description: event.description,
      type: classification.type,
      category: classification.category,
      severity: classification.severity,
      priority: this.mapSeverityToPriority(classification.severity),
      status: 'open',
      source: {
        system: event.source.system,
        component: event.source.component,
        type: 'automated_detection'
      },
      detectedAt: new Date(event.timestamp),
      affectedSystems: event.affectedSystems || [],
      affectedUsers: event.affectedUsers || [],
      indicators: event.indicators || [],
      timeline: [],
      response: {
        automated: true,
        startedAt: new Date(),
        actions: []
      },
      forensics: {},
      lessons: {},
      relatedIncidents: [],
      tags: ['automated'],
      metadata: { originalEvent: event }
    };
  }

  private getPlaybookKey(type: IncidentType, severity: IncidentSeverity): string {
    return `${type}:${severity}`;
  }

  private mapSeverityToPriority(severity: IncidentSeverity): string {
    const mapping = {
      'critical': 'urgent',
      'high': 'high',
      'medium': 'medium',
      'low': 'low'
    };
    return mapping[severity] || 'medium';
  }

  private mapSeverityToUrgency(severity: IncidentSeverity): string {
    const mapping = {
      'critical': 'immediate',
      'high': 'urgent',
      'medium': 'normal',
      'low': 'low'
    };
    return mapping[severity] || 'normal';
  }

  private async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private setupEventHandlers(): void {
    this.on('incident_processed', (data) => {
      logger.info('Incident processed by automation', data);
    });

    this.on('response_error', (data) => {
      logger.error('Automated response error', data);
    });
  }

  /**
   * Get automation status and statistics
   */
  public getAutomationStatus(): object {
    return {
      enabled: this.automationEnabled,
      activeIncidents: this.activeIncidents.size,
      playbooksLoaded: this.playbooks.size,
      availablePlaybooks: Array.from(this.playbooks.keys())
    };
  }

  /**
   * Enable or disable automation
   */
  public setAutomationEnabled(enabled: boolean): void {
    this.automationEnabled = enabled;
    logger.info('Automation status changed', { enabled });
  }
}

// Type definitions
interface SecurityEvent {
  id: string;
  type: string;
  severity: string;
  title: string;
  description: string;
  timestamp: string;
  source: {
    system?: string;
    component?: string;
    ipAddress?: string;
    userId?: string;
    systemId?: string;
  };
  affectedSystems?: any[];
  affectedUsers?: any[];
  indicators?: any[];
}

interface IncidentPlaybook {
  id: string;
  name: string;
  description: string;
  version: string;
  steps: PlaybookStep[];
}

interface PlaybookStep {
  id: string;
  action: string;
  description: string;
  critical: boolean;
  timeout: number;
  delayAfter?: number;
  parameters: Record<string, any>;
  conditions?: Record<string, any>;
}

interface PlaybookExecutionContext {
  incident: SecurityIncident;
  event: SecurityEvent;
  startTime: number;
  executedActions: ExecutedAction[];
  results: Record<string, any>;
}

interface ExecutedAction {
  stepId: string;
  action: string;
  result: StepExecutionResult;
  timestamp: Date;
}

interface StepExecutionResult {
  success: boolean;
  message: string;
  error?: string;
  data?: any;
  timestamp?: Date;
}

interface PlaybookExecutionResult {
  success: boolean;
  action: string;
  message: string;
  actions: ExecutedAction[];
  playbookId: string;
}

interface IncidentResponseResult {
  success: boolean;
  action: string;
  message: string;
  incidentId: string | null;
  automatedActions?: ExecutedAction[];
}

interface ActiveIncidentContext {
  incident: SecurityIncident;
  playbook: IncidentPlaybook;
  context: PlaybookExecutionContext;
  status: 'executing' | 'completed' | 'failed';
}

interface AutomationConfig {
  notifications: {
    slack?: {
      webhookUrl: string;
      channels: string[];
    };
    email?: {
      smtpConfig: any;
      recipients: string[];
    };
    webhook?: {
      url: string;
      secret: string;
    };
  };
  ticketing?: {
    system: 'github' | 'jira' | 'servicenow';
    config: any;
  };
}

export { AutomatedIncidentResponseOrchestrator, SecurityEvent, IncidentPlaybook };