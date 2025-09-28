import { z } from 'zod';

/**
 * Enhanced Policy Definition and Schema Management System
 * 
 * Implements Task 5.2 requirements:
 * - Comprehensive policy definition schema supporting all policy types
 * - Policy template library for common governance scenarios (SOX, GDPR, SOC 2)
 * - Policy versioning, validation, and migration capabilities
 * - Policy editor interface with syntax highlighting and real-time validation
 */

// ============================================================================
// ENHANCED BASE SCHEMAS
// ============================================================================

/**
 * Enhanced metadata schema with additional governance fields
 */
export const EnhancedPolicyMetadataSchema = z.object({
  // Core identification
  id: z.string().uuid(),
  name: z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
  version: z.string().regex(/^\d+\.\d+\.\d+$/), // Semantic versioning
  
  // Temporal management
  createdAt: z.date(),
  updatedAt: z.date(),
  effectiveDate: z.date(),
  expirationDate: z.date().optional(),
  reviewDate: z.date().optional(),
  lastReviewedAt: z.date().optional(),
  
  // Ownership and responsibility
  createdBy: z.string().uuid(),
  updatedBy: z.string().uuid(),
  ownerId: z.string().uuid(),
  reviewerId: z.string().uuid().optional(),
  approvedBy: z.string().uuid().optional(),
  approvedAt: z.date().optional(),
  
  // Organizational context
  organizationId: z.string().uuid(),
  departmentId: z.string().uuid().optional(),
  businessUnitId: z.string().uuid().optional(),
  
  // Classification and security
  classification: z.enum(['public', 'internal', 'confidential', 'restricted', 'top_secret']),
  securityLevel: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
  dataClassification: z.enum(['public', 'internal', 'sensitive', 'restricted']).optional(),
  
  // Lifecycle and status
  status: z.enum(['draft', 'review', 'approved', 'active', 'deprecated', 'archived', 'suspended']),
  lifecycleStage: z.enum(['development', 'testing', 'production', 'maintenance', 'retirement']).default('development'),
  
  // Compliance and regulatory
  complianceFrameworks: z.array(z.enum([
    'SOC2', 'GDPR', 'CCPA', 'HIPAA', 'PCI_DSS', 'ISO27001', 'ISO27002',
    'NIST_CSF', 'SOX', 'COBIT', 'ITIL', 'FedRAMP', 'FISMA', 'CMMC',
    'CSA_CCM', 'ENISA', 'CIS_CONTROLS', 'OWASP', 'SANS'
  ])).default([]),
  regulatoryRequirements: z.array(z.string()).default([]),
  auditScope: z.array(z.string()).default([]),
  
  // Risk and impact assessment
  riskLevel: z.enum(['very_low', 'low', 'medium', 'high', 'very_high', 'critical']),
  impactLevel: z.enum(['minimal', 'low', 'medium', 'high', 'severe', 'catastrophic']).default('medium'),
  businessCriticality: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
  
  // Categorization and tagging
  category: z.enum([
    'access_control', 'data_protection', 'security', 'compliance', 'operational',
    'financial', 'hr', 'legal', 'it_governance', 'business_continuity',
    'incident_response', 'change_management', 'asset_management'
  ]),
  subcategory: z.string().optional(),
  tags: z.array(z.string()).default([]),
  keywords: z.array(z.string()).default([]),
  
  // Operational metadata
  enforced: z.boolean().default(true),
  enforcementMode: z.enum(['strict', 'permissive', 'monitoring', 'disabled']).default('strict'),
  automatedEnforcement: z.boolean().default(false),
  manualReviewRequired: z.boolean().default(false),
  
  // Documentation and references
  documentationUrl: z.string().url().optional(),
  procedureUrl: z.string().url().optional(),
  trainingMaterialUrl: z.string().url().optional(),
  relatedPolicies: z.array(z.string().uuid()).default([]),
  referencedStandards: z.array(z.string()).default([]),
  
  // Change management
  changeRequestId: z.string().optional(),
  migrationRequired: z.boolean().default(false),
  backwardCompatible: z.boolean().default(true),
  
  // Performance and monitoring
  evaluationFrequency: z.enum(['continuous', 'realtime', 'hourly', 'daily', 'weekly', 'monthly']).default('continuous'),
  monitoringEnabled: z.boolean().default(true),
  alertingEnabled: z.boolean().default(true),
  
  // Custom extensions
  customFields: z.record(z.any()).default({}),
  extensions: z.record(z.any()).default({})
});

