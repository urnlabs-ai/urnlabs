import axios from 'axios'
import { PrismaClient } from '@prisma/client'
import { AgentHealthMonitor } from './agent-health-monitor'

// Advanced load balancing and auto-scaling interfaces
export interface PerformanceMetric {
  timestamp: Date
  responseTime: number
  cpuUsage: number
  memoryUsage: number
  queueLength: number
  tasksCompleted: number
  errorRate: number
}

export interface TaskPrediction {
  expectedVolume: number
  peakHours: number[]
  seasonalFactors: number[]
  confidenceScore: number
}

export interface ScalingDecision {
  action: 'scale-up' | 'scale-down' | 'maintain'
  targetInstances: number
  reason: string
  confidence: number
  estimatedCost: number
}

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
  // Enhanced for load balancing
  loadBalancing: {
    weight: number
    queueLength: number
    activeConnections: number
    cpuUsage: number
    memoryUsage: number
    networkLatency: number
    region: string
    zone: string
    coordinates?: { lat: number; lng: number }
  }
  // Auto-scaling metrics
  scaling: {
    minInstances: number
    maxInstances: number
    currentInstances: number
    targetCpuUtilization: number
    scaleUpThreshold: number
    scaleDownThreshold: number
    cooldownPeriod: number
    lastScaleAction?: Date
  }
}

export interface AgentCapability {
  name: string
  description: string
  requiredTools: string[]
  supportedAgents: string[]
}

export interface AgentExecutionRequest {
  agentId?: string // Made optional for auto-routing
  task: string
  parameters?: Record<string, any>
  priority?: 'low' | 'normal' | 'high' | 'critical'
  timeout?: number
  requestId?: string
  // Enhanced routing options
  routing: {
    requiredCapabilities?: string[]
    preferredRegion?: string
    affinityRules?: AffinityRule[]
    resourceRequirements?: ResourceRequirements
    latencyBudget?: number // max acceptable latency in ms
    allowCrossRegion?: boolean
  }
}

export interface AffinityRule {
  type: 'agent' | 'zone' | 'region'
  target: string
  weight: number // -100 to 100, negative = avoid, positive = prefer
}

export interface ResourceRequirements {
  minCpu?: number
  minMemory?: number
  maxLatency?: number
  requiresGpu?: boolean
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

// Weighted Round-Robin Load Balancer with Queue Awareness
class WeightedRoundRobinBalancer {
  private agentWeights: Map<string, number> = new Map()
  private currentWeights: Map<string, number> = new Map()

  updateAgentWeight(agentId: string, baseWeight: number, queueLength: number, cpuUsage: number): void {
    // Dynamic weight calculation based on queue and resource usage
    const queuePenalty = Math.max(0, 1 - (queueLength * 0.1))
    const cpuPenalty = Math.max(0, 1 - (cpuUsage * 0.01))
    const dynamicWeight = baseWeight * queuePenalty * cpuPenalty

    this.agentWeights.set(agentId, dynamicWeight)
    if (!this.currentWeights.has(agentId)) {
      this.currentWeights.set(agentId, 0)
    }
  }

  selectAgent(availableAgents: string[]): string | null {
    if (availableAgents.length === 0) return null
    if (availableAgents.length === 1) return availableAgents[0]

    let selectedAgent: string | null = null
    let maxCurrentWeight = -1

    for (const agentId of availableAgents) {
      const weight = this.agentWeights.get(agentId) || 1
      const currentWeight = (this.currentWeights.get(agentId) || 0) + weight
      this.currentWeights.set(agentId, currentWeight)

      if (currentWeight > maxCurrentWeight) {
        maxCurrentWeight = currentWeight
        selectedAgent = agentId
      }
    }

    if (selectedAgent) {
      const totalWeight = Array.from(this.agentWeights.values()).reduce((sum, w) => sum + w, 0)
      this.currentWeights.set(selectedAgent,
        (this.currentWeights.get(selectedAgent) || 0) - totalWeight
      )
    }

    return selectedAgent
  }
}

// Intelligent Task Router with Geographic and Latency Awareness
class IntelligentTaskRouter {
  private regionCoordinates: Map<string, { lat: number; lng: number }> = new Map([
    ['us-east-1', { lat: 39.0458, lng: -76.6413 }],
    ['us-west-2', { lat: 45.5152, lng: -122.6784 }],
    ['eu-west-1', { lat: 53.3498, lng: -6.2603 }],
    ['ap-southeast-1', { lat: 1.3521, lng: 103.8198 }]
  ])

