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
    service: 'urnlabs-agents',
    version: process.env.npm_package_version || '1.0.0',
  },
});

// Specialized loggers for different components
export const createAgentLogger = (agentId: string, workflowId?: string, taskId?: string) => {
  return logger.child({
    agentId,
    ...(workflowId && { workflowId }),
    ...(taskId && { taskId }),
  });
};

export const createWorkflowLogger = (workflowId: string, workflowRunId: string) => {
  return logger.child({
    workflowId,
    workflowRunId,
  });
};

export const createQueueLogger = (queueName: string, jobId?: string) => {
  return logger.child({
    queue: queueName,
    ...(jobId && { jobId }),
  });
};

// Performance logging for agent operations
export const logAgentPerformance = (
  agentId: string,
  operation: string,
  duration: number,
  metadata?: Record<string, unknown>
) => {
  logger.info({
    agentId,
    operation,
    duration,
    performance: true,
    ...metadata,
  }, `Agent ${agentId} completed ${operation} in ${duration}ms`);
};

// Workflow execution logging
export const logWorkflowExecution = (
  workflowId: string,
  runId: string,
  status: string,
  duration?: number,
  error?: string
) => {
  const logData: any = {
    workflowId,
    runId,
    status,
    workflow: true,
  };

  if (duration !== undefined) {
    logData.duration = duration;
  }

  if (error) {
    logData.error = error;
    logger.error(logData, `Workflow ${workflowId} failed: ${error}`);
  } else if (status === 'completed') {
    logger.info(logData, `Workflow ${workflowId} completed successfully`);
  } else {
    logger.info(logData, `Workflow ${workflowId} status: ${status}`);
  }
};

// Agent communication logging
export const logAgentCommunication = (
  fromAgent: string,
  toAgent: string,
  message: string,
  data?: Record<string, unknown>
) => {
  logger.debug({
    fromAgent,
    toAgent,
    message,
    communication: true,
    ...data,
  }, `Agent communication: ${fromAgent} -> ${toAgent}: ${message}`);
};

// Queue operation logging
export const logQueueOperation = (
  operation: string,
  queueName: string,
  jobId: string,
  status: string,
  duration?: number,
  error?: string
) => {
  const logData: any = {
    operation,
    queue: queueName,
    jobId,
    status,
    queueOperation: true,
  };

  if (duration !== undefined) {
    logData.duration = duration;
  }

  if (error) {
    logData.error = error;
    logger.error(logData, `Queue operation failed: ${operation} in ${queueName}`);
  } else {
    logger.info(logData, `Queue operation: ${operation} in ${queueName} - ${status}`);
  }
};

// Memory and resource usage logging
export const logResourceUsage = (
  component: string,
  memoryUsage: number,
  cpuUsage?: number,
  customMetrics?: Record<string, number>
) => {
  logger.info({
    component,
    memoryUsage,
    cpuUsage,
    resources: true,
    ...customMetrics,
  }, `Resource usage for ${component}: Memory ${memoryUsage}MB`);
};

// AI model interaction logging
export const logModelInteraction = (
  agentId: string,
  model: string,
  prompt: string,
  response: string,
  tokens: { input: number; output: number },
  duration: number,
  cost?: number
) => {
  logger.info({
    agentId,
    model,
    promptLength: prompt.length,
    responseLength: response.length,
    tokens,
    duration,
    cost,
    modelInteraction: true,
  }, `Model interaction: ${agentId} used ${model}`);
};

// Error logging with context
export const logAgentError = (
  agentId: string,
  error: Error,
  context: Record<string, unknown> = {}
) => {
  logger.error({
    agentId,
    error: {
      name: error.name,
      message: error.message,
      stack: error.stack,
    },
    agentError: true,
    ...context,
  }, `Agent error in ${agentId}: ${error.message}`);
};

// Security event logging
export const logSecurityEvent = (
  event: string,
  severity: 'low' | 'medium' | 'high' | 'critical',
  agentId?: string,
  details?: Record<string, unknown>
) => {
  logger.warn({
    securityEvent: event,
    severity,
    agentId,
    security: true,
    ...details,
  }, `Security event: ${event} (${severity})`);
};