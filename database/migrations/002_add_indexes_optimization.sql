-- Performance optimization indexes
-- Migration: 002_add_indexes_optimization
-- Created: 2024-01-02

BEGIN;

-- Additional composite indexes for common queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_market_listings_active_category 
ON market_listings(status, category) WHERE status = 'active';

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_market_listings_active_price 
ON market_listings(status, price_per_unit) WHERE status = 'active';

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_transactions_recent 
ON transactions(timestamp DESC, buyer_id) WHERE timestamp > NOW() - INTERVAL '30 days';

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_players_active_level 
ON players(is_active, level DESC) WHERE is_active = true;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_guilds_active_level 
ON guilds(level DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_minions_active_collection 
ON minions(status, last_collection) WHERE status = 'active';

-- Partial indexes for better performance
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_market_listings_unexpired 
ON market_listings(expires_at) WHERE status = 'active' AND expires_at > NOW();

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_players_recent_login 
ON players(last_login DESC) WHERE last_login > NOW() - INTERVAL '7 days';

-- GIN indexes for JSONB columns
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_players_skills_gin 
ON players USING GIN(skills);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_players_inventory_gin 
ON players USING GIN(inventory);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_islands_permissions_gin 
ON islands USING GIN(permissions);

-- Insert migration record
INSERT INTO schema_migrations (version) VALUES ('002_add_indexes_optimization');

COMMIT;