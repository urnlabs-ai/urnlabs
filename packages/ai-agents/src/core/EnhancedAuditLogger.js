/**
 * Enhanced Audit Logger with Tamper-Proof Storage and Real-time Monitoring
 *
 * Features:
 * - Database integration with Prisma
 * - Cryptographic integrity verification
 * - Real-time monitoring and alerting
 * - Compliance framework support
 * - Searchable analytics
 * - Incident response integration
 */

import { v4 as uuidv4 } from 'uuid';
import * as winston from 'winston';
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import { EventEmitter } from 'events';

export class EnhancedAuditLogger extends EventEmitter {
    constructor(options = {}) {
        super();

        this.prisma = options.prisma || new PrismaClient();
        this.redis = options.redis || new Redis(process.env.REDIS_URL);
        this.config = {
            bufferSize: options.bufferSize || 1000,
            flushInterval: options.flushInterval || 30000, // 30 seconds
            integrityCheckInterval: options.integrityCheckInterval || 300000, // 5 minutes
            alertThresholds: {
                criticalEvents: 5, // Alert if >5 critical events in 5 minutes
                failureRate: 0.1, // Alert if >10% failure rate
                suspiciousActivity: 10 // Alert if >10 events from same actor in 1 minute
            },
            ...options.config
        };

        this.isInitialized = false;
        this.buffer = [];
        this.lastEventHash = null;
        this.integrityChainValid = true;

        this.setupLogger();
        this.setupRetentionPolicies();
    }

    /**
     * Initialize the enhanced audit logger
     */
    async initialize() {
        if (this.isInitialized) return;

        try {
            // Load last event hash for integrity chain
            await this.loadLastEventHash();

            // Start buffer flush interval
            this.flushIntervalId = setInterval(() => this.flushBuffer(), this.config.flushInterval);

            // Start integrity check interval
            this.integrityIntervalId = setInterval(() => this.performIntegrityCheck(), this.config.integrityCheckInterval);

            // Set up real-time monitoring
            await this.setupRealtimeMonitoring();

            this.isInitialized = true;

            await this.logSystemEvent('audit_logger_initialized', {
                bufferSize: this.config.bufferSize,
                flushInterval: this.config.flushInterval,
                integrityChainValid: this.integrityChainValid
            });

        } catch (error) {
            throw new Error(`Failed to initialize EnhancedAuditLogger: ${error.message}`);
        }
    }

    /**
     * Enhanced audit logging with database persistence and integrity verification
     */
    async log(entry) {
        const auditEntry = await this.prepareAuditEntry(entry);

        // Add to buffer for batch processing
        this.buffer.push(auditEntry);

        // Emit real-time event for monitoring
        this.emit('auditEvent', auditEntry);

        // Check for immediate action triggers
        await this.checkRealTimeAlerts(auditEntry);

        // Immediate flush for critical entries
        if (auditEntry.severity === 'critical' || auditEntry.outcome === 'failure') {
            await this.flushBuffer();
        }

        // Flush if buffer is full
        if (this.buffer.length >= this.config.bufferSize) {
            await this.flushBuffer();
        }

        return auditEntry.eventId;
    }

