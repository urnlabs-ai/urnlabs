import { EventEmitter } from 'events';
import { SecurityIncident, IncidentType, IncidentSeverity, ResponseAction } from './incident-response';
import axios from 'axios';

export interface ContainmentRule {
  id: string;
  name: string;
  description: string;
  triggers: ContainmentTrigger[];
  actions: ContainmentAction[];
  priority: number;
  autoExecute: boolean;
  requiresApproval: boolean;
  enabled: boolean;
  cooldownPeriod: number; // minutes
  maxExecutions: number; // per hour
  lastExecuted?: Date;
  executionCount: number;
}

export interface ContainmentTrigger {
  type: 'incident_type' | 'severity' | 'indicator_match' | 'pattern_match' | 'time_based' | 'threshold';
  condition: string;
  value: any;
  operator?: 'equals' | 'contains' | 'gt' | 'lt' | 'gte' | 'lte';
}

export interface ContainmentAction {
  id: string;
  type: ContainmentActionType;
  description: string;
  parameters: Record<string, any>;
  timeout: number; // seconds
  retryCount: number;
  rollbackable: boolean;
  dependencies?: string[]; // other action IDs
  validation?: ValidationRule[];
}

export type ContainmentActionType =
  | 'block_ip'
  | 'block_domain'
  | 'isolate_system'
  | 'disable_account'
  | 'quarantine_file'
  | 'update_firewall'
  | 'redirect_traffic'
  | 'rate_limit'
  | 'dns_sinkhole'
  | 'certificate_revoke'
  | 'api_key_disable'
  | 'session_terminate'
  | 'service_shutdown'
  | 'network_segment';

export interface ValidationRule {
  type: 'api_response' | 'system_status' | 'connectivity' | 'performance';
  endpoint?: string;
  expectedValue?: any;
  timeout?: number;
}

export interface ContainmentExecution {
  id: string;
  ruleId: string;
  incidentId: string;
  actions: ExecutedAction[];
  status: 'pending' | 'executing' | 'completed' | 'failed' | 'partial' | 'rolled_back';
  startedAt: Date;
  completedAt?: Date;
  error?: string;
  rollbackActions?: ExecutedAction[];
}

export interface ExecutedAction {
  actionId: string;
  type: ContainmentActionType;
  status: 'pending' | 'executing' | 'completed' | 'failed' | 'skipped' | 'rolled_back';
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
  result?: any;
  rollbackData?: any;
}

export interface NetworkDevice {
  id: string;
  name: string;
  type: 'firewall' | 'switch' | 'router' | 'load_balancer' | 'waf' | 'proxy';
  managementIP: string;
  apiEndpoint?: string;
  credentials?: {
    type: 'api_key' | 'username_password' | 'certificate';
    value: string;
  };
  capabilities: string[];
  enabled: boolean;
}

export interface ServiceEndpoint {
  id: string;
  name: string;
  type: 'dns' | 'dhcp' | 'auth' | 'database' | 'api' | 'messaging';
  endpoint: string;
  apiKey?: string;
  enabled: boolean;
}

export class AutomatedContainmentService extends EventEmitter {
  private containmentRules: Map<string, ContainmentRule> = new Map();
  private activeExecutions: Map<string, ContainmentExecution> = new Map();
  private networkDevices: Map<string, NetworkDevice> = new Map();
  private serviceEndpoints: Map<string, ServiceEndpoint> = new Map();
  private executionHistory: ContainmentExecution[] = [];
  private rollbackTimeouts: Map<string, NodeJS.Timeout> = new Map();

  constructor() {
    super();
    this.initializeContainmentService();
  }

  private initializeContainmentService(): void {
    this.setupDefaultRules();
    this.setupNetworkDevices();
    this.setupServiceEndpoints();
    this.startMonitoring();
  }

  /**
   * Execute containment based on incident
   */
  async executeContainment(incident: SecurityIncident): Promise<string[]> {
    const applicableRules = this.findApplicableRules(incident);
    const executionIds: string[] = [];

    for (const rule of applicableRules) {
      if (!this.canExecuteRule(rule)) {
        console.log(`Rule ${rule.id} cannot be executed due to cooldown or rate limits`);
        continue;
      }

      const executionId = await this.executeRule(rule, incident);
      if (executionId) {
        executionIds.push(executionId);
      }
    }

    return executionIds;
  }

