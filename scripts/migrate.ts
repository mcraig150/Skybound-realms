#!/usr/bin/env ts-node

import { Pool } from 'pg';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

interface Migration {
  version: string;
  filename: string;
  sql: string;
}

interface MigrationRecord {
  version: string;
  applied_at: Date;
}

class MigrationRunner {
  private pool: Pool;
  private migrationsDir: string;
  private rollbacksDir: string;

  constructor() {
    this.pool = new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME || 'skybound_realms',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'password',
    });

    this.migrationsDir = join(__dirname, '..', 'database', 'migrations');
    this.rollbacksDir = join(__dirname, '..', 'database', 'rollbacks');
  }

  async initialize(): Promise<void> {
    // Create schema_migrations table if it doesn't exist
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version VARCHAR(255) PRIMARY KEY,
        applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);
  }

  async getAppliedMigrations(): Promise<MigrationRecord[]> {
    const result = await this.pool.query(
      'SELECT version, applied_at FROM schema_migrations ORDER BY version'
    );
    return result.rows;
  }

  async getAvailableMigrations(): Promise<Migration[]> {
    const files = readdirSync(this.migrationsDir)
      .filter(file => file.endsWith('.sql'))
      .sort();

    const migrations: Migration[] = [];

    for (const filename of files) {
      const version = filename.replace('.sql', '');
      const sql = readFileSync(join(this.migrationsDir, filename), 'utf8');
      
      migrations.push({
        version,
        filename,
        sql
      });
    }

    return migrations;
  }

  async getAvailableRollbacks(): Promise<Migration[]> {
    const files = readdirSync(this.rollbacksDir)
      .filter(file => file.endsWith('.sql'))
      .sort();

    const rollbacks: Migration[] = [];

    for (const filename of files) {
      const version = filename.replace('.sql', '');
      const sql = readFileSync(join(this.rollbacksDir, filename), 'utf8');
      
      rollbacks.push({
        version,
        filename,
        sql
      });
    }

    return rollbacks;
  }

  async runMigration(migration: Migration): Promise<void> {
    console.log(`🔄 Running migration: ${migration.version}`);
    
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Execute the migration SQL
      await client.query(migration.sql);
      
      // Record the migration (if not already recorded by the migration itself)
      await client.query(
        'INSERT INTO schema_migrations (version) VALUES ($1) ON CONFLICT (version) DO NOTHING',
        [migration.version]
      );
      
      await client.query('COMMIT');
      console.log(`✅ Migration completed: ${migration.version}`);
    } catch (error) {
      await client.query('ROLLBACK');
      console.error(`❌ Migration failed: ${migration.version}`);
      throw error;
    } finally {
      client.release();
    }
  }

  async runRollback(rollback: Migration): Promise<void> {
    console.log(`🔄 Running rollback: ${rollback.version}`);
    
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Execute the rollback SQL
      await client.query(rollback.sql);
      
      await client.query('COMMIT');
      console.log(`✅ Rollback completed: ${rollback.version}`);
    } catch (error) {
      await client.query('ROLLBACK');
      console.error(`❌ Rollback failed: ${rollback.version}`);
      throw error;
    } finally {
      client.release();
    }
  }

  async migrate(): Promise<void> {
    console.log('🚀 Starting database migration...');
    
    await this.initialize();
    
    const appliedMigrations = await this.getAppliedMigrations();
    const availableMigrations = await this.getAvailableMigrations();
    
    const appliedVersions = new Set(appliedMigrations.map(m => m.version));
    const pendingMigrations = availableMigrations.filter(m => !appliedVersions.has(m.version));
    
    if (pendingMigrations.length === 0) {
      console.log('✅ No pending migrations');
      return;
    }
    
    console.log(`📋 Found ${pendingMigrations.length} pending migrations:`);
    pendingMigrations.forEach(m => console.log(`  - ${m.version}`));
    console.log('');
    
    for (const migration of pendingMigrations) {
      await this.runMigration(migration);
    }
    
    console.log('🎉 All migrations completed successfully!');
  }

  async rollback(targetVersion?: string): Promise<void> {
    console.log('🔄 Starting database rollback...');
    
    await this.initialize();
    
    const appliedMigrations = await this.getAppliedMigrations();
    const availableRollbacks = await this.getAvailableRollbacks();
    
    if (appliedMigrations.length === 0) {
      console.log('✅ No migrations to rollback');
      return;
    }
    
    // Determine which migrations to rollback
    let migrationsToRollback: MigrationRecord[];
    
    if (targetVersion) {
      // Rollback to specific version
      const targetIndex = appliedMigrations.findIndex(m => m.version === targetVersion);
      if (targetIndex === -1) {
        throw new Error(`Target version ${targetVersion} not found in applied migrations`);
      }
      migrationsToRollback = appliedMigrations.slice(targetIndex + 1).reverse();
    } else {
      // Rollback last migration only
      const lastMigration = appliedMigrations[appliedMigrations.length - 1];
      if (!lastMigration) {
        throw new Error('No migrations to rollback');
      }
      migrationsToRollback = [lastMigration];
    }
    
    console.log(`📋 Rolling back ${migrationsToRollback.length} migrations:`);
    migrationsToRollback.forEach(m => console.log(`  - ${m.version}`));
    console.log('');
    
    for (const migration of migrationsToRollback) {
      const rollback = availableRollbacks.find(r => r.version.includes(migration.version));
      if (!rollback) {
        console.warn(`⚠️  No rollback script found for migration: ${migration.version}`);
        continue;
      }
      
      await this.runRollback(rollback);
    }
    
    console.log('🎉 Rollback completed successfully!');
  }

  async status(): Promise<void> {
    console.log('📊 Migration Status:');
    console.log('');
    
    await this.initialize();
    
    const appliedMigrations = await this.getAppliedMigrations();
    const availableMigrations = await this.getAvailableMigrations();
    
    console.log(`Applied migrations: ${appliedMigrations.length}`);
    console.log(`Available migrations: ${availableMigrations.length}`);
    console.log('');
    
    const appliedVersions = new Set(appliedMigrations.map(m => m.version));
    
    console.log('Migration Details:');
    for (const migration of availableMigrations) {
      const status = appliedVersions.has(migration.version) ? '✅ Applied' : '⏳ Pending';
      const appliedDate = appliedMigrations.find(m => m.version === migration.version)?.applied_at;
      const dateStr = appliedDate ? ` (${appliedDate.toISOString()})` : '';
      
      console.log(`  ${status} ${migration.version}${dateStr}`);
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

// CLI Interface
async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'migrate';
  
  const runner = new MigrationRunner();
  
  try {
    switch (command) {
      case 'migrate':
      case 'up':
        await runner.migrate();
        break;
      case 'rollback':
      case 'down':
        const targetVersion = args[1];
        await runner.rollback(targetVersion);
        break;
      case 'status':
        await runner.status();
        break;
      case 'help':
        console.log('Usage:');
        console.log('  npm run migrate              - Run pending migrations');
        console.log('  npm run migrate rollback     - Rollback last migration');
        console.log('  npm run migrate rollback 001 - Rollback to specific version');
        console.log('  npm run migrate status       - Show migration status');
        break;
      default:
        console.error(`Unknown command: ${command}`);
        console.log('Use "npm run migrate help" for usage information');
        process.exit(1);
    }
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await runner.close();
  }
}

if (require.main === module) {
  main();
}

export { MigrationRunner };