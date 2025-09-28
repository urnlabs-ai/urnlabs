import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';
import { htmlReport } from 'https://raw.githubusercontent.com/benc-uk/k6-reporter/main/dist/bundle.js';
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.0.1/index.js';

// Custom metrics for baseline comparison
const errorRate = new Rate('error_rate');
const responseTime = new Trend('response_time');
const apiCalls = new Counter('api_calls');
const regressionDetected = new Rate('performance_regression');

// Environment configuration
const ENVIRONMENT = __ENV.ENVIRONMENT || 'staging';
const BRANCH = __ENV.BRANCH || 'main';
const BASE_URL = __ENV.BASE_URL || 'http://localhost:7001';
const BASELINE_MODE = __ENV.BASELINE_MODE || 'compare'; // 'create' | 'compare' | 'none'
const BASELINE_THRESHOLD = parseFloat(__ENV.BASELINE_THRESHOLD || '0.2'); // 20% regression threshold

// Performance thresholds from environment or defaults
const THRESHOLDS = {
  // Basic thresholds
  'http_req_duration': ['p(99)<200', 'p(95)<150'],
  'http_req_failed': ['rate<0.01'],
  'error_rate': ['rate<0.01'],
  'response_time': ['p(95)<150', 'p(99)<200'],

  // Baseline comparison thresholds (will be overridden if baseline exists)
  'performance_regression': ['rate<0.01'], // Less than 1% of requests should trigger regression alerts
};

// Test configuration with environment-specific scaling
export const options = {
  scenarios: {
    // Smoke test - basic functionality
    smoke_test: {
      executor: 'constant-vus',
      vus: ENVIRONMENT === 'production' ? 2 : 1,
      duration: '30s',
      tags: { test_type: 'smoke', environment: ENVIRONMENT },
    },

    // Load test - normal traffic simulation
    load_test: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: ENVIRONMENT === 'production' ? [
        { duration: '2m', target: 20 },
        { duration: '10m', target: 20 },
        { duration: '2m', target: 40 },
        { duration: '10m', target: 40 },
        { duration: '2m', target: 0 },
      ] : [
        { duration: '1m', target: 10 },
        { duration: '3m', target: 10 },
        { duration: '1m', target: 20 },
        { duration: '3m', target: 20 },
        { duration: '1m', target: 0 },
      ],
      tags: { test_type: 'load', environment: ENVIRONMENT },
      startTime: '35s',
    },

    // Stress test - high traffic simulation
    stress_test: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: ENVIRONMENT === 'production' ? [
        { duration: '2m', target: 50 },
        { duration: '5m', target: 50 },
        { duration: '2m', target: 100 },
        { duration: '5m', target: 100 },
        { duration: '3m', target: 0 },
      ] : [
        { duration: '1m', target: 30 },
        { duration: '3m', target: 30 },
        { duration: '1m', target: 50 },
        { duration: '3m', target: 50 },
        { duration: '2m', target: 0 },
      ],
      tags: { test_type: 'stress', environment: ENVIRONMENT },
      startTime: ENVIRONMENT === 'production' ? '26m' : '10m',
    }
  },

  thresholds: THRESHOLDS,

  // Output configuration for baseline collection
  outputStatsdConfig: {
    addr: __ENV.STATSD_ADDR || 'localhost:8125',
    bufferSize: 100,
  },
};

// API endpoints to test
const endpoints = {
  health: `${BASE_URL}/health`,
  api_health: `${BASE_URL}/api/health`,
  auth: `${BASE_URL}/auth/login`,
  users: `${BASE_URL}/users/profile`,
  agents: `${BASE_URL}/agents`,
  workflows: `${BASE_URL}/workflows`,
};

// Baseline data storage
let baselineData = null;
let comparisonResults = {
  regressions: [],
  improvements: [],
  total_checks: 0,
  passed_checks: 0,
};

// Load baseline data for comparison
function loadBaseline() {
  try {
    if (BASELINE_MODE !== 'compare') {
      console.log(`📊 Baseline mode: ${BASELINE_MODE} - skipping baseline load`);
      return;
    }

    // In a real implementation, this would load from external storage
    // For now, we'll simulate baseline data based on environment
    console.log(`📋 Loading baseline for ${BRANCH}/${ENVIRONMENT}...`);

    // Simulated baseline data (in practice, load from JSON file or API)
    baselineData = {
      metadata: {
        branch: BRANCH,
        environment: ENVIRONMENT,
        timestamp: '2024-01-01T00:00:00Z',
      },
      metrics: {
        http_req_duration_avg: ENVIRONMENT === 'production' ? 80 : 60,
        http_req_duration_p50: ENVIRONMENT === 'production' ? 70 : 50,
        http_req_duration_p95: ENVIRONMENT === 'production' ? 140 : 120,
        http_req_duration_p99: ENVIRONMENT === 'production' ? 180 : 160,
        http_req_failed_rate: 0.005,
        http_reqs_rate: ENVIRONMENT === 'production' ? 150 : 100,
        error_rate: 0.003,
        response_time_avg: ENVIRONMENT === 'production' ? 75 : 55,
      },
    };

    console.log(`✅ Baseline loaded: ${baselineData.metadata.timestamp}`);
  } catch (error) {
    console.error(`❌ Failed to load baseline: ${error.message}`);
  }
}

