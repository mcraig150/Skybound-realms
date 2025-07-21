import { Island, WorldChunk, VoxelChange, ChunkCoordinate, Entity } from '../models/Island';
import { AbstractRepository } from './BaseRepository';

export interface ChunkLoadOptions {
  playerId?: string;
  chunkIds?: string[];
  position?: ChunkCoordinate;
  radius?: number;
}

export class IslandRepository extends AbstractRepository<Island, string> {
  protected tableName = 'islands';

  async findById(id: string): Promise<Island | null> {
    const query = `
      SELECT i.*, 
             c.chunk_id, c.position, c.voxel_data, c.entities, c.last_modified as chunk_last_modified,
             c.is_loaded, c.is_dirty
      FROM islands i
      LEFT JOIN world_chunks c ON i.id = c.island_id
      WHERE i.id = $1
    `;
    
    const rows = await this.executeQuery(query, [id]);
    
    if (rows.length === 0) {
      return null;
    }

    return this.mapRowsToIsland(rows);
  }

  async findByOwnerId(ownerId: string): Promise<Island | null> {
    const query = `
      SELECT i.*, 
             c.chunk_id, c.position, c.voxel_data, c.entities, c.last_modified as chunk_last_modified,
             c.is_loaded, c.is_dirty
      FROM islands i
      LEFT JOIN world_chunks c ON i.id = c.island_id
      WHERE i.owner_id = $1
    `;
    
    const rows = await this.executeQuery(query, [ownerId]);
    
    if (rows.length === 0) {
      return null;
    }

    return this.mapRowsToIsland(rows);
  }

  async findAll(): Promise<Island[]> {
    const query = `
      SELECT i.*, 
             c.chunk_id, c.position, c.voxel_data, c.entities, c.last_modified as chunk_last_modified,
             c.is_loaded, c.is_dirty
      FROM islands i
      LEFT JOIN world_chunks c ON i.id = c.island_id
      ORDER BY i.created_at DESC
    `;
    
    const rows = await this.executeQuery(query);
    return this.groupRowsIntoIslands(rows);
  }

  async create(islandData: Omit<Island, 'id'>): Promise<Island> {
    return this.executeTransaction(async (client) => {
      // Insert main island record
      const islandInsert = {
        id: this.generateId(),
        owner_id: islandData.ownerId,
        expansion_level: islandData.expansionLevel,
        permissions: JSON.stringify(islandData.permissions),
        visit_count: islandData.visitCount,
        created_at: islandData.createdAt,
        last_modified: islandData.lastModified
      };

      const { query: islandQuery, params: islandParams } = this.buildInsertQuery('islands', islandInsert);
      const islandResult = await client.query(islandQuery, islandParams);
      const islandId = islandResult.rows[0].id;

      // Insert chunks
      for (const chunk of islandData.chunks) {
        const chunkInsert = {
          chunk_id: chunk.chunkId,
          island_id: islandId,
          position: JSON.stringify(chunk.position),
          voxel_data: chunk.voxelData,
          entities: JSON.stringify(chunk.entities),
          last_modified: chunk.lastModified,
          is_loaded: chunk.isLoaded,
          is_dirty: chunk.isDirty
        };

        const { query: chunkQuery, params: chunkParams } = this.buildInsertQuery('world_chunks', chunkInsert);
        await client.query(chunkQuery, chunkParams);
      }

      return this.findById(islandId) as Promise<Island>;
    });
  }

  async update(id: string, updates: Partial<Island>): Promise<Island | null> {
    return this.executeTransaction(async (client) => {
      // Update main island record
      const islandUpdates: Record<string, any> = {};
      
      if (updates.ownerId !== undefined) islandUpdates.owner_id = updates.ownerId;
      if (updates.expansionLevel !== undefined) islandUpdates.expansion_level = updates.expansionLevel;
      if (updates.permissions !== undefined) islandUpdates.permissions = JSON.stringify(updates.permissions);
      if (updates.visitCount !== undefined) islandUpdates.visit_count = updates.visitCount;
      if (updates.lastModified !== undefined) islandUpdates.last_modified = updates.lastModified;
      
      islandUpdates.id = id;

      if (Object.keys(islandUpdates).length > 1) { // More than just id
        const { query: islandQuery, params: islandParams } = this.buildUpdateQuery('islands', islandUpdates);
        await client.query(islandQuery, islandParams);
      }

      // Update chunks if provided
      if (updates.chunks) {
        // For simplicity, we'll replace all chunks. In production, you might want more granular updates
        await client.query('DELETE FROM world_chunks WHERE island_id = $1', [id]);
        
        for (const chunk of updates.chunks) {
          const chunkInsert = {
            chunk_id: chunk.chunkId,
            island_id: id,
            position: JSON.stringify(chunk.position),
            voxel_data: chunk.voxelData,
            entities: JSON.stringify(chunk.entities),
            last_modified: chunk.lastModified,
            is_loaded: chunk.isLoaded,
            is_dirty: chunk.isDirty
          };

          const { query: chunkQuery, params: chunkParams } = this.buildInsertQuery('world_chunks', chunkInsert);
          await client.query(chunkQuery, chunkParams);
        }
      }

      return this.findById(id);
    });
  }

