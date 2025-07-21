import { Server as SocketIOServer, Socket } from 'socket.io';
import { Server } from 'http';
import jwt from 'jsonwebtoken';
import { PlayerService } from './PlayerService';
import { ChatService } from './ChatService';
import { TradingService } from './TradingService';
import { WorldService } from './WorldService';

export interface AuthenticatedSocket extends Socket {
  playerId?: string;
  username?: string;
}

export interface WebSocketMessage {
  type: string;
  data: any;
  timestamp: Date;
}

export interface PlayerConnection {
  socket: AuthenticatedSocket;
  playerId: string;
  username: string;
  currentZone?: string;
  lastActivity: Date;
}

export class WebSocketService {
  private io: SocketIOServer;
  private connections: Map<string, PlayerConnection> = new Map();
  private playerService: PlayerService;
  private chatService: ChatService;
  private tradingService: TradingService;
  private worldService: WorldService;

  constructor(
    server: Server,
    playerService: PlayerService,
    chatService: ChatService,
    tradingService: TradingService,
    worldService: WorldService
  ) {
    this.io = new SocketIOServer(server, {
      cors: {
        origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:3000'],
        credentials: true
      },
      pingTimeout: 60000,
      pingInterval: 25000
    });

    this.playerService = playerService;
    this.chatService = chatService;
    this.tradingService = tradingService;
    this.worldService = worldService;

    this.setupMiddleware();
    this.setupEventHandlers();
  }

