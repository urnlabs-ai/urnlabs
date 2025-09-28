import { v4 as uuidv4 } from 'uuid';
import type {
  SecurityEvent,
  SecurityEventType,
  SecurityEventSeverity
} from '../types/auth.js';
import { logger } from '../lib/logger.js';

export interface SecurityEventInput {
  userId?: string;
  sessionId?: string;
  eventType: SecurityEventType;
  description: string;
  severity: SecurityEventSeverity;
  ipAddress: string;
  userAgent: string;
  metadata?: Record<string, any>;
}

export interface AuditLogQuery {
  userId?: string;
  sessionId?: string;
  eventType?: SecurityEventType;
  severity?: SecurityEventSeverity;
  startDate?: Date;
  endDate?: Date;
  ipAddress?: string;
  limit?: number;
  offset?: number;
}

export class SecurityEventService {
  constructor() {}

  /**
   * Log a security event with tamper-proof storage
   */
  async logSecurityEvent(event: SecurityEventInput): Promise<SecurityEvent> {
    try {
      const securityEvent: SecurityEvent = {
        id: uuidv4(),
        userId: event.userId,
        sessionId: event.sessionId,
        eventType: event.eventType,
        description: event.description,
        severity: event.severity,
        ipAddress: event.ipAddress,
        userAgent: event.userAgent,
        metadata: event.metadata || {},
        createdAt: new Date()
      };

      // Store in database with cryptographic signature for tamper detection
      await this.storeSecurityEvent(securityEvent);

      // Log to application logs for immediate visibility
      const logLevel = this.getLogLevel(event.severity);
      logger[logLevel]('Security event logged', {
        eventId: securityEvent.id,
        eventType: event.eventType,
        severity: event.severity,
        userId: event.userId,
        sessionId: event.sessionId,
        ipAddress: event.ipAddress,
        description: event.description,
        metadata: event.metadata
      });

      // Send alerts for critical events
      if (event.severity === SecurityEventSeverity.CRITICAL || 
          event.severity === SecurityEventSeverity.HIGH) {
        await this.sendSecurityAlert(securityEvent);
      }

      return securityEvent;
    } catch (error) {
      logger.error('Failed to log security event', { error, event });
      throw new Error('Security event logging failed');
    }
  }

  /**
   * Retrieve security events with filtering
   */
  async getSecurityEvents(query: AuditLogQuery): Promise<{
    events: SecurityEvent[];
    total: number;
    hasMore: boolean;
  }> {
    try {
      const { events, total } = await this.querySecurityEvents(query);
      const limit = query.limit || 50;
      const offset = query.offset || 0;
      
      return {
        events,
        total,
        hasMore: offset + events.length < total
      };
    } catch (error) {
      logger.error('Failed to retrieve security events', { error, query });
      throw new Error('Security event retrieval failed');
    }
  }

  /**
   * Get security event statistics
   */
  async getSecurityEventStats(timeframe: {
    startDate: Date;
    endDate: Date;
  }): Promise<{
    totalEvents: number;
    eventsByType: Record<SecurityEventType, number>;
    eventsBySeverity: Record<SecurityEventSeverity, number>;
    topUsers: Array<{ userId: string; eventCount: number }>;
    topIpAddresses: Array<{ ipAddress: string; eventCount: number }>;
  }> {
    try {
      const events = await this.querySecurityEvents({
        startDate: timeframe.startDate,
        endDate: timeframe.endDate,
        limit: 10000 // Large limit for stats
      });

      const stats = {
        totalEvents: events.total,
        eventsByType: {} as Record<SecurityEventType, number>,
        eventsBySeverity: {} as Record<SecurityEventSeverity, number>,
        topUsers: [] as Array<{ userId: string; eventCount: number }>,
        topIpAddresses: [] as Array<{ ipAddress: string; eventCount: number }>
      };

      // Initialize counters
      Object.values(SecurityEventType).forEach(type => {
        stats.eventsByType[type] = 0;
      });
      Object.values(SecurityEventSeverity).forEach(severity => {
        stats.eventsBySeverity[severity] = 0;
      });

      const userCounts = new Map<string, number>();
      const ipCounts = new Map<string, number>();

      // Process events
      events.events.forEach(event => {
        stats.eventsByType[event.eventType]++;
        stats.eventsBySeverity[event.severity]++;

        if (event.userId) {
          userCounts.set(event.userId, (userCounts.get(event.userId) || 0) + 1);
        }
        ipCounts.set(event.ipAddress, (ipCounts.get(event.ipAddress) || 0) + 1);
      });

      // Get top users and IPs
      stats.topUsers = Array.from(userCounts.entries())
        .map(([userId, eventCount]) => ({ userId, eventCount }))
        .sort((a, b) => b.eventCount - a.eventCount)
        .slice(0, 10);

      stats.topIpAddresses = Array.from(ipCounts.entries())
        .map(([ipAddress, eventCount]) => ({ ipAddress, eventCount }))
        .sort((a, b) => b.eventCount - a.eventCount)
        .slice(0, 10);

      return stats;
    } catch (error) {
      logger.error('Failed to get security event stats', { error, timeframe });
      throw new Error('Security event stats retrieval failed');
    }
  }

