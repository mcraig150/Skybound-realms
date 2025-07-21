import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TradingServiceImpl } from '../../services/TradingService';
import { PlayerRepository } from '../../repositories/PlayerRepository';
import { ItemStack, ItemRarity } from '../../models/Item';
import { TradeRequest } from '../../models/Trade';

// Mock PlayerRepository
const mockPlayerRepository = {
  findById: vi.fn(),
  update: vi.fn(),
  create: vi.fn(),
  delete: vi.fn(),
  findAll: vi.fn()
} as unknown as PlayerRepository;

describe('Trading System Integration', () => {
  let tradingService: TradingServiceImpl;
  let alice: any;
  let bob: any;

  beforeEach(() => {
    vi.clearAllMocks();
    tradingService = new TradingServiceImpl(mockPlayerRepository);

    // Create test players with realistic inventories
    alice = {
      id: 'alice',
      username: 'Alice',
      inventory: [
        { itemId: 'iron_sword', quantity: 1, metadata: { rarity: ItemRarity.COMMON, durability: 100 } },
        { itemId: 'health_potion', quantity: 10, metadata: { rarity: ItemRarity.COMMON } },
        { itemId: 'rare_gem', quantity: 2, metadata: { rarity: ItemRarity.RARE } }
      ],
      currency: { coins: 1500 }
    };

    bob = {
      id: 'bob',
      username: 'Bob',
      inventory: [
        { itemId: 'steel_armor', quantity: 1, metadata: { rarity: ItemRarity.UNCOMMON, durability: 150 } },
        { itemId: 'mana_potion', quantity: 8, metadata: { rarity: ItemRarity.COMMON } },
        { itemId: 'epic_staff', quantity: 1, metadata: { rarity: ItemRarity.EPIC, enchantments: ['fire_damage'] } }
      ],
      currency: { coins: 800 }
    };

    (mockPlayerRepository.findById as any).mockImplementation((id: string) => {
      if (id === 'alice') return Promise.resolve(alice);
      if (id === 'bob') return Promise.resolve(bob);
      return Promise.resolve(null);
    });

    (mockPlayerRepository.update as any).mockResolvedValue(true);
  });

  it('should complete a full trading workflow between two players', async () => {
    // Step 1: Alice initiates a trade with Bob
    const tradeRequest: TradeRequest = {
      recipientId: 'bob',
      message: 'Want to trade my rare gem for your epic staff?'
    };

    const initiateResult = await tradingService.initiateTrade('alice', tradeRequest);
    expect(initiateResult.success).toBe(true);
    expect(initiateResult.trade).toBeDefined();

    const tradeId = initiateResult.trade!.id;

    // Step 2: Bob accepts the trade
    const acceptResult = await tradingService.acceptTrade('bob', tradeId);
    expect(acceptResult.success).toBe(true);
    expect(acceptResult.trade!.status).toBe('active');

    // Step 3: Alice makes her offer
    const aliceOfferResult = await tradingService.updateTradeOffer('alice', tradeId, {
      items: [{ itemId: 'rare_gem', quantity: 1, metadata: { rarity: ItemRarity.RARE } }],
      currency: 200
    });
    expect(aliceOfferResult.success).toBe(true);

    // Step 4: Bob makes his counter-offer
    const bobOfferResult = await tradingService.updateTradeOffer('bob', tradeId, {
      items: [{ itemId: 'epic_staff', quantity: 1, metadata: { rarity: ItemRarity.EPIC, enchantments: ['fire_damage'] } }],
      currency: 0
    });
    expect(bobOfferResult.success).toBe(true);

    // Step 5: Both players confirm their offers
    const aliceConfirmResult = await tradingService.confirmTrade({ tradeId, playerId: 'alice' });
    expect(aliceConfirmResult.success).toBe(true);

    const bobConfirmResult = await tradingService.confirmTrade({ tradeId, playerId: 'bob' });
    expect(bobConfirmResult.success).toBe(true);

    // Step 6: Complete the trade
    const completeResult = await tradingService.completeTrade(tradeId);
    expect(completeResult.success).toBe(true);
    expect(completeResult.trade!.status).toBe('completed');

    // Step 7: Verify the trade results
    // Alice should now have the epic staff and less currency
    expect(alice.currency.coins).toBe(1300); // 1500 - 200
    expect(alice.inventory.some((item: ItemStack) => item.itemId === 'epic_staff')).toBe(true);
    expect(alice.inventory.find((item: ItemStack) => item.itemId === 'rare_gem')?.quantity).toBe(1); // Had 2, traded 1

    // Bob should now have the rare gem and more currency
    expect(bob.currency.coins).toBe(1000); // 800 + 200
    expect(bob.inventory.some((item: ItemStack) => item.itemId === 'rare_gem')).toBe(true);
    expect(bob.inventory.some((item: ItemStack) => item.itemId === 'epic_staff')).toBe(false);

    // Step 8: Verify trade history was created
    const aliceHistory = await tradingService.getTradeHistory('alice');
    const bobHistory = await tradingService.getTradeHistory('bob');

    expect(aliceHistory).toHaveLength(1);
    expect(bobHistory).toHaveLength(1);
    expect(aliceHistory[0].tradeId).toBe(tradeId);
    expect(bobHistory[0].tradeId).toBe(tradeId);
  });

  it('should handle trade cancellation gracefully', async () => {
    // Initiate and accept a trade
    const tradeRequest: TradeRequest = { recipientId: 'bob' };
    const initiateResult = await tradingService.initiateTrade('alice', tradeRequest);
    const tradeId = initiateResult.trade!.id;
    
    await tradingService.acceptTrade('bob', tradeId);

    // Alice makes an offer
    await tradingService.updateTradeOffer('alice', tradeId, {
      items: [{ itemId: 'iron_sword', quantity: 1, metadata: { rarity: ItemRarity.COMMON, durability: 100 } }],
      currency: 100
    });

    // Bob cancels the trade
    const cancelResult = await tradingService.cancelTrade('bob', tradeId, 'Changed my mind');
    expect(cancelResult.success).toBe(true);
    expect(cancelResult.trade!.status).toBe('cancelled');
    expect(cancelResult.trade!.cancelledBy).toBe('bob');

    // Verify the trade is no longer active
    const retrievedTrade = await tradingService.getTrade(tradeId);
    expect(retrievedTrade).toBeNull();

    // Verify no items were transferred
    expect(alice.inventory.some((item: ItemStack) => item.itemId === 'iron_sword')).toBe(true);
    expect(alice.currency.coins).toBe(1500);
    expect(bob.currency.coins).toBe(800);
  });

  it('should prevent invalid trades with security checks', async () => {
    // Try to initiate a trade with insufficient items
    const tradeRequest: TradeRequest = { recipientId: 'bob' };
    const initiateResult = await tradingService.initiateTrade('alice', tradeRequest);
    const tradeId = initiateResult.trade!.id;
    
    await tradingService.acceptTrade('bob', tradeId);

    // Alice tries to offer more items than she has
    const invalidOfferResult = await tradingService.updateTradeOffer('alice', tradeId, {
      items: [{ itemId: 'rare_gem', quantity: 10, metadata: { rarity: ItemRarity.RARE } }], // She only has 2
      currency: 0
    });

    expect(invalidOfferResult.success).toBe(false);
    expect(invalidOfferResult.error).toBe('Insufficient quantity of item: rare_gem');

    // Alice tries to offer more currency than she has
    const invalidCurrencyResult = await tradingService.updateTradeOffer('alice', tradeId, {
      items: [],
      currency: 2000 // She only has 1500
    });

    expect(invalidCurrencyResult.success).toBe(false);
    expect(invalidCurrencyResult.error).toBe('Insufficient currency');
  });

  it('should handle expired trades correctly', async () => {
    // Create a trade
    const tradeRequest: TradeRequest = { recipientId: 'bob' };
    const initiateResult = await tradingService.initiateTrade('alice', tradeRequest);
    const trade = initiateResult.trade!;

    // Manually expire the trade
    trade.expiresAt = new Date(Date.now() - 1000);

    // Run cleanup
    const cleanedCount = await tradingService.cleanupExpiredTrades();
    expect(cleanedCount).toBe(1);

    // Verify the trade is no longer accessible
    const retrievedTrade = await tradingService.getTrade(trade.id);
    expect(retrievedTrade).toBeNull();
  });

  it('should maintain data consistency during concurrent operations', async () => {
    // This test simulates sequential trade operations to test duplicate prevention
    const tradeRequest1: TradeRequest = { recipientId: 'bob' };
    const tradeRequest2: TradeRequest = { recipientId: 'bob' };

    // Create first trade
    const result1 = await tradingService.initiateTrade('alice', tradeRequest1);
    expect(result1.success).toBe(true);

    // Try to create duplicate trade
    const result2 = await tradingService.initiateTrade('alice', tradeRequest2);
    expect(result2.success).toBe(false);
    expect(result2.error).toBe('You already have an active trade with this player');

    // Verify only one trade exists
    const aliceTrades = await tradingService.getPlayerTrades('alice');
    expect(aliceTrades).toHaveLength(1);
  });

  it('should validate trade completion requirements', async () => {
    // Create and accept a trade
    const tradeRequest: TradeRequest = { recipientId: 'bob' };
    const initiateResult = await tradingService.initiateTrade('alice', tradeRequest);
    const tradeId = initiateResult.trade!.id;
    
    await tradingService.acceptTrade('bob', tradeId);

    // Try to complete without any confirmations
    const prematureCompleteResult = await tradingService.completeTrade(tradeId);
    expect(prematureCompleteResult.success).toBe(false);
    expect(prematureCompleteResult.error).toBe('Trade cannot be completed');

    // Add offers but don't confirm
    await tradingService.updateTradeOffer('alice', tradeId, {
      items: [{ itemId: 'health_potion', quantity: 1, metadata: { rarity: ItemRarity.COMMON } }],
      currency: 0
    });

    // Try to complete with only one confirmation
    await tradingService.confirmTrade({ tradeId, playerId: 'alice' });
    const partialCompleteResult = await tradingService.completeTrade(tradeId);
    expect(partialCompleteResult.success).toBe(false);
    expect(partialCompleteResult.error).toBe('Trade cannot be completed');

    // Complete with both confirmations
    await tradingService.confirmTrade({ tradeId, playerId: 'bob' });
    const finalCompleteResult = await tradingService.completeTrade(tradeId);
    expect(finalCompleteResult.success).toBe(true);
  });
});