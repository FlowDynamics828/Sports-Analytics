# Sports Analytics Platform - Troubleshooting Guide

This guide provides solutions for common issues encountered when running the Sports Analytics Platform.

## Quick Start for Fixing Issues

If you're experiencing issues with the application freezing or shutting down after initialization, follow these steps:

1. **Run the diagnostic tool**:
   ```bash
   npm run diagnose:full
   ```

2. **Fix Python path issues**:
   ```bash
   npm run fix:python
   ```

3. **Start with the enhanced startup script**:
   ```bash
   npm start
   ```

## Common Issues and Solutions

### 1. Python Path Configuration Issues

**Symptoms**:
- Error: `spawn C:\Python39\python.exe ENOENT`
- Python scripts fail to execute
- Application crashes during initialization

**Solutions**:
1. Run the Python path fix tool:
   ```bash
   npm run fix:python
   ```

2. Manually update the `.env` file with the correct Python path:
   ```
   PYTHON_PATH=python
   PYTHON_EXECUTABLE=python
   ```

3. If you have Python installed in a specific location, use that path:
   ```
   PYTHON_PATH=C:\path\to\your\python.exe
   PYTHON_EXECUTABLE=C:\path\to\your\python.exe
   ```

### 2. Redis Connection Problems

**Symptoms**:
- Redis connection errors
- "Connection is closed" errors
- Cache operations failing

**Solutions**:
1. Enable in-memory cache fallback by setting in `.env`:
   ```
   USE_IN_MEMORY_CACHE=true
   ```

2. If you want to use Redis, ensure Redis server is running:
   - For Windows: Install Redis using Windows Subsystem for Linux (WSL) or use a Windows Redis port
   - For macOS: `brew install redis && brew services start redis`
   - For Linux: `sudo apt-get install redis-server && sudo systemctl start redis`

3. Update Redis connection settings in `.env`:
   ```
   REDIS_HOST=localhost
   REDIS_PORT=6379
   REDIS_PASSWORD=
   REDIS_CONNECT_TIMEOUT=30000
   ```

### 3. WebSocket Server Issues

**Symptoms**:
- "MaxListenersExceededWarning: Possible EventEmitter memory leak detected"
- High memory usage (80-90%)
- WebSocket connections failing

**Solutions**:
1. Ensure WebSocket port is available and not conflicting with other services:
   ```
   WS_PORT=5150
   ```

2. Adjust WebSocket configuration for better stability:
   ```
   WS_HEARTBEAT_INTERVAL=60000
   WS_CLIENT_TIMEOUT=35000
   ```

3. If memory issues persist, try reducing the maximum connections:
   ```
   MAX_CONNECTIONS_PER_IP=50
   ```

### 4. Memory Management Problems

**Symptoms**:
- High memory usage warnings
- Application becomes slow or unresponsive
- Crashes with "JavaScript heap out of memory" errors

**Solutions**:
1. Adjust memory thresholds in `.env`:
   ```
   MEMORY_USAGE_THRESHOLD=0.85
   CACHE_MAX_ITEMS=500
   ```

2. Enable aggressive garbage collection:
   ```
   ENABLE_AGGRESSIVE_GC=true
   ```

3. Run Node.js with increased memory limit:
   ```bash
   NODE_OPTIONS=--max-old-space-size=4096 npm start
   ```

### 5. MongoDB Connection Issues

**Symptoms**:
- MongoDB connection errors
- "MongoNetworkError: connection timed out" errors
- Database operations failing

**Solutions**:
1. Verify MongoDB connection string in `.env`:
   ```
   MONGODB_URI=mongodb://localhost:27017/sports-analytics
   ```

2. If using MongoDB Atlas, ensure the connection string is correct and includes credentials:
   ```
   MONGODB_URI=mongodb+srv://<username>:<password>@<cluster>.mongodb.net/<database>
   ```

3. Check network connectivity to MongoDB server:
   ```bash
   npm run test:mongodb
   ```

## Advanced Troubleshooting

### Checking Logs

The application logs are stored in the `logs` directory. Check these files for detailed error information:

- `logs/app.log` - General application logs
- `logs/error.log` - Error-specific logs
- `logs/python-bridge.log` - Python integration logs
- `logs/startup.log` - Application startup logs

### Debugging Python Integration

If you're having issues with Python integration:

1. Verify Python is installed and accessible:
   ```bash
   python --version
   ```

2. Check if required Python packages are installed:
   ```bash
   pip list | grep -E "numpy|pandas|scikit-learn|xgboost|lightgbm|pymongo|redis"
   ```

3. Install missing packages:
   ```bash
   pip install numpy pandas scikit-learn xgboost lightgbm pymongo redis hyperopt
   ```

### Debugging WebSocket Issues

For WebSocket-specific issues:

1. Check if the WebSocket port is in use:
   ```bash
   # On Windows
   netstat -ano | findstr 5150
   
   # On macOS/Linux
   netstat -an | grep 5150
   ```

2. Test WebSocket connectivity using a browser console:
   ```javascript
   const ws = new WebSocket('ws://localhost:5150');
   ws.onopen = () => console.log('Connected');
   ws.onerror = (error) => console.error('Error:', error);
   ```

## Complete System Reset

If you're still experiencing issues, you can try a complete system reset:

1. Stop all running instances of the application
2. Clear Redis cache (if using Redis):
   ```bash
   redis-cli flushall
   ```
3. Delete the `logs` directory
4. Run the environment fix script:
   ```bash
   npm run fix
   ```
5. Start the application with a clean state:
   ```bash
   npm start
   ```

## Getting Additional Help

If you're still experiencing issues after trying these solutions, please:

1. Run the full diagnostic tool and save the output:
   ```bash
   npm run diagnose:full > diagnostic-report.txt
   ```

2. Collect relevant logs from the `logs` directory

3. Contact support with these files and a description of the issue you're experiencing.