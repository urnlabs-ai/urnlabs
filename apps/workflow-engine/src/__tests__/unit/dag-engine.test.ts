/**
 * DAG Engine Unit Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { DAGEngine, DAGValidator } from '@/core/dag-engine.js';
import { WorkflowDefinition } from '@/types/workflow.js';

describe('DAGEngine', () => {
  let sampleWorkflow: WorkflowDefinition;

  beforeEach(() => {
    sampleWorkflow = {
      id: 'test-workflow',
      name: 'Test Workflow',
      version: '1.0.0',
      steps: [
        {
          id: 'step-1',
          name: 'Step 1',
          type: 'agent-task',
          dependencies: [],
          configuration: { parameters: {} }
        },
        {
          id: 'step-2',
          name: 'Step 2',
          type: 'agent-task',
          dependencies: ['step-1'],
          configuration: { parameters: {} }
        },
        {
          id: 'step-3',
          name: 'Step 3',
          type: 'agent-task',
          dependencies: ['step-1'],
          configuration: { parameters: {} }
        },
        {
          id: 'step-4',
          name: 'Step 4',
          type: 'agent-task',
          dependencies: ['step-2', 'step-3'],
          configuration: { parameters: {} }
        }
      ],
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: 'test'
    };
  });

  describe('DAG Construction', () => {
    it('should build DAG from workflow definition', () => {
      const dagEngine = new DAGEngine(sampleWorkflow);
      const plan = dagEngine.getExecutionPlan();

      expect(plan.levels).toHaveLength(3);
      expect(plan.levels[0]).toHaveLength(1); // step-1
      expect(plan.levels[1]).toHaveLength(2); // step-2, step-3
      expect(plan.levels[2]).toHaveLength(1); // step-4
    });

    it('should calculate execution levels correctly', () => {
      const dagEngine = new DAGEngine(sampleWorkflow);
      const plan = dagEngine.getExecutionPlan();

      expect(plan.levels[0][0].id).toBe('step-1');
      expect(plan.levels[1].map(n => n.id).sort()).toEqual(['step-2', 'step-3']);
      expect(plan.levels[2][0].id).toBe('step-4');
    });

    it('should identify parallelizable steps', () => {
      const dagEngine = new DAGEngine(sampleWorkflow);
      const plan = dagEngine.getExecutionPlan();

      expect(plan.parallelizable).toBe(true);
    });

    it('should calculate critical path', () => {
      const dagEngine = new DAGEngine(sampleWorkflow);
      const plan = dagEngine.getExecutionPlan();

      expect(plan.criticalPath).toContain('step-1');
      expect(plan.criticalPath).toContain('step-4');
    });
  });

  describe('Dependency Resolution', () => {
    it('should get ready steps correctly', () => {
      const dagEngine = new DAGEngine(sampleWorkflow);
      const completedSteps = new Set<string>();

      // Initially, only step-1 should be ready
      let readySteps = dagEngine.getReadySteps(completedSteps);
      expect(readySteps).toHaveLength(1);
      expect(readySteps[0].id).toBe('step-1');

      // After step-1 completes, step-2 and step-3 should be ready
      completedSteps.add('step-1');
      readySteps = dagEngine.getReadySteps(completedSteps);
      expect(readySteps).toHaveLength(2);
      expect(readySteps.map(s => s.id).sort()).toEqual(['step-2', 'step-3']);

      // After step-2 and step-3 complete, step-4 should be ready
      completedSteps.add('step-2');
      completedSteps.add('step-3');
      readySteps = dagEngine.getReadySteps(completedSteps);
      expect(readySteps).toHaveLength(1);
      expect(readySteps[0].id).toBe('step-4');
    });

    it('should detect completion correctly', () => {
      const dagEngine = new DAGEngine(sampleWorkflow);
      const completedSteps = new Set(['step-1', 'step-2', 'step-3', 'step-4']);

      expect(dagEngine.isExecutionComplete(completedSteps)).toBe(true);
    });

    it('should not be complete with partial steps', () => {
      const dagEngine = new DAGEngine(sampleWorkflow);
      const completedSteps = new Set(['step-1', 'step-2']);

      expect(dagEngine.isExecutionComplete(completedSteps)).toBe(false);
    });
  });

  describe('Validation', () => {
    it('should detect circular dependencies', () => {
      const circularWorkflow: WorkflowDefinition = {
        ...sampleWorkflow,
        steps: [
          {
            id: 'step-1',
            name: 'Step 1',
            type: 'agent-task',
            dependencies: ['step-2'],
            configuration: { parameters: {} }
          },
          {
            id: 'step-2',
            name: 'Step 2',
            type: 'agent-task',
            dependencies: ['step-1'],
            configuration: { parameters: {} }
          }
        ]
      };

      expect(() => new DAGEngine(circularWorkflow)).toThrow(/circular dependency/i);
    });

    it('should detect missing dependencies', () => {
      const invalidWorkflow: WorkflowDefinition = {
        ...sampleWorkflow,
        steps: [
          {
            id: 'step-1',
            name: 'Step 1',
            type: 'agent-task',
            dependencies: ['non-existent-step'],
            configuration: { parameters: {} }
          }
        ]
      };

      expect(() => new DAGEngine(invalidWorkflow)).toThrow(/not found/i);
    });
  });

  describe('Statistics', () => {
    it('should provide execution statistics', () => {
      const dagEngine = new DAGEngine(sampleWorkflow);
      const stats = dagEngine.getExecutionStats();

      expect(stats.totalSteps).toBe(4);
      expect(stats.maxParallelism).toBe(2);
      expect(stats.criticalPathLength).toBeGreaterThan(0);
    });
  });

  describe('Visualization Export', () => {
    it('should export DAG for visualization', () => {
      const dagEngine = new DAGEngine(sampleWorkflow);
      const exported = dagEngine.exportForVisualization();

      expect(exported.nodes).toHaveLength(4);
      expect(exported.edges).toHaveLength(4); // step-1->step-2, step-1->step-3, step-2->step-4, step-3->step-4
    });
  });
});

describe('DAGValidator', () => {
  it('should validate workflow definition', () => {
    const validWorkflow: WorkflowDefinition = {
      id: 'valid-workflow',
      name: 'Valid Workflow',
      version: '1.0.0',
      steps: [
        {
          id: 'step-1',
          name: 'Step 1',
          type: 'agent-task',
          dependencies: [],
          configuration: { parameters: {} }
        }
      ],
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: 'test'
    };

    const errors = DAGValidator.validateWorkflow(validWorkflow);
    expect(errors).toHaveLength(0);
  });

  it('should detect duplicate step IDs', () => {
    const invalidWorkflow: WorkflowDefinition = {
      id: 'invalid-workflow',
      name: 'Invalid Workflow',
      version: '1.0.0',
      steps: [
        {
          id: 'step-1',
          name: 'Step 1',
          type: 'agent-task',
          dependencies: [],
          configuration: { parameters: {} }
        },
        {
          id: 'step-1',
          name: 'Duplicate Step',
          type: 'agent-task',
          dependencies: [],
          configuration: { parameters: {} }
        }
      ],
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: 'test'
    };

    const errors = DAGValidator.validateWorkflow(invalidWorkflow);
    expect(errors).toHaveLength(1);
    expect(errors[0].code).toBe('DUPLICATE_STEP_ID');
  });

  it('should analyze workflow complexity', () => {
    const workflow: WorkflowDefinition = {
      id: 'complex-workflow',
      name: 'Complex Workflow',
      version: '1.0.0',
      steps: Array.from({ length: 20 }, (_, i) => ({
        id: `step-${i + 1}`,
        name: `Step ${i + 1}`,
        type: 'agent-task' as const,
        dependencies: i > 0 ? [`step-${i}`] : [],
        configuration: { parameters: {} }
      })),
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: 'test'
    };

    const analysis = DAGValidator.analyzeComplexity(workflow);
    expect(analysis.score).toBeGreaterThan(0);
    expect(analysis.factors.stepCount).toBeGreaterThan(0);
    expect(analysis.recommendations).toBeInstanceOf(Array);
  });
});