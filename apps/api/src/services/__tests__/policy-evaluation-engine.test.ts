import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  PolicyEvaluationEngine,
  PolicyEvaluationContext,
  PolicyLoader,
  AuditLogger
} from '../policy-evaluation-engine';
import { Policy, PolicyDefinition } from '../../lib/schemas/policy';

// Mock implementations
const mockPolicyLoader: PolicyLoader = {
  loadPolicy: vi.fn(),
  findPoliciesForResource: vi.fn()
};

const mockAuditLogger: AuditLogger = {
  logPolicyEvaluation: vi.fn()
};

describe('PolicyEvaluationEngine', () => {
  let engine: PolicyEvaluationEngine;
  let mockContext: PolicyEvaluationContext;

  beforeEach(() => {
    vi.clearAllMocks();
    engine = new PolicyEvaluationEngine(mockPolicyLoader, mockAuditLogger);

    mockContext = {
      userId: 'user-123',
      organizationId: 'org-456',
      timestamp: new Date('2024-01-01T10:00:00Z'),
      userRoles: ['employee'],
      userPermissions: ['read'],
      metadata: {
        ipAddress: '192.168.1.100',
        userAgent: 'Test Browser',
        requestId: 'req-789'
      }
    };
  });

  afterEach(() => {
    engine.clearCache();
  });

  describe('Access Control Policy Evaluation', () => {
    it('should allow access when policy rule matches and permits action', async () => {
      const policy: Policy = {
        metadata: {
          id: 'policy-123',
          name: 'Test Access Policy',
          version: '1.0.0',
          createdAt: new Date('2024-01-01T09:00:00Z'),
          updatedAt: new Date('2024-01-01T09:00:00Z'),
          createdBy: 'admin-123',
          updatedBy: 'admin-123',
          organizationId: 'org-456',
          classification: 'internal',
          owner: 'admin-123',
          tags: ['security'],
          status: 'active',
          effectiveDate: new Date('2024-01-01T08:00:00Z'),
          complianceFrameworks: ['SOC2'],
          riskLevel: 'medium'
        },
        definition: {
          type: 'access_control',
          rules: [
            {
              resource: 'documents',
              permissions: ['read', 'write'],
              conditions: {
                conditions: [
                  {
                    field: 'userRoles',
                    operator: 'in',
                    value: ['employee', 'manager']
                  }
                ],
                logicalOperator: 'AND'
              },
              action: {
                type: 'allow',
                message: 'Access granted to document'
              }
            }
          ],
          defaultAction: {
            type: 'deny',
            message: 'Access denied by default'
          }
        }
      };

      const context = {
        ...mockContext,
        resource: 'documents',
        action: 'read'
      };

      const result = await engine.evaluatePolicy(policy, context);

      expect(result.allowed).toBe(true);
      expect(result.policyId).toBe('policy-123');
      expect(result.action.type).toBe('allow');
      expect(result.ruleMatched).toBe('documents:read,write');
      expect(mockAuditLogger.logPolicyEvaluation).toHaveBeenCalledWith(
        'policy-123',
        context,
        result
      );
    });

    it('should deny access when policy rule matches but denies action', async () => {
      const policy: Policy = {
        metadata: {
          id: 'policy-456',
          name: 'Restrictive Policy',
          version: '1.0.0',
          createdAt: new Date('2024-01-01T09:00:00Z'),
          updatedAt: new Date('2024-01-01T09:00:00Z'),
          createdBy: 'admin-123',
          updatedBy: 'admin-123',
          organizationId: 'org-456',
          classification: 'restricted',
          owner: 'admin-123',
          tags: ['security'],
          status: 'active',
          effectiveDate: new Date('2024-01-01T08:00:00Z'),
          complianceFrameworks: ['SOC2'],
          riskLevel: 'high'
        },
        definition: {
          type: 'access_control',
          rules: [
            {
              resource: 'confidential',
              permissions: ['delete'],
              conditions: {
                conditions: [
                  {
                    field: 'userRoles',
                    operator: 'in',
                    value: ['contractor']
                  }
                ],
                logicalOperator: 'AND'
              },
              action: {
                type: 'deny',
                severity: 'error',
                message: 'Contractors cannot delete confidential data'
              }
            }
          ],
          defaultAction: {
            type: 'allow',
            message: 'Access allowed by default'
          }
        }
      };

      const context = {
        ...mockContext,
        resource: 'confidential',
        action: 'delete',
        userRoles: ['contractor']
      };

      const result = await engine.evaluatePolicy(policy, context);

      expect(result.allowed).toBe(false);
      expect(result.policyId).toBe('policy-456');
      expect(result.action.type).toBe('deny');
      expect(result.action.severity).toBe('error');
      expect(result.ruleMatched).toBe('confidential:delete');
    });

    it('should use default action when no rules match', async () => {
      const policy: Policy = {
        metadata: {
          id: 'policy-789',
          name: 'Default Deny Policy',
          version: '1.0.0',
          createdAt: new Date('2024-01-01T09:00:00Z'),
          updatedAt: new Date('2024-01-01T09:00:00Z'),
          createdBy: 'admin-123',
          updatedBy: 'admin-123',
          organizationId: 'org-456',
          classification: 'internal',
          owner: 'admin-123',
          tags: ['security'],
          status: 'active',
          effectiveDate: new Date('2024-01-01T08:00:00Z'),
          complianceFrameworks: ['SOC2'],
          riskLevel: 'medium'
        },
        definition: {
          type: 'access_control',
          rules: [
            {
              resource: 'admin-panel',
              permissions: ['admin'],
              conditions: {
                conditions: [
                  {
                    field: 'userRoles',
                    operator: 'in',
                    value: ['admin']
                  }
                ],
                logicalOperator: 'AND'
              },
              action: {
                type: 'allow',
                message: 'Admin access granted'
              }
            }
          ],
          defaultAction: {
            type: 'deny',
            severity: 'warning',
            message: 'Access denied - no matching rules'
          }
        }
      };

      const context = {
        ...mockContext,
        resource: 'user-data',
        action: 'read'
      };

      const result = await engine.evaluatePolicy(policy, context);

      expect(result.allowed).toBe(false);
      expect(result.action.type).toBe('deny');
      expect(result.action.severity).toBe('warning');
      expect(result.ruleMatched).toBeUndefined();
    });
  });

  describe('Workflow Approval Policy Evaluation', () => {
    it('should require approval when workflow matches approval rule', async () => {
      const policy: Policy = {
        metadata: {
          id: 'approval-policy-123',
          name: 'Purchase Approval Policy',
          version: '1.0.0',
          createdAt: new Date('2024-01-01T09:00:00Z'),
          updatedAt: new Date('2024-01-01T09:00:00Z'),
          createdBy: 'admin-123',
          updatedBy: 'admin-123',
          organizationId: 'org-456',
          classification: 'internal',
          owner: 'admin-123',
          tags: ['workflow'],
          status: 'active',
          effectiveDate: new Date('2024-01-01T08:00:00Z'),
          complianceFrameworks: ['SOC2'],
          riskLevel: 'medium'
        },
        definition: {
          type: 'workflow_approval',
          rules: [
            {
              workflowType: 'purchase_request',
              approvalRequired: true,
              approvers: [
                {
                  roleId: 'manager',
                  required: true
                },
                {
                  roleId: 'finance',
                  required: false
                }
              ],
              conditions: {
                conditions: [
                  {
                    field: 'requestData.amount',
                    operator: 'greater_than',
                    value: 1000
                  }
                ],
                logicalOperator: 'AND'
              },
              timeout: {
                value: 24,
                unit: 'hours'
              }
            }
          ]
        }
      };

      const context = {
        ...mockContext,
        metadata: {
          ...mockContext.metadata,
          workflowType: 'purchase_request'
        },
        requestData: {
          amount: 1500,
          description: 'Office equipment'
        }
      };

      const result = await engine.evaluatePolicy(policy, context);

      expect(result.allowed).toBe(false);
      expect(result.requiresApproval).toBe(true);
      expect(result.approvers).toContain('manager');
      expect(result.action.type).toBe('require_approval');
      expect(result.ruleMatched).toBe('purchase_request');
    });

    it('should allow workflow when approval is not required', async () => {
      const policy: Policy = {
        metadata: {
          id: 'approval-policy-456',
          name: 'Small Purchase Policy',
          version: '1.0.0',
          createdAt: new Date('2024-01-01T09:00:00Z'),
          updatedAt: new Date('2024-01-01T09:00:00Z'),
          createdBy: 'admin-123',
          updatedBy: 'admin-123',
          organizationId: 'org-456',
          classification: 'internal',
          owner: 'admin-123',
          tags: ['workflow'],
          status: 'active',
          effectiveDate: new Date('2024-01-01T08:00:00Z'),
          complianceFrameworks: ['SOC2'],
          riskLevel: 'low'
        },
        definition: {
          type: 'workflow_approval',
          rules: [
            {
              workflowType: 'purchase_request',
              approvalRequired: false,
              approvers: [],
              conditions: {
                conditions: [
                  {
                    field: 'requestData.amount',
                    operator: 'less_than',
                    value: 100
                  }
                ],
                logicalOperator: 'AND'
              }
            }
          ]
        }
      };

      const context = {
        ...mockContext,
        metadata: {
          ...mockContext.metadata,
          workflowType: 'purchase_request'
        },
        requestData: {
          amount: 50,
          description: 'Office supplies'
        }
      };

      const result = await engine.evaluatePolicy(policy, context);

      expect(result.allowed).toBe(true);
      expect(result.requiresApproval).toBe(false);
      expect(result.action.type).toBe('allow');
    });
  });

  describe('Data Retention Policy Evaluation', () => {
    it('should block access to data beyond retention period', async () => {
      const policy: Policy = {
        metadata: {
          id: 'retention-policy-123',
          name: 'Data Retention Policy',
          version: '1.0.0',
          createdAt: new Date('2024-01-01T09:00:00Z'),
          updatedAt: new Date('2024-01-01T09:00:00Z'),
          createdBy: 'admin-123',
          updatedBy: 'admin-123',
          organizationId: 'org-456',
          classification: 'internal',
          owner: 'admin-123',
          tags: ['data-governance'],
          status: 'active',
          effectiveDate: new Date('2024-01-01T08:00:00Z'),
          complianceFrameworks: ['GDPR'],
          riskLevel: 'high'
        },
        definition: {
          type: 'data_retention',
          rules: [
            {
              dataType: 'user_logs',
              retentionPeriod: {
                value: 30,
                unit: 'days'
              },
              action: {
                type: 'delete',
                location: 'archive'
              }
            }
          ]
        }
      };

      const context = {
        ...mockContext,
        metadata: {
          ...mockContext.metadata,
          dataType: 'user_logs',
          createdAt: new Date('2023-11-01T10:00:00Z') // 61 days ago
        }
      };

      const result = await engine.evaluatePolicy(policy, context);

      expect(result.allowed).toBe(false);
      expect(result.action.type).toBe('block');
      expect(result.action.severity).toBe('warning');
      expect(result.metadata?.retentionAction).toBe('delete');
      expect(result.ruleMatched).toBe('user_logs');
    });

    it('should allow access to data within retention period', async () => {
      const policy: Policy = {
        metadata: {
          id: 'retention-policy-456',
          name: 'Recent Data Policy',
          version: '1.0.0',
          createdAt: new Date('2024-01-01T09:00:00Z'),
          updatedAt: new Date('2024-01-01T09:00:00Z'),
          createdBy: 'admin-123',
          updatedBy: 'admin-123',
          organizationId: 'org-456',
          classification: 'internal',
          owner: 'admin-123',
          tags: ['data-governance'],
          status: 'active',
          effectiveDate: new Date('2024-01-01T08:00:00Z'),
          complianceFrameworks: ['GDPR'],
          riskLevel: 'medium'
        },
        definition: {
          type: 'data_retention',
          rules: [
            {
              dataType: 'transaction_logs',
              retentionPeriod: {
                value: 7,
                unit: 'years'
              },
              action: {
                type: 'archive'
              }
            }
          ]
        }
      };

      const context = {
        ...mockContext,
        metadata: {
          ...mockContext.metadata,
          dataType: 'transaction_logs',
          createdAt: new Date('2023-12-01T10:00:00Z') // 1 month ago
        }
      };

      const result = await engine.evaluatePolicy(policy, context);

      expect(result.allowed).toBe(true);
      expect(result.action.type).toBe('allow');
      expect(result.action.message).toBe('Within retention period');
    });
  });

  describe('Complex Condition Evaluation', () => {
    it('should evaluate nested conditions with AND logic', async () => {
      const policy: Policy = {
        metadata: {
          id: 'complex-policy-123',
          name: 'Complex Conditions Policy',
          version: '1.0.0',
          createdAt: new Date('2024-01-01T09:00:00Z'),
          updatedAt: new Date('2024-01-01T09:00:00Z'),
          createdBy: 'admin-123',
          updatedBy: 'admin-123',
          organizationId: 'org-456',
          classification: 'internal',
          owner: 'admin-123',
          tags: ['security'],
          status: 'active',
          effectiveDate: new Date('2024-01-01T08:00:00Z'),
          complianceFrameworks: ['SOC2'],
          riskLevel: 'high'
        },
        definition: {
          type: 'access_control',
          rules: [
            {
              resource: 'sensitive-data',
              permissions: ['read'],
              conditions: {
                conditions: [
                  {
                    field: 'userRoles',
                    operator: 'in',
                    value: ['manager', 'admin']
                  },
                  {
                    field: 'metadata.ipAddress',
                    operator: 'contains',
                    value: '192.168.1'
                  }
                ],
                logicalOperator: 'AND',
                nested: [
                  {
                    conditions: [
                      {
                        field: 'timestamp',
                        operator: 'greater_than',
                        value: new Date('2024-01-01T09:00:00Z').getTime()
                      }
                    ],
                    logicalOperator: 'AND'
                  }
                ]
              },
              action: {
                type: 'allow',
                message: 'Access granted to sensitive data'
              }
            }
          ],
          defaultAction: {
            type: 'deny',
            message: 'Access denied'
          }
        }
      };

      const context = {
        ...mockContext,
        resource: 'sensitive-data',
        action: 'read',
        userRoles: ['manager'],
        metadata: {
          ...mockContext.metadata,
          ipAddress: '192.168.1.100'
        },
        timestamp: new Date('2024-01-01T10:00:00Z')
      };

      const result = await engine.evaluatePolicy(policy, context);

      expect(result.allowed).toBe(true);
      expect(result.action.type).toBe('allow');
    });

    it('should evaluate conditions with OR logic', async () => {
      const policy: Policy = {
        metadata: {
          id: 'or-logic-policy-123',
          name: 'OR Logic Policy',
          version: '1.0.0',
          createdAt: new Date('2024-01-01T09:00:00Z'),
          updatedAt: new Date('2024-01-01T09:00:00Z'),
          createdBy: 'admin-123',
          updatedBy: 'admin-123',
          organizationId: 'org-456',
          classification: 'internal',
          owner: 'admin-123',
          tags: ['security'],
          status: 'active',
          effectiveDate: new Date('2024-01-01T08:00:00Z'),
          complianceFrameworks: ['SOC2'],
          riskLevel: 'medium'
        },
        definition: {
          type: 'access_control',
          rules: [
            {
              resource: 'reports',
              permissions: ['read'],
              conditions: {
                conditions: [
                  {
                    field: 'userRoles',
                    operator: 'in',
                    value: ['admin']
                  },
                  {
                    field: 'userRoles',
                    operator: 'in',
                    value: ['report-viewer']
                  }
                ],
                logicalOperator: 'OR'
              },
              action: {
                type: 'allow',
                message: 'Report access granted'
              }
            }
          ],
          defaultAction: {
            type: 'deny',
            message: 'Report access denied'
          }
        }
      };

      const context = {
        ...mockContext,
        resource: 'reports',
        action: 'read',
        userRoles: ['report-viewer'] // Not admin, but should still work with OR
      };

      const result = await engine.evaluatePolicy(policy, context);

      expect(result.allowed).toBe(true);
      expect(result.action.type).toBe('allow');
    });
  });

  describe('Multiple Policy Evaluation', () => {
    it('should evaluate multiple policies and aggregate results', async () => {
      const policies = [
        {
          metadata: { id: 'policy-1' },
          definition: { type: 'access_control' }
        },
        {
          metadata: { id: 'policy-2' },
          definition: { type: 'workflow_approval' }
        }
      ];

      vi.mocked(mockPolicyLoader.loadPolicy)
        .mockImplementation(async (id) => {
          return policies.find(p => p.metadata.id === id) as Policy || null;
        });

      // Mock individual policy evaluations
      const spy = vi.spyOn(engine, 'evaluatePolicy');
      spy.mockImplementation(async (policy) => ({
        allowed: policy.metadata.id === 'policy-1',
        policyId: policy.metadata.id,
        action: {
          type: policy.metadata.id === 'policy-1' ? 'allow' : 'deny',
          message: `Result for ${policy.metadata.id}`
        },
        evaluationTime: 10
      }));

      const result = await engine.evaluateMultiplePolicies(
        ['policy-1', 'policy-2'],
        mockContext
      );

      expect(result.finalDecision).toBe('deny');
      expect(result.results).toHaveLength(2);
      expect(result.blockedBy).toHaveLength(1);
      expect(result.blockedBy![0].policyId).toBe('policy-2');
      expect(result.appliedPolicies).toBe(2);

      spy.mockRestore();
    });

    it('should handle approval requirements correctly', async () => {
      const policies = [
        {
          metadata: { id: 'policy-approval' },
          definition: { type: 'workflow_approval' }
        }
      ];

      vi.mocked(mockPolicyLoader.loadPolicy)
        .mockResolvedValue(policies[0] as Policy);

      const spy = vi.spyOn(engine, 'evaluatePolicy');
      spy.mockResolvedValue({
        allowed: false,
        policyId: 'policy-approval',
        action: {
          type: 'require_approval',
          message: 'Approval required'
        },
        requiresApproval: true,
        approvers: ['manager-123'],
        evaluationTime: 15
      });

      const result = await engine.evaluateMultiplePolicies(
        ['policy-approval'],
        mockContext
      );

      expect(result.finalDecision).toBe('require_approval');
      expect(result.approvalRequired).toHaveLength(1);
      expect(result.approvalRequired![0].approvers).toContain('manager-123');

      spy.mockRestore();
    });
  });

  describe('Policy Caching', () => {
    it('should cache policy evaluation results', async () => {
      const policy: Policy = {
        metadata: {
          id: 'cacheable-policy',
          name: 'Cacheable Policy',
          version: '1.0.0',
          createdAt: new Date('2024-01-01T09:00:00Z'),
          updatedAt: new Date('2024-01-01T09:00:00Z'),
          createdBy: 'admin-123',
          updatedBy: 'admin-123',
          organizationId: 'org-456',
          classification: 'internal',
          owner: 'admin-123',
          tags: ['test'],
          status: 'active',
          effectiveDate: new Date('2024-01-01T08:00:00Z'),
          complianceFrameworks: ['SOC2'],
          riskLevel: 'low'
        },
        definition: {
          type: 'access_control',
          rules: [],
          defaultAction: {
            type: 'allow',
            message: 'Default allow'
          }
        }
      };

      // First evaluation - should call loader
      await engine.evaluatePolicy(policy, mockContext);

      // Check cache stats
      const stats = engine.getCacheStats();
      expect(stats.size).toBeGreaterThan(0);
    });

    it('should clear cache when requested', async () => {
      const policy: Policy = {
        metadata: {
          id: 'clearable-policy',
          name: 'Clearable Policy',
          version: '1.0.0',
          createdAt: new Date('2024-01-01T09:00:00Z'),
          updatedAt: new Date('2024-01-01T09:00:00Z'),
          createdBy: 'admin-123',
          updatedBy: 'admin-123',
          organizationId: 'org-456',
          classification: 'internal',
          owner: 'admin-123',
          tags: ['test'],
          status: 'active',
          effectiveDate: new Date('2024-01-01T08:00:00Z'),
          complianceFrameworks: ['SOC2'],
          riskLevel: 'low'
        },
        definition: {
          type: 'access_control',
          rules: [],
          defaultAction: {
            type: 'allow',
            message: 'Default allow'
          }
        }
      };

      await engine.evaluatePolicy(policy, mockContext);

      let stats = engine.getCacheStats();
      expect(stats.size).toBeGreaterThan(0);

      engine.clearCache();

      stats = engine.getCacheStats();
      expect(stats.size).toBe(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle policy evaluation errors gracefully', async () => {
      const invalidPolicy = {
        metadata: {
          id: 'invalid-policy',
          // Missing required fields
        },
        definition: {
          type: 'invalid_type'
        }
      } as unknown as Policy;

      const result = await engine.evaluatePolicy(invalidPolicy, mockContext);

      expect(result.allowed).toBe(false);
      expect(result.action.type).toBe('deny');
      expect(result.action.severity).toBe('error');
      expect(result.action.message).toContain('Policy evaluation error');
    });

    it('should handle audit logger failures gracefully', async () => {
      vi.mocked(mockAuditLogger.logPolicyEvaluation).mockRejectedValue(
        new Error('Audit logging failed')
      );

      const policy: Policy = {
        metadata: {
          id: 'audit-fail-policy',
          name: 'Audit Fail Policy',
          version: '1.0.0',
          createdAt: new Date('2024-01-01T09:00:00Z'),
          updatedAt: new Date('2024-01-01T09:00:00Z'),
          createdBy: 'admin-123',
          updatedBy: 'admin-123',
          organizationId: 'org-456',
          classification: 'internal',
          owner: 'admin-123',
          tags: ['test'],
          status: 'active',
          effectiveDate: new Date('2024-01-01T08:00:00Z'),
          complianceFrameworks: ['SOC2'],
          riskLevel: 'low'
        },
        definition: {
          type: 'access_control',
          rules: [],
          defaultAction: {
            type: 'allow',
            message: 'Default allow'
          }
        }
      };

      // Should not throw even if audit logging fails
      const result = await engine.evaluatePolicy(policy, mockContext);
      expect(result.allowed).toBe(true);
    });
  });

  describe('Inactive Policy Handling', () => {
    it('should skip inactive policies', async () => {
      const inactivePolicy: Policy = {
        metadata: {
          id: 'inactive-policy',
          name: 'Inactive Policy',
          version: '1.0.0',
          createdAt: new Date('2024-01-01T09:00:00Z'),
          updatedAt: new Date('2024-01-01T09:00:00Z'),
          createdBy: 'admin-123',
          updatedBy: 'admin-123',
          organizationId: 'org-456',
          classification: 'internal',
          owner: 'admin-123',
          tags: ['test'],
          status: 'archived', // Not active
          effectiveDate: new Date('2024-01-01T08:00:00Z'),
          complianceFrameworks: ['SOC2'],
          riskLevel: 'low'
        },
        definition: {
          type: 'access_control',
          rules: [],
          defaultAction: {
            type: 'deny',
            message: 'Should not be reached'
          }
        }
      };

      const result = await engine.evaluatePolicy(inactivePolicy, mockContext);

      expect(result.allowed).toBe(true);
      expect(result.action.message).toBe('Policy not active');
    });

    it('should skip policies outside effective date range', async () => {
      const futurePolicy: Policy = {
        metadata: {
          id: 'future-policy',
          name: 'Future Policy',
          version: '1.0.0',
          createdAt: new Date('2024-01-01T09:00:00Z'),
          updatedAt: new Date('2024-01-01T09:00:00Z'),
          createdBy: 'admin-123',
          updatedBy: 'admin-123',
          organizationId: 'org-456',
          classification: 'internal',
          owner: 'admin-123',
          tags: ['test'],
          status: 'active',
          effectiveDate: new Date('2024-01-02T00:00:00Z'), // Future date
          complianceFrameworks: ['SOC2'],
          riskLevel: 'low'
        },
        definition: {
          type: 'access_control',
          rules: [],
          defaultAction: {
            type: 'deny',
            message: 'Should not be reached'
          }
        }
      };

      const result = await engine.evaluatePolicy(futurePolicy, mockContext);

      expect(result.allowed).toBe(true);
      expect(result.action.message).toBe('Policy not active');
    });

    it('should skip expired policies', async () => {
      const expiredPolicy: Policy = {
        metadata: {
          id: 'expired-policy',
          name: 'Expired Policy',
          version: '1.0.0',
          createdAt: new Date('2023-01-01T09:00:00Z'),
          updatedAt: new Date('2023-01-01T09:00:00Z'),
          createdBy: 'admin-123',
          updatedBy: 'admin-123',
          organizationId: 'org-456',
          classification: 'internal',
          owner: 'admin-123',
          tags: ['test'],
          status: 'active',
          effectiveDate: new Date('2023-01-01T00:00:00Z'),
          expirationDate: new Date('2023-12-31T23:59:59Z'), // Expired
          complianceFrameworks: ['SOC2'],
          riskLevel: 'low'
        },
        definition: {
          type: 'access_control',
          rules: [],
          defaultAction: {
            type: 'deny',
            message: 'Should not be reached'
          }
        }
      };

      const result = await engine.evaluatePolicy(expiredPolicy, mockContext);

      expect(result.allowed).toBe(true);
      expect(result.action.message).toBe('Policy not active');
    });
  });
});