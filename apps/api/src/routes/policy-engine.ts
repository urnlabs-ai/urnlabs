import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { EnhancedPolicyEvaluationEngine, EnhancedPolicyEvaluationContext } from '../services/enhanced-policy-engine.js';
import { PolicyTemplateLibraryService } from '../services/policy-template-library.js';
import { PolicySchemaManagementService } from '../services/policy-schema-management.js';
import { ComplianceMonitoringService } from '../services/compliance-monitoring-service.js';
import { PolicyConflictDetectionService } from '../services/policy-conflict-detection.js';
import { PolicyVisualizationService } from '../services/policy-visualization.js';
import { z } from 'zod';

/**
 * Policy Engine API Routes
 * 
 * Comprehensive API for the enhanced policy engine system including:
 * - Policy evaluation endpoints
 * - Policy template management
 * - Schema validation and versioning
 * - Compliance monitoring and reporting
 */

const PolicyEvaluationRequestSchema = z.object({
  policyId: z.string().uuid(),
  context: z.object({
    userId: z.string().uuid(),
    organizationId: z.string().uuid(),
    sessionId: z.string().optional(),
    requestId: z.string().optional(),
    resource: z.object({
      type: z.string(),
      id: z.string(),
      attributes: z.record(z.any()).optional()
    }).optional(),
    action: z.object({
      type: z.string(),
      method: z.string().optional(),
      parameters: z.record(z.any()).optional()
    }).optional(),
    request: z.object({
      ipAddress: z.string().optional(),
      userAgent: z.string().optional(),
      timestamp: z.date().default(() => new Date()),
      endpoint: z.string().optional(),
      httpMethod: z.string().optional(),
      headers: z.record(z.string()).optional(),
      body: z.any().optional()
    }).optional(),
    metadata: z.record(z.any()).optional()
  })
});

const BulkPolicyEvaluationRequestSchema = z.object({
  policyIds: z.array(z.string().uuid()),
  context: PolicyEvaluationRequestSchema.shape.context
});

const PolicyTemplateInstantiationSchema = z.object({
  templateId: z.string(),
  variables: z.record(z.any()),
  policyName: z.string().optional(),
  policyDescription: z.string().optional(),
  effectiveDate: z.date().optional(),
  expirationDate: z.date().optional(),
  ownerId: z.string().uuid().optional(),
  classification: z.enum(['public', 'internal', 'confidential', 'restricted']).optional(),
  status: z.enum(['draft', 'review', 'approved', 'active']).optional(),
  riskLevel: z.enum(['very_low', 'low', 'medium', 'high', 'very_high', 'critical']).optional(),
  tags: z.array(z.string()).optional(),
  enforced: z.boolean().optional(),
  enforcementMode: z.enum(['strict', 'permissive', 'monitoring', 'disabled']).optional()
});

const ComplianceReportRequestSchema = z.object({
  templateId: z.string(),
  dateRange: z.object({
    start: z.date(),
    end: z.date()
  }).optional(),
  includeEvidence: z.boolean().default(false),
  format: z.enum(['pdf', 'html', 'csv', 'json']).default('json')
});

const ComplianceAlertsSetupSchema = z.object({
  alerts: z.array(z.object({
    name: z.string(),
    framework: z.string(),
    threshold: z.number().min(0).max(100),
    condition: z.enum(['below', 'above', 'equals']),
    recipients: z.array(z.string().email()),
    frequency: z.enum(['immediate', 'daily', 'weekly'])
  }))
});

const ConflictDetectionRequestSchema = z.object({
  policyIds: z.array(z.string().uuid()).optional(),
  options: z.object({
    includeInactivePolicies: z.boolean().default(false),
    scope: z.array(z.string()).optional(),
    severityThreshold: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).default('LOW'),
    enableDeepAnalysis: z.boolean().default(true),
    useCache: z.boolean().default(true)
  }).optional()
});

const ImpactAnalysisRequestSchema = z.object({
  policyId: z.string().uuid(),
  changeType: z.enum(['CREATE', 'UPDATE', 'DELETE', 'ACTIVATE', 'DEACTIVATE']),
  newPolicyData: z.any().optional(),
  existingPolicyIds: z.array(z.string().uuid()).optional()
});

const ConflictResolutionRequestSchema = z.object({
  conflictId: z.string().uuid(),
  options: z.object({
    autoResolve: z.boolean().default(false),
    preferredStrategy: z.string().optional(),
    requireApproval: z.boolean().default(true),
    testBeforeApply: z.boolean().default(true),
    maxRiskLevel: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).default('MEDIUM')
  }).optional()
});

const ResolutionExecutionRequestSchema = z.object({
  planId: z.string().uuid(),
  options: z.object({
    dryRun: z.boolean().default(false),
    skipApproval: z.boolean().default(false)
  }).optional()
});

