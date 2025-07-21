import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config();

// Load test environment if in test mode
if (process.env.NODE_ENV === 'test') {
  dotenv.config({ path: path.resolve(process.cwd(), '.env.test') });
}

interface DatabaseConfig {
  host: string;
  port: number;
  name: string;
  user: string;
  password: string;
  ssl: boolean;
}

interface RedisConfig {
  host: string;
  port: number;
  password?: string | undefined;
  db: number;
}

interface ServerConfig {
  port: number;
  host: string;
  nodeEnv: string;
  corsOrigin: string[];
}

interface JWTConfig {
  secret: string;
  expiresIn: string;
}

interface GameConfig {
  maxPlayersPerZone: number;
  minionProcessingInterval: number;
  resourceNodeRespawnTime: number;
  maxInventorySize: number;
  maxMinionStorage: number;
  experienceMultiplier: number;
}

interface LogConfig {
  level: string;
  file?: string | undefined;
}

interface Config {
  server: ServerConfig;
  database: DatabaseConfig;
  redis: RedisConfig;
  jwt: JWTConfig;
  game: GameConfig;
  logging: LogConfig;
}

function getEnvVar(key: string, defaultValue?: string): string {
  const value = process.env[key];
  if (value === undefined) {
    if (defaultValue !== undefined) {
      return defaultValue;
    }
    throw new Error(`Environment variable ${key} is required but not set`);
  }
  return value;
}

function getEnvNumber(key: string, defaultValue?: number): number {
  const value = process.env[key];
  if (value === undefined) {
    if (defaultValue !== undefined) {
      return defaultValue;
    }
    throw new Error(`Environment variable ${key} is required but not set`);
  }
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) {
    throw new Error(`Environment variable ${key} must be a valid number`);
  }
  return parsed;
}

function getEnvBoolean(key: string, defaultValue?: boolean): boolean {
  const value = process.env[key];
  if (value === undefined) {
    if (defaultValue !== undefined) {
      return defaultValue;
    }
    throw new Error(`Environment variable ${key} is required but not set`);
  }
  return value.toLowerCase() === 'true';
}

export const config: Config = {
  server: {
    port: getEnvNumber('PORT', 3001),
    host: getEnvVar('HOST', 'localhost'),
    nodeEnv: getEnvVar('NODE_ENV', 'development'),
    corsOrigin: getEnvVar('CORS_ORIGIN', 'http://localhost:3000').split(','),
  },
  database: {
    host: getEnvVar('DB_HOST', 'localhost'),
    port: getEnvNumber('DB_PORT', 5432),
    name: getEnvVar('DB_NAME'),
    user: getEnvVar('DB_USER'),
    password: getEnvVar('DB_PASSWORD'),
    ssl: getEnvBoolean('DB_SSL', false),
  },
  redis: {
    host: getEnvVar('REDIS_HOST', 'localhost'),
    port: getEnvNumber('REDIS_PORT', 6379),
    password: process.env.REDIS_PASSWORD || undefined,
    db: getEnvNumber('REDIS_DB', 0),
  },
  jwt: {
    secret: getEnvVar('JWT_SECRET'),
    expiresIn: getEnvVar('JWT_EXPIRES_IN', '24h'),
  },
  game: {
    maxPlayersPerZone: getEnvNumber('MAX_PLAYERS_PER_ZONE', 50),
    minionProcessingInterval: getEnvNumber('MINION_PROCESSING_INTERVAL', 300000),
    resourceNodeRespawnTime: getEnvNumber('RESOURCE_NODE_RESPAWN_TIME', 1800000),
    maxInventorySize: getEnvNumber('MAX_INVENTORY_SIZE', 36),
    maxMinionStorage: getEnvNumber('MAX_MINION_STORAGE', 64),
    experienceMultiplier: parseFloat(getEnvVar('EXPERIENCE_MULTIPLIER', '1.0')),
  },
  logging: {
    level: getEnvVar('LOG_LEVEL', 'info'),
    file: process.env.LOG_FILE,
  },
};

// Validate configuration
export function validateConfig(): void {
  const requiredVars = [
    'DB_NAME',
    'DB_USER', 
    'DB_PASSWORD',
    'JWT_SECRET'
  ];

  const missing = requiredVars.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  // Validate JWT secret strength in production
  if (config.server.nodeEnv === 'production' && config.jwt.secret.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters long in production');
  }
}

// Auto-validate on import
validateConfig();