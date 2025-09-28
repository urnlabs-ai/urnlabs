import { PrismaClient } from '@prisma/client';
import {
  CompleteEnhancedPolicy,
  EnhancedPolicyTemplate,
  validateEnhancedPolicy,
  validateEnhancedPolicyTemplate,
  validatePartialEnhancedPolicy,
  EnhancedPolicyValidationError,
  ENHANCED_POLICY_SCHEMA_VERSION
} from '../lib/schemas/enhanced-policy-schemas.js';
import { logger } from '../lib/logger.js';
import { z } from 'zod';
import semver from 'semver';

/**
 * Policy Schema Management Service
 * 
 * Implements comprehensive policy schema management with:
 * - Policy versioning with semantic versioning
 * - Schema validation and migration capabilities
 * - Backward compatibility management
 * - Policy lifecycle management
 */
export class PolicySchemaManagementService {
  private migrationHandlers = new Map<string, (policy: any) => any>();
  private validationCache = new Map<string, { isValid: boolean; errors?: any[]; timestamp: Date }>();
  private readonly cacheTimeout = 5 * 60 * 1000; // 5 minutes

  constructor(private readonly prisma: PrismaClient) {
    this.initializeMigrationHandlers();
  }

  /**
   * Initialize schema migration handlers
   */
  private initializeMigrationHandlers(): void {
    // Migration from version 1.0.0 to 2.0.0
    this.migrationHandlers.set('1.0.0->2.0.0', this.migratePolicyV1ToV2.bind(this));
    
    // Migration from version 2.0.0 to 2.1.0 (future)
    this.migrationHandlers.set('2.0.0->2.1.0', this.migratePolicyV2ToV2_1.bind(this));

    logger.info(`Initialized ${this.migrationHandlers.size} schema migration handlers`);
  }

  /**
   * Validate policy with comprehensive error reporting
   */
  async validatePolicy(
    policy: unknown,
    options: {
      strict?: boolean;
      skipCache?: boolean;
      context?: Record<string, any>;
    } = {}
  ): Promise<{
    isValid: boolean;
    policy?: CompleteEnhancedPolicy;
    errors?: Array<{
      path: string;
      message: string;
      code: string;
      severity: 'error' | 'warning' | 'info';
      suggestion?: string;
    }>;
    warnings?: Array<{
      path: string;
      message: string;
      suggestion?: string;
    }>;
    schemaVersion: string;
    migrationRequired?: boolean;
    migrationPath?: string[];
  }> {
    try {
      const policyId = (policy as any)?.metadata?.id || 'unknown';
      const cacheKey = `${policyId}:${JSON.stringify(policy).slice(0, 100)}`;

      // Check validation cache
      if (!options.skipCache) {
        const cached = this.validationCache.get(cacheKey);
        if (cached && (Date.now() - cached.timestamp.getTime()) < this.cacheTimeout) {
          return {
            isValid: cached.isValid,
            errors: cached.errors,
            schemaVersion: ENHANCED_POLICY_SCHEMA_VERSION
          };
        }
      }

      // Determine current schema version
      const currentVersion = this.detectPolicySchemaVersion(policy);
      
      // Check if migration is required
      const migrationRequired = semver.lt(currentVersion, ENHANCED_POLICY_SCHEMA_VERSION);
      let migrationPath: string[] = [];

      if (migrationRequired) {
        migrationPath = this.calculateMigrationPath(currentVersion, ENHANCED_POLICY_SCHEMA_VERSION);
      }

      // Migrate policy if needed
      let policyToValidate = policy;
      if (migrationRequired && migrationPath.length > 0) {
        try {
          policyToValidate = await this.migratePolicy(policy, migrationPath);
        } catch (migrationError) {
          return {
            isValid: false,
            errors: [{
              path: 'migration',
              message: `Migration failed: ${migrationError.message}`,
              code: 'MIGRATION_FAILED',
              severity: 'error',
              suggestion: 'Please update the policy to the latest schema version'
            }],
            schemaVersion: currentVersion,
            migrationRequired: true,
            migrationPath
          };
        }
      }

      // Validate the policy
      const validatedPolicy = validateEnhancedPolicy(policyToValidate);

      // Perform additional business rule validation
      const businessValidation = await this.validateBusinessRules(validatedPolicy, options.context);

      // Cache successful validation
      this.validationCache.set(cacheKey, {
        isValid: true,
        timestamp: new Date()
      });

      return {
        isValid: true,
        policy: validatedPolicy,
        warnings: businessValidation.warnings,
        schemaVersion: ENHANCED_POLICY_SCHEMA_VERSION,
        migrationRequired,
        migrationPath: migrationRequired ? migrationPath : undefined
      };

    } catch (error) {
      const validationErrors = error instanceof EnhancedPolicyValidationError 
        ? this.formatValidationErrors(error)
        : [{
            path: 'unknown',
            message: error.message,
            code: 'VALIDATION_ERROR',
            severity: 'error' as const
          }];

      // Cache failed validation
      const policyId = (policy as any)?.metadata?.id || 'unknown';
      const cacheKey = `${policyId}:${JSON.stringify(policy).slice(0, 100)}`;
      this.validationCache.set(cacheKey, {
        isValid: false,
        errors: validationErrors,
        timestamp: new Date()
      });

      return {
        isValid: false,
        errors: validationErrors,
        schemaVersion: this.detectPolicySchemaVersion(policy)
      };
    }
  }

