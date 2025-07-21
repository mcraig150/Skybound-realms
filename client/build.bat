@echo off
echo Building Skybound Realms Java Client...

REM Check if Maven daemon is available
mvnd -version >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Maven daemon (mvnd) is not installed or not in PATH
    echo Please install Maven daemon from: https://github.com/apache/maven-mvnd
    echo And add it to your PATH environment variable
    pause
    exit /b 1
)

REM Clean and compile
echo Cleaning and compiling...
mvnd clean compile
if %errorlevel% neq 0 (
    echo Build failed!
    pause
    exit /b 1
)

echo Build successful!
echo Run 'mvnd exec:java' to start the client
pause