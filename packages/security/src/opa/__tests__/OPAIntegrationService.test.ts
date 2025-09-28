import { OPAIntegrationService, PolicyEvaluationInput } from '../OPAIntegrationService';

// Mock dependencies
jest.mock('../../services/encryption', () => ({
  encryptionService: {
    generateUUID: jest.fn(() => 'test-uuid-123'),
    createHash: jest.fn(() => 'test-hash-456'),
    generateKey: jest.fn(() => Buffer.from('test-key')),
    createHMAC: jest.fn(() => 'test-hmac-789')
  }
}));

jest.mock('../../services/audit-logging', () => ({
  auditLoggingService: {
    logEvent: jest.fn()
  }
}));

jest.mock('@open-policy-agent/opa-wasm', () => ({
  loadPolicy: jest.fn()
}));

jest.mock('node-fetch');

describe('OPAIntegrationService', () => {
  let service: OPAIntegrationService;

  beforeEach(() => {
    service = new OPAIntegrationService({
      timeout: 1000,
      retryAttempts: 1,
      cacheEnabled: true,
      cacheTtl: 300000,
      maxCacheSize: 100,
      enableMetrics: true,
      defaultQuery: 'data.authz.allow',
      policyDirectory: './test-policies',
      validatePolicies: false
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('evaluatePolicy', () => {
    it('should evaluate a policy and return a decision', async () => {
      const input: PolicyEvaluationInput = {
        input: {
          subject: { id: 'user-123', type: 'user' },
          resource: { type: 'document', id: 'doc-456' },
          action: { name: 'read' }
        },
        policy: 'package test\ndefault allow = true',
        context: {
          requestId: 'req-123',
          userId: 'user-123',
          resource: 'document:doc-456',
          action: 'read'
        }
      };

      // Mock WASM policy evaluation
      const mockWasmPolicy = {
        evaluate: jest.fn().mockReturnValue({ result: true })
      };

      jest.spyOn(service as any, 'loadWasmPolicy').mockResolvedValue(mockWasmPolicy);

      const result = await service.evaluatePolicy(input);

      expect(result).toEqual({
        decision: {
          result: true,
          allow: true,
          deny: false
        },
        executionTime: expect.any(Number),
        evaluationId: 'test-uuid-123',
        timestamp: expect.any(Date),
        input,
        cached: false
      });

      expect(mockWasmPolicy.evaluate).toHaveBeenCalledWith(
        input.input,
        'data.authz.allow'
      );
    });

    it('should return cached result when available', async () => {
      const input: PolicyEvaluationInput = {
        input: { test: 'data' },
        policy: 'test policy',
        context: {
          requestId: 'req-123',
          userId: 'user-123',
          resource: 'test',
          action: 'read'
        }
      };

      // First evaluation
      const mockWasmPolicy = {
        evaluate: jest.fn().mockReturnValue({ result: true })
      };
      jest.spyOn(service as any, 'loadWasmPolicy').mockResolvedValue(mockWasmPolicy);

      const firstResult = await service.evaluatePolicy(input);
      expect(firstResult.cached).toBe(false);

      // Second evaluation should be cached
      const secondResult = await service.evaluatePolicy(input);
      expect(secondResult.cached).toBe(true);
      expect(mockWasmPolicy.evaluate).toHaveBeenCalledTimes(1);
    });

    it('should handle evaluation errors gracefully', async () => {
      const input: PolicyEvaluationInput = {
        input: { test: 'data' },
        policy: 'invalid policy',
        context: {
          requestId: 'req-123',
          userId: 'user-123',
          resource: 'test',
          action: 'read'
        }
      };

      jest.spyOn(service as any, 'loadWasmPolicy').mockRejectedValue(new Error('Policy compilation failed'));

      const result = await service.evaluatePolicy(input);

      expect(result.decision.result).toBe(false);
      expect(result.decision.reasons).toContain('Evaluation error: No evaluation method available (WASM failed and no server URL configured)');
    });

    it('should emit events during evaluation', async () => {
      const input: PolicyEvaluationInput = {
        input: { test: 'data' },
        policy: 'test policy',
        context: {
          requestId: 'req-123',
          userId: 'user-123',
          resource: 'test',
          action: 'read'
        }
      };

      const mockWasmPolicy = {
        evaluate: jest.fn().mockReturnValue({ result: true })
      };
      jest.spyOn(service as any, 'loadWasmPolicy').mockResolvedValue(mockWasmPolicy);

      const eventSpy = jest.fn();
      service.on('policyEvaluated', eventSpy);

      await service.evaluatePolicy(input);

      expect(eventSpy).toHaveBeenCalledWith(expect.objectContaining({
        decision: expect.objectContaining({
          result: true,
          allow: true,
          deny: false
        }),
        evaluationId: 'test-uuid-123'
      }));
    });
  });

  describe('batch evaluation', () => {
    it('should evaluate multiple policies in parallel', async () => {
      const inputs: PolicyEvaluationInput[] = [
        {
          input: { user: 'user1' },
          policy: 'policy1',
          context: { requestId: 'req-1', userId: 'user1', resource: 'res1', action: 'read' }
        },
        {
          input: { user: 'user2' },
          policy: 'policy2',
          context: { requestId: 'req-2', userId: 'user2', resource: 'res2', action: 'write' }
        }
      ];

      const mockWasmPolicy = {
        evaluate: jest.fn().mockReturnValue({ result: true })
      };
      jest.spyOn(service as any, 'loadWasmPolicy').mockResolvedValue(mockWasmPolicy);

      const results = await service.evaluatePolicies(inputs);

      expect(results).toHaveLength(2);
      expect(results[0].decision.result).toBe(true);
      expect(results[1].decision.result).toBe(true);
    });

    it('should handle batch evaluation with same policy', async () => {
      const policy = 'package test\ndefault allow = true';
      const inputs = [
        { input: { user: 'user1' }, context: { requestId: 'req-1', userId: 'user1', resource: 'res', action: 'read' } },
        { input: { user: 'user2' }, context: { requestId: 'req-2', userId: 'user2', resource: 'res', action: 'read' } }
      ];

      const mockWasmPolicy = {
        evaluate: jest.fn().mockReturnValue({ result: true })
      };
      jest.spyOn(service as any, 'loadWasmPolicy').mockResolvedValue(mockWasmPolicy);

      const results = await service.batchEvaluate(policy, inputs);

      expect(results).toHaveLength(2);
      expect(mockWasmPolicy.evaluate).toHaveBeenCalledTimes(2);
    });
  });

  describe('caching', () => {
    it('should respect cache TTL', async () => {
      const shortTtlService = new OPAIntegrationService({
        timeout: 1000,
        retryAttempts: 1,
        cacheEnabled: true,
        cacheTtl: 10, // 10ms TTL
        maxCacheSize: 100,
        enableMetrics: true,
        defaultQuery: 'data.authz.allow',
        policyDirectory: './test-policies',
        validatePolicies: false
      });

      const input: PolicyEvaluationInput = {
        input: { test: 'data' },
        policy: 'test policy',
        context: {
          requestId: 'req-123',
          userId: 'user-123',
          resource: 'test',
          action: 'read'
        }
      };

      const mockWasmPolicy = {
        evaluate: jest.fn().mockReturnValue({ result: true })
      };
      jest.spyOn(shortTtlService as any, 'loadWasmPolicy').mockResolvedValue(mockWasmPolicy);

      // First evaluation
      const firstResult = await shortTtlService.evaluatePolicy(input);
      expect(firstResult.cached).toBe(false);

      // Wait for cache to expire
      await new Promise(resolve => setTimeout(resolve, 20));

      // Second evaluation should not be cached
      const secondResult = await shortTtlService.evaluatePolicy(input);
      expect(secondResult.cached).toBe(false);
      expect(mockWasmPolicy.evaluate).toHaveBeenCalledTimes(2);
    });

    it('should respect max cache size', async () => {
      const smallCacheService = new OPAIntegrationService({
        timeout: 1000,
        retryAttempts: 1,
        cacheEnabled: true,
        cacheTtl: 300000,
        maxCacheSize: 2, // Very small cache
        enableMetrics: true,
        defaultQuery: 'data.authz.allow',
        policyDirectory: './test-policies',
        validatePolicies: false
      });

      const mockWasmPolicy = {
        evaluate: jest.fn().mockReturnValue({ result: true })
      };
      jest.spyOn(smallCacheService as any, 'loadWasmPolicy').mockResolvedValue(mockWasmPolicy);

      // Fill cache beyond capacity
      for (let i = 0; i < 5; i++) {
        await smallCacheService.evaluatePolicy({
          input: { test: `data-${i}` },
          policy: `policy-${i}`,
          context: {
            requestId: `req-${i}`,
            userId: `user-${i}`,
            resource: `res-${i}`,
            action: 'read'
          }
        });
      }

      // Cache should have evicted older entries
      const metrics = smallCacheService.getMetrics();
      expect(metrics.totalEvaluations).toBe(5);
    });

    it('should clear cache when requested', async () => {
      const input: PolicyEvaluationInput = {
        input: { test: 'data' },
        policy: 'test policy',
        context: {
          requestId: 'req-123',
          userId: 'user-123',
          resource: 'test',
          action: 'read'
        }
      };

      const mockWasmPolicy = {
        evaluate: jest.fn().mockReturnValue({ result: true })
      };
      jest.spyOn(service as any, 'loadWasmPolicy').mockResolvedValue(mockWasmPolicy);

      // Evaluate to populate cache
      await service.evaluatePolicy(input);

      // Clear cache
      service.clearCache();

      // Next evaluation should not be cached
      const result = await service.evaluatePolicy(input);
      expect(result.cached).toBe(false);
      expect(mockWasmPolicy.evaluate).toHaveBeenCalledTimes(2);
    });
  });

  describe('metrics', () => {
    it('should track evaluation metrics', async () => {
      const input: PolicyEvaluationInput = {
        input: { test: 'data' },
        policy: 'test policy',
        context: {
          requestId: 'req-123',
          userId: 'user-123',
          resource: 'test',
          action: 'read'
        }
      };

      const mockWasmPolicy = {
        evaluate: jest.fn()
          .mockReturnValueOnce({ result: true })
          .mockReturnValueOnce({ result: false });
      };
      jest.spyOn(service as any, 'loadWasmPolicy').mockResolvedValue(mockWasmPolicy);

      // Perform evaluations
      await service.evaluatePolicy(input);
      await service.evaluatePolicy({
        ...input,
        input: { test: 'different-data' }
      });

      const metrics = service.getMetrics();

      expect(metrics.totalEvaluations).toBe(2);
      expect(metrics.decisions.allow).toBe(1);
      expect(metrics.decisions.deny).toBe(1);
      expect(metrics.averageExecutionTime).toBeGreaterThan(0);
    });

    it('should track cache hit rate', async () => {
      const input: PolicyEvaluationInput = {
        input: { test: 'data' },
        policy: 'test policy',
        context: {
          requestId: 'req-123',
          userId: 'user-123',
          resource: 'test',
          action: 'read'
        }
      };

      const mockWasmPolicy = {
        evaluate: jest.fn().mockReturnValue({ result: true })
      };
      jest.spyOn(service as any, 'loadWasmPolicy').mockResolvedValue(mockWasmPolicy);

      // First evaluation (cache miss)
      await service.evaluatePolicy(input);

      // Second evaluation (cache hit)
      await service.evaluatePolicy(input);

      const metrics = service.getMetrics();

      expect(metrics.cacheHits).toBe(1);
      expect(metrics.cacheMisses).toBe(1);
    });
  });

  describe('health check', () => {
    it('should return healthy status when all components work', async () => {
      const mockWasmPolicy = {
        evaluate: jest.fn().mockReturnValue({ result: true })
      };
      jest.spyOn(service as any, 'loadWasmPolicy').mockResolvedValue(mockWasmPolicy);

      const health = await service.healthCheck();

      expect(health.status).toBe('healthy');
      expect(health.details.wasmAvailable).toBe(true);
    });

    it('should return unhealthy when no evaluation methods available', async () => {
      jest.spyOn(service as any, 'loadWasmPolicy').mockRejectedValue(new Error('WASM failed'));

      const health = await service.healthCheck();

      expect(health.status).toBe('unhealthy');
      expect(health.details.wasmAvailable).toBe(false);
      expect(health.details.serverAvailable).toBe(false);
    });

    it('should return degraded when error rate is high', async () => {
      // Simulate high error rate
      const errorService = new OPAIntegrationService({
        timeout: 1000,
        retryAttempts: 1,
        cacheEnabled: false,
        cacheTtl: 300000,
        maxCacheSize: 100,
        enableMetrics: true,
        defaultQuery: 'data.authz.allow',
        policyDirectory: './test-policies',
        validatePolicies: false
      });

      // Set high error count in metrics
      (errorService as any).metrics.errors = 50;
      (errorService as any).metrics.totalEvaluations = 100;

      const mockWasmPolicy = {
        evaluate: jest.fn().mockReturnValue({ result: true })
      };
      jest.spyOn(errorService as any, 'loadWasmPolicy').mockResolvedValue(mockWasmPolicy);

      const health = await errorService.healthCheck();

      expect(health.status).toBe('degraded');
    });
  });

  describe('format decision', () => {
    it('should format boolean result correctly', () => {
      const formatted = (service as any).formatDecision(true);

      expect(formatted).toEqual({
        result: true,
        allow: true,
        deny: false
      });
    });

    it('should format object result correctly', () => {
      const result = {
        result: true,
        reasons: ['User has permission'],
        metadata: { policy: 'test' }
      };

      const formatted = (service as any).formatDecision(result);

      expect(formatted).toEqual({
        result: true,
        allow: true,
        deny: false,
        reasons: ['User has permission'],
        metadata: { policy: 'test' }
      });
    });

    it('should handle allow/deny format', () => {
      const result = {
        allow: true,
        reasons: ['Access granted']
      };

      const formatted = (service as any).formatDecision(result);

      expect(formatted).toEqual({
        result: true,
        allow: true,
        deny: false,
        reasons: ['Access granted'],
        metadata: {}
      });
    });

    it('should default to deny for unexpected formats', () => {
      const formatted = (service as any).formatDecision({ unexpected: 'format' });

      expect(formatted).toEqual({
        result: false,
        allow: false,
        deny: true,
        reasons: ['Unexpected policy result format'],
        metadata: { originalResult: { unexpected: 'format' } }
      });
    });
  });
});