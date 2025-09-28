import { EventEmitter } from 'events';
import { OPAIntegrationService, PolicyEvaluationInput, PolicyEvaluationResult } from './OPAIntegrationService';
import { PolicyManager } from './PolicyManager';
import { DecisionLogger } from './DecisionLogger';
import { auditLoggingService } from '../services/audit-logging';

export interface OPAServiceConfiguration {
  integration: {
    serverUrl?: string;
    timeout: number;
    retryAttempts: number;
    cacheEnabled: boolean;
    cacheTtl: number;
    maxCacheSize: number;
  };
  policyManager: {
    policyDirectory: string;
    backupDirectory?: string;
    opaServerUrl?: string;
  };
  decisionLogger: {
    logDirectory: string;
    maxLogsInMemory?: number;
    retentionPeriods?: Record<string, number>;
    encryptLogs?: boolean;
  };
}

export interface AuthorizationRequest {
  subject: {
    id: string;
    type: 'user' | 'service' | 'system';
    attributes?: Record<string, any>;
    roles?: string[];
    permissions?: string[];
  };
  resource: {
    type: string;
    id?: string;
    attributes?: Record<string, any>;
    path?: string;
  };
  action: {
    name: string;
    parameters?: Record<string, any>;
  };
  context: {
    environment?: string;
    timestamp?: Date;
    requestId?: string;
    sessionId?: string;
    ip?: string;
    userAgent?: string;
    metadata?: Record<string, any>;
  };
}

export interface AuthorizationResponse {
  decision: 'allow' | 'deny';
  reasons?: string[];
  obligations?: Array<{
    type: string;
    action: string;
    parameters?: Record<string, any>;
  }>;
  metadata: {
    evaluationId: string;
    policyId?: string;
    policyVersion?: string;
    executionTime: number;
    cached: boolean;
    decisionLogId: string;
  };
}

export interface PolicyBundleDeployment {
  policies: Array<{
    id: string;
    name: string;
    content: string;
    version: string;
    metadata?: Record<string, any>;
  }>;
  environment: 'development' | 'staging' | 'production';
  deployedBy: string;
  rolloutStrategy?: 'immediate' | 'gradual' | 'canary';
}

/**
 * Comprehensive OPA Service that integrates policy evaluation, management, and logging
 */
export class OPAService extends EventEmitter {
  private integrationService: OPAIntegrationService;
  private policyManager: PolicyManager;
  private decisionLogger: DecisionLogger;
  private healthStatus = {
    healthy: true,
    lastCheck: new Date(),
    errors: []
  };

  constructor(config: OPAServiceConfiguration) {
    super();

    // Initialize components
    this.integrationService = new OPAIntegrationService(config.integration);
    this.policyManager = new PolicyManager(config.policyManager);
    this.decisionLogger = new DecisionLogger(config.decisionLogger);

    this.setupEventHandlers();
    this.startHealthMonitoring();
  }

  /**
   * Main authorization method that combines all OPA capabilities
   */
  async authorize(request: AuthorizationRequest): Promise<AuthorizationResponse> {
    const startTime = Date.now();

    try {
      // Get applicable policy for the request
      const policy = await this.getApplicablePolicy(request);
      if (!policy) {
        throw new Error('No applicable policy found for authorization request');
      }

      // Prepare input for policy evaluation
      const evaluationInput: PolicyEvaluationInput = {
        input: {
          subject: request.subject,
          resource: request.resource,
          action: request.action,
          context: {
            ...request.context,
            timestamp: request.context.timestamp || new Date(),
            environment: request.context.environment || process.env.NODE_ENV || 'development'
          }
        },
        policy: policy.content,
        context: {
          requestId: request.context.requestId || this.generateRequestId(),
          userId: request.subject.id,
          sessionId: request.context.sessionId,
          resource: `${request.resource.type}:${request.resource.id || '*'}`,
          action: request.action.name,
          ip: request.context.ip,
          userAgent: request.context.userAgent
        }
      };

      // Evaluate policy
      const evaluationResult = await this.integrationService.evaluatePolicy(evaluationInput);

      // Log decision
      const decisionLogId = await this.decisionLogger.logDecision(evaluationResult, {
        policyId: policy.id,
        policyVersion: policy.version,
        policyName: policy.name
      });

      // Process obligations if any
      const obligations = this.extractObligations(evaluationResult);

      // Create response
      const response: AuthorizationResponse = {
        decision: evaluationResult.decision.allow ? 'allow' : 'deny',
        reasons: evaluationResult.decision.reasons,
        obligations,
        metadata: {
          evaluationId: evaluationResult.evaluationId,
          policyId: policy.id,
          policyVersion: policy.version,
          executionTime: Date.now() - startTime,
          cached: evaluationResult.cached || false,
          decisionLogId
        }
      };

      // Emit event for monitoring
      this.emit('authorizationComplete', {
        request,
        response,
        evaluationResult
      });

      return response;

    } catch (error) {
      // Log error and return deny decision
      await this.logAuthorizationError(request, error);

      const errorResponse: AuthorizationResponse = {
        decision: 'deny',
        reasons: [`Authorization error: ${error.message}`],
        metadata: {
          evaluationId: this.generateRequestId(),
          executionTime: Date.now() - startTime,
          cached: false,
          decisionLogId: await this.logErrorDecision(request, error)
        }
      };

      this.emit('authorizationError', {
        request,
        error,
        response: errorResponse
      });

      return errorResponse;
    }
  }

