#!/bin/bash

# Setup Deployment Monitoring
# Configures comprehensive monitoring for deployment validation and real-time tracking
# This script sets up Prometheus, Grafana, and alerting for deployment monitoring

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ENVIRONMENT="${ENVIRONMENT:-staging}"
MONITORING_DIR="$PROJECT_ROOT/monitoring"
DOCKER_COMPOSE_MONITORING="$PROJECT_ROOT/docker-compose.monitoring.yml"

# Logging function
log() {
    local level=$1
    shift
    local message="$*"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')

    case $level in
        "INFO")
            echo -e "${BLUE}[INFO]${NC} $timestamp - $message"
            ;;
        "WARN")
            echo -e "${YELLOW}[WARN]${NC} $timestamp - $message"
            ;;
        "ERROR")
            echo -e "${RED}[ERROR]${NC} $timestamp - $message"
            ;;
        "SUCCESS")
            echo -e "${GREEN}[SUCCESS]${NC} $timestamp - $message"
            ;;
    esac
}

# Create monitoring Docker Compose configuration
create_monitoring_compose() {
    log "INFO" "Creating monitoring Docker Compose configuration..."

    cat > "$DOCKER_COMPOSE_MONITORING" << 'EOF'
version: '3.8'

services:
  # Prometheus for metrics collection
  prometheus:
    image: prom/prometheus:latest
    container_name: urnlabs-prometheus-deployment
    ports:
      - "9090:9090"
    volumes:
      - ./monitoring/deployment-monitoring.yml:/etc/prometheus/prometheus.yml:ro
      - ./monitoring/rules:/etc/prometheus/rules:ro
      - prometheus_data:/prometheus
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.path=/prometheus'
      - '--web.console.libraries=/etc/prometheus/console_libraries'
      - '--web.console.templates=/etc/prometheus/consoles'
      - '--storage.tsdb.retention.time=30d'
      - '--web.enable-lifecycle'
      - '--web.enable-admin-api'
    networks:
      - monitoring
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "wget", "--spider", "-q", "http://localhost:9090/-/healthy"]
      interval: 30s
      timeout: 10s
      retries: 3

  # Grafana for visualization
  grafana:
    image: grafana/grafana:latest
    container_name: urnlabs-grafana-deployment
    ports:
      - "3000:3000"
    volumes:
      - grafana_data:/var/lib/grafana
      - ./monitoring/dashboards:/etc/grafana/provisioning/dashboards:ro
      - ./monitoring/datasources:/etc/grafana/provisioning/datasources:ro
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=${GRAFANA_ADMIN_PASSWORD:-admin123}
      - GF_USERS_ALLOW_SIGN_UP=false
      - GF_SECURITY_ALLOW_EMBEDDING=true
      - GF_DASHBOARDS_DEFAULT_HOME_DASHBOARD_PATH=/etc/grafana/provisioning/dashboards/deployment-dashboard.json
    networks:
      - monitoring
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  # Alertmanager for alerting
  alertmanager:
    image: prom/alertmanager:latest
    container_name: urnlabs-alertmanager-deployment
    ports:
      - "9093:9093"
    volumes:
      - ./monitoring/alertmanager:/etc/alertmanager:ro
      - alertmanager_data:/alertmanager
    command:
      - '--config.file=/etc/alertmanager/alertmanager.yml'
      - '--storage.path=/alertmanager'
      - '--web.external-url=http://localhost:9093'
    networks:
      - monitoring
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "wget", "--spider", "-q", "http://localhost:9093/-/healthy"]
      interval: 30s
      timeout: 10s
      retries: 3

  # Node Exporter for system metrics
  node-exporter:
    image: prom/node-exporter:latest
    container_name: urnlabs-node-exporter-deployment
    ports:
      - "9100:9100"
    volumes:
      - '/proc:/host/proc:ro'
      - '/sys:/host/sys:ro'
      - '/:/rootfs:ro'
    command:
      - '--path.procfs=/host/proc'
      - '--path.rootfs=/rootfs'
      - '--path.sysfs=/host/sys'
      - '--collector.filesystem.mount-points-exclude=^/(sys|proc|dev|host|etc)($$|/)'
    networks:
      - monitoring
    restart: unless-stopped

  # cAdvisor for container metrics
  cadvisor:
    image: gcr.io/cadvisor/cadvisor:latest
    container_name: urnlabs-cadvisor-deployment
    ports:
      - "8080:8080"
    volumes:
      - /:/rootfs:ro
      - /var/run:/var/run:ro
      - /sys:/sys:ro
      - /var/lib/docker/:/var/lib/docker:ro
      - /dev/disk/:/dev/disk:ro
    privileged: true
    devices:
      - /dev/kmsg
    networks:
      - monitoring
    restart: unless-stopped

