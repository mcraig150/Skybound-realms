-- Initial database schema for Skybound Realms
-- Migration: 001_initial_schema
-- Created: 2024-01-01

BEGIN;

-- Create extension for UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Players table
CREATE TABLE players (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    skills JSONB DEFAULT '{}',
    inventory JSONB DEFAULT '[]',
    currency JSONB DEFAULT '{"coins": 1000}',
    level INTEGER DEFAULT 1,
    experience BIGINT DEFAULT 0,
    last_login TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    settings JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    is_banned BOOLEAN DEFAULT false
);

-- Islands table
CREATE TABLE islands (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    owner_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    expansion_level INTEGER DEFAULT 1,
    size JSONB DEFAULT '{"x": 64, "y": 64, "z": 64}',
    permissions JSONB DEFAULT '{"public": false, "friends": true}',
    visit_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_modified TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Island chunks table
CREATE TABLE island_chunks (
    island_id UUID NOT NULL REFERENCES islands(id) ON DELETE CASCADE,
    chunk_x INTEGER NOT NULL,
    chunk_y INTEGER NOT NULL,
    chunk_z INTEGER NOT NULL,
    voxel_data BYTEA,
    entities JSONB DEFAULT '[]',
    last_modified TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    PRIMARY KEY (island_id, chunk_x, chunk_y, chunk_z)
);

-- Items table
CREATE TABLE items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    type VARCHAR(100) NOT NULL,
    rarity VARCHAR(50) DEFAULT 'common',
    stack_size INTEGER DEFAULT 1,
    value INTEGER DEFAULT 0,
    stats JSONB DEFAULT '{}',
    crafting_recipe JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Guilds table
CREATE TABLE guilds (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    leader_id UUID NOT NULL REFERENCES players(id),
    member_limit INTEGER DEFAULT 50,
    level INTEGER DEFAULT 1,
    experience BIGINT DEFAULT 0,
    perks JSONB DEFAULT '{}',
    treasury JSONB DEFAULT '{"coins": 0}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    settings JSONB DEFAULT '{"public": true, "auto_accept": false}'
);

-- Guild members table
CREATE TABLE guild_members (
    guild_id UUID NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
    player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    role VARCHAR(50) DEFAULT 'member',
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    contribution_points INTEGER DEFAULT 0,
    PRIMARY KEY (guild_id, player_id)
);

-- Market listings table
CREATE TABLE market_listings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    seller_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    item_id UUID NOT NULL REFERENCES items(id),
    quantity INTEGER NOT NULL,
    price_per_unit INTEGER NOT NULL,
    total_price INTEGER NOT NULL,
    duration INTEGER NOT NULL,
    listed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    status VARCHAR(50) DEFAULT 'active',
    category VARCHAR(100),
    CHECK (quantity > 0),
    CHECK (price_per_unit > 0)
);

-- Transactions table
CREATE TABLE transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    buyer_id UUID NOT NULL REFERENCES players(id),
    seller_id UUID NOT NULL REFERENCES players(id),
    listing_id UUID REFERENCES market_listings(id),
    item_id UUID NOT NULL REFERENCES items(id),
    quantity INTEGER NOT NULL,
    price_per_unit INTEGER NOT NULL,
    total_amount INTEGER NOT NULL,
    market_fee INTEGER DEFAULT 0,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    status VARCHAR(50) DEFAULT 'completed',
    CHECK (quantity > 0),
    CHECK (total_amount > 0)
);

-- Minions table
CREATE TABLE minions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    owner_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    island_id UUID NOT NULL REFERENCES islands(id) ON DELETE CASCADE,
    type VARCHAR(100) NOT NULL,
    level INTEGER DEFAULT 1,
    position JSONB NOT NULL,
    status VARCHAR(50) DEFAULT 'active',
    efficiency DECIMAL(5,2) DEFAULT 1.0,
    storage_capacity INTEGER DEFAULT 64,
    collected_resources JSONB DEFAULT '[]',
    last_collection TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deployed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Player skills table (normalized from JSONB for better querying)
CREATE TABLE player_skills (
    player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    skill_type VARCHAR(50) NOT NULL,
    level INTEGER DEFAULT 1,
    experience BIGINT DEFAULT 0,
    prestige INTEGER DEFAULT 0,
    PRIMARY KEY (player_id, skill_type)
);

-- Player inventory table (normalized from JSONB for better querying)
CREATE TABLE player_inventory (
    player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    item_id UUID NOT NULL REFERENCES items(id),
    quantity INTEGER NOT NULL,
    slot_position INTEGER,
    metadata JSONB DEFAULT '{}',
    PRIMARY KEY (player_id, item_id),
    CHECK (quantity > 0)
);

-- Create indexes for performance
CREATE INDEX idx_players_username ON players(username);
CREATE INDEX idx_players_email ON players(email);
CREATE INDEX idx_players_last_login ON players(last_login);
CREATE INDEX idx_players_level ON players(level);

CREATE INDEX idx_islands_owner ON islands(owner_id);
CREATE INDEX idx_islands_name ON islands(name);

CREATE INDEX idx_island_chunks_island ON island_chunks(island_id);
CREATE INDEX idx_island_chunks_coords ON island_chunks(chunk_x, chunk_y, chunk_z);

CREATE INDEX idx_items_type ON items(type);
CREATE INDEX idx_items_rarity ON items(rarity);
CREATE INDEX idx_items_name ON items(name);

CREATE INDEX idx_guilds_name ON guilds(name);
CREATE INDEX idx_guilds_leader ON guilds(leader_id);

CREATE INDEX idx_guild_members_player ON guild_members(player_id);
CREATE INDEX idx_guild_members_guild ON guild_members(guild_id);

CREATE INDEX idx_market_listings_seller ON market_listings(seller_id);
CREATE INDEX idx_market_listings_item ON market_listings(item_id);
CREATE INDEX idx_market_listings_status ON market_listings(status);
CREATE INDEX idx_market_listings_category ON market_listings(category);
CREATE INDEX idx_market_listings_expires ON market_listings(expires_at);

CREATE INDEX idx_transactions_buyer ON transactions(buyer_id);
CREATE INDEX idx_transactions_seller ON transactions(seller_id);
CREATE INDEX idx_transactions_timestamp ON transactions(timestamp);

CREATE INDEX idx_minions_owner ON minions(owner_id);
CREATE INDEX idx_minions_island ON minions(island_id);
CREATE INDEX idx_minions_type ON minions(type);

CREATE INDEX idx_player_skills_player ON player_skills(player_id);
CREATE INDEX idx_player_skills_type ON player_skills(skill_type);
CREATE INDEX idx_player_skills_level ON player_skills(level);

CREATE INDEX idx_player_inventory_player ON player_inventory(player_id);
CREATE INDEX idx_player_inventory_item ON player_inventory(item_id);

-- Create triggers for updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_players_updated_at BEFORE UPDATE ON players
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert migration record
CREATE TABLE IF NOT EXISTS schema_migrations (
    version VARCHAR(255) PRIMARY KEY,
    applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

INSERT INTO schema_migrations (version) VALUES ('001_initial_schema');

COMMIT;