  /**
   * Execute a specific containment rule
   */
  async executeRule(rule: ContainmentRule, incident: SecurityIncident): Promise<string | null> {
    const executionId = this.generateExecutionId();

    const execution: ContainmentExecution = {
      id: executionId,
      ruleId: rule.id,
      incidentId: incident.incidentId,
      actions: rule.actions.map(action => ({
        actionId: action.id,
        type: action.type,
        status: 'pending'
      })),
      status: 'pending',
      startedAt: new Date()
    };

    this.activeExecutions.set(executionId, execution);

    try {
      if (rule.requiresApproval && !rule.autoExecute) {
        await this.requestApproval(execution, incident);
        return executionId;
      }

      await this.executeActions(execution, rule, incident);

      // Update rule execution tracking
      rule.lastExecuted = new Date();
      rule.executionCount = (rule.executionCount || 0) + 1;

      this.emit('containment_executed', { executionId, rule: rule.id, incident: incident.incidentId });

      return executionId;
    } catch (error) {
      execution.status = 'failed';
      execution.error = String(error);
      execution.completedAt = new Date();

      this.emit('containment_failed', {
        executionId,
        rule: rule.id,
        incident: incident.incidentId,
        error
      });

      return null;
    }
  }

  /**
   * Execute containment actions in sequence
   */
  private async executeActions(
    execution: ContainmentExecution,
    rule: ContainmentRule,
    incident: SecurityIncident
  ): Promise<void> {
    execution.status = 'executing';

    // Sort actions by dependencies
    const sortedActions = this.topologicalSort(rule.actions);

    for (const action of sortedActions) {
      const executedAction = execution.actions.find(a => a.actionId === action.id);
      if (!executedAction) continue;

      try {
        executedAction.status = 'executing';
        executedAction.startedAt = new Date();

        // Validate prerequisites
        if (action.validation) {
          await this.validateAction(action);
        }

        // Execute the action
        const result = await this.executeAction(action, incident);

        executedAction.status = 'completed';
        executedAction.completedAt = new Date();
        executedAction.result = result;

        // Store rollback data if action is rollbackable
        if (action.rollbackable) {
          executedAction.rollbackData = await this.captureRollbackData(action, result);
        }

        this.emit('action_executed', {
          executionId: execution.id,
          actionId: action.id,
          result
        });

      } catch (error) {
        executedAction.status = 'failed';
        executedAction.error = String(error);
        executedAction.completedAt = new Date();

        // Rollback if configured
        if (rule.autoExecute) {
          await this.rollbackExecution(execution.id);
        }

        throw error;
      }
    }

    execution.status = 'completed';
    execution.completedAt = new Date();

    // Schedule automatic rollback if configured
    this.scheduleAutoRollback(execution, rule);
  }

  /**
   * Execute individual containment action
   */
  private async executeAction(action: ContainmentAction, incident: SecurityIncident): Promise<any> {
    const params = this.resolveParameters(action.parameters, incident);

    switch (action.type) {
      case 'block_ip':
        return await this.blockIPAddress(params.ip, params.duration);

      case 'block_domain':
        return await this.blockDomain(params.domain, params.reason);

      case 'isolate_system':
        return await this.isolateSystem(params.systemId, params.isolationType);

      case 'disable_account':
        return await this.disableAccount(params.userId, params.reason);

      case 'quarantine_file':
        return await this.quarantineFile(params.filePath, params.hash);

      case 'update_firewall':
        return await this.updateFirewallRules(params.rules, params.deviceId);

      case 'redirect_traffic':
        return await this.redirectTraffic(params.source, params.destination);

      case 'rate_limit':
        return await this.applyRateLimit(params.target, params.limit);

      case 'dns_sinkhole':
        return await this.createDNSSinkhole(params.domain, params.sinkholeIP);

      case 'certificate_revoke':
        return await this.revokeCertificate(params.serialNumber, params.reason);

      case 'api_key_disable':
        return await this.disableAPIKey(params.keyId, params.serviceId);

      case 'session_terminate':
        return await this.terminateSessions(params.userId, params.sessionIds);

      case 'service_shutdown':
        return await this.shutdownService(params.serviceId, params.graceful);

      case 'network_segment':
        return await this.createNetworkSegment(params.source, params.vlanId);

      default:
        throw new Error(`Unsupported action type: ${action.type}`);
    }
  }

