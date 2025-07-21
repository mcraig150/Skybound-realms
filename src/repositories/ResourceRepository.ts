import { ResourceNode, ResourceNodeType, ResourceNodeState } from '../models/Resource';
import { Vector3 } from '../shared/types';
import { AbstractRepository } from './BaseRepository';

export class ResourceRepository extends AbstractRepository<ResourceNode> {
  protected tableName = 'resource_nodes';
  /**
   * Find resource node by ID
   */
  async findById(id: string): Promise<ResourceNode | null> {
    try {
      const query = `
        SELECT * FROM resource_nodes 
        WHERE id = $1
      `;
      
      const result = await this.executeQuery(query, [id]);
      
      if (result.length === 0) {
        return null;
      }

      return this.mapRowToResourceNode(result[0]);
    } catch (error) {
      console.error('Error finding resource node by ID:', error);
      throw error;
    }
  }

  /**
   * Find all resource nodes for an island
   */
  async findByIslandId(islandId: string): Promise<ResourceNode[]> {
    try {
      const query = `
        SELECT * FROM resource_nodes 
        WHERE island_id = $1
        ORDER BY created_at DESC
      `;
      
      const result = await this.executeQuery(query, [islandId]);
      
      return result.map(row => this.mapRowToResourceNode(row));
    } catch (error) {
      console.error('Error finding resource nodes by island ID:', error);
      throw error;
    }
  }

  /**
   * Find resource node at specific position
   */
  async findByPosition(islandId: string, position: Vector3): Promise<ResourceNode | null> {
    try {
      const query = `
        SELECT * FROM resource_nodes 
        WHERE island_id = $1 AND position_x = $2 AND position_y = $3 AND position_z = $4
      `;
      
      const result = await this.executeQuery(query, [
        islandId, 
        position.x, 
        position.y, 
        position.z
      ]);
      
      if (result.length === 0) {
        return null;
      }

      return this.mapRowToResourceNode(result[0]);
    } catch (error) {
      console.error('Error finding resource node by position:', error);
      throw error;
    }
  }

  /**
   * Create a new resource node
   */
  async create(node: ResourceNode): Promise<ResourceNode> {
    try {
      const query = `
        INSERT INTO resource_nodes (
          id, type, island_id, position_x, position_y, position_z,
          state, max_harvest_count, current_harvest_count, regeneration_time,
          last_harvested_at, regenerates_at, level, drops, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16
        ) RETURNING *
      `;

      const now = new Date();
      const values = [
        node.id,
        node.type,
        node.islandId,
        node.position.x,
        node.position.y,
        node.position.z,
        node.state,
        node.maxHarvestCount,
        node.currentHarvestCount,
        node.regenerationTime,
        node.lastHarvestedAt,
        node.regeneratesAt,
        node.level,
        JSON.stringify(node.drops),
        now,
        now
      ];

      const result = await this.executeQuery(query, values);
      return this.mapRowToResourceNode(result[0]);
    } catch (error) {
      console.error('Error creating resource node:', error);
      throw error;
    }
  }

