// Utility functions for error handling across services
import { DatabaseError, CacheError, ExternalServiceError, AppError } from './errors';
import { getLogger } from './logger';

/**
 * Wrap database operations with error handling
 */
export const withDatabaseErrorHandling = async <T>(
  operation: () => Promise<T>,
  context: {
    operation: string;
    query?: string;
    params?: unknown[];
    table?: string;
  }
): Promise<T> => {
  const logger = getLogger();

  try {
    const startTime = Date.now();
    const result = await operation();
    const duration = Date.now() - startTime;

    logger.logPerformance(`Database ${context.operation}`, duration, {
      table: context.table,
      query: context.query
    });

    return result;
  } catch (error: any) {
    logger.logDatabaseError(error, context.query, context.params, {
      operation: context.operation,
      table: context.table
    });

    throw DatabaseError.fromPgError(error, context.query, {
      operation: context.operation,
      table: context.table
    });
  }
};

/**
 * Wrap cache operations with error handling
 */
export const withCacheErrorHandling = async <T>(
  operation: () => Promise<T>,
  context: {
    operation: string;
    key?: string;
    ttl?: number;
  }
): Promise<T> => {
  const logger = getLogger();

  try {
    const startTime = Date.now();
    const result = await operation();
    const duration = Date.now() - startTime;

    logger.logPerformance(`Cache ${context.operation}`, duration, {
      key: context.key,
      ttl: context.ttl
    });

    return result;
  } catch (error: any) {
    logger.logCacheError(error, context.operation, context.key, {
      ttl: context.ttl
    });

    throw new CacheError(
      `Cache ${context.operation} failed: ${error.message}`,
      context.operation,
      context.key,
      { ttl: context.ttl }
    );
  }
};

/**
 * Wrap external service calls with error handling
 */
export const withExternalServiceErrorHandling = async <T>(
  operation: () => Promise<T>,
  context: {
    service: string;
    endpoint?: string;
    method?: string;
    timeout?: number;
  }
): Promise<T> => {
  const logger = getLogger();

  try {
    const startTime = Date.now();
    const result = await operation();
    const duration = Date.now() - startTime;

    logger.logPerformance(`External service ${context.service}`, duration, {
      endpoint: context.endpoint,
      method: context.method
    });

    return result;
  } catch (error: any) {
    logger.error(`External service ${context.service} failed`, error, {
      endpoint: context.endpoint,
      method: context.method,
      timeout: context.timeout
    });

    throw new ExternalServiceError(
      `External service ${context.service} failed: ${error.message}`,
      context.service,
      error,
      {
        endpoint: context.endpoint,
        method: context.method,
        timeout: context.timeout
      }
    );
  }
};

/**
 * Retry mechanism with exponential backoff
 */
export const withRetry = async <T>(
  operation: () => Promise<T>,
  options: {
    maxRetries?: number;
    baseDelay?: number;
    maxDelay?: number;
    backoffMultiplier?: number;
    retryCondition?: (error: Error) => boolean;
  } = {}
): Promise<T> => {
  const {
    maxRetries = 3,
    baseDelay = 1000,
    maxDelay = 10000,
    backoffMultiplier = 2,
    retryCondition = (error) => !(error instanceof AppError && error.isOperational)
  } = options;

  const logger = getLogger();
  let lastError: Error;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error: any) {
      lastError = error;

      if (attempt === maxRetries || !retryCondition(error)) {
        throw error;
      }

      const delay = Math.min(baseDelay * Math.pow(backoffMultiplier, attempt), maxDelay);

      logger.warn(`Operation failed, retrying in ${delay}ms`, {
        attempt: attempt + 1,
        maxRetries,
        error: error.message
      });

      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError!;
};

/**
 * Circuit breaker pattern implementation
 */
export class CircuitBreaker {
  private failures = 0;
  private lastFailureTime = 0;
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';

  constructor(
    private options: {
      failureThreshold: number;
      recoveryTimeout: number;
      monitoringPeriod: number;
    }
  ) { }

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    const logger = getLogger();

    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime > this.options.recoveryTimeout) {
        this.state = 'HALF_OPEN';
        logger.info('Circuit breaker transitioning to HALF_OPEN');
      } else {
        throw new Error('Circuit breaker is OPEN');
      }
    }

    try {
      const result = await operation();

      if (this.state === 'HALF_OPEN') {
        this.reset();
        logger.info('Circuit breaker reset to CLOSED');
      }

      return result;
    } catch (error) {
      this.recordFailure();

      if (this.failures >= this.options.failureThreshold) {
        this.state = 'OPEN';
        this.lastFailureTime = Date.now();
        logger.warn('Circuit breaker opened due to failures', {
          failures: this.failures,
          threshold: this.options.failureThreshold
        });
      }

      throw error;
    }
  }

  private recordFailure(): void {
    this.failures++;
  }

  private reset(): void {
    this.failures = 0;
    this.state = 'CLOSED';
  }

  getState(): string {
    return this.state;
  }

  getFailures(): number {
    return this.failures;
  }
}

/**
 * Timeout wrapper for operations
 */
export const withTimeout = <T>(
  operation: () => Promise<T>,
  timeoutMs: number,
  timeoutMessage = 'Operation timed out'
): Promise<T> => {
  return Promise.race([
    operation(),
    new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(timeoutMessage));
      }, timeoutMs);
    })
  ]);
};

/**
 * Safe JSON parsing with error handling
 */
export const safeJsonParse = <T = unknown>(
  jsonString: string,
  defaultValue: T
): T => {
  try {
    return JSON.parse(jsonString);
  } catch (error) {
    const logger = getLogger();
    logger.warn('JSON parsing failed', {
      jsonString: jsonString.substring(0, 100),
      error: (error as Error).message
    });
    return defaultValue;
  }
};

/**
 * Safe async operation wrapper
 */
export const safeAsync = async <T>(
  operation: () => Promise<T>,
  defaultValue: T,
  context?: Record<string, unknown>
): Promise<T> => {
  try {
    return await operation();
  } catch (error) {
    const logger = getLogger();
    logger.error('Safe async operation failed, returning default value', error as Error, context);
    return defaultValue;
  }
};

/**
 * Validate required environment variables
 */
export const validateEnvironment = (requiredVars: string[]): void => {
  const missing = requiredVars.filter(varName => !process.env[varName]);

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
};

/**
 * Health check utility
 */
export interface HealthCheckResult {
  status: 'healthy' | 'unhealthy' | 'degraded';
  message?: string;
  details?: Record<string, unknown>;
  timestamp: Date;
}

export const createHealthCheck = (
  name: string,
  checkFn: () => Promise<boolean>,
  timeout = 5000
): (() => Promise<HealthCheckResult>) => {
  return async (): Promise<HealthCheckResult> => {
    const startTime = Date.now();

    try {
      const isHealthy = await withTimeout(checkFn, timeout, `${name} health check timed out`);
      const duration = Date.now() - startTime;

      return {
        status: isHealthy ? 'healthy' : 'unhealthy',
        message: isHealthy ? `${name} is healthy` : `${name} is unhealthy`,
        details: { duration },
        timestamp: new Date()
      };
    } catch (error) {
      const duration = Date.now() - startTime;

      return {
        status: 'unhealthy',
        message: `${name} health check failed: ${(error as Error).message}`,
        details: { duration, error: (error as Error).message },
        timestamp: new Date()
      };
    }
  };
};