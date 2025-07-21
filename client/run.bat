@echo off
echo Starting Skybound Realms Java Client...

REM Check if Maven daemon is available
mvnd -version >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Maven daemon (mvnd) is not installed or not in PATH
    echo Please install Maven daemon from: https://github.com/apache/maven-mvnd
    echo And add it to your PATH environment variable
    pause
    exit /b 1
)

REM Run the application
mvnd exec:java