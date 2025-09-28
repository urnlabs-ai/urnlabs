#!/bin/bash

# Performance Testing with Baseline Comparison
# Integrates K6 performance tests with baseline comparison and CI/CD pipeline

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PERFORMANCE_DIR="$PROJECT_ROOT/performance"
REPORTS_DIR="$PERFORMANCE_DIR/reports"
BASELINES_DIR="$PERFORMANCE_DIR/baselines"

# Environment variables with defaults
ENVIRONMENT="${ENVIRONMENT:-staging}"
BRANCH="${BRANCH:-main}"
BASE_URL="${BASE_URL:-http://localhost:7001}"
BASELINE_MODE="${BASELINE_MODE:-compare}"
BASELINE_THRESHOLD="${BASELINE_THRESHOLD:-0.2}"
CI_MODE="${CI_MODE:-false}"
BLOCK_ON_REGRESSION="${BLOCK_ON_REGRESSION:-true}"
SLACK_WEBHOOK_URL="${SLACK_WEBHOOK_URL:-}"
PERFORMANCE_ALERT_WEBHOOK="${PERFORMANCE_ALERT_WEBHOOK:-}"

# Colors for output
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

# Function to check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."

    # Check if k6 is installed
    if ! command -v k6 &> /dev/null; then
        log_error "k6 is not installed. Please install k6 to run performance tests."
        exit 1
    fi

    # Check if Node.js is installed
    if ! command -v node &> /dev/null; then
        log_error "Node.js is not installed. Please install Node.js to run baseline comparison."
        exit 1
    fi

    # Create directories if they don't exist
    mkdir -p "$REPORTS_DIR"
    mkdir -p "$BASELINES_DIR"

    log_success "Prerequisites check passed"
}

# Function to start services if needed
start_services() {
    if [[ "$CI_MODE" == "false" ]]; then
        log_info "Checking if services are running..."

        # Check if services are available
        if ! curl -f -s "$BASE_URL/health" > /dev/null; then
            log_warning "Services not available at $BASE_URL"
            log_info "Starting services with Docker Compose..."

            cd "$PROJECT_ROOT"
            if [[ -f "docker-compose-local.yml" ]]; then
                docker-compose -f docker-compose-local.yml up -d
                log_info "Waiting 30 seconds for services to be ready..."
                sleep 30
            else
                log_error "Docker Compose file not found. Please start services manually."
                exit 1
            fi
        fi
    fi

    # Verify services are healthy
    log_info "Verifying service health..."

    max_attempts=30
    attempt=0

    while [[ $attempt -lt $max_attempts ]]; do
        if curl -f -s "$BASE_URL/health" > /dev/null; then
            log_success "Services are healthy and ready"
            break
        else
            log_info "Waiting for services to become healthy... (attempt $((attempt+1))/$max_attempts)"
            sleep 10
            attempt=$((attempt+1))
        fi
    done

    if [[ $attempt -eq $max_attempts ]]; then
        log_error "Services failed to become healthy after $((max_attempts*10)) seconds"
        exit 1
    fi
}

# Function to load existing baseline
load_baseline() {
    log_info "Loading baseline for comparison..."

    local baseline_file="$BASELINES_DIR/latest-${BRANCH}-${ENVIRONMENT}.json"

    if [[ -f "$baseline_file" ]]; then
        log_success "Baseline found: $baseline_file"
        return 0
    else
        log_warning "No baseline found for $BRANCH/$ENVIRONMENT"
        if [[ "$BASELINE_MODE" == "compare" ]]; then
            log_info "Switching to baseline creation mode"
            BASELINE_MODE="create"
        fi
        return 1
    fi
}

