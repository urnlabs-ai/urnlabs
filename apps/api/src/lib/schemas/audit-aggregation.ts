import { z } from 'zod';

// ============================================================================
// AUDIT LOG AGGREGATION SCHEMAS
// ============================================================================

/**
 * Validation schemas for audit log aggregation, archival, and compliance trails
 */

// Archive-related schemas
export const AuditLogArchiveSchema = z.object({
  id: z.string().cuid().optional(),
  originalLogId: z.string().cuid(),

  // Archive metadata
  archiveReason: z.enum(['retention_policy', 'compliance_requirement', 'manual']),
  archiveDate: z.date().optional().default(() => new Date()),
  retentionUntil: z.date(),
  complianceFramework: z.enum(['GDPR', 'SOX', 'HIPAA', 'PCI-DSS', 'ISO27001', 'CCPA']).optional(),

  // Compressed and encrypted log data
  compressedData: z.instanceof(Buffer),
  encryptionKey: z.string().min(1),
  compressionType: z.enum(['gzip', 'brotli']).default('gzip'),

  // Integrity verification
  archiveHash: z.string().length(64), // SHA-256 hash
  originalHash: z.string().length(64), // Original event hash
  verificationStatus: z.enum(['verified', 'tampered', 'corrupted']).default('verified'),

  // Relations
  organizationId: z.string().cuid().optional(),
});

export const AuditRetentionPolicyBaseSchema = z.object({
  id: z.string().cuid().optional(),
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),

  // Policy criteria
  organizationId: z.string().cuid().optional(),
  eventTypes: z.array(z.string()).default([]),
  resourceTypes: z.array(z.string()).default([]),
  severity: z.array(z.enum(['info', 'warning', 'error', 'critical'])).default([]),
  complianceFrameworks: z.array(z.enum(['GDPR', 'SOX', 'HIPAA', 'PCI-DSS', 'ISO27001', 'CCPA'])).default([]),

  // Retention rules
  activeRetentionDays: z.number().int().min(1).max(7300), // Max 20 years
  archiveRetentionDays: z.number().int().min(0).max(36500), // Max 100 years
  totalRetentionDays: z.number().int().min(1).max(36500),

  // Archive configuration
  enableArchiving: z.boolean().default(true),
  compressionEnabled: z.boolean().default(true),
  encryptionEnabled: z.boolean().default(true),

  // Policy metadata
  isActive: z.boolean().default(true),
  priority: z.number().int().min(1).max(1000).default(100),
  createdBy: z.string().cuid(),

  // Timestamps
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
});

export const AuditRetentionPolicySchema = AuditRetentionPolicyBaseSchema.refine(
  (data) => data.activeRetentionDays + data.archiveRetentionDays <= data.totalRetentionDays,
  {
    message: "Active retention + archive retention cannot exceed total retention",
    path: ["totalRetentionDays"],
  }
);

export const ComplianceTrailBaseSchema = z.object({
  id: z.string().cuid().optional(),
  trailId: z.string().uuid(),

  // Trail metadata
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  complianceFramework: z.enum(['GDPR', 'SOX', 'HIPAA', 'PCI-DSS', 'ISO27001', 'CCPA']),

  // Trail configuration
  organizationId: z.string().cuid().optional(),
  startDate: z.date(),
  endDate: z.date().optional(),

  // Event filtering
  eventTypes: z.array(z.string()).default([]),
  resourceTypes: z.array(z.string()).default([]),
  actorTypes: z.array(z.enum(['user', 'system', 'api_key', 'agent', 'external'])).default([]),
  severityLevels: z.array(z.enum(['info', 'warning', 'error', 'critical'])).default([]),

  // Trail integrity
  trailHash: z.string().length(64), // SHA-256 hash
  eventCount: z.number().int().min(0).default(0),
  lastEventId: z.string().cuid().optional(),
  lastEventHash: z.string().length(64).optional(),

  // Compliance verification
  verificationStatus: z.enum(['active', 'verified', 'sealed', 'tampered']).default('active'),
  verifiedAt: z.date().optional(),
  verifiedBy: z.string().cuid().optional(),
  digitalSignature: z.string().optional(),

  // Timestamps
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
});

export const ComplianceTrailSchema = ComplianceTrailBaseSchema.refine(
  (data) => !data.endDate || data.endDate > data.startDate,
  {
    message: "End date must be after start date",
    path: ["endDate"],
  }
);

