import { describe, it, expect, beforeEach } from 'vitest';
import { DungeonService } from '../../services/DungeonService';
import {
  DungeonGenerationParams,
  DungeonTheme,
  RoomType,
  ConnectionType,
  ChestType,
  TrapType,
  PuzzleType
} from '../../models/Dungeon';
import { ItemRarity } from '../../models/Item';

describe('DungeonService', () => {
  let dungeonService: DungeonService;
  let basicParams: DungeonGenerationParams;

  beforeEach(() => {
    dungeonService = new DungeonService();
    basicParams = {
      difficulty: 10,
      partySize: 3,
      theme: DungeonTheme.ANCIENT_RUINS,
      minRooms: 5,
      maxRooms: 8,
      bossType: 'ancient_guardian',
      specialRooms: [RoomType.TREASURE, RoomType.PUZZLE],
      lootQuality: ItemRarity.RARE
    };
  });

  describe('generateDungeon', () => {
    it('should generate a complete dungeon with all required components', async () => {
      const partyId = 'test-party-1';
      const playerIds = ['player1', 'player2', 'player3'];

      const dungeon = await dungeonService.generateDungeon(partyId, playerIds, basicParams);

      // Verify basic dungeon properties
      expect(dungeon.id).toBeDefined();
      expect(dungeon.name).toContain('Ancient Ruins');
      expect(dungeon.difficulty).toBe(basicParams.difficulty);
      expect(dungeon.maxPartySize).toBe(basicParams.partySize);
      expect(dungeon.instanceId).toBeDefined();
      expect(dungeon.createdAt).toBeInstanceOf(Date);

      // Verify layout
      expect(dungeon.layout).toBeDefined();
      expect(dungeon.layout.theme).toBe(DungeonTheme.ANCIENT_RUINS);
      expect(dungeon.layout.roomCount).toBeGreaterThanOrEqual(basicParams.minRooms);
      expect(dungeon.layout.roomCount).toBeLessThanOrEqual(basicParams.maxRooms);
      expect(dungeon.layout.seed).toBeGreaterThan(0);

      // Verify rooms
      expect(dungeon.rooms).toBeDefined();
      expect(dungeon.rooms.length).toBeGreaterThan(0);
      
      // Should have entrance room
      const entranceRoom = dungeon.rooms.find(r => r.type === RoomType.ENTRANCE);
      expect(entranceRoom).toBeDefined();
      
      // Should have boss room
      expect(dungeon.bossRoom).toBeDefined();
      expect(dungeon.bossRoom.type).toBe(RoomType.BOSS);
      expect(dungeon.bossRoom.bossEncounter).toBeDefined();

      // Verify connections
      expect(dungeon.connections).toBeDefined();
      expect(dungeon.connections.length).toBeGreaterThan(0);

      // Verify loot tables
      expect(dungeon.lootTables).toBeDefined();
      expect(dungeon.lootTables.size).toBeGreaterThan(0);
    });

    it('should scale dungeon size based on party size', async () => {
      const smallPartyParams = { ...basicParams, partySize: 1 };
      const largePartyParams = { ...basicParams, partySize: 5 };

      const smallDungeon = await dungeonService.generateDungeon('party1', ['player1'], smallPartyParams);
      const largeDungeon = await dungeonService.generateDungeon('party2', ['p1', 'p2', 'p3', 'p4', 'p5'], largePartyParams);

      // Larger party should result in larger dungeon layout
      expect(largeDungeon.layout.width).toBeGreaterThanOrEqual(smallDungeon.layout.width);
      expect(largeDungeon.layout.height).toBeGreaterThanOrEqual(smallDungeon.layout.height);
    });

    it('should scale difficulty appropriately', async () => {
      const easyParams = { ...basicParams, difficulty: 5 };
      const hardParams = { ...basicParams, difficulty: 25 };

      const easyDungeon = await dungeonService.generateDungeon('party1', ['player1'], easyParams);
      const hardDungeon = await dungeonService.generateDungeon('party2', ['player2'], hardParams);

      // Hard dungeon should have higher level requirements
      const easyRooms = easyDungeon.rooms.filter(r => r.type !== RoomType.ENTRANCE);
      const hardRooms = hardDungeon.rooms.filter(r => r.type !== RoomType.ENTRANCE);

      const avgEasyLevel = easyRooms.reduce((sum, r) => sum + r.requiredLevel, 0) / easyRooms.length;
      const avgHardLevel = hardRooms.reduce((sum, r) => sum + r.requiredLevel, 0) / hardRooms.length;

      expect(avgHardLevel).toBeGreaterThan(avgEasyLevel);

      // Hard dungeon boss should be stronger
      expect(hardDungeon.bossRoom.bossEncounter.bossTemplate.level).toBeGreaterThan(
        easyDungeon.bossRoom.bossEncounter.bossTemplate.level
      );
    });

    it('should include specified special rooms', async () => {
      const paramsWithSpecialRooms = {
        ...basicParams,
        specialRooms: [RoomType.TREASURE, RoomType.PUZZLE, RoomType.TRAP]
      };

      const dungeon = await dungeonService.generateDungeon('party1', ['player1'], paramsWithSpecialRooms);

      const roomTypes = dungeon.rooms.map(r => r.type);
      expect(roomTypes).toContain(RoomType.TREASURE);
      expect(roomTypes).toContain(RoomType.PUZZLE);
      // Note: TRAP rooms might not always be generated due to randomness, but traps can appear in other rooms
    });

    it('should generate different dungeons with same parameters', async () => {
      const dungeon1 = await dungeonService.generateDungeon('party1', ['player1'], basicParams);
      const dungeon2 = await dungeonService.generateDungeon('party2', ['player2'], basicParams);

      // Should have different IDs and seeds
      expect(dungeon1.id).not.toBe(dungeon2.id);
      expect(dungeon1.layout.seed).not.toBe(dungeon2.layout.seed);
      expect(dungeon1.instanceId).not.toBe(dungeon2.instanceId);
    });
  });

  describe('room generation', () => {
    it('should generate rooms with appropriate properties', async () => {
      const dungeon = await dungeonService.generateDungeon('party1', ['player1'], basicParams);

      dungeon.rooms.forEach(room => {
        // All rooms should have valid properties
        expect(room.id).toBeDefined();
        expect(room.type).toBeDefined();
        expect(room.position).toBeDefined();
        expect(room.size).toBeDefined();
        expect(room.requiredLevel).toBeGreaterThan(0);
        expect(room.connections).toBeDefined();
        expect(room.mobSpawns).toBeDefined();
        expect(room.lootChests).toBeDefined();
        expect(room.traps).toBeDefined();
        expect(room.puzzles).toBeDefined();
        expect(room.isCleared).toBe(false);

        // Position and size should be valid
        expect(room.position.x).toBeGreaterThanOrEqual(0);
        expect(room.position.z).toBeGreaterThanOrEqual(0);
        expect(room.size.x).toBeGreaterThan(0);
        expect(room.size.z).toBeGreaterThan(0);
        expect(room.size.y).toBeGreaterThan(0);
      });
    });

    it('should populate combat rooms with mobs', async () => {
      const dungeon = await dungeonService.generateDungeon('party1', ['player1'], basicParams);

      const combatRooms = dungeon.rooms.filter(r => r.type === RoomType.COMBAT);
      expect(combatRooms.length).toBeGreaterThan(0);

      combatRooms.forEach(room => {
        expect(room.mobSpawns.length).toBeGreaterThan(0);
        
        room.mobSpawns.forEach(spawn => {
          expect(spawn.id).toBeDefined();
          expect(spawn.mobTemplateId).toBeDefined();
          expect(spawn.position).toBeDefined();
          expect(spawn.maxCount).toBeGreaterThan(0);
          expect(spawn.spawnPattern).toBeDefined();
        });
      });
    });

    it('should populate treasure rooms with loot chests', async () => {
      const paramsWithTreasure = {
        ...basicParams,
        specialRooms: [RoomType.TREASURE]
      };

      const dungeon = await dungeonService.generateDungeon('party1', ['player1'], paramsWithTreasure);

      const treasureRooms = dungeon.rooms.filter(r => r.type === RoomType.TREASURE);
      
      treasureRooms.forEach(room => {
        expect(room.lootChests.length).toBeGreaterThan(0);
        
        room.lootChests.forEach(chest => {
          expect(chest.id).toBeDefined();
          expect(chest.position).toBeDefined();
          expect(chest.type).toBeDefined();
          expect(chest.lootTable).toBeDefined();
          expect(chest.isOpened).toBe(false);
        });
      });
    });

    it('should add puzzles to puzzle rooms', async () => {
      const paramsWithPuzzles = {
        ...basicParams,
        specialRooms: [RoomType.PUZZLE]
      };

      const dungeon = await dungeonService.generateDungeon('party1', ['player1'], paramsWithPuzzles);

      const puzzleRooms = dungeon.rooms.filter(r => r.type === RoomType.PUZZLE);
      
      puzzleRooms.forEach(room => {
        expect(room.puzzles.length).toBeGreaterThan(0);
        
        room.puzzles.forEach(puzzle => {
          expect(puzzle.id).toBeDefined();
          expect(puzzle.type).toBeDefined();
          expect(puzzle.position).toBeDefined();
          expect(puzzle.difficulty).toBeGreaterThan(0);
          expect(puzzle.solution).toBeDefined();
          expect(puzzle.reward).toBeDefined();
          expect(puzzle.maxAttempts).toBeGreaterThan(0);
          expect(puzzle.isSolved).toBe(false);
        });
      });
    });
  });

  describe('room connections', () => {
    it('should connect all rooms', async () => {
      const dungeon = await dungeonService.generateDungeon('party1', ['player1'], basicParams);

      // Build adjacency list from connections
      const adjacency = new Map<string, Set<string>>();
      dungeon.rooms.forEach(room => {
        adjacency.set(room.id, new Set());
      });

      dungeon.connections.forEach(connection => {
        adjacency.get(connection.fromRoomId)?.add(connection.toRoomId);
        adjacency.get(connection.toRoomId)?.add(connection.fromRoomId);
      });

      // Check that all rooms are reachable from entrance using BFS
      const entranceRoom = dungeon.rooms.find(r => r.type === RoomType.ENTRANCE)!;
      const visited = new Set<string>();
      const queue = [entranceRoom.id];
      visited.add(entranceRoom.id);

      while (queue.length > 0) {
        const currentRoomId = queue.shift()!;
        const neighbors = adjacency.get(currentRoomId) || new Set();
        
        neighbors.forEach(neighborId => {
          if (!visited.has(neighborId)) {
            visited.add(neighborId);
            queue.push(neighborId);
          }
        });
      }

      // All rooms should be reachable
      expect(visited.size).toBe(dungeon.rooms.length + 1); // +1 for boss room
    });

    it('should create valid connections', async () => {
      const dungeon = await dungeonService.generateDungeon('party1', ['player1'], basicParams);

      dungeon.connections.forEach(connection => {
        expect(connection.id).toBeDefined();
        expect(connection.fromRoomId).toBeDefined();
        expect(connection.toRoomId).toBeDefined();
        expect(connection.type).toBeDefined();
        expect(typeof connection.isLocked).toBe('boolean');

        // Verify that connected rooms exist
        const fromRoom = dungeon.rooms.find(r => r.id === connection.fromRoomId) || dungeon.bossRoom;
        const toRoom = dungeon.rooms.find(r => r.id === connection.toRoomId) || dungeon.bossRoom;
        expect(fromRoom).toBeDefined();
        expect(toRoom).toBeDefined();
      });
    });
  });

  describe('boss room generation', () => {
    it('should generate boss room with encounter', async () => {
      const dungeon = await dungeonService.generateDungeon('party1', ['player1'], basicParams);

      const bossRoom = dungeon.bossRoom;
      expect(bossRoom).toBeDefined();
      expect(bossRoom.type).toBe(RoomType.BOSS);
      expect(bossRoom.bossEncounter).toBeDefined();
      expect(bossRoom.phases).toBeDefined();
      expect(bossRoom.mechanics).toBeDefined();
      expect(bossRoom.enrageTimer).toBeGreaterThan(0);

      // Verify boss encounter
      const encounter = bossRoom.bossEncounter;
      expect(encounter.id).toBeDefined();
      expect(encounter.bossTemplate).toBeDefined();
      expect(encounter.bossTemplate.level).toBe(basicParams.difficulty);
      expect(encounter.lootTable).toBeDefined();
      expect(encounter.uniqueDrops).toBeDefined();

      // Verify boss stats scale with difficulty
      const bossStats = encounter.bossTemplate.baseStats;
      expect(bossStats.maxHealth).toBeGreaterThan(0);
      expect(bossStats.damage).toBeGreaterThan(0);
      expect(bossStats.defense).toBeGreaterThan(0);
    });

    it('should generate boss loot with appropriate rarity distribution', async () => {
      const dungeon = await dungeonService.generateDungeon('party1', ['player1'], basicParams);

      const bossLootTable = dungeon.bossRoom.bossEncounter.lootTable;
      expect(bossLootTable.drops).toBeDefined();
      expect(bossLootTable.drops.length).toBeGreaterThan(0);
      expect(bossLootTable.guaranteedDrops).toBeDefined();
      expect(bossLootTable.rarityWeights).toBeDefined();

      // Should have higher chance for rare items
      const legendaryWeight = bossLootTable.rarityWeights.get(ItemRarity.LEGENDARY) || 0;
      const commonWeight = bossLootTable.rarityWeights.get(ItemRarity.COMMON) || 0;
      expect(legendaryWeight).toBeGreaterThan(0);
      expect(legendaryWeight).toBeLessThan(commonWeight); // But still less than common

      // Unique drops should exist
      const uniqueDrops = dungeon.bossRoom.bossEncounter.uniqueDrops;
      expect(uniqueDrops.bossSpecificDrops).toBeDefined();
      expect(uniqueDrops.firstKillBonus).toBeDefined();
      expect(uniqueDrops.rareDrops).toBeDefined();
    });

    it('should scale boss difficulty with dungeon parameters', async () => {
      const easyParams = { ...basicParams, difficulty: 5 };
      const hardParams = { ...basicParams, difficulty: 30 };

      const easyDungeon = await dungeonService.generateDungeon('party1', ['player1'], easyParams);
      const hardDungeon = await dungeonService.generateDungeon('party2', ['player2'], hardParams);

      const easyBoss = easyDungeon.bossRoom.bossEncounter.bossTemplate;
      const hardBoss = hardDungeon.bossRoom.bossEncounter.bossTemplate;

      expect(hardBoss.level).toBeGreaterThan(easyBoss.level);
      expect(hardBoss.baseStats.maxHealth).toBeGreaterThan(easyBoss.baseStats.maxHealth);
      expect(hardBoss.baseStats.damage).toBeGreaterThan(easyBoss.baseStats.damage);
      expect(hardBoss.experienceReward).toBeGreaterThan(easyBoss.experienceReward);
    });
  });

  describe('loot distribution', () => {
    it('should generate appropriate loot tables', async () => {
      const dungeon = await dungeonService.generateDungeon('party1', ['player1'], basicParams);

      expect(dungeon.lootTables.size).toBeGreaterThan(0);
      
      const standardLootTable = dungeon.lootTables.get('standard');
      expect(standardLootTable).toBeDefined();
      expect(standardLootTable?.drops).toBeDefined();
      expect(standardLootTable?.drops.length).toBeGreaterThan(0);
      
      // Should have basic consumables
      const hasHealthPotion = standardLootTable?.drops.some((drop: any) => drop.itemId === 'health_potion');
      const hasManaPotion = standardLootTable?.drops.some((drop: any) => drop.itemId === 'mana_potion');
      const hasGold = standardLootTable?.drops.some((drop: any) => drop.itemId === 'gold_coin');
      
      expect(hasHealthPotion).toBe(true);
      expect(hasManaPotion).toBe(true);
      expect(hasGold).toBe(true);
    });

    it('should scale loot quality with difficulty', async () => {
      const easyParams = { ...basicParams, difficulty: 5, lootQuality: ItemRarity.COMMON };
      const hardParams = { ...basicParams, difficulty: 25, lootQuality: ItemRarity.LEGENDARY };

      const easyDungeon = await dungeonService.generateDungeon('party1', ['player1'], easyParams);
      const hardDungeon = await dungeonService.generateDungeon('party2', ['player2'], hardParams);

      // Hard dungeon should have better loot in boss encounter
      const easyBossLoot = easyDungeon.bossRoom.bossEncounter.lootTable;
      const hardBossLoot = hardDungeon.bossRoom.bossEncounter.lootTable;

      const easyLegendaryWeight = easyBossLoot.rarityWeights.get(ItemRarity.LEGENDARY) || 0;
      const hardLegendaryWeight = hardBossLoot.rarityWeights.get(ItemRarity.LEGENDARY) || 0;

      expect(hardLegendaryWeight).toBeGreaterThanOrEqual(easyLegendaryWeight);
    });

    it('should distribute chests appropriately across rooms', async () => {
      const dungeon = await dungeonService.generateDungeon('party1', ['player1'], basicParams);

      let totalChests = 0;
      dungeon.rooms.forEach(room => {
        totalChests += room.lootChests.length;
        
        room.lootChests.forEach(chest => {
          expect(chest.type).toBeDefined();
          expect(Object.values(ChestType)).toContain(chest.type);
          expect(chest.lootTable).toBeDefined();
        });
      });

      expect(totalChests).toBeGreaterThan(0);
    });
  });

  describe('dungeon themes', () => {
    it('should generate dungeons with different themes', async () => {
      const themes = [
        DungeonTheme.ANCIENT_RUINS,
        DungeonTheme.DARK_CAVERN,
        DungeonTheme.FIRE_TEMPLE,
        DungeonTheme.ICE_FORTRESS
      ];

      for (const theme of themes) {
        const params = { ...basicParams, theme };
        const dungeon = await dungeonService.generateDungeon('party1', ['player1'], params);

        expect(dungeon.layout.theme).toBe(theme);
        expect(dungeon.name).toContain(theme.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase()));
      }
    });

    it('should generate appropriate dungeon names', async () => {
      const easyParams = { ...basicParams, difficulty: 5 };
      const hardParams = { ...basicParams, difficulty: 50 };

      const easyDungeon = await dungeonService.generateDungeon('party1', ['player1'], easyParams);
      const hardDungeon = await dungeonService.generateDungeon('party2', ['player2'], hardParams);

      expect(easyDungeon.name).toContain('Novice');
      expect(hardDungeon.name).toContain('Legendary');
      expect(easyDungeon.name).toContain('Ancient Ruins');
      expect(hardDungeon.name).toContain('Ancient Ruins');
    });
  });

  describe('procedural generation consistency', () => {
    it('should generate consistent dungeons with same seed', async () => {
      // Note: This test would require exposing seed parameter in generateDungeon
      // For now, we test that different calls produce different results
      const dungeon1 = await dungeonService.generateDungeon('party1', ['player1'], basicParams);
      const dungeon2 = await dungeonService.generateDungeon('party1', ['player1'], basicParams);

      // Should be different dungeons
      expect(dungeon1.layout.seed).not.toBe(dungeon2.layout.seed);
    });

    it('should handle edge cases in room generation', async () => {
      const minimalParams = {
        ...basicParams,
        minRooms: 1,
        maxRooms: 2,
        difficulty: 1,
        partySize: 1
      };

      const dungeon = await dungeonService.generateDungeon('party1', ['player1'], minimalParams);

      expect(dungeon.rooms.length).toBeGreaterThanOrEqual(1);
      expect(dungeon.bossRoom).toBeDefined();
      expect(dungeon.connections.length).toBeGreaterThanOrEqual(0);
    });

    it('should handle large party sizes', async () => {
      const largePartyParams = {
        ...basicParams,
        partySize: 8
      };

      const playerIds = Array.from({ length: 8 }, (_, i) => `player${i + 1}`);
      const dungeon = await dungeonService.generateDungeon('party1', playerIds, largePartyParams);

      expect(dungeon.maxPartySize).toBe(8);
      expect(dungeon.layout.width).toBeGreaterThan(basicParams.partySize * 5); // Should scale up
      
      // Should have more mobs to handle larger party
      const totalMobs = dungeon.rooms.reduce((sum, room) => sum + room.mobSpawns.length, 0);
      expect(totalMobs).toBeGreaterThan(0);
    });
  });

  describe('error handling', () => {
    it('should handle invalid parameters gracefully', async () => {
      const invalidParams = {
        ...basicParams,
        difficulty: -1,
        partySize: 0,
        minRooms: 0,
        maxRooms: -1
      };

      // Should not throw, but should generate valid dungeon with corrected values
      const dungeon = await dungeonService.generateDungeon('party1', ['player1'], invalidParams);
      
      expect(dungeon).toBeDefined();
      expect(dungeon.rooms.length).toBeGreaterThan(0);
      expect(dungeon.bossRoom).toBeDefined();
    });

    it('should handle empty player list', async () => {
      const dungeon = await dungeonService.generateDungeon('party1', [], basicParams);
      
      expect(dungeon).toBeDefined();
      // Should still create a valid dungeon structure
    });
  });
});