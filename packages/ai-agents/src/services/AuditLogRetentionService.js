/**
 * Audit Log Retention Service
 *
 * Manages automated cleanup and archival of audit logs based on compliance requirements
 * Features:
 * - Compliance-based retention policies (SOX, GDPR, HIPAA, PCI)
 * - Automated archival to cold storage
 * - Integrity verification during archival
 * - Scheduled cleanup jobs
 * - Audit trail for retention actions
 */

import { PrismaClient } from '@prisma/client';
import { EventEmitter } from 'events';
import cron from 'node-cron';
import { createWriteStream, createReadStream } from 'fs';
import { pipeline } from 'stream/promises';
import { createGzip, createGunzip } from 'zlib';
import path from 'path';
import fs from 'fs/promises';

export class AuditLogRetentionService extends EventEmitter {
    constructor(options = {}) {
        super();

        this.prisma = options.prisma || new PrismaClient();
        this.config = {
            // Retention periods in days
            retentionPolicies: {
                'SOX': 2555,    // 7 years for Sarbanes-Oxley
                'GDPR': 2190,   // 6 years for GDPR
                'HIPAA': 2190,  // 6 years for HIPAA
                'PCI': 365,     // 1 year for PCI DSS
                'default': 2555 // 7 years default
            },

            // Archival settings
            archivalPath: options.archivalPath || '/var/lib/urnlabs/audit-archives',
            batchSize: options.batchSize || 1000,
            compressionLevel: options.compressionLevel || 6,

            // Schedule settings (run daily at 2 AM)
            cronSchedule: options.cronSchedule || '0 2 * * *',

            // Safety settings
            dryRun: options.dryRun || false,
            maxDeletionPerRun: options.maxDeletionPerRun || 10000,

            ...options.config
        };

        this.isRunning = false;
        this.cronJob = null;
    }

    /**
     * Initialize the retention service
     */
    async initialize() {
        try {
            // Ensure archive directory exists
            await this.ensureArchiveDirectory();

            // Start scheduled retention job
            this.startScheduledRetention();

            // Log initialization
            this.emit('initialized', {
                archivalPath: this.config.archivalPath,
                cronSchedule: this.config.cronSchedule,
                dryRun: this.config.dryRun
            });

        } catch (error) {
            throw new Error(`Failed to initialize AuditLogRetentionService: ${error.message}`);
        }
    }

    /**
     * Start scheduled retention job
     */
    startScheduledRetention() {
        if (this.cronJob) {
            this.cronJob.stop();
        }

        this.cronJob = cron.schedule(this.config.cronSchedule, async () => {
            try {
                await this.runRetentionProcess();
            } catch (error) {
                this.emit('error', {
                    type: 'retention_process_failed',
                    error: error.message,
                    timestamp: new Date()
                });
            }
        }, {
            scheduled: false,
            timezone: 'UTC'
        });

        this.cronJob.start();
    }

    /**
     * Run the complete retention process
     */
    async runRetentionProcess() {
        if (this.isRunning) {
            this.emit('warning', 'Retention process already running, skipping this cycle');
            return;
        }

        this.isRunning = true;
        const startTime = new Date();

        try {
            this.emit('retentionStarted', { startTime, dryRun: this.config.dryRun });

            // Step 1: Identify logs eligible for archival/deletion
            const eligibleLogs = await this.identifyEligibleLogs();

            // Step 2: Archive logs that need to be retained but moved to cold storage
            const archivedCount = await this.archiveLogs(eligibleLogs.forArchival);

            // Step 3: Delete logs that have exceeded all retention requirements
            const deletedCount = await this.deleteLogs(eligibleLogs.forDeletion);

            // Step 4: Verify archive integrity
            await this.verifyArchiveIntegrity();

            // Step 5: Update retention statistics
            await this.updateRetentionStatistics(archivedCount, deletedCount);

            const endTime = new Date();
            const duration = endTime - startTime;

            this.emit('retentionCompleted', {
                startTime,
                endTime,
                duration,
                archivedCount,
                deletedCount,
                dryRun: this.config.dryRun
            });

        } catch (error) {
            this.emit('retentionFailed', {
                error: error.message,
                timestamp: new Date()
            });
            throw error;
        } finally {
            this.isRunning = false;
        }
    }

