import { Vector3, ServiceResult } from '../shared/types';
import { VoxelChange, WorldChunk, ChunkCoordinate } from '../models/Island';
import { Player } from '../models/Player';
import { WorldService } from './WorldService';
import { PlayerService } from './PlayerService';
import { WebSocketService } from './WebSocketService';

export interface ClientState {
  playerId: string;
  lastSyncTimestamp: Date;
  pendingChanges: VoxelChange[];
  worldState: Map<string, WorldChunk>; // chunkId -> chunk
  playerState: Player;
  version: number;
}

export interface ServerState {
  playerId: string;
  lastUpdateTimestamp: Date;
  worldVersion: number;
  playerVersion: number;
  authorizedChanges: VoxelChange[];
}

export interface SyncRequest {
  playerId: string;
  clientVersion: number;
  lastSyncTimestamp: Date;
  pendingChanges: VoxelChange[];
  requestedChunks?: ChunkCoordinate[];
}

export interface SyncResponse {
  success: boolean;
  serverVersion: number;
  timestamp: Date;
  worldUpdates: WorldChunk[];
  playerUpdates: Partial<Player>;
  conflictResolutions: ConflictResolution[];
  rejectedChanges: VoxelChange[];
  error?: string;
}

export interface ConflictResolution {
  changeId: string;
  resolution: 'server_wins' | 'client_wins' | 'merge';
  serverValue: any;
  clientValue: any;
  resolvedValue: any;
  reason: string;
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export class SynchronizationService {
  private clientStates: Map<string, ClientState> = new Map();
  private serverStates: Map<string, ServerState> = new Map();
  private conflictResolvers: Map<string, ConflictResolver> = new Map();

  constructor(
    private worldService: WorldService,
    private playerService: PlayerService,
    private webSocketService?: WebSocketService
  ) {
    this.initializeConflictResolvers();
  }

  /**
   * Initialize conflict resolution strategies
   */
  private initializeConflictResolvers(): void {
    this.conflictResolvers.set('voxel_change', new VoxelChangeConflictResolver());
    this.conflictResolvers.set('player_state', new PlayerStateConflictResolver());
    this.conflictResolvers.set('inventory', new InventoryConflictResolver());
  }

  /**
   * Synchronize client state with server
   */
  async synchronizeState(request: SyncRequest): Promise<SyncResponse> {
    try {
      const { playerId, clientVersion, lastSyncTimestamp, pendingChanges, requestedChunks } = request;

      // Validate pending changes first
      const validationResult = await this.validateClientChanges(playerId, pendingChanges);
      
      // If validation failed due to player not found, return error
      if (!validationResult.isValid && validationResult.errors.some(error => 
        error.includes('Player island not found') || error.includes('Failed to validate player island')
      )) {
        return {
          success: false,
          serverVersion: 0,
          timestamp: new Date(),
          worldUpdates: [],
          playerUpdates: {},
          conflictResolutions: [],
          rejectedChanges: pendingChanges,
          error: 'Player not found or validation failed'
        };
      }

      // Get or create server state
      let serverState = this.serverStates.get(playerId);
      if (!serverState) {
        serverState = await this.initializeServerState(playerId);
        this.serverStates.set(playerId, serverState);
      }
      
      // Separate valid and invalid changes
      const validChanges = pendingChanges.filter((_, index) => 
        !validationResult.errors.some(error => error.includes(`Change ${index}`))
      );
      const rejectedChanges = pendingChanges.filter((_, index) => 
        validationResult.errors.some(error => error.includes(`Change ${index}`))
      );

      // Detect and resolve conflicts
      const conflictResolutions = await this.detectAndResolveConflicts(
        playerId, 
        validChanges, 
        lastSyncTimestamp
      );

      // Apply resolved changes to server
      const appliedChanges = await this.applyResolvedChanges(playerId, conflictResolutions);

      // Get world updates for requested chunks
      const worldUpdates = requestedChunks ? 
        await this.getWorldUpdates(playerId, requestedChunks) : [];

      // Get player updates
      const playerUpdates = await this.getPlayerUpdates(playerId, clientVersion);

      // Update server state
      serverState.lastUpdateTimestamp = new Date();
      serverState.worldVersion++;
      serverState.playerVersion++;
      serverState.authorizedChanges.push(...appliedChanges);

      // Broadcast changes to other clients if needed
      if (appliedChanges.length > 0) {
        this.broadcastChangesToOtherClients(playerId, appliedChanges);
      }

      return {
        success: true,
        serverVersion: serverState.worldVersion,
        timestamp: new Date(),
        worldUpdates,
        playerUpdates,
        conflictResolutions,
        rejectedChanges
      };

    } catch (error) {
      return {
        success: false,
        serverVersion: 0,
        timestamp: new Date(),
        worldUpdates: [],
        playerUpdates: {},
        conflictResolutions: [],
        rejectedChanges: request.pendingChanges,
        error: error instanceof Error ? error.message : 'Synchronization failed'
      };
    }
  }

  /**
   * Initialize server state for a player
   */
  private async initializeServerState(playerId: string): Promise<ServerState> {
    return {
      playerId,
      lastUpdateTimestamp: new Date(),
      worldVersion: 1,
      playerVersion: 1,
      authorizedChanges: []
    };
  }

  /**
   * Validate client changes against server rules
   */
  async validateClientChanges(playerId: string, changes: VoxelChange[]): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    let island: any = null;
    try {
      // Get player's island for validation
      island = await this.worldService.getPlayerIsland(playerId);
      if (!island) {
        errors.push('Player island not found');
        return { isValid: false, errors, warnings };
      }
    } catch (error) {
      errors.push('Failed to validate player island');
      return { isValid: false, errors, warnings };
    }

    for (let i = 0; i < changes.length; i++) {
      const change = changes[i];

      // Skip if change is undefined
      if (!change) {
        errors.push(`Change ${i}: Change is undefined`);
        continue;
      }

      // Validate change structure
      if (!this.isValidVoxelChange(change)) {
        errors.push(`Change ${i}: Invalid voxel change structure`);
        continue;
      }

      // Validate position bounds
      if (!this.isPositionWithinBounds(island, change.position)) {
        errors.push(`Change ${i}: Position outside island bounds`);
        continue;
      }

      // Validate block types
      if (!this.isValidBlockType(change.newBlockId)) {
        errors.push(`Change ${i}: Invalid block type ${change.newBlockId}`);
        continue;
      }

      // Validate permissions
      if (!await this.hasPermissionToModify(playerId, change.position)) {
        errors.push(`Change ${i}: No permission to modify this position`);
        continue;
      }

      // Check for rate limiting
      if (this.isRateLimited(playerId, change.timestamp)) {
        warnings.push(`Change ${i}: Rate limited, may be delayed`);
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Detect and resolve conflicts between client and server state
   */
  private async detectAndResolveConflicts(
    playerId: string, 
    clientChanges: VoxelChange[], 
    lastSyncTimestamp: Date
  ): Promise<ConflictResolution[]> {
    const conflicts: ConflictResolution[] = [];

    // Get server changes since last sync
    const serverChanges = await this.getServerChangesSince(playerId, lastSyncTimestamp);

    for (const clientChange of clientChanges) {
      // Check if there's a conflicting server change at the same position
      const conflictingServerChange = serverChanges.find(serverChange => 
        this.isSamePosition(clientChange.position, serverChange.position) &&
        serverChange.timestamp > lastSyncTimestamp
      );

      if (conflictingServerChange) {
        // Resolve conflict using appropriate resolver
        const resolver = this.conflictResolvers.get('voxel_change');
        if (resolver) {
          const resolution = await resolver.resolve(clientChange, conflictingServerChange);
          conflicts.push(resolution);
        }
      }
    }

    return conflicts;
  }

  /**
   * Apply resolved changes to server state
   */
  private async applyResolvedChanges(
    playerId: string, 
    resolutions: ConflictResolution[]
  ): Promise<VoxelChange[]> {
    const appliedChanges: VoxelChange[] = [];

    for (const resolution of resolutions) {
      if (resolution.resolution === 'client_wins' || resolution.resolution === 'merge') {
        // Apply the resolved change
        const change: VoxelChange = {
          position: resolution.resolvedValue.position,
          oldBlockId: resolution.resolvedValue.oldBlockId,
          newBlockId: resolution.resolvedValue.newBlockId,
          timestamp: new Date(),
          playerId
        };

        const result = await this.worldService.saveIslandChanges(playerId, [change]);
        if (result.success) {
          appliedChanges.push(change);
        }
      }
    }

    return appliedChanges;
  }

  /**
   * Get world updates for requested chunks
   */
  private async getWorldUpdates(
    playerId: string, 
    requestedChunks: ChunkCoordinate[]
  ): Promise<WorldChunk[]> {
    const updates: WorldChunk[] = [];

    for (const chunkCoord of requestedChunks) {
      const chunk = await this.worldService.getChunk(chunkCoord);
      if (chunk) {
        updates.push(chunk);
      }
    }

    return updates;
  }

  /**
   * Get player updates since client version
   */
  private async getPlayerUpdates(playerId: string, clientVersion: number): Promise<Partial<Player>> {
    const player = await this.playerService.getPlayer(playerId);
    if (!player) {
      return {};
    }

    // In a real implementation, you would track what has changed since clientVersion
    // For now, return essential updates
    return {
      skills: player.skills,
      inventory: player.inventory,
      currency: player.currency,
      lastLogin: player.lastLogin
    };
  }

  /**
   * Broadcast changes to other clients in the same zone
   */
  private broadcastChangesToOtherClients(playerId: string, changes: VoxelChange[]): void {
    if (!this.webSocketService) return;

    const connection = this.webSocketService.getPlayerConnection(playerId);
    if (connection?.currentZone) {
      this.webSocketService.broadcastToZone(connection.currentZone, 'world:changes_applied', {
        playerId,
        changes,
        timestamp: new Date()
      });
    }
  }

  /**
   * Get server changes since a timestamp
   */
  private async getServerChangesSince(playerId: string, timestamp: Date): Promise<VoxelChange[]> {
    const serverState = this.serverStates.get(playerId);
    if (!serverState) return [];

    return serverState.authorizedChanges.filter(change => 
      change.timestamp > timestamp
    );
  }

  /**
   * Validation helper methods
   */
  private isValidVoxelChange(change: VoxelChange): boolean {
    return !!(
      change.position &&
      typeof change.position.x === 'number' &&
      typeof change.position.y === 'number' &&
      typeof change.position.z === 'number' &&
      typeof change.oldBlockId === 'number' &&
      typeof change.newBlockId === 'number' &&
      change.timestamp instanceof Date &&
      typeof change.playerId === 'string'
    );
  }

  private isPositionWithinBounds(island: any, position: Vector3): boolean {
    // Simplified bounds check - in reality this would be more sophisticated
    return Math.abs(position.x) <= 1000 && 
           Math.abs(position.y) <= 256 && 
           Math.abs(position.z) <= 1000;
  }

  private isValidBlockType(blockId: number): boolean {
    return blockId >= 0 && blockId <= 255;
  }

  private async hasPermissionToModify(playerId: string, position: Vector3): Promise<boolean> {
    // Check if player has permission to modify this position
    // This would involve checking island ownership, build permissions, etc.
    return true; // Simplified for now
  }

  private isRateLimited(playerId: string, timestamp: Date): boolean {
    // Check if player is making changes too quickly
    // This would involve tracking recent changes and applying rate limits
    return false; // Simplified for now
  }

  private isSamePosition(pos1: Vector3, pos2: Vector3): boolean {
    return pos1.x === pos2.x && pos1.y === pos2.y && pos1.z === pos2.z;
  }

  /**
   * Force synchronization for a player (useful for reconnection)
   */
  async forceSynchronization(playerId: string): Promise<SyncResponse> {
    const request: SyncRequest = {
      playerId,
      clientVersion: 0,
      lastSyncTimestamp: new Date(0),
      pendingChanges: []
    };

    return await this.synchronizeState(request);
  }

  /**
   * Clean up old client states
   */
  cleanupOldStates(): void {
    const now = new Date();
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours

    for (const [playerId, state] of this.clientStates.entries()) {
      if (now.getTime() - state.lastSyncTimestamp.getTime() > maxAge) {
        this.clientStates.delete(playerId);
      }
    }

    for (const [playerId, state] of this.serverStates.entries()) {
      if (now.getTime() - state.lastUpdateTimestamp.getTime() > maxAge) {
        this.serverStates.delete(playerId);
      }
    }
  }
}

/**
 * Abstract base class for conflict resolvers
 */
abstract class ConflictResolver {
  abstract resolve(clientValue: any, serverValue: any): Promise<ConflictResolution>;
}

/**
 * Resolver for voxel change conflicts
 */
class VoxelChangeConflictResolver extends ConflictResolver {
  async resolve(clientChange: VoxelChange, serverChange: VoxelChange): Promise<ConflictResolution> {
    // Server wins by default for voxel changes to prevent duplication exploits
    return {
      changeId: `${clientChange.position.x}_${clientChange.position.y}_${clientChange.position.z}`,
      resolution: 'server_wins',
      serverValue: serverChange,
      clientValue: clientChange,
      resolvedValue: serverChange,
      reason: 'Server state takes precedence for world modifications'
    };
  }
}

/**
 * Resolver for player state conflicts
 */
class PlayerStateConflictResolver extends ConflictResolver {
  async resolve(clientState: any, serverState: any): Promise<ConflictResolution> {
    // For player state, we can be more lenient and merge non-conflicting changes
    return {
      changeId: 'player_state',
      resolution: 'merge',
      serverValue: serverState,
      clientValue: clientState,
      resolvedValue: { ...serverState, ...clientState },
      reason: 'Merged non-conflicting player state changes'
    };
  }
}

/**
 * Resolver for inventory conflicts
 */
class InventoryConflictResolver extends ConflictResolver {
  async resolve(clientInventory: any, serverInventory: any): Promise<ConflictResolution> {
    // Server wins for inventory to prevent item duplication
    return {
      changeId: 'inventory',
      resolution: 'server_wins',
      serverValue: serverInventory,
      clientValue: clientInventory,
      resolvedValue: serverInventory,
      reason: 'Server inventory state takes precedence to prevent duplication'
    };
  }
}