  async delete(id: string): Promise<boolean> {
    return this.executeTransaction(async (client) => {
      // Delete chunks first (foreign key constraints)
      await client.query('DELETE FROM world_chunks WHERE island_id = $1', [id]);
      
      // Delete main island record
      const result = await client.query('DELETE FROM islands WHERE id = $1', [id]);
      return (result.rowCount ?? 0) > 0;
    });
  }

  async loadChunks(islandId: string, options: ChunkLoadOptions = {}): Promise<WorldChunk[]> {
    let query = `
      SELECT chunk_id, position, voxel_data, entities, last_modified, is_loaded, is_dirty
      FROM world_chunks
      WHERE island_id = $1
    `;
    
    const params: any[] = [islandId];
    let paramIndex = 2;

    if (options.chunkIds && options.chunkIds.length > 0) {
      query += ` AND chunk_id = ANY($${paramIndex})`;
      params.push(options.chunkIds);
      paramIndex++;
    }

    if (options.position && options.radius !== undefined) {
      // This would require a more complex spatial query in production
      // For now, we'll load all chunks and filter in memory
    }

    const rows = await this.executeQuery(query, params);
    
    return rows.map(row => ({
      chunkId: row.chunk_id,
      position: JSON.parse(row.position),
      voxelData: row.voxel_data,
      entities: JSON.parse(row.entities || '[]'),
      lastModified: new Date(row.last_modified),
      isLoaded: row.is_loaded,
      isDirty: row.is_dirty
    }));
  }

  async saveChunk(islandId: string, chunk: WorldChunk): Promise<void> {
    const query = `
      INSERT INTO world_chunks (chunk_id, island_id, position, voxel_data, entities, last_modified, is_loaded, is_dirty)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (chunk_id, island_id) 
      DO UPDATE SET 
        position = EXCLUDED.position,
        voxel_data = EXCLUDED.voxel_data,
        entities = EXCLUDED.entities,
        last_modified = EXCLUDED.last_modified,
        is_loaded = EXCLUDED.is_loaded,
        is_dirty = EXCLUDED.is_dirty
    `;

    await this.executeQuery(query, [
      chunk.chunkId,
      islandId,
      JSON.stringify(chunk.position),
      chunk.voxelData,
      JSON.stringify(chunk.entities),
      chunk.lastModified,
      chunk.isLoaded,
      chunk.isDirty
    ]);
  }

  async saveChunks(islandId: string, chunks: WorldChunk[]): Promise<void> {
    return this.executeTransaction(async (client) => {
      for (const chunk of chunks) {
        const query = `
          INSERT INTO world_chunks (chunk_id, island_id, position, voxel_data, entities, last_modified, is_loaded, is_dirty)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          ON CONFLICT (chunk_id, island_id) 
          DO UPDATE SET 
            position = EXCLUDED.position,
            voxel_data = EXCLUDED.voxel_data,
            entities = EXCLUDED.entities,
            last_modified = EXCLUDED.last_modified,
            is_loaded = EXCLUDED.is_loaded,
            is_dirty = EXCLUDED.is_dirty
        `;

        await client.query(query, [
          chunk.chunkId,
          islandId,
          JSON.stringify(chunk.position),
          chunk.voxelData,
          JSON.stringify(chunk.entities),
          chunk.lastModified,
          chunk.isLoaded,
          chunk.isDirty
        ]);
      }
    });
  }

  async applyVoxelChanges(islandId: string, changes: VoxelChange[]): Promise<void> {
    return this.executeTransaction(async (client) => {
      // Log the changes for audit trail
      for (const change of changes) {
        const changeInsert = {
          island_id: islandId,
          position: JSON.stringify(change.position),
          old_block_id: change.oldBlockId,
          new_block_id: change.newBlockId,
          timestamp: change.timestamp,
          player_id: change.playerId
        };

        const { query: changeQuery, params: changeParams } = this.buildInsertQuery('voxel_changes', changeInsert);
        await client.query(changeQuery, changeParams);
      }

      // Mark affected chunks as dirty
      const affectedChunks = new Set<string>();
      for (const change of changes) {
        const chunkId = this.getChunkIdFromPosition(change.position);
        affectedChunks.add(chunkId);
      }

      for (const chunkId of affectedChunks) {
        await client.query(
          'UPDATE world_chunks SET is_dirty = true, last_modified = $1 WHERE chunk_id = $2 AND island_id = $3',
          [new Date(), chunkId, islandId]
        );
      }
    });
  }

