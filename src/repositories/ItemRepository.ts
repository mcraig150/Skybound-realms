import { ItemStack, Item, ItemCategory, ItemRarity } from '../models/Item';
import { AbstractRepository } from './BaseRepository';

export interface MarketListing {
  id: string;
  sellerId: string;
  item: ItemStack;
  price: number;
  listedAt: Date;
  expiresAt: Date;
  category: ItemCategory;
  isActive: boolean;
}

export interface Transaction {
  id: string;
  buyerId: string;
  sellerId: string;
  item: ItemStack;
  price: number;
  timestamp: Date;
  marketFee: number;
}

export interface PriceHistory {
  itemId: string;
  averagePrice: number;
  minPrice: number;
  maxPrice: number;
  totalVolume: number;
  pricePoints: Array<{
    price: number;
    timestamp: Date;
    volume: number;
  }>;
  trend?: 'rising' | 'falling' | 'stable';
}

export interface MarketSearchOptions {
  category?: ItemCategory;
  rarity?: ItemRarity;
  minPrice?: number;
  maxPrice?: number;
  sellerId?: string;
  itemId?: string;
  limit?: number;
  offset?: number;
  sortBy?: 'price' | 'listed_at' | 'expires_at';
  sortOrder?: 'ASC' | 'DESC';
}

export class ItemRepository extends AbstractRepository<Item, string> {
  protected tableName = 'items';

  async findById(id: string): Promise<Item | null> {
    const query = 'SELECT * FROM items WHERE id = $1';
    const rows = await this.executeQuery(query, [id]);
    
    if (rows.length === 0) {
      return null;
    }

    return this.mapRowToItem(rows[0]);
  }

  async findAll(): Promise<Item[]> {
    const query = 'SELECT * FROM items ORDER BY name';
    const rows = await this.executeQuery(query);
    return rows.map(row => this.mapRowToItem(row));
  }

  async findByCategory(category: ItemCategory): Promise<Item[]> {
    const query = 'SELECT * FROM items WHERE category = $1 ORDER BY name';
    const rows = await this.executeQuery(query, [category]);
    return rows.map(row => this.mapRowToItem(row));
  }

  async findByRarity(rarity: ItemRarity): Promise<Item[]> {
    const query = 'SELECT * FROM items WHERE rarity = $1 ORDER BY name';
    const rows = await this.executeQuery(query, [rarity]);
    return rows.map(row => this.mapRowToItem(row));
  }

  async create(itemData: Omit<Item, 'id'>): Promise<Item> {
    const itemInsert = {
      id: this.generateId(),
      name: itemData.name,
      description: itemData.description,
      category: itemData.category,
      rarity: itemData.rarity,
      max_stack_size: itemData.maxStackSize,
      base_stats: itemData.baseStats ? JSON.stringify(itemData.baseStats) : null,
      crafting_recipe: itemData.craftingRecipe ? JSON.stringify(itemData.craftingRecipe) : null
    };

    const { query, params } = this.buildInsertQuery('items', itemInsert);
    const result = await this.executeQuery(query, params);
    return this.mapRowToItem(result[0]);
  }

  async update(id: string, updates: Partial<Item>): Promise<Item | null> {
    const itemUpdates: Record<string, any> = {};
    
    if (updates.name !== undefined) itemUpdates.name = updates.name;
    if (updates.description !== undefined) itemUpdates.description = updates.description;
    if (updates.category !== undefined) itemUpdates.category = updates.category;
    if (updates.rarity !== undefined) itemUpdates.rarity = updates.rarity;
    if (updates.maxStackSize !== undefined) itemUpdates.max_stack_size = updates.maxStackSize;
    if (updates.baseStats !== undefined) itemUpdates.base_stats = JSON.stringify(updates.baseStats);
    if (updates.craftingRecipe !== undefined) itemUpdates.crafting_recipe = JSON.stringify(updates.craftingRecipe);
    
    itemUpdates.id = id;

    if (Object.keys(itemUpdates).length <= 1) {
      return this.findById(id);
    }

    const { query, params } = this.buildUpdateQuery('items', itemUpdates);
    const result = await this.executeQuery(query, params);
    
    if (result.length === 0) {
      return null;
    }

    return this.mapRowToItem(result[0]);
  }

  async delete(id: string): Promise<boolean> {
    const query = 'DELETE FROM items WHERE id = $1';
    const result = await this.executeQuery(query, [id]);
    return result.length > 0;
  }

