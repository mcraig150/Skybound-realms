# Skybound Realms Java Client

A minimal Java game client built with LWJGL for the Skybound Realms MMORPG.

## Prerequisites

- Java 17 or higher (Java 21 detected)
- Maven 3.6 or higher

## Setup Instructions

1. **Install Maven** (if not already installed):
   - Download from: https://maven.apache.org/download.cgi
   - Add Maven's `bin` directory to your PATH environment variable
   - Verify installation: `mvn -version`

2. **Build the project**:
   ```bash
   mvn clean compile
   ```

3. **Run the client**:
   ```bash
   mvn exec:java
   ```

## Features

- Basic LWJGL window with OpenGL context
- Simple game loop with delta time calculation
- ESC key handling to close the window
- Sky blue background color

## Controls

- **ESC**: Close the window and exit the application

## Project Structure

```
client/
├── pom.xml                 # Maven configuration
├── src/main/java/
│   └── com/skybound/client/
│       └── Main.java       # Main application class
└── README.md              # This file
```

## Development Notes

This is a minimal implementation that:
- Creates a 1024x768 window
- Initializes LWJGL and OpenGL
- Implements a basic game loop
- Handles ESC key input for graceful shutdown
- Calculates delta time for future game logic

Future enhancements will add:
- 3D world rendering
- REST API connectivity
- Player input handling
- UI overlays