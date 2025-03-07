// startup.js - Enhanced startup script with proper initialization and error handling

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { promisify } = require('util');
const winston = require('winston');
const { format } = winston;

// Configure logging
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: format.combine(
    format.timestamp(),
    format.errors({ stack: true }),
    format.splat(),
    format.json()
  ),
  defaultMeta: { service: 'startup' },
  transports: [
    new winston.transports.File({
      filename: 'logs/startup-error.log',
      level: 'error',
      maxsize: 5000000, // 5MB
      maxFiles: 3
    }),
    new winston.transports.File({
      filename: 'logs/startup.log',
      maxsize: 5000000, // 5MB
      maxFiles: 3
    }),
    new winston.transports.Console({
      format: format.combine(
        format.colorize(),
        format.simple()
      )
    })
  ]
});

// Create logs directory if it doesn't exist
try {
  if (!fs.existsSync('logs')) {
    fs.mkdirSync('logs');
    logger.info('Created logs directory');
  }
} catch (error) {
  console.error('Error creating logs directory:', error);
}

// Verify Python environment
async function verifyPythonEnvironment() {
  logger.info('Verifying Python environment...');
  
  // Get Python path from environment variables
  const pythonPath = process.env.PYTHON_PATH || process.env.PYTHON_EXECUTABLE || 'python';
  
  try {
    // Check if Python executable exists
    if (pythonPath !== 'python') {
      try {
        await promisify(fs.access)(pythonPath);
        logger.info(`Python executable found at: ${pythonPath}`);
      } catch (error) {
        logger.warn(`Python executable not found at configured path: ${pythonPath}`);
        logger.info('Falling back to system Python');
        process.env.PYTHON_PATH = 'python';
        process.env.PYTHON_EXECUTABLE = 'python';
      }
    }
    
    // Test Python execution
    const pythonProcess = spawn(process.env.PYTHON_PATH || 'python', ['-c', 'print("Python verification successful")']);
    
    return new Promise((resolve, reject) => {
      let output = '';
      let errorOutput = '';
      
      pythonProcess.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      pythonProcess.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });
      
      pythonProcess.on('close', (code) => {
        if (code === 0) {
          logger.info('Python verification successful');
          resolve(true);
        } else {
          logger.error(`Python verification failed with code ${code}: ${errorOutput}`);
          resolve(false);
        }
      });
      
      pythonProcess.on('error', (error) => {
        logger.error(`Python process error: ${error.message}`);
        resolve(false);
      });
      
      // Set timeout with increased duration from env or default
      const verificationTimeout = parseInt(process.env.PYTHON_VERIFICATION_TIMEOUT, 10) || 30000;
      setTimeout(() => {
        pythonProcess.kill();
        logger.warn(`Python verification timed out after ${verificationTimeout/1000} seconds`);
        logger.info('Continuing startup despite Python timeout - the application will use fallbacks if needed');
        // Continue with startup even if Python verification times out
        resolve(true);
      }, verificationTimeout);
    });
  } catch (error) {
    logger.error(`Python verification error: ${error.message}`);
    return false;
  }
}

// Verify required files exist
async function verifyRequiredFiles() {
  logger.info('Verifying required files...');
  
  const requiredFiles = [
    'api.js',
    'scripts/predictive_model.py',
    'utils/pythonBridge.js',
    'utils/cache.js',
    'utils/db.js',
    'utils/websocket-server.js'
  ];
  
  const missingFiles = [];
  
  for (const file of requiredFiles) {
    try {
      await promisify(fs.access)(path.join(__dirname, file));
    } catch (error) {
      missingFiles.push(file);
      logger.error(`Required file missing: ${file}`);
    }
  }
  
  if (missingFiles.length > 0) {
    logger.error(`Missing required files: ${missingFiles.join(', ')}`);
    return false;
  }
  
  logger.info('All required files verified');
  return true;
}