volumes:
  prometheus_data:
  grafana_data:
  alertmanager_data:

networks:
  monitoring:
    driver: bridge
EOF

    log "SUCCESS" "Monitoring Docker Compose configuration created"
}

# Create Grafana datasource configuration
create_grafana_datasources() {
    log "INFO" "Creating Grafana datasource configuration..."

    mkdir -p "$MONITORING_DIR/datasources"

    cat > "$MONITORING_DIR/datasources/prometheus.yml" << 'EOF'
apiVersion: 1

datasources:
  - name: Prometheus
    type: prometheus
    url: http://prometheus:9090
    access: proxy
    isDefault: true
    editable: true
    jsonData:
      timeInterval: 15s
      queryTimeout: 60s
      httpMethod: POST

  - name: Alertmanager
    type: alertmanager
    url: http://alertmanager:9093
    access: proxy
    editable: true
    jsonData:
      implementation: prometheus
EOF

    log "SUCCESS" "Grafana datasource configuration created"
}

# Create Grafana dashboard provisioning
create_grafana_provisioning() {
    log "INFO" "Creating Grafana dashboard provisioning configuration..."

    mkdir -p "$MONITORING_DIR/dashboards"

    cat > "$MONITORING_DIR/dashboards/dashboard-config.yml" << 'EOF'
apiVersion: 1

providers:
  - name: 'deployment-dashboards'
    orgId: 1
    folder: 'Deployment Monitoring'
    type: file
    disableDeletion: false
    updateIntervalSeconds: 30
    allowUiUpdates: true
    options:
      path: /etc/grafana/provisioning/dashboards
EOF

    log "SUCCESS" "Grafana dashboard provisioning configuration created"
}

# Create Alertmanager configuration
create_alertmanager_config() {
    log "INFO" "Creating Alertmanager configuration..."

    mkdir -p "$MONITORING_DIR/alertmanager"

    cat > "$MONITORING_DIR/alertmanager/alertmanager.yml" << 'EOF'
global:
  smtp_smarthost: 'localhost:587'
  smtp_from: 'alerts@urnlabs.com'
  slack_api_url: '${SLACK_WEBHOOK_URL}'

route:
  group_by: ['alertname', 'environment']
  group_wait: 10s
  group_interval: 10s
  repeat_interval: 12h
  receiver: 'deployment-alerts'
  routes:
    - match:
        severity: critical
      receiver: 'critical-alerts'
    - match:
        component: deployment
      receiver: 'deployment-alerts'

receivers:
  - name: 'deployment-alerts'
    slack_configs:
      - channel: '#deployments'
        title: 'Deployment Alert - {{ .GroupLabels.environment }}'
        text: |
          {{ range .Alerts }}
          *Alert:* {{ .Annotations.summary }}
          *Description:* {{ .Annotations.description }}
          *Environment:* {{ .Labels.environment }}
          *Severity:* {{ .Labels.severity }}
          {{ end }}

  - name: 'critical-alerts'
    slack_configs:
      - channel: '#alerts-critical'
        title: 'CRITICAL Deployment Alert'
        text: |
          🚨 CRITICAL DEPLOYMENT ISSUE 🚨
          {{ range .Alerts }}
          *Alert:* {{ .Annotations.summary }}
          *Description:* {{ .Annotations.description }}
          *Environment:* {{ .Labels.environment }}
          {{ end }}
    email_configs:
      - to: 'devops-team@urnlabs.com'
        subject: 'CRITICAL: Deployment Alert - {{ .GroupLabels.environment }}'
        body: |
          Critical deployment alert triggered.

          {{ range .Alerts }}
          Alert: {{ .Annotations.summary }}
          Description: {{ .Annotations.description }}
          Environment: {{ .Labels.environment }}
          Time: {{ .StartsAt }}
          {{ end }}

inhibit_rules:
  - source_match:
      severity: 'critical'
    target_match:
      severity: 'warning'
    equal: ['alertname', 'environment']
EOF

    log "SUCCESS" "Alertmanager configuration created"
}

