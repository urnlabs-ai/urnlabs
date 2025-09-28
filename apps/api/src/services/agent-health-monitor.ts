import { EventEmitter } from 'events'
import WebSocket from 'ws'
import { UnifiedAgent } from './agent-registry'

export interface ResourceMetrics {
  cpu: number // CPU usage percentage (0-100)
  memory: number // Memory usage in MB
  queueLength: number // Number of pending tasks
  activeConnections: number // Number of active connections
  responseTimeP95: number // 95th percentile response time
  errorRate: number // Error rate percentage (0-100)
  timestamp: Date
}

export interface HealthMetrics {
  agentId: string
  status: 'healthy' | 'degraded' | 'unhealthy' | 'offline'
  resources: ResourceMetrics
  heartbeat: {
    lastBeat: Date
    interval: number // milliseconds
    missedBeats: number
  }
  predictiveHealth: {
    score: number // 0-100, higher is better
    trend: 'improving' | 'stable' | 'degrading'
    riskFactors: string[]
  }
}

export interface CircuitBreakerState {
  agentId: string
  state: 'closed' | 'open' | 'half-open'
  failureCount: number
  lastFailure?: Date
  nextRetry?: Date
  successCount: number
  threshold: number
}

export class AgentHealthMonitor extends EventEmitter {
  private healthMetrics = new Map<string, HealthMetrics>()
  private circuitBreakers = new Map<string, CircuitBreakerState>()
  private websocketConnections = new Map<string, WebSocket>()
  private heartbeatIntervals = new Map<string, NodeJS.Timeout>()
  private healthCheckInterval: NodeJS.Timeout
  private metricsHistory = new Map<string, ResourceMetrics[]>()

  private readonly HEARTBEAT_TIMEOUT = 60000 // 1 minute
  private readonly CIRCUIT_BREAKER_THRESHOLD = 5
  private readonly CIRCUIT_BREAKER_TIMEOUT = 30000 // 30 seconds
  private readonly HEALTH_CHECK_INTERVAL = 15000 // 15 seconds
  private readonly METRICS_RETENTION_COUNT = 100 // Keep last 100 metrics

  constructor() {
    super()
    this.startHealthChecks()
  }

  /**
   * Register an agent for health monitoring
   */
  registerAgent(agent: UnifiedAgent): void {
    const agentId = agent.id

    // Initialize health metrics
    this.healthMetrics.set(agentId, {
      agentId,
      status: agent.status === 'active' ? 'healthy' : 'offline',
      resources: {
        cpu: 0,
        memory: 0,
        queueLength: 0,
        activeConnections: 0,
        responseTimeP95: agent.performance.averageResponseTime,
        errorRate: 100 - agent.performance.successRate,
        timestamp: new Date()
      },
      heartbeat: {
        lastBeat: agent.lastHeartbeat,
        interval: 30000, // Default 30 seconds
        missedBeats: 0
      },
      predictiveHealth: {
        score: 85, // Default healthy score
        trend: 'stable',
        riskFactors: []
      }
    })

    // Initialize circuit breaker
    this.circuitBreakers.set(agentId, {
      agentId,
      state: 'closed',
      failureCount: 0,
      successCount: 0,
      threshold: this.CIRCUIT_BREAKER_THRESHOLD
    })

    // Initialize metrics history
    this.metricsHistory.set(agentId, [])

    // Set up WebSocket connection if agent has endpoint
    if (agent.endpoint) {
      this.setupWebSocketConnection(agent)
    }

    // Start heartbeat monitoring
    this.startHeartbeatMonitoring(agentId)

    this.emit('agentRegistered', agentId)
  }

  /**
   * Unregister an agent from health monitoring
   */
  unregisterAgent(agentId: string): void {
    // Clean up WebSocket connection
    const ws = this.websocketConnections.get(agentId)
    if (ws) {
      ws.close()
      this.websocketConnections.delete(agentId)
    }

    // Clean up heartbeat monitoring
    const interval = this.heartbeatIntervals.get(agentId)
    if (interval) {
      clearInterval(interval)
      this.heartbeatIntervals.delete(agentId)
    }

    // Remove all data
    this.healthMetrics.delete(agentId)
    this.circuitBreakers.delete(agentId)
    this.metricsHistory.delete(agentId)

    this.emit('agentUnregistered', agentId)
  }