    /**
     * Identify logs eligible for archival or deletion
     */
    async identifyEligibleLogs() {
        const forArchival = [];
        const forDeletion = [];

        // Get logs older than 30 days for potential archival
        const archivalThreshold = new Date();
        archivalThreshold.setDate(archivalThreshold.getDate() - 30);

        // Get logs by compliance framework for retention calculation
        const logs = await this.prisma.auditLog.findMany({
            where: {
                eventTimestamp: {
                    lt: archivalThreshold
                }
            },
            select: {
                id: true,
                eventId: true,
                eventTimestamp: true,
                complianceFrameworks: true,
                severity: true,
                organizationId: true,
                eventHash: true,
                previousHash: true
            },
            orderBy: {
                eventTimestamp: 'asc'
            }
        });

        const now = new Date();

        for (const log of logs) {
            const maxRetentionDays = this.calculateMaxRetentionPeriod(log.complianceFrameworks);
            const retentionThreshold = new Date(log.eventTimestamp);
            retentionThreshold.setDate(retentionThreshold.getDate() + maxRetentionDays);

            if (now > retentionThreshold) {
                // Log has exceeded all retention requirements
                forDeletion.push(log);
            } else {
                // Log should be archived but not deleted
                const daysSinceCreation = Math.floor((now - log.eventTimestamp) / (1000 * 60 * 60 * 24));

                // Archive logs older than 90 days
                if (daysSinceCreation > 90) {
                    forArchival.push(log);
                }
            }
        }

        return { forArchival, forDeletion };
    }

    /**
     * Calculate maximum retention period across all applicable frameworks
     */
    calculateMaxRetentionPeriod(frameworks) {
        if (!frameworks || frameworks.length === 0) {
            return this.config.retentionPolicies.default;
        }

        return Math.max(
            ...frameworks.map(framework =>
                this.config.retentionPolicies[framework] || this.config.retentionPolicies.default
            )
        );
    }

    /**
     * Archive logs to compressed cold storage
     */
    async archiveLogs(logsForArchival) {
        if (logsForArchival.length === 0) {
            return 0;
        }

        let archivedCount = 0;
        const batches = this.createBatches(logsForArchival, this.config.batchSize);

        for (const batch of batches) {
            try {
                const archiveResult = await this.archiveBatch(batch);
                archivedCount += archiveResult.count;

                this.emit('batchArchived', {
                    batchSize: batch.length,
                    archivedCount: archiveResult.count,
                    archiveFile: archiveResult.archiveFile
                });

            } catch (error) {
                this.emit('archiveError', {
                    batchSize: batch.length,
                    error: error.message
                });
                throw error;
            }
        }

        return archivedCount;
    }

    /**
     * Archive a batch of logs
     */
    async archiveBatch(batch) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const archiveFileName = `audit-logs-${timestamp}-${batch[0].id}-${batch[batch.length-1].id}.json.gz`;
        const archiveFilePath = path.join(this.config.archivalPath, archiveFileName);

        // Get full log data for archival
        const fullLogs = await this.prisma.auditLog.findMany({
            where: {
                id: {
                    in: batch.map(log => log.id)
                }
            }
        });

        if (this.config.dryRun) {
            return { count: fullLogs.length, archiveFile: archiveFileName };
        }

        // Create compressed archive
        const writeStream = createWriteStream(archiveFilePath);
        const gzipStream = createGzip({ level: this.config.compressionLevel });

