import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { EventEmitter } from 'events';

import { AutomatedRemediationEngine } from '../core/AutomatedRemediationEngine';
import { ResponseActionExecutor } from '../services/ResponseActionExecutor';
import { EscalationManager } from '../services/EscalationManager';
import { RemediationIntegration } from '../core/RemediationIntegration';
import { RemediationAuditTrail } from '../services/RemediationAuditTrail';
import { RemediationCoordinator } from '../services/RemediationCoordinator';
import { GovernanceController, GovernanceResult } from '../core/GovernanceController';
import { AuditLogger } from '../core/AuditLogger';
import type { AgentTask } from '../types/AgentTypes';

/**
 * Comprehensive Test Suite for Automated Remediation System
 *
 * Tests all components of the remediation system including:
 * - Policy violation detection
 * - Automated response actions
 * - Escalation workflows
 * - Audit trail generation
 * - Real-time coordination
 * - Compliance reporting
 */

// Mock implementations
class MockPrismaClient {
  remediationExecution = {
    create: jest.fn(),
    update: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn()
  };

  remediationAction = {
    create: jest.fn(),
    update: jest.fn(),
    findMany: jest.fn()
  };

  remediationAuditEntry = {
    create: jest.fn(),
    createMany: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn()
  };

  notification = {
    create: jest.fn(),
    findMany: jest.fn()
  };

  approvalRequest = {
    create: jest.fn(),
    update: jest.fn(),
    findMany: jest.fn()
  };

  securityEvent = {
    create: jest.fn(),
    findMany: jest.fn()
  };

  auditLog = {
    create: jest.fn(),
    findMany: jest.fn()
  };

  $connect = jest.fn();
  $disconnect = jest.fn();
}

class MockRedis extends EventEmitter {
  private data: Map<string, string> = new Map();

  async ping(): Promise<string> {
    return 'PONG';
  }

  async set(key: string, value: string, ...args: any[]): Promise<string> {
    this.data.set(key, value);
    return 'OK';
  }

  async get(key: string): Promise<string | null> {
    return this.data.get(key) || null;
  }

  async setex(key: string, ttl: number, value: string): Promise<string> {
    this.data.set(key, value);
    return 'OK';
  }

  async del(key: string): Promise<number> {
    return this.data.delete(key) ? 1 : 0;
  }

  async lpush(key: string, value: string): Promise<number> {
    return 1;
  }

  async lrange(key: string, start: number, end: number): Promise<string[]> {
    return [];
  }

  async lrem(key: string, count: number, value: string): Promise<number> {
    return 1;
  }

  async publish(channel: string, message: string): Promise<number> {
    return 1;
  }

  async subscribe(...channels: string[]): Promise<void> {
    return;
  }

  async quit(): Promise<string> {
    return 'OK';
  }

  async keys(pattern: string): Promise<string[]> {
    return Array.from(this.data.keys()).filter(key =>
      pattern === '*' || key.includes(pattern.replace('*', ''))
    );
  }

  async eval(script: string, numKeys: number, ...args: any[]): Promise<any> {
    return 1;
  }

  async pexpire(key: string, ttl: number): Promise<number> {
    return 1;
  }

  async ltrim(key: string, start: number, end: number): Promise<string> {
    return 'OK';
  }
}