  /**
   * Set up WebSocket connection for real-time monitoring
   */
  private setupWebSocketConnection(agent: UnifiedAgent): void {
    if (!agent.endpoint) return

    try {
      const wsUrl = agent.endpoint.replace('http', 'ws') + '/health-ws'
      const ws = new WebSocket(wsUrl)

      ws.on('open', () => {
        console.log(`WebSocket connected to agent ${agent.id}`)
        this.websocketConnections.set(agent.id, ws)

        // Request initial metrics
        ws.send(JSON.stringify({ type: 'requestMetrics' }))
      })

      ws.on('message', (data: string) => {
        try {
          const message = JSON.parse(data)
          this.handleWebSocketMessage(agent.id, message)
        } catch (error) {
          console.error(`Failed to parse WebSocket message from ${agent.id}:`, error)
        }
      })

      ws.on('close', () => {
        console.log(`WebSocket disconnected from agent ${agent.id}`)
        this.websocketConnections.delete(agent.id)
        this.updateAgentStatus(agent.id, 'offline')

        // Attempt to reconnect after delay
        setTimeout(() => {
          if (this.healthMetrics.has(agent.id)) {
            this.setupWebSocketConnection(agent)
          }
        }, 5000)
      })

      ws.on('error', (error) => {
        console.error(`WebSocket error for agent ${agent.id}:`, error)
        this.recordFailure(agent.id)
      })

    } catch (error) {
      console.error(`Failed to setup WebSocket for agent ${agent.id}:`, error)
    }
  }

  /**
   * Handle incoming WebSocket messages
   */
  private handleWebSocketMessage(agentId: string, message: any): void {
    switch (message.type) {
      case 'heartbeat':
        this.updateHeartbeat(agentId)
        break

      case 'metrics':
        this.updateResourceMetrics(agentId, message.data)
        break

      case 'status':
        this.updateAgentStatus(agentId, message.status)
        break

      case 'error':
        this.recordFailure(agentId, message.error)
        break
    }
  }

  /**
   * Start heartbeat monitoring for an agent
   */
  private startHeartbeatMonitoring(agentId: string): void {
    const interval = setInterval(() => {
      this.checkHeartbeat(agentId)
    }, this.HEARTBEAT_TIMEOUT / 2) // Check twice per timeout period

    this.heartbeatIntervals.set(agentId, interval)
  }

  /**
   * Check if agent heartbeat is healthy
   */
  private checkHeartbeat(agentId: string): void {
    const metrics = this.healthMetrics.get(agentId)
    if (!metrics) return

    const now = new Date()
    const timeSinceLastBeat = now.getTime() - metrics.heartbeat.lastBeat.getTime()

    if (timeSinceLastBeat > this.HEARTBEAT_TIMEOUT) {
      metrics.heartbeat.missedBeats++

      if (metrics.heartbeat.missedBeats >= 3) {
        this.updateAgentStatus(agentId, 'offline')
        this.recordFailure(agentId, 'Heartbeat timeout')
      } else if (metrics.heartbeat.missedBeats >= 2) {
        this.updateAgentStatus(agentId, 'degraded')
      }
    }
  }

  /**
   * Update agent heartbeat
   */
  updateHeartbeat(agentId: string): void {
    const metrics = this.healthMetrics.get(agentId)
    if (!metrics) return

    metrics.heartbeat.lastBeat = new Date()
    metrics.heartbeat.missedBeats = 0

    // If agent was offline, bring it back online
    if (metrics.status === 'offline') {
      this.updateAgentStatus(agentId, 'healthy')
    }

    this.recordSuccess(agentId)
  }

  /**
   * Update resource metrics for an agent
   */
  updateResourceMetrics(agentId: string, resources: Partial<ResourceMetrics>): void {
    const metrics = this.healthMetrics.get(agentId)
    if (!metrics) return

    // Update current metrics
    Object.assign(metrics.resources, {
      ...resources,
      timestamp: new Date()
    })

    // Store in history
    const history = this.metricsHistory.get(agentId) || []
    history.push({ ...metrics.resources })

    // Keep only recent metrics
    if (history.length > this.METRICS_RETENTION_COUNT) {
      history.shift()
    }

    this.metricsHistory.set(agentId, history)

    // Update predictive health based on metrics
    this.updatePredictiveHealth(agentId)

    this.emit('metricsUpdated', agentId, metrics.resources)
  }

  /**
   * Update agent status
   */
  private updateAgentStatus(agentId: string, status: HealthMetrics['status']): void {
    const metrics = this.healthMetrics.get(agentId)
    if (!metrics) return

    const oldStatus = metrics.status
    metrics.status = status

    if (oldStatus !== status) {
      this.emit('statusChanged', agentId, status, oldStatus)
    }
  }