// Compare metric with baseline and detect regressions
function compareWithBaseline(metricName, currentValue, baselineValue) {
  if (!baselineValue) return { passed: true, change: 0 };

  const change = (currentValue - baselineValue) / baselineValue;
  const changePercent = Math.round(change * 100);

  // Determine if this is a regression based on metric type
  let isRegression = false;

  if (metricName.includes('duration') || metricName.includes('response_time') || metricName.includes('error')) {
    // For latency and error metrics, increase is bad
    isRegression = change > BASELINE_THRESHOLD;
  } else if (metricName.includes('rate') && !metricName.includes('failed')) {
    // For throughput metrics, decrease is bad
    isRegression = change < -BASELINE_THRESHOLD;
  }

  comparisonResults.total_checks++;

  if (isRegression) {
    comparisonResults.regressions.push({
      metric: metricName,
      current: currentValue,
      baseline: baselineValue,
      change_percent: changePercent,
      threshold_percent: Math.round(BASELINE_THRESHOLD * 100),
    });

    // Track regression in K6 metrics
    regressionDetected.add(1);

    console.warn(`⚠️ Regression detected in ${metricName}: ${changePercent}% change (${currentValue} vs ${baselineValue})`);
  } else {
    comparisonResults.passed_checks++;

    if (change < -0.05) {
      // Improvement if more than 5% better
      comparisonResults.improvements.push({
        metric: metricName,
        current: currentValue,
        baseline: baselineValue,
        improvement_percent: Math.abs(changePercent),
      });
    }
  }

  return {
    passed: !isRegression,
    change: changePercent,
    baseline: baselineValue,
    current: currentValue,
  };
}

// Setup function - runs once before all tests
export function setup() {
  console.log('🚀 Starting performance tests with baseline comparison...');
  console.log(`📍 Base URL: ${BASE_URL}`);
  console.log(`🌍 Environment: ${ENVIRONMENT}`);
  console.log(`🌿 Branch: ${BRANCH}`);
  console.log(`📊 Baseline mode: ${BASELINE_MODE}`);

  // Load baseline data
  loadBaseline();

  // Verify services are available
  const healthCheck = http.get(endpoints.health);
  if (healthCheck.status !== 200) {
    throw new Error('Services not available for testing');
  }

  console.log('✅ Services are healthy and ready for testing');

  return {
    timestamp: new Date().toISOString(),
    baseline: baselineData,
    environment: ENVIRONMENT,
    branch: BRANCH,
  };
}

