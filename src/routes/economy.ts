import { Router } from 'express';
import { z } from 'zod';
import { EconomyService } from '../services/EconomyService';
import { TradingServiceImpl } from '../services/TradingService';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth';

const router = Router();
const economyService = new EconomyService();
const tradingService = new TradingServiceImpl();

// Validation schemas
const ListItemSchema = z.object({
  itemId: z.string(),
  quantity: z.number().positive(),
  price: z.number().positive(),
  duration: z.number().positive().optional(), // hours
  metadata: z.object({
    rarity: z.enum(['COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY', 'DIVINE']).optional(),
    enchantments: z.array(z.any()).optional(),
    durability: z.number().optional()
  }).optional()
});

const MarketSearchSchema = z.object({
  itemId: z.string().optional(),
  category: z.string().optional(),
  minPrice: z.number().optional(),
  maxPrice: z.number().optional(),
  rarity: z.enum(['COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY', 'DIVINE']).optional(),
  sortBy: z.enum(['PRICE_ASC', 'PRICE_DESC', 'TIME_ASC', 'TIME_DESC']).optional(),
  limit: z.number().min(1).max(100).optional(),
  offset: z.number().min(0).optional()
});

const InitiateTradeSchema = z.object({
  targetPlayerId: z.string().uuid(),
  offeredItems: z.array(z.object({
    itemId: z.string(),
    quantity: z.number().positive(),
    metadata: z.record(z.any()).optional()
  })),
  requestedItems: z.array(z.object({
    itemId: z.string(),
    quantity: z.number().positive(),
    metadata: z.record(z.any()).optional()
  })).optional(),
  message: z.string().max(500).optional()
});

// Apply authentication middleware to all routes
router.use(authenticateToken);

// GET /api/economy/market/listings - Get market listings
router.get('/market/listings', async (req: AuthenticatedRequest, res): Promise<void> => {
  try {
    const searchParams = MarketSearchSchema.parse(req.query);
    const listings = await economyService.getMarketListings(searchParams);
    res.json(listings);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ 
        error: 'Invalid search parameters',
        code: 'VALIDATION_ERROR',
        details: error.errors 
      });
      return;
    }
    console.error('Error fetching market listings:', error);
    res.status(500).json({ 
      error: 'Failed to fetch market listings',
      code: 'FETCH_LISTINGS_ERROR' 
    });
  }
});

// POST /api/economy/market/list - List item for sale
router.post('/market/list', async (req: AuthenticatedRequest, res): Promise<void> => {
  try {
    const validatedData = ListItemSchema.parse(req.body);
    const listing = await economyService.listItemForAPI(
      req.player!.playerId,
      validatedData.itemId,
      validatedData.quantity,
      validatedData.price,
      validatedData.duration,
      validatedData.metadata
    );
    res.status(201).json(listing);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ 
        error: 'Invalid listing data',
        code: 'VALIDATION_ERROR',
        details: error.errors 
      });
      return;
    }
    console.error('Error listing item:', error);
    res.status(500).json({ 
      error: 'Failed to list item',
      code: 'LIST_ITEM_ERROR' 
    });
  }
});

// POST /api/economy/market/purchase/:listingId - Purchase item from market
router.post('/market/purchase/:listingId', async (req: AuthenticatedRequest, res): Promise<void> => {
  try {
    const listingId = req.params.listingId!;
    const result = await economyService.purchaseItem(req.player!.playerId, listingId);
    
    if (!result.success) {
      res.status(400).json({ 
        error: result.error || 'Failed to purchase item',
        code: 'PURCHASE_FAILED' 
      });
      return;
    }
    
    res.json(result);
  } catch (error) {
    console.error('Error purchasing item:', error);
    res.status(500).json({ 
      error: 'Failed to purchase item',
      code: 'PURCHASE_ERROR' 
    });
  }
});

// DELETE /api/economy/market/listing/:listingId - Cancel market listing
router.delete('/market/listing/:listingId', async (req: AuthenticatedRequest, res): Promise<void> => {
  try {
    const listingId = req.params.listingId!;
    const result = await economyService.cancelListingForAPI(req.player!.playerId, listingId);
    
    if (!result.success) {
      res.status(400).json({ 
        error: result.error || 'Failed to cancel listing',
        code: 'CANCEL_LISTING_FAILED' 
      });
      return;
    }
    
    res.json(result);
  } catch (error) {
    console.error('Error canceling listing:', error);
    res.status(500).json({ 
      error: 'Failed to cancel listing',
      code: 'CANCEL_LISTING_ERROR' 
    });
  }
});