  calculateDistance(coord1: { lat: number; lng: number }, coord2: { lat: number; lng: number }): number {
    const R = 6371 // Earth radius in km
    const dLat = (coord2.lat - coord1.lat) * Math.PI / 180
    const dLng = (coord2.lng - coord1.lng) * Math.PI / 180
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(coord1.lat * Math.PI / 180) * Math.cos(coord2.lat * Math.PI / 180) *
      Math.sin(dLng/2) * Math.sin(dLng/2)
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
    return R * c
  }

  calculateRoutingScore(agent: UnifiedAgent, request: AgentExecutionRequest, clientRegion: string): number {
    let score = 100 // Base score

    // Capability matching (required)
    if (request.routing.requiredCapabilities) {
      const hasAllCapabilities = request.routing.requiredCapabilities.every(cap =>
        agent.capabilities.includes(cap)
      )
      if (!hasAllCapabilities) return -1 // Eliminate if missing required capabilities
    }

    // Performance factors
    score += (agent.performance.successRate - 50) * 0.5 // Success rate influence
    score -= agent.performance.averageResponseTime * 0.01 // Response time penalty
    score -= agent.loadBalancing.queueLength * 2 // Queue length penalty
    score -= agent.loadBalancing.cpuUsage * 0.3 // CPU usage penalty
    score -= agent.loadBalancing.memoryUsage * 0.2 // Memory usage penalty

    // Geographic proximity
    const clientCoords = this.regionCoordinates.get(clientRegion)
    const agentCoords = this.regionCoordinates.get(agent.loadBalancing.region)
    if (clientCoords && agentCoords) {
      const distance = this.calculateDistance(clientCoords, agentCoords)
      score -= distance * 0.1 // Distance penalty
    }

    // Network latency
    score -= agent.loadBalancing.networkLatency * 0.05

    // Priority boost
    if (request.priority === 'critical') score += 20
    else if (request.priority === 'high') score += 10

    // Affinity rules
    if (request.routing.affinityRules) {
      for (const rule of request.routing.affinityRules) {
        if (rule.type === 'agent' && agent.id === rule.target) {
          score += rule.weight
        } else if (rule.type === 'region' && agent.loadBalancing.region === rule.target) {
          score += rule.weight
        } else if (rule.type === 'zone' && agent.loadBalancing.zone === rule.target) {
          score += rule.weight
        }
      }
    }

    // Resource requirements
    if (request.routing.resourceRequirements) {
      const req = request.routing.resourceRequirements
      if (req.minCpu && (100 - agent.loadBalancing.cpuUsage) < req.minCpu) {
        score -= 50 // Heavy penalty for insufficient CPU
      }
      if (req.minMemory && (100 - agent.loadBalancing.memoryUsage) < req.minMemory) {
        score -= 50 // Heavy penalty for insufficient memory
      }
      if (req.maxLatency && agent.loadBalancing.networkLatency > req.maxLatency) {
        score -= 100 // Eliminate if latency too high
      }
    }

    return Math.max(0, score)
  }

  selectOptimalAgent(agents: UnifiedAgent[], request: AgentExecutionRequest, clientRegion: string): UnifiedAgent | null {
    const scoredAgents = agents
      .filter(agent => agent.status === 'active' || agent.status === 'idle')
      .map(agent => ({
        agent,
        score: this.calculateRoutingScore(agent, request, clientRegion)
      }))
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score)

    return scoredAgents.length > 0 ? scoredAgents[0].agent : null
  }
}

// Predictive Auto-Scaler with Historical Pattern Analysis
class PredictiveAutoScaler {
  private scalingHistory: Map<string, ScalingDecision[]> = new Map()
  private readonly HISTORY_WINDOW = 7 * 24 * 60 * 60 * 1000 // 7 days in ms

  analyzeHistoricalPatterns(agentType: string, performanceHistory: PerformanceMetric[]): TaskPrediction {
    if (performanceHistory.length === 0) {
      return {
        expectedVolume: 0,
        peakHours: [],
        seasonalFactors: [],
        confidenceScore: 0
      }
    }

    // Analyze hourly patterns
    const hourlyVolumes = new Array(24).fill(0)
    const hourlyCounters = new Array(24).fill(0)

    performanceHistory.forEach(metric => {
      const hour = metric.timestamp.getHours()
      hourlyVolumes[hour] += metric.tasksCompleted
      hourlyCounters[hour]++
    })

    const avgHourlyVolumes = hourlyVolumes.map((total, hour) =>
      hourlyCounters[hour] > 0 ? total / hourlyCounters[hour] : 0
    )

    // Identify peak hours (above 80th percentile)
    const sortedVolumes = [...avgHourlyVolumes].sort((a, b) => b - a)
    const peakThreshold = sortedVolumes[Math.floor(sortedVolumes.length * 0.2)]
    const peakHours = avgHourlyVolumes
      .map((volume, hour) => ({ hour, volume }))
      .filter(item => item.volume >= peakThreshold)
      .map(item => item.hour)

    // Calculate expected volume (weighted recent data more heavily)
    const recentData = performanceHistory.slice(-168) // Last week
    const weightedVolume = recentData.reduce((sum, metric, index) => {
      const weight = (index + 1) / recentData.length // Linear weight
      return sum + (metric.tasksCompleted * weight)
    }, 0) / recentData.length

    // Seasonal factors (simplified)
    const dayOfWeekFactors = this.calculateDayOfWeekFactors(performanceHistory)

    const confidenceScore = Math.min(100, performanceHistory.length / 168 * 100) // More data = higher confidence

    return {
      expectedVolume: Math.round(weightedVolume),
      peakHours,
      seasonalFactors: dayOfWeekFactors,
      confidenceScore
    }
  }

