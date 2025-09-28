#!/bin/bash

# Security Testing Script
# Usage: ./scripts/security/run-security-tests.sh [test-type] [environment]

set -euo pipefail

# Script configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
RESULTS_DIR="${PROJECT_ROOT}/test-results"
SECURITY_CONFIG="${PROJECT_ROOT}/config/security"

# Default values
TEST_TYPE="${1:-all}"
ENVIRONMENT="${2:-development}"
VERBOSE="${VERBOSE:-false}"
PARALLEL="${PARALLEL:-true}"
REPORT_FORMAT="${REPORT_FORMAT:-json}"

# Colors for output
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

# Cleanup function
cleanup() {
    log_info "Cleaning up temporary files..."
    rm -f /tmp/security-test-*.tmp
}

# Set up cleanup trap
trap cleanup EXIT

# Usage information
usage() {
    cat << EOF
Security Testing Script

USAGE:
    $0 [TEST_TYPE] [ENVIRONMENT]

TEST_TYPES:
    all                 - Run all security tests (default)
    static              - Static analysis only
    dynamic             - Dynamic analysis only
    dependencies        - Dependency vulnerability scanning
    secrets             - Secrets detection
    penetration         - Penetration testing
    compliance          - Compliance validation
    threat-detection    - Threat detection testing
    infrastructure      - Infrastructure security tests
    gates               - Security gates validation

ENVIRONMENTS:
    development         - Development environment (default)
    staging             - Staging environment
    production          - Production environment

ENVIRONMENT VARIABLES:
    VERBOSE=true        - Enable verbose output
    PARALLEL=false      - Disable parallel execution
    REPORT_FORMAT=html  - Output format (json, html, xml)
    SECURITY_LEVEL=high - Security test level (basic, medium, high)

EXAMPLES:
    $0                                  # Run all tests in development
    $0 static staging                   # Run static analysis in staging
    $0 penetration production           # Run penetration tests in production
    VERBOSE=true $0 all development     # Run all tests with verbose output

EOF
}

# Check if help is requested
if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
    usage
    exit 0
fi

# Create results directory
mkdir -p "${RESULTS_DIR}"

# Environment validation
validate_environment() {
    log_info "Validating environment: ${ENVIRONMENT}"

    case "${ENVIRONMENT}" in
        development|staging|production)
            log_success "Environment validation passed"
            ;;
        *)
            log_error "Invalid environment: ${ENVIRONMENT}"
            usage
            exit 1
            ;;
    esac
}

