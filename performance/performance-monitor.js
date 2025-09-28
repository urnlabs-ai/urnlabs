import fs from 'fs';
import path from 'path';
import { BaselineManager } from './baseline-manager.js';

/**
 * Performance Monitor and Alerting System
 * Monitors performance trends, detects regressions, and triggers alerts
 */
export class PerformanceMonitor {
  constructor(config = {}) {
    this.config = {
      alertThresholds: {
        critical: 0.5, // 50% regression
        warning: 0.2,  // 20% regression
        info: 0.1,     // 10% regression
      },
      trendWindowDays: 7,
      alertWebhookUrl: process.env.PERFORMANCE_ALERT_WEBHOOK,
      slackWebhookUrl: process.env.SLACK_WEBHOOK_URL,
      emailNotifications: process.env.PERFORMANCE_EMAIL_ALERTS === 'true',
      ...config,
    };

    this.baselineManager = new BaselineManager();
    this.metricsHistory = [];
  }

  /**
   * Process performance test results and check for regressions
   */
  async processResults(results, environment = 'staging', branch = 'main') {
    console.log('📊 Processing performance results...');

    const timestamp = new Date().toISOString();
    const baseline = this.baselineManager.loadBaseline(branch, environment);

    // Extract metrics from results
    const currentMetrics = this.baselineManager.extractMetrics(results);

    // Compare with baseline if available
    let comparison = null;
    if (baseline) {
      comparison = this.baselineManager.compareWithBaseline(results, baseline, this.config.alertThresholds);
    }

    // Create performance report
    const report = {
      timestamp,
      environment,
      branch,
      metrics: currentMetrics,
      baseline_comparison: comparison,
      alerts: [],
    };

    // Detect performance issues and generate alerts
    const alerts = await this.detectPerformanceIssues(report);
    report.alerts = alerts;

    // Store metrics in history
    this.metricsHistory.push({
      timestamp,
      environment,
      branch,
      metrics: currentMetrics,
    });

    // Trigger alerts if necessary
    if (alerts.length > 0) {
      await this.triggerAlerts(alerts, report);
    }

    // Update trend analysis
    await this.updateTrendAnalysis(report);

    // Save monitoring report
    await this.saveMonitoringReport(report);

    return report;
  }

  /**
   * Detect performance issues from current results
   */
  async detectPerformanceIssues(report) {
    const alerts = [];
    const { metrics, baseline_comparison: comparison } = report;

    // Check for critical performance thresholds
    const criticalChecks = [
      {
        condition: metrics.http_req_duration_p99 > 1000,
        level: 'critical',
        message: `P99 response time is ${metrics.http_req_duration_p99}ms (critical threshold: 1000ms)`,
        metric: 'p99_latency',
        value: metrics.http_req_duration_p99,
      },
      {
        condition: metrics.http_req_duration_p95 > 500,
        level: 'warning',
        message: `P95 response time is ${metrics.http_req_duration_p95}ms (warning threshold: 500ms)`,
        metric: 'p95_latency',
        value: metrics.http_req_duration_p95,
      },
      {
        condition: metrics.http_req_failed_rate > 0.05,
        level: 'critical',
        message: `Error rate is ${(metrics.http_req_failed_rate * 100).toFixed(2)}% (critical threshold: 5%)`,
        metric: 'error_rate',
        value: metrics.http_req_failed_rate,
      },
      {
        condition: metrics.error_rate > 0.02,
        level: 'warning',
        message: `Custom error rate is ${(metrics.error_rate * 100).toFixed(2)}% (warning threshold: 2%)`,
        metric: 'custom_error_rate',
        value: metrics.error_rate,
      },
    ];

    criticalChecks.forEach(check => {
      if (check.condition) {
        alerts.push({
          id: `${check.metric}_${Date.now()}`,
          timestamp: new Date().toISOString(),
          level: check.level,
          type: 'threshold_violation',
          message: check.message,
          metric: check.metric,
          value: check.value,
          environment: report.environment,
          branch: report.branch,
        });
      }
    });

    // Check baseline comparison for regressions
    if (comparison && comparison.summary.regressions.length > 0) {
      comparison.summary.regressions.forEach(regression => {
        let level = 'info';
        if (regression.change_percent > this.config.alertThresholds.critical * 100) {
          level = 'critical';
        } else if (regression.change_percent > this.config.alertThresholds.warning * 100) {
          level = 'warning';
        }

        alerts.push({
          id: `regression_${regression.metric}_${Date.now()}`,
          timestamp: new Date().toISOString(),
          level,
          type: 'performance_regression',
          message: `Performance regression in ${regression.metric}: ${regression.change_percent}% slower than baseline`,
          metric: regression.metric,
          value: regression.current,
          baseline_value: regression.baseline,
          change_percent: regression.change_percent,
          environment: report.environment,
          branch: report.branch,
        });
      });
    }

    // Check for trend-based issues
    const trendAlerts = await this.detectTrendIssues(report);
    alerts.push(...trendAlerts);

    return alerts;
  }

