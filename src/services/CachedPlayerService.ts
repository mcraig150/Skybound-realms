import { Player, SkillType } from '../models/Player';
import { PlayerService, PlayerRepository } from './PlayerService';
import { playerCacheService, PlayerStats } from './PlayerCacheService';
import { cacheInvalidationService } from './CacheInvalidationService';
import { ItemStack } from '../models/Item';

export class CachedPlayerService extends PlayerService {
  constructor(playerRepository?: PlayerRepository) {
    super(playerRepository);
  }

  /**
   * Get a player by ID with caching
   */
  override async getPlayer(playerId: string): Promise<Player | null> {
    // Try to get from cache first
    const cachedPlayer = await playerCacheService.getPlayer(playerId);
    if (cachedPlayer) {
      return cachedPlayer;
    }

    // If not in cache, get from database
    const player = await super.getPlayer(playerId);
    if (player) {
      // Cache the player data
      await playerCacheService.cachePlayer(player);
    }

    return player;
  }

  /**
   * Update player data with cache invalidation
   */
  override async updatePlayerFull(player: Player): Promise<void> {
    // Update in database
    await super.updatePlayerFull(player);

    // Update cache
    await playerCacheService.cachePlayer(player);

    // Update player stats cache
    const stats = this.extractPlayerStats(player);
    await playerCacheService.cachePlayerStats(stats);

    // Trigger cache invalidation for related data
    await cacheInvalidationService.invalidatePlayer(player.id, 'update');
  }

  /**
   * Add experience with caching
   */
  override async addExperience(playerId: string, skill: SkillType, amount: number): Promise<any> {
    // Get player (will use cache if available)
    const player = await this.getPlayer(playerId);
    if (!player) {
      throw new Error(`Player with ID ${playerId} not found`);
    }

    // Perform the experience addition
    const result = await super.addExperience(playerId, skill, amount);

    // Update cached player data
    const updatedPlayer = await super.getPlayer(playerId);
    if (updatedPlayer) {
      await playerCacheService.cachePlayer(updatedPlayer);
      
      // Update player stats cache
      const stats = this.extractPlayerStats(updatedPlayer);
      await playerCacheService.cachePlayerStats(stats);

      // If level changed, update specific skill level in cache
      if (result.leveledUp) {
        await playerCacheService.updatePlayerLevel(playerId, result.newLevel);
        await playerCacheService.updatePlayerSkill(playerId, skill, result.newLevel);
      }

      // Update experience in cache
      await playerCacheService.incrementPlayerExperience(playerId, amount);
    }

    // Trigger cache invalidation
    await cacheInvalidationService.invalidatePlayer(playerId, 'update');

    return result;
  }

  /**
   * Add item to inventory with caching
   */
  override async addItemToInventory(playerId: string, item: ItemStack): Promise<boolean> {
    const result = await super.addItemToInventory(playerId, item);

    if (result) {
      // Update cached inventory
      const updatedPlayer = await super.getPlayer(playerId);
      if (updatedPlayer) {
        await playerCacheService.cachePlayerInventory(playerId, updatedPlayer.inventory);
        await playerCacheService.cachePlayer(updatedPlayer);
      }

      // Trigger inventory change invalidation
      await cacheInvalidationService.invalidate({
        type: 'player',
        entityId: playerId,
        action: 'update',
        timestamp: new Date(),
        metadata: { inventoryChange: true, itemAdded: item.itemId }
      });
    }

    return result;
  }

  /**
   * Remove item from inventory with caching
   */
  override async removeItemFromInventory(playerId: string, itemId: string, quantity: number): Promise<boolean> {
    const result = await super.removeItemFromInventory(playerId, itemId, quantity);

    if (result) {
      // Update cached inventory
      const updatedPlayer = await super.getPlayer(playerId);
      if (updatedPlayer) {
        await playerCacheService.cachePlayerInventory(playerId, updatedPlayer.inventory);
        await playerCacheService.cachePlayer(updatedPlayer);
      }

      // Trigger inventory change invalidation
      await cacheInvalidationService.invalidate({
        type: 'player',
        entityId: playerId,
        action: 'update',
        timestamp: new Date(),
        metadata: { inventoryChange: true, itemRemoved: itemId }
      });
    }

    return result;
  }

  /**
   * Get player stats with caching
   */
  override async getPlayerStats(playerId: string): Promise<any> {
    // Try to get from cache first
    const cachedStats = await playerCacheService.getPlayerStats(playerId);
    if (cachedStats) {
      return this.convertPlayerStatsToResponse(cachedStats);
    }

    // If not in cache, calculate from database
    const stats = await super.getPlayerStats(playerId);
    if (stats) {
      // Create PlayerStats object for caching
      const player = await super.getPlayer(playerId);
      if (player) {
        const playerStats = this.extractPlayerStats(player);
        await playerCacheService.cachePlayerStats(playerStats);
      }
    }

    return stats;
  }

  /**
   * Get player inventory with caching
   */
  override async getPlayerInventory(playerId: string): Promise<ItemStack[]> {
    // Try to get from cache first
    const cachedInventory = await playerCacheService.getPlayerInventory(playerId);
    if (cachedInventory) {
      return cachedInventory;
    }

    // If not in cache, get from database
    const inventory = await super.getPlayerInventory(playerId);
    if (inventory) {
      // Cache the inventory
      await playerCacheService.cachePlayerInventory(playerId, inventory);
    }

    return inventory;
  }

