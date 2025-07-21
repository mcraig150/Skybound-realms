import {
  Dungeon,
  DungeonLayout,
  DungeonRoom,
  DungeonConnection,
  BossRoom,
  BossEncounter,
  BossPhase,
  BossMechanic,
  DungeonMobSpawn,
  LootChest,
  Trap,
  Puzzle,
  DungeonInstance,
  DungeonProgress,
  DungeonGenerationParams,
  DungeonTheme,
  RoomType,
  ConnectionType,
  ChestType,
  TrapType,
  PuzzleType,
  SpawnPatternType,
  MechanicType,
  LeaderboardCategory
} from '../models/Dungeon';
import { Vector3 } from '../shared/types';
import { ItemStack, ItemRarity } from '../models/Item';
import { MobTemplate, LootDrop, MobAbility } from '../models/Combat';
import { Utils } from '../shared/utils';

export class DungeonService {
  private dungeonTemplates: Map<string, DungeonGenerationParams> = new Map();
  private activeDungeons: Map<string, DungeonInstance> = new Map();
  private dungeonProgress: Map<string, DungeonProgress[]> = new Map();

  constructor() {
    this.initializeDungeonTemplates();
  }

  /**
   * Generate a new dungeon instance
   */
  async generateDungeon(
    partyId: string,
    playerIds: string[],
    params: DungeonGenerationParams
  ): Promise<Dungeon> {
    const dungeonId = Utils.generateId();
    const seed = Math.floor(Math.random() * 1000000);

    // Create dungeon layout
    const layout = this.generateDungeonLayout(params, seed);

    // Generate rooms
    const rooms = this.generateRooms(layout, params);

    // Generate connections between rooms
    const connections = this.generateConnections(rooms, layout);

    // Create boss room
    const bossRoom = this.generateBossRoom(params, layout);
    rooms.push(bossRoom);

    // Generate loot tables
    const lootTables = this.generateLootTables(params);

    // Populate rooms with content
    this.populateRoomsWithContent(rooms, params, lootTables);

    const dungeon: Dungeon = {
      id: dungeonId,
      name: this.generateDungeonName(params.theme, params.difficulty),
      difficulty: params.difficulty,
      maxPartySize: params.partySize,
      layout,
      rooms,
      connections,
      bossRoom: bossRoom as BossRoom,
      lootTables,
      createdAt: new Date(),
      instanceId: Utils.generateId()
    };

    // Create dungeon instance
    const instance: DungeonInstance = {
      id: dungeon.instanceId,
      dungeonId: dungeon.id,
      partyId,
      players: playerIds,
      currentRoom: this.getEntranceRoom(rooms).id,
      startTime: new Date(),
      isCompleted: false,
      score: 0,
      deaths: 0,
      roomsCleared: 0,
      bossDefeated: false,
      lootCollected: []
    };

    this.activeDungeons.set(instance.id, instance);

    // Initialize progress tracking for each player
    playerIds.forEach(playerId => {
      const progress: DungeonProgress = {
        instanceId: instance.id,
        playerId,
        roomsVisited: [instance.currentRoom],
        mobsKilled: 0,
        chestsOpened: 0,
        puzzlesSolved: 0,
        trapsTriggered: 0,
        damageDealt: 0,
        damageTaken: 0,
        healingDone: 0
      };

      if (!this.dungeonProgress.has(instance.id)) {
        this.dungeonProgress.set(instance.id, []);
      }
      this.dungeonProgress.get(instance.id)!.push(progress);
    });

    return dungeon;
  }

  /**
   * Generate dungeon layout structure
   */
  private generateDungeonLayout(params: DungeonGenerationParams, seed: number): DungeonLayout {
    const random = this.createSeededRandom(seed);

    // Scale layout based on difficulty and party size
    const baseSize = 20 + (params.difficulty * 2);
    const sizeMultiplier = 1 + (params.partySize - 1) * 0.2;

    return {
      width: Math.floor(baseSize * sizeMultiplier),
      height: Math.floor(baseSize * sizeMultiplier),
      depth: 10 + params.difficulty,
      seed,
      roomCount: Math.max(params.minRooms, Math.min(params.maxRooms, 5 + params.difficulty)),
      corridorWidth: 3,
      theme: params.theme
    };
  }

  /**
   * Generate rooms for the dungeon
   */
  private generateRooms(layout: DungeonLayout, params: DungeonGenerationParams): DungeonRoom[] {
    const rooms: DungeonRoom[] = [];
    const random = this.createSeededRandom(layout.seed);

    // Always start with entrance room
    const entranceRoom = this.createRoom(
      'entrance',
      RoomType.ENTRANCE,
      { x: 0, y: 0, z: 0 },
      { x: 8, y: 4, z: 8 },
      1
    );
    rooms.push(entranceRoom);

    // Generate main rooms
    const roomTypes = this.selectRoomTypes(params);
    for (let i = 1; i < layout.roomCount; i++) {
      const roomTypeIndex = i % roomTypes.length;
      const roomType: RoomType = roomTypes[roomTypeIndex] || RoomType.COMBAT;
      const position = this.generateRoomPosition(layout, i, random);
      const size = this.generateRoomSize(roomType, params.difficulty);
      const requiredLevel = Math.max(1, params.difficulty - 2 + Math.floor(i / 2));

      const room = this.createRoom(
        `room_${i}`,
        roomType,
        position,
        size,
        requiredLevel
      );

      rooms.push(room);
    }

    return rooms;
  }

  /**
   * Create a dungeon room
   */
  private createRoom(
    id: string,
    type: RoomType,
    position: Vector3,
    size: Vector3,
    requiredLevel: number
  ): DungeonRoom {
    return {
      id,
      type,
      position,
      size,
      connections: [],
      mobSpawns: [],
      lootChests: [],
      traps: [],
      puzzles: [],
      isCleared: false,
      requiredLevel
    };
  }

