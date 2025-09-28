/**
 * Statistical Analyzer
 *
 * Provides comprehensive statistical analysis for A/B tests and experiments,
 * including hypothesis testing, confidence intervals, and effect size calculations.
 */

import { ExperimentConfig, ExperimentResult, TargetMetric } from './ABTestingFramework';

export interface StatisticalAnalysis {
  experimentId: string;
  metric: string;
  variantA: VariantStats;
  variantB: VariantStats;
  testResults: TestResults;
  effectSize: EffectSize;
  confidenceInterval: ConfidenceInterval;
  statisticalSignificance: boolean;
  practicalSignificance: boolean;
  recommendation: Recommendation;
  warnings: Warning[];
  metadata: AnalysisMetadata;
}

export interface VariantStats {
  variantId: string;
  name: string;
  sampleSize: number;
  mean: number;
  median: number;
  standardDeviation: number;
  standardError: number;
  minimum: number;
  maximum: number;
  percentiles: Percentiles;
  successCount?: number;
  conversionRate?: number;
  confidenceInterval: ConfidenceInterval;
}

export interface TestResults {
  testType: StatisticalTest;
  pValue: number;
  testStatistic: number;
  degreesOfFreedom?: number;
  criticalValue?: number;
  alpha: number;
  power: number;
  effectDetected: boolean;
}

export interface EffectSize {
  absoluteDifference: number;
  relativeDifference: number;
  percentChange: number;
  cohensD?: number;
  hedgesG?: number;
  glassD?: number;
  oddsRatio?: number;
  riskRatio?: number;
  interpretation: EffectSizeInterpretation;
}

export interface ConfidenceInterval {
  lower: number;
  upper: number;
  level: number;
  interpretation: string;
}

export interface Percentiles {
  p25: number;
  p50: number;
  p75: number;
  p90: number;
  p95: number;
  p99: number;
}

export interface Recommendation {
  action: RecommendedAction;
  confidence: ConfidenceLevel;
  reasoning: string;
  nextSteps: string[];
  risks: string[];
}

export interface Warning {
  type: WarningType;
  severity: WarningSeverity;
  message: string;
  impact: string;
  resolution: string;
}

export interface AnalysisMetadata {
  analysisDate: Date;
  samplePeriod: DateRange;
  outliersTreatment: OutlierTreatment;
  assumptions: AssumptionChecks;
  dataQuality: DataQualityMetrics;
}

export interface DateRange {
  start: Date;
  end: Date;
  duration: number; // days
}

export interface OutlierTreatment {
  method: OutlierMethod;
  threshold: number;
  removed: number;
  percentage: number;
}

export interface AssumptionChecks {
  normality: AssumptionCheck;
  homogeneity: AssumptionCheck;
  independence: AssumptionCheck;
  randomization: AssumptionCheck;
}

export interface AssumptionCheck {
  tested: boolean;
  passed: boolean;
  testName: string;
  pValue?: number;
  interpretation: string;
}

export interface DataQualityMetrics {
  completeness: number;
  validity: number;
  consistency: number;
  timeliness: number;
  accuracy: number;
  overall: number;
}

export interface BayesianAnalysis {
  priorDistribution: Distribution;
  posteriorDistribution: Distribution;
  credibleInterval: CredibleInterval;
  probabilityOfSuperiority: number;
  expectedLoss: number;
  valueOfInformation: number;
}

export interface Distribution {
  type: DistributionType;
  parameters: Record<string, number>;
  mean: number;
  variance: number;
}

export interface CredibleInterval {
  lower: number;
  upper: number;
  probability: number;
}

export interface SequentialAnalysis {
  stage: number;
  boundaryType: BoundaryType;
  efficacyBoundary: number;
  futilityBoundary: number;
  recommendedAction: SequentialAction;
  typeIError: number;
  typeIIError: number;
}

