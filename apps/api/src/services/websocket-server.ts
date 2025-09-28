import WebSocket, { WebSocketServer as WSServer } from 'ws'
import { EventEmitter } from 'events'
import { IncomingMessage } from 'http'

// Forward declarations for types
interface AgentHealthMonitor extends EventEmitter {
  updateResourceMetrics(agentId: string, metrics: any): void
  updateHeartbeat(agentId: string): void
  getHealthReport(): any
  getAllHealthMetrics(): any[]
}

interface UnifiedAgent {
  id: string
  name: string
  type: string
  status: string
}

export interface WebSocketMessage {
  type: string
  agentId?: string
  data?: any
  timestamp: string
  requestId?: string
}

export interface ClientConnection {
  id: string
  ws: WebSocket
  type: 'dashboard' | 'agent' | 'monitoring'
  agentId?: string
  subscriptions: Set<string>
  lastPing: Date
  metadata: Record<string, any>
}

export class WebSocketServer extends EventEmitter {
  private wss: WSServer
  private clients = new Map<string, ClientConnection>()
  private agentConnections = new Map<string, ClientConnection>()
  private pingInterval: NodeJS.Timeout
  private healthMonitor: AgentHealthMonitor

  private readonly PING_INTERVAL = 30000 // 30 seconds
  private readonly CLIENT_TIMEOUT = 60000 // 1 minute

  constructor(server: any, healthMonitor: AgentHealthMonitor) {
    super()
    this.healthMonitor = healthMonitor

    this.wss = new WSServer({
      server,
      path: '/ws',
      verifyClient: this.verifyClient.bind(this)
    })

    this.setupWebSocketServer()
    this.startPingInterval()
    this.setupHealthMonitorListeners()
  }

  /**
   * Verify client connection
   */
  private verifyClient(info: { origin: string; secure: boolean; req: IncomingMessage }): boolean {
    // Add authentication logic here
    // For demo purposes, allow all connections
    return true
  }

  /**
   * Setup WebSocket server event handlers
   */
  private setupWebSocketServer(): void {
    this.wss.on('connection', (ws: WebSocket, request: IncomingMessage) => {
      const clientId = this.generateClientId()
      const url = new URL(request.url || '', `http://${request.headers.host}`)
      const clientType = (url.searchParams.get('type') || 'dashboard') as 'dashboard' | 'agent' | 'monitoring'
      const agentId = url.searchParams.get('agentId') || undefined

      const client: ClientConnection = {
        id: clientId,
        ws,
        type: clientType,
        agentId,
        subscriptions: new Set(),
        lastPing: new Date(),
        metadata: {
          userAgent: request.headers['user-agent'],
          ip: request.socket.remoteAddress,
          connectedAt: new Date()
        }
      }

      this.clients.set(clientId, client)

      if (clientType === 'agent' && agentId) {
        this.agentConnections.set(agentId, client)
      }

      console.log(`WebSocket client connected: ${clientId} (type: ${clientType}, agent: ${agentId})`)

      // Setup message handlers
      ws.on('message', (data: string) => {
        this.handleClientMessage(clientId, data)
      })

      ws.on('close', () => {
        this.handleClientDisconnect(clientId)
      })

      ws.on('error', (error) => {
        console.error(`WebSocket error for client ${clientId}:`, error)
        this.handleClientDisconnect(clientId)
      })

      // Send welcome message
      this.sendToClient(clientId, {
        type: 'connected',
        data: {
          clientId,
          serverTime: new Date().toISOString(),
          subscriptions: []
        }
      })

      this.emit('clientConnected', client)
    })
  }

  /**
   * Handle incoming client messages
   */
  private handleClientMessage(clientId: string, data: string): void {
    const client = this.clients.get(clientId)
    if (!client) return

    try {
      const message: WebSocketMessage = JSON.parse(data)
      client.lastPing = new Date()

      switch (message.type) {
        case 'ping':
          this.sendToClient(clientId, { type: 'pong', timestamp: new Date().toISOString() })
          break

        case 'subscribe':
          this.handleSubscription(clientId, message.data)
          break

        case 'unsubscribe':
          this.handleUnsubscription(clientId, message.data)
          break

        case 'agentMetrics':
          if (client.type === 'agent' && client.agentId) {
            this.handleAgentMetrics(client.agentId, message.data)
          }
          break

        case 'agentHeartbeat':
          if (client.type === 'agent' && client.agentId) {
            this.healthMonitor.updateHeartbeat(client.agentId)
          }
          break

        case 'agentStatus':
          if (client.type === 'agent' && client.agentId) {
            this.handleAgentStatusUpdate(client.agentId, message.data)
          }
          break

        case 'requestMetrics':
          if (client.type === 'dashboard' || client.type === 'monitoring') {
            this.sendHealthMetrics(clientId, message.agentId)
          }
          break

        default:
          console.warn(`Unknown message type: ${message.type}`)
      }

      this.emit('messageReceived', clientId, message)
    } catch (error) {
      console.error(`Failed to parse message from client ${clientId}:`, error)
    }
  }