  /**
   * Batch authorization for multiple requests
   */
  async authorizeBatch(requests: AuthorizationRequest[]): Promise<AuthorizationResponse[]> {
    const promises = requests.map(request => this.authorize(request));
    return Promise.all(promises);
  }

  /**
   * Check if a subject can perform an action on a resource (simplified interface)
   */
  async can(
    subjectId: string,
    action: string,
    resource: string,
    context?: Partial<AuthorizationRequest['context']>
  ): Promise<boolean> {
    const request: AuthorizationRequest = {
      subject: { id: subjectId, type: 'user' },
      resource: { type: resource },
      action: { name: action },
      context: context || {}
    };

    const response = await this.authorize(request);
    return response.decision === 'allow';
  }

  /**
   * Get applicable policy for authorization request
   */
  private async getApplicablePolicy(request: AuthorizationRequest): Promise<any> {
    // Get all active policies
    const policies = this.policyManager.getAllPolicies().filter(p => p.status === 'active');

    // For this implementation, we'll use a simple policy selection strategy
    // In production, this would be more sophisticated based on policy metadata
    for (const policy of policies) {
      // Check if policy applies to this resource type
      if (policy.tags.includes(request.resource.type) ||
          policy.tags.includes('default') ||
          policy.tags.length === 0) {

        const content = this.policyManager.getPolicyContent(policy.id);
        if (content) {
          return {
            id: policy.id,
            name: policy.name,
            version: policy.version,
            content
          };
        }
      }
    }

    // If no specific policy found, try to get a default policy
    const defaultPolicies = policies.filter(p => p.name.includes('default') || p.tags.includes('default'));
    if (defaultPolicies.length > 0) {
      const policy = defaultPolicies[0];
      const content = this.policyManager.getPolicyContent(policy.id);
      if (content) {
        return {
          id: policy.id,
          name: policy.name,
          version: policy.version,
          content
        };
      }
    }

    return null;
  }

  /**
   * Extract obligations from policy evaluation result
   */
  private extractObligations(evaluationResult: PolicyEvaluationResult): AuthorizationResponse['obligations'] {
    const obligations: AuthorizationResponse['obligations'] = [];

    // Check if the decision includes obligations
    if (evaluationResult.decision.metadata?.obligations) {
      const obligationData = evaluationResult.decision.metadata.obligations;

      if (Array.isArray(obligationData)) {
        obligations.push(...obligationData);
      } else if (typeof obligationData === 'object') {
        // Convert object to obligation format
        Object.entries(obligationData).forEach(([type, action]) => {
          obligations.push({
            type,
            action: typeof action === 'string' ? action : 'execute',
            parameters: typeof action === 'object' ? action : {}
          });
        });
      }
    }

    return obligations;
  }

  /**
   * Deploy a bundle of policies
   */
  async deployPolicyBundle(deployment: PolicyBundleDeployment): Promise<string[]> {
    const deploymentIds: string[] = [];

    try {
      for (const policy of deployment.policies) {
        // Create or update policy
        let policyId: string;
        const existingPolicy = this.policyManager.getAllPolicies()
          .find(p => p.name === policy.name);

        if (existingPolicy) {
          // Update existing policy
          const newVersion = await this.policyManager.updatePolicy(
            existingPolicy.id,
            policy.content,
            `Bundle deployment to ${deployment.environment}`,
            deployment.deployedBy
          );
          policyId = existingPolicy.id;
        } else {
          // Create new policy
          policyId = await this.policyManager.createPolicy(
            policy.name,
            policy.content,
            policy.metadata,
            deployment.deployedBy
          );
        }

        // Deploy to environment
        const deploymentId = await this.policyManager.deployPolicy(
          policyId,
          policy.version,
          deployment.environment,
          deployment.deployedBy,
          deployment.rolloutStrategy
        );

        deploymentIds.push(deploymentId);
      }

      this.emit('policyBundleDeployed', {
        deployment,
        deploymentIds
      });

      return deploymentIds;

    } catch (error) {
      this.emit('policyBundleDeploymentFailed', {
        deployment,
        error,
        partialDeploymentIds: deploymentIds
      });
      throw error;
    }
  }