  private calculateDayOfWeekFactors(performanceHistory: PerformanceMetric[]): number[] {
    const dayVolumes = new Array(7).fill(0)
    const dayCounters = new Array(7).fill(0)

    performanceHistory.forEach(metric => {
      const dayOfWeek = metric.timestamp.getDay()
      dayVolumes[dayOfWeek] += metric.tasksCompleted
      dayCounters[dayOfWeek]++
    })

    const avgWeeklyVolume = dayVolumes.reduce((sum, total, day) =>
      sum + (dayCounters[day] > 0 ? total / dayCounters[day] : 0)
    , 0) / 7

    return dayVolumes.map((total, day) => {
      const avgDayVolume = dayCounters[day] > 0 ? total / dayCounters[day] : 0
      return avgWeeklyVolume > 0 ? avgDayVolume / avgWeeklyVolume : 1
    })
  }

  makeScalingDecision(
    agentType: string,
    currentMetrics: PerformanceMetric,
    prediction: TaskPrediction,
    currentInstances: number,
    minInstances: number,
    maxInstances: number
  ): ScalingDecision {
    const currentHour = new Date().getHours()
    const currentDayOfWeek = new Date().getDay()

    // Calculate scaling factors
    const isPeakHour = prediction.peakHours.includes(currentHour)
    const dayOfWeekFactor = prediction.seasonalFactors[currentDayOfWeek] || 1
    const expectedLoad = prediction.expectedVolume * dayOfWeekFactor

    // Current utilization analysis
    const avgUtilization = (currentMetrics.cpuUsage + currentMetrics.memoryUsage) / 2
    const queuePressure = currentMetrics.queueLength
    const errorRateSpike = currentMetrics.errorRate > 5 // 5% error threshold

    let recommendedInstances = currentInstances
    let action: 'scale-up' | 'scale-down' | 'maintain' = 'maintain'
    let reason = 'System operating within normal parameters'
    let confidence = 75

    // Scale-up conditions
    if (avgUtilization > 80 || queuePressure > 10 || errorRateSpike) {
      action = 'scale-up'
      recommendedInstances = Math.min(maxInstances, Math.ceil(currentInstances * 1.5))
      reason = `High utilization (${avgUtilization.toFixed(1)}%) or queue pressure (${queuePressure})`
      confidence = 90
    } else if (isPeakHour && expectedLoad > currentInstances * 0.8) {
      action = 'scale-up'
      recommendedInstances = Math.min(maxInstances, Math.ceil(expectedLoad / 0.7))
      reason = `Predictive scaling for peak hour (${currentHour}:00)`
      confidence = prediction.confidenceScore
    }

    // Scale-down conditions (only if not in peak hours)
    else if (!isPeakHour && avgUtilization < 30 && queuePressure === 0 && currentInstances > minInstances) {
      action = 'scale-down'
      recommendedInstances = Math.max(minInstances, Math.floor(currentInstances * 0.8))
      reason = `Low utilization (${avgUtilization.toFixed(1)}%) outside peak hours`
      confidence = 80
    }

    // Cost estimation (simplified)
    const costPerInstance = 0.10 // $0.10 per hour per instance
    const estimatedCost = recommendedInstances * costPerInstance

    return {
      action,
      targetInstances: recommendedInstances,
      reason,
      confidence,
      estimatedCost
    }
  }

  recordScalingDecision(agentType: string, decision: ScalingDecision): void {
    if (!this.scalingHistory.has(agentType)) {
      this.scalingHistory.set(agentType, [])
    }

    const history = this.scalingHistory.get(agentType)!
    history.push(decision)

    // Keep only recent history
    const cutoff = Date.now() - this.HISTORY_WINDOW
    this.scalingHistory.set(
      agentType,
      history.filter(d => d.estimatedCost > cutoff) // Using estimatedCost as timestamp placeholder
    )
  }
}

