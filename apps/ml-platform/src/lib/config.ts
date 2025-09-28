import { z } from 'zod';

const configSchema = z.object({
  // Server Configuration
  NODE_ENV: z.enum(['development', 'staging', 'production']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().default(7005),
  
  // Database Configuration
  DATABASE_URL: z.string().optional(),
  
  // Redis Configuration
  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.coerce.number().default(6379),
  REDIS_PASSWORD: z.string().optional(),
  
  // AI Provider API Keys
  OPENAI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  GOOGLE_API_KEY: z.string().optional(),
  COHERE_API_KEY: z.string().optional(),
  HUGGING_FACE_API_KEY: z.string().optional(),
  
  // Vector Database Configuration
  PINECONE_API_KEY: z.string().optional(),
  PINECONE_ENVIRONMENT: z.string().optional(),
  QDRANT_URL: z.string().optional(),
  QDRANT_API_KEY: z.string().optional(),
  WEAVIATE_URL: z.string().optional(),
  WEAVIATE_API_KEY: z.string().optional(),
  
  // Ollama Configuration
  OLLAMA_HOST: z.string().optional(),
  
  // MLOps Configuration
  WANDB_API_KEY: z.string().optional(),
  MLFLOW_TRACKING_URI: z.string().optional(),
  
  // Storage Configuration
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  AWS_REGION: z.string().default('us-east-1'),
  S3_BUCKET: z.string().optional(),
  
  // Monitoring Configuration
  PROMETHEUS_PORT: z.coerce.number().default(9090),
  GRAFANA_URL: z.string().optional(),
  
  // Security Configuration
  JWT_SECRET: z.string().optional(),
  ENCRYPTION_KEY: z.string().optional(),
  
  // Feature Flags
  ENABLE_FINE_TUNING: z.coerce.boolean().default(true),
  ENABLE_CUSTOM_TRAINING: z.coerce.boolean().default(true),
  ENABLE_AUTO_SCALING: z.coerce.boolean().default(false),
  ENABLE_METRICS_COLLECTION: z.coerce.boolean().default(true),
  
  // Rate Limiting
  MAX_REQUESTS_PER_MINUTE: z.coerce.number().default(1000),
  MAX_CONCURRENT_JOBS: z.coerce.number().default(10),
  
  // Model Configuration
  DEFAULT_EMBEDDING_MODEL: z.string().default('text-embedding-3-small'),
  DEFAULT_CHAT_MODEL: z.string().default('gpt-3.5-turbo'),
  DEFAULT_TEMPERATURE: z.coerce.number().default(0.7),
  DEFAULT_MAX_TOKENS: z.coerce.number().default(1000),
  
  // Pipeline Configuration
  MAX_DATASET_SIZE_MB: z.coerce.number().default(100),
  MAX_TRAINING_TIME_HOURS: z.coerce.number().default(24),
  MAX_QUEUE_SIZE: z.coerce.number().default(100),
  
  // Cache Configuration
  CACHE_TTL_SECONDS: z.coerce.number().default(3600),
  ENABLE_RESPONSE_CACHING: z.coerce.boolean().default(true),
  
  // Logging Configuration
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  LOG_FORMAT: z.enum(['json', 'pretty']).default('json'),
  
  // Health Check Configuration
  HEALTH_CHECK_INTERVAL_MS: z.coerce.number().default(30000),
  HEALTH_CHECK_TIMEOUT_MS: z.coerce.number().default(5000),
});

// Parse and validate environment variables
const parseConfig = () => {
  try {
    const config = configSchema.parse(process.env);
    
    // Validate required configurations based on environment
    if (config.NODE_ENV === 'production') {
      if (!config.DATABASE_URL) {
        throw new Error('DATABASE_URL is required in production');
      }
      if (!config.JWT_SECRET) {
        throw new Error('JWT_SECRET is required in production');
      }
      if (!config.ENCRYPTION_KEY) {
        throw new Error('ENCRYPTION_KEY is required in production');
      }
    }
    
    // Warn about missing API keys
    const providerKeys = [
      'OPENAI_API_KEY',
      'ANTHROPIC_API_KEY',
      'GOOGLE_API_KEY',
      'COHERE_API_KEY',
      'HUGGING_FACE_API_KEY'
    ];
    
    const availableProviders = providerKeys.filter(key => config[key as keyof typeof config]);
    if (availableProviders.length === 0) {
      console.warn('⚠️  No AI provider API keys configured. Some features will be unavailable.');
    }
    
    const vectorDatabases = [
      'PINECONE_API_KEY',
      'QDRANT_URL',
      'WEAVIATE_URL'
    ];
    
    const availableVectorDBs = vectorDatabases.filter(key => config[key as keyof typeof config]);
    if (availableVectorDBs.length === 0) {
      console.warn('⚠️  No vector database configured. Vector search features will be unavailable.');
    }
    
    return config;
  } catch (error) {
    console.error('❌ Configuration validation failed:', error);
    process.exit(1);
  }
};

export const config = parseConfig();

// Export configuration helpers
export const isProduction = () => config.NODE_ENV === 'production';
export const isDevelopment = () => config.NODE_ENV === 'development';
export const isStaging = () => config.NODE_ENV === 'staging';

export const getRedisConfig = () => ({
  host: config.REDIS_HOST,
  port: config.REDIS_PORT,
  password: config.REDIS_PASSWORD,
});

export const getProviderConfigs = () => ({
  openai: {
    enabled: !!config.OPENAI_API_KEY,
    apiKey: config.OPENAI_API_KEY,
  },
  anthropic: {
    enabled: !!config.ANTHROPIC_API_KEY,
    apiKey: config.ANTHROPIC_API_KEY,
  },
  google: {
    enabled: !!config.GOOGLE_API_KEY,
    apiKey: config.GOOGLE_API_KEY,
  },
  cohere: {
    enabled: !!config.COHERE_API_KEY,
    apiKey: config.COHERE_API_KEY,
  },
  huggingface: {
    enabled: !!config.HUGGING_FACE_API_KEY,
    apiKey: config.HUGGING_FACE_API_KEY,
  },
  ollama: {
    enabled: !!config.OLLAMA_HOST,
    host: config.OLLAMA_HOST,
  },
});

export const getVectorDBConfigs = () => ({
  pinecone: {
    enabled: !!(config.PINECONE_API_KEY && config.PINECONE_ENVIRONMENT),
    apiKey: config.PINECONE_API_KEY,
    environment: config.PINECONE_ENVIRONMENT,
  },
  qdrant: {
    enabled: !!config.QDRANT_URL,
    url: config.QDRANT_URL,
    apiKey: config.QDRANT_API_KEY,
  },
  weaviate: {
    enabled: !!config.WEAVIATE_URL,
    url: config.WEAVIATE_URL,
    apiKey: config.WEAVIATE_API_KEY,
  },
});

export const getStorageConfig = () => ({
  aws: {
    enabled: !!(config.AWS_ACCESS_KEY_ID && config.AWS_SECRET_ACCESS_KEY),
    accessKeyId: config.AWS_ACCESS_KEY_ID,
    secretAccessKey: config.AWS_SECRET_ACCESS_KEY,
    region: config.AWS_REGION,
    bucket: config.S3_BUCKET,
  },
});

export const getMLOpsConfig = () => ({
  wandb: {
    enabled: !!config.WANDB_API_KEY,
    apiKey: config.WANDB_API_KEY,
  },
  mlflow: {
    enabled: !!config.MLFLOW_TRACKING_URI,
    trackingUri: config.MLFLOW_TRACKING_URI,
  },
});

// Resource limits
export const getResourceLimits = () => ({
  maxDatasetSizeMB: config.MAX_DATASET_SIZE_MB,
  maxTrainingTimeHours: config.MAX_TRAINING_TIME_HOURS,
  maxQueueSize: config.MAX_QUEUE_SIZE,
  maxConcurrentJobs: config.MAX_CONCURRENT_JOBS,
  maxRequestsPerMinute: config.MAX_REQUESTS_PER_MINUTE,
});

// Default model configurations
export const getDefaultModelConfig = () => ({
  embeddingModel: config.DEFAULT_EMBEDDING_MODEL,
  chatModel: config.DEFAULT_CHAT_MODEL,
  temperature: config.DEFAULT_TEMPERATURE,
  maxTokens: config.DEFAULT_MAX_TOKENS,
});

// Cache configuration
export const getCacheConfig = () => ({
  ttlSeconds: config.CACHE_TTL_SECONDS,
  enableResponseCaching: config.ENABLE_RESPONSE_CACHING,
});

// Feature flags
export const getFeatureFlags = () => ({
  enableFineTuning: config.ENABLE_FINE_TUNING,
  enableCustomTraining: config.ENABLE_CUSTOM_TRAINING,
  enableAutoScaling: config.ENABLE_AUTO_SCALING,
  enableMetricsCollection: config.ENABLE_METRICS_COLLECTION,
});

// Health check configuration
export const getHealthCheckConfig = () => ({
  intervalMs: config.HEALTH_CHECK_INTERVAL_MS,
  timeoutMs: config.HEALTH_CHECK_TIMEOUT_MS,
});

export type Config = typeof config;