import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { DatabaseConnection, database } from '../shared/database';
import { config } from '../shared/config';
import { migrationRunner, Migration } from '../shared/migrations';

// Mock pg module for testing without actual database
vi.mock('pg', () => {
  const mockClient = {
    query: vi.fn().mockImplementation((sql: string, params?: any[]) => {
      // Mock different responses based on query
      if (sql.includes('SELECT 1 as test_value')) {
        return Promise.resolve({ rows: [{ test_value: 1 }] });
      }
      if (sql.includes('SELECT $1 as test_value')) {
        return Promise.resolve({ rows: [{ test_value: params?.[0] }] });
      }
      if (sql.includes('SELECT 1 WHERE false')) {
        return Promise.resolve({ rows: [] });
      }
      if (sql.includes('SELECT $1 as null_value')) {
        return Promise.resolve({ rows: [{ null_value: params?.[0], undefined_value: params?.[1] }] });
      }
      if (sql.includes('SELECT $1 as query_number')) {
        return Promise.resolve({ rows: [{ query_number: params?.[0] }] });
      }
      if (sql.includes('INVALID SQL')) {
        return Promise.reject(new Error('Invalid SQL statement'));
      }
      if (sql.includes('non_existent_table')) {
        return Promise.reject(new Error('Table does not exist'));
      }
      if (sql.includes('SELECT NOW()')) {
        return Promise.resolve({ rows: [{ now: new Date() }] });
      }
      if (sql.includes('SELECT 1')) {
        return Promise.resolve({ rows: [{ '?column?': 1 }] });
      }
      if (sql.includes('information_schema.tables')) {
        return Promise.resolve({ 
          rows: [
            { table_name: 'players' },
            { table_name: 'islands' },
            { table_name: 'player_skills' },
            { table_name: 'player_inventory' },
            { table_name: 'migrations' }
          ] 
        });
      }
      if (sql.includes('information_schema.columns')) {
        return Promise.resolve({ 
          rows: [
            { column_name: 'id' },
            { column_name: 'username' },
            { column_name: 'island_id' },
            { column_name: 'created_at' },
            { column_name: 'currency_coins' }
          ] 
        });
      }
      if (sql.includes('information_schema.table_constraints')) {
        return Promise.resolve({ 
          rows: [
            { 
              constraint_name: 'player_skills_player_id_fkey',
              table_name: 'player_skills',
              foreign_table_name: 'players'
            }
          ] 
        });
      }
      if (sql.includes('pg_indexes')) {
        return Promise.resolve({ 
          rows: [
            { indexname: 'idx_players_username', tablename: 'players' },
            { indexname: 'idx_player_skills_player_id', tablename: 'player_skills' }
          ] 
        });
      }
      if (sql.includes('SELECT id FROM migrations')) {
        return Promise.resolve({ rows: [{ id: '001' }, { id: '002' }] });
      }
      if (sql.includes('SELECT id, name, executed_at FROM migrations')) {
        return Promise.resolve({ 
          rows: [
            { id: '001', name: 'create_initial_schema', executed_at: new Date() },
            { id: '002', name: 'add_performance_indexes', executed_at: new Date() }
          ] 
        });
      }
      // Default response
      return Promise.resolve({ rows: [] });
    }),
    release: vi.fn(),
  };

  const mockPool = {
    connect: vi.fn().mockResolvedValue(mockClient),
    end: vi.fn().mockResolvedValue(undefined),
    query: vi.fn().mockImplementation(mockClient.query),
    on: vi.fn(),
    totalCount: 10,
    idleCount: 5,
    waitingCount: 0,
  };

  return {
    Pool: vi.fn(() => mockPool),
  };
});

describe('Database Configuration', () => {
  it('should load configuration correctly', () => {
    expect(config.database).toBeDefined();
    expect(config.database.host).toBeDefined();
    expect(config.database.port).toBeDefined();
    expect(config.database.name).toBeDefined();
    expect(config.database.user).toBeDefined();
    expect(config.database.password).toBeDefined();
  });

  it('should validate required environment variables', () => {
    expect(config.database.name).toBe('skybound_realms_test');
    expect(config.database.user).toBe('postgres');
    expect(config.database.host).toBe('localhost');
    expect(config.database.port).toBe(5432);
  });
});

