#!/bin/bash

# Database Migration Validation Script for Urnlabs AI Platform
# This script validates database migrations before deployment

set -euo pipefail

# Configuration
ENVIRONMENT="${1:-staging}"
MIGRATION_NAME="${2:-""}"
VALIDATION_MODE="${3:-full}" # full, quick, syntax-only
SKIP_BACKUP="${4:-false}"

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Validate environment
validate_environment() {
    if [[ ! "$ENVIRONMENT" =~ ^(development|staging|production)$ ]]; then
        log_error "Invalid environment: $ENVIRONMENT. Must be 'development', 'staging', or 'production'"
        exit 1
    fi

    log_info "Validating migrations for environment: $ENVIRONMENT"
}

# Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."

    # Check if Prisma CLI is available
    if ! command -v prisma &> /dev/null; then
        log_error "Prisma CLI not found. Please install it with: npm install -g prisma"
        exit 1
    fi

    # Check if database URL is set
    if [[ -z "${DATABASE_URL:-}" ]]; then
        log_error "DATABASE_URL environment variable is not set"
        exit 1
    fi

    # Check if Node.js and npm are available
    if ! command -v node &> /dev/null; then
        log_error "Node.js not found"
        exit 1
    fi

    if ! command -v npm &> /dev/null; then
        log_error "npm not found"
        exit 1
    fi

    log_success "Prerequisites check passed"
}

# Get migration status
get_migration_status() {
    log_info "Checking migration status..."

    cd apps/api

    # Check for pending migrations
    local migration_status
    migration_status=$(npx prisma migrate status 2>&1 || true)

    if echo "$migration_status" | grep -q "Following migration have not yet been applied"; then
        log_info "Found pending migrations"
        return 0
    elif echo "$migration_status" | grep -q "Database schema is up to date"; then
        log_info "Database schema is up to date"
        return 1
    else
        log_warning "Could not determine migration status"
        echo "$migration_status"
        return 2
    fi
}

# Create database backup
create_backup() {
    if [[ "$SKIP_BACKUP" == "true" ]]; then
        log_info "Skipping backup creation (--skip-backup specified)"
        return 0
    fi

    log_info "Creating database backup before migration validation..."

    local backup_dir="prisma/backups"
    local timestamp=$(date +"%Y%m%d_%H%M%S")
    local backup_file="${backup_dir}/backup_${ENVIRONMENT}_${timestamp}.sql"

    # Ensure backup directory exists
    mkdir -p "$backup_dir"

    # Create backup using pg_dump
    if command -v pg_dump &> /dev/null; then
        log_info "Creating backup with pg_dump..."
        pg_dump "$DATABASE_URL" > "$backup_file"
        log_success "Backup created: $backup_file"
    else
        log_warning "pg_dump not available, skipping backup creation"
    fi
}

# Run syntax validation
validate_syntax() {
    log_info "Running migration syntax validation..."

    cd apps/api

    # Validate migration files syntax
    if npx prisma migrate status &> /dev/null; then
        log_success "Migration syntax validation passed"
        return 0
    else
        log_error "Migration syntax validation failed"
        return 1
    fi
}

