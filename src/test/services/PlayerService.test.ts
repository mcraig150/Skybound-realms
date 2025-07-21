import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PlayerService, PlayerRepository } from '../../services/PlayerService';
import { Player, SkillType, PlayerFactory, EquipmentSlots } from '../../models/Player';
import { SkillData, SkillLevelResult } from '../../models/Skill';
import { ItemStack, ItemRarity } from '../../models/Item';
import { GAME_CONSTANTS } from '../../shared/constants';

// Mock PlayerRepository
class MockPlayerRepository implements PlayerRepository {
  private players: Map<string, Player> = new Map();

  async findById(id: string): Promise<Player | null> {
    return this.players.get(id) || null;
  }

  async findByUsername(username: string): Promise<Player | null> {
    for (const player of this.players.values()) {
      if (player.username === username) {
        return player;
      }
    }
    return null;
  }

  async update(id: string, updates: Partial<Player>): Promise<Player | null> {
    const player = this.players.get(id);
    if (!player) return null;

    // Apply updates
    Object.assign(player, updates);
    this.players.set(id, player);
    return player;
  }

  async create(playerData: Omit<Player, 'id'>): Promise<Player> {
    const player = { ...playerData, id: 'test-player-id' } as Player;
    this.players.set(player.id, player);
    return player;
  }

  async delete(id: string): Promise<void> {
    this.players.delete(id);
  }

  // Helper method for tests
  setPlayer(player: Player): void {
    this.players.set(player.id, player);
  }

  clear(): void {
    this.players.clear();
  }
}

