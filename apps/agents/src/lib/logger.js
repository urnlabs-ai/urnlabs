import pino from 'pino';
import { logConfig } from '@/lib/config.js';
export const logger = pino({
    level: logConfig.level,
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
export const createAgentLogger = (agentId, workflowId, taskId) => {
    return logger.child({
        agentId,
        ...(workflowId && { workflowId }),
        ...(taskId && { taskId }),
    });
};
export const createWorkflowLogger = (workflowId, workflowRunId) => {
    return logger.child({
        workflowId,
        workflowRunId,
    });
};
export const createQueueLogger = (queueName, jobId) => {
    return logger.child({
        queue: queueName,
        ...(jobId && { jobId }),
    });
};
// Performance logging for agent operations
export const logAgentPerformance = (agentId, operation, duration, metadata) => {
    logger.info({
        agentId,
        operation,
        duration,
        performance: true,
        ...metadata,
    }, `Agent ${agentId} completed ${operation} in ${duration}ms`);
};
// Workflow execution logging
export const logWorkflowExecution = (workflowId, runId, status, duration, error) => {
    const logData = {
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
    }
    else if (status === 'completed') {
        logger.info(logData, `Workflow ${workflowId} completed successfully`);
    }
    else {
        logger.info(logData, `Workflow ${workflowId} status: ${status}`);
    }
};
// Agent communication logging
export const logAgentCommunication = (fromAgent, toAgent, message, data) => {
    logger.debug({
        fromAgent,
        toAgent,
        message,
        communication: true,
        ...data,
    }, `Agent communication: ${fromAgent} -> ${toAgent}: ${message}`);
};
// Queue operation logging
export const logQueueOperation = (operation, queueName, jobId, status, duration, error) => {
    const logData = {
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
    }
    else {
        logger.info(logData, `Queue operation: ${operation} in ${queueName} - ${status}`);
    }
};
// Memory and resource usage logging
export const logResourceUsage = (component, memoryUsage, cpuUsage, customMetrics) => {
    logger.info({
        component,
        memoryUsage,
        cpuUsage,
        resources: true,
        ...customMetrics,
    }, `Resource usage for ${component}: Memory ${memoryUsage}MB`);
};
// AI model interaction logging
export const logModelInteraction = (agentId, model, prompt, response, tokens, duration, cost) => {
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
export const logAgentError = (agentId, error, context = {}) => {
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
export const logSecurityEvent = (event, severity, agentId, details) => {
    logger.warn({
        securityEvent: event,
        severity,
        agentId,
        security: true,
        ...details,
    }, `Security event: ${event} (${severity})`);
};
//# sourceMappingURL=logger.js.map