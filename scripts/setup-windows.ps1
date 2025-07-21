# Windows Development Setup Script for Skybound Realms
# Run this script in PowerShell as Administrator

param(
    [switch]$SkipInstall,
    [switch]$SetupOnly
)

Write-Host "🚀 Setting up Skybound Realms for Windows development..." -ForegroundColor Green

# Check if running as administrator
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")

if (-not $isAdmin -and -not $SkipInstall) {
    Write-Host "⚠️  This script should be run as Administrator for installations" -ForegroundColor Yellow
    Write-Host "   Re-run with -SkipInstall flag if you already have PostgreSQL and Redis installed" -ForegroundColor Yellow
}

# Function to check if a command exists
function Test-Command($command) {
    try {
        Get-Command $command -ErrorAction Stop
        return $true
    } catch {
        return $false
    }
}

# Function to check if a service is running
function Test-Service($serviceName) {
    try {
        $service = Get-Service -Name $serviceName -ErrorAction Stop
        return $service.Status -eq "Running"
    } catch {
        return $false
    }
}

# Install dependencies if not skipping
if (-not $SkipInstall) {
    Write-Host "📦 Checking and installing dependencies..." -ForegroundColor Blue
    
    # Check for Chocolatey
    if (-not (Test-Command "choco")) {
        Write-Host "Installing Chocolatey..." -ForegroundColor Yellow
        Set-ExecutionPolicy Bypass -Scope Process -Force
        [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072
        iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))
        refreshenv
    }
    
    # Install PostgreSQL
    if (-not (Test-Command "psql")) {
        Write-Host "Installing PostgreSQL..." -ForegroundColor Yellow
        choco install postgresql --params '/Password:postgres' -y
        refreshenv
    } else {
        Write-Host "✅ PostgreSQL already installed" -ForegroundColor Green
    }
    
    # Install Redis
    if (-not (Test-Command "redis-server")) {
        Write-Host "Installing Redis..." -ForegroundColor Yellow
        choco install redis-64 -y
        refreshenv
    } else {
        Write-Host "✅ Redis already installed" -ForegroundColor Green
    }
}

# Start services
Write-Host "🔧 Starting services..." -ForegroundColor Blue

# Start PostgreSQL service
if (Test-Service "postgresql*") {
    Write-Host "✅ PostgreSQL service is running" -ForegroundColor Green
} else {
    Write-Host "Starting PostgreSQL service..." -ForegroundColor Yellow
    try {
        $pgService = Get-Service -Name "postgresql*" | Select-Object -First 1
        Start-Service $pgService.Name
        Write-Host "✅ PostgreSQL service started" -ForegroundColor Green
    } catch {
        Write-Host "❌ Failed to start PostgreSQL service. Please start it manually." -ForegroundColor Red
        Write-Host "   Try: Services.msc -> Find PostgreSQL service -> Start" -ForegroundColor Yellow
    }
}

# Start Redis service
if (Test-Service "Redis") {
    Write-Host "✅ Redis service is running" -ForegroundColor Green
} else {
    Write-Host "Starting Redis service..." -ForegroundColor Yellow
    try {
        Start-Service "Redis"
        Write-Host "✅ Redis service started" -ForegroundColor Green
    } catch {
        Write-Host "⚠️  Redis service not found. Starting Redis manually..." -ForegroundColor Yellow
        Start-Process "redis-server" -WindowStyle Hidden
        Start-Sleep 2
        Write-Host "✅ Redis started manually" -ForegroundColor Green
    }
}

# Setup database
Write-Host "🗄️  Setting up database..." -ForegroundColor Blue

$env:PGPASSWORD = "postgres"
try {
    # Test connection
    $null = psql -U postgres -c "SELECT 1;" 2>$null
    
    # Create database and user
    Write-Host "Creating database and user..." -ForegroundColor Yellow
    psql -U postgres -c "CREATE DATABASE skybound_realms_dev;" 2>$null
    psql -U postgres -c "CREATE USER skybound_dev WITH PASSWORD 'dev_password_123';" 2>$null
    psql -U postgres -c "GRANT ALL PRIVILEGES ON DATABASE skybound_realms_dev TO skybound_dev;" 2>$null
    psql -U postgres -c "ALTER USER skybound_dev CREATEDB;" 2>$null
    
    Write-Host "✅ Database setup completed" -ForegroundColor Green
} catch {
    Write-Host "❌ Database setup failed. Please run manually:" -ForegroundColor Red
    Write-Host "   psql -U postgres" -ForegroundColor Yellow
    Write-Host "   CREATE DATABASE skybound_realms_dev;" -ForegroundColor Yellow
    Write-Host "   CREATE USER skybound_dev WITH PASSWORD 'dev_password_123';" -ForegroundColor Yellow
    Write-Host "   GRANT ALL PRIVILEGES ON DATABASE skybound_realms_dev TO skybound_dev;" -ForegroundColor Yellow
}

# Setup Node.js project
if (-not $SetupOnly) {
    Write-Host "📦 Setting up Node.js project..." -ForegroundColor Blue
    
    # Install npm dependencies
    Write-Host "Installing npm dependencies..." -ForegroundColor Yellow
    npm install
    
    # Copy environment file
    Write-Host "Setting up environment configuration..." -ForegroundColor Yellow
    if (-not (Test-Path ".env")) {
        Copy-Item "config/environments/development.env" ".env"
        Write-Host "✅ Environment file created (.env)" -ForegroundColor Green
    } else {
        Write-Host "✅ Environment file already exists" -ForegroundColor Green
    }
    
    # Run migrations
    Write-Host "Running database migrations..." -ForegroundColor Yellow
    try {
        npm run migrate
        Write-Host "✅ Database migrations completed" -ForegroundColor Green
    } catch {
        Write-Host "⚠️  Migration failed. You can run it manually later with: npm run migrate" -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "🎉 Setup completed!" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Blue
Write-Host "1. Run: npm run dev" -ForegroundColor Yellow
Write-Host "2. Open: http://localhost:3000/api/health" -ForegroundColor Yellow
Write-Host ""
Write-Host "Useful commands:" -ForegroundColor Blue
Write-Host "- npm run dev          # Start development server" -ForegroundColor Yellow
Write-Host "- npm run test         # Run tests" -ForegroundColor Yellow
Write-Host "- npm run migrate      # Run database migrations" -ForegroundColor Yellow
Write-Host "- npm run health-check # Check service health" -ForegroundColor Yellow