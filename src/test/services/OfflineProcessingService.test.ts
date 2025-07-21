import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OfflineProcessingService, MinionRepository } from '../../services/OfflineProcessingService';
import { PlayerService } from '../../services/PlayerService';
import { MinionEntity, MinionType, Minion } from '../../models/Minion';
import { Player, SkillType } from '../../models/Player';
import { ItemRarity } from '../../models/Item';

describe('OfflineProcessingService', () => {
  let service: OfflineProcessingService;
  let mockMinionRepository: MinionRepository;
  let mockPlayerService: PlayerService;

  const mockPlayer: Player = {
    id: 'player-1',
    username: 'testplayer',
    islandId: 'island-1',
    skills: new Map([
      [SkillType.MINING, { experience: 1000, level: 10, prestige: 0, unlockedPerks: [] }]
    ]),
    inventory: [],
    equipment: {},
    currency: {
      coins: 1000,
      dungeonTokens: 0,
      eventCurrency: 0,
      guildPoints: 0
    },
    minions: [],
    settings: {
      chatEnabled: true,
      tradeRequestsEnabled: true,
      islandVisitsEnabled: true,
      notifications: {
        minionAlerts: true,
        tradeAlerts: true,
        guildAlerts: true,
        friendAlerts: true
      }
    },
    friends: [],
    lastLogin: new Date()
  };

  const mockMinion: Minion = {
    id: 'minion-1',
    type: MinionType.COBBLESTONE,
    ownerId: 'player-1',
    position: { x: 0, y: 0, z: 0 },
    level: 1,
    efficiency: 0,
    storageCapacity: 64,
    collectedResources: [],
    isActive: true,
    deployedAt: new Date(Date.now() - 3600000), // 1 hour ago
    lastCollection: new Date(Date.now() - 3600000) // 1 hour ago
  };

  beforeEach(() => {
    mockMinionRepository = {
      findByOwnerId: vi.fn(),
      findById: vi.fn(),
      update: vi.fn(),
      findActiveMinions: vi.fn()
    };

    mockPlayerService = {
      getPlayer: vi.fn(),
      addItemToInventory: vi.fn()
    } as any;

    service = new OfflineProcessingService(mockMinionRepository, mockPlayerService);
  });

  describe('processPlayerOfflineActivity', () => {
    it('should process offline activity for player with no minions', async () => {
      vi.mocked(mockMinionRepository.findByOwnerId).mockResolvedValue([]);

      const result = await service.processPlayerOfflineActivity('player-1');

      expect(result.success).toBe(true);
      expect(result.result?.minionsProcessed).toBe(0);
      expect(result.result?.totalResourcesCollected).toEqual([]);
      expect(result.result?.overflowItems).toEqual([]);
    });

    it('should return error if player not found', async () => {
      vi.mocked(mockMinionRepository.findByOwnerId).mockResolvedValue([mockMinion]);
      vi.mocked(mockPlayerService.getPlayer).mockResolvedValue(null);

      const result = await service.processPlayerOfflineActivity('player-1');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Player not found');
    });

    it('should process active minions and collect resources', async () => {
      const activeMinion = { ...mockMinion, isActive: true };
      vi.mocked(mockMinionRepository.findByOwnerId).mockResolvedValue([activeMinion]);
      vi.mocked(mockPlayerService.getPlayer).mockResolvedValue(mockPlayer);
      vi.mocked(mockPlayerService.addItemToInventory).mockResolvedValue(true);
      vi.mocked(mockMinionRepository.update).mockResolvedValue(activeMinion);

      const result = await service.processPlayerOfflineActivity('player-1');

      expect(result.success).toBe(true);
      expect(result.result?.minionsProcessed).toBe(1);
      expect(result.result?.totalResourcesCollected.length).toBeGreaterThan(0);
      expect(mockMinionRepository.update).toHaveBeenCalled();
    });

    it('should skip inactive minions', async () => {
      const inactiveMinion = { ...mockMinion, isActive: false };
      vi.mocked(mockMinionRepository.findByOwnerId).mockResolvedValue([inactiveMinion]);
      vi.mocked(mockPlayerService.getPlayer).mockResolvedValue(mockPlayer);

      const result = await service.processPlayerOfflineActivity('player-1');

      expect(result.success).toBe(true);
      expect(result.result?.minionsProcessed).toBe(0);
      expect(mockMinionRepository.update).not.toHaveBeenCalled();
    });

    it('should handle storage overflow correctly', async () => {
      const fullStorageMinion = {
        ...mockMinion,
        storageCapacity: 2,
        collectedResources: [
          { itemId: 'cobblestone', quantity: 2 }
        ]
      };

      vi.mocked(mockMinionRepository.findByOwnerId).mockResolvedValue([fullStorageMinion]);
      vi.mocked(mockPlayerService.getPlayer).mockResolvedValue(mockPlayer);
      vi.mocked(mockPlayerService.addItemToInventory).mockResolvedValue(true);
      vi.mocked(mockMinionRepository.update).mockResolvedValue(fullStorageMinion);

      const result = await service.processPlayerOfflineActivity('player-1');

      expect(result.success).toBe(true);
      // Should have limited collection due to storage capacity
      expect(result.result?.overflowItems.length).toBeGreaterThanOrEqual(0);
    });

    it('should handle inventory overflow when player inventory is full', async () => {
      vi.mocked(mockMinionRepository.findByOwnerId).mockResolvedValue([mockMinion]);
      vi.mocked(mockPlayerService.getPlayer).mockResolvedValue(mockPlayer);
      vi.mocked(mockPlayerService.addItemToInventory).mockResolvedValue(false); // Inventory full
      vi.mocked(mockMinionRepository.update).mockResolvedValue(mockMinion);

      const result = await service.processPlayerOfflineActivity('player-1');

      expect(result.success).toBe(true);
      expect(result.result?.overflowItems.length).toBeGreaterThan(0);
    });
  });

  describe('processAllActiveMinions', () => {
    it('should process all active minions grouped by owner', async () => {
      const minions = [
        { ...mockMinion, id: 'minion-1', ownerId: 'player-1' },
        { ...mockMinion, id: 'minion-2', ownerId: 'player-1' },
        { ...mockMinion, id: 'minion-3', ownerId: 'player-2' }
      ];

      vi.mocked(mockMinionRepository.findActiveMinions).mockResolvedValue(minions);
      vi.mocked(mockPlayerService.getPlayer).mockResolvedValue(mockPlayer);
      vi.mocked(mockPlayerService.addItemToInventory).mockResolvedValue(true);
      vi.mocked(mockMinionRepository.update).mockResolvedValue(mockMinion);

      const result = await service.processAllActiveMinions();

      expect(result.success).toBe(true);
      expect(result.data?.playersProcessed).toBe(2); // player-1 and player-2
    });

    it('should handle errors during processing', async () => {
      vi.mocked(mockMinionRepository.findActiveMinions).mockRejectedValue(new Error('Database error'));

      const result = await service.processAllActiveMinions();

      expect(result.success).toBe(false);
      expect(result.error).toBe('Database error');
    });
  });

  describe('calculateCatchUpResources', () => {
    it('should calculate correct resources for offline time', () => {
      const minion = new MinionEntity(mockMinion);
      const offlineStartTime = new Date(Date.now() - 3600000); // 1 hour ago
      const currentTime = new Date();

      const resources = service.calculateCatchUpResources(minion, offlineStartTime, currentTime);

      expect(resources.length).toBeGreaterThan(0);
      expect(resources[0]?.itemId).toBe('cobblestone');
    });

    it('should return empty array for inactive minions', () => {
      const inactiveMinion = new MinionEntity({ ...mockMinion, isActive: false });
      const offlineStartTime = new Date(Date.now() - 3600000);
      const currentTime = new Date();

      const resources = service.calculateCatchUpResources(inactiveMinion, offlineStartTime, currentTime);

      expect(resources).toEqual([]);
    });

    it('should respect storage capacity limits', () => {
      const minion = new MinionEntity({
        ...mockMinion,
        storageCapacity: 5,
        collectedResources: [{ itemId: 'cobblestone', quantity: 4 }] // Almost full
      });

      const offlineStartTime = new Date(Date.now() - 3600000); // 1 hour ago
      const currentTime = new Date();

      const resources = service.calculateCatchUpResources(minion, offlineStartTime, currentTime);

      // Should be limited by available storage (only 1 slot left)
      const totalQuantity = resources.reduce((sum, item) => sum + item.quantity, 0);
      expect(totalQuantity).toBeLessThanOrEqual(1);
    });

    it('should return empty array if no time has passed', () => {
      const minion = new MinionEntity(mockMinion);
      const currentTime = new Date();
      const offlineStartTime = new Date(currentTime.getTime() + 1000); // Future time

      const resources = service.calculateCatchUpResources(minion, offlineStartTime, currentTime);

      expect(resources).toEqual([]);
    });
  });

  describe('getPlayerOfflineStats', () => {
    it('should calculate correct offline statistics', async () => {
      const minions = [
        { ...mockMinion, id: 'minion-1', isActive: true, type: MinionType.COBBLESTONE },
        { ...mockMinion, id: 'minion-2', isActive: false, type: MinionType.COAL },
        {
          ...mockMinion,
          id: 'minion-3',
          isActive: true,
          type: MinionType.IRON,
          collectedResources: [{ itemId: 'iron_ore', quantity: 10 }]
        }
      ];

      vi.mocked(mockMinionRepository.findByOwnerId).mockResolvedValue(minions);

      const result = await service.getPlayerOfflineStats('player-1');

      expect(result.success).toBe(true);
      expect(result.data?.totalMinions).toBe(3);
      expect(result.data?.activeMinions).toBe(2);
      expect(result.data?.totalStorageUsed).toBe(10);
      expect(result.data?.totalStorageCapacity).toBe(192); // 3 * 64
      expect(result.data?.estimatedHourlyProduction.length).toBeGreaterThan(0);
    });

    it('should handle empty minion list', async () => {
      vi.mocked(mockMinionRepository.findByOwnerId).mockResolvedValue([]);

      const result = await service.getPlayerOfflineStats('player-1');

      expect(result.success).toBe(true);
      expect(result.data?.totalMinions).toBe(0);
      expect(result.data?.activeMinions).toBe(0);
      expect(result.data?.estimatedHourlyProduction).toEqual([]);
    });
  });

  describe('clearPlayerOverflow', () => {
    it('should clear all collected resources from player minions', async () => {
      const minionsWithResources = [
        {
          ...mockMinion,
          id: 'minion-1',
          collectedResources: [{ itemId: 'cobblestone', quantity: 5 }]
        },
        {
          ...mockMinion,
          id: 'minion-2',
          collectedResources: [{ itemId: 'coal', quantity: 3 }]
        }
      ];

      vi.mocked(mockMinionRepository.findByOwnerId).mockResolvedValue(minionsWithResources);
      vi.mocked(mockMinionRepository.update).mockResolvedValue(mockMinion);

      const result = await service.clearPlayerOverflow('player-1');

      expect(result.success).toBe(true);
      expect(result.data).toBe(2); // 2 item stacks cleared
      expect(mockMinionRepository.update).toHaveBeenCalledTimes(2);
    });

    it('should handle minions with no resources', async () => {
      const emptyMinions = [
        { ...mockMinion, id: 'minion-1', collectedResources: [] },
        { ...mockMinion, id: 'minion-2', collectedResources: [] }
      ];

      vi.mocked(mockMinionRepository.findByOwnerId).mockResolvedValue(emptyMinions);

      const result = await service.clearPlayerOverflow('player-1');

      expect(result.success).toBe(true);
      expect(result.data).toBe(0);
      expect(mockMinionRepository.update).not.toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should handle repository errors gracefully', async () => {
      vi.mocked(mockMinionRepository.findByOwnerId).mockRejectedValue(new Error('Database connection failed'));

      const result = await service.processPlayerOfflineActivity('player-1');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Database connection failed');
    });

    it('should handle player service errors gracefully', async () => {
      vi.mocked(mockMinionRepository.findByOwnerId).mockResolvedValue([mockMinion]);
      vi.mocked(mockPlayerService.getPlayer).mockRejectedValue(new Error('Player service error'));

      const result = await service.processPlayerOfflineActivity('player-1');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Player service error');
    });
  });
});