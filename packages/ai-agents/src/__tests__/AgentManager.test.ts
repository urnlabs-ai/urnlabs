import { describe, expect, test, beforeEach, afterEach } from 'vitest';
import { AgentManager } from '../core/AgentManager';
import { Agent, AgentTask, AgentTaskPriority, AgentCapability } from '../types/AgentTypes';
import { AuditLogger } from '../core/AuditLogger';

describe('AgentManager', () => {
  let agentManager: AgentManager;
  let mockAuditLogger: AuditLogger;

  beforeEach(() => {
    mockAuditLogger = new AuditLogger();
    agentManager = new AgentManager(mockAuditLogger);
  });

  afterEach(() => {
    agentManager.cleanup();
  });

  describe('Agent Registration', () => {
    test('should register agent successfully', async () => {
      const mockAgent: Agent = {
        id: 'test-agent-1',
        name: 'Test Agent',
        role: 'code-review',
        capabilities: [AgentCapability.CODE_ANALYSIS],
        governanceLevel: 'standard',
        status: 'idle',
        lastActivity: new Date(),
        processTask: async () => ({
          success: true,
          data: { result: 'test' },
          metadata: { processingTime: 100 }
        })
      };

      const result = await agentManager.registerAgent(mockAgent);
      expect(result).toBe(true);
      
      const registeredAgent = agentManager.getAgent('test-agent-1');
      expect(registeredAgent).toBeDefined();
      expect(registeredAgent?.name).toBe('Test Agent');
    });

    test('should reject duplicate agent registration', async () => {
      const mockAgent: Agent = {
        id: 'duplicate-agent',
        name: 'Duplicate Test Agent',
        role: 'code-review',
        capabilities: [AgentCapability.CODE_ANALYSIS],
        governanceLevel: 'standard',
        status: 'idle',
        lastActivity: new Date(),
        processTask: async () => ({
          success: true,
          data: { result: 'test' },
          metadata: { processingTime: 100 }
        })
      };

      await agentManager.registerAgent(mockAgent);
      const secondRegistration = await agentManager.registerAgent(mockAgent);
      
      expect(secondRegistration).toBe(false);
    });
  });

  describe('Task Distribution', () => {
    test('should distribute task to available agent', async () => {
      const mockAgent: Agent = {
        id: 'worker-agent',
        name: 'Worker Agent',
        role: 'code-review',
        capabilities: [AgentCapability.CODE_ANALYSIS],
        governanceLevel: 'standard',
        status: 'idle',
        lastActivity: new Date(),
        processTask: async (task: AgentTask) => ({
          success: true,
          data: { analysis: 'Code looks good' },
          metadata: { processingTime: 250 }
        })
      };

      await agentManager.registerAgent(mockAgent);

      const task: AgentTask = {
        id: 'task-1',
        type: 'code-review',
        priority: AgentTaskPriority.HIGH,
        data: { code: 'console.log("Hello World");' },
        requiredCapabilities: [AgentCapability.CODE_ANALYSIS],
        createdAt: new Date(),
        status: 'pending'
      };

      const result = await agentManager.processTask(task);
      
      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('analysis');
    });

    test('should handle task with no available agents', async () => {
      const task: AgentTask = {
        id: 'impossible-task',
        type: 'impossible',
        priority: AgentTaskPriority.LOW,
        data: { request: 'impossible task' },
        requiredCapabilities: [AgentCapability.DEPLOYMENT],
        createdAt: new Date(),
        status: 'pending'
      };

      const result = await agentManager.processTask(task);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('No available agents');
    });
  });

  describe('Health Monitoring', () => {
    test('should track agent health correctly', async () => {
      const mockAgent: Agent = {
        id: 'health-test-agent',
        name: 'Health Test Agent',
        role: 'monitoring',
        capabilities: [AgentCapability.MONITORING],
        governanceLevel: 'basic',
        status: 'idle',
        lastActivity: new Date(),
        processTask: async () => ({
          success: true,
          data: { status: 'healthy' },
          metadata: { processingTime: 50 }
        })
      };

      await agentManager.registerAgent(mockAgent);
      
      const healthStatus = agentManager.getSystemHealth();
      
      expect(healthStatus.totalAgents).toBe(1);
      expect(healthStatus.activeAgents).toBe(1);
      expect(healthStatus.systemStatus).toBe('healthy');
    });

    test('should detect unhealthy agents', async () => {
      const unhealthyAgent: Agent = {
        id: 'unhealthy-agent',
        name: 'Unhealthy Agent',
        role: 'testing',
        capabilities: [AgentCapability.TESTING],
        governanceLevel: 'standard',
        status: 'error',
        lastActivity: new Date(Date.now() - 600000), // 10 minutes ago
        processTask: async () => {
          throw new Error('Agent malfunction');
        }
      };

      await agentManager.registerAgent(unhealthyAgent);
      
      const healthStatus = agentManager.getSystemHealth();
      
      expect(healthStatus.systemStatus).toBe('degraded');
      expect(healthStatus.issues).toContain('Agent unhealthy-agent is in error state');
    });
  });

  describe('Performance Metrics', () => {
    test('should collect and report performance metrics', async () => {
      const performantAgent: Agent = {
        id: 'perf-agent',
        name: 'Performance Agent',
        role: 'analysis',
        capabilities: [AgentCapability.CODE_ANALYSIS],
        governanceLevel: 'standard',
        status: 'idle',
        lastActivity: new Date(),
        processTask: async () => ({
          success: true,
          data: { result: 'analyzed' },
          metadata: { processingTime: 150 }
        })
      };

      await agentManager.registerAgent(performantAgent);

      const task: AgentTask = {
        id: 'perf-task',
        type: 'analysis',
        priority: AgentTaskPriority.MEDIUM,
        data: { content: 'test content' },
        requiredCapabilities: [AgentCapability.CODE_ANALYSIS],
        createdAt: new Date(),
        status: 'pending'
      };

      await agentManager.processTask(task);
      
      const metrics = agentManager.getPerformanceMetrics();
      
      expect(metrics.totalTasksProcessed).toBe(1);
      expect(metrics.averageProcessingTime).toBe(150);
      expect(metrics.successRate).toBe(1);
    });
  });
});