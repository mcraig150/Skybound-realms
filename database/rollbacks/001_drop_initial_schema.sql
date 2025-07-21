-- Rollback for migration 001_initial_schema
-- Rollback: 001_drop_initial_schema
-- WARNING: This will destroy all data!

BEGIN;

-- Drop all tables in reverse dependency order
DROP TABLE IF EXISTS player_inventory CASCADE;
DROP TABLE IF EXISTS player_skills CASCADE;
DROP TABLE IF EXISTS minions CASCADE;
DROP TABLE IF EXISTS transactions CASCADE;
DROP TABLE IF EXISTS market_listings CASCADE;
DROP TABLE IF EXISTS guild_members CASCADE;
DROP TABLE IF EXISTS guilds CASCADE;
DROP TABLE IF EXISTS items CASCADE;
DROP TABLE IF EXISTS island_chunks CASCADE;
DROP TABLE IF EXISTS islands CASCADE;
DROP TABLE IF EXISTS players CASCADE;

-- Drop functions
DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE;

-- Drop extensions (be careful with this in production)
-- DROP EXTENSION IF EXISTS "uuid-ossp";

-- Remove migration record
DELETE FROM schema_migrations WHERE version = '001_initial_schema';

COMMIT;