# Performance Testing with Baseline Comparison

This directory contains a comprehensive performance testing system that integrates with the CI/CD pipeline to detect performance regressions and ensure consistent application performance.

## Overview

The performance testing system provides:

- **Baseline Collection & Storage**: Automatic collection and storage of performance baselines
- **Regression Detection**: Automated comparison against historical baselines with configurable thresholds
- **CI/CD Integration**: Performance gates that can block deployments on regressions
- **Real-time Monitoring**: Performance trend analysis and alerting
- **Dashboard**: Visual performance monitoring dashboard
- **Multi-environment Support**: Environment-specific baselines and thresholds

## Architecture

### Components

1. **BaselineManager** (`baseline-manager.js`)
   - Manages baseline data collection, storage, and comparison
   - Handles baseline lifecycle (creation, loading, comparison, cleanup)
   - Supports version control and environment-specific baselines

2. **K6 Performance Tests** (`k6-baseline-comparison.js`)
   - Enhanced K6 configuration with baseline comparison
   - Environment-specific test scenarios (smoke, load, stress)
   - Real-time regression detection during test execution

3. **Performance Monitor** (`performance-monitor.js`)
   - Monitors performance trends and detects issues
   - Generates alerts for performance degradation
   - Integrates with Slack, webhooks, and email notifications

4. **CI/CD Integration** (`run-performance-tests.sh`)
   - Orchestrates the entire performance testing workflow
   - Handles service startup, test execution, and result processing
   - Provides deployment gates based on performance results

## Usage

### Local Development

#### Run Performance Tests Locally

```bash
# Basic performance test run
./scripts/run-performance-tests.sh

# Create a new baseline
BASELINE_MODE=create ./scripts/run-performance-tests.sh

# Compare against existing baseline
BASELINE_MODE=compare ./scripts/run-performance-tests.sh

# Test against production environment
ENVIRONMENT=production BASE_URL=https://api.urnlabs.com ./scripts/run-performance-tests.sh
```

#### Environment Variables

```bash
# Required
ENVIRONMENT=staging          # Target environment (dev, staging, production)
BRANCH=main                 # Git branch for baseline association
BASE_URL=http://localhost:7001  # Base URL for testing

# Optional
BASELINE_MODE=compare       # Mode: create, compare, none
BASELINE_THRESHOLD=0.2      # Regression threshold (20%)
BLOCK_ON_REGRESSION=true    # Block deployment on regression
CI_MODE=false              # Enable CI-specific behavior
SLACK_WEBHOOK_URL=          # Slack notifications
PERFORMANCE_ALERT_WEBHOOK=  # Custom webhook for alerts
```

### CI/CD Integration

The performance testing is automatically integrated into the GitHub Actions pipeline:

#### Automatic Baseline Creation

On `main` branch pushes, new baselines are automatically created:

```yaml
# Creates baseline for main branch
- push to main → BASELINE_MODE=create
```

#### Regression Detection

On feature branches and PRs, performance is compared against baselines:

```yaml
# Compares against baseline
- feature branches → BASELINE_MODE=compare
- pull requests → Performance comment added
```

#### Deployment Blocking

Performance regressions can block deployments:

```yaml
# Deployment conditions
deploy-staging:
  needs: [performance-testing]
  if: needs.performance-testing.outputs.performance-status != 'failed'
```

### Performance Thresholds

#### Default Thresholds

```javascript
const thresholds = {
  // Response time thresholds
  p95_regression: 0.2,        // 20% increase in P95 latency
  p99_regression: 0.25,       // 25% increase in P99 latency

  // Error rate thresholds
  error_rate_regression: 0.1, // 10% increase in error rate

  // Throughput thresholds
  throughput_regression: 0.15, // 15% decrease in throughput

  // Absolute thresholds
  p99_max: 200,               // P99 must be < 200ms
  p95_max: 150,               // P95 must be < 150ms
  error_rate_max: 0.01,       // Error rate must be < 1%
};
```

#### Customizing Thresholds

