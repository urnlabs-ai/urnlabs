import pino from 'pino';
import { logConfig } from '@/lib/config.js';

export const logger = pino({
  level: logConfig.level,
  transport: logConfig.transport,
  formatters: {
    level(label) {
      return { level: label };
    },
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  base: {
    pid: process.pid,
    hostname: process.env.HOSTNAME || 'localhost',
    service: 'urnlabs-api',
    version: process.env.npm_package_version || '1.0.0',
  },
});

// Structured logging helpers
export const createRequestLogger = (requestId: string, method: string, url: string) => {
  return logger.child({
    requestId,
    method,
    url,
  });
};

export const createUserLogger = (userId: string) => {
  return logger.child({ userId });
};

export const createAgentLogger = (agentId: string, workflowId?: string) => {
  return logger.child({ 
    agentId,
    ...(workflowId && { workflowId }),
  });
};

// Performance logging
export const logPerformance = (
  operation: string,
  duration: number,
  metadata?: Record<string, unknown>
) => {
  logger.info({
    operation,
    duration,
    ...metadata,
  }, `Operation ${operation} completed in ${duration}ms`);
};

// Error logging with context
export const logError = (
  error: Error,
  context: Record<string, unknown> = {}
) => {
  logger.error({
    error: {
      name: error.name,
      message: error.message,
      stack: error.stack,
    },
    ...context,
  }, error.message);
};

// Security event logging
export const logSecurityEvent = (
  event: string,
  severity: 'low' | 'medium' | 'high' | 'critical',
  details: Record<string, unknown>
) => {
  logger.warn({
    securityEvent: event,
    severity,
    ...details,
  }, `Security event: ${event}`);
};

// Business metrics logging
export const logBusinessMetric = (
  metric: string,
  value: number,
  unit: string,
  tags?: Record<string, string>
) => {
  logger.info({
    metric,
    value,
    unit,
    tags,
    timestamp: new Date().toISOString(),
  }, `Business metric: ${metric} = ${value} ${unit}`);
};