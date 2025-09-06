import axios, { AxiosInstance } from 'axios'
import { MaestroService, TaskRequest, TaskResult } from './maestro-service.js'

export interface AgentInfo {
  name: string
  type: string
  source: 'nodejs' | 'go'
  status: 'active' | 'idle' | 'busy' | 'error'
  capabilities: string[]
  lastActivity?: string
}

export interface ExecuteTaskRequest {
  agentType: string
  task: string
  parameters?: Record<string, any>
  priority?: 'low' | 'normal' | 'high'
  timeout?: number
}

export interface WorkflowStep {
  agentType: string
  task: string
  parameters?: Record<string, any>
}

export interface Workflow {
  name: string
  steps: WorkflowStep[]
  parallel?: boolean
}

export interface SystemStatus {
  totalAgents: number
  activeAgents: number
  nodeAgents: {
    total: number
    active: number
    agents: AgentInfo[]
  }
  goAgents: {
    total: number
    active: number
    agents: AgentInfo[]
  }
  runningTasks: number
  queuedTasks: number
  systemHealth: 'healthy' | 'degraded' | 'unhealthy'
}

export class AgentOrchestrator {
  private nodeClient: AxiosInstance
  private maestroService: MaestroService
  private agentMapping: Map<string, 'nodejs' | 'go'> = new Map()

  constructor(nodeAgentsEndpoint: string, maestroService: MaestroService) {
    this.nodeClient = axios.create({
      baseURL: nodeAgentsEndpoint,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json'
      }
    })
    