  /**
   * Network and system containment actions
   */

  private async blockIPAddress(ip: string, duration: number = 3600): Promise<any> {
    console.log(`Blocking IP address: ${ip} for ${duration} seconds`);

    const firewallDevices = Array.from(this.networkDevices.values())
      .filter(device => device.type === 'firewall' && device.enabled);

    const results = [];

    for (const device of firewallDevices) {
      try {
        const result = await this.executeOnNetworkDevice(device, {
          action: 'block_ip',
          parameters: { ip, duration }
        });
        results.push({ device: device.id, result });
      } catch (error) {
        results.push({ device: device.id, error: String(error) });
      }
    }

    return { ip, duration, results };
  }

  private async blockDomain(domain: string, reason: string): Promise<any> {
    console.log(`Blocking domain: ${domain} - Reason: ${reason}`);

    const dnsService = this.serviceEndpoints.get('dns_service');
    if (!dnsService) {
      throw new Error('DNS service not configured');
    }

    try {
      const response = await axios.post(`${dnsService.endpoint}/block`, {
        domain,
        reason,
        action: 'sinkhole'
      }, {
        headers: {
          'Authorization': `Bearer ${dnsService.apiKey}`,
          'Content-Type': 'application/json'
        }
      });

      return { domain, reason, response: response.data };
    } catch (error) {
      throw new Error(`Failed to block domain ${domain}: ${error}`);
    }
  }

  private async isolateSystem(systemId: string, isolationType: 'network' | 'full'): Promise<any> {
    console.log(`Isolating system: ${systemId} - Type: ${isolationType}`);

    if (isolationType === 'network') {
      // Create isolated VLAN
      const switchDevices = Array.from(this.networkDevices.values())
        .filter(device => device.type === 'switch' && device.enabled);

      const results = [];

      for (const device of switchDevices) {
        try {
          const result = await this.executeOnNetworkDevice(device, {
            action: 'isolate_port',
            parameters: { systemId, vlan: 'quarantine' }
          });
          results.push({ device: device.id, result });
        } catch (error) {
          results.push({ device: device.id, error: String(error) });
        }
      }

      return { systemId, isolationType, results };
    } else {
      // Full isolation - shutdown network interfaces
      return await this.shutdownNetworkInterfaces(systemId);
    }
  }

  private async disableAccount(userId: string, reason: string): Promise<any> {
    console.log(`Disabling account: ${userId} - Reason: ${reason}`);

    const authService = this.serviceEndpoints.get('auth_service');
    if (!authService) {
      throw new Error('Authentication service not configured');
    }

    try {
      const response = await axios.post(`${authService.endpoint}/disable`, {
        userId,
        reason,
        action: 'disable'
      }, {
        headers: {
          'Authorization': `Bearer ${authService.apiKey}`,
          'Content-Type': 'application/json'
        }
      });

      return { userId, reason, response: response.data };
    } catch (error) {
      throw new Error(`Failed to disable account ${userId}: ${error}`);
    }
  }

  private async quarantineFile(filePath: string, hash: string): Promise<any> {
    console.log(`Quarantining file: ${filePath} - Hash: ${hash}`);

    // This would integrate with endpoint protection systems
    const quarantinePath = `/quarantine/${hash}/${Date.now()}`;

    return {
      originalPath: filePath,
      quarantinePath,
      hash,
      timestamp: new Date().toISOString(),
      status: 'quarantined'
    };
  }

  private async updateFirewallRules(rules: any[], deviceId?: string): Promise<any> {
    console.log(`Updating firewall rules${deviceId ? ` on device ${deviceId}` : ''}`);

    const devices = deviceId
      ? [this.networkDevices.get(deviceId)].filter(Boolean)
      : Array.from(this.networkDevices.values()).filter(d => d.type === 'firewall' && d.enabled);

    const results = [];

    for (const device of devices) {
      try {
        const result = await this.executeOnNetworkDevice(device!, {
          action: 'update_rules',
          parameters: { rules }
        });
        results.push({ device: device!.id, result });
      } catch (error) {
        results.push({ device: device!.id, error: String(error) });
      }
    }

    return { rules, results };
  }

