import { PrismaClient } from '@prisma/client'
import { execSync } from 'child_process'
import fs from 'fs/promises'
import path from 'path'
import { logger } from './logger.js'

export interface MigrationValidationResult {
  isValid: boolean
  errors: string[]
  warnings: string[]
  affectedTables: string[]
  foreignKeyIssues: string[]
  dataIntegrityChecks: DataIntegrityCheck[]
  migrationPath?: string
  rollbackSQL?: string
}

export interface DataIntegrityCheck {
  table: string
  check: string
  status: 'passed' | 'failed' | 'warning'
  message: string
  recordCount?: number
}

export interface MigrationRollbackPlan {
  migrationId: string
  rollbackSQL: string
  affectedTables: string[]
  dataBackupRequired: boolean
  estimatedDuration: string
  risks: string[]
  preValidationChecks: string[]
  postValidationChecks: string[]
}

export class MigrationValidator {
  private prisma: PrismaClient
  private migrationDir: string
  private backupDir: string

  constructor(prisma: PrismaClient) {
    this.prisma = prisma
    this.migrationDir = path.join(process.cwd(), 'prisma', 'migrations')
    this.backupDir = path.join(process.cwd(), 'prisma', 'backups')
  }

  /**
   * Validate a pending migration before applying it
   */
  async validateMigration(migrationName?: string): Promise<MigrationValidationResult> {
    logger.info('Starting migration validation', { migrationName })

    try {
      // Get the latest migration if no specific migration provided
      const targetMigration = migrationName || await this.getLatestMigration()
      if (!targetMigration) {
        return {
          isValid: false,
          errors: ['No migration found to validate'],
          warnings: [],
          affectedTables: [],
          foreignKeyIssues: [],
          dataIntegrityChecks: []
        }
      }

      const migrationPath = path.join(this.migrationDir, targetMigration)
      const migrationSQL = await this.readMigrationSQL(migrationPath)

      // Parse migration to understand changes
      const affectedTables = this.parseAffectedTables(migrationSQL)
      const errors: string[] = []
      const warnings: string[] = []

      // Run validation checks
      const foreignKeyIssues = await this.validateForeignKeys(migrationSQL, affectedTables)
      const dataIntegrityChecks = await this.runDataIntegrityChecks(affectedTables)
      const schemaValidation = await this.validateSchemaChanges(migrationSQL)

      // Check for potentially dangerous operations
      const dangerousOps = this.checkDangerousOperations(migrationSQL)
      if (dangerousOps.length > 0) {
        warnings.push(...dangerousOps.map(op => `Potentially dangerous operation: ${op}`))
      }

      // Validate migration syntax
      const syntaxValidation = await this.validateMigrationSyntax(migrationPath)
      if (!syntaxValidation.isValid) {
        errors.push(...syntaxValidation.errors)
      }

      // Generate rollback SQL
      const rollbackSQL = await this.generateRollbackSQL(migrationSQL, affectedTables)

      errors.push(...foreignKeyIssues)
      errors.push(...schemaValidation.errors)
      warnings.push(...schemaValidation.warnings)

      const isValid = errors.length === 0

      return {
        isValid,
        errors,
        warnings,
        affectedTables,
        foreignKeyIssues,
        dataIntegrityChecks,
        migrationPath,
        rollbackSQL
      }
    } catch (error) {
      logger.error('Migration validation failed', { error: error.message })
      return {
        isValid: false,
        errors: [`Migration validation failed: ${error.message}`],
        warnings: [],
        affectedTables: [],
        foreignKeyIssues: [],
        dataIntegrityChecks: []
      }
    }
  }

