export interface ChatMessage {
  id: string;
  senderId: string;
  senderUsername: string;
  channelId: string;
  content: string;
  messageType: MessageType;
  timestamp: Date;
  editedAt?: Date;
  replyToId?: string;
  attachments?: MessageAttachment[];
  reactions?: MessageReaction[];
  isDeleted: boolean;
  moderationFlags?: ModerationFlag[];
}

export interface MessageAttachment {
  id: string;
  type: AttachmentType;
  url: string;
  filename: string;
  size: number;
  metadata?: Record<string, any>;
}

export interface MessageReaction {
  emoteId: string;
  emoteName: string;
  userIds: string[];
  count: number;
}

export interface ModerationFlag {
  type: ModerationFlagType;
  reason: string;
  moderatorId: string;
  timestamp: Date;
}

export enum MessageType {
  TEXT = 'text',
  EMOTE = 'emote',
  SYSTEM = 'system',
  COMMAND = 'command',
  TRADE_REQUEST = 'trade_request',
  PARTY_INVITE = 'party_invite',
  GUILD_ANNOUNCEMENT = 'guild_announcement'
}

export enum AttachmentType {
  IMAGE = 'image',
  FILE = 'file',
  LINK = 'link'
}

export enum ModerationFlagType {
  SPAM = 'spam',
  INAPPROPRIATE = 'inappropriate',
  HARASSMENT = 'harassment',
  ADVERTISING = 'advertising',
  OTHER = 'other'
}

export interface ChatChannel {
  id: string;
  name: string;
  type: ChannelType;
  description?: string;
  ownerId?: string;
  memberIds: string[];
  moderatorIds: string[];
  settings: ChannelSettings;
  createdAt: Date;
  lastActivity: Date;
  isActive: boolean;
}

export interface ChannelSettings {
  isPublic: boolean;
  allowGuests: boolean;
  maxMembers: number;
  slowModeDelay: number; // seconds between messages
  requireApproval: boolean;
  allowedMessageTypes: MessageType[];
  wordFilter: string[];
  autoModeration: boolean;
}

export enum ChannelType {
  GLOBAL = 'global',
  ZONE = 'zone',
  GUILD = 'guild',
  PARTY = 'party',
  PRIVATE = 'private',
  TRADE = 'trade',
  HELP = 'help',
  SYSTEM = 'system'
}

export interface ChatParticipant {
  userId: string;
  username: string;
  role: ParticipantRole;
  joinedAt: Date;
  lastSeen: Date;
  isMuted: boolean;
  muteExpiresAt?: Date;
  permissions: ChatPermission[];
}

export enum ParticipantRole {
  OWNER = 'owner',
  MODERATOR = 'moderator',
  MEMBER = 'member',
  GUEST = 'guest'
}

export enum ChatPermission {
  SEND_MESSAGES = 'send_messages',
  SEND_EMOTES = 'send_emotes',
  SEND_ATTACHMENTS = 'send_attachments',
  MENTION_USERS = 'mention_users',
  USE_COMMANDS = 'use_commands',
  MODERATE_MESSAGES = 'moderate_messages',
  KICK_MEMBERS = 'kick_members',
  BAN_MEMBERS = 'ban_members',
  MANAGE_CHANNEL = 'manage_channel'
}

export interface ChatCommand {
  name: string;
  description: string;
  usage: string;
  permissions: ChatPermission[];
  cooldown: number; // seconds
  handler: (context: CommandContext) => Promise<CommandResult>;
}

export interface CommandContext {
  message: ChatMessage;
  channel: ChatChannel;
  sender: ChatParticipant;
  args: string[];
  mentions: string[];
}

export interface CommandResult {
  success: boolean;
  response?: string;
  error?: string;
  action?: CommandAction;
}

export interface CommandAction {
  type: ActionType;
  targetUserId?: string;
  duration?: number;
  reason?: string;
}

export enum ActionType {
  MUTE = 'mute',
  KICK = 'kick',
  BAN = 'ban',
  DELETE_MESSAGE = 'delete_message',
  WARN = 'warn'
}

