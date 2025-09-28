import { promises as fs } from 'fs';
import * as path from 'path';
import { createLogger } from './logger';
import { EventEmitter } from 'events';

const logger = createLogger('SecretsScanner');

export interface SecretPattern {
  name: string;
  pattern: RegExp;
  severity: 'high' | 'medium' | 'low';
  description: string;
}

export interface ScanResult {
  file: string;
  line: number;
  column: number;
  pattern: string;
  match: string;
  severity: 'high' | 'medium' | 'low';
  description: string;
}

export interface ScanOptions {
  rootPath: string;
  excludePatterns?: string[];
  includePatterns?: string[];
  customPatterns?: SecretPattern[];
  maxFileSize?: number;
  followSymlinks?: boolean;
}

export class SecretsScanner extends EventEmitter {
  private patterns: SecretPattern[];
  private options: ScanOptions;

  constructor(options: ScanOptions) {
    super();
    this.options = {
      maxFileSize: 10 * 1024 * 1024, // 10MB
      followSymlinks: false,
      excludePatterns: [
        '**/node_modules/**',
        '**/dist/**',
        '**/build/**',
        '**/.git/**',
        '**/coverage/**',
        '**/*.min.js',
        '**/*.map',
        '**/vault-init.json',
        '**/approle-credentials.json',
      ],
      ...options,
    };

    this.patterns = [
      ...this.getDefaultPatterns(),
      ...(options.customPatterns || []),
    ];
  }