    /**
     * Prepare audit entry with cryptographic integrity
     */
    async prepareAuditEntry(entry) {
        const eventId = uuidv4();
        const timestamp = new Date();

        const auditEntry = {
            eventId,
            eventType: entry.eventType || 'generic',
            resourceType: entry.resourceType || 'unknown',
            resourceId: entry.resourceId,

            // Actor information
            actorType: entry.actorType || 'system',
            actorId: entry.actorId,
            organizationId: entry.organizationId,

            // Event details
            action: entry.action,
            outcome: entry.outcome || 'success',
            severity: entry.severity || 'info',

            // Data and context
            beforeState: entry.beforeState || null,
            afterState: entry.afterState || null,
            changes: entry.changes || [],
            metadata: {
                ...entry.metadata,
                timestamp: timestamp.toISOString(),
                version: '1.0'
            },

            // Request context
            sessionId: entry.sessionId,
            requestId: entry.requestId,
            ipAddress: entry.ipAddress,
            userAgent: entry.userAgent,
            endpoint: entry.endpoint,
            httpMethod: entry.httpMethod,

            // Policy context
            policyId: entry.policyId,
            policyVersion: entry.policyVersion,
            complianceFrameworks: entry.complianceFrameworks || this.getApplicableFrameworks(entry.action),

            // Timestamps
            eventTimestamp: timestamp,
            ingestedAt: timestamp
        };

        // Generate cryptographic hash for integrity
        const eventData = this.createHashableData(auditEntry);
        auditEntry.eventHash = this.generateEventHash(eventData);
        auditEntry.previousHash = this.lastEventHash;

        // Update last event hash for chain integrity
        this.lastEventHash = auditEntry.eventHash;

        return auditEntry;
    }

    /**
     * Create hashable data for cryptographic integrity
     */
    createHashableData(entry) {
        return {
            eventId: entry.eventId,
            eventType: entry.eventType,
            action: entry.action,
            actorId: entry.actorId,
            resourceType: entry.resourceType,
            resourceId: entry.resourceId,
            outcome: entry.outcome,
            severity: entry.severity,
            eventTimestamp: entry.eventTimestamp.toISOString(),
            beforeState: entry.beforeState,
            afterState: entry.afterState,
            changes: entry.changes,
            previousHash: entry.previousHash
        };
    }

    /**
     * Generate SHA-256 hash for event integrity
     */
    generateEventHash(data) {
        const dataString = JSON.stringify(data, Object.keys(data).sort());
        return crypto.createHash('sha256').update(dataString).digest('hex');
    }

    /**
     * Flush buffer to database with transaction safety
     */
    async flushBuffer() {
        if (this.buffer.length === 0) return;

        const entries = [...this.buffer];
        this.buffer = [];

        try {
            // Use database transaction for consistency
            await this.prisma.$transaction(async (tx) => {
                for (const entry of entries) {
                    await tx.auditLog.create({
                        data: {
                            ...entry,
                            metadata: entry.metadata,
                            changes: entry.changes,
                            complianceFrameworks: entry.complianceFrameworks
                        }
                    });
                }
            });

            // Update Redis cache for recent logs
            await this.updateRecentLogsCache(entries);

        } catch (error) {
            // Restore buffer on failure
            this.buffer.unshift(...entries);
            this.logger.error('Failed to flush audit buffer', { error: error.message, bufferSize: entries.length });
            throw error;
        }
    }

    /**
     * Update Redis cache for real-time access to recent logs
     */
    async updateRecentLogsCache(entries) {
        const pipeline = this.redis.pipeline();

        for (const entry of entries) {
            // Store recent logs by organization
            if (entry.organizationId) {
                pipeline.lpush(`audit:recent:${entry.organizationId}`, JSON.stringify(entry));
                pipeline.ltrim(`audit:recent:${entry.organizationId}`, 0, 999); // Keep last 1000
                pipeline.expire(`audit:recent:${entry.organizationId}`, 3600); // 1 hour TTL
            }

            // Store by severity for alerting
            pipeline.lpush(`audit:${entry.severity}`, JSON.stringify(entry));
            pipeline.ltrim(`audit:${entry.severity}`, 0, 99); // Keep last 100
            pipeline.expire(`audit:${entry.severity}`, 1800); // 30 minutes TTL

            // Store by actor for suspicious activity detection
            if (entry.actorId) {
                const key = `audit:actor:${entry.actorId}`;
                pipeline.lpush(key, JSON.stringify(entry));
                pipeline.ltrim(key, 0, 49); // Keep last 50
                pipeline.expire(key, 300); // 5 minutes TTL
            }
        }

        await pipeline.exec();
    }

