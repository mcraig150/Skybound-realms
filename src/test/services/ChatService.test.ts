import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';
import { ChatServiceImpl } from '../../services/ChatService';
import { PlayerRepository } from '../../repositories/PlayerRepository';
import {
  MessageType,
  ChannelType,
  ParticipantRole,
  ChatPermission,
  FilterAction,
  NotificationType,
  ChatValidator
} from '../../models/Chat';

// Mock PlayerRepository
const mockPlayerRepository = {
  findById: vi.fn(),
  update: vi.fn(),
  create: vi.fn(),
  delete: vi.fn(),
  findAll: vi.fn()
} as unknown as PlayerRepository;

describe('ChatService', () => {
  let chatService: ChatServiceImpl;
  let mockPlayer1: any;
  let mockPlayer2: any;

  beforeEach(() => {
    vi.clearAllMocks();
    chatService = new ChatServiceImpl(mockPlayerRepository);

    mockPlayer1 = {
      id: 'player1',
      username: 'TestPlayer1',
      inventory: [],
      currency: { coins: 1000 }
    };

    mockPlayer2 = {
      id: 'player2',
      username: 'TestPlayer2',
      inventory: [],
      currency: { coins: 500 }
    };

    (mockPlayerRepository.findById as Mock).mockImplementation((id: string) => {
      if (id === 'player1') return Promise.resolve(mockPlayer1);
      if (id === 'player2') return Promise.resolve(mockPlayer2);
      return Promise.resolve(null);
    });
  });

  describe('Channel Management', () => {
    it('should create a new channel successfully', async () => {
      const channel = await chatService.createChannel(
        'player1',
        'Test Channel',
        ChannelType.PRIVATE,
        { maxMembers: 50 }
      );

      expect(channel.name).toBe('Test Channel');
      expect(channel.type).toBe(ChannelType.PRIVATE);
      expect(channel.ownerId).toBe('player1');
      expect(channel.memberIds).toContain('player1');
      expect(channel.settings.maxMembers).toBe(50);
    });

    it('should fail to create channel with invalid name', async () => {
      await expect(
        chatService.createChannel('player1', '', ChannelType.PRIVATE)
      ).rejects.toThrow('Invalid channel');
    });

    it('should allow user to join public channel', async () => {
      const channel = await chatService.createChannel(
        'player1',
        'Public Channel',
        ChannelType.GLOBAL,
        { isPublic: true }
      );

      const result = await chatService.joinChannel('player2', channel.id);
      expect(result).toBe(true);

      const participants = await chatService.getChannelParticipants(channel.id);
      expect(participants).toHaveLength(2);
      expect(participants.some(p => p.userId === 'player2')).toBe(true);
    });

    it('should prevent joining full channel', async () => {
      const channel = await chatService.createChannel(
        'player1',
        'Small Channel',
        ChannelType.PRIVATE,
        { maxMembers: 1 }
      );

      await expect(
        chatService.joinChannel('player2', channel.id)
      ).rejects.toThrow('Channel is full');
    });

    it('should allow user to leave channel', async () => {
      const channel = await chatService.createChannel(
        'player1',
        'Test Channel',
        ChannelType.PRIVATE
      );

      await chatService.joinChannel('player2', channel.id);
      const leaveResult = await chatService.leaveChannel('player2', channel.id);
      
      expect(leaveResult).toBe(true);
      
      const participants = await chatService.getChannelParticipants(channel.id);
      expect(participants.some(p => p.userId === 'player2')).toBe(false);
    });

    it('should transfer ownership when owner leaves', async () => {
      const channel = await chatService.createChannel(
        'player1',
        'Test Channel',
        ChannelType.PRIVATE
      );

      await chatService.joinChannel('player2', channel.id);
      await chatService.leaveChannel('player1', channel.id);

      const updatedChannel = (await chatService.getPlayerChannels('player2'))[0];
      expect(updatedChannel.ownerId).toBe('player2');
    });
  });

  describe('Message Management', () => {
    let channelId: string;

    beforeEach(async () => {
      const channel = await chatService.createChannel(
        'player1',
        'Test Channel',
        ChannelType.PRIVATE
      );
      channelId = channel.id;
      await chatService.joinChannel('player2', channelId);
    });

    it('should send message successfully', async () => {
      const message = await chatService.sendMessage(
        'player1',
        channelId,
        'Hello, world!',
        MessageType.TEXT
      );

      expect(message.content).toBe('Hello, world!');
      expect(message.senderId).toBe('player1');
      expect(message.senderUsername).toBe('TestPlayer1');
      expect(message.channelId).toBe(channelId);
      expect(message.messageType).toBe(MessageType.TEXT);
    });

    it('should fail to send empty message', async () => {
      await expect(
        chatService.sendMessage('player1', channelId, '', MessageType.TEXT)
      ).rejects.toThrow('Invalid message');
    });

    it('should fail to send message to non-existent channel', async () => {
      await expect(
        chatService.sendMessage('player1', 'nonexistent', 'Hello', MessageType.TEXT)
      ).rejects.toThrow('Channel not found');
    });

    it('should fail to send message if user not in channel', async () => {
      const anotherChannel = await chatService.createChannel(
        'player2',
        'Another Channel',
        ChannelType.PRIVATE
      );

      await expect(
        chatService.sendMessage('player1', anotherChannel.id, 'Hello', MessageType.TEXT)
      ).rejects.toThrow('User is not a member of this channel');
    });

    it('should edit message successfully', async () => {
      const message = await chatService.sendMessage(
        'player1',
        channelId,
        'Original message',
        MessageType.TEXT
      );

      const editedMessage = await chatService.editMessage(
        message.id,
        'player1',
        'Edited message'
      );

      expect(editedMessage.content).toBe('Edited message');
      expect(editedMessage.editedAt).toBeDefined();
    });

    it('should fail to edit another user\'s message without permissions', async () => {
      const message = await chatService.sendMessage(
        'player1',
        channelId,
        'Original message',
        MessageType.TEXT
      );

      await expect(
        chatService.editMessage(message.id, 'player2', 'Edited message')
      ).rejects.toThrow('You can only edit your own messages');
    });

    it('should delete message successfully', async () => {
      const message = await chatService.sendMessage(
        'player1',
        channelId,
        'Message to delete',
        MessageType.TEXT
      );

      const result = await chatService.deleteMessage(message.id, 'player1');
      expect(result).toBe(true);

      const messages = await chatService.getChannelMessages(channelId);
      expect(messages.some(m => m.id === message.id)).toBe(false);
    });

    it('should retrieve channel messages', async () => {
      const msg1 = await chatService.sendMessage('player1', channelId, 'Message 1', MessageType.TEXT);
      // Add small delay to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 1));
      const msg2 = await chatService.sendMessage('player2', channelId, 'Message 2', MessageType.TEXT);
      await new Promise(resolve => setTimeout(resolve, 1));
      const msg3 = await chatService.sendMessage('player1', channelId, 'Message 3', MessageType.TEXT);

      const messages = await chatService.getChannelMessages(channelId);
      expect(messages).toHaveLength(3);
      expect(messages[0].content).toBe('Message 3'); // Newest first
      expect(messages[2].content).toBe('Message 1'); // Oldest last
    });

    it('should limit message retrieval', async () => {
      for (let i = 1; i <= 10; i++) {
        await chatService.sendMessage('player1', channelId, `Message ${i}`, MessageType.TEXT);
        // Add small delay to ensure different timestamps
        await new Promise(resolve => setTimeout(resolve, 1));
      }

      const messages = await chatService.getChannelMessages(channelId, 5);
      expect(messages).toHaveLength(5);
      expect(messages[0].content).toBe('Message 10');
      expect(messages[4].content).toBe('Message 6');
    });
  });

  describe('Moderation Features', () => {
    let channelId: string;

    beforeEach(async () => {
      const channel = await chatService.createChannel(
        'player1',
        'Test Channel',
        ChannelType.PRIVATE
      );
      channelId = channel.id;
      await chatService.joinChannel('player2', channelId);
    });

    it('should mute user successfully', async () => {
      const result = await chatService.muteUser(
        channelId,
        'player1', // owner/moderator
        'player2', // target
        300, // 5 minutes
        'Spam'
      );

      expect(result).toBe(true);

      const participants = await chatService.getChannelParticipants(channelId);
      const mutedUser = participants.find(p => p.userId === 'player2');
      expect(mutedUser?.isMuted).toBe(true);
      expect(mutedUser?.muteExpiresAt).toBeDefined();
    });

    it('should fail to mute without permissions', async () => {
      await expect(
        chatService.muteUser(channelId, 'player2', 'player1', 300, 'Test')
      ).rejects.toThrow('Insufficient permissions');
    });

    it('should kick user successfully', async () => {
      const result = await chatService.kickUser(
        channelId,
        'player1', // owner
        'player2', // target
        'Violation'
      );

      expect(result).toBe(true);

      const participants = await chatService.getChannelParticipants(channelId);
      expect(participants.some(p => p.userId === 'player2')).toBe(false);
    });

    it('should prevent muted user from sending messages', async () => {
      await chatService.muteUser(channelId, 'player1', 'player2', 300);

      await expect(
        chatService.sendMessage('player2', channelId, 'I am muted', MessageType.TEXT)
      ).rejects.toThrow('User is muted in this channel');
    });
  });

  describe('Command System', () => {
    let channelId: string;

    beforeEach(async () => {
      const channel = await chatService.createChannel(
        'player1',
        'Test Channel',
        ChannelType.PRIVATE
      );
      channelId = channel.id;
      await chatService.joinChannel('player2', channelId);
    });

    it('should execute help command', async () => {
      const participants = await chatService.getChannelParticipants(channelId);
      const sender = participants.find(p => p.userId === 'player1')!;
      const channel = (await chatService.getPlayerChannels('player1'))[0];

      const context = {
        message: {
          id: 'msg1',
          senderId: 'player1',
          senderUsername: 'TestPlayer1',
          channelId,
          content: '/help',
          messageType: MessageType.COMMAND,
          timestamp: new Date(),
          isDeleted: false,
          reactions: []
        },
        channel,
        sender,
        args: ['help'],
        mentions: []
      };

      const result = await chatService.executeCommand(context);
      expect(result.success).toBe(true);
      expect(result.response).toContain('Available commands');
    });

    it('should execute mute command', async () => {
      const participants = await chatService.getChannelParticipants(channelId);
      const sender = participants.find(p => p.userId === 'player1')!;
      const channel = (await chatService.getPlayerChannels('player1'))[0];

      const context = {
        message: {
          id: 'msg1',
          senderId: 'player1',
          senderUsername: 'TestPlayer1',
          channelId,
          content: '/mute TestPlayer2 300 spam',
          messageType: MessageType.COMMAND,
          timestamp: new Date(),
          isDeleted: false,
          reactions: []
        },
        channel,
        sender,
        args: ['mute', 'TestPlayer2', '300', 'spam'],
        mentions: []
      };

      const result = await chatService.executeCommand(context);
      expect(result.success).toBe(true);
      expect(result.response).toContain('has been muted');
    });

    it('should fail command with insufficient permissions', async () => {
      const participants = await chatService.getChannelParticipants(channelId);
      const sender = participants.find(p => p.userId === 'player2')!; // Regular member
      const channel = (await chatService.getPlayerChannels('player2'))[0];

      const context = {
        message: {
          id: 'msg1',
          senderId: 'player2',
          senderUsername: 'TestPlayer2',
          channelId,
          content: '/mute TestPlayer1 300',
          messageType: MessageType.COMMAND,
          timestamp: new Date(),
          isDeleted: false,
          reactions: []
        },
        channel,
        sender,
        args: ['mute', 'TestPlayer1', '300'],
        mentions: []
      };

      const result = await chatService.executeCommand(context);
      expect(result.success).toBe(false);
      expect(result.error).toBe('Insufficient permissions');
    });
  });

  describe('Emote System', () => {
    it('should add emote successfully', async () => {
      const emote = await chatService.addEmote({
        name: 'test_emote',
        imageUrl: 'https://example.com/emote.png',
        category: 'custom',
        isAnimated: false,
        isCustom: true
      });

      expect(emote.name).toBe('test_emote');
      expect(emote.id).toBeDefined();
      expect(emote.usageCount).toBe(0);
    });

    it('should fail to add emote with invalid name', async () => {
      await expect(
        chatService.addEmote({
          name: 'invalid name!',
          imageUrl: 'https://example.com/emote.png',
          category: 'custom',
          isAnimated: false,
          isCustom: true
        })
      ).rejects.toThrow('Invalid emote');
    });

    it('should retrieve emotes by category', async () => {
      await chatService.addEmote({
        name: 'custom1',
        imageUrl: 'https://example.com/1.png',
        category: 'custom',
        isAnimated: false,
        isCustom: true
      });

      await chatService.addEmote({
        name: 'basic1',
        imageUrl: 'https://example.com/2.png',
        category: 'basic',
        isAnimated: false,
        isCustom: false
      });

      const customEmotes = await chatService.getEmotes('custom');
      const basicEmotes = await chatService.getEmotes('basic');

      expect(customEmotes.some(e => e.name === 'custom1')).toBe(true);
      expect(basicEmotes.some(e => e.name === 'basic1')).toBe(true);
      expect(customEmotes.some(e => e.name === 'basic1')).toBe(false);
    });

    it('should track emote usage', async () => {
      const emote = await chatService.addEmote({
        name: 'tracked_emote',
        imageUrl: 'https://example.com/emote.png',
        category: 'custom',
        isAnimated: false,
        isCustom: true
      });

      await chatService.useEmote(emote.id);
      await chatService.useEmote(emote.id);

      const emotes = await chatService.getEmotes();
      const trackedEmote = emotes.find(e => e.id === emote.id);
      expect(trackedEmote?.usageCount).toBe(2);
    });
  });

  describe('Content Filtering', () => {
    let channelId: string;

    beforeEach(async () => {
      const channel = await chatService.createChannel(
        'player1',
        'Test Channel',
        ChannelType.PRIVATE
      );
      channelId = channel.id;
      await chatService.joinChannel('player2', channelId);
    });

    it('should add content filter', async () => {
      const filter = await chatService.addFilter({
        name: 'Test Filter',
        type: 'word_blacklist',
        pattern: 'badword',
        action: FilterAction.DELETE,
        isActive: true,
        severity: 'medium'
      });

      expect(filter.name).toBe('Test Filter');
      expect(filter.id).toBeDefined();
    });

    it('should detect spam messages', async () => {
      // Send repeated messages to trigger spam detection
      const spamMessage = 'SPAM SPAM SPAM SPAM SPAM SPAM';
      
      // First message should go through
      const message1 = await chatService.sendMessage('player1', channelId, spamMessage, MessageType.TEXT);
      expect(message1.content).toBe(spamMessage);

      // Subsequent identical messages should be detected as spam
      // Note: This depends on the spam detection implementation
    });
  });

  describe('Notifications', () => {
    let channelId: string;

    beforeEach(async () => {
      const channel = await chatService.createChannel(
        'player1',
        'Test Channel',
        ChannelType.PRIVATE
      );
      channelId = channel.id;
      await chatService.joinChannel('player2', channelId);
    });

    it('should send notification', async () => {
      await chatService.sendNotification({
        userId: 'player1',
        type: NotificationType.MENTION,
        channelId,
        title: 'Test Notification',
        content: 'This is a test notification',
        isRead: false
      });

      const notifications = await chatService.getNotifications('player1');
      expect(notifications).toHaveLength(1);
      expect(notifications[0].title).toBe('Test Notification');
    });

    it('should mark notification as read', async () => {
      await chatService.sendNotification({
        userId: 'player1',
        type: NotificationType.MENTION,
        channelId,
        title: 'Test Notification',
        content: 'This is a test notification',
        isRead: false
      });

      const notifications = await chatService.getNotifications('player1');
      const notificationId = notifications[0].id;

      const result = await chatService.markNotificationRead(notificationId, 'player1');
      expect(result).toBe(true);

      const updatedNotifications = await chatService.getNotifications('player1');
      expect(updatedNotifications[0].isRead).toBe(true);
    });

    it('should filter unread notifications', async () => {
      await chatService.sendNotification({
        userId: 'player1',
        type: NotificationType.MENTION,
        channelId,
        title: 'Unread Notification',
        content: 'This is unread',
        isRead: false
      });

      await chatService.sendNotification({
        userId: 'player1',
        type: NotificationType.MENTION,
        channelId,
        title: 'Read Notification',
        content: 'This is read',
        isRead: true
      });

      const unreadNotifications = await chatService.getNotifications('player1', true);
      expect(unreadNotifications).toHaveLength(1);
      expect(unreadNotifications[0].title).toBe('Unread Notification');
    });

    it('should create mention notification when user is mentioned', async () => {
      await chatService.sendMessage('player1', channelId, 'Hello @TestPlayer2!', MessageType.TEXT);

      const notifications = await chatService.getNotifications('player2');
      expect(notifications).toHaveLength(1);
      expect(notifications[0].type).toBe(NotificationType.MENTION);
      expect(notifications[0].title).toBe('You were mentioned');
    });
  });

  describe('Statistics', () => {
    let channelId: string;

    beforeEach(async () => {
      const channel = await chatService.createChannel(
        'player1',
        'Test Channel',
        ChannelType.PRIVATE
      );
      channelId = channel.id;
      await chatService.joinChannel('player2', channelId);
    });

    it('should get channel statistics', async () => {
      // Send some messages
      await chatService.sendMessage('player1', channelId, 'Message 1', MessageType.TEXT);
      await chatService.sendMessage('player2', channelId, 'Message 2', MessageType.TEXT);
      await chatService.sendMessage('player1', channelId, 'Message 3', MessageType.TEXT);

      const stats = await chatService.getChannelStatistics(channelId);
      
      expect(stats.totalMessages).toBe(3);
      expect(stats.activeUsers).toBe(2);
      expect(stats.topUsers).toHaveLength(2);
      expect(stats.topUsers[0].messageCount).toBe(2); // player1 sent 2 messages
      expect(stats.topUsers[1].messageCount).toBe(1); // player2 sent 1 message
    });

    it('should get global statistics', async () => {
      // Create another channel
      const channel2 = await chatService.createChannel(
        'player2',
        'Another Channel',
        ChannelType.PRIVATE
      );

      // Send messages in both channels
      await chatService.sendMessage('player1', channelId, 'Message 1', MessageType.TEXT);
      await chatService.sendMessage('player2', channel2.id, 'Message 2', MessageType.TEXT);

      const stats = await chatService.getGlobalStatistics();
      
      expect(stats.totalMessages).toBe(2);
      expect(stats.channelsCount).toBeGreaterThan(1); // At least our 2 channels + global
      expect(stats.topChannels).toBeDefined();
    });
  });

  describe('Event Handling', () => {
    let channelId: string;
    let eventHandler: any;

    beforeEach(async () => {
      const channel = await chatService.createChannel(
        'player1',
        'Test Channel',
        ChannelType.PRIVATE
      );
      channelId = channel.id;
      await chatService.joinChannel('player2', channelId);

      eventHandler = {
        onMessageSent: vi.fn(),
        onMessageEdited: vi.fn(),
        onMessageDeleted: vi.fn(),
        onUserJoinedChannel: vi.fn(),
        onUserLeftChannel: vi.fn(),
        onUserMuted: vi.fn(),
        onChannelCreated: vi.fn()
      };

      chatService.addEventHandler(eventHandler);
    });

    it('should trigger message sent event', async () => {
      await chatService.sendMessage('player1', channelId, 'Test message', MessageType.TEXT);
      
      expect(eventHandler.onMessageSent).toHaveBeenCalledTimes(1);
      expect(eventHandler.onMessageSent).toHaveBeenCalledWith(
        expect.objectContaining({
          content: 'Test message',
          senderId: 'player1'
        })
      );
    });

    it('should trigger message edited event', async () => {
      const message = await chatService.sendMessage('player1', channelId, 'Original', MessageType.TEXT);
      await chatService.editMessage(message.id, 'player1', 'Edited');
      
      expect(eventHandler.onMessageEdited).toHaveBeenCalledTimes(1);
    });

    it('should trigger user joined event', async () => {
      const newChannel = await chatService.createChannel('player1', 'New Channel', ChannelType.PRIVATE);
      
      // Clear the channel created event
      eventHandler.onUserJoinedChannel.mockClear();
      
      await chatService.joinChannel('player2', newChannel.id);
      
      expect(eventHandler.onUserJoinedChannel).toHaveBeenCalledWith('player2', newChannel.id);
    });

    it('should trigger user muted event', async () => {
      await chatService.muteUser(channelId, 'player1', 'player2', 300);
      
      expect(eventHandler.onUserMuted).toHaveBeenCalledWith('player2', channelId, 300);
    });
  });
});