export const ComplianceTrailEventSchema = z.object({
  id: z.string().cuid().optional(),
  trailId: z.string().cuid(),
  auditLogId: z.string().cuid(),

  // Event position in trail
  sequenceNumber: z.number().int().min(1),
  eventHash: z.string().length(64),
  previousEventHash: z.string().length(64).optional(),

  // Compliance metadata
  complianceRelevance: z.enum(['high', 'medium', 'low']),
  regulatoryTags: z.array(z.string()).default([]),

  // Timestamps
  addedAt: z.date().optional(),
});

export const AuditLogIntegrityCheckSchema = z.object({
  id: z.string().cuid().optional(),

  // Check metadata
  checkType: z.enum(['integrity_verification', 'tamper_detection', 'chain_validation']),
  organizationId: z.string().cuid().optional(),

  // Check parameters
  startDate: z.date(),
  endDate: z.date(),
  eventCount: z.number().int().min(0),

  // Check results
  status: z.enum(['passed', 'failed', 'warning']),
  integrityScore: z.number().min(0).max(1), // 0.0 to 1.0
  issuesFound: z.number().int().min(0).default(0),
  tamperingDetected: z.boolean().default(false),

  // Detailed results
  checkResults: z.record(z.any()), // Detailed findings
  failedEvents: z.array(z.string().cuid()).default([]),
  recommendations: z.array(z.string()).default([]),

  // Check execution
  executedBy: z.string().cuid(),
  executionTime: z.number().int().min(0), // Milliseconds

  // Timestamps
  createdAt: z.date().optional(),
}).refine(
  (data) => data.endDate > data.startDate,
  {
    message: "End date must be after start date",
    path: ["endDate"],
  }
);

// ============================================================================
// API REQUEST/RESPONSE SCHEMAS
// ============================================================================

export const CreateAuditRetentionPolicyRequest = AuditRetentionPolicyBaseSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const UpdateAuditRetentionPolicyRequest = AuditRetentionPolicyBaseSchema.partial().omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const CreateComplianceTrailRequest = ComplianceTrailBaseSchema.omit({
  id: true,
  trailHash: true,
  eventCount: true,
  lastEventId: true,
  lastEventHash: true,
  verificationStatus: true,
  verifiedAt: true,
  verifiedBy: true,
  digitalSignature: true,
  createdAt: true,
  updatedAt: true,
});

export const AddComplianceTrailEventRequest = ComplianceTrailEventSchema.omit({
  id: true,
  sequenceNumber: true,
  eventHash: true,
  previousEventHash: true,
  addedAt: true,
});

export const RunIntegrityCheckRequest = z.object({
  checkType: z.enum(['integrity_verification', 'tamper_detection', 'chain_validation']),
  organizationId: z.string().cuid().optional(),
  startDate: z.date(),
  endDate: z.date(),
  includeDetails: z.boolean().default(false),
});

// Archive management requests
export const CreateArchiveRequest = z.object({
  auditLogIds: z.array(z.string().cuid()).min(1),
  archiveReason: z.enum(['retention_policy', 'compliance_requirement', 'manual']),
  retentionDays: z.number().int().min(1).max(36500),
  complianceFramework: z.enum(['GDPR', 'SOX', 'HIPAA', 'PCI-DSS', 'ISO27001', 'CCPA']).optional(),
  compressionType: z.enum(['gzip', 'brotli']).default('gzip'),
});

export const RestoreArchiveRequest = z.object({
  archiveIds: z.array(z.string().cuid()).min(1),
  reason: z.string().min(1).max(500),
  temporaryAccess: z.boolean().default(false),
  accessDurationHours: z.number().int().min(1).max(168).optional(), // Max 1 week
});

// Query schemas
export const AuditLogAggregationQuery = z.object({
  organizationId: z.string().cuid().optional(),
  startDate: z.date().optional(),
  endDate: z.date().optional(),
  eventTypes: z.array(z.string()).optional(),
  resourceTypes: z.array(z.string()).optional(),
  actorTypes: z.array(z.string()).optional(),
  severity: z.array(z.enum(['info', 'warning', 'error', 'critical'])).optional(),
  complianceFramework: z.enum(['GDPR', 'SOX', 'HIPAA', 'PCI-DSS', 'ISO27001', 'CCPA']).optional(),
  includeArchived: z.boolean().default(false),
  groupBy: z.enum(['hour', 'day', 'week', 'month']).optional(),
  aggregateMetrics: z.array(z.enum(['count', 'unique_actors', 'unique_resources', 'severity_distribution'])).default(['count']),
  limit: z.number().int().min(1).max(10000).default(100),
  offset: z.number().int().min(0).default(0),
});

