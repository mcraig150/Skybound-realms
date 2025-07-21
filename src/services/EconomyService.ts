import { ItemStack, ItemCategory } from '../models/Item';
import { ItemRepository, MarketListing, PriceHistory, MarketSearchOptions } from '../repositories/ItemRepository';
import { PlayerRepository } from '../repositories/PlayerRepository';

export interface MarketService {
  listItem(sellerId: string, item: ItemStack, price: number, durationHours?: number): Promise<string>;
  purchaseItem(buyerId: string, listingId: string): Promise<TransactionResult>;
  getMarketPrices(itemId: string): Promise<PriceHistory>;
  updateMarketTrends(): Promise<void>;
  searchListings(options: MarketSearchOptions): Promise<MarketListing[]>;
  getPlayerListings(playerId: string): Promise<MarketListing[]>;
  cancelListing(playerId: string, listingId: string): Promise<boolean>;
  processExpiredListings(): Promise<number>;
  getMarketStatistics(): Promise<MarketStatistics>;
}

export interface TransactionResult {
  success: boolean;
  transactionId?: string;
  error?: string;
  listing?: MarketListing;
}

export interface PricePoint {
  price: number;
  timestamp: Date;
  volume: number;
}

export enum PriceTrend {
  RISING = 'rising',
  FALLING = 'falling',
  STABLE = 'stable'
}

export interface MarketStatistics {
  totalListings: number;
  activeListings: number;
  totalTransactions: number;
  totalVolume: number;
  averagePrice: number;
  topCategories: Array<{
    category: ItemCategory;
    listingCount: number;
    averagePrice: number;
  }>;
}

export interface ListingOptions {
  durationHours?: number;
  autoRelist?: boolean;
  reservePrice?: number;
}

export class EconomyService implements MarketService {
  private itemRepository: ItemRepository;
  private playerRepository: PlayerRepository;
  private readonly DEFAULT_LISTING_DURATION_HOURS = 168; // 7 days
  private readonly MARKET_FEE_PERCENTAGE = 0.05; // 5% market fee
  private readonly MAX_LISTING_DURATION_HOURS = 720; // 30 days
  private readonly MIN_LISTING_PRICE = 1;

  constructor(itemRepository?: ItemRepository, playerRepository?: PlayerRepository) {
    this.itemRepository = itemRepository || (new MockItemRepository() as any);
    this.playerRepository = playerRepository || (new MockPlayerRepository() as any);
  }

  async listItem(
    sellerId: string, 
    item: ItemStack, 
    price: number, 
    durationHours: number = this.DEFAULT_LISTING_DURATION_HOURS
  ): Promise<string> {
    // Validate inputs
    if (!sellerId || !item || !item.itemId || item.quantity <= 0) {
      throw new Error('Invalid seller ID or item data');
    }

    if (price < this.MIN_LISTING_PRICE) {
      throw new Error(`Price must be at least ${this.MIN_LISTING_PRICE} coins`);
    }

    if (durationHours <= 0 || durationHours > this.MAX_LISTING_DURATION_HOURS) {
      throw new Error(`Duration must be between 1 and ${this.MAX_LISTING_DURATION_HOURS} hours`);
    }

    // Check if player exists and has the item
    const player = await this.playerRepository.findById(sellerId);
    if (!player) {
      throw new Error('Player not found');
    }

    // Verify player has the item in inventory
    const hasItem = player.inventory.some(stack => 
      stack.itemId === item.itemId && 
      stack.quantity >= item.quantity &&
      JSON.stringify(stack.metadata) === JSON.stringify(item.metadata)
    );

    if (!hasItem) {
      throw new Error('Player does not have sufficient quantity of this item');
    }

    // Get item details for category
    const itemDetails = await this.itemRepository.findById(item.itemId);
    if (!itemDetails) {
      throw new Error('Item not found in database');
    }

    // Create listing
    const now = new Date();
    const expiresAt = new Date(now.getTime() + durationHours * 60 * 60 * 1000);

    const listing = await this.itemRepository.createMarketListing({
      sellerId,
      item,
      price,
      listedAt: now,
      expiresAt,
      category: itemDetails.category,
      isActive: true
    });

    // Remove item from player inventory
    await this.removeItemFromPlayerInventory(sellerId, item);

    return listing.id;
  }

