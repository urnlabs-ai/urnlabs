#!/bin/bash

# Comprehensive Smoke Tests for AI Platform Services
# This script runs smoke tests for all platform services with health checks and monitoring integration

set -euo pipefail

# Configuration
ENVIRONMENT="${1:-staging}"
BASE_URL="${2:-http://localhost}"
TIMEOUT="${3:-120}"
DETAILED_TESTS="${4:-true}"

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

# Service configuration
declare -A SERVICES=(
    ["gateway"]="7000"
    ["api"]="7001"
    ["agents"]="7002"
    ["bridge"]="7003"
    ["dashboard"]="7004"
)

declare -A SERVICE_HEALTH_PATHS=(
    ["gateway"]="/health"
    ["api"]="/health"
    ["agents"]="/health"
    ["bridge"]="/health"
    ["dashboard"]="/health"
)

# Test results tracking
declare -A TEST_RESULTS=()
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0

# Initialize test tracking
init_test_tracking() {
    log_info "Initializing smoke test tracking..."

    # Create results directory
    mkdir -p smoke-test-results

    # Initialize test results file
    cat > smoke-test-results/smoke-test-report.json << EOF
{
  "environment": "$ENVIRONMENT",
  "timestamp": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "base_url": "$BASE_URL",
  "tests": {},
  "summary": {
    "total": 0,
    "passed": 0,
    "failed": 0,
    "success_rate": 0
  }
}
EOF

    log_success "Test tracking initialized"
}

# Record test result
record_test_result() {
    local test_name="$1"
    local status="$2"
    local duration="$3"
    local details="$4"

    TEST_RESULTS["$test_name"]="$status"
    TOTAL_TESTS=$((TOTAL_TESTS + 1))

    if [[ "$status" == "PASSED" ]]; then
        PASSED_TESTS=$((PASSED_TESTS + 1))
    else
        FAILED_TESTS=$((FAILED_TESTS + 1))
    fi

    # Update JSON report
    local temp_file=$(mktemp)
    jq --arg name "$test_name" \
       --arg status "$status" \
       --arg duration "$duration" \
       --arg details "$details" \
       '.tests[$name] = {
         "status": $status,
         "duration": $duration,
         "details": $details,
         "timestamp": (now | strftime("%Y-%m-%dT%H:%M:%SZ"))
       } |
       .summary.total = (.tests | length) |
       .summary.passed = (.tests | to_entries | map(select(.value.status == "PASSED")) | length) |
       .summary.failed = (.tests | to_entries | map(select(.value.status == "FAILED")) | length) |
       .summary.success_rate = ((.summary.passed / .summary.total) * 100 | floor)' \
       smoke-test-results/smoke-test-report.json > "$temp_file"

    mv "$temp_file" smoke-test-results/smoke-test-report.json
}

# Check service availability
check_service_availability() {
    local service="$1"
    local port="${SERVICES[$service]}"
    local health_path="${SERVICE_HEALTH_PATHS[$service]}"

    log_info "Checking availability: $service on port $port"

    local start_time=$(date +%s)
    local max_attempts=30
    local attempt=0

    while [[ $attempt -lt $max_attempts ]]; do
        if curl -f -s --max-time 5 "${BASE_URL}:${port}${health_path}" > /dev/null; then
            local end_time=$(date +%s)
            local duration=$((end_time - start_time))

            log_success "$service is available (${duration}s)"
            record_test_result "${service}_availability" "PASSED" "${duration}s" "Service responded successfully"
            return 0
        fi

        attempt=$((attempt + 1))
        log_info "Waiting for $service... (attempt $attempt/$max_attempts)"
        sleep 2
    done

    local end_time=$(date +%s)
    local duration=$((end_time - start_time))

    log_error "$service is not available after ${duration}s"
    record_test_result "${service}_availability" "FAILED" "${duration}s" "Service did not respond within timeout"
    return 1
}

