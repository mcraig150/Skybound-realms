import { ItemStack } from './Item';
import { Minion } from './Minion';
import { SkillType, SkillData } from './Skill';
import { Utils } from '../shared/utils';
import { GAME_CONSTANTS } from '../shared/constants';

// Re-export SkillType for convenience
export { SkillType } from './Skill';

export interface Player {
  id: string;
  username: string;
  islandId: string;
  skills: Map<SkillType, SkillData>;
  inventory: ItemStack[];
  equipment: EquipmentSlots;
  currency: CurrencyAmounts;
  minions: Minion[];
  guildId?: string;
  friends: string[];
  settings: PlayerSettings;
  lastLogin: Date;
  // Authentication fields (optional for backward compatibility)
  email?: string;
  passwordHash?: string;
  createdAt?: Date;
}



export interface CurrencyAmounts {
  coins: number;
  dungeonTokens: number;
  eventCurrency: number;
  guildPoints: number;
}

export interface PlayerSettings {
  chatEnabled: boolean;
  tradeRequestsEnabled: boolean;
  islandVisitsEnabled: boolean;
  notifications: NotificationSettings;
}

export interface NotificationSettings {
  minionAlerts: boolean;
  tradeAlerts: boolean;
  guildAlerts: boolean;
  friendAlerts: boolean;
}