    /**
     * Real-time alert checking
     */
    async checkRealTimeAlerts(entry) {
        // Check for critical events threshold
        if (entry.severity === 'critical') {
            const criticalCount = await this.redis.llen('audit:critical');
            if (criticalCount >= this.config.alertThresholds.criticalEvents) {
                await this.triggerAlert('critical_events_threshold', {
                    count: criticalCount,
                    threshold: this.config.alertThresholds.criticalEvents,
                    latestEvent: entry
                });
            }
        }

        // Check for suspicious activity from same actor
        if (entry.actorId) {
            const actorEventCount = await this.redis.llen(`audit:actor:${entry.actorId}`);
            if (actorEventCount >= this.config.alertThresholds.suspiciousActivity) {
                await this.triggerAlert('suspicious_activity', {
                    actorId: entry.actorId,
                    eventCount: actorEventCount,
                    threshold: this.config.alertThresholds.suspiciousActivity
                });
            }
        }

        // Check for failure rate threshold
        if (entry.outcome === 'failure') {
            await this.checkFailureRateThreshold(entry);
        }
    }

    /**
     * Check failure rate threshold
     */
    async checkFailureRateThreshold(entry) {
        const window = 300; // 5 minutes
        const now = Math.floor(Date.now() / 1000);
        const windowStart = now - window;

        // Get recent events from database
        const recentEvents = await this.prisma.auditLog.findMany({
            where: {
                eventTimestamp: {
                    gte: new Date(windowStart * 1000)
                },
                organizationId: entry.organizationId
            },
            select: {
                outcome: true
            }
        });

        if (recentEvents.length > 10) { // Only check if we have enough data
            const failureCount = recentEvents.filter(e => e.outcome === 'failure').length;
            const failureRate = failureCount / recentEvents.length;

            if (failureRate >= this.config.alertThresholds.failureRate) {
                await this.triggerAlert('high_failure_rate', {
                    failureRate: Math.round(failureRate * 100),
                    threshold: Math.round(this.config.alertThresholds.failureRate * 100),
                    totalEvents: recentEvents.length,
                    failureCount
                });
            }
        }
    }

    /**
     * Trigger security/compliance alert
     */
    async triggerAlert(alertType, details) {
        const alert = {
            id: uuidv4(),
            type: alertType,
            severity: this.getAlertSeverity(alertType),
            timestamp: new Date(),
            details
        };

        // Store alert in database
        await this.prisma.alert.create({
            data: {
                title: this.getAlertTitle(alertType),
                description: this.getAlertDescription(alertType, details),
                severity: alert.severity,
                type: 'security',
                conditions: details,
                actions: {}
            }
        });

        // Emit alert for real-time processing
        this.emit('securityAlert', alert);

        // Log the alert as an audit event
        await this.logSystemEvent('security_alert_triggered', {
            alertType,
            alertId: alert.id,
            severity: alert.severity,
            details
        });
    }

    /**
     * Perform periodic integrity check
     */
    async performIntegrityCheck() {
        try {
            const batchSize = 1000;
            let offset = 0;
            let hasMore = true;
            let integrityValid = true;

            while (hasMore) {
                const logs = await this.prisma.auditLog.findMany({
                    skip: offset,
                    take: batchSize,
                    orderBy: { eventTimestamp: 'asc' },
                    select: {
                        eventId: true,
                        eventHash: true,
                        previousHash: true,
                        eventType: true,
                        action: true,
                        actorId: true,
                        resourceType: true,
                        resourceId: true,
                        outcome: true,
                        severity: true,
                        eventTimestamp: true,
                        beforeState: true,
                        afterState: true,
                        changes: true
                    }
                });

                if (logs.length === 0) {
                    hasMore = false;
                    break;
                }

                // Verify hash integrity for each log
                for (let i = 0; i < logs.length; i++) {
                    const log = logs[i];
                    const expectedHash = this.generateEventHash(this.createHashableData(log));

                    if (log.eventHash !== expectedHash) {
                        integrityValid = false;
                        await this.triggerAlert('integrity_violation', {
                            eventId: log.eventId,
                            expectedHash,
                            actualHash: log.eventHash,
                            timestamp: log.eventTimestamp
                        });
                    }

                    // Verify chain integrity
                    if (i > 0 && log.previousHash !== logs[i-1].eventHash) {
                        integrityValid = false;
                        await this.triggerAlert('chain_integrity_violation', {
                            eventId: log.eventId,
                            expectedPreviousHash: logs[i-1].eventHash,
                            actualPreviousHash: log.previousHash,
                            timestamp: log.eventTimestamp
                        });
                    }
                }

                offset += batchSize;
            }

            this.integrityChainValid = integrityValid;

            if (!integrityValid) {
                await this.logSystemEvent('integrity_check_failed', {
                    timestamp: new Date(),
                    batchesChecked: Math.ceil(offset / batchSize)
                });
            }

        } catch (error) {
            this.logger.error('Integrity check failed', { error: error.message });
            await this.triggerAlert('integrity_check_error', {
                error: error.message,
                timestamp: new Date()
            });
        }
    }

