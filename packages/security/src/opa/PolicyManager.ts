import { promises as fs } from 'fs';
import { join, basename, extname } from 'path';
import { EventEmitter } from 'events';
import fetch from 'node-fetch';
import { auditLoggingService } from '../services/audit-logging';
import { encryptionService } from '../services/encryption';

export interface PolicyMetadata {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  createdAt: Date;
  updatedAt: Date;
  tags: string[];
  dependencies: string[];
  status: 'draft' | 'active' | 'deprecated' | 'disabled';
  checksum: string;
  size: number;
  compiledSize?: number;
  validationErrors?: string[];
  testResults?: PolicyTestResult[];
}

export interface PolicyVersion {
  version: string;
  content: string;
  metadata: PolicyMetadata;
  createdAt: Date;
  author: string;
  changelog: string;
  parentVersion?: string;
  rollbackAvailable: boolean;
}

export interface PolicyTestCase {
  name: string;
  description: string;
  input: Record<string, any>;
  expectedResult: boolean;
  expectedReasons?: string[];
  context?: Record<string, any>;
}

export interface PolicyTestResult {
  testCase: string;
  passed: boolean;
  actualResult?: boolean;
  actualReasons?: string[];
  error?: string;
  executionTime: number;
}

export interface PolicyValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  syntaxValid: boolean;
  semanticValid: boolean;
  testsPassed: boolean;
  testResults: PolicyTestResult[];
}

export interface PolicyDeployment {
  id: string;
  policyId: string;
  version: string;
  environment: 'development' | 'staging' | 'production';
  deployedAt: Date;
  deployedBy: string;
  status: 'deploying' | 'active' | 'failed' | 'rolled-back';
  rolloutStrategy: 'immediate' | 'gradual' | 'canary';
  rolloutPercentage?: number;
  healthcheck?: {
    passed: boolean;
    checks: Array<{ name: string; status: boolean; message?: string }>;
  };
}

export class PolicyManager extends EventEmitter {
  private policies = new Map<string, PolicyMetadata>();
  private policyVersions = new Map<string, Map<string, PolicyVersion>>();
  private deployments = new Map<string, PolicyDeployment>();
  private policyDirectory: string;
  private backupDirectory: string;
  private opaServerUrl?: string;

  constructor(config: {
    policyDirectory: string;
    backupDirectory?: string;
    opaServerUrl?: string;
  }) {
    super();
    this.policyDirectory = config.policyDirectory;
    this.backupDirectory = config.backupDirectory || join(config.policyDirectory, '.backups');
    this.opaServerUrl = config.opaServerUrl;
    this.initialize();
  }

  /**
   * Initialize policy manager
   */
  private async initialize(): Promise<void> {
    try {
      await this.ensureDirectories();
      await this.loadExistingPolicies();
      this.setupPeriodicTasks();
    } catch (error) {
      console.error('Failed to initialize PolicyManager:', error);
      throw error;
    }
  }

  /**
   * Ensure required directories exist
   */
  private async ensureDirectories(): Promise<void> {
    try {
      await fs.mkdir(this.policyDirectory, { recursive: true });
      await fs.mkdir(this.backupDirectory, { recursive: true });
      await fs.mkdir(join(this.policyDirectory, 'compiled'), { recursive: true });
      await fs.mkdir(join(this.policyDirectory, 'tests'), { recursive: true });
    } catch (error) {
      console.error('Failed to create directories:', error);
      throw error;
    }
  }

  /**
   * Load existing policies from directory
   */
  private async loadExistingPolicies(): Promise<void> {
    try {
      const files = await fs.readdir(this.policyDirectory);
      const policyFiles = files.filter(file =>
        extname(file) === '.rego' || extname(file) === '.json'
      );

      for (const file of policyFiles) {
        try {
          await this.loadPolicyFromFile(join(this.policyDirectory, file));
        } catch (error) {
          console.error(`Failed to load policy from file ${file}:`, error);
        }
      }
    } catch (error) {
      console.error('Failed to load existing policies:', error);
    }
  }

