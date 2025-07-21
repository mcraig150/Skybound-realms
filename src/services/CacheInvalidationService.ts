import { cacheService } from './CacheService';
import { playerCacheService } from './PlayerCacheService';
import { marketCacheService } from './MarketCacheService';

export interface InvalidationEvent {
  type: 'player' | 'market' | 'world' | 'guild' | 'custom';
  entityId: string;
  action: 'create' | 'update' | 'delete';
  timestamp: Date;
  metadata?: Record<string, any>;
}

export interface InvalidationRule {
  eventType: string;
  cacheKeys: string[];
  cascadeRules?: string[];
  ttlOverride?: number;
}

export class CacheInvalidationService {
  private invalidationRules: Map<string, InvalidationRule[]> = new Map();
  private eventQueue: InvalidationEvent[] = [];
  private isProcessing: boolean = false;

  constructor() {
    this.setupDefaultRules();
  }

  private setupDefaultRules(): void {
    // Player-related invalidation rules
    this.addRule('player.update', {
      eventType: 'player.update',
      cacheKeys: ['player:*', 'player_stats:*', 'online:*'],
      cascadeRules: ['guild.member_update']
    });

    this.addRule('player.inventory_change', {
      eventType: 'player.inventory_change',
      cacheKeys: ['player_inventory:*'],
      cascadeRules: ['market.seller_update']
    });

    this.addRule('player.skill_update', {
      eventType: 'player.skill_update',
      cacheKeys: ['player_stats:*'],
      cascadeRules: ['leaderboard.skill_update']
    });

    // Market-related invalidation rules
    this.addRule('market.listing_created', {
      eventType: 'market.listing_created',
      cacheKeys: ['market_category:*', 'market_search:*'],
      cascadeRules: ['market.price_update']
    });

    this.addRule('market.listing_sold', {
      eventType: 'market.listing_sold',
      cacheKeys: ['market_listing:*', 'market_category:*', 'market_search:*'],
      cascadeRules: ['market.price_update', 'player.inventory_change']
    });

    this.addRule('market.price_update', {
      eventType: 'market.price_update',
      cacheKeys: ['market_price:*', 'market_trend:*']
    });

    // World-related invalidation rules
    this.addRule('world.island_update', {
      eventType: 'world.island_update',
      cacheKeys: ['island:*', 'world_chunk:*']
    });

    this.addRule('world.resource_depleted', {
      eventType: 'world.resource_depleted',
      cacheKeys: ['resource_node:*'],
      ttlOverride: 1800 // 30 minutes for resource respawn
    });

    // Guild-related invalidation rules
    this.addRule('guild.member_joined', {
      eventType: 'guild.member_joined',
      cacheKeys: ['guild:*', 'guild_members:*'],
      cascadeRules: ['player.guild_update']
    });
  }

  addRule(ruleId: string, rule: InvalidationRule): void {
    if (!this.invalidationRules.has(rule.eventType)) {
      this.invalidationRules.set(rule.eventType, []);
    }
    this.invalidationRules.get(rule.eventType)!.push(rule);
  }

  removeRule(ruleId: string, eventType: string): void {
    const rules = this.invalidationRules.get(eventType);
    if (rules) {
      const filteredRules = rules.filter(rule => rule.eventType !== ruleId);
      this.invalidationRules.set(eventType, filteredRules);
    }
  }

  async invalidate(event: InvalidationEvent): Promise<void> {
    this.eventQueue.push(event);
    
    if (!this.isProcessing) {
      await this.processQueue();
    }
  }

  private async processQueue(): Promise<void> {
    this.isProcessing = true;

    while (this.eventQueue.length > 0) {
      const event = this.eventQueue.shift()!;
      await this.processEvent(event);
    }

    this.isProcessing = false;
  }

  private async processEvent(event: InvalidationEvent): Promise<void> {
    const eventKey = `${event.type}.${event.action}`;
    const rules = this.invalidationRules.get(eventKey) || [];

    console.log(`Processing invalidation event: ${eventKey} for entity ${event.entityId}`);

    for (const rule of rules) {
      await this.applyRule(rule, event);
    }
  }

