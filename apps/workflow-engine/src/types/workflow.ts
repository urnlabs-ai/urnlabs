/**
 * Core workflow engine types and interfaces
 */

export interface WorkflowDefinition {
  id: string;
  name: string;
  version: string;
  description?: string;
  metadata?: Record<string, any>;
  parameters?: WorkflowParameter[];
  steps: WorkflowStep[];
  triggers?: WorkflowTrigger[];
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  tags?: string[];
}

export interface WorkflowStep {
  id: string;
  name: string;
  type: StepType;
  dependencies: string[];
  configuration: StepConfiguration;
  retryPolicy?: RetryPolicy;
  timeout?: number;
  condition?: StepCondition;
  onSuccess?: StepAction[];
  onFailure?: StepAction[];
  metadata?: Record<string, any>;
}

export interface WorkflowParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  required: boolean;
  defaultValue?: any;
  description?: string;
  validation?: ParameterValidation;
}

export interface ParameterValidation {
  pattern?: string;
  min?: number;
  max?: number;
  enum?: any[];
  schema?: object;
}

export interface WorkflowTrigger {
  id: string;
  type: TriggerType;
  configuration: TriggerConfiguration;
  enabled: boolean;
}

export interface WorkflowExecution {
  id: string;
  workflowId: string;
  workflowVersion: string;
  status: ExecutionStatus;
  input: Record<string, any>;
  output?: Record<string, any>;
  error?: ExecutionError;
  startedAt: Date;
  completedAt?: Date;
  executedBy: string;
  context: ExecutionContext;
  stepExecutions: StepExecution[];
  metrics: ExecutionMetrics;
  traceId: string;
}

export interface StepExecution {
  id: string;
  stepId: string;
  executionId: string;
  status: ExecutionStatus;
  input: Record<string, any>;
  output?: Record<string, any>;
  error?: ExecutionError;
  startedAt: Date;
  completedAt?: Date;
  duration?: number;
  retryCount: number;
  logs: ExecutionLog[];
  metadata?: Record<string, any>;
}

export interface ExecutionContext {
  userId: string;
  sessionId?: string;
  environment: 'development' | 'staging' | 'production';
  variables: Record<string, any>;
  secrets: Record<string, any>;
  permissions: string[];
}

export interface ExecutionMetrics {
  totalSteps: number;
  completedSteps: number;
  failedSteps: number;
  skippedSteps: number;
  totalDuration: number;
  queueTime: number;
  executionTime: number;
  resourceUsage: ResourceUsage;
}

export interface ResourceUsage {
  cpuTime: number;
  memoryUsage: number;
  networkRequests: number;
  storageOperations: number;
}

export interface ExecutionError {
  code: string;
  message: string;
  details?: Record<string, any>;
  stack?: string;
  retryable: boolean;
  category: ErrorCategory;
}

export interface ExecutionLog {
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  timestamp: Date;
  data?: Record<string, any>;
}

export interface RetryPolicy {
  maxAttempts: number;
  baseDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
  retryableErrors: string[];
  nonRetryableErrors: string[];
}

export interface StepCondition {
  type: 'expression' | 'script';
  expression: string;
  variables?: string[];
}

export interface StepAction {
  type: ActionType;
  configuration: ActionConfiguration;
}

export interface StepConfiguration {
  agentId?: string;
  function?: string;
  parameters: Record<string, any>;
  schema?: object;
  validation?: ValidationConfig;
}

export interface TriggerConfiguration {
  schedule?: CronSchedule;
  webhook?: WebhookConfig;
  event?: EventConfig;
  manual?: ManualConfig;
}

export interface ValidationConfig {
  inputSchema?: object;
  outputSchema?: object;
  validateInput: boolean;
  validateOutput: boolean;
}

export interface CronSchedule {
  expression: string;
  timezone?: string;
  enabled: boolean;
}

export interface WebhookConfig {
  url: string;
  method: string;
  headers?: Record<string, string>;
  authentication?: AuthConfig;
}

export interface EventConfig {
  eventType: string;
  filters?: Record<string, any>;
  source?: string;
}

export interface ManualConfig {
  requireApproval: boolean;
  approvers?: string[];
  metadata?: Record<string, any>;
}

export interface AuthConfig {
  type: 'bearer' | 'basic' | 'api-key';
  credentials: Record<string, string>;
}

// Enums and Types
export type StepType = 
  | 'agent-task'
  | 'http-request'
  | 'script'
  | 'condition'
  | 'loop'
  | 'parallel'
  | 'wait'
  | 'manual-approval'
  | 'data-transform'
  | 'notification';

export type TriggerType = 
  | 'schedule'
  | 'webhook'
  | 'event'
  | 'manual';

export type ExecutionStatus = 
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'paused'
  | 'waiting'
  | 'skipped';

export type ActionType = 
  | 'retry'
  | 'skip'
  | 'abort'
  | 'notify'
  | 'escalate'
  | 'rollback';

export type ActionConfiguration = Record<string, any>;

export type ErrorCategory = 
  | 'validation'
  | 'authentication'
  | 'authorization'
  | 'network'
  | 'timeout'
  | 'resource'
  | 'business'
  | 'system'
  | 'unknown';

// DAG and Execution Types
export interface DAGNode {
  id: string;
  step: WorkflowStep;
  dependencies: Set<string>;
  dependents: Set<string>;
  level: number;
}

export interface ExecutionPlan {
  levels: DAGNode[][];
  totalLevels: number;
  parallelizable: boolean;
  criticalPath: string[];
  estimatedDuration: number;
}

export interface CircuitBreakerState {
  failures: number;
  lastFailureTime?: Date;
  state: 'closed' | 'open' | 'half-open';
  nextAttemptTime?: Date;
}

export interface WorkflowVersion {
  id: string;
  workflowId: string;
  version: string;
  definition: WorkflowDefinition;
  status: 'draft' | 'active' | 'deprecated' | 'archived';
  deployedAt?: Date;
  deployedBy?: string;
  rollbackVersion?: string;
  changeLog?: string;
  testResults?: TestResult[];
}

export interface TestResult {
  testId: string;
  testName: string;
  status: 'passed' | 'failed' | 'skipped';
  duration: number;
  error?: string;
  metadata?: Record<string, any>;
}

export interface ABTestConfig {
  name: string;
  description?: string;
  trafficSplit: Record<string, number>; // version -> percentage
  startDate: Date;
  endDate?: Date;
  metrics: string[];
  successCriteria: SuccessCriteria[];
  enabled: boolean;
}

export interface SuccessCriteria {
  metric: string;
  operator: 'gt' | 'lt' | 'eq' | 'gte' | 'lte';
  value: number;
  confidence: number;
}

export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
  definition: Partial<WorkflowDefinition>;
  parameters: TemplateParameter[];
  version: string;
  author: string;
  rating?: number;
  downloads: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface TemplateParameter {
  name: string;
  description: string;
  type: string;
  required: boolean;
  defaultValue?: any;
  options?: any[];
}