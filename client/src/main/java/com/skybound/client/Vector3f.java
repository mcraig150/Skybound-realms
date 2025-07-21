package com.skybound.client;

/**
 * Simple 3D vector class for 3D math operations.
 */
public class Vector3f {
    public float x, y, z;
    
    public Vector3f() {
        this(0, 0, 0);
    }
    
    public Vector3f(float x, float y, float z) {
        this.x = x;
        this.y = y;
        this.z = z;
    }
    
    public Vector3f(Vector3f other) {
        this.x = other.x;
        this.y = other.y;
        this.z = other.z;
    }
    
    public Vector3f set(float x, float y, float z) {
        this.x = x;
        this.y = y;
        this.z = z;
        return this;
    }
    
    public Vector3f add(Vector3f other) {
        return new Vector3f(x + other.x, y + other.y, z + other.z);
    }
    
    public Vector3f subtract(Vector3f other) {
        return new Vector3f(x - other.x, y - other.y, z - other.z);
    }
    
    public Vector3f multiply(float scalar) {
        return new Vector3f(x * scalar, y * scalar, z * scalar);
    }
    
    public float dot(Vector3f other) {
        return x * other.x + y * other.y + z * other.z;
    }
    
    public Vector3f cross(Vector3f other) {
        return new Vector3f(
            y * other.z - z * other.y,
            z * other.x - x * other.z,
            x * other.y - y * other.x
        );
    }
    
    public float length() {
        return (float) Math.sqrt(x * x + y * y + z * z);
    }
    
    public Vector3f normalize() {
        float len = length();
        if (len != 0) {
            return new Vector3f(x / len, y / len, z / len);
        }
        return new Vector3f(0, 0, 0);
    }
    
    @Override
    public String toString() {
        return String.format("Vector3f(%.2f, %.2f, %.2f)", x, y, z);
    }
}