import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import Redis from 'ioredis';
import { PrismaClient } from '@prisma/client';

/**
 * Escalation Manager for Automated Remediation
 *
 * Manages time-based escalation workflows for policy violations that require
 * progressive response actions when initial remediation fails or is insufficient.
 */

export interface EscalationRequest {
  executionId: string;
  violationId: string;
  escalationLevel: number;
  escalationActions: any[];
  delayMs: number;
  maxLevel: number;
  metadata?: Record<string, any>;
}

export interface EscalationExecution {
  id: string;
  executionId: string;
  violationId: string;
  level: number;
  maxLevel: number;

  status: 'scheduled' | 'in_progress' | 'completed' | 'failed' | 'cancelled';
  scheduledAt: Date;
  triggeredAt?: Date;
  completedAt?: Date;

  actions: any[];
  executedActions: Array<{
    actionId: string;
    actionType: string;
    status: 'pending' | 'running' | 'success' | 'failed';
    startedAt?: Date;
    completedAt?: Date;
    result?: any;
    error?: string;
  }>;

  nextEscalationAt?: Date;
  escalationChain: string[];

  metadata: Record<string, any>;
}

export interface EscalationPolicy {
  id: string;
  name: string;
  description: string;
  enabled: boolean;

  // Triggers
  triggerConditions: {
    failedActionThreshold?: number;
    criticalViolations?: boolean;
    timeBasedEscalation?: boolean;
  };

  // Escalation levels
  levels: Array<{
    level: number;
    delayMs: number;
    actions: any[];
    notificationTargets: string[];
    requiresApproval?: boolean;
    autoCancel?: boolean;
  }>;

  // Limits
  maxLevel: number;
  maxExecutionTime: number;
  autoExpireAfter: number;

  // Compliance
  complianceFrameworks: string[];
  auditRequired: boolean;
}

export class EscalationManager extends EventEmitter {
  private redis: Redis;
  private prisma: PrismaClient;
  private isInitialized = false;
  private isRunning = false;

  // Active escalations tracking
  private activeEscalations: Map<string, EscalationExecution> = new Map();
  private escalationPolicies: Map<string, EscalationPolicy> = new Map();

  // Timers for scheduled escalations
  private escalationTimers: Map<string, NodeJS.Timeout> = new Map();

  // Processing intervals
  private processingInterval?: NodeJS.Timeout;
  private cleanupInterval?: NodeJS.Timeout;

  constructor(redis?: Redis, prisma?: PrismaClient) {
    super();

    this.redis = redis || new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
    this.prisma = prisma || new PrismaClient();
  }

  /**
   * Initialize the escalation manager
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // Test connections
      await this.redis.ping();
      await this.prisma.$connect();

      // Load escalation policies
      await this.loadDefaultPolicies();

      // Start processing intervals
      this.startProcessingIntervals();

      this.isInitialized = true;
      this.isRunning = true;

      this.emit('initialized');

    } catch (error) {
      throw new Error(`Failed to initialize EscalationManager: ${error}`);
    }
  }

  /**
   * Trigger escalation for a remediation execution
   */
  async triggerEscalation(request: EscalationRequest): Promise<string> {
    if (!this.isInitialized || !this.isRunning) {
      throw new Error('EscalationManager not initialized or not running');
    }

    const escalationId = uuidv4();

    try {
      const escalation: EscalationExecution = {
        id: escalationId,
        executionId: request.executionId,
        violationId: request.violationId,
        level: request.escalationLevel,
        maxLevel: request.maxLevel,
        status: 'scheduled',
        scheduledAt: new Date(),
        actions: request.escalationActions,
        executedActions: [],
        escalationChain: [`level_${request.escalationLevel}`],
        metadata: request.metadata || {}
      };

      // Calculate next escalation time
      if (request.escalationLevel < request.maxLevel) {
        escalation.nextEscalationAt = new Date(Date.now() + request.delayMs);
      }

      this.activeEscalations.set(escalationId, escalation);

      // Schedule the escalation
      await this.scheduleEscalation(escalation, request.delayMs);

      // Store in Redis for persistence
      await this.redis.setex(
        `escalation:${escalationId}`,
        86400, // 24 hours
        JSON.stringify(escalation)
      );

      this.emit('escalation_scheduled', {
        escalationId,
        executionId: request.executionId,
        level: request.escalationLevel,
        delayMs: request.delayMs
      });

      return escalationId;

    } catch (error) {
      this.emit('escalation_error', {
        escalationId,
        error: error instanceof Error ? error.message : String(error)
      });

      throw error;
    }
  }