  async purchaseItem(buyerId: string, listingId: string): Promise<TransactionResult> {
    try {
      // Get the listing
      const listing = await this.itemRepository.getMarketListing(listingId);
      if (!listing) {
        return { success: false, error: 'Listing not found' };
      }

      if (!listing.isActive || listing.expiresAt <= new Date()) {
        return { success: false, error: 'Listing is no longer active' };
      }

      if (listing.sellerId === buyerId) {
        return { success: false, error: 'Cannot purchase your own listing' };
      }

      // Get buyer and seller
      const [buyer, seller] = await Promise.all([
        this.playerRepository.findById(buyerId),
        this.playerRepository.findById(listing.sellerId)
      ]);

      if (!buyer) {
        return { success: false, error: 'Buyer not found' };
      }

      if (!seller) {
        return { success: false, error: 'Seller not found' };
      }

      // Check if buyer has enough currency
      if (buyer.currency.coins < listing.price) {
        return { success: false, error: 'Insufficient funds' };
      }

      // Calculate market fee
      const marketFee = Math.floor(listing.price * this.MARKET_FEE_PERCENTAGE);
      const sellerProceeds = listing.price - marketFee;

      // Execute transaction
      const transactionId = await this.executeTransaction(
        buyer,
        seller,
        listing,
        marketFee,
        sellerProceeds
      );

      return {
        success: true,
        transactionId,
        listing
      };

    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error purchasing item:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error occurred' 
      };
    }
  }

  async searchListings(options: MarketSearchOptions = {}): Promise<MarketListing[]> {
    return this.itemRepository.searchMarketListings(options);
  }

  async getPlayerListings(playerId: string): Promise<MarketListing[]> {
    return this.itemRepository.getPlayerListings(playerId, true);
  }

  async cancelListing(playerId: string, listingId: string): Promise<boolean> {
    const listing = await this.itemRepository.getMarketListing(listingId);
    if (!listing) {
      return false;
    }

    if (listing.sellerId !== playerId) {
      throw new Error('Cannot cancel another player\'s listing');
    }

    if (!listing.isActive) {
      return false;
    }

    // Deactivate the listing
    await this.itemRepository.updateMarketListing(listingId, { isActive: false });

    // Return item to player inventory
    await this.addItemToPlayerInventory(playerId, listing.item);

    return true;
  }

  async getMarketPrices(itemId: string): Promise<PriceHistory> {
    const priceHistory = await this.itemRepository.getItemPriceHistory(itemId, 30);
    
    // Calculate trend
    let trend = PriceTrend.STABLE;
    if (priceHistory.pricePoints.length >= 2) {
      const recentPrices = priceHistory.pricePoints.slice(0, 5);
      const olderPrices = priceHistory.pricePoints.slice(-5);
      
      const recentAvg = recentPrices.reduce((sum, p) => sum + p.price, 0) / recentPrices.length;
      const olderAvg = olderPrices.reduce((sum, p) => sum + p.price, 0) / olderPrices.length;
      
      const changePercent = (recentAvg - olderAvg) / olderAvg;
      
      if (changePercent > 0.1) {
        trend = PriceTrend.RISING;
      } else if (changePercent < -0.1) {
        trend = PriceTrend.FALLING;
      }
    }

    return {
      ...priceHistory,
      trend
    };
  }

  async updateMarketTrends(): Promise<void> {
    // This method would update cached market trend data
    // For now, trends are calculated on-demand in getMarketPrices
    // eslint-disable-next-line no-console
    console.log('Market trends updated');
  }

  async processExpiredListings(): Promise<number> {
    // Get expired listings that have auto-relist enabled
    const expiredListingsWithAutoRelist = await this.itemRepository.searchMarketListings({
      // This would need to be implemented in the repository to find expired listings with auto_relist = true
    });

    for (const listing of expiredListingsWithAutoRelist) {
      try {
        // Check if listing has auto-relist enabled (would be stored in database)
        const shouldAutoRelist = false; // This would come from the listing data
        
        if (shouldAutoRelist) {
          // Create new listing with same parameters
          await this.listItem(
            listing.sellerId,
            listing.item,
            listing.price,
            this.DEFAULT_LISTING_DURATION_HOURS
          );
        } else {
          // Return item to seller inventory
          await this.addItemToPlayerInventory(listing.sellerId, listing.item);
        }
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error(`Failed to process expired listing ${listing.id}:`, error);
      }
    }

    // Mark all expired listings as inactive
    const expiredCount = await this.itemRepository.expireListings();
    
    return expiredCount;
  }

  async getMarketStatistics(): Promise<MarketStatistics> {
    const baseStats = await this.itemRepository.getMarketStatistics();
    
    // Get top categories (simplified implementation)
    const topCategories = Object.values(ItemCategory).map(category => ({
      category,
      listingCount: 0, // Would be calculated from actual data
      averagePrice: 0
    }));

    return {
      ...baseStats,
      topCategories
    };
  }

  private async executeTransaction(
    buyer: { id: string; currency: { coins: number } },
    seller: { id: string; currency: { coins: number } },
    listing: MarketListing,
    marketFee: number,
    sellerProceeds: number
  ): Promise<string> {
    // Use database transaction to ensure atomicity
    return this.itemRepository.executeTransaction(async (client) => {
      // Deactivate the listing
      const updateListingQuery = 'UPDATE market_listings SET is_active = false WHERE id = $1';
      await client.query(updateListingQuery, [listing.id]);

      // Update buyer currency
      const updateBuyerQuery = `
        UPDATE players 
        SET currency = jsonb_set(currency, '{coins}', (currency->>'coins')::int - $1), 
            updated_at = NOW() 
        WHERE id = $2
      `;
      await client.query(updateBuyerQuery, [listing.price, buyer.id]);

      // Update seller currency
      const updateSellerQuery = `
        UPDATE players 
        SET currency = jsonb_set(currency, '{coins}', (currency->>'coins')::int + $1), 
            updated_at = NOW() 
        WHERE id = $2
      `;
      await client.query(updateSellerQuery, [sellerProceeds, seller.id]);

      // Add item to buyer inventory (simplified - should handle stacking)
      const addItemQuery = `
        INSERT INTO player_inventory (player_id, item_id, quantity, metadata, slot_index)
        VALUES ($1, $2, $3, $4, (
          SELECT COALESCE(MAX(slot_index), -1) + 1 
          FROM player_inventory 
          WHERE player_id = $1
        ))
      `;
      await client.query(addItemQuery, [
        buyer.id,
        listing.item.itemId,
        listing.item.quantity,
        listing.item.metadata ? JSON.stringify(listing.item.metadata) : null
      ]);

      // Create transaction record
      const transactionId = this.generateId();
      const createTransactionQuery = `
        INSERT INTO transactions (id, buyer_id, seller_id, item_id, item_quantity, item_metadata, price, timestamp, market_fee)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `;
      await client.query(createTransactionQuery, [
        transactionId,
        buyer.id,
        seller.id,
        listing.item.itemId,
        listing.item.quantity,
        listing.item.metadata ? JSON.stringify(listing.item.metadata) : null,
        listing.price,
        new Date(),
        marketFee
      ]);

      return transactionId;
    });
  }

  private generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substring(2, 9);
  }

  private async removeItemFromPlayerInventory(playerId: string, item: ItemStack): Promise<void> {
    const player = await this.playerRepository.findById(playerId);
    if (!player) {
      throw new Error('Player not found');
    }

    // Find and remove the item from inventory
    let remainingToRemove = item.quantity;
    for (let i = player.inventory.length - 1; i >= 0 && remainingToRemove > 0; i--) {
      const stack = player.inventory[i];
      if (stack && stack.itemId === item.itemId && 
          JSON.stringify(stack.metadata) === JSON.stringify(item.metadata)) {
        
        const amountToRemove = Math.min(remainingToRemove, stack.quantity);
        stack.quantity -= amountToRemove;
        remainingToRemove -= amountToRemove;

        if (stack.quantity === 0) {
          player.inventory.splice(i, 1);
        }
      }
    }

    await this.playerRepository.update(playerId, { inventory: player.inventory });
  }

  private async addItemToPlayerInventory(playerId: string, item: ItemStack): Promise<void> {
    const player = await this.playerRepository.findById(playerId);
    if (!player) {
      throw new Error('Player not found');
    }

    // Add item to inventory (simplified - should use InventoryManager)
    const existingStack = player.inventory.find(stack => 
      stack.itemId === item.itemId && 
      JSON.stringify(stack.metadata) === JSON.stringify(item.metadata)
    );

    if (existingStack) {
      existingStack.quantity += item.quantity;
    } else {
      player.inventory.push({ ...item });
    }

    await this.playerRepository.update(playerId, { inventory: player.inventory });
  }

  /**
   * Get market listings with search parameters (API method)
   */
  async getMarketListings(searchParams: any): Promise<MarketListing[]> {
    const options: MarketSearchOptions = {
      itemId: searchParams.itemId,
      category: searchParams.category,
      minPrice: searchParams.minPrice,
      maxPrice: searchParams.maxPrice,
      sortBy: searchParams.sortBy || 'TIME_DESC',
      limit: searchParams.limit || 50,
      offset: searchParams.offset || 0
    };
    return await this.searchListings(options);
  }

  /**
   * List item with API parameters
   */
  async listItemForAPI(sellerId: string, itemId: string, quantity: number, price: number, duration?: number, metadata?: any): Promise<MarketListing> {
    const item: ItemStack = { itemId, quantity, metadata };
    const listingId = await this.listItem(sellerId, item, price, duration);
    
    // Return the created listing
    const listing = await this.itemRepository.getMarketListing(listingId);
    if (!listing) {
      throw new Error('Failed to retrieve created listing');
    }
    return listing;
  }

  /**
   * Cancel listing with result object (API method)
   */
  async cancelListingForAPI(playerId: string, listingId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const result = await this.cancelListing(playerId, listingId);
      return { success: result };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to cancel listing' 
      };
    }
  }

  /**
   * Get price history for API
   */
  async getPriceHistory(itemId: string, days: number): Promise<any> {
    const priceHistory = await this.getMarketPrices(itemId);
    return {
      itemId,
      priceHistory: priceHistory.pricePoints.slice(0, days),
      trend: priceHistory.trend,
      averagePrice: priceHistory.averagePrice,
      currentPrice: priceHistory.averagePrice // Use averagePrice as currentPrice since currentPrice doesn't exist
    };
  }

  /**
   * Get market trends for API
   */
  async getMarketTrends(): Promise<any> {
    const stats = await this.getMarketStatistics();
    return {
      totalListings: stats.totalListings,
      activeListings: stats.activeListings,
      topCategories: stats.topCategories,
      marketActivity: 'normal' // Mock data
    };
  }
}

