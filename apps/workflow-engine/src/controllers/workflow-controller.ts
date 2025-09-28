/**
 * Workflow Controller
 * Handles HTTP API requests for workflow operations
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { 
  WorkflowEngine, 
  WorkflowEngineConfig, 
  EventListener,
  WorkflowEvent 
} from '@/core/workflow-engine.js';
import { AgentExecutorService } from '@/services/agent-executor.js';
import { VersioningEngine } from '@/core/versioning-engine.js';
import { 
  WorkflowDefinition, 
  WorkflowExecution, 
  ExecutionContext,
  ExecutionStatus 
} from '@/types/workflow.js';
import { z } from 'zod';

/**
 * Request schemas
 */
const CreateWorkflowSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  steps: z.array(z.object({
    id: z.string(),
    name: z.string(),
    type: z.enum(['agent-task', 'http-request', 'script', 'condition', 'loop', 'parallel', 'wait', 'manual-approval', 'data-transform', 'notification']),
    dependencies: z.array(z.string()).default([]),
    configuration: z.object({
      parameters: z.record(z.any()).default({})
    }).default({}),
    retryPolicy: z.object({
      maxAttempts: z.number().min(1).default(3),
      baseDelay: z.number().min(100).default(1000),
      maxDelay: z.number().min(1000).default(300000),
      backoffMultiplier: z.number().min(1).default(2),
      retryableErrors: z.array(z.string()).default([]),
      nonRetryableErrors: z.array(z.string()).default([])
    }).optional(),
    timeout: z.number().min(1000).optional(),
    condition: z.object({
      type: z.enum(['expression', 'script']),
      expression: z.string()
    }).optional()
  })),
  parameters: z.array(z.object({
    name: z.string(),
    type: z.enum(['string', 'number', 'boolean', 'object', 'array']),
    required: z.boolean().default(false),
    defaultValue: z.any().optional(),
    description: z.string().optional()
  })).optional(),
  triggers: z.array(z.object({
    id: z.string(),
    type: z.enum(['schedule', 'webhook', 'event', 'manual']),
    configuration: z.record(z.any()),
    enabled: z.boolean().default(true)
  })).optional(),
  tags: z.array(z.string()).optional()
});

const StartExecutionSchema = z.object({
  workflowId: z.string(),
  version: z.string().optional(),
  input: z.record(z.any()).default({}),
  context: z.object({
    userId: z.string(),
    sessionId: z.string().optional(),
    environment: z.enum(['development', 'staging', 'production']).default('development'),
    variables: z.record(z.any()).default({}),
    permissions: z.array(z.string()).default([])
  })
});

const UpdateExecutionSchema = z.object({
  action: z.enum(['pause', 'resume', 'cancel']),
  reason: z.string().optional()
});

/**
 * Workflow Controller
 */
export class WorkflowController implements EventListener {
  private engine: WorkflowEngine;
  private versioningEngine: VersioningEngine;
  private websocketClients: Set<any> = new Set();

  constructor(
    engine: WorkflowEngine,
    versioningEngine: VersioningEngine
  ) {
    this.engine = engine;
    this.versioningEngine = versioningEngine;
    
    // Register as event listener
    this.engine.addEventListener(this);
  }

  /**
   * Register routes
   */
  public async registerRoutes(fastify: FastifyInstance): Promise<void> {
    // Workflow management routes
    fastify.post('/workflows', this.createWorkflow.bind(this));
    fastify.get('/workflows', this.listWorkflows.bind(this));
    fastify.get('/workflows/:workflowId', this.getWorkflow.bind(this));
    fastify.put('/workflows/:workflowId', this.updateWorkflow.bind(this));
    fastify.delete('/workflows/:workflowId', this.deleteWorkflow.bind(this));

    // Version management routes
    fastify.post('/workflows/:workflowId/versions', this.createVersion.bind(this));
    fastify.get('/workflows/:workflowId/versions', this.listVersions.bind(this));
    fastify.get('/workflows/:workflowId/versions/:version', this.getVersion.bind(this));
    fastify.post('/workflows/:workflowId/versions/:version/deploy', this.deployVersion.bind(this));
    fastify.post('/workflows/:workflowId/rollback', this.rollbackWorkflow.bind(this));

    // Execution routes
    fastify.post('/executions', this.startExecution.bind(this));
    fastify.get('/executions', this.listExecutions.bind(this));
    fastify.get('/executions/:executionId', this.getExecution.bind(this));
    fastify.put('/executions/:executionId', this.updateExecution.bind(this));
    fastify.get('/executions/:executionId/logs', this.getExecutionLogs.bind(this));
    fastify.get('/executions/:executionId/metrics', this.getExecutionMetrics.bind(this));

    // Template routes
    fastify.get('/templates', this.listTemplates.bind(this));
    fastify.get('/templates/:templateId', this.getTemplate.bind(this));
    fastify.post('/workflows/from-template', this.createFromTemplate.bind(this));

    // Health and status routes
    fastify.get('/health', this.getHealth.bind(this));
    fastify.get('/status', this.getStatus.bind(this));

    // WebSocket for real-time updates
    fastify.register(async function (fastify) {
      fastify.get('/ws', { websocket: true }, (connection, req) => {
        this.websocketClients.add(connection);
        
        connection.on('close', () => {
          this.websocketClients.delete(connection);
        });
      }.bind(this));
    });
  }

