export enum GuildRole {
  MEMBER = 'member',
  OFFICER = 'officer',
  LEADER = 'leader'
}

export enum GuildPermission {
  INVITE_MEMBERS = 'invite_members',
  KICK_MEMBERS = 'kick_members',
  PROMOTE_MEMBERS = 'promote_members',
  MANAGE_EVENTS = 'manage_events',
  MANAGE_PERKS = 'manage_perks',
  EDIT_GUILD_INFO = 'edit_guild_info',
  DISBAND_GUILD = 'disband_guild'
}

export interface GuildMember {
  playerId: string;
  username: string;
  role: GuildRole;
  joinedAt: Date;
  lastActive: Date;
  contributionPoints: number;
}

export interface GuildEvent {
  id: string;
  name: string;
  description: string;
  eventType: GuildEventType;
  startTime: Date;
  endTime: Date;
  participants: string[];
  rewards: GuildEventReward[];
  isActive: boolean;
  createdBy: string;
}

export enum GuildEventType {
  DUNGEON_RAID = 'dungeon_raid',
  RESOURCE_GATHERING = 'resource_gathering',
  PVP_TOURNAMENT = 'pvp_tournament',
  BUILDING_CONTEST = 'building_contest',
  FISHING_COMPETITION = 'fishing_competition'
}

export interface GuildEventReward {
  itemId: string;
  quantity: number;
  rarity?: string;
}

export interface GuildPerk {
  id: string;
  name: string;
  description: string;
  perkType: GuildPerkType;
  level: number;
  maxLevel: number;
  cost: number;
  effects: GuildPerkEffect[];
  isActive: boolean;
}

export enum GuildPerkType {
  RESOURCE_BONUS = 'resource_bonus',
  EXPERIENCE_BONUS = 'experience_bonus',
  COMBAT_BONUS = 'combat_bonus',
  TRADING_BONUS = 'trading_bonus',
  STORAGE_BONUS = 'storage_bonus'
}

export interface GuildPerkEffect {
  effectType: string;
  value: number;
  target: string;
}

export interface Guild {
  id: string;
  name: string;
  description: string;
  tag: string; // Short guild identifier (3-5 characters)
  leaderId: string;
  members: GuildMember[];
  level: number;
  experience: number;
  maxMembers: number;
  treasury: GuildTreasury;
  perks: GuildPerk[];
  events: GuildEvent[];
  settings: GuildSettings;
  createdAt: Date;
  lastActivity: Date;
}

export interface GuildTreasury {
  coins: number;
  guildPoints: number;
  resources: Map<string, number>;
}

