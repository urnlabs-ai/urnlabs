/**
 * Suricata Integration - Network-based Intrusion Detection System
 * Integrates with Suricata IDS for network traffic analysis and threat detection
 */

import EventEmitter from 'events';
import { Logger } from 'pino';
import * as fs from 'fs/promises';
import * as path from 'path';
import { spawn, ChildProcess } from 'child_process';
import { WebSocket } from 'ws';
import * as yaml from 'js-yaml';
import {
  SecurityEvent,
  SecurityEventType,
  SecuritySeverity,
  IDSConfiguration,
  SuricataAlert,
  SuricataStats,
  SuricataRule,
  SuricataConfig,
  NetworkPacket,
  FlowInfo
} from './types';

export interface SuricataIntegrationConfig {
  suricataPath: string;
  configPath: string;
  logPath: string;
  rulesPath: string;
  socketPath?: string;
  interfaces: string[];
  runMode: 'ids' | 'ips';
  homeNets: string[];
  externalNets: string[];
  enableEveLog: boolean;
  enableFastLog: boolean;
  enableUnifiedLog: boolean;
  enableHttpLog: boolean;
  enableTlsLog: boolean;
  enableDnsLog: boolean;
  enableFileLog: boolean;
  enableStatsLog: boolean;
  customRules: SuricataRule[];
  threatIntelFeeds: string[];
  performanceTuning: {
    maxPendingPackets: number;
    maxPacketSize: number;
    threadCount: number;
    memoryLimit: string;
    captureMethod: 'af-packet' | 'pcap' | 'netmap';
  };
}

export class SuricataIntegration extends EventEmitter {
  private config: SuricataIntegrationConfig;
  private logger: Logger;
  private suricataProcess?: ChildProcess;
  private isRunning: boolean = false;
  private logWatchers: Map<string, fs.FileHandle> = new Map();
  private stats: SuricataStats;
  private rules: Map<string, SuricataRule> = new Map();
  private alertQueue: SuricataAlert[] = [];
  private webSocket?: WebSocket;
  private performanceMetrics: {
    packetsProcessed: number;
    alertsGenerated: number;
    droppedPackets: number;
    averageProcessingTime: number;
    memoryUsage: number;
    cpuUsage: number;
  };

  constructor(config: SuricataIntegrationConfig, logger: Logger) {
    super();
    this.config = config;
    this.logger = logger.child({ component: 'SuricataIntegration' });
    this.stats = this.initializeStats();
    this.performanceMetrics = {
      packetsProcessed: 0,
      alertsGenerated: 0,
      droppedPackets: 0,
      averageProcessingTime: 0,
      memoryUsage: 0,
      cpuUsage: 0
    };
  }

  /**
   * Initialize Suricata integration
   */
  async initialize(): Promise<void> {
    try {
      this.logger.info('Initializing Suricata integration...');

      // Verify Suricata installation
      await this.verifySuricataInstallation();

      // Generate Suricata configuration
      await this.generateSuricataConfig();

      // Load and update rules
      await this.loadSuricataRules();
      await this.updateCustomRules();

      // Update threat intelligence feeds
      await this.updateThreatIntelFeeds();

      // Setup log watchers
      await this.setupLogWatchers();

      this.logger.info('Suricata integration initialized successfully');

    } catch (error) {
      this.logger.error('Failed to initialize Suricata integration:', error);
      throw error;
    }
  }

