# Quick Fix Guide for Sports Analytics Project

This guide provides simple steps to fix common issues with the Sports Analytics project, particularly focusing on Python integration, Redis, WebSocket, and memory management problems.

## Quick Fix Commands

### 1. Fix Python Path Issues

If you're seeing `spawn C:\Python39\python.exe ENOENT` errors:

```bash
npm run fix:python
```

This will:
- Detect your Python installation
- Test if it works properly
- Update your .env file with the correct path

### 2. Run Quick Diagnostics

To quickly check your system and identify issues:

```bash
npm run diagnose
```

This will check:
- Python installation and path
- Critical files and directories
- Environment configuration
- Node.js dependencies

### 3. Fix All Environment Issues

For a comprehensive fix of all issues:

```bash
npm run fix
```

This will:
- Fix Python path and installation
- Configure Redis to use in-memory fallback if needed
- Resolve port conflicts
- Fix file permissions and dependencies
- Update all configuration settings

### 4. Complete Setup and Start

To fix everything and start the application:

```bash
npm run setup
```

## Step-by-Step Manual Fix

If the automatic fixes don't work, follow these manual steps:

### 1. Fix Python Path

1. Find your Python installation:
   - Check if Python is installed at `C:\Python39\python.exe`
   - If not, find where it's installed (try `where python` in command prompt)

2. Create or update your `.env` file with:
   ```
   PYTHON_PATH=C:\path\to\your\python.exe
   PYTHON_EXECUTABLE=C:\path\to\your\python.exe
   ```

3. Test if Python works:
   ```bash
   "C:\path\to\your\python.exe" --version
   ```

### 2. Fix Redis Issues

1. Add this to your `.env` file to use in-memory fallback:
   ```
   USE_IN_MEMORY_CACHE=true
   ```

2. If you want to use Redis, make sure it's installed and running:
   ```bash
   # Check if Redis is running
   redis-cli ping
   ```

### 3. Fix Port Conflicts

1. Change the ports in your `.env` file:
   ```
   PORT=5001
   WS_PORT=5151
   ```

### 4. Fix Memory Issues

1. Add these settings to your `.env` file:
   ```
   MEMORY_USAGE_THRESHOLD=0.90
   CACHE_MAX_ITEMS=250
   ENABLE_AGGRESSIVE_GC=true
   ENABLE_PERFORMANCE_LOGGING=false
   ```

## Verifying the Fix

After applying the fixes, you should:

1. Run the application:
   ```bash
   npm start
   ```

2. Check that:
   - No Python ENOENT errors appear
   - Redis connects or uses in-memory fallback
   - WebSocket and HTTP servers start properly
   - Memory usage remains stable

## Still Having Issues?

If you're still experiencing problems:

1. Run the full diagnostic:
   ```bash
   npm run diagnose:full
   ```

2. Check the logs in the `logs` directory

3. Consult the detailed troubleshooting guide:
   ```bash
   cat TROUBLESHOOTING-SPECIFIC.md
   ```

4. Try running with Node.js debugging:
   ```bash
   npm run dev:debug
   ```