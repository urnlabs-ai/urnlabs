/**
 * Performance Optimizer
 *
 * Provides automated performance optimization recommendations and monitoring
 * for AI agents and workflows based on A/B testing results and analytics.
 */

export interface PerformanceMetrics {
  agentId?: string;
  workflowId?: string;
  timestamp: Date;
  responseTime: number;
  throughput: number;
  errorRate: number;
  successRate: number;
  resourceUtilization: ResourceUtilization;
  qualityScore: number;
  costPerOperation: number;
  userSatisfaction?: number;
  customMetrics: Record<string, number>;
}

export interface ResourceUtilization {
  cpu: number;          // 0-100%
  memory: number;       // 0-100%
  network: number;      // 0-100%
  storage: number;      // 0-100%
  tokens: number;       // Token usage
  apiCalls: number;     // API call count
}

export interface OptimizationRecommendation {
  id: string;
  category: OptimizationCategory;
  priority: OptimizationPriority;
  title: string;
  description: string;
  expectedImpact: ExpectedImpact;
  implementation: ImplementationGuide;
  riskAssessment: RiskAssessment;
  validationPlan: ValidationPlan;
  estimatedEffort: EffortEstimate;
  metadata: RecommendationMetadata;
}

export interface ExpectedImpact {
  performance: ImpactMetric;
  cost: ImpactMetric;
  quality: ImpactMetric;
  reliability: ImpactMetric;
  scalability: ImpactMetric;
  overall: ImpactLevel;
}

export interface ImpactMetric {
  current: number;
  projected: number;
  improvement: number;
  confidence: number; // 0-1
  unit: string;
}

export interface ImplementationGuide {
  steps: ImplementationStep[];
  prerequisites: string[];
  dependencies: string[];
  rollbackPlan: string;
  testingStrategy: string;
  monitoringPlan: string;
}

export interface ImplementationStep {
  order: number;
  title: string;
  description: string;
  estimatedTime: number; // hours
  risks: string[];
  validation: string;
}

export interface RiskAssessment {
  overallRisk: RiskLevel;
  risks: Risk[];
  mitigations: Mitigation[];
}

export interface Risk {
  type: RiskType;
  description: string;
  probability: number; // 0-1
  impact: ImpactLevel;
  severity: RiskLevel;
}

export interface Mitigation {
  riskType: RiskType;
  strategy: string;
  effectiveness: number; // 0-1
  cost: number;
}

export interface ValidationPlan {
  metrics: ValidationMetric[];
  tests: ValidationTest[];
  successCriteria: SuccessCriteria;
  duration: number; // days
}

export interface ValidationMetric {
  name: string;
  baseline: number;
  target: number;
  threshold: number;
  direction: MetricDirection;
}

export interface ValidationTest {
  type: TestType;
  description: string;
  duration: number; // hours
  sampleSize: number;
  successCriteria: string;
}

export interface SuccessCriteria {
  primary: Criterion[];
  secondary: Criterion[];
  guardrails: Criterion[];
}

export interface Criterion {
  metric: string;
  operator: ComparisonOperator;
  threshold: number;
  weight: number;
}

export interface EffortEstimate {
  development: number;  // hours
  testing: number;      // hours
  deployment: number;   // hours
  monitoring: number;   // hours
  total: number;        // hours
  complexity: ComplexityLevel;
}

export interface RecommendationMetadata {
  source: RecommendationSource;
  confidence: number; // 0-1
  supportingData: string[];
  createdAt: Date;
  lastUpdated: Date;
  version: string;
  tags: string[];
}

export interface PerformanceAlert {
  id: string;
  type: AlertType;
  severity: AlertSeverity;
  title: string;
  description: string;
  metric: string;
  threshold: number;
  currentValue: number;
  trend: TrendDirection;
  duration: number; // minutes
  affectedEntities: string[];
  recommendations: string[];
  timestamp: Date;
  acknowledged: boolean;
  resolved: boolean;
}

export interface PerformanceBaseline {
  entityId: string;
  entityType: EntityType;
  metrics: BaselineMetrics;
  period: TimeRange;
  confidence: number;
  sampleSize: number;
  createdAt: Date;
  lastUpdated: Date;
}

export interface BaselineMetrics {
  responseTime: StatisticalSummary;
  throughput: StatisticalSummary;
  errorRate: StatisticalSummary;
  resourceUtilization: ResourceBaseline;
  qualityScore: StatisticalSummary;
  costPerOperation: StatisticalSummary;
}

export interface StatisticalSummary {
  mean: number;
  median: number;
  p95: number;
  p99: number;
  standardDeviation: number;
  min: number;
  max: number;
}

export interface ResourceBaseline {
  cpu: StatisticalSummary;
  memory: StatisticalSummary;
  network: StatisticalSummary;
  storage: StatisticalSummary;
  tokens: StatisticalSummary;
  apiCalls: StatisticalSummary;
}

export interface TimeRange {
  start: Date;
  end: Date;
  duration: number; // minutes
}

export interface OptimizationResult {
  recommendationId: string;
  implementationDate: Date;
  beforeMetrics: PerformanceMetrics;
  afterMetrics: PerformanceMetrics;
  actualImpact: ExpectedImpact;
  success: boolean;
  lessons: string[];
  nextSteps: string[];
}

export enum OptimizationCategory {
  PERFORMANCE = 'performance',
  COST = 'cost',
  QUALITY = 'quality',
  RELIABILITY = 'reliability',
  SCALABILITY = 'scalability',
  SECURITY = 'security',
  USABILITY = 'usability'
}

export enum OptimizationPriority {
  CRITICAL = 'critical',
  HIGH = 'high',
  MEDIUM = 'medium',
  LOW = 'low'
}

