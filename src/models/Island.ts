import { ItemStack } from './Item';
import { Minion } from './Minion';
import { Vector3, ChunkCoordinate } from '../shared/types';

// Re-export ChunkCoordinate for convenience
export { ChunkCoordinate } from '../shared/types';

export interface Island {
  id: string;
  ownerId: string;
  chunks: WorldChunk[];
  expansionLevel: number;
  permissions: IslandPermissions;
  visitCount: number;
  createdAt: Date;
  lastModified: Date;
}

export interface WorldChunk {
  chunkId: string;
  position: ChunkCoordinate;
  voxelData: Uint8Array; // Compressed voxel data
  entities: Entity[];
  lastModified: Date;
  isLoaded: boolean;
  isDirty: boolean; // Needs to be saved
}



export interface IslandPermissions {
  isPublic: boolean;
  allowedVisitors: string[];
  coopMembers: string[];
  buildPermissions: Map<string, BuildPermission>;
}

export enum BuildPermission {
  NONE = 'none',
  VIEW = 'view',
  BUILD = 'build',
  ADMIN = 'admin'
}

export interface Entity {
  id: string;
  type: EntityType;
  position: Vector3;
  data: Record<string, unknown>; // Entity-specific data
}

export enum EntityType {
  MINION = 'minion',
  MOB = 'mob',
  NPC = 'npc',
  ITEM_DROP = 'item_drop'
}



export interface VoxelChange {
  position: Vector3;
  oldBlockId: number;
  newBlockId: number;
  timestamp: Date;
  playerId: string; // Who made the change
}

// Chunk coordinate system utilities
export class ChunkCoordinateSystem {
  static readonly CHUNK_SIZE = 16; // 16x16x16 voxels per chunk

  /**
   * Convert world position to chunk coordinate
   */
  static worldToChunk(worldPos: Vector3): ChunkCoordinate {
    return {
      x: Math.floor(worldPos.x / this.CHUNK_SIZE),
      y: Math.floor(worldPos.y / this.CHUNK_SIZE),
      z: Math.floor(worldPos.z / this.CHUNK_SIZE)
    };
  }

  /**
   * Convert chunk coordinate to world position (chunk origin)
   */
  static chunkToWorld(chunkPos: ChunkCoordinate): Vector3 {
    return {
      x: chunkPos.x * this.CHUNK_SIZE,
      y: chunkPos.y * this.CHUNK_SIZE,
      z: chunkPos.z * this.CHUNK_SIZE
    };
  }

  /**
   * Get local voxel position within a chunk (0-15 for each axis)
   */
  static getLocalVoxelPosition(worldPos: Vector3): Vector3 {
    return {
      x: ((worldPos.x % this.CHUNK_SIZE) + this.CHUNK_SIZE) % this.CHUNK_SIZE,
      y: ((worldPos.y % this.CHUNK_SIZE) + this.CHUNK_SIZE) % this.CHUNK_SIZE,
      z: ((worldPos.z % this.CHUNK_SIZE) + this.CHUNK_SIZE) % this.CHUNK_SIZE
    };
  }

  /**
   * Generate unique chunk ID from coordinates
   */
  static generateChunkId(chunkPos: ChunkCoordinate): string {
    return `chunk_${chunkPos.x}_${chunkPos.y}_${chunkPos.z}`;
  }

  /**
   * Parse chunk ID back to coordinates
   */
  static parseChunkId(chunkId: string): ChunkCoordinate | null {
    const match = chunkId.match(/^chunk_(-?\d+)_(-?\d+)_(-?\d+)$/);
    if (!match || !match[1] || !match[2] || !match[3]) return null;
    
    return {
      x: parseInt(match[1], 10),
      y: parseInt(match[2], 10),
      z: parseInt(match[3], 10)
    };
  }

  /**
   * Calculate distance between two chunk coordinates
   */
  static chunkDistance(chunk1: ChunkCoordinate, chunk2: ChunkCoordinate): number {
    const dx = chunk1.x - chunk2.x;
    const dy = chunk1.y - chunk2.y;
    const dz = chunk1.z - chunk2.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  /**
   * Get neighboring chunk coordinates
   */
  static getNeighboringChunks(chunkPos: ChunkCoordinate): ChunkCoordinate[] {
    const neighbors: ChunkCoordinate[] = [];
    
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dz = -1; dz <= 1; dz++) {
          if (dx === 0 && dy === 0 && dz === 0) continue; // Skip self
          
          neighbors.push({
            x: chunkPos.x + dx,
            y: chunkPos.y + dy,
            z: chunkPos.z + dz
          });
        }
      }
    }
    
    return neighbors;
  }
}

