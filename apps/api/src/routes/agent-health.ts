import { FastifyPluginAsync } from 'fastify'
import { UnifiedAgentRegistry } from '../services/agent-registry'

export interface AgentHealthRoutes {
  registry: UnifiedAgentRegistry
  wsServer?: any // Made generic to avoid circular imports
}

const agentHealthRoutes: FastifyPluginAsync<AgentHealthRoutes> = async (fastify, options) => {
  const { registry, wsServer } = options

  /**
   * Get comprehensive system health status
   */
  fastify.get('/health', async (request, reply) => {
    try {
      const systemHealth = registry.getSystemHealth()
      return systemHealth
    } catch (error) {
      reply.status(500).send({
        error: 'Failed to get system health',
        details: (error as any).message
      })
    }
  })

  /**
   * Get detailed health metrics for a specific agent
   */
  fastify.get('/health/agent/:agentId', async (request, reply) => {
    const { agentId } = request.params as { agentId: string }

    try {
      const healthMonitor = registry.getHealthMonitor()
      const healthMetrics = healthMonitor.getHealthMetrics(agentId)
      const circuitBreakerState = healthMonitor.getCircuitBreakerState(agentId)
      const metricsHistory = healthMonitor.getMetricsHistory(agentId, 50)

      if (!healthMetrics) {
        return reply.status(404).send({
          error: 'Agent not found or not monitored'
        })
      }

      return {
        agent: registry.getAgent(agentId),
        health: healthMetrics,
        circuitBreaker: circuitBreakerState,
        metricsHistory
      }
    } catch (error) {
      reply.status(500).send({
        error: 'Failed to get agent health',
        details: (error as any).message
      })
    }
  })

  /**
   * Get health report for all agents
   */
  fastify.get('/health/report', async (request, reply) => {
    try {
      const healthMonitor = registry.getHealthMonitor()
      const healthReport = healthMonitor.getHealthReport()

      return {
        ...healthReport,
        timestamp: new Date().toISOString(),
        websocketConnections: wsServer ? wsServer.getConnectionStats() : null
      }
    } catch (error) {
      reply.status(500).send({
        error: 'Failed to get health report',
        details: (error as any).message
      })
    }
  })

  /**
   * Get circuit breaker status for all agents
   */
  fastify.get('/health/circuit-breakers', async (request, reply) => {
    try {
      const healthMonitor = registry.getHealthMonitor()
      const healthReport = healthMonitor.getHealthReport()

      return {
        circuitBreakers: healthReport.circuitBreakers,
        summary: {
          total: healthReport.circuitBreakers.length,
          open: healthReport.circuitBreakers.filter(cb => cb.state === 'open').length,
          halfOpen: healthReport.circuitBreakers.filter(cb => cb.state === 'half-open').length,
          closed: healthReport.circuitBreakers.filter(cb => cb.state === 'closed').length
        }
      }
    } catch (error) {
      reply.status(500).send({
        error: 'Failed to get circuit breaker status',
        details: (error as any).message
      })
    }
  })

  /**
   * Get predictive health insights
   */
  fastify.get('/health/predictive', async (request, reply) => {
    try {
      const healthMonitor = registry.getHealthMonitor()
      const allMetrics = healthMonitor.getAllHealthMetrics()

      const insights = allMetrics.map(metrics => ({
        agentId: metrics.agentId,
        predictiveHealth: metrics.predictiveHealth,
        riskLevel: metrics.predictiveHealth.score < 40 ? 'high' :
                   metrics.predictiveHealth.score < 70 ? 'medium' : 'low',
        recommendedActions: generateRecommendations(metrics)
      }))

      const summary = {
        totalAgents: insights.length,
        highRisk: insights.filter(i => i.riskLevel === 'high').length,
        mediumRisk: insights.filter(i => i.riskLevel === 'medium').length,
        lowRisk: insights.filter(i => i.riskLevel === 'low').length,
        degradingTrend: insights.filter(i => i.predictiveHealth.trend === 'degrading').length
      }

      return {
        summary,
        insights
      }
    } catch (error) {
      reply.status(500).send({
        error: 'Failed to get predictive health insights',
        details: (error as any).message
      })
    }
  })

  /**
   * Get real-time metrics for specific agent
   */
  fastify.get('/health/metrics/:agentId', async (request, reply) => {
    const { agentId } = request.params as { agentId: string }
    const { limit = 100 } = request.query as { limit?: number }

    try {
      const healthMonitor = registry.getHealthMonitor()
      const metricsHistory = healthMonitor.getMetricsHistory(agentId, limit)
      const currentMetrics = healthMonitor.getHealthMetrics(agentId)

      if (!currentMetrics) {
        return reply.status(404).send({
          error: 'Agent not found or not monitored'
        })
      }

      return {
        current: currentMetrics.resources,
        history: metricsHistory,
        trends: calculateMetricsTrends(metricsHistory)
      }
    } catch (error) {
      reply.status(500).send({
        error: 'Failed to get agent metrics',
        details: (error as any).message
      })
    }
  })

  /**
   * Force heartbeat update for an agent
   */
  fastify.post('/health/heartbeat/:agentId', async (request, reply) => {
    const { agentId } = request.params as { agentId: string }

    try {
      const healthMonitor = registry.getHealthMonitor()
      healthMonitor.updateHeartbeat(agentId)

      return {
        success: true,
        agentId,
        timestamp: new Date().toISOString()
      }
    } catch (error) {
      reply.status(500).send({
        error: 'Failed to update heartbeat',
        details: (error as any).message
      })
    }
  })

  /**
   * Update resource metrics for an agent
   */
  fastify.post('/health/metrics/:agentId', async (request, reply) => {
    const { agentId } = request.params as { agentId: string }
    const metrics = request.body as any

    try {
      const healthMonitor = registry.getHealthMonitor()
      healthMonitor.updateResourceMetrics(agentId, metrics)

      return {
        success: true,
        agentId,
        timestamp: new Date().toISOString()
      }
    } catch (error) {
      reply.status(500).send({
        error: 'Failed to update metrics',
        details: (error as any).message
      })
    }
  })

  /**
   * Get WebSocket connection statistics
   */
  fastify.get('/health/websockets', async (request, reply) => {
    try {
      if (!wsServer) {
        return reply.status(503).send({
          error: 'WebSocket server not available'
        })
      }

      const stats = wsServer.getConnectionStats()
      const connectedAgents = wsServer.getConnectedAgents()

      return {
        ...stats,
        connectedAgents,
        healthStatus: connectedAgents.length > 0 ? 'active' : 'inactive'
      }
    } catch (error) {
      reply.status(500).send({
        error: 'Failed to get WebSocket statistics',
        details: (error as any).message
      })
    }
  })

  /**
   * Get system performance trends
   */
  fastify.get('/health/trends', async (request, reply) => {
    const { hours = 24 } = request.query as { hours?: number }

    try {
      const agents = registry.getAllAgents()
      const healthMonitor = registry.getHealthMonitor()

      const trends = agents.map(agent => {
        const metricsHistory = healthMonitor.getMetricsHistory(agent.id, hours * 60) // Assuming 1 metric per minute
        return {
          agentId: agent.id,
          name: agent.name,
          type: agent.type,
          trends: calculateDetailedTrends(metricsHistory)
        }
      })

      const systemTrends = calculateSystemWideTrends(trends)

      return {
        period: `${hours} hours`,
        systemTrends,
        agentTrends: trends,
        timestamp: new Date().toISOString()
      }
    } catch (error) {
      reply.status(500).send({
        error: 'Failed to get performance trends',
        details: (error as any).message
      })
    }
  })

  /**
   * Execute health check on all agents
   */
  fastify.post('/health/check', async (request, reply) => {
    try {
      const healthReport = registry.getSystemHealth()

      // Trigger immediate health checks
      const healthMonitor = registry.getHealthMonitor()
      const agents = registry.getAllAgents()

      const healthChecks = await Promise.allSettled(
        agents.map(async (agent) => {
          try {
            // Simulate health check - in production, this would ping the agent
            const isHealthy = healthMonitor.isAgentAvailable(agent.id)
            return {
              agentId: agent.id,
              healthy: isHealthy,
              responseTime: Math.random() * 100, // Simulated
              timestamp: new Date().toISOString()
            }
          } catch (error) {
            return {
              agentId: agent.id,
              healthy: false,
              error: (error as any).message,
              timestamp: new Date().toISOString()
            }
          }
        })
      )

      const results = healthChecks.map(result =>
        result.status === 'fulfilled' ? result.value : {
          agentId: 'unknown',
          healthy: false,
          error: 'Health check failed'
        }
      )

      return {
        summary: healthReport,
        healthChecks: results,
        timestamp: new Date().toISOString()
      }
    } catch (error) {
      reply.status(500).send({
        error: 'Failed to execute health checks',
        details: (error as any).message
      })
    }
  })
}