  private async redirectTraffic(source: string, destination: string): Promise<any> {
    console.log(`Redirecting traffic from ${source} to ${destination}`);

    const loadBalancers = Array.from(this.networkDevices.values())
      .filter(device => device.type === 'load_balancer' && device.enabled);

    const results = [];

    for (const device of loadBalancers) {
      try {
        const result = await this.executeOnNetworkDevice(device, {
          action: 'redirect_traffic',
          parameters: { source, destination }
        });
        results.push({ device: device.id, result });
      } catch (error) {
        results.push({ device: device.id, error: String(error) });
      }
    }

    return { source, destination, results };
  }

  private async applyRateLimit(target: string, limit: number): Promise<any> {
    console.log(`Applying rate limit to ${target}: ${limit} requests/minute`);

    const wafDevices = Array.from(this.networkDevices.values())
      .filter(device => device.type === 'waf' && device.enabled);

    const results = [];

    for (const device of wafDevices) {
      try {
        const result = await this.executeOnNetworkDevice(device, {
          action: 'rate_limit',
          parameters: { target, limit }
        });
        results.push({ device: device.id, result });
      } catch (error) {
        results.push({ device: device.id, error: String(error) });
      }
    }

    return { target, limit, results };
  }

  private async createDNSSinkhole(domain: string, sinkholeIP: string): Promise<any> {
    console.log(`Creating DNS sinkhole for ${domain} -> ${sinkholeIP}`);

    const dnsService = this.serviceEndpoints.get('dns_service');
    if (!dnsService) {
      throw new Error('DNS service not configured');
    }

    try {
      const response = await axios.post(`${dnsService.endpoint}/sinkhole`, {
        domain,
        sinkholeIP,
        ttl: 300
      }, {
        headers: {
          'Authorization': `Bearer ${dnsService.apiKey}`,
          'Content-Type': 'application/json'
        }
      });

      return { domain, sinkholeIP, response: response.data };
    } catch (error) {
      throw new Error(`Failed to create DNS sinkhole for ${domain}: ${error}`);
    }
  }

  private async revokeCertificate(serialNumber: string, reason: string): Promise<any> {
    console.log(`Revoking certificate: ${serialNumber} - Reason: ${reason}`);

    // This would integrate with PKI infrastructure
    return {
      serialNumber,
      reason,
      revokedAt: new Date().toISOString(),
      status: 'revoked'
    };
  }

  private async disableAPIKey(keyId: string, serviceId: string): Promise<any> {
    console.log(`Disabling API key: ${keyId} for service: ${serviceId}`);

    const service = this.serviceEndpoints.get(serviceId);
    if (!service) {
      throw new Error(`Service ${serviceId} not found`);
    }

    try {
      const response = await axios.post(`${service.endpoint}/keys/${keyId}/disable`, {
        reason: 'Security incident containment'
      }, {
        headers: {
          'Authorization': `Bearer ${service.apiKey}`,
          'Content-Type': 'application/json'
        }
      });

      return { keyId, serviceId, response: response.data };
    } catch (error) {
      throw new Error(`Failed to disable API key ${keyId}: ${error}`);
    }
  }

  private async terminateSessions(userId: string, sessionIds?: string[]): Promise<any> {
    console.log(`Terminating sessions for user: ${userId}`);

    const authService = this.serviceEndpoints.get('auth_service');
    if (!authService) {
      throw new Error('Authentication service not configured');
    }

    try {
      const response = await axios.post(`${authService.endpoint}/sessions/terminate`, {
        userId,
        sessionIds: sessionIds || 'all'
      }, {
        headers: {
          'Authorization': `Bearer ${authService.apiKey}`,
          'Content-Type': 'application/json'
        }
      });

      return { userId, sessionIds, response: response.data };
    } catch (error) {
      throw new Error(`Failed to terminate sessions for ${userId}: ${error}`);
    }
  }