/**
 * Enhanced condition schema with advanced operators
 */
export const EnhancedPolicyConditionSchema = z.object({
  id: z.string().uuid().optional(),
  field: z.string(),
  operator: z.enum([
    // Comparison operators
    'equals', 'not_equals', 'greater_than', 'greater_than_or_equal',
    'less_than', 'less_than_or_equal',
    
    // String operators
    'contains', 'not_contains', 'starts_with', 'ends_with',
    'regex_match', 'regex_not_match',
    
    // Array/Set operators
    'in', 'not_in', 'contains_any', 'contains_all',
    'intersects', 'subset_of', 'superset_of',
    
    // Existence operators
    'exists', 'not_exists', 'is_null', 'is_not_null',
    'is_empty', 'is_not_empty',
    
    // Temporal operators
    'before', 'after', 'between', 'within_days', 'within_hours',
    'older_than', 'newer_than', 'same_day', 'same_week', 'same_month',
    
    // Geospatial operators
    'geo_within', 'geo_intersects', 'geo_near',
    
    // Advanced operators
    'custom_function', 'external_lookup', 'machine_learning'
  ]),
  value: z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.array(z.union([z.string(), z.number()])),
    z.object({}).passthrough(), // For complex objects
    z.null()
  ]),
  
  // Advanced condition properties
  caseSensitive: z.boolean().default(true),
  negate: z.boolean().default(false),
  weight: z.number().min(0).max(1).default(1), // For weighted conditions
  optional: z.boolean().default(false), // For optional conditions
  
  // Custom function details
  customFunction: z.object({
    name: z.string(),
    parameters: z.record(z.any()).default({}),
    timeout: z.number().default(5000), // milliseconds
  }).optional(),
  
  // External lookup details
  externalLookup: z.object({
    service: z.string(),
    endpoint: z.string(),
    method: z.enum(['GET', 'POST']).default('GET'),
    parameters: z.record(z.any()).default({}),
    cacheTimeout: z.number().default(300), // seconds
  }).optional(),
  
  // Temporal context
  timezone: z.string().optional(),
  dateFormat: z.string().optional(),
  
  // Error handling
  onError: z.enum(['fail', 'ignore', 'default_value']).default('fail'),
  defaultValue: z.any().optional(),
  
  // Documentation
  description: z.string().optional(),
  examples: z.array(z.any()).default([])
});

/**
 * Enhanced condition group with advanced logic
 */
export const EnhancedPolicyConditionGroupSchema = z.object({
  id: z.string().uuid().optional(),
  logicalOperator: z.enum(['AND', 'OR', 'XOR', 'NAND', 'NOR']).default('AND'),
  conditions: z.array(EnhancedPolicyConditionSchema),
  nested: z.array(z.lazy(() => EnhancedPolicyConditionGroupSchema)).optional(),
  
  // Advanced grouping
  weight: z.number().min(0).max(1).default(1),
  threshold: z.object({
    minimum: z.number().optional(), // Minimum conditions that must match
    percentage: z.number().min(0).max(100).optional() // Percentage that must match
  }).optional(),
  
  // Performance optimization
  shortCircuit: z.boolean().default(true),
  parallel: z.boolean().default(false),
  timeout: z.number().default(10000), // milliseconds
  
  // Documentation
  name: z.string().optional(),
  description: z.string().optional()
});

/**
 * Enhanced action schema with detailed responses
 */
