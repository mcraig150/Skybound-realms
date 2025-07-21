import { Vector3 } from '../shared/types';
import { ItemStack, ItemRarity } from './Item';
import { CombatEntity, MobTemplate, LootDrop } from './Combat';

// Dungeon Structure Types
export interface Dungeon {
  id: string;
  name: string;
  difficulty: number;
  maxPartySize: number;
  layout: DungeonLayout;
  rooms: DungeonRoom[];
  connections: DungeonConnection[];
  bossRoom: BossRoom;
  lootTables: Map<string, LootTable>;
  createdAt: Date;
  instanceId: string;
}

export interface DungeonLayout {
  width: number;
  height: number;
  depth: number;
  seed: number;
  roomCount: number;
  corridorWidth: number;
  theme: DungeonTheme;
}

export enum DungeonTheme {
  ANCIENT_RUINS = 'ancient_ruins',
  DARK_CAVERN = 'dark_cavern',
  FIRE_TEMPLE = 'fire_temple',
  ICE_FORTRESS = 'ice_fortress',
  SHADOW_REALM = 'shadow_realm',
  CRYSTAL_MINES = 'crystal_mines'
}

export interface DungeonRoom {
  id: string;
  type: RoomType;
  position: Vector3;
  size: Vector3;
  connections: string[]; // IDs of connected rooms
  mobSpawns: DungeonMobSpawn[];
  lootChests: LootChest[];
  traps: Trap[];
  puzzles: Puzzle[];
  isCleared: boolean;
  requiredLevel: number;
}

export enum RoomType {
  ENTRANCE = 'entrance',
  COMBAT = 'combat',
  TREASURE = 'treasure',
  PUZZLE = 'puzzle',
  TRAP = 'trap',
  BOSS = 'boss',
  SECRET = 'secret',
  CORRIDOR = 'corridor',
  SAFE_ROOM = 'safe_room'
}

export interface DungeonConnection {
  id: string;
  fromRoomId: string;
  toRoomId: string;
  type: ConnectionType;
  isLocked: boolean;
  keyRequired?: string;
  condition?: ConnectionCondition;
}

export enum ConnectionType {
  DOOR = 'door',
  CORRIDOR = 'corridor',
  TELEPORTER = 'teleporter',
  HIDDEN_PASSAGE = 'hidden_passage',
  BRIDGE = 'bridge',
  STAIRS = 'stairs'
}

export interface ConnectionCondition {
  type: 'kill_all_mobs' | 'solve_puzzle' | 'collect_key' | 'party_size';
  value?: any;
}

// Boss Room and Encounters
export interface BossRoom extends DungeonRoom {
  bossEncounter: BossEncounter;
  phases: BossPhase[];
  mechanics: BossMechanic[];
  enrageTimer: number; // seconds
}

export interface BossEncounter {
  id: string;
  bossTemplate: MobTemplate;
  minions: MobTemplate[];
  spawnPattern: SpawnPattern;
  lootTable: LootTable;
  uniqueDrops: UniqueDropTable;
}

export interface BossPhase {
  phaseNumber: number;
  healthThreshold: number; // percentage
  abilities: string[]; // ability IDs
  mechanics: string[]; // mechanic IDs
  addSpawns?: MobTemplate[];
}

export interface BossMechanic {
  id: string;
  name: string;
  type: MechanicType;
  triggerCondition: MechanicTrigger;
  effect: MechanicEffect;
  duration: number;
  cooldown: number;
}

export enum MechanicType {
  AREA_DAMAGE = 'area_damage',
  SUMMON_ADDS = 'summon_adds',
  TELEPORT_PLAYERS = 'teleport_players',
  DAMAGE_SHIELD = 'damage_shield',
  HEAL_BOSS = 'heal_boss',
  DEBUFF_PLAYERS = 'debuff_players',
  ENVIRONMENTAL_HAZARD = 'environmental_hazard'
}

export interface MechanicTrigger {
  type: 'health_threshold' | 'time_elapsed' | 'player_position' | 'ability_used';
  value: number;
  condition?: string;
}

export interface MechanicEffect {
  damage?: number;
  healing?: number;
  statusEffects?: string[];
  areaOfEffect?: number;
  targetType: 'all_players' | 'random_player' | 'closest_player' | 'boss';
}

// Mob Spawning
export interface DungeonMobSpawn {
  id: string;
  mobTemplateId: string;
  position: Vector3;
  spawnPattern: SpawnPattern;
  maxCount: number;
  currentCount: number;
  respawnTime: number;
  isElite: boolean;
  eliteModifiers?: EliteModifiers;
}

export interface SpawnPattern {
  type: SpawnPatternType;
  count: number;
  interval: number; // milliseconds
  formation?: SpawnFormation;
}

