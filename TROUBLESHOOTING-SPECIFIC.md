# Troubleshooting Guide for Sports Analytics Project

This guide addresses specific issues encountered in the Sports Analytics project, particularly focusing on Python integration, WebSocket, Redis, MongoDB, and memory management problems.

## Quick Fix

For a comprehensive fix that addresses most common issues, run:

```bash
npm run fix
```

This will:
1. Detect your Python installation
2. Update your .env file with the correct paths
3. Install required Python packages
4. Fix file permissions
5. Check and fix MongoDB and Redis configurations
6. Ensure all Node.js dependencies are installed

## Python Integration Issues

### Issue: "spawn C:\\Python39\\python.exe ENOENT"

This error indicates that the system cannot find the Python executable at the specified path.

**Solutions:**

1. **Verify Python Installation**

   Check if Python is installed at the specified path:
   ```bash
   # Run the diagnostic script
   npm run diagnose
   ```

2. **Update Python Path in .env File**

   If Python is installed but at a different location, update your `.env` file:
   ```
   PYTHON_PATH=C:\correct\path\to\python.exe
   PYTHON_EXECUTABLE=C:\correct\path\to\python.exe
   ```

3. **Install Python if Missing**

   If Python is not installed, download and install it from [python.org](https://www.python.org/downloads/).
   
   Make sure to check "Add Python to PATH" during installation.

4. **Use Python Launcher**

   If you have multiple Python versions, use the Python launcher:
   ```
   PYTHON_PATH=py
   PYTHON_EXECUTABLE=py
   ```

### Issue: Python Process Termination Problems

**Solutions:**

1. **Update PythonBridge Implementation**

   The `pythonBridge.js` file has been updated to properly track and terminate Python processes. Make sure you're using the latest version.

2. **Force Kill Python Processes**

   If processes are still hanging:
   ```bash
   # Windows
   taskkill /F /IM python.exe
   
   # macOS/Linux
   pkill -9 python
   ```

3. **Increase Process Termination Timeout**

   In your `.env` file:
   ```
   PYTHON_PROCESS_TERMINATION_TIMEOUT=10000
   ```

## WebSocket Connection Issues

### Issue: WebSocket Connection Closures

**Solutions:**

1. **Check Port Availability**

   ```bash
   # Run the diagnostic script
   npm run diagnose
   ```

2. **Update WebSocket Port**

   If the default port (5150) is in use, update your `.env` file:
   ```
   WS_PORT=5151
   ```

3. **Check Firewall Settings**

   Ensure your firewall allows connections to the WebSocket port.

4. **Increase Connection Timeout**

   In your `.env` file:
   ```
   WS_CLIENT_TIMEOUT=60000
   WS_HEARTBEAT_INTERVAL=30000
   ```

## Redis Connection Issues

### Issue: Redis Initialization Failures

**Solutions:**

1. **Verify Redis Installation**

   ```bash
   # Check if Redis is installed and running
   redis-cli ping
   ```

2. **Start Redis if Not Running**

   ```bash
   # Windows (if using Redis Windows port)
   redis-server
   
   # macOS
   brew services start redis
   
   # Linux
   sudo systemctl start redis
   ```

3. **Configure Redis Connection**

   Update your `.env` file with the correct Redis configuration:
   ```
   REDIS_HOST=localhost
   REDIS_PORT=6379
   REDIS_PASSWORD=
   REDIS_CONNECT_TIMEOUT=10000
   ```

4. **Use In-Memory Fallback**

   If Redis is not available, enable the in-memory fallback:
   ```
   USE_IN_MEMORY_CACHE=true
   ```

## MongoDB Connection Issues

### Issue: MongoDB Connection Failures

**Solutions:**

1. **Verify MongoDB Installation**

   ```bash
   # Check if MongoDB is installed
   mongod --version
   ```

2. **Start MongoDB if Not Running**

   ```bash
   # Windows
   net start MongoDB
   
   # macOS
   brew services start mongodb-community
   
   # Linux
   sudo systemctl start mongod
   ```

3. **Configure MongoDB Connection**

   Update your `.env` file with the correct MongoDB URI:
   ```
   MONGODB_URI=mongodb://localhost:27017/sports-analytics
   MONGODB_DB_NAME=sports-analytics
   ```

4. **Test MongoDB Connection**

   ```bash
   npm run test:mongodb
   ```

## Memory Management Issues

### Issue: High Memory Usage in CacheManager

**Solutions:**

1. **Reduce Cache Size**

   Update your `.env` file:
   ```
   CACHE_MAX_ITEMS=250
   CACHE_TTL=900
   ```

2. **Enable Aggressive Garbage Collection**

   ```
   ENABLE_AGGRESSIVE_GC=true
   ```

3. **Increase Memory Threshold**

   ```
   MEMORY_USAGE_THRESHOLD=0.90
   ```

4. **Disable Performance Logging**

   ```
   ENABLE_PERFORMANCE_LOGGING=false
   ```

## HTTP Server Issues

### Issue: HTTP Server Not Running

**Solutions:**

1. **Check Port Availability**

   ```bash
   # Windows
   netstat -ano | findstr :5000
   
   # macOS/Linux
   lsof -i :5000
   ```

2. **Change Port**

   If the port is in use, update your `.env` file:
   ```
   PORT=5001
   ```

3. **Check for Process Conflicts**

   Kill any processes using the required ports:
   ```bash
   # Windows (replace PID with the process ID)
   taskkill /F /PID PID
   
   # macOS/Linux
   kill -9 PID
   ```

## Timestamp Issues

### Issue: Unusual Timestamps (e.g., March 5, 2025, 27:31)

This indicates a potential issue with the system clock or timestamp formatting.

**Solutions:**

1. **Check System Clock**

   Ensure your system clock is set correctly.

2. **Fix Timestamp Formatting**

   The timestamp format in the logs may be incorrect. Check the logger configuration in your application.

## Missing Node.js Modules

### Issue: Missing Node.js Modules (e.g., @opentelemetry/exporter-trace-otlp-http)

This indicates that some required Node.js modules are not installed.

**Solutions:**

1. **Install Missing Modules**

   Run the following command to install the missing modules:
   ```bash
   npm install @opentelemetry/exporter-trace-otlp-http
   ```

2. **Run Diagnostics**

   Ensure all required modules are installed by running:
   ```bash
   npm run diagnose
   ```

## Step-by-Step Recovery Plan

If you're experiencing multiple issues, follow this step-by-step recovery plan:

1. **Run Diagnostics**
   ```bash
   npm run diagnose
   ```

2. **Fix Environment**
   ```bash
   npm run fix
   ```

3. **Verify Python Integration**
   ```bash
   npm run verify:python
   ```

4. **Test MongoDB Connection**
   ```bash
   npm run test:mongodb
   ```

5. **Start the Application with Verification**
   ```bash
   npm run setup
   ```

## Additional Resources

- Check the main `README.md` file for general setup instructions
- Consult the `TROUBLESHOOTING.md` file for more general troubleshooting tips
- Review the logs in the `logs` directory for detailed error information

If you continue to experience issues after trying these solutions, please open an issue on the project repository or contact the development team.