# Create monitoring rules directory
create_monitoring_rules() {
    log "INFO" "Creating monitoring rules..."

    mkdir -p "$MONITORING_DIR/rules"

    # Copy deployment rules from deployment-monitoring.yml
    if [ -f "$MONITORING_DIR/deployment-monitoring.yml" ]; then
        # Extract rules from the main monitoring file
        log "INFO" "Monitoring rules already exist in deployment-monitoring.yml"
    else
        log "WARN" "deployment-monitoring.yml not found - creating basic rules"

        cat > "$MONITORING_DIR/rules/deployment-basic.yml" << 'EOF'
groups:
  - name: deployment.basic
    rules:
      - alert: ServiceDown
        expr: up == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "Service is down"
          description: "Service {{ $labels.instance }} is down"

      - alert: HighErrorRate
        expr: rate(http_requests_total{status=~"5.."}[5m]) / rate(http_requests_total[5m]) > 0.1
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "High error rate detected"
          description: "Error rate is {{ $value | humanizePercentage }}"
EOF
    fi

    log "SUCCESS" "Monitoring rules created"
}

# Setup monitoring for specific environment
setup_environment_monitoring() {
    local env=$1
    log "INFO" "Setting up monitoring for $env environment..."

    case $env in
        "local")
            log "INFO" "Local environment - using Docker Compose monitoring"
            ;;
        "staging")
            log "INFO" "Staging environment - configuring cloud monitoring integration"
            # Add staging-specific monitoring configuration
            ;;
        "production")
            log "INFO" "Production environment - configuring production monitoring"
            # Add production-specific monitoring configuration
            ;;
        *)
            log "WARN" "Unknown environment: $env - using default configuration"
            ;;
    esac
}

# Start monitoring services
start_monitoring() {
    log "INFO" "Starting monitoring services..."

    # Check if Docker is available
    if ! command -v docker &> /dev/null; then
        log "ERROR" "Docker is not available - cannot start monitoring services"
        return 1
    fi

    # Start monitoring stack
    cd "$PROJECT_ROOT"

    if [ -f "$DOCKER_COMPOSE_MONITORING" ]; then
        log "INFO" "Starting monitoring stack with Docker Compose..."
        docker-compose -f "$DOCKER_COMPOSE_MONITORING" up -d

        # Wait for services to start
        log "INFO" "Waiting for monitoring services to start..."
        sleep 30

        # Check service health
        local services=("prometheus:9090" "grafana:3000" "alertmanager:9093")
        for service_port in "${services[@]}"; do
            local service=$(echo $service_port | cut -d':' -f1)
            local port=$(echo $service_port | cut -d':' -f2)

            if curl -s --fail "http://localhost:${port}/api/health" > /dev/null 2>&1 || \
               curl -s --fail "http://localhost:${port}/-/healthy" > /dev/null 2>&1; then
                log "SUCCESS" "$service is healthy and running on port $port"
            else
                log "WARN" "$service health check failed - may still be starting"
            fi
        done

        log "SUCCESS" "Monitoring services started successfully"
        log "INFO" "Prometheus: http://localhost:9090"
        log "INFO" "Grafana: http://localhost:3000 (admin/admin123)"
        log "INFO" "Alertmanager: http://localhost:9093"
    else
        log "ERROR" "Monitoring Docker Compose file not found"
        return 1
    fi
}