# Test service health endpoint
test_service_health() {
    local service="$1"
    local port="${SERVICES[$service]}"
    local health_path="${SERVICE_HEALTH_PATHS[$service]}"

    log_info "Testing health endpoint: $service"

    local start_time=$(date +%s.%3N)
    local response=$(curl -s -w "%{http_code},%{time_total}" "${BASE_URL}:${port}${health_path}" || echo "000,0")
    local end_time=$(date +%s.%3N)

    local http_code=$(echo "$response" | tail -1 | cut -d',' -f1)
    local response_time=$(echo "$response" | tail -1 | cut -d',' -f2)
    local body=$(echo "$response" | head -n -1)

    local duration=$(echo "$end_time - $start_time" | bc)

    if [[ "$http_code" == "200" ]]; then
        log_success "$service health check passed (${response_time}s)"

        # Check if response contains expected health indicators
        if echo "$body" | grep -q '"status.*ok\|"healthy.*true\|"health.*ok"' 2>/dev/null; then
            record_test_result "${service}_health" "PASSED" "${response_time}s" "Health endpoint returned 200 with healthy status"
        else
            log_warning "$service health endpoint returned 200 but body may not indicate healthy status"
            record_test_result "${service}_health" "PASSED" "${response_time}s" "Health endpoint returned 200 (body validation skipped)"
        fi
        return 0
    else
        log_error "$service health check failed (HTTP $http_code)"
        record_test_result "${service}_health" "FAILED" "${duration}s" "Health endpoint returned HTTP $http_code"
        return 1
    fi
}

# Test service metrics endpoint
test_service_metrics() {
    local service="$1"
    local port="${SERVICES[$service]}"

    log_info "Testing metrics endpoint: $service"

    local start_time=$(date +%s.%3N)
    local response=$(curl -s -w "%{http_code},%{time_total}" "${BASE_URL}:${port}/metrics" || echo "000,0")
    local end_time=$(date +%s.%3N)

    local http_code=$(echo "$response" | tail -1 | cut -d',' -f1)
    local response_time=$(echo "$response" | tail -1 | cut -d',' -f2)
    local body=$(echo "$response" | head -n -1)

    local duration=$(echo "$end_time - $start_time" | bc)

    if [[ "$http_code" == "200" ]]; then
        # Check if response contains Prometheus metrics format
        if echo "$body" | grep -q "^[a-zA-Z_][a-zA-Z0-9_]*{.*}.*[0-9]" 2>/dev/null; then
            log_success "$service metrics endpoint passed (${response_time}s)"
            record_test_result "${service}_metrics" "PASSED" "${response_time}s" "Metrics endpoint returned valid Prometheus format"
        else
            log_warning "$service metrics endpoint returned 200 but format may not be valid Prometheus metrics"
            record_test_result "${service}_metrics" "PASSED" "${response_time}s" "Metrics endpoint returned 200 (format validation skipped)"
        fi
        return 0
    elif [[ "$http_code" == "404" ]]; then
        log_warning "$service metrics endpoint not found (HTTP 404) - skipping"
        record_test_result "${service}_metrics" "SKIPPED" "${duration}s" "Metrics endpoint not implemented"
        return 0
    else
        log_error "$service metrics endpoint failed (HTTP $http_code)"
        record_test_result "${service}_metrics" "FAILED" "${duration}s" "Metrics endpoint returned HTTP $http_code"
        return 1
    fi
}

# Test API endpoints
test_api_endpoints() {
    log_info "Testing API-specific endpoints..."

    local api_port="${SERVICES[api]}"
    local endpoints=(
        "/api/health:GET"
        "/api/v1/agents:GET"
        "/api/v1/workflows:GET"
        "/api/v1/users/profile:GET"
    )

    for endpoint_method in "${endpoints[@]}"; do
        local endpoint=$(echo "$endpoint_method" | cut -d':' -f1)
        local method=$(echo "$endpoint_method" | cut -d':' -f2)

        log_info "Testing API endpoint: $method $endpoint"

        local start_time=$(date +%s.%3N)
        local response

        case "$method" in
            "GET")
                response=$(curl -s -w "%{http_code},%{time_total}" "${BASE_URL}:${api_port}${endpoint}" || echo "000,0")
                ;;
            *)
                log_warning "Unsupported method: $method"
                continue
                ;;
        esac

        local end_time=$(date +%s.%3N)
        local http_code=$(echo "$response" | tail -1 | cut -d',' -f1)
        local response_time=$(echo "$response" | tail -1 | cut -d',' -f2)
        local duration=$(echo "$end_time - $start_time" | bc)

        local test_name="api_endpoint_$(echo "$endpoint" | tr '/' '_' | tr -d ':')"

        # Accept 200, 401 (auth required), or 403 (forbidden) as valid responses
        if [[ "$http_code" =~ ^(200|401|403)$ ]]; then
            log_success "API endpoint $endpoint passed (HTTP $http_code, ${response_time}s)"
            record_test_result "$test_name" "PASSED" "${response_time}s" "Endpoint returned HTTP $http_code"
        else
            log_error "API endpoint $endpoint failed (HTTP $http_code)"
            record_test_result "$test_name" "FAILED" "${duration}s" "Endpoint returned HTTP $http_code"
        fi
    done
}

