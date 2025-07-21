import { Player, SkillType, PlayerFactory, EquipmentSlots } from '../models/Player';
import { SkillLevelResult, SkillData, Perk, PerkEffectType } from '../models/Skill';
import { ItemStack, InventoryManager, InventoryOperationResult } from '../models/Item';
import { Utils } from '../shared/utils';
import { GAME_CONSTANTS } from '../shared/constants';

export interface PlayerRepository {
  findById(id: string): Promise<Player | null>;
  findByUsername(username: string): Promise<Player | null>;
  update(id: string, updates: Partial<Player>): Promise<Player | null>;
  create(playerData: Omit<Player, 'id'>): Promise<Player>;
  delete(id: string): Promise<void>;
}

export class PlayerService {
  constructor(private playerRepository?: PlayerRepository) {
    // For now, we'll create a mock repository if none provided
    if (!this.playerRepository) {
      this.playerRepository = new MockPlayerRepository();
    }
  }

  /**
   * Get a player by ID
   */
  async getPlayer(playerId: string): Promise<Player | null> {
    return await this.playerRepository!.findById(playerId);
  }

  /**
   * Create a new player (simple version)
   */
  async createPlayerSimple(username: string): Promise<Player> {
    const newPlayer = PlayerFactory.createNewPlayer(username);
    return await this.playerRepository!.create(newPlayer);
  }

  /**
   * Update player data (full player object)
   */
  async updatePlayerFull(player: Player): Promise<void> {
    await this.playerRepository!.update(player.id, player);
  }

  /**
   * Add experience to a player's skill and handle level-ups
   */
  async addExperience(playerId: string, skill: SkillType, amount: number): Promise<SkillLevelResult> {
    const player = await this.playerRepository!.findById(playerId);
    if (!player) {
      throw new Error(`Player with ID ${playerId} not found`);
    }

    const skillData = player.skills.get(skill);
    if (!skillData) {
      throw new Error(`Skill ${skill} not found for player ${playerId}`);
    }

    const previousLevel = skillData.level;
    const previousExperience = skillData.experience;

    // Apply experience multipliers
    const multipliedAmount = this.calculateExperienceWithMultipliers(player, skill, amount);
    
    // Add experience
    skillData.experience += multipliedAmount;

    // Calculate new level
    const newLevel = Utils.getLevelFromExperience(skillData.experience);
    const leveledUp = newLevel > previousLevel;

    // Update level if it changed
    if (leveledUp) {
      skillData.level = newLevel;
    }

    // Check for new perks unlocked
    const newPerksUnlocked = this.checkForNewPerks(skill, previousLevel, newLevel, skillData.prestige);
    
    // Add newly unlocked perks to player's unlocked perks
    for (const perk of newPerksUnlocked) {
      if (!skillData.unlockedPerks.includes(perk.id)) {
        skillData.unlockedPerks.push(perk.id);
      }
    }

    // Update player in database
    await this.playerRepository!.update(playerId, { skills: player.skills });

    return {
      previousLevel,
      newLevel,
      leveledUp,
      newPerksUnlocked
    };
  }

  /**
   * Add item to player's inventory
   */
  async addItemToInventory(playerId: string, item: ItemStack): Promise<boolean> {
    const player = await this.playerRepository!.findById(playerId);
    if (!player) {
      throw new Error(`Player with ID ${playerId} not found`);
    }

    const result = InventoryManager.addItems(player.inventory, item, GAME_CONSTANTS.MAX_INVENTORY_SIZE);
    
    if (result.success) {
      await this.playerRepository!.update(playerId, { inventory: player.inventory });
      return true;
    }

    return false;
  }

  /**
   * Remove item from player's inventory
   */
  async removeItemFromInventory(playerId: string, itemId: string, quantity: number): Promise<boolean> {
    const player = await this.playerRepository!.findById(playerId);
    if (!player) {
      throw new Error(`Player with ID ${playerId} not found`);
    }

    const itemToRemove: ItemStack = { itemId, quantity };
    const result = InventoryManager.removeItems(player.inventory, itemToRemove);
    
    if (result.success) {
      await this.playerRepository!.update(playerId, { inventory: player.inventory });
      return true;
    }

    return false;
  }