# Function to run K6 performance tests
run_k6_tests() {
    log_info "Running K6 performance tests..."

    cd "$PERFORMANCE_DIR"

    # Prepare K6 environment variables
    export ENVIRONMENT="$ENVIRONMENT"
    export BRANCH="$BRANCH"
    export BASE_URL="$BASE_URL"
    export BASELINE_MODE="$BASELINE_MODE"
    export BASELINE_THRESHOLD="$BASELINE_THRESHOLD"

    # Run K6 with baseline comparison
    local k6_exit_code=0
    local test_output

    log_info "Executing K6 test with configuration:"
    log_info "  Environment: $ENVIRONMENT"
    log_info "  Branch: $BRANCH"
    log_info "  Base URL: $BASE_URL"
    log_info "  Baseline Mode: $BASELINE_MODE"
    log_info "  Threshold: $BASELINE_THRESHOLD"

    if test_output=$(k6 run \
        --out json="$REPORTS_DIR/performance-results-$(date +%Y%m%d-%H%M%S).json" \
        --summary-export="$REPORTS_DIR/performance-summary-$(date +%Y%m%d-%H%M%S).json" \
        k6-baseline-comparison.js 2>&1); then
        log_success "K6 performance tests completed successfully"
    else
        k6_exit_code=$?
        log_error "K6 performance tests failed with exit code: $k6_exit_code"
    fi

    # Output K6 results
    echo "$test_output"

    return $k6_exit_code
}

# Function to process results with baseline manager
process_results() {
    log_info "Processing results with baseline manager..."

    cd "$PERFORMANCE_DIR"

    # Find the latest results file
    local latest_results=$(find "$REPORTS_DIR" -name "performance-results-*.json" -type f -printf '%T@ %p\n' | sort -k1,1nr | head -1 | cut -d' ' -f2-)

    if [[ -z "$latest_results" ]]; then
        log_error "No performance results file found"
        return 1
    fi

    log_info "Processing results file: $latest_results"

    # Create a Node.js script to process results
    cat > process-results.js << 'EOF'
import fs from 'fs';
import { BaselineManager } from './baseline-manager.js';
import PerformanceMonitor from './performance-monitor.js';

const resultsFile = process.argv[2];
const environment = process.env.ENVIRONMENT || 'staging';
const branch = process.env.BRANCH || 'main';
const baselineMode = process.env.BASELINE_MODE || 'compare';

async function processResults() {
    try {
        console.log('📊 Processing performance results...');

        // Load results
        const results = JSON.parse(fs.readFileSync(resultsFile, 'utf8'));

        // Initialize managers
        const baselineManager = new BaselineManager();
        const monitor = new PerformanceMonitor();

        if (baselineMode === 'create') {
            // Create new baseline
            console.log('📋 Creating new baseline...');
            const baseline = baselineManager.saveBaseline(results, branch, environment);
            console.log('✅ Baseline created successfully');

            process.exit(0);
        } else if (baselineMode === 'compare') {
            // Compare with baseline
            console.log('🔍 Comparing with baseline...');

            const baseline = baselineManager.loadBaseline(branch, environment);
            if (!baseline) {
                console.log('⚠️ No baseline found for comparison');
                process.exit(0);
            }

            const comparison = baselineManager.compareWithBaseline(results, baseline);

            // Process through monitoring system
            const report = await monitor.processResults(results, environment, branch);

            // Generate comparison report
            const comparisonReport = baselineManager.generateReport(
                comparison,
                `./reports/baseline-comparison-${environment}-${branch}-${new Date().toISOString().split('T')[0]}.json`
            );

            // Check for regressions
            if (!comparison.summary.passed) {
                console.log('❌ Performance regressions detected!');
                console.log(`🔍 Regressions: ${comparison.summary.regressions.length}`);

                comparison.summary.regressions.forEach(regression => {
                    console.log(`   • ${regression.metric}: ${regression.change_percent}% worse`);
                });

                if (process.env.BLOCK_ON_REGRESSION === 'true') {
                    console.log('🚫 Blocking deployment due to performance regression');
                    process.exit(1);
                } else {
                    console.log('⚠️ Performance regression detected but not blocking deployment');
                }
            } else {
                console.log('✅ No performance regressions detected');

                if (comparison.summary.improvements.length > 0) {
                    console.log('🚀 Performance improvements detected:');
                    comparison.summary.improvements.forEach(improvement => {
                        console.log(`   • ${improvement.metric}: ${improvement.change_percent}% better`);
                    });
                }
            }

            // Output summary for CI/CD
            const status = monitor.getPerformanceStatus(report);
            console.log('📊 Performance Status:', JSON.stringify(status, null, 2));

            if (status.should_block_deployment) {
                process.exit(1);
            }
        }

    } catch (error) {
        console.error('❌ Error processing results:', error.message);
        process.exit(1);
    }
}

processResults();
EOF

    # Run the processing script
    local process_exit_code=0
    if node process-results.js "$latest_results"; then
        log_success "Results processed successfully"
    else
        process_exit_code=$?
        log_error "Failed to process results"
    fi

    # Cleanup temporary script
    rm -f process-results.js

    return $process_exit_code
}

