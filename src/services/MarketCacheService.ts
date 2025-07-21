import { cacheService, CacheOptions } from './CacheService';

export interface MarketListing {
  id: string;
  sellerId: string;
  itemId: string;
  itemName: string;
  quantity: number;
  price: number;
  listedAt: Date;
  expiresAt: Date;
  category: string;
}

export interface MarketPrice {
  itemId: string;
  currentPrice: number;
  averagePrice: number;
  minPrice: number;
  maxPrice: number;
  volume: number;
  lastUpdated: Date;
}

export interface MarketTrend {
  itemId: string;
  priceHistory: Array<{ price: number; timestamp: Date }>;
  trend: 'rising' | 'falling' | 'stable';
  changePercent: number;
}

export class MarketCacheService {
  private readonly LISTING_PREFIX = 'market_listing';
  private readonly PRICE_PREFIX = 'market_price';
  private readonly TREND_PREFIX = 'market_trend';
  private readonly CATEGORY_PREFIX = 'market_category';
  private readonly SEARCH_PREFIX = 'market_search';
  private readonly DEFAULT_TTL = 1800; // 30 minutes
  private readonly PRICE_TTL = 300; // 5 minutes for prices
  private readonly SEARCH_TTL = 60; // 1 minute for search results

  async cacheMarketListing(listing: MarketListing, ttl: number = this.DEFAULT_TTL): Promise<boolean> {
    const key = `${this.LISTING_PREFIX}:${listing.id}`;
    return await cacheService.set(key, listing, { ttl });
  }

  async getMarketListing(listingId: string): Promise<MarketListing | null> {
    const key = `${this.LISTING_PREFIX}:${listingId}`;
    return await cacheService.get<MarketListing>(key);
  }

  async cacheMarketPrice(price: MarketPrice, ttl: number = this.PRICE_TTL): Promise<boolean> {
    const key = `${this.PRICE_PREFIX}:${price.itemId}`;
    return await cacheService.set(key, price, { ttl });
  }

  async getMarketPrice(itemId: string): Promise<MarketPrice | null> {
    const key = `${this.PRICE_PREFIX}:${itemId}`;
    return await cacheService.get<MarketPrice>(key);
  }

  async cacheMarketTrend(trend: MarketTrend, ttl: number = this.DEFAULT_TTL): Promise<boolean> {
    const key = `${this.TREND_PREFIX}:${trend.itemId}`;
    return await cacheService.set(key, trend, { ttl });
  }

  async getMarketTrend(itemId: string): Promise<MarketTrend | null> {
    const key = `${this.TREND_PREFIX}:${itemId}`;
    return await cacheService.get<MarketTrend>(key);
  }

  async cacheCategoryListings(category: string, listings: MarketListing[], ttl: number = this.DEFAULT_TTL): Promise<boolean> {
    const key = `${this.CATEGORY_PREFIX}:${category}`;
    return await cacheService.set(key, listings, { ttl });
  }

  async getCategoryListings(category: string): Promise<MarketListing[] | null> {
    const key = `${this.CATEGORY_PREFIX}:${category}`;
    return await cacheService.get<MarketListing[]>(key);
  }

  async cacheSearchResults(query: string, results: MarketListing[], ttl: number = this.SEARCH_TTL): Promise<boolean> {
    const key = `${this.SEARCH_PREFIX}:${this.hashQuery(query)}`;
    return await cacheService.set(key, results, { ttl });
  }

  async getSearchResults(query: string): Promise<MarketListing[] | null> {
    const key = `${this.SEARCH_PREFIX}:${this.hashQuery(query)}`;
    return await cacheService.get<MarketListing[]>(key);
  }

  async cacheMultipleMarketPrices(prices: MarketPrice[], ttl: number = this.PRICE_TTL): Promise<boolean> {
    const keyValuePairs = prices.map(price => ({
      key: `${this.PRICE_PREFIX}:${price.itemId}`,
      value: price
    }));

    return await cacheService.setMultiple(keyValuePairs, { ttl });
  }

