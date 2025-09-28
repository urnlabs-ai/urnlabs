import { PrismaClient } from '@prisma/client';
import { PolicyEngineService } from './policy-engine-service.js';
import { PolicyEvaluationContext, PolicyEvaluationSummary } from './policy-evaluation-engine.js';
import { logger } from '../lib/logger.js';
import { EventEmitter } from 'events';

/**
 * Real-time Violation Detection Service
 *
 * Monitors policy evaluations and detects violations in real-time
 * Provides alerting, escalation, and risk assessment capabilities
 */

export interface ViolationAlert {
  id: string;
  policyId: string;
  organizationId: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  violationType: string;
  description: string;
  context: PolicyEvaluationContext;
  riskScore: number;
  timestamp: Date;
  status: 'new' | 'acknowledged' | 'resolved' | 'false_positive';
  escalationLevel: number;
  notificationsSent: string[];
  metadata: Record<string, any>;
}

export interface ViolationThresholds {
  critical: number;
  high: number;
  medium: number;
  low: number;
}

export interface AlertConfiguration {
  organizationId: string;
  enabled: boolean;
  thresholds: ViolationThresholds;
  notificationChannels: ('email' | 'slack' | 'webhook')[];
  escalationRules: EscalationRule[];
}

export interface EscalationRule {
  severity: 'low' | 'medium' | 'high' | 'critical';
  threshold: number; // Number of violations in time window
  timeWindowMinutes: number;
  action: 'notify' | 'escalate' | 'block';
  recipients: string[];
}

export interface RiskMetrics {
  overallRiskScore: number;
  trendDirection: 'increasing' | 'decreasing' | 'stable';
  byFramework: Record<string, number>;
  bySeverity: Record<string, number>;
  violationCount: number;
  criticalViolations: number;
}

export interface ViolationQuery {
  framework?: string;
  severity?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
  status?: string;
}

export class ViolationDetectionService extends EventEmitter {
  private readonly prisma: PrismaClient;
  private readonly policyEngine: PolicyEngineService;
  private readonly alertConfigurations: Map<string, AlertConfiguration> = new Map();
  private readonly violationCounters: Map<string, Map<string, number>> = new Map();
  private readonly riskCalculator: RiskCalculator;

  constructor(
    prisma: PrismaClient,
    policyEngine: PolicyEngineService
  ) {
    super();
    this.prisma = prisma;
    this.policyEngine = policyEngine;
    this.riskCalculator = new RiskCalculator();

    // Initialize event listeners
    this.setupEventListeners();

    // Load existing alert configurations
    this.loadAlertConfigurations();
  }

