import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import { ScanConfig, ScanResult, Vulnerability, DependencyInfo } from '../types/scan-types.js';
import { logger } from '../utils/logger.js';
import axios from 'axios';

const execAsync = promisify(exec);

/**
 * Dependency Scanner using Snyk API and local vulnerability databases
 */
export class DependencyScanner {
  private readonly snykApiKey: string;
  private readonly snykApiUrl = 'https://snyk.io/api/v1';

  constructor() {
    this.snykApiKey = process.env.SNYK_API_KEY || '';
  }

  /**
   * Scan dependencies for known vulnerabilities
   */
  async scan(config: ScanConfig): Promise<ScanResult> {
    const startTime = new Date();
    const scanId = config.scanId || `deps-${Date.now()}`;

    logger.info(`Starting dependency scan: ${scanId}`, {
      repository: config.repository,
      includeDevDependencies: config.includeDevDependencies
    });

    try {
      // Discover dependency files
      const dependencyFiles = await this.discoverDependencyFiles(config.repository || '.');

      if (dependencyFiles.length === 0) {
        logger.warn('No dependency files found');
        return this.createEmptyResult(scanId, startTime, config);
      }

      // Parse dependencies
      const dependencies = await this.parseDependencies(dependencyFiles, config.includeDevDependencies);

      // Scan with Snyk API if available
      let snykVulnerabilities: Vulnerability[] = [];
      if (this.snykApiKey) {
        snykVulnerabilities = await this.scanWithSnyk(dependencies, config);
      } else {
        logger.warn('Snyk API key not configured, running local scan only');
      }

      // Run local vulnerability checks
      const localVulnerabilities = await this.scanWithLocalDatabase(dependencies);

      // Merge results
      const vulnerabilities = [
        ...snykVulnerabilities,
        ...localVulnerabilities
      ];

      // Filter by severity
      const filteredVulnerabilities = this.filterBySeverity(vulnerabilities, config.severity);

      const result: ScanResult = {
        scanId,
        scanType: 'dependency',
        status: 'completed',
        startTime,
        endTime: new Date(),
        vulnerabilities: filteredVulnerabilities,
        summary: this.generateSummary(filteredVulnerabilities),
        metadata: {
          repository: config.repository,
          tool: 'snyk',
          version: '1.0.0',
          rulesUsed: ['snyk-database', 'local-database'],
          filesScanned: dependencyFiles.length
        },
        config
      };

      logger.info(`Dependency scan completed: ${scanId}`, {
        vulnerabilities: result.vulnerabilities.length,
        critical: result.summary.critical,
        high: result.summary.high
      });

      return result;

    } catch (error) {
      logger.error(`Dependency scan failed: ${scanId}`, { error: error.message });

      return {
        scanId,
        scanType: 'dependency',
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
   * Discover dependency files in the repository
   */
  private async discoverDependencyFiles(directory: string): Promise<string[]> {
    const dependencyFiles: string[] = [];
    const supportedFiles = [
      'package.json',
      'package-lock.json',
      'yarn.lock',
      'pnpm-lock.yaml',
      'requirements.txt',
      'Pipfile',
      'Pipfile.lock',
      'go.mod',
      'go.sum',
      'Cargo.toml',
      'Cargo.lock',
      'composer.json',
      'composer.lock',
      'Gemfile',
      'Gemfile.lock',
      'pom.xml',
      'build.gradle',
      'packages.config',
      'project.json'
    ];

    async function scanDirectory(dir: string) {
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);

          if (entry.isDirectory()) {
            // Skip common non-source directories
            if (!['node_modules', '.git', 'vendor', 'target', 'build', 'dist', '.next'].includes(entry.name)) {
              await scanDirectory(fullPath);
            }
          } else if (entry.isFile() && supportedFiles.includes(entry.name)) {
            dependencyFiles.push(fullPath);
          }
        }
      } catch (error) {
        logger.warn(`Failed to scan directory: ${dir}`, { error: error.message });
      }
    }

    await scanDirectory(directory);
    return dependencyFiles;
  }

