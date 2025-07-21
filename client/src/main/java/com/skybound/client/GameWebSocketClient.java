package com.skybound.client;

import org.java_websocket.client.WebSocketClient;
import org.java_websocket.handshake.ServerHandshake;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.JsonNode;

import java.net.URI;
import java.util.concurrent.ConcurrentHashMap;
import java.util.Map;
import java.util.List;
import java.util.ArrayList;

/**
 * WebSocket client for real-time multiplayer communication.
 * Handles player join/leave events, block changes, and other real-time updates.
 */
public class GameWebSocketClient extends org.java_websocket.client.WebSocketClient {
    
    private final ObjectMapper objectMapper;
    private boolean isConnected = false;
    private String lastError = null;
    
    // Store other players in the game
    private final Map<String, RemotePlayer> remotePlayers = new ConcurrentHashMap<>();
    
    // Event listeners
    private MultiplayerEventListener eventListener;
    
    public GameWebSocketClient(URI serverUri) {
        super(serverUri);
        this.objectMapper = new ObjectMapper();
    }
    
    public void setEventListener(MultiplayerEventListener listener) {
        this.eventListener = listener;
    }
    
    @Override
    public void onOpen(ServerHandshake handshake) {
        isConnected = true;
        lastError = null;
        System.out.println("WebSocket connected to server");
        
        // Send initial player join message
        sendPlayerJoin();
        
        if (eventListener != null) {
            eventListener.onConnected();
        }
    }
    
    @Override
    public void onMessage(String message) {
        try {
            JsonNode jsonNode = objectMapper.readTree(message);
            String eventType = jsonNode.get("type").asText();
            
            switch (eventType) {
                case "player_joined":
                    handlePlayerJoined(jsonNode);
                    break;
                case "player_left":
                    handlePlayerLeft(jsonNode);
                    break;
                case "player_moved":
                    handlePlayerMoved(jsonNode);
                    break;
                case "block_changed":
                    handleBlockChanged(jsonNode);
                    break;
                case "chat_message":
                    handleChatMessage(jsonNode);
                    break;
                default:
                    System.out.println("Unknown WebSocket event: " + eventType);
                    break;
            }
        } catch (Exception e) {
            System.err.println("Error processing WebSocket message: " + e.getMessage());
            e.printStackTrace();
        }
    }
    
    @Override
    public void onClose(int code, String reason, boolean remote) {
        isConnected = false;
        lastError = "Connection closed: " + reason + " (code: " + code + ")";
        System.out.println("WebSocket connection closed: " + reason);
        
        // Clear remote players
        remotePlayers.clear();
        
        if (eventListener != null) {
            eventListener.onDisconnected(reason);
        }
    }
    
    @Override
    public void onError(Exception ex) {
        isConnected = false;
        lastError = "WebSocket error: " + ex.getMessage();
        System.err.println("WebSocket error: " + ex.getMessage());
        ex.printStackTrace();
        
        if (eventListener != null) {
            eventListener.onError(ex.getMessage());
        }
    }
    
    /**
     * Sends a player join message to the server.
     */
    private void sendPlayerJoin() {
        try {
            String message = objectMapper.writeValueAsString(Map.of(
                "type", "player_join",
                "playerId", "player_" + System.currentTimeMillis(), // Simple player ID for now
                "playerName", "TestPlayer",
                "position", Map.of("x", 0, "y", 10, "z", 0)
            ));
            send(message);
        } catch (Exception e) {
            System.err.println("Error sending player join message: " + e.getMessage());
        }
    }
    
    /**
     * Sends a block change event to other players.
     */
    public void sendBlockChange(Vector3f position, String blockType) {
        if (!isConnected) return;
        
        try {
            Map<String, Object> message = Map.of(
                "type", "block_change",
                "position", Map.of("x", (int)position.x, "y", (int)position.y, "z", (int)position.z),
                "blockType", blockType != null ? blockType : "air"
            );
            send(objectMapper.writeValueAsString(message));
        } catch (Exception e) {
            System.err.println("Error sending block change: " + e.getMessage());
        }
    }
    
    /**
     * Sends a chat message to other players.
     */
    public void sendChatMessage(String message) {
        if (!isConnected) return;
        
        try {
            Map<String, Object> chatMessage = Map.of(
                "type", "chat_message",
                "playerId", "player_" + System.currentTimeMillis(),
                "playerName", "TestPlayer",
                "message", message,
                "timestamp", System.currentTimeMillis()
            );
            send(objectMapper.writeValueAsString(chatMessage));
        } catch (Exception e) {
            System.err.println("Error sending chat message: " + e.getMessage());
        }
    }
    
