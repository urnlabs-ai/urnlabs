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
        service: 'urnlabs-api',
        version: process.env.npm_package_version || '1.0.0',
    },
});
// Structured logging helpers
export const createRequestLogger = (requestId, method, url) => {
    return logger.child({
        requestId,
        method,
        url,
    });
};
export const createUserLogger = (userId) => {
    return logger.child({ userId });
};
export const createAgentLogger = (agentId, workflowId) => {
    return logger.child({
        agentId,
        ...(workflowId && { workflowId }),
    });
};
// Performance logging
export const logPerformance = (operation, duration, metadata) => {
    logger.info({
        operation,
        duration,
        ...metadata,
    }, `Operation ${operation} completed in ${duration}ms`);
};
// Error logging with context
export const logError = (error, context = {}) => {
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
export const logSecurityEvent = (event, severity, details) => {
    logger.warn({
        securityEvent: event,
        severity,
        ...details,
    }, `Security event: ${event}`);
};
// Business metrics logging
export const logBusinessMetric = (metric, value, unit, tags) => {
    logger.info({
        metric,
        value,
        unit,
        tags,
        timestamp: new Date().toISOString(),
    }, `Business metric: ${metric} = ${value} ${unit}`);
};
//# sourceMappingURL=logger.js.map