  /**
   * Detect performance issues based on trends
   */
  async detectTrendIssues(report) {
    const alerts = [];

    // Get recent metrics for trend analysis
    const recentMetrics = this.metricsHistory
      .filter(m => m.environment === report.environment && m.branch === report.branch)
      .slice(-10); // Last 10 data points

    if (recentMetrics.length < 3) {
      return alerts; // Need at least 3 data points for trend analysis
    }

    // Check for consistent degradation trend
    const trendChecks = [
      { metric: 'http_req_duration_p95', threshold: 0.1 },
      { metric: 'http_req_duration_p99', threshold: 0.15 },
      { metric: 'http_req_failed_rate', threshold: 0.05 },
    ];

    trendChecks.forEach(({ metric, threshold }) => {
      const values = recentMetrics.map(m => m.metrics[metric]).filter(v => v !== undefined);

      if (values.length >= 3) {
        // Calculate trend (simple linear regression slope)
        const trend = this.calculateTrend(values);
        const latestValue = values[values.length - 1];
        const firstValue = values[0];
        const totalChange = (latestValue - firstValue) / firstValue;

        if (trend > threshold && totalChange > threshold) {
          alerts.push({
            id: `trend_${metric}_${Date.now()}`,
            timestamp: new Date().toISOString(),
            level: totalChange > 0.3 ? 'critical' : 'warning',
            type: 'performance_trend',
            message: `Degrading trend detected in ${metric}: ${(totalChange * 100).toFixed(1)}% increase over ${values.length} measurements`,
            metric,
            trend_slope: trend,
            total_change_percent: Math.round(totalChange * 100),
            environment: report.environment,
            branch: report.branch,
          });
        }
      }
    });

    return alerts;
  }

