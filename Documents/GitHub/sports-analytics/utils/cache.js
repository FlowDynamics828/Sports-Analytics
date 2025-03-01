// utils/cache.js
const NodeCache = require('node-cache');
const _ = require('lodash');
const Redis = require('ioredis'); // Added for Redis fallback/hybrid caching
require('dotenv').config(); // Added to access .env variables
const winston = require('winston'); // Added to fix ReferenceError

// Configure winston logger to match api.js
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    }),
    new winston.transports.File({ filename: 'error.log', level: 'error' })
  ]
});

class CacheManager {
  constructor(options = {}) {
    // Use .env settings with defaults
    const cacheTTL = parseInt(process.env.CACHE_TTL) || 1800; // 30 minutes from .env
    const cacheCheckPeriod = parseInt(process.env.CACHE_CHECK_PERIOD) || 300; // 5 minutes from .env
    const cacheMaxItems = parseInt(process.env.CACHE_MAX_ITEMS) || 500; // 500 items from .env

    this.cache = new NodeCache({
      stdTTL: cacheTTL, // Use .env value
      checkperiod: cacheCheckPeriod, // Use .env value
      useClones: false,
      maxKeys: cacheMaxItems, // Limit in-memory cache size
      ...options
    });

    // Use the global Redis client from api.js
    this.redis = require('../api').redisClient;

    // Cache statistics with Redis fallback tracking
    this.stats = {
      hits: 0,
      misses: 0,
      keys: 0,
      redisHits: 0,
      redisMisses: 0
    };

    // Create middleware function as a class method
    this.middleware = this.createMiddleware.bind(this);

    // Initialize asynchronously in constructor
    this.initialized = false;

    // Add memory usage check
    this.checkMemoryUsage = () => {
      const memoryUsage = process.memoryUsage();
      if (memoryUsage.heapUsed / memoryUsage.heapTotal > 0.80) { // Match .env threshold
        logger.warn(`High memory usage detected in CacheManager: ${Math.round((memoryUsage.heapUsed / memoryUsage.heapTotal) * 100)}% of heap used`, {
          metadata: { service: 'cache-manager', timestamp: new Date().toISOString() }
        });
      }
    };
    setInterval(this.checkMemoryUsage, 300000); // Check every 5 minutes
  }

  /**
   * Initialize cache system with async Redis connection handling
   * @param {Redis} redisClient - Optional Redis client (uses global if not provided)
   * @returns {Promise<void>} Resolves when initialization is complete
   */
  async initialize(redisClient = this.redis) {
    if (this.initialized) return; // Prevent multiple initializations

    try {
      // Ensure Redis client exists and is connected
      if (!redisClient) {
        throw new Error('Redis client is not initialized');
      }

      this.redis = redisClient; // Use the provided or global Redis client

      // Wait for Redis to be ready (if not already connected)
      if (this.redis && this.redis.status !== 'ready') {
        await new Promise((resolve, reject) => {
          this.redis.on('ready', () => {
            logger.info('Redis connection established for cache', { 
              metadata: { service: 'cache-manager', timestamp: new Date().toISOString() } 
            });
            resolve();
          });
          this.redis.on('error', (error) => {
            logger.warn('Redis connection failed, using in-memory cache only:', { 
              error: error.message, 
              metadata: { service: 'cache-manager', timestamp: new Date().toISOString() } 
            });
            this.redis = null; // Disable Redis if connection fails
            resolve(); // Resolve even if Redis fails to prevent stalling
          });
        });
      }

      // Set up cache event listeners
      this.cache.on('set', () => {
        this.stats.keys = this.cache.keys().length;
        this.checkMemoryUsage(); // Check memory after set
      });

      this.cache.on('del', () => {
        this.stats.keys = this.cache.keys().length;
      });

      this.cache.on('expired', () => {
        this.stats.keys = this.cache.keys().length;
      });

      this.initialized = true;
    } catch (error) {
      logger.error('Cache initialization failed:', { 
        error: error.message, 
        stack: error.stack, 
        metadata: { service: 'cache-manager', timestamp: new Date().toISOString() } 
      });
      this.redis = null; // Ensure Redis is disabled on error
      throw error;
    }
  }

  /**
   * Create caching middleware
   * @param {number} duration Cache duration in seconds
   * @returns {Function} Express middleware
   */
  createMiddleware(duration) {
    return (req, res, next) => {
      const key = req.originalUrl;
      const cachedResponse = this.get(key); // Use get method for hybrid caching

      if (cachedResponse) {
        this.stats.hits++;
        res.json(cachedResponse);
        return;
      }

      this.stats.misses++;
      res.originalJson = res.json;
      res.json = body => {
        this.set(key, body, duration).catch(error => {
          logger.error('Failed to cache response:', { 
            error: error.message, 
            metadata: { service: 'cache-manager', timestamp: new Date().toISOString() } 
          });
        });
        res.originalJson(body);
      };
      next();
    };
  }

  /**
   * Get value from cache (hybrid: in-memory first, Redis fallback)
   * @param {string} key Cache key
   * @returns {*} Cached value or undefined
   */
  async get(key) {
    try {
      this.checkMemoryUsage(); // Check memory before processing
      const inMemoryValue = this.cache.get(key);
      if (inMemoryValue !== undefined) {
        this.stats.hits++;
        return inMemoryValue;
      }

      if (this.redis) {
        const redisValue = await this.redis.get(key);
        if (redisValue) {
          this.stats.redisHits++;
          const parsedValue = JSON.parse(redisValue);
          this.cache.set(key, parsedValue, this.cache.options.stdTTL); // Sync to in-memory
          return parsedValue;
        }
        this.stats.redisMisses++;
      }

      this.stats.misses++;
      return null;
    } catch (error) {
      logger.error(`Cache get error for key ${key}:`, { 
        error: error.message, 
        stack: error.stack, 
        metadata: { service: 'cache-manager', timestamp: new Date().toISOString() } 
      });
      this.stats.misses++;
      return null;
    }
  }

