import Redis from 'ioredis'

export interface TaskMetrics {
  agentType: string
  success: boolean
  duration: number
  timestamp: number
}

export interface SystemMetrics {
  totalTasks: number
  successfulTasks: number
  failedTasks: number
  averageResponseTime: number
  agentUsage: Record<string, number>
  errorRate: number
  tasksPerMinute: number
  lastUpdated: string
}

export class MetricsCollector {
  private redis: Redis
  private metricsKeyPrefix = 'urnlabs:metrics'

  constructor(redis: Redis) {
    this.redis = redis
  }

  /**
   * Record task execution metrics
   */
  async recordTaskExecution(agentType: string, success: boolean, duration: number): Promise<void> {
    const timestamp = Date.now()
    const taskMetric: TaskMetrics = {
      agentType,
      success,
      duration,
      timestamp
    }

    try {
      // Store individual task metrics (with TTL of 24 hours)
      await this.redis.zadd(
        `${this.metricsKeyPrefix}:tasks`,
        timestamp,
        JSON.stringify(taskMetric)
      )
      
      // Set TTL for task metrics (24 hours)
      await this.redis.expire(`${this.metricsKeyPrefix}:tasks`, 86400)

      // Update counters
      const multi = this.redis.multi()
      multi.hincrby(`${this.metricsKeyPrefix}:counters`, 'total_tasks', 1)
      multi.hincrby(`${this.metricsKeyPrefix}:counters`, success ? 'successful_tasks' : 'failed_tasks', 1)
      multi.hincrby(`${this.metricsKeyPrefix}:agent_usage`, agentType, 1)
      multi.zadd(`${this.metricsKeyPrefix}:response_times`, timestamp, duration)
      
      await multi.exec()

      // Clean old response times (keep only last 1000 entries)
      await this.redis.zremrangebyrank(`${this.metricsKeyPrefix}:response_times`, 0, -1001)
    } catch (error) {
      console.error('Failed to record task metrics:', error)
    }
  }

  /**
   * Get comprehensive system metrics
   */
  async getMetrics(): Promise<SystemMetrics> {
    try {
      const [counters, agentUsage, responseTimes] = await Promise.all([
        this.redis.hgetall(`${this.metricsKeyPrefix}:counters`),
        this.redis.hgetall(`${this.metricsKeyPrefix}:agent_usage`),
        this.redis.zrange(`${this.metricsKeyPrefix}:response_times`, -100, -1, 'WITHSCORES')
      ])

      // Parse counters
      const totalTasks = parseInt(counters.total_tasks) || 0
      const successfulTasks = parseInt(counters.successful_tasks) || 0
      const failedTasks = parseInt(counters.failed_tasks) || 0

      // Parse agent usage
      const agentUsageMap: Record<string, number> = {}
      for (const [agent, count] of Object.entries(agentUsage)) {
        agentUsageMap[agent] = parseInt(count as string) || 0
      }

      // Calculate average response time
      let averageResponseTime = 0
      if (responseTimes.length > 0) {
        const times = responseTimes.filter((_, index) => index % 2 === 1).map(Number)
        averageResponseTime = times.reduce((sum, time) => sum + time, 0) / times.length
      }

      // Calculate error rate
      const errorRate = totalTasks > 0 ? (failedTasks / totalTasks) * 100 : 0

      // Calculate tasks per minute (last 1 minute)
      const oneMinuteAgo = Date.now() - 60000
      const recentTasks = await this.redis.zcount(
        `${this.metricsKeyPrefix}:tasks`,
        oneMinuteAgo,
        Date.now()
      )

      return {
        totalTasks,
        successfulTasks,
        failedTasks,
        averageResponseTime: Math.round(averageResponseTime),
        agentUsage: agentUsageMap,
        errorRate: Math.round(errorRate * 100) / 100,
        tasksPerMinute: recentTasks,
        lastUpdated: new Date().toISOString()
      }
    } catch (error) {
      console.error('Failed to get metrics:', error)
      return {
        totalTasks: 0,
        successfulTasks: 0,
        failedTasks: 0,
        averageResponseTime: 0,
        agentUsage: {},
        errorRate: 0,
        tasksPerMinute: 0,
        lastUpdated: new Date().toISOString()
      }
    }
  }

