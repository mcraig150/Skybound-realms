import { MinionEntity, Minion } from '../models/Minion';
import { ItemStack } from '../models/Item';
import { PlayerService } from './PlayerService';
import { Utils } from '../shared/utils';
import { GAME_CONSTANTS } from '../shared/constants';
import { ServiceResult } from '../shared/types';

export interface MinionRepository {
  findByOwnerId(ownerId: string): Promise<Minion[]>;
  findById(id: string): Promise<Minion | null>;
  update(id: string, updates: Partial<Minion>): Promise<Minion | null>;
  findActiveMinions(): Promise<Minion[]>;
}

export interface OfflineProcessingResult {
  playerId: string;
  minionsProcessed: number;
  totalResourcesCollected: ItemStack[];
  overflowItems: ItemStack[];
  processingTime: number;
}

export interface CatchUpResult {
  success: boolean;
  result?: OfflineProcessingResult;
  error?: string;
}

export class OfflineProcessingService {
  constructor(
    private minionRepository: MinionRepository,
    private playerService: PlayerService
  ) {}

  /**
   * Process offline minion activities for a specific player
   */
  async processPlayerOfflineActivity(playerId: string): Promise<CatchUpResult> {
    try {
      const startTime = Date.now();
      
      // Get player's minions
      const minions = await this.minionRepository.findByOwnerId(playerId);
      if (minions.length === 0) {
        return {
          success: true,
          result: {
            playerId,
            minionsProcessed: 0,
            totalResourcesCollected: [],
            overflowItems: [],
            processingTime: Date.now() - startTime
          }
        };
      }

      // Get player to check inventory space
      const player = await this.playerService.getPlayer(playerId);
      if (!player) {
        return {
          success: false,
          error: 'Player not found'
        };
      }

      const currentTime = new Date();
      const allCollectedResources: ItemStack[] = [];
      const overflowItems: ItemStack[] = [];
      let minionsProcessed = 0;

      // Process each minion
      for (const minionData of minions) {
        const minion = new MinionEntity(minionData);
        
        if (!minion.isActive) {
          continue;
        }

        // Process offline collection
        const collectedResources = minion.processOfflineCollection(currentTime);
        
        if (collectedResources.length > 0) {
          // Check storage capacity and handle overflow
          const { storedItems, overflow } = this.handleStorageCapacity(
            minion, 
            collectedResources
          );

          // Add stored items to total collection
          allCollectedResources.push(...storedItems);
          overflowItems.push(...overflow);

          // Update minion in database
          await this.minionRepository.update(minion.id, {
            collectedResources: minion.collectedResources,
            lastCollection: minion.lastCollection
          });

          minionsProcessed++;
        }
      }

      // Try to add collected resources to player inventory
      const { addedItems, remainingItems } = await this.addItemsToPlayerInventory(
        playerId,
        allCollectedResources
      );

      // Items that couldn't be added to inventory are considered overflow
      overflowItems.push(...remainingItems);

      const result: OfflineProcessingResult = {
        playerId,
        minionsProcessed,
        totalResourcesCollected: addedItems,
        overflowItems,
        processingTime: Date.now() - startTime
      };

      return {
        success: true,
        result
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to process offline activity'
      };
    }
  }

  /**
   * Process all active minions (called by background job)
   */
  async processAllActiveMinions(): Promise<ServiceResult<{
    playersProcessed: number;
    minionsProcessed: number;
    totalProcessingTime: number;
  }>> {
    try {
      const startTime = Date.now();
      
      // Get all active minions
      const activeMinions = await this.minionRepository.findActiveMinions();
      
      // Group minions by owner
      const minionsByOwner = new Map<string, Minion[]>();
      for (const minion of activeMinions) {
        const existing = minionsByOwner.get(minion.ownerId) || [];
        existing.push(minion);
        minionsByOwner.set(minion.ownerId, existing);
      }

      let playersProcessed = 0;
      let totalMinionsProcessed = 0;

      // Process each player's minions
      for (const [playerId, minions] of minionsByOwner) {
        const result = await this.processPlayerOfflineActivity(playerId);
        
        if (result.success && result.result) {
          playersProcessed++;
          totalMinionsProcessed += result.result.minionsProcessed;
        }
      }

      return {
        success: true,
        data: {
          playersProcessed,
          minionsProcessed: totalMinionsProcessed,
          totalProcessingTime: Date.now() - startTime
        }
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to process active minions'
      };
    }
  }

  /**
   * Calculate catch-up resources for a minion based on offline time
   */
  public calculateCatchUpResources(
    minion: MinionEntity, 
    offlineStartTime: Date, 
    currentTime: Date
  ): ItemStack[] {
    if (!minion.isActive || !minion.canCollect()) {
      return [];
    }

    const offlineTimeMs = currentTime.getTime() - offlineStartTime.getTime();
    const collectionInterval = minion.getCollectionInterval();
    
    // Calculate maximum collections possible during offline time
    const maxCollections = Math.floor(offlineTimeMs / collectionInterval);
    
    if (maxCollections <= 0) {
      return [];
    }

    // Calculate actual collections considering storage capacity
    const currentStorageUsed = minion.collectedResources.reduce(
      (sum, stack) => sum + stack.quantity, 
      0
    );
    const availableStorage = minion.storageCapacity - currentStorageUsed;
    const actualCollections = Math.min(maxCollections, availableStorage);

    if (actualCollections <= 0) {
      return [];
    }

    // Generate resources
    const resourceType = this.getMinionResourceType(minion.type);
    const collectedResources: ItemStack[] = [];

    for (let i = 0; i < actualCollections; i++) {
      collectedResources.push({
        itemId: resourceType,
        quantity: 1
      });
    }

    return collectedResources;
  }

