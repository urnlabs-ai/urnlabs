/**
 * Workflow Versioning and A/B Testing Framework
 * Implements semantic versioning, A/B testing, and safe rollback procedures
 */

import { 
  WorkflowDefinition, 
  WorkflowVersion, 
  ABTestConfig,
  SuccessCriteria,
  TestResult
} from '@/types/workflow.js';
import * as semver from 'semver';

/**
 * Deployment strategy types
 */
export type DeploymentStrategy = 'blue-green' | 'canary' | 'rolling' | 'immediate';

/**
 * Deployment configuration
 */
export interface DeploymentConfig {
  strategy: DeploymentStrategy;
  canaryPercentage?: number;
  rolloutDuration?: number;
  healthCheckUrl?: string;
  rollbackThreshold?: number;
  autoRollback?: boolean;
}

/**
 * Version comparison result
 */
export interface VersionComparison {
  type: 'major' | 'minor' | 'patch' | 'prerelease' | 'same';
  compatible: boolean;
  breaking: boolean;
  changes: VersionChange[];
}

/**
 * Version change description
 */
export interface VersionChange {
  type: 'added' | 'modified' | 'removed';
  component: 'step' | 'parameter' | 'trigger' | 'metadata';
  path: string;
  description: string;
  breaking: boolean;
}

/**
 * A/B Test Result
 */
export interface ABTestResult {
  testId: string;
  version: string;
  metric: string;
  value: number;
  sampleSize: number;
  confidence: number;
  significantDifference: boolean;
  winner?: string;
}

/**
 * Workflow Versioning Engine
 */
export class VersioningEngine {
  private versions: Map<string, WorkflowVersion[]> = new Map();
  private abTests: Map<string, ABTestConfig> = new Map();

  /**
   * Create new workflow version
   */
  public async createVersion(
    workflowId: string,
    definition: WorkflowDefinition,
    version?: string,
    changeLog?: string
  ): Promise<WorkflowVersion> {
    const existingVersions = this.versions.get(workflowId) || [];
    
    // Auto-generate version if not provided
    if (!version) {
      version = this.generateNextVersion(existingVersions, definition);
    }

    // Validate version format
    if (!semver.valid(version)) {
      throw new Error(`Invalid version format: ${version}`);
    }

    // Check for version conflicts
    if (existingVersions.some(v => v.version === version)) {
      throw new Error(`Version ${version} already exists for workflow ${workflowId}`);
    }

    // Validate definition
    const validationErrors = await this.validateDefinition(definition);
    if (validationErrors.length > 0) {
      throw new Error(`Workflow definition validation failed: ${validationErrors.join(', ')}`);
    }

    // Create version
    const workflowVersion: WorkflowVersion = {
      id: `${workflowId}-${version}`,
      workflowId,
      version,
      definition,
      status: 'draft',
      changeLog: changeLog || '',
      testResults: []
    };

    // Add to versions map
    existingVersions.push(workflowVersion);
    existingVersions.sort((a, b) => semver.rcompare(a.version, b.version));
    this.versions.set(workflowId, existingVersions);

    return workflowVersion;
  }

  /**
   * Deploy workflow version
   */
  public async deployVersion(
    workflowId: string,
    version: string,
    deploymentConfig: DeploymentConfig,
    deployedBy: string
  ): Promise<void> {
    const workflowVersion = this.getVersion(workflowId, version);
    if (!workflowVersion) {
      throw new Error(`Version ${version} not found for workflow ${workflowId}`);
    }

    if (workflowVersion.status !== 'draft') {
      throw new Error(`Cannot deploy version ${version} with status ${workflowVersion.status}`);
    }

    // Execute deployment strategy
    await this.executeDeploymentStrategy(workflowVersion, deploymentConfig);

    // Update version status
    workflowVersion.status = 'active';
    workflowVersion.deployedAt = new Date();
    workflowVersion.deployedBy = deployedBy;

    // Deprecate other active versions
    const versions = this.versions.get(workflowId)!;
    for (const v of versions) {
      if (v.id !== workflowVersion.id && v.status === 'active') {
        v.status = 'deprecated';
      }
    }
  }

