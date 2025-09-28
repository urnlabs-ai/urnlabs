import { EventEmitter } from 'events';
import { GovernanceController, GovernanceResult } from './GovernanceController';
import { AutomatedRemediationEngine } from './AutomatedRemediationEngine';
import { AuditLogger } from './AuditLogger';
import type { AgentTask } from '../types/AgentTypes';

/**
 * Remediation Integration Layer
 *
 * Provides seamless integration between the existing GovernanceController
 * and the new AutomatedRemediationEngine, ensuring all policy violations
 * are automatically processed through the remediation workflow.
 */

export interface RemediationIntegrationConfig {
  enableAutomaticRemediation: boolean;
  enableRealTimeProcessing: boolean;
  enableAuditIntegration: boolean;
  remediationTimeout: number;
  maxConcurrentRemediations: number;
}

export interface ViolationProcessingResult {
  violationId: string;
  processed: boolean;
  remediationTriggered: boolean;
  remediationResult?: any;
  processingTimeMs: number;
  errors: string[];
}

export class RemediationIntegration extends EventEmitter {
  private governanceController: GovernanceController;
  private remediationEngine: AutomatedRemediationEngine;
  private auditLogger: AuditLogger;

  private config: RemediationIntegrationConfig;
  private isInitialized = false;
  private isRunning = false;

  // Processing tracking
  private activeProcessing: Map<string, Promise<ViolationProcessingResult>> = new Map();
  private processingStats = {
    totalViolations: 0,
    processedViolations: 0,
    triggeredRemediations: 0,
    failedProcessing: 0
  };

  constructor(
    governanceController?: GovernanceController,
    remediationEngine?: AutomatedRemediationEngine,
    auditLogger?: AuditLogger,
    config?: Partial<RemediationIntegrationConfig>
  ) {
    super();

    this.governanceController = governanceController || new GovernanceController();
    this.remediationEngine = remediationEngine || new AutomatedRemediationEngine();
    this.auditLogger = auditLogger || new AuditLogger();

    this.config = {
      enableAutomaticRemediation: true,
      enableRealTimeProcessing: true,
      enableAuditIntegration: true,
      remediationTimeout: 300000, // 5 minutes
      maxConcurrentRemediations: 10,
      ...config
    };

    this.setupEventHandlers();
  }

  /**
   * Initialize the integration layer
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // Initialize all components
      await this.governanceController.initialize();
      await this.remediationEngine.initialize();
      await this.auditLogger.initialize();

      // Patch the governance controller to trigger remediation
      this.patchGovernanceController();

      this.isInitialized = true;
      this.isRunning = true;

      await this.auditLogger.log({
        timestamp: new Date(),
        action: 'remediation_integration_initialized',
        actor: 'system',
        outcome: 'success',
        riskLevel: 'low',
        details: {
          config: this.config,
          componentsInitialized: true
        },
        complianceFrameworks: ['SOX', 'GDPR', 'HIPAA', 'PCI']
      });

      this.emit('initialized');

    } catch (error) {
      throw new Error(`Failed to initialize RemediationIntegration: ${error}`);
    }
  }

  /**
   * Process a policy violation through the remediation workflow
   */
  async processViolation(
    violationId: string,
    governanceResult: GovernanceResult,
    taskContext?: AgentTask
  ): Promise<ViolationProcessingResult> {
    if (!this.isInitialized || !this.isRunning) {
      throw new Error('RemediationIntegration not initialized or not running');
    }

    // Check if already processing
    const existingProcessing = this.activeProcessing.get(violationId);
    if (existingProcessing) {
      return await existingProcessing;
    }

    // Create processing promise
    const processingPromise = this.executeViolationProcessing(violationId, governanceResult, taskContext);
    this.activeProcessing.set(violationId, processingPromise);

    try {
      const result = await processingPromise;
      this.activeProcessing.delete(violationId);
      return result;
    } catch (error) {
      this.activeProcessing.delete(violationId);
      throw error;
    }
  }

  /**
   * Enhanced task validation with automatic remediation
   */
  async validateTaskWithRemediation(task: AgentTask): Promise<{
    governanceResult: GovernanceResult;
    violationProcessingResult?: ViolationProcessingResult;
  }> {
    const startTime = Date.now();

    try {
      // Perform governance validation
      const governanceResult = await this.governanceController.validateTask(task);

      this.processingStats.totalViolations++;

      // If violations exist and automatic remediation is enabled
      if (governanceResult.policyViolations.length > 0 && this.config.enableAutomaticRemediation) {
        const violationId = `violation_${Date.now()}_${task.id}`;

        const violationProcessingResult = await this.processViolation(
          violationId,
          governanceResult,
          task
        );

        return {
          governanceResult,
          violationProcessingResult
        };
      }

      return { governanceResult };

    } catch (error) {
      this.processingStats.failedProcessing++;

      await this.auditLogger.log({
        timestamp: new Date(),
        action: 'task_validation_with_remediation_failed',
        actor: 'system',
        resource: 'agent_task',
        resourceId: task.id,
        outcome: 'failure',
        riskLevel: 'high',
        details: {
          taskId: task.id,
          error: error instanceof Error ? error.message : String(error),
          processingTimeMs: Date.now() - startTime
        }
      });

      throw error;
    }
  }

