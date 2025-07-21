import { PoolClient } from 'pg';
import { database } from '../shared/database';
import { databaseOptimizationService } from './DatabaseOptimizationService';

export interface QueryOptions {
  timeout?: number;
  trackPerformance?: boolean;
  useReadReplica?: boolean;
  cacheKey?: string;
  cacheTTL?: number;
}

export interface PreparedStatement {
  name: string;
  query: string;
  parameters: any[];
}

export class OptimizedDatabaseService {
  private preparedStatements: Map<string, PreparedStatement> = new Map();
  private queryCache: Map<string, { data: any; expiry: number }> = new Map();

  constructor() {
    // Clean up cache periodically
    setInterval(() => {
      this.cleanupCache();
    }, 5 * 60 * 1000); // 5 minutes
  }

  /**
   * Execute optimized query with performance tracking
   */
  async query<T = any>(
    text: string, 
    params?: any[], 
    options: QueryOptions = {}
  ): Promise<T[]> {
    const startTime = Date.now();
    const { timeout = 30000, trackPerformance = true, cacheKey, cacheTTL } = options;

    // Check cache first
    if (cacheKey) {
      const cached = this.queryCache.get(cacheKey);
      if (cached && Date.now() < cached.expiry) {
        return cached.data;
      }
    }

    try {
      // Set query timeout
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Query timeout')), timeout);
      });

      const queryPromise = database.query<T>(text, params);
      const result = await Promise.race([queryPromise, timeoutPromise]);

      const executionTime = Date.now() - startTime;

      // Track performance if enabled
      if (trackPerformance) {
        databaseOptimizationService.trackQuery(
          text, 
          executionTime, 
          result.length, 
          params
        );
      }

      // Cache result if requested
      if (cacheKey && cacheTTL) {
        this.queryCache.set(cacheKey, {
          data: result,
          expiry: Date.now() + cacheTTL
        });
      }

