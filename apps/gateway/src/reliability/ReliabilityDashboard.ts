import { EventEmitter } from 'events';
import Redis from 'ioredis';
import logger from '../lib/logger.js';
import { CircuitBreakerManager, CircuitBreakerState } from './CircuitBreakerManager.js';
import { FailoverManager } from './FailoverManager.js';
import { RetryPolicyManager } from './RetryPolicyManager.js';

export interface DashboardMetrics {
  timestamp: number;
  circuitBreakers: {
    total: number;
    closed: number;
    open: number;
    halfOpen: number;
    failureRate: number;
    averageResponseTime: number;
  };
  failover: {
    services: number;
    healthyInstances: number;
    unhealthyInstances: number;
    totalFailovers: number;
    recentFailovers: number;
  };
  retries: {
    activePolicies: number;
    activeRetries: number;
    successRate: number;
    averageAttempts: number;
  };
  reliability: {
    overallHealth: 'healthy' | 'degraded' | 'critical';
    uptime: number;
    availability: number;
    mttr: number; // Mean Time To Recovery
    mtbf: number; // Mean Time Between Failures
  };
}

export interface HealthAlert {
  id: string;
  type: 'circuit_breaker' | 'failover' | 'retry' | 'system';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  serviceName?: string;
  timestamp: number;
  acknowledged: boolean;
  resolvedAt?: number;
}

export interface ReliabilityReport {
  period: {
    start: number;
    end: number;
    duration: number;
  };
  summary: {
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    successRate: number;
    averageResponseTime: number;
    p95ResponseTime: number;
    p99ResponseTime: number;
  };
  circuitBreakers: {
    activations: number;
    totalDowntime: number;
    servicesAffected: string[];
    fastestRecovery: number;
    slowestRecovery: number;
  };
  failovers: {
    total: number;
    automatic: number;
    manual: number;
    successRate: number;
    averageFailoverTime: number;
  };
  retries: {
    totalAttempts: number;
    successfulRetries: number;
    failedRetries: number;
    retrySuccessRate: number;
    averageRetryDelay: number;
  };
  recommendations: string[];
}

export class ReliabilityDashboard extends EventEmitter {
  private redis: Redis;
  private circuitBreaker: CircuitBreakerManager;
  private failover: FailoverManager;
  private retryPolicy: RetryPolicyManager;
  private alerts: Map<string, HealthAlert> = new Map();
  private metricsHistory: DashboardMetrics[] = [];
  private updateInterval: NodeJS.Timeout | null = null;
  private alertCheckInterval: NodeJS.Timeout | null = null;

  constructor(
    redis: Redis,
    circuitBreaker: CircuitBreakerManager,
    failover: FailoverManager,
    retryPolicy: RetryPolicyManager
  ) {
    super();
    this.redis = redis;
    this.circuitBreaker = circuitBreaker;
    this.failover = failover;
    this.retryPolicy = retryPolicy;

    this.initializeDashboard();
  }

  private async initializeDashboard(): Promise<void> {
    try {
      // Load existing alerts
      await this.loadAlertsFromRedis();

      // Set up event listeners
      this.setupEventListeners();

      // Start periodic updates
      this.startPeriodicUpdates();

      // Start alert monitoring
      this.startAlertMonitoring();

      logger.info('Reliability dashboard initialized');
    } catch (error) {
      logger.error('Failed to initialize reliability dashboard', { error });
    }
  }

  private setupEventListeners(): void {
    // Circuit breaker events
    this.circuitBreaker.on('circuitOpened', (event) => {
      this.createAlert({
        type: 'circuit_breaker',
        severity: 'high',
        message: `Circuit breaker opened for service ${event.serviceName}`,
        serviceName: event.serviceName
      });
    });

    this.circuitBreaker.on('circuitClosed', (event) => {
      this.resolveAlert(`circuit_breaker_${event.serviceName}`);
    });

    // Failover events
    this.failover.on('failoverExecuted', (event) => {
      this.createAlert({
        type: 'failover',
        severity: event.automatic ? 'medium' : 'high',
        message: `Failover executed for ${event.serviceName}: ${event.reason}`,
        serviceName: event.serviceName
      });
    });

    this.failover.on('instanceUnhealthy', (event) => {
      this.createAlert({
        type: 'failover',
        severity: 'medium',
        message: `Instance ${event.instance.id} in service ${event.serviceName} is unhealthy`,
        serviceName: event.serviceName
      });
    });

    // Retry events
    this.retryPolicy.on('executionFailed', (event) => {
      if (event.execution.attempts.length >= 3) {
        this.createAlert({
          type: 'retry',
          severity: 'medium',
          message: `Multiple retry attempts failed for ${event.execution.serviceName}`,
          serviceName: event.execution.serviceName
        });
      }
    });
  }

