@echo off
echo Starting Sports Analytics Server...

REM Set the Python executable path from environment variable or use default
if "%PYTHON_EXECUTABLE%"=="" (
    echo Using default Python path
    set PYTHON_EXECUTABLE=python
) else (
    echo Using Python from: %PYTHON_EXECUTABLE%
)

REM Check if Python is installed
%PYTHON_EXECUTABLE% --version >nul 2>&1
if %errorlevel% neq 0 (
    echo Error: Python is not installed or not in PATH.
    echo Please install Python or set PYTHON_EXECUTABLE in your .env file.
    pause
    exit /b 1
)

REM Install required packages if needed
echo Checking/installing required packages...
%PYTHON_EXECUTABLE% -m pip install flask flask-cors pandas numpy requests python-dotenv >nul 2>&1
if %errorlevel% neq 0 (
    echo Warning: Some dependencies could not be installed.
)

REM Start the API server
echo Starting API server...
start "Sports Analytics API" %PYTHON_EXECUTABLE% api.py

REM Wait a moment for the server to start
timeout /t 3 >nul

REM Open the default web browser to the app
echo Opening browser...
start http://localhost:8000

echo Server started successfully!
echo Press any key to shut down the server...
pause >nul

REM Shut down the server when user presses a key
taskkill /FI "WINDOWTITLE eq Sports Analytics API*" /F >nul 2>&1

echo Server has been shut down.
pause 