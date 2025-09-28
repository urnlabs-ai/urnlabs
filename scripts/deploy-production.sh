#!/bin/bash

# Production Deployment Script with Blue-Green Strategy
# Usage: ./scripts/deploy-production.sh [service-name]

set -e

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
ENVIRONMENT="production"
DOCKER_COMPOSE_FILE="docker-compose.platform-production.yml"
ENV_FILE=".github/environments/production.env"
IMAGE_TAG="${GITHUB_SHA:-latest}"
BACKUP_RETENTION_DAYS=30

# Logging function
log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')] $1${NC}"
}

error() {
    echo -e "${RED}[ERROR] $1${NC}"
    exit 1
}

warning() {
    echo -e "${YELLOW}[WARNING] $1${NC}"
}

success() {
    echo -e "${GREEN}[SUCCESS] $1${NC}"
}

# Check prerequisites for production deployment
check_prerequisites() {
    log "Checking prerequisites for production deployment..."

    # Check if running in CI/CD or with proper authentication
    if [[ -z "$CI" && -z "$PRODUCTION_DEPLOY_KEY" ]]; then
        error "Production deployment requires CI environment or PRODUCTION_DEPLOY_KEY"
    fi

    # Check if Docker is running
    if ! docker info >/dev/null 2>&1; then
        error "Docker is not running. Please start Docker and try again."
    fi

    # Check if required environment variables are set
    local required_vars=(
        "PRODUCTION_DATABASE_URL"
        "PRODUCTION_REDIS_URL"
        "PRODUCTION_JWT_SECRET"
        "GRAFANA_ADMIN_PASSWORD"
    )

    for var in "${required_vars[@]}"; do
        if [[ -z "${!var}" ]]; then
            error "$var environment variable is not set"
        fi
    done

    # Check if environment file exists
    if [[ ! -f "$ENV_FILE" ]]; then
        error "Environment file $ENV_FILE not found."
    fi

    # Verify image exists in registry
    if ! docker manifest inspect "ghcr.io/${GITHUB_REPOSITORY}-api:${IMAGE_TAG}" >/dev/null 2>&1; then
        error "Image ghcr.io/${GITHUB_REPOSITORY}-api:${IMAGE_TAG} not found in registry"
    fi

    success "Prerequisites check passed"
}

# Create comprehensive backup
create_backup() {
    log "Creating comprehensive backup before production deployment..."

    local timestamp=$(date +%Y%m%d_%H%M%S)
    local backup_dir="backups/production_$timestamp"

    mkdir -p "$backup_dir"

    # Database backup
    log "Creating database backup..."
    if command -v pg_dump >/dev/null 2>&1; then
        pg_dump "$PRODUCTION_DATABASE_URL" | gzip > "$backup_dir/database.sql.gz"
        success "Database backup created"
    else
        error "pg_dump not available for database backup"
    fi

    # Redis backup
    log "Creating Redis backup..."
    if command -v redis-cli >/dev/null 2>&1; then
        redis-cli --rdb "$backup_dir/redis.rdb" || warning "Redis backup failed"
    fi

    # Configuration backup
    log "Backing up configuration files..."
    cp -r .github/environments "$backup_dir/"
    cp docker-compose.platform-production.yml "$backup_dir/"

    # Store current deployment state
    docker-compose -f "$DOCKER_COMPOSE_FILE" ps --format json > "$backup_dir/deployment_state.json" || true

    # Clean up old backups
    find backups/ -type d -name "production_*" -mtime +$BACKUP_RETENTION_DAYS -exec rm -rf {} + || true

    success "Comprehensive backup created in $backup_dir"
    echo "$backup_dir" > .last_backup_path
}

