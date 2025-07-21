package com.skybound.client;

import static org.lwjgl.opengl.GL11.*;

public class UIOverlay {
    
    private int windowWidth;
    private int windowHeight;
    
    // FPS tracking
    private double lastFpsUpdate = 0;
    private int frameCount = 0;
    private int currentFps = 0;
    
    // Status display timing
    private double lastStatusUpdate = 0;
    private static final double STATUS_UPDATE_INTERVAL = 2.0;
    
    public UIOverlay(int windowWidth, int windowHeight) {
        this.windowWidth = windowWidth;
        this.windowHeight = windowHeight;
        System.out.println("UI Overlay initialized successfully!");
    }
    
    public void init() {
        // Initialize UI rendering
    }
    
    public void setWindowSize(int width, int height) {
        this.windowWidth = width;
        this.windowHeight = height;
    }
    
    public void render(ApiClient apiClient, BlockInteraction blockInteraction, double deltaTime) {
        render(apiClient, blockInteraction, deltaTime, null);
    }
    
    public void render(ApiClient apiClient, BlockInteraction blockInteraction, double deltaTime, MultiplayerManager multiplayerManager) {
        updateFps();
        renderVisualUI(apiClient, blockInteraction, multiplayerManager);
        displayStatusInfo(apiClient, blockInteraction, multiplayerManager);
    }
    
    private void updateFps() {
        frameCount++;
        double currentTime = System.currentTimeMillis() / 1000.0;
        
        if (currentTime - lastFpsUpdate >= 1.0) {
            currentFps = frameCount;
            frameCount = 0;
            lastFpsUpdate = currentTime;
        }
    }
    
    private void drawCrosshair() {
        try {
            // Save current matrices
            glPushMatrix();
            glLoadIdentity();
            
            glMatrixMode(GL_PROJECTION);
            glPushMatrix();
            glLoadIdentity();
            glOrtho(0, windowWidth, windowHeight, 0, -1, 1);
            glMatrixMode(GL_MODELVIEW);
            
            // Disable depth testing for UI
            boolean depthTestEnabled = glIsEnabled(GL_DEPTH_TEST);
            if (depthTestEnabled) {
                glDisable(GL_DEPTH_TEST);
            }
            
            // Draw crosshair
            float centerX = windowWidth / 2.0f;
            float centerY = windowHeight / 2.0f;
            float size = 10.0f;
            
            glColor3f(1.0f, 1.0f, 1.0f);
            glLineWidth(2.0f);
            
            glBegin(GL_LINES);
            glVertex2f(centerX - size, centerY);
            glVertex2f(centerX + size, centerY);
            glVertex2f(centerX, centerY - size);
            glVertex2f(centerX, centerY + size);
            glEnd();
            
            // Restore depth testing
            if (depthTestEnabled) {
                glEnable(GL_DEPTH_TEST);
            }
            
            // Restore matrices
            glMatrixMode(GL_PROJECTION);
            glPopMatrix();
            glMatrixMode(GL_MODELVIEW);
            glPopMatrix();
        } catch (Exception e) {
            // If OpenGL context issues occur, just skip UI rendering
            System.err.println("Warning: Could not render crosshair: " + e.getMessage());
        }
    }
    
    private void drawSimpleCrosshair() {
        try {
            // Only draw if we have a valid OpenGL context
            if (glGetError() != GL_NO_ERROR) {
                return; // Skip if there are existing OpenGL errors
            }
            
            // Save OpenGL state
            glPushAttrib(GL_ALL_ATTRIB_BITS);
            
            // Set up 2D rendering
            glMatrixMode(GL_PROJECTION);
            glPushMatrix();
            glLoadIdentity();
            glOrtho(0, windowWidth, 0, windowHeight, -1, 1);
            
            glMatrixMode(GL_MODELVIEW);
            glPushMatrix();
            glLoadIdentity();
            
            // Disable depth testing and enable blending for UI
            glDisable(GL_DEPTH_TEST);
            glEnable(GL_BLEND);
            glBlendFunc(GL_SRC_ALPHA, GL_ONE_MINUS_SRC_ALPHA);
            
            // Draw simple crosshair
            float centerX = windowWidth / 2.0f;
            float centerY = windowHeight / 2.0f;
            float size = 8.0f;
            
            glColor4f(1.0f, 1.0f, 1.0f, 0.8f); // White with slight transparency
            glLineWidth(1.5f);
            
            glBegin(GL_LINES);
            // Horizontal line
            glVertex2f(centerX - size, centerY);
            glVertex2f(centerX + size, centerY);
            // Vertical line  
            glVertex2f(centerX, centerY - size);
            glVertex2f(centerX, centerY + size);
            glEnd();
            
            // Restore matrices
            glPopMatrix();
            glMatrixMode(GL_PROJECTION);
            glPopMatrix();
            glMatrixMode(GL_MODELVIEW);
            
            // Restore OpenGL state
            glPopAttrib();
            
        } catch (Exception e) {
            // Silently skip UI rendering if there are issues
        }
    }
    