  /**
   * Start Suricata IDS
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      this.logger.warn('Suricata is already running');
      return;
    }

    try {
      this.logger.info('Starting Suricata IDS...');

      // Start Suricata process
      await this.startSuricataProcess();

      // Start log monitoring
      await this.startLogMonitoring();

      // Start performance monitoring
      this.startPerformanceMonitoring();

      // Setup WebSocket for real-time communication
      if (this.config.socketPath) {
        await this.setupWebSocket();
      }

      this.isRunning = true;
      this.logger.info('Suricata IDS started successfully');
      this.emit('started');

    } catch (error) {
      this.logger.error('Failed to start Suricata:', error);
      throw error;
    }
  }

  /**
   * Stop Suricata IDS
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      this.logger.warn('Suricata is not running');
      return;
    }

    try {
      this.logger.info('Stopping Suricata IDS...');

      // Stop Suricata process
      if (this.suricataProcess) {
        this.suricataProcess.kill('SIGTERM');
        
        // Wait for graceful shutdown
        await new Promise((resolve) => {
          const timeout = setTimeout(() => {
            if (this.suricataProcess) {
              this.suricataProcess.kill('SIGKILL');
            }
            resolve(void 0);
          }, 10000);

          if (this.suricataProcess) {
            this.suricataProcess.on('exit', () => {
              clearTimeout(timeout);
              resolve(void 0);
            });
          }
        });
      }

      // Close log watchers
      for (const [name, handle] of this.logWatchers) {
        await handle.close();
        this.logger.debug(`Closed log watcher: ${name}`);
      }
      this.logWatchers.clear();

      // Close WebSocket
      if (this.webSocket) {
        this.webSocket.close();
      }

      this.isRunning = false;
      this.logger.info('Suricata IDS stopped successfully');
      this.emit('stopped');

    } catch (error) {
      this.logger.error('Error stopping Suricata:', error);
      throw error;
    }
  }

  /**
   * Reload Suricata rules
   */
  async reloadRules(): Promise<void> {
    try {
      this.logger.info('Reloading Suricata rules...');

      // Update custom rules
      await this.updateCustomRules();

      // Send USR2 signal to reload rules
      if (this.suricataProcess && this.suricataProcess.pid) {
        process.kill(this.suricataProcess.pid, 'SIGUSR2');
        this.logger.info('Sent reload signal to Suricata');
      }

      // Update threat intelligence
      await this.updateThreatIntelFeeds();

      this.emit('rulesReloaded');

    } catch (error) {
      this.logger.error('Error reloading Suricata rules:', error);
      throw error;
    }
  }

  /**
   * Add custom detection rule
   */
  async addCustomRule(rule: SuricataRule): Promise<void> {
    try {
      this.rules.set(rule.sid.toString(), rule);
      
      // Write rule to custom rules file
      const customRulesPath = path.join(this.config.rulesPath, 'custom.rules');
      const ruleString = this.formatSuricataRule(rule);
      
      await fs.appendFile(customRulesPath, ruleString + '\n');
      
      this.logger.info(`Added custom rule: ${rule.msg} (SID: ${rule.sid})`);
      
      // Reload rules if Suricata is running
      if (this.isRunning) {
        await this.reloadRules();
      }

    } catch (error) {
      this.logger.error('Error adding custom rule:', error);
      throw error;
    }
  }

  /**
   * Remove custom detection rule
   */
  async removeCustomRule(sid: number): Promise<void> {
    try {
      if (!this.rules.has(sid.toString())) {
        this.logger.warn(`Rule with SID ${sid} not found`);
        return;
      }

      this.rules.delete(sid.toString());
      
      // Regenerate custom rules file
      await this.updateCustomRules();
      
      this.logger.info(`Removed custom rule: SID ${sid}`);
      
      // Reload rules if Suricata is running
      if (this.isRunning) {
        await this.reloadRules();
      }

    } catch (error) {
      this.logger.error('Error removing custom rule:', error);
      throw error;
    }
  }

  /**
   * Get Suricata statistics
   */
  getStats(): SuricataStats {
    return { ...this.stats };
  }

  /**
   * Get performance metrics
   */
  getPerformanceMetrics(): typeof this.performanceMetrics {
    return { ...this.performanceMetrics };
  }

