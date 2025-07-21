import {
  ChatMessage,
  ChatChannel,
  ChatParticipant,
  ChatCommand,
  CommandContext,
  CommandResult,
  Emote,
  ChatFilter,
  ChatNotification,
  ChatStatistics,
  MessageType,
  ChannelType,
  ParticipantRole,
  ChatPermission,
  FilterAction,
  NotificationType,
  ChatValidator,
  EmoteCategory,
  FilterType,
  FilterSeverity
} from '../models/Chat';
import { PlayerRepository } from '../repositories/PlayerRepository';

export interface ChatService {
  // Message operations
  sendMessage(senderId: string, channelId: string, content: string, messageType?: MessageType): Promise<ChatMessage>;
  editMessage(messageId: string, userId: string, newContent: string): Promise<ChatMessage>;
  deleteMessage(messageId: string, userId: string): Promise<boolean>;
  getChannelMessages(channelId: string, limit?: number, before?: Date): Promise<ChatMessage[]>;
  
  // Channel operations
  createChannel(ownerId: string, name: string, type: ChannelType, settings?: Partial<ChatChannel['settings']>): Promise<ChatChannel>;
  joinChannel(userId: string, channelId: string): Promise<boolean>;
  leaveChannel(userId: string, channelId: string): Promise<boolean>;
  getPlayerChannels(userId: string): Promise<ChatChannel[]>;
  getChannelParticipants(channelId: string): Promise<ChatParticipant[]>;
  
  // Moderation operations
  muteUser(channelId: string, moderatorId: string, targetUserId: string, duration: number, reason?: string): Promise<boolean>;
  kickUser(channelId: string, moderatorId: string, targetUserId: string, reason?: string): Promise<boolean>;
  banUser(channelId: string, moderatorId: string, targetUserId: string, reason?: string): Promise<boolean>;
  
  // Command system
  registerCommand(command: ChatCommand): void;
  executeCommand(context: CommandContext): Promise<CommandResult>;
  
  // Emote system
  addEmote(emote: Omit<Emote, 'id' | 'usageCount'>): Promise<Emote>;
  getEmotes(category?: string): Promise<Emote[]>;
  useEmote(emoteId: string): Promise<void>;
  
  // Filtering and moderation
  addFilter(filter: Omit<ChatFilter, 'id'>): Promise<ChatFilter>;
  checkMessageAgainstFilters(message: ChatMessage): Promise<FilterAction | null>;
  
  // Notifications
  sendNotification(notification: Omit<ChatNotification, 'id' | 'timestamp'>): Promise<void>;
  getNotifications(userId: string, unreadOnly?: boolean): Promise<ChatNotification[]>;
  markNotificationRead(notificationId: string, userId: string): Promise<boolean>;
  
  // Statistics
  getChannelStatistics(channelId: string): Promise<ChatStatistics>;
  getGlobalStatistics(): Promise<ChatStatistics>;
}

export interface ChatEventHandler {
  onMessageSent(message: ChatMessage): void;
  onMessageEdited(message: ChatMessage): void;
  onMessageDeleted(messageId: string, channelId: string): void;
  onUserJoinedChannel(userId: string, channelId: string): void;
  onUserLeftChannel(userId: string, channelId: string): void;
  onUserMuted(userId: string, channelId: string, duration: number): void;
  onChannelCreated(channel: ChatChannel): void;
}

export class ChatServiceImpl implements ChatService {
  private playerRepository: PlayerRepository;
  private channels: Map<string, ChatChannel> = new Map();
  private messages: Map<string, ChatMessage[]> = new Map();
  private participants: Map<string, ChatParticipant[]> = new Map();
  private commands: Map<string, ChatCommand> = new Map();
  private emotes: Map<string, Emote> = new Map();
  private filters: ChatFilter[] = [];
  private notifications: Map<string, ChatNotification[]> = new Map();
  private eventHandlers: ChatEventHandler[] = [];
  private userCooldowns: Map<string, Map<string, Date>> = new Map();
  private messageHistory: Map<string, string[]> = new Map();

  private readonly DEFAULT_MESSAGE_LIMIT = 50;
  private readonly MAX_MESSAGE_HISTORY = 10;
  private readonly GLOBAL_CHANNEL_ID = 'global';
  private readonly SYSTEM_USER_ID = 'system';

  constructor(playerRepository: PlayerRepository) {
    this.playerRepository = playerRepository;
    this.initializeDefaultChannels();
    this.initializeDefaultCommands();
    this.initializeDefaultEmotes();
    this.initializeDefaultFilters();
  }

