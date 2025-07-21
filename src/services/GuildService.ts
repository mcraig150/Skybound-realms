import { 
  Guild, 
  GuildMember, 
  GuildRole, 
  GuildPermission, 
  GuildEvent, 
  GuildEventType, 
  GuildPerk, 
  GuildPerkType,
  GuildFactory, 
  GuildValidator, 
  GuildPermissionManager 
} from '../models/Guild';
import { Player } from '../models/Player';
import { Utils } from '../shared/utils';

export interface GuildRepository {
  findById(id: string): Promise<Guild | null>;
  findByName(name: string): Promise<Guild | null>;
  findByTag(tag: string): Promise<Guild | null>;
  findByMemberId(playerId: string): Promise<Guild | null>;
  create(guild: Guild): Promise<Guild>;
  update(id: string, updates: Partial<Guild>): Promise<Guild | null>;
  delete(id: string): Promise<void>;
  findPublicGuilds(limit?: number): Promise<Guild[]>;
}

export interface PlayerRepository {
  findById(id: string): Promise<Player | null>;
  update(id: string, updates: Partial<Player>): Promise<Player | null>;
}

export interface GuildJoinRequest {
  guildId: string;
  playerId: string;
  message?: string;
}

export interface GuildInvitation {
  guildId: string;
  playerId: string;
  invitedBy: string;
  expiresAt: Date;
}

export interface GuildOperationResult {
  success: boolean;
  message: string;
  data?: any;
}

export class GuildService {
  constructor(
    private guildRepository: GuildRepository,
    private playerRepository: PlayerRepository
  ) {}

  /**
   * Create a new guild
   */
  async createGuild(name: string, tag: string, leaderId: string): Promise<GuildOperationResult> {
    try {
      // Check if player exists and is not already in a guild
      const player = await this.playerRepository.findById(leaderId);
      if (!player) {
        return { success: false, message: 'Player not found' };
      }

      if (player.guildId) {
        return { success: false, message: 'Player is already in a guild' };
      }

      // Check if guild name or tag already exists
      const existingByName = await this.guildRepository.findByName(name);
      if (existingByName) {
        return { success: false, message: 'Guild name already exists' };
      }

      const existingByTag = await this.guildRepository.findByTag(tag);
      if (existingByTag) {
        return { success: false, message: 'Guild tag already exists' };
      }

      // Create the guild
      const newGuild = GuildFactory.createNewGuild(name, tag, leaderId, player.username);
      const createdGuild = await this.guildRepository.create(newGuild);

      // Update player's guild ID
      await this.playerRepository.update(leaderId, { guildId: createdGuild.id });

      return { 
        success: true, 
        message: 'Guild created successfully', 
        data: createdGuild 
      };
    } catch (error) {
      return { 
        success: false, 
        message: `Failed to create guild: ${error instanceof Error ? error.message : 'Unknown error'}` 
      };
    }
  }

  /**
   * Get guild by ID
   */
  async getGuild(guildId: string): Promise<Guild | null> {
    return await this.guildRepository.findById(guildId);
  }

  /**
   * Get guild by player ID
   */
  async getPlayerGuild(playerId: string): Promise<Guild | null> {
    return await this.guildRepository.findByMemberId(playerId);
  }

  /**
   * Invite a player to join the guild
   */
  async invitePlayer(guildId: string, inviterId: string, targetPlayerId: string): Promise<GuildOperationResult> {
    try {
      const guild = await this.guildRepository.findById(guildId);
      if (!guild) {
        return { success: false, message: 'Guild not found' };
      }

      const inviter = guild.members.find(m => m.playerId === inviterId);
      if (!inviter) {
        return { success: false, message: 'Inviter is not a member of this guild' };
      }

      if (!GuildPermissionManager.hasPermission(inviter.role, GuildPermission.INVITE_MEMBERS)) {
        return { success: false, message: 'You do not have permission to invite members' };
      }

      const targetPlayer = await this.playerRepository.findById(targetPlayerId);
      if (!targetPlayer) {
        return { success: false, message: 'Target player not found' };
      }

      if (targetPlayer.guildId) {
        return { success: false, message: 'Player is already in a guild' };
      }

      if (guild.members.length >= guild.maxMembers) {
        return { success: false, message: 'Guild is at maximum capacity' };
      }

      // In a real implementation, this would create an invitation record
      // For now, we'll return success with invitation details
      const invitation: GuildInvitation = {
        guildId,
        playerId: targetPlayerId,
        invitedBy: inviterId,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
      };

      return { 
        success: true, 
        message: 'Invitation sent successfully', 
        data: invitation 
      };
    } catch (error) {
      return { 
        success: false, 
        message: `Failed to invite player: ${error instanceof Error ? error.message : 'Unknown error'}` 
      };
    }
  }

