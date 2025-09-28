import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import Redis from 'ioredis';
import { PrismaClient } from '@prisma/client';

/**
 * Response Action Executor for Automated Remediation
 *
 * Executes specific remediation actions in response to policy violations.
 * Supports various action types with configurable parameters and retry logic.
 */

export interface ActionExecutionContext {
  id: string;
  violationId: string;
  remediationPolicyId: string;
  taskContext?: any;
  violationContext: Record<string, any>;
  initiatedBy: string;
  initiatedAt: Date;
}

export interface ActionResult {
  success: boolean;
  actionId: string;
  executionId: string;
  result?: any;
  error?: string;
  metadata?: Record<string, any>;
  executionTimeMs: number;
}

export interface NotificationConfig {
  recipients: string[];
  urgency: 'low' | 'medium' | 'high' | 'critical';
  escalationTimeoutMs?: number;
  template?: string;
  complianceRequired?: boolean;
}

export interface ApprovalConfig {
  approvers: string[];
  timeoutMs: number;
  escalationChain?: string[];
  requireAllApprovers?: boolean;
}

export interface TaskControlConfig {
  immediate?: boolean;
  reason: string;
  gracePeriodMs?: number;
  preserveState?: boolean;
}

export interface DataQuarantineConfig {
  quarantineLocation: string;
  ttl?: string;
  encryptionRequired?: boolean;
  retentionPolicy?: string;
}

export interface AgentSuspensionConfig {
  duration: string;
  reason: string;
  suspendAllTasks?: boolean;
  notifyUser?: boolean;
}

export interface CustomActionConfig {
  action: string;
  parameters?: Record<string, any>;
  timeout?: number;
  retryAttempts?: number;
}

export class ResponseActionExecutor extends EventEmitter {
  private redis: Redis;
  private prisma: PrismaClient;
  private isInitialized = false;

  // Action executors map
  private actionExecutors: Map<string, (config: any, context: ActionExecutionContext) => Promise<any>>;

  // Active executions tracking
  private activeExecutions: Map<string, ActionExecutionContext> = new Map();

  constructor(redis?: Redis, prisma?: PrismaClient) {
    super();

    this.redis = redis || new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
    this.prisma = prisma || new PrismaClient();

    this.actionExecutors = new Map();
    this.setupActionExecutors();
  }

  /**
   * Initialize the action executor
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // Test Redis connection
      await this.redis.ping();

      // Test database connection
      await this.prisma.$connect();

      this.isInitialized = true;

      this.emit('initialized');

    } catch (error) {
      throw new Error(`Failed to initialize ResponseActionExecutor: ${error}`);
    }
  }

  /**
   * Execute a remediation action
   */
  async executeAction(
    action: any,
    context: ActionExecutionContext
  ): Promise<ActionResult> {
    if (!this.isInitialized) {
      throw new Error('ResponseActionExecutor not initialized');
    }

    const executionId = uuidv4();
    const startTime = Date.now();

    try {
      this.activeExecutions.set(executionId, context);

      // Get action executor
      const executor = this.actionExecutors.get(action.type);
      if (!executor) {
        throw new Error(`No executor found for action type: ${action.type}`);
      }

      this.emit('action_started', {
        actionId: action.id,
        actionType: action.type,
        executionId,
        context
      });

      // Execute the action with retry logic
      const result = await this.executeWithRetry(
        executor,
        action.config,
        context,
        action.retryAttempts || 3
      );

      const executionTimeMs = Date.now() - startTime;

      this.activeExecutions.delete(executionId);

      const actionResult: ActionResult = {
        success: true,
        actionId: action.id,
        executionId,
        result,
        executionTimeMs
      };

      this.emit('action_completed', actionResult);

      return actionResult;

    } catch (error) {
      const executionTimeMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      this.activeExecutions.delete(executionId);

      const actionResult: ActionResult = {
        success: false,
        actionId: action.id,
        executionId,
        error: errorMessage,
        executionTimeMs
      };

      this.emit('action_failed', actionResult);

      return actionResult;
    }
  }