// Mock repositories for testing
class MockItemRepository {
  private listings: Map<string, MarketListing> = new Map();
  private items: Map<string, any> = new Map();

  async findById(id: string): Promise<any> {
    return this.items.get(id) || { id, category: 'MISC', name: 'Mock Item' };
  }

  async createMarketListing(listingData: any): Promise<MarketListing> {
    const id = Math.random().toString(36).substr(2, 9);
    const listing: MarketListing = { ...listingData, id };
    this.listings.set(id, listing);
    return listing;
  }

  async getMarketListing(id: string): Promise<MarketListing | null> {
    return this.listings.get(id) || null;
  }

  async updateMarketListing(id: string, updates: any): Promise<MarketListing | null> {
    const listing = this.listings.get(id);
    if (listing) {
      Object.assign(listing, updates);
      return listing;
    }
    return null;
  }

  async searchMarketListings(options: MarketSearchOptions): Promise<MarketListing[]> {
    let results = Array.from(this.listings.values());
    
    if (options.itemId) {
      results = results.filter(l => l.item.itemId === options.itemId);
    }
    if (options.minPrice) {
      results = results.filter(l => l.price >= options.minPrice!);
    }
    if (options.maxPrice) {
      results = results.filter(l => l.price <= options.maxPrice!);
    }
    
    return results.slice(options.offset || 0, (options.offset || 0) + (options.limit || 50));
  }

