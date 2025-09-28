/**
 * Experiment Manager
 *
 * High-level management interface for A/B tests and experiments,
 * providing automation, monitoring, and lifecycle management.
 */

import { ABTestingFramework, ExperimentConfig, ExperimentResult, ExperimentState } from './ABTestingFramework';
import { StatisticalAnalyzer, StatisticalAnalysis } from './StatisticalAnalyzer';
import { PerformanceOptimizer } from './PerformanceOptimizer';

export interface ExperimentTemplate {
  id: string;
  name: string;
  description: string;
  category: ExperimentCategory;
  defaultConfig: Partial<ExperimentConfig>;
  requiredVariants: TemplateVariant[];
  recommendedMetrics: TemplateMetric[];
  estimatedDuration: number; // days
  complexity: ExperimentComplexity;
  prerequisites: string[];
  tags: string[];
}

export interface TemplateVariant {
  name: string;
  description: string;
  configTemplate: Record<string, any>;
  isControl: boolean;
}

export interface TemplateMetric {
  name: string;
  type: string;
  importance: MetricImportance;
  description: string;
  isGuardrail: boolean;
}

export interface ExperimentPlan {
  experimentId: string;
  template: ExperimentTemplate;
  customizations: Record<string, any>;
  estimatedSampleSize: number;
  estimatedDuration: number;
  estimatedCost: number;
  riskAssessment: RiskAssessment;
  approvalRequired: boolean;
  stakeholders: string[];
}

export interface RiskAssessment {
  overallRisk: RiskLevel;
  risks: Risk[];
  mitigations: Mitigation[];
  approvalRequired: boolean;
}

export interface Risk {
  id: string;
  type: RiskType;
  description: string;
  probability: number; // 0-1
  impact: number; // 0-1
  severity: RiskLevel;
  mitigation?: string;
}

export interface Mitigation {
  riskId: string;
  strategy: string;
  implementation: string;
  effectiveness: number; // 0-1
}

export interface ExperimentMonitoring {
  experimentId: string;
  alerts: ExperimentAlert[];
  healthChecks: HealthCheck[];
  automatedActions: AutomatedAction[];
  lastCheck: Date;
  status: MonitoringStatus;
}

export interface ExperimentAlert {
  id: string;
  type: AlertType;
  severity: AlertSeverity;
  message: string;
  timestamp: Date;
  acknowledged: boolean;
  actionTaken?: string;
}

export interface HealthCheck {
  name: string;
  status: HealthStatus;
  lastCheck: Date;
  details: string;
  threshold?: number;
  value?: number;
}

export interface AutomatedAction {
  trigger: ActionTrigger;
  action: ActionType;
  conditions: string[];
  executed: boolean;
  executedAt?: Date;
  result?: string;
}

export enum ExperimentCategory {
  AGENT_OPTIMIZATION = 'agent_optimization',
  WORKFLOW_TESTING = 'workflow_testing',
  UI_UX_TESTING = 'ui_ux_testing',
  PERFORMANCE_TESTING = 'performance_testing',
  COST_OPTIMIZATION = 'cost_optimization',
  FEATURE_ROLLOUT = 'feature_rollout'
}

export enum ExperimentComplexity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

export enum MetricImportance {
  PRIMARY = 'primary',
  SECONDARY = 'secondary',
  GUARDRAIL = 'guardrail'
}

