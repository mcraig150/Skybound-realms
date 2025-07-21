// Game constants and configuration values

export const GAME_CONSTANTS = {
  // World constants
  CHUNK_SIZE: 16,
  MAX_WORLD_HEIGHT: 256,
  ISLAND_START_SIZE: { x: 32, y: 32, z: 32 },
  
  // Player constants
  MAX_INVENTORY_SIZE: 36,
  MAX_SKILL_LEVEL: 100,
  MAX_PRESTIGE_LEVEL: 10,
  STARTING_COINS: 1000,
  
  // Minion constants
  MAX_MINIONS_PER_PLAYER: 25,
  MINION_PROCESSING_INTERVAL: 300000, // 5 minutes in milliseconds
  MAX_MINION_STORAGE: 64,
  
  // Combat constants
  BASE_HEALTH: 100,
  BASE_MANA: 50,
  CRIT_DAMAGE_MULTIPLIER: 1.5,
  
  // Economy constants
  MARKET_TAX_RATE: 0.05, // 5%
  MAX_LISTING_DURATION: 7 * 24 * 60 * 60 * 1000, // 7 days in milliseconds
  
  // Experience constants
  BASE_EXPERIENCE_MULTIPLIER: 1.0,
  PRESTIGE_EXPERIENCE_BONUS: 0.1, // 10% per prestige level
  
  // Resource constants
  RESOURCE_NODE_RESPAWN_TIME: 30000, // 30 seconds
  RARE_DROP_BASE_CHANCE: 0.01, // 1%
  
  // Social constants
  MAX_GUILD_MEMBERS: 50,
  MAX_FRIENDS: 100,
  MAX_CHAT_MESSAGE_LENGTH: 256
} as const;

export const SKILL_EXPERIENCE_TABLE = Array.from({ length: 101 }, (_, level) => {
  if (level === 0) return 0;
  return Math.floor(level * level * 100 + level * 50);
});

export const ITEM_RARITY_COLORS = {
  common: '#ffffff',
  uncommon: '#55ff55',
  rare: '#5555ff',
  epic: '#aa00aa',
  legendary: '#ffaa00',
  mythic: '#ff5555',
  divine: '#ffff55'
} as const;

export const DEFAULT_PLAYER_SETTINGS = {
  chatEnabled: true,
  tradeRequestsEnabled: true,
  islandVisitsEnabled: true,
  notifications: {
    minionAlerts: true,
    tradeAlerts: true,
    guildAlerts: true,
    friendAlerts: true
  }
} as const;