  /**
   * Validate policy template
   */
  async validateTemplate(template: unknown): Promise<{
    isValid: boolean;
    template?: EnhancedPolicyTemplate;
    errors?: Array<{
      path: string;
      message: string;
      code: string;
      severity: 'error' | 'warning' | 'info';
    }>;
  }> {
    try {
      const validatedTemplate = validateEnhancedPolicyTemplate(template);

      // Additional template-specific validation
      const templateValidation = await this.validateTemplateSpecificRules(validatedTemplate);

      return {
        isValid: templateValidation.isValid,
        template: templateValidation.isValid ? validatedTemplate : undefined,
        errors: templateValidation.errors
      };

    } catch (error) {
      const validationErrors = error instanceof EnhancedPolicyValidationError 
        ? this.formatValidationErrors(error)
        : [{
            path: 'unknown',
            message: error.message,
            code: 'TEMPLATE_VALIDATION_ERROR',
            severity: 'error' as const
          }];

      return {
        isValid: false,
        errors: validationErrors
      };
    }
  }

  /**
   * Migrate policy to latest schema version
   */
  async migratePolicy(policy: unknown, migrationPath?: string[]): Promise<CompleteEnhancedPolicy> {
    try {
      const currentVersion = this.detectPolicySchemaVersion(policy);
      const targetVersion = ENHANCED_POLICY_SCHEMA_VERSION;

      logger.info('Starting policy migration', {
        policyId: (policy as any)?.metadata?.id,
        fromVersion: currentVersion,
        toVersion: targetVersion
      });

      // Calculate migration path if not provided
      const pathToUse = migrationPath || this.calculateMigrationPath(currentVersion, targetVersion);

      if (pathToUse.length === 0) {
        // No migration needed
        return validateEnhancedPolicy(policy);
      }

      // Apply migrations sequentially
      let migratedPolicy = policy;
      for (const migrationStep of pathToUse) {
        const migrationHandler = this.migrationHandlers.get(migrationStep);
        if (!migrationHandler) {
          throw new Error(`No migration handler found for step: ${migrationStep}`);
        }

        migratedPolicy = migrationHandler(migratedPolicy);
        
        logger.debug('Applied migration step', {
          step: migrationStep,
          policyId: (migratedPolicy as any)?.metadata?.id
        });
      }

      // Validate the migrated policy
      const validatedPolicy = validateEnhancedPolicy(migratedPolicy);

      // Record migration in audit log
      await this.recordMigration({
        policyId: validatedPolicy.metadata.id,
        fromVersion: currentVersion,
        toVersion: targetVersion,
        migrationPath: pathToUse,
        success: true
      });

      logger.info('Policy migration completed successfully', {
        policyId: validatedPolicy.metadata.id,
        fromVersion: currentVersion,
        toVersion: targetVersion
      });

      return validatedPolicy;

    } catch (error) {
      // Record failed migration
      await this.recordMigration({
        policyId: (policy as any)?.metadata?.id || 'unknown',
        fromVersion: this.detectPolicySchemaVersion(policy),
        toVersion: ENHANCED_POLICY_SCHEMA_VERSION,
        migrationPath: migrationPath || [],
        success: false,
        error: error.message
      });

      logger.error('Policy migration failed', {
        policyId: (policy as any)?.metadata?.id,
        error: error.message
      });

      throw error;
    }
  }

