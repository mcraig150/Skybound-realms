package com.skybound.client;

import static org.lwjgl.opengl.GL11.*;

/**
 * 3D renderer for the game world.
 */
public class Renderer {
    
    private Shader shader;
    private VoxelRenderer voxelRenderer;
    private Camera camera;
    private UIOverlay uiOverlay;
    
    // Projection matrix
    private Matrix4f projectionMatrix;
    private int windowWidth = 1024;
    private int windowHeight = 768;
    
    // Lighting
    private Vector3f lightDirection = new Vector3f(-0.2f, -1.0f, -0.3f).normalize();
    private Vector3f lightColor = new Vector3f(1.0f, 1.0f, 1.0f);
    
    public void init() throws Exception {
        // Enable depth testing
        glEnable(GL_DEPTH_TEST);
        
        // Create shader program
        shader = new Shader();
        shader.createVertexShader(getVertexShaderSource());
        shader.createFragmentShader(getFragmentShaderSource());
        shader.link();
        
        // Create voxel renderer
        voxelRenderer = new VoxelRenderer();
        
        // Create camera
        camera = new Camera(new Vector3f(0.0f, 0.0f, 3.0f));
        
        // Create UI overlay
        uiOverlay = new UIOverlay(windowWidth, windowHeight);
        uiOverlay.init();
        
        // Set up projection matrix
        updateProjectionMatrix();
        
        System.out.println("3D Renderer initialized successfully!");
    }
    
    public void render() {
        render(null);
    }
    
    public void render(MultiplayerManager multiplayerManager) {
        // Clear buffers
        glClear(GL_COLOR_BUFFER_BIT | GL_DEPTH_BUFFER_BIT);
        
        // Update remote players if multiplayer manager is available
        if (multiplayerManager != null && multiplayerManager.isConnected()) {
            voxelRenderer.updateRemotePlayers(multiplayerManager.getRemotePlayers());
        }
        
        // Use shader program
        shader.bind();
        
        // Set uniforms
        shader.setUniform("projection", projectionMatrix);
        shader.setUniform("view", camera.getViewMatrix());
        
        // Model matrix (identity for now - cube at origin)
        Matrix4f modelMatrix = new Matrix4f();
        shader.setUniform("model", modelMatrix);
        
        // Lighting uniforms
        shader.setUniform("lightDirection", lightDirection);
        shader.setUniform("lightColor", lightColor);
        shader.setUniform("viewPos", camera.getPosition());
        
        // Render voxel chunk and remote players
        voxelRenderer.render();
        
        shader.unbind();
        
        // Render UI overlay directly here (within the same OpenGL context)
        renderUIOverlay();
    }
    
    private void renderUIOverlay() {
        // Create a simple crosshair and UI elements using modern OpenGL with shaders
        renderModernCrosshair();
        renderUIText();
    }
    
