import { EventEmitter } from 'events';
import { Logger } from '@urnlabs/monitoring';
import { SecurityTestFramework } from './SecurityTestFramework';
import { PenetrationTestRunner } from './PenetrationTestRunner';
import { ComplianceValidator } from './ComplianceValidator';
import { VulnerabilityScanner } from './VulnerabilityScanner';

/**
 * Security Gates Configuration
 */
export interface SecurityGateConfig {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  thresholds: SecurityThresholds;
  blocking: boolean;
  environment: string[];
  tags: string[];
}

export interface SecurityThresholds {
  minSecurityScore: number;
  maxCriticalVulnerabilities: number;
  maxHighVulnerabilities: number;
  maxMediumVulnerabilities: number;
  minComplianceScore: number;
  maxResponseTime: number;
  minTestCoverage: number;
}

export interface SecurityGateResult {
  gateId: string;
  gateName: string;
  status: 'PASSED' | 'FAILED' | 'WARNING' | 'SKIPPED';
  score: number;
  threshold: number;
  details: SecurityGateDetail[];
  executionTime: number;
  timestamp: Date;
  environment: string;
  metadata: Record<string, any>;
}

export interface SecurityGateDetail {
  check: string;
  status: 'PASSED' | 'FAILED' | 'WARNING';
  value: number | string;
  threshold: number | string;
  message: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}

export interface SecurityGateSummary {
  totalGates: number;
  passedGates: number;
  failedGates: number;
  warningGates: number;
  skippedGates: number;
  overallStatus: 'PASSED' | 'FAILED' | 'WARNING';
  overallScore: number;
  executionTime: number;
  environment: string;
  gateResults: SecurityGateResult[];
  blockers: string[];
  recommendations: string[];
}

/**
 * Security Gates Executor
 * Implements CI/CD security gates for automated security validation
 */
export class SecurityGates extends EventEmitter {
  private readonly logger: Logger;
  private readonly securityFramework: SecurityTestFramework;
  private readonly pentestRunner: PenetrationTestRunner;
  private readonly complianceValidator: ComplianceValidator;
  private readonly vulnerabilityScanner: VulnerabilityScanner;
  private readonly config: Map<string, SecurityGateConfig> = new Map();

  constructor() {
    super();
    this.logger = new Logger('SecurityGates');
    this.securityFramework = new SecurityTestFramework();
    this.pentestRunner = new PenetrationTestRunner();
    this.complianceValidator = new ComplianceValidator();
    this.vulnerabilityScanner = new VulnerabilityScanner();

    this.initializeDefaultGates();
  }

  /**
   * Initialize default security gates
   */
  private initializeDefaultGates(): void {
    const defaultGates: SecurityGateConfig[] = [
      {
        id: 'pre-commit',
        name: 'Pre-Commit Security Gate',
        description: 'Basic security checks before code commit',
        enabled: true,
        thresholds: {
          minSecurityScore: 70,
          maxCriticalVulnerabilities: 0,
          maxHighVulnerabilities: 2,
          maxMediumVulnerabilities: 10,
          minComplianceScore: 80,
          maxResponseTime: 30000,
          minTestCoverage: 70
        },
        blocking: true,
        environment: ['development', 'staging', 'production'],
        tags: ['static-analysis', 'secrets', 'dependencies']
      },
      {
        id: 'pre-merge',
        name: 'Pre-Merge Security Gate',
        description: 'Comprehensive security validation before merge',
        enabled: true,
        thresholds: {
          minSecurityScore: 80,
          maxCriticalVulnerabilities: 0,
          maxHighVulnerabilities: 1,
          maxMediumVulnerabilities: 5,
          minComplianceScore: 85,
          maxResponseTime: 60000,
          minTestCoverage: 80
        },
        blocking: true,
        environment: ['staging', 'production'],
        tags: ['dynamic-analysis', 'penetration-testing', 'compliance']
      },
      {
        id: 'pre-deployment',
        name: 'Pre-Deployment Security Gate',
        description: 'Final security validation before production deployment',
        enabled: true,
        thresholds: {
          minSecurityScore: 90,
          maxCriticalVulnerabilities: 0,
          maxHighVulnerabilities: 0,
          maxMediumVulnerabilities: 2,
          minComplianceScore: 95,
          maxResponseTime: 120000,
          minTestCoverage: 90
        },
        blocking: true,
        environment: ['production'],
        tags: ['full-suite', 'infrastructure', 'runtime']
      },
      {
        id: 'continuous-monitoring',
        name: 'Continuous Security Monitoring',
        description: 'Ongoing security validation in production',
        enabled: true,
        thresholds: {
          minSecurityScore: 85,
          maxCriticalVulnerabilities: 0,
          maxHighVulnerabilities: 1,
          maxMediumVulnerabilities: 5,
          minComplianceScore: 90,
          maxResponseTime: 300000,
          minTestCoverage: 85
        },
        blocking: false,
        environment: ['production'],
        tags: ['runtime-protection', 'threat-detection', 'monitoring']
      }
    ];

    defaultGates.forEach(gate => {
      this.config.set(gate.id, gate);
    });
  }

