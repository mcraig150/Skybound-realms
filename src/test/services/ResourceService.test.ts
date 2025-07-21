import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ResourceService } from '../../services/ResourceService';
import { 
  ResourceNode, 
  ResourceNodeType, 
  ResourceNodeState, 
  ResourceNodeFactory 
} from '../../models/Resource';
import { SkillType } from '../../models/Skill';
import { Vector3 } from '../../shared/types';

// Mock repository
const mockResourceRepository = {
  findById: vi.fn(),
  findByIslandId: vi.fn(),
  findByPosition: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  findRegeneratingNodes: vi.fn(),
  findNodesByType: vi.fn()
};

// Mock player service
const mockPlayerService = {
  getPlayer: vi.fn(),
  addItemToInventory: vi.fn(),
  addExperience: vi.fn()
} as any;

describe('ResourceService', () => {
  let resourceService: ResourceService;
  let mockNode: ResourceNode;
  let mockPlayer: any;

  beforeEach(() => {
    vi.clearAllMocks();
    
    resourceService = new ResourceService(
      mockResourceRepository as any,
      mockPlayerService
    );

    // Create mock resource node
    mockNode = {
      id: 'tree_1',
      type: ResourceNodeType.TREE,
      position: { x: 10, y: 5, z: 15 },
      islandId: 'island_1',
      state: ResourceNodeState.AVAILABLE,
      maxHarvestCount: 3,
      currentHarvestCount: 0,
      regenerationTime: 300000,
      level: 5,
      drops: [
        {
          itemId: 'wood_log',
          minQuantity: 1,
          maxQuantity: 3,
          dropChance: 1.0,
          experienceReward: 20,
          skillType: SkillType.FORAGING
        }
      ]
    };

    // Create mock player
    mockPlayer = {
      id: 'player_1',
      inventory: [],
      skills: new Map([
        [SkillType.FORAGING, { level: 10, experience: 1000, prestige: 0, unlockedPerks: [] }]
      ])
    };
  });

  describe('collectResources', () => {
    it('should successfully collect resources from available node', async () => {
      // Arrange
      mockResourceRepository.findById.mockResolvedValue(mockNode);
      mockPlayerService.getPlayer.mockResolvedValue(mockPlayer);
      mockPlayerService.addItemToInventory.mockResolvedValue(true);
      mockPlayerService.addExperience.mockResolvedValue({});
      mockResourceRepository.update.mockResolvedValue(mockNode);

      // Act
      const result = await resourceService.collectResources('player_1', 'tree_1');

      // Assert
      expect(result.success).toBe(true);
      expect(result.itemsCollected).toHaveLength(1);
      expect(result.itemsCollected[0]).toBeDefined();
      expect(result.itemsCollected[0]!.itemId).toBe('wood_log');
      expect(result.experienceGained.has(SkillType.FORAGING)).toBe(true);
      expect(mockPlayerService.addItemToInventory).toHaveBeenCalled();
      expect(mockPlayerService.addExperience).toHaveBeenCalledWith(
        'player_1',
        SkillType.FORAGING,
        expect.any(Number)
      );
      expect(mockResourceRepository.update).toHaveBeenCalled();
    });

    it('should fail when resource node not found', async () => {
      // Arrange
      mockResourceRepository.findById.mockResolvedValue(null);

      // Act
      const result = await resourceService.collectResources('player_1', 'nonexistent');

      // Assert
      expect(result.success).toBe(false);
      expect(result.message).toBe('Resource node not found');
      expect(result.itemsCollected).toHaveLength(0);
    });

    it('should fail when node is depleted', async () => {
      // Arrange
      const depletedNode = { ...mockNode, state: ResourceNodeState.DEPLETED };
      mockResourceRepository.findById.mockResolvedValue(depletedNode);

      // Act
      const result = await resourceService.collectResources('player_1', 'tree_1');

      // Assert
      expect(result.success).toBe(false);
      expect(result.message).toBe('Resource node is depleted');
      expect(result.nodeState).toBe(ResourceNodeState.DEPLETED);
    });

    it('should fail when player not found', async () => {
      // Arrange
      mockResourceRepository.findById.mockResolvedValue(mockNode);
      mockPlayerService.getPlayer.mockResolvedValue(null);

      // Act
      const result = await resourceService.collectResources('player_1', 'tree_1');

      // Assert
      expect(result.success).toBe(false);
      expect(result.message).toBe('Player not found');
    });

    it('should deplete node after max harvest count reached', async () => {
      // Arrange
      const almostDepletedNode = { 
        ...mockNode, 
        currentHarvestCount: 2, 
        maxHarvestCount: 3 
      };
      mockResourceRepository.findById.mockResolvedValue(almostDepletedNode);
      mockPlayerService.getPlayer.mockResolvedValue(mockPlayer);
      mockPlayerService.addItemToInventory.mockResolvedValue(true);
      mockPlayerService.addExperience.mockResolvedValue({});
      mockResourceRepository.update.mockResolvedValue(almostDepletedNode);

      // Act
      const result = await resourceService.collectResources('player_1', 'tree_1');

      // Assert
      expect(result.success).toBe(true);
      expect(result.nodeState).toBe(ResourceNodeState.DEPLETED);
      expect(result.timeUntilRegeneration).toBeGreaterThan(0);
      expect(mockResourceRepository.update).toHaveBeenCalledWith(
        'tree_1',
        expect.objectContaining({
          currentHarvestCount: 3,
          state: ResourceNodeState.DEPLETED,
          regeneratesAt: expect.any(Date)
        })
      );
    });

    it('should apply tool efficiency multiplier', async () => {
      // Arrange
      mockResourceRepository.findById.mockResolvedValue(mockNode);
      mockPlayerService.getPlayer.mockResolvedValue(mockPlayer);
      mockPlayerService.addItemToInventory.mockResolvedValue(true);
      mockPlayerService.addExperience.mockResolvedValue({});
      mockResourceRepository.update.mockResolvedValue(mockNode);

      // Act
      const result = await resourceService.collectResources('player_1', 'tree_1', 'iron_axe');

      // Assert
      expect(result.success).toBe(true);
      // With iron axe on tree, should get 1.5x multiplier
      expect(result.itemsCollected[0]).toBeDefined();
      expect(result.itemsCollected[0]!.quantity).toBeGreaterThanOrEqual(1);
    });
  });

  describe('createResourceNode', () => {
    it('should successfully create a new resource node', async () => {
      // Arrange
      const position: Vector3 = { x: 20, y: 10, z: 25 };
      mockResourceRepository.findByPosition.mockResolvedValue(null);
      mockResourceRepository.create.mockResolvedValue(mockNode);

      // Act
      const result = await resourceService.createResourceNode(
        'island_1',
        ResourceNodeType.TREE,
        position,
        5
      );

      // Assert
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(mockResourceRepository.create).toHaveBeenCalled();
    });

    it('should fail when node already exists at position', async () => {
      // Arrange
      const position: Vector3 = { x: 20, y: 10, z: 25 };
      mockResourceRepository.findByPosition.mockResolvedValue(mockNode);

      // Act
      const result = await resourceService.createResourceNode(
        'island_1',
        ResourceNodeType.TREE,
        position
      );

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBe('Resource node already exists at this position');
    });
  });

  describe('getIslandResourceNodes', () => {
    it('should return all resource nodes for an island', async () => {
      // Arrange
      const nodes = [mockNode];
      mockResourceRepository.findByIslandId.mockResolvedValue(nodes);

      // Act
      const result = await resourceService.getIslandResourceNodes('island_1');

      // Assert
      expect(result.success).toBe(true);
      expect(result.data).toEqual(nodes);
      expect(mockResourceRepository.findByIslandId).toHaveBeenCalledWith('island_1');
    });
  });

  describe('getResourceNodesByType', () => {
    it('should return resource nodes of specific type', async () => {
      // Arrange
      const nodes = [mockNode];
      mockResourceRepository.findNodesByType.mockResolvedValue(nodes);

      // Act
      const result = await resourceService.getResourceNodesByType(
        'island_1',
        ResourceNodeType.TREE
      );

      // Assert
      expect(result.success).toBe(true);
      expect(result.data).toEqual(nodes);
      expect(mockResourceRepository.findNodesByType).toHaveBeenCalledWith(
        'island_1',
        ResourceNodeType.TREE
      );
    });
  });

  describe('processNodeRegeneration', () => {
    it('should regenerate depleted nodes that are ready', async () => {
      // Arrange
      const depletedNode = {
        ...mockNode,
        state: ResourceNodeState.DEPLETED,
        regeneratesAt: new Date(Date.now() - 1000) // 1 second ago
      };
      mockResourceRepository.findRegeneratingNodes.mockResolvedValue([depletedNode]);
      mockResourceRepository.update.mockResolvedValue(depletedNode);

      // Act
      const result = await resourceService.processNodeRegeneration();

      // Assert
      expect(result.success).toBe(true);
      expect(result.data).toBe(1); // One node regenerated
      expect(mockResourceRepository.update).toHaveBeenCalledWith(
        depletedNode.id,
        expect.objectContaining({
          state: ResourceNodeState.AVAILABLE,
          currentHarvestCount: 0,
          regeneratesAt: null
        })
      );
    });

    it('should not regenerate nodes that are not ready', async () => {
      // Arrange
      const depletedNode = {
        ...mockNode,
        state: ResourceNodeState.DEPLETED,
        regeneratesAt: new Date(Date.now() + 60000) // 1 minute in future
      };
      mockResourceRepository.findRegeneratingNodes.mockResolvedValue([depletedNode]);

      // Act
      const result = await resourceService.processNodeRegeneration();

      // Assert
      expect(result.success).toBe(true);
      expect(result.data).toBe(0); // No nodes regenerated
      expect(mockResourceRepository.update).not.toHaveBeenCalled();
    });
  });

  describe('removeResourceNode', () => {
    it('should successfully remove a resource node', async () => {
      // Arrange
      mockResourceRepository.delete.mockResolvedValue(true);

      // Act
      const result = await resourceService.removeResourceNode('tree_1');

      // Assert
      expect(result.success).toBe(true);
      expect(result.data).toBe(true);
      expect(mockResourceRepository.delete).toHaveBeenCalledWith('tree_1');
    });

    it('should fail when node cannot be deleted', async () => {
      // Arrange
      mockResourceRepository.delete.mockResolvedValue(false);

      // Act
      const result = await resourceService.removeResourceNode('tree_1');

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to delete resource node');
    });
  });

  describe('getResourceNode', () => {
    it('should return resource node by ID', async () => {
      // Arrange
      mockResourceRepository.findById.mockResolvedValue(mockNode);

      // Act
      const result = await resourceService.getResourceNode('tree_1');

      // Assert
      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockNode);
    });

    it('should fail when node not found', async () => {
      // Arrange
      mockResourceRepository.findById.mockResolvedValue(null);

      // Act
      const result = await resourceService.getResourceNode('nonexistent');

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBe('Resource node not found');
    });
  });

  describe('spawnResourceNodes', () => {
    it('should spawn multiple resource nodes in area', async () => {
      // Arrange
      const spawnArea = {
        min: { x: 0, y: 0, z: 0 },
        max: { x: 10, y: 10, z: 10 }
      };
      mockResourceRepository.findByPosition.mockResolvedValue(null);
      mockResourceRepository.create.mockResolvedValue(mockNode);

      // Act
      const result = await resourceService.spawnResourceNodes('island_1', spawnArea, 5);

      // Assert
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(Array.isArray(result.data)).toBe(true);
    });
  });
});

