import pino from 'pino';
import { config } from './config.js';

const loggerConfig = {
  level: config.LOG_LEVEL,
  transport: config.NODE_ENV === 'development' ? {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:standard',
      ignore: 'pid,hostname',
    },
  } : undefined,
  formatters: {
    level: (label: string) => {
      return { level: label };
    },
  },
  timestamp: () => `,"timestamp":"${new Date().toISOString()}"`,
  base: {
    service: 'integrations',
    version: process.env.npm_package_version || '1.0.0',
  },
};

export const logger = pino(loggerConfig);

// Create child loggers for different components
export const createComponentLogger = (component: string) => {
  return logger.child({ component });
};

// Specific loggers for different services
export const githubLogger = createComponentLogger('github');
export const slackLogger = createComponentLogger('slack');
export const webhookLogger = createComponentLogger('webhook');
export const marketplaceLogger = createComponentLogger('marketplace');
export const securityLogger = createComponentLogger('security');

// Log levels and utilities
export const logLevels = {
  ERROR: 'error',
  WARN: 'warn',
  INFO: 'info',
  DEBUG: 'debug',
} as const;

// Structured logging helpers
export const logError = (logger: pino.Logger, message: string, error: Error, context?: Record<string, any>) => {
  logger.error({
    error: {
      message: error.message,
      stack: error.stack,
      name: error.name,
    },
    context,
  }, message);
};

export const logWebhookEvent = (event: string, payload: any, metadata?: Record<string, any>) => {
  webhookLogger.info({
    event,
    payload: config.NODE_ENV === 'development' ? payload : '[REDACTED]',
    metadata,
  }, `Webhook event: ${event}`);
};

export const logIntegrationEvent = (integration: string, action: string, details?: Record<string, any>) => {
  logger.info({
    integration,
    action,
    details,
  }, `Integration event: ${integration} - ${action}`);
};

export const logSecurityEvent = (event: string, details: Record<string, any>) => {
  securityLogger.warn({
    event,
    details,
    timestamp: new Date().toISOString(),
  }, `Security event: ${event}`);
};

// Performance logging
export const createPerformanceLogger = (operation: string) => {
  const start = Date.now();
  return {
    end: (success: boolean = true, metadata?: Record<string, any>) => {
      const duration = Date.now() - start;
      logger.info({
        operation,
        duration,
        success,
        metadata,
      }, `Operation ${operation} completed in ${duration}ms`);
    },
  };
};

// Rate limiting logging
export const logRateLimit = (identifier: string, limit: number, remaining: number) => {
  logger.debug({
    identifier,
    limit,
    remaining,
    percentage: (remaining / limit) * 100,
  }, 'Rate limit status');
};

export default logger;