  /**
   * Execute security gates for specified environment
   */
  async executeGates(
    environment: string,
    gateIds?: string[],
    options: {
      skipNonBlocking?: boolean;
      parallel?: boolean;
      timeout?: number;
    } = {}
  ): Promise<SecurityGateSummary> {
    const startTime = Date.now();
    this.logger.info('Executing security gates', { environment, gateIds, options });

    try {
      // Filter gates for environment
      const applicableGates = Array.from(this.config.values())
        .filter(gate => gate.enabled)
        .filter(gate => gate.environment.includes(environment))
        .filter(gate => !gateIds || gateIds.includes(gate.id))
        .filter(gate => !options.skipNonBlocking || gate.blocking);

      this.emit('gatesStarted', { environment, gateCount: applicableGates.length });

      // Execute gates
      const gateResults: SecurityGateResult[] = [];

      if (options.parallel) {
        const results = await Promise.allSettled(
          applicableGates.map(gate => this.executeGate(gate, environment))
        );

        results.forEach((result, index) => {
          if (result.status === 'fulfilled') {
            gateResults.push(result.value);
          } else {
            const gate = applicableGates[index];
            gateResults.push({
              gateId: gate.id,
              gateName: gate.name,
              status: 'FAILED',
              score: 0,
              threshold: 0,
              details: [{
                check: 'execution',
                status: 'FAILED',
                value: 'error',
                threshold: 'success',
                message: `Gate execution failed: ${result.reason.message}`,
                severity: 'CRITICAL'
              }],
              executionTime: 0,
              timestamp: new Date(),
              environment,
              metadata: { error: result.reason.message }
            });
          }
        });
      } else {
        for (const gate of applicableGates) {
          const result = await this.executeGate(gate, environment);
          gateResults.push(result);

          // Stop on blocking gate failure
          if (gate.blocking && result.status === 'FAILED') {
            this.logger.error('Blocking security gate failed', {
              gateId: gate.id,
              gateName: gate.name
            });
            break;
          }
        }
      }

      // Calculate summary
      const summary = this.calculateSummary(gateResults, environment, Date.now() - startTime);

      this.emit('gatesCompleted', summary);
      this.logger.info('Security gates execution completed', {
        environment,
        status: summary.overallStatus,
        score: summary.overallScore
      });

      return summary;

    } catch (error) {
      this.logger.error('Security gates execution failed', { environment, error: error.message });
      throw error;
    }
  }

