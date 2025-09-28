import { PrismaClient } from '@prisma/client';
import { logger } from '@/lib/logger.js';

// ============================================================================
// POLICY SIMULATION ENGINE
// ============================================================================

/**
 * Service for simulating policy configurations and testing their effectiveness
 * before deployment to production environments
 */

export interface SimulationScenario {
  type: 'historical_replay' | 'synthetic_load' | 'edge_cases' | 'compliance_test';
  parameters: {
    timeRange?: { start: Date; end: Date };
    eventCount?: number;
    userCount?: number;
    resourceTypes?: string[];
    riskLevels?: string[];
    complianceFramework?: string;
  };
}

export interface SimulationResult {
  id: string;
  templateId: string;
  scenario: SimulationScenario;
  metrics: {
    eventsProcessed: number;
    violationsDetected: number;
    falsePositives: number;
    falseNegatives: number;
    executionTime: number;
    throughput: number; // events per second
  };
  effectiveness: {
    accuracy: number; // 0-1 score
    precision: number; // TP / (TP + FP)
    recall: number; // TP / (TP + FN)
    f1Score: number; // Harmonic mean of precision and recall
  };
  performance: {
    avgResponseTime: number;
    memoryUsage: number;
    cpuUsage: number;
  };
  recommendations: string[];
  issues: Array<{
    type: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    description: string;
    suggestion: string;
  }>;
}

export interface PolicyConfiguration {
  name: string;
  type: string;
  rules: any;
  conditions?: any;
  actions?: any;
  exceptions?: any;
  priority: string;
  enforcementMode: 'strict' | 'warn' | 'audit';
}

export class PolicySimulationService {
  constructor(private prisma: PrismaClient) {}

  /**
   * Create a new policy simulation
   */
  public async createSimulation(
    templateId: string,
    scenario: SimulationScenario,
    policyConfig: PolicyConfiguration,
    options: {
      name: string;
      description?: string;
      organizationId?: string;
      createdBy: string;
    }
  ): Promise<string> {
    try {
      // Validate template exists
      const template = await this.prisma.policyTemplate.findUnique({
        where: { id: templateId },
      });

      if (!template) {
        throw new Error(`Template ${templateId} not found`);
      }

      // Create simulation record
      const simulation = await this.prisma.policySimulation.create({
        data: {
          name: options.name,
          description: options.description,
          templateId,
          scenarioType: scenario.type,
          testParameters: scenario.parameters,
          simulatedPolicy: policyConfig,
          organizationId: options.organizationId,
          createdBy: options.createdBy,
          status: 'pending',
        },
      });

      logger.info('Policy simulation created', {
        simulationId: simulation.id,
        templateId,
        scenario: scenario.type,
      });

      return simulation.id;
    } catch (error) {
      logger.error('Failed to create simulation', { error, templateId, scenario });
      throw new Error('Failed to create simulation');
    }
  }

  /**
   * Run a policy simulation
   */
  public async runSimulation(simulationId: string): Promise<SimulationResult> {
    try {
      // Get simulation details
      const simulation = await this.prisma.policySimulation.findUnique({
        where: { id: simulationId },
        include: { template: true },
      });

      if (!simulation) {
        throw new Error(`Simulation ${simulationId} not found`);
      }

      // Update status to running
      await this.prisma.policySimulation.update({
        where: { id: simulationId },
        data: {
          status: 'running',
          startedAt: new Date(),
          progress: 0.1,
        },
      });

      logger.info('Starting policy simulation', {
        simulationId,
        scenario: simulation.scenarioType,
      });

      // Generate or fetch test data based on scenario
      const testData = await this.generateTestData(simulation);

      // Update progress
      await this.updateSimulationProgress(simulationId, 0.3);

      // Run policy evaluation on test data
      const evaluationResults = await this.evaluatePolicyOnData(
        simulation.simulatedPolicy,
        testData
      );

      // Update progress
      await this.updateSimulationProgress(simulationId, 0.7);

      // Analyze results and generate insights
      const analysisResults = await this.analyzeSimulationResults(
        evaluationResults,
        simulation
      );

      // Update progress
      await this.updateSimulationProgress(simulationId, 0.9);

      // Save final results
      const finalResult = await this.finalizeSimulation(
        simulationId,
        analysisResults
      );

      logger.info('Policy simulation completed', {
        simulationId,
        eventsProcessed: finalResult.metrics.eventsProcessed,
        violationsDetected: finalResult.metrics.violationsDetected,
      });

      return finalResult;
    } catch (error) {
      // Mark simulation as failed
      await this.prisma.policySimulation.update({
        where: { id: simulationId },
        data: { status: 'failed' },
      });

      logger.error('Policy simulation failed', { error, simulationId });
      throw new Error('Simulation execution failed');
    }
  }