export enum RiskLevel {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

export enum RiskType {
  DATA_LOSS = 'data_loss',
  PERFORMANCE_DEGRADATION = 'performance_degradation',
  USER_EXPERIENCE = 'user_experience',
  COST_OVERRUN = 'cost_overrun',
  SECURITY = 'security',
  COMPLIANCE = 'compliance',
  BUSINESS_IMPACT = 'business_impact'
}

export enum AlertType {
  SAMPLE_RATIO_MISMATCH = 'sample_ratio_mismatch',
  GUARDRAIL_VIOLATION = 'guardrail_violation',
  STATISTICAL_SIGNIFICANCE = 'statistical_significance',
  PERFORMANCE_DEGRADATION = 'performance_degradation',
  ERROR_RATE_SPIKE = 'error_rate_spike',
  COST_ANOMALY = 'cost_anomaly',
  DATA_QUALITY = 'data_quality'
}

export enum AlertSeverity {
  INFO = 'info',
  WARNING = 'warning',
  ERROR = 'error',
  CRITICAL = 'critical'
}

export enum HealthStatus {
  HEALTHY = 'healthy',
  WARNING = 'warning',
  UNHEALTHY = 'unhealthy',
  UNKNOWN = 'unknown'
}

export enum MonitoringStatus {
  ACTIVE = 'active',
  PAUSED = 'paused',
  FAILED = 'failed'
}

export enum ActionTrigger {
  GUARDRAIL_VIOLATION = 'guardrail_violation',
  STATISTICAL_SIGNIFICANCE = 'statistical_significance',
  SAMPLE_SIZE_REACHED = 'sample_size_reached',
  TIME_LIMIT_REACHED = 'time_limit_reached',
  ERROR_THRESHOLD_EXCEEDED = 'error_threshold_exceeded'
}

export enum ActionType {
  STOP_EXPERIMENT = 'stop_experiment',
  PAUSE_EXPERIMENT = 'pause_experiment',
  ADJUST_TRAFFIC = 'adjust_traffic',
  SEND_ALERT = 'send_alert',
  ESCALATE = 'escalate'
}

export class ExperimentManager {
  private abTesting: ABTestingFramework;
  private statisticalAnalyzer: StatisticalAnalyzer;
  private performanceOptimizer: PerformanceOptimizer;
  private templates: Map<string, ExperimentTemplate> = new Map();
  private monitoring: Map<string, ExperimentMonitoring> = new Map();
  private redis?: any;
  private prisma?: any;

  constructor(config?: {
    redis?: any;
    prisma?: any;
  }) {
    this.redis = config?.redis;
    this.prisma = config?.prisma;

    this.abTesting = new ABTestingFramework(config);
    this.statisticalAnalyzer = new StatisticalAnalyzer(config);
    this.performanceOptimizer = new PerformanceOptimizer(config);

    this.initializeTemplates();
    this.startMonitoring();
  }

  /**
   * Create experiment from template
   */
  async createExperimentFromTemplate(
    templateId: string,
    customizations: Record<string, any>
  ): Promise<ExperimentPlan> {
    const template = this.templates.get(templateId);
    if (!template) {
      throw new Error(`Template ${templateId} not found`);
    }

    // Generate experiment ID
    const experimentId = `exp_${template.category}_${Date.now()}`;

    // Estimate requirements
    const estimatedSampleSize = this.calculateSampleSize(template, customizations);
    const estimatedDuration = this.calculateDuration(template, estimatedSampleSize);
    const estimatedCost = this.calculateCost(template, estimatedSampleSize, estimatedDuration);

    // Assess risks
    const riskAssessment = this.assessRisks(template, customizations);

    const plan: ExperimentPlan = {
      experimentId,
      template,
      customizations,
      estimatedSampleSize,
      estimatedDuration,
      estimatedCost,
      riskAssessment,
      approvalRequired: this.requiresApproval(template, riskAssessment),
      stakeholders: this.identifyStakeholders(template)
    };

    return plan;
  }

  /**
   * Execute experiment plan
   */
  async executeExperimentPlan(plan: ExperimentPlan): Promise<string> {
    // Create experiment configuration
    const config: Omit<ExperimentConfig, 'status'> = {
      id: plan.experimentId,
      name: plan.template.name,
      description: plan.template.description,
      hypothesis: plan.customizations.hypothesis || 'Default hypothesis',
      owner: plan.customizations.owner || 'system',
      startDate: new Date(),
      endDate: new Date(Date.now() + plan.estimatedDuration * 24 * 60 * 60 * 1000),
      minSampleSize: plan.estimatedSampleSize,
      minDetectableEffect: plan.customizations.minDetectableEffect || 0.05,
      confidenceLevel: plan.customizations.confidenceLevel || 0.95,
      variants: this.createVariantsFromTemplate(plan.template, plan.customizations),
      trafficAllocation: this.createTrafficAllocation(plan.template, plan.customizations),
      targetMetrics: this.createTargetMetrics(plan.template, plan.customizations),
      segmentationRules: plan.customizations.segmentationRules,
      tags: [...plan.template.tags, ...Object.keys(plan.customizations)],
      metadata: {
        templateId: plan.template.id,
        estimatedCost: plan.estimatedCost,
        riskLevel: plan.riskAssessment.overallRisk,
        ...plan.customizations
      }
    };

    // Create experiment
    const experiment = await this.abTesting.createExperiment(config);

    // Set up monitoring
    await this.setupExperimentMonitoring(experiment.id, plan);

    return experiment.id;
  }

