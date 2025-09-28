import { EventEmitter } from 'events';
import { logger } from '@/lib/logger.js';
export class WorkflowExecutor extends EventEmitter {
    prisma;
    agentFactory;
    executions = new Map();
    constructor(prisma, agentFactory) {
        super();
        this.prisma = prisma;
        this.agentFactory = agentFactory;
    }
    async executeWorkflow(workflowId, input) {
        const executionId = `exec_${Date.now()}_${Math.random().toString(36).substring(7)}`;
        logger.info({ workflowId, executionId }, 'Starting workflow execution');
        // Load workflow definition from database
        const workflow = await this.prisma.workflow.findUnique({
            where: { id: workflowId },
            include: {
                steps: {
                    orderBy: { order: 'asc' },
                },
            },
        });
        if (!workflow) {
            throw new Error(`Workflow not found: ${workflowId}`);
        }
        // Initialize execution
        const execution = {
            id: executionId,
            workflowId,
            status: 'pending',
            input,
            startedAt: new Date(),
            steps: workflow.steps.map(step => ({
                id: `step_${step.id}_${executionId}`,
                stepId: step.id,
                status: 'pending',
            })),
        };
        this.executions.set(executionId, execution);
        this.emit('workflow:started', { executionId, workflowId });
        // Execute workflow asynchronously
        this.runWorkflow(execution).catch(error => {
            logger.error({ executionId, error: error.message }, 'Workflow execution failed');
        });
        return executionId;
    }
    async runWorkflow(execution) {
        try {
            execution.status = 'running';
            this.emit('workflow:running', { executionId: execution.id });
            // Load workflow steps from database
            const workflow = await this.prisma.workflow.findUnique({
                where: { id: execution.workflowId },
                include: {
                    steps: {
                        orderBy: { order: 'asc' },
                    },
                },
            });
            if (!workflow) {
                throw new Error(`Workflow not found: ${execution.workflowId}`);
            }
            let workflowOutput = { ...execution.input };
            // Execute steps sequentially
            for (const step of workflow.steps) {
                const stepExecution = execution.steps.find(s => s.stepId === step.id);
                if (!stepExecution)
                    continue;
                try {
                    stepExecution.status = 'running';
                    stepExecution.startedAt = new Date();
                    stepExecution.input = workflowOutput;
                    this.emit('step:started', {
                        executionId: execution.id,
                        stepId: step.id,
                        stepName: step.name,
                    });
                    // Create agent task
                    const agentTask = {
                        id: stepExecution.id,
                        type: step.name.toLowerCase().replace(/\s+/g, '-'),
                        input: {
                            ...workflowOutput,
                            stepConfig: step.config,
                        },
                        context: {
                            workflowId: execution.workflowId,
                            executionId: execution.id,
                            stepId: step.id,
                        },
                    };
                    // Execute agent task
                    const result = await this.agentFactory.executeAgentTask(step.agentId, agentTask);
                    if (result.success) {
                        stepExecution.status = 'completed';
                        stepExecution.output = result.output;
                        stepExecution.completedAt = new Date();
                        // Merge output into workflow output
                        workflowOutput = {
                            ...workflowOutput,
                            [step.name.toLowerCase().replace(/\s+/g, '_')]: result.output,
                        };
                        this.emit('step:completed', {
                            executionId: execution.id,
                            stepId: step.id,
                            stepName: step.name,
                            output: result.output,
                        });
                    }
                    else {
                        stepExecution.status = 'failed';
                        stepExecution.error = result.error;
                        stepExecution.completedAt = new Date();
                        this.emit('step:failed', {
                            executionId: execution.id,
                            stepId: step.id,
                            stepName: step.name,
                            error: result.error,
                        });
                        throw new Error(`Step ${step.name} failed: ${result.error}`);
                    }
                }
                catch (error) {
                    stepExecution.status = 'failed';
                    stepExecution.error = error instanceof Error ? error.message : 'Unknown error';
                    stepExecution.completedAt = new Date();
                    this.emit('step:failed', {
                        executionId: execution.id,
                        stepId: step.id,
                        stepName: step.name,
                        error: stepExecution.error,
                    });
                    throw error;
                }
            }
            // Workflow completed successfully
            execution.status = 'completed';
            execution.output = workflowOutput;
            execution.completedAt = new Date();
            this.emit('workflow:completed', {
                executionId: execution.id,
                workflowId: execution.workflowId,
                output: workflowOutput,
            });
            logger.info({
                executionId: execution.id,
                workflowId: execution.workflowId,
                duration: execution.completedAt.getTime() - execution.startedAt.getTime(),
            }, 'Workflow completed successfully');
        }
        catch (error) {
            execution.status = 'failed';
            execution.error = error instanceof Error ? error.message : 'Unknown error';
            execution.completedAt = new Date();
            this.emit('workflow:failed', {
                executionId: execution.id,
                workflowId: execution.workflowId,
                error: execution.error,
            });
            logger.error({
                executionId: execution.id,
                workflowId: execution.workflowId,
                error: execution.error,
            }, 'Workflow execution failed');
        }
    }
    getExecution(executionId) {
        return this.executions.get(executionId);
    }
    getAllExecutions() {
        return Array.from(this.executions.values());
    }
    async cancelExecution(executionId) {
        const execution = this.executions.get(executionId);
        if (!execution) {
            return false;
        }
        if (execution.status !== 'running' && execution.status !== 'pending') {
            return false;
        }
        execution.status = 'cancelled';
        execution.completedAt = new Date();
        // Cancel any running steps
        execution.steps.forEach(step => {
            if (step.status === 'running' || step.status === 'pending') {
                step.status = 'skipped';
                step.completedAt = new Date();
            }
        });
        this.emit('workflow:cancelled', {
            executionId,
            workflowId: execution.workflowId,
        });
        logger.info({ executionId }, 'Workflow execution cancelled');
        return true;
    }
}
//# sourceMappingURL=workflow-executor.js.map