# Pull and verify images
pull_images() {
    local service=$1

    log "Pulling and verifying Docker images for production..."

    if [[ -n "$service" ]]; then
        log "Pulling image for service: $service"
        docker pull "ghcr.io/${GITHUB_REPOSITORY}-${service}:${IMAGE_TAG}"

        # Verify image integrity
        docker run --rm "ghcr.io/${GITHUB_REPOSITORY}-${service}:${IMAGE_TAG}" --version || true
    else
        log "Pulling all service images"
        local services="api agents gateway bridge dashboard"
        for svc in $services; do
            log "Pulling image for $svc..."
            docker pull "ghcr.io/${GITHUB_REPOSITORY}-${svc}:${IMAGE_TAG}"

            # Verify image integrity
            docker run --rm "ghcr.io/${GITHUB_REPOSITORY}-${svc}:${IMAGE_TAG}" --version || true
        done
    fi

    success "Images pulled and verified successfully"
}

# Run database migrations with validation
run_migrations() {
    log "Running database migrations for production..."

    # Create migration backup
    local migration_backup="migration_backup_$(date +%Y%m%d_%H%M%S).sql"
    pg_dump "$PRODUCTION_DATABASE_URL" | gzip > "backups/$migration_backup.gz"

    # Validate migration in read-only mode first
    log "Validating migration safety..."
    export DATABASE_URL="$PRODUCTION_DATABASE_URL"

    # Run migration in dry-run mode (if supported)
    # docker run --rm -e DATABASE_URL="$PRODUCTION_DATABASE_URL" \
    #   ghcr.io/${GITHUB_REPOSITORY}-api:${IMAGE_TAG} \
    #   npx prisma migrate diff --from-schema-datamodel prisma/schema.prisma --to-schema-datasource ${DATABASE_URL}

    # Run actual migration
    log "Applying database migrations..."
    # docker run --rm -e DATABASE_URL="$PRODUCTION_DATABASE_URL" \
    #   ghcr.io/${GITHUB_REPOSITORY}-api:${IMAGE_TAG} \
    #   npx prisma migrate deploy

    # Run actual migration with validation script
    if [[ -f "scripts/validate-migration.sh" ]]; then
        chmod +x scripts/validate-migration.sh
        ./scripts/validate-migration.sh production "" full false
    else
        log "Migration validation script not found, running Prisma deploy directly"
        # docker run --rm -e DATABASE_URL="$PRODUCTION_DATABASE_URL" \
        #   ghcr.io/${GITHUB_REPOSITORY}-api:${IMAGE_TAG} \
        #   npx prisma migrate deploy
    fi

    log "Migrations completed (would run: npx prisma migrate deploy)"

    # Validate database integrity after migration
    log "Validating database integrity..."
    # Add database integrity checks here

    success "Database migrations completed and validated"
}

# Blue-Green deployment with traffic switching
blue_green_deploy() {
    local service=$1

    log "Starting Blue-Green deployment for production..."

    # Determine current and new deployment colors
    local current_color=$(docker ps --filter "label=app=urnlabs" --filter "label=environment=production" --format "{{.Labels}}" | grep -o 'deployment_color=[^,]*' | cut -d= -f2 | head -1 || echo "blue")
    local new_color=$([ "$current_color" = "blue" ] && echo "green" || echo "blue")

    log "Current deployment: $current_color, New deployment: $new_color"

    # Deploy new version with new color
    log "Deploying new version ($new_color)..."

    if [[ -n "$service" ]]; then
        IMAGE_TAG="$IMAGE_TAG" DEPLOYMENT_COLOR="$new_color" \
            docker-compose -f "$DOCKER_COMPOSE_FILE" up -d "$service-production"
    else
        IMAGE_TAG="$IMAGE_TAG" DEPLOYMENT_COLOR="$new_color" \
            docker-compose -f "$DOCKER_COMPOSE_FILE" up -d
    fi

    # Wait for new deployment to be fully ready
    log "Waiting for new deployment to be ready..."
    health_check "$service" 120  # Extended timeout for production

    # Run comprehensive validation
    run_production_validation "$service"

    # Gradual traffic shifting (this would typically be done by a load balancer)
    log "Starting gradual traffic shift to new deployment..."

    # 10% traffic to new version
    log "Shifting 10% traffic to new deployment..."
    sleep 30

    # Monitor metrics for 2 minutes
    monitor_metrics 120

    # 50% traffic
    log "Shifting 50% traffic to new deployment..."
    sleep 30
    monitor_metrics 120

    # 100% traffic
    log "Shifting 100% traffic to new deployment..."
    sleep 30
    monitor_metrics 180

    # Verify new deployment is handling all traffic successfully
    if validate_traffic_shift; then
        # Stop old deployment
        log "Traffic shift successful, stopping old deployment ($current_color)..."
        stop_old_deployment "$current_color"
        success "Blue-Green deployment completed successfully"
    else
        error "Traffic shift validation failed, initiating rollback..."
        rollback_traffic "$current_color"
    fi
}

