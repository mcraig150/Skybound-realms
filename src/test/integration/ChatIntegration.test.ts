import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';
import { ChatServiceImpl } from '../../services/ChatService';
import { PlayerRepository } from '../../repositories/PlayerRepository';
import {
  MessageType,
  ChannelType,
  NotificationType,
  FilterAction
} from '../../models/Chat';

// Mock PlayerRepository
const mockPlayerRepository = {
  findById: vi.fn(),
  update: vi.fn(),
  create: vi.fn(),
  delete: vi.fn(),
  findAll: vi.fn()
} as unknown as PlayerRepository;

describe('Chat System Integration', () => {
  let chatService: ChatServiceImpl;
  let alice: any;
  let bob: any;
  let charlie: any;

  beforeEach(() => {
    vi.clearAllMocks();
    chatService = new ChatServiceImpl(mockPlayerRepository);

    // Create test players with realistic data
    alice = {
      id: 'alice',
      username: 'Alice',
      inventory: [],
      currency: { coins: 1000 }
    };

    bob = {
      id: 'bob',
      username: 'Bob',
      inventory: [],
      currency: { coins: 500 }
    };

    charlie = {
      id: 'charlie',
      username: 'Charlie',
      inventory: [],
      currency: { coins: 750 }
    };

    (mockPlayerRepository.findById as Mock).mockImplementation((id: string) => {
      if (id === 'alice') return Promise.resolve(alice);
      if (id === 'bob') return Promise.resolve(bob);
      if (id === 'charlie') return Promise.resolve(charlie);
      return Promise.resolve(null);
    });

    (mockPlayerRepository.update as Mock).mockResolvedValue(true);
  });

  describe('Complete Chat Workflow', () => {
    it('should handle a complete guild chat scenario', async () => {
      // Step 1: Alice creates a guild channel
      const guildChannel = await chatService.createChannel(
        'alice',
        'Dragon Slayers Guild',
        ChannelType.GUILD,
        {
          isPublic: false,
          maxMembers: 50,
          slowModeDelay: 0,
          requireApproval: false
        }
      );

      expect(guildChannel.name).toBe('Dragon Slayers Guild');
      expect(guildChannel.type).toBe(ChannelType.GUILD);
      expect(guildChannel.ownerId).toBe('alice');

      // Step 2: Bob and Charlie join the guild channel
      await chatService.joinChannel('bob', guildChannel.id);
      await chatService.joinChannel('charlie', guildChannel.id);

      const participants = await chatService.getChannelParticipants(guildChannel.id);
      expect(participants).toHaveLength(3);

      // Step 3: Alice sends a welcome message
      const welcomeMessage = await chatService.sendMessage(
        'alice',
        guildChannel.id,
        'Welcome to the Dragon Slayers Guild! @Bob @Charlie',
        MessageType.TEXT
      );

      expect(welcomeMessage.content).toContain('Welcome to the Dragon Slayers Guild!');

      // Step 4: Check that Bob and Charlie received mention notifications
      const bobNotifications = await chatService.getNotifications('bob');
      const charlieNotifications = await chatService.getNotifications('charlie');

      expect(bobNotifications).toHaveLength(1);
      expect(charlieNotifications).toHaveLength(1);
      expect(bobNotifications[0].type).toBe(NotificationType.MENTION);
      expect(charlieNotifications[0].type).toBe(NotificationType.MENTION);

      // Step 5: Bob responds with an emote
      const bobResponse = await chatService.sendMessage(
        'bob',
        guildChannel.id,
        'Thanks Alice! :thumbsup:',
        MessageType.TEXT
      );

      expect(bobResponse.content).toBe('Thanks Alice! :thumbsup:');

      // Step 6: Charlie sends a message that triggers spam detection
      await chatService.addFilter({
        name: 'Spam Filter',
        type: 'spam_detection',
        pattern: '',
        action: FilterAction.WARN,
        isActive: true,
        severity: 'medium'
      });

      const spamMessage = await chatService.sendMessage(
        'charlie',
        guildChannel.id,
        'AAAAAAAAAAAAAAAAAAAAAA',
        MessageType.TEXT
      );

      // The message should still be sent but a warning should be generated
      expect(spamMessage.content).toBe('AAAAAAAAAAAAAAAAAAAAAA');

      // Step 7: Alice uses a moderation command to mute Charlie temporarily
      const participants2 = await chatService.getChannelParticipants(guildChannel.id);
      const aliceParticipant = participants2.find(p => p.userId === 'alice')!;
      const channel = (await chatService.getPlayerChannels('alice'))[0];

      const muteContext = {
        message: {
          id: 'cmd1',
          senderId: 'alice',
          senderUsername: 'Alice',
          channelId: guildChannel.id,
          content: '/mute Charlie 60 Spam behavior',
          messageType: MessageType.COMMAND,
          timestamp: new Date(),
          isDeleted: false,
          reactions: []
        },
        channel,
        sender: aliceParticipant,
        args: ['mute', 'Charlie', '60', 'Spam', 'behavior'],
        mentions: []
      };

      const muteResult = await chatService.executeCommand(muteContext);
      expect(muteResult.success).toBe(true);
      expect(muteResult.response).toContain('has been muted');

      // Step 8: Verify Charlie is muted and cannot send messages
      await expect(
        chatService.sendMessage('charlie', guildChannel.id, 'I am muted!', MessageType.TEXT)
      ).rejects.toThrow('User is muted in this channel');

      // Step 9: Get channel statistics
      const stats = await chatService.getChannelStatistics(guildChannel.id);
      expect(stats.totalMessages).toBeGreaterThan(0);
      expect(stats.activeUsers).toBe(3);
      expect(stats.topUsers).toHaveLength(3);

      // Step 10: Alice gets help with available commands
      const helpContext = {
        message: {
          id: 'cmd2',
          senderId: 'alice',
          senderUsername: 'Alice',
          channelId: guildChannel.id,
          content: '/help',
          messageType: MessageType.COMMAND,
          timestamp: new Date(),
          isDeleted: false,
          reactions: []
        },
        channel,
        sender: aliceParticipant,
        args: ['help'],
        mentions: []
      };

      const helpResult = await chatService.executeCommand(helpContext);
      expect(helpResult.success).toBe(true);
      expect(helpResult.response).toContain('Available commands');

      // Step 11: Retrieve recent messages
      const recentMessages = await chatService.getChannelMessages(guildChannel.id, 10);
      expect(recentMessages.length).toBeGreaterThan(0);
      expect(recentMessages.every(msg => !msg.isDeleted)).toBe(true);
    });

    it('should handle private messaging between players', async () => {
      // Create a private channel between Alice and Bob
      const privateChannel = await chatService.createChannel(
        'alice',
        'Alice & Bob',
        ChannelType.PRIVATE,
        {
          isPublic: false,
          maxMembers: 2,
          slowModeDelay: 0
        }
      );

      await chatService.joinChannel('bob', privateChannel.id);

      // Alice sends a private message
      const privateMessage = await chatService.sendMessage(
        'alice',
        privateChannel.id,
        'Hey Bob, want to team up for the dragon raid?',
        MessageType.TEXT
      );

      expect(privateMessage.content).toBe('Hey Bob, want to team up for the dragon raid?');

      // Bob responds
      const bobReply = await chatService.sendMessage(
        'bob',
        privateChannel.id,
        'Absolutely! When do you want to start?',
        MessageType.TEXT
      );

      expect(bobReply.content).toBe('Absolutely! When do you want to start?');

      // Alice edits her message
      const editedMessage = await chatService.editMessage(
        privateMessage.id,
        'alice',
        'Hey Bob, want to team up for the dragon raid tonight?'
      );

      expect(editedMessage.content).toBe('Hey Bob, want to team up for the dragon raid tonight?');
      expect(editedMessage.editedAt).toBeDefined();

      // Verify only Alice and Bob are in the channel
      const participants = await chatService.getChannelParticipants(privateChannel.id);
      expect(participants).toHaveLength(2);
      expect(participants.some(p => p.userId === 'alice')).toBe(true);
      expect(participants.some(p => p.userId === 'bob')).toBe(true);
      expect(participants.some(p => p.userId === 'charlie')).toBe(false);
    });

    it('should handle trade-related chat integration', async () => {
      // Create a trade channel
      const tradeChannel = await chatService.createChannel(
        'alice',
        'Trading Post',
        ChannelType.TRADE,
        {
          isPublic: true,
          maxMembers: 100,
          slowModeDelay: 10
        }
      );

      await chatService.joinChannel('bob', tradeChannel.id);
      await chatService.joinChannel('charlie', tradeChannel.id);

      // Alice posts a trade offer
      const tradeOffer = await chatService.sendMessage(
        'alice',
        tradeChannel.id,
        'WTS: Epic Dragon Sword +15 - 50,000 coins or best offer!',
        MessageType.TEXT
      );

      expect(tradeOffer.content).toContain('Epic Dragon Sword');

      // Bob shows interest
      const bobInterest = await chatService.sendMessage(
        'bob',
        tradeChannel.id,
        '@Alice I\'m interested! Can you do 45k?',
        MessageType.TEXT
      );

      // Alice should receive a mention notification
      const aliceNotifications = await chatService.getNotifications('alice');
      expect(aliceNotifications.some(n => n.type === NotificationType.MENTION)).toBe(true);

      // Alice sends a trade request message
      const tradeRequest = await chatService.sendMessage(
        'alice',
        tradeChannel.id,
        'Deal! I\'ll send you a trade request now.',
        MessageType.TRADE_REQUEST
      );

      expect(tradeRequest.messageType).toBe(MessageType.TRADE_REQUEST);

      // Charlie tries to spam the channel but gets filtered
      await chatService.addFilter({
        name: 'Trade Spam Filter',
        type: 'word_blacklist',
        pattern: 'CHEAP,GOLD,SELLING',
        action: FilterAction.DELETE,
        isActive: true,
        severity: 'high'
      });

      // This message should be blocked
      await expect(
        chatService.sendMessage('charlie', tradeChannel.id, 'CHEAP GOLD SELLING HERE!', MessageType.TEXT)
      ).rejects.toThrow('Message blocked by content filter');

      // Get trade channel statistics
      const tradeStats = await chatService.getChannelStatistics(tradeChannel.id);
      expect(tradeStats.totalMessages).toBeGreaterThan(0);
      expect(tradeStats.activeUsers).toBe(3);
    });

    it('should handle emote system integration', async () => {
      // Create a general channel
      const generalChannel = await chatService.createChannel(
        'alice',
        'General Chat',
        ChannelType.GLOBAL
      );

      await chatService.joinChannel('bob', generalChannel.id);

      // Add custom emotes
      const customEmote = await chatService.addEmote({
        name: 'dragon_fire',
        imageUrl: 'https://example.com/dragon_fire.gif',
        category: 'custom',
        isAnimated: true,
        isCustom: true,
        guildId: 'dragon_slayers_guild'
      });

      expect(customEmote.name).toBe('dragon_fire');
      expect(customEmote.isAnimated).toBe(true);

      // Alice uses the custom emote
      const emoteMessage = await chatService.sendMessage(
        'alice',
        generalChannel.id,
        'Just defeated the dragon! :dragon_fire: :thumbsup:',
        MessageType.EMOTE
      );

      expect(emoteMessage.messageType).toBe(MessageType.EMOTE);

      // Track emote usage
      await chatService.useEmote(customEmote.id);
      const emotes = await chatService.getEmotes();
      const usedEmote = emotes.find(e => e.id === customEmote.id);
      expect(usedEmote?.usageCount).toBe(1);

      // Get emotes by category
      const customEmotes = await chatService.getEmotes('custom');
      expect(customEmotes.some(e => e.name === 'dragon_fire')).toBe(true);

      const basicEmotes = await chatService.getEmotes('basic');
      expect(basicEmotes.some(e => e.name === 'smile')).toBe(true);
    });

    it('should handle system announcements and notifications', async () => {
      // Create a system channel
      const systemChannel = await chatService.createChannel(
        'alice',
        'System Announcements',
        ChannelType.SYSTEM,
        {
          isPublic: true,
          maxMembers: 1000,
          allowedMessageTypes: [MessageType.SYSTEM, MessageType.TEXT]
        }
      );

      await chatService.joinChannel('bob', systemChannel.id);
      await chatService.joinChannel('charlie', systemChannel.id);

      // Send system announcement
      const systemMessage = await chatService.sendMessage(
        'system',
        systemChannel.id,
        'Server maintenance scheduled for tonight at 2 AM UTC. Expected downtime: 2 hours.',
        MessageType.SYSTEM
      );

      expect(systemMessage.messageType).toBe(MessageType.SYSTEM);
      expect(systemMessage.senderUsername).toBe('System');

      // Send notifications to all users
      await chatService.sendNotification({
        userId: 'alice',
        type: NotificationType.SYSTEM_ANNOUNCEMENT,
        channelId: systemChannel.id,
        messageId: systemMessage.id,
        title: 'Server Maintenance Notice',
        content: 'Server maintenance scheduled for tonight',
        isRead: false
      });

      await chatService.sendNotification({
        userId: 'bob',
        type: NotificationType.SYSTEM_ANNOUNCEMENT,
        channelId: systemChannel.id,
        messageId: systemMessage.id,
        title: 'Server Maintenance Notice',
        content: 'Server maintenance scheduled for tonight',
        isRead: false
      });

      // Check notifications
      const aliceNotifications = await chatService.getNotifications('alice');
      const bobNotifications = await chatService.getNotifications('bob');

      expect(aliceNotifications.some(n => n.type === NotificationType.SYSTEM_ANNOUNCEMENT)).toBe(true);
      expect(bobNotifications.some(n => n.type === NotificationType.SYSTEM_ANNOUNCEMENT)).toBe(true);

      // Mark notifications as read
      const aliceSystemNotification = aliceNotifications.find(n => n.type === NotificationType.SYSTEM_ANNOUNCEMENT);
      if (aliceSystemNotification) {
        await chatService.markNotificationRead(aliceSystemNotification.id, 'alice');
      }

      // Verify notification is marked as read
      const updatedNotifications = await chatService.getNotifications('alice');
      const readNotification = updatedNotifications.find(n => n.id === aliceSystemNotification?.id);
      expect(readNotification?.isRead).toBe(true);
    });
  });

  describe('Event-Driven Integration', () => {
    it('should handle real-time events and notifications', async () => {
      const eventHandler = {
        onMessageSent: vi.fn(),
        onMessageEdited: vi.fn(),
        onMessageDeleted: vi.fn(),
        onUserJoinedChannel: vi.fn(),
        onUserLeftChannel: vi.fn(),
        onUserMuted: vi.fn(),
        onChannelCreated: vi.fn()
      };

      chatService.addEventHandler(eventHandler);

      // Create channel and verify event
      const channel = await chatService.createChannel('alice', 'Event Test', ChannelType.PRIVATE);
      expect(eventHandler.onChannelCreated).toHaveBeenCalledWith(channel);

      // Join channel and verify event
      await chatService.joinChannel('bob', channel.id);
      expect(eventHandler.onUserJoinedChannel).toHaveBeenCalledWith('bob', channel.id);

      // Send message and verify event
      const message = await chatService.sendMessage('alice', channel.id, 'Test message', MessageType.TEXT);
      expect(eventHandler.onMessageSent).toHaveBeenCalledWith(message);

      // Edit message and verify event
      await chatService.editMessage(message.id, 'alice', 'Edited test message');
      expect(eventHandler.onMessageEdited).toHaveBeenCalled();

      // Mute user and verify event
      await chatService.muteUser(channel.id, 'alice', 'bob', 300);
      expect(eventHandler.onUserMuted).toHaveBeenCalledWith('bob', channel.id, 300);

      // Leave channel and verify event
      await chatService.leaveChannel('bob', channel.id);
      expect(eventHandler.onUserLeftChannel).toHaveBeenCalledWith('bob', channel.id);
    });
  });

  describe('Performance and Scalability', () => {
    it('should handle multiple concurrent operations', async () => {
      const channel = await chatService.createChannel('alice', 'Concurrent Test', ChannelType.GLOBAL);
      
      // Join multiple users concurrently
      await Promise.all([
        chatService.joinChannel('bob', channel.id),
        chatService.joinChannel('charlie', channel.id)
      ]);

      // Send multiple messages concurrently
      const messagePromises = [];
      for (let i = 0; i < 10; i++) {
        messagePromises.push(
          chatService.sendMessage('alice', channel.id, `Message ${i}`, MessageType.TEXT)
        );
      }

      const messages = await Promise.all(messagePromises);
      expect(messages).toHaveLength(10);
      expect(messages.every(msg => msg.senderId === 'alice')).toBe(true);

      // Verify all messages are stored
      const channelMessages = await chatService.getChannelMessages(channel.id);
      expect(channelMessages.length).toBeGreaterThanOrEqual(10);
    });

    it('should handle channel cleanup and management', async () => {
      // Create multiple channels
      const channels = await Promise.all([
        chatService.createChannel('alice', 'Channel 1', ChannelType.PRIVATE),
        chatService.createChannel('bob', 'Channel 2', ChannelType.PRIVATE),
        chatService.createChannel('charlie', 'Channel 3', ChannelType.PRIVATE)
      ]);

      expect(channels).toHaveLength(3);

      // Get global statistics
      const globalStats = await chatService.getGlobalStatistics();
      expect(globalStats.channelsCount).toBeGreaterThanOrEqual(3);

      // Test expired trade cleanup
      const expiredCount = await chatService.cleanupExpiredTrades();
      expect(typeof expiredCount).toBe('number');
    });
  });
});