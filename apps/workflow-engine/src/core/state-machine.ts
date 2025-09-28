/**
 * Workflow State Machine with Idempotent Operations
 * Manages deterministic state transitions and ensures execution consistency
 */

import { 
  WorkflowExecution, 
  StepExecution, 
  ExecutionStatus, 
  ExecutionError,
  ExecutionContext
} from '@/types/workflow.js';

/**
 * Valid state transitions for workflow execution
 */
const WORKFLOW_STATE_TRANSITIONS: Record<ExecutionStatus, ExecutionStatus[]> = {
  pending: ['running', 'cancelled'],
  running: ['completed', 'failed', 'paused', 'cancelled'],
  completed: [],
  failed: ['running'], // Allow retry
  cancelled: [],
  paused: ['running', 'cancelled'],
  waiting: ['running', 'cancelled', 'failed'],
  skipped: []
};

/**
 * Valid state transitions for step execution
 */
const STEP_STATE_TRANSITIONS: Record<ExecutionStatus, ExecutionStatus[]> = {
  pending: ['running', 'skipped', 'cancelled'],
  running: ['completed', 'failed', 'paused'],
  completed: [],
  failed: ['running'], // Allow retry
  cancelled: [],
  paused: ['running'],
  waiting: ['running', 'failed', 'cancelled'],
  skipped: []
};

export interface StateTransition {
  from: ExecutionStatus;
  to: ExecutionStatus;
  timestamp: Date;
  reason?: string;
  metadata?: Record<string, any>;
}

export interface StateMachineConfig {
  enableOptimisticLocking: boolean;
  maxRetryAttempts: number;
  stateTimeout: number;
  auditTrail: boolean;
}

export class WorkflowStateMachine {
  private config: StateMachineConfig;
  private transitions: StateTransition[] = [];

  constructor(config: Partial<StateMachineConfig> = {}) {
    this.config = {
      enableOptimisticLocking: true,
      maxRetryAttempts: 3,
      stateTimeout: 300000, // 5 minutes
      auditTrail: true,
      ...config
    };
  }

  /**
   * Transition workflow execution state with validation
   */
  public async transitionWorkflowState(
    execution: WorkflowExecution,
    newStatus: ExecutionStatus,
    reason?: string,
    metadata?: Record<string, any>
  ): Promise<WorkflowExecution> {
    // Validate transition
    this.validateWorkflowTransition(execution.status, newStatus);

    // Create state transition record
    const transition: StateTransition = {
      from: execution.status,
      to: newStatus,
      timestamp: new Date(),
      reason,
      metadata
    };

    // Apply idempotent state change
    const updatedExecution = await this.applyWorkflowStateChange(
      execution,
      newStatus,
      transition
    );

    // Record transition if audit trail is enabled
    if (this.config.auditTrail) {
      this.transitions.push(transition);
    }

    return updatedExecution;
  }

  /**
   * Transition step execution state with validation
   */
  public async transitionStepState(
    stepExecution: StepExecution,
    newStatus: ExecutionStatus,
    reason?: string,
    metadata?: Record<string, any>
  ): Promise<StepExecution> {
    // Validate transition
    this.validateStepTransition(stepExecution.status, newStatus);

    // Create state transition record
    const transition: StateTransition = {
      from: stepExecution.status,
      to: newStatus,
      timestamp: new Date(),
      reason,
      metadata
    };

    // Apply idempotent state change
    const updatedStepExecution = await this.applyStepStateChange(
      stepExecution,
      newStatus,
      transition
    );

    return updatedStepExecution;
  }

  /**
   * Validate workflow state transition
   */
  private validateWorkflowTransition(
    currentStatus: ExecutionStatus, 
    newStatus: ExecutionStatus
  ): void {
    if (currentStatus === newStatus) {
      // Idempotent - no change needed
      return;
    }

    const allowedTransitions = WORKFLOW_STATE_TRANSITIONS[currentStatus];
    if (!allowedTransitions.includes(newStatus)) {
      throw new Error(
        `Invalid workflow state transition from '${currentStatus}' to '${newStatus}'. ` +
        `Allowed transitions: ${allowedTransitions.join(', ')}`
      );
    }
  }

  /**
   * Validate step state transition
   */
  private validateStepTransition(
    currentStatus: ExecutionStatus, 
    newStatus: ExecutionStatus
  ): void {
    if (currentStatus === newStatus) {
      // Idempotent - no change needed
      return;
    }

    const allowedTransitions = STEP_STATE_TRANSITIONS[currentStatus];
    if (!allowedTransitions.includes(newStatus)) {
      throw new Error(
        `Invalid step state transition from '${currentStatus}' to '${newStatus}'. ` +
        `Allowed transitions: ${allowedTransitions.join(', ')}`
      );
    }
  }

