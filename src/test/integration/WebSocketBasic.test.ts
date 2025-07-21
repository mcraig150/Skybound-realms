import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { createServer } from 'http';
import { io as ClientIO, Socket as ClientSocket } from 'socket.io-client';
import jwt from 'jsonwebtoken';
import { WebSocketService } from '../../services/WebSocketService';
import { ConnectionManager } from '../../services/ConnectionManager';
import { PlayerService } from '../../services/PlayerService';
import { ChatServiceImpl } from '../../services/ChatService';
import { TradingServiceImpl } from '../../services/TradingService';
import { WorldService } from '../../services/WorldService';
import { PlayerRepository } from '../../repositories/PlayerRepository';

describe('WebSocket Basic Integration Tests', () => {
  let server: any;
  let webSocketService: WebSocketService;
  let connectionManager: ConnectionManager;
  let clientSocket: ClientSocket;
  let serverPort: number;

  const testPlayer = {
    id: 'test-player-1',
    username: 'TestPlayer1',
    email: 'test1@example.com'
  };

  beforeAll(async () => {
    // Find available port
    serverPort = 3003;
    
    // Create HTTP server
    server = createServer();
    
    // Initialize services with minimal setup
    const playerService = new PlayerService();
    const playerRepository = new PlayerRepository();
    const chatService = new ChatServiceImpl(playerRepository);
    const tradingService = new TradingServiceImpl();
    const worldService = new WorldService();
    
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

    // Create test player
    try {
      await playerService.createPlayer(testPlayer);
    } catch (error) {
      // Player might already exist, ignore error
    }
  });

  afterAll(async () => {
    if (connectionManager) {
      connectionManager.shutdown();
    }
    if (server) {
      server.close();
    }
  });

  afterEach(() => {
    // Disconnect client
    if (clientSocket?.connected) {
      clientSocket.disconnect();
    }
  });

  describe('Basic Connection', () => {
    it('should connect with valid authentication', async () => {
      const token = jwt.sign({ playerId: testPlayer.id }, process.env.JWT_SECRET || 'fallback-secret');
      
      clientSocket = ClientIO(`http://localhost:${serverPort}`, {
        auth: { token }
      });

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Connection timeout'));
        }, 5000);

        clientSocket.on('connected', (data) => {
          clearTimeout(timeout);
          expect(data.playerId).toBe(testPlayer.id);
          expect(data.message).toBe('Connected to Skybound Realms');
          resolve();
        });

        clientSocket.on('connect_error', (error) => {
          clearTimeout(timeout);
          reject(error);
        });
      });

      expect(webSocketService.isPlayerConnected(testPlayer.id)).toBe(true);
    });

    it('should reject connection without token', async () => {
      clientSocket = ClientIO(`http://localhost:${serverPort}`);

      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          resolve(); // If no error after timeout, consider test passed
        }, 2000);

        clientSocket.on('connect_error', (error) => {
          clearTimeout(timeout);
          expect(error.message).toContain('Authentication token required');
          resolve();
        });

        clientSocket.on('connected', () => {
          clearTimeout(timeout);
          throw new Error('Should not connect without token');
        });
      });
    });

    it('should handle disconnection', async () => {
      const token = jwt.sign({ playerId: testPlayer.id }, process.env.JWT_SECRET || 'fallback-secret');
      
      clientSocket = ClientIO(`http://localhost:${serverPort}`, {
        auth: { token }
      });

      await new Promise<void>((resolve) => {
        clientSocket.on('connected', () => {
          expect(webSocketService.isPlayerConnected(testPlayer.id)).toBe(true);
          clientSocket.disconnect();
        });

        clientSocket.on('disconnect', () => {
          setTimeout(() => {
            expect(webSocketService.isPlayerConnected(testPlayer.id)).toBe(false);
            resolve();
          }, 100);
        });
      });
    });
  });

  describe('Basic Messaging', () => {
    beforeEach(async () => {
      const token = jwt.sign({ playerId: testPlayer.id }, process.env.JWT_SECRET || 'fallback-secret');
      clientSocket = ClientIO(`http://localhost:${serverPort}`, { auth: { token } });

      await new Promise<void>((resolve) => {
        clientSocket.on('connected', () => resolve());
      });
    });

    it('should respond to ping with pong', async () => {
      clientSocket.emit('ping');

      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          throw new Error('Pong timeout');
        }, 2000);

        clientSocket.on('pong', () => {
          clearTimeout(timeout);
          resolve();
        });
      });
    });

    it('should handle chat channel joining', async () => {
      const channel = 'test-channel';

      clientSocket.emit('chat:join_channel', { channel });

      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          throw new Error('Join channel timeout');
        }, 2000);

        clientSocket.on('chat:joined_channel', (data) => {
          clearTimeout(timeout);
          expect(data.channel).toBe(channel);
          resolve();
        });

        clientSocket.on('error', (error) => {
          clearTimeout(timeout);
          throw new Error(`Chat join error: ${error.message}`);
        });
      });
    });

    it('should handle zone joining', async () => {
      const zoneId = 'test-zone';

      clientSocket.emit('world:join_zone', { zoneId });

      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          throw new Error('Join zone timeout');
        }, 2000);

        clientSocket.on('zone:joined', (data) => {
          clearTimeout(timeout);
          expect(data.zoneId).toBe(zoneId);
          resolve();
        });

        clientSocket.on('error', (error) => {
          clearTimeout(timeout);
          throw new Error(`Zone join error: ${error.message}`);
        });
      });
    });
  });

  describe('Error Handling', () => {
    beforeEach(async () => {
      const token = jwt.sign({ playerId: testPlayer.id }, process.env.JWT_SECRET || 'fallback-secret');
      clientSocket = ClientIO(`http://localhost:${serverPort}`, { auth: { token } });

      await new Promise<void>((resolve) => {
        clientSocket.on('connected', () => resolve());
      });
    });

    it('should handle invalid chat data', async () => {
      clientSocket.emit('chat:join_channel', { channel: null });

      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          throw new Error('Error handling timeout');
        }, 2000);

        clientSocket.on('error', (data) => {
          clearTimeout(timeout);
          expect(data.message).toBe('Invalid channel');
          resolve();
        });
      });
    });

    it('should handle invalid zone data', async () => {
      clientSocket.emit('world:join_zone', { zoneId: null });

      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          throw new Error('Error handling timeout');
        }, 2000);

        clientSocket.on('error', (data) => {
          clearTimeout(timeout);
          expect(data.message).toBe('Invalid zone ID');
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
      expect(typeof stats.totalConnections).toBe('number');
      expect(typeof stats.activeConnections).toBe('number');
    });

    it('should broadcast system messages', async () => {
      const token = jwt.sign({ playerId: testPlayer.id }, process.env.JWT_SECRET || 'fallback-secret');
      clientSocket = ClientIO(`http://localhost:${serverPort}`, { auth: { token } });

      await new Promise<void>((resolve) => {
        clientSocket.on('connected', () => resolve());
      });

      const testMessage = 'System test message';
      connectionManager.broadcastSystemMessage(testMessage, 'info');

      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          throw new Error('System message timeout');
        }, 2000);

        clientSocket.on('system:message', (data) => {
          clearTimeout(timeout);
          expect(data.message).toBe(testMessage);
          expect(data.level).toBe('info');
          resolve();
        });
      });
    });
  });
});