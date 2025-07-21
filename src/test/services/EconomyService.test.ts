import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';
import { EconomyService, PriceTrend } from '../../services/EconomyService';
import { ItemRepository, MarketListing, PriceHistory } from '../../repositories/ItemRepository';
import { PlayerRepository } from '../../repositories/PlayerRepository';
import { ItemStack, ItemCategory, ItemRarity } from '../../models/Item';
import { Player } from '../../models/Player';

// Mock the repositories
vi.mock('../../repositories/ItemRepository');
vi.mock('../../repositories/PlayerRepository');

describe('EconomyService', () => {
  let economyService: EconomyService;
  let mockItemRepository: ItemRepository;
  let mockPlayerRepository: PlayerRepository;

  const mockPlayer: Player = {
    id: 'player1',
    username: 'testplayer',
    islandId: 'island1',
    skills: new Map(),
    inventory: [
      {
        itemId: 'sword_iron',
        quantity: 1,
        metadata: { rarity: ItemRarity.COMMON, enchantments: [] }
      },
      {
        itemId: 'wood_oak',
        quantity: 64,
        metadata: undefined
      }
    ],
    equipment: {},
    currency: { coins: 1000, dungeonTokens: 0, eventCurrency: 0, guildPoints: 0 },
    minions: [],
    friends: [],
    settings: {
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
    lastLogin: new Date()
  };

  const mockItem = {
    id: 'sword_iron',
    name: 'Iron Sword',
    description: 'A sturdy iron sword',
    category: ItemCategory.WEAPON,
    rarity: ItemRarity.COMMON,
    maxStackSize: 1,
    baseStats: { damage: 10 }
  };

  const mockListing: MarketListing = {
    id: 'listing1',
    sellerId: 'seller1', // Changed from 'player1' to 'seller1'
    item: {
      itemId: 'sword_iron',
      quantity: 1,
      metadata: { rarity: ItemRarity.COMMON, enchantments: [] }
    },
    price: 100,
    listedAt: new Date(),
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    category: ItemCategory.WEAPON,
    isActive: true
  };

  beforeEach(() => {
    vi.clearAllMocks();
    
    mockItemRepository = new ItemRepository();
    mockPlayerRepository = new PlayerRepository();
    economyService = new EconomyService(mockItemRepository, mockPlayerRepository);

    // Setup default mocks
    (mockPlayerRepository.findById as Mock).mockResolvedValue(mockPlayer);
    (mockItemRepository.findById as Mock).mockResolvedValue(mockItem);
  });

  describe('listItem', () => {
    it('should successfully list an item', async () => {
      const itemToList: ItemStack = {
        itemId: 'sword_iron',
        quantity: 1,
        metadata: { rarity: ItemRarity.COMMON, enchantments: [] }
      };

      (mockItemRepository.createMarketListing as Mock).mockResolvedValue({
        ...mockListing,
        id: 'new_listing_id'
      });
      (mockPlayerRepository.update as Mock).mockResolvedValue(mockPlayer);

      const listingId = await economyService.listItem('player1', itemToList, 100);

      expect(listingId).toBe('new_listing_id');
      expect(mockItemRepository.createMarketListing).toHaveBeenCalledWith({
        sellerId: 'player1',
        item: itemToList,
        price: 100,
        listedAt: expect.any(Date),
        expiresAt: expect.any(Date),
        category: ItemCategory.WEAPON,
        isActive: true
      });
      expect(mockPlayerRepository.update).toHaveBeenCalled();
    });

    it('should throw error for invalid seller ID', async () => {
      await expect(economyService.listItem('', mockListing.item, 100))
        .rejects.toThrow('Invalid seller ID or item data');
    });

    it('should throw error for invalid item data', async () => {
      const invalidItem: ItemStack = {
        itemId: '',
        quantity: 0,
        metadata: undefined
      };

      await expect(economyService.listItem('player1', invalidItem, 100))
        .rejects.toThrow('Invalid seller ID or item data');
    });

    it('should throw error for price below minimum', async () => {
      await expect(economyService.listItem('player1', mockListing.item, 0))
        .rejects.toThrow('Price must be at least 1 coins');
    });

    it('should throw error for invalid duration', async () => {
      await expect(economyService.listItem('player1', mockListing.item, 100, 0))
        .rejects.toThrow('Duration must be between 1 and 720 hours');

      await expect(economyService.listItem('player1', mockListing.item, 100, 1000))
        .rejects.toThrow('Duration must be between 1 and 720 hours');
    });

    it('should throw error when player not found', async () => {
      (mockPlayerRepository.findById as Mock).mockResolvedValue(null);

      await expect(economyService.listItem('nonexistent', mockListing.item, 100))
        .rejects.toThrow('Player not found');
    });

    it('should throw error when player does not have item', async () => {
      const playerWithoutItem = {
        ...mockPlayer,
        inventory: []
      };
      (mockPlayerRepository.findById as Mock).mockResolvedValue(playerWithoutItem);

      await expect(economyService.listItem('player1', mockListing.item, 100))
        .rejects.toThrow('Player does not have sufficient quantity of this item');
    });

    it('should throw error when item not found in database', async () => {
      // Create a player that has the exact item we're trying to list
      const playerWithItem = {
        ...mockPlayer,
        inventory: [mockListing.item] // Exact match for the item being listed
      };
      (mockPlayerRepository.findById as Mock).mockResolvedValue(playerWithItem);
      // Then make item lookup fail
      (mockItemRepository.findById as Mock).mockResolvedValue(null);

      await expect(economyService.listItem('player1', mockListing.item, 100))
        .rejects.toThrow('Item not found in database');
    });
  });

  describe('purchaseItem', () => {
    const buyer = {
      ...mockPlayer,
      id: 'buyer1',
      currency: { coins: 500, dungeonTokens: 0, eventCurrency: 0, guildPoints: 0 }
    };

    const seller = {
      ...mockPlayer,
      id: 'seller1',
      currency: { coins: 200, dungeonTokens: 0, eventCurrency: 0, guildPoints: 0 }
    };

    beforeEach(() => {
      (mockItemRepository.getMarketListing as Mock).mockResolvedValue(mockListing);
      (mockPlayerRepository.findById as Mock)
        .mockImplementation((id: string) => {
          if (id === 'buyer1') return Promise.resolve(buyer);
          if (id === 'seller1') return Promise.resolve(seller);
          return Promise.resolve(null);
        });
    });

    it('should successfully purchase an item', async () => {
      const mockTransactionId = 'transaction123';
      
      // Mock the executeTransaction method to return the transaction ID
      (mockItemRepository.executeTransaction as Mock).mockImplementation(
        async (callback) => {
          const mockClient = { query: vi.fn().mockResolvedValue({ rows: [] }) };
          return await callback(mockClient);
        }
      );
      
      // Mock the generateId method
      vi.spyOn(economyService as unknown as { generateId: () => string }, 'generateId').mockReturnValue(mockTransactionId);

      const result = await economyService.purchaseItem('buyer1', 'listing1');

      expect(result.success).toBe(true);
      expect(result.transactionId).toBe(mockTransactionId);
      expect(result.listing).toEqual(mockListing);
    });

    it('should fail when listing not found', async () => {
      (mockItemRepository.getMarketListing as Mock).mockResolvedValue(null);

      const result = await economyService.purchaseItem('buyer1', 'nonexistent');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Listing not found');
    });

    it('should fail when listing is inactive', async () => {
      const inactiveListing = { ...mockListing, isActive: false };
      (mockItemRepository.getMarketListing as Mock).mockResolvedValue(inactiveListing);

      const result = await economyService.purchaseItem('buyer1', 'listing1');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Listing is no longer active');
    });

    it('should fail when listing is expired', async () => {
      const expiredListing = { 
        ...mockListing, 
        expiresAt: new Date(Date.now() - 1000) 
      };
      (mockItemRepository.getMarketListing as Mock).mockResolvedValue(expiredListing);

      const result = await economyService.purchaseItem('buyer1', 'listing1');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Listing is no longer active');
    });

    it('should fail when trying to buy own listing', async () => {
      const result = await economyService.purchaseItem('seller1', 'listing1');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Cannot purchase your own listing');
    });

    it('should fail when buyer not found', async () => {
      (mockPlayerRepository.findById as Mock)
        .mockImplementation((id: string) => {
          if (id === 'nonexistent') return Promise.resolve(null);
          if (id === 'seller1') return Promise.resolve(seller);
          return Promise.resolve(mockPlayer);
        });

      const result = await economyService.purchaseItem('nonexistent', 'listing1');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Buyer not found');
    });

    it('should fail when seller not found', async () => {
      const listingWithMissingSeller = { ...mockListing, sellerId: 'nonexistent' };
      (mockItemRepository.getMarketListing as Mock).mockResolvedValue(listingWithMissingSeller);
      (mockPlayerRepository.findById as Mock)
        .mockImplementation((id: string) => {
          if (id === 'buyer1') return Promise.resolve(buyer);
          if (id === 'nonexistent') return Promise.resolve(null);
          return Promise.resolve(mockPlayer);
        });

      const result = await economyService.purchaseItem('buyer1', 'listing1');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Seller not found');
    });

    it('should fail when buyer has insufficient funds', async () => {
      const poorBuyer = {
        ...buyer,
        currency: { coins: 50, dungeonTokens: 0, eventCurrency: 0, guildPoints: 0 }
      };
      (mockPlayerRepository.findById as Mock)
        .mockImplementation((id: string) => {
          if (id === 'buyer1') return Promise.resolve(poorBuyer);
          if (id === 'seller1') return Promise.resolve(seller);
          return Promise.resolve(mockPlayer);
        });

      const result = await economyService.purchaseItem('buyer1', 'listing1');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Insufficient funds');
    });
  });

  describe('searchListings', () => {
    it('should search listings with options', async () => {
      const mockListings = [mockListing];
      (mockItemRepository.searchMarketListings as Mock).mockResolvedValue(mockListings);

      const options = { category: ItemCategory.WEAPON, minPrice: 50 };
      const result = await economyService.searchListings(options);

      expect(result).toEqual(mockListings);
      expect(mockItemRepository.searchMarketListings).toHaveBeenCalledWith(options);
    });

    it('should search listings without options', async () => {
      const mockListings = [mockListing];
      (mockItemRepository.searchMarketListings as Mock).mockResolvedValue(mockListings);

      const result = await economyService.searchListings();

      expect(result).toEqual(mockListings);
      expect(mockItemRepository.searchMarketListings).toHaveBeenCalledWith({});
    });
  });

  describe('getPlayerListings', () => {
    it('should get player listings', async () => {
      const mockListings = [mockListing];
      (mockItemRepository.getPlayerListings as Mock).mockResolvedValue(mockListings);

      const result = await economyService.getPlayerListings('player1');

      expect(result).toEqual(mockListings);
      expect(mockItemRepository.getPlayerListings).toHaveBeenCalledWith('player1', true);
    });
  });

  describe('cancelListing', () => {
    it('should successfully cancel a listing', async () => {
      (mockItemRepository.getMarketListing as Mock).mockResolvedValue(mockListing);
      (mockItemRepository.updateMarketListing as Mock).mockResolvedValue(mockListing);
      (mockPlayerRepository.update as Mock).mockResolvedValue(mockPlayer);

      const result = await economyService.cancelListing('seller1', 'listing1');

      expect(result).toBe(true);
      expect(mockItemRepository.updateMarketListing).toHaveBeenCalledWith('listing1', { isActive: false });
    });

    it('should return false when listing not found', async () => {
      (mockItemRepository.getMarketListing as Mock).mockResolvedValue(null);

      const result = await economyService.cancelListing('player1', 'listing1');

      expect(result).toBe(false);
    });

    it('should throw error when trying to cancel another player\'s listing', async () => {
      const otherPlayerListing = { ...mockListing, sellerId: 'other_player' };
      (mockItemRepository.getMarketListing as Mock).mockResolvedValue(otherPlayerListing);

      await expect(economyService.cancelListing('player1', 'listing1'))
        .rejects.toThrow('Cannot cancel another player\'s listing');
    });

    it('should return false when listing is already inactive', async () => {
      const inactiveListing = { ...mockListing, isActive: false };
      (mockItemRepository.getMarketListing as Mock).mockResolvedValue(inactiveListing);

      const result = await economyService.cancelListing('seller1', 'listing1');

      expect(result).toBe(false);
    });
  });

  describe('getMarketPrices', () => {
    it('should get market prices with stable trend', async () => {
      const mockPriceHistory: PriceHistory = {
        itemId: 'sword_iron',
        averagePrice: 100,
        minPrice: 80,
        maxPrice: 120,
        totalVolume: 50,
        pricePoints: [
          { price: 100, timestamp: new Date(), volume: 10 },
          { price: 105, timestamp: new Date(), volume: 15 }
        ]
      };

      (mockItemRepository.getItemPriceHistory as Mock).mockResolvedValue(mockPriceHistory);

      const result = await economyService.getMarketPrices('sword_iron');

      expect(result.itemId).toBe('sword_iron');
      expect(result.trend).toBe(PriceTrend.STABLE);
      expect(mockItemRepository.getItemPriceHistory).toHaveBeenCalledWith('sword_iron', 30);
    });

    it('should calculate rising trend', async () => {
      const mockPriceHistory: PriceHistory = {
        itemId: 'sword_iron',
        averagePrice: 100,
        minPrice: 80,
        maxPrice: 150,
        totalVolume: 50,
        pricePoints: [
          { price: 150, timestamp: new Date(), volume: 10 },
          { price: 140, timestamp: new Date(), volume: 15 },
          { price: 130, timestamp: new Date(), volume: 12 },
          { price: 120, timestamp: new Date(), volume: 8 },
          { price: 110, timestamp: new Date(), volume: 5 },
          { price: 100, timestamp: new Date(), volume: 10 },
          { price: 90, timestamp: new Date(), volume: 15 },
          { price: 80, timestamp: new Date(), volume: 12 }
        ]
      };

      (mockItemRepository.getItemPriceHistory as Mock).mockResolvedValue(mockPriceHistory);

      const result = await economyService.getMarketPrices('sword_iron');

      expect(result.trend).toBe(PriceTrend.RISING);
    });

    it('should calculate falling trend', async () => {
      const mockPriceHistory: PriceHistory = {
        itemId: 'sword_iron',
        averagePrice: 100,
        minPrice: 60,
        maxPrice: 150,
        totalVolume: 50,
        pricePoints: [
          { price: 60, timestamp: new Date(), volume: 10 },
          { price: 70, timestamp: new Date(), volume: 15 },
          { price: 80, timestamp: new Date(), volume: 12 },
          { price: 90, timestamp: new Date(), volume: 8 },
          { price: 100, timestamp: new Date(), volume: 5 },
          { price: 130, timestamp: new Date(), volume: 10 },
          { price: 140, timestamp: new Date(), volume: 15 },
          { price: 150, timestamp: new Date(), volume: 12 }
        ]
      };

      (mockItemRepository.getItemPriceHistory as Mock).mockResolvedValue(mockPriceHistory);

      const result = await economyService.getMarketPrices('sword_iron');

      expect(result.trend).toBe(PriceTrend.FALLING);
    });
  });

  describe('processExpiredListings', () => {
    it('should process expired listings', async () => {
      (mockItemRepository.expireListings as Mock).mockResolvedValue(5);

      const result = await economyService.processExpiredListings();

      expect(result).toBe(5);
      expect(mockItemRepository.expireListings).toHaveBeenCalled();
    });
  });

  describe('getMarketStatistics', () => {
    it('should get market statistics', async () => {
      const mockBaseStats = {
        totalListings: 100,
        activeListings: 80,
        totalTransactions: 500,
        totalVolume: 1000,
        averagePrice: 150
      };

      (mockItemRepository.getMarketStatistics as Mock).mockResolvedValue(mockBaseStats);

      const result = await economyService.getMarketStatistics();

      expect(result.totalListings).toBe(100);
      expect(result.activeListings).toBe(80);
      expect(result.totalTransactions).toBe(500);
      expect(result.totalVolume).toBe(1000);
      expect(result.averagePrice).toBe(150);
      expect(result.topCategories).toBeDefined();
      expect(Array.isArray(result.topCategories)).toBe(true);
    });
  });

  describe('updateMarketTrends', () => {
    it('should update market trends', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await economyService.updateMarketTrends();

      expect(consoleSpy).toHaveBeenCalledWith('Market trends updated');
      consoleSpy.mockRestore();
    });
  });
});