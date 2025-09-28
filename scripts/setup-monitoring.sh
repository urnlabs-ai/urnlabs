#!/bin/bash

# Monitoring Integration Setup Script
# Sets up comprehensive monitoring for all AI platform services

set -euo pipefail

# Configuration
ENVIRONMENT="${1:-production}"
MONITORING_STACK="${2:-prometheus}"
ENABLE_ALERTS="${3:-true}"

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

# Create monitoring configuration directories
setup_monitoring_dirs() {
    log_info "Setting up monitoring directories..."

    mkdir -p monitoring/{prometheus,grafana,alertmanager}
    mkdir -p monitoring/configs/{prometheus,grafana,alertmanager}
    mkdir -p monitoring/dashboards
    mkdir -p monitoring/rules
    mkdir -p monitoring/data

    log_success "Monitoring directories created"
}

# Generate Prometheus configuration
generate_prometheus_config() {
    log_info "Generating Prometheus configuration..."

    cat > monitoring/configs/prometheus/prometheus.yml << EOF
global:
  scrape_interval: 15s
  evaluation_interval: 15s
  external_labels:
    environment: '${ENVIRONMENT}'
    region: 'us-east-1'

rule_files:
  - "/etc/prometheus/rules/*.yml"

alerting:
  alertmanagers:
    - static_configs:
        - targets:
          - alertmanager:9093

scrape_configs:
  # Prometheus itself
  - job_name: 'prometheus'
    static_configs:
      - targets: ['localhost:9090']

  # Node exporter for system metrics
  - job_name: 'node-exporter'
    static_configs:
      - targets: ['node-exporter:9100']

  # AI Platform Services
  - job_name: 'api-service'
    static_configs:
      - targets: ['api:7001']
    metrics_path: '/metrics'
    scrape_interval: 10s
    scrape_timeout: 5s

  - job_name: 'agents-service'
    static_configs:
      - targets: ['agents:7002']
    metrics_path: '/metrics'
    scrape_interval: 10s

  - job_name: 'gateway-service'
    static_configs:
      - targets: ['gateway:7000']
    metrics_path: '/metrics'
    scrape_interval: 5s

  - job_name: 'bridge-service'
    static_configs:
      - targets: ['bridge:7003']
    metrics_path: '/metrics'
    scrape_interval: 10s

  - job_name: 'dashboard-service'
    static_configs:
      - targets: ['dashboard:7004']
    metrics_path: '/metrics'
    scrape_interval: 15s

  # Database monitoring
  - job_name: 'postgres-exporter'
    static_configs:
      - targets: ['postgres-exporter:9187']

  # Redis monitoring
  - job_name: 'redis-exporter'
    static_configs:
      - targets: ['redis-exporter:9121']

  # Docker monitoring
  - job_name: 'cadvisor'
    static_configs:
      - targets: ['cadvisor:8080']

  # Nginx monitoring
  - job_name: 'nginx-exporter'
    static_configs:
      - targets: ['nginx-exporter:9113']
EOF

    log_success "Prometheus configuration generated"
}

# Generate alerting rules
generate_alert_rules() {
    log_info "Generating alerting rules..."

    cat > monitoring/rules/platform-alerts.yml << EOF
groups:
  - name: platform.rules
    rules:
      # Service availability alerts
      - alert: ServiceDown
        expr: up == 0
        for: 30s
        labels:
          severity: critical
        annotations:
          summary: "Service {{ \$labels.job }} is down"
          description: "Service {{ \$labels.job }} has been down for more than 30 seconds"

      # High error rate alerts
      - alert: HighErrorRate
        expr: rate(http_requests_total{status=~"5.."}[5m]) > 0.1
        for: 2m
        labels:
          severity: warning
        annotations:
          summary: "High error rate on {{ \$labels.job }}"
          description: "Error rate is {{ \$value }} per second on {{ \$labels.job }}"

      # High response time alerts
      - alert: HighResponseTime
        expr: histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m])) > 0.5
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High response time on {{ \$labels.job }}"
          description: "95th percentile response time is {{ \$value }}s on {{ \$labels.job }}"

      # Memory usage alerts
      - alert: HighMemoryUsage
        expr: (container_memory_usage_bytes / container_spec_memory_limit_bytes) > 0.8
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High memory usage on {{ \$labels.name }}"
          description: "Memory usage is {{ \$value | humanizePercentage }} on {{ \$labels.name }}"

      # CPU usage alerts
      - alert: HighCPUUsage
        expr: rate(container_cpu_usage_seconds_total[5m]) > 0.8
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High CPU usage on {{ \$labels.name }}"
          description: "CPU usage is {{ \$value | humanizePercentage }} on {{ \$labels.name }}"

      # Database connection alerts
      - alert: DatabaseConnectionsHigh
        expr: pg_stat_database_numbackends > 50
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High database connections"
          description: "Database has {{ \$value }} active connections"

      # Disk space alerts
      - alert: DiskSpaceLow
        expr: (node_filesystem_avail_bytes / node_filesystem_size_bytes) < 0.1
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "Low disk space on {{ \$labels.instance }}"
          description: "Disk space is {{ \$value | humanizePercentage }} full on {{ \$labels.instance }}"

  - name: deployment.rules
    rules:
      # Deployment success rate
      - alert: DeploymentFailure
        expr: increase(deployment_failures_total[1h]) > 0
        for: 0s
        labels:
          severity: critical
        annotations:
          summary: "Deployment failure detected"
          description: "{{ \$value }} deployment failures in the last hour"

      # Feature flag alerts
      - alert: FeatureFlagEmergencyDisabled
        expr: increase(feature_flag_emergency_disabled_total[5m]) > 0
        for: 0s
        labels:
          severity: warning
        annotations:
          summary: "Feature flag emergency disabled"
          description: "Feature flag {{ \$labels.flag_id }} was emergency disabled"

      # Performance regression alerts
      - alert: PerformanceRegression
        expr: increase(performance_regression_detected_total[10m]) > 0
        for: 0s
        labels:
          severity: warning
        annotations:
          summary: "Performance regression detected"
          description: "Performance regression detected on {{ \$labels.service }}"
