// Custom error classes for different error types
import { ErrorCode } from './types';

export interface ValidationError {
  field: string;
  message: string;
  value?: unknown;
}

/**
 * Base application error class
 */
export abstract class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: ErrorCode;
  public readonly isOperational: boolean;
  public readonly timestamp: Date;
  public readonly context?: Record<string, unknown>;

  constructor(
    message: string,
    statusCode: number,
    code: ErrorCode,
    isOperational = true,
    context?: Record<string, unknown>
  ) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = isOperational;
    this.timestamp = new Date();
    this.context = context || {};

    // Maintains proper stack trace for where our error was thrown
    Error.captureStackTrace(this, this.constructor);
  }

  /**
   * Convert error to JSON for logging and API responses
   */
  toJSON() {
    return {
      name: this.name,
      message: this.message,
      statusCode: this.statusCode,
      code: this.code,
      timestamp: this.timestamp,
      context: this.context,
      stack: this.stack
    };
  }
}

/**
 * Validation error for input validation failures
 */
export class ValidationFailureError extends AppError {
  public readonly validationErrors: ValidationError[];

  constructor(
    message: string,
    validationErrors: ValidationError[] = [],
    context?: Record<string, unknown>
  ) {
    super(message, 400, ErrorCode.VALIDATION_ERROR, true, context);
    this.validationErrors = validationErrors;
  }

  static fromZodError(zodError: any, context?: Record<string, unknown>): ValidationFailureError {
    const validationErrors: ValidationError[] = zodError.errors.map((err: any) => ({
      field: err.path.join('.'),
      message: err.message,
      value: err.received
    }));

    return new ValidationFailureError(
      'Validation failed',
      validationErrors,
      context
    );
  }
}

/**
 * Resource not found error
 */
export class NotFoundError extends AppError {
  constructor(resource: string, identifier?: string, context?: Record<string, unknown>) {
    const message = identifier 
      ? `${resource} with identifier '${identifier}' not found`
      : `${resource} not found`;
    
    super(message, 404, ErrorCode.NOT_FOUND, true, context);
  }
}

/**
 * Authentication error
 */
export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required', context?: Record<string, unknown>) {
    super(message, 401, ErrorCode.UNAUTHORIZED, true, context);
  }
}

/**
 * Authorization error
 */
export class ForbiddenError extends AppError {
  constructor(message = 'Access forbidden', context?: Record<string, unknown>) {
    super(message, 403, ErrorCode.FORBIDDEN, true, context);
  }
}

/**
 * Database operation error
 */
export class DatabaseError extends AppError {
  public readonly query?: string;
  public readonly originalError?: Error;

  constructor(
    message: string,
    originalError?: Error,
    query?: string,
    context?: Record<string, unknown>
  ) {
    super(message, 500, ErrorCode.DATABASE_ERROR, true, context);
    if (originalError) this.originalError = originalError;
    if (query) this.query = query;
  }

  static fromPgError(pgError: any, query?: string, context?: Record<string, unknown>): DatabaseError {
    let message = 'Database operation failed';
    
    // Handle common PostgreSQL error codes
    switch (pgError.code) {
      case '23505': // unique_violation
        message = 'Resource already exists';
        break;
      case '23503': // foreign_key_violation
        message = 'Referenced resource does not exist';
        break;
      case '23502': // not_null_violation
        message = 'Required field is missing';
        break;
      case '42P01': // undefined_table
        message = 'Database table does not exist';
        break;
      case '42703': // undefined_column
        message = 'Database column does not exist';
        break;
      default:
        message = pgError.message || message;
    }

    return new DatabaseError(message, pgError, query, {
      ...context,
      pgCode: pgError.code,
      pgDetail: pgError.detail,
      pgHint: pgError.hint
    });
  }
}

/**
 * Cache operation error
 */
export class CacheError extends AppError {
  public readonly operation: string;
  public readonly key?: string;

  constructor(
    message: string,
    operation: string,
    key?: string,
    context?: Record<string, unknown>
  ) {
    super(message, 500, ErrorCode.CACHE_ERROR, true, context);
    this.operation = operation;
    if (key) this.key = key;
  }
}

/**
 * Business logic error
 */
export class BusinessLogicError extends AppError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 400, ErrorCode.VALIDATION_ERROR, true, context);
  }
}

/**
 * External service error
 */
export class ExternalServiceError extends AppError {
  public readonly service: string;
  public readonly originalError?: Error;

  constructor(
    message: string,
    service: string,
    originalError?: Error,
    context?: Record<string, unknown>
  ) {
    super(message, 503, ErrorCode.INTERNAL_ERROR, true, context);
    this.service = service;
    if (originalError) this.originalError = originalError;
  }
}

/**
 * Rate limiting error
 */
export class RateLimitError extends AppError {
  public readonly retryAfter: number;

  constructor(message = 'Rate limit exceeded', retryAfter = 60, context?: Record<string, unknown>) {
    super(message, 429, ErrorCode.VALIDATION_ERROR, true, context);
    this.retryAfter = retryAfter;
  }
}

/**
 * Configuration error
 */
export class ConfigurationError extends AppError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 500, ErrorCode.INTERNAL_ERROR, false, context);
  }
}

/**
 * Game-specific errors
 */
export class GameError extends AppError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 400, ErrorCode.VALIDATION_ERROR, true, context);
  }
}

export class InsufficientResourcesError extends GameError {
  constructor(resource: string, required: number, available: number) {
    super(`Insufficient ${resource}: required ${required}, available ${available}`, {
      resource,
      required,
      available
    });
  }
}

export class InvalidGameStateError extends GameError {
  constructor(message: string, currentState?: string, expectedState?: string) {
    super(message, {
      currentState,
      expectedState
    });
  }
}

export class CooldownError extends GameError {
  public readonly remainingTime: number;

  constructor(action: string, remainingTime: number) {
    super(`Action '${action}' is on cooldown for ${remainingTime}ms`, {
      action,
      remainingTime
    });
    this.remainingTime = remainingTime;
  }
}