import { 
  Island, 
  WorldChunk, 
  VoxelChange, 
  IslandInstance, 
  IslandBlueprint,
  ChunkCoordinateSystem,
  VoxelDataManager,
  IslandPermissions
} from '../models/Island';
import { Minion } from '../models/Minion';
import { Vector3, ChunkCoordinate, ServiceResult } from '../shared/types';
import { GAME_CONSTANTS } from '../shared/constants';

export interface WorldRepository {
  findById(id: string): Promise<Island | null>;
  findByOwnerId(ownerId: string): Promise<Island | null>;
  create(islandData: Omit<Island, 'id'>): Promise<Island>;
  update(id: string, updates: Partial<Island>): Promise<Island | null>;
  delete(id: string): Promise<boolean>;
  loadChunks(islandId: string, options?: any): Promise<WorldChunk[]>;
  saveChunk(islandId: string, chunk: WorldChunk): Promise<void>;
  saveChunks(islandId: string, chunks: WorldChunk[]): Promise<void>;
  applyVoxelChanges(islandId: string, changes: VoxelChange[]): Promise<void>;
  getDirtyChunks(islandId: string): Promise<WorldChunk[]>;
  markChunksClean(islandId: string, chunkIds: string[]): Promise<void>;
  incrementVisitCount(islandId: string): Promise<void>;
  getPublicIslands(limit?: number, offset?: number): Promise<Island[]>;
}

export interface MinionRepository {
  findByIslandId(islandId: string): Promise<Minion[]>;
  findActiveMinions(islandId: string): Promise<Minion[]>;
}

export class WorldService {
  constructor(
    private worldRepository?: WorldRepository,
    private minionRepository?: MinionRepository
  ) {
    // For now, we'll create mock repositories if none provided
    if (!this.worldRepository) {
      this.worldRepository = new MockWorldRepository();
    }
    if (!this.minionRepository) {
      this.minionRepository = new MockMinionRepository();
    }
  }

  /**
   * Load a player's island with all chunks and active minions
   */
  async loadPlayerIsland(playerId: string): Promise<IslandInstance | null> {
    try {
      const island = await this.worldRepository!.findByOwnerId(playerId);
      if (!island) {
        return null;
      }

      // Load active minions
      const activeMinions = await this.minionRepository!.findActiveMinions(island.id);

      return {
        playerId,
        worldData: island.chunks,
        lastModified: island.lastModified,
        expansionLevel: island.expansionLevel,
        activeMinions
      };
    } catch (error) {
      // Log error in production, for now return null
      console.error('Error loading player island:', error);
      return null;
    }
  }

  /**
   * Create a new island for a player
   */
  async createPlayerIsland(playerId: string): Promise<Island> {
    const now = new Date();
    
    // Create initial chunks for the starting island
    const initialChunks = this.generateInitialChunks();
    
    const islandData: Omit<Island, 'id'> = {
      ownerId: playerId,
      chunks: initialChunks,
      expansionLevel: 1,
      permissions: {
        isPublic: false,
        allowedVisitors: [],
        coopMembers: [],
        buildPermissions: new Map()
      },
      visitCount: 0,
      createdAt: now,
      lastModified: now
    };

    return await this.worldRepository!.create(islandData);
  }

