#!/bin/bash

# Docker Swarm Setup Script for Blue-Green Deployments
# This script initializes Docker Swarm mode and sets up the required infrastructure

set -euo pipefail

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

# Check if Docker is running
check_docker() {
    if ! docker info &>/dev/null; then
        log_error "Docker is not running. Please start Docker first."
        exit 1
    fi
    log_success "Docker is running"
}

# Initialize Docker Swarm
init_swarm() {
    if docker node ls &>/dev/null; then
        log_info "Docker Swarm is already initialized"
        return 0
    fi

    log_info "Initializing Docker Swarm..."
    if docker swarm init; then
        log_success "Docker Swarm initialized successfully"
    else
        log_error "Failed to initialize Docker Swarm"
        exit 1
    fi
}

# Create overlay networks
create_networks() {
    local environments=("development" "staging" "production")

    for env in "${environments[@]}"; do
        local network_name="urnlabs-platform-${env}-network"

        if docker network ls --format "{{.Name}}" | grep -q "^${network_name}$"; then
            log_info "Network ${network_name} already exists"
        else
            log_info "Creating overlay network: ${network_name}"
            if docker network create \
                --driver overlay \
                --attachable \
                "$network_name"; then
                log_success "Created network: ${network_name}"
            else
                log_error "Failed to create network: ${network_name}"
                exit 1
            fi
        fi
    done
}

# Create Docker secrets for sensitive data
create_secrets() {
    local secrets=(
        "production_db_password"
        "production_jwt_secret"
        "production_redis_password"
        "staging_db_password"
        "staging_jwt_secret"
        "staging_redis_password"
    )

    log_info "Creating Docker secrets..."

    for secret in "${secrets[@]}"; do
        if docker secret ls --format "{{.Name}}" | grep -q "^${secret}$"; then
            log_info "Secret ${secret} already exists"
        else
            log_info "Creating secret: ${secret}"
            # Generate a secure random value for demonstration
            # In production, these should be set from environment variables or external secret management
            openssl rand -base64 32 | docker secret create "$secret" - || {
                log_error "Failed to create secret: ${secret}"
                exit 1
            }
            log_success "Created secret: ${secret}"
        fi
    done
}

# Deploy initial services stack
deploy_initial_stack() {
    local environment="${1:-staging}"

    log_info "Deploying initial stack for environment: ${environment}"

    if [[ ! -f "docker-compose.platform-${environment}.yml" ]]; then
        log_error "Docker compose file not found: docker-compose.platform-${environment}.yml"
        exit 1
    fi

    # Deploy the stack
    if docker stack deploy \
        --compose-file "docker-compose.platform-${environment}.yml" \
        "urnlabs-${environment}"; then
        log_success "Deployed initial stack: urnlabs-${environment}"
    else
        log_error "Failed to deploy initial stack"
        exit 1
    fi

    # Wait for services to be ready
    log_info "Waiting for services to become ready..."
    sleep 30

    # Check service status
    docker stack services "urnlabs-${environment}"
}

# Setup blue-green service configurations
setup_blue_green_services() {
    local environment="${1:-staging}"

    log_info "Setting up blue-green service configurations for: ${environment}"

    local services=("api" "agents" "gateway" "bridge" "dashboard")

    for service in "${services[@]}"; do
        # Create blue and green variants of each service
        for color in "blue" "green"; do
            local service_name="${service}-${environment}-${color}"

            if docker service ls --format "{{.Name}}" | grep -q "^${service_name}$"; then
                log_info "Service ${service_name} already exists"
            else
                log_info "Creating service: ${service_name}"

                # Create service with 0 replicas initially
                docker service create \
                    --name "$service_name" \
                    --replicas 0 \
                    --network "urnlabs-platform-${environment}-network" \
                    --label "app=${service}" \
                    --label "environment=${environment}" \
                    --label "color=${color}" \
                    "ghcr.io/urnlabs-ai/urnlabs-${service}:latest" || {
                    log_warning "Failed to create service: ${service_name} (may not exist yet)"
                }
            fi
        done
    done

    log_success "Blue-green services setup completed"
}

# Verify swarm setup
verify_setup() {
    log_info "Verifying Docker Swarm setup..."

    # Check if swarm is active
    if ! docker node ls &>/dev/null; then
        log_error "Docker Swarm is not active"
        return 1
    fi

    # Check networks
    local required_networks=("urnlabs-platform-development-network" "urnlabs-platform-staging-network" "urnlabs-platform-production-network")
    for network in "${required_networks[@]}"; do
        if ! docker network ls --format "{{.Name}}" | grep -q "^${network}$"; then
            log_error "Required network not found: ${network}"
            return 1
        fi
    done

    # Check secrets
    local secret_count=$(docker secret ls --format "{{.Name}}" | wc -l)
    if [[ $secret_count -lt 6 ]]; then
        log_warning "Some Docker secrets may be missing"
    fi

    log_success "Docker Swarm setup verification completed"
    log_info "Summary:"
    log_info "========="
    log_info "Active nodes: $(docker node ls --format "{{.Hostname}}" | wc -l)"
    log_info "Networks: $(docker network ls --filter driver=overlay --format "{{.Name}}" | wc -l) overlay networks"
    log_info "Secrets: $(docker secret ls --format "{{.Name}}" | wc -l) secrets"
    log_info "Services: $(docker service ls --format "{{.Name}}" | wc -l) services"
}

# Main function
main() {
    local environment="${1:-staging}"

    log_info "Setting up Docker Swarm for Urnlabs AI Platform"
    log_info "Environment: ${environment}"

    # Validate environment
    if [[ ! "$environment" =~ ^(development|staging|production)$ ]]; then
        log_error "Invalid environment: $environment. Must be 'development', 'staging', or 'production'"
        exit 1
    fi

    # Run setup steps
    check_docker
    init_swarm
    create_networks
    create_secrets
    setup_blue_green_services "$environment"
    verify_setup

    log_success "Docker Swarm setup completed successfully!"
    log_info "You can now run blue-green deployments using:"
    log_info "  ./scripts/blue-green-deploy.sh ${environment} all"
}

# Execute main function
main "$@"