const VisualizationRequestSchema = z.object({
  type: z.enum(['POLICY_OVERVIEW', 'CONFLICT_ANALYSIS', 'DEPENDENCY_GRAPH', 'COMPLIANCE_MAP', 'IMPACT_ANALYSIS']),
  policyIds: z.array(z.string().uuid()).optional(),
  conflictIds: z.array(z.string().uuid()).optional(),
  frameworks: z.array(z.string()).optional(),
  options: z.object({
    includeInactivePolicies: z.boolean().default(false),
    maxDepth: z.number().default(3),
    focusOnConflicts: z.boolean().default(false),
    groupByFramework: z.boolean().default(true),
    showImpactRadius: z.boolean().default(false),
    layout: z.enum(['force_directed', 'hierarchical', 'circular', 'grid']).default('force_directed')
  }).optional()
});

export async function policyEngineRoutes(fastify: FastifyInstance) {
  // Initialize services
  const policyEngine = new EnhancedPolicyEvaluationEngine(fastify.prisma, {
    enableCaching: true,
    enableCompilation: true,
    enableValidation: true,
    performanceMode: 'optimized'
  });

  const templateLibrary = new PolicyTemplateLibraryService(fastify.prisma);
  const schemaManagement = new PolicySchemaManagementService(fastify.prisma);
  const complianceMonitoring = new ComplianceMonitoringService(fastify.prisma);
  const conflictDetection = new PolicyConflictDetectionService();
  const visualization = new PolicyVisualizationService();

  // ============================================================================
  // POLICY EVALUATION ENDPOINTS
  // ============================================================================

  /**
   * Evaluate a single policy
   */
  fastify.post('/evaluate', {
    schema: {
      description: 'Evaluate a policy against provided context',
      tags: ['Policy Engine'],
      body: PolicyEvaluationRequestSchema,
      response: {
        200: {
          description: 'Policy evaluation result',
          type: 'object',
          properties: {
            decision: { type: 'string', enum: ['allow', 'deny', 'require_approval', 'conditional_allow'] },
            policyId: { type: 'string' },
            confidence: { type: 'number' },
            reasoning: { type: 'string' },
            evaluationTime: { type: 'number' },
            cacheHit: { type: 'boolean' }
          }
        }
      }
    }
  }, async (request: FastifyRequest<{ Body: z.infer<typeof PolicyEvaluationRequestSchema> }>, reply: FastifyReply) => {
    try {
      const { policyId, context } = request.body;

      // Enhance context with request information
      const enhancedContext: EnhancedPolicyEvaluationContext = {
        ...context,
        user: {
          roles: [], // Would be populated from user context
          permissions: [], // Would be populated from user context
          ...context.metadata?.user
        },
        environment: {
          name: process.env.NODE_ENV || 'development',
          ...context.metadata?.environment
        },
        request: {
          timestamp: new Date(),
          ...context.request
        }
      };

      const result = await policyEngine.evaluatePolicy(policyId, enhancedContext);

      return reply.code(200).send(result);

    } catch (error) {
      fastify.log.error('Policy evaluation failed', { error: error.message });
      return reply.code(500).send({
        error: 'Policy evaluation failed',
        message: error.message
      });
    }
  });

  /**
   * Evaluate multiple policies (bulk evaluation)
   */
  fastify.post('/evaluate/bulk', {
    schema: {
      description: 'Evaluate multiple policies in bulk',
      tags: ['Policy Engine'],
      body: BulkPolicyEvaluationRequestSchema,
      response: {
        200: {
          description: 'Bulk policy evaluation results',
          type: 'object'
        }
      }
    }
  }, async (request: FastifyRequest<{ Body: z.infer<typeof BulkPolicyEvaluationRequestSchema> }>, reply: FastifyReply) => {
    try {
      const { policyIds, context } = request.body;

      const enhancedContext: EnhancedPolicyEvaluationContext = {
        ...context,
        user: {
          roles: [],
          permissions: [],
          ...context.metadata?.user
        },
        environment: {
          name: process.env.NODE_ENV || 'development',
          ...context.metadata?.environment
        },
        request: {
          timestamp: new Date(),
          ...context.request
        }
      };

      const result = await policyEngine.evaluateMultiplePolicies(policyIds, enhancedContext);

      return reply.code(200).send(result);

    } catch (error) {
      fastify.log.error('Bulk policy evaluation failed', { error: error.message });
      return reply.code(500).send({
        error: 'Bulk policy evaluation failed',
        message: error.message
      });
    }
  });

  /**
   * Get policy engine statistics
   */
  fastify.get('/statistics', {
    schema: {
      description: 'Get policy engine performance statistics',
      tags: ['Policy Engine'],
      response: {
        200: {
          description: 'Policy engine statistics',
          type: 'object'
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const stats = policyEngine.getStatistics();
      return reply.code(200).send(stats);
    } catch (error) {
      fastify.log.error('Failed to get statistics', { error: error.message });
      return reply.code(500).send({
        error: 'Failed to get statistics',
        message: error.message
      });
    }
  });

  // ============================================================================
  // POLICY TEMPLATE ENDPOINTS
  // ============================================================================

  /**
   * Get all policy templates
   */
  fastify.get('/templates', {
    schema: {
      description: 'Get all available policy templates',
      tags: ['Policy Templates'],
      querystring: {
        type: 'object',
        properties: {
          category: { type: 'string' },
          governanceScenario: { type: 'string' },
          complianceFramework: { type: 'string' },
          search: { type: 'string' },
          status: { type: 'string' }
        }
      },
      response: {
        200: {
          description: 'List of policy templates',
          type: 'array',
          items: { type: 'object' }
        }
      }
    }
  }, async (request: FastifyRequest<{ Querystring: any }>, reply: FastifyReply) => {
    try {
      const templates = await templateLibrary.getTemplates(request.query);
      return reply.code(200).send(templates);
    } catch (error) {
      fastify.log.error('Failed to get templates', { error: error.message });
      return reply.code(500).send({
        error: 'Failed to get templates',
        message: error.message
      });
    }
  });

  /**
   * Get specific policy template
   */
  fastify.get('/templates/:templateId', {
    schema: {
      description: 'Get a specific policy template',
      tags: ['Policy Templates'],
      params: {
        type: 'object',
        properties: {
          templateId: { type: 'string' }
        },
        required: ['templateId']
      },
      response: {
        200: {
          description: 'Policy template details',
          type: 'object'
        },
        404: {
          description: 'Template not found',
          type: 'object'
        }
      }
    }
  }, async (request: FastifyRequest<{ Params: { templateId: string } }>, reply: FastifyReply) => {
    try {
      const template = await templateLibrary.getTemplate(request.params.templateId);
      
      if (!template) {
        return reply.code(404).send({
          error: 'Template not found',
          templateId: request.params.templateId
        });
      }

      return reply.code(200).send(template);
    } catch (error) {
      fastify.log.error('Failed to get template', { error: error.message });
      return reply.code(500).send({
        error: 'Failed to get template',
        message: error.message
      });
    }
  });

  /**
   * Instantiate policy from template
   */
  fastify.post('/templates/:templateId/instantiate', {
    schema: {
      description: 'Create a policy instance from a template',
      tags: ['Policy Templates'],
      params: {
        type: 'object',
        properties: {
          templateId: { type: 'string' }
        },
        required: ['templateId']
      },
      body: PolicyTemplateInstantiationSchema,
      response: {
        201: {
          description: 'Policy created from template',
          type: 'object'
        }
      }
    }
  }, async (request: FastifyRequest<{ 
    Params: { templateId: string };
    Body: z.infer<typeof PolicyTemplateInstantiationSchema>
  }>, reply: FastifyReply) => {
    try {
      const { templateId } = request.params;
      const { variables, ...options } = request.body;
      
      // Get user info from request context
      const userId = (request as any).user?.id;
      const organizationId = (request as any).user?.organizationId;

      if (!userId || !organizationId) {
        return reply.code(401).send({
          error: 'Authentication required',
          message: 'User ID and organization ID are required'
        });
      }

      const policy = await templateLibrary.instantiateTemplate(
        templateId,
        { ...variables, ...options },
        organizationId,
        userId
      );

      // Store the policy in database
      await fastify.prisma.policy.create({
        data: {
          id: policy.metadata.id,
          name: policy.metadata.name,
          description: policy.metadata.description,
          version: policy.metadata.version,
          organizationId: policy.metadata.organizationId,
          createdBy: policy.metadata.createdBy,
          updatedBy: policy.metadata.updatedBy,
          ownerId: policy.metadata.ownerId,
          classification: policy.metadata.classification,
          status: policy.metadata.status,
          category: policy.metadata.category,
          type: policy.definition.type,
          priority: policy.metadata.riskLevel,
          effectiveDate: policy.metadata.effectiveDate,
          expirationDate: policy.metadata.expirationDate,
          complianceFrameworks: policy.metadata.complianceFrameworks,
          riskLevel: policy.metadata.riskLevel,
          tags: policy.metadata.tags,
          isEnforced: policy.metadata.enforced,
          enforcementMode: policy.metadata.enforcementMode,
          rules: policy.definition as any
        }
      });

      return reply.code(201).send({
        policyId: policy.metadata.id,
        message: 'Policy created successfully from template',
        policy
      });

    } catch (error) {
      fastify.log.error('Failed to instantiate template', { error: error.message });
      return reply.code(500).send({
        error: 'Failed to instantiate template',
        message: error.message
      });
    }
  });

  /**
   * Get governance scenario templates
   */
  fastify.get('/templates/governance/:scenario', {
    schema: {
      description: 'Get templates for specific governance scenario',
      tags: ['Policy Templates'],
      params: {
        type: 'object',
        properties: {
          scenario: { type: 'string' }
        },
        required: ['scenario']
      }
    }
  }, async (request: FastifyRequest<{ Params: { scenario: string } }>, reply: FastifyReply) => {
    try {
      const templates = await templateLibrary.getGovernanceScenarioTemplates(request.params.scenario);
      return reply.code(200).send(templates);
    } catch (error) {
      fastify.log.error('Failed to get governance templates', { error: error.message });
      return reply.code(500).send({
        error: 'Failed to get governance templates',
        message: error.message
      });
    }
  });

  // ============================================================================
  // SCHEMA MANAGEMENT ENDPOINTS
  // ============================================================================

  /**
   * Validate policy
   */
  fastify.post('/validate', {
    schema: {
      description: 'Validate a policy against the schema',
      tags: ['Schema Management'],
      body: {
        type: 'object',
        properties: {
          policy: { type: 'object' },
          strict: { type: 'boolean', default: false },
          context: { type: 'object' }
        },
        required: ['policy']
      },
      response: {
        200: {
          description: 'Validation result',
          type: 'object'
        }
      }
    }
  }, async (request: FastifyRequest<{ 
    Body: { policy: any; strict?: boolean; context?: any } 
  }>, reply: FastifyReply) => {
    try {
      const { policy, strict = false, context } = request.body;
      
      const result = await schemaManagement.validatePolicy(policy, {
        strict,
        context
      });

      return reply.code(200).send(result);
    } catch (error) {
      fastify.log.error('Policy validation failed', { error: error.message });
      return reply.code(500).send({
        error: 'Policy validation failed',
        message: error.message
      });
    }
  });

  /**
   * Migrate policy to latest schema
   */
  fastify.post('/migrate/:policyId', {
    schema: {
      description: 'Migrate policy to latest schema version',
      tags: ['Schema Management'],
      params: {
        type: 'object',
        properties: {
          policyId: { type: 'string' }
        },
        required: ['policyId']
      }
    }
  }, async (request: FastifyRequest<{ Params: { policyId: string } }>, reply: FastifyReply) => {
    try {
      // Get policy from database
      const policy = await fastify.prisma.policy.findUnique({
        where: { id: request.params.policyId }
      });

      if (!policy) {
        return reply.code(404).send({
          error: 'Policy not found',
          policyId: request.params.policyId
        });
      }

      // Migrate the policy
      const migratedPolicy = await schemaManagement.migratePolicy(policy);

      // Update policy in database
      await fastify.prisma.policy.update({
        where: { id: request.params.policyId },
        data: {
          rules: migratedPolicy.definition as any,
          version: migratedPolicy.metadata.version,
          updatedAt: new Date()
        }
      });

      return reply.code(200).send({
        message: 'Policy migrated successfully',
        policy: migratedPolicy
      });

    } catch (error) {
      fastify.log.error('Policy migration failed', { error: error.message });
      return reply.code(500).send({
        error: 'Policy migration failed',
        message: error.message
      });
    }
  });

  /**
   * Get policy version history
   */
  fastify.get('/policies/:policyId/versions', {
    schema: {
      description: 'Get version history for a policy',
      tags: ['Schema Management'],
      params: {
        type: 'object',
        properties: {
          policyId: { type: 'string' }
        },
        required: ['policyId']
      }
    }
  }, async (request: FastifyRequest<{ Params: { policyId: string } }>, reply: FastifyReply) => {
    try {
      const versions = await schemaManagement.getPolicyVersionHistory(request.params.policyId);
      return reply.code(200).send(versions);
    } catch (error) {
      fastify.log.error('Failed to get policy versions', { error: error.message });
      return reply.code(500).send({
        error: 'Failed to get policy versions',
        message: error.message
      });
    }
  });

  // ============================================================================
  // COMPLIANCE MONITORING ENDPOINTS
  // ============================================================================

  /**
   * Get compliance score
   */
  fastify.get('/compliance/score', {
    schema: {
      description: 'Get current compliance score',
      tags: ['Compliance Monitoring'],
      querystring: {
        type: 'object',
        properties: {
          framework: { type: 'string' }
        }
      },
      response: {
        200: {
          description: 'Compliance score',
          type: 'object'
        }
      }
    }
  }, async (request: FastifyRequest<{ Querystring: { framework?: string } }>, reply: FastifyReply) => {
    try {
      const organizationId = (request as any).user?.organizationId;
      if (!organizationId) {
        return reply.code(401).send({ error: 'Organization ID required' });
      }

      const score = await complianceMonitoring.getComplianceScore(
        organizationId,
        request.query.framework
      );

      return reply.code(200).send(score);
    } catch (error) {
      fastify.log.error('Failed to get compliance score', { error: error.message });
      return reply.code(500).send({
        error: 'Failed to get compliance score',
        message: error.message
      });
    }
  });

  /**
   * Get compliance violations
   */
  fastify.get('/compliance/violations', {
    schema: {
      description: 'Get compliance violations',
      tags: ['Compliance Monitoring'],
      querystring: {
        type: 'object',
        properties: {
          framework: { type: 'string' },
          severity: { type: 'string' },
          status: { type: 'string' },
          startDate: { type: 'string', format: 'date' },
          endDate: { type: 'string', format: 'date' }
        }
      }
    }
  }, async (request: FastifyRequest<{ Querystring: any }>, reply: FastifyReply) => {
    try {
      const organizationId = (request as any).user?.organizationId;
      if (!organizationId) {
        return reply.code(401).send({ error: 'Organization ID required' });
      }

      const filters: any = {};
      if (request.query.framework) filters.framework = request.query.framework;
      if (request.query.severity) filters.severity = request.query.severity;
      if (request.query.status) filters.status = request.query.status;
      if (request.query.startDate && request.query.endDate) {
        filters.dateRange = {
          start: new Date(request.query.startDate),
          end: new Date(request.query.endDate)
        };
      }

      const violations = await complianceMonitoring.getComplianceViolations(organizationId, filters);
      return reply.code(200).send(violations);

    } catch (error) {
      fastify.log.error('Failed to get compliance violations', { error: error.message });
      return reply.code(500).send({
        error: 'Failed to get compliance violations',
        message: error.message
      });
    }
  });

  /**
   * Generate compliance report
   */
  fastify.post('/compliance/reports', {
    schema: {
      description: 'Generate compliance report',
      tags: ['Compliance Monitoring'],
      body: ComplianceReportRequestSchema,
      response: {
        200: {
          description: 'Generated compliance report',
          type: 'object'
        }
      }
    }
  }, async (request: FastifyRequest<{ Body: z.infer<typeof ComplianceReportRequestSchema> }>, reply: FastifyReply) => {
    try {
      const organizationId = (request as any).user?.organizationId;
      if (!organizationId) {
        return reply.code(401).send({ error: 'Organization ID required' });
      }

      const report = await complianceMonitoring.generateComplianceReport(
        organizationId,
        request.body.templateId,
        {
          dateRange: request.body.dateRange,
          includeEvidence: request.body.includeEvidence,
          format: request.body.format
        }
      );

      return reply.code(200).send(report);

    } catch (error) {
      fastify.log.error('Failed to generate compliance report', { error: error.message });
      return reply.code(500).send({
        error: 'Failed to generate compliance report',
        message: error.message
      });
    }
  });

  /**
   * Get compliance dashboard
   */
  fastify.get('/compliance/dashboard', {
    schema: {
      description: 'Get compliance dashboard data',
      tags: ['Compliance Monitoring'],
      response: {
        200: {
          description: 'Compliance dashboard data',
          type: 'object'
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const organizationId = (request as any).user?.organizationId;
      if (!organizationId) {
        return reply.code(401).send({ error: 'Organization ID required' });
      }

      const dashboard = await complianceMonitoring.getComplianceDashboard(organizationId);
      return reply.code(200).send(dashboard);

    } catch (error) {
      fastify.log.error('Failed to get compliance dashboard', { error: error.message });
      return reply.code(500).send({
        error: 'Failed to get compliance dashboard',
        message: error.message
      });
    }
  });

  /**
   * Setup compliance alerts
   */
  fastify.post('/compliance/alerts', {
    schema: {
      description: 'Setup compliance alerts',
      tags: ['Compliance Monitoring'],
      body: ComplianceAlertsSetupSchema,
      response: {
        200: {
          description: 'Alerts configured successfully',
          type: 'object'
        }
      }
    }
  }, async (request: FastifyRequest<{ Body: z.infer<typeof ComplianceAlertsSetupSchema> }>, reply: FastifyReply) => {
    try {
      const organizationId = (request as any).user?.organizationId;
      if (!organizationId) {
        return reply.code(401).send({ error: 'Organization ID required' });
      }

      await complianceMonitoring.setupComplianceAlerts(organizationId, request.body.alerts);

      return reply.code(200).send({
        message: 'Compliance alerts configured successfully',
        alertCount: request.body.alerts.length
      });

    } catch (error) {
      fastify.log.error('Failed to setup compliance alerts', { error: error.message });
      return reply.code(500).send({
        error: 'Failed to setup compliance alerts',
        message: error.message
      });
    }
  });

  // ============================================================================
  // CONFLICT DETECTION AND RESOLUTION ENDPOINTS
  // ============================================================================

  /**
   * Detect policy conflicts
   */
  fastify.post('/conflicts/detect', {
    schema: {
      description: 'Detect conflicts between policies',
      tags: ['Conflict Detection'],
      body: ConflictDetectionRequestSchema,
      response: {
        200: {
          description: 'Detected conflicts',
          type: 'array',
          items: { type: 'object' }
        }
      }
    }
  }, async (request: FastifyRequest<{ Body: z.infer<typeof ConflictDetectionRequestSchema> }>, reply: FastifyReply) => {
    try {
      const { policyIds, options = {} } = request.body;
      const organizationId = (request as any).user?.organizationId;

      if (!organizationId) {
        return reply.code(401).send({ error: 'Organization ID required' });
      }

      // Get policies from database
      let policyQuery: any = { organizationId };
      if (policyIds && policyIds.length > 0) {
        policyQuery.id = { in: policyIds };
      }

      const policies = await fastify.prisma.policy.findMany({
        where: policyQuery
      });

      // Convert to enhanced policy format (simplified conversion)
      const enhancedPolicies = policies.map(policy => ({
        metadata: {
          id: policy.id,
          name: policy.name,
          description: policy.description || '',
          version: policy.version,
          status: policy.status,
          priority: policy.priority || 5,
          organizationId: policy.organizationId,
          createdBy: policy.createdBy,
          updatedBy: policy.updatedBy,
          ownerId: policy.ownerId,
          classification: policy.classification,
          category: policy.category,
          complianceFrameworks: policy.complianceFrameworks || [],
          riskLevel: policy.riskLevel,
          tags: policy.tags || [],
          enforced: policy.isEnforced,
          enforcementMode: policy.enforcementMode,
          effectiveDate: policy.effectiveDate,
          expirationDate: policy.expirationDate,
          createdAt: policy.createdAt,
          lastModified: policy.updatedAt,
          dependencies: [], // Would need to be extracted from rules
          scope: [] // Would need to be extracted from rules
        },
        definition: policy.rules,
        rules: Array.isArray(policy.rules) ? policy.rules : []
      }));

      const conflicts = await conflictDetection.detectConflicts(enhancedPolicies as any, options);

      return reply.code(200).send(conflicts);

    } catch (error) {
      fastify.log.error('Conflict detection failed', { error: error.message });
      return reply.code(500).send({
        error: 'Conflict detection failed',
        message: error.message
      });
    }
  });

  /**
   * Analyze policy change impact
   */
  fastify.post('/conflicts/impact-analysis', {
    schema: {
      description: 'Analyze impact of policy changes',
      tags: ['Conflict Detection'],
      body: ImpactAnalysisRequestSchema,
      response: {
        200: {
          description: 'Impact analysis result',
          type: 'object'
        }
      }
    }
  }, async (request: FastifyRequest<{ Body: z.infer<typeof ImpactAnalysisRequestSchema> }>, reply: FastifyReply) => {
    try {
      const { policyId, changeType, newPolicyData, existingPolicyIds } = request.body;
      const organizationId = (request as any).user?.organizationId;

      if (!organizationId) {
        return reply.code(401).send({ error: 'Organization ID required' });
      }

      // Get existing policies
      let existingPolicies: any[] = [];
      if (existingPolicyIds && existingPolicyIds.length > 0) {
        const policies = await fastify.prisma.policy.findMany({
          where: {
            id: { in: existingPolicyIds },
            organizationId
          }
        });
        existingPolicies = policies.map(p => ({ metadata: { id: p.id }, rules: p.rules || [] }));
      }

      const impact = await conflictDetection.analyzeImpact(
        policyId,
        changeType,
        newPolicyData,
        existingPolicies
      );

      return reply.code(200).send(impact);

    } catch (error) {
      fastify.log.error('Impact analysis failed', { error: error.message });
      return reply.code(500).send({
        error: 'Impact analysis failed',
        message: error.message
      });
    }
  });

  /**
   * Generate conflict resolution plan
   */
  fastify.post('/conflicts/:conflictId/resolution-plan', {
    schema: {
      description: 'Generate resolution plan for a conflict',
      tags: ['Conflict Resolution'],
      params: {
        type: 'object',
        properties: {
          conflictId: { type: 'string' }
        },
        required: ['conflictId']
      },
      body: ConflictResolutionRequestSchema,
      response: {
        200: {
          description: 'Generated resolution plan',
          type: 'object'
        }
      }
    }
  }, async (request: FastifyRequest<{
    Params: { conflictId: string };
    Body: z.infer<typeof ConflictResolutionRequestSchema>
  }>, reply: FastifyReply) => {
    try {
      const { conflictId } = request.params;
      const { options = {} } = request.body;

      const resolutionPlan = await conflictDetection.generateResolutionPlan(conflictId, options);

      return reply.code(200).send(resolutionPlan);

    } catch (error) {
      fastify.log.error('Failed to generate resolution plan', { error: error.message });
      return reply.code(500).send({
        error: 'Failed to generate resolution plan',
        message: error.message
      });
    }
  });

  /**
   * Execute conflict resolution plan
   */
  fastify.post('/conflicts/resolution/:planId/execute', {
    schema: {
      description: 'Execute a conflict resolution plan',
      tags: ['Conflict Resolution'],
      params: {
        type: 'object',
        properties: {
          planId: { type: 'string' }
        },
        required: ['planId']
      },
      body: ResolutionExecutionRequestSchema,
      response: {
        200: {
          description: 'Execution result',
          type: 'object'
        }
      }
    }
  }, async (request: FastifyRequest<{
    Params: { planId: string };
    Body: z.infer<typeof ResolutionExecutionRequestSchema>
  }>, reply: FastifyReply) => {
    try {
      const { planId } = request.params;
      const { options = {} } = request.body;

      const result = await conflictDetection.executeResolutionPlan(planId, options);

      return reply.code(200).send(result);

    } catch (error) {
      fastify.log.error('Failed to execute resolution plan', { error: error.message });
      return reply.code(500).send({
        error: 'Failed to execute resolution plan',
        message: error.message
      });
    }
  });

  /**
   * Get all detected conflicts
   */
  fastify.get('/conflicts', {
    schema: {
      description: 'Get all detected conflicts',
      tags: ['Conflict Detection'],
      querystring: {
        type: 'object',
        properties: {
          severity: { type: 'string' },
          status: { type: 'string' },
          policyId: { type: 'string' }
        }
      },
      response: {
        200: {
          description: 'List of conflicts',
          type: 'array'
        }
      }
    }
  }, async (request: FastifyRequest<{ Querystring: any }>, reply: FastifyReply) => {
    try {
      let conflicts = conflictDetection.getDetectedConflicts();

      // Apply filters
      if (request.query.severity) {
        conflicts = conflicts.filter(c => c.severity === request.query.severity);
      }
      if (request.query.status) {
        conflicts = conflicts.filter(c => c.status === request.query.status);
      }
      if (request.query.policyId) {
        conflicts = conflicts.filter(c => c.affectedPolicies.includes(request.query.policyId));
      }

      return reply.code(200).send(conflicts);

    } catch (error) {
      fastify.log.error('Failed to get conflicts', { error: error.message });
      return reply.code(500).send({
        error: 'Failed to get conflicts',
        message: error.message
      });
    }
  });

  /**
   * Get specific conflict details
   */
  fastify.get('/conflicts/:conflictId', {
    schema: {
      description: 'Get specific conflict details',
      tags: ['Conflict Detection'],
      params: {
        type: 'object',
        properties: {
          conflictId: { type: 'string' }
        },
        required: ['conflictId']
      },
      response: {
        200: {
          description: 'Conflict details',
          type: 'object'
        },
        404: {
          description: 'Conflict not found',
          type: 'object'
        }
      }
    }
  }, async (request: FastifyRequest<{ Params: { conflictId: string } }>, reply: FastifyReply) => {
    try {
      const conflict = conflictDetection.getConflict(request.params.conflictId);

      if (!conflict) {
        return reply.code(404).send({
          error: 'Conflict not found',
          conflictId: request.params.conflictId
        });
      }

      return reply.code(200).send(conflict);

    } catch (error) {
      fastify.log.error('Failed to get conflict', { error: error.message });
      return reply.code(500).send({
        error: 'Failed to get conflict',
        message: error.message
      });
    }
  });

  /**
   * Get all resolution plans
   */
  fastify.get('/conflicts/resolution-plans', {
    schema: {
      description: 'Get all conflict resolution plans',
      tags: ['Conflict Resolution'],
      querystring: {
        type: 'object',
        properties: {
          status: { type: 'string' },
          conflictId: { type: 'string' }
        }
      },
      response: {
        200: {
          description: 'List of resolution plans',
          type: 'array'
        }
      }
    }
  }, async (request: FastifyRequest<{ Querystring: any }>, reply: FastifyReply) => {
    try {
      let plans = conflictDetection.getResolutionPlans();

      // Apply filters
      if (request.query.status) {
        plans = plans.filter(p => p.status === request.query.status);
      }
      if (request.query.conflictId) {
        plans = plans.filter(p => p.conflictId === request.query.conflictId);
      }

      return reply.code(200).send(plans);

    } catch (error) {
      fastify.log.error('Failed to get resolution plans', { error: error.message });
      return reply.code(500).send({
        error: 'Failed to get resolution plans',
        message: error.message
      });
    }
  });

  // ============================================================================
  // POLICY VISUALIZATION ENDPOINTS
  // ============================================================================

  /**
   * Generate policy visualization
   */
  fastify.post('/visualization/generate', {
    schema: {
      description: 'Generate policy visualization',
      tags: ['Visualization'],
      body: VisualizationRequestSchema,
      response: {
        200: {
          description: 'Generated visualization',
          type: 'object'
        }
      }
    }
  }, async (request: FastifyRequest<{ Body: z.infer<typeof VisualizationRequestSchema> }>, reply: FastifyReply) => {
    try {
      const { type, policyIds, conflictIds, frameworks, options = {} } = request.body;
      const organizationId = (request as any).user?.organizationId;

      if (!organizationId) {
        return reply.code(401).send({ error: 'Organization ID required' });
      }

      // Get policies from database
      let policyQuery: any = { organizationId };
      if (policyIds && policyIds.length > 0) {
        policyQuery.id = { in: policyIds };
      }

      const policies = await fastify.prisma.policy.findMany({
        where: policyQuery
      });

      // Convert to enhanced policy format
      const enhancedPolicies = policies.map(policy => ({
        metadata: {
          id: policy.id,
          name: policy.name,
          description: policy.description || '',
          status: policy.status,
          priority: policy.priority || 5,
          complianceFrameworks: policy.complianceFrameworks || [],
          lastModified: policy.updatedAt
        },
        rules: Array.isArray(policy.rules) ? policy.rules : []
      }));

      let visualizationResult: any;

      switch (type) {
        case 'POLICY_OVERVIEW':
          visualizationResult = await visualization.generatePolicyOverview(enhancedPolicies as any, options);
          break;

        case 'CONFLICT_ANALYSIS':
          if (!conflictIds || conflictIds.length === 0) {
            return reply.code(400).send({ error: 'Conflict IDs required for conflict analysis' });
          }
          const conflicts = conflictIds.map(id => conflictDetection.getConflict(id)).filter(c => c);
          visualizationResult = await visualization.generateConflictVisualization(conflicts as any, enhancedPolicies as any, options);
          break;

        case 'DEPENDENCY_GRAPH':
          visualizationResult = await visualization.generateDependencyGraph(enhancedPolicies as any, options);
          break;

        case 'COMPLIANCE_MAP':
          if (!frameworks || frameworks.length === 0) {
            return reply.code(400).send({ error: 'Frameworks required for compliance mapping' });
          }
          visualizationResult = await visualization.generateComplianceMap(enhancedPolicies as any, frameworks, options);
          break;

        case 'IMPACT_ANALYSIS':
          if (!policyIds || policyIds.length !== 1) {
            return reply.code(400).send({ error: 'Single policy ID required for impact analysis' });
          }
          // Would need impact analysis data
          const impactAnalysis = {
            policyId: policyIds[0],
            changeType: 'UPDATE' as const,
            impactAreas: [],
            predictedConflicts: [],
            riskAssessment: {
              overallRisk: 'LOW' as const,
              riskFactors: [],
              mitigationStrategies: [],
              rollbackComplexity: 'SIMPLE' as const
            },
            recommendedActions: []
          };
          visualizationResult = await visualization.generateImpactAnalysis(impactAnalysis, enhancedPolicies as any, options);
          break;

        default:
          return reply.code(400).send({ error: `Unsupported visualization type: ${type}` });
      }

      return reply.code(200).send(visualizationResult);

    } catch (error) {
      fastify.log.error('Visualization generation failed', { error: error.message });
      return reply.code(500).send({
        error: 'Visualization generation failed',
        message: error.message
      });
    }
  });

  /**
   * Export visualization
   */
  fastify.get('/visualization/:visualizationId/export', {
    schema: {
      description: 'Export visualization in different formats',
      tags: ['Visualization'],
      params: {
        type: 'object',
        properties: {
          visualizationId: { type: 'string' }
        },
        required: ['visualizationId']
      },
      querystring: {
        type: 'object',
        properties: {
          format: { type: 'string', enum: ['json', 'graphml', 'dot'], default: 'json' }
        }
      },
      response: {
        200: {
          description: 'Exported visualization data',
          type: 'string'
        }
      }
    }
  }, async (request: FastifyRequest<{
    Params: { visualizationId: string };
    Querystring: { format?: 'json' | 'graphml' | 'dot' }
  }>, reply: FastifyReply) => {
    try {
      const { visualizationId } = request.params;
      const { format = 'json' } = request.query;

      const visualizationData = visualization.getCachedVisualization(visualizationId);

      if (!visualizationData) {
        return reply.code(404).send({
          error: 'Visualization not found',
          visualizationId
        });
      }

      const exportedData = visualization.exportVisualization(visualizationData, format);

      // Set appropriate content type
      const contentTypes = {
        json: 'application/json',
        graphml: 'application/xml',
        dot: 'text/plain'
      };

      return reply
        .type(contentTypes[format])
        .code(200)
        .send(exportedData);

    } catch (error) {
      fastify.log.error('Visualization export failed', { error: error.message });
      return reply.code(500).send({
        error: 'Visualization export failed',
        message: error.message
      });
    }
  });

  /**
   * Clear visualization cache
   */
  fastify.delete('/visualization/cache', {
    schema: {
      description: 'Clear visualization cache',
      tags: ['Visualization'],
      response: {
        200: {
          description: 'Cache cleared successfully',
          type: 'object'
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      visualization.clearCache();
      conflictDetection.clearCache();

      return reply.code(200).send({
        message: 'Visualization and conflict detection cache cleared successfully'
      });

    } catch (error) {
      fastify.log.error('Failed to clear cache', { error: error.message });
      return reply.code(500).send({
        error: 'Failed to clear cache',
        message: error.message
      });
    }
  });

  // ============================================================================
  // HEALTH CHECK
  // ============================================================================

  /**
   * Health check for policy engine services
   */
  fastify.get('/health', {
    schema: {
      description: 'Health check for policy engine services',
      tags: ['Health'],
      response: {
        200: {
          description: 'Service health status',
          type: 'object'
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const health = {
        status: 'healthy',
        timestamp: new Date(),
        services: {
          policyEngine: policyEngine.getStatistics(),
          templateLibrary: await templateLibrary.getTemplateStatistics(),
          schemaManagement: schemaManagement.getValidationStatistics(),
          complianceMonitoring: complianceMonitoring.getServiceStatistics()
        }
      };

      return reply.code(200).send(health);

    } catch (error) {
      fastify.log.error('Health check failed', { error: error.message });
      return reply.code(503).send({
        status: 'unhealthy',
        error: error.message,
        timestamp: new Date()
      });
    }
  });

  // Cleanup on server shutdown
  fastify.addHook('onClose', async () => {
    await policyEngine.shutdown();
    await complianceMonitoring.shutdown();
  });
}