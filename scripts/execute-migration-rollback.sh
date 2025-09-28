#!/bin/bash

# Migration Rollback Execution Script for Urnlabs AI Platform
# This script executes database migration rollbacks with comprehensive safety checks

set -euo pipefail

# Configuration
ENVIRONMENT="${1:-production}"
MIGRATION_ID="${2:-\"\"}"
CONFIRMATION_REQUIRED="${3:-true}"
DRY_RUN="${4:-false}"

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

    log_info "Validating rollback for environment: $ENVIRONMENT"
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

    # Check if Node.js is available
    if ! command -v node &> /dev/null; then
        log_error "Node.js not found"
        exit 1
    fi

    log_success "Prerequisites check passed"
}

# Get migration to rollback
get_target_migration() {
    if [[ -n "$MIGRATION_ID" ]]; then
        echo "$MIGRATION_ID"
        return 0
    fi

    log_info "Getting latest migration for rollback..."

    cd apps/api

    # Get the latest applied migration
    local latest_migration
    latest_migration=$(node -e "
        const { PrismaClient } = require('@prisma/client');

        const prisma = new PrismaClient();

        async function getLatestMigration() {
            try {
                const migrations = await prisma.\$queryRaw\`
                    SELECT migration_name
                    FROM _prisma_migrations
                    WHERE finished_at IS NOT NULL
                    ORDER BY finished_at DESC
                    LIMIT 1
                \`;

                if (migrations.length > 0) {
                    console.log(migrations[0].migration_name);
                } else {
                    console.log('');
                }
            } catch (error) {
                console.error('Error getting migration:', error.message);
                process.exit(1);
            } finally {
                await prisma.\$disconnect();
            }
        }

        getLatestMigration();
    ")

    if [[ -z "$latest_migration" ]]; then
        log_error "No migrations found to rollback"
        exit 1
    fi

    echo "$latest_migration"
}

# Create database backup before rollback
create_backup() {
    log_info "Creating database backup before rollback..."

    local backup_dir="apps/api/prisma/backups"
    local timestamp=$(date +"%Y%m%d_%H%M%S")
    local backup_file="${backup_dir}/rollback_backup_${ENVIRONMENT}_${timestamp}.sql"

    # Ensure backup directory exists
    mkdir -p "$backup_dir"

    # Create backup using pg_dump
    if command -v pg_dump &> /dev/null; then
        log_info "Creating backup with pg_dump..."
        pg_dump "$DATABASE_URL" > "$backup_file"
        log_success "Backup created: $backup_file"
        echo "$backup_file"
    else
        log_error "pg_dump not available, cannot create backup"
        exit 1
    fi
}

# Generate rollback plan
generate_rollback_plan() {
    local migration_id="$1"

    log_info "Generating rollback plan for migration: $migration_id"

    cd apps/api

    # Generate rollback plan using our custom validator
    local rollback_plan_result
    rollback_plan_result=$(node -e "
        const { PrismaClient } = require('@prisma/client');
        const { createMigrationValidator } = require('./src/lib/migration-validator.js');

        const prisma = new PrismaClient();
        const validator = createMigrationValidator(prisma);

        async function generatePlan() {
            try {
                console.log('🔍 Generating rollback plan...');

                const rollbackPlan = await validator.createRollbackPlan('$migration_id');

                console.log(JSON.stringify({
                    isRollbackSafe: rollbackPlan.isRollbackSafe,
                    rollbackSteps: rollbackPlan.rollbackSteps.length,
                    affectedTables: rollbackPlan.affectedTables.join(','),
                    unsafeReasons: rollbackPlan.unsafeReasons.join(','),
                    estimatedDuration: rollbackPlan.estimatedDuration,
                    plan: rollbackPlan
                }));

            } catch (error) {
                console.error('❌ Rollback plan generation failed:', error.message);
                process.exit(1);
            } finally {
                await prisma.\$disconnect();
            }
        }

        generatePlan();
    ")

    echo "$rollback_plan_result"
}

# Validate rollback safety
validate_rollback_safety() {
    local rollback_plan="$1"

    log_info "Validating rollback safety..."

    local is_safe=$(echo "$rollback_plan" | jq -r '.isRollbackSafe')
    local unsafe_reasons=$(echo "$rollback_plan" | jq -r '.unsafeReasons')
    local affected_tables=$(echo "$rollback_plan" | jq -r '.affectedTables')
    local steps_count=$(echo "$rollback_plan" | jq -r '.rollbackSteps')

    log_info "Rollback analysis results:"
    log_info "  - Safe to rollback: $is_safe"
    log_info "  - Affected tables: $affected_tables"
    log_info "  - Rollback steps: $steps_count"

    if [[ "$is_safe" != "true" ]]; then
        log_error "Rollback is marked as UNSAFE!"
        log_error "Reasons: $unsafe_reasons"

        if [[ "$ENVIRONMENT" == "production" ]]; then
            log_error "Refusing to execute unsafe rollback in production"
            exit 1
        else
            log_warning "Unsafe rollback detected in $ENVIRONMENT environment"
            if [[ "$CONFIRMATION_REQUIRED" == "true" ]]; then
                read -p "Do you want to proceed anyway? (yes/no): " -r
                if [[ ! $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
                    log_info "Rollback cancelled by user"
                    exit 0
                fi
            fi
        fi
    fi

    log_success "Rollback safety validation completed"
}

# Execute rollback
execute_rollback() {
    local migration_id="$1"
    local rollback_plan="$2"

    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "DRY RUN: Would execute rollback for migration: $migration_id"
        local plan_details=$(echo "$rollback_plan" | jq -r '.plan')
        echo "$plan_details" | jq '.'
        return 0
    fi

    log_warning "🚨 EXECUTING ROLLBACK FOR MIGRATION: $migration_id"

    cd apps/api

    # Execute rollback using our custom validator
    local rollback_result
    rollback_result=$(node -e "
        const { PrismaClient } = require('@prisma/client');
        const { createMigrationValidator } = require('./src/lib/migration-validator.js');

        const prisma = new PrismaClient();
        const validator = createMigrationValidator(prisma);

        async function executeRollback() {
            try {
                console.log('🔄 Executing rollback...');

                const rollbackPlan = await validator.createRollbackPlan('$migration_id');
                const success = await validator.executeRollback(rollbackPlan);

                if (success) {
                    console.log('✅ Rollback executed successfully');
                    process.exit(0);
                } else {
                    console.log('❌ Rollback execution failed');
                    process.exit(1);
                }

            } catch (error) {
                console.error('❌ Rollback execution error:', error.message);
                process.exit(1);
            } finally {
                await prisma.\$disconnect();
            }
        }

        executeRollback();
    ")

    local exit_code=$?

    if [[ $exit_code -eq 0 ]]; then
        log_success "Rollback executed successfully"
        return 0
    else
        log_error "Rollback execution failed"
        return 1
    fi
}

# Verify rollback success
verify_rollback() {
    local migration_id="$1"

    log_info "Verifying rollback success..."

    cd apps/api

    # Check migration status
    local migration_status
    migration_status=$(npx prisma migrate status 2>&1 || true)

    if echo "$migration_status" | grep -q "Following migration have not yet been applied"; then
        log_success "Rollback verification: Migration $migration_id is no longer applied"
    elif echo "$migration_status" | grep -q "Database schema is up to date"; then
        log_warning "Rollback verification: Database reports up to date status"
    else
        log_warning "Rollback verification: Could not determine migration status"
        echo "$migration_status"
    fi

    # Run basic database connectivity test
    if node -e "
        const { PrismaClient } = require('@prisma/client');
        const prisma = new PrismaClient();

        async function testConnection() {
            try {
                await prisma.\$queryRaw\`SELECT 1\`;
                console.log('✅ Database connectivity test passed');
                process.exit(0);
            } catch (error) {
                console.error('❌ Database connectivity test failed:', error.message);
                process.exit(1);
            } finally {
                await prisma.\$disconnect();
            }
        }

        testConnection();
    "; then
        log_success "Database connectivity verified after rollback"
    else
        log_error "Database connectivity issues detected after rollback"
        return 1
    fi

    log_success "Rollback verification completed successfully"
}

# Generate rollback report
generate_rollback_report() {
    local migration_id="$1"
    local backup_file="$2"
    local success="$3"

    log_info "Generating rollback report..."

    local report_file="migration-rollback-report-$(date +%Y%m%d_%H%M%S).json"

    cat > "$report_file" << EOF
{
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "environment": "$ENVIRONMENT",
  "migration_id": "$migration_id",
  "rollback_type": "automated",
  "dry_run": $DRY_RUN,
  "success": $success,
  "backup_file": "$backup_file",
  "executed_by": "$(whoami)",
  "hostname": "$(hostname)",
  "database_url": "${DATABASE_URL%/*}/[DATABASE]",
  "verification_status": "completed",
  "recommendations": [
    "Monitor database performance after rollback",
    "Verify application functionality",
    "Review rollback logs for any warnings",
    "Consider fixing the rolled-back migration before retry"
  ]
}
EOF

    log_success "Rollback report generated: $report_file"
}

# Confirmation prompt
confirm_rollback() {
    local migration_id="$1"
    local rollback_plan="$2"

    if [[ "$CONFIRMATION_REQUIRED" != "true" ]]; then
        return 0
    fi

    echo ""
    log_warning "🚨 ROLLBACK CONFIRMATION REQUIRED"
    log_warning "=================================="
    log_warning "Environment: $ENVIRONMENT"
    log_warning "Migration: $migration_id"
    log_warning "Dry Run: $DRY_RUN"

    local affected_tables=$(echo "$rollback_plan" | jq -r '.affectedTables')
    local steps_count=$(echo "$rollback_plan" | jq -r '.rollbackSteps')

    log_warning "Affected Tables: $affected_tables"
    log_warning "Rollback Steps: $steps_count"
    echo ""

    if [[ "$ENVIRONMENT" == "production" ]]; then
        log_error "⚠️ THIS IS A PRODUCTION ROLLBACK!"
        log_error "This action will modify the production database"
        echo ""
    fi

    read -p "Type 'ROLLBACK' to confirm this action: " -r
    if [[ "$REPLY" != "ROLLBACK" ]]; then
        log_info "Rollback cancelled by user"
        exit 0
    fi

    log_info "Rollback confirmed by user"
}

# Main function
main() {
    echo ""
    log_error "🔄 DATABASE MIGRATION ROLLBACK"
    log_error "=============================="
    log_error "Environment: $ENVIRONMENT"
    log_error "Migration ID: ${MIGRATION_ID:-'Auto-detect latest'}"
    log_error "Dry Run: $DRY_RUN"
    echo ""

    # Validate environment and check prerequisites
    validate_environment
    check_prerequisites

    # Get target migration
    local target_migration
    target_migration=$(get_target_migration)
    log_info "Target migration for rollback: $target_migration"

    # Create backup unless dry run
    local backup_file=""
    if [[ "$DRY_RUN" != "true" ]]; then
        backup_file=$(create_backup)
    else
        log_info "Skipping backup creation (dry run mode)"
    fi

    # Generate rollback plan
    local rollback_plan
    rollback_plan=$(generate_rollback_plan "$target_migration")

    # Validate rollback safety
    validate_rollback_safety "$rollback_plan"

    # Confirm rollback
    confirm_rollback "$target_migration" "$rollback_plan"

    # Execute rollback
    local rollback_success="false"
    if execute_rollback "$target_migration" "$rollback_plan"; then
        rollback_success="true"

        # Verify rollback if not dry run
        if [[ "$DRY_RUN" != "true" ]]; then
            verify_rollback "$target_migration"
        fi

        log_success "🎉 Migration rollback completed successfully!"
    else
        log_error "❌ Migration rollback failed!"
    fi

    # Generate rollback report
    generate_rollback_report "$target_migration" "$backup_file" "$rollback_success"

    # Exit with appropriate code
    if [[ "$rollback_success" == "true" ]]; then
        exit 0
    else
        exit 1
    fi
}

# Help function
show_help() {
    echo "Usage: $0 [environment] [migration_id] [confirmation_required] [dry_run]"
    echo ""
    echo "Arguments:"
    echo "  environment           Target environment (development|staging|production) [default: production]"
    echo "  migration_id          Specific migration ID to rollback [default: latest]"
    echo "  confirmation_required Require manual confirmation (true|false) [default: true]"
    echo "  dry_run              Run in dry-run mode without executing (true|false) [default: false]"
    echo ""
    echo "Examples:"
    echo "  $0 development                                    # Rollback latest migration in development"
    echo "  $0 production 20241120000000_add_user_table      # Rollback specific migration in production"
    echo "  $0 staging \"\" false true                          # Dry run rollback in staging without confirmation"
    echo ""
    echo "Environment Variables:"
    echo "  DATABASE_URL         Database connection string (required)"
    echo ""
}

# Check for help flag
if [[ "${1:-}" == "--help" ]] || [[ "${1:-}" == "-h" ]]; then
    show_help
    exit 0
fi

# Execute main function
main "$@"