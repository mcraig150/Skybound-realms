package com.skybound.client;

/**
 * Represents a remote player in the multiplayer game.
 * Stores player information and position for rendering.
 */
public class RemotePlayer {
    
    private final String playerId;
    private final String name;
    private Vector3f position;
    private long lastUpdate;
    
    // Visual properties for rendering
    private float[] color = {1.0f, 0.0f, 0.0f}; // Default red color
    
    public RemotePlayer(String playerId, String name, Vector3f position) {
        this.playerId = playerId;
        this.name = name;
        this.position = new Vector3f(position.x, position.y, position.z);
        this.lastUpdate = System.currentTimeMillis();
        
        // Generate a simple color based on player ID hash
        generatePlayerColor();
    }
    
    /**
     * Generates a unique color for this player based on their ID.
     */
    private void generatePlayerColor() {
        int hash = playerId.hashCode();
        
        // Use hash to generate RGB values
        float r = ((hash & 0xFF0000) >> 16) / 255.0f;
        float g = ((hash & 0x00FF00) >> 8) / 255.0f;
        float b = (hash & 0x0000FF) / 255.0f;
        
        // Ensure colors are bright enough to be visible
        r = Math.max(r, 0.3f);
        g = Math.max(g, 0.3f);
        b = Math.max(b, 0.3f);
        
        this.color = new float[]{r, g, b};
    }
    
    /**
     * Updates the player's position.
     */
    public void setPosition(Vector3f newPosition) {
        this.position.x = newPosition.x;
        this.position.y = newPosition.y;
        this.position.z = newPosition.z;
        this.lastUpdate = System.currentTimeMillis();
    }
    
    /**
     * Gets the player's unique ID.
     */
    public String getPlayerId() {
        return playerId;
    }
    
    /**
     * Gets the player's display name.
     */
    public String getName() {
        return name;
    }
    
    /**
     * Gets the player's current position.
     */
    public Vector3f getPosition() {
        return new Vector3f(position.x, position.y, position.z);
    }
    
    /**
     * Gets the player's color for rendering.
     */
    public float[] getColor() {
        return color.clone();
    }
    
    /**
     * Gets the timestamp of the last position update.
     */
    public long getLastUpdate() {
        return lastUpdate;
    }
    
    /**
     * Checks if this player's data is stale (hasn't been updated recently).
     */
    public boolean isStale(long maxAgeMs) {
        return System.currentTimeMillis() - lastUpdate > maxAgeMs;
    }
    
    @Override
    public String toString() {
        return String.format("RemotePlayer{id='%s', name='%s', position=%s}", 
                           playerId, name, position);
    }
    
    @Override
    public boolean equals(Object obj) {
        if (this == obj) return true;
        if (obj == null || getClass() != obj.getClass()) return false;
        RemotePlayer that = (RemotePlayer) obj;
        return playerId.equals(that.playerId);
    }
    
    @Override
    public int hashCode() {
        return playerId.hashCode();
    }
}