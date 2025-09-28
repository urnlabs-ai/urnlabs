/**
 * Main Workflow Execution Engine
 * Orchestrates DAG execution, state management, retry logic, and agent coordination
 */

import { Queue, Worker, Job } from 'bullmq';
import { Redis } from 'ioredis';
import { 
  WorkflowDefinition, 
  WorkflowExecution, 
  StepExecution, 
  ExecutionStatus,
  ExecutionContext,
  ExecutionError,
  ExecutionMetrics,
  ExecutionLog
} from '@/types/workflow.js';
import { DAGEngine } from './dag-engine.js';
import { WorkflowStateMachine, ExecutionContextManager } from './state-machine.js';
import { RetryEngine, ErrorHandler } from './retry-engine.js';
import { VersioningEngine } from './versioning-engine.js';
import { v4 as uuidv4 } from 'uuid';
import pLimit from 'p-limit';

/**
 * Workflow execution configuration
 */
export interface WorkflowEngineConfig {
  redis: {
    host: string;
    port: number;
    password?: string;
    db?: number;
  };
  concurrency: {
    maxParallelSteps: number;
    maxParallelWorkflows: number;
    stepTimeout: number;
  };
  monitoring: {
    enableMetrics: boolean;
    enableLogs: boolean;
    logLevel: 'debug' | 'info' | 'warn' | 'error';
  };
  agents: {
    registryUrl: string;
    defaultTimeout: number;
  };
}

/**
 * Agent execution interface
 */
export interface AgentExecutor {
  executeStep(
    stepExecution: StepExecution,
    context: ExecutionContext
  ): Promise<{
    output: Record<string, any>;
    logs: ExecutionLog[];
    metrics?: Record<string, number>;
  }>;
}

/**
 * Workflow event types
 */
export type WorkflowEvent = 
  | { type: 'workflow.started'; execution: WorkflowExecution }
  | { type: 'workflow.completed'; execution: WorkflowExecution }
  | { type: 'workflow.failed'; execution: WorkflowExecution; error: ExecutionError }
  | { type: 'workflow.paused'; execution: WorkflowExecution }
  | { type: 'workflow.resumed'; execution: WorkflowExecution }
  | { type: 'step.started'; stepExecution: StepExecution }
  | { type: 'step.completed'; stepExecution: StepExecution }
  | { type: 'step.failed'; stepExecution: StepExecution; error: ExecutionError }
  | { type: 'step.retrying'; stepExecution: StepExecution; attempt: number };

/**
 * Event listener interface
 */
export interface EventListener {
  onEvent(event: WorkflowEvent): Promise<void>;
}

/**
 * Main Workflow Execution Engine
 */
export class WorkflowEngine {
  private config: WorkflowEngineConfig;
  private redis: Redis;
  private workflowQueue: Queue;
  private stepQueue: Queue;
  private workers: Worker[] = [];
  private dagEngines: Map<string, DAGEngine> = new Map();
  private stateMachine: WorkflowStateMachine;
  private retryEngine: RetryEngine;
  private errorHandler: ErrorHandler;
  private versioningEngine: VersioningEngine;
  private agentExecutor: AgentExecutor;
  private eventListeners: EventListener[] = [];
  private stepConcurrencyLimit: (fn: () => Promise<any>) => Promise<any>;
  private activeExecutions: Map<string, WorkflowExecution> = new Map();

  constructor(
    config: WorkflowEngineConfig,
    agentExecutor: AgentExecutor
  ) {
    this.config = config;
    this.agentExecutor = agentExecutor;
    
    // Initialize Redis connection
    this.redis = new Redis({
      host: config.redis.host,
      port: config.redis.port,
      password: config.redis.password,
      db: config.redis.db || 0
    });

    // Initialize core components
    this.stateMachine = new WorkflowStateMachine();
    this.retryEngine = new RetryEngine();
    this.errorHandler = new ErrorHandler(this.retryEngine);
    this.versioningEngine = new VersioningEngine();

    // Initialize concurrency limiter
    this.stepConcurrencyLimit = pLimit(config.concurrency.maxParallelSteps);

    // Initialize queues
    this.initializeQueues();
  }