  private startPeriodicUpdates(): void {
    // Update metrics every 30 seconds
    this.updateInterval = setInterval(async () => {
      try {
        const metrics = await this.collectMetrics();
        this.metricsHistory.push(metrics);

        // Keep only last 24 hours of metrics (2880 data points at 30s intervals)
        if (this.metricsHistory.length > 2880) {
          this.metricsHistory = this.metricsHistory.slice(-2880);
        }

        await this.saveMetricsToRedis(metrics);
        this.emit('metricsUpdated', metrics);
      } catch (error) {
        logger.error('Failed to update dashboard metrics', { error });
      }
    }, 30000);
  }

  private startAlertMonitoring(): void {
    // Check for system-level issues every minute
    this.alertCheckInterval = setInterval(async () => {
      try {
        await this.checkSystemHealth();
      } catch (error) {
        logger.error('Failed to check system health', { error });
      }
    }, 60000);
  }

  private async collectMetrics(): Promise<DashboardMetrics> {
    const [cbStats, failoverStats, retryStats] = await Promise.all([
      this.circuitBreaker.getStats(),
      this.failover.getStats(),
      this.retryPolicy.getStats()
    ]);

    const metrics: DashboardMetrics = {
      timestamp: Date.now(),
      circuitBreakers: {
        total: cbStats.services,
        closed: cbStats.closed,
        open: cbStats.open,
        halfOpen: cbStats.halfOpen,
        failureRate: cbStats.totalRequests > 0 ? (cbStats.totalFailures / cbStats.totalRequests) * 100 : 0,
        averageResponseTime: cbStats.averageResponseTime
      },
      failover: {
        services: failoverStats.services,
        healthyInstances: failoverStats.healthyInstances,
        unhealthyInstances: failoverStats.unhealthyInstances,
        totalFailovers: failoverStats.totalFailovers,
        recentFailovers: this.getRecentFailovers(failoverStats)
      },
      retries: {
        activePolicies: retryStats.policies,
        activeRetries: retryStats.activeRetries,
        successRate: this.calculateRetrySuccessRate(retryStats),
        averageAttempts: retryStats.averageAttempts || 0
      },
      reliability: await this.calculateReliabilityMetrics()
    };

    return metrics;
  }

  private getRecentFailovers(failoverStats: any): number {
    // Count failovers in the last hour
    const oneHourAgo = Date.now() - 3600000;
    let recentCount = 0;

    for (const service of Object.values(failoverStats.details) as any[]) {
      if (service.lastFailover) {
        const lastFailoverTime = new Date(service.lastFailover).getTime();
        if (lastFailoverTime >= oneHourAgo) {
          recentCount++;
        }
      }
    }

    return recentCount;
  }

  private calculateRetrySuccessRate(retryStats: any): number {
    // This would be calculated from historical data
    // For now, return a placeholder
    return 85; // 85% success rate
  }

  private async calculateReliabilityMetrics(): Promise<DashboardMetrics['reliability']> {
    // Calculate overall system health based on circuit breaker states
    const cbStats = await this.circuitBreaker.getStats();
    const openCircuits = cbStats.open;
    const totalCircuits = cbStats.services;

    let overallHealth: 'healthy' | 'degraded' | 'critical';
    if (openCircuits === 0) {
      overallHealth = 'healthy';
    } else if (openCircuits / totalCircuits < 0.3) {
      overallHealth = 'degraded';
    } else {
      overallHealth = 'critical';
    }

    // Calculate uptime (simplified - would normally track actual downtime)
    const uptime = process.uptime();

    // Placeholder calculations for MTTR and MTBF
    const mttr = 300; // 5 minutes average recovery time
    const mtbf = 86400; // 24 hours average between failures

    return {
      overallHealth,
      uptime,
      availability: 99.9, // Would calculate from actual data
      mttr,
      mtbf
    };
  }