export enum ImpactLevel {
  MINIMAL = 'minimal',
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

export enum RiskLevel {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

export enum RiskType {
  PERFORMANCE_DEGRADATION = 'performance_degradation',
  SYSTEM_INSTABILITY = 'system_instability',
  DATA_LOSS = 'data_loss',
  SECURITY_VULNERABILITY = 'security_vulnerability',
  COST_INCREASE = 'cost_increase',
  USER_IMPACT = 'user_impact',
  TECHNICAL_DEBT = 'technical_debt'
}

export enum MetricDirection {
  INCREASE = 'increase',
  DECREASE = 'decrease',
  MAINTAIN = 'maintain'
}

export enum TestType {
  A_B_TEST = 'a_b_test',
  CANARY = 'canary',
  BLUE_GREEN = 'blue_green',
  SHADOW = 'shadow',
  LOAD_TEST = 'load_test',
  STRESS_TEST = 'stress_test'
}

export enum ComparisonOperator {
  GREATER_THAN = 'gt',
  GREATER_THAN_EQUAL = 'gte',
  LESS_THAN = 'lt',
  LESS_THAN_EQUAL = 'lte',
  EQUAL = 'eq',
  NOT_EQUAL = 'ne'
}

export enum ComplexityLevel {
  TRIVIAL = 'trivial',
  SIMPLE = 'simple',
  MODERATE = 'moderate',
  COMPLEX = 'complex',
  VERY_COMPLEX = 'very_complex'
}

export enum RecommendationSource {
  ML_MODEL = 'ml_model',
  RULE_ENGINE = 'rule_engine',
  MANUAL_ANALYSIS = 'manual_analysis',
  BENCHMARK_COMPARISON = 'benchmark_comparison',
  AB_TEST_RESULT = 'ab_test_result'
}

export enum AlertType {
  PERFORMANCE_DEGRADATION = 'performance_degradation',
  RESOURCE_EXHAUSTION = 'resource_exhaustion',
  ERROR_SPIKE = 'error_spike',
  THROUGHPUT_DROP = 'throughput_drop',
  COST_ANOMALY = 'cost_anomaly',
  QUALITY_DEGRADATION = 'quality_degradation'
}

export enum AlertSeverity {
  INFO = 'info',
  WARNING = 'warning',
  CRITICAL = 'critical',
  EMERGENCY = 'emergency'
}

export enum TrendDirection {
  IMPROVING = 'improving',
  STABLE = 'stable',
  DEGRADING = 'degrading',
  VOLATILE = 'volatile'
}

export enum EntityType {
  AGENT = 'agent',
  WORKFLOW = 'workflow',
  SERVICE = 'service',
  SYSTEM = 'system'
}

export class PerformanceOptimizer {
  private baselines: Map<string, PerformanceBaseline> = new Map();
  private recommendations: Map<string, OptimizationRecommendation> = new Map();
  private alerts: Map<string, PerformanceAlert> = new Map();
  private results: Map<string, OptimizationResult> = new Map();
  private redis?: any;
  private prisma?: any;

  constructor(config?: {
    redis?: any;
    prisma?: any;
  }) {
    this.redis = config?.redis;
    this.prisma = config?.prisma;

    this.initializeOptimizers();
    this.startMonitoring();
  }

  /**
   * Analyze performance and generate optimization recommendations
   */
  async analyzePerformance(
    entityId: string,
    entityType: EntityType,
    metrics: PerformanceMetrics[]
  ): Promise<OptimizationRecommendation[]> {
    if (metrics.length === 0) {
      return [];
    }

    // Establish or update baseline
    await this.updateBaseline(entityId, entityType, metrics);

    // Get baseline for comparison
    const baseline = await this.getBaseline(entityId, entityType);
    if (!baseline) {
      console.warn(`No baseline found for ${entityType} ${entityId}`);
      return [];
    }

    const recommendations: OptimizationRecommendation[] = [];

    // Analyze different aspects of performance
    recommendations.push(...await this.analyzeResponseTime(entityId, entityType, metrics, baseline));
    recommendations.push(...await this.analyzeThroughput(entityId, entityType, metrics, baseline));
    recommendations.push(...await this.analyzeErrorRate(entityId, entityType, metrics, baseline));
    recommendations.push(...await this.analyzeResourceUtilization(entityId, entityType, metrics, baseline));
    recommendations.push(...await this.analyzeCost(entityId, entityType, metrics, baseline));
    recommendations.push(...await this.analyzeQuality(entityId, entityType, metrics, baseline));

    // Priority ranking
    recommendations.sort((a, b) => {
      const priorityOrder = {
        [OptimizationPriority.CRITICAL]: 0,
        [OptimizationPriority.HIGH]: 1,
        [OptimizationPriority.MEDIUM]: 2,
        [OptimizationPriority.LOW]: 3
      };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });

    // Store recommendations
    for (const rec of recommendations) {
      this.recommendations.set(rec.id, rec);
      if (this.redis) {
        await this.redis.setex(
          `optimization:recommendation:${rec.id}`,
          3600 * 24 * 7, // 1 week
          JSON.stringify(rec)
        );
      }
    }

    return recommendations;
  }

  /**
   * Monitor performance in real-time and generate alerts
   */
  async monitorPerformance(
    entityId: string,
    entityType: EntityType,
    currentMetrics: PerformanceMetrics
  ): Promise<PerformanceAlert[]> {
    const baseline = await this.getBaseline(entityId, entityType);
    if (!baseline) {
      return [];
    }

    const alerts: PerformanceAlert[] = [];

    // Check for performance degradation
    alerts.push(...this.checkResponseTimeAlerts(entityId, currentMetrics, baseline));
    alerts.push(...this.checkThroughputAlerts(entityId, currentMetrics, baseline));
    alerts.push(...this.checkErrorRateAlerts(entityId, currentMetrics, baseline));
    alerts.push(...this.checkResourceAlerts(entityId, currentMetrics, baseline));
    alerts.push(...this.checkCostAlerts(entityId, currentMetrics, baseline));
    alerts.push(...this.checkQualityAlerts(entityId, currentMetrics, baseline));

    // Store alerts
    for (const alert of alerts) {
      this.alerts.set(alert.id, alert);
      if (this.redis) {
        await this.redis.setex(
          `optimization:alert:${alert.id}`,
          3600 * 24, // 24 hours
          JSON.stringify(alert)
        );
      }
    }

    return alerts;
  }