  /**
   * Set player online status
   */
  async setPlayerOnline(playerId: string): Promise<void> {
    await playerCacheService.setPlayerOnline(playerId);
    await this.updateLastLogin(playerId);
  }

  /**
   * Set player offline status
   */
  async setPlayerOffline(playerId: string): Promise<void> {
    await playerCacheService.setPlayerOffline(playerId);
  }

  /**
   * Check if player is online
   */
  async isPlayerOnline(playerId: string): Promise<boolean> {
    return await playerCacheService.isPlayerOnline(playerId);
  }

  /**
   * Get online player count
   */
  async getOnlinePlayerCount(): Promise<number> {
    return await playerCacheService.getOnlinePlayerCount();
  }

  /**
   * Update last login with cache update
   */
  override async updateLastLogin(playerId: string): Promise<void> {
    await super.updateLastLogin(playerId);

    // Update cached player data
    const player = await super.getPlayer(playerId);
    if (player) {
      await playerCacheService.cachePlayer(player);
    }
  }

  /**
   * Create player with caching
   */
  override async createPlayer(playerData: { username: string; email: string; passwordHash: string }): Promise<Player> {
    const player = await super.createPlayer(playerData);

    // Cache the new player
    await playerCacheService.cachePlayer(player);

    // Cache initial stats
    const stats = this.extractPlayerStats(player);
    await playerCacheService.cachePlayerStats(stats);

    // Cache empty inventory
    await playerCacheService.cachePlayerInventory(player.id, player.inventory);

    return player;
  }

  /**
   * Delete player with cache cleanup
   */
  override async deletePlayer(playerId: string): Promise<void> {
    await super.deletePlayer(playerId);

    // Clean up all cached data for this player
    await playerCacheService.invalidatePlayer(playerId);
    await cacheInvalidationService.invalidatePlayer(playerId, 'delete');
  }

  /**
   * Get multiple players with batch caching
   */
  async getMultiplePlayers(playerIds: string[]): Promise<(Player | null)[]> {
    const results: (Player | null)[] = [];
    const uncachedIds: string[] = [];

    // Check cache for each player
    for (const playerId of playerIds) {
      const cachedPlayer = await playerCacheService.getPlayer(playerId);
      if (cachedPlayer) {
        results.push(cachedPlayer);
      } else {
        results.push(null);
        uncachedIds.push(playerId);
      }
    }

    // Fetch uncached players from database
    for (let i = 0; i < playerIds.length; i++) {
      const playerId = playerIds[i];
      if (playerId && results[i] === null && uncachedIds.includes(playerId)) {
        const player = await super.getPlayer(playerId);
        results[i] = player;
        
        // Cache the player if found
        if (player) {
          await playerCacheService.cachePlayer(player);
        }
      }
    }

    return results;
  }

  /**
   * Get multiple player stats with batch caching
   */
  async getMultiplePlayerStats(playerIds: string[]): Promise<(PlayerStats | null)[]> {
    return await playerCacheService.getMultiplePlayerStats(playerIds);
  }

  /**
   * Warm up cache for active players
   */
  async warmUpPlayerCache(playerIds: string[]): Promise<void> {
    const players = await this.getMultiplePlayers(playerIds);
    
    // Cache stats for all loaded players
    const statsToCache: PlayerStats[] = [];
    for (let i = 0; i < players.length; i++) {
      const player = players[i];
      if (player) {
        const stats = this.extractPlayerStats(player);
        statsToCache.push(stats);
      }
    }

    if (statsToCache.length > 0) {
      await playerCacheService.cacheMultiplePlayerStats(statsToCache);
    }
  }

  /**
   * Extract player stats for caching
   */
  private extractPlayerStats(player: Player): PlayerStats {
    const skillLevels: Record<string, number> = {};
    let totalExperience = 0;
    let maxLevel = 1;

    for (const [skillType, skillData] of player.skills.entries()) {
      skillLevels[skillType] = skillData.level;
      totalExperience += skillData.experience;
      maxLevel = Math.max(maxLevel, skillData.level);
    }

    return {
      playerId: player.id,
      level: maxLevel,
      totalExperience,
      skillLevels,
      lastUpdated: new Date()
    };
  }

  /**
   * Convert cached PlayerStats to response format
   */
  private convertPlayerStatsToResponse(stats: PlayerStats): any {
    return {
      level: stats.level,
      totalExperience: stats.totalExperience,
      skillCount: Object.keys(stats.skillLevels).length,
      inventoryValue: 0, // Would need to calculate separately
      itemCount: 0 // Would need to calculate separately
    };
  }

  /**
   * Invalidate all player cache
   */
  async invalidatePlayerCache(playerId: string): Promise<void> {
    await playerCacheService.invalidatePlayer(playerId);
  }

  /**
   * Get cache statistics
   */
  async getCacheStats(): Promise<any> {
    return await cacheInvalidationService.getCacheHealth();
  }

  /**
   * Preload frequently accessed players
   */
  async preloadFrequentPlayers(): Promise<void> {
    // This would typically get a list of frequently accessed players
    // For now, we'll just demonstrate the concept
    const frequentPlayerIds = ['player1', 'player2', 'player3']; // Would come from analytics
    await this.warmUpPlayerCache(frequentPlayerIds);
  }
}

export const cachedPlayerService = new CachedPlayerService();