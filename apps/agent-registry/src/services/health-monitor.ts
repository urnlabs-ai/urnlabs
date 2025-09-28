import { PrismaClient } from '@prisma/client';
import { Redis } from 'ioredis';
import { EventEmitter } from 'events';
import WebSocket from 'ws';
import {
  Agent,
  Heartbeat,
  AgentStatus,
  HealthStatus,
  AgentMetrics,
  AgentHealthUpdate,
  WebSocketMessage
} from '../types/index.js';

export class HealthMonitorService extends EventEmitter {
  private prisma: PrismaClient;
  private redis: Redis;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private websocketServer: WebSocket.Server | null = null;
  private connectedClients: Set<WebSocket> = new Set();

  // Configuration
  private readonly HEARTBEAT_INTERVAL = 30000; // 30 seconds
  private readonly HEALTH_CHECK_INTERVAL = 60000; // 1 minute
  private readonly HEARTBEAT_TIMEOUT = 90000; // 90 seconds
  private readonly DEGRADED_THRESHOLD = 0.7; // 70% success rate
  private readonly UNHEALTHY_THRESHOLD = 0.5; // 50% success rate

  constructor(prisma: PrismaClient, redis: Redis) {
    super();
    this.prisma = prisma;
    this.redis = redis;
  }

  /**
   * Start the health monitoring service
   */
  async start(port: number = 8080): Promise<void> {
    try {
      // Start WebSocket server for real-time updates
      await this.startWebSocketServer(port);

      // Start periodic health checks
      this.startPeriodicHealthChecks();

      // Start heartbeat monitoring
      this.startHeartbeatMonitoring();

      console.log(`Health monitoring service started on port ${port}`);
    } catch (error) {
      throw new Error(`Failed to start health monitoring: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Stop the health monitoring service
   */
  async stop(): Promise<void> {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }

    if (this.websocketServer) {
      this.websocketServer.close();
      this.websocketServer = null;
    }

    this.connectedClients.clear();
    console.log('Health monitoring service stopped');
  }

  /**
   * Process heartbeat from an agent
   */
  async processHeartbeat(heartbeat: Heartbeat): Promise<void> {
    try {
      // Validate heartbeat
      this.validateHeartbeat(heartbeat);

      // Update agent status in database
      await this.updateAgentHealthStatus(
        heartbeat.agentId,
        heartbeat.status,
        heartbeat.healthStatus,
        heartbeat.metrics
      );

      // Cache heartbeat data
      await this.cacheHeartbeat(heartbeat);

      // Emit health update event
      this.emit('agentHealthUpdate', {
        agentId: heartbeat.agentId,
        status: heartbeat.status,
        healthStatus: heartbeat.healthStatus,
        metrics: heartbeat.metrics,
        timestamp: heartbeat.timestamp
      });

      // Broadcast to WebSocket clients
      await this.broadcastHealthUpdate({
        type: 'agent_health_update',
        data: {
          agentId: heartbeat.agentId,
          status: heartbeat.status,
          healthStatus: heartbeat.healthStatus,
          metrics: heartbeat.metrics
        },
        timestamp: heartbeat.timestamp,
        id: `heartbeat_${heartbeat.agentId}_${Date.now()}`
      });

    } catch (error) {
      console.error(`Failed to process heartbeat for agent ${heartbeat.agentId}:`, error);
      throw error;
    }
  }

  /**
   * Get health status for an agent
   */
  async getAgentHealth(agentId: string): Promise<{
    status: AgentStatus;
    healthStatus: HealthStatus;
    metrics?: AgentMetrics;
    lastHeartbeat?: Date;
  } | null> {
    try {
      // Check cache first
      const cached = await this.redis.hgetall(`agent_health:${agentId}`);
      
      if (cached && Object.keys(cached).length > 0) {
        return {
          status: cached.status as AgentStatus,
          healthStatus: cached.healthStatus as HealthStatus,
          metrics: cached.metrics ? JSON.parse(cached.metrics) : undefined,
          lastHeartbeat: cached.lastHeartbeat ? new Date(cached.lastHeartbeat) : undefined
        };
      }

      // Fallback to database
      const agent = await this.prisma.agent.findUnique({
        where: { id: agentId },
        select: {
          status: true,
          updatedAt: true
        }
      });

      if (!agent) {
        return null;
      }

      return {
        status: agent.status as AgentStatus,
        healthStatus: HealthStatus.UNKNOWN,
        lastHeartbeat: agent.updatedAt
      };

    } catch (error) {
      console.error(`Failed to get agent health for ${agentId}:`, error);
      return null;
    }
  }

  /**
   * Get health overview for organization
   */
  async getOrganizationHealthOverview(organizationId: string): Promise<{
    total: number;
    healthy: number;
    unhealthy: number;
    degraded: number;
    unknown: number;
    offline: number;
  }> {
    try {
      const agents = await this.prisma.agent.findMany({
        where: { organizationId },
        select: { id: true, status: true }
      });

      const healthCounts = {
        total: agents.length,
        healthy: 0,
        unhealthy: 0,
        degraded: 0,
        unknown: 0,
        offline: 0
      };

      // Get health status for each agent
      for (const agent of agents) {
        const health = await this.getAgentHealth(agent.id);
        
        if (!health || health.status === AgentStatus.INACTIVE) {
          healthCounts.offline++;
        } else {
          switch (health.healthStatus) {
            case HealthStatus.HEALTHY:
              healthCounts.healthy++;
              break;
            case HealthStatus.UNHEALTHY:
              healthCounts.unhealthy++;
              break;
            case HealthStatus.DEGRADED:
              healthCounts.degraded++;
              break;
            default:
              healthCounts.unknown++;
          }
        }
      }

      return healthCounts;
    } catch (error) {
      console.error(`Failed to get organization health overview for ${organizationId}:`, error);
      throw error;
    }
  }

  /**
   * Manually trigger health check for an agent
   */
  async triggerHealthCheck(agentId: string): Promise<void> {
    try {
      const agent = await this.prisma.agent.findUnique({
        where: { id: agentId }
      });

      if (!agent) {
        throw new Error(`Agent ${agentId} not found`);
      }

      // Perform health check
      await this.performHealthCheck(agent);
    } catch (error) {
      console.error(`Failed to trigger health check for agent ${agentId}:`, error);
      throw error;
    }
  }

  // Private methods

  private async startWebSocketServer(port: number): Promise<void> {
    this.websocketServer = new WebSocket.Server({ port });

    this.websocketServer.on('connection', (ws: WebSocket) => {
      console.log('New WebSocket client connected');
      this.connectedClients.add(ws);

      ws.on('close', () => {
        console.log('WebSocket client disconnected');
        this.connectedClients.delete(ws);
      });

      ws.on('error', (error) => {
        console.error('WebSocket error:', error);
        this.connectedClients.delete(ws);
      });

      // Send initial connection confirmation
      ws.send(JSON.stringify({
        type: 'connection_established',
        data: { message: 'Connected to health monitoring service' },
        timestamp: new Date(),
        id: `connection_${Date.now()}`
      }));
    });
  }

  private startPeriodicHealthChecks(): void {
    this.healthCheckInterval = setInterval(async () => {
      try {
        await this.performPeriodicHealthChecks();
      } catch (error) {
        console.error('Error during periodic health checks:', error);
      }
    }, this.HEALTH_CHECK_INTERVAL);
  }

  private startHeartbeatMonitoring(): void {
    this.heartbeatInterval = setInterval(async () => {
      try {
        await this.checkStaleHeartbeats();
      } catch (error) {
        console.error('Error during heartbeat monitoring:', error);
      }
    }, this.HEARTBEAT_INTERVAL);
  }

  private async performPeriodicHealthChecks(): Promise<void> {
    // Get all active agents
    const agents = await this.prisma.agent.findMany({
      where: {
        status: { in: [AgentStatus.ACTIVE, AgentStatus.STARTING] }
      }
    });

    // Perform health checks in parallel (with concurrency limit)
    const concurrencyLimit = 10;
    for (let i = 0; i < agents.length; i += concurrencyLimit) {
      const batch = agents.slice(i, i + concurrencyLimit);
      await Promise.all(batch.map(agent => this.performHealthCheck(agent)));
    }
  }

  private async performHealthCheck(agent: any): Promise<void> {
    try {
      // Check if agent has sent heartbeat recently
      const lastHeartbeat = await this.redis.hget(`agent_health:${agent.id}`, 'lastHeartbeat');
      const now = Date.now();
      
      if (lastHeartbeat) {
        const timeSinceHeartbeat = now - new Date(lastHeartbeat).getTime();
        
        if (timeSinceHeartbeat > this.HEARTBEAT_TIMEOUT) {
          // Agent hasn't sent heartbeat - mark as unhealthy
          await this.updateAgentHealthStatus(
            agent.id,
            AgentStatus.UNHEALTHY,
            HealthStatus.UNHEALTHY
          );
        }
      }

      // Additional health checks could be added here
      // e.g., HTTP endpoint checks, resource usage monitoring, etc.

    } catch (error) {
      console.error(`Health check failed for agent ${agent.id}:`, error);
      
      // Mark agent as unhealthy due to health check failure
      await this.updateAgentHealthStatus(
        agent.id,
        AgentStatus.UNHEALTHY,
        HealthStatus.UNHEALTHY
      );
    }
  }

  private async checkStaleHeartbeats(): Promise<void> {
    // Get all agent health keys from Redis
    const pattern = 'agent_health:*';
    const keys = await this.redis.keys(pattern);
    
    const now = Date.now();
    
    for (const key of keys) {
      const agentId = key.replace('agent_health:', '');
      const lastHeartbeat = await this.redis.hget(key, 'lastHeartbeat');
      
      if (lastHeartbeat) {
        const timeSinceHeartbeat = now - new Date(lastHeartbeat).getTime();
        
        if (timeSinceHeartbeat > this.HEARTBEAT_TIMEOUT) {
          // Mark agent as unhealthy
          await this.updateAgentHealthStatus(
            agentId,
            AgentStatus.UNHEALTHY,
            HealthStatus.UNHEALTHY
          );
        }
      }
    }
  }

  private async updateAgentHealthStatus(
    agentId: string,
    status: AgentStatus,
    healthStatus: HealthStatus,
    metrics?: AgentMetrics
  ): Promise<void> {
    try {
      // Update database
      await this.prisma.agent.update({
        where: { id: agentId },
        data: {
          status,
          updatedAt: new Date()
        }
      });

      // Update cache
      const healthData: any = {
        status,
        healthStatus,
        lastHeartbeat: new Date().toISOString()
      };

      if (metrics) {
        healthData.metrics = JSON.stringify(metrics);
      }

      await this.redis.hset(`agent_health:${agentId}`, healthData);

    } catch (error) {
      console.error(`Failed to update agent health status for ${agentId}:`, error);
      throw error;
    }
  }

  private async cacheHeartbeat(heartbeat: Heartbeat): Promise<void> {
    const healthData: any = {
      status: heartbeat.status,
      healthStatus: heartbeat.healthStatus,
      lastHeartbeat: heartbeat.timestamp.toISOString()
    };

    if (heartbeat.metrics) {
      healthData.metrics = JSON.stringify(heartbeat.metrics);
    }

    if (heartbeat.metadata) {
      healthData.metadata = JSON.stringify(heartbeat.metadata);
    }

    await this.redis.hset(`agent_health:${heartbeat.agentId}`, healthData);
    await this.redis.expire(`agent_health:${heartbeat.agentId}`, 300); // 5 minutes TTL
  }

  private validateHeartbeat(heartbeat: Heartbeat): void {
    if (!heartbeat.agentId) {
      throw new Error('Agent ID is required in heartbeat');
    }

    if (!heartbeat.timestamp) {
      throw new Error('Timestamp is required in heartbeat');
    }

    if (!heartbeat.status || !Object.values(AgentStatus).includes(heartbeat.status)) {
      throw new Error('Valid status is required in heartbeat');
    }

    if (!heartbeat.healthStatus || !Object.values(HealthStatus).includes(heartbeat.healthStatus)) {
      throw new Error('Valid health status is required in heartbeat');
    }
  }

  private async broadcastHealthUpdate(message: WebSocketMessage): Promise<void> {
    if (this.connectedClients.size === 0) {
      return;
    }

    const messageString = JSON.stringify(message);
    
    // Send to all connected clients
    const sendPromises = Array.from(this.connectedClients).map(async (client) => {
      try {
        if (client.readyState === WebSocket.OPEN) {
          client.send(messageString);
        } else {
          this.connectedClients.delete(client);
        }
      } catch (error) {
        console.error('Error sending WebSocket message:', error);
        this.connectedClients.delete(client);
      }
    });

    await Promise.allSettled(sendPromises);
  }

  private calculateHealthStatus(metrics: AgentMetrics): HealthStatus {
    if (!metrics) {
      return HealthStatus.UNKNOWN;
    }

    const successRate = metrics.totalRequests > 0 
      ? metrics.successfulRequests / metrics.totalRequests 
      : 1;

    if (successRate >= this.DEGRADED_THRESHOLD) {
      return HealthStatus.HEALTHY;
    } else if (successRate >= this.UNHEALTHY_THRESHOLD) {
      return HealthStatus.DEGRADED;
    } else {
      return HealthStatus.UNHEALTHY;
    }
  }
}