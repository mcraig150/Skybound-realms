import { PoolClient } from 'pg';
import { database } from '../shared/database';

export interface QueryPerformanceMetrics {
  query: string;
  executionTime: number;
  rowsAffected: number;
  timestamp: Date;
  parameters?: any[];
}

export interface IndexAnalysis {
  tableName: string;
  indexName: string;
  indexSize: string;
  indexUsage: number;
  isUnused: boolean;
  recommendation: string;
}

export interface TableStatistics {
  tableName: string;
  rowCount: number;
  tableSize: string;
  indexSize: string;
  totalSize: string;
  lastAnalyzed: Date | null;
}

export interface SlowQueryReport {
  query: string;
  avgExecutionTime: number;
  callCount: number;
  totalTime: number;
  firstSeen: Date;
  lastSeen: Date;
}

export class DatabaseOptimizationService {
  private queryMetrics: Map<string, QueryPerformanceMetrics[]> = new Map();
  private slowQueryThreshold: number = 1000; // 1 second
  private maxMetricsHistory: number = 1000;

  constructor() {
    // Start periodic optimization tasks
    this.startPeriodicTasks();
  }

  /**
   * Track query performance metrics
   */
  trackQuery(query: string, executionTime: number, rowsAffected: number, parameters?: any[]): void {
    const normalizedQuery = this.normalizeQuery(query);
    
    if (!this.queryMetrics.has(normalizedQuery)) {
      this.queryMetrics.set(normalizedQuery, []);
    }

    const metrics = this.queryMetrics.get(normalizedQuery)!;
    metrics.push({
      query: normalizedQuery,
      executionTime,
      rowsAffected,
      timestamp: new Date(),
      parameters: parameters || []
    });

    // Keep only recent metrics
    if (metrics.length > this.maxMetricsHistory) {
      metrics.splice(0, metrics.length - this.maxMetricsHistory);
    }

    // Log slow queries
    if (executionTime > this.slowQueryThreshold) {
      console.warn(`Slow query detected (${executionTime}ms):`, query);
    }
  }

  /**
   * Normalize query for tracking (remove specific values)
   */
  private normalizeQuery(query: string): string {
    return query
      .replace(/\$\d+/g, '?') // Replace parameter placeholders
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim()
      .toLowerCase();
  }

  /**
   * Get slow query report
   */
  getSlowQueryReport(): SlowQueryReport[] {
    const reports: SlowQueryReport[] = [];

    for (const [query, metrics] of this.queryMetrics.entries()) {
      const slowMetrics = metrics.filter(m => m.executionTime > this.slowQueryThreshold);
      
      if (slowMetrics.length > 0) {
        const totalTime = slowMetrics.reduce((sum, m) => sum + m.executionTime, 0);
        const avgTime = totalTime / slowMetrics.length;
        const timestamps = slowMetrics.map(m => m.timestamp);

        reports.push({
          query,
          avgExecutionTime: avgTime,
          callCount: slowMetrics.length,
          totalTime,
          firstSeen: new Date(Math.min(...timestamps.map(t => t.getTime()))),
          lastSeen: new Date(Math.max(...timestamps.map(t => t.getTime())))
        });
      }
    }

    return reports.sort((a, b) => b.totalTime - a.totalTime);
  }