EOF

    log_success "Alert rules generated"
}

# Generate Alertmanager configuration
generate_alertmanager_config() {
    log_info "Generating Alertmanager configuration..."

    cat > monitoring/configs/alertmanager/alertmanager.yml << EOF
global:
  smtp_smarthost: 'localhost:587'
  smtp_from: 'alerts@urnlabs.ai'

route:
  group_by: ['alertname', 'severity']
  group_wait: 10s
  group_interval: 10s
  repeat_interval: 1h
  receiver: 'web.hook'
  routes:
    - match:
        severity: critical
      receiver: 'critical-alerts'
    - match:
        severity: warning
      receiver: 'warning-alerts'

receivers:
  - name: 'web.hook'
    webhook_configs:
      - url: 'http://localhost:5001/alerts'

  - name: 'critical-alerts'
    slack_configs:
      - api_url: '${SLACK_WEBHOOK_URL}'
        channel: '#alerts-critical'
        title: 'Critical Alert - {{ .GroupLabels.alertname }}'
        text: '{{ range .Alerts }}{{ .Annotations.summary }}{{ end }}'
        send_resolved: true
    webhook_configs:
      - url: 'http://localhost:5001/alerts/critical'

  - name: 'warning-alerts'
    slack_configs:
      - api_url: '${SLACK_WEBHOOK_URL}'
        channel: '#alerts-warning'
        title: 'Warning Alert - {{ .GroupLabels.alertname }}'
        text: '{{ range .Alerts }}{{ .Annotations.summary }}{{ end }}'
        send_resolved: true

inhibit_rules:
  - source_match:
      severity: 'critical'
    target_match:
      severity: 'warning'
    equal: ['alertname', 'dev', 'instance']
EOF

    log_success "Alertmanager configuration generated"
}