export const EnhancedPolicyActionSchema = z.object({
  id: z.string().uuid().optional(),
  type: z.enum([
    // Decision actions
    'allow', 'deny', 'require_approval', 'conditional_allow',
    
    // Control actions
    'block', 'redirect', 'throttle', 'quarantine',
    
    // Monitoring actions
    'log', 'audit', 'alert', 'notify', 'track',
    
    // Remediation actions
    'remediate', 'escalate', 'suspend', 'terminate',
    
    // Data actions
    'encrypt', 'anonymize', 'mask', 'archive', 'delete',
    
    // Custom actions
    'custom', 'webhook', 'function_call'
  ]),
  
  // Action severity and priority
  severity: z.enum(['info', 'low', 'medium', 'high', 'critical']).default('medium'),
  priority: z.enum(['low', 'normal', 'high', 'urgent', 'immediate']).default('normal'),
  
  // Action details
  message: z.string().optional(),
  reason: z.string().optional(),
  recommendations: z.array(z.string()).default([]),
  
  // Response configuration
  responseCode: z.number().optional(),
  responseHeaders: z.record(z.string()).default({}),
  responseBody: z.any().optional(),
  
  // Notification configuration
  notifications: z.array(z.object({
    type: z.enum(['email', 'sms', 'webhook', 'slack', 'teams', 'pagerduty']),
    recipients: z.array(z.string()),
    template: z.string().optional(),
    immediate: z.boolean().default(false)
  })).default([]),
  
  // Approval configuration
  approvalConfig: z.object({
    approvers: z.array(z.object({
      type: z.enum(['user', 'role', 'group', 'external']),
      id: z.string(),
      required: z.boolean().default(false),
      weight: z.number().min(0).max(1).default(1)
    })),
    threshold: z.object({
      count: z.number().optional(),
      percentage: z.number().min(0).max(100).optional(),
      weight: z.number().min(0).max(1).optional()
    }).optional(),
    timeout: z.object({
      duration: z.number(),
      unit: z.enum(['minutes', 'hours', 'days']),
      action: z.enum(['deny', 'allow', 'escalate'])
    }).optional(),
    escalation: z.array(z.object({
      level: z.number(),
      approvers: z.array(z.string()),
      timeout: z.number() // minutes
    })).default([])
  }).optional(),
  
  // Custom action configuration
  customConfig: z.object({
    functionName: z.string().optional(),
    parameters: z.record(z.any()).default({}),
    webhookUrl: z.string().url().optional(),
    webhookMethod: z.enum(['GET', 'POST', 'PUT', 'DELETE']).default('POST'),
    webhookHeaders: z.record(z.string()).default({}),
    retryPolicy: z.object({
      maxRetries: z.number().default(3),
      backoffMs: z.number().default(1000),
      exponential: z.boolean().default(true)
    }).optional()
  }).optional(),
  
  // Temporal configuration
  schedule: z.object({
    immediate: z.boolean().default(true),
    delayed: z.boolean().default(false),
    delayMinutes: z.number().optional(),
    recurring: z.boolean().default(false),
    recurrencePattern: z.string().optional() // Cron expression
  }).default({ immediate: true, delayed: false, recurring: false }),
  
  // Data and metadata
  data: z.record(z.any()).default({}),
  metadata: z.record(z.any()).default({}),
  
  // Documentation
  description: z.string().optional(),
  examples: z.array(z.any()).default([])
});

// ============================================================================
// POLICY TYPE SCHEMAS
// ============================================================================

/**
 * Enhanced Access Control Policy with fine-grained permissions
 */
