import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import Redis from 'ioredis';

/**
 * Remediation Coordinator Service
 *
 * Provides Redis-based real-time coordination for remediation workflows,
 * enabling distributed processing, conflict resolution, and state management
 * across multiple remediation engine instances.
 */

export interface RemediationWorkflowState {
  id: string;
  violationId: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'cancelled';
  currentStep: number;
  totalSteps: number;
  assignedNode: string;
  createdAt: Date;
  updatedAt: Date;
  heartbeatAt: Date;
  metadata: Record<string, any>;
}

export interface WorkflowLock {
  lockId: string;
  workflowId: string;
  nodeId: string;
  acquiredAt: Date;
  expiresAt: Date;
  renewable: boolean;
}

export interface CoordinationMessage {
  id: string;
  type: 'workflow_started' | 'workflow_completed' | 'action_executed' |
        'escalation_triggered' | 'approval_required' | 'heartbeat' | 'emergency_stop';
  sourceNodeId: string;
  targetNodeId?: string; // For direct messages, omit for broadcast
  workflowId?: string;
  timestamp: Date;
  payload: Record<string, any>;
  priority: 'low' | 'medium' | 'high' | 'critical';
  ttl?: number; // Time to live in seconds
}

export interface NodeStatus {
  nodeId: string;
  status: 'active' | 'draining' | 'offline';
  lastHeartbeat: Date;
  activeWorkflows: number;
  capacity: number;
  load: number;
  version: string;
  capabilities: string[];
}

export interface CoordinationConfig {
  nodeId: string;
  redisUrl: string;
  heartbeatInterval: number;
  lockTimeout: number;
  messageTimeout: number;
  maxRetries: number;
  enableDistribution: boolean;
  enableFailover: boolean;
}

export class RemediationCoordinator extends EventEmitter {
  private redis: Redis;
  private redisSubscriber: Redis;
  private config: CoordinationConfig;

  private isInitialized = false;
  private isRunning = false;

  // State tracking
  private activeWorkflows: Map<string, RemediationWorkflowState> = new Map();
  private heldLocks: Map<string, WorkflowLock> = new Map();
  private connectedNodes: Map<string, NodeStatus> = new Map();

  // Intervals
  private heartbeatInterval?: NodeJS.Timeout;
  private lockRenewalInterval?: NodeJS.Timeout;
  private cleanupInterval?: NodeJS.Timeout;

  // Message queues
  private messageQueue: CoordinationMessage[] = [];
  private processingMessage = false;

  constructor(config: Partial<CoordinationConfig> = {}) {
    super();

    this.config = {
      nodeId: config.nodeId || `remediation_node_${uuidv4()}`,
      redisUrl: config.redisUrl || process.env.REDIS_URL || 'redis://localhost:6379',
      heartbeatInterval: config.heartbeatInterval || 30000, // 30 seconds
      lockTimeout: config.lockTimeout || 300000, // 5 minutes
      messageTimeout: config.messageTimeout || 60000, // 1 minute
      maxRetries: config.maxRetries || 3,
      enableDistribution: config.enableDistribution !== false,
      enableFailover: config.enableFailover !== false
    };

    this.redis = new Redis(this.config.redisUrl);
    this.redisSubscriber = new Redis(this.config.redisUrl);
  }

  /**
   * Initialize the coordination service
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // Test Redis connections
      await this.redis.ping();
      await this.redisSubscriber.ping();

      // Setup Redis subscriptions
      await this.setupSubscriptions();

      // Register this node
      await this.registerNode();

      // Start intervals
      this.startIntervals();

      this.isInitialized = true;
      this.isRunning = true;

      await this.sendMessage({
        type: 'heartbeat',
        sourceNodeId: this.config.nodeId,
        timestamp: new Date(),
        payload: {
          status: 'active',
          capabilities: ['remediation', 'escalation', 'audit']
        },
        priority: 'low'
      });

      this.emit('initialized', {
        nodeId: this.config.nodeId,
        config: this.config
      });

    } catch (error) {
      throw new Error(`Failed to initialize RemediationCoordinator: ${error}`);
    }
  }

  /**
   * Register a new remediation workflow
   */
  async registerWorkflow(
    violationId: string,
    totalSteps: number,
    metadata: Record<string, any> = {}
  ): Promise<string> {
    const workflowId = uuidv4();

    const workflow: RemediationWorkflowState = {
      id: workflowId,
      violationId,
      status: 'pending',
      currentStep: 0,
      totalSteps,
      assignedNode: this.config.nodeId,
      createdAt: new Date(),
      updatedAt: new Date(),
      heartbeatAt: new Date(),
      metadata
    };

    // Store workflow state
    await this.redis.setex(
      `workflow:${workflowId}`,
      86400, // 24 hours
      JSON.stringify(workflow)
    );

    // Add to active workflows
    this.activeWorkflows.set(workflowId, workflow);

    // Acquire lock
    await this.acquireLock(workflowId);

    // Notify other nodes
    await this.sendMessage({
      type: 'workflow_started',
      sourceNodeId: this.config.nodeId,
      workflowId,
      timestamp: new Date(),
      payload: {
        violationId,
        totalSteps,
        metadata
      },
      priority: 'medium'
    });

    this.emit('workflow_registered', {
      workflowId,
      violationId,
      assignedNode: this.config.nodeId
    });

    return workflowId;
  }

