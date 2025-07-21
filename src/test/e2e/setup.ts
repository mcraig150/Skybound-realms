import { beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { Pool } from 'pg';
import { createClient } from 'redis';
import { Server } from 'http';
import express from 'express';
import { io as Client, Socket } from 'socket.io-client';
import supertest from 'supertest';

export interface TestEnvironment {
  app: express.Application;
  server: Server;
  dbPool: Pool;
  redisClient: any;
  request: supertest.SuperTest<supertest.Test>;
  wsClient: Socket;
  testData: {
    players: any[];
    islands: any[];
    items: any[];
    guilds: any[];
  };
}

let testEnv: TestEnvironment;

export const setupE2EEnvironment = () => {
  beforeAll(async () => {
    // Initialize test database
    const dbPool = new Pool({
      host: process.env.TEST_DB_HOST || 'localhost',
      port: parseInt(process.env.TEST_DB_PORT || '5432'),
      database: process.env.TEST_DB_NAME || 'skybound_test',
      user: process.env.TEST_DB_USER || 'postgres',
      password: process.env.TEST_DB_PASSWORD || 'password',
    });

    // Initialize Redis client
    const redisClient = createClient({
      url: process.env.TEST_REDIS_URL || 'redis://localhost:6379/1'
    });
    await redisClient.connect();

    // Create Express app and server
    const app = express();
    const server = app.listen(0); // Use random port
    const request = supertest(app);

    // Create WebSocket client
    const port = (server.address() as any)?.port;
    const wsClient = Client(`http://localhost:${port}`);

    testEnv = {
      app,
      server,
      dbPool,
      redisClient,
      request,
      wsClient,
      testData: {
        players: [],
        islands: [],
        items: [],
        guilds: []
      }
    };

    // Wait for WebSocket connection
    await new Promise<void>((resolve) => {
      wsClient.on('connect', resolve);
    });
  });

  afterAll(async () => {
    if (testEnv) {
      await testEnv.wsClient.disconnect();
      await testEnv.redisClient.quit();
      await testEnv.dbPool.end();
      testEnv.server.close();
    }
  });

  beforeEach(async () => {
    // Clean up test data before each test
    await cleanupTestData();
  });

  afterEach(async () => {
    // Clean up test data after each test
    await cleanupTestData();
  });

  return () => testEnv;
};

async function cleanupTestData() {
  if (!testEnv) return;

  try {
    // Clean up database tables in correct order (respecting foreign keys)
    const tables = [
      'guild_members',
      'guilds',
      'market_listings',
      'transactions',
      'minions',
      'player_skills',
      'player_inventory',
      'island_chunks',
      'islands',
      'players'
    ];

    for (const table of tables) {
      await testEnv.dbPool.query(`DELETE FROM ${table} WHERE created_at > NOW() - INTERVAL '1 hour'`);
    }

    // Clear Redis cache
    await testEnv.redisClient.flushDb();

    // Reset test data
    testEnv.testData = {
      players: [],
      islands: [],
      items: [],
      guilds: []
    };
  } catch (error) {
    console.warn('Cleanup warning:', error);
  }
}

export const generateTestData = {
  player: (overrides: any = {}) => ({
    id: `test-player-${Date.now()}-${Math.random()}`,
    username: `testuser${Math.floor(Math.random() * 10000)}`,
    email: `test${Math.floor(Math.random() * 10000)}@example.com`,
    password: 'testpassword123',
    skills: {
      mining: { level: 1, experience: 0 },
      farming: { level: 1, experience: 0 },
      combat: { level: 1, experience: 0 }
    },
    inventory: [],
    currency: { coins: 1000 },
    ...overrides
  }),

  island: (playerId: string, overrides: any = {}) => ({
    id: `test-island-${Date.now()}-${Math.random()}`,
    ownerId: playerId,
    expansionLevel: 1,
    chunks: [],
    permissions: { public: false, friends: true },
    ...overrides
  }),

  item: (overrides: any = {}) => ({
    id: `test-item-${Date.now()}-${Math.random()}`,
    name: `Test Item ${Math.floor(Math.random() * 1000)}`,
    type: 'resource',
    rarity: 'common',
    stackSize: 64,
    ...overrides
  }),

  guild: (overrides: any = {}) => ({
    id: `test-guild-${Date.now()}-${Math.random()}`,
    name: `Test Guild ${Math.floor(Math.random() * 1000)}`,
    description: 'A test guild',
    memberLimit: 50,
    level: 1,
    ...overrides
  })
};