  /**
   * Rollback to previous version
   */
  public async rollbackToPreviousVersion(
    workflowId: string,
    targetVersion?: string
  ): Promise<WorkflowVersion> {
    const versions = this.versions.get(workflowId);
    if (!versions || versions.length === 0) {
      throw new Error(`No versions found for workflow ${workflowId}`);
    }

    let targetWorkflowVersion: WorkflowVersion;

    if (targetVersion) {
      // Rollback to specific version
      const foundVersion = versions.find(v => v.version === targetVersion);
      if (!foundVersion) {
        throw new Error(`Target version ${targetVersion} not found`);
      }
      targetWorkflowVersion = foundVersion;
    } else {
      // Rollback to previous active version
      const sortedVersions = versions
        .filter(v => v.status === 'deprecated')
        .sort((a, b) => semver.rcompare(a.version, b.version));
      
      if (sortedVersions.length === 0) {
        throw new Error('No previous version available for rollback');
      }
      
      targetWorkflowVersion = sortedVersions[0];
    }

    // Perform rollback
    await this.performRollback(workflowId, targetWorkflowVersion);

    return targetWorkflowVersion;
  }

  /**
   * Compare two workflow versions
   */
  public compareVersions(
    workflowId: string,
    fromVersion: string,
    toVersion: string
  ): VersionComparison {
    const fromWorkflowVersion = this.getVersion(workflowId, fromVersion);
    const toWorkflowVersion = this.getVersion(workflowId, toVersion);

    if (!fromWorkflowVersion || !toWorkflowVersion) {
      throw new Error('One or both versions not found');
    }

    const versionDiff = semver.diff(fromVersion, toVersion);
    const changes = this.analyzeDefinitionChanges(
      fromWorkflowVersion.definition,
      toWorkflowVersion.definition
    );

    const breaking = changes.some(change => change.breaking);
    const compatible = !breaking && (versionDiff === 'patch' || versionDiff === 'minor');

    return {
      type: versionDiff as any || 'same',
      compatible,
      breaking,
      changes
    };
  }

  /**
   * Create A/B test configuration
   */
  public createABTest(
    workflowId: string,
    testConfig: Omit<ABTestConfig, 'name'>
  ): ABTestConfig {
    const testName = `${workflowId}-${Date.now()}`;
    const abTest: ABTestConfig = {
      name: testName,
      ...testConfig
    };

    // Validate traffic split totals 100%
    const totalTraffic = Object.values(abTest.trafficSplit).reduce((sum, pct) => sum + pct, 0);
    if (Math.abs(totalTraffic - 100) > 0.01) {
      throw new Error(`Traffic split must total 100%, got ${totalTraffic}%`);
    }

    // Validate versions exist
    const versions = this.versions.get(workflowId);
    if (!versions) {
      throw new Error(`No versions found for workflow ${workflowId}`);
    }

    for (const version of Object.keys(abTest.trafficSplit)) {
      if (!versions.some(v => v.version === version)) {
        throw new Error(`Version ${version} not found for workflow ${workflowId}`);
      }
    }

    this.abTests.set(testName, abTest);
    return abTest;
  }

  /**
   * Get version for A/B test traffic routing
   */
  public getVersionForRequest(
    workflowId: string,
    testName?: string,
    userId?: string
  ): string {
    if (!testName) {
      // Return active version
      const versions = this.versions.get(workflowId);
      const activeVersion = versions?.find(v => v.status === 'active');
      return activeVersion?.version || '1.0.0';
    }

    const abTest = this.abTests.get(testName);
    if (!abTest || !abTest.enabled) {
      throw new Error(`A/B test ${testName} not found or disabled`);
    }

    // Check test validity period
    const now = new Date();
    if (now < abTest.startDate || (abTest.endDate && now > abTest.endDate)) {
      throw new Error(`A/B test ${testName} is not active`);
    }

    // Determine version based on traffic split
    return this.selectVersionByTrafficSplit(abTest.trafficSplit, userId);
  }