  /**
   * Get processing statistics
   */
  getProcessingStats(): typeof this.processingStats & {
    activeProcessing: number;
    successRate: number;
  } {
    return {
      ...this.processingStats,
      activeProcessing: this.activeProcessing.size,
      successRate: this.processingStats.totalViolations > 0 ?
        this.processingStats.processedViolations / this.processingStats.totalViolations :
        0
    };
  }

  /**
   * Update configuration
   */
  async updateConfig(newConfig: Partial<RemediationIntegrationConfig>): Promise<void> {
    const oldConfig = { ...this.config };
    this.config = { ...this.config, ...newConfig };

    await this.auditLogger.log({
      timestamp: new Date(),
      action: 'remediation_integration_config_updated',
      actor: 'system',
      outcome: 'success',
      riskLevel: 'low',
      details: {
        oldConfig,
        newConfig: this.config,
        changedFields: Object.keys(newConfig)
      }
    });

    this.emit('config_updated', {
      oldConfig,
      newConfig: this.config
    });
  }

  /**
   * Stop the integration layer
   */
  async stop(): Promise<void> {
    this.isRunning = false;

    // Wait for active processing to complete
    const activePromises = Array.from(this.activeProcessing.values());
    if (activePromises.length > 0) {
      await Promise.allSettled(activePromises);
    }

    // Stop components
    await this.remediationEngine.stop();

    await this.auditLogger.log({
      timestamp: new Date(),
      action: 'remediation_integration_stopped',
      actor: 'system',
      outcome: 'success',
      riskLevel: 'low',
      details: {
        finalStats: this.getProcessingStats()
      }
    });

    this.emit('stopped');
  }

  /**
   * Private methods
   */

  private async executeViolationProcessing(
    violationId: string,
    governanceResult: GovernanceResult,
    taskContext?: AgentTask
  ): Promise<ViolationProcessingResult> {
    const startTime = Date.now();

    try {
      // Check if we should process this violation
      if (!this.shouldProcessViolation(governanceResult)) {
        return {
          violationId,
          processed: false,
          remediationTriggered: false,
          processingTimeMs: Date.now() - startTime,
          errors: ['Violation does not meet processing criteria']
        };
      }

      // Check concurrent processing limit
      if (this.activeProcessing.size >= this.config.maxConcurrentRemediations) {
        throw new Error('Maximum concurrent remediations reached');
      }

      // Log violation processing start
      await this.auditLogger.log({
        timestamp: new Date(),
        action: 'violation_processing_started',
        actor: 'system',
        resource: 'policy_violation',
        resourceId: violationId,
        outcome: 'pending',
        riskLevel: this.determineRiskLevel(governanceResult),
        details: {
          violationId,
          policyViolations: governanceResult.policyViolations,
          taskId: taskContext?.id,
          automaticRemediation: this.config.enableAutomaticRemediation
        },
        complianceFrameworks: this.extractComplianceFrameworks(governanceResult)
      });

      // Process through remediation engine
      const remediationResult = await this.remediationEngine.processViolation(
        violationId,
        governanceResult,
        taskContext
      );

      this.processingStats.processedViolations++;
      if (remediationResult.success) {
        this.processingStats.triggeredRemediations++;
      }

      // Log completion
      await this.auditLogger.log({
        timestamp: new Date(),
        action: 'violation_processing_completed',
        actor: 'system',
        resource: 'policy_violation',
        resourceId: violationId,
        outcome: remediationResult.success ? 'success' : 'failure',
        riskLevel: remediationResult.escalated ? 'high' : 'medium',
        details: {
          violationId,
          remediationResult,
          processingTimeMs: Date.now() - startTime
        },
        complianceFrameworks: this.extractComplianceFrameworks(governanceResult)
      });

      this.emit('violation_processed', {
        violationId,
        governanceResult,
        remediationResult,
        taskContext
      });

      return {
        violationId,
        processed: true,
        remediationTriggered: true,
        remediationResult,
        processingTimeMs: Date.now() - startTime,
        errors: remediationResult.errors
      };

    } catch (error) {
      this.processingStats.failedProcessing++;
      const errorMessage = error instanceof Error ? error.message : String(error);

      await this.auditLogger.log({
        timestamp: new Date(),
        action: 'violation_processing_failed',
        actor: 'system',
        resource: 'policy_violation',
        resourceId: violationId,
        outcome: 'failure',
        riskLevel: 'critical',
        details: {
          violationId,
          error: errorMessage,
          processingTimeMs: Date.now() - startTime
        }
      });

      return {
        violationId,
        processed: false,
        remediationTriggered: false,
        processingTimeMs: Date.now() - startTime,
        errors: [errorMessage]
      };
    }
  }

