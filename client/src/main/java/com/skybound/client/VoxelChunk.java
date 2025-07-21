package com.skybound.client;

import java.util.List;
import java.util.Map;
import java.util.HashMap;

/**
 * Represents a voxel chunk loaded from the server.
 */
public class VoxelChunk {
    
    public static class Position {
        public int x, y, z;
        
        public Position() {}
        
        public Position(int x, int y, int z) {
            this.x = x;
            this.y = y;
            this.z = z;
        }
        
        @Override
        public String toString() {
            return String.format("(%d, %d, %d)", x, y, z);
        }
    }
    
    public static class Size {
        public int width, height, depth;
        
        public Size() {}
        
        public Size(int width, int height, int depth) {
            this.width = width;
            this.height = height;
            this.depth = depth;
        }
    }
    
    public static class Block {
        public Position position;
        public String blockType;
        public Map<String, Object> metadata;
        
        public Block() {
            this.metadata = new HashMap<>();
        }
        
        public Block(Position position, String blockType) {
            this.position = position;
            this.blockType = blockType;
            this.metadata = new HashMap<>();
        }
    }
    
    private String chunkId;
    private Position position;
    private Size size;
    private List<Block> blocks;
    private String lastModified;
    
    // Default constructor for JSON deserialization
    public VoxelChunk() {}
    
    public VoxelChunk(String chunkId, Position position, Size size, List<Block> blocks) {
        this.chunkId = chunkId;
        this.position = position;
        this.size = size;
        this.blocks = blocks;
    }
    
    // Getters and setters
    public String getChunkId() { return chunkId; }
    public void setChunkId(String chunkId) { this.chunkId = chunkId; }
    
    public Position getPosition() { return position; }
    public void setPosition(Position position) { this.position = position; }
    
    public Size getSize() { return size; }
    public void setSize(Size size) { this.size = size; }
    
    public List<Block> getBlocks() { return blocks; }
    public void setBlocks(List<Block> blocks) { this.blocks = blocks; }
    
    public String getLastModified() { return lastModified; }
    public void setLastModified(String lastModified) { this.lastModified = lastModified; }
    
    /**
     * Get the color for a specific block type.
     */
    public static Vector3f getBlockColor(String blockType) {
        switch (blockType.toLowerCase()) {
            case "stone":
                return new Vector3f(0.5f, 0.5f, 0.5f); // Gray
            case "dirt":
                return new Vector3f(0.6f, 0.4f, 0.2f); // Brown
            case "grass":
                return new Vector3f(0.2f, 0.8f, 0.2f); // Green
            case "wood":
                return new Vector3f(0.6f, 0.3f, 0.1f); // Dark brown
            case "cobblestone":
                return new Vector3f(0.4f, 0.4f, 0.4f); // Dark gray
            case "gold":
                return new Vector3f(1.0f, 0.8f, 0.0f); // Gold
            default:
                return new Vector3f(1.0f, 1.0f, 1.0f); // White for unknown blocks
        }
    }
    
    @Override
    public String toString() {
        return String.format("VoxelChunk{id='%s', position=%s, size=%dx%dx%d, blocks=%d}", 
            chunkId, position, size.width, size.height, size.depth, blocks != null ? blocks.size() : 0);
    }
}