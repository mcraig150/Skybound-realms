import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';
import { TradingServiceImpl } from '../../services/TradingService';
import { PlayerRepository } from '../../repositories/PlayerRepository';
import { 
  Trade, 
  TradeStatus, 
  TradeRequest, 
  TradeUpdate, 
  TradeConfirmation,
  TradeValidator 
} from '../../models/Trade';
import { ItemStack, ItemRarity } from '../../models/Item';

// Mock PlayerRepository
const mockPlayerRepository = {
  findById: vi.fn(),
  update: vi.fn(),
  create: vi.fn(),
  delete: vi.fn(),
  findAll: vi.fn()
} as unknown as PlayerRepository;

describe('TradingService', () => {
  let tradingService: TradingServiceImpl;
  let mockPlayer1: any;
  let mockPlayer2: any;

  beforeEach(() => {
    vi.clearAllMocks();
    tradingService = new TradingServiceImpl(mockPlayerRepository);

    mockPlayer1 = {
      id: 'player1',
      username: 'TestPlayer1',
      inventory: [
        { itemId: 'sword', quantity: 1, metadata: { rarity: ItemRarity.COMMON } },
        { itemId: 'potion', quantity: 5, metadata: { rarity: ItemRarity.COMMON } }
      ],
      currency: { coins: 1000 }
    };

    mockPlayer2 = {
      id: 'player2',
      username: 'TestPlayer2',
      inventory: [
        { itemId: 'shield', quantity: 1, metadata: { rarity: ItemRarity.RARE } },
        { itemId: 'gem', quantity: 3, metadata: { rarity: ItemRarity.EPIC } }
      ],
      currency: { coins: 500 }
    };

    (mockPlayerRepository.findById as Mock).mockImplementation((id: string) => {
      if (id === 'player1') return Promise.resolve(mockPlayer1);
      if (id === 'player2') return Promise.resolve(mockPlayer2);
      return Promise.resolve(null);
    });

    (mockPlayerRepository.update as Mock).mockResolvedValue(true);
  });

  describe('initiateTrade', () => {
    it('should successfully initiate a trade between two valid players', async () => {
      const request: TradeRequest = {
        recipientId: 'player2',
        message: 'Want to trade?'
      };

      const result = await tradingService.initiateTrade('player1', request);

      expect(result.success).toBe(true);
      expect(result.trade).toBeDefined();
      expect(result.trade!.initiatorId).toBe('player1');
      expect(result.trade!.recipientId).toBe('player2');
      expect(result.trade!.status).toBe(TradeStatus.PENDING);
    });

    it('should fail when initiator does not exist', async () => {
      const request: TradeRequest = {
        recipientId: 'player2'
      };

      const result = await tradingService.initiateTrade('nonexistent', request);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Initiator not found');
    });

    it('should fail when recipient does not exist', async () => {
      const request: TradeRequest = {
        recipientId: 'nonexistent'
      };

      const result = await tradingService.initiateTrade('player1', request);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Recipient not found');
    });

    it('should fail when trying to trade with yourself', async () => {
      const request: TradeRequest = {
        recipientId: 'player1'
      };

      const result = await tradingService.initiateTrade('player1', request);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Cannot trade with yourself');
    });
  });

  describe('acceptTrade', () => {
    it('should successfully accept a pending trade', async () => {
      // First initiate a trade
      const request: TradeRequest = { recipientId: 'player2' };
      const initiateResult = await tradingService.initiateTrade('player1', request);
      const tradeId = initiateResult.trade!.id;

      // Accept the trade
      const result = await tradingService.acceptTrade('player2', tradeId);

      expect(result.success).toBe(true);
      expect(result.trade!.status).toBe(TradeStatus.ACTIVE);
    });

    it('should fail when trade does not exist', async () => {
      const result = await tradingService.acceptTrade('player2', 'nonexistent');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Trade not found');
    });

    it('should fail when player is not the recipient', async () => {
      const request: TradeRequest = { recipientId: 'player2' };
      const initiateResult = await tradingService.initiateTrade('player1', request);
      const tradeId = initiateResult.trade!.id;

      const result = await tradingService.acceptTrade('player1', tradeId);

      expect(result.success).toBe(false);
      expect(result.error).toBe('You are not the recipient of this trade');
    });

    it('should fail when trade is not in pending status', async () => {
      const request: TradeRequest = { recipientId: 'player2' };
      const initiateResult = await tradingService.initiateTrade('player1', request);
      const tradeId = initiateResult.trade!.id;

      // Accept once
      await tradingService.acceptTrade('player2', tradeId);

      // Try to accept again
      const result = await tradingService.acceptTrade('player2', tradeId);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Trade is not in pending status');
    });
  });

  describe('declineTrade', () => {
    it('should successfully decline a pending trade', async () => {
      const request: TradeRequest = { recipientId: 'player2' };
      const initiateResult = await tradingService.initiateTrade('player1', request);
      const tradeId = initiateResult.trade!.id;

      const result = await tradingService.declineTrade('player2', tradeId);

      expect(result.success).toBe(true);
      expect(result.trade!.status).toBe(TradeStatus.CANCELLED);
      expect(result.trade!.cancelledBy).toBe('player2');
      expect(result.trade!.cancelReason).toBe('Declined by recipient');
    });

    it('should fail when player is not the recipient', async () => {
      const request: TradeRequest = { recipientId: 'player2' };
      const initiateResult = await tradingService.initiateTrade('player1', request);
      const tradeId = initiateResult.trade!.id;

      const result = await tradingService.declineTrade('player1', tradeId);

      expect(result.success).toBe(false);
      expect(result.error).toBe('You are not the recipient of this trade');
    });
  });

  describe('updateTradeOffer', () => {
    it('should successfully update trade offer with valid items', async () => {
      const request: TradeRequest = { recipientId: 'player2' };
      const initiateResult = await tradingService.initiateTrade('player1', request);
      await tradingService.acceptTrade('player2', initiateResult.trade!.id);
      const tradeId = initiateResult.trade!.id;

      const update: TradeUpdate = {
        items: [{ itemId: 'sword', quantity: 1, metadata: { rarity: ItemRarity.COMMON } }],
        currency: 100
      };

      const result = await tradingService.updateTradeOffer('player1', tradeId, update);

      expect(result.success).toBe(true);
      expect(result.trade!.initiatorOffer.items).toHaveLength(1);
      expect(result.trade!.initiatorOffer.items[0].itemId).toBe('sword');
      expect(result.trade!.initiatorOffer.currency).toBe(100);
      expect(result.trade!.initiatorOffer.confirmed).toBe(false);
    });

    it('should fail when player does not have the offered items', async () => {
      const request: TradeRequest = { recipientId: 'player2' };
      const initiateResult = await tradingService.initiateTrade('player1', request);
      await tradingService.acceptTrade('player2', initiateResult.trade!.id);
      const tradeId = initiateResult.trade!.id;

      const update: TradeUpdate = {
        items: [{ itemId: 'nonexistent', quantity: 1, metadata: { rarity: ItemRarity.COMMON } }]
      };

      const result = await tradingService.updateTradeOffer('player1', tradeId, update);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Insufficient quantity of item: nonexistent');
    });

    it('should fail when player does not have sufficient currency', async () => {
      const request: TradeRequest = { recipientId: 'player2' };
      const initiateResult = await tradingService.initiateTrade('player1', request);
      await tradingService.acceptTrade('player2', initiateResult.trade!.id);
      const tradeId = initiateResult.trade!.id;

      const update: TradeUpdate = {
        currency: 2000 // Player only has 1000
      };

      const result = await tradingService.updateTradeOffer('player1', tradeId, update);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Insufficient currency');
    });

    it('should reset confirmations when offer is updated', async () => {
      const request: TradeRequest = { recipientId: 'player2' };
      const initiateResult = await tradingService.initiateTrade('player1', request);
      await tradingService.acceptTrade('player2', initiateResult.trade!.id);
      const tradeId = initiateResult.trade!.id;

      // Confirm both offers
      await tradingService.confirmTrade({ tradeId, playerId: 'player1' });
      await tradingService.confirmTrade({ tradeId, playerId: 'player2' });

      // Update offer
      const update: TradeUpdate = { currency: 50 };
      const result = await tradingService.updateTradeOffer('player1', tradeId, update);

      expect(result.success).toBe(true);
      expect(result.trade!.initiatorOffer.confirmed).toBe(false);
      expect(result.trade!.recipientOffer.confirmed).toBe(false);
    });
  });

  describe('confirmTrade', () => {
    it('should successfully confirm a trade offer', async () => {
      const request: TradeRequest = { recipientId: 'player2' };
      const initiateResult = await tradingService.initiateTrade('player1', request);
      await tradingService.acceptTrade('player2', initiateResult.trade!.id);
      const tradeId = initiateResult.trade!.id;

      const confirmation: TradeConfirmation = { tradeId, playerId: 'player1' };
      const result = await tradingService.confirmTrade(confirmation);

      expect(result.success).toBe(true);
      expect(result.trade!.initiatorOffer.confirmed).toBe(true);
      expect(result.trade!.initiatorOffer.confirmedAt).toBeDefined();
    });

    it('should fail when player is not a participant', async () => {
      const request: TradeRequest = { recipientId: 'player2' };
      const initiateResult = await tradingService.initiateTrade('player1', request);
      await tradingService.acceptTrade('player2', initiateResult.trade!.id);
      const tradeId = initiateResult.trade!.id;

      const confirmation: TradeConfirmation = { tradeId, playerId: 'player3' };
      const result = await tradingService.confirmTrade(confirmation);

      expect(result.success).toBe(false);
      expect(result.error).toBe('You are not a participant in this trade');
    });
  });

  describe('cancelTrade', () => {
    it('should successfully cancel an active trade', async () => {
      const request: TradeRequest = { recipientId: 'player2' };
      const initiateResult = await tradingService.initiateTrade('player1', request);
      await tradingService.acceptTrade('player2', initiateResult.trade!.id);
      const tradeId = initiateResult.trade!.id;

      const result = await tradingService.cancelTrade('player1', tradeId, 'Changed my mind');

      expect(result.success).toBe(true);
      expect(result.trade!.status).toBe(TradeStatus.CANCELLED);
      expect(result.trade!.cancelledBy).toBe('player1');
      expect(result.trade!.cancelReason).toBe('Changed my mind');
    });

    it('should fail when trying to cancel a completed trade', async () => {
      const request: TradeRequest = { recipientId: 'player2' };
      const initiateResult = await tradingService.initiateTrade('player1', request);
      const trade = initiateResult.trade!;
      
      // Manually set trade as completed for testing
      trade.status = TradeStatus.COMPLETED;

      const result = await tradingService.cancelTrade('player1', trade.id);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Cannot cancel a completed trade');
    });
  });

  describe('completeTrade', () => {
    it('should successfully complete a trade when both parties confirm', async () => {
      const request: TradeRequest = { recipientId: 'player2' };
      const initiateResult = await tradingService.initiateTrade('player1', request);
      await tradingService.acceptTrade('player2', initiateResult.trade!.id);
      const tradeId = initiateResult.trade!.id;

      // Set up trade offers
      await tradingService.updateTradeOffer('player1', tradeId, {
        items: [{ itemId: 'sword', quantity: 1, metadata: { rarity: ItemRarity.COMMON } }],
        currency: 100
      });

      await tradingService.updateTradeOffer('player2', tradeId, {
        items: [{ itemId: 'shield', quantity: 1, metadata: { rarity: ItemRarity.RARE } }],
        currency: 50
      });

      // Confirm both offers
      await tradingService.confirmTrade({ tradeId, playerId: 'player1' });
      await tradingService.confirmTrade({ tradeId, playerId: 'player2' });

      // Complete the trade
      const result = await tradingService.completeTrade(tradeId);

      expect(result.success).toBe(true);
      expect(result.trade!.status).toBe(TradeStatus.COMPLETED);
      expect(result.trade!.completedAt).toBeDefined();

      // Verify repository update was called
      expect(mockPlayerRepository.update).toHaveBeenCalledTimes(2);
    });

    it('should fail when trade cannot be completed', async () => {
      const request: TradeRequest = { recipientId: 'player2' };
      const initiateResult = await tradingService.initiateTrade('player1', request);
      const tradeId = initiateResult.trade!.id;

      // Try to complete without accepting or confirming
      const result = await tradingService.completeTrade(tradeId);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Trade cannot be completed');
    });

    it('should transfer items and currency correctly', async () => {
      const request: TradeRequest = { recipientId: 'player2' };
      const initiateResult = await tradingService.initiateTrade('player1', request);
      await tradingService.acceptTrade('player2', initiateResult.trade!.id);
      const tradeId = initiateResult.trade!.id;

      // Set up trade offers
      await tradingService.updateTradeOffer('player1', tradeId, {
        items: [{ itemId: 'sword', quantity: 1, metadata: { rarity: ItemRarity.COMMON } }],
        currency: 100
      });

      await tradingService.updateTradeOffer('player2', tradeId, {
        items: [{ itemId: 'shield', quantity: 1, metadata: { rarity: ItemRarity.RARE } }],
        currency: 50
      });

      // Confirm both offers
      await tradingService.confirmTrade({ tradeId, playerId: 'player1' });
      await tradingService.confirmTrade({ tradeId, playerId: 'player2' });

      // Complete the trade
      await tradingService.completeTrade(tradeId);

      // Verify player1 received shield and 50 coins, lost sword and 100 coins
      expect(mockPlayer1.currency.coins).toBe(950); // 1000 - 100 + 50
      expect(mockPlayer1.inventory.some((item: ItemStack) => item.itemId === 'shield')).toBe(true);
      expect(mockPlayer1.inventory.some((item: ItemStack) => item.itemId === 'sword')).toBe(false);

      // Verify player2 received sword and 100 coins, lost shield and 50 coins
      expect(mockPlayer2.currency.coins).toBe(550); // 500 - 50 + 100
      expect(mockPlayer2.inventory.some((item: ItemStack) => item.itemId === 'sword')).toBe(true);
      expect(mockPlayer2.inventory.some((item: ItemStack) => item.itemId === 'shield')).toBe(false);
    });
  });

  describe('getPlayerTrades', () => {
    it('should return active trades for a player', async () => {
      // Create a third player to avoid duplicate trade prevention
      const mockPlayer3 = {
        id: 'player3',
        username: 'TestPlayer3',
        inventory: [],
        currency: { coins: 100 }
      };

      (mockPlayerRepository.findById as Mock).mockImplementation((id: string) => {
        if (id === 'player1') return Promise.resolve(mockPlayer1);
        if (id === 'player2') return Promise.resolve(mockPlayer2);
        if (id === 'player3') return Promise.resolve(mockPlayer3);
        return Promise.resolve(null);
      });

      const request1: TradeRequest = { recipientId: 'player2' };
      const request2: TradeRequest = { recipientId: 'player3' };

      await tradingService.initiateTrade('player1', request1);
      await tradingService.initiateTrade('player1', request2);

      const trades = await tradingService.getPlayerTrades('player1');

      expect(trades).toHaveLength(2);
      expect(trades.every(trade => 
        trade.initiatorId === 'player1' || trade.recipientId === 'player1'
      )).toBe(true);
    });
  });

  describe('cleanupExpiredTrades', () => {
    it('should clean up expired trades', async () => {
      const request: TradeRequest = { recipientId: 'player2' };
      const initiateResult = await tradingService.initiateTrade('player1', request);
      const trade = initiateResult.trade!;

      // Manually expire the trade
      trade.expiresAt = new Date(Date.now() - 1000);

      const cleanedCount = await tradingService.cleanupExpiredTrades();

      expect(cleanedCount).toBe(1);
      
      const retrievedTrade = await tradingService.getTrade(trade.id);
      expect(retrievedTrade).toBeNull();
    });
  });

  describe('security validation', () => {
    it('should validate trade offers against player inventory', async () => {
      const request: TradeRequest = { recipientId: 'player2' };
      const initiateResult = await tradingService.initiateTrade('player1', request);
      await tradingService.acceptTrade('player2', initiateResult.trade!.id);
      const tradeId = initiateResult.trade!.id;

      // Try to offer more items than player has
      const update: TradeUpdate = {
        items: [{ itemId: 'sword', quantity: 10, metadata: { rarity: ItemRarity.COMMON } }]
      };

      const result = await tradingService.updateTradeOffer('player1', tradeId, update);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Insufficient quantity of item: sword');
    });

    it('should validate currency offers against player balance', async () => {
      const request: TradeRequest = { recipientId: 'player2' };
      const initiateResult = await tradingService.initiateTrade('player1', request);
      await tradingService.acceptTrade('player2', initiateResult.trade!.id);
      const tradeId = initiateResult.trade!.id;

      const update: TradeUpdate = {
        currency: 2000 // Player only has 1000
      };

      const result = await tradingService.updateTradeOffer('player1', tradeId, update);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Insufficient currency');
    });

    it('should prevent duplicate active trades between same players', async () => {
      const request: TradeRequest = { recipientId: 'player2' };
      
      // First trade
      await tradingService.initiateTrade('player1', request);
      
      // Try to create another trade with same players
      const result = await tradingService.initiateTrade('player1', request);

      expect(result.success).toBe(false);
      expect(result.error).toBe('You already have an active trade with this player');
    });
  });

  describe('trade history', () => {
    it('should create trade history when trade completes', async () => {
      const request: TradeRequest = { recipientId: 'player2' };
      const initiateResult = await tradingService.initiateTrade('player1', request);
      await tradingService.acceptTrade('player2', initiateResult.trade!.id);
      const tradeId = initiateResult.trade!.id;

      // Set up and complete trade
      await tradingService.updateTradeOffer('player1', tradeId, {
        items: [{ itemId: 'sword', quantity: 1, metadata: { rarity: ItemRarity.COMMON } }],
        currency: 100
      });

      await tradingService.confirmTrade({ tradeId, playerId: 'player1' });
      await tradingService.confirmTrade({ tradeId, playerId: 'player2' });
      await tradingService.completeTrade(tradeId);

      // Check trade history
      const history1 = await tradingService.getTradeHistory('player1');
      const history2 = await tradingService.getTradeHistory('player2');

      expect(history1).toHaveLength(1);
      expect(history2).toHaveLength(1);
      expect(history1[0].tradeId).toBe(tradeId);
      expect(history2[0].tradeId).toBe(tradeId);
    });
  });
});