  /**
   * Generate compliance report
   */
  async generateComplianceReport(timeframe: {
    startDate: Date;
    endDate: Date;
  }): Promise<{
    reportId: string;
    timeframe: { startDate: Date; endDate: Date };
    summary: {
      totalEvents: number;
      criticalEvents: number;
      failedLoginAttempts: number;
      suspiciousActivities: number;
      accountLockouts: number;
    };
    events: SecurityEvent[];
    generatedAt: Date;
  }> {
    try {
      const reportId = uuidv4();
      const events = await this.querySecurityEvents({
        startDate: timeframe.startDate,
        endDate: timeframe.endDate,
        limit: 10000
      });

      const summary = {
        totalEvents: events.total,
        criticalEvents: events.events.filter(e => e.severity === SecurityEventSeverity.CRITICAL).length,
        failedLoginAttempts: events.events.filter(e => e.eventType === SecurityEventType.LOGIN_FAILED).length,
        suspiciousActivities: events.events.filter(e => e.eventType === SecurityEventType.SUSPICIOUS_ACTIVITY).length,
        accountLockouts: events.events.filter(e => e.eventType === SecurityEventType.ACCOUNT_LOCKED).length
      };

      const report = {
        reportId,
        timeframe,
        summary,
        events: events.events,
        generatedAt: new Date()
      };

      // Store report for future reference
      await this.storeComplianceReport(report);

      logger.info('Compliance report generated', {
        reportId,
        timeframe,
        totalEvents: summary.totalEvents,
        criticalEvents: summary.criticalEvents
      });

      return report;
    } catch (error) {
      logger.error('Failed to generate compliance report', { error, timeframe });
      throw new Error('Compliance report generation failed');
    }
  }

  /**
   * Detect suspicious activity patterns
   */
  async detectSuspiciousActivity(): Promise<{
    suspiciousUsers: Array<{
      userId: string;
      riskScore: number;
      reasons: string[];
      recentEvents: SecurityEvent[];
    }>;
    suspiciousIpAddresses: Array<{
      ipAddress: string;
      riskScore: number;
      reasons: string[];
      recentEvents: SecurityEvent[];
    }>;
  }> {
    try {
      const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const events = await this.querySecurityEvents({
        startDate: last24Hours,
        endDate: new Date(),
        limit: 10000
      });

      const suspiciousUsers: Array<{
        userId: string;
        riskScore: number;
        reasons: string[];
        recentEvents: SecurityEvent[];
      }> = [];

      const suspiciousIpAddresses: Array<{
        ipAddress: string;
        riskScore: number;
        reasons: string[];
        recentEvents: SecurityEvent[];
      }> = [];

      // Group events by user and IP
      const userEvents = new Map<string, SecurityEvent[]>();
      const ipEvents = new Map<string, SecurityEvent[]>();

      events.events.forEach(event => {
        if (event.userId) {
          if (!userEvents.has(event.userId)) {
            userEvents.set(event.userId, []);
          }
          userEvents.get(event.userId)!.push(event);
        }

        if (!ipEvents.has(event.ipAddress)) {
          ipEvents.set(event.ipAddress, []);
        }
        ipEvents.get(event.ipAddress)!.push(event);
      });

      // Analyze users for suspicious patterns
      userEvents.forEach((userEventList, userId) => {
        const analysis = this.analyzeUserActivity(userEventList);
        if (analysis.riskScore > 50) {
          suspiciousUsers.push({
            userId,
            riskScore: analysis.riskScore,
            reasons: analysis.reasons,
            recentEvents: userEventList.slice(-10) // Last 10 events
          });
        }
      });

      // Analyze IPs for suspicious patterns
      ipEvents.forEach((ipEventList, ipAddress) => {
        const analysis = this.analyzeIpActivity(ipEventList);
        if (analysis.riskScore > 50) {
          suspiciousIpAddresses.push({
            ipAddress,
            riskScore: analysis.riskScore,
            reasons: analysis.reasons,
            recentEvents: ipEventList.slice(-10)
          });
        }
      });

      // Sort by risk score
      suspiciousUsers.sort((a, b) => b.riskScore - a.riskScore);
      suspiciousIpAddresses.sort((a, b) => b.riskScore - a.riskScore);

      return {
        suspiciousUsers: suspiciousUsers.slice(0, 20), // Top 20
        suspiciousIpAddresses: suspiciousIpAddresses.slice(0, 20)
      };
    } catch (error) {
      logger.error('Failed to detect suspicious activity', { error });
      throw new Error('Suspicious activity detection failed');
    }
  }