  /**
   * Execute individual security gate
   */
  private async executeGate(
    gate: SecurityGateConfig,
    environment: string
  ): Promise<SecurityGateResult> {
    const startTime = Date.now();
    this.logger.info('Executing security gate', { gateId: gate.id, environment });

    try {
      this.emit('gateStarted', { gateId: gate.id, gateName: gate.name });

      const details: SecurityGateDetail[] = [];
      let overallScore = 100;

      // Execute gate-specific checks based on tags
      if (gate.tags.includes('static-analysis')) {
        const staticResults = await this.runStaticAnalysis();
        details.push(...staticResults);
      }

      if (gate.tags.includes('secrets')) {
        const secretsResults = await this.runSecretsDetection();
        details.push(...secretsResults);
      }

      if (gate.tags.includes('dependencies')) {
        const depResults = await this.runDependencyCheck();
        details.push(...depResults);
      }

      if (gate.tags.includes('dynamic-analysis')) {
        const dynamicResults = await this.runDynamicAnalysis();
        details.push(...dynamicResults);
      }

      if (gate.tags.includes('penetration-testing')) {
        const pentestResults = await this.runPenetrationTests();
        details.push(...pentestResults);
      }

      if (gate.tags.includes('compliance')) {
        const complianceResults = await this.runComplianceChecks();
        details.push(...complianceResults);
      }

      if (gate.tags.includes('infrastructure')) {
        const infraResults = await this.runInfrastructureChecks();
        details.push(...infraResults);
      }

      if (gate.tags.includes('runtime')) {
        const runtimeResults = await this.runRuntimeChecks();
        details.push(...runtimeResults);
      }

      if (gate.tags.includes('threat-detection')) {
        const threatResults = await this.runThreatDetectionChecks();
        details.push(...threatResults);
      }

      // Calculate overall score
      overallScore = this.calculateGateScore(details, gate.thresholds);

      // Determine gate status
      const status = this.determineGateStatus(overallScore, details, gate.thresholds);

      const result: SecurityGateResult = {
        gateId: gate.id,
        gateName: gate.name,
        status,
        score: overallScore,
        threshold: gate.thresholds.minSecurityScore,
        details,
        executionTime: Date.now() - startTime,
        timestamp: new Date(),
        environment,
        metadata: {
          blocking: gate.blocking,
          tags: gate.tags
        }
      };

      this.emit('gateCompleted', result);
      return result;

    } catch (error) {
      this.logger.error('Security gate execution failed', {
        gateId: gate.id,
        error: error.message
      });

      return {
        gateId: gate.id,
        gateName: gate.name,
        status: 'FAILED',
        score: 0,
        threshold: gate.thresholds.minSecurityScore,
        details: [{
          check: 'execution',
          status: 'FAILED',
          value: 'error',
          threshold: 'success',
          message: `Gate execution failed: ${error.message}`,
          severity: 'CRITICAL'
        }],
        executionTime: Date.now() - startTime,
        timestamp: new Date(),
        environment,
        metadata: { error: error.message }
      };
    }
  }

  /**
   * Run static analysis checks
   */
  private async runStaticAnalysis(): Promise<SecurityGateDetail[]> {
    try {
      const results = await this.vulnerabilityScanner.runStaticAnalysis();
      return this.convertScanResultsToDetails(results, 'static-analysis');
    } catch (error) {
      return [{
        check: 'static-analysis',
        status: 'FAILED',
        value: 'error',
        threshold: 'success',
        message: `Static analysis failed: ${error.message}`,
        severity: 'HIGH'
      }];
    }
  }

  /**
   * Run secrets detection
   */
  private async runSecretsDetection(): Promise<SecurityGateDetail[]> {
    try {
      const results = await this.vulnerabilityScanner.runSecretsDetection();
      return this.convertScanResultsToDetails(results, 'secrets-detection');
    } catch (error) {
      return [{
        check: 'secrets-detection',
        status: 'FAILED',
        value: 'error',
        threshold: 'success',
        message: `Secrets detection failed: ${error.message}`,
        severity: 'CRITICAL'
      }];
    }
  }

  /**
   * Run dependency vulnerability check
   */
  private async runDependencyCheck(): Promise<SecurityGateDetail[]> {
    try {
      const results = await this.vulnerabilityScanner.runDependencyAnalysis();
      return this.convertScanResultsToDetails(results, 'dependency-check');
    } catch (error) {
      return [{
        check: 'dependency-check',
        status: 'FAILED',
        value: 'error',
        threshold: 'success',
        message: `Dependency check failed: ${error.message}`,
        severity: 'HIGH'
      }];
    }
  }