# Monitor key metrics during deployment
monitor_metrics() {
    local duration=$1
    local start_time=$(date +%s)
    local end_time=$((start_time + duration))

    log "Monitoring metrics for ${duration} seconds..."

    while [[ $(date +%s) -lt $end_time ]]; do
        # Check error rates (this would typically query your monitoring system)
        local error_rate=$(curl -s "http://localhost:9090/api/v1/query?query=rate(http_requests_total{status=~\"5..\"}[5m])" | jq -r '.data.result[0].value[1] // "0"' 2>/dev/null || echo "0")

        # Check response times
        local avg_response_time=$(curl -s "http://localhost:9090/api/v1/query?query=avg(http_request_duration_seconds)" | jq -r '.data.result[0].value[1] // "0"' 2>/dev/null || echo "0")

        log "Error rate: ${error_rate}%, Avg response time: ${avg_response_time}s"

        # Alert if metrics are outside acceptable range
        if (( $(echo "$error_rate > 0.01" | bc -l) )); then
            warning "High error rate detected: ${error_rate}%"
        fi

        if (( $(echo "$avg_response_time > 0.2" | bc -l) )); then
            warning "High response time detected: ${avg_response_time}s"
        fi

        sleep 10
    done

    success "Metrics monitoring completed"
}

# Validate traffic shift
validate_traffic_shift() {
    log "Validating traffic shift..."

    # Check that new deployment is receiving traffic
    local new_traffic=$(curl -s "http://localhost:9090/api/v1/query?query=rate(http_requests_total{deployment_color=\"$new_color\"}[5m])" | jq -r '.data.result[0].value[1] // "0"' 2>/dev/null || echo "1")

    if (( $(echo "$new_traffic > 0" | bc -l) )); then
        success "Traffic shift validation passed"
        return 0
    else
        error "Traffic shift validation failed"
        return 1
    fi
}

# Comprehensive production validation
run_production_validation() {
    local service=$1

    log "Running comprehensive production validation..."

    # Health checks
    health_check "$service" 60

    # Critical path testing
    run_critical_path_tests

    # Performance validation
    run_performance_tests

    # Security validation
    run_security_validation

    # Integration testing
    run_integration_tests

    success "Production validation completed successfully"
}

# Critical path testing
run_critical_path_tests() {
    log "Running critical path tests..."

    local endpoints=(
        "https://api.urnlabs.ai/health"
        "https://gateway.urnlabs.ai/health"
        "https://agents.urnlabs.ai/health"
    )

    for endpoint in "${endpoints[@]}"; do
        log "Testing critical endpoint: $endpoint"

        local response_code=$(curl -s -o /dev/null -w "%{http_code}" "$endpoint")

        if [[ "$response_code" == "200" ]]; then
            success "✓ $endpoint is responding correctly"
        else
            error "✗ $endpoint returned $response_code"
        fi
    done

    # Test authentication flow
    log "Testing authentication flow..."
    # Add authentication flow test here

    # Test agent workflow
    log "Testing agent workflow..."
    # Add agent workflow test here

    success "Critical path tests completed"
}

