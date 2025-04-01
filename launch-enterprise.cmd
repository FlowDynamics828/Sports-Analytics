@echo off
cls
echo ========================================================================
echo    SPORTS ANALYTICS ENTERPRISE PLATFORM v2.0 - PRODUCTION LAUNCHER
echo ========================================================================
echo.

REM Set environment variables for production
set NODE_ENV=production
set PORT=8000
set ENABLE_MEMORY_MONITORING=true
set GC_INTERVAL=300000
set MONGO_CONNECT_TIMEOUT=10000
set MONGO_SOCKET_TIMEOUT=60000
set MONGO_MAX_POOL_SIZE=100
set MONGO_MIN_POOL_SIZE=10
set API_RATE_LIMIT=100
set API_RATE_WINDOW=300000
set USE_ADVANCED_MODEL=true

echo [1/5] Terminating any existing node processes...
taskkill /F /IM node.exe >nul 2>&1
timeout /t 2 >nul

echo [2/5] Performing system checks...
REM Check Python installation
python --version >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Python is not installed or not in PATH
    echo Please install Python 3.8+ and try again
    goto ERROR_EXIT
)

REM Check Node.js installation
node --version >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Node.js is not installed or not in PATH
    echo Please install Node.js 16+ and try again
    goto ERROR_EXIT
)

echo [3/5] Creating required directories...
if not exist "data" mkdir data
if not exist "data\prediction_cache" mkdir data\prediction_cache
if not exist "logs" mkdir logs
if not exist "models" mkdir models
if not exist "models\nlp" mkdir models\nlp
if not exist "models\ml" mkdir models\ml
if not exist "data\embeddings" mkdir data\embeddings

echo [4/5] Initializing prediction engines...
echo   • Basic prediction engine...
python scripts\basic_prediction.py "initialize" "system" >nul 2>&1
echo   • Advanced prediction engine...
python scripts\advanced_prediction.py "initialize" "system" >nul 2>&1

echo [5/5] Starting enterprise platform with optimized settings...
echo.
echo ========================================================================
echo    SPORTS ANALYTICS ENTERPRISE PLATFORM IS STARTING
echo    - Production Mode: ENABLED
echo    - Clustering: ENABLED (Multi-Core)
echo    - Memory Monitoring: ENABLED
echo    - Advanced Caching: ENABLED
echo    - MongoDB Fallback: ENABLED
echo    - ML Prediction Engine: v3.0.0
echo    - Basic Prediction Engine: v2.1.0
echo ========================================================================
echo.
echo Starting time: %TIME%
echo.
echo Use Ctrl+C to shutdown the server
echo.

node start-optimized.js

:ERROR_EXIT
echo.
echo Press any key to exit...
pause >nul 