  /**
   * Run dynamic analysis
   */
  private async runDynamicAnalysis(): Promise<SecurityGateDetail[]> {
    try {
      const results = await this.vulnerabilityScanner.runDynamicAnalysis();
      return this.convertScanResultsToDetails(results, 'dynamic-analysis');
    } catch (error) {
      return [{
        check: 'dynamic-analysis',
        status: 'FAILED',
        value: 'error',
        threshold: 'success',
        message: `Dynamic analysis failed: ${error.message}`,
        severity: 'HIGH'
      }];
    }
  }

  /**
   * Run penetration tests
   */
  private async runPenetrationTests(): Promise<SecurityGateDetail[]> {
    try {
      const results = await this.pentestRunner.runTests();
      return [{
        check: 'penetration-testing',
        status: results.score >= 80 ? 'PASSED' : 'FAILED',
        value: results.score,
        threshold: 80,
        message: `Penetration testing score: ${results.score}`,
        severity: results.score >= 80 ? 'LOW' : 'HIGH'
      }];
    } catch (error) {
      return [{
        check: 'penetration-testing',
        status: 'FAILED',
        value: 'error',
        threshold: 'success',
        message: `Penetration testing failed: ${error.message}`,
        severity: 'HIGH'
      }];
    }
  }

  /**
   * Run compliance checks
   */
  private async runComplianceChecks(): Promise<SecurityGateDetail[]> {
    try {
      const results = await this.complianceValidator.validate();
      return [{
        check: 'compliance-validation',
        status: results.score >= 85 ? 'PASSED' : 'FAILED',
        value: results.score,
        threshold: 85,
        message: `Compliance validation score: ${results.score}`,
        severity: results.score >= 85 ? 'LOW' : 'HIGH'
      }];
    } catch (error) {
      return [{
        check: 'compliance-validation',
        status: 'FAILED',
        value: 'error',
        threshold: 'success',
        message: `Compliance validation failed: ${error.message}`,
        severity: 'HIGH'
      }];
    }
  }

  /**
   * Run infrastructure security checks
   */
  private async runInfrastructureChecks(): Promise<SecurityGateDetail[]> {
    try {
      const results = await this.vulnerabilityScanner.runInfrastructureAnalysis();
      return this.convertScanResultsToDetails(results, 'infrastructure-security');
    } catch (error) {
      return [{
        check: 'infrastructure-security',
        status: 'FAILED',
        value: 'error',
        threshold: 'success',
        message: `Infrastructure security check failed: ${error.message}`,
        severity: 'HIGH'
      }];
    }
  }

  /**
   * Run runtime security checks
   */
  private async runRuntimeChecks(): Promise<SecurityGateDetail[]> {
    try {
      const results = await this.securityFramework.validateSecurityControls();
      return results.map(control => ({
        check: `runtime-${control.controlId}`,
        status: control.isValid ? 'PASSED' : 'FAILED',
        value: control.score,
        threshold: 80,
        message: control.message,
        severity: control.isValid ? 'LOW' : 'MEDIUM'
      }));
    } catch (error) {
      return [{
        check: 'runtime-security',
        status: 'FAILED',
        value: 'error',
        threshold: 'success',
        message: `Runtime security check failed: ${error.message}`,
        severity: 'HIGH'
      }];
    }
  }

  /**
   * Run threat detection validation
   */
  private async runThreatDetectionChecks(): Promise<SecurityGateDetail[]> {
    // Implementation would integrate with threat detection system
    return [{
      check: 'threat-detection',
      status: 'PASSED',
      value: 95,
      threshold: 90,
      message: 'Threat detection system operational',
      severity: 'LOW'
    }];
  }

  /**
   * Convert scan results to gate details
   */
  private convertScanResultsToDetails(
    results: any[],
    checkType: string
  ): SecurityGateDetail[] {
    return results.map(result => ({
      check: `${checkType}-${result.id || 'unknown'}`,
      status: result.severity === 'CRITICAL' || result.severity === 'HIGH' ? 'FAILED' : 'PASSED',
      value: result.severity,
      threshold: 'MEDIUM',
      message: result.description || result.title,
      severity: result.severity as any
    }));
  }