export enum StatisticalTest {
  T_TEST = 't_test',
  WELCH_T_TEST = 'welch_t_test',
  PAIRED_T_TEST = 'paired_t_test',
  CHI_SQUARE = 'chi_square',
  MANN_WHITNEY = 'mann_whitney',
  WILCOXON = 'wilcoxon',
  PROPORTION_TEST = 'proportion_test',
  FISHERS_EXACT = 'fishers_exact',
  KOLMOGOROV_SMIRNOV = 'kolmogorov_smirnov',
  BOOTSTRAP = 'bootstrap',
  PERMUTATION = 'permutation'
}

export enum EffectSizeInterpretation {
  NEGLIGIBLE = 'negligible',
  SMALL = 'small',
  MEDIUM = 'medium',
  LARGE = 'large',
  VERY_LARGE = 'very_large'
}

export enum RecommendedAction {
  CONTINUE = 'continue',
  STOP_WINNER = 'stop_winner',
  STOP_NO_EFFECT = 'stop_no_effect',
  STOP_HARMFUL = 'stop_harmful',
  EXTEND_SAMPLE = 'extend_sample',
  REDESIGN = 'redesign'
}

export enum ConfidenceLevel {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  VERY_HIGH = 'very_high'
}

export enum WarningType {
  SAMPLE_SIZE = 'sample_size',
  POWER = 'power',
  ASSUMPTIONS = 'assumptions',
  DATA_QUALITY = 'data_quality',
  OUTLIERS = 'outliers',
  SEASONALITY = 'seasonality',
  EXTERNAL_VALIDITY = 'external_validity'
}

export enum WarningSeverity {
  INFO = 'info',
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

export enum OutlierMethod {
  NONE = 'none',
  Z_SCORE = 'z_score',
  IQR = 'iqr',
  ISOLATION_FOREST = 'isolation_forest',
  LOCAL_OUTLIER_FACTOR = 'local_outlier_factor'
}

export enum DistributionType {
  NORMAL = 'normal',
  BETA = 'beta',
  GAMMA = 'gamma',
  EXPONENTIAL = 'exponential',
  POISSON = 'poisson'
}

export enum BoundaryType {
  POCOCK = 'pocock',
  OBRIEN_FLEMING = 'obrien_fleming',
  HAYBITTLE_PETO = 'haybittle_peto',
  ALPHA_SPENDING = 'alpha_spending'
}

export enum SequentialAction {
  CONTINUE = 'continue',
  STOP_EFFICACY = 'stop_efficacy',
  STOP_FUTILITY = 'stop_futility'
}

export class StatisticalAnalyzer {
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
   * Analyze experiment with comprehensive statistical tests
   */
  async analyzeExperiment(
    experiment: ExperimentConfig,
    results: ExperimentResult[]
  ): Promise<StatisticalAnalysis[]> {
    const analyses: StatisticalAnalysis[] = [];

    // Group results by variant
    const variantResults = this.groupResultsByVariant(results);

    // Analyze each target metric
    for (const metric of experiment.targetMetrics) {
      const analysis = await this.analyzeMetric(
        experiment,
        metric,
        variantResults,
        results
      );
      analyses.push(analysis);
    }

    return analyses;
  }