  /**
   * Update predictive health analysis
   */
  private updatePredictiveHealth(agentId: string): void {
    const metrics = this.healthMetrics.get(agentId)
    const history = this.metricsHistory.get(agentId)
    if (!metrics || !history || history.length < 5) return

    const recent = history.slice(-10) // Last 10 metrics
    const riskFactors: string[] = []
    let healthScore = 100

    // Analyze CPU trend
    const cpuTrend = this.calculateTrend(recent.map(m => m.cpu))
    if (cpuTrend > 5 && recent[recent.length - 1].cpu > 80) {
      riskFactors.push('High CPU usage with increasing trend')
      healthScore -= 20
    }

    // Analyze memory trend
    const memoryTrend = this.calculateTrend(recent.map(m => m.memory))
    if (memoryTrend > 50 && recent[recent.length - 1].memory > 1000) {
      riskFactors.push('High memory usage with increasing trend')
      healthScore -= 15
    }

    // Analyze queue length
    const queueTrend = this.calculateTrend(recent.map(m => m.queueLength))
    if (queueTrend > 2 && recent[recent.length - 1].queueLength > 10) {
      riskFactors.push('Growing task queue')
      healthScore -= 10
    }

    // Analyze error rate
    const errorRateTrend = this.calculateTrend(recent.map(m => m.errorRate))
    if (errorRateTrend > 1 && recent[recent.length - 1].errorRate > 5) {
      riskFactors.push('Increasing error rate')
      healthScore -= 25
    }

    // Analyze response time
    const responseTimeTrend = this.calculateTrend(recent.map(m => m.responseTimeP95))
    if (responseTimeTrend > 100 && recent[recent.length - 1].responseTimeP95 > 5000) {
      riskFactors.push('Degrading response times')
      healthScore -= 15
    }

    // Determine overall trend
    let overallTrend: 'improving' | 'stable' | 'degrading' = 'stable'
    const trendSum = cpuTrend + memoryTrend + queueTrend + errorRateTrend + responseTimeTrend

    if (trendSum > 10) {
      overallTrend = 'degrading'
    } else if (trendSum < -5) {
      overallTrend = 'improving'
    }

    metrics.predictiveHealth = {
      score: Math.max(0, Math.min(100, healthScore)),
      trend: overallTrend,
      riskFactors
    }

    // Emit predictive alert if health is declining
    if (metrics.predictiveHealth.score < 60 && overallTrend === 'degrading') {
      this.emit('predictiveAlert', agentId, metrics.predictiveHealth)
    }
  }