    this.maestroService = maestroService
    this.initializeAgentMapping()
  }

  /**
   * Initialize agent routing mapping
   */
  private initializeAgentMapping() {
    // Node.js agent mappings
    this.agentMapping.set('code-reviewer', 'nodejs')
    this.agentMapping.set('architecture', 'nodejs')
    this.agentMapping.set('testing', 'nodejs')
    this.agentMapping.set('deployment', 'nodejs')

    // Go agent mappings (URN-MAESTRO specialties)
    this.agentMapping.set('devops', 'go')
    this.agentMapping.set('sre', 'go')
    this.agentMapping.set('qa', 'go')
    this.agentMapping.set('security-auditor', 'go')
    this.agentMapping.set('performance', 'go')
    this.agentMapping.set('cloud-architect', 'go')
    this.agentMapping.set('kubernetes', 'go')
    this.agentMapping.set('terraform', 'go')
    this.agentMapping.set('compliance', 'go')
    this.agentMapping.set('data-engineer', 'go')
    this.agentMapping.set('ml-engineer', 'go')
    this.agentMapping.set('doc-generator', 'go')
    this.agentMapping.set('api-designer', 'go')
    this.agentMapping.set('cicd', 'go')
    this.agentMapping.set('ingest', 'go')
    this.agentMapping.set('project-manager', 'go')
    this.agentMapping.set('business-analyst', 'go')
    this.agentMapping.set('orchestrator', 'go')
    this.agentMapping.set('code-generator', 'go')
    this.agentMapping.set('code-optimizer', 'go')
    this.agentMapping.set('debugger', 'go')
    this.agentMapping.set('refactorer', 'go')
  }

  /**
   * Determine which service should handle the agent type
   */
  private getServiceForAgent(agentType: string): 'nodejs' | 'go' | 'auto' {
    const mapping = this.agentMapping.get(agentType.toLowerCase())
    if (mapping) {
      return mapping
    }
    
    // Auto-routing based on agent type patterns
    if (agentType.includes('code') || agentType.includes('review')) {
      return 'nodejs'
    }
    
    if (agentType.includes('devops') || agentType.includes('sre') || 
        agentType.includes('security') || agentType.includes('cloud')) {
      return 'go'
    }
    
    return 'auto'
  }

  /**
   * Execute a task with intelligent agent routing
   */
  async executeTask(request: ExecuteTaskRequest): Promise<TaskResult> {
    const service = this.getServiceForAgent(request.agentType)
    
    if (service === 'go') {
      return this.executeGoTask(request)
    } else if (service === 'nodejs') {
      return this.executeNodeTask(request)
    } else {
      // Auto-routing: try both services and use the first successful one
      return this.executeWithFallback(request)
    }
  }

  /**
   * Execute task using Go URN-MAESTRO service
   */
  private async executeGoTask(request: ExecuteTaskRequest): Promise<TaskResult> {
    const taskRequest: TaskRequest = {
      agentType: request.agentType,
      task: request.task,
      parameters: request.parameters,
      timeout: request.timeout
    }
    
    return this.maestroService.executeTask(taskRequest)
  }

  /**
   * Execute task using Node.js agent service
   */
  private async executeNodeTask(request: ExecuteTaskRequest): Promise<TaskResult> {
    const startTime = Date.now()
    
    try {
      const response = await this.nodeClient.post('/execute', {
        agentType: request.agentType,
        task: request.task,
        parameters: request.parameters || {},
        priority: request.priority || 'normal'
      })

      const duration = Date.now() - startTime

      return {
        success: response.data.success !== false,
        result: response.data.result,
        duration,
        agentUsed: request.agentType,
        metadata: {
          source: 'nodejs',
          responseTime: duration,
          timestamp: new Date().toISOString()
        }
      }
    } catch (error) {
      const duration = Date.now() - startTime
      
      return {
        success: false,
        error: error.response?.data?.error || error.message,
        duration,
        agentUsed: request.agentType,
        metadata: {
          source: 'nodejs',
          responseTime: duration,
          timestamp: new Date().toISOString(),
          errorCode: error.response?.status
        }
      }
    }
  }

  /**
   * Execute with fallback between services
   */
  private async executeWithFallback(request: ExecuteTaskRequest): Promise<TaskResult> {
    // Try Go service first (usually more comprehensive)
    try {
      const goResult = await this.executeGoTask(request)
      if (goResult.success) {
        return goResult
      }
    } catch (error) {
      console.log(`Go service failed for ${request.agentType}, trying Node.js...`)
    }

    // Fallback to Node.js service
    return this.executeNodeTask(request)
  }

  /**
   * Execute a workflow across multiple agents
   */
  async executeWorkflow(workflow: Workflow): Promise<TaskResult> {
    const startTime = Date.now()
    const results: TaskResult[] = []
    
    try {
      if (workflow.parallel) {
        // Execute steps in parallel
        const promises = workflow.steps.map(step => 
          this.executeTask({
            agentType: step.agentType,
            task: step.task,
            parameters: step.parameters
          })
        )
        
        const parallelResults = await Promise.allSettled(promises)
        
        for (const result of parallelResults) {
          if (result.status === 'fulfilled') {
            results.push(result.value)
          } else {
            results.push({
              success: false,
              error: result.reason.message,
              duration: 0,
              agentUsed: 'unknown'
            })
          }
        }
      } else {
        // Execute steps sequentially
        for (const step of workflow.steps) {
          const result = await this.executeTask({
            agentType: step.agentType,
            task: step.task,
            parameters: step.parameters
          })
          
          results.push(result)
          
          // Stop on first failure in sequential mode
          if (!result.success) {
            break
          }
        }
      }

      const duration = Date.now() - startTime
      const allSuccessful = results.every(r => r.success)
      
      return {
        success: allSuccessful,
        result: {
          workflowName: workflow.name,
          steps: results,
          summary: {
            totalSteps: workflow.steps.length,
            successfulSteps: results.filter(r => r.success).length,
            failedSteps: results.filter(r => !r.success).length
          }
        },
        duration,
        agentUsed: 'workflow',
        metadata: {
          parallel: workflow.parallel,
          stepCount: workflow.steps.length,
          timestamp: new Date().toISOString()
        }
      }
    } catch (error) {
      const duration = Date.now() - startTime
      
      return {
        success: false,
        error: `Workflow execution failed: ${error.message}`,
        duration,
        agentUsed: 'workflow',
        metadata: {
          workflowName: workflow.name,
          timestamp: new Date().toISOString()
        }
      }
    }
  }

  /**
   * Get comprehensive system status
   */
  async getSystemStatus(): Promise<SystemStatus> {
    try {
      const [nodeAgentsResponse, goAgents, maestroStatus] = await Promise.allSettled([
        this.nodeClient.get('/agents'),
        this.maestroService.getAgents(),
        this.maestroService.getStatus()
      ])

      // Process Node.js agents
      const nodeAgents: AgentInfo[] = []
      if (nodeAgentsResponse.status === 'fulfilled') {
        const agents = nodeAgentsResponse.value.data.agents || []
        agents.forEach(agent => {
          nodeAgents.push({
            name: agent.name,
            type: agent.type,
            source: 'nodejs',
            status: agent.status || 'idle',
            capabilities: agent.capabilities || [],
            lastActivity: agent.lastActivity
          })
        })
      }

      // Process Go agents
      const processedGoAgents: AgentInfo[] = []
      if (goAgents.status === 'fulfilled') {
        goAgents.value.forEach(agent => {
          processedGoAgents.push({
            name: agent.name,
            type: agent.type,
            source: 'go',
            status: agent.status || 'idle',
            capabilities: agent.capabilities || [],
            lastActivity: new Date().toISOString()
          })
        })
      }

      const totalAgents = nodeAgents.length + processedGoAgents.length
      const activeNodeAgents = nodeAgents.filter(a => a.status === 'active').length
      const activeGoAgents = processedGoAgents.filter(a => a.status === 'active').length
      const totalActiveAgents = activeNodeAgents + activeGoAgents

      // Determine system health
      let systemHealth: 'healthy' | 'degraded' | 'unhealthy' = 'healthy'
      if (totalAgents === 0) {
        systemHealth = 'unhealthy'
      } else if (totalActiveAgents < totalAgents * 0.5) {
        systemHealth = 'degraded'
      }

      return {
        totalAgents,
        activeAgents: totalActiveAgents,
        nodeAgents: {
          total: nodeAgents.length,
          active: activeNodeAgents,
          agents: nodeAgents
        },
        goAgents: {
          total: processedGoAgents.length,
          active: activeGoAgents,
          agents: processedGoAgents
        },
        runningTasks: maestroStatus.status === 'fulfilled' ? maestroStatus.value.tasks.running : 0,
        queuedTasks: maestroStatus.status === 'fulfilled' ? maestroStatus.value.tasks.queued : 0,
        systemHealth
      }
    } catch (error) {
      console.error('Failed to get system status:', error)
      
      return {
        totalAgents: 0,
        activeAgents: 0,
        nodeAgents: { total: 0, active: 0, agents: [] },
        goAgents: { total: 0, active: 0, agents: [] },
        runningTasks: 0,
        queuedTasks: 0,
        systemHealth: 'unhealthy'
      }
    }
  }

  /**
   * Get available agents from both services
   */
  async getAllAgents(): Promise<{ nodejs: AgentInfo[]; go: AgentInfo[] }> {
    try {
      const [nodeAgentsResponse, goAgents] = await Promise.allSettled([
        this.nodeClient.get('/agents'),
        this.maestroService.getAgents()
      ])

      const nodeAgents: AgentInfo[] = []
      const processedGoAgents: AgentInfo[] = []

      if (nodeAgentsResponse.status === 'fulfilled') {
        const agents = nodeAgentsResponse.value.data.agents || []
        agents.forEach(agent => {
          nodeAgents.push({
            name: agent.name,
            type: agent.type,
            source: 'nodejs',
            status: agent.status || 'idle',
            capabilities: agent.capabilities || []
          })
        })
      }

      if (goAgents.status === 'fulfilled') {
        goAgents.value.forEach(agent => {
          processedGoAgents.push({
            name: agent.name,
            type: agent.type,
            source: 'go',
            status: agent.status || 'idle',
            capabilities: agent.capabilities || []
          })
        })
      }

      return {
        nodejs: nodeAgents,
        go: processedGoAgents
      }
    } catch (error) {
      console.error('Failed to get all agents:', error)
      return { nodejs: [], go: [] }
    }
  }
}