      return result;
    } catch (error) {
      const executionTime = Date.now() - startTime;
      
      if (trackPerformance) {
        databaseOptimizationService.trackQuery(text, executionTime, 0, params);
      }

      throw error;
    }
  }

  /**
   * Execute transaction with optimization
   */
  async transaction<T>(
    callback: (client: PoolClient) => Promise<T>,
    options: QueryOptions = {}
  ): Promise<T> {
    const startTime = Date.now();
    const { timeout = 60000, trackPerformance = true } = options;

    try {
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Transaction timeout')), timeout);
      });

      const transactionPromise = database.transaction(callback);
      const result = await Promise.race([transactionPromise, timeoutPromise]);

      const executionTime = Date.now() - startTime;

      if (trackPerformance) {
        databaseOptimizationService.trackQuery(
          'TRANSACTION', 
          executionTime, 
          1
        );
      }

      return result;
    } catch (error) {
      const executionTime = Date.now() - startTime;
      
      if (trackPerformance) {
        databaseOptimizationService.trackQuery('TRANSACTION_ERROR', executionTime, 0);
      }

      throw error;
    }
  }

  /**
   * Prepare and execute statement for better performance
   */
  async executePrepared<T = any>(
    statementName: string,
    query: string,
    params: any[] = []
  ): Promise<T[]> {
    const startTime = Date.now();

    try {
      // Store prepared statement info
      if (!this.preparedStatements.has(statementName)) {
        this.preparedStatements.set(statementName, {
          name: statementName,
          query,
          parameters: params
        });
      }

      const result = await database.query<T>(query, params);
      const executionTime = Date.now() - startTime;

      databaseOptimizationService.trackQuery(
        `PREPARED:${statementName}`, 
        executionTime, 
        result.length, 
        params
      );

      return result;
    } catch (error) {
      const executionTime = Date.now() - startTime;
      databaseOptimizationService.trackQuery(
        `PREPARED_ERROR:${statementName}`, 
        executionTime, 
        0, 
        params
      );
      throw error;
    }
  }

  /**
   * Execute batch operations efficiently
   */
  async batchInsert<T>(
    tableName: string,
    columns: string[],
    values: T[][],
    options: { batchSize?: number; onConflict?: string } = {}
  ): Promise<void> {
    const { batchSize = 1000, onConflict } = options;
    const startTime = Date.now();

    try {
      await database.transaction(async (client) => {
        for (let i = 0; i < values.length; i += batchSize) {
          const batch = values.slice(i, i + batchSize);
          
          // Build parameterized query
          const placeholders = batch.map((_, rowIndex) => 
            `(${columns.map((_, colIndex) => 
              `$${rowIndex * columns.length + colIndex + 1}`
            ).join(', ')})`
          ).join(', ');

          const flatValues = batch.flat();
          
          let query = `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES ${placeholders}`;
          
          if (onConflict) {
            query += ` ${onConflict}`;
          }

          await client.query(query, flatValues);
        }
      });

      const executionTime = Date.now() - startTime;
      databaseOptimizationService.trackQuery(
        `BATCH_INSERT:${tableName}`, 
        executionTime, 
        values.length
      );

    } catch (error) {
      const executionTime = Date.now() - startTime;
      databaseOptimizationService.trackQuery(
        `BATCH_INSERT_ERROR:${tableName}`, 
        executionTime, 
        0
      );
      throw error;
    }
  }

  /**
   * Execute optimized SELECT with common patterns
   */
  async selectOptimized<T = any>(options: {
    table: string;
    columns?: string[];
    where?: Record<string, any>;
    orderBy?: string;
    limit?: number;
    offset?: number;
    joins?: Array<{ table: string; on: string; type?: 'INNER' | 'LEFT' | 'RIGHT' }>;
    cacheKey?: string;
    cacheTTL?: number;
  }): Promise<T[]> {
    const {
      table,
      columns = ['*'],
      where = {},
      orderBy,
      limit,
      offset,
      joins = [],
      cacheKey,
      cacheTTL
    } = options;

    // Build query
    let query = `SELECT ${columns.join(', ')} FROM ${table}`;
    const params: any[] = [];
    let paramIndex = 1;

    // Add joins
    for (const join of joins) {
      const joinType = join.type || 'INNER';
      query += ` ${joinType} JOIN ${join.table} ON ${join.on}`;
    }

    // Add WHERE clause
    const whereConditions = Object.keys(where);
    if (whereConditions.length > 0) {
      const conditions = whereConditions.map(key => {
        params.push(where[key]);
        return `${key} = $${paramIndex++}`;
      });
      query += ` WHERE ${conditions.join(' AND ')}`;
    }

    // Add ORDER BY
    if (orderBy) {
      query += ` ORDER BY ${orderBy}`;
    }

    // Add LIMIT and OFFSET
    if (limit) {
      query += ` LIMIT $${paramIndex++}`;
      params.push(limit);
    }

    if (offset) {
      query += ` OFFSET $${paramIndex++}`;
      params.push(offset);
    }

    const queryOptions: any = {};
    if (cacheKey) queryOptions.cacheKey = cacheKey;
    if (cacheTTL) queryOptions.cacheTTL = cacheTTL;
    
    return await this.query<T>(query, params, queryOptions);
  }

  /**
   * Execute optimized UPDATE with conditions
   */
  async updateOptimized(options: {
    table: string;
    set: Record<string, any>;
    where: Record<string, any>;
    returning?: string[];
  }): Promise<any[]> {
    const { table, set, where, returning = [] } = options;

    const setKeys = Object.keys(set);
    const whereKeys = Object.keys(where);
    const params: any[] = [];
    let paramIndex = 1;

    // Build SET clause
    const setClause = setKeys.map(key => {
      params.push(set[key]);
      return `${key} = $${paramIndex++}`;
    }).join(', ');

    // Build WHERE clause
    const whereClause = whereKeys.map(key => {
      params.push(where[key]);
      return `${key} = $${paramIndex++}`;
    }).join(' AND ');

    let query = `UPDATE ${table} SET ${setClause} WHERE ${whereClause}`;

    if (returning.length > 0) {
      query += ` RETURNING ${returning.join(', ')}`;
    }

    return await this.query(query, params);
  }

  /**
   * Execute optimized DELETE with conditions
   */
  async deleteOptimized(options: {
    table: string;
    where: Record<string, any>;
    returning?: string[];
  }): Promise<any[]> {
    const { table, where, returning = [] } = options;

    const whereKeys = Object.keys(where);
    const params: any[] = [];
    let paramIndex = 1;

    const whereClause = whereKeys.map(key => {
      params.push(where[key]);
      return `${key} = $${paramIndex++}`;
    }).join(' AND ');

    let query = `DELETE FROM ${table} WHERE ${whereClause}`;

    if (returning.length > 0) {
      query += ` RETURNING ${returning.join(', ')}`;
    }

    return await this.query(query, params);
  }

  /**
   * Execute aggregation queries efficiently
   */
  async aggregate<T = any>(options: {
    table: string;
    aggregations: Array<{ function: string; column: string; alias?: string }>;
    where?: Record<string, any>;
    groupBy?: string[];
    having?: string;
    orderBy?: string;
    cacheKey?: string;
    cacheTTL?: number;
  }): Promise<T[]> {
    const {
      table,
      aggregations,
      where = {},
      groupBy = [],
      having,
      orderBy,
      cacheKey,
      cacheTTL
    } = options;

    // Build aggregation columns
    const aggColumns = aggregations.map(agg => {
      const alias = agg.alias || `${agg.function}_${agg.column}`;
      return `${agg.function}(${agg.column}) AS ${alias}`;
    });

    let query = `SELECT ${aggColumns.join(', ')} FROM ${table}`;
    const params: any[] = [];
    let paramIndex = 1;

    // Add WHERE clause
    const whereConditions = Object.keys(where);
    if (whereConditions.length > 0) {
      const conditions = whereConditions.map(key => {
        params.push(where[key]);
        return `${key} = $${paramIndex++}`;
      });
      query += ` WHERE ${conditions.join(' AND ')}`;
    }

    // Add GROUP BY
    if (groupBy.length > 0) {
      query += ` GROUP BY ${groupBy.join(', ')}`;
    }

    // Add HAVING
    if (having) {
      query += ` HAVING ${having}`;
    }

    // Add ORDER BY
    if (orderBy) {
      query += ` ORDER BY ${orderBy}`;
    }

    const queryOptions: any = {};
    if (cacheKey) queryOptions.cacheKey = cacheKey;
    if (cacheTTL) queryOptions.cacheTTL = cacheTTL;
    
    return await this.query<T>(query, params, queryOptions);
  }

  /**
   * Get query execution plan for optimization
   */
  async explainQuery(query: string, params?: any[]): Promise<any[]> {
    const explainQuery = `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${query}`;
    return await this.query(explainQuery, params, { trackPerformance: false });
  }

  /**
   * Clean up expired cache entries
   */
  private cleanupCache(): void {
    const now = Date.now();
    for (const [key, value] of this.queryCache.entries()) {
      if (now >= value.expiry) {
        this.queryCache.delete(key);
      }
    }
  }

  /**
   * Clear query cache
   */
  clearCache(pattern?: string): void {
    if (pattern) {
      const regex = new RegExp(pattern);
      for (const key of this.queryCache.keys()) {
        if (regex.test(key)) {
          this.queryCache.delete(key);
        }
      }
    } else {
      this.queryCache.clear();
    }
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): {
    totalEntries: number;
    memoryUsage: number;
    hitRate: number;
  } {
    return {
      totalEntries: this.queryCache.size,
      memoryUsage: JSON.stringify([...this.queryCache.values()]).length,
      hitRate: 0 // Would need to track hits/misses to calculate
    };
  }

  /**
   * Get prepared statements info
   */
  getPreparedStatements(): PreparedStatement[] {
    return Array.from(this.preparedStatements.values());
  }

  /**
   * Health check with detailed metrics
   */
  async healthCheck(): Promise<{
    isHealthy: boolean;
    responseTime: number;
    connectionPool: any;
    cacheStats: any;
    recommendations: string[];
  }> {
    const startTime = Date.now();
    
    try {
      await database.query('SELECT 1');
      const responseTime = Date.now() - startTime;
      
      const poolStatus = database.getPoolStatus();
      const cacheStats = this.getCacheStats();
      const recommendations = await databaseOptimizationService.generateOptimizationRecommendations();

      return {
        isHealthy: true,
        responseTime,
        connectionPool: poolStatus,
        cacheStats,
        recommendations
      };
    } catch (error) {
      return {
        isHealthy: false,
        responseTime: Date.now() - startTime,
        connectionPool: database.getPoolStatus(),
        cacheStats: this.getCacheStats(),
        recommendations: ['Database connection failed - check configuration']
      };
    }
  }
}

export const optimizedDatabaseService = new OptimizedDatabaseService();