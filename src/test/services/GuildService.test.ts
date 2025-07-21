import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GuildService, GuildRepository, PlayerRepository } from '../../services/GuildService';
import { Guild, GuildRole, GuildPermission, GuildEventType, GuildFactory } from '../../models/Guild';
import { Player, PlayerFactory } from '../../models/Player';

// Mock repositories
const mockGuildRepository: GuildRepository = {
  findById: vi.fn(),
  findByName: vi.fn(),
  findByTag: vi.fn(),
  findByMemberId: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  findPublicGuilds: vi.fn()
};

const mockPlayerRepository: PlayerRepository = {
  findById: vi.fn(),
  update: vi.fn()
};

describe('GuildService', () => {
  let guildService: GuildService;
  let testPlayer: Player;
  let testGuild: Guild;

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();
    
    guildService = new GuildService(mockGuildRepository, mockPlayerRepository);
    
    testPlayer = PlayerFactory.createNewPlayer('TestPlayer');
    testPlayer.id = 'player_123';
    
    testGuild = GuildFactory.createNewGuild('Test Guild', 'TEST', 'player_123', 'TestPlayer');
    testGuild.id = 'guild_123';
  });

  describe('createGuild', () => {
    it('should create a new guild successfully', async () => {
      // Setup mocks
      vi.mocked(mockPlayerRepository.findById).mockResolvedValue(testPlayer);
      vi.mocked(mockGuildRepository.findByName).mockResolvedValue(null);
      vi.mocked(mockGuildRepository.findByTag).mockResolvedValue(null);
      vi.mocked(mockGuildRepository.create).mockResolvedValue(testGuild);
      vi.mocked(mockPlayerRepository.update).mockResolvedValue(testPlayer);

      const result = await guildService.createGuild('Test Guild', 'TEST', 'player_123');

      expect(result.success).toBe(true);
      expect(result.message).toBe('Guild created successfully');
      expect(result.data).toEqual(testGuild);
      expect(mockGuildRepository.create).toHaveBeenCalled();
      expect(mockPlayerRepository.update).toHaveBeenCalledWith('player_123', { guildId: 'guild_123' });
    });

    it('should fail if player not found', async () => {
      vi.mocked(mockPlayerRepository.findById).mockResolvedValue(null);

      const result = await guildService.createGuild('Test Guild', 'TEST', 'player_123');

      expect(result.success).toBe(false);
      expect(result.message).toBe('Player not found');
    });

    it('should fail if player already in guild', async () => {
      testPlayer.guildId = 'existing_guild';
      vi.mocked(mockPlayerRepository.findById).mockResolvedValue(testPlayer);

      const result = await guildService.createGuild('Test Guild', 'TEST', 'player_123');

      expect(result.success).toBe(false);
      expect(result.message).toBe('Player is already in a guild');
    });

    it('should fail if guild name already exists', async () => {
      vi.mocked(mockPlayerRepository.findById).mockResolvedValue(testPlayer);
      vi.mocked(mockGuildRepository.findByName).mockResolvedValue(testGuild);

      const result = await guildService.createGuild('Test Guild', 'TEST', 'player_123');

      expect(result.success).toBe(false);
      expect(result.message).toBe('Guild name already exists');
    });

    it('should fail if guild tag already exists', async () => {
      vi.mocked(mockPlayerRepository.findById).mockResolvedValue(testPlayer);
      vi.mocked(mockGuildRepository.findByName).mockResolvedValue(null);
      vi.mocked(mockGuildRepository.findByTag).mockResolvedValue(testGuild);

      const result = await guildService.createGuild('Test Guild', 'TEST', 'player_123');

      expect(result.success).toBe(false);
      expect(result.message).toBe('Guild tag already exists');
    });
  });

  describe('getGuild', () => {
    it('should return guild by ID', async () => {
      vi.mocked(mockGuildRepository.findById).mockResolvedValue(testGuild);

      const result = await guildService.getGuild('guild_123');

      expect(result).toEqual(testGuild);
      expect(mockGuildRepository.findById).toHaveBeenCalledWith('guild_123');
    });

    it('should return null if guild not found', async () => {
      vi.mocked(mockGuildRepository.findById).mockResolvedValue(null);

      const result = await guildService.getGuild('nonexistent_guild');

      expect(result).toBeNull();
    });
  });

  describe('getPlayerGuild', () => {
    it('should return guild by player ID', async () => {
      vi.mocked(mockGuildRepository.findByMemberId).mockResolvedValue(testGuild);

      const result = await guildService.getPlayerGuild('player_123');

      expect(result).toEqual(testGuild);
      expect(mockGuildRepository.findByMemberId).toHaveBeenCalledWith('player_123');
    });
  });

  describe('invitePlayer', () => {
    beforeEach(() => {
      // Add an officer to the guild for testing
      testGuild.members.push({
        playerId: 'officer_123',
        username: 'OfficerPlayer',
        role: GuildRole.OFFICER,
        joinedAt: new Date(),
        lastActive: new Date(),
        contributionPoints: 50
      });
    });

    it('should invite player successfully', async () => {
      const targetPlayer = PlayerFactory.createNewPlayer('TargetPlayer');
      targetPlayer.id = 'target_123';

      vi.mocked(mockGuildRepository.findById).mockResolvedValue(testGuild);
      vi.mocked(mockPlayerRepository.findById).mockResolvedValue(targetPlayer);

      const result = await guildService.invitePlayer('guild_123', 'officer_123', 'target_123');

      expect(result.success).toBe(true);
      expect(result.message).toBe('Invitation sent successfully');
      expect(result.data).toBeDefined();
      expect(result.data.playerId).toBe('target_123');
    });

    it('should fail if guild not found', async () => {
      vi.mocked(mockGuildRepository.findById).mockResolvedValue(null);

      const result = await guildService.invitePlayer('guild_123', 'officer_123', 'target_123');

      expect(result.success).toBe(false);
      expect(result.message).toBe('Guild not found');
    });

    it('should fail if inviter is not a member', async () => {
      vi.mocked(mockGuildRepository.findById).mockResolvedValue(testGuild);

      const result = await guildService.invitePlayer('guild_123', 'nonmember_123', 'target_123');

      expect(result.success).toBe(false);
      expect(result.message).toBe('Inviter is not a member of this guild');
    });

    it('should fail if inviter lacks permission', async () => {
      vi.mocked(mockGuildRepository.findById).mockResolvedValue(testGuild);

      const result = await guildService.invitePlayer('guild_123', 'player_123', 'target_123');

      // The leader member should have permission, so let's test with a regular member
      testGuild.members.push({
        playerId: 'member_123',
        username: 'MemberPlayer',
        role: GuildRole.MEMBER,
        joinedAt: new Date(),
        lastActive: new Date(),
        contributionPoints: 10
      });

      const result2 = await guildService.invitePlayer('guild_123', 'member_123', 'target_123');

      expect(result2.success).toBe(false);
      expect(result2.message).toBe('You do not have permission to invite members');
    });

    it('should fail if target player not found', async () => {
      vi.mocked(mockGuildRepository.findById).mockResolvedValue(testGuild);
      vi.mocked(mockPlayerRepository.findById).mockResolvedValue(null);

      const result = await guildService.invitePlayer('guild_123', 'officer_123', 'target_123');

      expect(result.success).toBe(false);
      expect(result.message).toBe('Target player not found');
    });

    it('should fail if target player already in guild', async () => {
      const targetPlayer = PlayerFactory.createNewPlayer('TargetPlayer');
      targetPlayer.id = 'target_123';
      targetPlayer.guildId = 'other_guild';

      vi.mocked(mockGuildRepository.findById).mockResolvedValue(testGuild);
      vi.mocked(mockPlayerRepository.findById).mockResolvedValue(targetPlayer);

      const result = await guildService.invitePlayer('guild_123', 'officer_123', 'target_123');

      expect(result.success).toBe(false);
      expect(result.message).toBe('Player is already in a guild');
    });

    it('should fail if guild is at capacity', async () => {
      const targetPlayer = PlayerFactory.createNewPlayer('TargetPlayer');
      targetPlayer.id = 'target_123';

      // Set guild to max capacity
      testGuild.maxMembers = 2; // Already has 2 members (leader + officer)

      vi.mocked(mockGuildRepository.findById).mockResolvedValue(testGuild);
      vi.mocked(mockPlayerRepository.findById).mockResolvedValue(targetPlayer);

      const result = await guildService.invitePlayer('guild_123', 'officer_123', 'target_123');

      expect(result.success).toBe(false);
      expect(result.message).toBe('Guild is at maximum capacity');
    });
  });

  describe('joinGuild', () => {
    it('should join guild successfully', async () => {
      const joiningPlayer = PlayerFactory.createNewPlayer('JoiningPlayer');
      joiningPlayer.id = 'joining_123';

      vi.mocked(mockGuildRepository.findById).mockResolvedValue(testGuild);
      vi.mocked(mockPlayerRepository.findById).mockResolvedValue(joiningPlayer);
      vi.mocked(mockGuildRepository.update).mockResolvedValue(testGuild);
      vi.mocked(mockPlayerRepository.update).mockResolvedValue(joiningPlayer);

      const result = await guildService.joinGuild('guild_123', 'joining_123');

      expect(result.success).toBe(true);
      expect(result.message).toBe('Successfully joined guild');
      expect(result.data).toBeDefined();
      expect(result.data.playerId).toBe('joining_123');
      expect(result.data.role).toBe(GuildRole.MEMBER);
    });

    it('should fail if guild not found', async () => {
      vi.mocked(mockGuildRepository.findById).mockResolvedValue(null);

      const result = await guildService.joinGuild('guild_123', 'joining_123');

      expect(result.success).toBe(false);
      expect(result.message).toBe('Guild not found');
    });

    it('should fail if player not found', async () => {
      vi.mocked(mockGuildRepository.findById).mockResolvedValue(testGuild);
      vi.mocked(mockPlayerRepository.findById).mockResolvedValue(null);

      const result = await guildService.joinGuild('guild_123', 'joining_123');

      expect(result.success).toBe(false);
      expect(result.message).toBe('Player not found');
    });

    it('should fail if player already in guild', async () => {
      const joiningPlayer = PlayerFactory.createNewPlayer('JoiningPlayer');
      joiningPlayer.id = 'joining_123';
      joiningPlayer.guildId = 'other_guild';

      vi.mocked(mockGuildRepository.findById).mockResolvedValue(testGuild);
      vi.mocked(mockPlayerRepository.findById).mockResolvedValue(joiningPlayer);

      const result = await guildService.joinGuild('guild_123', 'joining_123');

      expect(result.success).toBe(false);
      expect(result.message).toBe('Player is already in a guild');
    });
  });

  describe('removeMember', () => {
    beforeEach(() => {
      // Add a member to remove
      testGuild.members.push({
        playerId: 'member_123',
        username: 'MemberPlayer',
        role: GuildRole.MEMBER,
        joinedAt: new Date(),
        lastActive: new Date(),
        contributionPoints: 25
      });
    });

    it('should remove member successfully (self-leave)', async () => {
      vi.mocked(mockGuildRepository.findById).mockResolvedValue(testGuild);
      vi.mocked(mockGuildRepository.update).mockResolvedValue(testGuild);
      vi.mocked(mockPlayerRepository.update).mockResolvedValue(testPlayer);

      const result = await guildService.removeMember('guild_123', 'member_123', 'member_123');

      expect(result.success).toBe(true);
      expect(result.message).toBe('Successfully left guild');
    });

    it('should kick member successfully', async () => {
      vi.mocked(mockGuildRepository.findById).mockResolvedValue(testGuild);
      vi.mocked(mockGuildRepository.update).mockResolvedValue(testGuild);
      vi.mocked(mockPlayerRepository.update).mockResolvedValue(testPlayer);

      const result = await guildService.removeMember('guild_123', 'member_123', 'player_123');

      expect(result.success).toBe(true);
      expect(result.message).toBe('Member kicked successfully');
    });

    it('should fail if guild not found', async () => {
      vi.mocked(mockGuildRepository.findById).mockResolvedValue(null);

      const result = await guildService.removeMember('guild_123', 'member_123', 'player_123');

      expect(result.success).toBe(false);
      expect(result.message).toBe('Guild not found');
    });

    it('should fail if target is not a member', async () => {
      vi.mocked(mockGuildRepository.findById).mockResolvedValue(testGuild);

      const result = await guildService.removeMember('guild_123', 'nonmember_123', 'player_123');

      expect(result.success).toBe(false);
      expect(result.message).toBe('Player is not a member of this guild');
    });

    it('should fail if remover lacks permission', async () => {
      // Add another member without kick permissions
      testGuild.members.push({
        playerId: 'member2_123',
        username: 'Member2Player',
        role: GuildRole.MEMBER,
        joinedAt: new Date(),
        lastActive: new Date(),
        contributionPoints: 15
      });

      vi.mocked(mockGuildRepository.findById).mockResolvedValue(testGuild);

      const result = await guildService.removeMember('guild_123', 'member_123', 'member2_123');

      expect(result.success).toBe(false);
      expect(result.message).toBe('You do not have permission to kick members');
    });

    it('should fail to kick guild leader due to role restrictions', async () => {
      // Add an officer who has kick permissions
      testGuild.members.push({
        playerId: 'officer_123',
        username: 'OfficerPlayer',
        role: GuildRole.OFFICER,
        joinedAt: new Date(),
        lastActive: new Date(),
        contributionPoints: 75
      });

      vi.mocked(mockGuildRepository.findById).mockResolvedValue(testGuild);

      const result = await guildService.removeMember('guild_123', 'player_123', 'officer_123');

      expect(result.success).toBe(false);
      expect(result.message).toBe('You cannot kick this member due to their role');
    });

    it('should transfer leadership when leader leaves', async () => {
      // Add an officer to receive leadership
      testGuild.members.push({
        playerId: 'officer_123',
        username: 'OfficerPlayer',
        role: GuildRole.OFFICER,
        joinedAt: new Date(),
        lastActive: new Date(),
        contributionPoints: 75
      });

      vi.mocked(mockGuildRepository.findById).mockResolvedValue(testGuild);
      vi.mocked(mockGuildRepository.update).mockResolvedValue(testGuild);
      vi.mocked(mockPlayerRepository.update).mockResolvedValue(testPlayer);

      const result = await guildService.removeMember('guild_123', 'player_123', 'player_123');

      expect(result.success).toBe(true);
      expect(result.message).toBe('Successfully left guild');
    });
  });

  describe('changeMemberRole', () => {
    beforeEach(() => {
      // Add a member to promote/demote
      testGuild.members.push({
        playerId: 'member_123',
        username: 'MemberPlayer',
        role: GuildRole.MEMBER,
        joinedAt: new Date(),
        lastActive: new Date(),
        contributionPoints: 25
      });
    });

    it('should promote member successfully', async () => {
      vi.mocked(mockGuildRepository.findById).mockResolvedValue(testGuild);
      vi.mocked(mockGuildRepository.update).mockResolvedValue(testGuild);

      const result = await guildService.changeMemberRole('guild_123', 'member_123', GuildRole.OFFICER, 'player_123');

      expect(result.success).toBe(true);
      expect(result.message).toBe('Member role changed to officer');
      expect(result.data.role).toBe(GuildRole.OFFICER);
    });

    it('should fail if guild not found', async () => {
      vi.mocked(mockGuildRepository.findById).mockResolvedValue(null);

      const result = await guildService.changeMemberRole('guild_123', 'member_123', GuildRole.OFFICER, 'player_123');

      expect(result.success).toBe(false);
      expect(result.message).toBe('Guild not found');
    });

    it('should fail if changer is not a member', async () => {
      vi.mocked(mockGuildRepository.findById).mockResolvedValue(testGuild);

      const result = await guildService.changeMemberRole('guild_123', 'member_123', GuildRole.OFFICER, 'nonmember_123');

      expect(result.success).toBe(false);
      expect(result.message).toBe('You are not a member of this guild');
    });

    it('should fail if target is not a member', async () => {
      vi.mocked(mockGuildRepository.findById).mockResolvedValue(testGuild);

      const result = await guildService.changeMemberRole('guild_123', 'nonmember_123', GuildRole.OFFICER, 'player_123');

      expect(result.success).toBe(false);
      expect(result.message).toBe('Target player is not a member of this guild');
    });

    it('should fail to promote to leader role', async () => {
      vi.mocked(mockGuildRepository.findById).mockResolvedValue(testGuild);

      const result = await guildService.changeMemberRole('guild_123', 'member_123', GuildRole.LEADER, 'player_123');

      expect(result.success).toBe(false);
      expect(result.message).toBe('Use leadership transfer to make someone a leader');
    });
  });

  describe('createEvent', () => {
    it('should create event successfully', async () => {
      vi.mocked(mockGuildRepository.findById).mockResolvedValue(testGuild);
      vi.mocked(mockGuildRepository.update).mockResolvedValue(testGuild);

      const eventData = {
        name: 'Dungeon Raid',
        description: 'Weekly dungeon raid event',
        eventType: GuildEventType.DUNGEON_RAID,
        startTime: new Date(Date.now() + 3600000), // 1 hour from now
        endTime: new Date(Date.now() + 7200000), // 2 hours from now
        rewards: [{ itemId: 'rare_sword', quantity: 1 }]
      };

      const result = await guildService.createEvent('guild_123', 'player_123', eventData);

      expect(result.success).toBe(true);
      expect(result.message).toBe('Event created successfully');
      expect(result.data).toBeDefined();
      expect(result.data.name).toBe('Dungeon Raid');
      expect(result.data.createdBy).toBe('player_123');
    });

    it('should fail if guild not found', async () => {
      vi.mocked(mockGuildRepository.findById).mockResolvedValue(null);

      const eventData = {
        name: 'Test Event',
        description: 'Test event',
        eventType: GuildEventType.DUNGEON_RAID,
        startTime: new Date(),
        endTime: new Date(),
        rewards: []
      };

      const result = await guildService.createEvent('guild_123', 'player_123', eventData);

      expect(result.success).toBe(false);
      expect(result.message).toBe('Guild not found');
    });

    it('should fail if creator is not a member', async () => {
      vi.mocked(mockGuildRepository.findById).mockResolvedValue(testGuild);

      const eventData = {
        name: 'Test Event',
        description: 'Test event',
        eventType: GuildEventType.DUNGEON_RAID,
        startTime: new Date(),
        endTime: new Date(),
        rewards: []
      };

      const result = await guildService.createEvent('guild_123', 'nonmember_123', eventData);

      expect(result.success).toBe(false);
      expect(result.message).toBe('You are not a member of this guild');
    });
  });

  describe('joinEvent', () => {
    beforeEach(() => {
      // Add an event to join
      testGuild.events.push({
        id: 'event_123',
        name: 'Test Event',
        description: 'Test event',
        eventType: GuildEventType.DUNGEON_RAID,
        startTime: new Date(Date.now() + 3600000),
        endTime: new Date(Date.now() + 7200000),
        participants: [],
        rewards: [],
        isActive: true,
        createdBy: 'player_123'
      });
    });

    it('should join event successfully', async () => {
      vi.mocked(mockGuildRepository.findById).mockResolvedValue(testGuild);
      vi.mocked(mockGuildRepository.update).mockResolvedValue(testGuild);

      const result = await guildService.joinEvent('guild_123', 'event_123', 'player_123');

      expect(result.success).toBe(true);
      expect(result.message).toBe('Successfully joined event');
    });

    it('should fail if guild not found', async () => {
      vi.mocked(mockGuildRepository.findById).mockResolvedValue(null);

      const result = await guildService.joinEvent('guild_123', 'event_123', 'player_123');

      expect(result.success).toBe(false);
      expect(result.message).toBe('Guild not found');
    });

    it('should fail if player is not a member', async () => {
      vi.mocked(mockGuildRepository.findById).mockResolvedValue(testGuild);

      const result = await guildService.joinEvent('guild_123', 'event_123', 'nonmember_123');

      expect(result.success).toBe(false);
      expect(result.message).toBe('You are not a member of this guild');
    });

    it('should fail if event not found', async () => {
      vi.mocked(mockGuildRepository.findById).mockResolvedValue(testGuild);

      const result = await guildService.joinEvent('guild_123', 'nonexistent_event', 'player_123');

      expect(result.success).toBe(false);
      expect(result.message).toBe('Event not found');
    });

    it('should fail if event is not active', async () => {
      testGuild.events[0].isActive = false;
      vi.mocked(mockGuildRepository.findById).mockResolvedValue(testGuild);

      const result = await guildService.joinEvent('guild_123', 'event_123', 'player_123');

      expect(result.success).toBe(false);
      expect(result.message).toBe('Event is not active');
    });

    it('should fail if already participating', async () => {
      testGuild.events[0].participants.push('player_123');
      vi.mocked(mockGuildRepository.findById).mockResolvedValue(testGuild);

      const result = await guildService.joinEvent('guild_123', 'event_123', 'player_123');

      expect(result.success).toBe(false);
      expect(result.message).toBe('You are already participating in this event');
    });
  });

  describe('getPublicGuilds', () => {
    it('should return public guilds', async () => {
      const publicGuilds = [testGuild];
      vi.mocked(mockGuildRepository.findPublicGuilds).mockResolvedValue(publicGuilds);

      const result = await guildService.getPublicGuilds(10);

      expect(result).toEqual(publicGuilds);
      expect(mockGuildRepository.findPublicGuilds).toHaveBeenCalledWith(10);
    });

    it('should use default limit', async () => {
      vi.mocked(mockGuildRepository.findPublicGuilds).mockResolvedValue([]);

      await guildService.getPublicGuilds();

      expect(mockGuildRepository.findPublicGuilds).toHaveBeenCalledWith(50);
    });
  });

  describe('updateGuildInfo', () => {
    it('should update guild info successfully', async () => {
      vi.mocked(mockGuildRepository.findById).mockResolvedValue(testGuild);
      vi.mocked(mockGuildRepository.findByName).mockResolvedValue(null);
      vi.mocked(mockGuildRepository.findByTag).mockResolvedValue(null);
      vi.mocked(mockGuildRepository.update).mockResolvedValue(testGuild);

      const updates = {
        name: 'Updated Guild Name',
        description: 'Updated description',
        tag: 'UPD'
      };

      const result = await guildService.updateGuildInfo('guild_123', 'player_123', updates);

      expect(result.success).toBe(true);
      expect(result.message).toBe('Guild information updated successfully');
    });

    it('should fail if guild not found', async () => {
      vi.mocked(mockGuildRepository.findById).mockResolvedValue(null);

      const result = await guildService.updateGuildInfo('guild_123', 'player_123', { name: 'New Name' });

      expect(result.success).toBe(false);
      expect(result.message).toBe('Guild not found');
    });

    it('should fail if updater is not a member', async () => {
      vi.mocked(mockGuildRepository.findById).mockResolvedValue(testGuild);

      const result = await guildService.updateGuildInfo('guild_123', 'nonmember_123', { name: 'New Name' });

      expect(result.success).toBe(false);
      expect(result.message).toBe('You are not a member of this guild');
    });

    it('should fail with invalid guild name', async () => {
      vi.mocked(mockGuildRepository.findById).mockResolvedValue(testGuild);

      const result = await guildService.updateGuildInfo('guild_123', 'player_123', { name: 'AB' });

      expect(result.success).toBe(false);
      expect(result.message).toBe('Invalid guild name format');
    });

    it('should fail if name already exists', async () => {
      const existingGuild = { ...testGuild, id: 'other_guild' };
      vi.mocked(mockGuildRepository.findById).mockResolvedValue(testGuild);
      vi.mocked(mockGuildRepository.findByName).mockResolvedValue(existingGuild);

      const result = await guildService.updateGuildInfo('guild_123', 'player_123', { name: 'Existing Name' });

      expect(result.success).toBe(false);
      expect(result.message).toBe('Guild name already exists');
    });
  });
});