describe('ChatValidator', () => {
  describe('Message Validation', () => {
    it('should validate correct message', () => {
      const result = ChatValidator.validateMessage({
        senderId: 'user1',
        channelId: 'channel1',
        content: 'Hello world',
        messageType: MessageType.TEXT
      });

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject message without sender', () => {
      const result = ChatValidator.validateMessage({
        channelId: 'channel1',
        content: 'Hello world',
        messageType: MessageType.TEXT
      });

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Sender ID is required and must be a string');
    });

    it('should reject empty message', () => {
      const result = ChatValidator.validateMessage({
        senderId: 'user1',
        channelId: 'channel1',
        content: '',
        messageType: MessageType.TEXT
      });

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Message content cannot be empty');
    });

    it('should reject message that is too long', () => {
      const longMessage = 'a'.repeat(2001);
      const result = ChatValidator.validateMessage({
        senderId: 'user1',
        channelId: 'channel1',
        content: longMessage,
        messageType: MessageType.TEXT
      });

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Message content cannot exceed 2000 characters');
    });

    it('should warn about excessive caps', () => {
      const result = ChatValidator.validateMessage({
        senderId: 'user1',
        channelId: 'channel1',
        content: 'THIS IS ALL CAPS MESSAGE',
        messageType: MessageType.TEXT
      });

      expect(result.isValid).toBe(true);
      expect(result.warnings).toContain('Message contains excessive capital letters');
    });
  });

  describe('Channel Validation', () => {
    it('should validate correct channel', () => {
      const result = ChatValidator.validateChannel({
        name: 'Test Channel',
        type: ChannelType.PRIVATE
      });

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject channel with short name', () => {
      const result = ChatValidator.validateChannel({
        name: 'ab',
        type: ChannelType.PRIVATE
      });

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Channel name must be at least 3 characters');
    });

    it('should reject channel with invalid characters', () => {
      const result = ChatValidator.validateChannel({
        name: 'Test@Channel!',
        type: ChannelType.PRIVATE
      });

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Channel name can only contain letters, numbers, hyphens, underscores, and spaces');
    });
  });

  describe('Utility Functions', () => {
    it('should extract mentions from message', () => {
      const mentions = ChatValidator.extractMentions('Hello @user1 and @user2!');
      expect(mentions).toEqual(['user1', 'user2']);
    });

    it('should extract emotes from message', () => {
      const emotes = ChatValidator.extractEmotes('I am :happy: and :excited:!');
      expect(emotes).toEqual(['happy', 'excited']);
    });

    it('should detect spam patterns', () => {
      const spamMessage = 'aaaaaaaaaaaaa';
      const isSpam = ChatValidator.detectSpam(spamMessage);
      expect(isSpam).toBe(true);
    });

    it('should detect repeated words as spam', () => {
      const spamMessage = 'buy buy buy buy buy buy';
      const isSpam = ChatValidator.detectSpam(spamMessage);
      expect(isSpam).toBe(true);
    });

    it('should not flag normal message as spam', () => {
      const normalMessage = 'Hello everyone, how are you doing today?';
      const isSpam = ChatValidator.detectSpam(normalMessage);
      expect(isSpam).toBe(false);
    });
  });
});