describe('Automated Remediation System', () => {
  let mockPrisma: MockPrismaClient;
  let mockRedis: MockRedis;
  let mockRedisSubscriber: MockRedis;
  let remediationEngine: AutomatedRemediationEngine;
  let actionExecutor: ResponseActionExecutor;
  let escalationManager: EscalationManager;
  let auditTrail: RemediationAuditTrail;
  let coordinator: RemediationCoordinator;
  let integration: RemediationIntegration;

  beforeEach(async () => {
    // Setup mocks
    mockPrisma = new MockPrismaClient();
    mockRedis = new MockRedis();
    mockRedisSubscriber = new MockRedis();

    // Initialize components with mocks
    const auditLogger = new AuditLogger();
    const governanceController = new GovernanceController();

    actionExecutor = new ResponseActionExecutor(mockRedis as any, mockPrisma as any);
    escalationManager = new EscalationManager(mockRedis as any, mockPrisma as any);
    auditTrail = new RemediationAuditTrail(mockPrisma as any, mockRedis as any, auditLogger);

    remediationEngine = new AutomatedRemediationEngine(
      governanceController,
      auditLogger,
      actionExecutor,
      escalationManager
    );

    coordinator = new RemediationCoordinator({
      nodeId: 'test-node-1',
      redisUrl: 'redis://localhost:6379'
    });

    integration = new RemediationIntegration(
      governanceController,
      remediationEngine,
      auditLogger
    );

    // Mock component initialization
    jest.spyOn(actionExecutor, 'initialize').mockResolvedValue();
    jest.spyOn(escalationManager, 'initialize').mockResolvedValue();
    jest.spyOn(auditTrail, 'initialize').mockResolvedValue();
    jest.spyOn(remediationEngine, 'initialize').mockResolvedValue();
    jest.spyOn(integration, 'initialize').mockResolvedValue();
  });

  afterEach(async () => {
    jest.clearAllMocks();
  });

  describe('AutomatedRemediationEngine', () => {
    it('should initialize successfully', async () => {
      await expect(remediationEngine.initialize()).resolves.not.toThrow();
      expect(actionExecutor.initialize).toHaveBeenCalled();
      expect(escalationManager.initialize).toHaveBeenCalled();
    });

    it('should process policy violations and execute remediation', async () => {
      const mockViolation: GovernanceResult = {
        approved: false,
        reason: 'Policy violations detected',
        warnings: [],
        requiredApprovals: [],
        policyViolations: [
          {
            policyId: 'security-policy',
            ruleId: 'external-request-check',
            severity: 'critical',
            message: 'External URL detected in task payload'
          }
        ]
      };

      const mockTask: AgentTask = {
        id: 'test-task-1',
        type: 'data_analysis',
        priority: 'high',
        payload: {
          url: 'https://external-api.com/data'
        },
        status: 'pending',
        createdAt: new Date(),
        agentId: 'test-agent-1'
      };

      // Mock successful action execution
      jest.spyOn(actionExecutor, 'executeAction').mockResolvedValue({
        success: true,
        actionId: 'block-task-immediate',
        executionId: 'exec-123',
        result: { action: 'task_blocked', reason: 'Critical security violation' },
        executionTimeMs: 150
      });

      const result = await remediationEngine.processViolation(
        'violation-123',
        mockViolation,
        mockTask
      );

      expect(result.success).toBe(true);
      expect(result.actionsExecuted).toBeGreaterThan(0);
      expect(result.escalated).toBe(false);
      expect(actionExecutor.executeAction).toHaveBeenCalled();
    });

    it('should trigger escalation for failed remediation actions', async () => {
      const mockViolation: GovernanceResult = {
        approved: false,
        reason: 'Critical policy violations',
        warnings: [],
        requiredApprovals: [],
        policyViolations: [
          {
            policyId: 'security-policy',
            ruleId: 'critical-violation',
            severity: 'critical',
            message: 'Critical security breach detected'
          }
        ]
      };

      // Mock failed action execution
      jest.spyOn(actionExecutor, 'executeAction').mockResolvedValue({
        success: false,
        actionId: 'block-task-immediate',
        executionId: 'exec-456',
        error: 'Action execution failed',
        executionTimeMs: 200
      });

      // Mock escalation trigger
      jest.spyOn(escalationManager, 'triggerEscalation').mockResolvedValue('escalation-123');

      const result = await remediationEngine.processViolation(
        'violation-456',
        mockViolation
      );

      expect(result.success).toBe(false);
      expect(result.escalated).toBe(true);
      expect(escalationManager.triggerEscalation).toHaveBeenCalled();
    });

    it('should add and remove custom remediation policies', async () => {
      const customPolicy = {
        id: 'custom-policy-1',
        name: 'Custom Data Policy',
        description: 'Custom policy for data handling violations',
        enabled: true,
        priority: 75,
        policyViolationTypes: ['data-protection-policy'],
        severityThresholds: ['high', 'critical'] as ('low' | 'medium' | 'high' | 'critical')[],
        immediateActions: [
          {
            id: 'quarantine-data',
            type: 'quarantine_data' as const,
            severity: 'high' as const,
            description: 'Quarantine sensitive data',
            config: { quarantineLocation: 'secure-vault' }
          }
        ],
        escalationActions: [],
        escalationDelayMs: 600000,
        maxEscalationLevel: 1,
        complianceFrameworks: ['GDPR'],
        auditRequired: true,
        retentionPeriodDays: 90
      };

      await remediationEngine.addRemediationPolicy(customPolicy);

      const policies = remediationEngine.listRemediationPolicies();
      expect(policies).toContainEqual(expect.objectContaining({
        id: 'custom-policy-1',
        name: 'Custom Data Policy'
      }));

      await remediationEngine.removeRemediationPolicy('custom-policy-1');

      const updatedPolicies = remediationEngine.listRemediationPolicies();
      expect(updatedPolicies).not.toContainEqual(expect.objectContaining({
        id: 'custom-policy-1'
      }));
    });
  });

  describe('ResponseActionExecutor', () => {
    it('should execute block_task action successfully', async () => {
      const mockAction = {
        id: 'block-task-1',
        type: 'block_task',
        severity: 'critical',
        description: 'Block malicious task',
        config: {
          immediate: true,
          reason: 'Malicious payload detected'
        }
      };

      const mockContext = {
        id: 'context-1',
        violationId: 'violation-1',
        remediationPolicyId: 'policy-1',
        taskContext: { id: 'task-1' },
        violationContext: {},
        initiatedBy: 'system',
        initiatedAt: new Date()
      };

      const result = await actionExecutor.executeAction(mockAction, mockContext);

      expect(result.success).toBe(true);
      expect(result.actionId).toBe('block-task-1');
      expect(result.result).toEqual(expect.objectContaining({
        action: 'task_blocked',
        reason: 'Malicious payload detected'
      }));
    });

    it('should execute notify_admin action successfully', async () => {
      const mockAction = {
        id: 'notify-admin-1',
        type: 'notify_admin',
        severity: 'high',
        description: 'Notify security team',
        config: {
          recipients: ['security@urnlabs.ai'],
          urgency: 'critical',
          template: 'critical_security'
        }
      };

      const mockContext = {
        id: 'context-2',
        violationId: 'violation-2',
        remediationPolicyId: 'policy-1',
        taskContext: { id: 'task-2' },
        violationContext: {},
        initiatedBy: 'system',
        initiatedAt: new Date()
      };

      // Mock successful notification creation
      mockPrisma.notification.create.mockResolvedValue({
        id: 'notification-1',
        type: 'policy_violation',
        recipientEmail: 'security@urnlabs.ai',
        status: 'pending'
      });

      const result = await actionExecutor.executeAction(mockAction, mockContext);

      expect(result.success).toBe(true);
      expect(result.result).toEqual(expect.objectContaining({
        action: 'notifications_sent',
        recipients: ['security@urnlabs.ai']
      }));
      expect(mockPrisma.notification.create).toHaveBeenCalled();
    });

    it('should handle action execution failures with retry logic', async () => {
      const mockAction = {
        id: 'failing-action',
        type: 'custom',
        severity: 'medium',
        description: 'Action that will fail',
        config: {
          action: 'unknown_action'
        },
        retryAttempts: 2
      };

      const mockContext = {
        id: 'context-3',
        violationId: 'violation-3',
        remediationPolicyId: 'policy-1',
        taskContext: { id: 'task-3' },
        violationContext: {},
        initiatedBy: 'system',
        initiatedAt: new Date()
      };

      const result = await actionExecutor.executeAction(mockAction, mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Unknown custom action');
    });
  });

  describe('EscalationManager', () => {
    it('should schedule and trigger escalation', async () => {
      const escalationRequest = {
        executionId: 'exec-1',
        violationId: 'violation-1',
        escalationLevel: 1,
        escalationActions: [
          {
            id: 'notify-security-team',
            type: 'notify_admin',
            config: {
              recipients: ['security-team@urnlabs.ai'],
              urgency: 'high'
            }
          }
        ],
        delayMs: 1000, // 1 second for testing
        maxLevel: 2
      };

      const escalationId = await escalationManager.triggerEscalation(escalationRequest);

      expect(escalationId).toBeDefined();
      expect(typeof escalationId).toBe('string');

      // Check that escalation was stored
      const escalation = escalationManager.getEscalation(escalationId);
      expect(escalation).toBeDefined();
      expect(escalation?.status).toBe('scheduled');
    });

    it('should cancel active escalation', async () => {
      const escalationRequest = {
        executionId: 'exec-2',
        violationId: 'violation-2',
        escalationLevel: 1,
        escalationActions: [],
        delayMs: 60000, // 1 minute
        maxLevel: 2
      };

      const escalationId = await escalationManager.triggerEscalation(escalationRequest);

      await escalationManager.cancelEscalation(escalationId, 'Test cancellation');

      const escalation = escalationManager.getEscalation(escalationId);
      expect(escalation).toBeUndefined(); // Should be removed after cancellation
    });

    it('should execute escalation actions when triggered', async () => {
      // Mock notification creation for escalation
      mockPrisma.notification.create.mockResolvedValue({
        id: 'escalation-notification-1',
        type: 'escalation_notification',
        status: 'pending'
      });

      const escalationRequest = {
        executionId: 'exec-3',
        violationId: 'violation-3',
        escalationLevel: 1,
        escalationActions: [
          {
            id: 'notify-executives',
            type: 'notify_admin',
            config: {
              recipients: ['cto@urnlabs.ai'],
              urgency: 'critical'
            }
          }
        ],
        delayMs: 100, // Very short delay for testing
        maxLevel: 2
      };

      const escalationId = await escalationManager.triggerEscalation(escalationRequest);

      // Wait for escalation to trigger
      await new Promise(resolve => setTimeout(resolve, 200));

      expect(mockPrisma.notification.create).toHaveBeenCalled();
    });
  });

  describe('RemediationAuditTrail', () => {
    it('should log remediation audit entries', async () => {
      const auditEntry = {
        remediationExecutionId: 'exec-1',
        violationId: 'violation-1',
        policyId: 'security-policy',
        remediationPolicyId: 'remediation-policy-1',
        actionType: 'block_task',
        actionId: 'block-task-1',
        actionStatus: 'completed' as const,
        actor: 'remediation_engine',
        actorType: 'system' as const,
        resourceType: 'agent_task',
        resourceId: 'task-1',
        approvalRequired: false,
        complianceFrameworks: ['SOX', 'GDPR'],
        riskLevel: 'high' as const,
        dataClassification: 'confidential' as const,
        retentionPeriodDays: 2555,
        metadata: {
          action: 'task_blocked',
          reason: 'Security violation'
        }
      };

      const entryId = await auditTrail.logEntry(auditEntry);

      expect(entryId).toBeDefined();
      expect(typeof entryId).toBe('string');
    });

    it('should generate compliance reports', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-12-31');

      // Mock audit entries
      mockPrisma.remediationAuditEntry.findMany.mockResolvedValue([
        {
          id: 'entry-1',
          timestamp: new Date(),
          remediationExecutionId: 'exec-1',
          violationId: 'violation-1',
          actionType: 'block_task',
          actionStatus: 'completed',
          complianceFrameworks: ['SOX'],
          riskLevel: 'high'
        }
      ]);

      const report = await auditTrail.generateComplianceReport(
        startDate,
        endDate,
        'SOX',
        'compliance'
      );

      expect(report).toBeDefined();
      expect(report.reportType).toBe('compliance');
      expect(report.timeRange.startDate).toEqual(startDate);
      expect(report.timeRange.endDate).toEqual(endDate);
      expect(report.summary.totalRemediations).toBeGreaterThanOrEqual(0);
      expect(report.complianceMetrics).toBeDefined();
    });

    it('should verify audit trail integrity', async () => {
      // Mock audit entries with valid hash chain
      mockPrisma.remediationAuditEntry.findMany.mockResolvedValue([
        {
          id: 'entry-1',
          timestamp: new Date('2024-01-01T10:00:00Z'),
          entryHash: 'hash1',
          previousEntryHash: null
        },
        {
          id: 'entry-2',
          timestamp: new Date('2024-01-01T10:01:00Z'),
          entryHash: 'hash2',
          previousEntryHash: 'hash1'
        }
      ]);

      const integrity = await auditTrail.verifyIntegrity();

      expect(integrity.valid).toBeDefined();
      expect(integrity.totalEntries).toBeGreaterThanOrEqual(0);
      expect(integrity.issues).toBeDefined();
    });
  });

  describe('RemediationCoordinator', () => {
    it('should register and track workflow states', async () => {
      const workflowId = await coordinator.registerWorkflow(
        'violation-1',
        3,
        { priority: 'high' }
      );

      expect(workflowId).toBeDefined();
      expect(typeof workflowId).toBe('string');

      const workflow = await coordinator.getWorkflowStatus(workflowId);
      expect(workflow).toBeDefined();
      expect(workflow?.violationId).toBe('violation-1');
      expect(workflow?.totalSteps).toBe(3);
    });

    it('should update workflow status and handle completion', async () => {
      const workflowId = await coordinator.registerWorkflow(
        'violation-2',
        2,
        { priority: 'medium' }
      );

      await coordinator.updateWorkflowStatus(workflowId, 'in_progress', 1);

      let workflow = await coordinator.getWorkflowStatus(workflowId);
      expect(workflow?.status).toBe('in_progress');
      expect(workflow?.currentStep).toBe(1);

      await coordinator.updateWorkflowStatus(workflowId, 'completed', 2);

      workflow = await coordinator.getWorkflowStatus(workflowId);
      expect(workflow?.status).toBe('completed');
    });

    it('should acquire and release workflow locks', async () => {
      const workflowId = 'workflow-lock-test';

      const acquired = await coordinator.acquireLock(workflowId, 5000);
      expect(acquired).toBe(true);

      // Try to acquire same lock again (should fail)
      const secondAttempt = await coordinator.acquireLock(workflowId, 1000);
      expect(secondAttempt).toBe(false);

      await coordinator.releaseLock(workflowId);

      // Should be able to acquire again after release
      const thirdAttempt = await coordinator.acquireLock(workflowId, 1000);
      expect(thirdAttempt).toBe(true);

      await coordinator.releaseLock(workflowId);
    });

    it('should handle emergency stop scenarios', async () => {
      const workflowId1 = await coordinator.registerWorkflow('violation-3', 2);
      const workflowId2 = await coordinator.registerWorkflow('violation-4', 3);

      expect(coordinator.getActiveWorkflows()).toHaveLength(2);

      await coordinator.emergencyStop('System maintenance required');

      // All workflows should be cleared
      expect(coordinator.getActiveWorkflows()).toHaveLength(0);
    });
  });

  describe('RemediationIntegration', () => {
    it('should integrate governance validation with automatic remediation', async () => {
      const mockTask: AgentTask = {
        id: 'integration-task-1',
        type: 'data_processing',
        priority: 'high',
        payload: {
          sensitiveData: 'credit-card-number: 4111-1111-1111-1111'
        },
        status: 'pending',
        createdAt: new Date(),
        agentId: 'test-agent-1'
      };

      // Mock governance result with violations
      const mockGovernanceResult: GovernanceResult = {
        approved: false,
        reason: 'Sensitive data detected',
        warnings: [],
        requiredApprovals: [],
        policyViolations: [
          {
            policyId: 'data-protection-policy',
            ruleId: 'pii-protection',
            severity: 'high',
            message: 'Credit card data detected in payload'
          }
        ]
      };

      // Mock governance controller validation
      jest.spyOn(integration['governanceController'], 'validateTask')
        .mockResolvedValue(mockGovernanceResult);

      // Mock successful remediation
      jest.spyOn(integration['remediationEngine'], 'processViolation')
        .mockResolvedValue({
          success: true,
          executionId: 'exec-integration-1',
          actionsExecuted: 2,
          actionsSucceeded: 2,
          actionsFailed: 0,
          escalated: false,
          errors: [],
          warnings: []
        });

      const result = await integration.validateTaskWithRemediation(mockTask);

      expect(result.governanceResult).toEqual(mockGovernanceResult);
      expect(result.violationProcessingResult).toBeDefined();
      expect(result.violationProcessingResult?.processed).toBe(true);
      expect(result.violationProcessingResult?.remediationTriggered).toBe(true);
    });

    it('should handle multiple concurrent violation processing', async () => {
      const tasks = Array.from({ length: 5 }, (_, i) => ({
        id: `concurrent-task-${i}`,
        type: 'data_analysis',
        priority: 'medium',
        payload: { data: `sensitive-data-${i}` },
        status: 'pending' as const,
        createdAt: new Date(),
        agentId: `agent-${i}`
      }));

      const mockViolation: GovernanceResult = {
        approved: false,
        reason: 'Policy violations',
        warnings: [],
        requiredApprovals: [],
        policyViolations: [
          {
            policyId: 'data-policy',
            ruleId: 'sensitive-data',
            severity: 'medium',
            message: 'Sensitive data detected'
          }
        ]
      };

      // Process all tasks concurrently
      const promises = tasks.map(async (task, index) => {
        return integration.processViolation(
          `violation-concurrent-${index}`,
          mockViolation,
          task
        );
      });

      const results = await Promise.allSettled(promises);

      // All should complete successfully
      results.forEach((result, index) => {
        expect(result.status).toBe('fulfilled');
        if (result.status === 'fulfilled') {
          expect(result.value.processed).toBe(true);
        }
      });
    });

    it('should provide accurate processing statistics', async () => {
      const initialStats = integration.getProcessingStats();
      expect(initialStats.totalViolations).toBe(0);
      expect(initialStats.processedViolations).toBe(0);

      // Process some violations
      const mockViolation: GovernanceResult = {
        approved: false,
        reason: 'Test violation',
        warnings: [],
        requiredApprovals: [],
        policyViolations: [
          {
            policyId: 'test-policy',
            ruleId: 'test-rule',
            severity: 'low',
            message: 'Test violation for stats'
          }
        ]
      };

      await integration.processViolation('stats-violation-1', mockViolation);
      await integration.processViolation('stats-violation-2', mockViolation);

      const updatedStats = integration.getProcessingStats();
      expect(updatedStats.totalViolations).toBeGreaterThan(initialStats.totalViolations);
      expect(updatedStats.processedViolations).toBeGreaterThan(initialStats.processedViolations);
    });
  });

  describe('End-to-End Remediation Workflow', () => {
    it('should complete full remediation workflow from violation to resolution', async () => {
      // Setup: Create a task with policy violations
      const maliciousTask: AgentTask = {
        id: 'e2e-task-1',
        type: 'code_execution',
        priority: 'critical',
        payload: {
          code: 'import os; os.system("rm -rf /")',
          url: 'https://malicious-site.com/exploit'
        },
        status: 'pending',
        createdAt: new Date(),
        agentId: 'e2e-agent-1'
      };

      // Step 1: Governance validation detects violations
      const violationResult: GovernanceResult = {
        approved: false,
        reason: 'Multiple critical violations detected',
        warnings: ['Suspicious code patterns'],
        requiredApprovals: [],
        policyViolations: [
          {
            policyId: 'security-policy',
            ruleId: 'code-execution-check',
            severity: 'critical',
            message: 'Direct code execution tasks are not permitted'
          },
          {
            policyId: 'security-policy',
            ruleId: 'external-request-check',
            severity: 'critical',
            message: 'External URLs require security approval'
          }
        ]
      };

      // Step 2: Process through remediation system
      const violationId = 'e2e-violation-1';

      // Mock successful remediation actions
      jest.spyOn(actionExecutor, 'executeAction')
        .mockResolvedValueOnce({
          success: true,
          actionId: 'block-task-immediate',
          executionId: 'e2e-exec-1',
          result: { action: 'task_blocked', taskId: maliciousTask.id },
          executionTimeMs: 100
        })
        .mockResolvedValueOnce({
          success: true,
          actionId: 'notify-security-team',
          executionId: 'e2e-exec-1',
          result: {
            action: 'notifications_sent',
            recipients: ['security-team@urnlabs.ai'],
            notificationIds: ['notif-1']
          },
          executionTimeMs: 200
        })
        .mockResolvedValueOnce({
          success: true,
          actionId: 'create-security-incident',
          executionId: 'e2e-exec-1',
          result: {
            action: 'incident_created',
            incidentId: 'incident-1',
            severity: 'critical'
          },
          executionTimeMs: 150
        });

      // Step 3: Execute remediation
      const remediationResult = await remediationEngine.processViolation(
        violationId,
        violationResult,
        maliciousTask
      );

      // Step 4: Verify results
      expect(remediationResult.success).toBe(true);
      expect(remediationResult.actionsExecuted).toBe(3);
      expect(remediationResult.actionsSucceeded).toBe(3);
      expect(remediationResult.actionsFailed).toBe(0);
      expect(remediationResult.escalated).toBe(false);

      // Step 5: Verify audit trail was created
      expect(remediationResult.auditTrailId).toBeDefined();

      // Step 6: Verify all action types were executed
      expect(actionExecutor.executeAction).toHaveBeenCalledTimes(3);
    });

    it('should handle escalation workflow for failed remediation', async () => {
      const criticalTask: AgentTask = {
        id: 'e2e-escalation-task',
        type: 'system_access',
        priority: 'critical',
        payload: {
          adminAccess: true,
          systemCommands: ['shutdown', 'delete']
        },
        status: 'pending',
        createdAt: new Date(),
        agentId: 'e2e-escalation-agent'
      };

      const criticalViolation: GovernanceResult = {
        approved: false,
        reason: 'Critical system access violation',
        warnings: [],
        requiredApprovals: [],
        policyViolations: [
          {
            policyId: 'security-policy',
            ruleId: 'system-access-denied',
            severity: 'critical',
            message: 'Unauthorized system access attempt'
          }
        ]
      };

      // Mock failed initial actions
      jest.spyOn(actionExecutor, 'executeAction')
        .mockResolvedValueOnce({
          success: false,
          actionId: 'block-task-immediate',
          executionId: 'e2e-escalation-exec',
          error: 'Failed to block task - system override detected',
          executionTimeMs: 300
        })
        .mockResolvedValueOnce({
          success: false,
          actionId: 'revoke-access',
          executionId: 'e2e-escalation-exec',
          error: 'Access revocation failed - elevated privileges',
          executionTimeMs: 250
        });

      // Mock escalation trigger
      jest.spyOn(escalationManager, 'triggerEscalation')
        .mockResolvedValue('escalation-e2e-1');

      // Execute remediation (should escalate due to failures)
      const result = await remediationEngine.processViolation(
        'e2e-escalation-violation',
        criticalViolation,
        criticalTask
      );

      // Verify escalation was triggered
      expect(result.success).toBe(false);
      expect(result.escalated).toBe(true);
      expect(result.actionsFailed).toBe(2);
      expect(escalationManager.triggerEscalation).toHaveBeenCalled();

      // Verify escalation request details
      const escalationCall = (escalationManager.triggerEscalation as jest.Mock).mock.calls[0][0];
      expect(escalationCall.violationId).toBe('e2e-escalation-violation');
      expect(escalationCall.escalationLevel).toBe(1);
    });

    it('should maintain audit trail integrity across complete workflow', async () => {
      const workflowTask: AgentTask = {
        id: 'audit-integrity-task',
        type: 'data_export',
        priority: 'high',
        payload: {
          exportType: 'customer_data',
          destination: 'external_system'
        },
        status: 'pending',
        createdAt: new Date(),
        agentId: 'audit-agent'
      };

      const auditViolation: GovernanceResult = {
        approved: false,
        reason: 'Data export requires approval',
        warnings: [],
        requiredApprovals: ['data-controller'],
        policyViolations: [
          {
            policyId: 'data-protection-policy',
            ruleId: 'customer-data-export',
            severity: 'high',
            message: 'Customer data export requires explicit approval'
          }
        ]
      };

      // Track audit entries
      const auditEntries: any[] = [];
      jest.spyOn(auditTrail, 'logEntry').mockImplementation(async (entry) => {
        const entryId = `audit-${auditEntries.length + 1}`;
        auditEntries.push({ id: entryId, ...entry });
        return entryId;
      });

      // Execute complete workflow
      await integration.validateTaskWithRemediation(workflowTask);

      // Verify audit trail was maintained
      expect(auditTrail.logEntry).toHaveBeenCalled();
      expect(auditEntries.length).toBeGreaterThan(0);

      // Verify audit entries contain required information
      auditEntries.forEach(entry => {
        expect(entry.violationId).toBeDefined();
        expect(entry.actionType).toBeDefined();
        expect(entry.actor).toBeDefined();
        expect(entry.timestamp).toBeDefined();
        expect(entry.complianceFrameworks).toBeDefined();
      });
    });
  });
});

