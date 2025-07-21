import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PlayerCacheService, PlayerStats } from '../../services/PlayerCacheService';
import { cacheService } from '../../services/CacheService';
import { Player } from '../../models/Player';

describe('PlayerCacheService', () => {
  let playerCacheService: PlayerCacheService;

  beforeAll(async () => {
    playerCacheService = new PlayerCacheService();
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

  describe('Player Caching', () => {
    it('should cache and retrieve player data', async () => {
      const player: Player = {
        id: 'player123',
        username: 'testplayer',
        email: 'test@example.com',
        passwordHash: 'hashedpassword',
        islandId: 'island123',
        level: 25,
        experience: 15000,
        skills: new Map([
          ['combat', { level: 20, experience: 8000 }],
          ['mining', { level: 15, experience: 5000 }]
        ]),
        inventory: [],
        currency: { coins: 1000, tokens: 50 },
        settings: { theme: 'dark', notifications: true },
        createdAt: new Date(),
        lastLogin: new Date()
      };

      const cacheResult = await playerCacheService.cachePlayer(player);
      expect(cacheResult).toBe(true);

      const retrievedPlayer = await playerCacheService.getPlayer(player.id);
      expect(retrievedPlayer).toEqual(player);
    });

    it('should return null for non-existent player', async () => {
      const result = await playerCacheService.getPlayer('non-existent-player');
      expect(result).toBeNull();
    });

    it('should cache player with custom TTL', async () => {
      const player: Player = {
        id: 'ttl-player',
        username: 'ttlplayer',
        email: 'ttl@example.com',
        passwordHash: 'hashedpassword',
        islandId: 'island456',
        level: 10,
        experience: 2000,
        skills: new Map(),
        inventory: [],
        currency: { coins: 500, tokens: 10 },
        settings: { theme: 'light', notifications: false },
        createdAt: new Date(),
        lastLogin: new Date()
      };

      await playerCacheService.cachePlayer(player, 1); // 1 second TTL
      
      let retrievedPlayer = await playerCacheService.getPlayer(player.id);
      expect(retrievedPlayer).toEqual(player);

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 1100));
      
      retrievedPlayer = await playerCacheService.getPlayer(player.id);
      expect(retrievedPlayer).toBeNull();
    });
  });

  describe('Player Stats Caching', () => {
    it('should cache and retrieve player stats', async () => {
      const stats: PlayerStats = {
        playerId: 'player123',
        level: 25,
        totalExperience: 15000,
        skillLevels: {
          combat: 20,
          mining: 15,
          crafting: 18
        },
        lastUpdated: new Date()
      };

      const cacheResult = await playerCacheService.cachePlayerStats(stats);
      expect(cacheResult).toBe(true);

      const retrievedStats = await playerCacheService.getPlayerStats(stats.playerId);
      expect(retrievedStats).toEqual(stats);
    });

    it('should update player level in stats', async () => {
      const playerId = 'player456';
      const initialStats: PlayerStats = {
        playerId,
        level: 20,
        totalExperience: 10000,
        skillLevels: { combat: 15 },
        lastUpdated: new Date()
      };

      await playerCacheService.cachePlayerStats(initialStats);
      await playerCacheService.updatePlayerLevel(playerId, 21);

      const updatedStats = await playerCacheService.getPlayerStats(playerId);
      expect(updatedStats?.level).toBe(21);
      expect(updatedStats?.lastUpdated).not.toEqual(initialStats.lastUpdated);
    });

    it('should update player skill level', async () => {
      const playerId = 'player789';
      const initialStats: PlayerStats = {
        playerId,
        level: 15,
        totalExperience: 5000,
        skillLevels: { mining: 10, combat: 8 },
        lastUpdated: new Date()
      };

      await playerCacheService.cachePlayerStats(initialStats);
      await playerCacheService.updatePlayerSkill(playerId, 'mining', 12);

      const updatedStats = await playerCacheService.getPlayerStats(playerId);
      expect(updatedStats?.skillLevels.mining).toBe(12);
      expect(updatedStats?.skillLevels.combat).toBe(8); // Should remain unchanged
    });

    it('should increment player experience', async () => {
      const playerId = 'player101';
      const initialStats: PlayerStats = {
        playerId,
        level: 10,
        totalExperience: 2000,
        skillLevels: {},
        lastUpdated: new Date()
      };

      await playerCacheService.cachePlayerStats(initialStats);
      await playerCacheService.incrementPlayerExperience(playerId, 500);

      const updatedStats = await playerCacheService.getPlayerStats(playerId);
      expect(updatedStats?.totalExperience).toBe(2500);
    });
  });

  describe('Player Inventory Caching', () => {
    it('should cache and retrieve player inventory', async () => {
      const playerId = 'player202';
      const inventory = [
        { itemId: 'sword1', quantity: 1, metadata: { rarity: 'rare' } },
        { itemId: 'potion1', quantity: 5, metadata: { type: 'health' } }
      ];

      const cacheResult = await playerCacheService.cachePlayerInventory(playerId, inventory);
      expect(cacheResult).toBe(true);

      const retrievedInventory = await playerCacheService.getPlayerInventory(playerId);
      expect(retrievedInventory).toEqual(inventory);
    });

    it('should return null for non-existent inventory', async () => {
      const result = await playerCacheService.getPlayerInventory('non-existent-player');
      expect(result).toBeNull();
    });
  });

  describe('Batch Operations', () => {
    it('should get multiple player stats', async () => {
      const statsArray: PlayerStats[] = [
        {
          playerId: 'player1',
          level: 10,
          totalExperience: 1000,
          skillLevels: { combat: 8 },
          lastUpdated: new Date()
        },
        {
          playerId: 'player2',
          level: 15,
          totalExperience: 3000,
          skillLevels: { mining: 12 },
          lastUpdated: new Date()
        },
        {
          playerId: 'player3',
          level: 20,
          totalExperience: 8000,
          skillLevels: { crafting: 18 },
          lastUpdated: new Date()
        }
      ];

      // Cache all stats
      for (const stats of statsArray) {
        await playerCacheService.cachePlayerStats(stats);
      }

      const playerIds = statsArray.map(s => s.playerId);
      const retrievedStats = await playerCacheService.getMultiplePlayerStats(playerIds);

      expect(retrievedStats).toHaveLength(3);
      expect(retrievedStats[0]).toEqual(statsArray[0]);
      expect(retrievedStats[1]).toEqual(statsArray[1]);
      expect(retrievedStats[2]).toEqual(statsArray[2]);
    });

    it('should cache multiple player stats', async () => {
      const statsArray: PlayerStats[] = [
        {
          playerId: 'batch1',
          level: 5,
          totalExperience: 500,
          skillLevels: { combat: 3 },
          lastUpdated: new Date()
        },
        {
          playerId: 'batch2',
          level: 8,
          totalExperience: 1200,
          skillLevels: { mining: 6 },
          lastUpdated: new Date()
        }
      ];

      const cacheResult = await playerCacheService.cacheMultiplePlayerStats(statsArray);
      expect(cacheResult).toBe(true);

      // Verify all were cached
      for (const stats of statsArray) {
        const retrieved = await playerCacheService.getPlayerStats(stats.playerId);
        expect(retrieved).toEqual(stats);
      }
    });

    it('should handle mixed existing and non-existing players in batch get', async () => {
      const existingStats: PlayerStats = {
        playerId: 'existing-player',
        level: 12,
        totalExperience: 2500,
        skillLevels: { combat: 10 },
        lastUpdated: new Date()
      };

      await playerCacheService.cachePlayerStats(existingStats);

      const playerIds = ['existing-player', 'non-existing-player'];
      const results = await playerCacheService.getMultiplePlayerStats(playerIds);

      expect(results).toHaveLength(2);
      expect(results[0]).toEqual(existingStats);
      expect(results[1]).toBeNull();
    });
  });

  describe('Online Status Management', () => {
    it('should set and check player online status', async () => {
      const playerId = 'online-player';

      let isOnline = await playerCacheService.isPlayerOnline(playerId);
      expect(isOnline).toBe(false);

      await playerCacheService.setPlayerOnline(playerId);
      isOnline = await playerCacheService.isPlayerOnline(playerId);
      expect(isOnline).toBe(true);
    });

    it('should set player offline', async () => {
      const playerId = 'offline-player';

      await playerCacheService.setPlayerOnline(playerId);
      let isOnline = await playerCacheService.isPlayerOnline(playerId);
      expect(isOnline).toBe(true);

      await playerCacheService.setPlayerOffline(playerId);
      isOnline = await playerCacheService.isPlayerOnline(playerId);
      expect(isOnline).toBe(false);
    });

    it('should handle online status TTL', async () => {
      const playerId = 'ttl-online-player';

      await playerCacheService.setPlayerOnline(playerId, 1); // 1 second TTL
      
      let isOnline = await playerCacheService.isPlayerOnline(playerId);
      expect(isOnline).toBe(true);

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 1100));
      
      isOnline = await playerCacheService.isPlayerOnline(playerId);
      expect(isOnline).toBe(false);
    });

    it('should get online player count', async () => {
      const playerIds = ['online1', 'online2', 'online3'];

      // Set multiple players online
      for (const playerId of playerIds) {
        await playerCacheService.setPlayerOnline(playerId);
      }

      const count = await playerCacheService.getOnlinePlayerCount();
      expect(count).toBe(3);
    });
  });

  describe('Cache Invalidation', () => {
    it('should invalidate all player data', async () => {
      const playerId = 'invalidate-player';
      const player: Player = {
        id: playerId,
        username: 'invalidateplayer',
        email: 'invalidate@example.com',
        passwordHash: 'hashedpassword',
        islandId: 'island789',
        level: 15,
        experience: 5000,
        skills: new Map(),
        inventory: [],
        currency: { coins: 750, tokens: 25 },
        settings: { theme: 'dark', notifications: true },
        createdAt: new Date(),
        lastLogin: new Date()
      };

      const stats: PlayerStats = {
        playerId,
        level: 15,
        totalExperience: 5000,
        skillLevels: { combat: 12 },
        lastUpdated: new Date()
      };

      const inventory = [{ itemId: 'item1', quantity: 1 }];

      // Cache all data
      await playerCacheService.cachePlayer(player);
      await playerCacheService.cachePlayerStats(stats);
      await playerCacheService.cachePlayerInventory(playerId, inventory);

      // Verify data is cached
      expect(await playerCacheService.getPlayer(playerId)).toEqual(player);
      expect(await playerCacheService.getPlayerStats(playerId)).toEqual(stats);
      expect(await playerCacheService.getPlayerInventory(playerId)).toEqual(inventory);

      // Invalidate all player data
      await playerCacheService.invalidatePlayer(playerId);

      // Verify all data is invalidated
      expect(await playerCacheService.getPlayer(playerId)).toBeNull();
      expect(await playerCacheService.getPlayerStats(playerId)).toBeNull();
      expect(await playerCacheService.getPlayerInventory(playerId)).toBeNull();
    });

    it('should invalidate specific player data types', async () => {
      const playerId = 'selective-invalidate';
      const stats: PlayerStats = {
        playerId,
        level: 10,
        totalExperience: 2000,
        skillLevels: { mining: 8 },
        lastUpdated: new Date()
      };

      const inventory = [{ itemId: 'pickaxe', quantity: 1 }];

      await playerCacheService.cachePlayerStats(stats);
      await playerCacheService.cachePlayerInventory(playerId, inventory);

      // Invalidate only stats
      await playerCacheService.invalidatePlayerStats(playerId);

      expect(await playerCacheService.getPlayerStats(playerId)).toBeNull();
      expect(await playerCacheService.getPlayerInventory(playerId)).toEqual(inventory);

      // Invalidate only inventory
      await playerCacheService.invalidatePlayerInventory(playerId);
      expect(await playerCacheService.getPlayerInventory(playerId)).toBeNull();
    });
  });
});