  /**
   * Analyze A/B test results
   */
  public analyzeABTestResults(
    testName: string,
    results: ABTestResult[]
  ): {
    winner?: string;
    confidence: number;
    recommendation: string;
    detailedResults: ABTestResult[];
  } {
    const abTest = this.abTests.get(testName);
    if (!abTest) {
      throw new Error(`A/B test ${testName} not found`);
    }

    const versions = Object.keys(abTest.trafficSplit);
    const detailedResults: ABTestResult[] = [];

    // Analyze each metric
    for (const metric of abTest.metrics) {
      const metricResults = results.filter(r => r.metric === metric);
      
      if (metricResults.length < 2) {
        continue;
      }

      // Perform statistical analysis
      const analysis = this.performStatisticalAnalysis(metricResults, abTest.successCriteria);
      detailedResults.push(...analysis);
    }

    // Determine overall winner
    const winner = this.determineWinner(detailedResults, abTest.successCriteria);
    const confidence = this.calculateOverallConfidence(detailedResults);

    // Generate recommendation
    let recommendation = 'Continue monitoring';
    if (confidence > 0.95 && winner) {
      recommendation = `Deploy version ${winner}`;
    } else if (confidence > 0.8) {
      recommendation = 'Extend test duration for higher confidence';
    }

    return {
      winner,
      confidence,
      recommendation,
      detailedResults
    };
  }

  /**
   * Generate next semantic version
   */
  private generateNextVersion(
    existingVersions: WorkflowVersion[],
    definition: WorkflowDefinition
  ): string {
    if (existingVersions.length === 0) {
      return '1.0.0';
    }

    const latestVersion = existingVersions[0].version;
    const changes = this.analyzeDefinitionChanges(
      existingVersions[0].definition,
      definition
    );

    if (changes.some(c => c.breaking)) {
      return semver.inc(latestVersion, 'major')!;
    } else if (changes.some(c => c.type === 'added' || c.type === 'modified')) {
      return semver.inc(latestVersion, 'minor')!;
    } else {
      return semver.inc(latestVersion, 'patch')!;
    }
  }

  /**
   * Analyze changes between workflow definitions
   */
  private analyzeDefinitionChanges(
    fromDef: WorkflowDefinition,
    toDef: WorkflowDefinition
  ): VersionChange[] {
    const changes: VersionChange[] = [];

    // Compare steps
    const fromSteps = new Map(fromDef.steps.map(s => [s.id, s]));
    const toSteps = new Map(toDef.steps.map(s => [s.id, s]));

    // Find added steps
    for (const [stepId, step] of toSteps) {
      if (!fromSteps.has(stepId)) {
        changes.push({
          type: 'added',
          component: 'step',
          path: `steps.${stepId}`,
          description: `Added step: ${step.name}`,
          breaking: false
        });
      }
    }

    // Find removed steps
    for (const [stepId, step] of fromSteps) {
      if (!toSteps.has(stepId)) {
        changes.push({
          type: 'removed',
          component: 'step',
          path: `steps.${stepId}`,
          description: `Removed step: ${step.name}`,
          breaking: true
        });
      }
    }

    // Find modified steps
    for (const [stepId, fromStep] of fromSteps) {
      const toStep = toSteps.get(stepId);
      if (toStep && JSON.stringify(fromStep) !== JSON.stringify(toStep)) {
        changes.push({
          type: 'modified',
          component: 'step',
          path: `steps.${stepId}`,
          description: `Modified step: ${toStep.name}`,
          breaking: this.isStepChangeBreaking(fromStep, toStep)
        });
      }
    }

    // Compare parameters
    const fromParams = fromDef.parameters || [];
    const toParams = toDef.parameters || [];

    if (JSON.stringify(fromParams) !== JSON.stringify(toParams)) {
      changes.push({
        type: 'modified',
        component: 'parameter',
        path: 'parameters',
        description: 'Modified workflow parameters',
        breaking: this.isParameterChangeBreaking(fromParams, toParams)
      });
    }

    return changes;
  }

