-- Create market_listings table
CREATE TABLE IF NOT EXISTS market_listings (
    id VARCHAR(255) PRIMARY KEY,
    seller_id VARCHAR(255) NOT NULL,
    item_id VARCHAR(255) NOT NULL,
    item_quantity INTEGER NOT NULL,
    item_metadata JSONB,
    price INTEGER NOT NULL,
    listed_at TIMESTAMP NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMP NOT NULL,
    category VARCHAR(50) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    auto_relist BOOLEAN DEFAULT false,
    reserve_price INTEGER,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Create transactions table
CREATE TABLE IF NOT EXISTS transactions (
    id VARCHAR(255) PRIMARY KEY,
    buyer_id VARCHAR(255) NOT NULL,
    seller_id VARCHAR(255) NOT NULL,
    item_id VARCHAR(255) NOT NULL,
    item_quantity INTEGER NOT NULL,
    item_metadata JSONB,
    price INTEGER NOT NULL,
    timestamp TIMESTAMP NOT NULL DEFAULT NOW(),
    market_fee INTEGER NOT NULL DEFAULT 0
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_market_listings_seller_id ON market_listings(seller_id);
CREATE INDEX IF NOT EXISTS idx_market_listings_item_id ON market_listings(item_id);
CREATE INDEX IF NOT EXISTS idx_market_listings_category ON market_listings(category);
CREATE INDEX IF NOT EXISTS idx_market_listings_price ON market_listings(price);
CREATE INDEX IF NOT EXISTS idx_market_listings_expires_at ON market_listings(expires_at);
CREATE INDEX IF NOT EXISTS idx_market_listings_active ON market_listings(is_active);

CREATE INDEX IF NOT EXISTS idx_transactions_buyer_id ON transactions(buyer_id);
CREATE INDEX IF NOT EXISTS idx_transactions_seller_id ON transactions(seller_id);
CREATE INDEX IF NOT EXISTS idx_transactions_item_id ON transactions(item_id);
CREATE INDEX IF NOT EXISTS idx_transactions_timestamp ON transactions(timestamp);

-- Add foreign key constraints (assuming players and items tables exist)
-- ALTER TABLE market_listings ADD CONSTRAINT fk_market_listings_seller 
--     FOREIGN KEY (seller_id) REFERENCES players(id) ON DELETE CASCADE;
-- ALTER TABLE market_listings ADD CONSTRAINT fk_market_listings_item 
--     FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE;

-- ALTER TABLE transactions ADD CONSTRAINT fk_transactions_buyer 
--     FOREIGN KEY (buyer_id) REFERENCES players(id) ON DELETE CASCADE;
-- ALTER TABLE transactions ADD CONSTRAINT fk_transactions_seller 
--     FOREIGN KEY (seller_id) REFERENCES players(id) ON DELETE CASCADE;
-- ALTER TABLE transactions ADD CONSTRAINT fk_transactions_item 
--     FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE;