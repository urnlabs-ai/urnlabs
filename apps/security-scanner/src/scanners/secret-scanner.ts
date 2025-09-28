import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import { ScanConfig, ScanResult, Vulnerability } from '../types/scan-types.js';
import { logger } from '../utils/logger.js';

const execAsync = promisify(exec);

/**
 * Secret Scanner using TruffleHog for detecting exposed secrets in code repositories
 */
export class SecretScanner {
  private readonly truffleHogVersion = '3.63.2';
  private readonly customRules: string;

  constructor() {
    this.customRules = this.getCustomRulesPath();
  }

  /**
   * Scan repository for exposed secrets and credentials
   */
  async scan(config: ScanConfig): Promise<ScanResult> {
    const startTime = new Date();
    const scanId = config.scanId || `secrets-${Date.now()}`;

    logger.info(`Starting secret scan: ${scanId}`, {
      repository: config.repository,
      includeHistory: config.includeHistory
    });

    try {
      // Ensure TruffleHog is installed
      await this.ensureTruffleHogInstalled();

      // Run TruffleHog scan
      const truffleResults = await this.runTruffleHogScan(config);

      // Run custom pattern scanning
      const customResults = await this.runCustomPatternScan(config);

      // Parse and merge results
      const vulnerabilities = [
        ...this.parseTruffleHogResults(truffleResults),
        ...customResults
      ];

      // Filter by severity
      const filteredVulnerabilities = this.filterBySeverity(vulnerabilities, config.severity);

      const result: ScanResult = {
        scanId,
        scanType: 'secrets',
        status: 'completed',
        startTime,
        endTime: new Date(),
        vulnerabilities: filteredVulnerabilities,
        summary: this.generateSummary(filteredVulnerabilities),
        metadata: {
          repository: config.repository,
          tool: 'trufflehog',
          version: this.truffleHogVersion,
          rulesUsed: ['default', 'custom'],
          filesScanned: await this.countSourceFiles(config.repository || '.')
        },
        config
      };

      logger.info(`Secret scan completed: ${scanId}`, {
        vulnerabilities: result.vulnerabilities.length,
        critical: result.summary.critical,
        high: result.summary.high
      });

      return result;

    } catch (error) {
      logger.error(`Secret scan failed: ${scanId}`, { error: error.message });

      return {
        scanId,
        scanType: 'secrets',
        status: 'failed',
        startTime,
        endTime: new Date(),
        vulnerabilities: [],
        summary: { total: 0, critical: 0, high: 0, medium: 0, low: 0, info: 0 },
        metadata: {
          repository: config.repository,
          error: error.message
        },
        config
      };
    }
  }

  /**
   * Ensure TruffleHog is installed and available
   */
  private async ensureTruffleHogInstalled(): Promise<void> {
    try {
      const { stdout } = await execAsync('trufflehog --version');
      logger.debug('TruffleHog version:', { version: stdout.trim() });
    } catch (error) {
      logger.warn('TruffleHog not found, installing...');
      await this.installTruffleHog();
    }
  }

  /**
   * Install TruffleHog if not available
   */
  private async installTruffleHog(): Promise<void> {
    try {
      // Try installing via Go
      await execAsync('go install github.com/trufflesecurity/trufflehog/v3@latest');
      logger.info('TruffleHog installed successfully via Go');
    } catch (error) {
      // Fallback to Docker-based scanning
      logger.warn('Failed to install TruffleHog, will use Docker fallback');
    }
  }

  /**
   * Run TruffleHog scan on the repository
   */
  private async runTruffleHogScan(config: ScanConfig): Promise<string> {
    const repository = config.repository || '.';
    const outputFile = path.join('/tmp', `trufflehog-${Date.now()}.json`);

    let command = `trufflehog filesystem ${repository} --json --no-update`;

    // Add additional options
    if (!config.includeHistory) {
      command += ' --no-verification';
    }

    if (config.excludePatterns?.length) {
      const excludeFile = await this.createExcludeFile(config.excludePatterns);
      command += ` --exclude-paths="${excludeFile}"`;
    }

    command += ` > ${outputFile}`;

    try {
      await execAsync(command, { timeout: 300000 }); // 5 minute timeout

      const results = await fs.readFile(outputFile, 'utf-8');
      await fs.unlink(outputFile).catch(() => {}); // Cleanup

      return results;
    } catch (error) {
      // TruffleHog returns non-zero exit code when secrets are found
      if (error.code === 183) {
        try {
          const results = await fs.readFile(outputFile, 'utf-8');
          await fs.unlink(outputFile).catch(() => {});
          return results;
        } catch (readError) {
          throw new Error(`Failed to read TruffleHog results: ${readError.message}`);
        }
      }

      // Try Docker fallback
      return this.runTruffleHogDockerScan(config);
    }
  }

