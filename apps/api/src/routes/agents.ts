import { FastifyInstance, FastifyPluginOptions, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { UnifiedAgentRegistry } from '../services/agent-registry.js'
import { PrismaClient } from '@prisma/client'

// Request schemas
const ExecuteTaskSchema = z.object({
  agentId: z.string().optional(),
  agentType: z.string().optional(),
  task: z.string(),
  parameters: z.record(z.any()).optional(),
  priority: z.enum(['low', 'normal', 'high']).default('normal'),
  timeout: z.number().min(1000).max(300000).default(60000),
  requestId: z.string().optional(),
  preferredSource: z.enum(['nodejs', 'go']).optional()
}).refine(data => data.agentId || data.agentType, {
  message: "Either agentId or agentType must be provided"
})

const FindAgentSchema = z.object({
  capabilities: z.array(z.string()),
  preferredSource: z.enum(['nodejs', 'go']).optional()
})

let agentRegistry: UnifiedAgentRegistry

export async function agentsRoutes(
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions
) {
  const prisma = new PrismaClient()
  
  // Initialize agent registry
  agentRegistry = new UnifiedAgentRegistry(prisma)

  /**
   * Get all agents (unified Node.js + Go agents)
   */
  fastify.get('/', {
    schema: {
      tags: ['AI Agents'],
      summary: 'List all available AI agents',
      description: 'Get unified list of Node.js and Go agents with their capabilities and status',
      security: [{ bearerAuth: [] }],
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const agents = agentRegistry.getAllAgents()
      const statistics = agentRegistry.getStatistics()

      return reply.send({
        agents,
        statistics,
        timestamp: new Date().toISOString()
      })
    } catch (error) {
      fastify.log.error('Failed to get agents:', error)
      return reply.code(500).send({
        error: 'Failed to retrieve agents',
        details: error.message
      })
    }
  })

  /**
   * Get agents by source (nodejs or go)
   */
  fastify.get('/source/:source', {
    schema: {
      tags: ['AI Agents'],
      summary: 'Get agents by source',
      description: 'Filter agents by their source platform (nodejs or go)',
      security: [{ bearerAuth: [] }],
    },
  }, async (request: FastifyRequest<{
    Params: { source: 'nodejs' | 'go' }
  }>, reply: FastifyReply) => {
    try {
      const { source } = request.params
      
      if (source !== 'nodejs' && source !== 'go') {
        return reply.code(400).send({
          error: 'Invalid source. Must be "nodejs" or "go"'
        })
      }

      const agents = agentRegistry.getAgentsBySource(source)
      
      return reply.send({
        source,
        agents,
        count: agents.length,
        timestamp: new Date().toISOString()
      })
    } catch (error) {
      fastify.log.error('Failed to get agents by source:', error)
      return reply.code(500).send({
        error: 'Failed to retrieve agents by source',
        details: error.message
      })
    }
  })

  /**
   * Get specific agent by ID
   */
  fastify.get('/:agentId', {
    schema: {
      tags: ['AI Agents'],
      summary: 'Get agent details',
      description: 'Get detailed information about a specific agent',
      security: [{ bearerAuth: [] }],
    },
  }, async (request: FastifyRequest<{
    Params: { agentId: string }
  }>, reply: FastifyReply) => {
    try {
      const { agentId } = request.params
      const agent = agentRegistry.getAgent(agentId)

      if (!agent) {
        return reply.code(404).send({
          error: 'Agent not found',
          agentId
        })
      }

      return reply.send({
        agent,
        timestamp: new Date().toISOString()
      })
    } catch (error) {
      fastify.log.error('Failed to get agent:', error)
      return reply.code(500).send({
        error: 'Failed to retrieve agent',
        details: error.message
      })
    }
  })

  /**
   * Find best agent for specific capabilities
   */
  fastify.post('/find', {
    schema: {
      tags: ['AI Agents'],
      summary: 'Find optimal agent',
      description: 'Find the best agent for given capabilities and preferences',
      security: [{ bearerAuth: [] }],
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { capabilities, preferredSource } = FindAgentSchema.parse(request.body)
      const agent = agentRegistry.findBestAgentForTask(capabilities, preferredSource)

      if (!agent) {
        return reply.code(404).send({
          error: 'No suitable agent found',
          capabilities,
          preferredSource
        })
      }

      return reply.send({
        agent,
        matchedCapabilities: capabilities,
        timestamp: new Date().toISOString()
      })
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.code(400).send({
          error: 'Invalid request',
          details: error.errors
        })
      }

      fastify.log.error('Failed to find agent:', error)
      return reply.code(500).send({
        error: 'Failed to find agent',
        details: error.message
      })
    }
  })

  /**
   * Execute task on agent with intelligent routing
   */
  fastify.post('/execute', {
    schema: {
      tags: ['AI Agents'],
      summary: 'Execute agent task',
      description: 'Execute a task on the most suitable agent with intelligent routing between Node.js and Go agents',
      security: [{ bearerAuth: [] }],
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const data = ExecuteTaskSchema.parse(request.body)
      let agentId = data.agentId

      // If no agentId provided, find best agent by type
      if (!agentId && data.agentType) {
        // Try to find agent by type
        const agents = agentRegistry.getAllAgents()
        const matchingAgent = agents.find(agent => 
          agent.type === data.agentType || agent.name.includes(data.agentType)
        )
        
        if (matchingAgent) {
          agentId = matchingAgent.id
        } else {
          return reply.code(404).send({
            error: `No agent found for type: ${data.agentType}`,
            availableTypes: agents.map(a => a.type)
          })
        }
      }

      if (!agentId) {
        return reply.code(400).send({
          error: 'Could not determine agent to use'
        })
      }

      const result = await agentRegistry.executeTask({
        agentId,
        task: data.task,
        parameters: data.parameters,
        priority: data.priority,
        timeout: data.timeout,
        requestId: data.requestId || `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      })

      const statusCode = result.success ? 200 : 500
      return reply.code(statusCode).send(result)
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.code(400).send({
          error: 'Invalid request',
          details: error.errors
        })
      }

      fastify.log.error('Failed to execute task:', error)
      return reply.code(500).send({
        error: 'Failed to execute task',
        details: error.message
      })
    }
  })

  /**
   * Get agents by capability
   */
  fastify.get('/capability/:capability', {
    schema: {
      tags: ['AI Agents'],
      summary: 'Get agents by capability',
      description: 'Find all agents that support a specific capability',
      security: [{ bearerAuth: [] }],
    },
  }, async (request: FastifyRequest<{
    Params: { capability: string }
  }>, reply: FastifyReply) => {
    try {
      const { capability } = request.params
      const agents = agentRegistry.getAgentsByCapability(capability)

      return reply.send({
        capability,
        agents,
        count: agents.length,
        timestamp: new Date().toISOString()
      })
    } catch (error) {
      fastify.log.error('Failed to get agents by capability:', error)
      return reply.code(500).send({
        error: 'Failed to retrieve agents by capability',
        details: error.message
      })
    }
  })

  /**
   * Get comprehensive agent statistics
   */
  fastify.get('/stats', {
    schema: {
      tags: ['AI Agents'],
      summary: 'Get agent statistics',
      description: 'Get comprehensive statistics about the agent system',
      security: [{ bearerAuth: [] }],
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const statistics = agentRegistry.getStatistics()
      const healthCheck = await agentRegistry.healthCheck()

      return reply.send({
        statistics,
        health: healthCheck,
        timestamp: new Date().toISOString()
      })
    } catch (error) {
      fastify.log.error('Failed to get agent statistics:', error)
      return reply.code(500).send({
        error: 'Failed to retrieve statistics',
        details: error.message
      })
    }
  })

  /**
   * Force synchronization of agents from all sources
   */
  fastify.post('/sync', {
    schema: {
      tags: ['AI Agents'],
      summary: 'Sync agents',
      description: 'Force synchronization of agents from Node.js and Go services',
      security: [{ bearerAuth: [] }],
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await agentRegistry.syncAgents()
      const statistics = agentRegistry.getStatistics()

      return reply.send({
        message: 'Agents synchronized successfully',
        statistics,
        timestamp: new Date().toISOString()
      })
    } catch (error) {
      fastify.log.error('Failed to sync agents:', error)
      return reply.code(500).send({
        error: 'Failed to synchronize agents',
        details: error.message
      })
    }
  })

  /**
   * Health check for agent registry system
   */
  fastify.get('/health', {
    schema: {
      tags: ['AI Agents'],
      summary: 'Agent system health',
      description: 'Check the health status of the unified agent system',
      security: [{ bearerAuth: [] }],
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const health = await agentRegistry.healthCheck()
      const statusCode = health.status === 'healthy' ? 200 : 
                        health.status === 'degraded' ? 206 : 503

      return reply.code(statusCode).send({
        ...health,
        timestamp: new Date().toISOString()
      })
    } catch (error) {
      fastify.log.error('Agent registry health check failed:', error)
      return reply.code(503).send({
        status: 'unhealthy',
        error: 'Health check failed',
        details: error.message,
        timestamp: new Date().toISOString()
      })
    }
  })

  // Cleanup on server close
  fastify.addHook('onClose', async () => {
    agentRegistry.cleanup()
    await prisma.$disconnect()
  })
}