  async sendMessage(
    senderId: string, 
    channelId: string, 
    content: string, 
    messageType: MessageType = MessageType.TEXT
  ): Promise<ChatMessage> {
    // Validate input
    const validation = ChatValidator.validateMessage({
      senderId,
      channelId,
      content,
      messageType
    });

    if (!validation.isValid) {
      throw new Error(`Invalid message: ${validation.errors.join(', ')}`);
    }

    // Check if channel exists
    const channel = this.channels.get(channelId);
    if (!channel) {
      throw new Error('Channel not found');
    }

    // Check if user is in channel
    const participants = this.participants.get(channelId) || [];
    const participant = participants.find(p => p.userId === senderId);
    if (!participant) {
      throw new Error('User is not a member of this channel');
    }

    // Check if user is muted
    if (participant.isMuted && participant.muteExpiresAt && participant.muteExpiresAt > new Date()) {
      throw new Error('User is muted in this channel');
    }

    // Check permissions
    if (!participant.permissions.includes(ChatPermission.SEND_MESSAGES)) {
      throw new Error('User does not have permission to send messages');
    }

    // Check slow mode
    if (channel.settings.slowModeDelay > 0) {
      const lastMessageTime = this.getLastMessageTime(senderId, channelId);
      const timeSinceLastMessage = Date.now() - (lastMessageTime?.getTime() || 0);
      
      if (timeSinceLastMessage < channel.settings.slowModeDelay * 1000) {
        const remainingTime = Math.ceil((channel.settings.slowModeDelay * 1000 - timeSinceLastMessage) / 1000);
        throw new Error(`Slow mode active. Please wait ${remainingTime} seconds before sending another message`);
      }
    }

    // Get sender info
    const sender = await this.playerRepository.findById(senderId);
    if (!sender) {
      throw new Error('Sender not found');
    }

    // Create message
    const message: ChatMessage = {
      id: this.generateId(),
      senderId,
      senderUsername: sender.username,
      channelId,
      content,
      messageType,
      timestamp: new Date(),
      isDeleted: false,
      reactions: []
    };

    // Check against filters
    const filterAction = await this.checkMessageAgainstFilters(message);
    if (filterAction) {
      await this.handleFilterAction(message, filterAction, participant);
      
      if (filterAction === FilterAction.DELETE) {
        throw new Error('Message blocked by content filter');
      }
    }

    // Store message
    if (!this.messages.has(channelId)) {
      this.messages.set(channelId, []);
    }
    
    const channelMessages = this.messages.get(channelId)!;
    channelMessages.push(message);
    
    // Keep only recent messages in memory
    if (channelMessages.length > 1000) {
      channelMessages.splice(0, channelMessages.length - 1000);
    }

    // Update message history for spam detection
    this.updateMessageHistory(senderId, content);

    // Update channel activity
    channel.lastActivity = new Date();

    // Handle mentions
    const mentions = ChatValidator.extractMentions(content);
    for (const mentionedUsername of mentions) {
      await this.handleMention(message, mentionedUsername);
    }

    // Notify event handlers
    this.eventHandlers.forEach(handler => handler.onMessageSent(message));

    return message;
  }

  async editMessage(messageId: string, userId: string, newContent: string): Promise<ChatMessage> {
    // Find the message
    let foundMessage: ChatMessage | undefined;
    let channelId: string | undefined;

    for (const [cId, messages] of this.messages.entries()) {
      const message = messages.find(m => m.id === messageId);
      if (message) {
        foundMessage = message;
        channelId = cId;
        break;
      }
    }

    if (!foundMessage || !channelId) {
      throw new Error('Message not found');
    }

    // Check if user can edit this message
    if (foundMessage.senderId !== userId) {
      // Check if user is a moderator
      const participants = this.participants.get(channelId) || [];
      const participant = participants.find(p => p.userId === userId);
      
      if (!participant || !participant.permissions.includes(ChatPermission.MODERATE_MESSAGES)) {
        throw new Error('You can only edit your own messages');
      }
    }

    // Validate new content
    const validation = ChatValidator.validateMessage({
      ...foundMessage,
      content: newContent
    });

    if (!validation.isValid) {
      throw new Error(`Invalid message content: ${validation.errors.join(', ')}`);
    }

    // Update message
    foundMessage.content = newContent;
    foundMessage.editedAt = new Date();

    // Notify event handlers
    this.eventHandlers.forEach(handler => handler.onMessageEdited(foundMessage!));

    return foundMessage;
  }

