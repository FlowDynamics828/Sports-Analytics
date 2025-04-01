#!/bin/bash

echo "======================================================"
echo "Sports Analytics Platform - Comprehensive Verification"
echo "======================================================"
echo ""

echo "Checking for required dependencies..."
if ! command -v node &> /dev/null; then
    echo "Node.js is not installed or not in the PATH."
    echo "Please install Node.js from https://nodejs.org/"
    exit 1
fi

echo "Checking if MongoDB is running..."
if ! command -v mongod &> /dev/null; then
    echo "MongoDB is not installed or not in the PATH."
    echo "Continuing with verification, but local MongoDB tests may fail."
else
    if ! pgrep -x "mongod" > /dev/null; then
        echo "MongoDB is not running. Attempting to start..."
        
        # Try different methods to start MongoDB depending on OS
        if [[ "$OSTYPE" == "darwin"* ]]; then
            # macOS
            if command -v brew &> /dev/null; then
                brew services start mongodb-community || brew services start mongodb
            else
                echo "Could not start MongoDB. Please start it manually."
            fi
        else
            # Linux
            if command -v systemctl &> /dev/null; then
                sudo systemctl start mongod
            elif command -v service &> /dev/null; then
                sudo service mongod start
            else
                echo "Could not start MongoDB. Please start it manually."
            fi
        fi
        
        echo "Waiting for MongoDB to start..."
        sleep 5
    else
        echo "MongoDB is already running."
    fi
fi

echo "Checking for required npm packages..."
if ! npm list mongodb mongoose axios express dotenv &> /dev/null; then
    echo "Installing required dependencies..."
    npm install mongodb mongoose axios express dotenv cors body-parser helmet compression
fi

echo ""
echo "Step 1: Stopping any running server instances..."
pkill -f "node server.js" || true
sleep 2

echo ""
echo "Step 2: Starting the main server (server.js)..."
nohup node server.js > logs/server.log 2>&1 &
SERVER_PID=$!
echo "Server starting with PID: $SERVER_PID... waiting 10 seconds for startup"
sleep 10

echo ""
echo "Step 3: Running comprehensive verification script..."
node test-verification.js

echo ""
echo "Step 4: Checking for verification results..."
if [ -f "logs/verification-results.json" ]; then
    echo "Results saved to logs/verification-results.json"
    echo ""
    echo "Summary of verification results:"
    grep "status" logs/verification-results.json
else
    echo "No verification results found."
fi

echo ""
echo "Verification process complete."
read -p "Press Enter to shutdown the server and exit..."

echo "Shutting down the server..."
kill $SERVER_PID 2>/dev/null || pkill -f "node server.js" || true

echo "Done!" 