  /**
   * Update workflow status
   */
  async updateWorkflowStatus(
    workflowId: string,
    status: RemediationWorkflowState['status'],
    currentStep?: number,
    metadata?: Record<string, any>
  ): Promise<void> {
    const workflow = this.activeWorkflows.get(workflowId);
    if (!workflow) {
      throw new Error(`Workflow ${workflowId} not found`);
    }

    // Check if we have the lock
    if (!this.heldLocks.has(workflowId)) {
      throw new Error(`No lock held for workflow ${workflowId}`);
    }

    // Update workflow state
    workflow.status = status;
    workflow.updatedAt = new Date();
    workflow.heartbeatAt = new Date();

    if (currentStep !== undefined) {
      workflow.currentStep = currentStep;
    }

    if (metadata) {
      workflow.metadata = { ...workflow.metadata, ...metadata };
    }

    // Store in Redis
    await this.redis.setex(
      `workflow:${workflowId}`,
      86400,
      JSON.stringify(workflow)
    );

    // Notify other nodes
    await this.sendMessage({
      type: status === 'completed' ? 'workflow_completed' : 'heartbeat',
      sourceNodeId: this.config.nodeId,
      workflowId,
      timestamp: new Date(),
      payload: {
        status,
        currentStep: workflow.currentStep,
        totalSteps: workflow.totalSteps,
        metadata: workflow.metadata
      },
      priority: status === 'completed' ? 'high' : 'low'
    });

    // Release lock if workflow is completed
    if (status === 'completed' || status === 'failed' || status === 'cancelled') {
      await this.releaseLock(workflowId);
      this.activeWorkflows.delete(workflowId);
    }

    this.emit('workflow_updated', {
      workflowId,
      status,
      currentStep: workflow.currentStep
    });
  }

  /**
   * Acquire exclusive lock for workflow
   */
  async acquireLock(workflowId: string, timeoutMs?: number): Promise<boolean> {
    const lockKey = `lock:workflow:${workflowId}`;
    const lockValue = `${this.config.nodeId}:${Date.now()}`;
    const timeout = timeoutMs || this.config.lockTimeout;

    try {
      // Try to acquire lock with expiration
      const result = await this.redis.set(
        lockKey,
        lockValue,
        'PX',
        timeout,
        'NX'
      );

      if (result === 'OK') {
        const lock: WorkflowLock = {
          lockId: uuidv4(),
          workflowId,
          nodeId: this.config.nodeId,
          acquiredAt: new Date(),
          expiresAt: new Date(Date.now() + timeout),
          renewable: true
        };

        this.heldLocks.set(workflowId, lock);

        this.emit('lock_acquired', {
          workflowId,
          lockId: lock.lockId,
          nodeId: this.config.nodeId
        });

        return true;
      }

      return false;

    } catch (error) {
      this.emit('lock_error', {
        workflowId,
        error: error instanceof Error ? error.message : String(error)
      });

      return false;
    }
  }

