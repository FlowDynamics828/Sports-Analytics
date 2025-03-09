#!/bin/bash
# Optimized startup script for Sports Analytics

# Set Node.js options for better memory management
export NODE_OPTIONS="--max-old-space-size=4096 --expose-gc"

# Create logs directory if it doesn't exist
mkdir -p logs

# Check if Python is available
echo "Checking Python environment..."
python --version || python3 --version || echo "Python not found, will use fallback mode"

# Install Python dependencies if needed
if command -v pip &> /dev/null; then
  echo "Installing Python dependencies..."
  pip install -r requirements.txt || pip3 install -r requirements.txt || echo "Failed to install Python dependencies, will use fallback mode"
  touch .python_deps_installed
fi

# Set environment variables for fallback mode if Python is not available
if ! command -v python &> /dev/null && ! command -v python3 &> /dev/null; then
  echo "Python not found, setting fallback mode"
  export PYTHON_ENABLED=false
fi

# Start the application with memory optimization
echo "Starting Sports Analytics application..."
node --expose-gc server.js