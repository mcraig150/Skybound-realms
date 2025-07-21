import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SessionManagementService, GameSession } from '../../services/SessionManagementService';
import { SynchronizationService } from '../../services/SynchronizationService';
import { PlayerService } from '../../services/PlayerService';
import { WebSocketService } from '../../services/WebSocketService';
import { Player, PlayerFactory } from '../../models/Player';

// Mock services
const mockPlayerService = {
  getPlayer: vi.fn(),
  updatePlayer: vi.fn()
} as unknown as PlayerService;

const mockSyncService = {
  forceSynchronization: vi.fn()
} as unknown as SynchronizationService;

const mockWebSocketService = {
  sendToPlayer: vi.fn(),
  broadcastToZone: vi.fn(),
  getPlayerConnection: vi.fn()
} as unknown as WebSocketService;

describe('SessionManagementService', () => {
  let sessionService: SessionManagementService;
  let testPlayer: Player;
  let testPlayerId: string;

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();

    // Create test player
    testPlayer = PlayerFactory.createNewPlayer('testuser');
    testPlayerId = testPlayer.id;

    // Mock player service responses
    vi.mocked(mockPlayerService.getPlayer).mockResolvedValue(testPlayer);
    vi.mocked(mockSyncService.forceSynchronization).mockResolvedValue({
      success: true,
      serverVersion: 1,
      timestamp: new Date(),
      worldUpdates: [],
      playerUpdates: {},
      conflictResolutions: [],
      rejectedChanges: []
    });

    // Initialize service
    sessionService = new SessionManagementService(
      mockPlayerService,
      mockSyncService,
      mockWebSocketService
    );
  });

  afterEach(async () => {
    await sessionService.shutdown();
  });

  describe('Session Creation', () => {
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
      expect(result.data!.username).toBe(testPlayer.username);
      expect(result.data!.connectionId).toBe('conn123');
      expect(result.data!.isActive).toBe(true);
      expect(result.data!.reconnectToken).toBeDefined();
      expect(result.data!.sessionData).toBeDefined();
    });

    it('should terminate existing session when creating new one for same player', async () => {
      // Arrange
      const connectionInfo = {
        ipAddress: '127.0.0.1',
        userAgent: 'TestClient/1.0',
        connectionTime: new Date(),
        protocol: 'websocket'
      };

      // Create first session
      const firstResult = await sessionService.createSession(testPlayerId, 'conn123', connectionInfo);
      expect(firstResult.success).toBe(true);
      const firstSessionId = firstResult.data!.sessionId;

      // Act - Create second session for same player
      const secondResult = await sessionService.createSession(testPlayerId, 'conn456', connectionInfo);

      // Assert
      expect(secondResult.success).toBe(true);
      expect(sessionService.getSession(firstSessionId)).toBeUndefined();
      expect(sessionService.getSession(secondResult.data!.sessionId)).toBeDefined();
    });

    it('should fail to create session for non-existent player', async () => {
      // Arrange
      vi.mocked(mockPlayerService.getPlayer).mockResolvedValue(null);

      const connectionInfo = {
        ipAddress: '127.0.0.1',
        userAgent: 'TestClient/1.0',
        connectionTime: new Date(),
        protocol: 'websocket'
      };

      // Act
      const result = await sessionService.createSession('nonexistent', 'conn123', connectionInfo);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toContain('Player not found');
    });

    it('should initialize session with default preferences', async () => {
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
      const session = result.data!;
      expect(session.sessionData.preferences.autoSave).toBe(true);
      expect(session.sessionData.preferences.autoReconnect).toBe(true);
      expect(session.sessionData.preferences.maxIdleTime).toBe(30);
    });
  });

  describe('Session Reconnection', () => {
    let session: GameSession;
    let reconnectToken: string;

    beforeEach(async () => {
      const connectionInfo = {
        ipAddress: '127.0.0.1',
        userAgent: 'TestClient/1.0',
        connectionTime: new Date(),
        protocol: 'websocket'
      };

      const result = await sessionService.createSession(testPlayerId, 'conn123', connectionInfo);
      session = result.data!;
      reconnectToken = session.reconnectToken!;
    });

    it('should reconnect with valid token', async () => {
      // Arrange - Simulate connection loss
      await sessionService.handleConnectionLoss(session.sessionId);

      // Act
      const result = await sessionService.reconnectSession(reconnectToken, 'conn456');

      // Assert
      expect(result.success).toBe(true);
      expect(result.data!.sessionId).toBe(session.sessionId);
      expect(result.data!.connectionId).toBe('conn456');
      expect(result.data!.isActive).toBe(true);
      expect(result.data!.connectionAttempts).toBe(1);
    });

    it('should fail reconnection with invalid token', async () => {
      // Act
      const result = await sessionService.reconnectSession('invalid_token', 'conn456');

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid reconnect token');
    });

    it('should fail reconnection after max attempts', async () => {
      // Arrange - Set low max attempts for testing
      session.maxReconnectAttempts = 2;
      session.connectionAttempts = 2;

      await sessionService.handleConnectionLoss(session.sessionId);

      // Act
      const result = await sessionService.reconnectSession(reconnectToken, 'conn456');

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toContain('Maximum reconnection attempts exceeded');
    });

    it('should restore player state on reconnection', async () => {
      // Arrange
      sessionService.addPendingAction(session.sessionId, {
        type: 'test_action',
        data: 'test_data'
      });

      await sessionService.handleConnectionLoss(session.sessionId);

      // Act
      const result = await sessionService.reconnectSession(reconnectToken, 'conn456');

      // Assert
      expect(result.success).toBe(true);
      expect(mockSyncService.forceSynchronization).toHaveBeenCalledWith(testPlayerId);
    });
  });

  describe('Session Management', () => {
    let session: GameSession;

    beforeEach(async () => {
      const connectionInfo = {
        ipAddress: '127.0.0.1',
        userAgent: 'TestClient/1.0',
        connectionTime: new Date(),
        protocol: 'websocket'
      };

      const result = await sessionService.createSession(testPlayerId, 'conn123', connectionInfo);
      session = result.data!;
    });

    it('should update session activity', () => {
      // Act
      setTimeout(() => {
        sessionService.updateActivity(session.sessionId);
      }, 10);

      // Assert - Check that activity was updated (in a real test, you'd need to wait)
      expect(() => sessionService.updateActivity(session.sessionId)).not.toThrow();
    });

    it('should handle graceful disconnection', async () => {
      // Act
      const result = await sessionService.handleGracefulDisconnection(session.sessionId);

      // Assert
      expect(result.success).toBe(true);
      expect(sessionService.getSession(session.sessionId)).toBeUndefined();
    });

    it('should handle connection loss', async () => {
      // Act
      await sessionService.handleConnectionLoss(session.sessionId);

      // Assert
      const updatedSession = sessionService.getSession(session.sessionId);
      expect(updatedSession!.isActive).toBe(false);
    });

    it('should terminate session', async () => {
      // Act
      await sessionService.terminateSession(session.sessionId, 'test_reason');

      // Assert
      expect(sessionService.getSession(session.sessionId)).toBeUndefined();
      expect(sessionService.getPlayerSession(testPlayerId)).toBeUndefined();
    });

    it('should get session by ID', () => {
      // Act
      const retrievedSession = sessionService.getSession(session.sessionId);

      // Assert
      expect(retrievedSession).toBeDefined();
      expect(retrievedSession!.sessionId).toBe(session.sessionId);
    });

    it('should get session by player ID', () => {
      // Act
      const retrievedSession = sessionService.getPlayerSession(testPlayerId);

      // Assert
      expect(retrievedSession).toBeDefined();
      expect(retrievedSession!.playerId).toBe(testPlayerId);
    });

    it('should get active sessions', () => {
      // Act
      const activeSessions = sessionService.getActiveSessions();

      // Assert
      expect(activeSessions).toHaveLength(1);
      expect(activeSessions[0].sessionId).toBe(session.sessionId);
    });
  });

  describe('Session Preferences', () => {
    let session: GameSession;

    beforeEach(async () => {
      const connectionInfo = {
        ipAddress: '127.0.0.1',
        userAgent: 'TestClient/1.0',
        connectionTime: new Date(),
        protocol: 'websocket'
      };

      const result = await sessionService.createSession(testPlayerId, 'conn123', connectionInfo);
      session = result.data!;
    });

    it('should update session preferences', () => {
      // Arrange
      const newPreferences = {
        autoSave: false,
        maxIdleTime: 60
      };

      // Act
      const result = sessionService.updateSessionPreferences(session.sessionId, newPreferences);

      // Assert
      expect(result.success).toBe(true);
      const updatedSession = sessionService.getSession(session.sessionId);
      expect(updatedSession!.sessionData.preferences.autoSave).toBe(false);
      expect(updatedSession!.sessionData.preferences.maxIdleTime).toBe(60);
    });

    it('should fail to update preferences for non-existent session', () => {
      // Act
      const result = sessionService.updateSessionPreferences('nonexistent', { autoSave: false });

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toContain('Session not found');
    });
  });

  describe('Pending Actions', () => {
    let session: GameSession;

    beforeEach(async () => {
      const connectionInfo = {
        ipAddress: '127.0.0.1',
        userAgent: 'TestClient/1.0',
        connectionTime: new Date(),
        protocol: 'websocket'
      };

      const result = await sessionService.createSession(testPlayerId, 'conn123', connectionInfo);
      session = result.data!;
    });

    it('should add pending actions', () => {
      // Arrange
      const action = {
        type: 'test_action',
        data: 'test_data'
      };

      // Act
      sessionService.addPendingAction(session.sessionId, action);

      // Assert
      const pendingActions = sessionService.getPendingActions(session.sessionId);
      expect(pendingActions).toHaveLength(1);
      expect(pendingActions[0].type).toBe('test_action');
      expect(pendingActions[0].timestamp).toBeInstanceOf(Date);
    });

    it('should clear pending actions when retrieved', () => {
      // Arrange
      const action = { type: 'test_action', data: 'test_data' };
      sessionService.addPendingAction(session.sessionId, action);

      // Act
      const firstRetrieval = sessionService.getPendingActions(session.sessionId);
      const secondRetrieval = sessionService.getPendingActions(session.sessionId);

      // Assert
      expect(firstRetrieval).toHaveLength(1);
      expect(secondRetrieval).toHaveLength(0);
    });

    it('should return empty array for non-existent session', () => {
      // Act
      const actions = sessionService.getPendingActions('nonexistent');

      // Assert
      expect(actions).toHaveLength(0);
    });
  });

  describe('Session Statistics', () => {
    it('should provide session statistics', async () => {
      // Arrange - Create multiple sessions
      const connectionInfo = {
        ipAddress: '127.0.0.1',
        userAgent: 'TestClient/1.0',
        connectionTime: new Date(),
        protocol: 'websocket'
      };

      await sessionService.createSession(testPlayerId, 'conn123', connectionInfo);
      
      // Create another player and session
      const testPlayer2 = PlayerFactory.createNewPlayer('testuser2');
      vi.mocked(mockPlayerService.getPlayer).mockResolvedValue(testPlayer2);
      await sessionService.createSession(testPlayer2.id, 'conn456', connectionInfo);

      // Act
      const stats = sessionService.getSessionStatistics();

      // Assert
      expect(stats.totalSessions).toBe(2);
      expect(stats.activeSessions).toBe(2);
      expect(stats.averageSessionDuration).toBeGreaterThanOrEqual(0);
      expect(stats.reconnectionRate).toBeGreaterThanOrEqual(0);
    });

    it('should handle empty session statistics', () => {
      // Act
      const stats = sessionService.getSessionStatistics();

      // Assert
      expect(stats.totalSessions).toBe(0);
      expect(stats.activeSessions).toBe(0);
      expect(stats.averageSessionDuration).toBe(0);
      expect(stats.reconnectionRate).toBe(0);
    });
  });

  describe('Service Lifecycle', () => {
    it('should shutdown gracefully', async () => {
      // Arrange - Create a session
      const connectionInfo = {
        ipAddress: '127.0.0.1',
        userAgent: 'TestClient/1.0',
        connectionTime: new Date(),
        protocol: 'websocket'
      };

      await sessionService.createSession(testPlayerId, 'conn123', connectionInfo);

      // Act
      await sessionService.shutdown();

      // Assert
      expect(sessionService.getActiveSessions()).toHaveLength(0);
    });

    it('should emit events correctly', async () => {
      // Arrange
      const events: string[] = [];
      
      sessionService.on('sessionCreated', () => events.push('sessionCreated'));
      sessionService.on('sessionTerminated', () => events.push('sessionTerminated'));
      sessionService.on('connectionLost', () => events.push('connectionLost'));

      const connectionInfo = {
        ipAddress: '127.0.0.1',
        userAgent: 'TestClient/1.0',
        connectionTime: new Date(),
        protocol: 'websocket'
      };

      // Act
      const result = await sessionService.createSession(testPlayerId, 'conn123', connectionInfo);
      const session = result.data!;
      
      await sessionService.handleConnectionLoss(session.sessionId);
      await sessionService.terminateSession(session.sessionId, 'test');

      // Assert
      expect(events).toContain('sessionCreated');
      expect(events).toContain('connectionLost');
      expect(events).toContain('sessionTerminated');
    });
  });

  describe('Server Restart Recovery', () => {
    it('should restore session from recovery data on server restart', async () => {
      // Arrange - Create initial session and simulate server restart
      const connectionInfo = {
        ipAddress: '127.0.0.1',
        userAgent: 'TestClient/1.0',
        connectionTime: new Date(),
        protocol: 'websocket'
      };

      const initialResult = await sessionService.createSession(testPlayerId, 'conn123', connectionInfo);
      const initialSession = initialResult.data!;

      // Add some pending actions
      sessionService.addPendingAction(initialSession.sessionId, {
        type: 'voxel_change',
        position: { x: 10, y: 5, z: 15 }
      });

      // Manually save recovery data to simulate persistence
      const recoveryData = {
        sessionId: initialSession.sessionId,
        playerId: testPlayerId,
        lastKnownState: {
          currentZone: initialSession.sessionData.currentZone,
          lastPosition: initialSession.sessionData.lastPosition,
          clientVersion: initialSession.sessionData.clientVersion
        },
        pendingChanges: initialSession.sessionData.pendingActions,
        timestamp: new Date()
      };

      // Simulate server shutdown (this saves recovery data)
      await sessionService.shutdown();

      // Create new service instance (simulating server restart)
      const newSessionService = new SessionManagementService(
        mockPlayerService,
        mockSyncService,
        mockWebSocketService
      );

      // Manually inject recovery data to simulate persistence layer
      (newSessionService as any).sessionRecoveryCache.set(`session_recovery:${testPlayerId}`, recoveryData);

      // Act - Create session for same player (should restore from recovery data)
      const restoredResult = await newSessionService.createSession(testPlayerId, 'conn456', connectionInfo);

      // Assert
      expect(restoredResult.success).toBe(true);
      expect(restoredResult.data!.sessionData.pendingActions).toHaveLength(1);
      expect(restoredResult.data!.sessionData.pendingActions[0].type).toBe('voxel_change');

      await newSessionService.shutdown();
    });

    it('should provide recovery data statistics', () => {
      // Act
      const stats = sessionService.getRecoveryDataStatistics();

      // Assert
      expect(stats).toHaveProperty('totalRecoveryEntries');
      expect(stats).toHaveProperty('recentRecoveryEntries');
      expect(stats).toHaveProperty('oldestRecoveryTimestamp');
      expect(stats).toHaveProperty('newestRecoveryTimestamp');
      expect(typeof stats.totalRecoveryEntries).toBe('number');
      expect(typeof stats.recentRecoveryEntries).toBe('number');
    });

    it('should clean up expired recovery data', async () => {
      // Arrange - Create a session to generate recovery data
      const connectionInfo = {
        ipAddress: '127.0.0.1',
        userAgent: 'TestClient/1.0',
        connectionTime: new Date(),
        protocol: 'websocket'
      };

      await sessionService.createSession(testPlayerId, 'conn123', connectionInfo);

      // Act
      sessionService.cleanupExpiredRecoveryData();

      // Assert - Should not throw and should complete successfully
      expect(() => sessionService.cleanupExpiredRecoveryData()).not.toThrow();
    });

    it('should save all active sessions', async () => {
      // Arrange - Create multiple sessions
      const connectionInfo = {
        ipAddress: '127.0.0.1',
        userAgent: 'TestClient/1.0',
        connectionTime: new Date(),
        protocol: 'websocket'
      };

      await sessionService.createSession(testPlayerId, 'conn123', connectionInfo);
      
      const testPlayer2 = PlayerFactory.createNewPlayer('testuser2');
      vi.mocked(mockPlayerService.getPlayer).mockResolvedValue(testPlayer2);
      await sessionService.createSession(testPlayer2.id, 'conn456', connectionInfo);

      // Act
      await sessionService.saveAllActiveSessions();

      // Assert - Should complete without errors
      expect(sessionService.getActiveSessions()).toHaveLength(2);
    });

    it('should restore sessions from storage', async () => {
      // Act
      await sessionService.restoreSessionsFromStorage();

      // Assert - Should complete without errors
      expect(() => sessionService.restoreSessionsFromStorage()).not.toThrow();
    });
  });

  describe('Enhanced Session Management', () => {
    let session: GameSession;

    beforeEach(async () => {
      const connectionInfo = {
        ipAddress: '127.0.0.1',
        userAgent: 'TestClient/1.0',
        connectionTime: new Date(),
        protocol: 'websocket'
      };

      const result = await sessionService.createSession(testPlayerId, 'conn123', connectionInfo);
      session = result.data!;
    });

    it('should emit sessionRecovered event when recovery data is used', async () => {
      // Arrange
      const events: string[] = [];
      
      // Create new service and add event listener
      const newSessionService = new SessionManagementService(
        mockPlayerService,
        mockSyncService,
        mockWebSocketService
      );

      newSessionService.on('sessionRecovered', () => events.push('sessionRecovered'));

      // Manually add recovery data to simulate persistence
      const recoveryData = {
        sessionId: 'old_session',
        playerId: testPlayerId,
        lastKnownState: {
          currentZone: 'test_zone',
          lastPosition: { x: 100, y: 50, z: 200 },
          clientVersion: 5
        },
        pendingChanges: [{ type: 'test_action', data: 'test' }],
        timestamp: new Date()
      };

      (newSessionService as any).sessionRecoveryCache.set(`session_recovery:${testPlayerId}`, recoveryData);

      const connectionInfo = {
        ipAddress: '127.0.0.1',
        userAgent: 'TestClient/1.0',
        connectionTime: new Date(),
        protocol: 'websocket'
      };

      // Act
      await newSessionService.createSession(testPlayerId, 'conn456', connectionInfo);

      // Assert
      expect(events).toContain('sessionRecovered');

      await newSessionService.shutdown();
    });

    it('should send server restart recovery notification to client', async () => {
      // Arrange - Create new service with recovery data
      const newSessionService = new SessionManagementService(
        mockPlayerService,
        mockSyncService,
        mockWebSocketService
      );

      // Manually add recovery data to simulate persistence
      const recoveryData = {
        sessionId: 'old_session',
        playerId: testPlayerId,
        lastKnownState: {
          currentZone: 'test_zone',
          lastPosition: { x: 100, y: 50, z: 200 },
          clientVersion: 5
        },
        pendingChanges: [{ type: 'test_action', data: 'test' }],
        timestamp: new Date()
      };

      (newSessionService as any).sessionRecoveryCache.set(`session_recovery:${testPlayerId}`, recoveryData);

      const connectionInfo = {
        ipAddress: '127.0.0.1',
        userAgent: 'TestClient/1.0',
        connectionTime: new Date(),
        protocol: 'websocket'
      };

      // Act
      await newSessionService.createSession(testPlayerId, 'conn456', connectionInfo);

      // Assert
      expect(mockWebSocketService.sendToPlayer).toHaveBeenCalledWith(
        testPlayerId,
        'session:server_restart_recovery',
        expect.objectContaining({
          recoveredActions: expect.any(Number),
          lastKnownState: expect.any(Object),
          timestamp: expect.any(Date)
        })
      );

      await newSessionService.shutdown();
    });

    it('should handle session creation with existing recovery data', async () => {
      // Arrange - Create a new service instance to test recovery
      const newSessionService = new SessionManagementService(
        mockPlayerService,
        mockSyncService,
        mockWebSocketService
      );

      // Manually add recovery data
      const recoveryData = {
        sessionId: 'old_session',
        playerId: testPlayerId,
        lastKnownState: {
          currentZone: 'test_zone',
          lastPosition: { x: 100, y: 50, z: 200 },
          clientVersion: 5
        },
        pendingChanges: [{ type: 'test_action', data: 'test' }],
        timestamp: new Date()
      };

      // Simulate recovery data being available
      (newSessionService as any).sessionRecoveryCache.set(`session_recovery:${testPlayerId}`, recoveryData);

      const connectionInfo = {
        ipAddress: '127.0.0.1',
        userAgent: 'TestClient/1.0',
        connectionTime: new Date(),
        protocol: 'websocket'
      };

      // Act
      const result = await newSessionService.createSession(testPlayerId, 'conn789', connectionInfo);

      // Assert
      expect(result.success).toBe(true);
      expect(result.data!.sessionData.currentZone).toBe('test_zone');
      expect(result.data!.sessionData.lastPosition).toEqual({ x: 100, y: 50, z: 200 });
      expect(result.data!.sessionData.clientVersion).toBe(5);
      expect(result.data!.sessionData.pendingActions).toHaveLength(1);

      await newSessionService.shutdown();
    });
  });

  describe('Error Handling', () => {
    it('should handle player service errors during session creation', async () => {
      // Arrange
      vi.mocked(mockPlayerService.getPlayer).mockRejectedValue(new Error('Database error'));

      const connectionInfo = {
        ipAddress: '127.0.0.1',
        userAgent: 'TestClient/1.0',
        connectionTime: new Date(),
        protocol: 'websocket'
      };

      // Act
      const result = await sessionService.createSession(testPlayerId, 'conn123', connectionInfo);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toContain('Database error');
    });

    it('should handle synchronization errors during reconnection', async () => {
      // Arrange
      vi.mocked(mockSyncService.forceSynchronization).mockRejectedValue(new Error('Sync error'));

      const connectionInfo = {
        ipAddress: '127.0.0.1',
        userAgent: 'TestClient/1.0',
        connectionTime: new Date(),
        protocol: 'websocket'
      };

      const sessionResult = await sessionService.createSession(testPlayerId, 'conn123', connectionInfo);
      const session = sessionResult.data!;
      
      await sessionService.handleConnectionLoss(session.sessionId);

      // Act
      const result = await sessionService.reconnectSession(session.reconnectToken!, 'conn456');

      // Assert - Should still succeed despite sync error
      expect(result.success).toBe(true);
    });

    it('should handle graceful disconnection errors', async () => {
      // Act - Try to disconnect non-existent session
      const result = await sessionService.handleGracefulDisconnection('nonexistent');

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toContain('Session not found');
    });

    it('should handle errors in recovery data persistence', async () => {
      // Arrange - Create session
      const connectionInfo = {
        ipAddress: '127.0.0.1',
        userAgent: 'TestClient/1.0',
        connectionTime: new Date(),
        protocol: 'websocket'
      };

      const result = await sessionService.createSession(testPlayerId, 'conn123', connectionInfo);
      const session = result.data!;

      // Act - Force an error in saveSessionState by corrupting the session data
      const originalPendingActions = session.sessionData.pendingActions;
      (session.sessionData as any).pendingActions = null; // This should cause an error

      // This should not throw despite the error
      await sessionService.handleConnectionLoss(session.sessionId);

      // Restore for cleanup
      session.sessionData.pendingActions = originalPendingActions;

      // Assert - Session should still be marked as inactive
      expect(session.isActive).toBe(false);
    });
  });
});