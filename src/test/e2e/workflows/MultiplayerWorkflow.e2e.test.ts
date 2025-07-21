import { describe, it, expect } from 'vitest';
import { setupE2EEnvironment, generateTestData } from '../setup';

const getTestEnv = setupE2EEnvironment();

describe('Multiplayer Features E2E Workflow', () => {
  it('should complete guild creation and management workflow', async () => {
    const env = getTestEnv();
    
    // Create guild leader and members
    const leader = generateTestData.player();
    const member1 = generateTestData.player();
    const member2 = generateTestData.player();

    // Register all players
    const leaderResponse = await env.request
      .post('/api/auth/register')
      .send({
        username: leader.username,
        email: leader.email,
        password: leader.password
      })
      .expect(201);

    const member1Response = await env.request
      .post('/api/auth/register')
      .send({
        username: member1.username,
        email: member1.email,
        password: member1.password
      })
      .expect(201);

    const member2Response = await env.request
      .post('/api/auth/register')
      .send({
        username: member2.username,
        email: member2.email,
        password: member2.password
      })
      .expect(201);

    const leaderToken = leaderResponse.body.token;
    const member1Token = member1Response.body.token;
    const member2Token = member2Response.body.token;
    const leaderPlayer = leaderResponse.body.player;
    const member1Player = member1Response.body.player;
    const member2Player = member2Response.body.player;

    // 1. Leader creates guild
    const guildData = generateTestData.guild();
    const createGuildResponse = await env.request
      .post('/api/guilds/create')
      .set('Authorization', `Bearer ${leaderToken}`)
      .send({
        name: guildData.name,
        description: guildData.description,
        memberLimit: guildData.memberLimit
      })
      .expect(201);

    const guild = createGuildResponse.body;
    expect(guild.id).toBeDefined();
    expect(guild.leaderId).toBe(leaderPlayer.id);
    expect(guild.memberCount).toBe(1);

    // 2. Member 1 applies to join guild
    const applyResponse = await env.request
      .post(`/api/guilds/${guild.id}/apply`)
      .set('Authorization', `Bearer ${member1Token}`)
      .send({
        message: 'I would like to join your guild!'
      })
      .expect(200);

    expect(applyResponse.body.status).toBe('pending');

    // 3. Leader approves application
    const approveResponse = await env.request
      .post(`/api/guilds/${guild.id}/approve/${member1Player.id}`)
      .set('Authorization', `Bearer ${leaderToken}`)
      .expect(200);

    expect(approveResponse.body.status).toBe('approved');

    // 4. Member 2 gets invited directly
    const inviteResponse = await env.request
      .post(`/api/guilds/${guild.id}/invite`)
      .set('Authorization', `Bearer ${leaderToken}`)
      .send({
        playerId: member2Player.id,
        message: 'Welcome to our guild!'
      })
      .expect(200);

    expect(inviteResponse.body.inviteId).toBeDefined();

    // 5. Member 2 accepts invitation
    const acceptInviteResponse = await env.request
      .post(`/api/guilds/invitations/${inviteResponse.body.inviteId}/accept`)
      .set('Authorization', `Bearer ${member2Token}`)
      .expect(200);

    expect(acceptInviteResponse.body.status).toBe('accepted');

    // 6. Verify guild membership
    const guildMembersResponse = await env.request
      .get(`/api/guilds/${guild.id}/members`)
      .set('Authorization', `Bearer ${leaderToken}`)
      .expect(200);

    const members = guildMembersResponse.body;
    expect(members.length).toBe(3);
    expect(members.find((m: any) => m.playerId === leaderPlayer.id).role).toBe('leader');
    expect(members.find((m: any) => m.playerId === member1Player.id).role).toBe('member');
    expect(members.find((m: any) => m.playerId === member2Player.id).role).toBe('member');

    // 7. Leader promotes member 1 to officer
    const promoteResponse = await env.request
      .post(`/api/guilds/${guild.id}/promote/${member1Player.id}`)
      .set('Authorization', `Bearer ${leaderToken}`)
      .send({
        newRole: 'officer'
      })
      .expect(200);

    expect(promoteResponse.body.newRole).toBe('officer');

    // 8. Guild participates in event
    const guildEventResponse = await env.request
      .post(`/api/guilds/${guild.id}/events/participate`)
      .set('Authorization', `Bearer ${leaderToken}`)
      .send({
        eventType: 'resource_gathering_competition',
        duration: 60 // minutes
      })
      .expect(200);

    expect(guildEventResponse.body.eventId).toBeDefined();
    expect(guildEventResponse.body.status).toBe('active');

    // 9. Members contribute to guild event
    await env.request
      .post(`/api/guilds/events/${guildEventResponse.body.eventId}/contribute`)
      .set('Authorization', `Bearer ${member1Token}`)
      .send({
        contribution: {
          type: 'resources',
          items: [{ type: 'wood', quantity: 100 }]
        }
      })
      .expect(200);

    // 10. Check guild statistics and rankings
    const guildStatsResponse = await env.request
      .get(`/api/guilds/${guild.id}/stats`)
      .set('Authorization', `Bearer ${leaderToken}`)
      .expect(200);

    const stats = guildStatsResponse.body;
    expect(stats.totalMembers).toBe(3);
    expect(stats.level).toBeGreaterThanOrEqual(1);
    expect(stats.experience).toBeGreaterThanOrEqual(0);
  });

  it('should handle real-time chat and communication', async () => {
    const env = getTestEnv();
    
    // Create two players
    const player1Data = generateTestData.player();
    const player2Data = generateTestData.player();

    const player1Response = await env.request
      .post('/api/auth/register')
      .send({
        username: player1Data.username,
        email: player1Data.email,
        password: player1Data.password
      })
      .expect(201);

    const player2Response = await env.request
      .post('/api/auth/register')
      .send({
        username: player2Data.username,
        email: player2Data.email,
        password: player2Data.password
      })
      .expect(201);

    const token1 = player1Response.body.token;
    const token2 = player2Response.body.token;
    const player1 = player1Response.body.player;
    const player2 = player2Response.body.player;

    // Set up WebSocket connections for both players
    const wsClient1 = env.wsClient;
    const wsClient2 = env.wsClient; // In real test, would create separate client

    // 1. Players join global chat channel
    await env.request
      .post('/api/chat/join')
      .set('Authorization', `Bearer ${token1}`)
      .send({
        channelId: 'global'
      })
      .expect(200);

    await env.request
      .post('/api/chat/join')
      .set('Authorization', `Bearer ${token2}`)
      .send({
        channelId: 'global'
      })
      .expect(200);

    // 2. Player 1 sends message to global chat
    const messagePromise = new Promise((resolve) => {
      wsClient2.once('chat_message', resolve);
    });

    const sendMessageResponse = await env.request
      .post('/api/chat/send')
      .set('Authorization', `Bearer ${token1}`)
      .send({
        channelId: 'global',
        message: 'Hello everyone!',
        type: 'text'
      })
      .expect(200);

    expect(sendMessageResponse.body.messageId).toBeDefined();

    // 3. Verify message received via WebSocket
    const receivedMessage = await messagePromise;
    expect(receivedMessage).toBeDefined();
    // expect((receivedMessage as any).content).toBe('Hello everyone!');
    // expect((receivedMessage as any).senderId).toBe(player1.id);

    // 4. Player 2 sends private message to Player 1
    const privateMessageResponse = await env.request
      .post('/api/chat/private')
      .set('Authorization', `Bearer ${token2}`)
      .send({
        recipientId: player1.id,
        message: 'Hey there!',
        type: 'text'
      })
      .expect(200);

    expect(privateMessageResponse.body.messageId).toBeDefined();

    // 5. Check chat history
    const historyResponse = await env.request
      .get('/api/chat/history/global')
      .set('Authorization', `Bearer ${token1}`)
      .query({
        limit: 10,
        offset: 0
      })
      .expect(200);

    const history = historyResponse.body;
    expect(history.messages.length).toBeGreaterThan(0);
    expect(history.messages[0].content).toBe('Hello everyone!');

    // 6. Test message filtering and moderation
    const filteredMessageResponse = await env.request
      .post('/api/chat/send')
      .set('Authorization', `Bearer ${token1}`)
      .send({
        channelId: 'global',
        message: 'This contains badword and should be filtered',
        type: 'text'
      })
      .expect(200);

    expect(filteredMessageResponse.body.filtered).toBe(true);
  });

  it('should handle cooperative island gameplay', async () => {
    const env = getTestEnv();
    
    // Create island owner and friend
    const owner = generateTestData.player();
    const friend = generateTestData.player();

    const ownerResponse = await env.request
      .post('/api/auth/register')
      .send({
        username: owner.username,
        email: owner.email,
        password: owner.password
      })
      .expect(201);

    const friendResponse = await env.request
      .post('/api/auth/register')
      .send({
        username: friend.username,
        email: friend.email,
        password: friend.password
      })
      .expect(201);

    const ownerToken = ownerResponse.body.token;
    const friendToken = friendResponse.body.token;
    const ownerPlayer = ownerResponse.body.player;
    const friendPlayer = friendResponse.body.player;

    // 1. Owner adds friend to friends list
    const addFriendResponse = await env.request
      .post('/api/social/friends/add')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        friendId: friendPlayer.id
      })
      .expect(200);

    expect(addFriendResponse.body.status).toBe('pending');

    // 2. Friend accepts friend request
    const acceptFriendResponse = await env.request
      .post(`/api/social/friends/accept/${ownerPlayer.id}`)
      .set('Authorization', `Bearer ${friendToken}`)
      .expect(200);

    expect(acceptFriendResponse.body.status).toBe('accepted');

    // 3. Owner enables co-op on their island
    const enableCoopResponse = await env.request
      .post(`/api/islands/${ownerPlayer.islandId}/coop/enable`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        allowedPlayers: [friendPlayer.id],
        permissions: ['build', 'gather', 'interact']
      })
      .expect(200);

    expect(enableCoopResponse.body.coopEnabled).toBe(true);

    // 4. Friend visits owner's island
    const visitResponse = await env.request
      .post(`/api/islands/${ownerPlayer.islandId}/visit`)
      .set('Authorization', `Bearer ${friendToken}`)
      .expect(200);

    expect(visitResponse.body.success).toBe(true);
    expect(visitResponse.body.currentLocation).toBe(ownerPlayer.islandId);

    // 5. Friend builds on owner's island
    const buildResponse = await env.request
      .post('/api/world/place-block')
      .set('Authorization', `Bearer ${friendToken}`)
      .send({
        islandId: ownerPlayer.islandId,
        position: { x: 20, y: 1, z: 20 },
        blockType: 'stone'
      })
      .expect(200);

    expect(buildResponse.body.success).toBe(true);

    // 6. Both players work together on shared project
    const projectResponse = await env.request
      .post(`/api/islands/${ownerPlayer.islandId}/projects/create`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        name: 'Castle Build',
        description: 'Building a castle together',
        collaborators: [friendPlayer.id],
        requiredResources: {
          stone: 1000,
          wood: 500
        }
      })
      .expect(201);

    const project = projectResponse.body;
    expect(project.id).toBeDefined();

    // 7. Friend contributes resources to project
    const contributeResponse = await env.request
      .post(`/api/islands/projects/${project.id}/contribute`)
      .set('Authorization', `Bearer ${friendToken}`)
      .send({
        resources: {
          stone: 100,
          wood: 50
        }
      })
      .expect(200);

    expect(contributeResponse.body.totalContributed.stone).toBe(100);

    // 8. Check project progress
    const progressResponse = await env.request
      .get(`/api/islands/projects/${project.id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);

    const projectProgress = progressResponse.body;
    expect(projectProgress.progress.stone).toBe(0.1); // 100/1000
    expect(projectProgress.contributors.length).toBe(1);
  });
});