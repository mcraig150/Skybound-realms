// Basic tests for core data models - updated
import { describe, it, expect, beforeEach } from 'vitest';
import { ItemRarity, ItemStack, ItemMetadata, InventoryManager, ItemCategory } from '@models/Item';
import { SkillType, SkillData } from '@models/Skill';
import { Player, PlayerValidator, PlayerFactory } from '@models/Player';
import { 
  Island, 
  WorldChunk, 
  VoxelChange, 
  ChunkCoordinateSystem, 
  VoxelDataManager,
  IslandInstance,
  IslandBlueprint,
  IslandPermissions,
  BuildPermission,
  Entity,
  EntityType
} from '@models/Island';
import { Utils } from '@shared/utils';
import { GAME_CONSTANTS } from '@shared/constants';
import { Vector3, ChunkCoordinate } from '@shared/types';

describe('Core Data Models', () => {
  describe('Utils', () => {
    it('should generate valid UUIDs', () => {
      const id1 = Utils.generateId();
      const id2 = Utils.generateId();
      
      expect(id1).toBeDefined();
      expect(id2).toBeDefined();
      expect(id1).not.toBe(id2);
      expect(id1).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    });

    it('should validate usernames correctly', () => {
      expect(Utils.isValidUsername('validuser123')).toBe(true);
      expect(Utils.isValidUsername('user_name')).toBe(true);
      expect(Utils.isValidUsername('ab')).toBe(false); // too short
      expect(Utils.isValidUsername('verylongusernamethatistoolong')).toBe(false); // too long
      expect(Utils.isValidUsername('user-name')).toBe(false); // invalid character
      expect(Utils.isValidUsername('user name')).toBe(false); // space
    });

    it('should calculate experience correctly', () => {
      expect(Utils.getExperienceForLevel(1)).toBe(0);
      expect(Utils.getExperienceForLevel(2)).toBeGreaterThan(0);
      expect(Utils.getLevelFromExperience(0)).toBe(1);
      expect(Utils.getLevelFromExperience(1000)).toBeGreaterThan(1);
    });

    it('should clamp values correctly', () => {
      expect(Utils.clamp(5, 0, 10)).toBe(5);
      expect(Utils.clamp(-5, 0, 10)).toBe(0);
      expect(Utils.clamp(15, 0, 10)).toBe(10);
    });

    it('should calculate 3D distance correctly', () => {
      const point1 = { x: 0, y: 0, z: 0 };
      const point2 = { x: 3, y: 4, z: 0 };
      expect(Utils.distance3D(point1, point2)).toBe(5);
    });

    it('should roll for rarity correctly', () => {
      const rarity = Utils.rollForRarity();
      expect(Object.values(ItemRarity)).toContain(rarity);
    });
  });

  describe('Constants', () => {
    it('should have valid game constants', () => {
      expect(GAME_CONSTANTS.MAX_SKILL_LEVEL).toBeGreaterThan(0);
      expect(GAME_CONSTANTS.MAX_PRESTIGE_LEVEL).toBeGreaterThan(0);
      expect(GAME_CONSTANTS.MAX_INVENTORY_SIZE).toBeGreaterThan(0);
      expect(GAME_CONSTANTS.STARTING_COINS).toBeGreaterThan(0);
    });
  });

  describe('Enums', () => {
    it('should have all required skill types', () => {
      const skillTypes = Object.values(SkillType);
      expect(skillTypes).toContain(SkillType.MINING);
      expect(skillTypes).toContain(SkillType.FARMING);
      expect(skillTypes).toContain(SkillType.COMBAT);
      expect(skillTypes).toContain(SkillType.CRAFTING);
    });

    it('should have all required item rarities', () => {
      const rarities = Object.values(ItemRarity);
      expect(rarities).toContain(ItemRarity.COMMON);
      expect(rarities).toContain(ItemRarity.LEGENDARY);
      expect(rarities).toContain(ItemRarity.DIVINE);
    });
  });

  describe('Player Model', () => {
    describe('PlayerFactory', () => {
      it('should create a new player with valid defaults', () => {
        const username = 'testuser123';
        const player = PlayerFactory.createNewPlayer(username);

        expect(player.id).toBeDefined();
        expect(player.username).toBe(username);
        expect(player.islandId).toBeDefined();
        expect(player.skills).toBeInstanceOf(Map);
        expect(player.inventory).toEqual([]);
        expect(player.equipment).toEqual({});
        expect(player.currency.coins).toBe(GAME_CONSTANTS.STARTING_COINS);
        expect(player.currency.dungeonTokens).toBe(0);
        expect(player.currency.eventCurrency).toBe(0);
        expect(player.currency.guildPoints).toBe(0);
        expect(player.minions).toEqual([]);
        expect(player.friends).toEqual([]);
        expect(player.settings.chatEnabled).toBe(true);
        expect(player.lastLogin).toBeInstanceOf(Date);
      });

      it('should initialize all skills at level 1', () => {
        const player = PlayerFactory.createNewPlayer('testuser');
        const skillTypes = Object.values(SkillType);

        expect(player.skills.size).toBe(skillTypes.length);

        skillTypes.forEach(skillType => {
          expect(player.skills.has(skillType)).toBe(true);
          const skillData = player.skills.get(skillType)!;
          expect(skillData.level).toBe(1);
          expect(skillData.experience).toBe(0);
          expect(skillData.prestige).toBe(0);
          expect(skillData.unlockedPerks).toEqual([]);
        });
      });

      it('should throw error for invalid username', () => {
        expect(() => PlayerFactory.createNewPlayer('ab')).toThrow('Invalid username format');
        expect(() => PlayerFactory.createNewPlayer('user-name')).toThrow('Invalid username format');
        expect(() => PlayerFactory.createNewPlayer('')).toThrow('Invalid username format');
      });
    });

    describe('PlayerValidator', () => {
      let validPlayer: Player;

      beforeEach(() => {
        validPlayer = PlayerFactory.createNewPlayer('testuser');
      });

      it('should validate a valid player', () => {
        const result = PlayerValidator.validatePlayer(validPlayer);
        expect(result.isValid).toBe(true);
        expect(result.errors).toEqual([]);
      });

      it('should reject player with invalid ID', () => {
        validPlayer.id = '';
        const result = PlayerValidator.validatePlayer(validPlayer);
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('Player ID is required and must be a string');
      });

      it('should reject player with invalid username', () => {
        validPlayer.username = 'ab';
        const result = PlayerValidator.validatePlayer(validPlayer);
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('Username must be 3-16 characters and contain only letters, numbers, and underscores');
      });

      it('should reject player with invalid island ID', () => {
        validPlayer.islandId = '';
        const result = PlayerValidator.validatePlayer(validPlayer);
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('Island ID is required and must be a string');
      });

      it('should reject player with too many minions', () => {
        validPlayer.minions = new Array(GAME_CONSTANTS.MAX_MINIONS_PER_PLAYER + 1).fill({});
        const result = PlayerValidator.validatePlayer(validPlayer);
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain(`Player cannot have more than ${GAME_CONSTANTS.MAX_MINIONS_PER_PLAYER} minions`);
      });

      it('should reject player with too many friends', () => {
        validPlayer.friends = new Array(GAME_CONSTANTS.MAX_FRIENDS + 1).fill('friend');
        const result = PlayerValidator.validatePlayer(validPlayer);
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain(`Player cannot have more than ${GAME_CONSTANTS.MAX_FRIENDS} friends`);
      });

      it('should reject player with invalid lastLogin', () => {
        validPlayer.lastLogin = new Date('invalid');
        const result = PlayerValidator.validatePlayer(validPlayer);
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('Last login must be a valid Date object');
      });
    });

    describe('PlayerValidator - Skills', () => {
      let validSkills: Map<SkillType, SkillData>;

      beforeEach(() => {
        validSkills = new Map();
        Object.values(SkillType).forEach(skillType => {
          const experience = 150;
          const level = Utils.getLevelFromExperience(experience);
          validSkills.set(skillType, {
            experience,
            level,
            prestige: 0,
            unlockedPerks: []
          });
        });
      });

      it('should validate valid skills', () => {
        const result = PlayerValidator.validateSkills(validSkills);
        expect(result.isValid).toBe(true);
        expect(result.errors).toEqual([]);
      });

      it('should reject missing skills', () => {
        validSkills.delete(SkillType.MINING);
        const result = PlayerValidator.validateSkills(validSkills);
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('Missing required skill: mining');
      });

      it('should reject negative experience', () => {
        validSkills.set(SkillType.MINING, {
          experience: -100,
          level: 1,
          prestige: 0,
          unlockedPerks: []
        });
        const result = PlayerValidator.validateSkills(validSkills);
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('mining experience cannot be negative');
      });

      it('should reject invalid skill level', () => {
        validSkills.set(SkillType.MINING, {
          experience: 0,
          level: 0,
          prestige: 0,
          unlockedPerks: []
        });
        const result = PlayerValidator.validateSkills(validSkills);
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain(`mining level must be between 1 and ${GAME_CONSTANTS.MAX_SKILL_LEVEL}`);
      });

      it('should reject invalid prestige level', () => {
        validSkills.set(SkillType.MINING, {
          experience: 0,
          level: 1,
          prestige: -1,
          unlockedPerks: []
        });
        const result = PlayerValidator.validateSkills(validSkills);
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain(`mining prestige must be between 0 and ${GAME_CONSTANTS.MAX_PRESTIGE_LEVEL}`);
      });

      it('should reject mismatched level and experience', () => {
        validSkills.set(SkillType.MINING, {
          experience: 1000,
          level: 1, // Should be higher based on experience
          prestige: 0,
          unlockedPerks: []
        });
        const result = PlayerValidator.validateSkills(validSkills);
        expect(result.isValid).toBe(false);
        expect(result.errors.some(error => error.includes('level') && error.includes('does not match experience'))).toBe(true);
      });
    });

    describe('PlayerValidator - Inventory', () => {
      it('should validate empty inventory', () => {
        const result = PlayerValidator.validateInventory([]);
        expect(result.isValid).toBe(true);
        expect(result.errors).toEqual([]);
      });

      it('should validate valid inventory', () => {
        const inventory = [
          { itemId: 'stone', quantity: 64 },
          { itemId: 'wood', quantity: 32 }
        ];
        const result = PlayerValidator.validateInventory(inventory);
        expect(result.isValid).toBe(true);
        expect(result.errors).toEqual([]);
      });

      it('should reject inventory that is too large', () => {
        const inventory = new Array(GAME_CONSTANTS.MAX_INVENTORY_SIZE + 1).fill({ itemId: 'stone', quantity: 1 });
        const result = PlayerValidator.validateInventory(inventory);
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain(`Inventory cannot exceed ${GAME_CONSTANTS.MAX_INVENTORY_SIZE} slots`);
      });

      it('should reject items with invalid itemId', () => {
        const inventory = [{ itemId: '', quantity: 1 }];
        const result = PlayerValidator.validateInventory(inventory);
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('Inventory slot 0: Item ID is required and must be a string');
      });

      it('should reject items with invalid quantity', () => {
        const inventory = [{ itemId: 'stone', quantity: 0 }];
        const result = PlayerValidator.validateInventory(inventory);
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('Inventory slot 0: Quantity must be a positive number');
      });

      it('should reject non-array inventory', () => {
        const result = PlayerValidator.validateInventory({} as any);
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('Inventory must be an array');
      });
    });

    describe('PlayerValidator - Currency', () => {
      it('should validate valid currency', () => {
        const currency = {
          coins: 1000,
          dungeonTokens: 50,
          eventCurrency: 25,
          guildPoints: 100
        };
        const result = PlayerValidator.validateCurrency(currency);
        expect(result.isValid).toBe(true);
        expect(result.errors).toEqual([]);
      });

      it('should reject negative currency values', () => {
        const currency = {
          coins: -100,
          dungeonTokens: 50,
          eventCurrency: 25,
          guildPoints: 100
        };
        const result = PlayerValidator.validateCurrency(currency);
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('coins must be a non-negative number');
      });

      it('should reject non-numeric currency values', () => {
        const currency = {
          coins: 'invalid' as any,
          dungeonTokens: 50,
          eventCurrency: 25,
          guildPoints: 100
        };
        const result = PlayerValidator.validateCurrency(currency);
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('coins must be a non-negative number');
      });
    });

    describe('PlayerFactory - Serialization', () => {
      it('should serialize and deserialize player correctly', () => {
        const originalPlayer = PlayerFactory.createNewPlayer('testuser');
        
        // Add some test data
        originalPlayer.skills.set(SkillType.MINING, {
          experience: 500,
          level: 3,
          prestige: 1,
          unlockedPerks: ['perk1', 'perk2']
        });
        originalPlayer.inventory = [{ itemId: 'stone', quantity: 64 }];
        originalPlayer.friends = ['friend1', 'friend2'];

        const serialized = PlayerFactory.serializePlayer(originalPlayer);
        const deserialized = PlayerFactory.deserializePlayer(serialized);

        expect(deserialized.id).toBe(originalPlayer.id);
        expect(deserialized.username).toBe(originalPlayer.username);
        expect(deserialized.islandId).toBe(originalPlayer.islandId);
        expect(deserialized.skills).toBeInstanceOf(Map);
        expect(deserialized.skills.get(SkillType.MINING)).toEqual(originalPlayer.skills.get(SkillType.MINING));
        expect(deserialized.inventory).toEqual(originalPlayer.inventory);
        expect(deserialized.friends).toEqual(originalPlayer.friends);
        expect(deserialized.lastLogin).toBeInstanceOf(Date);
        expect(deserialized.lastLogin.getTime()).toBe(originalPlayer.lastLogin.getTime());
      });

      it('should handle object-format skills during deserialization', () => {
        const serializedData = {
          id: 'test-id',
          username: 'testuser',
          islandId: 'island-id',
          skills: {
            [SkillType.MINING]: {
              experience: 500,
              level: 3,
              prestige: 1,
              unlockedPerks: ['perk1']
            }
          },
          inventory: [],
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
          lastLogin: new Date().toISOString()
        };

        const deserialized = PlayerFactory.deserializePlayer(serializedData);
        expect(deserialized.skills).toBeInstanceOf(Map);
        expect(deserialized.skills.get(SkillType.MINING)).toEqual(serializedData.skills[SkillType.MINING]);
      });
    });
  });

  describe('Item and Inventory System', () => {
    describe('ItemStack Validation', () => {
      it('should validate a valid item stack', () => {
        const itemStack: ItemStack = {
          itemId: 'stone',
          quantity: 32
        };
        const result = InventoryManager.validateItemStack(itemStack);
        expect(result.isValid).toBe(true);
        expect(result.errors).toEqual([]);
      });

      it('should validate item stack with metadata', () => {
        const itemStack: ItemStack = {
          itemId: 'sword',
          quantity: 1,
          metadata: {
            rarity: ItemRarity.RARE,
            enchantments: [
              { id: 'sharpness', level: 3, description: 'Increases damage' }
            ],
            durability: 100
          }
        };
        const result = InventoryManager.validateItemStack(itemStack);
        expect(result.isValid).toBe(true);
        expect(result.errors).toEqual([]);
      });

      it('should reject item stack with invalid itemId', () => {
        const itemStack: ItemStack = {
          itemId: '',
          quantity: 1
        };
        const result = InventoryManager.validateItemStack(itemStack);
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('Item ID is required and must be a string');
      });

      it('should reject item stack with invalid quantity', () => {
        const itemStack: ItemStack = {
          itemId: 'stone',
          quantity: 0
        };
        const result = InventoryManager.validateItemStack(itemStack);
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('Quantity must be a positive number');
      });

      it('should reject item stack exceeding max stack size', () => {
        const itemStack: ItemStack = {
          itemId: 'stone',
          quantity: 100 // Exceeds default max stack size of 64
        };
        const result = InventoryManager.validateItemStack(itemStack);
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('Quantity (100) exceeds max stack size (64)');
      });
    });

    describe('ItemMetadata Validation', () => {
      it('should validate valid metadata', () => {
        const metadata: ItemMetadata = {
          rarity: ItemRarity.EPIC,
          enchantments: [
            { id: 'fire_aspect', level: 2, description: 'Sets enemies on fire' }
          ],
          durability: 150
        };
        const result = InventoryManager.validateItemMetadata(metadata);
        expect(result.isValid).toBe(true);
        expect(result.errors).toEqual([]);
      });

      it('should reject invalid rarity', () => {
        const metadata: ItemMetadata = {
          rarity: 'invalid' as ItemRarity,
          enchantments: []
        };
        const result = InventoryManager.validateItemMetadata(metadata);
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('Invalid item rarity');
      });

      it('should reject non-array enchantments', () => {
        const metadata: ItemMetadata = {
          rarity: ItemRarity.COMMON,
          enchantments: 'invalid' as any
        };
        const result = InventoryManager.validateItemMetadata(metadata);
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('Enchantments must be an array');
      });

      it('should reject enchantments with invalid data', () => {
        const metadata: ItemMetadata = {
          rarity: ItemRarity.COMMON,
          enchantments: [
            { id: '', level: 0, description: 'Invalid enchantment' }
          ]
        };
        const result = InventoryManager.validateItemMetadata(metadata);
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('Enchantment 0: ID is required and must be a string');
        expect(result.errors).toContain('Enchantment 0: Level must be a positive number');
      });

      it('should reject negative durability', () => {
        const metadata: ItemMetadata = {
          rarity: ItemRarity.COMMON,
          enchantments: [],
          durability: -10
        };
        const result = InventoryManager.validateItemMetadata(metadata);
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('Durability must be a non-negative number');
      });
    });

    describe('Inventory Operations', () => {
      let inventory: ItemStack[];

      beforeEach(() => {
        inventory = [];
      });

      describe('Adding Items', () => {
        it('should add items to empty inventory', () => {
          const itemsToAdd: ItemStack = { itemId: 'stone', quantity: 32 };
          const result = InventoryManager.addItems(inventory, itemsToAdd);
          
          expect(result.success).toBe(true);
          expect(result.message).toBe('Items added successfully');
          expect(inventory).toHaveLength(1);
          expect(inventory[0]).toEqual(itemsToAdd);
        });

        it('should stack items with existing stacks', () => {
          inventory.push({ itemId: 'stone', quantity: 32 });
          const itemsToAdd: ItemStack = { itemId: 'stone', quantity: 16 };
          const result = InventoryManager.addItems(inventory, itemsToAdd);
          
          expect(result.success).toBe(true);
          expect(inventory).toHaveLength(1);
          expect(inventory[0]?.quantity).toBe(48);
        });

        it('should create new stack when existing stack is full', () => {
          inventory.push({ itemId: 'stone', quantity: 64 }); // Full stack
          const itemsToAdd: ItemStack = { itemId: 'stone', quantity: 32 };
          const result = InventoryManager.addItems(inventory, itemsToAdd);
          
          expect(result.success).toBe(true);
          expect(inventory).toHaveLength(2);
          expect(inventory[0]?.quantity).toBe(64);
          expect(inventory[1]?.quantity).toBe(32);
        });

        it('should handle inventory full scenario', () => {
          // Fill inventory to max capacity
          for (let i = 0; i < 36; i++) {
            inventory.push({ itemId: `item_${i}`, quantity: 1 });
          }
          
          const itemsToAdd: ItemStack = { itemId: 'new_item', quantity: 1 };
          const result = InventoryManager.addItems(inventory, itemsToAdd, 36);
          
          expect(result.success).toBe(false);
          expect(result.message).toBe('Inventory full');
          expect(result.remainingItems).toEqual(itemsToAdd);
        });

        it('should partially add items when inventory becomes full', () => {
          // Fill inventory almost to capacity
          for (let i = 0; i < 35; i++) {
            inventory.push({ itemId: `item_${i}`, quantity: 1 });
          }
          
          const itemsToAdd: ItemStack = { itemId: 'stone', quantity: 128 }; // 2 full stacks
          const result = InventoryManager.addItems(inventory, itemsToAdd, 36);
          
          expect(result.success).toBe(false);
          expect(result.message).toBe('Inventory full');
          expect(inventory).toHaveLength(36);
          expect(inventory[35]?.quantity).toBe(64); // One full stack added
          expect(result.remainingItems?.quantity).toBe(64); // One stack remaining
        });

        it('should reject invalid items', () => {
          const itemsToAdd: ItemStack = { itemId: 'stone', quantity: 0 };
          const result = InventoryManager.addItems(inventory, itemsToAdd);
          
          expect(result.success).toBe(false);
          expect(result.message).toBe('Invalid items to add');
        });

        it('should not stack items with different metadata', () => {
          inventory.push({ 
            itemId: 'sword', 
            quantity: 1,
            metadata: { rarity: ItemRarity.COMMON, enchantments: [] }
          });
          
          const itemsToAdd: ItemStack = { 
            itemId: 'sword', 
            quantity: 1,
            metadata: { rarity: ItemRarity.RARE, enchantments: [] }
          };
          
          const result = InventoryManager.addItems(inventory, itemsToAdd);
          
          expect(result.success).toBe(true);
          expect(inventory).toHaveLength(2); // Should create new stack
        });
      });

      describe('Removing Items', () => {
        beforeEach(() => {
          inventory.push(
            { itemId: 'stone', quantity: 64 },
            { itemId: 'stone', quantity: 32 },
            { itemId: 'wood', quantity: 16 }
          );
        });

        it('should remove items from inventory', () => {
          const itemsToRemove: ItemStack = { itemId: 'stone', quantity: 48 };
          const result = InventoryManager.removeItems(inventory, itemsToRemove);
          
          expect(result.success).toBe(true);
          expect(result.message).toBe('Items removed successfully');
          expect(InventoryManager.getItemQuantity(inventory, 'stone')).toBe(48);
        });

        it('should remove entire stacks when necessary', () => {
          const itemsToRemove: ItemStack = { itemId: 'stone', quantity: 96 }; // All stone
          const result = InventoryManager.removeItems(inventory, itemsToRemove);
          
          expect(result.success).toBe(true);
          expect(inventory.filter(item => item.itemId === 'stone')).toHaveLength(0);
          expect(inventory).toHaveLength(1); // Only wood remains
        });

        it('should reject removal when not enough items available', () => {
          const itemsToRemove: ItemStack = { itemId: 'stone', quantity: 200 };
          const result = InventoryManager.removeItems(inventory, itemsToRemove);
          
          expect(result.success).toBe(false);
          expect(result.message).toContain('Not enough items');
          expect(result.message).toContain('Available: 96, Required: 200');
        });

        it('should reject invalid removal requests', () => {
          const itemsToRemove: ItemStack = { itemId: 'stone', quantity: 0 };
          const result = InventoryManager.removeItems(inventory, itemsToRemove);
          
          expect(result.success).toBe(false);
          expect(result.message).toBe('Invalid items to remove');
        });

        it('should handle removing non-existent items', () => {
          const itemsToRemove: ItemStack = { itemId: 'diamond', quantity: 1 };
          const result = InventoryManager.removeItems(inventory, itemsToRemove);
          
          expect(result.success).toBe(false);
          expect(result.message).toContain('Not enough items');
        });
      });

      describe('Inventory Queries', () => {
        beforeEach(() => {
          inventory.push(
            { itemId: 'stone', quantity: 64 },
            { itemId: 'stone', quantity: 32 },
            { itemId: 'wood', quantity: 16 }
          );
        });

        it('should get correct item quantity', () => {
          expect(InventoryManager.getItemQuantity(inventory, 'stone')).toBe(96);
          expect(InventoryManager.getItemQuantity(inventory, 'wood')).toBe(16);
          expect(InventoryManager.getItemQuantity(inventory, 'diamond')).toBe(0);
        });

        it('should check if inventory has items', () => {
          expect(InventoryManager.hasItems(inventory, 'stone', 50)).toBe(true);
          expect(InventoryManager.hasItems(inventory, 'stone', 100)).toBe(false);
          expect(InventoryManager.hasItems(inventory, 'wood', 16)).toBe(true);
          expect(InventoryManager.hasItems(inventory, 'diamond', 1)).toBe(false);
        });
      });

      describe('Inventory Consolidation', () => {
        it('should consolidate stackable items', () => {
          inventory.push(
            { itemId: 'stone', quantity: 32 },
            { itemId: 'wood', quantity: 8 },
            { itemId: 'stone', quantity: 16 },
            { itemId: 'wood', quantity: 24 }
          );

          InventoryManager.consolidateInventory(inventory);

          expect(inventory).toHaveLength(2);
          
          const stoneStack = inventory.find(item => item.itemId === 'stone');
          const woodStack = inventory.find(item => item.itemId === 'wood');
          
          expect(stoneStack?.quantity).toBe(48);
          expect(woodStack?.quantity).toBe(32);
        });

        it('should handle items that exceed max stack size during consolidation', () => {
          inventory.push(
            { itemId: 'stone', quantity: 50 },
            { itemId: 'stone', quantity: 50 }
          );

          InventoryManager.consolidateInventory(inventory);

          expect(inventory).toHaveLength(2);
          expect(inventory[0]?.quantity).toBe(64); // Max stack
          expect(inventory[1]?.quantity).toBe(36); // Remainder
        });

        it('should preserve metadata during consolidation', () => {
          const metadata: ItemMetadata = {
            rarity: ItemRarity.RARE,
            enchantments: [{ id: 'test', level: 1, description: 'Test' }]
          };

          inventory.push(
            { itemId: 'sword', quantity: 1, metadata },
            { itemId: 'sword', quantity: 1, metadata }
          );

          InventoryManager.consolidateInventory(inventory);

          expect(inventory).toHaveLength(2); // Weapons don't stack, so they remain separate
          expect(inventory[0]?.quantity).toBe(1);
          expect(inventory[1]?.quantity).toBe(1);
          expect(inventory[0]?.metadata).toEqual(metadata);
          expect(inventory[1]?.metadata).toEqual(metadata);
        });
      });
    });
  });
});
 
 describe('World and Island System', () => {
    describe('ChunkCoordinateSystem', () => {
      it('should convert world position to chunk coordinate correctly', () => {
        // Test positive coordinates
        expect(ChunkCoordinateSystem.worldToChunk({ x: 0, y: 0, z: 0 }))
          .toEqual({ x: 0, y: 0, z: 0 });
        expect(ChunkCoordinateSystem.worldToChunk({ x: 15, y: 15, z: 15 }))
          .toEqual({ x: 0, y: 0, z: 0 });
        expect(ChunkCoordinateSystem.worldToChunk({ x: 16, y: 16, z: 16 }))
          .toEqual({ x: 1, y: 1, z: 1 });
        expect(ChunkCoordinateSystem.worldToChunk({ x: 32, y: 48, z: 64 }))
          .toEqual({ x: 2, y: 3, z: 4 });

        // Test negative coordinates
        expect(ChunkCoordinateSystem.worldToChunk({ x: -1, y: -1, z: -1 }))
          .toEqual({ x: -1, y: -1, z: -1 });
        expect(ChunkCoordinateSystem.worldToChunk({ x: -16, y: -16, z: -16 }))
          .toEqual({ x: -1, y: -1, z: -1 });
        expect(ChunkCoordinateSystem.worldToChunk({ x: -17, y: -17, z: -17 }))
          .toEqual({ x: -2, y: -2, z: -2 });
      });

      it('should convert chunk coordinate to world position correctly', () => {
        expect(ChunkCoordinateSystem.chunkToWorld({ x: 0, y: 0, z: 0 }))
          .toEqual({ x: 0, y: 0, z: 0 });
        expect(ChunkCoordinateSystem.chunkToWorld({ x: 1, y: 1, z: 1 }))
          .toEqual({ x: 16, y: 16, z: 16 });
        expect(ChunkCoordinateSystem.chunkToWorld({ x: -1, y: -1, z: -1 }))
          .toEqual({ x: -16, y: -16, z: -16 });
        expect(ChunkCoordinateSystem.chunkToWorld({ x: 2, y: 3, z: 4 }))
          .toEqual({ x: 32, y: 48, z: 64 });
      });

      it('should get local voxel position within chunk correctly', () => {
        // Test positions within first chunk
        expect(ChunkCoordinateSystem.getLocalVoxelPosition({ x: 0, y: 0, z: 0 }))
          .toEqual({ x: 0, y: 0, z: 0 });
        expect(ChunkCoordinateSystem.getLocalVoxelPosition({ x: 15, y: 15, z: 15 }))
          .toEqual({ x: 15, y: 15, z: 15 });

        // Test positions in other chunks
        expect(ChunkCoordinateSystem.getLocalVoxelPosition({ x: 16, y: 16, z: 16 }))
          .toEqual({ x: 0, y: 0, z: 0 });
        expect(ChunkCoordinateSystem.getLocalVoxelPosition({ x: 31, y: 31, z: 31 }))
          .toEqual({ x: 15, y: 15, z: 15 });

        // Test negative coordinates
        expect(ChunkCoordinateSystem.getLocalVoxelPosition({ x: -1, y: -1, z: -1 }))
          .toEqual({ x: 15, y: 15, z: 15 });
        expect(ChunkCoordinateSystem.getLocalVoxelPosition({ x: -16, y: -16, z: -16 }))
          .toEqual({ x: 0, y: 0, z: 0 });
      });

      it('should generate and parse chunk IDs correctly', () => {
        const chunkPos: ChunkCoordinate = { x: 5, y: -3, z: 10 };
        const chunkId = ChunkCoordinateSystem.generateChunkId(chunkPos);
        
        expect(chunkId).toBe('chunk_5_-3_10');
        
        const parsedPos = ChunkCoordinateSystem.parseChunkId(chunkId);
        expect(parsedPos).toEqual(chunkPos);
      });

      it('should return null for invalid chunk IDs', () => {
        expect(ChunkCoordinateSystem.parseChunkId('invalid_id')).toBeNull();
        expect(ChunkCoordinateSystem.parseChunkId('chunk_1_2')).toBeNull();
        expect(ChunkCoordinateSystem.parseChunkId('chunk_a_b_c')).toBeNull();
      });

      it('should calculate chunk distance correctly', () => {
        const chunk1: ChunkCoordinate = { x: 0, y: 0, z: 0 };
        const chunk2: ChunkCoordinate = { x: 3, y: 4, z: 0 };
        const chunk3: ChunkCoordinate = { x: 0, y: 0, z: 0 };
        
        expect(ChunkCoordinateSystem.chunkDistance(chunk1, chunk2)).toBe(5);
        expect(ChunkCoordinateSystem.chunkDistance(chunk1, chunk3)).toBe(0);
      });

      it('should get neighboring chunks correctly', () => {
        const centerChunk: ChunkCoordinate = { x: 0, y: 0, z: 0 };
        const neighbors = ChunkCoordinateSystem.getNeighboringChunks(centerChunk);
        
        expect(neighbors).toHaveLength(26); // 3x3x3 - 1 (excluding center)
        
        // Check that center chunk is not included
        expect(neighbors.find(chunk => 
          chunk.x === 0 && chunk.y === 0 && chunk.z === 0
        )).toBeUndefined();
        
        // Check that all neighbors are within range
        neighbors.forEach(neighbor => {
          expect(Math.abs(neighbor.x)).toBeLessThanOrEqual(1);
          expect(Math.abs(neighbor.y)).toBeLessThanOrEqual(1);
          expect(Math.abs(neighbor.z)).toBeLessThanOrEqual(1);
        });
      });
    });

    describe('VoxelDataManager', () => {
      let testChunk: WorldChunk;

      beforeEach(() => {
        testChunk = {
          chunkId: 'chunk_0_0_0',
          position: { x: 0, y: 0, z: 0 },
          voxelData: VoxelDataManager.createEmptyChunkData(),
          entities: [],
          lastModified: new Date(),
          isLoaded: true,
          isDirty: false
        };
      });

      it('should create empty chunk data with correct size', () => {
        const emptyData = VoxelDataManager.createEmptyChunkData();
        expect(emptyData).toBeInstanceOf(Uint8Array);
        expect(emptyData.length).toBe(VoxelDataManager.VOXELS_PER_CHUNK);
        expect(emptyData.every(value => value === 0)).toBe(true);
      });

      it('should calculate voxel index correctly', () => {
        expect(VoxelDataManager.getVoxelIndex({ x: 0, y: 0, z: 0 })).toBe(0);
        expect(VoxelDataManager.getVoxelIndex({ x: 1, y: 0, z: 0 })).toBe(1);
        expect(VoxelDataManager.getVoxelIndex({ x: 0, y: 1, z: 0 })).toBe(16);
        expect(VoxelDataManager.getVoxelIndex({ x: 0, y: 0, z: 1 })).toBe(256);
        expect(VoxelDataManager.getVoxelIndex({ x: 15, y: 15, z: 15 })).toBe(4095);
      });

      it('should get position from voxel index correctly', () => {
        expect(VoxelDataManager.getPositionFromIndex(0)).toEqual({ x: 0, y: 0, z: 0 });
        expect(VoxelDataManager.getPositionFromIndex(1)).toEqual({ x: 1, y: 0, z: 0 });
        expect(VoxelDataManager.getPositionFromIndex(16)).toEqual({ x: 0, y: 1, z: 0 });
        expect(VoxelDataManager.getPositionFromIndex(256)).toEqual({ x: 0, y: 0, z: 1 });
        expect(VoxelDataManager.getPositionFromIndex(4095)).toEqual({ x: 15, y: 15, z: 15 });
      });

      it('should get and set voxels correctly', () => {
        const worldPos: Vector3 = { x: 5, y: 10, z: 8 };
        
        // Initially should be 0 (air)
        expect(VoxelDataManager.getVoxelAt(testChunk, worldPos)).toBe(0);
        
        // Set to stone (block ID 1)
        VoxelDataManager.setVoxelAt(testChunk, worldPos, 1);
        expect(VoxelDataManager.getVoxelAt(testChunk, worldPos)).toBe(1);
        expect(testChunk.isDirty).toBe(true);
      });

      it('should handle world positions outside chunk bounds', () => {
        // Test positions that would be in different chunks
        const worldPos1: Vector3 = { x: 16, y: 0, z: 0 }; // Next chunk over
        const worldPos2: Vector3 = { x: -1, y: 0, z: 0 }; // Previous chunk
        
        // Should still work due to modulo operation in getLocalVoxelPosition
        VoxelDataManager.setVoxelAt(testChunk, worldPos1, 2);
        VoxelDataManager.setVoxelAt(testChunk, worldPos2, 3);
        
        expect(VoxelDataManager.getVoxelAt(testChunk, worldPos1)).toBe(2);
        expect(VoxelDataManager.getVoxelAt(testChunk, worldPos2)).toBe(3);
      });

      it('should compress and decompress voxel data correctly', () => {
        // Create test data with patterns
        const testData = new Uint8Array(VoxelDataManager.VOXELS_PER_CHUNK);
        
        // Fill with pattern: first 100 voxels = 1, next 200 = 2, rest = 0
        testData.fill(1, 0, 100);
        testData.fill(2, 100, 300);
        // Rest remains 0
        
        const compressed = VoxelDataManager.compressVoxelData(testData);
        const decompressed = VoxelDataManager.decompressVoxelData(compressed);
        
        expect(decompressed).toEqual(testData);
        expect(compressed.length).toBeLessThan(testData.length); // Should be smaller
      });

      it('should handle compression edge cases', () => {
        // Test all same value
        const uniformData = new Uint8Array(VoxelDataManager.VOXELS_PER_CHUNK);
        uniformData.fill(5);
        
        const compressed = VoxelDataManager.compressVoxelData(uniformData);
        const decompressed = VoxelDataManager.decompressVoxelData(compressed);
        
        expect(decompressed).toEqual(uniformData);
        // The compression should be much smaller than original data
        expect(compressed.length).toBeLessThan(uniformData.length);
        // For uniform data, we expect multiple runs due to the 255 count limit
        expect(compressed.length).toBeGreaterThan(0);
        expect(compressed.length % 2).toBe(0); // Should be pairs of [value, count]
      });

      it('should detect empty chunks correctly', () => {
        const emptyData = VoxelDataManager.createEmptyChunkData();
        expect(VoxelDataManager.isChunkEmpty(emptyData)).toBe(true);
        
        // Add one non-zero voxel
        emptyData[100] = 1;
        expect(VoxelDataManager.isChunkEmpty(emptyData)).toBe(false);
      });

      it('should count non-empty voxels correctly', () => {
        const testData = VoxelDataManager.createEmptyChunkData();
        expect(VoxelDataManager.countNonEmptyVoxels(testData)).toBe(0);
        
        // Add some non-zero voxels
        testData[0] = 1;
        testData[100] = 2;
        testData[500] = 3;
        
        expect(VoxelDataManager.countNonEmptyVoxels(testData)).toBe(3);
      });
    });

    describe('Island Data Model', () => {
      let testIsland: Island;
      let testChunk: WorldChunk;

      beforeEach(() => {
        testChunk = {
          chunkId: 'chunk_0_0_0',
          position: { x: 0, y: 0, z: 0 },
          voxelData: VoxelDataManager.createEmptyChunkData(),
          entities: [],
          lastModified: new Date(),
          isLoaded: true,
          isDirty: false
        };

        testIsland = {
          id: 'island_123',
          ownerId: 'player_456',
          chunks: [testChunk],
          expansionLevel: 1,
          permissions: {
            isPublic: false,
            allowedVisitors: [],
            coopMembers: [],
            buildPermissions: new Map()
          },
          visitCount: 0,
          createdAt: new Date(),
          lastModified: new Date()
        };
      });

      it('should create valid island structure', () => {
        expect(testIsland.id).toBeDefined();
        expect(testIsland.ownerId).toBeDefined();
        expect(testIsland.chunks).toHaveLength(1);
        expect(testIsland.expansionLevel).toBe(1);
        expect(testIsland.permissions).toBeDefined();
        expect(testIsland.visitCount).toBe(0);
        expect(testIsland.createdAt).toBeInstanceOf(Date);
        expect(testIsland.lastModified).toBeInstanceOf(Date);
      });

      it('should handle island permissions correctly', () => {
        const permissions = testIsland.permissions;
        
        // Test default permissions
        expect(permissions.isPublic).toBe(false);
        expect(permissions.allowedVisitors).toEqual([]);
        expect(permissions.coopMembers).toEqual([]);
        expect(permissions.buildPermissions).toBeInstanceOf(Map);
        
        // Test setting permissions
        permissions.isPublic = true;
        permissions.allowedVisitors.push('visitor1', 'visitor2');
        permissions.coopMembers.push('coop1');
        permissions.buildPermissions.set('player1', BuildPermission.BUILD);
        permissions.buildPermissions.set('player2', BuildPermission.VIEW);
        
        expect(permissions.isPublic).toBe(true);
        expect(permissions.allowedVisitors).toHaveLength(2);
        expect(permissions.coopMembers).toHaveLength(1);
        expect(permissions.buildPermissions.get('player1')).toBe(BuildPermission.BUILD);
        expect(permissions.buildPermissions.get('player2')).toBe(BuildPermission.VIEW);
      });

      it('should handle multiple chunks correctly', () => {
        const chunk2: WorldChunk = {
          chunkId: 'chunk_1_0_0',
          position: { x: 1, y: 0, z: 0 },
          voxelData: VoxelDataManager.createEmptyChunkData(),
          entities: [],
          lastModified: new Date(),
          isLoaded: true,
          isDirty: false
        };

        testIsland.chunks.push(chunk2);
        
        expect(testIsland.chunks).toHaveLength(2);
        expect(testIsland.chunks[0]?.chunkId).toBe('chunk_0_0_0');
        expect(testIsland.chunks[1]?.chunkId).toBe('chunk_1_0_0');
      });

      it('should track chunk modifications correctly', () => {
        const chunk = testIsland.chunks[0]!;
        const originalModified = new Date(chunk.lastModified.getTime() - 1000); // Set to 1 second ago
        chunk.lastModified = originalModified;
        
        expect(chunk.isDirty).toBe(false);
        
        // Modify a voxel
        VoxelDataManager.setVoxelAt(chunk, { x: 5, y: 5, z: 5 }, 1);
        
        expect(chunk.isDirty).toBe(true);
        expect(chunk.lastModified.getTime()).toBeGreaterThan(originalModified.getTime());
      });
    });

    describe('VoxelChange Tracking', () => {
      it('should create valid voxel change records', () => {
        const change: VoxelChange = {
          position: { x: 10, y: 5, z: 8 },
          oldBlockId: 0,
          newBlockId: 1,
          timestamp: new Date(),
          playerId: 'player_123'
        };

        expect(change.position).toEqual({ x: 10, y: 5, z: 8 });
        expect(change.oldBlockId).toBe(0);
        expect(change.newBlockId).toBe(1);
        expect(change.timestamp).toBeInstanceOf(Date);
        expect(change.playerId).toBe('player_123');
      });

      it('should track multiple changes correctly', () => {
        const changes: VoxelChange[] = [
          {
            position: { x: 0, y: 0, z: 0 },
            oldBlockId: 0,
            newBlockId: 1,
            timestamp: new Date(),
            playerId: 'player_1'
          },
          {
            position: { x: 1, y: 1, z: 1 },
            oldBlockId: 1,
            newBlockId: 2,
            timestamp: new Date(),
            playerId: 'player_2'
          }
        ];

        expect(changes).toHaveLength(2);
        expect(changes[0]?.playerId).toBe('player_1');
        expect(changes[1]?.playerId).toBe('player_2');
        expect(changes[0]?.newBlockId).toBe(1);
        expect(changes[1]?.newBlockId).toBe(2);
      });
    });

    describe('Entity System', () => {
      it('should create valid entities', () => {
        const entity: Entity = {
          id: 'entity_123',
          type: EntityType.MINION,
          position: { x: 10, y: 5, z: 8 },
          data: {
            minionType: 'cobblestone_minion',
            level: 3,
            efficiency: 1.5
          }
        };

        expect(entity.id).toBe('entity_123');
        expect(entity.type).toBe(EntityType.MINION);
        expect(entity.position).toEqual({ x: 10, y: 5, z: 8 });
        expect(entity.data.minionType).toBe('cobblestone_minion');
        expect(entity.data.level).toBe(3);
        expect(entity.data.efficiency).toBe(1.5);
      });

      it('should handle different entity types', () => {
        const entities: Entity[] = [
          {
            id: 'minion_1',
            type: EntityType.MINION,
            position: { x: 0, y: 0, z: 0 },
            data: { type: 'mining' }
          },
          {
            id: 'mob_1',
            type: EntityType.MOB,
            position: { x: 5, y: 0, z: 5 },
            data: { mobType: 'zombie', health: 100 }
          },
          {
            id: 'npc_1',
            type: EntityType.NPC,
            position: { x: 10, y: 0, z: 10 },
            data: { name: 'Trader Joe', dialogue: 'Welcome!' }
          },
          {
            id: 'item_1',
            type: EntityType.ITEM_DROP,
            position: { x: 3, y: 1, z: 3 },
            data: { itemId: 'diamond', quantity: 1 }
          }
        ];

        expect(entities).toHaveLength(4);
        expect(entities.map(e => e.type)).toEqual([
          EntityType.MINION,
          EntityType.MOB,
          EntityType.NPC,
          EntityType.ITEM_DROP
        ]);
      });
    });

    describe('IslandInstance and IslandBlueprint', () => {
      it('should create valid island instance', () => {
        const instance: IslandInstance = {
          playerId: 'player_123',
          worldData: [],
          lastModified: new Date(),
          expansionLevel: 2,
          activeMinions: []
        };

        expect(instance.playerId).toBe('player_123');
        expect(instance.worldData).toEqual([]);
        expect(instance.lastModified).toBeInstanceOf(Date);
        expect(instance.expansionLevel).toBe(2);
        expect(instance.activeMinions).toEqual([]);
      });

      it('should create valid island blueprint', () => {
        const blueprint: IslandBlueprint = {
          id: 'blueprint_forest',
          name: 'Forest Expansion',
          requiredMaterials: [
            { itemId: 'wood', quantity: 1000 },
            { itemId: 'stone', quantity: 500 }
          ],
          expansionSize: { x: 32, y: 16, z: 32 },
          unlockRequirements: ['level_10_farming', 'complete_quest_nature']
        };

        expect(blueprint.id).toBe('blueprint_forest');
        expect(blueprint.name).toBe('Forest Expansion');
        expect(blueprint.requiredMaterials).toHaveLength(2);
        expect(blueprint.expansionSize).toEqual({ x: 32, y: 16, z: 32 });
        expect(blueprint.unlockRequirements).toHaveLength(2);
      });
    });

    describe('World Data Serialization', () => {
      let testChunk: WorldChunk;

      beforeEach(() => {
        testChunk = {
          chunkId: 'chunk_0_0_0',
          position: { x: 0, y: 0, z: 0 },
          voxelData: VoxelDataManager.createEmptyChunkData(),
          entities: [
            {
              id: 'entity_1',
              type: EntityType.MINION,
              position: { x: 5, y: 5, z: 5 },
              data: { type: 'mining' }
            }
          ],
          lastModified: new Date(),
          isLoaded: true,
          isDirty: false
        };

        // Add some test voxel data
        VoxelDataManager.setVoxelAt(testChunk, { x: 0, y: 0, z: 0 }, 1);
        VoxelDataManager.setVoxelAt(testChunk, { x: 1, y: 1, z: 1 }, 2);
      });

      it('should serialize and deserialize chunk data correctly', () => {
        // Serialize chunk to JSON
        const serialized = JSON.stringify({
          chunkId: testChunk.chunkId,
          position: testChunk.position,
          voxelData: Array.from(testChunk.voxelData),
          entities: testChunk.entities,
          lastModified: testChunk.lastModified.toISOString(),
          isLoaded: testChunk.isLoaded,
          isDirty: testChunk.isDirty
        });

        // Deserialize back
        const parsed = JSON.parse(serialized);
        const deserializedChunk: WorldChunk = {
          chunkId: parsed.chunkId,
          position: parsed.position,
          voxelData: new Uint8Array(parsed.voxelData),
          entities: parsed.entities,
          lastModified: new Date(parsed.lastModified),
          isLoaded: parsed.isLoaded,
          isDirty: parsed.isDirty
        };

        expect(deserializedChunk.chunkId).toBe(testChunk.chunkId);
        expect(deserializedChunk.position).toEqual(testChunk.position);
        expect(deserializedChunk.voxelData).toEqual(testChunk.voxelData);
        expect(deserializedChunk.entities).toEqual(testChunk.entities);
        expect(deserializedChunk.lastModified.getTime()).toBe(testChunk.lastModified.getTime());
        expect(deserializedChunk.isLoaded).toBe(testChunk.isLoaded);
        expect(deserializedChunk.isDirty).toBe(testChunk.isDirty);
      });

      it('should handle compressed voxel data serialization', () => {
        const compressed = VoxelDataManager.compressVoxelData(testChunk.voxelData);
        
        const serialized = JSON.stringify({
          chunkId: testChunk.chunkId,
          position: testChunk.position,
          compressedVoxelData: Array.from(compressed),
          entities: testChunk.entities,
          lastModified: testChunk.lastModified.toISOString()
        });

        const parsed = JSON.parse(serialized);
        const decompressedVoxelData = VoxelDataManager.decompressVoxelData(
          new Uint8Array(parsed.compressedVoxelData)
        );

        expect(decompressedVoxelData).toEqual(testChunk.voxelData);
      });

      it('should serialize island with multiple chunks correctly', () => {
        const island: Island = {
          id: 'island_123',
          ownerId: 'player_456',
          chunks: [testChunk],
          expansionLevel: 1,
          permissions: {
            isPublic: false,
            allowedVisitors: ['visitor1'],
            coopMembers: ['coop1'],
            buildPermissions: new Map([['player1', BuildPermission.BUILD]])
          },
          visitCount: 5,
          createdAt: new Date(),
          lastModified: new Date()
        };

        // Convert Map to object for serialization
        const serialized = JSON.stringify({
          ...island,
          permissions: {
            ...island.permissions,
            buildPermissions: Object.fromEntries(island.permissions.buildPermissions)
          },
          chunks: island.chunks.map(chunk => ({
            ...chunk,
            voxelData: Array.from(chunk.voxelData),
            lastModified: chunk.lastModified.toISOString()
          })),
          createdAt: island.createdAt.toISOString(),
          lastModified: island.lastModified.toISOString()
        });

        const parsed = JSON.parse(serialized);
        
        expect(parsed.id).toBe(island.id);
        expect(parsed.ownerId).toBe(island.ownerId);
        expect(parsed.chunks).toHaveLength(1);
        expect(parsed.permissions.allowedVisitors).toEqual(['visitor1']);
        expect(parsed.permissions.buildPermissions.player1).toBe(BuildPermission.BUILD);
      });
    });
  });