  /**
   * Configure violation detection alerts for an organization
   */
  async configureAlerts(organizationId: string, config: AlertConfiguration): Promise<void> {
    try {
      // Validate configuration
      this.validateAlertConfiguration(config);

      // Store configuration (in production, this would be persisted to database)
      this.alertConfigurations.set(organizationId, config);

      // Persist to database for reliability
      await this.persistAlertConfiguration(organizationId, config);

      logger.info('Alert configuration updated', {
        organizationId,
        enabled: config.enabled,
        channels: config.notificationChannels,
        escalationRules: config.escalationRules.length
      });

      this.emit('alertConfigurationUpdated', { organizationId, config });

    } catch (error) {
      logger.error('Failed to configure alerts', {
        organizationId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Process policy evaluation result for violation detection
   */
  async processEvaluationResult(
    organizationId: string,
    policyId: string,
    context: PolicyEvaluationContext,
    evaluationResult: PolicyEvaluationSummary
  ): Promise<ViolationAlert[]> {
    const alerts: ViolationAlert[] = [];

    try {
      // Check if evaluation resulted in violations
      if (evaluationResult.finalDecision === 'deny' || evaluationResult.blockedBy?.length > 0) {
        for (const blockingResult of evaluationResult.blockedBy || []) {
          const alert = await this.createViolationAlert(
            organizationId,
            policyId,
            context,
            blockingResult,
            evaluationResult
          );

          if (alert) {
            alerts.push(alert);

            // Check if this violation triggers escalation
            await this.checkEscalationRules(organizationId, alert);

            // Update risk metrics
            await this.updateRiskMetrics(organizationId, alert);

            // Emit real-time event
            this.emit('violationDetected', alert);
          }
        }
      }

      // Check for warning patterns that might indicate emerging risks
      if (evaluationResult.warnings?.length > 0) {
        await this.analyzeWarningPatterns(organizationId, policyId, context, evaluationResult.warnings);
      }

    } catch (error) {
      logger.error('Failed to process evaluation result for violation detection', {
        organizationId,
        policyId,
        error: error.message
      });
    }

    return alerts;
  }

  /**
   * Get recent violations for an organization
   */
  async getRecentViolations(
    organizationId: string,
    options: { limit?: number; startDate?: Date; endDate?: Date } = {}
  ): Promise<ViolationAlert[]> {
    try {
      const { limit = 50, startDate, endDate } = options;

      const whereClause: any = {
        organizationId,
        eventType: 'violation_detected'
      };

      if (startDate || endDate) {
        whereClause.eventTimestamp = {};
        if (startDate) whereClause.eventTimestamp.gte = startDate;
        if (endDate) whereClause.eventTimestamp.lte = endDate;
      }

      const auditLogs = await this.prisma.auditLog.findMany({
        where: whereClause,
        include: {
          policy: {
            select: { id: true, name: true, type: true, complianceFrameworks: true }
          }
        },
        orderBy: { eventTimestamp: 'desc' },
        take: limit
      });

      return auditLogs.map(log => this.mapAuditLogToViolationAlert(log));

    } catch (error) {
      logger.error('Failed to get recent violations', {
        organizationId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get violations with advanced filtering
   */
  async getViolations(organizationId: string, query: ViolationQuery): Promise<ViolationAlert[]> {
    try {
      const whereClause: any = {
        organizationId,
        eventType: 'violation_detected'
      };

      if (query.severity) {
        whereClause.severity = query.severity;
      }

      if (query.startDate || query.endDate) {
        whereClause.eventTimestamp = {};
        if (query.startDate) whereClause.eventTimestamp.gte = query.startDate;
        if (query.endDate) whereClause.eventTimestamp.lte = query.endDate;
      }

      if (query.framework) {
        whereClause.complianceFrameworks = { has: query.framework };
      }

      const auditLogs = await this.prisma.auditLog.findMany({
        where: whereClause,
        include: {
          policy: {
            select: { id: true, name: true, type: true, complianceFrameworks: true }
          }
        },
        orderBy: { eventTimestamp: 'desc' },
        take: query.limit || 50,
        skip: query.offset || 0
      });

      return auditLogs.map(log => this.mapAuditLogToViolationAlert(log));

    } catch (error) {
      logger.error('Failed to get violations', {
        organizationId,
        query,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get violation count for pagination
   */
  async getViolationCount(organizationId: string, query: ViolationQuery): Promise<number> {
    try {
      const whereClause: any = {
        organizationId,
        eventType: 'violation_detected'
      };

      if (query.severity) {
        whereClause.severity = query.severity;
      }

      if (query.startDate || query.endDate) {
        whereClause.eventTimestamp = {};
        if (query.startDate) whereClause.eventTimestamp.gte = query.startDate;
        if (query.endDate) whereClause.eventTimestamp.lte = query.endDate;
      }

      if (query.framework) {
        whereClause.complianceFrameworks = { has: query.framework };
      }

      return await this.prisma.auditLog.count({ where: whereClause });

    } catch (error) {
      logger.error('Failed to get violation count', {
        organizationId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Calculate risk metrics for an organization
   */
  async getRiskMetrics(
    organizationId: string,
    dateRange: { start: Date; end: Date }
  ): Promise<RiskMetrics> {
    try {
      const violations = await this.getViolations(organizationId, {
        startDate: dateRange.start,
        endDate: dateRange.end,
        limit: 1000
      });

      return this.riskCalculator.calculateRiskMetrics(violations, dateRange);

    } catch (error) {
      logger.error('Failed to calculate risk metrics', {
        organizationId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Acknowledge a violation alert
   */
  async acknowledgeViolation(
    organizationId: string,
    alertId: string,
    acknowledgedBy: string,
    notes?: string
  ): Promise<void> {
    try {
      await this.prisma.auditLog.update({
        where: { id: alertId },
        data: {
          metadata: {
            status: 'acknowledged',
            acknowledgedBy,
            acknowledgedAt: new Date().toISOString(),
            notes
          }
        }
      });

      this.emit('violationAcknowledged', {
        organizationId,
        alertId,
        acknowledgedBy,
        notes
      });

    } catch (error) {
      logger.error('Failed to acknowledge violation', {
        organizationId,
        alertId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Mark violation as false positive
   */
  async markFalsePositive(
    organizationId: string,
    alertId: string,
    markedBy: string,
    reason: string
  ): Promise<void> {
    try {
      await this.prisma.auditLog.update({
        where: { id: alertId },
        data: {
          metadata: {
            status: 'false_positive',
            markedBy,
            markedAt: new Date().toISOString(),
            reason
          }
        }
      });

      this.emit('violationMarkedFalsePositive', {
        organizationId,
        alertId,
        markedBy,
        reason
      });

    } catch (error) {
      logger.error('Failed to mark violation as false positive', {
        organizationId,
        alertId,
        error: error.message
      });
      throw error;
    }
  }

  // Private methods

  private setupEventListeners(): void {
    // Listen for policy evaluations from the policy engine
    this.policyEngine.on('policyEvaluated', async (data) => {
      await this.processEvaluationResult(
        data.organizationId,
        data.policyId,
        data.context,
        data.result
      );
    });
  }

  private async loadAlertConfigurations(): Promise<void> {
    try {
      // In a real implementation, load from database
      // For now, using default configurations
      logger.info('Loaded alert configurations for violation detection');
    } catch (error) {
      logger.error('Failed to load alert configurations', { error: error.message });
    }
  }

  private validateAlertConfiguration(config: AlertConfiguration): void {
    if (!config.organizationId) {
      throw new Error('Organization ID is required');
    }

    if (config.enabled) {
      if (!config.thresholds || typeof config.thresholds !== 'object') {
        throw new Error('Thresholds are required when alerts are enabled');
      }

      if (!config.notificationChannels || config.notificationChannels.length === 0) {
        throw new Error('At least one notification channel is required');
      }
    }
  }

  private async persistAlertConfiguration(
    organizationId: string,
    config: AlertConfiguration
  ): Promise<void> {
    // In production, persist to database table like `violation_alert_configs`
    // For now, just log the configuration
    logger.info('Alert configuration persisted', {
      organizationId,
      config: JSON.stringify(config)
    });
  }

  private async createViolationAlert(
    organizationId: string,
    policyId: string,
    context: PolicyEvaluationContext,
    blockingResult: any,
    evaluationResult: PolicyEvaluationSummary
  ): Promise<ViolationAlert | null> {
    try {
      const severity = this.determineSeverity(blockingResult);
      const riskScore = this.riskCalculator.calculateViolationRiskScore(
        severity,
        blockingResult,
        context
      );

      const alert: ViolationAlert = {
        id: this.generateAlertId(),
        policyId,
        organizationId,
        severity,
        violationType: blockingResult.ruleMatched || 'policy_violation',
        description: blockingResult.message || 'Policy violation detected',
        context,
        riskScore,
        timestamp: new Date(),
        status: 'new',
        escalationLevel: 0,
        notificationsSent: [],
        metadata: {
          evaluationResult,
          blockingResult,
          requestId: context.metadata?.requestId,
          userAgent: context.metadata?.userAgent,
          ipAddress: context.metadata?.ipAddress
        }
      };

      // Log violation to audit trail
      await this.logViolationToAudit(alert);

      return alert;

    } catch (error) {
      logger.error('Failed to create violation alert', {
        organizationId,
        policyId,
        error: error.message
      });
      return null;
    }
  }

  private async checkEscalationRules(
    organizationId: string,
    alert: ViolationAlert
  ): Promise<void> {
    const config = this.alertConfigurations.get(organizationId);
    if (!config || !config.enabled) return;

    // Count recent violations for escalation threshold checking
    const recentCount = await this.countRecentViolations(organizationId, alert.severity, 60); // 60 minutes

    for (const rule of config.escalationRules) {
      if (rule.severity === alert.severity && recentCount >= rule.threshold) {
        await this.executeEscalationAction(organizationId, alert, rule);
      }
    }
  }

  private async countRecentViolations(
    organizationId: string,
    severity: string,
    timeWindowMinutes: number
  ): Promise<number> {
    const startTime = new Date(Date.now() - timeWindowMinutes * 60 * 1000);

    return await this.prisma.auditLog.count({
      where: {
        organizationId,
        eventType: 'violation_detected',
        severity,
        eventTimestamp: { gte: startTime }
      }
    });
  }

  private async executeEscalationAction(
    organizationId: string,
    alert: ViolationAlert,
    rule: EscalationRule
  ): Promise<void> {
    logger.warn('Executing escalation action', {
      organizationId,
      alertId: alert.id,
      action: rule.action,
      severity: alert.severity
    });

    switch (rule.action) {
      case 'notify':
        await this.sendEscalationNotification(organizationId, alert, rule);
        break;
      case 'escalate':
        alert.escalationLevel += 1;
        await this.escalateToHigherLevel(organizationId, alert, rule);
        break;
      case 'block':
        await this.blockFurtherActions(organizationId, alert, rule);
        break;
    }

    this.emit('escalationTriggered', { organizationId, alert, rule });
  }

  private async sendEscalationNotification(
    organizationId: string,
    alert: ViolationAlert,
    rule: EscalationRule
  ): Promise<void> {
    // Implementation would send notifications via configured channels
    logger.info('Escalation notification sent', {
      organizationId,
      alertId: alert.id,
      recipients: rule.recipients
    });
  }

  private async escalateToHigherLevel(
    organizationId: string,
    alert: ViolationAlert,
    rule: EscalationRule
  ): Promise<void> {
    // Implementation would escalate to higher management levels
    logger.warn('Alert escalated to higher level', {
      organizationId,
      alertId: alert.id,
      escalationLevel: alert.escalationLevel
    });
  }

  private async blockFurtherActions(
    organizationId: string,
    alert: ViolationAlert,
    rule: EscalationRule
  ): Promise<void> {
    // Implementation would temporarily block certain actions
    logger.critical('Actions blocked due to violation threshold', {
      organizationId,
      alertId: alert.id,
      severity: alert.severity
    });
  }

  private async analyzeWarningPatterns(
    organizationId: string,
    policyId: string,
    context: PolicyEvaluationContext,
    warnings: any[]
  ): Promise<void> {
    // Analyze patterns in warnings that might indicate emerging risks
    const warningPattern = this.detectWarningPatterns(warnings);

    if (warningPattern.isSignificant) {
      logger.warn('Significant warning pattern detected', {
        organizationId,
        policyId,
        pattern: warningPattern,
        warningCount: warnings.length
      });

      // Could trigger preemptive alerts
      this.emit('warningPatternDetected', {
        organizationId,
        policyId,
        context,
        pattern: warningPattern
      });
    }
  }

  private detectWarningPatterns(warnings: any[]): { isSignificant: boolean; pattern: string } {
    // Simple pattern detection - could be enhanced with ML
    const warningTypes = warnings.reduce((acc, warning) => {
      acc[warning.violationType] = (acc[warning.violationType] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const maxWarningType = Object.entries(warningTypes)
      .reduce((max, [type, count]) => count > max.count ? { type, count } : max,
              { type: '', count: 0 });

    return {
      isSignificant: maxWarningType.count >= 3,
      pattern: `High frequency of ${maxWarningType.type} warnings`
    };
  }

  private async updateRiskMetrics(
    organizationId: string,
    alert: ViolationAlert
  ): Promise<void> {
    // Update organization risk metrics
    const riskMetric = {
      organizationId,
      category: 'security',
      metric: 'violation_risk_score',
      value: alert.riskScore,
      unit: 'score',
      tags: {
        policyId: alert.policyId,
        severity: alert.severity,
        violationType: alert.violationType
      },
      environment: 'production',
      timestamp: new Date()
    };

    await this.prisma.performanceMetric.create({
      data: riskMetric
    });
  }

  private determineSeverity(blockingResult: any): 'low' | 'medium' | 'high' | 'critical' {
    // Map policy violation to severity levels
    const severityMap: Record<string, 'low' | 'medium' | 'high' | 'critical'> = {
      'data_access_violation': 'high',
      'privilege_escalation': 'critical',
      'authentication_bypass': 'critical',
      'data_exfiltration': 'critical',
      'unauthorized_access': 'high',
      'policy_circumvention': 'medium',
      'compliance_violation': 'high',
      'security_policy_violation': 'high',
      'default': 'medium'
    };

    return severityMap[blockingResult.violationType] ||
           severityMap[blockingResult.ruleMatched] ||
           blockingResult.violationSeverity ||
           'medium';
  }

  private generateAlertId(): string {
    return `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private async logViolationToAudit(alert: ViolationAlert): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        eventId: alert.id,
        eventType: 'violation_detected',
        resourceType: 'policy',
        resourceId: alert.policyId,
        actorType: 'user',
        actorId: alert.context.userId,
        organizationId: alert.organizationId,
        action: 'policy_evaluation',
        outcome: 'violation',
        severity: alert.severity,
        beforeState: null,
        afterState: null,
        changes: [],
        metadata: alert.metadata,
        sessionId: alert.context.metadata?.sessionId,
        requestId: alert.context.metadata?.requestId,
        ipAddress: alert.context.metadata?.ipAddress,
        userAgent: alert.context.metadata?.userAgent,
        endpoint: alert.context.metadata?.path,
        httpMethod: alert.context.metadata?.method,
        policyId: alert.policyId,
        complianceFrameworks: [], // Would be populated from policy
        eventHash: this.calculateEventHash(alert),
        eventTimestamp: alert.timestamp
      }
    });
  }

  private calculateEventHash(alert: ViolationAlert): string {
    const crypto = require('crypto');
    const hashData = {
      alertId: alert.id,
      policyId: alert.policyId,
      timestamp: alert.timestamp.toISOString(),
      severity: alert.severity,
      organizationId: alert.organizationId
    };

    return crypto
      .createHash('sha256')
      .update(JSON.stringify(hashData))
      .digest('hex');
  }

  private mapAuditLogToViolationAlert(log: any): ViolationAlert {
    return {
      id: log.id,
      policyId: log.policyId || '',
      organizationId: log.organizationId,
      severity: log.severity,
      violationType: log.metadata?.violationType || 'policy_violation',
      description: log.metadata?.description || 'Policy violation detected',
      context: {
        userId: log.actorId || 'unknown',
        organizationId: log.organizationId,
        timestamp: log.eventTimestamp,
        userRoles: [],
        userPermissions: [],
        metadata: log.metadata || {}
      },
      riskScore: log.metadata?.riskScore || 0,
      timestamp: log.eventTimestamp,
      status: log.metadata?.status || 'new',
      escalationLevel: log.metadata?.escalationLevel || 0,
      notificationsSent: log.metadata?.notificationsSent || [],
      metadata: log.metadata || {}
    };
  }
}

/**
 * Risk Calculator for violation assessment
 */
class RiskCalculator {
  calculateViolationRiskScore(
    severity: string,
    blockingResult: any,
    context: PolicyEvaluationContext
  ): number {
    let baseScore = this.getBaseSeverityScore(severity);

    // Adjust based on context factors
    const contextMultipliers = {
      adminUser: context.userRoles?.includes('admin') ? 1.5 : 1.0,
      offHours: this.isOffHours(context.timestamp) ? 1.3 : 1.0,
      suspiciousIP: this.isSuspiciousIP(context.metadata?.ipAddress) ? 1.4 : 1.0,
      multipleViolations: 1.0 // Would be calculated based on recent history
    };

    const multiplier = Object.values(contextMultipliers)
      .reduce((acc, mult) => acc * mult, 1.0);

    return Math.min(baseScore * multiplier, 10.0); // Cap at 10.0
  }

  calculateRiskMetrics(violations: ViolationAlert[], dateRange: { start: Date; end: Date }): RiskMetrics {
    const violationCount = violations.length;
    const criticalViolations = violations.filter(v => v.severity === 'critical').length;

    const overallRiskScore = violations.reduce((sum, v) => sum + v.riskScore, 0) /
                            Math.max(violationCount, 1);

    const byFramework = violations.reduce((acc, v) => {
      // Extract framework from metadata or context
      const framework = v.metadata?.framework || 'unknown';
      acc[framework] = (acc[framework] || 0) + v.riskScore;
      return acc;
    }, {} as Record<string, number>);

    const bySeverity = violations.reduce((acc, v) => {
      acc[v.severity] = (acc[v.severity] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Simple trend calculation (would be enhanced with historical data)
    const trendDirection = this.calculateTrendDirection(violations, dateRange);

    return {
      overallRiskScore: Math.round(overallRiskScore * 100) / 100,
      trendDirection,
      byFramework,
      bySeverity,
      violationCount,
      criticalViolations
    };
  }

  private getBaseSeverityScore(severity: string): number {
    const scores = {
      'low': 2.0,
      'medium': 5.0,
      'high': 7.5,
      'critical': 9.0
    };
    return scores[severity as keyof typeof scores] || 5.0;
  }

  private isOffHours(timestamp: Date): boolean {
    const hour = timestamp.getHours();
    return hour < 8 || hour > 18; // Simple off-hours detection
  }

  private isSuspiciousIP(ipAddress?: string): boolean {
    // Placeholder for IP reputation checking
    // In production, would check against threat intelligence feeds
    return false;
  }

  private calculateTrendDirection(
    violations: ViolationAlert[],
    dateRange: { start: Date; end: Date }
  ): 'increasing' | 'decreasing' | 'stable' {
    if (violations.length < 2) return 'stable';

    const midpoint = new Date((dateRange.start.getTime() + dateRange.end.getTime()) / 2);
    const firstHalf = violations.filter(v => v.timestamp < midpoint).length;
    const secondHalf = violations.filter(v => v.timestamp >= midpoint).length;

    const changeRate = (secondHalf - firstHalf) / Math.max(firstHalf, 1);

    if (changeRate > 0.2) return 'increasing';
    if (changeRate < -0.2) return 'decreasing';
    return 'stable';
  }
}