  /**
   * Analyze database indexes
   */
  async analyzeIndexes(): Promise<IndexAnalysis[]> {
    const analyses: IndexAnalysis[] = [];

    try {
      // Get index usage statistics
      const indexStats = await database.query(`
        SELECT 
          schemaname,
          tablename,
          indexname,
          pg_size_pretty(pg_relation_size(indexrelid)) as index_size,
          idx_scan as usage_count,
          idx_tup_read,
          idx_tup_fetch
        FROM pg_stat_user_indexes
        ORDER BY idx_scan ASC, pg_relation_size(indexrelid) DESC
      `);

      for (const stat of indexStats) {
        const isUnused = stat.usage_count === 0;
        let recommendation = '';

        if (isUnused) {
          recommendation = 'Consider dropping this unused index to save space and improve write performance';
        } else if (stat.usage_count < 10) {
          recommendation = 'Low usage index - monitor and consider dropping if usage remains low';
        } else if (stat.idx_tup_read > 0 && stat.idx_tup_fetch / stat.idx_tup_read < 0.1) {
          recommendation = 'Index has low selectivity - consider optimizing or replacing';
        } else {
          recommendation = 'Index is being used effectively';
        }

        analyses.push({
          tableName: stat.tablename,
          indexName: stat.indexname,
          indexSize: stat.index_size,
          indexUsage: stat.usage_count,
          isUnused,
          recommendation
        });
      }
    } catch (error) {
      console.error('Error analyzing indexes:', error);
    }

    return analyses;
  }

  /**
   * Get table statistics
   */
  async getTableStatistics(): Promise<TableStatistics[]> {
    const statistics: TableStatistics[] = [];

    try {
      const tableStats = await database.query(`
        SELECT 
          schemaname,
          tablename,
          n_tup_ins + n_tup_upd + n_tup_del as total_operations,
          n_tup_ins as inserts,
          n_tup_upd as updates,
          n_tup_del as deletes,
          n_live_tup as live_tuples,
          n_dead_tup as dead_tuples,
          last_vacuum,
          last_autovacuum,
          last_analyze,
          last_autoanalyze
        FROM pg_stat_user_tables
        ORDER BY total_operations DESC
      `);

      const tableSizes = await database.query(`
        SELECT 
          tablename,
          pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as total_size,
          pg_size_pretty(pg_relation_size(schemaname||'.'||tablename)) as table_size,
          pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename) - pg_relation_size(schemaname||'.'||tablename)) as index_size
        FROM pg_tables 
        WHERE schemaname = 'public'
      `);

      const sizeMap = new Map(tableSizes.map(s => [s.tablename, s]));

      for (const stat of tableStats) {
        const sizeInfo = sizeMap.get(stat.tablename);
        
        statistics.push({
          tableName: stat.tablename,
          rowCount: stat.live_tuples,
          tableSize: sizeInfo?.table_size || '0 bytes',
          indexSize: sizeInfo?.index_size || '0 bytes',
          totalSize: sizeInfo?.total_size || '0 bytes',
          lastAnalyzed: stat.last_analyze || stat.last_autoanalyze
        });
      }
    } catch (error) {
      console.error('Error getting table statistics:', error);
    }

    return statistics;
  }

  /**
   * Optimize database by running ANALYZE on all tables
   */
  async optimizeDatabase(): Promise<void> {
    console.log('Starting database optimization...');

    try {
      await database.transaction(async (client) => {
        // Update table statistics
        await client.query('ANALYZE');
        
        // Get tables that need vacuuming
        const tablesNeedingVacuum = await client.query(`
          SELECT tablename 
          FROM pg_stat_user_tables 
          WHERE n_dead_tup > 1000 
          OR (n_dead_tup::float / GREATEST(n_live_tup, 1)) > 0.1
        `);

        // Vacuum tables with high dead tuple ratio
        for (const table of tablesNeedingVacuum.rows) {
          console.log(`Vacuuming table: ${table.tablename}`);
          await client.query(`VACUUM ANALYZE ${table.tablename}`);
        }
      });

      console.log('Database optimization completed successfully');
    } catch (error) {
      console.error('Error during database optimization:', error);
      throw error;
    }
  }