  /**
   * Generate connections between rooms
   */
  private generateConnections(rooms: DungeonRoom[], layout: DungeonLayout): DungeonConnection[] {
    const connections: DungeonConnection[] = [];
    const random = this.createSeededRandom(layout.seed + 1);

    // Create a minimum spanning tree to ensure all rooms are connected
    const connected = new Set<string>();
    const entrance = rooms.find(r => r.type === RoomType.ENTRANCE)!;
    connected.add(entrance.id);

    while (connected.size < rooms.length) {
      let bestConnection: { from: DungeonRoom; to: DungeonRoom; distance: number } | null = null;

      // Find closest unconnected room to any connected room
      for (const connectedRoom of rooms.filter(r => connected.has(r.id))) {
        for (const unconnectedRoom of rooms.filter(r => !connected.has(r.id))) {
          const distance = this.calculateRoomDistance(connectedRoom, unconnectedRoom);

          if (!bestConnection || distance < bestConnection.distance) {
            bestConnection = { from: connectedRoom, to: unconnectedRoom, distance };
          }
        }
      }

      if (bestConnection) {
        const connection = this.createConnection(
          bestConnection.from,
          bestConnection.to,
          this.selectConnectionType(bestConnection.from.type, bestConnection.to.type)
        );

        connections.push(connection);
        bestConnection.from.connections.push(bestConnection.to.id);
        bestConnection.to.connections.push(bestConnection.from.id);
        connected.add(bestConnection.to.id);
      }
    }

    // Add some additional connections for complexity
    const additionalConnections = Math.floor(rooms.length * 0.3);
    for (let i = 0; i < additionalConnections; i++) {
      const room1 = rooms[Math.floor(random() * rooms.length)];
      const room2 = rooms[Math.floor(random() * rooms.length)];

      if (room1 && room2 && room1.id !== room2.id && !room1.connections.includes(room2.id)) {
        const connection = this.createConnection(room1, room2, ConnectionType.CORRIDOR);
        connections.push(connection);
        room1.connections.push(room2.id);
        room2.connections.push(room1.id);
      }
    }

    return connections;
  }

  /**
   * Create a connection between two rooms
   */
  private createConnection(
    fromRoom: DungeonRoom,
    toRoom: DungeonRoom,
    type: ConnectionType
  ): DungeonConnection {
    return {
      id: Utils.generateId(),
      fromRoomId: fromRoom.id,
      toRoomId: toRoom.id,
      type,
      isLocked: false
    };
  }

  /**
   * Generate boss room
   */
  private generateBossRoom(params: DungeonGenerationParams, layout: DungeonLayout): BossRoom {
    const position = { x: layout.width - 15, y: 0, z: layout.height - 15 };
    const size = { x: 15, y: 8, z: 15 };

    const baseRoom = this.createRoom(
      'boss_room',
      RoomType.BOSS,
      position,
      size,
      params.difficulty
    );

    const bossEncounter = this.generateBossEncounter(params);
    const phases = this.generateBossPhases(params);
    const mechanics = this.generateBossMechanics(params);

    return {
      ...baseRoom,
      bossEncounter,
      phases,
      mechanics,
      enrageTimer: 300 + (params.difficulty * 30) // 5+ minutes based on difficulty
    };
  }

  /**
   * Generate boss encounter
   */
  private generateBossEncounter(params: DungeonGenerationParams): BossEncounter {
    const bossTemplate = this.selectBossTemplate(params);
    const minions = this.selectBossMinions(params);

    return {
      id: Utils.generateId(),
      bossTemplate,
      minions,
      spawnPattern: {
        type: SpawnPatternType.IMMEDIATE,
        count: 1,
        interval: 0
      },
      lootTable: {
        id: 'boss_loot',
        name: 'Boss Loot Table',
        drops: this.generateBossLootDrops(params),
        guaranteedDrops: this.generateGuaranteedBossDrops(params),
        rarityWeights: new Map([
          [ItemRarity.COMMON, 0.2],
          [ItemRarity.UNCOMMON, 0.25],
          [ItemRarity.RARE, 0.3],
          [ItemRarity.EPIC, 0.15],
          [ItemRarity.LEGENDARY, 0.08],
          [ItemRarity.DIVINE, 0.02]
        ]),
        levelScaling: true
      },
      uniqueDrops: {
        bossSpecificDrops: this.generateBossSpecificDrops(params),
        firstKillBonus: this.generateFirstKillBonus(params),
        rareDrops: this.generateRareDrops(params),
        setItems: this.generateSetItemDrops(params)
      }
    };
  }

  /**
   * Populate rooms with mobs, loot, traps, and puzzles
   */
  private populateRoomsWithContent(
    rooms: DungeonRoom[],
    params: DungeonGenerationParams,
    lootTables: Map<string, any>
  ): void {
    const random = this.createSeededRandom(params.difficulty);

    rooms.forEach(room => {
      if (room.type === RoomType.ENTRANCE || room.type === RoomType.BOSS) {
        return; // Skip entrance and boss rooms
      }

      // Add mobs based on room type
      this.populateRoomWithMobs(room, params, random);

      // Add loot chests
      this.populateRoomWithLoot(room, params, lootTables, random);

      // Add traps
      if (room.type === RoomType.TRAP || random() < 0.3) {
        this.populateRoomWithTraps(room, params, random);
      }

      // Add puzzles
      if (room.type === RoomType.PUZZLE || random() < 0.2) {
        this.populateRoomWithPuzzles(room, params, random);
      }
    });
  }

  /**
   * Populate room with mobs
   */
  private populateRoomWithMobs(
    room: DungeonRoom,
    params: DungeonGenerationParams,
    random: () => number
  ): void {
    const mobCount = this.calculateMobCount(room.type, params.difficulty, params.partySize);

    for (let i = 0; i < mobCount; i++) {
      const isElite = random() < 0.1; // 10% chance for elite
      const mobSpawn: DungeonMobSpawn = {
        id: Utils.generateId(),
        mobTemplateId: this.selectMobForRoom(room, params),
        position: this.generateMobPosition(room, random),
        spawnPattern: {
          type: SpawnPatternType.IMMEDIATE,
          count: 1,
          interval: 0
        },
        maxCount: 1,
        currentCount: 0,
        respawnTime: 0, // No respawn in dungeons
        isElite,
        ...(isElite && {
          eliteModifiers: {
            healthMultiplier: 1.5,
            damageMultiplier: 1.3,
            speedMultiplier: 1.2,
            specialAbilities: ['power_strike'],
            lootBonus: 2.0,
            experienceBonus: 1.5
          }
        })
      };

      room.mobSpawns.push(mobSpawn);
    }
  }

  /**
   * Populate room with loot chests
   */
  private populateRoomWithLoot(
    room: DungeonRoom,
    params: DungeonGenerationParams,
    lootTables: Map<string, any>,
    random: () => number
  ): void {
    const chestCount = this.calculateChestCount(room.type, params.difficulty);

    for (let i = 0; i < chestCount; i++) {
      const chest: LootChest = {
        id: Utils.generateId(),
        position: this.generateChestPosition(room, random),
        type: this.selectChestType(room.type, params.difficulty, random),
        lootTable: lootTables.get('standard') || this.createStandardLootTable(params),
        isOpened: false
      };

      room.lootChests.push(chest);
    }
  }