    /**
     * Advanced query capabilities for audit logs
     */
    async query(queryOptions = {}) {
        const {
            startDate,
            endDate,
            eventTypes = [],
            outcomes = [],
            severities = [],
            actorIds = [],
            resourceTypes = [],
            organizationId,
            complianceFrameworks = [],
            searchText,
            limit = 100,
            offset = 0,
            orderBy = 'eventTimestamp',
            orderDirection = 'desc'
        } = queryOptions;

        const where = {};

        // Date range filter
        if (startDate || endDate) {
            where.eventTimestamp = {};
            if (startDate) where.eventTimestamp.gte = new Date(startDate);
            if (endDate) where.eventTimestamp.lte = new Date(endDate);
        }

        // Multi-value filters
        if (eventTypes.length > 0) where.eventType = { in: eventTypes };
        if (outcomes.length > 0) where.outcome = { in: outcomes };
        if (severities.length > 0) where.severity = { in: severities };
        if (actorIds.length > 0) where.actorId = { in: actorIds };
        if (resourceTypes.length > 0) where.resourceType = { in: resourceTypes };

        // Organization filter
        if (organizationId) where.organizationId = organizationId;

        // Compliance framework filter
        if (complianceFrameworks.length > 0) {
            where.complianceFrameworks = {
                hasSome: complianceFrameworks
            };
        }

        // Text search in action and metadata
        if (searchText) {
            where.OR = [
                { action: { contains: searchText, mode: 'insensitive' } },
                { metadata: { path: ['searchableText'], string_contains: searchText } }
            ];
        }

        const [logs, total] = await Promise.all([
            this.prisma.auditLog.findMany({
                where,
                orderBy: { [orderBy]: orderDirection },
                skip: offset,
                take: limit,
                include: {
                    organization: {
                        select: { name: true }
                    },
                    policy: {
                        select: { name: true, version: true }
                    }
                }
            }),
            this.prisma.auditLog.count({ where })
        ]);

        return {
            logs,
            total,
            hasMore: offset + limit < total,
            pagination: {
                offset,
                limit,
                total
            }
        };
    }

    /**
     * Generate comprehensive compliance report
     */
    async generateComplianceReport(framework, startDate, endDate, organizationId = null) {
        const query = {
            startDate,
            endDate,
            complianceFrameworks: [framework],
            organizationId
        };

        const results = await this.query(query);

        // Calculate comprehensive metrics
        const metrics = {
            totalEvents: results.total,
            riskDistribution: this.calculateRiskDistribution(results.logs),
            outcomeDistribution: this.calculateOutcomeDistribution(results.logs),
            timelineAnalysis: this.calculateTimelineAnalysis(results.logs),
            topActors: this.getTopActors(results.logs),
            criticalEvents: results.logs.filter(e => e.severity === 'critical'),
            failedEvents: results.logs.filter(e => e.outcome === 'failure'),
            complianceScore: this.calculateComplianceScore(results.logs),
            recommendations: this.generateRecommendations(results.logs, framework)
        };

        return {
            framework,
            period: { start: startDate, end: endDate },
            organizationId,
            generatedAt: new Date(),
            integrityStatus: this.integrityChainValid,
            ...metrics
        };
    }

