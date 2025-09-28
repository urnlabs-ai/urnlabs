/**
 * DAG-based Workflow Execution Engine
 * Implements topological sorting, dependency resolution, and parallel execution
 */

import { 
  WorkflowDefinition, 
  WorkflowStep, 
  DAGNode, 
  ExecutionPlan,
  ExecutionError
} from '@/types/workflow.js';

export class DAGEngine {
  private nodes: Map<string, DAGNode> = new Map();
  private workflow: WorkflowDefinition;

  constructor(workflow: WorkflowDefinition) {
    this.workflow = workflow;
    this.buildDAG();
  }

  /**
   * Build DAG from workflow definition
   */
  private buildDAG(): void {
    // Initialize nodes
    for (const step of this.workflow.steps) {
      const node: DAGNode = {
        id: step.id,
        step,
        dependencies: new Set(step.dependencies),
        dependents: new Set(),
        level: 0
      };
      this.nodes.set(step.id, node);
    }

    // Build dependency relationships
    for (const node of this.nodes.values()) {
      for (const depId of node.dependencies) {
        const depNode = this.nodes.get(depId);
        if (depNode) {
          depNode.dependents.add(node.id);
        } else {
          throw new Error(`Dependency '${depId}' not found for step '${node.id}'`);
        }
      }
    }

    // Validate DAG (check for cycles)
    this.validateDAG();
    
    // Calculate levels for parallel execution
    this.calculateLevels();
  }

  /**
   * Validate DAG for cycles using DFS
   */
  private validateDAG(): void {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const dfs = (nodeId: string): boolean => {
      if (recursionStack.has(nodeId)) {
        throw new Error(`Circular dependency detected involving step '${nodeId}'`);
      }
      
      if (visited.has(nodeId)) {
        return true;
      }

      visited.add(nodeId);
      recursionStack.add(nodeId);

      const node = this.nodes.get(nodeId);
      if (node) {
        for (const depId of node.dependencies) {
          if (!dfs(depId)) {
            return false;
          }
        }
      }

      recursionStack.delete(nodeId);
      return true;
    };

    for (const nodeId of this.nodes.keys()) {
      if (!visited.has(nodeId)) {
        dfs(nodeId);
      }
    }
  }

  /**
   * Calculate execution levels using topological sorting
   */
  private calculateLevels(): void {
    const inDegree = new Map<string, number>();
    const queue: string[] = [];

    // Initialize in-degrees
    for (const node of this.nodes.values()) {
      inDegree.set(node.id, node.dependencies.size);
      if (node.dependencies.size === 0) {
        queue.push(node.id);
        node.level = 0;
      }
    }

    let level = 0;
    while (queue.length > 0) {
      const currentLevelSize = queue.length;
      
      for (let i = 0; i < currentLevelSize; i++) {
        const nodeId = queue.shift()!;
        const node = this.nodes.get(nodeId)!;
        node.level = level;

        // Reduce in-degree for dependents
        for (const dependentId of node.dependents) {
          const currentInDegree = inDegree.get(dependentId)! - 1;
          inDegree.set(dependentId, currentInDegree);
          
          if (currentInDegree === 0) {
            queue.push(dependentId);
          }
        }
      }
      level++;
    }

    // Verify all nodes were processed
    const unprocessedNodes = Array.from(this.nodes.values()).filter(
      node => inDegree.get(node.id)! > 0
    );
    
    if (unprocessedNodes.length > 0) {
      throw new Error(
        `Circular dependencies detected in nodes: ${unprocessedNodes.map(n => n.id).join(', ')}`
      );
    }
  }