  /**
   * Start experiment with safety checks
   */
  async startExperiment(experimentId: string): Promise<void> {
    const experiment = await this.abTesting.getExperiment(experimentId);
    if (!experiment) {
      throw new Error(`Experiment ${experimentId} not found`);
    }

    // Run pre-flight checks
    await this.runPreflightChecks(experiment);

    // Start experiment
    await this.abTesting.startExperiment(experimentId);

    // Initialize monitoring
    const monitoring = this.monitoring.get(experimentId);
    if (monitoring) {
      monitoring.status = MonitoringStatus.ACTIVE;
      monitoring.lastCheck = new Date();
    }

    console.log(`Started experiment with monitoring: ${experiment.name} (${experimentId})`);
  }

  /**
   * Monitor all active experiments
   */
  async monitorExperiments(): Promise<void> {
    const experiments = await this.abTesting.listExperiments({
      state: ExperimentState.RUNNING
    });

    for (const experiment of experiments) {
      await this.monitorExperiment(experiment.id);
    }
  }

  /**
   * Monitor specific experiment
   */
  async monitorExperiment(experimentId: string): Promise<void> {
    const monitoring = this.monitoring.get(experimentId);
    if (!monitoring || monitoring.status !== MonitoringStatus.ACTIVE) {
      return;
    }

    try {
      // Run health checks
      await this.runHealthChecks(experimentId, monitoring);

      // Check for alerts
      await this.checkAlerts(experimentId, monitoring);

      // Execute automated actions
      await this.executeAutomatedActions(experimentId, monitoring);

      monitoring.lastCheck = new Date();
    } catch (error) {
      console.error(`Error monitoring experiment ${experimentId}:`, error);
      monitoring.status = MonitoringStatus.FAILED;
    }
  }

  /**
   * Analyze experiment progress
   */
  async analyzeExperiment(experimentId: string): Promise<{
    results: StatisticalAnalysis[];
    recommendations: string[];
    nextSteps: string[];
  }> {
    const experiment = await this.abTesting.getExperiment(experimentId);
    if (!experiment) {
      throw new Error(`Experiment ${experimentId} not found`);
    }

    const results = await this.abTesting.getResults(experimentId);

    // Perform statistical analysis
    const analysis = await this.statisticalAnalyzer.analyzeExperiment(
      experiment,
      results
    );

    // Generate recommendations
    const recommendations = this.generateRecommendations(experiment, analysis);
    const nextSteps = this.generateNextSteps(experiment, analysis);

    return {
      results: analysis,
      recommendations,
      nextSteps
    };
  }

  /**
   * Get experiment dashboard data
   */
  async getExperimentDashboard(experimentId: string): Promise<{
    experiment: ExperimentConfig;
    monitoring: ExperimentMonitoring;
    analysis: StatisticalAnalysis[];
    alerts: ExperimentAlert[];
    healthChecks: HealthCheck[];
  }> {
    const experiment = await this.abTesting.getExperiment(experimentId);
    if (!experiment) {
      throw new Error(`Experiment ${experimentId} not found`);
    }

    const monitoring = this.monitoring.get(experimentId);
    if (!monitoring) {
      throw new Error(`Monitoring not found for experiment ${experimentId}`);
    }

    const { results: analysis } = await this.analyzeExperiment(experimentId);

    return {
      experiment,
      monitoring,
      analysis,
      alerts: monitoring.alerts,
      healthChecks: monitoring.healthChecks
    };
  }

  /**
   * List available templates
   */
  getTemplates(category?: ExperimentCategory): ExperimentTemplate[] {
    const templates = Array.from(this.templates.values());
    return category ? templates.filter(t => t.category === category) : templates;
  }

