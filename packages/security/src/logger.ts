import { createLogger as createWinstonLogger, format, transports, Logger } from 'winston';

export interface LoggerConfig {
  level?: string;
  service?: string;
  format?: 'json' | 'simple';
}

/**
 * Create a logger instance
 */
export function createLogger(service: string, config: LoggerConfig = {}): Logger {
  const {
    level = process.env.LOG_LEVEL || 'info',
    format: logFormat = process.env.NODE_ENV === 'production' ? 'json' : 'simple'
  } = config;

  const logger = createWinstonLogger({
    level,
    defaultMeta: { service },
    format: format.combine(
      format.timestamp(),
      format.errors({ stack: true }),
      logFormat === 'json'
        ? format.json()
        : format.combine(
            format.colorize(),
            format.simple()
          )
    ),
    transports: [
      new transports.Console(),
      ...(process.env.NODE_ENV === 'production'
        ? [new transports.File({ filename: `/var/log/${service}.log` })]
        : []
      )
    ]
  });

  return logger;
}