// utils/db.js - Robust MongoDB connection manager
const { MongoClient } = require('mongodb');
const winston = require('winston');
const { performance } = require('perf_hooks');
const { LogManager } = require('./logger');

// Configure logger
const logger = new LogManager().logger;

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
    
    // Enhanced metrics tracking
    this.metrics = {
      connectionEvents: [],
      queries: {
        total: 0,
        success: 0,
        error: 0,
        timeouts: 0
      },
      latency: {
        sum: 0,
        count: 0,
        max: 0,
        min: Number.MAX_SAFE_INTEGER
      },
      lastHealthCheck: null,
      poolStats: {
        size: 0,
        available: 0,
        pending: 0,
        max: this.config.options.maxPoolSize
      }
    };
    
    // Performance monitoring
    this.METRICS_RETENTION_PERIOD = 3600000; // 1 hour
    this.queryTimeoutMs = parseInt(process.env.DB_QUERY_TIMEOUT_MS, 10) || 30000;
    
    // Metrics collection interval
    this.metricsInterval = setInterval(() => {
      this._collectPoolMetrics();
      this._pruneMetrics();
    }, 60000); // Every minute
    
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
      
      // Connect to MongoDB with retry logic
      let retries = 5;
      while (retries) {
        try {
          await this.client.connect();
          this.db = this.client.db(this.config.name);
          
          // Test connection
          await this.db.command({ ping: 1 });
          
          // Register event handlers
          this.client.on('close', this._handleConnectionClose);
          this.client.on('error', this._handleConnectionError);
          
          // Record connection event
          this._recordConnectionEvent('connected', null);
          
          this.connected = true;
          this.reconnectAttempts = 0;
          
          // Initialize pool metrics
          await this._collectPoolMetrics();
          
          logger.info('MongoDB connection established successfully');
          break;
        } catch (error) {
          retries -= 1;
          logger.error('MongoDB connection failed, retrying...', error);
          if (retries === 0) throw error;
          await new Promise(res => setTimeout(res, 5000));
        }
      }
      return true;
    } catch (error) {
      logger.error(`MongoDB connection failed: ${error.message}`);
      this._recordConnectionEvent('failed', error.message);
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
      this._recordConnectionEvent('max_attempts_exceeded', null);
      return;
    }
    
    this.reconnecting = true;
    const delay = Math.min(this.RECONNECT_INTERVAL * Math.pow(1.5, this.reconnectAttempts), 60000);
    this.reconnectAttempts++;
    
    logger.info(`Scheduling reconnection attempt ${this.reconnectAttempts} in ${delay}ms`);
    this._recordConnectionEvent('reconnect_scheduled', { attempt: this.reconnectAttempts, delay });
    
    this.reconnectTimer = setTimeout(async () => {
      try {
        logger.info(`Attempting to reconnect (attempt ${this.reconnectAttempts})`);
        this._recordConnectionEvent('reconnect_attempt', { attempt: this.reconnectAttempts });
        await this.initialize();
      } catch (error) {
        logger.error(`Reconnection attempt ${this.reconnectAttempts} failed: ${error.message}`);
        this._recordConnectionEvent('reconnect_failed', error.message);
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
    this._recordConnectionEvent('closed', null);
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
    this._recordConnectionEvent('error', error.message);
    this.connected = false;
    if (!this.reconnecting) {
      this._scheduleReconnect();
    }
  }
  
  /**
   * Record connection event for metrics
   * @param {string} type - Event type
   * @param {string|Object|null} details - Event details
   * @private
   */
  _recordConnectionEvent(type, details) {
    this.metrics.connectionEvents.push({
      type,
      timestamp: new Date(),
      details
    });
    
    // Limit the number of stored events to prevent memory leaks
    if (this.metrics.connectionEvents.length > 100) {
      this.metrics.connectionEvents.shift();
    }
  }
  
  /**
   * Collect connection pool metrics
   * @private
   */
  async _collectPoolMetrics() {
    try {
      if (!this.client || !this.connected) {
        return;
      }
      
      const poolSize = this.client.topology.connections().length;
      const availableConnections = this.client.topology.s.pool ? 
        this.client.topology.s.pool.availableConnections.length : 0;
        
      this.metrics.poolStats = {
        size: poolSize,
        available: availableConnections,
        pending: this.client.topology.s.pool ? this.client.topology.s.pool.pendingConnections.length : 0,
        max: this.config.options.maxPoolSize
      };
      
      // Log pool stats when approaching capacity
      if (poolSize > this.config.options.maxPoolSize * 0.8) {
        logger.warn(`MongoDB connection pool approaching capacity: ${poolSize}/${this.config.options.maxPoolSize}`);
      }
    } catch (error) {
      logger.debug(`Error collecting pool metrics: ${error.message}`);
    }
  }
  
  /**
   * Prune old metrics data
   * @private
   */
  _pruneMetrics() {
    const cutoff = Date.now() - this.METRICS_RETENTION_PERIOD;
    this.metrics.connectionEvents = this.metrics.connectionEvents.filter(
      event => event.timestamp.getTime() > cutoff
    );
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
      
      const start = performance.now();
      await this.db.command({ ping: 1 });
      const pingTime = performance.now() - start;
      
      const status = this.client.topology.s.state;
      
      // Update pool metrics when health check is performed
      await this._collectPoolMetrics();
      
      this.metrics.lastHealthCheck = {
        timestamp: new Date(),
        pingTime,
        status
      };
      
      return {
        status: 'connected',
        details: {
          state: status,
          pingTime: `${pingTime.toFixed(2)}ms`,
          poolStats: this.metrics.poolStats,
          queryStats: {
            total: this.metrics.queries.total,
            error: this.metrics.queries.error,
            timeouts: this.metrics.queries.timeouts
          },
          avgLatency: this.metrics.latency.count > 0 ? 
            (this.metrics.latency.sum / this.metrics.latency.count).toFixed(2) + 'ms' : 'N/A'
        }
      };
    } catch (error) {
      logger.error(`Health check failed: ${error.message}`);
      this._recordConnectionEvent('health_check_failed', error.message);
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
   * Execute a query with timeout and metrics tracking
   * @param {Function} queryFn - Function that returns a promise (e.g., collection.find().toArray())
   * @param {number} [timeout] - Query timeout in ms (defaults to this.queryTimeoutMs)
   * @returns {Promise<any>} Query result
   */
  async executeQuery(queryFn, timeout = this.queryTimeoutMs) {
    if (!this.connected || !this.db) {
      throw new Error('Database not connected');
    }
    
    const startTime = performance.now();
    this.metrics.queries.total++;
    
    try {
      // Execute query with timeout
      const result = await Promise.race([
        queryFn(),
        new Promise((_, reject) => {
          setTimeout(() => {
            reject(new Error(`Query timeout after ${timeout}ms`));
          }, timeout);
        })
      ]);
      
      // Record metrics for successful query
      const duration = performance.now() - startTime;
      this.metrics.queries.success++;
      this.metrics.latency.sum += duration;
      this.metrics.latency.count++;
      this.metrics.latency.max = Math.max(this.metrics.latency.max, duration);
      this.metrics.latency.min = Math.min(this.metrics.latency.min, duration);
      
      // Log slow queries
      if (duration > 1000) {
        logger.warn(`Slow query detected: ${duration.toFixed(2)}ms`);
      }
      
      return result;
    } catch (error) {
      // Record metrics for failed query
      const duration = performance.now() - startTime;
      this.metrics.queries.error++;
      
      if (error.message.includes('timeout')) {
        this.metrics.queries.timeouts++;
        logger.error(`Query timeout after ${timeout}ms`);
      } else {
        logger.error(`Query error: ${error.message}`);
      }
      
      throw error;
    }
  }
  
  /**
   * Get database metrics
   * @returns {Object} Database metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      latency: {
        ...this.metrics.latency,
        avg: this.metrics.latency.count > 0 ? 
          this.metrics.latency.sum / this.metrics.latency.count : 0
      },
      uptime: this.connected ? 
        Date.now() - (this.metrics.connectionEvents.find(e => e.type === 'connected')?.timestamp.getTime() || Date.now()) : 0
    };
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
      
      if (this.metricsInterval) {
        clearInterval(this.metricsInterval);
        this.metricsInterval = null;
      }
      
      if (this.client) {
        await this.client.close();
        this.client = null;
        this.db = null;
      }
      
      this.connected = false;
      this.reconnecting = false;
      this._recordConnectionEvent('closed_gracefully', null);
      
      logger.info('MongoDB connection closed successfully');
      return true;
    } catch (error) {
      logger.error(`Error closing MongoDB connection: ${error.message}`);
      this._recordConnectionEvent('close_failed', error.message);
      return false;
    }
  }
  
  /**
   * Graceful shutdown with timeout
   * @param {number} [timeout=5000] - Shutdown timeout in ms
   * @returns {Promise<boolean>} Shutdown success status
   */
  async shutdown(timeout = 5000) {
    logger.info(`Initiating database shutdown with ${timeout}ms timeout`);
    
    try {
      // Set up a timeout race
      return await Promise.race([
        this.close(),
        new Promise((resolve) => {
          setTimeout(() => {
            logger.warn(`Database shutdown timed out after ${timeout}ms`);
            this.connected = false;
            this.client = null;
            this.db = null;
            resolve(false);
          }, timeout);
        })
      ]);
    } catch (error) {
      logger.error(`Error during database shutdown: ${error.message}`);
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

/**
 * Connect to the database and return the connection
 * @param {Object} config - Optional configuration object
 * @returns {Promise<Object>} - Database manager instance
 */
async function connectToDatabase(config = {}) {
  const dbManager = getDatabaseManager(config);
  await dbManager.initialize();
  return dbManager;
}

module.exports = {
  DatabaseManager,
  getDatabaseManager,
  connectToDatabase
};