import { 
  Trade, 
  TradeStatus, 
  TradeRequest, 
  TradeUpdate, 
  TradeConfirmation, 
  TradeResult, 
  TradeHistory, 
  TradeValidator, 
  TradeFactory 
} from '../models/Trade';
import { ItemStack } from '../models/Item';
import { PlayerRepository } from '../repositories/PlayerRepository';

export interface TradingService {
  initiateTrade(initiatorId: string, request: TradeRequest): Promise<TradeResult>;
  acceptTrade(recipientId: string, tradeId: string): Promise<TradeResult>;
  declineTrade(recipientId: string, tradeId: string): Promise<TradeResult>;
  updateTradeOffer(playerId: string, tradeId: string, update: TradeUpdate): Promise<TradeResult>;
  confirmTrade(confirmation: TradeConfirmation): Promise<TradeResult>;
  cancelTrade(playerId: string, tradeId: string, reason?: string): Promise<TradeResult>;
  completeTrade(tradeId: string): Promise<TradeResult>;
  getTrade(tradeId: string): Promise<Trade | null>;
  getPlayerTrades(playerId: string, includeCompleted?: boolean): Promise<Trade[]>;
  getTradeHistory(playerId: string, limit?: number): Promise<TradeHistory[]>;
  cleanupExpiredTrades(): Promise<number>;
}

export interface TradeSecurityCheck {
  isValid: boolean;
  reason?: string;
}

export interface TradeNotification {
  type: 'TRADE_REQUEST' | 'TRADE_ACCEPTED' | 'TRADE_DECLINED' | 'TRADE_UPDATED' | 'TRADE_CONFIRMED' | 'TRADE_COMPLETED' | 'TRADE_CANCELLED';
  tradeId: string;
  fromPlayerId: string;
  toPlayerId: string;
  message?: string | undefined;
  timestamp: Date;
}

export class TradingServiceImpl implements TradingService {
  private playerRepository: PlayerRepository;
  private activeTrades: Map<string, Trade> = new Map();
  private tradeHistory: Map<string, TradeHistory[]> = new Map();
  private readonly MAX_ACTIVE_TRADES_PER_PLAYER = 5;
  private readonly TRADE_COMPLETION_DELAY_MS = 3000; // 3 second delay for final confirmation

  constructor(playerRepository?: PlayerRepository) {
    this.playerRepository = playerRepository || (new MockPlayerRepository() as any);
  }

  async initiateTrade(initiatorId: string, request: TradeRequest): Promise<TradeResult> {
    try {
      // Validate players exist
      const [initiator, recipient] = await Promise.all([
        this.playerRepository.findById(initiatorId),
        this.playerRepository.findById(request.recipientId)
      ]);

      if (!initiator) {
        return { success: false, error: 'Initiator not found' };
      }

      if (!recipient) {
        return { success: false, error: 'Recipient not found' };
      }

      // Check if players can trade
      const securityCheck = await this.performSecurityCheck(initiatorId, request.recipientId);
      if (!securityCheck.isValid) {
        return { success: false, error: securityCheck.reason || 'Security check failed' };
      }

      // Check active trade limits
      const initiatorActiveTrades = await this.getPlayerActiveTrades(initiatorId);
      const recipientActiveTrades = await this.getPlayerActiveTrades(request.recipientId);

      if (initiatorActiveTrades.length >= this.MAX_ACTIVE_TRADES_PER_PLAYER) {
        return { success: false, error: 'You have too many active trades' };
      }

      if (recipientActiveTrades.length >= this.MAX_ACTIVE_TRADES_PER_PLAYER) {
        return { success: false, error: 'Recipient has too many active trades' };
      }

      // Check for existing trade between these players
      const existingTrade = initiatorActiveTrades.find(trade => 
        trade.recipientId === request.recipientId || trade.initiatorId === request.recipientId
      );

      if (existingTrade) {
        return { success: false, error: 'You already have an active trade with this player' };
      }

      // Create new trade
      const trade = TradeFactory.createTrade(initiatorId, request.recipientId);
      
      // Validate the trade
      const validation = TradeValidator.validateTrade(trade);
      if (!validation.isValid) {
        return { success: false, error: validation.errors.join(', ') };
      }

      // Store the trade
      this.activeTrades.set(trade.id, trade);

      // Send notification to recipient
      await this.sendTradeNotification({
        type: 'TRADE_REQUEST',
        tradeId: trade.id,
        fromPlayerId: initiatorId,
        toPlayerId: request.recipientId,
        message: request.message,
        timestamp: new Date()
      });

      return { success: true, trade };

    } catch (error) {
      console.error('Error initiating trade:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error occurred' 
      };
    }
  }

