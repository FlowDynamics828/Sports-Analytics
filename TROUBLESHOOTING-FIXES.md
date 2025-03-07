# Sports Analytics - Troubleshooting Fixes

This document provides instructions for fixing common issues with the Sports Analytics application.

## Quick Fix Commands

If you're experiencing issues with the application, you can use the following commands to fix them:

```bash
# Fix all issues at once
npm run fix:all

# Fix Python path issues
npm run fix:python

# Fix Redis connection issues
npm run fix:redis

# Fix memory management issues
npm run fix:memory

# Run quick diagnostics
npm run diagnose

# Run detailed diagnostics
npm run diagnose:full

# Start the application with optimized settings
npm run fix:all
npm run start:optimized
```

## Issues Fixed

### 1. Python Path Issues

**Problem**: The application fails to find the Python executable or the predictive model script.

**Solution**: The `fix:python` script:
- Detects your Python installation
- Tests if it works properly
- Updates your .env file with the correct path
- Creates a basic predictive model script if needed

### 2. Redis Connection Issues

**Problem**: Redis connections fail with "Connection is closed" errors.

**Solution**: The `fix:redis` script:
- Checks if Redis is installed and running
- Enables in-memory cache fallback if Redis is not available
- Updates Redis connection settings for better reliability
- Provides instructions for installing Redis if needed

### 3. Memory Management Issues

**Problem**: The application experiences high memory usage and potential memory leaks.

**Solution**: The `fix:memory` script:
- Analyzes your system's memory resources
- Updates memory management settings in .env
- Fixes common memory leak issues in WebSocket server
- Adds optimized start script with increased memory limit

### 4. Path Inconsistency Issues

**Problem**: The application looks for the Python script in different locations.

**Solution**: The `pythonBridge.js` file has been updated to:
- Check multiple possible script locations
- Provide detailed logging of script path resolution
- Ensure the correct script directory is used for execution

## Detailed Usage Instructions

### Fix All Issues

To fix all issues at once, run:

```bash
npm run fix:all
```

This will:
1. Fix Python path issues
2. Fix Redis connection issues
3. Fix memory management issues
4. Update package.json with optimized scripts
5. Update .env file with optimized settings

### Fix Python Path Issues

To fix Python path issues, run:

```bash
npm run fix:python
```

This will:
1. Detect your Python installation
2. Test if it works properly
3. Update your .env file with the correct path
4. Create a basic predictive model script if needed

### Fix Redis Connection Issues

To fix Redis connection issues, run:

```bash
npm run fix:redis
```

This will:
1. Check if Redis is installed and running
2. Enable in-memory cache fallback if Redis is not available
3. Update Redis connection settings for better reliability
4. Provide instructions for installing Redis if needed

### Fix Memory Management Issues

To fix memory management issues, run:

```bash
npm run fix:memory
```

This will:
1. Analyze your system's memory resources
2. Update memory management settings in .env
3. Fix common memory leak issues in WebSocket server
4. Add optimized start script with increased memory limit

### Run Diagnostics

To run quick diagnostics, run:

```bash
npm run diagnose
```

To run detailed diagnostics, run:

```bash
npm run diagnose:full
```

### Start with Optimized Settings

To start the application with optimized settings, run:

```bash
npm run start:optimized
```

This will start the application with increased memory limit and optimized settings.

## Troubleshooting During Runtime

If you encounter memory issues during runtime, you can run:

```bash
npm run optimize:memory
```

This will:
1. Analyze memory usage
2. Perform memory optimization
3. Clear caches and trigger garbage collection
4. Provide recommendations for further optimization

## Additional Resources

- Check the main `README.md` file for general setup instructions
- Consult the `TROUBLESHOOTING.md` file for more general troubleshooting tips
- Review the logs in the `logs` directory for detailed error information

If you continue to experience issues after trying these solutions, please open an issue on the project repository or contact the development team.