  /**
   * Implement optimization recommendation
   */
  async implementOptimization(
    recommendationId: string,
    implementationPlan?: Partial<ImplementationGuide>
  ): Promise<string> {
    const recommendation = await this.getRecommendation(recommendationId);
    if (!recommendation) {
      throw new Error(`Recommendation ${recommendationId} not found`);
    }

    // Create implementation task
    const implementationId = `impl_${Date.now()}`;

    // Merge with custom implementation plan
    const finalPlan = {
      ...recommendation.implementation,
      ...implementationPlan
    };

    // Log implementation start
    console.log(`Starting implementation of recommendation: ${recommendation.title}`);

    // In a real implementation, this would:
    // 1. Create implementation tracking record
    // 2. Execute implementation steps
    // 3. Monitor progress
    // 4. Validate results

    return implementationId;
  }

  /**
   * Track optimization results
   */
  async trackOptimizationResult(
    recommendationId: string,
    beforeMetrics: PerformanceMetrics,
    afterMetrics: PerformanceMetrics
  ): Promise<OptimizationResult> {
    const recommendation = await this.getRecommendation(recommendationId);
    if (!recommendation) {
      throw new Error(`Recommendation ${recommendationId} not found`);
    }

    // Calculate actual impact
    const actualImpact = this.calculateActualImpact(beforeMetrics, afterMetrics);

    // Compare with expected impact
    const success = this.evaluateSuccess(recommendation.expectedImpact, actualImpact);

    const result: OptimizationResult = {
      recommendationId,
      implementationDate: new Date(),
      beforeMetrics,
      afterMetrics,
      actualImpact,
      success,
      lessons: this.generateLessons(recommendation, actualImpact, success),
      nextSteps: this.generateNextSteps(recommendation, actualImpact, success)
    };

    this.results.set(recommendationId, result);

    // Store result
    if (this.redis) {
      await this.redis.setex(
        `optimization:result:${recommendationId}`,
        3600 * 24 * 30, // 30 days
        JSON.stringify(result)
      );
    }

    return result;
  }

  /**
   * Get optimization recommendations for entity
   */
  async getRecommendations(
    entityId: string,
    entityType?: EntityType,
    category?: OptimizationCategory
  ): Promise<OptimizationRecommendation[]> {
    let recommendations = Array.from(this.recommendations.values());

    // Apply filters
    if (entityType) {
      recommendations = recommendations.filter(r =>
        r.metadata.tags.includes(entityType)
      );
    }

    if (category) {
      recommendations = recommendations.filter(r => r.category === category);
    }

    // Load from Redis if needed
    if (this.redis && recommendations.length === 0) {
      const keys = await this.redis.keys('optimization:recommendation:*');
      for (const key of keys) {
        const data = await this.redis.get(key);
        if (data) {
          const rec = JSON.parse(data);
          recommendations.push(rec);
        }
      }
    }

    return recommendations.sort((a, b) => {
      const priorityOrder = {
        [OptimizationPriority.CRITICAL]: 0,
        [OptimizationPriority.HIGH]: 1,
        [OptimizationPriority.MEDIUM]: 2,
        [OptimizationPriority.LOW]: 3
      };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });
  }

  /**
   * Get active alerts
   */
  async getActiveAlerts(entityId?: string): Promise<PerformanceAlert[]> {
    let alerts = Array.from(this.alerts.values())
      .filter(alert => !alert.resolved);

    if (entityId) {
      alerts = alerts.filter(alert =>
        alert.affectedEntities.includes(entityId)
      );
    }

    return alerts.sort((a, b) => {
      const severityOrder = {
        [AlertSeverity.EMERGENCY]: 0,
        [AlertSeverity.CRITICAL]: 1,
        [AlertSeverity.WARNING]: 2,
        [AlertSeverity.INFO]: 3
      };
      return severityOrder[a.severity] - severityOrder[b.severity];
    });
  }

  /**
   * Get performance baseline
   */
  async getBaseline(entityId: string, entityType: EntityType): Promise<PerformanceBaseline | null> {
    const key = `${entityType}:${entityId}`;
    let baseline = this.baselines.get(key);

    if (!baseline && this.redis) {
      const cached = await this.redis.get(`optimization:baseline:${key}`);
      if (cached) {
        baseline = JSON.parse(cached);
        this.baselines.set(key, baseline!);
      }
    }

    return baseline || null;
  }

  /**
   * Update performance baseline
   */
  private async updateBaseline(
    entityId: string,
    entityType: EntityType,
    metrics: PerformanceMetrics[]
  ): Promise<void> {
    const key = `${entityType}:${entityId}`;
    const existingBaseline = this.baselines.get(key);

    const timeRange = {
      start: new Date(Math.min(...metrics.map(m => m.timestamp.getTime()))),
      end: new Date(Math.max(...metrics.map(m => m.timestamp.getTime()))),
      duration: 0
    };
    timeRange.duration = (timeRange.end.getTime() - timeRange.start.getTime()) / 60000; // minutes

    const baselineMetrics = this.calculateBaselineMetrics(metrics);

    const baseline: PerformanceBaseline = {
      entityId,
      entityType,
      metrics: baselineMetrics,
      period: timeRange,
      confidence: this.calculateConfidence(metrics.length),
      sampleSize: metrics.length,
      createdAt: existingBaseline?.createdAt || new Date(),
      lastUpdated: new Date()
    };

    this.baselines.set(key, baseline);

    if (this.redis) {
      await this.redis.setex(
        `optimization:baseline:${key}`,
        3600 * 24 * 30, // 30 days
        JSON.stringify(baseline)
      );
    }
  }

  /**
   * Calculate baseline metrics from performance data
   */
  private calculateBaselineMetrics(metrics: PerformanceMetrics[]): BaselineMetrics {
    const responseTime = metrics.map(m => m.responseTime);
    const throughput = metrics.map(m => m.throughput);
    const errorRate = metrics.map(m => m.errorRate);
    const qualityScore = metrics.map(m => m.qualityScore);
    const costPerOperation = metrics.map(m => m.costPerOperation);

    const cpu = metrics.map(m => m.resourceUtilization.cpu);
    const memory = metrics.map(m => m.resourceUtilization.memory);
    const network = metrics.map(m => m.resourceUtilization.network);
    const storage = metrics.map(m => m.resourceUtilization.storage);
    const tokens = metrics.map(m => m.resourceUtilization.tokens);
    const apiCalls = metrics.map(m => m.resourceUtilization.apiCalls);

    return {
      responseTime: this.calculateStatisticalSummary(responseTime),
      throughput: this.calculateStatisticalSummary(throughput),
      errorRate: this.calculateStatisticalSummary(errorRate),
      resourceUtilization: {
        cpu: this.calculateStatisticalSummary(cpu),
        memory: this.calculateStatisticalSummary(memory),
        network: this.calculateStatisticalSummary(network),
        storage: this.calculateStatisticalSummary(storage),
        tokens: this.calculateStatisticalSummary(tokens),
        apiCalls: this.calculateStatisticalSummary(apiCalls)
      },
      qualityScore: this.calculateStatisticalSummary(qualityScore),
      costPerOperation: this.calculateStatisticalSummary(costPerOperation)
    };
  }

