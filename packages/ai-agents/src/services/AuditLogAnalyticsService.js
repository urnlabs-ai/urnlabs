/**
 * Audit Log Analytics Service
 *
 * Provides advanced search, analytics, and reporting capabilities for audit logs
 * Features:
 * - Full-text search with Elasticsearch-style queries
 * - Real-time analytics and aggregations
 * - Compliance reporting and dashboards
 * - Anomaly detection and pattern analysis
 * - Export capabilities for various formats
 */

import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import { EventEmitter } from 'events';

export class AuditLogAnalyticsService extends EventEmitter {
    constructor(options = {}) {
        super();

        this.prisma = options.prisma || new PrismaClient();
        this.redis = options.redis || new Redis(process.env.REDIS_URL);
        this.config = {
            // Cache settings
            cachePrefix: 'audit:analytics',
            cacheTTL: 300, // 5 minutes

            // Search settings
            maxSearchResults: 10000,
            defaultPageSize: 50,

            // Analytics settings
            anomalyThresholds: {
                unusualActivity: 2.0, // Standard deviations
                burstDetection: 5.0,  // Events per minute threshold
                patternDeviation: 1.5
            },

            ...options.config
        };

        this.isInitialized = false;
    }

    /**
     * Initialize the analytics service
     */
    async initialize() {
        if (this.isInitialized) return;

        try {
            // Set up real-time data pipelines
            await this.setupRealTimeIndexing();

            // Initialize analytics caches
            await this.initializeAnalyticsCaches();

            this.isInitialized = true;
            this.emit('initialized');

        } catch (error) {
            throw new Error(`Failed to initialize AuditLogAnalyticsService: ${error.message}`);
        }
    }

    /**
     * Advanced search with multiple filters and full-text capabilities
     */
    async search(searchQuery) {
        const {
            query = '',
            filters = {},
            dateRange = {},
            aggregations = [],
            sortBy = 'eventTimestamp',
            sortOrder = 'desc',
            page = 1,
            pageSize = this.config.defaultPageSize,
            organizationId,
            includeAggregations = false
        } = searchQuery;

        try {
            // Build Prisma where clause
            const whereClause = this.buildWhereClause(query, filters, dateRange, organizationId);

            // Calculate pagination
            const skip = (page - 1) * pageSize;
            const take = Math.min(pageSize, this.config.maxSearchResults);

            // Execute search with aggregations if requested
            const [results, total, aggregationResults] = await Promise.all([
                this.executeSearch(whereClause, sortBy, sortOrder, skip, take),
                this.getTotalCount(whereClause),
                includeAggregations ? this.executeAggregations(whereClause, aggregations) : null
            ]);

            // Enhance results with computed fields
            const enhancedResults = await this.enhanceSearchResults(results);

            return {
                query: searchQuery,
                results: enhancedResults,
                pagination: {
                    page,
                    pageSize,
                    total,
                    totalPages: Math.ceil(total / pageSize),
                    hasNext: skip + take < total,
                    hasPrevious: page > 1
                },
                aggregations: aggregationResults,
                executedAt: new Date()
            };

        } catch (error) {
            this.emit('searchError', { query: searchQuery, error: error.message });
            throw error;
        }
    }

    /**
     * Build comprehensive WHERE clause for search
     */
    buildWhereClause(query, filters, dateRange, organizationId) {
        const where = { AND: [] };

        // Organization filter
        if (organizationId) {
            where.AND.push({ organizationId });
        }

        // Date range filter
        if (dateRange.start || dateRange.end) {
            const dateFilter = {};
            if (dateRange.start) dateFilter.gte = new Date(dateRange.start);
            if (dateRange.end) dateFilter.lte = new Date(dateRange.end);
            where.AND.push({ eventTimestamp: dateFilter });
        }

        // Text search across multiple fields
        if (query) {
            where.AND.push({
                OR: [
                    { action: { contains: query, mode: 'insensitive' } },
                    { eventType: { contains: query, mode: 'insensitive' } },
                    { resourceType: { contains: query, mode: 'insensitive' } },
                    { actorId: { contains: query, mode: 'insensitive' } },
                    { metadata: { path: ['searchableText'], string_contains: query } }
                ]
            });
        }

        // Apply filters
        Object.entries(filters).forEach(([field, value]) => {
            if (Array.isArray(value)) {
                where.AND.push({ [field]: { in: value } });
            } else if (typeof value === 'object' && value !== null) {
                where.AND.push({ [field]: value });
            } else {
                where.AND.push({ [field]: value });
            }
        });

        return where.AND.length > 0 ? where : {};
    }