    private void renderModernCrosshair() {
        // Create a simple crosshair using normalized device coordinates
        // This works with OpenGL 3.3 core profile
        
        // Disable depth testing for UI
        glDisable(GL_DEPTH_TEST);
        glEnable(GL_BLEND);
        glBlendFunc(GL_SRC_ALPHA, GL_ONE_MINUS_SRC_ALPHA);
        
        // Use the existing shader for UI rendering
        shader.bind();
        
        // Create orthographic projection matrix for UI (NDC coordinates)
        Matrix4f uiProjection = new Matrix4f().ortho(-1.0f, 1.0f, -1.0f, 1.0f, -1.0f, 1.0f);
        
        // Set UI uniforms
        shader.setUniform("projection", uiProjection);
        shader.setUniform("view", new Matrix4f()); // Identity matrix for UI
        shader.setUniform("model", new Matrix4f()); // Identity matrix for UI
        shader.setUniform("lightDirection", new Vector3f(0.0f, 0.0f, -1.0f)); // Simple lighting for UI
        shader.setUniform("lightColor", new Vector3f(1.0f, 1.0f, 1.0f));
        shader.setUniform("viewPos", new Vector3f(0.0f, 0.0f, 1.0f));
        
        // Create crosshair in normalized device coordinates (center of screen is 0,0)
        float size = 0.02f; // Small size in NDC
        
        // Create crosshair vertices (2 lines: horizontal and vertical)
        float[] crosshairVertices = {
            // Horizontal line (position + white color)
            -size, 0.0f, 0.0f,  1.0f, 1.0f, 1.0f,
             size, 0.0f, 0.0f,  1.0f, 1.0f, 1.0f,
            // Vertical line
             0.0f, -size, 0.0f,  1.0f, 1.0f, 1.0f,
             0.0f,  size, 0.0f,  1.0f, 1.0f, 1.0f
        };
        
        // Create temporary VAO and VBO for crosshair
        int crosshairVAO = org.lwjgl.opengl.GL30.glGenVertexArrays();
        int crosshairVBO = org.lwjgl.opengl.GL15.glGenBuffers();
        
        org.lwjgl.opengl.GL30.glBindVertexArray(crosshairVAO);
        org.lwjgl.opengl.GL15.glBindBuffer(org.lwjgl.opengl.GL15.GL_ARRAY_BUFFER, crosshairVBO);
        org.lwjgl.opengl.GL15.glBufferData(org.lwjgl.opengl.GL15.GL_ARRAY_BUFFER, crosshairVertices, org.lwjgl.opengl.GL15.GL_STATIC_DRAW);
        
        // Position attribute
        org.lwjgl.opengl.GL20.glVertexAttribPointer(0, 3, org.lwjgl.opengl.GL11.GL_FLOAT, false, 6 * Float.BYTES, 0);
        org.lwjgl.opengl.GL20.glEnableVertexAttribArray(0);
        
        // Color attribute
        org.lwjgl.opengl.GL20.glVertexAttribPointer(1, 3, org.lwjgl.opengl.GL11.GL_FLOAT, false, 6 * Float.BYTES, 3 * Float.BYTES);
        org.lwjgl.opengl.GL20.glEnableVertexAttribArray(1);
        
        // Draw crosshair
        glLineWidth(2.0f);
        org.lwjgl.opengl.GL11.glDrawArrays(org.lwjgl.opengl.GL11.GL_LINES, 0, 4);
        
        // Cleanup
        org.lwjgl.opengl.GL30.glBindVertexArray(0);
        org.lwjgl.opengl.GL15.glDeleteBuffers(crosshairVBO);
        org.lwjgl.opengl.GL30.glDeleteVertexArrays(crosshairVAO);
        
        shader.unbind();
        
        // Re-enable depth testing
        glDisable(GL_BLEND);
        glEnable(GL_DEPTH_TEST);
    }
    
    private void renderUIText() {
        // Render simple UI elements like status bars using colored rectangles
        renderStatusBars();
    }
    
    private void renderStatusBars() {
        // Create simple colored rectangles for UI elements (health bar, inventory slots, etc.)
        // This uses the same shader approach as the crosshair
        
        // Disable depth testing for UI
        glDisable(GL_DEPTH_TEST);
        glEnable(GL_BLEND);
        glBlendFunc(GL_SRC_ALPHA, GL_ONE_MINUS_SRC_ALPHA);
        
        shader.bind();
        
        // Create orthographic projection matrix for UI
        Matrix4f uiProjection = new Matrix4f().ortho(-1.0f, 1.0f, -1.0f, 1.0f, -1.0f, 1.0f);
        
        // Set UI uniforms
        shader.setUniform("projection", uiProjection);
        shader.setUniform("view", new Matrix4f());
        shader.setUniform("model", new Matrix4f());
        shader.setUniform("lightDirection", new Vector3f(0.0f, 0.0f, -1.0f));
        shader.setUniform("lightColor", new Vector3f(1.0f, 1.0f, 1.0f));
        shader.setUniform("viewPos", new Vector3f(0.0f, 0.0f, 1.0f));
        
        // Create simple UI elements
        renderInventorySlots();
        renderConnectionStatus();
        
        // Get FPS from UIOverlay and render it
        if (uiOverlay != null) {
            renderFPSDisplay(uiOverlay.getCurrentFps());
        }
        
        shader.unbind();
        
        // Re-enable depth testing
        glDisable(GL_BLEND);
        glEnable(GL_DEPTH_TEST);
    }
    
    private void renderInventorySlots() {
        // Render 6 simple inventory slots at the bottom of the screen
        float slotSize = 0.08f;
        float spacing = 0.02f;
        float startX = -0.3f; // Start position for inventory slots
        float y = -0.85f; // Bottom of screen
        
        for (int i = 0; i < 6; i++) {
            float x = startX + i * (slotSize + spacing);
            renderUIRectangle(x, y, slotSize, slotSize, 0.3f, 0.3f, 0.3f, 0.8f); // Dark gray slots
        }
        
        // Highlight the first slot (selected item)
        renderUIRectangle(startX, y, slotSize, slotSize, 0.8f, 0.8f, 0.2f, 0.6f); // Yellow highlight
    }
    
