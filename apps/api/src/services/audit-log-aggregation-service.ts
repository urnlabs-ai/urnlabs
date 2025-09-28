import { PrismaClient } from '@prisma/client';
import { createHash, createHmac, randomBytes } from 'crypto';
import { gzip, gunzip, brotliCompress, brotliDecompress } from 'zlib';
import { promisify } from 'util';
import { logger } from '@/lib/logger';
import {
  AuditLogAggregationQuery,
  CreateArchiveRequest,
  CreateComplianceTrailRequest,
  AddComplianceTrailEventRequest,
  RunIntegrityCheckRequest,
  COMPLIANCE_FRAMEWORKS,
  COMPLIANCE_EVENT_CATEGORIES
} from '@/lib/schemas/audit-aggregation';

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);
const brotliCompressAsync = promisify(brotliCompress);
const brotliDecompressAsync = promisify(brotliDecompress);

export interface AuditLogAggregationServiceOptions {
  encryptionKey?: string;
  integrityCheckInterval?: number; // Hours
  defaultRetentionDays?: number;
  enableAutoArchiving?: boolean;
}

export class AuditLogAggregationService {
  private prisma: PrismaClient;
  private encryptionKey: string;
  private integrityCheckInterval: number;
  private defaultRetentionDays: number;
  private enableAutoArchiving: boolean;

  constructor(
    prisma: PrismaClient,
    options: AuditLogAggregationServiceOptions = {}
  ) {
    this.prisma = prisma;
    this.encryptionKey = options.encryptionKey || process.env.AUDIT_ENCRYPTION_KEY || 'default-key';
    this.integrityCheckInterval = options.integrityCheckInterval || 24; // 24 hours
    this.defaultRetentionDays = options.defaultRetentionDays || 2555; // 7 years default
    this.enableAutoArchiving = options.enableAutoArchiving ?? true;

    // Start background integrity check process
    if (this.enableAutoArchiving) {
      this.startBackgroundTasks();
    }
  }

  // ============================================================================
  // IMMUTABLE LOG STORAGE & INTEGRITY
  // ============================================================================

  /**
   * Calculate SHA-256 hash for an audit log event
   */
  private calculateEventHash(auditLog: any, previousHash?: string): string {
    const hashData = {
      eventId: auditLog.eventId,
      eventType: auditLog.eventType,
      resourceType: auditLog.resourceType,
      resourceId: auditLog.resourceId,
      actorType: auditLog.actorType,
      actorId: auditLog.actorId,
      action: auditLog.action,
      outcome: auditLog.outcome,
      beforeState: auditLog.beforeState,
      afterState: auditLog.afterState,
      eventTimestamp: auditLog.eventTimestamp,
      previousHash: previousHash || null,
    };

    const serialized = JSON.stringify(hashData, Object.keys(hashData).sort());
    return createHash('sha256').update(serialized).digest('hex');
  }

  /**
   * Verify the integrity of an audit log chain
   */
  public async verifyLogIntegrity(
    organizationId: string,
    startDate: Date,
    endDate: Date
  ): Promise<{
    isValid: boolean;
    totalEvents: number;
    validEvents: number;
    invalidEvents: string[];
    brokenChainAt?: string;
  }> {
    const auditLogs = await this.prisma.auditLog.findMany({
      where: {
        organizationId,
        eventTimestamp: {
          gte: startDate,
          lte: endDate,
        },
      },
      orderBy: {
        eventTimestamp: 'asc',
      },
    });

    const result = {
      isValid: true,
      totalEvents: auditLogs.length,
      validEvents: 0,
      invalidEvents: [] as string[],
      brokenChainAt: undefined as string | undefined,
    };

    let previousHash: string | null = null;

    for (const log of auditLogs) {
      const expectedHash = this.calculateEventHash(log, previousHash || undefined);

      if (log.eventHash !== expectedHash) {
        result.isValid = false;
        result.invalidEvents.push(log.id);

        if (!result.brokenChainAt) {
          result.brokenChainAt = log.id;
        }
      } else {
        result.validEvents++;
      }

      // Verify chain integrity
      if (previousHash && log.previousHash !== previousHash) {
        result.isValid = false;
        result.invalidEvents.push(log.id);

        if (!result.brokenChainAt) {
          result.brokenChainAt = log.id;
        }
      }

      previousHash = log.eventHash;
    }

    logger.info({
      organizationId,
      startDate,
      endDate,
      result,
    }, 'Audit log integrity verification completed');

    return result;
  }