  /**
   * Get player's skill level
   */
  async getSkillLevel(playerId: string, skill: SkillType): Promise<number> {
    const player = await this.playerRepository!.findById(playerId);
    if (!player) {
      throw new Error(`Player with ID ${playerId} not found`);
    }

    const skillData = player.skills.get(skill);
    return skillData ? skillData.level : 1;
  }

  /**
   * Get player's active perks for a skill
   */
  async getActivePerks(playerId: string, skill: SkillType): Promise<Perk[]> {
    const player = await this.playerRepository!.findById(playerId);
    if (!player) {
      throw new Error(`Player with ID ${playerId} not found`);
    }

    const skillData = player.skills.get(skill);
    if (!skillData) {
      return [];
    }

    return this.getPerksForSkill(skill, skillData.level, skillData.prestige)
      .filter(perk => skillData.unlockedPerks.includes(perk.id));
  }

  /**
   * Prestige a skill (reset level but gain permanent bonuses)
   */
  async prestigeSkill(playerId: string, skill: SkillType): Promise<boolean> {
    const player = await this.playerRepository!.findById(playerId);
    if (!player) {
      throw new Error(`Player with ID ${playerId} not found`);
    }

    const skillData = player.skills.get(skill);
    if (!skillData) {
      throw new Error(`Skill ${skill} not found for player ${playerId}`);
    }

    // Check if player can prestige (must be max level)
    if (skillData.level < GAME_CONSTANTS.MAX_SKILL_LEVEL) {
      return false;
    }

    // Check if player hasn't reached max prestige
    if (skillData.prestige >= GAME_CONSTANTS.MAX_PRESTIGE_LEVEL) {
      return false;
    }

    // Reset skill but increase prestige
    skillData.experience = 0;
    skillData.level = 1;
    skillData.prestige += 1;
    skillData.unlockedPerks = []; // Reset perks, they'll be re-unlocked as player levels up

    await this.playerRepository!.update(playerId, { skills: player.skills });
    return true;
  }

  /**
   * Equip an item from inventory
   */
  async equipItem(playerId: string, itemId: string, slot: keyof EquipmentSlots): Promise<boolean> {
    const player = await this.playerRepository!.findById(playerId);
    if (!player) {
      throw new Error(`Player with ID ${playerId} not found`);
    }

    // Find item in inventory
    const itemIndex = player.inventory.findIndex(item => item.itemId === itemId);
    if (itemIndex === -1) {
      return false;
    }

    const itemToEquip = player.inventory[itemIndex];
    if (!itemToEquip) {
      return false;
    }
    
    // Remove item from inventory
    if (itemToEquip.quantity === 1) {
      player.inventory.splice(itemIndex, 1);
    } else {
      itemToEquip.quantity -= 1;
    }

    // If there's already an item equipped in this slot, move it to inventory
    const currentlyEquipped = player.equipment[slot];
    if (currentlyEquipped) {
      const addResult = InventoryManager.addItems(player.inventory, currentlyEquipped, GAME_CONSTANTS.MAX_INVENTORY_SIZE);
      if (!addResult.success) {
        // If we can't add the currently equipped item back to inventory, abort the operation
        if (itemToEquip.quantity === 0) {
          player.inventory.push({ itemId, quantity: 1, metadata: itemToEquip.metadata });
        } else {
          itemToEquip.quantity += 1;
        }
        return false;
      }
    }

    // Equip the new item
    player.equipment[slot] = { itemId, quantity: 1, metadata: itemToEquip.metadata };

    await this.playerRepository!.update(playerId, { 
      inventory: player.inventory, 
      equipment: player.equipment 
    });

    return true;
  }

  /**
   * Unequip an item to inventory
   */
  async unequipItem(playerId: string, slot: keyof EquipmentSlots): Promise<boolean> {
    const player = await this.playerRepository!.findById(playerId);
    if (!player) {
      throw new Error(`Player with ID ${playerId} not found`);
    }

    const equippedItem = player.equipment[slot];
    if (!equippedItem) {
      return false;
    }

    // Try to add item to inventory
    const addResult = InventoryManager.addItems(player.inventory, equippedItem, GAME_CONSTANTS.MAX_INVENTORY_SIZE);
    if (!addResult.success) {
      return false;
    }

    // Remove from equipment
    delete player.equipment[slot];

    await this.playerRepository!.update(playerId, { 
      inventory: player.inventory, 
      equipment: player.equipment 
    });

    return true;
  }