  async getPlayerListings(playerId: string, activeOnly: boolean): Promise<MarketListing[]> {
    return Array.from(this.listings.values()).filter(l => 
      l.sellerId === playerId && (!activeOnly || l.isActive)
    );
  }

  async getItemPriceHistory(itemId: string, days: number): Promise<PriceHistory> {
    return {
      itemId,
      pricePoints: [],
      averagePrice: 100,
      minPrice: 50,
      maxPrice: 150,
      totalVolume: 0,
      trend: PriceTrend.STABLE
    };
  }

  async expireListings(): Promise<number> {
    return 0;
  }

  async getMarketStatistics(): Promise<MarketStatistics> {
    return {
      totalListings: this.listings.size,
      activeListings: Array.from(this.listings.values()).filter(l => l.isActive).length,
      totalTransactions: 0,
      totalVolume: 0,
      averagePrice: 100,
      topCategories: []
    };
  }

  async executeTransaction<R>(callback: (client: any) => Promise<R>): Promise<R> {
    // Mock transaction execution
    return callback({
      query: async () => ({ rows: [] })
    });
  }
}

class MockPlayerRepository {
  private players: Map<string, any> = new Map();

  async findById(id: string): Promise<any> {
    return this.players.get(id) || {
      id,
      username: 'mockuser',
      inventory: [],
      currency: { coins: 1000 }
    };
  }

  async update(id: string, updates: any): Promise<any> {
    const player = await this.findById(id);
    const updated = { ...player, ...updates };
    this.players.set(id, updated);
    return updated;
  }
}