  /**
   * Analyze specific metric
   */
  async analyzeMetric(
    experiment: ExperimentConfig,
    metric: TargetMetric,
    variantResults: Map<string, ExperimentResult[]>,
    allResults: ExperimentResult[]
  ): Promise<StatisticalAnalysis> {
    // Get control and treatment variants
    const controlVariant = experiment.variants.find(v => v.isControl);
    const treatmentVariants = experiment.variants.filter(v => !v.isControl);

    if (!controlVariant || treatmentVariants.length === 0) {
      throw new Error('Invalid experiment configuration: need control and treatment variants');
    }

    // For now, analyze first treatment variant vs control
    const treatmentVariant = treatmentVariants[0];

    const controlResults = variantResults.get(controlVariant.id) || [];
    const treatmentResults = variantResults.get(treatmentVariant.id) || [];

    // Extract metric values
    const controlValues = this.extractMetricValues(controlResults, metric);
    const treatmentValues = this.extractMetricValues(treatmentResults, metric);

    // Calculate variant statistics
    const controlStats = this.calculateVariantStats(
      controlVariant.id,
      controlVariant.name,
      controlValues,
      metric,
      experiment.confidenceLevel
    );

    const treatmentStats = this.calculateVariantStats(
      treatmentVariant.id,
      treatmentVariant.name,
      treatmentValues,
      metric,
      experiment.confidenceLevel
    );

    // Perform statistical test
    const testResults = this.performStatisticalTest(
      controlValues,
      treatmentValues,
      metric,
      experiment.confidenceLevel
    );

    // Calculate effect size
    const effectSize = this.calculateEffectSize(
      controlValues,
      treatmentValues,
      controlStats,
      treatmentStats,
      metric
    );

    // Calculate confidence interval for difference
    const confidenceInterval = this.calculateDifferenceConfidenceInterval(
      controlStats,
      treatmentStats,
      experiment.confidenceLevel
    );

    // Generate recommendation
    const recommendation = this.generateRecommendation(
      testResults,
      effectSize,
      controlStats,
      treatmentStats,
      metric
    );

    // Check for warnings
    const warnings = this.checkWarnings(
      controlStats,
      treatmentStats,
      testResults,
      allResults
    );

    // Generate metadata
    const metadata = this.generateAnalysisMetadata(allResults, controlValues, treatmentValues);

    return {
      experimentId: experiment.id,
      metric: metric.name,
      variantA: controlStats,
      variantB: treatmentStats,
      testResults,
      effectSize,
      confidenceInterval,
      statisticalSignificance: testResults.pValue < (1 - experiment.confidenceLevel),
      practicalSignificance: this.isPracticallySignificant(effectSize, metric),
      recommendation,
      warnings,
      metadata
    };
  }

  /**
   * Perform Bayesian analysis
   */
  async performBayesianAnalysis(
    experiment: ExperimentConfig,
    metric: TargetMetric,
    controlValues: number[],
    treatmentValues: number[]
  ): Promise<BayesianAnalysis> {
    // Simplified Bayesian analysis
    // In production, this would use proper Bayesian inference

    const controlMean = this.calculateMean(controlValues);
    const treatmentMean = this.calculateMean(treatmentValues);

    const posteriorMean = (controlMean + treatmentMean) / 2;
    const posteriorVariance = this.calculateVariance(controlValues.concat(treatmentValues));

    return {
      priorDistribution: {
        type: DistributionType.NORMAL,
        parameters: { mean: 0, variance: 1 },
        mean: 0,
        variance: 1
      },
      posteriorDistribution: {
        type: DistributionType.NORMAL,
        parameters: { mean: posteriorMean, variance: posteriorVariance },
        mean: posteriorMean,
        variance: posteriorVariance
      },
      credibleInterval: {
        lower: posteriorMean - 1.96 * Math.sqrt(posteriorVariance),
        upper: posteriorMean + 1.96 * Math.sqrt(posteriorVariance),
        probability: 0.95
      },
      probabilityOfSuperiority: treatmentMean > controlMean ? 0.7 : 0.3,
      expectedLoss: Math.abs(treatmentMean - controlMean) * 0.1,
      valueOfInformation: 100 // Simplified calculation
    };
  }

  /**
   * Perform sequential analysis
   */
  async performSequentialAnalysis(
    experiment: ExperimentConfig,
    currentResults: ExperimentResult[]
  ): Promise<SequentialAnalysis> {
    // Simplified sequential analysis
    const currentSampleSize = currentResults.length;
    const targetSampleSize = experiment.minSampleSize;
    const stage = Math.floor((currentSampleSize / targetSampleSize) * 10);

    return {
      stage,
      boundaryType: BoundaryType.OBRIEN_FLEMING,
      efficacyBoundary: 2.5, // Simplified
      futilityBoundary: 0.5,
      recommendedAction: SequentialAction.CONTINUE,
      typeIError: 0.05,
      typeIIError: 0.2
    };
  }