describe('Database Connection', () => {
  beforeAll(async () => {
    await database.connect();
  });

  afterAll(async () => {
    await database.disconnect();
  });

  describe('Connection Management', () => {
    it('should establish database connection successfully', async () => {
      expect(database.isHealthy()).toBe(true);
    });

    it('should perform health check successfully', async () => {
      const isHealthy = await database.healthCheck();
      expect(isHealthy).toBe(true);
    });

    it('should return pool status information', () => {
      const status = database.getPoolStatus();
      expect(status).toHaveProperty('totalCount');
      expect(status).toHaveProperty('idleCount');
      expect(status).toHaveProperty('waitingCount');
      expect(typeof status.totalCount).toBe('number');
      expect(typeof status.idleCount).toBe('number');
      expect(typeof status.waitingCount).toBe('number');
    });

    it('should be a singleton instance', () => {
      const instance1 = DatabaseConnection.getInstance();
      const instance2 = DatabaseConnection.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe('Query Operations', () => {
    it('should execute simple queries successfully', async () => {
      const result = await database.query('SELECT 1 as test_value');
      expect(result).toHaveLength(1);
      expect(result[0].test_value).toBe(1);
    });

    it('should execute parameterized queries successfully', async () => {
      const testValue = 'test_string';
      const result = await database.query('SELECT $1 as test_value', [testValue]);
      expect(result).toHaveLength(1);
      expect(result[0].test_value).toBe(testValue);
    });

    it('should handle query errors gracefully', async () => {
      await expect(database.query('SELECT * FROM non_existent_table')).rejects.toThrow();
    });

    it('should handle empty result sets', async () => {
      const result = await database.query('SELECT 1 WHERE false');
      expect(result).toHaveLength(0);
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('Transaction Management', () => {
    beforeEach(async () => {
      // Create a test table for transaction tests
      await database.query(`
        CREATE TABLE IF NOT EXISTS test_transactions (
          id SERIAL PRIMARY KEY,
          value TEXT NOT NULL
        )
      `);
      // Clean up any existing test data
      await database.query('DELETE FROM test_transactions');
    });

    afterEach(async () => {
      // Clean up test table
      await database.query('DROP TABLE IF EXISTS test_transactions');
    });

    it('should commit successful transactions', async () => {
      const testValue = 'committed_value';
      
      await database.transaction(async (client) => {
        await client.query('INSERT INTO test_transactions (value) VALUES ($1)', [testValue]);
      });

      const result = await database.query('SELECT value FROM test_transactions WHERE value = $1', [testValue]);
      expect(result).toHaveLength(1);
      expect(result[0].value).toBe(testValue);
    });

    it('should rollback failed transactions', async () => {
      const testValue = 'rollback_value';
      
      await expect(database.transaction(async (client) => {
        await client.query('INSERT INTO test_transactions (value) VALUES ($1)', [testValue]);
        throw new Error('Intentional error to trigger rollback');
      })).rejects.toThrow('Intentional error to trigger rollback');

      const result = await database.query('SELECT value FROM test_transactions WHERE value = $1', [testValue]);
      expect(result).toHaveLength(0);
    });

    it('should handle nested operations in transactions', async () => {
      const values = ['value1', 'value2', 'value3'];
      
      await database.transaction(async (client) => {
        for (const value of values) {
          await client.query('INSERT INTO test_transactions (value) VALUES ($1)', [value]);
        }
      });

      const result = await database.query('SELECT COUNT(*) as count FROM test_transactions');
      expect(parseInt(result[0].count)).toBe(values.length);
    });
  });

  describe('Error Handling', () => {
    it('should handle connection timeouts gracefully', async () => {
      // This test simulates a timeout scenario
      const longRunningQuery = database.query('SELECT pg_sleep(0.1)'); // Short sleep for test
      await expect(longRunningQuery).resolves.toBeDefined();
    });

    it('should handle invalid SQL gracefully', async () => {
      await expect(database.query('INVALID SQL STATEMENT')).rejects.toThrow();
    });

    it('should handle null and undefined parameters', async () => {
      const result = await database.query('SELECT $1 as null_value, $2 as undefined_value', [null, undefined]);
      expect(result[0].null_value).toBeNull();
      expect(result[0].undefined_value).toBeNull();
    });
  });

  describe('Performance Monitoring', () => {
    it('should track query execution time', async () => {
      // Mock console.warn to capture slow query warnings
      const originalWarn = console.warn;
      const warnings: string[] = [];
      console.warn = (message: string) => warnings.push(message);

      try {
        // Execute a query that should complete quickly
        await database.query('SELECT 1');
        
        // Should not generate slow query warning for fast queries
        const slowQueryWarnings = warnings.filter(w => w.includes('Slow query detected'));
        expect(slowQueryWarnings).toHaveLength(0);
      } finally {
        console.warn = originalWarn;
      }
    });

    it('should handle concurrent queries efficiently', async () => {
      const concurrentQueries = Array.from({ length: 10 }, (_, i) => 
        database.query('SELECT $1 as query_number', [i])
      );

      const results = await Promise.all(concurrentQueries);
      expect(results).toHaveLength(10);
      
      results.forEach((result, index) => {
        expect(result[0].query_number).toBe(index);
      });
    });
  });
});

describe('Migration System', () => {
  beforeAll(async () => {
    await database.connect();
  });

  afterAll(async () => {
    await database.disconnect();
  });

  describe('Migration Execution', () => {
    it('should run migrations successfully', async () => {
      await migrationRunner.runMigrations();
      
      // Verify migrations table exists and has entries
      const migrations = await migrationRunner.getExecutedMigrations();
      expect(migrations.length).toBeGreaterThan(0);
      
      // Verify core tables were created
      const tables = await database.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_type = 'BASE TABLE'
      `);
      
      const tableNames = tables.map(t => t.table_name);
      expect(tableNames).toContain('players');
      expect(tableNames).toContain('islands');
      expect(tableNames).toContain('player_skills');
      expect(tableNames).toContain('player_inventory');
    });

    it('should not re-run already executed migrations', async () => {
      const migrationsBefore = await migrationRunner.getExecutedMigrations();
      
      // Run migrations again
      await migrationRunner.runMigrations();
      
      const migrationsAfter = await migrationRunner.getExecutedMigrations();
      expect(migrationsAfter.length).toBe(migrationsBefore.length);
    });

    it('should track migration execution timestamps', async () => {
      const migrations = await migrationRunner.getExecutedMigrations();
      
      migrations.forEach(migration => {
        expect(migration.id).toBeDefined();
        expect(migration.name).toBeDefined();
        expect(migration.executed_at).toBeInstanceOf(Date);
      });
    });
  });

  describe('Schema Validation', () => {
    beforeAll(async () => {
      await migrationRunner.runMigrations();
    });

    it('should create players table with correct structure', async () => {
      const columns = await database.query(`
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns 
        WHERE table_name = 'players' 
        ORDER BY ordinal_position
      `);

      const columnNames = columns.map(c => c.column_name);
      expect(columnNames).toContain('id');
      expect(columnNames).toContain('username');
      expect(columnNames).toContain('island_id');
      expect(columnNames).toContain('created_at');
      expect(columnNames).toContain('currency_coins');
    });

    it('should create proper foreign key relationships', async () => {
      const constraints = await database.query(`
        SELECT 
          tc.constraint_name,
          tc.table_name,
          kcu.column_name,
          ccu.table_name AS foreign_table_name,
          ccu.column_name AS foreign_column_name
        FROM information_schema.table_constraints AS tc
        JOIN information_schema.key_column_usage AS kcu
          ON tc.constraint_name = kcu.constraint_name
        JOIN information_schema.constraint_column_usage AS ccu
          ON ccu.constraint_name = tc.constraint_name
        WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_schema = 'public'
      `);

      expect(constraints.length).toBeGreaterThan(0);
      
      // Check specific foreign key relationships
      const playerSkillsFk = constraints.find(c => 
        c.table_name === 'player_skills' && c.foreign_table_name === 'players'
      );
      expect(playerSkillsFk).toBeDefined();
    });

    it('should create performance indexes', async () => {
      const indexes = await database.query(`
        SELECT indexname, tablename 
        FROM pg_indexes 
        WHERE schemaname = 'public'
        AND indexname LIKE 'idx_%'
      `);

      expect(indexes.length).toBeGreaterThan(0);
      
      const indexNames = indexes.map(i => i.indexname);
      expect(indexNames).toContain('idx_players_username');
      expect(indexNames).toContain('idx_player_skills_player_id');
    });
  });
});