  async deleteMessage(messageId: string, userId: string): Promise<boolean> {
    // Find the message
    let foundMessage: ChatMessage | undefined;
    let channelId: string | undefined;

    for (const [cId, messages] of this.messages.entries()) {
      const message = messages.find(m => m.id === messageId);
      if (message) {
        foundMessage = message;
        channelId = cId;
        break;
      }
    }

    if (!foundMessage || !channelId) {
      return false;
    }

    // Check if user can delete this message
    if (foundMessage.senderId !== userId) {
      // Check if user is a moderator
      const participants = this.participants.get(channelId) || [];
      const participant = participants.find(p => p.userId === userId);
      
      if (!participant || !participant.permissions.includes(ChatPermission.MODERATE_MESSAGES)) {
        throw new Error('You can only delete your own messages');
      }
    }

    // Mark as deleted
    foundMessage.isDeleted = true;

    // Notify event handlers
    this.eventHandlers.forEach(handler => handler.onMessageDeleted(messageId, channelId!));

    return true;
  }

  async getChannelMessages(channelId: string, limit: number = this.DEFAULT_MESSAGE_LIMIT, before?: Date): Promise<ChatMessage[]> {
    const messages = this.messages.get(channelId) || [];
    
    let filteredMessages = messages.filter(m => !m.isDeleted);
    
    if (before) {
      filteredMessages = filteredMessages.filter(m => m.timestamp < before);
    }
    
    // Sort by timestamp (newest first) and limit
    return filteredMessages
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
  }

  async createChannel(
    ownerId: string, 
    name: string, 
    type: ChannelType, 
    settings?: Partial<ChatChannel['settings']>
  ): Promise<ChatChannel> {
    // Validate input
    const validation = ChatValidator.validateChannel({
      name,
      type,
      settings: settings as any
    });

    if (!validation.isValid) {
      throw new Error(`Invalid channel: ${validation.errors.join(', ')}`);
    }

    // Check if owner exists
    const owner = await this.playerRepository.findById(ownerId);
    if (!owner) {
      throw new Error('Owner not found');
    }

    // Create channel
    const channel: ChatChannel = {
      id: this.generateId(),
      name,
      type,
      ownerId,
      memberIds: [ownerId],
      moderatorIds: [ownerId],
      settings: {
        isPublic: true,
        allowGuests: false,
        maxMembers: 100,
        slowModeDelay: 0,
        requireApproval: false,
        allowedMessageTypes: [MessageType.TEXT, MessageType.EMOTE],
        wordFilter: [],
        autoModeration: true,
        ...(settings || {})
      },
      createdAt: new Date(),
      lastActivity: new Date(),
      isActive: true
    };

    // Store channel
    this.channels.set(channel.id, channel);

    // Add owner as participant
    const ownerParticipant: ChatParticipant = {
      userId: ownerId,
      username: owner.username,
      role: ParticipantRole.OWNER,
      joinedAt: new Date(),
      lastSeen: new Date(),
      isMuted: false,
      permissions: Object.values(ChatPermission)
    };

    this.participants.set(channel.id, [ownerParticipant]);
    this.messages.set(channel.id, []);

    // Notify event handlers
    this.eventHandlers.forEach(handler => handler.onChannelCreated(channel));

    return channel;
  }

  async joinChannel(userId: string, channelId: string): Promise<boolean> {
    const channel = this.channels.get(channelId);
    if (!channel) {
      throw new Error('Channel not found');
    }

    // Check if user already in channel
    if (channel.memberIds.includes(userId)) {
      return true;
    }

    // Check if channel is public or user has permission
    if (!channel.settings.isPublic && channel.settings.requireApproval) {
      throw new Error('Channel requires approval to join');
    }

    // Check member limit
    if (channel.memberIds.length >= channel.settings.maxMembers) {
      throw new Error('Channel is full');
    }

    // Get user info
    const user = await this.playerRepository.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    // Add user to channel
    channel.memberIds.push(userId);

    // Add as participant
    const participant: ChatParticipant = {
      userId,
      username: user.username,
      role: ParticipantRole.MEMBER,
      joinedAt: new Date(),
      lastSeen: new Date(),
      isMuted: false,
      permissions: [
        ChatPermission.SEND_MESSAGES,
        ChatPermission.SEND_EMOTES,
        ChatPermission.MENTION_USERS
      ]
    };

    const participants = this.participants.get(channelId) || [];
    participants.push(participant);
    this.participants.set(channelId, participants);

    // Notify event handlers
    this.eventHandlers.forEach(handler => handler.onUserJoinedChannel(userId, channelId));

    return true;
  }