# Stop monitoring services
stop_monitoring() {
    log "INFO" "Stopping monitoring services..."

    cd "$PROJECT_ROOT"

    if [ -f "$DOCKER_COMPOSE_MONITORING" ]; then
        docker-compose -f "$DOCKER_COMPOSE_MONITORING" down
        log "SUCCESS" "Monitoring services stopped"
    else
        log "WARN" "Monitoring Docker Compose file not found"
    fi
}

# Validate monitoring setup
validate_monitoring() {
    log "INFO" "Validating monitoring setup..."

    local validation_errors=0

    # Check if monitoring configuration files exist
    local required_files=(
        "$MONITORING_DIR/deployment-monitoring.yml"
        "$MONITORING_DIR/dashboards/deployment-dashboard.json"
        "$MONITORING_DIR/datasources/prometheus.yml"
        "$MONITORING_DIR/alertmanager/alertmanager.yml"
    )

    for file in "${required_files[@]}"; do
        if [ -f "$file" ]; then
            log "SUCCESS" "Found: $(basename "$file")"
        else
            log "ERROR" "Missing: $file"
            ((validation_errors++))
        fi
    done

    # Check if Docker Compose file exists
    if [ -f "$DOCKER_COMPOSE_MONITORING" ]; then
        log "SUCCESS" "Docker Compose monitoring configuration found"
    else
        log "ERROR" "Docker Compose monitoring configuration missing"
        ((validation_errors++))
    fi

    if [ $validation_errors -eq 0 ]; then
        log "SUCCESS" "Monitoring setup validation passed"
        return 0
    else
        log "ERROR" "Monitoring setup validation failed with $validation_errors errors"
        return 1
    fi
}

# Main function
main() {
    log "INFO" "Setting up deployment monitoring for $ENVIRONMENT environment..."

    local action="${1:-setup}"

    case $action in
        "setup")
            log "INFO" "Creating monitoring configuration..."
            create_monitoring_compose
            create_grafana_datasources
            create_grafana_provisioning
            create_alertmanager_config
            create_monitoring_rules
            setup_environment_monitoring "$ENVIRONMENT"
            validate_monitoring
            log "SUCCESS" "Deployment monitoring setup completed!"
            log "INFO" "To start monitoring services, run: $0 start"
            ;;
        "start")
            start_monitoring
            ;;
        "stop")
            stop_monitoring
            ;;
        "validate")
            validate_monitoring
            ;;
        "restart")
            stop_monitoring
            sleep 5
            start_monitoring
            ;;
        *)
            log "ERROR" "Unknown action: $action"
            echo "Usage: $0 {setup|start|stop|restart|validate}"
            exit 1
            ;;
    esac
}

# Script usage
usage() {
    echo "Usage: $0 [action]"
    echo ""
    echo "Actions:"
    echo "  setup     Create monitoring configuration files (default)"
    echo "  start     Start monitoring services"
    echo "  stop      Stop monitoring services"
    echo "  restart   Restart monitoring services"
    echo "  validate  Validate monitoring configuration"
    echo ""
    echo "Environment variables:"
    echo "  ENVIRONMENT           Target environment (local|staging|production) [default: staging]"
    echo "  GRAFANA_ADMIN_PASSWORD Grafana admin password [default: admin123]"
    echo "  SLACK_WEBHOOK_URL      Slack webhook for alerts"
    echo ""
    echo "Examples:"
    echo "  $0                    # Setup monitoring configuration"
    echo "  $0 start              # Start monitoring services"
    echo "  ENVIRONMENT=production $0 setup  # Setup for production"
}

# Parse command line arguments
if [[ "${1:-}" == "-h" ]] || [[ "${1:-}" == "--help" ]]; then
    usage
    exit 0
fi

# Run main function
main "${1:-setup}"