  /**
   * Calculate statistical summary
   */
  private calculateStatisticalSummary(values: number[]): StatisticalSummary {
    if (values.length === 0) {
      return {
        mean: 0,
        median: 0,
        p95: 0,
        p99: 0,
        standardDeviation: 0,
        min: 0,
        max: 0
      };
    }

    const sorted = [...values].sort((a, b) => a - b);
    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;

    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
    const standardDeviation = Math.sqrt(variance);

    const getPercentile = (p: number) => {
      const index = (p / 100) * (sorted.length - 1);
      const lower = Math.floor(index);
      const upper = Math.ceil(index);
      const weight = index - lower;

      if (upper >= sorted.length) return sorted[sorted.length - 1];
      return sorted[lower] * (1 - weight) + sorted[upper] * weight;
    };

    return {
      mean,
      median: getPercentile(50),
      p95: getPercentile(95),
      p99: getPercentile(99),
      standardDeviation,
      min: sorted[0],
      max: sorted[sorted.length - 1]
    };
  }

  /**
   * Calculate confidence based on sample size
   */
  private calculateConfidence(sampleSize: number): number {
    if (sampleSize < 10) return 0.1;
    if (sampleSize < 100) return 0.5;
    if (sampleSize < 1000) return 0.8;
    return 0.95;
  }

  /**
   * Analyze response time performance
   */
  private async analyzeResponseTime(
    entityId: string,
    entityType: EntityType,
    metrics: PerformanceMetrics[],
    baseline: PerformanceBaseline
  ): Promise<OptimizationRecommendation[]> {
    const recommendations: OptimizationRecommendation[] = [];
    const currentMean = metrics.reduce((sum, m) => sum + m.responseTime, 0) / metrics.length;
    const baselineMean = baseline.metrics.responseTime.mean;

    // Check if response time has degraded
    if (currentMean > baselineMean * 1.2) { // 20% degradation
      recommendations.push({
        id: `opt_response_time_${Date.now()}`,
        category: OptimizationCategory.PERFORMANCE,
        priority: OptimizationPriority.HIGH,
        title: 'Optimize Response Time',
        description: 'Response time has increased significantly compared to baseline',
        expectedImpact: {
          performance: {
            current: currentMean,
            projected: baselineMean,
            improvement: (currentMean - baselineMean) / currentMean,
            confidence: 0.8,
            unit: 'ms'
          },
          cost: {
            current: 100,
            projected: 95,
            improvement: 0.05,
            confidence: 0.6,
            unit: 'USD'
          },
          quality: {
            current: 80,
            projected: 85,
            improvement: 0.0625,
            confidence: 0.7,
            unit: 'score'
          },
          reliability: {
            current: 95,
            projected: 98,
            improvement: 0.0316,
            confidence: 0.8,
            unit: '%'
          },
          scalability: {
            current: 70,
            projected: 75,
            improvement: 0.0714,
            confidence: 0.6,
            unit: 'score'
          },
          overall: ImpactLevel.HIGH
        },
        implementation: {
          steps: [
            {
              order: 1,
              title: 'Analyze bottlenecks',
              description: 'Identify performance bottlenecks in the system',
              estimatedTime: 4,
              risks: ['May require system analysis'],
              validation: 'Review performance profiling results'
            },
            {
              order: 2,
              title: 'Optimize critical paths',
              description: 'Optimize the most critical performance paths',
              estimatedTime: 8,
              risks: ['Code changes may introduce bugs'],
              validation: 'Run performance tests'
            }
          ],
          prerequisites: ['Performance monitoring setup'],
          dependencies: ['Profiling tools'],
          rollbackPlan: 'Revert to previous configuration',
          testingStrategy: 'A/B test with gradual rollout',
          monitoringPlan: 'Monitor response time metrics continuously'
        },
        riskAssessment: {
          overallRisk: RiskLevel.MEDIUM,
          risks: [
            {
              type: RiskType.PERFORMANCE_DEGRADATION,
              description: 'Optimization may cause unexpected side effects',
              probability: 0.2,
              impact: ImpactLevel.MEDIUM,
              severity: RiskLevel.MEDIUM
            }
          ],
          mitigations: [
            {
              riskType: RiskType.PERFORMANCE_DEGRADATION,
              strategy: 'Gradual rollout with monitoring',
              effectiveness: 0.8,
              cost: 100
            }
          ]
        },
        validationPlan: {
          metrics: [
            {
              name: 'response_time',
              baseline: baselineMean,
              target: baselineMean * 0.9,
              threshold: baselineMean * 1.1,
              direction: MetricDirection.DECREASE
            }
          ],
          tests: [
            {
              type: TestType.A_B_TEST,
              description: 'Compare optimized vs baseline configuration',
              duration: 24,
              sampleSize: 1000,
              successCriteria: 'Response time improvement > 10%'
            }
          ],
          successCriteria: {
            primary: [
              {
                metric: 'response_time',
                operator: ComparisonOperator.LESS_THAN,
                threshold: baselineMean * 0.9,
                weight: 1.0
              }
            ],
            secondary: [],
            guardrails: [
              {
                metric: 'error_rate',
                operator: ComparisonOperator.LESS_THAN,
                threshold: baseline.metrics.errorRate.p95,
                weight: 1.0
              }
            ]
          },
          duration: 7
        },
        estimatedEffort: {
          development: 12,
          testing: 8,
          deployment: 4,
          monitoring: 2,
          total: 26,
          complexity: ComplexityLevel.MODERATE
        },
        metadata: {
          source: RecommendationSource.RULE_ENGINE,
          confidence: 0.8,
          supportingData: [`Current: ${currentMean}ms`, `Baseline: ${baselineMean}ms`],
          createdAt: new Date(),
          lastUpdated: new Date(),
          version: '1.0',
          tags: [entityType, 'response_time', 'performance']
        }
      });
    }

    return recommendations;
  }

