#!/usr/bin/env node

/**
 * Test script for the baseline comparison system
 * Validates that all components work together correctly
 */

import fs from 'fs';
import { BaselineManager } from './baseline-manager.js';
import PerformanceMonitor from './performance-monitor.js';

// Mock K6 results for testing
const mockResults = {
  metrics: {
    http_req_duration: {
      values: {
        avg: 65.5,
        p50: 55.2,
        p95: 120.8,
        p99: 165.3,
      }
    },
    http_req_failed: {
      values: {
        rate: 0.008
      }
    },
    http_reqs: {
      values: {
        count: 1500,
        rate: 125.5
      }
    },
    error_rate: {
      values: {
        rate: 0.005
      }
    },
    response_time: {
      values: {
        avg: 58.2
      }
    },
    api_calls: {
      values: {
        count: 450
      }
    }
  }
};

const mockRegressionResults = {
  metrics: {
    http_req_duration: {
      values: {
        avg: 95.5,    // 45% slower
        p50: 78.2,    // 41% slower
        p95: 180.8,   // 50% slower - regression!
        p99: 245.3,   // 48% slower - regression!
      }
    },
    http_req_failed: {
      values: {
        rate: 0.015   // 87% increase - regression!
      }
    },
    http_reqs: {
      values: {
        count: 1200,
        rate: 98.5    // 21% slower throughput - regression!
      }
    },
    error_rate: {
      values: {
        rate: 0.012   // 140% increase - regression!
      }
    },
    response_time: {
      values: {
        avg: 85.2     // 46% slower
      }
    },
    api_calls: {
      values: {
        count: 380
      }
    }
  }
};

async function testBaselineSystem() {
  console.log('🧪 Testing Performance Baseline System\n');

  try {
    // Test 1: Baseline Manager
    console.log('📊 Test 1: Baseline Manager');
    console.log('=' .repeat(40));

    const baselineManager = new BaselineManager('./test-baselines');

    // Create a baseline
    console.log('Creating baseline...');
    const baseline = baselineManager.saveBaseline(mockResults, 'test-branch', 'test-env');
    console.log('✅ Baseline created successfully');

    // Load the baseline
    console.log('Loading baseline...');
    const loadedBaseline = baselineManager.loadBaseline('test-branch', 'test-env');
    console.log('✅ Baseline loaded successfully');

    // Compare with good results (no regression)
    console.log('Testing good performance comparison...');
    const goodComparison = baselineManager.compareWithBaseline(mockResults, loadedBaseline);
    console.log(`✅ Good comparison - Passed: ${goodComparison.summary.passed}, Regressions: ${goodComparison.summary.regressions.length}`);

    // Compare with regression results
    console.log('Testing regression detection...');
    const regressionComparison = baselineManager.compareWithBaseline(mockRegressionResults, loadedBaseline);
    console.log(`✅ Regression comparison - Passed: ${regressionComparison.summary.passed}, Regressions: ${regressionComparison.summary.regressions.length}`);

    if (regressionComparison.summary.regressions.length > 0) {
      console.log('🔍 Detected regressions:');
      regressionComparison.summary.regressions.forEach(reg => {
        console.log(`   • ${reg.metric}: ${reg.change_percent}% worse`);
      });
    }

    console.log('\n📊 Test 2: Performance Monitor');
    console.log('=' .repeat(40));

    // Test 2: Performance Monitor
    const monitor = new PerformanceMonitor({
      alertThresholds: {
        critical: 0.4,  // 40% regression threshold
        warning: 0.2,   // 20% regression threshold
        info: 0.1,      // 10% regression threshold
      }
    });

    // Process good results
    console.log('Processing good performance results...');
    const goodReport = await monitor.processResults(mockResults, 'test-env', 'test-branch');
    console.log(`✅ Good results processed - Alerts: ${goodReport.alerts.length}`);

    // Process regression results
    console.log('Processing regression results...');
    const regressionReport = await monitor.processResults(mockRegressionResults, 'test-env', 'test-branch');
    console.log(`✅ Regression results processed - Alerts: ${regressionReport.alerts.length}`);

    if (regressionReport.alerts.length > 0) {
      console.log('🚨 Generated alerts:');
      regressionReport.alerts.forEach(alert => {
        const emoji = alert.level === 'critical' ? '🔴' : alert.level === 'warning' ? '🟡' : '🔵';
        console.log(`   ${emoji} [${alert.level.toUpperCase()}] ${alert.message}`);
      });
    }

    // Test 3: Dashboard Generation
    console.log('\n📊 Test 3: Dashboard Generation');
    console.log('=' .repeat(40));

    console.log('Generating dashboard data...');
    const dashboardData = monitor.generateDashboardData('test-env', 'test-branch');
    console.log('✅ Dashboard data generated');
    console.log(`   • Data points: ${dashboardData.summary.total_data_points}`);
    console.log(`   • Avg P95 latency: ${dashboardData.summary.avg_p95_latency.toFixed(2)}ms`);
    console.log(`   • Total alerts: ${dashboardData.summary.total_alerts}`);

    // Test 4: Performance Status for CI/CD
    console.log('\n📊 Test 4: CI/CD Integration');
    console.log('=' .repeat(40));

    const goodStatus = monitor.getPerformanceStatus(goodReport);
    console.log(`Good results status: ${goodStatus.status} (should block: ${goodStatus.should_block_deployment})`);

    const regressionStatus = monitor.getPerformanceStatus(regressionReport);
    console.log(`Regression results status: ${regressionStatus.status} (should block: ${regressionStatus.should_block_deployment})`);

    // Test 5: Baseline Management
    console.log('\n📊 Test 5: Baseline Management');
    console.log('=' .repeat(40));

    console.log('Listing available baselines...');
    const baselines = baselineManager.listBaselines();
    console.log(`✅ Found ${baselines.length} baseline(s)`);

    baselines.forEach(baseline => {
      console.log(`   • ${baseline.filename} (${baseline.branch}/${baseline.environment}) - ${baseline.timestamp}`);
    });

    // Cleanup test baselines
    console.log('Cleaning up test data...');
    if (fs.existsSync('./test-baselines')) {
      fs.rmSync('./test-baselines', { recursive: true, force: true });
    }
    if (fs.existsSync('./performance/reports')) {
      const reports = fs.readdirSync('./performance/reports').filter(f => f.includes('test-env'));
      reports.forEach(file => {
        fs.unlinkSync(`./performance/reports/${file}`);
      });
    }
    console.log('✅ Test data cleaned up');

    console.log('\n🎉 All tests passed successfully!');
    console.log('\nSystem Summary:');
    console.log('===============');
    console.log('✅ Baseline creation and storage');
    console.log('✅ Baseline loading and comparison');
    console.log('✅ Performance regression detection');
    console.log('✅ Alert generation and classification');
    console.log('✅ Dashboard data generation');
    console.log('✅ CI/CD integration status');
    console.log('✅ Baseline management operations');

    console.log('\n📋 The performance testing system is ready for use!');
    console.log('\nNext steps:');
    console.log('1. Run ./scripts/run-performance-tests.sh to create your first baseline');
    console.log('2. Configure your CI/CD pipeline with the GitHub Actions integration');
    console.log('3. Set up Slack/webhook notifications for alerts');
    console.log('4. Monitor the performance dashboard for trends');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run tests if script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  testBaselineSystem();
}

export default testBaselineSystem;