export interface Emote {
  id: string;
  name: string;
  imageUrl: string;
  category: EmoteCategory;
  isAnimated: boolean;
  isCustom: boolean;
  guildId?: string;
  createdBy?: string;
  usageCount: number;
}

export enum EmoteCategory {
  BASIC = 'basic',
  REACTION = 'reaction',
  CUSTOM = 'custom',
  PREMIUM = 'premium',
  SEASONAL = 'seasonal'
}

export interface ChatFilter {
  id: string;
  name: string;
  type: FilterType;
  pattern: string;
  action: FilterAction;
  isActive: boolean;
  severity: FilterSeverity;
}

export enum FilterType {
  WORD_BLACKLIST = 'word_blacklist',
  REGEX_PATTERN = 'regex_pattern',
  SPAM_DETECTION = 'spam_detection',
  LINK_FILTER = 'link_filter',
  CAPS_FILTER = 'caps_filter'
}

export enum FilterAction {
  WARN = 'warn',
  DELETE = 'delete',
  MUTE = 'mute',
  KICK = 'kick',
  BAN = 'ban'
}

export enum FilterSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

export interface ChatNotification {
  id: string;
  userId: string;
  type: NotificationType;
  channelId: string;
  messageId?: string;
  title: string;
  content: string;
  timestamp: Date;
  isRead: boolean;
  expiresAt?: Date;
}

export enum NotificationType {
  MENTION = 'mention',
  DIRECT_MESSAGE = 'direct_message',
  CHANNEL_INVITE = 'channel_invite',
  MODERATION_ACTION = 'moderation_action',
  SYSTEM_ANNOUNCEMENT = 'system_announcement'
}

export interface ChatStatistics {
  totalMessages: number;
  activeUsers: number;
  channelsCount: number;
  messagesPerHour: number;
  topChannels: Array<{
    channelId: string;
    channelName: string;
    messageCount: number;
  }>;
  topUsers: Array<{
    userId: string;
    username: string;
    messageCount: number;
  }>;
  moderationActions: Array<{
    action: ActionType;
    count: number;
  }>;
}

export interface ChatValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export class ChatValidator {
  private static readonly MAX_MESSAGE_LENGTH = 2000;
  private static readonly MAX_CHANNEL_NAME_LENGTH = 50;
  private static readonly MIN_CHANNEL_NAME_LENGTH = 3;
  private static readonly MAX_EMOTE_NAME_LENGTH = 32;

  /**
   * Validate a chat message
   */
  static validateMessage(message: Partial<ChatMessage>): ChatValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate required fields
    if (!message.senderId || typeof message.senderId !== 'string') {
      errors.push('Sender ID is required and must be a string');
    }

    if (!message.channelId || typeof message.channelId !== 'string') {
      errors.push('Channel ID is required and must be a string');
    }

    if (!message.content || typeof message.content !== 'string') {
      errors.push('Message content is required and must be a string');
    }

    // Validate message content
    if (message.content !== undefined) {
      if (message.content.length === 0) {
        errors.push('Message content cannot be empty');
      }

      if (message.content.length > this.MAX_MESSAGE_LENGTH) {
        errors.push(`Message content cannot exceed ${this.MAX_MESSAGE_LENGTH} characters`);
      }

      // Check for excessive whitespace
      if (message.content.trim().length === 0) {
        errors.push('Message cannot contain only whitespace');
      }

      // Check for excessive caps
      const capsRatio = (message.content.match(/[A-Z]/g) || []).length / message.content.length;
      if (capsRatio > 0.7 && message.content.length > 10) {
        warnings.push('Message contains excessive capital letters');
      }
    }

    // Validate message type
    if (message.messageType && !Object.values(MessageType).includes(message.messageType)) {
      errors.push('Invalid message type');
    }

    // Validate timestamps
    if (message.timestamp && !(message.timestamp instanceof Date)) {
      errors.push('Timestamp must be a valid Date object');
    }