  async leaveChannel(userId: string, channelId: string): Promise<boolean> {
    const channel = this.channels.get(channelId);
    if (!channel) {
      return false;
    }

    // Remove from member list
    const memberIndex = channel.memberIds.indexOf(userId);
    if (memberIndex === -1) {
      return false;
    }

    channel.memberIds.splice(memberIndex, 1);

    // Remove from moderator list if present
    const modIndex = channel.moderatorIds.indexOf(userId);
    if (modIndex !== -1) {
      channel.moderatorIds.splice(modIndex, 1);
    }

    // Remove from participants
    const participants = this.participants.get(channelId) || [];
    const participantIndex = participants.findIndex(p => p.userId === userId);
    if (participantIndex !== -1) {
      participants.splice(participantIndex, 1);
      this.participants.set(channelId, participants);
    }

    // If owner left and there are other members, transfer ownership
    if (channel.ownerId === userId && channel.memberIds.length > 0) {
      const newOwnerId = channel.moderatorIds[0] || channel.memberIds[0];
      if (newOwnerId) {
        channel.ownerId = newOwnerId;
        
        if (!channel.moderatorIds.includes(newOwnerId)) {
          channel.moderatorIds.push(newOwnerId);
        }
      }

      // Update new owner's permissions
      const newOwner = participants.find(p => p.userId === newOwnerId);
      if (newOwner) {
        newOwner.role = ParticipantRole.OWNER;
        newOwner.permissions = Object.values(ChatPermission);
      }
    }

    // If no members left, deactivate channel
    if (channel.memberIds.length === 0) {
      channel.isActive = false;
    }

    // Notify event handlers
    this.eventHandlers.forEach(handler => handler.onUserLeftChannel(userId, channelId));

    return true;
  }

  async getPlayerChannels(userId: string): Promise<ChatChannel[]> {
    const userChannels: ChatChannel[] = [];
    
    for (const channel of this.channels.values()) {
      if (channel.memberIds.includes(userId) && channel.isActive) {
        userChannels.push(channel);
      }
    }

    return userChannels.sort((a, b) => b.lastActivity.getTime() - a.lastActivity.getTime());
  }

  async getChannelParticipants(channelId: string): Promise<ChatParticipant[]> {
    return this.participants.get(channelId) || [];
  }

  async muteUser(
    channelId: string, 
    moderatorId: string, 
    targetUserId: string, 
    duration: number, 
    reason?: string
  ): Promise<boolean> {
    const channel = this.channels.get(channelId);
    if (!channel) {
      throw new Error('Channel not found');
    }

    // Check moderator permissions
    const participants = this.participants.get(channelId) || [];
    const moderator = participants.find(p => p.userId === moderatorId);
    
    if (!moderator || !moderator.permissions.includes(ChatPermission.MODERATE_MESSAGES)) {
      throw new Error('Insufficient permissions');
    }

    // Find target user
    const target = participants.find(p => p.userId === targetUserId);
    if (!target) {
      throw new Error('Target user not found in channel');
    }

    // Cannot mute owner or other moderators (unless you're the owner)
    if (target.role === ParticipantRole.OWNER || 
        (target.role === ParticipantRole.MODERATOR && moderator.role !== ParticipantRole.OWNER)) {
      throw new Error('Cannot mute this user');
    }

    // Apply mute
    target.isMuted = true;
    target.muteExpiresAt = new Date(Date.now() + duration * 1000);

    // Send system message
    await this.sendSystemMessage(channelId, `${target.username} has been muted for ${duration} seconds. Reason: ${reason || 'No reason provided'}`);

    // Notify event handlers
    this.eventHandlers.forEach(handler => handler.onUserMuted(targetUserId, channelId, duration));

    return true;
  }

