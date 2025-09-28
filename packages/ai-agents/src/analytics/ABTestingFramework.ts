/**
 * A/B Testing Framework
 *
 * Provides comprehensive A/B testing capabilities for agent optimization,
 * workflow testing, and performance experiments with statistical analysis.
 */

export interface ExperimentConfig {
  id: string;
  name: string;
  description: string;
  hypothesis: string;
  owner: string;
  startDate: Date;
  endDate?: Date;
  minSampleSize: number;
  minDetectableEffect: number;
  confidenceLevel: number;
  variants: ExperimentVariant[];
  trafficAllocation: TrafficAllocation;
  targetMetrics: TargetMetric[];
  segmentationRules?: SegmentationRule[];
  status: ExperimentStatus;
  tags: string[];
  metadata: Record<string, any>;
}

export interface ExperimentVariant {
  id: string;
  name: string;
  description: string;
  trafficPercent: number;
  configuration: Record<string, any>;
  isControl: boolean;
}

export interface TrafficAllocation {
  strategy: AllocationStrategy;
  randomizationUnit: RandomizationUnit;
  hashFunction: string;
  excludeRules?: ExclusionRule[];
  includeRules?: InclusionRule[];
}

export interface TargetMetric {
  id: string;
  name: string;
  type: MetricType;
  aggregation: AggregationType;
  statisticalTest: StatisticalTest;
  isGuardrail: boolean;
  isSuccess: boolean;
  threshold?: number;
  direction: MetricDirection;
  weight: number;
}

export interface SegmentationRule {
  id: string;
  name: string;
  condition: string;
  description: string;
  enabled: boolean;
}

export interface ExclusionRule {
  id: string;
  condition: string;
  reason: string;
  enabled: boolean;
}

export interface InclusionRule {
  id: string;
  condition: string;
  description: string;
  enabled: boolean;
}

export interface ExperimentResult {
  experimentId: string;
  variantId: string;
  userId: string;
  agentId?: string;
  workflowId?: string;
  timestamp: Date;
  metrics: Record<string, number | string>;
  context: Record<string, any>;
  sessionId?: string;
  cohort?: string;
}

export interface StatisticalAnalysis {
  metric: string;
  variantA: VariantStats;
  variantB: VariantStats;
  pValue: number;
  confidenceInterval: ConfidenceInterval;
  statisticalSignificance: boolean;
  practicalSignificance: boolean;
  effect: EffectSize;
  power: number;
  recommendation: string;
  warnings: string[];
}

export interface VariantStats {
  variant: string;
  sampleSize: number;
  mean: number;
  standardDeviation: number;
  standardError: number;
  confidenceInterval: ConfidenceInterval;
  conversionRate?: number;
  successCount?: number;
}

export interface ConfidenceInterval {
  lower: number;
  upper: number;
  level: number;
}

export interface EffectSize {
  absoluteDifference: number;
  relativeDifference: number;
  cohensD?: number;
  oddsRatio?: number;
}

export interface ExperimentStatus {
  state: ExperimentState;
  progress: number;
  currentSampleSize: number;
  estimatedCompletion?: Date;
  lastUpdated: Date;
  issues: ExperimentIssue[];
}

export interface ExperimentIssue {
  type: IssueType;
  severity: IssueSeverity;
  message: string;
  timestamp: Date;
  resolved: boolean;
}

export enum ExperimentState {
  DRAFT = 'draft',
  SCHEDULED = 'scheduled',
  RUNNING = 'running',
  PAUSED = 'paused',
  COMPLETED = 'completed',
  STOPPED = 'stopped',
  ARCHIVED = 'archived'
}

export enum AllocationStrategy {
  RANDOM = 'random',
  DETERMINISTIC = 'deterministic',
  STRATIFIED = 'stratified',
  CLUSTER = 'cluster'
}

export enum RandomizationUnit {
  USER = 'user',
  SESSION = 'session',
  AGENT = 'agent',
  WORKFLOW = 'workflow',
  ORGANIZATION = 'organization'
}

