// scripts/startup.js - Enterprise-level startup script with optimization and comprehensive initialization
/**
 * Combined startup script for Sports Analytics application
 * Features:
 * - Memory optimization settings
 * - Comprehensive environment verification
 * - Database connection management
 * - WebSocket server verification and setup
 * - Graceful startup and shutdown sequences
 * - Child process management
 */
require('dotenv').config();

// EMERGENCY FIX: Increase file descriptor limits to prevent EMFILE errors
const events = require('events');
events.EventEmitter.defaultMaxListeners = 50; // Set a reasonable limit to prevent memory leaks
process.setMaxListeners(50); // Set a reasonable limit for process

// Core modules
const fs = require('fs');
const path = require('path');
const { spawn, execSync } = require('child_process');
const { promisify } = require('util');
const winston = require('winston');
const { format } = winston;
const net = require('net');
const os = require('os');

// Configuration - override these with environment variables if needed
const config = {
  // Server settings
  httpPort: parseInt(process.env.PORT, 10) || 5050,
  wsPort: parseInt(process.env.WS_PORT, 10) || 5150,
  
  // Node.js settings
  maxOldSpaceSize: process.env.MAX_OLD_SPACE_SIZE || 8192,
  exposedGC: process.env.EXPOSE_GC !== 'false',
  singleWorker: process.env.SINGLE_WORKER !== 'false',
  mainScriptPath: process.env.MAIN_SCRIPT_PATH || 'api.js',
  
  // Python settings
  pythonVerificationTimeout: parseInt(process.env.PYTHON_VERIFICATION_TIMEOUT, 10) || 15000,
  
  // Monitoring settings
  healthCheckInterval: parseInt(process.env.HEALTH_CHECK_INTERVAL, 10) || 300000,
  
  // Retry settings
  maxRetries: parseInt(process.env.MAX_RETRIES, 10) || 3,
  retryDelay: parseInt(process.env.RETRY_DELAY, 10) || 2000
};

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