  /**
   * Process network packet for analysis
   */
  async processPacket(packet: NetworkPacket): Promise<SecurityEvent[]> {
    const events: SecurityEvent[] = [];

    try {
      // This would be used for custom packet analysis
      // In practice, Suricata handles packet processing
      
      this.performanceMetrics.packetsProcessed++;
      
      // Generate security event if needed
      if (packet.suspicious) {
        const event: SecurityEvent = {
          id: `suricata-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          timestamp: new Date(),
          type: SecurityEventType.NETWORK_INTRUSION,
          severity: SecuritySeverity.MEDIUM,
          source: {
            ip: packet.sourceIp,
            port: packet.sourcePort,
            userAgent: packet.userAgent
          },
          target: {
            ip: packet.destIp,
            port: packet.destPort,
            endpoint: packet.url
          },
          details: {
            protocol: packet.protocol,
            packetSize: packet.size,
            payload: packet.payload?.toString('base64'),
            headers: packet.headers
          },
          riskScore: packet.riskScore || 50,
          confidence: 0.8
        };

        events.push(event);
        this.emit('securityEvent', event);
      }

    } catch (error) {
      this.logger.error('Error processing packet:', error);
    }

    return events;
  }

  /**
   * Verify Suricata installation
   */
  private async verifySuricataInstallation(): Promise<void> {
    try {
      const { spawn } = require('child_process');
      
      await new Promise<void>((resolve, reject) => {
        const process = spawn(this.config.suricataPath, ['--version']);
        
        process.on('exit', (code: number) => {
          if (code === 0) {
            resolve();
          } else {
            reject(new Error(`Suricata not found or invalid: exit code ${code}`));
          }
        });

        process.on('error', (error: Error) => {
          reject(new Error(`Suricata not found: ${error.message}`));
        });
      });

      this.logger.info('Suricata installation verified');

    } catch (error) {
      this.logger.error('Suricata verification failed:', error);
      throw error;
    }
  }

  /**
   * Generate Suricata configuration file
   */
  private async generateSuricataConfig(): Promise<void> {
    const config: SuricataConfig = {
      vars: {
        'address-groups': {
          HOME_NET: this.config.homeNets,
          EXTERNAL_NET: this.config.externalNets,
          HTTP_SERVERS: this.config.homeNets,
          SMTP_SERVERS: this.config.homeNets,
          SQL_SERVERS: this.config.homeNets,
          DNS_SERVERS: this.config.homeNets,
          TELNET_SERVERS: this.config.homeNets,
          AIM_SERVERS: this.config.externalNets,
          DC_SERVERS: this.config.homeNets,
          DNP3_SERVER: this.config.homeNets,
          DNP3_CLIENT: this.config.homeNets,
          MODBUS_CLIENT: this.config.homeNets,
          MODBUS_SERVER: this.config.homeNets,
          ENIP_CLIENT: this.config.homeNets,
          ENIP_SERVER: this.config.homeNets
        },
        'port-groups': {
          HTTP_PORTS: '[80,8080,8081,443,8443]',
          SHELLCODE_PORTS: '!80',
          ORACLE_PORTS: '[1521,1526]',
          SSH_PORTS: '[22]',
          DNP3_PORTS: '[20000]',
          MODBUS_PORTS: '[502]',
          FILE_DATA_PORTS: '[$HTTP_PORTS,110,143]',
          FTP_PORTS: '[21]',
          GENEVE_PORTS: '[6081]',
          VXLAN_PORTS: '[4789]',
          TEREDO_PORTS: '[3544]'
        }
      },
      'default-log-dir': this.config.logPath,
      stats: {
        enabled: true,
        interval: 8,
        'decoder-events': true,
        'decoder-events-prefix': 'decoder.event',
        'stream-events': false
      },
      outputs: [
        {
          'eve-log': {
            enabled: this.config.enableEveLog,
            filetype: 'regular',
            filename: 'eve.json',
            community_id: true,
            'community-id-seed': 0,
            types: [
              { alert: { 'tagged-packets': true } },
              { anomaly: { enabled: true } },
              { http: { enabled: this.config.enableHttpLog } },
              { dns: { enabled: this.config.enableDnsLog } },
              { tls: { enabled: this.config.enableTlsLog } },
              { files: { enabled: this.config.enableFileLog } },
              { smtp: { enabled: false } },
              { ssh: { enabled: false } },
              { stats: { enabled: this.config.enableStatsLog } },
              { flow: { enabled: true } }
            ]
          }
        },
        {
          'fast': {
            enabled: this.config.enableFastLog,
            filename: 'fast.log',
            append: true
          }
        }
      ],
      logging: {
        'default-log-level': 'notice',
        'default-log-format': '%t - <%d> -- %m',
        outputs: [
          {
            console: {
              enabled: true,
              level: 'info'
            }
          },
          {
            file: {
              enabled: true,
              level: 'info',
              filename: 'suricata.log',
              append: true
            }
          }
        ]
      },
      'af-packet': this.config.interfaces.map(iface => ({
        interface: iface,
        'cluster-id': 99,
        'cluster-type': 'cluster_flow',
        'defrag': true,
        'use-mmap': true,
        'tpacket-v3': true,
        'ring-size': 200000,
        'block-size': 32768,
        'block-timeout': 10,
        'use-emergency-flush': true
      })),
      'app-layer': {
        protocols: {
          http: {
            enabled: true,
            'libhtp': {
              'default-config': {
                'personality': 'IDS',
                'request-body-limit': 100000,
                'response-body-limit': 100000,
                'request-body-minimal-inspect-size': 32768,
                'request-body-inspect-window': 4096,
                'response-body-minimal-inspect-size': 40000,
                'response-body-inspect-window': 16384,
                'response-body-decompress-layer-limit': 2,
                'request-body-decompress-layer-limit': 2,
                'meta-field-limit': 18432
              }
            }
          },
          tls: {
            enabled: true,
            detection_ports: {
              dp: '443'
            },
            'ja3-fingerprints': true
          },
          dns: {
            enabled: true,
            'tcp': {
              enabled: true,
              detection_ports: {
                dp: '53'
              }
            },
            'udp': {
              enabled: true,
              detection_ports: {
                dp: '53'
              }
            }
          }
        }
      },
      'rule-files': [
        'suricata.rules',
        'custom.rules'
      ],
      'classification-file': '/etc/suricata/classification.config',
      'reference-config-file': '/etc/suricata/reference.config',
      'threshold-file': '/etc/suricata/threshold.config',
      engine: {
        'profile': 'custom'
      },
      threading: {
        'set-cpu-affinity': false,
        'cpu-affinity': [],
        'detect-thread-ratio': 1.0
      },
      'max-pending-packets': this.config.performanceTuning.maxPendingPackets,
      'default-packet-size': this.config.performanceTuning.maxPacketSize,
      'unix-command': {
        enabled: true,
        filename: this.config.socketPath || '/var/run/suricata/suricata-command.socket'
      }
    };

    const configYaml = yaml.dump(config, { 
      indent: 2,
      lineWidth: 120,
      quotingType: '"',
      forceQuotes: false
    });

    await fs.writeFile(this.config.configPath, configYaml);
    this.logger.info('Suricata configuration generated');
  }

  /**
   * Load Suricata rules
   */
  private async loadSuricataRules(): Promise<void> {
    try {
      // Load standard rules
      const rulesDir = this.config.rulesPath;
      const ruleFiles = await fs.readdir(rulesDir);
      
      for (const file of ruleFiles) {
        if (file.endsWith('.rules')) {
          const rulePath = path.join(rulesDir, file);
          const content = await fs.readFile(rulePath, 'utf-8');
          
          // Parse rules (simplified)
          const rules = this.parseRulesFile(content);
          rules.forEach(rule => {
            this.rules.set(rule.sid.toString(), rule);
          });
        }
      }

      this.logger.info(`Loaded ${this.rules.size} Suricata rules`);

    } catch (error) {
      this.logger.error('Error loading Suricata rules:', error);
    }
  }

  /**
   * Update custom rules
   */
  private async updateCustomRules(): Promise<void> {
    try {
      const customRulesPath = path.join(this.config.rulesPath, 'custom.rules');
      const customRules = Array.from(this.rules.values())
        .filter(rule => rule.custom)
        .concat(this.config.customRules);

      const rulesContent = customRules
        .map(rule => this.formatSuricataRule(rule))
        .join('\n') + '\n';

      await fs.writeFile(customRulesPath, rulesContent);
      this.logger.info(`Updated ${customRules.length} custom rules`);

    } catch (error) {
      this.logger.error('Error updating custom rules:', error);
    }
  }

  /**
   * Update threat intelligence feeds
   */
  private async updateThreatIntelFeeds(): Promise<void> {
    try {
      for (const feedUrl of this.config.threatIntelFeeds) {
        // Download and process threat intel feeds
        // Implementation would fetch from external sources
        this.logger.debug(`Processing threat intel feed: ${feedUrl}`);
      }

      this.logger.info('Threat intelligence feeds updated');

    } catch (error) {
      this.logger.error('Error updating threat intelligence feeds:', error);
    }
  }

  /**
   * Start Suricata process
   */
  private async startSuricataProcess(): Promise<void> {
    const args = [
      '-c', this.config.configPath,
      '-l', this.config.logPath,
      '--runmode', this.config.runMode
    ];

    // Add interfaces
    this.config.interfaces.forEach(iface => {
      args.push('-i', iface);
    });

    this.suricataProcess = spawn(this.config.suricataPath, args, {
      stdio: ['ignore', 'pipe', 'pipe']
    });

    this.suricataProcess.stdout?.on('data', (data) => {
      this.logger.debug(`Suricata stdout: ${data.toString().trim()}`);
    });

    this.suricataProcess.stderr?.on('data', (data) => {
      this.logger.warn(`Suricata stderr: ${data.toString().trim()}`);
    });

    this.suricataProcess.on('exit', (code, signal) => {
      this.logger.warn(`Suricata process exited with code ${code}, signal ${signal}`);
      this.isRunning = false;
      this.emit('processExit', code, signal);
    });

    this.suricataProcess.on('error', (error) => {
      this.logger.error('Suricata process error:', error);
      this.emit('processError', error);
    });

    // Wait for process to start
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Suricata start timeout'));
      }, 30000);

      const checkStart = () => {
        if (this.suricataProcess?.pid) {
          clearTimeout(timeout);
          resolve();
        } else {
          setTimeout(checkStart, 1000);
        }
      };

      checkStart();
    });

    this.logger.info(`Suricata process started with PID: ${this.suricataProcess.pid}`);
  }

  /**
   * Setup log monitoring
   */
  private async setupLogWatchers(): Promise<void> {
    const logFiles = [
      'eve.json',
      'fast.log',
      'suricata.log',
      'stats.log'
    ];

    for (const logFile of logFiles) {
      const logPath = path.join(this.config.logPath, logFile);
      
      try {
        const handle = await fs.open(logPath, 'r');
        this.logWatchers.set(logFile, handle);
        this.logger.debug(`Setup log watcher for: ${logFile}`);
      } catch (error) {
        this.logger.warn(`Failed to setup log watcher for ${logFile}:`, error);
      }
    }
  }

  /**
   * Start log monitoring
   */
  private async startLogMonitoring(): Promise<void> {
    // Monitor EVE JSON log for alerts
    const eveLogPath = path.join(this.config.logPath, 'eve.json');
    
    if (await this.fileExists(eveLogPath)) {
      this.monitorEveLog(eveLogPath);
    }

    // Monitor stats log for performance metrics
    const statsLogPath = path.join(this.config.logPath, 'stats.log');
    
    if (await this.fileExists(statsLogPath)) {
      this.monitorStatsLog(statsLogPath);
    }
  }

  /**
   * Monitor EVE JSON log for alerts
   */
  private monitorEveLog(logPath: string): void {
    const tail = spawn('tail', ['-f', logPath]);

    tail.stdout?.on('data', (data) => {
      const lines = data.toString().split('\n').filter(line => line.trim());
      
      for (const line of lines) {
        try {
          const event = JSON.parse(line);
          this.processEveLogEvent(event);
        } catch (error) {
          this.logger.debug('Invalid JSON in EVE log:', line);
        }
      }
    });

    tail.on('error', (error) => {
      this.logger.error('Error monitoring EVE log:', error);
    });
  }

  /**
   * Monitor stats log for performance metrics
   */
  private monitorStatsLog(logPath: string): void {
    // Implementation would parse Suricata stats and update metrics
    setInterval(() => {
      this.updatePerformanceMetrics();
    }, 10000); // Every 10 seconds
  }

  /**
   * Process EVE log event
   */
  private processEveLogEvent(event: any): void {
    try {
      if (event.event_type === 'alert') {
        const alert: SuricataAlert = {
          timestamp: new Date(event.timestamp),
          flowId: event.flow_id,
          alertId: event.alert?.id,
          signature: event.alert?.signature,
          category: event.alert?.category,
          severity: event.alert?.severity,
          sourceIp: event.src_ip,
          sourcePort: event.src_port,
          destIp: event.dest_ip,
          destPort: event.dest_port,
          protocol: event.proto,
          payload: event.payload,
          http: event.http,
          tls: event.tls,
          dns: event.dns
        };

        this.alertQueue.push(alert);
        this.stats.alertsGenerated++;
        this.performanceMetrics.alertsGenerated++;

        // Convert to SecurityEvent
        const securityEvent = this.convertSuricataAlertToSecurityEvent(alert);
        this.emit('securityEvent', securityEvent);
        this.emit('suricataAlert', alert);

        this.logger.info(`Suricata alert: ${alert.signature} from ${alert.sourceIp}:${alert.sourcePort}`);
      }

    } catch (error) {
      this.logger.error('Error processing EVE log event:', error);
    }
  }

  /**
   * Convert Suricata alert to SecurityEvent
   */
  private convertSuricataAlertToSecurityEvent(alert: SuricataAlert): SecurityEvent {
    const severity = this.mapSuricataSeverity(alert.severity);
    
    return {
      id: `suricata-alert-${alert.flowId}-${alert.alertId}`,
      timestamp: alert.timestamp,
      type: this.mapSuricataCategory(alert.category) as SecurityEventType,
      severity,
      source: {
        ip: alert.sourceIp,
        port: alert.sourcePort
      },
      target: {
        ip: alert.destIp,
        port: alert.destPort
      },
      details: {
        protocol: alert.protocol,
        signature: alert.signature,
        category: alert.category,
        payload: alert.payload,
        http: alert.http,
        tls: alert.tls,
        dns: alert.dns,
        suricataFlowId: alert.flowId
      },
      riskScore: this.calculateRiskScore(severity, alert.category),
      confidence: 0.9
    };
  }

  /**
   * Map Suricata severity to SecuritySeverity
   */
  private mapSuricataSeverity(severity?: number): SecuritySeverity {
    if (!severity) return SecuritySeverity.LOW;
    
    if (severity <= 1) return SecuritySeverity.CRITICAL;
    if (severity <= 2) return SecuritySeverity.HIGH;
    if (severity <= 3) return SecuritySeverity.MEDIUM;
    return SecuritySeverity.LOW;
  }

  /**
   * Map Suricata category to SecurityEventType
   */
  private mapSuricataCategory(category?: string): string {
    const categoryMap: { [key: string]: string } = {
      'Attempted Information Leak': SecurityEventType.DATA_EXFILTRATION,
      'Attempted Denial of Service': SecurityEventType.DOS_ATTACK,
      'Attempted User Privilege Gain': SecurityEventType.PRIVILEGE_ESCALATION,
      'Inappropriate Content was Detected': SecurityEventType.POLICY_VIOLATION,
      'Policy Violation': SecurityEventType.POLICY_VIOLATION,
      'Shellcode was detected': SecurityEventType.MALWARE_DETECTED,
      'A suspicious string was detected': SecurityEventType.SUSPICIOUS_ACTIVITY,
      'A suspicious filename was detected': SecurityEventType.SUSPICIOUS_ACTIVITY,
      'An attempted login using a suspicious username was detected': SecurityEventType.SUSPICIOUS_LOGIN,
      'A system call was detected': SecurityEventType.SYSTEM_CALL,
      'A Network Trojan was detected': SecurityEventType.MALWARE_DETECTED,
      'A client was using an unusual port': SecurityEventType.UNUSUAL_PORT_USAGE,
      'Detection of a Network Scan': SecurityEventType.NETWORK_SCAN,
      'Detection of a Denial of Service Attack': SecurityEventType.DOS_ATTACK,
      'Detection of a non-standard protocol or event': SecurityEventType.PROTOCOL_ANOMALY,
      'Generic Protocol Command Decode': SecurityEventType.PROTOCOL_DECODE,
      'access to a potentially vulnerable web application': SecurityEventType.WEB_APPLICATION_ATTACK,
      'Web Application Attack': SecurityEventType.WEB_APPLICATION_ATTACK,
      'Misc activity': SecurityEventType.MISC_ACTIVITY,
      'Misc Attack': SecurityEventType.MISC_ATTACK,
      'Generic ICMP event': SecurityEventType.ICMP_EVENT,
      'Inappropriate Content was Detected': SecurityEventType.CONTENT_VIOLATION,
      'Potentially Bad Traffic': SecurityEventType.SUSPICIOUS_TRAFFIC,
      'Attempted Administrator Privilege Gain': SecurityEventType.PRIVILEGE_ESCALATION,
      'Successful Administrator Privilege Gain': SecurityEventType.PRIVILEGE_ESCALATION,
      'Decode of an RPC Query': SecurityEventType.RPC_QUERY,
      'Executable code was detected': SecurityEventType.CODE_EXECUTION,
      'A suspicious string was detected': SecurityEventType.STRING_DETECTION,
      'Unknown Traffic': SecurityEventType.UNKNOWN_TRAFFIC,
      'TCP connection detected': SecurityEventType.TCP_CONNECTION,
      'A Network Trojan was detected': SecurityEventType.TROJAN_ACTIVITY,
      'A virus was detected': SecurityEventType.VIRUS_DETECTED,
      'WORM activity detected': SecurityEventType.WORM_ACTIVITY
    };

    return categoryMap[category || ''] || SecurityEventType.UNKNOWN;
  }

  /**
   * Calculate risk score based on severity and category
   */
  private calculateRiskScore(severity: SecuritySeverity, category?: string): number {
    let baseScore = 0;

    switch (severity) {
      case SecuritySeverity.CRITICAL:
        baseScore = 90;
        break;
      case SecuritySeverity.HIGH:
        baseScore = 70;
        break;
      case SecuritySeverity.MEDIUM:
        baseScore = 50;
        break;
      case SecuritySeverity.LOW:
        baseScore = 20;
        break;
    }

    // Adjust based on category
    const highRiskCategories = [
      'Attempted Administrator Privilege Gain',
      'Successful Administrator Privilege Gain',
      'A Network Trojan was detected',
      'Shellcode was detected',
      'Executable code was detected'
    ];

    if (category && highRiskCategories.includes(category)) {
      baseScore += 10;
    }

    return Math.min(100, baseScore);
  }

  /**
   * Parse Suricata rules file
   */
  private parseRulesFile(content: string): SuricataRule[] {
    const rules: SuricataRule[] = [];
    const lines = content.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const rule = this.parseSuricataRule(trimmed);
        if (rule) {
          rules.push(rule);
        }
      }
    }

    return rules;
  }

  /**
   * Parse individual Suricata rule
   */
  private parseSuricataRule(ruleString: string): SuricataRule | null {
    try {
      // Simplified rule parsing
      const match = ruleString.match(/^(alert|drop|reject|pass)\s+(\w+)\s+(.+?)\s+(.+?)\s+(.+?)\s+(.+?)\s+\((.+)\)$/);
      
      if (!match) return null;

      const [, action, protocol, srcAddr, srcPort, destAddr, destPort, options] = match;
      
      // Parse options
      const optionsMap = new Map<string, string>();
      const optionMatches = options.matchAll(/(\w+):\s*([^;]+);/g);
      
      for (const optMatch of optionMatches) {
        optionsMap.set(optMatch[1], optMatch[2].replace(/"/g, ''));
      }

      return {
        sid: parseInt(optionsMap.get('sid') || '0'),
        gid: parseInt(optionsMap.get('gid') || '1'),
        rev: parseInt(optionsMap.get('rev') || '1'),
        msg: optionsMap.get('msg') || '',
        action,
        protocol,
        sourceAddress: srcAddr,
        sourcePort: srcPort,
        destAddress: destAddr,
        destPort: destPort,
        options: optionsMap,
        enabled: true,
        custom: false
      };

    } catch (error) {
      this.logger.debug(`Failed to parse rule: ${ruleString}`, error);
      return null;
    }
  }

  /**
   * Format Suricata rule
   */
  private formatSuricataRule(rule: SuricataRule): string {
    const options = Array.from(rule.options.entries())
      .map(([key, value]) => `${key}:${value.includes(' ') ? `"${value}"` : value};`)
      .join(' ');

    return `${rule.action} ${rule.protocol} ${rule.sourceAddress} ${rule.sourcePort} -> ${rule.destAddress} ${rule.destPort} (${options})`;
  }

  /**
   * Setup WebSocket for real-time communication
   */
  private async setupWebSocket(): Promise<void> {
    // Implementation for WebSocket communication with Suricata
    this.logger.info('WebSocket communication setup (placeholder)');
  }

  /**
   * Start performance monitoring
   */
  private startPerformanceMonitoring(): void {
    setInterval(() => {
      this.updatePerformanceMetrics();
    }, 10000); // Every 10 seconds
  }

  /**
   * Update performance metrics
   */
  private updatePerformanceMetrics(): void {
    // Implementation would collect actual performance data from Suricata
    this.logger.debug('Performance metrics updated');
  }

  /**
   * Check if file exists
   */
  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Initialize stats
   */
  private initializeStats(): SuricataStats {
    return {
      uptime: 0,
      packetsReceived: 0,
      packetsDropped: 0,
      packetsInvalid: 0,
      alertsGenerated: 0,
      rulesLoaded: 0,
      activeFlows: 0,
      memoryUsage: 0,
      cpuUsage: 0,
      interfaceStats: new Map(),
      protocolStats: new Map(),
      appLayerStats: new Map()
    };
  }
}