export enum MetricType {
  BINARY = 'binary',
  CONTINUOUS = 'continuous',
  COUNT = 'count',
  TIME = 'time',
  RATE = 'rate'
}

export enum AggregationType {
  SUM = 'sum',
  MEAN = 'mean',
  MEDIAN = 'median',
  COUNT = 'count',
  RATE = 'rate',
  PERCENTAGE = 'percentage'
}

export enum StatisticalTest {
  T_TEST = 't_test',
  WELCH_T_TEST = 'welch_t_test',
  CHI_SQUARE = 'chi_square',
  MANN_WHITNEY = 'mann_whitney',
  PROPORTION_TEST = 'proportion_test',
  REGRESSION = 'regression'
}

export enum MetricDirection {
  INCREASE = 'increase',
  DECREASE = 'decrease',
  EITHER = 'either'
}

export enum IssueType {
  SAMPLE_RATIO_MISMATCH = 'sample_ratio_mismatch',
  NOVELTY_EFFECT = 'novelty_effect',
  SEASONAL_VARIANCE = 'seasonal_variance',
  EXTERNAL_FACTOR = 'external_factor',
  DATA_QUALITY = 'data_quality',
  GUARDRAIL_VIOLATION = 'guardrail_violation'
}

export enum IssueSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

export class ABTestingFramework {
  private experiments: Map<string, ExperimentConfig> = new Map();
  private results: Map<string, ExperimentResult[]> = new Map();
  private redis?: any;
  private prisma?: any;

  constructor(config?: {
    redis?: any;
    prisma?: any;
  }) {
    this.redis = config?.redis;
    this.prisma = config?.prisma;
  }

  /**
   * Create a new A/B test experiment
   */
  async createExperiment(config: Omit<ExperimentConfig, 'status'>): Promise<ExperimentConfig> {
    // Validate experiment configuration
    this.validateExperimentConfig(config);

    const experiment: ExperimentConfig = {
      ...config,
      status: {
        state: ExperimentState.DRAFT,
        progress: 0,
        currentSampleSize: 0,
        lastUpdated: new Date(),
        issues: []
      }
    };

    // Store experiment
    this.experiments.set(experiment.id, experiment);

    if (this.redis) {
      await this.redis.setex(
        `experiment:${experiment.id}`,
        3600 * 24 * 30, // 30 days
        JSON.stringify(experiment)
      );
    }

    if (this.prisma) {
      await this.saveExperimentToDatabase(experiment);
    }

    return experiment;
  }

  /**
   * Start an experiment
   */
  async startExperiment(experimentId: string): Promise<void> {
    const experiment = await this.getExperiment(experimentId);
    if (!experiment) {
      throw new Error(`Experiment ${experimentId} not found`);
    }

    if (experiment.status.state !== ExperimentState.DRAFT &&
        experiment.status.state !== ExperimentState.SCHEDULED) {
      throw new Error(`Cannot start experiment in state: ${experiment.status.state}`);
    }

    // Validate experiment is ready to start
    await this.validateExperimentReadiness(experiment);

    // Update experiment status
    experiment.status.state = ExperimentState.RUNNING;
    experiment.status.lastUpdated = new Date();
    experiment.startDate = new Date();

    await this.updateExperiment(experiment);

    console.log(`Started experiment: ${experiment.name} (${experimentId})`);
  }

  /**
   * Stop an experiment
   */
  async stopExperiment(experimentId: string, reason?: string): Promise<void> {
    const experiment = await this.getExperiment(experimentId);
    if (!experiment) {
      throw new Error(`Experiment ${experimentId} not found`);
    }

    experiment.status.state = ExperimentState.STOPPED;
    experiment.status.lastUpdated = new Date();
    experiment.endDate = new Date();

    if (reason) {
      experiment.status.issues.push({
        type: IssueType.EXTERNAL_FACTOR,
        severity: IssueSeverity.MEDIUM,
        message: `Experiment stopped: ${reason}`,
        timestamp: new Date(),
        resolved: false
      });
    }

    await this.updateExperiment(experiment);

    console.log(`Stopped experiment: ${experiment.name} (${experimentId})`);
  }