  /**
   * Analyze throughput performance
   */
  private async analyzeThroughput(
    entityId: string,
    entityType: EntityType,
    metrics: PerformanceMetrics[],
    baseline: PerformanceBaseline
  ): Promise<OptimizationRecommendation[]> {
    const recommendations: OptimizationRecommendation[] = [];
    const currentMean = metrics.reduce((sum, m) => sum + m.throughput, 0) / metrics.length;
    const baselineMean = baseline.metrics.throughput.mean;

    // Check if throughput has decreased
    if (currentMean < baselineMean * 0.8) { // 20% decrease
      recommendations.push(this.createThroughputOptimizationRecommendation(
        entityId,
        entityType,
        currentMean,
        baselineMean
      ));
    }

    return recommendations;
  }

  /**
   * Analyze error rate
   */
  private async analyzeErrorRate(
    entityId: string,
    entityType: EntityType,
    metrics: PerformanceMetrics[],
    baseline: PerformanceBaseline
  ): Promise<OptimizationRecommendation[]> {
    const recommendations: OptimizationRecommendation[] = [];
    const currentMean = metrics.reduce((sum, m) => sum + m.errorRate, 0) / metrics.length;
    const baselineMean = baseline.metrics.errorRate.mean;

    // Check if error rate has increased
    if (currentMean > baselineMean * 1.5) { // 50% increase
      recommendations.push(this.createErrorRateOptimizationRecommendation(
        entityId,
        entityType,
        currentMean,
        baselineMean
      ));
    }

    return recommendations;
  }

  /**
   * Analyze resource utilization
   */
  private async analyzeResourceUtilization(
    entityId: string,
    entityType: EntityType,
    metrics: PerformanceMetrics[],
    baseline: PerformanceBaseline
  ): Promise<OptimizationRecommendation[]> {
    const recommendations: OptimizationRecommendation[] = [];

    // Check CPU utilization
    const currentCpu = metrics.reduce((sum, m) => sum + m.resourceUtilization.cpu, 0) / metrics.length;
    if (currentCpu > 80) { // High CPU usage
      recommendations.push(this.createResourceOptimizationRecommendation(
        entityId,
        entityType,
        'cpu',
        currentCpu,
        baseline.metrics.resourceUtilization.cpu.mean
      ));
    }

    // Check memory utilization
    const currentMemory = metrics.reduce((sum, m) => sum + m.resourceUtilization.memory, 0) / metrics.length;
    if (currentMemory > 85) { // High memory usage
      recommendations.push(this.createResourceOptimizationRecommendation(
        entityId,
        entityType,
        'memory',
        currentMemory,
        baseline.metrics.resourceUtilization.memory.mean
      ));
    }

    return recommendations;
  }

  /**
   * Analyze cost performance
   */
  private async analyzeCost(
    entityId: string,
    entityType: EntityType,
    metrics: PerformanceMetrics[],
    baseline: PerformanceBaseline
  ): Promise<OptimizationRecommendation[]> {
    const recommendations: OptimizationRecommendation[] = [];
    const currentMean = metrics.reduce((sum, m) => sum + m.costPerOperation, 0) / metrics.length;
    const baselineMean = baseline.metrics.costPerOperation.mean;

    // Check if cost has increased
    if (currentMean > baselineMean * 1.3) { // 30% increase
      recommendations.push(this.createCostOptimizationRecommendation(
        entityId,
        entityType,
        currentMean,
        baselineMean
      ));
    }

    return recommendations;
  }

  /**
   * Analyze quality metrics
   */
  private async analyzeQuality(
    entityId: string,
    entityType: EntityType,
    metrics: PerformanceMetrics[],
    baseline: PerformanceBaseline
  ): Promise<OptimizationRecommendation[]> {
    const recommendations: OptimizationRecommendation[] = [];
    const currentMean = metrics.reduce((sum, m) => sum + m.qualityScore, 0) / metrics.length;
    const baselineMean = baseline.metrics.qualityScore.mean;

    // Check if quality has decreased
    if (currentMean < baselineMean * 0.9) { // 10% decrease
      recommendations.push(this.createQualityOptimizationRecommendation(
        entityId,
        entityType,
        currentMean,
        baselineMean
      ));
    }

    return recommendations;
  }

  /**
   * Helper methods for creating specific optimization recommendations
   */
  private createThroughputOptimizationRecommendation(
    entityId: string,
    entityType: EntityType,
    current: number,
    baseline: number
  ): OptimizationRecommendation {
    return {
      id: `opt_throughput_${Date.now()}`,
      category: OptimizationCategory.PERFORMANCE,
      priority: OptimizationPriority.HIGH,
      title: 'Improve Throughput',
      description: 'System throughput has decreased below acceptable levels',
      expectedImpact: this.createExpectedImpact(current, baseline, 'operations/second'),
      implementation: this.createImplementationGuide('throughput'),
      riskAssessment: this.createRiskAssessment(RiskLevel.MEDIUM),
      validationPlan: this.createValidationPlan('throughput', current, baseline),
      estimatedEffort: this.createEffortEstimate(ComplexityLevel.MODERATE),
      metadata: this.createMetadata(RecommendationSource.RULE_ENGINE, entityType, ['throughput'])
    };
  }

  private createErrorRateOptimizationRecommendation(
    entityId: string,
    entityType: EntityType,
    current: number,
    baseline: number
  ): OptimizationRecommendation {
    return {
      id: `opt_error_rate_${Date.now()}`,
      category: OptimizationCategory.RELIABILITY,
      priority: OptimizationPriority.CRITICAL,
      title: 'Reduce Error Rate',
      description: 'Error rate has increased significantly',
      expectedImpact: this.createExpectedImpact(current, baseline, 'percentage'),
      implementation: this.createImplementationGuide('error_rate'),
      riskAssessment: this.createRiskAssessment(RiskLevel.LOW),
      validationPlan: this.createValidationPlan('error_rate', current, baseline),
      estimatedEffort: this.createEffortEstimate(ComplexityLevel.SIMPLE),
      metadata: this.createMetadata(RecommendationSource.RULE_ENGINE, entityType, ['error_rate'])
    };
  }

