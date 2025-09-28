import { describe, it, expect } from 'vitest';
import {
  PolicySchema,
  PolicyDefinitionSchema,
  AccessControlPolicySchema,
  DataRetentionPolicySchema,
  WorkflowApprovalPolicySchema,
  SecurityScanningPolicySchema,
  CompliancePolicySchema,
  PolicyTemplateSchema,
  PolicyVersionSchema,
  validatePolicy,
  validatePolicyDefinition,
  validatePolicyTemplate,
  PolicyValidationError,
  POLICY_SCHEMA_VERSION,
  type Policy,
  type PolicyDefinition,
} from '../policy.js';

describe('Policy Schema Validation', () => {
  const mockDate = new Date('2024-01-01T00:00:00Z');
  const mockUuid = '123e4567-e89b-12d3-a456-426614174000';

  describe('PolicyMetadataSchema', () => {
    const validMetadata = {
      id: mockUuid,
      name: 'Test Policy',
      description: 'A test policy',
      version: '1.0.0',
      createdAt: mockDate,
      updatedAt: mockDate,
      createdBy: mockUuid,
      updatedBy: mockUuid,
      organizationId: mockUuid,
      classification: 'internal' as const,
      owner: mockUuid,
      tags: ['security', 'compliance'],
      status: 'active' as const,
      effectiveDate: mockDate,
      expirationDate: new Date('2025-01-01T00:00:00Z'),
      complianceFrameworks: ['SOC2', 'GDPR'] as const,
      riskLevel: 'medium' as const,
    };

    const validDefinition = {
      type: 'access_control' as const,
      rules: [],
      defaultAction: { type: 'deny' as const },
    };

    it('should validate correct metadata', () => {
      expect(() => PolicySchema.parse({ metadata: validMetadata, definition: validDefinition })).not.toThrow();
    });

    it('should reject invalid version format', () => {
      const invalidMetadata = { ...validMetadata, version: '1.0' };
      expect(() => PolicySchema.parse({ metadata: invalidMetadata, definition: validDefinition })).toThrow();
    });

    it('should reject invalid classification', () => {
      const invalidMetadata = { ...validMetadata, classification: 'invalid' };
      expect(() => PolicySchema.parse({ metadata: invalidMetadata, definition: validDefinition })).toThrow();
    });
  });

  describe('Access Control Policy', () => {
    const validAccessControlPolicy: PolicyDefinition = {
      type: 'access_control',
      rules: [
        {
          resource: '/api/users',
          permissions: ['read', 'write'],
          conditions: {
            conditions: [
              {
                field: 'user.role',
                operator: 'equals',
                value: 'admin',
              },
            ],
            logicalOperator: 'AND',
          },
          action: {
            type: 'allow',
            severity: 'info',
          },
        },
      ],
      defaultAction: {
        type: 'deny',
        severity: 'warning',
        message: 'Access denied by default',
      },
    };

    it('should validate correct access control policy', () => {
      expect(() => AccessControlPolicySchema.parse(validAccessControlPolicy)).not.toThrow();
    });

    it('should reject invalid permission', () => {
      const invalidPolicy = {
        ...validAccessControlPolicy,
        rules: [
          {
            ...validAccessControlPolicy.rules[0],
            permissions: ['invalid_permission'],
          },
        ],
      };
      expect(() => AccessControlPolicySchema.parse(invalidPolicy)).toThrow();
    });
  });

  describe('Data Retention Policy', () => {
    const validDataRetentionPolicy: PolicyDefinition = {
      type: 'data_retention',
      rules: [
        {
          dataType: 'user_logs',
          retentionPeriod: {
            value: 90,
            unit: 'days',
          },
          action: {
            type: 'archive',
            location: 's3://archive-bucket',
          },
        },
      ],
    };

    it('should validate correct data retention policy', () => {
      expect(() => DataRetentionPolicySchema.parse(validDataRetentionPolicy)).not.toThrow();
    });

    it('should reject negative retention period', () => {
      const invalidPolicy = {
        ...validDataRetentionPolicy,
        rules: [
          {
            ...validDataRetentionPolicy.rules[0],
            retentionPeriod: { value: -30, unit: 'days' },
          },
        ],
      };
      expect(() => DataRetentionPolicySchema.parse(invalidPolicy)).toThrow();
    });
  });

  describe('Workflow Approval Policy', () => {
    const validWorkflowApprovalPolicy: PolicyDefinition = {
      type: 'workflow_approval',
      rules: [
        {
          workflowType: 'data_export',
          approvalRequired: true,
          approvers: [
            {
              userId: mockUuid,
              required: true,
            },
            {
              roleId: mockUuid,
              required: false,
            },
          ],
          conditions: {
            conditions: [
              {
                field: 'data.size',
                operator: 'greater_than',
                value: 1000000,
              },
            ],
            logicalOperator: 'AND',
          },
          timeout: {
            value: 24,
            unit: 'hours',
          },
        },
      ],
    };

    it('should validate correct workflow approval policy', () => {
      expect(() => WorkflowApprovalPolicySchema.parse(validWorkflowApprovalPolicy)).not.toThrow();
    });

    it('should validate without timeout', () => {
      const policyWithoutTimeout = {
        ...validWorkflowApprovalPolicy,
        rules: [
          {
            ...validWorkflowApprovalPolicy.rules[0],
            timeout: undefined,
          },
        ],
      };
      expect(() => WorkflowApprovalPolicySchema.parse(policyWithoutTimeout)).not.toThrow();
    });
  });

  describe('Security Scanning Policy', () => {
    const validSecurityScanningPolicy: PolicyDefinition = {
      type: 'security_scanning',
      rules: [
        {
          scanType: 'vulnerability',
          schedule: {
            frequency: 'daily',
            time: '02:00',
          },
          targets: ['/api', '/admin'],
          action: {
            type: 'alert',
            severity: 'critical',
            message: 'Vulnerability detected',
          },
        },
      ],
    };

    it('should validate correct security scanning policy', () => {
      expect(() => SecurityScanningPolicySchema.parse(validSecurityScanningPolicy)).not.toThrow();
    });

    it('should reject invalid time format', () => {
      const invalidPolicy = {
        ...validSecurityScanningPolicy,
        rules: [
          {
            ...validSecurityScanningPolicy.rules[0],
            schedule: { frequency: 'daily', time: '25:00' },
          },
        ],
      };
      expect(() => SecurityScanningPolicySchema.parse(invalidPolicy)).toThrow();
    });
  });

  describe('Compliance Policy', () => {
    const validCompliancePolicy: PolicyDefinition = {
      type: 'compliance',
      framework: 'SOC2',
      rules: [
        {
          controlId: 'CC6.1',
          requirement: 'Logical and physical access controls',
          implementation: 'Multi-factor authentication required',
          evidenceRequired: true,
          frequency: 'quarterly',
          action: {
            type: 'audit',
            severity: 'info',
          },
        },
      ],
    };

    it('should validate correct compliance policy', () => {
      expect(() => CompliancePolicySchema.parse(validCompliancePolicy)).not.toThrow();
    });

    it('should require valid framework', () => {
      const invalidPolicy = {
        ...validCompliancePolicy,
        framework: 'INVALID_FRAMEWORK',
      };
      expect(() => CompliancePolicySchema.parse(invalidPolicy)).toThrow();
    });
  });

  describe('Policy Template Schema', () => {
    const validTemplate = {
      id: mockUuid,
      name: 'Data Access Control Template',
      description: 'Template for data access policies',
      category: 'access_control' as const,
      template: {
        type: 'access_control' as const,
        rules: [],
        defaultAction: { type: 'deny' as const },
      },
      variables: [
        {
          name: 'resourcePath',
          type: 'string' as const,
          required: true,
          description: 'Resource path to protect',
        },
      ],
      complianceFrameworks: ['SOC2'] as const,
      createdAt: mockDate,
      updatedAt: mockDate,
    };

    it('should validate correct template', () => {
      expect(() => PolicyTemplateSchema.parse(validTemplate)).not.toThrow();
    });
  });

  describe('Policy Version Schema', () => {
    const validVersion = {
      id: mockUuid,
      policyId: mockUuid,
      version: '1.1.0',
      changes: [
        {
          field: 'metadata.description',
          oldValue: 'Old description',
          newValue: 'New description',
          changeType: 'modified' as const,
        },
      ],
      changeReason: 'Updated policy description',
      changedBy: mockUuid,
      changedAt: mockDate,
      approvedBy: mockUuid,
      approvedAt: mockDate,
    };

    it('should validate correct version history', () => {
      expect(() => PolicyVersionSchema.parse(validVersion)).not.toThrow();
    });
  });

  describe('Validation Helper Functions', () => {
    const validPolicy: Policy = {
      metadata: {
        id: mockUuid,
        name: 'Test Policy',
        version: '1.0.0',
        createdAt: mockDate,
        updatedAt: mockDate,
        createdBy: mockUuid,
        updatedBy: mockUuid,
        organizationId: mockUuid,
        classification: 'internal',
        owner: mockUuid,
        status: 'active',
        effectiveDate: mockDate,
        complianceFrameworks: [],
        riskLevel: 'low',
        tags: [],
      },
      definition: {
        type: 'access_control',
        rules: [],
        defaultAction: { type: 'deny' },
      },
    };

    describe('validatePolicy', () => {
      it('should validate correct policy', () => {
        expect(() => validatePolicy(validPolicy)).not.toThrow();
      });

      it('should throw PolicyValidationError for invalid policy', () => {
        const invalidPolicy = { ...validPolicy, metadata: { ...validPolicy.metadata, version: 'invalid' } };
        expect(() => validatePolicy(invalidPolicy)).toThrow(PolicyValidationError);
      });
    });

    describe('validatePolicyDefinition', () => {
      it('should validate correct definition', () => {
        expect(() => validatePolicyDefinition(validPolicy.definition)).not.toThrow();
      });

      it('should throw PolicyValidationError for invalid definition', () => {
        const invalidDefinition = { type: 'invalid_type' };
        expect(() => validatePolicyDefinition(invalidDefinition, 'access_control')).toThrow(PolicyValidationError);
      });
    });

    describe('validatePolicyTemplate', () => {
      const validTemplate = {
        id: mockUuid,
        name: 'Test Template',
        description: 'A test template',
        category: 'security',
        template: validPolicy.definition,
        variables: [],
        complianceFrameworks: [],
        createdAt: mockDate,
        updatedAt: mockDate,
      };

      it('should validate correct template', () => {
        expect(() => validatePolicyTemplate(validTemplate)).not.toThrow();
      });
    });
  });

  describe('Complex Nested Conditions', () => {
    const complexConditions = {
      conditions: [
        {
          field: 'user.role',
          operator: 'equals' as const,
          value: 'admin',
        },
      ],
      logicalOperator: 'AND' as const,
      nested: [
        {
          conditions: [
            {
              field: 'request.time',
              operator: 'greater_than' as const,
              value: '09:00',
            },
            {
              field: 'request.time',
              operator: 'less_than' as const,
              value: '17:00',
            },
          ],
          logicalOperator: 'AND' as const,
        },
      ],
    };

    it('should validate complex nested conditions', () => {
      const policy: PolicyDefinition = {
        type: 'access_control',
        rules: [
          {
            resource: '/admin',
            permissions: ['read'],
            conditions: complexConditions,
            action: { type: 'allow' },
          },
        ],
        defaultAction: { type: 'deny' },
      };

      expect(() => PolicyDefinitionSchema.parse(policy)).not.toThrow();
    });
  });

  describe('Schema Version', () => {
    it('should export correct schema version', () => {
      expect(POLICY_SCHEMA_VERSION).toBe('1.0.0');
    });
  });
});