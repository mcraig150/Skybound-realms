import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OptimizedDatabaseService } from '../../services/OptimizedDatabaseService';

// Mock the database and optimization service modules
const mockDatabase = {
  query: vi.fn(),
  transaction: vi.fn(),
  getPoolStatus: vi.fn()
};

const mockOptimizationService = {
  trackQuery: vi.fn(),
  generateOptimizationRecommendations: vi.fn()
};

vi.mock('../../shared/database', () => ({
  database: mockDatabase
}));

vi.mock('../../services/DatabaseOptimizationService', () => ({
  databaseOptimizationService: mockOptimizationService
}));

describe('OptimizedDatabaseService', () => {
  let optimizedDbService: OptimizedDatabaseService;

  beforeEach(() => {
    optimizedDbService = new OptimizedDatabaseService();
    vi.clearAllMocks();
  });

  describe('Query Execution', () => {
    it('should execute query with performance tracking', async () => {
      const mockResult = [{ id: 1, name: 'test' }];
      mockDatabase.query.mockResolvedValue(mockResult);

      const result = await optimizedDbService.query(
        'SELECT * FROM test WHERE id = $1',
        [1],
        { trackPerformance: true }
      );

      expect(result).toEqual(mockResult);
      expect(mockDatabase.query).toHaveBeenCalledWith(
        'SELECT * FROM test WHERE id = $1',
        [1]
      );
      expect(mockOptimizationService.trackQuery).toHaveBeenCalled();
    });

    it('should handle query timeout', async () => {
      mockDatabase.query.mockImplementation(() => 
        new Promise(resolve => setTimeout(resolve, 2000))
      );

      await expect(
        optimizedDbService.query('SELECT * FROM test', [], { timeout: 100 })
      ).rejects.toThrow('Query timeout');
    });

    it('should cache query results', async () => {
      const mockResult = [{ id: 1, name: 'test' }];
      mockDatabase.query.mockResolvedValue(mockResult);

      // First call - should hit database
      const result1 = await optimizedDbService.query(
        'SELECT * FROM test',
        [],
        { cacheKey: 'test-cache', cacheTTL: 5000 }
      );

      // Second call - should use cache
      const result2 = await optimizedDbService.query(
        'SELECT * FROM test',
        [],
        { cacheKey: 'test-cache', cacheTTL: 5000 }
      );

      expect(result1).toEqual(mockResult);
      expect(result2).toEqual(mockResult);
      expect(mockDatabase.query).toHaveBeenCalledTimes(1); // Only called once due to caching
    });

    it('should track performance on query errors', async () => {
      mockDatabase.query.mockRejectedValue(new Error('Query failed'));

      await expect(
        optimizedDbService.query('INVALID QUERY', [], { trackPerformance: true })
      ).rejects.toThrow('Query failed');

      expect(mockOptimizationService.trackQuery).toHaveBeenCalled();
    });
  });

  describe('Transaction Execution', () => {
    it('should execute transaction with performance tracking', async () => {
      const mockResult = { success: true };
      mockDatabase.transaction.mockImplementation(async (callback) => {
        return await callback({} as any);
      });

      const result = await optimizedDbService.transaction(
        async () => mockResult,
        { trackPerformance: true }
      );

      expect(result).toEqual(mockResult);
      expect(mockDatabase.transaction).toHaveBeenCalled();
      expect(mockOptimizationService.trackQuery).toHaveBeenCalledWith(
        'TRANSACTION',
        expect.any(Number),
        1
      );
    });

    it('should handle transaction timeout', async () => {
      mockDatabase.transaction.mockImplementation(() => 
        new Promise(resolve => setTimeout(resolve, 2000))
      );

      await expect(
        optimizedDbService.transaction(async () => {}, { timeout: 100 })
      ).rejects.toThrow('Transaction timeout');
    });

    it('should track performance on transaction errors', async () => {
      mockDatabase.transaction.mockRejectedValue(new Error('Transaction failed'));

      await expect(
        optimizedDbService.transaction(async () => {}, { trackPerformance: true })
      ).rejects.toThrow('Transaction failed');

      expect(mockOptimizationService.trackQuery).toHaveBeenCalledWith(
        'TRANSACTION_ERROR',
        expect.any(Number),
        0
      );
    });
  });

  describe('Prepared Statements', () => {
    it('should execute prepared statements', async () => {
      const mockResult = [{ id: 1 }];
      mockDatabase.query.mockResolvedValue(mockResult);

      const result = await optimizedDbService.executePrepared(
        'get_player',
        'SELECT * FROM players WHERE id = $1',
        ['player123']
      );

      expect(result).toEqual(mockResult);
      expect(mockOptimizationService.trackQuery).toHaveBeenCalledWith(
        'PREPARED:get_player',
        expect.any(Number),
        1,
        ['player123']
      );
    });

    it('should track prepared statement errors', async () => {
      mockDatabase.query.mockRejectedValue(new Error('Prepared statement failed'));

      await expect(
        optimizedDbService.executePrepared(
          'failing_statement',
          'INVALID SQL',
          []
        )
      ).rejects.toThrow('Prepared statement failed');

      expect(mockOptimizationService.trackQuery).toHaveBeenCalledWith(
        'PREPARED_ERROR:failing_statement',
        expect.any(Number),
        0,
        []
      );
    });

    it('should store prepared statement info', async () => {
      mockDatabase.query.mockResolvedValue([]);

      await optimizedDbService.executePrepared(
        'test_statement',
        'SELECT 1',
        []
      );

      const statements = optimizedDbService.getPreparedStatements();
      expect(statements).toHaveLength(1);
      expect(statements[0].name).toBe('test_statement');
      expect(statements[0].query).toBe('SELECT 1');
    });
  });

  describe('Batch Operations', () => {
    it('should execute batch insert', async () => {
      const mockTransaction = vi.fn(async (callback) => {
        const mockClient = { query: vi.fn().mockResolvedValue({}) };
        return await callback(mockClient);
      });
      mockDatabase.transaction.mockImplementation(mockTransaction);

      const columns = ['name', 'email'];
      const values = [
        ['John', 'john@example.com'],
        ['Jane', 'jane@example.com']
      ];

      await optimizedDbService.batchInsert('users', columns, values);

      expect(mockDatabase.transaction).toHaveBeenCalled();
      expect(mockOptimizationService.trackQuery).toHaveBeenCalledWith(
        'BATCH_INSERT:users',
        expect.any(Number),
        2
      );
    });

    it('should handle batch insert with conflict resolution', async () => {
      const mockTransaction = vi.fn(async (callback) => {
        const mockClient = { query: vi.fn().mockResolvedValue({}) };
        return await callback(mockClient);
      });
      mockDatabase.transaction.mockImplementation(mockTransaction);

      await optimizedDbService.batchInsert(
        'users',
        ['name', 'email'],
        [['John', 'john@example.com']],
        { onConflict: 'ON CONFLICT (email) DO NOTHING' }
      );

      expect(mockDatabase.transaction).toHaveBeenCalled();
    });

    it('should handle batch insert errors', async () => {
      mockDatabase.transaction.mockRejectedValue(new Error('Batch insert failed'));

      await expect(
        optimizedDbService.batchInsert('users', ['name'], [['John']])
      ).rejects.toThrow('Batch insert failed');

      expect(mockOptimizationService.trackQuery).toHaveBeenCalledWith(
        'BATCH_INSERT_ERROR:users',
        expect.any(Number),
        0
      );
    });

    it('should handle large batch sizes', async () => {
      const mockTransaction = vi.fn(async (callback) => {
        const mockClient = { query: vi.fn().mockResolvedValue({}) };
        return await callback(mockClient);
      });
      mockDatabase.transaction.mockImplementation(mockTransaction);

      // Create 2500 records (more than default batch size of 1000)
      const values = Array.from({ length: 2500 }, (_, i) => [`user${i}`]);

      await optimizedDbService.batchInsert('users', ['name'], values, { batchSize: 1000 });

      expect(mockDatabase.transaction).toHaveBeenCalled();
      // Should be called 3 times (1000 + 1000 + 500)
    });
  });

  describe('Optimized SELECT', () => {
    it('should build and execute optimized SELECT query', async () => {
      const mockResult = [{ id: 1, name: 'John' }];
      mockDatabase.query.mockResolvedValue(mockResult);

      const result = await optimizedDbService.selectOptimized({
        table: 'users',
        columns: ['id', 'name'],
        where: { active: true, role: 'admin' },
        orderBy: 'name ASC',
        limit: 10,
        offset: 0
      });

      expect(result).toEqual(mockResult);
      expect(mockDatabase.query).toHaveBeenCalledWith(
        'SELECT id, name FROM users WHERE active = $1 AND role = $2 ORDER BY name ASC LIMIT $3 OFFSET $4',
        [true, 'admin', 10, 0]
      );
    });

    it('should handle SELECT with joins', async () => {
      const mockResult = [{ id: 1, name: 'John', skill: 'combat' }];
      mockDatabase.query.mockResolvedValue(mockResult);

      const result = await optimizedDbService.selectOptimized({
        table: 'players',
        columns: ['players.id', 'players.name', 'skills.skill_type'],
        joins: [
          { table: 'player_skills skills', on: 'players.id = skills.player_id', type: 'LEFT' }
        ],
        where: { 'players.active': true }
      });

      expect(result).toEqual(mockResult);
      expect(mockDatabase.query).toHaveBeenCalledWith(
        'SELECT players.id, players.name, skills.skill_type FROM players LEFT JOIN player_skills skills ON players.id = skills.player_id WHERE players.active = $1',
        [true]
      );
    });

    it('should use caching for SELECT queries', async () => {
      const mockResult = [{ id: 1 }];
      mockDatabase.query.mockResolvedValue(mockResult);

      await optimizedDbService.selectOptimized({
        table: 'users',
        cacheKey: 'users-list',
        cacheTTL: 5000
      });

      // Second call should use cache
      await optimizedDbService.selectOptimized({
        table: 'users',
        cacheKey: 'users-list',
        cacheTTL: 5000
      });

      expect(mockDatabase.query).toHaveBeenCalledTimes(1);
    });
  });

  describe('Optimized UPDATE', () => {
    it('should build and execute optimized UPDATE query', async () => {
      const mockResult = [{ id: 1, name: 'Updated Name' }];
      mockDatabase.query.mockResolvedValue(mockResult);

      const result = await optimizedDbService.updateOptimized({
        table: 'users',
        set: { name: 'Updated Name', updated_at: new Date() },
        where: { id: 1 },
        returning: ['id', 'name']
      });

      expect(result).toEqual(mockResult);
      expect(mockDatabase.query).toHaveBeenCalledWith(
        'UPDATE users SET name = $1, updated_at = $2 WHERE id = $3 RETURNING id, name',
        ['Updated Name', expect.any(Date), 1]
      );
    });

    it('should handle UPDATE without RETURNING clause', async () => {
      mockDatabase.query.mockResolvedValue([]);

      await optimizedDbService.updateOptimized({
        table: 'users',
        set: { name: 'Updated Name' },
        where: { id: 1 }
      });

      expect(mockDatabase.query).toHaveBeenCalledWith(
        'UPDATE users SET name = $1 WHERE id = $2',
        ['Updated Name', 1]
      );
    });
  });

  describe('Optimized DELETE', () => {
    it('should build and execute optimized DELETE query', async () => {
      const mockResult = [{ id: 1 }];
      mockDatabase.query.mockResolvedValue(mockResult);

      const result = await optimizedDbService.deleteOptimized({
        table: 'users',
        where: { id: 1, active: false },
        returning: ['id']
      });

      expect(result).toEqual(mockResult);
      expect(mockDatabase.query).toHaveBeenCalledWith(
        'DELETE FROM users WHERE id = $1 AND active = $2 RETURNING id',
        [1, false]
      );
    });
  });

  describe('Aggregation Queries', () => {
    it('should execute aggregation queries', async () => {
      const mockResult = [{ total_users: 100, avg_age: 25.5 }];
      mockDatabase.query.mockResolvedValue(mockResult);

      const result = await optimizedDbService.aggregate({
        table: 'users',
        aggregations: [
          { function: 'COUNT', column: '*', alias: 'total_users' },
          { function: 'AVG', column: 'age', alias: 'avg_age' }
        ],
        where: { active: true },
        groupBy: ['department'],
        orderBy: 'total_users DESC'
      });

      expect(result).toEqual(mockResult);
      expect(mockDatabase.query).toHaveBeenCalledWith(
        'SELECT COUNT(*) AS total_users, AVG(age) AS avg_age FROM users WHERE active = $1 GROUP BY department ORDER BY total_users DESC',
        [true]
      );
    });

    it('should use caching for aggregation queries', async () => {
      const mockResult = [{ count: 100 }];
      mockDatabase.query.mockResolvedValue(mockResult);

      await optimizedDbService.aggregate({
        table: 'users',
        aggregations: [{ function: 'COUNT', column: '*' }],
        cacheKey: 'user-count',
        cacheTTL: 5000
      });

      // Second call should use cache
      await optimizedDbService.aggregate({
        table: 'users',
        aggregations: [{ function: 'COUNT', column: '*' }],
        cacheKey: 'user-count',
        cacheTTL: 5000
      });

      expect(mockDatabase.query).toHaveBeenCalledTimes(1);
    });
  });

  describe('Query Explanation', () => {
    it('should explain query execution plan', async () => {
      const mockExplainResult = [{ 'QUERY PLAN': 'Seq Scan on users' }];
      mockDatabase.query.mockResolvedValue(mockExplainResult);

      const result = await optimizedDbService.explainQuery(
        'SELECT * FROM users WHERE active = $1',
        [true]
      );

      expect(result).toEqual(mockExplainResult);
      expect(mockDatabase.query).toHaveBeenCalledWith(
        'EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) SELECT * FROM users WHERE active = $1',
        [true]
      );
    });
  });

  describe('Cache Management', () => {
    it('should clear cache by pattern', () => {
      // Set up some cached data first
      optimizedDbService['queryCache'].set('user:1', { data: {}, expiry: Date.now() + 5000 });
      optimizedDbService['queryCache'].set('user:2', { data: {}, expiry: Date.now() + 5000 });
      optimizedDbService['queryCache'].set('product:1', { data: {}, expiry: Date.now() + 5000 });

      optimizedDbService.clearCache('user:*');

      const cacheStats = optimizedDbService.getCacheStats();
      expect(cacheStats.totalEntries).toBe(1); // Only product:1 should remain
    });

    it('should clear all cache', () => {
      optimizedDbService['queryCache'].set('test1', { data: {}, expiry: Date.now() + 5000 });
      optimizedDbService['queryCache'].set('test2', { data: {}, expiry: Date.now() + 5000 });

      optimizedDbService.clearCache();

      const cacheStats = optimizedDbService.getCacheStats();
      expect(cacheStats.totalEntries).toBe(0);
    });

    it('should get cache statistics', () => {
      optimizedDbService['queryCache'].set('test', { data: { id: 1 }, expiry: Date.now() + 5000 });

      const stats = optimizedDbService.getCacheStats();
      expect(stats.totalEntries).toBe(1);
      expect(stats.memoryUsage).toBeGreaterThan(0);
      expect(typeof stats.hitRate).toBe('number');
    });
  });

  describe('Health Check', () => {
    it('should perform comprehensive health check', async () => {
      mockDatabase.query.mockResolvedValue([{ test: 1 }]);
      mockDatabase.getPoolStatus.mockReturnValue({
        totalCount: 10,
        idleCount: 5,
        waitingCount: 0
      });
      mockOptimizationService.generateOptimizationRecommendations.mockResolvedValue([
        'Test recommendation'
      ]);

      const health = await optimizedDbService.healthCheck();

      expect(health.isHealthy).toBe(true);
      expect(health.responseTime).toBeGreaterThan(0);
      expect(health.connectionPool).toBeDefined();
      expect(health.cacheStats).toBeDefined();
      expect(health.recommendations).toContain('Test recommendation');
    });

    it('should handle health check failures', async () => {
      mockDatabase.query.mockRejectedValue(new Error('Connection failed'));
      mockDatabase.getPoolStatus.mockReturnValue({
        totalCount: 0,
        idleCount: 0,
        waitingCount: 0
      });

      const health = await optimizedDbService.healthCheck();

      expect(health.isHealthy).toBe(false);
      expect(health.recommendations).toContain('Database connection failed - check configuration');
    });
  });
});