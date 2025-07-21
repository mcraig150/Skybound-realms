import { describe, it, expect } from 'vitest';
import { setupE2EEnvironment, generateTestData } from '../setup';

const getTestEnv = setupE2EEnvironment();

describe('Player Progression E2E Workflow', () => {
  it('should complete full player progression workflow', async () => {
    const env = getTestEnv();
    
    // 1. Create new player account
    const playerData = generateTestData.player();
    const registerResponse = await env.request
      .post('/api/auth/register')
      .send({
        username: playerData.username,
        email: playerData.email,
        password: playerData.password
      })
      .expect(201);

    const { token, player } = registerResponse.body;
    expect(player.id).toBeDefined();
    expect(player.username).toBe(playerData.username);

    // 2. Login and verify authentication
    const loginResponse = await env.request
      .post('/api/auth/login')
      .send({
        username: playerData.username,
        password: playerData.password
      })
      .expect(200);

    expect(loginResponse.body.token).toBeDefined();
    const authToken = loginResponse.body.token;

    // 3. Load player island (should be auto-created)
    const islandResponse = await env.request
      .get(`/api/islands/player/${player.id}`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    const island = islandResponse.body;
    expect(island.ownerId).toBe(player.id);
    expect(island.expansionLevel).toBe(1);

    // 4. Gather resources to gain experience
    const gatherResponse = await env.request
      .post('/api/resources/gather')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        resourceType: 'tree',
        location: { x: 10, y: 0, z: 10 },
        islandId: island.id
      })
      .expect(200);

    expect(gatherResponse.body.resourcesGained).toBeDefined();
    expect(gatherResponse.body.experienceGained).toBeGreaterThan(0);

    // 5. Check skill progression
    const skillsResponse = await env.request
      .get(`/api/players/${player.id}/skills`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    const skills = skillsResponse.body;
    expect(skills.farming.experience).toBeGreaterThan(0);

    // 6. Craft items using gathered resources
    const craftResponse = await env.request
      .post('/api/crafting/craft')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        recipe: 'wooden_pickaxe',
        quantity: 1
      })
      .expect(200);

    expect(craftResponse.body.itemCrafted).toBeDefined();
    expect(craftResponse.body.itemCrafted.name).toBe('Wooden Pickaxe');

    // 7. Verify inventory updated
    const inventoryResponse = await env.request
      .get(`/api/players/${player.id}/inventory`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    const inventory = inventoryResponse.body;
    const pickaxe = inventory.find((item: any) => item.name === 'Wooden Pickaxe');
    expect(pickaxe).toBeDefined();
    expect(pickaxe.quantity).toBe(1);

    // 8. Deploy minion for automation
    const minionResponse = await env.request
      .post('/api/minions/deploy')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        minionType: 'farming',
        location: { x: 5, y: 0, z: 5 },
        islandId: island.id
      })
      .expect(200);

    expect(minionResponse.body.minion).toBeDefined();
    expect(minionResponse.body.minion.type).toBe('farming');

    // 9. Simulate time passage and collect minion resources
    await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second

    const collectResponse = await env.request
      .post(`/api/minions/${minionResponse.body.minion.id}/collect`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    expect(collectResponse.body.resourcesCollected).toBeDefined();

    // 10. Verify complete workflow success
    const finalPlayerResponse = await env.request
      .get(`/api/players/${player.id}`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    const finalPlayer = finalPlayerResponse.body;
    expect(finalPlayer.skills.farming.experience).toBeGreaterThan(0);
    expect(finalPlayer.inventory.length).toBeGreaterThan(0);
  });

  it('should handle skill level up and unlock perks', async () => {
    const env = getTestEnv();
    
    // Create player with high experience
    const playerData = generateTestData.player({
      skills: {
        mining: { level: 9, experience: 4500 }, // Close to level 10
        farming: { level: 1, experience: 0 },
        combat: { level: 1, experience: 0 }
      }
    });

    const registerResponse = await env.request
      .post('/api/auth/register')
      .send({
        username: playerData.username,
        email: playerData.email,
        password: playerData.password
      })
      .expect(201);

    const authToken = registerResponse.body.token;
    const player = registerResponse.body.player;

    // Gain enough experience to level up
    const gatherResponse = await env.request
      .post('/api/resources/gather')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        resourceType: 'stone',
        location: { x: 15, y: 0, z: 15 },
        islandId: player.islandId
      })
      .expect(200);

    expect(gatherResponse.body.levelUp).toBe(true);
    expect(gatherResponse.body.newLevel).toBe(10);
    expect(gatherResponse.body.perksUnlocked).toBeDefined();
    expect(gatherResponse.body.perksUnlocked.length).toBeGreaterThan(0);
  });
});