  private async shutdownService(serviceId: string, graceful: boolean = true): Promise<any> {
    console.log(`Shutting down service: ${serviceId} - Graceful: ${graceful}`);

    // This would integrate with container orchestration or service management systems
    return {
      serviceId,
      graceful,
      shutdownAt: new Date().toISOString(),
      status: 'shutdown'
    };
  }

  private async createNetworkSegment(source: string, vlanId: number): Promise<any> {
    console.log(`Creating network segment for ${source} in VLAN ${vlanId}`);

    const switchDevices = Array.from(this.networkDevices.values())
      .filter(device => device.type === 'switch' && device.enabled);

    const results = [];

    for (const device of switchDevices) {
      try {
        const result = await this.executeOnNetworkDevice(device, {
          action: 'create_vlan',
          parameters: { source, vlanId }
        });
        results.push({ device: device.id, result });
      } catch (error) {
        results.push({ device: device.id, error: String(error) });
      }
    }

    return { source, vlanId, results };
  }

  /**
   * Rollback containment actions
   */
  async rollbackExecution(executionId: string): Promise<void> {
    const execution = this.activeExecutions.get(executionId);
    if (!execution) {
      throw new Error(`Execution ${executionId} not found`);
    }

    const rollbackActions: ExecutedAction[] = [];

    // Rollback in reverse order
    const completedActions = execution.actions
      .filter(a => a.status === 'completed' && a.rollbackData)
      .reverse();

    for (const action of completedActions) {
      try {
        const rollbackResult = await this.rollbackAction(action);
        rollbackActions.push({
          actionId: `rollback_${action.actionId}`,
          type: action.type,
          status: 'completed',
          startedAt: new Date(),
          completedAt: new Date(),
          result: rollbackResult
        });

        action.status = 'rolled_back';
      } catch (error) {
        rollbackActions.push({
          actionId: `rollback_${action.actionId}`,
          type: action.type,
          status: 'failed',
          startedAt: new Date(),
          completedAt: new Date(),
          error: String(error)
        });
      }
    }

    execution.rollbackActions = rollbackActions;
    execution.status = 'rolled_back';
    execution.completedAt = new Date();

    this.emit('containment_rolled_back', { executionId, rollbackActions });
  }

  /**
   * Helper methods
   */

  private findApplicableRules(incident: SecurityIncident): ContainmentRule[] {
    const applicableRules: ContainmentRule[] = [];

    for (const rule of this.containmentRules.values()) {
      if (!rule.enabled) continue;

      const matches = rule.triggers.every(trigger =>
        this.evaluateTrigger(trigger, incident)
      );

      if (matches) {
        applicableRules.push(rule);
      }
    }

    // Sort by priority (higher first)
    return applicableRules.sort((a, b) => b.priority - a.priority);
  }

  private evaluateTrigger(trigger: ContainmentTrigger, incident: SecurityIncident): boolean {
    switch (trigger.type) {
      case 'incident_type':
        return incident.type === trigger.value;

      case 'severity':
        return incident.severity === trigger.value;

      case 'indicator_match':
        return incident.indicators.some(indicator =>
          indicator.value === trigger.value || indicator.type === trigger.value
        );

      case 'pattern_match':
        return new RegExp(trigger.value, 'i').test(incident.description);

      case 'threshold':
        const fieldValue = this.getIncidentFieldValue(incident, trigger.condition);
        return this.compareValues(fieldValue, trigger.operator || 'gte', trigger.value);

      default:
        return false;
    }
  }

  private canExecuteRule(rule: ContainmentRule): boolean {
    const now = new Date();

    // Check cooldown period
    if (rule.lastExecuted) {
      const timeSinceExecution = now.getTime() - rule.lastExecuted.getTime();
      const cooldownMs = rule.cooldownPeriod * 60 * 1000;

      if (timeSinceExecution < cooldownMs) {
        return false;
      }
    }

    // Check execution rate limit
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const recentExecutions = this.executionHistory.filter(exec =>
      exec.ruleId === rule.id && exec.startedAt > oneHourAgo
    ).length;

    return recentExecutions < rule.maxExecutions;
  }