  private createResourceOptimizationRecommendation(
    entityId: string,
    entityType: EntityType,
    resource: string,
    current: number,
    baseline: number
  ): OptimizationRecommendation {
    return {
      id: `opt_${resource}_${Date.now()}`,
      category: OptimizationCategory.SCALABILITY,
      priority: OptimizationPriority.MEDIUM,
      title: `Optimize ${resource.toUpperCase()} Usage`,
      description: `${resource.toUpperCase()} utilization is too high`,
      expectedImpact: this.createExpectedImpact(current, baseline, 'percentage'),
      implementation: this.createImplementationGuide(resource),
      riskAssessment: this.createRiskAssessment(RiskLevel.MEDIUM),
      validationPlan: this.createValidationPlan(resource, current, baseline),
      estimatedEffort: this.createEffortEstimate(ComplexityLevel.MODERATE),
      metadata: this.createMetadata(RecommendationSource.RULE_ENGINE, entityType, [resource])
    };
  }

  private createCostOptimizationRecommendation(
    entityId: string,
    entityType: EntityType,
    current: number,
    baseline: number
  ): OptimizationRecommendation {
    return {
      id: `opt_cost_${Date.now()}`,
      category: OptimizationCategory.COST,
      priority: OptimizationPriority.HIGH,
      title: 'Reduce Operational Costs',
      description: 'Cost per operation has increased above target',
      expectedImpact: this.createExpectedImpact(current, baseline, 'USD'),
      implementation: this.createImplementationGuide('cost'),
      riskAssessment: this.createRiskAssessment(RiskLevel.LOW),
      validationPlan: this.createValidationPlan('cost', current, baseline),
      estimatedEffort: this.createEffortEstimate(ComplexityLevel.COMPLEX),
      metadata: this.createMetadata(RecommendationSource.RULE_ENGINE, entityType, ['cost'])
    };
  }

  private createQualityOptimizationRecommendation(
    entityId: string,
    entityType: EntityType,
    current: number,
    baseline: number
  ): OptimizationRecommendation {
    return {
      id: `opt_quality_${Date.now()}`,
      category: OptimizationCategory.QUALITY,
      priority: OptimizationPriority.HIGH,
      title: 'Improve Output Quality',
      description: 'Quality score has decreased below acceptable levels',
      expectedImpact: this.createExpectedImpact(current, baseline, 'score'),
      implementation: this.createImplementationGuide('quality'),
      riskAssessment: this.createRiskAssessment(RiskLevel.MEDIUM),
      validationPlan: this.createValidationPlan('quality', current, baseline),
      estimatedEffort: this.createEffortEstimate(ComplexityLevel.COMPLEX),
      metadata: this.createMetadata(RecommendationSource.RULE_ENGINE, entityType, ['quality'])
    };
  }

  /**
   * Helper methods for creating recommendation components
   */
  private createExpectedImpact(current: number, target: number, unit: string): ExpectedImpact {
    const improvement = Math.abs(target - current) / current;

    return {
      performance: {
        current,
        projected: target,
        improvement,
        confidence: 0.8,
        unit
      },
      cost: {
        current: 100,
        projected: 95,
        improvement: 0.05,
        confidence: 0.6,
        unit: 'USD'
      },
      quality: {
        current: 80,
        projected: 85,
        improvement: 0.0625,
        confidence: 0.7,
        unit: 'score'
      },
      reliability: {
        current: 95,
        projected: 98,
        improvement: 0.0316,
        confidence: 0.8,
        unit: '%'
      },
      scalability: {
        current: 70,
        projected: 75,
        improvement: 0.0714,
        confidence: 0.6,
        unit: 'score'
      },
      overall: improvement > 0.2 ? ImpactLevel.HIGH :
               improvement > 0.1 ? ImpactLevel.MEDIUM : ImpactLevel.LOW
    };
  }

  private createImplementationGuide(metric: string): ImplementationGuide {
    return {
      steps: [
        {
          order: 1,
          title: `Analyze ${metric} issues`,
          description: `Identify root causes of ${metric} problems`,
          estimatedTime: 4,
          risks: ['Analysis may require system access'],
          validation: 'Review analysis results'
        },
        {
          order: 2,
          title: `Implement ${metric} optimization`,
          description: `Apply optimization techniques for ${metric}`,
          estimatedTime: 8,
          risks: ['Changes may affect other metrics'],
          validation: 'Monitor target metric improvements'
        }
      ],
      prerequisites: ['Monitoring setup', 'Analysis tools'],
      dependencies: ['Performance data'],
      rollbackPlan: 'Revert to previous configuration',
      testingStrategy: 'A/B test with gradual rollout',
      monitoringPlan: `Monitor ${metric} continuously`
    };
  }

  private createRiskAssessment(level: RiskLevel): RiskAssessment {
    return {
      overallRisk: level,
      risks: [
        {
          type: RiskType.PERFORMANCE_DEGRADATION,
          description: 'Optimization may cause unintended side effects',
          probability: 0.2,
          impact: ImpactLevel.MEDIUM,
          severity: level
        }
      ],
      mitigations: [
        {
          riskType: RiskType.PERFORMANCE_DEGRADATION,
          strategy: 'Gradual rollout with monitoring',
          effectiveness: 0.8,
          cost: 100
        }
      ]
    };
  }

  private createValidationPlan(metric: string, current: number, target: number): ValidationPlan {
    return {
      metrics: [
        {
          name: metric,
          baseline: current,
          target,
          threshold: current * 1.1,
          direction: target < current ? MetricDirection.DECREASE : MetricDirection.INCREASE
        }
      ],
      tests: [
        {
          type: TestType.A_B_TEST,
          description: `Compare optimized vs baseline ${metric}`,
          duration: 24,
          sampleSize: 1000,
          successCriteria: `${metric} improvement measurable`
        }
      ],
      successCriteria: {
        primary: [
          {
            metric,
            operator: target < current ? ComparisonOperator.LESS_THAN : ComparisonOperator.GREATER_THAN,
            threshold: target,
            weight: 1.0
          }
        ],
        secondary: [],
        guardrails: []
      },
      duration: 7
    };
  }

