import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WorldService, WorldRepository, MinionRepository } from '../../services/WorldService';
import { 
  Island, 
  WorldChunk, 
  VoxelChange, 
  IslandBlueprint,
  VoxelDataManager
} from '../../models/Island';
import { Minion, MinionType } from '../../models/Minion';
import { GAME_CONSTANTS } from '../../shared/constants';

// Mock repositories
const mockWorldRepository: WorldRepository = {
  findById: vi.fn(),
  findByOwnerId: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  loadChunks: vi.fn(),
  saveChunk: vi.fn(),
  saveChunks: vi.fn(),
  applyVoxelChanges: vi.fn(),
  getDirtyChunks: vi.fn(),
  markChunksClean: vi.fn(),
  incrementVisitCount: vi.fn(),
  getPublicIslands: vi.fn()
};

const mockMinionRepository: MinionRepository = {
  findByIslandId: vi.fn(),
  findActiveMinions: vi.fn()
};

describe('WorldService', () => {
  let worldService: WorldService;
  let mockIsland: Island;
  let mockMinions: Minion[];

  beforeEach(() => {
    worldService = new WorldService(mockWorldRepository, mockMinionRepository);
    
    // Reset all mocks
    vi.clearAllMocks();

    // Create mock data
    mockIsland = {
      id: 'island_123',
      ownerId: 'player_456',
      chunks: [
        {
          chunkId: 'chunk_0_0_0',
          position: { x: 0, y: 0, z: 0 },
          voxelData: VoxelDataManager.createEmptyChunkData(),
          entities: [],
          lastModified: new Date(),
          isLoaded: true,
          isDirty: false
        }
      ],
      expansionLevel: 1,
      permissions: {
        isPublic: false,
        allowedVisitors: [],
        coopMembers: [],
        buildPermissions: new Map()
      },
      visitCount: 0,
      createdAt: new Date(),
      lastModified: new Date()
    };

    mockMinions = [
      {
        id: 'minion_1',
        type: MinionType.COBBLESTONE,
        ownerId: 'player_456',
        position: { x: 5, y: 5, z: 5 },
        level: 1,
        efficiency: 1.0,
        storageCapacity: 64,
        collectedResources: [],
        isActive: true,
        deployedAt: new Date(),
        lastCollection: new Date()
      }
    ];
  });

  describe('loadPlayerIsland', () => {
    it('should load player island with chunks and minions', async () => {
      // Arrange
      vi.mocked(mockWorldRepository.findByOwnerId).mockResolvedValue(mockIsland);
      vi.mocked(mockMinionRepository.findActiveMinions).mockResolvedValue(mockMinions);

      // Act
      const result = await worldService.loadPlayerIsland('player_456');

      // Assert
      expect(result).toBeDefined();
      expect(result?.playerId).toBe('player_456');
      expect(result?.worldData).toEqual(mockIsland.chunks);
      expect(result?.expansionLevel).toBe(1);
      expect(result?.activeMinions).toEqual(mockMinions);
      expect(mockWorldRepository.findByOwnerId).toHaveBeenCalledWith('player_456');
      expect(mockMinionRepository.findActiveMinions).toHaveBeenCalledWith('island_123');
    });

    it('should return null if island not found', async () => {
      // Arrange
      vi.mocked(mockWorldRepository.findByOwnerId).mockResolvedValue(null);

      // Act
      const result = await worldService.loadPlayerIsland('nonexistent_player');

      // Assert
      expect(result).toBeNull();
      expect(mockWorldRepository.findByOwnerId).toHaveBeenCalledWith('nonexistent_player');
      expect(mockMinionRepository.findActiveMinions).not.toHaveBeenCalled();
    });
  });

  describe('createPlayerIsland', () => {
    it('should create a new island with initial chunks', async () => {
      // Arrange
      const createdIsland = { ...mockIsland, id: 'new_island_123' };
      vi.mocked(mockWorldRepository.create).mockResolvedValue(createdIsland);

      // Act
      const result = await worldService.createPlayerIsland('new_player_789');

      // Assert
      expect(result).toEqual(createdIsland);
      expect(mockWorldRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          ownerId: 'new_player_789',
          expansionLevel: 1,
          visitCount: 0,
          chunks: expect.arrayContaining([
            expect.objectContaining({
              chunkId: expect.stringMatching(/^chunk_\d+_\d+_\d+$/),
              position: expect.objectContaining({ x: expect.any(Number), y: expect.any(Number), z: expect.any(Number) }),
              voxelData: expect.any(Uint8Array),
              entities: [],
              isLoaded: true,
              isDirty: false
            })
          ])
        })
      );
    });

    it('should create correct number of initial chunks', async () => {
      // Arrange
      vi.mocked(mockWorldRepository.create).mockImplementation(async (data) => ({ ...data, id: 'test_island' } as Island));

      // Act
      await worldService.createPlayerIsland('test_player');

      // Assert
      const createCall = vi.mocked(mockWorldRepository.create).mock.calls[0]?.[0];
      expect(createCall).toBeDefined();
      
      if (createCall) {
        const expectedChunksPerAxis = {
          x: Math.ceil(GAME_CONSTANTS.ISLAND_START_SIZE.x / GAME_CONSTANTS.CHUNK_SIZE),
          y: Math.ceil(GAME_CONSTANTS.ISLAND_START_SIZE.y / GAME_CONSTANTS.CHUNK_SIZE),
          z: Math.ceil(GAME_CONSTANTS.ISLAND_START_SIZE.z / GAME_CONSTANTS.CHUNK_SIZE)
        };
        const expectedTotalChunks = expectedChunksPerAxis.x * expectedChunksPerAxis.y * expectedChunksPerAxis.z;
        
        expect(createCall.chunks).toHaveLength(expectedTotalChunks);
      }
    });
  });

  describe('saveIslandChanges', () => {
    it('should save valid voxel changes', async () => {
      // Arrange
      vi.mocked(mockWorldRepository.findByOwnerId).mockResolvedValue(mockIsland);
      vi.mocked(mockWorldRepository.applyVoxelChanges).mockResolvedValue();
      vi.mocked(mockWorldRepository.update).mockResolvedValue(mockIsland);

      const changes: VoxelChange[] = [
        {
          position: { x: 5, y: 5, z: 5 },
          oldBlockId: 0,
          newBlockId: 1,
          timestamp: new Date(),
          playerId: 'player_456'
        }
      ];

      // Act
      const result = await worldService.saveIslandChanges('player_456', changes);

      // Assert
      expect(result.success).toBe(true);
      expect(mockWorldRepository.applyVoxelChanges).toHaveBeenCalledWith('island_123', changes);
      expect(mockWorldRepository.update).toHaveBeenCalledWith('island_123', expect.objectContaining({
        lastModified: expect.any(Date)
      }));
    });

    it('should reject changes with invalid block IDs', async () => {
      // Arrange
      vi.mocked(mockWorldRepository.findByOwnerId).mockResolvedValue(mockIsland);

      const invalidChanges: VoxelChange[] = [
        {
          position: { x: 5, y: 5, z: 5 },
          oldBlockId: 0,
          newBlockId: 999, // Invalid block ID
          timestamp: new Date(),
          playerId: 'player_456'
        }
      ];

      // Act
      const result = await worldService.saveIslandChanges('player_456', invalidChanges);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid block ID');
      expect(mockWorldRepository.applyVoxelChanges).not.toHaveBeenCalled();
    });

    it('should return error if island not found', async () => {
      // Arrange
      vi.mocked(mockWorldRepository.findByOwnerId).mockResolvedValue(null);

      const changes: VoxelChange[] = [];

      // Act
      const result = await worldService.saveIslandChanges('nonexistent_player', changes);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBe('Island not found');
    });
  });

  describe('expandIsland', () => {
    it('should expand island with valid blueprint', async () => {
      // Arrange
      vi.mocked(mockWorldRepository.findByOwnerId).mockResolvedValue(mockIsland);
      vi.mocked(mockWorldRepository.update).mockResolvedValue({ ...mockIsland, expansionLevel: 2 });

      const blueprint: IslandBlueprint = {
        id: 'expansion_1',
        name: 'Basic Expansion',
        requiredMaterials: [],
        expansionSize: { x: 16, y: 0, z: 16 },
        unlockRequirements: []
      };

      // Act
      const result = await worldService.expandIsland('player_456', blueprint);

      // Assert
      expect(result.success).toBe(true);
      expect(result.data).toBe(true);
      expect(mockWorldRepository.update).toHaveBeenCalledWith('island_123', expect.objectContaining({
        expansionLevel: 2,
        chunks: expect.arrayContaining([...mockIsland.chunks]),
        lastModified: expect.any(Date)
      }));
    });

    it('should reject expansion if requirements not met', async () => {
      // Arrange
      vi.mocked(mockWorldRepository.findByOwnerId).mockResolvedValue(mockIsland);

      const blueprint: IslandBlueprint = {
        id: 'expansion_advanced',
        name: 'Advanced Expansion',
        requiredMaterials: [],
        expansionSize: { x: 32, y: 0, z: 32 },
        unlockRequirements: ['expansion_level_5'] // Requires level 5, but island is level 1
      };

      // Act
      const result = await worldService.expandIsland('player_456', blueprint);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBe('Requires expansion level 5');
      expect(mockWorldRepository.update).not.toHaveBeenCalled();
    });
  });

  describe('getIsland', () => {
    it('should return island for owner', async () => {
      // Arrange
      vi.mocked(mockWorldRepository.findById).mockResolvedValue(mockIsland);

      // Act
      const result = await worldService.getIsland('island_123', 'player_456');

      // Assert
      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockIsland);
      expect(mockWorldRepository.incrementVisitCount).not.toHaveBeenCalled(); // Owner doesn't increment visit count
    });

    it('should return public island for visitor and increment visit count', async () => {
      // Arrange
      const publicIsland = { ...mockIsland, permissions: { ...mockIsland.permissions, isPublic: true } };
      vi.mocked(mockWorldRepository.findById).mockResolvedValue(publicIsland);
      vi.mocked(mockWorldRepository.incrementVisitCount).mockResolvedValue();

      // Act
      const result = await worldService.getIsland('island_123', 'visitor_789');

      // Assert
      expect(result.success).toBe(true);
      expect(result.data).toEqual(publicIsland);
      expect(mockWorldRepository.incrementVisitCount).toHaveBeenCalledWith('island_123');
    });

    it('should deny access to private island for unauthorized visitor', async () => {
      // Arrange
      vi.mocked(mockWorldRepository.findById).mockResolvedValue(mockIsland); // Private island

      // Act
      const result = await worldService.getIsland('island_123', 'unauthorized_visitor');

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBe('Access denied');
      expect(mockWorldRepository.incrementVisitCount).not.toHaveBeenCalled();
    });

    it('should allow access for allowed visitor', async () => {
      // Arrange
      const islandWithVisitor = {
        ...mockIsland,
        permissions: { ...mockIsland.permissions, allowedVisitors: ['allowed_visitor'] }
      };
      vi.mocked(mockWorldRepository.findById).mockResolvedValue(islandWithVisitor);
      vi.mocked(mockWorldRepository.incrementVisitCount).mockResolvedValue();

      // Act
      const result = await worldService.getIsland('island_123', 'allowed_visitor');

      // Assert
      expect(result.success).toBe(true);
      expect(result.data).toEqual(islandWithVisitor);
      expect(mockWorldRepository.incrementVisitCount).toHaveBeenCalledWith('island_123');
    });
  });

  describe('updateIslandPermissions', () => {
    it('should update island permissions', async () => {
      // Arrange
      vi.mocked(mockWorldRepository.findByOwnerId).mockResolvedValue(mockIsland);
      vi.mocked(mockWorldRepository.update).mockResolvedValue(mockIsland);

      const newPermissions = {
        isPublic: true,
        allowedVisitors: ['friend_1', 'friend_2']
      };

      // Act
      const result = await worldService.updateIslandPermissions('player_456', newPermissions);

      // Assert
      expect(result.success).toBe(true);
      expect(mockWorldRepository.update).toHaveBeenCalledWith('island_123', expect.objectContaining({
        permissions: expect.objectContaining({
          isPublic: true,
          allowedVisitors: ['friend_1', 'friend_2'],
          coopMembers: [], // Should preserve existing values
          buildPermissions: expect.any(Map)
        }),
        lastModified: expect.any(Date)
      }));
    });
  });

  describe('getPublicIslands', () => {
    it('should return public islands with default pagination', async () => {
      // Arrange
      const publicIslands = [mockIsland];
      vi.mocked(mockWorldRepository.getPublicIslands).mockResolvedValue(publicIslands);

      // Act
      const result = await worldService.getPublicIslands();

      // Assert
      expect(result.success).toBe(true);
      expect(result.data).toEqual(publicIslands);
      expect(mockWorldRepository.getPublicIslands).toHaveBeenCalledWith(20, 0);
    });

    it('should return public islands with custom pagination', async () => {
      // Arrange
      const publicIslands = [mockIsland];
      vi.mocked(mockWorldRepository.getPublicIslands).mockResolvedValue(publicIslands);

      // Act
      const result = await worldService.getPublicIslands(10, 5);

      // Assert
      expect(result.success).toBe(true);
      expect(result.data).toEqual(publicIslands);
      expect(mockWorldRepository.getPublicIslands).toHaveBeenCalledWith(10, 5);
    });
  });

  describe('saveDirtyChunks', () => {
    it('should save dirty chunks and mark them clean', async () => {
      // Arrange
      const dirtyChunks: WorldChunk[] = [
        {
          chunkId: 'chunk_0_0_0',
          position: { x: 0, y: 0, z: 0 },
          voxelData: VoxelDataManager.createEmptyChunkData(),
          entities: [],
          lastModified: new Date(),
          isLoaded: true,
          isDirty: true
        }
      ];
      vi.mocked(mockWorldRepository.findByOwnerId).mockResolvedValue(mockIsland);
      vi.mocked(mockWorldRepository.getDirtyChunks).mockResolvedValue(dirtyChunks);
      vi.mocked(mockWorldRepository.saveChunks).mockResolvedValue();
      vi.mocked(mockWorldRepository.markChunksClean).mockResolvedValue();

      // Act
      const result = await worldService.saveDirtyChunks('player_456');

      // Assert
      expect(result.success).toBe(true);
      expect(result.data).toBe(1);
      expect(mockWorldRepository.saveChunks).toHaveBeenCalledWith('island_123', dirtyChunks);
      expect(mockWorldRepository.markChunksClean).toHaveBeenCalledWith('island_123', ['chunk_0_0_0']);
    });

    it('should return 0 if no dirty chunks', async () => {
      // Arrange
      vi.mocked(mockWorldRepository.findByOwnerId).mockResolvedValue(mockIsland);
      vi.mocked(mockWorldRepository.getDirtyChunks).mockResolvedValue([]);

      // Act
      const result = await worldService.saveDirtyChunks('player_456');

      // Assert
      expect(result.success).toBe(true);
      expect(result.data).toBe(0);
      expect(mockWorldRepository.saveChunks).not.toHaveBeenCalled();
      expect(mockWorldRepository.markChunksClean).not.toHaveBeenCalled();
    });
  });

  describe('getVoxelAt', () => {
    it('should return voxel block ID at position', async () => {
      // Arrange
      const chunkWithData: WorldChunk = {
        chunkId: 'chunk_0_0_0',
        position: { x: 0, y: 0, z: 0 },
        voxelData: VoxelDataManager.createEmptyChunkData(),
        entities: [],
        lastModified: new Date(),
        isLoaded: true,
        isDirty: false
      };
      
      // Set a block at position (0, 0, 0) within the chunk
      const localPos = { x: 0, y: 0, z: 0 };
      const index = VoxelDataManager.getVoxelIndex(localPos);
      chunkWithData.voxelData[index] = 5; // Block ID 5

      const islandWithData = { ...mockIsland, chunks: [chunkWithData] };
      vi.mocked(mockWorldRepository.findByOwnerId).mockResolvedValue(islandWithData);

      // Act
      const result = await worldService.getVoxelAt('player_456', { x: 0, y: 0, z: 0 });

      // Assert
      expect(result.success).toBe(true);
      expect(result.data).toBe(5);
    });

    it('should return 0 for empty voxel in non-existent chunk', async () => {
      // Arrange
      vi.mocked(mockWorldRepository.findByOwnerId).mockResolvedValue(mockIsland);

      // Act - Request voxel from a chunk that doesn't exist
      const result = await worldService.getVoxelAt('player_456', { x: 100, y: 100, z: 100 });

      // Assert
      expect(result.success).toBe(true);
      expect(result.data).toBe(0);
    });
  });

  describe('setVoxelAt', () => {
    it('should set voxel in existing chunk', async () => {
      // Arrange
      vi.mocked(mockWorldRepository.findByOwnerId).mockResolvedValue(mockIsland);
      vi.mocked(mockWorldRepository.applyVoxelChanges).mockResolvedValue();
      vi.mocked(mockWorldRepository.update).mockResolvedValue(mockIsland);

      // Act
      const result = await worldService.setVoxelAt('player_456', { x: 0, y: 0, z: 0 }, 3);

      // Assert
      expect(result.success).toBe(true);
      expect(mockWorldRepository.applyVoxelChanges).toHaveBeenCalledWith('island_123', [
        expect.objectContaining({
          position: { x: 0, y: 0, z: 0 },
          oldBlockId: 0,
          newBlockId: 3,
          playerId: 'player_456'
        })
      ]);
    });

    it('should create new chunk if it does not exist', async () => {
      // Arrange
      const islandWithoutTargetChunk = { ...mockIsland, chunks: [] as WorldChunk[] };
      vi.mocked(mockWorldRepository.findByOwnerId).mockResolvedValue(islandWithoutTargetChunk);
      vi.mocked(mockWorldRepository.applyVoxelChanges).mockResolvedValue();
      vi.mocked(mockWorldRepository.update).mockResolvedValue(mockIsland);

      // Act
      const result = await worldService.setVoxelAt('player_456', { x: 0, y: 0, z: 0 }, 3);

      // Assert
      expect(result.success).toBe(true);
      // Should have created a new chunk
      expect(islandWithoutTargetChunk.chunks).toHaveLength(1);
      expect(islandWithoutTargetChunk.chunks[0]?.chunkId).toBe('chunk_0_0_0');
    });
  });

  describe('error handling', () => {
    it('should handle repository errors gracefully', async () => {
      // Arrange
      vi.mocked(mockWorldRepository.findByOwnerId).mockRejectedValue(new Error('Database error'));

      // Act
      const result = await worldService.loadPlayerIsland('player_456');

      // Assert
      expect(result).toBeNull();
    });

    it('should handle save errors gracefully', async () => {
      // Arrange
      vi.mocked(mockWorldRepository.findByOwnerId).mockResolvedValue(mockIsland);
      vi.mocked(mockWorldRepository.applyVoxelChanges).mockRejectedValue(new Error('Save failed'));

      const changes: VoxelChange[] = [
        {
          position: { x: 5, y: 5, z: 5 },
          oldBlockId: 0,
          newBlockId: 1,
          timestamp: new Date(),
          playerId: 'player_456'
        }
      ];

      // Act
      const result = await worldService.saveIslandChanges('player_456', changes);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBe('Save failed');
    });
  });
});