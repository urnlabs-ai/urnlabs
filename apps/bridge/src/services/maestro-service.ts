import axios, { AxiosInstance } from 'axios'

export interface GoAgent {
  name: string
  type: string
  description: string
  version: string
  capabilities: string[]
  tools: string[]
  status: 'active' | 'idle' | 'busy' | 'error'
}

export interface TaskRequest {
  agentType: string
  task: string
  parameters?: Record<string, any>
  timeout?: number
}

export interface TaskResult {
  success: boolean
  result?: any
  error?: string
  duration: number
  agentUsed: string
  metadata?: Record<string, any>
}

export interface SystemMetrics {
  totalAgents: number
  activeAgents: number
  tasksExecuted: number
  averageResponseTime: number
  errorRate: number
  systemLoad: number
  memory: {
    used: number
    total: number
  }
  uptime: number
}

export class MaestroService {
  private client: AxiosInstance
  private baseUrl: string

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl
    this.client = axios.create({
      baseURL: baseUrl,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Urnlabs-Bridge/1.0.0'
      }
    })

    // Response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        console.error(`Maestro Service Error [${error.config?.method?.toUpperCase()} ${error.config?.url}]:`, {
          status: error.response?.status,
          statusText: error.response?.statusText,
          data: error.response?.data,
          message: error.message
        })
        throw error
      }
    )
  }

  /**
   * Get all available Go agents from URN-MAESTRO
   */
  async getAgents(): Promise<GoAgent[]> {
    try {
      const response = await this.client.get('/api/agents')
      return response.data.agents || []
    } catch (error) {
      console.error('Failed to fetch Go agents:', error)
      return []
    }
  }

  /**
   * Get specific agent information
   */
  async getAgent(agentType: string): Promise<GoAgent | null> {
    try {
      const response = await this.client.get(`/api/agents/${agentType}`)
      return response.data
    } catch (error) {
      console.error(`Failed to fetch agent ${agentType}:`, error)
      return null
    }
  }

  /**
   * Execute a task using URN-MAESTRO agents
   */
  async executeTask(request: TaskRequest): Promise<TaskResult> {
    const startTime = Date.now()
    
    try {
      const response = await this.client.post('/api/tasks/execute', {
        agent_type: request.agentType,
        task: request.task,
        parameters: request.parameters || {},
        timeout: request.timeout || 60000
      })

      const duration = Date.now() - startTime

      return {
        success: response.data.success || true,
        result: response.data.result,
        duration,
        agentUsed: request.agentType,
        metadata: {
          responseTime: duration,
          timestamp: new Date().toISOString(),
          maestroVersion: response.data.version
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
          responseTime: duration,
          timestamp: new Date().toISOString(),
          errorCode: error.response?.status
        }
      }
    }
  }

  /**
   * Get system metrics from URN-MAESTRO
   */
  async getMetrics(): Promise<SystemMetrics> {
    try {
      const response = await this.client.get('/metrics')
      
      // Parse Prometheus metrics or structured response
      const data = response.data
      
      return {
        totalAgents: data.total_agents || 0,
        activeAgents: data.active_agents || 0,
        tasksExecuted: data.tasks_executed || 0,
        averageResponseTime: data.avg_response_time || 0,
        errorRate: data.error_rate || 0,
        systemLoad: data.system_load || 0,
        memory: {
          used: data.memory_used || 0,
          total: data.memory_total || 0
        },
        uptime: data.uptime || 0
      }
    } catch (error) {
      console.error('Failed to fetch maestro metrics:', error)
      return {
        totalAgents: 0,
        activeAgents: 0,
        tasksExecuted: 0,
        averageResponseTime: 0,
        errorRate: 0,
        systemLoad: 0,
        memory: { used: 0, total: 0 },
        uptime: 0
      }
    }
  }

  /**
   * Get health status from URN-MAESTRO
   */
  async getHealth(): Promise<{ status: string; details?: any }> {
    try {
      const response = await this.client.get('/health')
      return {
        status: response.data.status || 'unknown',
        details: response.data
      }
    } catch (error) {
      return {
        status: 'unhealthy',
        details: { error: error.message }
      }
    }
  }

  /**
   * Get available tools from URN-MAESTRO
   */
  async getTools(): Promise<any[]> {
    try {
      const response = await this.client.get('/api/tools')
      return response.data.tools || []
    } catch (error) {
      console.error('Failed to fetch tools:', error)
      return []
    }
  }

  /**
   * Execute a workflow in URN-MAESTRO
   */
  async executeWorkflow(workflow: {
    name: string
    steps: Array<{
      agentType: string
      task: string
      parameters?: Record<string, any>
    }>
    parallel?: boolean
  }): Promise<TaskResult> {
    const startTime = Date.now()
    
    try {
      const response = await this.client.post('/api/workflows/execute', {
        name: workflow.name,
        steps: workflow.steps.map(step => ({
          agent_type: step.agentType,
          task: step.task,
          parameters: step.parameters || {}
        })),
        parallel: workflow.parallel || false
      })

      const duration = Date.now() - startTime

      return {
        success: response.data.success || true,
        result: response.data.result,
        duration,
        agentUsed: 'workflow',
        metadata: {
          workflowName: workflow.name,
          stepsExecuted: workflow.steps.length,
          parallel: workflow.parallel,
          timestamp: new Date().toISOString()
        }
      }
    } catch (error) {
      const duration = Date.now() - startTime
      
      return {
        success: false,
        error: error.response?.data?.error || error.message,
        duration,
        agentUsed: 'workflow',
        metadata: {
          workflowName: workflow.name,
          failedAt: error.response?.data?.failed_at || 'unknown',
          timestamp: new Date().toISOString()
        }
      }
    }
  }

  /**
   * Get real-time status updates
   */
  async getStatus(): Promise<{
    agents: Record<string, { status: string; lastActivity: string }>
    system: { load: number; memory: number; uptime: number }
    tasks: { running: number; queued: number; completed: number }
  }> {
    try {
      const response = await this.client.get('/api/status')
      return response.data
    } catch (error) {
      console.error('Failed to get maestro status:', error)
      return {
        agents: {},
        system: { load: 0, memory: 0, uptime: 0 },
        tasks: { running: 0, queued: 0, completed: 0 }
      }
    }
  }

  /**
   * Check if URN-MAESTRO service is reachable
   */
  async isHealthy(): Promise<boolean> {
    try {
      const response = await this.client.get('/health', { timeout: 5000 })
      return response.status === 200 && response.data.status === 'healthy'
    } catch (error) {
      return false
    }
  }
}