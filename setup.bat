@echo off
echo Setting up Sports Analytics Pro...

REM Install requirements
pip install flask flask-cors requests

REM Create necessary directories and placeholders
python setup_directories.py

echo Setup complete!
echo.
echo To start the server, run: python api.py
echo Or you can use the run_server.bat file
echo.
echo Then access the site at: http://localhost:5000
echo.
pause 