  /**
   * Create additional performance indexes based on query patterns
   */
  async createPerformanceIndexes(): Promise<void> {
    console.log('Creating additional performance indexes...');

    try {
      await database.transaction(async (client) => {
        // Composite indexes for common query patterns
        
        // Player lookup with skills
        await this.createIndexIfNotExists(client, 
          'idx_player_skills_composite', 
          'player_skills', 
          '(player_id, skill_type, level DESC)'
        );

        // Market listings with price range queries
        await this.createIndexIfNotExists(client,
          'idx_market_listings_price_range',
          'market_listings',
          '(item_id, is_active, price) WHERE is_active = true'
        );

        // Recent transactions for market analysis
        await this.createIndexIfNotExists(client,
          'idx_transactions_recent',
          'transactions',
          '(created_at DESC, item_id) WHERE created_at > NOW() - INTERVAL \'30 days\''
        );

        // Active minions by player
        await this.createIndexIfNotExists(client,
          'idx_minions_active_player',
          'minions',
          '(player_id, is_active, last_collection) WHERE is_active = true'
        );

        // World chunks spatial index
        await this.createIndexIfNotExists(client,
          'idx_world_chunks_spatial',
          'world_chunks',
          '(island_id, chunk_x, chunk_y, chunk_z)'
        );

        // Player inventory item lookup
        await this.createIndexIfNotExists(client,
          'idx_player_inventory_lookup',
          'player_inventory',
          '(player_id, item_id, quantity)'
        );

        // Market listings expiration cleanup
        await this.createIndexIfNotExists(client,
          'idx_market_listings_expiry',
          'market_listings',
          '(expires_at, is_active) WHERE is_active = true'
        );

        console.log('Performance indexes created successfully');
      });
    } catch (error) {
      console.error('Error creating performance indexes:', error);
      throw error;
    }
  }

  /**
   * Create index if it doesn't exist
   */
  private async createIndexIfNotExists(
    client: PoolClient, 
    indexName: string, 
    tableName: string, 
    columns: string
  ): Promise<void> {
    try {
      const indexExists = await client.query(`
        SELECT 1 FROM pg_indexes 
        WHERE indexname = $1 AND tablename = $2
      `, [indexName, tableName]);

      if (indexExists.rows.length === 0) {
        console.log(`Creating index: ${indexName}`);
        await client.query(`CREATE INDEX CONCURRENTLY ${indexName} ON ${tableName} ${columns}`);
      }
    } catch (error) {
      console.warn(`Failed to create index ${indexName}:`, error);
    }
  }

  /**
   * Optimize connection pool settings
   */
  async optimizeConnectionPool(): Promise<{
    currentSettings: any;
    recommendations: string[];
  }> {
    const poolStatus = database.getPoolStatus();
    const recommendations: string[] = [];

    // Analyze pool usage
    const utilizationRate = poolStatus.totalCount > 0 
      ? (poolStatus.totalCount - poolStatus.idleCount) / poolStatus.totalCount 
      : 0;

    if (utilizationRate > 0.8) {
      recommendations.push('Consider increasing max pool size - high utilization detected');
    } else if (utilizationRate < 0.2) {
      recommendations.push('Consider decreasing max pool size - low utilization detected');
    }

    if (poolStatus.waitingCount > 0) {
      recommendations.push('Connections are waiting - consider increasing pool size or optimizing queries');
    }

    if (poolStatus.idleCount > poolStatus.totalCount * 0.5) {
      recommendations.push('Many idle connections - consider decreasing idle timeout');
    }

    return {
      currentSettings: {
        totalConnections: poolStatus.totalCount,
        idleConnections: poolStatus.idleCount,
        waitingConnections: poolStatus.waitingCount,
        utilizationRate: Math.round(utilizationRate * 100) + '%'
      },
      recommendations
    };
  }

  /**
   * Get query performance summary
   */
  getQueryPerformanceSummary(): {
    totalQueries: number;
    slowQueries: number;
    averageExecutionTime: number;
    topSlowQueries: SlowQueryReport[];
  } {
    let totalQueries = 0;
    let slowQueries = 0;
    let totalExecutionTime = 0;

    for (const metrics of this.queryMetrics.values()) {
      totalQueries += metrics.length;
      totalExecutionTime += metrics.reduce((sum, m) => sum + m.executionTime, 0);
      slowQueries += metrics.filter(m => m.executionTime > this.slowQueryThreshold).length;
    }

    const averageExecutionTime = totalQueries > 0 ? totalExecutionTime / totalQueries : 0;
    const topSlowQueries = this.getSlowQueryReport().slice(0, 5);

    return {
      totalQueries,
      slowQueries,
      averageExecutionTime: Math.round(averageExecutionTime),
      topSlowQueries
    };
  }