  /**
   * Join a guild (either by invitation or application)
   */
  async joinGuild(guildId: string, playerId: string): Promise<GuildOperationResult> {
    try {
      const guild = await this.guildRepository.findById(guildId);
      if (!guild) {
        return { success: false, message: 'Guild not found' };
      }

      const player = await this.playerRepository.findById(playerId);
      if (!player) {
        return { success: false, message: 'Player not found' };
      }

      if (player.guildId) {
        return { success: false, message: 'Player is already in a guild' };
      }

      if (guild.members.length >= guild.maxMembers) {
        return { success: false, message: 'Guild is at maximum capacity' };
      }

      // Check guild settings
      if (!guild.settings.isPublic && guild.settings.requiresApproval) {
        return { success: false, message: 'This guild requires approval to join' };
      }

      // Add player to guild
      const newMember: GuildMember = {
        playerId,
        username: player.username,
        role: GuildRole.MEMBER,
        joinedAt: new Date(),
        lastActive: new Date(),
        contributionPoints: 0
      };

      guild.members.push(newMember);
      guild.lastActivity = new Date();

      await this.guildRepository.update(guildId, { 
        members: guild.members, 
        lastActivity: guild.lastActivity 
      });

      // Update player's guild ID
      await this.playerRepository.update(playerId, { guildId });

      return { 
        success: true, 
        message: 'Successfully joined guild', 
        data: newMember 
      };
    } catch (error) {
      return { 
        success: false, 
        message: `Failed to join guild: ${error instanceof Error ? error.message : 'Unknown error'}` 
      };
    }
  }

  /**
   * Leave or kick a member from the guild
   */
  async removeMember(guildId: string, targetPlayerId: string, removedBy?: string): Promise<GuildOperationResult> {
    try {
      const guild = await this.guildRepository.findById(guildId);
      if (!guild) {
        return { success: false, message: 'Guild not found' };
      }

      const targetMember = guild.members.find(m => m.playerId === targetPlayerId);
      if (!targetMember) {
        return { success: false, message: 'Player is not a member of this guild' };
      }

      // If someone else is removing the member, check permissions
      if (removedBy && removedBy !== targetPlayerId) {
        const remover = guild.members.find(m => m.playerId === removedBy);
        if (!remover) {
          return { success: false, message: 'Remover is not a member of this guild' };
        }

        if (!GuildPermissionManager.hasPermission(remover.role, GuildPermission.KICK_MEMBERS)) {
          return { success: false, message: 'You do not have permission to kick members' };
        }

        if (!GuildPermissionManager.canManageMember(remover.role, targetMember.role)) {
          return { success: false, message: 'You cannot kick this member due to their role' };
        }
      }

      // Cannot remove the guild leader unless they're leaving themselves
      if (targetMember.role === GuildRole.LEADER && removedBy !== targetPlayerId) {
        return { success: false, message: 'Cannot kick the guild leader' };
      }

      // Remove member from guild
      guild.members = guild.members.filter(m => m.playerId !== targetPlayerId);
      guild.lastActivity = new Date();

      // If the leader is leaving, transfer leadership or disband guild
      if (targetMember.role === GuildRole.LEADER) {
        if (guild.members.length === 0) {
          // Disband guild if no members left
          await this.guildRepository.delete(guildId);
        } else {
          // Transfer leadership to the first officer, or first member if no officers
          const newLeader = guild.members.find(m => m.role === GuildRole.OFFICER) || guild.members[0];
          if (newLeader) {
            newLeader.role = GuildRole.LEADER;
            guild.leaderId = newLeader.playerId;
          }
          
          await this.guildRepository.update(guildId, { 
            members: guild.members, 
            leaderId: guild.leaderId,
            lastActivity: guild.lastActivity 
          });
        }
      } else {
        await this.guildRepository.update(guildId, { 
          members: guild.members, 
          lastActivity: guild.lastActivity 
        });
      }

      // Update player's guild ID
      await this.playerRepository.update(targetPlayerId, { guildId: null as any });

      return { 
        success: true, 
        message: removedBy === targetPlayerId ? 'Successfully left guild' : 'Member kicked successfully' 
      };
    } catch (error) {
      return { 
        success: false, 
        message: `Failed to remove member: ${error instanceof Error ? error.message : 'Unknown error'}` 
      };
    }
  }