export enum SpawnPatternType {
  IMMEDIATE = 'immediate',
  WAVE = 'wave',
  CONTINUOUS = 'continuous',
  TRIGGERED = 'triggered'
}

export interface SpawnFormation {
  type: 'circle' | 'line' | 'random' | 'corners';
  spacing: number;
}

export interface EliteModifiers {
  healthMultiplier: number;
  damageMultiplier: number;
  speedMultiplier: number;
  specialAbilities: string[];
  lootBonus: number;
  experienceBonus: number;
}

// Loot and Rewards
export interface LootChest {
  id: string;
  position: Vector3;
  type: ChestType;
  lootTable: LootTable;
  isOpened: boolean;
  requiredKey?: string;
  trapId?: string;
}

export enum ChestType {
  WOODEN = 'wooden',
  IRON = 'iron',
  GOLD = 'gold',
  LEGENDARY = 'legendary',
  BOSS = 'boss',
  SECRET = 'secret'
}

export interface LootTable {
  id: string;
  name: string;
  drops: LootDrop[];
  guaranteedDrops: LootDrop[];
  rarityWeights: Map<ItemRarity, number>;
  levelScaling: boolean;
}

export interface UniqueDropTable {
  bossSpecificDrops: LootDrop[];
  firstKillBonus: LootDrop[];
  rareDrops: LootDrop[];
  setItems: LootDrop[];
}

// Traps and Puzzles
export interface Trap {
  id: string;
  type: TrapType;
  position: Vector3;
  triggerArea: Vector3;
  damage: number;
  statusEffects: string[];
  isArmed: boolean;
  detectDifficulty: number;
  disarmDifficulty: number;
}

export enum TrapType {
  SPIKE_TRAP = 'spike_trap',
  POISON_DART = 'poison_dart',
  FIRE_TRAP = 'fire_trap',
  ICE_TRAP = 'ice_trap',
  TELEPORT_TRAP = 'teleport_trap',
  EXPLOSIVE_TRAP = 'explosive_trap'
}

export interface Puzzle {
  id: string;
  type: PuzzleType;
  position: Vector3;
  difficulty: number;
  solution: PuzzleSolution;
  reward: ItemStack[];
  timeLimit?: number;
  attempts: number;
  maxAttempts: number;
  isSolved: boolean;
}

export enum PuzzleType {
  LEVER_SEQUENCE = 'lever_sequence',
  PRESSURE_PLATES = 'pressure_plates',
  RIDDLE = 'riddle',
  PATTERN_MATCHING = 'pattern_matching',
  CRYSTAL_ALIGNMENT = 'crystal_alignment'
}

export interface PuzzleSolution {
  type: PuzzleType;
  data: any; // Flexible data structure for different puzzle types
  hints: string[];
}

// Dungeon Generation Parameters
export interface DungeonGenerationParams {
  difficulty: number;
  partySize: number;
  theme: DungeonTheme;
  minRooms: number;
  maxRooms: number;
  bossType: string;
  specialRooms: RoomType[];
  lootQuality: ItemRarity;
  timeLimit?: number;
}

// Dungeon Instance Management
export interface DungeonInstance {
  id: string;
  dungeonId: string;
  partyId: string;
  players: string[]; // player IDs
  currentRoom: string;
  startTime: Date;
  completionTime?: Date;
  isCompleted: boolean;
  score: number;
  deaths: number;
  roomsCleared: number;
  bossDefeated: boolean;
  lootCollected: ItemStack[];
}

export interface DungeonProgress {
  instanceId: string;
  playerId: string;
  roomsVisited: string[];
  mobsKilled: number;
  chestsOpened: number;
  puzzlesSolved: number;
  trapsTriggered: number;
  damageDealt: number;
  damageTaken: number;
  healingDone: number;
}

// Dungeon Statistics and Leaderboards
export interface DungeonStats {
  dungeonId: string;
  totalRuns: number;
  completionRate: number;
  averageTime: number;
  bestTime: number;
  averagePartySize: number;
  popularDifficulty: number;
  mostDefeatedBoss: string;
  rareDropsFound: number;
}

export interface DungeonLeaderboard {
  dungeonId: string;
  category: LeaderboardCategory;
  entries: LeaderboardEntry[];
  lastUpdated: Date;
}

export enum LeaderboardCategory {
  FASTEST_COMPLETION = 'fastest_completion',
  HIGHEST_SCORE = 'highest_score',
  MOST_RUNS = 'most_runs',
  SOLO_COMPLETION = 'solo_completion',
  PERFECT_RUN = 'perfect_run'
}

export interface LeaderboardEntry {
  rank: number;
  playerNames: string[];
  value: number;
  timestamp: Date;
  additionalData?: any;
}