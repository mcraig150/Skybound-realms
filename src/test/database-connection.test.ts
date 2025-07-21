import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DatabaseConnection } from '../shared/database';

// Mock pg module for testing
vi.mock('pg', () => {
  let shouldFailConnection = false;
  let connectionAttempts = 0;
  let shouldFailQuery = false;
  let queryAttempts = 0;

  const mockClient = {
    query: vi.fn().mockImplementation((sql: string, params?: any[]) => {
      if (shouldFailQuery && queryAttempts < 2) {
        queryAttempts++;
        return Promise.reject(new Error('Connection timeout'));
      }
      queryAttempts = 0;
      
      if (sql.includes('SELECT NOW()') || sql.includes('SELECT 1')) {
        return Promise.resolve({ rows: [{ now: new Date() }] });
      }
      if (sql.includes('test_connection')) {
        return Promise.resolve({ rows: [{ test: 1 }] });
      }
      return Promise.resolve({ rows: [] });
    }),
    release: vi.fn(),
  };

  const mockPool = {
    connect: vi.fn().mockImplementation(() => {
      if (shouldFailConnection && connectionAttempts < 2) {
        connectionAttempts++;
        return Promise.reject(new Error('Connection failed'));
      }
      connectionAttempts = 0;
      return Promise.resolve(mockClient);
    }),
    end: vi.fn().mockResolvedValue(undefined),
    query: vi.fn().mockImplementation(mockClient.query),
    on: vi.fn(),
    totalCount: 10,
    idleCount: 5,
    waitingCount: 0,
  };

  // Expose control functions for tests
  (mockPool as any).setConnectionFailure = (fail: boolean) => {
    shouldFailConnection = fail;
    connectionAttempts = 0;
  };
  
  (mockPool as any).setQueryFailure = (fail: boolean) => {
    shouldFailQuery = fail;
    queryAttempts = 0;
  };

  return {
    Pool: vi.fn(() => mockPool),
  };
});