export const EnhancedAccessControlPolicySchema = z.object({
  type: z.literal('access_control'),
  version: z.string().default('2.0'),
  
  rules: z.array(z.object({
    id: z.string().uuid().optional(),
    name: z.string().optional(),
    description: z.string().optional(),
    priority: z.number().default(100),
    
    // Resource specification
    resources: z.array(z.object({
      type: z.string(),
      pattern: z.string(),
      attributes: z.record(z.any()).default({})
    })),
    
    // Action specification
    actions: z.array(z.object({
      type: z.string(),
      parameters: z.record(z.any()).default({})
    })),
    
    // Subject specification
    subjects: z.array(z.object({
      type: z.enum(['user', 'role', 'group', 'service', 'external']),
      id: z.string().optional(),
      pattern: z.string().optional(),
      attributes: z.record(z.any()).default({})
    })),
    
    // Conditions and constraints
    conditions: EnhancedPolicyConditionGroupSchema,
    constraints: z.array(z.object({
      type: z.enum(['time', 'location', 'device', 'network', 'usage']),
      parameters: z.record(z.any())
    })).default([]),
    
    // Effect and actions
    effect: z.enum(['allow', 'deny']),
    actions: z.array(EnhancedPolicyActionSchema),
    
    // Context requirements
    contextRequirements: z.object({
      authentication: z.enum(['none', 'basic', 'mfa', 'certificate']).default('basic'),
      authorization: z.enum(['none', 'rbac', 'abac', 'custom']).default('rbac'),
      encryption: z.enum(['none', 'transit', 'rest', 'both']).default('none'),
      audit: z.boolean().default(true)
    }).default({})
  })),
  
  // Default behavior
  defaultEffect: z.enum(['allow', 'deny']).default('deny'),
  defaultAction: EnhancedPolicyActionSchema,
  
  // Policy-wide settings
  settings: z.object({
    inheritance: z.boolean().default(true),
    delegation: z.boolean().default(false),
    caching: z.boolean().default(true),
    cacheTtl: z.number().default(300) // seconds
  }).default({})
});

/**
 * Enhanced Data Retention Policy with lifecycle management
 */
export const EnhancedDataRetentionPolicySchema = z.object({
  type: z.literal('data_retention'),
  version: z.string().default('2.0'),
  
  rules: z.array(z.object({
    id: z.string().uuid().optional(),
    name: z.string().optional(),
    description: z.string().optional(),
    priority: z.number().default(100),
    
    // Data classification
    dataTypes: z.array(z.string()),
    dataClassification: z.enum(['public', 'internal', 'confidential', 'restricted']),
    sensitivity: z.enum(['low', 'medium', 'high', 'critical']),
    
    // Retention periods
    retentionPeriods: z.array(z.object({
      stage: z.enum(['active', 'inactive', 'archived', 'disposed']),
      duration: z.object({
        value: z.number().positive(),
        unit: z.enum(['hours', 'days', 'weeks', 'months', 'years'])
      }),
      location: z.string().optional(),
      encryption: z.boolean().default(false)
    })),
    
    // Lifecycle actions
    lifecycleActions: z.array(z.object({
      trigger: z.enum(['time_based', 'event_based', 'manual']),
      action: z.enum(['migrate', 'archive', 'anonymize', 'delete', 'encrypt']),
      destination: z.string().optional(),
      verification: z.boolean().default(false)
    })),
    
    // Legal holds and exceptions
    legalHolds: z.array(z.object({
      id: z.string(),
      reason: z.string(),
      startDate: z.date(),
      endDate: z.date().optional(),
      authority: z.string()
    })).default([]),
    
    // Conditions and triggers
    conditions: EnhancedPolicyConditionGroupSchema.optional(),
    
    // Compliance and audit
    complianceRequirements: z.array(z.string()).default([]),
    auditTrail: z.boolean().default(true),
    reportingRequired: z.boolean().default(false)
  })),
  
  // Global settings
  settings: z.object({
    automaticEnforcement: z.boolean().default(true),
    verificationRequired: z.boolean().default(false),
    notificationEnabled: z.boolean().default(true),
    reportingFrequency: z.enum(['daily', 'weekly', 'monthly', 'quarterly']).default('monthly')
  }).default({})
});

/**
 * Enhanced Workflow Approval Policy with advanced routing
 */