  /**
   * Promote or demote a guild member
   */
  async changeMemberRole(guildId: string, targetPlayerId: string, newRole: GuildRole, changedBy: string): Promise<GuildOperationResult> {
    try {
      const guild = await this.guildRepository.findById(guildId);
      if (!guild) {
        return { success: false, message: 'Guild not found' };
      }

      const changer = guild.members.find(m => m.playerId === changedBy);
      if (!changer) {
        return { success: false, message: 'You are not a member of this guild' };
      }

      const targetMember = guild.members.find(m => m.playerId === targetPlayerId);
      if (!targetMember) {
        return { success: false, message: 'Target player is not a member of this guild' };
      }

      if (!GuildPermissionManager.hasPermission(changer.role, GuildPermission.PROMOTE_MEMBERS)) {
        return { success: false, message: 'You do not have permission to change member roles' };
      }

      if (!GuildPermissionManager.canManageMember(changer.role, targetMember.role)) {
        return { success: false, message: 'You cannot change this member\'s role' };
      }

      // Cannot promote to leader role (leadership transfer is separate)
      if (newRole === GuildRole.LEADER) {
        return { success: false, message: 'Use leadership transfer to make someone a leader' };
      }

      // Update member role
      targetMember.role = newRole;
      guild.lastActivity = new Date();

      await this.guildRepository.update(guildId, { 
        members: guild.members, 
        lastActivity: guild.lastActivity 
      });

      return { 
        success: true, 
        message: `Member role changed to ${newRole}`, 
        data: targetMember 
      };
    } catch (error) {
      return { 
        success: false, 
        message: `Failed to change member role: ${error instanceof Error ? error.message : 'Unknown error'}` 
      };
    }
  }

  /**
   * Create a guild event
   */
  async createEvent(guildId: string, creatorId: string, eventData: Omit<GuildEvent, 'id' | 'participants' | 'isActive' | 'createdBy'>): Promise<GuildOperationResult> {
    try {
      const guild = await this.guildRepository.findById(guildId);
      if (!guild) {
        return { success: false, message: 'Guild not found' };
      }

      const creator = guild.members.find(m => m.playerId === creatorId);
      if (!creator) {
        return { success: false, message: 'You are not a member of this guild' };
      }

      if (!GuildPermissionManager.hasPermission(creator.role, GuildPermission.MANAGE_EVENTS)) {
        return { success: false, message: 'You do not have permission to create events' };
      }

      const newEvent: GuildEvent = {
        ...eventData,
        id: Utils.generateId(),
        participants: [],
        isActive: true,
        createdBy: creatorId
      };

      guild.events.push(newEvent);
      guild.lastActivity = new Date();

      await this.guildRepository.update(guildId, { 
        events: guild.events, 
        lastActivity: guild.lastActivity 
      });

      return { 
        success: true, 
        message: 'Event created successfully', 
        data: newEvent 
      };
    } catch (error) {
      return { 
        success: false, 
        message: `Failed to create event: ${error instanceof Error ? error.message : 'Unknown error'}` 
      };
    }
  }

  /**
   * Join a guild event
   */
  async joinEvent(guildId: string, eventId: string, playerId: string): Promise<GuildOperationResult> {
    try {
      const guild = await this.guildRepository.findById(guildId);
      if (!guild) {
        return { success: false, message: 'Guild not found' };
      }

      const member = guild.members.find(m => m.playerId === playerId);
      if (!member) {
        return { success: false, message: 'You are not a member of this guild' };
      }

      const event = guild.events.find(e => e.id === eventId);
      if (!event) {
        return { success: false, message: 'Event not found' };
      }

      if (!event.isActive) {
        return { success: false, message: 'Event is not active' };
      }

      if (event.participants.includes(playerId)) {
        return { success: false, message: 'You are already participating in this event' };
      }

      event.participants.push(playerId);
      guild.lastActivity = new Date();

      await this.guildRepository.update(guildId, { 
        events: guild.events, 
        lastActivity: guild.lastActivity 
      });

      return { 
        success: true, 
        message: 'Successfully joined event' 
      };
    } catch (error) {
      return { 
        success: false, 
        message: `Failed to join event: ${error instanceof Error ? error.message : 'Unknown error'}` 
      };
    }
  }

