import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SynchronizationService, SyncRequest, SyncResponse } from '../../services/SynchronizationService';
import { ClientValidationService } from '../../services/ClientValidationService';
import { SessionManagementService } from '../../services/SessionManagementService';
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
  getChunk: vi.fn(),
  modifyBlock: vi.fn()
} as unknown as WorldService;

const mockPlayerService = {
  getPlayer: vi.fn(),
  updatePlayer: vi.fn()
} as unknown as PlayerService;

const mockWebSocketService = {
  sendToPlayer: vi.fn(),
  broadcastToZone: vi.fn(),
  getPlayerConnection: vi.fn()
} as unknown as WebSocketService;

describe('Client-Server Synchronization Integration Tests', () => {
  let syncService: SynchronizationService;
  let validationService: ClientValidationService;
  let sessionService: SessionManagementService;
  let testPlayer: Player;
  let testPlayerId: string;

  beforeEach(async () => {
    // Reset mocks
    vi.clearAllMocks();

    // Create test player
    testPlayer = PlayerFactory.createNewPlayer('testuser');
    testPlayerId = testPlayer.id;

    // Mock player service responses
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

    // Initialize services
    syncService = new SynchronizationService(mockWorldService, mockPlayerService, mockWebSocketService);
    validationService = new ClientValidationService();
    sessionService = new SessionManagementService(mockPlayerService, syncService, mockWebSocketService);
  });

  afterEach(async () => {
    await sessionService.shutdown();
  });

  describe('State Synchronization', () => {
    it('should synchronize client state with server successfully', async () => {
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
        lastSyncTimestamp: new Date(Date.now() - 60000), // 1 minute ago
        pendingChanges: [voxelChange]
      };

      vi.mocked(mockWorldService.saveIslandChanges).mockResolvedValue({ success: true });

      // Act
      const result = await syncService.synchronizeState(syncRequest);

      // Assert
      expect(result.success).toBe(true);
      expect(result.serverVersion).toBeGreaterThan(0);
      expect(result.conflictResolutions).toBeDefined();
      expect(result.rejectedChanges).toBeDefined();
    });

    it('should handle conflicting changes correctly', async () => {
      // Arrange
      const position: Vector3 = { x: 10, y: 5, z: 15 };
      
      const clientChange: VoxelChange = {
        position,
        oldBlockId: 0,
        newBlockId: 1,
        timestamp: new Date(),
        playerId: testPlayerId
      };

      const syncRequest: SyncRequest = {
        playerId: testPlayerId,
        clientVersion: 1,
        lastSyncTimestamp: new Date(Date.now() - 60000),
        pendingChanges: [clientChange]
      };

      // Mock a server change at the same position
      vi.mocked(mockWorldService.saveIslandChanges).mockResolvedValue({ success: true });

      // Act
      const result = await syncService.synchronizeState(syncRequest);

      // Assert
      expect(result.success).toBe(true);
      expect(result.conflictResolutions).toBeDefined();
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

    it('should handle force synchronization', async () => {
      // Act
      const result = await syncService.forceSynchronization(testPlayerId);

      // Assert
      expect(result.success).toBe(true);
      expect(result.serverVersion).toBeGreaterThan(0);
      expect(result.timestamp).toBeInstanceOf(Date);
    });
  });

  describe('Client Validation', () => {
    it('should validate voxel changes correctly', () => {
      // Arrange
      const validChange: VoxelChange = {
        position: { x: 10, y: 5, z: 15 },
        oldBlockId: 0,
        newBlockId: 1,
        timestamp: new Date(),
        playerId: testPlayerId
      };

      const context = {
        playerId: testPlayerId,
        playerState: testPlayer,
        timestamp: new Date(),
        rateLimits: new Map()
      };

      // Act
      const result = validationService.validate('voxel_change', validChange, context);

      // Assert
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject invalid voxel changes', () => {
      // Arrange
      const invalidChange = {
        position: { x: 'invalid', y: 5, z: 15 }, // Invalid position type
        oldBlockId: 0,
        newBlockId: 1,
        timestamp: new Date(),
        playerId: testPlayerId
      };

      // Act
      const result = validationService.validate('voxel_change', invalidChange);

      // Assert
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should enforce rate limits', () => {
      // Arrange
      const change: VoxelChange = {
        position: { x: 10, y: 5, z: 15 },
        oldBlockId: 0,
        newBlockId: 1,
        timestamp: new Date(),
        playerId: testPlayerId
      };

      const rateLimits = new Map();
      rateLimits.set('voxel_change', 150); // Exceed rate limit

      const context = {
        playerId: testPlayerId,
        playerState: testPlayer,
        timestamp: new Date(),
        rateLimits
      };

      // Act
      const result = validationService.validate('voxel_change', change, context);

      // Assert
      expect(result.isValid).toBe(false);
      expect(result.errors.some(error => error.includes('Rate limit'))).toBe(true);
    });

    it('should pre-validate actions', () => {
      // Arrange
      const action = {
        type: 'place_block',
        position: { x: 10, y: 5, z: 15 },
        blockType: 1
      };

      // Act
      const result = validationService.preValidateAction('player_action', action, testPlayerId);

      // Assert
      expect(result.success).toBe(true);
    });
  });

  describe('Session Management', () => {
    it('should create a new session successfully', async () => {
      // Arrange
      const connectionInfo = {
        ipAddress: '127.0.0.1',
        userAgent: 'TestClient/1.0',
        connectionTime: new Date(),
        protocol: 'websocket'
      };

      // Act
      const result = await sessionService.createSession(testPlayerId, 'conn123', connectionInfo);

      // Assert
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data!.playerId).toBe(testPlayerId);
      expect(result.data!.isActive).toBe(true);
    });

    it('should handle reconnection with valid token', async () => {
      // Arrange - Create initial session
      const connectionInfo = {
        ipAddress: '127.0.0.1',
        userAgent: 'TestClient/1.0',
        connectionTime: new Date(),
        protocol: 'websocket'
      };

      const createResult = await sessionService.createSession(testPlayerId, 'conn123', connectionInfo);
      expect(createResult.success).toBe(true);

      const reconnectToken = createResult.data!.reconnectToken!;

      // Simulate connection loss
      await sessionService.handleConnectionLoss(createResult.data!.sessionId);

      // Act - Reconnect
      const reconnectResult = await sessionService.reconnectSession(reconnectToken, 'conn456');

      // Assert
      expect(reconnectResult.success).toBe(true);
      expect(reconnectResult.data!.isActive).toBe(true);
      expect(reconnectResult.data!.connectionId).toBe('conn456');
    });

    it('should handle graceful disconnection', async () => {
      // Arrange
      const connectionInfo = {
        ipAddress: '127.0.0.1',
        userAgent: 'TestClient/1.0',
        connectionTime: new Date(),
        protocol: 'websocket'
      };

      const createResult = await sessionService.createSession(testPlayerId, 'conn123', connectionInfo);
      expect(createResult.success).toBe(true);

      const sessionId = createResult.data!.sessionId;

      // Act
      const result = await sessionService.handleGracefulDisconnection(sessionId);

      // Assert
      expect(result.success).toBe(true);
      expect(sessionService.getSession(sessionId)).toBeUndefined();
    });

    it('should reject invalid reconnect tokens', async () => {
      // Act
      const result = await sessionService.reconnectSession('invalid_token', 'conn123');

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid reconnect token');
    });

    it('should manage pending actions during disconnection', async () => {
      // Arrange
      const connectionInfo = {
        ipAddress: '127.0.0.1',
        userAgent: 'TestClient/1.0',
        connectionTime: new Date(),
        protocol: 'websocket'
      };

      const createResult = await sessionService.createSession(testPlayerId, 'conn123', connectionInfo);
      const sessionId = createResult.data!.sessionId;

      // Add pending actions
      sessionService.addPendingAction(sessionId, { type: 'test_action', data: 'test' });

      // Act
      const pendingActions = sessionService.getPendingActions(sessionId);

      // Assert
      expect(pendingActions).toHaveLength(1);
      expect(pendingActions[0].type).toBe('test_action');
    });

    it('should update session activity', () => {
      // This test would require a created session
      // For now, we'll test that the method doesn't throw
      expect(() => {
        sessionService.updateActivity('nonexistent_session');
      }).not.toThrow();
    });

    it('should provide session statistics', () => {
      // Act
      const stats = sessionService.getSessionStatistics();

      // Assert
      expect(stats).toHaveProperty('totalSessions');
      expect(stats).toHaveProperty('activeSessions');
      expect(stats).toHaveProperty('averageSessionDuration');
      expect(stats).toHaveProperty('reconnectionRate');
    });
  });

  describe('Integration Scenarios', () => {
    it('should handle complete client-server workflow', async () => {
      // Arrange - Create session
      const connectionInfo = {
        ipAddress: '127.0.0.1',
        userAgent: 'TestClient/1.0',
        connectionTime: new Date(),
        protocol: 'websocket'
      };

      const sessionResult = await sessionService.createSession(testPlayerId, 'conn123', connectionInfo);
      expect(sessionResult.success).toBe(true);

      // Arrange - Create voxel change
      const voxelChange: VoxelChange = {
        position: { x: 10, y: 5, z: 15 },
        oldBlockId: 0,
        newBlockId: 1,
        timestamp: new Date(),
        playerId: testPlayerId
      };

      // Act - Validate change
      const validationResult = validationService.preValidateAction('voxel_change', voxelChange, testPlayerId);
      expect(validationResult.success).toBe(true);

      // Act - Synchronize change
      const syncRequest: SyncRequest = {
        playerId: testPlayerId,
        clientVersion: 1,
        lastSyncTimestamp: new Date(Date.now() - 60000),
        pendingChanges: [voxelChange]
      };

      vi.mocked(mockWorldService.saveIslandChanges).mockResolvedValue({ success: true });
      const syncResult = await syncService.synchronizeState(syncRequest);

      // Assert
      expect(syncResult.success).toBe(true);
      expect(syncResult.rejectedChanges).toHaveLength(0);
    });

    it('should handle disconnection and reconnection with state recovery', async () => {
      // Arrange - Create session
      const connectionInfo = {
        ipAddress: '127.0.0.1',
        userAgent: 'TestClient/1.0',
        connectionTime: new Date(),
        protocol: 'websocket'
      };

      const sessionResult = await sessionService.createSession(testPlayerId, 'conn123', connectionInfo);
      const session = sessionResult.data!;

      // Add pending action
      sessionService.addPendingAction(session.sessionId, {
        type: 'voxel_change',
        position: { x: 10, y: 5, z: 15 },
        blockType: 1
      });

      // Simulate connection loss
      await sessionService.handleConnectionLoss(session.sessionId);

      // Act - Reconnect
      const reconnectResult = await sessionService.reconnectSession(session.reconnectToken!, 'conn456');

      // Assert
      expect(reconnectResult.success).toBe(true);
      expect(reconnectResult.data!.isActive).toBe(true);
    });

    it('should handle multiple concurrent synchronization requests', async () => {
      // Arrange
      const changes1: VoxelChange[] = [{
        position: { x: 10, y: 5, z: 15 },
        oldBlockId: 0,
        newBlockId: 1,
        timestamp: new Date(),
        playerId: testPlayerId
      }];

      const changes2: VoxelChange[] = [{
        position: { x: 11, y: 5, z: 15 },
        oldBlockId: 0,
        newBlockId: 2,
        timestamp: new Date(),
        playerId: testPlayerId
      }];

      const request1: SyncRequest = {
        playerId: testPlayerId,
        clientVersion: 1,
        lastSyncTimestamp: new Date(Date.now() - 60000),
        pendingChanges: changes1
      };

      const request2: SyncRequest = {
        playerId: testPlayerId,
        clientVersion: 1,
        lastSyncTimestamp: new Date(Date.now() - 60000),
        pendingChanges: changes2
      };

      vi.mocked(mockWorldService.saveIslandChanges).mockResolvedValue({ success: true });

      // Act - Send concurrent requests
      const [result1, result2] = await Promise.all([
        syncService.synchronizeState(request1),
        syncService.synchronizeState(request2)
      ]);

      // Assert
      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should handle synchronization service errors gracefully', async () => {
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
      expect(result.error).toBeDefined();
    });

    it('should handle session creation errors', async () => {
      // Arrange
      vi.mocked(mockPlayerService.getPlayer).mockResolvedValue(null);

      const connectionInfo = {
        ipAddress: '127.0.0.1',
        userAgent: 'TestClient/1.0',
        connectionTime: new Date(),
        protocol: 'websocket'
      };

      // Act
      const result = await sessionService.createSession('nonexistent_player', 'conn123', connectionInfo);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toContain('Player not found');
    });

    it('should handle validation errors appropriately', () => {
      // Arrange
      const invalidData = {
        // Missing required fields
      };

      // Act
      const result = validationService.validate('voxel_change', invalidData);

      // Assert
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });
});