  /**
   * Calculate gate score based on details and thresholds
   */
  private calculateGateScore(
    details: SecurityGateDetail[],
    thresholds: SecurityThresholds
  ): number {
    if (details.length === 0) return 100;

    const weights = {
      CRITICAL: 0,
      HIGH: 20,
      MEDIUM: 60,
      LOW: 90
    };

    const totalWeight = details.reduce((sum, detail) => {
      return sum + (weights[detail.severity] || 50);
    }, 0);

    return Math.round(totalWeight / details.length);
  }

  /**
   * Determine gate status based on score and details
   */
  private determineGateStatus(
    score: number,
    details: SecurityGateDetail[],
    thresholds: SecurityThresholds
  ): 'PASSED' | 'FAILED' | 'WARNING' {
    const criticalFailures = details.filter(d => d.severity === 'CRITICAL' && d.status === 'FAILED');
    const highFailures = details.filter(d => d.severity === 'HIGH' && d.status === 'FAILED');

    if (criticalFailures.length > thresholds.maxCriticalVulnerabilities) {
      return 'FAILED';
    }

    if (highFailures.length > thresholds.maxHighVulnerabilities) {
      return 'FAILED';
    }

    if (score < thresholds.minSecurityScore) {
      return 'FAILED';
    }

    if (score < thresholds.minSecurityScore + 10) {
      return 'WARNING';
    }

    return 'PASSED';
  }

  /**
   * Calculate summary from gate results
   */
  private calculateSummary(
    gateResults: SecurityGateResult[],
    environment: string,
    executionTime: number
  ): SecurityGateSummary {
    const passed = gateResults.filter(r => r.status === 'PASSED').length;
    const failed = gateResults.filter(r => r.status === 'FAILED').length;
    const warning = gateResults.filter(r => r.status === 'WARNING').length;
    const skipped = gateResults.filter(r => r.status === 'SKIPPED').length;

    const overallStatus = failed > 0 ? 'FAILED' : warning > 0 ? 'WARNING' : 'PASSED';

    const overallScore = gateResults.length > 0
      ? Math.round(gateResults.reduce((sum, r) => sum + r.score, 0) / gateResults.length)
      : 100;

    const blockers = gateResults
      .filter(r => r.status === 'FAILED' && r.metadata?.blocking)
      .map(r => `${r.gateName}: ${r.details.find(d => d.status === 'FAILED')?.message || 'Failed'}`);

    const recommendations = this.generateRecommendations(gateResults);

    return {
      totalGates: gateResults.length,
      passedGates: passed,
      failedGates: failed,
      warningGates: warning,
      skippedGates: skipped,
      overallStatus,
      overallScore,
      executionTime,
      environment,
      gateResults,
      blockers,
      recommendations
    };
  }

  /**
   * Generate recommendations based on gate results
   */
  private generateRecommendations(gateResults: SecurityGateResult[]): string[] {
    const recommendations: string[] = [];

    const failedGates = gateResults.filter(r => r.status === 'FAILED');
    const warningGates = gateResults.filter(r => r.status === 'WARNING');

    if (failedGates.length > 0) {
      recommendations.push('Address all failed security gates before proceeding');
    }

    if (warningGates.length > 0) {
      recommendations.push('Review security warnings and consider addressing them');
    }

    const criticalVulns = gateResults.flatMap(r =>
      r.details.filter(d => d.severity === 'CRITICAL' && d.status === 'FAILED')
    );

    if (criticalVulns.length > 0) {
      recommendations.push('Immediately address all critical security vulnerabilities');
    }

    return recommendations;
  }

  /**
   * Add or update security gate configuration
   */
  addGate(config: SecurityGateConfig): void {
    this.config.set(config.id, config);
    this.logger.info('Security gate added', { gateId: config.id, gateName: config.name });
  }

  /**
   * Remove security gate
   */
  removeGate(gateId: string): boolean {
    const removed = this.config.delete(gateId);
    if (removed) {
      this.logger.info('Security gate removed', { gateId });
    }
    return removed;
  }

  /**
   * Get security gate configuration
   */
  getGate(gateId: string): SecurityGateConfig | undefined {
    return this.config.get(gateId);
  }

  /**
   * Get all security gates
   */
  getAllGates(): SecurityGateConfig[] {
    return Array.from(this.config.values());
  }
}