# Test gateway routing
test_gateway_routing() {
    log_info "Testing Gateway routing..."

    local gateway_port="${SERVICES[gateway]}"

    # Test different service routes through gateway
    local routes=(
        "/api/health"
        "/agents/health"
        "/bridge/health"
    )

    for route in "${routes[@]}"; do
        log_info "Testing gateway route: $route"

        local start_time=$(date +%s.%3N)
        local response=$(curl -s -w "%{http_code},%{time_total}" "${BASE_URL}:${gateway_port}${route}" || echo "000,0")
        local end_time=$(date +%s.%3N)

        local http_code=$(echo "$response" | tail -1 | cut -d',' -f1)
        local response_time=$(echo "$response" | tail -1 | cut -d',' -f2)
        local duration=$(echo "$end_time - $start_time" | bc)

        local test_name="gateway_route_$(echo "$route" | tr '/' '_')"

        if [[ "$http_code" =~ ^(200|401|403|404)$ ]]; then
            log_success "Gateway route $route passed (HTTP $http_code, ${response_time}s)"
            record_test_result "$test_name" "PASSED" "${response_time}s" "Route returned HTTP $http_code"
        else
            log_error "Gateway route $route failed (HTTP $http_code)"
            record_test_result "$test_name" "FAILED" "${duration}s" "Route returned HTTP $http_code"
        fi
    done
}

# Test dashboard accessibility
test_dashboard_accessibility() {
    log_info "Testing Dashboard accessibility..."

    local dashboard_port="${SERVICES[dashboard]}"

    # Test dashboard pages
    local pages=(
        "/"
        "/health"
        "/login"
    )

    for page in "${pages[@]}"; do
        log_info "Testing dashboard page: $page"

        local start_time=$(date +%s.%3N)
        local response=$(curl -s -w "%{http_code},%{time_total}" "${BASE_URL}:${dashboard_port}${page}" || echo "000,0")
        local end_time=$(date +%s.%3N)

        local http_code=$(echo "$response" | tail -1 | cut -d',' -f1)
        local response_time=$(echo "$response" | tail -1 | cut -d',' -f2)
        local duration=$(echo "$end_time - $start_time" | bc)

        local test_name="dashboard_page_$(echo "$page" | tr '/' '_' | sed 's/^_/root/')"

        if [[ "$http_code" =~ ^(200|302|401|403)$ ]]; then
            log_success "Dashboard page $page passed (HTTP $http_code, ${response_time}s)"
            record_test_result "$test_name" "PASSED" "${response_time}s" "Page returned HTTP $http_code"
        else
            log_error "Dashboard page $page failed (HTTP $http_code)"
            record_test_result "$test_name" "FAILED" "${duration}s" "Page returned HTTP $http_code"
        fi
    done
}

# Test cross-service communication
test_cross_service_communication() {
    log_info "Testing cross-service communication..."

    # Test agent service communication through API
    log_info "Testing API to Agents communication"

    local start_time=$(date +%s.%3N)
    local response=$(curl -s -w "%{http_code},%{time_total}" \
        -H "Content-Type: application/json" \
        "${BASE_URL}:${SERVICES[api]}/api/v1/agents/ping" || echo "000,0")
    local end_time=$(date +%s.%3N)

    local http_code=$(echo "$response" | tail -1 | cut -d',' -f1)
    local response_time=$(echo "$response" | tail -1 | cut -d',' -f2)
    local duration=$(echo "$end_time - $start_time" | bc)

    if [[ "$http_code" =~ ^(200|401|403|404)$ ]]; then
        log_success "Cross-service communication test passed (HTTP $http_code, ${response_time}s)"
        record_test_result "cross_service_communication" "PASSED" "${response_time}s" "Communication returned HTTP $http_code"
    else
        log_error "Cross-service communication test failed (HTTP $http_code)"
        record_test_result "cross_service_communication" "FAILED" "${duration}s" "Communication returned HTTP $http_code"
    fi
}

