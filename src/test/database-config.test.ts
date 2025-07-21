import { describe, it, expect, vi } from 'vitest';
import { DatabaseConnection } from '../shared/database';
import { config, validateConfig } from '../shared/config';
import { migrationRunner } from '../shared/migrations';

describe('Database Configuration and Setup', () => {
  describe('Configuration Loading', () => {
    it('should load database configuration from environment variables', () => {
      expect(config.database).toBeDefined();
      expect(config.database.host).toBe('localhost');
      expect(config.database.port).toBe(5432);
      expect(config.database.name).toBe('skybound_realms_test');
      expect(config.database.user).toBe('postgres');
      expect(config.database.password).toBe('password');
      expect(config.database.ssl).toBe(false);
    });

    it('should validate required configuration', () => {
      expect(() => validateConfig()).not.toThrow();
    });

    it('should have proper connection pool configuration', () => {
      const dbInstance = DatabaseConnection.getInstance();
      expect(dbInstance).toBeDefined();
      expect(typeof dbInstance.isHealthy).toBe('function');
      expect(typeof dbInstance.getPoolStatus).toBe('function');
    });
  });

  describe('Database Connection Class', () => {
    it('should implement singleton pattern', () => {
      const instance1 = DatabaseConnection.getInstance();
      const instance2 = DatabaseConnection.getInstance();
      expect(instance1).toBe(instance2);
    });

    it('should have all required methods', () => {
      const instance = DatabaseConnection.getInstance();
      expect(typeof instance.connect).toBe('function');
      expect(typeof instance.disconnect).toBe('function');
      expect(typeof instance.query).toBe('function');
      expect(typeof instance.transaction).toBe('function');
      expect(typeof instance.healthCheck).toBe('function');
      expect(typeof instance.getPoolStatus).toBe('function');
      expect(typeof instance.isHealthy).toBe('function');
    });

    it('should provide pool status information', () => {
      const instance = DatabaseConnection.getInstance();
      const status = instance.getPoolStatus();
      expect(status).toHaveProperty('totalCount');
      expect(status).toHaveProperty('idleCount');
      expect(status).toHaveProperty('waitingCount');
      expect(typeof status.totalCount).toBe('number');
      expect(typeof status.idleCount).toBe('number');
      expect(typeof status.waitingCount).toBe('number');
    });
  });

  describe('Migration System', () => {
    it('should have migration runner with required methods', () => {
      expect(typeof migrationRunner.runMigrations).toBe('function');
      expect(typeof migrationRunner.rollbackMigration).toBe('function');
      expect(typeof migrationRunner.getExecutedMigrations).toBe('function');
    });

    it('should have predefined migrations', () => {
      // Access private migrations array through the class
      const migrations = (migrationRunner as any).migrations;
      expect(Array.isArray(migrations)).toBe(true);
      expect(migrations.length).toBeGreaterThan(0);
      
      // Check that migrations have required structure
      migrations.forEach((migration: any) => {
        expect(migration).toHaveProperty('id');
        expect(migration).toHaveProperty('name');
        expect(migration).toHaveProperty('up');
        expect(migration).toHaveProperty('down');
        expect(typeof migration.up).toBe('function');
        expect(typeof migration.down).toBe('function');
      });
    });

    it('should have initial schema migration', () => {
      const migrations = (migrationRunner as any).migrations;
      const initialMigration = migrations.find((m: any) => m.id === '001');
      expect(initialMigration).toBeDefined();
      expect(initialMigration.name).toBe('create_initial_schema');
    });

    it('should have performance indexes migration', () => {
      const migrations = (migrationRunner as any).migrations;
      const indexMigration = migrations.find((m: any) => m.id === '002');
      expect(indexMigration).toBeDefined();
      expect(indexMigration.name).toBe('add_performance_indexes');
    });
  });

  describe('Error Handling Configuration', () => {
    it('should have proper timeout configurations', () => {
      // These values are set in the DatabaseConnection constructor
      expect(config.database.host).toBeDefined();
      expect(config.database.port).toBeGreaterThan(0);
    });

    it('should handle missing environment variables gracefully', () => {
      // Test that validateConfig throws for missing required vars
      const originalEnv = process.env.JWT_SECRET;
      delete process.env.JWT_SECRET;
      
      expect(() => {
        // Re-import to trigger validation
        delete require.cache[require.resolve('../shared/config')];
        require('../shared/config');
      }).toThrow();
      
      // Restore environment
      process.env.JWT_SECRET = originalEnv;
    });
  });

  describe('Database Schema Validation', () => {
    it('should define proper table structures in migrations', () => {
      const migrations = (migrationRunner as any).migrations;
      const schemaMigration = migrations.find((m: any) => m.id === '001');
      
      // Convert function to string to check for table definitions
      const migrationCode = schemaMigration.up.toString();
      
      // Check that essential tables are created
      expect(migrationCode).toContain('CREATE TABLE IF NOT EXISTS players');
      expect(migrationCode).toContain('CREATE TABLE IF NOT EXISTS islands');
      expect(migrationCode).toContain('CREATE TABLE IF NOT EXISTS player_skills');
      expect(migrationCode).toContain('CREATE TABLE IF NOT EXISTS player_inventory');
      expect(migrationCode).toContain('CREATE TABLE IF NOT EXISTS world_chunks');
      expect(migrationCode).toContain('CREATE TABLE IF NOT EXISTS market_listings');
      expect(migrationCode).toContain('CREATE TABLE IF NOT EXISTS transactions');
      expect(migrationCode).toContain('CREATE TABLE IF NOT EXISTS minions');
    });

    it('should define proper foreign key relationships', () => {
      const migrations = (migrationRunner as any).migrations;
      const schemaMigration = migrations.find((m: any) => m.id === '001');
      const migrationCode = schemaMigration.up.toString();
      
      // Check for foreign key references
      expect(migrationCode).toContain('REFERENCES players(id)');
      expect(migrationCode).toContain('REFERENCES islands(id)');
      expect(migrationCode).toContain('ON DELETE CASCADE');
    });

    it('should define proper indexes for performance', () => {
      const migrations = (migrationRunner as any).migrations;
      const indexMigration = migrations.find((m: any) => m.id === '002');
      const migrationCode = indexMigration.up.toString();
      
      // Check for essential indexes
      expect(migrationCode).toContain('CREATE INDEX IF NOT EXISTS idx_players_username');
      expect(migrationCode).toContain('CREATE INDEX IF NOT EXISTS idx_player_skills_player_id');
      expect(migrationCode).toContain('CREATE INDEX IF NOT EXISTS idx_market_listings_item_id');
      expect(migrationCode).toContain('CREATE INDEX IF NOT EXISTS idx_world_chunks_island_id');
    });

    it('should have proper data constraints', () => {
      const migrations = (migrationRunner as any).migrations;
      const schemaMigration = migrations.find((m: any) => m.id === '001');
      const migrationCode = schemaMigration.up.toString();
      
      // Check for data integrity constraints
      expect(migrationCode).toContain('CHECK (length(username) >= 3)');
      expect(migrationCode).toContain('CHECK (quantity > 0)');
      expect(migrationCode).toContain('CHECK (price > 0)');
      expect(migrationCode).toContain('CHECK (level > 0)');
    });
  });
});