  async acceptTrade(recipientId: string, tradeId: string): Promise<TradeResult> {
    try {
      const trade = this.activeTrades.get(tradeId);
      if (!trade) {
        return { success: false, error: 'Trade not found' };
      }

      if (trade.recipientId !== recipientId) {
        return { success: false, error: 'You are not the recipient of this trade' };
      }

      if (trade.status !== TradeStatus.PENDING) {
        return { success: false, error: 'Trade is not in pending status' };
      }

      if (TradeValidator.isTradeExpired(trade)) {
        trade.status = TradeStatus.EXPIRED;
        return { success: false, error: 'Trade has expired' };
      }

      // Update trade status to active
      trade.status = TradeStatus.ACTIVE;
      trade.updatedAt = new Date();

      // Send notification to initiator
      await this.sendTradeNotification({
        type: 'TRADE_ACCEPTED',
        tradeId: trade.id,
        fromPlayerId: recipientId,
        toPlayerId: trade.initiatorId,
        timestamp: new Date()
      });

      return { success: true, trade };

    } catch (error) {
      console.error('Error accepting trade:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error occurred' 
      };
    }
  }

  async declineTrade(recipientId: string, tradeId: string): Promise<TradeResult> {
    try {
      const trade = this.activeTrades.get(tradeId);
      if (!trade) {
        return { success: false, error: 'Trade not found' };
      }

      if (trade.recipientId !== recipientId) {
        return { success: false, error: 'You are not the recipient of this trade' };
      }

      if (trade.status !== TradeStatus.PENDING) {
        return { success: false, error: 'Trade is not in pending status' };
      }

      // Update trade status to cancelled
      trade.status = TradeStatus.CANCELLED;
      trade.cancelledBy = recipientId;
      trade.cancelReason = 'Declined by recipient';
      trade.updatedAt = new Date();

      // Send notification to initiator
      await this.sendTradeNotification({
        type: 'TRADE_DECLINED',
        tradeId: trade.id,
        fromPlayerId: recipientId,
        toPlayerId: trade.initiatorId,
        timestamp: new Date()
      });

      // Remove from active trades
      this.activeTrades.delete(tradeId);

      return { success: true, trade };

    } catch (error) {
      console.error('Error declining trade:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error occurred' 
      };
    }
  }

  async updateTradeOffer(playerId: string, tradeId: string, update: TradeUpdate): Promise<TradeResult> {
    try {
      const trade = this.activeTrades.get(tradeId);
      if (!trade) {
        return { success: false, error: 'Trade not found' };
      }

      if (trade.initiatorId !== playerId && trade.recipientId !== playerId) {
        return { success: false, error: 'You are not a participant in this trade' };
      }

      if (!TradeValidator.canModifyTrade(trade)) {
        return { success: false, error: 'Trade cannot be modified in its current state' };
      }

      // Determine which offer to update
      const isInitiator = trade.initiatorId === playerId;
      const offer = isInitiator ? trade.initiatorOffer : trade.recipientOffer;
      const otherOffer = isInitiator ? trade.recipientOffer : trade.initiatorOffer;

      // Validate player has the items they're offering
      if (update.items) {
        const hasItems = await this.validatePlayerHasItems(playerId, update.items);
        if (!hasItems.isValid) {
          return { success: false, error: hasItems.reason || 'Player does not have required items' };
        }
      }

      // Validate player has the currency they're offering
      if (update.currency !== undefined) {
        const hasCurrency = await this.validatePlayerHasCurrency(playerId, update.currency);
        if (!hasCurrency.isValid) {
          return { success: false, error: hasCurrency.reason || 'Player does not have required currency' };
        }
      }

      // Update the offer
      if (update.items !== undefined) {
        offer.items = [...update.items];
      }
      if (update.currency !== undefined) {
        offer.currency = update.currency;
      }

      // Reset confirmations when offer is updated
      offer.confirmed = false;
      delete (offer as any).confirmedAt;
      otherOffer.confirmed = false;
      delete (otherOffer as any).confirmedAt;

      trade.updatedAt = new Date();

      // Validate the updated trade
      const validation = TradeValidator.validateTrade(trade);
      if (!validation.isValid) {
        return { success: false, error: validation.errors.join(', ') };
      }

      // Send notification to other player
      const otherPlayerId = isInitiator ? trade.recipientId : trade.initiatorId;
      await this.sendTradeNotification({
        type: 'TRADE_UPDATED',
        tradeId: trade.id,
        fromPlayerId: playerId,
        toPlayerId: otherPlayerId,
        timestamp: new Date()
      });

      return { success: true, trade };

    } catch (error) {
      console.error('Error updating trade offer:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error occurred' 
      };
    }
  }