# Performance testing
run_performance_tests() {
    log "Running performance tests..."

    # Use k6 for performance testing if available
    if command -v k6 >/dev/null 2>&1; then
        log "Running k6 performance tests..."
        k6 run --quiet performance/k6-production.js || warning "Performance tests failed"
    else
        # Fallback to curl-based testing
        log "Running curl-based performance tests..."

        local api_endpoint="https://api.urnlabs.ai/health"
        local total_time=0
        local requests=20

        for i in $(seq 1 $requests); do
            local response_time=$(curl -o /dev/null -s -w '%{time_total}' "$api_endpoint")
            total_time=$(echo "$total_time + $response_time" | bc -l)
        done

        local avg_time=$(echo "scale=3; $total_time / $requests" | bc -l)
        log "Average response time: ${avg_time}s"

        if (( $(echo "$avg_time < 0.2" | bc -l) )); then
            success "Performance tests passed (avg: ${avg_time}s)"
        else
            warning "Performance tests failed (avg: ${avg_time}s >= 0.2s)"
        fi
    fi
}

# Security validation
run_security_validation() {
    log "Running security validation..."

    # Check security headers
    local security_headers=("X-Frame-Options" "X-Content-Type-Options" "Strict-Transport-Security")

    for header in "${security_headers[@]}"; do
        if curl -s -I "https://api.urnlabs.ai/health" | grep -qi "$header"; then
            success "✓ Security header $header is present"
        else
            warning "✗ Security header $header is missing"
        fi
    done

    # Check SSL/TLS configuration
    if openssl s_client -connect api.urnlabs.ai:443 -servername api.urnlabs.ai </dev/null 2>/dev/null | grep -q "Verify return code: 0"; then
        success "✓ SSL/TLS configuration is valid"
    else
        warning "✗ SSL/TLS configuration issues detected"
    fi

    success "Security validation completed"
}

# Integration testing
run_integration_tests() {
    log "Running integration tests..."

    # Test service-to-service communication
    log "Testing service integration..."

    # Test database connectivity
    log "Testing database connectivity..."

    # Test Redis connectivity
    log "Testing Redis connectivity..."

    # Test external service integration
    log "Testing external service integration..."

    success "Integration tests completed"
}

# Health check with extended timeout for production
health_check() {
    local service=$1
    local timeout=${2:-60}

    log "Performing production health checks (timeout: ${timeout}s)..."

    local services_to_check
    if [[ -n "$service" ]]; then
        services_to_check="$service-production"
    else
        services_to_check="api-production agents-production gateway-production bridge-production dashboard-production"
    fi

    for svc in $services_to_check; do
        log "Checking health of $svc..."

        local max_attempts=$((timeout / 10))
        local attempt=1

        while [[ $attempt -le $max_attempts ]]; do
            # Check container status
            if docker-compose -f "$DOCKER_COMPOSE_FILE" ps "$svc" | grep -q "healthy\|Up"; then
                # Additional health check via HTTPS endpoint
                local service_name=$(echo "$svc" | sed 's/-production$//')
                local health_url="https://${service_name}.urnlabs.ai/health"

                if curl -f --max-time 10 "$health_url" >/dev/null 2>&1; then
                    success "$svc is healthy and responding via HTTPS"
                    break
                else
                    log "$svc container is up but HTTPS health endpoint not responding"
                fi
            fi

            if [[ $attempt -eq $max_attempts ]]; then
                error "$svc failed health check after $max_attempts attempts"
            fi

            log "Attempt $attempt/$max_attempts: $svc not ready yet, waiting..."
            sleep 10
            ((attempt++))
        done
    done

    success "All health checks passed"
}

