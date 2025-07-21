package com.skybound.client;

import java.util.ArrayList;
import java.util.List;

import static org.lwjgl.opengl.GL15.*;
import static org.lwjgl.opengl.GL20.*;
import static org.lwjgl.opengl.GL30.*;

/**
 * Renders voxel chunks with different colored blocks and remote players.
 */
public class VoxelRenderer {
    
    private int vao; // Vertex Array Object
    private int vbo; // Vertex Buffer Object
    private int vertexCount;
    
    // Remote player rendering
    private int playerVao;
    private int playerVbo;
    private int playerVertexCount;
    
    // Cube vertices template (positions only, colors will be added per instance)
    private static final float[] CUBE_VERTICES = {
        // Front face
        -0.5f, -0.5f,  0.5f,
         0.5f, -0.5f,  0.5f,
         0.5f,  0.5f,  0.5f,
         0.5f,  0.5f,  0.5f,
        -0.5f,  0.5f,  0.5f,
        -0.5f, -0.5f,  0.5f,
        
        // Back face
        -0.5f, -0.5f, -0.5f,
         0.5f, -0.5f, -0.5f,
         0.5f,  0.5f, -0.5f,
         0.5f,  0.5f, -0.5f,
        -0.5f,  0.5f, -0.5f,
        -0.5f, -0.5f, -0.5f,
        
        // Left face
        -0.5f,  0.5f,  0.5f,
        -0.5f,  0.5f, -0.5f,
        -0.5f, -0.5f, -0.5f,
        -0.5f, -0.5f, -0.5f,
        -0.5f, -0.5f,  0.5f,
        -0.5f,  0.5f,  0.5f,
        
        // Right face
         0.5f,  0.5f,  0.5f,
         0.5f,  0.5f, -0.5f,
         0.5f, -0.5f, -0.5f,
         0.5f, -0.5f, -0.5f,
         0.5f, -0.5f,  0.5f,
         0.5f,  0.5f,  0.5f,
        
        // Bottom face
        -0.5f, -0.5f, -0.5f,
         0.5f, -0.5f, -0.5f,
         0.5f, -0.5f,  0.5f,
         0.5f, -0.5f,  0.5f,
        -0.5f, -0.5f,  0.5f,
        -0.5f, -0.5f, -0.5f,
        
        // Top face
        -0.5f,  0.5f, -0.5f,
         0.5f,  0.5f, -0.5f,
         0.5f,  0.5f,  0.5f,
         0.5f,  0.5f,  0.5f,
        -0.5f,  0.5f,  0.5f,
        -0.5f,  0.5f, -0.5f
    };
    
    private VoxelChunk currentChunk;
    
    public VoxelRenderer() {
        initializeBuffers();
    }
    
    private void initializeBuffers() {
        // Initialize world blocks VAO/VBO
        vao = glGenVertexArrays();
        glBindVertexArray(vao);
        
        vbo = glGenBuffers();
        glBindBuffer(GL_ARRAY_BUFFER, vbo);
        
        // Position attribute (location = 0)
        glVertexAttribPointer(0, 3, GL_FLOAT, false, 6 * Float.BYTES, 0);
        glEnableVertexAttribArray(0);
        
        // Color attribute (location = 1)
        glVertexAttribPointer(1, 3, GL_FLOAT, false, 6 * Float.BYTES, 3 * Float.BYTES);
        glEnableVertexAttribArray(1);
        
        // Unbind
        glBindBuffer(GL_ARRAY_BUFFER, 0);
        glBindVertexArray(0);
        
        // Initialize remote player VAO/VBO
        playerVao = glGenVertexArrays();
        glBindVertexArray(playerVao);
        
        playerVbo = glGenBuffers();
        glBindBuffer(GL_ARRAY_BUFFER, playerVbo);
        
        // Position attribute (location = 0)
        glVertexAttribPointer(0, 3, GL_FLOAT, false, 6 * Float.BYTES, 0);
        glEnableVertexAttribArray(0);
        
        // Color attribute (location = 1)
        glVertexAttribPointer(1, 3, GL_FLOAT, false, 6 * Float.BYTES, 3 * Float.BYTES);
        glEnableVertexAttribArray(1);
        
        // Unbind
        glBindBuffer(GL_ARRAY_BUFFER, 0);
        glBindVertexArray(0);
    }
    
