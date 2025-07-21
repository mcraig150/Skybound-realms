# WebSocket API Documentation

## Overview

The Skybound Realms WebSocket system provides real-time communication for multiplayer features including chat, trading, world updates, and player interactions.

## Connection

### Authentication
All WebSocket connections require JWT authentication:

```javascript
const socket = io('http://localhost:3001', {
  auth: {
    token: 'your-jwt-token-here'
  }
});
```

### Connection Events

#### `connected`
Emitted when successfully connected and authenticated.
```javascript
socket.on('connected', (data) => {
  console.log(data.message); // "Connected to Skybound Realms"
  console.log(data.playerId); // Your player ID
  console.log(data.timestamp); // Connection timestamp
});
```

#### `connect_error`
Emitted when connection fails.
```javascript
socket.on('connect_error', (error) => {
  console.error('Connection failed:', error.message);
});
```

## Chat System

### Joining Channels
```javascript
socket.emit('chat:join_channel', { channel: 'global' });

socket.on('chat:joined_channel', (data) => {
  console.log(`Joined channel: ${data.channel}`);
});
```

### Sending Messages
```javascript
socket.emit('chat:send', {
  channel: 'global',
  message: 'Hello, world!'
});
```

### Receiving Messages
```javascript
socket.on('chat:message', (data) => {
  console.log(`${data.username}: ${data.message}`);
  console.log(`Channel: ${data.channel}`);
  console.log(`Time: ${data.timestamp}`);
});
```

### Channel Events
```javascript
// Player joined channel
socket.on('chat:player_joined', (data) => {
  console.log(`${data.username} joined ${data.channel}`);
});

// Player left channel
socket.on('chat:player_left', (data) => {
  console.log(`${data.username} left ${data.channel}`);
});
```

### Leaving Channels
```javascript
socket.emit('chat:leave_channel', { channel: 'global' });

socket.on('chat:left_channel', (data) => {
  console.log(`Left channel: ${data.channel}`);
});
```

## World System

### Joining Zones
```javascript
socket.emit('world:join_zone', { zoneId: 'hub-city' });

socket.on('zone:joined', (data) => {
  console.log(`Joined zone: ${data.zoneId}`);
});
```

### Zone Events
```javascript
// Player joined zone
socket.on('zone:player_joined', (data) => {
  console.log(`${data.username} joined zone ${data.zoneId}`);
});

// Player left zone
socket.on('zone:player_left', (data) => {
  console.log(`${data.username} left zone ${data.zoneId}`);
});
```

### Block Changes
```javascript
socket.emit('world:block_change', {
  position: { x: 10, y: 5, z: 10 },
  blockType: 1,
  action: 'place' // or 'break'
});

// Receive block changes from other players
socket.on('world:block_changed', (data) => {
  console.log(`Block changed at ${data.position.x}, ${data.position.y}, ${data.position.z}`);
  console.log(`Action: ${data.action}, Block: ${data.blockType}`);
  console.log(`Changed by: ${data.playerId}`);
});
```

### Leaving Zones
```javascript
socket.emit('world:leave_zone', { zoneId: 'hub-city' });

socket.on('zone:left', (data) => {
  console.log(`Left zone: ${data.zoneId}`);
});
```

## Trading System

### Initiating Trades
```javascript
socket.emit('trade:initiate', { targetPlayerId: 'player-id-here' });

socket.on('trade:initiated', (trade) => {
  console.log('Trade initiated:', trade);
});
```

### Receiving Trade Requests
```javascript
socket.on('trade:request', (data) => {
  console.log(`Trade request from ${data.initiatorUsername}`);
  console.log(`Trade ID: ${data.tradeId}`);
});
```

### Responding to Trades
```javascript
socket.emit('trade:respond', {
  tradeId: 'trade-id-here',
  accepted: true // or false
});

socket.on('trade:response', (data) => {
  console.log(`Trade ${data.accepted ? 'accepted' : 'declined'}`);
});
```

### Updating Trade Offers
```javascript
socket.emit('trade:update', {
  tradeId: 'trade-id-here',
  items: [
    { itemId: 'sword-1', quantity: 1 },
    { itemId: 'gold', quantity: 100 }
  ]
});

socket.on('trade:updated', (data) => {
  console.log('Trade offer updated:', data.trade);
});
```

