import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ItemRepository, MarketListing, Transaction } from '../../repositories/ItemRepository';
import { Item, ItemCategory, ItemRarity } from '../../models/Item';
import { database } from '../../shared/database';

// Mock the database
vi.mock('../../shared/database', () => ({
  database: {
    query: vi.fn(),
    transaction: vi.fn()
  }
}));

describe('ItemRepository', () => {
  let itemRepository: ItemRepository;
  let mockItem: Item;
  let mockMarketListing: MarketListing;
  let mockTransaction: Transaction;

  beforeEach(() => {
    itemRepository = new ItemRepository();
    
    mockItem = {
      id: 'item_123',
      name: 'Iron Sword',
      description: 'A sturdy iron sword',
      category: ItemCategory.WEAPON,
      rarity: ItemRarity.COMMON,
      maxStackSize: 1,
      baseStats: {
        damage: 10,
      }
    };

    mockMarketListing = {
      id: 'listing_123',
      sellerId: 'player_123',
      item: {
        itemId: 'item_123',
        quantity: 1
      },
      price: 100,
      listedAt: new Date(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours from now
      category: ItemCategory.WEAPON,
      isActive: true
    };

    mockTransaction = {
      id: 'transaction_123',
      buyerId: 'buyer_123',
      sellerId: 'seller_123',
      item: {
        itemId: 'item_123',
        quantity: 1
      },
      price: 100,
      timestamp: new Date(),
      marketFee: 5
    };

    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('Item CRUD Operations', () => {
    describe('findById', () => {
      it('should return an item when found', async () => {
        const mockRows = [
          {
            id: 'item_123',
            name: 'Iron Sword',
            description: 'A sturdy iron sword',
            category: 'weapon',
            rarity: 'common',
            max_stack_size: 1,
            base_stats: '{"damage":10,"durability":100}',
            crafting_recipe: null
          }
        ];

        (database.query as any).mockResolvedValue(mockRows);

        const result = await itemRepository.findById('item_123');

        expect(result).toBeDefined();
        expect(result?.id).toBe('item_123');
        expect(result?.name).toBe('Iron Sword');
        expect(result?.baseStats?.damage).toBe(10);
      });

      it('should return null when item not found', async () => {
        (database.query as any).mockResolvedValue([]);

        const result = await itemRepository.findById('nonexistent');

        expect(result).toBeNull();
      });
    });

    describe('findByCategory', () => {
      it('should return items by category', async () => {
        const mockRows = [
          {
            id: 'item_123',
            name: 'Iron Sword',
            description: 'A sturdy iron sword',
            category: 'weapon',
            rarity: 'common',
            max_stack_size: 1,
            base_stats: null,
            crafting_recipe: null
          }
        ];

        (database.query as any).mockResolvedValue(mockRows);

        const result = await itemRepository.findByCategory(ItemCategory.WEAPON);

        expect(result).toHaveLength(1);
        expect(result[0]?.category).toBe(ItemCategory.WEAPON);
      });
    });

    describe('findByRarity', () => {
      it('should return items by rarity', async () => {
        const mockRows = [
          {
            id: 'item_123',
            name: 'Iron Sword',
            description: 'A sturdy iron sword',
            category: 'weapon',
            rarity: 'common',
            max_stack_size: 1,
            base_stats: null,
            crafting_recipe: null
          }
        ];

        (database.query as any).mockResolvedValue(mockRows);

        const result = await itemRepository.findByRarity(ItemRarity.COMMON);

        expect(result).toHaveLength(1);
        expect(result[0]?.rarity).toBe(ItemRarity.COMMON);
      });
    });

    describe('create', () => {
      it('should create a new item successfully', async () => {
        const mockRows = [
          {
            id: 'item_123',
            name: 'Iron Sword',
            description: 'A sturdy iron sword',
            category: 'weapon',
            rarity: 'common',
            max_stack_size: 1,
            base_stats: '{"damage":10,"durability":100}',
            crafting_recipe: null
          }
        ];

        (database.query as any).mockResolvedValue(mockRows);

        const itemData = { ...mockItem };
        delete (itemData as any).id;

        const result = await itemRepository.create(itemData);

        expect(result).toBeDefined();
        expect(result.name).toBe('Iron Sword');
      });
    });

    describe('update', () => {
      it('should update item successfully', async () => {
        const mockRows = [
          {
            id: 'item_123',
            name: 'Steel Sword',
            description: 'A sturdy iron sword',
            category: 'weapon',
            rarity: 'common',
            max_stack_size: 1,
            base_stats: '{"damage":15,"durability":100}',
            crafting_recipe: null
          }
        ];

        (database.query as any).mockResolvedValue(mockRows);

        const updates = { name: 'Steel Sword', baseStats: { damage: 15, durability: 100 } };
        const result = await itemRepository.update('item_123', updates);

        expect(result).toBeDefined();
        expect(result?.name).toBe('Steel Sword');
      });

      it('should return existing item when no updates provided', async () => {
        const mockFindById = vi.spyOn(itemRepository, 'findById').mockResolvedValue(mockItem);

        const result = await itemRepository.update('item_123', {});

        expect(result).toBeDefined();
        expect(mockFindById).toHaveBeenCalledWith('item_123');
      });
    });

    describe('delete', () => {
      it('should delete item successfully', async () => {
        (database.query as any).mockResolvedValue([{ id: 'item_123' }]);

        const result = await itemRepository.delete('item_123');

        expect(result).toBe(true);
      });

      it('should return false when item not found', async () => {
        (database.query as any).mockResolvedValue([]);

        const result = await itemRepository.delete('nonexistent');

        expect(result).toBe(false);
      });
    });
  });

  describe('Market Listing Operations', () => {
    describe('createMarketListing', () => {
      it('should create a market listing successfully', async () => {
        const mockRows = [
          {
            id: 'listing_123',
            seller_id: 'player_123',
            item_id: 'item_123',
            item_quantity: 1,
            item_metadata: null,
            price: 100,
            listed_at: '2023-01-01T00:00:00.000Z',
            expires_at: '2023-01-02T00:00:00.000Z',
            category: 'weapon',
            is_active: true
          }
        ];

        (database.query as any).mockResolvedValue(mockRows);

        const listingData = { ...mockMarketListing };
        delete (listingData as any).id;

        const result = await itemRepository.createMarketListing(listingData);

        expect(result).toBeDefined();
        expect(result.sellerId).toBe('player_123');
        expect(result.price).toBe(100);
      });
    });

    describe('getMarketListing', () => {
      it('should return a market listing when found', async () => {
        const mockRows = [
          {
            id: 'listing_123',
            seller_id: 'player_123',
            item_id: 'item_123',
            item_quantity: 1,
            item_metadata: null,
            price: 100,
            listed_at: '2023-01-01T00:00:00.000Z',
            expires_at: '2023-01-02T00:00:00.000Z',
            category: 'weapon',
            is_active: true
          }
        ];

        (database.query as any).mockResolvedValue(mockRows);

        const result = await itemRepository.getMarketListing('listing_123');

        expect(result).toBeDefined();
        expect(result?.id).toBe('listing_123');
      });

      it('should return null when listing not found', async () => {
        (database.query as any).mockResolvedValue([]);

        const result = await itemRepository.getMarketListing('nonexistent');

        expect(result).toBeNull();
      });
    });

    describe('searchMarketListings', () => {
      it('should search market listings with filters', async () => {
        const mockRows = [
          {
            id: 'listing_123',
            seller_id: 'player_123',
            item_id: 'item_123',
            item_quantity: 1,
            item_metadata: null,
            price: 100,
            listed_at: '2023-01-01T00:00:00.000Z',
            expires_at: '2023-01-02T00:00:00.000Z',
            category: 'weapon',
            is_active: true
          }
        ];

        (database.query as any).mockResolvedValue(mockRows);

        const result = await itemRepository.searchMarketListings({
          category: ItemCategory.WEAPON,
          minPrice: 50,
          maxPrice: 150,
          limit: 10
        });

        expect(result).toHaveLength(1);
        expect(result[0]?.category).toBe(ItemCategory.WEAPON);
        expect(database.query).toHaveBeenCalledWith(
          expect.stringContaining('category = $1'),
          expect.arrayContaining([ItemCategory.WEAPON, 50, 150, 10])
        );
      });

      it('should search without filters', async () => {
        (database.query as any).mockResolvedValue([]);

        const result = await itemRepository.searchMarketListings();

        expect(result).toHaveLength(0);
        expect(database.query).toHaveBeenCalledWith(
          expect.stringContaining('is_active = true AND expires_at > NOW()'),
          []
        );
      });
    });

    describe('updateMarketListing', () => {
      it('should update market listing successfully', async () => {
        const mockRows = [
          {
            id: 'listing_123',
            seller_id: 'player_123',
            item_id: 'item_123',
            item_quantity: 1,
            item_metadata: null,
            price: 150,
            listed_at: '2023-01-01T00:00:00.000Z',
            expires_at: '2023-01-02T00:00:00.000Z',
            category: 'weapon',
            is_active: true
          }
        ];

        (database.query as any).mockResolvedValue(mockRows);

        const updates = { price: 150 };
        const result = await itemRepository.updateMarketListing('listing_123', updates);

        expect(result).toBeDefined();
        expect(result?.price).toBe(150);
      });
    });

    describe('deleteMarketListing', () => {
      it('should delete market listing successfully', async () => {
        (database.query as any).mockResolvedValue([{ id: 'listing_123' }]);

        const result = await itemRepository.deleteMarketListing('listing_123');

        expect(result).toBe(true);
      });
    });

    describe('getPlayerListings', () => {
      it('should get active player listings', async () => {
        const mockRows = [
          {
            id: 'listing_123',
            seller_id: 'player_123',
            item_id: 'item_123',
            item_quantity: 1,
            item_metadata: null,
            price: 100,
            listed_at: '2023-01-01T00:00:00.000Z',
            expires_at: '2023-01-02T00:00:00.000Z',
            category: 'weapon',
            is_active: true
          }
        ];

        (database.query as any).mockResolvedValue(mockRows);

        const result = await itemRepository.getPlayerListings('player_123', true);

        expect(result).toHaveLength(1);
        expect(result[0]?.sellerId).toBe('player_123');
        expect(database.query).toHaveBeenCalledWith(
          expect.stringContaining('is_active = true AND expires_at > NOW()'),
          ['player_123']
        );
      });

      it('should get all player listings including inactive', async () => {
        (database.query as any).mockResolvedValue([]);

        await itemRepository.getPlayerListings('player_123', false);

        expect(database.query).toHaveBeenCalledWith(
          expect.not.stringContaining('is_active = true'),
          ['player_123']
        );
      });
    });

    describe('expireListings', () => {
      it('should expire old listings', async () => {
        (database.query as any).mockResolvedValue([{ id: 'listing_1' }, { id: 'listing_2' }]);

        const result = await itemRepository.expireListings();

        expect(result).toBe(2);
        expect(database.query).toHaveBeenCalledWith(
          expect.stringMatching(/UPDATE\s+market_listings/i),
          undefined
        );
      });
    });
  });

  describe('Transaction Operations', () => {
    describe('createTransaction', () => {
      it('should create a transaction successfully', async () => {
        const mockRows = [
          {
            id: 'transaction_123',
            buyer_id: 'buyer_123',
            seller_id: 'seller_123',
            item_id: 'item_123',
            item_quantity: 1,
            item_metadata: null,
            price: 100,
            timestamp: '2023-01-01T00:00:00.000Z',
            market_fee: 5
          }
        ];

        (database.query as any).mockResolvedValue(mockRows);

        const transactionData = { ...mockTransaction };
        delete (transactionData as any).id;

        const result = await itemRepository.createTransaction(transactionData);

        expect(result).toBeDefined();
        expect(result.buyerId).toBe('buyer_123');
        expect(result.sellerId).toBe('seller_123');
        expect(result.price).toBe(100);
      });
    });

    describe('getTransaction', () => {
      it('should return a transaction when found', async () => {
        const mockRows = [
          {
            id: 'transaction_123',
            buyer_id: 'buyer_123',
            seller_id: 'seller_123',
            item_id: 'item_123',
            item_quantity: 1,
            item_metadata: null,
            price: 100,
            timestamp: '2023-01-01T00:00:00.000Z',
            market_fee: 5
          }
        ];

        (database.query as any).mockResolvedValue(mockRows);

        const result = await itemRepository.getTransaction('transaction_123');

        expect(result).toBeDefined();
        expect(result?.id).toBe('transaction_123');
      });

      it('should return null when transaction not found', async () => {
        (database.query as any).mockResolvedValue([]);

        const result = await itemRepository.getTransaction('nonexistent');

        expect(result).toBeNull();
      });
    });

    describe('getPlayerTransactions', () => {
      it('should get player transactions', async () => {
        const mockRows = [
          {
            id: 'transaction_123',
            buyer_id: 'player_123',
            seller_id: 'seller_123',
            item_id: 'item_123',
            item_quantity: 1,
            item_metadata: null,
            price: 100,
            timestamp: '2023-01-01T00:00:00.000Z',
            market_fee: 5
          }
        ];

        (database.query as any).mockResolvedValue(mockRows);

        const result = await itemRepository.getPlayerTransactions('player_123', 25);

        expect(result).toHaveLength(1);
        expect(result[0]?.buyerId).toBe('player_123');
        expect(database.query).toHaveBeenCalledWith(
          expect.stringContaining('buyer_id = $1 OR seller_id = $1'),
          ['player_123', 25]
        );
      });
    });

    describe('getItemPriceHistory', () => {
      it('should get price history for an item', async () => {
        const mockRows = [
          {
            price: 100,
            timestamp: '2023-01-01T00:00:00.000Z',
            volume: 1
          },
          {
            price: 120,
            timestamp: '2023-01-02T00:00:00.000Z',
            volume: 2
          }
        ];

        (database.query as any).mockResolvedValue(mockRows);

        const result = await itemRepository.getItemPriceHistory('item_123', 7);

        expect(result.itemId).toBe('item_123');
        expect(result.averagePrice).toBe(110); // (100 + 120) / 2
        expect(result.minPrice).toBe(100);
        expect(result.maxPrice).toBe(120);
        expect(result.totalVolume).toBe(3); // 1 + 2
        expect(result.pricePoints).toHaveLength(2);
      });

      it('should return empty history when no transactions found', async () => {
        (database.query as any).mockResolvedValue([]);

        const result = await itemRepository.getItemPriceHistory('item_123', 7);

        expect(result.itemId).toBe('item_123');
        expect(result.averagePrice).toBe(0);
        expect(result.minPrice).toBe(0);
        expect(result.maxPrice).toBe(0);
        expect(result.totalVolume).toBe(0);
        expect(result.pricePoints).toHaveLength(0);
      });
    });

    describe('getMarketStatistics', () => {
      it('should get market statistics', async () => {
        const listingsResult = [{ total_listings: '10', active_listings: '5' }];
        const transactionsResult = [{ total_transactions: '100', total_volume: '500', average_price: '75.5' }];

        (database.query as any)
          .mockResolvedValueOnce(listingsResult)
          .mockResolvedValueOnce(transactionsResult);

        const result = await itemRepository.getMarketStatistics();

        expect(result.totalListings).toBe(10);
        expect(result.activeListings).toBe(5);
        expect(result.totalTransactions).toBe(100);
        expect(result.totalVolume).toBe(500);
        expect(result.averagePrice).toBe(75.5);
      });

      it('should handle null statistics gracefully', async () => {
        const listingsResult = [{ total_listings: null, active_listings: null }];
        const transactionsResult = [{ total_transactions: null, total_volume: null, average_price: null }];

        (database.query as any)
          .mockResolvedValueOnce(listingsResult)
          .mockResolvedValueOnce(transactionsResult);

        const result = await itemRepository.getMarketStatistics();

        expect(result.totalListings).toBe(0);
        expect(result.activeListings).toBe(0);
        expect(result.totalTransactions).toBe(0);
        expect(result.totalVolume).toBe(0);
        expect(result.averagePrice).toBe(0);
      });
    });
  });
});