  /**
   * Apply workflow state change with idempotent operations
   */
  private async applyWorkflowStateChange(
    execution: WorkflowExecution,
    newStatus: ExecutionStatus,
    transition: StateTransition
  ): Promise<WorkflowExecution> {
    const updatedExecution: WorkflowExecution = {
      ...execution,
      status: newStatus,
      completedAt: this.isTerminalStatus(newStatus) ? new Date() : execution.completedAt
    };

    // Update metrics based on state change
    updatedExecution.metrics = this.updateExecutionMetrics(
      updatedExecution.metrics,
      transition
    );

    // Handle specific state transitions
    switch (newStatus) {
      case 'running':
        if (execution.status === 'pending') {
          updatedExecution.startedAt = new Date();
        }
        break;

      case 'completed':
        updatedExecution.completedAt = new Date();
        updatedExecution.metrics.executionTime = 
          updatedExecution.completedAt.getTime() - updatedExecution.startedAt.getTime();
        break;

      case 'failed':
        updatedExecution.completedAt = new Date();
        break;

      case 'cancelled':
        updatedExecution.completedAt = new Date();
        break;
    }

    return updatedExecution;
  }

  /**
   * Apply step state change with idempotent operations
   */
  private async applyStepStateChange(
    stepExecution: StepExecution,
    newStatus: ExecutionStatus,
    transition: StateTransition
  ): Promise<StepExecution> {
    const updatedStepExecution: StepExecution = {
      ...stepExecution,
      status: newStatus,
      completedAt: this.isTerminalStatus(newStatus) ? new Date() : stepExecution.completedAt
    };

    // Handle specific state transitions
    switch (newStatus) {
      case 'running':
        if (stepExecution.status === 'pending') {
          updatedStepExecution.startedAt = new Date();
        }
        break;

      case 'completed':
      case 'failed':
      case 'skipped':
        updatedStepExecution.completedAt = new Date();
        if (updatedStepExecution.startedAt) {
          updatedStepExecution.duration = 
            updatedStepExecution.completedAt.getTime() - 
            updatedStepExecution.startedAt.getTime();
        }
        break;
    }

    return updatedStepExecution;
  }

  /**
   * Check if status is terminal (no further transitions possible)
   */
  private isTerminalStatus(status: ExecutionStatus): boolean {
    return ['completed', 'failed', 'cancelled', 'skipped'].includes(status);
  }

  /**
   * Update execution metrics based on state transition
   */
  private updateExecutionMetrics(
    currentMetrics: any,
    transition: StateTransition
  ): any {
    const metrics = { ...currentMetrics };

    // Update step counts based on transition
    if (transition.to === 'completed') {
      metrics.completedSteps = (metrics.completedSteps || 0) + 1;
    } else if (transition.to === 'failed') {
      metrics.failedSteps = (metrics.failedSteps || 0) + 1;
    } else if (transition.to === 'skipped') {
      metrics.skippedSteps = (metrics.skippedSteps || 0) + 1;
    }

    return metrics;
  }

  /**
   * Get current state machine configuration
   */
  public getConfig(): StateMachineConfig {
    return { ...this.config };
  }

  /**
   * Get transition history
   */
  public getTransitionHistory(): StateTransition[] {
    return [...this.transitions];
  }

  /**
   * Reset state machine
   */
  public reset(): void {
    this.transitions = [];
  }

  /**
   * Check if execution can be resumed
   */
  public canResume(execution: WorkflowExecution): boolean {
    return ['paused', 'failed'].includes(execution.status);
  }

  /**
   * Check if execution can be cancelled
   */
  public canCancel(execution: WorkflowExecution): boolean {
    return ['pending', 'running', 'paused', 'waiting'].includes(execution.status);
  }

  /**
   * Get allowed transitions for current state
   */
  public getAllowedWorkflowTransitions(currentStatus: ExecutionStatus): ExecutionStatus[] {
    return [...WORKFLOW_STATE_TRANSITIONS[currentStatus]];
  }

  /**
   * Get allowed transitions for step state
   */
  public getAllowedStepTransitions(currentStatus: ExecutionStatus): ExecutionStatus[] {
    return [...STEP_STATE_TRANSITIONS[currentStatus]];
  }
}

/**
 * Execution Context Manager
 * Manages execution context with variable isolation and security
 */
export class ExecutionContextManager {
  private context: ExecutionContext;
  private isolatedVariables: Map<string, any> = new Map();

  constructor(context: ExecutionContext) {
    this.context = { ...context };
    this.initializeIsolatedContext();
  }