# Generate Grafana dashboards
generate_grafana_dashboards() {
    log_info "Generating Grafana dashboards..."

    # Platform Overview Dashboard
    cat > monitoring/dashboards/platform-overview.json << EOF
{
  "dashboard": {
    "id": null,
    "title": "AI Platform Overview",
    "tags": ["platform", "overview"],
    "timezone": "browser",
    "panels": [
      {
        "id": 1,
        "title": "Service Status",
        "type": "stat",
        "targets": [
          {
            "expr": "up",
            "legendFormat": "{{ job }}"
          }
        ],
        "fieldConfig": {
          "defaults": {
            "color": {
              "mode": "thresholds"
            },
            "thresholds": {
              "steps": [
                {
                  "color": "red",
                  "value": 0
                },
                {
                  "color": "green",
                  "value": 1
                }
              ]
            }
          }
        },
        "gridPos": {
          "h": 8,
          "w": 12,
          "x": 0,
          "y": 0
        }
      },
      {
        "id": 2,
        "title": "Request Rate",
        "type": "graph",
        "targets": [
          {
            "expr": "rate(http_requests_total[5m])",
            "legendFormat": "{{ job }}"
          }
        ],
        "gridPos": {
          "h": 8,
          "w": 12,
          "x": 12,
          "y": 0
        }
      },
      {
        "id": 3,
        "title": "Response Time (95th percentile)",
        "type": "graph",
        "targets": [
          {
            "expr": "histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))",
            "legendFormat": "{{ job }}"
          }
        ],
        "gridPos": {
          "h": 8,
          "w": 24,
          "x": 0,
          "y": 8
        }
      },
      {
        "id": 4,
        "title": "Error Rate",
        "type": "graph",
        "targets": [
          {
            "expr": "rate(http_requests_total{status=~\"5..\"}[5m])",
            "legendFormat": "{{ job }}"
          }
        ],
        "gridPos": {
          "h": 8,
          "w": 12,
          "x": 0,
          "y": 16
        }
      },
      {
        "id": 5,
        "title": "Memory Usage",
        "type": "graph",
        "targets": [
          {
            "expr": "container_memory_usage_bytes / 1024 / 1024",
            "legendFormat": "{{ name }}"
          }
        ],
        "gridPos": {
          "h": 8,
          "w": 12,
          "x": 12,
          "y": 16
        }
      }
    ],
    "time": {
      "from": "now-1h",
      "to": "now"
    },
    "refresh": "30s"
  }
}
EOF

    # Performance Dashboard
    cat > monitoring/dashboards/performance-monitoring.json << EOF
{
  "dashboard": {
    "id": null,
    "title": "Performance Monitoring",
    "tags": ["performance", "sla"],
    "timezone": "browser",
    "panels": [
      {
        "id": 1,
        "title": "SLA Compliance",
        "type": "stat",
        "targets": [
          {
            "expr": "avg(rate(http_requests_total{status!~\"5..\"}[5m])) / avg(rate(http_requests_total[5m]))",
            "legendFormat": "Success Rate"
          }
        ],
        "fieldConfig": {
          "defaults": {
            "unit": "percentunit",
            "thresholds": {
              "steps": [
                {
                  "color": "red",
                  "value": 0
                },
                {
                  "color": "yellow",
                  "value": 0.95
                },
                {
                  "color": "green",
                  "value": 0.99
                }
              ]
            }
          }
        },
        "gridPos": {
          "h": 8,
          "w": 6,
          "x": 0,
          "y": 0
        }
      },
      {
        "id": 2,
        "title": "API Response Times",
        "type": "graph",
        "targets": [
          {
            "expr": "histogram_quantile(0.50, rate(http_request_duration_seconds_bucket[5m]))",
            "legendFormat": "50th percentile"
          },
          {
            "expr": "histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))",
            "legendFormat": "95th percentile"
          },
          {
            "expr": "histogram_quantile(0.99, rate(http_request_duration_seconds_bucket[5m]))",
            "legendFormat": "99th percentile"
          }
        ],
        "gridPos": {
          "h": 8,
          "w": 18,
          "x": 6,
          "y": 0
        }
      }
    ],
    "time": {
      "from": "now-6h",
      "to": "now"
    },
    "refresh": "10s"
  }
}
EOF

    log_success "Grafana dashboards generated"
}

# Create Docker Compose monitoring stack
create_monitoring_compose() {
    log_info "Creating monitoring Docker Compose configuration..."

    cat > docker-compose.monitoring.yml << EOF
version: '3.8'

services:
  prometheus:
    image: prom/prometheus:latest
    container_name: prometheus-${ENVIRONMENT}
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.path=/prometheus'
      - '--web.console.libraries=/etc/prometheus/console_libraries'
      - '--web.console.templates=/etc/prometheus/consoles'
      - '--web.enable-lifecycle'
      - '--web.enable-admin-api'
    ports:
      - "9090:9090"
    volumes:
      - ./monitoring/configs/prometheus:/etc/prometheus
      - ./monitoring/rules:/etc/prometheus/rules
      - ./monitoring/data/prometheus:/prometheus
    networks:
      - monitoring
    restart: unless-stopped

  grafana:
    image: grafana/grafana:latest
    container_name: grafana-${ENVIRONMENT}
    ports:
      - "3000:3000"
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=\${GRAFANA_ADMIN_PASSWORD:-admin}
      - GF_USERS_ALLOW_SIGN_UP=false
      - GF_INSTALL_PLUGINS=grafana-piechart-panel
    volumes:
      - ./monitoring/data/grafana:/var/lib/grafana
      - ./monitoring/dashboards:/etc/grafana/provisioning/dashboards
      - ./monitoring/configs/grafana:/etc/grafana/provisioning
    networks:
      - monitoring
    restart: unless-stopped

  alertmanager:
    image: prom/alertmanager:latest
    container_name: alertmanager-${ENVIRONMENT}
    command:
      - '--config.file=/etc/alertmanager/alertmanager.yml'
      - '--storage.path=/alertmanager'
      - '--web.external-url=http://localhost:9093'
    ports:
      - "9093:9093"
    volumes:
      - ./monitoring/configs/alertmanager:/etc/alertmanager
      - ./monitoring/data/alertmanager:/alertmanager
    networks:
      - monitoring
    restart: unless-stopped

  node-exporter:
    image: prom/node-exporter:latest
    container_name: node-exporter-${ENVIRONMENT}
    command:
      - '--path.rootfs=/host'
    ports:
      - "9100:9100"
    volumes:
      - '/:/host:ro,rslave'
    networks:
      - monitoring
    restart: unless-stopped

  cadvisor:
    image: gcr.io/cadvisor/cadvisor:latest
    container_name: cadvisor-${ENVIRONMENT}
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

  postgres-exporter:
    image: prometheuscommunity/postgres-exporter:latest
    container_name: postgres-exporter-${ENVIRONMENT}
    environment:
      - DATA_SOURCE_NAME=postgresql://\${DB_USER}:\${DB_PASSWORD}@postgres:5432/\${DB_NAME}?sslmode=disable
    ports:
      - "9187:9187"
    networks:
      - monitoring
    restart: unless-stopped

  redis-exporter:
    image: oliver006/redis_exporter:latest
    container_name: redis-exporter-${ENVIRONMENT}
    environment:
      - REDIS_ADDR=redis://redis:6379
    ports:
      - "9121:9121"
    networks:
      - monitoring
    restart: unless-stopped

networks:
  monitoring:
    driver: bridge
    external: false

volumes:
  prometheus-data:
  grafana-data:
  alertmanager-data:
EOF

    log_success "Monitoring Docker Compose configuration created"
}