  /**
   * Save island changes (voxel modifications)
   */
  async saveIslandChanges(playerId: string, changes: VoxelChange[]): Promise<ServiceResult<void>> {
    try {
      const island = await this.worldRepository!.findByOwnerId(playerId);
      if (!island) {
        return { success: false, error: 'Island not found' };
      }

      // Validate changes
      const validationResult = this.validateVoxelChanges(island, changes);
      if (!validationResult.success) {
        return validationResult;
      }

      // Apply changes to chunks in memory
      this.applyChangesToChunks(island.chunks, changes);

      // Save changes to database
      await this.worldRepository!.applyVoxelChanges(island.id, changes);

      // Update island's last modified time
      await this.worldRepository!.update(island.id, { lastModified: new Date() });

      return { success: true };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to save island changes' 
      };
    }
  }

  /**
   * Expand island using a blueprint
   */
  async expandIsland(playerId: string, blueprint: IslandBlueprint): Promise<ServiceResult<boolean>> {
    try {
      const island = await this.worldRepository!.findByOwnerId(playerId);
      if (!island) {
        return { success: false, error: 'Island not found' };
      }

      // Validate blueprint requirements
      const validationResult = this.validateBlueprintRequirements(island, blueprint);
      if (!validationResult.success) {
        return { success: false, error: validationResult.error || 'Blueprint validation failed' };
      }

      // Generate new chunks for expansion
      const newChunks = this.generateExpansionChunks(island, blueprint);

      // Update island
      const updatedIsland = await this.worldRepository!.update(island.id, {
        chunks: [...island.chunks, ...newChunks],
        expansionLevel: island.expansionLevel + 1,
        lastModified: new Date()
      });

      if (!updatedIsland) {
        return { success: false, error: 'Failed to update island' };
      }

      return { success: true, data: true };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to expand island' 
      };
    }
  }

  /**
   * Get island by ID (for visiting other players' islands)
   */
  async getIsland(islandId: string, visitorId?: string): Promise<ServiceResult<Island>> {
    try {
      const island = await this.worldRepository!.findById(islandId);
      if (!island) {
        return { success: false, error: 'Island not found' };
      }

      // Check permissions if visitor is specified
      if (visitorId && !this.canVisitIsland(island, visitorId)) {
        return { success: false, error: 'Access denied' };
      }

      // Increment visit count if visitor is different from owner
      if (visitorId && visitorId !== island.ownerId) {
        await this.worldRepository!.incrementVisitCount(islandId);
      }

      return { success: true, data: island };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to get island' 
      };
    }
  }

  /**
   * Update island permissions
   */
  async updateIslandPermissions(playerId: string, permissions: Partial<IslandPermissions>): Promise<ServiceResult<void>> {
    try {
      const island = await this.worldRepository!.findByOwnerId(playerId);
      if (!island) {
        return { success: false, error: 'Island not found' };
      }

      const updatedPermissions = { ...island.permissions, ...permissions };
      
      await this.worldRepository!.update(island.id, { 
        permissions: updatedPermissions,
        lastModified: new Date()
      });

      return { success: true };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to update permissions' 
      };
    }
  }

  /**
   * Get public islands for browsing
   */
  async getPublicIslands(limit: number = 20, offset: number = 0): Promise<ServiceResult<Island[]>> {
    try {
      const islands = await this.worldRepository!.getPublicIslands(limit, offset);
      return { success: true, data: islands };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to get public islands' 
      };
    }
  }

  /**
   * Save dirty chunks to database
   */
  async saveDirtyChunks(playerId: string): Promise<ServiceResult<number>> {
    try {
      const island = await this.worldRepository!.findByOwnerId(playerId);
      if (!island) {
        return { success: false, error: 'Island not found' };
      }

      const dirtyChunks = await this.worldRepository!.getDirtyChunks(island.id);
      
      if (dirtyChunks.length === 0) {
        return { success: true, data: 0 };
      }

      await this.worldRepository!.saveChunks(island.id, dirtyChunks);
      await this.worldRepository!.markChunksClean(island.id, dirtyChunks.map(c => c.chunkId));

      return { success: true, data: dirtyChunks.length };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to save dirty chunks' 
      };
    }
  }

  /**
   * Get voxel at specific world position
   */
  async getVoxelAt(playerId: string, position: Vector3): Promise<ServiceResult<number>> {
    try {
      const island = await this.worldRepository!.findByOwnerId(playerId);
      if (!island) {
        return { success: false, error: 'Island not found' };
      }

      const chunkCoord = ChunkCoordinateSystem.worldToChunk(position);
      const chunkId = ChunkCoordinateSystem.generateChunkId(chunkCoord);
      
      const chunk = island.chunks.find(c => c.chunkId === chunkId);
      if (!chunk) {
        return { success: true, data: 0 }; // Empty voxel
      }

      const blockId = VoxelDataManager.getVoxelAt(chunk, position);
      return { success: true, data: blockId };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to get voxel' 
      };
    }
  }

  /**
   * Set voxel at specific world position
   */
  async setVoxelAt(playerId: string, position: Vector3, blockId: number): Promise<ServiceResult<void>> {
    try {
      const island = await this.worldRepository!.findByOwnerId(playerId);
      if (!island) {
        return { success: false, error: 'Island not found' };
      }

      const chunkCoord = ChunkCoordinateSystem.worldToChunk(position);
      const chunkId = ChunkCoordinateSystem.generateChunkId(chunkCoord);
      
      let chunk = island.chunks.find(c => c.chunkId === chunkId);
      if (!chunk) {
        // Create new chunk if it doesn't exist
        chunk = this.createEmptyChunk(chunkCoord);
        island.chunks.push(chunk);
      }

      const oldBlockId = VoxelDataManager.getVoxelAt(chunk, position);
      VoxelDataManager.setVoxelAt(chunk, position, blockId);

      // Create voxel change record
      const change: VoxelChange = {
        position,
        oldBlockId,
        newBlockId: blockId,
        timestamp: new Date(),
        playerId
      };

      await this.saveIslandChanges(playerId, [change]);

      return { success: true };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to set voxel' 
      };
    }
  }

  /**
   * Generate initial chunks for a new island
   */
  private generateInitialChunks(): WorldChunk[] {
    const chunks: WorldChunk[] = [];
    const startSize = GAME_CONSTANTS.ISLAND_START_SIZE;
    const chunksPerAxis = {
      x: Math.ceil(startSize.x / GAME_CONSTANTS.CHUNK_SIZE),
      y: Math.ceil(startSize.y / GAME_CONSTANTS.CHUNK_SIZE),
      z: Math.ceil(startSize.z / GAME_CONSTANTS.CHUNK_SIZE)
    };

    for (let x = 0; x < chunksPerAxis.x; x++) {
      for (let y = 0; y < chunksPerAxis.y; y++) {
        for (let z = 0; z < chunksPerAxis.z; z++) {
          const chunkCoord: ChunkCoordinate = { x, y, z };
          const chunk = this.createEmptyChunk(chunkCoord);
          
          // Generate basic terrain for the starting island
          this.generateBasicTerrain(chunk, chunkCoord);
          
          chunks.push(chunk);
        }
      }
    }

    return chunks;
  }

  /**
   * Create an empty chunk
   */
  private createEmptyChunk(position: ChunkCoordinate): WorldChunk {
    return {
      chunkId: ChunkCoordinateSystem.generateChunkId(position),
      position,
      voxelData: VoxelDataManager.createEmptyChunkData(),
      entities: [],
      lastModified: new Date(),
      isLoaded: true,
      isDirty: false
    };
  }

  /**
   * Generate basic terrain for a chunk (simple grass platform)
   */
  private generateBasicTerrain(chunk: WorldChunk, chunkCoord: ChunkCoordinate): void {
    // Only generate terrain for the bottom chunks (y = 0)
    if (chunkCoord.y !== 0) return;

    const grassBlockId = 2; // Assuming grass block ID is 2
    const dirtBlockId = 3;  // Assuming dirt block ID is 3

    // Fill bottom layer with dirt, top layer with grass
    for (let x = 0; x < GAME_CONSTANTS.CHUNK_SIZE; x++) {
      for (let z = 0; z < GAME_CONSTANTS.CHUNK_SIZE; z++) {
        // Bottom layers (0-2) with dirt
        for (let y = 0; y < 3; y++) {
          const localPos = { x, y, z };
          const index = VoxelDataManager.getVoxelIndex(localPos);
          chunk.voxelData[index] = dirtBlockId;
        }
        
        // Top layer (3) with grass
        const grassPos = { x, y: 3, z };
        const grassIndex = VoxelDataManager.getVoxelIndex(grassPos);
        chunk.voxelData[grassIndex] = grassBlockId;
      }
    }

    chunk.isDirty = true;
  }

  /**
   * Validate voxel changes
   */
  private validateVoxelChanges(island: Island, changes: VoxelChange[]): ServiceResult<void> {
    for (const change of changes) {
      // Check if position is within island bounds
      if (!this.isPositionWithinIslandBounds(island, change.position)) {
        return { success: false, error: 'Position outside island bounds' };
      }

      // Validate block IDs
      if (change.newBlockId < 0 || change.newBlockId > 255) {
        return { success: false, error: 'Invalid block ID' };
      }
    }

    return { success: true };
  }

  /**
   * Apply changes to chunks in memory
   */
  private applyChangesToChunks(chunks: WorldChunk[], changes: VoxelChange[]): void {
    for (const change of changes) {
      const chunkCoord = ChunkCoordinateSystem.worldToChunk(change.position);
      const chunkId = ChunkCoordinateSystem.generateChunkId(chunkCoord);
      
      const chunk = chunks.find(c => c.chunkId === chunkId);
      if (chunk) {
        VoxelDataManager.setVoxelAt(chunk, change.position, change.newBlockId);
      }
    }
  }

  /**
   * Validate blueprint requirements
   */
  private validateBlueprintRequirements(island: Island, blueprint: IslandBlueprint): ServiceResult<void> {
    // Check if player meets unlock requirements
    for (const requirement of blueprint.unlockRequirements) {
      // This would typically check player achievements, levels, etc.
      // For now, just check expansion level
      if (requirement.startsWith('expansion_level_')) {
        const requiredLevel = parseInt(requirement.split('_')[2] || '0');
        if (island.expansionLevel < requiredLevel) {
          return { success: false, error: `Requires expansion level ${requiredLevel}` };
        }
      }
    }

    // In a real implementation, you would also check if player has required materials
    // This would require access to player inventory

    return { success: true };
  }

  /**
   * Generate new chunks for island expansion
   */
  private generateExpansionChunks(island: Island, blueprint: IslandBlueprint): WorldChunk[] {
    const newChunks: WorldChunk[] = [];
    
    // Calculate new chunk positions based on blueprint expansion size
    const currentBounds = this.calculateIslandBounds(island);
    const expansionChunks = this.calculateExpansionChunks(currentBounds, blueprint.expansionSize);

    for (const chunkCoord of expansionChunks) {
      const chunk = this.createEmptyChunk(chunkCoord);
      newChunks.push(chunk);
    }

    return newChunks;
  }

  /**
   * Check if a player can visit an island
   */
  private canVisitIsland(island: Island, visitorId: string): boolean {
    // Owner can always visit
    if (island.ownerId === visitorId) {
      return true;
    }

    // Check if island is public
    if (island.permissions.isPublic) {
      return true;
    }

    // Check if visitor is in allowed list
    if (island.permissions.allowedVisitors.includes(visitorId)) {
      return true;
    }

    // Check if visitor is a coop member
    if (island.permissions.coopMembers.includes(visitorId)) {
      return true;
    }

    return false;
  }

  /**
   * Check if position is within island bounds
   */
  private isPositionWithinIslandBounds(island: Island, position: Vector3): boolean {
    // Calculate island bounds from existing chunks
    const bounds = this.calculateIslandBounds(island);
    
    return position.x >= bounds.min.x && position.x <= bounds.max.x &&
           position.y >= bounds.min.y && position.y <= bounds.max.y &&
           position.z >= bounds.min.z && position.z <= bounds.max.z;
  }

  /**
   * Calculate island bounds from chunks
   */
  private calculateIslandBounds(island: Island): { min: Vector3; max: Vector3 } {
    if (island.chunks.length === 0) {
      return { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } };
    }

    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

    for (const chunk of island.chunks) {
      const worldPos = ChunkCoordinateSystem.chunkToWorld(chunk.position);
      const chunkSize = GAME_CONSTANTS.CHUNK_SIZE;

      minX = Math.min(minX, worldPos.x);
      minY = Math.min(minY, worldPos.y);
      minZ = Math.min(minZ, worldPos.z);

      maxX = Math.max(maxX, worldPos.x + chunkSize - 1);
      maxY = Math.max(maxY, worldPos.y + chunkSize - 1);
      maxZ = Math.max(maxZ, worldPos.z + chunkSize - 1);
    }

    return {
      min: { x: minX, y: minY, z: minZ },
      max: { x: maxX, y: maxY, z: maxZ }
    };
  }

  /**
   * Calculate which chunks need to be created for expansion
   */
  private calculateExpansionChunks(currentBounds: { min: Vector3; max: Vector3 }, expansionSize: Vector3): ChunkCoordinate[] {
    const expansionChunks: ChunkCoordinate[] = [];
    
    // This is a simplified expansion - in reality you'd want more sophisticated logic
    const chunkSize = GAME_CONSTANTS.CHUNK_SIZE;
    const newMaxX = currentBounds.max.x + expansionSize.x;
    const newMaxZ = currentBounds.max.z + expansionSize.z;

    // Add chunks to expand in X direction
    for (let x = Math.floor((currentBounds.max.x + 1) / chunkSize); x <= Math.floor(newMaxX / chunkSize); x++) {
      for (let y = Math.floor(currentBounds.min.y / chunkSize); y <= Math.floor(currentBounds.max.y / chunkSize); y++) {
        for (let z = Math.floor(currentBounds.min.z / chunkSize); z <= Math.floor(currentBounds.max.z / chunkSize); z++) {
          expansionChunks.push({ x, y, z });
        }
      }
    }

    // Add chunks to expand in Z direction
    for (let z = Math.floor((currentBounds.max.z + 1) / chunkSize); z <= Math.floor(newMaxZ / chunkSize); z++) {
      for (let x = Math.floor(currentBounds.min.x / chunkSize); x <= Math.floor(newMaxX / chunkSize); x++) {
        for (let y = Math.floor(currentBounds.min.y / chunkSize); y <= Math.floor(currentBounds.max.y / chunkSize); y++) {
          expansionChunks.push({ x, y, z });
        }
      }
    }

    return expansionChunks;
  }

  /**
   * Get player's island (API method)
   */
  async getPlayerIsland(playerId: string): Promise<Island | null> {
    const island = await this.worldRepository!.findByOwnerId(playerId);
    if (!island) {
      // Create a new island for the player if they don't have one
      return await this.createPlayerIsland(playerId);
    }
    return island;
  }

  /**
   * Expand island with blueprint ID and direction (API method)
   */
  async expandIslandWithBlueprint(playerId: string, blueprintId: string, direction: string): Promise<{ success: boolean; error?: string }> {
    // Mock blueprint for now
    const blueprint: IslandBlueprint = {
      id: blueprintId,
      name: 'Basic Expansion',
      requiredMaterials: [],
      expansionSize: { x: 16, y: 0, z: 16 },
      unlockRequirements: []
    };

    const result = await this.expandIsland(playerId, blueprint);
    return { success: result.success, ...(result.error && { error: result.error }) };
  }

  /**
   * Get chunk by coordinates (API method)
   */
  async getChunk(coordinate: ChunkCoordinate): Promise<WorldChunk | null> {
    // For now, return a mock chunk
    return this.createEmptyChunk(coordinate);
  }

  /**
   * Get public zones (API method)
   */
  async getPublicZones(): Promise<any[]> {
    return [
      { id: 'hub', name: 'Hub City', description: 'Central trading hub' },
      { id: 'combat1', name: 'Combat Zone Alpha', description: 'Low level combat area' },
      { id: 'combat2', name: 'Combat Zone Beta', description: 'Medium level combat area' }
    ];
  }

  /**
   * Get public zone by ID (API method)
   */
  async getPublicZone(zoneId: string): Promise<any | null> {
    const zones = await this.getPublicZones();
    return zones.find(zone => zone.id === zoneId) || null;
  }

  /**
   * Get expansion blueprints (API method)
   */
  async getExpansionBlueprints(): Promise<IslandBlueprint[]> {
    return [
      {
        id: 'basic-expansion',
        name: 'Basic Expansion',
        requiredMaterials: [],
        expansionSize: { x: 16, y: 0, z: 16 },
        unlockRequirements: []
      },
      {
        id: 'large-expansion',
        name: 'Large Expansion',
        requiredMaterials: [],
        expansionSize: { x: 32, y: 0, z: 32 },
        unlockRequirements: ['expansion_level_3']
      }
    ];
  }

  /**
   * Modify a block at a specific position (for WebSocket real-time updates)
   */
  async modifyBlock(
    playerId: string, 
    position: Vector3, 
    blockType: number, 
    action: 'place' | 'break'
  ): Promise<ServiceResult<void>> {
    try {
      const island = await this.worldRepository!.findByOwnerId(playerId);
      if (!island) {
        return { success: false, error: 'Island not found' };
      }

      // Check if position is within island bounds
      if (!this.isPositionWithinIslandBounds(island, position)) {
        return { success: false, error: 'Position outside island bounds' };
      }

      // Get current block at position
      const currentBlockResult = await this.getVoxelAt(playerId, position);
      if (!currentBlockResult.success) {
        return { success: false, error: currentBlockResult.error || 'Failed to get current block' };
      }

      const currentBlockId = currentBlockResult.data!;
      let newBlockId: number;

      if (action === 'place') {
        // Check if there's already a block there (can't place on occupied space)
        if (currentBlockId !== 0) {
          return { success: false, error: 'Position already occupied' };
        }
        newBlockId = blockType;
      } else if (action === 'break') {
        // Check if there's a block to break
        if (currentBlockId === 0) {
          return { success: false, error: 'No block to break' };
        }
        newBlockId = 0; // Air block
      } else {
        return { success: false, error: 'Invalid action' };
      }

      // Apply the change
      const result = await this.setVoxelAt(playerId, position, newBlockId);
      return result;
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to modify block' 
      };
    }
  }
}

