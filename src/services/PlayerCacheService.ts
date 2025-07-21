import { cacheService, CacheOptions } from './CacheService';
import { Player } from '../models/Player';

export interface PlayerStats {
  playerId: string;
  level: number;
  totalExperience: number;
  skillLevels: Record<string, number>;
  lastUpdated: Date;
}

export class PlayerCacheService {
  private readonly PLAYER_PREFIX = 'player';
  private readonly STATS_PREFIX = 'player_stats';
  private readonly INVENTORY_PREFIX = 'player_inventory';
  private readonly DEFAULT_TTL = 3600; // 1 hour

  async cachePlayer(player: Player, ttl: number = this.DEFAULT_TTL): Promise<boolean> {
    const key = `${this.PLAYER_PREFIX}:${player.id}`;
    return await cacheService.set(key, player, { ttl });
  }

  async getPlayer(playerId: string): Promise<Player | null> {
    const key = `${this.PLAYER_PREFIX}:${playerId}`;
    return await cacheService.get<Player>(key);
  }

  async cachePlayerStats(stats: PlayerStats, ttl: number = this.DEFAULT_TTL): Promise<boolean> {
    const key = `${this.STATS_PREFIX}:${stats.playerId}`;
    return await cacheService.set(key, stats, { ttl });
  }

  async getPlayerStats(playerId: string): Promise<PlayerStats | null> {
    const key = `${this.STATS_PREFIX}:${playerId}`;
    return await cacheService.get<PlayerStats>(key);
  }

  async cachePlayerInventory(playerId: string, inventory: any[], ttl: number = this.DEFAULT_TTL): Promise<boolean> {
    const key = `${this.INVENTORY_PREFIX}:${playerId}`;
    return await cacheService.set(key, inventory, { ttl });
  }

  async getPlayerInventory(playerId: string): Promise<any[] | null> {
    const key = `${this.INVENTORY_PREFIX}:${playerId}`;
    return await cacheService.get<any[]>(key);
  }

  async invalidatePlayer(playerId: string): Promise<void> {
    const keys = [
      `${this.PLAYER_PREFIX}:${playerId}`,
      `${this.STATS_PREFIX}:${playerId}`,
      `${this.INVENTORY_PREFIX}:${playerId}`
    ];

    await Promise.all(keys.map(key => cacheService.delete(key)));
  }

  async invalidatePlayerStats(playerId: string): Promise<boolean> {
    const key = `${this.STATS_PREFIX}:${playerId}`;
    return await cacheService.delete(key);
  }

  async invalidatePlayerInventory(playerId: string): Promise<boolean> {
    const key = `${this.INVENTORY_PREFIX}:${playerId}`;
    return await cacheService.delete(key);
  }

  async getMultiplePlayerStats(playerIds: string[]): Promise<(PlayerStats | null)[]> {
    const keys = playerIds.map(id => `${this.STATS_PREFIX}:${id}`);
    return await cacheService.getMultiple<PlayerStats>(keys);
  }

  async cacheMultiplePlayerStats(statsArray: PlayerStats[], ttl: number = this.DEFAULT_TTL): Promise<boolean> {
    const keyValuePairs = statsArray.map(stats => ({
      key: `${this.STATS_PREFIX}:${stats.playerId}`,
      value: stats
    }));

    return await cacheService.setMultiple(keyValuePairs, { ttl });
  }

  async updatePlayerLevel(playerId: string, newLevel: number): Promise<void> {
    const stats = await this.getPlayerStats(playerId);
    if (stats) {
      stats.level = newLevel;
      stats.lastUpdated = new Date();
      await this.cachePlayerStats(stats);
    }
  }

  async updatePlayerSkill(playerId: string, skillName: string, newLevel: number): Promise<void> {
    const stats = await this.getPlayerStats(playerId);
    if (stats) {
      stats.skillLevels[skillName] = newLevel;
      stats.lastUpdated = new Date();
      await this.cachePlayerStats(stats);
    }
  }

  async incrementPlayerExperience(playerId: string, experienceGain: number): Promise<void> {
    const stats = await this.getPlayerStats(playerId);
    if (stats) {
      stats.totalExperience += experienceGain;
      stats.lastUpdated = new Date();
      await this.cachePlayerStats(stats);
    }
  }

  async isPlayerOnline(playerId: string): Promise<boolean> {
    const key = `online:${playerId}`;
    return await cacheService.exists(key);
  }

  async setPlayerOnline(playerId: string, ttl: number = 300): Promise<boolean> {
    const key = `online:${playerId}`;
    return await cacheService.set(key, true, { ttl });
  }

  async setPlayerOffline(playerId: string): Promise<boolean> {
    const key = `online:${playerId}`;
    return await cacheService.delete(key);
  }

  async getOnlinePlayerCount(): Promise<number> {
    try {
      const keys = await cacheService['client'].keys('skybound:online:*');
      return keys.length;
    } catch (error) {
      console.error('Error getting online player count:', error);
      return 0;
    }
  }
}

export const playerCacheService = new PlayerCacheService();