  private createEffortEstimate(complexity: ComplexityLevel): EffortEstimate {
    const multiplier = {
      [ComplexityLevel.TRIVIAL]: 0.5,
      [ComplexityLevel.SIMPLE]: 1,
      [ComplexityLevel.MODERATE]: 2,
      [ComplexityLevel.COMPLEX]: 4,
      [ComplexityLevel.VERY_COMPLEX]: 8
    }[complexity];

    const base = {
      development: 8 * multiplier,
      testing: 4 * multiplier,
      deployment: 2 * multiplier,
      monitoring: 1 * multiplier
    };

    return {
      ...base,
      total: base.development + base.testing + base.deployment + base.monitoring,
      complexity
    };
  }

  private createMetadata(
    source: RecommendationSource,
    entityType: EntityType,
    tags: string[]
  ): RecommendationMetadata {
    return {
      source,
      confidence: 0.8,
      supportingData: [],
      createdAt: new Date(),
      lastUpdated: new Date(),
      version: '1.0',
      tags: [entityType, ...tags]
    };
  }

  /**
   * Alert checking methods
   */
  private checkResponseTimeAlerts(
    entityId: string,
    current: PerformanceMetrics,
    baseline: PerformanceBaseline
  ): PerformanceAlert[] {
    const alerts: PerformanceAlert[] = [];

    if (current.responseTime > baseline.metrics.responseTime.p95 * 1.5) {
      alerts.push({
        id: `alert_response_time_${Date.now()}`,
        type: AlertType.PERFORMANCE_DEGRADATION,
        severity: AlertSeverity.CRITICAL,
        title: 'Response Time Alert',
        description: 'Response time significantly above baseline',
        metric: 'response_time',
        threshold: baseline.metrics.responseTime.p95,
        currentValue: current.responseTime,
        trend: TrendDirection.DEGRADING,
        duration: 5, // minutes
        affectedEntities: [entityId],
        recommendations: ['Check for system bottlenecks', 'Review recent changes'],
        timestamp: new Date(),
        acknowledged: false,
        resolved: false
      });
    }

    return alerts;
  }

  private checkThroughputAlerts(
    entityId: string,
    current: PerformanceMetrics,
    baseline: PerformanceBaseline
  ): PerformanceAlert[] {
    const alerts: PerformanceAlert[] = [];

    if (current.throughput < baseline.metrics.throughput.mean * 0.7) {
      alerts.push({
        id: `alert_throughput_${Date.now()}`,
        type: AlertType.THROUGHPUT_DROP,
        severity: AlertSeverity.WARNING,
        title: 'Throughput Drop Alert',
        description: 'Throughput has dropped significantly',
        metric: 'throughput',
        threshold: baseline.metrics.throughput.mean,
        currentValue: current.throughput,
        trend: TrendDirection.DEGRADING,
        duration: 10,
        affectedEntities: [entityId],
        recommendations: ['Check system capacity', 'Review load patterns'],
        timestamp: new Date(),
        acknowledged: false,
        resolved: false
      });
    }

    return alerts;
  }

  private checkErrorRateAlerts(
    entityId: string,
    current: PerformanceMetrics,
    baseline: PerformanceBaseline
  ): PerformanceAlert[] {
    const alerts: PerformanceAlert[] = [];

    if (current.errorRate > baseline.metrics.errorRate.p95 * 2) {
      alerts.push({
        id: `alert_error_rate_${Date.now()}`,
        type: AlertType.ERROR_SPIKE,
        severity: AlertSeverity.EMERGENCY,
        title: 'Error Rate Spike',
        description: 'Error rate has spiked significantly',
        metric: 'error_rate',
        threshold: baseline.metrics.errorRate.p95,
        currentValue: current.errorRate,
        trend: TrendDirection.DEGRADING,
        duration: 2,
        affectedEntities: [entityId],
        recommendations: ['Investigate error causes immediately', 'Consider rollback'],
        timestamp: new Date(),
        acknowledged: false,
        resolved: false
      });
    }

    return alerts;
  }

  private checkResourceAlerts(
    entityId: string,
    current: PerformanceMetrics,
    baseline: PerformanceBaseline
  ): PerformanceAlert[] {
    const alerts: PerformanceAlert[] = [];

    // CPU alert
    if (current.resourceUtilization.cpu > 90) {
      alerts.push({
        id: `alert_cpu_${Date.now()}`,
        type: AlertType.RESOURCE_EXHAUSTION,
        severity: AlertSeverity.CRITICAL,
        title: 'High CPU Usage',
        description: 'CPU utilization is critically high',
        metric: 'cpu_utilization',
        threshold: 80,
        currentValue: current.resourceUtilization.cpu,
        trend: TrendDirection.DEGRADING,
        duration: 5,
        affectedEntities: [entityId],
        recommendations: ['Scale resources', 'Optimize CPU-intensive operations'],
        timestamp: new Date(),
        acknowledged: false,
        resolved: false
      });
    }

    // Memory alert
    if (current.resourceUtilization.memory > 95) {
      alerts.push({
        id: `alert_memory_${Date.now()}`,
        type: AlertType.RESOURCE_EXHAUSTION,
        severity: AlertSeverity.EMERGENCY,
        title: 'Memory Exhaustion',
        description: 'Memory utilization is at critical levels',
        metric: 'memory_utilization',
        threshold: 85,
        currentValue: current.resourceUtilization.memory,
        trend: TrendDirection.DEGRADING,
        duration: 2,
        affectedEntities: [entityId],
        recommendations: ['Immediate memory cleanup', 'Scale memory resources'],
        timestamp: new Date(),
        acknowledged: false,
        resolved: false
      });
    }

    return alerts;
  }

