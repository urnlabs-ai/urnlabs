export interface ModelProvider {
  id: string;
  name: string;
  type: 'openai' | 'anthropic' | 'google' | 'ollama' | 'huggingface' | 'cohere';
  endpoint?: string;
  apiKey?: string;
  models: ModelInfo[];
  isActive: boolean;
  capabilities: ModelCapability[];
}

export interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  type: 'text' | 'embedding' | 'multimodal' | 'code' | 'chat';
  contextLength: number;
  inputCost?: number; // per 1K tokens
  outputCost?: number; // per 1K tokens
  capabilities: ModelCapability[];
  metadata?: Record<string, any>;
}

export type ModelCapability =
  | 'text-generation'
  | 'text-completion'
  | 'embeddings'
  | 'image-understanding'
  | 'code-generation'
  | 'function-calling'
  | 'fine-tuning'
  | 'streaming';

export interface ModelRequest {
  model: string;
  provider?: string;
  messages?: ChatMessage[];
  prompt?: string;
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
  functions?: ModelFunction[];
  systemPrompt?: string;
  metadata?: Record<string, any>;
}

export interface ModelResponse {
  id: string;
  model: string;
  provider: string;
  content: string;
  usage: TokenUsage;
  finishReason: 'stop' | 'length' | 'function_call' | 'content_filter';
  functionCall?: FunctionCall;
  metadata?: Record<string, any>;
  timestamp: Date;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'function';
  content: string;
  name?: string;
  functionCall?: FunctionCall;
}

export interface ModelFunction {
  name: string;
  description: string;
  parameters: Record<string, any>;
}

export interface FunctionCall {
  name: string;
  arguments: string;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cost?: number;
}

// Fine-tuning Types
export interface FineTuningJob {
  id: string;
  model: string;
  provider: string;
  dataset: Dataset;
  hyperparameters: HyperParameters;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  progress?: number;
  metrics?: TrainingMetrics;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
}

export interface Dataset {
  id: string;
  name: string;
  type: 'text' | 'conversation' | 'classification' | 'completion';
  path: string;
  size: number;
  samples: number;
  format: 'jsonl' | 'csv' | 'json';
  validation?: DatasetValidation;
  metadata?: Record<string, any>;
}

export interface HyperParameters {
  learningRate?: number;
  batchSize?: number;
  epochs?: number;
  warmupSteps?: number;
  weightDecay?: number;
  gradient_accumulation_steps?: number;
  [key: string]: any;
}

export interface TrainingMetrics {
  loss: number;
  accuracy?: number;
  perplexity?: number;
  bleu?: number;
  rouge?: number;
  f1?: number;
  precision?: number;
  recall?: number;
  custom_metrics?: Record<string, number>;
}

export interface DatasetValidation {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  statistics: {
    avgLength: number;
    minLength: number;
    maxLength: number;
    uniqueSamples: number;
  };
}

// Vector Database Types
export interface VectorDatabase {
  type: 'pinecone' | 'qdrant' | 'weaviate' | 'chroma';
  config: VectorDatabaseConfig;
  isConnected: boolean;
}

export interface VectorDatabaseConfig {
  endpoint: string;
  apiKey?: string;
  indexName?: string;
  dimensions?: number;
  metric?: 'cosine' | 'euclidean' | 'dotproduct';
}

export interface EmbeddingModel {
  id: string;
  provider: string;
  dimensions: number;
  maxTokens: number;
  cost: number; // per 1K tokens
}

export interface VectorDocument {
  id: string;
  content: string;
  embedding?: number[];
  metadata: Record<string, any>;
  score?: number;
}

export interface VectorSearchQuery {
  query: string;
  embedding?: number[];
  filter?: Record<string, any>;
  topK?: number;
  threshold?: number;
  includeMetadata?: boolean;
}

export interface VectorSearchResult {
  documents: VectorDocument[];
  query: string;
  executionTime: number;
  totalResults: number;
}

// RAG Types
export interface RAGConfig {
  embeddingModel: string;
  vectorDatabase: VectorDatabaseConfig;
  retrievalConfig: RetrievalConfig;
  generationConfig: GenerationConfig;
}

export interface RetrievalConfig {
  topK: number;
  threshold: number;
  reranking?: boolean;
  chunkSize: number;
  chunkOverlap: number;
}

