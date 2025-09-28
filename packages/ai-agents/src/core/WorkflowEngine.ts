import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import type { 
  WorkflowDefinition, 
  WorkflowExecution, 
  WorkflowStep, 
} from '../types/WorkflowTypes';
import { AuditLogger } from './AuditLogger';
import { GovernanceController } from './GovernanceController';

// Define missing types locally until they are restored in WorkflowTypes.ts
export type WorkflowContext = Record<string, any>;

export interface WorkflowStepExecution {
  id: string;
  stepId: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  startTime: Date;
  endTime?: Date;
  input?: Record<string, any>;
  output?: Record<string, any>;
  error?: string;
  retryCount: number;
  agentResponse?: any;
  metadata: Record<string, any>;
}

/**
 * Deterministic workflow engine for URN Labs AI Agent Platform
 * Provides orchestration, governance, and audit trails for multi-step processes
 */
export class WorkflowEngine extends EventEmitter {
  private workflows: Map<string, WorkflowDefinition> = new Map();
  private executions: Map<string, WorkflowExecution> = new Map();
  private auditLogger: AuditLogger;
  private governanceController: GovernanceController;
  private isInitialized = false;
  private executionQueue: Array<{ executionId: string; priority: number }> = [];
  private processingExecution = false;

  constructor() {
    super();
    this.auditLogger = new AuditLogger();
    this.governanceController = new GovernanceController();
  }

  /**
   * Initialize the workflow engine
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      await this.auditLogger.initialize();
      await this.governanceController.initialize();

      this.setupEventHandlers();
      this.startExecutionProcessor();

      this.isInitialized = true;

      await this.auditLogger.log({
        action: 'workflow_engine_initialized',
        actor: 'system',
        timestamp: new Date(),
        outcome: 'success',
        riskLevel: 'low',
        details: {
          workflowsLoaded: this.workflows.size
        }
      });

    } catch (error) {
      throw new Error(`Failed to initialize WorkflowEngine: ${error}`);
    }
  }

  /**
   * Register a workflow definition
   */
  async registerWorkflow(workflow: WorkflowDefinition): Promise<void> {
    if (!this.isInitialized) {
      throw new Error('WorkflowEngine must be initialized before registering workflows');
    }

    // Validate workflow definition
    await this.validateWorkflowDefinition(workflow);

    // Store workflow
    this.workflows.set(workflow.id, workflow);

    await this.auditLogger.log({
      action: 'workflow_registered',
      actor: 'system',
      timestamp: new Date(),
      outcome: 'success',
      riskLevel: 'low',
      details: {
        workflowId: workflow.id,
        name: workflow.name,
        version: workflow.version,
        stepsCount: workflow.steps.length
      }
    });

    this.emit('workflow_registered', { workflowId: workflow.id, workflow });
  }

  /**
   * Start a workflow execution
   */
  async executeWorkflow(
    workflowId: string,
    context: WorkflowContext,
    priority: 'low' | 'medium' | 'high' | 'critical' = 'medium'
  ): Promise<string> {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) {
      throw new Error(`Workflow ${workflowId} not found`);
    }

    const executionId = uuidv4();
    const now = new Date();

    const execution: WorkflowExecution = {
      id: executionId,
      workflowId,
      workflowVersion: workflow.version,
      status: 'pending',
      context,
      startTime: now,
      input: context,
      stepExecutions: [],
      auditTrail: [],
      triggeredBy: { type: 'manual' },
      tags: workflow.tags || [],
      metrics: {
        totalSteps: workflow.steps.length,
        completedSteps: 0,
        failedSteps: 0,
        skippedSteps: 0,
        averageStepTime: 0,
        resourceUsage: {},
      },
      approvals: [],
      priority: priority,
    };

    // Store execution
    this.executions.set(executionId, execution);

    // Queue for processing
    this.queueExecution(executionId, this.getPriorityNumber(priority));

    await this.auditLogger.logWorkflowActivity(
      workflowId,
      executionId,
      'execution_started',
      { context, priority },
      'pending'
    );

    this.emit('execution_started', { executionId, workflowId, context });

