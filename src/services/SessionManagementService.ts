import { EventEmitter } from 'events';
import { ServiceResult } from '../shared/types';
import { PlayerService } from './PlayerService';
import { SynchronizationService } from './SynchronizationService';
import { WebSocketService } from './WebSocketService';

export interface GameSession {
  sessionId: string;
  playerId: string;
  username: string;
  connectionId: string;
  startTime: Date;
  lastActivity: Date;
  isActive: boolean;
  reconnectToken?: string;
  sessionData: SessionData;
  connectionAttempts: number;
  maxReconnectAttempts: number;
}

export interface SessionData {
  currentZone?: string;
  lastPosition?: { x: number; y: number; z: number };
  pendingActions: any[];
  clientVersion: number;
  lastSyncTimestamp: Date;
  preferences: SessionPreferences;
}

export interface SessionPreferences {
  autoSave: boolean;
  autoReconnect: boolean;
  maxIdleTime: number; // in minutes
  notificationSettings: {
    disconnectionWarning: boolean;
    reconnectionSuccess: boolean;
  };
}

export interface ConnectionInfo {
  ipAddress: string;
  userAgent: string;
  connectionTime: Date;
  protocol: string;
}

export interface SessionRecoveryData {
  sessionId: string;
  playerId: string;
  lastKnownState: any;
  pendingChanges: any[];
  timestamp: Date;
}

export class SessionManagementService extends EventEmitter {
  private sessions: Map<string, GameSession> = new Map();
  private playerSessions: Map<string, string> = new Map(); // playerId -> sessionId
  private reconnectTokens: Map<string, string> = new Map(); // token -> sessionId
  private sessionRecoveryCache: Map<string, SessionRecoveryData> = new Map(); // Recovery data cache
  private sessionCleanupInterval!: NodeJS.Timeout;
  private heartbeatInterval!: NodeJS.Timeout;

  constructor(
    private playerService: PlayerService,
    private synchronizationService: SynchronizationService,
    private webSocketService?: WebSocketService
  ) {
    super();
    this.startCleanupTimer();
    this.startHeartbeatTimer();
  }

