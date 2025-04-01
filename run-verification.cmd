@echo off
echo ======================================================
echo Sports Analytics Platform - Comprehensive Verification
echo ======================================================
echo.

echo Checking for required dependencies...
where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo Node.js is not installed or not in the PATH.
    echo Please install Node.js from https://nodejs.org/
    exit /b 1
)

echo Checking if MongoDB is running...
mongo --eval "db.version()" >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo MongoDB is not running or not installed.
    echo Starting MongoDB if installed...
    net start MongoDB >nul 2>nul
    if %ERRORLEVEL% neq 0 (
        echo Could not start MongoDB. Please ensure it is installed.
        echo Continuing with verification, but local MongoDB tests may fail.
    ) else (
        echo MongoDB service started successfully.
    )
)

echo Checking for required npm packages...
npm list mongodb mongoose axios express dotenv >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo Installing required dependencies...
    npm install mongodb mongoose axios express dotenv cors body-parser helmet compression
)

echo.
echo Step 1: Stopping any running server instances...
taskkill /f /im node.exe >nul 2>nul
timeout /t 2 >nul

echo.
echo Step 2: Starting the main server (server.js)...
start "Sports Analytics Server" cmd /c "node server.js"
echo Server starting... waiting 10 seconds for startup
timeout /t 10 >nul

echo.
echo Step 3: Running comprehensive verification script...
node test-verification.js

echo.
echo Step 4: Checking for verification results...
if exist "logs\verification-results.json" (
    echo Results saved to logs\verification-results.json
    echo.
    echo Summary of verification results:
    type logs\verification-results.json | findstr "status"
) else (
    echo No verification results found.
)

echo.
echo Verification process complete.
echo Press any key to shutdown the server and exit...
pause >nul

echo Shutting down the server...
taskkill /f /im node.exe >nul 2>nul

echo Done! 