describe('Enhanced Database Connection', () => {
  let dbInstance: DatabaseConnection;

  beforeEach(() => {
    dbInstance = DatabaseConnection.getInstance();
  });

  afterEach(async () => {
    await dbInstance.disconnect();
  });

  describe('Connection Management with Retry Logic', () => {
    it('should establish connection successfully', async () => {
      await dbInstance.connect();
      expect(dbInstance.isHealthy()).toBe(true);
    });

    it('should provide detailed connection information', async () => {
      await dbInstance.connect();
      const info = dbInstance.getConnectionInfo();
      
      expect(info).toHaveProperty('isConnected');
      expect(info).toHaveProperty('connectionAttempts');
      expect(info).toHaveProperty('maxConnectionAttempts');
      expect(info).toHaveProperty('poolStatus');
      expect(info.poolStatus).toHaveProperty('totalCount');
      expect(info.poolStatus).toHaveProperty('idleCount');
      expect(info.poolStatus).toHaveProperty('waitingCount');
    });

    it('should test connection with response time', async () => {
      await dbInstance.connect();
      const testResult = await dbInstance.testConnection();
      
      expect(testResult).toHaveProperty('success');
      expect(testResult).toHaveProperty('responseTime');
      expect(testResult.success).toBe(true);
      expect(typeof testResult.responseTime).toBe('number');
      expect(testResult.responseTime).toBeGreaterThan(0);
    });

    it('should handle connection test failures', async () => {
      // Mock a connection that fails health check
      const mockPool = require('pg').Pool();
      mockPool.setQueryFailure(true);
      
      await dbInstance.connect();
      const testResult = await dbInstance.testConnection();
      
      expect(testResult.success).toBe(false);
      expect(testResult).toHaveProperty('error');
      expect(typeof testResult.error).toBe('string');
    });
  });

  describe('Query Retry Logic', () => {
    it('should retry failed queries with exponential backoff', async () => {
      await dbInstance.connect();
      
      // Mock temporary query failures
      const mockPool = require('pg').Pool();
      mockPool.setQueryFailure(true);
      
      const startTime = Date.now();
      const result = await dbInstance.query('SELECT 1 as test_connection');
      const duration = Date.now() - startTime;
      
      // Should have retried and eventually succeeded
      expect(result).toBeDefined();
      expect(duration).toBeGreaterThan(1000); // Should have taken time due to retries
    });

    it('should not retry non-retryable errors', async () => {
      await dbInstance.connect();
      
      const startTime = Date.now();
      await expect(
        dbInstance.query('SELECT * FROM non_existent_table')
      ).rejects.toThrow();
      const duration = Date.now() - startTime;
      
      // Should fail immediately without retries
      expect(duration).toBeLessThan(500);
    });
  });

  describe('Transaction Management with Retry', () => {
    it('should handle transaction retries', async () => {
      await dbInstance.connect();
      
      const result = await dbInstance.transaction(async (client) => {
        await client.query('SELECT 1');
        return 'success';
      });
      
      expect(result).toBe('success');
    });

    it('should rollback failed transactions', async () => {
      await dbInstance.connect();
      
      await expect(
        dbInstance.transaction(async (client) => {
          await client.query('SELECT 1');
          throw new Error('Intentional error to trigger rollback');
        })
      ).rejects.toThrow('Intentional error to trigger rollback');
    });
  });

  describe('Graceful Shutdown', () => {
    it('should perform graceful shutdown', async () => {
      await dbInstance.connect();
      expect(dbInstance.isHealthy()).toBe(true);
      
      await dbInstance.gracefulShutdown();
      expect(dbInstance.isHealthy()).toBe(false);
    });

    it('should wait for active connections during shutdown', async () => {
      await dbInstance.connect();
      
      const startTime = Date.now();
      await dbInstance.gracefulShutdown();
      const duration = Date.now() - startTime;
      
      // Should complete shutdown quickly when no active connections
      expect(duration).toBeLessThan(5000);
    });
  });

  describe('Error Handling and Monitoring', () => {
    it('should track connection attempts', async () => {
      const info = dbInstance.getConnectionInfo();
      expect(info.connectionAttempts).toBe(0);
      expect(info.maxConnectionAttempts).toBe(5);
    });

    it('should provide pool status monitoring', async () => {
      await dbInstance.connect();
      const status = dbInstance.getPoolStatus();
      
      expect(typeof status.totalCount).toBe('number');
      expect(typeof status.idleCount).toBe('number');
      expect(typeof status.waitingCount).toBe('number');
      expect(status.totalCount).toBeGreaterThanOrEqual(0);
      expect(status.idleCount).toBeGreaterThanOrEqual(0);
      expect(status.waitingCount).toBeGreaterThanOrEqual(0);
    });

    it('should handle health check properly', async () => {
      // Before connection
      expect(dbInstance.isHealthy()).toBe(false);
      
      // After connection
      await dbInstance.connect();
      expect(dbInstance.isHealthy()).toBe(true);
      
      // After disconnection
      await dbInstance.disconnect();
      expect(dbInstance.isHealthy()).toBe(false);
    });
  });

  describe('Connection Pool Configuration', () => {
    it('should have proper pool configuration', () => {
      const info = dbInstance.getConnectionInfo();
      const poolStatus = info.poolStatus;
      
      // Verify pool is configured with expected values
      expect(poolStatus.totalCount).toBeDefined();
      expect(poolStatus.idleCount).toBeDefined();
      expect(poolStatus.waitingCount).toBeDefined();
    });

    it('should maintain singleton pattern', () => {
      const instance1 = DatabaseConnection.getInstance();
      const instance2 = DatabaseConnection.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe('Performance Monitoring', () => {
    it('should track query performance', async () => {
      await dbInstance.connect();
      
      // Mock console.warn to capture performance warnings
      const originalWarn = console.warn;
      const warnings: string[] = [];
      console.warn = (message: string) => warnings.push(message);
      
      try {
        await dbInstance.query('SELECT 1 as test_connection');
        
        // Fast queries should not generate warnings
        const slowQueryWarnings = warnings.filter(w => w.includes('Slow query detected'));
        expect(slowQueryWarnings).toHaveLength(0);
      } finally {
        console.warn = originalWarn;
      }
    });

    it('should handle concurrent operations', async () => {
      await dbInstance.connect();
      
      const concurrentOperations = Array.from({ length: 5 }, (_, i) =>
        dbInstance.query('SELECT $1 as test_value', [i])
      );
      
      const results = await Promise.all(concurrentOperations);
      expect(results).toHaveLength(5);
    });
  });
});