  /**
   * Initialize isolated execution context
   */
  private initializeIsolatedContext(): void {
    // Create isolated copies of variables to prevent mutation
    for (const [key, value] of Object.entries(this.context.variables)) {
      this.isolatedVariables.set(key, this.deepClone(value));
    }
  }

  /**
   * Get variable value with isolation
   */
  public getVariable(name: string): any {
    return this.isolatedVariables.get(name);
  }

  /**
   * Set variable value with validation
   */
  public setVariable(name: string, value: any): void {
    // Validate variable name
    if (!this.isValidVariableName(name)) {
      throw new Error(`Invalid variable name: ${name}`);
    }

    // Clone value to maintain isolation
    this.isolatedVariables.set(name, this.deepClone(value));
  }

  /**
   * Get secret value (read-only access)
   */
  public getSecret(name: string): string | undefined {
    return this.context.secrets[name];
  }

  /**
   * Check if user has permission
   */
  public hasPermission(permission: string): boolean {
    return this.context.permissions.includes(permission);
  }

  /**
   * Get execution environment
   */
  public getEnvironment(): string {
    return this.context.environment;
  }

  /**
   * Get user ID
   */
  public getUserId(): string {
    return this.context.userId;
  }

  /**
   * Get session ID
   */
  public getSessionId(): string | undefined {
    return this.context.sessionId;
  }

  /**
   * Create child context for step execution
   */
  public createChildContext(stepId: string): ExecutionContextManager {
    const childContext: ExecutionContext = {
      ...this.context,
      variables: Object.fromEntries(this.isolatedVariables),
      sessionId: `${this.context.sessionId}-${stepId}`
    };

    return new ExecutionContextManager(childContext);
  }

  /**
   * Merge variables from child context
   */
  public mergeChildVariables(childContext: ExecutionContextManager): void {
    for (const [key, value] of childContext.isolatedVariables) {
      this.isolatedVariables.set(key, value);
    }
  }

  /**
   * Export context for serialization
   */
  public exportContext(): ExecutionContext {
    return {
      ...this.context,
      variables: Object.fromEntries(this.isolatedVariables)
    };
  }

  /**
   * Validate variable name
   */
  private isValidVariableName(name: string): boolean {
    return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name);
  }

  /**
   * Deep clone object to maintain isolation
   */
  private deepClone(obj: any): any {
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }

    if (obj instanceof Date) {
      return new Date(obj.getTime());
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.deepClone(item));
    }

    const cloned: any = {};
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        cloned[key] = this.deepClone(obj[key]);
      }
    }

    return cloned;
  }
}

/**
 * State Persistence Manager
 * Handles state persistence with optimistic locking
 */
export class StatePersistenceManager {
  private version: number = 0;
  private lockTimeout: number = 30000; // 30 seconds

  /**
   * Save execution state with optimistic locking
   */
  public async saveExecutionState(
    execution: WorkflowExecution,
    expectedVersion?: number
  ): Promise<void> {
    if (expectedVersion !== undefined && expectedVersion !== this.version) {
      throw new Error(
        `Optimistic lock failure. Expected version ${expectedVersion}, ` +
        `but current version is ${this.version}`
      );
    }

    // Simulate persistence operation
    await this.persistState(execution);
    this.version++;
  }

  /**
   * Load execution state
   */
  public async loadExecutionState(executionId: string): Promise<WorkflowExecution | null> {
    // Simulate loading from persistence layer
    return await this.loadState(executionId);
  }

  /**
   * Get current version for optimistic locking
   */
  public getCurrentVersion(): number {
    return this.version;
  }

  /**
   * Acquire lock for state modification
   */
  public async acquireLock(resourceId: string): Promise<string> {
    const lockId = `lock-${resourceId}-${Date.now()}`;
    // Simulate lock acquisition
    await this.setLock(lockId, this.lockTimeout);
    return lockId;
  }

  /**
   * Release lock
   */
  public async releaseLock(lockId: string): Promise<void> {
    // Simulate lock release
    await this.removeLock(lockId);
  }

  /**
   * Simulate state persistence
   */
  private async persistState(execution: WorkflowExecution): Promise<void> {
    // This would integrate with actual database/storage
    await new Promise(resolve => setTimeout(resolve, 10));
  }

  /**
   * Simulate state loading
   */
  private async loadState(executionId: string): Promise<WorkflowExecution | null> {
    // This would integrate with actual database/storage
    await new Promise(resolve => setTimeout(resolve, 10));
    return null;
  }

  /**
   * Simulate lock setting
   */
  private async setLock(lockId: string, timeout: number): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, 5));
  }

  /**
   * Simulate lock removal
   */
  private async removeLock(lockId: string): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, 5));
  }
}