"""
Dependency Installation Script for Sports Analytics Pro
Version: 1.0.0
"""

import os
import sys
import subprocess
import platform
from pathlib import Path

def install_dependencies():
    """Install all required dependencies"""
    print("Installing dependencies...")
    
    try:
        # Upgrade pip first
        subprocess.check_call([sys.executable, "-m", "pip", "install", "--upgrade", "pip"])
        
        # Install TA-Lib using pre-built wheel for Windows
        if platform.system() == "Windows":
            python_version = f"{sys.version_info.major}{sys.version_info.minor}"
            wheel_url = f"https://download.lfd.uci.edu/pythonlibs/archived/TA_Lib-0.4.24-cp{python_version}-cp{python_version}-win_amd64.whl"
            subprocess.check_call([sys.executable, "-m", "pip", "install", wheel_url])
        
        # Install other requirements
        subprocess.check_call([sys.executable, "-m", "pip", "install", "-r", "requirements.txt"])
        print("All dependencies installed successfully!")
    except subprocess.CalledProcessError as e:
        print(f"Error installing dependencies: {e}")
        sys.exit(1)

if __name__ == "__main__":
    install_dependencies() 