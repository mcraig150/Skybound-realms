// Unit tests for error handler middleware
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import {
  errorHandler,
  notFoundHandler,
  requestTrackingMiddleware,
  asyncHandler,
  setupGlobalErrorHandlers
} from '../../middleware/errorHandler';
import {
  AppError,
  ValidationFailureError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
  DatabaseError
} from '../../shared/errors';
import { ErrorCode } from '../../shared/types';

// Mock logger
vi.mock('../../shared/logger', () => ({
  getLogger: vi.fn(() => ({
    logAppError: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    logApiRequest: vi.fn()
  }))
}));

describe('Error Handler Middleware', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;
  let jsonSpy: ReturnType<typeof vi.fn>;
  let statusSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    jsonSpy = vi.fn();
    statusSpy = vi.fn().mockReturnValue({ json: jsonSpy });

    mockRequest = {
      method: 'GET',
      path: '/api/test',
      url: '/api/test?param=value',
      ip: '127.0.0.1',
      body: {},
      query: {},
      get: vi.fn().mockReturnValue('test-user-agent'),
      requestId: 'test-request-id',
      userId: 'test-user-id',
      startTime: Date.now() - 100
    };

    mockResponse = {
      status: statusSpy,
      json: jsonSpy
    };

    mockNext = vi.fn();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('errorHandler', () => {
    it('should handle AppError correctly', () => {
      const error = new NotFoundError('Player', 'user123');

      errorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);

      expect(statusSpy).toHaveBeenCalledWith(404);
      expect(jsonSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: "Player with identifier 'user123' not found",
          code: ErrorCode.NOT_FOUND,
          requestId: 'test-request-id',
          path: '/api/test'
        })
      );
    });

    it('should handle ValidationFailureError with details', () => {
      const validationErrors = [
        { field: 'username', message: 'Required', value: undefined },
        { field: 'email', message: 'Invalid format', value: 'invalid' }
      ];
      const error = new ValidationFailureError('Validation failed', validationErrors);

      errorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);

      expect(statusSpy).toHaveBeenCalledWith(400);
      expect(jsonSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Validation failed',
          code: ErrorCode.VALIDATION_ERROR,
          details: {
            validationErrors
          }
        })
      );
    });

    it('should handle Zod validation errors', () => {
      const zodError = new Error(JSON.stringify([
        { path: ['username'], message: 'Required', received: undefined },
        { path: ['email'], message: 'Invalid email', received: 'invalid' }
      ]));
      zodError.name = 'ValidationError';

      errorHandler(zodError, mockRequest as Request, mockResponse as Response, mockNext);

      expect(statusSpy).toHaveBeenCalledWith(400);
      expect(jsonSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Validation failed',
          code: ErrorCode.VALIDATION_ERROR,
          details: {
            validationErrors: [
              { field: 'username', message: 'Required', value: undefined },
              { field: 'email', message: 'Invalid email', value: 'invalid' }
            ]
          }
        })
      );
    });

    it('should handle unauthorized errors', () => {
      const error = new Error('unauthorized access');

      errorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);

      expect(statusSpy).toHaveBeenCalledWith(401);
      expect(jsonSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Authentication required',
          code: ErrorCode.UNAUTHORIZED
        })
      );
    });

    it('should handle forbidden errors', () => {
      const error = new Error('forbidden resource');

      errorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);

      expect(statusSpy).toHaveBeenCalledWith(403);
      expect(jsonSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Access forbidden',
          code: ErrorCode.FORBIDDEN
        })
      );
    });

    it('should handle not found errors', () => {
      const error = new Error('resource not found');

      errorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);

      expect(statusSpy).toHaveBeenCalledWith(404);
      expect(jsonSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Resource not found',
          code: ErrorCode.NOT_FOUND
        })
      );
    });

    it('should handle unexpected errors', () => {
      const error = new Error('Unexpected error');

      errorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);

      expect(statusSpy).toHaveBeenCalledWith(500);
      expect(jsonSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'An unexpected error occurred',
          code: ErrorCode.INTERNAL_ERROR
        })
      );
    });

    it('should include stack trace in development', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      const error = new Error('Test error');

      errorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);

      expect(jsonSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          stack: expect.stringContaining('Error: Test error')
        })
      );

      process.env.NODE_ENV = originalEnv;
    });

    it('should not include stack trace in production', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const error = new Error('Test error');

      errorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);

      expect(jsonSpy).toHaveBeenCalledWith(
        expect.not.objectContaining({
          stack: expect.anything()
        })
      );

      process.env.NODE_ENV = originalEnv;
    });

    it('should handle malformed Zod error gracefully', () => {
      const zodError = new Error('invalid json');
      zodError.name = 'ValidationError';

      errorHandler(zodError, mockRequest as Request, mockResponse as Response, mockNext);

      expect(statusSpy).toHaveBeenCalledWith(400);
      expect(jsonSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Validation failed',
          details: { message: 'invalid json' }
        })
      );
    });
  });

  describe('notFoundHandler', () => {
    it('should handle 404 errors correctly', () => {
      notFoundHandler(mockRequest as Request, mockResponse as Response);

      expect(statusSpy).toHaveBeenCalledWith(404);
      expect(jsonSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Route GET /api/test not found',
          code: ErrorCode.NOT_FOUND,
          requestId: 'test-request-id',
          path: '/api/test'
        })
      );
    });
  });

  describe('requestTrackingMiddleware', () => {
    it('should add request ID and start time', () => {
      const req = {
        ...mockRequest,
        headers: {}
      } as Request;
      delete req.requestId;
      delete req.startTime;

      requestTrackingMiddleware(req, mockResponse as Response, mockNext);

      expect(req.requestId).toMatch(/^req_\d+_[a-z0-9]+$/);
      expect(req.startTime).toBeTypeOf('number');
      expect(mockNext).toHaveBeenCalledTimes(1);
    });

    it('should extract user ID from authorization header', () => {
      const req = {
        ...mockRequest,
        headers: {
          authorization: 'Bearer valid-jwt-token'
        }
      } as Request;
      delete req.userId;

      requestTrackingMiddleware(req, mockResponse as Response, mockNext);

      expect(req.userId).toBe('extracted-from-jwt');
    });

    it('should handle missing authorization header', () => {
      const req = {
        ...mockRequest,
        headers: {}
      } as Request;
      delete req.userId;

      requestTrackingMiddleware(req, mockResponse as Response, mockNext);

      expect(req.userId).toBeUndefined();
    });

    it('should handle invalid authorization header', () => {
      const req = {
        ...mockRequest,
        headers: {
          authorization: 'Invalid header'
        }
      } as Request;
      delete req.userId;

      requestTrackingMiddleware(req, mockResponse as Response, mockNext);

      expect(req.userId).toBeUndefined();
    });
  });

  describe('asyncHandler', () => {
    it('should handle successful async operations', async () => {
      const asyncFn = vi.fn().mockResolvedValue('success');
      const wrappedFn = asyncHandler(asyncFn);

      await wrappedFn(mockRequest, mockResponse, mockNext);

      expect(asyncFn).toHaveBeenCalledWith(mockRequest, mockResponse, mockNext);
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should catch async errors and pass to next', async () => {
      const error = new Error('Async error');
      const asyncFn = vi.fn().mockRejectedValue(error);
      const wrappedFn = asyncHandler(asyncFn);

      wrappedFn(mockRequest, mockResponse, mockNext);
      
      // Wait for the promise to be resolved/rejected
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(asyncFn).toHaveBeenCalledWith(mockRequest, mockResponse, mockNext);
      expect(mockNext).toHaveBeenCalledWith(error);
    });

    it('should handle synchronous functions', async () => {
      const syncFn = vi.fn().mockReturnValue('success');
      const wrappedFn = asyncHandler(syncFn);

      await wrappedFn(mockRequest, mockResponse, mockNext);

      expect(syncFn).toHaveBeenCalledWith(mockRequest, mockResponse, mockNext);
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('setupGlobalErrorHandlers', () => {
    let originalListeners: any;

    beforeEach(() => {
      // Store original listeners
      originalListeners = {
        unhandledRejection: process.listeners('unhandledRejection'),
        uncaughtException: process.listeners('uncaughtException'),
        SIGTERM: process.listeners('SIGTERM'),
        SIGINT: process.listeners('SIGINT')
      };

      // Remove existing listeners
      process.removeAllListeners('unhandledRejection');
      process.removeAllListeners('uncaughtException');
      process.removeAllListeners('SIGTERM');
      process.removeAllListeners('SIGINT');
    });

    afterEach(() => {
      // Restore original listeners
      process.removeAllListeners('unhandledRejection');
      process.removeAllListeners('uncaughtException');
      process.removeAllListeners('SIGTERM');
      process.removeAllListeners('SIGINT');

      Object.entries(originalListeners).forEach(([event, listeners]) => {
        (listeners as Function[]).forEach(listener => {
          process.on(event as any, listener);
        });
      });
    });

    it('should set up global error handlers', () => {
      setupGlobalErrorHandlers();

      expect(process.listenerCount('unhandledRejection')).toBe(1);
      expect(process.listenerCount('uncaughtException')).toBe(1);
      expect(process.listenerCount('SIGTERM')).toBe(1);
      expect(process.listenerCount('SIGINT')).toBe(1);
    });

    it('should handle unhandled promise rejections', () => {
      const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      setupGlobalErrorHandlers();

      // Emit unhandled rejection
      process.emit('unhandledRejection', new Error('Test rejection'), Promise.resolve());

      expect(mockExit).toHaveBeenCalledWith(1);

      process.env.NODE_ENV = originalEnv;
      mockExit.mockRestore();
    });

    it('should handle uncaught exceptions', () => {
      const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

      setupGlobalErrorHandlers();

      // Emit uncaught exception
      process.emit('uncaughtException', new Error('Test exception'));

      expect(mockExit).toHaveBeenCalledWith(1);

      mockExit.mockRestore();
    });

    it('should handle SIGTERM gracefully', () => {
      const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

      setupGlobalErrorHandlers();

      // Emit SIGTERM
      process.emit('SIGTERM');

      expect(mockExit).toHaveBeenCalledWith(0);

      mockExit.mockRestore();
    });

    it('should handle SIGINT gracefully', () => {
      const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

      setupGlobalErrorHandlers();

      // Emit SIGINT
      process.emit('SIGINT');

      expect(mockExit).toHaveBeenCalledWith(0);

      mockExit.mockRestore();
    });
  });
});