    private void renderVisualUI(ApiClient apiClient, BlockInteraction blockInteraction, MultiplayerManager multiplayerManager) {
        // Render crosshair using modern OpenGL approach
        drawModernCrosshair();
        
        // Render text-based UI elements
        renderTextOverlay(apiClient, blockInteraction, multiplayerManager);
    }
    
    private void drawModernCrosshair() {
        // This will be handled by the Renderer class using shaders
        // For now, we'll use a simple approach that works with core profile
    }
    
    private void renderTextOverlay(ApiClient apiClient, BlockInteraction blockInteraction, MultiplayerManager multiplayerManager) {
        // For now, we'll render basic UI info as console output
        // In a full implementation, this would render text to screen using a font rendering system
        
        // Create simple visual feedback by rendering colored rectangles for UI elements
        try {
            renderUIElements(apiClient, blockInteraction, multiplayerManager);
        } catch (Exception e) {
            // Fallback to console output if visual rendering fails
            System.err.println("UI rendering failed, using console output");
        }
    }
    
    private void renderUIElements(ApiClient apiClient, BlockInteraction blockInteraction, MultiplayerManager multiplayerManager) {
        // This method will render simple colored rectangles to represent UI elements
        // Since we're using OpenGL 3.3 core profile, we need to use shaders
        // For now, we'll keep the existing crosshair rendering in the Renderer class
    }
    
    private void displayStatusInfo(ApiClient apiClient, BlockInteraction blockInteraction, MultiplayerManager multiplayerManager) {
        double currentTime = System.currentTimeMillis() / 1000.0;
        
        if (currentTime - lastStatusUpdate >= STATUS_UPDATE_INTERVAL) {
            // Clear console and display current status at the top
            System.out.print("\033[2J\033[H"); // Clear screen and move cursor to top
            System.out.println("╔══════════════════════════════════════╗");
            System.out.println("║           SKYBOUND REALMS            ║");
            System.out.println("╠══════════════════════════════════════╣");
            System.out.printf("║ FPS: %-31d ║%n", currentFps);
            System.out.printf("║ API: %-31s ║%n", (apiClient.isConnected() ? "Connected" : "Disconnected"));
            
            // Display multiplayer status
            if (multiplayerManager != null) {
                String mpStatus = multiplayerManager.isConnected() ? "Connected" : "Disconnected";
                int playerCount = multiplayerManager.getRemotePlayers().size();
                System.out.printf("║ Multiplayer: %-22s ║%n", mpStatus);
                System.out.printf("║ Players Online: %-19d ║%n", playerCount);
            } else {
                System.out.println("║ Multiplayer: Not initialized         ║");
                System.out.println("║ Players Online: 0                    ║");
            }
            
            if (blockInteraction != null) {
                System.out.printf("║ Selected Block: %-20s ║%n", blockInteraction.getSelectedBlockType().toString().toUpperCase());
            }
            
            System.out.println("║ Inventory: [D][S][W][ ][ ][ ]         ║");
            System.out.println("╠══════════════════════════════════════╣");
            
            // Display recent chat messages
            if (multiplayerManager != null && multiplayerManager.isConnected()) {
                System.out.println("║ Recent Chat:                         ║");
                var recentMessages = multiplayerManager.getRecentChatMessages(3);
                if (recentMessages.isEmpty()) {
                    System.out.println("║   No recent messages                 ║");
                } else {
                    for (ChatMessage msg : recentMessages) {
                        String displayMsg = msg.getPlayerName() + ": " + msg.getMessage();
                        if (displayMsg.length() > 36) {
                            displayMsg = displayMsg.substring(0, 33) + "...";
                        }
                        System.out.printf("║   %-34s ║%n", displayMsg);
                    }
                }
                System.out.println("╠══════════════════════════════════════╣");
            }
            
            System.out.println("║ Controls:                            ║");
            System.out.println("║ WASD - Move | Mouse - Look           ║");
            System.out.println("║ Middle Click - Capture Mouse         ║");
            System.out.println("║ Left Click - Break | Right - Place   ║");
            System.out.println("║ Q - Cycle Block | ESC - Exit         ║");
            System.out.println("╚══════════════════════════════════════╝");
            
            lastStatusUpdate = currentTime;
        }
    }
    
    public int getCurrentFps() {
        return currentFps;
    }
    
    public void cleanup() {
        // Nothing to cleanup
    }
}