@echo off
cls
echo ========================================================================
echo    SPORTS ANALYTICS ENTERPRISE PLATFORM v2.1 - SPORTDB MODE
echo ========================================================================
echo.

REM Set environment variables for SportDB integration
set NODE_ENV=development
set PORT=8000
set ENABLE_MEMORY_MONITORING=true
set GC_INTERVAL=300000
set API_RATE_LIMIT=100
set API_RATE_WINDOW=300000
set USE_ADVANCED_MODEL=true
set USE_SPORTDB_API=true
set SPORTDB_API_KEY=3
set SPORTDB_API_URL=https://www.thesportsdb.com/api/v1/json/3
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
if not exist "temp" mkdir temp

echo [3/4] Initializing prediction engines...
echo   * Basic prediction engine...
python scripts\basic_prediction.py "initialize" "system" >nul 2>&1
echo   * Advanced prediction engine...
python scripts\advanced_prediction.py "initialize" "system" >nul 2>&1

echo [4/4] Starting server with direct SportDB integration...
echo.
echo ========================================================================
echo    SPORTS ANALYTICS PLATFORM - SPORTDB INTEGRATION
echo    - Development Mode: ENABLED  
echo    - Memory Monitoring: ENABLED
echo    - SportDB API: ENABLED
echo    - ML Prediction Engine: ENABLED
echo ========================================================================
echo.
echo Starting server. Please wait...
echo.

node server-direct.js

echo.
echo Server stopped. Press any key to exit...
pause >nul 