        await pipeline(
            async function* () {
                yield JSON.stringify({
                    metadata: {
                        archivedAt: new Date(),
                        version: '1.0',
                        totalRecords: fullLogs.length,
                        dateRange: {
                            start: fullLogs[0]?.eventTimestamp,
                            end: fullLogs[fullLogs.length - 1]?.eventTimestamp
                        }
                    },
                    logs: fullLogs
                }, null, 2);
            },
            gzipStream,
            writeStream
        );

        // Create archive record in database
        const archiveRecord = await this.prisma.auditLogArchive.create({
            data: {
                archiveFileName,
                archiveFilePath,
                recordCount: fullLogs.length,
                compressedSizeBytes: (await fs.stat(archiveFilePath)).size,
                startDate: fullLogs[0]?.eventTimestamp,
                endDate: fullLogs[fullLogs.length - 1]?.eventTimestamp,
                checksumSha256: await this.calculateFileChecksum(archiveFilePath),
                metadata: {
                    batchId: batch[0].id,
                    compressionLevel: this.config.compressionLevel,
                    originalLogIds: batch.map(log => log.id)
                }
            }
        });

        // Mark logs as archived (but don't delete yet)
        await this.prisma.auditLog.updateMany({
            where: {
                id: {
                    in: batch.map(log => log.id)
                }
            },
            data: {
                metadata: {
                    archived: true,
                    archiveId: archiveRecord.id,
                    archivedAt: new Date()
                }
            }
        });

