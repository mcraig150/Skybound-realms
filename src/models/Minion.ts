import { ItemStack, ItemRarity } from './Item';
import { Vector3 } from '../shared/types';

export interface Minion {
  id: string;
  type: MinionType;
  ownerId: string;
  position: Vector3;
  level: number;
  efficiency: number;
  storageCapacity: number;
  collectedResources: ItemStack[];
  isActive: boolean;
  deployedAt: Date;
  lastCollection: Date;
}

export enum MinionType {
  COBBLESTONE = 'cobblestone',
  COAL = 'coal',
  IRON = 'iron',
  GOLD = 'gold',
  DIAMOND = 'diamond',
  WHEAT = 'wheat',
  CARROT = 'carrot',
  POTATO = 'potato',
  SUGAR_CANE = 'sugar_cane',
  MELON = 'melon',
  PUMPKIN = 'pumpkin',
  COCOA = 'cocoa',
  CHICKEN = 'chicken',
  COW = 'cow',
  PIG = 'pig',
  SHEEP = 'sheep',
  FISHING = 'fishing',
  FORAGING = 'foraging'
}

export interface MinionStatus {
  isActive: boolean;
  resourcesCollected: ItemStack[];
  storageCapacity: number;
  efficiency: number;
  timeUntilNextCollection: number;
}

export interface MinionUpgrade {
  id: string;
  name: string;
  description: string;
  cost: ItemStack[];
  effects: MinionUpgradeEffect[];
}

export interface MinionUpgradeEffect {
  type: MinionUpgradeType;
  value: number;
}

export enum MinionUpgradeType {
  SPEED = 'speed',
  STORAGE = 'storage',
  EFFICIENCY = 'efficiency',
  AUTO_SELL = 'auto_sell',
  COMPACTOR = 'compactor'
}

export class MinionEntity implements Minion {
  id: string;
  type: MinionType;
  ownerId: string;
  position: Vector3;
  level: number;
  efficiency: number;
  storageCapacity: number;
  collectedResources: ItemStack[];
  isActive: boolean;
  deployedAt: Date;
  lastCollection: Date;

  constructor(data: Minion) {
    this.id = data.id;
    this.type = data.type;
    this.ownerId = data.ownerId;
    this.position = data.position;
    this.level = data.level;
    this.efficiency = data.efficiency;
    this.storageCapacity = data.storageCapacity;
    this.collectedResources = data.collectedResources;
    this.isActive = data.isActive;
    this.deployedAt = data.deployedAt;
    this.lastCollection = data.lastCollection;
  }

  /**
   * Calculate collection interval based on minion type and efficiency
   */
  getCollectionInterval(): number {
    const baseIntervals: Record<MinionType, number> = {
      [MinionType.COBBLESTONE]: 14000, // 14 seconds
      [MinionType.COAL]: 30000, // 30 seconds
      [MinionType.IRON]: 45000, // 45 seconds
      [MinionType.GOLD]: 60000, // 1 minute
      [MinionType.DIAMOND]: 120000, // 2 minutes
      [MinionType.WHEAT]: 20000, // 20 seconds
      [MinionType.CARROT]: 20000,
      [MinionType.POTATO]: 20000,
      [MinionType.SUGAR_CANE]: 25000,
      [MinionType.MELON]: 35000,
      [MinionType.PUMPKIN]: 35000,
      [MinionType.COCOA]: 40000,
      [MinionType.CHICKEN]: 50000,
      [MinionType.COW]: 60000,
      [MinionType.PIG]: 55000,
      [MinionType.SHEEP]: 50000,
      [MinionType.FISHING]: 45000,
      [MinionType.FORAGING]: 30000
    };

    const baseInterval = baseIntervals[this.type];
    return Math.floor(baseInterval / (1 + this.efficiency / 100));
  }

  /**
   * Check if minion can collect resources (not at storage capacity)
   */
  canCollect(): boolean {
    if (!this.isActive) return false;
    
    const totalItems = this.collectedResources.reduce((sum, stack) => sum + stack.quantity, 0);
    return totalItems < this.storageCapacity;
  }