```bash
# Custom regression threshold (30%)
BASELINE_THRESHOLD=0.3 ./scripts/run-performance-tests.sh

# Environment-specific thresholds in k6-baseline-comparison.js
const THRESHOLDS = {
  'http_req_duration': ENVIRONMENT === 'production' ? ['p(99)<150'] : ['p(99)<200'],
  'http_req_failed': ['rate<0.01'],
};
```

## Performance Scenarios

### Test Types

1. **Smoke Test** (30 seconds)
   - 1-2 virtual users
   - Basic functionality verification
   - Quick health check

2. **Load Test** (9-16 minutes)
   - 10-40 virtual users (environment dependent)
   - Normal traffic simulation
   - Sustained load testing

3. **Stress Test** (9-17 minutes)
   - 30-100 virtual users (environment dependent)
   - High traffic simulation
   - Breaking point identification

### Tested Endpoints

- `/health` - Basic health check
- `/api/health` - Detailed API health
- `/auth/login` - Authentication endpoint
- `/agents` - Protected resources
- `/workflows` - Business logic endpoints

## Baseline Management

### Baseline Structure

```json
{
  "metadata": {
    "timestamp": "2024-01-01T00:00:00Z",
    "branch": "main",
    "environment": "staging",
    "gitCommit": "abc123",
    "version": "1.0.0"
  },
  "metrics": {
    "http_req_duration_avg": 65,
    "http_req_duration_p95": 120,
    "http_req_duration_p99": 160,
    "http_req_failed_rate": 0.005,
    "http_reqs_rate": 100,
    "error_rate": 0.003
  },
  "thresholds": {
    "http_req_duration_p95_max": 144,
    "http_req_duration_p99_max": 200,
    "http_req_failed_rate_max": 0.01
  }
}
```

### Baseline Operations

```javascript
import { BaselineManager } from './baseline-manager.js';

const manager = new BaselineManager();

// Save new baseline
const baseline = manager.saveBaseline(results, 'main', 'staging');

// Load baseline for comparison
const baseline = manager.loadBaseline('main', 'staging');

// Compare current results
const comparison = manager.compareWithBaseline(currentResults, baseline);

// List available baselines
const baselines = manager.listBaselines();

// Clean old baselines (keep last 10)
manager.cleanOldBaselines(10);
```

## Monitoring & Alerting

### Alert Levels

1. **Critical** - Blocks deployment
   - P99 > 1000ms
   - Error rate > 5%
   - >50% performance regression

2. **Warning** - Allows deployment with warnings
   - P95 > 500ms
   - Error rate > 2%
   - 20-50% performance regression

3. **Info** - Monitoring notification
   - 10-20% performance regression
   - Trend degradation

### Alert Channels

#### Slack Integration

```bash
export SLACK_WEBHOOK_URL="https://hooks.slack.com/services/..."
```

Example Slack message:
```
🔴 Performance Alert - staging/main
Total Alerts: 3
Critical: 1 | Warning: 2
• P99 response time is 1200ms (critical threshold: 1000ms)
• Performance regression in http_req_duration_p95: 25% slower than baseline
```

#### Custom Webhooks

```bash
export PERFORMANCE_ALERT_WEBHOOK="https://your-monitoring-system.com/alerts"
```

Webhook payload:
```json
{
  "timestamp": "2024-01-01T00:00:00Z",
  "environment": "staging",
  "branch": "main",
  "total_alerts": 3,
  "critical_count": 1,
  "warning_count": 2,
  "alerts": [...]
}
```

## Dashboard

### Generating Dashboard

```bash
# Manual dashboard generation
cd performance
node -e "
import PerformanceMonitor from './performance-monitor.js';
const monitor = new PerformanceMonitor();
const data = monitor.generateDashboardData('staging', 'main');
console.log(JSON.stringify(data, null, 2));
"
```

### Dashboard Features

- **Real-time Metrics**: Latest performance data
- **Trend Charts**: Historical performance visualization
- **Alert Summary**: Recent alerts and status
- **Environment Comparison**: Multi-environment views