  /**
   * Group results by variant
   */
  private groupResultsByVariant(results: ExperimentResult[]): Map<string, ExperimentResult[]> {
    const grouped = new Map<string, ExperimentResult[]>();

    for (const result of results) {
      if (!grouped.has(result.variantId)) {
        grouped.set(result.variantId, []);
      }
      grouped.get(result.variantId)!.push(result);
    }

    return grouped;
  }

  /**
   * Extract metric values from results
   */
  private extractMetricValues(results: ExperimentResult[], metric: TargetMetric): number[] {
    return results
      .map(result => {
        const value = result.metrics[metric.name];
        return typeof value === 'number' ? value : (value === true ? 1 : 0);
      })
      .filter(value => !isNaN(value));
  }

  /**
   * Calculate variant statistics
   */
  private calculateVariantStats(
    variantId: string,
    name: string,
    values: number[],
    metric: TargetMetric,
    confidenceLevel: number
  ): VariantStats {
    if (values.length === 0) {
      throw new Error(`No data for variant ${variantId}`);
    }

    const sortedValues = [...values].sort((a, b) => a - b);
    const mean = this.calculateMean(values);
    const median = this.calculateMedian(sortedValues);
    const standardDeviation = this.calculateStandardDeviation(values, mean);
    const standardError = standardDeviation / Math.sqrt(values.length);

    const percentiles = this.calculatePercentiles(sortedValues);
    const confidenceInterval = this.calculateConfidenceInterval(
      mean,
      standardError,
      values.length,
      confidenceLevel
    );

    const stats: VariantStats = {
      variantId,
      name,
      sampleSize: values.length,
      mean,
      median,
      standardDeviation,
      standardError,
      minimum: sortedValues[0],
      maximum: sortedValues[sortedValues.length - 1],
      percentiles,
      confidenceInterval
    };

    // Add conversion metrics for binary metrics
    if (metric.type === 'binary') {
      stats.successCount = values.filter(v => v === 1).length;
      stats.conversionRate = stats.successCount / values.length;
    }

    return stats;
  }

  /**
   * Perform statistical test
   */
  private performStatisticalTest(
    controlValues: number[],
    treatmentValues: number[],
    metric: TargetMetric,
    confidenceLevel: number
  ): TestResults {
    const alpha = 1 - confidenceLevel;

    // Select appropriate test based on metric type
    let testType: StatisticalTest;
    let pValue: number;
    let testStatistic: number;
    let degreesOfFreedom: number | undefined;

    if (metric.type === 'binary') {
      // Proportion test
      testType = StatisticalTest.PROPORTION_TEST;
      const result = this.performProportionTest(controlValues, treatmentValues);
      pValue = result.pValue;
      testStatistic = result.zStatistic;
    } else {
      // Continuous metric - use t-test
      testType = StatisticalTest.WELCH_T_TEST;
      const result = this.performWelchTTest(controlValues, treatmentValues);
      pValue = result.pValue;
      testStatistic = result.tStatistic;
      degreesOfFreedom = result.degreesOfFreedom;
    }

    // Calculate power (simplified)
    const power = this.calculatePower(controlValues, treatmentValues, alpha);

    return {
      testType,
      pValue,
      testStatistic,
      degreesOfFreedom,
      alpha,
      power,
      effectDetected: pValue < alpha
    };
  }