export const EnhancedWorkflowApprovalPolicySchema = z.object({
  type: z.literal('workflow_approval'),
  version: z.string().default('2.0'),
  
  rules: z.array(z.object({
    id: z.string().uuid().optional(),
    name: z.string().optional(),
    description: z.string().optional(),
    priority: z.number().default(100),
    
    // Workflow matching
    workflowTypes: z.array(z.string()),
    workflowStages: z.array(z.string()).default(['*']),
    
    // Approval requirements
    approvalRequired: z.boolean(),
    approvalType: z.enum(['sequential', 'parallel', 'quorum', 'consensus']).default('sequential'),
    
    // Approver configuration
    approvers: z.array(z.object({
      id: z.string(),
      type: z.enum(['user', 'role', 'group', 'external', 'ai_agent']),
      level: z.number().default(1), // Approval level/order
      required: z.boolean().default(false),
      weight: z.number().min(0).max(1).default(1),
      delegation: z.object({
        allowed: z.boolean().default(false),
        delegates: z.array(z.string()).default([]),
        rules: z.array(z.string()).default([])
      }).default({ allowed: false, delegates: [], rules: [] })
    })),
    
    // Approval thresholds
    thresholds: z.object({
      minimum: z.number().optional(), // Minimum approvers
      percentage: z.number().min(0).max(100).optional(), // Percentage required
      weight: z.number().min(0).max(1).optional(), // Weighted threshold
      unanimous: z.boolean().default(false)
    }).optional(),
    
    // Timing and escalation
    timeouts: z.array(z.object({
      level: z.number(),
      duration: z.object({
        value: z.number(),
        unit: z.enum(['minutes', 'hours', 'days'])
      }),
      action: z.enum(['escalate', 'deny', 'auto_approve', 'notify']),
      escalationTarget: z.string().optional()
    })).default([]),
    
    // Conditions for approval
    conditions: EnhancedPolicyConditionGroupSchema,
    
    // Business rules
    businessRules: z.array(z.object({
      type: z.enum(['budget', 'authority', 'compliance', 'risk', 'custom']),
      parameters: z.record(z.any())
    })).default([]),
    
    // Integration settings
    integrations: z.array(z.object({
      type: z.enum(['email', 'slack', 'teams', 'jira', 'servicenow']),
      configuration: z.record(z.any())
    })).default([])
  })),
  
  // Global settings
  settings: z.object({
    defaultTimeout: z.object({
      value: z.number().default(24),
      unit: z.enum(['hours', 'days']).default('hours')
    }),
    reminderEnabled: z.boolean().default(true),
    reminderFrequency: z.number().default(4), // hours
    escalationEnabled: z.boolean().default(true),
    auditTrail: z.boolean().default(true)
  }).default({})
});

/**
 * Enhanced Security Scanning Policy with comprehensive coverage
 */
export const EnhancedSecurityScanningPolicySchema = z.object({
  type: z.literal('security_scanning'),
  version: z.string().default('2.0'),
  
  rules: z.array(z.object({
    id: z.string().uuid().optional(),
    name: z.string().optional(),
    description: z.string().optional(),
    priority: z.number().default(100),
    
    // Scan configuration
    scanTypes: z.array(z.enum([
      'vulnerability', 'malware', 'secrets', 'compliance', 'performance',
      'accessibility', 'sast', 'dast', 'iast', 'sca', 'iac', 'container'
    ])),
    
    // Target specification
    targets: z.array(z.object({
      type: z.enum(['application', 'infrastructure', 'database', 'network', 'endpoint']),
      pattern: z.string(),
      inclusion: z.array(z.string()).default([]),
      exclusion: z.array(z.string()).default([]),
      metadata: z.record(z.any()).default({})
    })),
    
    // Scheduling
    schedule: z.object({
      type: z.enum(['continuous', 'scheduled', 'triggered', 'on_demand']),
      frequency: z.enum(['realtime', 'hourly', 'daily', 'weekly', 'monthly']).optional(),
      cronExpression: z.string().optional(),
      timezone: z.string().default('UTC'),
      triggers: z.array(z.enum(['deployment', 'code_change', 'config_change', 'incident'])).default([])
    }),
    
    // Scan parameters
    parameters: z.object({
      depth: z.enum(['shallow', 'medium', 'deep']).default('medium'),
      timeout: z.number().default(3600), // seconds
      concurrency: z.number().default(1),
      retries: z.number().default(3),
      customOptions: z.record(z.any()).default({})
    }).default({}),
    
    // Result handling
    resultHandling: z.object({
      thresholds: z.object({
        critical: z.number().default(0),
        high: z.number().default(5),
        medium: z.number().default(20),
        low: z.number().default(100)
      }),
      actions: z.array(z.object({
        severity: z.enum(['critical', 'high', 'medium', 'low']),
        action: EnhancedPolicyActionSchema
      })),
      reporting: z.object({
        enabled: z.boolean().default(true),
        format: z.array(z.enum(['json', 'xml', 'pdf', 'html'])).default(['json']),
        recipients: z.array(z.string()).default([])
      }).default({ enabled: true, format: ['json'], recipients: [] })
    }),
    
    // Integration settings
    integrations: z.array(z.object({
      tool: z.string(),
      configuration: z.record(z.any()),
      enabled: z.boolean().default(true)
    })).default([]),
    
    // Conditions
    conditions: EnhancedPolicyConditionGroupSchema.optional()
  })),
  
  // Global settings
  settings: z.object({
    centralizedReporting: z.boolean().default(true),
    falsePositiveManagement: z.boolean().default(true),
    baselineManagement: z.boolean().default(true),
    trendAnalysis: z.boolean().default(true)
  }).default({})
});

