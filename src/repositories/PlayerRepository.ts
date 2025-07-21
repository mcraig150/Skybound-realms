import { Player, PlayerFactory } from '../models/Player';
import { AbstractRepository } from './BaseRepository';
import { SkillType, SkillData } from '../models/Skill';
import { ItemStack } from '../models/Item';

export interface PlayerSearchOptions {
  username?: string;
  guildId?: string;
  limit?: number;
  offset?: number;
}

export class PlayerRepository extends AbstractRepository<Player, string> {
  protected tableName = 'players';

  async findById(id: string): Promise<Player | null> {
    const query = `
      SELECT p.*, 
             ps.skill_type, ps.experience, ps.level, ps.prestige, ps.unlocked_perks,
             pi.item_id, pi.quantity, pi.metadata as item_metadata, pi.slot_index
      FROM players p
      LEFT JOIN player_skills ps ON p.id = ps.player_id
      LEFT JOIN player_inventory pi ON p.id = pi.player_id
      WHERE p.id = $1
    `;
    
    const rows = await this.executeQuery(query, [id]);
    
    if (rows.length === 0) {
      return null;
    }

    return this.mapRowsToPlayer(rows);
  }

  async findByUsername(username: string): Promise<Player | null> {
    const query = `
      SELECT p.*, 
             ps.skill_type, ps.experience, ps.level, ps.prestige, ps.unlocked_perks,
             pi.item_id, pi.quantity, pi.metadata as item_metadata, pi.slot_index
      FROM players p
      LEFT JOIN player_skills ps ON p.id = ps.player_id
      LEFT JOIN player_inventory pi ON p.id = pi.player_id
      WHERE p.username = $1
    `;
    
    const rows = await this.executeQuery(query, [username]);
    
    if (rows.length === 0) {
      return null;
    }

    return this.mapRowsToPlayer(rows);
  }

  async findAll(): Promise<Player[]> {
    const query = `
      SELECT p.*, 
             ps.skill_type, ps.experience, ps.level, ps.prestige, ps.unlocked_perks,
             pi.item_id, pi.quantity, pi.metadata as item_metadata, pi.slot_index
      FROM players p
      LEFT JOIN player_skills ps ON p.id = ps.player_id
      LEFT JOIN player_inventory pi ON p.id = pi.player_id
      ORDER BY p.username
    `;
    
    const rows = await this.executeQuery(query);
    return this.groupRowsIntoPlayers(rows);
  }

  async search(options: PlayerSearchOptions): Promise<Player[]> {
    let query = `
      SELECT p.*, 
             ps.skill_type, ps.experience, ps.level, ps.prestige, ps.unlocked_perks,
             pi.item_id, pi.quantity, pi.metadata as item_metadata, pi.slot_index
      FROM players p
      LEFT JOIN player_skills ps ON p.id = ps.player_id
      LEFT JOIN player_inventory pi ON p.id = pi.player_id
      WHERE 1=1
    `;
    
    const params: any[] = [];
    let paramIndex = 1;

    if (options.username) {
      query += ` AND p.username ILIKE $${paramIndex}`;
      params.push(`%${options.username}%`);
      paramIndex++;
    }

    if (options.guildId) {
      query += ` AND p.guild_id = $${paramIndex}`;
      params.push(options.guildId);
      paramIndex++;
    }

    query += ` ORDER BY p.username`;

    if (options.limit) {
      query += ` LIMIT $${paramIndex}`;
      params.push(options.limit);
      paramIndex++;
    }

    if (options.offset) {
      query += ` OFFSET $${paramIndex}`;
      params.push(options.offset);
    }

    const rows = await this.executeQuery(query, params);
    return this.groupRowsIntoPlayers(rows);
  }