  /**
   * Detect tampering in audit logs
   */
  public async detectTampering(
    organizationId: string,
    suspiciousEventIds?: string[]
  ): Promise<{
    tamperingDetected: boolean;
    suspiciousEvents: Array<{
      eventId: string;
      issues: string[];
      severity: 'low' | 'medium' | 'high';
    }>;
    recommendations: string[];
  }> {
    const result = {
      tamperingDetected: false,
      suspiciousEvents: [] as Array<{
        eventId: string;
        issues: string[];
        severity: 'low' | 'medium' | 'high';
      }>,
      recommendations: [] as string[],
    };

    // Get events to check
    const whereClause: any = { organizationId };
    if (suspiciousEventIds?.length) {
      whereClause.id = { in: suspiciousEventIds };
    }

    const auditLogs = await this.prisma.auditLog.findMany({
      where: whereClause,
      orderBy: { eventTimestamp: 'asc' },
    });

    for (const log of auditLogs) {
      const issues: string[] = [];
      let severity: 'low' | 'medium' | 'high' = 'low';

      // Check hash integrity
      const expectedHash = this.calculateEventHash(log);
      if (log.eventHash !== expectedHash) {
        issues.push('Hash mismatch detected');
        severity = 'high';
        result.tamperingDetected = true;
      }

      // Check for suspicious timing patterns
      const timeDiff = Math.abs(
        new Date(log.eventTimestamp).getTime() - new Date(log.ingestedAt).getTime()
      );
      if (timeDiff > 5 * 60 * 1000) { // More than 5 minutes
        issues.push('Suspicious timing gap between event and ingestion');
        severity = Math.max(severity as any, 'medium' as any);
      }

      // Check for impossible sequences
      if (log.beforeState && log.afterState) {
        try {
          const before = JSON.parse(JSON.stringify(log.beforeState));
          const after = JSON.parse(JSON.stringify(log.afterState));

          if (JSON.stringify(before) === JSON.stringify(after) && log.action !== 'read') {
            issues.push('Before and after states identical for modification action');
            severity = Math.max(severity as any, 'medium' as any);
          }
        } catch (error) {
          issues.push('Invalid state data format');
          severity = Math.max(severity as any, 'medium' as any);
        }
      }

      if (issues.length > 0) {
        result.suspiciousEvents.push({
          eventId: log.id,
          issues,
          severity,
        });
      }
    }

    // Generate recommendations
    if (result.tamperingDetected) {
      result.recommendations.push('Immediately investigate high-severity events');
      result.recommendations.push('Review access logs for unauthorized modifications');
      result.recommendations.push('Consider enabling additional security monitoring');
    }

    if (result.suspiciousEvents.length > 0) {
      result.recommendations.push('Review event generation processes for timing issues');
      result.recommendations.push('Implement real-time integrity monitoring');
    }

    return result;
  }

  // ============================================================================
  // ARCHIVAL & RETENTION
  // ============================================================================

