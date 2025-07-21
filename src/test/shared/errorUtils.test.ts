// Unit tests for error utilities
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  withDatabaseErrorHandling,
  withCacheErrorHandling,
  withExternalServiceErrorHandling,
  withRetry,
  CircuitBreaker,
  withTimeout,
  safeJsonParse,
  safeAsync,
  validateEnvironment,
  createHealthCheck
} from '../../shared/errorUtils';
import { DatabaseError, CacheError, ExternalServiceError, AppError } from '../../shared/errors';
import { Logger } from '../../shared/logger';

// Mock logger
vi.mock('../../shared/logger', () => ({
  getLogger: vi.fn(() => ({
    logPerformance: vi.fn(),
    logDatabaseError: vi.fn(),
    logCacheError: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn()
  }))
}));

describe('Error Utils', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('withDatabaseErrorHandling', () => {
    it('should execute operation successfully and log performance', async () => {
      const mockOperation = vi.fn().mockResolvedValue('success');
      const context = {
        operation: 'SELECT',
        query: 'SELECT * FROM players',
        table: 'players'
      };

      const result = await withDatabaseErrorHandling(mockOperation, context);

      expect(result).toBe('success');
      expect(mockOperation).toHaveBeenCalledTimes(1);
    });

    it('should handle database errors and throw DatabaseError', async () => {
      const dbError = new Error('Connection failed');
      const mockOperation = vi.fn().mockRejectedValue(dbError);
      const context = {
        operation: 'INSERT',
        query: 'INSERT INTO players...',
        params: ['user123'],
        table: 'players'
      };

      await expect(withDatabaseErrorHandling(mockOperation, context))
        .rejects.toThrow(DatabaseError);
    });
  });

  describe('withCacheErrorHandling', () => {
    it('should execute cache operation successfully', async () => {
      const mockOperation = vi.fn().mockResolvedValue('cached_value');
      const context = {
        operation: 'GET',
        key: 'player:123',
        ttl: 3600
      };

      const result = await withCacheErrorHandling(mockOperation, context);

      expect(result).toBe('cached_value');
      expect(mockOperation).toHaveBeenCalledTimes(1);
    });

    it('should handle cache errors and throw CacheError', async () => {
      const cacheError = new Error('Redis connection failed');
      const mockOperation = vi.fn().mockRejectedValue(cacheError);
      const context = {
        operation: 'SET',
        key: 'player:123'
      };

      await expect(withCacheErrorHandling(mockOperation, context))
        .rejects.toThrow(CacheError);
    });
  });

  describe('withExternalServiceErrorHandling', () => {
    it('should execute external service call successfully', async () => {
      const mockOperation = vi.fn().mockResolvedValue({ status: 'ok' });
      const context = {
        service: 'payment-api',
        endpoint: '/api/charge',
        method: 'POST'
      };

      const result = await withExternalServiceErrorHandling(mockOperation, context);

      expect(result).toEqual({ status: 'ok' });
      expect(mockOperation).toHaveBeenCalledTimes(1);
    });

    it('should handle external service errors', async () => {
      const serviceError = new Error('Service unavailable');
      const mockOperation = vi.fn().mockRejectedValue(serviceError);
      const context = {
        service: 'payment-api',
        endpoint: '/api/charge'
      };

      await expect(withExternalServiceErrorHandling(mockOperation, context))
        .rejects.toThrow(ExternalServiceError);
    });
  });

  describe('withRetry', () => {
    it('should succeed on first attempt', async () => {
      const mockOperation = vi.fn().mockResolvedValue('success');

      const result = await withRetry(mockOperation);

      expect(result).toBe('success');
      expect(mockOperation).toHaveBeenCalledTimes(1);
    });

    it('should retry on failure and eventually succeed', async () => {
      const mockOperation = vi.fn()
        .mockRejectedValueOnce(new Error('Temporary failure'))
        .mockRejectedValueOnce(new Error('Another failure'))
        .mockResolvedValue('success');

      const result = await withRetry(mockOperation, {
        maxRetries: 3,
        baseDelay: 10 // Short delay for testing
      });

      expect(result).toBe('success');
      expect(mockOperation).toHaveBeenCalledTimes(3);
    });

    it('should fail after max retries', async () => {
      const mockOperation = vi.fn().mockRejectedValue(new Error('Persistent failure'));

      await expect(withRetry(mockOperation, {
        maxRetries: 2,
        baseDelay: 10
      })).rejects.toThrow('Persistent failure');

      expect(mockOperation).toHaveBeenCalledTimes(3); // Initial + 2 retries
    });

    it('should not retry operational errors', async () => {
      const operationalError = new AppError('Validation failed', 400, 'VALIDATION_ERROR', true);
      const mockOperation = vi.fn().mockRejectedValue(operationalError);

      await expect(withRetry(mockOperation)).rejects.toThrow('Validation failed');

      expect(mockOperation).toHaveBeenCalledTimes(1); // No retries
    });

    it('should respect custom retry condition', async () => {
      const mockOperation = vi.fn().mockRejectedValue(new Error('Custom error'));
      const retryCondition = vi.fn().mockReturnValue(false);

      await expect(withRetry(mockOperation, { retryCondition }))
        .rejects.toThrow('Custom error');

      expect(mockOperation).toHaveBeenCalledTimes(1);
      expect(retryCondition).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  describe('CircuitBreaker', () => {
    let circuitBreaker: CircuitBreaker;

    beforeEach(() => {
      circuitBreaker = new CircuitBreaker({
        failureThreshold: 2,
        recoveryTimeout: 1000,
        monitoringPeriod: 5000
      });
    });

    it('should execute operation when circuit is closed', async () => {
      const mockOperation = vi.fn().mockResolvedValue('success');

      const result = await circuitBreaker.execute(mockOperation);

      expect(result).toBe('success');
      expect(circuitBreaker.getState()).toBe('CLOSED');
    });

    it('should open circuit after failure threshold', async () => {
      const mockOperation = vi.fn().mockRejectedValue(new Error('Failure'));

      // First failure
      await expect(circuitBreaker.execute(mockOperation)).rejects.toThrow('Failure');
      expect(circuitBreaker.getState()).toBe('CLOSED');
      expect(circuitBreaker.getFailures()).toBe(1);

      // Second failure - should open circuit
      await expect(circuitBreaker.execute(mockOperation)).rejects.toThrow('Failure');
      expect(circuitBreaker.getState()).toBe('OPEN');
      expect(circuitBreaker.getFailures()).toBe(2);
    });

    it('should reject immediately when circuit is open', async () => {
      const mockOperation = vi.fn().mockRejectedValue(new Error('Failure'));

      // Trigger failures to open circuit
      await expect(circuitBreaker.execute(mockOperation)).rejects.toThrow();
      await expect(circuitBreaker.execute(mockOperation)).rejects.toThrow();

      expect(circuitBreaker.getState()).toBe('OPEN');

      // Should reject immediately without calling operation
      mockOperation.mockClear();
      await expect(circuitBreaker.execute(mockOperation))
        .rejects.toThrow('Circuit breaker is OPEN');
      expect(mockOperation).not.toHaveBeenCalled();
    });

    it('should transition to half-open after recovery timeout', async () => {
      const mockOperation = vi.fn()
        .mockRejectedValueOnce(new Error('Failure'))
        .mockRejectedValueOnce(new Error('Failure'))
        .mockResolvedValue('success');

      // Open circuit
      await expect(circuitBreaker.execute(mockOperation)).rejects.toThrow();
      await expect(circuitBreaker.execute(mockOperation)).rejects.toThrow();
      expect(circuitBreaker.getState()).toBe('OPEN');

      // Wait for recovery timeout (simulate by manipulating time)
      vi.useFakeTimers();
      vi.advanceTimersByTime(1001);

      // Should transition to half-open and succeed
      const result = await circuitBreaker.execute(mockOperation);
      expect(result).toBe('success');
      expect(circuitBreaker.getState()).toBe('CLOSED');

      vi.useRealTimers();
    });
  });

  describe('withTimeout', () => {
    it('should resolve if operation completes within timeout', async () => {
      const mockOperation = vi.fn().mockResolvedValue('success');

      const result = await withTimeout(mockOperation, 1000);

      expect(result).toBe('success');
    });

    it('should reject if operation exceeds timeout', async () => {
      const mockOperation = vi.fn().mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve('success'), 2000))
      );

      await expect(withTimeout(mockOperation, 100, 'Custom timeout'))
        .rejects.toThrow('Custom timeout');
    });
  });

  describe('safeJsonParse', () => {
    it('should parse valid JSON', () => {
      const jsonString = '{"key": "value"}';
      const result = safeJsonParse(jsonString, {});

      expect(result).toEqual({ key: 'value' });
    });

    it('should return default value for invalid JSON', () => {
      const invalidJson = '{"key": invalid}';
      const defaultValue = { default: true };
      
      const result = safeJsonParse(invalidJson, defaultValue);

      expect(result).toBe(defaultValue);
    });
  });

  describe('safeAsync', () => {
    it('should return operation result on success', async () => {
      const mockOperation = vi.fn().mockResolvedValue('success');
      const defaultValue = 'default';

      const result = await safeAsync(mockOperation, defaultValue);

      expect(result).toBe('success');
    });

    it('should return default value on error', async () => {
      const mockOperation = vi.fn().mockRejectedValue(new Error('Failure'));
      const defaultValue = 'default';

      const result = await safeAsync(mockOperation, defaultValue, { context: 'test' });

      expect(result).toBe(defaultValue);
    });
  });

  describe('validateEnvironment', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('should pass validation when all variables are present', () => {
      process.env.DATABASE_URL = 'postgres://localhost';
      process.env.REDIS_URL = 'redis://localhost';

      expect(() => validateEnvironment(['DATABASE_URL', 'REDIS_URL']))
        .not.toThrow();
    });

    it('should throw error when variables are missing', () => {
      delete process.env.DATABASE_URL;
      process.env.REDIS_URL = 'redis://localhost';

      expect(() => validateEnvironment(['DATABASE_URL', 'REDIS_URL']))
        .toThrow('Missing required environment variables: DATABASE_URL');
    });
  });

  describe('createHealthCheck', () => {
    it('should return healthy status when check passes', async () => {
      const mockCheck = vi.fn().mockResolvedValue(true);
      const healthCheck = createHealthCheck('database', mockCheck);

      const result = await healthCheck();

      expect(result.status).toBe('healthy');
      expect(result.message).toBe('database is healthy');
      expect(result.details?.duration).toBeDefined();
      expect(result.timestamp).toBeInstanceOf(Date);
    });

    it('should return unhealthy status when check fails', async () => {
      const mockCheck = vi.fn().mockResolvedValue(false);
      const healthCheck = createHealthCheck('cache', mockCheck);

      const result = await healthCheck();

      expect(result.status).toBe('unhealthy');
      expect(result.message).toBe('cache is unhealthy');
    });

    it('should return unhealthy status when check throws error', async () => {
      const mockCheck = vi.fn().mockRejectedValue(new Error('Connection failed'));
      const healthCheck = createHealthCheck('external-api', mockCheck);

      const result = await healthCheck();

      expect(result.status).toBe('unhealthy');
      expect(result.message).toBe('external-api health check failed: Connection failed');
      expect(result.details?.error).toBe('Connection failed');
    });

    it('should timeout long-running health checks', async () => {
      const mockCheck = vi.fn().mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve(true), 2000))
      );
      const healthCheck = createHealthCheck('slow-service', mockCheck, 100);

      const result = await healthCheck();

      expect(result.status).toBe('unhealthy');
      expect(result.message).toBe('slow-service health check failed: slow-service health check timed out');
    });
  });
});