    /**
     * Execute search query
     */
    async executeSearch(where, sortBy, sortOrder, skip, take) {
        return this.prisma.auditLog.findMany({
            where,
            orderBy: { [sortBy]: sortOrder },
            skip,
            take,
            include: {
                organization: {
                    select: { name: true, id: true }
                },
                policy: {
                    select: { name: true, version: true }
                }
            }
        });
    }

    /**
     * Get total count for pagination
     */
    async getTotalCount(where) {
        return this.prisma.auditLog.count({ where });
    }

    /**
     * Execute aggregations for analytics
     */
    async executeAggregations(where, aggregations) {
        const results = {};

        for (const agg of aggregations) {
            switch (agg.type) {
                case 'terms':
                    results[agg.name] = await this.termsAggregation(where, agg.field, agg.size || 10);
                    break;
                case 'histogram':
                    results[agg.name] = await this.histogramAggregation(where, agg.field, agg.interval);
                    break;
                case 'stats':
                    results[agg.name] = await this.statsAggregation(where, agg.field);
                    break;
                case 'date_histogram':
                    results[agg.name] = await this.dateHistogramAggregation(where, agg.field, agg.interval);
                    break;
            }
        }

        return results;
    }

    /**
     * Terms aggregation (group by field values)
     */
    async termsAggregation(where, field, size) {
        const groupBy = {};
        groupBy[field] = true;

        const results = await this.prisma.auditLog.groupBy({
            by: [field],
            where,
            _count: true,
            orderBy: { _count: { [field]: 'desc' } },
            take: size
        });

        return results.map(item => ({
            key: item[field],
            doc_count: item._count
        }));
    }

    /**
     * Date histogram aggregation (time-based grouping)
     */
    async dateHistogramAggregation(where, field, interval) {
        // This would need to be implemented based on the specific interval
        // For now, we'll group by day
        const sql = `
            SELECT DATE_TRUNC('day', ${field}) as date_bucket, COUNT(*) as doc_count
            FROM audit_logs
            WHERE ${this.buildSqlWhere(where)}
            GROUP BY DATE_TRUNC('day', ${field})
            ORDER BY date_bucket
        `;

        // Note: This is pseudo-code. In practice, you'd use Prisma's raw query or a time-series DB
        return [];
    }

    /**
     * Enhance search results with computed fields
     */
    async enhanceSearchResults(results) {
        return results.map(result => ({
            ...result,
            // Add computed fields
            riskScore: this.calculateRiskScore(result),
            anomalyScore: this.calculateAnomalyScore(result),
            complianceStatus: this.assessComplianceStatus(result),
            relatedEvents: [], // Would be populated with related event IDs
            duration: this.calculateEventDuration(result)
        }));
    }

    /**
     * Calculate risk score for an audit log entry
     */
    calculateRiskScore(logEntry) {
        let score = 0;

        // Base score by severity
        const severityScores = { info: 1, warning: 3, error: 6, critical: 10 };
        score += severityScores[logEntry.severity] || 1;

        // Outcome impact
        if (logEntry.outcome === 'failure') score += 5;
        if (logEntry.outcome === 'partial') score += 2;

        // Actor type risk
        const actorRisk = {
            'system': 1,
            'user': 2,
            'api_key': 3,
            'external': 5,
            'anonymous': 8
        };
        score += actorRisk[logEntry.actorType] || 2;

        // Resource type sensitivity
        const resourceSensitivity = {
            'user_data': 4,
            'financial_data': 6,
            'security_system': 8,
            'compliance_system': 6,
            'audit_system': 10
        };
        score += resourceSensitivity[logEntry.resourceType] || 1;

        return Math.min(score, 10); // Cap at 10
    }

