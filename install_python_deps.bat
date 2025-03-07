@echo off
echo Installing Python dependencies for Sports Analytics predictive model...

REM Check if pip is installed
pip --version > nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo pip not found. Please install Python and pip first.
    exit /b 1
)

REM Upgrade pip, setuptools and wheel first
echo Upgrading pip, setuptools, and wheel...
pip install --upgrade pip setuptools wheel

REM Install dependencies one by one with better error handling
echo Installing core dependencies...
pip install numpy
pip install pandas
echo Installing scikit-learn...
pip install scikit-learn==1.0.2
echo Installing visualization libraries...
pip install matplotlib==3.5.2
echo Installing ML libraries...
pip install xgboost==1.6.1
pip install lightgbm==3.3.2
pip install hyperopt==0.2.7
echo Installing database and service libraries...
pip install pymongo==4.1.1
pip install python-dotenv==0.20.0
pip install redis==4.3.4
pip install prometheus-client==0.14.1
pip install psutil==5.9.1

echo Verifying core installations...
python -c "import numpy; import pandas; import sklearn; print('Core dependencies installed!')"

echo All installation steps completed! Some optional dependencies might require additional configuration.
pause