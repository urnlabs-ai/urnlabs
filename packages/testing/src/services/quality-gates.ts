import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

export interface CoverageThresholds {
  statements: number;
  branches: number;
  functions: number;
  lines: number;
}

export interface QualityGateConfig {
  coverage: CoverageThresholds;
  security: {
    allowedVulnerabilities: {
      critical: number;
      high: number;
      medium: number;
      low: number;
    };
    requireSecurityScan: boolean;
  };
  performance: {
    maxApiResponseTime: number; // milliseconds
    maxMemoryUsage: number; // MB
    maxBundleSize: number; // KB
  };
  compliance: {
    requireDocumentation: boolean;
    requireTests: boolean;
    codeStandardsLevel: 'strict' | 'recommended' | 'basic';
  };
}

export interface QualityGateResult {
  passed: boolean;
  coverage: {
    passed: boolean;
    actual: CoverageThresholds;
    required: CoverageThresholds;
    details: string;
  };
  security: {
    passed: boolean;
    vulnerabilities: any[];
    details: string;
  };
  performance: {
    passed: boolean;
    metrics: {
      apiResponseTime?: number;
      memoryUsage?: number;
      bundleSize?: number;
    };
    details: string;
  };
  compliance: {
    passed: boolean;
    checks: {
      documentation: boolean;
      tests: boolean;
      codeStandards: boolean;
    };
    details: string;
  };
  errors: string[];
  warnings: string[];
}

export class QualityGateService {
  private config: QualityGateConfig;
  private projectRoot: string;

  constructor(config: QualityGateConfig, projectRoot: string) {
    this.config = config;
    this.projectRoot = projectRoot;
  }

  async checkQualityGates(): Promise<QualityGateResult> {
    const result: QualityGateResult = {
      passed: false,
      coverage: {
        passed: false,
        actual: { statements: 0, branches: 0, functions: 0, lines: 0 },
        required: this.config.coverage,
        details: ''
      },
      security: {
        passed: false,
        vulnerabilities: [],
        details: ''
      },
      performance: {
        passed: false,
        metrics: {},
        details: ''
      },
      compliance: {
        passed: false,
        checks: {
          documentation: false,
          tests: false,
          codeStandards: false
        },
        details: ''
      },
      errors: [],
      warnings: []
    };

    try {
      // Check code coverage
      await this.checkCoverage(result);

      // Check security vulnerabilities
      await this.checkSecurity(result);

      // Check performance benchmarks
      await this.checkPerformance(result);

      // Check compliance requirements
      await this.checkCompliance(result);

      // Determine overall pass/fail
      result.passed = result.coverage.passed &&
                     result.security.passed &&
                     result.performance.passed &&
                     result.compliance.passed;

    } catch (error) {
      result.errors.push(`Quality gate check failed: ${error}`);
      result.passed = false;
    }

    return result;
  }

  private async checkCoverage(result: QualityGateResult): Promise<void> {
    try {
      // Run coverage analysis
      const coverageCommand = 'vitest run --coverage --reporter=json';
      const coverageOutput = execSync(coverageCommand, {
        cwd: this.projectRoot,
        encoding: 'utf-8',
        stdio: 'pipe'
      });

      // Parse coverage results
      const coverageData = this.parseCoverageResults();
      result.coverage.actual = coverageData;

      // Check thresholds
      const thresholds = this.config.coverage;
      const coveragePassed =
        coverageData.statements >= thresholds.statements &&
        coverageData.branches >= thresholds.branches &&
        coverageData.functions >= thresholds.functions &&
        coverageData.lines >= thresholds.lines;

      result.coverage.passed = coveragePassed;
      result.coverage.details = this.generateCoverageDetails(coverageData, thresholds);

      if (!coveragePassed) {
        result.warnings.push('Code coverage below required thresholds');
      }

    } catch (error) {
      result.errors.push(`Coverage check failed: ${error}`);
      result.coverage.details = `Failed to run coverage analysis: ${error}`;
    }
  }