    /**
     * Helper methods for compliance calculations
     */
    calculateTimelineAnalysis(logs) {
        const timeline = {};
        logs.forEach(log => {
            const date = log.eventTimestamp.toISOString().split('T')[0];
            if (!timeline[date]) {
                timeline[date] = { total: 0, failures: 0, critical: 0 };
            }
            timeline[date].total++;
            if (log.outcome === 'failure') timeline[date].failures++;
            if (log.severity === 'critical') timeline[date].critical++;
        });
        return timeline;
    }

    getAlertSeverity(alertType) {
        const severityMap = {
            'critical_events_threshold': 'critical',
            'suspicious_activity': 'warning',
            'high_failure_rate': 'error',
            'integrity_violation': 'critical',
            'chain_integrity_violation': 'critical',
            'integrity_check_error': 'error'
        };
        return severityMap[alertType] || 'warning';
    }

    getAlertTitle(alertType) {
        const titleMap = {
            'critical_events_threshold': 'Critical Events Threshold Exceeded',
            'suspicious_activity': 'Suspicious Activity Detected',
            'high_failure_rate': 'High Failure Rate Detected',
            'integrity_violation': 'Audit Log Integrity Violation',
            'chain_integrity_violation': 'Audit Chain Integrity Violation',
            'integrity_check_error': 'Integrity Check Error'
        };
        return titleMap[alertType] || 'Security Alert';
    }

    getAlertDescription(alertType, details) {
        switch (alertType) {
            case 'critical_events_threshold':
                return `${details.count} critical events detected, exceeding threshold of ${details.threshold}`;
            case 'suspicious_activity':
                return `Actor ${details.actorId} generated ${details.eventCount} events, exceeding threshold of ${details.threshold}`;
            case 'high_failure_rate':
                return `Failure rate of ${details.failureRate}% exceeds threshold of ${details.threshold}%`;
            case 'integrity_violation':
                return `Hash mismatch detected for event ${details.eventId}`;
            case 'chain_integrity_violation':
                return `Chain integrity violation detected for event ${details.eventId}`;
            default:
                return 'Security alert triggered';
        }
    }

    /**
     * System event logging
     */
    async logSystemEvent(action, details) {
        return this.log({
            eventType: 'system',
            resourceType: 'audit_system',
            actorType: 'system',
            actorId: 'audit_logger',
            action,
            outcome: 'success',
            severity: 'info',
            metadata: details
        });
    }

    /**
     * Load last event hash for integrity chain
     */
    async loadLastEventHash() {
        const lastEvent = await this.prisma.auditLog.findFirst({
            orderBy: { eventTimestamp: 'desc' },
            select: { eventHash: true }
        });

        this.lastEventHash = lastEvent?.eventHash || null;
    }

    /**
     * Setup real-time monitoring
     */
    async setupRealtimeMonitoring() {
        // Subscribe to Redis events for distributed monitoring
        const subscriber = this.redis.duplicate();

        subscriber.subscribe('audit:alerts', (err, count) => {
            if (err) {
                this.logger.error('Failed to subscribe to audit alerts', { error: err.message });
            } else {
                this.logger.info(`Subscribed to ${count} audit alert channels`);
            }
        });

        subscriber.on('message', (channel, message) => {
            if (channel === 'audit:alerts') {
                const alert = JSON.parse(message);
                this.emit('distributedAlert', alert);
            }
        });
    }

    /**
     * Cleanup resources
     */
    async shutdown() {
        if (this.flushIntervalId) {
            clearInterval(this.flushIntervalId);
        }

        if (this.integrityIntervalId) {
            clearInterval(this.integrityIntervalId);
        }

        // Flush remaining buffer
        await this.flushBuffer();

        // Close connections
        await this.redis.quit();
        await this.prisma.$disconnect();

        this.isInitialized = false;
    }