    if (message.editedAt && !(message.editedAt instanceof Date)) {
      errors.push('Edited timestamp must be a valid Date object');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Validate a chat channel
   */
  static validateChannel(channel: Partial<ChatChannel>): ChatValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate required fields
    if (!channel.name || typeof channel.name !== 'string') {
      errors.push('Channel name is required and must be a string');
    }

    if (!channel.type || !Object.values(ChannelType).includes(channel.type)) {
      errors.push('Valid channel type is required');
    }

    // Validate channel name
    if (channel.name) {
      if (channel.name.length < this.MIN_CHANNEL_NAME_LENGTH) {
        errors.push(`Channel name must be at least ${this.MIN_CHANNEL_NAME_LENGTH} characters`);
      }

      if (channel.name.length > this.MAX_CHANNEL_NAME_LENGTH) {
        errors.push(`Channel name cannot exceed ${this.MAX_CHANNEL_NAME_LENGTH} characters`);
      }

      // Check for valid characters
      if (!/^[a-zA-Z0-9\-_\s]+$/.test(channel.name)) {
        errors.push('Channel name can only contain letters, numbers, hyphens, underscores, and spaces');
      }
    }

    // Validate member arrays
    if (channel.memberIds && !Array.isArray(channel.memberIds)) {
      errors.push('Member IDs must be an array');
    }

    if (channel.moderatorIds && !Array.isArray(channel.moderatorIds)) {
      errors.push('Moderator IDs must be an array');
    }

    // Validate settings
    if (channel.settings) {
      if (typeof channel.settings.maxMembers === 'number' && channel.settings.maxMembers < 1) {
        errors.push('Max members must be at least 1');
      }

      if (typeof channel.settings.slowModeDelay === 'number' && channel.settings.slowModeDelay < 0) {
        errors.push('Slow mode delay cannot be negative');
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Validate an emote
   */
  static validateEmote(emote: Partial<Emote>): ChatValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate required fields
    if (!emote.name || typeof emote.name !== 'string') {
      errors.push('Emote name is required and must be a string');
    }

    if (!emote.imageUrl || typeof emote.imageUrl !== 'string') {
      errors.push('Emote image URL is required and must be a string');
    }

    // Validate emote name
    if (emote.name) {
      if (emote.name.length > this.MAX_EMOTE_NAME_LENGTH) {
        errors.push(`Emote name cannot exceed ${this.MAX_EMOTE_NAME_LENGTH} characters`);
      }

      // Check for valid characters (alphanumeric and underscores only)
      if (!/^[a-zA-Z0-9_]+$/.test(emote.name)) {
        errors.push('Emote name can only contain letters, numbers, and underscores');
      }
    }

    // Validate category
    if (emote.category && !Object.values(EmoteCategory).includes(emote.category)) {
      errors.push('Invalid emote category');
    }

    // Validate image URL
    if (emote.imageUrl) {
      try {
        new URL(emote.imageUrl);
      } catch {
        errors.push('Invalid image URL format');
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Check if a message contains spam patterns
   */
  static detectSpam(message: string, previousMessages: string[] = []): boolean {
    // Check for repeated characters
    if (/(.)\1{10,}/.test(message)) {
      return true;
    }

    // Check for excessive repetition
    const words = message.toLowerCase().split(/\s+/);
    const wordCount = new Map<string, number>();
    
    for (const word of words) {
      wordCount.set(word, (wordCount.get(word) || 0) + 1);
    }

    // If any word appears more than 5 times, consider it spam
    for (const count of wordCount.values()) {
      if (count > 5) {
        return true;
      }
    }

    // Check for duplicate messages in recent history
    const duplicateCount = previousMessages.filter(prev => 
      prev.toLowerCase() === message.toLowerCase()
    ).length;

    if (duplicateCount >= 3) {
      return true;
    }

    return false;
  }

  /**
   * Extract mentions from a message
   */
  static extractMentions(content: string): string[] {
    const mentionRegex = /@(\w+)/g;
    const mentions: string[] = [];
    let match;

    while ((match = mentionRegex.exec(content)) !== null) {
      if (match[1]) {
        mentions.push(match[1]);
      }
    }

    return mentions;
  }

  /**
   * Extract emotes from a message
   */
  static extractEmotes(content: string): string[] {
    const emoteRegex = /:(\w+):/g;
    const emotes: string[] = [];
    let match;

    while ((match = emoteRegex.exec(content)) !== null) {
      if (match[1]) {
        emotes.push(match[1]);
      }
    }

    return emotes;
  }
}