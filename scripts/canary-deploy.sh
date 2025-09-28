#!/bin/bash

# Canary Deployment Script for Urnlabs AI Platform
# This script implements progressive canary deployments with automatic rollback

set -euo pipefail

# Configuration
ENVIRONMENT="${1:-production}"
SERVICES="${2:-all}"
CANARY_PERCENTAGE="${3:-5}"
ANALYSIS_DURATION="${4:-300}"
SUCCESS_THRESHOLD="${5:-95}"
ERROR_THRESHOLD="${6:-1}"
ROLLBACK_ON_FAILURE="${7:-true}"

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

# Validate environment and configuration
validate_environment() {
    if [[ ! "$ENVIRONMENT" =~ ^(staging|production)$ ]]; then
        log_error "Invalid environment: $ENVIRONMENT. Must be 'staging' or 'production'"
        exit 1
    fi

    if [[ ! -f "docker-compose.platform-${ENVIRONMENT}.yml" ]]; then
        log_error "Docker compose file not found: docker-compose.platform-${ENVIRONMENT}.yml"
        exit 1
    fi

    # Validate canary percentage
    if [[ "$CANARY_PERCENTAGE" -lt 1 || "$CANARY_PERCENTAGE" -gt 50 ]]; then
        log_error "Invalid canary percentage: $CANARY_PERCENTAGE. Must be between 1-50"
        exit 1
    fi

    log_info "Environment validation passed: $ENVIRONMENT"
    log_info "Canary percentage: ${CANARY_PERCENTAGE}%"
    log_info "Analysis duration: ${ANALYSIS_DURATION}s"
}

# Get list of services to deploy
get_services() {
    if [[ "$SERVICES" == "all" ]]; then
        echo "api agents gateway bridge dashboard"
    else
        echo "$SERVICES" | tr ',' ' '
    fi
}

# Create canary service with limited replicas
create_canary_service() {
    local service="$1"
    local image_tag="$2"
    local replica_count="$3"

    local service_name="${service}-${ENVIRONMENT}-canary"
    
    log_info "Creating canary service: $service_name with $replica_count replicas"

    # Remove existing canary service if it exists
    if docker service ls --format "{{.Name}}" | grep -q "^${service_name}$"; then
        log_warning "Removing existing canary service: $service_name"
        docker service rm "$service_name" || true
        sleep 10
    fi

    # Create new canary service
    docker service create \
        --name "$service_name" \
        --replicas "$replica_count" \
        --network "urnlabs-platform-${ENVIRONMENT}" \
        --label "canary=true" \
        --label "service=${service}" \
        --label "environment=${ENVIRONMENT}" \
        --constraint "node.role==worker" \
        --update-parallelism 1 \
        --update-delay 30s \
        --update-failure-action rollback \
        --restart-condition any \
        --restart-delay 10s \
        --restart-max-attempts 3 \
        "ghcr.io/${GITHUB_REPOSITORY}-${service}:${image_tag}" || {
        log_error "Failed to create canary service: $service_name"
        return 1
    }

    log_success "Canary service created: $service_name"
    return 0
}