describe('PlayerService', () => {
  let playerService: PlayerService;
  let mockRepository: MockPlayerRepository;
  let testPlayer: Player;

  beforeEach(() => {
    mockRepository = new MockPlayerRepository();
    playerService = new PlayerService(mockRepository);
    
    // Create a test player
    testPlayer = PlayerFactory.createNewPlayer('testuser');
    testPlayer.id = 'test-player-id';
    mockRepository.setPlayer(testPlayer);
  });

  describe('getPlayer', () => {
    it('should return player when found', async () => {
      const result = await playerService.getPlayer('test-player-id');
      expect(result).toBeDefined();
      expect(result?.username).toBe('testuser');
    });

    it('should return null when player not found', async () => {
      const result = await playerService.getPlayer('non-existent-id');
      expect(result).toBeNull();
    });
  });

  describe('createPlayer', () => {
    it('should create a new player with valid username', async () => {
      const result = await playerService.createPlayer('newuser');
      expect(result).toBeDefined();
      expect(result.username).toBe('newuser');
      expect(result.skills.size).toBeGreaterThan(0);
      expect(result.currency.coins).toBe(GAME_CONSTANTS.STARTING_COINS);
    });

    it('should throw error for invalid username', async () => {
      await expect(playerService.createPlayer('ab')).rejects.toThrow('Invalid username format');
    });
  });

  describe('addExperience', () => {
    it('should add experience and level up when threshold is reached', async () => {
      const initialLevel = testPlayer.skills.get(SkillType.MINING)!.level;
      const experienceToAdd = 1000;

      const result = await playerService.addExperience('test-player-id', SkillType.MINING, experienceToAdd);

      expect(result.previousLevel).toBe(initialLevel);
      expect(result.newLevel).toBeGreaterThan(initialLevel);
      expect(result.leveledUp).toBe(true);
      
      const updatedPlayer = await playerService.getPlayer('test-player-id');
      const skillData = updatedPlayer!.skills.get(SkillType.MINING)!;
      expect(skillData.experience).toBeGreaterThan(0);
      expect(skillData.level).toBe(result.newLevel);
    });

    it('should add experience without leveling up when threshold not reached', async () => {
      const initialLevel = testPlayer.skills.get(SkillType.MINING)!.level;
      const experienceToAdd = 50;

      const result = await playerService.addExperience('test-player-id', SkillType.MINING, experienceToAdd);

      expect(result.previousLevel).toBe(initialLevel);
      expect(result.newLevel).toBe(initialLevel);
      expect(result.leveledUp).toBe(false);
    });

    it('should unlock perks when reaching required levels', async () => {
      // Set player to level 9 and add enough experience to reach level 10
      const skillData = testPlayer.skills.get(SkillType.MINING)!;
      skillData.level = 9;
      skillData.experience = 30600; // Experience for level 9
      mockRepository.setPlayer(testPlayer);

      const result = await playerService.addExperience('test-player-id', SkillType.MINING, 11000); // Enough to reach level 10

      expect(result.leveledUp).toBe(true);
      expect(result.newLevel).toBeGreaterThanOrEqual(10);
      expect(result.newPerksUnlocked.length).toBeGreaterThan(0);
      
      const updatedPlayer = await playerService.getPlayer('test-player-id');
      const updatedSkillData = updatedPlayer!.skills.get(SkillType.MINING)!;
      expect(updatedSkillData.unlockedPerks.length).toBeGreaterThan(0);
    });

    it('should apply experience multipliers from prestige', async () => {
      // Set player to have prestige
      const skillData = testPlayer.skills.get(SkillType.MINING)!;
      skillData.prestige = 1;
      mockRepository.setPlayer(testPlayer);

      const baseExperience = 100;
      const expectedMultiplier = GAME_CONSTANTS.BASE_EXPERIENCE_MULTIPLIER + 
                                (1 * GAME_CONSTANTS.PRESTIGE_EXPERIENCE_BONUS);
      
      await playerService.addExperience('test-player-id', SkillType.MINING, baseExperience);
      
      const updatedPlayer = await playerService.getPlayer('test-player-id');
      const updatedSkillData = updatedPlayer!.skills.get(SkillType.MINING)!;
      expect(updatedSkillData.experience).toBe(Math.floor(baseExperience * expectedMultiplier));
    });

    it('should throw error when player not found', async () => {
      await expect(playerService.addExperience('non-existent-id', SkillType.MINING, 100))
        .rejects.toThrow('Player with ID non-existent-id not found');
    });
  });

  describe('addItemToInventory', () => {
    it('should add item to inventory successfully', async () => {
      const item: ItemStack = { itemId: 'test-item', quantity: 5 };
      const result = await playerService.addItemToInventory('test-player-id', item);

      expect(result).toBe(true);
      
      const updatedPlayer = await playerService.getPlayer('test-player-id');
      const hasItem = updatedPlayer!.inventory.some(invItem => 
        invItem.itemId === 'test-item' && invItem.quantity === 5
      );
      expect(hasItem).toBe(true);
    });

    it('should stack items with same ID', async () => {
      const item1: ItemStack = { itemId: 'stackable-item', quantity: 10 };
      const item2: ItemStack = { itemId: 'stackable-item', quantity: 15 };

      await playerService.addItemToInventory('test-player-id', item1);
      await playerService.addItemToInventory('test-player-id', item2);

      const updatedPlayer = await playerService.getPlayer('test-player-id');
      const stackedItem = updatedPlayer!.inventory.find(item => item.itemId === 'stackable-item');
      expect(stackedItem?.quantity).toBe(25);
    });

    it('should fail when inventory is full', async () => {
      // Fill inventory to max capacity
      const maxItems = GAME_CONSTANTS.MAX_INVENTORY_SIZE;
      for (let i = 0; i < maxItems; i++) {
        testPlayer.inventory.push({ itemId: `item-${i}`, quantity: 1 });
      }
      mockRepository.setPlayer(testPlayer);

      const item: ItemStack = { itemId: 'overflow-item', quantity: 1 };
      const result = await playerService.addItemToInventory('test-player-id', item);

      expect(result).toBe(false);
    });

    it('should throw error when player not found', async () => {
      const item: ItemStack = { itemId: 'test-item', quantity: 1 };
      await expect(playerService.addItemToInventory('non-existent-id', item))
        .rejects.toThrow('Player with ID non-existent-id not found');
    });
  });

  describe('removeItemFromInventory', () => {
    beforeEach(() => {
      // Add some items to inventory for testing
      testPlayer.inventory.push(
        { itemId: 'test-item-1', quantity: 10 },
        { itemId: 'test-item-2', quantity: 5 }
      );
      mockRepository.setPlayer(testPlayer);
    });

    it('should remove items from inventory successfully', async () => {
      const result = await playerService.removeItemFromInventory('test-player-id', 'test-item-1', 3);

      expect(result).toBe(true);
      
      const updatedPlayer = await playerService.getPlayer('test-player-id');
      const item = updatedPlayer!.inventory.find(item => item.itemId === 'test-item-1');
      expect(item?.quantity).toBe(7);
    });

    it('should remove entire stack when quantity matches', async () => {
      const result = await playerService.removeItemFromInventory('test-player-id', 'test-item-2', 5);

      expect(result).toBe(true);
      
      const updatedPlayer = await playerService.getPlayer('test-player-id');
      const item = updatedPlayer!.inventory.find(item => item.itemId === 'test-item-2');
      expect(item).toBeUndefined();
    });

    it('should fail when not enough items available', async () => {
      const result = await playerService.removeItemFromInventory('test-player-id', 'test-item-1', 15);

      expect(result).toBe(false);
      
      // Inventory should remain unchanged
      const updatedPlayer = await playerService.getPlayer('test-player-id');
      const item = updatedPlayer!.inventory.find(item => item.itemId === 'test-item-1');
      expect(item?.quantity).toBe(10);
    });

    it('should fail when item not found', async () => {
      const result = await playerService.removeItemFromInventory('test-player-id', 'non-existent-item', 1);

      expect(result).toBe(false);
    });

    it('should throw error when player not found', async () => {
      await expect(playerService.removeItemFromInventory('non-existent-id', 'test-item', 1))
        .rejects.toThrow('Player with ID non-existent-id not found');
    });
  });

  describe('getSkillLevel', () => {
    it('should return correct skill level', async () => {
      const skillData = testPlayer.skills.get(SkillType.MINING)!;
      skillData.level = 25;
      mockRepository.setPlayer(testPlayer);

      const level = await playerService.getSkillLevel('test-player-id', SkillType.MINING);
      expect(level).toBe(25);
    });

    it('should return 1 for non-existent skill', async () => {
      testPlayer.skills.delete(SkillType.MINING);
      mockRepository.setPlayer(testPlayer);

      const level = await playerService.getSkillLevel('test-player-id', SkillType.MINING);
      expect(level).toBe(1);
    });

    it('should throw error when player not found', async () => {
      await expect(playerService.getSkillLevel('non-existent-id', SkillType.MINING))
        .rejects.toThrow('Player with ID non-existent-id not found');
    });
  });

  describe('getActivePerks', () => {
    it('should return active perks for skill', async () => {
      const skillData = testPlayer.skills.get(SkillType.MINING)!;
      skillData.level = 25;
      skillData.unlockedPerks = ['mining_efficiency_1', 'mining_experience_1'];
      mockRepository.setPlayer(testPlayer);

      const perks = await playerService.getActivePerks('test-player-id', SkillType.MINING);
      expect(perks.length).toBeGreaterThan(0);
      expect(perks.some(perk => perk.id === 'mining_efficiency_1')).toBe(true);
    });

    it('should return empty array when no perks unlocked', async () => {
      const skillData = testPlayer.skills.get(SkillType.MINING)!;
      skillData.level = 5;
      skillData.unlockedPerks = [];
      mockRepository.setPlayer(testPlayer);

      const perks = await playerService.getActivePerks('test-player-id', SkillType.MINING);
      expect(perks).toEqual([]);
    });

    it('should throw error when player not found', async () => {
      await expect(playerService.getActivePerks('non-existent-id', SkillType.MINING))
        .rejects.toThrow('Player with ID non-existent-id not found');
    });
  });

  describe('prestigeSkill', () => {
    it('should prestige skill when at max level', async () => {
      const skillData = testPlayer.skills.get(SkillType.MINING)!;
      skillData.level = GAME_CONSTANTS.MAX_SKILL_LEVEL;
      skillData.experience = 1000000;
      skillData.prestige = 0;
      mockRepository.setPlayer(testPlayer);

      const result = await playerService.prestigeSkill('test-player-id', SkillType.MINING);
      expect(result).toBe(true);

      const updatedPlayer = await playerService.getPlayer('test-player-id');
      const updatedSkillData = updatedPlayer!.skills.get(SkillType.MINING)!;
      expect(updatedSkillData.level).toBe(1);
      expect(updatedSkillData.experience).toBe(0);
      expect(updatedSkillData.prestige).toBe(1);
      expect(updatedSkillData.unlockedPerks).toEqual([]);
    });

    it('should fail when not at max level', async () => {
      const skillData = testPlayer.skills.get(SkillType.MINING)!;
      skillData.level = 50;
      mockRepository.setPlayer(testPlayer);

      const result = await playerService.prestigeSkill('test-player-id', SkillType.MINING);
      expect(result).toBe(false);
    });

    it('should fail when at max prestige', async () => {
      const skillData = testPlayer.skills.get(SkillType.MINING)!;
      skillData.level = GAME_CONSTANTS.MAX_SKILL_LEVEL;
      skillData.prestige = GAME_CONSTANTS.MAX_PRESTIGE_LEVEL;
      mockRepository.setPlayer(testPlayer);

      const result = await playerService.prestigeSkill('test-player-id', SkillType.MINING);
      expect(result).toBe(false);
    });

    it('should throw error when player not found', async () => {
      await expect(playerService.prestigeSkill('non-existent-id', SkillType.MINING))
        .rejects.toThrow('Player with ID non-existent-id not found');
    });
  });

  describe('equipItem', () => {
    beforeEach(() => {
      testPlayer.inventory.push({ itemId: 'iron-sword', quantity: 1 });
      mockRepository.setPlayer(testPlayer);
    });

    it('should equip item from inventory', async () => {
      const result = await playerService.equipItem('test-player-id', 'iron-sword', 'weapon');
      expect(result).toBe(true);

      const updatedPlayer = await playerService.getPlayer('test-player-id');
      expect(updatedPlayer!.equipment.weapon?.itemId).toBe('iron-sword');
      
      // Item should be removed from inventory
      const hasItemInInventory = updatedPlayer!.inventory.some(item => item.itemId === 'iron-sword');
      expect(hasItemInInventory).toBe(false);
    });

    it('should swap equipped items', async () => {
      // First equip an item
      testPlayer.equipment.weapon = { itemId: 'wooden-sword', quantity: 1 };
      mockRepository.setPlayer(testPlayer);

      const result = await playerService.equipItem('test-player-id', 'iron-sword', 'weapon');
      expect(result).toBe(true);

      const updatedPlayer = await playerService.getPlayer('test-player-id');
      expect(updatedPlayer!.equipment.weapon?.itemId).toBe('iron-sword');
      
      // Old weapon should be back in inventory
      const hasOldWeapon = updatedPlayer!.inventory.some(item => item.itemId === 'wooden-sword');
      expect(hasOldWeapon).toBe(true);
    });

    it('should fail when item not in inventory', async () => {
      const result = await playerService.equipItem('test-player-id', 'non-existent-item', 'weapon');
      expect(result).toBe(false);
    });

    it('should throw error when player not found', async () => {
      await expect(playerService.equipItem('non-existent-id', 'iron-sword', 'weapon'))
        .rejects.toThrow('Player with ID non-existent-id not found');
    });
  });

  describe('unequipItem', () => {
    beforeEach(() => {
      testPlayer.equipment.weapon = { itemId: 'iron-sword', quantity: 1 };
      mockRepository.setPlayer(testPlayer);
    });

    it('should unequip item to inventory', async () => {
      const result = await playerService.unequipItem('test-player-id', 'weapon');
      expect(result).toBe(true);

      const updatedPlayer = await playerService.getPlayer('test-player-id');
      expect(updatedPlayer!.equipment.weapon).toBeUndefined();
      
      // Item should be in inventory
      const hasItemInInventory = updatedPlayer!.inventory.some(item => item.itemId === 'iron-sword');
      expect(hasItemInInventory).toBe(true);
    });

    it('should fail when no item equipped in slot', async () => {
      const result = await playerService.unequipItem('test-player-id', 'helmet');
      expect(result).toBe(false);
    });

    it('should fail when inventory is full', async () => {
      // Fill inventory
      for (let i = 0; i < GAME_CONSTANTS.MAX_INVENTORY_SIZE; i++) {
        testPlayer.inventory.push({ itemId: `item-${i}`, quantity: 1 });
      }
      mockRepository.setPlayer(testPlayer);

      const result = await playerService.unequipItem('test-player-id', 'weapon');
      expect(result).toBe(false);
      
      // Item should still be equipped
      const updatedPlayer = await playerService.getPlayer('test-player-id');
      expect(updatedPlayer!.equipment.weapon?.itemId).toBe('iron-sword');
    });

    it('should throw error when player not found', async () => {
      await expect(playerService.unequipItem('non-existent-id', 'weapon'))
        .rejects.toThrow('Player with ID non-existent-id not found');
    });
  });

  describe('getInventoryValue', () => {
    beforeEach(() => {
      testPlayer.inventory = [
        { itemId: 'common-item', quantity: 10 },
        { itemId: 'rare-item', quantity: 2 },
        { itemId: 'legendary-weapon', quantity: 1 }
      ];
      mockRepository.setPlayer(testPlayer);
    });

    it('should calculate total inventory value', async () => {
      const value = await playerService.getInventoryValue('test-player-id');
      
      // Based on the getItemBaseValue logic:
      // common-item: 10 * 10 = 100
      // rare-item: 2 * 100 = 200  
      // legendary-weapon: 1 * 2000 = 2000
      // Total: 2300
      expect(value).toBe(2300);
    });

    it('should return 0 for empty inventory', async () => {
      testPlayer.inventory = [];
      mockRepository.setPlayer(testPlayer);

      const value = await playerService.getInventoryValue('test-player-id');
      expect(value).toBe(0);
    });

    it('should throw error when player not found', async () => {
      await expect(playerService.getInventoryValue('non-existent-id'))
        .rejects.toThrow('Player with ID non-existent-id not found');
    });
  });

  describe('updatePlayer', () => {
    it('should update player data', async () => {
      testPlayer.username = 'updated-username';
      await playerService.updatePlayer(testPlayer);

      const updatedPlayer = await playerService.getPlayer('test-player-id');
      expect(updatedPlayer?.username).toBe('updated-username');
    });
  });
});