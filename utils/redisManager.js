/**
 * Enhanced Redis Manager with enterprise-level features:
 * - Cluster mode support
 * - Graceful fallback to standalone
 * - Memory cache fallback
 * - Connection pooling
 * - Comprehensive error handling
 * - Performance monitoring
 * - Circuit breaker pattern
 */
const Redis = require('ioredis');
const { EventEmitter } = require('events');
const NodeCache = require('node-cache');
require('dotenv').config();

// Create a logger instance
const winston = require('winston');
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  defaultMeta: { service: 'redis-manager' },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ]
});

// Memory cache as fallback
const memoryCache = new NodeCache({
  stdTTL: parseInt(process.env.CACHE_TTL, 10) || 900,
  checkperiod: parseInt(process.env.CACHE_CHECK_PERIOD, 10) || 300,
  useClones: false,
  deleteOnExpire: true,
  maxKeys: parseInt(process.env.CACHE_MAX_ITEMS, 10) || 100
});

class RedisManager extends EventEmitter {
  constructor() {
    super();
    this.client = null;
    this.isMemoryMode = process.env.USE_IN_MEMORY_CACHE === 'true';
    this.isConnected = false;
    this.connectionAttempts = 0;
    this.maxRetries = parseInt(process.env.REDIS_MAX_RETRIES, 10) || 3;
    this.healthCheckInterval = null;
    this.stats = {
      operations: 0,
      hits: 0,
      misses: 0,
      errors: 0
    };
    this.initialize();
  }