### Accessing Dashboard

During CI/CD:
```
📊 Performance dashboard available at: public/performance/
```

Local development:
```
open performance/reports/dashboard-staging-main.html
```

## Troubleshooting

### Common Issues

#### 1. No Baseline Found

```
⚠️ No baseline found for main/staging
```

**Solution**: Create initial baseline
```bash
BASELINE_MODE=create ./scripts/run-performance-tests.sh
```

#### 2. Services Not Available

```
❌ Services not available at http://localhost:7001
```

**Solution**: Start services
```bash
docker-compose -f docker-compose-local.yml up -d
# Wait for services to be ready
curl http://localhost:7001/health
```

#### 3. Performance Gate Failures

```
❌ Performance gate FAILED
🚫 Blocking deployment due to performance regressions
```

**Solution**: Investigate regressions
```bash
# Check detailed results
cat performance/reports/baseline-comparison-*.json
# Review performance trends
cat performance/trend-analysis.json
```

#### 4. K6 Installation Issues

```bash
# Ubuntu/Debian
sudo apt-get update
sudo apt-get install k6

# macOS
brew install k6

# Docker
docker run --rm -v $(pwd):/app -w /app grafana/k6:latest run script.js
```

### Debug Mode

Enable detailed logging:
```bash
DEBUG=true ./scripts/run-performance-tests.sh
```

### Manual Baseline Management

```bash
# List all baselines
find performance/baselines -name "*.json" | sort

# View specific baseline
cat performance/baselines/latest-main-staging.json | jq

# Compare two baselines manually
node -e "
import { BaselineManager } from './performance/baseline-manager.js';
const manager = new BaselineManager();
const baseline1 = manager.loadBaseline('main', 'staging', '2024-01-01');
const baseline2 = manager.loadBaseline('main', 'staging', '2024-01-02');
// Compare logic here
"
```

## Best Practices

### 1. Baseline Management

- Create baselines on stable releases
- Update baselines when performance improvements are made
- Maintain environment-specific baselines
- Regular baseline cleanup (automated)

### 2. Threshold Tuning

- Start with conservative thresholds (20%)
- Adjust based on application characteristics
- Use different thresholds per environment
- Monitor false positive rates

### 3. Test Maintenance

- Keep test scenarios realistic
- Update tests when API changes
- Monitor test execution time
- Validate test environment consistency

### 4. CI/CD Integration

- Block deployments on critical regressions
- Allow warnings to pass with notifications
- Create baselines on main branch only
- Use performance results in deployment decisions

### 5. Monitoring

- Set up alert notifications
- Review performance trends regularly
- Investigate unexpected regressions
- Correlate performance with deployments

## API Reference

### BaselineManager

```javascript
class BaselineManager {
  constructor(baselineDir)
  saveBaseline(results, branch, environment)
  loadBaseline(branch, environment, date)
  compareWithBaseline(currentResults, baseline, thresholds)
  listBaselines()
  cleanOldBaselines(keepCount)
  generateReport(comparison, outputPath)
}
```

### PerformanceMonitor

```javascript
class PerformanceMonitor {
  constructor(config)
  processResults(results, environment, branch)
  detectPerformanceIssues(report)
  triggerAlerts(alerts, report)
  generateDashboardData(environment, branch)
  getPerformanceStatus(report)
}
```

## Contributing

1. **Adding New Metrics**
   - Update `extractMetrics()` in BaselineManager
   - Add metric to comparison logic
   - Update dashboard visualization

2. **New Test Scenarios**
   - Add scenario to K6 configuration
   - Update thresholds accordingly
   - Document new scenario

3. **Alert Channels**
   - Implement in PerformanceMonitor
   - Add configuration options
   - Test alert delivery

4. **Threshold Algorithms**
   - Implement in comparison logic
   - Add configuration parameters
   - Validate with historical data

## License

This performance testing system is part of the Urnlabs AI platform and follows the same license terms.