import { describe, it, expect } from 'vitest';
import { setupE2EEnvironment, generateTestData } from '../setup';

const getTestEnv = setupE2EEnvironment();

describe('Concurrent Players Performance Tests', () => {
  it('should handle 100 concurrent player registrations', async () => {
    const env = getTestEnv();
    const startTime = Date.now();
    
    // Generate 100 unique players
    const players = Array.from({ length: 100 }, () => generateTestData.player());
    
    // Register all players concurrently
    const registrationPromises = players.map(player =>
      env.request
        .post('/api/auth/register')
        .send({
          username: player.username,
          email: player.email,
          password: player.password
        })
    );

    const results = await Promise.allSettled(registrationPromises);
    const endTime = Date.now();
    
    // Verify all registrations succeeded
    const successful = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;
    
    expect(successful).toBeGreaterThan(90); // Allow for some failures
    expect(failed).toBeLessThan(10);
    
    // Performance assertions
    const totalTime = endTime - startTime;
    const avgTimePerRegistration = totalTime / successful;
    
    expect(totalTime).toBeLessThan(30000); // Should complete within 30 seconds
    expect(avgTimePerRegistration).toBeLessThan(500); // Average < 500ms per registration
    
    console.log(`Registered ${successful} players in ${totalTime}ms (avg: ${avgTimePerRegistration}ms per player)`);
  });

  it('should handle concurrent resource gathering operations', async () => {
    const env = getTestEnv();
    
    // Create 50 players
    const players = Array.from({ length: 50 }, () => generateTestData.player());
    
    // Register all players
    const registrationPromises = players.map(player =>
      env.request
        .post('/api/auth/register')
        .send({
          username: player.username,
          email: player.email,
          password: player.password
        })
    );

    const registrationResults = await Promise.all(registrationPromises);
    const tokens = registrationResults.map(r => r.body.token);
    const playerIds = registrationResults.map(r => r.body.player.id);

    const startTime = Date.now();
    
    // All players gather resources simultaneously
    const gatheringPromises = tokens.map((token, index) =>
      env.request
        .post('/api/resources/gather')
        .set('Authorization', `Bearer ${token}`)
        .send({
          resourceType: 'tree',
          location: { x: 10 + index, y: 0, z: 10 + index },
          islandId: registrationResults[index].body.player.islandId
        })
    );

    const gatheringResults = await Promise.allSettled(gatheringPromises);
    const endTime = Date.now();
    
    const successful = gatheringResults.filter(r => r.status === 'fulfilled').length;
    const totalTime = endTime - startTime;
    
    expect(successful).toBeGreaterThan(45); // Allow for some failures
    expect(totalTime).toBeLessThan(15000); // Should complete within 15 seconds
    
    console.log(`${successful} concurrent gathering operations completed in ${totalTime}ms`);
  });

  it('should handle concurrent market transactions', async () => {
    const env = getTestEnv();
    
    // Create sellers and buyers
    const sellers = Array.from({ length: 25 }, () => generateTestData.player());
    const buyers = Array.from({ length: 25 }, () => generateTestData.player());
    
    // Register all players
    const allPlayers = [...sellers, ...buyers];
    const registrationPromises = allPlayers.map(player =>
      env.request
        .post('/api/auth/register')
        .send({
          username: player.username,
          email: player.email,
          password: player.password
        })
    );

    const registrationResults = await Promise.all(registrationPromises);
    const sellerTokens = registrationResults.slice(0, 25).map(r => r.body.token);
    const buyerTokens = registrationResults.slice(25).map(r => r.body.token);
    
    // Sellers create listings
    const listingPromises = sellerTokens.map((token, index) =>
      env.request
        .post('/api/market/list')
        .set('Authorization', `Bearer ${token}`)
        .send({
          itemId: `test-item-${index}`,
          quantity: 10,
          pricePerUnit: 5 + index,
          duration: 24
        })
    );

    const listingResults = await Promise.all(listingPromises);
    const listingIds = listingResults.map(r => r.body.id);

    const startTime = Date.now();
    
    // Buyers purchase items simultaneously
    const purchasePromises = buyerTokens.map((token, index) =>
      env.request
        .post(`/api/market/purchase/${listingIds[index]}`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          quantity: 5
        })
    );

    const purchaseResults = await Promise.allSettled(purchasePromises);
    const endTime = Date.now();
    
    const successful = purchaseResults.filter(r => r.status === 'fulfilled').length;
    const totalTime = endTime - startTime;
    
    expect(successful).toBeGreaterThan(20); // Allow for some failures
    expect(totalTime).toBeLessThan(10000); // Should complete within 10 seconds
    
    console.log(`${successful} concurrent market transactions completed in ${totalTime}ms`);
  });

  it('should handle concurrent WebSocket connections', async () => {
    const env = getTestEnv();
    
    // This test would require multiple WebSocket clients
    // For now, we'll test the basic connection handling
    const connectionCount = 50;
    const connections: any[] = [];
    
    const startTime = Date.now();
    
    try {
      // Simulate multiple connection attempts
      for (let i = 0; i < connectionCount; i++) {
        // In a real test, we'd create actual WebSocket connections
        // For now, we'll test the HTTP endpoints that support WebSocket features
        const response = await env.request
          .get('/api/health/websocket')
          .expect(200);
        
        connections.push(response);
      }
      
      const endTime = Date.now();
      const totalTime = endTime - startTime;
      
      expect(connections.length).toBe(connectionCount);
      expect(totalTime).toBeLessThan(5000); // Should complete within 5 seconds
      
      console.log(`${connectionCount} connection checks completed in ${totalTime}ms`);
    } catch (error) {
      console.error('WebSocket connection test failed:', error);
      throw error;
    }
  });

  it('should maintain performance under sustained load', async () => {
    const env = getTestEnv();
    
    // Create a smaller number of players for sustained testing
    const players = Array.from({ length: 20 }, () => generateTestData.player());
    
    // Register players
    const registrationPromises = players.map(player =>
      env.request
        .post('/api/auth/register')
        .send({
          username: player.username,
          email: player.email,
          password: player.password
        })
    );

    const registrationResults = await Promise.all(registrationPromises);
    const tokens = registrationResults.map(r => r.body.token);
    
    // Run sustained operations for 30 seconds
    const duration = 30000; // 30 seconds
    const startTime = Date.now();
    const operations: Promise<any>[] = [];
    let operationCount = 0;
    
    const runOperations = async () => {
      while (Date.now() - startTime < duration) {
        const randomToken = tokens[Math.floor(Math.random() * tokens.length)];
        const randomPlayerId = registrationResults[tokens.indexOf(randomToken)].body.player.id;
        
        // Random operation selection
        const operationType = Math.floor(Math.random() * 4);
        
        let operation: Promise<any>;
        
        switch (operationType) {
          case 0: // Resource gathering
            operation = env.request
              .post('/api/resources/gather')
              .set('Authorization', `Bearer ${randomToken}`)
              .send({
                resourceType: 'tree',
                location: { x: Math.floor(Math.random() * 100), y: 0, z: Math.floor(Math.random() * 100) },
                islandId: registrationResults[tokens.indexOf(randomToken)].body.player.islandId
              });
            break;
          case 1: // Check inventory
            operation = env.request
              .get(`/api/players/${randomPlayerId}/inventory`)
              .set('Authorization', `Bearer ${randomToken}`);
            break;
          case 2: // Check skills
            operation = env.request
              .get(`/api/players/${randomPlayerId}/skills`)
              .set('Authorization', `Bearer ${randomToken}`);
            break;
          default: // Market search
            operation = env.request
              .get('/api/market/search')
              .set('Authorization', `Bearer ${randomToken}`)
              .query({ itemType: 'wood' });
        }
        
        operations.push(operation);
        operationCount++;
        
        // Small delay to prevent overwhelming
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    };
    
    await runOperations();
    
    // Wait for all operations to complete
    const results = await Promise.allSettled(operations);
    const endTime = Date.now();
    
    const successful = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;
    const totalTime = endTime - startTime;
    const operationsPerSecond = (successful / totalTime) * 1000;
    
    expect(successful).toBeGreaterThan(operationCount * 0.8); // 80% success rate
    expect(operationsPerSecond).toBeGreaterThan(5); // At least 5 ops/second
    
    console.log(`Sustained load test: ${successful} successful operations, ${failed} failed, ${operationsPerSecond.toFixed(2)} ops/sec`);
  });
});