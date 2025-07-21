// Shared types and interfaces used across the application

export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  ssl?: boolean;
}

export interface RedisConfig {
  host: string;
  port: number;
  password?: string;
  db?: number;
}

export interface ServerConfig {
  port: number;
  host: string;
  cors: {
    origin: string[];
    credentials: boolean;
  };
}

export interface GameConfig {
  maxPlayersPerZone: number;
  minionProcessingInterval: number;
  resourceNodeRespawnTime: number;
  maxInventorySize: number;
  maxMinionStorage: number;
  experienceMultiplier: number;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: Date;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface ValidationError {
  field: string;
  message: string;
  value?: unknown;
}

export enum ErrorCode {
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  NOT_FOUND = 'NOT_FOUND',
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  DATABASE_ERROR = 'DATABASE_ERROR',
  CACHE_ERROR = 'CACHE_ERROR'
}

// Core game types
export interface Vector3 {
  x: number;
  y: number;
  z: number;
}

export interface ChunkCoordinate {
  x: number;
  y: number;
  z: number;
}

// Service interfaces
export interface ServiceResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

// Database connection result
export interface ConnectionResult {
  connected: boolean;
  error?: string;
  latency?: number;
}

// Cache operations
export interface CacheOptions {
  ttl?: number; // Time to live in seconds
  prefix?: string;
}

// Pagination options
export interface PaginationOptions {
  page: number;
  limit: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}