// GET /api/economy/market/my-listings - Get player's active listings
router.get('/market/my-listings', async (req: AuthenticatedRequest, res) => {
  try {
    const listings = await economyService.getPlayerListings(req.player!.playerId);
    res.json(listings);
  } catch (error) {
    console.error('Error fetching player listings:', error);
    res.status(500).json({ 
      error: 'Failed to fetch player listings',
      code: 'FETCH_PLAYER_LISTINGS_ERROR' 
    });
  }
});

// GET /api/economy/market/prices/:itemId - Get price history for item
router.get('/market/prices/:itemId', async (req: AuthenticatedRequest, res): Promise<void> => {
  try {
    const itemId = req.params.itemId!;
    const days = parseInt(req.query.days as string) || 7;
    const priceHistory = await economyService.getPriceHistory(itemId, days);
    res.json(priceHistory);
  } catch (error) {
    console.error('Error fetching price history:', error);
    res.status(500).json({ 
      error: 'Failed to fetch price history',
      code: 'FETCH_PRICE_HISTORY_ERROR' 
    });
  }
});

// GET /api/economy/market/trends - Get market trends
router.get('/market/trends', async (req: AuthenticatedRequest, res) => {
  try {
    const trends = await economyService.getMarketTrends();
    res.json(trends);
  } catch (error) {
    console.error('Error fetching market trends:', error);
    res.status(500).json({ 
      error: 'Failed to fetch market trends',
      code: 'FETCH_TRENDS_ERROR' 
    });
  }
});

// POST /api/economy/trade/initiate - Initiate trade with another player
router.post('/trade/initiate', async (req: AuthenticatedRequest, res): Promise<void> => {
  try {
    const validatedData = InitiateTradeSchema.parse(req.body);
    const trade = await tradingService.initiateTradeForAPI(
      req.player!.playerId,
      validatedData.targetPlayerId,
      validatedData.offeredItems,
      validatedData.requestedItems,
      validatedData.message
    );
    res.status(201).json(trade);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ 
        error: 'Invalid trade data',
        code: 'VALIDATION_ERROR',
        details: error.errors 
      });
      return;
    }
    console.error('Error initiating trade:', error);
    res.status(500).json({ 
      error: 'Failed to initiate trade',
      code: 'INITIATE_TRADE_ERROR' 
    });
  }
});

// GET /api/economy/trade/active - Get active trades for player
router.get('/trade/active', async (req: AuthenticatedRequest, res) => {
  try {
    const trades = await tradingService.getActiveTrades(req.player!.playerId);
    res.json(trades);
  } catch (error) {
    console.error('Error fetching active trades:', error);
    res.status(500).json({ 
      error: 'Failed to fetch active trades',
      code: 'FETCH_ACTIVE_TRADES_ERROR' 
    });
  }
});

// POST /api/economy/trade/:tradeId/accept - Accept a trade
router.post('/trade/:tradeId/accept', async (req: AuthenticatedRequest, res): Promise<void> => {
  try {
    const tradeId = req.params.tradeId!;
    const result = await tradingService.acceptTradeForAPI(req.player!.playerId, tradeId);
    
    if (!result.success) {
      res.status(400).json({ 
        error: result.error || 'Failed to accept trade',
        code: 'ACCEPT_TRADE_FAILED' 
      });
      return;
    }
    
    res.json(result);
  } catch (error) {
    console.error('Error accepting trade:', error);
    res.status(500).json({ 
      error: 'Failed to accept trade',
      code: 'ACCEPT_TRADE_ERROR' 
    });
  }
});

// POST /api/economy/trade/:tradeId/decline - Decline a trade
router.post('/trade/:tradeId/decline', async (req: AuthenticatedRequest, res): Promise<void> => {
  try {
    const tradeId = req.params.tradeId!;
    const result = await tradingService.declineTradeForAPI(req.player!.playerId, tradeId);
    
    if (!result.success) {
      res.status(400).json({ 
        error: result.error || 'Failed to decline trade',
        code: 'DECLINE_TRADE_FAILED' 
      });
      return;
    }
    
    res.json(result);
  } catch (error) {
    console.error('Error declining trade:', error);
    res.status(500).json({ 
      error: 'Failed to decline trade',
      code: 'DECLINE_TRADE_ERROR' 
    });
  }
});

// GET /api/economy/trade/history - Get trade history for player
router.get('/trade/history', async (req: AuthenticatedRequest, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;
    const history = await tradingService.getTradeHistoryForAPI(req.player!.playerId, limit, offset);
    res.json(history);
  } catch (error) {
    console.error('Error fetching trade history:', error);
    res.status(500).json({ 
      error: 'Failed to fetch trade history',
      code: 'FETCH_TRADE_HISTORY_ERROR' 
    });
  }
});

export default router;