  /**
   * Calculate appropriate number of mobs for a room
   */
  private calculateMobCount(roomType: RoomType, difficulty: number, partySize: number): number {
    let baseMobCount = 1;

    switch (roomType) {
      case RoomType.COMBAT:
        baseMobCount = 2 + Math.floor(difficulty / 5);
        break;
      case RoomType.TREASURE:
        baseMobCount = 1;
        break;
      case RoomType.TRAP:
        baseMobCount = Math.floor(difficulty / 10);
        break;
      default:
        baseMobCount = 1;
    }

    // Scale with party size
    return Math.max(1, Math.floor(baseMobCount * (1 + (partySize - 1) * 0.3)));
  }

  /**
   * Select appropriate mob template for room
   */
  private selectMobForRoom(room: DungeonRoom, params: DungeonGenerationParams): string {
    // Simple mob selection based on difficulty and theme
    if (params.difficulty <= 10) {
      return 'goblin';
    } else if (params.difficulty <= 30) {
      return 'orc_warrior';
    } else {
      return 'fire_elemental';
    }
  }

  /**
   * Generate mob position within room
   */
  private generateMobPosition(room: DungeonRoom, random: () => number): Vector3 {
    return {
      x: room.position.x + random() * room.size.x,
      y: room.position.y,
      z: room.position.z + random() * room.size.z
    };
  }

  /**
   * Helper methods for dungeon generation
   */
  private createSeededRandom(seed: number): () => number {
    let currentSeed = seed;
    return () => {
      currentSeed = (currentSeed * 9301 + 49297) % 233280;
      return currentSeed / 233280;
    };
  }

  private selectRoomTypes(params: DungeonGenerationParams): RoomType[] {
    const types: RoomType[] = [RoomType.COMBAT, RoomType.COMBAT]; // Always include combat rooms

    if (params.specialRooms.includes(RoomType.TREASURE)) {
      types.push(RoomType.TREASURE);
    }
    if (params.specialRooms.includes(RoomType.PUZZLE)) {
      types.push(RoomType.PUZZLE);
    }
    if (params.specialRooms.includes(RoomType.TRAP)) {
      types.push(RoomType.TRAP);
    }

    // Fill remaining with combat rooms
    while (types.length < 6) {
      types.push(RoomType.COMBAT);
    }

    return types;
  }

  private generateRoomPosition(layout: DungeonLayout, index: number, random: () => number): Vector3 {
    // Simple grid-based positioning with some randomness
    const gridSize = Math.ceil(Math.sqrt(layout.roomCount));
    const gridX = index % gridSize;
    const gridZ = Math.floor(index / gridSize);

    const baseX = gridX * (layout.width / gridSize);
    const baseZ = gridZ * (layout.height / gridSize);
    const randomOffsetX = random() * 5 - 2.5;
    const randomOffsetZ = random() * 5 - 2.5;

    return {
      x: Math.max(0, baseX + randomOffsetX),
      y: 0,
      z: Math.max(0, baseZ + randomOffsetZ)
    };
  }

  private generateRoomSize(roomType: RoomType, difficulty: number): Vector3 {
    const baseSize = 6 + Math.floor(difficulty / 10);

    switch (roomType) {
      case RoomType.BOSS:
        return { x: baseSize * 2, y: 8, z: baseSize * 2 };
      case RoomType.TREASURE:
        return { x: baseSize * 1.5, y: 6, z: baseSize * 1.5 };
      default:
        return { x: baseSize, y: 4, z: baseSize };
    }
  }

  private calculateRoomDistance(room1: DungeonRoom, room2: DungeonRoom): number {
    const dx = room1.position.x - room2.position.x;
    const dz = room1.position.z - room2.position.z;
    return Math.sqrt(dx * dx + dz * dz);
  }

  private selectConnectionType(fromType: RoomType, toType: RoomType): ConnectionType {
    if (fromType === RoomType.BOSS || toType === RoomType.BOSS) {
      return ConnectionType.DOOR;
    }
    return ConnectionType.CORRIDOR;
  }

  private getEntranceRoom(rooms: DungeonRoom[]): DungeonRoom {
    return rooms.find(r => r.type === RoomType.ENTRANCE)!;
  }

  private generateDungeonName(theme: DungeonTheme, difficulty: number): string {
    const themeNames = {
      [DungeonTheme.ANCIENT_RUINS]: 'Ancient Ruins',
      [DungeonTheme.DARK_CAVERN]: 'Dark Cavern',
      [DungeonTheme.FIRE_TEMPLE]: 'Fire Temple',
      [DungeonTheme.ICE_FORTRESS]: 'Ice Fortress',
      [DungeonTheme.SHADOW_REALM]: 'Shadow Realm',
      [DungeonTheme.CRYSTAL_MINES]: 'Crystal Mines'
    };

    const difficultyTiers = ['Novice', 'Apprentice', 'Journeyman', 'Expert', 'Master', 'Legendary'];
    const tier = Math.min(difficultyTiers.length - 1, Math.floor(difficulty / 10));

    return `${difficultyTiers[tier]} ${themeNames[theme]}`;
  }

  /**
   * Select appropriate boss template based on theme and difficulty
   */
  private selectBossTemplate(params: DungeonGenerationParams): MobTemplate {
    const bossTemplates = this.getBossTemplatesByTheme(params.theme);
    const selectedTemplate = Utils.getRandomElement(bossTemplates);

    // Scale boss stats based on difficulty and party size
    const healthMultiplier = 1 + (params.partySize - 1) * 0.4;
    const difficultyMultiplier = Math.max(1, params.difficulty / 10);

    return {
      id: selectedTemplate.id,
      name: selectedTemplate.name,
      level: params.difficulty,
      baseStats: {
        maxHealth: Math.floor(selectedTemplate.baseHealth * difficultyMultiplier * healthMultiplier),
        maxMana: selectedTemplate.baseMana + params.difficulty * 10,
        damage: selectedTemplate.baseDamage + params.difficulty * 3,
        defense: selectedTemplate.baseDefense + params.difficulty * 2,
        critChance: Math.min(50, selectedTemplate.baseCritChance + Math.floor(params.difficulty / 5)),
        critDamage: selectedTemplate.baseCritDamage + params.difficulty,
        speed: selectedTemplate.baseSpeed,
        accuracy: Math.min(95, selectedTemplate.baseAccuracy + Math.floor(params.difficulty / 10)),
        evasion: Math.min(30, selectedTemplate.baseEvasion + Math.floor(params.difficulty / 15))
      },
      behaviorType: 'boss' as any,
      abilities: this.convertStringAbilitiesToMobAbilities(selectedTemplate.abilities),
      lootTable: [],
      experienceReward: selectedTemplate.baseExperience * difficultyMultiplier,
      spawnWeight: 1
    };
  }