  /**
   * Update a resource node
   */
  async update(id: string, updates: Partial<ResourceNode>): Promise<ResourceNode | null> {
    try {
      const updateFields: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;

      // Build dynamic update query
      Object.entries(updates).forEach(([key, value]) => {
        if (value !== undefined) {
          switch (key) {
            case 'position':
              const pos = value as Vector3;
              updateFields.push(`position_x = $${paramIndex++}`);
              updateFields.push(`position_y = $${paramIndex++}`);
              updateFields.push(`position_z = $${paramIndex++}`);
              values.push(pos.x, pos.y, pos.z);
              break;
            case 'drops':
              updateFields.push(`drops = $${paramIndex++}`);
              values.push(JSON.stringify(value));
              break;
            case 'lastHarvestedAt':
              updateFields.push(`last_harvested_at = $${paramIndex++}`);
              values.push(value);
              break;
            case 'regeneratesAt':
              updateFields.push(`regenerates_at = $${paramIndex++}`);
              values.push(value);
              break;
            case 'currentHarvestCount':
              updateFields.push(`current_harvest_count = $${paramIndex++}`);
              values.push(value);
              break;
            case 'maxHarvestCount':
              updateFields.push(`max_harvest_count = $${paramIndex++}`);
              values.push(value);
              break;
            case 'regenerationTime':
              updateFields.push(`regeneration_time = $${paramIndex++}`);
              values.push(value);
              break;
            case 'state':
              updateFields.push(`state = $${paramIndex++}`);
              values.push(value);
              break;
            case 'level':
              updateFields.push(`level = $${paramIndex++}`);
              values.push(value);
              break;
            case 'type':
              updateFields.push(`type = $${paramIndex++}`);
              values.push(value);
              break;
          }
        }
      });

      if (updateFields.length === 0) {
        return await this.findById(id);
      }

      updateFields.push(`updated_at = $${paramIndex++}`);
      values.push(new Date());
      values.push(id);

      const query = `
        UPDATE resource_nodes 
        SET ${updateFields.join(', ')}
        WHERE id = $${paramIndex}
        RETURNING *
      `;

      const result = await this.executeQuery(query, values);
      
      if (result.length === 0) {
        return null;
      }

      return this.mapRowToResourceNode(result[0]);
    } catch (error) {
      console.error('Error updating resource node:', error);
      throw error;
    }
  }

  /**
   * Delete a resource node
   */
  async delete(id: string): Promise<boolean> {
    try {
      const query = `DELETE FROM resource_nodes WHERE id = $1`;
      const result = await this.executeQuery(query, [id]);
      return result.length > 0;
    } catch (error) {
      console.error('Error deleting resource node:', error);
      throw error;
    }
  }

  /**
   * Find nodes that are ready for regeneration
   */
  async findRegeneratingNodes(): Promise<ResourceNode[]> {
    try {
      const query = `
        SELECT * FROM resource_nodes 
        WHERE state = $1 AND regenerates_at <= $2
      `;
      
      const result = await this.executeQuery(query, [
        ResourceNodeState.DEPLETED,
        new Date()
      ]);
      
      return result.map(row => this.mapRowToResourceNode(row));
    } catch (error) {
      console.error('Error finding regenerating nodes:', error);
      throw error;
    }
  }

  /**
   * Find resource nodes by type for an island
   */
  async findNodesByType(islandId: string, type: ResourceNodeType): Promise<ResourceNode[]> {
    try {
      const query = `
        SELECT * FROM resource_nodes 
        WHERE island_id = $1 AND type = $2
        ORDER BY created_at DESC
      `;
      
      const result = await this.executeQuery(query, [islandId, type]);
      
      return result.map(row => this.mapRowToResourceNode(row));
    } catch (error) {
      console.error('Error finding resource nodes by type:', error);
      throw error;
    }
  }

  /**
   * Find all resource nodes
   */
  async findAll(): Promise<ResourceNode[]> {
    try {
      const query = `SELECT * FROM resource_nodes ORDER BY created_at DESC`;
      const result = await this.executeQuery(query);
      return result.map(row => this.mapRowToResourceNode(row));
    } catch (error) {
      console.error('Error finding all resource nodes:', error);
      throw error;
    }
  }

  /**
   * Map database row to ResourceNode object
   */
  private mapRowToResourceNode(row: any): ResourceNode {
    return {
      id: row.id,
      type: row.type as ResourceNodeType,
      position: {
        x: row.position_x,
        y: row.position_y,
        z: row.position_z
      },
      islandId: row.island_id,
      state: row.state as ResourceNodeState,
      maxHarvestCount: row.max_harvest_count,
      currentHarvestCount: row.current_harvest_count,
      regenerationTime: row.regeneration_time,
      lastHarvestedAt: row.last_harvested_at,
      regeneratesAt: row.regenerates_at,
      level: row.level,
      drops: JSON.parse(row.drops || '[]')
    };
  }
}