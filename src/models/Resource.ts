import { Vector3 } from '../shared/types';
import { ItemStack } from './Item';
import { SkillType } from './Skill';

export enum ResourceNodeType {
  TREE = 'tree',
  ROCK = 'rock',
  CROP = 'crop',
  FLOWER = 'flower',
  MINERAL_VEIN = 'mineral_vein',
  FISHING_SPOT = 'fishing_spot'
}

export enum ResourceNodeState {
  AVAILABLE = 'available',
  DEPLETED = 'depleted',
  REGENERATING = 'regenerating'
}

export interface ResourceNode {
  id: string;
  type: ResourceNodeType;
  position: Vector3;
  islandId: string;
  state: ResourceNodeState;
  maxHarvestCount: number;
  currentHarvestCount: number;
  regenerationTime: number; // in milliseconds
  lastHarvestedAt?: Date;
  regeneratesAt?: Date;
  level: number; // determines quality of resources
  drops: ResourceDrop[];
}

export interface ResourceDrop {
  itemId: string;
  minQuantity: number;
  maxQuantity: number;
  dropChance: number; // 0.0 to 1.0
  requiredSkillLevel?: number;
  experienceReward: number;
  skillType: SkillType;
}

export interface ResourceCollectionResult {
  success: boolean;
  message: string;
  itemsCollected: ItemStack[];
  experienceGained: Map<SkillType, number>;
  nodeState: ResourceNodeState;
  timeUntilRegeneration?: number;
}

export interface ResourceNodeSpawnConfig {
  type: ResourceNodeType;
  spawnChance: number;
  minLevel: number;
  maxLevel: number;
  biomeRestrictions?: string[];
  maxNodesPerChunk: number;
}

export class ResourceNodeFactory {
  private static readonly NODE_CONFIGS: Map<ResourceNodeType, ResourceNodeSpawnConfig> = new Map([
    [ResourceNodeType.TREE, {
      type: ResourceNodeType.TREE,
      spawnChance: 0.3,
      minLevel: 1,
      maxLevel: 10,
      maxNodesPerChunk: 5
    }],
    [ResourceNodeType.ROCK, {
      type: ResourceNodeType.ROCK,
      spawnChance: 0.2,
      minLevel: 1,
      maxLevel: 15,
      maxNodesPerChunk: 3
    }],
    [ResourceNodeType.CROP, {
      type: ResourceNodeType.CROP,
      spawnChance: 0.1,
      minLevel: 1,
      maxLevel: 5,
      maxNodesPerChunk: 2
    }],
    [ResourceNodeType.MINERAL_VEIN, {
      type: ResourceNodeType.MINERAL_VEIN,
      spawnChance: 0.05,
      minLevel: 5,
      maxLevel: 20,
      maxNodesPerChunk: 1
    }]
  ]);

  static createResourceNode(
    type: ResourceNodeType,
    position: Vector3,
    islandId: string,
    level?: number
  ): ResourceNode {
    const config = this.NODE_CONFIGS.get(type);
    if (!config) {
      throw new Error(`Unknown resource node type: ${type}`);
    }

    const nodeLevel = level || this.generateRandomLevel(config.minLevel, config.maxLevel);
    const drops = this.generateDropsForNode(type, nodeLevel);

    return {
      id: this.generateNodeId(type, position),
      type,
      position,
      islandId,
      state: ResourceNodeState.AVAILABLE,
      maxHarvestCount: this.getMaxHarvestCount(type, nodeLevel),
      currentHarvestCount: 0,
      regenerationTime: this.getRegenerationTime(type, nodeLevel),
      level: nodeLevel,
      drops
    };
  }

  private static generateNodeId(type: ResourceNodeType, position: Vector3): string {
    return `${type}_${position.x}_${position.y}_${position.z}_${Date.now()}`;
  }

