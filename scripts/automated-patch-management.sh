#!/bin/bash

# Automated Patch Management System
# Manages vulnerability remediation and dependency updates
# Integrates with security scanning pipeline for automated fixes

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PATCHES_DIR="$PROJECT_ROOT/security-patches"
REPORTS_DIR="$PROJECT_ROOT/reports/patch-management"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")

# Create directories
mkdir -p "$PATCHES_DIR"
mkdir -p "$REPORTS_DIR"

# Logging function
log() {
    local level=$1
    shift
    local message="$*"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')

    case $level in
        "INFO")
            echo -e "${BLUE}[INFO]${NC} $timestamp - $message"
            ;;
        "WARN")
            echo -e "${YELLOW}[WARN]${NC} $timestamp - $message"
            ;;
        "ERROR")
            echo -e "${RED}[ERROR]${NC} $timestamp - $message"
            ;;
        "SUCCESS")
            echo -e "${GREEN}[SUCCESS]${NC} $timestamp - $message"
            ;;
    esac

    echo "[$level] $timestamp - $message" >> "$REPORTS_DIR/patch-management-$TIMESTAMP.log"
}

# Function to check if tools are installed
check_dependencies() {
    log "INFO" "Checking required dependencies..."

    local missing_tools=()

    # Check for Node.js and npm
    if ! command -v node &> /dev/null; then
        missing_tools+=("node")
    fi

    if ! command -v npm &> /dev/null; then
        missing_tools+=("npm")
    fi

    # Check for pnpm
    if ! command -v pnpm &> /dev/null; then
        missing_tools+=("pnpm")
    fi

    # Check for security tools
    if ! command -v snyk &> /dev/null; then
        log "WARN" "Snyk not found - attempting to install..."
        npm install -g snyk || missing_tools+=("snyk")
    fi

    if ! command -v trivy &> /dev/null; then
        log "WARN" "Trivy not found - attempting to install..."
        if command -v brew &> /dev/null; then
            brew install trivy || missing_tools+=("trivy")
        else
            missing_tools+=("trivy")
        fi
    fi

    if [ ${#missing_tools[@]} -ne 0 ]; then
        log "ERROR" "Missing required tools: ${missing_tools[*]}"
        log "ERROR" "Please install missing dependencies and try again"
        exit 1
    fi

    log "SUCCESS" "All required dependencies are available"
}

# Function to backup current state
backup_current_state() {
    log "INFO" "Creating backup of current state..."

    local backup_dir="$PATCHES_DIR/backups/backup-$TIMESTAMP"
    mkdir -p "$backup_dir"

    # Backup package files
    find "$PROJECT_ROOT" -name "package.json" -not -path "*/node_modules/*" | while read -r package_file; do
        local relative_path="${package_file#$PROJECT_ROOT/}"
        local backup_path="$backup_dir/${relative_path%/*}"
        mkdir -p "$backup_path"
        cp "$package_file" "$backup_path/"

        # Also backup lock files if they exist
        local lock_file="${package_file%package.json}package-lock.json"
        if [ -f "$lock_file" ]; then
            cp "$lock_file" "$backup_path/"
        fi

        local pnpm_lock="${package_file%package.json}pnpm-lock.yaml"
        if [ -f "$pnpm_lock" ]; then
            cp "$pnpm_lock" "$backup_path/"
        fi
    done

    # Backup Dockerfile and docker-compose files
    find "$PROJECT_ROOT" -name "Dockerfile*" -o -name "docker-compose*.yml" | while read -r docker_file; do
        local relative_path="${docker_file#$PROJECT_ROOT/}"
        local backup_path="$backup_dir/${relative_path%/*}"
        mkdir -p "$backup_path"
        cp "$docker_file" "$backup_path/"
    done

    log "SUCCESS" "Backup created at: $backup_dir"
    echo "$backup_dir" > "$PATCHES_DIR/latest-backup.txt"
}

# Function to scan for vulnerabilities
scan_vulnerabilities() {
    log "INFO" "Scanning for vulnerabilities..."

    local scan_report="$REPORTS_DIR/vulnerability-scan-$TIMESTAMP.json"

    # Initialize scan report
    cat > "$scan_report" << 'EOF'
{
  "timestamp": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "scanType": "patch-management",
  "results": {
    "snyk": {},
    "npm_audit": {},
    "trivy": {}
  }
}
EOF

    # Run Snyk scan for all projects
    log "INFO" "Running Snyk vulnerability scan..."
    if snyk auth "$SNYK_TOKEN" 2>/dev/null; then
        # Scan root project
        snyk test --json > "$REPORTS_DIR/snyk-root-$TIMESTAMP.json" 2>/dev/null || true

        # Scan individual apps
        for app_dir in "$PROJECT_ROOT"/apps/*/; do
            if [ -f "$app_dir/package.json" ]; then
                app_name=$(basename "$app_dir")
                log "INFO" "Scanning $app_name with Snyk..."

                cd "$app_dir"
                snyk test --json > "$REPORTS_DIR/snyk-$app_name-$TIMESTAMP.json" 2>/dev/null || true
                cd "$PROJECT_ROOT"
            fi
        done
    else
        log "WARN" "Snyk authentication failed - using anonymous scan"
    fi

    # Run npm audit for all projects
    log "INFO" "Running npm audit..."
    find "$PROJECT_ROOT" -name "package.json" -not -path "*/node_modules/*" | while read -r package_file; do
        local dir=$(dirname "$package_file")
        local app_name=$(basename "$dir")

        log "INFO" "Running npm audit for $app_name..."
        cd "$dir"

        # Run npm audit and save results
        npm audit --json > "$REPORTS_DIR/npm-audit-$app_name-$TIMESTAMP.json" 2>/dev/null || true
        cd "$PROJECT_ROOT"
    done

    # Run Trivy for container vulnerabilities
    log "INFO" "Running Trivy container scan..."
    find "$PROJECT_ROOT" -name "Dockerfile" | while read -r dockerfile; do
        local dir=$(dirname "$dockerfile")
        local app_name=$(basename "$dir")

        log "INFO" "Scanning $app_name container with Trivy..."

        # Build temporary image for scanning
        docker build -t "temp-$app_name:scan" -f "$dockerfile" "$PROJECT_ROOT" >/dev/null 2>&1 || continue

        # Scan image
        trivy image --format json --output "$REPORTS_DIR/trivy-$app_name-$TIMESTAMP.json" "temp-$app_name:scan" 2>/dev/null || true

        # Cleanup temporary image
        docker rmi "temp-$app_name:scan" >/dev/null 2>&1 || true
    done

    log "SUCCESS" "Vulnerability scanning completed"
}

# Function to identify patchable vulnerabilities
identify_patchable_vulnerabilities() {
    log "INFO" "Identifying patchable vulnerabilities..."

    local patch_plan="$REPORTS_DIR/patch-plan-$TIMESTAMP.json"

    cat > "$patch_plan" << 'EOF'
{
  "timestamp": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "patches": {
    "automatic": [],
    "manual": [],
    "dependency_updates": [],
    "container_updates": []
  },
  "summary": {
    "total_vulnerabilities": 0,
    "patchable_vulnerabilities": 0,
    "automatic_fixes": 0,
    "manual_fixes": 0
  }
}
EOF

    local total_vulnerabilities=0
    local patchable_vulnerabilities=0
    local automatic_fixes=0

    # Process Snyk results
    for snyk_file in "$REPORTS_DIR"/snyk-*-"$TIMESTAMP".json; do
        if [ -f "$snyk_file" ]; then
            log "INFO" "Processing $(basename "$snyk_file")..."

            # Extract patchable vulnerabilities
            if jq -e '.vulnerabilities' "$snyk_file" >/dev/null 2>&1; then
                local vulns=$(jq '.vulnerabilities | length' "$snyk_file")
                local patchable=$(jq '[.vulnerabilities[] | select(.isUpgradable == true or .isPatchable == true)] | length' "$snyk_file")

                total_vulnerabilities=$((total_vulnerabilities + vulns))
                patchable_vulnerabilities=$((patchable_vulnerabilities + patchable))

                # Extract upgrade paths
                jq -r '.vulnerabilities[] | select(.isUpgradable == true) | "\(.from[0])@\(.upgradePath[1] // "latest")"' "$snyk_file" | while read -r upgrade; do
                    if [ -n "$upgrade" ]; then
                        echo "npm upgrade for: $upgrade" >> "$PATCHES_DIR/automatic-patches-$TIMESTAMP.txt"
                        automatic_fixes=$((automatic_fixes + 1))
                    fi
                done
            fi
        fi
    done

    # Process npm audit results
    for audit_file in "$REPORTS_DIR"/npm-audit-*-"$TIMESTAMP".json; do
        if [ -f "$audit_file" ]; then
            log "INFO" "Processing $(basename "$audit_file")..."

            # Extract fixable vulnerabilities
            if jq -e '.vulnerabilities' "$audit_file" >/dev/null 2>&1; then
                jq -r '.vulnerabilities | to_entries[] | select(.value.fixAvailable != false) | "\(.key)@\(.value.fixAvailable.version // "latest")"' "$audit_file" | while read -r fix; do
                    if [ -n "$fix" ]; then
                        echo "npm fix for: $fix" >> "$PATCHES_DIR/automatic-patches-$TIMESTAMP.txt"
                    fi
                done
            fi
        fi
    done

    # Update patch plan with results
    jq --arg total "$total_vulnerabilities" \
       --arg patchable "$patchable_vulnerabilities" \
       --arg automatic "$automatic_fixes" \
       '.summary.total_vulnerabilities = ($total | tonumber) |
        .summary.patchable_vulnerabilities = ($patchable | tonumber) |
        .summary.automatic_fixes = ($automatic | tonumber)' \
       "$patch_plan" > "$patch_plan.tmp" && mv "$patch_plan.tmp" "$patch_plan"

    log "SUCCESS" "Identified $patchable_vulnerabilities patchable vulnerabilities out of $total_vulnerabilities total"
    log "INFO" "Automatic fixes available: $automatic_fixes"
}

# Function to apply automatic patches
apply_automatic_patches() {
    local dry_run=${1:-false}

    if [ "$dry_run" = "true" ]; then
        log "INFO" "Running in DRY RUN mode - no changes will be applied"
    else
        log "INFO" "Applying automatic patches..."
    fi

    local patches_applied=0
    local patches_failed=0

    # Apply npm audit fixes
    find "$PROJECT_ROOT" -name "package.json" -not -path "*/node_modules/*" | while read -r package_file; do
        local dir=$(dirname "$package_file")
        local app_name=$(basename "$dir")

        log "INFO" "Applying npm audit fixes for $app_name..."
        cd "$dir"

        if [ "$dry_run" = "true" ]; then
            # Show what would be fixed
            npm audit fix --dry-run 2>/dev/null | tee "$REPORTS_DIR/npm-fix-dry-run-$app_name-$TIMESTAMP.txt" || true
        else
            # Apply fixes
            if npm audit fix --force >/dev/null 2>&1; then
                log "SUCCESS" "Applied npm audit fixes for $app_name"
                patches_applied=$((patches_applied + 1))
            else
                log "ERROR" "Failed to apply npm audit fixes for $app_name"
                patches_failed=$((patches_failed + 1))
            fi
        fi

        cd "$PROJECT_ROOT"
    done

    # Apply Snyk patches
    if [ -f "$PATCHES_DIR/automatic-patches-$TIMESTAMP.txt" ]; then
        while read -r patch; do
            if [ -n "$patch" ]; then
                log "INFO" "Applying patch: $patch"

                if [ "$dry_run" = "true" ]; then
                    echo "Would apply: $patch" >> "$REPORTS_DIR/patches-dry-run-$TIMESTAMP.txt"
                else
                    # Apply the patch based on type
                    if [[ "$patch" == *"npm upgrade"* ]]; then
                        local package_spec=$(echo "$patch" | cut -d' ' -f4)
                        local package_name=$(echo "$package_spec" | cut -d'@' -f1)
                        local package_version=$(echo "$package_spec" | cut -d'@' -f2)

                        # Find which project needs this update
                        find "$PROJECT_ROOT" -name "package.json" -not -path "*/node_modules/*" | while read -r pjson; do
                            if grep -q "\"$package_name\"" "$pjson"; then
                                local dir=$(dirname "$pjson")
                                cd "$dir"

                                if npm install "$package_name@$package_version" >/dev/null 2>&1; then
                                    log "SUCCESS" "Updated $package_name to $package_version in $(basename "$dir")"
                                    patches_applied=$((patches_applied + 1))
                                else
                                    log "ERROR" "Failed to update $package_name in $(basename "$dir")"
                                    patches_failed=$((patches_failed + 1))
                                fi

                                cd "$PROJECT_ROOT"
                            fi
                        done
                    fi
                fi
            fi
        done < "$PATCHES_DIR/automatic-patches-$TIMESTAMP.txt"
    fi

    if [ "$dry_run" = "false" ]; then
        log "SUCCESS" "Patch application completed"
        log "INFO" "Patches applied: $patches_applied"
        log "INFO" "Patches failed: $patches_failed"
    fi
}

# Function to update container base images
update_container_images() {
    local dry_run=${1:-false}

    log "INFO" "Updating container base images..."

    find "$PROJECT_ROOT" -name "Dockerfile" | while read -r dockerfile; do
        local dir=$(dirname "$dockerfile")
        local app_name=$(basename "$dir")

        log "INFO" "Checking base image updates for $app_name..."

        # Extract FROM lines
        grep "^FROM" "$dockerfile" | while read -r from_line; do
            local base_image=$(echo "$from_line" | awk '{print $2}')

            if [[ "$base_image" != *":"* ]]; then
                # No tag specified, already using latest
                continue
            fi

            local image_name=$(echo "$base_image" | cut -d':' -f1)
            local current_tag=$(echo "$base_image" | cut -d':' -f2)

            # Check for security updates
            log "INFO" "Checking for updates to $image_name:$current_tag..."

            if [ "$dry_run" = "true" ]; then
                echo "Would check for updates to: $base_image" >> "$REPORTS_DIR/image-updates-dry-run-$TIMESTAMP.txt"
            else
                # Pull latest image info (this is a simplified approach)
                if docker pull "$image_name:latest" >/dev/null 2>&1; then
                    local latest_digest=$(docker inspect --format='{{index .RepoDigests 0}}' "$image_name:latest" 2>/dev/null || echo "")
                    local current_digest=$(docker inspect --format='{{index .RepoDigests 0}}' "$base_image" 2>/dev/null || echo "")

                    if [ "$latest_digest" != "$current_digest" ] && [ -n "$latest_digest" ]; then
                        log "INFO" "Update available for $base_image"

                        # Create updated Dockerfile
                        sed "s|FROM $base_image|FROM $image_name:latest|g" "$dockerfile" > "$dockerfile.updated"

                        # Test build to ensure it works
                        if docker build -t "test-update-$app_name" -f "$dockerfile.updated" "$PROJECT_ROOT" >/dev/null 2>&1; then
                            mv "$dockerfile.updated" "$dockerfile"
                            log "SUCCESS" "Updated base image for $app_name"

                            # Cleanup test image
                            docker rmi "test-update-$app_name" >/dev/null 2>&1 || true
                        else
                            rm -f "$dockerfile.updated"
                            log "ERROR" "Failed to update base image for $app_name - build failed"
                        fi
                    fi
                fi
            fi
        done
    done
}

# Function to validate patches
validate_patches() {
    log "INFO" "Validating applied patches..."

    local validation_failed=false

    # Run tests to ensure patches don't break functionality
    find "$PROJECT_ROOT" -name "package.json" -not -path "*/node_modules/*" | while read -r package_file; do
        local dir=$(dirname "$package_file")
        local app_name=$(basename "$dir")

        cd "$dir"

        # Check if test script exists
        if npm run test --dry-run >/dev/null 2>&1; then
            log "INFO" "Running tests for $app_name..."

            if npm test >/dev/null 2>&1; then
                log "SUCCESS" "Tests passed for $app_name"
            else
                log "ERROR" "Tests failed for $app_name after patching"
                validation_failed=true
            fi
        else
            log "WARN" "No test script found for $app_name"
        fi

        cd "$PROJECT_ROOT"
    done

    # Build containers to ensure they still work
    find "$PROJECT_ROOT" -name "Dockerfile" | while read -r dockerfile; do
        local dir=$(dirname "$dockerfile")
        local app_name=$(basename "$dir")

        log "INFO" "Testing container build for $app_name..."

        if docker build -t "validation-$app_name" -f "$dockerfile" "$PROJECT_ROOT" >/dev/null 2>&1; then
            log "SUCCESS" "Container build successful for $app_name"
            docker rmi "validation-$app_name" >/dev/null 2>&1 || true
        else
            log "ERROR" "Container build failed for $app_name after patching"
            validation_failed=true
        fi
    done

    if [ "$validation_failed" = "true" ]; then
        log "ERROR" "Patch validation failed - consider rolling back"
        return 1
    else
        log "SUCCESS" "All patch validations passed"
        return 0
    fi
}

# Function to rollback patches
rollback_patches() {
    log "INFO" "Rolling back patches..."

    if [ ! -f "$PATCHES_DIR/latest-backup.txt" ]; then
        log "ERROR" "No backup found - cannot rollback"
        exit 1
    fi

    local backup_dir=$(cat "$PATCHES_DIR/latest-backup.txt")

    if [ ! -d "$backup_dir" ]; then
        log "ERROR" "Backup directory not found: $backup_dir"
        exit 1
    fi

    log "INFO" "Restoring from backup: $backup_dir"

    # Restore all backed up files
    find "$backup_dir" -type f | while read -r backup_file; do
        local relative_path="${backup_file#$backup_dir/}"
        local restore_path="$PROJECT_ROOT/$relative_path"

        # Create directory if it doesn't exist
        local restore_dir=$(dirname "$restore_path")
        mkdir -p "$restore_dir"

        # Restore file
        cp "$backup_file" "$restore_path"
        log "INFO" "Restored: $relative_path"
    done

    # Reinstall dependencies to match restored package files
    find "$PROJECT_ROOT" -name "package.json" -not -path "*/node_modules/*" | while read -r package_file; do
        local dir=$(dirname "$package_file")
        local app_name=$(basename "$dir")

        log "INFO" "Reinstalling dependencies for $app_name..."
        cd "$dir"

        # Remove node_modules and reinstall
        rm -rf node_modules package-lock.json pnpm-lock.yaml 2>/dev/null || true

        if [ -f "pnpm-lock.yaml" ]; then
            pnpm install --frozen-lockfile >/dev/null 2>&1 || pnpm install >/dev/null 2>&1
        else
            npm install >/dev/null 2>&1
        fi

        cd "$PROJECT_ROOT"
    done

    log "SUCCESS" "Rollback completed successfully"
}

# Function to generate patch report
generate_patch_report() {
    log "INFO" "Generating patch management report..."

    local report_file="$REPORTS_DIR/patch-report-$TIMESTAMP.md"

    cat > "$report_file" << EOF
# Automated Patch Management Report

**Generated**: $(date -u +"%Y-%m-%d %H:%M:%S UTC")
**Timestamp**: $TIMESTAMP
**Project**: Urnlabs AI Platform

## Executive Summary

This report summarizes the automated patch management process, including
vulnerability scanning, patch identification, and remediation actions.

## Vulnerability Scan Results

EOF

    # Add vulnerability counts from scan results
    local total_vulns=0
    local patchable_vulns=0

    for scan_file in "$REPORTS_DIR"/*-"$TIMESTAMP".json; do
        if [ -f "$scan_file" ]; then
            local tool=$(basename "$scan_file" | cut -d'-' -f1)
            local app=$(basename "$scan_file" | cut -d'-' -f2)

            echo "### $tool - $app" >> "$report_file"

            if [[ "$tool" == "snyk" ]]; then
                local vulns=$(jq '.vulnerabilities | length' "$scan_file" 2>/dev/null || echo "0")
                local patchable=$(jq '[.vulnerabilities[] | select(.isUpgradable == true or .isPatchable == true)] | length' "$scan_file" 2>/dev/null || echo "0")

                echo "- Total vulnerabilities: $vulns" >> "$report_file"
                echo "- Patchable vulnerabilities: $patchable" >> "$report_file"

                total_vulns=$((total_vulns + vulns))
                patchable_vulns=$((patchable_vulns + patchable))
            fi

            echo "" >> "$report_file"
        fi
    done

    cat >> "$report_file" << EOF

## Summary Statistics

- **Total Vulnerabilities Found**: $total_vulns
- **Patchable Vulnerabilities**: $patchable_vulns
- **Patch Success Rate**: $(if [ $total_vulns -gt 0 ]; then echo "scale=2; $patchable_vulns * 100 / $total_vulns" | bc; else echo "0"; fi)%

## Remediation Actions

### Automatic Patches Applied

EOF

    if [ -f "$PATCHES_DIR/automatic-patches-$TIMESTAMP.txt" ]; then
        cat "$PATCHES_DIR/automatic-patches-$TIMESTAMP.txt" | while read -r patch; do
            echo "- $patch" >> "$report_file"
        done
    else
        echo "No automatic patches were applied." >> "$report_file"
    fi

    cat >> "$report_file" << EOF

### Manual Actions Required

EOF

    # Add manual remediation recommendations
    echo "Review the following for manual remediation:" >> "$report_file"
    echo "" >> "$report_file"

    for scan_file in "$REPORTS_DIR"/snyk-*-"$TIMESTAMP".json; do
        if [ -f "$scan_file" ]; then
            jq -r '.vulnerabilities[] | select(.isUpgradable == false and .isPatchable == false) | "- \(.title) (\(.severity)): \(.description | .[0:100])..."' "$scan_file" >> "$report_file" 2>/dev/null || true
        fi
    done

    cat >> "$report_file" << EOF

## Next Steps

1. **Immediate Actions**
   - Review and test all applied patches
   - Address any manual remediation items
   - Monitor for new vulnerabilities

2. **Ongoing Process**
   - Schedule regular patch management cycles
   - Implement automated vulnerability monitoring
   - Update security policies based on findings

## Files Generated

- Scan results: \`$REPORTS_DIR/*-$TIMESTAMP.json\`
- Patch logs: \`$REPORTS_DIR/patch-management-$TIMESTAMP.log\`
- Backup location: \`$(cat "$PATCHES_DIR/latest-backup.txt" 2>/dev/null || echo "N/A")\`

---
*This report was generated by the automated patch management system.*
EOF

    log "SUCCESS" "Patch report generated: $report_file"
}

# Main function
main() {
    local action=${1:-"scan"}
    local dry_run=${2:-"false"}

    log "INFO" "Starting automated patch management - Action: $action"

    case $action in
        "scan")
            check_dependencies
            scan_vulnerabilities
            identify_patchable_vulnerabilities
            generate_patch_report
            ;;
        "patch")
            check_dependencies
            backup_current_state
            scan_vulnerabilities
            identify_patchable_vulnerabilities
            apply_automatic_patches "$dry_run"
            update_container_images "$dry_run"

            if [ "$dry_run" = "false" ]; then
                if validate_patches; then
                    log "SUCCESS" "Patch management completed successfully"
                else
                    log "ERROR" "Patch validation failed"
                    rollback_patches
                fi
            fi

            generate_patch_report
            ;;
        "rollback")
            rollback_patches
            ;;
        "validate")
            validate_patches
            ;;
        *)
            echo "Usage: $0 {scan|patch|rollback|validate} [dry-run]"
            echo ""
            echo "Actions:"
            echo "  scan     - Scan for vulnerabilities and identify patches"
            echo "  patch    - Apply automatic patches and updates"
            echo "  rollback - Rollback to previous state"
            echo "  validate - Validate current state after patching"
            echo ""
            echo "Options:"
            echo "  dry-run  - Show what would be done without making changes"
            exit 1
            ;;
    esac
}

# Run script with provided arguments
main "$@"