    public void loadChunk(VoxelChunk chunk) {
        this.currentChunk = chunk;
        
        if (chunk == null || chunk.getBlocks() == null) {
            vertexCount = 0;
            return;
        }
        
        // Build vertex data for all blocks in the chunk
        List<Float> vertices = new ArrayList<>();
        
        for (VoxelChunk.Block block : chunk.getBlocks()) {
            Vector3f color = VoxelChunk.getBlockColor(block.blockType);
            Vector3f position = new Vector3f(block.position.x, block.position.y, block.position.z);
            
            // Add all cube vertices for this block with its color and position
            for (int i = 0; i < CUBE_VERTICES.length; i += 3) {
                // Position (offset by block position)
                vertices.add(CUBE_VERTICES[i] + position.x);
                vertices.add(CUBE_VERTICES[i + 1] + position.y);
                vertices.add(CUBE_VERTICES[i + 2] + position.z);
                
                // Color
                vertices.add(color.x);
                vertices.add(color.y);
                vertices.add(color.z);
            }
        }
        
        // Convert to array
        float[] vertexArray = new float[vertices.size()];
        for (int i = 0; i < vertices.size(); i++) {
            vertexArray[i] = vertices.get(i);
        }
        
        vertexCount = vertexArray.length / 6; // 6 floats per vertex (3 pos + 3 color)
        
        // Upload to GPU
        glBindBuffer(GL_ARRAY_BUFFER, vbo);
        glBufferData(GL_ARRAY_BUFFER, vertexArray, GL_STATIC_DRAW);
        glBindBuffer(GL_ARRAY_BUFFER, 0);
        
        System.out.println("Loaded chunk: " + chunk.toString());
        System.out.println("Generated " + vertexCount + " vertices for " + chunk.getBlocks().size() + " blocks");
    }
    
    public void render() {
        // Render world blocks
        if (vertexCount > 0) {
            glBindVertexArray(vao);
            glDrawArrays(GL_TRIANGLES, 0, vertexCount);
            glBindVertexArray(0);
        }
        
        // Render remote players
        if (playerVertexCount > 0) {
            glBindVertexArray(playerVao);
            glDrawArrays(GL_TRIANGLES, 0, playerVertexCount);
            glBindVertexArray(0);
        }
    }
    
    /**
     * Updates the remote player rendering data.
     * @param remotePlayers list of remote players to render
     */
    public void updateRemotePlayers(List<RemotePlayer> remotePlayers) {
        if (remotePlayers == null || remotePlayers.isEmpty()) {
            playerVertexCount = 0;
            return;
        }
        
        // Build vertex data for all remote players
        List<Float> vertices = new ArrayList<>();
        
        for (RemotePlayer player : remotePlayers) {
            Vector3f position = player.getPosition();
            float[] color = player.getColor();
            
            // Make players slightly larger than blocks (1.2x scale) and offset upward
            float scale = 1.2f;
            float yOffset = 0.6f; // Raise players above ground level
            
            // Add all cube vertices for this player with their color and position
            for (int i = 0; i < CUBE_VERTICES.length; i += 3) {
                // Position (scaled, offset by player position, and raised up)
                vertices.add(CUBE_VERTICES[i] * scale + position.x);
                vertices.add(CUBE_VERTICES[i + 1] * scale + position.y + yOffset);
                vertices.add(CUBE_VERTICES[i + 2] * scale + position.z);
                
                // Player color
                vertices.add(color[0]);
                vertices.add(color[1]);
                vertices.add(color[2]);
            }
        }
        
        // Convert to array
        float[] vertexArray = new float[vertices.size()];
        for (int i = 0; i < vertices.size(); i++) {
            vertexArray[i] = vertices.get(i);
        }
        
        playerVertexCount = vertexArray.length / 6; // 6 floats per vertex (3 pos + 3 color)
        
        // Upload to GPU
        glBindBuffer(GL_ARRAY_BUFFER, playerVbo);
        glBufferData(GL_ARRAY_BUFFER, vertexArray, GL_DYNAMIC_DRAW); // Use DYNAMIC_DRAW for frequently updated data
        glBindBuffer(GL_ARRAY_BUFFER, 0);
        
        System.out.println("Updated remote players: " + remotePlayers.size() + " players rendered");
    }
    
    public VoxelChunk getCurrentChunk() {
        return currentChunk;
    }
    
    public void cleanup() {
        glDeleteBuffers(vbo);
        glDeleteVertexArrays(vao);
        glDeleteBuffers(playerVbo);
        glDeleteVertexArrays(playerVao);
    }
}