describe('ResourceNodeFactory', () => {
  describe('createResourceNode', () => {
    it('should create a tree node with correct properties', () => {
      // Arrange
      const position: Vector3 = { x: 10, y: 5, z: 15 };
      const islandId = 'island_1';

      // Act
      const node = ResourceNodeFactory.createResourceNode(
        ResourceNodeType.TREE,
        position,
        islandId,
        5
      );

      // Assert
      expect(node.type).toBe(ResourceNodeType.TREE);
      expect(node.position).toEqual(position);
      expect(node.islandId).toBe(islandId);
      expect(node.level).toBe(5);
      expect(node.state).toBe(ResourceNodeState.AVAILABLE);
      expect(node.currentHarvestCount).toBe(0);
      expect(node.maxHarvestCount).toBeGreaterThan(0);
      expect(node.regenerationTime).toBeGreaterThan(0);
      expect(node.drops.length).toBeGreaterThanOrEqual(1);
      expect(node.drops[0]).toBeDefined();
      expect(node.drops[0]!.skillType).toBe(SkillType.FORAGING);
      // Level 5 trees should have rare wood drop in addition to regular wood
      expect(node.drops.some(drop => drop.itemId === 'wood_log')).toBe(true);
    });

    it('should create a rock node with mining drops', () => {
      // Arrange
      const position: Vector3 = { x: 20, y: 10, z: 25 };
      const islandId = 'island_1';

      // Act
      const node = ResourceNodeFactory.createResourceNode(
        ResourceNodeType.ROCK,
        position,
        islandId,
        8
      );

      // Assert
      expect(node.type).toBe(ResourceNodeType.ROCK);
      expect(node.level).toBe(8);
      expect(node.drops.some(drop => drop.skillType === SkillType.MINING)).toBe(true);
      expect(node.drops.some(drop => drop.itemId === 'stone')).toBe(true);
    });

    it('should create higher level nodes with better drops', () => {
      // Arrange
      const position: Vector3 = { x: 30, y: 15, z: 35 };
      const islandId = 'island_1';

      // Act
      const lowLevelNode = ResourceNodeFactory.createResourceNode(
        ResourceNodeType.ROCK,
        position,
        islandId,
        1
      );
      const highLevelNode = ResourceNodeFactory.createResourceNode(
        ResourceNodeType.ROCK,
        position,
        islandId,
        15
      );

      // Assert
      expect(highLevelNode.maxHarvestCount).toBeGreaterThan(lowLevelNode.maxHarvestCount);
      expect(highLevelNode.regenerationTime).toBeGreaterThan(lowLevelNode.regenerationTime);
      expect(highLevelNode.drops.length).toBeGreaterThanOrEqual(lowLevelNode.drops.length);
    });

    it('should throw error for unknown node type', () => {
      // Arrange
      const position: Vector3 = { x: 10, y: 5, z: 15 };
      const islandId = 'island_1';

      // Act & Assert
      expect(() => {
        ResourceNodeFactory.createResourceNode(
          'unknown_type' as ResourceNodeType,
          position,
          islandId
        );
      }).toThrow('Unknown resource node type: unknown_type');
    });
  });

  describe('getSpawnConfig', () => {
    it('should return spawn config for valid node type', () => {
      // Act
      const config = ResourceNodeFactory.getSpawnConfig(ResourceNodeType.TREE);

      // Assert
      expect(config).toBeDefined();
      expect(config?.type).toBe(ResourceNodeType.TREE);
      expect(config?.spawnChance).toBeGreaterThan(0);
      expect(config?.maxNodesPerChunk).toBeGreaterThan(0);
    });

    it('should return undefined for invalid node type', () => {
      // Act
      const config = ResourceNodeFactory.getSpawnConfig('invalid' as ResourceNodeType);

      // Assert
      expect(config).toBeUndefined();
    });
  });

  describe('getAllSpawnConfigs', () => {
    it('should return all spawn configurations', () => {
      // Act
      const configs = ResourceNodeFactory.getAllSpawnConfigs();

      // Assert
      expect(Array.isArray(configs)).toBe(true);
      expect(configs.length).toBeGreaterThan(0);
      expect(configs.every(config => config.type && config.spawnChance)).toBe(true);
    });
  });
});