  /**
   * Record experiment result
   */
  async recordResult(result: ExperimentResult): Promise<void> {
    const experiment = await this.getExperiment(result.experimentId);
    if (!experiment) {
      throw new Error(`Experiment ${result.experimentId} not found`);
    }

    if (experiment.status.state !== ExperimentState.RUNNING) {
      console.warn(`Recording result for non-running experiment: ${result.experimentId}`);
    }

    // Validate variant exists
    const variant = experiment.variants.find(v => v.id === result.variantId);
    if (!variant) {
      throw new Error(`Variant ${result.variantId} not found in experiment ${result.experimentId}`);
    }

    // Store result
    if (!this.results.has(result.experimentId)) {
      this.results.set(result.experimentId, []);
    }
    this.results.get(result.experimentId)!.push(result);

    // Update experiment progress
    experiment.status.currentSampleSize++;
    experiment.status.progress = Math.min(
      experiment.status.currentSampleSize / experiment.minSampleSize,
      1.0
    );
    experiment.status.lastUpdated = new Date();

    if (this.redis) {
      await this.redis.lpush(
        `experiment:${result.experimentId}:results`,
        JSON.stringify(result)
      );
    }

    if (this.prisma) {
      await this.saveResultToDatabase(result);
    }

    // Check if experiment should auto-complete
    if (experiment.status.currentSampleSize >= experiment.minSampleSize) {
      await this.checkExperimentCompletion(experiment);
    }
  }

  /**
   * Assign user to experiment variant
   */
  assignVariant(
    experimentId: string,
    userId: string,
    context?: Record<string, any>
  ): string | null {
    const experiment = this.experiments.get(experimentId);
    if (!experiment || experiment.status.state !== ExperimentState.RUNNING) {
      return null;
    }

    // Check exclusion rules
    if (this.isExcluded(experiment, userId, context)) {
      return null;
    }

    // Check inclusion rules
    if (!this.isIncluded(experiment, userId, context)) {
      return null;
    }

    // Determine variant using hash-based assignment
    const hash = this.hashUser(userId, experimentId, experiment.trafficAllocation.hashFunction);
    const bucket = hash % 100;

    let cumulativePercent = 0;
    for (const variant of experiment.variants) {
      cumulativePercent += variant.trafficPercent;
      if (bucket < cumulativePercent) {
        return variant.id;
      }
    }

    return null;
  }

  /**
   * Get experiment by ID
   */
  async getExperiment(experimentId: string): Promise<ExperimentConfig | null> {
    let experiment = this.experiments.get(experimentId);

    if (!experiment && this.redis) {
      const cached = await this.redis.get(`experiment:${experimentId}`);
      if (cached) {
        experiment = JSON.parse(cached);
        this.experiments.set(experimentId, experiment!);
      }
    }

    if (!experiment && this.prisma) {
      experiment = await this.loadExperimentFromDatabase(experimentId);
      if (experiment) {
        this.experiments.set(experimentId, experiment);
      }
    }

    return experiment || null;
  }

  /**
   * List all experiments
   */
  async listExperiments(filters?: {
    state?: ExperimentState;
    owner?: string;
    tags?: string[];
  }): Promise<ExperimentConfig[]> {
    let experiments = Array.from(this.experiments.values());

    if (this.prisma) {
      const dbExperiments = await this.loadExperimentsFromDatabase(filters);
      for (const exp of dbExperiments) {
        if (!this.experiments.has(exp.id)) {
          experiments.push(exp);
          this.experiments.set(exp.id, exp);
        }
      }
    }

    // Apply filters
    if (filters) {
      if (filters.state) {
        experiments = experiments.filter(exp => exp.status.state === filters.state);
      }
      if (filters.owner) {
        experiments = experiments.filter(exp => exp.owner === filters.owner);
      }
      if (filters.tags) {
        experiments = experiments.filter(exp =>
          filters.tags!.some(tag => exp.tags.includes(tag))
        );
      }
    }

    return experiments;
  }