  async getMultipleMarketPrices(itemIds: string[]): Promise<(MarketPrice | null)[]> {
    const keys = itemIds.map(id => `${this.PRICE_PREFIX}:${id}`);
    return await cacheService.getMultiple<MarketPrice>(keys);
  }

  async invalidateMarketListing(listingId: string): Promise<boolean> {
    const key = `${this.LISTING_PREFIX}:${listingId}`;
    return await cacheService.delete(key);
  }

  async invalidateMarketPrice(itemId: string): Promise<boolean> {
    const key = `${this.PRICE_PREFIX}:${itemId}`;
    return await cacheService.delete(key);
  }

  async invalidateCategory(category: string): Promise<boolean> {
    const key = `${this.CATEGORY_PREFIX}:${category}`;
    return await cacheService.delete(key);
  }

  async invalidateAllSearchResults(): Promise<number> {
    const pattern = `${this.SEARCH_PREFIX}:*`;
    return await cacheService.deletePattern(pattern);
  }

  async invalidateItemRelatedCache(itemId: string): Promise<void> {
    // Invalidate price, trend, and search results for an item
    await Promise.all([
      this.invalidateMarketPrice(itemId),
      cacheService.delete(`${this.TREND_PREFIX}:${itemId}`),
      this.invalidateAllSearchResults() // Search results might contain this item
    ]);
  }

  async updateMarketPrice(itemId: string, newPrice: number, volume: number = 1): Promise<void> {
    const existingPrice = await this.getMarketPrice(itemId);
    
    if (existingPrice) {
      // Update existing price data
      const updatedPrice: MarketPrice = {
        ...existingPrice,
        currentPrice: newPrice,
        minPrice: Math.min(existingPrice.minPrice, newPrice),
        maxPrice: Math.max(existingPrice.maxPrice, newPrice),
        volume: existingPrice.volume + volume,
        lastUpdated: new Date()
      };
      
      // Recalculate average price (simple moving average)
      updatedPrice.averagePrice = (existingPrice.averagePrice + newPrice) / 2;
      
      await this.cacheMarketPrice(updatedPrice);
    } else {
      // Create new price entry
      const newPriceData: MarketPrice = {
        itemId,
        currentPrice: newPrice,
        averagePrice: newPrice,
        minPrice: newPrice,
        maxPrice: newPrice,
        volume,
        lastUpdated: new Date()
      };
      
      await this.cacheMarketPrice(newPriceData);
    }
  }

  async getTopSellingItems(limit: number = 10): Promise<MarketPrice[]> {
    try {
      const keys = await cacheService['client'].keys(`skybound:${this.PRICE_PREFIX}:*`);
      const prices = await cacheService.getMultiple<MarketPrice>(
        keys.map(key => key.replace('skybound:', ''))
      );
      
      return prices
        .filter((price): price is MarketPrice => price !== null)
        .sort((a, b) => b.volume - a.volume)
        .slice(0, limit);
    } catch (error) {
      console.error('Error getting top selling items:', error);
      return [];
    }
  }

  async getPriceAlerts(itemId: string, targetPrice: number): Promise<boolean> {
    const price = await this.getMarketPrice(itemId);
    return price ? price.currentPrice <= targetPrice : false;
  }

  private hashQuery(query: string): string {
    // Simple hash function for query caching
    return Buffer.from(query.toLowerCase().trim()).toString('base64');
  }

  async warmUpCache(popularItems: string[]): Promise<void> {
    // Pre-load popular items into cache
    console.log(`Warming up market cache for ${popularItems.length} items`);
    
    // This would typically fetch from database and cache the results
    // For now, we'll just ensure the cache keys exist
    const promises = popularItems.map(async (itemId) => {
      const exists = await cacheService.exists(`${this.PRICE_PREFIX}:${itemId}`);
      if (!exists) {
        // In a real implementation, this would fetch from database
        console.log(`Cache miss for item ${itemId} - would fetch from DB`);
      }
    });
    
    await Promise.all(promises);
  }
}

export const marketCacheService = new MarketCacheService();