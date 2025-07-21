import { Request, Response, NextFunction } from 'express';
import { AppError, ValidationFailureError } from '../shared/errors';
import { getLogger } from '../shared/logger';
import { ErrorCode } from '../shared/types';

// Extend Express Request to include request ID for tracking
declare global {
  namespace Express {
    interface Request {
      requestId?: string;
      userId?: string;
      startTime?: number;
    }
  }
}

/**
 * Enhanced error handler with comprehensive logging and error classification
 */
export const errorHandler = (
  error: Error,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const logger = getLogger();
  const requestId = req.requestId || 'unknown';
  const userId = req.userId;
  const duration = req.startTime ? Date.now() - req.startTime : 0;

  // Enhanced error context
  const errorContext = {
    requestId,
    userId,
    method: req.method,
    path: req.path,
    url: req.url,
    userAgent: req.get('User-Agent'),
    ip: req.ip,
    duration,
    body: req.method !== 'GET' ? req.body : undefined,
    query: Object.keys(req.query).length > 0 ? req.query : undefined
  };

  let statusCode = 500;
  let errorCode = ErrorCode.INTERNAL_ERROR;
  let errorMessage = 'An unexpected error occurred';
  let errorDetails: any = undefined;

  // Handle different error types
  if (error instanceof AppError) {
    statusCode = error.statusCode;
    errorCode = error.code;
    errorMessage = error.message;
    
    if (error instanceof ValidationFailureError) {
      errorDetails = {
        validationErrors: error.validationErrors
      };
    }

    // Log application errors with full context
    logger.logAppError(error, errorContext);
  } else if (error.name === 'ValidationError') {
    // Handle Zod validation errors
    statusCode = 400;
    errorCode = ErrorCode.VALIDATION_ERROR;
    errorMessage = 'Validation failed';
    
    try {
      const zodError = JSON.parse(error.message);
      errorDetails = {
        validationErrors: zodError.map((err: any) => ({
          field: err.path?.join('.') || 'unknown',
          message: err.message,
          value: err.received
        }))
      };
    } catch {
      // If parsing fails, use original message
      errorDetails = { message: error.message };
    }

    logger.error('Validation error', error, errorContext);
  } else if (error.name === 'UnauthorizedError' || error.message.includes('unauthorized')) {
    statusCode = 401;
    errorCode = ErrorCode.UNAUTHORIZED;
    errorMessage = 'Authentication required';
    logger.warn('Unauthorized access attempt', errorContext);
  } else if (error.name === 'ForbiddenError' || error.message.includes('forbidden')) {
    statusCode = 403;
    errorCode = ErrorCode.FORBIDDEN;
    errorMessage = 'Access forbidden';
    logger.warn('Forbidden access attempt', errorContext);
  } else if (error.message.includes('not found')) {
    statusCode = 404;
    errorCode = ErrorCode.NOT_FOUND;
    errorMessage = 'Resource not found';
    logger.info('Resource not found', errorContext);
  } else {
    // Unexpected errors - log with full stack trace
    logger.error('Unexpected error', error, errorContext);
  }

  // Log API request with error status
  logger.logApiRequest(req.method, req.path, statusCode, duration, {
    ...errorContext,
    error: error.message
  });

  // Prepare response
  const errorResponse: any = {
    success: false,
    error: errorMessage,
    code: errorCode,
    timestamp: new Date().toISOString(),
    requestId,
    path: req.path
  };

  // Add error details for validation errors
  if (errorDetails) {
    errorResponse.details = errorDetails;
  }

  // Add stack trace in development
  if (process.env.NODE_ENV === 'development') {
    errorResponse.stack = error.stack;
  }

  res.status(statusCode).json(errorResponse);
};

/**
 * Enhanced 404 handler
 */
export const notFoundHandler = (req: Request, res: Response) => {
  const logger = getLogger();
  const requestId = req.requestId || 'unknown';
  const duration = req.startTime ? Date.now() - req.startTime : 0;

  const context = {
    requestId,
    method: req.method,
    path: req.path,
    url: req.url,
    userAgent: req.get('User-Agent'),
    ip: req.ip,
    duration
  };

  logger.logApiRequest(req.method, req.path, 404, duration, context);

  res.status(404).json({
    success: false,
    error: `Route ${req.method} ${req.path} not found`,
    code: ErrorCode.NOT_FOUND,
    timestamp: new Date().toISOString(),
    requestId,
    path: req.path
  });
};

/**
 * Request tracking middleware to add request ID and timing
 */
export const requestTrackingMiddleware = (req: Request, res: Response, next: NextFunction) => {
  req.requestId = generateRequestId();
  req.startTime = Date.now();
  
  // Extract user ID from JWT token if available
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      // This would be implemented with actual JWT verification
      // For now, we'll just set a placeholder
      req.userId = 'extracted-from-jwt';
    } catch (error) {
      // JWT verification failed, continue without user ID
    }
  }

  next();
};

/**
 * Generate unique request ID
 */
function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Async error wrapper for route handlers
 */
export const asyncHandler = (fn: Function) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/**
 * Global unhandled error handlers
 */
export const setupGlobalErrorHandlers = () => {
  const logger = getLogger();

  // Handle unhandled promise rejections
  process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
    logger.error('Unhandled Promise Rejection', reason, {
      type: 'unhandledRejection',
      promise: promise.toString()
    });
    
    // In production, you might want to gracefully shutdown
    if (process.env.NODE_ENV === 'production') {
      process.exit(1);
    }
  });

  // Handle uncaught exceptions
  process.on('uncaughtException', (error: Error) => {
    logger.error('Uncaught Exception', error, {
      type: 'uncaughtException'
    });
    
    // Graceful shutdown
    process.exit(1);
  });

  // Handle SIGTERM for graceful shutdown
  process.on('SIGTERM', () => {
    logger.info('SIGTERM received, shutting down gracefully');
    process.exit(0);
  });

  // Handle SIGINT for graceful shutdown
  process.on('SIGINT', () => {
    logger.info('SIGINT received, shutting down gracefully');
    process.exit(0);
  });
};