export interface GenerationConfig {
  model: string;
  temperature: number;
  maxTokens: number;
  systemPrompt?: string;
}

// Agent Orchestration Types
export interface AgentWorkflow {
  id: string;
  name: string;
  description: string;
  agents: WorkflowAgent[];
  connections: AgentConnection[];
  status: 'draft' | 'active' | 'paused' | 'completed' | 'failed';
  metadata?: Record<string, any>;
}

export interface WorkflowAgent {
  id: string;
  type: 'model' | 'tool' | 'human' | 'workflow';
  config: AgentConfig;
  position: { x: number; y: number };
}

export interface AgentConfig {
  model?: string;
  prompt?: string;
  tools?: string[];
  parameters?: Record<string, any>;
  timeout?: number;
}

export interface AgentConnection {
  from: string;
  to: string;
  condition?: string;
  transform?: string;
}

export interface WorkflowExecution {
  id: string;
  workflowId: string;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  input: any;
  output?: any;
  steps: ExecutionStep[];
  startedAt: Date;
  completedAt?: Date;
  error?: string;
}

export interface ExecutionStep {
  agentId: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  input: any;
  output?: any;
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
  metrics?: StepMetrics;
}

export interface StepMetrics {
  duration: number;
  tokenUsage?: TokenUsage;
  cost?: number;
  custom?: Record<string, any>;
}

// AutoML Types
export interface AutoMLJob {
  id: string;
  name: string;
  type: 'classification' | 'regression' | 'generation' | 'optimization';
  dataset: Dataset;
  target: string;
  config: AutoMLConfig;
  status: 'pending' | 'running' | 'completed' | 'failed';
  experiments: AutoMLExperiment[];
  bestModel?: AutoMLModel;
  metrics?: AutoMLMetrics;
  createdAt: Date;
  completedAt?: Date;
}

export interface AutoMLConfig {
  maxTrials: number;
  timeout: number; // minutes
  metric: string;
  direction: 'maximize' | 'minimize';
  models: string[];
  hyperparameters?: Record<string, any>;
  validation: ValidationConfig;
}

export interface ValidationConfig {
  strategy: 'holdout' | 'cross-validation' | 'time-series';
  testSize?: number;
  folds?: number;
  randomState?: number;
}

export interface AutoMLExperiment {
  id: string;
  model: string;
  hyperparameters: Record<string, any>;
  metrics: Record<string, number>;
  status: 'pending' | 'running' | 'completed' | 'failed';
  duration?: number;
  createdAt: Date;
}

export interface AutoMLModel {
  id: string;
  name: string;
  algorithm: string;
  hyperparameters: Record<string, any>;
  metrics: AutoMLMetrics;
  path: string;
  size: number;
  createdAt: Date;
}

export interface AutoMLMetrics {
  [metric: string]: number;
}

// Monitoring Types
export interface MLMetrics {
  modelPerformance: ModelPerformanceMetrics;
  systemMetrics: SystemMetrics;
  businessMetrics: BusinessMetrics;
  timestamp: Date;
}

export interface ModelPerformanceMetrics {
  averageLatency: number;
  throughput: number;
  errorRate: number;
  accuracyDrift?: number;
  tokenUsage: TokenUsage;
  costPerRequest: number;
}

export interface SystemMetrics {
  cpuUsage: number;
  memoryUsage: number;
  diskUsage: number;
  networkIO: number;
  activeConnections: number;
}

export interface BusinessMetrics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  uniqueUsers: number;
  revenue?: number;
  costSavings?: number;
}

export interface Alert {
  id: string;
  type: 'performance' | 'error' | 'drift' | 'cost' | 'security';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  metrics: Record<string, any>;
  threshold: number;
  actualValue: number;
  timestamp: Date;
  acknowledged: boolean;
  resolvedAt?: Date;
}

// API Types
export interface APIResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  timestamp: Date;
  requestId: string;
}

export interface PaginatedResponse<T> extends APIResponse<T[]> {
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface ModelComparison {
  models: string[];
  metrics: Record<string, Record<string, number>>;
  winner?: string;
  confidence?: number;
  recommendations?: string[];
}

export interface BatchRequest {
  id: string;
  requests: ModelRequest[];
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  results?: ModelResponse[];
  createdAt: Date;
  completedAt?: Date;
}