  /**
   * Archive audit logs based on retention policies
   */
  public async archiveAuditLogs(request: CreateArchiveRequest, organizationId?: string): Promise<{
    archived: number;
    failed: number;
    archiveIds: string[];
    errors: string[];
  }> {
    const result = {
      archived: 0,
      failed: 0,
      archiveIds: [] as string[],
      errors: [] as string[],
    };

    try {
      // Get logs to archive
      const auditLogs = await this.prisma.auditLog.findMany({
        where: {
          id: { in: request.auditLogIds },
          organizationId,
        },
      });

      const retentionUntil = new Date();
      retentionUntil.setDate(retentionUntil.getDate() + request.retentionDays);

      for (const log of auditLogs) {
        try {
          // Compress log data
          const logData = JSON.stringify(log);
          const compressedData = request.compressionType === 'brotli'
            ? await brotliCompressAsync(Buffer.from(logData))
            : await gzipAsync(logData);

          // Calculate archive hash
          const archiveHash = createHash('sha256')
            .update(compressedData)
            .digest('hex');

          // Create archive entry
          const archive = await this.prisma.auditLogArchive.create({
            data: {
              originalLogId: log.id,
              archiveReason: request.archiveReason,
              retentionUntil,
              complianceFramework: request.complianceFramework,
              compressedData,
              encryptionKey: this.generateEncryptionKeyId(),
              compressionType: request.compressionType,
              archiveHash,
              originalHash: log.eventHash,
              organizationId: log.organizationId,
            },
          });

          result.archiveIds.push(archive.id);
          result.archived++;

          logger.info({
            originalLogId: log.id,
            archiveId: archive.id,
            organizationId,
          }, 'Audit log archived successfully');

        } catch (error) {
          result.failed++;
          result.errors.push(`Failed to archive log ${log.id}: ${error}`);
          logger.error({ error, logId: log.id }, 'Failed to archive audit log');
        }
      }

    } catch (error) {
      logger.error({ error, request }, 'Archive operation failed');
      throw new Error(`Archive operation failed: ${error}`);
    }

    return result;
  }

  /**
   * Apply retention policies automatically
   */
  public async applyRetentionPolicies(organizationId?: string): Promise<{
    processed: number;
    archived: number;
    deleted: number;
    errors: string[];
  }> {
    const result = {
      processed: 0,
      archived: 0,
      deleted: 0,
      errors: [] as string[],
    };

    try {
      // Get active retention policies
      const policies = await this.prisma.auditRetentionPolicy.findMany({
        where: {
          organizationId,
          isActive: true,
        },
        orderBy: { priority: 'desc' },
      });

      for (const policy of policies) {
        // Calculate date thresholds
        const archiveThreshold = new Date();
        archiveThreshold.setDate(archiveThreshold.getDate() - policy.activeRetentionDays);

        const deleteThreshold = new Date();
        deleteThreshold.setDate(deleteThreshold.getDate() - policy.totalRetentionDays);

        // Build query filters
        const whereClause: any = {
          organizationId: policy.organizationId,
          eventTimestamp: { lt: archiveThreshold },
        };

        if (policy.eventTypes.length > 0) {
          whereClause.eventType = { in: policy.eventTypes };
        }

        if (policy.resourceTypes.length > 0) {
          whereClause.resourceType = { in: policy.resourceTypes };
        }

        if (policy.severity.length > 0) {
          whereClause.severity = { in: policy.severity };
        }

        // Find logs for archiving
        const logsToArchive = await this.prisma.auditLog.findMany({
          where: whereClause,
          select: { id: true },
        });

        if (logsToArchive.length > 0 && policy.enableArchiving) {
          const archiveRequest: CreateArchiveRequest = {
            auditLogIds: logsToArchive.map(log => log.id),
            archiveReason: 'retention_policy',
            retentionDays: policy.archiveRetentionDays,
            compressionType: policy.compressionEnabled ? 'gzip' : 'gzip',
          };

          const archiveResult = await this.archiveAuditLogs(archiveRequest, organizationId);
          result.archived += archiveResult.archived;
          result.errors.push(...archiveResult.errors);
        }

        // Find logs for deletion (beyond total retention)
        const logsToDelete = await this.prisma.auditLog.findMany({
          where: {
            ...whereClause,
            eventTimestamp: { lt: deleteThreshold },
          },
          select: { id: true },
        });

        if (logsToDelete.length > 0) {
          // Only delete if not required for compliance
          const canDelete = !policy.complianceFrameworks.some(framework =>
            COMPLIANCE_FRAMEWORKS[framework as keyof typeof COMPLIANCE_FRAMEWORKS]?.defaultRetentionDays > policy.totalRetentionDays
          );

          if (canDelete) {
            await this.prisma.auditLog.deleteMany({
              where: {
                id: { in: logsToDelete.map(log => log.id) },
              },
            });
            result.deleted += logsToDelete.length;
          }
        }

        result.processed += logsToArchive.length + logsToDelete.length;
      }

    } catch (error) {
      logger.error({ error, organizationId }, 'Retention policy application failed');
      result.errors.push(`Retention policy application failed: ${error}`);
    }

    return result;
  }

