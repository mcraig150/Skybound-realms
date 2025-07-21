package com.skybound.client;

import java.text.SimpleDateFormat;
import java.util.Date;

/**
 * Represents a chat message in the multiplayer game.
 */
public class ChatMessage {
    
    private final String playerId;
    private final String playerName;
    private final String message;
    private final long timestamp;
    
    private static final SimpleDateFormat TIME_FORMAT = new SimpleDateFormat("HH:mm:ss");
    
    public ChatMessage(String playerId, String playerName, String message, long timestamp) {
        this.playerId = playerId;
        this.playerName = playerName;
        this.message = message;
        this.timestamp = timestamp;
    }
    
    /**
     * Gets the ID of the player who sent the message.
     */
    public String getPlayerId() {
        return playerId;
    }
    
    /**
     * Gets the name of the player who sent the message.
     */
    public String getPlayerName() {
        return playerName;
    }
    
    /**
     * Gets the message content.
     */
    public String getMessage() {
        return message;
    }
    
    /**
     * Gets the timestamp when the message was sent.
     */
    public long getTimestamp() {
        return timestamp;
    }
    
    /**
     * Gets a formatted time string for display.
     */
    public String getFormattedTime() {
        return TIME_FORMAT.format(new Date(timestamp));
    }
    
    /**
     * Gets a formatted message for display in chat.
     */
    public String getFormattedMessage() {
        return String.format("[%s] %s: %s", getFormattedTime(), playerName, message);
    }
    
    /**
     * Checks if this message is older than the specified age in milliseconds.
     */
    public boolean isOlderThan(long maxAgeMs) {
        return System.currentTimeMillis() - timestamp > maxAgeMs;
    }
    
    @Override
    public String toString() {
        return getFormattedMessage();
    }
    
    @Override
    public boolean equals(Object obj) {
        if (this == obj) return true;
        if (obj == null || getClass() != obj.getClass()) return false;
        ChatMessage that = (ChatMessage) obj;
        return timestamp == that.timestamp && 
               playerId.equals(that.playerId) && 
               message.equals(that.message);
    }
    
    @Override
    public int hashCode() {
        return Long.hashCode(timestamp) ^ playerId.hashCode() ^ message.hashCode();
    }
}