  /**
   * Archive old security events
   */
  async archiveOldEvents(olderThan: Date): Promise<{
    archivedCount: number;
    archiveLocation: string;
  }> {
    try {
      const eventsToArchive = await this.querySecurityEvents({
        endDate: olderThan,
        limit: 100000
      });

      const archiveLocation = `security-events-archive-${Date.now()}.json`;
      await this.archiveEvents(eventsToArchive.events, archiveLocation);
      await this.deleteArchivedEvents(eventsToArchive.events.map(e => e.id));

      logger.info('Security events archived', {
        archivedCount: eventsToArchive.events.length,
        archiveLocation,
        olderThan
      });

      return {
        archivedCount: eventsToArchive.events.length,
        archiveLocation
      };
    } catch (error) {
      logger.error('Failed to archive security events', { error, olderThan });
      throw new Error('Security event archival failed');
    }
  }

  /**
   * Get appropriate log level for severity
   */
  private getLogLevel(severity: SecurityEventSeverity): 'debug' | 'info' | 'warn' | 'error' {
    switch (severity) {
      case SecurityEventSeverity.LOW:
        return 'info';
      case SecurityEventSeverity.MEDIUM:
        return 'warn';
      case SecurityEventSeverity.HIGH:
      case SecurityEventSeverity.CRITICAL:
        return 'error';
      default:
        return 'info';
    }
  }

  /**
   * Analyze user activity for suspicious patterns
   */
  private analyzeUserActivity(events: SecurityEvent[]): {
    riskScore: number;
    reasons: string[];
  } {
    let riskScore = 0;
    const reasons: string[] = [];

    // Multiple failed login attempts
    const failedLogins = events.filter(e => e.eventType === SecurityEventType.LOGIN_FAILED);
    if (failedLogins.length > 5) {
      riskScore += 30;
      reasons.push(`${failedLogins.length} failed login attempts`);
    }

    // Multiple IP addresses
    const uniqueIps = new Set(events.map(e => e.ipAddress));
    if (uniqueIps.size > 3) {
      riskScore += 20;
      reasons.push(`Access from ${uniqueIps.size} different IP addresses`);
    }

    // High-severity events
    const criticalEvents = events.filter(e => e.severity === SecurityEventSeverity.CRITICAL);
    if (criticalEvents.length > 0) {
      riskScore += 40;
      reasons.push(`${criticalEvents.length} critical security events`);
    }

    // Suspicious activity events
    const suspiciousEvents = events.filter(e => e.eventType === SecurityEventType.SUSPICIOUS_ACTIVITY);
    if (suspiciousEvents.length > 0) {
      riskScore += 35;
      reasons.push(`${suspiciousEvents.length} suspicious activity events`);
    }

    return { riskScore: Math.min(riskScore, 100), reasons };
  }

  /**
   * Analyze IP activity for suspicious patterns
   */
  private analyzeIpActivity(events: SecurityEvent[]): {
    riskScore: number;
    reasons: string[];
  } {
    let riskScore = 0;
    const reasons: string[] = [];

    // Multiple users from same IP
    const uniqueUsers = new Set(events.filter(e => e.userId).map(e => e.userId));
    if (uniqueUsers.size > 5) {
      riskScore += 25;
      reasons.push(`${uniqueUsers.size} different users from same IP`);
    }

    // High volume of events
    if (events.length > 100) {
      riskScore += 30;
      reasons.push(`${events.length} events in 24 hours`);
    }

    // Multiple failed logins
    const failedLogins = events.filter(e => e.eventType === SecurityEventType.LOGIN_FAILED);
    if (failedLogins.length > 10) {
      riskScore += 35;
      reasons.push(`${failedLogins.length} failed login attempts`);
    }

    return { riskScore: Math.min(riskScore, 100), reasons };
  }

  // Database and storage methods (to be implemented with actual database)
  private async storeSecurityEvent(event: SecurityEvent): Promise<void> {
    // TODO: Implement database storage with cryptographic signature
    throw new Error('Not implemented');
  }

  private async querySecurityEvents(query: AuditLogQuery): Promise<{
    events: SecurityEvent[];
    total: number;
  }> {
    // TODO: Implement database query
    throw new Error('Not implemented');
  }

  private async sendSecurityAlert(event: SecurityEvent): Promise<void> {
    // TODO: Implement alert sending (email, Slack, etc.)
    logger.warn('Security alert would be sent', { event });
  }

  private async storeComplianceReport(report: any): Promise<void> {
    // TODO: Implement report storage
    throw new Error('Not implemented');
  }

  private async archiveEvents(events: SecurityEvent[], location: string): Promise<void> {
    // TODO: Implement event archival
    throw new Error('Not implemented');
  }

  private async deleteArchivedEvents(eventIds: string[]): Promise<void> {
    // TODO: Implement event deletion
    throw new Error('Not implemented');
  }
}