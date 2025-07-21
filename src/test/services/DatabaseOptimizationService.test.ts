import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DatabaseOptimizationService } from '../../services/DatabaseOptimizationService';

// Mock the database module
const mockDatabase = {
  query: vi.fn(),
  transaction: vi.fn(),
  healthCheck: vi.fn(),
  getPoolStatus: vi.fn()
};

vi.mock('../../shared/database', () => ({
  database: mockDatabase
}));

describe('DatabaseOptimizationService', () => {
  let optimizationService: DatabaseOptimizationService;

  beforeEach(() => {
    optimizationService = new DatabaseOptimizationService();
    vi.clearAllMocks();
  });

  describe('Query Performance Tracking', () => {
    it('should track query performance metrics', () => {
      const query = 'SELECT * FROM players WHERE id = $1';
      const executionTime = 150;
      const rowsAffected = 1;
      const parameters = ['player123'];

      optimizationService.trackQuery(query, executionTime, rowsAffected, parameters);

      const summary = optimizationService.getQueryPerformanceSummary();
      expect(summary.totalQueries).toBe(1);
      expect(summary.averageExecutionTime).toBe(150);
      expect(summary.slowQueries).toBe(0); // Below default threshold of 1000ms
    });

    it('should identify slow queries', () => {
      const slowQuery = 'SELECT * FROM players JOIN player_skills ON players.id = player_skills.player_id';
      const fastQuery = 'SELECT * FROM players WHERE id = $1';

      optimizationService.trackQuery(slowQuery, 1500, 100); // Slow query
      optimizationService.trackQuery(fastQuery, 50, 1); // Fast query

      const summary = optimizationService.getQueryPerformanceSummary();
      expect(summary.totalQueries).toBe(2);
      expect(summary.slowQueries).toBe(1);

      const slowQueryReport = optimizationService.getSlowQueryReport();
      expect(slowQueryReport).toHaveLength(1);
      expect(slowQueryReport[0].avgExecutionTime).toBe(1500);
    });

    it('should normalize queries for tracking', () => {
      const query1 = 'SELECT * FROM players WHERE id = $1';
      const query2 = 'SELECT * FROM players WHERE id = $2';
      const query3 = 'SELECT   *   FROM   players   WHERE   id   =   $1';

      optimizationService.trackQuery(query1, 100, 1);
      optimizationService.trackQuery(query2, 120, 1);
      optimizationService.trackQuery(query3, 110, 1);

      const summary = optimizationService.getQueryPerformanceSummary();
      expect(summary.totalQueries).toBe(3);
      // All queries should be normalized to the same pattern
    });

    it('should limit metrics history', () => {
      const query = 'SELECT * FROM test';
      
      // Add more metrics than the limit
      for (let i = 0; i < 1500; i++) {
        optimizationService.trackQuery(query, 100, 1);
      }

      const summary = optimizationService.getQueryPerformanceSummary();
      // Should be limited to maxMetricsHistory (1000)
      expect(summary.totalQueries).toBeLessThanOrEqual(1000);
    });
  });

  describe('Index Analysis', () => {
    it('should analyze database indexes', async () => {
      const mockIndexStats = [
        {
          schemaname: 'public',
          tablename: 'players',
          indexname: 'idx_players_username',
          index_size: '16 kB',
          usage_count: 1000,
          idx_tup_read: 1000,
          idx_tup_fetch: 900
        },
        {
          schemaname: 'public',
          tablename: 'players',
          indexname: 'idx_players_unused',
          index_size: '8 kB',
          usage_count: 0,
          idx_tup_read: 0,
          idx_tup_fetch: 0
        }
      ];

      mockDatabase.query.mockResolvedValue(mockIndexStats);

      const analysis = await optimizationService.analyzeIndexes();

      expect(analysis).toHaveLength(2);
      expect(analysis[0].indexName).toBe('idx_players_username');
      expect(analysis[0].isUnused).toBe(false);
      expect(analysis[1].indexName).toBe('idx_players_unused');
      expect(analysis[1].isUnused).toBe(true);
      expect(analysis[1].recommendation).toContain('dropping this unused index');
    });

    it('should handle index analysis errors gracefully', async () => {
      mockDatabase.query.mockRejectedValue(new Error('Database error'));

      const analysis = await optimizationService.analyzeIndexes();
      expect(analysis).toEqual([]);
    });
  });

  describe('Table Statistics', () => {
    it('should get table statistics', async () => {
      const mockTableStats = [
        {
          schemaname: 'public',
          tablename: 'players',
          total_operations: 5000,
          inserts: 1000,
          updates: 2000,
          deletes: 100,
          live_tuples: 10000,
          dead_tuples: 500,
          last_analyze: new Date('2024-01-01')
        }
      ];

      const mockTableSizes = [
        {
          tablename: 'players',
          total_size: '1024 kB',
          table_size: '800 kB',
          index_size: '224 kB'
        }
      ];

      mockDatabase.query
        .mockResolvedValueOnce(mockTableStats)
        .mockResolvedValueOnce(mockTableSizes);

      const statistics = await optimizationService.getTableStatistics();

      expect(statistics).toHaveLength(1);
      expect(statistics[0].tableName).toBe('players');
      expect(statistics[0].rowCount).toBe(10000);
      expect(statistics[0].totalSize).toBe('1024 kB');
    });

    it('should handle table statistics errors gracefully', async () => {
      mockDatabase.query.mockRejectedValue(new Error('Database error'));

      const statistics = await optimizationService.getTableStatistics();
      expect(statistics).toEqual([]);
    });
  });

  describe('Database Optimization', () => {
    it('should optimize database by running ANALYZE and VACUUM', async () => {
      const mockTablesNeedingVacuum = [
        { tablename: 'players' },
        { tablename: 'market_listings' }
      ];

      const mockTransaction = vi.fn(async (callback) => {
        const mockClient = {
          query: vi.fn()
            .mockResolvedValueOnce(undefined) // ANALYZE
            .mockResolvedValueOnce(mockTablesNeedingVacuum) // Tables needing vacuum
            .mockResolvedValueOnce(undefined) // VACUUM players
            .mockResolvedValueOnce(undefined) // VACUUM market_listings
        };
        return await callback(mockClient);
      });

      mockDatabase.transaction.mockImplementation(mockTransaction);

      await optimizationService.optimizeDatabase();

      expect(mockDatabase.transaction).toHaveBeenCalled();
    });

    it('should handle optimization errors', async () => {
      mockDatabase.transaction.mockRejectedValue(new Error('Optimization failed'));

      await expect(optimizationService.optimizeDatabase()).rejects.toThrow('Optimization failed');
    });
  });

  describe('Performance Index Creation', () => {
    it('should create performance indexes', async () => {
      const mockTransaction = vi.fn(async (callback) => {
        const mockClient = {
          query: vi.fn()
            .mockResolvedValue({ rows: [] }) // Index doesn't exist
        };
        return await callback(mockClient);
      });

      mockDatabase.transaction.mockImplementation(mockTransaction);

      await optimizationService.createPerformanceIndexes();

      expect(mockDatabase.transaction).toHaveBeenCalled();
    });

    it('should skip creating existing indexes', async () => {
      const mockTransaction = vi.fn(async (callback) => {
        const mockClient = {
          query: vi.fn()
            .mockResolvedValue({ rows: [{ indexname: 'existing_index' }] }) // Index exists
        };
        return await callback(mockClient);
      });

      mockDatabase.transaction.mockImplementation(mockTransaction);

      await optimizationService.createPerformanceIndexes();

      expect(mockDatabase.transaction).toHaveBeenCalled();
    });
  });

  describe('Connection Pool Optimization', () => {
    it('should analyze connection pool usage', async () => {
      mockDatabase.getPoolStatus.mockReturnValue({
        totalCount: 10,
        idleCount: 2,
        waitingCount: 0
      });

      const analysis = await optimizationService.optimizeConnectionPool();

      expect(analysis.currentSettings.totalConnections).toBe(10);
      expect(analysis.currentSettings.idleConnections).toBe(2);
      expect(analysis.currentSettings.waitingConnections).toBe(0);
      expect(analysis.currentSettings.utilizationRate).toBe('80%');
    });

    it('should recommend pool size increase for high utilization', async () => {
      mockDatabase.getPoolStatus.mockReturnValue({
        totalCount: 10,
        idleCount: 1,
        waitingCount: 5
      });

      const analysis = await optimizationService.optimizeConnectionPool();

      expect(analysis.recommendations).toContain(
        expect.stringContaining('increasing max pool size')
      );
      expect(analysis.recommendations).toContain(
        expect.stringContaining('Connections are waiting')
      );
    });

    it('should recommend pool size decrease for low utilization', async () => {
      mockDatabase.getPoolStatus.mockReturnValue({
        totalCount: 20,
        idleCount: 18,
        waitingCount: 0
      });

      const analysis = await optimizationService.optimizeConnectionPool();

      expect(analysis.recommendations).toContain(
        expect.stringContaining('decreasing max pool size')
      );
      expect(analysis.recommendations).toContain(
        expect.stringContaining('Many idle connections')
      );
    });
  });

  describe('Optimization Recommendations', () => {
    it('should generate comprehensive optimization recommendations', async () => {
      // Mock table statistics
      mockDatabase.query
        .mockResolvedValueOnce([
          { tablename: 'large_table', n_live_tup: 50000, index_size: '0 bytes' }
        ]) // Table stats
        .mockResolvedValueOnce([
          { tablename: 'large_table', total_size: '10 MB', table_size: '10 MB', index_size: '0 bytes' }
        ]) // Table sizes
        .mockResolvedValueOnce([
          { indexname: 'unused_index', usage_count: 0 }
        ]) // Index stats
        .mockResolvedValueOnce([
          { tablename: 'dirty_table', n_dead_tup: 5000, n_live_tup: 10000 }
        ]); // Tables needing maintenance

      mockDatabase.getPoolStatus.mockReturnValue({
        totalCount: 10,
        idleCount: 8,
        waitingCount: 0
      });

      // Add some slow queries
      optimizationService.trackQuery('SLOW QUERY', 2000, 1);
      optimizationService.trackQuery('FAST QUERY', 100, 1);

      const recommendations = await optimizationService.generateOptimizationRecommendations();

      expect(recommendations.length).toBeGreaterThan(0);
      expect(recommendations.some(r => r.includes('Large tables without indexes'))).toBe(true);
      expect(recommendations.some(r => r.includes('Many idle connections'))).toBe(true);
      expect(recommendations.some(r => r.includes('Tables need maintenance'))).toBe(true);
    });

    it('should handle recommendation generation errors', async () => {
      mockDatabase.query.mockRejectedValue(new Error('Database error'));
      mockDatabase.getPoolStatus.mockReturnValue({
        totalCount: 10,
        idleCount: 5,
        waitingCount: 0
      });

      const recommendations = await optimizationService.generateOptimizationRecommendations();

      expect(recommendations).toContain('Error analyzing database - check logs for details');
    });
  });

  describe('Database Health', () => {
    it('should provide comprehensive database health metrics', async () => {
      mockDatabase.healthCheck.mockResolvedValue(true);
      mockDatabase.getPoolStatus.mockReturnValue({
        totalCount: 10,
        idleCount: 5,
        waitingCount: 0
      });

      // Mock other required methods
      mockDatabase.query.mockResolvedValue([]);

      const health = await optimizationService.getDatabaseHealth();

      expect(health.isHealthy).toBe(true);
      expect(health.connectionPool).toBeDefined();
      expect(health.queryPerformance).toBeDefined();
      expect(health.recommendations).toBeDefined();
    });

    it('should handle health check failures', async () => {
      mockDatabase.healthCheck.mockResolvedValue(false);
      mockDatabase.getPoolStatus.mockReturnValue({
        totalCount: 0,
        idleCount: 0,
        waitingCount: 0
      });

      mockDatabase.query.mockRejectedValue(new Error('Connection failed'));

      const health = await optimizationService.getDatabaseHealth();

      expect(health.isHealthy).toBe(false);
    });
  });

  describe('Utility Methods', () => {
    it('should clear query metrics', () => {
      optimizationService.trackQuery('TEST QUERY', 100, 1);
      
      let summary = optimizationService.getQueryPerformanceSummary();
      expect(summary.totalQueries).toBe(1);

      optimizationService.clearMetrics();
      
      summary = optimizationService.getQueryPerformanceSummary();
      expect(summary.totalQueries).toBe(0);
    });

    it('should set slow query threshold', () => {
      optimizationService.setSlowQueryThreshold(500);
      
      optimizationService.trackQuery('QUERY', 600, 1);
      
      const summary = optimizationService.getQueryPerformanceSummary();
      expect(summary.slowQueries).toBe(1);
    });

    it('should get query performance summary', () => {
      optimizationService.trackQuery('FAST QUERY', 100, 1);
      optimizationService.trackQuery('SLOW QUERY', 1500, 1);
      optimizationService.trackQuery('MEDIUM QUERY', 500, 1);

      const summary = optimizationService.getQueryPerformanceSummary();
      
      expect(summary.totalQueries).toBe(3);
      expect(summary.slowQueries).toBe(1);
      expect(summary.averageExecutionTime).toBe(Math.round((100 + 1500 + 500) / 3));
      expect(summary.topSlowQueries).toHaveLength(1);
    });
  });
});