    private void renderConnectionStatus() {
        // Render a small connection indicator in the top-right corner
        float size = 0.03f;
        float x = 0.9f;
        float y = 0.9f;
        
        // Green for connected, red for disconnected
        renderUIRectangle(x, y, size, size, 0.2f, 0.8f, 0.2f, 0.8f); // Green indicator
    }
    
    private void renderFPSDisplay(int fps) {
        // Render FPS text in the top-left corner
        float startX = -0.95f;
        float startY = 0.85f;
        float digitWidth = 0.06f;
        float digitHeight = 0.08f;
        float spacing = 0.02f;
        
        // Render "FPS:" label using simple rectangles
        renderFPSLabel(startX, startY, digitWidth, digitHeight);
        
        // Convert FPS to string and render each digit
        String fpsString = String.valueOf(fps);
        float currentX = startX + 0.25f; // Offset after "FPS:" label
        
        for (int i = 0; i < fpsString.length(); i++) {
            char digit = fpsString.charAt(i);
            renderDigit(digit, currentX, startY, digitWidth, digitHeight);
            currentX += digitWidth + spacing;
        }
    }
    
    private void renderFPSLabel(float x, float y, float digitWidth, float digitHeight) {
        // Render "FPS:" using bitmap font system
        float letterSpacing = 0.02f;
        float currentX = x;
        
        // F
        renderLetter('F', currentX, y, digitWidth * 0.8f, digitHeight);
        currentX += digitWidth * 0.8f + letterSpacing;
        
        // P
        renderLetter('P', currentX, y, digitWidth * 0.8f, digitHeight);
        currentX += digitWidth * 0.8f + letterSpacing;
        
        // S
        renderLetter('S', currentX, y, digitWidth * 0.8f, digitHeight);
        currentX += digitWidth * 0.8f + letterSpacing;
        
        // :
        renderLetter(':', currentX, y, digitWidth * 0.3f, digitHeight);
    }
    
    private void renderLetter(char letter, float x, float y, float width, float height) {
        // Use a 5x7 pixel grid for each letter - same as digits
        float pixelWidth = width / 5.0f;
        float pixelHeight = height / 7.0f;
        
        // Define each letter as a 5x7 bitmap (1 = pixel on, 0 = pixel off)
        int[][] letterPattern = getLetterPattern(letter);
        
        if (letterPattern != null) {
            for (int row = 0; row < 7; row++) {
                for (int col = 0; col < 5; col++) {
                    if (letterPattern[row][col] == 1) {
                        float pixelX = x + col * pixelWidth;
                        float pixelY = y - row * pixelHeight;
                        renderUIRectangle(pixelX, pixelY, pixelWidth * 0.9f, pixelHeight * 0.9f, 
                                        1.0f, 1.0f, 1.0f, 1.0f);
                    }
                }
            }
        }
    }
    
    private int[][] getLetterPattern(char letter) {
        // 5x7 bitmap patterns for letters F, P, S and colon
        switch (letter) {
            case 'F':
                return new int[][] {
                    {1,1,1,1,1},
                    {1,0,0,0,0},
                    {1,0,0,0,0},
                    {1,1,1,1,0},
                    {1,0,0,0,0},
                    {1,0,0,0,0},
                    {1,0,0,0,0}
                };
            case 'P':
                return new int[][] {
                    {1,1,1,1,0},
                    {1,0,0,0,1},
                    {1,0,0,0,1},
                    {1,1,1,1,0},
                    {1,0,0,0,0},
                    {1,0,0,0,0},
                    {1,0,0,0,0}
                };
            case 'S':
                return new int[][] {
                    {0,1,1,1,1},
                    {1,0,0,0,0},
                    {1,0,0,0,0},
                    {0,1,1,1,0},
                    {0,0,0,0,1},
                    {0,0,0,0,1},
                    {1,1,1,1,0}
                };
            case ':':
                return new int[][] {
                    {0,0,0,0,0},
                    {0,0,1,0,0},
                    {0,0,1,0,0},
                    {0,0,0,0,0},
                    {0,0,1,0,0},
                    {0,0,1,0,0},
                    {0,0,0,0,0}
                };
            default:
                return null;
        }
    }
    
    private void renderDigit(char digit, float x, float y, float width, float height) {
        // Use a 5x7 pixel grid for each digit - much cleaner and more readable
        float pixelWidth = width / 5.0f;
        float pixelHeight = height / 7.0f;
        
        // Define each digit as a 5x7 bitmap (1 = pixel on, 0 = pixel off)
        int[][] digitPatterns = getDigitPattern(digit);
        
        if (digitPatterns != null) {
            for (int row = 0; row < 7; row++) {
                for (int col = 0; col < 5; col++) {
                    if (digitPatterns[row][col] == 1) {
                        float pixelX = x + col * pixelWidth;
                        float pixelY = y - row * pixelHeight;
                        renderUIRectangle(pixelX, pixelY, pixelWidth * 0.9f, pixelHeight * 0.9f, 
                                        1.0f, 1.0f, 1.0f, 1.0f);
                    }
                }
            }
        }
    }
    