  /**
   * Get active executions
   */
  getActiveExecutions(): ActionExecutionContext[] {
    return Array.from(this.activeExecutions.values());
  }

  /**
   * Stop the action executor
   */
  async stop(): Promise<void> {
    // Wait for active executions to complete
    const timeout = 30000; // 30 seconds
    const startTime = Date.now();

    while (this.activeExecutions.size > 0 && (Date.now() - startTime) < timeout) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // Force clear remaining executions
    this.activeExecutions.clear();

    // Close connections
    await this.redis.quit();
    await this.prisma.$disconnect();

    this.emit('stopped');
  }

  /**
   * Private methods
   */

  private setupActionExecutors(): void {
    // Block Task Action
    this.actionExecutors.set('block_task', async (config: TaskControlConfig, context: ActionExecutionContext) => {
      const { reason, immediate = true, gracePeriodMs = 0 } = config;

      if (!immediate && gracePeriodMs > 0) {
        await new Promise(resolve => setTimeout(resolve, gracePeriodMs));
      }

      // Set task blocking flag in Redis
      const blockKey = `task:blocked:${context.taskContext?.id || context.violationId}`;
      await this.redis.setex(blockKey, 3600, JSON.stringify({
        reason,
        blockedAt: new Date().toISOString(),
        blockedBy: 'remediation_engine',
        violationId: context.violationId
      }));

      return {
        action: 'task_blocked',
        taskId: context.taskContext?.id,
        reason,
        blockedAt: new Date()
      };
    });

    // Revoke Access Action
    this.actionExecutors.set('revoke_access', async (config: any, context: ActionExecutionContext) => {
      const { userId, resourceType, duration = '1h' } = config;

      // Store access revocation in Redis
      const revokeKey = `access:revoked:${userId}:${resourceType}`;
      const ttl = this.parseDurationToSeconds(duration);

      await this.redis.setex(revokeKey, ttl, JSON.stringify({
        revokedAt: new Date().toISOString(),
        reason: 'Policy violation remediation',
        violationId: context.violationId,
        originalAccess: config.originalAccess
      }));

      return {
        action: 'access_revoked',
        userId,
        resourceType,
        duration,
        revokedAt: new Date()
      };
    });

    // Quarantine Data Action
    this.actionExecutors.set('quarantine_data', async (config: DataQuarantineConfig, context: ActionExecutionContext) => {
      const { quarantineLocation, ttl = '24h', encryptionRequired = true } = config;

      // Move data to quarantine location
      const quarantineId = uuidv4();
      const quarantineKey = `quarantine:${quarantineId}`;
      const ttlSeconds = this.parseDurationToSeconds(ttl);

      const quarantineData = {
        originalLocation: context.violationContext,
        quarantinedAt: new Date().toISOString(),
        reason: 'Policy violation - sensitive data detected',
        violationId: context.violationId,
        encrypted: encryptionRequired,
        location: quarantineLocation
      };

      await this.redis.setex(quarantineKey, ttlSeconds, JSON.stringify(quarantineData));

      return {
        action: 'data_quarantined',
        quarantineId,
        location: quarantineLocation,
        ttl,
        quarantinedAt: new Date()
      };
    });

    // Notify Admin Action
    this.actionExecutors.set('notify_admin', async (config: NotificationConfig, context: ActionExecutionContext) => {
      const { recipients, urgency, template = 'default_violation' } = config;

      // Create notification record in database
      const notifications = await Promise.all(recipients.map(async (recipient) => {
        return await this.prisma.notification.create({
          data: {
            id: uuidv4(),
            type: 'policy_violation',
            title: `Policy Violation - ${urgency.toUpperCase()} Priority`,
            message: this.generateNotificationMessage(template, context),
            urgency,
            recipientEmail: recipient,
            metadata: {
              violationId: context.violationId,
              remediationPolicyId: context.remediationPolicyId,
              context: context.violationContext
            },
            status: 'pending',
            createdAt: new Date(),
            expiresAt: config.escalationTimeoutMs ?
              new Date(Date.now() + config.escalationTimeoutMs) :
              new Date(Date.now() + 86400000) // 24 hours default
          }
        });
      }));

      // Store in Redis for real-time processing
      for (const notification of notifications) {
        await this.redis.lpush('notifications:queue', JSON.stringify(notification));
      }

      return {
        action: 'notifications_sent',
        recipients,
        urgency,
        notificationIds: notifications.map(n => n.id),
        sentAt: new Date()
      };
    });

    // Require Approval Action
    this.actionExecutors.set('require_approval', async (config: ApprovalConfig, context: ActionExecutionContext) => {
      const { approvers, timeoutMs, requireAllApprovers = false } = config;

      // Create approval request in database
      const approvalRequest = await this.prisma.approvalRequest.create({
        data: {
          id: uuidv4(),
          taskId: context.taskContext?.id,
          violationId: context.violationId,
          requesterId: 'remediation_engine',
          approverEmails: approvers,
          reason: 'Policy violation requires manual approval',
          requireAllApprovers,
          status: 'pending',
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + timeoutMs),
          metadata: {
            remediationPolicyId: context.remediationPolicyId,
            violationContext: context.violationContext
          }
        }
      });

      // Store in Redis for real-time tracking
      await this.redis.setex(
        `approval:${approvalRequest.id}`,
        Math.floor(timeoutMs / 1000),
        JSON.stringify(approvalRequest)
      );

      return {
        action: 'approval_required',
        approvalRequestId: approvalRequest.id,
        approvers,
        timeoutMs,
        createdAt: new Date()
      };
    });

