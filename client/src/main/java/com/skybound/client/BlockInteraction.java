package com.skybound.client;

import java.util.ArrayList;
import java.util.List;

/**
 * Handles block placement and breaking interactions.
 */
public class BlockInteraction {
    
    public enum BlockType {
        DIRT("dirt"),
        STONE("stone"),
        WOOD("wood");
        
        private final String name;
        
        BlockType(String name) {
            this.name = name;
        }
        
        public String getName() {
            return name;
        }
        
        @Override
        public String toString() {
            return name;
        }
    }
    
    private BlockType selectedBlockType = BlockType.DIRT;
    private ApiClient apiClient;
    private VoxelRenderer voxelRenderer;
    private MultiplayerManager multiplayerManager;
    
    public BlockInteraction(ApiClient apiClient, VoxelRenderer voxelRenderer) {
        this.apiClient = apiClient;
        this.voxelRenderer = voxelRenderer;
    }
    
    public void setMultiplayerManager(MultiplayerManager multiplayerManager) {
        this.multiplayerManager = multiplayerManager;
    }
    
    /**
     * Handles left mouse click - break block
     */
    public void handleLeftClick(Camera camera) {
        Vector3f hitPosition = raycastToBlock(camera);
        if (hitPosition != null) {
            breakBlock(hitPosition);
        }
    }
    
    /**
     * Handles right mouse click - place block
     */
    public void handleRightClick(Camera camera) {
        Vector3f hitPosition = raycastToBlock(camera);
        if (hitPosition != null) {
            // Place block adjacent to the hit position
            Vector3f placePosition = getAdjacentPosition(hitPosition, camera);
            if (placePosition != null) {
                placeBlock(placePosition, selectedBlockType);
            }
        }
    }
    
    /**
     * Cycles to the next block type
     */
    public void cycleBlockType() {
        BlockType[] types = BlockType.values();
        int currentIndex = selectedBlockType.ordinal();
        selectedBlockType = types[(currentIndex + 1) % types.length];
        System.out.println("Selected block type: " + selectedBlockType);
    }
    
    /**
     * Gets the currently selected block type
     */
    public BlockType getSelectedBlockType() {
        return selectedBlockType;
    }
    
    /**
     * Simple raycast to find the block the player is looking at
     */
    private Vector3f raycastToBlock(Camera camera) {
        Vector3f rayStart = camera.getPosition();
        Vector3f rayDirection = camera.getFront();
        float maxDistance = 10.0f; // Maximum reach distance
        float stepSize = 0.1f;
        
        VoxelChunk currentChunk = voxelRenderer.getCurrentChunk();
        if (currentChunk == null || currentChunk.getBlocks() == null) {
            return null;
        }
        
        // Step along the ray and check for block intersections
        for (float distance = 0; distance < maxDistance; distance += stepSize) {
            Vector3f currentPos = rayStart.add(rayDirection.multiply(distance));
            
            // Round to block coordinates
            int blockX = Math.round(currentPos.x);
            int blockY = Math.round(currentPos.y);
            int blockZ = Math.round(currentPos.z);
            
            // Check if there's a block at this position
            for (VoxelChunk.Block block : currentChunk.getBlocks()) {
                if (block.position.x == blockX && 
                    block.position.y == blockY && 
                    block.position.z == blockZ) {
                    return new Vector3f(blockX, blockY, blockZ);
                }
            }
        }
        
        return null;
    }
    
    /**
     * Gets an adjacent position for block placement
     */
    private Vector3f getAdjacentPosition(Vector3f hitPosition, Camera camera) {
        Vector3f rayDirection = camera.getFront();
        
        // Simple approach: place block one unit back along the ray direction
        Vector3f placePos = hitPosition.subtract(rayDirection.normalize());
        
        // Round to block coordinates
        int blockX = Math.round(placePos.x);
        int blockY = Math.round(placePos.y);
        int blockZ = Math.round(placePos.z);
        
        return new Vector3f(blockX, blockY, blockZ);
    }
    
    /**
     * Breaks a block at the specified position
     */
    private void breakBlock(Vector3f position) {
        VoxelChunk currentChunk = voxelRenderer.getCurrentChunk();
        if (currentChunk == null || currentChunk.getBlocks() == null) {
            return;
        }
        
        // Find and remove the block locally
        List<VoxelChunk.Block> blocks = new ArrayList<>(currentChunk.getBlocks());
        boolean blockRemoved = blocks.removeIf(block -> 
            block.position.x == (int)position.x && 
            block.position.y == (int)position.y && 
            block.position.z == (int)position.z);
        
        if (blockRemoved) {
            // Update local display immediately
            currentChunk.setBlocks(blocks);
            voxelRenderer.loadChunk(currentChunk);
            
            // Send change to server
            sendBlockChangeToServer(position, null); // null means remove block
            
            System.out.println("Broke block at " + position);
        }
    }
    
    /**
     * Places a block at the specified position
     */
    private void placeBlock(Vector3f position, BlockType blockType) {
        VoxelChunk currentChunk = voxelRenderer.getCurrentChunk();
        if (currentChunk == null || currentChunk.getBlocks() == null) {
            return;
        }
        
        // Check if there's already a block at this position
        for (VoxelChunk.Block existingBlock : currentChunk.getBlocks()) {
            if (existingBlock.position.x == (int)position.x && 
                existingBlock.position.y == (int)position.y && 
                existingBlock.position.z == (int)position.z) {
                System.out.println("Cannot place block - position already occupied");
                return;
            }
        }
        
        // Create new block
        VoxelChunk.Block newBlock = new VoxelChunk.Block();
        newBlock.position = new VoxelChunk.Position((int)position.x, (int)position.y, (int)position.z);
        newBlock.blockType = blockType.getName();
        
        // Add to local chunk
        List<VoxelChunk.Block> blocks = new ArrayList<>(currentChunk.getBlocks());
        blocks.add(newBlock);
        currentChunk.setBlocks(blocks);
        
        // Update local display immediately
        voxelRenderer.loadChunk(currentChunk);
        
        // Send change to server
        sendBlockChangeToServer(position, blockType.getName());
        
        System.out.println("Placed " + blockType + " block at " + position);
    }
    
    /**
     * Sends block change to server
     */
    private void sendBlockChangeToServer(Vector3f position, String blockType) {
        // Send the change to the server
        boolean success = apiClient.sendBlockChange(position, blockType);
        
        if (!success) {
            System.err.println("Failed to send block change to server - change may not persist");
        }
        
        // Also send to other players via WebSocket
        if (multiplayerManager != null) {
            multiplayerManager.sendBlockChange(position, blockType != null ? blockType : "air");
        }
    }
}