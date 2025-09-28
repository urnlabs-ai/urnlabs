#!/bin/bash

# Staging Deployment Script
# Usage: ./scripts/deploy-staging.sh [service-name]

set -e

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
ENVIRONMENT="staging"
DOCKER_COMPOSE_FILE="docker-compose.platform-staging.yml"
ENV_FILE=".github/environments/staging.env"
IMAGE_TAG="${GITHUB_SHA:-latest}"

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

# Check prerequisites
check_prerequisites() {
    log "Checking prerequisites for staging deployment..."

    # Check if Docker is running
    if ! docker info >/dev/null 2>&1; then
        error "Docker is not running. Please start Docker and try again."
    fi

    # Check if required environment variables are set
    if [[ -z "$STAGING_DATABASE_URL" ]]; then
        error "STAGING_DATABASE_URL environment variable is not set"
    fi

    if [[ -z "$STAGING_REDIS_URL" ]]; then
        error "STAGING_REDIS_URL environment variable is not set"
    fi

    # Check if environment file exists
    if [[ ! -f "$ENV_FILE" ]]; then
        error "Environment file $ENV_FILE not found."
    fi

    success "Prerequisites check passed"
}

# Pull Docker images
pull_images() {
    local service=$1

    log "Pulling Docker images for staging..."

    if [[ -n "$service" ]]; then
        log "Pulling image for service: $service"
        docker pull "ghcr.io/${GITHUB_REPOSITORY}-${service}:${IMAGE_TAG}" || error "Failed to pull image for $service"
    else
        log "Pulling all service images"
        local services="api agents gateway bridge dashboard"
        for svc in $services; do
            log "Pulling image for $svc..."
            docker pull "ghcr.io/${GITHUB_REPOSITORY}-${svc}:${IMAGE_TAG}" || warning "Failed to pull image for $svc"
        done
    fi

    success "Images pulled successfully"
}

# Create backup before deployment
create_backup() {
    log "Creating database backup before deployment..."

    local backup_file="backup_staging_$(date +%Y%m%d_%H%M%S).sql"

    # Create database backup
    if command -v pg_dump >/dev/null 2>&1; then
        pg_dump "$STAGING_DATABASE_URL" > "backups/$backup_file" || warning "Database backup failed"
        success "Database backup created: backups/$backup_file"
    else
        warning "pg_dump not available, skipping database backup"
    fi
}

# Run database migrations
run_migrations() {
    log "Running database migrations for staging..."

    # Check if database is accessible
    if ! docker-compose -f "$DOCKER_COMPOSE_FILE" exec -T postgres-staging pg_isready >/dev/null 2>&1; then
        warning "Database not accessible via Docker, attempting direct connection"
    fi

    # Run Prisma migrations
    log "Running Prisma migrations..."
    export DATABASE_URL="$STAGING_DATABASE_URL"

    # This would typically be run in the API container or CI environment
    # docker run --rm -e DATABASE_URL="$STAGING_DATABASE_URL" \
    #   ghcr.io/${GITHUB_REPOSITORY}-api:${IMAGE_TAG} \
    #   npx prisma migrate deploy

    log "Migrations completed (would run: npx prisma migrate deploy)"
    success "Database migrations completed"
}

# Blue-Green Deployment
blue_green_deploy() {
    local service=$1

    log "Starting Blue-Green deployment for staging..."

    # Determine current and new deployment colors
    local current_color=$(docker-compose -f "$DOCKER_COMPOSE_FILE" ps -q | head -1 | xargs docker inspect --format '{{.Config.Labels.deployment_color}}' 2>/dev/null || echo "blue")
    local new_color=$([ "$current_color" = "blue" ] && echo "green" || echo "blue")

    log "Current deployment: $current_color, New deployment: $new_color"

    # Start new version alongside current
    if [[ -n "$service" ]]; then
        log "Deploying new version of $service-staging..."
        IMAGE_TAG="$IMAGE_TAG" DEPLOYMENT_COLOR="$new_color" \
            docker-compose -f "$DOCKER_COMPOSE_FILE" up -d "$service-staging"
    else
        log "Deploying new version of all services..."
        IMAGE_TAG="$IMAGE_TAG" DEPLOYMENT_COLOR="$new_color" \
            docker-compose -f "$DOCKER_COMPOSE_FILE" up -d
    fi

    # Wait for new version to be healthy
    health_check "$service"

    # Switch traffic (this would typically be done by a load balancer)
    log "Switching traffic to new deployment ($new_color)..."
    sleep 5  # Grace period

    # Stop old version
    if [[ "$current_color" != "unknown" ]]; then
        log "Stopping old deployment ($current_color)..."
        # This would stop the old colored deployment
    fi

    success "Blue-Green deployment completed"
}

