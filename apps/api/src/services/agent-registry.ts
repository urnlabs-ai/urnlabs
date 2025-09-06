import axios from 'axios'
import { PrismaClient } from '@prisma/client'

export interface UnifiedAgent {
  id: string
  name: string
  type: string
  source: 'nodejs' | 'go'
  status: 'active' | 'idle' | 'busy' | 'error' | 'offline'
  description: string
  capabilities: string[]
  tools: string[]
  version: string
  endpoint?: string
  lastHeartbeat: Date
  metadata: Record<string, any>
  performance: {
    tasksCompleted: number
    averageResponseTime: number
    successRate: number
    lastUsed?: Date
  }
}

export interface AgentCapability {
  name: string
  description: string
  requiredTools: string[]
  supportedAgents: string[]
}

export interface AgentExecutionRequest {
  agentId: string
  task: string
  parameters?: Record<string, any>
  priority?: 'low' | 'normal' | 'high'
  timeout?: number
  requestId?: string
}

export interface AgentExecutionResult {
  success: boolean
  result?: any
  error?: string
  duration: number
  agentId: string
  requestId?: string
  metadata?: Record<string, any>
}

export class UnifiedAgentRegistry {
  private prisma: PrismaClient
  private agents = new Map<string, UnifiedAgent>()
  private capabilities = new Map<string, AgentCapability>()
  private nodeAgentsEndpoint: string
  private bridgeEndpoint: string
  private maestroEndpoint: string
  private lastSync: Date = new Date(0)
  private syncInterval: NodeJS.Timeout | null = null

  constructor(
    prisma: PrismaClient,
    nodeAgentsEndpoint: string = process.env.NODE_AGENT_ENDPOINT || 'http://localhost:3001',
    bridgeEndpoint: string = process.env.BRIDGE_ENDPOINT || 'http://localhost:3002',
    maestroEndpoint: string = process.env.URN_MAESTRO_ENDPOINT || 'http://localhost:8081'
  ) {
    this.prisma = prisma
    this.nodeAgentsEndpoint = nodeAgentsEndpoint
    this.bridgeEndpoint = bridgeEndpoint
    this.maestroEndpoint = maestroEndpoint
    
    this.initializeCapabilities()
    this.startPeriodicSync()
  }

  /**
   * Initialize predefined capabilities for different agent types
   */
  private initializeCapabilities() {
    const capabilities: AgentCapability[] = [
      {
        name: 'code-review',
        description: 'Review code for quality, security, and best practices',
        requiredTools: ['git', 'static-analysis'],
        supportedAgents: ['code-reviewer']
      },
      {
        name: 'infrastructure-deployment',
        description: 'Deploy and manage infrastructure resources',
        requiredTools: ['docker', 'kubernetes', 'terraform'],
        supportedAgents: ['devops', 'kubernetes', 'terraform']
      },
      {
        name: 'security-audit',
        description: 'Perform comprehensive security audits and vulnerability scans',
        requiredTools: ['security-scanner', 'owasp-zap', 'snyk'],
        supportedAgents: ['security-auditor', 'qa']
      },
      {
        name: 'performance-testing',
        description: 'Execute performance tests and analyze bottlenecks',
        requiredTools: ['loadtesting', 'profiling'],
        supportedAgents: ['performance', 'qa', 'testing']
      },
      {
        name: 'incident-response',
        description: 'Handle incidents and automate response procedures',
        requiredTools: ['monitoring', 'alerting', 'runbook'],
        supportedAgents: ['sre', 'devops']
      },
      {
        name: 'documentation-generation',
        description: 'Generate and maintain technical documentation',
        requiredTools: ['markdown', 'api-docs'],
        supportedAgents: ['doc-generator', 'architecture']
      },
      {
        name: 'ai-code-generation',
        description: 'Generate code using AI assistance',
        requiredTools: ['ai-provider', 'code-analysis'],
        supportedAgents: ['code-generator', 'architecture']
      }
    ]

    capabilities.forEach(capability => {
      this.capabilities.set(capability.name, capability)
    })
  }

  /**
   * Start periodic synchronization with agent services
   */
  private startPeriodicSync() {
    this.syncInterval = setInterval(async () => {
      await this.syncAgents()
    }, 30000) // Sync every 30 seconds

    // Initial sync
    this.syncAgents().catch(console.error)
  }

  /**
   * Synchronize agents from all services
   */
  async syncAgents(): Promise<void> {
    try {
      const [nodeAgents, bridgeAgents] = await Promise.allSettled([
        this.fetchNodeAgents(),
        this.fetchBridgeAgents()
      ])

      // Process Node.js agents
      if (nodeAgents.status === 'fulfilled') {
        nodeAgents.value.forEach(agent => {
          this.agents.set(agent.id, {
            ...agent,
            source: 'nodejs',
            lastHeartbeat: new Date()
          })
        })
      }

      // Process Go agents (via bridge)
      if (bridgeAgents.status === 'fulfilled') {
        bridgeAgents.value.forEach(agent => {
          this.agents.set(agent.id, {
            ...agent,
            source: 'go',
            lastHeartbeat: new Date()
          })
        })
      }

      // Update database
      await this.updateAgentDatabase()
      
      this.lastSync = new Date()
      console.log(`Agent registry synced: ${this.agents.size} agents`)
    } catch (error) {
      console.error('Failed to sync agents:', error)
    }
  }

