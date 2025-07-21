// Unit tests for error handling system
import { describe, it, expect, beforeEach } from 'vitest';
import {
  AppError,
  ValidationFailureError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
  DatabaseError,
  CacheError,
  BusinessLogicError,
  ExternalServiceError,
  RateLimitError,
  ConfigurationError,
  GameError,
  InsufficientResourcesError,
  InvalidGameStateError,
  CooldownError
} from '../../shared/errors';
import { ErrorCode } from '../../shared/types';

describe('Error Classes', () => {
  describe('AppError', () => {
    class TestError extends AppError {
      constructor(message: string) {
        super(message, 400, ErrorCode.VALIDATION_ERROR, true, { test: 'context' });
      }
    }

    it('should create error with all properties', () => {
      const error = new TestError('Test message');
      
      expect(error.message).toBe('Test message');
      expect(error.statusCode).toBe(400);
      expect(error.code).toBe(ErrorCode.VALIDATION_ERROR);
      expect(error.isOperational).toBe(true);
      expect(error.context).toEqual({ test: 'context' });
      expect(error.timestamp).toBeInstanceOf(Date);
      expect(error.name).toBe('TestError');
    });

    it('should convert to JSON correctly', () => {
      const error = new TestError('Test message');
      const json = error.toJSON();
      
      expect(json.name).toBe('TestError');
      expect(json.message).toBe('Test message');
      expect(json.statusCode).toBe(400);
      expect(json.code).toBe(ErrorCode.VALIDATION_ERROR);
      expect(json.context).toEqual({ test: 'context' });
      expect(json.timestamp).toBeInstanceOf(Date);
      expect(json.stack).toBeDefined();
    });
  });

  describe('ValidationFailureError', () => {
    it('should create validation error with validation details', () => {
      const validationErrors = [
        { field: 'username', message: 'Required', value: undefined },
        { field: 'email', message: 'Invalid format', value: 'invalid-email' }
      ];
      
      const error = new ValidationFailureError('Validation failed', validationErrors);
      
      expect(error.message).toBe('Validation failed');
      expect(error.statusCode).toBe(400);
      expect(error.code).toBe(ErrorCode.VALIDATION_ERROR);
      expect(error.validationErrors).toEqual(validationErrors);
    });

    it('should create from Zod error', () => {
      const zodError = {
        errors: [
          { path: ['username'], message: 'Required', received: undefined },
          { path: ['email'], message: 'Invalid email', received: 'invalid' }
        ]
      };
      
      const error = ValidationFailureError.fromZodError(zodError, { source: 'api' });
      
      expect(error.message).toBe('Validation failed');
      expect(error.validationErrors).toHaveLength(2);
      expect(error.validationErrors[0].field).toBe('username');
      expect(error.validationErrors[1].field).toBe('email');
      expect(error.context).toEqual({ source: 'api' });
    });
  });

  describe('NotFoundError', () => {
    it('should create not found error with resource name', () => {
      const error = new NotFoundError('Player');
      
      expect(error.message).toBe('Player not found');
      expect(error.statusCode).toBe(404);
      expect(error.code).toBe(ErrorCode.NOT_FOUND);
    });

    it('should create not found error with identifier', () => {
      const error = new NotFoundError('Player', 'user123');
      
      expect(error.message).toBe("Player with identifier 'user123' not found");
    });
  });

  describe('UnauthorizedError', () => {
    it('should create unauthorized error with default message', () => {
      const error = new UnauthorizedError();
      
      expect(error.message).toBe('Authentication required');
      expect(error.statusCode).toBe(401);
      expect(error.code).toBe(ErrorCode.UNAUTHORIZED);
    });

    it('should create unauthorized error with custom message', () => {
      const error = new UnauthorizedError('Invalid token');
      
      expect(error.message).toBe('Invalid token');
    });
  });

  describe('ForbiddenError', () => {
    it('should create forbidden error with default message', () => {
      const error = new ForbiddenError();
      
      expect(error.message).toBe('Access forbidden');
      expect(error.statusCode).toBe(403);
      expect(error.code).toBe(ErrorCode.FORBIDDEN);
    });
  });

  describe('DatabaseError', () => {
    it('should create database error with query context', () => {
      const originalError = new Error('Connection failed');
      const query = 'SELECT * FROM players';
      
      const error = new DatabaseError('Database operation failed', originalError, query);
      
      expect(error.message).toBe('Database operation failed');
      expect(error.statusCode).toBe(500);
      expect(error.code).toBe(ErrorCode.DATABASE_ERROR);
      expect(error.originalError).toBe(originalError);
      expect(error.query).toBe(query);
    });

    it('should create from PostgreSQL error', () => {
      const pgError = {
        code: '23505',
        message: 'duplicate key value violates unique constraint',
        detail: 'Key (username)=(test) already exists.',
        hint: 'Use a different username'
      };
      
      const error = DatabaseError.fromPgError(pgError, 'INSERT INTO players...');
      
      expect(error.message).toBe('Resource already exists');
      expect(error.context?.pgCode).toBe('23505');
      expect(error.context?.pgDetail).toBe('Key (username)=(test) already exists.');
      expect(error.query).toBe('INSERT INTO players...');
    });
  });

  describe('CacheError', () => {
    it('should create cache error with operation context', () => {
      const error = new CacheError('Cache set failed', 'SET', 'player:123');
      
      expect(error.message).toBe('Cache set failed');
      expect(error.statusCode).toBe(500);
      expect(error.code).toBe(ErrorCode.CACHE_ERROR);
      expect(error.operation).toBe('SET');
      expect(error.key).toBe('player:123');
    });
  });

  describe('ExternalServiceError', () => {
    it('should create external service error', () => {
      const originalError = new Error('Service unavailable');
      const error = new ExternalServiceError('Payment service failed', 'payment-api', originalError);
      
      expect(error.message).toBe('Payment service failed');
      expect(error.statusCode).toBe(503);
      expect(error.service).toBe('payment-api');
      expect(error.originalError).toBe(originalError);
    });
  });

  describe('RateLimitError', () => {
    it('should create rate limit error with retry after', () => {
      const error = new RateLimitError('Too many requests', 120);
      
      expect(error.message).toBe('Too many requests');
      expect(error.statusCode).toBe(429);
      expect(error.retryAfter).toBe(120);
    });
  });

  describe('Game-specific Errors', () => {
    describe('InsufficientResourcesError', () => {
      it('should create insufficient resources error', () => {
        const error = new InsufficientResourcesError('gold', 100, 50);
        
        expect(error.message).toBe('Insufficient gold: required 100, available 50');
        expect(error.context?.resource).toBe('gold');
        expect(error.context?.required).toBe(100);
        expect(error.context?.available).toBe(50);
      });
    });

    describe('InvalidGameStateError', () => {
      it('should create invalid game state error', () => {
        const error = new InvalidGameStateError('Cannot attack while in safe zone', 'safe_zone', 'combat_zone');
        
        expect(error.message).toBe('Cannot attack while in safe zone');
        expect(error.context?.currentState).toBe('safe_zone');
        expect(error.context?.expectedState).toBe('combat_zone');
      });
    });

    describe('CooldownError', () => {
      it('should create cooldown error', () => {
        const error = new CooldownError('fireball', 5000);
        
        expect(error.message).toBe("Action 'fireball' is on cooldown for 5000ms");
        expect(error.remainingTime).toBe(5000);
        expect(error.context?.action).toBe('fireball');
      });
    });
  });

  describe('ConfigurationError', () => {
    it('should create configuration error as non-operational', () => {
      const error = new ConfigurationError('Missing database URL');
      
      expect(error.message).toBe('Missing database URL');
      expect(error.statusCode).toBe(500);
      expect(error.code).toBe(ErrorCode.INTERNAL_ERROR);
      expect(error.isOperational).toBe(false);
    });
  });
});