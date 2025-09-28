#!/bin/bash

# Feature Flag Integrated Canary Deployment Script
# This script combines feature flags with canary deployments for controlled rollouts

set -euo pipefail

# Configuration
ENVIRONMENT="${1:-production}"
SERVICES="${2:-all}"
FEATURE_FLAG_NAME="${3:-canary_${SERVICES}_$(date +%Y%m%d_%H%M%S)}"
INITIAL_PERCENTAGE="${4:-5}"
MAX_PERCENTAGE="${5:-100}"
INCREMENT_PERCENTAGE="${6:-25}"
EVALUATION_INTERVAL="${7:-300}"
SUCCESS_THRESHOLD="${8:-95}"
ERROR_THRESHOLD="${9:-1}"
ROLLBACK_ON_FAILURE="${10:-true}"

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

# Feature flag API endpoints
FEATURE_FLAG_API_URL="${FEATURE_FLAG_API_URL:-http://localhost:8080}"
REDIS_URL="${REDIS_URL:-redis://localhost:6379}"

# Validate environment and configuration
validate_environment() {
    if [[ ! "$ENVIRONMENT" =~ ^(staging|production)$ ]]; then
        log_error "Invalid environment: $ENVIRONMENT. Must be 'staging' or 'production'"
        exit 1
    fi

    # Check if feature flag service is available
    if ! curl -f -s "${FEATURE_FLAG_API_URL}/health" > /dev/null; then
        log_error "Feature flag service is not available at ${FEATURE_FLAG_API_URL}"
        exit 1
    fi

    # Validate percentage values
    if [[ "$INITIAL_PERCENTAGE" -lt 1 || "$INITIAL_PERCENTAGE" -gt 50 ]]; then
        log_error "Invalid initial percentage: $INITIAL_PERCENTAGE. Must be between 1-50"
        exit 1
    fi

    if [[ "$MAX_PERCENTAGE" -lt "$INITIAL_PERCENTAGE" || "$MAX_PERCENTAGE" -gt 100 ]]; then
        log_error "Invalid max percentage: $MAX_PERCENTAGE. Must be between initial percentage and 100"
        exit 1
    fi

    log_info "Environment validation passed: $ENVIRONMENT"
    log_info "Feature flag: $FEATURE_FLAG_NAME"
    log_info "Rollout: ${INITIAL_PERCENTAGE}% → ${MAX_PERCENTAGE}% (increments of ${INCREMENT_PERCENTAGE}%)"
}