  async getVoxelChangeHistory(islandId: string, limit: number = 100): Promise<VoxelChange[]> {
    const query = `
      SELECT position, old_block_id, new_block_id, timestamp, player_id
      FROM voxel_changes
      WHERE island_id = $1
      ORDER BY timestamp DESC
      LIMIT $2
    `;

    const rows = await this.executeQuery(query, [islandId, limit]);
    
    return rows.map(row => ({
      position: JSON.parse(row.position),
      oldBlockId: row.old_block_id,
      newBlockId: row.new_block_id,
      timestamp: new Date(row.timestamp),
      playerId: row.player_id
    }));
  }

  async getDirtyChunks(islandId: string): Promise<WorldChunk[]> {
    const query = `
      SELECT chunk_id, position, voxel_data, entities, last_modified, is_loaded, is_dirty
      FROM world_chunks
      WHERE island_id = $1 AND is_dirty = true
    `;

    const rows = await this.executeQuery(query, [islandId]);
    
    return rows.map(row => ({
      chunkId: row.chunk_id,
      position: JSON.parse(row.position),
      voxelData: row.voxel_data,
      entities: JSON.parse(row.entities || '[]'),
      lastModified: new Date(row.last_modified),
      isLoaded: row.is_loaded,
      isDirty: row.is_dirty
    }));
  }

  async markChunksClean(islandId: string, chunkIds: string[]): Promise<void> {
    if (chunkIds.length === 0) return;

    const query = `
      UPDATE world_chunks 
      SET is_dirty = false 
      WHERE island_id = $1 AND chunk_id = ANY($2)
    `;

    await this.executeQuery(query, [islandId, chunkIds]);
  }

  async incrementVisitCount(islandId: string): Promise<void> {
    const query = 'UPDATE islands SET visit_count = visit_count + 1 WHERE id = $1';
    await this.executeQuery(query, [islandId]);
  }

  async getPublicIslands(limit: number = 20, offset: number = 0): Promise<Island[]> {
    const query = `
      SELECT i.*, 
             c.chunk_id, c.position, c.voxel_data, c.entities, c.last_modified as chunk_last_modified,
             c.is_loaded, c.is_dirty
      FROM islands i
      LEFT JOIN world_chunks c ON i.id = c.island_id
      WHERE (i.permissions->>'isPublic')::boolean = true
      ORDER BY i.visit_count DESC, i.created_at DESC
      LIMIT $1 OFFSET $2
    `;

    const rows = await this.executeQuery(query, [limit, offset]);
    return this.groupRowsIntoIslands(rows);
  }

  private mapRowsToIsland(rows: any[]): Island {
    if (rows.length === 0) {
      throw new Error('No rows to map to island');
    }

    const firstRow = rows[0];
    const chunks: WorldChunk[] = [];

    // Collect chunks from joined rows
    const chunkMap = new Map<string, any>();

    for (const row of rows) {
      if (row.chunk_id && !chunkMap.has(row.chunk_id)) {
        chunkMap.set(row.chunk_id, {
          chunkId: row.chunk_id,
          position: JSON.parse(row.position || '{"x":0,"y":0,"z":0}'),
          voxelData: row.voxel_data || new Uint8Array(),
          entities: JSON.parse(row.entities || '[]'),
          lastModified: new Date(row.chunk_last_modified || row.last_modified),
          isLoaded: row.is_loaded || false,
          isDirty: row.is_dirty || false
        });
      }
    }

    chunks.push(...chunkMap.values());

    return {
      id: firstRow.id,
      ownerId: firstRow.owner_id,
      chunks,
      expansionLevel: firstRow.expansion_level,
      permissions: firstRow.permissions ? JSON.parse(firstRow.permissions) : {
        isPublic: false,
        allowedVisitors: [],
        coopMembers: [],
        buildPermissions: new Map()
      },
      visitCount: firstRow.visit_count,
      createdAt: new Date(firstRow.created_at),
      lastModified: new Date(firstRow.last_modified)
    };
  }

  private groupRowsIntoIslands(rows: any[]): Island[] {
    const islandMap = new Map<string, any[]>();

    // Group rows by island ID
    for (const row of rows) {
      if (!islandMap.has(row.id)) {
        islandMap.set(row.id, []);
      }
      islandMap.get(row.id)!.push(row);
    }

    // Convert each group to an Island object
    return Array.from(islandMap.values()).map(islandRows => this.mapRowsToIsland(islandRows));
  }

  private getChunkIdFromPosition(position: { x: number; y: number; z: number }): string {
    const chunkSize = 16;
    const chunkX = Math.floor(position.x / chunkSize);
    const chunkY = Math.floor(position.y / chunkSize);
    const chunkZ = Math.floor(position.z / chunkSize);
    return `chunk_${chunkX}_${chunkY}_${chunkZ}`;
  }

  private generateId(): string {
    return 'island_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }
}