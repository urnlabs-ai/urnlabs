import pino from 'pino';

const isDevelopment = process.env.NODE_ENV === 'development';
const isTest = process.env.NODE_ENV === 'test';

export const logger = pino({
  name: 'urnlabs-security',
  level: process.env.LOG_LEVEL || (isDevelopment ? 'debug' : 'info'),
  ...(isDevelopment && !isTest ? {
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'yyyy-mm-dd HH:MM:ss',
        ignore: 'pid,hostname'
      }
    }
  } : {}),
  redact: {
    paths: [
      'password',
      'token',
      'refreshToken',
      'accessToken',
      'authorization',
      'secret',
      'passwordHash',
      'mfaSecret'
    ],
    censor: '[REDACTED]'
  }
});

export const createChildLogger = (context: Record<string, any>) => {
  return logger.child(context);
};