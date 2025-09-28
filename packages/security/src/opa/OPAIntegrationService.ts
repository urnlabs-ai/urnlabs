import { loadPolicy } from '@open-policy-agent/opa-wasm';
import fetch from 'node-fetch';
import { EventEmitter } from 'events';
import { auditLoggingService, AuditEvent } from '../services/audit-logging';
import { encryptionService } from '../services/encryption';

export interface PolicyDecision {
  result: boolean;
  reasons?: string[];
  metadata?: Record<string, any>;
  allow?: boolean;
  deny?: boolean;
}

export interface PolicyEvaluationInput {
  input: Record<string, any>;
  policy: string;
  query?: string;
  context?: {
    requestId: string;
    userId?: string;
    sessionId?: string;
    resource: string;
    action: string;
    ip?: string;
    userAgent?: string;
  };
}

export interface PolicyEvaluationResult {
  decision: PolicyDecision;
  executionTime: number;
  evaluationId: string;
  timestamp: Date;
  input: PolicyEvaluationInput;
  cached?: boolean;
  policyVersion?: string;
}

export interface CachedDecision {
  decision: PolicyDecision;
  timestamp: Date;
  ttl: number;
  hash: string;
}

export interface OPAConfiguration {
  serverUrl?: string;
  timeout: number;
  retryAttempts: number;
  cacheEnabled: boolean;
  cacheTtl: number;
  maxCacheSize: number;
  enableMetrics: boolean;
  defaultQuery: string;
  policyDirectory: string;
  validatePolicies: boolean;
}

export class OPAIntegrationService extends EventEmitter {
  private policyCache = new Map<string, any>();
  private decisionCache = new Map<string, CachedDecision>();
  private metrics = {
    totalEvaluations: 0,
    cacheHits: 0,
    cacheMisses: 0,
    evaluationTimeTotal: 0,
    errors: 0,
    decisions: {
      allow: 0,
      deny: 0,
      error: 0
    }
  };

  private config: OPAConfiguration = {
    timeout: 5000,
    retryAttempts: 3,
    cacheEnabled: true,
    cacheTtl: 300000, // 5 minutes
    maxCacheSize: 10000,
    enableMetrics: true,
    defaultQuery: 'data.authz.allow',
    policyDirectory: './policies',
    validatePolicies: true
  };

  constructor(config?: Partial<OPAConfiguration>) {
    super();
    if (config) {
      this.config = { ...this.config, ...config };
    }
    this.setupPeriodicTasks();
  }

  /**
   * Evaluate a policy decision using OPA
   */
  async evaluatePolicy(evaluationInput: PolicyEvaluationInput): Promise<PolicyEvaluationResult> {
    const startTime = Date.now();
    const evaluationId = encryptionService.generateUUID();

    try {
      // Check cache first
      if (this.config.cacheEnabled) {
        const cached = this.getCachedDecision(evaluationInput);
        if (cached) {
          this.metrics.cacheHits++;
          return {
            decision: cached.decision,
            executionTime: Date.now() - startTime,
            evaluationId,
            timestamp: new Date(),
            input: evaluationInput,
            cached: true
          };
        }
        this.metrics.cacheMisses++;
      }

      // Evaluate policy
      const decision = await this.performPolicyEvaluation(evaluationInput);
      const executionTime = Date.now() - startTime;

      const result: PolicyEvaluationResult = {
        decision,
        executionTime,
        evaluationId,
        timestamp: new Date(),
        input: evaluationInput,
        cached: false
      };

      // Cache the decision
      if (this.config.cacheEnabled) {
        this.cacheDecision(evaluationInput, decision);
      }

      // Update metrics
      this.updateMetrics(decision, executionTime);

      // Log decision to audit system
      await this.logPolicyDecision(result);

      // Emit event for real-time monitoring
      this.emit('policyEvaluated', result);

      return result;

    } catch (error) {
      this.metrics.errors++;
      this.metrics.totalEvaluations++;

      const errorResult: PolicyEvaluationResult = {
        decision: { result: false, reasons: [`Evaluation error: ${error.message}`] },
        executionTime: Date.now() - startTime,
        evaluationId,
        timestamp: new Date(),
        input: evaluationInput
      };

      // Log error to audit system
      await this.logPolicyDecision(errorResult, error);

      this.emit('evaluationError', { error, evaluationInput, evaluationId });

      // For security, default to deny on errors
      return errorResult;
    }
  }

  /**
   * Perform the actual policy evaluation
   */
  private async performPolicyEvaluation(evaluationInput: PolicyEvaluationInput): Promise<PolicyDecision> {
    const { input, policy, query = this.config.defaultQuery } = evaluationInput;

    // Try WASM evaluation first (faster)
    try {
      const wasmPolicy = await this.loadWasmPolicy(policy);
      if (wasmPolicy) {
        const result = wasmPolicy.evaluate(input, query);
        return this.formatDecision(result);
      }
    } catch (error) {
      console.warn('WASM evaluation failed, falling back to REST API:', error.message);
    }

    // Fallback to REST API evaluation
    if (this.config.serverUrl) {
      return await this.evaluateViaRestAPI(input, policy, query);
    }

    throw new Error('No evaluation method available (WASM failed and no server URL configured)');
  }

