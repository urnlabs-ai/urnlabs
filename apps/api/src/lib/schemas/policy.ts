import { z } from 'zod';

// Base schema for common policy properties
export const PolicyMetadataSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  version: z.string().regex(/^\d+\.\d+\.\d+$/), // Semantic versioning
  createdAt: z.date(),
  updatedAt: z.date(),
  createdBy: z.string().uuid(),
  updatedBy: z.string().uuid(),
  organizationId: z.string().uuid(),

  // Classification and ownership
  classification: z.enum(['public', 'internal', 'confidential', 'restricted']),
  owner: z.string().uuid(),
  tags: z.array(z.string()).default([]),

  // Lifecycle management
  status: z.enum(['draft', 'active', 'deprecated', 'archived']),
  effectiveDate: z.date(),
  expirationDate: z.date().optional(),

  // Compliance tracking
  complianceFrameworks: z.array(z.enum(['SOC2', 'GDPR', 'CCPA', 'HIPAA', 'PCI_DSS', 'ISO27001'])).default([]),
  riskLevel: z.enum(['low', 'medium', 'high', 'critical']),
});

// Policy condition schemas
export const PolicyConditionSchema = z.object({
  field: z.string(),
  operator: z.enum(['equals', 'not_equals', 'contains', 'not_contains', 'greater_than', 'less_than', 'in', 'not_in', 'exists', 'not_exists']),
  value: z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]),
  logicalOperator: z.enum(['AND', 'OR']).optional(),
});

export const PolicyConditionGroupSchema = z.object({
  conditions: z.array(PolicyConditionSchema),
  logicalOperator: z.enum(['AND', 'OR']).default('AND'),
  nested: z.array(z.lazy(() => PolicyConditionGroupSchema)).optional(),
});

// Policy action schemas
export const PolicyActionSchema = z.object({
  type: z.enum(['allow', 'deny', 'require_approval', 'log', 'alert', 'block', 'redirect', 'audit']),
  severity: z.enum(['info', 'warning', 'error', 'critical']).optional(),
  message: z.string().optional(),
  data: z.record(z.any()).optional(), // Additional action data
});

// Access Control Policy Schema
export const AccessControlPolicySchema = z.object({
  type: z.literal('access_control'),
  rules: z.array(z.object({
    resource: z.string(),
    permissions: z.array(z.enum(['read', 'write', 'delete', 'admin', 'execute'])),
    conditions: PolicyConditionGroupSchema,
    action: PolicyActionSchema,
  })),
  defaultAction: PolicyActionSchema,
});

// Data Retention Policy Schema
export const DataRetentionPolicySchema = z.object({
  type: z.literal('data_retention'),
  rules: z.array(z.object({
    dataType: z.string(),
    retentionPeriod: z.object({
      value: z.number().positive(),
      unit: z.enum(['days', 'months', 'years']),
    }),
    conditions: PolicyConditionGroupSchema.optional(),
    action: z.object({
      type: z.enum(['archive', 'delete', 'anonymize']),
      location: z.string().optional(),
    }),
  })),
});

// Workflow Approval Policy Schema
export const WorkflowApprovalPolicySchema = z.object({
  type: z.literal('workflow_approval'),
  rules: z.array(z.object({
    workflowType: z.string(),
    approvalRequired: z.boolean(),
    approvers: z.array(z.object({
      userId: z.string().uuid().optional(),
      roleId: z.string().uuid().optional(),
      required: z.boolean().default(false),
    })),
    conditions: PolicyConditionGroupSchema,
    timeout: z.object({
      value: z.number().positive(),
      unit: z.enum(['minutes', 'hours', 'days']),
    }).optional(),
  })),
});

// Security Scanning Policy Schema
export const SecurityScanningPolicySchema = z.object({
  type: z.literal('security_scanning'),
  rules: z.array(z.object({
    scanType: z.enum(['vulnerability', 'malware', 'secrets', 'compliance']),
    schedule: z.object({
      frequency: z.enum(['hourly', 'daily', 'weekly', 'monthly']),
      time: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).optional(), // HH:MM format
    }),
    targets: z.array(z.string()),
    conditions: PolicyConditionGroupSchema.optional(),
    action: PolicyActionSchema,
  })),
});