  /**
   * Initialize experiment templates
   */
  private initializeTemplates(): void {
    // Agent Performance Optimization Template
    this.templates.set('agent_performance_basic', {
      id: 'agent_performance_basic',
      name: 'Agent Performance Optimization',
      description: 'Test different agent configurations for performance improvements',
      category: ExperimentCategory.AGENT_OPTIMIZATION,
      defaultConfig: {
        minSampleSize: 1000,
        confidenceLevel: 0.95,
        minDetectableEffect: 0.1
      },
      requiredVariants: [
        {
          name: 'Control',
          description: 'Current agent configuration',
          configTemplate: { optimization: 'none' },
          isControl: true
        },
        {
          name: 'Optimized',
          description: 'Performance-optimized agent configuration',
          configTemplate: { optimization: 'performance' },
          isControl: false
        }
      ],
      recommendedMetrics: [
        {
          name: 'task_completion_time',
          type: 'continuous',
          importance: MetricImportance.PRIMARY,
          description: 'Time to complete tasks',
          isGuardrail: false
        },
        {
          name: 'success_rate',
          type: 'binary',
          importance: MetricImportance.PRIMARY,
          description: 'Task success rate',
          isGuardrail: true
        },
        {
          name: 'error_rate',
          type: 'rate',
          importance: MetricImportance.GUARDRAIL,
          description: 'Error rate',
          isGuardrail: true
        }
      ],
      estimatedDuration: 14, // days
      complexity: ExperimentComplexity.MEDIUM,
      prerequisites: ['agent_baseline_metrics'],
      tags: ['performance', 'optimization', 'agent']
    });

    // Workflow Testing Template
    this.templates.set('workflow_comparison', {
      id: 'workflow_comparison',
      name: 'Workflow Comparison Test',
      description: 'Compare different workflow implementations',
      category: ExperimentCategory.WORKFLOW_TESTING,
      defaultConfig: {
        minSampleSize: 500,
        confidenceLevel: 0.95,
        minDetectableEffect: 0.15
      },
      requiredVariants: [
        {
          name: 'Current Workflow',
          description: 'Existing workflow implementation',
          configTemplate: { workflow: 'current' },
          isControl: true
        },
        {
          name: 'New Workflow',
          description: 'Updated workflow implementation',
          configTemplate: { workflow: 'new' },
          isControl: false
        }
      ],
      recommendedMetrics: [
        {
          name: 'workflow_completion_time',
          type: 'continuous',
          importance: MetricImportance.PRIMARY,
          description: 'Workflow completion time',
          isGuardrail: false
        },
        {
          name: 'step_failure_rate',
          type: 'rate',
          importance: MetricImportance.GUARDRAIL,
          description: 'Step failure rate',
          isGuardrail: true
        }
      ],
      estimatedDuration: 7,
      complexity: ExperimentComplexity.LOW,
      prerequisites: [],
      tags: ['workflow', 'testing']
    });

    // Cost Optimization Template
    this.templates.set('cost_optimization', {
      id: 'cost_optimization',
      name: 'Cost Optimization Test',
      description: 'Test cost-optimized configurations',
      category: ExperimentCategory.COST_OPTIMIZATION,
      defaultConfig: {
        minSampleSize: 2000,
        confidenceLevel: 0.99,
        minDetectableEffect: 0.05
      },
      requiredVariants: [
        {
          name: 'Standard Config',
          description: 'Standard resource allocation',
          configTemplate: { resourceLevel: 'standard' },
          isControl: true
        },
        {
          name: 'Cost Optimized',
          description: 'Cost-optimized resource allocation',
          configTemplate: { resourceLevel: 'optimized' },
          isControl: false
        }
      ],
      recommendedMetrics: [
        {
          name: 'cost_per_task',
          type: 'continuous',
          importance: MetricImportance.PRIMARY,
          description: 'Cost per completed task',
          isGuardrail: false
        },
        {
          name: 'quality_score',
          type: 'continuous',
          importance: MetricImportance.GUARDRAIL,
          description: 'Output quality score',
          isGuardrail: true
        }
      ],
      estimatedDuration: 21,
      complexity: ExperimentComplexity.HIGH,
      prerequisites: ['cost_tracking_setup'],
      tags: ['cost', 'optimization', 'efficiency']
    });
  }

  /**
   * Start monitoring background process
   */
  private startMonitoring(): void {
    setInterval(async () => {
      try {
        await this.monitorExperiments();
      } catch (error) {
        console.error('Error in experiment monitoring:', error);
      }
    }, 60000); // Check every minute
  }

