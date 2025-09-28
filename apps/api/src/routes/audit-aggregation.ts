import { FastifyPluginAsync } from 'fastify';
import { AuditLogAggregationService } from '@/services/audit-log-aggregation-service';
import {
  CreateAuditRetentionPolicyRequest,
  UpdateAuditRetentionPolicyRequest,
  CreateComplianceTrailRequest,
  AddComplianceTrailEventRequest,
  RunIntegrityCheckRequest,
  CreateArchiveRequest,
  RestoreArchiveRequest,
  AuditLogAggregationQuery,
} from '@/lib/schemas/audit-aggregation';

const auditAggregationRoutes: FastifyPluginAsync = async (fastify) => {
  const auditService = new AuditLogAggregationService(fastify.prisma);

  // ============================================================================
  // RETENTION POLICIES
  // ============================================================================

  // Create retention policy
  fastify.post<{
    Body: CreateAuditRetentionPolicyRequest;
  }>('/retention-policies', {
    schema: {
      description: 'Create a new audit log retention policy',
      tags: ['Audit Aggregation'],
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 100 },
          description: { type: 'string', maxLength: 500 },
          organizationId: { type: 'string' },
          eventTypes: { type: 'array', items: { type: 'string' } },
          resourceTypes: { type: 'array', items: { type: 'string' } },
          severity: {
            type: 'array',
            items: { type: 'string', enum: ['info', 'warning', 'error', 'critical'] }
          },
          complianceFrameworks: {
            type: 'array',
            items: { type: 'string', enum: ['GDPR', 'SOX', 'HIPAA', 'PCI-DSS', 'ISO27001', 'CCPA'] }
          },
          activeRetentionDays: { type: 'integer', minimum: 1, maximum: 7300 },
          archiveRetentionDays: { type: 'integer', minimum: 0, maximum: 36500 },
          totalRetentionDays: { type: 'integer', minimum: 1, maximum: 36500 },
          enableArchiving: { type: 'boolean' },
          compressionEnabled: { type: 'boolean' },
          encryptionEnabled: { type: 'boolean' },
          isActive: { type: 'boolean' },
          priority: { type: 'integer', minimum: 1, maximum: 1000 },
          createdBy: { type: 'string' },
        },
        required: ['name', 'activeRetentionDays', 'archiveRetentionDays', 'totalRetentionDays', 'createdBy'],
        additionalProperties: false,
      },
      response: {
        201: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            message: { type: 'string' },
          },
        },
      },
    },
  }, async (request, reply) => {
    try {
      const policy = await fastify.prisma.auditRetentionPolicy.create({
        data: request.body,
      });

      return reply.status(201).send({
        id: policy.id,
        message: 'Retention policy created successfully',
      });
    } catch (error) {
      fastify.log.error({ error, body: request.body }, 'Failed to create retention policy');
      return reply.status(500).send({
        error: 'Failed to create retention policy',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // List retention policies
  fastify.get<{
    Querystring: {
      organizationId?: string;
      isActive?: boolean;
      complianceFramework?: string;
      limit?: number;
      offset?: number;
    };
  }>('/retention-policies', {
    schema: {
      description: 'List audit log retention policies',
      tags: ['Audit Aggregation'],
      security: [{ bearerAuth: [] }],
      querystring: {
        type: 'object',
        properties: {
          organizationId: { type: 'string' },
          isActive: { type: 'boolean' },
          complianceFramework: { type: 'string', enum: ['GDPR', 'SOX', 'HIPAA', 'PCI-DSS', 'ISO27001', 'CCPA'] },
          limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
          offset: { type: 'integer', minimum: 0, default: 0 },
        },
        additionalProperties: false,
      },
    },
  }, async (request, reply) => {
    try {
      const { organizationId, isActive, complianceFramework, limit = 20, offset = 0 } = request.query;

      const where: any = {};
      if (organizationId) where.organizationId = organizationId;
      if (isActive !== undefined) where.isActive = isActive;
      if (complianceFramework) {
        where.complianceFrameworks = { has: complianceFramework };
      }

      const [policies, total] = await Promise.all([
        fastify.prisma.auditRetentionPolicy.findMany({
          where,
          orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
          take: limit,
          skip: offset,
          include: {
            organization: {
              select: { id: true, name: true, slug: true },
            },
          },
        }),
        fastify.prisma.auditRetentionPolicy.count({ where }),
      ]);

      return reply.send({
        policies,
        pagination: {
          total,
          limit,
          offset,
          hasMore: offset + limit < total,
        },
      });
    } catch (error) {
      fastify.log.error({ error, query: request.query }, 'Failed to list retention policies');
      return reply.status(500).send({
        error: 'Failed to list retention policies',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // Update retention policy
  fastify.put<{
    Params: { id: string };
    Body: UpdateAuditRetentionPolicyRequest;
  }>('/retention-policies/:id', {
    schema: {
      description: 'Update an audit log retention policy',
      tags: ['Audit Aggregation'],
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        properties: {
          id: { type: 'string' },
        },
        required: ['id'],
      },
    },
  }, async (request, reply) => {
    try {
      const policy = await fastify.prisma.auditRetentionPolicy.update({
        where: { id: request.params.id },
        data: request.body,
      });

      return reply.send({
        id: policy.id,
        message: 'Retention policy updated successfully',
      });
    } catch (error) {
      fastify.log.error({ error, id: request.params.id }, 'Failed to update retention policy');
      return reply.status(500).send({
        error: 'Failed to update retention policy',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // ============================================================================
  // COMPLIANCE TRAILS
  // ============================================================================

  // Create compliance trail
  fastify.post<{
    Body: CreateComplianceTrailRequest;
  }>('/compliance-trails', {
    schema: {
      description: 'Create a new compliance trail',
      tags: ['Audit Aggregation'],
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        properties: {
          trailId: { type: 'string', format: 'uuid' },
          name: { type: 'string', minLength: 1, maxLength: 100 },
          description: { type: 'string', maxLength: 500 },
          complianceFramework: { type: 'string', enum: ['GDPR', 'SOX', 'HIPAA', 'PCI-DSS', 'ISO27001', 'CCPA'] },
          organizationId: { type: 'string' },
          startDate: { type: 'string', format: 'date-time' },
          endDate: { type: 'string', format: 'date-time' },
          eventTypes: { type: 'array', items: { type: 'string' } },
          resourceTypes: { type: 'array', items: { type: 'string' } },
          actorTypes: {
            type: 'array',
            items: { type: 'string', enum: ['user', 'system', 'api_key', 'agent', 'external'] }
          },
          severityLevels: {
            type: 'array',
            items: { type: 'string', enum: ['info', 'warning', 'error', 'critical'] }
          },
        },
        required: ['trailId', 'name', 'complianceFramework', 'startDate'],
        additionalProperties: false,
      },
    },
  }, async (request, reply) => {
    try {
      const trailId = await auditService.createComplianceTrail(
        request.body,
        request.user?.id || 'system'
      );

      return reply.status(201).send({
        id: trailId,
        message: 'Compliance trail created successfully',
      });
    } catch (error) {
      fastify.log.error({ error, body: request.body }, 'Failed to create compliance trail');
      return reply.status(500).send({
        error: 'Failed to create compliance trail',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // Add events to compliance trail
  fastify.post<{
    Params: { id: string };
    Body: { events: AddComplianceTrailEventRequest[] };
  }>('/compliance-trails/:id/events', {
    schema: {
      description: 'Add events to a compliance trail',
      tags: ['Audit Aggregation'],
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        properties: {
          id: { type: 'string' },
        },
        required: ['id'],
      },
      body: {
        type: 'object',
        properties: {
          events: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                trailId: { type: 'string' },
                auditLogId: { type: 'string' },
                complianceRelevance: { type: 'string', enum: ['high', 'medium', 'low'] },
                regulatoryTags: { type: 'array', items: { type: 'string' } },
              },
              required: ['trailId', 'auditLogId', 'complianceRelevance'],
            },
          },
        },
        required: ['events'],
      },
    },
  }, async (request, reply) => {
    try {
      await auditService.addEventsToComplianceTrail(request.params.id, request.body.events);

      return reply.send({
        message: 'Events added to compliance trail successfully',
        eventsAdded: request.body.events.length,
      });
    } catch (error) {
      fastify.log.error({ error, id: request.params.id }, 'Failed to add events to compliance trail');
      return reply.status(500).send({
        error: 'Failed to add events to compliance trail',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // Get compliance trail
  fastify.get<{
    Params: { id: string };
  }>('/compliance-trails/:id', {
    schema: {
      description: 'Get compliance trail details',
      tags: ['Audit Aggregation'],
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        properties: {
          id: { type: 'string' },
        },
        required: ['id'],
      },
    },
  }, async (request, reply) => {
    try {
      const trail = await fastify.prisma.complianceTrail.findUnique({
        where: { id: request.params.id },
        include: {
          events: {
            take: 100,
            orderBy: { sequenceNumber: 'desc' },
          },
          organization: {
            select: { id: true, name: true, slug: true },
          },
        },
      });

      if (!trail) {
        return reply.status(404).send({
          error: 'Compliance trail not found',
        });
      }

      return reply.send(trail);
    } catch (error) {
      fastify.log.error({ error, id: request.params.id }, 'Failed to get compliance trail');
      return reply.status(500).send({
        error: 'Failed to get compliance trail',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // ============================================================================
  // INTEGRITY CHECKS
  // ============================================================================

  // Run integrity check
  fastify.post<{
    Body: RunIntegrityCheckRequest;
  }>('/integrity-checks', {
    schema: {
      description: 'Run audit log integrity check',
      tags: ['Audit Aggregation'],
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        properties: {
          checkType: { type: 'string', enum: ['integrity_verification', 'tamper_detection', 'chain_validation'] },
          organizationId: { type: 'string' },
          startDate: { type: 'string', format: 'date-time' },
          endDate: { type: 'string', format: 'date-time' },
          includeDetails: { type: 'boolean' },
        },
        required: ['checkType', 'startDate', 'endDate'],
        additionalProperties: false,
      },
    },
  }, async (request, reply) => {
    try {
      const checkId = await auditService.runIntegrityCheck(request.body);

      return reply.status(201).send({
        checkId,
        message: 'Integrity check started successfully',
      });
    } catch (error) {
      fastify.log.error({ error, body: request.body }, 'Failed to run integrity check');
      return reply.status(500).send({
        error: 'Failed to run integrity check',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // Get integrity check results
  fastify.get<{
    Params: { id: string };
  }>('/integrity-checks/:id', {
    schema: {
      description: 'Get integrity check results',
      tags: ['Audit Aggregation'],
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        properties: {
          id: { type: 'string' },
        },
        required: ['id'],
      },
    },
  }, async (request, reply) => {
    try {
      const check = await fastify.prisma.auditLogIntegrityCheck.findUnique({
        where: { id: request.params.id },
        include: {
          organization: {
            select: { id: true, name: true, slug: true },
          },
        },
      });

      if (!check) {
        return reply.status(404).send({
          error: 'Integrity check not found',
        });
      }

      return reply.send(check);
    } catch (error) {
      fastify.log.error({ error, id: request.params.id }, 'Failed to get integrity check');
      return reply.status(500).send({
        error: 'Failed to get integrity check',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // ============================================================================
  // ARCHIVAL OPERATIONS
  // ============================================================================

  // Archive audit logs
  fastify.post<{
    Body: CreateArchiveRequest;
  }>('/archives', {
    schema: {
      description: 'Archive audit logs',
      tags: ['Audit Aggregation'],
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        properties: {
          auditLogIds: { type: 'array', items: { type: 'string' }, minItems: 1 },
          archiveReason: { type: 'string', enum: ['retention_policy', 'compliance_requirement', 'manual'] },
          retentionDays: { type: 'integer', minimum: 1, maximum: 36500 },
          complianceFramework: { type: 'string', enum: ['GDPR', 'SOX', 'HIPAA', 'PCI-DSS', 'ISO27001', 'CCPA'] },
          compressionType: { type: 'string', enum: ['gzip', 'brotli'] },
        },
        required: ['auditLogIds', 'archiveReason', 'retentionDays'],
        additionalProperties: false,
      },
    },
  }, async (request, reply) => {
    try {
      const organizationId = request.user?.organizationId;
      const result = await auditService.archiveAuditLogs(request.body, organizationId);

      return reply.status(201).send({
        message: 'Archive operation completed',
        result,
      });
    } catch (error) {
      fastify.log.error({ error, body: request.body }, 'Failed to archive audit logs');
      return reply.status(500).send({
        error: 'Failed to archive audit logs',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // Apply retention policies
  fastify.post<{
    Body: { organizationId?: string; dryRun?: boolean };
  }>('/retention-policies/apply', {
    schema: {
      description: 'Apply retention policies to audit logs',
      tags: ['Audit Aggregation'],
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        properties: {
          organizationId: { type: 'string' },
          dryRun: { type: 'boolean' },
        },
        additionalProperties: false,
      },
    },
  }, async (request, reply) => {
    try {
      const organizationId = request.body.organizationId || request.user?.organizationId;

      if (request.body.dryRun) {
        // TODO: Implement dry run logic
        return reply.send({
          message: 'Dry run completed',
          result: { processed: 0, archived: 0, deleted: 0, errors: [] },
        });
      }

      const result = await auditService.applyRetentionPolicies(organizationId);

      return reply.send({
        message: 'Retention policies applied successfully',
        result,
      });
    } catch (error) {
      fastify.log.error({ error, body: request.body }, 'Failed to apply retention policies');
      return reply.status(500).send({
        error: 'Failed to apply retention policies',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // List audit log aggregations
  fastify.get<{
    Querystring: AuditLogAggregationQuery;
  }>('/aggregations', {
    schema: {
      description: 'Get audit log aggregations and analytics',
      tags: ['Audit Aggregation'],
      security: [{ bearerAuth: [] }],
      querystring: {
        type: 'object',
        properties: {
          organizationId: { type: 'string' },
          startDate: { type: 'string', format: 'date-time' },
          endDate: { type: 'string', format: 'date-time' },
          eventTypes: { type: 'array', items: { type: 'string' } },
          resourceTypes: { type: 'array', items: { type: 'string' } },
          actorTypes: { type: 'array', items: { type: 'string' } },
          severity: {
            type: 'array',
            items: { type: 'string', enum: ['info', 'warning', 'error', 'critical'] }
          },
          complianceFramework: { type: 'string', enum: ['GDPR', 'SOX', 'HIPAA', 'PCI-DSS', 'ISO27001', 'CCPA'] },
          includeArchived: { type: 'boolean' },
          groupBy: { type: 'string', enum: ['hour', 'day', 'week', 'month'] },
          aggregateMetrics: {
            type: 'array',
            items: { type: 'string', enum: ['count', 'unique_actors', 'unique_resources', 'severity_distribution'] }
          },
          limit: { type: 'integer', minimum: 1, maximum: 10000 },
          offset: { type: 'integer', minimum: 0 },
        },
        additionalProperties: false,
      },
    },
  }, async (request, reply) => {
    try {
      const query = request.query;
      const organizationId = query.organizationId || request.user?.organizationId;

      // Build the base query
      const whereClause: any = {
        organizationId,
      };

      if (query.startDate || query.endDate) {
        whereClause.eventTimestamp = {};
        if (query.startDate) whereClause.eventTimestamp.gte = new Date(query.startDate);
        if (query.endDate) whereClause.eventTimestamp.lte = new Date(query.endDate);
      }

      if (query.eventTypes?.length) {
        whereClause.eventType = { in: query.eventTypes };
      }

      if (query.resourceTypes?.length) {
        whereClause.resourceType = { in: query.resourceTypes };
      }

      if (query.actorTypes?.length) {
        whereClause.actorType = { in: query.actorTypes };
      }

      if (query.severity?.length) {
        whereClause.severity = { in: query.severity };
      }

      // Get aggregated data
      const [totalCount, logs] = await Promise.all([
        fastify.prisma.auditLog.count({ where: whereClause }),
        fastify.prisma.auditLog.findMany({
          where: whereClause,
          orderBy: { eventTimestamp: 'desc' },
          take: query.limit || 100,
          skip: query.offset || 0,
          select: {
            id: true,
            eventType: true,
            resourceType: true,
            actorType: true,
            actorId: true,
            severity: true,
            eventTimestamp: true,
            outcome: true,
          },
        }),
      ]);

      // Calculate metrics
      const metrics = {
        totalEvents: totalCount,
        uniqueActors: new Set(logs.map(log => log.actorId).filter(Boolean)).size,
        uniqueResources: new Set(logs.map(log => `${log.resourceType}:${log.resourceId}`)).size,
        severityDistribution: logs.reduce((acc, log) => {
          acc[log.severity] = (acc[log.severity] || 0) + 1;
          return acc;
        }, {} as Record<string, number>),
        outcomeDistribution: logs.reduce((acc, log) => {
          acc[log.outcome] = (acc[log.outcome] || 0) + 1;
          return acc;
        }, {} as Record<string, number>),
      };

      return reply.send({
        logs,
        metrics,
        pagination: {
          total: totalCount,
          limit: query.limit || 100,
          offset: query.offset || 0,
          hasMore: (query.offset || 0) + (query.limit || 100) < totalCount,
        },
      });
    } catch (error) {
      fastify.log.error({ error, query: request.query }, 'Failed to get audit log aggregations');
      return reply.status(500).send({
        error: 'Failed to get audit log aggregations',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });
};

export default auditAggregationRoutes;