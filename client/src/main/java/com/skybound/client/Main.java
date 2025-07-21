package com.skybound.client;

import org.lwjgl.glfw.GLFWErrorCallback;
import org.lwjgl.glfw.GLFWKeyCallback;
import org.lwjgl.glfw.GLFWCursorPosCallback;
import org.lwjgl.glfw.GLFWFramebufferSizeCallback;
import org.lwjgl.glfw.GLFWMouseButtonCallback;
import org.lwjgl.opengl.GL;

import static org.lwjgl.glfw.GLFW.*;
import static org.lwjgl.opengl.GL11.*;
import static org.lwjgl.system.MemoryUtil.NULL;

/**
 * Main entry point for the Skybound Realms game client.
 * Creates a basic window with LWJGL and handles input.
 */
public class Main {
    
    private long window;
    private boolean running = true;
    
    // Game timing
    private long lastTime;
    private double deltaTime;
    
    // API client for backend communication
    private ApiClient apiClient;
    private long lastHealthCheck = 0;
    private static final long HEALTH_CHECK_INTERVAL = 5000; // 5 seconds
    
    // Multiplayer WebSocket connection
    private MultiplayerManager multiplayerManager;
    
    // 3D Rendering
    private Renderer renderer;
    private boolean mouseCaptured = false;
    
    // Block interaction
    private BlockInteraction blockInteraction;
    
    public static void main(String[] args) {
        new Main().run();
    }
    
    public void run() {
        System.out.println("Starting Skybound Realms Client...");
        
        init();
        gameLoop();
        cleanup();
    }
    
    private void init() {
        // Set up error callback
        GLFWErrorCallback.createPrint(System.err).set();
        
        // Initialize GLFW
        if (!glfwInit()) {
            throw new IllegalStateException("Unable to initialize GLFW");
        }
        
        // Configure GLFW
        glfwDefaultWindowHints();
        glfwWindowHint(GLFW_VISIBLE, GLFW_FALSE);
        glfwWindowHint(GLFW_RESIZABLE, GLFW_TRUE);
        glfwWindowHint(GLFW_CONTEXT_VERSION_MAJOR, 3);
        glfwWindowHint(GLFW_CONTEXT_VERSION_MINOR, 3);
        glfwWindowHint(GLFW_OPENGL_PROFILE, GLFW_OPENGL_CORE_PROFILE);
        
        // Create window
        window = glfwCreateWindow(1024, 768, "Skybound Realms", NULL, NULL);
        if (window == NULL) {
            throw new RuntimeException("Failed to create the GLFW window");
        }
        
        // Set up key callback
        glfwSetKeyCallback(window, new GLFWKeyCallback() {
            @Override
            public void invoke(long window, int key, int scancode, int action, int mods) {
                handleKeyInput(key, action);
            }
        });
        
        // Set up mouse cursor callback
        glfwSetCursorPosCallback(window, new GLFWCursorPosCallback() {
            @Override
            public void invoke(long window, double xpos, double ypos) {
                if (mouseCaptured && renderer != null) {
                    renderer.handleMouseMovement(xpos, ypos);
                }
            }
        });
        
        // Set up framebuffer size callback for window resizing
        glfwSetFramebufferSizeCallback(window, new GLFWFramebufferSizeCallback() {
            @Override
            public void invoke(long window, int width, int height) {
                if (renderer != null) {
                    renderer.setWindowSize(width, height);
                }
            }
        });
        
        // Set up mouse button callback for mouse capture and block interaction
        glfwSetMouseButtonCallback(window, new GLFWMouseButtonCallback() {
            @Override
            public void invoke(long window, int button, int action, int mods) {
                handleMouseInput(button, action);
            }
        });
        
        // Center window on screen
        var vidmode = glfwGetVideoMode(glfwGetPrimaryMonitor());
        if (vidmode != null) {
            glfwSetWindowPos(window, 
                (vidmode.width() - 1024) / 2, 
                (vidmode.height() - 768) / 2);
        }
        
        // Make OpenGL context current
        glfwMakeContextCurrent(window);
        
        // Enable v-sync
        glfwSwapInterval(1);
        
        // Show window
        glfwShowWindow(window);
        
        // Initialize OpenGL
        GL.createCapabilities();
        
        // Set clear color to sky blue
        glClearColor(0.5f, 0.8f, 1.0f, 1.0f);
        
        // Initialize timing
        lastTime = System.nanoTime();
        
        // Initialize API client with hardcoded backend URL
        apiClient = new ApiClient("http://localhost:3000");
        
        // Perform initial health check
        System.out.println("Connecting to backend server...");
        apiClient.healthCheck();
        updateWindowTitle();
        
        // Initialize 3D renderer
        try {
            renderer = new Renderer();
            renderer.init();
            System.out.println("3D Renderer initialized successfully!");
        } catch (Exception e) {
            System.err.println("Failed to initialize 3D renderer: " + e.getMessage());
            e.printStackTrace();
            throw new RuntimeException("Renderer initialization failed", e);
        }
        
        // Load test chunk from server
        System.out.println("Loading test chunk from server...");
        VoxelChunk testChunk = apiClient.fetchTestChunk();
        if (testChunk != null) {
            renderer.getVoxelRenderer().loadChunk(testChunk);
            System.out.println("Test chunk loaded successfully!");
        } else {
            System.err.println("Failed to load test chunk from server");
        }
        
        // Initialize block interaction system
        blockInteraction = new BlockInteraction(apiClient, renderer.getVoxelRenderer());
        
        // Initialize multiplayer manager and connect to WebSocket
        multiplayerManager = new MultiplayerManager();
        System.out.println("Connecting to multiplayer server...");
        multiplayerManager.connect("ws://localhost:3000/ws");
        
        // Connect block interaction with multiplayer manager
        blockInteraction.setMultiplayerManager(multiplayerManager);
        
        System.out.println("Window initialized successfully!");
        System.out.println("Controls:");
        System.out.println("  WASD - Move camera");
        System.out.println("  Space/Shift - Move up/down");
        System.out.println("  Mouse - Look around (middle click to capture mouse)");
        System.out.println("  Left Click - Break block");
        System.out.println("  Right Click - Place block");
        System.out.println("  Q - Cycle block type");
        System.out.println("  ESC - Exit");
    }
    