# Update nginx configuration for canary traffic splitting
update_nginx_canary_config() {
    local service="$1"
    local canary_percentage="$2"

    log_info "Updating nginx configuration for ${canary_percentage}% canary traffic to $service"

    local nginx_config="nginx/nginx.${ENVIRONMENT}.conf"
    local temp_config="nginx/nginx.${ENVIRONMENT}.canary.tmp"
    local backup_config="nginx/nginx.${ENVIRONMENT}.canary.backup"

    # Create backup
    cp "$nginx_config" "$backup_config"

    # Generate canary configuration
    cat > /tmp/generate_canary_config.py << 'EOF'
import sys
import re

def update_nginx_config(config_file, service, canary_percentage):
    with open(config_file, 'r') as f:
        content = f.read()
    
    # Find the upstream block for the service
    upstream_pattern = f'upstream {service}-{sys.argv[3]}.*?{{(.*?)}}'
    upstream_match = re.search(upstream_pattern, content, re.DOTALL)
    
    if not upstream_match:
        print(f"Upstream block not found for {service}")
        return False
    
    upstream_content = upstream_match.group(1)
    
    # Add canary server with weight
    canary_server = f"    server {service}-{sys.argv[3]}-canary:7001 weight={canary_percentage};"
    stable_weight = 100 - canary_percentage
    
    # Update existing servers to have stable weight
    lines = upstream_content.strip().split('\n')
    new_lines = []
    
    for line in lines:
        if 'server ' in line and 'weight=' not in line:
            # Add weight to existing server
            line = line.rstrip(';') + f' weight={stable_weight};'
        new_lines.append(line)
    
    # Add canary server
    new_lines.append(canary_server)
    
    # Reconstruct upstream block
    new_upstream_content = '\n'.join(new_lines)
    new_upstream_block = upstream_match.group(0).replace(upstream_content, new_upstream_content)
    
    # Replace in full content
    new_content = content.replace(upstream_match.group(0), new_upstream_block)
    
    return new_content

if __name__ == "__main__":
    service = sys.argv[1]
    canary_percentage = int(sys.argv[2])
    environment = sys.argv[3]
    config_file = sys.argv[4]
    output_file = sys.argv[5]
    
    new_content = update_nginx_config(config_file, service, canary_percentage)
    
    if new_content:
        with open(output_file, 'w') as f:
            f.write(new_content)
        print("Configuration updated successfully")
    else:
        print("Failed to update configuration")
        sys.exit(1)
EOF

    # Update configuration
    python3 /tmp/generate_canary_config.py "$service" "$canary_percentage" "$ENVIRONMENT" "$nginx_config" "$temp_config" || {
        log_error "Failed to generate canary configuration"
        rm -f /tmp/generate_canary_config.py
        return 1
    }

    # Validate new configuration
    if docker run --rm -v "$(pwd)/$temp_config:/etc/nginx/nginx.conf:ro" nginx:alpine nginx -t; then
        mv "$temp_config" "$nginx_config"
        
        # Reload nginx
        if docker service update --force "nginx-${ENVIRONMENT}"; then
            log_success "Nginx configuration updated for ${canary_percentage}% canary traffic"
            rm -f /tmp/generate_canary_config.py
            return 0
        else
            log_error "Failed to reload nginx configuration"
            mv "$backup_config" "$nginx_config"
            rm -f /tmp/generate_canary_config.py
            return 1
        fi
    else
        log_error "Invalid nginx configuration generated"
        rm -f "$temp_config" /tmp/generate_canary_config.py
        return 1
    fi
}

# Collect metrics for canary analysis
collect_canary_metrics() {
    local service="$1"
    local duration="$2"

    log_info "Collecting metrics for canary analysis (${duration}s)..."

    # Create metrics collection script
    cat > /tmp/canary-metrics.js << 'EOF'
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

export const options = {
    duration: `${__ENV.DURATION}s`,
    vus: 10,
};

const errorRate = new Rate('canary_errors');
const responseTime = new Trend('canary_response_time');
const requestCount = new Counter('canary_requests');

const service = __ENV.SERVICE || 'api';
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

    requestCount.add(1);
    
    const response = http.get(`http://localhost:${port}/health`);
    responseTime.add(response.timings.duration);
    
    const isError = response.status !== 200;
    errorRate.add(isError);
    
    check(response, {
        'status is 200': (r) => r.status === 200,
        'response time < 500ms': (r) => r.timings.duration < 500,
    });

    sleep(1);
}