/**
 * Enhanced Compliance Policy with framework mapping
 */
export const EnhancedCompliancePolicySchema = z.object({
  type: z.literal('compliance'),
  version: z.string().default('2.0'),
  
  // Framework information
  framework: z.enum([
    'SOC2', 'GDPR', 'CCPA', 'HIPAA', 'PCI_DSS', 'ISO27001', 'ISO27002',
    'NIST_CSF', 'SOX', 'COBIT', 'ITIL', 'FedRAMP', 'FISMA', 'CMMC'
  ]),
  frameworkVersion: z.string().optional(),
  
  rules: z.array(z.object({
    id: z.string().uuid().optional(),
    name: z.string().optional(),
    description: z.string().optional(),
    priority: z.number().default(100),
    
    // Control mapping
    controlId: z.string(),
    controlFamily: z.string().optional(),
    requirement: z.string(),
    implementation: z.string(),
    
    // Assessment and evidence
    assessmentProcedure: z.string().optional(),
    evidenceRequired: z.array(z.object({
      type: z.enum(['document', 'screenshot', 'log', 'certificate', 'report']),
      description: z.string(),
      frequency: z.enum(['once', 'annual', 'quarterly', 'monthly', 'weekly', 'daily']),
      automated: z.boolean().default(false)
    })).default([]),
    
    // Frequency and timing
    assessmentFrequency: z.enum(['continuous', 'annual', 'quarterly', 'monthly', 'weekly', 'daily']),
    nextAssessment: z.date().optional(),
    lastAssessment: z.date().optional(),
    
    // Risk and impact
    riskRating: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
    businessImpact: z.enum(['minimal', 'low', 'medium', 'high', 'severe']).default('medium'),
    
    // Implementation status
    implementationStatus: z.enum(['not_implemented', 'partially_implemented', 'implemented', 'optimized']),
    maturityLevel: z.enum(['initial', 'managed', 'defined', 'quantitatively_managed', 'optimizing']).optional(),
    
    // Testing and validation
    testingProcedure: z.string().optional(),
    automatedTesting: z.boolean().default(false),
    testingFrequency: z.enum(['never', 'annual', 'quarterly', 'monthly', 'weekly', 'daily']).default('quarterly'),
    
    // Conditions and scope
    conditions: EnhancedPolicyConditionGroupSchema.optional(),
    scope: z.array(z.string()).default([]),
    
    // Actions and responses
    actions: z.array(EnhancedPolicyActionSchema),
    
    // Documentation and references
    references: z.array(z.object({
      type: z.enum(['standard', 'procedure', 'guideline', 'template', 'tool']),
      title: z.string(),
      url: z.string().url().optional(),
      version: z.string().optional()
    })).default([])
  })),
  
  // Framework-wide settings
  settings: z.object({
    assessmentSchedule: z.string().optional(), // Cron expression
    reportingEnabled: z.boolean().default(true),
    continuousMonitoring: z.boolean().default(true),
    exceptionHandling: z.boolean().default(true),
    riskAcceptanceProcess: z.boolean().default(true)
  }).default({})
});