# Setup monitoring for specific environment
setup_environment_monitoring() {
    local env="$1"

    log_info "Setting up monitoring for environment: $env"

    # Copy environment-specific configurations
    if [[ -f "monitoring/configs/prometheus/prometheus.${env}.yml" ]]; then
        cp "monitoring/configs/prometheus/prometheus.${env}.yml" monitoring/configs/prometheus/prometheus.yml
    fi

    if [[ -f "monitoring/configs/alertmanager/alertmanager.${env}.yml" ]]; then
        cp "monitoring/configs/alertmanager/alertmanager.${env}.yml" monitoring/configs/alertmanager/alertmanager.yml
    fi

    log_success "Environment-specific monitoring configuration applied"
}

# Create monitoring health check script
create_health_check() {
    log_info "Creating monitoring health check script..."

    cat > scripts/check-monitoring-health.sh << 'EOF'
#!/bin/bash

# Monitoring Health Check Script
set -euo pipefail

ENVIRONMENT="${1:-production}"

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() { echo -e "[INFO] $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Check service health
check_service() {
    local service="$1"
    local port="$2"
    local path="${3:-/}"

    if curl -f -s "http://localhost:${port}${path}" > /dev/null; then
        log_success "$service is healthy"
        return 0
    else
        log_error "$service is unhealthy"
        return 1
    fi
}

# Main health check
main() {
    log_info "Checking monitoring stack health for environment: $ENVIRONMENT"

    local failed=0

    # Check core monitoring services
    check_service "Prometheus" "9090" "/api/v1/query?query=up" || ((failed++))
    check_service "Grafana" "3000" "/api/health" || ((failed++))
    check_service "Alertmanager" "9093" "/api/v1/status" || ((failed++))
    check_service "Node Exporter" "9100" "/metrics" || ((failed++))
    check_service "cAdvisor" "8080" "/metrics" || ((failed++))

    # Check exporters
    check_service "Postgres Exporter" "9187" "/metrics" || ((failed++))
    check_service "Redis Exporter" "9121" "/metrics" || ((failed++))

    if [[ $failed -eq 0 ]]; then
        log_success "All monitoring services are healthy"
        exit 0
    else
        log_error "$failed monitoring services are unhealthy"
        exit 1
    fi
}

main "$@"
EOF

    chmod +x scripts/check-monitoring-health.sh

    log_success "Monitoring health check script created"
}

# Main function
main() {
    log_info "Setting up monitoring integration for AI Platform"
    log_info "Environment: $ENVIRONMENT"
    log_info "Monitoring Stack: $MONITORING_STACK"
    log_info "Enable Alerts: $ENABLE_ALERTS"

    # Setup directories
    setup_monitoring_dirs

    # Generate configurations
    generate_prometheus_config
    generate_alert_rules
    generate_alertmanager_config
    generate_grafana_dashboards

    # Create Docker Compose
    create_monitoring_compose

    # Setup environment-specific monitoring
    setup_environment_monitoring "$ENVIRONMENT"

    # Create health check
    create_health_check

    log_success "Monitoring integration setup completed!"
    log_info "To start monitoring stack, run:"
    log_info "  docker-compose -f docker-compose.monitoring.yml up -d"
    log_info ""
    log_info "Access monitoring services at:"
    log_info "  Prometheus: http://localhost:9090"
    log_info "  Grafana: http://localhost:3000"
    log_info "  Alertmanager: http://localhost:9093"
}

# Execute main function
main "$@"