    /**
     * Calculate anomaly score based on patterns
     */
    calculateAnomalyScore(logEntry) {
        // This would typically involve ML models or statistical analysis
        // For now, return a simple heuristic
        let anomalyScore = 0;

        // Check for unusual time patterns
        const hour = logEntry.eventTimestamp.getHours();
        if (hour < 6 || hour > 22) anomalyScore += 2; // Outside business hours

        // Check for rapid succession (would need time series analysis)
        // This is simplified
        if (logEntry.metadata && logEntry.metadata.rapidSuccession) {
            anomalyScore += 3;
        }

        return Math.min(anomalyScore, 10);
    }

    /**
     * Assess compliance status
     */
    assessComplianceStatus(logEntry) {
        const status = {
            compliant: true,
            violations: [],
            frameworks: logEntry.complianceFrameworks || []
        };

        // Check various compliance rules
        if (logEntry.severity === 'critical' && logEntry.outcome === 'failure') {
            status.compliant = false;
            status.violations.push('Critical failure without immediate response');
        }

        if (!logEntry.actorId && logEntry.actorType !== 'system') {
            status.compliant = false;
            status.violations.push('Missing actor identification');
        }

        return status;
    }

    /**
     * Calculate event duration (if applicable)
     */
    calculateEventDuration(logEntry) {
        // This would calculate duration for long-running operations
        // Based on metadata or related events
        return logEntry.metadata?.duration || null;
    }

    /**
     * Real-time analytics dashboard data
     */
    async getDashboardData(organizationId, timeRange = '24h') {
        const cacheKey = `${this.config.cachePrefix}:dashboard:${organizationId}:${timeRange}`;

        // Try cache first
        const cached = await this.redis.get(cacheKey);
        if (cached) {
            return JSON.parse(cached);
        }

        const endTime = new Date();
        const startTime = new Date();

        // Calculate start time based on range
        switch (timeRange) {
            case '1h':
                startTime.setHours(startTime.getHours() - 1);
                break;
            case '24h':
                startTime.setDate(startTime.getDate() - 1);
                break;
            case '7d':
                startTime.setDate(startTime.getDate() - 7);
                break;
            case '30d':
                startTime.setDate(startTime.getDate() - 30);
                break;
        }

        const where = {
            organizationId,
            eventTimestamp: {
                gte: startTime,
                lte: endTime
            }
        };

        // Gather dashboard metrics
        const [
            totalEvents,
            severityDistribution,
            outcomeDistribution,
            topActors,
            topResources,
            timelineData,
            complianceMetrics,
            riskMetrics
        ] = await Promise.all([
            this.getTotalEvents(where),
            this.getSeverityDistribution(where),
            this.getOutcomeDistribution(where),
            this.getTopActors(where),
            this.getTopResources(where),
            this.getTimelineData(where, timeRange),
            this.getComplianceMetrics(where),
            this.getRiskMetrics(where)
        ]);

        const dashboardData = {
            timeRange,
            generatedAt: new Date(),
            totalEvents,
            severityDistribution,
            outcomeDistribution,
            topActors,
            topResources,
            timeline: timelineData,
            compliance: complianceMetrics,
            risk: riskMetrics
        };

        // Cache for 5 minutes
        await this.redis.setex(cacheKey, this.config.cacheTTL, JSON.stringify(dashboardData));

        return dashboardData;
    }

    /**
     * Get total events count
     */
    async getTotalEvents(where) {
        return this.prisma.auditLog.count({ where });
    }

    /**
     * Get severity distribution
     */
    async getSeverityDistribution(where) {
        const results = await this.prisma.auditLog.groupBy({
            by: ['severity'],
            where,
            _count: true,
            orderBy: { _count: 'desc' }
        });

        return results.map(item => ({
            severity: item.severity,
            count: item._count
        }));
    }

    /**
     * Get outcome distribution
     */
    async getOutcomeDistribution(where) {
        const results = await this.prisma.auditLog.groupBy({
            by: ['outcome'],
            where,
            _count: true,
            orderBy: { _count: 'desc' }
        });

        return results.map(item => ({
            outcome: item.outcome,
            count: item._count
        }));
    }

