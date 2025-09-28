#!/bin/bash

# Rollback Script for Urnlabs AI Platform Blue-Green Deployments
# This script provides emergency rollback capabilities for failed deployments

set -euo pipefail

# Configuration
ENVIRONMENT="${1:-production}"
SERVICES="${2:-all}"
ROLLBACK_TIMEOUT="${3:-120}"

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

# Get list of services to rollback
get_services() {
    if [[ "$SERVICES" == "all" ]]; then
        echo "api agents gateway bridge dashboard"
    else
        echo "$SERVICES" | tr ',' ' '
    fi
}

# Determine which color deployment is currently active
get_active_color() {
    local service="$1"

    # Check nginx configuration to see which upstream is active
    local nginx_config="nginx/nginx.${ENVIRONMENT}.conf"

    if [[ ! -f "$nginx_config" ]]; then
        log_error "Nginx configuration not found: $nginx_config"
        return 1
    fi

    # Look for active upstream configuration
    if grep -q "${service}-${ENVIRONMENT}-blue" "$nginx_config" | head -1; then
        echo "blue"
    elif grep -q "${service}-${ENVIRONMENT}-green" "$nginx_config" | head -1; then
        echo "green"
    else
        log_error "Could not determine active color for service: $service"
        return 1
    fi
}

# Get the inactive color (for rollback target)
get_inactive_color() {
    local service="$1"
    local active_color=$(get_active_color "$service")

    if [[ "$active_color" == "blue" ]]; then
        echo "green"
    else
        echo "blue"
    fi
}

# Check if service exists and get its status
check_service_status() {
    local service="$1"
    local color="$2"
    local service_name="${service}-${ENVIRONMENT}-${color}"

    # Check if service exists
    if ! docker service ls --format "{{.Name}}" | grep -q "^${service_name}$"; then
        log_warning "Service $service_name does not exist"
        return 1
    fi

    # Get service replica status
    local replicas=$(docker service ls --format "table {{.Name}}\t{{.Replicas}}" | grep "$service_name" | awk '{print $2}')

    if [[ "$replicas" == "0/0" ]]; then
        log_warning "Service $service_name has 0 replicas"
        return 2
    fi

    log_info "Service $service_name status: $replicas"
    return 0
}

# Rollback a single service
rollback_service() {
    local service="$1"

    log_info "Starting rollback for service: $service"

    # Determine current active and target colors
    local active_color=$(get_active_color "$service")
    local target_color=$(get_inactive_color "$service")

    log_info "Current active: ${service}-${ENVIRONMENT}-${active_color}"
    log_info "Rolling back to: ${service}-${ENVIRONMENT}-${target_color}"

    # Check if target service exists and is healthy
    if ! check_service_status "$service" "$target_color"; then
        local status=$?
        if [[ $status -eq 1 ]]; then
            log_error "Target service ${service}-${ENVIRONMENT}-${target_color} does not exist"
            return 1
        elif [[ $status -eq 2 ]]; then
            log_warning "Target service has 0 replicas, attempting to scale up..."

            # Get the desired replica count from the currently active service
            local desired_replicas=$(docker service ls --format "table {{.Name}}\t{{.Replicas}}" | grep "${service}-${ENVIRONMENT}-${active_color}" | awk '{print $2}' | cut -d'/' -f2)

            if [[ -z "$desired_replicas" ]] || [[ "$desired_replicas" -eq 0 ]]; then
                desired_replicas=1
            fi

            # Scale up the target service
            log_info "Scaling up ${service}-${ENVIRONMENT}-${target_color} to $desired_replicas replicas"
            docker service scale "${service}-${ENVIRONMENT}-${target_color}=${desired_replicas}" || {
                log_error "Failed to scale up target service"
                return 1
            }

            # Wait for service to become healthy
            log_info "Waiting for target service to become healthy..."
            local attempt=0
            local max_attempts=$((ROLLBACK_TIMEOUT / 10))

            while [[ $attempt -lt $max_attempts ]]; do
                if check_service_health "$service" "$target_color" 30; then
                    break
                fi

                log_info "Waiting for service to be ready... (attempt $((attempt+1))/$max_attempts)"
                sleep 10
                attempt=$((attempt+1))
            done

            if [[ $attempt -eq $max_attempts ]]; then
                log_error "Target service failed to become healthy within timeout"
                return 1
            fi
        fi
    fi

    # Switch traffic to the target service
    if switch_traffic "$service" "$target_color" "$active_color"; then
        log_success "Traffic switched to ${service}-${ENVIRONMENT}-${target_color}"

        # Optionally scale down the previously active service
        log_info "Scaling down previous service: ${service}-${ENVIRONMENT}-${active_color}"
        docker service scale "${service}-${ENVIRONMENT}-${active_color}=0" || {
            log_warning "Failed to scale down previous service"
        }

        return 0
    else
        log_error "Failed to switch traffic for service: $service"
        return 1
    fi
}

# Check service health
check_service_health() {
    local service="$1"
    local color="$2"
    local timeout="${3:-60}"

    local port
    case "$service" in
        "api") port=7001 ;;
        "agents") port=7002 ;;
        "gateway") port=7000 ;;
        "bridge") port=7003 ;;
        "dashboard") port=7004 ;;
        *) log_error "Unknown service: $service"; return 1 ;;
    esac

    local start_time=$(date +%s)
    local end_time=$((start_time + timeout))

    while [[ $(date +%s) -lt $end_time ]]; do
        if curl -f -s "http://localhost:${port}/health" > /dev/null; then
            log_success "${service}-${ENVIRONMENT}-${color} health check passed"
            return 0
        fi
        sleep 5
    done

    log_error "${service}-${ENVIRONMENT}-${color} health check failed after ${timeout}s"
    return 1
}