// Create public directory for frontend if it doesn't exist
try {
  if (!fs.existsSync('public')) {
    fs.mkdirSync('public');
    logger.info('Created public directory for frontend');
    
    // Create a basic index.html file so the server has something to serve
    const indexHtml = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Sports Analytics</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 0; padding: 20px; line-height: 1.6; }
        .container { max-width: 800px; margin: 0 auto; }
        h1 { color: #333; }
    </style>
</head>
<body>
    <div class="container">
        <h1>Sports Analytics Platform</h1>
        <p>The frontend application is not yet built. Please run your frontend build process to populate this directory.</p>
    </div>
</body>
</html>`;
    
    fs.writeFileSync(path.join('public', 'index.html'), indexHtml);
    logger.info('Created basic index.html in public directory');
  }
} catch (error) {
  console.error('Error creating public directory:', error);
}

// Handle uncaught exceptions globally
process.on('uncaughtException', (error) => {
  if (error.code === 'EMFILE') {
    logger.error('EMFILE error caught - too many open files');
    if (global.gc) global.gc(); // Force garbage collection
  } else {
    logger.error(`Uncaught exception: ${error.message}`);
    logger.error(error.stack);
    process.exit(1);
  }
});

// Handle unhandled rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection at:', promise);
  logger.error(`Reason: ${reason}`);
  // Don't exit, just log
});

/**
 * Verify Python environment with improved reliability
 * @returns {Promise<boolean>} Whether Python is available
 */
async function verifyPythonEnvironment() {
  logger.info('Verifying Python environment...');

  // Get Python path from environment variables with more fallbacks
  const pythonPath = process.env.PYTHON_PATH || process.env.PYTHON_EXECUTABLE || 'python3' || 'python';
  const maxRetries = config.maxRetries;

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
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        logger.info(`Trying Python command: ${cmd} (attempt ${attempt}/${maxRetries})`);

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

          // Use the timeout from config
          setTimeout(() => {
            pythonProcess.kill();
            logger.warn(`Python verification with ${cmd} timed out after ${config.pythonVerificationTimeout/1000} seconds`);
            resolve(false);
          }, config.pythonVerificationTimeout);
        });

        if (result) {
          // Successfully found a working Python command
          return true;
        }

        // Wait before retrying
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, config.retryDelay));
        }
      } catch (error) {
        logger.warn(`Error trying Python command ${cmd}: ${error.message}`);
        // Continue to the next attempt or command
      }
    }
  }

  // If we get here, none of the Python commands worked
  logger.error('All Python verification attempts failed');
  logger.info('Continuing startup with fallback mode - Python features will be disabled');

  // Set fallback mode
  process.env.PYTHON_ENABLED = 'false';
  return false;
}

/**
 * Verify required files exist
 * @returns {Promise<boolean>} Whether all required files exist
 */
async function verifyRequiredFiles() {
  logger.info('Verifying required files...');
  
  const requiredFiles = [
    'api.js',
    'utils/db.js',
    'utils/cache.js',
    'utils/pythonBridge.js'
  ];
  
  const missingFiles = [];
  
  for (const file of requiredFiles) {
    try {
      await promisify(fs.access)(path.join(process.cwd(), file));
    } catch (error) {
      missingFiles.push(file);
      logger.error(`Required file missing: ${file}`);
    }
  }
  
  // Special check for websocketManager.js - we'll create it if missing
  try {
    await promisify(fs.access)(path.join(process.cwd(), 'utils/websocketManager.js'));
  } catch (error) {
    logger.warn('WebSocketManager file missing, will be created during verification');
    // We'll handle this in verifyWebSocketManager function
  }
  
  if (missingFiles.length > 0) {
    logger.error(`Missing required files: ${missingFiles.join(', ')}`);
    return false;
  }
  
  logger.info('All required files verified');
  return true;
}

/**
 * Verify port availability
 * @returns {Promise<boolean>} Whether all required ports are available
 */
async function verifyPortAvailability() {
  logger.info('Verifying port availability...');
  
  const httpPort = config.httpPort;
  const wsPort = config.wsPort;
  
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
  
  if (!httpPortAvailable) {
    logger.warn(`HTTP port ${httpPort} is not available. Please update PORT in .env file.`);
  }
  
  // Only check WebSocket port if it's different from HTTP port
  if (wsPort !== httpPort) {
    const wsPortAvailable = await isPortAvailable(wsPort);
    
    if (!wsPortAvailable) {
      logger.warn(`WebSocket port ${wsPort} is not available. Please update WS_PORT in .env file.`);
    }
    
    return httpPortAvailable && wsPortAvailable;
  }
  
  return httpPortAvailable;
}

/**
 * Verify Redis connection
 * @returns {Promise<boolean>} Whether Redis is available
 */
async function verifyRedisConnection() {
  logger.info('Verifying Redis connection...');
  
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
        resolve(true);
      });
      
      setTimeout(() => {
        logger.warn('Redis connection timed out');
        logger.info('Enabling in-memory cache fallback');
        process.env.USE_IN_MEMORY_CACHE = 'true';
        redis.disconnect();
        resolve(true);
      }, 5000);
    });
  } catch (error) {
    logger.warn(`Redis verification error: ${error.message}`);
    logger.info('Enabling in-memory cache fallback');
    process.env.USE_IN_MEMORY_CACHE = 'true';
    return true;
  }
}

/**
 * Verify MongoDB connection
 * @returns {Promise<boolean>} Whether MongoDB is available
 */
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

/**
 * Connect to MongoDB with retry logic
 * @returns {Promise<void>}
 */
async function connectToMongoDB() {
  logger.info('Connecting to MongoDB...');
  
  try {
    const mongoose = require('mongoose');
    const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/sports-analytics';
    
    for (let attempt = 1; attempt <= config.maxRetries; attempt++) {
      try {
        await mongoose.connect(uri, {
          useNewUrlParser: true,
          useUnifiedTopology: true,
          serverSelectionTimeoutMS: 5000, 
          maxPoolSize: parseInt(process.env.DB_MAX_POOL_SIZE, 10) || 50,
          minPoolSize: parseInt(process.env.DB_MIN_POOL_SIZE, 10) || 5,
          connectTimeoutMS: parseInt(process.env.CONNECT_TIMEOUT_MS, 10) || 10000,
          socketTimeoutMS: parseInt(process.env.SOCKET_TIMEOUT_MS, 10) || 30000
        });
        
        logger.info('MongoDB connection successful');
        return;
      } catch (error) {
        logger.warn(`MongoDB connection attempt ${attempt} failed: ${error.message}`);
        
        if (attempt === config.maxRetries) {
          throw error;
        }
        
        await new Promise(resolve => setTimeout(resolve, config.retryDelay));
      }
    }
  } catch (error) {
    logger.error(`MongoDB connection failed after ${config.maxRetries} attempts: ${error.message}`);
    throw error;
  }
}

/**
 * Connect to Redis with retry logic
 * @returns {Promise<object|null>} Redis client or null if unavailable
 */
async function connectToRedis() {
  logger.info('Connecting to Redis...');
  
  if (process.env.USE_IN_MEMORY_CACHE === 'true') {
    logger.info('Using in-memory cache, skipping Redis connection');
    return null;
  }
  
  try {
    const Redis = require('ioredis');
    
    for (let attempt = 1; attempt <= config.maxRetries; attempt++) {
      try {
        const client = new Redis({
          host: process.env.REDIS_HOST || 'localhost',
          port: parseInt(process.env.REDIS_PORT, 10) || 6379,
          password: process.env.REDIS_PASSWORD || undefined,
          connectTimeout: parseInt(process.env.REDIS_CONNECT_TIMEOUT, 10) || 10000,
          maxRetriesPerRequest: parseInt(process.env.REDIS_MAX_RETRIES, 10) || 3
        });
        
        await new Promise((resolve, reject) => {
          client.once('ready', resolve);
          client.once('error', reject);
          setTimeout(() => reject(new Error('Redis connection timeout')), 5000);
        });
        
        logger.info('Redis connection successful');
        return client;
      } catch (error) {
        logger.warn(`Redis connection attempt ${attempt} failed: ${error.message}`);
        
        if (attempt === config.maxRetries) {
          logger.error('Redis connection failed, using in-memory cache fallback');
          process.env.USE_IN_MEMORY_CACHE = 'true';
          return null;
        }
        
        await new Promise(resolve => setTimeout(resolve, config.retryDelay));
      }
    }
  } catch (error) {
    logger.error(`Redis connection failed: ${error.message}`);
    process.env.USE_IN_MEMORY_CACHE = 'true';
    return null;
  }
}

/**
 * Verify system resources
 * @returns {Promise<boolean>} Whether system has sufficient resources
 */
async function verifySystemResources() {
  logger.info('Verifying system resources...');
  
  const totalMemory = os.totalmem();
  const freeMemory = os.freemem();
  const cpuCount = os.cpus().length;
  
  logger.info(`System memory: ${Math.round(totalMemory / (1024 * 1024 * 1024))} GB total, ${Math.round(freeMemory / (1024 * 1024 * 1024))} GB free`);
  logger.info(`CPU cores: ${cpuCount}`);
  
  // Adjust memory settings based on system resources
  if (freeMemory < 1024 * 1024 * 1024) { // Less than 1GB free
    logger.warn('System has low available memory. Reducing memory allocation.');
    config.maxOldSpaceSize = Math.min(config.maxOldSpaceSize, 2048);
  }
  
  if (cpuCount < 2) {
    logger.warn('System has limited CPU resources. Setting single worker mode.');
    config.singleWorker = true;
  }
  
  // Check if system has enough resources
  if (freeMemory < 500 * 1024 * 1024) { // Less than 500MB free
    logger.warn('System has critically low available memory. Performance may be affected.');
  }
  
  return true;
}

/**
 * Verify WebSocketManager implementation
 * @returns {Promise<boolean>} Whether WebSocketManager is properly implemented
 */
async function verifyWebSocketManager() {
  logger.info('Verifying WebSocketManager implementation...');
  
  const wsManagerPath = path.join(process.cwd(), 'utils', 'websocketManager.js');
  
  try {
    await promisify(fs.access)(wsManagerPath);
    
    // Read the file content to check implementation
    const fileContent = await promisify(fs.readFile)(wsManagerPath, 'utf8');
    
    // Check for required WebSocket imports
    if (!fileContent.includes('WebSocket')) {
      logger.warn('WebSocketManager is missing WebSocket import');
      
      // Fix the implementation
      await fixWebSocketManager();
      return true;
    }
    
    // Check for required initialize and broadcast methods
    if (!fileContent.includes('initialize') || !fileContent.includes('broadcast')) {
      logger.warn('WebSocketManager is missing required methods');
      
      // Fix the implementation
      await fixWebSocketManager();
      return true;
    }
    
    logger.info('WebSocketManager implementation verified');
    return true;
  } catch (error) {
    logger.warn(`WebSocketManager verification failed: ${error.message}`);
    
    // Create the directory if it doesn't exist
    const wsManagerDir = path.dirname(wsManagerPath);
    if (!fs.existsSync(wsManagerDir)) {
      fs.mkdirSync(wsManagerDir, { recursive: true });
    }
    
    // Fix the implementation
    await fixWebSocketManager();
    return true;
  }
}

/**
 * Fix WebSocketManager implementation
 * @returns {Promise<void>}
 */
async function fixWebSocketManager() {
  logger.info('Fixing WebSocketManager implementation...');
  
  const wsManagerPath = path.join(process.cwd(), 'utils', 'websocketManager.js');
  
  // Updated WebSocketManager implementation
  const wsManagerContent = `// utils/websocketManager.js
const WebSocket = require('ws');
const winston = require('winston');
const crypto = require('crypto');

// Configure logger
const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
    ),
    defaultMeta: { service: 'websocket-manager' },
    transports: [
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.simple()
            )
        })
    ]
});

