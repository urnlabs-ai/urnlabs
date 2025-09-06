import { z } from 'zod';

const envSchema = z.object({
  // Server configuration
  NODE_ENV: z.enum(['development', 'staging', 'production']).default('development'),
  AGENT_SERVICE_PORT: z.coerce.number().default(3001),
  HOST: z.string().default('localhost'),
  
  // Database
  DATABASE_URL: z.string().url(),
  
  // Redis (required for agent queues)
  REDIS_URL: z.string().url(),
  
  // AI Services
  CLAUDE_API_KEY: z.string(),
  OPENAI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(), // Alternative to CLAUDE_API_KEY
  
  // Agent configuration
  AGENT_QUEUE_CONCURRENCY: z.coerce.number().default(5),
  AGENT_TASK_TIMEOUT: z.coerce.number().default(300), // seconds
  AGENT_MAX_RETRIES: z.coerce.number().default(3),
  AGENT_MEMORY_LIMIT: z.coerce.number().default(512), // MB
  
  // Queue configuration
  QUEUE_REDIS_PREFIX: z.string().default('urnlabs:agents'),
  QUEUE_DEFAULT_DELAY: z.coerce.number().default(0), // milliseconds
  QUEUE_MAX_ATTEMPTS: z.coerce.number().default(3),
  QUEUE_BACKOFF_TYPE: z.enum(['fixed', 'exponential']).default('exponential'),
  QUEUE_BACKOFF_DELAY: z.coerce.number().default(2000), // milliseconds
  
  // Monitoring
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  METRICS_ENABLED: z.boolean().default(true),
  PERFORMANCE_MONITORING: z.boolean().default(true),
  
  // Security
  JWT_SECRET: z.string().optional(),
  API_KEY_HEADER: z.string().default('X-API-Key'),
  
  // External integrations
  GITHUB_TOKEN: z.string().optional(),
  SLACK_BOT_TOKEN: z.string().optional(),
  SLACK_WEBHOOK_URL: z.string().optional(),
  
  // Feature flags
  ENABLE_WEBSOCKETS: z.boolean().default(true),
  ENABLE_REAL_TIME_MONITORING: z.boolean().default(true),
  ENABLE_WORKFLOW_CACHING: z.boolean().default(true),
  ENABLE_AGENT_LEARNING: z.boolean().default(false),
});

function validateEnv() {
  try {
    return envSchema.parse(process.env);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const missingVars = error.errors
        .filter(err => err.code === 'invalid_type')
        .map(err => err.path.join('.'));
      
      console.error('❌ Agent Service environment validation failed:');
      console.error('Missing required environment variables:', missingVars);
      console.error('\n📋 Required variables:');
      console.error('- DATABASE_URL: PostgreSQL connection string');
      console.error('- REDIS_URL: Redis connection string for queues');
      console.error('- CLAUDE_API_KEY: Anthropic Claude API key');
      console.error('\n📋 Optional variables:');
      console.error('- OPENAI_API_KEY: OpenAI API key for additional models');
      console.error('- GITHUB_TOKEN: For GitHub integration');
      console.error('- SLACK_BOT_TOKEN: For Slack notifications');
      
      process.exit(1);
    }
    throw error;
  }
}

export const config = validateEnv();

// Derived configuration
export const isDevelopment = config.NODE_ENV === 'development';
export const isProduction = config.NODE_ENV === 'production';
export const isStaging = config.NODE_ENV === 'staging';

// Feature flags
export const features = {
  websockets: config.ENABLE_WEBSOCKETS,
  realTimeMonitoring: config.ENABLE_REAL_TIME_MONITORING,
  workflowCaching: config.ENABLE_WORKFLOW_CACHING,
  agentLearning: config.ENABLE_AGENT_LEARNING,
  githubIntegration: Boolean(config.GITHUB_TOKEN),
  slackNotifications: Boolean(config.SLACK_BOT_TOKEN),
  openaiSupport: Boolean(config.OPENAI_API_KEY),
} as const;

// Agent configuration
export const agentConfig = {
  maxConcurrency: config.AGENT_QUEUE_CONCURRENCY,
  taskTimeout: config.AGENT_TASK_TIMEOUT * 1000, // Convert to milliseconds
  maxRetries: config.AGENT_MAX_RETRIES,
  memoryLimit: config.AGENT_MEMORY_LIMIT * 1024 * 1024, // Convert to bytes
} as const;

// Queue configuration
export const queueConfig = {
  redis: {
    host: new URL(config.REDIS_URL).hostname,
    port: parseInt(new URL(config.REDIS_URL).port) || 6379,
    password: new URL(config.REDIS_URL).password || undefined,
    db: 0,
    retryDelayOnFailure: 5000,
    maxRetriesPerRequest: null, // Required by BullMQ for blocking operations
  },
  prefix: config.QUEUE_REDIS_PREFIX,
  defaultJobOptions: {
    delay: config.QUEUE_DEFAULT_DELAY,
    attempts: config.QUEUE_MAX_ATTEMPTS,
    backoff: {
      type: config.QUEUE_BACKOFF_TYPE,
      delay: config.QUEUE_BACKOFF_DELAY,
    },
    removeOnComplete: 100, // Keep last 100 completed jobs
    removeOnFail: 50, // Keep last 50 failed jobs
  },
} as const;

// AI model configuration
export const modelConfig = {
  claude: {
    apiKey: config.CLAUDE_API_KEY,
    model: 'claude-3-5-sonnet-20241022',
    maxTokens: 4096,
    temperature: 0.1,
    timeout: 60000, // 60 seconds
  },
  openai: config.OPENAI_API_KEY ? {
    apiKey: config.OPENAI_API_KEY,
    model: 'gpt-4-turbo-preview',
    maxTokens: 4096,
    temperature: 0.1,
    timeout: 60000, // 60 seconds
  } : null,
} as const;

// Logging configuration
export const logConfig = {
  level: config.LOG_LEVEL,
  transport: isDevelopment
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
        },
      }
    : undefined,
} as const;