  /**
   * Handle client subscription
   */
  private handleSubscription(clientId: string, subscription: string | string[]): void {
    const client = this.clients.get(clientId)
    if (!client) return

    const subscriptions = Array.isArray(subscription) ? subscription : [subscription]

    subscriptions.forEach(sub => {
      client.subscriptions.add(sub)
    })

    this.sendToClient(clientId, {
      type: 'subscribed',
      data: { subscriptions: Array.from(client.subscriptions) }
    })

    // Send initial data for subscriptions
    subscriptions.forEach(sub => {
      this.sendInitialSubscriptionData(clientId, sub)
    })
  }

  /**
   * Handle client unsubscription
   */
  private handleUnsubscription(clientId: string, subscription: string | string[]): void {
    const client = this.clients.get(clientId)
    if (!client) return

    const subscriptions = Array.isArray(subscription) ? subscription : [subscription]

    subscriptions.forEach(sub => {
      client.subscriptions.delete(sub)
    })

    this.sendToClient(clientId, {
      type: 'unsubscribed',
      data: { subscriptions: Array.from(client.subscriptions) }
    })
  }

  /**
   * Send initial data for a subscription
   */
  private sendInitialSubscriptionData(clientId: string, subscription: string): void {
    switch (subscription) {
      case 'healthMetrics':
        const healthReport = this.healthMonitor.getHealthReport()
        this.sendToClient(clientId, {
          type: 'healthReport',
          data: healthReport
        })
        break

      case 'agentStatus':
        const allMetrics = this.healthMonitor.getAllHealthMetrics()
        this.sendToClient(clientId, {
          type: 'agentStatusUpdate',
          data: allMetrics
        })
        break

      case 'circuitBreakers':
        const allCircuitBreakers = this.healthMonitor.getHealthReport().circuitBreakers
        this.sendToClient(clientId, {
          type: 'circuitBreakerUpdate',
          data: allCircuitBreakers
        })
        break
    }
  }

  /**
   * Handle agent metrics update
   */
  private handleAgentMetrics(agentId: string, metrics: any): void {
    this.healthMonitor.updateResourceMetrics(agentId, metrics)
  }

  /**
   * Handle agent status update
   */
  private handleAgentStatusUpdate(agentId: string, status: any): void {
    // Update agent status and broadcast to subscribers
    this.broadcastToSubscribers('agentStatus', {
      type: 'agentStatusChanged',
      data: { agentId, status, timestamp: new Date().toISOString() }
    })
  }

  /**
   * Send health metrics to a specific client
   */
  private sendHealthMetrics(clientId: string, agentId?: string): void {
    if (agentId) {
      const metrics = this.healthMonitor.getHealthMetrics(agentId)
      if (metrics) {
        this.sendToClient(clientId, {
          type: 'agentMetrics',
          agentId,
          data: metrics
        })
      }
    } else {
      const healthReport = this.healthMonitor.getHealthReport()
      this.sendToClient(clientId, {
        type: 'healthReport',
        data: healthReport
      })
    }
  }

  /**
   * Setup health monitor event listeners
   */
  private setupHealthMonitorListeners(): void {
    this.healthMonitor.on('statusChanged', (agentId: string, newStatus: string, oldStatus: string) => {
      this.broadcastToSubscribers('agentStatus', {
        type: 'agentStatusChanged',
        data: { agentId, newStatus, oldStatus, timestamp: new Date().toISOString() }
      })
    })

    this.healthMonitor.on('metricsUpdated', (agentId: string, metrics: any) => {
      this.broadcastToSubscribers('healthMetrics', {
        type: 'metricsUpdated',
        agentId,
        data: metrics
      })
    })

    this.healthMonitor.on('circuitBreakerOpened', (agentId: string, error?: string) => {
      this.broadcastToSubscribers('circuitBreakers', {
        type: 'circuitBreakerOpened',
        data: { agentId, error, timestamp: new Date().toISOString() }
      })
    })

    this.healthMonitor.on('circuitBreakerClosed', (agentId: string) => {
      this.broadcastToSubscribers('circuitBreakers', {
        type: 'circuitBreakerClosed',
        data: { agentId, timestamp: new Date().toISOString() }
      })
    })

    this.healthMonitor.on('predictiveAlert', (agentId: string, predictiveHealth: any) => {
      this.broadcastToSubscribers('alerts', {
        type: 'predictiveAlert',
        data: { agentId, predictiveHealth, timestamp: new Date().toISOString() }
      })
    })
  }