    // Enhanced Audit Log Action
    this.actionExecutors.set('audit_log', async (config: any, context: ActionExecutionContext) => {
      const { logLevel = 'detailed', complianceFrameworks = [] } = config;

      // Create enhanced audit log entry
      const auditEntry = await this.prisma.auditLog.create({
        data: {
          id: uuidv4(),
          timestamp: new Date(),
          action: 'remediation_action_executed',
          actor: 'remediation_engine',
          resource: 'policy_violation',
          resourceId: context.violationId,
          outcome: 'success',
          riskLevel: this.determineRiskLevel(context),
          details: {
            remediationPolicyId: context.remediationPolicyId,
            violationContext: context.violationContext,
            logLevel,
            enhancedAudit: true
          },
          complianceFrameworks,
          dataClassification: 'confidential',
          retentionPeriodDays: 2555 // 7 years for compliance
        }
      });

      return {
        action: 'audit_log_created',
        auditLogId: auditEntry.id,
        logLevel,
        complianceFrameworks,
        createdAt: new Date()
      };
    });

    // Suspend Agent Action
    this.actionExecutors.set('suspend_agent', async (config: AgentSuspensionConfig, context: ActionExecutionContext) => {
      const { duration, reason, suspendAllTasks = true } = config;

      const suspensionKey = `agent:suspended:${context.taskContext?.agentId || 'unknown'}`;
      const ttlSeconds = this.parseDurationToSeconds(duration);

      const suspensionData = {
        suspendedAt: new Date().toISOString(),
        reason,
        violationId: context.violationId,
        suspendAllTasks,
        suspendedBy: 'remediation_engine'
      };

      await this.redis.setex(suspensionKey, ttlSeconds, JSON.stringify(suspensionData));

      return {
        action: 'agent_suspended',
        agentId: context.taskContext?.agentId,
        duration,
        reason,
        suspendedAt: new Date()
      };
    });

    // Escalate Action
    this.actionExecutors.set('escalate', async (config: any, context: ActionExecutionContext) => {
      const { escalationLevel = 1, escalationTarget = 'security_team' } = config;

      // Create escalation record
      const escalationId = uuidv4();
      const escalationData = {
        id: escalationId,
        violationId: context.violationId,
        level: escalationLevel,
        target: escalationTarget,
        escalatedAt: new Date().toISOString(),
        context: context.violationContext
      };

      await this.redis.lpush('escalations:queue', JSON.stringify(escalationData));

      return {
        action: 'escalated',
        escalationId,
        level: escalationLevel,
        target: escalationTarget,
        escalatedAt: new Date()
      };
    });