  // Market Listing Methods
  async createMarketListing(listing: Omit<MarketListing, 'id'>): Promise<MarketListing> {
    const listingInsert = {
      id: this.generateId(),
      seller_id: listing.sellerId,
      item_id: listing.item.itemId,
      item_quantity: listing.item.quantity,
      item_metadata: listing.item.metadata ? JSON.stringify(listing.item.metadata) : null,
      price: listing.price,
      listed_at: listing.listedAt,
      expires_at: listing.expiresAt,
      category: listing.category,
      is_active: listing.isActive
    };

    const { query, params } = this.buildInsertQuery('market_listings', listingInsert);
    const result = await this.executeQuery(query, params);
    return this.mapRowToMarketListing(result[0]);
  }

  async getMarketListing(id: string): Promise<MarketListing | null> {
    const query = 'SELECT * FROM market_listings WHERE id = $1';
    const rows = await this.executeQuery(query, [id]);
    
    if (rows.length === 0) {
      return null;
    }

    return this.mapRowToMarketListing(rows[0]);
  }

  async searchMarketListings(options: MarketSearchOptions = {}): Promise<MarketListing[]> {
    let query = `
      SELECT * FROM market_listings 
      WHERE is_active = true AND expires_at > NOW()
    `;
    
    const params: any[] = [];
    let paramIndex = 1;

    if (options.category) {
      query += ` AND category = $${paramIndex}`;
      params.push(options.category);
      paramIndex++;
    }

    if (options.itemId) {
      query += ` AND item_id = $${paramIndex}`;
      params.push(options.itemId);
      paramIndex++;
    }

    if (options.sellerId) {
      query += ` AND seller_id = $${paramIndex}`;
      params.push(options.sellerId);
      paramIndex++;
    }

    if (options.minPrice !== undefined) {
      query += ` AND price >= $${paramIndex}`;
      params.push(options.minPrice);
      paramIndex++;
    }

    if (options.maxPrice !== undefined) {
      query += ` AND price <= $${paramIndex}`;
      params.push(options.maxPrice);
      paramIndex++;
    }

    // Add sorting
    const sortBy = options.sortBy || 'listed_at';
    const sortOrder = options.sortOrder || 'DESC';
    query += ` ORDER BY ${sortBy} ${sortOrder}`;

    if (options.limit) {
      query += ` LIMIT $${paramIndex}`;
      params.push(options.limit);
      paramIndex++;
    }

    if (options.offset) {
      query += ` OFFSET $${paramIndex}`;
      params.push(options.offset);
    }

    const rows = await this.executeQuery(query, params);
    return rows.map(row => this.mapRowToMarketListing(row));
  }

  async updateMarketListing(id: string, updates: Partial<MarketListing>): Promise<MarketListing | null> {
    const listingUpdates: Record<string, any> = {};
    
    if (updates.price !== undefined) listingUpdates.price = updates.price;
    if (updates.expiresAt !== undefined) listingUpdates.expires_at = updates.expiresAt;
    if (updates.isActive !== undefined) listingUpdates.is_active = updates.isActive;
    
    listingUpdates.id = id;

    if (Object.keys(listingUpdates).length <= 1) {
      return this.getMarketListing(id);
    }

    const { query, params } = this.buildUpdateQuery('market_listings', listingUpdates);
    const result = await this.executeQuery(query, params);
    
    if (result.length === 0) {
      return null;
    }

    return this.mapRowToMarketListing(result[0]);
  }

  async deleteMarketListing(id: string): Promise<boolean> {
    const query = 'DELETE FROM market_listings WHERE id = $1';
    const result = await this.executeQuery(query, [id]);
    return result.length > 0;
  }

  async getPlayerListings(sellerId: string, activeOnly: boolean = true): Promise<MarketListing[]> {
    let query = 'SELECT * FROM market_listings WHERE seller_id = $1';
    const params: any[] = [sellerId];

    if (activeOnly) {
      query += ' AND is_active = true AND expires_at > NOW()';
    }

    query += ' ORDER BY listed_at DESC';

    const rows = await this.executeQuery(query, params);
    return rows.map(row => this.mapRowToMarketListing(row));
  }

  async expireListings(): Promise<number> {
    const query = `
      UPDATE market_listings 
      SET is_active = false 
      WHERE is_active = true AND expires_at <= NOW()
    `;
    
    const result = await this.executeQuery(query);
    return result.length;
  }

  // Transaction Methods
  async createTransaction(transaction: Omit<Transaction, 'id'>): Promise<Transaction> {
    const transactionInsert = {
      id: this.generateId(),
      buyer_id: transaction.buyerId,
      seller_id: transaction.sellerId,
      item_id: transaction.item.itemId,
      item_quantity: transaction.item.quantity,
      item_metadata: transaction.item.metadata ? JSON.stringify(transaction.item.metadata) : null,
      price: transaction.price,
      timestamp: transaction.timestamp,
      market_fee: transaction.marketFee
    };

    const { query, params } = this.buildInsertQuery('transactions', transactionInsert);
    const result = await this.executeQuery(query, params);
    return this.mapRowToTransaction(result[0]);
  }

