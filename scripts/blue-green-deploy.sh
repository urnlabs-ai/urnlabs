#!/bin/bash

# Blue-Green Deployment Script for Urnlabs AI Platform
# This script implements zero-downtime deployments using Docker services

set -euo pipefail

# Configuration
ENVIRONMENT="${1:-production}"
SERVICES="${2:-all}"
HEALTH_CHECK_TIMEOUT="${3:-300}"
ROLLBACK_ON_FAILURE="${4:-true}"

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
    if [[ ! "$ENVIRONMENT" =~ ^(staging|production)$ ]]; then
        log_error "Invalid environment: $ENVIRONMENT. Must be 'staging' or 'production'"
        exit 1
    fi

    if [[ ! -f "docker-compose.platform-${ENVIRONMENT}.yml" ]]; then
        log_error "Docker compose file not found: docker-compose.platform-${ENVIRONMENT}.yml"
        exit 1
    fi

    log_info "Environment validation passed: $ENVIRONMENT"
}

# Get list of services to deploy
get_services() {
    if [[ "$SERVICES" == "all" ]]; then
        echo "api agents gateway bridge dashboard"
    else
        echo "$SERVICES" | tr ',' ' '
    fi
}

# Check if service is running and healthy
check_service_health() {
    local service="$1"
    local color="$2"
    local timeout="${3:-60}"

    log_info "Checking health of ${service}-${ENVIRONMENT}-${color}"

    local start_time=$(date +%s)
    local end_time=$((start_time + timeout))

    while [[ $(date +%s) -lt $end_time ]]; do
        if docker service ls --format "table {{.Name}}\t{{.Replicas}}" | grep -q "${service}-${ENVIRONMENT}-${color}.*[1-9]/[1-9]"; then
            # Service is running, now check health endpoint
            local port
            case "$service" in
                "api") port=7001 ;;
                "agents") port=7002 ;;
                "gateway") port=7000 ;;
                "bridge") port=7003 ;;
                "dashboard") port=7004 ;;
                *) log_error "Unknown service: $service"; return 1 ;;
            esac

            if curl -f -s "http://localhost:${port}/health" > /dev/null; then
                log_success "${service}-${ENVIRONMENT}-${color} is healthy"
                return 0
            fi
        fi

        log_info "Waiting for ${service}-${ENVIRONMENT}-${color} to become healthy..."
        sleep 5
    done

    log_error "${service}-${ENVIRONMENT}-${color} failed health check after ${timeout}s"
    return 1
}

# Deploy service with new image
deploy_service() {
    local service="$1"
    local color="$2"
    local image_tag="$3"

    log_info "Deploying ${service}-${ENVIRONMENT}-${color} with image tag: $image_tag"

    # Update the service with new image
    docker service update \
        --image "ghcr.io/${GITHUB_REPOSITORY}-${service}:${image_tag}" \
        --update-order start-first \
        --update-parallelism 1 \
        --update-delay 30s \
        --update-failure-action rollback \
        "${service}-${ENVIRONMENT}-${color}" || {
        log_error "Failed to update ${service}-${ENVIRONMENT}-${color}"
        return 1
    }

    # Wait for deployment to complete
    log_info "Waiting for ${service}-${ENVIRONMENT}-${color} deployment to stabilize..."
    sleep 30

    # Check service health
    if ! check_service_health "$service" "$color" "$HEALTH_CHECK_TIMEOUT"; then
        log_error "Health check failed for ${service}-${ENVIRONMENT}-${color}"
        return 1
    fi

    log_success "${service}-${ENVIRONMENT}-${color} deployed successfully"
    return 0
}

# Switch traffic to new deployment
switch_traffic() {
    local service="$1"
    local new_color="$2"
    local old_color="$3"

    log_info "Switching traffic from ${old_color} to ${new_color} for service: $service"

    # Update load balancer configuration
    local nginx_config="nginx/nginx.${ENVIRONMENT}.conf"
    local temp_config="nginx/nginx.${ENVIRONMENT}.temp.conf"

    # Create backup of current configuration
    cp "$nginx_config" "${nginx_config}.backup"

    # Replace old color references with new color
    sed "s/${service}-${ENVIRONMENT}-${old_color}/${service}-${ENVIRONMENT}-${new_color}/g" \
        "$nginx_config" > "$temp_config"

    # Validate new configuration
    if docker run --rm -v "$(pwd)/$temp_config:/etc/nginx/nginx.conf:ro" nginx:alpine nginx -t; then
        mv "$temp_config" "$nginx_config"

        # Reload nginx configuration
        docker service update --force nginx-${ENVIRONMENT} || {
            log_error "Failed to reload nginx configuration"
            # Restore backup
            mv "${nginx_config}.backup" "$nginx_config"
            return 1
        }

        log_success "Traffic switched to ${new_color} for service: $service"
        return 0
    else
        log_error "Invalid nginx configuration generated"
        rm -f "$temp_config"
        return 1
    fi
}

# Run smoke tests
run_smoke_tests() {
    local services=("$@")

    log_info "Running smoke tests for deployed services..."

    # Create smoke test script
    cat > /tmp/smoke-test.js << 'EOF'
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
    duration: '30s',
    vus: 5,
    thresholds: {
        http_req_duration: ['p(95)<500'],
        http_req_failed: ['rate<0.05'],
    },
};

const services = JSON.parse(__ENV.SERVICES || '[]');
const baseUrl = __ENV.BASE_URL || 'http://localhost';