# Prerequisites check
check_prerequisites() {
    log_info "Checking prerequisites..."

    local missing_tools=()

    # Check Node.js
    if ! command -v node &> /dev/null; then
        missing_tools+=("node")
    fi

    # Check npm
    if ! command -v npm &> /dev/null; then
        missing_tools+=("npm")
    fi

    # Check Docker (for infrastructure tests)
    if [[ "${TEST_TYPE}" == "all" || "${TEST_TYPE}" == "infrastructure" ]]; then
        if ! command -v docker &> /dev/null; then
            missing_tools+=("docker")
        fi
    fi

    # Check security tools based on test type
    case "${TEST_TYPE}" in
        all|static|secrets)
            if ! command -v semgrep &> /dev/null; then
                log_warning "Semgrep not found, will install via npm"
            fi
            ;;
    esac

    if [[ ${#missing_tools[@]} -gt 0 ]]; then
        log_error "Missing required tools: ${missing_tools[*]}"
        exit 1
    fi

    log_success "Prerequisites check passed"
}

# Install security tools
install_security_tools() {
    log_info "Installing security tools..."

    # Install npm security tools
    npm install -g semgrep snyk audit-ci

    # Install or update security dependencies
    cd "${PROJECT_ROOT}"
    npm ci

    log_success "Security tools installed"
}

# Run static analysis
run_static_analysis() {
    log_info "Running static security analysis..."

    local output_file="${RESULTS_DIR}/static-analysis-report.json"

    # Run ESLint security rules
    npx eslint . --ext .js,.ts,.jsx,.tsx --config .eslintrc.security.js \
        --format json --output-file "${output_file}.eslint" || true

    # Run Semgrep
    semgrep --config=auto --json --output="${output_file}.semgrep" . || true

    # Run custom static analysis
    npm run test:security:static

    log_success "Static analysis completed"
}

# Run dynamic analysis
run_dynamic_analysis() {
    log_info "Running dynamic security analysis..."

    # Start test environment if needed
    if [[ "${ENVIRONMENT}" != "production" ]]; then
        log_info "Starting test environment..."
        docker-compose -f docker-compose-test.yml up -d
        sleep 30
    fi

    # Run dynamic tests
    npm run test:security:dynamic

    # Cleanup test environment
    if [[ "${ENVIRONMENT}" != "production" ]]; then
        docker-compose -f docker-compose-test.yml down -v
    fi

    log_success "Dynamic analysis completed"
}

# Run dependency vulnerability scanning
run_dependency_scan() {
    log_info "Running dependency vulnerability scan..."

    # Run npm audit
    npm audit --json > "${RESULTS_DIR}/npm-audit.json" || true

    # Run Snyk scan
    if command -v snyk &> /dev/null; then
        snyk test --json > "${RESULTS_DIR}/snyk-report.json" || true
    fi

    # Run custom dependency scan
    npm run test:security:dependencies

    log_success "Dependency scan completed"
}

# Run secrets detection
run_secrets_detection() {
    log_info "Running secrets detection..."

    # Run TruffleHog
    if command -v trufflehog &> /dev/null; then
        trufflehog git file://. --json --no-update > "${RESULTS_DIR}/secrets-scan.json" || true
    fi

    # Run custom secrets detection
    npm run test:security:secrets

    log_success "Secrets detection completed"
}

# Run penetration testing
run_penetration_tests() {
    log_info "Running penetration tests..."

    if [[ "${ENVIRONMENT}" == "production" ]]; then
        log_warning "Penetration testing in production requires special authorization"
        read -p "Do you have authorization to run penetration tests in production? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            log_info "Skipping penetration tests"
            return 0
        fi
    fi

    # Run penetration tests
    npm run test:security:penetration

    log_success "Penetration testing completed"
}

# Run compliance validation
run_compliance_validation() {
    log_info "Running compliance validation..."

    # Run compliance tests
    npm run test:security:compliance

    log_success "Compliance validation completed"
}

# Run threat detection testing
run_threat_detection_tests() {
    log_info "Running threat detection tests..."

    # Run threat detection validation
    npm run test:security:threat-detection

    log_success "Threat detection testing completed"
}

# Run infrastructure security tests
run_infrastructure_tests() {
    log_info "Running infrastructure security tests..."

    # Run Docker security scan
    if command -v docker &> /dev/null; then
        log_info "Scanning Docker images..."
        # Scan all project Docker images
        for dockerfile in $(find . -name "Dockerfile*"); do
            image_name="security-test:$(basename $(dirname $dockerfile))"
            docker build -t "$image_name" -f "$dockerfile" . || continue

            # Run Trivy scan
            if command -v trivy &> /dev/null; then
                trivy image --format json --output "${RESULTS_DIR}/trivy-$(basename $(dirname $dockerfile)).json" "$image_name" || true
            fi
        done
    fi

    # Run infrastructure tests
    npm run test:security:infrastructure

    log_success "Infrastructure security tests completed"
}

# Run security gates
run_security_gates() {
    log_info "Running security gates validation..."

    # Run security gates for environment
    npm run test:security:gates -- --environment="${ENVIRONMENT}"

    log_success "Security gates validation completed"
}

# Generate comprehensive report
generate_report() {
    log_info "Generating security report..."

    local report_file="${RESULTS_DIR}/security-report.${REPORT_FORMAT}"

    # Run report generation
    npm run test:security:report -- --format="${REPORT_FORMAT}" --output="${report_file}"

    log_success "Security report generated: ${report_file}"
}

# Main execution
main() {
    log_info "Starting security testing..."
    log_info "Test Type: ${TEST_TYPE}"
    log_info "Environment: ${ENVIRONMENT}"
    log_info "Results Directory: ${RESULTS_DIR}"

    # Validate and prepare
    validate_environment
    check_prerequisites

    # Install tools if needed
    if [[ "${CI:-false}" != "true" ]]; then
        install_security_tools
    fi

    # Record start time
    local start_time=$(date +%s)

    # Execute tests based on type
    case "${TEST_TYPE}" in
        all)
            log_info "Running comprehensive security test suite..."
            run_static_analysis
            run_dynamic_analysis
            run_dependency_scan
            run_secrets_detection
            if [[ "${ENVIRONMENT}" != "production" ]]; then
                run_penetration_tests
            fi
            run_compliance_validation
            run_threat_detection_tests
            run_infrastructure_tests
            run_security_gates
            ;;
        static)
            run_static_analysis
            ;;
        dynamic)
            run_dynamic_analysis
            ;;
        dependencies)
            run_dependency_scan
            ;;
        secrets)
            run_secrets_detection
            ;;
        penetration)
            run_penetration_tests
            ;;
        compliance)
            run_compliance_validation
            ;;
        threat-detection)
            run_threat_detection_tests
            ;;
        infrastructure)
            run_infrastructure_tests
            ;;
        gates)
            run_security_gates
            ;;
        *)
            log_error "Unknown test type: ${TEST_TYPE}"
            usage
            exit 1
            ;;
    esac

    # Generate report
    generate_report

    # Calculate execution time
    local end_time=$(date +%s)
    local execution_time=$((end_time - start_time))

    log_success "Security testing completed in ${execution_time} seconds"

    # Display summary
    if [[ -f "${RESULTS_DIR}/security-report.json" ]]; then
        local overall_score=$(jq -r '.overallScore // "N/A"' "${RESULTS_DIR}/security-report.json")
        local status=$(jq -r '.overallStatus // "UNKNOWN"' "${RESULTS_DIR}/security-report.json")

        echo ""
        echo "=================================="
        echo "SECURITY TEST SUMMARY"
        echo "=================================="
        echo "Environment: ${ENVIRONMENT}"
        echo "Test Type: ${TEST_TYPE}"
        echo "Overall Score: ${overall_score}"
        echo "Status: ${status}"
        echo "Execution Time: ${execution_time}s"
        echo "Results: ${RESULTS_DIR}"
        echo "=================================="
        echo ""

        # Exit with appropriate code
        if [[ "${status}" == "FAILED" ]]; then
            exit 1
        fi
    fi
}

# Run main function
main "$@"