import { describe, it, expect } from 'vitest';
import { setupE2EEnvironment, generateTestData } from '../setup';

const getTestEnv = setupE2EEnvironment();

describe('Economy and Trading E2E Workflow', () => {
  it('should complete full market trading workflow', async () => {
    const env = getTestEnv();
    
    // Create two players for trading
    const seller = generateTestData.player();
    const buyer = generateTestData.player();

    // Register both players
    const sellerResponse = await env.request
      .post('/api/auth/register')
      .send({
        username: seller.username,
        email: seller.email,
        password: seller.password
      })
      .expect(201);

    const buyerResponse = await env.request
      .post('/api/auth/register')
      .send({
        username: buyer.username,
        email: buyer.email,
        password: buyer.password
      })
      .expect(201);

    const sellerToken = sellerResponse.body.token;
    const buyerToken = buyerResponse.body.token;
    const sellerPlayer = sellerResponse.body.player;
    const buyerPlayer = buyerResponse.body.player;

    // 1. Seller gathers resources to sell
    const gatherResponse = await env.request
      .post('/api/resources/gather')
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({
        resourceType: 'wood',
        location: { x: 10, y: 0, z: 10 },
        islandId: sellerPlayer.islandId
      })
      .expect(200);

    expect(gatherResponse.body.resourcesGained).toBeDefined();
    const woodGained = gatherResponse.body.resourcesGained.find((r: any) => r.type === 'wood');
    expect(woodGained.quantity).toBeGreaterThan(0);

    // 2. Seller lists item on market
    const listingResponse = await env.request
      .post('/api/market/list')
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({
        itemId: woodGained.id,
        quantity: 10,
        pricePerUnit: 5,
        duration: 24 // hours
      })
      .expect(201);

    const listing = listingResponse.body;
    expect(listing.id).toBeDefined();
    expect(listing.sellerId).toBe(sellerPlayer.id);
    expect(listing.totalPrice).toBe(50); // 10 * 5

    // 3. Buyer searches market
    const searchResponse = await env.request
      .get('/api/market/search')
      .set('Authorization', `Bearer ${buyerToken}`)
      .query({
        itemType: 'wood',
        maxPrice: 10
      })
      .expect(200);

    const listings = searchResponse.body;
    expect(listings.length).toBeGreaterThan(0);
    const foundListing = listings.find((l: any) => l.id === listing.id);
    expect(foundListing).toBeDefined();

    // 4. Buyer purchases item
    const purchaseResponse = await env.request
      .post(`/api/market/purchase/${listing.id}`)
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({
        quantity: 5 // Buy only 5 out of 10
      })
      .expect(200);

    expect(purchaseResponse.body.success).toBe(true);
    expect(purchaseResponse.body.totalCost).toBe(25); // 5 * 5

    // 5. Verify buyer inventory updated
    const buyerInventoryResponse = await env.request
      .get(`/api/players/${buyerPlayer.id}/inventory`)
      .set('Authorization', `Bearer ${buyerToken}`)
      .expect(200);

    const buyerInventory = buyerInventoryResponse.body;
    const purchasedWood = buyerInventory.find((item: any) => item.type === 'wood');
    expect(purchasedWood).toBeDefined();
    expect(purchasedWood.quantity).toBe(5);

    // 6. Verify seller currency updated
    const sellerResponse2 = await env.request
      .get(`/api/players/${sellerPlayer.id}`)
      .set('Authorization', `Bearer ${sellerToken}`)
      .expect(200);

    const updatedSeller = sellerResponse2.body;
    expect(updatedSeller.currency.coins).toBe(1025); // 1000 + 25 (minus market fee)

    // 7. Verify listing quantity updated
    const updatedListingResponse = await env.request
      .get(`/api/market/listing/${listing.id}`)
      .set('Authorization', `Bearer ${sellerToken}`)
      .expect(200);

    const updatedListing = updatedListingResponse.body;
    expect(updatedListing.quantity).toBe(5); // 10 - 5 purchased

    // 8. Test market price tracking
    const priceHistoryResponse = await env.request
      .get('/api/market/price-history/wood')
      .expect(200);

    const priceHistory = priceHistoryResponse.body;
    expect(priceHistory.length).toBeGreaterThan(0);
    expect(priceHistory[0].price).toBe(5);
    expect(priceHistory[0].quantity).toBe(5);
  });

  it('should handle player-to-player direct trading', async () => {
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

    // 1. Player 1 initiates trade
    const tradeInitResponse = await env.request
      .post('/api/trading/initiate')
      .set('Authorization', `Bearer ${token1}`)
      .send({
        targetPlayerId: player2.id
      })
      .expect(201);

    const tradeSession = tradeInitResponse.body;
    expect(tradeSession.id).toBeDefined();
    expect(tradeSession.initiatorId).toBe(player1.id);
    expect(tradeSession.targetId).toBe(player2.id);

    // 2. Player 2 accepts trade
    const acceptResponse = await env.request
      .post(`/api/trading/${tradeSession.id}/accept`)
      .set('Authorization', `Bearer ${token2}`)
      .expect(200);

    expect(acceptResponse.body.status).toBe('active');

    // 3. Both players add items to trade
    await env.request
      .post(`/api/trading/${tradeSession.id}/add-item`)
      .set('Authorization', `Bearer ${token1}`)
      .send({
        itemId: 'test-item-1',
        quantity: 1
      })
      .expect(200);

    await env.request
      .post(`/api/trading/${tradeSession.id}/add-currency`)
      .set('Authorization', `Bearer ${token2}`)
      .send({
        amount: 100
      })
      .expect(200);

    // 4. Both players confirm trade
    await env.request
      .post(`/api/trading/${tradeSession.id}/confirm`)
      .set('Authorization', `Bearer ${token1}`)
      .expect(200);

    const finalizeResponse = await env.request
      .post(`/api/trading/${tradeSession.id}/confirm`)
      .set('Authorization', `Bearer ${token2}`)
      .expect(200);

    expect(finalizeResponse.body.status).toBe('completed');

    // 5. Verify trade completion and item transfer
    const tradeHistoryResponse = await env.request
      .get(`/api/trading/history/${player1.id}`)
      .set('Authorization', `Bearer ${token1}`)
      .expect(200);

    const history = tradeHistoryResponse.body;
    expect(history.length).toBe(1);
    expect(history[0].status).toBe('completed');
  });

  it('should handle auction house bidding system', async () => {
    const env = getTestEnv();
    
    // Create seller and two bidders
    const seller = generateTestData.player();
    const bidder1 = generateTestData.player();
    const bidder2 = generateTestData.player();

    // Register all players
    const sellerResponse = await env.request
      .post('/api/auth/register')
      .send({
        username: seller.username,
        email: seller.email,
        password: seller.password
      })
      .expect(201);

    const bidder1Response = await env.request
      .post('/api/auth/register')
      .send({
        username: bidder1.username,
        email: bidder1.email,
        password: bidder1.password
      })
      .expect(201);

    const bidder2Response = await env.request
      .post('/api/auth/register')
      .send({
        username: bidder2.username,
        email: bidder2.email,
        password: bidder2.password
      })
      .expect(201);

    const sellerToken = sellerResponse.body.token;
    const bidder1Token = bidder1Response.body.token;
    const bidder2Token = bidder2Response.body.token;

    // 1. Seller creates auction
    const auctionResponse = await env.request
      .post('/api/auction/create')
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({
        itemId: 'rare-sword',
        startingBid: 100,
        duration: 1 // 1 hour
      })
      .expect(201);

    const auction = auctionResponse.body;
    expect(auction.id).toBeDefined();
    expect(auction.currentBid).toBe(100);

    // 2. First bidder places bid
    const bid1Response = await env.request
      .post(`/api/auction/${auction.id}/bid`)
      .set('Authorization', `Bearer ${bidder1Token}`)
      .send({
        amount: 150
      })
      .expect(200);

    expect(bid1Response.body.currentBid).toBe(150);

    // 3. Second bidder outbids
    const bid2Response = await env.request
      .post(`/api/auction/${auction.id}/bid`)
      .set('Authorization', `Bearer ${bidder2Token}`)
      .send({
        amount: 200
      })
      .expect(200);

    expect(bid2Response.body.currentBid).toBe(200);

    // 4. Verify auction state
    const auctionStateResponse = await env.request
      .get(`/api/auction/${auction.id}`)
      .expect(200);

    const auctionState = auctionStateResponse.body;
    expect(auctionState.currentBid).toBe(200);
    expect(auctionState.highestBidderId).toBe(bidder2Response.body.player.id);
  });
});