// Comprehensive logging system for error handling and monitoring
import { AppError } from './errors';

export enum LogLevel {
  ERROR = 'error',
  WARN = 'warn',
  INFO = 'info',
  DEBUG = 'debug'
}

export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: Date;
  context?: Record<string, unknown>;
  error?: Error;
  requestId?: string;
  userId?: string;
  service?: string;
}

export interface LoggerConfig {
  level: LogLevel;
  enableConsole: boolean;
  enableFile: boolean;
  enableExternal: boolean;
  fileConfig?: {
    filename: string;
    maxSize: number;
    maxFiles: number;
  };
  externalConfig?: {
    endpoint: string;
    apiKey: string;
  };
}

/**
 * Centralized logging service
 */
export class Logger {
  private static instance: Logger;
  private config: LoggerConfig;

  private constructor(config: LoggerConfig) {
    this.config = config;
  }

  public static getInstance(config?: LoggerConfig): Logger {
    if (!Logger.instance) {
      if (!config) {
        throw new Error('Logger must be initialized with config');
      }
      Logger.instance = new Logger(config);
    }
    return Logger.instance;
  }

  /**
   * Log an error with full context
   */
  public error(message: string, error?: Error, context?: Record<string, unknown>): void {
    const logEntry: any = {
      level: LogLevel.ERROR,
      message,
      timestamp: new Date(),
      context: context || {}
    };
    
    if (error) {
      logEntry.error = error;
    }
    
    this.log(logEntry);
  }

  /**
   * Log a warning
   */
  public warn(message: string, context?: Record<string, unknown>): void {
    this.log({
      level: LogLevel.WARN,
      message,
      timestamp: new Date(),
      context: context || {}
    });
  }

  /**
   * Log an info message
   */
  public info(message: string, context?: Record<string, unknown>): void {
    this.log({
      level: LogLevel.INFO,
      message,
      timestamp: new Date(),
      context: context || {}
    });
  }

  /**
   * Log a debug message
   */
  public debug(message: string, context?: Record<string, unknown>): void {
    if (this.config.level === LogLevel.DEBUG) {
      this.log({
        level: LogLevel.DEBUG,
        message,
        timestamp: new Date(),
        context: context || {}
      });
    }
  }

  /**
   * Log an application error with enhanced context
   */
  public logAppError(error: AppError, context?: Record<string, unknown>): void {
    const logContext = {
      ...context,
      errorCode: error.code,
      statusCode: error.statusCode,
      isOperational: error.isOperational,
      errorContext: error.context
    };

    this.error(error.message, error, logContext);
  }

  /**
   * Log a database error with query context
   */
  public logDatabaseError(
    error: Error,
    query?: string,
    params?: unknown[],
    context?: Record<string, unknown>
  ): void {
    const logContext = {
      ...context,
      query,
      params,
      errorType: 'database'
    };

    this.error('Database operation failed', error, logContext);
  }

  /**
   * Log a cache error
   */
  public logCacheError(
    error: Error,
    operation: string,
    key?: string,
    context?: Record<string, unknown>
  ): void {
    const logContext = {
      ...context,
      operation,
      key,
      errorType: 'cache'
    };

    this.error('Cache operation failed', error, logContext);
  }

  /**
   * Log API request/response for debugging
   */
  public logApiRequest(
    method: string,
    path: string,
    statusCode: number,
    duration: number,
    context?: Record<string, unknown>
  ): void {
    const message = `${method} ${path} - ${statusCode} (${duration}ms)`;
    const logContext = {
      ...context,
      method,
      path,
      statusCode,
      duration,
      type: 'api_request'
    };

    if (statusCode >= 400) {
      this.error(message, undefined, logContext);
    } else {
      this.info(message, logContext);
    }
  }

  /**
   * Log performance metrics
   */
  public logPerformance(
    operation: string,
    duration: number,
    context?: Record<string, unknown>
  ): void {
    const message = `Performance: ${operation} took ${duration}ms`;
    const logContext = {
      ...context,
      operation,
      duration,
      type: 'performance'
    };

    if (duration > 1000) {
      this.warn(message, logContext);
    } else {
      this.info(message, logContext);
    }
  }