  private async checkSystemHealth(): Promise<void> {
    const metrics = this.metricsHistory[this.metricsHistory.length - 1];
    if (!metrics) return;

    // Check for critical conditions
    if (metrics.circuitBreakers.open > 0) {
      const openCount = metrics.circuitBreakers.open;
      this.createAlert({
        type: 'system',
        severity: openCount > 2 ? 'critical' : 'high',
        message: `${openCount} circuit breaker(s) currently open`
      });
    }

    if (metrics.failover.unhealthyInstances > metrics.failover.healthyInstances) {
      this.createAlert({
        type: 'system',
        severity: 'critical',
        message: 'More unhealthy instances than healthy ones detected'
      });
    }

    if (metrics.reliability.overallHealth === 'critical') {
      this.createAlert({
        type: 'system',
        severity: 'critical',
        message: 'System health is critical - immediate attention required'
      });
    }
  }

  private async createAlert(alertData: {
    type: HealthAlert['type'];
    severity: HealthAlert['severity'];
    message: string;
    serviceName?: string;
  }): Promise<void> {
    const alertId = `${alertData.type}_${alertData.serviceName || 'system'}_${Date.now()}`;

    const alert: HealthAlert = {
      id: alertId,
      type: alertData.type,
      severity: alertData.severity,
      message: alertData.message,
      serviceName: alertData.serviceName,
      timestamp: Date.now(),
      acknowledged: false
    };

    this.alerts.set(alertId, alert);
    await this.saveAlertsToRedis();

    logger.warn('Reliability alert created', alert);
    this.emit('alertCreated', alert);
  }

  private async resolveAlert(alertPattern: string): Promise<void> {
    const now = Date.now();
    let resolvedCount = 0;

    for (const [id, alert] of this.alerts.entries()) {
      if (id.includes(alertPattern) && !alert.resolvedAt) {
        alert.resolvedAt = now;
        resolvedCount++;
      }
    }

    if (resolvedCount > 0) {
      await this.saveAlertsToRedis();
      logger.info('Reliability alerts resolved', { pattern: alertPattern, count: resolvedCount });
      this.emit('alertsResolved', { pattern: alertPattern, count: resolvedCount });
    }
  }

  public async acknowledgeAlert(alertId: string): Promise<boolean> {
    const alert = this.alerts.get(alertId);
    if (alert) {
      alert.acknowledged = true;
      await this.saveAlertsToRedis();

      logger.info('Alert acknowledged', { alertId });
      this.emit('alertAcknowledged', { alertId });
      return true;
    }
    return false;
  }

  public getActiveAlerts(): HealthAlert[] {
    return Array.from(this.alerts.values())
      .filter(alert => !alert.resolvedAt)
      .sort((a, b) => {
        const severityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
        return severityOrder[b.severity] - severityOrder[a.severity];
      });
  }

  public getCurrentMetrics(): DashboardMetrics | null {
    return this.metricsHistory[this.metricsHistory.length - 1] || null;
  }

  public getMetricsHistory(hours: number = 24): DashboardMetrics[] {
    const cutoff = Date.now() - (hours * 3600000);
    return this.metricsHistory.filter(m => m.timestamp >= cutoff);
  }

  public async generateReport(startTime: number, endTime: number): Promise<ReliabilityReport> {
    const metrics = this.metricsHistory.filter(m =>
      m.timestamp >= startTime && m.timestamp <= endTime
    );

    if (metrics.length === 0) {
      throw new Error('No metrics available for the specified time period');
    }

    // Calculate summary statistics
    const totalRequests = metrics.reduce((sum, m) => sum + (m.circuitBreakers.total * 100), 0); // Estimated
    const avgResponseTime = metrics.reduce((sum, m) => sum + m.circuitBreakers.averageResponseTime, 0) / metrics.length;

    // Calculate circuit breaker statistics
    const circuitActivations = metrics.filter(m => m.circuitBreakers.open > 0).length;

    // Calculate failover statistics
    const totalFailovers = metrics.reduce((sum, m) => sum + m.failover.recentFailovers, 0);

    const report: ReliabilityReport = {
      period: {
        start: startTime,
        end: endTime,
        duration: endTime - startTime
      },
      summary: {
        totalRequests,
        successfulRequests: Math.round(totalRequests * 0.95), // Estimated
        failedRequests: Math.round(totalRequests * 0.05), // Estimated
        successRate: 95, // Estimated
        averageResponseTime: avgResponseTime,
        p95ResponseTime: avgResponseTime * 1.5, // Estimated
        p99ResponseTime: avgResponseTime * 2.5 // Estimated
      },
      circuitBreakers: {
        activations: circuitActivations,
        totalDowntime: circuitActivations * 60000, // Estimated 1 minute per activation
        servicesAffected: [], // Would get from actual data
        fastestRecovery: 30000, // 30 seconds
        slowestRecovery: 300000 // 5 minutes
      },
      failovers: {
        total: totalFailovers,
        automatic: Math.round(totalFailovers * 0.8), // 80% automatic
        manual: Math.round(totalFailovers * 0.2), // 20% manual
        successRate: 95,
        averageFailoverTime: 5000 // 5 seconds
      },
      retries: {
        totalAttempts: totalRequests * 0.1, // 10% of requests retried
        successfulRetries: totalRequests * 0.08, // 8% successful retries
        failedRetries: totalRequests * 0.02, // 2% failed retries
        retrySuccessRate: 80,
        averageRetryDelay: 2000 // 2 seconds
      },
      recommendations: this.generateRecommendations(metrics)
    };

    return report;
  }