// Verify port availability
async function verifyPortAvailability() {
  logger.info('Verifying port availability...');
  
  const net = require('net');
  const httpPort = parseInt(process.env.PORT, 10) || 5050;
  const wsPort = parseInt(process.env.WS_PORT, 10) || 5150;
  
  // Function to check if a port is available
  const isPortAvailable = (port) => {
    return new Promise((resolve) => {
      const server = net.createServer()
        .once('error', () => resolve(false))
        .once('listening', () => {
          server.once('close', () => resolve(true)).close();
        })
        .listen(port);
    });
  };
  
  const httpPortAvailable = await isPortAvailable(httpPort);
  const wsPortAvailable = await isPortAvailable(wsPort);
  
  if (!httpPortAvailable) {
    logger.warn(`HTTP port ${httpPort} is not available. Please update PORT in .env file.`);
  }
  
  if (!wsPortAvailable) {
    logger.warn(`WebSocket port ${wsPort} is not available. Please update WS_PORT in .env file.`);
  }
  
  return httpPortAvailable && wsPortAvailable;
}

// Verify Redis connection
async function verifyRedisConnection() {
  logger.info('Verifying Redis connection...');
  
  // Skip Redis verification if USE_IN_MEMORY_CACHE is true
  if (process.env.USE_IN_MEMORY_CACHE === 'true') {
    logger.info('Using in-memory cache, skipping Redis verification');
    return true;
  }
  
  try {
    const Redis = require('ioredis');
    const redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT, 10) || 6379,
      password: process.env.REDIS_PASSWORD || undefined,
      connectTimeout: 5000
    });
    
    return new Promise((resolve) => {
      redis.on('ready', () => {
        logger.info('Redis connection successful');
        redis.quit();
        resolve(true);
      });
      
      redis.on('error', (error) => {
        logger.warn(`Redis connection failed: ${error.message}`);
        logger.info('Enabling in-memory cache fallback');
        process.env.USE_IN_MEMORY_CACHE = 'true';
        redis.quit();
        resolve(true); // Continue with in-memory cache
      });
      
      // Set timeout
      setTimeout(() => {
        logger.warn('Redis connection timed out');
        logger.info('Enabling in-memory cache fallback');
        process.env.USE_IN_MEMORY_CACHE = 'true';
        redis.disconnect();
        resolve(true); // Continue with in-memory cache
      }, 5000);
    });
  } catch (error) {
    logger.warn(`Redis verification error: ${error.message}`);
    logger.info('Enabling in-memory cache fallback');
    process.env.USE_IN_MEMORY_CACHE = 'true';
    return true; // Continue with in-memory cache
  }
}

// Verify MongoDB connection
async function verifyMongoDBConnection() {
  logger.info('Verifying MongoDB connection...');
  
  try {
    const { MongoClient } = require('mongodb');
    const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/sports-analytics';
    
    const client = new MongoClient(uri, {
      connectTimeoutMS: 5000,
      serverSelectionTimeoutMS: 5000
    });
    
    await client.connect();
    await client.db().command({ ping: 1 });
    logger.info('MongoDB connection successful');
    await client.close();
    return true;
  } catch (error) {
    logger.error(`MongoDB connection failed: ${error.message}`);
    return false;
  }
}

// Verify system resources
async function verifySystemResources() {
  logger.info('Verifying system resources...');
  
  const os = require('os');
  const totalMemory = os.totalmem();
  const freeMemory = os.freemem();
  const cpuCount = os.cpus().length;
  
  logger.info(`System memory: ${Math.round(totalMemory / (1024 * 1024 * 1024))} GB total, ${Math.round(freeMemory / (1024 * 1024 * 1024))} GB free`);
  logger.info(`CPU cores: ${cpuCount}`);
  
  // Check if system has enough resources
  if (freeMemory < 500 * 1024 * 1024) { // Less than 500MB free
    logger.warn('System has low available memory. Performance may be affected.');
  }
  
  if (cpuCount < 2) {
    logger.warn('System has limited CPU resources. Performance may be affected.');
  }
  
  return true;
}