  /**
   * Get boss templates for specific theme
   */
  private getBossTemplatesByTheme(theme: DungeonTheme): Array<{
    id: string;
    name: string;
    baseHealth: number;
    baseMana: number;
    baseDamage: number;
    baseDefense: number;
    baseCritChance: number;
    baseCritDamage: number;
    baseSpeed: number;
    baseAccuracy: number;
    baseEvasion: number;
    baseExperience: number;
    abilities: string[];
  }> {
    const templates = {
      [DungeonTheme.ANCIENT_RUINS]: [
        {
          id: 'ancient_guardian',
          name: 'Ancient Stone Guardian',
          baseHealth: 2000,
          baseMana: 800,
          baseDamage: 80,
          baseDefense: 40,
          baseCritChance: 10,
          baseCritDamage: 150,
          baseSpeed: 6,
          baseAccuracy: 85,
          baseEvasion: 5,
          baseExperience: 500,
          abilities: ['stone_slam', 'earthquake', 'stone_armor']
        },
        {
          id: 'lich_overlord',
          name: 'Ancient Lich Overlord',
          baseHealth: 1500,
          baseMana: 1200,
          baseDamage: 100,
          baseDefense: 25,
          baseCritChance: 20,
          baseCritDamage: 200,
          baseSpeed: 8,
          baseAccuracy: 90,
          baseEvasion: 15,
          baseExperience: 600,
          abilities: ['death_bolt', 'summon_skeletons', 'life_drain', 'bone_prison']
        }
      ],
      [DungeonTheme.FIRE_TEMPLE]: [
        {
          id: 'flame_lord',
          name: 'Infernal Flame Lord',
          baseHealth: 1800,
          baseMana: 1000,
          baseDamage: 120,
          baseDefense: 30,
          baseCritChance: 25,
          baseCritDamage: 180,
          baseSpeed: 10,
          baseAccuracy: 88,
          baseEvasion: 12,
          baseExperience: 550,
          abilities: ['fireball', 'flame_wave', 'ignite', 'meteor']
        }
      ],
      [DungeonTheme.ICE_FORTRESS]: [
        {
          id: 'frost_titan',
          name: 'Frost Titan',
          baseHealth: 2200,
          baseMana: 600,
          baseDamage: 90,
          baseDefense: 50,
          baseCritChance: 8,
          baseCritDamage: 140,
          baseSpeed: 5,
          baseAccuracy: 80,
          baseEvasion: 3,
          baseExperience: 520,
          abilities: ['ice_shard', 'blizzard', 'freeze', 'ice_armor']
        }
      ],
      [DungeonTheme.DARK_CAVERN]: [
        {
          id: 'shadow_beast',
          name: 'Primordial Shadow Beast',
          baseHealth: 1600,
          baseMana: 400,
          baseDamage: 110,
          baseDefense: 20,
          baseCritChance: 30,
          baseCritDamage: 220,
          baseSpeed: 12,
          baseAccuracy: 92,
          baseEvasion: 25,
          baseExperience: 580,
          abilities: ['shadow_strike', 'darkness', 'phase_shift', 'shadow_clone']
        }
      ],
      [DungeonTheme.CRYSTAL_MINES]: [
        {
          id: 'crystal_golem',
          name: 'Crystalline Golem',
          baseHealth: 2500,
          baseMana: 300,
          baseDamage: 70,
          baseDefense: 60,
          baseCritChance: 5,
          baseCritDamage: 130,
          baseSpeed: 4,
          baseAccuracy: 75,
          baseEvasion: 2,
          baseExperience: 480,
          abilities: ['crystal_spikes', 'reflect_damage', 'crystal_heal']
        }
      ],
      [DungeonTheme.SHADOW_REALM]: [
        {
          id: 'void_lord',
          name: 'Lord of the Void',
          baseHealth: 1400,
          baseMana: 1500,
          baseDamage: 130,
          baseDefense: 15,
          baseCritChance: 35,
          baseCritDamage: 250,
          baseSpeed: 15,
          baseAccuracy: 95,
          baseEvasion: 30,
          baseExperience: 650,
          abilities: ['void_blast', 'reality_tear', 'summon_voidlings', 'time_distortion']
        }
      ]
    };

    return templates[theme] || templates[DungeonTheme.ANCIENT_RUINS];
  }

  /**
   * Generate boss minions based on theme and difficulty
   */
  private selectBossMinions(params: DungeonGenerationParams): MobTemplate[] {
    if (params.difficulty < 15) return []; // No minions for easy bosses

    const minionCount = Math.min(3, Math.floor(params.difficulty / 15));
    const minions: MobTemplate[] = [];

    for (let i = 0; i < minionCount; i++) {
      const minion = this.generateBossMinion(params, i);
      minions.push(minion);
    }

    return minions;
  }

  /**
   * Generate a boss minion
   */
  private generateBossMinion(params: DungeonGenerationParams, index: number): MobTemplate {
    const minionLevel = Math.max(1, params.difficulty - 5);
    const baseHealth = 200 + minionLevel * 15;

    return {
      id: `boss_minion_${index}`,
      name: `${this.getMinionNameByTheme(params.theme)} ${index + 1}`,
      level: minionLevel,
      baseStats: {
        maxHealth: baseHealth,
        maxMana: 100,
        damage: 20 + minionLevel * 2,
        defense: 10 + minionLevel,
        critChance: 10,
        critDamage: 150,
        speed: 8,
        accuracy: 80,
        evasion: 10
      },
      behaviorType: 'aggressive' as any,
      abilities: this.getMinionAbilitiesByTheme(params.theme),
      lootTable: [],
      experienceReward: 50 + minionLevel * 5,
      spawnWeight: 1
    };
  }

  /**
   * Get minion name by theme
   */
  private getMinionNameByTheme(theme: DungeonTheme): string {
    const names = {
      [DungeonTheme.ANCIENT_RUINS]: 'Stone Sentinel',
      [DungeonTheme.FIRE_TEMPLE]: 'Fire Imp',
      [DungeonTheme.ICE_FORTRESS]: 'Ice Wraith',
      [DungeonTheme.DARK_CAVERN]: 'Shadow Spawn',
      [DungeonTheme.CRYSTAL_MINES]: 'Crystal Shard',
      [DungeonTheme.SHADOW_REALM]: 'Void Minion'
    };
    return names[theme] || 'Dungeon Minion';
  }

