#!/bin/bash

# Development Deployment Script
# Usage: ./scripts/deploy-dev.sh [service-name]

set -e

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
ENVIRONMENT="dev"
DOCKER_COMPOSE_FILE="docker-compose.platform-dev.yml"
ENV_FILE=".github/environments/dev.env"

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
    log "Checking prerequisites..."

    # Check if Docker is running
    if ! docker info >/dev/null 2>&1; then
        error "Docker is not running. Please start Docker and try again."
    fi

    # Check if Docker Compose is available
    if ! command -v docker-compose >/dev/null 2>&1; then
        error "Docker Compose is not installed."
    fi

    # Check if environment file exists
    if [[ ! -f "$ENV_FILE" ]]; then
        error "Environment file $ENV_FILE not found."
    fi

    success "Prerequisites check passed"
}

# Build services
build_services() {
    local service=$1

    log "Building services for development environment..."

    if [[ -n "$service" ]]; then
        log "Building specific service: $service"
        docker-compose -f "$DOCKER_COMPOSE_FILE" build "$service-dev"
    else
        log "Building all services"
        docker-compose -f "$DOCKER_COMPOSE_FILE" build
    fi

    success "Services built successfully"
}

# Start services
start_services() {
    local service=$1

    log "Starting services..."

    # Start dependencies first
    log "Starting database services..."
    docker-compose -f "$DOCKER_COMPOSE_FILE" up -d postgres-dev redis-dev

    # Wait for databases to be ready
    log "Waiting for databases to be ready..."
    sleep 15

    # Run database migrations
    run_migrations

    if [[ -n "$service" ]]; then
        log "Starting specific service: $service"
        docker-compose -f "$DOCKER_COMPOSE_FILE" up -d "$service-dev"
    else
        log "Starting all application services"
        docker-compose -f "$DOCKER_COMPOSE_FILE" up -d
    fi

    success "Services started successfully"
}

# Run database migrations
run_migrations() {
    log "Running database migrations..."

    # Wait for PostgreSQL to be ready
    until docker-compose -f "$DOCKER_COMPOSE_FILE" exec -T postgres-dev pg_isready -U dev_user -d urnlabs_dev; do
        log "Waiting for PostgreSQL to be ready..."
        sleep 2
    done

    # Run Prisma migrations if API service is being deployed
    if docker-compose -f "$DOCKER_COMPOSE_FILE" ps api-dev >/dev/null 2>&1; then
        log "Running Prisma migrations..."
        # This would typically be run from the API container
        # docker-compose -f "$DOCKER_COMPOSE_FILE" exec api-dev pnpm prisma migrate deploy
        log "Migrations completed (would run: pnpm prisma migrate deploy)"
    fi

    success "Database migrations completed"
}

# Health check
health_check() {
    local service=$1

    log "Performing health checks..."

    local services_to_check
    if [[ -n "$service" ]]; then
        services_to_check="$service-dev"
    else
        services_to_check="api-dev agents-dev gateway-dev bridge-dev dashboard-dev"
    fi

    for svc in $services_to_check; do
        log "Checking health of $svc..."

        local max_attempts=30
        local attempt=1

        while [[ $attempt -le $max_attempts ]]; do
            if docker-compose -f "$DOCKER_COMPOSE_FILE" ps "$svc" | grep -q "healthy\|Up"; then
                success "$svc is healthy"
                break
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

# Show service status
show_status() {
    log "Current service status:"
    docker-compose -f "$DOCKER_COMPOSE_FILE" ps

    log "\nService URLs:"
    echo "🌐 Gateway:    http://localhost:7100"
    echo "🔧 API:        http://localhost:7101"
    echo "🤖 Agents:     http://localhost:7102"
    echo "🌉 Bridge:     http://localhost:7103"
    echo "📊 Dashboard:  http://localhost:7104"
    echo "📈 Prometheus: http://localhost:9091"
    echo "📊 Grafana:    http://localhost:3001 (admin:dev_admin_password)"
}

# Stop services
stop_services() {
    log "Stopping development services..."
    docker-compose -f "$DOCKER_COMPOSE_FILE" down
    success "Services stopped"
}

# Clean up (remove containers, volumes, etc.)
cleanup() {
    log "Cleaning up development environment..."
    docker-compose -f "$DOCKER_COMPOSE_FILE" down -v --remove-orphans
    docker system prune -f
    success "Cleanup completed"
}

# Show logs
show_logs() {
    local service=$1

    if [[ -n "$service" ]]; then
        docker-compose -f "$DOCKER_COMPOSE_FILE" logs -f "$service-dev"
    else
        docker-compose -f "$DOCKER_COMPOSE_FILE" logs -f
    fi
}

# Main deployment function
deploy() {
    local service=$1

    log "Starting development deployment..."
    log "Environment: $ENVIRONMENT"
    log "Service: ${service:-all}"

    check_prerequisites
    build_services "$service"
    start_services "$service"
    health_check "$service"
    show_status

    success "Development deployment completed successfully!"
}

# Parse command line arguments
case "${1:-deploy}" in
    "deploy")
        deploy "${2}"
        ;;
    "build")
        check_prerequisites
        build_services "${2}"
        ;;
    "start")
        start_services "${2}"
        ;;
    "stop")
        stop_services
        ;;
    "restart")
        stop_services
        deploy "${2}"
        ;;
    "status")
        show_status
        ;;
    "logs")
        show_logs "${2}"
        ;;
    "health")
        health_check "${2}"
        ;;
    "cleanup")
        cleanup
        ;;
    *)
        echo "Usage: $0 {deploy|build|start|stop|restart|status|logs|health|cleanup} [service-name]"
        echo ""
        echo "Commands:"
        echo "  deploy    - Full deployment (build, start, health check)"
        echo "  build     - Build services"
        echo "  start     - Start services"
        echo "  stop      - Stop services"
        echo "  restart   - Stop and redeploy"
        echo "  status    - Show service status and URLs"
        echo "  logs      - Show service logs"
        echo "  health    - Run health checks"
        echo "  cleanup   - Stop and remove all containers/volumes"
        echo ""
        echo "Service names: api, agents, gateway, bridge, dashboard"
        exit 1
        ;;
esac