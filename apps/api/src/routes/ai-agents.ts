import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AgentManager, CodeReviewAgent } from '@urnlabs/ai-agents';

// API route schemas
const CreateTaskSchema = z.object({
  type: z.string(),
  agentId: z.string().optional(),
  priority: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
  payload: z.record(z.any()),
  requiredCapabilities: z.array(z.string()).default([]),
  deadline: z.string().datetime().optional()
});

const TaskQuerySchema = z.object({
  status: z.enum(['pending', 'processing', 'completed', 'failed']).optional(),
  agentId: z.string().optional(),
  limit: z.coerce.number().min(1).max(100).default(20),
  offset: z.coerce.number().min(0).default(0)
});

/**
 * AI Agent management API routes for URN Labs AI Platform
 */
export async function aiAgentRoutes(fastify: FastifyInstance) {
  const agentManager = new AgentManager();
  await agentManager.initialize();

  // Register default agents
  const codeReviewAgent = new CodeReviewAgent();
  await agentManager.register(codeReviewAgent);

  // Get all agents
  fastify.get('/agents', {
    schema: {
      tags: ['ai-agents'],
      summary: 'Get all registered AI agents',
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                agents: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      id: { type: 'string' },
                      name: { type: 'string' },
                      role: { type: 'string' },
                      status: { type: 'string' },
                      capabilities: { type: 'array', items: { type: 'string' } },
                      metrics: {
                        type: 'object',
                        properties: {
                          tasksCompleted: { type: 'number' },
                          successRate: { type: 'number' },
                          performanceScore: { type: 'number' }
                        }
                      }
                    }
                  }
                },
                total: { type: 'number' }
              }
            }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const agents = await agentManager.listAgents();
      const agentData = await Promise.all(
        agents.map(async (agent) => {
          const health = await agent.getHealth();
          const metrics = await agentManager.getAgentMetrics(agent.id);
          
          return {
            id: agent.id,
            name: agent.config.name,
            role: agent.config.role,
            status: health.status,
            capabilities: agent.config.capabilities.map(cap => cap.name),
            metrics: {
              tasksCompleted: metrics.tasksCompleted,
              successRate: Math.round(metrics.successRate),
              performanceScore: Math.round(metrics.performanceScore)
            }
          };
        })
      );

      return {
        success: true,
        data: {
          agents: agentData,
          total: agentData.length
        }
      };
    } catch (error) {
      fastify.log.error(error, 'Failed to get agents');
      return reply.code(500).send({
        success: false,
        error: 'Failed to retrieve agents'
      });
    }
  });

  // Get agent by ID
  fastify.get<{
    Params: { agentId: string }
  }>('/agents/:agentId', {
    schema: {
      tags: ['ai-agents'],
      summary: 'Get AI agent by ID',
      params: {
        type: 'object',
        properties: {
          agentId: { type: 'string' }
        },
        required: ['agentId']
      }
    }
  }, async (request, reply) => {
    try {
      const { agentId } = request.params;
      const agent = await agentManager.getAgent(agentId);
      
      if (!agent) {
        return reply.code(404).send({
          success: false,
          error: 'Agent not found'
        });
      }

      const health = await agent.getHealth();
      const metrics = await agentManager.getAgentMetrics(agent.id);

      return {
        success: true,
        data: {
          id: agent.id,
          name: agent.config.name,
          role: agent.config.role,
          description: agent.config.description,
          version: agent.config.version,
          status: health.status,
          capabilities: agent.config.capabilities,
          metrics,
          health: health.details
        }
      };
    } catch (error) {
      fastify.log.error(error, 'Failed to get agent');
      return reply.code(500).send({
        success: false,
        error: 'Failed to retrieve agent'
      });
    }
  });

  // Create a new task
  fastify.post<{
    Body: z.infer<typeof CreateTaskSchema>
  }>('/tasks', {
    schema: {
      tags: ['ai-tasks'],
      summary: 'Create a new task for AI agent execution',
      body: {
        type: 'object',
        properties: {
          type: { type: 'string', description: 'Task type' },
          agentId: { type: 'string', description: 'Specific agent ID (optional)' },
          priority: { 
            type: 'string', 
            enum: ['low', 'medium', 'high', 'critical'],
            default: 'medium'
          },
          payload: { 
            type: 'object',
            description: 'Task payload data'
          },
          requiredCapabilities: {
            type: 'array',
            items: { type: 'string' },
            description: 'Required agent capabilities'
          },
          deadline: { 
            type: 'string', 
            format: 'date-time',
            description: 'Task deadline (ISO 8601)'
          }
        },
        required: ['type', 'payload']
      }
    }
  }, async (request, reply) => {
    try {
      const validatedBody = CreateTaskSchema.parse(request.body);
      
      const taskData = {
        ...validatedBody,
        deadline: validatedBody.deadline ? new Date(validatedBody.deadline) : undefined,
        context: {
          userId: (request as any).user?.id || 'anonymous',
          sessionId: request.id,
          timestamp: new Date(),
          ip: request.ip,
          userAgent: request.headers['user-agent']
        }
      };

      const taskId = await agentManager.executeTask(taskData);

      return reply.code(201).send({
        success: true,
        data: {
          taskId,
          message: 'Task created and queued for execution',
          estimatedCompletion: new Date(Date.now() + 60000).toISOString() // 1 minute estimate
        }
      });
    } catch (error) {
      fastify.log.error(error, 'Failed to create task');
      
      if (error instanceof z.ZodError) {
        return reply.code(400).send({
          success: false,
          error: 'Invalid task data',
          details: error.errors
        });
      }

      if (error instanceof Error && error.message.includes('governance')) {
        return reply.code(403).send({
          success: false,
          error: 'Task rejected by governance policy',
          details: error.message
        });
      }

      return reply.code(500).send({
        success: false,
        error: 'Failed to create task'
      });
    }
  });

  // Get task status
  fastify.get<{
    Params: { taskId: string }
  }>('/tasks/:taskId', {
    schema: {
      tags: ['ai-tasks'],
      summary: 'Get AI task status and results',
      params: {
        type: 'object',
        properties: {
          taskId: { type: 'string' }
        },
        required: ['taskId']
      }
    }
  }, async (request, reply) => {
    try {
      const { taskId } = request.params;
      const taskStatus = await agentManager.getTaskStatus(taskId);

      return {
        success: true,
        data: {
          taskId,
          ...taskStatus,
          timestamp: new Date().toISOString()
        }
      };
    } catch (error) {
      fastify.log.error(error, 'Failed to get task status');
      
      if (error instanceof Error && error.message.includes('not found')) {
        return reply.code(404).send({
          success: false,
          error: 'Task not found'
        });
      }

      return reply.code(500).send({
        success: false,
        error: 'Failed to retrieve task status'
      });
    }
  });

  // Get system health
  fastify.get('/system/health', {
    schema: {
      tags: ['ai-system'],
      summary: 'Get AI agent system health status',
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                status: { 
                  type: 'string',
                  enum: ['healthy', 'degraded', 'unhealthy']
                },
                timestamp: { type: 'string' },
                agents: { type: 'object' },
                queues: { type: 'object' },
                activeExecutions: { type: 'number' },
                uptime: { type: 'number' }
              }
            }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const health = await agentManager.getSystemHealth();

      return {
        success: true,
        data: {
          ...health,
          timestamp: new Date().toISOString(),
          uptime: process.uptime()
        }
      };
    } catch (error) {
      fastify.log.error(error, 'Failed to get system health');
      return reply.code(500).send({
        success: false,
        error: 'Failed to retrieve system health'
      });
    }
  });

  // Code review endpoint (specialized)
  fastify.post('/code-review', {
    schema: {
      tags: ['ai-specialized'],
      summary: 'Perform automated AI-powered code review',
      body: {
        type: 'object',
        properties: {
          code: { type: 'string', description: 'Source code to review' },
          language: { 
            type: 'string', 
            description: 'Programming language',
            default: 'typescript'
          },
          files: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                path: { type: 'string' },
                content: { type: 'string' }
              }
            },
            description: 'Multiple files to review'
          },
          options: {
            type: 'object',
            properties: {
              includePerformance: { type: 'boolean', default: true },
              includeSecurity: { type: 'boolean', default: true },
              includeCompliance: { type: 'boolean', default: true },
              severity: { 
                type: 'string',
                enum: ['basic', 'standard', 'comprehensive'],
                default: 'standard'
              },
              frameworks: {
                type: 'array',
                items: { type: 'string' },
                description: 'Specific frameworks to check (e.g., React, Express)'
              }
            }
          }
        },
        oneOf: [
          { required: ['code'] },
          { required: ['files'] }
        ]
      }
    }
  }, async (request, reply) => {
    try {
      const { code, language = 'typescript', files, options = {} } = request.body as any;

      // Validate input
      if (!code && (!files || files.length === 0)) {
        return reply.code(400).send({
          success: false,
          error: 'Either code or files must be provided'
        });
      }

      const taskData = {
        type: 'code_review',
        priority: 'medium' as const,
        payload: {
          code,
          language,
          files,
          options: {
            includePerformance: true,
            includeSecurity: true,
            includeCompliance: true,
            severity: 'standard',
            ...options
          }
        },
        requiredCapabilities: ['security_analysis', 'quality_analysis', 'performance_analysis'],
        context: {
          userId: (request as any).user?.id || 'anonymous',
          sessionId: request.id,
          timestamp: new Date(),
          ip: request.ip,
          userAgent: request.headers['user-agent']
        }
      };

      const taskId = await agentManager.executeTask(taskData);

      // For synchronous response, wait briefly for completion
      let attempts = 0;
      const maxAttempts = 10; // 10 seconds maximum wait
      
      while (attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        attempts++;

        try {
          const taskStatus = await agentManager.getTaskStatus(taskId);
          
          if (taskStatus.status === 'completed' && taskStatus.result) {
            return {
              success: true,
              data: {
                taskId,
                review: taskStatus.result,
                status: 'completed',
                processingTime: `${attempts} seconds`
              }
            };
          }
          
          if (taskStatus.status === 'failed') {
            return reply.code(500).send({
              success: false,
              error: taskStatus.error || 'Code review failed',
              taskId
            });
          }
        } catch {
          // Continue waiting
        }
      }

      // If not completed within timeout, return task ID for polling
      return {
        success: true,
        data: {
          taskId,
          status: 'processing',
          message: 'Code review is taking longer than expected. Use the task ID to check status.',
          pollUrl: `/api/v1/ai/tasks/${taskId}`
        }
      };

    } catch (error) {
      fastify.log.error(error, 'Failed to perform code review');
      
      if (error instanceof Error && error.message.includes('governance')) {
        return reply.code(403).send({
          success: false,
          error: 'Code review rejected by governance policy'
        });
      }

      return reply.code(500).send({
        success: false,
        error: 'Failed to perform code review'
      });
    }
  });

  // Agent metrics endpoint
  fastify.get('/metrics', {
    schema: {
      tags: ['ai-system'],
      summary: 'Get comprehensive AI agent metrics',
      querystring: {
        type: 'object',
        properties: {
          timeframe: { 
            type: 'string',
            enum: ['1h', '24h', '7d', '30d'],
            default: '24h'
          },
          agentId: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { timeframe = '24h', agentId } = request.query as any;
      
      if (agentId) {
        const agent = await agentManager.getAgent(agentId);
        if (!agent) {
          return reply.code(404).send({
            success: false,
            error: 'Agent not found'
          });
        }
        
        const metrics = await agentManager.getAgentMetrics(agentId);
        return {
          success: true,
          data: {
            agentId,
            timeframe,
            metrics,
            timestamp: new Date().toISOString()
          }
        };
      }

      // System-wide metrics
      const agents = await agentManager.listAgents();
      const systemHealth = await agentManager.getSystemHealth();
      
      const metricsData = await Promise.all(
        agents.map(async (agent) => ({
          agentId: agent.id,
          name: agent.config.name,
          role: agent.config.role,
          metrics: await agentManager.getAgentMetrics(agent.id)
        }))
      );

      return {
        success: true,
        data: {
          timeframe,
          systemHealth,
          agents: metricsData,
          summary: {
            totalAgents: agents.length,
            totalTasksCompleted: metricsData.reduce((sum, a) => sum + a.metrics.tasksCompleted, 0),
            averageSuccessRate: metricsData.reduce((sum, a) => sum + a.metrics.successRate, 0) / metricsData.length,
            averagePerformanceScore: metricsData.reduce((sum, a) => sum + a.metrics.performanceScore, 0) / metricsData.length
          },
          timestamp: new Date().toISOString()
        }
      };
    } catch (error) {
      fastify.log.error(error, 'Failed to get metrics');
      return reply.code(500).send({
        success: false,
        error: 'Failed to retrieve metrics'
      });
    }
  });

  // Graceful shutdown hook
  fastify.addHook('onClose', async () => {
    fastify.log.info('Shutting down AI agent system...');
    await agentManager.shutdown();
    fastify.log.info('AI agent system shutdown complete');
  });

  // Register health check for the agent system
  fastify.ready(async () => {
    fastify.log.info('AI Agent system initialized and ready');
  });
}