  /**
   * Fetch agents from Node.js service
   */
  private async fetchNodeAgents(): Promise<UnifiedAgent[]> {
    try {
      const response = await axios.get(`${this.nodeAgentsEndpoint}/agents`, { timeout: 10000 })
      const agents = response.data.agents || []
      
      return agents.map((agent: any) => ({
        id: `nodejs-${agent.name}`,
        name: agent.name,
        type: agent.type,
        source: 'nodejs',
        status: agent.status || 'idle',
        description: agent.description || `Node.js ${agent.type} agent`,
        capabilities: agent.capabilities || [],
        tools: agent.tools || [],
        version: agent.version || '1.0.0',
        endpoint: this.nodeAgentsEndpoint,
        lastHeartbeat: new Date(),
        metadata: { runtime: 'nodejs' },
        performance: {
          tasksCompleted: agent.tasksCompleted || 0,
          averageResponseTime: agent.averageResponseTime || 0,
          successRate: agent.successRate || 100,
          lastUsed: agent.lastUsed ? new Date(agent.lastUsed) : undefined
        }
      }))
    } catch (error) {
      console.error('Failed to fetch Node.js agents:', error)
      return []
    }
  }

  /**
   * Fetch agents from bridge service (which aggregates Go agents)
   */
  private async fetchBridgeAgents(): Promise<UnifiedAgent[]> {
    try {
      const response = await axios.get(`${this.bridgeEndpoint}/agents`, { timeout: 10000 })
      const goAgents = response.data.go || []
      
      return goAgents.map((agent: any) => ({
        id: `go-${agent.name}`,
        name: agent.name,
        type: agent.type,
        source: 'go',
        status: agent.status || 'idle',
        description: agent.description || `Go ${agent.type} agent`,
        capabilities: agent.capabilities || [],
        tools: agent.tools || [],
        version: agent.version || '1.0.0',
        endpoint: this.maestroEndpoint,
        lastHeartbeat: new Date(),
        metadata: { runtime: 'go', service: 'urn-maestro' },
        performance: {
          tasksCompleted: 0,
          averageResponseTime: 0,
          successRate: 100
        }
      }))
    } catch (error) {
      console.error('Failed to fetch Go agents via bridge:', error)
      return []
    }
  }

  /**
   * Update agent information in database
   */
  private async updateAgentDatabase(): Promise<void> {
    try {
      for (const agent of this.agents.values()) {
        await this.prisma.agent.upsert({
          where: { name: agent.name },
          update: {
            type: agent.type,
            status: agent.status,
            capabilities: agent.capabilities,
            version: agent.version,
            lastHeartbeat: agent.lastHeartbeat,
            metadata: agent.metadata,
            updatedAt: new Date()
          },
          create: {
            name: agent.name,
            type: agent.type,
            description: agent.description,
            status: agent.status,
            capabilities: agent.capabilities,
            version: agent.version,
            endpoint: agent.endpoint,
            lastHeartbeat: agent.lastHeartbeat,
            metadata: agent.metadata,
            organizationId: 1 // Default org
          }
        })
      }
    } catch (error) {
      console.error('Failed to update agent database:', error)
    }
  }

  /**
   * Get all agents
   */
  getAllAgents(): UnifiedAgent[] {
    return Array.from(this.agents.values())
  }

  /**
   * Get agents by source
   */
  getAgentsBySource(source: 'nodejs' | 'go'): UnifiedAgent[] {
    return this.getAllAgents().filter(agent => agent.source === source)
  }

  /**
   * Get agents by capability
   */
  getAgentsByCapability(capability: string): UnifiedAgent[] {
    return this.getAllAgents().filter(agent => 
      agent.capabilities.includes(capability)
    )
  }

  /**
   * Get agent by ID
   */
  getAgent(id: string): UnifiedAgent | null {
    return this.agents.get(id) || null
  }

  /**
   * Find best agent for a task
   */
  findBestAgentForTask(
    requiredCapabilities: string[],
    preferredSource?: 'nodejs' | 'go'
  ): UnifiedAgent | null {
    const availableAgents = this.getAllAgents().filter(agent => 
      agent.status === 'active' || agent.status === 'idle'
    )

    // Filter by capabilities
    const capableAgents = availableAgents.filter(agent =>
      requiredCapabilities.every(cap => agent.capabilities.includes(cap))
    )

    if (capableAgents.length === 0) {
      return null
    }

    // Sort by preference and performance
    const sortedAgents = capableAgents.sort((a, b) => {
      // Prefer specified source
      if (preferredSource) {
        if (a.source === preferredSource && b.source !== preferredSource) return -1
        if (b.source === preferredSource && a.source !== preferredSource) return 1
      }

      // Then by success rate
      if (a.performance.successRate !== b.performance.successRate) {
        return b.performance.successRate - a.performance.successRate
      }

      // Then by average response time (lower is better)
      return a.performance.averageResponseTime - b.performance.averageResponseTime
    })

    return sortedAgents[0]
  }

