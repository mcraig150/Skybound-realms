import { Pool } from 'pg';
import { createClient } from 'redis';

export interface TestDataSet {
  players: any[];
  islands: any[];
  items: any[];
  guilds: any[];
  marketListings: any[];
  transactions: any[];
}

export class TestDataGenerator {
  private dbPool: Pool;
  private redisClient: any;

  constructor(dbPool: Pool, redisClient: any) {
    this.dbPool = dbPool;
    this.redisClient = redisClient;
  }

  async generateCompleteDataSet(playerCount: number = 100): Promise<TestDataSet> {
    console.log(`Generating test data set with ${playerCount} players...`);
    
    const players = await this.generatePlayers(playerCount);
    const islands = await this.generateIslands(players);
    const items = await this.generateItems(200);
    const guilds = await this.generateGuilds(Math.floor(playerCount / 10));
    const marketListings = await this.generateMarketListings(players, items, 50);
    const transactions = await this.generateTransactions(players, marketListings, 100);

    return {
      players,
      islands,
      items,
      guilds,
      marketListings,
      transactions
    };
  }

  private async generatePlayers(count: number): Promise<any[]> {
    const players: any[] = [];
    const skillTypes = ['mining', 'farming', 'combat', 'crafting', 'building'];
    
    for (let i = 0; i < count; i++) {
      const player = {
        id: `test-player-${i}-${Date.now()}`,
        username: `testuser${i}`,
        email: `test${i}@example.com`,
        passwordHash: '$2b$10$hashedpassword', // Pre-hashed test password
        skills: {},
        inventory: [],
        currency: {
          coins: Math.floor(Math.random() * 10000) + 1000
        },
        level: Math.floor(Math.random() * 50) + 1,
        experience: Math.floor(Math.random() * 100000),
        lastLogin: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000), // Within last week
        createdAt: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000), // Within last month
        settings: {
          notifications: true,
          publicProfile: Math.random() > 0.5,
          allowFriendRequests: true
        }
      };

      // Generate skills
      skillTypes.forEach(skill => {
        player.skills[skill] = {
          level: Math.floor(Math.random() * 99) + 1,
          experience: Math.floor(Math.random() * 10000),
          prestige: Math.floor(Math.random() * 3)
        };
      });

      // Generate inventory items
      const inventorySize = Math.floor(Math.random() * 20) + 5;
      for (let j = 0; j < inventorySize; j++) {
        player.inventory.push({
          itemId: `item-${Math.floor(Math.random() * 100)}`,
          quantity: Math.floor(Math.random() * 64) + 1,
          slot: j,
          metadata: {
            rarity: ['common', 'uncommon', 'rare', 'epic', 'legendary'][Math.floor(Math.random() * 5)],
            durability: Math.floor(Math.random() * 100)
          }
        });
      }