# Function to generate dashboard data
generate_dashboard() {
    log_info "Generating performance dashboard data..."

    cd "$PERFORMANCE_DIR"

    # Create dashboard generation script
    cat > generate-dashboard.js << 'EOF'
import fs from 'fs';
import PerformanceMonitor from './performance-monitor.js';

const environment = process.env.ENVIRONMENT || 'staging';
const branch = process.env.BRANCH || 'main';

async function generateDashboard() {
    try {
        const monitor = new PerformanceMonitor();
        const dashboardData = monitor.generateDashboardData(environment, branch);

        const dashboardFile = `./reports/dashboard-${environment}-${branch}.json`;
        fs.writeFileSync(dashboardFile, JSON.stringify(dashboardData, null, 2));

        console.log(`📊 Dashboard data generated: ${dashboardFile}`);

        // Generate simple HTML dashboard
        const html = `
<!DOCTYPE html>
<html>
<head>
    <title>Performance Dashboard - ${environment}/${branch}</title>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .metric { display: inline-block; margin: 10px; padding: 15px; border: 1px solid #ddd; border-radius: 5px; }
        .chart-container { width: 48%; display: inline-block; margin: 1%; }
        .header { background: #f5f5f5; padding: 20px; margin-bottom: 20px; border-radius: 5px; }
    </style>
</head>
<body>
    <div class="header">
        <h1>Performance Dashboard</h1>
        <p><strong>Environment:</strong> ${environment} | <strong>Branch:</strong> ${branch}</p>
        <p><strong>Last Updated:</strong> ${dashboardData.last_updated}</p>
    </div>

    <div>
        <div class="metric">
            <h3>Avg P95 Latency</h3>
            <p>${dashboardData.summary.avg_p95_latency.toFixed(2)}ms</p>
        </div>
        <div class="metric">
            <h3>Avg P99 Latency</h3>
            <p>${dashboardData.summary.avg_p99_latency.toFixed(2)}ms</p>
        </div>
        <div class="metric">
            <h3>Avg Error Rate</h3>
            <p>${(dashboardData.summary.avg_error_rate * 100).toFixed(3)}%</p>
        </div>
        <div class="metric">
            <h3>Total Alerts</h3>
            <p>${dashboardData.summary.total_alerts}</p>
        </div>
    </div>

    <div class="chart-container">
        <canvas id="latencyChart"></canvas>
    </div>
    <div class="chart-container">
        <canvas id="errorChart"></canvas>
    </div>

    <script>
        const latencyData = ${JSON.stringify(dashboardData.trend_charts.latency_p95)};
        const errorData = ${JSON.stringify(dashboardData.trend_charts.error_rate)};

        // Latency Chart
        new Chart(document.getElementById('latencyChart'), {
            type: 'line',
            data: {
                labels: latencyData.map(d => new Date(d.timestamp).toLocaleDateString()),
                datasets: [{
                    label: 'P95 Latency (ms)',
                    data: latencyData.map(d => d.value),
                    borderColor: 'rgb(75, 192, 192)',
                    tension: 0.1
                }]
            },
            options: {
                responsive: true,
                plugins: { title: { display: true, text: 'Response Time Trend' } }
            }
        });

        // Error Rate Chart
        new Chart(document.getElementById('errorChart'), {
            type: 'line',
            data: {
                labels: errorData.map(d => new Date(d.timestamp).toLocaleDateString()),
                datasets: [{
                    label: 'Error Rate (%)',
                    data: errorData.map(d => d.value),
                    borderColor: 'rgb(255, 99, 132)',
                    tension: 0.1
                }]
            },
            options: {
                responsive: true,
                plugins: { title: { display: true, text: 'Error Rate Trend' } }
            }
        });
    </script>
</body>
</html>`;

        const htmlFile = `./reports/dashboard-${environment}-${branch}.html`;
        fs.writeFileSync(htmlFile, html);

        console.log(`📊 Dashboard HTML generated: ${htmlFile}`);
    } catch (error) {
        console.error('❌ Error generating dashboard:', error.message);
        process.exit(1);
    }
}

generateDashboard();
EOF

    # Generate dashboard
    if node generate-dashboard.js; then
        log_success "Dashboard generated successfully"
    else
        log_error "Failed to generate dashboard"
    fi

    # Cleanup
    rm -f generate-dashboard.js
}