  /**
   * Get metrics for a specific time range
   */
  async getMetricsInRange(startTime: number, endTime: number): Promise<TaskMetrics[]> {
    try {
      const rawMetrics = await this.redis.zrangebyscore(
        `${this.metricsKeyPrefix}:tasks`,
        startTime,
        endTime
      )

      return rawMetrics.map(metric => JSON.parse(metric))
    } catch (error) {
      console.error('Failed to get metrics in range:', error)
      return []
    }
  }

  /**
   * Get agent performance statistics
   */
  async getAgentStats(agentType: string): Promise<{
    totalTasks: number
    successRate: number
    averageResponseTime: number
    lastUsed: string | null
  }> {
    try {
      const oneHourAgo = Date.now() - 3600000
      const rawMetrics = await this.redis.zrangebyscore(
        `${this.metricsKeyPrefix}:tasks`,
        oneHourAgo,
        Date.now()
      )

      const agentMetrics = rawMetrics
        .map(metric => JSON.parse(metric))
        .filter(metric => metric.agentType === agentType)

      const totalTasks = agentMetrics.length
      const successfulTasks = agentMetrics.filter(m => m.success).length
      const successRate = totalTasks > 0 ? (successfulTasks / totalTasks) * 100 : 0
      
      const totalResponseTime = agentMetrics.reduce((sum, m) => sum + m.duration, 0)
      const averageResponseTime = totalTasks > 0 ? totalResponseTime / totalTasks : 0
      
      const lastUsed = agentMetrics.length > 0 
        ? new Date(Math.max(...agentMetrics.map(m => m.timestamp))).toISOString()
        : null

      return {
        totalTasks,
        successRate: Math.round(successRate * 100) / 100,
        averageResponseTime: Math.round(averageResponseTime),
        lastUsed
      }
    } catch (error) {
      console.error(`Failed to get stats for agent ${agentType}:`, error)
      return {
        totalTasks: 0,
        successRate: 0,
        averageResponseTime: 0,
        lastUsed: null
      }
    }
  }

  /**
   * Reset all metrics (useful for testing or maintenance)
   */
  async resetMetrics(): Promise<void> {
    try {
      const keys = await this.redis.keys(`${this.metricsKeyPrefix}:*`)
      if (keys.length > 0) {
        await this.redis.del(...keys)
      }
    } catch (error) {
      console.error('Failed to reset metrics:', error)
    }
  }

  /**
   * Get real-time system health based on metrics
   */
  async getSystemHealth(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy'
    score: number
    reasons: string[]
  }> {
    try {
      const metrics = await this.getMetrics()
      const reasons: string[] = []
      let score = 100

      // Check error rate
      if (metrics.errorRate > 20) {
        score -= 30
        reasons.push(`High error rate: ${metrics.errorRate}%`)
      } else if (metrics.errorRate > 10) {
        score -= 15
        reasons.push(`Elevated error rate: ${metrics.errorRate}%`)
      }

      // Check response time
      if (metrics.averageResponseTime > 10000) {
        score -= 25
        reasons.push(`Slow response time: ${metrics.averageResponseTime}ms`)
      } else if (metrics.averageResponseTime > 5000) {
        score -= 10
        reasons.push(`Elevated response time: ${metrics.averageResponseTime}ms`)
      }

      // Check task throughput
      if (metrics.tasksPerMinute === 0 && metrics.totalTasks > 0) {
        score -= 20
        reasons.push('No recent task activity')
      }

      // Determine status
      let status: 'healthy' | 'degraded' | 'unhealthy'
      if (score >= 80) {
        status = 'healthy'
      } else if (score >= 50) {
        status = 'degraded'
      } else {
        status = 'unhealthy'
      }

      return { status, score, reasons }
    } catch (error) {
      console.error('Failed to get system health:', error)
      return {
        status: 'unhealthy',
        score: 0,
        reasons: ['Failed to calculate system health']
      }
    }
  }
}