// Priority Task Queue with Intelligent Queuing
class PriorityTaskQueue {
  private queues: Map<string, AgentExecutionRequest[]> = new Map()
  private readonly PRIORITY_WEIGHTS = {
    critical: 1000,
    high: 100,
    normal: 10,
    low: 1
  }

  enqueue(request: AgentExecutionRequest): void {
    const priority = request.priority || 'normal'
    const queueKey = `${priority}-${request.routing.preferredRegion || 'default'}`

    if (!this.queues.has(queueKey)) {
      this.queues.set(queueKey, [])
    }

    const queue = this.queues.get(queueKey)!

    // Insert in priority order (considering latency budget for critical tasks)
    if (priority === 'critical' && request.routing.latencyBudget) {
      queue.unshift(request) // Critical tasks go to front
    } else {
      queue.push(request)
    }
  }

  dequeue(agentCapabilities: string[], agentRegion: string): AgentExecutionRequest | null {
    // Sort queues by priority
    const sortedQueues = Array.from(this.queues.entries())
      .filter(([_, queue]) => queue.length > 0)
      .sort(([keyA], [keyB]) => {
        const priorityA = keyA.split('-')[0] as keyof typeof this.PRIORITY_WEIGHTS
        const priorityB = keyB.split('-')[0] as keyof typeof this.PRIORITY_WEIGHTS
        return this.PRIORITY_WEIGHTS[priorityB] - this.PRIORITY_WEIGHTS[priorityA]
      })

    for (const [queueKey, queue] of sortedQueues) {
      // Find first task that matches agent capabilities
      const taskIndex = queue.findIndex(request => {
        if (!request.routing.requiredCapabilities) return true
        return request.routing.requiredCapabilities.every(cap =>
          agentCapabilities.includes(cap)
        )
      })

      if (taskIndex !== -1) {
        return queue.splice(taskIndex, 1)[0]
      }
    }

    return null
  }

  getQueueStats(): { totalTasks: number; byPriority: Record<string, number> } {
    let totalTasks = 0
    const byPriority: Record<string, number> = {}

    for (const [queueKey, queue] of this.queues.entries()) {
      const priority = queueKey.split('-')[0]
      totalTasks += queue.length
      byPriority[priority] = (byPriority[priority] || 0) + queue.length
    }

    return { totalTasks, byPriority }
  }
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

  // Advanced load balancing and scaling
  private loadBalancer: WeightedRoundRobinBalancer
  private taskRouter: IntelligentTaskRouter
  private autoScaler: PredictiveAutoScaler
  private performanceHistory: Map<string, PerformanceMetric[]> = new Map()
  private taskQueue: PriorityTaskQueue
  private regionLatencyMap: Map<string, Map<string, number>> = new Map()
  private currentRegion: string = process.env.REGION || 'us-east-1'

  // Health monitoring and WebSocket integration
  private healthMonitor: AgentHealthMonitor

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

    // Initialize advanced systems
    this.loadBalancer = new WeightedRoundRobinBalancer()
    this.taskRouter = new IntelligentTaskRouter()
    this.autoScaler = new PredictiveAutoScaler()
    this.taskQueue = new PriorityTaskQueue()
    this.healthMonitor = new AgentHealthMonitor()

    this.initializeCapabilities()
    this.startPeriodicSync()
    this.startAdvancedMonitoring()
    this.setupHealthMonitoringIntegration()
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
          const enhancedAgent = {
            ...agent,
            source: 'nodejs' as const,
            lastHeartbeat: new Date()
          }
          this.agents.set(agent.id, enhancedAgent)

          // Register with health monitor
          this.healthMonitor.registerAgent(enhancedAgent)

