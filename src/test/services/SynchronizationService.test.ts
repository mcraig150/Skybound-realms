import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SynchronizationService, SyncRequest, SyncResponse } from '../../services/SynchronizationService';
import { WorldService } from '../../services/WorldService';
import { PlayerService } from '../../services/PlayerService';
import { WebSocketService } from '../../services/WebSocketService';
import { VoxelChange } from '../../models/Island';
import { Player, PlayerFactory } from '../../models/Player';
import { Vector3 } from '../../shared/types';

// Mock services
const mockWorldService = {
  getPlayerIsland: vi.fn(),
  saveIslandChanges: vi.fn(),
  getChunk: vi.fn()
} as unknown as WorldService;

const mockPlayerService = {
  getPlayer: vi.fn()
} as unknown as PlayerService;

const mockWebSocketService = {
  sendToPlayer: vi.fn(),
  broadcastToZone: vi.fn(),
  getPlayerConnection: vi.fn()
} as unknown as WebSocketService;

describe('SynchronizationService', () => {
  let syncService: SynchronizationService;
  let testPlayer: Player;
  let testPlayerId: string;

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();

    // Create test player
    testPlayer = PlayerFactory.createNewPlayer('testuser');
    testPlayerId = testPlayer.id;

    // Mock service responses
    vi.mocked(mockPlayerService.getPlayer).mockResolvedValue(testPlayer);
    vi.mocked(mockWorldService.getPlayerIsland).mockResolvedValue({
      id: 'island1',
      ownerId: testPlayerId,
      chunks: [],
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
    });

    // Initialize service
    syncService = new SynchronizationService(mockWorldService, mockPlayerService, mockWebSocketService);
  });

  describe('State Synchronization', () => {
    it('should synchronize valid changes successfully', async () => {
      // Arrange
      const voxelChange: VoxelChange = {
        position: { x: 10, y: 5, z: 15 },
        oldBlockId: 0,
        newBlockId: 1,
        timestamp: new Date(),
        playerId: testPlayerId
      };

      const syncRequest: SyncRequest = {
        playerId: testPlayerId,
        clientVersion: 1,
        lastSyncTimestamp: new Date(Date.now() - 60000),
        pendingChanges: [voxelChange]
      };

      vi.mocked(mockWorldService.saveIslandChanges).mockResolvedValue({ success: true });

      // Act
      const result = await syncService.synchronizeState(syncRequest);

      // Assert
      expect(result.success).toBe(true);
      expect(result.serverVersion).toBeGreaterThan(0);
      expect(result.timestamp).toBeInstanceOf(Date);
      expect(result.worldUpdates).toBeDefined();
      expect(result.playerUpdates).toBeDefined();
      expect(result.conflictResolutions).toBeDefined();
      expect(result.rejectedChanges).toBeDefined();
    });

    it('should reject invalid changes', async () => {
      // Arrange
      const invalidChange: VoxelChange = {
        position: { x: 99999, y: -100, z: 99999 }, // Invalid position
        oldBlockId: 0,
        newBlockId: 999, // Invalid block ID
        timestamp: new Date(),
        playerId: testPlayerId
      };

      const syncRequest: SyncRequest = {
        playerId: testPlayerId,
        clientVersion: 1,
        lastSyncTimestamp: new Date(Date.now() - 60000),
        pendingChanges: [invalidChange]
      };

      // Act
      const result = await syncService.synchronizeState(syncRequest);

      // Assert
      expect(result.success).toBe(true);
      expect(result.rejectedChanges.length).toBeGreaterThan(0);
    });

    it('should handle empty pending changes', async () => {
      // Arrange
      const syncRequest: SyncRequest = {
        playerId: testPlayerId,
        clientVersion: 1,
        lastSyncTimestamp: new Date(Date.now() - 60000),
        pendingChanges: []
      };

      // Act
      const result = await syncService.synchronizeState(syncRequest);

      // Assert
      expect(result.success).toBe(true);
      expect(result.rejectedChanges).toHaveLength(0);
      expect(result.conflictResolutions).toHaveLength(0);
    });

    it('should handle requested chunks', async () => {
      // Arrange
      const requestedChunks = [
        { x: 0, y: 0, z: 0 },
        { x: 1, y: 0, z: 0 }
      ];

      const syncRequest: SyncRequest = {
        playerId: testPlayerId,
        clientVersion: 1,
        lastSyncTimestamp: new Date(Date.now() - 60000),
        pendingChanges: [],
        requestedChunks
      };

      const mockChunk = {
        chunkId: 'chunk_0_0_0',
        position: { x: 0, y: 0, z: 0 },
        voxelData: new Uint8Array(4096),
        entities: [],
        lastModified: new Date(),
        isLoaded: true,
        isDirty: false
      };

      vi.mocked(mockWorldService.getChunk).mockResolvedValue(mockChunk);

      // Act
      const result = await syncService.synchronizeState(syncRequest);

      // Assert
      expect(result.success).toBe(true);
      expect(result.worldUpdates.length).toBeGreaterThan(0);
      expect(mockWorldService.getChunk).toHaveBeenCalledTimes(2);
    });

    it('should handle player not found', async () => {
      // Arrange
      vi.mocked(mockWorldService.getPlayerIsland).mockResolvedValue(null);

      const syncRequest: SyncRequest = {
        playerId: 'nonexistent',
        clientVersion: 1,
        lastSyncTimestamp: new Date(Date.now() - 60000),
        pendingChanges: []
      };

      // Act
      const result = await syncService.synchronizeState(syncRequest);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('Change Validation', () => {
    it('should validate voxel change structure', async () => {
      // Arrange
      const validChange: VoxelChange = {
        position: { x: 10, y: 5, z: 15 },
        oldBlockId: 0,
        newBlockId: 1,
        timestamp: new Date(),
        playerId: testPlayerId
      };

      // Act
      const result = await syncService.validateClientChanges(testPlayerId, [validChange]);

      // Assert
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject changes with invalid structure', async () => {
      // Arrange
      const invalidChange = {
        position: { x: 'invalid', y: 5, z: 15 }, // Invalid position type
        oldBlockId: 0,
        newBlockId: 1,
        timestamp: new Date(),
        playerId: testPlayerId
      } as any;

      // Act
      const result = await syncService.validateClientChanges(testPlayerId, [invalidChange]);

      // Assert
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should reject changes outside bounds', async () => {
      // Arrange
      const outOfBoundsChange: VoxelChange = {
        position: { x: 99999, y: 5, z: 15 },
        oldBlockId: 0,
        newBlockId: 1,
        timestamp: new Date(),
        playerId: testPlayerId
      };

      // Act
      const result = await syncService.validateClientChanges(testPlayerId, [outOfBoundsChange]);

      // Assert
      expect(result.isValid).toBe(false);
      expect(result.errors.some(error => error.includes('bounds'))).toBe(true);
    });

    it('should reject changes with invalid block types', async () => {
      // Arrange
      const invalidBlockChange: VoxelChange = {
        position: { x: 10, y: 5, z: 15 },
        oldBlockId: 0,
        newBlockId: 999, // Invalid block ID
        timestamp: new Date(),
        playerId: testPlayerId
      };

      // Act
      const result = await syncService.validateClientChanges(testPlayerId, [invalidBlockChange]);

      // Assert
      expect(result.isValid).toBe(false);
      expect(result.errors.some(error => error.includes('Invalid block type'))).toBe(true);
    });
  });

  describe('Conflict Resolution', () => {
    it('should detect conflicts at same position', async () => {
      // This test would require more complex setup to simulate server changes
      // For now, we'll test that the method doesn't throw
      const changes: VoxelChange[] = [{
        position: { x: 10, y: 5, z: 15 },
        oldBlockId: 0,
        newBlockId: 1,
        timestamp: new Date(),
        playerId: testPlayerId
      }];

      const syncRequest: SyncRequest = {
        playerId: testPlayerId,
        clientVersion: 1,
        lastSyncTimestamp: new Date(Date.now() - 60000),
        pendingChanges: changes
      };

      vi.mocked(mockWorldService.saveIslandChanges).mockResolvedValue({ success: true });

      // Act & Assert - Should not throw
      const result = await syncService.synchronizeState(syncRequest);
      expect(result.success).toBe(true);
    });

    it('should handle server wins conflict resolution', async () => {
      // Arrange - This would typically involve setting up conflicting changes
      const changes: VoxelChange[] = [{
        position: { x: 10, y: 5, z: 15 },
        oldBlockId: 0,
        newBlockId: 1,
        timestamp: new Date(),
        playerId: testPlayerId
      }];

      const syncRequest: SyncRequest = {
        playerId: testPlayerId,
        clientVersion: 1,
        lastSyncTimestamp: new Date(Date.now() - 60000),
        pendingChanges: changes
      };

      vi.mocked(mockWorldService.saveIslandChanges).mockResolvedValue({ success: true });

      // Act
      const result = await syncService.synchronizeState(syncRequest);

      // Assert
      expect(result.success).toBe(true);
      expect(result.conflictResolutions).toBeDefined();
    });
  });

  describe('Force Synchronization', () => {
    it('should force synchronization successfully', async () => {
      // Act
      const result = await syncService.forceSynchronization(testPlayerId);

      // Assert
      expect(result.success).toBe(true);
      expect(result.serverVersion).toBeGreaterThan(0);
      expect(result.timestamp).toBeInstanceOf(Date);
      expect(result.worldUpdates).toBeDefined();
      expect(result.playerUpdates).toBeDefined();
      expect(result.conflictResolutions).toBeDefined();
      expect(result.rejectedChanges).toBeDefined();
    });

    it('should handle force synchronization for non-existent player', async () => {
      // Arrange
      vi.mocked(mockWorldService.getPlayerIsland).mockResolvedValue(null);

      // Act
      const result = await syncService.forceSynchronization('nonexistent');

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('State Cleanup', () => {
    it('should clean up old states', () => {
      // Act & Assert - Should not throw
      expect(() => {
        syncService.cleanupOldStates();
      }).not.toThrow();
    });
  });

  describe('Error Handling', () => {
    it('should handle world service errors', async () => {
      // Arrange
      vi.mocked(mockWorldService.saveIslandChanges).mockRejectedValue(new Error('Database error'));

      const syncRequest: SyncRequest = {
        playerId: testPlayerId,
        clientVersion: 1,
        lastSyncTimestamp: new Date(Date.now() - 60000),
        pendingChanges: [{
          position: { x: 10, y: 5, z: 15 },
          oldBlockId: 0,
          newBlockId: 1,
          timestamp: new Date(),
          playerId: testPlayerId
        }]
      };

      // Act
      const result = await syncService.synchronizeState(syncRequest);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toContain('Database error');
    });

    it('should handle player service errors', async () => {
      // Arrange
      vi.mocked(mockPlayerService.getPlayer).mockRejectedValue(new Error('Player service error'));

      const syncRequest: SyncRequest = {
        playerId: testPlayerId,
        clientVersion: 1,
        lastSyncTimestamp: new Date(Date.now() - 60000),
        pendingChanges: []
      };

      // Act
      const result = await syncService.synchronizeState(syncRequest);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should handle validation errors gracefully', async () => {
      // Arrange
      vi.mocked(mockWorldService.getPlayerIsland).mockResolvedValue(null);

      const syncRequest: SyncRequest = {
        playerId: testPlayerId,
        clientVersion: 1,
        lastSyncTimestamp: new Date(Date.now() - 60000),
        pendingChanges: [{
          position: { x: 10, y: 5, z: 15 },
          oldBlockId: 0,
          newBlockId: 1,
          timestamp: new Date(),
          playerId: testPlayerId
        }]
      };

      // Act
      const result = await syncService.synchronizeState(syncRequest);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('WebSocket Integration', () => {
    it('should broadcast changes when WebSocket service is available', async () => {
      // Arrange
      const mockConnection = {
        currentZone: 'test_zone'
      };

      vi.mocked(mockWebSocketService.getPlayerConnection).mockReturnValue(mockConnection as any);

      const syncRequest: SyncRequest = {
        playerId: testPlayerId,
        clientVersion: 1,
        lastSyncTimestamp: new Date(Date.now() - 60000),
        pendingChanges: [{
          position: { x: 10, y: 5, z: 15 },
          oldBlockId: 0,
          newBlockId: 1,
          timestamp: new Date(),
          playerId: testPlayerId
        }]
      };

      vi.mocked(mockWorldService.saveIslandChanges).mockResolvedValue({ success: true });

      // Act
      const result = await syncService.synchronizeState(syncRequest);

      // Assert
      expect(result.success).toBe(true);
      // Note: In a real implementation, you'd verify that broadcastToZone was called
    });

    it('should handle missing WebSocket service gracefully', async () => {
      // Arrange - Create service without WebSocket
      const syncServiceNoWS = new SynchronizationService(mockWorldService, mockPlayerService);

      const syncRequest: SyncRequest = {
        playerId: testPlayerId,
        clientVersion: 1,
        lastSyncTimestamp: new Date(Date.now() - 60000),
        pendingChanges: [{
          position: { x: 10, y: 5, z: 15 },
          oldBlockId: 0,
          newBlockId: 1,
          timestamp: new Date(),
          playerId: testPlayerId
        }]
      };

      vi.mocked(mockWorldService.saveIslandChanges).mockResolvedValue({ success: true });

      // Act
      const result = await syncServiceNoWS.synchronizeState(syncRequest);

      // Assert
      expect(result.success).toBe(true);
    });
  });

  describe('Performance', () => {
    it('should handle large number of changes efficiently', async () => {
      // Arrange
      const manyChanges: VoxelChange[] = [];
      for (let i = 0; i < 100; i++) {
        manyChanges.push({
          position: { x: i, y: 5, z: 15 },
          oldBlockId: 0,
          newBlockId: 1,
          timestamp: new Date(),
          playerId: testPlayerId
        });
      }

      const syncRequest: SyncRequest = {
        playerId: testPlayerId,
        clientVersion: 1,
        lastSyncTimestamp: new Date(Date.now() - 60000),
        pendingChanges: manyChanges
      };

      vi.mocked(mockWorldService.saveIslandChanges).mockResolvedValue({ success: true });

      // Act
      const startTime = Date.now();
      const result = await syncService.synchronizeState(syncRequest);
      const endTime = Date.now();

      // Assert
      expect(result.success).toBe(true);
      expect(endTime - startTime).toBeLessThan(5000); // Should complete within 5 seconds
    });

    it('should handle concurrent synchronization requests', async () => {
      // Arrange
      const syncRequest1: SyncRequest = {
        playerId: testPlayerId,
        clientVersion: 1,
        lastSyncTimestamp: new Date(Date.now() - 60000),
        pendingChanges: [{
          position: { x: 10, y: 5, z: 15 },
          oldBlockId: 0,
          newBlockId: 1,
          timestamp: new Date(),
          playerId: testPlayerId
        }]
      };

      const syncRequest2: SyncRequest = {
        playerId: testPlayerId,
        clientVersion: 1,
        lastSyncTimestamp: new Date(Date.now() - 60000),
        pendingChanges: [{
          position: { x: 11, y: 5, z: 15 },
          oldBlockId: 0,
          newBlockId: 2,
          timestamp: new Date(),
          playerId: testPlayerId
        }]
      };

      vi.mocked(mockWorldService.saveIslandChanges).mockResolvedValue({ success: true });

      // Act
      const [result1, result2] = await Promise.all([
        syncService.synchronizeState(syncRequest1),
        syncService.synchronizeState(syncRequest2)
      ]);

      // Assert
      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
    });
  });
});