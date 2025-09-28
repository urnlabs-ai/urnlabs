/**
 * Analytics Module Index
 * 
 * Exports all analytics and machine learning components for agent performance
 * forecasting, predictive analytics, and model serving infrastructure.
 */

export {
  FeatureEngineering,
  type FeatureSet,
  type AgentPerformanceFeatures,
  type WorkflowFeatures,
  type TimeSeriesFeatures,
  type EnvironmentalFeatures,
  type FeatureMetadata
} from './FeatureEngineering';

export {
  PredictiveModels,
  LinearRegressionModel,
  RandomForestModel,
  type Prediction,
  type PredictionRequest,
  type PredictionResults,
  type ModelInfo,
  type ModelTrainingData,
  type ModelPerformanceMetrics,
  type EnsembleModel,
  PredictionType
} from './PredictiveModels';

export {
  MLPipeline,
  type PipelineConfig,
  type TrainingJob,
  type TrainingLog,
  type ModelVersion,
  type ABTestResults,
  type PipelineMetrics
} from './MLPipeline';

export {
  ModelServingEngine,
  type ServingConfig,
  type ModelEndpoint,
  type EndpointMetrics,
  type BatchPredictionJob,
  type PredictionCache,
  type ServingMetrics,
  type ModelRegistry
} from './ModelServingEngine';

export {
  CostTracker,
  type CostAllocation,
  type ResourceCost,
  type ResourceUsageMetrics,
  type CostBreakdown,
  type CostSummary,
  type CostItem,
  type CostDriver,
  type CostTrend,
  type BillingPeriod,
  type CostThreshold,
  type CostAlert,
  type CostOptimization,
  CostType,
  CostCategory,
  ResourceType,
  ThresholdType,
  OptimizationType
} from './CostTracker';

export {
  ROICalculator,
  type ROIMetrics,
  type OperationalSavings,
  type ProductivityGains,
  type BusinessMetrics,
  type ROICalculation,
  type ROIBreakdown,
  type ROISavingsItem,
  type ROICostItem,
  type ROIRiskItem,
  type ROIAssumptions,
  type ROIComparison,
  type ROITrend,
  type ROIForecast,
  type ROIForecastFactor,
  ROICalculationType,
  SavingsCategory
} from './ROICalculator';

export {
  BudgetManager,
  type Budget,
  type BudgetCategory,
  type BudgetAllocation,
  type BudgetThreshold,
  type ThresholdAction,
  type BudgetApproval,
  type BudgetForecast,
  type ForecastFactor,
  type ForecastScenario,
  type ForecastRecommendation,
  type BudgetReport,
  type BudgetSummary,
  type CategoryBreakdown,
  type BudgetAlert,
  type BudgetVariance,
  type BudgetRecommendation,
  BudgetStatus,
  AllocationResourceType,
  AllocationPriority,
  AllocationStatus,
  AlertLevel,
  ActionType,
  ApprovalStatus,
  ApprovalLevel
} from './BudgetManager';

export {
  CostReportGenerator,
  type CostReport,
  type ReportTemplate,
  type ReportSection,
  type ReportLayout,
  type ReportFormatting,
  type ReportData,
  type ReportVisualization,
  type ReportInsight,
  type ReportRecommendation,
  type ReportMetadata,
  type ReportDelivery,
  ReportType,
  SectionType,
  VisualizationType,
  InsightType,
  RecommendationType,
  ImpactLevel,
  EffortLevel,
  PriorityLevel,
  DeliveryFormat,
  DeliveryChannel,
  DeliveryStatus
} from './CostReportGenerator';

// Automated Reporting System
export {
  ReportGenerator,
  type ExecutiveReport,
  type ExecutiveTemplate,
  type ExecutiveSummary,
  type KeyMetric,
  type ExecutiveMetrics,
  type FinancialMetrics,
  type OperationalMetrics,
  type PerformanceMetrics,
  type QualityMetrics,
  type StrategicMetrics,
  type ExecutiveInsight,
  type ExecutiveRecommendation,
  type ReportAttachment,
  type ExecutiveMetadata,
  type ReportGenerationConfig,
  ExecutiveReportType,
  ReportPeriod,
  ExportFormat,
  AnalysisDepth,
  MetricCategory,
  TrendDirection,
  ImportanceLevel,
  InsightCategory,
  RecommendationCategory,
  ReportStatus,
  AttachmentType
} from './ReportGenerator';

export {
  ExecutiveSummaryGenerator,
  type SummaryGenerationConfig,
  type SummaryTemplate,
  type BusinessContext,
  type IndustryBenchmark,
  type StrategicGoal,
  type BusinessRisk,
  type SummaryAnalytics,
  type SummaryPersonalization,
  type DashboardMetric,
  type ExecutiveAlert,
  SummaryFocusArea,
  AudienceLevel,
  SummaryDetailLevel,
  TimeHorizon,
  PresentationTone,
  LanguageStyle,
  EmphasisArea,
  GoalStatus,
  RiskCategory,
  RiskStatus,
  ExecutiveRole,
  CommunicationStyle
} from './ExecutiveSummary';

export {
  ReportScheduler,
  type ScheduledReport,
  type ReportSchedule,
  type ScheduleExecution,
  type DistributionConfig,
  type ReportRecipient,
  type DistributionResult,
  type ExecutionError,
  type ExecutionMetrics,
  type ScheduleStatistics,
  ScheduleType,
  ScheduleFrequency,
  DayOfWeek,
  DistributionChannel,
  RecipientRole,
  NotificationChannel,
  SchedulePriority,
  ExecutionStatus,
  DeliveryStatus,
  ErrorSeverity
} from './ReportScheduler';

export {
  ReportDistribution,
  type DeliveryRequest,
  type ChannelConfig,
  type ChannelConfiguration,
  type SMTPConfig,
  type SlackConfig,
  type TeamsConfig,
  type WebhookConfig,
  type CloudStorageConfig,
  type APIConfig,
  type DeliveryTracking,
  type DeliveryEvent,
  type NotificationRequest,
  type DistributionAnalytics,
  type ChannelPerformance,
  type RecipientEngagement,
  type ErrorAnalysis,
  DeliveryPriority,
  CloudProvider,
  SlackMessageFormat,
  NotificationPriority,
  DeliveryEventType
} from './ReportDistribution';

// A/B Testing and Performance Optimization
export {
  ABTestingFramework,
  type ExperimentConfig,
  type ExperimentVariant,
  type TrafficAllocation,
  type TargetMetric,
  type SegmentationRule,
  type ExclusionRule,
  type InclusionRule,
  type ExperimentResult,
  type StatisticalAnalysis,
  type VariantStats,
  type ConfidenceInterval,
  type EffectSize,
  type ExperimentStatus,
  type ExperimentIssue,
  ExperimentState,
  AllocationStrategy,
  RandomizationUnit,
  MetricType,
  AggregationType,
  StatisticalTest,
  MetricDirection,
  IssueType,
  IssueSeverity
} from './ABTestingFramework';

export {
  ExperimentManager,
  type ExperimentTemplate,
  type TemplateVariant,
  type TemplateMetric,
  type ExperimentPlan,
  type RiskAssessment,
  type Risk,
  type Mitigation,
  type ExperimentMonitoring,
  type ExperimentAlert,
  type HealthCheck,
  type AutomatedAction,
  ExperimentCategory,
  ExperimentComplexity,
  MetricImportance,
  RiskLevel,
  RiskType,
  AlertType,
  AlertSeverity,
  HealthStatus,
  MonitoringStatus,
  ActionTrigger,
  ActionType
} from './ExperimentManager';

export {
  StatisticalAnalyzer,
  type StatisticalAnalysis as DetailedStatisticalAnalysis,
  type VariantStats as DetailedVariantStats,
  type TestResults,
  type EffectSize as DetailedEffectSize,
  type ConfidenceInterval as DetailedConfidenceInterval,
  type Percentiles,
  type Recommendation,
  type Warning,
  type AnalysisMetadata,
  type DateRange,
  type OutlierTreatment,
  type AssumptionChecks,
  type AssumptionCheck,
  type DataQualityMetrics,
  type BayesianAnalysis,
  type Distribution,
  type CredibleInterval,
  type SequentialAnalysis,
  StatisticalTest as DetailedStatisticalTest,
  EffectSizeInterpretation,
  RecommendedAction,
  ConfidenceLevel,
  WarningType,
  WarningSeverity,
  OutlierMethod,
  DistributionType,
  BoundaryType,
  SequentialAction
} from './StatisticalAnalyzer';

export {
  PerformanceOptimizer,
  type PerformanceMetrics,
  type ResourceUtilization,
  type OptimizationRecommendation,
  type ExpectedImpact,
  type ImpactMetric,
  type ImplementationGuide,
  type ImplementationStep,
  type RiskAssessment as OptimizationRiskAssessment,
  type Risk as OptimizationRisk,
  type Mitigation as OptimizationMitigation,
  type ValidationPlan,
  type ValidationMetric,
  type ValidationTest,
  type SuccessCriteria,
  type Criterion,
  type EffortEstimate,
  type RecommendationMetadata,
  type PerformanceAlert,
  type PerformanceBaseline,
  type BaselineMetrics,
  type StatisticalSummary,
  type ResourceBaseline,
  type TimeRange,
  type OptimizationResult,
  OptimizationCategory,
  OptimizationPriority,
  ImpactLevel,
  RiskLevel as OptimizationRiskLevel,
  RiskType as OptimizationRiskType,
  MetricDirection as OptimizationMetricDirection,
  TestType,
  ComparisonOperator,
  ComplexityLevel,
  RecommendationSource,
  AlertType as PerformanceAlertType,
  AlertSeverity as PerformanceAlertSeverity,
  TrendDirection,
  EntityType
} from './PerformanceOptimizer';

// Main Analytics Service that orchestrates all components
export class AnalyticsService {
  public featureEngineering: FeatureEngineering;
  public predictiveModels: PredictiveModels;
  public mlPipeline: MLPipeline;
  public modelServing: ModelServingEngine;
  public costTracker: CostTracker;
  public roiCalculator: ROICalculator;
  public budgetManager: BudgetManager;
  public costReportGenerator: CostReportGenerator;
  // Automated Reporting System
  public reportGenerator: ReportGenerator;
  public executiveSummaryGenerator: ExecutiveSummaryGenerator;
  public reportScheduler: ReportScheduler;
  public reportDistribution: ReportDistribution;
  // A/B Testing and Performance Optimization
  public abTestingFramework: ABTestingFramework;
  public experimentManager: ExperimentManager;
  public statisticalAnalyzer: StatisticalAnalyzer;
  public performanceOptimizer: PerformanceOptimizer;

  constructor(config?: {
    servingConfig?: any;
    prisma?: any;
    redis?: any;
    costingRules?: Record<string, any>;
    defaultCurrency?: string;
    distributionChannels?: any[];
    maxConcurrentDeliveries?: number;
    maxConcurrentExecutions?: number;
  }) {
    this.featureEngineering = new FeatureEngineering(config?.prisma);
    this.predictiveModels = new PredictiveModels();
    this.mlPipeline = new MLPipeline(config?.prisma);
    this.modelServing = new ModelServingEngine(
      config?.servingConfig || this.getDefaultServingConfig(),
      config?.prisma,
      config?.redis
    );

    // Initialize cost tracking and ROI components
    this.costTracker = new CostTracker({
      redis: config?.redis,
      prisma: config?.prisma,
      costingRules: config?.costingRules,
      defaultCurrency: config?.defaultCurrency
    });

    this.roiCalculator = new ROICalculator({
      redis: config?.redis,
      prisma: config?.prisma,
      costTracker: this.costTracker
    });

    this.budgetManager = new BudgetManager({
      redis: config?.redis,
      prisma: config?.prisma,
      costTracker: this.costTracker,
      defaultCurrency: config?.defaultCurrency
    });

    this.costReportGenerator = new CostReportGenerator({
      redis: config?.redis,
      prisma: config?.prisma,
      costTracker: this.costTracker,
      roiCalculator: this.roiCalculator,
      budgetManager: this.budgetManager
    });

    // Initialize automated reporting system
    this.reportGenerator = new ReportGenerator({
      prisma: config?.prisma,
      redis: config?.redis,
      costTracker: this.costTracker,
      roiCalculator: this.roiCalculator,
      budgetManager: this.budgetManager,
      costReportGenerator: this.costReportGenerator
    });

    this.executiveSummaryGenerator = new ExecutiveSummaryGenerator({
      prisma: config?.prisma,
      redis: config?.redis
    });

    this.reportDistribution = new ReportDistribution({
      prisma: config?.prisma,
      redis: config?.redis,
      channelConfigs: config?.distributionChannels || [],
      maxConcurrentDeliveries: config?.maxConcurrentDeliveries
    });

    this.reportScheduler = new ReportScheduler({
      prisma: config?.prisma,
      redis: config?.redis,
      reportGenerator: this.reportGenerator,
      summaryGenerator: this.executiveSummaryGenerator,
      distribution: this.reportDistribution,
      maxConcurrentExecutions: config?.maxConcurrentExecutions
    });

    // Initialize A/B testing and performance optimization
    this.abTestingFramework = new ABTestingFramework({
      redis: config?.redis,
      prisma: config?.prisma
    });

    this.statisticalAnalyzer = new StatisticalAnalyzer({
      redis: config?.redis,
      prisma: config?.prisma
    });

    this.performanceOptimizer = new PerformanceOptimizer({
      redis: config?.redis,
      prisma: config?.prisma
    });

    this.experimentManager = new ExperimentManager({
      redis: config?.redis,
      prisma: config?.prisma
    });
  }

  /**
   * Initialize all analytics services
   */
  async initialize(): Promise<void> {
    await this.modelServing.start();
    // Cost tracking components initialize automatically

    // Initialize automated reporting system
    await this.reportDistribution.initialize();
    await this.reportScheduler.initialize();

    // A/B testing and performance optimization components initialize automatically
    // Background monitoring starts in their constructors
  }

  /**
   * Shutdown all analytics services
   */
  async shutdown(): Promise<void> {
    await this.modelServing.stop();
    await this.costTracker.destroy();
    await this.roiCalculator.destroy();
    await this.budgetManager.destroy();
    await this.costReportGenerator.destroy();

    // Shutdown automated reporting system
    // Note: ReportScheduler and ReportDistribution cleanup handled by their destructors

    // Shutdown A/B testing and performance optimization
    await this.abTestingFramework.destroy();
    await this.experimentManager.destroy();
    await this.statisticalAnalyzer.destroy();
    await this.performanceOptimizer.destroy();
  }

  /**
   * Get default serving configuration
   */
  private getDefaultServingConfig() {
    return {
      maxConcurrentRequests: 100,
      requestTimeoutMs: 30000,
      cacheSettings: {
        enabled: true,
        ttlSeconds: 300,
        maxEntries: 1000
      },
      loadBalancing: {
        strategy: 'least_loaded',
        healthCheckInterval: 30000
      },
      monitoring: {
        metricsInterval: 60000,
        alertThresholds: {
          errorRate: 0.05,
          responseTime: 1000,
          queueDepth: 50
        }
      },
      autoscaling: {
        enabled: true,
        minInstances: 1,
        maxInstances: 10,
        targetUtilization: 70
      }
    };
  }
}

export default AnalyticsService;