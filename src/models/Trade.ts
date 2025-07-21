import { ItemStack } from './Item';

export interface Trade {
  id: string;
  initiatorId: string;
  recipientId: string;
  status: TradeStatus;
  initiatorOffer: TradeOffer;
  recipientOffer: TradeOffer;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date;
  completedAt?: Date;
  cancelledBy?: string;
  cancelReason?: string;
}

export interface TradeOffer {
  items: ItemStack[];
  currency: number;
  confirmed: boolean;
  confirmedAt?: Date;
}

export enum TradeStatus {
  PENDING = 'pending',
  ACTIVE = 'active',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
  EXPIRED = 'expired'
}

export interface TradeRequest {
  recipientId: string;
  message?: string;
}

export interface TradeUpdate {
  items?: ItemStack[];
  currency?: number;
}

export interface TradeConfirmation {
  tradeId: string;
  playerId: string;
}

export interface TradeResult {
  success: boolean;
  trade?: Trade;
  error?: string;
}

export interface TradeHistory {
  id: string;
  tradeId: string;
  initiatorId: string;
  recipientId: string;
  initiatorItems: ItemStack[];
  recipientItems: ItemStack[];
  initiatorCurrency: number;
  recipientCurrency: number;
  completedAt: Date;
  transactionFee: number;
}

export interface TradeValidationResult {
  isValid: boolean;
  errors: string[];
}

export class TradeValidator {
  private static readonly MAX_ITEMS_PER_TRADE = 27; // 3x9 grid
  private static readonly MAX_CURRENCY_PER_TRADE = 1000000; // 1 million coins
  private static readonly TRADE_TIMEOUT_MINUTES = 30;

  /**
   * Validate a complete trade
   */
  static validateTrade(trade: Trade): TradeValidationResult {
    const errors: string[] = [];

    // Validate basic fields
    if (!trade.id || typeof trade.id !== 'string') {
      errors.push('Trade ID is required and must be a string');
    }

    if (!trade.initiatorId || typeof trade.initiatorId !== 'string') {
      errors.push('Initiator ID is required and must be a string');
    }

    if (!trade.recipientId || typeof trade.recipientId !== 'string') {
      errors.push('Recipient ID is required and must be a string');
    }

    if (trade.initiatorId === trade.recipientId) {
      errors.push('Cannot trade with yourself');
    }

    if (!Object.values(TradeStatus).includes(trade.status)) {
      errors.push('Invalid trade status');
    }

    // Validate trade offers
    const initiatorValidation = this.validateTradeOffer(trade.initiatorOffer, 'initiator');
    if (!initiatorValidation.isValid) {
      errors.push(...initiatorValidation.errors);
    }

    const recipientValidation = this.validateTradeOffer(trade.recipientOffer, 'recipient');
    if (!recipientValidation.isValid) {
      errors.push(...recipientValidation.errors);
    }

    // Validate dates
    if (!(trade.createdAt instanceof Date) || isNaN(trade.createdAt.getTime())) {
      errors.push('Created date must be a valid Date object');
    }

    if (!(trade.updatedAt instanceof Date) || isNaN(trade.updatedAt.getTime())) {
      errors.push('Updated date must be a valid Date object');
    }

    if (!(trade.expiresAt instanceof Date) || isNaN(trade.expiresAt.getTime())) {
      errors.push('Expires date must be a valid Date object');
    }

    if (trade.expiresAt <= trade.createdAt) {
      errors.push('Expiration date must be after creation date');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Validate a trade offer
   */
  static validateTradeOffer(offer: TradeOffer, offerType: string): TradeValidationResult {
    const errors: string[] = [];

    if (!Array.isArray(offer.items)) {
      errors.push(`${offerType} items must be an array`);
    } else {
      if (offer.items.length > this.MAX_ITEMS_PER_TRADE) {
        errors.push(`${offerType} cannot offer more than ${this.MAX_ITEMS_PER_TRADE} items`);
      }

      // Validate each item
      offer.items.forEach((item, index) => {
        if (!item.itemId || typeof item.itemId !== 'string') {
          errors.push(`${offerType} item ${index}: Item ID is required and must be a string`);
        }

        if (typeof item.quantity !== 'number' || item.quantity <= 0) {
          errors.push(`${offerType} item ${index}: Quantity must be a positive number`);
        }
      });
    }

    if (typeof offer.currency !== 'number' || offer.currency < 0) {
      errors.push(`${offerType} currency must be a non-negative number`);
    }

    if (offer.currency > this.MAX_CURRENCY_PER_TRADE) {
      errors.push(`${offerType} cannot offer more than ${this.MAX_CURRENCY_PER_TRADE} coins`);
    }

    if (typeof offer.confirmed !== 'boolean') {
      errors.push(`${offerType} confirmed status must be a boolean`);
    }

    if (offer.confirmedAt && (!(offer.confirmedAt instanceof Date) || isNaN(offer.confirmedAt.getTime()))) {
      errors.push(`${offerType} confirmed date must be a valid Date object`);
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Check if a trade has expired
   */
  static isTradeExpired(trade: Trade): boolean {
    return new Date() > trade.expiresAt;
  }

  /**
   * Check if both parties have confirmed the trade
   */
  static isTradeBothConfirmed(trade: Trade): boolean {
    return trade.initiatorOffer.confirmed && trade.recipientOffer.confirmed;
  }

  /**
   * Check if a trade can be modified
   */
  static canModifyTrade(trade: Trade): boolean {
    return trade.status === TradeStatus.ACTIVE && !this.isTradeExpired(trade);
  }

  /**
   * Check if a trade can be completed
   */
  static canCompleteTrade(trade: Trade): boolean {
    return (
      trade.status === TradeStatus.ACTIVE &&
      this.isTradeBothConfirmed(trade) &&
      !this.isTradeExpired(trade)
    );
  }
}

export class TradeFactory {
  private static readonly TRADE_TIMEOUT_MINUTES = 30;

  /**
   * Create a new trade between two players
   */
  static createTrade(initiatorId: string, recipientId: string): Trade {
    if (!initiatorId || !recipientId) {
      throw new Error('Both initiator and recipient IDs are required');
    }

    if (initiatorId === recipientId) {
      throw new Error('Cannot create trade with yourself');
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.TRADE_TIMEOUT_MINUTES * 60 * 1000);

    return {
      id: this.generateTradeId(),
      initiatorId,
      recipientId,
      status: TradeStatus.PENDING,
      initiatorOffer: {
        items: [],
        currency: 0,
        confirmed: false
      },
      recipientOffer: {
        items: [],
        currency: 0,
        confirmed: false
      },
      createdAt: now,
      updatedAt: now,
      expiresAt
    };
  }

  /**
   * Generate a unique trade ID
   */
  private static generateTradeId(): string {
    return 'trade_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 9);
  }
}