  /**
   * Initialize BullMQ queues and workers
   */
  private initializeQueues(): void {
    // Workflow queue for workflow-level operations
    this.workflowQueue = new Queue('workflow', {
      connection: this.redis,
      defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 50,
        attempts: 3,
        backoff: 'exponential'
      }
    });

    // Step queue for individual step executions
    this.stepQueue = new Queue('step', {
      connection: this.redis,
      defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 50,
        attempts: 1 // Handled by our retry engine
      }
    });

    // Workflow worker
    const workflowWorker = new Worker(
      'workflow',
      async (job: Job) => await this.processWorkflowJob(job),
      {
        connection: this.redis,
        concurrency: this.config.concurrency.maxParallelWorkflows
      }
    );

    // Step worker
    const stepWorker = new Worker(
      'step',
      async (job: Job) => await this.processStepJob(job),
      {
        connection: this.redis,
        concurrency: this.config.concurrency.maxParallelSteps
      }
    );

    this.workers = [workflowWorker, stepWorker];

    // Set up error handlers
    workflowWorker.on('failed', (job, error) => {
      console.error('Workflow job failed:', job?.id, error);
    });

    stepWorker.on('failed', (job, error) => {
      console.error('Step job failed:', job?.id, error);
    });
  }

  /**
   * Start workflow execution
   */
  public async startWorkflow(
    workflowId: string,
    version: string,
    input: Record<string, any>,
    context: ExecutionContext
  ): Promise<WorkflowExecution> {
    // Get workflow definition
    const workflowVersion = this.versioningEngine.getVersions(workflowId)
      .find(v => v.version === version);
    
    if (!workflowVersion) {
      throw new Error(`Workflow version ${workflowId}:${version} not found`);
    }

    const definition = workflowVersion.definition;

    // Create DAG engine
    const dagEngine = new DAGEngine(definition);
    this.dagEngines.set(workflowId, dagEngine);

    // Create workflow execution
    const execution: WorkflowExecution = {
      id: uuidv4(),
      workflowId,
      workflowVersion: version,
      status: 'pending',
      input,
      context,
      startedAt: new Date(),
      executedBy: context.userId,
      stepExecutions: [],
      metrics: this.initializeMetrics(definition),
      traceId: uuidv4()
    };

    // Store execution
    this.activeExecutions.set(execution.id, execution);

    // Start workflow processing
    await this.workflowQueue.add('start', {
      executionId: execution.id,
      workflowId,
      version
    });

    // Emit event
    await this.emitEvent({
      type: 'workflow.started',
      execution
    });

    return execution;
  }

  /**
   * Process workflow job
   */
  private async processWorkflowJob(job: Job): Promise<void> {
    const { executionId, workflowId } = job.data;
    const execution = this.activeExecutions.get(executionId);
    
    if (!execution) {
      throw new Error(`Execution ${executionId} not found`);
    }

    try {
      // Transition to running state
      const updatedExecution = await this.stateMachine.transitionWorkflowState(
        execution,
        'running',
        'Started workflow execution'
      );
      this.activeExecutions.set(executionId, updatedExecution);

      // Execute workflow steps
      await this.executeWorkflowSteps(updatedExecution);

    } catch (error) {
      await this.handleWorkflowError(execution, error);
    }
  }

  /**
   * Execute workflow steps using DAG engine
   */
  private async executeWorkflowSteps(execution: WorkflowExecution): Promise<void> {
    const dagEngine = this.dagEngines.get(execution.workflowId);
    if (!dagEngine) {
      throw new Error(`DAG engine not found for workflow ${execution.workflowId}`);
    }

    const completedSteps = new Set<string>();
    const failedSteps = new Set<string>();

    while (!dagEngine.isExecutionComplete(completedSteps) && failedSteps.size === 0) {
      // Get steps ready for execution
      const readySteps = dagEngine.getReadySteps(completedSteps);
      
      if (readySteps.length === 0) {
        // No steps ready - check if we're blocked by failures
        if (failedSteps.size > 0) {
          throw new Error('Workflow blocked by failed steps');
        }
        break;
      }

      // Execute ready steps in parallel
      const stepPromises = readySteps.map(step =>
        this.stepConcurrencyLimit(() =>
          this.executeStep(execution, step)
        )
      );

      const stepResults = await Promise.allSettled(stepPromises);

      // Process step results
      for (let i = 0; i < stepResults.length; i++) {
        const result = stepResults[i];
        const step = readySteps[i];

        if (result.status === 'fulfilled') {
          completedSteps.add(step.id);
        } else {
          failedSteps.add(step.id);
          console.error(`Step ${step.id} failed:`, result.reason);
        }
      }
    }

    // Update workflow status based on completion
    if (dagEngine.isExecutionComplete(completedSteps)) {
      await this.completeWorkflow(execution);
    } else if (failedSteps.size > 0) {
      throw new Error(`Workflow failed due to step failures: ${Array.from(failedSteps).join(', ')}`);
    }
  }

  /**
   * Execute individual step
   */
  private async executeStep(
    execution: WorkflowExecution,
    step: any
  ): Promise<void> {
    // Create step execution
    const stepExecution: StepExecution = {
      id: uuidv4(),
      stepId: step.id,
      executionId: execution.id,
      status: 'pending',
      input: this.prepareStepInput(execution, step),
      startedAt: new Date(),
      retryCount: 0,
      logs: [],
      metadata: {}
    };

    // Add to execution
    execution.stepExecutions.push(stepExecution);

    // Queue step for execution
    await this.stepQueue.add('execute', {
      executionId: execution.id,
      stepExecutionId: stepExecution.id
    });
  }

  /**
   * Process step job
   */
  private async processStepJob(job: Job): Promise<void> {
    const { executionId, stepExecutionId } = job.data;
    const execution = this.activeExecutions.get(executionId);
    
    if (!execution) {
      throw new Error(`Execution ${executionId} not found`);
    }

    const stepExecution = execution.stepExecutions.find(se => se.id === stepExecutionId);
    if (!stepExecution) {
      throw new Error(`Step execution ${stepExecutionId} not found`);
    }

    try {
      // Transition step to running
      const updatedStepExecution = await this.stateMachine.transitionStepState(
        stepExecution,
        'running',
        'Started step execution'
      );

      // Emit event
      await this.emitEvent({
        type: 'step.started',
        stepExecution: updatedStepExecution
      });

      // Execute step with retry logic
      await this.executeStepWithRetry(execution, updatedStepExecution);

    } catch (error) {
      await this.handleStepError(execution, stepExecution, error);
    }
  }

  /**
   * Execute step with retry logic
   */
  private async executeStepWithRetry(
    execution: WorkflowExecution,
    stepExecution: StepExecution
  ): Promise<void> {
    const step = this.getStepDefinition(execution, stepExecution.stepId);
    const retryPolicy = step.retryPolicy;

    const result = await this.retryEngine.executeWithRetry(
      async () => {
        // Create isolated execution context
        const contextManager = new ExecutionContextManager(execution.context);
        const childContext = contextManager.createChildContext(stepExecution.stepId);

        // Execute step using agent executor
        const stepResult = await this.agentExecutor.executeStep(
          stepExecution,
          childContext.exportContext()
        );

        // Update step execution with results
        stepExecution.output = stepResult.output;
        stepExecution.logs.push(...stepResult.logs);

        if (stepResult.metrics) {
          stepExecution.metadata = {
            ...stepExecution.metadata,
            metrics: stepResult.metrics
          };
        }

        return stepResult;
      },
      retryPolicy,
      `${execution.workflowId}.${stepExecution.stepId}`
    );

    if (result.success) {
      // Complete step
      const completedStepExecution = await this.stateMachine.transitionStepState(
        stepExecution,
        'completed',
        'Step completed successfully'
      );

      await this.emitEvent({
        type: 'step.completed',
        stepExecution: completedStepExecution
      });

    } else {
      // Handle failure
      stepExecution.error = result.error;
      stepExecution.retryCount = result.attempts;

      const failedStepExecution = await this.stateMachine.transitionStepState(
        stepExecution,
        'failed',
        'Step failed after retries'
      );

      await this.emitEvent({
        type: 'step.failed',
        stepExecution: failedStepExecution,
        error: result.error!
      });

      throw result.error;
    }
  }

  /**
   * Complete workflow execution
   */
  private async completeWorkflow(execution: WorkflowExecution): Promise<void> {
    // Aggregate step outputs
    execution.output = this.aggregateStepOutputs(execution);

    // Calculate final metrics
    execution.metrics = this.calculateFinalMetrics(execution);

    // Transition to completed state
    const completedExecution = await this.stateMachine.transitionWorkflowState(
      execution,
      'completed',
      'All steps completed successfully'
    );

    this.activeExecutions.set(execution.id, completedExecution);

    // Emit event
    await this.emitEvent({
      type: 'workflow.completed',
      execution: completedExecution
    });

    // Clean up
    this.dagEngines.delete(execution.workflowId);
  }

  /**
   * Handle workflow error
   */
  private async handleWorkflowError(
    execution: WorkflowExecution,
    error: any
  ): Promise<void> {
    const executionError = this.errorHandler.getRetryEngine().normalizeError(error);
    execution.error = executionError;

    const failedExecution = await this.stateMachine.transitionWorkflowState(
      execution,
      'failed',
      'Workflow execution failed'
    );

    this.activeExecutions.set(execution.id, failedExecution);

    await this.emitEvent({
      type: 'workflow.failed',
      execution: failedExecution,
      error: executionError
    });
  }

  /**
   * Handle step error
   */
  private async handleStepError(
    execution: WorkflowExecution,
    stepExecution: StepExecution,
    error: any
  ): Promise<void> {
    const step = this.getStepDefinition(execution, stepExecution.stepId);
    const retryPolicy = step.retryPolicy;

    const handlerResult = await this.errorHandler.handleStepError(
      stepExecution,
      error,
      retryPolicy
    );

    if (handlerResult.shouldRetry && handlerResult.retryAfter) {
      // Schedule retry
      stepExecution.retryCount++;
      
      await this.emitEvent({
        type: 'step.retrying',
        stepExecution,
        attempt: stepExecution.retryCount
      });

      await this.stepQueue.add(
        'execute',
        {
          executionId: execution.id,
          stepExecutionId: stepExecution.id
        },
        {
          delay: handlerResult.retryAfter
        }
      );
    } else {
      // Permanent failure
      stepExecution.error = handlerResult.finalError;
      
      const failedStepExecution = await this.stateMachine.transitionStepState(
        stepExecution,
        'failed',
        'Step permanently failed'
      );

      await this.emitEvent({
        type: 'step.failed',
        stepExecution: failedStepExecution,
        error: handlerResult.finalError!
      });

      throw handlerResult.finalError;
    }
  }

  /**
   * Pause workflow execution
   */
  public async pauseWorkflow(executionId: string): Promise<void> {
    const execution = this.activeExecutions.get(executionId);
    if (!execution) {
      throw new Error(`Execution ${executionId} not found`);
    }

    const pausedExecution = await this.stateMachine.transitionWorkflowState(
      execution,
      'paused',
      'Workflow paused by user'
    );

    this.activeExecutions.set(executionId, pausedExecution);

    await this.emitEvent({
      type: 'workflow.paused',
      execution: pausedExecution
    });
  }

  /**
   * Resume workflow execution
   */
  public async resumeWorkflow(executionId: string): Promise<void> {
    const execution = this.activeExecutions.get(executionId);
    if (!execution) {
      throw new Error(`Execution ${executionId} not found`);
    }

    if (!this.stateMachine.canResume(execution)) {
      throw new Error(`Cannot resume workflow in status: ${execution.status}`);
    }

    const resumedExecution = await this.stateMachine.transitionWorkflowState(
      execution,
      'running',
      'Workflow resumed by user'
    );

    this.activeExecutions.set(executionId, resumedExecution);

    await this.emitEvent({
      type: 'workflow.resumed',
      execution: resumedExecution
    });

    // Continue execution
    await this.workflowQueue.add('resume', {
      executionId,
      workflowId: execution.workflowId
    });
  }

  /**
   * Cancel workflow execution
   */
  public async cancelWorkflow(executionId: string): Promise<void> {
    const execution = this.activeExecutions.get(executionId);
    if (!execution) {
      throw new Error(`Execution ${executionId} not found`);
    }

    if (!this.stateMachine.canCancel(execution)) {
      throw new Error(`Cannot cancel workflow in status: ${execution.status}`);
    }

    const cancelledExecution = await this.stateMachine.transitionWorkflowState(
      execution,
      'cancelled',
      'Workflow cancelled by user'
    );

    this.activeExecutions.set(executionId, cancelledExecution);

    // Clean up
    this.dagEngines.delete(execution.workflowId);
  }

  /**
   * Get workflow execution status
   */
  public getExecution(executionId: string): WorkflowExecution | undefined {
    return this.activeExecutions.get(executionId);
  }

  /**
   * Add event listener
   */
  public addEventListener(listener: EventListener): void {
    this.eventListeners.push(listener);
  }

  /**
   * Remove event listener
   */
  public removeEventListener(listener: EventListener): void {
    const index = this.eventListeners.indexOf(listener);
    if (index !== -1) {
      this.eventListeners.splice(index, 1);
    }
  }

  /**
   * Emit event to all listeners
   */
  private async emitEvent(event: WorkflowEvent): Promise<void> {
    const promises = this.eventListeners.map(listener =>
      listener.onEvent(event).catch(error =>
        console.error('Event listener error:', error)
      )
    );

    await Promise.allSettled(promises);
  }

  /**
   * Shutdown engine
   */
  public async shutdown(): Promise<void> {
    // Close workers
    await Promise.all(this.workers.map(worker => worker.close()));

    // Close queues
    await this.workflowQueue.close();
    await this.stepQueue.close();

    // Close Redis connection
    await this.redis.quit();
  }

  /**
   * Helper methods
   */
  private initializeMetrics(definition: WorkflowDefinition): ExecutionMetrics {
    return {
      totalSteps: definition.steps.length,
      completedSteps: 0,
      failedSteps: 0,
      skippedSteps: 0,
      totalDuration: 0,
      queueTime: 0,
      executionTime: 0,
      resourceUsage: {
        cpuTime: 0,
        memoryUsage: 0,
        networkRequests: 0,
        storageOperations: 0
      }
    };
  }

  private prepareStepInput(execution: WorkflowExecution, step: any): Record<string, any> {
    // Prepare input based on step dependencies and workflow input
    const input = { ...execution.input };
    
    // Add outputs from completed dependency steps
    for (const depId of step.dependencies) {
      const depStepExecution = execution.stepExecutions.find(se => se.stepId === depId);
      if (depStepExecution?.output) {
        input[`${depId}_output`] = depStepExecution.output;
      }
    }

    return input;
  }

  private getStepDefinition(execution: WorkflowExecution, stepId: string): any {
    const dagEngine = this.dagEngines.get(execution.workflowId);
    const workflowVersion = this.versioningEngine.getVersions(execution.workflowId)
      .find(v => v.version === execution.workflowVersion);
    
    return workflowVersion?.definition.steps.find(s => s.id === stepId);
  }

  private aggregateStepOutputs(execution: WorkflowExecution): Record<string, any> {
    const output: Record<string, any> = {};
    
    for (const stepExecution of execution.stepExecutions) {
      if (stepExecution.output) {
        output[stepExecution.stepId] = stepExecution.output;
      }
    }

    return output;
  }

  private calculateFinalMetrics(execution: WorkflowExecution): ExecutionMetrics {
    const metrics = execution.metrics;
    
    // Update counts
    metrics.completedSteps = execution.stepExecutions.filter(se => se.status === 'completed').length;
    metrics.failedSteps = execution.stepExecutions.filter(se => se.status === 'failed').length;
    metrics.skippedSteps = execution.stepExecutions.filter(se => se.status === 'skipped').length;

    // Calculate total duration
    if (execution.completedAt) {
      metrics.totalDuration = execution.completedAt.getTime() - execution.startedAt.getTime();
    }

    return metrics;
  }
}