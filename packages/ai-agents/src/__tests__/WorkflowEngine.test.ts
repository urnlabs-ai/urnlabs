import { describe, expect, test, beforeEach } from 'vitest';
import { WorkflowEngine } from '../core/WorkflowEngine';
import { AuditLogger } from '../core/AuditLogger';
import { WorkflowDefinition, WorkflowStep, WorkflowStepType } from '../types/WorkflowTypes';

describe('WorkflowEngine', () => {
  let workflowEngine: WorkflowEngine;
  let mockAuditLogger: AuditLogger;

  beforeEach(() => {
    mockAuditLogger = new AuditLogger();
    workflowEngine = new WorkflowEngine(mockAuditLogger);
  });

  describe('Workflow Registration', () => {
    test('should register workflow successfully', () => {
      const testWorkflow: WorkflowDefinition = {
        id: 'test-workflow-1',
        name: 'Test Workflow',
        version: '1.0.0',
        description: 'A simple test workflow',
        steps: [
          {
            id: 'step-1',
            name: 'Initial Step',
            type: WorkflowStepType.AGENT_TASK,
            agentType: 'code-review',
            config: { timeout: 30000 },
            dependencies: []
          }
        ],
        governanceLevel: 'standard',
        createdAt: new Date(),
        createdBy: 'test-user'
      };

      const result = workflowEngine.registerWorkflow(testWorkflow);
      expect(result).toBe(true);

      const retrievedWorkflow = workflowEngine.getWorkflow('test-workflow-1');
      expect(retrievedWorkflow).toBeDefined();
      expect(retrievedWorkflow?.name).toBe('Test Workflow');
    });

    test('should reject invalid workflow', () => {
      const invalidWorkflow: WorkflowDefinition = {
        id: '',
        name: '',
        version: '1.0.0',
        description: 'Invalid workflow',
        steps: [],
        governanceLevel: 'standard',
        createdAt: new Date(),
        createdBy: 'test-user'
      };

      const result = workflowEngine.registerWorkflow(invalidWorkflow);
      expect(result).toBe(false);
    });
  });

  describe('Workflow Execution', () => {
    test('should execute simple linear workflow', async () => {
      const linearWorkflow: WorkflowDefinition = {
        id: 'linear-workflow',
        name: 'Linear Test Workflow',
        version: '1.0.0',
        description: 'A linear workflow for testing',
        steps: [
          {
            id: 'step-1',
            name: 'Code Analysis',
            type: WorkflowStepType.AGENT_TASK,
            agentType: 'code-review',
            config: { timeout: 30000 },
            dependencies: []
          },
          {
            id: 'step-2',
            name: 'Security Check',
            type: WorkflowStepType.AGENT_TASK,
            agentType: 'security',
            config: { timeout: 30000 },
            dependencies: ['step-1']
          }
        ],
        governanceLevel: 'standard',
        createdAt: new Date(),
        createdBy: 'test-user'
      };

      workflowEngine.registerWorkflow(linearWorkflow);

      const executionData = {
        code: 'console.log("Hello World");',
        repository: 'test-repo'
      };

      const execution = await workflowEngine.executeWorkflow(
        'linear-workflow',
        executionData,
        'test-user'
      );

      expect(execution).toBeDefined();
      expect(execution.workflowId).toBe('linear-workflow');
      expect(execution.status).toBe('running');
      expect(execution.steps).toHaveLength(2);
    });

    test('should handle workflow with parallel steps', async () => {
      const parallelWorkflow: WorkflowDefinition = {
        id: 'parallel-workflow',
        name: 'Parallel Test Workflow',
        version: '1.0.0',
        description: 'A workflow with parallel execution',
        steps: [
          {
            id: 'init',
            name: 'Initialize',
            type: WorkflowStepType.AGENT_TASK,
            agentType: 'initialization',
            config: { timeout: 10000 },
            dependencies: []
          },
          {
            id: 'analysis-1',
            name: 'Code Analysis',
            type: WorkflowStepType.AGENT_TASK,
            agentType: 'code-review',
            config: { timeout: 30000 },
            dependencies: ['init']
          },
          {
            id: 'analysis-2',
            name: 'Security Analysis',
            type: WorkflowStepType.AGENT_TASK,
            agentType: 'security',
            config: { timeout: 30000 },
            dependencies: ['init']
          },
          {
            id: 'report',
            name: 'Generate Report',
            type: WorkflowStepType.AGENT_TASK,
            agentType: 'reporting',
            config: { timeout: 15000 },
            dependencies: ['analysis-1', 'analysis-2']
          }
        ],
        governanceLevel: 'standard',
        createdAt: new Date(),
        createdBy: 'test-user'
      };

      workflowEngine.registerWorkflow(parallelWorkflow);

      const execution = await workflowEngine.executeWorkflow(
        'parallel-workflow',
        { data: 'test' },
        'test-user'
      );

      expect(execution).toBeDefined();
      expect(execution.steps).toHaveLength(4);
      
      // Check that parallel steps are properly identified
      const analysisSteps = execution.steps.filter(step => 
        step.stepId === 'analysis-1' || step.stepId === 'analysis-2'
      );
      expect(analysisSteps).toHaveLength(2);
    });

    test('should handle workflow step failure', async () => {
      const failingWorkflow: WorkflowDefinition = {
        id: 'failing-workflow',
        name: 'Failing Test Workflow',
        version: '1.0.0',
        description: 'A workflow that should fail',
        steps: [
          {
            id: 'fail-step',
            name: 'Failing Step',
            type: WorkflowStepType.AGENT_TASK,
            agentType: 'non-existent-agent',
            config: { timeout: 5000 },
            dependencies: []
          }
        ],
        governanceLevel: 'standard',
        createdAt: new Date(),
        createdBy: 'test-user'
      };

      workflowEngine.registerWorkflow(failingWorkflow);

      const execution = await workflowEngine.executeWorkflow(
        'failing-workflow',
        { data: 'test' },
        'test-user'
      );

      expect(execution).toBeDefined();
      expect(execution.status).toBe('running');
      
      // Wait a moment for execution to process
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const status = workflowEngine.getExecutionStatus(execution.id);
      expect(status?.status).toBe('failed');
    });
  });

  describe('Workflow Validation', () => {
    test('should detect circular dependencies', () => {
      const circularWorkflow: WorkflowDefinition = {
        id: 'circular-workflow',
        name: 'Circular Dependency Workflow',
        version: '1.0.0',
        description: 'A workflow with circular dependencies',
        steps: [
          {
            id: 'step-a',
            name: 'Step A',
            type: WorkflowStepType.AGENT_TASK,
            agentType: 'test',
            config: {},
            dependencies: ['step-b']
          },
          {
            id: 'step-b',
            name: 'Step B',
            type: WorkflowStepType.AGENT_TASK,
            agentType: 'test',
            config: {},
            dependencies: ['step-a']
          }
        ],
        governanceLevel: 'standard',
        createdAt: new Date(),
        createdBy: 'test-user'
      };

      const result = workflowEngine.registerWorkflow(circularWorkflow);
      expect(result).toBe(false);
    });

    test('should validate step dependencies exist', () => {
      const invalidDepsWorkflow: WorkflowDefinition = {
        id: 'invalid-deps-workflow',
        name: 'Invalid Dependencies Workflow',
        version: '1.0.0',
        description: 'A workflow with non-existent dependencies',
        steps: [
          {
            id: 'step-1',
            name: 'Step 1',
            type: WorkflowStepType.AGENT_TASK,
            agentType: 'test',
            config: {},
            dependencies: ['non-existent-step']
          }
        ],
        governanceLevel: 'standard',
        createdAt: new Date(),
        createdBy: 'test-user'
      };

      const result = workflowEngine.registerWorkflow(invalidDepsWorkflow);
      expect(result).toBe(false);
    });
  });

  describe('Execution Status and Control', () => {
    test('should pause and resume workflow execution', async () => {
      const pausableWorkflow: WorkflowDefinition = {
        id: 'pausable-workflow',
        name: 'Pausable Workflow',
        version: '1.0.0',
        description: 'A workflow that can be paused',
        steps: [
          {
            id: 'long-step',
            name: 'Long Running Step',
            type: WorkflowStepType.AGENT_TASK,
            agentType: 'long-running',
            config: { timeout: 60000 },
            dependencies: []
          }
        ],
        governanceLevel: 'standard',
        createdAt: new Date(),
        createdBy: 'test-user'
      };

      workflowEngine.registerWorkflow(pausableWorkflow);

      const execution = await workflowEngine.executeWorkflow(
        'pausable-workflow',
        { data: 'test' },
        'test-user'
      );

      // Pause execution
      const pauseResult = workflowEngine.pauseExecution(execution.id);
      expect(pauseResult).toBe(true);

      const pausedStatus = workflowEngine.getExecutionStatus(execution.id);
      expect(pausedStatus?.status).toBe('paused');

      // Resume execution
      const resumeResult = workflowEngine.resumeExecution(execution.id);
      expect(resumeResult).toBe(true);

      const resumedStatus = workflowEngine.getExecutionStatus(execution.id);
      expect(resumedStatus?.status).toBe('running');
    });

    test('should cancel workflow execution', async () => {
      const cancellableWorkflow: WorkflowDefinition = {
        id: 'cancellable-workflow',
        name: 'Cancellable Workflow',
        version: '1.0.0',
        description: 'A workflow that can be cancelled',
        steps: [
          {
            id: 'step-1',
            name: 'Step 1',
            type: WorkflowStepType.AGENT_TASK,
            agentType: 'test',
            config: { timeout: 30000 },
            dependencies: []
          }
        ],
        governanceLevel: 'standard',
        createdAt: new Date(),
        createdBy: 'test-user'
      };

      workflowEngine.registerWorkflow(cancellableWorkflow);

      const execution = await workflowEngine.executeWorkflow(
        'cancellable-workflow',
        { data: 'test' },
        'test-user'
      );

      const cancelResult = workflowEngine.cancelExecution(execution.id);
      expect(cancelResult).toBe(true);

      const cancelledStatus = workflowEngine.getExecutionStatus(execution.id);
      expect(cancelledStatus?.status).toBe('cancelled');
    });
  });
});