        return { count: fullLogs.length, archiveFile: archiveFileName };
    }

    /**
     * Delete logs that have exceeded retention requirements
     */
    async deleteLogs(logsForDeletion) {
        if (logsForDeletion.length === 0) {
            return 0;
        }

        // Limit deletion per run for safety
        const logsToDelete = logsForDeletion.slice(0, this.config.maxDeletionPerRun);

        if (this.config.dryRun) {
            this.emit('dryRunDeletion', {
                plannedDeletions: logsToDelete.length,
                totalEligible: logsForDeletion.length
            });
            return logsToDelete.length;
        }

        let deletedCount = 0;
        const batches = this.createBatches(logsToDelete, this.config.batchSize);

        for (const batch of batches) {
            try {
                // Create deletion audit trail
                await this.createDeletionAuditTrail(batch);

                // Delete the logs
                const result = await this.prisma.auditLog.deleteMany({
                    where: {
                        id: {
                            in: batch.map(log => log.id)
                        }
                    }
                });

                deletedCount += result.count;

                this.emit('batchDeleted', {
                    batchSize: batch.length,
                    deletedCount: result.count
                });

            } catch (error) {
                this.emit('deletionError', {
                    batchSize: batch.length,
                    error: error.message
                });
                throw error;
            }
        }

        return deletedCount;
    }

    /**
     * Create audit trail for log deletions
     */
    async createDeletionAuditTrail(batch) {
        const deletionRecord = {
            deletedAt: new Date(),
            deletedLogIds: batch.map(log => log.id),
            deletedLogEventIds: batch.map(log => log.eventId),
            deletionReason: 'retention_policy_expired',
            retentionPolicyApplied: 'automatic',
            batchSize: batch.length,
            dateRange: {
                start: batch[0]?.eventTimestamp,
                end: batch[batch.length - 1]?.eventTimestamp
            }
        };

        // Store deletion record (this is also an audit log but with special handling)
        await this.prisma.auditLog.create({
            data: {
                eventId: `deletion-${Date.now()}`,
                eventType: 'retention',
                resourceType: 'audit_system',
                actorType: 'system',
                actorId: 'retention_service',
                action: 'audit_log_deletion',
                outcome: 'success',
                severity: 'info',
                metadata: deletionRecord,
                complianceFrameworks: ['SOX'], // Deletion itself is audited under SOX
                eventTimestamp: new Date(),
                ingestedAt: new Date()
            }
        });
    }

    /**
     * Verify integrity of archived logs
     */
    async verifyArchiveIntegrity() {
        const recentArchives = await this.prisma.auditLogArchive.findMany({
            where: {
                createdAt: {
                    gte: new Date(Date.now() - 24 * 60 * 60 * 1000) // Last 24 hours
                }
            }
        });

        for (const archive of recentArchives) {
            try {
                const currentChecksum = await this.calculateFileChecksum(archive.archiveFilePath);

                if (currentChecksum !== archive.checksumSha256) {
                    this.emit('archiveIntegrityFailure', {
                        archiveId: archive.id,
                        archiveFileName: archive.archiveFileName,
                        expectedChecksum: archive.checksumSha256,
                        actualChecksum: currentChecksum
                    });
                }
            } catch (error) {
                this.emit('archiveVerificationError', {
                    archiveId: archive.id,
                    error: error.message
                });
            }
        }
    }

    /**
     * Calculate SHA-256 checksum for a file
     */
    async calculateFileChecksum(filePath) {
        const crypto = await import('crypto');
        const hash = crypto.createHash('sha256');

        const stream = createReadStream(filePath);
        for await (const chunk of stream) {
            hash.update(chunk);
        }

        return hash.digest('hex');
    }

    /**
     * Update retention statistics
     */
    async updateRetentionStatistics(archivedCount, deletedCount) {
        const stats = {
            lastRunAt: new Date(),
            logsArchived: archivedCount,
            logsDeleted: deletedCount,
            totalActiveLogCount: await this.prisma.auditLog.count(),
            totalArchivedCount: await this.prisma.auditLogArchive.count()
        };

        // Store in a system metrics table or Redis
        this.emit('retentionStats', stats);
    }

    /**
     * Create batches from array
     */
    createBatches(array, batchSize) {
        const batches = [];
        for (let i = 0; i < array.length; i += batchSize) {
            batches.push(array.slice(i, i + batchSize));
        }
        return batches;
    }

    /**
     * Ensure archive directory exists
     */
    async ensureArchiveDirectory() {
        try {
            await fs.access(this.config.archivalPath);
        } catch {
            await fs.mkdir(this.config.archivalPath, { recursive: true });
        }
    }

    /**
     * Get retention status for a specific organization
     */
    async getRetentionStatus(organizationId) {
        const [totalLogs, archivedLogs, oldestLog, newestLog] = await Promise.all([
            this.prisma.auditLog.count({
                where: { organizationId }
            }),
            this.prisma.auditLog.count({
                where: {
                    organizationId,
                    metadata: {
                        path: ['archived'],
                        equals: true
                    }
                }
            }),
            this.prisma.auditLog.findFirst({
                where: { organizationId },
                orderBy: { eventTimestamp: 'asc' },
                select: { eventTimestamp: true }
            }),
            this.prisma.auditLog.findFirst({
                where: { organizationId },
                orderBy: { eventTimestamp: 'desc' },
                select: { eventTimestamp: true }
            })
        ]);

        return {
            organizationId,
            totalLogs,
            archivedLogs,
            activeLogs: totalLogs - archivedLogs,
            oldestLogDate: oldestLog?.eventTimestamp,
            newestLogDate: newestLog?.eventTimestamp,
            retentionPolicies: this.config.retentionPolicies
        };
    }

    /**
     * Manual trigger for retention process (for testing or emergency cleanup)
     */
    async triggerManualRetention(options = {}) {
        const originalDryRun = this.config.dryRun;

        if (options.dryRun !== undefined) {
            this.config.dryRun = options.dryRun;
        }

        try {
            await this.runRetentionProcess();
        } finally {
            this.config.dryRun = originalDryRun;
        }
    }

    /**
     * Stop the retention service
     */
    async shutdown() {
        if (this.cronJob) {
            this.cronJob.stop();
            this.cronJob = null;
        }

        if (this.isRunning) {
            // Wait for current retention process to complete
            await new Promise(resolve => {
                const checkInterval = setInterval(() => {
                    if (!this.isRunning) {
                        clearInterval(checkInterval);
                        resolve();
                    }
                }, 1000);
            });
        }

        await this.prisma.$disconnect();
    }
}