  private checkCostAlerts(
    entityId: string,
    current: PerformanceMetrics,
    baseline: PerformanceBaseline
  ): PerformanceAlert[] {
    const alerts: PerformanceAlert[] = [];

    if (current.costPerOperation > baseline.metrics.costPerOperation.p95 * 2) {
      alerts.push({
        id: `alert_cost_${Date.now()}`,
        type: AlertType.COST_ANOMALY,
        severity: AlertSeverity.WARNING,
        title: 'Cost Anomaly Detected',
        description: 'Cost per operation has increased significantly',
        metric: 'cost_per_operation',
        threshold: baseline.metrics.costPerOperation.p95,
        currentValue: current.costPerOperation,
        trend: TrendDirection.DEGRADING,
        duration: 15,
        affectedEntities: [entityId],
        recommendations: ['Review resource usage', 'Check for cost optimization opportunities'],
        timestamp: new Date(),
        acknowledged: false,
        resolved: false
      });
    }

    return alerts;
  }

  private checkQualityAlerts(
    entityId: string,
    current: PerformanceMetrics,
    baseline: PerformanceBaseline
  ): PerformanceAlert[] {
    const alerts: PerformanceAlert[] = [];

    if (current.qualityScore < baseline.metrics.qualityScore.mean * 0.8) {
      alerts.push({
        id: `alert_quality_${Date.now()}`,
        type: AlertType.QUALITY_DEGRADATION,
        severity: AlertSeverity.WARNING,
        title: 'Quality Degradation',
        description: 'Output quality has decreased significantly',
        metric: 'quality_score',
        threshold: baseline.metrics.qualityScore.mean,
        currentValue: current.qualityScore,
        trend: TrendDirection.DEGRADING,
        duration: 20,
        affectedEntities: [entityId],
        recommendations: ['Review quality control processes', 'Investigate quality factors'],
        timestamp: new Date(),
        acknowledged: false,
        resolved: false
      });
    }

    return alerts;
  }

  /**
   * Calculate actual impact from before/after metrics
   */
  private calculateActualImpact(
    before: PerformanceMetrics,
    after: PerformanceMetrics
  ): ExpectedImpact {
    return {
      performance: {
        current: before.responseTime,
        projected: after.responseTime,
        improvement: (before.responseTime - after.responseTime) / before.responseTime,
        confidence: 1.0,
        unit: 'ms'
      },
      cost: {
        current: before.costPerOperation,
        projected: after.costPerOperation,
        improvement: (before.costPerOperation - after.costPerOperation) / before.costPerOperation,
        confidence: 1.0,
        unit: 'USD'
      },
      quality: {
        current: before.qualityScore,
        projected: after.qualityScore,
        improvement: (after.qualityScore - before.qualityScore) / before.qualityScore,
        confidence: 1.0,
        unit: 'score'
      },
      reliability: {
        current: before.successRate,
        projected: after.successRate,
        improvement: (after.successRate - before.successRate) / before.successRate,
        confidence: 1.0,
        unit: '%'
      },
      scalability: {
        current: before.throughput,
        projected: after.throughput,
        improvement: (after.throughput - before.throughput) / before.throughput,
        confidence: 1.0,
        unit: 'ops/sec'
      },
      overall: ImpactLevel.MEDIUM // Simplified calculation
    };
  }

  /**
   * Evaluate optimization success
   */
  private evaluateSuccess(expected: ExpectedImpact, actual: ExpectedImpact): boolean {
    // Simple success criteria: actual improvement >= 50% of expected
    const performanceSuccess = actual.performance.improvement >= expected.performance.improvement * 0.5;
    const costSuccess = actual.cost.improvement >= expected.cost.improvement * 0.5;
    const qualitySuccess = actual.quality.improvement >= expected.quality.improvement * 0.5;

    return performanceSuccess || costSuccess || qualitySuccess;
  }

  /**
   * Generate lessons learned
   */
  private generateLessons(
    recommendation: OptimizationRecommendation,
    actualImpact: ExpectedImpact,
    success: boolean
  ): string[] {
    const lessons: string[] = [];

    if (success) {
      lessons.push('Optimization was successful and met expectations');
      lessons.push('Implementation plan was effective');
    } else {
      lessons.push('Optimization did not meet expected results');
      lessons.push('Implementation approach needs refinement');
    }

    if (actualImpact.performance.improvement < 0) {
      lessons.push('Performance was negatively impacted - investigate root cause');
    }

    return lessons;
  }

  /**
   * Generate next steps
   */
  private generateNextSteps(
    recommendation: OptimizationRecommendation,
    actualImpact: ExpectedImpact,
    success: boolean
  ): string[] {
    const nextSteps: string[] = [];

    if (success) {
      nextSteps.push('Monitor optimization results long-term');
      nextSteps.push('Consider applying similar optimizations to other entities');
    } else {
      nextSteps.push('Analyze why optimization failed');
      nextSteps.push('Consider alternative optimization strategies');
    }

    nextSteps.push('Update baseline metrics with new performance data');
    nextSteps.push('Share findings with team for future optimizations');

    return nextSteps;
  }

  /**
   * Get recommendation by ID
   */
  private async getRecommendation(recommendationId: string): Promise<OptimizationRecommendation | null> {
    let recommendation = this.recommendations.get(recommendationId);

    if (!recommendation && this.redis) {
      const cached = await this.redis.get(`optimization:recommendation:${recommendationId}`);
      if (cached) {
        recommendation = JSON.parse(cached);
        this.recommendations.set(recommendationId, recommendation!);
      }
    }

    return recommendation || null;
  }

  /**
   * Initialize built-in optimizers
   */
  private initializeOptimizers(): void {
    // Initialize rule-based optimizers
    console.log('Performance optimizer initialized');
  }

  /**
   * Start monitoring background process
   */
  private startMonitoring(): void {
    setInterval(async () => {
      try {
        // Monitoring logic would go here
        // For now, just a placeholder
      } catch (error) {
        console.error('Error in performance monitoring:', error);
      }
    }, 60000); // Check every minute
  }

  /**
   * Cleanup resources
   */
  async destroy(): Promise<void> {
    this.baselines.clear();
    this.recommendations.clear();
    this.alerts.clear();
    this.results.clear();
  }
}

export default PerformanceOptimizer;