// ============================================================================
// TYPE EXPORTS
// ============================================================================

export type AuditLogArchive = z.infer<typeof AuditLogArchiveSchema>;
export type AuditRetentionPolicy = z.infer<typeof AuditRetentionPolicySchema>;
export type ComplianceTrail = z.infer<typeof ComplianceTrailSchema>;
export type ComplianceTrailEvent = z.infer<typeof ComplianceTrailEventSchema>;
export type AuditLogIntegrityCheck = z.infer<typeof AuditLogIntegrityCheckSchema>;

export type CreateAuditRetentionPolicyRequest = z.infer<typeof CreateAuditRetentionPolicyRequest>;
export type UpdateAuditRetentionPolicyRequest = z.infer<typeof UpdateAuditRetentionPolicyRequest>;
export type CreateComplianceTrailRequest = z.infer<typeof CreateComplianceTrailRequest>;
export type AddComplianceTrailEventRequest = z.infer<typeof AddComplianceTrailEventRequest>;
export type RunIntegrityCheckRequest = z.infer<typeof RunIntegrityCheckRequest>;
export type CreateArchiveRequest = z.infer<typeof CreateArchiveRequest>;
export type RestoreArchiveRequest = z.infer<typeof RestoreArchiveRequest>;
export type AuditLogAggregationQuery = z.infer<typeof AuditLogAggregationQuery>;

// ============================================================================
// COMPLIANCE FRAMEWORK CONSTANTS
// ============================================================================

export const COMPLIANCE_FRAMEWORKS = {
  GDPR: {
    name: 'General Data Protection Regulation',
    defaultRetentionDays: 2555, // 7 years
    requiredEventTypes: ['data_access', 'data_modification', 'data_deletion', 'consent_granted', 'consent_withdrawn'],
    minimumIntegrityChecks: 'monthly',
  },
  SOX: {
    name: 'Sarbanes-Oxley Act',
    defaultRetentionDays: 2555, // 7 years
    requiredEventTypes: ['financial_transaction', 'report_generation', 'data_modification', 'access_control'],
    minimumIntegrityChecks: 'quarterly',
  },
  HIPAA: {
    name: 'Health Insurance Portability and Accountability Act',
    defaultRetentionDays: 2190, // 6 years
    requiredEventTypes: ['phi_access', 'phi_modification', 'phi_disclosure', 'authentication'],
    minimumIntegrityChecks: 'monthly',
  },
  'PCI-DSS': {
    name: 'Payment Card Industry Data Security Standard',
    defaultRetentionDays: 365, // 1 year minimum
    requiredEventTypes: ['payment_processing', 'card_data_access', 'authentication', 'authorization'],
    minimumIntegrityChecks: 'daily',
  },
  ISO27001: {
    name: 'ISO/IEC 27001 Information Security Management',
    defaultRetentionDays: 1095, // 3 years
    requiredEventTypes: ['security_event', 'access_control', 'system_change', 'incident'],
    minimumIntegrityChecks: 'monthly',
  },
  CCPA: {
    name: 'California Consumer Privacy Act',
    defaultRetentionDays: 730, // 2 years
    requiredEventTypes: ['data_collection', 'data_sale', 'data_deletion', 'opt_out_request'],
    minimumIntegrityChecks: 'monthly',
  },
} as const;

// Event type categorization for compliance
export const COMPLIANCE_EVENT_CATEGORIES = {
  data_protection: ['data_access', 'data_modification', 'data_deletion', 'data_export', 'data_anonymization'],
  access_control: ['authentication', 'authorization', 'role_assignment', 'permission_grant', 'session_management'],
  financial: ['financial_transaction', 'payment_processing', 'invoice_generation', 'audit_trail'],
  healthcare: ['phi_access', 'phi_modification', 'phi_disclosure', 'patient_consent', 'medical_record'],
  security: ['security_event', 'intrusion_detection', 'vulnerability_scan', 'incident_response'],
  system: ['system_change', 'configuration_update', 'software_deployment', 'backup_restore'],
} as const;