# Create feature flag for canary deployment
create_canary_feature_flag() {
    local service="$1"
    local initial_percentage="$2"

    log_info "Creating feature flag: $FEATURE_FLAG_NAME"

    # Create feature flag configuration
    local flag_config=$(cat << EOF
{
  "name": "${FEATURE_FLAG_NAME}",
  "description": "Canary deployment flag for ${service} service",
  "state": "gradual_rollout",
  "environment": "${ENVIRONMENT}",
  "createdBy": "canary-deployment-system",
  "rolloutPercentage": ${initial_percentage},
  "targeting": {
    "strategy": "percentage",
    "rules": [],
    "userList": [],
    "ipWhitelist": []
  },
  "metadata": {
    "service": "${service}",
    "deploymentType": "canary",
    "imageTag": "${IMAGE_TAG}",
    "startedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
    "maxPercentage": ${MAX_PERCENTAGE},
    "incrementPercentage": ${INCREMENT_PERCENTAGE}
  },
  "tags": ["canary", "deployment", "${service}", "${ENVIRONMENT}"]
}
EOF
)

    # Create the feature flag
    local response=$(curl -s -X POST \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer ${FEATURE_FLAG_API_TOKEN:-}" \
        -d "$flag_config" \
        "${FEATURE_FLAG_API_URL}/api/v1/flags")

    if [[ $? -eq 0 ]]; then
        local flag_id=$(echo "$response" | jq -r '.id')
        if [[ "$flag_id" != "null" && -n "$flag_id" ]]; then
            log_success "Feature flag created: $FEATURE_FLAG_NAME (ID: $flag_id)"
            echo "$flag_id" > "/tmp/canary_flag_id_${service}"
            return 0
        fi
    fi

    log_error "Failed to create feature flag: $FEATURE_FLAG_NAME"
    log_error "Response: $response"
    return 1
}

# Update feature flag rollout percentage
update_flag_percentage() {
    local service="$1"
    local new_percentage="$2"

    local flag_id_file="/tmp/canary_flag_id_${service}"
    if [[ ! -f "$flag_id_file" ]]; then
        log_error "Flag ID file not found: $flag_id_file"
        return 1
    fi

    local flag_id=$(cat "$flag_id_file")

    log_info "Updating feature flag rollout to ${new_percentage}%"

    local update_payload=$(cat << EOF
{
  "rolloutPercentage": ${new_percentage},
  "metadata": {
    "lastUpdate": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
    "currentPercentage": ${new_percentage}
  }
}
EOF
)

    local response=$(curl -s -X PATCH \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer ${FEATURE_FLAG_API_TOKEN:-}" \
        -d "$update_payload" \
        "${FEATURE_FLAG_API_URL}/api/v1/flags/${flag_id}")

    if [[ $? -eq 0 ]]; then
        local updated_percentage=$(echo "$response" | jq -r '.rolloutPercentage')
        if [[ "$updated_percentage" == "$new_percentage" ]]; then
            log_success "Feature flag updated to ${new_percentage}%"
            return 0
        fi
    fi

    log_error "Failed to update feature flag percentage"
    log_error "Response: $response"
    return 1
}

# Check feature flag evaluation metrics
check_flag_metrics() {
    local service="$1"
    local expected_percentage="$2"

    log_info "Checking feature flag evaluation metrics..."

    # Get flag metrics from the API
    local metrics_response=$(curl -s -X GET \
        -H "Authorization: Bearer ${FEATURE_FLAG_API_TOKEN:-}" \
        "${FEATURE_FLAG_API_URL}/api/v1/metrics/flags/${FEATURE_FLAG_NAME}")

    if [[ $? -ne 0 ]]; then
        log_warning "Failed to retrieve flag metrics"
        return 1
    fi

    # Parse metrics
    local total_evaluations=$(echo "$metrics_response" | jq -r '.totalEvaluations // 0')
    local enabled_evaluations=$(echo "$metrics_response" | jq -r '.enabledEvaluations // 0')
    local error_rate=$(echo "$metrics_response" | jq -r '.errorRate // 0')

    if [[ "$total_evaluations" -eq 0 ]]; then
        log_warning "No flag evaluations recorded yet"
        return 1
    fi

    # Calculate actual percentage
    local actual_percentage=$(echo "scale=2; $enabled_evaluations * 100 / $total_evaluations" | bc)

    log_info "Flag Evaluation Metrics:"
    log_info "  Total Evaluations: $total_evaluations"
    log_info "  Enabled Evaluations: $enabled_evaluations"
    log_info "  Actual Percentage: ${actual_percentage}%"
    log_info "  Expected Percentage: ${expected_percentage}%"
    log_info "  Error Rate: ${error_rate}%"

    # Validate metrics are within acceptable range
    local percentage_diff=$(echo "scale=2; $actual_percentage - $expected_percentage" | bc)
    local percentage_diff_abs=$(echo "$percentage_diff" | tr -d '-')

    if (( $(echo "$percentage_diff_abs > 5" | bc -l) )); then
        log_warning "Actual percentage (${actual_percentage}%) differs significantly from expected (${expected_percentage}%)"
    fi

    if (( $(echo "$error_rate > $ERROR_THRESHOLD" | bc -l) )); then
        log_error "Flag evaluation error rate (${error_rate}%) exceeds threshold (${ERROR_THRESHOLD}%)"
        return 1
    fi

    log_success "Flag metrics validation passed"
    return 0
}

# Emergency disable feature flag
emergency_disable_flag() {
    local service="$1"
    local reason="$2"

    log_warning "Emergency disabling feature flag: $FEATURE_FLAG_NAME"

    local response=$(curl -s -X POST \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer ${FEATURE_FLAG_API_TOKEN:-}" \
        -d "{\"reason\": \"${reason}\"}" \
        "${FEATURE_FLAG_API_URL}/api/v1/flags/${FEATURE_FLAG_NAME}/emergency-disable")

    if [[ $? -eq 0 ]]; then
        log_success "Feature flag emergency disabled"
        return 0
    else
        log_error "Failed to emergency disable feature flag"
        log_error "Response: $response"
        return 1
    fi
}

# Run application-specific tests with feature flag context
run_feature_flag_tests() {
    local service="$1"
    local percentage="$2"

    log_info "Running feature flag integration tests..."

    # Create test script for feature flag evaluation
    cat > /tmp/feature-flag-test.js << 'EOF'
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

export const options = {
    duration: '60s',
    vus: 20,
    thresholds: {
        http_req_duration: ['p(95)<1000'],
        http_req_failed: ['rate<0.05'],
        'feature_flag_enabled_rate': ['rate>0.01'], // At least 1% should get new feature
    },
};

const featureFlagEnabledRate = new Rate('feature_flag_enabled_rate');
const featureFlagLatency = new Trend('feature_flag_latency');

const flagName = __ENV.FEATURE_FLAG_NAME;
const service = __ENV.SERVICE;
const flagApiUrl = __ENV.FEATURE_FLAG_API_URL;

const ports = {
    'api': 7001,
    'agents': 7002,
    'gateway': 7000,
    'bridge': 7003,
    'dashboard': 7004,
};

export default function () {
    const port = ports[service];
    if (!port) return;

    // Simulate user request that should evaluate feature flag
    const userId = `test_user_${Math.floor(Math.random() * 1000)}`;
    
    const headers = {
        'X-User-ID': userId,
        'X-Feature-Flag-Context': JSON.stringify({
            userId: userId,
            environment: __ENV.ENVIRONMENT,
            userAttributes: {
                testUser: true,
                segment: 'canary_test'
            }
        })
    };

    // Make request to service
    const serviceResponse = http.get(`http://localhost:${port}/health`, { headers });
    
    check(serviceResponse, {
        'service health check passed': (r) => r.status === 200,
        'service response time acceptable': (r) => r.timings.duration < 500,
    });

    // Check if feature flag was evaluated (look for feature flag headers in response)
    const flagEnabled = serviceResponse.headers['X-Feature-Flag-Enabled'] === 'true';
    featureFlagEnabledRate.add(flagEnabled);

    // Directly evaluate feature flag via API
    const flagStartTime = Date.now();
    const flagResponse = http.post(`${flagApiUrl}/api/v1/evaluate`, JSON.stringify({
        flagName: flagName,
        context: {
            userId: userId,
            environment: __ENV.ENVIRONMENT,
            userAttributes: { testUser: true }
        }
    }), {
        headers: { 'Content-Type': 'application/json' }
    });
    
    const flagLatency = Date.now() - flagStartTime;
    featureFlagLatency.add(flagLatency);

    check(flagResponse, {
        'flag evaluation succeeded': (r) => r.status === 200,
        'flag evaluation fast': (r) => flagLatency < 100,
    });

    sleep(0.1);
}

export function handleSummary(data) {
    const flagEnabledRate = data.metrics.feature_flag_enabled_rate.values.rate * 100;
    const avgFlagLatency = data.metrics.feature_flag_latency.values.avg;

    console.log(`Feature flag enabled rate: ${flagEnabledRate.toFixed(2)}%`);
    console.log(`Average flag evaluation latency: ${avgFlagLatency.toFixed(2)}ms`);

    return {
        'feature-flag-test-results.json': JSON.stringify({
            flagEnabledRate: flagEnabledRate,
            avgFlagLatency: avgFlagLatency,
            timestamp: new Date().toISOString(),
        }, null, 2),
    };
}
EOF

    # Run the test
    export FEATURE_FLAG_NAME="$FEATURE_FLAG_NAME"
    export SERVICE="$service"
    export ENVIRONMENT="$ENVIRONMENT"
    export FEATURE_FLAG_API_URL="$FEATURE_FLAG_API_URL"

    if k6 run --quiet /tmp/feature-flag-test.js; then
        log_success "Feature flag integration tests passed"
        
        # Check test results
        if [[ -f "feature-flag-test-results.json" ]]; then
            local enabled_rate=$(jq -r '.flagEnabledRate' feature-flag-test-results.json)
            local avg_latency=$(jq -r '.avgFlagLatency' feature-flag-test-results.json)
            
            log_info "Test Results:"
            log_info "  Flag Enabled Rate: ${enabled_rate}%"
            log_info "  Avg Evaluation Latency: ${avg_latency}ms"
            
            # Validate results are reasonable
            if (( $(echo "$enabled_rate < 1" | bc -l) )); then
                log_warning "Very low feature flag enabled rate: ${enabled_rate}%"
            fi
            
            if (( $(echo "$avg_latency > 100" | bc -l) )); then
                log_warning "High feature flag evaluation latency: ${avg_latency}ms"
            fi
        fi
        
        rm -f /tmp/feature-flag-test.js feature-flag-test-results.json
        return 0
    else
        log_error "Feature flag integration tests failed"
        rm -f /tmp/feature-flag-test.js
        return 1
    fi
}

# Progressive rollout with feature flags
progressive_feature_flag_rollout() {
    local service="$1"
    local image_tag="$2"

    log_info "Starting progressive feature flag rollout for $service"

    # Create initial feature flag
    create_canary_feature_flag "$service" "$INITIAL_PERCENTAGE" || {
        log_error "Failed to create initial feature flag"
        return 1
    }

    # Deploy canary version (this would typically update container image)
    log_info "Deploying canary version with feature flag control..."
    
    # In a real implementation, this would trigger the actual service deployment
    # For now, we'll simulate it and focus on the feature flag progression
    
    local current_percentage="$INITIAL_PERCENTAGE"
    
    while [[ "$current_percentage" -lt "$MAX_PERCENTAGE" ]]; do
        log_info "Current rollout at ${current_percentage}%"
        
        # Wait for evaluation period
        log_info "Evaluating for ${EVALUATION_INTERVAL} seconds..."
        sleep "$EVALUATION_INTERVAL"
        
        # Check metrics
        if ! check_flag_metrics "$service" "$current_percentage"; then
            log_error "Metrics check failed at ${current_percentage}%"
            if [[ "$ROLLBACK_ON_FAILURE" == "true" ]]; then
                emergency_disable_flag "$service" "metrics_check_failed_at_${current_percentage}_percent"
                return 1
            fi
        fi
        
        # Run feature flag tests
        if ! run_feature_flag_tests "$service" "$current_percentage"; then
            log_error "Feature flag tests failed at ${current_percentage}%"
            if [[ "$ROLLBACK_ON_FAILURE" == "true" ]]; then
                emergency_disable_flag "$service" "integration_tests_failed_at_${current_percentage}_percent"
                return 1
            fi
        fi
        
        # Calculate next percentage
        local next_percentage=$((current_percentage + INCREMENT_PERCENTAGE))
        if [[ "$next_percentage" -gt "$MAX_PERCENTAGE" ]]; then
            next_percentage="$MAX_PERCENTAGE"
        fi
        
        # Update feature flag
        if ! update_flag_percentage "$service" "$next_percentage"; then
            log_error "Failed to update feature flag to ${next_percentage}%"
            return 1
        fi
        
        current_percentage="$next_percentage"
        
        log_success "Progressed to ${current_percentage}%"
    done
    
    log_success "Feature flag rollout completed at ${current_percentage}%"
    return 0
}

# Cleanup function
cleanup() {
    local service="$1"
    
    log_info "Cleaning up canary deployment resources..."
    
    # Clean up temporary files
    rm -f "/tmp/canary_flag_id_${service}"
    rm -f /tmp/feature-flag-test.js
    rm -f feature-flag-test-results.json
    
    log_success "Cleanup completed"
}

# Main function
main() {
    log_info "🚀 Starting Feature Flag Integrated Canary Deployment"
    log_info "Environment: $ENVIRONMENT"
    log_info "Services: $SERVICES"
    log_info "Feature Flag: $FEATURE_FLAG_NAME"
    
    # Validate environment and prerequisites
    validate_environment
    
    # Check prerequisites
    if ! command -v jq &> /dev/null; then
        log_error "jq is required but not installed"
        exit 1
    fi
    
    if ! command -v bc &> /dev/null; then
        log_error "bc is required but not installed"
        exit 1
    fi
    
    if ! command -v k6 &> /dev/null; then
        log_error "k6 is required but not installed"
        exit 1
    fi
    
    # Required environment variables
    if [[ -z "${IMAGE_TAG:-}" ]]; then
        log_error "IMAGE_TAG environment variable is required"
        exit 1
    fi
    
    # Get services to deploy
    local services_array
    if [[ "$SERVICES" == "all" ]]; then
        services_array=(api agents gateway bridge dashboard)
    else
        IFS=',' read -ra services_array <<< "$SERVICES"
    fi
    
    # Deploy each service with feature flag controlled rollout
    local failed_services=()
    local successful_services=()
    
    for service in "${services_array[@]}"; do
        log_info "Starting feature flag rollout for service: $service"
        
        if progressive_feature_flag_rollout "$service" "$IMAGE_TAG"; then
            successful_services+=("$service")
            log_success "✅ Feature flag rollout successful for: $service"
        else
            failed_services+=("$service")
            log_error "❌ Feature flag rollout failed for: $service"
        fi
        
        # Cleanup for this service
        cleanup "$service"
    done
    
    # Final summary
    log_info "Feature Flag Rollout Summary:"
    log_info "============================="
    
    if [[ ${#successful_services[@]} -gt 0 ]]; then
        log_success "Successfully rolled out services:"
        for service in "${successful_services[@]}"; do
            log_success "  ✅ $service"
        done
    fi
    
    if [[ ${#failed_services[@]} -gt 0 ]]; then
        log_error "Failed services:"
        for service in "${failed_services[@]}"; do
            log_error "  ❌ $service"
        done
        exit 1
    else
        log_success "🎉 All feature flag rollouts completed successfully!"
    fi
}

# Handle script interruption
trap 'log_warning "Script interrupted, cleaning up..."; cleanup "${SERVICES}"; exit 1' INT TERM

# Execute main function
main "$@"