// Performance and Load Testing
describe('Remediation System Performance', () => {
  let performanceEngine: AutomatedRemediationEngine;
  let performanceIntegration: RemediationIntegration;

  beforeEach(async () => {
    const mockPrisma = new MockPrismaClient();
    const mockRedis = new MockRedis();

    const auditLogger = new AuditLogger();
    const governanceController = new GovernanceController();
    const actionExecutor = new ResponseActionExecutor(mockRedis as any, mockPrisma as any);
    const escalationManager = new EscalationManager(mockRedis as any, mockPrisma as any);

    performanceEngine = new AutomatedRemediationEngine(
      governanceController,
      auditLogger,
      actionExecutor,
      escalationManager
    );

    performanceIntegration = new RemediationIntegration(
      governanceController,
      performanceEngine,
      auditLogger,
      {
        enableAutomaticRemediation: true,
        enableRealTimeProcessing: true,
        maxConcurrentRemediations: 50
      }
    );

    // Mock initialization
    jest.spyOn(performanceEngine, 'initialize').mockResolvedValue();
    jest.spyOn(performanceIntegration, 'initialize').mockResolvedValue();

    await performanceEngine.initialize();
    await performanceIntegration.initialize();
  });

  it('should handle high-volume concurrent violations efficiently', async () => {
    const violationCount = 100;
    const startTime = Date.now();

    const mockViolation: GovernanceResult = {
      approved: false,
      reason: 'Load test violation',
      warnings: [],
      requiredApprovals: [],
      policyViolations: [
        {
          policyId: 'load-test-policy',
          ruleId: 'load-test-rule',
          severity: 'medium',
          message: 'Load test violation'
        }
      ]
    };

    // Mock fast action execution
    jest.spyOn(performanceEngine['actionExecutor'], 'executeAction')
      .mockResolvedValue({
        success: true,
        actionId: 'fast-action',
        executionId: 'load-test-exec',
        result: { action: 'completed' },
        executionTimeMs: 10
      });

    // Process violations concurrently
    const promises = Array.from({ length: violationCount }, (_, i) =>
      performanceIntegration.processViolation(
        `load-violation-${i}`,
        mockViolation
      )
    );

    const results = await Promise.allSettled(promises);
    const endTime = Date.now();
    const totalTime = endTime - startTime;

    // Performance assertions
    expect(totalTime).toBeLessThan(5000); // Should complete within 5 seconds

    const successfulResults = results.filter(r =>
      r.status === 'fulfilled' && r.value.processed
    );

    expect(successfulResults.length).toBe(violationCount);

    // Average processing time should be reasonable
    const avgProcessingTime = totalTime / violationCount;
    expect(avgProcessingTime).toBeLessThan(100); // Less than 100ms per violation on average
  });

  it('should maintain consistent performance under sustained load', async () => {
    const batchSize = 20;
    const batchCount = 5;
    const processingTimes: number[] = [];

    for (let batch = 0; batch < batchCount; batch++) {
      const batchStartTime = Date.now();

      const promises = Array.from({ length: batchSize }, (_, i) =>
        performanceIntegration.processViolation(
          `sustained-violation-${batch}-${i}`,
          {
            approved: false,
            reason: 'Sustained load test',
            warnings: [],
            requiredApprovals: [],
            policyViolations: [
              {
                policyId: 'sustained-policy',
                ruleId: 'sustained-rule',
                severity: 'low',
                message: 'Sustained load violation'
              }
            ]
          }
        )
      );

      await Promise.allSettled(promises);

      const batchTime = Date.now() - batchStartTime;
      processingTimes.push(batchTime);

      // Brief pause between batches
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Performance should remain consistent across batches
    const avgTime = processingTimes.reduce((a, b) => a + b, 0) / processingTimes.length;
    const maxDeviation = Math.max(...processingTimes.map(time => Math.abs(time - avgTime)));

    // Maximum deviation should be within 50% of average time
    expect(maxDeviation).toBeLessThan(avgTime * 0.5);
  });
});

export { };