export default function () {
    for (const service of services) {
        const ports = {
            'api': 7001,
            'agents': 7002,
            'gateway': 7000,
            'bridge': 7003,
            'dashboard': 7004,
        };

        const port = ports[service];
        if (!port) continue;

        const response = http.get(`${baseUrl}:${port}/health`);
        check(response, {
            [`${service} health check status is 200`]: (r) => r.status === 200,
            [`${service} response time < 500ms`]: (r) => r.timings.duration < 500,
        });

        sleep(0.1);
    }
}
EOF

    # Run smoke tests
    export SERVICES=$(printf '%s\n' "${services[@]}" | jq -R . | jq -s .)
    export BASE_URL="http://localhost"

    if k6 run --quiet /tmp/smoke-test.js; then
        log_success "Smoke tests passed"
        rm -f /tmp/smoke-test.js
        return 0
    else
        log_error "Smoke tests failed"
        rm -f /tmp/smoke-test.js
        return 1
    fi
}

# Rollback deployment
rollback_deployment() {
    local service="$1"
    local color="$2"

    log_warning "Rolling back ${service}-${ENVIRONMENT}-${color}"

    # Rollback the service
    docker service rollback "${service}-${ENVIRONMENT}-${color}" || {
        log_error "Failed to rollback ${service}-${ENVIRONMENT}-${color}"
        return 1
    }

    # Wait for rollback to complete
    sleep 30

    # Check health after rollback
    if check_service_health "$service" "$color" 120; then
        log_success "Rollback completed for ${service}-${ENVIRONMENT}-${color}"
        return 0
    else
        log_error "Rollback failed for ${service}-${ENVIRONMENT}-${color}"
        return 1
    fi
}

# Cleanup old deployment
cleanup_old_deployment() {
    local service="$1"
    local old_color="$2"

    log_info "Cleaning up old deployment: ${service}-${ENVIRONMENT}-${old_color}"

    # Scale down old service to 0 replicas
    docker service scale "${service}-${ENVIRONMENT}-${old_color}=0" || {
        log_warning "Failed to scale down ${service}-${ENVIRONMENT}-${old_color}"
    }

    # Wait a bit before removing
    sleep 10

    # Remove old service
    docker service rm "${service}-${ENVIRONMENT}-${old_color}" || {
        log_warning "Failed to remove ${service}-${ENVIRONMENT}-${old_color}"
    }

    log_success "Cleaned up old deployment: ${service}-${ENVIRONMENT}-${old_color}"
}

# Determine current and new colors
get_deployment_colors() {
    local service="$1"

    # Check which color is currently active
    if docker service ls --format "{{.Name}}" | grep -q "${service}-${ENVIRONMENT}-blue"; then
        echo "blue green"
    else
        echo "green blue"
    fi
}

# Main deployment function
main() {
    log_info "Starting Blue-Green deployment for Urnlabs AI Platform"
    log_info "Environment: $ENVIRONMENT"
    log_info "Services: $SERVICES"
    log_info "Rollback on failure: $ROLLBACK_ON_FAILURE"

    # Validate environment and prerequisites
    validate_environment

    # Get services to deploy
    local services_array=($(get_services))

    # Check if Docker Swarm is initialized
    if ! docker node ls &>/dev/null; then
        log_error "Docker Swarm is not initialized. Run: docker swarm init"
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

    # Deploy each service
    local failed_services=()
    local deployed_services=()

    for service in "${services_array[@]}"; do
        log_info "Processing service: $service"

        # Get current and new deployment colors
        read current_color new_color <<< "$(get_deployment_colors "$service")"

        log_info "Current color: $current_color, New color: $new_color"

        # Deploy to new color
        if deploy_service "$service" "$new_color" "$IMAGE_TAG"; then
            deployed_services+=("$service:$new_color")
        else
            failed_services+=("$service")

            if [[ "$ROLLBACK_ON_FAILURE" == "true" ]]; then
                log_warning "Service $service failed deployment, initiating rollback"
                rollback_deployment "$service" "$new_color"
            fi
            continue
        fi

        # Run smoke tests for this service
        if ! run_smoke_tests "$service"; then
            failed_services+=("$service")

            if [[ "$ROLLBACK_ON_FAILURE" == "true" ]]; then
                log_warning "Smoke tests failed for $service, initiating rollback"
                rollback_deployment "$service" "$new_color"
            fi
            continue
        fi

        # Switch traffic to new deployment
        if switch_traffic "$service" "$new_color" "$current_color"; then
            log_success "Traffic switched for service: $service"

            # Cleanup old deployment after successful traffic switch
            cleanup_old_deployment "$service" "$current_color"
        else
            failed_services+=("$service")

            if [[ "$ROLLBACK_ON_FAILURE" == "true" ]]; then
                log_warning "Traffic switch failed for $service, initiating rollback"
                rollback_deployment "$service" "$new_color"
            fi
        fi
    done

    # Final summary
    log_info "Deployment Summary:"
    log_info "==================="

    if [[ ${#deployed_services[@]} -gt 0 ]]; then
        log_success "Successfully deployed services:"
        for service_info in "${deployed_services[@]}"; do
            log_success "  - $service_info"
        done
    fi

    if [[ ${#failed_services[@]} -gt 0 ]]; then
        log_error "Failed services:"
        for service in "${failed_services[@]}"; do
            log_error "  - $service"
        done
        exit 1
    else
        log_success "All services deployed successfully!"
        log_success "Blue-Green deployment completed for environment: $ENVIRONMENT"
    fi
}

# Execute main function
main "$@"