// Compliance Policy Schema
export const CompliancePolicySchema = z.object({
  type: z.literal('compliance'),
  framework: z.enum(['SOC2', 'GDPR', 'CCPA', 'HIPAA', 'PCI_DSS', 'ISO27001']),
  rules: z.array(z.object({
    controlId: z.string(),
    requirement: z.string(),
    implementation: z.string(),
    evidenceRequired: z.boolean().default(false),
    frequency: z.enum(['continuous', 'daily', 'weekly', 'monthly', 'quarterly', 'annually']),
    conditions: PolicyConditionGroupSchema.optional(),
    action: PolicyActionSchema,
  })),
});

// Union of all policy types
export const PolicyDefinitionSchema = z.discriminatedUnion('type', [
  AccessControlPolicySchema,
  DataRetentionPolicySchema,
  WorkflowApprovalPolicySchema,
  SecurityScanningPolicySchema,
  CompliancePolicySchema,
]);

// Complete policy schema
export const PolicySchema = z.object({
  metadata: PolicyMetadataSchema,
  definition: PolicyDefinitionSchema,
});

// Policy version history schema
export const PolicyVersionSchema = z.object({
  id: z.string().uuid(),
  policyId: z.string().uuid(),
  version: z.string(),
  changes: z.array(z.object({
    field: z.string(),
    oldValue: z.any(),
    newValue: z.any(),
    changeType: z.enum(['added', 'modified', 'removed']),
  })),
  changeReason: z.string(),
  changedBy: z.string().uuid(),
  changedAt: z.date(),
  approvedBy: z.string().uuid().optional(),
  approvedAt: z.date().optional(),
});

// Policy template schema for common patterns
export const PolicyTemplateSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string(),
  category: z.enum(['security', 'compliance', 'access_control', 'data_management', 'workflow']),
  template: PolicyDefinitionSchema,
  variables: z.array(z.object({
    name: z.string(),
    type: z.enum(['string', 'number', 'boolean', 'array', 'object']),
    required: z.boolean(),
    defaultValue: z.any().optional(),
    description: z.string().optional(),
  })),
  complianceFrameworks: z.array(z.enum(['SOC2', 'GDPR', 'CCPA', 'HIPAA', 'PCI_DSS', 'ISO27001'])),
  createdAt: z.date(),
  updatedAt: z.date(),
});

// Type exports for TypeScript
export type PolicyMetadata = z.infer<typeof PolicyMetadataSchema>;
export type PolicyCondition = z.infer<typeof PolicyConditionSchema>;
export type PolicyConditionGroup = z.infer<typeof PolicyConditionGroupSchema>;
export type PolicyAction = z.infer<typeof PolicyActionSchema>;
export type AccessControlPolicy = z.infer<typeof AccessControlPolicySchema>;
export type DataRetentionPolicy = z.infer<typeof DataRetentionPolicySchema>;
export type WorkflowApprovalPolicy = z.infer<typeof WorkflowApprovalPolicySchema>;
export type SecurityScanningPolicy = z.infer<typeof SecurityScanningPolicySchema>;
export type CompliancePolicy = z.infer<typeof CompliancePolicySchema>;
export type PolicyDefinition = z.infer<typeof PolicyDefinitionSchema>;
export type Policy = z.infer<typeof PolicySchema>;
export type PolicyVersion = z.infer<typeof PolicyVersionSchema>;
export type PolicyTemplate = z.infer<typeof PolicyTemplateSchema>;

// Validation helper functions
export class PolicyValidationError extends Error {
  constructor(
    message: string,
    public readonly validationErrors: z.ZodError['errors'],
    public readonly policyId?: string
  ) {
    super(message);
    this.name = 'PolicyValidationError';
  }
}

export function validatePolicy(policy: unknown): Policy {
  try {
    return PolicySchema.parse(policy);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new PolicyValidationError('Policy validation failed', error.errors);
    }
    throw error;
  }
}

export function validatePolicyDefinition(definition: unknown, type?: string): PolicyDefinition {
  try {
    return PolicyDefinitionSchema.parse(definition);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new PolicyValidationError(
        `Policy definition validation failed${type ? ` for type ${type}` : ''}`,
        error.errors
      );
    }
    throw error;
  }
}

export function validatePolicyTemplate(template: unknown): PolicyTemplate {
  try {
    return PolicyTemplateSchema.parse(template);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new PolicyValidationError('Policy template validation failed', error.errors);
    }
    throw error;
  }
}

// Policy schema version for compatibility tracking
export const POLICY_SCHEMA_VERSION = '1.0.0';