  /**
   * Core logging method
   */
  private log(entry: LogEntry): void {
    if (this.shouldLog(entry.level)) {
      if (this.config.enableConsole) {
        this.logToConsole(entry);
      }

      if (this.config.enableFile) {
        this.logToFile(entry);
      }

      if (this.config.enableExternal) {
        this.logToExternal(entry);
      }
    }
  }

  /**
   * Check if log level should be logged
   */
  private shouldLog(level: LogLevel): boolean {
    const levels = [LogLevel.ERROR, LogLevel.WARN, LogLevel.INFO, LogLevel.DEBUG];
    const configLevelIndex = levels.indexOf(this.config.level);
    const logLevelIndex = levels.indexOf(level);
    return logLevelIndex <= configLevelIndex;
  }

  /**
   * Log to console with formatting
   */
  private logToConsole(entry: LogEntry): void {
    const timestamp = entry.timestamp.toISOString();
    const level = entry.level.toUpperCase().padEnd(5);
    const message = entry.message;

    let logLine = `[${timestamp}] ${level} ${message}`;

    if (entry.context) {
      logLine += `\nContext: ${JSON.stringify(entry.context, null, 2)}`;
    }

    if (entry.error) {
      logLine += `\nError: ${entry.error.message}`;
      if (entry.error.stack) {
        logLine += `\nStack: ${entry.error.stack}`;
      }
    }

    switch (entry.level) {
      case LogLevel.ERROR:
        console.error(logLine);
        break;
      case LogLevel.WARN:
        console.warn(logLine);
        break;
      case LogLevel.INFO:
        console.info(logLine);
        break;
      case LogLevel.DEBUG:
        console.debug(logLine);
        break;
    }
  }

  /**
   * Log to file (placeholder - would integrate with file logging library)
   */
  private logToFile(entry: LogEntry): void {
    // In a real implementation, this would write to a file
    // For now, we'll just prepare the log entry
    const logData = {
      timestamp: entry.timestamp.toISOString(),
      level: entry.level,
      message: entry.message,
      context: entry.context,
      error: entry.error ? {
        message: entry.error.message,
        stack: entry.error.stack,
        name: entry.error.name
      } : undefined
    };

    // TODO: Implement file logging with rotation
    // This could use libraries like winston or pino
  }

  /**
   * Log to external service (placeholder - would integrate with monitoring service)
   */
  private logToExternal(entry: LogEntry): void {
    // In a real implementation, this would send to external monitoring
    // services like DataDog, New Relic, or custom logging endpoints
    const logData = {
      timestamp: entry.timestamp.toISOString(),
      level: entry.level,
      message: entry.message,
      context: entry.context,
      service: 'skybound-realms',
      environment: process.env.NODE_ENV || 'development'
    };

    // TODO: Implement external logging
    // This could use HTTP requests to monitoring services
  }
}

/**
 * Default logger configuration
 */
export const getDefaultLoggerConfig = (): LoggerConfig => ({
  level: process.env.NODE_ENV === 'production' ? LogLevel.INFO : LogLevel.DEBUG,
  enableConsole: true,
  enableFile: process.env.NODE_ENV === 'production',
  enableExternal: process.env.NODE_ENV === 'production',
  fileConfig: {
    filename: 'logs/app.log',
    maxSize: 10 * 1024 * 1024, // 10MB
    maxFiles: 5
  },
  externalConfig: {
    endpoint: process.env.LOGGING_ENDPOINT || '',
    apiKey: process.env.LOGGING_API_KEY || ''
  }
});

/**
 * Initialize logger with default config
 */
export const initializeLogger = (config?: LoggerConfig): Logger => {
  return Logger.getInstance(config || getDefaultLoggerConfig());
};

/**
 * Get logger instance
 */
export const getLogger = (): Logger => {
  return Logger.getInstance();
};