  /**
   * Generate execution plan with parallelization opportunities
   */
  public getExecutionPlan(): ExecutionPlan {
    const levels: DAGNode[][] = [];
    const maxLevel = Math.max(...Array.from(this.nodes.values()).map(n => n.level));

    // Group nodes by execution level
    for (let i = 0; i <= maxLevel; i++) {
      levels[i] = Array.from(this.nodes.values()).filter(node => node.level === i);
    }

    // Calculate critical path
    const criticalPath = this.calculateCriticalPath();

    // Estimate duration based on step timeouts and dependencies
    const estimatedDuration = this.estimateExecutionDuration(levels);

    return {
      levels,
      totalLevels: maxLevel + 1,
      parallelizable: levels.some(level => level.length > 1),
      criticalPath,
      estimatedDuration
    };
  }

  /**
   * Calculate critical path (longest path through the DAG)
   */
  private calculateCriticalPath(): string[] {
    const distances = new Map<string, number>();
    const predecessors = new Map<string, string>();

    // Initialize distances
    for (const node of this.nodes.values()) {
      distances.set(node.id, 0);
    }

    // Process nodes in topological order
    const plan = this.getExecutionPlan();
    for (const level of plan.levels) {
      for (const node of level) {
        const currentDistance = distances.get(node.id)!;
        const stepDuration = node.step.timeout || 30000; // Default 30s

        for (const dependentId of node.dependents) {
          const newDistance = currentDistance + stepDuration;
          if (newDistance > distances.get(dependentId)!) {
            distances.set(dependentId, newDistance);
            predecessors.set(dependentId, node.id);
          }
        }
      }
    }

    // Find the node with maximum distance (end of critical path)
    let maxDistance = 0;
    let endNode = '';
    for (const [nodeId, distance] of distances) {
      if (distance > maxDistance) {
        maxDistance = distance;
        endNode = nodeId;
      }
    }

    // Reconstruct critical path
    const path: string[] = [];
    let current = endNode;
    while (current) {
      path.unshift(current);
      current = predecessors.get(current) || '';
    }

    return path;
  }

  /**
   * Estimate total execution duration
   */
  private estimateExecutionDuration(levels: DAGNode[][]): number {
    let totalDuration = 0;

    for (const level of levels) {
      // For parallel execution, duration is the maximum among all steps in the level
      const levelDuration = Math.max(...level.map(node => node.step.timeout || 30000));
      totalDuration += levelDuration;
    }

    return totalDuration;
  }

  /**
   * Get steps ready for execution (all dependencies completed)
   */
  public getReadySteps(completedSteps: Set<string>): WorkflowStep[] {
    const readySteps: WorkflowStep[] = [];

    for (const node of this.nodes.values()) {
      // Check if all dependencies are completed
      const allDependenciesCompleted = Array.from(node.dependencies).every(
        depId => completedSteps.has(depId)
      );

      if (allDependenciesCompleted && !completedSteps.has(node.id)) {
        readySteps.push(node.step);
      }
    }

    return readySteps;
  }

  /**
   * Check if workflow execution is complete
   */
  public isExecutionComplete(completedSteps: Set<string>): boolean {
    return completedSteps.size === this.nodes.size;
  }

  /**
   * Get step dependencies
   */
  public getStepDependencies(stepId: string): string[] {
    const node = this.nodes.get(stepId);
    return node ? Array.from(node.dependencies) : [];
  }

  /**
   * Get step dependents
   */
  public getStepDependents(stepId: string): string[] {
    const node = this.nodes.get(stepId);
    return node ? Array.from(node.dependents) : [];
  }

  /**
   * Validate step exists in workflow
   */
  public hasStep(stepId: string): boolean {
    return this.nodes.has(stepId);
  }

  /**
   * Get execution statistics
   */
  public getExecutionStats(): {
    totalSteps: number;
    parallelizableSteps: number;
    maxParallelism: number;
    criticalPathLength: number;
  } {
    const plan = this.getExecutionPlan();
    const maxParallelism = Math.max(...plan.levels.map(level => level.length));
    const parallelizableSteps = plan.levels.filter(level => level.length > 1).length;

    return {
      totalSteps: this.nodes.size,
      parallelizableSteps,
      maxParallelism,
      criticalPathLength: plan.criticalPath.length
    };
  }

