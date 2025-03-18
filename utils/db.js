// utils/db.js - Robust MongoDB connection manager
const { MongoClient } = require('mongodb');
const winston = require('winston');

// Configure logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    }),
    new winston.transports.File({ 
      filename: 'logs/mongodb-error.log',
      level: 'error'
    }),
    new winston.transports.File({ 
      filename: 'logs/mongodb.log'
    })
  ]
});

// Ensure logs directory exists
const fs = require('fs');
const path = require('path');
if (!fs.existsSync('logs')) {
  fs.mkdirSync('logs', { recursive: true });
}

/**
 * Enterprise-grade MongoDB connection manager with high availability features
 */
class DatabaseManager {
  constructor(config = {}) {
    this.config = {
      uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/sports-analytics',
      name: process.env.MONGODB_DB_NAME || 'sports-analytics',
      options: {
        maxPoolSize: parseInt(process.env.DB_MAX_POOL_SIZE, 10) || 50,
        minPoolSize: parseInt(process.env.DB_MIN_POOL_SIZE, 10) || 5,
        connectTimeoutMS: parseInt(process.env.CONNECT_TIMEOUT_MS, 10) || 30000,
        socketTimeoutMS: parseInt(process.env.SOCKET_TIMEOUT_MS, 10) || 45000,
        serverSelectionTimeoutMS: 15000,
        heartbeatFrequencyMS: 10000,
        retryWrites: true,
        retryReads: true,
        ...config.options
      },
      ...config
    };
    
    this.client = null;
    this.db = null;
    this.connected = false;
    this.reconnecting = false;
    this.reconnectAttempts = 0;
    this.MAX_RECONNECT_ATTEMPTS = 10;
    this.RECONNECT_INTERVAL = 5000;
    this.reconnectTimer = null;
    
    // Bind event handlers
    this._handleConnectionClose = this._handleConnectionClose.bind(this);
    this._handleConnectionError = this._handleConnectionError.bind(this);
  }
  
  /**
   * Initialize database connection
   * @returns {Promise<boolean>} Connection success status
   */
  async initialize() {
    try {
      if (this.client && this.connected) {
        logger.info('Database already connected');
        return true;
      }
      
      // Create MongoDB client
      this.client = new MongoClient(this.config.uri, this.config.options);
      
      // Connect to MongoDB
      await this.client.connect();
      this.db = this.client.db(this.config.name);
      
      // Test connection
      await this.db.command({ ping: 1 });
      
      // Register event handlers
      this.client.on('close', this._handleConnectionClose);
      this.client.on('error', this._handleConnectionError);
      
      this.connected = true;
      this.reconnectAttempts = 0;
      
      logger.info('MongoDB connection established successfully');
      return true;
    } catch (error) {
      logger.error(`MongoDB connection failed: ${error.message}`);
      this.connected = false;
      
      // Initial connection failed, try to reconnect
      this._scheduleReconnect();
      return false;
    }
  }
  
  /**
   * Schedule reconnection attempt with exponential backoff
   * @private
   */
  _scheduleReconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }
    
    if (this.reconnectAttempts >= this.MAX_RECONNECT_ATTEMPTS) {
      logger.error(`Maximum reconnection attempts (${this.MAX_RECONNECT_ATTEMPTS}) exceeded`);
      return;
    }
    
    this.reconnecting = true;
    const delay = Math.min(this.RECONNECT_INTERVAL * Math.pow(1.5, this.reconnectAttempts), 60000);
    this.reconnectAttempts++;
    
    logger.info(`Scheduling reconnection attempt ${this.reconnectAttempts} in ${delay}ms`);
    
    this.reconnectTimer = setTimeout(async () => {
      try {
        logger.info(`Attempting to reconnect (attempt ${this.reconnectAttempts})`);
        await this.initialize();
      } catch (error) {
        logger.error(`Reconnection attempt ${this.reconnectAttempts} failed: ${error.message}`);
        this._scheduleReconnect();
      }
    }, delay);
  }
  
  /**
   * Handle connection close event
   * @private
   */
  _handleConnectionClose() {
    logger.warn('MongoDB connection closed unexpectedly');
    this.connected = false;
    if (!this.reconnecting) {
      this._scheduleReconnect();
    }
  }
  
  /**
   * Handle connection error event
   * @param {Error} error - Connection error
   * @private
   */
  _handleConnectionError(error) {
    logger.error(`MongoDB connection error: ${error.message}`);
    this.connected = false;
    if (!this.reconnecting) {
      this._scheduleReconnect();
    }
  }
  
  /**
   * Check if database is connected
   * @returns {boolean} Connection status
   */
  isConnected() {
    return this.connected && this.client !== null;
  }
  
  /**
   * Perform health check
   * @returns {Promise<Object>} Health status
   */
  async healthCheck() {
    try {
      if (!this.client || !this.connected) {
        return { status: 'disconnected' };
      }
      
      await this.db.command({ ping: 1 });
      const status = this.client.topology.s.state;
      
      return {
        status: 'connected',
        details: {
          state: status,
          poolSize: this.client.topology.s.pool ? this.client.topology.s.pool.size : 'N/A'
        }
      };
    } catch (error) {
      logger.error(`Health check failed: ${error.message}`);
      return { 
        status: 'error',
        error: error.message
      };
    }
  }
  
  /**
   * Get database instance
   * @returns {Object|null} MongoDB database instance 
   */
  getDb() {
    if (!this.connected || !this.db) {
      logger.warn('Attempted to get database instance while disconnected');
      return null;
    }
    
    return this.db;
  }
  
  /**
   * Close database connection
   * @returns {Promise<boolean>} Close success status
   */
  async close() {
    try {
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }
      
      if (this.client) {
        await this.client.close();
        this.client = null;
        this.db = null;
      }
      
      this.connected = false;
      this.reconnecting = false;
      
      logger.info('MongoDB connection closed successfully');
      return true;
    } catch (error) {
      logger.error(`Error closing MongoDB connection: ${error.message}`);
      return false;
    }
  }
}

// Singleton instance
let instance = null;

/**
 * Get DatabaseManager instance
 * @param {Object} config - Optional configuration
 * @returns {DatabaseManager} Database manager instance
 */
function getDatabaseManager(config = {}) {
  if (!instance) {
    instance = new DatabaseManager(config);
  }
  return instance;
}

module.exports = {
  DatabaseManager,
  getDatabaseManager
};
