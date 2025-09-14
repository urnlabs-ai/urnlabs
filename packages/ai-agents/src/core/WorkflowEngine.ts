import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import type { 
  WorkflowDefinition, 
  WorkflowExecution, 
  WorkflowStep, 
  WorkflowStepExecution,
  WorkflowCondition,
  WorkflowTrigger,
  WorkflowContext
} from '../types/WorkflowTypes';
import { AuditLogger } from './AuditLogger';
import { GovernanceController } from './GovernanceController';

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
      status: 'pending',
      context,
      startTime: now,
      currentStep: null,
      stepExecutions: [],
      variables: new Map(),
      auditTrail: [],
      createdAt: now,
      updatedAt: now
    };

    // Governance check
    const governanceResult = await this.governanceController.validateTask({
      id: executionId,
      type: 'workflow_execution',
      priority: priority as any,
      payload: { workflowId, context },
      requiredCapabilities: workflow.requiredCapabilities || [],
      createdAt: now,
      updatedAt: now,
      status: 'pending',
      auditTrail: []
    });

    if (!governanceResult.approved) {
      throw new Error(`Workflow execution rejected by governance: ${governanceResult.reason}`);
    }

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
    execution.updatedAt = new Date();

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
      .filter(e => e.createdAt >= startTime);

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

    // Basic validation
    if (!workflow.id || !workflow.name || !workflow.steps || workflow.steps.length === 0) {
      errors.push('Workflow must have id, name, and at least one step');
    }

    // Validate steps
    const stepIds = new Set<string>();
    for (const step of workflow.steps) {
      if (!step.id || !step.name || !step.type) {
        errors.push(`Step must have id, name, and type: ${step.id}`);
      }

      if (stepIds.has(step.id)) {
        errors.push(`Duplicate step ID: ${step.id}`);
      }
      stepIds.add(step.id);

      // Validate conditions
      if (step.condition) {
        await this.validateCondition(step.condition);
      }

      // Validate next step references
      if (step.nextStep && !stepIds.has(step.nextStep)) {
        // Allow forward references, validate later
      }
    }

    // Validate step references
    for (const step of workflow.steps) {
      if (step.nextStep && !stepIds.has(step.nextStep)) {
        errors.push(`Invalid next step reference: ${step.nextStep} in step ${step.id}`);
      }
    }

    if (errors.length > 0) {
      throw new Error(`Workflow validation failed: ${errors.join(', ')}`);
    }
  }

  private async validateCondition(condition: WorkflowCondition): Promise<void> {
    // Validate condition structure
    if (!condition.variable || !condition.operator) {
      throw new Error('Condition must have variable and operator');
    }

    const validOperators = ['equals', 'not_equals', 'greater_than', 'less_than', 'contains', 'exists'];
    if (!validOperators.includes(condition.operator)) {
      throw new Error(`Invalid condition operator: ${condition.operator}`);
    }
  }

  private queueExecution(executionId: string, priority: number): void {
    this.executionQueue.push({ executionId, priority });
    this.executionQueue.sort((a, b) => b.priority - a.priority); // Higher priority first
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
    }, 1000); // Process every second
  }

  private async processExecution(executionId: string): Promise<void> {
    const execution = this.executions.get(executionId);
    if (!execution) return;

    const workflow = this.workflows.get(execution.workflowId);
    if (!workflow) return;

    execution.status = 'running';
    execution.updatedAt = new Date();

    try {
      // Find the next step to execute
      let currentStep: WorkflowStep | null = null;

      if (!execution.currentStep) {
        // First step
        currentStep = workflow.steps.find(s => s.isStart) || workflow.steps[0];
      } else {
        // Find next step based on current step's nextStep
        const lastStepExecution = execution.stepExecutions[execution.stepExecutions.length - 1];
        if (lastStepExecution?.nextStep) {
          currentStep = workflow.steps.find(s => s.id === lastStepExecution.nextStep) || null;
        }
      }

      if (!currentStep) {
        // No more steps, complete execution
        execution.status = 'completed';
        execution.endTime = new Date();
        execution.updatedAt = new Date();

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

      // Execute the step
      await this.executeStep(execution, currentStep);

    } catch (error) {
      execution.status = 'failed';
      execution.error = error instanceof Error ? error.message : String(error);
      execution.endTime = new Date();
      execution.updatedAt = new Date();

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
      output: null,
      error: null,
      retryCount: 0,
      nextStep: null
    };

    execution.currentStep = step.id;
    execution.stepExecutions.push(stepExecution);
    execution.updatedAt = new Date();

    try {
      // Check step condition if present
      if (step.condition && !await this.evaluateCondition(step.condition, execution)) {
        stepExecution.status = 'skipped';
        stepExecution.endTime = new Date();
        stepExecution.nextStep = step.nextStep || null;
        return;
      }

      // Execute step based on type
      const result = await this.executeStepByType(step, stepExecution.input, execution);

      stepExecution.status = 'completed';
      stepExecution.endTime = new Date();
      stepExecution.output = result;
      stepExecution.nextStep = step.nextStep || null;

      // Update execution variables with step output
      if (step.outputVariable && result) {
        execution.variables.set(step.outputVariable, result);
      }

      // Queue next execution if there are more steps
      if (stepExecution.nextStep) {
        this.queueExecution(execution.id, 2); // Medium priority for continuation
      }

    } catch (error) {
      stepExecution.status = 'failed';
      stepExecution.error = error instanceof Error ? error.message : String(error);
      stepExecution.endTime = new Date();

      // Retry logic
      if (stepExecution.retryCount < (step.maxRetries || 0)) {
        stepExecution.retryCount++;
        stepExecution.status = 'retrying';
        
        setTimeout(() => {
          this.queueExecution(execution.id, 3); // High priority for retry
        }, (step.retryDelay || 1000) * stepExecution.retryCount);
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
        return this.executeConditionStep(step, input, execution);
      
      case 'data_transformation':
        return this.executeDataTransformation(step, input, execution);
      
      case 'approval':
        return this.executeApprovalStep(step, input, execution);
      
      case 'notification':
        return this.executeNotificationStep(step, input, execution);
      
      case 'delay':
        return this.executeDelayStep(step, input, execution);
      
      default:
        throw new Error(`Unknown step type: ${step.type}`);
    }
  }

  private async executeAgentTask(step: WorkflowStep, input: any, execution: WorkflowExecution): Promise<any> {
    // This would integrate with the AgentManager to execute agent tasks
    return {
      success: true,
      result: `Agent task ${step.id} executed`,
      timestamp: new Date()
    };
  }

  private async executeConditionStep(step: WorkflowStep, input: any, execution: WorkflowExecution): Promise<any> {
    if (!step.condition) {
      throw new Error('Condition step must have a condition defined');
    }

    const result = await this.evaluateCondition(step.condition, execution);
    return { conditionResult: result };
  }

  private async executeDataTransformation(step: WorkflowStep, input: any, execution: WorkflowExecution): Promise<any> {
    // Simple data transformation logic
    if (step.configuration?.transformation) {
      // Apply transformation logic here
      return { transformed: true, data: input };
    }
    return input;
  }

  private async executeApprovalStep(step: WorkflowStep, input: any, execution: WorkflowExecution): Promise<any> {
    const approvalId = await this.governanceController.requestApproval(
      execution.id,
      execution.context.userId || 'system',
      step.configuration?.approvers || ['admin'],
      `Approval required for workflow step: ${step.name}`
    );

    return {
      approvalId,
      status: 'pending_approval',
      approvers: step.configuration?.approvers || ['admin']
    };
  }

  private async executeNotificationStep(step: WorkflowStep, input: any, execution: WorkflowExecution): Promise<any> {
    // Notification logic would go here
    return {
      notificationSent: true,
      recipients: step.configuration?.recipients || [],
      timestamp: new Date()
    };
  }

  private async executeDelayStep(step: WorkflowStep, input: any, execution: WorkflowExecution): Promise<any> {
    const delayMs = step.configuration?.delay || 1000;
    
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({ delayed: delayMs, timestamp: new Date() });
      }, delayMs);
    });
  }

  private async evaluateCondition(condition: WorkflowCondition, execution: WorkflowExecution): Promise<boolean> {
    const value = this.getVariableValue(condition.variable, execution);

    switch (condition.operator) {
      case 'equals':
        return value === condition.value;
      case 'not_equals':
        return value !== condition.value;
      case 'greater_than':
        return Number(value) > Number(condition.value);
      case 'less_than':
        return Number(value) < Number(condition.value);
      case 'contains':
        return String(value).includes(String(condition.value));
      case 'exists':
        return value !== null && value !== undefined;
      default:
        return false;
    }
  }

  private getVariableValue(variableName: string, execution: WorkflowExecution): any {
    // Check execution variables first
    if (execution.variables.has(variableName)) {
      return execution.variables.get(variableName);
    }

    // Check context
    if (execution.context[variableName] !== undefined) {
      return execution.context[variableName];
    }

    // Check step outputs
    for (const stepExecution of execution.stepExecutions) {
      if (stepExecution.output && stepExecution.output[variableName] !== undefined) {
        return stepExecution.output[variableName];
      }
    }

    return null;
  }

  private prepareStepInput(execution: WorkflowExecution, step: WorkflowStep): any {
    const input: any = { ...execution.context };

    // Add variables
    for (const [key, value] of execution.variables.entries()) {
      input[key] = value;
    }

    // Add step configuration
    if (step.configuration) {
      input._stepConfig = step.configuration;
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