/**
 * WebSocketManager
 * Enhanced WebSocket management with proper client tracking,
 * channel subscriptions, error handling, and performance optimization.
 */
class WebSocketManager {
    /**
     * Create a WebSocketManager instance
     * @param {WebSocket.Server} wsServer - WebSocket server instance
     */
    constructor(wsServer) {
        this.server = wsServer;
        this.clients = new Map();
        this.subscriptions = new Map();
        this.pingInterval = null;
        this.isInitialized = false;
    }

    /**
     * Initialize the WebSocketManager
     * @returns {Promise<void>}
     */
    async initialize() {
        if (this.isInitialized) {
            logger.warn('WebSocketManager already initialized');
            return Promise.resolve();
        }

        if (!this.server) {
            throw new Error('WebSocket server not provided');
        }

        try {
            // Set up connection handler
            this.server.on('connection', this.handleConnection.bind(this));
            
            // Set up error handler
            this.server.on('error', this.handleServerError.bind(this));
            
            // Set up close handler
            this.server.on('close', this.handleServerClose.bind(this));
            
            // Set up heartbeat to detect and clean up dead connections
            this.pingInterval = setInterval(this.heartbeat.bind(this), 30000);
            
            this.isInitialized = true;
            logger.info('WebSocketManager initialized successfully');
            
            return Promise.resolve();
        } catch (error) {
            logger.error('Failed to initialize WebSocketManager:', {
                error: error.message,
                stack: error.stack
            });
            throw error;
        }
    }

