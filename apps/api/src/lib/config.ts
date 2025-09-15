import { z } from 'zod';

const envSchema = z.object({
  // Server configuration
  NODE_ENV: z.enum(['development', 'staging', 'production']).default('development'),
  PORT: z.preprocess(
    () => process.env.PORT || process.env.API_PORT,
    z.coerce.number().default(3000)
  ),
  HOST: z.preprocess(
    () => process.env.HOST ?? (process.env.NODE_ENV === 'development' ? '0.0.0.0' : 'localhost'),
    z.string()
  ),
  
  // Database
  DATABASE_URL: z.string().refine(val => {
    try {
      new URL(val);
      return true;
    } catch {
      return false;
    }
  }, { message: 'Invalid database URL' }),
  DATABASE_POOL_SIZE: z.coerce.number().default(10),
  
  // Authentication
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default('7d'),
  BCRYPT_SALT_ROUNDS: z.coerce.number().default(12),
  
  // CORS
  CORS_ORIGINS: z.string()
    .default('http://localhost:4321,http://localhost:3000')
    .transform(val => val.split(',').map(s => s.trim()).filter(Boolean)),
  
  // Rate limiting
  RATE_LIMIT_MAX: z.coerce.number().default(100),
  RATE_LIMIT_WINDOW: z.string().default('15 minutes'),
  
  // External services
  GITHUB_TOKEN: z.string().optional(),
  SLACK_BOT_TOKEN: z.string().optional(),
  SLACK_TEAM_ID: z.string().optional(),
  
  // Monitoring
  MONITORING_API_KEY: z.string().optional(),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  READINESS_REQUIRE_SCHEMA: z.preprocess(
    () => process.env.READINESS_REQUIRE_SCHEMA ?? (process.env.NODE_ENV === 'development' ? 'true' : 'false'),
    z.coerce.boolean()
  ),
  
  // AI Agent configuration
  CLAUDE_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  AGENT_QUEUE_CONCURRENCY: z.coerce.number().default(5),
  
  // Redis (for caching and queues)
  REDIS_URL: z.string().refine(val => {
    try {
      new URL(val);
      return true;
    } catch {
      return false;
    }
  }, { message: 'Invalid Redis URL' }).optional(),
  
  // Email service
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  
  // File storage
  S3_BUCKET: z.string().optional(),
  S3_REGION: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
});

function validateEnv() {
  try {
    return envSchema.parse(process.env);
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('❌ Environment validation failed:');
      error.errors.forEach(err => {
        console.error(`- ${err.path.join('.')}: ${err.message} (${err.code})`);
      });
      console.error('\n📋 Required variables:');
      console.error('- DATABASE_URL: PostgreSQL connection string');
      console.error('- JWT_SECRET: Secret key for JWT tokens (minimum 32 characters)');
      console.error('\n📋 Optional variables:');
      console.error('- GITHUB_TOKEN: For GitHub integration');
      console.error('- SLACK_BOT_TOKEN: For Slack notifications');
      console.error('- CLAUDE_API_KEY: For Claude AI integration');
      console.error('- REDIS_URL: For caching and queues');

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
  githubIntegration: Boolean(config.GITHUB_TOKEN),
  slackNotifications: Boolean(config.SLACK_BOT_TOKEN),
  claudeIntegration: Boolean(config.CLAUDE_API_KEY),
  redisCache: Boolean(config.REDIS_URL),
  emailNotifications: Boolean(config.SMTP_HOST && config.SMTP_USER),
  fileUploads: Boolean(config.S3_BUCKET && config.S3_ACCESS_KEY_ID),
} as const;

// Database configuration
export const databaseConfig = {
  url: config.DATABASE_URL,
  poolSize: config.DATABASE_POOL_SIZE,
  ssl: isProduction ? { rejectUnauthorized: false } : false,
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