    // Include existing helper methods from original AuditLogger
    setupLogger() {
        this.logger = winston.createLogger({
            level: 'info',
            format: winston.format.combine(
                winston.format.timestamp(),
                winston.format.errors({ stack: true }),
                winston.format.json()
            ),
            transports: [
                new winston.transports.File({
                    filename: 'logs/audit-error.log',
                    level: 'error',
                    maxsize: 100 * 1024 * 1024, // 100MB
                    maxFiles: 10
                }),
                new winston.transports.File({
                    filename: 'logs/audit.log',
                    maxsize: 100 * 1024 * 1024, // 100MB
                    maxFiles: 30
                })
            ]
        });

        if (process.env.NODE_ENV !== 'production') {
            this.logger.add(new winston.transports.Console({
                format: winston.format.simple()
            }));
        }
    }

    setupRetentionPolicies() {
        this.retentionPolicies = new Map([
            ['SOX', 2555], // 7 years
            ['GDPR', 2190], // 6 years
            ['HIPAA', 2190], // 6 years
            ['PCI', 365], // 1 year
            ['default', 2555] // 7 years default
        ]);
    }

    getApplicableFrameworks(action) {
        const frameworks = [];
        if (action.includes('security') || action.includes('auth') || action.includes('permission')) {
            frameworks.push('SOX', 'PCI');
        }
        if (action.includes('data') || action.includes('privacy') || action.includes('gdpr')) {
            frameworks.push('GDPR');
        }
        if (action.includes('health') || action.includes('medical') || action.includes('phi')) {
            frameworks.push('HIPAA');
        }
        return frameworks.length > 0 ? frameworks : ['SOX'];
    }

    calculateRiskDistribution(logs) {
        const distribution = { info: 0, warning: 0, error: 0, critical: 0 };
        logs.forEach(log => {
            distribution[log.severity]++;
        });
        return distribution;
    }

    calculateOutcomeDistribution(logs) {
        const distribution = { success: 0, failure: 0, pending: 0, partial: 0 };
        logs.forEach(log => {
            distribution[log.outcome]++;
        });
        return distribution;
    }

    getTopActors(logs) {
        const actorCounts = {};
        logs.forEach(log => {
            const key = `${log.actorType}:${log.actorId}`;
            actorCounts[key] = (actorCounts[key] || 0) + 1;
        });
        return Object.entries(actorCounts)
            .map(([actor, eventCount]) => ({ actor, eventCount }))
            .sort((a, b) => b.eventCount - a.eventCount)
            .slice(0, 10);
    }

    calculateComplianceScore(logs) {
        if (logs.length === 0) return 100;

        const failureCount = logs.filter(e => e.outcome === 'failure').length;
        const criticalCount = logs.filter(e => e.severity === 'critical').length;

        const failureScore = Math.max(0, 100 - (failureCount / logs.length) * 50);
        const criticalScore = Math.max(0, 100 - (criticalCount / logs.length) * 100);

        return Math.round((failureScore + criticalScore) / 2);
    }

    generateRecommendations(logs, framework) {
        const recommendations = [];

        const failureCount = logs.filter(e => e.outcome === 'failure').length;
        const criticalCount = logs.filter(e => e.severity === 'critical').length;

        if (failureCount > logs.length * 0.05) {
            recommendations.push('High failure rate detected. Review and strengthen error handling procedures.');
        }

        if (criticalCount > 0) {
            recommendations.push('Critical security events detected. Conduct immediate security review.');
        }

        if (framework === 'GDPR') {
            const dataProcessing = logs.filter(e => e.action.includes('data')).length;
            if (dataProcessing > 0) {
                recommendations.push('Ensure all data processing activities have proper consent and legal basis.');
            }
        }

        return recommendations;
    }
}