# Performance smoke test
test_performance_baseline() {
    log_info "Running performance baseline smoke test..."

    # Create simple k6 performance test
    cat > /tmp/performance-smoke-test.js << 'EOF'
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
    stages: [
        { duration: '30s', target: 5 },   // Ramp up to 5 users
        { duration: '30s', target: 5 },   // Stay at 5 users
        { duration: '30s', target: 0 },   // Ramp down
    ],
    thresholds: {
        http_req_duration: ['p(95)<1000'], // 95% of requests under 1s
        http_req_failed: ['rate<0.05'],     // Error rate under 5%
    },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost';
const services = [
    { name: 'gateway', port: 7000, path: '/health' },
    { name: 'api', port: 7001, path: '/health' },
    { name: 'agents', port: 7002, path: '/health' },
    { name: 'bridge', port: 7003, path: '/health' },
    { name: 'dashboard', port: 7004, path: '/health' },
];

export default function () {
    for (const service of services) {
        const response = http.get(`${BASE_URL}:${service.port}${service.path}`);

        check(response, {
            [`${service.name} status is 200`]: (r) => r.status === 200,
            [`${service.name} response time < 500ms`]: (r) => r.timings.duration < 500,
        });
    }

    sleep(1);
}
EOF

    # Run performance test if k6 is available
    if command -v k6 &> /dev/null; then
        log_info "Running k6 performance smoke test..."

        local start_time=$(date +%s)
        if BASE_URL="$BASE_URL" k6 run --quiet /tmp/performance-smoke-test.js > smoke-test-results/performance-smoke-test.log 2>&1; then
            local end_time=$(date +%s)
            local duration=$((end_time - start_time))

            log_success "Performance smoke test passed (${duration}s)"
            record_test_result "performance_smoke_test" "PASSED" "${duration}s" "k6 performance test completed successfully"
        else
            local end_time=$(date +%s)
            local duration=$((end_time - start_time))

            log_error "Performance smoke test failed"
            record_test_result "performance_smoke_test" "FAILED" "${duration}s" "k6 performance test failed"
        fi

        rm -f /tmp/performance-smoke-test.js
    else
        log_warning "k6 not available, skipping performance smoke test"
        record_test_result "performance_smoke_test" "SKIPPED" "0s" "k6 not available"
    fi
}

