import pino from 'pino';

/**
 * Security Service Logger
 * Configured for structured logging with security-specific fields
 */
export const logger = pino({
  name: 'urnlabs-security',
  level: process.env.LOG_LEVEL || 'info',
  formatters: {
    level: (label) => {
      return { level: label };
    },
    log: (object) => {
      // Add common security fields
      return {
        ...object,
        service: 'security',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development'
      };
    }
  },
  serializers: {
    req: pino.stdSerializers.req,
    res: pino.stdSerializers.res,
    err: pino.stdSerializers.err,
    error: pino.stdSerializers.err,
    // Custom serializers for security events
    wafEvent: (event: any) => ({
      id: event.id,
      type: event.type,
      ip: event.ip,
      url: event.url,
      method: event.method,
      threatLevel: event.threatLevel,
      ruleMatches: event.ruleMatches,
      timestamp: event.timestamp
    }),
    securityAlert: (alert: any) => ({
      id: alert.id,
      type: alert.type,
      severity: alert.severity,
      source: alert.source,
      timestamp: alert.timestamp,
      description: alert.description
    })
  },
  redact: {
    paths: [
      'password',
      'passwd',
      'secret',
      'token',
      'key',
      'authorization',
      'cookie',
      'x-api-key',
      'x-auth-token',
      'headers.authorization',
      'headers.cookie',
      'headers["x-api-key"]',
      'headers["x-auth-token"]',
      'body.password',
      'body.secret',
      'body.token'
    ],
    censor: '[REDACTED]'
  },
  ...(process.env.NODE_ENV === 'development' && {
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'yyyy-mm-dd HH:MM:ss',
        ignore: 'pid,hostname,service',
        singleLine: false
      }
    }
  })
});

export default logger;