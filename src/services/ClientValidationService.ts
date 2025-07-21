import { Vector3, ServiceResult } from '../shared/types';
import { VoxelChange } from '../models/Island';
import { Player } from '../models/Player';
import { ItemStack } from '../models/Item';

export interface ClientValidationRule {
  name: string;
  validate(data: any, context?: any): ValidationResult;
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export interface ValidationContext {
  playerId: string;
  playerState: Player;
  timestamp: Date;
  rateLimits: Map<string, number>;
}

export class ClientValidationService {
  private rules: Map<string, ClientValidationRule[]> = new Map();
  private rateLimits: Map<string, Map<string, number>> = new Map(); // playerId -> action -> count

  constructor() {
    this.initializeValidationRules();
  }

  /**
   * Initialize all validation rules
   */
  private initializeValidationRules(): void {
    // Voxel change validation rules
    this.addRule('voxel_change', new VoxelChangeStructureRule());
    this.addRule('voxel_change', new VoxelChangePositionRule());
    this.addRule('voxel_change', new VoxelChangeBlockTypeRule());
    this.addRule('voxel_change', new VoxelChangeRateLimitRule());
    this.addRule('voxel_change', new VoxelChangePermissionRule());

    // Player action validation rules
    this.addRule('player_action', new PlayerActionStructureRule());
    this.addRule('player_action', new PlayerActionPermissionRule());
    this.addRule('player_action', new PlayerActionRateLimitRule());

    // Inventory validation rules
    this.addRule('inventory_change', new InventoryChangeStructureRule());
    this.addRule('inventory_change', new InventoryChangeCapacityRule());
    this.addRule('inventory_change', new InventoryChangeItemValidityRule());

    // Chat message validation rules
    this.addRule('chat_message', new ChatMessageStructureRule());
    this.addRule('chat_message', new ChatMessageContentRule());
    this.addRule('chat_message', new ChatMessageRateLimitRule());

    // Trade validation rules
    this.addRule('trade_action', new TradeActionStructureRule());
    this.addRule('trade_action', new TradeActionPermissionRule());
    this.addRule('trade_action', new TradeActionItemValidityRule());
  }

  /**
   * Add a validation rule for a specific data type
   */
  addRule(dataType: string, rule: ClientValidationRule): void {
    if (!this.rules.has(dataType)) {
      this.rules.set(dataType, []);
    }
    this.rules.get(dataType)!.push(rule);
  }

  /**
   * Validate data against all rules for its type
   */
  validate(dataType: string, data: any, context?: ValidationContext): ValidationResult {
    const rules = this.rules.get(dataType) || [];
    const allErrors: string[] = [];
    const allWarnings: string[] = [];

    for (const rule of rules) {
      const result = rule.validate(data, context);
      allErrors.push(...result.errors);
      allWarnings.push(...result.warnings);
    }

    return {
      isValid: allErrors.length === 0,
      errors: allErrors,
      warnings: allWarnings
    };
  }

  /**
   * Validate multiple voxel changes
   */
  validateVoxelChanges(changes: VoxelChange[], context: ValidationContext): ValidationResult {
    const allErrors: string[] = [];
    const allWarnings: string[] = [];

    for (let i = 0; i < changes.length; i++) {
      const result = this.validate('voxel_change', changes[i], context);
      
      // Prefix errors with change index for identification
      allErrors.push(...result.errors.map(error => `Change ${i}: ${error}`));
      allWarnings.push(...result.warnings.map(warning => `Change ${i}: ${warning}`));
    }

    return {
      isValid: allErrors.length === 0,
      errors: allErrors,
      warnings: allWarnings
    };
  }

  /**
   * Pre-validate action before sending to server
   */
  preValidateAction(actionType: string, actionData: any, playerId: string): ServiceResult<void> {
    const context: ValidationContext = {
      playerId,
      playerState: {} as Player, // Would be populated with actual player state
      timestamp: new Date(),
      rateLimits: this.rateLimits.get(playerId) || new Map()
    };

    const result = this.validate(actionType, actionData, context);

    if (!result.isValid) {
      return {
        success: false,
        error: `Validation failed: ${result.errors.join(', ')}`
      };
    }

    // Update rate limits
    this.updateRateLimits(playerId, actionType);

    return { success: true };
  }