  /**
   * Load and cache compiled WASM policy
   */
  private async loadWasmPolicy(policyContent: string): Promise<any> {
    const policyHash = encryptionService.createHash(policyContent);

    if (this.policyCache.has(policyHash)) {
      return this.policyCache.get(policyHash);
    }

    try {
      // In production, policies should be pre-compiled to WASM
      // This is a simplified version for demonstration
      const wasmPolicy = await loadPolicy(Buffer.from(policyContent));
      this.policyCache.set(policyHash, wasmPolicy);
      return wasmPolicy;
    } catch (error) {
      console.error('Failed to load WASM policy:', error);
      return null;
    }
  }

  /**
   * Evaluate policy via OPA REST API
   */
  private async evaluateViaRestAPI(
    input: Record<string, any>,
    policy: string,
    query: string
  ): Promise<PolicyDecision> {
    const requestBody = {
      input,
      query,
      policy // In production, policy would be identified by name/version
    };

    const response = await fetch(`${this.config.serverUrl}/v1/data`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
      timeout: this.config.timeout
    });

    if (!response.ok) {
      throw new Error(`OPA evaluation failed: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();
    return this.formatDecision(result);
  }

  /**
   * Format decision result into standard format
   */
  private formatDecision(result: any): PolicyDecision {
    // Handle different OPA result formats
    if (typeof result === 'boolean') {
      return { result, allow: result, deny: !result };
    }

    if (result && typeof result === 'object') {
      if ('result' in result) {
        return {
          result: Boolean(result.result),
          allow: Boolean(result.result),
          deny: !Boolean(result.result),
          reasons: result.reasons || [],
          metadata: result.metadata || {}
        };
      }

      if ('allow' in result) {
        return {
          result: Boolean(result.allow),
          allow: Boolean(result.allow),
          deny: !Boolean(result.allow),
          reasons: result.reasons || [],
          metadata: result.metadata || {}
        };
      }
    }

    // Default to deny if result format is unexpected
    return {
      result: false,
      allow: false,
      deny: true,
      reasons: ['Unexpected policy result format'],
      metadata: { originalResult: result }
    };
  }

  /**
   * Generate cache key for decision
   */
  private generateCacheKey(evaluationInput: PolicyEvaluationInput): string {
    const keyData = {
      input: evaluationInput.input,
      policy: evaluationInput.policy,
      query: evaluationInput.query || this.config.defaultQuery
    };
    return encryptionService.createHash(JSON.stringify(keyData, Object.keys(keyData).sort()));
  }

  /**
   * Get cached decision if available and not expired
   */
  private getCachedDecision(evaluationInput: PolicyEvaluationInput): CachedDecision | null {
    const cacheKey = this.generateCacheKey(evaluationInput);
    const cached = this.decisionCache.get(cacheKey);

    if (!cached) {
      return null;
    }

    // Check if cache entry has expired
    if (Date.now() - cached.timestamp.getTime() > cached.ttl) {
      this.decisionCache.delete(cacheKey);
      return null;
    }

    return cached;
  }

  /**
   * Cache a policy decision
   */
  private cacheDecision(evaluationInput: PolicyEvaluationInput, decision: PolicyDecision): void {
    if (this.decisionCache.size >= this.config.maxCacheSize) {
      // Remove oldest entries (simple LRU)
      const oldestKey = this.decisionCache.keys().next().value;
      this.decisionCache.delete(oldestKey);
    }

    const cacheKey = this.generateCacheKey(evaluationInput);
    const cachedDecision: CachedDecision = {
      decision,
      timestamp: new Date(),
      ttl: this.config.cacheTtl,
      hash: cacheKey
    };

    this.decisionCache.set(cacheKey, cachedDecision);
  }

  /**
   * Update metrics
   */
  private updateMetrics(decision: PolicyDecision, executionTime: number): void {
    if (!this.config.enableMetrics) return;

    this.metrics.totalEvaluations++;
    this.metrics.evaluationTimeTotal += executionTime;

    if (decision.allow) {
      this.metrics.decisions.allow++;
    } else if (decision.deny) {
      this.metrics.decisions.deny++;
    } else {
      this.metrics.decisions.error++;
    }
  }

  /**
   * Log policy decision to audit system
   */
  private async logPolicyDecision(
    result: PolicyEvaluationResult,
    error?: Error
  ): Promise<void> {
    const context = result.input.context;
    const decision = result.decision;

    const auditEvent: Omit<AuditEvent, 'id' | 'timestamp' | 'signature'> = {
      eventType: 'POLICY_EVALUATION',
      category: 'AUTHORIZATION',
      severity: error ? 'HIGH' : (decision.deny ? 'MEDIUM' : 'LOW'),
      source: {
        service: 'opa-integration',
        version: '1.0.0',
        instance: process.env.HOSTNAME || 'unknown',
        ip: context?.ip || 'unknown'
      },
      actor: {
        userId: context?.userId,
        sessionId: context?.sessionId,
        type: context?.userId ? 'USER' : 'SYSTEM',
        userAgent: context?.userAgent
      },
      target: {
        resource: context?.resource || 'unknown',
        resourceType: 'POLICY',
        resourceId: result.evaluationId
      },
      action: context?.action || 'EVALUATE',
      outcome: error ? 'FAILURE' : (decision.allow ? 'SUCCESS' : 'FAILURE'),
      details: {
        evaluationId: result.evaluationId,
        decision: decision.result,
        allow: decision.allow,
        deny: decision.deny,
        reasons: decision.reasons,
        executionTime: result.executionTime,
        cached: result.cached,
        inputHash: encryptionService.createHash(JSON.stringify(result.input.input)),
        policyHash: encryptionService.createHash(result.input.policy),
        error: error?.message
      },
      metadata: {
        correlationId: context?.requestId,
        requestId: context?.requestId,
        duration: result.executionTime
      },
      compliance: {
        gdpr: true,
        sox: true,
        iso27001: true,
        pci: true
      }
    };

    await auditLoggingService.logEvent(auditEvent);
  }

  /**
   * Get evaluation metrics
   */
  getMetrics(): typeof this.metrics & { averageExecutionTime: number } {
    return {
      ...this.metrics,
      averageExecutionTime: this.metrics.totalEvaluations > 0
        ? this.metrics.evaluationTimeTotal / this.metrics.totalEvaluations
        : 0
    };
  }

  /**
   * Clear decision cache
   */
  clearCache(): void {
    this.decisionCache.clear();
    this.policyCache.clear();
    this.emit('cacheCleared');
  }

  /**
   * Health check for OPA integration
   */
  async healthCheck(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    details: Record<string, any>;
  }> {
    const health = {
      status: 'healthy' as const,
      details: {
        wasmAvailable: false,
        serverAvailable: false,
        cacheSize: this.decisionCache.size,
        policyCacheSize: this.policyCache.size,
        metrics: this.getMetrics()
      }
    };

    // Test WASM availability
    try {
      await this.loadWasmPolicy('package example\ndefault allow = false');
      health.details.wasmAvailable = true;
    } catch (error) {
      health.details.wasmError = error.message;
    }

    // Test server availability
    if (this.config.serverUrl) {
      try {
        const response = await fetch(`${this.config.serverUrl}/health`, {
          timeout: 2000
        });
        health.details.serverAvailable = response.ok;
        if (!response.ok) {
          health.details.serverError = `${response.status} ${response.statusText}`;
        }
      } catch (error) {
        health.details.serverError = error.message;
      }
    }

    // Determine overall health
    if (!health.details.wasmAvailable && !health.details.serverAvailable) {
      health.status = 'unhealthy';
    } else if (this.metrics.errors > this.metrics.totalEvaluations * 0.1) {
      health.status = 'degraded';
    }

    return health;
  }

  /**
   * Setup periodic maintenance tasks
   */
  private setupPeriodicTasks(): void {
    // Clean expired cache entries every 5 minutes
    setInterval(() => {
      this.cleanExpiredCacheEntries();
    }, 5 * 60 * 1000);

    // Emit metrics every minute
    if (this.config.enableMetrics) {
      setInterval(() => {
        this.emit('metrics', this.getMetrics());
      }, 60 * 1000);
    }
  }

  /**
   * Clean expired cache entries
   */
  private cleanExpiredCacheEntries(): void {
    const now = Date.now();
    let removedCount = 0;

    for (const [key, cached] of this.decisionCache.entries()) {
      if (now - cached.timestamp.getTime() > cached.ttl) {
        this.decisionCache.delete(key);
        removedCount++;
      }
    }

    if (removedCount > 0) {
      this.emit('cacheCleanup', { removedEntries: removedCount });
    }
  }

  /**
   * Evaluate multiple policies in parallel
   */
  async evaluatePolicies(evaluations: PolicyEvaluationInput[]): Promise<PolicyEvaluationResult[]> {
    const promises = evaluations.map(evaluation => this.evaluatePolicy(evaluation));
    return Promise.all(promises);
  }

  /**
   * Batch evaluate with different inputs against same policy
   */
  async batchEvaluate(
    policy: string,
    inputs: Array<{ input: Record<string, any>; context?: PolicyEvaluationInput['context'] }>,
    query?: string
  ): Promise<PolicyEvaluationResult[]> {
    const evaluations = inputs.map(({ input, context }) => ({
      input,
      policy,
      query,
      context
    }));

    return this.evaluatePolicies(evaluations);
  }
}

export const opaIntegrationService = new OPAIntegrationService();