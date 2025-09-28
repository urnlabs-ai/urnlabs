import { z } from 'zod';

// Feature flag states
export enum FlagState {
  DISABLED = 'disabled',
  ENABLED = 'enabled',
  CANARY = 'canary',
  GRADUAL_ROLLOUT = 'gradual_rollout',
  KILL_SWITCH = 'kill_switch'
}

// Targeting strategies
export enum TargetingStrategy {
  PERCENTAGE = 'percentage',
  USER_ID = 'user_id',
  USER_ATTRIBUTE = 'user_attribute',
  IP_ADDRESS = 'ip_address',
  GEOGRAPHIC = 'geographic',
  TIME_WINDOW = 'time_window'
}

// Environment types
export enum Environment {
  DEVELOPMENT = 'development',
  STAGING = 'staging',
  PRODUCTION = 'production'
}

// Zod schemas for validation
export const FlagConfigSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  state: z.nativeEnum(FlagState),
  environment: z.nativeEnum(Environment),
  createdBy: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
  rolloutPercentage: z.number().min(0).max(100).default(0),
  targeting: z.object({
    strategy: z.nativeEnum(TargetingStrategy),
    rules: z.array(z.object({
      attribute: z.string(),
      operator: z.enum(['equals', 'not_equals', 'contains', 'greater_than', 'less_than', 'in', 'not_in']),
      value: z.union([z.string(), z.number(), z.array(z.string())]),
    })).default([]),
    userList: z.array(z.string()).default([]),
    ipWhitelist: z.array(z.string()).default([]),
  }).default({
    strategy: TargetingStrategy.PERCENTAGE,
    rules: [],
    userList: [],
    ipWhitelist: []
  }),
  metadata: z.record(z.string(), z.any()).default({}),
  isArchived: z.boolean().default(false),
  tags: z.array(z.string()).default([])
});

export const EvaluationContextSchema = z.object({
  userId: z.string().optional(),
  userAttributes: z.record(z.string(), z.any()).default({}),
  ipAddress: z.string().optional(),
  userAgent: z.string().optional(),
  environment: z.nativeEnum(Environment),
  timestamp: z.date().default(() => new Date()),
  sessionId: z.string().optional(),
  organizationId: z.string().optional()
});

export const FlagEvaluationResultSchema = z.object({
  flagName: z.string(),
  enabled: z.boolean(),
  variant: z.string().optional(),
  reason: z.string(),
  evaluatedAt: z.date(),
  trackingData: z.record(z.string(), z.any()).default({})
});

export const FlagEventSchema = z.object({
  eventType: z.enum(['flag_evaluated', 'flag_updated', 'flag_created', 'flag_deleted', 'flag_emergency_disabled']),
  flagName: z.string(),
  flagId: z.string().uuid(),
  userId: z.string().optional(),
  environment: z.nativeEnum(Environment),
  timestamp: z.date(),
  metadata: z.record(z.string(), z.any()).default({}),
  previousState: z.nativeEnum(FlagState).optional(),
  newState: z.nativeEnum(FlagState).optional()
});

// TypeScript types
export type FlagConfig = z.infer<typeof FlagConfigSchema>;
export type EvaluationContext = z.infer<typeof EvaluationContextSchema>;
export type FlagEvaluationResult = z.infer<typeof FlagEvaluationResultSchema>;
export type FlagEvent = z.infer<typeof FlagEventSchema>;

export interface FeatureFlagClient {
  evaluateFlag(flagName: string, context: EvaluationContext): Promise<FlagEvaluationResult>;
  getAllFlags(environment: Environment): Promise<FlagConfig[]>;
  getFlagConfig(flagName: string, environment: Environment): Promise<FlagConfig | null>;
  updateFlag(flagId: string, updates: Partial<FlagConfig>): Promise<FlagConfig>;
  createFlag(config: Omit<FlagConfig, 'id' | 'createdAt' | 'updatedAt'>): Promise<FlagConfig>;
  deleteFlag(flagId: string): Promise<void>;
  emergencyDisableFlag(flagName: string, environment: Environment, reason: string): Promise<void>;
}

export interface FeatureFlagMetrics {
  flagEvaluations: number;
  flagUpdates: number;
  emergencyDisables: number;
  evaluationLatency: number;
  cacheHitRate: number;
}

export interface CanaryDeploymentConfig {
  flagName: string;
  serviceName: string;
  environment: Environment;
  initialPercentage: number;
  maxPercentage: number;
  incrementPercentage: number;
  evaluationInterval: number; // seconds
  successThreshold: number; // percentage
  errorThreshold: number; // percentage
  rollbackOnFailure: boolean;
  monitoringMetrics: string[];
}