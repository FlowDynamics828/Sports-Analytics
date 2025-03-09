#!/bin/bash
# Optimized startup script for Sports Analytics

# Set Node.js options for better memory management
export NODE_OPTIONS="--max-old-space-size=2048 --expose-gc"

# Check if Python is available
echo "Checking Python environment..."
python --version || python3 --version

# Install Python dependencies if needed
if [ ! -f ".python_deps_installed" ]; then
  echo "Installing Python dependencies..."
  pip install -r requirements.txt || pip3 install -r requirements.txt
  touch .python_deps_installed
fi

# Check MongoDB connection
echo "Checking MongoDB connection..."
node scripts/test-mongodb-connection.js

# Start the application with memory optimization
echo "Starting Sports Analytics application..."
node --expose-gc startup.js