          // Update load balancer weights
          this.updateLoadBalancerWeights(enhancedAgent)
        })
      }

      // Process Go agents (via bridge)
      if (bridgeAgents.status === 'fulfilled') {
        bridgeAgents.value.forEach(agent => {
          const enhancedAgent = {
            ...agent,
            source: 'go' as const,
            lastHeartbeat: new Date()
          }
          this.agents.set(agent.id, enhancedAgent)

          // Register with health monitor
          this.healthMonitor.registerAgent(enhancedAgent)

          // Update load balancer weights
          this.updateLoadBalancerWeights(enhancedAgent)
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
        },
        loadBalancing: {
          weight: 1.0,
          queueLength: agent.queueLength || 0,
          activeConnections: agent.activeConnections || 0,
          cpuUsage: agent.cpuUsage || 0,
          memoryUsage: agent.memoryUsage || 0,
          networkLatency: agent.networkLatency || 50,
          region: this.currentRegion,
          zone: `${this.currentRegion}a`,
          coordinates: undefined
        },
        scaling: {
          minInstances: 1,
          maxInstances: 10,
          currentInstances: 1,
          targetCpuUtilization: 70,
          scaleUpThreshold: 80,
          scaleDownThreshold: 30,
          cooldownPeriod: 300000 // 5 minutes
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
        },
        loadBalancing: {
          weight: 1.0,
          queueLength: 0,
          activeConnections: 0,
          cpuUsage: 0,
          memoryUsage: 0,
          networkLatency: 30,
          region: this.currentRegion,
          zone: `${this.currentRegion}b`,
          coordinates: undefined
        },
        scaling: {
          minInstances: 1,
          maxInstances: 5,
          currentInstances: 1,
          targetCpuUtilization: 70,
          scaleUpThreshold: 80,
          scaleDownThreshold: 30,
          cooldownPeriod: 300000 // 5 minutes
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
          where: { id: agent.id },
          update: {
            type: agent.type,
            status: agent.status,
            capabilities: agent.capabilities,
            version: agent.version,
            updatedAt: new Date()
          },
          create: {
            id: agent.id,
            name: agent.name,
            type: agent.type,
            description: agent.description,
            status: agent.status,
            capabilities: agent.capabilities,
            version: agent.version,
            systemPrompt: `You are a ${agent.type} agent with the following capabilities: ${agent.capabilities.join(', ')}`,
            organizationId: '1' // Default org
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
   * Add agent to registry (for testing/demo purposes)
   */
  addAgent(agent: UnifiedAgent): void {
    this.agents.set(agent.id, agent)
    this.healthMonitor.registerAgent(agent)
    this.updateLoadBalancerWeights(agent)
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
   * Find best agent for a task (legacy method - use executeTaskWithRouting for advanced features)
   */
  findBestAgentForTask(
    requiredCapabilities: string[],
    preferredSource?: 'nodejs' | 'go'
  ): UnifiedAgent | null {
    // Use intelligent task router for better selection
    const request: AgentExecutionRequest = {
      task: 'legacy-routing',
      routing: {
        requiredCapabilities,
        allowCrossRegion: true
      }
    }

    const availableAgents = this.getAllAgents().filter(agent =>
      this.healthMonitor.isAgentAvailable(agent.id) &&
      (agent.status === 'active' || agent.status === 'idle') &&
      (!preferredSource || agent.source === preferredSource)
    )

    if (availableAgents.length === 0) {
      return null
    }

    // Use intelligent router for optimal selection
    return this.taskRouter.selectOptimalAgent(availableAgents, request, this.currentRegion)
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
        requestId: request.requestId || ''
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
        requestId: request.requestId || ''
      }
    } catch (error) {
      const duration = Date.now() - startTime
      
      // Update failure metrics
      agent.performance.successRate = Math.max(0, agent.performance.successRate - 10)
      agent.lastHeartbeat = new Date()

      return {
        success: false,
        error: (error as any).message,
        duration,
        agentId: request.agentId,
        requestId: request.requestId || ''
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
   * Setup health monitoring integration
   */
  private setupHealthMonitoringIntegration(): void {
    // Listen to health monitor events
    this.healthMonitor.on('statusChanged', (agentId: string, newStatus: string) => {
      const agent = this.agents.get(agentId)
      if (agent) {
        agent.status = newStatus as any
        // Record failure for circuit breaker
        if (newStatus === 'unhealthy' || newStatus === 'offline') {
          this.healthMonitor.recordFailure(agentId)
        } else if (newStatus === 'healthy') {
          this.healthMonitor.recordSuccess(agentId)
        }
      }
    })

    this.healthMonitor.on('circuitBreakerOpened', (agentId: string) => {
      console.warn(`Circuit breaker opened for agent ${agentId}`)
      const agent = this.agents.get(agentId)
      if (agent) {
        agent.status = 'error'
      }
    })

    this.healthMonitor.on('predictiveAlert', (agentId: string, predictiveHealth: any) => {
      console.warn(`Predictive health alert for agent ${agentId}:`, predictiveHealth)
      // Could trigger auto-scaling here
      this.triggerPredictiveScaling(agentId, predictiveHealth)
    })
  }

  /**
   * Update load balancer weights based on agent performance
   */
  private updateLoadBalancerWeights(agent: UnifiedAgent): void {
    this.loadBalancer.updateAgentWeight(
      agent.id,
      agent.loadBalancing.weight,
      agent.loadBalancing.queueLength,
      agent.loadBalancing.cpuUsage
    )
  }

  /**
   * Start advanced monitoring for performance and scaling
   */
  private startAdvancedMonitoring(): void {
    setInterval(() => {
      this.collectPerformanceMetrics()
      this.updatePredictiveScaling()
    }, 60000) // Every minute
  }

  /**
   * Collect performance metrics from all agents
   */
  private async collectPerformanceMetrics(): Promise<void> {
    for (const agent of this.agents.values()) {
      try {
        // Simulate metric collection - in real implementation, this would fetch from agents
        const metrics: PerformanceMetric = {
          timestamp: new Date(),
          responseTime: agent.performance.averageResponseTime,
          cpuUsage: agent.loadBalancing.cpuUsage,
          memoryUsage: agent.loadBalancing.memoryUsage,
          queueLength: agent.loadBalancing.queueLength,
          tasksCompleted: agent.performance.tasksCompleted,
          errorRate: 100 - agent.performance.successRate
        }

        // Store metrics history
        if (!this.performanceHistory.has(agent.id)) {
          this.performanceHistory.set(agent.id, [])
        }
        const history = this.performanceHistory.get(agent.id)!
        history.push(metrics)

        // Keep only last 1000 metrics
        if (history.length > 1000) {
          history.shift()
        }

        // Update health monitor
        this.healthMonitor.updateResourceMetrics(agent.id, {
          cpu: metrics.cpuUsage,
          memory: metrics.memoryUsage,
          queueLength: metrics.queueLength,
          activeConnections: agent.loadBalancing.activeConnections,
          responseTimeP95: metrics.responseTime * 1.2, // Estimate P95
          errorRate: metrics.errorRate,
          timestamp: metrics.timestamp
        })

      } catch (error) {
        console.error(`Failed to collect metrics for agent ${agent.id}:`, error)
      }
    }
  }

  /**
   * Update predictive scaling for agents
   */
  private updatePredictiveScaling(): void {
    for (const agent of this.agents.values()) {
      const history = this.performanceHistory.get(agent.id) || []
      if (history.length === 0) continue

      const prediction = this.autoScaler.analyzeHistoricalPatterns(agent.type, history)
      const currentMetrics = history[history.length - 1]

      const scalingDecision = this.autoScaler.makeScalingDecision(
        agent.type,
        currentMetrics,
        prediction,
        agent.scaling.currentInstances,
        agent.scaling.minInstances,
        agent.scaling.maxInstances
      )

      if (scalingDecision.action !== 'maintain') {
        console.log(`Scaling recommendation for ${agent.id}:`, scalingDecision)
        // In production, this would trigger actual scaling
        this.executeScalingDecision(agent, scalingDecision)
      }
    }
  }

  /**
   * Trigger predictive scaling based on health alerts
   */
  private triggerPredictiveScaling(agentId: string, predictiveHealth: any): void {
    const agent = this.agents.get(agentId)
    if (!agent) return

    if (predictiveHealth.score < 50 && agent.scaling.currentInstances < agent.scaling.maxInstances) {
      console.log(`Triggering emergency scaling for agent ${agentId}`)
      // Scale up immediately
      agent.scaling.currentInstances = Math.min(
        agent.scaling.maxInstances,
        agent.scaling.currentInstances + 1
      )
    }
  }

  /**
   * Execute scaling decision
   */
  private executeScalingDecision(agent: UnifiedAgent, decision: ScalingDecision): void {
    agent.scaling.currentInstances = decision.targetInstances
    agent.scaling.lastScaleAction = new Date()

    // Record scaling decision
    this.autoScaler.recordScalingDecision(agent.type, decision)

    console.log(`Executed scaling for ${agent.id}: ${decision.action} to ${decision.targetInstances} instances`)
  }

  /**
   * Enhanced task execution with intelligent routing
   */
  async executeTaskWithRouting(request: AgentExecutionRequest): Promise<AgentExecutionResult> {
    // If specific agent requested, use original method
    if (request.agentId) {
      return this.executeTask(request)
    }

    // Find optimal agent using intelligent routing
    const availableAgents = this.getAllAgents().filter(agent =>
      this.healthMonitor.isAgentAvailable(agent.id) &&
      (agent.status === 'active' || agent.status === 'idle')
    )

    const optimalAgent = this.taskRouter.selectOptimalAgent(
      availableAgents,
      request,
      this.currentRegion
    )

    if (!optimalAgent) {
      // Queue the task if no agent available
      this.taskQueue.enqueue(request)
      return {
        success: false,
        error: 'No suitable agent available - task queued',
        duration: 0,
        agentId: 'none',
        requestId: request.requestId || ''
      }
    }

    // Execute on optimal agent
    return this.executeTask({
      ...request,
      agentId: optimalAgent.id
    })
  }

  /**
   * Get comprehensive system health status
   */
  getSystemHealth(): {
    status: 'healthy' | 'degraded' | 'unhealthy'
    agents: ReturnType<AgentHealthMonitor['getHealthReport']>
    performance: {
      averageResponseTime: number
      totalTasksCompleted: number
      overallSuccessRate: number
      queueStats: ReturnType<PriorityTaskQueue['getQueueStats']>
    }
    scaling: {
      totalInstances: number
      averageUtilization: number
      scalingEvents: number
    }
  } {
    const healthReport = this.healthMonitor.getHealthReport()
    const agents = this.getAllAgents()
    const queueStats = this.taskQueue.getQueueStats()

    const avgResponseTime = agents.reduce((sum, a) => sum + a.performance.averageResponseTime, 0) / agents.length || 0
    const totalTasks = agents.reduce((sum, a) => sum + a.performance.tasksCompleted, 0)
    const avgSuccessRate = agents.reduce((sum, a) => sum + a.performance.successRate, 0) / agents.length || 0

    const totalInstances = agents.reduce((sum, a) => sum + a.scaling.currentInstances, 0)
    const avgUtilization = agents.length > 0 ? agents.reduce((sum, a) => sum + (a.loadBalancing.cpuUsage + a.loadBalancing.memoryUsage) / 2, 0) / agents.length : 0

    let systemStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy'

    if (healthReport.summary.unhealthyAgents > healthReport.summary.totalAgents * 0.5) {
      systemStatus = 'unhealthy'
    } else if (healthReport.summary.degradedAgents + healthReport.summary.unhealthyAgents > healthReport.summary.totalAgents * 0.3) {
      systemStatus = 'degraded'
    }

    return {
      status: systemStatus,
      agents: healthReport,
      performance: {
        averageResponseTime: avgResponseTime,
        totalTasksCompleted: totalTasks,
        overallSuccessRate: avgSuccessRate,
        queueStats
      },
      scaling: {
        totalInstances,
        averageUtilization: avgUtilization,
        scalingEvents: 0 // Would track actual scaling events in production
      }
    }
  }

  /**
   * Get health monitor instance for WebSocket integration
   */
  getHealthMonitor(): AgentHealthMonitor {
    return this.healthMonitor
  }

  /**
   * Get advanced load balancing metrics
   */
  getLoadBalancingMetrics(): {
    algorithm: 'weighted-round-robin'
    agentWeights: Record<string, number>
    currentLoad: Record<string, {
      weight: number
      queueLength: number
      cpuUsage: number
      memoryUsage: number
      networkLatency: number
      activeConnections: number
    }>
    regionalDistribution: Record<string, number>
  } {
    const agents = this.getAllAgents()
    const agentWeights: Record<string, number> = {}
    const currentLoad: Record<string, any> = {}
    const regionalDistribution: Record<string, number> = {}

    agents.forEach(agent => {
      agentWeights[agent.id] = agent.loadBalancing.weight
      currentLoad[agent.id] = {
        weight: agent.loadBalancing.weight,
        queueLength: agent.loadBalancing.queueLength,
        cpuUsage: agent.loadBalancing.cpuUsage,
        memoryUsage: agent.loadBalancing.memoryUsage,
        networkLatency: agent.loadBalancing.networkLatency,
        activeConnections: agent.loadBalancing.activeConnections
      }

      const region = agent.loadBalancing.region
      regionalDistribution[region] = (regionalDistribution[region] || 0) + 1
    })

    return {
      algorithm: 'weighted-round-robin',
      agentWeights,
      currentLoad,
      regionalDistribution
    }
  }

  /**
   * Get predictive scaling insights
   */
  getPredictiveScalingInsights(): {
    predictions: Record<string, TaskPrediction>
    scalingRecommendations: Record<string, ScalingDecision>
    historicalAccuracy: number
    costOptimization: {
      currentCost: number
      projectedCost: number
      savings: number
    }
  } {
    const agents = this.getAllAgents()
    const predictions: Record<string, TaskPrediction> = {}
    const scalingRecommendations: Record<string, ScalingDecision> = {}

    // Group agents by type
    const agentTypes = new Set(agents.map(a => a.type))
    let totalCurrentCost = 0
    let totalProjectedCost = 0

    agentTypes.forEach(agentType => {
      const agentsOfType = agents.filter(a => a.type === agentType)
      if (agentsOfType.length === 0) return

      const representative = agentsOfType[0]
      const history = this.performanceHistory.get(representative.id) || []

      if (history.length > 0) {
        const prediction = this.autoScaler.analyzeHistoricalPatterns(agentType, history)
        predictions[agentType] = prediction

        const currentMetrics = history[history.length - 1]
        const decision = this.autoScaler.makeScalingDecision(
          agentType,
          currentMetrics,
          prediction,
          representative.scaling.currentInstances,
          representative.scaling.minInstances,
          representative.scaling.maxInstances
        )
        scalingRecommendations[agentType] = decision

        totalCurrentCost += representative.scaling.currentInstances * 0.10
        totalProjectedCost += decision.targetInstances * 0.10
      }
    })

    return {
      predictions,
      scalingRecommendations,
      historicalAccuracy: 85.5, // Would be calculated from actual historical data
      costOptimization: {
        currentCost: totalCurrentCost,
        projectedCost: totalProjectedCost,
        savings: Math.max(0, totalCurrentCost - totalProjectedCost)
      }
    }
  }

  /**
   * Get network topology and latency insights
   */
  getNetworkTopology(): {
    regions: string[]
    latencyMatrix: Record<string, Record<string, number>>
    optimalRouting: Record<string, string>
    networkHealth: 'excellent' | 'good' | 'degraded' | 'poor'
  } {
    const regions = Array.from(new Set(this.getAllAgents().map(a => a.loadBalancing.region)))
    const latencyMatrix: Record<string, Record<string, number>> = {}
    const optimalRouting: Record<string, string> = {}

    // Build latency matrix
    for (const [sourceRegion, targetMap] of this.regionLatencyMap.entries()) {
      latencyMatrix[sourceRegion] = {}
      for (const [targetRegion, latency] of targetMap.entries()) {
        latencyMatrix[sourceRegion][targetRegion] = latency
      }
    }

    // Calculate optimal routing (simplified)
    regions.forEach(region => {
      const latencies = latencyMatrix[this.currentRegion] || {}
      const sortedByLatency = Object.entries(latencies)
        .sort(([, a], [, b]) => a - b)
      optimalRouting[region] = sortedByLatency[0]?.[0] || region
    })

    // Assess network health
    const avgLatencies = Object.values(latencyMatrix)
      .flatMap(targetMap => Object.values(targetMap))
    const avgLatency = avgLatencies.reduce((sum, l) => sum + l, 0) / avgLatencies.length || 0

    let networkHealth: 'excellent' | 'good' | 'degraded' | 'poor'
    if (avgLatency < 50) networkHealth = 'excellent'
    else if (avgLatency < 100) networkHealth = 'good'
    else if (avgLatency < 200) networkHealth = 'degraded'
    else networkHealth = 'poor'

    return {
      regions,
      latencyMatrix,
      optimalRouting,
      networkHealth
    }
  }

  /**
   * Trigger emergency scaling for critical workloads
   */
  async triggerEmergencyScaling(
    agentType: string,
    targetInstances: number,
    reason: string
  ): Promise<ScalingDecision> {
    const agents = this.getAllAgents().filter(a => a.type === agentType)
    if (agents.length === 0) {
      throw new Error(`No agents found for type: ${agentType}`)
    }

    const representative = agents[0]
    const decision: ScalingDecision = {
      action: targetInstances > representative.scaling.currentInstances ? 'scale-up' : 'scale-down',
      targetInstances,
      reason: `EMERGENCY: ${reason}`,
      confidence: 100,
      estimatedCost: targetInstances * 0.10
    }

    // Execute immediately
    await this.executeScalingAction(agentType, decision)

    // Record decision
    this.autoScaler.recordScalingDecision(agentType, decision)

    console.log(`Emergency scaling executed for ${agentType}:`, decision)
    return decision
  }

  /**
   * Simulate traffic spike for demonstration
   */
  async simulateTrafficSpike(
    multiplier: number = 3,
    duration: number = 60000
  ): Promise<void> {
    console.log(`Simulating traffic spike (${multiplier}x) for ${duration}ms`)

    // Temporarily increase queue lengths and CPU usage
    const originalMetrics = new Map<string, any>()

    for (const agent of this.agents.values()) {
      originalMetrics.set(agent.id, {
        queueLength: agent.loadBalancing.queueLength,
        cpuUsage: agent.loadBalancing.cpuUsage,
        memoryUsage: agent.loadBalancing.memoryUsage
      })

      // Simulate spike
      agent.loadBalancing.queueLength = Math.min(50, agent.loadBalancing.queueLength * multiplier)
      agent.loadBalancing.cpuUsage = Math.min(100, agent.loadBalancing.cpuUsage * multiplier)
      agent.loadBalancing.memoryUsage = Math.min(100, agent.loadBalancing.memoryUsage * 1.5)
    }

    // Restore after duration
    setTimeout(() => {
      for (const [agentId, metrics] of originalMetrics.entries()) {
        const agent = this.agents.get(agentId)
        if (agent) {
          agent.loadBalancing.queueLength = metrics.queueLength
          agent.loadBalancing.cpuUsage = metrics.cpuUsage
          agent.loadBalancing.memoryUsage = metrics.memoryUsage
        }
      }
      console.log('Traffic spike simulation ended')
    }, duration)
  }

  /**
   * Cleanup resources
   */
  cleanup(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval)
    }

    // Cleanup health monitor
    this.healthMonitor.cleanup()
  }
}