  /**
   * Handle storage capacity limits and overflow
   */
  private handleStorageCapacity(
    minion: MinionEntity, 
    newResources: ItemStack[]
  ): { storedItems: ItemStack[]; overflow: ItemStack[] } {
    const storedItems: ItemStack[] = [];
    const overflow: ItemStack[] = [];

    const currentStorageUsed = minion.collectedResources.reduce(
      (sum, stack) => sum + stack.quantity, 
      0
    );
    let availableStorage = minion.storageCapacity - currentStorageUsed;

    for (const resource of newResources) {
      if (availableStorage >= resource.quantity) {
        // Can store all of this resource
        storedItems.push(resource);
        availableStorage -= resource.quantity;
      } else if (availableStorage > 0) {
        // Can store partial amount
        storedItems.push({
          itemId: resource.itemId,
          quantity: availableStorage,
          metadata: resource.metadata
        });
        
        overflow.push({
          itemId: resource.itemId,
          quantity: resource.quantity - availableStorage,
          metadata: resource.metadata
        });
        
        availableStorage = 0;
      } else {
        // No storage left, all overflow
        overflow.push(resource);
      }
    }

    return { storedItems, overflow };
  }

  /**
   * Add items to player inventory with overflow handling
   */
  private async addItemsToPlayerInventory(
    playerId: string, 
    items: ItemStack[]
  ): Promise<{ addedItems: ItemStack[]; remainingItems: ItemStack[] }> {
    const addedItems: ItemStack[] = [];
    const remainingItems: ItemStack[] = [];

    for (const item of items) {
      const success = await this.playerService.addItemToInventory(playerId, item);
      
      if (success) {
        addedItems.push(item);
      } else {
        remainingItems.push(item);
      }
    }

    return { addedItems, remainingItems };
  }

  /**
   * Get the resource type a minion produces
   */
  private getMinionResourceType(minionType: string): string {
    // This mapping should match the one in MinionEntity
    const resourceMap: Record<string, string> = {
      'cobblestone': 'cobblestone',
      'coal': 'coal',
      'iron': 'iron_ore',
      'gold': 'gold_ore',
      'diamond': 'diamond',
      'wheat': 'wheat',
      'carrot': 'carrot',
      'potato': 'potato',
      'sugar_cane': 'sugar_cane',
      'melon': 'melon',
      'pumpkin': 'pumpkin',
      'cocoa': 'cocoa_beans',
      'chicken': 'raw_chicken',
      'cow': 'raw_beef',
      'pig': 'raw_pork',
      'sheep': 'wool',
      'fishing': 'raw_fish',
      'foraging': 'oak_log'
    };

    return resourceMap[minionType] || 'cobblestone';
  }

  /**
   * Get offline processing statistics for a player
   */
  async getPlayerOfflineStats(playerId: string): Promise<ServiceResult<{
    totalMinions: number;
    activeMinions: number;
    totalStorageUsed: number;
    totalStorageCapacity: number;
    estimatedHourlyProduction: ItemStack[];
  }>> {
    try {
      const minions = await this.minionRepository.findByOwnerId(playerId);
      
      let activeMinions = 0;
      let totalStorageUsed = 0;
      let totalStorageCapacity = 0;
      const hourlyProduction = new Map<string, number>();

      for (const minionData of minions) {
        const minion = new MinionEntity(minionData);
        
        if (minion.isActive) {
          activeMinions++;
        }

        const storageUsed = minion.collectedResources.reduce(
          (sum, stack) => sum + stack.quantity, 
          0
        );
        totalStorageUsed += storageUsed;
        totalStorageCapacity += minion.storageCapacity;

        // Calculate hourly production
        if (minion.isActive) {
          const collectionInterval = minion.getCollectionInterval();
          const collectionsPerHour = 3600000 / collectionInterval; // 1 hour in ms
          const resourceType = this.getMinionResourceType(minion.type);
          
          const currentProduction = hourlyProduction.get(resourceType) || 0;
          hourlyProduction.set(resourceType, currentProduction + collectionsPerHour);
        }
      }

      const estimatedHourlyProduction: ItemStack[] = Array.from(hourlyProduction.entries())
        .map(([itemId, quantity]) => ({
          itemId,
          quantity: Math.floor(quantity)
        }));

      return {
        success: true,
        data: {
          totalMinions: minions.length,
          activeMinions,
          totalStorageUsed,
          totalStorageCapacity,
          estimatedHourlyProduction
        }
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get offline stats'
      };
    }
  }

  /**
   * Clear overflow items (admin function)
   */
  async clearPlayerOverflow(playerId: string): Promise<ServiceResult<number>> {
    try {
      const minions = await this.minionRepository.findByOwnerId(playerId);
      let clearedItems = 0;

      for (const minionData of minions) {
        const minion = new MinionEntity(minionData);
        const itemsCleared = minion.collectedResources.length;
        
        if (itemsCleared > 0) {
          minion.collectedResources = [];
          await this.minionRepository.update(minion.id, {
            collectedResources: []
          });
          clearedItems += itemsCleared;
        }
      }

      return {
        success: true,
        data: clearedItems
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to clear overflow'
      };
    }
  }
}