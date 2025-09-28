export interface Integration {
  id: string;
  name: string;
  type: 'github' | 'slack' | 'jira' | 'confluence' | 'jenkins' | 'gitlab' | 'custom';
  status: 'active' | 'inactive' | 'error' | 'pending';
  config: Record<string, any>;
  credentials: Record<string, string>;
  webhookUrl?: string;
  createdAt: Date;
  updatedAt: Date;
  lastSyncAt?: Date;
}

export interface GitHubIntegration extends Integration {
  type: 'github';
  config: {
    appId: string;
    installationId: string;
    repositories: string[];
    webhookSecret: string;
    permissions: string[];
  };
}

export interface SlackIntegration extends Integration {
  type: 'slack';
  config: {
    teamId: string;
    botUserId: string;
    channels: string[];
    signingSecret: string;
    features: ('notifications' | 'commands' | 'interactive')[];
  };
}

export interface WebhookEvent {
  id: string;
  source: string;
  type: string;
  payload: Record<string, any>;
  signature?: string;
  timestamp: Date;
  processed: boolean;
  retryCount: number;
  error?: string;
}

export interface WebhookConfig {
  url: string;
  secret: string;
  events: string[];
  enabled: boolean;
  retryLimit: number;
  timeoutMs: number;
}

export interface MarketplaceConnector {
  id: string;
  name: string;
  description: string;
  version: string;
  author: string;
  category: string;
  icon: string;
  configSchema: Record<string, any>;
  supportedEvents: string[];
  installCount: number;
  rating: number;
  verified: boolean;
}

export interface IntegrationError {
  code: string;
  message: string;
  timestamp: Date;
  context?: Record<string, any>;
  stack?: string;
}

export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
}

export interface RetryConfig {
  maxAttempts: number;
  backoffMs: number;
  maxBackoffMs: number;
  retryCondition?: (error: any) => boolean;
}

export interface SecurityConfig {
  allowedOrigins: string[];
  signingSecrets: Record<string, string>;
  encryptionKey: string;
  tokenExpiryMinutes: number;
}