    private int[][] getDigitPattern(char digit) {
        // 5x7 bitmap patterns for digits 0-9
        switch (digit) {
            case '0':
                return new int[][] {
                    {0,1,1,1,0},
                    {1,0,0,0,1},
                    {1,0,0,0,1},
                    {1,0,0,0,1},
                    {1,0,0,0,1},
                    {1,0,0,0,1},
                    {0,1,1,1,0}
                };
            case '1':
                return new int[][] {
                    {0,0,1,0,0},
                    {0,1,1,0,0},
                    {0,0,1,0,0},
                    {0,0,1,0,0},
                    {0,0,1,0,0},
                    {0,0,1,0,0},
                    {0,1,1,1,0}
                };
            case '2':
                return new int[][] {
                    {0,1,1,1,0},
                    {1,0,0,0,1},
                    {0,0,0,0,1},
                    {0,0,0,1,0},
                    {0,0,1,0,0},
                    {0,1,0,0,0},
                    {1,1,1,1,1}
                };
            case '3':
                return new int[][] {
                    {0,1,1,1,0},
                    {1,0,0,0,1},
                    {0,0,0,0,1},
                    {0,0,1,1,0},
                    {0,0,0,0,1},
                    {1,0,0,0,1},
                    {0,1,1,1,0}
                };
            case '4':
                return new int[][] {
                    {0,0,0,1,0},
                    {0,0,1,1,0},
                    {0,1,0,1,0},
                    {1,0,0,1,0},
                    {1,1,1,1,1},
                    {0,0,0,1,0},
                    {0,0,0,1,0}
                };
            case '5':
                return new int[][] {
                    {1,1,1,1,1},
                    {1,0,0,0,0},
                    {1,1,1,1,0},
                    {0,0,0,0,1},
                    {0,0,0,0,1},
                    {1,0,0,0,1},
                    {0,1,1,1,0}
                };
            case '6':
                return new int[][] {
                    {0,0,1,1,0},
                    {0,1,0,0,0},
                    {1,0,0,0,0},
                    {1,1,1,1,0},
                    {1,0,0,0,1},
                    {1,0,0,0,1},
                    {0,1,1,1,0}
                };
            case '7':
                return new int[][] {
                    {1,1,1,1,1},
                    {0,0,0,0,1},
                    {0,0,0,1,0},
                    {0,0,1,0,0},
                    {0,1,0,0,0},
                    {0,1,0,0,0},
                    {0,1,0,0,0}
                };
            case '8':
                return new int[][] {
                    {0,1,1,1,0},
                    {1,0,0,0,1},
                    {1,0,0,0,1},
                    {0,1,1,1,0},
                    {1,0,0,0,1},
                    {1,0,0,0,1},
                    {0,1,1,1,0}
                };
            case '9':
                return new int[][] {
                    {0,1,1,1,0},
                    {1,0,0,0,1},
                    {1,0,0,0,1},
                    {0,1,1,1,1},
                    {0,0,0,0,1},
                    {0,0,0,1,0},
                    {0,1,1,0,0}
                };
            default:
                return null;
        }
    }
    
    private void renderUIRectangle(float x, float y, float width, float height, float r, float g, float b, float a) {
        // Create rectangle vertices
        float[] vertices = {
            // Triangle 1
            x, y, 0.0f, r, g, b,
            x + width, y, 0.0f, r, g, b,
            x, y + height, 0.0f, r, g, b,
            // Triangle 2
            x + width, y, 0.0f, r, g, b,
            x + width, y + height, 0.0f, r, g, b,
            x, y + height, 0.0f, r, g, b
        };
        
        // Create temporary VAO and VBO
        int vao = org.lwjgl.opengl.GL30.glGenVertexArrays();
        int vbo = org.lwjgl.opengl.GL15.glGenBuffers();
        
        org.lwjgl.opengl.GL30.glBindVertexArray(vao);
        org.lwjgl.opengl.GL15.glBindBuffer(org.lwjgl.opengl.GL15.GL_ARRAY_BUFFER, vbo);
        org.lwjgl.opengl.GL15.glBufferData(org.lwjgl.opengl.GL15.GL_ARRAY_BUFFER, vertices, org.lwjgl.opengl.GL15.GL_STATIC_DRAW);
        
        // Position attribute
        org.lwjgl.opengl.GL20.glVertexAttribPointer(0, 3, org.lwjgl.opengl.GL11.GL_FLOAT, false, 6 * Float.BYTES, 0);
        org.lwjgl.opengl.GL20.glEnableVertexAttribArray(0);
        
        // Color attribute
        org.lwjgl.opengl.GL20.glVertexAttribPointer(1, 3, org.lwjgl.opengl.GL11.GL_FLOAT, false, 6 * Float.BYTES, 3 * Float.BYTES);
        org.lwjgl.opengl.GL20.glEnableVertexAttribArray(1);
        
        // Draw rectangle
        org.lwjgl.opengl.GL11.glDrawArrays(org.lwjgl.opengl.GL11.GL_TRIANGLES, 0, 6);
        
        // Cleanup
        org.lwjgl.opengl.GL30.glBindVertexArray(0);
        org.lwjgl.opengl.GL15.glDeleteBuffers(vbo);
        org.lwjgl.opengl.GL30.glDeleteVertexArrays(vao);
    }
    