  /**
   * Test policies against test cases
   */
  async testPolicies(policyId?: string): Promise<{
    policyId: string;
    policyName: string;
    testResults: any[];
    passed: boolean;
  }[]> {
    const policies = policyId
      ? [this.policyManager.getPolicy(policyId)].filter(Boolean)
      : this.policyManager.getAllPolicies();

    const results = [];

    for (const policy of policies) {
      if (!policy) continue;

      const content = this.policyManager.getPolicyContent(policy.id);
      if (!content) continue;

      // In production, load test cases from files or database
      const testCases = this.generateDefaultTestCases(policy);

      const validation = await this.policyManager.validatePolicy(content, testCases);

      results.push({
        policyId: policy.id,
        policyName: policy.name,
        testResults: validation.testResults,
        passed: validation.testsPassed
      });
    }

    return results;
  }

  /**
   * Generate default test cases for a policy
   */
  private generateDefaultTestCases(policy: any): any[] {
    // This is a simplified implementation
    // In production, test cases would be loaded from external files
    return [
      {
        name: 'Basic Allow Test',
        description: 'Test basic allow scenario',
        input: {
          subject: { id: 'test-user', type: 'user' },
          resource: { type: 'document', id: 'test-doc' },
          action: { name: 'read' }
        },
        expectedResult: true
      },
      {
        name: 'Basic Deny Test',
        description: 'Test basic deny scenario',
        input: {
          subject: { id: 'test-user', type: 'user' },
          resource: { type: 'secret', id: 'test-secret' },
          action: { name: 'delete' }
        },
        expectedResult: false
      }
    ];
  }

  /**
   * Get comprehensive health status
   */
  async getHealthStatus(): Promise<{
    overall: 'healthy' | 'degraded' | 'unhealthy';
    components: {
      integration: any;
      policyManager: any;
      decisionLogger: any;
    };
    metrics: any;
  }> {
    const integrationHealth = await this.integrationService.healthCheck();
    const metrics = this.integrationService.getMetrics();

    // Policy manager health (simplified)
    const policyManagerHealth = {
      status: 'healthy' as const,
      details: {
        totalPolicies: this.policyManager.getAllPolicies().length,
        activePolicies: this.policyManager.getAllPolicies().filter(p => p.status === 'active').length
      }
    };

    // Decision logger health (simplified)
    const decisionLoggerHealth = {
      status: 'healthy' as const,
      details: {
        logsInMemory: 'N/A', // Would get from decision logger
        lastLogTime: new Date()
      }
    };

    // Determine overall health
    let overall: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

    if (integrationHealth.status === 'unhealthy') {
      overall = 'unhealthy';
    } else if (integrationHealth.status === 'degraded') {
      overall = 'degraded';
    }

    return {
      overall,
      components: {
        integration: integrationHealth,
        policyManager: policyManagerHealth,
        decisionLogger: decisionLoggerHealth
      },
      metrics
    };
  }

  /**
   * Generate request ID
   */
  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Log authorization error
   */
  private async logAuthorizationError(request: AuthorizationRequest, error: Error): Promise<void> {
    await auditLoggingService.logEvent({
      eventType: 'AUTHORIZATION_ERROR',
      category: 'AUTHORIZATION',
      severity: 'HIGH',
      source: {
        service: 'opa-service',
        version: '1.0.0',
        instance: process.env.HOSTNAME || 'unknown',
        ip: request.context.ip || 'unknown'
      },
      actor: {
        userId: request.subject.id,
        sessionId: request.context.sessionId,
        type: request.subject.type.toUpperCase() as any,
        userAgent: request.context.userAgent
      },
      target: {
        resource: `${request.resource.type}:${request.resource.id || '*'}`,
        resourceType: 'AUTHORIZATION',
        resourceId: request.context.requestId
      },
      action: request.action.name,
      outcome: 'FAILURE',
      details: {
        error: error.message,
        request: {
          subject: request.subject,
          resource: request.resource,
          action: request.action
        }
      },
      metadata: {
        correlationId: request.context.requestId,
        requestId: request.context.requestId
      },
      compliance: {
        gdpr: true,
        sox: true,
        iso27001: true,
        pci: true
      }
    });
  }