  private static generateRandomLevel(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  private static getMaxHarvestCount(type: ResourceNodeType, level: number): number {
    const baseCount = {
      [ResourceNodeType.TREE]: 3,
      [ResourceNodeType.ROCK]: 5,
      [ResourceNodeType.CROP]: 1,
      [ResourceNodeType.FLOWER]: 1,
      [ResourceNodeType.MINERAL_VEIN]: 10,
      [ResourceNodeType.FISHING_SPOT]: 20
    };

    return baseCount[type] + Math.floor(level / 3);
  }

  private static getRegenerationTime(type: ResourceNodeType, level: number): number {
    const baseTime = {
      [ResourceNodeType.TREE]: 300000, // 5 minutes
      [ResourceNodeType.ROCK]: 600000, // 10 minutes
      [ResourceNodeType.CROP]: 1800000, // 30 minutes
      [ResourceNodeType.FLOWER]: 900000, // 15 minutes
      [ResourceNodeType.MINERAL_VEIN]: 3600000, // 1 hour
      [ResourceNodeType.FISHING_SPOT]: 60000 // 1 minute
    };

    // Higher level nodes take longer to regenerate but give better rewards
    return baseTime[type] + (level * 30000); // +30 seconds per level
  }

  private static generateDropsForNode(type: ResourceNodeType, level: number): ResourceDrop[] {
    const drops: ResourceDrop[] = [];

    switch (type) {
      case ResourceNodeType.TREE:
        drops.push({
          itemId: 'wood_log',
          minQuantity: 1,
          maxQuantity: 3 + Math.floor(level / 2),
          dropChance: 1.0,
          experienceReward: 10 + level * 2,
          skillType: SkillType.FORAGING
        });
        if (level >= 5) {
          drops.push({
            itemId: 'rare_wood',
            minQuantity: 1,
            maxQuantity: 1,
            dropChance: 0.1 + (level * 0.02),
            experienceReward: 25,
            skillType: SkillType.FORAGING
          });
        }
        break;

      case ResourceNodeType.ROCK:
        drops.push({
          itemId: 'stone',
          minQuantity: 2,
          maxQuantity: 4 + Math.floor(level / 2),
          dropChance: 1.0,
          experienceReward: 8 + level * 2,
          skillType: SkillType.MINING
        });
        if (level >= 3) {
          drops.push({
            itemId: 'iron_ore',
            minQuantity: 1,
            maxQuantity: 2,
            dropChance: 0.3 + (level * 0.05),
            experienceReward: 20,
            skillType: SkillType.MINING
          });
        }
        if (level >= 10) {
          drops.push({
            itemId: 'rare_gem',
            minQuantity: 1,
            maxQuantity: 1,
            dropChance: 0.05 + (level * 0.01),
            experienceReward: 50,
            skillType: SkillType.MINING
          });
        }
        break;

      case ResourceNodeType.CROP:
        drops.push({
          itemId: 'wheat',
          minQuantity: 1,
          maxQuantity: 2 + Math.floor(level / 3),
          dropChance: 1.0,
          experienceReward: 15 + level * 3,
          skillType: SkillType.FARMING
        });
        if (level >= 2) {
          drops.push({
            itemId: 'seeds',
            minQuantity: 1,
            maxQuantity: 1,
            dropChance: 0.5,
            experienceReward: 5,
            skillType: SkillType.FARMING
          });
        }
        break;

      case ResourceNodeType.MINERAL_VEIN:
        drops.push({
          itemId: 'coal',
          minQuantity: 1,
          maxQuantity: 3,
          dropChance: 0.8,
          experienceReward: 12,
          skillType: SkillType.MINING
        });
        drops.push({
          itemId: 'iron_ore',
          minQuantity: 1,
          maxQuantity: 2,
          dropChance: 0.6,
          experienceReward: 20,
          skillType: SkillType.MINING
        });
        if (level >= 10) {
          drops.push({
            itemId: 'gold_ore',
            minQuantity: 1,
            maxQuantity: 1,
            dropChance: 0.2 + (level * 0.02),
            experienceReward: 40,
            skillType: SkillType.MINING
          });
        }
        break;

      default:
        // Default drop for unknown types
        drops.push({
          itemId: 'misc_resource',
          minQuantity: 1,
          maxQuantity: 1,
          dropChance: 1.0,
          experienceReward: 5,
          skillType: SkillType.FORAGING
        });
    }

    return drops;
  }

  static getSpawnConfig(type: ResourceNodeType): ResourceNodeSpawnConfig | undefined {
    return this.NODE_CONFIGS.get(type);
  }

  static getAllSpawnConfigs(): ResourceNodeSpawnConfig[] {
    return Array.from(this.NODE_CONFIGS.values());
  }
}