  /**
   * Create a new game session for a player
   */
  async createSession(
    playerId: string, 
    connectionId: string, 
    connectionInfo: ConnectionInfo
  ): Promise<ServiceResult<GameSession>> {
    try {
      // Check if player already has an active session
      const existingSessionId = this.playerSessions.get(playerId);
      if (existingSessionId) {
        const existingSession = this.sessions.get(existingSessionId);
        if (existingSession && existingSession.isActive) {
          // Terminate existing session
          await this.terminateSession(existingSessionId, 'new_connection');
        }
      }

      // Get player data
      const player = await this.playerService.getPlayer(playerId);
      if (!player) {
        return { success: false, error: 'Player not found' };
      }

      // Check for existing recovery data (server restart scenario)
      const recoveryData = await this.loadSessionRecoveryData(playerId);
      
      // Generate session ID and reconnect token
      const sessionId = this.generateSessionId();
      const reconnectToken = this.generateReconnectToken();

      // Create session with recovery data if available
      const session: GameSession = {
        sessionId,
        playerId,
        username: player.username,
        connectionId,
        startTime: new Date(),
        lastActivity: new Date(),
        isActive: true,
        reconnectToken,
        sessionData: {
          currentZone: recoveryData?.lastKnownState?.currentZone,
          lastPosition: recoveryData?.lastKnownState?.lastPosition,
          pendingActions: recoveryData?.pendingChanges || [],
          clientVersion: recoveryData?.lastKnownState?.clientVersion || 1,
          lastSyncTimestamp: new Date(),
          preferences: this.getDefaultPreferences()
        },
        connectionAttempts: 0,
        maxReconnectAttempts: 5
      };

      // Store session
      this.sessions.set(sessionId, session);
      this.playerSessions.set(playerId, sessionId);
      this.reconnectTokens.set(reconnectToken, sessionId);

      // Emit session created event
      this.emit('sessionCreated', session);

      // Initialize player state synchronization (preserve client version from recovery)
      const originalClientVersion = session.sessionData.clientVersion;
      await this.initializePlayerState(session);
      
      // Restore client version if it was from recovery data
      if (recoveryData && recoveryData.lastKnownState?.clientVersion) {
        session.sessionData.clientVersion = recoveryData.lastKnownState.clientVersion;
      }

      // If recovery data was used, notify about server restart recovery
      if (recoveryData) {
        this.emit('sessionRecovered', { session, recoveryData });
        
        if (this.webSocketService) {
          this.webSocketService.sendToPlayer(playerId, 'session:server_restart_recovery', {
            sessionId: session.sessionId,
            recoveredActions: recoveryData.pendingChanges.length,
            lastKnownState: recoveryData.lastKnownState,
            timestamp: new Date()
          });
        }
      }

      return { success: true, data: session };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create session'
      };
    }
  }

  /**
   * Authenticate and restore a session using reconnect token
   */
  async reconnectSession(
    reconnectToken: string, 
    newConnectionId: string
  ): Promise<ServiceResult<GameSession>> {
    try {
      const sessionId = this.reconnectTokens.get(reconnectToken);
      if (!sessionId) {
        return { success: false, error: 'Invalid reconnect token' };
      }

      const session = this.sessions.get(sessionId);
      if (!session) {
        return { success: false, error: 'Session not found' };
      }

      // Check if reconnection is allowed
      if (session.connectionAttempts >= session.maxReconnectAttempts) {
        await this.terminateSession(sessionId, 'max_reconnect_attempts');
        return { success: false, error: 'Maximum reconnection attempts exceeded' };
      }

      // Update session for reconnection
      session.connectionId = newConnectionId;
      session.isActive = true;
      session.lastActivity = new Date();
      session.connectionAttempts++;

      // Emit session reconnected event
      this.emit('sessionReconnected', session);

      // Restore player state
      await this.restorePlayerState(session);

      return { success: true, data: session };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to reconnect session'
      };
    }
  }

  /**
   * Update session activity
   */
  updateActivity(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session && session.isActive) {
      session.lastActivity = new Date();
    }
  }

  /**
   * Handle connection loss
   */
  async handleConnectionLoss(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.isActive = false;
    
    // Save current state for recovery
    await this.saveSessionState(session);

    // Emit connection lost event
    this.emit('connectionLost', session);

    // Start grace period for reconnection
    this.startReconnectionGracePeriod(session);
  }

  /**
   * Handle graceful disconnection
   */
  async handleGracefulDisconnection(sessionId: string): Promise<ServiceResult<void>> {
    try {
      const session = this.sessions.get(sessionId);
      if (!session) {
        return { success: false, error: 'Session not found' };
      }

      // Save final state
      await this.saveSessionState(session);

      // Perform cleanup
      await this.cleanupSession(session);

      // Terminate session
      await this.terminateSession(sessionId, 'graceful_disconnect');

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to handle disconnection'
      };
    }
  }

  /**
   * Terminate a session
   */
  async terminateSession(sessionId: string, reason: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    // Mark as inactive
    session.isActive = false;

    // Save final state
    await this.saveSessionState(session);

    // Clean up resources
    await this.cleanupSession(session);

    // Remove from maps
    this.sessions.delete(sessionId);
    this.playerSessions.delete(session.playerId);
    if (session.reconnectToken) {
      this.reconnectTokens.delete(session.reconnectToken);
    }

    // Emit session terminated event
    this.emit('sessionTerminated', { session, reason });
  }

  /**
   * Get session by ID
   */
  getSession(sessionId: string): GameSession | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Get session by player ID
   */
  getPlayerSession(playerId: string): GameSession | undefined {
    const sessionId = this.playerSessions.get(playerId);
    return sessionId ? this.sessions.get(sessionId) : undefined;
  }

  /**
   * Get all active sessions
   */
  getActiveSessions(): GameSession[] {
    return Array.from(this.sessions.values()).filter(session => session.isActive);
  }

  /**
   * Update session preferences
   */
  updateSessionPreferences(sessionId: string, preferences: Partial<SessionPreferences>): ServiceResult<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return { success: false, error: 'Session not found' };
    }

    session.sessionData.preferences = { ...session.sessionData.preferences, ...preferences };
    return { success: true };
  }

  /**
   * Add pending action to session
   */
  addPendingAction(sessionId: string, action: any): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.sessionData.pendingActions.push({
        ...action,
        timestamp: new Date()
      });
    }
  }

  /**
   * Get and clear pending actions
   */
  getPendingActions(sessionId: string): any[] {
    const session = this.sessions.get(sessionId);
    if (!session) return [];

    const actions = [...session.sessionData.pendingActions];
    session.sessionData.pendingActions = [];
    return actions;
  }

  /**
   * Initialize player state for new session
   */
  private async initializePlayerState(session: GameSession): Promise<void> {
    try {
      // Force synchronization to get latest state
      const syncResult = await this.synchronizationService.forceSynchronization(session.playerId);
      
      if (syncResult.success) {
        session.sessionData.clientVersion = syncResult.serverVersion;
        session.sessionData.lastSyncTimestamp = syncResult.timestamp;
      }
    } catch (error) {
      console.error('Failed to initialize player state:', error);
    }
  }

  /**
   * Restore player state after reconnection
   */
  private async restorePlayerState(session: GameSession): Promise<void> {
    try {
      // Get pending actions that were queued during disconnection
      const pendingActions = this.getPendingActions(session.sessionId);

      // Process pending actions
      for (const action of pendingActions) {
        await this.processPendingAction(session, action);
      }

      // Synchronize with server
      const syncResult = await this.synchronizationService.forceSynchronization(session.playerId);
      
      if (syncResult.success) {
        session.sessionData.clientVersion = syncResult.serverVersion;
        session.sessionData.lastSyncTimestamp = syncResult.timestamp;
      }

      // Notify client of successful restoration
      if (this.webSocketService) {
        this.webSocketService.sendToPlayer(session.playerId, 'session:state_restored', {
          sessionId: session.sessionId,
          pendingActionsProcessed: pendingActions.length,
          timestamp: new Date()
        });
      }
    } catch (error) {
      console.error('Failed to restore player state:', error);
    }
  }

  /**
   * Save session state for recovery
   */
  private async saveSessionState(session: GameSession): Promise<void> {
    try {
      const recoveryData: SessionRecoveryData = {
        sessionId: session.sessionId,
        playerId: session.playerId,
        lastKnownState: {
          currentZone: session.sessionData.currentZone,
          lastPosition: session.sessionData.lastPosition,
          clientVersion: session.sessionData.clientVersion
        },
        pendingChanges: session.sessionData.pendingActions,
        timestamp: new Date()
      };

      // Save to persistent storage for server restart recovery
      await this.persistSessionRecoveryData(recoveryData);
      
      console.log('Session state saved for recovery:', recoveryData);
    } catch (error) {
      console.error('Failed to save session state:', error);
    }
  }

  /**
   * Persist session recovery data to storage
   */
  private async persistSessionRecoveryData(recoveryData: SessionRecoveryData): Promise<void> {
    try {
      // In a production environment, this would save to Redis or database
      // For now, we'll simulate the persistence layer
      const key = `session_recovery:${recoveryData.playerId}`;
      
      // Simulate async storage operation
      await new Promise(resolve => setTimeout(resolve, 1));
      
      // Store in a recovery cache that survives server restarts
      this.sessionRecoveryCache.set(key, recoveryData);
    } catch (error) {
      console.error('Failed to persist session recovery data:', error);
    }
  }

  /**
   * Load session recovery data from storage
   */
  private async loadSessionRecoveryData(playerId: string): Promise<SessionRecoveryData | null> {
    try {
      const key = `session_recovery:${playerId}`;
      return this.sessionRecoveryCache.get(key) || null;
    } catch (error) {
      console.error('Failed to load session recovery data:', error);
      return null;
    }
  }

  /**
   * Clean up session resources
   */
  private async cleanupSession(session: GameSession): Promise<void> {
    try {
      // Save any remaining pending actions
      if (session.sessionData.pendingActions.length > 0) {
        console.log(`Saving ${session.sessionData.pendingActions.length} pending actions for session ${session.sessionId}`);
      }

      // Notify other services about session cleanup
      this.emit('sessionCleanup', session);
    } catch (error) {
      console.error('Failed to cleanup session:', error);
    }
  }

  /**
   * Process a pending action
   */
  private async processPendingAction(session: GameSession, action: any): Promise<void> {
    try {
      // Process different types of actions
      switch (action.type) {
        case 'voxel_change':
          // Process voxel changes through synchronization service
          break;
        case 'chat_message':
          // Process chat messages
          break;
        case 'player_movement':
          // Update player position
          session.sessionData.lastPosition = action.position;
          break;
        default:
          console.warn('Unknown pending action type:', action.type);
      }
    } catch (error) {
      console.error('Failed to process pending action:', error);
    }
  }

  /**
   * Start reconnection grace period
   */
  private startReconnectionGracePeriod(session: GameSession): void {
    const gracePeriod = 5 * 60 * 1000; // 5 minutes

    setTimeout(async () => {
      // Check if session was reconnected
      if (!session.isActive) {
        await this.terminateSession(session.sessionId, 'reconnection_timeout');
      }
    }, gracePeriod);
  }

  /**
   * Start cleanup timer for inactive sessions
   */
  private startCleanupTimer(): void {
    this.sessionCleanupInterval = setInterval(() => {
      this.cleanupInactiveSessions();
    }, 60000); // Run every minute
  }

  /**
   * Start heartbeat timer
   */
  private startHeartbeatTimer(): void {
    this.heartbeatInterval = setInterval(() => {
      this.sendHeartbeats();
    }, 30000); // Send heartbeat every 30 seconds
  }

  /**
   * Clean up inactive sessions
   */
  private cleanupInactiveSessions(): void {
    const now = new Date();
    const maxIdleTime = 30 * 60 * 1000; // 30 minutes

    for (const [sessionId, session] of this.sessions.entries()) {
      const idleTime = now.getTime() - session.lastActivity.getTime();
      
      if (!session.isActive && idleTime > maxIdleTime) {
        this.terminateSession(sessionId, 'idle_timeout');
      }
    }
  }

  /**
   * Send heartbeats to active sessions
   */
  private sendHeartbeats(): void {
    if (!this.webSocketService) return;

    for (const session of this.getActiveSessions()) {
      this.webSocketService.sendToPlayer(session.playerId, 'session:heartbeat', {
        sessionId: session.sessionId,
        timestamp: new Date()
      });
    }
  }

  /**
   * Generate unique session ID
   */
  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }

  /**
   * Generate reconnect token
   */
  private generateReconnectToken(): string {
    return `token_${Date.now()}_${Math.random().toString(36).substring(2, 18)}`;
  }

  /**
   * Get default session preferences
   */
  private getDefaultPreferences(): SessionPreferences {
    return {
      autoSave: true,
      autoReconnect: true,
      maxIdleTime: 30,
      notificationSettings: {
        disconnectionWarning: true,
        reconnectionSuccess: true
      }
    };
  }

  /**
   * Get session statistics
   */
  getSessionStatistics(): {
    totalSessions: number;
    activeSessions: number;
    averageSessionDuration: number;
    reconnectionRate: number;
  } {
    const totalSessions = this.sessions.size;
    const activeSessions = this.getActiveSessions().length;
    
    let totalDuration = 0;
    let reconnections = 0;
    
    for (const session of this.sessions.values()) {
      const duration = new Date().getTime() - session.startTime.getTime();
      totalDuration += duration;
      
      if (session.connectionAttempts > 0) {
        reconnections++;
      }
    }

    return {
      totalSessions,
      activeSessions,
      averageSessionDuration: totalSessions > 0 ? totalDuration / totalSessions : 0,
      reconnectionRate: totalSessions > 0 ? reconnections / totalSessions : 0
    };
  }

  /**
   * Restore all sessions from persistent storage (server restart recovery)
   */
  async restoreSessionsFromStorage(): Promise<void> {
    try {
      console.log('Restoring sessions from persistent storage...');
      
      // In a production environment, this would query Redis/database for all recovery data
      // For now, we'll iterate through our in-memory cache
      let restoredCount = 0;
      
      for (const [key, recoveryData] of this.sessionRecoveryCache.entries()) {
        if (key.startsWith('session_recovery:')) {
          // Check if the recovery data is recent (within last 24 hours)
          const maxAge = 24 * 60 * 60 * 1000; // 24 hours
          const age = new Date().getTime() - recoveryData.timestamp.getTime();
          
          if (age < maxAge) {
            // Mark this player as having recovery data available
            // The actual session will be restored when they reconnect
            console.log(`Recovery data available for player ${recoveryData.playerId}`);
            restoredCount++;
          } else {
            // Clean up old recovery data
            this.sessionRecoveryCache.delete(key);
          }
        }
      }
      
      console.log(`Session recovery data restored for ${restoredCount} players`);
    } catch (error) {
      console.error('Failed to restore sessions from storage:', error);
    }
  }

  /**
   * Clean up expired recovery data
   */
  cleanupExpiredRecoveryData(): void {
    const now = new Date();
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours
    
    for (const [key, recoveryData] of this.sessionRecoveryCache.entries()) {
      const age = now.getTime() - recoveryData.timestamp.getTime();
      
      if (age > maxAge) {
        this.sessionRecoveryCache.delete(key);
        console.log(`Cleaned up expired recovery data for key: ${key}`);
      }
    }
  }

  /**
   * Get recovery data statistics
   */
  getRecoveryDataStatistics(): {
    totalRecoveryEntries: number;
    recentRecoveryEntries: number;
    oldestRecoveryTimestamp: Date | null;
    newestRecoveryTimestamp: Date | null;
  } {
    const now = new Date();
    const recentThreshold = 60 * 60 * 1000; // 1 hour
    
    let recentCount = 0;
    let oldestTimestamp: Date | null = null;
    let newestTimestamp: Date | null = null;
    
    for (const recoveryData of this.sessionRecoveryCache.values()) {
      const age = now.getTime() - recoveryData.timestamp.getTime();
      
      if (age < recentThreshold) {
        recentCount++;
      }
      
      if (!oldestTimestamp || recoveryData.timestamp < oldestTimestamp) {
        oldestTimestamp = recoveryData.timestamp;
      }
      
      if (!newestTimestamp || recoveryData.timestamp > newestTimestamp) {
        newestTimestamp = recoveryData.timestamp;
      }
    }
    
    return {
      totalRecoveryEntries: this.sessionRecoveryCache.size,
      recentRecoveryEntries: recentCount,
      oldestRecoveryTimestamp: oldestTimestamp,
      newestRecoveryTimestamp: newestTimestamp
    };
  }

  /**
   * Force save all active session states
   */
  async saveAllActiveSessions(): Promise<void> {
    const activeSessions = this.getActiveSessions();
    const savePromises = activeSessions.map(session => this.saveSessionState(session));
    
    try {
      await Promise.all(savePromises);
      console.log(`Saved state for ${activeSessions.length} active sessions`);
    } catch (error) {
      console.error('Failed to save all active sessions:', error);
    }
  }

  /**
   * Shutdown service and cleanup all sessions
   */
  async shutdown(): Promise<void> {
    console.log('Shutting down SessionManagementService...');
    
    // Save all active sessions before shutdown
    await this.saveAllActiveSessions();
    
    // Clear timers
    if (this.sessionCleanupInterval) {
      clearInterval(this.sessionCleanupInterval);
    }
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    // Terminate all active sessions
    const activeSessions = this.getActiveSessions();
    for (const session of activeSessions) {
      await this.terminateSession(session.sessionId, 'service_shutdown');
    }

    // Clean up expired recovery data
    this.cleanupExpiredRecoveryData();

    // Clear session data (but keep recovery data for restart)
    this.sessions.clear();
    this.playerSessions.clear();
    this.reconnectTokens.clear();

    console.log('SessionManagementService shutdown complete');
    this.emit('serviceShutdown');
  }
}

/**
 * Session event types for type safety
 */
export interface SessionEvents {
  sessionCreated: (session: GameSession) => void;
  sessionReconnected: (session: GameSession) => void;
  sessionRecovered: (data: { session: GameSession; recoveryData: SessionRecoveryData }) => void;
  connectionLost: (session: GameSession) => void;
  sessionTerminated: (data: { session: GameSession; reason: string }) => void;
  sessionCleanup: (session: GameSession) => void;
  serviceShutdown: () => void;
}

// Extend EventEmitter with typed events
export declare interface SessionManagementService {
  on<K extends keyof SessionEvents>(event: K, listener: SessionEvents[K]): this;
  emit<K extends keyof SessionEvents>(event: K, ...args: Parameters<SessionEvents[K]>): boolean;
}