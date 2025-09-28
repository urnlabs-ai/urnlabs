import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import { ScanConfig, ScanResult, Vulnerability } from '../types/scan-types.js';
import { logger } from '../utils/logger.js';

const execAsync = promisify(exec);

/**
 * Static Application Security Testing (SAST) Scanner
 * Uses CodeQL, Semgrep, and ESLint for comprehensive static analysis
 */
export class SastScanner {
  private readonly codeqlPath: string;
  private readonly semgrepConfigPath: string;

  constructor() {
    this.codeqlPath = process.env.CODEQL_PATH || 'codeql';
    this.semgrepConfigPath = this.getCustomRulesPath();
  }

  /**
   * Perform static analysis on the codebase
   */
  async scan(config: ScanConfig): Promise<ScanResult> {
    const startTime = new Date();
    const scanId = config.scanId || `sast-${Date.now()}`;

    logger.info(`Starting SAST scan: ${scanId}`, {
      repository: config.repository
    });

    try {
      const repository = config.repository || '.';

      // Run multiple SAST tools in parallel
      const [
        codeqlResults,
        semgrepResults,
        eslintResults,
        customResults
      ] = await Promise.allSettled([
        this.runCodeQLScan(repository),
        this.runSemgrepScan(repository),
        this.runESLintScan(repository),
        this.runCustomRuleScan(repository)
      ]);

      // Collect vulnerabilities from all tools
      const vulnerabilities: Vulnerability[] = [];

      if (codeqlResults.status === 'fulfilled') {
        vulnerabilities.push(...this.parseCodeQLResults(codeqlResults.value));
      } else {
        logger.warn('CodeQL scan failed', { error: codeqlResults.reason.message });
      }

      if (semgrepResults.status === 'fulfilled') {
        vulnerabilities.push(...this.parseSemgrepResults(semgrepResults.value));
      } else {
        logger.warn('Semgrep scan failed', { error: semgrepResults.reason.message });
      }

      if (eslintResults.status === 'fulfilled') {
        vulnerabilities.push(...this.parseESLintResults(eslintResults.value));
      } else {
        logger.warn('ESLint scan failed', { error: eslintResults.reason.message });
      }

      if (customResults.status === 'fulfilled') {
        vulnerabilities.push(...customResults.value);
      } else {
        logger.warn('Custom rule scan failed', { error: customResults.reason.message });
      }

      // Remove duplicates and filter by severity
      const uniqueVulnerabilities = this.removeDuplicates(vulnerabilities);
      const filteredVulnerabilities = this.filterBySeverity(uniqueVulnerabilities, config.severity);

      const result: ScanResult = {
        scanId,
        scanType: 'sast',
        status: 'completed',
        startTime,
        endTime: new Date(),
        vulnerabilities: filteredVulnerabilities,
        summary: this.generateSummary(filteredVulnerabilities),
        metadata: {
          repository: config.repository,
          tool: 'multi-sast',
          version: '1.0.0',
          rulesUsed: ['codeql', 'semgrep', 'eslint', 'custom'],
          filesScanned: await this.countSourceFiles(repository)
        },
        config
      };

      logger.info(`SAST scan completed: ${scanId}`, {
        vulnerabilities: result.vulnerabilities.length,
        critical: result.summary.critical,
        high: result.summary.high
      });

      return result;

    } catch (error) {
      logger.error(`SAST scan failed: ${scanId}`, { error: error.message });

      return {
        scanId,
        scanType: 'sast',
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
   * Run CodeQL static analysis
   */
  private async runCodeQLScan(repository: string): Promise<string> {
    // Create CodeQL database
    const dbPath = path.join('/tmp', `codeql-db-${Date.now()}`);
    const resultsPath = path.join('/tmp', `codeql-results-${Date.now()}.sarif`);

    try {
      // Detect language
      const language = await this.detectPrimaryLanguage(repository);

      // Create database
      await execAsync(`${this.codeqlPath} database create ${dbPath} --language=${language} --source-root=${repository}`, {
        timeout: 600000 // 10 minute timeout
      });

      // Run analysis
      const queryPack = this.getCodeQLQueryPack(language);
      await execAsync(`${this.codeqlPath} database analyze ${dbPath} ${queryPack} --format=sarif-latest --output=${resultsPath}`, {
        timeout: 600000
      });

      // Read results
      const results = await fs.readFile(resultsPath, 'utf-8');

      // Cleanup
      await fs.rm(dbPath, { recursive: true, force: true }).catch(() => {});
      await fs.unlink(resultsPath).catch(() => {});

      return results;

    } catch (error) {
      // Cleanup on error
      await fs.rm(dbPath, { recursive: true, force: true }).catch(() => {});
      throw error;
    }
  }

  /**
   * Run Semgrep static analysis
   */
  private async runSemgrepScan(repository: string): Promise<string> {
    const outputFile = path.join('/tmp', `semgrep-results-${Date.now()}.json`);

    try {
      // Run semgrep with multiple rulesets
      const command = `semgrep --config=auto --config=p/security-audit --config=p/secrets --json --output=${outputFile} ${repository}`;

      await execAsync(command, { timeout: 300000 }); // 5 minute timeout

      const results = await fs.readFile(outputFile, 'utf-8');
      await fs.unlink(outputFile).catch(() => {});

      return results;

    } catch (error) {
      // Semgrep returns non-zero exit code when findings are detected
      if (error.code === 1) {
        try {
          const results = await fs.readFile(outputFile, 'utf-8');
          await fs.unlink(outputFile).catch(() => {});
          return results;
        } catch (readError) {
          throw new Error(`Failed to read Semgrep results: ${readError.message}`);
        }
      }
      throw error;
    }
  }

  /**
   * Run ESLint security analysis
   */
  private async runESLintScan(repository: string): Promise<string> {
    const outputFile = path.join('/tmp', `eslint-results-${Date.now()}.json`);

    try {
      // Run ESLint with security plugins
      const command = `npx eslint ${repository} --ext .js,.jsx,.ts,.tsx --config ${this.getESLintConfig()} --format json --output-file ${outputFile}`;

      await execAsync(command, { timeout: 300000 });

      const results = await fs.readFile(outputFile, 'utf-8');
      await fs.unlink(outputFile).catch(() => {});

      return results;

    } catch (error) {
      // ESLint returns non-zero exit code when issues are found
      if (error.code === 1 || error.code === 2) {
        try {
          const results = await fs.readFile(outputFile, 'utf-8');
          await fs.unlink(outputFile).catch(() => {});
          return results;
        } catch (readError) {
          // If no config file, return empty results
          return '[]';
        }
      }
      throw error;
    }
  }

  /**
   * Run custom security rule scan
   */
  private async runCustomRuleScan(repository: string): Promise<Vulnerability[]> {
    const vulnerabilities: Vulnerability[] = [];

    try {
      const customRules = await this.getCustomSecurityRules();
      const sourceFiles = await this.getSourceFiles(repository);

      for (const file of sourceFiles) {
        try {
          const content = await fs.readFile(file, 'utf-8');
          const fileVulns = await this.scanFileWithCustomRules(file, content, customRules);
          vulnerabilities.push(...fileVulns);
        } catch (error) {
          logger.debug(`Failed to scan file: ${file}`, { error: error.message });
        }
      }

    } catch (error) {
      logger.error('Custom rule scan failed', { error: error.message });
    }

    return vulnerabilities;
  }

  /**
   * Parse CodeQL SARIF results
   */
  private parseCodeQLResults(sarifResults: string): Vulnerability[] {
    const vulnerabilities: Vulnerability[] = [];

    try {
      const sarif = JSON.parse(sarifResults);

      if (sarif.runs && sarif.runs.length > 0) {
        const run = sarif.runs[0];

        for (const result of run.results || []) {
          const rule = run.tool.driver.rules.find(r => r.id === result.ruleId);
          const location = result.locations?.[0]?.physicalLocation;

          vulnerabilities.push({
            id: `codeql-${result.ruleId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            title: rule?.shortDescription?.text || result.message.text,
            description: rule?.fullDescription?.text || result.message.text,
            severity: this.mapCodeQLSeverity(result.level),
            cvss: this.getSeverityScore(this.mapCodeQLSeverity(result.level)),
            cwe: rule?.properties?.['security-severity'] || 'CWE-693',
            file: location?.artifactLocation?.uri,
            line: location?.region?.startLine,
            column: location?.region?.startColumn,
            evidence: result.message.text,
            remediation: rule?.help?.text || 'Review the identified security issue',
            references: rule?.helpUri ? [rule.helpUri] : []
          });
        }
      }

    } catch (error) {
      logger.error('Failed to parse CodeQL results', { error: error.message });
    }

    return vulnerabilities;
  }

  /**
   * Parse Semgrep JSON results
   */
  private parseSemgrepResults(semgrepResults: string): Vulnerability[] {
    const vulnerabilities: Vulnerability[] = [];

    try {
      const results = JSON.parse(semgrepResults);

      for (const result of results.results || []) {
        vulnerabilities.push({
          id: `semgrep-${result.check_id}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          title: result.check_id.replace(/\./g, ' ').replace(/-/g, ' '),
          description: result.extra.message,
          severity: this.mapSemgrepSeverity(result.extra.severity),
          cvss: this.getSeverityScore(this.mapSemgrepSeverity(result.extra.severity)),
          cwe: result.extra.metadata?.cwe || 'CWE-693',
          file: result.path,
          line: result.start.line,
          column: result.start.col,
          evidence: result.extra.lines,
          remediation: result.extra.metadata?.references || 'Review and fix the security issue',
          references: result.extra.metadata?.references ? [result.extra.metadata.references] : []
        });
      }

    } catch (error) {
      logger.error('Failed to parse Semgrep results', { error: error.message });
    }

    return vulnerabilities;
  }

  /**
   * Parse ESLint JSON results
   */
  private parseESLintResults(eslintResults: string): Vulnerability[] {
    const vulnerabilities: Vulnerability[] = [];

    try {
      const results = JSON.parse(eslintResults);

      for (const fileResult of results) {
        for (const message of fileResult.messages) {
          // Only include security-related rules
          if (this.isSecurityRule(message.ruleId)) {
            vulnerabilities.push({
              id: `eslint-${message.ruleId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              title: `ESLint Security: ${message.ruleId}`,
              description: message.message,
              severity: this.mapESLintSeverity(message.severity),
              cvss: this.getSeverityScore(this.mapESLintSeverity(message.severity)),
              cwe: 'CWE-693',
              file: fileResult.filePath,
              line: message.line,
              column: message.column,
              evidence: message.source,
              remediation: `Fix ESLint rule violation: ${message.ruleId}`,
              references: [`https://eslint.org/docs/rules/${message.ruleId}`]
            });
          }
        }
      }

    } catch (error) {
      logger.error('Failed to parse ESLint results', { error: error.message });
    }

    return vulnerabilities;
  }

  /**
   * Scan file with custom security rules
   */
  private async scanFileWithCustomRules(
    filePath: string,
    content: string,
    rules: Array<{ name: string; pattern: RegExp; severity: string; description: string; cwe: string }>
  ): Promise<Vulnerability[]> {
    const vulnerabilities: Vulnerability[] = [];

    for (const rule of rules) {
      const matches = content.matchAll(rule.pattern);

      for (const match of matches) {
        const lineNumber = content.substring(0, match.index!).split('\n').length;

        vulnerabilities.push({
          id: `custom-${rule.name}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          title: `Security Issue: ${rule.name}`,
          description: rule.description,
          severity: rule.severity as any,
          cvss: this.getSeverityScore(rule.severity),
          cwe: rule.cwe,
          file: filePath,
          line: lineNumber,
          column: match.index! - content.lastIndexOf('\n', match.index!),
          evidence: match[0],
          remediation: `Review and fix: ${rule.description}`,
          references: ['https://owasp.org/www-project-top-ten/']
        });
      }
    }

    return vulnerabilities;
  }

  /**
   * Get custom security rules
   */
  private async getCustomSecurityRules(): Promise<Array<{
    name: string;
    pattern: RegExp;
    severity: string;
    description: string;
    cwe: string;
  }>> {
    return [
      {
        name: 'SQL Injection',
        pattern: /(?:query|execute|exec)\s*\(\s*["`'].*\$\{.*\}.*["`']\s*\)/gi,
        severity: 'high',
        description: 'Potential SQL injection vulnerability detected',
        cwe: 'CWE-89'
      },
      {
        name: 'XSS Vulnerability',
        pattern: /innerHTML\s*=\s*.*\+/gi,
        severity: 'medium',
        description: 'Potential XSS vulnerability in innerHTML assignment',
        cwe: 'CWE-79'
      },
      {
        name: 'Command Injection',
        pattern: /exec\s*\(\s*["`'].*\$\{.*\}.*["`']\s*\)/gi,
        severity: 'critical',
        description: 'Potential command injection vulnerability',
        cwe: 'CWE-78'
      },
      {
        name: 'Insecure Random',
        pattern: /Math\.random\(\)/gi,
        severity: 'low',
        description: 'Use of cryptographically weak random number generator',
        cwe: 'CWE-338'
      },
      {
        name: 'Eval Usage',
        pattern: /\beval\s*\(/gi,
        severity: 'high',
        description: 'Use of eval() function poses security risk',
        cwe: 'CWE-95'
      },
      {
        name: 'Insecure HTTP',
        pattern: /http:\/\/[^\/\s]+/gi,
        severity: 'medium',
        description: 'Insecure HTTP URL detected, use HTTPS instead',
        cwe: 'CWE-319'
      }
    ];
  }

  /**
   * Detect primary programming language
   */
  private async detectPrimaryLanguage(repository: string): Promise<string> {
    try {
      const files = await this.getSourceFiles(repository);
      const extensions = files.map(file => path.extname(file).toLowerCase());

      const counts: Record<string, number> = {};
      extensions.forEach(ext => {
        counts[ext] = (counts[ext] || 0) + 1;
      });

      const mostCommon = Object.entries(counts)
        .sort(([,a], [,b]) => b - a)[0]?.[0];

      const languageMap: Record<string, string> = {
        '.js': 'javascript',
        '.jsx': 'javascript',
        '.ts': 'typescript',
        '.tsx': 'typescript',
        '.py': 'python',
        '.java': 'java',
        '.go': 'go',
        '.cs': 'csharp',
        '.cpp': 'cpp',
        '.c': 'cpp'
      };

      return languageMap[mostCommon] || 'javascript';

    } catch (error) {
      return 'javascript'; // Default fallback
    }
  }

  /**
   * Get CodeQL query pack based on language
   */
  private getCodeQLQueryPack(language: string): string {
    const queryPacks: Record<string, string> = {
      'javascript': 'javascript-security-and-quality',
      'typescript': 'javascript-security-and-quality',
      'python': 'python-security-and-quality',
      'java': 'java-security-and-quality',
      'go': 'go-security-and-quality',
      'csharp': 'csharp-security-and-quality',
      'cpp': 'cpp-security-and-quality'
    };

    return queryPacks[language] || 'javascript-security-and-quality';
  }

  /**
   * Get ESLint configuration for security scanning
   */
  private getESLintConfig(): string {
    // Return path to security-focused ESLint config
    return path.join(process.cwd(), 'security-rules', 'eslint-security.json');
  }

  /**
   * Check if ESLint rule is security-related
   */
  private isSecurityRule(ruleId: string): boolean {
    const securityRules = [
      'no-eval',
      'no-implied-eval',
      'no-new-func',
      'no-script-url',
      'security/detect-eval-with-expression',
      'security/detect-non-literal-fs-filename',
      'security/detect-non-literal-regexp',
      'security/detect-non-literal-require',
      'security/detect-object-injection',
      'security/detect-possible-timing-attacks',
      'security/detect-pseudoRandomBytes',
      'security/detect-unsafe-regex'
    ];

    return securityRules.some(rule => ruleId?.includes(rule));
  }

  /**
   * Map CodeQL severity levels
   */
  private mapCodeQLSeverity(level: string): 'critical' | 'high' | 'medium' | 'low' | 'info' {
    const severityMap: Record<string, 'critical' | 'high' | 'medium' | 'low' | 'info'> = {
      'error': 'high',
      'warning': 'medium',
      'note': 'low',
      'info': 'info'
    };

    return severityMap[level?.toLowerCase()] || 'medium';
  }

  /**
   * Map Semgrep severity levels
   */
  private mapSemgrepSeverity(severity: string): 'critical' | 'high' | 'medium' | 'low' | 'info' {
    const severityMap: Record<string, 'critical' | 'high' | 'medium' | 'low' | 'info'> = {
      'ERROR': 'high',
      'WARNING': 'medium',
      'INFO': 'low'
    };

    return severityMap[severity?.toUpperCase()] || 'medium';
  }

  /**
   * Map ESLint severity levels
   */
  private mapESLintSeverity(severity: number): 'critical' | 'high' | 'medium' | 'low' | 'info' {
    if (severity === 2) return 'medium';
    if (severity === 1) return 'low';
    return 'info';
  }

  /**
   * Remove duplicate vulnerabilities
   */
  private removeDuplicates(vulnerabilities: Vulnerability[]): Vulnerability[] {
    const seen = new Set<string>();
    return vulnerabilities.filter(vuln => {
      const key = `${vuln.file}:${vuln.line}:${vuln.title}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
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
    const extensions = ['.js', '.jsx', '.ts', '.tsx', '.py', '.java', '.go', '.cs', '.cpp', '.c', '.h', '.php', '.rb'];

    async function scanDirectory(dir: string) {
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);

          if (entry.isDirectory()) {
            // Skip common non-source directories
            if (!['node_modules', '.git', 'vendor', 'target', 'build', 'dist', '.next', '__pycache__'].includes(entry.name)) {
              await scanDirectory(fullPath);
            }
          } else if (entry.isFile()) {
            const ext = path.extname(entry.name);
            if (extensions.includes(ext)) {
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
   * Get custom rules path
   */
  private getCustomRulesPath(): string {
    return path.join(process.cwd(), 'security-rules', 'custom-sast-rules.yaml');
  }
}

export default SastScanner;