  /**
   * Create new workflow
   */
  private async createWorkflow(
    request: FastifyRequest<{ Body: z.infer<typeof CreateWorkflowSchema> }>,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const data = CreateWorkflowSchema.parse(request.body);
      
      const workflowDefinition: WorkflowDefinition = {
        id: this.generateWorkflowId(data.name),
        name: data.name,
        version: '1.0.0',
        description: data.description,
        steps: data.steps,
        parameters: data.parameters,
        triggers: data.triggers,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: this.getUserId(request),
        tags: data.tags
      };

      // Create initial version
      const version = await this.versioningEngine.createVersion(
        workflowDefinition.id,
        workflowDefinition,
        '1.0.0',
        'Initial version'
      );

      reply.code(201).send({
        success: true,
        data: {
          workflow: workflowDefinition,
          version: version
        }
      });

    } catch (error) {
      reply.code(400).send({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * List workflows
   */
  private async listWorkflows(
    request: FastifyRequest<{ Querystring: { page?: number; limit?: number; tags?: string } }>,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const { page = 1, limit = 10, tags } = request.query;
      
      // This would integrate with actual database
      const workflows = []; // Placeholder
      
      reply.send({
        success: true,
        data: {
          workflows,
          pagination: {
            page,
            limit,
            total: workflows.length,
            pages: Math.ceil(workflows.length / limit)
          }
        }
      });

    } catch (error) {
      reply.code(500).send({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Get workflow by ID
   */
  private async getWorkflow(
    request: FastifyRequest<{ Params: { workflowId: string } }>,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const { workflowId } = request.params;
      
      const versions = this.versioningEngine.getVersions(workflowId);
      if (versions.length === 0) {
        reply.code(404).send({
          success: false,
          error: 'Workflow not found'
        });
        return;
      }

      const latestVersion = versions[0];
      
      reply.send({
        success: true,
        data: {
          workflow: latestVersion.definition,
          versions: versions.map(v => ({
            version: v.version,
            status: v.status,
            deployedAt: v.deployedAt,
            deployedBy: v.deployedBy
          }))
        }
      });

    } catch (error) {
      reply.code(500).send({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Start workflow execution
   */
  private async startExecution(
    request: FastifyRequest<{ Body: z.infer<typeof StartExecutionSchema> }>,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const data = StartExecutionSchema.parse(request.body);
      
      // Get latest version if not specified
      const version = data.version || this.getLatestVersion(data.workflowId);
      
      // Create execution context
      const context: ExecutionContext = {
        ...data.context,
        secrets: {}, // Would be populated from secure store
        permissions: data.context.permissions || []
      };

      // Start workflow execution
      const execution = await this.engine.startWorkflow(
        data.workflowId,
        version,
        data.input,
        context
      );

      reply.code(201).send({
        success: true,
        data: execution
      });

    } catch (error) {
      reply.code(400).send({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Get execution status
   */
  private async getExecution(
    request: FastifyRequest<{ Params: { executionId: string } }>,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const { executionId } = request.params;
      
      const execution = this.engine.getExecution(executionId);
      if (!execution) {
        reply.code(404).send({
          success: false,
          error: 'Execution not found'
        });
        return;
      }

      reply.send({
        success: true,
        data: execution
      });

    } catch (error) {
      reply.code(500).send({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Update execution (pause, resume, cancel)
   */
  private async updateExecution(
    request: FastifyRequest<{ 
      Params: { executionId: string }; 
      Body: z.infer<typeof UpdateExecutionSchema> 
    }>,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const { executionId } = request.params;
      const { action } = UpdateExecutionSchema.parse(request.body);

      switch (action) {
        case 'pause':
          await this.engine.pauseWorkflow(executionId);
          break;
        case 'resume':
          await this.engine.resumeWorkflow(executionId);
          break;
        case 'cancel':
          await this.engine.cancelWorkflow(executionId);
          break;
      }

      const execution = this.engine.getExecution(executionId);
      
      reply.send({
        success: true,
        data: execution
      });

    } catch (error) {
      reply.code(400).send({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Get execution logs
   */
  private async getExecutionLogs(
    request: FastifyRequest<{ 
      Params: { executionId: string };
      Querystring: { stepId?: string; level?: string; limit?: number }
    }>,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const { executionId } = request.params;
      const { stepId, level, limit = 100 } = request.query;
      
      const execution = this.engine.getExecution(executionId);
      if (!execution) {
        reply.code(404).send({
          success: false,
          error: 'Execution not found'
        });
        return;
      }

      // Collect logs from step executions
      let logs: any[] = [];
      
      for (const stepExecution of execution.stepExecutions) {
        if (!stepId || stepExecution.stepId === stepId) {
          let stepLogs = stepExecution.logs;
          
          if (level) {
            stepLogs = stepLogs.filter(log => log.level === level);
          }
          
          logs.push(...stepLogs.map(log => ({
            ...log,
            stepId: stepExecution.stepId,
            stepExecutionId: stepExecution.id
          })));
        }
      }

      // Sort by timestamp and limit
      logs.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
      logs = logs.slice(0, limit);

      reply.send({
        success: true,
        data: {
          logs,
          total: logs.length
        }
      });

    } catch (error) {
      reply.code(500).send({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Get execution metrics
   */
  private async getExecutionMetrics(
    request: FastifyRequest<{ Params: { executionId: string } }>,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const { executionId } = request.params;
      
      const execution = this.engine.getExecution(executionId);
      if (!execution) {
        reply.code(404).send({
          success: false,
          error: 'Execution not found'
        });
        return;
      }

      // Calculate detailed metrics
      const stepMetrics = execution.stepExecutions.map(se => ({
        stepId: se.stepId,
        status: se.status,
        duration: se.duration,
        retryCount: se.retryCount,
        startedAt: se.startedAt,
        completedAt: se.completedAt
      }));

      reply.send({
        success: true,
        data: {
          execution: execution.metrics,
          steps: stepMetrics
        }
      });

    } catch (error) {
      reply.code(500).send({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Get health status
   */
  private async getHealth(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    try {
      // Check system health
      const health = {
        status: 'healthy',
        timestamp: new Date(),
        version: '1.0.0',
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        activeExecutions: this.getActiveExecutionsCount()
      };

      reply.send({
        success: true,
        data: health
      });

    } catch (error) {
      reply.code(500).send({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Get system status
   */
  private async getStatus(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const status = {
        activeExecutions: this.getActiveExecutionsCount(),
        queueStats: {
          // Would get from actual queue monitoring
          pending: 0,
          active: 0,
          completed: 0,
          failed: 0
        },
        performance: {
          avgExecutionTime: 0,
          successRate: 0,
          errorRate: 0
        }
      };

      reply.send({
        success: true,
        data: status
      });

    } catch (error) {
      reply.code(500).send({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Handle workflow events for real-time updates
   */
  public async onEvent(event: WorkflowEvent): Promise<void> {
    // Broadcast event to WebSocket clients
    const message = JSON.stringify({
      type: 'workflow-event',
      event
    });

    for (const client of this.websocketClients) {
      try {
        client.send(message);
      } catch (error) {
        // Remove dead connections
        this.websocketClients.delete(client);
      }
    }
  }

  /**
   * Helper methods
   */
  private generateWorkflowId(name: string): string {
    return name.toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') + 
      '-' + Date.now().toString(36);
  }

  private getUserId(request: FastifyRequest): string {
    // Extract user ID from authentication
    return (request as any).user?.id || 'anonymous';
  }

  private getLatestVersion(workflowId: string): string {
    const versions = this.versioningEngine.getVersions(workflowId);
    const activeVersion = versions.find(v => v.status === 'active');
    return activeVersion?.version || '1.0.0';
  }

  private getActiveExecutionsCount(): number {
    // Would count from actual execution storage
    return 0;
  }

  // Placeholder methods for unimplemented routes
  private async updateWorkflow(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    reply.code(501).send({ success: false, error: 'Not implemented' });
  }

  private async deleteWorkflow(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    reply.code(501).send({ success: false, error: 'Not implemented' });
  }

  private async createVersion(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    reply.code(501).send({ success: false, error: 'Not implemented' });
  }

  private async listVersions(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    reply.code(501).send({ success: false, error: 'Not implemented' });
  }

  private async getVersion(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    reply.code(501).send({ success: false, error: 'Not implemented' });
  }

  private async deployVersion(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    reply.code(501).send({ success: false, error: 'Not implemented' });
  }

  private async rollbackWorkflow(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    reply.code(501).send({ success: false, error: 'Not implemented' });
  }

  private async listExecutions(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    reply.code(501).send({ success: false, error: 'Not implemented' });
  }

  private async listTemplates(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    reply.code(501).send({ success: false, error: 'Not implemented' });
  }

  private async getTemplate(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    reply.code(501).send({ success: false, error: 'Not implemented' });
  }

  private async createFromTemplate(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    reply.code(501).send({ success: false, error: 'Not implemented' });
  }
}