export function handleSummary(data) {
    const errorRate = data.metrics.canary_errors.values.rate * 100;
    const avgResponseTime = data.metrics.canary_response_time.values.avg;
    const p95ResponseTime = data.metrics.canary_response_time.values['p(95)'];
    const totalRequests = data.metrics.canary_requests.values.count;

    const summary = {
        errorRate: errorRate,
        avgResponseTime: avgResponseTime,
        p95ResponseTime: p95ResponseTime,
        totalRequests: totalRequests,
        timestamp: new Date().toISOString(),
    };

    return {
        'canary-metrics.json': JSON.stringify(summary, null, 2),
    };
}
EOF

    # Run metrics collection
    export SERVICE="$service"
    export DURATION="$duration"

    k6 run --quiet /tmp/canary-metrics.js --out json=canary-results.json || {
        log_error "Failed to collect canary metrics"
        rm -f /tmp/canary-metrics.js
        return 1
    }

    rm -f /tmp/canary-metrics.js
    return 0
}

# Analyze canary metrics and decide promotion/rollback
analyze_canary_metrics() {
    local service="$1"
    local success_threshold="$2"
    local error_threshold="$3"

    log_info "Analyzing canary metrics for $service..."

    if [[ ! -f "canary-metrics.json" ]]; then
        log_error "Canary metrics file not found"
        return 1
    fi

    # Parse metrics
    local error_rate=$(jq -r '.errorRate' canary-metrics.json)
    local avg_response_time=$(jq -r '.avgResponseTime' canary-metrics.json)
    local p95_response_time=$(jq -r '.p95ResponseTime' canary-metrics.json)
    local total_requests=$(jq -r '.totalRequests' canary-metrics.json)

    log_info "Canary Metrics Analysis:"
    log_info "  Error Rate: ${error_rate}%"
    log_info "  Avg Response Time: ${avg_response_time}ms"
    log_info "  P95 Response Time: ${p95_response_time}ms"
    log_info "  Total Requests: $total_requests"

    # Check thresholds
    if (( $(echo "$error_rate > $error_threshold" | bc -l) )); then
        log_error "Error rate ${error_rate}% exceeds threshold ${error_threshold}%"
        return 1
    fi

    if (( $(echo "$p95_response_time > 1000" | bc -l) )); then
        log_error "P95 response time ${p95_response_time}ms exceeds 1000ms threshold"
        return 1
    fi

    if [[ "$total_requests" -lt 10 ]]; then
        log_error "Insufficient traffic for analysis: $total_requests requests"
        return 1
    fi

    log_success "Canary metrics analysis passed all thresholds"
    return 0
}

# Promote canary to full deployment
promote_canary() {
    local service="$1"

    log_info "Promoting canary to full deployment for service: $service"

    # Get current stable service info
    local stable_service="${service}-${ENVIRONMENT}-stable"
    local canary_service="${service}-${ENVIRONMENT}-canary"

    # Scale up canary to match stable replicas
    local stable_replicas=$(docker service ls --format "table {{.Name}}\t{{.Replicas}}" | grep "$stable_service" | awk '{print $2}' | cut -d'/' -f2)
    
    if [[ -z "$stable_replicas" ]]; then
        stable_replicas=2
    fi

    log_info "Scaling canary service to $stable_replicas replicas"
    docker service scale "${canary_service}=${stable_replicas}" || {
        log_error "Failed to scale canary service"
        return 1
    }

    # Wait for scaling to complete
    sleep 30

    # Update nginx to send 100% traffic to canary
    update_nginx_canary_config "$service" 100 || {
        log_error "Failed to update nginx for full promotion"
        return 1
    }

    # Wait a bit for traffic to stabilize
    sleep 10

    # Scale down and remove stable service
    log_info "Removing old stable service"
    docker service scale "${stable_service}=0" || true
    sleep 10
    docker service rm "$stable_service" || true

    # Rename canary to stable
    log_info "Renaming canary service to stable"
    docker service update --label-add "canary=false" "$canary_service" || true

    log_success "Canary promotion completed for service: $service"
    return 0
}

