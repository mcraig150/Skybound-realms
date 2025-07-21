import { WebSocketService, PlayerConnection } from './WebSocketService';

export interface ConnectionStats {
  totalConnections: number;
  activeConnections: number;
  connectionsByZone: Map<string, number>;
  connectionsByChannel: Map<string, number>;
  averageLatency: number;
}

export interface ReconnectionConfig {
  maxRetries: number;
  retryDelay: number;
  backoffMultiplier: number;
  maxDelay: number;
}

export class ConnectionManager {
  private webSocketService: WebSocketService;
  private reconnectionConfig: ReconnectionConfig;
  private connectionStats: ConnectionStats;
  private cleanupInterval: NodeJS.Timeout;

  constructor(webSocketService: WebSocketService) {
    this.webSocketService = webSocketService;
    this.reconnectionConfig = {
      maxRetries: 5,
      retryDelay: 1000,
      backoffMultiplier: 2,
      maxDelay: 30000
    };

    this.connectionStats = {
      totalConnections: 0,
      activeConnections: 0,
      connectionsByZone: new Map(),
      connectionsByChannel: new Map(),
      averageLatency: 0
    };

    // Start cleanup interval
    this.cleanupInterval = setInterval(() => {
      this.performCleanup();
    }, 60000); // Run every minute
  }

  public getConnectionStats(): ConnectionStats {
    const connectedPlayers = this.webSocketService.getConnectedPlayers();
    this.connectionStats.activeConnections = connectedPlayers.length;
    
    // Update zone and channel statistics
    this.updateZoneStats();
    this.updateChannelStats();
    
    return { ...this.connectionStats };
  }

  private updateZoneStats(): void {
    this.connectionStats.connectionsByZone.clear();
    
    const connectedPlayers = this.webSocketService.getConnectedPlayers();
    for (const playerId of connectedPlayers) {
      const connection = this.webSocketService.getPlayerConnection(playerId);
      if (connection?.currentZone) {
        const current = this.connectionStats.connectionsByZone.get(connection.currentZone) || 0;
        this.connectionStats.connectionsByZone.set(connection.currentZone, current + 1);
      }
    }
  }

  private updateChannelStats(): void {
    // This would require tracking channel memberships
    // For now, we'll implement basic tracking
    this.connectionStats.connectionsByChannel.clear();
    
    // Add global channel count (all connected players are in global by default)
    this.connectionStats.connectionsByChannel.set('global', this.connectionStats.activeConnections);
  }

  public async handleReconnection(playerId: string, socket: any): Promise<boolean> {
    try {
      // Check if player is already connected
      if (this.webSocketService.isPlayerConnected(playerId)) {
        // Disconnect old connection
        const oldConnection = this.webSocketService.getPlayerConnection(playerId);
        if (oldConnection) {
          oldConnection.socket.disconnect();
        }
      }

      // The WebSocketService will handle the new connection
      return true;
    } catch (error) {
      console.error('Error handling reconnection:', error);
      return false;
    }
  }

  public broadcastSystemMessage(message: string, level: 'info' | 'warning' | 'error' = 'info'): void {
    this.webSocketService.broadcastToAll('system:message', {
      message,
      level,
      timestamp: new Date()
    });
  }

  public broadcastMaintenanceNotice(message: string, scheduledTime?: Date): void {
    this.webSocketService.broadcastToAll('system:maintenance', {
      message,
      scheduledTime,
      timestamp: new Date()
    });
  }

  public kickPlayer(playerId: string, reason: string): void {
    const connection = this.webSocketService.getPlayerConnection(playerId);
    if (connection) {
      connection.socket.emit('system:kicked', {
        reason,
        timestamp: new Date()
      });
      
      setTimeout(() => {
        connection.socket.disconnect();
      }, 1000); // Give time for the message to be received
    }
  }

  public banPlayer(playerId: string, reason: string, duration?: number): void {
    const connection = this.webSocketService.getPlayerConnection(playerId);
    if (connection) {
      connection.socket.emit('system:banned', {
        reason,
        duration,
        timestamp: new Date()
      });
      
      setTimeout(() => {
        connection.socket.disconnect();
      }, 1000);
    }
  }

  private performCleanup(): void {
    try {
      // Clean up inactive connections
      this.webSocketService.cleanupInactiveConnections();
      
      // Update total connections counter
      this.connectionStats.totalConnections = this.webSocketService.getConnectedPlayers().length;
      
      console.log(`Connection cleanup completed. Active connections: ${this.connectionStats.totalConnections}`);
    } catch (error) {
      console.error('Error during connection cleanup:', error);
    }
  }

  public getPlayersByZone(zoneId: string): string[] {
    const players: string[] = [];
    const connectedPlayers = this.webSocketService.getConnectedPlayers();
    
    for (const playerId of connectedPlayers) {
      const connection = this.webSocketService.getPlayerConnection(playerId);
      if (connection?.currentZone === zoneId) {
        players.push(playerId);
      }
    }
    
    return players;
  }

  public getZonePlayerCount(zoneId: string): number {
    return this.getPlayersByZone(zoneId).length;
  }

  public isZoneFull(zoneId: string, maxPlayers: number = 100): boolean {
    return this.getZonePlayerCount(zoneId) >= maxPlayers;
  }

  public async migratePlayersFromZone(fromZoneId: string, toZoneId: string): Promise<void> {
    const players = this.getPlayersByZone(fromZoneId);
    
    for (const playerId of players) {
      const connection = this.webSocketService.getPlayerConnection(playerId);
      if (connection) {
        connection.socket.emit('zone:migrate', {
          fromZone: fromZoneId,
          toZone: toZoneId,
          reason: 'Zone maintenance'
        });
      }
    }
  }

  public shutdown(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    
    // Notify all connected players
    this.broadcastSystemMessage('Server is shutting down. Please reconnect in a few minutes.', 'warning');
    
    // Give time for messages to be sent
    setTimeout(() => {
      const io = this.webSocketService.getServer();
      io.close();
    }, 2000);
  }

  public getReconnectionConfig(): ReconnectionConfig {
    return { ...this.reconnectionConfig };
  }

  public updateReconnectionConfig(config: Partial<ReconnectionConfig>): void {
    this.reconnectionConfig = { ...this.reconnectionConfig, ...config };
  }
}