# Switch traffic between deployments
switch_traffic() {
    local service="$1"
    local new_color="$2"
    local old_color="$3"

    log_info "Switching traffic from ${old_color} to ${new_color} for service: $service"

    local nginx_config="nginx/nginx.${ENVIRONMENT}.conf"
    local temp_config="nginx/nginx.${ENVIRONMENT}.rollback.conf"
    local backup_config="nginx/nginx.${ENVIRONMENT}.rollback-backup.conf"

    # Create backup of current configuration
    cp "$nginx_config" "$backup_config"

    # Replace color references in the configuration
    sed "s/${service}-${ENVIRONMENT}-${old_color}/${service}-${ENVIRONMENT}-${new_color}/g" \
        "$nginx_config" > "$temp_config"

    # Validate new configuration
    if docker run --rm -v "$(pwd)/$temp_config:/etc/nginx/nginx.conf:ro" nginx:alpine nginx -t; then
        mv "$temp_config" "$nginx_config"

        # Reload nginx configuration
        if docker service update --force nginx-${ENVIRONMENT}; then
            log_success "Traffic switched to ${new_color} for service: $service"
            return 0
        else
            log_error "Failed to reload nginx configuration"
            # Restore backup
            mv "$backup_config" "$nginx_config"
            return 1
        fi
    else
        log_error "Invalid nginx configuration generated"
        rm -f "$temp_config"
        return 1
    fi
}

# Verify rollback was successful
verify_rollback() {
    local services=("$@")

    log_info "Verifying rollback success..."

    for service in "${services[@]}"; do
        # Check service health
        if ! check_service_health "$service" "$(get_active_color "$service")" 30; then
            log_error "Health check failed for $service after rollback"
            return 1
        fi

        log_success "$service rollback verification passed"
    done

    # Run quick smoke test
    log_info "Running post-rollback smoke tests..."

    cat > /tmp/rollback-smoke-test.js << 'EOF'
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
    duration: '30s',
    vus: 2,
    thresholds: {
        http_req_duration: ['p(95)<1000'],
        http_req_failed: ['rate<0.1'],
    },
};

const services = [
    { name: 'Gateway', port: 7000 },
    { name: 'API', port: 7001 },
];

export default function () {
    services.forEach(service => {
        const response = http.get(`http://localhost:${service.port}/health`);
        check(response, {
            [`${service.name} health check after rollback`]: (r) => r.status === 200,
        });
    });
    sleep(1);
}
EOF

    if k6 run --quiet /tmp/rollback-smoke-test.js; then
        log_success "Post-rollback smoke tests passed"
        rm -f /tmp/rollback-smoke-test.js
        return 0
    else
        log_error "Post-rollback smoke tests failed"
        rm -f /tmp/rollback-smoke-test.js
        return 1
    fi
}

# Display rollback status
display_status() {
    local environment="$1"
    local services=("${@:2}")

    echo ""
    log_info "Rollback Status Summary"
    log_info "======================="
    log_info "Environment: $environment"
    log_info "Services: ${services[*]}"
    log_info "Completed at: $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
    echo ""

    # Show active service versions
    log_info "Active Service Status:"
    for service in "${services[@]}"; do
        local active_color=$(get_active_color "$service")
        local service_name="${service}-${environment}-${active_color}"
        local replicas=$(docker service ls --format "table {{.Name}}\t{{.Replicas}}" | grep "$service_name" | awk '{print $2}')
        log_info "  $service: $active_color ($replicas replicas)"
    done
}

# Main rollback function
main() {
    log_error "🔄 EMERGENCY ROLLBACK INITIATED"
    log_warning "Environment: $ENVIRONMENT"
    log_warning "Services: $SERVICES"
    log_warning "Timeout: ${ROLLBACK_TIMEOUT}s"

    # Validate environment and prerequisites
    validate_environment

    # Check if Docker Swarm is active
    if ! docker node ls &>/dev/null; then
        log_error "Docker Swarm is not active"
        exit 1
    fi

    # Get services to rollback
    local services_array=($(get_services))

    # Perform rollback for each service
    local failed_services=()
    local successful_services=()

    for service in "${services_array[@]}"; do
        log_warning "Processing rollback for service: $service"

        if rollback_service "$service"; then
            successful_services+=("$service")
            log_success "✅ Rollback completed for service: $service"
        else
            failed_services+=("$service")
            log_error "❌ Rollback failed for service: $service"
        fi
    done

    # Verify rollback if any services were successful
    if [[ ${#successful_services[@]} -gt 0 ]]; then
        if verify_rollback "${successful_services[@]}"; then
            log_success "🎉 Rollback verification successful!"
        else
            log_error "⚠️ Rollback completed but verification failed"
        fi
    fi

    # Display final status
    display_status "$ENVIRONMENT" "${services_array[@]}"

    # Exit with error if any services failed
    if [[ ${#failed_services[@]} -gt 0 ]]; then
        log_error "Some services failed to rollback:"
        for service in "${failed_services[@]}"; do
            log_error "  - $service"
        done
        exit 1
    else
        log_success "🎉 All services rolled back successfully!"
        exit 0
    fi
}

# Execute main function
main "$@"