# Function to send notifications
send_notifications() {
    local test_status=$1

    if [[ -n "$SLACK_WEBHOOK_URL" ]] && [[ "$CI_MODE" == "true" ]]; then
        log_info "Sending notification to Slack..."

        local emoji="✅"
        local color="good"
        local message="Performance tests passed"

        if [[ $test_status -ne 0 ]]; then
            emoji="❌"
            color="danger"
            message="Performance tests failed"
        fi

        local payload=$(cat <<EOF
{
    "username": "Performance Tests",
    "icon_emoji": ":chart_with_upwards_trend:",
    "attachments": [{
        "color": "$color",
        "title": "$emoji Performance Test Results - $ENVIRONMENT/$BRANCH",
        "fields": [
            {
                "title": "Status",
                "value": "$message",
                "short": true
            },
            {
                "title": "Environment",
                "value": "$ENVIRONMENT",
                "short": true
            },
            {
                "title": "Branch",
                "value": "$BRANCH",
                "short": true
            },
            {
                "title": "Baseline Mode",
                "value": "$BASELINE_MODE",
                "short": true
            }
        ],
        "footer": "Performance Monitoring",
        "ts": $(date +%s)
    }]
}
EOF
)

        if curl -X POST -H 'Content-type: application/json' \
               --data "$payload" \
               "$SLACK_WEBHOOK_URL" > /dev/null 2>&1; then
            log_success "Slack notification sent"
        else
            log_warning "Failed to send Slack notification"
        fi
    fi
}

# Function to cleanup
cleanup() {
    log_info "Cleaning up..."

    if [[ "$CI_MODE" == "false" ]] && [[ -f "$PROJECT_ROOT/docker-compose-local.yml" ]]; then
        log_info "Stopping Docker Compose services..."
        cd "$PROJECT_ROOT"
        docker-compose -f docker-compose-local.yml down > /dev/null 2>&1 || true
    fi

    # Clean old reports (keep last 10)
    if [[ -d "$REPORTS_DIR" ]]; then
        find "$REPORTS_DIR" -name "performance-results-*.json" -type f | sort -r | tail -n +11 | xargs rm -f 2>/dev/null || true
        find "$REPORTS_DIR" -name "performance-summary-*.json" -type f | sort -r | tail -n +11 | xargs rm -f 2>/dev/null || true
    fi

    log_success "Cleanup completed"
}

# Main execution function
main() {
    log_info "Starting performance testing with baseline comparison"
    log_info "Configuration:"
    log_info "  Environment: $ENVIRONMENT"
    log_info "  Branch: $BRANCH"
    log_info "  Base URL: $BASE_URL"
    log_info "  Baseline Mode: $BASELINE_MODE"
    log_info "  CI Mode: $CI_MODE"
    log_info "  Block on Regression: $BLOCK_ON_REGRESSION"

    local exit_code=0

    # Setup trap for cleanup
    trap cleanup EXIT

    # Execute test pipeline
    check_prerequisites
    start_services
    load_baseline

    if run_k6_tests; then
        if process_results; then
            generate_dashboard
            log_success "Performance testing completed successfully"
        else
            exit_code=1
            log_error "Results processing failed"
        fi
    else
        exit_code=1
        log_error "K6 performance tests failed"
    fi

    # Send notifications
    send_notifications $exit_code

    if [[ $exit_code -eq 0 ]]; then
        log_success "✅ All performance tests passed!"
    else
        log_error "❌ Performance testing failed!"
        if [[ "$BLOCK_ON_REGRESSION" == "true" ]]; then
            log_error "🚫 Deployment should be blocked due to performance issues"
        fi
    fi

    exit $exit_code
}

# Run main function if script is executed directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi