export { PatternAnalyzer } from './PatternAnalyzer.js';
export type {
  WorkflowPattern,
  CachePattern,
  PatternAnalysisConfig
} from './PatternAnalyzer.js';

export { IntelligentCacheManager } from './IntelligentCacheManager.js';
export type {
  CacheConfig,
  CacheEntry,
  CacheMetrics,
  CacheOperation
} from './IntelligentCacheManager.js';

export { CacheWarmer } from './CacheWarmer.js';
export type {
  WarmupStrategy,
  WarmupTask,
  WarmupConfig,
  ComputedWarmupValue
} from './CacheWarmer.js';

export { CacheOptimizer } from './CacheOptimizer.js';
export type {
  OptimizationRule,
  OptimizationMetrics,
  OptimizationRecommendation,
  OptimizationSession
} from './CacheOptimizer.js';

// Dynamic Resource Allocation Engine exports
export { ResourceAllocationEngine } from './ResourceAllocationEngine.js';
export type {
  AllocationRequest,
  AllocationResult,
  AllocationStrategy,
  ResourceConstraint,
  AllocationMetrics,
  AllocationHistory,
  ConstraintViolation
} from './ResourceAllocationEngine.js';

export { AgentPoolManager } from './AgentPoolManager.js';
export type {
  PoolConfiguration,
  PoolMetrics,
  PoolEvent,
  ScalingPolicy,
  HealthCheckConfig,
  AgentHealthStatus,
  PoolStatus
} from './AgentPoolManager.js';

export { LoadBalancer } from './LoadBalancer.js';
export type {
  LoadBalancingAlgorithm,
  RoutingDecision,
  RoutingConstraint,
  LoadBalancingConfig,
  LoadBalancingMetrics,
  CircuitBreakerConfig,
  CircuitBreakerState,
  RebalanceResult
} from './LoadBalancer.js';

export { PerformanceOptimizer } from './PerformanceOptimizer.js';
export type {
  OptimizationStrategy,
  OptimizationConfig,
  OptimizationRecommendation,
  OptimizationResult,
  PerformanceBaseline,
  OptimizationTrigger,
  TaskCompletionMetrics
} from './PerformanceOptimizer.js';

export { ResourceMetricsCollector } from './ResourceMetricsCollector.js';
export type {
  MetricType,
  PerformanceMetric,
  SystemMetric,
  ApplicationMetric,
  AgentMetric,
  MetricsSummary,
  AlertRule,
  AlertConfig,
  AlertSeverity,
  Alert
} from './ResourceMetricsCollector.js';

// Workload Prediction and Auto-Scaling Intelligence exports
export { TimeSeriesAnalyzer } from './TimeSeriesAnalyzer.js';
export type {
  TimeSeries,
  TimeSeriesDataPoint,
  TimeSeriesAnalysisResult,
  SeasonalDecomposition,
  TrendAnalysis,
  SeasonalityAnalysis,
  AnomalyDetectionResult,
  ForecastResult,
  ForecastModelType,
  AnalysisConfig
} from './TimeSeriesAnalyzer.js';

export { WorkloadPredictionService } from './WorkloadPredictionService.js';
export type {
  HistoricalWorkloadData,
  WorkflowExecution,
  WorkloadPredictionResult,
  DemandForecast,
  ResourceRequirementPrediction,
  WorkloadTrend,
  CapacityBottleneck,
  PredictionMetrics,
  PredictionConfig,
  PredictionQuality
} from './WorkloadPredictionService.js';

export { CapacityPlanner } from './CapacityPlanner.js';
export type {
  ResourceCapacity,
  CapacityConstraints,
  CapacityPlan,
  CapacityRecommendation,
  ResourceRequirement,
  ScalingTrigger,
  CostOptimization,
  CapacityMetrics,
  CapacityPlanningConfig,
  CapacityExhaustionPrediction
} from './CapacityPlanner.js';

export { PredictiveScaler } from './PredictiveScaler.js';
export type {
  ScalingMetrics,
  ScalingDecision,
  ScalingAction,
  ScalingConfig,
  PredictiveScalingConfig,
  ScalingRule,
  ScalingTrigger as ScalerTrigger,
  ScalingMetadata,
  ScalingHistory,
  ScalingEffectiveness
} from './PredictiveScaler.js';

// Re-export core types and utilities
export { logger } from '../core/Logger.js';