# Run database validation using our custom validator
run_database_validation() {
    log_info "Running comprehensive database migration validation..."

    cd apps/api

    # Create temporary validation script
    cat > /tmp/validate-migration.mjs << 'EOF'
import { PrismaClient } from '@prisma/client'
import { createMigrationValidator } from './src/lib/migration-validator.js'

const prisma = new PrismaClient()
const validator = createMigrationValidator(prisma)

async function validateMigration() {
  try {
    console.log('🔍 Starting migration validation...')

    const result = await validator.validateMigration(process.argv[2])

    if (result.isValid) {
      console.log('✅ Migration validation passed')
      console.log(`📊 Affected tables: ${result.affectedTables.join(', ')}`)

      if (result.warnings.length > 0) {
        console.log('⚠️  Warnings:')
        result.warnings.forEach(warning => console.log(`   - ${warning}`))
      }

      if (result.dataIntegrityChecks.length > 0) {
        console.log('🔍 Data integrity checks:')
        result.dataIntegrityChecks.forEach(check => {
          const status = check.status === 'passed' ? '✅' : check.status === 'warning' ? '⚠️' : '❌'
          console.log(`   ${status} ${check.table}: ${check.message}`)
        })
      }

      process.exit(0)
    } else {
      console.log('❌ Migration validation failed')
      console.log('Errors:')
      result.errors.forEach(error => console.log(`   - ${error}`))

      if (result.foreignKeyIssues.length > 0) {
        console.log('Foreign key issues:')
        result.foreignKeyIssues.forEach(issue => console.log(`   - ${issue}`))
      }

      process.exit(1)
    }
  } catch (error) {
    console.error('💥 Validation error:', error.message)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

validateMigration()
EOF

    # Run the validation
    if node /tmp/validate-migration.mjs "$MIGRATION_NAME"; then
        log_success "Database validation passed"
        rm -f /tmp/validate-migration.mjs
        return 0
    else
        log_error "Database validation failed"
        rm -f /tmp/validate-migration.mjs
        return 1
    fi
}

# Run migration in test environment
test_migration_in_isolation() {
    log_info "Testing migration in isolated environment..."

    cd apps/api

    # Create temporary test script
    cat > /tmp/test-migration.mjs << 'EOF'
import { PrismaClient } from '@prisma/client'
import { createMigrationValidator } from './src/lib/migration-validator.js'

const prisma = new PrismaClient()
const validator = createMigrationValidator(prisma)

async function testMigration() {
  try {
    console.log('🧪 Starting isolation test...')

    const result = await validator.testMigrationInIsolation(process.argv[2] || 'latest')

    if (result.isValid) {
      console.log('✅ Isolation test passed')
      process.exit(0)
    } else {
      console.log('❌ Isolation test failed')
      result.errors.forEach(error => console.log(`   - ${error}`))
      process.exit(1)
    }
  } catch (error) {
    console.error('💥 Isolation test error:', error.message)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

testMigration()
EOF

    # Run the isolation test
    if node /tmp/test-migration.mjs "$MIGRATION_NAME"; then
        log_success "Isolation test passed"
        rm -f /tmp/test-migration.mjs
        return 0
    else
        log_error "Isolation test failed"
        rm -f /tmp/test-migration.mjs
        return 1
    fi
}

# Run performance impact assessment
assess_performance_impact() {
    log_info "Assessing migration performance impact..."

    cd apps/api

    # Create performance assessment script
    cat > /tmp/assess-performance.mjs << 'EOF'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function assessPerformance() {
  try {
    console.log('📊 Assessing database performance impact...')

    // Get table sizes
    const tableSizes = await prisma.$queryRaw`
      SELECT
        schemaname,
        tablename,
        pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size,
        pg_total_relation_size(schemaname||'.'||tablename) as bytes
      FROM pg_tables
      WHERE schemaname = 'public'
      ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC
      LIMIT 10
    `

    console.log('📈 Top 10 largest tables:')
    tableSizes.forEach(table => {
      console.log(`   ${table.tablename}: ${table.size}`)
    })

    // Check for long-running queries
    const activeConnections = await prisma.$queryRaw`
      SELECT COUNT(*) as active_connections
      FROM pg_stat_activity
      WHERE state = 'active' AND query != '<IDLE>'
    `

    console.log(`🔗 Active connections: ${activeConnections[0].active_connections}`)

    // Estimate migration time based on table sizes
    const totalSize = tableSizes.reduce((sum, table) => sum + Number(table.bytes), 0)
    const estimatedTime = totalSize > 1000000000 ? 'High (>5 minutes)' :
                         totalSize > 100000000 ? 'Medium (1-5 minutes)' : 'Low (<1 minute)'

    console.log(`⏱️  Estimated migration time: ${estimatedTime}`)

    process.exit(0)
  } catch (error) {
    console.error('💥 Performance assessment error:', error.message)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

assessPerformance()
EOF

    # Run the performance assessment
    if node /tmp/assess-performance.mjs; then
        log_success "Performance assessment completed"
        rm -f /tmp/assess-performance.mjs
        return 0
    else
        log_warning "Performance assessment had issues"
        rm -f /tmp/assess-performance.mjs
        return 1
    fi
}

# Generate validation report
generate_report() {
    log_info "Generating migration validation report..."

    local report_file="migration-validation-report-$(date +%Y%m%d_%H%M%S).json"

    cat > "$report_file" << EOF
{
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "environment": "$ENVIRONMENT",
  "migration_name": "$MIGRATION_NAME",
  "validation_mode": "$VALIDATION_MODE",
  "results": {
    "syntax_validation": "$syntax_result",
    "database_validation": "$database_result",
    "isolation_test": "$isolation_result",
    "performance_assessment": "$performance_result"
  },
  "recommendations": [
    "Monitor database performance during migration",
    "Have rollback plan ready",
    "Schedule migration during low-traffic period"
  ]
}
EOF

    log_success "Validation report generated: $report_file"
}

# Main function
main() {
    echo ""
    log_info "🔍 Database Migration Validation"
    log_info "=================================="
    log_info "Environment: $ENVIRONMENT"
    log_info "Migration: ${MIGRATION_NAME:-'Latest'}"
    log_info "Mode: $VALIDATION_MODE"
    echo ""

    # Validate environment and check prerequisites
    validate_environment
    check_prerequisites

    # Check if there are migrations to validate
    if ! get_migration_status && [[ -z "$MIGRATION_NAME" ]]; then
        log_info "No pending migrations found"
        exit 0
    fi

    # Create backup unless in development or explicitly skipped
    if [[ "$ENVIRONMENT" != "development" ]]; then
        create_backup
    fi

    # Run validation based on mode
    local syntax_result="skipped"
    local database_result="skipped"
    local isolation_result="skipped"
    local performance_result="skipped"

    case "$VALIDATION_MODE" in
        "syntax-only")
            if validate_syntax; then
                syntax_result="passed"
            else
                syntax_result="failed"
                log_error "Syntax validation failed"
                exit 1
            fi
            ;;
        "quick")
            if validate_syntax; then
                syntax_result="passed"
            else
                syntax_result="failed"
                log_error "Syntax validation failed"
                exit 1
            fi

            if run_database_validation; then
                database_result="passed"
            else
                database_result="failed"
                log_error "Database validation failed"
                exit 1
            fi
            ;;
        "full")
            if validate_syntax; then
                syntax_result="passed"
            else
                syntax_result="failed"
                log_error "Syntax validation failed"
                exit 1
            fi

            if run_database_validation; then
                database_result="passed"
            else
                database_result="failed"
                log_error "Database validation failed"
                exit 1
            fi

            if test_migration_in_isolation; then
                isolation_result="passed"
            else
                isolation_result="failed"
                log_error "Isolation test failed"
                exit 1
            fi

            if assess_performance_impact; then
                performance_result="passed"
            else
                performance_result="warning"
                log_warning "Performance assessment had issues"
            fi
            ;;
    esac

    # Generate validation report
    generate_report

    log_success "🎉 Migration validation completed successfully!"
    echo ""
    log_info "Next steps:"
    log_info "1. Review the validation report"
    log_info "2. Plan the migration deployment"
    log_info "3. Prepare rollback procedures"
    log_info "4. Schedule deployment during maintenance window"
    echo ""
}

# Execute main function
main "$@"