  /**
   * Calculate trend from a series of values (positive = increasing)
   */
  private calculateTrend(values: number[]): number {
    if (values.length < 2) return 0

    const n = values.length
    const sumX = (n * (n - 1)) / 2
    const sumY = values.reduce((sum, val) => sum + val, 0)
    const sumXY = values.reduce((sum, val, index) => sum + (index * val), 0)
    const sumX2 = values.reduce((sum, _, index) => sum + (index * index), 0)

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX)
    return slope
  }

  /**
   * Record a successful operation
   */
  recordSuccess(agentId: string): void {
    const breaker = this.circuitBreakers.get(agentId)
    if (!breaker) return

    breaker.successCount++

    if (breaker.state === 'half-open' && breaker.successCount >= 3) {
      breaker.state = 'closed'
      breaker.failureCount = 0
      breaker.nextRetry = undefined
      this.emit('circuitBreakerClosed', agentId)
    }
  }

  /**
   * Record a failed operation
   */
  recordFailure(agentId: string, error?: string): void {
    const breaker = this.circuitBreakers.get(agentId)
    if (!breaker) return

    breaker.failureCount++
    breaker.lastFailure = new Date()
    breaker.successCount = 0

    if (breaker.state === 'closed' && breaker.failureCount >= breaker.threshold) {
      breaker.state = 'open'
      breaker.nextRetry = new Date(Date.now() + this.CIRCUIT_BREAKER_TIMEOUT)
      this.updateAgentStatus(agentId, 'unhealthy')
      this.emit('circuitBreakerOpened', agentId, error)
    }
  }

  /**
   * Check if agent is available (circuit breaker is closed)
   */
  isAgentAvailable(agentId: string): boolean {
    const breaker = this.circuitBreakers.get(agentId)
    if (!breaker) return false

    if (breaker.state === 'open') {
      if (breaker.nextRetry && new Date() > breaker.nextRetry) {
        breaker.state = 'half-open'
        breaker.successCount = 0
        this.emit('circuitBreakerHalfOpen', agentId)
      }
    }

    return breaker.state !== 'open'
  }

  /**
   * Get health metrics for an agent
   */
  getHealthMetrics(agentId: string): HealthMetrics | null {
    return this.healthMetrics.get(agentId) || null
  }

  /**
   * Get circuit breaker state for an agent
   */
  getCircuitBreakerState(agentId: string): CircuitBreakerState | null {
    return this.circuitBreakers.get(agentId) || null
  }

  /**
   * Get all health metrics
   */
  getAllHealthMetrics(): HealthMetrics[] {
    return Array.from(this.healthMetrics.values())
  }

  /**
   * Get metrics history for an agent
   */
  getMetricsHistory(agentId: string, limit?: number): ResourceMetrics[] {
    const history = this.metricsHistory.get(agentId) || []
    return limit ? history.slice(-limit) : [...history]
  }

  /**
   * Start periodic health checks
   */
  private startHealthChecks(): void {
    this.healthCheckInterval = setInterval(() => {
      this.performHealthChecks()
    }, this.HEALTH_CHECK_INTERVAL)
  }

  /**
   * Perform health checks on all agents
   */
  private async performHealthChecks(): Promise<void> {
    for (const [agentId, metrics] of this.healthMetrics) {
      // Check if we have recent metrics
      const now = new Date()
      const metricAge = now.getTime() - metrics.resources.timestamp.getTime()

      if (metricAge > this.HEALTH_CHECK_INTERVAL * 2) {
        // Try to request fresh metrics via WebSocket
        const ws = this.websocketConnections.get(agentId)
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'requestMetrics' }))
        }
      }

      // Update agent status based on various factors
      this.updateAgentHealthStatus(agentId)
    }
  }

  /**
   * Update agent health status based on all available indicators
   */
  private updateAgentHealthStatus(agentId: string): void {
    const metrics = this.healthMetrics.get(agentId)
    const breaker = this.circuitBreakers.get(agentId)
    if (!metrics || !breaker) return

    let newStatus: HealthMetrics['status'] = 'healthy'

    // Check circuit breaker state
    if (breaker.state === 'open') {
      newStatus = 'unhealthy'
    } else if (breaker.state === 'half-open') {
      newStatus = 'degraded'
    }

    // Check heartbeat
    const timeSinceHeartbeat = Date.now() - metrics.heartbeat.lastBeat.getTime()
    if (timeSinceHeartbeat > this.HEARTBEAT_TIMEOUT) {
      newStatus = 'offline'
    } else if (metrics.heartbeat.missedBeats > 0) {
      newStatus = 'degraded'
    }

    // Check resource metrics
    const { cpu, memory, queueLength, errorRate } = metrics.resources
    if (cpu > 90 || memory > 2000 || queueLength > 20 || errorRate > 10) {
      if (newStatus === 'healthy') {
        newStatus = 'degraded'
      }
    }

    // Check predictive health
    if (metrics.predictiveHealth.score < 40) {
      newStatus = 'unhealthy'
    } else if (metrics.predictiveHealth.score < 70 && newStatus === 'healthy') {
      newStatus = 'degraded'
    }

    this.updateAgentStatus(agentId, newStatus)
  }

  /**
   * Get comprehensive health report
   */
  getHealthReport(): {
    summary: {
      totalAgents: number
      healthyAgents: number
      degradedAgents: number
      unhealthyAgents: number
      offlineAgents: number
      openCircuitBreakers: number
    }
    agents: HealthMetrics[]
    circuitBreakers: CircuitBreakerState[]
  } {
    const agents = this.getAllHealthMetrics()
    const circuitBreakers = Array.from(this.circuitBreakers.values())

    return {
      summary: {
        totalAgents: agents.length,
        healthyAgents: agents.filter(a => a.status === 'healthy').length,
        degradedAgents: agents.filter(a => a.status === 'degraded').length,
        unhealthyAgents: agents.filter(a => a.status === 'unhealthy').length,
        offlineAgents: agents.filter(a => a.status === 'offline').length,
        openCircuitBreakers: circuitBreakers.filter(cb => cb.state === 'open').length
      },
      agents,
      circuitBreakers
    }
  }

  /**
   * Cleanup resources
   */
  cleanup(): void {
    // Clear intervals
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval)
    }

    this.heartbeatIntervals.forEach(interval => clearInterval(interval))
    this.heartbeatIntervals.clear()

    // Close WebSocket connections
    this.websocketConnections.forEach(ws => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close()
      }
    })
    this.websocketConnections.clear()

    // Clear all data
    this.healthMetrics.clear()
    this.circuitBreakers.clear()
    this.metricsHistory.clear()
  }
}