  async confirmTrade(confirmation: TradeConfirmation): Promise<TradeResult> {
    try {
      const trade = this.activeTrades.get(confirmation.tradeId);
      if (!trade) {
        return { success: false, error: 'Trade not found' };
      }

      if (trade.initiatorId !== confirmation.playerId && trade.recipientId !== confirmation.playerId) {
        return { success: false, error: 'You are not a participant in this trade' };
      }

      if (!TradeValidator.canModifyTrade(trade)) {
        return { success: false, error: 'Trade cannot be confirmed in its current state' };
      }

      // Determine which offer to confirm
      const isInitiator = trade.initiatorId === confirmation.playerId;
      const offer = isInitiator ? trade.initiatorOffer : trade.recipientOffer;

      // Confirm the offer
      offer.confirmed = true;
      offer.confirmedAt = new Date();
      trade.updatedAt = new Date();

      // Send notification to other player
      const otherPlayerId = isInitiator ? trade.recipientId : trade.initiatorId;
      await this.sendTradeNotification({
        type: 'TRADE_CONFIRMED',
        tradeId: trade.id,
        fromPlayerId: confirmation.playerId,
        toPlayerId: otherPlayerId,
        timestamp: new Date()
      });

      // Check if both parties have confirmed
      if (TradeValidator.isTradeBothConfirmed(trade)) {
        // Add a small delay before completing the trade for final confirmation
        setTimeout(async () => {
          await this.completeTrade(trade.id);
        }, this.TRADE_COMPLETION_DELAY_MS);
      }

      return { success: true, trade };

    } catch (error) {
      console.error('Error confirming trade:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error occurred' 
      };
    }
  }

  async cancelTrade(playerId: string, tradeId: string, reason?: string): Promise<TradeResult> {
    try {
      const trade = this.activeTrades.get(tradeId);
      if (!trade) {
        return { success: false, error: 'Trade not found' };
      }

      if (trade.initiatorId !== playerId && trade.recipientId !== playerId) {
        return { success: false, error: 'You are not a participant in this trade' };
      }

      if (trade.status === TradeStatus.COMPLETED) {
        return { success: false, error: 'Cannot cancel a completed trade' };
      }

      // Update trade status
      trade.status = TradeStatus.CANCELLED;
      trade.cancelledBy = playerId;
      trade.cancelReason = reason || 'Cancelled by player';
      trade.updatedAt = new Date();

      // Send notification to other player
      const otherPlayerId = trade.initiatorId === playerId ? trade.recipientId : trade.initiatorId;
      await this.sendTradeNotification({
        type: 'TRADE_CANCELLED',
        tradeId: trade.id,
        fromPlayerId: playerId,
        toPlayerId: otherPlayerId,
        message: reason,
        timestamp: new Date()
      });

      // Remove from active trades
      this.activeTrades.delete(tradeId);

      return { success: true, trade };

    } catch (error) {
      console.error('Error cancelling trade:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error occurred' 
      };
    }
  }