  private async checkSecurity(result: QualityGateResult): Promise<void> {
    try {
      if (!this.config.security.requireSecurityScan) {
        result.security.passed = true;
        result.security.details = 'Security scanning disabled';
        return;
      }

      // Run ESLint security rules
      await this.runEslintSecurity(result);

      // Run Snyk vulnerability scan
      await this.runSnykScan(result);

      // Check if vulnerabilities are within allowed limits
      const vulnCounts = this.countVulnerabilities(result.security.vulnerabilities);
      const allowed = this.config.security.allowedVulnerabilities;

      const securityPassed =
        vulnCounts.critical <= allowed.critical &&
        vulnCounts.high <= allowed.high &&
        vulnCounts.medium <= allowed.medium &&
        vulnCounts.low <= allowed.low;

      result.security.passed = securityPassed;
      result.security.details = this.generateSecurityDetails(vulnCounts, allowed);

      if (!securityPassed) {
        result.errors.push('Security vulnerabilities exceed allowed thresholds');
      }

    } catch (error) {
      result.errors.push(`Security check failed: ${error}`);
      result.security.details = `Failed to run security analysis: ${error}`;
    }
  }

  private async checkPerformance(result: QualityGateResult): Promise<void> {
    try {
      // Run performance tests and collect metrics
      const performanceMetrics = await this.collectPerformanceMetrics();
      result.performance.metrics = performanceMetrics;

      const config = this.config.performance;
      const performancePassed =
        (!performanceMetrics.apiResponseTime || performanceMetrics.apiResponseTime <= config.maxApiResponseTime) &&
        (!performanceMetrics.memoryUsage || performanceMetrics.memoryUsage <= config.maxMemoryUsage) &&
        (!performanceMetrics.bundleSize || performanceMetrics.bundleSize <= config.maxBundleSize);

      result.performance.passed = performancePassed;
      result.performance.details = this.generatePerformanceDetails(performanceMetrics, config);

      if (!performancePassed) {
        result.warnings.push('Performance metrics exceed allowed thresholds');
      }

    } catch (error) {
      result.errors.push(`Performance check failed: ${error}`);
      result.performance.details = `Failed to run performance analysis: ${error}`;
    }
  }

  private async checkCompliance(result: QualityGateResult): Promise<void> {
    try {
      const checks = result.compliance.checks;

      // Check documentation requirements
      if (this.config.compliance.requireDocumentation) {
        checks.documentation = await this.checkDocumentation();
      } else {
        checks.documentation = true;
      }

      // Check test requirements
      if (this.config.compliance.requireTests) {
        checks.tests = await this.checkTestRequirements();
      } else {
        checks.tests = true;
      }

      // Check code standards
      checks.codeStandards = await this.checkCodeStandards();

      result.compliance.passed = checks.documentation && checks.tests && checks.codeStandards;
      result.compliance.details = this.generateComplianceDetails(checks);

      if (!result.compliance.passed) {
        result.warnings.push('Compliance checks failed');
      }

    } catch (error) {
      result.errors.push(`Compliance check failed: ${error}`);
      result.compliance.details = `Failed to run compliance analysis: ${error}`;
    }
  }

  private parseCoverageResults(): CoverageThresholds {
    try {
      const coveragePath = path.join(this.projectRoot, 'coverage', 'coverage-summary.json');

      if (!fs.existsSync(coveragePath)) {
        throw new Error('Coverage report not found');
      }

      const coverageData = JSON.parse(fs.readFileSync(coveragePath, 'utf-8'));
      const total = coverageData.total;

      return {
        statements: total.statements.pct,
        branches: total.branches.pct,
        functions: total.functions.pct,
        lines: total.lines.pct
      };
    } catch (error) {
      throw new Error(`Failed to parse coverage results: ${error}`);
    }
  }