  /**
   * Get minion abilities by theme
   */
  private getMinionAbilitiesByTheme(theme: DungeonTheme): MobAbility[] {
    const abilities = {
      [DungeonTheme.ANCIENT_RUINS]: ['stone_throw'],
      [DungeonTheme.FIRE_TEMPLE]: ['fire_bolt'],
      [DungeonTheme.ICE_FORTRESS]: ['frost_bite'],
      [DungeonTheme.DARK_CAVERN]: ['shadow_dart'],
      [DungeonTheme.CRYSTAL_MINES]: ['crystal_shot'],
      [DungeonTheme.SHADOW_REALM]: ['void_touch']
    };
    const abilityIds = abilities[theme] || ['basic_attack'];
    return this.convertAbilitiesToMobAbilities(abilityIds);
  }

  /**
   * Convert string abilities to MobAbility objects
   */
  private convertStringAbilitiesToMobAbilities(abilities: string[]): MobAbility[] {
    return abilities.map(id => this.createMobAbilityFromId(id));
  }

  /**
   * Convert ability IDs to MobAbility objects
   */
  private convertAbilitiesToMobAbilities(abilityIds: string[]): MobAbility[] {
    return abilityIds.map(id => this.createMobAbilityFromId(id));
  }

  /**
   * Create MobAbility from ability ID
   */
  private createMobAbilityFromId(abilityId: string): MobAbility {
    // Default ability template
    const defaultAbility: MobAbility = {
      id: abilityId,
      name: abilityId.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
      damage: 50,
      manaCost: 20,
      cooldown: 3000,
      range: 5,
      statusEffects: []
    };

    // Customize based on ability ID
    switch (abilityId) {
      case 'stone_throw':
        return { ...defaultAbility, damage: 40, range: 8 };
      case 'fire_bolt':
        return { ...defaultAbility, damage: 60, manaCost: 25 };
      case 'frost_bite':
        return { ...defaultAbility, damage: 35, statusEffects: [] };
      case 'shadow_dart':
        return { ...defaultAbility, damage: 45, range: 10 };
      case 'crystal_shot':
        return { ...defaultAbility, damage: 55, manaCost: 30 };
      case 'void_touch':
        return { ...defaultAbility, damage: 70, range: 3 };
      default:
        return defaultAbility;
    }
  }

  /**
   * Generate boss phases based on difficulty
   */
  private generateBossPhases(params: DungeonGenerationParams): BossPhase[] {
    const phases: BossPhase[] = [];
    const phaseCount = Math.min(4, 1 + Math.floor(params.difficulty / 20));

    for (let i = 0; i < phaseCount; i++) {
      const healthThreshold = 100 - (i * (100 / phaseCount));
      const phase: BossPhase = {
        phaseNumber: i + 1,
        healthThreshold,
        abilities: this.getPhaseAbilities(params, i),
        mechanics: this.getPhaseMechanics(params, i),
        ...(i > 0 && params.difficulty > 25 && {
          addSpawns: [this.generateBossMinion(params, i)]
        })
      };
      phases.push(phase);
    }

    return phases;
  }

  /**
   * Get abilities for specific boss phase
   */
  private getPhaseAbilities(params: DungeonGenerationParams, phaseIndex: number): string[] {
    const baseAbilities = ['basic_attack'];

    if (phaseIndex >= 1) {
      baseAbilities.push('special_attack');
    }
    if (phaseIndex >= 2) {
      baseAbilities.push('area_attack');
    }
    if (phaseIndex >= 3) {
      baseAbilities.push('ultimate_attack');
    }

    return baseAbilities;
  }

  /**
   * Get mechanics for specific boss phase
   */
  private getPhaseMechanics(params: DungeonGenerationParams, phaseIndex: number): string[] {
    const mechanics: string[] = [];

    if (phaseIndex >= 1 && params.difficulty > 15) {
      mechanics.push('damage_boost');
    }
    if (phaseIndex >= 2 && params.difficulty > 25) {
      mechanics.push('summon_adds');
    }
    if (phaseIndex >= 3 && params.difficulty > 35) {
      mechanics.push('enrage');
    }

    return mechanics;
  }

  /**
   * Generate boss mechanics based on difficulty and theme
   */
  private generateBossMechanics(params: DungeonGenerationParams): BossMechanic[] {
    const mechanics: BossMechanic[] = [];

    if (params.difficulty > 10) {
      mechanics.push(this.createBossMechanic(
        'enrage_timer',
        'Enrage',
        MechanicType.DAMAGE_SHIELD,
        { type: 'time_elapsed', value: 300 + params.difficulty * 10 },
        { damage: 50, targetType: 'all_players' },
        0,
        0
      ));
    }

    if (params.difficulty > 20) {
      mechanics.push(this.createBossMechanic(
        'add_spawn',
        'Summon Reinforcements',
        MechanicType.SUMMON_ADDS,
        { type: 'health_threshold', value: 50 },
        { targetType: 'boss' },
        5000,
        30000
      ));
    }

    if (params.difficulty > 30) {
      mechanics.push(this.createBossMechanic(
        'area_damage',
        'Devastating Blast',
        MechanicType.AREA_DAMAGE,
        { type: 'health_threshold', value: 25 },
        { damage: 100 + params.difficulty * 2, areaOfEffect: 10, targetType: 'all_players' },
        3000,
        20000
      ));
    }

    return mechanics;
  }

  /**
   * Create a boss mechanic
   */
  private createBossMechanic(
    id: string,
    name: string,
    type: MechanicType,
    trigger: { type: string; value: number },
    effect: { damage?: number; healing?: number; areaOfEffect?: number; targetType: string },
    duration: number,
    cooldown: number
  ): BossMechanic {
    return {
      id,
      name,
      type,
      triggerCondition: {
        type: trigger.type as any,
        value: trigger.value
      },
      effect: {
        ...effect,
        targetType: effect.targetType as any
      },
      duration,
      cooldown
    };
  }

  private generateBossLootDrops(params: DungeonGenerationParams): LootDrop[] {
    return [
      { itemId: 'boss_token', quantity: 1, dropChance: 1.0 },
      { itemId: 'rare_gem', quantity: 1, dropChance: 0.5 }
    ];
  }

  private generateGuaranteedBossDrops(params: DungeonGenerationParams): LootDrop[] {
    return [
      { itemId: 'experience_orb', quantity: params.difficulty, dropChance: 1.0 }
    ];
  }