  async completeTrade(tradeId: string): Promise<TradeResult> {
    try {
      const trade = this.activeTrades.get(tradeId);
      if (!trade) {
        return { success: false, error: 'Trade not found' };
      }

      if (!TradeValidator.canCompleteTrade(trade)) {
        return { success: false, error: 'Trade cannot be completed' };
      }

      // Final validation before completion
      const finalValidation = await this.performFinalTradeValidation(trade);
      if (!finalValidation.isValid) {
        return { success: false, error: finalValidation.reason || 'Final trade validation failed' };
      }

      // Execute the trade transaction
      const transactionResult = await this.executeTradeTransaction(trade);
      if (!transactionResult.success) {
        return transactionResult;
      }

      // Update trade status
      trade.status = TradeStatus.COMPLETED;
      trade.completedAt = new Date();
      trade.updatedAt = new Date();

      // Create trade history record
      const historyRecord = await this.createTradeHistoryRecord(trade);

      // Add to trade history for both players
      this.addToTradeHistory(trade.initiatorId, historyRecord);
      this.addToTradeHistory(trade.recipientId, historyRecord);

      // Send completion notifications
      await Promise.all([
        this.sendTradeNotification({
          type: 'TRADE_COMPLETED',
          tradeId: trade.id,
          fromPlayerId: trade.initiatorId,
          toPlayerId: trade.recipientId,
          timestamp: new Date()
        }),
        this.sendTradeNotification({
          type: 'TRADE_COMPLETED',
          tradeId: trade.id,
          fromPlayerId: trade.recipientId,
          toPlayerId: trade.initiatorId,
          timestamp: new Date()
        })
      ]);

      // Remove from active trades
      this.activeTrades.delete(tradeId);

      return { success: true, trade };

    } catch (error) {
      console.error('Error completing trade:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error occurred' 
      };
    }
  }

  async getTrade(tradeId: string): Promise<Trade | null> {
    return this.activeTrades.get(tradeId) || null;
  }

  async getPlayerTrades(playerId: string, includeCompleted: boolean = false): Promise<Trade[]> {
    const activeTrades = Array.from(this.activeTrades.values()).filter(trade =>
      trade.initiatorId === playerId || trade.recipientId === playerId
    );

    if (!includeCompleted) {
      return activeTrades;
    }

    // In a real implementation, this would query the database for completed trades
    return activeTrades;
  }

  async getTradeHistory(playerId: string, limit: number = 50): Promise<TradeHistory[]> {
    const history = this.tradeHistory.get(playerId) || [];
    return history.slice(0, limit);
  }

  async cleanupExpiredTrades(): Promise<number> {
    let cleanedCount = 0;
    const now = new Date();

    for (const [tradeId, trade] of this.activeTrades.entries()) {
      if (trade.expiresAt <= now && trade.status !== TradeStatus.COMPLETED) {
        trade.status = TradeStatus.EXPIRED;
        trade.updatedAt = now;

        // Send expiration notifications
        await Promise.all([
          this.sendTradeNotification({
            type: 'TRADE_CANCELLED',
            tradeId: trade.id,
            fromPlayerId: 'system',
            toPlayerId: trade.initiatorId,
            message: 'Trade expired',
            timestamp: now
          }),
          this.sendTradeNotification({
            type: 'TRADE_CANCELLED',
            tradeId: trade.id,
            fromPlayerId: 'system',
            toPlayerId: trade.recipientId,
            message: 'Trade expired',
            timestamp: now
          })
        ]);

        this.activeTrades.delete(tradeId);
        cleanedCount++;
      }
    }

    return cleanedCount;
  }

  private async getPlayerActiveTrades(playerId: string): Promise<Trade[]> {
    return Array.from(this.activeTrades.values()).filter(trade =>
      (trade.initiatorId === playerId || trade.recipientId === playerId) &&
      trade.status !== TradeStatus.COMPLETED &&
      trade.status !== TradeStatus.CANCELLED &&
      trade.status !== TradeStatus.EXPIRED
    );
  }

  private async performSecurityCheck(initiatorId: string, recipientId: string): Promise<TradeSecurityCheck> {
    // Basic security checks
    if (initiatorId === recipientId) {
      return { isValid: false, reason: 'Cannot trade with yourself' };
    }

    // In a real implementation, this would check for:
    // - Player blacklists
    // - Account restrictions
    // - Anti-fraud measures
    // - Rate limiting

    return { isValid: true };
  }