  /**
   * Cancel an active escalation
   */
  async cancelEscalation(escalationId: string, reason: string = 'Manual cancellation'): Promise<void> {
    const escalation = this.activeEscalations.get(escalationId);
    if (!escalation) {
      throw new Error(`Escalation ${escalationId} not found`);
    }

    // Cancel timer if exists
    const timer = this.escalationTimers.get(escalationId);
    if (timer) {
      clearTimeout(timer);
      this.escalationTimers.delete(escalationId);
    }

    // Update status
    escalation.status = 'cancelled';
    escalation.completedAt = new Date();
    escalation.metadata.cancellationReason = reason;

    // Clean up
    this.activeEscalations.delete(escalationId);
    await this.redis.del(`escalation:${escalationId}`);

    this.emit('escalation_cancelled', {
      escalationId,
      reason,
      level: escalation.level
    });
  }

  /**
   * Get active escalations
   */
  getActiveEscalations(): EscalationExecution[] {
    return Array.from(this.activeEscalations.values());
  }

  /**
   * Get escalation by ID
   */
  getEscalation(escalationId: string): EscalationExecution | undefined {
    return this.activeEscalations.get(escalationId);
  }

  /**
   * Add escalation policy
   */
  async addEscalationPolicy(policy: EscalationPolicy): Promise<void> {
    this.escalationPolicies.set(policy.id, policy);

    this.emit('policy_added', {
      policyId: policy.id,
      policyName: policy.name
    });
  }

  /**
   * Stop the escalation manager
   */
  async stop(): Promise<void> {
    this.isRunning = false;

    // Clear all timers
    for (const timer of this.escalationTimers.values()) {
      clearTimeout(timer);
    }
    this.escalationTimers.clear();

    // Clear processing intervals
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
    }
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    // Cancel all active escalations
    for (const escalationId of this.activeEscalations.keys()) {
      await this.cancelEscalation(escalationId, 'System shutdown');
    }

    // Close connections
    await this.redis.quit();
    await this.prisma.$disconnect();