  /**
   * Generate test data based on simulation scenario
   */
  private async generateTestData(simulation: any): Promise<any[]> {
    const { scenarioType, testParameters, organizationId } = simulation;

    switch (scenarioType) {
      case 'historical_replay':
        return this.generateHistoricalData(testParameters, organizationId);

      case 'synthetic_load':
        return this.generateSyntheticData(testParameters);

      case 'edge_cases':
        return this.generateEdgeCaseData(testParameters);

      case 'compliance_test':
        return this.generateComplianceTestData(testParameters);

      default:
        throw new Error(`Unknown scenario type: ${scenarioType}`);
    }
  }

  /**
   * Generate historical audit data for replay testing
   */
  private async generateHistoricalData(
    parameters: any,
    organizationId?: string
  ): Promise<any[]> {
    const { timeRange, eventCount = 1000 } = parameters;

    const whereClause: any = {
      ...(organizationId && { organizationId }),
    };

    if (timeRange) {
      whereClause.timestamp = {
        gte: new Date(timeRange.start),
        lte: new Date(timeRange.end),
      };
    }

    // Fetch historical audit logs
    const auditLogs = await this.prisma.auditLog.findMany({
      where: whereClause,
      take: eventCount,
      orderBy: { timestamp: 'desc' },
    });

    // Transform audit logs into test events
    return auditLogs.map(log => ({
      id: log.id,
      type: 'audit_event',
      eventType: log.eventType,
      actorType: log.actorType,
      actorId: log.actorId,
      resourceType: log.resourceType,
      resourceId: log.resourceId,
      action: log.action,
      timestamp: log.timestamp,
      metadata: log.metadata,
      organizationId: log.organizationId,
    }));
  }

  /**
   * Generate synthetic test data
   */
  private async generateSyntheticData(parameters: any): Promise<any[]> {
    const {
      eventCount = 1000,
      userCount = 100,
      resourceTypes = ['file', 'database', 'api'],
      riskLevels = ['low', 'medium', 'high'],
    } = parameters;

    const events: any[] = [];
    const eventTypes = [
      'file_access',
      'data_export',
      'admin_action',
      'api_call',
      'database_query',
      'user_login',
      'permission_change',
    ];

    for (let i = 0; i < eventCount; i++) {
      const event = {
        id: `synthetic_${i}`,
        type: 'synthetic_event',
        eventType: eventTypes[Math.floor(Math.random() * eventTypes.length)],
        actorType: 'user',
        actorId: `user_${Math.floor(Math.random() * userCount)}`,
        resourceType: resourceTypes[Math.floor(Math.random() * resourceTypes.length)],
        resourceId: `resource_${Math.floor(Math.random() * 500)}`,
        action: ['read', 'write', 'delete', 'execute'][Math.floor(Math.random() * 4)],
        timestamp: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000), // Last 30 days
        metadata: {
          riskLevel: riskLevels[Math.floor(Math.random() * riskLevels.length)],
          synthetic: true,
        },
      };

      events.push(event);
    }

