interface LogLevel {
  DEBUG: number;
  INFO: number;
  WARN: number;
  ERROR: number;
}

const LOG_LEVELS: LogLevel = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3
};

class Logger {
  private level: number;

  constructor(level: keyof LogLevel = 'INFO') {
    this.level = LOG_LEVELS[level];
  }

  private formatMessage(level: string, message: string, meta?: Record<string, any>): string {
    const timestamp = new Date().toISOString();
    const metaStr = meta ? ` ${JSON.stringify(meta)}` : '';
    return `[${timestamp}] ${level}: ${message}${metaStr}`;
  }

  private shouldLog(level: number): boolean {
    return level >= this.level;
  }

  debug(message: string, meta?: Record<string, any>): void {
    if (this.shouldLog(LOG_LEVELS.DEBUG)) {
      console.debug(this.formatMessage('DEBUG', message, meta));
    }
  }

  info(message: string, meta?: Record<string, any>): void {
    if (this.shouldLog(LOG_LEVELS.INFO)) {
      console.info(this.formatMessage('INFO', message, meta));
    }
  }

  warn(message: string, meta?: Record<string, any>): void {
    if (this.shouldLog(LOG_LEVELS.WARN)) {
      console.warn(this.formatMessage('WARN', message, meta));
    }
  }

  error(message: string, meta?: Record<string, any>): void {
    if (this.shouldLog(LOG_LEVELS.ERROR)) {
      console.error(this.formatMessage('ERROR', message, meta));
    }
  }

  child(meta: Record<string, any>): Logger {
    const childLogger = new Logger();
    childLogger.level = this.level;

    // Override methods to include child metadata
    const originalDebug = childLogger.debug.bind(childLogger);
    const originalInfo = childLogger.info.bind(childLogger);
    const originalWarn = childLogger.warn.bind(childLogger);
    const originalError = childLogger.error.bind(childLogger);

    childLogger.debug = (message: string, additionalMeta?: Record<string, any>) => {
      originalDebug(message, { ...meta, ...additionalMeta });
    };

    childLogger.info = (message: string, additionalMeta?: Record<string, any>) => {
      originalInfo(message, { ...meta, ...additionalMeta });
    };

    childLogger.warn = (message: string, additionalMeta?: Record<string, any>) => {
      originalWarn(message, { ...meta, ...additionalMeta });
    };

    childLogger.error = (message: string, additionalMeta?: Record<string, any>) => {
      originalError(message, { ...meta, ...additionalMeta });
    };

    return childLogger;
  }
}

// Export singleton logger instance
export const logger = new Logger(
  (process.env.LOG_LEVEL as keyof LogLevel) || 'INFO'
);

export default logger;