  /**
   * Calculate simple trend (slope) from array of values
   */
  calculateTrend(values) {
    const n = values.length;
    const x = Array.from({ length: n }, (_, i) => i);
    const y = values;

    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((acc, xi, i) => acc + xi * y[i], 0);
    const sumXX = x.reduce((acc, xi) => acc + xi * xi, 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    return slope;
  }

  /**
   * Trigger alerts through various channels
   */
  async triggerAlerts(alerts, report) {
    console.log(`🚨 Triggering ${alerts.length} performance alerts...`);

    const criticalAlerts = alerts.filter(a => a.level === 'critical');
    const warningAlerts = alerts.filter(a => a.level === 'warning');

    // Prepare alert summary
    const alertSummary = {
      timestamp: new Date().toISOString(),
      environment: report.environment,
      branch: report.branch,
      total_alerts: alerts.length,
      critical_count: criticalAlerts.length,
      warning_count: warningAlerts.length,
      alerts,
    };

    // Send to webhook if configured
    if (this.config.alertWebhookUrl) {
      await this.sendWebhookAlert(alertSummary);
    }

    // Send to Slack if configured
    if (this.config.slackWebhookUrl) {
      await this.sendSlackAlert(alertSummary);
    }

    // Send email notifications if configured
    if (this.config.emailNotifications) {
      await this.sendEmailAlert(alertSummary);
    }

    // Log alerts to console
    console.log('📋 Performance Alert Summary:');
    alerts.forEach(alert => {
      const emoji = alert.level === 'critical' ? '🔴' : alert.level === 'warning' ? '🟡' : '🔵';
      console.log(`${emoji} [${alert.level.toUpperCase()}] ${alert.message}`);
    });
  }

  /**
   * Send alert to webhook
   */
  async sendWebhookAlert(alertSummary) {
    try {
      const response = await fetch(this.config.alertWebhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(alertSummary),
      });

      if (response.ok) {
        console.log('✅ Webhook alert sent successfully');
      } else {
        console.error('❌ Failed to send webhook alert:', response.statusText);
      }
    } catch (error) {
      console.error('❌ Webhook alert error:', error.message);
    }
  }

