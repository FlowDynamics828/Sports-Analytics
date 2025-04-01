@echo off
echo ===============================================
echo   Sports Analytics Enterprise Platform Starter
echo ===============================================
echo.

echo Step 1: Terminating any existing node processes...
taskkill /F /IM node.exe >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo - Successfully terminated existing Node.js processes
) else (
    echo - No Node.js processes found running
)
echo.

echo Step 2: Clearing any temporary files...
if exist "temp" (
    rmdir /S /Q "temp" >nul 2>&1
    mkdir "temp" >nul 2>&1
) else (
    mkdir "temp" >nul 2>&1
)
echo - Temporary files cleared
echo.

echo Step 3: Creating essential directories...
if not exist "data\prediction_cache" mkdir "data\prediction_cache" >nul 2>&1
if not exist "models\nlp" mkdir "models\nlp" >nul 2>&1
if not exist "data\embeddings" mkdir "data\embeddings" >nul 2>&1
echo - Directory structure verified
echo.

echo Step 4: Starting the Enterprise Platform...
echo - Mode: Production Optimized
echo - Starting Time: %TIME%
echo.
echo The platform will start with enterprise-grade clustering 
echo and memory optimization. Please wait...
echo.

node start-optimized.js

echo.
echo If the platform did not start correctly, please try the following:
echo 1. Check logs in the logs directory
echo 2. Run "node server.js" for single-process mode
echo 3. Contact system administrator if problems persist
echo.
pause 