      players.push(player);
    }

    // Insert players into database
    for (const player of players) {
      await this.dbPool.query(`
        INSERT INTO players (id, username, email, password_hash, skills, inventory, currency, level, experience, last_login, created_at, settings)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        ON CONFLICT (id) DO NOTHING
      `, [
        player.id,
        player.username,
        player.email,
        player.passwordHash,
        JSON.stringify(player.skills),
        JSON.stringify(player.inventory),
        JSON.stringify(player.currency),
        player.level,
        player.experience,
        player.lastLogin,
        player.createdAt,
        JSON.stringify(player.settings)
      ]);
    }

    console.log(`Generated ${players.length} players`);
    return players;
  }

  private async generateIslands(players: any[]): Promise<any[]> {
    const islands: any[] = [];
    
    for (const player of players) {
      const island = {
        id: `island-${player.id}`,
        ownerId: player.id,
        name: `${player.username}'s Island`,
        expansionLevel: Math.floor(Math.random() * 5) + 1,
        size: { x: 64, y: 64, z: 64 },
        chunks: this.generateChunkData(),
        permissions: {
          public: Math.random() > 0.7,
          friends: Math.random() > 0.3,
          guild: Math.random() > 0.5
        },
        visitCount: Math.floor(Math.random() * 100),
        createdAt: player.createdAt,
        lastModified: new Date(Date.now() - Math.random() * 24 * 60 * 60 * 1000)
      };

      islands.push(island);

      // Insert island into database
      await this.dbPool.query(`
        INSERT INTO islands (id, owner_id, name, expansion_level, size, permissions, visit_count, created_at, last_modified)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (id) DO NOTHING
      `, [
        island.id,
        island.ownerId,
        island.name,
        island.expansionLevel,
        JSON.stringify(island.size),
        JSON.stringify(island.permissions),
        island.visitCount,
        island.createdAt,
        island.lastModified
      ]);

      // Insert chunk data
      for (const chunk of island.chunks) {
        await this.dbPool.query(`
          INSERT INTO island_chunks (island_id, chunk_x, chunk_y, chunk_z, voxel_data, entities, last_modified)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          ON CONFLICT (island_id, chunk_x, chunk_y, chunk_z) DO NOTHING
        `, [
          island.id,
          chunk.x,
          chunk.y,
          chunk.z,
          chunk.voxelData,
          JSON.stringify(chunk.entities),
          chunk.lastModified
        ]);
      }
    }

    console.log(`Generated ${islands.length} islands`);
    return islands;
  }

  private generateChunkData(): any[] {
    const chunks: any[] = [];
    const chunkCount = Math.floor(Math.random() * 10) + 5;
    
    for (let i = 0; i < chunkCount; i++) {
      chunks.push({
        x: Math.floor(Math.random() * 8),
        y: 0,
        z: Math.floor(Math.random() * 8),
        voxelData: Buffer.from(new Array(4096).fill(0).map(() => Math.floor(Math.random() * 10))), // 16x16x16 chunk
        entities: [],
        lastModified: new Date(Date.now() - Math.random() * 24 * 60 * 60 * 1000)
      });
    }
    
    return chunks;
  }

  private async generateItems(count: number): Promise<any[]> {
    const items: any[] = [];
    const itemTypes = ['resource', 'tool', 'weapon', 'armor', 'consumable', 'building'];
    const rarities = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'divine'];
    
    for (let i = 0; i < count; i++) {
      const item = {
        id: `item-${i}`,
        name: `Test Item ${i}`,
        description: `A test item for automated testing purposes`,
        type: itemTypes[Math.floor(Math.random() * itemTypes.length)],
        rarity: rarities[Math.floor(Math.random() * rarities.length)],
        stackSize: Math.floor(Math.random() * 64) + 1,
        value: Math.floor(Math.random() * 1000) + 10,
        stats: {
          damage: Math.floor(Math.random() * 100),
          defense: Math.floor(Math.random() * 50),
          durability: Math.floor(Math.random() * 1000) + 100
        },
        craftingRecipe: {
          materials: [
            { itemId: 'wood', quantity: Math.floor(Math.random() * 5) + 1 },
            { itemId: 'stone', quantity: Math.floor(Math.random() * 3) + 1 }
          ],
          skillRequired: 'crafting',
          levelRequired: Math.floor(Math.random() * 50) + 1
        },
        createdAt: new Date()
      };

      items.push(item);

      // Insert item into database
      await this.dbPool.query(`
        INSERT INTO items (id, name, description, type, rarity, stack_size, value, stats, crafting_recipe, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (id) DO NOTHING
      `, [
        item.id,
        item.name,
        item.description,
        item.type,
        item.rarity,
        item.stackSize,
        item.value,
        JSON.stringify(item.stats),
        JSON.stringify(item.craftingRecipe),
        item.createdAt
      ]);
    }

    console.log(`Generated ${items.length} items`);
    return items;
  }

  private async generateGuilds(count: number): Promise<any[]> {
    const guilds: any[] = [];
    
    for (let i = 0; i < count; i++) {
      const guild = {
        id: `guild-${i}-${Date.now()}`,
        name: `Test Guild ${i}`,
        description: `A test guild for automated testing`,
        leaderId: `test-player-${i * 10}-${Date.now()}`, // Assign to every 10th player
        memberLimit: Math.floor(Math.random() * 50) + 20,
        level: Math.floor(Math.random() * 20) + 1,
        experience: Math.floor(Math.random() * 100000),
        perks: {
          experienceBonus: Math.floor(Math.random() * 20) + 5,
          resourceBonus: Math.floor(Math.random() * 15) + 5,
          memberSlots: Math.floor(Math.random() * 10) + 5
        },
        treasury: {
          coins: Math.floor(Math.random() * 100000) + 10000
        },
        createdAt: new Date(Date.now() - Math.random() * 60 * 24 * 60 * 60 * 1000), // Within last 60 days
        settings: {
          public: Math.random() > 0.5,
          autoAccept: Math.random() > 0.7,
          requireApplication: Math.random() > 0.6
        }
      };

      guilds.push(guild);

      // Insert guild into database
      await this.dbPool.query(`
        INSERT INTO guilds (id, name, description, leader_id, member_limit, level, experience, perks, treasury, created_at, settings)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT (id) DO NOTHING
      `, [
        guild.id,
        guild.name,
        guild.description,
        guild.leaderId,
        guild.memberLimit,
        guild.level,
        guild.experience,
        JSON.stringify(guild.perks),
        JSON.stringify(guild.treasury),
        guild.createdAt,
        JSON.stringify(guild.settings)
      ]);
    }

    console.log(`Generated ${guilds.length} guilds`);
    return guilds;
  }

  private async generateMarketListings(players: any[], items: any[], count: number): Promise<any[]> {
    const listings: any[] = [];
    
    for (let i = 0; i < count; i++) {
      const seller = players[Math.floor(Math.random() * players.length)];
      const item = items[Math.floor(Math.random() * items.length)];
      
      const listing = {
        id: `listing-${i}-${Date.now()}`,
        sellerId: seller.id,
        itemId: item.id,
        quantity: Math.floor(Math.random() * 20) + 1,
        pricePerUnit: Math.floor(Math.random() * 100) + 5,
        totalPrice: 0, // Will be calculated
        duration: Math.floor(Math.random() * 168) + 24, // 1-7 days in hours
        listedAt: new Date(Date.now() - Math.random() * 24 * 60 * 60 * 1000),
        expiresAt: new Date(),
        status: 'active',
        category: item.type
      };

      listing.totalPrice = listing.quantity * listing.pricePerUnit;
      listing.expiresAt = new Date(listing.listedAt.getTime() + listing.duration * 60 * 60 * 1000);

      listings.push(listing);

      // Insert listing into database
      await this.dbPool.query(`
        INSERT INTO market_listings (id, seller_id, item_id, quantity, price_per_unit, total_price, duration, listed_at, expires_at, status, category)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT (id) DO NOTHING
      `, [
        listing.id,
        listing.sellerId,
        listing.itemId,
        listing.quantity,
        listing.pricePerUnit,
        listing.totalPrice,
        listing.duration,
        listing.listedAt,
        listing.expiresAt,
        listing.status,
        listing.category
      ]);
    }

    console.log(`Generated ${listings.length} market listings`);
    return listings;
  }

  private async generateTransactions(players: any[], listings: any[], count: number): Promise<any[]> {
    const transactions: any[] = [];
    
    for (let i = 0; i < count; i++) {
      const buyer = players[Math.floor(Math.random() * players.length)];
      const listing = listings[Math.floor(Math.random() * listings.length)];
      
      const transaction = {
        id: `transaction-${i}-${Date.now()}`,
        buyerId: buyer.id,
        sellerId: listing.sellerId,
        listingId: listing.id,
        itemId: listing.itemId,
        quantity: Math.min(Math.floor(Math.random() * listing.quantity) + 1, listing.quantity),
        pricePerUnit: listing.pricePerUnit,
        totalAmount: 0, // Will be calculated
        marketFee: 0, // Will be calculated
        timestamp: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000),
        status: 'completed'
      };

      transaction.totalAmount = transaction.quantity * transaction.pricePerUnit;
      transaction.marketFee = Math.floor(transaction.totalAmount * 0.05); // 5% market fee

      transactions.push(transaction);

      // Insert transaction into database
      await this.dbPool.query(`
        INSERT INTO transactions (id, buyer_id, seller_id, listing_id, item_id, quantity, price_per_unit, total_amount, market_fee, timestamp, status)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT (id) DO NOTHING
      `, [
        transaction.id,
        transaction.buyerId,
        transaction.sellerId,
        transaction.listingId,
        transaction.itemId,
        transaction.quantity,
        transaction.pricePerUnit,
        transaction.totalAmount,
        transaction.marketFee,
        transaction.timestamp,
        transaction.status
      ]);
    }

    console.log(`Generated ${transactions.length} transactions`);
    return transactions;
  }

  async cleanupTestData(): Promise<void> {
    console.log('Cleaning up test data...');
    
    const tables = [
      'transactions',
      'market_listings',
      'guild_members',
      'guilds',
      'island_chunks',
      'islands',
      'items',
      'players'
    ];

    for (const table of tables) {
      await this.dbPool.query(`DELETE FROM ${table} WHERE id LIKE 'test-%' OR id LIKE 'guild-%' OR id LIKE 'item-%' OR id LIKE 'listing-%' OR id LIKE 'transaction-%' OR id LIKE 'island-%'`);
    }

    // Clear Redis cache
    await this.redisClient.flushDb();
    
    console.log('Test data cleanup completed');
  }

  async seedDatabase(): Promise<void> {
    console.log('Seeding database with test data...');
    
    // Create a moderate dataset for testing
    const dataSet = await this.generateCompleteDataSet(50);
    
    // Cache some frequently accessed data in Redis
    for (const player of dataSet.players.slice(0, 10)) {
      await this.redisClient.setEx(`player:${player.id}`, 3600, JSON.stringify(player));
    }

    for (const listing of dataSet.marketListings.slice(0, 20)) {
      await this.redisClient.setEx(`listing:${listing.id}`, 1800, JSON.stringify(listing));
    }
    
    console.log('Database seeding completed');
  }
}