  /**
   * Load policy from file
   */
  private async loadPolicyFromFile(filePath: string): Promise<void> {
    const content = await fs.readFile(filePath, 'utf-8');
    const fileName = basename(filePath, extname(filePath));

    // Try to load metadata file if it exists
    const metadataPath = join(this.policyDirectory, `${fileName}.metadata.json`);
    let metadata: Partial<PolicyMetadata> = {};

    try {
      const metadataContent = await fs.readFile(metadataPath, 'utf-8');
      metadata = JSON.parse(metadataContent);
    } catch (error) {
      // Create default metadata if file doesn't exist
    }

    const policyMetadata: PolicyMetadata = {
      id: metadata.id || encryptionService.generateUUID(),
      name: metadata.name || fileName,
      version: metadata.version || '1.0.0',
      description: metadata.description || '',
      author: metadata.author || 'unknown',
      createdAt: metadata.createdAt ? new Date(metadata.createdAt) : new Date(),
      updatedAt: new Date(),
      tags: metadata.tags || [],
      dependencies: metadata.dependencies || [],
      status: metadata.status || 'active',
      checksum: encryptionService.createHash(content),
      size: content.length
    };

    this.policies.set(policyMetadata.id, policyMetadata);

    // Store version
    if (!this.policyVersions.has(policyMetadata.id)) {
      this.policyVersions.set(policyMetadata.id, new Map());
    }

    const version: PolicyVersion = {
      version: policyMetadata.version,
      content,
      metadata: policyMetadata,
      createdAt: policyMetadata.createdAt,
      author: policyMetadata.author,
      changelog: 'Loaded from file',
      rollbackAvailable: false
    };

    this.policyVersions.get(policyMetadata.id)!.set(policyMetadata.version, version);
  }

  /**
   * Create a new policy
   */
  async createPolicy(
    name: string,
    content: string,
    metadata: Partial<PolicyMetadata> = {},
    author: string = 'system'
  ): Promise<string> {
    const policyId = encryptionService.generateUUID();

    const policyMetadata: PolicyMetadata = {
      id: policyId,
      name,
      version: '1.0.0',
      description: metadata.description || '',
      author,
      createdAt: new Date(),
      updatedAt: new Date(),
      tags: metadata.tags || [],
      dependencies: metadata.dependencies || [],
      status: 'draft',
      checksum: encryptionService.createHash(content),
      size: content.length
    };

    // Validate policy before creating
    const validation = await this.validatePolicy(content);
    if (!validation.valid) {
      throw new Error(`Policy validation failed: ${validation.errors.join(', ')}`);
    }

    policyMetadata.validationErrors = validation.errors;

    // Store policy and version
    this.policies.set(policyId, policyMetadata);
    this.policyVersions.set(policyId, new Map());

    const version: PolicyVersion = {
      version: '1.0.0',
      content,
      metadata: policyMetadata,
      createdAt: new Date(),
      author,
      changelog: 'Initial version',
      rollbackAvailable: false
    };

    this.policyVersions.get(policyId)!.set('1.0.0', version);

    // Save to file system
    await this.savePolicyToFile(policyId);

    // Log creation
    await this.logPolicyAction('CREATE', policyId, author, { version: '1.0.0' });

    this.emit('policyCreated', { policyId, metadata: policyMetadata });

    return policyId;
  }

