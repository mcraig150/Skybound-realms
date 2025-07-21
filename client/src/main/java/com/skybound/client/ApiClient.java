package com.skybound.client;

import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.JsonNode;

import java.io.IOException;
import java.util.concurrent.TimeUnit;

/**
 * Simple API client for connecting to the Skybound Realms backend.
 * Handles HTTP requests and basic health check functionality.
 */
public class ApiClient {
    
    private final OkHttpClient httpClient;
    private final ObjectMapper objectMapper;
    private final String baseUrl;
    
    // Connection status
    private boolean isConnected = false;
    private String lastError = null;
    
    public ApiClient(String baseUrl) {
        this.baseUrl = baseUrl;
        this.httpClient = new OkHttpClient.Builder()
            .connectTimeout(5, TimeUnit.SECONDS)
            .readTimeout(10, TimeUnit.SECONDS)
            .writeTimeout(10, TimeUnit.SECONDS)
            .build();
        this.objectMapper = new ObjectMapper();
    }
    
    /**
     * Performs a health check against the backend server.
     * @return true if the server is reachable and healthy, false otherwise
     */
    public boolean healthCheck() {
        try {
            Request request = new Request.Builder()
                .url(baseUrl + "/health")
                .get()
                .build();
            
            try (Response response = httpClient.newCall(request).execute()) {
                if (response.isSuccessful() && response.body() != null) {
                    String responseBody = response.body().string();
                    JsonNode jsonNode = objectMapper.readTree(responseBody);
                    
                    // Check if the response indicates the server is healthy
                    if (jsonNode.has("status") && "healthy".equals(jsonNode.get("status").asText())) {
                        isConnected = true;
                        lastError = null;
                        System.out.println("Health check successful - server is healthy");
                        return true;
                    }
                }
                
                isConnected = false;
                lastError = "Server returned unhealthy status: " + response.code();
                System.out.println("Health check failed: " + lastError);
                return false;
                
            }
        } catch (IOException e) {
            isConnected = false;
            lastError = "Connection failed: " + e.getMessage();
            System.out.println("Health check failed: " + lastError);
            return false;
        }
    }
    
    /**
     * Gets the current connection status.
     * @return true if connected to the backend, false otherwise
     */
    public boolean isConnected() {
        return isConnected;
    }
    
    /**
     * Gets the last error message if any.
     * @return the last error message, or null if no error
     */
    public String getLastError() {
        return lastError;
    }
    
    /**
     * Gets a human-readable connection status string.
     * @return connection status description
     */
    public String getConnectionStatus() {
        if (isConnected) {
            return "Connected to " + baseUrl;
        } else if (lastError != null) {
            return "Disconnected: " + lastError;
        } else {
            return "Not connected";
        }
    }
    
    /**
     * Fetches a test chunk from the server for development purposes.
     * @return VoxelChunk object if successful, null otherwise
     */
    public VoxelChunk fetchTestChunk() {
        try {
            Request request = new Request.Builder()
                .url(baseUrl + "/api/test-chunk")
                .get()
                .build();
            
            try (Response response = httpClient.newCall(request).execute()) {
                if (response.isSuccessful() && response.body() != null) {
                    String responseBody = response.body().string();
                    VoxelChunk chunk = objectMapper.readValue(responseBody, VoxelChunk.class);
                    System.out.println("Successfully fetched test chunk: " + chunk.toString());
                    return chunk;
                } else {
                    System.err.println("Failed to fetch test chunk: HTTP " + response.code());
                    return null;
                }
            }
        } catch (IOException e) {
            System.err.println("Error fetching test chunk: " + e.getMessage());
            return null;
        }
    }
    
    /**
     * Sends a block change to the server.
     * @param position the position of the block change
     * @param blockType the type of block to place, or null to remove block
     * @return true if the change was sent successfully, false otherwise
     */
    public boolean sendBlockChange(Vector3f position, String blockType) {
        try {
            // Create JSON payload for block change
            String jsonPayload;
            if (blockType == null) {
                // Block removal
                jsonPayload = String.format(
                    "{\"action\":\"remove\",\"position\":{\"x\":%d,\"y\":%d,\"z\":%d}}",
                    (int)position.x, (int)position.y, (int)position.z
                );
            } else {
                // Block placement
                jsonPayload = String.format(
                    "{\"action\":\"place\",\"position\":{\"x\":%d,\"y\":%d,\"z\":%d},\"blockType\":\"%s\"}",
                    (int)position.x, (int)position.y, (int)position.z, blockType
                );
            }
            
            okhttp3.RequestBody body = okhttp3.RequestBody.create(
                jsonPayload, 
                okhttp3.MediaType.get("application/json; charset=utf-8")
            );
            
            Request request = new Request.Builder()
                .url(baseUrl + "/api/block-change")
                .post(body)
                .build();
            
            try (Response response = httpClient.newCall(request).execute()) {
                if (response.isSuccessful()) {
                    System.out.println("Block change sent successfully: " + jsonPayload);
                    return true;
                } else {
                    System.err.println("Failed to send block change: HTTP " + response.code());
                    return false;
                }
            }
        } catch (IOException e) {
            System.err.println("Error sending block change: " + e.getMessage());
            return false;
        }
    }
    
    /**
     * Closes the HTTP client and releases resources.
     */
    public void close() {
        if (httpClient != null) {
            httpClient.dispatcher().executorService().shutdown();
            httpClient.connectionPool().evictAll();
        }
    }
}