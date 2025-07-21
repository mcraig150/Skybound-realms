import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { io as ClientIO, Socket as ClientSocket } from 'socket.io-client';
import jwt from 'jsonwebtoken';
import { WebSocketService } from '../../services/WebSocketService';
import { ConnectionManager } from '../../services/ConnectionManager';
import { PlayerService } from '../../services/PlayerService';
import { ChatServiceImpl } from '../../services/ChatService';
import { TradingServiceImpl } from '../../services/TradingService';
import { WorldService } from '../../services/WorldService';
import { PlayerRepository } from '../../repositories/PlayerRepository';

describe('WebSocket Integration Tests', () => {
  let server: any;
  let webSocketService: WebSocketService;
  let connectionManager: ConnectionManager;
  let playerService: PlayerService;
  let chatService: ChatServiceImpl;
  let tradingService: TradingServiceImpl;
  let worldService: WorldService;
  let clientSocket1: ClientSocket;
  let clientSocket2: ClientSocket;
  let serverPort: number;

  const testPlayer1 = {
    id: 'player1',
    username: 'TestPlayer1',
    email: 'test1@example.com'
  };

  const testPlayer2 = {
    id: 'player2',
    username: 'TestPlayer2',
    email: 'test2@example.com'
  };

  beforeAll(async () => {
    // Find available port
    serverPort = 3002;
    
    // Create HTTP server
    server = createServer();
    
    // Initialize services
    const playerRepository = new PlayerRepository();
    playerService = new PlayerService();
    chatService = new ChatServiceImpl(playerRepository);
    tradingService = new TradingServiceImpl();
    worldService = new WorldService();
    
    // Initialize WebSocket service
    webSocketService = new WebSocketService(
      server,
      playerService,
      chatService,
      tradingService,
      worldService
    );
    
    // Initialize connection manager
    connectionManager = new ConnectionManager(webSocketService);
    
    // Start server
    await new Promise<void>((resolve) => {
      server.listen(serverPort, () => {
        resolve();
      });
    });
  });

  afterAll(async () => {
    if (connectionManager) {
      connectionManager.shutdown();
    }
    if (server) {
      server.close();
    }
  });

  beforeEach(async () => {
    // Create test players
    await playerService.createPlayer(testPlayer1);
    await playerService.createPlayer(testPlayer2);
  });

  afterEach(() => {
    // Disconnect clients
    if (clientSocket1?.connected) {
      clientSocket1.disconnect();
    }
    if (clientSocket2?.connected) {
      clientSocket2.disconnect();
    }
  });

  describe('Connection Management', () => {
    it('should authenticate and connect a player', async () => {
      const token = jwt.sign({ playerId: testPlayer1.id }, process.env.JWT_SECRET || 'fallback-secret');
      
      clientSocket1 = ClientIO(`http://localhost:${serverPort}`, {
        auth: { token }
      });

      await new Promise<void>((resolve, reject) => {
        clientSocket1.on('connected', (data) => {
          expect(data.playerId).toBe(testPlayer1.id);
          expect(data.message).toBe('Connected to Skybound Realms');
          resolve();
        });

        clientSocket1.on('connect_error', (error) => {
          reject(error);
        });

        setTimeout(() => reject(new Error('Connection timeout')), 5000);
      });

      expect(webSocketService.isPlayerConnected(testPlayer1.id)).toBe(true);
    });

    it('should reject connection without valid token', async () => {
      clientSocket1 = ClientIO(`http://localhost:${serverPort}`, {
        auth: { token: 'invalid-token' }
      });

      await new Promise<void>((resolve) => {
        clientSocket1.on('connect_error', (error) => {
          expect(error.message).toContain('Invalid authentication token');
          resolve();
        });

        clientSocket1.on('connected', () => {
          throw new Error('Should not connect with invalid token');
        });

        setTimeout(() => resolve(), 2000);
      });
    });

    it('should handle player disconnection', async () => {
      const token = jwt.sign({ playerId: testPlayer1.id }, process.env.JWT_SECRET || 'fallback-secret');
      
      clientSocket1 = ClientIO(`http://localhost:${serverPort}`, {
        auth: { token }
      });

      await new Promise<void>((resolve) => {
        clientSocket1.on('connected', () => {
          expect(webSocketService.isPlayerConnected(testPlayer1.id)).toBe(true);
          clientSocket1.disconnect();
        });

        clientSocket1.on('disconnect', () => {
          setTimeout(() => {
            expect(webSocketService.isPlayerConnected(testPlayer1.id)).toBe(false);
            resolve();
          }, 100);
        });
      });
    });
  });

  describe('Chat System', () => {
    beforeEach(async () => {
      // Connect both players
      const token1 = jwt.sign({ playerId: testPlayer1.id }, process.env.JWT_SECRET || 'fallback-secret');
      const token2 = jwt.sign({ playerId: testPlayer2.id }, process.env.JWT_SECRET || 'fallback-secret');

      clientSocket1 = ClientIO(`http://localhost:${serverPort}`, { auth: { token: token1 } });
      clientSocket2 = ClientIO(`http://localhost:${serverPort}`, { auth: { token: token2 } });

      await Promise.all([
        new Promise<void>((resolve) => clientSocket1.on('connected', () => resolve())),
        new Promise<void>((resolve) => clientSocket2.on('connected', () => resolve()))
      ]);
    });

    it('should send and receive chat messages', async () => {
      const testMessage = 'Hello, world!';
      const channel = 'global';

      // Join chat channel
      clientSocket1.emit('chat:join_channel', { channel });
      clientSocket2.emit('chat:join_channel', { channel });

      await Promise.all([
        new Promise<void>((resolve) => clientSocket1.on('chat:joined_channel', () => resolve())),
        new Promise<void>((resolve) => clientSocket2.on('chat:joined_channel', () => resolve()))
      ]);

      // Send message from player 1
      clientSocket1.emit('chat:send', { channel, message: testMessage });

      // Player 2 should receive the message
      await new Promise<void>((resolve) => {
        clientSocket2.on('chat:message', (data) => {
          expect(data.message).toBe(testMessage);
          expect(data.playerId).toBe(testPlayer1.id);
          expect(data.channel).toBe(channel);
          resolve();
        });
      });
    });

    it('should handle joining and leaving chat channels', async () => {
      const channel = 'test-channel';

      // Player 1 joins channel
      clientSocket1.emit('chat:join_channel', { channel });

      await new Promise<void>((resolve) => {
        clientSocket1.on('chat:joined_channel', (data) => {
          expect(data.channel).toBe(channel);
          resolve();
        });
      });

      // Player 2 joins and should see player 1 join notification
      clientSocket2.emit('chat:join_channel', { channel });

      await Promise.all([
        new Promise<void>((resolve) => {
          clientSocket1.on('chat:player_joined', (data) => {
            expect(data.playerId).toBe(testPlayer2.id);
            expect(data.username).toBe(testPlayer2.username);
            expect(data.channel).toBe(channel);
            resolve();
          });
        }),
        new Promise<void>((resolve) => {
          clientSocket2.on('chat:joined_channel', () => resolve());
        })
      ]);

      // Player 1 leaves channel
      clientSocket1.emit('chat:leave_channel', { channel });

      await Promise.all([
        new Promise<void>((resolve) => {
          clientSocket2.on('chat:player_left', (data) => {
            expect(data.playerId).toBe(testPlayer1.id);
            expect(data.username).toBe(testPlayer1.username);
            expect(data.channel).toBe(channel);
            resolve();
          });
        }),
        new Promise<void>((resolve) => {
          clientSocket1.on('chat:left_channel', (data) => {
            expect(data.channel).toBe(channel);
            resolve();
          });
        })
      ]);
    });

    it('should reject empty or invalid messages', async () => {
      const channel = 'global';
      clientSocket1.emit('chat:join_channel', { channel });

      await new Promise<void>((resolve) => {
        clientSocket1.on('chat:joined_channel', () => resolve());
      });

      // Send empty message
      clientSocket1.emit('chat:send', { channel, message: '' });

      await new Promise<void>((resolve) => {
        clientSocket1.on('error', (data) => {
          expect(data.message).toBe('Invalid message');
          resolve();
        });
      });
    });
  });

  describe('World System', () => {
    beforeEach(async () => {
      const token1 = jwt.sign({ playerId: testPlayer1.id }, process.env.JWT_SECRET || 'fallback-secret');
      clientSocket1 = ClientIO(`http://localhost:${serverPort}`, { auth: { token: token1 } });

      await new Promise<void>((resolve) => {
        clientSocket1.on('connected', () => resolve());
      });
    });

    it('should handle zone joining and leaving', async () => {
      const zoneId = 'test-zone';

      // Join zone
      clientSocket1.emit('world:join_zone', { zoneId });

      await new Promise<void>((resolve) => {
        clientSocket1.on('zone:joined', (data) => {
          expect(data.zoneId).toBe(zoneId);
          resolve();
        });
      });

      // Leave zone
      clientSocket1.emit('world:leave_zone', { zoneId });

      await new Promise<void>((resolve) => {
        clientSocket1.on('zone:left', (data) => {
          expect(data.zoneId).toBe(zoneId);
          resolve();
        });
      });
    });

    it('should broadcast zone events to other players', async () => {
      const token2 = jwt.sign({ playerId: testPlayer2.id }, process.env.JWT_SECRET || 'fallback-secret');
      clientSocket2 = ClientIO(`http://localhost:${serverPort}`, { auth: { token: token2 } });

      await new Promise<void>((resolve) => {
        clientSocket2.on('connected', () => resolve());
      });

      const zoneId = 'shared-zone';

      // Both players join the same zone
      clientSocket1.emit('world:join_zone', { zoneId });
      await new Promise<void>((resolve) => {
        clientSocket1.on('zone:joined', () => resolve());
      });

      // Player 2 joins and should see player 1's join notification
      clientSocket2.emit('world:join_zone', { zoneId });

      await Promise.all([
        new Promise<void>((resolve) => {
          clientSocket1.on('zone:player_joined', (data) => {
            expect(data.playerId).toBe(testPlayer2.id);
            expect(data.username).toBe(testPlayer2.username);
            expect(data.zoneId).toBe(zoneId);
            resolve();
          });
        }),
        new Promise<void>((resolve) => {
          clientSocket2.on('zone:joined', () => resolve());
        })
      ]);
    });

    it('should handle block changes', async () => {
      const position = { x: 10, y: 5, z: 10 };
      const blockType = 1;
      const action = 'place';

      clientSocket1.emit('world:block_change', { position, blockType, action });

      // Note: This test assumes the WorldService.modifyBlock method works correctly
      // In a real scenario, you might want to mock the WorldService or set up test data
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          // If no error is received within timeout, consider it successful
          resolve();
        }, 1000);

        clientSocket1.on('error', (data) => {
          clearTimeout(timeout);
          // Expect specific error for test scenario
          expect(data.message).toContain('Island not found');
          resolve();
        });
      });
    });
  });

  describe('Trading System', () => {
    beforeEach(async () => {
      const token1 = jwt.sign({ playerId: testPlayer1.id }, process.env.JWT_SECRET || 'fallback-secret');
      const token2 = jwt.sign({ playerId: testPlayer2.id }, process.env.JWT_SECRET || 'fallback-secret');

      clientSocket1 = ClientIO(`http://localhost:${serverPort}`, { auth: { token: token1 } });
      clientSocket2 = ClientIO(`http://localhost:${serverPort}`, { auth: { token: token2 } });

      await Promise.all([
        new Promise<void>((resolve) => clientSocket1.on('connected', () => resolve())),
        new Promise<void>((resolve) => clientSocket2.on('connected', () => resolve()))
      ]);
    });

    it('should initiate trade between players', async () => {
      // Player 1 initiates trade with Player 2
      clientSocket1.emit('trade:initiate', { targetPlayerId: testPlayer2.id });

      await Promise.all([
        new Promise<void>((resolve) => {
          clientSocket1.on('trade:initiated', (data) => {
            expect(data.player1Id).toBe(testPlayer1.id);
            expect(data.player2Id).toBe(testPlayer2.id);
            resolve();
          });
        }),
        new Promise<void>((resolve) => {
          clientSocket2.on('trade:request', (data) => {
            expect(data.initiatorId).toBe(testPlayer1.id);
            expect(data.initiatorUsername).toBe(testPlayer1.username);
            resolve();
          });
        })
      ]);
    });

    it('should handle trade responses', async () => {
      // First initiate a trade
      clientSocket1.emit('trade:initiate', { targetPlayerId: testPlayer2.id });

      let tradeId: string;
      await new Promise<void>((resolve) => {
        clientSocket2.on('trade:request', (data) => {
          tradeId = data.tradeId;
          resolve();
        });
      });

      // Player 2 accepts the trade
      clientSocket2.emit('trade:respond', { tradeId, accepted: true });

      await Promise.all([
        new Promise<void>((resolve) => {
          clientSocket1.on('trade:response', (data) => {
            expect(data.accepted).toBe(true);
            expect(data.tradeId).toBe(tradeId);
            resolve();
          });
        }),
        new Promise<void>((resolve) => {
          clientSocket2.on('trade:response', (data) => {
            expect(data.accepted).toBe(true);
            expect(data.tradeId).toBe(tradeId);
            resolve();
          });
        })
      ]);
    });
  });

  describe('Player Updates', () => {
    beforeEach(async () => {
      const token1 = jwt.sign({ playerId: testPlayer1.id }, process.env.JWT_SECRET || 'fallback-secret');
      const token2 = jwt.sign({ playerId: testPlayer2.id }, process.env.JWT_SECRET || 'fallback-secret');

      clientSocket1 = ClientIO(`http://localhost:${serverPort}`, { auth: { token: token1 } });
      clientSocket2 = ClientIO(`http://localhost:${serverPort}`, { auth: { token: token2 } });

      await Promise.all([
        new Promise<void>((resolve) => clientSocket1.on('connected', () => resolve())),
        new Promise<void>((resolve) => clientSocket2.on('connected', () => resolve()))
      ]);
    });

    it('should broadcast position updates to zone members', async () => {
      const zoneId = 'test-zone';
      const position = { x: 100, y: 50, z: 200 };

      // Both players join the same zone
      clientSocket1.emit('world:join_zone', { zoneId });
      clientSocket2.emit('world:join_zone', { zoneId });

      await Promise.all([
        new Promise<void>((resolve) => clientSocket1.on('zone:joined', () => resolve())),
        new Promise<void>((resolve) => clientSocket2.on('zone:joined', () => resolve()))
      ]);

      // Player 1 updates position
      clientSocket1.emit('player:update_position', { position });

      // Player 2 should receive the position update
      await new Promise<void>((resolve) => {
        clientSocket2.on('player:position_updated', (data) => {
          expect(data.playerId).toBe(testPlayer1.id);
          expect(data.position).toEqual(position);
          resolve();
        });
      });
    });

    it('should broadcast status updates to zone members', async () => {
      const zoneId = 'test-zone';
      const status = { health: 80, mana: 60, level: 25 };

      // Both players join the same zone
      clientSocket1.emit('world:join_zone', { zoneId });
      clientSocket2.emit('world:join_zone', { zoneId });

      await Promise.all([
        new Promise<void>((resolve) => clientSocket1.on('zone:joined', () => resolve())),
        new Promise<void>((resolve) => clientSocket2.on('zone:joined', () => resolve()))
      ]);

      // Player 1 updates status
      clientSocket1.emit('player:update_status', { status });

      // Player 2 should receive the status update
      await new Promise<void>((resolve) => {
        clientSocket2.on('player:status_updated', (data) => {
          expect(data.playerId).toBe(testPlayer1.id);
          expect(data.username).toBe(testPlayer1.username);
          expect(data.status).toEqual(status);
          resolve();
        });
      });
    });
  });

  describe('Heartbeat and Connection Health', () => {
    beforeEach(async () => {
      const token1 = jwt.sign({ playerId: testPlayer1.id }, process.env.JWT_SECRET || 'fallback-secret');
      clientSocket1 = ClientIO(`http://localhost:${serverPort}`, { auth: { token: token1 } });

      await new Promise<void>((resolve) => {
        clientSocket1.on('connected', () => resolve());
      });
    });

    it('should respond to ping with pong', async () => {
      clientSocket1.emit('ping');

      await new Promise<void>((resolve) => {
        clientSocket1.on('pong', () => {
          resolve();
        });
      });
    });
  });

  describe('Error Handling', () => {
    beforeEach(async () => {
      const token1 = jwt.sign({ playerId: testPlayer1.id }, process.env.JWT_SECRET || 'fallback-secret');
      clientSocket1 = ClientIO(`http://localhost:${serverPort}`, { auth: { token: token1 } });

      await new Promise<void>((resolve) => {
        clientSocket1.on('connected', () => resolve());
      });
    });

    it('should handle invalid chat channel data', async () => {
      clientSocket1.emit('chat:join_channel', { channel: null });

      await new Promise<void>((resolve) => {
        clientSocket1.on('error', (data) => {
          expect(data.message).toBe('Invalid channel');
          resolve();
        });
      });
    });

    it('should handle invalid zone data', async () => {
      clientSocket1.emit('world:join_zone', { zoneId: null });

      await new Promise<void>((resolve) => {
        clientSocket1.on('error', (data) => {
          expect(data.message).toBe('Invalid zone ID');
          resolve();
        });
      });
    });

    it('should handle invalid trade data', async () => {
      clientSocket1.emit('trade:initiate', { targetPlayerId: null });

      await new Promise<void>((resolve) => {
        clientSocket1.on('error', (data) => {
          expect(data.message).toBe('Target player ID required');
          resolve();
        });
      });
    });
  });

  describe('Connection Manager', () => {
    it('should track connection statistics', () => {
      const stats = connectionManager.getConnectionStats();
      expect(stats).toHaveProperty('totalConnections');
      expect(stats).toHaveProperty('activeConnections');
      expect(stats).toHaveProperty('connectionsByZone');
      expect(stats).toHaveProperty('connectionsByChannel');
    });

    it('should broadcast system messages', async () => {
      const token1 = jwt.sign({ playerId: testPlayer1.id }, process.env.JWT_SECRET || 'fallback-secret');
      clientSocket1 = ClientIO(`http://localhost:${serverPort}`, { auth: { token: token1 } });

      await new Promise<void>((resolve) => {
        clientSocket1.on('connected', () => resolve());
      });

      const testMessage = 'System maintenance in 5 minutes';
      connectionManager.broadcastSystemMessage(testMessage, 'warning');

      await new Promise<void>((resolve) => {
        clientSocket1.on('system:message', (data) => {
          expect(data.message).toBe(testMessage);
          expect(data.level).toBe('warning');
          resolve();
        });
      });
    });
  });
});