    /**
     * Handle new WebSocket connections
     * @param {WebSocket} ws - WebSocket connection
     * @param {http.IncomingMessage} req - HTTP request
     * @private
     */
    handleConnection(ws, req) {
        try {
            // Generate unique client ID
            const clientId = this.generateClientId();
            
            // Set client properties
            ws.id = clientId;
            ws.isAlive = true;
            ws.subscriptions = new Set();
            ws.ip = req.socket.remoteAddress;
            ws.connectTime = Date.now();
            
            // Store client
            this.clients.set(clientId, ws);
            
            // Set up client event handlers
            this.setupClientHandlers(ws);
            
            logger.info(\`Client connected: \${clientId}\`, {
                ip: ws.ip,
                timestamp: new Date().toISOString()
            });
            
            // Send welcome message
            this.sendToClient(ws, {
                type: 'welcome',
                clientId: clientId,
                timestamp: Date.now(),
                message: 'Connected to Sports Analytics WebSocket Server'
            });
        } catch (error) {
            logger.error('Error handling new connection:', {
                error: error.message,
                stack: error.stack
            });
            
            // Terminate connection if we can't set it up properly
            if (ws.readyState === WebSocket.OPEN) {
                ws.terminate();
            }
        }
    }

    /**
     * Set up event handlers for a client
     * @param {WebSocket} ws - WebSocket connection
     * @private
     */
    setupClientHandlers(ws) {
        // Handle messages
        ws.on('message', (message) => {
            try {
                const data = JSON.parse(message.toString());
                this.handleMessage(ws, data);
            } catch (error) {
                logger.warn(\`Invalid message from client \${ws.id}:\`, {
                    error: error.message,
                    timestamp: new Date().toISOString()
                });
                
                this.sendToClient(ws, {
                    type: 'error',
                    message: 'Invalid message format',
                    timestamp: Date.now()
                });
            }
        });
        
        // Handle connection close
        ws.on('close', (code, reason) => {
            this.handleClientDisconnect(ws, code, reason);
        });
        
        // Handle errors
        ws.on('error', (error) => {
            logger.error(\`Client \${ws.id} error:\`, {
                error: error.message,
                stack: error.stack,
                timestamp: new Date().toISOString()
            });
        });
        
        // Handle pong (heartbeat response)
        ws.on('pong', () => {
            ws.isAlive = true;
        });
    }

    /**
     * Handle client message
     * @param {WebSocket} ws - WebSocket connection
     * @param {Object} data - Message data
     * @private
     */
    handleMessage(ws, data) {
        if (!data || !data.type) {
            logger.warn(\`Message without type from client \${ws.id}\`);
            return;
        }
        
        switch (data.type) {
            case 'subscribe':
                this.handleSubscribe(ws, data.channel);
                break;
                
            case 'unsubscribe':
                this.handleUnsubscribe(ws, data.channel);
                break;
                
            case 'ping':
                this.handlePing(ws);
                break;
                
            case 'message':
                // Handle client-to-server messages
                logger.debug(\`Message from client \${ws.id}:\`, {
                    data: data.data,
                    timestamp: new Date().toISOString()
                });
                break;
                
            default:
                logger.warn(\`Unknown message type from client \${ws.id}: \${data.type}\`);
        }
    }

    /**
     * Handle client subscribe request
     * @param {WebSocket} ws - WebSocket connection
     * @param {string} channel - Channel to subscribe to
     * @private
     */
    handleSubscribe(ws, channel) {
        if (!channel) {
            logger.warn(\`Client \${ws.id} tried to subscribe without specifying a channel\`);
            return;
        }
        
        // Add to client's subscriptions
        ws.subscriptions.add(channel);
        
        // Add to channel subscribers
        if (!this.subscriptions.has(channel)) {
            this.subscriptions.set(channel, new Set());
        }
        
        this.subscriptions.get(channel).add(ws.id);
        
        logger.debug(\`Client \${ws.id} subscribed to channel: \${channel}\`, {
            timestamp: new Date().toISOString()
        });
        
        // Confirm subscription to client
        this.sendToClient(ws, {
            type: 'subscribed',
            channel: channel,
            timestamp: Date.now()
        });
    }

    /**
     * Handle client unsubscribe request
     * @param {WebSocket} ws - WebSocket connection
     * @param {string} channel - Channel to unsubscribe from
     * @private
     */
    handleUnsubscribe(ws, channel) {
        if (!channel) {
            logger.warn(\`Client \${ws.id} tried to unsubscribe without specifying a channel\`);
            return;
        }
        
        // Remove from client's subscriptions
        ws.subscriptions.delete(channel);
        
        // Remove from channel subscribers
        const subscribers = this.subscriptions.get(channel);
        if (subscribers) {
            subscribers.delete(ws.id);
            
            // Clean up empty channels
            if (subscribers.size === 0) {
                this.subscriptions.delete(channel);
            }
            
            logger.debug(\`Client \${ws.id} unsubscribed from channel: \${channel}\`, {
                timestamp: new Date().toISOString()
            });
        }
        
        // Confirm unsubscription to client
        this.sendToClient(ws, {
            type: 'unsubscribed',
            channel: channel,
            timestamp: Date.now()
        });
    }

    /**
    * Handle client ping request
    * @param {WebSocket} ws - WebSocket connection
    * @private
    */
   handlePing(ws) {
       this.sendToClient(ws, {
           type: 'pong',
           timestamp: Date.now()
       });
   }

   /**
    * Handle client disconnect
    * @param {WebSocket} ws - WebSocket connection
    * @param {number} code - Close code
    * @param {string} reason - Close reason
    * @private
    */
   handleClientDisconnect(ws, code, reason) {
       if (!ws || !ws.id) return;
       
       logger.info(\`Client disconnected: \${ws.id}\`, {
           code: code || 'unknown',
           reason: reason || 'No reason provided',
           timestamp: new Date().toISOString()
       });
       
       // Remove from all subscriptions
       if (ws.subscriptions) {
           ws.subscriptions.forEach(channel => {
               const subscribers = this.subscriptions.get(channel);
               if (subscribers) {
                   subscribers.delete(ws.id);
                   
                   // Clean up empty channels
                   if (subscribers.size === 0) {
                       this.subscriptions.delete(channel);
                   }
               }
           });
       }
       
       // Remove client
       this.clients.delete(ws.id);
   }

   /**
    * Handle server errors
    * @param {Error} error - Error object
    * @private
    */
   handleServerError(error) {
       logger.error('WebSocket server error:', {
           error: error.message,
           stack: error.stack,
           timestamp: new Date().toISOString()
       });
   }

   /**
    * Handle server close
    * @private
    */
   handleServerClose() {
       logger.info('WebSocket server closed', {
           timestamp: new Date().toISOString()
       });
       
       // Clean up
       clearInterval(this.pingInterval);
       this.clients.clear();
       this.subscriptions.clear();
       this.isInitialized = false;
   }

   /**
    * Perform heartbeat check on all clients
    * @private
    */
   heartbeat() {
       this.clients.forEach((ws, id) => {
           if (ws.isAlive === false) {
               logger.debug(\`Terminating inactive client: \${id}\`, {
                   timestamp: new Date().toISOString()
               });
               this.handleClientDisconnect(ws, 1008, 'Connection timeout');
               return ws.terminate();
           }
           
           ws.isAlive = false;
           try {
               ws.ping();
           } catch (error) {
               logger.debug(\`Error pinging client \${id}:\`, {
                   error: error.message
               });
               this.handleClientDisconnect(ws, 1011, 'Ping failed');
               ws.terminate();
           }
       });
   }

   /**
    * Send a message to a specific client
    * @param {WebSocket} ws - WebSocket connection
    * @param {Object} data - Message data
    * @returns {boolean} - Whether the message was sent
    * @private
    */
   sendToClient(ws, data) {
       try {
           if (ws.readyState !== WebSocket.OPEN) {
               return false;
           }
           
           const message = JSON.stringify(data);
           ws.send(message);
           return true;
       } catch (error) {
           logger.error(\`Error sending to client \${ws.id}:\`, {
               error: error.message,
               stack: error.stack,
               timestamp: new Date().toISOString()
           });
           return false;
       }
   }

   /**
    * Broadcast a message to all subscribers of a channel
    * @param {string} channel - Channel to broadcast to
    * @param {any} data - Data to broadcast
    * @returns {number} - Number of clients message was sent to
    */
   broadcast(channel, data) {
       try {
           if (!channel || !this.server || !this.server.clients) {
               return 0;
           }
           
           const subscribers = this.subscriptions.get(channel);
           if (!subscribers || subscribers.size === 0) {
               return 0;
           }
           
           const message = JSON.stringify({
               type: 'broadcast',
               channel: channel,
               data: data,
               timestamp: Date.now()
           });
           
           let sentCount = 0;
           
           // Send to all subscribers of the channel
           subscribers.forEach(clientId => {
               const client = this.clients.get(clientId);
               if (client && client.readyState === WebSocket.OPEN) {
                   try {
                       client.send(message);
                       sentCount++;
                   } catch (error) {
                       logger.error(\`Error broadcasting to client \${clientId}:\`, {
                           error: error.message,
                           timestamp: new Date().toISOString()
                       });
                   }
               }
           });
           
           logger.debug(\`Broadcast to channel \${channel}: sent to \${sentCount} clients\`, {
               timestamp: new Date().toISOString()
           });
           
           return sentCount;
       } catch (error) {
           logger.error(\`Broadcast error for channel \${channel}:\`, {
               error: error.message,
               stack: error.stack,
               timestamp: new Date().toISOString()
           });
           return 0;
       }
   }

   /**
    * Generate a unique client ID
    * @returns {string} - Unique client ID
    * @private
    */
   generateClientId() {
       return \`\${Date.now()}-\${crypto.randomBytes(8).toString('hex')}\`;
   }

   /**
    * Get the number of connected clients
    * @returns {number} - Number of clients
    */
   getClientCount() {
       return this.clients.size;
   }

   /**
    * Get the number of active subscriptions
    * @returns {number} - Number of subscriptions
    */
   getSubscriptionCount() {
       return Array.from(this.subscriptions.values())
           .reduce((count, subscribers) => count + subscribers.size, 0);
   }

   /**
    * Get the status of the WebSocket server
    * @returns {Object} - Server status
    */
   getStatus() {
       return {
           initialized: this.isInitialized,
           clients: this.getClientCount(),
           channels: this.subscriptions.size,
           subscriptions: this.getSubscriptionCount(),
           timestamp: new Date().toISOString()
       };
   }

   /**
    * Clean up resources
    */
   cleanup() {
       clearInterval(this.pingInterval);
       
       // Close all client connections
       this.clients.forEach((ws, id) => {
           try {
               if (ws.readyState === WebSocket.OPEN) {
                   ws.close(1001, 'Server shutting down');
               }
           } catch (error) {
               logger.debug(\`Error closing client \${id}:\`, {
                   error: error.message
               });
           }
       });
       
       this.clients.clear();
       this.subscriptions.clear();
       this.isInitialized = false;
       
       logger.info('WebSocketManager cleaned up', {
           timestamp: new Date().toISOString()
       });
   }
}

module.exports = WebSocketManager;`;

 try {
   await promisify(fs.writeFile)(wsManagerPath, wsManagerContent);
   logger.info('Successfully fixed WebSocketManager implementation');
 } catch (error) {
   logger.error(`Failed to fix WebSocketManager: ${error.message}`);
   throw error;
 }
}

/**
* Verify API.js WebSocket initialization
* @returns {Promise<boolean>} Whether API.js WebSocket initialization was successfully verified
*/
async function verifyApiWebSocketInitialization() {
 logger.info('Verifying WebSocket initialization in api.js...');
 
 const apiJsPath = path.join(process.cwd(), 'api.js');
 
 try {
   await promisify(fs.access)(apiJsPath);
   
   // Read the file content
   let apiContent = await promisify(fs.readFile)(apiJsPath, 'utf8');
   
   // Check for common WebSocket initialization issues
   const wsIssues = [];
   
   if (!apiContent.includes('new WebSocket.Server')) {
     wsIssues.push('WebSocket server not properly initialized');
   }
   
   if (apiContent.includes('wsServerListening') && !apiContent.includes('const wsServerListening')) {
     wsIssues.push('wsServerListening variable referenced before definition');
   }
   
   if (apiContent.includes('this.websocketManager.initialize()') && !apiContent.includes('await this.websocketManager.initialize()')) {
     wsIssues.push('WebSocketManager initialization not properly awaited');
   }
   
   if (wsIssues.length > 0) {
     logger.warn('Found WebSocket initialization issues in api.js:', wsIssues);
     
     // Find the _initializeComponents method
     const componentsFunctionMatch = apiContent.match(/async\s+_initializeComponents\s*\(\s*\)\s*\{[\s\S]*?this\._handleError\s*\(\s*error\s*\)\s*;[\s\S]*?\}/m);
     
     if (componentsFunctionMatch) {
       // Replace the function with the fixed version that properly initializes WebSocket
       const fixedComponentsFunction = `async _initializeComponents() {
   try {
       let redisInitialized = false;
       // Redis initialization (keep existing code)
       ${apiContent.includes('let redisInitialized = false') ? '' : 'let redisInitialized = false;'}
       if (!global.redisClient) {
           try {
               const redisPort = this.config.redis.port;
               const redisHost = this.config.redis.host;
               logger.info(\`Attempting to connect to Redis at \${redisHost}:\${redisPort}\`, {
                   metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
               });

               global.redisClient = new Redis({
                   host: redisHost,
                   port: redisPort,
                   password: this.config.redis.password,
                   enableOfflineQueue: this.config.redis.enableOfflineQueue,
                   retryStrategy: function(times) {
                       const delay = Math.min(times * 50, 2000);
                       return delay;
                   },
                   connectionName: this.config.redis.connectionName,
                   connectTimeout: this.config.redis.connectTimeout,
                   showFriendlyErrorStack: this.config.redis.showFriendlyErrorStack,
                   maxRetriesPerRequest: this.config.redis.maxRetriesPerRequest,
                   disconnectTimeout: 5000
               });

               global.redisClient.on('connect', () => {
                   logger.info('Redis connection established', {
                       metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
                   });
                   redisInitialized = true;
               });

               global.redisClient.on('error', (error) => {
                   logger.error('Redis connection error:', {
                       error: error.message,
                       stack: error.stack,
                       connectionState: global.redisClient.status || 'unknown',
                       metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
                   });
                   this._handleError(error);
               });
           } catch (error) {
               logger.error('Failed to initialize Redis client:', {
                   error: error.message,
                   stack: error.stack,
                   metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
               });
               if (global.redisClient) {
                   try {
                       global.redisClient.disconnect();
                   } catch (disconnectError) {
                       logger.warn('Error disconnecting Redis client:', {
                           error: disconnectError.message,
                           metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
                       });
                   }
                   global.redisClient = null;
               }
           }
       }

       // Create Express app and HTTP server
       const app = express();
       app.use(express.json({ limit: '25mb' }));
       app.use(express.urlencoded({ extended: true, limit: '25mb' }));
       const server = http.createServer(app);

       // Set up CORS and other middleware
       app.use((req, res, next) => {
           const origin = req.headers.origin;
           if (origin === process.env.CORS_ORIGIN || process.env.NODE_ENV === 'development') {
               res.header('Access-Control-Allow-Origin', origin);
               res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
               res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
               res.header('Access-Control-Allow-Credentials', 'true');
           }
           next();
       });

       // Serve static files for frontend application
       const publicPath = path.join(__dirname, 'public');
       app.use(express.static(publicPath));

       // Define port and create a Promise for HTTP server startup
       const port = parseInt(process.env.PORT, 10) || 5050;
       const serverListening = new Promise((resolve, reject) => {
           server.listen(port, () => {
               logger.info(\`HTTP server listening on port \${port}\`, {
                   metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
               });
               resolve();
           });
           
           server.on('error', (error) => {
               logger.error('HTTP server failed to start:', {
                   error: error.message,
                   stack: error.stack,
                   metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
               });
               reject(error);
           });
       });

       // Create WebSocket server attached to the HTTP server
       const wsServer = new WebSocket.Server({ server });
       this.wsServer = wsServer;

       // Initialize WebSocketManager
       try {
           const WebSocketManager = require('./utils/websocketManager');
           this.websocketManager = new WebSocketManager(wsServer);
           
           // Wait for HTTP server to be listening before initializing WebSocket
           await serverListening;
           await this.websocketManager.initialize();
           
           logger.info('WebSocket server initialized successfully', {
               metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
           });
       } catch (wsError) {
           logger.error('Failed to initialize WebSocket server:', {
               error: wsError.message,
               stack: wsError.stack,
               metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
           });
           throw wsError;
       }

       // Store HTTP server reference and port
       this.config.port = port;
       this.httpServer = server;

       // Initialize rate limiter and other components
       try {
           const rateLimiterModule = require('./utils/rateLimiter');
           if (!rateLimiterModule || typeof rateLimiterModule.checkLimit !== 'function') {
               logger.error('Rate limiter module is invalid or missing checkLimit, using in-memory fallback', {
                   metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
               });
               this.rateLimiter = {
                   checkLimit: async (key) => {
                       const now = Date.now();
                       const userLimits = (this.rateLimiter.limits || new Map()).get(key) || [];
                       const validRequests = userLimits.filter(timestamp => now - timestamp < this.config.rateLimit.windowMs);

                       if (validRequests.length >= this.config.rateLimit.max) {
                           logger.warn('Rate limit exceeded (in-memory fallback):', { 
                               key, 
                               limit: this.config.rateLimit.max, 
                               timestamp: new Date().toISOString(), 
                               metadata: { service: 'predictive-model' } 
                           });
                           return false;
                       }

                       validRequests.push(now);
                       this.rateLimiter.limits = this.rateLimiter.limits || new Map();
                       this.rateLimiter.limits.set(key, validRequests);
                       return true;
                   },
                   limits: new Map()
               };
           } else {
               this.rateLimiter = rateLimiterModule;
               logger.info('Rate limiter initialized successfully from module', { 
                   metadata: { service: 'predictive-model', timestamp: new Date().toISOString() } 
               });
           }
       } catch (error) {
           logger.error('Failed to load rate limiter module, using in-memory fallback:', { 
               error: error.message, 
               stack: error.stack, 
               metadata: { service: 'predictive-model', timestamp: new Date().toISOString() } 
           });
           this.rateLimiter = {
               checkLimit: async (key) => {
                   const now = Date.now();
                   const userLimits = (this.rateLimiter.limits || new Map()).get(key) || [];
                   const validRequests = userLimits.filter(timestamp => now - timestamp < this.config.rateLimit.windowMs);

                   if (validRequests.length >= this.config.rateLimit.max) {
                       logger.warn('Rate limit exceeded (in-memory fallback):', { 
                           key, 
                           limit: this.config.rateLimit.max, 
                           timestamp: new Date().toISOString(), 
                           metadata: { service: 'predictive-model' } 
                       });
                       return false;
                   }

                   validRequests.push(now);
                   this.rateLimiter.limits = this.rateLimiter.limits || new Map();
                   this.rateLimiter.limits.set(key, validRequests);
                   return true;
               },
               limits: new Map()
           };
       }

       // API routes
       this._setupApiRoutes(app);

       // Catch-all route for SPA frontend (must be after API routes)
       app.get('*', (req, res) => {
           res.sendFile(path.join(publicPath, 'index.html'));
       });

       this._initializeStreaming();
       this._initializeMonitoring();
       this._setupEventHandlers();

       logger.info('All components initialized successfully', { 
           metadata: { service: 'predictive-model', timestamp: new Date().toISOString() } 
       });
   } catch (error) {
       logger.error('Failed to initialize components:', { 
           error: error.message, 
           stack: error.stack, 
           metadata: { service: 'predictive-model', timestamp: new Date().toISOString() } 
       });
       this._handleError(error);
       throw error;
   }
}`;

       // Try to find if _setupApiRoutes exists, if not, we need to add it
       const setupApiRoutesMatch = apiContent.match(/_setupApiRoutes\s*\(\s*app\s*\)\s*\{[\s\S]*?\}/m);
       
       if (!setupApiRoutesMatch) {
         // Add _setupApiRoutes method
         const setupApiRoutesFunction = `
 /**
  * Set up API routes
  * @param {Express} app - Express application
  * @private
  */
 _setupApiRoutes(app) {
   // Health check route
   app.get('/api/health', async (req, res) => {
     try {
       const health = await this.healthCheck();
       res.json(health);
     } catch (error) {
       res.status(500).json({ 
         error: error.message,
         timestamp: new Date().toISOString()
       });
     }
   });

   // Prediction API
   app.post('/api/predict', async (req, res) => {
     try {
       const result = await this.predict(req.body);
       res.json(result);
     } catch (error) {
       res.status(400).json({ 
         error: error.message,
         timestamp: new Date().toISOString()
       });
     }
   });

   // Add more API routes as needed
 }`;

         // Find a good place to insert this function (before the last closing brace of the class)
         const lastBracePosition = apiContent.lastIndexOf('}');
         if (lastBracePosition !== -1) {
           apiContent = apiContent.slice(0, lastBracePosition) + setupApiRoutesFunction + '\n' + apiContent.slice(lastBracePosition);
         }
       }

       // Replace the original function with our fixed version
       apiContent = apiContent.replace(componentsFunctionMatch[0], fixedComponentsFunction);
       
       // Make sure all necessary imports are present
       if (!apiContent.includes('const path = require(\'path\');')) {
         const importMatch = apiContent.match(/const\s+.*\s+=\s+require\(.*\);/);
         if (importMatch) {
           const importPosition = apiContent.indexOf(importMatch[0]) + importMatch[0].length;
           apiContent = apiContent.slice(0, importPosition) + '\nconst path = require(\'path\');' + apiContent.slice(importPosition);
         }
       }
       
       // Write the updated content back to the file
       await promisify(fs.writeFile)(apiJsPath, apiContent);
       
       logger.info('Successfully fixed WebSocket initialization in api.js');
       return true;
     } else {
       logger.warn('Could not find _initializeComponents method in api.js to fix WebSocket issues');
       return false;
     }
   } else {
     logger.info('No WebSocket initialization issues found in api.js');
     return true;
   }
 } catch (error) {
   logger.error(`Error verifying API.js WebSocket initialization: ${error.message}`);
   return false;
 }
}

/**
* Start the application as a child process with optimized settings
* @returns {Promise<boolean>} Whether application started successfully
*/
async function startApplicationProcess() {
 logger.info('Starting application with optimized settings...');
 
 // Build Node.js options
 const nodeOptions = [
   `--max-old-space-size=${config.maxOldSpaceSize}`,
   config.exposedGC ? '--expose-gc' : '',
 ].filter(Boolean);
 
 // Environment variables to pass to the child process
 const env = {
   ...process.env,
   NODE_OPTIONS: nodeOptions.join(' '),
   MAX_WORKERS: config.singleWorker ? '1' : (process.env.MAX_WORKERS || String(Math.max(1, os.cpus().length - 1)))
 };
 
 return new Promise((resolve) => {
   // Start the application
   logger.info(`Starting application: node ${config.mainScriptPath}`);
   
   const child = spawn('node', [config.mainScriptPath], {
     env,
     stdio: 'inherit'
   });
   
   // Record the start time to calculate uptime
   const startTime = Date.now();
   
   // Handle the exit
   child.on('exit', (code, signal) => {
     const uptime = Math.round((Date.now() - startTime) / 1000);
     logger.info(`Application exited with code ${code} and signal ${signal} after ${uptime}s uptime`);
     
     if (uptime < 5) {
       logger.error('Application terminated too quickly. Check logs for errors.');
     }
     
     process.exit(code);
   });
   
   // Handle termination signals
   ['SIGINT', 'SIGTERM'].forEach(signal => {
     process.on(signal, () => {
       logger.info(`Received ${signal}, forwarding to application...`);
       child.kill(signal);
     });
   });
   
   logger.info(`Application started with PID ${child.pid}`);
   logger.info(`Using Node options: ${nodeOptions.join(' ')}`);
   logger.info(`Workers: ${env.MAX_WORKERS}`);
   
   // Consider the startup successful if the process is still running after 2 seconds
   setTimeout(() => {
     if (child.exitCode === null) {
       logger.info('Application startup successful');
       resolve(true);
     } else {
       logger.error(`Application exited prematurely with code ${child.exitCode}`);
       resolve(false);
     }
   }, 2000);
 });
}

/**
* Main function to coordinate startup sequence
*/
async function main() {
 logger.info('Starting Sports Analytics application...');
 
 try {
   // 1. Verify required files
   const filesOk = await verifyRequiredFiles();
   if (!filesOk) {
     logger.error('Missing required files. Cannot start application.');
     process.exit(1);
   }
   
   // 2. Verify WebSocketManager implementation and fix if needed
   const wsManagerOk = await verifyWebSocketManager();
   if (!wsManagerOk) {
     logger.error('Failed to verify or fix WebSocketManager. Cannot start application.');
     process.exit(1);
   }
   
   // 3. Verify WebSocket initialization in api.js
   const apiWsOk = await verifyApiWebSocketInitialization();
   if (!apiWsOk) {
     logger.warn('WebSocket initialization issues detected in api.js. Application may have limited functionality.');
   }
   
   // 4. Verify port availability
   const portsOk = await verifyPortAvailability();
   if (!portsOk) {
     logger.warn('Port verification failed. Application may not be accessible.');
   }
   
   // 5. Verify Python environment
   const pythonOk = await verifyPythonEnvironment();
   if (!pythonOk) {
     logger.warn('Python verification failed. Application may have limited functionality.');
   }
   
   // 6. Verify MongoDB connection
   const mongoOk = await verifyMongoDBConnection();
   if (!mongoOk) {
     logger.error('MongoDB connection failed. Cannot start application.');
     process.exit(1);
   }
   
   // 7. Verify Redis connection
   const redisOk = await verifyRedisConnection();
   if (!redisOk) {
     logger.warn('Redis verification failed. Application may have limited functionality.');
   }
   
   // 8. Verify system resources
   const resourcesOk = await verifySystemResources();
   if (!resourcesOk) {
     logger.warn('System resources verification failed. Application may have limited functionality.');
   }
   
   // 9. Start the application process
   const appStarted = await startApplicationProcess();
   if (!appStarted) {
     logger.error('Application failed to start.');
     process.exit(1);
   }
   
   logger.info('Sports Analytics application started successfully.');
 } catch (error) {
   logger.error(`Fatal error during startup: ${error.message}`);
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