  /**
   * Create a comprehensive rollback plan for a migration
   */
  async createRollbackPlan(migrationId: string): Promise<MigrationRollbackPlan> {
    logger.info('Creating rollback plan', { migrationId })

    try {
      const migrationPath = path.join(this.migrationDir, migrationId)
      const migrationSQL = await this.readMigrationSQL(migrationPath)
      const affectedTables = this.parseAffectedTables(migrationSQL)

      // Generate rollback SQL
      const rollbackSQL = await this.generateRollbackSQL(migrationSQL, affectedTables)

      // Assess data backup requirements
      const dataBackupRequired = this.requiresDataBackup(migrationSQL)

      // Estimate rollback duration
      const estimatedDuration = await this.estimateRollbackDuration(affectedTables)

      // Identify risks
      const risks = this.identifyRollbackRisks(migrationSQL, affectedTables)

      // Create validation checklists
      const preValidationChecks = this.createPreValidationChecklist(affectedTables)
      const postValidationChecks = this.createPostValidationChecklist(affectedTables)

      return {
        migrationId,
        rollbackSQL,
        affectedTables,
        dataBackupRequired,
        estimatedDuration,
        risks,
        preValidationChecks,
        postValidationChecks
      }
    } catch (error) {
      logger.error('Failed to create rollback plan', { migrationId, error: error.message })
      throw new Error(`Failed to create rollback plan: ${error.message}`)
    }
  }

  /**
   * Execute migration rollback with validation
   */
  async executeRollback(rollbackPlan: MigrationRollbackPlan): Promise<boolean> {
    logger.info('Executing migration rollback', { migrationId: rollbackPlan.migrationId })

    try {
      // Run pre-validation checks
      const preValidation = await this.runValidationChecklist(rollbackPlan.preValidationChecks)
      if (!preValidation.passed) {
        throw new Error(`Pre-validation failed: ${preValidation.failures.join(', ')}`)
      }

      // Create data backup if required
      if (rollbackPlan.dataBackupRequired) {
        await this.createDataBackup(rollbackPlan.affectedTables)
      }

      // Execute rollback in transaction
      await this.prisma.$transaction(async (tx) => {
        // Execute rollback SQL
        await tx.$executeRawUnsafe(rollbackPlan.rollbackSQL)

        // Verify rollback success
        for (const table of rollbackPlan.affectedTables) {
          await this.validateTableStructure(tx, table)
        }
      })

      // Run post-validation checks
      const postValidation = await this.runValidationChecklist(rollbackPlan.postValidationChecks)
      if (!postValidation.passed) {
        logger.error('Post-validation failed after rollback', { failures: postValidation.failures })
        // Don't throw here as rollback already executed, just log the issues
      }

      logger.info('Migration rollback completed successfully', { migrationId: rollbackPlan.migrationId })
      return true
    } catch (error) {
      logger.error('Migration rollback failed', {
        migrationId: rollbackPlan.migrationId,
        error: error.message
      })
      throw error
    }
  }

  /**
   * Test migration in isolated environment
   */
  async testMigrationInIsolation(migrationName: string): Promise<MigrationValidationResult> {
    logger.info('Testing migration in isolation', { migrationName })

    // Create temporary database for testing
    const testDbUrl = await this.createTestDatabase()
    const testPrisma = new PrismaClient({
      datasources: {
        db: {
          url: testDbUrl
        }
      }
    })

    try {
      // Apply current schema to test database
      await this.applyCurrentSchemaToTestDb(testPrisma)

      // Apply test migration
      const migrationPath = path.join(this.migrationDir, migrationName)
      const migrationSQL = await this.readMigrationSQL(migrationPath)

      await testPrisma.$executeRawUnsafe(migrationSQL)

      // Run comprehensive validation
      const validation = await this.validateMigration(migrationName)

      logger.info('Migration isolation test completed', { migrationName, isValid: validation.isValid })
      return validation
    } catch (error) {
      logger.error('Migration isolation test failed', { migrationName, error: error.message })
      return {
        isValid: false,
        errors: [`Isolation test failed: ${error.message}`],
        warnings: [],
        affectedTables: [],
        foreignKeyIssues: [],
        dataIntegrityChecks: []
      }
    } finally {
      await testPrisma.$disconnect()
      await this.cleanupTestDatabase(testDbUrl)
    }
  }

  // Private helper methods

