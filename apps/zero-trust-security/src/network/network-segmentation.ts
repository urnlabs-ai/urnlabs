import { EventEmitter } from 'events';
import ip from 'ip';
import { logger } from '../utils/logger.js';
import type {
  NetworkSegment,
  ZeroTrustPolicy,
  PolicyRule,
  PolicyCondition,
  PolicyAction,
  SecurityContext,
  AccessRequest,
  AccessDecision,
  CommunicationChannel
} from '../types/security-types.js';

export class NetworkSegmentationManager extends EventEmitter {
  private segments: Map<string, NetworkSegment> = new Map();
  private communicationChannels: Map<string, CommunicationChannel> = new Map();
  private activeConnections: Map<string, any> = new Map();
  private firewallRules: Map<string, any> = new Map();
  private trafficMonitoring: boolean = true;

  constructor() {
    super();
    this.initializeNetworkSegmentation();
    this.setupDefaultSegments();
    this.startTrafficMonitoring();
  }

  private initializeNetworkSegmentation(): void {
    logger.info('Initializing network segmentation manager');

    // Setup network monitoring
    this.setupNetworkMonitoring();

    // Initialize firewall rules
    this.initializeFirewallRules();
  }

  private setupNetworkMonitoring(): void {
    // In production, integrate with network monitoring tools
    // For demo, simulate network monitoring capabilities
    logger.debug('Network monitoring initialized');
  }

  private initializeFirewallRules(): void {
    // Default deny-all rule
    this.firewallRules.set('default-deny', {
      id: 'default-deny',
      action: 'DENY',
      priority: 1000,
      source: '0.0.0.0/0',
      destination: '0.0.0.0/0',
      ports: '*',
      protocol: '*',
      description: 'Default deny all traffic'
    });

    logger.debug('Default firewall rules initialized');
  }

  private setupDefaultSegments(): void {
    // Create default network segments for zero-trust architecture

    // Management segment
    this.createSegment({
      id: 'mgmt',
      name: 'Management Network',
      description: 'Network segment for administrative and management traffic',
      ipRanges: ['10.0.1.0/24'],
      allowedPorts: [22, 443, 8080],
      allowedProtocols: ['HTTPS', 'SSH'],
      accessPolicies: [],
      isolationLevel: 'STRICT',
      monitoring: true
    });

    // User segment
    this.createSegment({
      id: 'users',
      name: 'User Network',
      description: 'Network segment for user devices and applications',
      ipRanges: ['10.0.10.0/24', '10.0.11.0/24'],
      allowedPorts: [80, 443, 8080, 8443],
      allowedProtocols: ['HTTPS', 'WSS'],
      accessPolicies: [],
      isolationLevel: 'BASIC',
      monitoring: true
    });

    // Application segment
    this.createSegment({
      id: 'apps',
      name: 'Application Network',
      description: 'Network segment for application services',
      ipRanges: ['10.0.20.0/24'],
      allowedPorts: [80, 443, 3000, 3001, 8080, 8443],
      allowedProtocols: ['HTTPS', 'HTTP', 'GRPC'],
      accessPolicies: [],
      isolationLevel: 'BASIC',
      monitoring: true
    });

    // Database segment
    this.createSegment({
      id: 'data',
      name: 'Database Network',
      description: 'Network segment for database and storage services',
      ipRanges: ['10.0.30.0/24'],
      allowedPorts: [5432, 6379, 27017, 3306],
      allowedProtocols: ['TCP'],
      accessPolicies: [],
      isolationLevel: 'STRICT',
      monitoring: true
    });

    // DMZ segment
    this.createSegment({
      id: 'dmz',
      name: 'DMZ Network',
      description: 'Demilitarized zone for external-facing services',
      ipRanges: ['10.0.100.0/24'],
      allowedPorts: [80, 443],
      allowedProtocols: ['HTTPS', 'HTTP'],
      accessPolicies: [],
      isolationLevel: 'COMPLETE',
      monitoring: true
    });

    logger.info('Default network segments created', {
      segmentCount: this.segments.size
    });
  }