  private generateRecommendations(metrics: DashboardMetrics[]): string[] {
    const recommendations: string[] = [];
    const latest = metrics[metrics.length - 1];

    if (latest.circuitBreakers.open > 0) {
      recommendations.push('Review and fix services with open circuit breakers');
    }

    if (latest.circuitBreakers.failureRate > 10) {
      recommendations.push('High failure rate detected - investigate upstream dependencies');
    }

    if (latest.failover.unhealthyInstances > latest.failover.healthyInstances * 0.5) {
      recommendations.push('Consider scaling up healthy instances or investigating infrastructure issues');
    }

    if (latest.retries.activeRetries > 10) {
      recommendations.push('High retry activity - review retry policies and upstream service health');
    }

    if (latest.reliability.overallHealth !== 'healthy') {
      recommendations.push('System health is degraded - prioritize fixing critical issues');
    }

    return recommendations;
  }

  private async saveMetricsToRedis(metrics: DashboardMetrics): Promise<void> {
    try {
      await this.redis.setex(
        'reliability:metrics:latest',
        300, // 5 minutes TTL
        JSON.stringify(metrics)
      );

      // Also save to time-series data
      const hourKey = `reliability:metrics:${Math.floor(metrics.timestamp / 3600000)}`;
      await this.redis.lpush(hourKey, JSON.stringify(metrics));
      await this.redis.expire(hourKey, 86400); // 24 hours TTL
    } catch (error) {
      logger.error('Failed to save metrics to Redis', { error });
    }
  }

  private async saveAlertsToRedis(): Promise<void> {
    try {
      const activeAlerts = Array.from(this.alerts.values()).filter(a => !a.resolvedAt);
      await this.redis.setex(
        'reliability:alerts',
        3600, // 1 hour TTL
        JSON.stringify(activeAlerts)
      );
    } catch (error) {
      logger.error('Failed to save alerts to Redis', { error });
    }
  }

  private async loadAlertsFromRedis(): Promise<void> {
    try {
      const data = await this.redis.get('reliability:alerts');
      if (data) {
        const alerts: HealthAlert[] = JSON.parse(data);
        for (const alert of alerts) {
          this.alerts.set(alert.id, alert);
        }
      }
    } catch (error) {
      logger.error('Failed to load alerts from Redis', { error });
    }
  }

  public getDashboardData(): any {
    const currentMetrics = this.getCurrentMetrics();
    const activeAlerts = this.getActiveAlerts();
    const recentMetrics = this.getMetricsHistory(1); // Last hour

    return {
      current: currentMetrics,
      alerts: activeAlerts,
      trends: {
        hourly: recentMetrics,
        alertCount: activeAlerts.length,
        criticalAlerts: activeAlerts.filter(a => a.severity === 'critical').length
      },
      summary: {
        services: currentMetrics?.circuitBreakers.total || 0,
        healthyServices: currentMetrics ?
          currentMetrics.circuitBreakers.total - currentMetrics.circuitBreakers.open : 0,
        avgResponseTime: currentMetrics?.circuitBreakers.averageResponseTime || 0,
        uptime: currentMetrics?.reliability.uptime || 0,
        availability: currentMetrics?.reliability.availability || 0
      }
    };
  }

  public destroy(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }
    if (this.alertCheckInterval) {
      clearInterval(this.alertCheckInterval);
    }
    this.removeAllListeners();
  }
}