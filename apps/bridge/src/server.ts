import Fastify from 'fastify'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import websocket from '@fastify/websocket'
import { z } from 'zod'
import axios from 'axios'
import Redis from 'ioredis'
import { MaestroService } from './services/maestro-service.js'
import { AgentOrchestrator } from './services/agent-orchestrator.js'
import { MetricsCollector } from './services/metrics-collector.js'
import { WebSocketManager } from './services/websocket-manager.js'

const server = Fastify({
  logger: {
    level: process.env.LOG_LEVEL || 'info',
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'HH:MM:ss Z',
        ignore: 'pid,hostname'
      }
    }
  }
})

// Configuration
const config = {
  port: parseInt(process.env.BRIDGE_PORT || '3002'),
  nodeApiEndpoint: process.env.API_ENDPOINT || 'http://localhost:3000',
  nodeAgentsEndpoint: process.env.AGENTS_ENDPOINT || 'http://localhost:3001',
  maestroEndpoint: process.env.MAESTRO_ENDPOINT || 'http://localhost:8081',
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379'
}

// Initialize services
const redis = new Redis(config.redisUrl)
const maestroService = new MaestroService(config.maestroEndpoint)
const agentOrchestrator = new AgentOrchestrator(config.nodeAgentsEndpoint, maestroService)
const metricsCollector = new MetricsCollector(redis)
const wsManager = new WebSocketManager()

// Register plugins
await server.register(cors, {
  origin: true,
  credentials: true
})

await server.register(helmet, {
  contentSecurityPolicy: false
})

await server.register(websocket)

// WebSocket connection for real-time updates
server.register(async function (fastify) {
  fastify.get('/ws', { websocket: true }, (connection, req) => {
    wsManager.addConnection(connection)
    
    connection.on('close', () => {
      wsManager.removeConnection(connection)
    })
    
    connection.on('message', async (message) => {
      try {
        const data = JSON.parse(message.toString())
        await wsManager.handleMessage(connection, data)
      } catch (error) {
        server.log.error('WebSocket message error:', error)
      }
    })
  })
})

// Health check endpoint
server.get('/health', async (request, reply) => {
  try {
    // Check all service connections
    const [nodeApiHealth, nodeAgentsHealth, maestroHealth, redisHealth] = await Promise.allSettled([
      axios.get(`${config.nodeApiEndpoint}/health`, { timeout: 5000 }),
      axios.get(`${config.nodeAgentsEndpoint}/health`, { timeout: 5000 }),
      axios.get(`${config.maestroEndpoint}/health`, { timeout: 5000 }),
      redis.ping()
    ])

    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      services: {
        nodeApi: nodeApiHealth.status === 'fulfilled' ? 'healthy' : 'unhealthy',
        nodeAgents: nodeAgentsHealth.status === 'fulfilled' ? 'healthy' : 'unhealthy',
        maestro: maestroHealth.status === 'fulfilled' ? 'healthy' : 'unhealthy',
        redis: redisHealth.status === 'fulfilled' ? 'healthy' : 'unhealthy'
      }
    }

    const overallHealthy = Object.values(health.services).every(status => status === 'healthy')
    health.status = overallHealthy ? 'healthy' : 'degraded'

    return reply.code(overallHealthy ? 200 : 503).send(health)
  } catch (error) {
    server.log.error('Health check failed:', error)
    return reply.code(503).send({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error.message
    })
  }
})

// Unified agent listing - combines Node.js and Go agents
server.get('/agents', async (request, reply) => {
  try {
    const [nodeAgents, goAgents] = await Promise.allSettled([
      axios.get(`${config.nodeAgentsEndpoint}/agents`),
      maestroService.getAgents()
    ])

    const combinedAgents = {
      nodejs: nodeAgents.status === 'fulfilled' ? nodeAgents.value.data : [],
      go: goAgents.status === 'fulfilled' ? goAgents.value : [],
      total: 0
    }

    combinedAgents.total = (combinedAgents.nodejs?.length || 0) + (combinedAgents.go?.length || 0)

    return reply.send(combinedAgents)
  } catch (error) {
    server.log.error('Failed to fetch agents:', error)
    return reply.code(500).send({ error: 'Failed to fetch agents' })
  }
})