  /**
   * Check if step change is breaking
   */
  private isStepChangeBreaking(fromStep: any, toStep: any): boolean {
    // Changed step type is breaking
    if (fromStep.type !== toStep.type) {
      return true;
    }

    // Added required parameters is breaking
    const fromParams = Object.keys(fromStep.configuration?.parameters || {});
    const toParams = Object.keys(toStep.configuration?.parameters || {});
    
    return toParams.some(param => !fromParams.includes(param));
  }

  /**
   * Check if parameter change is breaking
   */
  private isParameterChangeBreaking(fromParams: any[], toParams: any[]): boolean {
    const fromRequired = fromParams.filter(p => p.required).map(p => p.name);
    const toRequired = toParams.filter(p => p.required).map(p => p.name);
    
    // Adding required parameters is breaking
    return toRequired.some(param => !fromRequired.includes(param));
  }

  /**
   * Execute deployment strategy
   */
  private async executeDeploymentStrategy(
    version: WorkflowVersion,
    config: DeploymentConfig
  ): Promise<void> {
    switch (config.strategy) {
      case 'immediate':
        await this.immediateDeployment(version);
        break;
      case 'blue-green':
        await this.blueGreenDeployment(version, config);
        break;
      case 'canary':
        await this.canaryDeployment(version, config);
        break;
      case 'rolling':
        await this.rollingDeployment(version, config);
        break;
      default:
        throw new Error(`Unknown deployment strategy: ${config.strategy}`);
    }
  }

  /**
   * Immediate deployment
   */
  private async immediateDeployment(version: WorkflowVersion): Promise<void> {
    // Immediate activation - no gradual rollout
    await this.sleep(100); // Simulate deployment time
  }

  /**
   * Blue-green deployment
   */
  private async blueGreenDeployment(
    version: WorkflowVersion,
    config: DeploymentConfig
  ): Promise<void> {
    // Deploy to green environment
    await this.sleep(1000);

    // Health check
    if (config.healthCheckUrl) {
      const healthy = await this.performHealthCheck(config.healthCheckUrl);
      if (!healthy) {
        throw new Error('Health check failed for green environment');
      }
    }

    // Switch traffic to green
    await this.sleep(500);
  }

  /**
   * Canary deployment
   */
  private async canaryDeployment(
    version: WorkflowVersion,
    config: DeploymentConfig
  ): Promise<void> {
    const percentage = config.canaryPercentage || 10;
    const duration = config.rolloutDuration || 300000; // 5 minutes
    
    // Gradual traffic increase
    for (let pct = percentage; pct <= 100; pct += percentage) {
      await this.sleep(duration / (100 / percentage));
      
      // Monitor metrics and auto-rollback if needed
      if (config.autoRollback) {
        const healthy = await this.monitorCanaryHealth(version, config);
        if (!healthy) {
          throw new Error('Canary deployment failed health checks');
        }
      }
    }
  }

  /**
   * Rolling deployment
   */
  private async rollingDeployment(
    version: WorkflowVersion,
    config: DeploymentConfig
  ): Promise<void> {
    const duration = config.rolloutDuration || 600000; // 10 minutes
    
    // Simulate rolling update across instances
    await this.sleep(duration);
  }

  /**
   * Perform rollback
   */
  private async performRollback(
    workflowId: string,
    targetVersion: WorkflowVersion
  ): Promise<void> {
    // Set current active version to deprecated
    const versions = this.versions.get(workflowId)!;
    for (const v of versions) {
      if (v.status === 'active') {
        v.status = 'deprecated';
      }
    }

    // Activate target version
    targetVersion.status = 'active';
    targetVersion.deployedAt = new Date();
  }

