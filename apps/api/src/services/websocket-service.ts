import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';
import { ViolationDetectionService } from './violation-detection-service';
import { logger } from '../lib/logger';
import { z } from 'zod';

// WebSocket message schemas
const wsMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('subscribe'),
    organizationId: z.string(),
    subscriptions: z.array(z.enum(['violations', 'compliance-updates', 'policy-changes', 'audit-events']))
  }),
  z.object({
    type: z.literal('unsubscribe'),
    organizationId: z.string(),
    subscriptions: z.array(z.enum(['violations', 'compliance-updates', 'policy-changes', 'audit-events']))
  }),
  z.object({
    type: z.literal('ping')
  }),
  z.object({
    type: z.literal('acknowledge-violation'),
    violationId: z.string(),
    userId: z.string(),
    reason: z.string().optional()
  })
]);

export type WSMessage = z.infer<typeof wsMessageSchema>;

interface ClientConnection {
  ws: WebSocket;
  organizationId: string | null;
  subscriptions: Set<string>;
  userId: string | null;
  lastPing: Date;
}

export class ComplianceWebSocketService {
  private wss: WebSocketServer | null = null;
  private clients = new Map<string, ClientConnection>();
  private violationService: ViolationDetectionService;
  private pingInterval: NodeJS.Timeout | null = null;

  constructor(violationService: ViolationDetectionService) {
    this.violationService = violationService;
    this.setupViolationServiceListeners();
  }

  /**
   * Initialize WebSocket server
   */
  initialize(server: Server): void {
    this.wss = new WebSocketServer({
      server,
      path: '/ws/compliance',
      clientTracking: true
    });

    this.wss.on('connection', (ws, request) => {
      this.handleConnection(ws, request);
    });

    // Setup ping/pong for connection health
    this.pingInterval = setInterval(() => {
      this.sendPingToAllClients();
    }, 30000); // 30 seconds

    logger.info('Compliance WebSocket service initialized');
  }

  /**
   * Handle new WebSocket connection
   */
  private handleConnection(ws: WebSocket, request: any): void {
    const clientId = this.generateClientId();
    const client: ClientConnection = {
      ws,
      organizationId: null,
      subscriptions: new Set(),
      userId: null,
      lastPing: new Date()
    };

    this.clients.set(clientId, client);

    ws.on('message', (data) => {
      this.handleMessage(clientId, data);
    });

    ws.on('close', () => {
      this.handleDisconnection(clientId);
    });

    ws.on('error', (error) => {
      logger.error('WebSocket error', { clientId, error: error.message });
      this.handleDisconnection(clientId);
    });

    ws.on('pong', () => {
      const client = this.clients.get(clientId);
      if (client) {
        client.lastPing = new Date();
      }
    });

    // Send welcome message
    this.sendToClient(clientId, {
      type: 'connected',
      clientId,
      timestamp: new Date().toISOString()
    });

    logger.info('New WebSocket client connected', { clientId });
  }