  /**
   * Release workflow lock
   */
  async releaseLock(workflowId: string): Promise<void> {
    const lock = this.heldLocks.get(workflowId);
    if (!lock) return;

    const lockKey = `lock:workflow:${workflowId}`;

    try {
      // Use Lua script to ensure atomic release
      const script = `
        if redis.call("get", KEYS[1]) == ARGV[1] then
          return redis.call("del", KEYS[1])
        else
          return 0
        end
      `;

      await this.redis.eval(
        script,
        1,
        lockKey,
        `${this.config.nodeId}:${lock.acquiredAt.getTime()}`
      );

      this.heldLocks.delete(workflowId);

      this.emit('lock_released', {
        workflowId,
        lockId: lock.lockId,
        nodeId: this.config.nodeId
      });

    } catch (error) {
      this.emit('lock_error', {
        workflowId,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Send coordination message
   */
  async sendMessage(message: Omit<CoordinationMessage, 'id'>): Promise<void> {
    const fullMessage: CoordinationMessage = {
      id: uuidv4(),
      ...message
    };

    try {
      const channel = message.targetNodeId ?
        `coordination:node:${message.targetNodeId}` :
        'coordination:broadcast';

      await this.redis.publish(channel, JSON.stringify(fullMessage));

      // Store in message history for debugging
      await this.redis.lpush(
        `messages:${this.config.nodeId}`,
        JSON.stringify(fullMessage)
      );
      await this.redis.ltrim(`messages:${this.config.nodeId}`, 0, 999); // Keep last 1000 messages

      this.emit('message_sent', {
        messageId: fullMessage.id,
        type: fullMessage.type,
        targetNodeId: message.targetNodeId
      });

    } catch (error) {
      this.emit('message_error', {
        error: error instanceof Error ? error.message : String(error),
        message: fullMessage
      });
    }
  }

  /**
   * Get workflow status
   */
  async getWorkflowStatus(workflowId: string): Promise<RemediationWorkflowState | null> {
    // Check local cache first
    const localWorkflow = this.activeWorkflows.get(workflowId);
    if (localWorkflow) {
      return localWorkflow;
    }

    // Check Redis
    try {
      const workflowData = await this.redis.get(`workflow:${workflowId}`);
      if (workflowData) {
        return JSON.parse(workflowData) as RemediationWorkflowState;
      }
    } catch (error) {
      this.emit('workflow_error', {
        workflowId,
        error: error instanceof Error ? error.message : String(error)
      });
    }

    return null;
  }

  /**
   * Get all active workflows
   */
  async getActiveWorkflows(): Promise<RemediationWorkflowState[]> {
    const workflows: RemediationWorkflowState[] = [];

    // Scan for workflow keys
    const keys = await this.redis.keys('workflow:*');

    for (const key of keys) {
      try {
        const workflowData = await this.redis.get(key);
        if (workflowData) {
          const workflow = JSON.parse(workflowData) as RemediationWorkflowState;
          if (workflow.status === 'in_progress' || workflow.status === 'pending') {
            workflows.push(workflow);
          }
        }
      } catch (error) {
        // Skip invalid workflow data
      }
    }

    return workflows;
  }

  /**
   * Get connected nodes
   */
  getConnectedNodes(): NodeStatus[] {
    return Array.from(this.connectedNodes.values());
  }

  /**
   * Emergency stop all workflows on this node
   */
  async emergencyStop(reason: string): Promise<void> {
    this.isRunning = false;

    // Send emergency stop message
    await this.sendMessage({
      type: 'emergency_stop',
      sourceNodeId: this.config.nodeId,
      timestamp: new Date(),
      payload: {
        reason,
        affectedWorkflows: Array.from(this.activeWorkflows.keys())
      },
      priority: 'critical'
    });

    // Release all locks
    for (const workflowId of this.heldLocks.keys()) {
      await this.releaseLock(workflowId);
    }

    // Clear active workflows
    this.activeWorkflows.clear();

    this.emit('emergency_stop', {
      nodeId: this.config.nodeId,
      reason
    });
  }

  /**
   * Stop the coordination service
   */
  async stop(): Promise<void> {
    this.isRunning = false;

    // Clear intervals
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
    if (this.lockRenewalInterval) clearInterval(this.lockRenewalInterval);
    if (this.cleanupInterval) clearInterval(this.cleanupInterval);

    // Release all locks
    for (const workflowId of this.heldLocks.keys()) {
      await this.releaseLock(workflowId);
    }

    // Unregister node
    await this.unregisterNode();

    // Close Redis connections
    await this.redisSubscriber.quit();
    await this.redis.quit();

    this.emit('stopped', {
      nodeId: this.config.nodeId
    });
  }

  /**
   * Private methods
   */

  private async setupSubscriptions(): Promise<void> {
    // Subscribe to broadcast channel
    await this.redisSubscriber.subscribe('coordination:broadcast');

    // Subscribe to node-specific channel
    await this.redisSubscriber.subscribe(`coordination:node:${this.config.nodeId}`);

    // Handle incoming messages
    this.redisSubscriber.on('message', async (channel, messageData) => {
      try {
        const message = JSON.parse(messageData) as CoordinationMessage;
        await this.handleMessage(message);
      } catch (error) {
        this.emit('message_parse_error', {
          channel,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    });
  }

  private async handleMessage(message: CoordinationMessage): Promise<void> {
    // Ignore messages from self
    if (message.sourceNodeId === this.config.nodeId) {
      return;
    }

    this.emit('message_received', {
      messageId: message.id,
      type: message.type,
      sourceNodeId: message.sourceNodeId
    });

    switch (message.type) {
      case 'heartbeat':
        await this.handleHeartbeat(message);
        break;

      case 'workflow_started':
        await this.handleWorkflowStarted(message);
        break;

      case 'workflow_completed':
        await this.handleWorkflowCompleted(message);
        break;

      case 'emergency_stop':
        await this.handleEmergencyStop(message);
        break;

      default:
        this.emit('unknown_message_type', {
          messageId: message.id,
          type: message.type
        });
    }
  }

  private async handleHeartbeat(message: CoordinationMessage): Promise<void> {
    const nodeStatus: NodeStatus = {
      nodeId: message.sourceNodeId,
      status: message.payload.status || 'active',
      lastHeartbeat: new Date(),
      activeWorkflows: message.payload.activeWorkflows || 0,
      capacity: message.payload.capacity || 10,
      load: message.payload.load || 0,
      version: message.payload.version || '1.0.0',
      capabilities: message.payload.capabilities || []
    };

    this.connectedNodes.set(message.sourceNodeId, nodeStatus);

    this.emit('node_heartbeat', {
      nodeId: message.sourceNodeId,
      status: nodeStatus.status
    });
  }

  private async handleWorkflowStarted(message: CoordinationMessage): Promise<void> {
    if (!message.workflowId) return;

    this.emit('workflow_started_remote', {
      workflowId: message.workflowId,
      violationId: message.payload.violationId,
      sourceNodeId: message.sourceNodeId
    });
  }

  private async handleWorkflowCompleted(message: CoordinationMessage): Promise<void> {
    if (!message.workflowId) return;

    this.emit('workflow_completed_remote', {
      workflowId: message.workflowId,
      status: message.payload.status,
      sourceNodeId: message.sourceNodeId
    });
  }

  private async handleEmergencyStop(message: CoordinationMessage): Promise<void> {
    this.emit('emergency_stop_received', {
      sourceNodeId: message.sourceNodeId,
      reason: message.payload.reason,
      affectedWorkflows: message.payload.affectedWorkflows
    });
  }

  private async registerNode(): Promise<void> {
    const nodeInfo = {
      nodeId: this.config.nodeId,
      status: 'active',
      registeredAt: new Date(),
      capabilities: ['remediation', 'escalation', 'audit'],
      version: '1.0.0'
    };

    await this.redis.setex(
      `node:${this.config.nodeId}`,
      this.config.heartbeatInterval * 3, // 3x heartbeat interval
      JSON.stringify(nodeInfo)
    );
  }

  private async unregisterNode(): Promise<void> {
    await this.redis.del(`node:${this.config.nodeId}`);
  }

  private startIntervals(): void {
    // Heartbeat interval
    this.heartbeatInterval = setInterval(async () => {
      await this.sendHeartbeat();
    }, this.config.heartbeatInterval);

    // Lock renewal interval
    this.lockRenewalInterval = setInterval(async () => {
      await this.renewLocks();
    }, Math.floor(this.config.lockTimeout / 3));

    // Cleanup interval
    this.cleanupInterval = setInterval(async () => {
      await this.cleanupExpiredNodes();
    }, this.config.heartbeatInterval * 2);
  }

  private async sendHeartbeat(): Promise<void> {
    await this.sendMessage({
      type: 'heartbeat',
      sourceNodeId: this.config.nodeId,
      timestamp: new Date(),
      payload: {
        status: this.isRunning ? 'active' : 'draining',
        activeWorkflows: this.activeWorkflows.size,
        capacity: 10,
        load: this.activeWorkflows.size / 10,
        version: '1.0.0',
        capabilities: ['remediation', 'escalation', 'audit']
      },
      priority: 'low'
    });

    // Update node registration
    await this.registerNode();
  }

  private async renewLocks(): Promise<void> {
    for (const [workflowId, lock] of this.heldLocks.entries()) {
      if (!lock.renewable) continue;

      const lockKey = `lock:workflow:${workflowId}`;

      try {
        // Extend lock expiration
        await this.redis.pexpire(lockKey, this.config.lockTimeout);

        lock.expiresAt = new Date(Date.now() + this.config.lockTimeout);

      } catch (error) {
        this.emit('lock_renewal_error', {
          workflowId,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
  }

  private async cleanupExpiredNodes(): Promise<void> {
    const now = Date.now();
    const expirationThreshold = this.config.heartbeatInterval * 3;

    for (const [nodeId, nodeStatus] of this.connectedNodes.entries()) {
      const age = now - nodeStatus.lastHeartbeat.getTime();

      if (age > expirationThreshold) {
        this.connectedNodes.delete(nodeId);

        this.emit('node_expired', {
          nodeId,
          lastHeartbeat: nodeStatus.lastHeartbeat
        });
      }
    }
  }
}