  /**
   * Parse dependencies from discovered files
   */
  private async parseDependencies(files: string[], includeDevDependencies = true): Promise<DependencyInfo[]> {
    const dependencies: DependencyInfo[] = [];

    for (const file of files) {
      try {
        const fileName = path.basename(file);
        const ecosystem = this.getEcosystem(fileName);

        switch (fileName) {
          case 'package.json':
            const npmDeps = await this.parsePackageJson(file, includeDevDependencies);
            dependencies.push(...npmDeps);
            break;
          case 'requirements.txt':
            const pipDeps = await this.parseRequirementsTxt(file);
            dependencies.push(...pipDeps);
            break;
          case 'go.mod':
            const goDeps = await this.parseGoMod(file);
            dependencies.push(...goDeps);
            break;
          case 'Cargo.toml':
            const rustDeps = await this.parseCargoToml(file);
            dependencies.push(...rustDeps);
            break;
          case 'pom.xml':
            const mavenDeps = await this.parsePomXml(file);
            dependencies.push(...mavenDeps);
            break;
          case 'Gemfile':
            const gemDeps = await this.parseGemfile(file);
            dependencies.push(...gemDeps);
            break;
          default:
            logger.debug(`Unsupported dependency file: ${fileName}`);
        }
      } catch (error) {
        logger.warn(`Failed to parse dependency file: ${file}`, { error: error.message });
      }
    }

    return dependencies;
  }

  /**
   * Parse package.json for npm dependencies
   */
  private async parsePackageJson(filePath: string, includeDevDependencies: boolean): Promise<DependencyInfo[]> {
    const content = await fs.readFile(filePath, 'utf-8');
    const packageJson = JSON.parse(content);
    const dependencies: DependencyInfo[] = [];

    // Parse production dependencies
    if (packageJson.dependencies) {
      for (const [name, version] of Object.entries(packageJson.dependencies)) {
        dependencies.push({
          name,
          version: version as string,
          type: 'direct',
          scope: 'production',
          ecosystem: 'npm',
          file: filePath
        });
      }
    }

    // Parse development dependencies if requested
    if (includeDevDependencies && packageJson.devDependencies) {
      for (const [name, version] of Object.entries(packageJson.devDependencies)) {
        dependencies.push({
          name,
          version: version as string,
          type: 'direct',
          scope: 'development',
          ecosystem: 'npm',
          file: filePath
        });
      }
    }

    return dependencies;
  }

  /**
   * Parse requirements.txt for Python dependencies
   */
  private async parseRequirementsTxt(filePath: string): Promise<DependencyInfo[]> {
    const content = await fs.readFile(filePath, 'utf-8');
    const lines = content.split('\n').filter(line => line.trim() && !line.startsWith('#'));
    const dependencies: DependencyInfo[] = [];

    for (const line of lines) {
      const match = line.match(/^([a-zA-Z0-9_-]+)([>=<~!]+)?([\d.]+)?/);
      if (match) {
        dependencies.push({
          name: match[1],
          version: match[3] || 'latest',
          type: 'direct',
          scope: 'production',
          ecosystem: 'pip',
          file: filePath
        });
      }
    }

    return dependencies;
  }

  /**
   * Parse go.mod for Go dependencies
   */
  private async parseGoMod(filePath: string): Promise<DependencyInfo[]> {
    const content = await fs.readFile(filePath, 'utf-8');
    const dependencies: DependencyInfo[] = [];
    const requireRegex = /require\s+([^\s]+)\s+([^\s]+)/g;

    let match;
    while ((match = requireRegex.exec(content)) !== null) {
      dependencies.push({
        name: match[1],
        version: match[2],
        type: 'direct',
        scope: 'production',
        ecosystem: 'go',
        file: filePath
      });
    }

    return dependencies;
  }

