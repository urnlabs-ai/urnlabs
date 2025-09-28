export * from './types';
export { FeatureFlagClientImpl as FeatureFlagClient } from './client';
export { default as FeatureFlagClientImpl } from './client';

// Re-export commonly used types and enums
export {
  FlagState,
  TargetingStrategy,
  Environment,
  type FlagConfig,
  type EvaluationContext,
  type FlagEvaluationResult,
  type FeatureFlagClient,
  type FeatureFlagMetrics,
  type CanaryDeploymentConfig
} from './types';