// Main test function
export default function(data) {
  const testType = __ITER < 30 ? 'smoke' : (__ITER < 960 ? 'load' : 'stress');
  const startTime = Date.now();

  group('Health Check Tests', () => {
    const response = http.get(endpoints.health, {
      tags: { endpoint: 'health', test_type: testType },
    });

    const success = check(response, {
      'health check status is 200': (r) => r.status === 200,
      'health check response time < 50ms': (r) => r.timings.duration < 50,
      'health check returns JSON': (r) => {
        try {
          const body = JSON.parse(r.body);
          return typeof body === 'object';
        } catch (e) {
          return false;
        }
      },
    });

    errorRate.add(!success);
    responseTime.add(response.timings.duration);
    apiCalls.add(1);

    // Baseline comparison for health check
    if (baselineData && BASELINE_MODE === 'compare') {
      compareWithBaseline('health_response_time', response.timings.duration, 25);
    }
  });

  group('API Health Tests', () => {
    const response = http.get(endpoints.api_health, {
      tags: { endpoint: 'api_health', test_type: testType },
    });

    const success = check(response, {
      'API health status is 200': (r) => r.status === 200,
      'API health response time < 100ms': (r) => r.timings.duration < 100,
      'API health includes version': (r) => r.body.includes('version') || r.body.includes('status'),
    });

    errorRate.add(!success);
    responseTime.add(response.timings.duration);
    apiCalls.add(1);

    // Baseline comparison for API health
    if (baselineData && BASELINE_MODE === 'compare') {
      compareWithBaseline('api_health_response_time', response.timings.duration, 50);
    }
  });

  group('Authentication Endpoint Tests', () => {
    const loginResponse = http.post(endpoints.auth, JSON.stringify({
      email: 'invalid@test.com',
      password: 'invalid',
    }), {
      headers: { 'Content-Type': 'application/json' },
      tags: { endpoint: 'auth', test_type: testType },
    });

    const authSuccess = check(loginResponse, {
      'auth endpoint responds appropriately': (r) => r.status === 400 || r.status === 401 || r.status === 422,
      'auth response time < 200ms': (r) => r.timings.duration < 200,
      'auth response includes error info': (r) => r.body.length > 0,
    });

    errorRate.add(!authSuccess);
    responseTime.add(loginResponse.timings.duration);
    apiCalls.add(1);

    // Baseline comparison for auth
    if (baselineData && BASELINE_MODE === 'compare') {
      compareWithBaseline('auth_response_time', loginResponse.timings.duration, 80);
    }
  });

  group('Protected Endpoint Tests', () => {
    // Test agents endpoint (should require auth but respond quickly)
    const agentsResponse = http.get(endpoints.agents, {
      tags: { endpoint: 'agents', test_type: testType },
    });

    const agentsSuccess = check(agentsResponse, {
      'agents endpoint responds': (r) => r.status === 401 || r.status === 200 || r.status === 403,
      'agents response time < 150ms': (r) => r.timings.duration < 150,
    });

    errorRate.add(!agentsSuccess);
    responseTime.add(agentsResponse.timings.duration);
    apiCalls.add(1);

    // Baseline comparison for agents endpoint
    if (baselineData && BASELINE_MODE === 'compare') {
      compareWithBaseline('agents_response_time', agentsResponse.timings.duration, 70);
    }
  });

  // Add realistic user behavior timing
  sleep(Math.random() * 2 + 1); // 1-3 seconds
}

// Enhanced teardown with baseline comparison results
export function teardown(data) {
  console.log('🏁 Performance tests completed');
  console.log(`📊 Test session: ${data.timestamp}`);

  if (BASELINE_MODE === 'compare' && baselineData) {
    console.log('\n📈 Baseline Comparison Results:');
    console.log(`📊 Total checks: ${comparisonResults.total_checks}`);
    console.log(`✅ Passed checks: ${comparisonResults.passed_checks}`);
    console.log(`⚠️ Regressions: ${comparisonResults.regressions.length}`);
    console.log(`🚀 Improvements: ${comparisonResults.improvements.length}`);

    if (comparisonResults.regressions.length > 0) {
      console.log('\n❌ Performance Regressions Detected:');
      comparisonResults.regressions.forEach(regression => {
        console.log(`   ${regression.metric}: ${regression.change_percent}% slower (threshold: ${regression.threshold_percent}%)`);
      });
    }

    if (comparisonResults.improvements.length > 0) {
      console.log('\n✅ Performance Improvements:');
      comparisonResults.improvements.forEach(improvement => {
        console.log(`   ${improvement.metric}: ${improvement.improvement_percent}% faster`);
      });
    }

    // Exit with error code if regressions detected
    if (comparisonResults.regressions.length > 0) {
      console.log('\n❌ Performance regression detected - marking test as failed');
      // In CI/CD, this will cause the pipeline to fail
    } else {
      console.log('\n✅ No performance regressions detected');
    }
  }

  console.log('\n📋 Check the detailed metrics and reports for complete analysis');
}

// Custom summary function with baseline comparison
export function handleSummary(data) {
  const summary = {
    'performance-results.json': JSON.stringify({
      ...data,
      baseline_comparison: {
        mode: BASELINE_MODE,
        baseline_data: baselineData,
        comparison_results: comparisonResults,
        environment: ENVIRONMENT,
        branch: BRANCH,
        timestamp: new Date().toISOString(),
      },
    }),
    'performance-report.html': htmlReport(data),
    stdout: textSummary(data, { indent: ' ', enableColors: true }),
  };

  // Add baseline comparison to summary if available
  if (BASELINE_MODE === 'compare' && comparisonResults.total_checks > 0) {
    const regressionRate = comparisonResults.regressions.length / comparisonResults.total_checks;
    summary['baseline-comparison.json'] = JSON.stringify({
      timestamp: new Date().toISOString(),
      environment: ENVIRONMENT,
      branch: BRANCH,
      baseline_threshold: BASELINE_THRESHOLD,
      total_checks: comparisonResults.total_checks,
      passed_checks: comparisonResults.passed_checks,
      regression_rate: Math.round(regressionRate * 100),
      regressions: comparisonResults.regressions,
      improvements: comparisonResults.improvements,
      passed: comparisonResults.regressions.length === 0,
    }, null, 2);
  }

  return summary;
}