  /**
   * Generate optimization recommendations
   */
  async generateOptimizationRecommendations(): Promise<string[]> {
    const recommendations: string[] = [];

    try {
      // Check for missing indexes
      const tableStats = await this.getTableStatistics();
      const largeTablesWithoutIndexes = tableStats.filter(t => 
        t.rowCount > 10000 && t.indexSize === '0 bytes'
      );

      if (largeTablesWithoutIndexes.length > 0) {
        recommendations.push(
          `Large tables without indexes detected: ${largeTablesWithoutIndexes.map(t => t.tableName).join(', ')}`
        );
      }

      // Check for unused indexes
      const indexAnalysis = await this.analyzeIndexes();
      const unusedIndexes = indexAnalysis.filter(i => i.isUnused);

      if (unusedIndexes.length > 0) {
        recommendations.push(
          `Unused indexes found: ${unusedIndexes.map(i => i.indexName).join(', ')} - consider dropping`
        );
      }

      // Check query performance
      const performanceSummary = this.getQueryPerformanceSummary();
      if (performanceSummary.slowQueries > performanceSummary.totalQueries * 0.1) {
        recommendations.push(
          `High percentage of slow queries (${Math.round(performanceSummary.slowQueries / performanceSummary.totalQueries * 100)}%) - review query optimization`
        );
      }

      // Check connection pool
      const poolAnalysis = await this.optimizeConnectionPool();
      recommendations.push(...poolAnalysis.recommendations);

      // Check for tables needing maintenance
      const tablesNeedingMaintenance = await database.query(`
        SELECT tablename, n_dead_tup, n_live_tup
        FROM pg_stat_user_tables 
        WHERE n_dead_tup > 1000 
        OR (n_dead_tup::float / GREATEST(n_live_tup, 1)) > 0.1
      `);

      if (tablesNeedingMaintenance.length > 0) {
        recommendations.push(
          `Tables need maintenance (VACUUM): ${tablesNeedingMaintenance.map(t => t.tablename).join(', ')}`
        );
      }

    } catch (error) {
      console.error('Error generating optimization recommendations:', error);
      recommendations.push('Error analyzing database - check logs for details');
    }

    return recommendations;
  }

  /**
   * Start periodic optimization tasks
   */
  private startPeriodicTasks(): void {
    // Run optimization every hour
    setInterval(async () => {
      try {
        await this.optimizeDatabase();
      } catch (error) {
        console.error('Periodic optimization failed:', error);
      }
    }, 60 * 60 * 1000); // 1 hour

    // Generate recommendations every 6 hours
    setInterval(async () => {
      try {
        const recommendations = await this.generateOptimizationRecommendations();
        if (recommendations.length > 0) {
          console.log('Database optimization recommendations:', recommendations);
        }
      } catch (error) {
        console.error('Failed to generate recommendations:', error);
      }
    }, 6 * 60 * 60 * 1000); // 6 hours
  }

  /**
   * Clear query metrics history
   */
  clearMetrics(): void {
    this.queryMetrics.clear();
  }

  /**
   * Set slow query threshold
   */
  setSlowQueryThreshold(milliseconds: number): void {
    this.slowQueryThreshold = milliseconds;
  }

  /**
   * Get database health metrics
   */
  async getDatabaseHealth(): Promise<{
    isHealthy: boolean;
    connectionPool: any;
    queryPerformance: any;
    recommendations: string[];
  }> {
    const isHealthy = await database.healthCheck();
    const connectionPool = await this.optimizeConnectionPool();
    const queryPerformance = this.getQueryPerformanceSummary();
    const recommendations = await this.generateOptimizationRecommendations();

    return {
      isHealthy,
      connectionPool: connectionPool.currentSettings,
      queryPerformance,
      recommendations
    };
  }
}

export const databaseOptimizationService = new DatabaseOptimizationService();