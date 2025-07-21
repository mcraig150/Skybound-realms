import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { io as ClientIO, Socket as ClientSocket } from 'socket.io-client';

describe('WebSocket Minimal Integration Tests', () => {
  let server: any;
  let io: SocketIOServer;
  let clientSocket: ClientSocket;
  let serverPort: number;

  beforeAll(async () => {
    // Find available port
    serverPort = 3004;
    
    // Create HTTP server
    server = createServer();
    
    // Create Socket.IO server with basic setup
    io = new SocketIOServer(server, {
      cors: {
        origin: '*',
        credentials: true
      }
    });

    // Basic connection handling
    io.on('connection', (socket) => {
      console.log(`Client connected: ${socket.id}`);
      
      // Echo back connection confirmation
      socket.emit('connected', {
        message: 'Connected to test server',
        socketId: socket.id,
        timestamp: new Date()
      });

      // Handle ping/pong
      socket.on('ping', () => {
        socket.emit('pong');
      });

      // Handle chat events
      socket.on('chat:join_channel', (data) => {
        if (!data.channel || typeof data.channel !== 'string') {
          socket.emit('error', { message: 'Invalid channel' });
          return;
        }
        socket.join(`chat:${data.channel}`);
        socket.emit('chat:joined_channel', { channel: data.channel });
      });

      socket.on('chat:send', (data) => {
        if (!data.message || typeof data.message !== 'string' || data.message.trim().length === 0) {
          socket.emit('error', { message: 'Invalid message' });
          return;
        }
        
        const channel = data.channel || 'global';
        const message = {
          id: Math.random().toString(36).substr(2, 9),
          senderId: socket.id,
          channel,
          message: data.message.trim(),
          timestamp: new Date()
        };
        
        io.to(`chat:${channel}`).emit('chat:message', message);
      });

      // Handle world events
      socket.on('world:join_zone', (data) => {
        if (!data.zoneId || typeof data.zoneId !== 'string') {
          socket.emit('error', { message: 'Invalid zone ID' });
          return;
        }
        socket.join(`zone:${data.zoneId}`);
        socket.emit('zone:joined', { zoneId: data.zoneId });
        socket.to(`zone:${data.zoneId}`).emit('zone:player_joined', {
          socketId: socket.id,
          zoneId: data.zoneId
        });
      });

      socket.on('disconnect', () => {
        console.log(`Client disconnected: ${socket.id}`);
      });
    });
    
    // Start server
    await new Promise<void>((resolve) => {
      server.listen(serverPort, () => {
        console.log(`Test server listening on port ${serverPort}`);
        resolve();
      });
    });
  });

  afterAll(async () => {
    if (clientSocket?.connected) {
      clientSocket.disconnect();
    }
    if (io) {
      io.close();
    }
    if (server) {
      server.close();
    }
  });

  describe('Basic Socket.IO Functionality', () => {
    it('should connect and receive confirmation', async () => {
      clientSocket = ClientIO(`http://localhost:${serverPort}`);

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Connection timeout'));
        }, 5000);

        clientSocket.on('connected', (data) => {
          clearTimeout(timeout);
          expect(data.message).toBe('Connected to test server');
          expect(data.socketId).toBeDefined();
          expect(data.timestamp).toBeDefined();
          resolve();
        });

        clientSocket.on('connect_error', (error) => {
          clearTimeout(timeout);
          reject(error);
        });
      });
    });

    it('should handle ping/pong', async () => {
      if (!clientSocket?.connected) {
        clientSocket = ClientIO(`http://localhost:${serverPort}`);
        await new Promise<void>((resolve) => {
          clientSocket.on('connected', () => resolve());
        });
      }

      clientSocket.emit('ping');

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Pong timeout'));
        }, 2000);

        clientSocket.on('pong', () => {
          clearTimeout(timeout);
          resolve();
        });
      });
    });

    it('should handle chat channel joining', async () => {
      if (!clientSocket?.connected) {
        clientSocket = ClientIO(`http://localhost:${serverPort}`);
        await new Promise<void>((resolve) => {
          clientSocket.on('connected', () => resolve());
        });
      }

      const channel = 'test-channel';
      clientSocket.emit('chat:join_channel', { channel });

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Join channel timeout'));
        }, 2000);

        clientSocket.on('chat:joined_channel', (data) => {
          clearTimeout(timeout);
          expect(data.channel).toBe(channel);
          resolve();
        });
      });
    });

    it('should handle chat messaging', async () => {
      if (!clientSocket?.connected) {
        clientSocket = ClientIO(`http://localhost:${serverPort}`);
        await new Promise<void>((resolve) => {
          clientSocket.on('connected', () => resolve());
        });
      }

      // Join a channel first
      const channel = 'test-chat';
      clientSocket.emit('chat:join_channel', { channel });
      
      await new Promise<void>((resolve) => {
        clientSocket.on('chat:joined_channel', () => resolve());
      });

      // Send a message
      const testMessage = 'Hello, WebSocket!';
      clientSocket.emit('chat:send', { channel, message: testMessage });

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Message timeout'));
        }, 2000);

        clientSocket.on('chat:message', (data) => {
          clearTimeout(timeout);
          expect(data.message).toBe(testMessage);
          expect(data.channel).toBe(channel);
          expect(data.senderId).toBeDefined();
          resolve();
        });
      });
    });

    it('should handle zone joining', async () => {
      if (!clientSocket?.connected) {
        clientSocket = ClientIO(`http://localhost:${serverPort}`);
        await new Promise<void>((resolve) => {
          clientSocket.on('connected', () => resolve());
        });
      }

      const zoneId = 'test-zone';
      clientSocket.emit('world:join_zone', { zoneId });

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Join zone timeout'));
        }, 2000);

        clientSocket.on('zone:joined', (data) => {
          clearTimeout(timeout);
          expect(data.zoneId).toBe(zoneId);
          resolve();
        });
      });
    });

    it('should handle invalid data gracefully', async () => {
      if (!clientSocket?.connected) {
        clientSocket = ClientIO(`http://localhost:${serverPort}`);
        await new Promise<void>((resolve) => {
          clientSocket.on('connected', () => resolve());
        });
      }

      // Test invalid channel
      clientSocket.emit('chat:join_channel', { channel: null });

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Error handling timeout'));
        }, 2000);

        clientSocket.on('error', (data) => {
          clearTimeout(timeout);
          expect(data.message).toBe('Invalid channel');
          resolve();
        });
      });
    });

    it('should handle empty messages', async () => {
      if (!clientSocket?.connected) {
        clientSocket = ClientIO(`http://localhost:${serverPort}`);
        await new Promise<void>((resolve) => {
          clientSocket.on('connected', () => resolve());
        });
      }

      // Test empty message
      clientSocket.emit('chat:send', { channel: 'test', message: '' });

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Error handling timeout'));
        }, 2000);

        clientSocket.on('error', (data) => {
          clearTimeout(timeout);
          expect(data.message).toBe('Invalid message');
          resolve();
        });
      });
    });
  });

  describe('Multi-client Communication', () => {
    let clientSocket2: ClientSocket;

    afterAll(() => {
      if (clientSocket2?.connected) {
        clientSocket2.disconnect();
      }
    });

    it('should broadcast messages between clients', async () => {
      // Connect first client
      clientSocket = ClientIO(`http://localhost:${serverPort}`);
      await new Promise<void>((resolve) => {
        clientSocket.on('connected', () => resolve());
      });

      // Connect second client
      clientSocket2 = ClientIO(`http://localhost:${serverPort}`);
      await new Promise<void>((resolve) => {
        clientSocket2.on('connected', () => resolve());
      });

      // Both join the same channel
      const channel = 'shared-channel';
      clientSocket.emit('chat:join_channel', { channel });
      clientSocket2.emit('chat:join_channel', { channel });

      await Promise.all([
        new Promise<void>((resolve) => {
          clientSocket.on('chat:joined_channel', () => resolve());
        }),
        new Promise<void>((resolve) => {
          clientSocket2.on('chat:joined_channel', () => resolve());
        })
      ]);

      // Client 1 sends message
      const testMessage = 'Hello from client 1!';
      clientSocket.emit('chat:send', { channel, message: testMessage });

      // Client 2 should receive the message
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Message broadcast timeout'));
        }, 3000);

        clientSocket2.on('chat:message', (data) => {
          clearTimeout(timeout);
          expect(data.message).toBe(testMessage);
          expect(data.channel).toBe(channel);
          resolve();
        });
      });
    });

    it('should broadcast zone events between clients', async () => {
      if (!clientSocket?.connected) {
        clientSocket = ClientIO(`http://localhost:${serverPort}`);
        await new Promise<void>((resolve) => {
          clientSocket.on('connected', () => resolve());
        });
      }

      if (!clientSocket2?.connected) {
        clientSocket2 = ClientIO(`http://localhost:${serverPort}`);
        await new Promise<void>((resolve) => {
          clientSocket2.on('connected', () => resolve());
        });
      }

      const zoneId = 'shared-zone';

      // Client 1 joins zone first
      clientSocket.emit('world:join_zone', { zoneId });
      await new Promise<void>((resolve) => {
        clientSocket.on('zone:joined', () => resolve());
      });

      // Client 2 joins zone and should see client 1's join event
      clientSocket2.emit('world:join_zone', { zoneId });

      await Promise.all([
        new Promise<void>((resolve) => {
          clientSocket2.on('zone:joined', () => resolve());
        }),
        new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error('Zone join broadcast timeout'));
          }, 3000);

          clientSocket.on('zone:player_joined', (data) => {
            clearTimeout(timeout);
            expect(data.zoneId).toBe(zoneId);
            expect(data.socketId).toBeDefined();
            resolve();
          });
        })
      ]);
    });
  });
});