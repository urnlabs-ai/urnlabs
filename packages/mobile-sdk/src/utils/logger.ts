/**
 * Comprehensive logging system for the SDK
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  component?: string;
  metadata?: Record<string, any>;
  error?: Error;
  userId?: string;
  sessionId?: string;
  requestId?: string;
}

export interface LoggerConfig {
  level: LogLevel;
  enableConsole: boolean;
  enableStorage: boolean;
  maxStoredLogs: number;
  includeTimestamp: boolean;
  includeStackTrace: boolean;
  sanitizeData: boolean;
  component?: string;
  customFormatters?: Record<string, (entry: LogEntry) => string>;
}

export interface LogTransport {
  log(entry: LogEntry): void;
  flush?(): Promise<void>;
}

export class Logger {
  private config: LoggerConfig;
  private transports: LogTransport[] = [];
  private logQueue: LogEntry[] = [];
  private sessionId: string;
  private logLevels: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3
  };

  constructor(config: Partial<LoggerConfig> = {}) {
    this.config = {
      level: 'info',
      enableConsole: true,
      enableStorage: false,
      maxStoredLogs: 1000,
      includeTimestamp: true,
      includeStackTrace: true,
      sanitizeData: true,
      ...config
    };

    this.sessionId = this.generateSessionId();

    // Set up default transports
    if (this.config.enableConsole) {
      this.addTransport(new ConsoleTransport());
    }

    if (this.config.enableStorage) {
      this.addTransport(new StorageTransport(this.config.maxStoredLogs));
    }
  }

  /**
   * Add a transport for log output
   */
  public addTransport(transport: LogTransport): void {
    this.transports.push(transport);
  }

  /**
   * Remove a transport
   */
  public removeTransport(transport: LogTransport): void {
    const index = this.transports.indexOf(transport);
    if (index > -1) {
      this.transports.splice(index, 1);
    }
  }

  /**
   * Log a debug message
   */
  public debug(message: string, metadata?: Record<string, any>): void {
    this.log('debug', message, metadata);
  }

  /**
   * Log an info message
   */
  public info(message: string, metadata?: Record<string, any>): void {
    this.log('info', message, metadata);
  }

  /**
   * Log a warning message
   */
  public warn(message: string, metadata?: Record<string, any>): void {
    this.log('warn', message, metadata);
  }

  /**
   * Log an error message
   */
  public error(message: string, error?: Error, metadata?: Record<string, any>): void {
    this.log('error', message, { ...metadata, error });
  }

  /**
   * Log a message with specified level
   */
  public log(level: LogLevel, message: string, metadata?: Record<string, any>): void {
    // Check if level meets threshold
    if (this.logLevels[level] < this.logLevels[this.config.level]) {
      return;
    }

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      component: this.config.component,
      sessionId: this.sessionId,
      ...metadata
    };

    // Sanitize sensitive data if enabled
    if (this.config.sanitizeData && entry.metadata) {
      entry.metadata = this.sanitizeMetadata(entry.metadata);
    }

    // Add to queue
    this.logQueue.push(entry);

    // Keep queue size under control
    if (this.logQueue.length > this.config.maxStoredLogs) {
      this.logQueue.shift();
    }

    // Send to transports
    this.transports.forEach(transport => {
      try {
        transport.log(entry);
      } catch (error) {
        // Don't let transport errors break logging
        console.error('Transport error:', error);
      }
    });
  }

  /**
   * Create a child logger with additional context
   */
  public child(component: string, metadata?: Record<string, any>): Logger {
    const childLogger = new Logger({
      ...this.config,
      component: `${this.config.component || 'SDK'}:${component}`
    });

    // Copy transports
    this.transports.forEach(transport => {
      childLogger.addTransport(transport);
    });

    // Add default metadata to all logs
    if (metadata) {
      const originalLog = childLogger.log.bind(childLogger);
      childLogger.log = (level: LogLevel, message: string, meta?: Record<string, any>) => {
        originalLog(level, message, { ...metadata, ...meta });
      };
    }

    return childLogger;
  }

  /**
   * Set log level
   */
  public setLevel(level: LogLevel): void {
    this.config.level = level;
  }

  /**
   * Get current log level
   */
  public getLevel(): LogLevel {
    return this.config.level;
  }

  /**
   * Get recent logs
   */
  public getRecentLogs(count: number = 100): LogEntry[] {
    return this.logQueue.slice(-count);
  }

  /**
   * Get logs by level
   */
  public getLogsByLevel(level: LogLevel): LogEntry[] {
    return this.logQueue.filter(entry => entry.level === level);
  }

  /**
   * Clear log queue
   */
  public clearLogs(): void {
    this.logQueue = [];
  }

  /**
   * Flush all transports
   */
  public async flush(): Promise<void> {
    const flushPromises = this.transports
      .filter(transport => transport.flush)
      .map(transport => transport.flush!());

    await Promise.all(flushPromises);
  }

  /**
   * Create performance timing entry
   */
  public time(label: string): () => void {
    const startTime = performance.now();
    return () => {
      const duration = performance.now() - startTime;
      this.info(`Timer: ${label}`, { duration, unit: 'ms' });
    };
  }

  /**
   * Log function execution time
   */
  public async measure<T>(label: string, fn: () => Promise<T>): Promise<T> {
    const endTimer = this.time(label);
    try {
      const result = await fn();
      endTimer();
      return result;
    } catch (error) {
      endTimer();
      this.error(`Error in ${label}`, error as Error);
      throw error;
    }
  }

  private sanitizeMetadata(metadata: Record<string, any>): Record<string, any> {
    const sanitized = { ...metadata };
    const sensitiveKeys = [
      'password', 'token', 'apikey', 'secret', 'authorization',
      'cookie', 'session', 'auth', 'credential', 'key'
    ];

    const sanitizeValue = (obj: any, path: string = ''): any => {
      if (obj === null || obj === undefined) {
        return obj;
      }

      if (typeof obj === 'string') {
        const lowerPath = path.toLowerCase();
        if (sensitiveKeys.some(key => lowerPath.includes(key))) {
          return '[REDACTED]';
        }
        return obj;
      }

      if (Array.isArray(obj)) {
        return obj.map((item, index) => sanitizeValue(item, `${path}[${index}]`));
      }

      if (typeof obj === 'object') {
        const sanitizedObj: any = {};
        for (const [key, value] of Object.entries(obj)) {
          const newPath = path ? `${path}.${key}` : key;
          sanitizedObj[key] = sanitizeValue(value, newPath);
        }
        return sanitizedObj;
      }

      return obj;
    };

    return sanitizeValue(sanitized);
  }

  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