  /**
   * Get default secret patterns
   */
  private getDefaultPatterns(): SecretPattern[] {
    return [
      {
        name: 'AWS Access Key',
        pattern: /AKIA[0-9A-Z]{16}/gi,
        severity: 'high',
        description: 'AWS Access Key ID detected'
      },
      {
        name: 'AWS Secret Key',
        pattern: /[0-9a-zA-Z/+]{40}/g,
        severity: 'high',
        description: 'Potential AWS Secret Access Key detected'
      },
      {
        name: 'GitHub Token',
        pattern: /gh[pousr]_[A-Za-z0-9_]{36,255}/gi,
        severity: 'high',
        description: 'GitHub Personal Access Token detected'
      },
      {
        name: 'Slack Token',
        pattern: /xox[baprs]-([0-9a-zA-Z]{10,48})/gi,
        severity: 'high',
        description: 'Slack API Token detected'
      },
      {
        name: 'JWT Token',
        pattern: /eyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]*\.[A-Za-z0-9_-]*/gi,
        severity: 'medium',
        description: 'JWT Token detected'
      },
      {
        name: 'Database URL',
        pattern: /(postgres|mysql|mongodb):\/\/[^\s'"]+/gi,
        severity: 'high',
        description: 'Database connection string detected'
      },
      {
        name: 'Private Key',
        pattern: /-----BEGIN [A-Z ]+PRIVATE KEY-----/gi,
        severity: 'high',
        description: 'Private key detected'
      },
      {
        name: 'API Key Pattern',
        pattern: /['"](api[_-]?key|secret)['"]\s*[:=]\s*['"]([a-zA-Z0-9_-]{20,})['"]/gi,
        severity: 'medium',
        description: 'Generic API key pattern detected'
      },
      {
        name: 'Password Pattern',
        pattern: /['"](password|pwd|pass)['"]\s*[:=]\s*['"]([^'"]{8,})['"]/gi,
        severity: 'medium',
        description: 'Password detected'
      },
      {
        name: 'Claude API Key',
        pattern: /sk-ant-api03-[a-zA-Z0-9_-]{95}/gi,
        severity: 'high',
        description: 'Claude API key detected'
      },
      {
        name: 'OpenAI API Key',
        pattern: /sk-[a-zA-Z0-9]{48}/gi,
        severity: 'high',
        description: 'OpenAI API key detected'
      },
      {
        name: 'Generic Secret',
        pattern: /['"](secret|token|key)['"]\s*[:=]\s*['"]([a-zA-Z0-9_-]{20,})['"]/gi,
        severity: 'low',
        description: 'Generic secret pattern detected'
      },
      {
        name: 'Hardcoded JWT Secret',
        pattern: /jwt[_-]?secret['"]\s*[:=]\s*['"]([^'"]{20,})['"]/gi,
        severity: 'high',
        description: 'Hardcoded JWT secret detected'
      },
      {
        name: 'Vault Token',
        pattern: /hvs\.[a-zA-Z0-9_-]{20,}/gi,
        severity: 'high',
        description: 'HashiCorp Vault token detected'
      }
    ];
  }

  /**
   * Scan for secrets in the specified directory
   */
  async scan(): Promise<ScanResult[]> {
    logger.info(`Starting secrets scan in: ${this.options.rootPath}`);
    const results: ScanResult[] = [];

    try {
      const files = await this.getFilesToScan();
      logger.info(`Scanning ${files.length} files for secrets`);

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        this.emit('scan:progress', {
          current: i + 1,
          total: files.length,
          file
        });

        try {
          const fileResults = await this.scanFile(file);
          results.push(...fileResults);

          if (fileResults.length > 0) {
            logger.warn(`Found ${fileResults.length} potential secrets in: ${file}`);
          }
        } catch (error) {
          logger.error(`Error scanning file: ${file}`, error);
          this.emit('scan:error', { file, error });
        }
      }

      logger.info(`Scan completed. Found ${results.length} potential secrets`);
      this.emit('scan:complete', { results, totalFiles: files.length });

      return results;
    } catch (error) {
      logger.error('Scan failed', error);
      this.emit('scan:error', { error });
      throw error;
    }
  }

  /**
   * Get list of files to scan
   */
  private async getFilesToScan(): Promise<string[]> {
    const files: string[] = [];

    const walk = async (dir: string): Promise<void> => {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          if (!this.shouldExcludePath(fullPath)) {
            await walk(fullPath);
          }
        } else if (entry.isFile()) {
          if (this.shouldIncludeFile(fullPath)) {
            files.push(fullPath);
          }
        }
      }
    };

    await walk(this.options.rootPath);
    return files;
  }

  /**
   * Check if path should be excluded
   */
  private shouldExcludePath(filePath: string): boolean {
    const relativePath = path.relative(this.options.rootPath, filePath);

    return this.options.excludePatterns?.some(pattern => {
      const regex = new RegExp(pattern.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*'));
      return regex.test(relativePath);
    }) || false;
  }

  /**
   * Check if file should be included
   */
  private shouldIncludeFile(filePath: string): boolean {
    if (this.shouldExcludePath(filePath)) {
      return false;
    }

    // Check file size
    try {
      const stats = require('fs').statSync(filePath);
      if (stats.size > this.options.maxFileSize!) {
        return false;
      }
    } catch {
      return false;
    }

    // Check include patterns if specified
    if (this.options.includePatterns?.length) {
      const relativePath = path.relative(this.options.rootPath, filePath);
      return this.options.includePatterns.some(pattern => {
        const regex = new RegExp(pattern.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*'));
        return regex.test(relativePath);
      });
    }

    // Include text files by default
    const textExtensions = [
      '.js', '.ts', '.jsx', '.tsx', '.json', '.yml', '.yaml',
      '.env', '.txt', '.md', '.sh', '.py', '.go', '.rs',
      '.php', '.rb', '.java', '.cs', '.cpp', '.c', '.h'
    ];

    const ext = path.extname(filePath).toLowerCase();
    return textExtensions.includes(ext) || !ext;
  }

  /**
   * Scan a single file for secrets
   */
  private async scanFile(filePath: string): Promise<ScanResult[]> {
    const results: ScanResult[] = [];

    try {
      const content = await fs.readFile(filePath, 'utf8');
      const lines = content.split('\n');

      for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
        const line = lines[lineIndex];

        for (const pattern of this.patterns) {
          const matches = [...line.matchAll(pattern.pattern)];

          for (const match of matches) {
            if (match.index !== undefined) {
              // Skip if it looks like a placeholder or example
              if (this.isPlaceholderValue(match[0])) {
                continue;
              }

              results.push({
                file: path.relative(this.options.rootPath, filePath),
                line: lineIndex + 1,
                column: match.index + 1,
                pattern: pattern.name,
                match: match[0],
                severity: pattern.severity,
                description: pattern.description
              });
            }
          }
        }
      }
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }

    return results;
  }

  /**
   * Check if a value looks like a placeholder
   */
  private isPlaceholderValue(value: string): boolean {
    const placeholderPatterns = [
      /^(your|my|test|example|demo|sample)/i,
      /^(replace|change|update).*with/i,
      /^(xxx|000|123|abc)/i,
      /placeholder/i,
      /\$\{.*\}/,
      /<.*>/,
      /\[.*\]/
    ];

    return placeholderPatterns.some(pattern => pattern.test(value));
  }

  /**
   * Generate a report from scan results
   */
  generateReport(results: ScanResult[]): {
    summary: {
      total: number;
      high: number;
      medium: number;
      low: number;
      files: number;
    };
    details: ScanResult[];
    recommendations: string[];
  } {
    const summary = {
      total: results.length,
      high: results.filter(r => r.severity === 'high').length,
      medium: results.filter(r => r.severity === 'medium').length,
      low: results.filter(r => r.severity === 'low').length,
      files: new Set(results.map(r => r.file)).size
    };

    const recommendations = [
      'Move hardcoded secrets to HashiCorp Vault or environment variables',
      'Use secret scanning in CI/CD pipelines',
      'Implement automatic secret rotation',
      'Add .env files to .gitignore',
      'Use placeholder values in example files',
      'Implement proper secret injection at runtime'
    ];

    if (summary.high > 0) {
      recommendations.unshift('URGENT: High-severity secrets detected - immediate action required');
    }

    return {
      summary,
      details: results.sort((a, b) => {
        const severityOrder = { high: 3, medium: 2, low: 1 };
        return severityOrder[b.severity] - severityOrder[a.severity];
      }),
      recommendations
    };
  }

  /**
   * Save scan results to file
   */
  async saveReport(results: ScanResult[], outputPath: string): Promise<void> {
    const report = this.generateReport(results);

    const output = {
      timestamp: new Date().toISOString(),
      scanner: 'urnlabs-secrets-scanner',
      scan_path: this.options.rootPath,
      ...report
    };

    await fs.writeFile(outputPath, JSON.stringify(output, null, 2));
    logger.info(`Scan report saved to: ${outputPath}`);
  }
}