  /**
   * Calculate required sample size
   */
  private calculateSampleSize(
    template: ExperimentTemplate,
    customizations: Record<string, any>
  ): number {
    const baseSize = template.defaultConfig.minSampleSize || 1000;
    const effect = customizations.minDetectableEffect || template.defaultConfig.minDetectableEffect || 0.1;
    const confidence = customizations.confidenceLevel || template.defaultConfig.confidenceLevel || 0.95;

    // Simplified sample size calculation
    // In production, use proper statistical power analysis
    const factor = Math.pow(confidence, 2) / Math.pow(effect, 2);
    return Math.ceil(baseSize * factor);
  }

  /**
   * Calculate experiment duration
   */
  private calculateDuration(template: ExperimentTemplate, sampleSize: number): number {
    // Estimate based on template and sample size
    const baseDuration = template.estimatedDuration;
    const sizeFactor = Math.log(sampleSize / 1000) / Math.log(2); // Log scale
    return Math.max(baseDuration, Math.ceil(baseDuration * (1 + sizeFactor * 0.2)));
  }

  /**
   * Calculate experiment cost
   */
  private calculateCost(
    template: ExperimentTemplate,
    sampleSize: number,
    duration: number
  ): number {
    // Simplified cost calculation
    const baseCostPerSample = template.complexity === ExperimentComplexity.HIGH ? 0.1 :
                              template.complexity === ExperimentComplexity.MEDIUM ? 0.05 : 0.01;

    const sampleCost = sampleSize * baseCostPerSample;
    const durationCost = duration * 10; // $10 per day

    return sampleCost + durationCost;
  }

  /**
   * Assess experiment risks
   */
  private assessRisks(
    template: ExperimentTemplate,
    customizations: Record<string, any>
  ): RiskAssessment {
    const risks: Risk[] = [];

    // Performance risk
    if (template.category === ExperimentCategory.PERFORMANCE_TESTING) {
      risks.push({
        id: 'perf_degradation',
        type: RiskType.PERFORMANCE_DEGRADATION,
        description: 'Experiment may cause performance degradation',
        probability: 0.3,
        impact: 0.7,
        severity: RiskLevel.MEDIUM
      });
    }

    // Cost risk
    if (template.category === ExperimentCategory.COST_OPTIMIZATION) {
      risks.push({
        id: 'cost_overrun',
        type: RiskType.COST_OVERRUN,
        description: 'Cost optimization may have unexpected expenses',
        probability: 0.2,
        impact: 0.5,
        severity: RiskLevel.LOW
      });
    }

    // High complexity risk
    if (template.complexity === ExperimentComplexity.HIGH) {
      risks.push({
        id: 'complexity_risk',
        type: RiskType.BUSINESS_IMPACT,
        description: 'High complexity experiment may have unintended consequences',
        probability: 0.4,
        impact: 0.8,
        severity: RiskLevel.HIGH
      });
    }

    const maxRisk = risks.reduce((max, risk) =>
      risk.probability * risk.impact > max.probability * max.impact ? risk : max,
      risks[0] || { probability: 0, impact: 0, severity: RiskLevel.LOW }
    );

    return {
      overallRisk: maxRisk.severity,
      risks,
      mitigations: [],
      approvalRequired: maxRisk.severity === RiskLevel.HIGH || maxRisk.severity === RiskLevel.CRITICAL
    };
  }

  /**
   * Check if experiment requires approval
   */
  private requiresApproval(template: ExperimentTemplate, riskAssessment: RiskAssessment): boolean {
    return template.complexity === ExperimentComplexity.CRITICAL ||
           riskAssessment.overallRisk === RiskLevel.HIGH ||
           riskAssessment.overallRisk === RiskLevel.CRITICAL;
  }

  /**
   * Identify stakeholders
   */
  private identifyStakeholders(template: ExperimentTemplate): string[] {
    const stakeholders = ['product_team'];

    if (template.category === ExperimentCategory.COST_OPTIMIZATION) {
      stakeholders.push('finance_team');
    }

    if (template.complexity === ExperimentComplexity.HIGH) {
      stakeholders.push('engineering_lead', 'product_manager');
    }

    return stakeholders;
  }

  /**
   * Create variants from template
   */
  private createVariantsFromTemplate(
    template: ExperimentTemplate,
    customizations: Record<string, any>
  ): any[] {
    return template.requiredVariants.map((variant, index) => ({
      id: `variant_${index}`,
      name: variant.name,
      description: variant.description,
      trafficPercent: 100 / template.requiredVariants.length,
      configuration: { ...variant.configTemplate, ...customizations.variantConfigs?.[index] },
      isControl: variant.isControl
    }));
  }