    this.emit('stopped');
  }

  /**
   * Private methods
   */

  private async scheduleEscalation(escalation: EscalationExecution, delayMs: number): Promise<void> {
    const timer = setTimeout(async () => {
      try {
        await this.executeEscalation(escalation.id);
      } catch (error) {
        this.emit('escalation_error', {
          escalationId: escalation.id,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }, delayMs);

    this.escalationTimers.set(escalation.id, timer);
  }

  private async executeEscalation(escalationId: string): Promise<void> {
    const escalation = this.activeEscalations.get(escalationId);
    if (!escalation || escalation.status !== 'scheduled') {
      return;
    }

    escalation.status = 'in_progress';
    escalation.triggeredAt = new Date();

    this.emit('escalation_triggered', {
      escalationId,
      executionId: escalation.executionId,
      level: escalation.level,
      reason: 'Scheduled escalation triggered'
    });

    try {
      // Execute escalation actions
      for (const action of escalation.actions) {
        const actionExecution: any = {
          actionId: action.id,
          actionType: action.type,
          status: 'pending',
          startedAt: new Date()
        };

        escalation.executedActions.push(actionExecution);

        try {
          actionExecution.status = 'running';

          // Execute the action (this would integrate with ResponseActionExecutor)
          const result = await this.executeEscalationAction(action, escalation);

          actionExecution.status = 'success';
          actionExecution.completedAt = new Date();
          actionExecution.result = result;

        } catch (error) {
          actionExecution.status = 'failed';
          actionExecution.completedAt = new Date();
          actionExecution.error = error instanceof Error ? error.message : String(error);
        }
      }

      // Check if further escalation is needed
      const needsNextLevel = await this.shouldEscalateToNextLevel(escalation);

      if (needsNextLevel && escalation.level < escalation.maxLevel) {
        await this.scheduleNextLevelEscalation(escalation);
      } else {
        escalation.status = 'completed';
        escalation.completedAt = new Date();
        this.activeEscalations.delete(escalationId);
      }

      // Update Redis
      await this.redis.setex(
        `escalation:${escalationId}`,
        86400,
        JSON.stringify(escalation)
      );

      this.emit('escalation_executed', {
        escalationId,
        level: escalation.level,
        actionsExecuted: escalation.executedActions.length,
        nextLevel: needsNextLevel && escalation.level < escalation.maxLevel
      });

    } catch (error) {
      escalation.status = 'failed';
      escalation.completedAt = new Date();
      this.activeEscalations.delete(escalationId);

      this.emit('escalation_failed', {
        escalationId,
        level: escalation.level,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  private async executeEscalationAction(action: any, escalation: EscalationExecution): Promise<any> {
    // This would integrate with the ResponseActionExecutor
    // For now, we'll simulate the execution

    switch (action.type) {
      case 'notify_admin':
        return await this.executeNotificationAction(action, escalation);

      case 'create_incident':
        return await this.createIncidentAction(action, escalation);

      case 'require_approval':
        return await this.requireApprovalAction(action, escalation);

      case 'suspend_system':
        return await this.suspendSystemAction(action, escalation);

      default:
        throw new Error(`Unknown escalation action type: ${action.type}`);
    }
  }

  private async executeNotificationAction(action: any, escalation: EscalationExecution): Promise<any> {
    const { recipients, urgency = 'critical', escalationLevel } = action.config;

    // Create high-priority notifications
    const notifications = await Promise.all(recipients.map(async (recipient: string) => {
      return await this.prisma.notification.create({
        data: {
          id: uuidv4(),
          type: 'escalation_notification',
          title: `ESCALATION LEVEL ${escalation.level} - Policy Violation`,
          message: `
            ESCALATED POLICY VIOLATION - IMMEDIATE ATTENTION REQUIRED

            Violation ID: ${escalation.violationId}
            Escalation Level: ${escalation.level}/${escalation.maxLevel}
            Time: ${new Date().toISOString()}

            Initial remediation actions have failed or been insufficient.
            Manual intervention is now required.

            Escalation ID: ${escalation.id}
            Execution ID: ${escalation.executionId}
          `,
          urgency: 'critical',
          recipientEmail: recipient,
          metadata: {
            escalationId: escalation.id,
            violationId: escalation.violationId,
            escalationLevel: escalation.level,
            type: 'escalation'
          },
          status: 'pending',
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 3600000) // 1 hour
        }
      });
    }));

    // Queue for immediate processing
    for (const notification of notifications) {
      await this.redis.lpush('notifications:priority', JSON.stringify(notification));
    }

    return {
      action: 'escalation_notifications_sent',
      recipients,
      notificationIds: notifications.map(n => n.id),
      escalationLevel: escalation.level
    };
  }

  private async createIncidentAction(action: any, escalation: EscalationExecution): Promise<any> {
    const { severity = 'critical', assignTo = 'security-team' } = action.config;

    const incident = await this.prisma.securityEvent.create({
      data: {
        id: uuidv4(),
        type: 'escalated_policy_violation',
        severity,
        status: 'new',
        title: `Escalated Policy Violation - Level ${escalation.level}`,
        description: `
          Policy violation has been escalated to level ${escalation.level} due to
          insufficient initial remediation response.

          Original Violation ID: ${escalation.violationId}
          Escalation ID: ${escalation.id}
          Escalation Level: ${escalation.level}/${escalation.maxLevel}

          Immediate investigation and response required.
        `,
        source: 'escalation_manager',
        category: 'policy_compliance',
        organizationId: 'system', // This would come from context
        metadata: {
          escalationId: escalation.id,
          violationId: escalation.violationId,
          escalationLevel: escalation.level,
          escalationMetadata: escalation.metadata
        },
        assignedTo: assignTo,
        riskScore: 9.0, // High risk due to escalation
        impact: 'critical',
        likelihood: 'high',
        detectedAt: new Date(),
        createdAt: new Date()
      }
    });

    return {
      action: 'escalation_incident_created',
      incidentId: incident.id,
      escalationLevel: escalation.level,
      assignedTo: assignTo
    };
  }

  private async requireApprovalAction(action: any, escalation: EscalationExecution): Promise<any> {
    const { approvers, timeoutMs = 1800000 } = action.config; // 30 min default

    const approvalRequest = await this.prisma.approvalRequest.create({
      data: {
        id: uuidv4(),
        taskId: escalation.executionId,
        violationId: escalation.violationId,
        requesterId: 'escalation_manager',
        approverEmails: approvers,
        reason: `Escalated policy violation requires executive approval - Level ${escalation.level}`,
        requireAllApprovers: escalation.level >= escalation.maxLevel,
        status: 'pending',
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + timeoutMs),
        metadata: {
          escalationId: escalation.id,
          escalationLevel: escalation.level,
          type: 'escalation_approval'
        }
      }
    });

    return {
      action: 'escalation_approval_required',
      approvalRequestId: approvalRequest.id,
      escalationLevel: escalation.level,
      approvers
    };
  }

  private async suspendSystemAction(action: any, escalation: EscalationExecution): Promise<any> {
    const { duration = '1h', scope = 'affected_subsystem' } = action.config;

    // This would integrate with system controls
    const suspensionKey = `system:suspended:${scope}:${escalation.violationId}`;
    const ttlSeconds = this.parseDurationToSeconds(duration);

    await this.redis.setex(suspensionKey, ttlSeconds, JSON.stringify({
      suspendedAt: new Date().toISOString(),
      reason: `Escalated policy violation - Level ${escalation.level}`,
      escalationId: escalation.id,
      violationId: escalation.violationId,
      scope
    }));

    return {
      action: 'system_suspended',
      scope,
      duration,
      escalationLevel: escalation.level,
      suspendedAt: new Date()
    };
  }

  private async shouldEscalateToNextLevel(escalation: EscalationExecution): Promise<boolean> {
    // Check if any critical actions failed
    const criticalFailures = escalation.executedActions.some(action =>
      action.status === 'failed' && action.actionType.includes('critical')
    );

    // Check failure rate
    const failureRate = escalation.executedActions.filter(a => a.status === 'failed').length /
                       escalation.executedActions.length;

    // Escalate if there are critical failures or high failure rate
    return criticalFailures || failureRate > 0.5 || escalation.level < escalation.maxLevel;
  }

  private async scheduleNextLevelEscalation(escalation: EscalationExecution): Promise<void> {
    escalation.level++;
    escalation.escalationChain.push(`level_${escalation.level}`);
    escalation.status = 'scheduled';

    const policy = Array.from(this.escalationPolicies.values())[0]; // Use default policy
    const nextLevelDelay = policy?.levels.find(l => l.level === escalation.level)?.delayMs || 600000; // 10 min default

    escalation.nextEscalationAt = new Date(Date.now() + nextLevelDelay);

    await this.scheduleEscalation(escalation, nextLevelDelay);
  }

  private startProcessingIntervals(): void {
    // Process escalation queue every 30 seconds
    this.processingInterval = setInterval(async () => {
      try {
        await this.processEscalationQueue();
      } catch (error) {
        this.emit('processing_error', error);
      }
    }, 30000);

    // Cleanup expired escalations every 5 minutes
    this.cleanupInterval = setInterval(async () => {
      try {
        await this.cleanupExpiredEscalations();
      } catch (error) {
        this.emit('cleanup_error', error);
      }
    }, 300000);
  }

  private async processEscalationQueue(): Promise<void> {
    // Process any queued escalations from Redis
    const queuedEscalations = await this.redis.lrange('escalations:queue', 0, -1);

    for (const escalationData of queuedEscalations) {
      try {
        const escalation = JSON.parse(escalationData);
        await this.triggerEscalation(escalation);
        await this.redis.lrem('escalations:queue', 1, escalationData);
      } catch (error) {
        this.emit('queue_processing_error', error);
      }
    }
  }

  private async cleanupExpiredEscalations(): Promise<void> {
    const now = Date.now();
    const expiredEscalations: string[] = [];

    for (const [escalationId, escalation] of this.activeEscalations.entries()) {
      const age = now - escalation.scheduledAt.getTime();
      const maxAge = 86400000; // 24 hours

      if (age > maxAge) {
        expiredEscalations.push(escalationId);
      }
    }

    for (const escalationId of expiredEscalations) {
      await this.cancelEscalation(escalationId, 'Expired - exceeded maximum age');
    }
  }

  private parseDurationToSeconds(duration: string): number {
    const units: Record<string, number> = {
      s: 1,
      m: 60,
      h: 3600,
      d: 86400
    };

    const match = duration.match(/^(\d+)([smhd])$/);
    if (!match) {
      throw new Error(`Invalid duration format: ${duration}`);
    }

    const [, value, unit] = match;
    return parseInt(value) * units[unit];
  }

  private async loadDefaultPolicies(): Promise<void> {
    const defaultPolicy: EscalationPolicy = {
      id: 'default-escalation-policy',
      name: 'Default Escalation Policy',
      description: 'Standard escalation policy for policy violations',
      enabled: true,
      triggerConditions: {
        failedActionThreshold: 2,
        criticalViolations: true,
        timeBasedEscalation: true
      },
      levels: [
        {
          level: 1,
          delayMs: 600000, // 10 minutes
          actions: [
            {
              id: 'notify-security-team',
              type: 'notify_admin',
              config: {
                recipients: ['security-team@urnlabs.ai'],
                urgency: 'high',
                escalationLevel: 1
              }
            }
          ],
          notificationTargets: ['security-team@urnlabs.ai']
        },
        {
          level: 2,
          delayMs: 1800000, // 30 minutes
          actions: [
            {
              id: 'create-critical-incident',
              type: 'create_incident',
              config: {
                severity: 'critical',
                assignTo: 'incident-response-team'
              }
            },
            {
              id: 'notify-executives',
              type: 'notify_admin',
              config: {
                recipients: ['cto@urnlabs.ai', 'ceo@urnlabs.ai'],
                urgency: 'critical',
                escalationLevel: 2
              }
            }
          ],
          notificationTargets: ['cto@urnlabs.ai', 'ceo@urnlabs.ai'],
          requiresApproval: true
        },
        {
          level: 3,
          delayMs: 3600000, // 1 hour
          actions: [
            {
              id: 'suspend-affected-systems',
              type: 'suspend_system',
              config: {
                duration: '2h',
                scope: 'affected_subsystem'
              }
            },
            {
              id: 'require-executive-approval',
              type: 'require_approval',
              config: {
                approvers: ['cto@urnlabs.ai', 'ceo@urnlabs.ai'],
                timeoutMs: 1800000
              }
            }
          ],
          notificationTargets: ['board@urnlabs.ai'],
          autoCancel: false
        }
      ],
      maxLevel: 3,
      maxExecutionTime: 7200000, // 2 hours
      autoExpireAfter: 86400000, // 24 hours
      complianceFrameworks: ['SOX', 'GDPR', 'HIPAA', 'PCI'],
      auditRequired: true
    };

    this.escalationPolicies.set(defaultPolicy.id, defaultPolicy);
  }
}