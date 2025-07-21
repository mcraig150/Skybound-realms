import { SkillType } from './Skill';

export interface ItemStack {
  itemId: string;
  quantity: number;
  metadata?: ItemMetadata | undefined;
}

export interface ItemMetadata {
  rarity: ItemRarity;
  enchantments: Enchantment[];
  durability?: number;
  reforgeStats?: StatModifiers;
}

export enum ItemRarity {
  COMMON = 'common',
  UNCOMMON = 'uncommon',
  RARE = 'rare',
  EPIC = 'epic',
  LEGENDARY = 'legendary',
  MYTHIC = 'mythic',
  DIVINE = 'divine'
}

export interface Enchantment {
  id: string;
  level: number;
  description: string;
}

export interface StatModifiers {
  damage?: number;
  defense?: number;
  health?: number;
  mana?: number;
  critChance?: number;
  critDamage?: number;
  speed?: number;
}

export enum ItemCategory {
  WEAPON = 'weapon',
  ARMOR = 'armor',
  TOOL = 'tool',
  CONSUMABLE = 'consumable',
  MATERIAL = 'material',
  ACCESSORY = 'accessory',
  PET = 'pet',
  MISC = 'misc'
}

export interface Item {
  id: string;
  name: string;
  description: string;
  category: ItemCategory;
  rarity: ItemRarity;
  maxStackSize: number;
  baseStats?: StatModifiers;
  craftingRecipe?: CraftingRecipe;
}

export interface CraftingRecipe {
  ingredients: ItemStack[];
  result: ItemStack;
  requiredSkillLevel: Map<SkillType, number>;
  craftingTime: number;
}

export interface InventoryOperationResult {
  success: boolean;
  message: string;
  remainingItems?: ItemStack;
}

export class InventoryManager {
  /**
   * Add items to inventory with automatic stacking
   */
  static addItems(inventory: ItemStack[], itemsToAdd: ItemStack, maxInventorySize: number = 36): InventoryOperationResult {
    if (!itemsToAdd || itemsToAdd.quantity <= 0) {
      return { success: false, message: 'Invalid items to add' };
    }

    let remainingQuantity = itemsToAdd.quantity;
    const itemId = itemsToAdd.itemId;

    // First, try to stack with existing items
    for (const existingStack of inventory) {
      if (existingStack.itemId === itemId && this.canStack(existingStack, itemsToAdd)) {
        const maxStackSize = this.getMaxStackSize(itemId);
        const availableSpace = maxStackSize - existingStack.quantity;
        
        if (availableSpace > 0) {
          const amountToAdd = Math.min(remainingQuantity, availableSpace);
          existingStack.quantity += amountToAdd;
          remainingQuantity -= amountToAdd;

          if (remainingQuantity === 0) {
            return { success: true, message: 'Items added successfully' };
          }
        }
      }
    }

    // If there are still items remaining, create new stacks
    while (remainingQuantity > 0 && inventory.length < maxInventorySize) {
      const maxStackSize = this.getMaxStackSize(itemId);
      const stackSize = Math.min(remainingQuantity, maxStackSize);
      
      inventory.push({
        itemId: itemId,
        quantity: stackSize,
        metadata: itemsToAdd.metadata ? { ...itemsToAdd.metadata } : undefined
      });

      remainingQuantity -= stackSize;
    }

    if (remainingQuantity > 0) {
      return {
        success: false,
        message: 'Inventory full',
        remainingItems: {
          itemId: itemId,
          quantity: remainingQuantity,
          metadata: itemsToAdd.metadata
        }
      };
    }

    return { success: true, message: 'Items added successfully' };
  }

  /**
   * Remove items from inventory
   */
  static removeItems(inventory: ItemStack[], itemsToRemove: ItemStack): InventoryOperationResult {
    if (!itemsToRemove || itemsToRemove.quantity <= 0) {
      return { success: false, message: 'Invalid items to remove' };
    }

    const itemId = itemsToRemove.itemId;
    let remainingToRemove = itemsToRemove.quantity;

    // Calculate total available quantity
    const totalAvailable = inventory
      .filter(stack => stack.itemId === itemId)
      .reduce((sum, stack) => sum + stack.quantity, 0);

    if (totalAvailable < remainingToRemove) {
      return { 
        success: false, 
        message: `Not enough items. Available: ${totalAvailable}, Required: ${remainingToRemove}` 
      };
    }

  // Remove items from stacks
  for (let i = inventory.length - 1; i >= 0 && remainingToRemove > 0; i--) {
    const stack = inventory[i];
    if (stack && stack.itemId === itemId) {
      const amountToRemove = Math.min(remainingToRemove, stack.quantity);
      stack.quantity -= amountToRemove;
      remainingToRemove -= amountToRemove;

      // Remove empty stacks
      if (stack.quantity === 0) {
        inventory.splice(i, 1);
      }
    }
  }

    return { success: true, message: 'Items removed successfully' };
  }

  /**
   * Get total quantity of a specific item in inventory
   */
  static getItemQuantity(inventory: ItemStack[], itemId: string): number {
    return inventory
      .filter(stack => stack.itemId === itemId)
      .reduce((sum, stack) => sum + stack.quantity, 0);
  }