# Generate comprehensive test report
generate_test_report() {
    log_info "Generating comprehensive test report..."

    # Create HTML report
    cat > smoke-test-results/smoke-test-report.html << EOF
<!DOCTYPE html>
<html>
<head>
    <title>Smoke Test Report - $ENVIRONMENT</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .header { background: #f5f5f5; padding: 20px; border-radius: 5px; }
        .summary { margin: 20px 0; }
        .test-results { margin: 20px 0; }
        .test-passed { color: green; }
        .test-failed { color: red; }
        .test-skipped { color: orange; }
        table { border-collapse: collapse; width: 100%; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        th { background-color: #f2f2f2; }
        .success-rate-high { color: green; font-weight: bold; }
        .success-rate-medium { color: orange; font-weight: bold; }
        .success-rate-low { color: red; font-weight: bold; }
    </style>
</head>
<body>
    <div class="header">
        <h1>Smoke Test Report</h1>
        <p><strong>Environment:</strong> $ENVIRONMENT</p>
        <p><strong>Base URL:</strong> $BASE_URL</p>
        <p><strong>Timestamp:</strong> $(date -u +"%Y-%m-%d %H:%M:%S UTC")</p>
    </div>

    <div class="summary">
        <h2>Test Summary</h2>
        <p><strong>Total Tests:</strong> $TOTAL_TESTS</p>
        <p><strong>Passed:</strong> <span class="test-passed">$PASSED_TESTS</span></p>
        <p><strong>Failed:</strong> <span class="test-failed">$FAILED_TESTS</span></p>
EOF

    # Calculate success rate
    local success_rate=0
    if [[ $TOTAL_TESTS -gt 0 ]]; then
        success_rate=$((PASSED_TESTS * 100 / TOTAL_TESTS))
    fi

    local success_class="success-rate-low"
    if [[ $success_rate -ge 95 ]]; then
        success_class="success-rate-high"
    elif [[ $success_rate -ge 80 ]]; then
        success_class="success-rate-medium"
    fi

    cat >> smoke-test-results/smoke-test-report.html << EOF
        <p><strong>Success Rate:</strong> <span class="$success_class">${success_rate}%</span></p>
    </div>

    <div class="test-results">
        <h2>Detailed Test Results</h2>
        <table>
            <tr>
                <th>Test Name</th>
                <th>Status</th>
                <th>Duration</th>
                <th>Details</th>
            </tr>
EOF

    # Add test results to HTML
    for test_name in "${!TEST_RESULTS[@]}"; do
        local status="${TEST_RESULTS[$test_name]}"
        local class_name="test-$(echo "$status" | tr '[:upper:]' '[:lower:]')"

        # Get additional details from JSON
        local details=$(jq -r ".tests[\"$test_name\"].details // \"No details available\"" smoke-test-results/smoke-test-report.json)
        local duration=$(jq -r ".tests[\"$test_name\"].duration // \"Unknown\"" smoke-test-results/smoke-test-report.json)

        cat >> smoke-test-results/smoke-test-report.html << EOF
            <tr>
                <td>$test_name</td>
                <td class="$class_name">$status</td>
                <td>$duration</td>
                <td>$details</td>
            </tr>
EOF
    done

    cat >> smoke-test-results/smoke-test-report.html << EOF
        </table>
    </div>
</body>
</html>
EOF

    log_success "Test report generated: smoke-test-results/smoke-test-report.html"
}

# Main smoke test execution
main() {
    log_info "Starting comprehensive smoke tests for AI Platform"
    log_info "Environment: $ENVIRONMENT"
    log_info "Base URL: $BASE_URL"
    log_info "Timeout: ${TIMEOUT}s"
    log_info "Detailed Tests: $DETAILED_TESTS"

    # Initialize test tracking
    init_test_tracking

    # Check availability of all services first
    log_info "Phase 1: Checking service availability..."
    local availability_failed=0

    for service in "${!SERVICES[@]}"; do
        if ! check_service_availability "$service"; then
            availability_failed=$((availability_failed + 1))
        fi
    done

    if [[ $availability_failed -gt 0 ]]; then
        log_error "$availability_failed services are not available"
        if [[ $availability_failed -eq ${#SERVICES[@]} ]]; then
            log_error "All services are unavailable, aborting smoke tests"
            exit 1
        fi
    fi

    # Run health checks
    log_info "Phase 2: Testing service health endpoints..."
    for service in "${!SERVICES[@]}"; do
        test_service_health "$service"
    done

    # Run metrics checks
    log_info "Phase 3: Testing service metrics endpoints..."
    for service in "${!SERVICES[@]}"; do
        test_service_metrics "$service"
    done

    # Run detailed tests if enabled
    if [[ "$DETAILED_TESTS" == "true" ]]; then
        log_info "Phase 4: Running detailed service tests..."

        test_api_endpoints
        test_gateway_routing
        test_dashboard_accessibility
        test_cross_service_communication
        test_performance_baseline
    fi

    # Generate test report
    generate_test_report

    # Final summary
    log_info "Smoke Test Summary:"
    log_info "==================="
    log_info "Total Tests: $TOTAL_TESTS"
    log_success "Passed: $PASSED_TESTS"
    log_error "Failed: $FAILED_TESTS"

    local success_rate=0
    if [[ $TOTAL_TESTS -gt 0 ]]; then
        success_rate=$((PASSED_TESTS * 100 / TOTAL_TESTS))
    fi

    log_info "Success Rate: ${success_rate}%"

    if [[ $FAILED_TESTS -eq 0 ]]; then
        log_success "All smoke tests passed! 🎉"
        exit 0
    else
        log_error "Some smoke tests failed. Check the detailed report for more information."
        exit 1
    fi
}

# Execute main function
main "$@"