    return events;
  }

  /**
   * Generate edge case test scenarios
   */
  private async generateEdgeCaseData(parameters: any): Promise<any[]> {
    const events: any[] = [];

    // Edge case scenarios
    const edgeCases = [
      // High-risk administrative actions
      ...Array.from({ length: 50 }, (_, i) => ({
        id: `edge_admin_${i}`,
        type: 'edge_case',
        eventType: 'admin_action',
        actorType: 'user',
        actorId: 'admin_user',
        resourceType: 'system',
        resourceId: 'critical_system',
        action: 'delete',
        timestamp: new Date(),
        metadata: { riskLevel: 'critical', edgeCase: 'admin_critical_action' },
      })),

      // Bulk data access patterns
      ...Array.from({ length: 100 }, (_, i) => ({
        id: `edge_bulk_${i}`,
        type: 'edge_case',
        eventType: 'data_access',
        actorType: 'user',
        actorId: 'bulk_user',
        resourceType: 'database',
        resourceId: `table_${i % 10}`,
        action: 'read',
        timestamp: new Date(Date.now() + i * 1000), // Rapid succession
        metadata: { riskLevel: 'high', edgeCase: 'bulk_access' },
      })),

      // After-hours access
      ...Array.from({ length: 30 }, (_, i) => ({
        id: `edge_afterhours_${i}`,
        type: 'edge_case',
        eventType: 'file_access',
        actorType: 'user',
        actorId: 'night_user',
        resourceType: 'file',
        resourceId: 'sensitive_file',
        action: 'read',
        timestamp: new Date(Date.now() - i * 60 * 60 * 1000), // Various night hours
        metadata: { riskLevel: 'medium', edgeCase: 'after_hours_access', hour: 2 },
      })),
    ];

    return edgeCases;
  }

  /**
   * Generate compliance-specific test data
   */
  private async generateComplianceTestData(parameters: any): Promise<any[]> {
    const { complianceFramework = 'GDPR' } = parameters;

    const frameworkEvents: Record<string, any[]> = {
      GDPR: [
        {
          id: 'gdpr_data_access',
          type: 'compliance_test',
          eventType: 'data_access',
          actorType: 'user',
          actorId: 'eu_user',
          resourceType: 'personal_data',
          resourceId: 'user_profile',
          action: 'read',
          timestamp: new Date(),
          metadata: { framework: 'GDPR', dataType: 'personal', region: 'EU' },
        },
        {
          id: 'gdpr_data_export',
          type: 'compliance_test',
          eventType: 'data_export',
          actorType: 'user',
          actorId: 'data_subject',
          resourceType: 'personal_data',
          resourceId: 'export_request',
          action: 'export',
          timestamp: new Date(),
          metadata: { framework: 'GDPR', purpose: 'subject_access_request' },
        },
      ],
      SOX: [
        {
          id: 'sox_financial_access',
          type: 'compliance_test',
          eventType: 'financial_data_access',
          actorType: 'user',
          actorId: 'finance_user',
          resourceType: 'financial_record',
          resourceId: 'quarterly_report',
          action: 'read',
          timestamp: new Date(),
          metadata: { framework: 'SOX', recordType: 'financial' },
        },
      ],
      HIPAA: [
        {
          id: 'hipaa_phi_access',
          type: 'compliance_test',
          eventType: 'phi_access',
          actorType: 'user',
          actorId: 'healthcare_provider',
          resourceType: 'medical_record',
          resourceId: 'patient_chart',
          action: 'read',
          timestamp: new Date(),
          metadata: { framework: 'HIPAA', dataType: 'phi' },
        },
      ],
    };

    return frameworkEvents[complianceFramework] || [];
  }

  /**
   * Evaluate policy against test data
   */
  private async evaluatePolicyOnData(
    policyConfig: PolicyConfiguration,
    testData: any[]
  ): Promise<any> {
    const results = {
      violations: [],
      allowedActions: [],
      processingTimes: [],
    };

    for (const event of testData) {
      const startTime = Date.now();

      // Simulate policy evaluation
      const violation = this.evaluateEventAgainstPolicy(event, policyConfig);

      const processingTime = Date.now() - startTime;
      results.processingTimes.push(processingTime);

      if (violation) {
        results.violations.push({
          event,
          violation,
          processingTime,
        });
      } else {
        results.allowedActions.push({
          event,
          processingTime,
        });
      }
    }

    return results;
  }

  /**
   * Simple policy evaluation simulation
   */
  private evaluateEventAgainstPolicy(event: any, policy: PolicyConfiguration): any {
    const { rules, conditions, enforcementMode } = policy;

    // Simulate various policy rule checks
    const checks = {
      riskLevel: this.checkRiskLevel(event, rules),
      timeWindow: this.checkTimeWindow(event, rules),
      resourceAccess: this.checkResourceAccess(event, rules),
      actorPermissions: this.checkActorPermissions(event, rules),
    };

    // Determine if any checks failed
    const failedChecks = Object.entries(checks).filter(([_, passed]) => !passed);

    if (failedChecks.length > 0 && enforcementMode !== 'audit') {
      return {
        policyName: policy.name,
        violationType: 'policy_violation',
        failedChecks: failedChecks.map(([check]) => check),
        severity: this.calculateViolationSeverity(failedChecks, policy),
        enforcementMode,
      };
    }

    return null;
  }

  /**
   * Check risk level constraints
   */
  private checkRiskLevel(event: any, rules: any): boolean {
    const eventRisk = event.metadata?.riskLevel || 'low';
    const allowedRisks = rules.allowedRiskLevels || ['low', 'medium', 'high', 'critical'];
    return allowedRisks.includes(eventRisk);
  }

  /**
   * Check time window constraints
   */
  private checkTimeWindow(event: any, rules: any): boolean {
    if (!rules.timeRestrictions) return true;

    const eventTime = new Date(event.timestamp);
    const hour = eventTime.getHours();

    // Simple business hours check
    if (rules.timeRestrictions.businessHoursOnly) {
      return hour >= 9 && hour <= 17;
    }

    return true;
  }

  /**
   * Check resource access constraints
   */
  private checkResourceAccess(event: any, rules: any): boolean {
    const restrictedResources = rules.restrictedResources || [];
    return !restrictedResources.includes(event.resourceType);
  }

  /**
   * Check actor permission constraints
   */
  private checkActorPermissions(event: any, rules: any): boolean {
    const requiredRole = rules.requiredRoles?.[event.action];
    if (!requiredRole) return true;

    // Simulate role check (in real scenario, would query RBAC system)
    const actorRole = event.metadata?.actorRole || 'user';
    return actorRole === requiredRole || actorRole === 'admin';
  }

  /**
   * Calculate violation severity
   */
  private calculateViolationSeverity(failedChecks: any[], policy: PolicyConfiguration): string {
    if (failedChecks.some(([check]) => check === 'riskLevel')) return 'critical';
    if (failedChecks.some(([check]) => check === 'resourceAccess')) return 'high';
    if (failedChecks.length > 2) return 'high';
    if (failedChecks.length > 1) return 'medium';
    return 'low';
  }

  /**
   * Analyze simulation results and generate insights
   */
  private async analyzeSimulationResults(evaluationResults: any, simulation: any): Promise<any> {
    const { violations, allowedActions, processingTimes } = evaluationResults;

    // Calculate metrics
    const totalEvents = violations.length + allowedActions.length;
    const violationRate = violations.length / totalEvents;
    const avgProcessingTime = processingTimes.reduce((sum, time) => sum + time, 0) / processingTimes.length;

    // For simulation purposes, generate some mock ground truth
    const groundTruth = this.generateMockGroundTruth(totalEvents, violationRate);

    // Calculate effectiveness metrics
    const truePositives = violations.filter((_, i) => groundTruth.shouldViolate[i]).length;
    const falsePositives = violations.filter((_, i) => !groundTruth.shouldViolate[i]).length;
    const falseNegatives = allowedActions.filter((_, i) => groundTruth.shouldViolate[violations.length + i]).length;
    const trueNegatives = allowedActions.filter((_, i) => !groundTruth.shouldViolate[violations.length + i]).length;

    const precision = truePositives / (truePositives + falsePositives) || 0;
    const recall = truePositives / (truePositives + falseNegatives) || 0;
    const f1Score = 2 * (precision * recall) / (precision + recall) || 0;
    const accuracy = (truePositives + trueNegatives) / totalEvents || 0;

    // Generate recommendations
    const recommendations = this.generateRecommendations({
      violationRate,
      accuracy,
      precision,
      recall,
      avgProcessingTime,
      violations,
    });

    // Identify issues
    const issues = this.identifyPolicyIssues({
      violationRate,
      accuracy,
      falsePositives,
      falseNegatives,
      avgProcessingTime,
    });

    return {
      metrics: {
        eventsProcessed: totalEvents,
        violationsDetected: violations.length,
        falsePositives,
        falseNegatives,
        executionTime: processingTimes.reduce((sum, time) => sum + time, 0),
        throughput: totalEvents / (processingTimes.reduce((sum, time) => sum + time, 0) / 1000),
      },
      effectiveness: {
        accuracy,
        precision,
        recall,
        f1Score,
      },
      performance: {
        avgResponseTime: avgProcessingTime,
        memoryUsage: Math.random() * 100, // Mock data
        cpuUsage: Math.random() * 100, // Mock data
      },
      recommendations,
      issues,
    };
  }

  /**
   * Generate mock ground truth for evaluation
   */
  private generateMockGroundTruth(totalEvents: number, baseViolationRate: number): any {
    const shouldViolate = Array.from({ length: totalEvents }, () =>
      Math.random() < baseViolationRate * 1.2 // Slightly higher than detected rate
    );

    return { shouldViolate };
  }

  /**
   * Generate policy recommendations
   */
  private generateRecommendations(metrics: any): string[] {
    const recommendations: string[] = [];

    if (metrics.violationRate > 0.3) {
      recommendations.push('Policy may be too restrictive - consider relaxing some constraints');
    }

    if (metrics.accuracy < 0.8) {
      recommendations.push('Policy accuracy is low - review rule definitions for clarity');
    }

    if (metrics.precision < 0.7) {
      recommendations.push('High false positive rate - refine conditions to reduce noise');
    }

    if (metrics.recall < 0.7) {
      recommendations.push('High false negative rate - strengthen enforcement rules');
    }

    if (metrics.avgProcessingTime > 100) {
      recommendations.push('Policy evaluation is slow - optimize rule complexity');
    }

    return recommendations;
  }

  /**
   * Identify policy configuration issues
   */
  private identifyPolicyIssues(metrics: any): any[] {
    const issues: any[] = [];

    if (metrics.falsePositives > metrics.violationRate * 0.3) {
      issues.push({
        type: 'high_false_positives',
        severity: 'medium',
        description: 'Policy is generating many false positive violations',
        suggestion: 'Review and refine rule conditions to reduce false alerts',
      });
    }

    if (metrics.falseNegatives > metrics.violationRate * 0.2) {
      issues.push({
        type: 'high_false_negatives',
        severity: 'high',
        description: 'Policy is missing genuine violations',
        suggestion: 'Strengthen enforcement rules and add missing conditions',
      });
    }

    if (metrics.avgProcessingTime > 200) {
      issues.push({
        type: 'performance_issue',
        severity: 'medium',
        description: 'Policy evaluation is taking too long',
        suggestion: 'Simplify complex rules and optimize condition checks',
      });
    }

    return issues;
  }

  /**
   * Update simulation progress
   */
  private async updateSimulationProgress(simulationId: string, progress: number): Promise<void> {
    await this.prisma.policySimulation.update({
      where: { id: simulationId },
      data: { progress },
    });
  }

  /**
   * Finalize simulation and save results
   */
  private async finalizeSimulation(simulationId: string, results: any): Promise<SimulationResult> {
    const completedSimulation = await this.prisma.policySimulation.update({
      where: { id: simulationId },
      data: {
        status: 'completed',
        completedAt: new Date(),
        progress: 1.0,
        results,
        summary: {
          accuracy: results.effectiveness.accuracy,
          eventsProcessed: results.metrics.eventsProcessed,
          violationsDetected: results.metrics.violationsDetected,
          recommendations: results.recommendations.length,
        },
        eventsProcessed: results.metrics.eventsProcessed,
        violationsFound: results.metrics.violationsDetected,
        falsePositives: results.metrics.falsePositives,
        executionTime: results.metrics.executionTime,
      },
      include: { template: true },
    });

    // Update template usage count
    await this.prisma.policyTemplate.update({
      where: { id: completedSimulation.templateId },
      data: {
        usageCount: { increment: 1 },
      },
    });

    return {
      id: completedSimulation.id,
      templateId: completedSimulation.templateId,
      scenario: {
        type: completedSimulation.scenarioType as any,
        parameters: completedSimulation.testParameters,
      },
      metrics: results.metrics,
      effectiveness: results.effectiveness,
      performance: results.performance,
      recommendations: results.recommendations,
      issues: results.issues,
    };
  }

  /**
   * Get simulation status and results
   */
  public async getSimulationResult(simulationId: string): Promise<any> {
    const simulation = await this.prisma.policySimulation.findUnique({
      where: { id: simulationId },
      include: { template: true },
    });

    if (!simulation) {
      throw new Error(`Simulation ${simulationId} not found`);
    }

    return {
      id: simulation.id,
      name: simulation.name,
      status: simulation.status,
      progress: simulation.progress,
      templateName: simulation.template.name,
      scenarioType: simulation.scenarioType,
      createdAt: simulation.createdAt,
      startedAt: simulation.startedAt,
      completedAt: simulation.completedAt,
      results: simulation.results,
      summary: simulation.summary,
      metrics: {
        eventsProcessed: simulation.eventsProcessed,
        violationsFound: simulation.violationsFound,
        falsePositives: simulation.falsePositives,
        executionTime: simulation.executionTime,
      },
    };
  }

  /**
   * List simulations for an organization
   */
  public async listSimulations(
    organizationId?: string,
    options: {
      status?: string;
      templateId?: string;
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<any[]> {
    const { status, templateId, limit = 50, offset = 0 } = options;

    const simulations = await this.prisma.policySimulation.findMany({
      where: {
        ...(organizationId && { organizationId }),
        ...(status && { status }),
        ...(templateId && { templateId }),
      },
      include: { template: true },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    });

    return simulations.map(sim => ({
      id: sim.id,
      name: sim.name,
      status: sim.status,
      progress: sim.progress,
      templateName: sim.template.name,
      scenarioType: sim.scenarioType,
      createdAt: sim.createdAt,
      completedAt: sim.completedAt,
      eventsProcessed: sim.eventsProcessed,
      violationsFound: sim.violationsFound,
    }));
  }
}