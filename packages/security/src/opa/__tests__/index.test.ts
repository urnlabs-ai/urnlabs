import { OPAService, AuthorizationRequest, AuthorizationResponse } from '../index';

// Mock all dependencies
jest.mock('../OPAIntegrationService');
jest.mock('../PolicyManager');
jest.mock('../DecisionLogger');
jest.mock('../../services/audit-logging', () => ({
  auditLoggingService: {
    logEvent: jest.fn()
  }
}));

describe('OPAService', () => {
  let opaService: OPAService;
  let mockIntegrationService: any;
  let mockPolicyManager: any;
  let mockDecisionLogger: any;

  beforeEach(() => {
    const config = {
      integration: {
        timeout: 1000,
        retryAttempts: 1,
        cacheEnabled: true,
        cacheTtl: 300000,
        maxCacheSize: 100
      },
      policyManager: {
        policyDirectory: '/test/policies'
      },
      decisionLogger: {
        logDirectory: '/test/logs'
      }
    };

    // Setup mocks
    const { OPAIntegrationService } = require('../OPAIntegrationService');
    const { PolicyManager } = require('../PolicyManager');
    const { DecisionLogger } = require('../DecisionLogger');

    mockIntegrationService = {
      evaluatePolicy: jest.fn(),
      healthCheck: jest.fn(),
      getMetrics: jest.fn(),
      on: jest.fn(),
      emit: jest.fn()
    };

    mockPolicyManager = {
      getAllPolicies: jest.fn(),
      getPolicyContent: jest.fn(),
      createPolicy: jest.fn(),
      updatePolicy: jest.fn(),
      deployPolicy: jest.fn(),
      validatePolicy: jest.fn(),
      on: jest.fn(),
      emit: jest.fn()
    };

    mockDecisionLogger = {
      logDecision: jest.fn(),
      on: jest.fn(),
      emit: jest.fn()
    };

    OPAIntegrationService.mockImplementation(() => mockIntegrationService);
    PolicyManager.mockImplementation(() => mockPolicyManager);
    DecisionLogger.mockImplementation(() => mockDecisionLogger);

    opaService = new OPAService(config);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('authorize', () => {
    const mockRequest: AuthorizationRequest = {
      subject: {
        id: 'user-123',
        type: 'user',
        roles: ['user'],
        permissions: ['read:documents']
      },
      resource: {
        type: 'document',
        id: 'doc-456',
        attributes: { classification: 'internal' }
      },
      action: {
        name: 'read'
      },
      context: {
        requestId: 'req-123',
        ip: '192.168.1.1',
        userAgent: 'Test-Browser/1.0'
      }
    };

    it('should authorize successfully with allow decision', async () => {
      // Setup mocks
      mockPolicyManager.getAllPolicies.mockReturnValue([
        {
          id: 'policy-1',
          name: 'Test Policy',
          version: '1.0.0',
          status: 'active',
          tags: ['document']
        }
      ]);

      mockPolicyManager.getPolicyContent.mockReturnValue('package test\ndefault allow = true');

      mockIntegrationService.evaluatePolicy.mockResolvedValue({
        decision: {
          result: true,
          allow: true,
          deny: false,
          reasons: ['User has read permission']
        },
        executionTime: 50,
        evaluationId: 'eval-123',
        timestamp: new Date(),
        input: {
          input: expect.any(Object),
          policy: expect.any(String),
          context: expect.any(Object)
        },
        cached: false
      });

      mockDecisionLogger.logDecision.mockResolvedValue('log-123');

      const response = await opaService.authorize(mockRequest);

      expect(response).toEqual({
        decision: 'allow',
        reasons: ['User has read permission'],
        obligations: [],
        metadata: {
          evaluationId: 'eval-123',
          policyId: 'policy-1',
          policyVersion: '1.0.0',
          executionTime: expect.any(Number),
          cached: false,
          decisionLogId: 'log-123'
        }
      });
    });

    it('should deny access when policy denies', async () => {
      mockPolicyManager.getAllPolicies.mockReturnValue([
        {
          id: 'policy-1',
          name: 'Test Policy',
          version: '1.0.0',
          status: 'active',
          tags: ['document']
        }
      ]);

      mockPolicyManager.getPolicyContent.mockReturnValue('package test\ndefault allow = false');

      mockIntegrationService.evaluatePolicy.mockResolvedValue({
        decision: {
          result: false,
          allow: false,
          deny: true,
          reasons: ['Insufficient permissions']
        },
        executionTime: 30,
        evaluationId: 'eval-124',
        timestamp: new Date(),
        input: expect.any(Object),
        cached: false
      });

      mockDecisionLogger.logDecision.mockResolvedValue('log-124');

      const response = await opaService.authorize(mockRequest);

      expect(response).toEqual({
        decision: 'deny',
        reasons: ['Insufficient permissions'],
        obligations: [],
        metadata: {
          evaluationId: 'eval-124',
          policyId: 'policy-1',
          policyVersion: '1.0.0',
          executionTime: expect.any(Number),
          cached: false,
          decisionLogId: 'log-124'
        }
      });
    });

    it('should extract obligations from policy decision', async () => {
      mockPolicyManager.getAllPolicies.mockReturnValue([
        {
          id: 'policy-1',
          name: 'Test Policy',
          version: '1.0.0',
          status: 'active',
          tags: ['document']
        }
      ]);

      mockPolicyManager.getPolicyContent.mockReturnValue('package test\ndefault allow = true');

      mockIntegrationService.evaluatePolicy.mockResolvedValue({
        decision: {
          result: true,
          allow: true,
          deny: false,
          metadata: {
            obligations: [
              {
                type: 'log_access',
                action: 'audit_sensitive_access',
                parameters: { level: 'high' }
              }
            ]
          }
        },
        executionTime: 40,
        evaluationId: 'eval-125',
        timestamp: new Date(),
        input: expect.any(Object),
        cached: false
      });

      mockDecisionLogger.logDecision.mockResolvedValue('log-125');

      const response = await opaService.authorize(mockRequest);

      expect(response.obligations).toEqual([
        {
          type: 'log_access',
          action: 'audit_sensitive_access',
          parameters: { level: 'high' }
        }
      ]);
    });

    it('should handle authorization errors gracefully', async () => {
      mockPolicyManager.getAllPolicies.mockReturnValue([]);

      const response = await opaService.authorize(mockRequest);

      expect(response.decision).toBe('deny');
      expect(response.reasons).toContain('Authorization error: No applicable policy found for authorization request');
    });

    it('should emit events during authorization', async () => {
      mockPolicyManager.getAllPolicies.mockReturnValue([
        {
          id: 'policy-1',
          name: 'Test Policy',
          version: '1.0.0',
          status: 'active',
          tags: ['document']
        }
      ]);

      mockPolicyManager.getPolicyContent.mockReturnValue('package test\ndefault allow = true');

      mockIntegrationService.evaluatePolicy.mockResolvedValue({
        decision: { result: true, allow: true, deny: false },
        executionTime: 30,
        evaluationId: 'eval-126',
        timestamp: new Date(),
        input: expect.any(Object),
        cached: false
      });

      mockDecisionLogger.logDecision.mockResolvedValue('log-126');

      const eventSpy = jest.fn();
      opaService.on('authorizationComplete', eventSpy);

      await opaService.authorize(mockRequest);

      expect(eventSpy).toHaveBeenCalledWith({
        request: mockRequest,
        response: expect.objectContaining({
          decision: 'allow'
        }),
        evaluationResult: expect.any(Object)
      });
    });
  });

  describe('authorizeBatch', () => {
    it('should authorize multiple requests in parallel', async () => {
      const requests: AuthorizationRequest[] = [
        {
          subject: { id: 'user-1', type: 'user' },
          resource: { type: 'document', id: 'doc-1' },
          action: { name: 'read' },
          context: {}
        },
        {
          subject: { id: 'user-2', type: 'user' },
          resource: { type: 'document', id: 'doc-2' },
          action: { name: 'read' },
          context: {}
        }
      ];

      mockPolicyManager.getAllPolicies.mockReturnValue([
        {
          id: 'policy-1',
          name: 'Test Policy',
          version: '1.0.0',
          status: 'active',
          tags: ['document']
        }
      ]);

      mockPolicyManager.getPolicyContent.mockReturnValue('package test\ndefault allow = true');

      mockIntegrationService.evaluatePolicy.mockResolvedValue({
        decision: { result: true, allow: true, deny: false },
        executionTime: 30,
        evaluationId: 'eval-batch',
        timestamp: new Date(),
        input: expect.any(Object),
        cached: false
      });

      mockDecisionLogger.logDecision.mockResolvedValue('log-batch');

      const responses = await opaService.authorizeBatch(requests);

      expect(responses).toHaveLength(2);
      expect(responses[0].decision).toBe('allow');
      expect(responses[1].decision).toBe('allow');
    });
  });

  describe('can', () => {
    it('should provide simplified authorization check', async () => {
      mockPolicyManager.getAllPolicies.mockReturnValue([
        {
          id: 'policy-1',
          name: 'Test Policy',
          version: '1.0.0',
          status: 'active',
          tags: ['default']
        }
      ]);

      mockPolicyManager.getPolicyContent.mockReturnValue('package test\ndefault allow = true');

      mockIntegrationService.evaluatePolicy.mockResolvedValue({
        decision: { result: true, allow: true, deny: false },
        executionTime: 20,
        evaluationId: 'eval-can',
        timestamp: new Date(),
        input: expect.any(Object),
        cached: false
      });

      mockDecisionLogger.logDecision.mockResolvedValue('log-can');

      const canAccess = await opaService.can('user-123', 'read', 'document');

      expect(canAccess).toBe(true);
    });

    it('should return false when access is denied', async () => {
      mockPolicyManager.getAllPolicies.mockReturnValue([
        {
          id: 'policy-1',
          name: 'Test Policy',
          version: '1.0.0',
          status: 'active',
          tags: ['default']
        }
      ]);

      mockPolicyManager.getPolicyContent.mockReturnValue('package test\ndefault allow = false');

      mockIntegrationService.evaluatePolicy.mockResolvedValue({
        decision: { result: false, allow: false, deny: true },
        executionTime: 20,
        evaluationId: 'eval-can-deny',
        timestamp: new Date(),
        input: expect.any(Object),
        cached: false
      });

      mockDecisionLogger.logDecision.mockResolvedValue('log-can-deny');

      const canAccess = await opaService.can('user-123', 'delete', 'document');

      expect(canAccess).toBe(false);
    });
  });

  describe('deployPolicyBundle', () => {
    it('should deploy multiple policies successfully', async () => {
      const bundle = {
        policies: [
          {
            id: 'policy-1',
            name: 'Policy 1',
            content: 'package policy1\ndefault allow = true',
            version: '1.0.0'
          },
          {
            id: 'policy-2',
            name: 'Policy 2',
            content: 'package policy2\ndefault allow = false',
            version: '1.0.0'
          }
        ],
        environment: 'staging' as const,
        deployedBy: 'deploy-user'
      };

      mockPolicyManager.createPolicy
        .mockResolvedValueOnce('policy-id-1')
        .mockResolvedValueOnce('policy-id-2');

      mockPolicyManager.deployPolicy
        .mockResolvedValueOnce('deployment-1')
        .mockResolvedValueOnce('deployment-2');

      const eventSpy = jest.fn();
      opaService.on('policyBundleDeployed', eventSpy);

      const deploymentIds = await opaService.deployPolicyBundle(bundle);

      expect(deploymentIds).toEqual(['deployment-1', 'deployment-2']);
      expect(mockPolicyManager.createPolicy).toHaveBeenCalledTimes(2);
      expect(mockPolicyManager.deployPolicy).toHaveBeenCalledTimes(2);

      expect(eventSpy).toHaveBeenCalledWith({
        deployment: bundle,
        deploymentIds
      });
    });

    it('should update existing policies in bundle', async () => {
      const bundle = {
        policies: [
          {
            id: 'policy-1',
            name: 'Existing Policy',
            content: 'package existing\ndefault allow = true',
            version: '2.0.0'
          }
        ],
        environment: 'staging' as const,
        deployedBy: 'deploy-user'
      };

      mockPolicyManager.getAllPolicies.mockReturnValue([
        {
          id: 'existing-policy-id',
          name: 'Existing Policy',
          version: '1.0.0'
        }
      ]);

      mockPolicyManager.updatePolicy.mockResolvedValue('2.0.0');
      mockPolicyManager.deployPolicy.mockResolvedValue('deployment-updated');

      const deploymentIds = await opaService.deployPolicyBundle(bundle);

      expect(deploymentIds).toEqual(['deployment-updated']);
      expect(mockPolicyManager.updatePolicy).toHaveBeenCalledWith(
        'existing-policy-id',
        bundle.policies[0].content,
        'Bundle deployment to staging',
        'deploy-user'
      );
    });

    it('should handle deployment failures', async () => {
      const bundle = {
        policies: [
          {
            id: 'policy-1',
            name: 'Policy 1',
            content: 'package policy1\ndefault allow = true',
            version: '1.0.0'
          }
        ],
        environment: 'production' as const,
        deployedBy: 'deploy-user'
      };

      mockPolicyManager.createPolicy.mockRejectedValue(new Error('Policy creation failed'));

      const errorEventSpy = jest.fn();
      opaService.on('policyBundleDeploymentFailed', errorEventSpy);

      await expect(opaService.deployPolicyBundle(bundle)).rejects.toThrow('Policy creation failed');

      expect(errorEventSpy).toHaveBeenCalledWith({
        deployment: bundle,
        error: expect.any(Error),
        partialDeploymentIds: []
      });
    });
  });

  describe('getHealthStatus', () => {
    it('should return comprehensive health status', async () => {
      mockIntegrationService.healthCheck.mockResolvedValue({
        status: 'healthy',
        details: {
          wasmAvailable: true,
          serverAvailable: true
        }
      });

      mockIntegrationService.getMetrics.mockReturnValue({
        totalEvaluations: 100,
        cacheHits: 80,
        cacheMisses: 20,
        averageExecutionTime: 25
      });

      mockPolicyManager.getAllPolicies.mockReturnValue([
        { status: 'active' },
        { status: 'active' },
        { status: 'draft' }
      ]);

      const health = await opaService.getHealthStatus();

      expect(health).toEqual({
        overall: 'healthy',
        components: {
          integration: {
            status: 'healthy',
            details: {
              wasmAvailable: true,
              serverAvailable: true
            }
          },
          policyManager: {
            status: 'healthy',
            details: {
              totalPolicies: 3,
              activePolicies: 2
            }
          },
          decisionLogger: {
            status: 'healthy',
            details: {
              logsInMemory: 'N/A',
              lastLogTime: expect.any(Date)
            }
          }
        },
        metrics: {
          totalEvaluations: 100,
          cacheHits: 80,
          cacheMisses: 20,
          averageExecutionTime: 25
        }
      });
    });

    it('should return unhealthy when integration is unhealthy', async () => {
      mockIntegrationService.healthCheck.mockResolvedValue({
        status: 'unhealthy',
        details: {
          wasmAvailable: false,
          serverAvailable: false
        }
      });

      mockIntegrationService.getMetrics.mockReturnValue({});
      mockPolicyManager.getAllPolicies.mockReturnValue([]);

      const health = await opaService.getHealthStatus();

      expect(health.overall).toBe('unhealthy');
    });

    it('should return degraded when integration is degraded', async () => {
      mockIntegrationService.healthCheck.mockResolvedValue({
        status: 'degraded',
        details: {
          wasmAvailable: true,
          serverAvailable: false
        }
      });

      mockIntegrationService.getMetrics.mockReturnValue({});
      mockPolicyManager.getAllPolicies.mockReturnValue([]);

      const health = await opaService.getHealthStatus();

      expect(health.overall).toBe('degraded');
    });
  });

  describe('policy selection', () => {
    it('should select policy based on resource type tags', async () => {
      mockPolicyManager.getAllPolicies.mockReturnValue([
        {
          id: 'policy-1',
          name: 'Document Policy',
          version: '1.0.0',
          status: 'active',
          tags: ['document']
        },
        {
          id: 'policy-2',
          name: 'User Policy',
          version: '1.0.0',
          status: 'active',
          tags: ['user']
        }
      ]);

      mockPolicyManager.getPolicyContent
        .mockReturnValueOnce('package document\ndefault allow = true')
        .mockReturnValueOnce('package user\ndefault allow = false');

      const request: AuthorizationRequest = {
        subject: { id: 'user-123', type: 'user' },
        resource: { type: 'document', id: 'doc-456' },
        action: { name: 'read' },
        context: {}
      };

      const policy = await (opaService as any).getApplicablePolicy(request);

      expect(policy).toEqual({
        id: 'policy-1',
        name: 'Document Policy',
        version: '1.0.0',
        content: 'package document\ndefault allow = true'
      });
    });

    it('should fallback to default policy when no specific policy found', async () => {
      mockPolicyManager.getAllPolicies.mockReturnValue([
        {
          id: 'policy-default',
          name: 'Default Policy',
          version: '1.0.0',
          status: 'active',
          tags: ['default']
        }
      ]);

      mockPolicyManager.getPolicyContent.mockReturnValue('package default\ndefault allow = false');

      const request: AuthorizationRequest = {
        subject: { id: 'user-123', type: 'user' },
        resource: { type: 'unknown-resource', id: 'res-456' },
        action: { name: 'read' },
        context: {}
      };

      const policy = await (opaService as any).getApplicablePolicy(request);

      expect(policy).toEqual({
        id: 'policy-default',
        name: 'Default Policy',
        version: '1.0.0',
        content: 'package default\ndefault allow = false'
      });
    });

    it('should return null when no applicable policy found', async () => {
      mockPolicyManager.getAllPolicies.mockReturnValue([]);

      const request: AuthorizationRequest = {
        subject: { id: 'user-123', type: 'user' },
        resource: { type: 'document', id: 'doc-456' },
        action: { name: 'read' },
        context: {}
      };

      const policy = await (opaService as any).getApplicablePolicy(request);

      expect(policy).toBeNull();
    });
  });
});