  async getTransaction(id: string): Promise<Transaction | null> {
    const query = 'SELECT * FROM transactions WHERE id = $1';
    const rows = await this.executeQuery(query, [id]);
    
    if (rows.length === 0) {
      return null;
    }

    return this.mapRowToTransaction(rows[0]);
  }

  async getPlayerTransactions(playerId: string, limit: number = 50): Promise<Transaction[]> {
    const query = `
      SELECT * FROM transactions 
      WHERE buyer_id = $1 OR seller_id = $1 
      ORDER BY timestamp DESC 
      LIMIT $2
    `;
    
    const rows = await this.executeQuery(query, [playerId, limit]);
    return rows.map(row => this.mapRowToTransaction(row));
  }

  async getItemPriceHistory(itemId: string, days: number = 30): Promise<PriceHistory> {
    const query = `
      SELECT price, timestamp, item_quantity as volume
      FROM transactions 
      WHERE item_id = $1 AND timestamp >= NOW() - INTERVAL '${days} days'
      ORDER BY timestamp DESC
    `;
    
    const rows = await this.executeQuery(query, [itemId]);
    
    if (rows.length === 0) {
      return {
        itemId,
        averagePrice: 0,
        minPrice: 0,
        maxPrice: 0,
        totalVolume: 0,
        pricePoints: []
      };
    }

    const prices = rows.map(row => row.price);
    const volumes = rows.map(row => row.volume);
    
    return {
      itemId,
      averagePrice: prices.reduce((sum, price) => sum + price, 0) / prices.length,
      minPrice: Math.min(...prices),
      maxPrice: Math.max(...prices),
      totalVolume: volumes.reduce((sum, vol) => sum + vol, 0),
      pricePoints: rows.map(row => ({
        price: row.price,
        timestamp: new Date(row.timestamp),
        volume: row.volume
      }))
    };
  }

  async getMarketStatistics(): Promise<{
    totalListings: number;
    activeListings: number;
    totalTransactions: number;
    totalVolume: number;
    averagePrice: number;
  }> {
    const listingsQuery = `
      SELECT 
        COUNT(*) as total_listings,
        COUNT(CASE WHEN is_active = true AND expires_at > NOW() THEN 1 END) as active_listings
      FROM market_listings
    `;
    
    const transactionsQuery = `
      SELECT 
        COUNT(*) as total_transactions,
        SUM(item_quantity) as total_volume,
        AVG(price) as average_price
      FROM transactions
      WHERE timestamp >= NOW() - INTERVAL '30 days'
    `;

    const [listingsResult, transactionsResult] = await Promise.all([
      this.executeQuery(listingsQuery),
      this.executeQuery(transactionsQuery)
    ]);

    const listings = listingsResult[0];
    const transactions = transactionsResult[0];

    return {
      totalListings: parseInt(listings.total_listings) || 0,
      activeListings: parseInt(listings.active_listings) || 0,
      totalTransactions: parseInt(transactions.total_transactions) || 0,
      totalVolume: parseInt(transactions.total_volume) || 0,
      averagePrice: parseFloat(transactions.average_price) || 0
    };
  }

  private mapRowToItem(row: any): Item {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      category: row.category,
      rarity: row.rarity,
      maxStackSize: row.max_stack_size,
      baseStats: row.base_stats ? JSON.parse(row.base_stats) : undefined,
      craftingRecipe: row.crafting_recipe ? JSON.parse(row.crafting_recipe) : undefined
    };
  }

  private mapRowToMarketListing(row: any): MarketListing {
    return {
      id: row.id,
      sellerId: row.seller_id,
      item: {
        itemId: row.item_id,
        quantity: row.item_quantity,
        metadata: row.item_metadata ? JSON.parse(row.item_metadata) : undefined
      },
      price: row.price,
      listedAt: new Date(row.listed_at),
      expiresAt: new Date(row.expires_at),
      category: row.category,
      isActive: row.is_active
    };
  }

  private mapRowToTransaction(row: any): Transaction {
    return {
      id: row.id,
      buyerId: row.buyer_id,
      sellerId: row.seller_id,
      item: {
        itemId: row.item_id,
        quantity: row.item_quantity,
        metadata: row.item_metadata ? JSON.parse(row.item_metadata) : undefined
      },
      price: row.price,
      timestamp: new Date(row.timestamp),
      marketFee: row.market_fee
    };
  }

  private generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
  }
}