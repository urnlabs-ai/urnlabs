import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

/**
 * Performance Baseline Manager
 * Handles collection, storage, and comparison of performance baselines
 */
export class BaselineManager {
  constructor(baselineDir = './performance/baselines') {
    this.baselineDir = baselineDir;
    this.ensureBaselineDir();
  }

  /**
   * Ensure baseline directory exists
   */
  ensureBaselineDir() {
    if (!fs.existsSync(this.baselineDir)) {
      fs.mkdirSync(this.baselineDir, { recursive: true });
    }
  }

  /**
   * Generate baseline key based on branch and environment
   */
  generateBaselineKey(branch = 'main', environment = 'staging') {
    const timestamp = new Date().toISOString().split('T')[0];
    return `${branch}-${environment}-${timestamp}`;
  }

  /**
   * Save performance baseline
   */
  saveBaseline(results, branch = 'main', environment = 'staging') {
    const baselineKey = this.generateBaselineKey(branch, environment);
    const filename = `baseline-${baselineKey}.json`;
    const filepath = path.join(this.baselineDir, filename);

    const baseline = {
      metadata: {
        timestamp: new Date().toISOString(),
        branch,
        environment,
        gitCommit: this.getGitCommit(),
        version: this.getPackageVersion(),
      },
      metrics: this.extractMetrics(results),
      thresholds: this.generateThresholds(results),
    };

    fs.writeFileSync(filepath, JSON.stringify(baseline, null, 2));

    // Create or update the latest baseline link
    const latestFile = path.join(this.baselineDir, `latest-${branch}-${environment}.json`);
    fs.writeFileSync(latestFile, JSON.stringify(baseline, null, 2));

    console.log(`📊 Baseline saved: ${filename}`);
    return baseline;
  }

  /**
   * Load baseline for comparison
   */
  loadBaseline(branch = 'main', environment = 'staging', date = null) {
    let filename;

    if (date) {
      filename = `baseline-${branch}-${environment}-${date}.json`;
    } else {
      filename = `latest-${branch}-${environment}.json`;
    }

    const filepath = path.join(this.baselineDir, filename);

    if (!fs.existsSync(filepath)) {
      console.warn(`⚠️ No baseline found for ${branch}-${environment}${date ? `-${date}` : ''}`);
      return null;
    }

    return JSON.parse(fs.readFileSync(filepath, 'utf8'));
  }

  /**
   * Compare current results with baseline
   */
  compareWithBaseline(currentResults, baseline, thresholds = {}) {
    if (!baseline) {
      return {
        status: 'no_baseline',
        message: 'No baseline available for comparison',
        passed: false,
      };
    }

    const currentMetrics = this.extractMetrics(currentResults);
    const baselineMetrics = baseline.metrics;

    const comparison = {
      status: 'compared',
      timestamp: new Date().toISOString(),
      baseline: baseline.metadata,
      current: {
        timestamp: new Date().toISOString(),
        gitCommit: this.getGitCommit(),
      },
      results: {},
      summary: {
        passed: true,
        regressions: [],
        improvements: [],
        total_checks: 0,
        passed_checks: 0,
      },
    };

    // Define default regression thresholds
    const defaultThresholds = {
      p95_regression: 0.2, // 20% increase is a regression
      p99_regression: 0.25, // 25% increase is a regression
      error_rate_regression: 0.1, // 10% increase in error rate
      throughput_regression: 0.15, // 15% decrease in throughput
      ...thresholds,
    };

    // Compare key metrics
    const metricsToCompare = [
      { key: 'http_req_duration_p95', type: 'latency', threshold: defaultThresholds.p95_regression },
      { key: 'http_req_duration_p99', type: 'latency', threshold: defaultThresholds.p99_regression },
      { key: 'http_req_failed_rate', type: 'error_rate', threshold: defaultThresholds.error_rate_regression },
      { key: 'http_reqs_rate', type: 'throughput', threshold: defaultThresholds.throughput_regression },
    ];

    metricsToCompare.forEach(({ key, type, threshold }) => {
      const current = currentMetrics[key];
      const baseline_val = baselineMetrics[key];

      if (current !== undefined && baseline_val !== undefined) {
        comparison.summary.total_checks++;

        let changePercent;
        let isRegression = false;
        let passed = true;

        if (type === 'throughput') {
          // For throughput, decrease is bad
          changePercent = (baseline_val - current) / baseline_val;
          isRegression = changePercent > threshold;
        } else {
          // For latency and error rate, increase is bad
          changePercent = (current - baseline_val) / baseline_val;
          isRegression = changePercent > threshold;
        }

        if (isRegression) {
          passed = false;
          comparison.summary.passed = false;
          comparison.summary.regressions.push({
            metric: key,
            current,
            baseline: baseline_val,
            change_percent: Math.round(changePercent * 100),
            threshold_percent: Math.round(threshold * 100),
          });
        } else if (changePercent < -0.05) {
          // Improvement if more than 5% better
          comparison.summary.improvements.push({
            metric: key,
            current,
            baseline: baseline_val,
            change_percent: Math.round(Math.abs(changePercent) * 100),
          });
        }

        if (passed) {
          comparison.summary.passed_checks++;
        }

        comparison.results[key] = {
          current,
          baseline: baseline_val,
          change_percent: Math.round(changePercent * 100),
          passed,
          threshold_percent: Math.round(threshold * 100),
        };
      }
    });

    return comparison;
  }

  /**
   * Extract key metrics from K6 results
   */
  extractMetrics(results) {
    if (typeof results === 'string') {
      try {
        results = JSON.parse(results);
      } catch (e) {
        console.error('Failed to parse results JSON:', e);
        return {};
      }
    }

    const metrics = {};

    // Process K6 results format
    if (results.metrics) {
      Object.entries(results.metrics).forEach(([key, data]) => {
        if (data.values) {
          // Extract percentiles and rates
          Object.entries(data.values).forEach(([valueKey, value]) => {
            metrics[`${key}_${valueKey}`] = value;
          });
        }
      });
    }

    // Ensure we have key metrics with defaults
    return {
      http_req_duration_avg: metrics.http_req_duration_avg || 0,
      http_req_duration_p50: metrics.http_req_duration_p50 || 0,
      http_req_duration_p95: metrics.http_req_duration_p95 || 0,
      http_req_duration_p99: metrics.http_req_duration_p99 || 0,
      http_req_failed_rate: metrics.http_req_failed_rate || 0,
      http_reqs_count: metrics.http_reqs_count || 0,
      http_reqs_rate: metrics.http_reqs_rate || 0,
      vus_max: metrics.vus_max || 0,
      error_rate: metrics.error_rate || 0,
      response_time_avg: metrics.response_time_avg || 0,
      api_calls_count: metrics.api_calls_count || 0,
      ...metrics,
    };
  }

  /**
   * Generate performance thresholds based on baseline
   */
  generateThresholds(results) {
    const metrics = this.extractMetrics(results);

    return {
      http_req_duration_p95_max: Math.ceil(metrics.http_req_duration_p95 * 1.2), // 20% buffer
      http_req_duration_p99_max: Math.ceil(metrics.http_req_duration_p99 * 1.25), // 25% buffer
      http_req_failed_rate_max: Math.max(0.01, metrics.http_req_failed_rate * 2), // At least 1% error rate
      error_rate_max: Math.max(0.01, metrics.error_rate * 2),
    };
  }

  /**
   * List available baselines
   */
  listBaselines() {
    if (!fs.existsSync(this.baselineDir)) {
      return [];
    }

    return fs.readdirSync(this.baselineDir)
      .filter(file => file.startsWith('baseline-') && file.endsWith('.json'))
      .map(file => {
        const filepath = path.join(this.baselineDir, file);
        const content = JSON.parse(fs.readFileSync(filepath, 'utf8'));
        return {
          filename: file,
          ...content.metadata,
        };
      })
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  }

  /**
   * Clean old baselines (keep last N baselines per branch/environment)
   */
  cleanOldBaselines(keepCount = 10) {
    const baselines = this.listBaselines();
    const grouped = {};

    // Group by branch-environment
    baselines.forEach(baseline => {
      const key = `${baseline.branch}-${baseline.environment}`;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(baseline);
    });

    let deletedCount = 0;

    Object.entries(grouped).forEach(([key, group]) => {
      if (group.length > keepCount) {
        const toDelete = group.slice(keepCount);
        toDelete.forEach(baseline => {
          const filepath = path.join(this.baselineDir, baseline.filename);
          fs.unlinkSync(filepath);
          deletedCount++;
        });
      }
    });

    console.log(`🧹 Cleaned ${deletedCount} old baselines`);
    return deletedCount;
  }

  /**
   * Get current git commit hash
   */
  getGitCommit() {
    try {
      return execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
    } catch (e) {
      return 'unknown';
    }
  }

  /**
   * Get package version
   */
  getPackageVersion() {
    try {
      const packageJson = JSON.parse(fs.readFileSync('./package.json', 'utf8'));
      return packageJson.version || 'unknown';
    } catch (e) {
      return 'unknown';
    }
  }

  /**
   * Generate baseline comparison report
   */
  generateReport(comparison, outputPath = null) {
    const report = {
      title: 'Performance Baseline Comparison Report',
      ...comparison,
    };

    if (outputPath) {
      fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
      console.log(`📋 Report saved to: ${outputPath}`);
    }

    return report;
  }

  /**
   * Export baseline data for external monitoring systems
   */
  exportForMonitoring(baseline, format = 'prometheus') {
    if (format === 'prometheus') {
      const metrics = baseline.metrics;
      let output = '# Performance Baseline Metrics\n';

      Object.entries(metrics).forEach(([key, value]) => {
        const metricName = key.replace(/[^a-zA-Z0-9_]/g, '_');
        output += `performance_baseline_${metricName}{branch="${baseline.metadata.branch}",environment="${baseline.metadata.environment}"} ${value}\n`;
      });

      return output;
    }

    return baseline;
  }
}

export default BaselineManager;