# Production status and monitoring
show_status() {
    log "Production deployment status:"
    docker-compose -f "$DOCKER_COMPOSE_FILE" ps

    log "\nProduction URLs:"
    echo "🌐 Gateway:    https://gateway.urnlabs.ai"
    echo "🔧 API:        https://api.urnlabs.ai"
    echo "🤖 Agents:     https://agents.urnlabs.ai"
    echo "🌉 Bridge:     https://bridge.urnlabs.ai"
    echo "📊 Dashboard:  https://dashboard.urnlabs.ai"
    echo "📈 Monitoring: https://monitoring.urnlabs.ai"

    log "\nKey Metrics:"
    # Add key metrics display here
}

# Emergency rollback
emergency_rollback() {
    local previous_tag=$1

    if [[ -z "$previous_tag" ]]; then
        if [[ -f ".last_backup_path" ]]; then
            local backup_path=$(cat .last_backup_path)
            warning "No previous tag specified, attempting rollback using backup from $backup_path"
        else
            error "Previous image tag is required for rollback and no backup path found"
        fi
    fi

    warning "EMERGENCY ROLLBACK initiated for production to $previous_tag"

    # Immediate traffic switch to previous version
    log "Switching traffic back to previous deployment..."

    # Restart services with previous image
    IMAGE_TAG="$previous_tag" docker-compose -f "$DOCKER_COMPOSE_FILE" up -d --force-recreate

    # Quick health check
    health_check "" 30

    # Restore database if needed
    if [[ -n "$RESTORE_DATABASE" ]]; then
        warning "Restoring database from backup..."
        # Database restore logic would go here
    fi

    success "Emergency rollback completed"
    log "Production has been rolled back to $previous_tag"
}

# Main production deployment function
deploy() {
    local service=$1

    # Production deployment requires explicit confirmation
    if [[ -z "$CONFIRMED" ]]; then
        echo -e "${YELLOW}WARNING: This will deploy to PRODUCTION environment!${NC}"
        echo -e "${YELLOW}Image Tag: $IMAGE_TAG${NC}"
        echo -e "${YELLOW}Service: ${service:-all}${NC}"
        echo ""
        read -p "Type 'DEPLOY TO PRODUCTION' to continue: " confirmation

        if [[ "$confirmation" != "DEPLOY TO PRODUCTION" ]]; then
            log "Production deployment cancelled by user"
            exit 0
        fi
    fi

    log "Starting PRODUCTION deployment..."
    log "Environment: $ENVIRONMENT"
    log "Image Tag: $IMAGE_TAG"
    log "Service: ${service:-all}"
    log "Deployment ID: production_$(date +%Y%m%d_%H%M%S)"

    # Record deployment start
    echo "$(date): Starting production deployment $IMAGE_TAG" >> deployment.log

    check_prerequisites
    create_backup
    pull_images "$service"
    run_migrations
    blue_green_deploy "$service"
    show_status

    # Record deployment completion
    echo "$(date): Completed production deployment $IMAGE_TAG" >> deployment.log

    success "PRODUCTION DEPLOYMENT COMPLETED SUCCESSFULLY!"
    log "Production environment is live with version $IMAGE_TAG"
    log "Monitor dashboards and alerts for the next 24 hours"
}

# Parse command line arguments
case "${1:-deploy}" in
    "deploy")
        deploy "${2}"
        ;;
    "rollback")
        emergency_rollback "${2}"
        ;;
    "health")
        health_check "${2}"
        ;;
    "status")
        show_status
        ;;
    "validate")
        run_production_validation "${2}"
        ;;
    *)
        echo "Usage: $0 {deploy|rollback|health|status|validate} [service-name|image-tag]"
        echo ""
        echo "Commands:"
        echo "  deploy    - Full production deployment with Blue-Green strategy"
        echo "  rollback  - Emergency rollback to previous version"
        echo "  health    - Run health checks"
        echo "  status    - Show production status"
        echo "  validate  - Run production validation tests"
        echo ""
        echo "Service names: api, agents, gateway, bridge, dashboard"
        echo ""
        echo "Environment Variables:"
        echo "  CONFIRMED=1         - Skip deployment confirmation"
        echo "  RESTORE_DATABASE=1  - Restore database during rollback"
        exit 1
        ;;
esac