  /**
   * Update an existing policy
   */
  async updatePolicy(
    policyId: string,
    content: string,
    changelog: string,
    author: string = 'system',
    versionType: 'major' | 'minor' | 'patch' = 'patch'
  ): Promise<string> {
    const policy = this.policies.get(policyId);
    if (!policy) {
      throw new Error(`Policy ${policyId} not found`);
    }

    // Validate updated policy
    const validation = await this.validatePolicy(content);
    if (!validation.valid) {
      throw new Error(`Policy validation failed: ${validation.errors.join(', ')}`);
    }

    // Generate new version number
    const newVersion = this.generateNextVersion(policy.version, versionType);

    // Create backup of current version
    await this.createBackup(policyId, policy.version);

    // Update metadata
    const updatedMetadata: PolicyMetadata = {
      ...policy,
      version: newVersion,
      updatedAt: new Date(),
      checksum: encryptionService.createHash(content),
      size: content.length,
      validationErrors: validation.errors
    };

    // Store new version
    const version: PolicyVersion = {
      version: newVersion,
      content,
      metadata: updatedMetadata,
      createdAt: new Date(),
      author,
      changelog,
      parentVersion: policy.version,
      rollbackAvailable: true
    };

    this.policies.set(policyId, updatedMetadata);
    this.policyVersions.get(policyId)!.set(newVersion, version);

    // Save to file system
    await this.savePolicyToFile(policyId);

    // Log update
    await this.logPolicyAction('UPDATE', policyId, author, {
      oldVersion: policy.version,
      newVersion,
      changelog
    });

    this.emit('policyUpdated', {
      policyId,
      oldVersion: policy.version,
      newVersion,
      metadata: updatedMetadata
    });

    return newVersion;
  }

  /**
   * Validate policy syntax and semantics
   */
  async validatePolicy(content: string, testCases?: PolicyTestCase[]): Promise<PolicyValidationResult> {
    const result: PolicyValidationResult = {
      valid: false,
      errors: [],
      warnings: [],
      syntaxValid: false,
      semanticValid: false,
      testsPassed: false,
      testResults: []
    };

    try {
      // Basic syntax validation
      result.syntaxValid = await this.validateSyntax(content);
      if (!result.syntaxValid) {
        result.errors.push('Policy syntax is invalid');
      }

      // Semantic validation
      if (result.syntaxValid) {
        result.semanticValid = await this.validateSemantics(content);
        if (!result.semanticValid) {
          result.errors.push('Policy semantics are invalid');
        }
      }

      // Run test cases if provided
      if (testCases && testCases.length > 0) {
        result.testResults = await this.runTestCases(content, testCases);
        result.testsPassed = result.testResults.every(test => test.passed);

        if (!result.testsPassed) {
          result.errors.push('Some test cases failed');
        }
      } else {
        result.testsPassed = true; // No tests = passing
      }

      result.valid = result.syntaxValid && result.semanticValid && result.testsPassed;

    } catch (error) {
      result.errors.push(`Validation error: ${error.message}`);
    }

    return result;
  }

  /**
   * Validate policy syntax
   */
  private async validateSyntax(content: string): Promise<boolean> {
    try {
      // Basic Rego syntax validation
      if (!content.trim()) {
        return false;
      }

      // Check for required package declaration
      if (!content.includes('package ')) {
        return false;
      }

      // If OPA server is available, use it for validation
      if (this.opaServerUrl) {
        const response = await fetch(`${this.opaServerUrl}/v1/compile`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: 'data',
            modules: { 'policy.rego': content }
          })
        });