# Rollback canary deployment
rollback_canary() {
    local service="$1"

    log_warning "Rolling back canary deployment for service: $service"

    local canary_service="${service}-${ENVIRONMENT}-canary"

    # Restore original nginx configuration
    local backup_config="nginx/nginx.${ENVIRONMENT}.canary.backup"
    local nginx_config="nginx/nginx.${ENVIRONMENT}.conf"

    if [[ -f "$backup_config" ]]; then
        cp "$backup_config" "$nginx_config"
        
        # Reload nginx
        docker service update --force "nginx-${ENVIRONMENT}" || {
            log_error "Failed to restore nginx configuration"
        }
    fi

    # Remove canary service
    docker service scale "${canary_service}=0" || true
    sleep 10
    docker service rm "$canary_service" || true

    log_success "Canary rollback completed for service: $service"
    return 0
}

# Progressive canary deployment with multiple stages
progressive_canary_deploy() {
    local service="$1"
    local image_tag="$2"

    local stages=(5 25 50 100)
    
    log_info "Starting progressive canary deployment for $service"
    log_info "Stages: ${stages[*]}%"

    # Create initial canary service
    create_canary_service "$service" "$image_tag" 1 || {
        log_error "Failed to create initial canary service"
        return 1
    }

    # Wait for canary to become healthy
    sleep 30

    for stage in "${stages[@]}"; do
        log_info "Progressing to ${stage}% canary traffic..."

        # Update traffic distribution
        if [[ "$stage" -eq 100 ]]; then
            promote_canary "$service"
            break
        else
            update_nginx_canary_config "$service" "$stage" || {
                log_error "Failed to update traffic to ${stage}%"
                rollback_canary "$service"
                return 1
            }
        fi

        # Collect and analyze metrics for this stage
        collect_canary_metrics "$service" "$ANALYSIS_DURATION" || {
            log_error "Failed to collect metrics for ${stage}% stage"
            rollback_canary "$service"
            return 1
        }

        analyze_canary_metrics "$service" "$SUCCESS_THRESHOLD" "$ERROR_THRESHOLD" || {
            log_error "Metrics analysis failed for ${stage}% stage"
            if [[ "$ROLLBACK_ON_FAILURE" == "true" ]]; then
                rollback_canary "$service"
            fi
            return 1
        }

        log_success "Stage ${stage}% completed successfully"
        
        # Wait before next stage (except for final promotion)
        if [[ "$stage" -ne 100 ]]; then
            sleep 60
        fi
    done

    log_success "Progressive canary deployment completed for $service"
    return 0
}

# Main function
main() {
    log_info "🚀 Starting Canary Deployment for Urnlabs AI Platform"
    log_info "Environment: $ENVIRONMENT"
    log_info "Services: $SERVICES"
    log_info "Initial Canary Percentage: ${CANARY_PERCENTAGE}%"

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

    # Check Docker Swarm
    if ! docker node ls &>/dev/null; then
        log_error "Docker Swarm is not initialized"
        exit 1
    fi

    # Required environment variables
    if [[ -z "${GITHUB_REPOSITORY:-}" ]]; then
        log_error "GITHUB_REPOSITORY environment variable is required"
        exit 1
    fi

    if [[ -z "${IMAGE_TAG:-}" ]]; then
        log_error "IMAGE_TAG environment variable is required"
        exit 1
    fi

    # Get services to deploy
    local services_array=($(get_services))

    # Deploy each service with canary strategy
    local failed_services=()
    local successful_services=()

    for service in "${services_array[@]}"; do
        log_info "Starting canary deployment for service: $service"

        if progressive_canary_deploy "$service" "$IMAGE_TAG"; then
            successful_services+=("$service")
            log_success "✅ Canary deployment successful for: $service"
        else
            failed_services+=("$service")
            log_error "❌ Canary deployment failed for: $service"
        fi

        # Clean up metrics files
        rm -f canary-metrics.json canary-results.json
    done

    # Final summary
    log_info "Canary Deployment Summary:"
    log_info "=========================="

    if [[ ${#successful_services[@]} -gt 0 ]]; then
        log_success "Successfully deployed services:"
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
        log_success "🎉 All canary deployments completed successfully!"
    fi
}

# Execute main function
main "$@"