    return executionId;
  }

  /**
   * Get workflow execution status
   */
  async getExecutionStatus(executionId: string): Promise<WorkflowExecution | null> {
    return this.executions.get(executionId) || null;
  }

  /**
   * Cancel a workflow execution
   */
  async cancelExecution(executionId: string, reason: string): Promise<void> {
    const execution = this.executions.get(executionId);
    if (!execution) {
      throw new Error(`Execution ${executionId} not found`);
    }

    if (execution.status === 'completed' || execution.status === 'failed') {
      throw new Error(`Cannot cancel execution ${executionId} - already ${execution.status}`);
    }

    execution.status = 'cancelled';
    execution.endTime = new Date();
    execution.error = reason;

    await this.auditLogger.logWorkflowActivity(
      execution.workflowId,
      executionId,
      'execution_cancelled',
      { reason },
      'success'
    );

    this.emit('execution_cancelled', { executionId, reason });
  }

  /**
   * List workflows with optional filtering
   */
  async listWorkflows(filters?: {
    category?: string;
    tags?: string[];
    enabled?: boolean;
  }): Promise<WorkflowDefinition[]> {
    let workflows = Array.from(this.workflows.values());

    if (filters) {
      if (filters.category) {
        workflows = workflows.filter(w => w.category === filters.category);
      }
      if (filters.tags && filters.tags.length > 0) {
        workflows = workflows.filter(w => 
          filters.tags!.some(tag => w.tags.includes(tag))
        );
      }
      if (filters.enabled !== undefined) {
        workflows = workflows.filter(w => w.enabled === filters.enabled);
      }
    }

    return workflows;
  }

  /**
   * Get workflow execution metrics
   */
  async getExecutionMetrics(timeframe: '1h' | '24h' | '7d' | '30d' = '24h'): Promise<{
    totalExecutions: number;
    successRate: number;
    averageExecutionTime: number;
    statusDistribution: Record<string, number>;
    workflowDistribution: Record<string, number>;
    errorTypes: Record<string, number>;
  }> {
    const now = new Date();
    const startTime = new Date();
    
    switch (timeframe) {
      case '1h':
        startTime.setHours(startTime.getHours() - 1);
        break;
      case '24h':
        startTime.setDate(startTime.getDate() - 1);
        break;
      case '7d':
        startTime.setDate(startTime.getDate() - 7);
        break;
      case '30d':
        startTime.setDate(startTime.getDate() - 30);
        break;
    }

    const executions = Array.from(this.executions.values())
      .filter(e => e.startTime >= startTime);

    const totalExecutions = executions.length;
    const successfulExecutions = executions.filter(e => e.status === 'completed').length;
    const successRate = totalExecutions > 0 ? (successfulExecutions / totalExecutions) * 100 : 0;

    const completedExecutions = executions.filter(e => e.endTime);
    const averageExecutionTime = completedExecutions.length > 0
      ? completedExecutions.reduce((sum, e) => {
          return sum + (e.endTime!.getTime() - e.startTime.getTime());
        }, 0) / completedExecutions.length
      : 0;

    const statusDistribution: Record<string, number> = {};
    const workflowDistribution: Record<string, number> = {};
    const errorTypes: Record<string, number> = {};

    executions.forEach(e => {
      statusDistribution[e.status] = (statusDistribution[e.status] || 0) + 1;
      workflowDistribution[e.workflowId] = (workflowDistribution[e.workflowId] || 0) + 1;
      
      if (e.error) {
        const errorType = this.categorizeError(e.error);
        errorTypes[errorType] = (errorTypes[errorType] || 0) + 1;
      }
    });

    return {
      totalExecutions,
      successRate: Math.round(successRate),
      averageExecutionTime: Math.round(averageExecutionTime),
      statusDistribution,
      workflowDistribution,
      errorTypes
    };
  }

  /**
   * Private methods
   */

  private async validateWorkflowDefinition(workflow: WorkflowDefinition): Promise<void> {
    const errors: string[] = [];

    if (!workflow.id || !workflow.name || !workflow.steps || workflow.steps.length === 0) {
      errors.push('Workflow must have id, name, and at least one step');
    }

    const stepIds = new Set<string>();
    for (const step of workflow.steps) {
      if (!step.id || !step.name || !step.type) {
        errors.push(`Step must have id, name, and type: ${step.id}`);
      }

      if (stepIds.has(step.id)) {
        errors.push(`Duplicate step ID: ${step.id}`);
      }
      stepIds.add(step.id);
    }

    if (errors.length > 0) {
      throw new Error(`Workflow validation failed: ${errors.join(', ')}`);
    }
  }

  private queueExecution(executionId: string, priority: number): void {
    this.executionQueue.push({ executionId, priority });
    this.executionQueue.sort((a, b) => b.priority - a.priority);
  }

  private getPriorityNumber(priority: 'low' | 'medium' | 'high' | 'critical'): number {
    switch (priority) {
      case 'critical': return 4;
      case 'high': return 3;
      case 'medium': return 2;
      case 'low': return 1;
      default: return 2;
    }
  }

  private startExecutionProcessor(): void {
    setInterval(async () => {
      if (this.processingExecution || this.executionQueue.length === 0) return;

      this.processingExecution = true;
      const { executionId } = this.executionQueue.shift()!;

      try {
        await this.processExecution(executionId);
      } catch (error) {
        console.error(`Error processing execution ${executionId}:`, error);
      } finally {
        this.processingExecution = false;
      }
    }, 1000);
  }

  private async processExecution(executionId: string): Promise<void> {
    const execution = this.executions.get(executionId);
    if (!execution) return;

    const workflow = this.workflows.get(execution.workflowId);
    if (!workflow) return;

    execution.status = 'running';

    try {
      let currentStep: WorkflowStep | null = null;

      if (!execution.currentStep) {
        currentStep = workflow.steps.find(s => s.id === workflow.startStep) || workflow.steps[0];
      } else {
        const lastStepExecution = execution.stepExecutions[execution.stepExecutions.length - 1];
        if (lastStepExecution?.status === 'completed') {
            const lastStep = workflow.steps.find(s => s.id === lastStepExecution.stepId);
            if (lastStep?.onSuccess) {
                currentStep = workflow.steps.find(s => s.id === lastStep.onSuccess) || null;
            }
        }
      }

      if (!currentStep) {
        execution.status = 'completed';
        execution.endTime = new Date();

        await this.auditLogger.logWorkflowActivity(
          execution.workflowId,
          executionId,
          'execution_completed',
          { totalSteps: execution.stepExecutions.length },
          'success'
        );

        this.emit('execution_completed', { executionId, execution });
        return;
      }

      await this.executeStep(execution, currentStep);

    } catch (error) {
      execution.status = 'failed';
      execution.error = error instanceof Error ? error.message : String(error);
      execution.endTime = new Date();

      await this.auditLogger.logWorkflowActivity(
        execution.workflowId,
        executionId,
        'execution_failed',
        { error: execution.error },
        'failure'
      );

      this.emit('execution_failed', { executionId, error: execution.error });
    }
  }

  private async executeStep(execution: WorkflowExecution, step: WorkflowStep): Promise<void> {
    const stepExecution: WorkflowStepExecution = {
      id: uuidv4(),
      stepId: step.id,
      status: 'running',
      startTime: new Date(),
      input: this.prepareStepInput(execution, step),
      metadata: {},
      retryCount: 0,
    };

    execution.currentStep = step.id;
    execution.stepExecutions.push(stepExecution);

    try {
      const result = await this.executeStepByType(step, stepExecution.input, execution);

      stepExecution.status = 'completed';
      stepExecution.endTime = new Date();
      stepExecution.output = result || undefined;

      if (step.onSuccess) {
        this.queueExecution(execution.id, 2);
      }

    } catch (error) {
      stepExecution.status = 'failed';
      stepExecution.error = error instanceof Error ? error.message : String(error);
      stepExecution.endTime = new Date();

      if (stepExecution.retryCount < (step.retryAttempts || 0)) {
        stepExecution.retryCount++;
        stepExecution.status = 'pending';
        
        setTimeout(() => {
          this.queueExecution(execution.id, 3);
        }, 1000 * stepExecution.retryCount);
      } else {
        throw error;
      }
    }
  }

  private async executeStepByType(
    step: WorkflowStep,
    input: any,
    execution: WorkflowExecution
  ): Promise<any> {
    switch (step.type) {
      case 'agent_task':
        return this.executeAgentTask(step, input, execution);
      
      case 'condition':
        return this.executeConditionStep(step, execution);
      
      case 'approval':
        return this.executeApprovalStep(step, execution);
      
      case 'delay':
        return this.executeDelayStep(step);
      
      default:
        throw new Error(`Unknown step type: ${step.type}`);
    }
  }

  private async executeAgentTask(step: WorkflowStep, input: any, execution: WorkflowExecution): Promise<any> {
    return {
      success: true,
      result: `Agent task ${step.id} executed`,
      timestamp: new Date()
    };
  }

  private async executeConditionStep(step: WorkflowStep, execution: WorkflowExecution): Promise<any> {
    if (!step.condition) {
      throw new Error('Condition step must have a condition defined');
    }
    const result = await this.evaluateCondition(step.condition, execution);
    return { conditionResult: result };
  }

  private async executeApprovalStep(step: WorkflowStep, execution: WorkflowExecution): Promise<any> {
    const approvalId = await this.governanceController.requestApproval(
      execution.id,
      execution.context.userId || 'system',
      step.approvers || ['admin'],
      `Approval required for workflow step: ${step.name}`
    );

    return {
      approvalId,
      status: 'pending_approval',
      approvers: step.approvers || ['admin']
    };
  }

  private async executeDelayStep(step: WorkflowStep): Promise<any> {
    const delayMs = step.payload?.delay || 1000;
    
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({ delayed: delayMs, timestamp: new Date() });
      }, delayMs);
    });
  }

  private async evaluateCondition(condition: string, execution: WorkflowExecution): Promise<boolean> {
    // This is a simplified and insecure implementation. In a real-world scenario,
    // this should be a sandboxed expression evaluator.
    const context = { ...execution.context };
    try {
      // eslint-disable-next-line no-new-func
      const func = new Function('context', `return ${condition}`);
      return !!func(context);
    } catch (error) {
      console.error(`Error evaluating condition "${condition}":`, error);
      return false;
    }
  }

  private getVariableValue(variableName: string, execution: WorkflowExecution): any {
    if (execution.context[variableName] !== undefined) {
      return execution.context[variableName];
    }

    for (const stepExecution of execution.stepExecutions) {
      if (stepExecution.output && stepExecution.output[variableName] !== undefined) {
        return stepExecution.output[variableName];
      }
    }

    return null;
  }

  private prepareStepInput(execution: WorkflowExecution, step: WorkflowStep): any {
    const input: any = { ...execution.context };

    if (step.payload) {
      for (const key in step.payload) {
        input[key] = step.payload[key];
      }
    }

    return input;
  }

  private categorizeError(error: string): string {
    if (error.includes('timeout')) return 'timeout';
    if (error.includes('network') || error.includes('connection')) return 'network';
    if (error.includes('permission') || error.includes('unauthorized')) return 'authorization';
    if (error.includes('validation') || error.includes('invalid')) return 'validation';
    if (error.includes('resource') || error.includes('limit')) return 'resource';
    return 'other';
  }

  private setupEventHandlers(): void {
    this.on('execution_started', async (event) => {
      await this.auditLogger.logWorkflowActivity(
        event.workflowId,
        event.executionId,
        'execution_event',
        { event: 'started', context: event.context },
        'success'
      );
    });

    this.on('execution_completed', async (event) => {
      await this.auditLogger.logWorkflowActivity(
        event.execution.workflowId,
        event.executionId,
        'execution_event',
        { 
          event: 'completed', 
          duration: event.execution.endTime!.getTime() - event.execution.startTime.getTime(),
          stepsExecuted: event.execution.stepExecutions.length
        },
        'success'
      );
    });

    this.on('execution_failed', async (event) => {
      await this.auditLogger.logWorkflowActivity(
        this.executions.get(event.executionId)!.workflowId,
        event.executionId,
        'execution_event',
        { event: 'failed', error: event.error },
        'failure'
      );
    });
  }
}