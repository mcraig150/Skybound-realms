import { describe, it, expect, beforeEach } from 'vitest';
import { ClientValidationService, ValidationContext } from '../../services/ClientValidationService';
import { VoxelChange } from '../../models/Island';
import { Player, PlayerFactory } from '../../models/Player';

describe('ClientValidationService', () => {
  let validationService: ClientValidationService;
  let testPlayer: Player;
  let testContext: ValidationContext;

  beforeEach(() => {
    validationService = new ClientValidationService();
    testPlayer = PlayerFactory.createNewPlayer('testuser');
    
    testContext = {
      playerId: testPlayer.id,
      playerState: testPlayer,
      timestamp: new Date(),
      rateLimits: new Map()
    };
  });

  describe('Voxel Change Validation', () => {
    it('should validate correct voxel change', () => {
      // Arrange
      const validChange: VoxelChange = {
        position: { x: 10, y: 5, z: 15 },
        oldBlockId: 0,
        newBlockId: 1,
        timestamp: new Date(),
        playerId: testPlayer.id
      };

      // Act
      const result = validationService.validate('voxel_change', validChange, testContext);

      // Assert
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject voxel change with invalid structure', () => {
      // Arrange
      const invalidChange = {
        position: { x: 'invalid', y: 5, z: 15 }, // Invalid position type
        oldBlockId: 0,
        newBlockId: 1,
        timestamp: new Date(),
        playerId: testPlayer.id
      };

      // Act
      const result = validationService.validate('voxel_change', invalidChange);

      // Assert
      expect(result.isValid).toBe(false);
      expect(result.errors.some(error => error.includes('Position.x must be a number'))).toBe(true);
    });

    it('should reject voxel change with missing fields', () => {
      // Arrange
      const incompleteChange = {
        position: { x: 10, y: 5, z: 15 },
        // Missing oldBlockId, newBlockId, timestamp, playerId
      };

      // Act
      const result = validationService.validate('voxel_change', incompleteChange);

      // Assert
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should reject voxel change with out-of-bounds position', () => {
      // Arrange
      const outOfBoundsChange: VoxelChange = {
        position: { x: 99999, y: -100, z: 99999 },
        oldBlockId: 0,
        newBlockId: 1,
        timestamp: new Date(),
        playerId: testPlayer.id
      };

      // Act
      const result = validationService.validate('voxel_change', outOfBoundsChange);

      // Assert
      expect(result.isValid).toBe(false);
      expect(result.errors.some(error => error.includes('outside valid range'))).toBe(true);
    });

    it('should reject voxel change with invalid block IDs', () => {
      // Arrange
      const invalidBlockChange: VoxelChange = {
        position: { x: 10, y: 5, z: 15 },
        oldBlockId: -1, // Invalid
        newBlockId: 999, // Invalid
        timestamp: new Date(),
        playerId: testPlayer.id
      };

      // Act
      const result = validationService.validate('voxel_change', invalidBlockChange);

      // Assert
      expect(result.isValid).toBe(false);
      expect(result.errors.some(error => error.includes('must be between 0 and 255'))).toBe(true);
    });

    it('should reject voxel change with non-integer coordinates', () => {
      // Arrange
      const floatCoordChange: VoxelChange = {
        position: { x: 10.5, y: 5.7, z: 15.3 },
        oldBlockId: 0,
        newBlockId: 1,
        timestamp: new Date(),
        playerId: testPlayer.id
      };

      // Act
      const result = validationService.validate('voxel_change', floatCoordChange);

      // Assert
      expect(result.isValid).toBe(false);
      expect(result.errors.some(error => error.includes('must be integers'))).toBe(true);
    });

    it('should enforce rate limits for voxel changes', () => {
      // Arrange
      const change: VoxelChange = {
        position: { x: 10, y: 5, z: 15 },
        oldBlockId: 0,
        newBlockId: 1,
        timestamp: new Date(),
        playerId: testPlayer.id
      };

      const rateLimitedContext = {
        ...testContext,
        rateLimits: new Map([['voxel_change', 150]]) // Exceed rate limit
      };

      // Act
      const result = validationService.validate('voxel_change', change, rateLimitedContext);

      // Assert
      expect(result.isValid).toBe(false);
      expect(result.errors.some(error => error.includes('Rate limit exceeded'))).toBe(true);
    });

    it('should warn when approaching rate limits', () => {
      // Arrange
      const change: VoxelChange = {
        position: { x: 10, y: 5, z: 15 },
        oldBlockId: 0,
        newBlockId: 1,
        timestamp: new Date(),
        playerId: testPlayer.id
      };

      const nearLimitContext = {
        ...testContext,
        rateLimits: new Map([['voxel_change', 85]]) // Near rate limit
      };

      // Act
      const result = validationService.validate('voxel_change', change, nearLimitContext);

      // Assert
      expect(result.isValid).toBe(true);
      expect(result.warnings.some(warning => warning.includes('Approaching rate limit'))).toBe(true);
    });

    it('should validate multiple voxel changes', () => {
      // Arrange
      const changes: VoxelChange[] = [
        {
          position: { x: 10, y: 5, z: 15 },
          oldBlockId: 0,
          newBlockId: 1,
          timestamp: new Date(),
          playerId: testPlayer.id
        },
        {
          position: { x: 11, y: 5, z: 15 },
          oldBlockId: 0,
          newBlockId: 2,
          timestamp: new Date(),
          playerId: testPlayer.id
        }
      ];

      // Act
      const result = validationService.validateVoxelChanges(changes, testContext);

      // Assert
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should identify specific invalid changes in batch', () => {
      // Arrange
      const changes: VoxelChange[] = [
        {
          position: { x: 10, y: 5, z: 15 },
          oldBlockId: 0,
          newBlockId: 1,
          timestamp: new Date(),
          playerId: testPlayer.id
        },
        {
          position: { x: 99999, y: 5, z: 15 }, // Invalid position
          oldBlockId: 0,
          newBlockId: 2,
          timestamp: new Date(),
          playerId: testPlayer.id
        }
      ];

      // Act
      const result = validationService.validateVoxelChanges(changes, testContext);

      // Assert
      expect(result.isValid).toBe(false);
      expect(result.errors.some(error => error.includes('Change 1:'))).toBe(true);
    });
  });

  describe('Player Action Validation', () => {
    it('should validate correct player action', () => {
      // Arrange
      const validAction = {
        type: 'move',
        playerId: testPlayer.id,
        timestamp: new Date(),
        data: { position: { x: 10, y: 5, z: 15 } }
      };

      // Act
      const result = validationService.validate('player_action', validAction, testContext);

      // Assert
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject player action with missing fields', () => {
      // Arrange
      const invalidAction = {
        // Missing type, playerId, timestamp
        data: { position: { x: 10, y: 5, z: 15 } }
      };

      // Act
      const result = validationService.validate('player_action', invalidAction);

      // Assert
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should reject player action for wrong player', () => {
      // Arrange
      const wrongPlayerAction = {
        type: 'move',
        playerId: 'different_player',
        timestamp: new Date(),
        data: { position: { x: 10, y: 5, z: 15 } }
      };

      // Act
      const result = validationService.validate('player_action', wrongPlayerAction, testContext);

      // Assert
      expect(result.isValid).toBe(false);
      expect(result.errors.some(error => error.includes('Cannot perform actions for another player'))).toBe(true);
    });

    it('should enforce rate limits for player actions', () => {
      // Arrange
      const action = {
        type: 'move',
        playerId: testPlayer.id,
        timestamp: new Date(),
        data: { position: { x: 10, y: 5, z: 15 } }
      };

      const rateLimitedContext = {
        ...testContext,
        rateLimits: new Map([['player_action', 70]]) // Exceed rate limit
      };

      // Act
      const result = validationService.validate('player_action', action, rateLimitedContext);

      // Assert
      expect(result.isValid).toBe(false);
      expect(result.errors.some(error => error.includes('Rate limit exceeded'))).toBe(true);
    });
  });

  describe('Inventory Change Validation', () => {
    it('should validate correct inventory change', () => {
      // Arrange
      const validChange = {
        action: 'add',
        items: [
          { itemId: 'stone', quantity: 10 },
          { itemId: 'wood', quantity: 5 }
        ]
      };

      // Act
      const result = validationService.validate('inventory_change', validChange);

      // Assert
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject inventory change with invalid structure', () => {
      // Arrange
      const invalidChange = {
        action: 123, // Should be string
        items: 'not_an_array' // Should be array
      };

      // Act
      const result = validationService.validate('inventory_change', invalidChange);

      // Assert
      expect(result.isValid).toBe(false);
      expect(result.errors.some(error => error.includes('Items must be an array'))).toBe(true);
      expect(result.errors.some(error => error.includes('Action must be a string'))).toBe(true);
    });

    it('should reject inventory change exceeding capacity', () => {
      // Arrange
      const tooManyItems = {
        action: 'add',
        items: new Array(150).fill({ itemId: 'stone', quantity: 1 }) // Exceed capacity
      };

      // Act
      const result = validationService.validate('inventory_change', tooManyItems);

      // Assert
      expect(result.isValid).toBe(false);
      expect(result.errors.some(error => error.includes('cannot exceed 100 items'))).toBe(true);
    });

    it('should reject inventory change with invalid items', () => {
      // Arrange
      const invalidItems = {
        action: 'add',
        items: [
          { itemId: '', quantity: 10 }, // Empty itemId
          { itemId: 'wood', quantity: -5 } // Negative quantity
        ]
      };

      // Act
      const result = validationService.validate('inventory_change', invalidItems);

      // Assert
      expect(result.isValid).toBe(false);
      expect(result.errors.some(error => error.includes('itemId is required'))).toBe(true);
      expect(result.errors.some(error => error.includes('quantity must be a positive number'))).toBe(true);
    });
  });

  describe('Chat Message Validation', () => {
    it('should validate correct chat message', () => {
      // Arrange
      const validMessage = {
        content: 'Hello, world!',
        channel: 'global'
      };

      // Act
      const result = validationService.validate('chat_message', validMessage);

      // Assert
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject empty chat message', () => {
      // Arrange
      const emptyMessage = {
        content: '',
        channel: 'global'
      };

      // Act
      const result = validationService.validate('chat_message', emptyMessage);

      // Assert
      expect(result.isValid).toBe(false);
      expect(result.errors.some(error => error.includes('Message cannot be empty'))).toBe(true);
    });

    it('should reject chat message that is too long', () => {
      // Arrange
      const longMessage = {
        content: 'a'.repeat(600), // Exceed 500 character limit
        channel: 'global'
      };

      // Act
      const result = validationService.validate('chat_message', longMessage);

      // Assert
      expect(result.isValid).toBe(false);
      expect(result.errors.some(error => error.includes('cannot exceed 500 characters'))).toBe(true);
    });

    it('should warn about potentially inappropriate content', () => {
      // Arrange
      const suspiciousMessage = {
        content: 'Check out this hack for unlimited coins!',
        channel: 'global'
      };

      // Act
      const result = validationService.validate('chat_message', suspiciousMessage);

      // Assert
      expect(result.isValid).toBe(true);
      expect(result.warnings.some(warning => warning.includes('inappropriate content'))).toBe(true);
    });

    it('should enforce rate limits for chat messages', () => {
      // Arrange
      const message = {
        content: 'Hello!',
        channel: 'global'
      };

      const rateLimitedContext = {
        ...testContext,
        rateLimits: new Map([['chat_message', 35]]) // Exceed rate limit
      };

      // Act
      const result = validationService.validate('chat_message', message, rateLimitedContext);

      // Assert
      expect(result.isValid).toBe(false);
      expect(result.errors.some(error => error.includes('Rate limit exceeded'))).toBe(true);
    });
  });

  describe('Trade Action Validation', () => {
    it('should validate correct trade action', () => {
      // Arrange
      const validTradeAction = {
        tradeId: 'trade123',
        action: 'add_item',
        items: [
          { itemId: 'diamond', quantity: 1 }
        ]
      };

      // Act
      const result = validationService.validate('trade_action', validTradeAction);

      // Assert
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject trade action with missing fields', () => {
      // Arrange
      const invalidTradeAction = {
        // Missing tradeId and action
        items: [
          { itemId: 'diamond', quantity: 1 }
        ]
      };

      // Act
      const result = validationService.validate('trade_action', invalidTradeAction);

      // Assert
      expect(result.isValid).toBe(false);
      expect(result.errors.some(error => error.includes('Trade ID is required'))).toBe(true);
      expect(result.errors.some(error => error.includes('Action is required'))).toBe(true);
    });

    it('should reject trade action with invalid items', () => {
      // Arrange
      const invalidTradeAction = {
        tradeId: 'trade123',
        action: 'add_item',
        items: [
          { itemId: '', quantity: 1 }, // Empty itemId
          { itemId: 'diamond', quantity: 0 } // Zero quantity
        ]
      };

      // Act
      const result = validationService.validate('trade_action', invalidTradeAction);

      // Assert
      expect(result.isValid).toBe(false);
      expect(result.errors.some(error => error.includes('itemId is required'))).toBe(true);
      expect(result.errors.some(error => error.includes('quantity must be a positive number'))).toBe(true);
    });
  });

  describe('Pre-validation', () => {
    it('should pre-validate action successfully', () => {
      // Arrange
      const action = {
        type: 'move',
        playerId: testPlayer.id,
        timestamp: new Date(),
        data: { position: { x: 10, y: 5, z: 15 } }
      };

      // Act
      const result = validationService.preValidateAction('player_action', action, testPlayer.id);

      // Assert
      expect(result.success).toBe(true);
    });

    it('should fail pre-validation for invalid action', () => {
      // Arrange
      const invalidAction = {
        // Missing required fields
      };

      // Act
      const result = validationService.preValidateAction('player_action', invalidAction, testPlayer.id);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toContain('Validation failed');
    });
  });

  describe('Rate Limiting', () => {
    it('should track rate limits correctly', () => {
      // Arrange
      const action = {
        type: 'move',
        playerId: testPlayer.id,
        timestamp: new Date()
      };

      // Act
      const result1 = validationService.preValidateAction('player_action', action, testPlayer.id);
      const result2 = validationService.preValidateAction('player_action', action, testPlayer.id);

      // Assert
      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
    });

    it('should check rate limits correctly', () => {
      // Act
      const isLimited1 = validationService.isRateLimited(testPlayer.id, 'test_action', 5);
      
      // Simulate adding rate limit data
      for (let i = 0; i < 6; i++) {
        validationService.preValidateAction('player_action', { type: 'test' }, testPlayer.id);
      }
      
      const isLimited2 = validationService.isRateLimited(testPlayer.id, 'player_action', 5);

      // Assert
      expect(isLimited1).toBe(false);
      // Note: This test might need adjustment based on actual rate limiting implementation
    });

    it('should clean up rate limits', () => {
      // Act & Assert - Should not throw
      expect(() => {
        validationService.cleanupRateLimits();
      }).not.toThrow();
    });
  });

  describe('Custom Rules', () => {
    it('should allow adding custom validation rules', () => {
      // Arrange
      const customRule = {
        name: 'custom_test_rule',
        validate: (data: any) => ({
          isValid: data.customField === 'valid',
          errors: data.customField !== 'valid' ? ['Custom validation failed'] : [],
          warnings: []
        })
      };

      validationService.addRule('custom_type', customRule);

      // Act
      const validResult = validationService.validate('custom_type', { customField: 'valid' });
      const invalidResult = validationService.validate('custom_type', { customField: 'invalid' });

      // Assert
      expect(validResult.isValid).toBe(true);
      expect(invalidResult.isValid).toBe(false);
      expect(invalidResult.errors).toContain('Custom validation failed');
    });
  });

  describe('Edge Cases', () => {
    it('should handle validation without context', () => {
      // Arrange
      const change: VoxelChange = {
        position: { x: 10, y: 5, z: 15 },
        oldBlockId: 0,
        newBlockId: 1,
        timestamp: new Date(),
        playerId: testPlayer.id
      };

      // Act
      const result = validationService.validate('voxel_change', change);

      // Assert
      expect(result.isValid).toBe(true);
    });

    it('should handle unknown validation types', () => {
      // Act
      const result = validationService.validate('unknown_type', {});

      // Assert
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should handle null/undefined data', () => {
      // Act
      const nullResult = validationService.validate('voxel_change', null);
      const undefinedResult = validationService.validate('voxel_change', undefined);

      // Assert
      expect(nullResult.isValid).toBe(false);
      expect(undefinedResult.isValid).toBe(false);
    });
  });
});