  /**
   * Set value in cache (hybrid: in-memory primary, Redis secondary)
   * @param {string} key Cache key
   * @param {*} value Value to cache
   * @param {number} ttl Time to live in seconds
   */
  async set(key, value, ttl = this.cache.options.stdTTL) {
    try {
      this.checkMemoryUsage(); // Check memory before processing
      this.cache.set(key, value, ttl);
      if (this.redis) {
        await this.redis.setex(key, ttl, JSON.stringify(value));
      }
    } catch (error) {
      logger.error(`Cache set error for key ${key}:`, { 
        error: error.message, 
        stack: error.stack, 
        metadata: { service: 'cache-manager', timestamp: new Date().toISOString() } 
      });
      throw error;
    }
  }

  /**
   * Delete value from cache
   * @param {string} key Cache key
   */
  async delete(key) {
    try {
      this.checkMemoryUsage(); // Check memory before processing
      this.cache.del(key);
      if (this.redis) {
        await this.redis.del(key);
      }
    } catch (error) {
      logger.error(`Cache delete error for key ${key}:`, { 
        error: error.message, 
        stack: error.stack, 
        metadata: { service: 'cache-manager', timestamp: new Date().toISOString() } 
      });
      throw error;
    }
  }

  /**
   * Clear entire cache
   */
  async clear() {
    try {
      this.checkMemoryUsage(); // Check memory before processing
      this.cache.flushAll();
      if (this.redis) {
        await this.redis.flushdb();
      }
    } catch (error) {
      logger.error('Cache clear error:', { 
        error: error.message, 
        stack: error.stack, 
        metadata: { service: 'cache-manager', timestamp: new Date().toISOString() } 
      });
      throw error;
    }
  }

  /**
   * Get cache statistics
   * @returns {Object} Cache statistics
   */
  getStats() {
    return {
      ...this.stats,
      memoryUsage: this.cache.getStats(),
      keys: this.cache.keys().length,
      hitRate: this.calculateHitRate(),
      redisStatus: this.redis ? 'connected' : 'disconnected',
      metadata: { service: 'cache-manager', timestamp: new Date().toISOString() }
    };
  }

  /**
   * Calculate cache hit rate
   * @returns {number} Hit rate percentage
   */
  calculateHitRate() {
    const total = this.stats.hits + this.stats.misses;
    if (total === 0) return 0;
    return (this.stats.hits / total) * 100;
  }

  /**
   * Health check method
   * @returns {Object} Health status
   */
  async healthCheck() {
    try {
      this.checkMemoryUsage(); // Check memory before processing
      const testKey = '_health_check_';
      await this.set(testKey, 'test', 1);
      const value = await this.get(testKey);
      
      return {
        status: value === 'test' ? 'healthy' : 'degraded',
        stats: this.getStats()
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message,
        metadata: { service: 'cache-manager', timestamp: new Date().toISOString() }
      };
    }
  }

  /**
   * Get keys matching pattern
   * @param {string} pattern Pattern to match (supports * wildcard)
   * @returns {Array} Matching keys
   */
  async keys(pattern) {
    try {
      this.checkMemoryUsage(); // Check memory before processing
      const allKeys = this.cache.keys();
      if (!pattern || pattern === '*') return allKeys;
      
      const regexPattern = pattern
          .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
          .replace(/\*/g, '.*');
      
      const regex = new RegExp(`^${regexPattern}$`);
      return allKeys.filter(key => regex.test(key));
    } catch (error) {
      logger.error(`Cache keys error for pattern ${pattern}:`, { 
        error: error.message, 
        stack: error.stack, 
        metadata: { service: 'cache-manager', timestamp: new Date().toISOString() } 
      });
      return [];
    }
  }

  /**
   * Check if key exists in cache
   * @param {string} key Cache key
   * @returns {boolean} True if key exists
   */
  async has(key) {
    try {
      this.checkMemoryUsage(); // Check memory before processing
      return this.cache.has(key) || (this.redis && await this.redis.exists(key));
    } catch (error) {
      logger.error(`Cache has error for key ${key}:`, { 
        error: error.message, 
        stack: error.stack, 
        metadata: { service: 'cache-manager', timestamp: new Date().toISOString() } 
      });
      return false;
    }
  }

  /**
   * Shutdown cache system
   */
  async shutdown() {
    try {
      this.checkMemoryUsage(); // Check memory before processing
      if (this.redis) {
        await this.redis.quit();
        logger.info('Redis cache connection closed', { 
          metadata: { service: 'cache-manager', timestamp: new Date().toISOString() } 
        });
      }
      this.cache.flushAll();
    } catch (error) {
      logger.error('Cache shutdown error:', { 
        error: error.message, 
        stack: error.stack, 
        metadata: { service: 'cache-manager', timestamp: new Date().toISOString() } 
      });
      throw error;
    }
  }
}

// Create middleware function that uses the CacheManager
function createCacheMiddleware(duration) {
    const manager = new CacheManager();
    return manager.middleware(duration);
}

// Export both the CacheManager class and the middleware factory
module.exports = {
    CacheManager,
    createCacheMiddleware
};