  // ============================================================================
  // COMPLIANCE TRAILS
  // ============================================================================

  /**
   * Create a new compliance trail
   */
  public async createComplianceTrail(
    request: CreateComplianceTrailRequest,
    createdBy: string
  ): Promise<string> {
    try {
      const trailHash = this.calculateInitialTrailHash(request);

      const trail = await this.prisma.complianceTrail.create({
        data: {
          ...request,
          trailHash,
        },
      });

      logger.info({
        trailId: trail.trailId,
        complianceFramework: request.complianceFramework,
        createdBy,
      }, 'Compliance trail created');

      return trail.id;

    } catch (error) {
      logger.error({ error, request }, 'Failed to create compliance trail');
      throw new Error(`Failed to create compliance trail: ${error}`);
    }
  }

  /**
   * Add events to a compliance trail
   */
  public async addEventsToComplianceTrail(
    trailId: string,
    events: AddComplianceTrailEventRequest[]
  ): Promise<void> {
    try {
      await this.prisma.$transaction(async (tx) => {
        const trail = await tx.complianceTrail.findUnique({
          where: { id: trailId },
        });

        if (!trail) {
          throw new Error('Compliance trail not found');
        }

        let sequenceNumber = trail.eventCount + 1;
        let previousEventHash = trail.lastEventHash;

        for (const eventRequest of events) {
          // Get the audit log to calculate hash
          const auditLog = await tx.auditLog.findUnique({
            where: { id: eventRequest.auditLogId },
          });

          if (!auditLog) {
            throw new Error(`Audit log ${eventRequest.auditLogId} not found`);
          }

          const eventHash = this.calculateEventHash(auditLog);

          // Create trail event
          await tx.complianceTrailEvent.create({
            data: {
              ...eventRequest,
              trailId,
              sequenceNumber,
              eventHash,
              previousEventHash,
            },
          });

          // Update trail
          const updatedTrailHash = this.calculateTrailHash(trail.trailHash, eventHash);

          await tx.complianceTrail.update({
            where: { id: trailId },
            data: {
              trailHash: updatedTrailHash,
              eventCount: sequenceNumber,
              lastEventId: auditLog.id,
              lastEventHash: eventHash,
            },
          });

          previousEventHash = eventHash;
          sequenceNumber++;
        }
      });

      logger.info({
        trailId,
        eventsAdded: events.length,
      }, 'Events added to compliance trail');

    } catch (error) {
      logger.error({ error, trailId }, 'Failed to add events to compliance trail');
      throw new Error(`Failed to add events to compliance trail: ${error}`);
    }
  }

  // ============================================================================
  // INTEGRITY CHECKS
  // ============================================================================