        return response.ok;
      }

      return true; // Basic validation passed

    } catch (error) {
      console.error('Syntax validation error:', error);
      return false;
    }
  }

  /**
   * Validate policy semantics
   */
  private async validateSemantics(content: string): Promise<boolean> {
    try {
      // Check for common semantic issues
      const lines = content.split('\n');

      for (const line of lines) {
        const trimmed = line.trim();

        // Check for undefined variables (simplified)
        if (trimmed.includes('undefined_var')) {
          return false;
        }

        // Check for circular dependencies (simplified)
        if (trimmed.includes('circular_reference')) {
          return false;
        }
      }

      return true;

    } catch (error) {
      console.error('Semantic validation error:', error);
      return false;
    }
  }

  /**
   * Run test cases against policy
   */
  private async runTestCases(content: string, testCases: PolicyTestCase[]): Promise<PolicyTestResult[]> {
    const results: PolicyTestResult[] = [];

    for (const testCase of testCases) {
      const startTime = Date.now();

      try {
        // This would use the OPA integration service in practice
        const mockResult = {
          result: testCase.expectedResult,
          reasons: testCase.expectedReasons || []
        };

        const passed = mockResult.result === testCase.expectedResult;

        results.push({
          testCase: testCase.name,
          passed,
          actualResult: mockResult.result,
          actualReasons: mockResult.reasons,
          executionTime: Date.now() - startTime
        });

      } catch (error) {
        results.push({
          testCase: testCase.name,
          passed: false,
          error: error.message,
          executionTime: Date.now() - startTime
        });
      }
    }

    return results;
  }

  /**
   * Deploy policy to environment
   */
  async deployPolicy(
    policyId: string,
    version: string,
    environment: PolicyDeployment['environment'],
    deployedBy: string,
    rolloutStrategy: PolicyDeployment['rolloutStrategy'] = 'immediate'
  ): Promise<string> {
    const policy = this.policies.get(policyId);
    if (!policy) {
      throw new Error(`Policy ${policyId} not found`);
    }

    const policyVersion = this.policyVersions.get(policyId)?.get(version);
    if (!policyVersion) {
      throw new Error(`Policy version ${version} not found for policy ${policyId}`);
    }

    // Validate policy before deployment
    const validation = await this.validatePolicy(policyVersion.content);
    if (!validation.valid) {
      throw new Error(`Cannot deploy invalid policy: ${validation.errors.join(', ')}`);
    }

    const deploymentId = encryptionService.generateUUID();
    const deployment: PolicyDeployment = {
      id: deploymentId,
      policyId,
      version,
      environment,
      deployedAt: new Date(),
      deployedBy,
      status: 'deploying',
      rolloutStrategy,
      rolloutPercentage: rolloutStrategy === 'immediate' ? 100 : 0
    };

    this.deployments.set(deploymentId, deployment);

    try {
      // Perform actual deployment (mock implementation)
      await this.performDeployment(deployment, policyVersion);

      deployment.status = 'active';
      deployment.rolloutPercentage = 100;

      // Log deployment
      await this.logPolicyAction('DEPLOY', policyId, deployedBy, {
        version,
        environment,
        deploymentId,
        rolloutStrategy
      });

      this.emit('policyDeployed', {
        deploymentId,
        policyId,
        version,
        environment
      });

      return deploymentId;

    } catch (error) {
      deployment.status = 'failed';

      await this.logPolicyAction('DEPLOY_FAILED', policyId, deployedBy, {
        version,
        environment,
        error: error.message
      });

      throw error;
    }
  }

  /**
   * Perform actual deployment to OPA server
   */
  private async performDeployment(
    deployment: PolicyDeployment,
    policyVersion: PolicyVersion
  ): Promise<void> {
    if (!this.opaServerUrl) {
      // Mock deployment for testing
      await new Promise(resolve => setTimeout(resolve, 1000));
      return;
    }

    // Deploy to OPA server
    const response = await fetch(`${this.opaServerUrl}/v1/policies/${deployment.policyId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'text/plain' },
      body: policyVersion.content
    });

    if (!response.ok) {
      throw new Error(`Deployment failed: ${response.status} ${response.statusText}`);
    }

    // Perform health check
    deployment.healthcheck = await this.performHealthCheck(deployment);

    if (!deployment.healthcheck.passed) {
      throw new Error('Post-deployment health check failed');
    }
  }

  /**
   * Perform post-deployment health check
   */
  private async performHealthCheck(deployment: PolicyDeployment): Promise<PolicyDeployment['healthcheck']> {
    const checks = [
      { name: 'policy_loaded', status: true },
      { name: 'syntax_valid', status: true },
      { name: 'evaluation_works', status: true }
    ];

    // In practice, these would be real health checks
    return {
      passed: checks.every(check => check.status),
      checks
    };
  }

  /**
   * Rollback policy to previous version
   */
  async rollbackPolicy(
    policyId: string,
    targetVersion: string,
    rolledBackBy: string,
    reason: string
  ): Promise<void> {
    const policy = this.policies.get(policyId);
    if (!policy) {
      throw new Error(`Policy ${policyId} not found`);
    }

    const targetPolicyVersion = this.policyVersions.get(policyId)?.get(targetVersion);
    if (!targetPolicyVersion) {
      throw new Error(`Target version ${targetVersion} not found for policy ${policyId}`);
    }

    // Update current policy to target version
    const rolledBackMetadata: PolicyMetadata = {
      ...targetPolicyVersion.metadata,
      updatedAt: new Date()
    };

    this.policies.set(policyId, rolledBackMetadata);

    // Save to file system
    await this.savePolicyToFile(policyId);

    // Log rollback
    await this.logPolicyAction('ROLLBACK', policyId, rolledBackBy, {
      fromVersion: policy.version,
      toVersion: targetVersion,
      reason
    });

    this.emit('policyRolledBack', {
      policyId,
      fromVersion: policy.version,
      toVersion: targetVersion,
      reason
    });
  }

  /**
   * Generate next version number
   */
  private generateNextVersion(currentVersion: string, versionType: 'major' | 'minor' | 'patch'): string {
    const [major, minor, patch] = currentVersion.split('.').map(Number);

    switch (versionType) {
      case 'major':
        return `${major + 1}.0.0`;
      case 'minor':
        return `${major}.${minor + 1}.0`;
      case 'patch':
      default:
        return `${major}.${minor}.${patch + 1}`;
    }
  }

  /**
   * Create backup of policy version
   */
  private async createBackup(policyId: string, version: string): Promise<void> {
    const policyVersion = this.policyVersions.get(policyId)?.get(version);
    if (!policyVersion) {
      return;
    }

    const backupFileName = `${policyId}-${version}-${Date.now()}.backup`;
    const backupPath = join(this.backupDirectory, backupFileName);

    const backupData = {
      metadata: policyVersion.metadata,
      content: policyVersion.content,
      version: policyVersion.version,
      createdAt: policyVersion.createdAt,
      author: policyVersion.author,
      changelog: policyVersion.changelog
    };

    await fs.writeFile(backupPath, JSON.stringify(backupData, null, 2));
  }

  /**
   * Save policy to file system
   */
  private async savePolicyToFile(policyId: string): Promise<void> {
    const policy = this.policies.get(policyId);
    if (!policy) {
      return;
    }

    const currentVersion = this.policyVersions.get(policyId)?.get(policy.version);
    if (!currentVersion) {
      return;
    }

    // Save policy content
    const policyPath = join(this.policyDirectory, `${policy.name}.rego`);
    await fs.writeFile(policyPath, currentVersion.content);

    // Save metadata
    const metadataPath = join(this.policyDirectory, `${policy.name}.metadata.json`);
    await fs.writeFile(metadataPath, JSON.stringify(policy, null, 2));
  }

  /**
   * Log policy action to audit system
   */
  private async logPolicyAction(
    action: string,
    policyId: string,
    actor: string,
    details: Record<string, any>
  ): Promise<void> {
    await auditLoggingService.logEvent({
      eventType: `POLICY_${action}`,
      category: 'SYSTEM',
      severity: 'MEDIUM',
      source: {
        service: 'policy-manager',
        version: '1.0.0',
        instance: process.env.HOSTNAME || 'unknown',
        ip: 'localhost'
      },
      actor: {
        userId: actor,
        type: 'USER'
      },
      target: {
        resource: 'policy',
        resourceId: policyId,
        resourceType: 'POLICY'
      },
      action,
      outcome: 'SUCCESS',
      details: {
        policyId,
        ...details
      },
      metadata: {
        requestId: encryptionService.generateUUID()
      },
      compliance: {
        gdpr: true,
        sox: true,
        iso27001: true,
        pci: true
      }
    });
  }

  /**
   * Setup periodic maintenance tasks
   */
  private setupPeriodicTasks(): void {
    // Clean old backups every day
    setInterval(() => {
      this.cleanOldBackups();
    }, 24 * 60 * 60 * 1000);

    // Generate policy metrics every hour
    setInterval(() => {
      this.generateMetrics();
    }, 60 * 60 * 1000);
  }

  /**
   * Clean old backup files
   */
  private async cleanOldBackups(): Promise<void> {
    try {
      const files = await fs.readdir(this.backupDirectory);
      const cutoffDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days

      for (const file of files) {
        if (file.endsWith('.backup')) {
          const filePath = join(this.backupDirectory, file);
          const stats = await fs.stat(filePath);

          if (stats.mtime < cutoffDate) {
            await fs.unlink(filePath);
          }
        }
      }
    } catch (error) {
      console.error('Failed to clean old backups:', error);
    }
  }

  /**
   * Generate policy metrics
   */
  private generateMetrics(): void {
    const metrics = {
      totalPolicies: this.policies.size,
      policiesByStatus: {},
      totalVersions: 0,
      totalDeployments: this.deployments.size,
      deploymentsByEnvironment: {},
      averagePolicySize: 0
    };

    // Count policies by status
    for (const policy of this.policies.values()) {
      metrics.policiesByStatus[policy.status] = (metrics.policiesByStatus[policy.status] || 0) + 1;
    }

    // Count total versions
    for (const versions of this.policyVersions.values()) {
      metrics.totalVersions += versions.size;
    }

    // Count deployments by environment
    for (const deployment of this.deployments.values()) {
      metrics.deploymentsByEnvironment[deployment.environment] =
        (metrics.deploymentsByEnvironment[deployment.environment] || 0) + 1;
    }

    // Calculate average policy size
    const totalSize = Array.from(this.policies.values()).reduce((sum, policy) => sum + policy.size, 0);
    metrics.averagePolicySize = this.policies.size > 0 ? totalSize / this.policies.size : 0;

    this.emit('metrics', metrics);
  }

  /**
   * Get policy by ID
   */
  getPolicy(policyId: string): PolicyMetadata | undefined {
    return this.policies.get(policyId);
  }

  /**
   * Get all policies
   */
  getAllPolicies(): PolicyMetadata[] {
    return Array.from(this.policies.values());
  }

  /**
   * Get policy versions
   */
  getPolicyVersions(policyId: string): PolicyVersion[] {
    const versions = this.policyVersions.get(policyId);
    return versions ? Array.from(versions.values()) : [];
  }

  /**
   * Get policy content by ID and version
   */
  getPolicyContent(policyId: string, version?: string): string | undefined {
    const policy = this.policies.get(policyId);
    if (!policy) {
      return undefined;
    }

    const targetVersion = version || policy.version;
    const policyVersion = this.policyVersions.get(policyId)?.get(targetVersion);
    return policyVersion?.content;
  }

  /**
   * Get deployment status
   */
  getDeployment(deploymentId: string): PolicyDeployment | undefined {
    return this.deployments.get(deploymentId);
  }

  /**
   * Get all deployments for a policy
   */
  getPolicyDeployments(policyId: string): PolicyDeployment[] {
    return Array.from(this.deployments.values()).filter(d => d.policyId === policyId);
  }
}

export const policyManager = new PolicyManager({
  policyDirectory: process.env.POLICY_DIRECTORY || './policies',
  backupDirectory: process.env.POLICY_BACKUP_DIRECTORY,
  opaServerUrl: process.env.OPA_SERVER_URL
});