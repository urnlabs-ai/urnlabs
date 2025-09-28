import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import { ScanConfig, ScanResult, Vulnerability } from '../types/scan-types.js';
import { logger } from '../utils/logger.js';
import axios from 'axios';

const execAsync = promisify(exec);

/**
 * Dynamic Application Security Testing (DAST) Scanner
 * Uses OWASP ZAP and custom crawling for runtime vulnerability detection
 */
export class DastScanner {
  private readonly zapApiKey: string;
  private readonly zapHost: string;
  private readonly zapPort: number;

  constructor() {
    this.zapApiKey = process.env.ZAP_API_KEY || 'changeme';
    this.zapHost = process.env.ZAP_HOST || 'localhost';
    this.zapPort = parseInt(process.env.ZAP_PORT || '8080');
  }

  /**
   * Perform dynamic security testing on running application
   */
  async scan(config: ScanConfig): Promise<ScanResult> {
    const startTime = new Date();
    const scanId = config.scanId || `dast-${Date.now()}`;

    if (!config.targetUrl) {
      throw new Error('Target URL is required for DAST scanning');
    }

    logger.info(`Starting DAST scan: ${scanId}`, {
      targetUrl: config.targetUrl
    });

    try {
      // Ensure ZAP is running
      await this.ensureZapRunning();

      // Start ZAP session
      const sessionId = await this.createZapSession(scanId);

      // Run vulnerability scans
      const [
        zapResults,
        customResults
      ] = await Promise.allSettled([
        this.runZapScan(config.targetUrl, sessionId),
        this.runCustomDastScan(config.targetUrl)
      ]);

      // Collect vulnerabilities
      const vulnerabilities: Vulnerability[] = [];

      if (zapResults.status === 'fulfilled') {
        vulnerabilities.push(...this.parseZapResults(zapResults.value));
      } else {
        logger.warn('ZAP scan failed', { error: zapResults.reason.message });
      }

      if (customResults.status === 'fulfilled') {
        vulnerabilities.push(...customResults.value);
      } else {
        logger.warn('Custom DAST scan failed', { error: customResults.reason.message });
      }

      // Filter by severity
      const filteredVulnerabilities = this.filterBySeverity(vulnerabilities, config.severity);

      const result: ScanResult = {
        scanId,
        scanType: 'dast',
        status: 'completed',
        startTime,
        endTime: new Date(),
        vulnerabilities: filteredVulnerabilities,
        summary: this.generateSummary(filteredVulnerabilities),
        metadata: {
          targetUrl: config.targetUrl,
          tool: 'owasp-zap',
          version: '2.14.0',
          rulesUsed: ['owasp-zap', 'custom-dast'],
          sessionId: sessionId
        },
        config
      };

      logger.info(`DAST scan completed: ${scanId}`, {
        vulnerabilities: result.vulnerabilities.length,
        critical: result.summary.critical,
        high: result.summary.high
      });

      return result;

    } catch (error) {
      logger.error(`DAST scan failed: ${scanId}`, { error: error.message });

      return {
        scanId,
        scanType: 'dast',
        status: 'failed',
        startTime,
        endTime: new Date(),
        vulnerabilities: [],
        summary: { total: 0, critical: 0, high: 0, medium: 0, low: 0, info: 0 },
        metadata: {
          targetUrl: config.targetUrl,
          error: error.message
        },
        config
      };
    }
  }

  /**
   * Ensure OWASP ZAP is running
   */
  private async ensureZapRunning(): Promise<void> {
    try {
      // Check if ZAP is already running
      await this.zapApiCall('core/version');
      logger.debug('ZAP is already running');
    } catch (error) {
      logger.info('Starting OWASP ZAP...');
      await this.startZap();

      // Wait for ZAP to be ready
      await this.waitForZap();
    }
  }