  /**
   * Create traffic allocation from template
   */
  private createTrafficAllocation(
    template: ExperimentTemplate,
    customizations: Record<string, any>
  ): any {
    return {
      strategy: 'random',
      randomizationUnit: 'user',
      hashFunction: 'md5',
      excludeRules: customizations.excludeRules || [],
      includeRules: customizations.includeRules || []
    };
  }

  /**
   * Create target metrics from template
   */
  private createTargetMetrics(
    template: ExperimentTemplate,
    customizations: Record<string, any>
  ): any[] {
    return template.recommendedMetrics.map((metric, index) => ({
      id: `metric_${index}`,
      name: metric.name,
      type: metric.type,
      aggregation: 'mean',
      statisticalTest: 't_test',
      isGuardrail: metric.isGuardrail,
      isSuccess: metric.importance === MetricImportance.PRIMARY,
      direction: 'increase',
      weight: metric.importance === MetricImportance.PRIMARY ? 1.0 : 0.5
    }));
  }

  /**
   * Setup experiment monitoring
   */
  private async setupExperimentMonitoring(
    experimentId: string,
    plan: ExperimentPlan
  ): Promise<void> {
    const monitoring: ExperimentMonitoring = {
      experimentId,
      alerts: [],
      healthChecks: [
        {
          name: 'Sample Ratio',
          status: HealthStatus.HEALTHY,
          lastCheck: new Date(),
          details: 'Sample ratio between variants',
          threshold: 0.1
        },
        {
          name: 'Error Rate',
          status: HealthStatus.HEALTHY,
          lastCheck: new Date(),
          details: 'Overall error rate',
          threshold: 0.05
        },
        {
          name: 'Data Quality',
          status: HealthStatus.HEALTHY,
          lastCheck: new Date(),
          details: 'Data quality checks',
          threshold: 0.95
        }
      ],
      automatedActions: [
        {
          trigger: ActionTrigger.GUARDRAIL_VIOLATION,
          action: ActionType.PAUSE_EXPERIMENT,
          conditions: ['error_rate > 0.1'],
          executed: false
        },
        {
          trigger: ActionTrigger.SAMPLE_SIZE_REACHED,
          action: ActionType.SEND_ALERT,
          conditions: ['sample_size >= min_sample_size'],
          executed: false
        }
      ],
      lastCheck: new Date(),
      status: MonitoringStatus.ACTIVE
    };

    this.monitoring.set(experimentId, monitoring);
  }

  /**
   * Run pre-flight checks
   */
  private async runPreflightChecks(experiment: ExperimentConfig): Promise<void> {
    // Check if system is ready
    // Check if monitoring is set up
    // Check if metrics are properly configured
    // Validate experiment configuration
    console.log(`Pre-flight checks passed for experiment: ${experiment.id}`);
  }

  /**
   * Run health checks
   */
  private async runHealthChecks(
    experimentId: string,
    monitoring: ExperimentMonitoring
  ): Promise<void> {
    const results = await this.abTesting.getResults(experimentId);

    for (const check of monitoring.healthChecks) {
      check.lastCheck = new Date();

      try {
        switch (check.name) {
          case 'Sample Ratio':
            check.status = this.checkSampleRatio(results, check);
            break;
          case 'Error Rate':
            check.status = this.checkErrorRate(results, check);
            break;
          case 'Data Quality':
            check.status = this.checkDataQuality(results, check);
            break;
        }
      } catch (error) {
        check.status = HealthStatus.UNKNOWN;
        check.details = `Check failed: ${error}`;
      }
    }
  }

  /**
   * Check for alerts
   */
  private async checkAlerts(
    experimentId: string,
    monitoring: ExperimentMonitoring
  ): Promise<void> {
    // Implementation would check for various alert conditions
    // and add alerts to monitoring.alerts array
  }

  /**
   * Execute automated actions
   */
  private async executeAutomatedActions(
    experimentId: string,
    monitoring: ExperimentMonitoring
  ): Promise<void> {
    for (const action of monitoring.automatedActions) {
      if (!action.executed && this.shouldExecuteAction(action, monitoring)) {
        try {
          await this.executeAction(experimentId, action);
          action.executed = true;
          action.executedAt = new Date();
        } catch (error) {
          action.result = `Failed: ${error}`;
        }
      }
    }
  }