  /**
   * Select version by traffic split
   */
  private selectVersionByTrafficSplit(
    trafficSplit: Record<string, number>,
    userId?: string
  ): string {
    // Use user ID for consistent assignment if provided
    const hash = userId ? this.hashString(userId) : Math.random();
    const normalizedHash = Math.abs(hash) % 100;

    let cumulative = 0;
    for (const [version, percentage] of Object.entries(trafficSplit)) {
      cumulative += percentage;
      if (normalizedHash < cumulative) {
        return version;
      }
    }

    // Fallback to first version
    return Object.keys(trafficSplit)[0];
  }

  /**
   * Hash string for consistent user assignment
   */
  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash;
  }

  /**
   * Perform statistical analysis on A/B test results
   */
  private performStatisticalAnalysis(
    results: ABTestResult[],
    criteria: SuccessCriteria[]
  ): ABTestResult[] {
    // Simplified statistical analysis
    // In production, would use proper statistical tests
    return results.map(result => ({
      ...result,
      confidence: 0.95, // Placeholder
      significantDifference: true // Placeholder
    }));
  }

  /**
   * Determine A/B test winner
   */
  private determineWinner(
    results: ABTestResult[],
    criteria: SuccessCriteria[]
  ): string | undefined {
    // Simplified winner determination
    // In production, would use proper statistical significance testing
    const versions = [...new Set(results.map(r => r.version))];
    if (versions.length === 0) return undefined;
    
    return versions[0]; // Placeholder
  }

  /**
   * Calculate overall confidence
   */
  private calculateOverallConfidence(results: ABTestResult[]): number {
    if (results.length === 0) return 0;
    return results.reduce((sum, r) => sum + r.confidence, 0) / results.length;
  }

  /**
   * Get specific version
   */
  private getVersion(workflowId: string, version: string): WorkflowVersion | undefined {
    const versions = this.versions.get(workflowId);
    return versions?.find(v => v.version === version);
  }

  /**
   * Validate workflow definition
   */
  private async validateDefinition(definition: WorkflowDefinition): Promise<string[]> {
    const errors: string[] = [];

    // Basic validation
    if (!definition.id || !definition.name) {
      errors.push('Workflow ID and name are required');
    }

    if (!definition.steps || definition.steps.length === 0) {
      errors.push('Workflow must have at least one step');
    }

    // Additional validation logic would go here

    return errors;
  }

  /**
   * Perform health check
   */
  private async performHealthCheck(url: string): Promise<boolean> {
    // Simulate health check
    await this.sleep(100);
    return true; // Placeholder
  }

  /**
   * Monitor canary health
   */
  private async monitorCanaryHealth(
    version: WorkflowVersion,
    config: DeploymentConfig
  ): Promise<boolean> {
    // Simulate health monitoring
    await this.sleep(100);
    return true; // Placeholder
  }

  /**
   * Sleep utility
   */
  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get all versions for a workflow
   */
  public getVersions(workflowId: string): WorkflowVersion[] {
    return this.versions.get(workflowId) || [];
  }

  /**
   * Get active A/B tests
   */
  public getActiveABTests(): ABTestConfig[] {
    const now = new Date();
    return Array.from(this.abTests.values()).filter(test => 
      test.enabled && 
      now >= test.startDate && 
      (!test.endDate || now <= test.endDate)
    );
  }

  /**
   * Archive old versions
   */
  public archiveOldVersions(workflowId: string, keepCount: number = 5): void {
    const versions = this.versions.get(workflowId);
    if (!versions || versions.length <= keepCount) {
      return;
    }

    const sortedVersions = versions.sort((a, b) => semver.rcompare(a.version, b.version));
    
    for (let i = keepCount; i < sortedVersions.length; i++) {
      if (sortedVersions[i].status !== 'active') {
        sortedVersions[i].status = 'archived';
      }
    }
  }
}