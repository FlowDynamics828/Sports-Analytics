# Sports Analytics Platform Deployment Script
# For Windows environments

# Show startup banner
Write-Host "=======================================================" -ForegroundColor Cyan
Write-Host "   Sports Analytics Platform Deployment" -ForegroundColor Cyan
Write-Host "=======================================================" -ForegroundColor Cyan
Write-Host ""

# Check if running as admin
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "Warning: This script is not running as administrator. Some operations may fail." -ForegroundColor Yellow
    Write-Host "Press any key to continue or Ctrl+C to abort..."
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
}

# Create required directories
Write-Host "Phase 1: Creating required directories..." -ForegroundColor Green
$directories = @(
    "data",
    "data\embeddings",
    "models",
    "models\nlp",
    "cache",
    "logs",
    "data\feedback"
)

foreach ($dir in $directories) {
    if (-not (Test-Path $dir)) {
        New-Item -Path $dir -ItemType Directory -Force | Out-Null
        Write-Host "  Created directory: $dir" -ForegroundColor Green
    } else {
        Write-Host "  Directory already exists: $dir" -ForegroundColor Gray
    }
}

# Check for Python installation
Write-Host "`nPhase 2: Checking Python environment..." -ForegroundColor Green
try {
    $pythonVersion = python --version
    Write-Host "  $pythonVersion detected" -ForegroundColor Green
    
    # Install required Python packages
    Write-Host "  Installing Python dependencies..." -ForegroundColor Green
    python -m pip install -r requirements.txt
    
    # Download spaCy model
    Write-Host "  Downloading spaCy models..." -ForegroundColor Green
    python -m spacy download en_core_web_sm
} catch {
    Write-Host "  Error: Python not found or error during package installation" -ForegroundColor Red
    Write-Host "  Please install Python 3.8+ and try again" -ForegroundColor Red
    exit 1
}

# Check and install Node.js dependencies
Write-Host "`nPhase 3: Setting up Node.js environment..." -ForegroundColor Green
try {
    $nodeVersion = node --version
    Write-Host "  Node.js $nodeVersion detected" -ForegroundColor Green
    
    # Install required npm packages
    Write-Host "  Installing Node.js dependencies..." -ForegroundColor Green
    npm install
    
    # Check for required frontend dependencies
    $packageJsonExists = Test-Path "package.json"
    if ($packageJsonExists) {
        $packageJson = Get-Content "package.json" | ConvertFrom-Json
        $requiredDeps = @("d3", "chart.js")
        $missing = @()
        
        foreach ($dep in $requiredDeps) {
            if (-not $packageJson.dependencies.$dep) {
                $missing += $dep
            }
        }
        
        if ($missing.Count -gt 0) {
            Write-Host "  Installing missing frontend dependencies: $($missing -join ', ')" -ForegroundColor Yellow
            npm install --save $missing
        }
    }
} catch {
    Write-Host "  Error: Node.js not found or error during package installation" -ForegroundColor Red
    Write-Host "  Please install Node.js 14+ and try again" -ForegroundColor Red
    exit 1
}

# Check MongoDB
Write-Host "`nPhase 4: Checking MongoDB..." -ForegroundColor Green
try {
    # Check if MongoDB is installed and running
    $mongoStatus = Get-Service *MongoDB* -ErrorAction SilentlyContinue
    if ($mongoStatus -and $mongoStatus.Status -eq "Running") {
        Write-Host "  MongoDB service is running" -ForegroundColor Green
    } else {
        Write-Host "  Warning: MongoDB service not found or not running" -ForegroundColor Yellow
        Write-Host "  Please ensure MongoDB is installed and running" -ForegroundColor Yellow
    }
} catch {
    Write-Host "  Error checking MongoDB: $_" -ForegroundColor Red
}

# Check Redis
Write-Host "`nPhase 5: Checking Redis..." -ForegroundColor Green
try {
    # Check if Redis is installed and running
    $redisStatus = Get-Service *Redis* -ErrorAction SilentlyContinue
    if ($redisStatus -and $redisStatus.Status -eq "Running") {
        Write-Host "  Redis service is running" -ForegroundColor Green
    } else {
        Write-Host "  Warning: Redis service not found or not running" -ForegroundColor Yellow
        Write-Host "  Please ensure Redis is installed and running" -ForegroundColor Yellow
        
        # Option to run Redis in Docker
        Write-Host "  Do you want to start Redis in Docker? (Y/N)" -ForegroundColor Yellow
        $response = Read-Host
        if ($response -eq "Y" -or $response -eq "y") {
            Write-Host "  Starting Redis in Docker..." -ForegroundColor Green
            docker run -d --name redis-cache -p 6379:6379 redis
        }
    }
} catch {
    Write-Host "  Error checking Redis: $_" -ForegroundColor Red
}

# Run verification script
Write-Host "`nPhase 6: Running verification script..." -ForegroundColor Green
try {
    node scripts/verify_connections.js
} catch {
    Write-Host "  Error running verification script: $_" -ForegroundColor Red
}

# Build frontend (if needed)
Write-Host "`nPhase 7: Building frontend..." -ForegroundColor Green
try {
    npm run build
} catch {
    Write-Host "  Error building frontend: $_" -ForegroundColor Red
}

# Deployment summary
Write-Host "`n=======================================================" -ForegroundColor Cyan
Write-Host "   Deployment Complete" -ForegroundColor Cyan
Write-Host "=======================================================" -ForegroundColor Cyan

Write-Host "`nTo start the REST API:"
Write-Host "  python -m scripts.premium_prediction_api" -ForegroundColor Yellow

Write-Host "`nTo start the web server:"
Write-Host "  npm start" -ForegroundColor Yellow

Write-Host "`nTo use GraphQL API once server is running:"
Write-Host "  http://localhost:8000/graphql" -ForegroundColor Yellow

Write-Host "`nThank you for using Sports Analytics Platform!" -ForegroundColor Green 