  /**
   * Create new policy version
   */
  async createPolicyVersion(
    policyId: string,
    updatedPolicy: Partial<CompleteEnhancedPolicy>,
    changeReason: string,
    changedBy: string
  ): Promise<{
    newVersion: string;
    changes: Array<{
      field: string;
      oldValue: any;
      newValue: any;
      changeType: 'added' | 'modified' | 'removed';
    }>;
  }> {
    try {
      // Get current policy
      const currentPolicy = await this.prisma.policy.findUnique({
        where: { id: policyId },
        include: { versions: { orderBy: { changedAt: 'desc' }, take: 1 } }
      });

      if (!currentPolicy) {
        throw new Error(`Policy not found: ${policyId}`);
      }

      // Calculate next version number
      const currentVersion = currentPolicy.version;
      const nextVersion = semver.inc(currentVersion, 'patch') || '1.0.1';

      // Calculate changes
      const changes = this.calculatePolicyChanges(currentPolicy, updatedPolicy);

      // Validate the updated policy
      const mergedPolicy = this.mergePartialPolicy(currentPolicy, updatedPolicy);
      await this.validatePolicy(mergedPolicy, { strict: true });

      // Create version record
      await this.prisma.policyVersion.create({
        data: {
          id: crypto.randomUUID(),
          policyId,
          version: nextVersion,
          changes: changes.map(change => ({
            field: change.field,
            oldValue: change.oldValue,
            newValue: change.newValue,
            changeType: change.changeType
          })),
          changeReason,
          changedBy,
          changedAt: new Date()
        }
      });

      // Update policy with new version
      await this.prisma.policy.update({
        where: { id: policyId },
        data: {
          version: nextVersion,
          updatedAt: new Date(),
          updatedBy: changedBy,
          // Merge updated fields
          ...(updatedPolicy.metadata && {
            name: updatedPolicy.metadata.name || currentPolicy.name,
            description: updatedPolicy.metadata.description || currentPolicy.description,
            // Add other updatable fields
          }),
          ...(updatedPolicy.definition && {
            rules: updatedPolicy.definition as any
          })
        }
      });

      logger.info('Created new policy version', {
        policyId,
        newVersion: nextVersion,
        changeCount: changes.length,
        changedBy
      });

      return {
        newVersion: nextVersion,
        changes
      };

    } catch (error) {
      logger.error('Failed to create policy version', {
        policyId,
        error: error.message,
        changedBy
      });
      throw error;
    }
  }