  async kickUser(channelId: string, moderatorId: string, targetUserId: string, reason?: string): Promise<boolean> {
    const channel = this.channels.get(channelId);
    if (!channel) {
      throw new Error('Channel not found');
    }

    // Check moderator permissions
    const participants = this.participants.get(channelId) || [];
    const moderator = participants.find(p => p.userId === moderatorId);
    
    if (!moderator || !moderator.permissions.includes(ChatPermission.KICK_MEMBERS)) {
      throw new Error('Insufficient permissions');
    }

    // Find target user
    const target = participants.find(p => p.userId === targetUserId);
    if (!target) {
      throw new Error('Target user not found in channel');
    }

    // Cannot kick owner or other moderators (unless you're the owner)
    if (target.role === ParticipantRole.OWNER || 
        (target.role === ParticipantRole.MODERATOR && moderator.role !== ParticipantRole.OWNER)) {
      throw new Error('Cannot kick this user');
    }

    // Send system message before kicking
    await this.sendSystemMessage(channelId, `${target.username} has been kicked from the channel. Reason: ${reason || 'No reason provided'}`);

    // Remove user from channel
    await this.leaveChannel(targetUserId, channelId);

    return true;
  }

  async banUser(channelId: string, moderatorId: string, targetUserId: string, reason?: string): Promise<boolean> {
    // For now, ban is the same as kick but we could add a ban list later
    return this.kickUser(channelId, moderatorId, targetUserId, reason);
  }

  registerCommand(command: ChatCommand): void {
    this.commands.set(command.name.toLowerCase(), command);
  }

