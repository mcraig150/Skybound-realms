import { describe, it, expect, beforeEach } from 'vitest';
import { MinionEntity, MinionType, MinionUpgradeType } from '../../models/Minion';
import { ItemRarity } from '../../models/Item';

describe('MinionEntity', () => {
  let testMinion: MinionEntity;
  let mockMinionData: any;

  beforeEach(() => {
    mockMinionData = {
      id: 'minion-1',
      type: MinionType.COBBLESTONE,
      ownerId: 'player-1',
      position: { x: 0, y: 0, z: 0 },
      level: 1,
      efficiency: 0,
      storageCapacity: 64,
      collectedResources: [],
      isActive: true,
      deployedAt: new Date(),
      lastCollection: new Date()
    };
    testMinion = new MinionEntity(mockMinionData);
  });

  describe('constructor', () => {
    it('should create a minion with provided data', () => {
      expect(testMinion.id).toBe('minion-1');
      expect(testMinion.type).toBe(MinionType.COBBLESTONE);
      expect(testMinion.ownerId).toBe('player-1');
      expect(testMinion.level).toBe(1);
      expect(testMinion.efficiency).toBe(0);
      expect(testMinion.storageCapacity).toBe(64);
      expect(testMinion.isActive).toBe(true);
    });
  });

  describe('getCollectionInterval', () => {
    it('should return correct base interval for cobblestone minion', () => {
      const interval = testMinion.getCollectionInterval();
      expect(interval).toBe(14000); // 14 seconds for 0% efficiency
    });

    it('should reduce interval with higher efficiency', () => {
      testMinion.efficiency = 100; // 100% efficiency
      const interval = testMinion.getCollectionInterval();
      expect(interval).toBe(7000); // Half the base interval
    });

    it('should return different intervals for different minion types', () => {
      const coalMinion = new MinionEntity({
        ...mockMinionData,
        type: MinionType.COAL
      });
      expect(coalMinion.getCollectionInterval()).toBe(30000); // 30 seconds
      
      const diamondMinion = new MinionEntity({
        ...mockMinionData,
        type: MinionType.DIAMOND
      });
      expect(diamondMinion.getCollectionInterval()).toBe(120000); // 2 minutes
    });
  });

  describe('canCollect', () => {
    it('should return true when minion is active and has storage space', () => {
      expect(testMinion.canCollect()).toBe(true);
    });

    it('should return false when minion is inactive', () => {
      testMinion.isActive = false;
      expect(testMinion.canCollect()).toBe(false);
    });

    it('should return false when storage is full', () => {
      // Fill storage to capacity
      testMinion.collectedResources = [
        { itemId: 'cobblestone', quantity: 64, metadata: { rarity: ItemRarity.COMMON, enchantments: [] } }
      ];
      expect(testMinion.canCollect()).toBe(false);
    });
  });

  describe('processOfflineCollection', () => {
    it('should collect resources based on time elapsed', () => {
      const pastTime = new Date(Date.now() - 30000); // 30 seconds ago
      testMinion.lastCollection = pastTime;
      
      const currentTime = new Date();
      const collected = testMinion.processOfflineCollection(currentTime);
      
      // Should collect 2 resources (30000ms / 14000ms = 2.14, floored to 2)
      expect(collected).toHaveLength(2);
      expect(collected[0]?.itemId).toBe('cobblestone');
      expect(testMinion.collectedResources).toHaveLength(1);
      expect(testMinion.collectedResources[0]?.quantity).toBe(2);
    });

    it('should not collect when minion is inactive', () => {
      testMinion.isActive = false;
      const pastTime = new Date(Date.now() - 30000);
      testMinion.lastCollection = pastTime;
      
      const collected = testMinion.processOfflineCollection(new Date());
      expect(collected).toHaveLength(0);
    });

    it('should stop collecting when storage is full', () => {
      testMinion.storageCapacity = 1;
      const pastTime = new Date(Date.now() - 60000); // 1 minute ago
      testMinion.lastCollection = pastTime;
      
      const collected = testMinion.processOfflineCollection(new Date());
      expect(collected).toHaveLength(1); // Only 1 item due to storage limit
    });

    it('should update lastCollection time correctly', () => {
      const pastTime = new Date(Date.now() - 30000);
      testMinion.lastCollection = pastTime;
      const originalTime = testMinion.lastCollection.getTime();
      
      testMinion.processOfflineCollection(new Date());
      
      expect(testMinion.lastCollection.getTime()).toBeGreaterThan(originalTime);
    });
  });

  describe('emptyStorage', () => {
    it('should return all collected resources and clear storage', () => {
      testMinion.collectedResources = [
        { itemId: 'cobblestone', quantity: 10, metadata: { rarity: ItemRarity.COMMON, enchantments: [] } },
        { itemId: 'coal', quantity: 5, metadata: { rarity: ItemRarity.COMMON, enchantments: [] } }
      ];
      
      const emptied = testMinion.emptyStorage();
      
      expect(emptied).toHaveLength(2);
      expect(emptied[0]?.quantity).toBe(10);
      expect(emptied[1]?.quantity).toBe(5);
      expect(testMinion.collectedResources).toHaveLength(0);
    });
  });

  describe('upgrade', () => {
    it('should increase level, efficiency, and storage capacity', () => {
      const originalLevel = testMinion.level;
      const originalEfficiency = testMinion.efficiency;
      const originalStorage = testMinion.storageCapacity;
      
      testMinion.upgrade();
      
      expect(testMinion.level).toBe(originalLevel + 1);
      expect(testMinion.efficiency).toBe(originalEfficiency + 10);
      expect(testMinion.storageCapacity).toBeGreaterThan(originalStorage);
    });
  });

  describe('applyUpgrade', () => {
    it('should apply speed upgrade effects', () => {
      const upgrade = {
        id: 'speed-upgrade',
        name: 'Speed Boost',
        description: 'Increases collection speed',
        cost: [],
        effects: [
          { type: MinionUpgradeType.SPEED, value: 25 }
        ]
      };
      
      const originalEfficiency = testMinion.efficiency;
      testMinion.applyUpgrade(upgrade);
      
      expect(testMinion.efficiency).toBe(originalEfficiency + 25);
    });

    it('should apply storage upgrade effects', () => {
      const upgrade = {
        id: 'storage-upgrade',
        name: 'Storage Expansion',
        description: 'Increases storage capacity',
        cost: [],
        effects: [
          { type: MinionUpgradeType.STORAGE, value: 32 }
        ]
      };
      
      const originalStorage = testMinion.storageCapacity;
      testMinion.applyUpgrade(upgrade);
      
      expect(testMinion.storageCapacity).toBe(originalStorage + 32);
    });

    it('should apply multiple upgrade effects', () => {
      const upgrade = {
        id: 'combo-upgrade',
        name: 'Combo Upgrade',
        description: 'Multiple improvements',
        cost: [],
        effects: [
          { type: MinionUpgradeType.SPEED, value: 15 },
          { type: MinionUpgradeType.STORAGE, value: 16 }
        ]
      };
      
      const originalEfficiency = testMinion.efficiency;
      const originalStorage = testMinion.storageCapacity;
      
      testMinion.applyUpgrade(upgrade);
      
      expect(testMinion.efficiency).toBe(originalEfficiency + 15);
      expect(testMinion.storageCapacity).toBe(originalStorage + 16);
    });
  });

  describe('getStatus', () => {
    it('should return current minion status', () => {
      testMinion.collectedResources = [
        { itemId: 'cobblestone', quantity: 5, metadata: { rarity: ItemRarity.COMMON, enchantments: [] } }
      ];
      
      const status = testMinion.getStatus();
      
      expect(status.isActive).toBe(true);
      expect(status.resourcesCollected).toHaveLength(1);
      expect(status.storageCapacity).toBe(64);
      expect(status.efficiency).toBe(0);
      expect(typeof status.timeUntilNextCollection).toBe('number');
    });

    it('should calculate time until next collection correctly', () => {
      // Set last collection to 5 seconds ago
      testMinion.lastCollection = new Date(Date.now() - 5000);
      
      const status = testMinion.getStatus();
      
      // Should be approximately 9 seconds until next collection (14s - 5s)
      expect(status.timeUntilNextCollection).toBeGreaterThan(8000);
      expect(status.timeUntilNextCollection).toBeLessThan(10000);
    });
  });

  describe('setActive', () => {
    it('should activate minion and set lastCollection if not set', () => {
      testMinion.isActive = false;
      testMinion.lastCollection = new Date(0); // Reset to epoch
      
      testMinion.setActive(true);
      
      expect(testMinion.isActive).toBe(true);
      expect(testMinion.lastCollection.getTime()).toBeGreaterThan(0);
    });

    it('should deactivate minion', () => {
      testMinion.setActive(false);
      expect(testMinion.isActive).toBe(false);
    });
  });

  describe('validate', () => {
    it('should return valid for correct minion data', () => {
      const result = testMinion.validate();
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should return invalid for missing ID', () => {
      testMinion.id = '';
      const result = testMinion.validate();
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Minion ID is required');
    });

    it('should return invalid for missing owner ID', () => {
      testMinion.ownerId = '';
      const result = testMinion.validate();
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Owner ID is required');
    });

    it('should return invalid for invalid level', () => {
      testMinion.level = 0;
      const result = testMinion.validate();
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Minion level must be between 1 and 100');
    });

    it('should return invalid for negative efficiency', () => {
      testMinion.efficiency = -10;
      const result = testMinion.validate();
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Efficiency cannot be negative');
    });

    it('should return invalid for zero storage capacity', () => {
      testMinion.storageCapacity = 0;
      const result = testMinion.validate();
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Storage capacity must be at least 1');
    });
  });

  describe('resource type mapping', () => {
    it('should produce correct resources for different minion types', () => {
      const testCases = [
        { type: MinionType.COAL, expectedResource: 'coal' },
        { type: MinionType.IRON, expectedResource: 'iron_ore' },
        { type: MinionType.WHEAT, expectedResource: 'wheat' },
        { type: MinionType.CHICKEN, expectedResource: 'raw_chicken' }
      ];

      testCases.forEach(({ type, expectedResource }) => {
        const minion = new MinionEntity({
          ...mockMinionData,
          type
        });
        
        const pastTime = new Date(Date.now() - 60000); // 1 minute ago
        minion.lastCollection = pastTime;
        
        const collected = minion.processOfflineCollection(new Date());
        if (collected.length > 0) {
          expect(collected[0]?.itemId).toBe(expectedResource);
        }
      });
    });
  });
});