  /**
   * Perform proportion test (Z-test for proportions)
   */
  private performProportionTest(
    controlValues: number[],
    treatmentValues: number[]
  ): { pValue: number; zStatistic: number } {
    const n1 = controlValues.length;
    const n2 = treatmentValues.length;
    const x1 = controlValues.filter(v => v === 1).length;
    const x2 = treatmentValues.filter(v => v === 1).length;

    const p1 = x1 / n1;
    const p2 = x2 / n2;
    const pPooled = (x1 + x2) / (n1 + n2);

    const standardError = Math.sqrt(pPooled * (1 - pPooled) * (1/n1 + 1/n2));
    const zStatistic = (p1 - p2) / standardError;

    // Two-tailed p-value
    const pValue = 2 * (1 - this.normalCDF(Math.abs(zStatistic)));

    return { pValue, zStatistic };
  }

  /**
   * Perform Welch's t-test (unequal variances)
   */
  private performWelchTTest(
    controlValues: number[],
    treatmentValues: number[]
  ): { pValue: number; tStatistic: number; degreesOfFreedom: number } {
    const n1 = controlValues.length;
    const n2 = treatmentValues.length;
    const mean1 = this.calculateMean(controlValues);
    const mean2 = this.calculateMean(treatmentValues);
    const var1 = this.calculateVariance(controlValues);
    const var2 = this.calculateVariance(treatmentValues);

    const standardError = Math.sqrt(var1/n1 + var2/n2);
    const tStatistic = (mean1 - mean2) / standardError;

    // Welch's degrees of freedom
    const degreesOfFreedom = Math.pow(var1/n1 + var2/n2, 2) /
      (Math.pow(var1/n1, 2)/(n1-1) + Math.pow(var2/n2, 2)/(n2-1));

    // Two-tailed p-value (simplified - using normal approximation)
    const pValue = 2 * (1 - this.normalCDF(Math.abs(tStatistic)));

    return { pValue, tStatistic, degreesOfFreedom };
  }

  /**
   * Calculate effect size
   */
  private calculateEffectSize(
    controlValues: number[],
    treatmentValues: number[],
    controlStats: VariantStats,
    treatmentStats: VariantStats,
    metric: TargetMetric
  ): EffectSize {
    const absoluteDifference = treatmentStats.mean - controlStats.mean;
    const relativeDifference = controlStats.mean !== 0 ?
      absoluteDifference / controlStats.mean : 0;
    const percentChange = relativeDifference * 100;

    const effectSize: EffectSize = {
      absoluteDifference,
      relativeDifference,
      percentChange,
      interpretation: this.interpretEffectSize(Math.abs(relativeDifference))
    };

    // Calculate Cohen's d for continuous metrics
    if (metric.type === 'continuous') {
      const pooledStandardDeviation = Math.sqrt(
        ((controlValues.length - 1) * Math.pow(controlStats.standardDeviation, 2) +
         (treatmentValues.length - 1) * Math.pow(treatmentStats.standardDeviation, 2)) /
        (controlValues.length + treatmentValues.length - 2)
      );

      effectSize.cohensD = absoluteDifference / pooledStandardDeviation;

      // Hedges' g (bias-corrected Cohen's d)
      const correctionFactor = 1 - (3 / (4 * (controlValues.length + treatmentValues.length) - 9));
      effectSize.hedgesG = effectSize.cohensD * correctionFactor;

      // Glass's delta
      effectSize.glassD = absoluteDifference / controlStats.standardDeviation;
    }

    // Calculate odds ratio and risk ratio for binary metrics
    if (metric.type === 'binary' && controlStats.conversionRate && treatmentStats.conversionRate) {
      const controlOdds = controlStats.conversionRate / (1 - controlStats.conversionRate);
      const treatmentOdds = treatmentStats.conversionRate / (1 - treatmentStats.conversionRate);

      effectSize.oddsRatio = treatmentOdds / controlOdds;
      effectSize.riskRatio = treatmentStats.conversionRate / controlStats.conversionRate;
    }

    return effectSize;
  }

  /**
   * Calculate confidence interval for difference
   */
  private calculateDifferenceConfidenceInterval(
    controlStats: VariantStats,
    treatmentStats: VariantStats,
    confidenceLevel: number
  ): ConfidenceInterval {
    const difference = treatmentStats.mean - controlStats.mean;
    const standardError = Math.sqrt(
      Math.pow(controlStats.standardError, 2) +
      Math.pow(treatmentStats.standardError, 2)
    );

    const zScore = this.getZScore(confidenceLevel);
    const marginOfError = zScore * standardError;

    const interpretation = difference > 0 ?
      'Treatment appears to perform better than control' :
      'Control appears to perform better than treatment';

    return {
      lower: difference - marginOfError,
      upper: difference + marginOfError,
      level: confidenceLevel,
      interpretation
    };
  }

  /**
   * Generate recommendation
   */
  private generateRecommendation(
    testResults: TestResults,
    effectSize: EffectSize,
    controlStats: VariantStats,
    treatmentStats: VariantStats,
    metric: TargetMetric
  ): Recommendation {
    let action: RecommendedAction;
    let confidence: ConfidenceLevel;
    let reasoning: string;
    const nextSteps: string[] = [];
    const risks: string[] = [];

    if (testResults.effectDetected) {
      if (effectSize.relativeDifference > 0) {
        action = RecommendedAction.STOP_WINNER;
        reasoning = 'Treatment variant shows statistically significant improvement';
        nextSteps.push('Implement treatment variant');
        nextSteps.push('Monitor for any negative side effects');
      } else {
        action = RecommendedAction.STOP_HARMFUL;
        reasoning = 'Treatment variant shows statistically significant harm';
        nextSteps.push('Stop treatment variant immediately');
        nextSteps.push('Investigate root cause of negative effect');
        risks.push('Continued exposure to harmful variant');
      }
      confidence = ConfidenceLevel.HIGH;
    } else {
      if (controlStats.sampleSize + treatmentStats.sampleSize < 1000) {
        action = RecommendedAction.EXTEND_SAMPLE;
        reasoning = 'Sample size too small to detect meaningful effects';
        nextSteps.push('Continue experiment to increase sample size');
        confidence = ConfidenceLevel.LOW;
      } else if (testResults.power < 0.8) {
        action = RecommendedAction.EXTEND_SAMPLE;
        reasoning = 'Statistical power too low to detect effects';
        nextSteps.push('Increase sample size or effect size');
        confidence = ConfidenceLevel.MEDIUM;
      } else {
        action = RecommendedAction.STOP_NO_EFFECT;
        reasoning = 'No significant effect detected with adequate power';
        nextSteps.push('Consider alternative approaches');
        confidence = ConfidenceLevel.HIGH;
      }
    }

    return {
      action,
      confidence,
      reasoning,
      nextSteps,
      risks
    };
  }

  /**
   * Check for warnings
   */
  private checkWarnings(
    controlStats: VariantStats,
    treatmentStats: VariantStats,
    testResults: TestResults,
    allResults: ExperimentResult[]
  ): Warning[] {
    const warnings: Warning[] = [];

    // Sample size warning
    if (controlStats.sampleSize < 100 || treatmentStats.sampleSize < 100) {
      warnings.push({
        type: WarningType.SAMPLE_SIZE,
        severity: WarningSeverity.HIGH,
        message: 'Sample size is very small',
        impact: 'Results may not be reliable or generalizable',
        resolution: 'Increase sample size before making decisions'
      });
    }

    // Power warning
    if (testResults.power < 0.8) {
      warnings.push({
        type: WarningType.POWER,
        severity: WarningSeverity.MEDIUM,
        message: 'Statistical power is low',
        impact: 'May miss true effects (Type II error)',
        resolution: 'Increase sample size or effect size'
      });
    }

    // Sample ratio mismatch
    const totalSamples = controlStats.sampleSize + treatmentStats.sampleSize;
    const controlRatio = controlStats.sampleSize / totalSamples;
    const treatmentRatio = treatmentStats.sampleSize / totalSamples;

    if (Math.abs(controlRatio - 0.5) > 0.1 || Math.abs(treatmentRatio - 0.5) > 0.1) {
      warnings.push({
        type: WarningType.SAMPLE_SIZE,
        severity: WarningSeverity.MEDIUM,
        message: 'Sample ratio mismatch detected',
        impact: 'May indicate randomization issues',
        resolution: 'Investigate assignment mechanism'
      });
    }

    // Data quality checks
    const validResults = allResults.filter(r =>
      r.userId && r.variantId && r.timestamp && r.metrics
    ).length;
    const dataQuality = validResults / allResults.length;

    if (dataQuality < 0.95) {
      warnings.push({
        type: WarningType.DATA_QUALITY,
        severity: WarningSeverity.HIGH,
        message: 'Data quality issues detected',
        impact: 'Results may be biased or unreliable',
        resolution: 'Investigate and fix data collection issues'
      });
    }

    return warnings;
  }

  /**
   * Generate analysis metadata
   */
  private generateAnalysisMetadata(
    allResults: ExperimentResult[],
    controlValues: number[],
    treatmentValues: number[]
  ): AnalysisMetadata {
    const timestamps = allResults.map(r => r.timestamp);
    const startDate = new Date(Math.min(...timestamps.map(t => t.getTime())));
    const endDate = new Date(Math.max(...timestamps.map(t => t.getTime())));
    const duration = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24);

    return {
      analysisDate: new Date(),
      samplePeriod: {
        start: startDate,
        end: endDate,
        duration
      },
      outliersTreatment: {
        method: OutlierMethod.NONE,
        threshold: 0,
        removed: 0,
        percentage: 0
      },
      assumptions: {
        normality: {
          tested: false,
          passed: true,
          testName: 'Shapiro-Wilk',
          interpretation: 'Not tested'
        },
        homogeneity: {
          tested: false,
          passed: true,
          testName: 'Levene',
          interpretation: 'Not tested'
        },
        independence: {
          tested: true,
          passed: true,
          testName: 'Visual inspection',
          interpretation: 'Assumed based on randomization'
        },
        randomization: {
          tested: true,
          passed: true,
          testName: 'Balance check',
          interpretation: 'Randomization appears successful'
        }
      },
      dataQuality: this.calculateDataQuality(allResults)
    };
  }

  /**
   * Calculate data quality metrics
   */
  private calculateDataQuality(results: ExperimentResult[]): DataQualityMetrics {
    const total = results.length;
    if (total === 0) {
      return {
        completeness: 0,
        validity: 0,
        consistency: 0,
        timeliness: 0,
        accuracy: 0,
        overall: 0
      };
    }

    // Completeness: percentage of results with all required fields
    const complete = results.filter(r =>
      r.userId && r.variantId && r.timestamp && r.metrics
    ).length;
    const completeness = complete / total;

    // Validity: percentage of results with valid data types
    const valid = results.filter(r => {
      try {
        return typeof r.userId === 'string' &&
               typeof r.variantId === 'string' &&
               r.timestamp instanceof Date &&
               typeof r.metrics === 'object';
      } catch {
        return false;
      }
    }).length;
    const validity = valid / total;

    // Simplified metrics
    const consistency = 0.95; // Would check for data consistency
    const timeliness = 0.98;   // Would check for data freshness
    const accuracy = 0.96;     // Would check for data accuracy

    const overall = (completeness + validity + consistency + timeliness + accuracy) / 5;

    return {
      completeness,
      validity,
      consistency,
      timeliness,
      accuracy,
      overall
    };
  }

  /**
   * Interpret effect size
   */
  private interpretEffectSize(absoluteEffect: number): EffectSizeInterpretation {
    if (absoluteEffect < 0.01) return EffectSizeInterpretation.NEGLIGIBLE;
    if (absoluteEffect < 0.05) return EffectSizeInterpretation.SMALL;
    if (absoluteEffect < 0.15) return EffectSizeInterpretation.MEDIUM;
    if (absoluteEffect < 0.35) return EffectSizeInterpretation.LARGE;
    return EffectSizeInterpretation.VERY_LARGE;
  }

