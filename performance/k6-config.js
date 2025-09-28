import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('error_rate');
const responseTime = new Trend('response_time');
const apiCalls = new Counter('api_calls');

// Test configuration
export const options = {
  scenarios: {
    // Smoke test - verify basic functionality
    smoke_test: {
      executor: 'constant-vus',
      vus: 1,
      duration: '30s',
      tags: { test_type: 'smoke' },
    },

    // Load test - normal traffic simulation
    load_test: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m', target: 10 },  // Ramp up to 10 users
        { duration: '5m', target: 10 },  // Stay at 10 users
        { duration: '2m', target: 20 },  // Ramp up to 20 users
        { duration: '5m', target: 20 },  // Stay at 20 users
        { duration: '2m', target: 0 },   // Ramp down to 0 users
      ],
      tags: { test_type: 'load' },
      startTime: '35s', // Start after smoke test
    },

    // Stress test - high traffic simulation
    stress_test: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '1m', target: 50 },  // Fast ramp up
        { duration: '3m', target: 50 },  // Stay at high load
        { duration: '1m', target: 100 }, // Peak traffic
        { duration: '2m', target: 100 }, // Sustained peak
        { duration: '2m', target: 0 },   // Fast ramp down
      ],
      tags: { test_type: 'stress' },
      startTime: '16m', // Start after load test
    }
  },

  // Performance thresholds - these must pass for the test to succeed
  thresholds: {
    // 99% of requests must complete below 200ms (production requirement)
    'http_req_duration': ['p(99)<200'],

    // HTTP error rate should be less than 1%
    'http_req_failed': ['rate<0.01'],

    // Custom error rate threshold
    'error_rate': ['rate<0.01'],

    // Response time trends
    'response_time': ['p(95)<150', 'p(99)<200'],

    // Specific thresholds for different test types
    'http_req_duration{test_type:smoke}': ['p(95)<100'],
    'http_req_duration{test_type:load}': ['p(95)<150'],
    'http_req_duration{test_type:stress}': ['p(95)<200'],
  },
};

// Base URL configuration
const BASE_URL = __ENV.BASE_URL || 'http://localhost:7001';

// API endpoints to test
const endpoints = {
  health: `${BASE_URL}/health`,
  auth: `${BASE_URL}/auth/login`,
  users: `${BASE_URL}/users/profile`,
  agents: `${BASE_URL}/agents`,
  workflows: `${BASE_URL}/workflows`,
};

// Test data
const testUser = {
  email: 'test@example.com',
  password: 'TestPass123!',
};

// Setup function - runs once before all tests
export function setup() {
  console.log('🚀 Starting performance tests...');
  console.log(`📍 Base URL: ${BASE_URL}`);

  // Verify services are available
  const healthCheck = http.get(endpoints.health);
  if (healthCheck.status !== 200) {
    throw new Error('Services not available for testing');
  }

  console.log('✅ Services are healthy and ready for testing');
  return { timestamp: new Date().toISOString() };
}

// Main test function
export default function(data) {
  const testType = __ITER < 30 ? 'smoke' : (__ITER < 960 ? 'load' : 'stress');

  group('Health Check', () => {
    const response = http.get(endpoints.health);

    const success = check(response, {
      'health check status is 200': (r) => r.status === 200,
      'health check response time < 50ms': (r) => r.timings.duration < 50,
      'health check returns correct format': (r) => {
        try {
          const body = JSON.parse(r.body);
          return body.status === 'healthy';
        } catch (e) {
          return false;
        }
      },
    });

    errorRate.add(!success);
    responseTime.add(response.timings.duration);
    apiCalls.add(1);
  });

  group('Authentication Endpoints', () => {
    // Test login endpoint (without actual authentication to avoid rate limiting)
    const loginResponse = http.post(endpoints.auth, JSON.stringify({
      email: 'invalid@test.com',
      password: 'invalid',
    }), {
      headers: { 'Content-Type': 'application/json' },
    });

    const authSuccess = check(loginResponse, {
      'auth endpoint responds': (r) => r.status === 400 || r.status === 401,
      'auth response time < 200ms': (r) => r.timings.duration < 200,
    });

    errorRate.add(!authSuccess);
    responseTime.add(loginResponse.timings.duration);
    apiCalls.add(1);
  });

  group('Public API Endpoints', () => {
    // Test agents endpoint (should require auth but respond quickly)
    const agentsResponse = http.get(endpoints.agents);

    const agentsSuccess = check(agentsResponse, {
      'agents endpoint responds': (r) => r.status === 401 || r.status === 200,
      'agents response time < 100ms': (r) => r.timings.duration < 100,
    });

    errorRate.add(!agentsSuccess);
    responseTime.add(agentsResponse.timings.duration);
    apiCalls.add(1);
  });

  // Add some realistic user behavior timing
  sleep(1);
}

// Teardown function - runs once after all tests
export function teardown(data) {
  console.log('🏁 Performance tests completed');
  console.log(`📊 Test session started at: ${data.timestamp}`);
  console.log('📈 Check the metrics for detailed performance analysis');
}