  private async applyRule(rule: InvalidationRule, event: InvalidationEvent): Promise<void> {
    // Apply cache key invalidations
    for (const keyPattern of rule.cacheKeys) {
      const actualKey = keyPattern.replace('*', event.entityId);
      
      if (keyPattern.includes('*')) {
        // Pattern-based deletion
        await cacheService.deletePattern(actualKey);
      } else {
        // Exact key deletion
        await cacheService.delete(actualKey);
      }
    }

    // Process cascade rules
    if (rule.cascadeRules) {
      for (const cascadeRule of rule.cascadeRules) {
        const cascadeEvent: InvalidationEvent = {
          type: event.type,
          entityId: event.entityId,
          action: 'update',
          timestamp: new Date(),
          metadata: { ...event.metadata, cascadeFrom: rule.eventType }
        };

        // Add to queue for processing
        this.eventQueue.push(cascadeEvent);
      }
    }
  }

  // Specific invalidation methods for different entities
  async invalidatePlayer(playerId: string, action: 'create' | 'update' | 'delete' = 'update'): Promise<void> {
    await this.invalidate({
      type: 'player',
      entityId: playerId,
      action,
      timestamp: new Date()
    });
  }

  async invalidateMarketListing(listingId: string, itemId: string, action: 'create' | 'update' | 'delete' = 'update'): Promise<void> {
    await this.invalidate({
      type: 'market',
      entityId: listingId,
      action,
      timestamp: new Date(),
      metadata: { itemId }
    });
  }

  async invalidateMarketPrice(itemId: string): Promise<void> {
    await this.invalidate({
      type: 'market',
      entityId: itemId,
      action: 'update',
      timestamp: new Date(),
      metadata: { priceUpdate: true }
    });
  }

  async invalidateIsland(islandId: string, action: 'create' | 'update' | 'delete' = 'update'): Promise<void> {
    await this.invalidate({
      type: 'world',
      entityId: islandId,
      action,
      timestamp: new Date()
    });
  }

  // Batch invalidation methods
  async invalidateMultiplePlayers(playerIds: string[]): Promise<void> {
    const promises = playerIds.map(playerId => this.invalidatePlayer(playerId));
    await Promise.all(promises);
  }

  async invalidateMultipleMarketItems(itemIds: string[]): Promise<void> {
    const promises = itemIds.map(itemId => this.invalidateMarketPrice(itemId));
    await Promise.all(promises);
  }

  // Cache warming methods
  async warmUpPlayerCache(playerIds: string[]): Promise<void> {
    console.log(`Warming up player cache for ${playerIds.length} players`);
    
    // This would typically pre-load frequently accessed player data
    for (const playerId of playerIds) {
      // In a real implementation, this would fetch from database and cache
      console.log(`Pre-loading cache for player ${playerId}`);
    }
  }

  async warmUpMarketCache(popularItemIds: string[]): Promise<void> {
    await marketCacheService.warmUpCache(popularItemIds);
  }

  // Cache health and monitoring
  async getCacheHealth(): Promise<{
    isHealthy: boolean;
    stats: any;
    queueSize: number;
    isProcessing: boolean;
  }> {
    return {
      isHealthy: cacheService.isHealthy(),
      stats: cacheService.getStats(),
      queueSize: this.eventQueue.length,
      isProcessing: this.isProcessing
    };
  }

  async flushInvalidationQueue(): Promise<void> {
    this.eventQueue = [];
    this.isProcessing = false;
  }

  // Time-based invalidation
  async scheduleInvalidation(event: InvalidationEvent, delayMs: number): Promise<void> {
    setTimeout(async () => {
      await this.invalidate(event);
    }, delayMs);
  }

  // Pattern-based cache clearing for maintenance
  async clearCacheByPattern(pattern: string): Promise<number> {
    return await cacheService.deletePattern(pattern);
  }

  async clearExpiredCache(): Promise<void> {
    // Redis handles TTL automatically, but we can implement custom logic here
    console.log('Checking for expired cache entries...');
    
    // Custom cleanup logic could go here
    // For example, cleaning up orphaned cache entries
  }
}

export const cacheInvalidationService = new CacheInvalidationService();