@echo off
REM This script runs the sports analytics Flask server

echo Installing requirements...
pip install flask flask-cors requests

echo Starting Flask server...
python api.py

pause 