// ============================================================================
// POLICY TEMPLATE SCHEMAS
// ============================================================================

/**
 * Enhanced Policy Template with governance scenarios
 */
export const EnhancedPolicyTemplateSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string(),
  version: z.string().default('1.0.0'),
  
  // Template categorization
  category: z.enum([
    'access_control', 'data_protection', 'security', 'compliance', 'operational',
    'financial', 'hr', 'legal', 'it_governance', 'business_continuity'
  ]),
  subcategory: z.string().optional(),
  
  // Governance scenarios
  governanceScenarios: z.array(z.enum([
    'sox_financial_controls', 'gdpr_data_protection', 'soc2_security_controls',
    'hipaa_healthcare_privacy', 'pci_payment_security', 'iso27001_isms',
    'nist_cybersecurity', 'cobit_it_governance', 'itil_service_management'
  ])).default([]),
  
  // Framework mapping
  complianceFrameworks: z.array(z.string()).default([]),
  industryStandards: z.array(z.string()).default([]),
  
  // Template definition
  template: z.discriminatedUnion('type', [
    EnhancedAccessControlPolicySchema,
    EnhancedDataRetentionPolicySchema,
    EnhancedWorkflowApprovalPolicySchema,
    EnhancedSecurityScanningPolicySchema,
    EnhancedCompliancePolicySchema
  ]),
  
  // Variable definitions for customization
  variables: z.array(z.object({
    name: z.string(),
    type: z.enum(['string', 'number', 'boolean', 'array', 'object', 'date', 'enum']),
    required: z.boolean().default(true),
    defaultValue: z.any().optional(),
    description: z.string(),
    validation: z.object({
      pattern: z.string().optional(),
      min: z.number().optional(),
      max: z.number().optional(),
      enumValues: z.array(z.string()).optional()
    }).optional(),
    placeholder: z.string().optional(),
    helpText: z.string().optional()
  })),
  
  // Template metadata
  metadata: z.object({
    author: z.string(),
    organization: z.string().optional(),
    license: z.string().optional(),
    maturityLevel: z.enum(['experimental', 'alpha', 'beta', 'stable', 'mature']).default('stable'),
    complexity: z.enum(['low', 'medium', 'high']).default('medium'),
    
    // Usage statistics
    usageCount: z.number().default(0),
    rating: z.number().min(0).max(5).optional(),
    reviews: z.array(z.object({
      userId: z.string(),
      rating: z.number().min(0).max(5),
      comment: z.string().optional(),
      date: z.date()
    })).default([]),
    
    // Documentation
    documentationUrl: z.string().url().optional(),
    exampleUrl: z.string().url().optional(),
    videoUrl: z.string().url().optional(),
    
    // Dependencies and requirements
    dependencies: z.array(z.string()).default([]),
    prerequisites: z.array(z.string()).default([]),
    compatibleSystems: z.array(z.string()).default([])
  }),
  
  // Template lifecycle
  lifecycle: z.object({
    status: z.enum(['draft', 'review', 'approved', 'published', 'deprecated', 'archived']),
    createdAt: z.date(),
    updatedAt: z.date(),
    publishedAt: z.date().optional(),
    deprecatedAt: z.date().optional(),
    
    // Change management
    changeLog: z.array(z.object({
      version: z.string(),
      date: z.date(),
      changes: z.array(z.string()),
      author: z.string()
    })).default([]),
    
    // Migration information
    migrationGuide: z.string().optional(),
    backwardCompatible: z.boolean().default(true)
  }),
  
  // Validation and testing
  validation: z.object({
    schema: z.any().optional(), // Additional JSON schema for validation
    testCases: z.array(z.object({
      name: z.string(),
      input: z.any(),
      expectedOutput: z.any(),
      description: z.string().optional()
    })).default([]),
    
    // Quality metrics
    qualityScore: z.number().min(0).max(100).optional(),
    testCoverage: z.number().min(0).max(100).optional()
  }).default({ testCases: [] })
});

