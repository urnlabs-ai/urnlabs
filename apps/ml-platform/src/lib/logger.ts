import pino from 'pino';
import { config } from './config.js';

// Create logger configuration based on environment
const createLoggerConfig = () => {
  const baseConfig = {
    level: config.LOG_LEVEL,
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
      level: (label: string) => ({ level: label }),
      error: (error: Error) => ({
        error: {
          message: error.message,
          stack: error.stack,
          name: error.name,
        },
      }),
    },
    serializers: {
      req: pino.stdSerializers.req,
      res: pino.stdSerializers.res,
      err: pino.stdSerializers.err,
    },
  };

  // Pretty print for development
  if (config.NODE_ENV === 'development' && config.LOG_FORMAT === 'pretty') {
    return {
      ...baseConfig,
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
          messageFormat: '{levelName} - {msg}',
        },
      },
    };
  }

  // Structured JSON logging for production
  return baseConfig;
};

// Create the main logger
export const logger = pino(createLoggerConfig());

// Create specialized loggers for different components
export const createChildLogger = (component: string, metadata?: Record<string, any>) => {
  return logger.child({ component, ...metadata });
};

// Specialized loggers
export const modelLogger = createChildLogger('model-manager');
export const vectorLogger = createChildLogger('vector-manager');
export const pipelineLogger = createChildLogger('pipeline-manager');
export const orchestratorLogger = createChildLogger('agent-orchestrator');
export const mlopsLogger = createChildLogger('mlops-manager');
export const automlLogger = createChildLogger('automl-service');
export const apiLogger = createChildLogger('api');

// Performance logging utilities
export const withTiming = async <T>(
  operation: string,
  fn: () => Promise<T>,
  logger: pino.Logger = logger,
  metadata?: Record<string, any>
): Promise<T> => {
  const startTime = Date.now();
  const operationId = `${operation}_${startTime}`;
  
  logger.info({ operation, operationId, ...metadata }, `Starting ${operation}`);
  
  try {
    const result = await fn();
    const duration = Date.now() - startTime;
    
    logger.info(
      { operation, operationId, duration, ...metadata },
      `Completed ${operation} in ${duration}ms`
    );
    
    return result;
  } catch (error) {
    const duration = Date.now() - startTime;
    
    logger.error(
      { operation, operationId, duration, error, ...metadata },
      `Failed ${operation} after ${duration}ms`
    );
    
    throw error;
  }
};

// Request logging utilities
export const logRequest = (
  method: string,
  url: string,
  statusCode: number,
  duration: number,
  metadata?: Record<string, any>
) => {
  const level = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info';
  
  apiLogger[level](
    {
      method,
      url,
      statusCode,
      duration,
      ...metadata,
    },
    `${method} ${url} ${statusCode} - ${duration}ms`
  );
};

// Model inference logging
export const logModelInference = (
  model: string,
  provider: string,
  tokens: number,
  duration: number,
  cost?: number,
  metadata?: Record<string, any>
) => {
  modelLogger.info(
    {
      model,
      provider,
      tokens,
      duration,
      cost,
      ...metadata,
    },
    `Model inference: ${model} (${provider}) - ${tokens} tokens in ${duration}ms`
  );
};

// Vector search logging
export const logVectorSearch = (
  index: string,
  provider: string,
  resultsCount: number,
  duration: number,
  metadata?: Record<string, any>
) => {
  vectorLogger.info(
    {
      index,
      provider,
      resultsCount,
      duration,
      ...metadata,
    },
    `Vector search: ${index} (${provider}) - ${resultsCount} results in ${duration}ms`
  );
};

// Pipeline job logging
export const logPipelineJob = (
  jobId: string,
  type: string,
  status: string,
  duration?: number,
  metadata?: Record<string, any>
) => {
  const level = status === 'failed' ? 'error' : status === 'completed' ? 'info' : 'debug';
  
  pipelineLogger[level](
    {
      jobId,
      type,
      status,
      duration,
      ...metadata,
    },
    `Pipeline job ${jobId} (${type}): ${status}${duration ? ` in ${duration}ms` : ''}`
  );
};

