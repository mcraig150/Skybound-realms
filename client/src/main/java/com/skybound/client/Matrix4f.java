package com.skybound.client;

import java.nio.FloatBuffer;

/**
 * Simple 4x4 matrix class for 3D transformations.
 */
public class Matrix4f {
    private float[] m = new float[16];
    
    public Matrix4f() {
        identity();
    }
    
    public Matrix4f identity() {
        for (int i = 0; i < 16; i++) {
            m[i] = 0;
        }
        m[0] = m[5] = m[10] = m[15] = 1.0f;
        return this;
    }
    
    public Matrix4f perspective(float fov, float aspect, float near, float far) {
        identity();
        float f = 1.0f / (float) Math.tan(Math.toRadians(fov) / 2.0f);
        
        m[0] = f / aspect;
        m[5] = f;
        m[10] = (far + near) / (near - far);
        m[11] = -1.0f;
        m[14] = (2.0f * far * near) / (near - far);
        m[15] = 0.0f;
        
        return this;
    }
    
    public Matrix4f ortho(float left, float right, float bottom, float top, float near, float far) {
        identity();
        
        m[0] = 2.0f / (right - left);
        m[5] = 2.0f / (top - bottom);
        m[10] = -2.0f / (far - near);
        m[12] = -(right + left) / (right - left);
        m[13] = -(top + bottom) / (top - bottom);
        m[14] = -(far + near) / (far - near);
        m[15] = 1.0f;
        
        return this;
    }
    
    public Matrix4f lookAt(Vector3f eye, Vector3f center, Vector3f up) {
        Vector3f f = center.subtract(eye).normalize();
        Vector3f u = up.normalize();
        Vector3f s = f.cross(u).normalize();
        u = s.cross(f);
        
        identity();
        m[0] = s.x;
        m[4] = s.y;
        m[8] = s.z;
        m[1] = u.x;
        m[5] = u.y;
        m[9] = u.z;
        m[2] = -f.x;
        m[6] = -f.y;
        m[10] = -f.z;
        m[12] = -s.dot(eye);
        m[13] = -u.dot(eye);
        m[14] = f.dot(eye);
        
        return this;
    }
    
    public Matrix4f translate(Vector3f translation) {
        Matrix4f result = new Matrix4f();
        result.m[12] = translation.x;
        result.m[13] = translation.y;
        result.m[14] = translation.z;
        return multiply(result);
    }
    
    public Matrix4f scale(Vector3f scale) {
        Matrix4f result = new Matrix4f();
        result.m[0] = scale.x;
        result.m[5] = scale.y;
        result.m[10] = scale.z;
        return multiply(result);
    }
    
    public Matrix4f rotateX(float angle) {
        float cos = (float) Math.cos(Math.toRadians(angle));
        float sin = (float) Math.sin(Math.toRadians(angle));
        
        Matrix4f result = new Matrix4f();
        result.m[5] = cos;
        result.m[6] = sin;
        result.m[9] = -sin;
        result.m[10] = cos;
        
        return multiply(result);
    }
    
    public Matrix4f rotateY(float angle) {
        float cos = (float) Math.cos(Math.toRadians(angle));
        float sin = (float) Math.sin(Math.toRadians(angle));
        
        Matrix4f result = new Matrix4f();
        result.m[0] = cos;
        result.m[2] = -sin;
        result.m[8] = sin;
        result.m[10] = cos;
        
        return multiply(result);
    }
    
    public Matrix4f multiply(Matrix4f other) {
        Matrix4f result = new Matrix4f();
        
        for (int i = 0; i < 4; i++) {
            for (int j = 0; j < 4; j++) {
                result.m[i * 4 + j] = 0;
                for (int k = 0; k < 4; k++) {
                    result.m[i * 4 + j] += m[i * 4 + k] * other.m[k * 4 + j];
                }
            }
        }
        
        return result;
    }
    
    public void get(FloatBuffer buffer) {
        buffer.put(m);
        buffer.flip();
    }
    
    public float[] getArray() {
        return m.clone();
    }
}