  /**
   * Get experiment results
   */
  async getResults(experimentId: string): Promise<ExperimentResult[]> {
    let results = this.results.get(experimentId) || [];

    if (this.redis) {
      const cached = await this.redis.lrange(`experiment:${experimentId}:results`, 0, -1);
      const cachedResults = cached.map((r: string) => JSON.parse(r));
      results = [...results, ...cachedResults];
    }

    if (this.prisma) {
      const dbResults = await this.loadResultsFromDatabase(experimentId);
      results = [...results, ...dbResults];
    }

    // Deduplicate by timestamp and userId
    const seen = new Set();
    return results.filter(result => {
      const key = `${result.userId}:${result.timestamp.getTime()}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  /**
   * Validate experiment configuration
   */
  private validateExperimentConfig(config: Omit<ExperimentConfig, 'status'>): void {
    if (!config.id || !config.name) {
      throw new Error('Experiment ID and name are required');
    }

    if (config.variants.length < 2) {
      throw new Error('At least 2 variants are required');
    }

    const totalTraffic = config.variants.reduce((sum, v) => sum + v.trafficPercent, 0);
    if (Math.abs(totalTraffic - 100) > 0.01) {
      throw new Error('Variant traffic percentages must sum to 100%');
    }

    const controlVariants = config.variants.filter(v => v.isControl);
    if (controlVariants.length !== 1) {
      throw new Error('Exactly one control variant is required');
    }

    if (config.minSampleSize < 100) {
      throw new Error('Minimum sample size must be at least 100');
    }

    if (config.confidenceLevel < 0.8 || config.confidenceLevel > 0.99) {
      throw new Error('Confidence level must be between 0.8 and 0.99');
    }
  }

  /**
   * Validate experiment is ready to start
   */
  private async validateExperimentReadiness(experiment: ExperimentConfig): Promise<void> {
    // Check target metrics are properly configured
    if (experiment.targetMetrics.length === 0) {
      throw new Error('At least one target metric is required');
    }

    // Check for at least one success metric
    const successMetrics = experiment.targetMetrics.filter(m => m.isSuccess);
    if (successMetrics.length === 0) {
      throw new Error('At least one success metric is required');
    }

    // Validate metric configurations
    for (const metric of experiment.targetMetrics) {
      if (metric.weight < 0 || metric.weight > 1) {
        throw new Error('Metric weights must be between 0 and 1');
      }
    }
  }

  /**
   * Check if experiment should complete
   */
  private async checkExperimentCompletion(experiment: ExperimentConfig): Promise<void> {
    if (experiment.status.currentSampleSize >= experiment.minSampleSize) {
      // Check if we have statistical significance
      const analysis = await this.analyzeExperiment(experiment.id);
      const significantMetrics = analysis.filter(a => a.statisticalSignificance);

      if (significantMetrics.length > 0) {
        experiment.status.state = ExperimentState.COMPLETED;
        experiment.endDate = new Date();
        await this.updateExperiment(experiment);

        console.log(`Auto-completed experiment: ${experiment.name} (${experiment.id})`);
      }
    }
  }

  /**
   * Analyze experiment results
   */
  private async analyzeExperiment(experimentId: string): Promise<StatisticalAnalysis[]> {
    // This would integrate with StatisticalAnalyzer
    // For now, return empty array
    return [];
  }

  /**
   * Check if user is excluded from experiment
   */
  private isExcluded(
    experiment: ExperimentConfig,
    userId: string,
    context?: Record<string, any>
  ): boolean {
    if (!experiment.trafficAllocation.excludeRules) {
      return false;
    }

    return experiment.trafficAllocation.excludeRules.some(rule => {
      if (!rule.enabled) return false;
      // Evaluate rule condition (simplified)
      return this.evaluateCondition(rule.condition, userId, context);
    });
  }

  /**
   * Check if user is included in experiment
   */
  private isIncluded(
    experiment: ExperimentConfig,
    userId: string,
    context?: Record<string, any>
  ): boolean {
    if (!experiment.trafficAllocation.includeRules) {
      return true;
    }

    return experiment.trafficAllocation.includeRules.some(rule => {
      if (!rule.enabled) return false;
      return this.evaluateCondition(rule.condition, userId, context);
    });
  }

  /**
   * Evaluate a condition string
   */
  private evaluateCondition(
    condition: string,
    userId: string,
    context?: Record<string, any>
  ): boolean {
    // Simplified condition evaluation
    // In production, this would use a proper expression evaluator
    try {
      const vars = { userId, ...(context || {}) };
      return new Function('vars', `with(vars) { return ${condition}; }`)(vars);
    } catch (error) {
      console.warn(`Failed to evaluate condition: ${condition}`, error);
      return false;
    }
  }

  /**
   * Hash user for variant assignment
   */
  private hashUser(userId: string, experimentId: string, hashFunction: string): number {
    const input = `${userId}:${experimentId}`;

    // Simple hash function (in production, use crypto.createHash)
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
      const char = input.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }

    return Math.abs(hash);
  }

  /**
   * Update experiment in storage
   */
  private async updateExperiment(experiment: ExperimentConfig): Promise<void> {
    this.experiments.set(experiment.id, experiment);

    if (this.redis) {
      await this.redis.setex(
        `experiment:${experiment.id}`,
        3600 * 24 * 30,
        JSON.stringify(experiment)
      );
    }

    if (this.prisma) {
      await this.saveExperimentToDatabase(experiment);
    }
  }

  /**
   * Save experiment to database
   */
  private async saveExperimentToDatabase(experiment: ExperimentConfig): Promise<void> {
    if (!this.prisma) return;

    try {
      await this.prisma.abTestExperiment.upsert({
        where: { id: experiment.id },
        update: {
          name: experiment.name,
          description: experiment.description,
          hypothesis: experiment.hypothesis,
          owner: experiment.owner,
          startDate: experiment.startDate,
          endDate: experiment.endDate,
          minSampleSize: experiment.minSampleSize,
          minDetectableEffect: experiment.minDetectableEffect,
          confidenceLevel: experiment.confidenceLevel,
          variants: JSON.stringify(experiment.variants),
          trafficAllocation: JSON.stringify(experiment.trafficAllocation),
          targetMetrics: JSON.stringify(experiment.targetMetrics),
          segmentationRules: JSON.stringify(experiment.segmentationRules),
          status: JSON.stringify(experiment.status),
          tags: experiment.tags,
          metadata: JSON.stringify(experiment.metadata),
          updatedAt: new Date()
        },
        create: {
          id: experiment.id,
          name: experiment.name,
          description: experiment.description,
          hypothesis: experiment.hypothesis,
          owner: experiment.owner,
          startDate: experiment.startDate,
          endDate: experiment.endDate,
          minSampleSize: experiment.minSampleSize,
          minDetectableEffect: experiment.minDetectableEffect,
          confidenceLevel: experiment.confidenceLevel,
          variants: JSON.stringify(experiment.variants),
          trafficAllocation: JSON.stringify(experiment.trafficAllocation),
          targetMetrics: JSON.stringify(experiment.targetMetrics),
          segmentationRules: JSON.stringify(experiment.segmentationRules),
          status: JSON.stringify(experiment.status),
          tags: experiment.tags,
          metadata: JSON.stringify(experiment.metadata)
        }
      });
    } catch (error) {
      console.error('Failed to save experiment to database:', error);
    }
  }

  /**
   * Load experiment from database
   */
  private async loadExperimentFromDatabase(experimentId: string): Promise<ExperimentConfig | null> {
    if (!this.prisma) return null;

    try {
      const record = await this.prisma.abTestExperiment.findUnique({
        where: { id: experimentId }
      });

      if (!record) return null;

      return {
        id: record.id,
        name: record.name,
        description: record.description,
        hypothesis: record.hypothesis,
        owner: record.owner,
        startDate: record.startDate,
        endDate: record.endDate,
        minSampleSize: record.minSampleSize,
        minDetectableEffect: record.minDetectableEffect,
        confidenceLevel: record.confidenceLevel,
        variants: JSON.parse(record.variants),
        trafficAllocation: JSON.parse(record.trafficAllocation),
        targetMetrics: JSON.parse(record.targetMetrics),
        segmentationRules: record.segmentationRules ? JSON.parse(record.segmentationRules) : undefined,
        status: JSON.parse(record.status),
        tags: record.tags,
        metadata: JSON.parse(record.metadata)
      };
    } catch (error) {
      console.error('Failed to load experiment from database:', error);
      return null;
    }
  }

  /**
   * Load experiments from database
   */
  private async loadExperimentsFromDatabase(filters?: {
    state?: ExperimentState;
    owner?: string;
    tags?: string[];
  }): Promise<ExperimentConfig[]> {
    if (!this.prisma) return [];

    try {
      const where: any = {};

      if (filters?.owner) {
        where.owner = filters.owner;
      }

      if (filters?.tags) {
        where.tags = {
          hasSome: filters.tags
        };
      }

      const records = await this.prisma.abTestExperiment.findMany({
        where,
        orderBy: { createdAt: 'desc' }
      });

      const experiments = records.map(record => ({
        id: record.id,
        name: record.name,
        description: record.description,
        hypothesis: record.hypothesis,
        owner: record.owner,
        startDate: record.startDate,
        endDate: record.endDate,
        minSampleSize: record.minSampleSize,
        minDetectableEffect: record.minDetectableEffect,
        confidenceLevel: record.confidenceLevel,
        variants: JSON.parse(record.variants),
        trafficAllocation: JSON.parse(record.trafficAllocation),
        targetMetrics: JSON.parse(record.targetMetrics),
        segmentationRules: record.segmentationRules ? JSON.parse(record.segmentationRules) : undefined,
        status: JSON.parse(record.status),
        tags: record.tags,
        metadata: JSON.parse(record.metadata)
      }));

      // Apply state filter after loading (since it's nested in JSON)
      if (filters?.state) {
        return experiments.filter(exp => exp.status.state === filters.state);
      }

      return experiments;
    } catch (error) {
      console.error('Failed to load experiments from database:', error);
      return [];
    }
  }

  /**
   * Save result to database
   */
  private async saveResultToDatabase(result: ExperimentResult): Promise<void> {
    if (!this.prisma) return;

    try {
      await this.prisma.abTestResult.create({
        data: {
          experimentId: result.experimentId,
          variantId: result.variantId,
          userId: result.userId,
          agentId: result.agentId,
          workflowId: result.workflowId,
          timestamp: result.timestamp,
          metrics: JSON.stringify(result.metrics),
          context: JSON.stringify(result.context),
          sessionId: result.sessionId,
          cohort: result.cohort
        }
      });
    } catch (error) {
      console.error('Failed to save result to database:', error);
    }
  }

  /**
   * Load results from database
   */
  private async loadResultsFromDatabase(experimentId: string): Promise<ExperimentResult[]> {
    if (!this.prisma) return [];

    try {
      const records = await this.prisma.abTestResult.findMany({
        where: { experimentId },
        orderBy: { timestamp: 'asc' }
      });

      return records.map(record => ({
        experimentId: record.experimentId,
        variantId: record.variantId,
        userId: record.userId,
        agentId: record.agentId || undefined,
        workflowId: record.workflowId || undefined,
        timestamp: record.timestamp,
        metrics: JSON.parse(record.metrics),
        context: JSON.parse(record.context),
        sessionId: record.sessionId || undefined,
        cohort: record.cohort || undefined
      }));
    } catch (error) {
      console.error('Failed to load results from database:', error);
      return [];
    }
  }

  /**
   * Cleanup resources
   */
  async destroy(): Promise<void> {
    this.experiments.clear();
    this.results.clear();
  }
}

export default ABTestingFramework;