  private generateBossSpecificDrops(params: DungeonGenerationParams): LootDrop[] {
    const themeSpecificDrops = {
      [DungeonTheme.ANCIENT_RUINS]: [
        { itemId: 'ancient_rune', quantity: 1, dropChance: 0.3 },
        { itemId: 'stone_heart', quantity: 1, dropChance: 0.2 }
      ],
      [DungeonTheme.FIRE_TEMPLE]: [
        { itemId: 'flame_essence', quantity: 1, dropChance: 0.3 },
        { itemId: 'molten_core', quantity: 1, dropChance: 0.2 }
      ],
      [DungeonTheme.ICE_FORTRESS]: [
        { itemId: 'frost_crystal', quantity: 1, dropChance: 0.3 },
        { itemId: 'eternal_ice', quantity: 1, dropChance: 0.2 }
      ],
      [DungeonTheme.DARK_CAVERN]: [
        { itemId: 'shadow_essence', quantity: 1, dropChance: 0.3 },
        { itemId: 'void_shard', quantity: 1, dropChance: 0.2 }
      ],
      [DungeonTheme.CRYSTAL_MINES]: [
        { itemId: 'pure_crystal', quantity: 1, dropChance: 0.3 },
        { itemId: 'crystal_core', quantity: 1, dropChance: 0.2 }
      ],
      [DungeonTheme.SHADOW_REALM]: [
        { itemId: 'void_essence', quantity: 1, dropChance: 0.4 },
        { itemId: 'reality_fragment', quantity: 1, dropChance: 0.1 }
      ]
    };

    return themeSpecificDrops[params.theme] || [];
  }

  private generateFirstKillBonus(params: DungeonGenerationParams): LootDrop[] {
    return [
      { itemId: 'first_kill_achievement', quantity: 1, dropChance: 1.0 },
      { itemId: 'bonus_experience_orb', quantity: Math.floor(params.difficulty / 5), dropChance: 1.0 },
      { itemId: 'rare_material', quantity: 1, dropChance: 0.8 }
    ];
  }

  private generateRareDrops(params: DungeonGenerationParams): LootDrop[] {
    const rareDropChance = Math.max(0.01, 0.05 - (params.difficulty * 0.001)); // Harder dungeons have slightly better rare drop rates

    return [
      { itemId: 'legendary_weapon_fragment', quantity: 1, dropChance: rareDropChance },
      { itemId: 'mythic_armor_piece', quantity: 1, dropChance: rareDropChance * 0.5 },
      { itemId: 'divine_accessory', quantity: 1, dropChance: rareDropChance * 0.2 }
    ];
  }

  private generateSetItemDrops(params: DungeonGenerationParams): LootDrop[] {
    const setDropChance = Math.min(0.15, 0.05 + (params.difficulty * 0.002));

    return [
      { itemId: 'dungeon_set_helmet', quantity: 1, dropChance: setDropChance },
      { itemId: 'dungeon_set_chestplate', quantity: 1, dropChance: setDropChance },
      { itemId: 'dungeon_set_leggings', quantity: 1, dropChance: setDropChance },
      { itemId: 'dungeon_set_boots', quantity: 1, dropChance: setDropChance },
      { itemId: 'dungeon_set_weapon', quantity: 1, dropChance: setDropChance * 0.7 }
    ];
  }

  private generateLootTables(params: DungeonGenerationParams): Map<string, any> {
    const lootTables = new Map();

    // Standard loot table for regular chests
    lootTables.set('standard', this.createStandardLootTable(params));

    // Treasure room loot table
    lootTables.set('treasure', this.createTreasureLootTable(params));

    // Elite mob loot table
    lootTables.set('elite', this.createEliteLootTable(params));

    return lootTables;
  }

  private createStandardLootTable(params: DungeonGenerationParams): any {
    const goldAmount = 10 + params.difficulty * 2;

    return {
      id: 'standard',
      name: 'Standard Loot Table',
      drops: [
        { itemId: 'health_potion', quantity: 1, dropChance: 0.7 },
        { itemId: 'mana_potion', quantity: 1, dropChance: 0.7 },
        { itemId: 'gold_coin', quantity: goldAmount, dropChance: 0.9 },
        { itemId: 'dungeon_key_fragment', quantity: 1, dropChance: 0.3 },
        { itemId: 'crafting_material', quantity: Utils.randomIntBetween(1, 3), dropChance: 0.5 }
      ],
      guaranteedDrops: [],
      rarityWeights: new Map([
        [ItemRarity.COMMON, 0.5],
        [ItemRarity.UNCOMMON, 0.3],
        [ItemRarity.RARE, 0.15],
        [ItemRarity.EPIC, 0.04],
        [ItemRarity.LEGENDARY, 0.01]
      ]),
      levelScaling: true
    };
  }

  private createTreasureLootTable(params: DungeonGenerationParams): any {
    const goldAmount = 25 + params.difficulty * 5;

    return {
      id: 'treasure',
      name: 'Treasure Loot Table',
      drops: [
        { itemId: 'gold_coin', quantity: goldAmount, dropChance: 1.0 },
        { itemId: 'rare_gem', quantity: 1, dropChance: 0.6 },
        { itemId: 'enchanted_scroll', quantity: 1, dropChance: 0.4 },
        { itemId: 'magic_weapon', quantity: 1, dropChance: 0.3 },
        { itemId: 'rare_armor_piece', quantity: 1, dropChance: 0.25 }
      ],
      guaranteedDrops: [
        { itemId: 'treasure_bonus', quantity: 1, dropChance: 1.0 }
      ],
      rarityWeights: new Map([
        [ItemRarity.COMMON, 0.2],
        [ItemRarity.UNCOMMON, 0.3],
        [ItemRarity.RARE, 0.3],
        [ItemRarity.EPIC, 0.15],
        [ItemRarity.LEGENDARY, 0.05]
      ]),
      levelScaling: true
    };
  }

  private createEliteLootTable(params: DungeonGenerationParams): any {
    const goldAmount = 15 + params.difficulty * 3;

    return {
      id: 'elite',
      name: 'Elite Mob Loot Table',
      drops: [
        { itemId: 'gold_coin', quantity: goldAmount, dropChance: 1.0 },
        { itemId: 'elite_essence', quantity: 1, dropChance: 0.8 },
        { itemId: 'rare_material', quantity: 1, dropChance: 0.6 },
        { itemId: 'magic_item', quantity: 1, dropChance: 0.4 }
      ],
      guaranteedDrops: [],
      rarityWeights: new Map([
        [ItemRarity.COMMON, 0.3],
        [ItemRarity.UNCOMMON, 0.35],
        [ItemRarity.RARE, 0.25],
        [ItemRarity.EPIC, 0.08],
        [ItemRarity.LEGENDARY, 0.02]
      ]),
      levelScaling: true
    };
  }

  private calculateChestCount(roomType: RoomType, difficulty: number): number {
    switch (roomType) {
      case RoomType.TREASURE:
        return 2 + Math.floor(difficulty / 15);
      case RoomType.COMBAT:
        return Math.random() < 0.3 ? 1 : 0;
      case RoomType.PUZZLE:
        return 1; // Puzzle rooms always have a reward chest
      default:
        return Math.random() < 0.1 ? 1 : 0;
    }
  }