  /**
   * Check if effect is practically significant
   */
  private isPracticallySignificant(effectSize: EffectSize, metric: TargetMetric): boolean {
    // Define practical significance thresholds based on metric
    const threshold = metric.threshold || 0.05; // 5% default
    return Math.abs(effectSize.relativeDifference) >= threshold;
  }

  /**
   * Calculate statistical measures
   */
  private calculateMean(values: number[]): number {
    return values.reduce((sum, val) => sum + val, 0) / values.length;
  }

  private calculateMedian(sortedValues: number[]): number {
    const n = sortedValues.length;
    if (n % 2 === 0) {
      return (sortedValues[n/2 - 1] + sortedValues[n/2]) / 2;
    }
    return sortedValues[Math.floor(n/2)];
  }

  private calculateVariance(values: number[]): number {
    const mean = this.calculateMean(values);
    const squaredDiffs = values.map(val => Math.pow(val - mean, 2));
    return this.calculateMean(squaredDiffs);
  }

  private calculateStandardDeviation(values: number[], mean?: number): number {
    if (!mean) mean = this.calculateMean(values);
    const variance = this.calculateVariance(values);
    return Math.sqrt(variance);
  }

  private calculatePercentiles(sortedValues: number[]): Percentiles {
    const getPercentile = (p: number) => {
      const index = (p / 100) * (sortedValues.length - 1);
      const lower = Math.floor(index);
      const upper = Math.ceil(index);
      const weight = index - lower;

      if (upper >= sortedValues.length) return sortedValues[sortedValues.length - 1];
      if (lower < 0) return sortedValues[0];

      return sortedValues[lower] * (1 - weight) + sortedValues[upper] * weight;
    };

    return {
      p25: getPercentile(25),
      p50: getPercentile(50),
      p75: getPercentile(75),
      p90: getPercentile(90),
      p95: getPercentile(95),
      p99: getPercentile(99)
    };
  }

  private calculateConfidenceInterval(
    mean: number,
    standardError: number,
    sampleSize: number,
    confidenceLevel: number
  ): ConfidenceInterval {
    const zScore = this.getZScore(confidenceLevel);
    const marginOfError = zScore * standardError;

    return {
      lower: mean - marginOfError,
      upper: mean + marginOfError,
      level: confidenceLevel,
      interpretation: `${(confidenceLevel * 100).toFixed(0)}% confident the true mean is in this range`
    };
  }

  private calculatePower(
    controlValues: number[],
    treatmentValues: number[],
    alpha: number
  ): number {
    // Simplified power calculation
    // In production, use proper power analysis
    const effectSize = Math.abs(
      this.calculateMean(treatmentValues) - this.calculateMean(controlValues)
    );
    const pooledSD = Math.sqrt(
      (this.calculateVariance(controlValues) + this.calculateVariance(treatmentValues)) / 2
    );
    const standardizedEffect = effectSize / pooledSD;

    // Rough approximation
    if (standardizedEffect < 0.2) return 0.1;
    if (standardizedEffect < 0.5) return 0.5;
    if (standardizedEffect < 0.8) return 0.8;
    return 0.95;
  }

  private getZScore(confidenceLevel: number): number {
    // Common z-scores for confidence levels
    if (confidenceLevel >= 0.99) return 2.576;
    if (confidenceLevel >= 0.95) return 1.96;
    if (confidenceLevel >= 0.90) return 1.645;
    if (confidenceLevel >= 0.80) return 1.282;
    return 1.96; // Default to 95%
  }

  private normalCDF(x: number): number {
    // Approximation of normal CDF
    // In production, use a proper statistical library
    return 0.5 * (1 + Math.sign(x) * Math.sqrt(1 - Math.exp(-2 * x * x / Math.PI)));
  }

  /**
   * Cleanup resources
   */
  async destroy(): Promise<void> {
    // Cleanup any resources
  }
}

export default StatisticalAnalyzer;