export interface EquipmentSlots {
  helmet?: ItemStack;
  chestplate?: ItemStack;
  leggings?: ItemStack;
  boots?: ItemStack;
  weapon?: ItemStack;
  shield?: ItemStack;
  accessory1?: ItemStack;
  accessory2?: ItemStack;
  pet?: ItemStack;
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

export class PlayerValidator {
  /**
   * Validate a complete player object
   */
  static validatePlayer(player: Player): ValidationResult {
    const errors: string[] = [];

    // Validate basic fields
    if (!player.id || typeof player.id !== 'string') {
      errors.push('Player ID is required and must be a string');
    }

    if (!Utils.isValidUsername(player.username)) {
      errors.push('Username must be 3-16 characters and contain only letters, numbers, and underscores');
    }

    if (!player.islandId || typeof player.islandId !== 'string') {
      errors.push('Island ID is required and must be a string');
    }

    // Validate skills
    const skillValidation = this.validateSkills(player.skills);
    if (!skillValidation.isValid) {
      errors.push(...skillValidation.errors);
    }

    // Validate inventory
    const inventoryValidation = this.validateInventory(player.inventory);
    if (!inventoryValidation.isValid) {
      errors.push(...inventoryValidation.errors);
    }

    // Validate currency
    const currencyValidation = this.validateCurrency(player.currency);
    if (!currencyValidation.isValid) {
      errors.push(...currencyValidation.errors);
    }

    // Validate minions
    if (player.minions.length > GAME_CONSTANTS.MAX_MINIONS_PER_PLAYER) {
      errors.push(`Player cannot have more than ${GAME_CONSTANTS.MAX_MINIONS_PER_PLAYER} minions`);
    }

    // Validate friends list
    if (player.friends.length > GAME_CONSTANTS.MAX_FRIENDS) {
      errors.push(`Player cannot have more than ${GAME_CONSTANTS.MAX_FRIENDS} friends`);
    }

    // Validate lastLogin
    if (!(player.lastLogin instanceof Date) || isNaN(player.lastLogin.getTime())) {
      errors.push('Last login must be a valid Date object');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Validate player skills
   */
  static validateSkills(skills: Map<SkillType, SkillData>): ValidationResult {
    const errors: string[] = [];

    // Check if all required skills are present
    const requiredSkills = Object.values(SkillType);
    for (const skillType of requiredSkills) {
      if (!skills.has(skillType)) {
        errors.push(`Missing required skill: ${skillType}`);
        continue;
      }

      const skillData = skills.get(skillType)!;
      const skillValidation = this.validateSkillData(skillType, skillData);
      if (!skillValidation.isValid) {
        errors.push(...skillValidation.errors);
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Validate individual skill data
   */
  static validateSkillData(skillType: SkillType, skillData: SkillData): ValidationResult {
    const errors: string[] = [];

    if (skillData.experience < 0) {
      errors.push(`${skillType} experience cannot be negative`);
    }

    if (skillData.level < 1 || skillData.level > GAME_CONSTANTS.MAX_SKILL_LEVEL) {
      errors.push(`${skillType} level must be between 1 and ${GAME_CONSTANTS.MAX_SKILL_LEVEL}`);
    }

    if (skillData.prestige < 0 || skillData.prestige > GAME_CONSTANTS.MAX_PRESTIGE_LEVEL) {
      errors.push(`${skillType} prestige must be between 0 and ${GAME_CONSTANTS.MAX_PRESTIGE_LEVEL}`);
    }

    // Validate that level matches experience
    const expectedLevel = Utils.getLevelFromExperience(skillData.experience);
    if (skillData.level !== expectedLevel) {
      errors.push(`${skillType} level (${skillData.level}) does not match experience (${skillData.experience})`);
    }

    if (!Array.isArray(skillData.unlockedPerks)) {
      errors.push(`${skillType} unlockedPerks must be an array`);
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Validate player inventory
   */
  static validateInventory(inventory: ItemStack[]): ValidationResult {
    const errors: string[] = [];

    if (!Array.isArray(inventory)) {
      errors.push('Inventory must be an array');
      return { isValid: false, errors };
    }

    if (inventory.length > GAME_CONSTANTS.MAX_INVENTORY_SIZE) {
      errors.push(`Inventory cannot exceed ${GAME_CONSTANTS.MAX_INVENTORY_SIZE} slots`);
    }

    // Validate each item stack
    inventory.forEach((item, index) => {
      if (!item.itemId || typeof item.itemId !== 'string') {
        errors.push(`Inventory slot ${index}: Item ID is required and must be a string`);
      }

      if (typeof item.quantity !== 'number' || item.quantity <= 0) {
        errors.push(`Inventory slot ${index}: Quantity must be a positive number`);
      }
    });

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Validate player currency
   */
  static validateCurrency(currency: CurrencyAmounts): ValidationResult {
    const errors: string[] = [];

    const currencyFields = ['coins', 'dungeonTokens', 'eventCurrency', 'guildPoints'] as const;
    
    for (const field of currencyFields) {
      if (typeof currency[field] !== 'number' || currency[field] < 0) {
        errors.push(`${field} must be a non-negative number`);
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }
}

export class PlayerFactory {
  /**
   * Create a new player with default values
   */
  static createNewPlayer(username: string): Player {
    if (!Utils.isValidUsername(username)) {
      throw new Error('Invalid username format');
    }

    const playerId = Utils.generateId();
    const islandId = Utils.generateId();

    // Initialize all skills at level 1 with 0 experience
    const skills = new Map<SkillType, SkillData>();
    Object.values(SkillType).forEach(skillType => {
      skills.set(skillType, {
        experience: 0,
        level: 1,
        prestige: 0,
        unlockedPerks: []
      });
    });

    return {
      id: playerId,
      username,
      islandId,
      skills,
      inventory: [],
      equipment: {},
      currency: {
        coins: GAME_CONSTANTS.STARTING_COINS,
        dungeonTokens: 0,
        eventCurrency: 0,
        guildPoints: 0
      },
      minions: [],
      friends: [],
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
      lastLogin: new Date(),
      createdAt: new Date()
    };
  }

  /**
   * Serialize player data for storage
   */
  static serializePlayer(player: Player): any {
    return {
      ...player,
      skills: Object.fromEntries(player.skills),
      lastLogin: player.lastLogin.toISOString()
    };
  }

  /**
   * Deserialize player data from storage
   */
  static deserializePlayer(data: any): Player {
    const skills = new Map<SkillType, SkillData>();
    
    // Handle both Map and Object formats for skills
    if (data.skills instanceof Map) {
      data.skills.forEach((value: SkillData, key: SkillType) => {
        skills.set(key, value);
      });
    } else if (typeof data.skills === 'object') {
      Object.entries(data.skills).forEach(([key, value]) => {
        skills.set(key as SkillType, value as SkillData);
      });
    }

    return {
      ...data,
      skills,
      lastLogin: new Date(data.lastLogin)
    };
  }
}