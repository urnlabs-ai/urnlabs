import { describe, expect, test, beforeAll, afterAll, beforeEach } from 'vitest';
import { AgentManager } from '../../core/AgentManager';
import { WorkflowEngine } from '../../core/WorkflowEngine';
import { AuditLogger } from '../../core/AuditLogger';
import { CodeReviewAgent } from '../../agents/CodeReviewAgent';
import { Agent, AgentTask, AgentTaskPriority, AgentCapability } from '../../types/AgentTypes';
import { WorkflowDefinition, WorkflowStepType } from '../../types/WorkflowTypes';

describe('System Integration Tests', () => {
  let agentManager: AgentManager;
  let workflowEngine: WorkflowEngine;
  let auditLogger: AuditLogger;
  let codeReviewAgent: CodeReviewAgent;

  beforeAll(async () => {
    auditLogger = new AuditLogger();
    agentManager = new AgentManager(auditLogger);
    workflowEngine = new WorkflowEngine(auditLogger);
    codeReviewAgent = new CodeReviewAgent();
  });

  afterAll(() => {
    agentManager.cleanup();
  });

  beforeEach(() => {
    // Reset agents before each test
    agentManager = new AgentManager(auditLogger);
  });

  describe('Complete Code Review Workflow', () => {
    test('should execute end-to-end code review workflow', async () => {
      // Register the code review agent
      await agentManager.registerAgent(codeReviewAgent);

      // Create a comprehensive code review workflow
      const codeReviewWorkflow: WorkflowDefinition = {
        id: 'complete-code-review',
        name: 'Complete Code Review Workflow',
        version: '1.0.0',
        description: 'Full code review process with multiple analysis steps',
        steps: [
          {
            id: 'syntax-check',
            name: 'Syntax and Structure Check',
            type: WorkflowStepType.AGENT_TASK,
            agentType: 'code-review',
            config: { 
              timeout: 30000,
              analysisType: 'syntax'
            },
            dependencies: []
          },
          {
            id: 'security-analysis',
            name: 'Security Vulnerability Analysis',
            type: WorkflowStepType.AGENT_TASK,
            agentType: 'code-review',
            config: { 
              timeout: 45000,
              analysisType: 'security'
            },
            dependencies: ['syntax-check']
          },
          {
            id: 'performance-analysis',
            name: 'Performance Analysis',
            type: WorkflowStepType.AGENT_TASK,
            agentType: 'code-review',
            config: { 
              timeout: 30000,
              analysisType: 'performance'
            },
            dependencies: ['syntax-check']
          },
          {
            id: 'quality-metrics',
            name: 'Code Quality Metrics',
            type: WorkflowStepType.AGENT_TASK,
            agentType: 'code-review',
            config: { 
              timeout: 25000,
              analysisType: 'quality'
            },
            dependencies: ['security-analysis', 'performance-analysis']
          },
          {
            id: 'generate-report',
            name: 'Generate Final Report',
            type: WorkflowStepType.AGENT_TASK,
            agentType: 'code-review',
            config: { 
              timeout: 15000,
              analysisType: 'report'
            },
            dependencies: ['quality-metrics']
          }
        ],
        governanceLevel: 'strict',
        createdAt: new Date(),
        createdBy: 'integration-test'
      };

      // Register the workflow
      const workflowRegistered = workflowEngine.registerWorkflow(codeReviewWorkflow);
      expect(workflowRegistered).toBe(true);

      // Execute the workflow with test code
      const testCode = `
        function calculateTotal(items) {
          let total = 0;
          for (let i = 0; i < items.length; i++) {
            total += items[i].price * items[i].quantity;
          }
          return total;
        }

        function processOrder(order) {
          if (!order || !order.items) {
            throw new Error("Invalid order");
          }
          
          const total = calculateTotal(order.items);
          const tax = total * 0.08;
          const finalAmount = total + tax;
          
          return {
            subtotal: total,
            tax: tax,
            total: finalAmount
          };
        }
      `;

      const workflowData = {
        code: testCode,
        repository: 'test-integration-repo',
        branch: 'feature/integration-test',
        author: 'integration-tester',
        pullRequestId: 'PR-123'
      };

      // Execute the workflow
      const execution = await workflowEngine.executeWorkflow(
        'complete-code-review',
        workflowData,
        'integration-test-user'
      );

      expect(execution).toBeDefined();
      expect(execution.workflowId).toBe('complete-code-review');
      expect(execution.status).toBe('running');
      expect(execution.steps).toHaveLength(5);

      // Wait for workflow execution to complete
      let attempts = 0;
      let finalStatus = null;
      
      while (attempts < 30 && (!finalStatus || finalStatus.status === 'running')) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        finalStatus = workflowEngine.getExecutionStatus(execution.id);
        attempts++;
      }

      expect(finalStatus).toBeDefined();
      expect(finalStatus?.status).toBe('completed');
      expect(finalStatus?.completedSteps).toBe(5);
    });

    test('should handle workflow failure gracefully', async () => {
      // Register agent
      await agentManager.registerAgent(codeReviewAgent);

      // Create workflow with invalid code that should fail
      const failingWorkflow: WorkflowDefinition = {
        id: 'failing-code-review',
        name: 'Failing Code Review',
        version: '1.0.0',
        description: 'Code review that should fail',
        steps: [
          {
            id: 'invalid-analysis',
            name: 'Invalid Code Analysis',
            type: WorkflowStepType.AGENT_TASK,
            agentType: 'code-review',
            config: { 
              timeout: 5000,
              analysisType: 'invalid'
            },
            dependencies: []
          }
        ],
        governanceLevel: 'standard',
        createdAt: new Date(),
        createdBy: 'integration-test'
      };

      workflowEngine.registerWorkflow(failingWorkflow);

      // Execute with malformed code
      const malformedCode = `
        function broken syntax {
          console.log("This is not valid JavaScript"
          return undefined behavior
        }
      `;

      const execution = await workflowEngine.executeWorkflow(
        'failing-code-review',
        { code: malformedCode },
        'test-user'
      );

      // Wait for failure
      let attempts = 0;
      let finalStatus = null;
      
      while (attempts < 10 && (!finalStatus || finalStatus.status === 'running')) {
        await new Promise(resolve => setTimeout(resolve, 500));
        finalStatus = workflowEngine.getExecutionStatus(execution.id);
        attempts++;
      }

      expect(finalStatus?.status).toBe('failed');
      expect(finalStatus?.error).toBeDefined();
    });
  });

  describe('Multi-Agent Coordination', () => {
    test('should coordinate multiple agents for complex tasks', async () => {
      // Create multiple specialized agents
      const syntaxAgent: Agent = {
        id: 'syntax-specialist',
        name: 'Syntax Specialist',
        role: 'code-analysis',
        capabilities: [AgentCapability.CODE_ANALYSIS],
        governanceLevel: 'standard',
        status: 'idle',
        lastActivity: new Date(),
        processTask: async (task: AgentTask) => ({
          success: true,
          data: {
            syntaxValid: true,
            issues: [],
            suggestions: ['Use const instead of let where possible']
          },
          metadata: { processingTime: 200, agentSpecialty: 'syntax' }
        })
      };

      const securityAgent: Agent = {
        id: 'security-specialist',
        name: 'Security Specialist',
        role: 'security-analysis',
        capabilities: [AgentCapability.SECURITY_ANALYSIS],
        governanceLevel: 'strict',
        status: 'idle',
        lastActivity: new Date(),
        processTask: async (task: AgentTask) => ({
          success: true,
          data: {
            vulnerabilities: [],
            securityScore: 95,
            recommendations: ['Consider input validation']
          },
          metadata: { processingTime: 350, agentSpecialty: 'security' }
        })
      };

      const performanceAgent: Agent = {
        id: 'performance-specialist',
        name: 'Performance Specialist',
        role: 'performance-analysis',
        capabilities: [AgentCapability.PERFORMANCE_ANALYSIS],
        governanceLevel: 'standard',
        status: 'idle',
        lastActivity: new Date(),
        processTask: async (task: AgentTask) => ({
          success: true,
          data: {
            performanceScore: 88,
            bottlenecks: [],
            optimizations: ['Consider array methods over for loops']
          },
          metadata: { processingTime: 300, agentSpecialty: 'performance' }
        })
      };

      // Register all agents
      await agentManager.registerAgent(syntaxAgent);
      await agentManager.registerAgent(securityAgent);
      await agentManager.registerAgent(performanceAgent);

      // Create tasks for each agent
      const syntaxTask: AgentTask = {
        id: 'syntax-task-1',
        type: 'code-analysis',
        priority: AgentTaskPriority.HIGH,
        data: { 
          code: 'function test() { return "syntax check"; }',
          focus: 'syntax'
        },
        requiredCapabilities: [AgentCapability.CODE_ANALYSIS],
        createdAt: new Date(),
        status: 'pending'
      };

      const securityTask: AgentTask = {
        id: 'security-task-1',
        type: 'security-analysis',
        priority: AgentTaskPriority.HIGH,
        data: { 
          code: 'function test() { return "security check"; }',
          focus: 'security'
        },
        requiredCapabilities: [AgentCapability.SECURITY_ANALYSIS],
        createdAt: new Date(),
        status: 'pending'
      };

      const performanceTask: AgentTask = {
        id: 'performance-task-1',
        type: 'performance-analysis',
        priority: AgentTaskPriority.MEDIUM,
        data: { 
          code: 'function test() { return "performance check"; }',
          focus: 'performance'
        },
        requiredCapabilities: [AgentCapability.PERFORMANCE_ANALYSIS],
        createdAt: new Date(),
        status: 'pending'
      };

      // Process tasks concurrently
      const [syntaxResult, securityResult, performanceResult] = await Promise.all([
        agentManager.processTask(syntaxTask),
        agentManager.processTask(securityTask),
        agentManager.processTask(performanceTask)
      ]);

      // Verify all tasks completed successfully
      expect(syntaxResult.success).toBe(true);
      expect(syntaxResult.metadata?.agentSpecialty).toBe('syntax');

      expect(securityResult.success).toBe(true);
      expect(securityResult.metadata?.agentSpecialty).toBe('security');

      expect(performanceResult.success).toBe(true);
      expect(performanceResult.metadata?.agentSpecialty).toBe('performance');

      // Verify agent coordination metrics
      const systemHealth = agentManager.getSystemHealth();
      expect(systemHealth.totalAgents).toBe(3);
      expect(systemHealth.activeAgents).toBe(3);
      expect(systemHealth.systemStatus).toBe('healthy');

      const metrics = agentManager.getPerformanceMetrics();
      expect(metrics.totalTasksProcessed).toBe(3);
      expect(metrics.successRate).toBe(1);
    });
  });

  describe('System Resilience and Recovery', () => {
    test('should recover from agent failures', async () => {
      // Create an unreliable agent that fails sometimes
      let failureCount = 0;
      const unreliableAgent: Agent = {
        id: 'unreliable-agent',
        name: 'Unreliable Agent',
        role: 'testing',
        capabilities: [AgentCapability.TESTING],
        governanceLevel: 'basic',
        status: 'idle',
        lastActivity: new Date(),
        processTask: async (task: AgentTask) => {
          failureCount++;
          
          // Fail on first two attempts, succeed on third
          if (failureCount < 3) {
            throw new Error(`Agent failure attempt ${failureCount}`);
          }
          
          return {
            success: true,
            data: { result: 'Eventually successful' },
            metadata: { processingTime: 100, attempts: failureCount }
          };
        }
      };

      await agentManager.registerAgent(unreliableAgent);

      const testTask: AgentTask = {
        id: 'resilience-test-task',
        type: 'testing',
        priority: AgentTaskPriority.MEDIUM,
        data: { test: 'resilience test' },
        requiredCapabilities: [AgentCapability.TESTING],
        createdAt: new Date(),
        status: 'pending'
      };

      // First attempt should fail
      const firstResult = await agentManager.processTask(testTask);
      expect(firstResult.success).toBe(false);

      // Second attempt should also fail
      const secondResult = await agentManager.processTask({
        ...testTask,
        id: 'resilience-test-task-2'
      });
      expect(secondResult.success).toBe(false);

      // Third attempt should succeed
      const thirdResult = await agentManager.processTask({
        ...testTask,
        id: 'resilience-test-task-3'
      });
      expect(thirdResult.success).toBe(true);
      expect(thirdResult.data?.result).toBe('Eventually successful');
    });

    test('should handle high load gracefully', async () => {
      // Register multiple worker agents
      const workerAgents: Agent[] = [];
      for (let i = 0; i < 5; i++) {
        const agent: Agent = {
          id: `load-test-agent-${i}`,
          name: `Load Test Agent ${i}`,
          role: 'load-testing',
          capabilities: [AgentCapability.TESTING],
          governanceLevel: 'basic',
          status: 'idle',
          lastActivity: new Date(),
          processTask: async (task: AgentTask) => {
            // Simulate processing time
            await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 200));
            
            return {
              success: true,
              data: { 
                result: `Processed by agent ${i}`,
                taskId: task.id
              },
              metadata: { 
                processingTime: 100 + Math.random() * 200,
                agentId: `load-test-agent-${i}`
              }
            };
          }
        };
        
        workerAgents.push(agent);
        await agentManager.registerAgent(agent);
      }

      // Create and submit multiple tasks simultaneously
      const tasks: AgentTask[] = [];
      for (let i = 0; i < 20; i++) {
        tasks.push({
          id: `load-test-task-${i}`,
          type: 'load-testing',
          priority: i % 3 === 0 ? AgentTaskPriority.HIGH : 
                   i % 2 === 0 ? AgentTaskPriority.MEDIUM : AgentTaskPriority.LOW,
          data: { 
            taskNumber: i,
            payload: `Load test data ${i}`
          },
          requiredCapabilities: [AgentCapability.TESTING],
          createdAt: new Date(),
          status: 'pending'
        });
      }

      // Process all tasks concurrently
      const startTime = Date.now();
      const results = await Promise.allSettled(
        tasks.map(task => agentManager.processTask(task))
      );
      const endTime = Date.now();

      // Verify results
      const successful = results.filter(result => 
        result.status === 'fulfilled' && result.value.success
      ).length;

      const failed = results.filter(result => 
        result.status === 'rejected' || 
        (result.status === 'fulfilled' && !result.value.success)
      ).length;

      expect(successful).toBeGreaterThan(15); // Most tasks should succeed
      expect(failed).toBeLessThan(5); // Few failures are acceptable under load
      
      const processingTime = endTime - startTime;
      expect(processingTime).toBeLessThan(2000); // Should complete within 2 seconds

      // Verify system health after load test
      const finalHealth = agentManager.getSystemHealth();
      expect(finalHealth.systemStatus).toBe('healthy');
      expect(finalHealth.activeAgents).toBe(5);
    });
  });

  describe('Audit and Compliance Integration', () => {
    test('should maintain comprehensive audit trails', async () => {
      // Register agent with strict governance
      const auditableAgent: Agent = {
        id: 'auditable-agent',
        name: 'Auditable Agent',
        role: 'compliance',
        capabilities: [AgentCapability.COMPLIANCE],
        governanceLevel: 'strict',
        status: 'idle',
        lastActivity: new Date(),
        processTask: async (task: AgentTask) => ({
          success: true,
          data: { 
            complianceCheck: 'passed',
            auditTrail: 'complete'
          },
          metadata: { 
            processingTime: 150,
            complianceLevel: 'strict',
            auditableAction: true
          }
        })
      };

      await agentManager.registerAgent(auditableAgent);

      // Create high-importance task requiring audit
      const auditableTask: AgentTask = {
        id: 'compliance-audit-task',
        type: 'compliance',
        priority: AgentTaskPriority.CRITICAL,
        data: {
          sensitiveData: 'PII processing required',
          complianceFramework: 'GDPR',
          auditRequired: true
        },
        requiredCapabilities: [AgentCapability.COMPLIANCE],
        createdAt: new Date(),
        status: 'pending'
      };

      // Process task
      const result = await agentManager.processTask(auditableTask);

      expect(result.success).toBe(true);
      expect(result.data?.complianceCheck).toBe('passed');
      expect(result.metadata?.auditableAction).toBe(true);

      // Verify audit logs were created
      const auditLogs = auditLogger.getAuditLogs({
        startDate: new Date(Date.now() - 5000),
        endDate: new Date()
      });

      expect(auditLogs.length).toBeGreaterThan(0);
      
      const taskAuditLogs = auditLogs.filter(log => 
        log.resourceId === 'compliance-audit-task' || 
        log.agentId === 'auditable-agent'
      );

      expect(taskAuditLogs.length).toBeGreaterThan(0);
    });
  });
});