// Mock repositories for testing
class MockWorldRepository implements WorldRepository {
  private islands: Map<string, Island> = new Map();

  async findById(id: string): Promise<Island | null> {
    return this.islands.get(id) || null;
  }

  async findByOwnerId(ownerId: string): Promise<Island | null> {
    for (const island of this.islands.values()) {
      if (island.ownerId === ownerId) {
        return island;
      }
    }
    return null;
  }

  async create(islandData: Omit<Island, 'id'>): Promise<Island> {
    const id = Math.random().toString(36).substr(2, 9);
    const island = { ...islandData, id } as Island;
    this.islands.set(id, island);
    return island;
  }

  async update(id: string, updates: Partial<Island>): Promise<Island | null> {
    const island = this.islands.get(id);
    if (!island) {
      return null;
    }
    
    const updatedIsland = { ...island, ...updates };
    this.islands.set(id, updatedIsland);
    return updatedIsland;
  }

  async delete(id: string): Promise<boolean> {
    return this.islands.delete(id);
  }

  async loadChunks(islandId: string, options?: any): Promise<WorldChunk[]> {
    const island = this.islands.get(islandId);
    return island ? island.chunks : [];
  }

  async saveChunk(islandId: string, chunk: WorldChunk): Promise<void> {
    // Mock implementation
  }

  async saveChunks(islandId: string, chunks: WorldChunk[]): Promise<void> {
    // Mock implementation
  }

  async applyVoxelChanges(islandId: string, changes: VoxelChange[]): Promise<void> {
    // Mock implementation
  }

  async getDirtyChunks(islandId: string): Promise<WorldChunk[]> {
    return [];
  }

  async markChunksClean(islandId: string, chunkIds: string[]): Promise<void> {
    // Mock implementation
  }

  async incrementVisitCount(islandId: string): Promise<void> {
    const island = this.islands.get(islandId);
    if (island) {
      island.visitCount += 1;
    }
  }

  async getPublicIslands(limit?: number, offset?: number): Promise<Island[]> {
    const publicIslands = Array.from(this.islands.values()).filter(island => island.permissions.isPublic);
    return publicIslands.slice(offset || 0, (offset || 0) + (limit || 20));
  }
}

class MockMinionRepository implements MinionRepository {
  async findByIslandId(islandId: string): Promise<Minion[]> {
    return [];
  }

  async findActiveMinions(islandId: string): Promise<Minion[]> {
    return [];
  }
}