  async executeCommand(context: CommandContext): Promise<CommandResult> {
    const commandName = context.args[0]?.toLowerCase();
    if (!commandName) {
      return { success: false, error: 'No command specified' };
    }

    const command = this.commands.get(commandName);
    if (!command) {
      return { success: false, error: 'Unknown command' };
    }

    // Check permissions
    const hasPermission = command.permissions.every(perm => 
      context.sender.permissions.includes(perm)
    );

    if (!hasPermission) {
      return { success: false, error: 'Insufficient permissions' };
    }

    // Check cooldown
    const cooldownKey = `${context.sender.userId}:${commandName}`;
    const userCooldowns = this.userCooldowns.get(context.sender.userId) || new Map();
    const lastUsed = userCooldowns.get(commandName);
    
    if (lastUsed && Date.now() - lastUsed.getTime() < command.cooldown * 1000) {
      const remainingTime = Math.ceil((command.cooldown * 1000 - (Date.now() - lastUsed.getTime())) / 1000);
      return { success: false, error: `Command on cooldown. Wait ${remainingTime} seconds.` };
    }

    // Execute command
    try {
      const result = await command.handler(context);
      
      // Update cooldown
      userCooldowns.set(commandName, new Date());
      this.userCooldowns.set(context.sender.userId, userCooldowns);
      
      return result;
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Command execution failed' 
      };
    }
  }

  async addEmote(emote: Omit<Emote, 'id' | 'usageCount'>): Promise<Emote> {
    const validation = ChatValidator.validateEmote(emote);
    if (!validation.isValid) {
      throw new Error(`Invalid emote: ${validation.errors.join(', ')}`);
    }

    const newEmote: Emote = {
      ...emote,
      id: this.generateId(),
      usageCount: 0
    };

    this.emotes.set(newEmote.id, newEmote);
    return newEmote;
  }

  async getEmotes(category?: string): Promise<Emote[]> {
    const allEmotes = Array.from(this.emotes.values());
    
    if (category) {
      return allEmotes.filter(emote => emote.category === category);
    }
    
    return allEmotes;
  }

  async useEmote(emoteId: string): Promise<void> {
    const emote = this.emotes.get(emoteId);
    if (emote) {
      emote.usageCount++;
    }
  }

  async addFilter(filter: Omit<ChatFilter, 'id'>): Promise<ChatFilter> {
    const newFilter: ChatFilter = {
      ...filter,
      id: this.generateId()
    };

    this.filters.push(newFilter);
    return newFilter;
  }

  async checkMessageAgainstFilters(message: ChatMessage): Promise<FilterAction | null> {
    for (const filter of this.filters) {
      if (!filter.isActive) continue;

      let matches = false;

      switch (filter.type) {
        case 'word_blacklist':
          matches = this.checkWordBlacklist(message.content, filter.pattern);
          break;
        case 'regex_pattern':
          matches = new RegExp(filter.pattern, 'i').test(message.content);
          break;
        case 'spam_detection':
          const history = this.messageHistory.get(message.senderId) || [];
          matches = ChatValidator.detectSpam(message.content, history);
          break;
        case 'caps_filter':
          const capsRatio = (message.content.match(/[A-Z]/g) || []).length / message.content.length;
          matches = capsRatio > 0.7 && message.content.length > 10;
          break;
        case 'link_filter':
          matches = /https?:\/\/[^\s]+/.test(message.content);
          break;
      }

      if (matches) {
        return filter.action;
      }
    }

    return null;
  }

  async sendNotification(notification: Omit<ChatNotification, 'id' | 'timestamp'>): Promise<void> {
    const newNotification: ChatNotification = {
      ...notification,
      id: this.generateId(),
      timestamp: new Date()
    };

    if (!this.notifications.has(notification.userId)) {
      this.notifications.set(notification.userId, []);
    }

    const userNotifications = this.notifications.get(notification.userId)!;
    userNotifications.push(newNotification);

    // Keep only recent notifications
    if (userNotifications.length > 100) {
      userNotifications.splice(0, userNotifications.length - 100);
    }
  }

  async getNotifications(userId: string, unreadOnly: boolean = false): Promise<ChatNotification[]> {
    const userNotifications = this.notifications.get(userId) || [];
    
    if (unreadOnly) {
      return userNotifications.filter(n => !n.isRead);
    }
    
    return userNotifications;
  }

  async markNotificationRead(notificationId: string, userId: string): Promise<boolean> {
    const userNotifications = this.notifications.get(userId) || [];
    const notification = userNotifications.find(n => n.id === notificationId);
    
    if (notification) {
      notification.isRead = true;
      return true;
    }
    
    return false;
  }

  async getChannelStatistics(channelId: string): Promise<ChatStatistics> {
    const messages = this.messages.get(channelId) || [];
    const participants = this.participants.get(channelId) || [];
    
    // Calculate messages per hour (last 24 hours)
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentMessages = messages.filter(m => m.timestamp > oneDayAgo);
    const messagesPerHour = recentMessages.length / 24;

    // Top users in this channel
    const userMessageCounts = new Map<string, number>();
    messages.forEach(message => {
      const count = userMessageCounts.get(message.senderId) || 0;
      userMessageCounts.set(message.senderId, count + 1);
    });

    const topUsers = Array.from(userMessageCounts.entries())
      .map(([userId, count]) => {
        const participant = participants.find(p => p.userId === userId);
        return {
          userId,
          username: participant?.username || 'Unknown',
          messageCount: count
        };
      })
      .sort((a, b) => b.messageCount - a.messageCount)
      .slice(0, 10);

    return {
      totalMessages: messages.length,
      activeUsers: participants.length,
      channelsCount: 1,
      messagesPerHour,
      topChannels: [{
        channelId,
        channelName: this.channels.get(channelId)?.name || 'Unknown',
        messageCount: messages.length
      }],
      topUsers,
      moderationActions: []
    };
  }

  async getGlobalStatistics(): Promise<ChatStatistics> {
    let totalMessages = 0;
    let totalUsers = new Set<string>();
    const channelStats: Array<{ channelId: string; channelName: string; messageCount: number }> = [];
    const userMessageCounts = new Map<string, number>();

    // Aggregate stats from all channels
    for (const [channelId, messages] of this.messages.entries()) {
      const channel = this.channels.get(channelId);
      if (!channel) continue;

      totalMessages += messages.length;
      channelStats.push({
        channelId,
        channelName: channel.name,
        messageCount: messages.length
      });

      // Count unique users and their message counts
      messages.forEach(message => {
        totalUsers.add(message.senderId);
        const count = userMessageCounts.get(message.senderId) || 0;
        userMessageCounts.set(message.senderId, count + 1);
      });
    }

    // Calculate messages per hour (last 24 hours)
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    let recentMessageCount = 0;
    
    for (const messages of this.messages.values()) {
      recentMessageCount += messages.filter(m => m.timestamp > oneDayAgo).length;
    }
    
    const messagesPerHour = recentMessageCount / 24;

    // Top channels
    const topChannels = channelStats
      .sort((a, b) => b.messageCount - a.messageCount)
      .slice(0, 10);

    // Top users
    const topUsers = Array.from(userMessageCounts.entries())
      .map(([userId, count]) => ({
        userId,
        username: 'Unknown', // Would need to fetch from player repository
        messageCount: count
      }))
      .sort((a, b) => b.messageCount - a.messageCount)
      .slice(0, 10);

    return {
      totalMessages,
      activeUsers: totalUsers.size,
      channelsCount: this.channels.size,
      messagesPerHour,
      topChannels,
      topUsers,
      moderationActions: []
    };
  }

  // Event handler management
  addEventHandler(handler: ChatEventHandler): void {
    this.eventHandlers.push(handler);
  }

  removeEventHandler(handler: ChatEventHandler): void {
    const index = this.eventHandlers.indexOf(handler);
    if (index !== -1) {
      this.eventHandlers.splice(index, 1);
    }
  }

  // Private helper methods
  private initializeDefaultChannels(): void {
    // Create global channel
    const globalChannel: ChatChannel = {
      id: this.GLOBAL_CHANNEL_ID,
      name: 'Global',
      type: ChannelType.GLOBAL,
      memberIds: [],
      moderatorIds: [],
      settings: {
        isPublic: true,
        allowGuests: true,
        maxMembers: 10000,
        slowModeDelay: 3,
        requireApproval: false,
        allowedMessageTypes: [MessageType.TEXT, MessageType.EMOTE],
        wordFilter: [],
        autoModeration: true
      },
      createdAt: new Date(),
      lastActivity: new Date(),
      isActive: true
    };

    this.channels.set(this.GLOBAL_CHANNEL_ID, globalChannel);
    this.participants.set(this.GLOBAL_CHANNEL_ID, []);
    this.messages.set(this.GLOBAL_CHANNEL_ID, []);
  }

  private initializeDefaultCommands(): void {
    // Help command
    this.registerCommand({
      name: 'help',
      description: 'Show available commands',
      usage: '/help [command]',
      permissions: [],
      cooldown: 5,
      handler: async (context) => {
        if (context.args.length > 1 && context.args[1]) {
          const commandName = context.args[1].toLowerCase();
          const command = this.commands.get(commandName);
          
          if (command) {
            return {
              success: true,
              response: `**${command.name}**: ${command.description}\nUsage: ${command.usage}`
            };
          } else {
            return { success: false, error: 'Command not found' };
          }
        }

        const availableCommands = Array.from(this.commands.values())
          .filter(cmd => cmd.permissions.every(perm => context.sender.permissions.includes(perm)))
          .map(cmd => `/${cmd.name}`)
          .join(', ');

        return {
          success: true,
          response: `Available commands: ${availableCommands}`
        };
      }
    });

    // Mute command
    this.registerCommand({
      name: 'mute',
      description: 'Mute a user in the channel',
      usage: '/mute <username> <duration> [reason]',
      permissions: [ChatPermission.MODERATE_MESSAGES],
      cooldown: 1,
      handler: async (context) => {
        if (context.args.length < 3) {
          return { success: false, error: 'Usage: /mute <username> <duration> [reason]' };
        }

        const username = context.args[1];
        const duration = parseInt(context.args[2] || '0');
        const reason = context.args.slice(3).join(' ');

        if (isNaN(duration) || duration <= 0) {
          return { success: false, error: 'Duration must be a positive number (seconds)' };
        }

        // Find target user
        const participants = await this.getChannelParticipants(context.channel.id);
        const target = participants.find(p => p.username.toLowerCase() === username?.toLowerCase());

        if (!target) {
          return { success: false, error: 'User not found in channel' };
        }

        try {
          await this.muteUser(context.channel.id, context.sender.userId, target.userId, duration, reason);
          return { success: true, response: `${username} has been muted for ${duration} seconds` };
        } catch (error) {
          return { success: false, error: error instanceof Error ? error.message : 'Failed to mute user' };
        }
      }
    });
  }

  private initializeDefaultEmotes(): void {
    const defaultEmotes = [
      { name: 'smile', imageUrl: 'https://example.com/emotes/smile.png', category: 'basic', isAnimated: false, isCustom: false },
      { name: 'laugh', imageUrl: 'https://example.com/emotes/laugh.png', category: EmoteCategory.BASIC, isAnimated: false, isCustom: false },
      { name: 'sad', imageUrl: 'https://example.com/emotes/sad.png', category: EmoteCategory.BASIC, isAnimated: false, isCustom: false },
      { name: 'angry', imageUrl: 'https://example.com/emotes/angry.png', category: EmoteCategory.BASIC, isAnimated: false, isCustom: false },
      { name: 'thumbsup', imageUrl: 'https://example.com/emotes/thumbsup.png', category: EmoteCategory.REACTION, isAnimated: false, isCustom: false },
      { name: 'thumbsdown', imageUrl: 'https://example.com/emotes/thumbsdown.png', category: EmoteCategory.REACTION, isAnimated: false, isCustom: false }
    ];

    defaultEmotes.forEach(async (emote) => {
      try {
        await this.addEmote(emote as Omit<Emote, 'id' | 'usageCount'>);
      } catch (error) {
        console.warn('Failed to add default emote:', emote.name, error);
      }
    });
  }

  private initializeDefaultFilters(): void {
    // Basic word filter
    this.addFilter({
      name: 'Profanity Filter',
      type: FilterType.WORD_BLACKLIST,
      pattern: 'badword1,badword2,badword3',
      action: FilterAction.DELETE,
      isActive: true,
      severity: FilterSeverity.MEDIUM
    });

    // Spam detection
    this.addFilter({
      name: 'Spam Detection',
      type: FilterType.SPAM_DETECTION,
      pattern: '',
      action: FilterAction.WARN,
      isActive: true,
      severity: FilterSeverity.LOW
    });

    // Caps filter
    this.addFilter({
      name: 'Excessive Caps',
      type: FilterType.CAPS_FILTER,
      pattern: '',
      action: FilterAction.WARN,
      isActive: true,
      severity: FilterSeverity.LOW
    });
  }

  private async sendSystemMessage(channelId: string, content: string): Promise<void> {
    const systemMessage: ChatMessage = {
      id: this.generateId(),
      senderId: this.SYSTEM_USER_ID,
      senderUsername: 'System',
      channelId,
      content,
      messageType: MessageType.SYSTEM,
      timestamp: new Date(),
      isDeleted: false,
      reactions: []
    };

    if (!this.messages.has(channelId)) {
      this.messages.set(channelId, []);
    }

    this.messages.get(channelId)!.push(systemMessage);
  }

  private async handleMention(message: ChatMessage, mentionedUsername: string): Promise<void> {
    // Find the mentioned user
    const participants = this.participants.get(message.channelId) || [];
    const mentionedUser = participants.find(p => 
      p.username.toLowerCase() === mentionedUsername.toLowerCase()
    );

    if (mentionedUser) {
      await this.sendNotification({
        userId: mentionedUser.userId,
        type: NotificationType.MENTION,
        channelId: message.channelId,
        messageId: message.id,
        title: 'You were mentioned',
        content: `${message.senderUsername} mentioned you in ${this.channels.get(message.channelId)?.name}`,
        isRead: false
      });
    }
  }

  private async handleFilterAction(message: ChatMessage, action: FilterAction, participant: ChatParticipant): Promise<void> {
    switch (action) {
      case FilterAction.WARN:
        await this.sendNotification({
          userId: message.senderId,
          type: NotificationType.MODERATION_ACTION,
          channelId: message.channelId,
          title: 'Message Warning',
          content: 'Your message was flagged by the content filter',
          isRead: false
        });
        break;

      case FilterAction.DELETE:
        // Message will be blocked from being sent
        break;

      case FilterAction.MUTE:
        participant.isMuted = true;
        participant.muteExpiresAt = new Date(Date.now() + 300000); // 5 minutes
        await this.sendSystemMessage(message.channelId, `${participant.username} has been automatically muted for 5 minutes due to content filter violation`);
        break;

      case FilterAction.KICK:
        await this.leaveChannel(message.senderId, message.channelId);
        break;

      case FilterAction.BAN:
        await this.leaveChannel(message.senderId, message.channelId);
        // Could add to ban list here
        break;
    }
  }

  private checkWordBlacklist(content: string, pattern: string): boolean {
    const blacklistedWords = pattern.split(',').map(word => word.trim().toLowerCase());
    const contentLower = content.toLowerCase();
    
    return blacklistedWords.some(word => contentLower.includes(word));
  }

  private getLastMessageTime(userId: string, channelId: string): Date | null {
    const messages = this.messages.get(channelId) || [];
    const userMessages = messages.filter(m => m.senderId === userId);
    
    if (userMessages.length === 0) {
      return null;
    }
    
    return userMessages[userMessages.length - 1]?.timestamp || null;
  }

  private updateMessageHistory(userId: string, content: string): void {
    if (!this.messageHistory.has(userId)) {
      this.messageHistory.set(userId, []);
    }
    
    const history = this.messageHistory.get(userId)!;
    history.push(content);
    
    // Keep only recent messages for spam detection
    if (history.length > this.MAX_MESSAGE_HISTORY) {
      history.splice(0, history.length - this.MAX_MESSAGE_HISTORY);
    }
  }

  private generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substring(2, 9);
  }
}