  async create(playerData: Omit<Player, 'id'>): Promise<Player> {
    return this.executeTransaction(async (client) => {
      // Insert main player record
      const playerInsert = {
        id: this.generateId(),
        username: playerData.username,
        island_id: playerData.islandId,
        guild_id: playerData.guildId || null,
        friends: JSON.stringify(playerData.friends),
        settings: JSON.stringify(playerData.settings),
        currency: JSON.stringify(playerData.currency),
        equipment: JSON.stringify(playerData.equipment),
        last_login: playerData.lastLogin,
        created_at: new Date(),
        updated_at: new Date()
      };

      const { query: playerQuery, params: playerParams } = this.buildInsertQuery('players', playerInsert);
      const playerResult = await client.query(playerQuery, playerParams);
      const playerId = playerResult.rows[0].id;

      // Insert skills
      for (const [skillType, skillData] of playerData.skills.entries()) {
        const skillInsert = {
          player_id: playerId,
          skill_type: skillType,
          experience: skillData.experience,
          level: skillData.level,
          prestige: skillData.prestige,
          unlocked_perks: JSON.stringify(skillData.unlockedPerks)
        };

        const { query: skillQuery, params: skillParams } = this.buildInsertQuery('player_skills', skillInsert);
        await client.query(skillQuery, skillParams);
      }

      // Insert inventory items
      for (let i = 0; i < playerData.inventory.length; i++) {
        const item = playerData.inventory[i];
        if (item) {
          const inventoryInsert = {
            player_id: playerId,
            item_id: item.itemId,
            quantity: item.quantity,
            metadata: item.metadata ? JSON.stringify(item.metadata) : null,
            slot_index: i
          };

          const { query: invQuery, params: invParams } = this.buildInsertQuery('player_inventory', inventoryInsert);
          await client.query(invQuery, invParams);
        }
      }

      // Insert minions
      for (const minion of playerData.minions) {
        const minionInsert = {
          player_id: playerId,
          minion_id: minion.id,
          minion_type: minion.type,
          position: JSON.stringify(minion.position),
          level: minion.level,
          efficiency: minion.efficiency,
          collected_resources: JSON.stringify(minion.collectedResources),
          is_active: minion.isActive,
          last_collection: minion.lastCollection
        };

        const { query: minionQuery, params: minionParams } = this.buildInsertQuery('player_minions', minionInsert);
        await client.query(minionQuery, minionParams);
      }

      return this.findById(playerId) as Promise<Player>;
    });
  }

  async update(id: string, updates: Partial<Player>): Promise<Player | null> {
    return this.executeTransaction(async (client) => {
      // Update main player record
      const playerUpdates: Record<string, any> = {};
      
      if (updates.username !== undefined) playerUpdates.username = updates.username;
      if (updates.islandId !== undefined) playerUpdates.island_id = updates.islandId;
      if (updates.guildId !== undefined) playerUpdates.guild_id = updates.guildId;
      if (updates.friends !== undefined) playerUpdates.friends = JSON.stringify(updates.friends);
      if (updates.settings !== undefined) playerUpdates.settings = JSON.stringify(updates.settings);
      if (updates.currency !== undefined) playerUpdates.currency = JSON.stringify(updates.currency);
      if (updates.equipment !== undefined) playerUpdates.equipment = JSON.stringify(updates.equipment);
      if (updates.lastLogin !== undefined) playerUpdates.last_login = updates.lastLogin;
      
      playerUpdates.updated_at = new Date();
      playerUpdates.id = id;

      if (Object.keys(playerUpdates).length > 2) { // More than just updated_at and id
        const { query: playerQuery, params: playerParams } = this.buildUpdateQuery('players', playerUpdates);
        await client.query(playerQuery, playerParams);
      }

      // Update skills if provided
      if (updates.skills) {
        await client.query('DELETE FROM player_skills WHERE player_id = $1', [id]);
        
        for (const [skillType, skillData] of updates.skills.entries()) {
          const skillInsert = {
            player_id: id,
            skill_type: skillType,
            experience: skillData.experience,
            level: skillData.level,
            prestige: skillData.prestige,
            unlocked_perks: JSON.stringify(skillData.unlockedPerks)
          };

          const { query: skillQuery, params: skillParams } = this.buildInsertQuery('player_skills', skillInsert);
          await client.query(skillQuery, skillParams);
        }
      }

      // Update inventory if provided
      if (updates.inventory) {
        await client.query('DELETE FROM player_inventory WHERE player_id = $1', [id]);
        
        for (let i = 0; i < updates.inventory.length; i++) {
          const item = updates.inventory[i];
          if (item) {
            const inventoryInsert = {
              player_id: id,
              item_id: item.itemId,
              quantity: item.quantity,
              metadata: item.metadata ? JSON.stringify(item.metadata) : null,
              slot_index: i
            };

            const { query: invQuery, params: invParams } = this.buildInsertQuery('player_inventory', inventoryInsert);
            await client.query(invQuery, invParams);
          }
        }
      }

      // Update minions if provided
      if (updates.minions) {
        await client.query('DELETE FROM player_minions WHERE player_id = $1', [id]);
        
        for (const minion of updates.minions) {
          const minionInsert = {
            player_id: id,
            minion_id: minion.id,
            minion_type: minion.type,
            position: JSON.stringify(minion.position),
            level: minion.level,
            efficiency: minion.efficiency,
            collected_resources: JSON.stringify(minion.collectedResources),
            is_active: minion.isActive,
            last_collection: minion.lastCollection
          };

          const { query: minionQuery, params: minionParams } = this.buildInsertQuery('player_minions', minionInsert);
          await client.query(minionQuery, minionParams);
        }
      }

      return this.findById(id);
    });
  }