  /**
   * Execute task on specific agent
   */
  async executeTask(request: AgentExecutionRequest): Promise<AgentExecutionResult> {
    const agent = this.getAgent(request.agentId)
    if (!agent) {
      return {
        success: false,
        error: `Agent ${request.agentId} not found`,
        duration: 0,
        agentId: request.agentId,
        requestId: request.requestId
      }
    }

    const startTime = Date.now()

    try {
      let result: any

      if (agent.source === 'nodejs') {
        result = await this.executeNodeTask(request)
      } else {
        result = await this.executeGoTask(request)
      }

      const duration = Date.now() - startTime

      // Update agent performance metrics
      agent.performance.tasksCompleted++
      agent.performance.averageResponseTime = 
        (agent.performance.averageResponseTime + duration) / 2
      agent.performance.lastUsed = new Date()
      agent.lastHeartbeat = new Date()

      if (result.success) {
        agent.performance.successRate = Math.min(100, agent.performance.successRate + 1)
      } else {
        agent.performance.successRate = Math.max(0, agent.performance.successRate - 5)
      }

      return {
        ...result,
        duration,
        agentId: request.agentId,
        requestId: request.requestId
      }
    } catch (error) {
      const duration = Date.now() - startTime
      
      // Update failure metrics
      agent.performance.successRate = Math.max(0, agent.performance.successRate - 10)
      agent.lastHeartbeat = new Date()

      return {
        success: false,
        error: error.message,
        duration,
        agentId: request.agentId,
        requestId: request.requestId
      }
    }
  }

  /**
   * Execute task on Node.js agent
   */
  private async executeNodeTask(request: AgentExecutionRequest): Promise<any> {
    const response = await axios.post(`${this.nodeAgentsEndpoint}/execute`, {
      agentType: request.agentId.replace('nodejs-', ''),
      task: request.task,
      parameters: request.parameters,
      priority: request.priority
    }, { timeout: request.timeout || 60000 })

    return response.data
  }

  /**
   * Execute task on Go agent via bridge
   */
  private async executeGoTask(request: AgentExecutionRequest): Promise<any> {
    const response = await axios.post(`${this.bridgeEndpoint}/agents/execute`, {
      agentType: request.agentId.replace('go-', ''),
      task: request.task,
      parameters: request.parameters,
      priority: request.priority,
      timeout: request.timeout
    }, { timeout: request.timeout || 60000 })

    return response.data
  }

  /**
   * Get system statistics
   */
  getStatistics(): {
    totalAgents: number
    nodeAgents: number
    goAgents: number
    activeAgents: number
    capabilities: string[]
    lastSync: Date
    averageResponseTime: number
    totalTasksCompleted: number
  } {
    const agents = this.getAllAgents()
    
    return {
      totalAgents: agents.length,
      nodeAgents: this.getAgentsBySource('nodejs').length,
      goAgents: this.getAgentsBySource('go').length,
      activeAgents: agents.filter(a => a.status === 'active' || a.status === 'idle').length,
      capabilities: Array.from(this.capabilities.keys()),
      lastSync: this.lastSync,
      averageResponseTime: agents.reduce((sum, a) => sum + a.performance.averageResponseTime, 0) / agents.length || 0,
      totalTasksCompleted: agents.reduce((sum, a) => sum + a.performance.tasksCompleted, 0)
    }
  }

  /**
   * Health check for the registry
   */
  async healthCheck(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy'
    details: {
      agentsResponding: number
      totalAgents: number
      lastSync: string
      errors: string[]
    }
  }> {
    const errors: string[] = []
    const agents = this.getAllAgents()
    const respondingAgents = agents.filter(a => 
      a.status !== 'error' && a.status !== 'offline'
    ).length

    if (agents.length === 0) {
      errors.push('No agents available')
    }

    const healthRatio = respondingAgents / agents.length
    let status: 'healthy' | 'degraded' | 'unhealthy'

    if (healthRatio >= 0.8) {
      status = 'healthy'
    } else if (healthRatio >= 0.5) {
      status = 'degraded'
      errors.push('Some agents are not responding')
    } else {
      status = 'unhealthy'
      errors.push('Most agents are not responding')
    }

    // Check sync age
    const syncAge = Date.now() - this.lastSync.getTime()
    if (syncAge > 120000) { // 2 minutes
      errors.push('Agent sync is stale')
      status = status === 'healthy' ? 'degraded' : status
    }

    return {
      status,
      details: {
        agentsResponding: respondingAgents,
        totalAgents: agents.length,
        lastSync: this.lastSync.toISOString(),
        errors
      }
    }
  }

  /**
   * Cleanup resources
   */
  cleanup(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval)
    }
  }
}