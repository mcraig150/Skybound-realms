import { describe, it, expect, beforeEach } from 'vitest';
import {
  Guild,
  GuildMember,
  GuildRole,
  GuildPermission,
  GuildEvent,
  GuildEventType,
  GuildPerk,
  GuildPerkType,
  GuildValidator,
  GuildPermissionManager,
  GuildFactory
} from '../../models/Guild';

describe('Guild Model', () => {
  let validGuild: Guild;
  let validMember: GuildMember;

  beforeEach(() => {
    const now = new Date();
    
    validMember = {
      playerId: 'player_123',
      username: 'TestPlayer',
      role: GuildRole.LEADER,
      joinedAt: now,
      lastActive: now,
      contributionPoints: 100
    };

    validGuild = {
      id: 'guild_123',
      name: 'Test Guild',
      description: 'A test guild',
      tag: 'TEST',
      leaderId: 'player_123',
      members: [validMember],
      level: 5,
      experience: 1000,
      maxMembers: 50,
      treasury: {
        coins: 5000,
        guildPoints: 200,
        resources: new Map([['wood', 100], ['stone', 50]])
      },
      perks: [],
      events: [],
      settings: {
        isPublic: true,
        requiresApproval: false,
        minimumLevel: 1,
        allowedRoles: [GuildRole.MEMBER, GuildRole.OFFICER, GuildRole.LEADER],
        eventNotifications: true,
        memberNotifications: true
      },
      createdAt: now,
      lastActivity: now
    };
  });

  describe('GuildValidator', () => {
    describe('validateGuild', () => {
      it('should validate a valid guild', () => {
        const result = GuildValidator.validateGuild(validGuild);
        expect(result.isValid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it('should reject guild with invalid ID', () => {
        validGuild.id = '';
        const result = GuildValidator.validateGuild(validGuild);
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('Guild ID is required and must be a string');
      });

      it('should reject guild with invalid name', () => {
        validGuild.name = 'AB'; // Too short
        const result = GuildValidator.validateGuild(validGuild);
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('Guild name must be 3-30 characters and contain only letters, numbers, spaces, and basic punctuation');
      });

      it('should reject guild with invalid tag', () => {
        validGuild.tag = 'ab'; // Too short and lowercase
        const result = GuildValidator.validateGuild(validGuild);
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('Guild tag must be 3-5 characters and contain only uppercase letters and numbers');
      });

      it('should reject guild with invalid level', () => {
        validGuild.level = 0;
        const result = GuildValidator.validateGuild(validGuild);
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('Guild level must be between 1 and 100');
      });

      it('should reject guild with negative experience', () => {
        validGuild.experience = -100;
        const result = GuildValidator.validateGuild(validGuild);
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('Guild experience cannot be negative');
      });

      it('should reject guild with too many members', () => {
        validGuild.maxMembers = 10;
        // Add more members than max
        for (let i = 1; i < 15; i++) {
          validGuild.members.push({
            playerId: `player_${i}`,
            username: `Player${i}`,
            role: GuildRole.MEMBER,
            joinedAt: new Date(),
            lastActive: new Date(),
            contributionPoints: 0
          });
        }
        const result = GuildValidator.validateGuild(validGuild);
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('Guild cannot have more members than max members limit');
      });
    });

    describe('validateMembers', () => {
      it('should validate valid members list', () => {
        const result = GuildValidator.validateMembers(validGuild.members, validGuild.leaderId);
        expect(result.isValid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it('should reject empty members list', () => {
        const result = GuildValidator.validateMembers([], validGuild.leaderId);
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('Guild must have at least one member');
      });

      it('should reject when leader is not in members list', () => {
        validGuild.members[0].playerId = 'different_player';
        const result = GuildValidator.validateMembers(validGuild.members, validGuild.leaderId);
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('Guild leader must be in the members list');
      });

      it('should reject when leader does not have LEADER role', () => {
        validGuild.members[0].role = GuildRole.MEMBER;
        const result = GuildValidator.validateMembers(validGuild.members, validGuild.leaderId);
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('Guild leader must have LEADER role');
      });

      it('should reject duplicate members', () => {
        validGuild.members.push({ ...validMember }); // Duplicate member
        const result = GuildValidator.validateMembers(validGuild.members, validGuild.leaderId);
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('Guild cannot have duplicate members');
      });
    });

    describe('validateMember', () => {
      it('should validate a valid member', () => {
        const result = GuildValidator.validateMember(validMember);
        expect(result.isValid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it('should reject member with invalid player ID', () => {
        validMember.playerId = '';
        const result = GuildValidator.validateMember(validMember);
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('Player ID is required and must be a string');
      });

      it('should reject member with invalid username', () => {
        validMember.username = 'AB'; // Too short
        const result = GuildValidator.validateMember(validMember);
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('Username is required and must be at least 3 characters');
      });

      it('should reject member with invalid role', () => {
        (validMember as any).role = 'invalid_role';
        const result = GuildValidator.validateMember(validMember);
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('Invalid guild role');
      });

      it('should reject member with negative contribution points', () => {
        validMember.contributionPoints = -10;
        const result = GuildValidator.validateMember(validMember);
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('Contribution points must be a non-negative number');
      });
    });

    describe('validateTreasury', () => {
      it('should validate a valid treasury', () => {
        const result = GuildValidator.validateTreasury(validGuild.treasury);
        expect(result.isValid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it('should reject treasury with negative coins', () => {
        validGuild.treasury.coins = -100;
        const result = GuildValidator.validateTreasury(validGuild.treasury);
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('Treasury coins must be a non-negative number');
      });

      it('should reject treasury with negative guild points', () => {
        validGuild.treasury.guildPoints = -50;
        const result = GuildValidator.validateTreasury(validGuild.treasury);
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('Treasury guild points must be a non-negative number');
      });

      it('should reject treasury with invalid resources', () => {
        validGuild.treasury.resources.set('', 100); // Empty resource ID
        const result = GuildValidator.validateTreasury(validGuild.treasury);
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('Resource ID must be a non-empty string');
      });

      it('should reject treasury with negative resource quantities', () => {
        validGuild.treasury.resources.set('wood', -10);
        const result = GuildValidator.validateTreasury(validGuild.treasury);
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('Resource wood quantity must be a non-negative number');
      });
    });

    describe('isValidGuildName', () => {
      it('should accept valid guild names', () => {
        expect(GuildValidator.isValidGuildName('Test Guild')).toBe(true);
        expect(GuildValidator.isValidGuildName('The-Awesome_Guild!')).toBe(true);
        expect(GuildValidator.isValidGuildName('Guild123')).toBe(true);
      });

      it('should reject invalid guild names', () => {
        expect(GuildValidator.isValidGuildName('')).toBe(false);
        expect(GuildValidator.isValidGuildName('AB')).toBe(false); // Too short
        expect(GuildValidator.isValidGuildName('A'.repeat(31))).toBe(false); // Too long
        expect(GuildValidator.isValidGuildName('Guild@#$%')).toBe(false); // Invalid characters
      });
    });

    describe('isValidGuildTag', () => {
      it('should accept valid guild tags', () => {
        expect(GuildValidator.isValidGuildTag('TEST')).toBe(true);
        expect(GuildValidator.isValidGuildTag('ABC12')).toBe(true);
        expect(GuildValidator.isValidGuildTag('GUILD')).toBe(true);
      });

      it('should reject invalid guild tags', () => {
        expect(GuildValidator.isValidGuildTag('')).toBe(false);
        expect(GuildValidator.isValidGuildTag('AB')).toBe(false); // Too short
        expect(GuildValidator.isValidGuildTag('ABCDEF')).toBe(false); // Too long
        expect(GuildValidator.isValidGuildTag('test')).toBe(false); // Lowercase
        expect(GuildValidator.isValidGuildTag('TEST!')).toBe(false); // Invalid characters
      });
    });
  });

  describe('GuildPermissionManager', () => {
    describe('getPermissionsForRole', () => {
      it('should return all permissions for LEADER', () => {
        const permissions = GuildPermissionManager.getPermissionsForRole(GuildRole.LEADER);
        expect(permissions).toEqual(Object.values(GuildPermission));
      });

      it('should return limited permissions for OFFICER', () => {
        const permissions = GuildPermissionManager.getPermissionsForRole(GuildRole.OFFICER);
        expect(permissions).toContain(GuildPermission.INVITE_MEMBERS);
        expect(permissions).toContain(GuildPermission.KICK_MEMBERS);
        expect(permissions).toContain(GuildPermission.MANAGE_EVENTS);
        expect(permissions).not.toContain(GuildPermission.DISBAND_GUILD);
      });

      it('should return no permissions for MEMBER', () => {
        const permissions = GuildPermissionManager.getPermissionsForRole(GuildRole.MEMBER);
        expect(permissions).toHaveLength(0);
      });
    });

    describe('hasPermission', () => {
      it('should return true when role has permission', () => {
        expect(GuildPermissionManager.hasPermission(GuildRole.LEADER, GuildPermission.DISBAND_GUILD)).toBe(true);
        expect(GuildPermissionManager.hasPermission(GuildRole.OFFICER, GuildPermission.INVITE_MEMBERS)).toBe(true);
      });

      it('should return false when role does not have permission', () => {
        expect(GuildPermissionManager.hasPermission(GuildRole.MEMBER, GuildPermission.KICK_MEMBERS)).toBe(false);
        expect(GuildPermissionManager.hasPermission(GuildRole.OFFICER, GuildPermission.DISBAND_GUILD)).toBe(false);
      });
    });

    describe('canManageMember', () => {
      it('should allow LEADER to manage everyone', () => {
        expect(GuildPermissionManager.canManageMember(GuildRole.LEADER, GuildRole.LEADER)).toBe(true);
        expect(GuildPermissionManager.canManageMember(GuildRole.LEADER, GuildRole.OFFICER)).toBe(true);
        expect(GuildPermissionManager.canManageMember(GuildRole.LEADER, GuildRole.MEMBER)).toBe(true);
      });

      it('should allow OFFICER to manage only MEMBER', () => {
        expect(GuildPermissionManager.canManageMember(GuildRole.OFFICER, GuildRole.MEMBER)).toBe(true);
        expect(GuildPermissionManager.canManageMember(GuildRole.OFFICER, GuildRole.OFFICER)).toBe(false);
        expect(GuildPermissionManager.canManageMember(GuildRole.OFFICER, GuildRole.LEADER)).toBe(false);
      });

      it('should not allow MEMBER to manage anyone', () => {
        expect(GuildPermissionManager.canManageMember(GuildRole.MEMBER, GuildRole.MEMBER)).toBe(false);
        expect(GuildPermissionManager.canManageMember(GuildRole.MEMBER, GuildRole.OFFICER)).toBe(false);
        expect(GuildPermissionManager.canManageMember(GuildRole.MEMBER, GuildRole.LEADER)).toBe(false);
      });
    });
  });

  describe('GuildFactory', () => {
    describe('createNewGuild', () => {
      it('should create a valid new guild', () => {
        const guild = GuildFactory.createNewGuild('Test Guild', 'TEST', 'player_123', 'TestPlayer');
        
        expect(guild.name).toBe('Test Guild');
        expect(guild.tag).toBe('TEST');
        expect(guild.leaderId).toBe('player_123');
        expect(guild.members).toHaveLength(1);
        expect(guild.members[0].playerId).toBe('player_123');
        expect(guild.members[0].username).toBe('TestPlayer');
        expect(guild.members[0].role).toBe(GuildRole.LEADER);
        expect(guild.level).toBe(1);
        expect(guild.experience).toBe(0);
        expect(guild.maxMembers).toBe(20);
        expect(guild.treasury.coins).toBe(0);
        expect(guild.treasury.guildPoints).toBe(0);
        expect(guild.settings.isPublic).toBe(true);
        expect(guild.settings.requiresApproval).toBe(false);
      });

      it('should throw error for invalid guild name', () => {
        expect(() => {
          GuildFactory.createNewGuild('AB', 'TEST', 'player_123', 'TestPlayer');
        }).toThrow('Invalid guild name format');
      });

      it('should throw error for invalid guild tag', () => {
        expect(() => {
          GuildFactory.createNewGuild('Test Guild', 'test', 'player_123', 'TestPlayer');
        }).toThrow('Invalid guild tag format');
      });
    });

    describe('serializeGuild', () => {
      it('should serialize guild data correctly', () => {
        const serialized = GuildFactory.serializeGuild(validGuild);
        
        expect(serialized.treasury.resources).toBeInstanceOf(Object);
        expect(serialized.treasury.resources.wood).toBe(100);
        expect(serialized.treasury.resources.stone).toBe(50);
        expect(typeof serialized.createdAt).toBe('string');
        expect(typeof serialized.lastActivity).toBe('string');
        expect(typeof serialized.members[0].joinedAt).toBe('string');
        expect(typeof serialized.members[0].lastActive).toBe('string');
      });
    });

    describe('deserializeGuild', () => {
      it('should deserialize guild data correctly', () => {
        const serialized = GuildFactory.serializeGuild(validGuild);
        const deserialized = GuildFactory.deserializeGuild(serialized);
        
        expect(deserialized.treasury.resources).toBeInstanceOf(Map);
        expect(deserialized.treasury.resources.get('wood')).toBe(100);
        expect(deserialized.treasury.resources.get('stone')).toBe(50);
        expect(deserialized.createdAt).toBeInstanceOf(Date);
        expect(deserialized.lastActivity).toBeInstanceOf(Date);
        expect(deserialized.members[0].joinedAt).toBeInstanceOf(Date);
        expect(deserialized.members[0].lastActive).toBeInstanceOf(Date);
      });

      it('should handle object format for resources', () => {
        const data = {
          ...validGuild,
          treasury: {
            ...validGuild.treasury,
            resources: { wood: 100, stone: 50 }
          },
          createdAt: validGuild.createdAt.toISOString(),
          lastActivity: validGuild.lastActivity.toISOString(),
          members: validGuild.members.map(member => ({
            ...member,
            joinedAt: member.joinedAt.toISOString(),
            lastActive: member.lastActive.toISOString()
          })),
          events: []
        };
        
        const deserialized = GuildFactory.deserializeGuild(data);
        expect(deserialized.treasury.resources).toBeInstanceOf(Map);
        expect(deserialized.treasury.resources.get('wood')).toBe(100);
        expect(deserialized.treasury.resources.get('stone')).toBe(50);
      });
    });
  });
});