  /**
   * Run comprehensive integrity check
   */
  public async runIntegrityCheck(
    request: RunIntegrityCheckRequest
  ): Promise<string> {
    try {
      const startTime = Date.now();

      // Get event count
      const eventCount = await this.prisma.auditLog.count({
        where: {
          organizationId: request.organizationId,
          eventTimestamp: {
            gte: request.startDate,
            lte: request.endDate,
          },
        },
      });

      let checkResults: any = {};
      let failedEvents: string[] = [];
      let status: 'passed' | 'failed' | 'warning' = 'passed';
      let integrityScore = 1.0;
      let tamperingDetected = false;

      if (request.checkType === 'integrity_verification' || request.checkType === 'chain_validation') {
        const integrityResult = await this.verifyLogIntegrity(
          request.organizationId!,
          request.startDate,
          request.endDate
        );

        checkResults.integrity = integrityResult;
        failedEvents = integrityResult.invalidEvents;
        integrityScore = integrityResult.validEvents / integrityResult.totalEvents;

        if (!integrityResult.isValid) {
          status = 'failed';
        } else if (integrityScore < 0.99) {
          status = 'warning';
        }
      }

      if (request.checkType === 'tamper_detection') {
        const tamperResult = await this.detectTampering(request.organizationId!);

        checkResults.tampering = tamperResult;
        tamperingDetected = tamperResult.tamperingDetected;
        failedEvents = tamperResult.suspiciousEvents.map(e => e.eventId);

        if (tamperingDetected) {
          status = 'failed';
          integrityScore = Math.max(0, 1 - (tamperResult.suspiciousEvents.length / eventCount));
        }
      }

      const executionTime = Date.now() - startTime;

      // Save check results
      const check = await this.prisma.auditLogIntegrityCheck.create({
        data: {
          checkType: request.checkType,
          organizationId: request.organizationId,
          startDate: request.startDate,
          endDate: request.endDate,
          eventCount,
          status,
          integrityScore,
          issuesFound: failedEvents.length,
          tamperingDetected,
          checkResults,
          failedEvents,
          recommendations: this.generateRecommendations(status, checkResults),
          executedBy: 'system', // TODO: Get from context
          executionTime,
        },
      });

      logger.info({
        checkId: check.id,
        checkType: request.checkType,
        status,
        integrityScore,
        executionTime,
      }, 'Integrity check completed');

      return check.id;

    } catch (error) {
      logger.error({ error, request }, 'Integrity check failed');
      throw new Error(`Integrity check failed: ${error}`);
    }
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  private generateEncryptionKeyId(): string {
    return createHash('sha256')
      .update(this.encryptionKey + randomBytes(16).toString('hex'))
      .digest('hex')
      .substring(0, 16);
  }

  private calculateInitialTrailHash(trail: CreateComplianceTrailRequest): string {
    const data = {
      trailId: trail.trailId,
      complianceFramework: trail.complianceFramework,
      startDate: trail.startDate,
      eventTypes: trail.eventTypes.sort(),
      resourceTypes: trail.resourceTypes.sort(),
    };

    return createHash('sha256')
      .update(JSON.stringify(data, Object.keys(data).sort()))
      .digest('hex');
  }

  private calculateTrailHash(currentHash: string, newEventHash: string): string {
    return createHash('sha256')
      .update(currentHash + newEventHash)
      .digest('hex');
  }

  private generateRecommendations(status: string, checkResults: any): string[] {
    const recommendations: string[] = [];

    if (status === 'failed') {
      recommendations.push('Immediate investigation required');
      recommendations.push('Review system access logs');
      recommendations.push('Consider forensic analysis');
    }

    if (status === 'warning') {
      recommendations.push('Monitor for recurring issues');
      recommendations.push('Review audit log generation processes');
    }

    if (checkResults.integrity?.invalidEvents?.length > 0) {
      recommendations.push('Verify hash calculation algorithms');
      recommendations.push('Check for clock synchronization issues');
    }

    if (checkResults.tampering?.tamperingDetected) {
      recommendations.push('Enable enhanced security monitoring');
      recommendations.push('Implement real-time integrity checks');
    }

    return recommendations;
  }

  private async startBackgroundTasks(): Promise<void> {
    // Run integrity checks periodically
    setInterval(async () => {
      try {
        const organizations = await this.prisma.organization.findMany({
          select: { id: true },
        });

        for (const org of organizations) {
          const endDate = new Date();
          const startDate = new Date();
          startDate.setHours(startDate.getHours() - this.integrityCheckInterval);

          await this.runIntegrityCheck({
            checkType: 'integrity_verification',
            organizationId: org.id,
            startDate,
            endDate,
          });
        }
      } catch (error) {
        logger.error({ error }, 'Background integrity check failed');
      }
    }, this.integrityCheckInterval * 60 * 60 * 1000); // Convert hours to milliseconds

    // Run retention policy application daily
    setInterval(async () => {
      try {
        const organizations = await this.prisma.organization.findMany({
          select: { id: true },
        });

        for (const org of organizations) {
          await this.applyRetentionPolicies(org.id);
        }
      } catch (error) {
        logger.error({ error }, 'Background retention policy application failed');
      }
    }, 24 * 60 * 60 * 1000); // Daily
  }
}