  private async validatePlayerHasItems(playerId: string, items: ItemStack[]): Promise<TradeSecurityCheck> {
    const player = await this.playerRepository.findById(playerId);
    if (!player) {
      return { isValid: false, reason: 'Player not found' };
    }

    for (const item of items) {
      const hasItem = player.inventory.some(stack =>
        stack.itemId === item.itemId &&
        stack.quantity >= item.quantity &&
        JSON.stringify(stack.metadata) === JSON.stringify(item.metadata)
      );

      if (!hasItem) {
        return { isValid: false, reason: `Insufficient quantity of item: ${item.itemId}` };
      }
    }

    return { isValid: true };
  }

  private async validatePlayerHasCurrency(playerId: string, amount: number): Promise<TradeSecurityCheck> {
    if (amount <= 0) {
      return { isValid: true };
    }

    const player = await this.playerRepository.findById(playerId);
    if (!player) {
      return { isValid: false, reason: 'Player not found' };
    }

    if (player.currency.coins < amount) {
      return { isValid: false, reason: 'Insufficient currency' };
    }

    return { isValid: true };
  }

  private async performFinalTradeValidation(trade: Trade): Promise<TradeSecurityCheck> {
    // Validate both players still have their offered items and currency
    const initiatorValidation = await Promise.all([
      this.validatePlayerHasItems(trade.initiatorId, trade.initiatorOffer.items),
      this.validatePlayerHasCurrency(trade.initiatorId, trade.initiatorOffer.currency)
    ]);

    const recipientValidation = await Promise.all([
      this.validatePlayerHasItems(trade.recipientId, trade.recipientOffer.items),
      this.validatePlayerHasCurrency(trade.recipientId, trade.recipientOffer.currency)
    ]);

    for (const validation of [...initiatorValidation, ...recipientValidation]) {
      if (!validation.isValid) {
        return validation;
      }
    }

    return { isValid: true };
  }

  private async executeTradeTransaction(trade: Trade): Promise<TradeResult> {
    try {
      // Get both players
      const [initiator, recipient] = await Promise.all([
        this.playerRepository.findById(trade.initiatorId),
        this.playerRepository.findById(trade.recipientId)
      ]);

      if (!initiator || !recipient) {
        return { success: false, error: 'One or both players not found' };
      }

      // Remove items and currency from initiator
      await this.removeItemsFromPlayer(initiator, trade.initiatorOffer.items);
      initiator.currency.coins -= trade.initiatorOffer.currency;

      // Remove items and currency from recipient
      await this.removeItemsFromPlayer(recipient, trade.recipientOffer.items);
      recipient.currency.coins -= trade.recipientOffer.currency;

      // Add items and currency to initiator (from recipient's offer)
      await this.addItemsToPlayer(initiator, trade.recipientOffer.items);
      initiator.currency.coins += trade.recipientOffer.currency;

      // Add items and currency to recipient (from initiator's offer)
      await this.addItemsToPlayer(recipient, trade.initiatorOffer.items);
      recipient.currency.coins += trade.initiatorOffer.currency;

      // Update both players in the database
      await Promise.all([
        this.playerRepository.update(initiator.id, {
          inventory: initiator.inventory,
          currency: initiator.currency
        }),
        this.playerRepository.update(recipient.id, {
          inventory: recipient.inventory,
          currency: recipient.currency
        })
      ]);

      return { success: true, trade };

    } catch (error) {
      console.error('Error executing trade transaction:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Transaction failed'
      };
    }
  }

  private async removeItemsFromPlayer(player: any, items: ItemStack[]): Promise<void> {
    for (const item of items) {
      let remainingToRemove = item.quantity;
      
      for (let i = player.inventory.length - 1; i >= 0 && remainingToRemove > 0; i--) {
        const stack = player.inventory[i];
        if (stack && stack.itemId === item.itemId &&
            JSON.stringify(stack.metadata) === JSON.stringify(item.metadata)) {
          
          const amountToRemove = Math.min(remainingToRemove, stack.quantity);
          stack.quantity -= amountToRemove;
          remainingToRemove -= amountToRemove;

          if (stack.quantity === 0) {
            player.inventory.splice(i, 1);
          }
        }
      }
    }
  }