  /**
   * Clone DAG for modification
   */
  public clone(): DAGEngine {
    return new DAGEngine(this.workflow);
  }

  /**
   * Export DAG for visualization
   */
  public exportForVisualization(): {
    nodes: Array<{ id: string; label: string; level: number }>;
    edges: Array<{ from: string; to: string }>;
  } {
    const nodes = Array.from(this.nodes.values()).map(node => ({
      id: node.id,
      label: node.step.name,
      level: node.level
    }));

    const edges: Array<{ from: string; to: string }> = [];
    for (const node of this.nodes.values()) {
      for (const depId of node.dependencies) {
        edges.push({ from: depId, to: node.id });
      }
    }

    return { nodes, edges };
  }
}

/**
 * DAG validation utilities
 */
export class DAGValidator {
  /**
   * Validate workflow definition for DAG compatibility
   */
  static validateWorkflow(workflow: WorkflowDefinition): ExecutionError[] {
    const errors: ExecutionError[] = [];

    // Check for duplicate step IDs
    const stepIds = new Set<string>();
    for (const step of workflow.steps) {
      if (stepIds.has(step.id)) {
        errors.push({
          code: 'DUPLICATE_STEP_ID',
          message: `Duplicate step ID: ${step.id}`,
          retryable: false,
          category: 'validation'
        });
      }
      stepIds.add(step.id);
    }

    // Check for invalid dependencies
    for (const step of workflow.steps) {
      for (const depId of step.dependencies) {
        if (!stepIds.has(depId)) {
          errors.push({
            code: 'INVALID_DEPENDENCY',
            message: `Step '${step.id}' depends on non-existent step '${depId}'`,
            retryable: false,
            category: 'validation'
          });
        }
      }
    }

    // Check for self-dependencies
    for (const step of workflow.steps) {
      if (step.dependencies.includes(step.id)) {
        errors.push({
          code: 'SELF_DEPENDENCY',
          message: `Step '${step.id}' cannot depend on itself`,
          retryable: false,
          category: 'validation'
        });
      }
    }

    return errors;
  }

  /**
   * Analyze workflow complexity
   */
  static analyzeComplexity(workflow: WorkflowDefinition): {
    score: number;
    factors: Record<string, number>;
    recommendations: string[];
  } {
    const factors: Record<string, number> = {};
    const recommendations: string[] = [];

    // Factor 1: Number of steps
    factors.stepCount = Math.min(workflow.steps.length / 10, 10);

    // Factor 2: Dependency complexity
    const totalDependencies = workflow.steps.reduce((sum, step) => sum + step.dependencies.length, 0);
    factors.dependencyComplexity = Math.min(totalDependencies / workflow.steps.length, 5);

    // Factor 3: Parallelization potential
    try {
      const dagEngine = new DAGEngine(workflow);
      const stats = dagEngine.getExecutionStats();
      factors.parallelization = Math.max(0, 5 - stats.maxParallelism);
    } catch {
      factors.parallelization = 10; // High complexity if DAG construction fails
    }

    // Factor 4: Configuration complexity
    const configComplexity = workflow.steps.reduce((sum, step) => {
      return sum + Object.keys(step.configuration.parameters).length;
    }, 0) / workflow.steps.length;
    factors.configurationComplexity = Math.min(configComplexity / 5, 5);

    // Calculate overall score
    const score = Math.min(
      Object.values(factors).reduce((sum, factor) => sum + factor, 0),
      10
    );

    // Generate recommendations
    if (factors.stepCount > 7) {
      recommendations.push('Consider breaking down into smaller workflows');
    }
    if (factors.dependencyComplexity > 3) {
      recommendations.push('Simplify dependencies to improve maintainability');
    }
    if (factors.parallelization > 3) {
      recommendations.push('Add more parallelization opportunities');
    }

    return { score, factors, recommendations };
  }
}