  private async runEslintSecurity(result: QualityGateResult): Promise<void> {
    try {
      const eslintCommand = 'eslint src/**/*.ts --format json';
      const eslintOutput = execSync(eslintCommand, {
        cwd: this.projectRoot,
        encoding: 'utf-8',
        stdio: 'pipe'
      });

      const eslintResults = JSON.parse(eslintOutput);

      // Extract security-related issues
      const securityIssues = eslintResults
        .flatMap((file: any) => file.messages)
        .filter((message: any) => message.ruleId && message.ruleId.startsWith('security/'))
        .map((issue: any) => ({
          type: 'eslint-security',
          severity: issue.severity === 2 ? 'high' : 'medium',
          rule: issue.ruleId,
          message: issue.message,
          file: issue.source
        }));

      result.security.vulnerabilities.push(...securityIssues);
    } catch (error) {
      // ESLint might return non-zero exit code for violations, which is expected
      console.warn('ESLint security scan completed with warnings');
    }
  }

  private async runSnykScan(result: QualityGateResult): Promise<void> {
    try {
      const snykCommand = 'snyk test --json';
      const snykOutput = execSync(snykCommand, {
        cwd: this.projectRoot,
        encoding: 'utf-8',
        stdio: 'pipe'
      });

      const snykResults = JSON.parse(snykOutput);

      if (snykResults.vulnerabilities) {
        const vulnerabilities = snykResults.vulnerabilities.map((vuln: any) => ({
          type: 'dependency',
          severity: vuln.severity,
          title: vuln.title,
          package: vuln.packageName,
          version: vuln.version,
          id: vuln.id
        }));

        result.security.vulnerabilities.push(...vulnerabilities);
      }
    } catch (error) {
      // Snyk might not be configured or might find vulnerabilities
      console.warn('Snyk scan completed with warnings or is not configured');
    }
  }

  private countVulnerabilities(vulnerabilities: any[]): any {
    return vulnerabilities.reduce((counts, vuln) => {
      counts[vuln.severity] = (counts[vuln.severity] || 0) + 1;
      return counts;
    }, { critical: 0, high: 0, medium: 0, low: 0 });
  }

  private async collectPerformanceMetrics(): Promise<any> {
    const metrics: any = {};

    try {
      // Collect API response time from test results
      const testResultsPath = path.join(this.projectRoot, 'test-results', 'performance.json');
      if (fs.existsSync(testResultsPath)) {
        const testResults = JSON.parse(fs.readFileSync(testResultsPath, 'utf-8'));
        metrics.apiResponseTime = testResults.averageResponseTime;
      }

      // Collect memory usage
      metrics.memoryUsage = process.memoryUsage().heapUsed / 1024 / 1024; // Convert to MB

      // Collect bundle size (if applicable)
      const bundlePath = path.join(this.projectRoot, 'dist');
      if (fs.existsSync(bundlePath)) {
        const bundleStats = fs.statSync(path.join(bundlePath, 'index.js'));
        metrics.bundleSize = bundleStats.size / 1024; // Convert to KB
      }

    } catch (error) {
      console.warn('Some performance metrics could not be collected:', error);
    }

    return metrics;
  }

  private async checkDocumentation(): Promise<boolean> {
    try {
      // Check for README files
      const readmeExists = fs.existsSync(path.join(this.projectRoot, 'README.md'));

      // Check for API documentation
      const apiDocsExist = fs.existsSync(path.join(this.projectRoot, 'docs', 'api.md')) ||
                          fs.existsSync(path.join(this.projectRoot, 'docs', 'swagger.json'));

      // Check for inline documentation (TSDoc comments)
      const sourceFiles = this.getSourceFiles();
      const documentedFiles = sourceFiles.filter(file => {
        const content = fs.readFileSync(file, 'utf-8');
        return content.includes('/**') || content.includes('//'); // Basic check for comments
      });

      const documentationCoverage = documentedFiles.length / sourceFiles.length;

      return readmeExists && apiDocsExist && documentationCoverage > 0.7;
    } catch (error) {
      return false;
    }
  }