    /**
     * Get top actors
     */
    async getTopActors(where) {
        const results = await this.prisma.auditLog.groupBy({
            by: ['actorId', 'actorType'],
            where: {
                ...where,
                actorId: { not: null }
            },
            _count: true,
            orderBy: { _count: 'desc' },
            take: 10
        });

        return results.map(item => ({
            actorId: item.actorId,
            actorType: item.actorType,
            eventCount: item._count
        }));
    }

    /**
     * Get top resources
     */
    async getTopResources(where) {
        const results = await this.prisma.auditLog.groupBy({
            by: ['resourceType'],
            where,
            _count: true,
            orderBy: { _count: 'desc' },
            take: 10
        });

        return results.map(item => ({
            resourceType: item.resourceType,
            eventCount: item._count
        }));
    }

    /**
     * Get timeline data for charts
     */
    async getTimelineData(where, timeRange) {
        // This would use database-specific time bucketing
        // Implementation depends on your database (PostgreSQL has DATE_TRUNC)

        const interval = this.getTimelineInterval(timeRange);

        // Simplified implementation - in practice you'd use raw SQL for time bucketing
        const results = await this.prisma.auditLog.findMany({
            where,
            select: {
                eventTimestamp: true,
                severity: true,
                outcome: true
            },
            orderBy: { eventTimestamp: 'asc' }
        });

        // Group by time buckets (simplified)
        return this.groupByTimeBuckets(results, interval);
    }

    /**
     * Get compliance metrics
     */
    async getComplianceMetrics(where) {
        const complianceFrameworks = ['SOX', 'GDPR', 'HIPAA', 'PCI'];
        const metrics = {};

        for (const framework of complianceFrameworks) {
            const frameworkWhere = {
                ...where,
                complianceFrameworks: { has: framework }
            };

            const [total, violations] = await Promise.all([
                this.prisma.auditLog.count({ where: frameworkWhere }),
                this.prisma.auditLog.count({
                    where: {
                        ...frameworkWhere,
                        OR: [
                            { severity: 'critical' },
                            { outcome: 'failure' }
                        ]
                    }
                })
            ]);

            metrics[framework] = {
                totalEvents: total,
                violations,
                complianceScore: total > 0 ? Math.round(((total - violations) / total) * 100) : 100
            };
        }

        return metrics;
    }

    /**
     * Get risk metrics
     */
    async getRiskMetrics(where) {
        const [
            criticalEvents,
            failureEvents,
            securityEvents,
            unauthorizedAccess
        ] = await Promise.all([
            this.prisma.auditLog.count({
                where: { ...where, severity: 'critical' }
            }),
            this.prisma.auditLog.count({
                where: { ...where, outcome: 'failure' }
            }),
            this.prisma.auditLog.count({
                where: {
                    ...where,
                    action: { contains: 'security' }
                }
            }),
            this.prisma.auditLog.count({
                where: {
                    ...where,
                    action: { contains: 'unauthorized' }
                }
            })
        ]);

        const totalEvents = await this.getTotalEvents(where);
        const riskScore = this.calculateOverallRiskScore({
            total: totalEvents,
            critical: criticalEvents,
            failures: failureEvents,
            security: securityEvents,
            unauthorized: unauthorizedAccess
        });

        return {
            riskScore,
            criticalEvents,
            failureEvents,
            securityEvents,
            unauthorizedAccess,
            riskLevel: this.getRiskLevel(riskScore)
        };
    }

    /**
     * Calculate overall risk score
     */
    calculateOverallRiskScore(metrics) {
        if (metrics.total === 0) return 0;

        const criticalWeight = 10;
        const failureWeight = 5;
        const securityWeight = 3;
        const unauthorizedWeight = 8;

        const weightedScore = (
            (metrics.critical * criticalWeight) +
            (metrics.failures * failureWeight) +
            (metrics.security * securityWeight) +
            (metrics.unauthorized * unauthorizedWeight)
        ) / metrics.total;

        return Math.min(Math.round(weightedScore), 10);
    }

    /**
     * Get risk level description
     */
    getRiskLevel(score) {
        if (score >= 8) return 'Critical';
        if (score >= 6) return 'High';
        if (score >= 4) return 'Medium';
        if (score >= 2) return 'Low';
        return 'Minimal';
    }

