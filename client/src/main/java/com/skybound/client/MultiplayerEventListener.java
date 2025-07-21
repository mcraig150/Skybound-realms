package com.skybound.client;

/**
 * Interface for handling multiplayer events from the WebSocket connection.
 */
public interface MultiplayerEventListener {
    
    /**
     * Called when the WebSocket connection is established.
     */
    void onConnected();
    
    /**
     * Called when the WebSocket connection is lost.
     * @param reason the reason for disconnection
     */
    void onDisconnected(String reason);
    
    /**
     * Called when a WebSocket error occurs.
     * @param error the error message
     */
    void onError(String error);
    
    /**
     * Called when a new player joins the game.
     * @param player the player who joined
     */
    void onPlayerJoined(RemotePlayer player);
    
    /**
     * Called when a player leaves the game.
     * @param player the player who left
     */
    void onPlayerLeft(RemotePlayer player);
    
    /**
     * Called when a player moves to a new position.
     * @param player the player who moved
     */
    void onPlayerMoved(RemotePlayer player);
    
    /**
     * Called when a block is changed by another player.
     * @param position the position of the block change
     * @param blockType the new block type (or "air" for removal)
     */
    void onBlockChanged(Vector3f position, String blockType);
    
    /**
     * Called when a chat message is received.
     * @param message the chat message
     */
    void onChatMessage(ChatMessage message);
}