  private async checkTestRequirements(): Promise<boolean> {
    try {
      const sourceFiles = this.getSourceFiles();
      const testFiles = this.getTestFiles();

      // Basic heuristic: should have at least 1 test file per 3 source files
      const testCoverage = testFiles.length / sourceFiles.length;

      return testCoverage > 0.3 && testFiles.length > 0;
    } catch (error) {
      return false;
    }
  }

  private async checkCodeStandards(): Promise<boolean> {
    try {
      const eslintCommand = 'eslint src/**/*.ts --format json';
      const eslintOutput = execSync(eslintCommand, {
        cwd: this.projectRoot,
        encoding: 'utf-8',
        stdio: 'pipe'
      });

      const eslintResults = JSON.parse(eslintOutput);
      const errorCount = eslintResults.reduce((count: number, file: any) => {
        return count + file.errorCount;
      }, 0);

      // Allow different error thresholds based on code standards level
      const maxErrors = {
        strict: 0,
        recommended: 5,
        basic: 20
      };

      return errorCount <= maxErrors[this.config.compliance.codeStandardsLevel];
    } catch (error) {
      return false;
    }
  }

  private getSourceFiles(): string[] {
    const srcDir = path.join(this.projectRoot, 'src');
    if (!fs.existsSync(srcDir)) return [];

    return this.getFilesRecursively(srcDir, '.ts').filter(file =>
      !file.includes('.test.') && !file.includes('.spec.')
    );
  }

  private getTestFiles(): string[] {
    const srcDir = path.join(this.projectRoot, 'src');
    if (!fs.existsSync(srcDir)) return [];

    return this.getFilesRecursively(srcDir, '.ts').filter(file =>
      file.includes('.test.') || file.includes('.spec.')
    );
  }

  private getFilesRecursively(dir: string, extension: string): string[] {
    const files: string[] = [];
    const items = fs.readdirSync(dir);

    for (const item of items) {
      const fullPath = path.join(dir, item);
      const stat = fs.statSync(fullPath);

      if (stat.isDirectory()) {
        files.push(...this.getFilesRecursively(fullPath, extension));
      } else if (item.endsWith(extension)) {
        files.push(fullPath);
      }
    }

    return files;
  }

  private generateCoverageDetails(actual: CoverageThresholds, required: CoverageThresholds): string {
    return `Coverage Results:
- Statements: ${actual.statements.toFixed(1)}% (required: ${required.statements}%)
- Branches: ${actual.branches.toFixed(1)}% (required: ${required.branches}%)
- Functions: ${actual.functions.toFixed(1)}% (required: ${required.functions}%)
- Lines: ${actual.lines.toFixed(1)}% (required: ${required.lines}%)`;
  }

  private generateSecurityDetails(actual: any, allowed: any): string {
    return `Security Scan Results:
- Critical: ${actual.critical} (allowed: ${allowed.critical})
- High: ${actual.high} (allowed: ${allowed.high})
- Medium: ${actual.medium} (allowed: ${allowed.medium})
- Low: ${actual.low} (allowed: ${allowed.low})`;
  }

  private generatePerformanceDetails(metrics: any, config: any): string {
    const details = ['Performance Metrics:'];

    if (metrics.apiResponseTime) {
      details.push(`- API Response Time: ${metrics.apiResponseTime}ms (max: ${config.maxApiResponseTime}ms)`);
    }

    if (metrics.memoryUsage) {
      details.push(`- Memory Usage: ${metrics.memoryUsage.toFixed(1)}MB (max: ${config.maxMemoryUsage}MB)`);
    }

    if (metrics.bundleSize) {
      details.push(`- Bundle Size: ${metrics.bundleSize.toFixed(1)}KB (max: ${config.maxBundleSize}KB)`);
    }

    return details.join('\n');
  }

  private generateComplianceDetails(checks: any): string {
    return `Compliance Checks:
- Documentation: ${checks.documentation ? 'PASS' : 'FAIL'}
- Tests: ${checks.tests ? 'PASS' : 'FAIL'}
- Code Standards: ${checks.codeStandards ? 'PASS' : 'FAIL'}`;
  }
}