  /**
   * Update rate limits for a player action
   */
  private updateRateLimits(playerId: string, actionType: string): void {
    if (!this.rateLimits.has(playerId)) {
      this.rateLimits.set(playerId, new Map());
    }

    const playerLimits = this.rateLimits.get(playerId)!;
    const currentCount = playerLimits.get(actionType) || 0;
    playerLimits.set(actionType, currentCount + 1);

    // Clean up old rate limit data periodically
    setTimeout(() => {
      const count = playerLimits.get(actionType) || 0;
      if (count > 0) {
        playerLimits.set(actionType, count - 1);
      }
    }, 60000); // Reset after 1 minute
  }

  /**
   * Check if action is rate limited
   */
  isRateLimited(playerId: string, actionType: string, limit: number): boolean {
    const playerLimits = this.rateLimits.get(playerId);
    if (!playerLimits) return false;

    const currentCount = playerLimits.get(actionType) || 0;
    return currentCount >= limit;
  }

  /**
   * Clean up old rate limit data
   */
  cleanupRateLimits(): void {
    // Remove empty rate limit maps
    for (const [playerId, limits] of this.rateLimits.entries()) {
      if (limits.size === 0) {
        this.rateLimits.delete(playerId);
      }
    }
  }
}

// Validation Rules Implementation

/**
 * Voxel Change Structure Validation
 */
class VoxelChangeStructureRule implements ClientValidationRule {
  name = 'voxel_change_structure';

  validate(change: VoxelChange): ValidationResult {
    const errors: string[] = [];

    if (!change || !change.position || typeof change.position !== 'object') {
      errors.push('Position is required and must be an object');
    } else {
      if (typeof change.position.x !== 'number') errors.push('Position.x must be a number');
      if (typeof change.position.y !== 'number') errors.push('Position.y must be a number');
      if (typeof change.position.z !== 'number') errors.push('Position.z must be a number');
    }

    if (typeof change.oldBlockId !== 'number') {
      errors.push('oldBlockId must be a number');
    }

    if (typeof change.newBlockId !== 'number') {
      errors.push('newBlockId must be a number');
    }

    if (!change.timestamp || !(change.timestamp instanceof Date)) {
      errors.push('timestamp must be a valid Date');
    }

    if (!change.playerId || typeof change.playerId !== 'string') {
      errors.push('playerId must be a string');
    }

    return { isValid: errors.length === 0, errors, warnings: [] };
  }
}

/**
 * Voxel Change Position Validation
 */
class VoxelChangePositionRule implements ClientValidationRule {
  name = 'voxel_change_position';

  validate(change: VoxelChange): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!change.position) {
      return { isValid: false, errors: ['Position is required'], warnings: [] };
    }

    // Check for reasonable position bounds
    const maxCoord = 10000;
    const minCoord = -10000;

    if (change.position.x < minCoord || change.position.x > maxCoord) {
      errors.push(`Position.x (${change.position.x}) is outside valid range [${minCoord}, ${maxCoord}]`);
    }

    if (change.position.y < 0 || change.position.y > 256) {
      errors.push(`Position.y (${change.position.y}) is outside valid range [0, 256]`);
    }

    if (change.position.z < minCoord || change.position.z > maxCoord) {
      errors.push(`Position.z (${change.position.z}) is outside valid range [${minCoord}, ${maxCoord}]`);
    }

    // Check for integer coordinates
    if (!Number.isInteger(change.position.x) || 
        !Number.isInteger(change.position.y) || 
        !Number.isInteger(change.position.z)) {
      errors.push('Position coordinates must be integers');
    }

    return { isValid: errors.length === 0, errors, warnings };
  }
}

/**
 * Voxel Change Block Type Validation
 */
class VoxelChangeBlockTypeRule implements ClientValidationRule {
  name = 'voxel_change_block_type';

  validate(change: VoxelChange): ValidationResult {
    const errors: string[] = [];

    // Valid block IDs (0 = air, 1-255 = various blocks)
    if (change.oldBlockId < 0 || change.oldBlockId > 255) {
      errors.push(`oldBlockId (${change.oldBlockId}) must be between 0 and 255`);
    }

    if (change.newBlockId < 0 || change.newBlockId > 255) {
      errors.push(`newBlockId (${change.newBlockId}) must be between 0 and 255`);
    }

    // Check for integer block IDs
    if (!Number.isInteger(change.oldBlockId)) {
      errors.push('oldBlockId must be an integer');
    }

    if (!Number.isInteger(change.newBlockId)) {
      errors.push('newBlockId must be an integer');
    }

    return { isValid: errors.length === 0, errors, warnings: [] };
  }
}