  public createSegment(segmentConfig: Omit<NetworkSegment, 'id'> & { id?: string }): NetworkSegment {
    const segment: NetworkSegment = {
      id: segmentConfig.id || this.generateSegmentId(),
      name: segmentConfig.name,
      description: segmentConfig.description,
      ipRanges: segmentConfig.ipRanges,
      allowedPorts: segmentConfig.allowedPorts,
      allowedProtocols: segmentConfig.allowedProtocols,
      accessPolicies: segmentConfig.accessPolicies || [],
      isolationLevel: segmentConfig.isolationLevel,
      monitoring: segmentConfig.monitoring
    };

    this.segments.set(segment.id, segment);

    // Create firewall rules for this segment
    this.createSegmentFirewallRules(segment);

    logger.info('Network segment created', {
      segmentId: segment.id,
      name: segment.name,
      ipRanges: segment.ipRanges,
      isolationLevel: segment.isolationLevel
    });

    this.emit('segmentCreated', segment);

    return segment;
  }

  private generateSegmentId(): string {
    return `seg-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
  }

  private createSegmentFirewallRules(segment: NetworkSegment): void {
    // Create inbound rules
    segment.allowedPorts.forEach((port, index) => {
      const ruleId = `${segment.id}-inbound-${port}`;
      this.firewallRules.set(ruleId, {
        id: ruleId,
        action: 'ALLOW',
        priority: 100 + index,
        source: '0.0.0.0/0',
        destination: segment.ipRanges,
        ports: [port],
        protocol: segment.allowedProtocols,
        description: `Allow inbound traffic to ${segment.name} on port ${port}`
      });
    });

    // Create isolation rules based on isolation level
    this.createIsolationRules(segment);
  }

  private createIsolationRules(segment: NetworkSegment): void {
    switch (segment.isolationLevel) {
      case 'COMPLETE':
        // No communication with other segments
        this.firewallRules.set(`${segment.id}-isolate-complete`, {
          id: `${segment.id}-isolate-complete`,
          action: 'DENY',
          priority: 50,
          source: segment.ipRanges,
          destination: '10.0.0.0/8',
          ports: '*',
          protocol: '*',
          description: `Complete isolation for ${segment.name}`
        });
        break;

      case 'STRICT':
        // Only allow specific inter-segment communication
        this.createStrictIsolationRules(segment);
        break;

      case 'BASIC':
        // Allow some inter-segment communication with monitoring
        this.createBasicIsolationRules(segment);
        break;

      case 'NONE':
        // No additional isolation rules
        break;
    }
  }

  private createStrictIsolationRules(segment: NetworkSegment): void {
    // For strict isolation, only allow specific required communications
    const allowedSegments = this.getAllowedSegments(segment.id);

    allowedSegments.forEach(targetSegmentId => {
      const targetSegment = this.segments.get(targetSegmentId);
      if (targetSegment) {
        this.firewallRules.set(`${segment.id}-to-${targetSegmentId}`, {
          id: `${segment.id}-to-${targetSegmentId}`,
          action: 'ALLOW',
          priority: 200,
          source: segment.ipRanges,
          destination: targetSegment.ipRanges,
          ports: targetSegment.allowedPorts,
          protocol: targetSegment.allowedProtocols,
          description: `Allow communication from ${segment.name} to ${targetSegment.name}`
        });
      }
    });
  }

  private createBasicIsolationRules(segment: NetworkSegment): void {
    // For basic isolation, allow most communications but with monitoring
    this.firewallRules.set(`${segment.id}-monitor-all`, {
      id: `${segment.id}-monitor-all`,
      action: 'ALLOW_WITH_LOG',
      priority: 300,
      source: segment.ipRanges,
      destination: '10.0.0.0/8',
      ports: '*',
      protocol: '*',
      description: `Monitor all traffic from ${segment.name}`
    });
  }

  private getAllowedSegments(segmentId: string): string[] {
    // Define allowed inter-segment communications
    const allowedCommunications: Record<string, string[]> = {
      'mgmt': ['users', 'apps', 'data'], // Management can access all
      'users': ['apps'], // Users can access applications
      'apps': ['data'], // Applications can access data
      'data': [], // Data layer doesn't initiate connections
      'dmz': ['apps'] // DMZ can access applications
    };

    return allowedCommunications[segmentId] || [];
  }

  public async authorizeNetworkAccess(request: {
    sourceIp: string;
    destinationIp: string;
    destinationPort: number;
    protocol: string;
    securityContext: SecurityContext;
  }): Promise<AccessDecision> {
    logger.debug('Evaluating network access request', {
      sourceIp: request.sourceIp,
      destinationIp: request.destinationIp,
      destinationPort: request.destinationPort,
      protocol: request.protocol
    });

    try {
      // Determine source and destination segments
      const sourceSegment = this.findSegmentByIp(request.sourceIp);
      const destinationSegment = this.findSegmentByIp(request.destinationIp);

      if (!sourceSegment || !destinationSegment) {
        return {
          result: 'DENY',
          reason: 'Source or destination IP not in any managed network segment'
        };
      }

      // Check firewall rules
      const firewallDecision = this.evaluateFirewallRules(request, sourceSegment, destinationSegment);
      if (firewallDecision.result === 'DENY') {
        return firewallDecision;
      }

      // Evaluate segment-specific policies
      const policyDecision = await this.evaluateSegmentPolicies(
        request,
        sourceSegment,
        destinationSegment
      );

      if (policyDecision.result === 'DENY') {
        return policyDecision;
      }

      // Check protocol and port allowances
      const protocolDecision = this.evaluateProtocolAccess(
        request,
        destinationSegment
      );

      if (protocolDecision.result === 'DENY') {
        return protocolDecision;
      }

      // Create or update communication channel
      await this.establishCommunicationChannel(
        request,
        sourceSegment,
        destinationSegment
      );

      // Log the access for monitoring
      this.logNetworkAccess(request, sourceSegment, destinationSegment, 'ALLOW');

      return {
        result: 'ALLOW',
        reason: 'Network access authorized by zero-trust policies'
      };

    } catch (error) {
      logger.error('Network access authorization failed', {
        error: error.message,
        sourceIp: request.sourceIp,
        destinationIp: request.destinationIp
      });

      return {
        result: 'DENY',
        reason: 'Network access authorization system error'
      };
    }
  }

  private findSegmentByIp(ipAddress: string): NetworkSegment | null {
    for (const segment of this.segments.values()) {
      for (const ipRange of segment.ipRanges) {
        if (this.isIpInRange(ipAddress, ipRange)) {
          return segment;
        }
      }
    }
    return null;
  }

  private isIpInRange(ipAddress: string, range: string): boolean {
    try {
      const [rangeIp, prefixLength] = range.split('/');
      const subnet = ip.subnet(rangeIp, `/${prefixLength || '32'}`);
      return subnet.contains(ipAddress);
    } catch {
      return false;
    }
  }

  private evaluateFirewallRules(
    request: {
      sourceIp: string;
      destinationIp: string;
      destinationPort: number;
      protocol: string;
    },
    sourceSegment: NetworkSegment,
    destinationSegment: NetworkSegment
  ): AccessDecision {
    // Get applicable firewall rules, sorted by priority
    const applicableRules = Array.from(this.firewallRules.values())
      .filter(rule => this.ruleApplies(rule, request))
      .sort((a, b) => a.priority - b.priority);

    // Apply first matching rule
    for (const rule of applicableRules) {
      if (rule.action === 'DENY') {
        return {
          result: 'DENY',
          reason: `Blocked by firewall rule: ${rule.description}`
        };
      } else if (rule.action === 'ALLOW' || rule.action === 'ALLOW_WITH_LOG') {
        if (rule.action === 'ALLOW_WITH_LOG') {
          this.logNetworkAccess(request, sourceSegment, destinationSegment, 'MONITORED');
        }
        return {
          result: 'ALLOW',
          reason: `Allowed by firewall rule: ${rule.description}`
        };
      }
    }

    // Default deny if no matching allow rule
    return {
      result: 'DENY',
      reason: 'No matching firewall rule found - default deny'
    };
  }

  private ruleApplies(rule: any, request: {
    sourceIp: string;
    destinationIp: string;
    destinationPort: number;
    protocol: string;
  }): boolean {
    // Check source IP
    if (rule.source !== '0.0.0.0/0' && Array.isArray(rule.source)) {
      const sourceMatches = rule.source.some((range: string) =>
        this.isIpInRange(request.sourceIp, range)
      );
      if (!sourceMatches) return false;
    }

    // Check destination IP
    if (rule.destination !== '0.0.0.0/0' && Array.isArray(rule.destination)) {
      const destMatches = rule.destination.some((range: string) =>
        this.isIpInRange(request.destinationIp, range)
      );
      if (!destMatches) return false;
    }

    // Check ports
    if (rule.ports !== '*' && Array.isArray(rule.ports)) {
      if (!rule.ports.includes(request.destinationPort)) return false;
    }

    // Check protocol
    if (rule.protocol !== '*' && Array.isArray(rule.protocol)) {
      if (!rule.protocol.includes(request.protocol)) return false;
    }

    return true;
  }

  private async evaluateSegmentPolicies(
    request: any,
    sourceSegment: NetworkSegment,
    destinationSegment: NetworkSegment
  ): Promise<AccessDecision> {
    // Evaluate policies specific to the destination segment
    for (const policy of destinationSegment.accessPolicies) {
      if (!policy.enabled) continue;

      const policyResult = await this.evaluatePolicy(policy, request, sourceSegment, destinationSegment);
      if (policyResult.result === 'DENY') {
        return policyResult;
      }
    }

    return {
      result: 'ALLOW',
      reason: 'All segment policies satisfied'
    };
  }

  private async evaluatePolicy(
    policy: ZeroTrustPolicy,
    request: any,
    sourceSegment: NetworkSegment,
    destinationSegment: NetworkSegment
  ): Promise<AccessDecision> {
    for (const rule of policy.rules) {
      const ruleMatches = this.evaluatePolicyRule(rule, request, sourceSegment, destinationSegment);

      if (ruleMatches) {
        switch (rule.type) {
          case 'DENY':
            return {
              result: 'DENY',
              reason: `Denied by policy: ${policy.name}`
            };
          case 'ALLOW':
            return {
              result: 'ALLOW',
              reason: `Allowed by policy: ${policy.name}`
            };
          case 'REQUIRE_MFA':
            return {
              result: 'CONDITIONAL',
              reason: `MFA required by policy: ${policy.name}`,
              conditions: [{
                field: 'mfa_verified',
                operator: 'equals',
                value: true
              }]
            };
          case 'REQUIRE_DEVICE_CERT':
            return {
              result: 'CONDITIONAL',
              reason: `Device certificate required by policy: ${policy.name}`,
              conditions: [{
                field: 'device_certificate_valid',
                operator: 'equals',
                value: true
              }]
            };
        }
      }
    }

    return {
      result: 'ALLOW',
      reason: 'Policy evaluation passed'
    };
  }

  private evaluatePolicyRule(
    rule: PolicyRule,
    request: any,
    sourceSegment: NetworkSegment,
    destinationSegment: NetworkSegment
  ): boolean {
    return rule.conditions.every(condition => {
      return this.evaluateCondition(condition, request, sourceSegment, destinationSegment);
    });
  }

  private evaluateCondition(
    condition: PolicyCondition,
    request: any,
    sourceSegment: NetworkSegment,
    destinationSegment: NetworkSegment
  ): boolean {
    let value: any;

    // Extract value based on condition field
    switch (condition.field) {
      case 'source_segment':
        value = sourceSegment.id;
        break;
      case 'destination_segment':
        value = destinationSegment.id;
        break;
      case 'destination_port':
        value = request.destinationPort;
        break;
      case 'protocol':
        value = request.protocol;
        break;
      case 'time_of_day':
        value = new Date().getHours();
        break;
      default:
        value = request[condition.field];
    }

    // Evaluate condition based on operator
    switch (condition.operator) {
      case 'equals':
        return value === condition.value;
      case 'contains':
        return typeof value === 'string' && value.includes(condition.value as string);
      case 'in':
        return Array.isArray(condition.value) && condition.value.includes(value);
      case 'notIn':
        return Array.isArray(condition.value) && !condition.value.includes(value);
      default:
        return false;
    }
  }

  private evaluateProtocolAccess(
    request: {
      destinationPort: number;
      protocol: string;
    },
    destinationSegment: NetworkSegment
  ): AccessDecision {
    // Check if protocol is allowed
    if (!destinationSegment.allowedProtocols.includes(request.protocol)) {
      return {
        result: 'DENY',
        reason: `Protocol ${request.protocol} not allowed in segment ${destinationSegment.name}`
      };
    }

    // Check if port is allowed
    if (!destinationSegment.allowedPorts.includes(request.destinationPort)) {
      return {
        result: 'DENY',
        reason: `Port ${request.destinationPort} not allowed in segment ${destinationSegment.name}`
      };
    }

    return {
      result: 'ALLOW',
      reason: 'Protocol and port access authorized'
    };
  }

  private async establishCommunicationChannel(
    request: {
      sourceIp: string;
      destinationIp: string;
      destinationPort: number;
      protocol: string;
    },
    sourceSegment: NetworkSegment,
    destinationSegment: NetworkSegment
  ): Promise<void> {
    const channelId = `${sourceSegment.id}-${destinationSegment.id}-${request.destinationPort}`;

    const existingChannel = this.communicationChannels.get(channelId);
    if (existingChannel) {
      existingChannel.lastUsed = new Date();
      return;
    }

    // Create new communication channel
    const channel: CommunicationChannel = {
      id: channelId,
      sourceService: sourceSegment.name,
      targetService: destinationSegment.name,
      protocol: this.mapProtocol(request.protocol),
      encryption: {
        algorithm: 'AES-256-GCM',
        keySize: 256,
        rotationInterval: 24,
        backupKeys: 2
      },
      certificateInfo: {
        serialNumber: '',
        issuer: 'Urnlabs Zero Trust CA',
        subject: `CN=${channelId}`,
        validFrom: new Date(),
        validTo: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        fingerprint: '',
        algorithm: 'SHA256withRSA',
        keySize: 2048
      },
      lastUsed: new Date(),
      isActive: true
    };

    this.communicationChannels.set(channelId, channel);

    logger.debug('Communication channel established', {
      channelId,
      sourceSegment: sourceSegment.name,
      targetSegment: destinationSegment.name,
      protocol: request.protocol,
      port: request.destinationPort
    });
  }

  private mapProtocol(protocol: string): CommunicationChannel['protocol'] {
    const protocolMap: Record<string, CommunicationChannel['protocol']> = {
      'HTTP': 'HTTPS', // Upgrade to HTTPS
      'HTTPS': 'HTTPS',
      'WS': 'WSS', // Upgrade to WSS
      'WSS': 'WSS',
      'TCP': 'TCP',
      'UDP': 'UDP',
      'GRPC': 'GRPC'
    };

    return protocolMap[protocol.toUpperCase()] || 'TCP';
  }

  private logNetworkAccess(
    request: {
      sourceIp: string;
      destinationIp: string;
      destinationPort: number;
      protocol: string;
    },
    sourceSegment: NetworkSegment,
    destinationSegment: NetworkSegment,
    action: string
  ): void {
    logger.info('Network access event', {
      action,
      sourceIp: request.sourceIp,
      sourceSegment: sourceSegment.name,
      destinationIp: request.destinationIp,
      destinationSegment: destinationSegment.name,
      destinationPort: request.destinationPort,
      protocol: request.protocol,
      timestamp: new Date().toISOString()
    });

    // Emit event for external monitoring
    this.emit('networkAccess', {
      action,
      request,
      sourceSegment,
      destinationSegment
    });
  }

  private startTrafficMonitoring(): void {
    if (!this.trafficMonitoring) return;

    // Monitor active connections every 30 seconds
    setInterval(() => {
      this.monitorActiveConnections();
    }, 30 * 1000);

    logger.info('Network traffic monitoring started');
  }

  private monitorActiveConnections(): void {
    // Clean up inactive channels
    const now = new Date();
    const inactiveThreshold = 5 * 60 * 1000; // 5 minutes

    for (const [channelId, channel] of this.communicationChannels.entries()) {
      if (now.getTime() - channel.lastUsed.getTime() > inactiveThreshold) {
        channel.isActive = false;
        logger.debug('Communication channel marked inactive', { channelId });
      }
    }
  }

  public getNetworkMetrics(): {
    segmentCount: number;
    activeChannels: number;
    firewallRules: number;
    trafficStats: {
      totalRequests: number;
      allowedRequests: number;
      deniedRequests: number;
    };
  } {
    const activeChannels = Array.from(this.communicationChannels.values())
      .filter(channel => channel.isActive).length;

    return {
      segmentCount: this.segments.size,
      activeChannels,
      firewallRules: this.firewallRules.size,
      trafficStats: {
        totalRequests: 0, // Would be tracked in production
        allowedRequests: 0,
        deniedRequests: 0
      }
    };
  }

  public getSegments(): NetworkSegment[] {
    return Array.from(this.segments.values());
  }

  public getSegment(segmentId: string): NetworkSegment | undefined {
    return this.segments.get(segmentId);
  }

  public updateSegmentPolicy(segmentId: string, policy: ZeroTrustPolicy): boolean {
    const segment = this.segments.get(segmentId);
    if (!segment) {
      return false;
    }

    // Add or update policy
    const existingPolicyIndex = segment.accessPolicies.findIndex(p => p.id === policy.id);
    if (existingPolicyIndex >= 0) {
      segment.accessPolicies[existingPolicyIndex] = policy;
    } else {
      segment.accessPolicies.push(policy);
    }

    this.segments.set(segmentId, segment);

    logger.info('Segment policy updated', {
      segmentId,
      policyId: policy.id,
      policyName: policy.name
    });

    return true;
  }

  public shutdown(): void {
    this.segments.clear();
    this.communicationChannels.clear();
    this.activeConnections.clear();
    this.firewallRules.clear();
    this.trafficMonitoring = false;

    logger.info('Network segmentation manager shut down');
  }
}