  /**
   * Send alert to Slack
   */
  async sendSlackAlert(alertSummary) {
    try {
      const { environment, branch, total_alerts, critical_count, warning_count } = alertSummary;

      const color = critical_count > 0 ? 'danger' : warning_count > 0 ? 'warning' : 'good';
      const emoji = critical_count > 0 ? '🔴' : warning_count > 0 ? '🟡' : '🟢';

      const slackMessage = {
        username: 'Performance Monitor',
        icon_emoji: ':chart_with_upwards_trend:',
        attachments: [{
          color,
          title: `${emoji} Performance Alert - ${environment}/${branch}`,
          fields: [
            {
              title: 'Total Alerts',
              value: total_alerts,
              short: true,
            },
            {
              title: 'Critical',
              value: critical_count,
              short: true,
            },
            {
              title: 'Warning',
              value: warning_count,
              short: true,
            },
            {
              title: 'Environment',
              value: environment,
              short: true,
            },
          ],
          text: alertSummary.alerts
            .slice(0, 3) // Show first 3 alerts
            .map(alert => `• ${alert.message}`)
            .join('\n'),
          footer: 'Performance Monitoring',
          ts: Math.floor(Date.now() / 1000),
        }],
      };

      const response = await fetch(this.config.slackWebhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(slackMessage),
      });

      if (response.ok) {
        console.log('✅ Slack alert sent successfully');
      } else {
        console.error('❌ Failed to send Slack alert:', response.statusText);
      }
    } catch (error) {
      console.error('❌ Slack alert error:', error.message);
    }
  }

  /**
   * Send email alert (placeholder - integrate with your email service)
   */
  async sendEmailAlert(alertSummary) {
    console.log('📧 Email alert would be sent (implement with your email service)');
    console.log('Alert summary:', JSON.stringify(alertSummary, null, 2));
  }

  /**
   * Update trend analysis data
   */
  async updateTrendAnalysis(report) {
    const trendFile = './performance/trend-analysis.json';
    let trendData = { environments: {} };

    // Load existing trend data
    try {
      if (fs.existsSync(trendFile)) {
        trendData = JSON.parse(fs.readFileSync(trendFile, 'utf8'));
      }
    } catch (error) {
      console.warn('⚠️ Could not load existing trend data, starting fresh');
    }

    // Update trend data
    const envKey = `${report.environment}-${report.branch}`;
    if (!trendData.environments[envKey]) {
      trendData.environments[envKey] = { dataPoints: [] };
    }

    trendData.environments[envKey].dataPoints.push({
      timestamp: report.timestamp,
      metrics: report.metrics,
      alerts: report.alerts.length,
    });

    // Keep only last 30 days of data
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    trendData.environments[envKey].dataPoints = trendData.environments[envKey].dataPoints
      .filter(dp => new Date(dp.timestamp) > thirtyDaysAgo);

    // Save updated trend data
    try {
      fs.writeFileSync(trendFile, JSON.stringify(trendData, null, 2));
      console.log('📈 Trend analysis updated');
    } catch (error) {
      console.error('❌ Failed to save trend analysis:', error.message);
    }
  }

  /**
   * Save monitoring report
   */
  async saveMonitoringReport(report) {
    const reportsDir = './performance/reports';
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().split('T')[0];
    const filename = `performance-report-${report.environment}-${report.branch}-${timestamp}.json`;
    const filepath = path.join(reportsDir, filename);

    try {
      fs.writeFileSync(filepath, JSON.stringify(report, null, 2));
      console.log(`📋 Monitoring report saved: ${filename}`);
    } catch (error) {
      console.error('❌ Failed to save monitoring report:', error.message);
    }
  }

  /**
   * Generate performance dashboard data
   */
  generateDashboardData(environment = 'staging', branch = 'main') {
    const envKey = `${environment}-${branch}`;
    const trendFile = './performance/trend-analysis.json';

    let trendData = { environments: {} };
    try {
      if (fs.existsSync(trendFile)) {
        trendData = JSON.parse(fs.readFileSync(trendFile, 'utf8'));
      }
    } catch (error) {
      console.warn('⚠️ Could not load trend data for dashboard');
    }

    const envData = trendData.environments[envKey] || { dataPoints: [] };
    const recentData = envData.dataPoints.slice(-168); // Last week (hourly data)

    // Calculate dashboard metrics
    const dashboardData = {
      environment,
      branch,
      last_updated: new Date().toISOString(),
      summary: {
        total_data_points: recentData.length,
        avg_p95_latency: this.calculateAverage(recentData.map(d => d.metrics.http_req_duration_p95)),
        avg_p99_latency: this.calculateAverage(recentData.map(d => d.metrics.http_req_duration_p99)),
        avg_error_rate: this.calculateAverage(recentData.map(d => d.metrics.http_req_failed_rate)),
        total_alerts: recentData.reduce((sum, d) => sum + d.alerts, 0),
      },
      trend_charts: {
        latency_p95: recentData.map(d => ({
          timestamp: d.timestamp,
          value: d.metrics.http_req_duration_p95,
        })),
        latency_p99: recentData.map(d => ({
          timestamp: d.timestamp,
          value: d.metrics.http_req_duration_p99,
        })),
        error_rate: recentData.map(d => ({
          timestamp: d.timestamp,
          value: d.metrics.http_req_failed_rate * 100, // Convert to percentage
        })),
        throughput: recentData.map(d => ({
          timestamp: d.timestamp,
          value: d.metrics.http_reqs_rate,
        })),
      },
    };

    return dashboardData;
  }

  /**
   * Calculate average from array of numbers
   */
  calculateAverage(numbers) {
    const filtered = numbers.filter(n => typeof n === 'number' && !isNaN(n));
    return filtered.length > 0 ? filtered.reduce((a, b) => a + b, 0) / filtered.length : 0;
  }

  /**
   * Get performance status for CI/CD pipeline
   */
  getPerformanceStatus(report) {
    const criticalAlerts = report.alerts.filter(a => a.level === 'critical');
    const warningAlerts = report.alerts.filter(a => a.level === 'warning');

    return {
      status: criticalAlerts.length > 0 ? 'failed' : warningAlerts.length > 0 ? 'warning' : 'passed',
      critical_alerts: criticalAlerts.length,
      warning_alerts: warningAlerts.length,
      total_alerts: report.alerts.length,
      should_block_deployment: criticalAlerts.length > 0,
      summary: `${criticalAlerts.length} critical, ${warningAlerts.length} warning alerts`,
    };
  }
}

export default PerformanceMonitor;