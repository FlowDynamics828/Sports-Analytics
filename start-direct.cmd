@echo off
cls
echo ========================================================================
echo    SPORTS ANALYTICS ENTERPRISE PLATFORM v2.1 - DIRECT MODE
echo ========================================================================
echo.

REM Set environment variables for direct mode
set NODE_ENV=development
set PORT=8000
set ENABLE_MEMORY_MONITORING=true
set GC_INTERVAL=300000
set MONGO_URI=mongodb://localhost:27017/sportsdb
set MONGO_DB_NAME=sportsanalytics
set MONGO_CONNECT_TIMEOUT=5000
set MONGO_SOCKET_TIMEOUT=30000
set MONGO_MAX_POOL_SIZE=20
set MONGO_MIN_POOL_SIZE=5
set API_RATE_LIMIT=100
set API_RATE_WINDOW=300000
set USE_ADVANCED_MODEL=true
set USE_MONGODB_FALLBACK=true
set API_TIMEOUT=15000

echo [1/4] Terminating any existing node processes...
taskkill /F /IM node.exe >nul 2>&1
timeout /t 2 >nul

echo [2/4] Creating required directories...
if not exist "data" mkdir data
if not exist "data\prediction_cache" mkdir data\prediction_cache
if not exist "logs" mkdir logs
if not exist "models" mkdir models
if not exist "models\ml" mkdir models\ml
if not exist "models\nlp" mkdir models\nlp
if not exist "data\embeddings" mkdir data\embeddings
if not exist "public\img" mkdir public\img
if not exist "public\img\leagues" mkdir public\img\leagues

echo [3/4] Initializing prediction engines...
echo   * Basic prediction engine...
python scripts\basic_prediction.py "initialize" "system" >nul 2>&1
echo   * Advanced prediction engine...
python scripts\advanced_prediction.py "initialize" "system" >nul 2>&1

echo [4/4] Starting server in direct mode...
echo.
echo ========================================================================
echo    SPORTS ANALYTICS PLATFORM - DIRECT MODE
echo    - Development Mode: ENABLED
echo    - Memory Monitoring: ENABLED
echo    - MongoDB Fallback: ENABLED
echo    - ML Prediction Engine: ENABLED
echo ========================================================================
echo.
echo Starting server. Please wait...
echo.

node server-direct.js

echo.
echo Server stopped. Press any key to exit...
pause >nul 