  /**
   * Check if inventory has enough of a specific item
   */
  static hasItems(inventory: ItemStack[], itemId: string, quantity: number): boolean {
    return this.getItemQuantity(inventory, itemId) >= quantity;
  }

  /**
   * Consolidate inventory by merging stackable items
   */
  static consolidateInventory(inventory: ItemStack[]): void {
    const stackableGroups = new Map<string, ItemStack[]>();
    const nonStackableItems: ItemStack[] = [];

    // Separate stackable and non-stackable items
    inventory.forEach(stack => {
      const maxStackSize = this.getMaxStackSize(stack.itemId);
      
      if (maxStackSize === 1) {
        // Non-stackable items remain completely separate - each individual item is its own entry
        // If a stack has quantity > 1, we need to split it into individual items
        for (let i = 0; i < stack.quantity; i++) {
          nonStackableItems.push({
            itemId: stack.itemId,
            quantity: 1,
            metadata: stack.metadata ? { ...stack.metadata } : undefined
          });
        }
      } else {
        // Group stackable items by ID and metadata signature
        const metadataKey = stack.metadata ? JSON.stringify(stack.metadata) : 'no-metadata';
        const groupKey = `${stack.itemId}:${metadataKey}`;
        
        if (!stackableGroups.has(groupKey)) {
          stackableGroups.set(groupKey, []);
        }
        stackableGroups.get(groupKey)!.push(stack);
      }
    });

    // Clear inventory and rebuild
    inventory.length = 0;

    // Add non-stackable items first (each remains separate)
    inventory.push(...nonStackableItems);

    // Consolidate stackable items
    stackableGroups.forEach((stacks) => {
      if (stacks.length === 0) return;
      
      const firstStack = stacks[0];
      if (!firstStack) return;
      
      const itemId = firstStack.itemId;
      const maxStackSize = this.getMaxStackSize(itemId);
      let totalQuantity = stacks.reduce((sum, stack) => sum + stack.quantity, 0);
      const metadata = firstStack.metadata;

      while (totalQuantity > 0) {
        const stackSize = Math.min(totalQuantity, maxStackSize);
        inventory.push({
          itemId: itemId,
          quantity: stackSize,
          metadata: metadata ? { ...metadata } : undefined
        });
        totalQuantity -= stackSize;
      }
    });
  }

  /**
   * Validate an item stack
   */
  static validateItemStack(itemStack: ItemStack): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!itemStack.itemId || typeof itemStack.itemId !== 'string') {
      errors.push('Item ID is required and must be a string');
    }

    if (typeof itemStack.quantity !== 'number' || itemStack.quantity <= 0) {
      errors.push('Quantity must be a positive number');
    }

    const maxStackSize = this.getMaxStackSize(itemStack.itemId);
    if (itemStack.quantity > maxStackSize) {
      errors.push(`Quantity (${itemStack.quantity}) exceeds max stack size (${maxStackSize})`);
    }

    if (itemStack.metadata) {
      const metadataValidation = this.validateItemMetadata(itemStack.metadata);
      if (!metadataValidation.isValid) {
        errors.push(...metadataValidation.errors);
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Validate item metadata
   */
  static validateItemMetadata(metadata: ItemMetadata): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!Object.values(ItemRarity).includes(metadata.rarity)) {
      errors.push('Invalid item rarity');
    }

    if (!Array.isArray(metadata.enchantments)) {
      errors.push('Enchantments must be an array');
    } else {
      metadata.enchantments.forEach((enchantment, index) => {
        if (!enchantment.id || typeof enchantment.id !== 'string') {
          errors.push(`Enchantment ${index}: ID is required and must be a string`);
        }
        if (typeof enchantment.level !== 'number' || enchantment.level <= 0) {
          errors.push(`Enchantment ${index}: Level must be a positive number`);
        }
      });
    }

    if (metadata.durability !== undefined && (typeof metadata.durability !== 'number' || metadata.durability < 0)) {
      errors.push('Durability must be a non-negative number');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Check if two item stacks can be stacked together
   */
  private static canStack(stack1: ItemStack, stack2: ItemStack): boolean {
    if (stack1.itemId !== stack2.itemId) {
      return false;
    }

    // Items with different metadata cannot be stacked
    if (stack1.metadata || stack2.metadata) {
      if (!stack1.metadata || !stack2.metadata) {
        return false;
      }

      // Compare metadata (simplified - in a real game, you'd have more complex rules)
      return JSON.stringify(stack1.metadata) === JSON.stringify(stack2.metadata);
    }

    return true;
  }

  /**
   * Get maximum stack size for an item
   */
  private static getMaxStackSize(itemId: string): number {
    // This would typically come from item definitions
    // For now, return default values based on item type
    if (itemId.includes('weapon') || itemId.includes('armor') || itemId.includes('tool') || itemId.includes('sword')) {
      return 1; // Equipment items don't stack
    }
    if (itemId.includes('potion') || itemId.includes('food')) {
      return 16; // Consumables have medium stack size
    }
    return 64; // Default stack size for materials
  }
}