/**
 * Console transport for logging to browser/node console
 */
export class ConsoleTransport implements LogTransport {
  private formatters: Record<LogLevel, (entry: LogEntry) => void>;

  constructor() {
    this.formatters = {
      debug: this.logDebug.bind(this),
      info: this.logInfo.bind(this),
      warn: this.logWarn.bind(this),
      error: this.logError.bind(this)
    };
  }

  public log(entry: LogEntry): void {
    this.formatters[entry.level](entry);
  }

  private logDebug(entry: LogEntry): void {
    if (typeof console !== 'undefined' && console.debug) {
      console.debug(this.formatMessage(entry), entry.metadata || '');
    }
  }

  private logInfo(entry: LogEntry): void {
    if (typeof console !== 'undefined' && console.info) {
      console.info(this.formatMessage(entry), entry.metadata || '');
    }
  }

  private logWarn(entry: LogEntry): void {
    if (typeof console !== 'undefined' && console.warn) {
      console.warn(this.formatMessage(entry), entry.metadata || '');
    }
  }

  private logError(entry: LogEntry): void {
    if (typeof console !== 'undefined' && console.error) {
      console.error(this.formatMessage(entry), entry.metadata || '', entry.error || '');
    }
  }

  private formatMessage(entry: LogEntry): string {
    const component = entry.component ? `[${entry.component}]` : '[SDK]';
    const timestamp = entry.timestamp.split('T')[1].split('.')[0]; // HH:MM:SS format
    return `${timestamp} ${component} ${entry.message}`;
  }
}

/**
 * Storage transport for logging to memory/localStorage
 */
export class StorageTransport implements LogTransport {
  private logs: LogEntry[] = [];

  constructor(private maxLogs: number = 1000) {}

  public log(entry: LogEntry): void {
    this.logs.push(entry);

    // Keep storage size under control
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }
  }

  public getLogs(): LogEntry[] {
    return [...this.logs];
  }

  public clearLogs(): void {
    this.logs = [];
  }

  public async flush(): Promise<void> {
    // For storage transport, flushing might involve persisting to actual storage
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem('urnlabs_sdk_logs', JSON.stringify(this.logs));
      } catch (error) {
        // Storage quota exceeded or not available
        console.warn('Failed to persist logs to localStorage:', error);
      }
    }
  }
}

/**
 * Remote transport for sending logs to a server
 */
export class RemoteTransport implements LogTransport {
  private queue: LogEntry[] = [];
  private flushTimer: NodeJS.Timeout | null = null;

  constructor(
    private endpoint: string,
    private batchSize: number = 10,
    private flushInterval: number = 5000,
    private httpClient?: any
  ) {
    // Start periodic flushing
    this.scheduleFlush();
  }

  public log(entry: LogEntry): void {
    this.queue.push(entry);

    // Flush if batch size reached
    if (this.queue.length >= this.batchSize) {
      this.flush();
    }
  }

  public async flush(): Promise<void> {
    if (this.queue.length === 0 || !this.httpClient) {
      return;
    }

    const batch = this.queue.splice(0, this.batchSize);

    try {
      await this.httpClient.post(this.endpoint, { logs: batch });
    } catch (error) {
      // Re-queue failed logs at the beginning
      this.queue.unshift(...batch);
      console.error('Failed to send logs to remote endpoint:', error);
    }
  }

  private scheduleFlush(): void {
    this.flushTimer = setInterval(() => {
      this.flush();
    }, this.flushInterval);
  }

  public destroy(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    this.flush(); // Final flush
  }
}

/**
 * Create a default logger instance
 */
export function createLogger(config: Partial<LoggerConfig> = {}): Logger {
  return new Logger(config);
}

/**
 * Global logger instance
 */
export const defaultLogger = createLogger({
  component: 'UrnlabsSDK',
  level: 'info',
  enableConsole: true,
  enableStorage: true
});