import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { CacheInvalidationService, InvalidationEvent } from '../../services/CacheInvalidationService';
import { cacheService } from '../../services/CacheService';

describe('CacheInvalidationService', () => {
  let invalidationService: CacheInvalidationService;

  beforeAll(async () => {
    invalidationService = new CacheInvalidationService();
    await cacheService.connect();
  });

  afterAll(async () => {
    await cacheService.disconnect();
  });

  beforeEach(async () => {
    // Clear cache before each test
    await cacheService.flush();
    cacheService.resetStats();
    await invalidationService.flushInvalidationQueue();
  });

  describe('Rule Management', () => {
    it('should add and apply custom invalidation rules', async () => {
      const customRule = {
        eventType: 'custom.test',
        cacheKeys: ['test:*'],
        cascadeRules: []
      };

      invalidationService.addRule('custom-test-rule', customRule);

      // Set up test data
      await cacheService.set('test:item1', 'value1');
      await cacheService.set('test:item2', 'value2');
      await cacheService.set('other:item', 'other-value');

      // Verify data is cached
      expect(await cacheService.get('test:item1')).toBe('value1');
      expect(await cacheService.get('test:item2')).toBe('value2');
      expect(await cacheService.get('other:item')).toBe('other-value');

      // Trigger invalidation
      const event: InvalidationEvent = {
        type: 'custom',
        entityId: 'test-entity',
        action: 'test',
        timestamp: new Date()
      };

      await invalidationService.invalidate(event);

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify test keys are invalidated but other keys remain
      expect(await cacheService.get('test:item1')).toBeNull();
      expect(await cacheService.get('test:item2')).toBeNull();
      expect(await cacheService.get('other:item')).toBe('other-value');
    });

    it('should remove invalidation rules', async () => {
      const ruleId = 'removable-rule';
      const eventType = 'removable.test';
      const rule = {
        eventType,
        cacheKeys: ['removable:*'],
        cascadeRules: []
      };

      invalidationService.addRule(ruleId, rule);
      invalidationService.removeRule(ruleId, eventType);

      // Set up test data
      await cacheService.set('removable:item', 'value');

      // Trigger event that should have been handled by removed rule
      const event: InvalidationEvent = {
        type: 'removable',
        entityId: 'test',
        action: 'test',
        timestamp: new Date()
      };

      await invalidationService.invalidate(event);
      await new Promise(resolve => setTimeout(resolve, 100));

      // Data should still exist since rule was removed
      expect(await cacheService.get('removable:item')).toBe('value');
    });
  });

  describe('Player Invalidation', () => {
    it('should invalidate player cache', async () => {
      const playerId = 'player123';

      // Set up player-related cache data
      await cacheService.set(`player:${playerId}`, { id: playerId, name: 'TestPlayer' });
      await cacheService.set(`player_stats:${playerId}`, { level: 10, exp: 1000 });
      await cacheService.set(`online:${playerId}`, true);

      // Verify data is cached
      expect(await cacheService.get(`player:${playerId}`)).toBeTruthy();
      expect(await cacheService.get(`player_stats:${playerId}`)).toBeTruthy();
      expect(await cacheService.get(`online:${playerId}`)).toBeTruthy();

      // Invalidate player
      await invalidationService.invalidatePlayer(playerId);
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify player data is invalidated
      expect(await cacheService.get(`player:${playerId}`)).toBeNull();
      expect(await cacheService.get(`player_stats:${playerId}`)).toBeNull();
      expect(await cacheService.get(`online:${playerId}`)).toBeNull();
    });

    it('should handle batch player invalidation', async () => {
      const playerIds = ['player1', 'player2', 'player3'];

      // Set up cache data for multiple players
      for (const playerId of playerIds) {
        await cacheService.set(`player:${playerId}`, { id: playerId });
        await cacheService.set(`player_stats:${playerId}`, { level: 5 });
      }

      // Verify data is cached
      for (const playerId of playerIds) {
        expect(await cacheService.get(`player:${playerId}`)).toBeTruthy();
        expect(await cacheService.get(`player_stats:${playerId}`)).toBeTruthy();
      }

      // Batch invalidate
      await invalidationService.invalidateMultiplePlayers(playerIds);
      await new Promise(resolve => setTimeout(resolve, 200));

      // Verify all player data is invalidated
      for (const playerId of playerIds) {
        expect(await cacheService.get(`player:${playerId}`)).toBeNull();
        expect(await cacheService.get(`player_stats:${playerId}`)).toBeNull();
      }
    });
  });

  describe('Market Invalidation', () => {
    it('should invalidate market listing', async () => {
      const listingId = 'listing123';
      const itemId = 'sword_rare';

      // Set up market-related cache data
      await cacheService.set(`market_listing:${listingId}`, { id: listingId, itemId });
      await cacheService.set(`market_category:weapons`, [{ id: listingId }]);
      await cacheService.set(`market_search:sword`, [{ id: listingId }]);

      // Verify data is cached
      expect(await cacheService.get(`market_listing:${listingId}`)).toBeTruthy();
      expect(await cacheService.get(`market_category:weapons`)).toBeTruthy();

      // Invalidate market listing
      await invalidationService.invalidateMarketListing(listingId, itemId);
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify market data is invalidated
      expect(await cacheService.get(`market_listing:${listingId}`)).toBeNull();
      expect(await cacheService.get(`market_category:weapons`)).toBeNull();
    });

    it('should invalidate market price', async () => {
      const itemId = 'gold_ore';

      // Set up price-related cache data
      await cacheService.set(`market_price:${itemId}`, { itemId, price: 100 });
      await cacheService.set(`market_trend:${itemId}`, { itemId, trend: 'rising' });

      // Verify data is cached
      expect(await cacheService.get(`market_price:${itemId}`)).toBeTruthy();
      expect(await cacheService.get(`market_trend:${itemId}`)).toBeTruthy();

      // Invalidate market price
      await invalidationService.invalidateMarketPrice(itemId);
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify price data is invalidated
      expect(await cacheService.get(`market_price:${itemId}`)).toBeNull();
      expect(await cacheService.get(`market_trend:${itemId}`)).toBeNull();
    });

    it('should handle batch market item invalidation', async () => {
      const itemIds = ['item1', 'item2', 'item3'];

      // Set up cache data for multiple items
      for (const itemId of itemIds) {
        await cacheService.set(`market_price:${itemId}`, { itemId, price: 50 });
        await cacheService.set(`market_trend:${itemId}`, { itemId, trend: 'stable' });
      }

      // Verify data is cached
      for (const itemId of itemIds) {
        expect(await cacheService.get(`market_price:${itemId}`)).toBeTruthy();
        expect(await cacheService.get(`market_trend:${itemId}`)).toBeTruthy();
      }

      // Batch invalidate
      await invalidationService.invalidateMultipleMarketItems(itemIds);
      await new Promise(resolve => setTimeout(resolve, 200));

      // Verify all item data is invalidated
      for (const itemId of itemIds) {
        expect(await cacheService.get(`market_price:${itemId}`)).toBeNull();
        expect(await cacheService.get(`market_trend:${itemId}`)).toBeNull();
      }
    });
  });

  describe('Island Invalidation', () => {
    it('should invalidate island cache', async () => {
      const islandId = 'island456';

      // Set up island-related cache data
      await cacheService.set(`island:${islandId}`, { id: islandId, owner: 'player123' });
      await cacheService.set(`world_chunk:${islandId}:0:0`, { chunkData: 'test' });

      // Verify data is cached
      expect(await cacheService.get(`island:${islandId}`)).toBeTruthy();
      expect(await cacheService.get(`world_chunk:${islandId}:0:0`)).toBeTruthy();

      // Invalidate island
      await invalidationService.invalidateIsland(islandId);
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify island data is invalidated
      expect(await cacheService.get(`island:${islandId}`)).toBeNull();
      expect(await cacheService.get(`world_chunk:${islandId}:0:0`)).toBeNull();
    });
  });

  describe('Cascade Rules', () => {
    it('should process cascade invalidation rules', async () => {
      // Set up test data that should be affected by cascade rules
      const playerId = 'cascade-player';
      
      await cacheService.set(`player:${playerId}`, { id: playerId });
      await cacheService.set(`player_stats:${playerId}`, { level: 15 });
      await cacheService.set(`guild:guild123`, { members: [playerId] });

      // Verify initial data
      expect(await cacheService.get(`player:${playerId}`)).toBeTruthy();
      expect(await cacheService.get(`player_stats:${playerId}`)).toBeTruthy();
      expect(await cacheService.get(`guild:guild123`)).toBeTruthy();

      // Trigger player update which should cascade to guild
      await invalidationService.invalidatePlayer(playerId, 'update');
      await new Promise(resolve => setTimeout(resolve, 200));

      // Player data should be invalidated
      expect(await cacheService.get(`player:${playerId}`)).toBeNull();
      expect(await cacheService.get(`player_stats:${playerId}`)).toBeNull();
    });
  });

  describe('Scheduled Invalidation', () => {
    it('should schedule invalidation for future execution', async () => {
      const key = 'scheduled-key';
      const value = 'scheduled-value';

      await cacheService.set(key, value);
      expect(await cacheService.get(key)).toBe(value);

      // Schedule invalidation for 100ms in the future
      const event: InvalidationEvent = {
        type: 'custom',
        entityId: 'scheduled-entity',
        action: 'delete',
        timestamp: new Date()
      };

      // Add a custom rule for this test
      invalidationService.addRule('scheduled-test', {
        eventType: 'custom.delete',
        cacheKeys: ['scheduled-key'],
        cascadeRules: []
      });

      await invalidationService.scheduleInvalidation(event, 100);

      // Data should still exist immediately
      expect(await cacheService.get(key)).toBe(value);

      // Wait for scheduled invalidation
      await new Promise(resolve => setTimeout(resolve, 150));

      // Data should now be invalidated
      expect(await cacheService.get(key)).toBeNull();
    });
  });

  describe('Cache Health and Monitoring', () => {
    it('should provide cache health information', async () => {
      const health = await invalidationService.getCacheHealth();

      expect(health).toHaveProperty('isHealthy');
      expect(health).toHaveProperty('stats');
      expect(health).toHaveProperty('queueSize');
      expect(health).toHaveProperty('isProcessing');

      expect(typeof health.isHealthy).toBe('boolean');
      expect(typeof health.queueSize).toBe('number');
      expect(typeof health.isProcessing).toBe('boolean');
    });

    it('should track invalidation queue size', async () => {
      const initialHealth = await invalidationService.getCacheHealth();
      const initialQueueSize = initialHealth.queueSize;

      // Add events to queue without processing
      const events: InvalidationEvent[] = [
        { type: 'player', entityId: 'p1', action: 'update', timestamp: new Date() },
        { type: 'player', entityId: 'p2', action: 'update', timestamp: new Date() },
        { type: 'market', entityId: 'm1', action: 'update', timestamp: new Date() }
      ];

      // Queue events rapidly
      const promises = events.map(event => invalidationService.invalidate(event));
      
      // Check queue size before processing completes
      const healthDuringProcessing = await invalidationService.getCacheHealth();
      
      await Promise.all(promises);
      await new Promise(resolve => setTimeout(resolve, 100));

      const finalHealth = await invalidationService.getCacheHealth();
      expect(finalHealth.queueSize).toBe(0); // Queue should be empty after processing
    });
  });

  describe('Pattern-based Cache Clearing', () => {
    it('should clear cache by pattern', async () => {
      // Set up test data with different patterns
      await cacheService.set('user:1:profile', 'profile1');
      await cacheService.set('user:1:settings', 'settings1');
      await cacheService.set('user:2:profile', 'profile2');
      await cacheService.set('product:1', 'product1');

      // Verify data is cached
      expect(await cacheService.get('user:1:profile')).toBe('profile1');
      expect(await cacheService.get('user:1:settings')).toBe('settings1');
      expect(await cacheService.get('user:2:profile')).toBe('profile2');
      expect(await cacheService.get('product:1')).toBe('product1');

      // Clear user-related cache
      const clearedCount = await invalidationService.clearCacheByPattern('user:*');
      expect(clearedCount).toBe(3);

      // Verify user data is cleared but product data remains
      expect(await cacheService.get('user:1:profile')).toBeNull();
      expect(await cacheService.get('user:1:settings')).toBeNull();
      expect(await cacheService.get('user:2:profile')).toBeNull();
      expect(await cacheService.get('product:1')).toBe('product1');
    });
  });

  describe('Cache Warming', () => {
    it('should warm up player cache', async () => {
      const playerIds = ['warm1', 'warm2', 'warm3'];
      
      // This should not throw an error
      await expect(invalidationService.warmUpPlayerCache(playerIds)).resolves.toBeUndefined();
    });

    it('should warm up market cache', async () => {
      const itemIds = ['popular_item1', 'popular_item2'];
      
      // This should not throw an error
      await expect(invalidationService.warmUpMarketCache(itemIds)).resolves.toBeUndefined();
    });
  });

  describe('Queue Management', () => {
    it('should flush invalidation queue', async () => {
      // Add some events to the queue
      const events: InvalidationEvent[] = [
        { type: 'player', entityId: 'p1', action: 'update', timestamp: new Date() },
        { type: 'market', entityId: 'm1', action: 'update', timestamp: new Date() }
      ];

      // Queue events
      for (const event of events) {
        await invalidationService.invalidate(event);
      }

      // Flush queue
      await invalidationService.flushInvalidationQueue();

      const health = await invalidationService.getCacheHealth();
      expect(health.queueSize).toBe(0);
      expect(health.isProcessing).toBe(false);
    });

    it('should handle expired cache cleanup', async () => {
      // This should not throw an error
      await expect(invalidationService.clearExpiredCache()).resolves.toBeUndefined();
    });
  });
});