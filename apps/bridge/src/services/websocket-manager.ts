import { WebSocket } from 'ws'

export interface WebSocketMessage {
  type: string
  data: any
  timestamp?: string
}

export interface ConnectedClient {
  id: string
  socket: WebSocket
  subscriptions: Set<string>
  connectedAt: Date
  lastActivity: Date
}

export class WebSocketManager {
  private clients = new Map<string, ConnectedClient>()
  private messageHandlers = new Map<string, (client: ConnectedClient, data: any) => Promise<void>>()
  private heartbeatInterval: NodeJS.Timeout | null = null

  constructor() {
    this.initializeMessageHandlers()
    this.startHeartbeat()
  }

  /**
   * Initialize message handlers for different message types
   */
  private initializeMessageHandlers() {
    this.messageHandlers.set('subscribe', async (client, data) => {
      const { channels } = data
      if (Array.isArray(channels)) {
        channels.forEach(channel => client.subscriptions.add(channel))
        this.sendToClient(client, {
          type: 'subscription_confirmed',
          data: { channels: Array.from(client.subscriptions) }
        })
      }
    })

    this.messageHandlers.set('unsubscribe', async (client, data) => {
      const { channels } = data
      if (Array.isArray(channels)) {
        channels.forEach(channel => client.subscriptions.delete(channel))
        this.sendToClient(client, {
          type: 'subscription_updated',
          data: { channels: Array.from(client.subscriptions) }
        })
      }
    })

    this.messageHandlers.set('ping', async (client, data) => {
      client.lastActivity = new Date()
      this.sendToClient(client, {
        type: 'pong',
        data: { timestamp: new Date().toISOString() }
      })
    })

    this.messageHandlers.set('get_status', async (client, data) => {
      this.sendToClient(client, {
        type: 'status_update',
        data: {
          clientId: client.id,
          connectedClients: this.clients.size,
          subscriptions: Array.from(client.subscriptions),
          uptime: Date.now() - client.connectedAt.getTime()
        }
      })
    })
  }

  /**
   * Add a new WebSocket connection
   */
  addConnection(socket: WebSocket): string {
    const clientId = this.generateClientId()
    const client: ConnectedClient = {
      id: clientId,
      socket,
      subscriptions: new Set(['system', 'agents', 'tasks']), // Default subscriptions
      connectedAt: new Date(),
      lastActivity: new Date()
    }

    this.clients.set(clientId, client)

    // Send welcome message
    this.sendToClient(client, {
      type: 'connected',
      data: {
        clientId,
        timestamp: new Date().toISOString(),
        defaultSubscriptions: Array.from(client.subscriptions)
      }
    })

    // Setup socket event handlers
    socket.on('close', () => {
      this.removeConnection(socket)
    })

    socket.on('error', (error) => {
      console.error(`WebSocket error for client ${clientId}:`, error)
      this.removeConnection(socket)
    })

    console.log(`WebSocket client connected: ${clientId} (total: ${this.clients.size})`)
    return clientId
  }

  /**
   * Remove a WebSocket connection
   */
  removeConnection(socket: WebSocket): void {
    for (const [clientId, client] of this.clients.entries()) {
      if (client.socket === socket) {
        this.clients.delete(clientId)
        console.log(`WebSocket client disconnected: ${clientId} (total: ${this.clients.size})`)
        break
      }
    }
  }

  /**
   * Handle incoming WebSocket message
   */
  async handleMessage(socket: WebSocket, message: WebSocketMessage): Promise<void> {
    const client = this.findClientBySocket(socket)
    if (!client) {
      console.error('Received message from unknown client')
      return
    }

    client.lastActivity = new Date()

    const handler = this.messageHandlers.get(message.type)
    if (handler) {
      try {
        await handler(client, message.data)
      } catch (error) {
        console.error(`Error handling message type ${message.type}:`, error)
        this.sendToClient(client, {
          type: 'error',
          data: {
            message: 'Failed to process message',
            originalType: message.type,
            error: error.message
          }
        })
      }
    } else {
      console.warn(`Unknown message type: ${message.type}`)
      this.sendToClient(client, {
        type: 'error',
        data: {
          message: `Unknown message type: ${message.type}`,
          supportedTypes: Array.from(this.messageHandlers.keys())
        }
      })
    }
  }