  private generateChestPosition(room: DungeonRoom, random: () => number): Vector3 {
    // Place chests away from the center to avoid blocking paths
    const margin = 1;
    const x = room.position.x + margin + random() * (room.size.x - 2 * margin);
    const z = room.position.z + margin + random() * (room.size.z - 2 * margin);

    return {
      x,
      y: room.position.y,
      z
    };
  }

  private selectChestType(roomType: RoomType, difficulty: number, random: () => number): ChestType {
    if (roomType === RoomType.TREASURE) {
      if (difficulty > 30 && random() < 0.1) return ChestType.LEGENDARY;
      if (difficulty > 20 && random() < 0.2) return ChestType.GOLD;
      return ChestType.IRON;
    }

    if (roomType === RoomType.PUZZLE) {
      return random() < 0.3 ? ChestType.GOLD : ChestType.IRON;
    }

    return ChestType.WOODEN;
  }

  private populateRoomWithTraps(room: DungeonRoom, params: DungeonGenerationParams, random: () => number): void {
    const trapCount = Math.max(1, Math.floor(params.difficulty / 20) + (room.type === RoomType.TRAP ? 2 : 0));

    for (let i = 0; i < trapCount; i++) {
      const trapType = this.selectTrapType(params.theme, random);
      const trap: Trap = {
        id: Utils.generateId(),
        type: trapType,
        position: this.generateTrapPosition(room, random),
        triggerArea: { x: 2, y: 2, z: 2 },
        damage: this.calculateTrapDamage(trapType, params.difficulty),
        statusEffects: this.getTrapStatusEffects(trapType),
        isArmed: true,
        detectDifficulty: Math.max(1, params.difficulty - 5),
        disarmDifficulty: params.difficulty + 5
      };

      room.traps.push(trap);
    }
  }

  private selectTrapType(theme: DungeonTheme, random: () => number): TrapType {
    const themeTraps = {
      [DungeonTheme.ANCIENT_RUINS]: [TrapType.SPIKE_TRAP, TrapType.POISON_DART],
      [DungeonTheme.FIRE_TEMPLE]: [TrapType.FIRE_TRAP, TrapType.EXPLOSIVE_TRAP],
      [DungeonTheme.ICE_FORTRESS]: [TrapType.ICE_TRAP, TrapType.SPIKE_TRAP],
      [DungeonTheme.DARK_CAVERN]: [TrapType.POISON_DART, TrapType.TELEPORT_TRAP],
      [DungeonTheme.CRYSTAL_MINES]: [TrapType.EXPLOSIVE_TRAP, TrapType.SPIKE_TRAP],
      [DungeonTheme.SHADOW_REALM]: [TrapType.TELEPORT_TRAP, TrapType.POISON_DART]
    };

    const availableTraps = themeTraps[theme] || [TrapType.SPIKE_TRAP];
    return Utils.getRandomElement(availableTraps);
  }

  private generateTrapPosition(room: DungeonRoom, random: () => number): Vector3 {
    // Place traps in strategic locations (doorways, corners, center)
    const positions = [
      // Near doorways (assuming center of each wall)
      { x: room.position.x + room.size.x / 2, y: room.position.y, z: room.position.z + 1 },
      { x: room.position.x + room.size.x / 2, y: room.position.y, z: room.position.z + room.size.z - 1 },
      { x: room.position.x + 1, y: room.position.y, z: room.position.z + room.size.z / 2 },
      { x: room.position.x + room.size.x - 1, y: room.position.y, z: room.position.z + room.size.z / 2 },
      // Center
      { x: room.position.x + room.size.x / 2, y: room.position.y, z: room.position.z + room.size.z / 2 }
    ];

    return Utils.getRandomElement(positions);
  }

  private calculateTrapDamage(trapType: TrapType, difficulty: number): number {
    const baseDamage = {
      [TrapType.SPIKE_TRAP]: 30,
      [TrapType.POISON_DART]: 20,
      [TrapType.FIRE_TRAP]: 40,
      [TrapType.ICE_TRAP]: 25,
      [TrapType.TELEPORT_TRAP]: 10,
      [TrapType.EXPLOSIVE_TRAP]: 60
    };

    return (baseDamage[trapType] || 20) + difficulty * 2;
  }

  private getTrapStatusEffects(trapType: TrapType): string[] {
    const effects = {
      [TrapType.SPIKE_TRAP]: ['bleeding'],
      [TrapType.POISON_DART]: ['poison'],
      [TrapType.FIRE_TRAP]: ['burning'],
      [TrapType.ICE_TRAP]: ['frozen', 'slowed'],
      [TrapType.TELEPORT_TRAP]: ['disoriented'],
      [TrapType.EXPLOSIVE_TRAP]: ['stunned']
    };

    return effects[trapType] || [];
  }

  private populateRoomWithPuzzles(room: DungeonRoom, params: DungeonGenerationParams, random: () => number): void {
    const puzzleType = this.selectPuzzleType(params.theme, random);
    const timeLimit = this.getPuzzleTimeLimit(puzzleType, params.difficulty);
    const puzzleBase = {
      id: Utils.generateId(),
      type: puzzleType,
      position: {
        x: room.position.x + room.size.x / 2,
        y: room.position.y,
        z: room.position.z + room.size.z / 2
      },
      difficulty: params.difficulty,
      solution: this.generatePuzzleSolution(puzzleType, params.difficulty),
      reward: this.generatePuzzleReward(params),
      attempts: 0,
      maxAttempts: this.getPuzzleMaxAttempts(puzzleType),
      isSolved: false
    };

    const puzzle: Puzzle = timeLimit !== undefined 
      ? { ...puzzleBase, timeLimit }
      : puzzleBase;

    room.puzzles.push(puzzle);
  }

  private selectPuzzleType(theme: DungeonTheme, random: () => number): PuzzleType {
    const themePuzzles = {
      [DungeonTheme.ANCIENT_RUINS]: [PuzzleType.LEVER_SEQUENCE, PuzzleType.RIDDLE],
      [DungeonTheme.FIRE_TEMPLE]: [PuzzleType.PATTERN_MATCHING, PuzzleType.PRESSURE_PLATES],
      [DungeonTheme.ICE_FORTRESS]: [PuzzleType.CRYSTAL_ALIGNMENT, PuzzleType.PATTERN_MATCHING],
      [DungeonTheme.DARK_CAVERN]: [PuzzleType.RIDDLE, PuzzleType.LEVER_SEQUENCE],
      [DungeonTheme.CRYSTAL_MINES]: [PuzzleType.CRYSTAL_ALIGNMENT, PuzzleType.PRESSURE_PLATES],
      [DungeonTheme.SHADOW_REALM]: [PuzzleType.PATTERN_MATCHING, PuzzleType.RIDDLE]
    };

    const availablePuzzles = themePuzzles[theme] || [PuzzleType.LEVER_SEQUENCE];
    return Utils.getRandomElement(availablePuzzles);
  }

