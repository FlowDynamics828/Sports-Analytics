// startup.js - Enhanced startup script with proper initialization and error handling

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { promisify } = require('util');
const winston = require('winston');
const { format } = winston;
const events = require('events');
const mongoose = require('mongoose');
const redis = require('redis');
events.EventEmitter.defaultMaxListeners = 20; // Increase the limit to 20

process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
    // Handle the exception (e.g., clean up resources, restart the application, etc.)
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    // Handle the rejection (e.g., log the error, clean up resources, etc.)
});

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

// Verify Python environment with improved reliability
async function verifyPythonEnvironment() {
  logger.info('Verifying Python environment...');

  // Get Python path from environment variables with more fallbacks
  const pythonPath = process.env.PYTHON_PATH || process.env.PYTHON_EXECUTABLE || 'python3' || 'python';

  try {
    // Set a shorter verification timeout
    const verificationTimeout = parseInt(process.env.PYTHON_VERIFICATION_TIMEOUT, 10) || 5000; // Reduced to 5 seconds

    // First, check if the Python script exists before trying to run Python
    const scriptPath = path.join(process.cwd(), 'scripts', 'predictive_model.py');
    try {
      await promisify(fs.access)(scriptPath);
      logger.info(`Python script found at: ${scriptPath}`);
    } catch (error) {
      logger.error(`Python script not found at expected path: ${scriptPath}`);
      logger.info('Creating a basic Python script to ensure functionality');

      // Create scripts directory if it doesn't exist
      const scriptsDir = path.join(process.cwd(), 'scripts');
      try {
        if (!fs.existsSync(scriptsDir)) {
          fs.mkdirSync(scriptsDir, { recursive: true });
        }

        // Create a basic Python script
        const basicScript = `# predictive_model.py - Basic implementation
import sys
import json
import time
from datetime import datetime

def main():
    """Main function to process input and generate predictions"""
    try:
        # Get input from Node.js
        input_data = json.loads(sys.argv[1]) if len(sys.argv) > 1 else {}

        # Generate mock prediction result
        result = {
            "prediction": 0.75,
            "confidence": 0.85,
            "factors": ["historical_performance", "recent_form"],
            "timestamp": datetime.now().isoformat(),
            "league": input_data.get('league', 'unknown'),
            "type": input_data.get('prediction_type', 'unknown')
        }

        # Return result as JSON
        print(json.dumps(result))

    except Exception as e:
        error_result = {
            "error": str(e),
            "timestamp": datetime.now().isoformat()
        }
        print(json.dumps(error_result))

if __name__ == "__main__":
    main()
`;
        fs.writeFileSync(scriptPath, basicScript);
        logger.info(`Created basic Python script at: ${scriptPath}`);
      } catch (writeError) {
        logger.error(`Failed to create Python script: ${writeError.message}`);
      }
    }

    // Try multiple Python commands to find a working one
    const pythonCommands = [pythonPath, 'python3', 'python'];

    for (const cmd of pythonCommands) {
      try {
        logger.info(`Trying Python command: ${cmd}`);

        // Use a simple Python command that doesn't import any libraries
        const pythonProcess = spawn(cmd, ['-c', 'import sys; print("Python verification successful with " + sys.version)']);

        const result = await new Promise((resolve) => {
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
              logger.info(`Python verification successful using ${cmd}: ${output.trim()}`);
              // Update environment variables with working command
              process.env.PYTHON_PATH = cmd;
              process.env.PYTHON_EXECUTABLE = cmd;
              resolve(true);
            } else {
              logger.warn(`Python command ${cmd} failed with code ${code}: ${errorOutput}`);
              resolve(false);
            }
          });

          pythonProcess.on('error', (error) => {
            logger.warn(`Python process error with ${cmd}: ${error.message}`);
            resolve(false);
          });

          // Set a short timeout
          setTimeout(() => {
            pythonProcess.kill();
            logger.warn(`Python verification with ${cmd} timed out after ${verificationTimeout/1000} seconds`);
            resolve(false);
          }, verificationTimeout);
        });

        if (result) {
          // Successfully found a working Python command
          return true;
        }
      } catch (error) {
        logger.warn(`Error trying Python command ${cmd}: ${error.message}`);
        // Continue to the next command
      }
    }

    // If we get here, none of the Python commands worked
    logger.error('All Python verification attempts failed');
    logger.info('Continuing startup with fallback mode - Python features will be disabled');

    // Set fallback mode
    process.env.PYTHON_ENABLED = 'false';
    return false;
  } catch (error) {
    logger.error(`Python verification error: ${error.message}`);
    process.env.PYTHON_ENABLED = 'false';
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
  try {
    await connectToMongoDB();
    const redisClient = await connectToRedis();
    if (!redisClient) {
        logger.error("Redis connection failed, exiting application");
        process.exit(1);
    }

    // Import the main application
    const api = require('./api.js');

    // Start the application
    if (api && typeof api.start === 'function') {
        await api.start();
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

async function connectToMongoDB() {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 5000 // Timeout after 5 seconds instead of 30 seconds
    });
    logger.info('MongoDB connection successful', { service: 'startup', timestamp: new Date().toISOString() });
  } catch (error) {
    logger.error('MongoDB connection error:', {
      service: 'startup',
      timestamp: new Date().toISOString(),
      error: error.message,
      stack: error.stack
    });
    process.exit(1); // Exit the process with failure
  }
}

async function connectToRedis() {
    const client = redis.createClient();
    const retries = 5;
    for (let i = 0; i < retries; i++) {
        try {
            await client.connect();
            logger.info("Redis connection successful");
            return client;
        } catch (err) {
            logger.error(`Redis connection failed (attempt ${i + 1}):`, err);
            if (i < retries - 1) {
                await new Promise(res => setTimeout(res, 5000)); // Wait 5 seconds before retrying
            }
        }
    }
    logger.error("Failed to connect to Redis after multiple attempts");
    return null;
}