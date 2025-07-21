-- Rollback for migration 002_add_indexes_optimization
-- Rollback: 002_remove_indexes_optimization

BEGIN;

-- Drop the indexes added in migration 002
DROP INDEX CONCURRENTLY IF EXISTS idx_market_listings_active_category;
DROP INDEX CONCURRENTLY IF EXISTS idx_market_listings_active_price;
DROP INDEX CONCURRENTLY IF EXISTS idx_transactions_recent;
DROP INDEX CONCURRENTLY IF EXISTS idx_players_active_level;
DROP INDEX CONCURRENTLY IF EXISTS idx_guilds_active_level;
DROP INDEX CONCURRENTLY IF EXISTS idx_minions_active_collection;
DROP INDEX CONCURRENTLY IF EXISTS idx_market_listings_unexpired;
DROP INDEX CONCURRENTLY IF EXISTS idx_players_recent_login;
DROP INDEX CONCURRENTLY IF EXISTS idx_players_skills_gin;
DROP INDEX CONCURRENTLY IF EXISTS idx_players_inventory_gin;
DROP INDEX CONCURRENTLY IF EXISTS idx_islands_permissions_gin;

-- Remove migration record
DELETE FROM schema_migrations WHERE version = '002_add_indexes_optimization';

COMMIT;