  /**
   * Get policy version history
   */
  async getPolicyVersionHistory(policyId: string): Promise<Array<{
    version: string;
    changes: any[];
    changeReason: string;
    changedBy: string;
    changedAt: Date;
    approvedBy?: string;
    approvedAt?: Date;
  }>> {
    try {
      const versions = await this.prisma.policyVersion.findMany({
        where: { policyId },
        orderBy: { changedAt: 'desc' },
        include: {
          changer: { select: { email: true, firstName: true, lastName: true } },
          approver: { select: { email: true, firstName: true, lastName: true } }
        }
      });

      return versions.map(version => ({
        version: version.version,
        changes: version.changes as any[],
        changeReason: version.changeReason,
        changedBy: version.changedBy,
        changedAt: version.changedAt,
        approvedBy: version.approvedBy || undefined,
        approvedAt: version.approvedAt || undefined
      }));

    } catch (error) {
      logger.error('Failed to get policy version history', {
        policyId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Rollback policy to previous version
   */
  async rollbackPolicy(
    policyId: string,
    targetVersion: string,
    rollbackReason: string,
    rolledBackBy: string
  ): Promise<void> {
    try {
      // Get target version data
      const targetVersionRecord = await this.prisma.policyVersion.findFirst({
        where: {
          policyId,
          version: targetVersion
        }
      });

      if (!targetVersionRecord) {
        throw new Error(`Version ${targetVersion} not found for policy ${policyId}`);
      }

      // Get current policy to reconstruct target state
      const currentPolicy = await this.prisma.policy.findUnique({
        where: { id: policyId }
      });

      if (!currentPolicy) {
        throw new Error(`Policy not found: ${policyId}`);
      }

      // Reconstruct policy state at target version
      const targetPolicyState = await this.reconstructPolicyAtVersion(policyId, targetVersion);

      // Create rollback version record
      const rollbackVersion = semver.inc(currentPolicy.version, 'patch') || '1.0.1';
      
      await this.prisma.policyVersion.create({
        data: {
          id: crypto.randomUUID(),
          policyId,
          version: rollbackVersion,
          changes: [{
            field: 'rollback',
            oldValue: currentPolicy.version,
            newValue: targetVersion,
            changeType: 'modified'
          }],
          changeReason: `Rollback to version ${targetVersion}: ${rollbackReason}`,
          changedBy: rolledBackBy,
          changedAt: new Date()
        }
      });

      // Update policy to target state
      await this.prisma.policy.update({
        where: { id: policyId },
        data: {
          version: rollbackVersion,
          rules: targetPolicyState.definition,
          updatedAt: new Date(),
          updatedBy: rolledBackBy
        }
      });

      logger.info('Policy rolled back successfully', {
        policyId,
        targetVersion,
        newVersion: rollbackVersion,
        rolledBackBy
      });

    } catch (error) {
      logger.error('Failed to rollback policy', {
        policyId,
        targetVersion,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Check schema compatibility
   */
  async checkSchemaCompatibility(
    oldVersion: string,
    newVersion: string
  ): Promise<{
    compatible: boolean;
    breakingChanges: string[];
    migrationRequired: boolean;
    migrationPath?: string[];
  }> {
    try {
      const migrationPath = this.calculateMigrationPath(oldVersion, newVersion);
      const breakingChanges: string[] = [];

      // Check for breaking changes based on version differences
      if (semver.major(newVersion) > semver.major(oldVersion)) {
        breakingChanges.push('Major version change - schema structure modifications');
      }

      if (semver.minor(newVersion) > semver.minor(oldVersion)) {
        breakingChanges.push('Minor version change - new fields or deprecated features');
      }

      return {
        compatible: breakingChanges.length === 0,
        breakingChanges,
        migrationRequired: migrationPath.length > 0,
        migrationPath: migrationPath.length > 0 ? migrationPath : undefined
      };

    } catch (error) {
      logger.error('Failed to check schema compatibility', {
        oldVersion,
        newVersion,
        error: error.message
      });

      return {
        compatible: false,
        breakingChanges: [`Compatibility check failed: ${error.message}`],
        migrationRequired: true
      };
    }
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  /**
   * Detect policy schema version
   */
  private detectPolicySchemaVersion(policy: any): string {
    // Check explicit schema version
    if (policy?.metadata?.schemaVersion) {
      return policy.metadata.schemaVersion;
    }

    // Check policy structure to infer version
    if (policy?.definition?.version) {
      return policy.definition.version;
    }

    // Check for enhanced schema features (version 2.0+)
    if (policy?.metadata?.governanceScenarios || 
        policy?.definition?.rules?.[0]?.contextRequirements) {
      return '2.0.0';
    }

    // Default to 1.0.0 for legacy policies
    return '1.0.0';
  }

  /**
   * Calculate migration path between versions
   */
  private calculateMigrationPath(fromVersion: string, toVersion: string): string[] {
    const path: string[] = [];
    
    if (semver.eq(fromVersion, toVersion)) {
      return path;
    }

    // Simple migration path calculation
    // In a real implementation, this would be more sophisticated
    if (semver.lt(fromVersion, '2.0.0') && semver.gte(toVersion, '2.0.0')) {
      path.push('1.0.0->2.0.0');
    }

    if (semver.lt(fromVersion, '2.1.0') && semver.gte(toVersion, '2.1.0')) {
      path.push('2.0.0->2.1.0');
    }

    return path;
  }

  /**
   * Migrate policy from v1.0.0 to v2.0.0
   */
  private migratePolicyV1ToV2(policy: any): any {
    const migrated = JSON.parse(JSON.stringify(policy));

    // Add new metadata fields
    migrated.metadata = {
      ...migrated.metadata,
      schemaVersion: '2.0.0',
      securityLevel: migrated.metadata.riskLevel || 'medium',
      lifecycleStage: 'production',
      governanceScenarios: [],
      businessCriticality: 'medium',
      customFields: {},
      extensions: {}
    };

    // Enhance policy definition
    if (migrated.definition?.rules) {
      migrated.definition.rules = migrated.definition.rules.map((rule: any) => ({
        ...rule,
        id: rule.id || crypto.randomUUID(),
        contextRequirements: rule.contextRequirements || {
          authentication: 'basic',
          authorization: 'rbac',
          encryption: 'none',
          audit: true
        }
      }));
    }

    return migrated;
  }

  /**
   * Migrate policy from v2.0.0 to v2.1.0 (future migration)
   */
  private migratePolicyV2ToV2_1(policy: any): any {
    const migrated = JSON.parse(JSON.stringify(policy));
    
    // Future migration logic would go here
    migrated.metadata.schemaVersion = '2.1.0';
    
    return migrated;
  }

  /**
   * Validate business rules
   */
  private async validateBusinessRules(
    policy: CompleteEnhancedPolicy,
    context?: Record<string, any>
  ): Promise<{
    warnings: Array<{
      path: string;
      message: string;
      suggestion?: string;
    }>;
  }> {
    const warnings: Array<{ path: string; message: string; suggestion?: string; }> = [];

    // Check for policy conflicts
    if (context?.organizationId) {
      const conflictingPolicies = await this.findConflictingPolicies(policy, context.organizationId);
      if (conflictingPolicies.length > 0) {
        warnings.push({
          path: 'metadata',
          message: `Found ${conflictingPolicies.length} potentially conflicting policies`,
          suggestion: 'Review policy conflicts and resolve overlapping rules'
        });
      }
    }

    // Check for compliance framework consistency
    if (policy.metadata.complianceFrameworks.length > 0) {
      const frameworkConsistency = this.validateComplianceFrameworkConsistency(policy);
      if (!frameworkConsistency.isConsistent) {
        warnings.push({
          path: 'metadata.complianceFrameworks',
          message: frameworkConsistency.message,
          suggestion: frameworkConsistency.suggestion
        });
      }
    }

    return { warnings };
  }

  /**
   * Find conflicting policies
   */
  private async findConflictingPolicies(
    policy: CompleteEnhancedPolicy,
    organizationId: string
  ): Promise<string[]> {
    try {
      // Simplified conflict detection - in reality this would be more sophisticated
      const existingPolicies = await this.prisma.policy.findMany({
        where: {
          organizationId,
          status: 'active',
          type: policy.definition.type,
          id: { not: policy.metadata.id }
        },
        select: { id: true, name: true }
      });

      // For now, just return IDs - real implementation would analyze rule conflicts
      return existingPolicies.map(p => p.id);

    } catch (error) {
      logger.warn('Failed to check policy conflicts', { error: error.message });
      return [];
    }
  }

  /**
   * Validate compliance framework consistency
   */
  private validateComplianceFrameworkConsistency(policy: CompleteEnhancedPolicy): {
    isConsistent: boolean;
    message: string;
    suggestion?: string;
  } {
    const frameworks = policy.metadata.complianceFrameworks;
    
    // Check for conflicting frameworks
    const hasGdpr = frameworks.includes('GDPR');
    const hasCcpa = frameworks.includes('CCPA');
    
    if (hasGdpr && hasCcpa && policy.definition.type === 'data_retention') {
      return {
        isConsistent: false,
        message: 'GDPR and CCPA have different data retention requirements',
        suggestion: 'Consider creating separate policies or using the most restrictive requirements'
      };
    }

    return {
      isConsistent: true,
      message: 'Compliance frameworks are consistent'
    };
  }

  /**
   * Validate template-specific rules
   */
  private async validateTemplateSpecificRules(template: EnhancedPolicyTemplate): Promise<{
    isValid: boolean;
    errors?: Array<{
      path: string;
      message: string;
      code: string;
      severity: 'error' | 'warning' | 'info';
    }>;
  }> {
    const errors: Array<{
      path: string;
      message: string;
      code: string;
      severity: 'error' | 'warning' | 'info';
    }> = [];

    // Validate template variables
    for (const variable of template.variables) {
      if (variable.required && !variable.defaultValue) {
        errors.push({
          path: `variables.${variable.name}`,
          message: 'Required variable must have a default value or clear documentation',
          code: 'REQUIRED_VARIABLE_NO_DEFAULT',
          severity: 'warning'
        });
      }
    }

    // Validate governance scenarios consistency
    if (template.governanceScenarios.length > 0 && template.complianceFrameworks.length === 0) {
      errors.push({
        path: 'complianceFrameworks',
        message: 'Templates with governance scenarios should specify compliance frameworks',
        code: 'MISSING_COMPLIANCE_FRAMEWORKS',
        severity: 'warning'
      });
    }

    return {
      isValid: errors.filter(e => e.severity === 'error').length === 0,
      errors: errors.length > 0 ? errors : undefined
    };
  }

  /**
   * Format validation errors
   */
  private formatValidationErrors(error: EnhancedPolicyValidationError): Array<{
    path: string;
    message: string;
    code: string;
    severity: 'error' | 'warning' | 'info';
    suggestion?: string;
  }> {
    return error.getFormattedErrors().map(formattedError => ({
      ...formattedError,
      severity: 'error' as const,
      suggestion: this.getSuggestionForError(formattedError.code, formattedError.path)
    }));
  }

  /**
   * Get suggestion for validation error
   */
  private getSuggestionForError(code: string, path: string): string | undefined {
    const suggestions: Record<string, string> = {
      'invalid_type': 'Check the data type requirements for this field',
      'too_small': 'Increase the value to meet minimum requirements',
      'too_big': 'Decrease the value to meet maximum requirements',
      'invalid_enum_value': 'Use one of the allowed values for this field',
      'required': 'This field is required and cannot be empty'
    };

    return suggestions[code];
  }

  /**
   * Calculate policy changes
   */
  private calculatePolicyChanges(
    currentPolicy: any,
    updatedPolicy: Partial<CompleteEnhancedPolicy>
  ): Array<{
    field: string;
    oldValue: any;
    newValue: any;
    changeType: 'added' | 'modified' | 'removed';
  }> {
    const changes: Array<{
      field: string;
      oldValue: any;
      newValue: any;
      changeType: 'added' | 'modified' | 'removed';
    }> = [];

    // Simplified change detection - in reality this would be more sophisticated
    if (updatedPolicy.metadata?.name && updatedPolicy.metadata.name !== currentPolicy.name) {
      changes.push({
        field: 'metadata.name',
        oldValue: currentPolicy.name,
        newValue: updatedPolicy.metadata.name,
        changeType: 'modified'
      });
    }

    if (updatedPolicy.metadata?.description && updatedPolicy.metadata.description !== currentPolicy.description) {
      changes.push({
        field: 'metadata.description',
        oldValue: currentPolicy.description,
        newValue: updatedPolicy.metadata.description,
        changeType: 'modified'
      });
    }

    return changes;
  }

  /**
   * Merge partial policy with existing policy
   */
  private mergePartialPolicy(currentPolicy: any, updatedPolicy: Partial<CompleteEnhancedPolicy>): any {
    // Deep merge logic - simplified for this example
    return {
      ...currentPolicy,
      metadata: {
        ...currentPolicy.metadata,
        ...updatedPolicy.metadata
      },
      definition: updatedPolicy.definition || currentPolicy.definition
    };
  }

  /**
   * Reconstruct policy at specific version
   */
  private async reconstructPolicyAtVersion(policyId: string, version: string): Promise<any> {
    // This would reconstruct the policy state at a specific version
    // by applying all changes up to that version
    // Simplified implementation for this example
    
    const versionRecord = await this.prisma.policyVersion.findFirst({
      where: { policyId, version }
    });

    if (!versionRecord) {
      throw new Error(`Version ${version} not found`);
    }

    // In a real implementation, this would reconstruct the full policy state
    return {
      definition: versionRecord.changes
    };
  }

  /**
   * Record migration in audit log
   */
  private async recordMigration(migrationData: {
    policyId: string;
    fromVersion: string;
    toVersion: string;
    migrationPath: string[];
    success: boolean;
    error?: string;
  }): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          id: crypto.randomUUID(),
          eventId: crypto.randomUUID(),
          eventType: 'policy_migration',
          resourceType: 'policy',
          resourceId: migrationData.policyId,
          actorType: 'system',
          action: 'migrate',
          outcome: migrationData.success ? 'success' : 'failure',
          metadata: migrationData,
          eventHash: crypto.randomUUID(), // Simplified hash
          eventTimestamp: new Date()
        }
      });
    } catch (error) {
      logger.warn('Failed to record migration audit log', { error: error.message });
    }
  }

  /**
   * Clear validation cache
   */
  clearValidationCache(): void {
    this.validationCache.clear();
  }

  /**
   * Get validation statistics
   */
  getValidationStatistics(): {
    cacheSize: number;
    cacheHitRate: number;
    migrationHandlers: number;
  } {
    return {
      cacheSize: this.validationCache.size,
      cacheHitRate: 0, // Would track this in a real implementation
      migrationHandlers: this.migrationHandlers.size
    };
  }
}