    /**
     * Export audit logs in various formats
     */
    async exportLogs(searchQuery, format = 'json') {
        const results = await this.search({
            ...searchQuery,
            pageSize: this.config.maxSearchResults
        });

        switch (format.toLowerCase()) {
            case 'json':
                return this.exportAsJson(results);
            case 'csv':
                return this.exportAsCsv(results);
            case 'xlsx':
                return this.exportAsExcel(results);
            case 'pdf':
                return this.exportAsPdf(results);
            default:
                throw new Error(`Unsupported export format: ${format}`);
        }
    }

    /**
     * Export as JSON
     */
    exportAsJson(results) {
        return {
            mimeType: 'application/json',
            filename: `audit-logs-${Date.now()}.json`,
            data: Buffer.from(JSON.stringify(results, null, 2))
        };
    }

    /**
     * Export as CSV
     */
    exportAsCsv(results) {
        const headers = [
            'Event ID', 'Timestamp', 'Event Type', 'Action', 'Actor',
            'Resource Type', 'Resource ID', 'Outcome', 'Severity',
            'Organization', 'IP Address', 'User Agent'
        ];

        const rows = results.results.map(log => [
            log.eventId,
            log.eventTimestamp.toISOString(),
            log.eventType,
            log.action,
            `${log.actorType}:${log.actorId || 'unknown'}`,
            log.resourceType,
            log.resourceId || '',
            log.outcome,
            log.severity,
            log.organization?.name || log.organizationId || '',
            log.ipAddress || '',
            log.userAgent || ''
        ]);

        const csvContent = [headers, ...rows]
            .map(row => row.map(cell => `"${cell || ''}"`).join(','))
            .join('\n');

        return {
            mimeType: 'text/csv',
            filename: `audit-logs-${Date.now()}.csv`,
            data: Buffer.from(csvContent)
        };
    }

    /**
     * Export as Excel (placeholder - would need xlsx library)
     */
    exportAsExcel(results) {
        // Would implement with xlsx library
        return this.exportAsCsv(results);
    }

    /**
     * Export as PDF (placeholder - would need pdf library)
     */
    exportAsPdf(results) {
        // Would implement with pdf generation library
        return this.exportAsJson(results);
    }

    /**
     * Setup real-time indexing
     */
    async setupRealTimeIndexing() {
        // This would set up real-time search index updates
        // Could use Redis Streams, Elasticsearch, or other search engines
    }

    /**
     * Initialize analytics caches
     */
    async initializeAnalyticsCaches() {
        // Pre-warm frequently accessed analytics data
    }

    /**
     * Helper methods
     */
    getTimelineInterval(timeRange) {
        const intervals = {
            '1h': 'minute',
            '24h': 'hour',
            '7d': 'day',
            '30d': 'day'
        };
        return intervals[timeRange] || 'hour';
    }

    groupByTimeBuckets(results, interval) {
        // Simplified grouping - in practice you'd use proper time bucketing
        const buckets = {};

        results.forEach(result => {
            const bucket = this.getBucketKey(result.eventTimestamp, interval);
            if (!buckets[bucket]) {
                buckets[bucket] = { timestamp: bucket, total: 0, by_severity: {} };
            }
            buckets[bucket].total++;
            buckets[bucket].by_severity[result.severity] =
                (buckets[bucket].by_severity[result.severity] || 0) + 1;
        });

        return Object.values(buckets).sort((a, b) =>
            new Date(a.timestamp) - new Date(b.timestamp)
        );
    }

    getBucketKey(timestamp, interval) {
        const date = new Date(timestamp);
        switch (interval) {
            case 'minute':
                return date.toISOString().substring(0, 16) + ':00.000Z';
            case 'hour':
                return date.toISOString().substring(0, 13) + ':00:00.000Z';
            case 'day':
                return date.toISOString().substring(0, 10) + 'T00:00:00.000Z';
            default:
                return date.toISOString();
        }
    }

    /**
     * Cleanup resources
     */
    async shutdown() {
        await this.redis.quit();
        await this.prisma.$disconnect();
        this.isInitialized = false;
    }
}