  /**
   * Parse Cargo.toml for Rust dependencies
   */
  private async parseCargoToml(filePath: string): Promise<DependencyInfo[]> {
    const content = await fs.readFile(filePath, 'utf-8');
    const dependencies: DependencyInfo[] = [];

    // Simple regex-based parsing for dependencies section
    const depSection = content.match(/\[dependencies\]([\s\S]*?)(?=\[|$)/);
    if (depSection) {
      const depLines = depSection[1].split('\n').filter(line => line.trim() && !line.startsWith('#'));

      for (const line of depLines) {
        const match = line.match(/^([^=]+)\s*=\s*["']([^"']+)["']/);
        if (match) {
          dependencies.push({
            name: match[1].trim(),
            version: match[2],
            type: 'direct',
            scope: 'production',
            ecosystem: 'rust',
            file: filePath
          });
        }
      }
    }

    return dependencies;
  }

  /**
   * Parse pom.xml for Maven dependencies
   */
  private async parsePomXml(filePath: string): Promise<DependencyInfo[]> {
    const content = await fs.readFile(filePath, 'utf-8');
    const dependencies: DependencyInfo[] = [];

    // Basic XML parsing for dependencies
    const depRegex = /<dependency>[\s\S]*?<groupId>([^<]+)<\/groupId>[\s\S]*?<artifactId>([^<]+)<\/artifactId>[\s\S]*?<version>([^<]+)<\/version>[\s\S]*?<\/dependency>/g;

    let match;
    while ((match = depRegex.exec(content)) !== null) {
      dependencies.push({
        name: `${match[1]}:${match[2]}`,
        version: match[3],
        type: 'direct',
        scope: 'production',
        ecosystem: 'maven',
        file: filePath
      });
    }

    return dependencies;
  }

  /**
   * Parse Gemfile for Ruby dependencies
   */
  private async parseGemfile(filePath: string): Promise<DependencyInfo[]> {
    const content = await fs.readFile(filePath, 'utf-8');
    const dependencies: DependencyInfo[] = [];
    const gemRegex = /gem\s+['"]([^'"]+)['"](?:,\s*['"]([^'"]+)['"])?/g;

    let match;
    while ((match = gemRegex.exec(content)) !== null) {
      dependencies.push({
        name: match[1],
        version: match[2] || 'latest',
        type: 'direct',
        scope: 'production',
        ecosystem: 'gem',
        file: filePath
      });
    }

    return dependencies;
  }

  /**
   * Scan dependencies using Snyk API
   */
  private async scanWithSnyk(dependencies: DependencyInfo[], config: ScanConfig): Promise<Vulnerability[]> {
    const vulnerabilities: Vulnerability[] = [];

    try {
      // Group dependencies by ecosystem for batch scanning
      const ecosystemGroups = this.groupByEcosystem(dependencies);

      for (const [ecosystem, deps] of Object.entries(ecosystemGroups)) {
        if (deps.length === 0) continue;

        logger.debug(`Scanning ${deps.length} ${ecosystem} dependencies with Snyk`);

        const snykResult = await this.callSnykApi(ecosystem, deps);
        const ecosystemVulns = this.parseSnykResponse(snykResult, deps);
        vulnerabilities.push(...ecosystemVulns);
      }
    } catch (error) {
      logger.error('Snyk API scan failed', { error: error.message });
    }

    return vulnerabilities;
  }

  /**
   * Call Snyk API for vulnerability data
   */
  private async callSnykApi(ecosystem: string, dependencies: DependencyInfo[]): Promise<any> {
    const headers = {
      'Authorization': `token ${this.snykApiKey}`,
      'Content-Type': 'application/json'
    };

    const packages = dependencies.map(dep => ({
      name: dep.name,
      version: dep.version
    }));

    const response = await axios.post(`${this.snykApiUrl}/test/${ecosystem}`, {
      packages
    }, { headers, timeout: 30000 });

    return response.data;
  }

  /**
   * Parse Snyk API response into vulnerabilities
   */
  private parseSnykResponse(snykResult: any, dependencies: DependencyInfo[]): Vulnerability[] {
    const vulnerabilities: Vulnerability[] = [];

    if (snykResult.issues && snykResult.issues.vulnerabilities) {
      for (const vuln of snykResult.issues.vulnerabilities) {
        const affectedDep = dependencies.find(dep => dep.name === vuln.pkgName);

        vulnerabilities.push({
          id: `snyk-${vuln.id}`,
          title: vuln.title,
          description: vuln.description,
          severity: this.mapSnykSeverity(vuln.severity),
          cvss: vuln.cvssScore || 0,
          cwe: vuln.cwe?.join(', '),
          package: vuln.pkgName,
          version: vuln.pkgVersions?.join(', '),
          fixedVersion: vuln.fixedIn?.join(', '),
          file: affectedDep?.file,
          remediation: this.generateRemediation(vuln),
          references: vuln.references || [],
          exploitMaturity: vuln.exploitMaturity,
          discoveredAt: new Date()
        });
      }
    }

    return vulnerabilities;
  }

  /**
   * Scan using local vulnerability database
   */
  private async scanWithLocalDatabase(dependencies: DependencyInfo[]): Promise<Vulnerability[]> {
    const vulnerabilities: Vulnerability[] = [];

    // This would integrate with local vulnerability databases like
    // OSV, CVE databases, etc. For now, implement basic checks
    for (const dep of dependencies) {
      const localVulns = await this.checkLocalVulnerabilityDatabase(dep);
      vulnerabilities.push(...localVulns);
    }

    return vulnerabilities;
  }

  /**
   * Check local vulnerability database
   */
  private async checkLocalVulnerabilityDatabase(dependency: DependencyInfo): Promise<Vulnerability[]> {
    // This would query local vulnerability databases
    // For demonstration, we'll implement some basic checks
    const vulnerabilities: Vulnerability[] = [];

    // Check for known vulnerable versions
    const knownVulnerable = this.isKnownVulnerable(dependency);
    if (knownVulnerable) {
      vulnerabilities.push({
        id: `local-${dependency.name}-${Date.now()}`,
        title: `Known vulnerable version of ${dependency.name}`,
        description: `Version ${dependency.version} of ${dependency.name} has known security vulnerabilities`,
        severity: 'medium',
        cvss: 5.0,
        package: dependency.name,
        version: dependency.version,
        file: dependency.file,
        remediation: `Update ${dependency.name} to the latest secure version`,
        references: []
      });
    }

    return vulnerabilities;
  }

  /**
   * Check if dependency version is known to be vulnerable
   */
  private isKnownVulnerable(dependency: DependencyInfo): boolean {
    // This would check against a comprehensive vulnerability database
    // For now, implement basic version checks for common packages
    const knownVulnerable = [
      { name: 'lodash', versions: ['<4.17.21'] },
      { name: 'minimist', versions: ['<1.2.6'] },
      { name: 'axios', versions: ['<0.21.2'] },
      { name: 'express', versions: ['<4.18.2'] }
    ];

    return knownVulnerable.some(vuln =>
      vuln.name === dependency.name &&
      this.isVersionVulnerable(dependency.version, vuln.versions)
    );
  }

  /**
   * Check if version matches vulnerable range
   */
  private isVersionVulnerable(version: string, vulnerableRanges: string[]): boolean {
    // Simple version comparison - in production, use semver library
    for (const range of vulnerableRanges) {
      if (range.startsWith('<') && version < range.substring(1)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Group dependencies by ecosystem
   */
  private groupByEcosystem(dependencies: DependencyInfo[]): Record<string, DependencyInfo[]> {
    return dependencies.reduce((groups, dep) => {
      if (!groups[dep.ecosystem]) {
        groups[dep.ecosystem] = [];
      }
      groups[dep.ecosystem].push(dep);
      return groups;
    }, {} as Record<string, DependencyInfo[]>);
  }

  /**
   * Get ecosystem from filename
   */
  private getEcosystem(fileName: string): string {
    const ecosystemMap: Record<string, string> = {
      'package.json': 'npm',
      'requirements.txt': 'pip',
      'go.mod': 'go',
      'Cargo.toml': 'rust',
      'pom.xml': 'maven',
      'Gemfile': 'gem'
    };

    return ecosystemMap[fileName] || 'unknown';
  }

  /**
   * Map Snyk severity to our severity levels
   */
  private mapSnykSeverity(snykSeverity: string): 'critical' | 'high' | 'medium' | 'low' | 'info' {
    const severityMap: Record<string, 'critical' | 'high' | 'medium' | 'low' | 'info'> = {
      'critical': 'critical',
      'high': 'high',
      'medium': 'medium',
      'low': 'low'
    };

    return severityMap[snykSeverity.toLowerCase()] || 'medium';
  }

  /**
   * Generate remediation advice
   */
  private generateRemediation(snykVuln: any): string {
    if (snykVuln.fixedIn && snykVuln.fixedIn.length > 0) {
      return `Update to version ${snykVuln.fixedIn[0]} or later`;
    }

    if (snykVuln.patches && snykVuln.patches.length > 0) {
      return 'Apply available security patches';
    }

    return 'Review and update to a secure version';
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
   * Create empty scan result
   */
  private createEmptyResult(scanId: string, startTime: Date, config: ScanConfig): ScanResult {
    return {
      scanId,
      scanType: 'dependency',
      status: 'completed',
      startTime,
      endTime: new Date(),
      vulnerabilities: [],
      summary: { total: 0, critical: 0, high: 0, medium: 0, low: 0, info: 0 },
      metadata: {
        repository: config.repository,
        tool: 'dependency-scanner',
        version: '1.0.0',
        filesScanned: 0
      },
      config
    };
  }
}

export default DependencyScanner;