  private async executeOnNetworkDevice(device: NetworkDevice, command: any): Promise<any> {
    if (!device.apiEndpoint) {
      throw new Error(`Device ${device.id} has no API endpoint configured`);
    }

    try {
      const response = await axios.post(`${device.apiEndpoint}/execute`, command, {
        headers: {
          'Authorization': `Bearer ${device.credentials?.value}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      });

      return response.data;
    } catch (error) {
      throw new Error(`Failed to execute command on device ${device.id}: ${error}`);
    }
  }

  private setupDefaultRules(): void {
    const defaultRules: ContainmentRule[] = [
      {
        id: 'malware_auto_isolate',
        name: 'Malware Auto-Isolation',
        description: 'Automatically isolate systems infected with malware',
        triggers: [
          { type: 'incident_type', condition: 'type', value: 'malware' },
          { type: 'severity', condition: 'severity', value: 'high' }
        ],
        actions: [
          {
            id: 'isolate_infected_system',
            type: 'isolate_system',
            description: 'Isolate infected system from network',
            parameters: {
              systemId: '{{incident.affectedSystems[0].systemId}}',
              isolationType: 'network'
            },
            timeout: 60,
            retryCount: 3,
            rollbackable: true
          }
        ],
        priority: 10,
        autoExecute: true,
        requiresApproval: false,
        enabled: true,
        cooldownPeriod: 30,
        maxExecutions: 5,
        executionCount: 0
      },
      {
        id: 'ddos_rate_limit',
        name: 'DDoS Rate Limiting',
        description: 'Apply rate limiting during DDoS attacks',
        triggers: [
          { type: 'incident_type', condition: 'type', value: 'ddos' }
        ],
        actions: [
          {
            id: 'apply_emergency_rate_limit',
            type: 'rate_limit',
            description: 'Apply emergency rate limiting',
            parameters: {
              target: '{{incident.source.ip}}',
              limit: 100
            },
            timeout: 30,
            retryCount: 2,
            rollbackable: true
          }
        ],
        priority: 15,
        autoExecute: true,
        requiresApproval: false,
        enabled: true,
        cooldownPeriod: 10,
        maxExecutions: 10,
        executionCount: 0
      },
      {
        id: 'data_breach_account_disable',
        name: 'Data Breach Account Disabling',
        description: 'Disable compromised accounts during data breach',
        triggers: [
          { type: 'incident_type', condition: 'type', value: 'data_breach' },
          { type: 'threshold', condition: 'affectedUsers.length', value: 1, operator: 'gte' }
        ],
        actions: [
          {
            id: 'disable_compromised_accounts',
            type: 'disable_account',
            description: 'Disable all compromised user accounts',
            parameters: {
              userId: '{{incident.affectedUsers}}',
              reason: 'Security incident - data breach containment'
            },
            timeout: 45,
            retryCount: 3,
            rollbackable: true
          }
        ],
        priority: 20,
        autoExecute: false,
        requiresApproval: true,
        enabled: true,
        cooldownPeriod: 60,
        maxExecutions: 3,
        executionCount: 0
      }
    ];

    defaultRules.forEach(rule => this.containmentRules.set(rule.id, rule));
  }

  private setupNetworkDevices(): void {
    const devices: NetworkDevice[] = [
      {
        id: 'main_firewall',
        name: 'Main Firewall',
        type: 'firewall',
        managementIP: '192.168.1.1',
        apiEndpoint: 'https://firewall.internal.urnlabs.ai/api/v1',
        capabilities: ['block_ip', 'update_rules', 'create_acl'],
        enabled: true
      },
      {
        id: 'core_switch',
        name: 'Core Switch',
        type: 'switch',
        managementIP: '192.168.1.2',
        apiEndpoint: 'https://switch.internal.urnlabs.ai/api/v1',
        capabilities: ['isolate_port', 'create_vlan', 'mirror_traffic'],
        enabled: true
      },
      {
        id: 'waf_primary',
        name: 'Primary WAF',
        type: 'waf',
        managementIP: '192.168.1.3',
        apiEndpoint: 'https://waf.internal.urnlabs.ai/api/v1',
        capabilities: ['rate_limit', 'block_requests', 'custom_rules'],
        enabled: true
      }
    ];

    devices.forEach(device => this.networkDevices.set(device.id, device));
  }

  private setupServiceEndpoints(): void {
    const endpoints: ServiceEndpoint[] = [
      {
        id: 'dns_service',
        name: 'Internal DNS Service',
        type: 'dns',
        endpoint: 'https://dns.internal.urnlabs.ai/api/v1',
        enabled: true
      },
      {
        id: 'auth_service',
        name: 'Authentication Service',
        type: 'auth',
        endpoint: 'https://auth.internal.urnlabs.ai/api/v1',
        enabled: true
      }
    ];

    endpoints.forEach(endpoint => this.serviceEndpoints.set(endpoint.id, endpoint));
  }

  private startMonitoring(): void {
    // Monitor execution timeouts
    setInterval(() => {
      this.checkExecutionTimeouts();
    }, 30000); // Check every 30 seconds

    // Clean up old executions
    setInterval(() => {
      this.cleanupOldExecutions();
    }, 60 * 60 * 1000); // Every hour
  }

  private checkExecutionTimeouts(): void {
    const now = new Date();

    for (const execution of this.activeExecutions.values()) {
      if (execution.status === 'executing') {
        const executionTime = now.getTime() - execution.startedAt.getTime();
        const maxExecutionTime = 10 * 60 * 1000; // 10 minutes

        if (executionTime > maxExecutionTime) {
          execution.status = 'failed';
          execution.error = 'Execution timeout';
          execution.completedAt = now;

          this.emit('execution_timeout', { executionId: execution.id });
        }
      }
    }
  }

  private cleanupOldExecutions(): void {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    for (const [id, execution] of this.activeExecutions.entries()) {
      if (execution.completedAt && execution.completedAt < oneDayAgo) {
        this.executionHistory.push(execution);
        this.activeExecutions.delete(id);
      }
    }

    // Keep only last 1000 executions in history
    if (this.executionHistory.length > 1000) {
      this.executionHistory = this.executionHistory.slice(-1000);
    }
  }

  // Additional helper methods would be implemented here...
  private resolveParameters(parameters: Record<string, any>, incident: SecurityIncident): Record<string, any> {
    // Simple template resolution - in production would use a proper template engine
    const resolved: Record<string, any> = {};

    for (const [key, value] of Object.entries(parameters)) {
      if (typeof value === 'string' && value.includes('{{')) {
        // Simple template replacement
        resolved[key] = value.replace(/\{\{([^}]+)\}\}/g, (match, path) => {
          return this.getNestedValue(incident, path.trim()) || match;
        });
      } else {
        resolved[key] = value;
      }
    }

    return resolved;
  }

  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => {
      if (key.includes('[') && key.includes(']')) {
        const [arrayKey, indexStr] = key.split('[');
        const index = parseInt(indexStr.replace(']', ''));
        return current?.[arrayKey]?.[index];
      }
      return current?.[key];
    }, obj);
  }

  private getIncidentFieldValue(incident: SecurityIncident, field: string): any {
    return this.getNestedValue(incident, field);
  }

  private compareValues(actual: any, operator: string, expected: any): boolean {
    switch (operator) {
      case 'gte': return actual >= expected;
      case 'gt': return actual > expected;
      case 'lte': return actual <= expected;
      case 'lt': return actual < expected;
      case 'equals': return actual === expected;
      default: return false;
    }
  }

  private generateExecutionId(): string {
    return `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private topologicalSort(actions: ContainmentAction[]): ContainmentAction[] {
    // Simple topological sort for action dependencies
    const sorted: ContainmentAction[] = [];
    const visited = new Set<string>();
    const visiting = new Set<string>();

    const visit = (action: ContainmentAction): void => {
      if (visiting.has(action.id)) {
        throw new Error(`Circular dependency detected involving action ${action.id}`);
      }
      if (visited.has(action.id)) return;

      visiting.add(action.id);

      if (action.dependencies) {
        for (const depId of action.dependencies) {
          const depAction = actions.find(a => a.id === depId);
          if (depAction) {
            visit(depAction);
          }
        }
      }

      visiting.delete(action.id);
      visited.add(action.id);
      sorted.push(action);
    };

    for (const action of actions) {
      if (!visited.has(action.id)) {
        visit(action);
      }
    }

    return sorted;
  }

  private async requestApproval(execution: ContainmentExecution, incident: SecurityIncident): Promise<void> {
    // Emit approval request event - in production would integrate with approval workflow
    this.emit('approval_required', {
      executionId: execution.id,
      incidentId: incident.incidentId,
      ruleId: execution.ruleId,
      actions: execution.actions
    });
  }

  private async validateAction(action: ContainmentAction): Promise<void> {
    if (!action.validation) return;

    for (const validation of action.validation) {
      switch (validation.type) {
        case 'api_response':
          if (validation.endpoint) {
            await this.validateAPIResponse(validation.endpoint, validation.expectedValue);
          }
          break;
        case 'system_status':
          await this.validateSystemStatus();
          break;
        case 'connectivity':
          await this.validateConnectivity();
          break;
        case 'performance':
          await this.validatePerformance();
          break;
      }
    }
  }

  private async validateAPIResponse(endpoint: string, expectedValue: any): Promise<void> {
    // Validation implementation
  }

  private async validateSystemStatus(): Promise<void> {
    // System status validation
  }

  private async validateConnectivity(): Promise<void> {
    // Connectivity validation
  }

  private async validatePerformance(): Promise<void> {
    // Performance validation
  }

  private async captureRollbackData(action: ContainmentAction, result: any): Promise<any> {
    // Capture data needed for rollback
    return {
      action: action.type,
      originalState: result,
      timestamp: new Date().toISOString()
    };
  }

  private async rollbackAction(action: ExecutedAction): Promise<any> {
    // Implement rollback logic for each action type
    console.log(`Rolling back action: ${action.type}`);
    return { rolled_back: true, timestamp: new Date().toISOString() };
  }

  private scheduleAutoRollback(execution: ContainmentExecution, rule: ContainmentRule): void {
    // Schedule automatic rollback if configured
    const autoRollbackDelay = 60 * 60 * 1000; // 1 hour

    const timeout = setTimeout(async () => {
      try {
        await this.rollbackExecution(execution.id);
      } catch (error) {
        console.error(`Auto-rollback failed for execution ${execution.id}:`, error);
      }
    }, autoRollbackDelay);

    this.rollbackTimeouts.set(execution.id, timeout);
  }

  private async shutdownNetworkInterfaces(systemId: string): Promise<any> {
    // Implementation for shutting down network interfaces
    return { systemId, action: 'network_shutdown', timestamp: new Date().toISOString() };
  }

  /**
   * Public API methods
   */

  public addContainmentRule(rule: ContainmentRule): void {
    this.containmentRules.set(rule.id, rule);
    this.emit('rule_added', rule);
  }

  public removeContainmentRule(ruleId: string): boolean {
    const removed = this.containmentRules.delete(ruleId);
    if (removed) {
      this.emit('rule_removed', ruleId);
    }
    return removed;
  }

  public getActiveExecutions(): ContainmentExecution[] {
    return Array.from(this.activeExecutions.values());
  }

  public getContainmentRules(): ContainmentRule[] {
    return Array.from(this.containmentRules.values());
  }

  public async approveExecution(executionId: string): Promise<void> {
    const execution = this.activeExecutions.get(executionId);
    if (!execution) {
      throw new Error(`Execution ${executionId} not found`);
    }

    const rule = this.containmentRules.get(execution.ruleId);
    if (!rule) {
      throw new Error(`Rule ${execution.ruleId} not found`);
    }

    const incident = { incidentId: execution.incidentId } as SecurityIncident;
    await this.executeActions(execution, rule, incident);
  }

  public async denyExecution(executionId: string, reason: string): Promise<void> {
    const execution = this.activeExecutions.get(executionId);
    if (execution) {
      execution.status = 'failed';
      execution.error = `Denied: ${reason}`;
      execution.completedAt = new Date();

      this.emit('execution_denied', { executionId, reason });
    }
  }

  public destroy(): void {
    // Clear all timeouts
    for (const timeout of this.rollbackTimeouts.values()) {
      clearTimeout(timeout);
    }

    this.removeAllListeners();
  }
}

export const automatedContainmentService = new AutomatedContainmentService();