  async delete(id: string): Promise<boolean> {
    return this.executeTransaction(async (client) => {
      // Delete related records first (foreign key constraints)
      await client.query('DELETE FROM player_skills WHERE player_id = $1', [id]);
      await client.query('DELETE FROM player_inventory WHERE player_id = $1', [id]);
      await client.query('DELETE FROM player_minions WHERE player_id = $1', [id]);
      
      // Delete main player record
      const result = await client.query('DELETE FROM players WHERE id = $1', [id]);
      return (result.rowCount ?? 0) > 0;
    });
  }

  async updateLastLogin(id: string): Promise<void> {
    const query = 'UPDATE players SET last_login = $1, updated_at = $2 WHERE id = $3';
    await this.executeQuery(query, [new Date(), new Date(), id]);
  }

  async getPlayersByGuild(guildId: string): Promise<Player[]> {
    return this.search({ guildId });
  }

  async getFriends(playerId: string): Promise<Player[]> {
    const player = await this.findById(playerId);
    if (!player || !player.friends.length) {
      return [];
    }

    const query = `
      SELECT p.*, 
             ps.skill_type, ps.experience, ps.level, ps.prestige, ps.unlocked_perks,
             pi.item_id, pi.quantity, pi.metadata as item_metadata, pi.slot_index
      FROM players p
      LEFT JOIN player_skills ps ON p.id = ps.player_id
      LEFT JOIN player_inventory pi ON p.id = pi.player_id
      WHERE p.id = ANY($1)
      ORDER BY p.username
    `;

    const rows = await this.executeQuery(query, [player.friends]);
    return this.groupRowsIntoPlayers(rows);
  }

  private mapRowsToPlayer(rows: any[]): Player {
    if (rows.length === 0) {
      throw new Error('No rows to map to player');
    }

    const firstRow = rows[0];
    const skills = new Map<SkillType, SkillData>();
    const inventory: ItemStack[] = [];

    // Group skills and inventory from joined rows
    const skillMap = new Map<string, any>();
    const inventoryMap = new Map<number, any>();

    for (const row of rows) {
      // Collect skills
      if (row.skill_type && !skillMap.has(row.skill_type)) {
        skillMap.set(row.skill_type, {
          experience: row.experience,
          level: row.level,
          prestige: row.prestige,
          unlockedPerks: row.unlocked_perks ? JSON.parse(row.unlocked_perks) : []
        });
      }

      // Collect inventory items
      if (row.item_id && row.slot_index !== null && !inventoryMap.has(row.slot_index)) {
        inventoryMap.set(row.slot_index, {
          itemId: row.item_id,
          quantity: row.quantity,
          metadata: row.item_metadata ? JSON.parse(row.item_metadata) : undefined
        });
      }
    }

    // Convert maps to proper structures
    skillMap.forEach((skillData, skillType) => {
      skills.set(skillType as SkillType, skillData);
    });

    // Sort inventory by slot index
    const sortedInventory = Array.from(inventoryMap.entries())
      .sort(([a], [b]) => a - b)
      .map(([, item]) => item);

    return {
      id: firstRow.id,
      username: firstRow.username,
      islandId: firstRow.island_id,
      skills,
      inventory: sortedInventory,
      equipment: firstRow.equipment ? JSON.parse(firstRow.equipment) : {},
      currency: firstRow.currency ? JSON.parse(firstRow.currency) : { coins: 0, dungeonTokens: 0, eventCurrency: 0, guildPoints: 0 },
      minions: [], // Minions would need separate query or join
      guildId: firstRow.guild_id,
      friends: firstRow.friends ? JSON.parse(firstRow.friends) : [],
      settings: firstRow.settings ? JSON.parse(firstRow.settings) : {
        chatEnabled: true,
        tradeRequestsEnabled: true,
        islandVisitsEnabled: true,
        notifications: {
          minionAlerts: true,
          tradeAlerts: true,
          guildAlerts: true,
          friendAlerts: true
        }
      },
      lastLogin: new Date(firstRow.last_login)
    };
  }

  private groupRowsIntoPlayers(rows: any[]): Player[] {
    const playerMap = new Map<string, any[]>();

    // Group rows by player ID
    for (const row of rows) {
      if (!playerMap.has(row.id)) {
        playerMap.set(row.id, []);
      }
      playerMap.get(row.id)!.push(row);
    }

    // Convert each group to a Player object
    return Array.from(playerMap.values()).map(playerRows => this.mapRowsToPlayer(playerRows));
  }

  private generateId(): string {
    return 'player_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }
}