### Confirming Trades
```javascript
socket.emit('trade:confirm', { tradeId: 'trade-id-here' });

socket.on('trade:confirmed', (data) => {
  console.log('Trade confirmed and completed:', data.trade);
});
```

### Cancelling Trades
```javascript
socket.emit('trade:cancel', { tradeId: 'trade-id-here' });

socket.on('trade:cancelled', (data) => {
  console.log(`Trade cancelled: ${data.reason}`);
});
```

## Player Updates

### Position Updates
```javascript
socket.emit('player:update_position', {
  position: { x: 100, y: 50, z: 200 }
});

// Receive position updates from other players
socket.on('player:position_updated', (data) => {
  console.log(`${data.playerId} moved to ${data.position.x}, ${data.position.y}, ${data.position.z}`);
});
```

### Status Updates
```javascript
socket.emit('player:update_status', {
  status: {
    health: 80,
    mana: 60,
    level: 25
  }
});

// Receive status updates from other players
socket.on('player:status_updated', (data) => {
  console.log(`${data.username} status:`, data.status);
});
```

## System Events

### Heartbeat
```javascript
socket.emit('ping');

socket.on('pong', () => {
  console.log('Server responded to ping');
});
```

### System Messages
```javascript
socket.on('system:message', (data) => {
  console.log(`System ${data.level}: ${data.message}`);
});
```

### Maintenance Notices
```javascript
socket.on('system:maintenance', (data) => {
  console.log(`Maintenance: ${data.message}`);
  if (data.scheduledTime) {
    console.log(`Scheduled for: ${data.scheduledTime}`);
  }
});
```

### Kicks and Bans
```javascript
socket.on('system:kicked', (data) => {
  console.log(`You were kicked: ${data.reason}`);
});

socket.on('system:banned', (data) => {
  console.log(`You were banned: ${data.reason}`);
  if (data.duration) {
    console.log(`Duration: ${data.duration} minutes`);
  }
});
```

## Error Handling

### General Errors
```javascript
socket.on('error', (data) => {
  console.error('WebSocket error:', data.message);
});
```

### Connection Issues
```javascript
socket.on('disconnect', (reason) => {
  console.log('Disconnected:', reason);
});

socket.on('reconnect', (attemptNumber) => {
  console.log(`Reconnected after ${attemptNumber} attempts`);
});

socket.on('reconnect_error', (error) => {
  console.error('Reconnection failed:', error);
});
```

## Best Practices

### Connection Management
- Always handle connection errors gracefully
- Implement automatic reconnection logic
- Store authentication tokens securely
- Clean up event listeners when disconnecting

### Message Handling
- Validate all incoming data
- Implement rate limiting for message sending
- Handle network latency appropriately
- Cache important data locally

### Performance
- Only join channels/zones you need
- Unsubscribe from events when not needed
- Batch position updates to avoid spam
- Use heartbeat to detect connection issues

### Security
- Never trust client-side data
- Validate all actions server-side
- Implement proper authentication
- Rate limit all user actions

## Example Client Implementation

```javascript
class GameClient {
  constructor(serverUrl, authToken) {
    this.socket = io(serverUrl, {
      auth: { token: authToken }
    });
    
    this.setupEventHandlers();
  }
  
  setupEventHandlers() {
    this.socket.on('connected', (data) => {
      console.log('Connected to game server');
      this.playerId = data.playerId;
    });
    
    this.socket.on('chat:message', (data) => {
      this.displayChatMessage(data);
    });
    
    this.socket.on('world:block_changed', (data) => {
      this.updateWorldBlock(data);
    });
    
    this.socket.on('error', (data) => {
      this.handleError(data);
    });
  }
  
  joinZone(zoneId) {
    this.socket.emit('world:join_zone', { zoneId });
  }
  
  sendChatMessage(channel, message) {
    this.socket.emit('chat:send', { channel, message });
  }
  
  updatePosition(position) {
    this.socket.emit('player:update_position', { position });
  }
  
  disconnect() {
    this.socket.disconnect();
  }
}
```

This WebSocket API provides a comprehensive real-time communication system for the Skybound Realms MMORPG, enabling seamless multiplayer interactions across all game systems.