  /**
   * Get player's total inventory value (for display purposes)
   */
  async getInventoryValue(playerId: string): Promise<number> {
    const player = await this.playerRepository!.findById(playerId);
    if (!player) {
      throw new Error(`Player with ID ${playerId} not found`);
    }

    // This would typically calculate based on market prices
    // For now, return a simple calculation
    return player.inventory.reduce((total, item) => {
      return total + (item.quantity * this.getItemBaseValue(item.itemId));
    }, 0);
  }

  /**
   * Calculate experience with multipliers from perks and prestige
   */
  private calculateExperienceWithMultipliers(player: Player, skill: SkillType, baseAmount: number): number {
    let multiplier = GAME_CONSTANTS.BASE_EXPERIENCE_MULTIPLIER;

    const skillData = player.skills.get(skill);
    if (skillData) {
      // Add prestige bonus
      multiplier += skillData.prestige * GAME_CONSTANTS.PRESTIGE_EXPERIENCE_BONUS;

      // Add perk bonuses
      const activePerks = this.getPerksForSkill(skill, skillData.level, skillData.prestige)
        .filter(perk => skillData.unlockedPerks.includes(perk.id));

      for (const perk of activePerks) {
        const expMultiplierEffect = perk.effects.find(effect => effect.type === PerkEffectType.EXPERIENCE_MULTIPLIER);
        if (expMultiplierEffect) {
          multiplier += expMultiplierEffect.value;
        }
      }
    }

    return Math.floor(baseAmount * multiplier);
  }

  /**
   * Check for newly unlocked perks
   */
  private checkForNewPerks(skill: SkillType, previousLevel: number, newLevel: number, prestige: number): Perk[] {
    const allPerks = this.getPerksForSkill(skill, newLevel, prestige);
    return allPerks.filter(perk => 
      perk.requiredLevel > previousLevel && 
      perk.requiredLevel <= newLevel &&
      perk.requiredPrestige <= prestige
    );
  }

  /**
   * Get all available perks for a skill at given level and prestige
   */
  private getPerksForSkill(skill: SkillType, level: number, prestige: number): Perk[] {
    // This would typically come from a database or configuration file
    // For now, return some example perks
    const perks: Perk[] = [];

    // Add level-based perks
    if (level >= 10) {
      perks.push({
        id: `${skill}_efficiency_1`,
        name: `${skill} Efficiency I`,
        description: `+10% efficiency for ${skill} activities`,
        skillType: skill,
        requiredLevel: 10,
        requiredPrestige: 0,
        effects: [
          {
            type: PerkEffectType.RESOURCE_YIELD,
            value: 0.1,
            description: '+10% resource yield'
          }
        ]
      });
    }

    if (level >= 25) {
      perks.push({
        id: `${skill}_experience_1`,
        name: `${skill} Experience I`,
        description: `+5% experience gain for ${skill}`,
        skillType: skill,
        requiredLevel: 25,
        requiredPrestige: 0,
        effects: [
          {
            type: PerkEffectType.EXPERIENCE_MULTIPLIER,
            value: 0.05,
            description: '+5% experience multiplier'
          }
        ]
      });
    }

    if (level >= 50) {
      perks.push({
        id: `${skill}_efficiency_2`,
        name: `${skill} Efficiency II`,
        description: `+20% efficiency for ${skill} activities`,
        skillType: skill,
        requiredLevel: 50,
        requiredPrestige: 0,
        effects: [
          {
            type: PerkEffectType.RESOURCE_YIELD,
            value: 0.2,
            description: '+20% resource yield'
          }
        ]
      });
    }

    // Add prestige-based perks
    if (prestige >= 1 && level >= 1) {
      perks.push({
        id: `${skill}_prestige_1`,
        name: `${skill} Mastery`,
        description: `Prestige bonus: +15% efficiency`,
        skillType: skill,
        requiredLevel: 1,
        requiredPrestige: 1,
        effects: [
          {
            type: PerkEffectType.RESOURCE_YIELD,
            value: 0.15,
            description: '+15% resource yield from prestige'
          }
        ]
      });
    }

    return perks.filter(perk => 
      perk.requiredLevel <= level && 
      perk.requiredPrestige <= prestige
    );
  }

