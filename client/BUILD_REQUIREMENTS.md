# Build Requirements

## Maven Daemon (mvnd)

This project requires Maven daemon (mvnd) for building. Regular Maven (mvn) is not sufficient.

### Installation

1. Install Maven daemon from: https://github.com/apache/maven-mvnd
2. Add mvnd to your PATH environment variable
3. Verify installation: `mvnd -version`

### Building

```bash
# Clean and compile
mvnd clean compile

# Run the client
mvnd exec:java
```

### Alternative Build Script

Use the provided batch file:
```bash
.\build.bat
```

This will check for mvnd availability and build the project.

## Dependencies

The project uses:
- LWJGL for OpenGL rendering
- OkHttp for HTTP client
- Jackson for JSON processing

All dependencies are managed through Maven and will be downloaded automatically during build.