  /**
   * Broadcast message to all connected clients
   */
  broadcast(message: WebSocketMessage, channel?: string): void {
    const messageWithTimestamp = {
      ...message,
      timestamp: message.timestamp || new Date().toISOString()
    }

    let sentCount = 0
    
    for (const client of this.clients.values()) {
      if (client.socket.readyState === WebSocket.OPEN) {
        // Send to clients subscribed to the specific channel or all clients if no channel specified
        if (!channel || client.subscriptions.has(channel)) {
          this.sendToClient(client, messageWithTimestamp)
          sentCount++
        }
      }
    }

    console.log(`Broadcasted ${message.type} to ${sentCount} clients${channel ? ` (channel: ${channel})` : ''}`)
  }

  /**
   * Send message to specific client
   */
  private sendToClient(client: ConnectedClient, message: WebSocketMessage): void {
    if (client.socket.readyState === WebSocket.OPEN) {
      try {
        client.socket.send(JSON.stringify(message))
      } catch (error) {
        console.error(`Failed to send message to client ${client.id}:`, error)
        this.clients.delete(client.id)
      }
    }
  }

  /**
   * Send message to specific client by ID
   */
  sendToClientById(clientId: string, message: WebSocketMessage): boolean {
    const client = this.clients.get(clientId)
    if (client) {
      this.sendToClient(client, message)
      return true
    }
    return false
  }

  /**
   * Find client by socket connection
   */
  private findClientBySocket(socket: WebSocket): ConnectedClient | null {
    for (const client of this.clients.values()) {
      if (client.socket === socket) {
        return client
      }
    }
    return null
  }

  /**
   * Generate unique client ID
   */
  private generateClientId(): string {
    return `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * Start heartbeat to keep connections alive and clean up dead ones
   */
  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      const now = new Date()
      const deadClients: string[] = []

      for (const [clientId, client] of this.clients.entries()) {
        // Check if client has been inactive for more than 5 minutes
        if (now.getTime() - client.lastActivity.getTime() > 300000) {
          deadClients.push(clientId)
        } else if (client.socket.readyState === WebSocket.OPEN) {
          // Send ping to active clients
          this.sendToClient(client, {
            type: 'ping',
            data: { timestamp: now.toISOString() }
          })
        }
      }

      // Clean up dead clients
      deadClients.forEach(clientId => {
        const client = this.clients.get(clientId)
        if (client) {
          client.socket.terminate()
          this.clients.delete(clientId)
          console.log(`Removed inactive client: ${clientId}`)
        }
      })
    }, 60000) // Run every minute
  }

  /**
   * Get connection statistics
   */
  getStats(): {
    totalClients: number
    activeClients: number
    subscriptionCounts: Record<string, number>
    clientDetails: Array<{
      id: string
      connectedAt: string
      lastActivity: string
      subscriptions: string[]
      uptime: number
    }>
  } {
    const subscriptionCounts: Record<string, number> = {}
    const clientDetails: Array<{
      id: string
      connectedAt: string
      lastActivity: string
      subscriptions: string[]
      uptime: number
    }> = []

    const now = new Date()

    for (const client of this.clients.values()) {
      // Count subscriptions
      client.subscriptions.forEach(sub => {
        subscriptionCounts[sub] = (subscriptionCounts[sub] || 0) + 1
      })

      // Collect client details
      clientDetails.push({
        id: client.id,
        connectedAt: client.connectedAt.toISOString(),
        lastActivity: client.lastActivity.toISOString(),
        subscriptions: Array.from(client.subscriptions),
        uptime: now.getTime() - client.connectedAt.getTime()
      })
    }

    const activeClients = Array.from(this.clients.values()).filter(
      client => client.socket.readyState === WebSocket.OPEN
    ).length

    return {
      totalClients: this.clients.size,
      activeClients,
      subscriptionCounts,
      clientDetails
    }
  }

  /**
   * Cleanup resources
   */
  cleanup(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval)
    }

    // Close all connections
    for (const client of this.clients.values()) {
      if (client.socket.readyState === WebSocket.OPEN) {
        client.socket.close()
      }
    }

    this.clients.clear()
  }

  /**
   * Broadcast agent status updates
   */
  broadcastAgentStatus(agentType: string, status: string, data?: any): void {
    this.broadcast({
      type: 'agent_status_update',
      data: {
        agentType,
        status,
        ...data
      }
    }, 'agents')
  }

  /**
   * Broadcast task execution updates
   */
  broadcastTaskUpdate(taskId: string, status: string, result?: any): void {
    this.broadcast({
      type: 'task_update',
      data: {
        taskId,
        status,
        result
      }
    }, 'tasks')
  }

  /**
   * Broadcast system health updates
   */
  broadcastSystemHealth(health: { status: string; score: number; reasons: string[] }): void {
    this.broadcast({
      type: 'system_health_update',
      data: health
    }, 'system')
  }
}