  /**
   * Start OWASP ZAP process
   */
  private async startZap(): Promise<void> {
    try {
      // Try to start ZAP in daemon mode
      const zapCommand = `zap.sh -daemon -host ${this.zapHost} -port ${this.zapPort} -config api.key=${this.zapApiKey}`;

      execAsync(zapCommand, { timeout: 30000 }).catch(() => {
        // ZAP process continues running in background
      });

      logger.info('ZAP startup initiated');
    } catch (error) {
      // Try Docker fallback
      await this.startZapDocker();
    }
  }

  /**
   * Start ZAP using Docker
   */
  private async startZapDocker(): Promise<void> {
    try {
      const dockerCommand = `docker run -d -p ${this.zapPort}:8080 -i owasp/zap2docker-stable zap.sh -daemon -host 0.0.0.0 -port 8080 -config api.key=${this.zapApiKey}`;

      await execAsync(dockerCommand, { timeout: 60000 });
      logger.info('ZAP started using Docker');
    } catch (error) {
      throw new Error(`Failed to start ZAP: ${error.message}`);
    }
  }

  /**
   * Wait for ZAP to be ready
   */
  private async waitForZap(): Promise<void> {
    const maxAttempts = 30;
    const delay = 2000;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        await this.zapApiCall('core/version');
        logger.info('ZAP is ready');
        return;
      } catch (error) {
        if (attempt === maxAttempts) {
          throw new Error('ZAP failed to start within timeout period');
        }
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  /**
   * Create new ZAP session
   */
  private async createZapSession(scanId: string): Promise<string> {
    const sessionName = `dast-session-${scanId}`;

    try {
      await this.zapApiCall('core/newSession', { name: sessionName });
      logger.debug(`Created ZAP session: ${sessionName}`);
      return sessionName;
    } catch (error) {
      logger.warn('Failed to create ZAP session, using default');
      return 'default';
    }
  }

  /**
   * Run comprehensive ZAP scan
   */
  private async runZapScan(targetUrl: string, sessionId: string): Promise<any> {
    try {
      // 1. Spider scan to discover URLs
      logger.info('Starting ZAP spider scan...');
      const spiderScanId = await this.startZapSpider(targetUrl);
      await this.waitForZapScan(spiderScanId, 'spider');

      // 2. Passive scan (automatic)
      logger.info('Starting ZAP passive scan...');
      await this.enablePassiveScanning();

      // 3. Active scan for vulnerabilities
      logger.info('Starting ZAP active scan...');
      const activeScanId = await this.startZapActiveScan(targetUrl);
      await this.waitForZapScan(activeScanId, 'ascan');

      // 4. Get scan results
      const alerts = await this.zapApiCall('core/alerts', { baseurl: targetUrl });

      return alerts;

    } catch (error) {
      logger.error('ZAP scan failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Start ZAP spider scan
   */
  private async startZapSpider(targetUrl: string): Promise<string> {
    const response = await this.zapApiCall('spider/scan', { url: targetUrl });
    return response.scan;
  }

  /**
   * Start ZAP active scan
   */
  private async startZapActiveScan(targetUrl: string): Promise<string> {
    const response = await this.zapApiCall('ascan/scan', { url: targetUrl });
    return response.scan;
  }

  /**
   * Enable passive scanning
   */
  private async enablePassiveScanning(): Promise<void> {
    await this.zapApiCall('pscan/setEnabled', { enabled: 'true' });
  }

  /**
   * Wait for ZAP scan to complete
   */
  private async waitForZapScan(scanId: string, scanType: 'spider' | 'ascan'): Promise<void> {
    const maxAttempts = 300; // 5 minutes max
    const delay = 1000;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const status = await this.zapApiCall(`${scanType}/status`, { scanId });
        const progress = parseInt(status.status);

        logger.debug(`${scanType} scan progress: ${progress}%`);

        if (progress >= 100) {
          logger.info(`${scanType} scan completed`);
          return;
        }

        await new Promise(resolve => setTimeout(resolve, delay));
      } catch (error) {
        logger.warn(`Failed to get ${scanType} scan status`, { error: error.message });
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    throw new Error(`${scanType} scan timeout`);
  }

  /**
   * Run custom DAST tests
   */
  private async runCustomDastScan(targetUrl: string): Promise<Vulnerability[]> {
    const vulnerabilities: Vulnerability[] = [];

    try {
      // Test for various security issues
      const tests = [
        this.testSecurityHeaders(targetUrl),
        this.testHttpsMisconfig(targetUrl),
        this.testCorsPolicy(targetUrl),
        this.testDirectoryTraversal(targetUrl),
        this.testSqlInjection(targetUrl),
        this.testXssVulnerability(targetUrl)
      ];

      const results = await Promise.allSettled(tests);

      results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          vulnerabilities.push(...result.value);
        } else {
          logger.debug(`Custom test ${index} failed`, { error: result.reason.message });
        }
      });

    } catch (error) {
      logger.error('Custom DAST scan failed', { error: error.message });
    }

    return vulnerabilities;
  }

  /**
   * Test security headers
   */
  private async testSecurityHeaders(targetUrl: string): Promise<Vulnerability[]> {
    const vulnerabilities: Vulnerability[] = [];

    try {
      const response = await axios.get(targetUrl, { timeout: 10000 });
      const headers = response.headers;

      const requiredHeaders = [
        'x-frame-options',
        'x-content-type-options',
        'x-xss-protection',
        'strict-transport-security',
        'content-security-policy'
      ];

      for (const header of requiredHeaders) {
        if (!headers[header]) {
          vulnerabilities.push({
            id: `custom-missing-header-${header}-${Date.now()}`,
            title: `Missing Security Header: ${header}`,
            description: `The ${header} header is missing, which could allow security attacks`,
            severity: this.getHeaderSeverity(header),
            cvss: this.getSeverityScore(this.getHeaderSeverity(header)),
            cwe: this.getHeaderCwe(header),
            evidence: `Missing header: ${header}`,
            remediation: `Add the ${header} header to all responses`,
            references: ['https://owasp.org/www-project-secure-headers/']
          });
        }
      }

    } catch (error) {
      logger.debug('Security headers test failed', { error: error.message });
    }

    return vulnerabilities;
  }

  /**
   * Test HTTPS misconfiguration
   */
  private async testHttpsMisconfig(targetUrl: string): Promise<Vulnerability[]> {
    const vulnerabilities: Vulnerability[] = [];

    if (targetUrl.startsWith('http://')) {
      vulnerabilities.push({
        id: `custom-http-insecure-${Date.now()}`,
        title: 'Insecure HTTP Connection',
        description: 'Application is accessible over unencrypted HTTP',
        severity: 'medium',
        cvss: 5.0,
        cwe: 'CWE-319',
        evidence: `Insecure URL: ${targetUrl}`,
        remediation: 'Configure HTTPS and redirect HTTP to HTTPS',
        references: ['https://owasp.org/www-community/controls/SecureTransportHTTPS']
      });
    }

    return vulnerabilities;
  }

  /**
   * Test CORS policy
   */
  private async testCorsPolicy(targetUrl: string): Promise<Vulnerability[]> {
    const vulnerabilities: Vulnerability[] = [];

    try {
      const response = await axios.options(targetUrl, {
        headers: {
          'Origin': 'https://evil.com',
          'Access-Control-Request-Method': 'GET'
        },
        timeout: 10000
      });

      const corsOrigin = response.headers['access-control-allow-origin'];

      if (corsOrigin === '*') {
        vulnerabilities.push({
          id: `custom-cors-wildcard-${Date.now()}`,
          title: 'Overly Permissive CORS Policy',
          description: 'CORS policy allows requests from any origin (*)',
          severity: 'medium',
          cvss: 5.0,
          cwe: 'CWE-346',
          evidence: `Access-Control-Allow-Origin: ${corsOrigin}`,
          remediation: 'Configure CORS to allow only trusted origins',
          references: ['https://owasp.org/www-community/attacks/CORS_OriginHeaderScrutiny']
        });
      }

    } catch (error) {
      logger.debug('CORS test failed', { error: error.message });
    }

    return vulnerabilities;
  }

  /**
   * Test directory traversal
   */
  private async testDirectoryTraversal(targetUrl: string): Promise<Vulnerability[]> {
    const vulnerabilities: Vulnerability[] = [];

    const payloads = [
      '../../../etc/passwd',
      '..\\..\\..\\windows\\system32\\drivers\\etc\\hosts',
      '....//....//....//etc/passwd'
    ];

    for (const payload of payloads) {
      try {
        const testUrl = `${targetUrl}?file=${encodeURIComponent(payload)}`;
        const response = await axios.get(testUrl, { timeout: 5000 });

        if (response.data.includes('root:') || response.data.includes('localhost')) {
          vulnerabilities.push({
            id: `custom-directory-traversal-${Date.now()}`,
            title: 'Directory Traversal Vulnerability',
            description: 'Application is vulnerable to directory traversal attacks',
            severity: 'high',
            cvss: 7.5,
            cwe: 'CWE-22',
            evidence: `Payload: ${payload}`,
            remediation: 'Validate and sanitize file path inputs',
            references: ['https://owasp.org/www-community/attacks/Path_Traversal']
          });
          break; // Found one, no need to test more
        }

      } catch (error) {
        // Expected for most cases
      }
    }

    return vulnerabilities;
  }

  /**
   * Test SQL injection
   */
  private async testSqlInjection(targetUrl: string): Promise<Vulnerability[]> {
    const vulnerabilities: Vulnerability[] = [];

    const payloads = [
      "' OR '1'='1",
      "' UNION SELECT NULL--",
      "'; DROP TABLE users; --"
    ];

    for (const payload of payloads) {
      try {
        const testUrl = `${targetUrl}?id=${encodeURIComponent(payload)}`;
        const response = await axios.get(testUrl, { timeout: 5000 });

        // Look for SQL error messages
        const sqlErrors = [
          'sql syntax',
          'mysql_fetch',
          'ora-00942',
          'microsoft jet database',
          'sqlite_master'
        ];

        if (sqlErrors.some(error => response.data.toLowerCase().includes(error))) {
          vulnerabilities.push({
            id: `custom-sql-injection-${Date.now()}`,
            title: 'SQL Injection Vulnerability',
            description: 'Application is vulnerable to SQL injection attacks',
            severity: 'critical',
            cvss: 9.0,
            cwe: 'CWE-89',
            evidence: `Payload: ${payload}`,
            remediation: 'Use parameterized queries and input validation',
            references: ['https://owasp.org/www-community/attacks/SQL_Injection']
          });
          break;
        }

      } catch (error) {
        // Expected for most cases
      }
    }

    return vulnerabilities;
  }

  /**
   * Test XSS vulnerability
   */
  private async testXssVulnerability(targetUrl: string): Promise<Vulnerability[]> {
    const vulnerabilities: Vulnerability[] = [];

    const payloads = [
      '<script>alert("XSS")</script>',
      '"><script>alert("XSS")</script>',
      'javascript:alert("XSS")'
    ];

    for (const payload of payloads) {
      try {
        const testUrl = `${targetUrl}?q=${encodeURIComponent(payload)}`;
        const response = await axios.get(testUrl, { timeout: 5000 });

        if (response.data.includes(payload)) {
          vulnerabilities.push({
            id: `custom-xss-reflected-${Date.now()}`,
            title: 'Reflected XSS Vulnerability',
            description: 'Application is vulnerable to reflected cross-site scripting',
            severity: 'high',
            cvss: 7.0,
            cwe: 'CWE-79',
            evidence: `Payload: ${payload}`,
            remediation: 'Implement proper input validation and output encoding',
            references: ['https://owasp.org/www-community/attacks/xss/']
          });
          break;
        }

      } catch (error) {
        // Expected for most cases
      }
    }

    return vulnerabilities;
  }

  /**
   * Make ZAP API call
   */
  private async zapApiCall(endpoint: string, params: Record<string, string> = {}): Promise<any> {
    const url = `http://${this.zapHost}:${this.zapPort}/JSON/${endpoint}/`;
    const searchParams = new URLSearchParams({
      apikey: this.zapApiKey,
      ...params
    });

    const response = await axios.get(`${url}?${searchParams}`, { timeout: 30000 });
    return response.data;
  }

  /**
   * Parse ZAP scan results
   */
  private parseZapResults(zapAlerts: any): Vulnerability[] {
    const vulnerabilities: Vulnerability[] = [];

    try {
      for (const alert of zapAlerts.alerts || []) {
        vulnerabilities.push({
          id: `zap-${alert.alertRef}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          title: alert.name,
          description: alert.description,
          severity: this.mapZapRisk(alert.risk),
          cvss: this.getSeverityScore(this.mapZapRisk(alert.risk)),
          cwe: alert.cweid ? `CWE-${alert.cweid}` : 'CWE-693',
          file: alert.url,
          evidence: alert.evidence || alert.attack,
          remediation: alert.solution,
          references: alert.reference ? alert.reference.split('\n') : []
        });
      }

    } catch (error) {
      logger.error('Failed to parse ZAP results', { error: error.message });
    }

    return vulnerabilities;
  }

  /**
   * Map ZAP risk levels to our severity levels
   */
  private mapZapRisk(risk: string): 'critical' | 'high' | 'medium' | 'low' | 'info' {
    const riskMap: Record<string, 'critical' | 'high' | 'medium' | 'low' | 'info'> = {
      'High': 'high',
      'Medium': 'medium',
      'Low': 'low',
      'Informational': 'info'
    };

    return riskMap[risk] || 'medium';
  }

  /**
   * Get header severity based on importance
   */
  private getHeaderSeverity(header: string): 'critical' | 'high' | 'medium' | 'low' | 'info' {
    const severityMap: Record<string, 'critical' | 'high' | 'medium' | 'low' | 'info'> = {
      'strict-transport-security': 'high',
      'content-security-policy': 'high',
      'x-frame-options': 'medium',
      'x-content-type-options': 'medium',
      'x-xss-protection': 'low'
    };

    return severityMap[header] || 'medium';
  }

  /**
   * Get CWE for missing headers
   */
  private getHeaderCwe(header: string): string {
    const cweMap: Record<string, string> = {
      'strict-transport-security': 'CWE-319',
      'content-security-policy': 'CWE-79',
      'x-frame-options': 'CWE-1021',
      'x-content-type-options': 'CWE-79',
      'x-xss-protection': 'CWE-79'
    };

    return cweMap[header] || 'CWE-693';
  }

  /**
   * Filter vulnerabilities by severity
   */
  private filterBySeverity(vulnerabilities: Vulnerability[], severityFilter?: string[]): Vulnerability[] {
    if (!severityFilter || severityFilter.length === 0) {
      return vulnerabilities;
    }

    return vulnerabilities.filter(vuln =>
      severityFilter.includes(vuln.severity)
    );
  }

  /**
   * Generate vulnerability summary
   */
  private generateSummary(vulnerabilities: Vulnerability[]) {
    const summary = { total: 0, critical: 0, high: 0, medium: 0, low: 0, info: 0 };

    vulnerabilities.forEach(vuln => {
      summary.total++;
      summary[vuln.severity as keyof typeof summary]++;
    });

    return summary;
  }

  /**
   * Get severity score for CVSS calculation
   */
  private getSeverityScore(severity: string): number {
    const scores = {
      critical: 9.5,
      high: 7.5,
      medium: 5.0,
      low: 2.5,
      info: 0.0
    };

    return scores[severity as keyof typeof scores] || 0.0;
  }
}

export default DastScanner;