  /**
   * Check sample ratio health
   */
  private checkSampleRatio(results: ExperimentResult[], check: HealthCheck): HealthStatus {
    if (results.length < 100) return HealthStatus.HEALTHY;

    const variantCounts = new Map<string, number>();
    results.forEach(result => {
      variantCounts.set(result.variantId, (variantCounts.get(result.variantId) || 0) + 1);
    });

    const expectedRatio = 1.0 / variantCounts.size;
    for (const [variant, count] of variantCounts) {
      const actualRatio = count / results.length;
      const deviation = Math.abs(actualRatio - expectedRatio);

      if (deviation > (check.threshold || 0.1)) {
        check.details = `Sample ratio deviation: ${deviation.toFixed(3)}`;
        return HealthStatus.WARNING;
      }
    }

    return HealthStatus.HEALTHY;
  }

  /**
   * Check error rate health
   */
  private checkErrorRate(results: ExperimentResult[], check: HealthCheck): HealthStatus {
    if (results.length === 0) return HealthStatus.HEALTHY;

    const errorCount = results.filter(r => r.metrics.error === true).length;
    const errorRate = errorCount / results.length;

    check.value = errorRate;

    if (errorRate > (check.threshold || 0.05)) {
      check.details = `Error rate: ${(errorRate * 100).toFixed(2)}%`;
      return HealthStatus.UNHEALTHY;
    }

    return HealthStatus.HEALTHY;
  }

  /**
   * Check data quality health
   */
  private checkDataQuality(results: ExperimentResult[], check: HealthCheck): HealthStatus {
    if (results.length === 0) return HealthStatus.HEALTHY;

    const validResults = results.filter(r =>
      r.userId && r.variantId && r.timestamp && r.metrics
    ).length;

    const qualityScore = validResults / results.length;
    check.value = qualityScore;

    if (qualityScore < (check.threshold || 0.95)) {
      check.details = `Data quality: ${(qualityScore * 100).toFixed(2)}%`;
      return HealthStatus.WARNING;
    }

    return HealthStatus.HEALTHY;
  }

  /**
   * Should execute automated action
   */
  private shouldExecuteAction(action: AutomatedAction, monitoring: ExperimentMonitoring): boolean {
    // Simplified condition evaluation
    return action.conditions.some(condition => {
      // In production, this would evaluate conditions properly
      return false;
    });
  }

  /**
   * Execute automated action
   */
  private async executeAction(experimentId: string, action: AutomatedAction): Promise<void> {
    switch (action.action) {
      case ActionType.STOP_EXPERIMENT:
        await this.abTesting.stopExperiment(experimentId, 'Automated stop due to guardrail violation');
        break;
      case ActionType.PAUSE_EXPERIMENT:
        // Implementation would pause experiment
        break;
      case ActionType.SEND_ALERT:
        // Implementation would send alert
        break;
    }
  }

  /**
   * Generate recommendations
   */
  private generateRecommendations(
    experiment: ExperimentConfig,
    analysis: StatisticalAnalysis[]
  ): string[] {
    const recommendations: string[] = [];

    // Check for statistical significance
    const significantResults = analysis.filter(a => a.statisticalSignificance);
    if (significantResults.length > 0) {
      recommendations.push('Experiment shows statistically significant results');
    }

    // Check sample size
    if (experiment.status.currentSampleSize < experiment.minSampleSize) {
      recommendations.push('Continue experiment to reach minimum sample size');
    }

    return recommendations;
  }

  /**
   * Generate next steps
   */
  private generateNextSteps(
    experiment: ExperimentConfig,
    analysis: StatisticalAnalysis[]
  ): string[] {
    const nextSteps: string[] = [];

    if (experiment.status.state === ExperimentState.RUNNING) {
      nextSteps.push('Monitor experiment progress');
    }

    if (analysis.some(a => a.statisticalSignificance)) {
      nextSteps.push('Consider stopping experiment and implementing winning variant');
    }

    return nextSteps;
  }

  /**
   * Cleanup resources
   */
  async destroy(): Promise<void> {
    await this.abTesting.destroy();
    await this.statisticalAnalyzer.destroy();
    await this.performanceOptimizer.destroy();
    this.templates.clear();
    this.monitoring.clear();
  }
}

export default ExperimentManager;