    public void renderUI(ApiClient apiClient, BlockInteraction blockInteraction, double deltaTime) {
        renderUI(apiClient, blockInteraction, deltaTime, null);
    }
    
    public void renderUI(ApiClient apiClient, BlockInteraction blockInteraction, double deltaTime, MultiplayerManager multiplayerManager) {
        if (uiOverlay != null) {
            uiOverlay.render(apiClient, blockInteraction, deltaTime, multiplayerManager);
        }
    }
    
    public void updateCamera(long window, float deltaTime) {
        camera.processKeyboard(window, deltaTime);
    }
    
    public void handleMouseMovement(double xpos, double ypos) {
        camera.processMouseMovement(xpos, ypos);
    }
    
    public void updateProjectionMatrix() {
        float aspect = (float) windowWidth / (float) windowHeight;
        projectionMatrix = new Matrix4f().perspective(camera.getFov(), aspect, 0.1f, 100.0f);
    }
    
    public void setWindowSize(int width, int height) {
        this.windowWidth = width;
        this.windowHeight = height;
        updateProjectionMatrix();
        glViewport(0, 0, width, height);
        
        // Update UI overlay window size
        if (uiOverlay != null) {
            uiOverlay.setWindowSize(width, height);
        }
    }
    
    public Camera getCamera() {
        return camera;
    }
    
    public void cleanup() {
        if (shader != null) {
            shader.cleanup();
        }
        if (voxelRenderer != null) {
            voxelRenderer.cleanup();
        }
        if (uiOverlay != null) {
            uiOverlay.cleanup();
        }
    }
    
    public VoxelRenderer getVoxelRenderer() {
        return voxelRenderer;
    }
    
    private String getVertexShaderSource() {
        return """
            #version 330 core
            
            layout (location = 0) in vec3 aPos;
            layout (location = 1) in vec3 aColor;
            
            out vec3 FragPos;
            out vec3 Color;
            out vec3 Normal;
            
            uniform mat4 model;
            uniform mat4 view;
            uniform mat4 projection;
            
            void main() {
                FragPos = vec3(model * vec4(aPos, 1.0));
                Color = aColor;
                
                // Simple normal calculation (assuming unit cube)
                Normal = normalize(aPos);
                
                gl_Position = projection * view * vec4(FragPos, 1.0);
            }
            """;
    }
    
    private String getFragmentShaderSource() {
        return """
            #version 330 core
            
            in vec3 FragPos;
            in vec3 Color;
            in vec3 Normal;
            
            out vec4 FragColor;
            
            uniform vec3 lightDirection;
            uniform vec3 lightColor;
            uniform vec3 viewPos;
            
            void main() {
                // Ambient lighting
                float ambientStrength = 0.3;
                vec3 ambient = ambientStrength * lightColor;
                
                // Diffuse lighting
                vec3 norm = normalize(Normal);
                vec3 lightDir = normalize(-lightDirection);
                float diff = max(dot(norm, lightDir), 0.0);
                vec3 diffuse = diff * lightColor;
                
                // Specular lighting
                float specularStrength = 0.5;
                vec3 viewDir = normalize(viewPos - FragPos);
                vec3 reflectDir = reflect(-lightDir, norm);
                float spec = pow(max(dot(viewDir, reflectDir), 0.0), 32);
                vec3 specular = specularStrength * spec * lightColor;
                
                vec3 result = (ambient + diffuse + specular) * Color;
                FragColor = vec4(result, 1.0);
            }
            """;
    }
}