  /**
   * Log error decision
   */
  private async logErrorDecision(request: AuthorizationRequest, error: Error): Promise<string> {
    // Create a mock evaluation result for error logging
    const mockEvaluationResult: PolicyEvaluationResult = {
      decision: {
        result: false,
        allow: false,
        deny: true,
        reasons: [`Error: ${error.message}`]
      },
      executionTime: 0,
      evaluationId: this.generateRequestId(),
      timestamp: new Date(),
      input: {
        input: {
          subject: request.subject,
          resource: request.resource,
          action: request.action,
          context: request.context
        },
        policy: 'ERROR_POLICY',
        context: {
          requestId: request.context.requestId || this.generateRequestId(),
          userId: request.subject.id,
          sessionId: request.context.sessionId,
          resource: `${request.resource.type}:${request.resource.id || '*'}`,
          action: request.action.name,
          ip: request.context.ip,
          userAgent: request.context.userAgent
        }
      }
    };

    return await this.decisionLogger.logDecision(mockEvaluationResult, {
      policyId: 'ERROR',
      policyVersion: '1.0.0',
      policyName: 'Error Policy'
    });
  }

  /**
   * Setup event handlers between components
   */
  private setupEventHandlers(): void {
    // Forward integration service events
    this.integrationService.on('policyEvaluated', (result) => {
      this.emit('policyEvaluated', result);
    });

    this.integrationService.on('evaluationError', (data) => {
      this.emit('evaluationError', data);
    });

    // Forward policy manager events
    this.policyManager.on('policyCreated', (data) => {
      this.emit('policyCreated', data);
    });

    this.policyManager.on('policyUpdated', (data) => {
      this.emit('policyUpdated', data);
    });

    this.policyManager.on('policyDeployed', (data) => {
      this.emit('policyDeployed', data);
    });

    // Forward decision logger events
    this.decisionLogger.on('decisionLogged', (data) => {
      this.emit('decisionLogged', data);
    });

    this.decisionLogger.on('anomaly', (data) => {
      this.emit('anomaly', data);
    });
  }

  /**
   * Start health monitoring
   */
  private startHealthMonitoring(): void {
    setInterval(async () => {
      try {
        const health = await this.getHealthStatus();
        this.healthStatus = {
          healthy: health.overall === 'healthy',
          lastCheck: new Date(),
          errors: health.overall !== 'healthy' ? ['Service degraded or unhealthy'] : []
        };

        this.emit('healthCheck', health);

        if (health.overall !== 'healthy') {
          this.emit('healthDegraded', health);
        }
      } catch (error) {
        this.healthStatus = {
          healthy: false,
          lastCheck: new Date(),
          errors: [error.message]
        };

        this.emit('healthCheckError', error);
      }
    }, 60 * 1000); // Check every minute
  }

  /**
   * Get current health status
   */
  getCurrentHealthStatus(): typeof this.healthStatus {
    return { ...this.healthStatus };
  }

  /**
   * Get integration service instance
   */
  getIntegrationService(): OPAIntegrationService {
    return this.integrationService;
  }

  /**
   * Get policy manager instance
   */
  getPolicyManager(): PolicyManager {
    return this.policyManager;
  }

  /**
   * Get decision logger instance
   */
  getDecisionLogger(): DecisionLogger {
    return this.decisionLogger;
  }
}

// Export types
export * from './OPAIntegrationService';
export * from './PolicyManager';
export * from './DecisionLogger';

// Create default OPA service instance
export const opaService = new OPAService({
  integration: {
    serverUrl: process.env.OPA_SERVER_URL,
    timeout: parseInt(process.env.OPA_TIMEOUT || '5000'),
    retryAttempts: parseInt(process.env.OPA_RETRY_ATTEMPTS || '3'),
    cacheEnabled: process.env.OPA_CACHE_ENABLED !== 'false',
    cacheTtl: parseInt(process.env.OPA_CACHE_TTL || '300000'),
    maxCacheSize: parseInt(process.env.OPA_MAX_CACHE_SIZE || '10000')
  },
  policyManager: {
    policyDirectory: process.env.POLICY_DIRECTORY || './policies',
    backupDirectory: process.env.POLICY_BACKUP_DIRECTORY,
    opaServerUrl: process.env.OPA_SERVER_URL
  },
  decisionLogger: {
    logDirectory: process.env.DECISION_LOG_DIRECTORY || './logs/decisions',
    maxLogsInMemory: parseInt(process.env.MAX_DECISION_LOGS_IN_MEMORY || '50000'),
    encryptLogs: process.env.ENCRYPT_DECISION_LOGS !== 'false'
  }
});