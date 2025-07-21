package com.skybound.client;

import java.net.URI;
import java.util.List;
import java.util.ArrayList;
import java.util.concurrent.CopyOnWriteArrayList;

/**
 * Manages multiplayer functionality including WebSocket connection,
 * remote player tracking, and chat system.
 */
public class MultiplayerManager implements MultiplayerEventListener {
    
    private GameWebSocketClient webSocketClient;
    private final List<RemotePlayer> remotePlayers = new CopyOnWriteArrayList<>();
    private final List<ChatMessage> chatMessages = new CopyOnWriteArrayList<>();
    
    // Configuration
    private static final int MAX_CHAT_MESSAGES = 50;
    private static final long PLAYER_TIMEOUT_MS = 30000; // 30 seconds
    
    // Connection status
    private boolean isConnected = false;
    private String connectionStatus = "Not connected";
    
    public MultiplayerManager() {
        // Initialize with empty state
    }
    
    /**
     * Connects to the WebSocket server.
     * @param serverUrl the WebSocket server URL (e.g., "ws://localhost:3000/ws")
     */
    public void connect(String serverUrl) {
        try {
            URI serverUri = new URI(serverUrl);
            webSocketClient = new GameWebSocketClient(serverUri);
            webSocketClient.setEventListener(this);
            
            System.out.println("Connecting to WebSocket server: " + serverUrl);
            webSocketClient.connect();
            
        } catch (Exception e) {
            System.err.println("Failed to connect to WebSocket server: " + e.getMessage());
            connectionStatus = "Connection failed: " + e.getMessage();
        }
    }
    
    /**
     * Disconnects from the WebSocket server.
     */
    public void disconnect() {
        if (webSocketClient != null && webSocketClient.isConnected()) {
            webSocketClient.close();
        }
        
        // Clear multiplayer state
        remotePlayers.clear();
        isConnected = false;
        connectionStatus = "Disconnected";
    }
    
    /**
     * Sends a block change to other players.
     */
    public void sendBlockChange(Vector3f position, String blockType) {
        if (webSocketClient != null && webSocketClient.isConnected()) {
            webSocketClient.sendBlockChange(position, blockType);
        }
    }
    
    /**
     * Sends a chat message to other players.
     */
    public void sendChatMessage(String message) {
        if (webSocketClient != null && webSocketClient.isConnected()) {
            webSocketClient.sendChatMessage(message);
        }
    }
    
    /**
     * Updates the multiplayer manager (should be called each frame).
     */
    public void update() {
        // Remove stale players
        remotePlayers.removeIf(player -> player.isStale(PLAYER_TIMEOUT_MS));
        
        // Limit chat message history
        while (chatMessages.size() > MAX_CHAT_MESSAGES) {
            chatMessages.remove(0);
        }
        
        // Update connection status
        if (webSocketClient != null) {
            connectionStatus = webSocketClient.getConnectionStatus();
        }
    }
    
    /**
     * Gets all remote players currently in the game.
     */
    public List<RemotePlayer> getRemotePlayers() {
        return new ArrayList<>(remotePlayers);
    }
    
    /**
     * Gets recent chat messages for display.
     * @param maxMessages maximum number of messages to return
     */
    public List<ChatMessage> getRecentChatMessages(int maxMessages) {
        int startIndex = Math.max(0, chatMessages.size() - maxMessages);
        return new ArrayList<>(chatMessages.subList(startIndex, chatMessages.size()));
    }
    
    /**
     * Gets the current connection status.
     */
    public String getConnectionStatus() {
        return connectionStatus;
    }
    
    /**
     * Checks if connected to the multiplayer server.
     */
    public boolean isConnected() {
        return isConnected && webSocketClient != null && webSocketClient.isConnected();
    }
    
    // MultiplayerEventListener implementation
    
    @Override
    public void onConnected() {
        isConnected = true;
        connectionStatus = "Connected";
        System.out.println("Multiplayer: Connected to server");
    }
    
    @Override
    public void onDisconnected(String reason) {
        isConnected = false;
        connectionStatus = "Disconnected: " + reason;
        remotePlayers.clear();
        System.out.println("Multiplayer: Disconnected from server - " + reason);
    }
    
    @Override
    public void onError(String error) {
        connectionStatus = "Error: " + error;
        System.err.println("Multiplayer error: " + error);
    }
    
    @Override
    public void onPlayerJoined(RemotePlayer player) {
        remotePlayers.add(player);
        System.out.println("Multiplayer: Player joined - " + player.getName());
        
        // Add system message to chat
        ChatMessage systemMessage = new ChatMessage(
            "system", "System", 
            player.getName() + " joined the game", 
            System.currentTimeMillis()
        );
        chatMessages.add(systemMessage);
    }
    
    @Override
    public void onPlayerLeft(RemotePlayer player) {
        remotePlayers.remove(player);
        System.out.println("Multiplayer: Player left - " + player.getName());
        
        // Add system message to chat
        ChatMessage systemMessage = new ChatMessage(
            "system", "System", 
            player.getName() + " left the game", 
            System.currentTimeMillis()
        );
        chatMessages.add(systemMessage);
    }
    
    @Override
    public void onPlayerMoved(RemotePlayer player) {
        // Player position is already updated in the RemotePlayer object
        // No additional action needed here
    }
    
    @Override
    public void onBlockChanged(Vector3f position, String blockType) {
        System.out.println("Multiplayer: Block changed at " + position + " to " + blockType);
        // The renderer will handle the visual update
    }
    
    @Override
    public void onChatMessage(ChatMessage message) {
        chatMessages.add(message);
        System.out.println("Chat: " + message.getFormattedMessage());
    }
    
    /**
     * Cleanup resources when shutting down.
     */
    public void cleanup() {
        disconnect();
    }
}