  /**
   * Broadcast message to all subscribers of a specific topic
   */
  private broadcastToSubscribers(subscription: string, message: any): void {
    this.clients.forEach(client => {
      if (client.subscriptions.has(subscription) && client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(JSON.stringify({
          ...message,
          timestamp: new Date().toISOString()
        }))
      }
    })
  }

  /**
   * Send message to specific client
   */
  private sendToClient(clientId: string, message: any): void {
    const client = this.clients.get(clientId)
    if (client && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(JSON.stringify({
        ...message,
        timestamp: new Date().toISOString()
      }))
    }
  }

  /**
   * Send message to specific agent
   */
  sendToAgent(agentId: string, message: any): boolean {
    const client = this.agentConnections.get(agentId)
    if (client && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(JSON.stringify({
        ...message,
        timestamp: new Date().toISOString()
      }))
      return true
    }
    return false
  }

  /**
   * Broadcast message to all connected clients
   */
  broadcast(message: any): void {
    this.clients.forEach(client => {
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(JSON.stringify({
          ...message,
          timestamp: new Date().toISOString()
        }))
      }
    })
  }

  /**
   * Handle client disconnect
   */
  private handleClientDisconnect(clientId: string): void {
    const client = this.clients.get(clientId)
    if (!client) return

    if (client.agentId) {
      this.agentConnections.delete(client.agentId)
      // Mark agent as potentially offline
      setTimeout(() => {
        // Double-check if agent reconnected
        if (!this.agentConnections.has(client.agentId!)) {
          this.emit('agentDisconnected', client.agentId)
        }
      }, 5000)
    }

    this.clients.delete(clientId)
    console.log(`WebSocket client disconnected: ${clientId}`)
    this.emit('clientDisconnected', client)
  }

  /**
   * Start ping interval to check client health
   */
  private startPingInterval(): void {
    this.pingInterval = setInterval(() => {
      const now = new Date()

      this.clients.forEach((client, clientId) => {
        const timeSinceLastPing = now.getTime() - client.lastPing.getTime()

        if (timeSinceLastPing > this.CLIENT_TIMEOUT) {
          // Client hasn't responded, disconnect
          console.log(`Client ${clientId} timed out, disconnecting`)
          client.ws.terminate()
          this.handleClientDisconnect(clientId)
        } else if (client.ws.readyState === WebSocket.OPEN) {
          // Send ping
          client.ws.send(JSON.stringify({
            type: 'ping',
            timestamp: now.toISOString()
          }))
        }
      })
    }, this.PING_INTERVAL)
  }

  /**
   * Generate unique client ID
   */
  private generateClientId(): string {
    return `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * Get connection statistics
   */
  getConnectionStats(): {
    totalConnections: number
    agentConnections: number
    dashboardConnections: number
    monitoringConnections: number
    connections: Array<{
      id: string
      type: string
      agentId?: string
      connectedAt: Date
      subscriptions: string[]
    }>
  } {
    const connections = Array.from(this.clients.values())

    return {
      totalConnections: connections.length,
      agentConnections: connections.filter(c => c.type === 'agent').length,
      dashboardConnections: connections.filter(c => c.type === 'dashboard').length,
      monitoringConnections: connections.filter(c => c.type === 'monitoring').length,
      connections: connections.map(c => ({
        id: c.id,
        type: c.type,
        agentId: c.agentId,
        connectedAt: c.metadata.connectedAt,
        subscriptions: Array.from(c.subscriptions)
      }))
    }
  }

  /**
   * Check if agent is connected via WebSocket
   */
  isAgentConnected(agentId: string): boolean {
    const connection = this.agentConnections.get(agentId)
    return connection ? connection.ws.readyState === WebSocket.OPEN : false
  }

  /**
   * Get all connected agent IDs
   */
  getConnectedAgents(): string[] {
    return Array.from(this.agentConnections.keys()).filter(agentId =>
      this.isAgentConnected(agentId)
    )
  }

  /**
   * Cleanup resources
   */
  cleanup(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval)
    }

    // Close all client connections
    this.clients.forEach(client => {
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.close()
      }
    })

    this.clients.clear()
    this.agentConnections.clear()

    // Close WebSocket server
    this.wss.close()
  }
}