// Agent orchestration logging
export const logAgentExecution = (
  workflowId: string,
  agentId: string,
  status: string,
  duration?: number,
  metadata?: Record<string, any>
) => {
  const level = status === 'failed' ? 'error' : 'info';
  
  orchestratorLogger[level](
    {
      workflowId,
      agentId,
      status,
      duration,
      ...metadata,
    },
    `Agent execution: ${agentId} in workflow ${workflowId} - ${status}${duration ? ` (${duration}ms)` : ''}`
  );
};

// MLOps metrics logging
export const logMLOpsMetrics = (
  metrics: Record<string, number>,
  metadata?: Record<string, any>
) => {
  mlopsLogger.info(
    {
      metrics,
      ...metadata,
    },
    'MLOps metrics recorded'
  );
};

// Error logging utilities
export const logError = (
  error: Error,
  context: string,
  metadata?: Record<string, any>
) => {
  logger.error(
    {
      error: {
        message: error.message,
        stack: error.stack,
        name: error.name,
      },
      context,
      ...metadata,
    },
    `Error in ${context}: ${error.message}`
  );
};

// Security logging
export const logSecurityEvent = (
  event: string,
  severity: 'low' | 'medium' | 'high' | 'critical',
  userId?: string,
  metadata?: Record<string, any>
) => {
  const level = severity === 'critical' || severity === 'high' ? 'error' : 'warn';
  
  logger[level](
    {
      securityEvent: event,
      severity,
      userId,
      timestamp: new Date().toISOString(),
      ...metadata,
    },
    `Security event: ${event} (${severity})`
  );
};

// Resource usage logging
export const logResourceUsage = (
  resource: string,
  usage: number,
  limit: number,
  unit: string,
  metadata?: Record<string, any>
) => {
  const utilizationPercent = (usage / limit) * 100;
  const level = utilizationPercent > 90 ? 'warn' : utilizationPercent > 80 ? 'info' : 'debug';
  
  logger[level](
    {
      resource,
      usage,
      limit,
      unit,
      utilizationPercent: Math.round(utilizationPercent * 100) / 100,
      ...metadata,
    },
    `Resource usage: ${resource} ${usage}/${limit} ${unit} (${utilizationPercent.toFixed(1)}%)`
  );
};

// Business metrics logging
export const logBusinessMetrics = (
  metrics: {
    totalRequests: number;
    successRate: number;
    averageLatency: number;
    totalCost: number;
    costSavings?: number;
  },
  period: string,
  metadata?: Record<string, any>
) => {
  logger.info(
    {
      businessMetrics: metrics,
      period,
      ...metadata,
    },
    `Business metrics for ${period}: ${metrics.totalRequests} requests, ${metrics.successRate}% success rate, ${metrics.averageLatency}ms avg latency, $${metrics.totalCost} cost`
  );
};

// Audit logging for compliance
export const logAuditEvent = (
  action: string,
  resource: string,
  userId: string,
  outcome: 'success' | 'failure',
  metadata?: Record<string, any>
) => {
  logger.info(
    {
      audit: true,
      action,
      resource,
      userId,
      outcome,
      timestamp: new Date().toISOString(),
      ...metadata,
    },
    `Audit: ${userId} ${action} ${resource} - ${outcome}`
  );
};

// Health check logging
export const logHealthCheck = (
  service: string,
  status: 'healthy' | 'unhealthy',
  responseTime?: number,
  error?: string,
  metadata?: Record<string, any>
) => {
  const level = status === 'unhealthy' ? 'error' : 'debug';
  
  logger[level](
    {
      healthCheck: true,
      service,
      status,
      responseTime,
      error,
      ...metadata,
    },
    `Health check: ${service} is ${status}${responseTime ? ` (${responseTime}ms)` : ''}${error ? ` - ${error}` : ''}`
  );
};

// Export logger instances for direct use
export {
  logger as default,
  logger as mainLogger,
};

// Log uncaught exceptions and unhandled rejections
process.on('uncaughtException', (error) => {
  logger.fatal({ error }, 'Uncaught exception');
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.fatal({ reason, promise }, 'Unhandled promise rejection');
  process.exit(1);
});

// Graceful shutdown logging
process.on('SIGTERM', () => {
  logger.info('Received SIGTERM, starting graceful shutdown');
});

process.on('SIGINT', () => {
  logger.info('Received SIGINT, starting graceful shutdown');
});

export default logger;