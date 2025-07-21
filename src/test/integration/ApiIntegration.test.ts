import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../../index';
import { PlayerService } from '../../services/PlayerService';
import { WorldService } from '../../services/WorldService';
import { EconomyService } from '../../services/EconomyService';
import { TradingServiceImpl } from '../../services/TradingService';
import { generateToken } from '../../middleware/auth';

describe('API Integration Tests', () => {
  let authToken: string;
  let testPlayerId: string;
  let playerService: PlayerService;
  let worldService: WorldService;
  let economyService: EconomyService;

  beforeAll(async () => {
    // Initialize services
    playerService = new PlayerService();
    worldService = new WorldService();
    economyService = new EconomyService();
    
    // Create test player
    const testPlayer = await playerService.createPlayer({
      username: 'testplayer',
      email: 'test@example.com',
      passwordHash: 'hashedpassword'
    });
    
    testPlayerId = testPlayer.id;
    authToken = generateToken(testPlayerId, 'testplayer');
  });

  afterAll(async () => {
    // Cleanup test data
    if (testPlayerId) {
      await playerService.deletePlayer(testPlayerId);
    }
  });

  describe('Authentication Endpoints', () => {
    describe('POST /api/auth/register', () => {
      it('should register a new player successfully', async () => {
        const response = await request(app)
          .post('/api/auth/register')
          .send({
            username: 'newplayer',
            email: 'newplayer@example.com',
            password: 'password123'
          });

        expect(response.status).toBe(201);
        expect(response.body.success).toBe(true);
        expect(response.body.player.username).toBe('newplayer');
        expect(response.body.token).toBeDefined();
        
        // Cleanup
        await playerService.deletePlayer(response.body.player.id);
      });

      it('should reject registration with invalid data', async () => {
        const response = await request(app)
          .post('/api/auth/register')
          .send({
            username: 'ab', // too short
            email: 'invalid-email',
            password: '123' // too short
          });

        expect(response.status).toBe(400);
        expect(response.body.code).toBe('VALIDATION_ERROR');
      });

      it('should reject duplicate username', async () => {
        const response = await request(app)
          .post('/api/auth/register')
          .send({
            username: 'testplayer', // already exists
            email: 'another@example.com',
            password: 'password123'
          });

        expect(response.status).toBe(409);
        expect(response.body.code).toBe('USERNAME_EXISTS');
      });
    });

    describe('POST /api/auth/login', () => {
      it('should login successfully with valid credentials', async () => {
        // First create a player with known password
        const hashedPassword = await require('bcrypt').hash('testpassword', 12);
        const loginTestPlayer = await playerService.createPlayer({
          username: 'logintest',
          email: 'logintest@example.com',
          passwordHash: hashedPassword
        });

        const response = await request(app)
          .post('/api/auth/login')
          .send({
            username: 'logintest',
            password: 'testpassword'
          });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.token).toBeDefined();
        
        // Cleanup
        await playerService.deletePlayer(loginTestPlayer.id);
      });

      it('should reject invalid credentials', async () => {
        const response = await request(app)
          .post('/api/auth/login')
          .send({
            username: 'nonexistent',
            password: 'wrongpassword'
          });

        expect(response.status).toBe(401);
        expect(response.body.code).toBe('INVALID_CREDENTIALS');
      });
    });
  });

  describe('Player Endpoints', () => {
    describe('GET /api/player', () => {
      it('should get current player data', async () => {
        const response = await request(app)
          .get('/api/player')
          .set('Authorization', `Bearer ${authToken}`);

        expect(response.status).toBe(200);
        expect(response.body.id).toBe(testPlayerId);
        expect(response.body.username).toBe('testplayer');
      });

      it('should reject request without token', async () => {
        const response = await request(app)
          .get('/api/player');

        expect(response.status).toBe(401);
        expect(response.body.code).toBe('MISSING_TOKEN');
      });

      it('should reject request with invalid token', async () => {
        const response = await request(app)
          .get('/api/player')
          .set('Authorization', 'Bearer invalid-token');

        expect(response.status).toBe(403);
        expect(response.body.code).toBe('INVALID_TOKEN');
      });
    });

    describe('PUT /api/player', () => {
      it('should update player data', async () => {
        const response = await request(app)
          .put('/api/player')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            settings: { theme: 'dark', notifications: true }
          });

        expect(response.status).toBe(200);
        expect(response.body.settings).toEqual({ theme: 'dark', notifications: true });
      });
    });

    describe('GET /api/player/skills', () => {
      it('should get player skills', async () => {
        const response = await request(app)
          .get('/api/player/skills')
          .set('Authorization', `Bearer ${authToken}`);

        expect(response.status).toBe(200);
        expect(response.body).toBeDefined();
      });
    });

    describe('POST /api/player/skills/experience', () => {
      it('should add experience to skill', async () => {
        const response = await request(app)
          .post('/api/player/skills/experience')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            skillType: 'MINING',
            amount: 100
          });

        expect(response.status).toBe(200);
        expect(response.body.experienceGained).toBe(100);
      });

      it('should reject invalid skill type', async () => {
        const response = await request(app)
          .post('/api/player/skills/experience')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            skillType: 'INVALID_SKILL',
            amount: 100
          });

        expect(response.status).toBe(400);
        expect(response.body.code).toBe('VALIDATION_ERROR');
      });
    });

    describe('GET /api/player/inventory', () => {
      it('should get player inventory', async () => {
        const response = await request(app)
          .get('/api/player/inventory')
          .set('Authorization', `Bearer ${authToken}`);

        expect(response.status).toBe(200);
        expect(Array.isArray(response.body)).toBe(true);
      });
    });

    describe('POST /api/player/inventory', () => {
      it('should update player inventory', async () => {
        const response = await request(app)
          .post('/api/player/inventory')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            action: 'ADD',
            itemId: 'stone',
            quantity: 10
          });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
      });
    });
  });

  describe('World Endpoints', () => {
    describe('GET /api/world/island', () => {
      it('should get player island', async () => {
        const response = await request(app)
          .get('/api/world/island')
          .set('Authorization', `Bearer ${authToken}`);

        expect(response.status).toBe(200);
        expect(response.body.ownerId).toBe(testPlayerId);
      });
    });

    describe('POST /api/world/island/save', () => {
      it('should save island changes', async () => {
        const response = await request(app)
          .post('/api/world/island/save')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            changes: [
              {
                position: { x: 0, y: 0, z: 0 },
                blockType: 'stone'
              }
            ]
          });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.changesCount).toBe(1);
      });

      it('should reject invalid change data', async () => {
        const response = await request(app)
          .post('/api/world/island/save')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            changes: [
              {
                position: { x: 'invalid' }, // invalid position
                blockType: 'stone'
              }
            ]
          });

        expect(response.status).toBe(400);
        expect(response.body.code).toBe('VALIDATION_ERROR');
      });
    });

    describe('POST /api/world/island/expand', () => {
      it('should expand island with valid blueprint', async () => {
        const response = await request(app)
          .post('/api/world/island/expand')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            blueprintId: 'basic-expansion',
            direction: 'NORTH'
          });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
      });
    });

    describe('GET /api/world/chunk/:x/:y/:z', () => {
      it('should get chunk data', async () => {
        const response = await request(app)
          .get('/api/world/chunk/0/0/0')
          .set('Authorization', `Bearer ${authToken}`);

        expect(response.status).toBe(200);
        expect(response.body.position).toEqual({ x: 0, y: 0, z: 0 });
      });

      it('should reject invalid coordinates', async () => {
        const response = await request(app)
          .get('/api/world/chunk/invalid/0/0')
          .set('Authorization', `Bearer ${authToken}`);

        expect(response.status).toBe(400);
        expect(response.body.code).toBe('VALIDATION_ERROR');
      });
    });

    describe('GET /api/world/zones', () => {
      it('should get public zones', async () => {
        const response = await request(app)
          .get('/api/world/zones')
          .set('Authorization', `Bearer ${authToken}`);

        expect(response.status).toBe(200);
        expect(Array.isArray(response.body)).toBe(true);
      });
    });
  });

  describe('Economy Endpoints', () => {
    describe('GET /api/economy/market/listings', () => {
      it('should get market listings', async () => {
        const response = await request(app)
          .get('/api/economy/market/listings')
          .set('Authorization', `Bearer ${authToken}`);

        expect(response.status).toBe(200);
        expect(Array.isArray(response.body)).toBe(true);
      });

      it('should filter listings by search parameters', async () => {
        const response = await request(app)
          .get('/api/economy/market/listings?itemId=stone&minPrice=10&maxPrice=100')
          .set('Authorization', `Bearer ${authToken}`);

        expect(response.status).toBe(200);
        expect(Array.isArray(response.body)).toBe(true);
      });
    });

    describe('POST /api/economy/market/list', () => {
      it('should list item for sale', async () => {
        const response = await request(app)
          .post('/api/economy/market/list')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            itemId: 'stone',
            quantity: 10,
            price: 50
          });

        expect(response.status).toBe(201);
        expect(response.body.itemId).toBe('stone');
        expect(response.body.quantity).toBe(10);
        expect(response.body.price).toBe(50);
      });

      it('should reject invalid listing data', async () => {
        const response = await request(app)
          .post('/api/economy/market/list')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            itemId: 'stone',
            quantity: -5, // invalid quantity
            price: 50
          });

        expect(response.status).toBe(400);
        expect(response.body.code).toBe('VALIDATION_ERROR');
      });
    });

    describe('GET /api/economy/market/my-listings', () => {
      it('should get player listings', async () => {
        const response = await request(app)
          .get('/api/economy/market/my-listings')
          .set('Authorization', `Bearer ${authToken}`);

        expect(response.status).toBe(200);
        expect(Array.isArray(response.body)).toBe(true);
      });
    });

    describe('GET /api/economy/market/prices/:itemId', () => {
      it('should get price history for item', async () => {
        const response = await request(app)
          .get('/api/economy/market/prices/stone')
          .set('Authorization', `Bearer ${authToken}`);

        expect(response.status).toBe(200);
        expect(response.body.itemId).toBe('stone');
        expect(Array.isArray(response.body.priceHistory)).toBe(true);
      });
    });

    describe('POST /api/economy/trade/initiate', () => {
      it('should initiate trade with another player', async () => {
        // Create another test player
        const targetPlayer = await playerService.createPlayer({
          username: 'tradepartner',
          email: 'tradepartner@example.com',
          passwordHash: 'hashedpassword'
        });

        const response = await request(app)
          .post('/api/economy/trade/initiate')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            targetPlayerId: targetPlayer.id,
            offeredItems: [
              { itemId: 'stone', quantity: 10 }
            ],
            message: 'Trade offer'
          });

        expect(response.status).toBe(201);
        expect(response.body.initiatorId).toBe(testPlayerId);
        expect(response.body.targetId).toBe(targetPlayer.id);
        
        // Cleanup
        await playerService.deletePlayer(targetPlayer.id);
      });

      it('should reject invalid trade data', async () => {
        const response = await request(app)
          .post('/api/economy/trade/initiate')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            targetPlayerId: 'invalid-uuid',
            offeredItems: []
          });

        expect(response.status).toBe(400);
        expect(response.body.code).toBe('VALIDATION_ERROR');
      });
    });

    describe('GET /api/economy/trade/active', () => {
      it('should get active trades', async () => {
        const response = await request(app)
          .get('/api/economy/trade/active')
          .set('Authorization', `Bearer ${authToken}`);

        expect(response.status).toBe(200);
        expect(Array.isArray(response.body)).toBe(true);
      });
    });
  });

  describe('API Info Endpoint', () => {
    describe('GET /api', () => {
      it('should return API information', async () => {
        const response = await request(app)
          .get('/api');

        expect(response.status).toBe(200);
        expect(response.body.name).toBe('Skybound Realms API');
        expect(response.body.endpoints).toBeDefined();
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle 404 for non-existent endpoints', async () => {
      const response = await request(app)
        .get('/api/nonexistent')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(404);
    });

    it('should handle malformed JSON', async () => {
      const response = await request(app)
        .post('/api/player/inventory')
        .set('Authorization', `Bearer ${authToken}`)
        .set('Content-Type', 'application/json')
        .send('{ invalid json }');

      expect(response.status).toBe(400);
    });
  });
});