  private setupEventHandlers(): void {
    // Handle remediation engine events
    this.remediationEngine.on('remediation_completed', (data) => {
      this.emit('remediation_completed', data);
    });

    this.remediationEngine.on('execution_escalated', (data) => {
      this.emit('remediation_escalated', data);
    });

    // Handle audit events if audit integration is enabled
    if (this.config.enableAuditIntegration) {
      this.remediationEngine.on('action_completed', async (data) => {
        await this.auditLogger.log({
          timestamp: new Date(),
          action: 'remediation_action_completed',
          actor: 'remediation_engine',
          resource: 'remediation_action',
          resourceId: data.actionId,
          outcome: 'success',
          riskLevel: 'medium',
          details: data
        });
      });

      this.remediationEngine.on('action_failed', async (data) => {
        await this.auditLogger.log({
          timestamp: new Date(),
          action: 'remediation_action_failed',
          actor: 'remediation_engine',
          resource: 'remediation_action',
          resourceId: data.actionId,
          outcome: 'failure',
          riskLevel: 'high',
          details: data
        });
      });
    }
  }

  private patchGovernanceController(): void {
    // Store original method
    const originalValidateTask = this.governanceController.validateTask.bind(this.governanceController);

    // Replace with enhanced version
    this.governanceController.validateTask = async (task: AgentTask): Promise<GovernanceResult> => {
      // Call original validation
      const result = await originalValidateTask(task);

      // If automatic remediation is enabled and there are violations
      if (this.config.enableAutomaticRemediation &&
          result.policyViolations.length > 0 &&
          this.config.enableRealTimeProcessing) {

        // Trigger asynchronous remediation processing
        const violationId = `auto_${Date.now()}_${task.id}`;

        // Don't await - process in background
        this.processViolation(violationId, result, task).catch(error => {
          this.emit('background_processing_error', {
            violationId,
            taskId: task.id,
            error: error instanceof Error ? error.message : String(error)
          });
        });
      }

      return result;
    };
  }

  private shouldProcessViolation(governanceResult: GovernanceResult): boolean {
    // Don't process if already approved
    if (governanceResult.approved) {
      return false;
    }

    // Process if there are policy violations
    if (governanceResult.policyViolations.length === 0) {
      return false;
    }

    // Check if any violations meet severity threshold
    const hasProcessableViolations = governanceResult.policyViolations.some(violation =>
      ['medium', 'high', 'critical'].includes(violation.severity)
    );

    return hasProcessableViolations;
  }

  private determineRiskLevel(governanceResult: GovernanceResult): 'low' | 'medium' | 'high' | 'critical' {
    const criticalViolations = governanceResult.policyViolations.filter(v => v.severity === 'critical');
    const highViolations = governanceResult.policyViolations.filter(v => v.severity === 'high');

    if (criticalViolations.length > 0) return 'critical';
    if (highViolations.length > 0) return 'high';
    if (governanceResult.policyViolations.length > 0) return 'medium';
    return 'low';
  }

  private extractComplianceFrameworks(governanceResult: GovernanceResult): string[] {
    // Extract compliance frameworks from governance policies
    // This would be enhanced based on actual policy structure
    const frameworks = new Set<string>();

    // Add common frameworks for policy violations
    if (governanceResult.policyViolations.length > 0) {
      frameworks.add('SOX');
      frameworks.add('GDPR');
      frameworks.add('HIPAA');
      frameworks.add('PCI');
    }

    return Array.from(frameworks);
  }
}

/**
 * Factory function for creating a complete remediation system
 */
export async function createRemediationSystem(config?: {
  governance?: Partial<any>;
  remediation?: Partial<any>;
  integration?: Partial<RemediationIntegrationConfig>;
}): Promise<RemediationIntegration> {
  const governanceController = new GovernanceController();
  const remediationEngine = new AutomatedRemediationEngine(governanceController);
  const auditLogger = new AuditLogger();

  const integration = new RemediationIntegration(
    governanceController,
    remediationEngine,
    auditLogger,
    config?.integration
  );

  await integration.initialize();

  return integration;
}