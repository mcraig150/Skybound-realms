import { 
  ResourceNode, 
  ResourceNodeType, 
  ResourceNodeState, 
  ResourceCollectionResult,
  ResourceNodeFactory
} from '../models/Resource';
import { ItemStack, InventoryManager } from '../models/Item';
import { SkillType } from '../models/Skill';
import { Vector3, ServiceResult } from '../shared/types';
import { GAME_CONSTANTS } from '../shared/constants';
import { PlayerService } from './PlayerService';

export interface ResourceRepository {
  findById(id: string): Promise<ResourceNode | null>;
  findByIslandId(islandId: string): Promise<ResourceNode[]>;
  findByPosition(islandId: string, position: Vector3): Promise<ResourceNode | null>;
  create(node: ResourceNode): Promise<ResourceNode>;
  update(id: string, updates: Partial<ResourceNode>): Promise<ResourceNode | null>;
  delete(id: string): Promise<boolean>;
  findRegeneratingNodes(): Promise<ResourceNode[]>;
  findNodesByType(islandId: string, type: ResourceNodeType): Promise<ResourceNode[]>;
}

export class ResourceService {
  constructor(
    private resourceRepository: ResourceRepository,
    private playerService: PlayerService
  ) {}

  /**
   * Collect resources from a node
   */
  async collectResources(
    playerId: string, 
    nodeId: string, 
    toolItemId?: string
  ): Promise<ResourceCollectionResult> {
    try {
      // Get the resource node
      const node = await this.resourceRepository.findById(nodeId);
      if (!node) {
        return {
          success: false,
          message: 'Resource node not found',
          itemsCollected: [],
          experienceGained: new Map(),
          nodeState: ResourceNodeState.DEPLETED
        };
      }

      // Check if node is available for harvesting
      if (node.state !== ResourceNodeState.AVAILABLE) {
        const timeUntilRegeneration = node.regeneratesAt 
          ? Math.max(0, node.regeneratesAt.getTime() - Date.now())
          : 0;
        
        const result: ResourceCollectionResult = {
          success: false,
          message: node.state === ResourceNodeState.DEPLETED 
            ? 'Resource node is depleted' 
            : 'Resource node is regenerating',
          itemsCollected: [],
          experienceGained: new Map(),
          nodeState: node.state
        };
        
        if (timeUntilRegeneration > 0) {
          result.timeUntilRegeneration = timeUntilRegeneration;
        }
        
        return result;
      }

      // Get player to check inventory space and skill levels
      const player = await this.playerService.getPlayer(playerId);
      if (!player) {
        return {
          success: false,
          message: 'Player not found',
          itemsCollected: [],
          experienceGained: new Map(),
          nodeState: node.state
        };
      }

      // Calculate tool efficiency multiplier
      const toolMultiplier = this.calculateToolEfficiency(toolItemId, node.type);

      // Determine what resources to collect
      const collectionResult = this.calculateResourceCollection(node, player, toolMultiplier);
      
      if (collectionResult.itemsCollected.length === 0) {
        return {
          success: false,
          message: 'No resources collected - insufficient skill level or bad luck',
          itemsCollected: [],
          experienceGained: new Map(),
          nodeState: node.state
        };
      }

      // Check if player has inventory space
      const inventorySpaceCheck = this.checkInventorySpace(player.inventory, collectionResult.itemsCollected);
      if (!inventorySpaceCheck.hasSpace) {
        return {
          success: false,
          message: `Inventory full - need ${inventorySpaceCheck.slotsNeeded} free slots`,
          itemsCollected: [],
          experienceGained: new Map(),
          nodeState: node.state
        };
      }

      // Add items to player inventory
      for (const item of collectionResult.itemsCollected) {
        const addResult = await this.playerService.addItemToInventory(playerId, item);
        if (!addResult) {
          // If we can't add items, rollback and return error
          return {
            success: false,
            message: 'Failed to add items to inventory',
            itemsCollected: [],
            experienceGained: new Map(),
            nodeState: node.state
          };
        }
      }

      // Award experience
      for (const [skillType, experience] of collectionResult.experienceGained) {
        await this.playerService.addExperience(playerId, skillType, experience);
      }

      // Update node state
      node.currentHarvestCount += 1;
      node.lastHarvestedAt = new Date();

      let newState: ResourceNodeState = node.state;
      if (node.currentHarvestCount >= node.maxHarvestCount) {
        newState = ResourceNodeState.DEPLETED;
        node.state = newState;
        node.regeneratesAt = new Date(Date.now() + node.regenerationTime);
      }

      const updateData: Partial<ResourceNode> = {
        currentHarvestCount: node.currentHarvestCount,
        lastHarvestedAt: node.lastHarvestedAt,
        state: node.state
      };
      
      if (node.regeneratesAt) {
        updateData.regeneratesAt = node.regeneratesAt;
      }

      await this.resourceRepository.update(node.id, updateData);

      const successResult: ResourceCollectionResult = {
        success: true,
        message: 'Resources collected successfully',
        itemsCollected: collectionResult.itemsCollected,
        experienceGained: collectionResult.experienceGained,
        nodeState: newState
      };
      
      if (node.regeneratesAt) {
        successResult.timeUntilRegeneration = node.regeneratesAt.getTime() - Date.now();
      }
      
      return successResult;

    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to collect resources',
        itemsCollected: [],
        experienceGained: new Map(),
        nodeState: ResourceNodeState.DEPLETED
      };
    }
  }

  /**
   * Create a new resource node at a specific location
   */
  async createResourceNode(
    islandId: string,
    type: ResourceNodeType,
    position: Vector3,
    level?: number
  ): Promise<ServiceResult<ResourceNode>> {
    try {
      // Check if there's already a node at this position
      const existingNode = await this.resourceRepository.findByPosition(islandId, position);
      if (existingNode) {
        return {
          success: false,
          error: 'Resource node already exists at this position'
        };
      }

      // Create the new node
      const newNode = ResourceNodeFactory.createResourceNode(type, position, islandId, level);
      const createdNode = await this.resourceRepository.create(newNode);

      return {
        success: true,
        data: createdNode
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create resource node'
      };
    }
  }

  /**
   * Get all resource nodes for an island
   */
  async getIslandResourceNodes(islandId: string): Promise<ServiceResult<ResourceNode[]>> {
    try {
      const nodes = await this.resourceRepository.findByIslandId(islandId);
      return {
        success: true,
        data: nodes
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get resource nodes'
      };
    }
  }

  /**
   * Get resource nodes by type for an island
   */
  async getResourceNodesByType(
    islandId: string, 
    type: ResourceNodeType
  ): Promise<ServiceResult<ResourceNode[]>> {
    try {
      const nodes = await this.resourceRepository.findNodesByType(islandId, type);
      return {
        success: true,
        data: nodes
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get resource nodes by type'
      };
    }
  }

  /**
   * Process resource node regeneration (called by background job)
   */
  async processNodeRegeneration(): Promise<ServiceResult<number>> {
    try {
      const regeneratingNodes = await this.resourceRepository.findRegeneratingNodes();
      const now = new Date();
      let regeneratedCount = 0;

      for (const node of regeneratingNodes) {
        if (node.regeneratesAt && node.regeneratesAt <= now) {
          const regenerationUpdate: Partial<ResourceNode> = {
            state: ResourceNodeState.AVAILABLE,
            currentHarvestCount: 0
          };
          
          // Explicitly handle regeneratesAt separately to avoid TypeScript issues
          (regenerationUpdate as any).regeneratesAt = null;
          
          await this.resourceRepository.update(node.id, regenerationUpdate);
          regeneratedCount++;
        }
      }

      return {
        success: true,
        data: regeneratedCount
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to process node regeneration'
      };
    }
  }

  /**
   * Remove a resource node
   */
  async removeResourceNode(nodeId: string): Promise<ServiceResult<boolean>> {
    try {
      const result = await this.resourceRepository.delete(nodeId);
      if (result) {
        return {
          success: true,
          data: result
        };
      } else {
        return {
          success: false,
          error: 'Failed to delete resource node'
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to remove resource node'
      };
    }
  }

  /**
   * Get resource node information
   */
  async getResourceNode(nodeId: string): Promise<ServiceResult<ResourceNode>> {
    try {
      const node = await this.resourceRepository.findById(nodeId);
      if (!node) {
        return {
          success: false,
          error: 'Resource node not found'
        };
      }

      return {
        success: true,
        data: node
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get resource node'
      };
    }
  }

  /**
   * Spawn resource nodes on an island (for initial generation or expansion)
   */
  async spawnResourceNodes(
    islandId: string,
    spawnArea: { min: Vector3; max: Vector3 },
    nodeCount?: number
  ): Promise<ServiceResult<ResourceNode[]>> {
    try {
      const spawnedNodes: ResourceNode[] = [];
      const maxNodes = nodeCount || 10;
      const spawnConfigs = ResourceNodeFactory.getAllSpawnConfigs();

      for (let i = 0; i < maxNodes; i++) {
        // Random position within spawn area
        const position: Vector3 = {
          x: Math.floor(Math.random() * (spawnArea.max.x - spawnArea.min.x + 1)) + spawnArea.min.x,
          y: Math.floor(Math.random() * (spawnArea.max.y - spawnArea.min.y + 1)) + spawnArea.min.y,
          z: Math.floor(Math.random() * (spawnArea.max.z - spawnArea.min.z + 1)) + spawnArea.min.z
        };

        // Check if position is already occupied
        const existingNode = await this.resourceRepository.findByPosition(islandId, position);
        if (existingNode) {
          continue; // Skip this position
        }

        // Select random node type based on spawn chances
        const selectedConfig = this.selectRandomNodeType(spawnConfigs);
        if (!selectedConfig) {
          continue;
        }

        // Create and spawn the node
        const nodeResult = await this.createResourceNode(
          islandId,
          selectedConfig.type,
          position
        );

        if (nodeResult.success && nodeResult.data) {
          spawnedNodes.push(nodeResult.data);
        }
      }

      return {
        success: true,
        data: spawnedNodes
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to spawn resource nodes'
      };
    }
  }

  /**
   * Calculate what resources a player collects from a node
   */
  private calculateResourceCollection(
    node: ResourceNode,
    player: any,
    toolMultiplier: number
  ): { itemsCollected: ItemStack[]; experienceGained: Map<SkillType, number> } {
    const itemsCollected: ItemStack[] = [];
    const experienceGained = new Map<SkillType, number>();

    for (const drop of node.drops) {
      // Check skill level requirement
      if (drop.requiredSkillLevel) {
        const playerSkill = player.skills.get(drop.skillType);
        if (!playerSkill || playerSkill.level < drop.requiredSkillLevel) {
          continue; // Skip this drop
        }
      }

      // Roll for drop chance
      if (Math.random() > drop.dropChance) {
        continue; // Didn't get this drop
      }

      // Calculate quantity (with tool multiplier)
      const baseQuantity = Math.floor(
        Math.random() * (drop.maxQuantity - drop.minQuantity + 1)
      ) + drop.minQuantity;
      
      const finalQuantity = Math.max(1, Math.floor(baseQuantity * toolMultiplier));

      // Add to collected items
      itemsCollected.push({
        itemId: drop.itemId,
        quantity: finalQuantity
      });

      // Add experience (also affected by tool multiplier)
      const expGained = Math.floor(drop.experienceReward * toolMultiplier);
      const currentExp = experienceGained.get(drop.skillType) || 0;
      experienceGained.set(drop.skillType, currentExp + expGained);
    }

    return { itemsCollected, experienceGained };
  }

  /**
   * Calculate tool efficiency multiplier
   */
  private calculateToolEfficiency(toolItemId: string | undefined, nodeType: ResourceNodeType): number {
    if (!toolItemId) {
      return 1.0; // No tool, base efficiency
    }

    // Tool efficiency mapping (in a real game, this would come from item definitions)
    const toolEfficiency: Record<string, Record<ResourceNodeType, number>> = {
      'iron_axe': {
        [ResourceNodeType.TREE]: 1.5,
        [ResourceNodeType.ROCK]: 0.8,
        [ResourceNodeType.CROP]: 1.0,
        [ResourceNodeType.FLOWER]: 1.0,
        [ResourceNodeType.MINERAL_VEIN]: 0.8,
        [ResourceNodeType.FISHING_SPOT]: 0.5
      },
      'iron_pickaxe': {
        [ResourceNodeType.TREE]: 0.5,
        [ResourceNodeType.ROCK]: 1.8,
        [ResourceNodeType.CROP]: 1.0,
        [ResourceNodeType.FLOWER]: 1.0,
        [ResourceNodeType.MINERAL_VEIN]: 2.0,
        [ResourceNodeType.FISHING_SPOT]: 0.5
      },
      'iron_hoe': {
        [ResourceNodeType.TREE]: 0.8,
        [ResourceNodeType.ROCK]: 0.5,
        [ResourceNodeType.CROP]: 1.8,
        [ResourceNodeType.FLOWER]: 1.5,
        [ResourceNodeType.MINERAL_VEIN]: 0.5,
        [ResourceNodeType.FISHING_SPOT]: 0.5
      }
    };

    const tool = toolEfficiency[toolItemId];
    if (!tool) {
      return 1.0; // Unknown tool, base efficiency
    }

    return tool[nodeType] || 1.0;
  }

  /**
   * Check if player has enough inventory space for collected items
   */
  private checkInventorySpace(
    inventory: ItemStack[], 
    itemsToAdd: ItemStack[]
  ): { hasSpace: boolean; slotsNeeded: number } {
    // Create a copy of inventory to simulate adding items
    const inventoryCopy = [...inventory];
    let slotsNeeded = 0;

    for (const item of itemsToAdd) {
      const result = InventoryManager.addItems(inventoryCopy, item, GAME_CONSTANTS.MAX_INVENTORY_SIZE);
      if (!result.success) {
        slotsNeeded++;
      }
    }

    return {
      hasSpace: slotsNeeded === 0,
      slotsNeeded
    };
  }

  /**
   * Select a random node type based on spawn chances
   */
  private selectRandomNodeType(configs: any[]): any | null {
    const totalWeight = configs.reduce((sum, config) => sum + config.spawnChance, 0);
    let random = Math.random() * totalWeight;

    for (const config of configs) {
      random -= config.spawnChance;
      if (random <= 0) {
        return config;
      }
    }

    return null; // Shouldn't happen, but fallback
  }
}