  private setupMiddleware(): void {
    // Authentication middleware
    this.io.use(async (socket: AuthenticatedSocket, next) => {
      try {
        const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');
        
        if (!token) {
          return next(new Error('Authentication token required'));
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret') as any;
        const player = await this.playerService.getPlayer(decoded.playerId);
        
        if (!player) {
          return next(new Error('Player not found'));
        }

        socket.playerId = player.id;
        socket.username = player.username;
        next();
      } catch (error) {
        next(new Error('Invalid authentication token'));
      }
    });
  }

  private setupEventHandlers(): void {
    this.io.on('connection', (socket: AuthenticatedSocket) => {
      this.handleConnection(socket);
    });
  }

  private handleConnection(socket: AuthenticatedSocket): void {
    if (!socket.playerId || !socket.username) {
      socket.disconnect();
      return;
    }

    console.log(`Player connected: ${socket.username} (${socket.playerId})`);

    // Store connection
    const connection: PlayerConnection = {
      socket,
      playerId: socket.playerId,
      username: socket.username,
      lastActivity: new Date()
    };
    this.connections.set(socket.playerId, connection);

    // Join player to their personal room
    socket.join(`player:${socket.playerId}`);

    // Set up event handlers
    this.setupSocketEventHandlers(socket);

    // Handle disconnection
    socket.on('disconnect', () => {
      this.handleDisconnection(socket);
    });

    // Send welcome message
    socket.emit('connected', {
      message: 'Connected to Skybound Realms',
      playerId: socket.playerId,
      timestamp: new Date()
    });
  }

  private setupSocketEventHandlers(socket: AuthenticatedSocket): void {
    // Chat events
    socket.on('chat:send', async (data) => {
      await this.handleChatMessage(socket, data);
    });

    socket.on('chat:join_channel', async (data) => {
      await this.handleJoinChatChannel(socket, data);
    });

    socket.on('chat:leave_channel', async (data) => {
      await this.handleLeaveChatChannel(socket, data);
    });

    // World events
    socket.on('world:join_zone', async (data) => {
      await this.handleJoinZone(socket, data);
    });

    socket.on('world:leave_zone', async (data) => {
      await this.handleLeaveZone(socket, data);
    });

    socket.on('world:block_change', async (data) => {
      await this.handleBlockChange(socket, data);
    });

    // Trading events
    socket.on('trade:initiate', async (data) => {
      await this.handleTradeInitiate(socket, data);
    });

    socket.on('trade:respond', async (data) => {
      await this.handleTradeRespond(socket, data);
    });

    socket.on('trade:update', async (data) => {
      await this.handleTradeUpdate(socket, data);
    });

    socket.on('trade:confirm', async (data) => {
      await this.handleTradeConfirm(socket, data);
    });

    socket.on('trade:cancel', async (data) => {
      await this.handleTradeCancel(socket, data);
    });

    // Player events
    socket.on('player:update_position', async (data) => {
      await this.handlePlayerPositionUpdate(socket, data);
    });

    socket.on('player:update_status', async (data) => {
      await this.handlePlayerStatusUpdate(socket, data);
    });

    // Heartbeat
    socket.on('ping', () => {
      socket.emit('pong');
      this.updatePlayerActivity(socket.playerId!);
    });
  }

  private async handleChatMessage(socket: AuthenticatedSocket, data: any): Promise<void> {
    try {
      const { channel, message } = data;
      
      if (!message || typeof message !== 'string' || message.trim().length === 0) {
        socket.emit('error', { message: 'Invalid message' });
        return;
      }

      const chatMessage = await this.chatService.sendMessage(
        socket.playerId!,
        channel || 'global',
        message.trim()
      );

      // Broadcast to channel members
      this.broadcastToChatChannel(channel || 'global', 'chat:message', chatMessage);
    } catch (error) {
      console.error('Error handling chat message:', error);
      socket.emit('error', { message: 'Failed to send message' });
    }
  }

  private async handleJoinChatChannel(socket: AuthenticatedSocket, data: any): Promise<void> {
    try {
      const { channel } = data;
      
      if (!channel || typeof channel !== 'string') {
        socket.emit('error', { message: 'Invalid channel' });
        return;
      }

      socket.join(`chat:${channel}`);
      
      // Notify channel members
      socket.to(`chat:${channel}`).emit('chat:player_joined', {
        playerId: socket.playerId,
        username: socket.username,
        channel,
        timestamp: new Date()
      });

      socket.emit('chat:joined_channel', { channel });
    } catch (error) {
      console.error('Error joining chat channel:', error);
      socket.emit('error', { message: 'Failed to join channel' });
    }
  }

  private async handleLeaveChatChannel(socket: AuthenticatedSocket, data: any): Promise<void> {
    try {
      const { channel } = data;
      
      if (!channel || typeof channel !== 'string') {
        socket.emit('error', { message: 'Invalid channel' });
        return;
      }

      socket.leave(`chat:${channel}`);
      
      // Notify channel members
      socket.to(`chat:${channel}`).emit('chat:player_left', {
        playerId: socket.playerId,
        username: socket.username,
        channel,
        timestamp: new Date()
      });

      socket.emit('chat:left_channel', { channel });
    } catch (error) {
      console.error('Error leaving chat channel:', error);
      socket.emit('error', { message: 'Failed to leave channel' });
    }
  }

  private async handleJoinZone(socket: AuthenticatedSocket, data: any): Promise<void> {
    try {
      const { zoneId } = data;
      
      if (!zoneId || typeof zoneId !== 'string') {
        socket.emit('error', { message: 'Invalid zone ID' });
        return;
      }

      // Leave current zone if any
      const connection = this.connections.get(socket.playerId!);
      if (connection?.currentZone) {
        socket.leave(`zone:${connection.currentZone}`);
        socket.to(`zone:${connection.currentZone}`).emit('zone:player_left', {
          playerId: socket.playerId,
          username: socket.username,
          zoneId: connection.currentZone
        });
      }

      // Join new zone
      socket.join(`zone:${zoneId}`);
      connection!.currentZone = zoneId;

      // Notify zone members
      socket.to(`zone:${zoneId}`).emit('zone:player_joined', {
        playerId: socket.playerId,
        username: socket.username,
        zoneId
      });

      socket.emit('zone:joined', { zoneId });
    } catch (error) {
      console.error('Error joining zone:', error);
      socket.emit('error', { message: 'Failed to join zone' });
    }
  }

  private async handleLeaveZone(socket: AuthenticatedSocket, data: any): Promise<void> {
    try {
      const { zoneId } = data;
      const connection = this.connections.get(socket.playerId!);
      
      if (connection?.currentZone === zoneId) {
        socket.leave(`zone:${zoneId}`);
        delete (connection as any).currentZone;

        socket.to(`zone:${zoneId}`).emit('zone:player_left', {
          playerId: socket.playerId,
          username: socket.username,
          zoneId
        });

        socket.emit('zone:left', { zoneId });
      }
    } catch (error) {
      console.error('Error leaving zone:', error);
      socket.emit('error', { message: 'Failed to leave zone' });
    }
  }

  private async handleBlockChange(socket: AuthenticatedSocket, data: any): Promise<void> {
    try {
      const { position, blockType, action } = data;
      
      if (!position || !action) {
        socket.emit('error', { message: 'Invalid block change data' });
        return;
      }

      // Validate and apply block change through WorldService
      const result = await this.worldService.modifyBlock(
        socket.playerId!,
        position,
        blockType,
        action
      );

      if (result.success) {
        // Broadcast to zone members
        const connection = this.connections.get(socket.playerId!);
        if (connection?.currentZone) {
          this.io.to(`zone:${connection.currentZone}`).emit('world:block_changed', {
            playerId: socket.playerId,
            position,
            blockType,
            action,
            timestamp: new Date()
          });
        }
      } else {
        socket.emit('error', { message: result.error || 'Failed to modify block' });
      }
    } catch (error) {
      console.error('Error handling block change:', error);
      socket.emit('error', { message: 'Failed to process block change' });
    }
  }

  private async handleTradeInitiate(socket: AuthenticatedSocket, data: any): Promise<void> {
    try {
      const { targetPlayerId } = data;
      
      if (!targetPlayerId) {
        socket.emit('error', { message: 'Target player ID required' });
        return;
      }

      const tradeResult = await this.tradingService.initiateTrade(socket.playerId!, { recipientId: targetPlayerId });
      
      if (tradeResult.success && tradeResult.trade) {
        // Notify both players
        socket.emit('trade:initiated', tradeResult.trade);
        this.sendToPlayer(targetPlayerId, 'trade:request', {
          tradeId: tradeResult.trade.id,
          initiatorId: socket.playerId,
          initiatorUsername: socket.username
        });
      } else {
        socket.emit('error', { message: tradeResult.error || 'Failed to initiate trade' });
      }
    } catch (error) {
      console.error('Error initiating trade:', error);
      socket.emit('error', { message: 'Failed to initiate trade' });
    }
  }

  private async handleTradeRespond(socket: AuthenticatedSocket, data: any): Promise<void> {
    try {
      const { tradeId, accepted } = data;
      
      const result = accepted 
        ? await this.tradingService.acceptTrade(socket.playerId!, tradeId)
        : await this.tradingService.declineTrade(socket.playerId!, tradeId);
      
      if (result.success) {
        // Notify both players
        const trade = result.trade!;
        this.sendToPlayer(trade.initiatorId, 'trade:response', { tradeId, accepted, trade });
        this.sendToPlayer(trade.recipientId, 'trade:response', { tradeId, accepted, trade });
      } else {
        socket.emit('error', { message: result.error });
      }
    } catch (error) {
      console.error('Error responding to trade:', error);
      socket.emit('error', { message: 'Failed to respond to trade' });
    }
  }

  private async handleTradeUpdate(socket: AuthenticatedSocket, data: any): Promise<void> {
    try {
      const { tradeId, items } = data;
      
      const result = await this.tradingService.updateTradeOffer(socket.playerId!, tradeId, { items });
      
      if (result.success) {
        const trade = result.trade!;
        const otherPlayerId = trade.initiatorId === socket.playerId ? trade.recipientId : trade.initiatorId;
        
        // Notify other player
        this.sendToPlayer(otherPlayerId, 'trade:updated', { tradeId, trade });
      } else {
        socket.emit('error', { message: result.error });
      }
    } catch (error) {
      console.error('Error updating trade:', error);
      socket.emit('error', { message: 'Failed to update trade' });
    }
  }

  private async handleTradeConfirm(socket: AuthenticatedSocket, data: any): Promise<void> {
    try {
      const { tradeId } = data;
      
      const result = await this.tradingService.confirmTrade({ tradeId, playerId: socket.playerId! });
      
      if (result.success) {
        const trade = result.trade!;
        // Notify both players
        this.sendToPlayer(trade.initiatorId, 'trade:confirmed', { tradeId, trade });
        this.sendToPlayer(trade.recipientId, 'trade:confirmed', { tradeId, trade });
      } else {
        socket.emit('error', { message: result.error });
      }
    } catch (error) {
      console.error('Error confirming trade:', error);
      socket.emit('error', { message: 'Failed to confirm trade' });
    }
  }

  private async handleTradeCancel(socket: AuthenticatedSocket, data: any): Promise<void> {
    try {
      const { tradeId } = data;
      
      const result = await this.tradingService.cancelTrade(tradeId, socket.playerId!);
      
      if (result.success) {
        const trade = result.trade!;
        const otherPlayerId = trade.initiatorId === socket.playerId ? trade.recipientId : trade.initiatorId;
        
        // Notify other player
        this.sendToPlayer(otherPlayerId, 'trade:cancelled', { tradeId, reason: 'Cancelled by other player' });
        socket.emit('trade:cancelled', { tradeId, reason: 'Trade cancelled' });
      } else {
        socket.emit('error', { message: result.error });
      }
    } catch (error) {
      console.error('Error cancelling trade:', error);
      socket.emit('error', { message: 'Failed to cancel trade' });
    }
  }

  private async handlePlayerPositionUpdate(socket: AuthenticatedSocket, data: any): Promise<void> {
    try {
      const { position } = data;
      
      if (!position || typeof position.x !== 'number' || typeof position.y !== 'number' || typeof position.z !== 'number') {
        return; // Ignore invalid position updates
      }

      const connection = this.connections.get(socket.playerId!);
      if (connection?.currentZone) {
        // Broadcast position update to zone members
        socket.to(`zone:${connection.currentZone}`).emit('player:position_updated', {
          playerId: socket.playerId,
          position,
          timestamp: new Date()
        });
      }

      this.updatePlayerActivity(socket.playerId!);
    } catch (error) {
      console.error('Error handling position update:', error);
    }
  }

  private async handlePlayerStatusUpdate(socket: AuthenticatedSocket, data: any): Promise<void> {
    try {
      const { status } = data;
      
      const connection = this.connections.get(socket.playerId!);
      if (connection?.currentZone) {
        // Broadcast status update to zone members
        socket.to(`zone:${connection.currentZone}`).emit('player:status_updated', {
          playerId: socket.playerId,
          username: socket.username,
          status,
          timestamp: new Date()
        });
      }

      this.updatePlayerActivity(socket.playerId!);
    } catch (error) {
      console.error('Error handling status update:', error);
    }
  }

  private handleDisconnection(socket: AuthenticatedSocket): void {
    if (!socket.playerId) return;

    console.log(`Player disconnected: ${socket.username} (${socket.playerId})`);

    const connection = this.connections.get(socket.playerId);
    if (connection?.currentZone) {
      // Notify zone members
      socket.to(`zone:${connection.currentZone}`).emit('zone:player_left', {
        playerId: socket.playerId,
        username: socket.username,
        zoneId: connection.currentZone
      });
    }

    // Remove connection
    this.connections.delete(socket.playerId);
  }

  // Public methods for other services to use
  public sendToPlayer(playerId: string, event: string, data: any): void {
    this.io.to(`player:${playerId}`).emit(event, data);
  }

  public broadcastToZone(zoneId: string, event: string, data: any): void {
    this.io.to(`zone:${zoneId}`).emit(event, data);
  }

  public broadcastToChatChannel(channel: string, event: string, data: any): void {
    this.io.to(`chat:${channel}`).emit(event, data);
  }

  public broadcastToAll(event: string, data: any): void {
    this.io.emit(event, data);
  }

  public getConnectedPlayers(): string[] {
    return Array.from(this.connections.keys());
  }

  public isPlayerConnected(playerId: string): boolean {
    return this.connections.has(playerId);
  }

  public getPlayerConnection(playerId: string): PlayerConnection | undefined {
    return this.connections.get(playerId);
  }

  private updatePlayerActivity(playerId: string): void {
    const connection = this.connections.get(playerId);
    if (connection) {
      connection.lastActivity = new Date();
    }
  }

  // Cleanup inactive connections
  public cleanupInactiveConnections(): void {
    const now = new Date();
    const timeout = 5 * 60 * 1000; // 5 minutes

    for (const [playerId, connection] of this.connections.entries()) {
      if (now.getTime() - connection.lastActivity.getTime() > timeout) {
        console.log(`Cleaning up inactive connection for player: ${connection.username}`);
        connection.socket.disconnect();
        this.connections.delete(playerId);
      }
    }
  }

  public getServer(): SocketIOServer {
    return this.io;
  }
}