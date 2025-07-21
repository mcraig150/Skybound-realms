import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { IslandRepository } from '../../repositories/IslandRepository';
import { Island, WorldChunk, VoxelChange, BuildPermission } from '../../models/Island';
import { database } from '../../shared/database';

// Mock the database
vi.mock('../../shared/database', () => ({
  database: {
    query: vi.fn(),
    transaction: vi.fn()
  }
}));

describe('IslandRepository', () => {
  let islandRepository: IslandRepository;
  let mockIsland: Island;
  let mockChunk: WorldChunk;

  beforeEach(() => {
    islandRepository = new IslandRepository();
    
    mockChunk = {
      chunkId: 'chunk_0_0_0',
      position: { x: 0, y: 0, z: 0 },
      voxelData: new Uint8Array(4096),
      entities: [],
      lastModified: new Date(),
      isLoaded: true,
      isDirty: false
    };

    mockIsland = {
      id: 'island_123',
      ownerId: 'player_123',
      chunks: [mockChunk],
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

    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('findById', () => {
    it('should return an island when found', async () => {
      const mockRows = [
        {
          id: 'island_123',
          owner_id: 'player_123',
          expansion_level: 1,
          permissions: '{"isPublic":false,"allowedVisitors":[],"coopMembers":[],"buildPermissions":{}}',
          visit_count: 0,
          created_at: '2023-01-01T00:00:00.000Z',
          last_modified: '2023-01-01T00:00:00.000Z',
          chunk_id: 'chunk_0_0_0',
          position: '{"x":0,"y":0,"z":0}',
          voxel_data: Buffer.from(new Uint8Array(4096)),
          entities: '[]',
          chunk_last_modified: '2023-01-01T00:00:00.000Z',
          is_loaded: true,
          is_dirty: false
        }
      ];

      (database.query as any).mockResolvedValue(mockRows);

      const result = await islandRepository.findById('island_123');

      expect(result).toBeDefined();
      expect(result?.id).toBe('island_123');
      expect(result?.ownerId).toBe('player_123');
      expect(result?.chunks).toHaveLength(1);
      expect(result!.chunks[0]?.chunkId).toBe('chunk_0_0_0');
    });

    it('should return null when island not found', async () => {
      (database.query as any).mockResolvedValue([]);

      const result = await islandRepository.findById('nonexistent');

      expect(result).toBeNull();
    });

    it('should handle database errors', async () => {
      (database.query as any).mockRejectedValue(new Error('Database error'));

      await expect(islandRepository.findById('island_123')).rejects.toThrow('Database error');
    });
  });

  describe('findByOwnerId', () => {
    it('should return an island when found by owner ID', async () => {
      const mockRows = [
        {
          id: 'island_123',
          owner_id: 'player_123',
          expansion_level: 1,
          permissions: '{"isPublic":false,"allowedVisitors":[],"coopMembers":[],"buildPermissions":{}}',
          visit_count: 0,
          created_at: '2023-01-01T00:00:00.000Z',
          last_modified: '2023-01-01T00:00:00.000Z',
          chunk_id: null,
          position: null,
          voxel_data: null,
          entities: null,
          chunk_last_modified: null,
          is_loaded: null,
          is_dirty: null
        }
      ];

      (database.query as any).mockResolvedValue(mockRows);

      const result = await islandRepository.findByOwnerId('player_123');

      expect(result).toBeDefined();
      expect(result?.ownerId).toBe('player_123');
    });

    it('should return null when owner not found', async () => {
      (database.query as any).mockResolvedValue([]);

      const result = await islandRepository.findByOwnerId('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('create', () => {
    it('should create a new island successfully', async () => {
      const mockClient = {
        query: vi.fn()
      };

      (database.transaction as any).mockImplementation(async (callback: any) => {
        return callback(mockClient);
      });

      mockClient.query
        .mockResolvedValueOnce({ rows: [{ id: 'island_123' }] }) // Island insert
        .mockResolvedValue({ rows: [] }); // Chunk inserts

      const mockFindById = vi.spyOn(islandRepository, 'findById').mockResolvedValue(mockIsland);

      const islandData = { ...mockIsland };
      delete (islandData as any).id;

      const result = await islandRepository.create(islandData);

      expect(result).toBeDefined();
      expect(mockClient.query).toHaveBeenCalled();
      expect(mockFindById).toHaveBeenCalledWith('island_123');
    });

    it('should handle transaction errors', async () => {
      (database.transaction as any).mockRejectedValue(new Error('Transaction failed'));

      const islandData = { ...mockIsland };
      delete (islandData as any).id;

      await expect(islandRepository.create(islandData)).rejects.toThrow('Transaction failed');
    });
  });

  describe('update', () => {
    it('should update island successfully', async () => {
      const mockClient = {
        query: vi.fn().mockResolvedValue({ rows: [] })
      };

      (database.transaction as any).mockImplementation(async (callback: any) => {
        return callback(mockClient);
      });

      const mockFindById = vi.spyOn(islandRepository, 'findById').mockResolvedValue(mockIsland);

      const updates = { expansionLevel: 2 };
      const result = await islandRepository.update('island_123', updates);

      expect(result).toBeDefined();
      expect(mockFindById).toHaveBeenCalledWith('island_123');
    });

    it('should handle update with chunks', async () => {
      const mockClient = {
        query: vi.fn().mockResolvedValue({ rows: [] })
      };

      (database.transaction as any).mockImplementation(async (callback: any) => {
        return callback(mockClient);
      });

      const mockFindById = vi.spyOn(islandRepository, 'findById').mockResolvedValue(mockIsland);

      const updates = {
        chunks: [mockChunk]
      };

      const result = await islandRepository.update('island_123', updates);

      expect(result).toBeDefined();
      expect(mockClient.query).toHaveBeenCalledWith('DELETE FROM world_chunks WHERE island_id = $1', ['island_123']);
    });
  });

  describe('delete', () => {
    it('should delete island successfully', async () => {
      const mockClient = {
        query: vi.fn()
          .mockResolvedValueOnce({ rows: [] }) // Delete chunks
          .mockResolvedValueOnce({ rowCount: 1 }) // Delete island
      };

      (database.transaction as any).mockImplementation(async (callback: any) => {
        return callback(mockClient);
      });

      const result = await islandRepository.delete('island_123');

      expect(result).toBe(true);
      expect(mockClient.query).toHaveBeenCalledTimes(2);
    });

    it('should return false when island not found', async () => {
      const mockClient = {
        query: vi.fn()
          .mockResolvedValueOnce({ rows: [] }) // Delete chunks
          .mockResolvedValueOnce({ rowCount: 0 }) // Delete island (not found)
      };

      (database.transaction as any).mockImplementation(async (callback: any) => {
        return callback(mockClient);
      });

      const result = await islandRepository.delete('nonexistent');

      expect(result).toBe(false);
    });
  });

  describe('loadChunks', () => {
    it('should load chunks for an island', async () => {
      const mockRows = [
        {
          chunk_id: 'chunk_0_0_0',
          position: '{"x":0,"y":0,"z":0}',
          voxel_data: Buffer.from(new Uint8Array(4096)),
          entities: '[]',
          last_modified: '2023-01-01T00:00:00.000Z',
          is_loaded: true,
          is_dirty: false
        }
      ];

      (database.query as any).mockResolvedValue(mockRows);

      const result = await islandRepository.loadChunks('island_123');

      expect(result).toHaveLength(1);
      expect(result[0]?.chunkId).toBe('chunk_0_0_0');
    });

    it('should load specific chunks by ID', async () => {
      (database.query as any).mockResolvedValue([]);

      await islandRepository.loadChunks('island_123', { chunkIds: ['chunk_0_0_0'] });

      expect(database.query).toHaveBeenCalledWith(
        expect.stringContaining('chunk_id = ANY($2)'),
        expect.arrayContaining(['island_123', ['chunk_0_0_0']])
      );
    });
  });

  describe('saveChunk', () => {
    it('should save a single chunk', async () => {
      (database.query as any).mockResolvedValue([]);

      await islandRepository.saveChunk('island_123', mockChunk);

      expect(database.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO world_chunks'),
        expect.arrayContaining([
          'chunk_0_0_0',
          'island_123',
          '{"x":0,"y":0,"z":0}',
          mockChunk.voxelData,
          '[]',
          mockChunk.lastModified,
          true,
          false
        ])
      );
    });
  });

  describe('saveChunks', () => {
    it('should save multiple chunks in a transaction', async () => {
      const mockClient = {
        query: vi.fn().mockResolvedValue({ rows: [] })
      };

      (database.transaction as any).mockImplementation(async (callback: any) => {
        return callback(mockClient);
      });

      await islandRepository.saveChunks('island_123', [mockChunk]);

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO world_chunks'),
        expect.any(Array)
      );
    });
  });

  describe('applyVoxelChanges', () => {
    it('should apply voxel changes and mark chunks dirty', async () => {
      const mockClient = {
        query: vi.fn().mockResolvedValue({ rows: [] })
      };

      (database.transaction as any).mockImplementation(async (callback: any) => {
        return callback(mockClient);
      });

      const changes: VoxelChange[] = [
        {
          position: { x: 0, y: 0, z: 0 },
          oldBlockId: 0,
          newBlockId: 1,
          timestamp: new Date(),
          playerId: 'player_123'
        }
      ];

      await islandRepository.applyVoxelChanges('island_123', changes);

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO voxel_changes'),
        expect.any(Array)
      );
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE world_chunks SET is_dirty = true'),
        expect.any(Array)
      );
    });
  });

  describe('getVoxelChangeHistory', () => {
    it('should get voxel change history', async () => {
      const mockRows = [
        {
          position: '{"x":0,"y":0,"z":0}',
          old_block_id: 0,
          new_block_id: 1,
          timestamp: '2023-01-01T00:00:00.000Z',
          player_id: 'player_123'
        }
      ];

      (database.query as any).mockResolvedValue(mockRows);

      const result = await islandRepository.getVoxelChangeHistory('island_123', 50);

      expect(result).toHaveLength(1);
      expect(result[0]?.oldBlockId).toBe(0);
      expect(result[0]?.newBlockId).toBe(1);
      expect(result[0]?.playerId).toBe('player_123');
    });
  });

  describe('getDirtyChunks', () => {
    it('should get dirty chunks', async () => {
      const mockRows = [
        {
          chunk_id: 'chunk_0_0_0',
          position: '{"x":0,"y":0,"z":0}',
          voxel_data: Buffer.from(new Uint8Array(4096)),
          entities: '[]',
          last_modified: '2023-01-01T00:00:00.000Z',
          is_loaded: true,
          is_dirty: true
        }
      ];

      (database.query as any).mockResolvedValue(mockRows);

      const result = await islandRepository.getDirtyChunks('island_123');

      expect(result).toHaveLength(1);
 expect(result[0]?.isDirty).toBe(true);
    });
  });

  describe('markChunksClean', () => {
    it('should mark chunks as clean', async () => {
      (database.query as any).mockResolvedValue([]);

      await islandRepository.markChunksClean('island_123', ['chunk_0_0_0']);

      expect(database.query).toHaveBeenCalledWith(
        expect.stringMatching(/UPDATE\s+world_chunks\s+SET\s+is_dirty\s*=\s*false/i),
        ['island_123', ['chunk_0_0_0']]
      );
    });

    it('should handle empty chunk list', async () => {
      await islandRepository.markChunksClean('island_123', []);

      expect(database.query).not.toHaveBeenCalled();
    });
  });

  describe('incrementVisitCount', () => {
    it('should increment visit count', async () => {
      (database.query as any).mockResolvedValue([]);

      await islandRepository.incrementVisitCount('island_123');

      expect(database.query).toHaveBeenCalledWith(
        'UPDATE islands SET visit_count = visit_count + 1 WHERE id = $1',
        ['island_123']
      );
    });
  });

  describe('getPublicIslands', () => {
    it('should get public islands', async () => {
      const mockRows = [
        {
          id: 'island_123',
          owner_id: 'player_123',
          expansion_level: 1,
          permissions: '{"isPublic":true,"allowedVisitors":[],"coopMembers":[],"buildPermissions":{}}',
          visit_count: 5,
          created_at: '2023-01-01T00:00:00.000Z',
          last_modified: '2023-01-01T00:00:00.000Z',
          chunk_id: null,
          position: null,
          voxel_data: null,
          entities: null,
          chunk_last_modified: null,
          is_loaded: null,
          is_dirty: null
        }
      ];

      (database.query as any).mockResolvedValue(mockRows);

      const result = await islandRepository.getPublicIslands(10, 0);

      expect(result).toHaveLength(1);
      expect(result[0]?.permissions.isPublic).toBe(true);
      expect(database.query).toHaveBeenCalledWith(
        expect.stringContaining("(i.permissions->>'isPublic')::boolean = true"),
        [10, 0]
      );
    });
  });
});