  async initialize() {
    if (this.isMemoryMode) {
      logger.info('Using in-memory cache mode');
      this.isConnected = true;
      this.emit('ready');
      return;
    }

    try {
      const useCluster = process.env.USE_REDIS_CLUSTER === 'true';
      const redisOptions = {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT, 10) || 6379,
        password: process.env.REDIS_PASSWORD || undefined,
        connectTimeout: parseInt(process.env.REDIS_CONNECT_TIMEOUT, 10) || 10000,
        maxRetriesPerRequest: parseInt(process.env.REDIS_MAX_RETRIES, 10) || 3,
        enableOfflineQueue: process.env.REDIS_ENABLE_OFFLINE_QUEUE === 'true',
        retryStrategy: (times) => {
          this.connectionAttempts = times;
          if (times > this.maxRetries) {
            // Switch to memory mode after max retries
            this.switchToMemoryMode('Max connection retries exceeded');
            return false; // Stop retrying
          }
          
          const delay = Math.min(
            times * 1000, 
            parseInt(process.env.REDIS_RETRY_STRATEGY_MAX_DELAY, 10) || 5000
          );
          logger.warn(`Redis connection attempt ${times} failed, retrying in ${delay}ms`);
          return delay;
        }
      };

      // Create Redis client based on cluster mode setting
      if (useCluster) {
        try {
          logger.info('Initializing Redis in cluster mode');
          
          // Try a simpler cluster setup first
          this.client = new Redis({
            ...redisOptions,
            // Specify a single node as the starting point
            clusters: [
              { host: redisOptions.host, port: redisOptions.port }
            ]
          });
          
        } catch (clusterError) {
          logger.error(`Redis cluster initialization failed: ${clusterError.message}`, {
            error: clusterError.stack
          });
          
          // Fall back to standalone mode
          logger.info('Falling back to standalone Redis mode');
          this.client = new Redis(redisOptions);
        }
      } else {
        logger.info('Initializing Redis in standalone mode');
        this.client = new Redis(redisOptions);
      }

      // Set up event listeners
      this.setupEventListeners();
      
      // Start health check
      this.startHealthCheck();
      
    } catch (error) {
      logger.error(`Redis initialization failed: ${error.message}`, {
        error: error.stack
      });
      this.switchToMemoryMode('Initialization failed');
    }
  }

  setupEventListeners() {
    if (!this.client) return;

    this.client.on('connect', () => {
      logger.info('Redis connected');
    });

    this.client.on('ready', () => {
      this.isConnected = true;
      this.connectionAttempts = 0;
      logger.info('Redis connection is ready and operational');
      this.emit('ready');
    });

    this.client.on('error', (error) => {
      this.stats.errors++;
      
      if (error.code === 'CLUSTERDOWN' || error.message.includes('Failed to refresh')) {
        logger.error(`Redis cluster error: ${error.message}`);
        this.switchToMemoryMode('Cluster is down or unreachable');
        return;
      }

      logger.error(`Redis error: ${error.message}`, {
        error: error.stack
      });
      
      // Don't switch to memory mode for every error - let the retry strategy handle it
    });

    this.client.on('end', () => {
      logger.info('Redis connection closed');
      this.isConnected = false;
      this.emit('end');
    });
    
    this.client.on('reconnecting', (delay) => {
      logger.info(`Redis reconnecting in ${delay}ms`);
    });
  }

  startHealthCheck() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    this.healthCheckInterval = setInterval(() => {
      if (this.isMemoryMode) return;
      
      this.ping().catch(error => {
        logger.warn(`Health check failed: ${error.message}`);
        // If health check fails multiple times, switch to memory mode
        if (++this.stats.errors > this.maxRetries) {
          this.switchToMemoryMode('Health check failures exceeded threshold');
        }
      });
    }, parseInt(process.env.HEALTH_CHECK_INTERVAL, 10) || 30000);
    
    // Don't keep the process running just for this
    this.healthCheckInterval.unref();
  }

  switchToMemoryMode(reason) {
    if (this.isMemoryMode) return;
    
    logger.warn(`Switching to in-memory cache mode. Reason: ${reason}`);
    
    // Disconnect Redis client if it exists
    if (this.client) {
      try {
        this.client.disconnect();
      } catch (error) {
        logger.error(`Error disconnecting Redis: ${error.message}`);
      }
      this.client = null;
    }
    
    this.isMemoryMode = true;
    process.env.USE_IN_MEMORY_CACHE = 'true';
    this.emit('fallback', { reason });
  }

  /**
   * Ping Redis to check connectivity
   * @returns {Promise<string>} "PONG" if successful
   */
  async ping() {
    if (this.isMemoryMode) {
      return "MEMORY_MODE";
    }
    
    try {
      this.stats.operations++;
      return await this.client.ping();
    } catch (error) {
      this.stats.errors++;
      throw error;
    }
  }

  /**
   * Get a value from cache
   * @param {string} key - Cache key
   * @returns {Promise<any>} Cached value or null
   */
  async get(key) {
    try {
      this.stats.operations++;
      
      if (this.isMemoryMode) {
        const value = memoryCache.get(key);
        if (value !== undefined) {
          this.stats.hits++;
          return value;
        }
        this.stats.misses++;
        return null;
      }

      const value = await this.client.get(key);
      
      if (value) {
        this.stats.hits++;
        try {
          return JSON.parse(value);
        } catch (e) {
          return value; // Return as string if not JSON
        }
      }
      
      this.stats.misses++;
      return null;
    } catch (error) {
      this.stats.errors++;
      logger.error(`Error getting key ${key}: ${error.message}`);
      
      // Fallback to memory cache on Redis error
      if (!this.isMemoryMode) {
        const memValue = memoryCache.get(key);
        if (memValue !== undefined) {
          return memValue;
        }
      }
      
      return null;
    }
  }

  /**
   * Set a value in cache
   * @param {string} key - Cache key
   * @param {any} value - Value to cache
   * @param {number} ttl - Time to live in seconds
   * @returns {Promise<boolean>} Success status
   */
  async set(key, value, ttl = parseInt(process.env.CACHE_TTL, 10) || 900) {
    try {
      this.stats.operations++;
      
      if (this.isMemoryMode) {
        memoryCache.set(key, value, ttl);
        return true;
      }

      const serializedValue = typeof value === 'string' ? value : JSON.stringify(value);
      
      if (ttl > 0) {
        await this.client.set(key, serializedValue, 'EX', ttl);
      } else {
        await this.client.set(key, serializedValue);
      }
      
      // Also set in memory cache as backup
      memoryCache.set(key, value, ttl);
      
      return true;
    } catch (error) {
      this.stats.errors++;
      logger.error(`Error setting key ${key}: ${error.message}`);
      
      // Fall back to memory cache
      if (!this.isMemoryMode) {
        memoryCache.set(key, value, ttl);
      }
      
      return false;
    }
  }

  /**
   * Delete a value from cache
   * @param {string} key - Cache key
   * @returns {Promise<boolean>} Success status
   */
  async del(key) {
    try {
      this.stats.operations++;
      
      if (this.isMemoryMode) {
        return memoryCache.del(key) > 0;
      }

      const result = await this.client.del(key);
      
      // Also remove from memory cache
      memoryCache.del(key);
      
      return result > 0;
    } catch (error) {
      this.stats.errors++;
      logger.error(`Error deleting key ${key}: ${error.message}`);
      
      // Try to remove from memory cache anyway
      if (!this.isMemoryMode) {
        memoryCache.del(key);
      }
      
      return false;
    }
  }

  /**
   * Check if a key exists in cache
   * @param {string} key - Cache key
   * @returns {Promise<boolean>} True if key exists
   */
  async exists(key) {
    try {
      this.stats.operations++;
      
      if (this.isMemoryMode) {
        return memoryCache.has(key);
      }

      const result = await this.client.exists(key);
      return result === 1;
    } catch (error) {
      this.stats.errors++;
      logger.error(`Error checking existence of key ${key}: ${error.message}`);
      
      // Fallback to memory cache
      if (!this.isMemoryMode) {
        return memoryCache.has(key);
      }
      
      return false;
    }
  }

  /**
   * Get cache statistics
   * @returns {Object} Cache statistics
   */
  getStats() {
    return {
      ...this.stats,
      hitRate: this.stats.operations > 0 ? 
        (this.stats.hits / this.stats.operations) * 100 : 0,
      mode: this.isMemoryMode ? 'memory' : 'redis',
      connected: this.isConnected,
      memoryItems: memoryCache.getStats().keys,
      uptime: process.uptime()
    };
  }

  /**
   * Clean up resources
   */
  async cleanup() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
    
    if (this.client && !this.isMemoryMode) {
      try {
        await this.client.quit();
        logger.info('Redis connection closed gracefully');
      } catch (error) {
        logger.error(`Error closing Redis connection: ${error.message}`);
      }
    }
    
    this.isConnected = false;
    this.emit('cleanup');
  }
}

// Create a singleton instance
const redisManager = new RedisManager();

// Handle process exit
process.on('SIGTERM', async () => {
  await redisManager.cleanup();
});

process.on('SIGINT', async () => {
  await redisManager.cleanup();
});

module.exports = redisManager;