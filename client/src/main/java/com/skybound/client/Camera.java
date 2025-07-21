package com.skybound.client;

import static org.lwjgl.glfw.GLFW.*;

/**
 * First-person camera with WASD movement and mouse look.
 */
public class Camera {
    
    private Vector3f position;
    private Vector3f front;
    private Vector3f up;
    private Vector3f right;
    private Vector3f worldUp;
    
    // Euler angles
    private float yaw = -90.0f; // Start looking forward
    private float pitch = 0.0f;
    
    // Camera options
    private float movementSpeed = 5.0f;
    private float mouseSensitivity = 0.1f;
    private float fov = 45.0f;
    
    // Mouse tracking
    private boolean firstMouse = true;
    private double lastX = 400;
    private double lastY = 300;
    
    public Camera(Vector3f position) {
        this.position = new Vector3f(position);
        this.worldUp = new Vector3f(0.0f, 1.0f, 0.0f);
        updateCameraVectors();
    }
    
    public Camera() {
        this(new Vector3f(0.0f, 0.0f, 3.0f));
    }
    
    public Matrix4f getViewMatrix() {
        Vector3f center = position.add(front);
        return new Matrix4f().lookAt(position, center, up);
    }
    
    public void processKeyboard(long window, float deltaTime) {
        float velocity = movementSpeed * deltaTime;
        
        if (glfwGetKey(window, GLFW_KEY_W) == GLFW_PRESS) {
            position = position.add(front.multiply(velocity));
        }
        if (glfwGetKey(window, GLFW_KEY_S) == GLFW_PRESS) {
            position = position.subtract(front.multiply(velocity));
        }
        if (glfwGetKey(window, GLFW_KEY_A) == GLFW_PRESS) {
            position = position.subtract(right.multiply(velocity));
        }
        if (glfwGetKey(window, GLFW_KEY_D) == GLFW_PRESS) {
            position = position.add(right.multiply(velocity));
        }
        if (glfwGetKey(window, GLFW_KEY_SPACE) == GLFW_PRESS) {
            position = position.add(worldUp.multiply(velocity));
        }
        if (glfwGetKey(window, GLFW_KEY_LEFT_SHIFT) == GLFW_PRESS) {
            position = position.subtract(worldUp.multiply(velocity));
        }
    }
    
    public void processMouseMovement(double xpos, double ypos) {
        if (firstMouse) {
            lastX = xpos;
            lastY = ypos;
            firstMouse = false;
        }
        
        double xoffset = xpos - lastX;
        double yoffset = lastY - ypos; // Reversed since y-coordinates go from bottom to top
        lastX = xpos;
        lastY = ypos;
        
        xoffset *= mouseSensitivity;
        yoffset *= mouseSensitivity;
        
        yaw += xoffset;
        pitch += yoffset;
        
        // Constrain pitch
        if (pitch > 89.0f) {
            pitch = 89.0f;
        }
        if (pitch < -89.0f) {
            pitch = -89.0f;
        }
        
        updateCameraVectors();
    }
    
    private void updateCameraVectors() {
        // Calculate the new front vector
        Vector3f newFront = new Vector3f();
        newFront.x = (float) (Math.cos(Math.toRadians(yaw)) * Math.cos(Math.toRadians(pitch)));
        newFront.y = (float) Math.sin(Math.toRadians(pitch));
        newFront.z = (float) (Math.sin(Math.toRadians(yaw)) * Math.cos(Math.toRadians(pitch)));
        front = newFront.normalize();
        
        // Re-calculate the right and up vector
        right = front.cross(worldUp).normalize();
        up = right.cross(front).normalize();
    }
    
    // Getters and setters
    public Vector3f getPosition() { return new Vector3f(position); }
    public Vector3f getFront() { return new Vector3f(front); }
    public Vector3f getUp() { return new Vector3f(up); }
    public Vector3f getRight() { return new Vector3f(right); }
    public float getFov() { return fov; }
    
    public void setPosition(Vector3f position) {
        this.position = new Vector3f(position);
    }
    
    public void setMovementSpeed(float speed) {
        this.movementSpeed = speed;
    }
    
    public void setMouseSensitivity(float sensitivity) {
        this.mouseSensitivity = sensitivity;
    }
}