// Voxel data structure utilities
export class VoxelDataManager {
  static readonly VOXELS_PER_CHUNK = ChunkCoordinateSystem.CHUNK_SIZE ** 3; // 4096 voxels

  /**
   * Create empty voxel data for a chunk
   */
  static createEmptyChunkData(): Uint8Array {
    return new Uint8Array(this.VOXELS_PER_CHUNK);
  }

  /**
   * Get voxel index from local position within chunk
   */
  static getVoxelIndex(localPos: Vector3): number {
    const size = ChunkCoordinateSystem.CHUNK_SIZE;
    return localPos.x + (localPos.y * size) + (localPos.z * size * size);
  }

  /**
   * Get local position from voxel index
   */
  static getPositionFromIndex(index: number): Vector3 {
    const size = ChunkCoordinateSystem.CHUNK_SIZE;
    const z = Math.floor(index / (size * size));
    const y = Math.floor((index % (size * size)) / size);
    const x = index % size;
    
    return { x, y, z };
  }

  /**
   * Get voxel block ID at world position
   */
  static getVoxelAt(chunk: WorldChunk, worldPos: Vector3): number {
    const localPos = ChunkCoordinateSystem.getLocalVoxelPosition(worldPos);
    const index = this.getVoxelIndex(localPos);
    return chunk.voxelData[index] || 0;
  }

  /**
   * Set voxel block ID at world position
   */
  static setVoxelAt(chunk: WorldChunk, worldPos: Vector3, blockId: number): void {
    const localPos = ChunkCoordinateSystem.getLocalVoxelPosition(worldPos);
    const index = this.getVoxelIndex(localPos);
    chunk.voxelData[index] = blockId;
    chunk.isDirty = true;
    chunk.lastModified = new Date();
  }

  /**
   * Compress voxel data using run-length encoding
   */
  static compressVoxelData(voxelData: Uint8Array): Uint8Array {
    if (voxelData.length === 0) {
      return new Uint8Array(0);
    }

    const compressed: number[] = [];
    let currentValue = voxelData[0]!;
    let count = 1;

    for (let i = 1; i < voxelData.length; i++) {
      if (voxelData[i] === currentValue && count < 255) {
        count++;
      } else {
        compressed.push(currentValue, count);
        currentValue = voxelData[i]!;
        count = 1;
      }
    }
    
    // Add the last run
    compressed.push(currentValue, count);
    
    return new Uint8Array(compressed);
  }

  /**
   * Decompress run-length encoded voxel data
   */
  static decompressVoxelData(compressedData: Uint8Array): Uint8Array {
    const decompressed = new Uint8Array(this.VOXELS_PER_CHUNK);
    let outputIndex = 0;

    for (let i = 0; i < compressedData.length; i += 2) {
      const value = compressedData[i];
      const count = compressedData[i + 1];
      
      if (value !== undefined && count !== undefined) {
        for (let j = 0; j < count && outputIndex < decompressed.length; j++) {
          decompressed[outputIndex++] = value;
        }
      }
    }

    return decompressed;
  }

  /**
   * Check if chunk data is mostly empty (for optimization)
   */
  static isChunkEmpty(voxelData: Uint8Array): boolean {
    for (let i = 0; i < voxelData.length; i++) {
      if (voxelData[i] !== 0) return false;
    }
    return true;
  }

  /**
   * Count non-empty voxels in chunk
   */
  static countNonEmptyVoxels(voxelData: Uint8Array): number {
    let count = 0;
    for (let i = 0; i < voxelData.length; i++) {
      if (voxelData[i] !== 0) count++;
    }
    return count;
  }
}

export interface IslandInstance {
  playerId: string;
  worldData: WorldChunk[];
  lastModified: Date;
  expansionLevel: number;
  activeMinions: Minion[];
}

export interface IslandBlueprint {
  id: string;
  name: string;
  requiredMaterials: ItemStack[];
  expansionSize: Vector3;
  unlockRequirements: string[];
}