  /**
   * Run TruffleHog scan using Docker (fallback)
   */
  private async runTruffleHogDockerScan(config: ScanConfig): Promise<string> {
    const repository = path.resolve(config.repository || '.');
    const outputFile = path.join('/tmp', `trufflehog-docker-${Date.now()}.json`);

    const command = `docker run --rm -v "${repository}:/repo" ` +
      `-v "/tmp:/tmp" trufflesecurity/trufflehog:latest ` +
      `filesystem /repo --json --no-update > ${outputFile}`;

    try {
      await execAsync(command, { timeout: 300000 });

      const results = await fs.readFile(outputFile, 'utf-8');
      await fs.unlink(outputFile).catch(() => {});

      return results;
    } catch (error) {
      logger.error('Docker TruffleHog scan failed', { error: error.message });
      return ''; // Return empty results rather than failing
    }
  }

  /**
   * Run custom pattern-based secret scanning
   */
  private async runCustomPatternScan(config: ScanConfig): Promise<Vulnerability[]> {
    const repository = config.repository || '.';
    const vulnerabilities: Vulnerability[] = [];

    try {
      const patterns = await this.getCustomSecretPatterns();
      const files = await this.getSourceFiles(repository);

      for (const file of files) {
        const content = await fs.readFile(file, 'utf-8');
        const fileVulns = await this.scanFileForPatterns(file, content, patterns);
        vulnerabilities.push(...fileVulns);
      }

      return vulnerabilities;
    } catch (error) {
      logger.error('Custom pattern scan failed', { error: error.message });
      return [];
    }
  }

  /**
   * Scan file content for custom secret patterns
   */
  private async scanFileForPatterns(
    filePath: string,
    content: string,
    patterns: Array<{ name: string; pattern: RegExp; severity: string; description: string }>
  ): Promise<Vulnerability[]> {
    const vulnerabilities: Vulnerability[] = [];

    for (const { name, pattern, severity, description } of patterns) {
      const matches = content.matchAll(pattern);

      for (const match of matches) {
        const lineNumber = content.substring(0, match.index!).split('\n').length;

        vulnerabilities.push({
          id: `custom-${name}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          title: `Potential ${name} Exposure`,
          description,
          severity: severity as any,
          cvss: this.getSeverityScore(severity),
          cwe: 'CWE-200', // Information Exposure
          file: filePath,
          line: lineNumber,
          column: match.index! - content.lastIndexOf('\n', match.index!),
          evidence: match[0],
          remediation: `Remove or secure the exposed ${name}`,
          references: [`https://owasp.org/www-project-top-ten/2017/A3_2017-Sensitive_Data_Exposure`]
        });
      }
    }

    return vulnerabilities;
  }