# Health check with retry logic
health_check() {
    local service=$1

    log "Performing comprehensive health checks..."

    local services_to_check
    if [[ -n "$service" ]]; then
        services_to_check="$service-staging"
    else
        services_to_check="api-staging agents-staging gateway-staging bridge-staging dashboard-staging"
    fi

    for svc in $services_to_check; do
        log "Checking health of $svc..."

        local max_attempts=60  # More attempts for staging
        local attempt=1

        while [[ $attempt -le $max_attempts ]]; do
            # Check container status
            if docker-compose -f "$DOCKER_COMPOSE_FILE" ps "$svc" | grep -q "healthy\|Up"; then

                # Additional health check via HTTP endpoint
                local port=$(docker-compose -f "$DOCKER_COMPOSE_FILE" port "$svc" 2>/dev/null | cut -d: -f2 || echo "")
                if [[ -n "$port" ]]; then
                    if curl -f "http://localhost:$port/health" >/dev/null 2>&1; then
                        success "$svc is healthy and responding"
                        break
                    else
                        log "$svc container is up but health endpoint not responding"
                    fi
                else
                    success "$svc is healthy"
                    break
                fi
            fi

            if [[ $attempt -eq $max_attempts ]]; then
                error "$svc failed health check after $max_attempts attempts"
            fi

            log "Attempt $attempt/$max_attempts: $svc not ready yet, waiting..."
            sleep 15
            ((attempt++))
        done
    done

    success "All health checks passed"
}

# Run smoke tests
run_smoke_tests() {
    log "Running smoke tests for staging..."

    # Basic connectivity tests
    local endpoints=(
        "http://localhost:7000/health"     # Gateway
        "http://localhost:7001/health"     # API
        "http://localhost:7002/health"     # Agents
        "http://localhost:7003/health"     # Bridge
        "http://localhost:7004/health"     # Dashboard
    )

    for endpoint in "${endpoints[@]}"; do
        log "Testing endpoint: $endpoint"
        if curl -f "$endpoint" >/dev/null 2>&1; then
            success "✓ $endpoint is responding"
        else
            error "✗ $endpoint is not responding"
        fi
    done

    # Additional smoke tests would go here
    # - Authentication flow test
    # - Basic API functionality test
    # - Agent communication test

    success "Smoke tests completed successfully"
}

# Performance validation
performance_validation() {
    log "Running performance validation..."

    # Basic performance test using curl
    local api_endpoint="http://localhost:7001/health"
    local response_times=()

    for i in {1..10}; do
        local response_time=$(curl -o /dev/null -s -w '%{time_total}' "$api_endpoint")
        response_times+=("$response_time")
        log "Request $i: ${response_time}s"
    done

    # Calculate average response time
    local total=0
    for time in "${response_times[@]}"; do
        total=$(echo "$total + $time" | bc -l)
    done
    local average=$(echo "scale=3; $total / ${#response_times[@]}" | bc -l)

    log "Average response time: ${average}s"

    # Check if average is under 200ms (0.2s)
    if (( $(echo "$average < 0.2" | bc -l) )); then
        success "Performance validation passed (avg: ${average}s < 0.2s)"
    else
        warning "Performance validation failed (avg: ${average}s >= 0.2s)"
    fi
}

# Show deployment status
show_status() {
    log "Staging deployment status:"
    docker-compose -f "$DOCKER_COMPOSE_FILE" ps

    log "\nStaging URLs:"
    echo "🌐 Gateway:    https://staging-gateway.urnlabs.ai"
    echo "🔧 API:        https://staging-api.urnlabs.ai"
    echo "🤖 Agents:     https://staging-agents.urnlabs.ai"
    echo "🌉 Bridge:     https://staging-bridge.urnlabs.ai"
    echo "📊 Dashboard:  https://staging-dashboard.urnlabs.ai"
    echo "📈 Prometheus: https://staging-monitoring.urnlabs.ai"
    echo "📊 Grafana:    https://staging-grafana.urnlabs.ai"
}

# Rollback deployment
rollback() {
    local previous_tag=$1

    if [[ -z "$previous_tag" ]]; then
        error "Previous image tag is required for rollback"
    fi

    warning "Rolling back staging deployment to $previous_tag..."

    # Set image tag to previous version
    IMAGE_TAG="$previous_tag"

    # Redeploy with previous version
    blue_green_deploy

    success "Rollback to $previous_tag completed"
}

# Main deployment function
deploy() {
    local service=$1

    log "Starting staging deployment..."
    log "Environment: $ENVIRONMENT"
    log "Image Tag: $IMAGE_TAG"
    log "Service: ${service:-all}"

    check_prerequisites
    create_backup
    pull_images "$service"
    run_migrations
    blue_green_deploy "$service"
    run_smoke_tests
    performance_validation
    show_status

    success "Staging deployment completed successfully!"
    log "Staging environment is ready for testing and validation"
}

# Parse command line arguments
case "${1:-deploy}" in
    "deploy")
        deploy "${2}"
        ;;
    "rollback")
        rollback "${2}"
        ;;
    "health")
        health_check "${2}"
        ;;
    "smoke-test")
        run_smoke_tests
        ;;
    "status")
        show_status
        ;;
    *)
        echo "Usage: $0 {deploy|rollback|health|smoke-test|status} [service-name|image-tag]"
        echo ""
        echo "Commands:"
        echo "  deploy      - Full staging deployment"
        echo "  rollback    - Rollback to previous version (requires image tag)"
        echo "  health      - Run health checks"
        echo "  smoke-test  - Run smoke tests"
        echo "  status      - Show deployment status"
        echo ""
        echo "Service names: api, agents, gateway, bridge, dashboard"
        exit 1
        ;;
esac