  /**
   * Handle incoming WebSocket messages
   */
  private async handleMessage(clientId: string, data: any): Promise<void> {
    try {
      const message = JSON.parse(data.toString());
      const parsedMessage = wsMessageSchema.parse(message);
      const client = this.clients.get(clientId);

      if (!client) {
        logger.warn('Message from unknown client', { clientId });
        return;
      }

      switch (parsedMessage.type) {
        case 'subscribe':
          await this.handleSubscribe(clientId, parsedMessage);
          break;

        case 'unsubscribe':
          this.handleUnsubscribe(clientId, parsedMessage);
          break;

        case 'ping':
          this.handlePing(clientId);
          break;

        case 'acknowledge-violation':
          await this.handleViolationAcknowledgment(clientId, parsedMessage);
          break;

        default:
          logger.warn('Unknown message type', { clientId, type: (parsedMessage as any).type });
      }

    } catch (error) {
      logger.error('Error handling WebSocket message', {
        clientId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      this.sendToClient(clientId, {
        type: 'error',
        message: 'Invalid message format',
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Handle client subscription to compliance events
   */
  private async handleSubscribe(clientId: string, message: WSMessage & { type: 'subscribe' }): Promise<void> {
    const client = this.clients.get(clientId);
    if (!client) return;

    // TODO: Add proper authentication/authorization here
    // For now, we'll trust the organizationId from the client
    client.organizationId = message.organizationId;

    message.subscriptions.forEach(subscription => {
      client.subscriptions.add(subscription);
    });

    this.sendToClient(clientId, {
      type: 'subscribed',
      organizationId: message.organizationId,
      subscriptions: message.subscriptions,
      timestamp: new Date().toISOString()
    });

    logger.info('Client subscribed to compliance events', {
      clientId,
      organizationId: message.organizationId,
      subscriptions: message.subscriptions
    });
  }

  /**
   * Handle client unsubscription
   */
  private handleUnsubscribe(clientId: string, message: WSMessage & { type: 'unsubscribe' }): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    message.subscriptions.forEach(subscription => {
      client.subscriptions.delete(subscription);
    });

    this.sendToClient(clientId, {
      type: 'unsubscribed',
      subscriptions: message.subscriptions,
      timestamp: new Date().toISOString()
    });

    logger.info('Client unsubscribed from compliance events', {
      clientId,
      subscriptions: message.subscriptions
    });
  }

  /**
   * Handle ping message
   */
  private handlePing(clientId: string): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    client.lastPing = new Date();
    this.sendToClient(clientId, {
      type: 'pong',
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Handle violation acknowledgment
   */
  private async handleViolationAcknowledgment(
    clientId: string,
    message: WSMessage & { type: 'acknowledge-violation' }
  ): Promise<void> {
    try {
      const client = this.clients.get(clientId);
      if (!client || !client.organizationId) return;

      // TODO: Implement violation acknowledgment in violation service
      // await this.violationService.acknowledgeViolation(
      //   message.violationId,
      //   message.userId,
      //   message.reason
      // );

      this.sendToClient(clientId, {
        type: 'violation-acknowledged',
        violationId: message.violationId,
        timestamp: new Date().toISOString()
      });

      // Broadcast to other subscribers
      this.broadcastToOrganization(client.organizationId, {
        type: 'violation-acknowledged',
        violationId: message.violationId,
        acknowledgedBy: message.userId,
        reason: message.reason,
        timestamp: new Date().toISOString()
      }, clientId);

    } catch (error) {
      logger.error('Error acknowledging violation', {
        clientId,
        violationId: message.violationId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      this.sendToClient(clientId, {
        type: 'error',
        message: 'Failed to acknowledge violation',
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Handle client disconnection
   */
  private handleDisconnection(clientId: string): void {
    const client = this.clients.get(clientId);
    if (client) {
      logger.info('WebSocket client disconnected', {
        clientId,
        organizationId: client.organizationId,
        subscriptions: Array.from(client.subscriptions)
      });
    }

    this.clients.delete(clientId);
  }

  /**
   * Setup listeners for violation service events
   */
  private setupViolationServiceListeners(): void {
    this.violationService.on('violation-detected', (violation) => {
      this.broadcastViolationAlert(violation);
    });

    this.violationService.on('risk-threshold-exceeded', (data) => {
      this.broadcastRiskAlert(data);
    });

    this.violationService.on('compliance-status-changed', (data) => {
      this.broadcastComplianceUpdate(data);
    });
  }

  /**
   * Broadcast violation alert to subscribed clients
   */
  private broadcastViolationAlert(violation: any): void {
    const message = {
      type: 'violation-alert',
      violation: {
        id: violation.id,
        policyId: violation.policyId,
        severity: violation.severity,
        title: violation.title,
        description: violation.description,
        resourceId: violation.resourceId,
        resourceType: violation.resourceType,
        timestamp: violation.timestamp,
        riskScore: violation.riskScore
      },
      timestamp: new Date().toISOString()
    };

    this.broadcastToOrganization(violation.organizationId, message);
    logger.info('Broadcasted violation alert', {
      organizationId: violation.organizationId,
      violationId: violation.id,
      severity: violation.severity
    });
  }

  /**
   * Broadcast risk threshold alert
   */
  private broadcastRiskAlert(data: any): void {
    const message = {
      type: 'risk-alert',
      organizationId: data.organizationId,
      currentRiskScore: data.currentRiskScore,
      threshold: data.threshold,
      recentViolations: data.recentViolations,
      timestamp: new Date().toISOString()
    };

    this.broadcastToOrganization(data.organizationId, message);
    logger.info('Broadcasted risk alert', {
      organizationId: data.organizationId,
      riskScore: data.currentRiskScore
    });
  }

  /**
   * Broadcast compliance status updates
   */
  private broadcastComplianceUpdate(data: any): void {
    const message = {
      type: 'compliance-update',
      organizationId: data.organizationId,
      framework: data.framework,
      previousStatus: data.previousStatus,
      currentStatus: data.currentStatus,
      affectedPolicies: data.affectedPolicies,
      timestamp: new Date().toISOString()
    };

    this.broadcastToOrganization(data.organizationId, message);
    logger.info('Broadcasted compliance update', {
      organizationId: data.organizationId,
      framework: data.framework,
      status: data.currentStatus
    });
  }

  /**
   * Send message to specific client
   */
  private sendToClient(clientId: string, message: any): void {
    const client = this.clients.get(clientId);
    if (!client || client.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    try {
      client.ws.send(JSON.stringify(message));
    } catch (error) {
      logger.error('Failed to send message to client', {
        clientId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      this.handleDisconnection(clientId);
    }
  }

  /**
   * Broadcast message to all clients in an organization
   */
  private broadcastToOrganization(organizationId: string, message: any, excludeClientId?: string): void {
    let sentCount = 0;

    for (const [clientId, client] of this.clients.entries()) {
      if (
        client.organizationId === organizationId &&
        client.ws.readyState === WebSocket.OPEN &&
        clientId !== excludeClientId &&
        (client.subscriptions.has('violations') ||
         client.subscriptions.has('compliance-updates') ||
         client.subscriptions.has('audit-events'))
      ) {
        this.sendToClient(clientId, message);
        sentCount++;
      }
    }

    logger.debug('Broadcasted message to organization', {
      organizationId,
      messageType: message.type,
      clientCount: sentCount
    });
  }

  /**
   * Send ping to all connected clients
   */
  private sendPingToAllClients(): void {
    const now = new Date();
    const staleThreshold = 60000; // 60 seconds

    for (const [clientId, client] of this.clients.entries()) {
      const timeSincePing = now.getTime() - client.lastPing.getTime();

      if (timeSincePing > staleThreshold) {
        logger.warn('Removing stale client connection', { clientId });
        this.handleDisconnection(clientId);
      } else if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.ping();
      }
    }
  }

  /**
   * Generate unique client ID
   */
  private generateClientId(): string {
    return `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get connection statistics
   */
  getConnectionStats(): {
    totalConnections: number;
    connectionsByOrganization: Record<string, number>;
    activeSubscriptions: Record<string, number>;
  } {
    const stats = {
      totalConnections: this.clients.size,
      connectionsByOrganization: {} as Record<string, number>,
      activeSubscriptions: {} as Record<string, number>
    };

    for (const client of this.clients.values()) {
      if (client.organizationId) {
        stats.connectionsByOrganization[client.organizationId] =
          (stats.connectionsByOrganization[client.organizationId] || 0) + 1;
      }

      for (const subscription of client.subscriptions) {
        stats.activeSubscriptions[subscription] =
          (stats.activeSubscriptions[subscription] || 0) + 1;
      }
    }

    return stats;
  }

  /**
   * Shutdown WebSocket service
   */
  shutdown(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }

    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }

    this.clients.clear();
    logger.info('Compliance WebSocket service shutdown');
  }
}