  /**
   * Get player by username
   */
  async getPlayerByUsername(username: string): Promise<Player | null> {
    return await this.playerRepository!.findByUsername(username);
  }

  /**
   * Create player with additional data (for registration)
   */
  async createPlayer(playerData: { username: string; email: string; passwordHash: string }): Promise<Player> {
    const newPlayer = PlayerFactory.createNewPlayer(playerData.username);
    // Add email and password hash to the player data
    const playerWithAuth = {
      ...newPlayer,
      email: playerData.email,
      passwordHash: playerData.passwordHash
    };
    return await this.playerRepository!.create(playerWithAuth);
  }

  /**
   * Update player with partial data
   */
  async updatePlayer(playerId: string, updates: any): Promise<Player | null> {
    return await this.playerRepository!.update(playerId, updates);
  }

  /**
   * Update last login time
   */
  async updateLastLogin(playerId: string): Promise<void> {
    await this.playerRepository!.update(playerId, { lastLogin: new Date() });
  }

  /**
   * Delete player
   */
  async deletePlayer(playerId: string): Promise<void> {
    await this.playerRepository!.delete(playerId);
  }

  /**
   * Get player skills
   */
  async getPlayerSkills(playerId: string): Promise<Map<SkillType, any> | null> {
    const player = await this.playerRepository!.findById(playerId);
    return player ? player.skills : null;
  }

  /**
   * Get player inventory
   */
  async getPlayerInventory(playerId: string): Promise<ItemStack[]> {
    const player = await this.playerRepository!.findById(playerId);
    return player ? player.inventory : [];
  }

  /**
   * Update inventory with action
   */
  async updateInventory(playerId: string, action: string, itemId: string, quantity: number, metadata?: any): Promise<{ success: boolean }> {
    const player = await this.playerRepository!.findById(playerId);
    if (!player) {
      return { success: false };
    }

    switch (action) {
      case 'ADD':
        const addResult = await this.addItemToInventory(playerId, { itemId, quantity, metadata });
        return { success: addResult };
      case 'REMOVE':
        const removeResult = await this.removeItemFromInventory(playerId, itemId, quantity);
        return { success: removeResult };
      default:
        return { success: false };
    }
  }

  /**
   * Get player statistics
   */
  async getPlayerStats(playerId: string): Promise<any> {
    const player = await this.playerRepository!.findById(playerId);
    if (!player) {
      return null;
    }

    return {
      level: Math.max(...Array.from(player.skills.values()).map(skill => skill.level)),
      totalExperience: Array.from(player.skills.values()).reduce((total, skill) => total + skill.experience, 0),
      inventoryValue: await this.getInventoryValue(playerId),
      skillCount: player.skills.size,
      itemCount: player.inventory.reduce((total, item) => total + item.quantity, 0)
    };
  }

  /**
   * Get base value of an item (simplified calculation)
   */
  private getItemBaseValue(itemId: string): number {
    // This would typically come from item definitions
    // For now, return simple values based on item type
    if (itemId.includes('rare')) return 100;
    if (itemId.includes('epic')) return 500;
    if (itemId.includes('legendary')) return 2000;
    if (itemId.includes('weapon') || itemId.includes('armor')) return 50;
    return 10; // Default value for common items
  }
}

// Mock repository for testing
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
    if (!player) {
      return null;
    }
    
    const updatedPlayer = { ...player, ...updates };
    this.players.set(id, updatedPlayer);
    return updatedPlayer;
  }

  async create(playerData: Omit<Player, 'id'>): Promise<Player> {
    const id = Math.random().toString(36).substr(2, 9);
    const player = { ...playerData, id } as Player;
    this.players.set(id, player);
    return player;
  }

  async delete(id: string): Promise<void> {
    this.players.delete(id);
  }
}