  /**
   * Get custom secret detection patterns
   */
  private async getCustomSecretPatterns(): Promise<Array<{
    name: string;
    pattern: RegExp;
    severity: string;
    description: string;
  }>> {
    return [
      {
        name: 'AWS Access Key',
        pattern: /AKIA[0-9A-Z]{16}/gi,
        severity: 'critical',
        description: 'AWS Access Key ID detected in source code'
      },
      {
        name: 'AWS Secret Key',
        pattern: /[0-9a-zA-Z/+]{40}/gi,
        severity: 'critical',
        description: 'Potential AWS Secret Access Key detected'
      },
      {
        name: 'API Key Pattern',
        pattern: /[a-zA-Z0-9]{32,}/gi,
        severity: 'high',
        description: 'Potential API key detected'
      },
      {
        name: 'Database Connection String',
        pattern: /(mongodb|mysql|postgresql|postgres):\/\/[^\s\'"]+/gi,
        severity: 'high',
        description: 'Database connection string with credentials detected'
      },
      {
        name: 'Private Key',
        pattern: /-----BEGIN [A-Z ]+PRIVATE KEY-----/gi,
        severity: 'critical',
        description: 'Private key detected in source code'
      },
      {
        name: 'JWT Token',
        pattern: /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/gi,
        severity: 'medium',
        description: 'JWT token detected in source code'
      },
      {
        name: 'Generic Password',
        pattern: /(password|pwd|pass)\s*[:=]\s*['""][^'""]{8,}['"]/gi,
        severity: 'medium',
        description: 'Hardcoded password detected'
      },
      {
        name: 'Slack Token',
        pattern: /xox[baprs]-[0-9]{12}-[0-9]{12}-[a-zA-Z0-9]{24}/gi,
        severity: 'high',
        description: 'Slack token detected in source code'
      },
      {
        name: 'GitHub Token',
        pattern: /gh[pousr]_[A-Za-z0-9_]{36,255}/gi,
        severity: 'high',
        description: 'GitHub token detected in source code'
      },
      {
        name: 'Discord Bot Token',
        pattern: /[MN][A-Za-z\\d]{23}\\.[\\w-]{6}\\.[\\w-]{27}/gi,
        severity: 'medium',
        description: 'Discord bot token detected in source code'
      }
    ];
  }

  /**
   * Parse TruffleHog JSON results
   */
  private parseTruffleHogResults(jsonResults: string): Vulnerability[] {
    const vulnerabilities: Vulnerability[] = [];

    if (!jsonResults.trim()) {
      return vulnerabilities;
    }

    try {
      const lines = jsonResults.split('\n').filter(line => line.trim());

      for (const line of lines) {
        try {
          const result = JSON.parse(line);

          if (result.DetectorName && result.Raw) {
            vulnerabilities.push({
              id: `trufflehog-${result.DetectorName}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              title: `${result.DetectorName} Secret Detected`,
              description: `TruffleHog detected a potential ${result.DetectorName} secret in the repository`,
              severity: this.mapTruffleHogSeverity(result.DetectorName, result.Verified),
              cvss: this.getSeverityScore(this.mapTruffleHogSeverity(result.DetectorName, result.Verified)),
              cwe: 'CWE-200',
              file: result.SourceMetadata?.Data?.Filesystem?.file || 'Unknown',
              line: result.SourceMetadata?.Data?.Filesystem?.line || 0,
              evidence: result.Raw,
              remediation: `Remove or secure the exposed ${result.DetectorName} secret`,
              references: [
                'https://owasp.org/www-project-top-ten/2017/A3_2017-Sensitive_Data_Exposure',
                'https://github.com/trufflesecurity/trufflehog'
              ]
            });
          }
        } catch (parseError) {
          logger.warn('Failed to parse TruffleHog result line', { line, error: parseError.message });
        }
      }
    } catch (error) {
      logger.error('Failed to parse TruffleHog results', { error: error.message });
    }

    return vulnerabilities;
  }

  /**
   * Map TruffleHog detector names to severity levels
   */
  private mapTruffleHogSeverity(detectorName: string, verified: boolean): string {
    const highRiskDetectors = [
      'aws', 'github', 'slack', 'stripe', 'twilio', 'mailgun',
      'sendgrid', 'heroku', 'dropbox', 'facebook', 'twitter'
    ];

    const criticalDetectors = [
      'privatekey', 'ssh', 'pgp', 'cert'
    ];

    const lowerName = detectorName.toLowerCase();

    if (criticalDetectors.some(detector => lowerName.includes(detector))) {
      return 'critical';
    }

    if (highRiskDetectors.some(detector => lowerName.includes(detector))) {
      return verified ? 'critical' : 'high';
    }

    return verified ? 'high' : 'medium';
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

  /**
   * Get source files for scanning
   */
  private async getSourceFiles(directory: string): Promise<string[]> {
    const files: string[] = [];
    const extensions = ['.js', '.ts', '.py', '.java', '.go', '.rb', '.php', '.cs', '.cpp', '.c', '.h'];

    async function scanDirectory(dir: string) {
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);

          if (entry.isDirectory()) {
            // Skip common non-source directories
            if (!['node_modules', '.git', 'vendor', 'target', 'build', 'dist'].includes(entry.name)) {
              await scanDirectory(fullPath);
            }
          } else if (entry.isFile()) {
            const ext = path.extname(entry.name);
            if (extensions.includes(ext) || ['.env', '.config', '.yaml', '.yml', '.json'].includes(ext)) {
              files.push(fullPath);
            }
          }
        }
      } catch (error) {
        logger.warn(`Failed to scan directory: ${dir}`, { error: error.message });
      }
    }

    await scanDirectory(directory);
    return files;
  }

  /**
   * Count source files for metadata
   */
  private async countSourceFiles(directory: string): Promise<number> {
    try {
      const files = await this.getSourceFiles(directory);
      return files.length;
    } catch (error) {
      return 0;
    }
  }

  /**
   * Create exclude file for TruffleHog
   */
  private async createExcludeFile(patterns: string[]): Promise<string> {
    const excludeFile = path.join('/tmp', `trufflehog-exclude-${Date.now()}.txt`);
    await fs.writeFile(excludeFile, patterns.join('\n'));
    return excludeFile;
  }

  /**
   * Get custom rules path
   */
  private getCustomRulesPath(): string {
    return path.join(process.cwd(), 'security-rules', 'custom-secret-rules.yaml');
  }
}

export default SecretScanner;