  /**
   * Activate a guild perk
   */
  async activatePerk(guildId: string, perkId: string, activatedBy: string): Promise<GuildOperationResult> {
    try {
      const guild = await this.guildRepository.findById(guildId);
      if (!guild) {
        return { success: false, message: 'Guild not found' };
      }

      const activator = guild.members.find(m => m.playerId === activatedBy);
      if (!activator) {
        return { success: false, message: 'You are not a member of this guild' };
      }

      if (!GuildPermissionManager.hasPermission(activator.role, GuildPermission.MANAGE_PERKS)) {
        return { success: false, message: 'You do not have permission to manage perks' };
      }

      const perk = guild.perks.find(p => p.id === perkId);
      if (!perk) {
        return { success: false, message: 'Perk not found' };
      }

      if (perk.isActive) {
        return { success: false, message: 'Perk is already active' };
      }

      if (guild.treasury.guildPoints < perk.cost) {
        return { success: false, message: 'Insufficient guild points to activate perk' };
      }

      // Activate perk and deduct cost
      perk.isActive = true;
      guild.treasury.guildPoints -= perk.cost;
      guild.lastActivity = new Date();

      await this.guildRepository.update(guildId, { 
        perks: guild.perks, 
        treasury: guild.treasury,
        lastActivity: guild.lastActivity 
      });

      return { 
        success: true, 
        message: 'Perk activated successfully', 
        data: perk 
      };
    } catch (error) {
      return { 
        success: false, 
        message: `Failed to activate perk: ${error instanceof Error ? error.message : 'Unknown error'}` 
      };
    }
  }

  /**
   * Get public guilds for browsing
   */
  async getPublicGuilds(limit: number = 50): Promise<Guild[]> {
    return await this.guildRepository.findPublicGuilds(limit);
  }

  /**
   * Update guild information
   */
  async updateGuildInfo(guildId: string, updatedBy: string, updates: { name?: string; description?: string; tag?: string }): Promise<GuildOperationResult> {
    try {
      const guild = await this.guildRepository.findById(guildId);
      if (!guild) {
        return { success: false, message: 'Guild not found' };
      }

      const updater = guild.members.find(m => m.playerId === updatedBy);
      if (!updater) {
        return { success: false, message: 'You are not a member of this guild' };
      }

      if (!GuildPermissionManager.hasPermission(updater.role, GuildPermission.EDIT_GUILD_INFO)) {
        return { success: false, message: 'You do not have permission to edit guild information' };
      }

      // Validate updates
      if (updates.name && !GuildValidator.isValidGuildName(updates.name)) {
        return { success: false, message: 'Invalid guild name format' };
      }

      if (updates.tag && !GuildValidator.isValidGuildTag(updates.tag)) {
        return { success: false, message: 'Invalid guild tag format' };
      }

      // Check for name/tag conflicts
      if (updates.name && updates.name !== guild.name) {
        const existingByName = await this.guildRepository.findByName(updates.name);
        if (existingByName) {
          return { success: false, message: 'Guild name already exists' };
        }
      }

      if (updates.tag && updates.tag !== guild.tag) {
        const existingByTag = await this.guildRepository.findByTag(updates.tag);
        if (existingByTag) {
          return { success: false, message: 'Guild tag already exists' };
        }
      }

      const updateData = {
        ...updates,
        lastActivity: new Date()
      };

      await this.guildRepository.update(guildId, updateData);

      return { 
        success: true, 
        message: 'Guild information updated successfully' 
      };
    } catch (error) {
      return { 
        success: false, 
        message: `Failed to update guild info: ${error instanceof Error ? error.message : 'Unknown error'}` 
      };
    }
  }


}