/**
 * Voxel Change Rate Limit Validation
 */
class VoxelChangeRateLimitRule implements ClientValidationRule {
  name = 'voxel_change_rate_limit';

  validate(change: VoxelChange, context?: ValidationContext): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!context) {
      return { isValid: true, errors, warnings };
    }

    const rateLimitCount = context.rateLimits.get('voxel_change') || 0;
    const maxChangesPerMinute = 100;

    if (rateLimitCount >= maxChangesPerMinute) {
      errors.push('Rate limit exceeded: too many block changes per minute');
    } else if (rateLimitCount >= maxChangesPerMinute * 0.8) {
      warnings.push('Approaching rate limit for block changes');
    }

    return { isValid: errors.length === 0, errors, warnings };
  }
}

/**
 * Voxel Change Permission Validation
 */
class VoxelChangePermissionRule implements ClientValidationRule {
  name = 'voxel_change_permission';

  validate(change: VoxelChange, context?: ValidationContext): ValidationResult {
    const errors: string[] = [];

    if (!context) {
      return { isValid: true, errors, warnings: [] };
    }

    // Check if player has permission to modify this position
    // This would involve checking island ownership, build permissions, etc.
    // For now, simplified validation

    if (change.playerId !== context.playerId) {
      errors.push('Player ID mismatch: cannot modify blocks for another player');
    }

    return { isValid: errors.length === 0, errors, warnings: [] };
  }
}

/**
 * Player Action Structure Validation
 */
class PlayerActionStructureRule implements ClientValidationRule {
  name = 'player_action_structure';

  validate(action: any): ValidationResult {
    const errors: string[] = [];

    if (!action.type || typeof action.type !== 'string') {
      errors.push('Action type is required and must be a string');
    }

    if (!action.playerId || typeof action.playerId !== 'string') {
      errors.push('Player ID is required and must be a string');
    }

    if (!action.timestamp || !(action.timestamp instanceof Date)) {
      errors.push('Timestamp is required and must be a Date');
    }

    return { isValid: errors.length === 0, errors, warnings: [] };
  }
}

/**
 * Player Action Permission Validation
 */
class PlayerActionPermissionRule implements ClientValidationRule {
  name = 'player_action_permission';

  validate(action: any, context?: ValidationContext): ValidationResult {
    const errors: string[] = [];

    if (context && action.playerId !== context.playerId) {
      errors.push('Cannot perform actions for another player');
    }

    return { isValid: errors.length === 0, errors, warnings: [] };
  }
}

/**
 * Player Action Rate Limit Validation
 */
class PlayerActionRateLimitRule implements ClientValidationRule {
  name = 'player_action_rate_limit';

  validate(action: any, context?: ValidationContext): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!context) {
      return { isValid: true, errors, warnings };
    }

    const actionCount = context.rateLimits.get('player_action') || 0;
    const maxActionsPerMinute = 60;

    if (actionCount >= maxActionsPerMinute) {
      errors.push('Rate limit exceeded: too many actions per minute');
    } else if (actionCount >= maxActionsPerMinute * 0.8) {
      warnings.push('Approaching rate limit for player actions');
    }

    return { isValid: errors.length === 0, errors, warnings };
  }
}

/**
 * Inventory Change Structure Validation
 */
class InventoryChangeStructureRule implements ClientValidationRule {
  name = 'inventory_change_structure';

  validate(change: any): ValidationResult {
    const errors: string[] = [];

    if (!Array.isArray(change.items)) {
      errors.push('Items must be an array');
    }

    if (typeof change.action !== 'string') {
      errors.push('Action must be a string');
    }

    return { isValid: errors.length === 0, errors, warnings: [] };
  }
}

/**
 * Inventory Change Capacity Validation
 */
class InventoryChangeCapacityRule implements ClientValidationRule {
  name = 'inventory_change_capacity';

  validate(change: any): ValidationResult {
    const errors: string[] = [];

    if (Array.isArray(change.items) && change.items.length > 100) {
      errors.push('Inventory cannot exceed 100 items');
    }

    return { isValid: errors.length === 0, errors, warnings: [] };
  }
}

/**
 * Inventory Change Item Validity Validation
 */