  private async addItemsToPlayer(player: any, items: ItemStack[]): Promise<void> {
    for (const item of items) {
      // Try to stack with existing items
      const existingStack = player.inventory.find((stack: { itemId: string; metadata: any; }) =>
        stack.itemId === item.itemId &&
        JSON.stringify(stack.metadata) === JSON.stringify(item.metadata)
      );

      if (existingStack) {
        existingStack.quantity += item.quantity;
      } else {
        player.inventory.push({ ...item });
      }
    }
  }

  private async createTradeHistoryRecord(trade: Trade): Promise<TradeHistory> {
    return {
      id: this.generateId(),
      tradeId: trade.id,
      initiatorId: trade.initiatorId,
      recipientId: trade.recipientId,
      initiatorItems: [...trade.initiatorOffer.items],
      recipientItems: [...trade.recipientOffer.items],
      initiatorCurrency: trade.initiatorOffer.currency,
      recipientCurrency: trade.recipientOffer.currency,
      completedAt: trade.completedAt!,
      transactionFee: 0 // No transaction fee for direct trades
    };
  }

  private addToTradeHistory(playerId: string, record: TradeHistory): void {
    if (!this.tradeHistory.has(playerId)) {
      this.tradeHistory.set(playerId, []);
    }
    
    const history = this.tradeHistory.get(playerId)!;
    history.unshift(record); // Add to beginning
    
    // Keep only the last 100 trades per player
    if (history.length > 100) {
      history.splice(100);
    }
  }

  private async sendTradeNotification(notification: TradeNotification): Promise<void> {
    // In a real implementation, this would send notifications through:
    // - WebSocket connections for real-time updates
    // - Push notifications
    // - In-game mail system
    console.log('Trade notification:', notification);
  }

  private generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substring(2, 9);
  }

  /**
   * Initiate trade with API parameters
   */
  async initiateTradeForAPI(initiatorId: string, targetPlayerId: string, offeredItems: any[], requestedItems?: any[], message?: string): Promise<Trade> {
    const request: TradeRequest = {
      recipientId: targetPlayerId,
      message: message || ''
    };

    const result = await this.initiateTrade(initiatorId, request);
    if (!result.success || !result.trade) {
      throw new Error(result.error || 'Failed to initiate trade');
    }

    return result.trade;
  }

  /**
   * Get active trades for API
   */
  async getActiveTrades(playerId: string): Promise<Trade[]> {
    return await this.getPlayerTrades(playerId, false);
  }

  /**
   * Accept trade for API
   */
  async acceptTradeForAPI(playerId: string, tradeId: string): Promise<{ success: boolean; error?: string }> {
    const result = await this.acceptTrade(playerId, tradeId);
    return { success: result.success, ...(result.error && { error: result.error }) };
  }

  /**
   * Decline trade for API
   */
  async declineTradeForAPI(playerId: string, tradeId: string): Promise<{ success: boolean; error?: string }> {
    const result = await this.declineTrade(playerId, tradeId);
    return { success: result.success, ...(result.error && { error: result.error }) };
  }

  /**
   * Get trade history for API
   */
  async getTradeHistoryForAPI(playerId: string, limit: number, offset: number): Promise<any> {
    const history = await this.getTradeHistory(playerId, limit + offset);
    return {
      trades: history.slice(offset, offset + limit),
      total: history.length,
      hasMore: history.length > offset + limit
    };
  }
}

// Mock repository for testing
class MockPlayerRepository {
  private players: Map<string, any> = new Map();

  async findById(id: string): Promise<any> {
    return this.players.get(id) || {
      id,
      username: 'mockuser',
      inventory: [],
      currency: { coins: 1000 }
    };
  }

  async update(id: string, updates: any): Promise<any> {
    const player = await this.findById(id);
    const updated = { ...player, ...updates };
    this.players.set(id, updated);
    return updated;
  }
}