export interface GuildSettings {
  isPublic: boolean;
  requiresApproval: boolean;
  minimumLevel: number;
  allowedRoles: GuildRole[];
  eventNotifications: boolean;
  memberNotifications: boolean;
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

export class GuildValidator {
  /**
   * Validate a complete guild object
   */
  static validateGuild(guild: Guild): ValidationResult {
    const errors: string[] = [];

    // Validate basic fields
    if (!guild.id || typeof guild.id !== 'string') {
      errors.push('Guild ID is required and must be a string');
    }

    if (!this.isValidGuildName(guild.name)) {
      errors.push('Guild name must be 3-30 characters and contain only letters, numbers, spaces, and basic punctuation');
    }

    if (!this.isValidGuildTag(guild.tag)) {
      errors.push('Guild tag must be 3-5 characters and contain only uppercase letters and numbers');
    }

    if (!guild.leaderId || typeof guild.leaderId !== 'string') {
      errors.push('Guild leader ID is required and must be a string');
    }

    // Validate members
    const memberValidation = this.validateMembers(guild.members, guild.leaderId);
    if (!memberValidation.isValid) {
      errors.push(...memberValidation.errors);
    }

    // Validate level and experience
    if (guild.level < 1 || guild.level > 100) {
      errors.push('Guild level must be between 1 and 100');
    }

    if (guild.experience < 0) {
      errors.push('Guild experience cannot be negative');
    }

    // Validate max members
    if (guild.maxMembers < 5 || guild.maxMembers > 100) {
      errors.push('Guild max members must be between 5 and 100');
    }

    if (guild.members.length > guild.maxMembers) {
      errors.push('Guild cannot have more members than max members limit');
    }

    // Validate treasury
    const treasuryValidation = this.validateTreasury(guild.treasury);
    if (!treasuryValidation.isValid) {
      errors.push(...treasuryValidation.errors);
    }

    // Validate dates
    if (!(guild.createdAt instanceof Date) || isNaN(guild.createdAt.getTime())) {
      errors.push('Created at must be a valid Date object');
    }

    if (!(guild.lastActivity instanceof Date) || isNaN(guild.lastActivity.getTime())) {
      errors.push('Last activity must be a valid Date object');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Validate guild members
   */
  static validateMembers(members: GuildMember[], leaderId: string): ValidationResult {
    const errors: string[] = [];

    if (!Array.isArray(members)) {
      errors.push('Members must be an array');
      return { isValid: false, errors };
    }

    if (members.length === 0) {
      errors.push('Guild must have at least one member');
      return { isValid: false, errors };
    }

    // Check if leader is in members list
    const leaderMember = members.find(m => m.playerId === leaderId);
    if (!leaderMember) {
      errors.push('Guild leader must be in the members list');
    } else if (leaderMember.role !== GuildRole.LEADER) {
      errors.push('Guild leader must have LEADER role');
    }

    // Check for duplicate members
    const playerIds = members.map(m => m.playerId);
    const uniquePlayerIds = new Set(playerIds);
    if (playerIds.length !== uniquePlayerIds.size) {
      errors.push('Guild cannot have duplicate members');
    }

    // Validate each member
    members.forEach((member, index) => {
      const memberValidation = this.validateMember(member);
      if (!memberValidation.isValid) {
        errors.push(...memberValidation.errors.map(e => `Member ${index}: ${e}`));
      }
    });

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Validate individual guild member
   */
  static validateMember(member: GuildMember): ValidationResult {
    const errors: string[] = [];

    if (!member.playerId || typeof member.playerId !== 'string') {
      errors.push('Player ID is required and must be a string');
    }

    if (!member.username || typeof member.username !== 'string' || member.username.length < 3) {
      errors.push('Username is required and must be at least 3 characters');
    }

    if (!Object.values(GuildRole).includes(member.role)) {
      errors.push('Invalid guild role');
    }

    if (!(member.joinedAt instanceof Date) || isNaN(member.joinedAt.getTime())) {
      errors.push('Joined at must be a valid Date object');
    }

    if (!(member.lastActive instanceof Date) || isNaN(member.lastActive.getTime())) {
      errors.push('Last active must be a valid Date object');
    }

    if (typeof member.contributionPoints !== 'number' || member.contributionPoints < 0) {
      errors.push('Contribution points must be a non-negative number');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Validate guild treasury
   */
  static validateTreasury(treasury: GuildTreasury): ValidationResult {
    const errors: string[] = [];

    if (typeof treasury.coins !== 'number' || treasury.coins < 0) {
      errors.push('Treasury coins must be a non-negative number');
    }

    if (typeof treasury.guildPoints !== 'number' || treasury.guildPoints < 0) {
      errors.push('Treasury guild points must be a non-negative number');
    }

    if (!(treasury.resources instanceof Map)) {
      errors.push('Treasury resources must be a Map');
    } else {
      for (const [resourceId, quantity] of treasury.resources) {
        if (typeof resourceId !== 'string' || resourceId.length === 0) {
          errors.push('Resource ID must be a non-empty string');
        }
        if (typeof quantity !== 'number' || quantity < 0) {
          errors.push(`Resource ${resourceId} quantity must be a non-negative number`);
        }
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Check if guild name is valid
   */
  static isValidGuildName(name: string): boolean {
    if (!name || typeof name !== 'string') return false;
    if (name.length < 3 || name.length > 30) return false;
    // Allow letters, numbers, spaces, and basic punctuation
    return /^[a-zA-Z0-9\s\-_'.!]+$/.test(name);
  }

  /**
   * Check if guild tag is valid
   */
  static isValidGuildTag(tag: string): boolean {
    if (!tag || typeof tag !== 'string') return false;
    if (tag.length < 3 || tag.length > 5) return false;
    // Only uppercase letters and numbers
    return /^[A-Z0-9]+$/.test(tag);
  }
}

export class GuildPermissionManager {
  /**
   * Get permissions for a guild role
   */
  static getPermissionsForRole(role: GuildRole): GuildPermission[] {
    switch (role) {
      case GuildRole.LEADER:
        return Object.values(GuildPermission);
      case GuildRole.OFFICER:
        return [
          GuildPermission.INVITE_MEMBERS,
          GuildPermission.KICK_MEMBERS,
          GuildPermission.MANAGE_EVENTS
        ];
      case GuildRole.MEMBER:
        return [];
      default:
        return [];
    }
  }

  /**
   * Check if a role has a specific permission
   */
  static hasPermission(role: GuildRole, permission: GuildPermission): boolean {
    const permissions = this.getPermissionsForRole(role);
    return permissions.includes(permission);
  }

  /**
   * Check if a member can perform an action on another member
   */
  static canManageMember(managerRole: GuildRole, targetRole: GuildRole): boolean {
    // Leaders can manage everyone
    if (managerRole === GuildRole.LEADER) return true;
    
    // Officers can manage members but not other officers or leaders
    if (managerRole === GuildRole.OFFICER && targetRole === GuildRole.MEMBER) return true;
    
    // Members cannot manage anyone
    return false;
  }
}

import { Utils } from '../shared/utils';

export class GuildFactory {
  /**
   * Create a new guild with default values
   */
  static createNewGuild(name: string, tag: string, leaderId: string, leaderUsername: string): Guild {
    if (!GuildValidator.isValidGuildName(name)) {
      throw new Error('Invalid guild name format');
    }

    if (!GuildValidator.isValidGuildTag(tag)) {
      throw new Error('Invalid guild tag format');
    }

    const guildId = Utils.generateId();
    const now = new Date();

    const leaderMember: GuildMember = {
      playerId: leaderId,
      username: leaderUsername,
      role: GuildRole.LEADER,
      joinedAt: now,
      lastActive: now,
      contributionPoints: 0
    };

    return {
      id: guildId,
      name,
      description: '',
      tag,
      leaderId,
      members: [leaderMember],
      level: 1,
      experience: 0,
      maxMembers: 20, // Starting max members
      treasury: {
        coins: 0,
        guildPoints: 0,
        resources: new Map()
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
  }



  /**
   * Serialize guild data for storage
   */
  static serializeGuild(guild: Guild): any {
    return {
      ...guild,
      treasury: {
        ...guild.treasury,
        resources: Object.fromEntries(guild.treasury.resources)
      },
      createdAt: guild.createdAt.toISOString(),
      lastActivity: guild.lastActivity.toISOString(),
      members: guild.members.map(member => ({
        ...member,
        joinedAt: member.joinedAt.toISOString(),
        lastActive: member.lastActive.toISOString()
      })),
      events: guild.events.map(event => ({
        ...event,
        startTime: event.startTime.toISOString(),
        endTime: event.endTime.toISOString()
      }))
    };
  }

  /**
   * Deserialize guild data from storage
   */
  static deserializeGuild(data: any): Guild {
    const resources = new Map<string, number>();
    
    // Handle both Map and Object formats for resources
    if (data.treasury.resources instanceof Map) {
      data.treasury.resources.forEach((value: number, key: string) => {
        resources.set(key, value);
      });
    } else if (typeof data.treasury.resources === 'object') {
      Object.entries(data.treasury.resources).forEach(([key, value]) => {
        resources.set(key, value as number);
      });
    }

    return {
      ...data,
      treasury: {
        ...data.treasury,
        resources
      },
      createdAt: new Date(data.createdAt),
      lastActivity: new Date(data.lastActivity),
      members: data.members.map((member: any) => ({
        ...member,
        joinedAt: new Date(member.joinedAt),
        lastActive: new Date(member.lastActive)
      })),
      events: data.events.map((event: any) => ({
        ...event,
        startTime: new Date(event.startTime),
        endTime: new Date(event.endTime)
      }))
    };
  }
}