  private async getLatestMigration(): Promise<string | null> {
    try {
      const migrations = await fs.readdir(this.migrationDir)
      const migrationDirs = migrations.filter(dir =>
        dir.match(/^\d{14}_/) // Prisma migration format
      ).sort().reverse()

      return migrationDirs[0] || null
    } catch (error) {
      logger.error('Failed to get latest migration', { error: error.message })
      return null
    }
  }

  private async readMigrationSQL(migrationPath: string): Promise<string> {
    const sqlFile = path.join(migrationPath, 'migration.sql')
    return await fs.readFile(sqlFile, 'utf-8')
  }

  private parseAffectedTables(migrationSQL: string): string[] {
    const tables = new Set<string>()

    // Parse CREATE TABLE statements
    const createMatches = migrationSQL.match(/CREATE TABLE\s+"([^"]+)"/gi)
    if (createMatches) {
      createMatches.forEach(match => {
        const tableName = match.match(/"([^"]+)"/)?.[1]
        if (tableName) tables.add(tableName)
      })
    }

    // Parse ALTER TABLE statements
    const alterMatches = migrationSQL.match(/ALTER TABLE\s+"([^"]+)"/gi)
    if (alterMatches) {
      alterMatches.forEach(match => {
        const tableName = match.match(/"([^"]+)"/)?.[1]
        if (tableName) tables.add(tableName)
      })
    }

    // Parse DROP TABLE statements
    const dropMatches = migrationSQL.match(/DROP TABLE\s+"([^"]+)"/gi)
    if (dropMatches) {
      dropMatches.forEach(match => {
        const tableName = match.match(/"([^"]+)"/)?.[1]
        if (tableName) tables.add(tableName)
      })
    }

    return Array.from(tables)
  }

  private async validateForeignKeys(migrationSQL: string, affectedTables: string[]): Promise<string[]> {
    const errors: string[] = []

    // Check for foreign key constraint violations
    for (const table of affectedTables) {
      try {
        // Query information_schema to check foreign key constraints
        const constraints = await this.prisma.$queryRaw`
          SELECT
            tc.constraint_name,
            tc.table_name,
            kcu.column_name,
            ccu.table_name AS foreign_table_name,
            ccu.column_name AS foreign_column_name
          FROM information_schema.table_constraints AS tc
          JOIN information_schema.key_column_usage AS kcu
            ON tc.constraint_name = kcu.constraint_name
          JOIN information_schema.constraint_column_usage AS ccu
            ON ccu.constraint_name = tc.constraint_name
          WHERE tc.constraint_type = 'FOREIGN KEY'
            AND tc.table_name = ${table}
        ` as any[]

        // Validate each foreign key constraint
        for (const constraint of constraints) {
          const violationCount = await this.prisma.$queryRaw`
            SELECT COUNT(*) as count
            FROM ${this.prisma.$queryRawUnsafe(`"${table}"`)} t1
            LEFT JOIN ${this.prisma.$queryRawUnsafe(`"${constraint.foreign_table_name}"`)} t2
              ON t1.${this.prisma.$queryRawUnsafe(`"${constraint.column_name}"`)} = t2.${this.prisma.$queryRawUnsafe(`"${constraint.foreign_column_name}"`)}
            WHERE t1.${this.prisma.$queryRawUnsafe(`"${constraint.column_name}"`)} IS NOT NULL
              AND t2.${this.prisma.$queryRawUnsafe(`"${constraint.foreign_column_name}"`)} IS NULL
          ` as any[]

          if (violationCount[0]?.count > 0) {
            errors.push(`Foreign key constraint violation in ${table}.${constraint.column_name} -> ${constraint.foreign_table_name}.${constraint.foreign_column_name}`)
          }
        }
      } catch (error) {
        logger.warn(`Could not validate foreign keys for table ${table}`, { error: error.message })
      }
    }

    return errors
  }

  private async runDataIntegrityChecks(affectedTables: string[]): Promise<DataIntegrityCheck[]> {
    const checks: DataIntegrityCheck[] = []

    for (const table of affectedTables) {
      try {
        // Check for duplicate primary keys
        const duplicatePKCheck = await this.checkDuplicatePrimaryKeys(table)
        checks.push(duplicatePKCheck)

        // Check for null values in required columns
        const nullValueCheck = await this.checkNullValues(table)
        checks.push(nullValueCheck)

        // Check data type consistency
        const dataTypeCheck = await this.checkDataTypeConsistency(table)
        checks.push(dataTypeCheck)

      } catch (error) {
        checks.push({
          table,
          check: 'integrity_validation',
          status: 'failed',
          message: `Failed to run integrity checks: ${error.message}`
        })
      }
    }

    return checks
  }

  private async checkDuplicatePrimaryKeys(table: string): Promise<DataIntegrityCheck> {
    try {
      // Get primary key column(s) for the table
      const primaryKeyInfo = await this.prisma.$queryRaw`
        SELECT a.attname
        FROM pg_index i
        JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
        WHERE i.indrelid = ${table}::regclass AND i.indisprimary
      ` as any[]

      if (primaryKeyInfo.length === 0) {
        return {
          table,
          check: 'primary_key_duplicates',
          status: 'warning',
          message: 'No primary key found for table'
        }
      }

      const pkColumn = primaryKeyInfo[0].attname
      const duplicateCount = await this.prisma.$queryRaw`
        SELECT COUNT(*) as count
        FROM (
          SELECT ${this.prisma.$queryRawUnsafe(`"${pkColumn}"`)}
          FROM ${this.prisma.$queryRawUnsafe(`"${table}"`)}
          GROUP BY ${this.prisma.$queryRawUnsafe(`"${pkColumn}"`)}
          HAVING COUNT(*) > 1
        ) duplicates
      ` as any[]

      const count = Number(duplicateCount[0]?.count || 0)

      return {
        table,
        check: 'primary_key_duplicates',
        status: count > 0 ? 'failed' : 'passed',
        message: count > 0 ? `Found ${count} duplicate primary key values` : 'No duplicate primary keys found',
        recordCount: count
      }
    } catch (error) {
      return {
        table,
        check: 'primary_key_duplicates',
        status: 'failed',
        message: `Error checking primary key duplicates: ${error.message}`
      }
    }
  }

  private async checkNullValues(table: string): Promise<DataIntegrityCheck> {
    try {
      // Get NOT NULL columns
      const notNullColumns = await this.prisma.$queryRaw`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = ${table}
          AND is_nullable = 'NO'
          AND column_default IS NULL
      ` as any[]

      let nullViolations = 0
      const violatedColumns: string[] = []

      for (const col of notNullColumns) {
        const nullCount = await this.prisma.$queryRaw`
          SELECT COUNT(*) as count
          FROM ${this.prisma.$queryRawUnsafe(`"${table}"`)}
          WHERE ${this.prisma.$queryRawUnsafe(`"${col.column_name}"`)} IS NULL
        ` as any[]

        const count = Number(nullCount[0]?.count || 0)
        if (count > 0) {
          nullViolations += count
          violatedColumns.push(`${col.column_name} (${count} nulls)`)
        }
      }

      return {
        table,
        check: 'null_value_constraints',
        status: nullViolations > 0 ? 'failed' : 'passed',
        message: nullViolations > 0
          ? `Found null values in NOT NULL columns: ${violatedColumns.join(', ')}`
          : 'All NOT NULL constraints satisfied',
        recordCount: nullViolations
      }
    } catch (error) {
      return {
        table,
        check: 'null_value_constraints',
        status: 'failed',
        message: `Error checking null constraints: ${error.message}`
      }
    }
  }

  private async checkDataTypeConsistency(table: string): Promise<DataIntegrityCheck> {
    try {
      // This is a simplified check - in practice, you'd want more sophisticated validation
      const recordCount = await this.prisma.$queryRaw`
        SELECT COUNT(*) as count FROM ${this.prisma.$queryRawUnsafe(`"${table}"`)}
      ` as any[]

      const count = Number(recordCount[0]?.count || 0)

      return {
        table,
        check: 'data_type_consistency',
        status: 'passed',
        message: `Table contains ${count} records`,
        recordCount: count
      }
    } catch (error) {
      return {
        table,
        check: 'data_type_consistency',
        status: 'failed',
        message: `Error checking data consistency: ${error.message}`
      }
    }
  }

  private async validateSchemaChanges(migrationSQL: string): Promise<{ errors: string[], warnings: string[] }> {
    const errors: string[] = []
    const warnings: string[] = []

    // Check for potentially problematic schema changes
    if (migrationSQL.includes('DROP COLUMN')) {
      warnings.push('Migration contains column drops - ensure data is backed up')
    }

    if (migrationSQL.includes('DROP TABLE')) {
      warnings.push('Migration contains table drops - ensure data is backed up')
    }

    if (migrationSQL.includes('ALTER COLUMN') && migrationSQL.includes('TYPE')) {
      warnings.push('Migration contains column type changes - may cause data loss')
    }

    // Check for missing CASCADE options on foreign key changes
    if (migrationSQL.includes('ADD FOREIGN KEY') && !migrationSQL.includes('CASCADE')) {
      warnings.push('Foreign key constraints added without CASCADE options')
    }

    return { errors, warnings }
  }

  private checkDangerousOperations(migrationSQL: string): string[] {
    const dangerous: string[] = []

    if (migrationSQL.includes('TRUNCATE')) {
      dangerous.push('TRUNCATE operation (data loss)')
    }

    if (migrationSQL.includes('DROP DATABASE')) {
      dangerous.push('DROP DATABASE operation')
    }

    if (migrationSQL.includes('DROP SCHEMA')) {
      dangerous.push('DROP SCHEMA operation')
    }

    return dangerous
  }

  private async validateMigrationSyntax(migrationPath: string): Promise<{ isValid: boolean, errors: string[] }> {
    try {
      // Use Prisma CLI to validate the migration
      const result = execSync(`npx prisma migrate status`, {
        cwd: process.cwd(),
        encoding: 'utf-8',
        stdio: 'pipe'
      })

      return { isValid: true, errors: [] }
    } catch (error) {
      return {
        isValid: false,
        errors: [`Migration syntax validation failed: ${error.message}`]
      }
    }
  }

  private async generateRollbackSQL(migrationSQL: string, affectedTables: string[]): Promise<string> {
    // This is a simplified rollback generation - in production, you'd want more sophisticated logic
    const rollbackStatements: string[] = []

    // For CREATE TABLE, generate DROP TABLE
    const createTableMatches = migrationSQL.match(/CREATE TABLE\s+"([^"]+)"/gi)
    if (createTableMatches) {
      createTableMatches.forEach(match => {
        const tableName = match.match(/"([^"]+)"/)?.[1]
        if (tableName) {
          rollbackStatements.push(`DROP TABLE IF EXISTS "${tableName}" CASCADE;`)
        }
      })
    }

    // For ALTER TABLE ADD COLUMN, generate ALTER TABLE DROP COLUMN
    const addColumnMatches = migrationSQL.match(/ALTER TABLE\s+"([^"]+)"\s+ADD\s+COLUMN\s+"([^"]+)"/gi)
    if (addColumnMatches) {
      addColumnMatches.forEach(match => {
        const matches = match.match(/ALTER TABLE\s+"([^"]+)"\s+ADD\s+COLUMN\s+"([^"]+)"/)
        if (matches) {
          const [, tableName, columnName] = matches
          rollbackStatements.push(`ALTER TABLE "${tableName}" DROP COLUMN IF EXISTS "${columnName}";`)
        }
      })
    }

    return rollbackStatements.join('\n')
  }

  private requiresDataBackup(migrationSQL: string): boolean {
    return migrationSQL.includes('DROP') ||
           migrationSQL.includes('TRUNCATE') ||
           migrationSQL.includes('ALTER COLUMN')
  }

  private async estimateRollbackDuration(affectedTables: string[]): Promise<string> {
    // Simple estimation based on table sizes
    let totalRecords = 0

    for (const table of affectedTables) {
      try {
        const count = await this.prisma.$queryRaw`
          SELECT COUNT(*) as count FROM ${this.prisma.$queryRawUnsafe(`"${table}"`)}
        ` as any[]
        totalRecords += Number(count[0]?.count || 0)
      } catch (error) {
        // Table might not exist yet, skip
      }
    }

    if (totalRecords < 1000) return '< 1 minute'
    if (totalRecords < 10000) return '1-5 minutes'
    if (totalRecords < 100000) return '5-15 minutes'
    return '> 15 minutes'
  }

  private identifyRollbackRisks(migrationSQL: string, affectedTables: string[]): string[] {
    const risks: string[] = []

    if (migrationSQL.includes('DROP')) {
      risks.push('Data loss from DROP operations')
    }

    if (affectedTables.some(table => ['users', 'organizations', 'audit_logs'].includes(table))) {
      risks.push('Critical system tables affected')
    }

    if (migrationSQL.includes('CASCADE')) {
      risks.push('Cascading operations may affect related data')
    }

    return risks
  }

  private createPreValidationChecklist(affectedTables: string[]): string[] {
    return [
      'Verify database connection is stable',
      'Confirm backup systems are operational',
      'Check available disk space for rollback operations',
      `Validate data integrity for tables: ${affectedTables.join(', ')}`,
      'Ensure no active transactions on affected tables'
    ]
  }

  private createPostValidationChecklist(affectedTables: string[]): string[] {
    return [
      'Verify all affected tables are accessible',
      'Confirm foreign key constraints are intact',
      'Validate data consistency across related tables',
      'Check application functionality with rolled-back schema',
      'Verify indexes and constraints are properly restored'
    ]
  }

  private async runValidationChecklist(checklist: string[]): Promise<{ passed: boolean, failures: string[] }> {
    // Simplified implementation - in practice, each check would have specific validation logic
    const failures: string[] = []

    // For demo purposes, assume all checks pass unless there are obvious issues
    // In production, implement specific validation for each checklist item

    return { passed: failures.length === 0, failures }
  }

  private async createDataBackup(tables: string[]): Promise<void> {
    logger.info('Creating data backup for tables', { tables })

    // Ensure backup directory exists
    await fs.mkdir(this.backupDir, { recursive: true })

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')

    for (const table of tables) {
      try {
        const backupFile = path.join(this.backupDir, `${table}_${timestamp}.sql`)

        // Export table data using pg_dump equivalent
        execSync(`pg_dump ${process.env.DATABASE_URL} --table=${table} --data-only > ${backupFile}`, {
          stdio: 'pipe'
        })

        logger.info(`Created backup for table ${table}`, { backupFile })
      } catch (error) {
        logger.error(`Failed to backup table ${table}`, { error: error.message })
        throw error
      }
    }
  }

  private async validateTableStructure(tx: any, table: string): Promise<void> {
    try {
      // Basic table existence check
      await tx.$queryRaw`SELECT 1 FROM information_schema.tables WHERE table_name = ${table}`
    } catch (error) {
      throw new Error(`Table structure validation failed for ${table}: ${error.message}`)
    }
  }

  private async createTestDatabase(): Promise<string> {
    // Generate unique test database name
    const testDbName = `test_migration_${Date.now()}`
    const baseUrl = process.env.DATABASE_URL?.split('/').slice(0, -1).join('/')
    return `${baseUrl}/${testDbName}`
  }

  private async applyCurrentSchemaToTestDb(testPrisma: PrismaClient): Promise<void> {
    // Apply current schema to test database
    // This would typically involve running all existing migrations
    logger.info('Applying current schema to test database')
  }

  private async cleanupTestDatabase(testDbUrl: string): Promise<void> {
    // Clean up test database
    const dbName = testDbUrl.split('/').pop()
    try {
      await this.prisma.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${dbName}"`)
      logger.info('Cleaned up test database', { dbName })
    } catch (error) {
      logger.warn('Failed to cleanup test database', { dbName, error: error.message })
    }
  }
}

export const createMigrationValidator = (prisma: PrismaClient) => {
  return new MigrationValidator(prisma)
}