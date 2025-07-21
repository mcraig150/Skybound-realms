import { PoolClient } from 'pg';
import { database } from './database';

export interface Migration {
  id: string;
  name: string;
  up: (client: PoolClient) => Promise<void>;
  down: (client: PoolClient) => Promise<void>;
}

export class MigrationRunner {
  private migrations: Migration[] = [];

  constructor() {
    this.loadMigrations();
  }

  private loadMigrations(): void {
    // Migration 001: Create initial schema
    this.migrations.push({
      id: '001',
      name: 'create_initial_schema',
      up: async (client: PoolClient) => {
        // Create migrations table
        await client.query(`
          CREATE TABLE IF NOT EXISTS migrations (
            id VARCHAR(255) PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          )
        `);

        // Create players table
        await client.query(`
          CREATE TABLE IF NOT EXISTS players (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            username VARCHAR(50) UNIQUE NOT NULL,
            island_id UUID,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            last_login TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            currency_coins BIGINT DEFAULT 0,
            currency_tokens BIGINT DEFAULT 0,
            settings JSONB DEFAULT '{}',
            CONSTRAINT username_length CHECK (length(username) >= 3)
          )
        `);

        // Create player_skills table
        await client.query(`
          CREATE TABLE IF NOT EXISTS player_skills (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
            skill_type VARCHAR(50) NOT NULL,
            experience BIGINT DEFAULT 0,
            level INTEGER DEFAULT 1,
            prestige INTEGER DEFAULT 0,
            unlocked_perks TEXT[] DEFAULT '{}',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(player_id, skill_type)
          )
        `);

        // Create player_inventory table
        await client.query(`
          CREATE TABLE IF NOT EXISTS player_inventory (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
            slot_index INTEGER NOT NULL,
            item_id VARCHAR(100) NOT NULL,
            quantity INTEGER NOT NULL DEFAULT 1,
            metadata JSONB DEFAULT '{}',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(player_id, slot_index),
            CONSTRAINT positive_quantity CHECK (quantity > 0)
          )
        `);

        // Create islands table
        await client.query(`
          CREATE TABLE IF NOT EXISTS islands (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            owner_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
            expansion_level INTEGER DEFAULT 1,
            visit_count INTEGER DEFAULT 0,
            permissions JSONB DEFAULT '{}',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT positive_expansion CHECK (expansion_level > 0)
          )
        `);

        // Create world_chunks table
        await client.query(`
          CREATE TABLE IF NOT EXISTS world_chunks (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            island_id UUID NOT NULL REFERENCES islands(id) ON DELETE CASCADE,
            chunk_x INTEGER NOT NULL,
            chunk_y INTEGER NOT NULL,
            chunk_z INTEGER NOT NULL,
            voxel_data BYTEA NOT NULL,
            entities JSONB DEFAULT '[]',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(island_id, chunk_x, chunk_y, chunk_z)
          )
        `);

        // Create market_listings table
        await client.query(`
          CREATE TABLE IF NOT EXISTS market_listings (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            seller_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
            item_id VARCHAR(100) NOT NULL,
            quantity INTEGER NOT NULL,
            price BIGINT NOT NULL,
            metadata JSONB DEFAULT '{}',
            category VARCHAR(50) NOT NULL,
            listed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            expires_at TIMESTAMP NOT NULL,
            is_active BOOLEAN DEFAULT true,
            CONSTRAINT positive_price CHECK (price > 0),
            CONSTRAINT positive_quantity CHECK (quantity > 0)
          )
        `);

        // Create transactions table
        await client.query(`
          CREATE TABLE IF NOT EXISTS transactions (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            buyer_id UUID NOT NULL REFERENCES players(id),
            seller_id UUID NOT NULL REFERENCES players(id),
            listing_id UUID REFERENCES market_listings(id),
            item_id VARCHAR(100) NOT NULL,
            quantity INTEGER NOT NULL,
            price BIGINT NOT NULL,
            market_fee BIGINT DEFAULT 0,
            transaction_type VARCHAR(20) DEFAULT 'market_purchase',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT positive_values CHECK (quantity > 0 AND price > 0)
          )
        `);

        // Create minions table
        await client.query(`
          CREATE TABLE IF NOT EXISTS minions (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
            minion_type VARCHAR(50) NOT NULL,
            location_x FLOAT NOT NULL,
            location_y FLOAT NOT NULL,
            location_z FLOAT NOT NULL,
            level INTEGER DEFAULT 1,
            efficiency FLOAT DEFAULT 1.0,
            storage_capacity INTEGER DEFAULT 64,
            is_active BOOLEAN DEFAULT true,
            last_collection TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT positive_level CHECK (level > 0),
            CONSTRAINT positive_efficiency CHECK (efficiency > 0)
          )
        `);

        // Create minion_storage table
        await client.query(`
          CREATE TABLE IF NOT EXISTS minion_storage (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            minion_id UUID NOT NULL REFERENCES minions(id) ON DELETE CASCADE,
            item_id VARCHAR(100) NOT NULL,
            quantity INTEGER NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(minion_id, item_id),
            CONSTRAINT positive_quantity CHECK (quantity > 0)
          )
        `);

        console.log('Initial schema created successfully');
      },
      down: async (client: PoolClient) => {
        const tables = [
          'minion_storage',
          'minions',
          'transactions',
          'market_listings',
          'world_chunks',
          'islands',
          'player_inventory',
          'player_skills',
          'players',
          'migrations'
        ];

        for (const table of tables) {
          await client.query(`DROP TABLE IF EXISTS ${table} CASCADE`);
        }

        console.log('Initial schema dropped successfully');
      }
    });

    // Migration 002: Add indexes for performance
    this.migrations.push({
      id: '002',
      name: 'add_performance_indexes',
      up: async (client: PoolClient) => {
        // Player indexes
        await client.query('CREATE INDEX IF NOT EXISTS idx_players_username ON players(username)');
        await client.query('CREATE INDEX IF NOT EXISTS idx_players_last_login ON players(last_login)');

        // Player skills indexes
        await client.query('CREATE INDEX IF NOT EXISTS idx_player_skills_player_id ON player_skills(player_id)');
        await client.query('CREATE INDEX IF NOT EXISTS idx_player_skills_type ON player_skills(skill_type)');

        // Inventory indexes
        await client.query('CREATE INDEX IF NOT EXISTS idx_player_inventory_player_id ON player_inventory(player_id)');
        await client.query('CREATE INDEX IF NOT EXISTS idx_player_inventory_item_id ON player_inventory(item_id)');

        // Island indexes
        await client.query('CREATE INDEX IF NOT EXISTS idx_islands_owner_id ON islands(owner_id)');

        // World chunks indexes
        await client.query('CREATE INDEX IF NOT EXISTS idx_world_chunks_island_id ON world_chunks(island_id)');
        await client.query('CREATE INDEX IF NOT EXISTS idx_world_chunks_coords ON world_chunks(chunk_x, chunk_y, chunk_z)');

        // Market listings indexes
        await client.query('CREATE INDEX IF NOT EXISTS idx_market_listings_seller_id ON market_listings(seller_id)');
        await client.query('CREATE INDEX IF NOT EXISTS idx_market_listings_item_id ON market_listings(item_id)');
        await client.query('CREATE INDEX IF NOT EXISTS idx_market_listings_category ON market_listings(category)');
        await client.query('CREATE INDEX IF NOT EXISTS idx_market_listings_active ON market_listings(is_active, expires_at)');

        // Transaction indexes
        await client.query('CREATE INDEX IF NOT EXISTS idx_transactions_buyer_id ON transactions(buyer_id)');
        await client.query('CREATE INDEX IF NOT EXISTS idx_transactions_seller_id ON transactions(seller_id)');
        await client.query('CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at)');

        // Minion indexes
        await client.query('CREATE INDEX IF NOT EXISTS idx_minions_player_id ON minions(player_id)');
        await client.query('CREATE INDEX IF NOT EXISTS idx_minions_active ON minions(is_active)');

        console.log('Performance indexes created successfully');
      },
      down: async (client: PoolClient) => {
        const indexes = [
          'idx_players_username',
          'idx_players_last_login',
          'idx_player_skills_player_id',
          'idx_player_skills_type',
          'idx_player_inventory_player_id',
          'idx_player_inventory_item_id',
          'idx_islands_owner_id',
          'idx_world_chunks_island_id',
          'idx_world_chunks_coords',
          'idx_market_listings_seller_id',
          'idx_market_listings_item_id',
          'idx_market_listings_category',
          'idx_market_listings_active',
          'idx_transactions_buyer_id',
          'idx_transactions_seller_id',
          'idx_transactions_created_at',
          'idx_minions_player_id',
          'idx_minions_active'
        ];

        for (const index of indexes) {
          await client.query(`DROP INDEX IF EXISTS ${index}`);
        }

        console.log('Performance indexes dropped successfully');
      }
    });

    // Migration 003: Add advanced performance indexes
    this.migrations.push({
      id: '003',
      name: 'add_advanced_performance_indexes',
      up: async (client: PoolClient) => {
        // Composite indexes for common query patterns
        await client.query(`
          CREATE INDEX IF NOT EXISTS idx_player_skills_composite 
          ON player_skills(player_id, skill_type, level DESC)
        `);

        // Market listings with price range queries
        await client.query(`
          CREATE INDEX IF NOT EXISTS idx_market_listings_price_range 
          ON market_listings(item_id, is_active, price) 
          WHERE is_active = true
        `);

        // Recent transactions for market analysis
        await client.query(`
          CREATE INDEX IF NOT EXISTS idx_transactions_recent 
          ON transactions(created_at DESC, item_id) 
          WHERE created_at > NOW() - INTERVAL '30 days'
        `);

        // Active minions by player
        await client.query(`
          CREATE INDEX IF NOT EXISTS idx_minions_active_player 
          ON minions(player_id, is_active, last_collection) 
          WHERE is_active = true
        `);

        // World chunks spatial index
        await client.query(`
          CREATE INDEX IF NOT EXISTS idx_world_chunks_spatial 
          ON world_chunks(island_id, chunk_x, chunk_y, chunk_z)
        `);

        // Player inventory item lookup
        await client.query(`
          CREATE INDEX IF NOT EXISTS idx_player_inventory_lookup 
          ON player_inventory(player_id, item_id, quantity)
        `);

        // Market listings expiration cleanup
        await client.query(`
          CREATE INDEX IF NOT EXISTS idx_market_listings_expiry 
          ON market_listings(expires_at, is_active) 
          WHERE is_active = true
        `);

        // Player login tracking
        await client.query(`
          CREATE INDEX IF NOT EXISTS idx_players_login_tracking 
          ON players(last_login DESC, created_at)
        `);

        // Transaction volume analysis
        await client.query(`
          CREATE INDEX IF NOT EXISTS idx_transactions_volume 
          ON transactions(item_id, created_at DESC, price)
        `);

        console.log('Advanced performance indexes created successfully');
      },
      down: async (client: PoolClient) => {
        const indexes = [
          'idx_player_skills_composite',
          'idx_market_listings_price_range',
          'idx_transactions_recent',
          'idx_minions_active_player',
          'idx_world_chunks_spatial',
          'idx_player_inventory_lookup',
          'idx_market_listings_expiry',
          'idx_players_login_tracking',
          'idx_transactions_volume'
        ];

        for (const index of indexes) {
          await client.query(`DROP INDEX IF EXISTS ${index}`);
        }

        console.log('Advanced performance indexes dropped successfully');
      }
    });
  }