  /**
   * Process offline collection based on time elapsed
   */
  processOfflineCollection(currentTime: Date): ItemStack[] {
    if (!this.isActive || !this.canCollect()) {
      return [];
    }

    const timeSinceLastCollection = currentTime.getTime() - this.lastCollection.getTime();
    const collectionInterval = this.getCollectionInterval();
    const collectionsToProcess = Math.floor(timeSinceLastCollection / collectionInterval);

    if (collectionsToProcess <= 0) {
      return [];
    }

    const newResources: ItemStack[] = [];
    const resourceType = this.getMinionResourceType();
    
    for (let i = 0; i < collectionsToProcess; i++) {
      if (!this.canCollect()) break;
      
      const resource: ItemStack = {
        itemId: resourceType,
        quantity: 1,
        metadata: {
          rarity: ItemRarity.COMMON,
          enchantments: []
        }
      };
      
      this.addResourceToStorage(resource);
      newResources.push(resource);
    }

    // Update last collection time
    this.lastCollection = new Date(
      this.lastCollection.getTime() + (collectionsToProcess * collectionInterval)
    );

    return newResources;
  }

  /**
   * Get the resource type this minion produces
   */
  private getMinionResourceType(): string {
    const resourceMap: Record<MinionType, string> = {
      [MinionType.COBBLESTONE]: 'cobblestone',
      [MinionType.COAL]: 'coal',
      [MinionType.IRON]: 'iron_ore',
      [MinionType.GOLD]: 'gold_ore',
      [MinionType.DIAMOND]: 'diamond',
      [MinionType.WHEAT]: 'wheat',
      [MinionType.CARROT]: 'carrot',
      [MinionType.POTATO]: 'potato',
      [MinionType.SUGAR_CANE]: 'sugar_cane',
      [MinionType.MELON]: 'melon',
      [MinionType.PUMPKIN]: 'pumpkin',
      [MinionType.COCOA]: 'cocoa_beans',
      [MinionType.CHICKEN]: 'raw_chicken',
      [MinionType.COW]: 'raw_beef',
      [MinionType.PIG]: 'raw_pork',
      [MinionType.SHEEP]: 'wool',
      [MinionType.FISHING]: 'raw_fish',
      [MinionType.FORAGING]: 'oak_log'
    };

    return resourceMap[this.type];
  }

  /**
   * Add resource to minion storage
   */
  private addResourceToStorage(resource: ItemStack): void {
    const existingStack = this.collectedResources.find(
      stack => stack.itemId === resource.itemId
    );

    if (existingStack) {
      existingStack.quantity += resource.quantity;
    } else {
      this.collectedResources.push({ ...resource });
    }
  }

  /**
   * Empty minion storage and return collected resources
   */
  emptyStorage(): ItemStack[] {
    const resources = [...this.collectedResources];
    this.collectedResources = [];
    return resources;
  }

  /**
   * Upgrade minion level and stats
   */
  upgrade(): void {
    this.level += 1;
    this.efficiency += 10; // 10% efficiency boost per level
    this.storageCapacity += Math.floor(this.storageCapacity * 0.2); // 20% storage increase
  }

  /**
   * Apply upgrade effects to minion
   */
  applyUpgrade(upgrade: MinionUpgrade): void {
    upgrade.effects.forEach(effect => {
      switch (effect.type) {
        case MinionUpgradeType.SPEED:
          this.efficiency += effect.value;
          break;
        case MinionUpgradeType.STORAGE:
          this.storageCapacity += effect.value;
          break;
        case MinionUpgradeType.EFFICIENCY:
          this.efficiency += effect.value;
          break;
        // AUTO_SELL and COMPACTOR would require additional logic
      }
    });
  }

  /**
   * Get current minion status
   */
  getStatus(): MinionStatus {
    const currentTime = new Date();
    const timeSinceLastCollection = currentTime.getTime() - this.lastCollection.getTime();
    const collectionInterval = this.getCollectionInterval();
    const timeUntilNext = Math.max(0, collectionInterval - timeSinceLastCollection);

    return {
      isActive: this.isActive,
      resourcesCollected: [...this.collectedResources],
      storageCapacity: this.storageCapacity,
      efficiency: this.efficiency,
      timeUntilNextCollection: timeUntilNext
    };
  }

  /**
   * Activate or deactivate minion
   */
  setActive(active: boolean): void {
    this.isActive = active;
    if (active && this.lastCollection.getTime() === 0) {
      this.lastCollection = new Date();
    }
  }

  /**
   * Validate minion data
   */
  validate(): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!this.id || this.id.trim() === '') {
      errors.push('Minion ID is required');
    }

    if (!this.ownerId || this.ownerId.trim() === '') {
      errors.push('Owner ID is required');
    }

    if (!Object.values(MinionType).includes(this.type)) {
      errors.push('Invalid minion type');
    }

    if (this.level < 1 || this.level > 100) {
      errors.push('Minion level must be between 1 and 100');
    }

    if (this.efficiency < 0) {
      errors.push('Efficiency cannot be negative');
    }

    if (this.storageCapacity < 1) {
      errors.push('Storage capacity must be at least 1');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }
}