class InventoryChangeItemValidityRule implements ClientValidationRule {
  name = 'inventory_change_item_validity';

  validate(change: any): ValidationResult {
    const errors: string[] = [];

    if (Array.isArray(change.items)) {
      change.items.forEach((item: ItemStack, index: number) => {
        if (!item.itemId || typeof item.itemId !== 'string') {
          errors.push(`Item ${index}: itemId is required and must be a string`);
        }

        if (typeof item.quantity !== 'number' || item.quantity <= 0) {
          errors.push(`Item ${index}: quantity must be a positive number`);
        }
      });
    }

    return { isValid: errors.length === 0, errors, warnings: [] };
  }
}

/**
 * Chat Message Structure Validation
 */
class ChatMessageStructureRule implements ClientValidationRule {
  name = 'chat_message_structure';

  validate(message: any): ValidationResult {
    const errors: string[] = [];

    if (!message.content || typeof message.content !== 'string') {
      errors.push('Message content is required and must be a string');
    }

    if (!message.channel || typeof message.channel !== 'string') {
      errors.push('Message channel is required and must be a string');
    }

    return { isValid: errors.length === 0, errors, warnings: [] };
  }
}

/**
 * Chat Message Content Validation
 */
class ChatMessageContentRule implements ClientValidationRule {
  name = 'chat_message_content';

  validate(message: any): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (typeof message.content === 'string') {
      if (message.content.length === 0) {
        errors.push('Message cannot be empty');
      }

      if (message.content.length > 500) {
        errors.push('Message cannot exceed 500 characters');
      }

      // Basic profanity filter (simplified)
      const profanityWords = ['spam', 'hack', 'cheat']; // Simplified list
      const containsProfanity = profanityWords.some(word => 
        message.content.toLowerCase().includes(word)
      );

      if (containsProfanity) {
        warnings.push('Message may contain inappropriate content');
      }
    }

    return { isValid: errors.length === 0, errors, warnings };
  }
}

/**
 * Chat Message Rate Limit Validation
 */
class ChatMessageRateLimitRule implements ClientValidationRule {
  name = 'chat_message_rate_limit';

  validate(message: any, context?: ValidationContext): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!context) {
      return { isValid: true, errors, warnings };
    }

    const messageCount = context.rateLimits.get('chat_message') || 0;
    const maxMessagesPerMinute = 30;

    if (messageCount >= maxMessagesPerMinute) {
      errors.push('Rate limit exceeded: too many messages per minute');
    } else if (messageCount >= maxMessagesPerMinute * 0.8) {
      warnings.push('Approaching rate limit for chat messages');
    }

    return { isValid: errors.length === 0, errors, warnings };
  }
}

/**
 * Trade Action Structure Validation
 */
class TradeActionStructureRule implements ClientValidationRule {
  name = 'trade_action_structure';

  validate(action: any): ValidationResult {
    const errors: string[] = [];

    if (!action.tradeId || typeof action.tradeId !== 'string') {
      errors.push('Trade ID is required and must be a string');
    }

    if (!action.action || typeof action.action !== 'string') {
      errors.push('Action is required and must be a string');
    }

    return { isValid: errors.length === 0, errors, warnings: [] };
  }
}

/**
 * Trade Action Permission Validation
 */
class TradeActionPermissionRule implements ClientValidationRule {
  name = 'trade_action_permission';

  validate(action: any, context?: ValidationContext): ValidationResult {
    const errors: string[] = [];

    // Check if player is authorized to perform this trade action
    // This would involve checking if they're part of the trade
    // Simplified for now

    return { isValid: errors.length === 0, errors, warnings: [] };
  }
}

/**
 * Trade Action Item Validity Validation
 */
class TradeActionItemValidityRule implements ClientValidationRule {
  name = 'trade_action_item_validity';

  validate(action: any): ValidationResult {
    const errors: string[] = [];

    if (action.items && Array.isArray(action.items)) {
      action.items.forEach((item: ItemStack, index: number) => {
        if (!item.itemId || typeof item.itemId !== 'string') {
          errors.push(`Trade item ${index}: itemId is required and must be a string`);
        }

        if (typeof item.quantity !== 'number' || item.quantity <= 0) {
          errors.push(`Trade item ${index}: quantity must be a positive number`);
        }
      });
    }

    return { isValid: errors.length === 0, errors, warnings: [] };
  }
}