    private void gameLoop() {
        while (running && !glfwWindowShouldClose(window)) {
            // Calculate delta time
            long currentTime = System.nanoTime();
            deltaTime = (currentTime - lastTime) / 1_000_000_000.0; // Convert to seconds
            lastTime = currentTime;
            
            // Poll for window events
            glfwPollEvents();
            
            // Update game logic
            update(deltaTime);
            
            // Render
            render();
            
            // Swap front and back buffers
            glfwSwapBuffers(window);
        }
    }
    
    private void update(double deltaTime) {
        // Periodic health check
        long currentTime = System.currentTimeMillis();
        if (currentTime - lastHealthCheck > HEALTH_CHECK_INTERVAL) {
            apiClient.healthCheck();
            updateWindowTitle();
            lastHealthCheck = currentTime;
        }
        
        // Update multiplayer manager
        if (multiplayerManager != null) {
            multiplayerManager.update();
        }
        
        // Update 3D renderer (camera movement)
        if (renderer != null) {
            renderer.updateCamera(window, (float) deltaTime);
        }
    }
    
    private void render() {
        // Use 3D renderer
        if (renderer != null) {
            renderer.render(multiplayerManager);
            
            // Render UI overlay
            renderer.renderUI(apiClient, blockInteraction, deltaTime, multiplayerManager);
        }
    }
    
    private void handleKeyInput(int key, int action) {
        if (action == GLFW_PRESS || action == GLFW_REPEAT) {
            switch (key) {
                case GLFW_KEY_ESCAPE:
                    System.out.println("ESC pressed - closing window");
                    running = false;
                    glfwSetWindowShouldClose(window, true);
                    break;
                    
                case GLFW_KEY_Q:
                    if (action == GLFW_PRESS && blockInteraction != null) {
                        blockInteraction.cycleBlockType();
                    }
                    break;
                    
                default:
                    // Handle other keys in the future
                    break;
            }
        }
    }
    
    private void handleMouseInput(int button, int action) {
        if (action == GLFW_PRESS) {
            switch (button) {
                case GLFW_MOUSE_BUTTON_MIDDLE:
                    // Toggle mouse capture
                    mouseCaptured = !mouseCaptured;
                    if (mouseCaptured) {
                        glfwSetInputMode(window, GLFW_CURSOR, GLFW_CURSOR_DISABLED);
                        System.out.println("Mouse captured - move mouse to look around");
                    } else {
                        glfwSetInputMode(window, GLFW_CURSOR, GLFW_CURSOR_NORMAL);
                        System.out.println("Mouse released");
                    }
                    break;
                    
                case GLFW_MOUSE_BUTTON_LEFT:
                    if (mouseCaptured && blockInteraction != null && renderer != null) {
                        blockInteraction.handleLeftClick(renderer.getCamera());
                    }
                    break;
                    
                case GLFW_MOUSE_BUTTON_RIGHT:
                    if (mouseCaptured && blockInteraction != null && renderer != null) {
                        blockInteraction.handleRightClick(renderer.getCamera());
                    }
                    break;
            }
        }
    }
    
    /**
     * Updates the window title to show connection status.
     */
    private void updateWindowTitle() {
        String apiStatus = apiClient.getConnectionStatus();
        String multiplayerStatus = multiplayerManager != null ? multiplayerManager.getConnectionStatus() : "Not connected";
        String title = "Skybound Realms - API: " + apiStatus + " | MP: " + multiplayerStatus;
        glfwSetWindowTitle(window, title);
    }
    
    private void cleanup() {
        System.out.println("Cleaning up resources...");
        
        // Cleanup renderer
        if (renderer != null) {
            renderer.cleanup();
        }
        
        // Close API client
        if (apiClient != null) {
            apiClient.close();
        }
        
        // Free window callbacks and destroy window
        glfwDestroyWindow(window);
        
        // Terminate GLFW and free error callback
        glfwTerminate();
        GLFWErrorCallback callback = glfwSetErrorCallback(null);
        if (callback != null) {
            callback.free();
        }
        
        System.out.println("Skybound Realms Client closed successfully");
    }
}