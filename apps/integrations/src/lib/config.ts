import { z } from 'zod';

const configSchema = z.object({
  // Server Configuration
  PORT: z.string().transform(Number).default('7010'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  HOST: z.string().default('0.0.0.0'),

  // Database Configuration
  DATABASE_URL: z.string(),
  REDIS_URL: z.string().default('redis://localhost:6379'),

  // GitHub App Configuration
  GITHUB_APP_ID: z.string().optional(),
  GITHUB_APP_PRIVATE_KEY: z.string().optional(),
  GITHUB_WEBHOOK_SECRET: z.string().optional(),
  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),

  // Slack Bot Configuration
  SLACK_CLIENT_ID: z.string().optional(),
  SLACK_CLIENT_SECRET: z.string().optional(),
  SLACK_SIGNING_SECRET: z.string().optional(),
  SLACK_BOT_TOKEN: z.string().optional(),
  SLACK_APP_TOKEN: z.string().optional(),

  // Security Configuration
  JWT_SECRET: z.string(),
  ENCRYPTION_KEY: z.string(),
  WEBHOOK_TIMEOUT_MS: z.string().transform(Number).default('30000'),

  // External API Keys
  JIRA_API_TOKEN: z.string().optional(),
  CONFLUENCE_API_TOKEN: z.string().optional(),
  JENKINS_API_TOKEN: z.string().optional(),
  GITLAB_ACCESS_TOKEN: z.string().optional(),

  // Rate Limiting
  RATE_LIMIT_WINDOW_MS: z.string().transform(Number).default('60000'),
  RATE_LIMIT_MAX_REQUESTS: z.string().transform(Number).default('100'),

  // Retry Configuration
  WEBHOOK_RETRY_ATTEMPTS: z.string().transform(Number).default('3'),
  WEBHOOK_RETRY_DELAY_MS: z.string().transform(Number).default('1000'),

  // Monitoring
  METRICS_ENABLED: z.string().transform(val => val === 'true').default('true'),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
});

export type Config = z.infer<typeof configSchema>;

export const config: Config = configSchema.parse(process.env);

export const isProduction = config.NODE_ENV === 'production';
export const isDevelopment = config.NODE_ENV === 'development';
export const isTest = config.NODE_ENV === 'test';

// GitHub App Configuration
export const githubConfig = {
  appId: config.GITHUB_APP_ID,
  privateKey: config.GITHUB_APP_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  webhookSecret: config.GITHUB_WEBHOOK_SECRET,
  clientId: config.GITHUB_CLIENT_ID,
  clientSecret: config.GITHUB_CLIENT_SECRET,
};

// Slack Bot Configuration
export const slackConfig = {
  clientId: config.SLACK_CLIENT_ID,
  clientSecret: config.SLACK_CLIENT_SECRET,
  signingSecret: config.SLACK_SIGNING_SECRET,
  botToken: config.SLACK_BOT_TOKEN,
  appToken: config.SLACK_APP_TOKEN,
};

// Security Configuration
export const securityConfig = {
  jwtSecret: config.JWT_SECRET,
  encryptionKey: config.ENCRYPTION_KEY,
  webhookTimeoutMs: config.WEBHOOK_TIMEOUT_MS,
};

// Rate Limiting Configuration
export const rateLimitConfig = {
  windowMs: config.RATE_LIMIT_WINDOW_MS,
  maxRequests: config.RATE_LIMIT_MAX_REQUESTS,
};

// Retry Configuration
export const retryConfig = {
  maxAttempts: config.WEBHOOK_RETRY_ATTEMPTS,
  backoffMs: config.WEBHOOK_RETRY_DELAY_MS,
  maxBackoffMs: config.WEBHOOK_RETRY_DELAY_MS * 8, // Exponential backoff max
};

// Validation helpers
export function validateGitHubConfig() {
  if (!githubConfig.appId || !githubConfig.privateKey) {
    throw new Error('GitHub App configuration is incomplete. Please set GITHUB_APP_ID and GITHUB_APP_PRIVATE_KEY.');
  }
}

export function validateSlackConfig() {
  if (!slackConfig.clientId || !slackConfig.clientSecret || !slackConfig.signingSecret) {
    throw new Error('Slack configuration is incomplete. Please set SLACK_CLIENT_ID, SLACK_CLIENT_SECRET, and SLACK_SIGNING_SECRET.');
  }
}

export function getWebhookSigningSecret(provider: string): string {
  switch (provider) {
    case 'github':
      if (!githubConfig.webhookSecret) {
        throw new Error('GitHub webhook secret not configured');
      }
      return githubConfig.webhookSecret;
    case 'slack':
      if (!slackConfig.signingSecret) {
        throw new Error('Slack signing secret not configured');
      }
      return slackConfig.signingSecret;
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}