// Execute agent task with intelligent routing
const ExecuteTaskSchema = z.object({
  agentType: z.string(),
  task: z.string(),
  parameters: z.record(z.any()).optional(),
  priority: z.enum(['low', 'normal', 'high']).default('normal'),
  timeout: z.number().min(1000).max(300000).default(60000)
})

server.post('/agents/execute', async (request, reply) => {
  try {
    const { agentType, task, parameters, priority, timeout } = ExecuteTaskSchema.parse(request.body)

    // Route task to appropriate agent service
    const result = await agentOrchestrator.executeTask({
      agentType,
      task,
      parameters,
      priority,
      timeout
    })

    // Broadcast task execution to WebSocket clients
    wsManager.broadcast({
      type: 'task_executed',
      data: {
        agentType,
        task,
        result,
        timestamp: new Date().toISOString()
      }
    })

    // Record metrics
    await metricsCollector.recordTaskExecution(agentType, result.success, result.duration)

    return reply.send(result)
  } catch (error) {
    server.log.error('Task execution failed:', error)
    return reply.code(500).send({ error: 'Task execution failed', details: error.message })
  }
})

// Get system metrics from all services
server.get('/metrics', async (request, reply) => {
  try {
    const [bridgeMetrics, maestroMetrics, agentMetrics] = await Promise.allSettled([
      metricsCollector.getMetrics(),
      maestroService.getMetrics(),
      axios.get(`${config.nodeAgentsEndpoint}/metrics`)
    ])

    const metrics = {
      bridge: bridgeMetrics.status === 'fulfilled' ? bridgeMetrics.value : {},
      maestro: maestroMetrics.status === 'fulfilled' ? maestroMetrics.value : {},
      agents: agentMetrics.status === 'fulfilled' ? agentMetrics.value.data : {},
      timestamp: new Date().toISOString()
    }

    return reply.send(metrics)
  } catch (error) {
    server.log.error('Failed to collect metrics:', error)
    return reply.code(500).send({ error: 'Failed to collect metrics' })
  }
})

// Real-time agent status
server.get('/status', async (request, reply) => {
  try {
    const status = await agentOrchestrator.getSystemStatus()
    return reply.send(status)
  } catch (error) {
    server.log.error('Failed to get system status:', error)
    return reply.code(500).send({ error: 'Failed to get system status' })
  }
})

// Workflow management endpoints
server.post('/workflows/execute', async (request, reply) => {
  try {
    const WorkflowSchema = z.object({
      name: z.string(),
      steps: z.array(z.object({
        agentType: z.string(),
        task: z.string(),
        parameters: z.record(z.any()).optional()
      })),
      parallel: z.boolean().default(false)
    })

    const workflow = WorkflowSchema.parse(request.body)
    const result = await agentOrchestrator.executeWorkflow(workflow)

    wsManager.broadcast({
      type: 'workflow_executed',
      data: {
        workflow: workflow.name,
        result,
        timestamp: new Date().toISOString()
      }
    })

    return reply.send(result)
  } catch (error) {
    server.log.error('Workflow execution failed:', error)
    return reply.code(500).send({ error: 'Workflow execution failed', details: error.message })
  }
})

// Graceful shutdown
process.on('SIGTERM', async () => {
  server.log.info('SIGTERM received, shutting down gracefully')
  await redis.quit()
  await server.close()
})

// Start server
const start = async () => {
  try {
    await server.listen({ 
      port: config.port, 
      host: '0.0.0.0' 
    })
    
    server.log.info(`🌉 Bridge Service running on port ${config.port}`)
    server.log.info(`🔗 Connected to:`)
    server.log.info(`   - Node.js API: ${config.nodeApiEndpoint}`)
    server.log.info(`   - Node.js Agents: ${config.nodeAgentsEndpoint}`)
    server.log.info(`   - Go URN-MAESTRO: ${config.maestroEndpoint}`)
    server.log.info(`   - Redis: ${config.redisUrl}`)
  } catch (error) {
    server.log.error(error)
    process.exit(1)
  }
}

start()