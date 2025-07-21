import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GuildService, GuildRepository, PlayerRepository } from '../../services/GuildService';
import { Guild, GuildRole, GuildEventType, GuildFactory } from '../../models/Guild';
import { Player, PlayerFactory } from '../../models/Player';

// Mock repositories for integration testing
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

describe('Guild Integration Tests', () => {
  let guildService: GuildService;
  let leader: Player;
  let member1: Player;
  let member2: Player;
  let guild: Guild;

  beforeEach(() => {
    vi.clearAllMocks();
    
    guildService = new GuildService(mockGuildRepository, mockPlayerRepository);
    
    // Create test players
    leader = PlayerFactory.createNewPlayer('GuildLeader');
    leader.id = 'leader_123';
    
    member1 = PlayerFactory.createNewPlayer('Member1');
    member1.id = 'member1_123';
    
    member2 = PlayerFactory.createNewPlayer('Member2');
    member2.id = 'member2_123';
    
    // Create test guild
    guild = GuildFactory.createNewGuild('Test Guild', 'TEST', leader.id, leader.username);
    guild.id = 'guild_123';
  });

  describe('Complete Guild Workflow', () => {
    it('should handle complete guild creation and member management workflow', async () => {
      // Step 1: Create guild
      vi.mocked(mockPlayerRepository.findById).mockImplementation(async (id: string) => {
        if (id === leader.id) return leader;
        if (id === member1.id) return member1;
        if (id === member2.id) return member2;
        return null;
      });
      
      vi.mocked(mockGuildRepository.findByName).mockResolvedValue(null);
      vi.mocked(mockGuildRepository.findByTag).mockResolvedValue(null);
      vi.mocked(mockGuildRepository.create).mockResolvedValue(guild);
      vi.mocked(mockPlayerRepository.update).mockResolvedValue(leader);

      const createResult = await guildService.createGuild('Test Guild', 'TEST', leader.id);
      expect(createResult.success).toBe(true);
      expect(createResult.data?.name).toBe('Test Guild');

      // Step 2: Invite first member
      vi.mocked(mockGuildRepository.findById).mockResolvedValue(guild);
      
      const inviteResult = await guildService.invitePlayer(guild.id, leader.id, member1.id);
      expect(inviteResult.success).toBe(true);
      expect(inviteResult.data?.playerId).toBe(member1.id);

      // Step 3: Member joins guild
      vi.mocked(mockGuildRepository.update).mockResolvedValue(guild);
      
      const joinResult = await guildService.joinGuild(guild.id, member1.id);
      expect(joinResult.success).toBe(true);
      expect(joinResult.data?.role).toBe(GuildRole.MEMBER);

      // Step 4: Promote member to officer
      // First add the member to the guild for the test
      guild.members.push({
        playerId: member1.id,
        username: member1.username,
        role: GuildRole.MEMBER,
        joinedAt: new Date(),
        lastActive: new Date(),
        contributionPoints: 0
      });

      const promoteResult = await guildService.changeMemberRole(guild.id, member1.id, GuildRole.OFFICER, leader.id);
      expect(promoteResult.success).toBe(true);
      expect(promoteResult.data?.role).toBe(GuildRole.OFFICER);

      // Step 5: Officer invites another member
      // Update the member's role in the guild for the test
      guild.members[1].role = GuildRole.OFFICER;
      
      const officerInviteResult = await guildService.invitePlayer(guild.id, member1.id, member2.id);
      expect(officerInviteResult.success).toBe(true);

      // Step 6: Second member joins
      const secondJoinResult = await guildService.joinGuild(guild.id, member2.id);
      expect(secondJoinResult.success).toBe(true);
    });

    it('should handle guild event creation and participation', async () => {
      // Setup guild with members
      guild.members.push(
        {
          playerId: member1.id,
          username: member1.username,
          role: GuildRole.OFFICER,
          joinedAt: new Date(),
          lastActive: new Date(),
          contributionPoints: 50
        },
        {
          playerId: member2.id,
          username: member2.username,
          role: GuildRole.MEMBER,
          joinedAt: new Date(),
          lastActive: new Date(),
          contributionPoints: 25
        }
      );

      vi.mocked(mockGuildRepository.findById).mockResolvedValue(guild);
      vi.mocked(mockGuildRepository.update).mockResolvedValue(guild);

      // Step 1: Leader creates an event
      const eventData = {
        name: 'Weekly Dungeon Raid',
        description: 'Join us for our weekly dungeon raid!',
        eventType: GuildEventType.DUNGEON_RAID,
        startTime: new Date(Date.now() + 3600000), // 1 hour from now
        endTime: new Date(Date.now() + 7200000), // 2 hours from now
        rewards: [
          { itemId: 'rare_sword', quantity: 1 },
          { itemId: 'gold_coins', quantity: 100 }
        ]
      };

      const createEventResult = await guildService.createEvent(guild.id, leader.id, eventData);
      expect(createEventResult.success).toBe(true);
      expect(createEventResult.data?.name).toBe('Weekly Dungeon Raid');
      expect(createEventResult.data?.createdBy).toBe(leader.id);

      // Step 2: Members join the event
      const eventId = createEventResult.data?.id!;
      
      const joinEvent1Result = await guildService.joinEvent(guild.id, eventId, member1.id);
      expect(joinEvent1Result.success).toBe(true);

      const joinEvent2Result = await guildService.joinEvent(guild.id, eventId, member2.id);
      expect(joinEvent2Result.success).toBe(true);

      // Step 3: Try to join again (should fail)
      const duplicateJoinResult = await guildService.joinEvent(guild.id, eventId, member1.id);
      expect(duplicateJoinResult.success).toBe(false);
      expect(duplicateJoinResult.message).toBe('You are already participating in this event');
    });

    it('should handle guild leadership transfer when leader leaves', async () => {
      // Setup guild with officer and member
      guild.members.push(
        {
          playerId: member1.id,
          username: member1.username,
          role: GuildRole.OFFICER,
          joinedAt: new Date(),
          lastActive: new Date(),
          contributionPoints: 75
        },
        {
          playerId: member2.id,
          username: member2.username,
          role: GuildRole.MEMBER,
          joinedAt: new Date(),
          lastActive: new Date(),
          contributionPoints: 25
        }
      );

      vi.mocked(mockGuildRepository.findById).mockResolvedValue(guild);
      vi.mocked(mockGuildRepository.update).mockResolvedValue(guild);
      vi.mocked(mockPlayerRepository.update).mockResolvedValue(leader);

      // Leader leaves the guild
      const leaveResult = await guildService.removeMember(guild.id, leader.id, leader.id);
      expect(leaveResult.success).toBe(true);
      expect(leaveResult.message).toBe('Successfully left guild');

      // Verify that the update was called to transfer leadership
      expect(mockGuildRepository.update).toHaveBeenCalledWith(
        guild.id,
        expect.objectContaining({
          leaderId: member1.id, // Officer should become the new leader
          members: expect.any(Array),
          lastActivity: expect.any(Date)
        })
      );
    });

    it('should handle guild information updates', async () => {
      vi.mocked(mockGuildRepository.findById).mockResolvedValue(guild);
      vi.mocked(mockGuildRepository.findByName).mockResolvedValue(null);
      vi.mocked(mockGuildRepository.findByTag).mockResolvedValue(null);
      vi.mocked(mockGuildRepository.update).mockResolvedValue(guild);

      const updates = {
        name: 'Updated Guild Name',
        description: 'This is our updated guild description',
        tag: 'UPD'
      };

      const updateResult = await guildService.updateGuildInfo(guild.id, leader.id, updates);
      expect(updateResult.success).toBe(true);
      expect(updateResult.message).toBe('Guild information updated successfully');

      // Verify the update was called with correct data
      expect(mockGuildRepository.update).toHaveBeenCalledWith(
        guild.id,
        expect.objectContaining({
          name: 'Updated Guild Name',
          description: 'This is our updated guild description',
          tag: 'UPD',
          lastActivity: expect.any(Date)
        })
      );
    });

    it('should handle permission-based operations correctly', async () => {
      // Add members with different roles
      guild.members.push(
        {
          playerId: member1.id,
          username: member1.username,
          role: GuildRole.OFFICER,
          joinedAt: new Date(),
          lastActive: new Date(),
          contributionPoints: 50
        },
        {
          playerId: member2.id,
          username: member2.username,
          role: GuildRole.MEMBER,
          joinedAt: new Date(),
          lastActive: new Date(),
          contributionPoints: 25
        }
      );

      vi.mocked(mockGuildRepository.findById).mockResolvedValue(guild);

      // Test 1: Member tries to invite someone (should fail)
      const memberInviteResult = await guildService.invitePlayer(guild.id, member2.id, 'new_player_123');
      expect(memberInviteResult.success).toBe(false);
      expect(memberInviteResult.message).toBe('You do not have permission to invite members');

      // Test 2: Officer tries to kick the leader (should fail)
      const officerKickLeaderResult = await guildService.removeMember(guild.id, leader.id, member1.id);
      expect(officerKickLeaderResult.success).toBe(false);
      expect(officerKickLeaderResult.message).toBe('You cannot kick this member due to their role');

      // Test 3: Officer kicks regular member (should succeed)
      vi.mocked(mockGuildRepository.update).mockResolvedValue(guild);
      vi.mocked(mockPlayerRepository.update).mockResolvedValue(member2);
      
      const validKickResult = await guildService.removeMember(guild.id, member2.id, member1.id);
      expect(validKickResult.success).toBe(true);
      expect(validKickResult.message).toBe('Member kicked successfully');
    });
  });

  describe('Error Handling', () => {
    it('should handle repository errors gracefully', async () => {
      // Create a fresh service instance for this test to avoid mock interference
      const errorGuildService = new GuildService(mockGuildRepository, mockPlayerRepository);
      
      // Mock repository to throw an error
      vi.mocked(mockPlayerRepository.findById).mockRejectedValue(new Error('Database connection failed'));

      const result = await errorGuildService.createGuild('Test Guild', 'TEST', leader.id);
      expect(result.success).toBe(false);
      expect(result.message).toContain('Failed to create guild');
      expect(result.message).toContain('Database connection failed');
    });

    it('should validate guild constraints', async () => {
      // Create a fresh service instance for this test
      const validationGuildService = new GuildService(mockGuildRepository, mockPlayerRepository);
      
      // Test invalid guild name - this should fail at the GuildFactory level before hitting repository
      try {
        const invalidNameResult = await validationGuildService.createGuild('AB', 'TEST', leader.id);
        expect(invalidNameResult.success).toBe(false);
        expect(invalidNameResult.message).toContain('Invalid guild name format');
      } catch (error) {
        // If it throws an error directly from GuildFactory, that's also valid
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toContain('Invalid guild name format');
      }

      // Test invalid guild tag - this should fail at the GuildFactory level before hitting repository
      try {
        const invalidTagResult = await validationGuildService.createGuild('Valid Guild Name', 'invalid', leader.id);
        expect(invalidTagResult.success).toBe(false);
        expect(invalidTagResult.message).toContain('Invalid guild tag format');
      } catch (error) {
        // If it throws an error directly from GuildFactory, that's also valid
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toContain('Invalid guild tag format');
      }
    });
  });
});