// Start the application
async function startApplication() {
  logger.info('Starting application...');

  try {
    // Initialize memory optimizer if enabled
    if (process.env.ENABLE_AGGRESSIVE_GC === 'true') {
      logger.info('Initializing memory optimizer...');
      try {
        const memoryOptimizer = require('./scripts/optimize-memory');
        memoryOptimizer.start();
        logger.info('Memory optimizer started successfully');
      } catch (error) {
        logger.warn(`Failed to start memory optimizer: ${error.message}`);
        logger.info('Continuing without memory optimization');
      }
    }

    // Determine if we should use cluster mode
    const useCluster = process.argv.includes('--cluster');

    // Import the main application
    const api = require('./api.js');

    // Start the application
    if (api && typeof api.start === 'function') {
      await api.start(useCluster);
      logger.info('Application started successfully');

      // Run memory optimization after startup
      if (global.gc) {
        logger.info('Running initial garbage collection after startup');
        global.gc();
      }
    } else {
      logger.info('Application loaded, but no start method found. Assuming it auto-starts.');
    }

    return true;
  } catch (error) {
    logger.error(`Failed to start application: ${error.message}`);
    logger.error(error.stack);
    return false;
  }
}

// Setup graceful shutdown
function setupGracefulShutdown() {
  // Handle termination signals
  ['SIGINT', 'SIGTERM', 'SIGUSR2'].forEach(signal => {
    process.on(signal, async () => {
      logger.info(`Received ${signal} signal, shutting down gracefully...`);
      
      try {
        // Import the main application
        const api = require('./api.js');
        
        // Call cleanup if available
        if (api && typeof api.cleanup === 'function') {
          await api.cleanup();
          logger.info('Application cleanup completed');
        }
        
        logger.info('Graceful shutdown completed');
        process.exit(0);
      } catch (error) {
        logger.error(`Error during graceful shutdown: ${error.message}`);
        process.exit(1);
      }
    });
  });
  
  // Handle uncaught exceptions
  process.on('uncaughtException', (error) => {
    logger.error(`Uncaught exception: ${error.message}`);
    logger.error(error.stack);
    process.exit(1);
  });
  
  // Handle unhandled rejections
  process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled rejection at:', promise);
    logger.error(`Reason: ${reason}`);
    // Don't exit, just log
  });
}

// Main function
async function main() {
  logger.info('Starting Sports Analytics application...');
  
  try {
    // Setup graceful shutdown
    setupGracefulShutdown();
    
    // Verify environment
    const pythonOk = await verifyPythonEnvironment();
    const filesOk = await verifyRequiredFiles();
    const portsOk = await verifyPortAvailability();
    const redisOk = await verifyRedisConnection();
    const mongoOk = await verifyMongoDBConnection();
    const resourcesOk = await verifySystemResources();
    
    // Check if we can proceed
    if (!filesOk) {
      logger.error('Missing required files. Cannot start application.');
      process.exit(1);
    }
    
    if (!mongoOk) {
      logger.error('MongoDB connection failed. Cannot start application.');
      process.exit(1);
    }
    
    if (!pythonOk) {
      logger.warn('Python verification failed. Application may have limited functionality.');
      // Continue anyway, the application has fallbacks
    }
    
    if (!portsOk) {
      logger.warn('Port verification failed. Application may not be accessible.');
      // Continue anyway, the application will try to find alternative ports
    }
    
    // Start the application
    const started = await startApplication();
    
    if (!started) {
      logger.error('Failed to start application.');
      process.exit(1);
    }
    
    logger.info('Startup completed successfully');
  } catch (error) {
    logger.error(`Startup failed: ${error.message}`);
    logger.error(error.stack);
    process.exit(1);
  }
}

// Run the main function
main().catch(error => {
  logger.error(`Fatal error during startup: ${error.message}`);
  logger.error(error.stack);
  process.exit(1);
});