  private generatePuzzleSolution(puzzleType: PuzzleType, difficulty: number): any {
    const complexityFactor = Math.max(1, Math.floor(difficulty / 10));

    switch (puzzleType) {
      case PuzzleType.LEVER_SEQUENCE:
        const sequenceLength = 3 + complexityFactor;
        const sequence = Array.from({ length: sequenceLength }, () => Utils.randomIntBetween(1, 4));
        return {
          type: puzzleType,
          data: sequence,
          hints: [
            'The ancient mechanism requires a specific sequence',
            `${sequenceLength} levers must be activated in order`,
            'Listen for the clicking sounds to confirm correct inputs'
          ]
        };

      case PuzzleType.PRESSURE_PLATES:
        const plateCount = 4 + complexityFactor;
        const pattern = Array.from({ length: plateCount }, (_, i) => i % 2 === 0);
        return {
          type: puzzleType,
          data: pattern,
          hints: [
            'Step on the correct pressure plates',
            'The pattern follows an ancient rule',
            'Some plates must remain untouched'
          ]
        };

      case PuzzleType.CRYSTAL_ALIGNMENT:
        const crystalCount = 3 + Math.floor(complexityFactor / 2);
        const alignment = Array.from({ length: crystalCount }, () => Utils.randomIntBetween(0, 3) * 90);
        return {
          type: puzzleType,
          data: alignment,
          hints: [
            'Align the crystals to channel energy',
            'Each crystal must face the correct direction',
            'The alignment follows celestial patterns'
          ]
        };

      default:
        return {
          type: puzzleType,
          data: [1, 3, 2, 4],
          hints: ['Solve the ancient mystery', 'The answer lies in the patterns']
        };
    }
  }

  private generatePuzzleReward(params: DungeonGenerationParams): ItemStack[] {
    const rewards: ItemStack[] = [];

    // Base reward
    rewards.push({ itemId: 'puzzle_token', quantity: 1 });

    // Difficulty-based rewards
    if (params.difficulty > 10) {
      rewards.push({ itemId: 'wisdom_scroll', quantity: 1 });
    }

    if (params.difficulty > 20) {
      rewards.push({ itemId: 'rare_crystal', quantity: 1 });
    }

    // Random bonus reward
    if (Math.random() < 0.3) {
      rewards.push({ itemId: 'bonus_experience', quantity: params.difficulty });
    }

    return rewards;
  }

  private getPuzzleTimeLimit(puzzleType: PuzzleType, difficulty: number): number | undefined {
    const baseTimes = {
      [PuzzleType.LEVER_SEQUENCE]: 120,
      [PuzzleType.PRESSURE_PLATES]: 90,
      [PuzzleType.PATTERN_MATCHING]: 180,
      [PuzzleType.CRYSTAL_ALIGNMENT]: 150,
      [PuzzleType.RIDDLE]: 300
    };

    const baseTime = baseTimes[puzzleType];
    if (!baseTime) return undefined;

    // Harder puzzles get more time, but not linearly
    return baseTime + Math.floor(difficulty / 5) * 10;
  }

  private getPuzzleMaxAttempts(puzzleType: PuzzleType): number {
    const maxAttempts = {
      [PuzzleType.LEVER_SEQUENCE]: 5,
      [PuzzleType.PRESSURE_PLATES]: 3,
      [PuzzleType.PATTERN_MATCHING]: 4,
      [PuzzleType.CRYSTAL_ALIGNMENT]: 3,
      [PuzzleType.RIDDLE]: 3
    };

    return maxAttempts[puzzleType] || 3;
  }

  private initializeDungeonTemplates(): void {
    // Initialize dungeon templates for different difficulty levels and themes
    const templates: Array<[string, DungeonGenerationParams]> = [
      ['beginner_ruins', {
        difficulty: 5,
        partySize: 2,
        theme: DungeonTheme.ANCIENT_RUINS,
        minRooms: 5,
        maxRooms: 8,
        bossType: 'ancient_guardian',
        specialRooms: [RoomType.TREASURE, RoomType.PUZZLE],
        lootQuality: ItemRarity.UNCOMMON
      }],
      ['intermediate_cavern', {
        difficulty: 15,
        partySize: 3,
        theme: DungeonTheme.DARK_CAVERN,
        minRooms: 8,
        maxRooms: 12,
        bossType: 'shadow_beast',
        specialRooms: [RoomType.TREASURE, RoomType.TRAP, RoomType.PUZZLE],
        lootQuality: ItemRarity.RARE
      }],
      ['advanced_temple', {
        difficulty: 25,
        partySize: 4,
        theme: DungeonTheme.FIRE_TEMPLE,
        minRooms: 10,
        maxRooms: 15,
        bossType: 'flame_lord',
        specialRooms: [RoomType.TREASURE, RoomType.TRAP, RoomType.PUZZLE, RoomType.SECRET],
        lootQuality: ItemRarity.EPIC
      }],
      ['expert_fortress', {
        difficulty: 35,
        partySize: 5,
        theme: DungeonTheme.ICE_FORTRESS,
        minRooms: 12,
        maxRooms: 18,
        bossType: 'frost_titan',
        specialRooms: [RoomType.TREASURE, RoomType.TRAP, RoomType.PUZZLE, RoomType.SECRET],
        lootQuality: ItemRarity.LEGENDARY
      }],
      ['master_realm', {
        difficulty: 50,
        partySize: 5,
        theme: DungeonTheme.SHADOW_REALM,
        minRooms: 15,
        maxRooms: 25,
        bossType: 'void_lord',
        specialRooms: [RoomType.TREASURE, RoomType.TRAP, RoomType.PUZZLE, RoomType.SECRET, RoomType.SAFE_ROOM],
        lootQuality: ItemRarity.DIVINE
      }]
    ];

    templates.forEach(([key, template]) => {
      this.dungeonTemplates.set(key, template);
    });
  }

  /**
   * Get available dungeon templates
   */
  getDungeonTemplates(): Map<string, DungeonGenerationParams> {
    return new Map(this.dungeonTemplates);
  }

  /**
   * Get active dungeon instances
   */
  getActiveDungeons(): Map<string, DungeonInstance> {
    return new Map(this.activeDungeons);
  }

  /**
   * Get dungeon progress for specific instance
   */
  getDungeonProgress(instanceId: string): DungeonProgress[] {
    return this.dungeonProgress.get(instanceId) || [];
  }


}