/**
 * Generate recommendations based on health metrics
 */
function generateRecommendations(metrics: any): string[] {
  const recommendations: string[] = []
  const { predictiveHealth, resources } = metrics

  if (predictiveHealth.score < 50) {
    recommendations.push('Immediate attention required - agent health is critical')
  }

  if (predictiveHealth.trend === 'degrading') {
    recommendations.push('Monitor closely - performance is declining')
  }

  if (resources.cpu > 80) {
    recommendations.push('Consider scaling up - high CPU usage detected')
  }

  if (resources.memory > 1500) {
    recommendations.push('Memory usage is high - investigate potential leaks')
  }

  if (resources.queueLength > 10) {
    recommendations.push('Queue backlog detected - consider load balancing')
  }

  if (resources.errorRate > 5) {
    recommendations.push('Error rate is elevated - investigate root causes')
  }

  if (predictiveHealth.riskFactors.length > 0) {
    recommendations.push(`Address risk factors: ${predictiveHealth.riskFactors.join(', ')}`)
  }

  if (recommendations.length === 0) {
    recommendations.push('Agent is performing well - no immediate actions needed')
  }

  return recommendations
}

/**
 * Calculate trends from metrics history
 */
function calculateMetricsTrends(metricsHistory: any[]): any {
  if (metricsHistory.length < 2) {
    return {
      cpu: 'stable',
      memory: 'stable',
      responseTime: 'stable',
      errorRate: 'stable'
    }
  }

  const recent = metricsHistory.slice(-10)
  const older = metricsHistory.slice(-20, -10)

  const calculateTrend = (recentValues: number[], olderValues: number[]) => {
    if (olderValues.length === 0) return 'stable'

    const recentAvg = recentValues.reduce((sum, val) => sum + val, 0) / recentValues.length
    const olderAvg = olderValues.reduce((sum, val) => sum + val, 0) / olderValues.length

    const change = ((recentAvg - olderAvg) / olderAvg) * 100

    if (change > 10) return 'increasing'
    if (change < -10) return 'decreasing'
    return 'stable'
  }

  return {
    cpu: calculateTrend(recent.map(m => m.cpu), older.map(m => m.cpu)),
    memory: calculateTrend(recent.map(m => m.memory), older.map(m => m.memory)),
    responseTime: calculateTrend(recent.map(m => m.responseTimeP95), older.map(m => m.responseTimeP95)),
    errorRate: calculateTrend(recent.map(m => m.errorRate), older.map(m => m.errorRate))
  }
}

/**
 * Calculate detailed trends for an agent
 */
function calculateDetailedTrends(metricsHistory: any[]): any {
  // Implementation would analyze various metrics over time
  return {
    performance: 'stable',
    reliability: 'improving',
    efficiency: 'stable'
  }
}

/**
 * Calculate system-wide trends
 */
function calculateSystemWideTrends(agentTrends: any[]): any {
  // Implementation would aggregate trends across all agents
  return {
    overallHealth: 'stable',
    loadDistribution: 'balanced',
    scalingEfficiency: 'optimal'
  }
}

export default agentHealthRoutes