// ============================================================================
// COMPLETE POLICY DEFINITION SCHEMA
// ============================================================================

/**
 * Complete enhanced policy schema
 */
export const CompleteEnhancedPolicySchema = z.object({
  metadata: EnhancedPolicyMetadataSchema,
  definition: z.discriminatedUnion('type', [
    EnhancedAccessControlPolicySchema,
    EnhancedDataRetentionPolicySchema,
    EnhancedWorkflowApprovalPolicySchema,
    EnhancedSecurityScanningPolicySchema,
    EnhancedCompliancePolicySchema
  ])
});

// ============================================================================
// TYPE EXPORTS
// ============================================================================

export type EnhancedPolicyMetadata = z.infer<typeof EnhancedPolicyMetadataSchema>;
export type EnhancedPolicyCondition = z.infer<typeof EnhancedPolicyConditionSchema>;
export type EnhancedPolicyConditionGroup = z.infer<typeof EnhancedPolicyConditionGroupSchema>;
export type EnhancedPolicyAction = z.infer<typeof EnhancedPolicyActionSchema>;
export type EnhancedAccessControlPolicy = z.infer<typeof EnhancedAccessControlPolicySchema>;
export type EnhancedDataRetentionPolicy = z.infer<typeof EnhancedDataRetentionPolicySchema>;
export type EnhancedWorkflowApprovalPolicy = z.infer<typeof EnhancedWorkflowApprovalPolicySchema>;
export type EnhancedSecurityScanningPolicy = z.infer<typeof EnhancedSecurityScanningPolicySchema>;
export type EnhancedCompliancePolicy = z.infer<typeof EnhancedCompliancePolicySchema>;
export type EnhancedPolicyTemplate = z.infer<typeof EnhancedPolicyTemplateSchema>;
export type CompleteEnhancedPolicy = z.infer<typeof CompleteEnhancedPolicySchema>;

// ============================================================================
// VALIDATION UTILITIES
// ============================================================================

/**
 * Enhanced validation error with detailed context
 */
export class EnhancedPolicyValidationError extends Error {
  constructor(
    message: string,
    public readonly validationErrors: z.ZodError['errors'],
    public readonly policyId?: string,
    public readonly context?: Record<string, any>
  ) {
    super(message);
    this.name = 'EnhancedPolicyValidationError';
  }
  
  /**
   * Get formatted error details
   */
  getFormattedErrors(): Array<{
    path: string;
    message: string;
    code: string;
    expected?: any;
    received?: any;
  }> {
    return this.validationErrors.map(error => ({
      path: error.path.join('.'),
      message: error.message,
      code: error.code,
      expected: (error as any).expected,
      received: (error as any).received
    }));
  }
}

/**
 * Validate complete enhanced policy
 */
export function validateEnhancedPolicy(policy: unknown): CompleteEnhancedPolicy {
  try {
    return CompleteEnhancedPolicySchema.parse(policy);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new EnhancedPolicyValidationError(
        'Enhanced policy validation failed',
        error.errors,
        (policy as any)?.metadata?.id
      );
    }
    throw error;
  }
}

/**
 * Validate enhanced policy template
 */
export function validateEnhancedPolicyTemplate(template: unknown): EnhancedPolicyTemplate {
  try {
    return EnhancedPolicyTemplateSchema.parse(template);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new EnhancedPolicyValidationError(
        'Enhanced policy template validation failed',
        error.errors,
        (template as any)?.id
      );
    }
    throw error;
  }
}

/**
 * Partial validation for policy updates
 */
export function validatePartialEnhancedPolicy(policy: unknown): Partial<CompleteEnhancedPolicy> {
  const PartialSchema = CompleteEnhancedPolicySchema.partial();
  try {
    return PartialSchema.parse(policy);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new EnhancedPolicyValidationError(
        'Partial enhanced policy validation failed',
        error.errors,
        (policy as any)?.metadata?.id
      );
    }
    throw error;
  }
}

// Schema version for compatibility tracking
export const ENHANCED_POLICY_SCHEMA_VERSION = '2.0.0';