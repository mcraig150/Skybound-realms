import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PlayerRepository } from '../../repositories/PlayerRepository';
import { Player, PlayerFactory, SkillType } from '../../models/Player';
import { database } from '../../shared/database';

// Mock the database
vi.mock('../../shared/database', () => ({
  database: {
    query: vi.fn(),
    transaction: vi.fn()
  }
}));

describe('PlayerRepository', () => {
  let playerRepository: PlayerRepository;
  let mockPlayer: Player;

  beforeEach(() => {
    playerRepository = new PlayerRepository();
    mockPlayer = PlayerFactory.createNewPlayer('testuser');
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('findById', () => {
    it('should return a player when found', async () => {
      const mockRows = [
        {
          id: 'player_123',
          username: 'testuser',
          island_id: 'island_123',
          guild_id: null,
          friends: '[]',
          settings: '{"chatEnabled":true,"tradeRequestsEnabled":true,"islandVisitsEnabled":true,"notifications":{"minionAlerts":true,"tradeAlerts":true,"guildAlerts":true,"friendAlerts":true}}',
          currency: '{"coins":1000,"dungeonTokens":0,"eventCurrency":0,"guildPoints":0}',
          equipment: '{}',
          last_login: '2023-01-01T00:00:00.000Z',
          skill_type: 'mining',
          experience: 100,
          level: 2,
          prestige: 0,
          unlocked_perks: '[]',
          item_id: 'stone',
          quantity: 64,
          item_metadata: null,
          slot_index: 0
        }
      ];

      (database.query as any).mockResolvedValue(mockRows);

      const result = await playerRepository.findById('player_123');

      expect(result).toBeDefined();
      expect(result?.id).toBe('player_123');
      expect(result?.username).toBe('testuser');
      expect(result?.skills.has(SkillType.MINING)).toBe(true);
      expect(result?.inventory).toHaveLength(1);
      expect(result?.inventory[0]?.itemId).toBe('stone');
    });

    it('should return null when player not found', async () => {
      (database.query as any).mockResolvedValue([]);

      const result = await playerRepository.findById('nonexistent');

      expect(result).toBeNull();
    });

    it('should handle database errors', async () => {
      (database.query as any).mockRejectedValue(new Error('Database error'));

      await expect(playerRepository.findById('player_123')).rejects.toThrow('Database error');
    });
  });

  describe('findByUsername', () => {
    it('should return a player when found by username', async () => {
      const mockRows = [
        {
          id: 'player_123',
          username: 'testuser',
          island_id: 'island_123',
          guild_id: null,
          friends: '[]',
          settings: '{"chatEnabled":true,"tradeRequestsEnabled":true,"islandVisitsEnabled":true,"notifications":{"minionAlerts":true,"tradeAlerts":true,"guildAlerts":true,"friendAlerts":true}}',
          currency: '{"coins":1000,"dungeonTokens":0,"eventCurrency":0,"guildPoints":0}',
          equipment: '{}',
          last_login: '2023-01-01T00:00:00.000Z',
          skill_type: null,
          experience: null,
          level: null,
          prestige: null,
          unlocked_perks: null,
          item_id: null,
          quantity: null,
          item_metadata: null,
          slot_index: null
        }
      ];

      (database.query as any).mockResolvedValue(mockRows);

      const result = await playerRepository.findByUsername('testuser');

      expect(result).toBeDefined();
      expect(result?.username).toBe('testuser');
    });

    it('should return null when username not found', async () => {
      (database.query as any).mockResolvedValue([]);

      const result = await playerRepository.findByUsername('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('create', () => {
    it('should create a new player successfully', async () => {
      const mockClient = {
        query: vi.fn()
      };

      // Mock transaction callback
      (database.transaction as any).mockImplementation(async (callback: any) => {
        return callback(mockClient);
      });

      // Mock insert queries
      mockClient.query
        .mockResolvedValueOnce({ rows: [{ id: 'player_123' }] }) // Player insert
        .mockResolvedValue({ rows: [] }); // Skills and inventory inserts

      // Mock findById for return value
      const mockFindById = vi.spyOn(playerRepository, 'findById').mockResolvedValue(mockPlayer);

      const playerData = { ...mockPlayer };
      delete (playerData as any).id; // Remove id for create operation

      const result = await playerRepository.create(playerData);

      expect(result).toBeDefined();
      expect(mockClient.query).toHaveBeenCalled();
      expect(mockFindById).toHaveBeenCalledWith('player_123');
    });

    it('should handle transaction errors', async () => {
      (database.transaction as any).mockRejectedValue(new Error('Transaction failed'));

      const playerData = { ...mockPlayer };
      delete (playerData as any).id;

      await expect(playerRepository.create(playerData)).rejects.toThrow('Transaction failed');
    });
  });

  describe('update', () => {
    it('should update player successfully', async () => {
      const mockClient = {
        query: vi.fn().mockResolvedValue({ rows: [] })
      };

      (database.transaction as any).mockImplementation(async (callback: any) => {
        return callback(mockClient);
      });

      const mockFindById = vi.spyOn(playerRepository, 'findById').mockResolvedValue(mockPlayer);

      const updates = { username: 'newusername' };
      const result = await playerRepository.update('player_123', updates);

      expect(result).toBeDefined();
      expect(mockFindById).toHaveBeenCalledWith('player_123');
    });

    it('should handle update with skills and inventory', async () => {
      const mockClient = {
        query: vi.fn().mockResolvedValue({ rows: [] })
      };

      (database.transaction as any).mockImplementation(async (callback: any) => {
        return callback(mockClient);
      });

      const mockFindById = vi.spyOn(playerRepository, 'findById').mockResolvedValue(mockPlayer);

      const updates = {
        skills: new Map([[SkillType.MINING, { experience: 200, level: 3, prestige: 0, unlockedPerks: [] }]]),
        inventory: [{ itemId: 'diamond', quantity: 1 }]
      };

      const result = await playerRepository.update('player_123', updates);

      expect(result).toBeDefined();
      expect(mockClient.query).toHaveBeenCalledWith('DELETE FROM player_skills WHERE player_id = $1', ['player_123']);
      expect(mockClient.query).toHaveBeenCalledWith('DELETE FROM player_inventory WHERE player_id = $1', ['player_123']);
    });
  });

  describe('delete', () => {
    it('should delete player successfully', async () => {
      const mockClient = {
        query: vi.fn()
          .mockResolvedValueOnce({ rows: [] }) // Delete skills
          .mockResolvedValueOnce({ rows: [] }) // Delete inventory
          .mockResolvedValueOnce({ rows: [] }) // Delete minions
          .mockResolvedValueOnce({ rowCount: 1 }) // Delete player
      };

      (database.transaction as any).mockImplementation(async (callback: any) => {
        return callback(mockClient);
      });

      const result = await playerRepository.delete('player_123');

      expect(result).toBe(true);
      expect(mockClient.query).toHaveBeenCalledTimes(4);
    });

    it('should return false when player not found', async () => {
      const mockClient = {
        query: vi.fn()
          .mockResolvedValueOnce({ rows: [] }) // Delete skills
          .mockResolvedValueOnce({ rows: [] }) // Delete inventory
          .mockResolvedValueOnce({ rows: [] }) // Delete minions
          .mockResolvedValueOnce({ rowCount: 0 }) // Delete player (not found)
      };

      (database.transaction as any).mockImplementation(async (callback: any) => {
        return callback(mockClient);
      });

      const result = await playerRepository.delete('nonexistent');

      expect(result).toBe(false);
    });
  });

  describe('search', () => {
    it('should search players by username', async () => {
      const mockRows = [
        {
          id: 'player_123',
          username: 'testuser',
          island_id: 'island_123',
          guild_id: null,
          friends: '[]',
          settings: '{}',
          currency: '{}',
          equipment: '{}',
          last_login: '2023-01-01T00:00:00.000Z',
          skill_type: null,
          experience: null,
          level: null,
          prestige: null,
          unlocked_perks: null,
          item_id: null,
          quantity: null,
          item_metadata: null,
          slot_index: null
        }
      ];

      (database.query as any).mockResolvedValue(mockRows);

      const result = await playerRepository.search({ username: 'test', limit: 10 });

      expect(result).toHaveLength(1);
      expect(result[0]?.username).toBe('testuser');
    });

    it('should search players by guild', async () => {
      (database.query as any).mockResolvedValue([]);

      const result = await playerRepository.search({ guildId: 'guild_123' });

      expect(result).toHaveLength(0);
      expect(database.query).toHaveBeenCalledWith(
        expect.stringContaining('guild_id = $1'),
        expect.arrayContaining(['guild_123'])
      );
    });
  });

  describe('updateLastLogin', () => {
    it('should update last login timestamp', async () => {
      (database.query as any).mockResolvedValue([]);

      await playerRepository.updateLastLogin('player_123');

      expect(database.query).toHaveBeenCalledWith(
        'UPDATE players SET last_login = $1, updated_at = $2 WHERE id = $3',
        expect.arrayContaining([expect.any(Date), expect.any(Date), 'player_123'])
      );
    });
  });

  describe('getPlayersByGuild', () => {
    it('should get players by guild ID', async () => {
      const mockSearch = vi.spyOn(playerRepository, 'search').mockResolvedValue([mockPlayer]);

      const result = await playerRepository.getPlayersByGuild('guild_123');

      expect(result).toHaveLength(1);
      expect(mockSearch).toHaveBeenCalledWith({ guildId: 'guild_123' });
    });
  });

  describe('getFriends', () => {
    it('should get player friends', async () => {
      const playerWithFriends = { ...mockPlayer, friends: ['friend_1', 'friend_2'] };
      const mockFindById = vi.spyOn(playerRepository, 'findById').mockResolvedValue(playerWithFriends);

      const mockRows = [
        {
          id: 'friend_1',
          username: 'friend1',
          island_id: 'island_friend1',
          guild_id: null,
          friends: '[]',
          settings: '{}',
          currency: '{}',
          equipment: '{}',
          last_login: '2023-01-01T00:00:00.000Z',
          skill_type: null,
          experience: null,
          level: null,
          prestige: null,
          unlocked_perks: null,
          item_id: null,
          quantity: null,
          item_metadata: null,
          slot_index: null
        }
      ];

      (database.query as any).mockResolvedValue(mockRows);

      const result = await playerRepository.getFriends('player_123');

      expect(result).toHaveLength(1);
      expect(result[0]?.username).toBe('friend1');
    });

    it('should return empty array when player has no friends', async () => {
      const playerWithoutFriends = { ...mockPlayer, friends: [] };
      const mockFindById = vi.spyOn(playerRepository, 'findById').mockResolvedValue(playerWithoutFriends);

      const result = await playerRepository.getFriends('player_123');

      expect(result).toHaveLength(0);
    });

    it('should return empty array when player not found', async () => {
      const mockFindById = vi.spyOn(playerRepository, 'findById').mockResolvedValue(null);

      const result = await playerRepository.getFriends('nonexistent');

      expect(result).toHaveLength(0);
    });
  });
});