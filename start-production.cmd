@echo off
echo ============================================
echo SPORTS ANALYTICS PLATFORM - PRODUCTION START
echo ============================================
echo.

echo Checking for NODE.JS...
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
  echo ERROR: Node.js is required but not found!
  echo Please install Node.js from https://nodejs.org/
  exit /b 1
)

echo Checking for NPM packages...
if not exist node_modules (
  echo Installing NPM packages...
  npm install
)

echo.
echo [1] Setting production environment variables...
set NODE_ENV=production
set PORT=8000
set WS_PORT=8081
set MEMORY_THRESHOLD=0.7
set GC_INTERVAL=300000
set LOG_LEVEL=info

echo.
echo [2] CRITICAL: Setting MongoDB Atlas connection...
set MONGO_URI=mongodb+srv://SportAnalytics:Studyhard%%402034@cluster0.et16d.mongodb.net/sports-analytics?retryWrites=true
set MONGODB_URI=mongodb+srv://SportAnalytics:Studyhard%%402034@cluster0.et16d.mongodb.net/sports-analytics?retryWrites=true
set MONGO_DB_NAME=sports-analytics
set MONGODB_DB_NAME=sports-analytics

echo.
echo [3] Starting production server with optimized settings...
node --expose-gc --max-old-space-size=4096 server.js

echo.
if %ERRORLEVEL% NEQ 0 (
  echo ERROR: Server startup failed!
  exit /b 1
) else (
  echo Server running successfully!
) 