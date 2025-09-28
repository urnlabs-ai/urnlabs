import { EventEmitter } from 'events';
import { logger, logWorkflowExecution, logAgentError } from '@/lib/logger.js';
import { AgentFactory } from '@/agents/agent-factory.js';
import { WorkflowExecutor } from '@/orchestrator/workflow-executor.js';
import { TaskTracker } from '@/orchestrator/task-tracker.js';
import { ResourceManager } from '@/orchestrator/resource-manager.js';
export class AgentOrchestrator extends EventEmitter {
    prisma;
    queueManager;
    wsManager;
    agentFactory;
    workflowExecutor;
    taskTracker;
    resourceManager;
    isInitialized = false;
    runningWorkflows = new Map();
    constructor(prisma, queueManager, wsManager) {
        super();
        this.prisma = prisma;
        this.queueManager = queueManager;
        this.wsManager = wsManager;
        this.agentFactory = new AgentFactory();
        this.workflowExecutor = new WorkflowExecutor(this.prisma, this.agentFactory);
        this.taskTracker = new TaskTracker();
        this.resourceManager = new ResourceManager({
            maxConcurrentTasks: 100,
            maxMemoryUsageMB: 16384,
            maxCpuUsagePercent: 90,
            maxDiskUsageGB: 512,
        });
    }
    async initialize() {
        try {
            logger.info('Initializing Agent Orchestrator...');
            // Components are initialized in their constructors
            // Set up event listeners
            this.setupEventListeners();
            // Load active workflows
            await this.loadActiveWorkflows();
            this.isInitialized = true;
            logger.info('Agent Orchestrator initialized successfully');
        }
        catch (error) {
            logger.error(error, 'Failed to initialize Agent Orchestrator');
            throw error;
        }
    }
    async shutdown() {
        try {
            logger.info('Shutting down Agent Orchestrator...');
            // Cancel running workflows
            for (const [workflowRunId, controller] of this.runningWorkflows) {
                logger.info(`Cancelling workflow run: ${workflowRunId}`);
                controller.abort();
            }
            // Shutdown components
            this.resourceManager.stop();
            this.isInitialized = false;
            logger.info('Agent Orchestrator shut down successfully');
        }
        catch (error) {
            logger.error(error, 'Error during Agent Orchestrator shutdown');
        }
    }
    async executeWorkflow(request) {
        if (!this.isInitialized) {
            throw new Error('Agent Orchestrator not initialized');
        }
        const startTime = Date.now();
        try {
            // Validate workflow
            const workflow = await this.prisma.workflow.findUnique({
                where: { id: request.workflowId },
                include: {
                    steps: {
                        orderBy: { order: 'asc' },
                        include: { agent: true },
                    },
                },
            });
            if (!workflow) {
                throw new Error(`Workflow not found: ${request.workflowId}`);
            }
            if (workflow.status !== 'active') {
                throw new Error(`Workflow is not active: ${request.workflowId}`);
            }
            // Check organization access
            if (workflow.organizationId !== request.organizationId) {
                throw new Error('Unauthorized access to workflow');
            }
            // Create workflow run record
            const workflowRun = await this.prisma.workflowRun.create({
                data: {
                    workflowId: request.workflowId,
                    userId: request.userId,
                    status: 'pending',
                    priority: request.priority || 'normal',
                    input: request.input || {},
                    startedAt: new Date(),
                },
            });
            logger.info({
                workflowId: request.workflowId,
                workflowRunId: workflowRun.id,
                userId: request.userId,
                priority: request.priority,
            }, 'Starting workflow execution');
            // Create abort controller for this workflow
            const abortController = new AbortController();
            this.runningWorkflows.set(workflowRun.id, abortController);
            // Execute workflow asynchronously
            this.executeWorkflowAsync(workflowRun.id, workflow, abortController.signal)
                .catch((error) => {
                logAgentError('orchestrator', error, { workflowRunId: workflowRun.id });
            });
            return workflowRun.id;
        }
        catch (error) {
            const duration = Date.now() - startTime;
            logger.error({
                workflowId: request.workflowId,
                duration,
                error: error instanceof Error ? error.message : String(error),
            }, 'Failed to start workflow execution');
            throw error;
        }
    }
    async cancelWorkflow(workflowRunId) {
        const controller = this.runningWorkflows.get(workflowRunId);
        if (controller) {
            controller.abort();
            // Update database status
            await this.prisma.workflowRun.update({
                where: { id: workflowRunId },
                data: {
                    status: 'cancelled',
                    completedAt: new Date(),
                },
            });
            logger.info({ workflowRunId }, 'Workflow cancelled');
        }
        else {
            throw new Error(`Workflow run not found or not running: ${workflowRunId}`);
        }
    }
    async getWorkflowStatus(workflowRunId) {
        const workflowRun = await this.prisma.workflowRun.findUnique({
            where: { id: workflowRunId },
            include: {
                workflow: true,
                taskExecutions: {
                    orderBy: { createdAt: 'asc' },
                    include: { agent: true },
                },
            },
        });
        if (!workflowRun) {
            throw new Error(`Workflow run not found: ${workflowRunId}`);
        }
        return {
            id: workflowRun.id,
            workflowId: workflowRun.workflowId,
            workflowName: workflowRun.workflow.name,
            status: workflowRun.status,
            priority: workflowRun.priority,
            input: workflowRun.input,
            output: workflowRun.output,
            error: workflowRun.error,
            startedAt: workflowRun.startedAt,
            completedAt: workflowRun.completedAt,
            duration: workflowRun.duration,
            tasks: workflowRun.taskExecutions.map(task => ({
                id: task.id,
                name: task.name,
                agent: task.agent.name,
                status: task.status,
                startedAt: task.startedAt,
                completedAt: task.completedAt,
                duration: task.duration,
                error: task.error,
            })),
        };
    }
    async executeTask(context) {
        const startTime = Date.now();
        try {
            // Get agent instance
            const agent = await this.agentFactory.getAgent(context.agentId);
            if (!agent) {
                throw new Error(`Agent not found: ${context.agentId}`);
            }
            // Check resource availability
            await this.resourceManager.allocateResources(context.agentId, context.taskExecutionId, {
                memoryMB: agent.getMemoryRequirement(),
                cpuCores: agent.getCpuRequirement(),
            });
            // Update task status
            this.taskTracker.updateTaskStatus(context.taskExecutionId, 'running');
            // Broadcast status update
            this.wsManager.broadcast('task_status', {
                taskExecutionId: context.taskExecutionId,
                workflowRunId: context.workflowRunId,
                status: 'running',
                startedAt: new Date(),
            });
            // Execute task
            const result = await agent.execute({});
            const duration = Date.now() - startTime;
            // Update task completion
            this.taskTracker.updateTaskStatus(context.taskExecutionId, 'completed', {
                output: result,
            });
            // Broadcast completion
            this.wsManager.broadcast('task_completed', {
                taskExecutionId: context.taskExecutionId,
                workflowRunId: context.workflowRunId,
                output: result,
                duration,
            });
            // Release resources
            this.resourceManager.deallocateResources(context.taskExecutionId);
            logger.info({
                agentId: context.agentId,
                taskExecutionId: context.taskExecutionId,
                duration,
            }, 'Task executed successfully');
            return result;
        }
        catch (error) {
            // Update task failure
            this.taskTracker.updateTaskStatus(context.taskExecutionId, 'failed', {
                error: error instanceof Error ? error.message : String(error),
            });
            // Broadcast failure
            this.wsManager.broadcast('task_failed', {
                taskExecutionId: context.taskExecutionId,
                workflowRunId: context.workflowRunId,
                error: error instanceof Error ? error.message : String(error),
            });
            // Release resources
            this.resourceManager.deallocateResources(context.taskExecutionId);
            logAgentError(context.agentId, error instanceof Error ? error : new Error(String(error)), {
                taskExecutionId: context.taskExecutionId,
                workflowRunId: context.workflowRunId,
            });
            throw error;
        }
    }
    async executeWorkflowAsync(workflowRunId, workflow, _signal) {
        const startTime = Date.now();
        try {
            // Update status to running
            await this.prisma.workflowRun.update({
                where: { id: workflowRunId },
                data: { status: 'running' },
            });
            // Execute workflow
            const result = await this.workflowExecutor.executeWorkflow(workflow.id, workflow.input);
            const duration = Date.now() - startTime;
            // Update completion
            await this.prisma.workflowRun.update({
                where: { id: workflowRunId },
                data: {
                    status: 'completed',
                    output: result,
                    completedAt: new Date(),
                    duration,
                },
            });
            // Cleanup
            this.runningWorkflows.delete(workflowRunId);
            logWorkflowExecution(workflow.id, workflowRunId, 'completed', duration);
            // Broadcast completion
            this.wsManager.broadcast('workflow_completed', {
                workflowRunId,
                workflowId: workflow.id,
                output: result,
                duration,
            });
        }
        catch (error) {
            const duration = Date.now() - startTime;
            const errorMessage = error instanceof Error ? error.message : String(error);
            // Update failure
            await this.prisma.workflowRun.update({
                where: { id: workflowRunId },
                data: {
                    status: 'failed',
                    error: errorMessage,
                    completedAt: new Date(),
                    duration,
                },
            });
            // Cleanup
            this.runningWorkflows.delete(workflowRunId);
            logWorkflowExecution(workflow.id, workflowRunId, 'failed', duration, errorMessage);
            // Broadcast failure
            this.wsManager.broadcast('workflow_failed', {
                workflowRunId,
                workflowId: workflow.id,
                error: errorMessage,
            });
        }
    }
    setupEventListeners() {
        // Listen for queue events
        this.queueManager.on('task_completed', (data) => {
            this.emit('task_completed', data);
        });
        this.queueManager.on('task_failed', (data) => {
            this.emit('task_failed', data);
        });
        // Listen for resource events
        this.resourceManager.on('resource_exhausted', (data) => {
            logger.warn(data, 'Resource exhaustion detected');
            this.emit('resource_exhausted', data);
        });
    }
    async loadActiveWorkflows() {
        // Load any workflows that were running when the service stopped
        const runningWorkflows = await this.prisma.workflowRun.findMany({
            where: { status: 'running' },
            include: { workflow: true },
        });
        for (const workflowRun of runningWorkflows) {
            logger.warn({
                workflowRunId: workflowRun.id,
                workflowId: workflowRun.workflowId,
            }, 'Found orphaned workflow run, marking as failed');
            await this.prisma.workflowRun.update({
                where: { id: workflowRun.id },
                data: {
                    status: 'failed',
                    error: 'Service restart interrupted execution',
                    completedAt: new Date(),
                },
            });
        }
    }
}
//# sourceMappingURL=agent-orchestrator.js.map