    /**
     * Handles player joined events.
     */
    private void handlePlayerJoined(JsonNode data) {
        try {
            String playerId = data.get("playerId").asText();
            String playerName = data.get("playerName").asText();
            JsonNode positionNode = data.get("position");
            
            Vector3f position = new Vector3f(
                (float) positionNode.get("x").asDouble(),
                (float) positionNode.get("y").asDouble(),
                (float) positionNode.get("z").asDouble()
            );
            
            RemotePlayer player = new RemotePlayer(playerId, playerName, position);
            remotePlayers.put(playerId, player);
            
            System.out.println("Player joined: " + playerName + " at " + position);
            
            if (eventListener != null) {
                eventListener.onPlayerJoined(player);
            }
        } catch (Exception e) {
            System.err.println("Error handling player joined event: " + e.getMessage());
        }
    }
    
    /**
     * Handles player left events.
     */
    private void handlePlayerLeft(JsonNode data) {
        try {
            String playerId = data.get("playerId").asText();
            RemotePlayer player = remotePlayers.remove(playerId);
            
            if (player != null) {
                System.out.println("Player left: " + player.getName());
                
                if (eventListener != null) {
                    eventListener.onPlayerLeft(player);
                }
            }
        } catch (Exception e) {
            System.err.println("Error handling player left event: " + e.getMessage());
        }
    }
    
    /**
     * Handles player movement events.
     */
    private void handlePlayerMoved(JsonNode data) {
        try {
            String playerId = data.get("playerId").asText();
            JsonNode positionNode = data.get("position");
            
            Vector3f newPosition = new Vector3f(
                (float) positionNode.get("x").asDouble(),
                (float) positionNode.get("y").asDouble(),
                (float) positionNode.get("z").asDouble()
            );
            
            RemotePlayer player = remotePlayers.get(playerId);
            if (player != null) {
                player.setPosition(newPosition);
                
                if (eventListener != null) {
                    eventListener.onPlayerMoved(player);
                }
            }
        } catch (Exception e) {
            System.err.println("Error handling player moved event: " + e.getMessage());
        }
    }
    
    /**
     * Handles block change events from other players.
     */
    private void handleBlockChanged(JsonNode data) {
        try {
            JsonNode positionNode = data.get("position");
            String blockType = data.get("blockType").asText();
            
            Vector3f position = new Vector3f(
                (float) positionNode.get("x").asDouble(),
                (float) positionNode.get("y").asDouble(),
                (float) positionNode.get("z").asDouble()
            );
            
            System.out.println("Block changed by other player: " + blockType + " at " + position);
            
            if (eventListener != null) {
                eventListener.onBlockChanged(position, blockType);
            }
        } catch (Exception e) {
            System.err.println("Error handling block changed event: " + e.getMessage());
        }
    }
    
    /**
     * Handles chat message events.
     */
    private void handleChatMessage(JsonNode data) {
        try {
            String playerId = data.get("playerId").asText();
            String playerName = data.get("playerName").asText();
            String message = data.get("message").asText();
            long timestamp = data.get("timestamp").asLong();
            
            ChatMessage chatMessage = new ChatMessage(playerId, playerName, message, timestamp);
            
            System.out.println("Chat: " + playerName + ": " + message);
            
            if (eventListener != null) {
                eventListener.onChatMessage(chatMessage);
            }
        } catch (Exception e) {
            System.err.println("Error handling chat message event: " + e.getMessage());
        }
    }
    
    /**
     * Gets all currently connected remote players.
     */
    public List<RemotePlayer> getRemotePlayers() {
        return new ArrayList<>(remotePlayers.values());
    }
    
    /**
     * Gets a specific remote player by ID.
     */
    public RemotePlayer getRemotePlayer(String playerId) {
        return remotePlayers.get(playerId);
    }
    
    /**
     * Checks if the WebSocket is connected.
     */
    public boolean isConnected() {
        return isConnected && !isClosed();
    }
    
    /**
     * Gets the last error message.
     */
    public String getLastError() {
        return lastError;
    }
    
    /**
     * Gets connection status string.
     */
    public String getConnectionStatus() {
        if (isConnected()) {
            return "WebSocket Connected (" + remotePlayers.size() + " players)";
        } else if (lastError != null) {
            return "WebSocket Error: " + lastError;
        } else {
            return "WebSocket Disconnected";
        }
    }
}