  public async runMigrations(): Promise<void> {
    console.log('Starting database migrations...');

    await database.transaction(async (client) => {
      // Ensure migrations table exists
      await client.query(`
        CREATE TABLE IF NOT EXISTS migrations (
          id VARCHAR(255) PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Get executed migrations
      const result = await client.query('SELECT id FROM migrations ORDER BY id');
      const executedMigrations = new Set(result.rows.map(row => row.id));

      // Run pending migrations
      for (const migration of this.migrations) {
        if (!executedMigrations.has(migration.id)) {
          console.log(`Running migration ${migration.id}: ${migration.name}`);
          
          try {
            await migration.up(client);
            await client.query(
              'INSERT INTO migrations (id, name) VALUES ($1, $2)',
              [migration.id, migration.name]
            );
            console.log(`Migration ${migration.id} completed successfully`);
          } catch (error) {
            console.error(`Migration ${migration.id} failed:`, error);
            throw error;
          }
        }
      }
    });

    console.log('Database migrations completed successfully');
  }

  public async rollbackMigration(migrationId: string): Promise<void> {
    const migration = this.migrations.find(m => m.id === migrationId);
    if (!migration) {
      throw new Error(`Migration ${migrationId} not found`);
    }

    console.log(`Rolling back migration ${migrationId}: ${migration.name}`);

    await database.transaction(async (client) => {
      await migration.down(client);
      await client.query('DELETE FROM migrations WHERE id = $1', [migrationId]);
    });

    console.log(`Migration ${migrationId} rolled back successfully`);
  }

  public async getExecutedMigrations(): Promise<{ id: string; name: string; executed_at: Date }[]> {
    const result = await database.query(`
      SELECT id, name, executed_at 
      FROM migrations 
      ORDER BY id
    `);
    return result;
  }
}

export const migrationRunner = new MigrationRunner();