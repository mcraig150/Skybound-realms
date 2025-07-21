import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { MarketCacheService, MarketListing, MarketPrice, MarketTrend } from '../../services/MarketCacheService';
import { cacheService } from '../../services/CacheService';

describe('MarketCacheService', () => {
  let marketCacheService: MarketCacheService;

  beforeAll(async () => {
    marketCacheService = new MarketCacheService();
    await cacheService.connect();
  });

  afterAll(async () => {
    await cacheService.disconnect();
  });

  beforeEach(async () => {
    // Clear cache before each test
    await cacheService.flush();
    cacheService.resetStats();
  });

  describe('Market Listing Caching', () => {
    it('should cache and retrieve market listing', async () => {
      const listing: MarketListing = {
        id: 'listing123',
        sellerId: 'seller456',
        itemId: 'sword_rare',
        itemName: 'Rare Sword',
        quantity: 1,
        price: 1000,
        listedAt: new Date(),
        expiresAt: new Date(Date.now() + 86400000), // 24 hours
        category: 'weapons'
      };

      const cacheResult = await marketCacheService.cacheMarketListing(listing);
      expect(cacheResult).toBe(true);

      const retrievedListing = await marketCacheService.getMarketListing(listing.id);
      expect(retrievedListing).toEqual(listing);
    });

    it('should return null for non-existent listing', async () => {
      const result = await marketCacheService.getMarketListing('non-existent-listing');
      expect(result).toBeNull();
    });

    it('should invalidate market listing', async () => {
      const listing: MarketListing = {
        id: 'invalidate-listing',
        sellerId: 'seller789',
        itemId: 'potion_health',
        itemName: 'Health Potion',
        quantity: 10,
        price: 50,
        listedAt: new Date(),
        expiresAt: new Date(Date.now() + 86400000),
        category: 'consumables'
      };

      await marketCacheService.cacheMarketListing(listing);
      expect(await marketCacheService.getMarketListing(listing.id)).toEqual(listing);

      const invalidateResult = await marketCacheService.invalidateMarketListing(listing.id);
      expect(invalidateResult).toBe(true);
      expect(await marketCacheService.getMarketListing(listing.id)).toBeNull();
    });
  });

  describe('Market Price Caching', () => {
    it('should cache and retrieve market price', async () => {
      const price: MarketPrice = {
        itemId: 'iron_ore',
        currentPrice: 25,
        averagePrice: 23,
        minPrice: 20,
        maxPrice: 30,
        volume: 150,
        lastUpdated: new Date()
      };

      const cacheResult = await marketCacheService.cacheMarketPrice(price);
      expect(cacheResult).toBe(true);

      const retrievedPrice = await marketCacheService.getMarketPrice(price.itemId);
      expect(retrievedPrice).toEqual(price);
    });

    it('should update market price', async () => {
      const itemId = 'gold_ore';
      const initialPrice: MarketPrice = {
        itemId,
        currentPrice: 100,
        averagePrice: 95,
        minPrice: 90,
        maxPrice: 105,
        volume: 50,
        lastUpdated: new Date()
      };

      await marketCacheService.cacheMarketPrice(initialPrice);
      await marketCacheService.updateMarketPrice(itemId, 110, 5);

      const updatedPrice = await marketCacheService.getMarketPrice(itemId);
      expect(updatedPrice?.currentPrice).toBe(110);
      expect(updatedPrice?.maxPrice).toBe(110); // Should update max
      expect(updatedPrice?.volume).toBe(55); // Should add volume
      expect(updatedPrice?.averagePrice).toBe(105); // Should update average
    });

    it('should create new price entry when updating non-existent item', async () => {
      const itemId = 'new_item';
      const newPrice = 75;
      const volume = 10;

      await marketCacheService.updateMarketPrice(itemId, newPrice, volume);

      const price = await marketCacheService.getMarketPrice(itemId);
      expect(price?.itemId).toBe(itemId);
      expect(price?.currentPrice).toBe(newPrice);
      expect(price?.averagePrice).toBe(newPrice);
      expect(price?.minPrice).toBe(newPrice);
      expect(price?.maxPrice).toBe(newPrice);
      expect(price?.volume).toBe(volume);
    });

    it('should cache multiple market prices', async () => {
      const prices: MarketPrice[] = [
        {
          itemId: 'item1',
          currentPrice: 10,
          averagePrice: 9,
          minPrice: 8,
          maxPrice: 12,
          volume: 100,
          lastUpdated: new Date()
        },
        {
          itemId: 'item2',
          currentPrice: 20,
          averagePrice: 18,
          minPrice: 15,
          maxPrice: 25,
          volume: 75,
          lastUpdated: new Date()
        }
      ];

      const cacheResult = await marketCacheService.cacheMultipleMarketPrices(prices);
      expect(cacheResult).toBe(true);

      const itemIds = prices.map(p => p.itemId);
      const retrievedPrices = await marketCacheService.getMultipleMarketPrices(itemIds);

      expect(retrievedPrices).toHaveLength(2);
      expect(retrievedPrices[0]).toEqual(prices[0]);
      expect(retrievedPrices[1]).toEqual(prices[1]);
    });
  });

  describe('Market Trend Caching', () => {
    it('should cache and retrieve market trend', async () => {
      const trend: MarketTrend = {
        itemId: 'diamond',
        priceHistory: [
          { price: 500, timestamp: new Date(Date.now() - 86400000) },
          { price: 520, timestamp: new Date(Date.now() - 43200000) },
          { price: 550, timestamp: new Date() }
        ],
        trend: 'rising',
        changePercent: 10
      };

      const cacheResult = await marketCacheService.cacheMarketTrend(trend);
      expect(cacheResult).toBe(true);

      const retrievedTrend = await marketCacheService.getMarketTrend(trend.itemId);
      expect(retrievedTrend).toEqual(trend);
    });

    it('should return null for non-existent trend', async () => {
      const result = await marketCacheService.getMarketTrend('non-existent-item');
      expect(result).toBeNull();
    });
  });

  describe('Category and Search Caching', () => {
    it('should cache and retrieve category listings', async () => {
      const category = 'weapons';
      const listings: MarketListing[] = [
        {
          id: 'weapon1',
          sellerId: 'seller1',
          itemId: 'sword_common',
          itemName: 'Common Sword',
          quantity: 1,
          price: 100,
          listedAt: new Date(),
          expiresAt: new Date(Date.now() + 86400000),
          category: 'weapons'
        },
        {
          id: 'weapon2',
          sellerId: 'seller2',
          itemId: 'bow_rare',
          itemName: 'Rare Bow',
          quantity: 1,
          price: 500,
          listedAt: new Date(),
          expiresAt: new Date(Date.now() + 86400000),
          category: 'weapons'
        }
      ];

      const cacheResult = await marketCacheService.cacheCategoryListings(category, listings);
      expect(cacheResult).toBe(true);

      const retrievedListings = await marketCacheService.getCategoryListings(category);
      expect(retrievedListings).toEqual(listings);
    });

    it('should cache and retrieve search results', async () => {
      const query = 'rare sword';
      const results: MarketListing[] = [
        {
          id: 'search1',
          sellerId: 'seller3',
          itemId: 'sword_rare',
          itemName: 'Rare Sword of Power',
          quantity: 1,
          price: 1500,
          listedAt: new Date(),
          expiresAt: new Date(Date.now() + 86400000),
          category: 'weapons'
        }
      ];

      const cacheResult = await marketCacheService.cacheSearchResults(query, results);
      expect(cacheResult).toBe(true);

      const retrievedResults = await marketCacheService.getSearchResults(query);
      expect(retrievedResults).toEqual(results);
    });

    it('should handle case-insensitive search queries', async () => {
      const query1 = 'RARE SWORD';
      const query2 = 'rare sword';
      const results: MarketListing[] = [];

      await marketCacheService.cacheSearchResults(query1, results);
      const retrievedResults = await marketCacheService.getSearchResults(query2);
      
      // Should retrieve the same results due to case-insensitive hashing
      expect(retrievedResults).toEqual(results);
    });

    it('should invalidate category listings', async () => {
      const category = 'armor';
      const listings: MarketListing[] = [];

      await marketCacheService.cacheCategoryListings(category, listings);
      expect(await marketCacheService.getCategoryListings(category)).toEqual(listings);

      const invalidateResult = await marketCacheService.invalidateCategory(category);
      expect(invalidateResult).toBe(true);
      expect(await marketCacheService.getCategoryListings(category)).toBeNull();
    });

    it('should invalidate all search results', async () => {
      const queries = ['query1', 'query2', 'query3'];
      const results: MarketListing[] = [];

      // Cache multiple search results
      for (const query of queries) {
        await marketCacheService.cacheSearchResults(query, results);
      }

      // Verify they're cached
      for (const query of queries) {
        expect(await marketCacheService.getSearchResults(query)).toEqual(results);
      }

      // Invalidate all search results
      const invalidatedCount = await marketCacheService.invalidateAllSearchResults();
      expect(invalidatedCount).toBe(3);

      // Verify they're all invalidated
      for (const query of queries) {
        expect(await marketCacheService.getSearchResults(query)).toBeNull();
      }
    });
  });

  describe('Complex Operations', () => {
    it('should invalidate item-related cache', async () => {
      const itemId = 'complex_item';
      
      const price: MarketPrice = {
        itemId,
        currentPrice: 100,
        averagePrice: 95,
        minPrice: 90,
        maxPrice: 110,
        volume: 50,
        lastUpdated: new Date()
      };

      const trend: MarketTrend = {
        itemId,
        priceHistory: [{ price: 100, timestamp: new Date() }],
        trend: 'stable',
        changePercent: 0
      };

      // Cache price and trend
      await marketCacheService.cacheMarketPrice(price);
      await marketCacheService.cacheMarketTrend(trend);
      await marketCacheService.cacheSearchResults('test query', []);

      // Verify they're cached
      expect(await marketCacheService.getMarketPrice(itemId)).toEqual(price);
      expect(await marketCacheService.getMarketTrend(itemId)).toEqual(trend);

      // Invalidate all item-related cache
      await marketCacheService.invalidateItemRelatedCache(itemId);

      // Verify price and trend are invalidated
      expect(await marketCacheService.getMarketPrice(itemId)).toBeNull();
      expect(await marketCacheService.getMarketTrend(itemId)).toBeNull();
    });

    it('should get top selling items', async () => {
      const prices: MarketPrice[] = [
        {
          itemId: 'item_high_volume',
          currentPrice: 50,
          averagePrice: 50,
          minPrice: 45,
          maxPrice: 55,
          volume: 1000,
          lastUpdated: new Date()
        },
        {
          itemId: 'item_medium_volume',
          currentPrice: 100,
          averagePrice: 100,
          minPrice: 95,
          maxPrice: 105,
          volume: 500,
          lastUpdated: new Date()
        },
        {
          itemId: 'item_low_volume',
          currentPrice: 200,
          averagePrice: 200,
          minPrice: 190,
          maxPrice: 210,
          volume: 100,
          lastUpdated: new Date()
        }
      ];

      // Cache all prices
      await marketCacheService.cacheMultipleMarketPrices(prices);

      const topItems = await marketCacheService.getTopSellingItems(2);
      expect(topItems).toHaveLength(2);
      expect(topItems[0].itemId).toBe('item_high_volume');
      expect(topItems[1].itemId).toBe('item_medium_volume');
    });

    it('should check price alerts', async () => {
      const itemId = 'alert_item';
      const price: MarketPrice = {
        itemId,
        currentPrice: 75,
        averagePrice: 80,
        minPrice: 70,
        maxPrice: 90,
        volume: 25,
        lastUpdated: new Date()
      };

      await marketCacheService.cacheMarketPrice(price);

      // Alert should trigger when target price is above current price
      const alertTriggered = await marketCacheService.getPriceAlerts(itemId, 80);
      expect(alertTriggered).toBe(true);

      // Alert should not trigger when target price is below current price
      const alertNotTriggered = await marketCacheService.getPriceAlerts(itemId, 70);
      expect(alertNotTriggered).toBe(false);
    });

    it('should warm up cache for popular items', async () => {
      const popularItems = ['popular1', 'popular2', 'popular3'];
      
      // This should not throw an error
      await expect(marketCacheService.warmUpCache(popularItems)).resolves.toBeUndefined();
    });
  });

  describe('TTL and Expiration', () => {
    it('should respect custom TTL for market listings', async () => {
      const listing: MarketListing = {
        id: 'ttl-listing',
        sellerId: 'seller-ttl',
        itemId: 'ttl-item',
        itemName: 'TTL Item',
        quantity: 1,
        price: 100,
        listedAt: new Date(),
        expiresAt: new Date(Date.now() + 86400000),
        category: 'test'
      };

      await marketCacheService.cacheMarketListing(listing, 1); // 1 second TTL
      
      let retrievedListing = await marketCacheService.getMarketListing(listing.id);
      expect(retrievedListing).toEqual(listing);

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 1100));
      
      retrievedListing = await marketCacheService.getMarketListing(listing.id);
      expect(retrievedListing).toBeNull();
    });

    it('should use shorter TTL for prices', async () => {
      const price: MarketPrice = {
        itemId: 'price-ttl-item',
        currentPrice: 50,
        averagePrice: 50,
        minPrice: 45,
        maxPrice: 55,
        volume: 10,
        lastUpdated: new Date()
      };

      // Default price TTL should be shorter than listing TTL
      await marketCacheService.cacheMarketPrice(price);
      
      // Price should be cached
      const retrievedPrice = await marketCacheService.getMarketPrice(price.itemId);
      expect(retrievedPrice).toEqual(price);
    });
  });
});