    // Custom Action
    this.actionExecutors.set('custom', async (config: CustomActionConfig, context: ActionExecutionContext) => {
      const { action, parameters = {}, timeout = 30000 } = config;

      // Execute custom action based on action type
      switch (action) {
        case 'throttle':
          return await this.executeThrottleAction(parameters, context);

        case 'create_incident':
          return await this.executeCreateIncidentAction(parameters, context);

        default:
          throw new Error(`Unknown custom action: ${action}`);
      }
    });
  }

  private async executeWithRetry<T>(
    executor: (config: any, context: ActionExecutionContext) => Promise<T>,
    config: any,
    context: ActionExecutionContext,
    maxRetries: number
  ): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await executor(config, context);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt === maxRetries) {
          throw lastError;
        }

        // Exponential backoff
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    throw lastError;
  }

  private async executeThrottleAction(parameters: any, context: ActionExecutionContext): Promise<any> {
    const { rate = '50%', duration = '15m' } = parameters;

    const throttleKey = `throttle:${context.taskContext?.id || context.violationId}`;
    const ttlSeconds = this.parseDurationToSeconds(duration);

    await this.redis.setex(throttleKey, ttlSeconds, JSON.stringify({
      rate,
      throttledAt: new Date().toISOString(),
      reason: 'Resource limit violation',
      violationId: context.violationId
    }));

    return {
      action: 'throttle_applied',
      rate,
      duration,
      throttledAt: new Date()
    };
  }

  private async executeCreateIncidentAction(parameters: any, context: ActionExecutionContext): Promise<any> {
    const { severity = 'high', assignTo = 'security-team' } = parameters;

    const incident = await this.prisma.securityEvent.create({
      data: {
        id: uuidv4(),
        type: 'policy_violation',
        severity,
        status: 'new',
        title: 'Automated Remediation Incident',
        description: `Policy violation incident created by automated remediation system`,
        source: 'remediation_engine',
        category: 'policy_compliance',
        organizationId: context.taskContext?.organizationId || 'system',
        metadata: {
          violationId: context.violationId,
          remediationPolicyId: context.remediationPolicyId,
          context: context.violationContext
        },
        assignedTo: assignTo,
        detectedAt: new Date(),
        createdAt: new Date()
      }
    });

    return {
      action: 'incident_created',
      incidentId: incident.id,
      severity,
      assignedTo: assignTo,
      createdAt: new Date()
    };
  }

  private generateNotificationMessage(template: string, context: ActionExecutionContext): string {
    const templates = {
      default_violation: `
        Policy Violation Detected

        Violation ID: ${context.violationId}
        Time: ${context.initiatedAt.toISOString()}
        Context: ${JSON.stringify(context.violationContext, null, 2)}

        Automated remediation has been initiated.
        Please review and take appropriate action if necessary.
      `,
      critical_security: `
        CRITICAL SECURITY VIOLATION DETECTED

        Immediate attention required!

        Violation ID: ${context.violationId}
        Time: ${context.initiatedAt.toISOString()}
        Remediation Policy: ${context.remediationPolicyId}

        Automated response actions have been executed.
        Manual intervention may be required.
      `
    };

    return templates[template as keyof typeof templates] || templates.default_violation;
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

  private determineRiskLevel(context: ActionExecutionContext): 'low' | 'medium' | 'high' | 'critical' {
    const violations = context.violationContext.violations || [];
    const criticalCount = violations.filter((v: any) => v.severity === 'critical').length;
    const highCount = violations.filter((v: any) => v.severity === 'high').length;

    if (criticalCount > 0) return 'critical';
    if (highCount > 0) return 'high';
    if (violations.length > 0) return 'medium';
    return 'low';
  }
}