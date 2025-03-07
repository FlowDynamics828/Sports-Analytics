// utils/cache.js
const NodeCache = require('node-cache');
const _ = require('lodash');
const Redis = require('ioredis'); // Added for Redis fallback/hybrid caching
require('dotenv').config(); // Added to access .env variables
const winston = require('winston');

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
    const cacheTTL = parseInt(process.env.CACHE_TTL, 10) || 1800; // 30 minutes from .env
    const cacheCheckPeriod = parseInt(process.env.CACHE_CHECK_PERIOD, 10) || 300; // 5 minutes from .env
    const cacheMaxItems = parseInt(process.env.CACHE_MAX_ITEMS, 10) || 500; // 500 items from .env

    this.cache = new NodeCache({
      stdTTL: cacheTTL, // Use .env value
      checkperiod: cacheCheckPeriod, // Use .env value
      useClones: false,
      maxKeys: cacheMaxItems, // Limit in-memory cache size
      ...options
    });

    // We'll initialize Redis later in the initialize method
    this.redis = null;

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

    // Add memory usage check with automatic cleanup
    this.checkMemoryUsage = () => {
      const memoryUsage = process.memoryUsage();
      const memoryThreshold = parseFloat(process.env.MEMORY_USAGE_THRESHOLD) || 0.80; // Match .env threshold
      const currentUsage = memoryUsage.heapUsed / memoryUsage.heapTotal;

      if (currentUsage > memoryThreshold) {
        logger.warn(`High memory usage detected in CacheManager: ${Math.round(currentUsage * 100)}% of heap used`, {
          metadata: { service: 'cache-manager', timestamp: new Date().toISOString() }
        });

        // Perform automatic cleanup when memory usage is high
        this.performMemoryOptimization(currentUsage, memoryThreshold);

        // Try to trigger garbage collection if available
        if (global.gc) {
          global.gc();
          logger.info('Garbage collection triggered in CacheManager', {
            metadata: { service: 'cache-manager', timestamp: new Date().toISOString() }
          });
        }
      }
    };

    // Set up memory check interval - reduced frequency to avoid overhead
    this.memoryCheckInterval = setInterval(this.checkMemoryUsage, 300000); // Check every 5 minutes
  }

  /**
   * Initialize cache system with async Redis connection handling
   * @param {Redis} redisClient - Redis client to use
   * @returns {Promise<void>} Resolves when initialization is complete
   */
  async initialize(redisClient) {
    if (this.initialized) return; // Prevent multiple initializations

    try {
      // Ensure Redis client exists
      if (!redisClient) {
        logger.warn('Redis client not provided to CacheManager, using in-memory cache only', {
          metadata: { service: 'cache-manager', timestamp: new Date().toISOString() }
        });
        this.initialized = true;
        return;
      }

      this.redis = redisClient; // Use the provided Redis client

      // Wait for Redis to be ready (if not already connected)
      if (this.redis.status !== 'ready') {
        await new Promise((resolve) => {
          const readyHandler = () => {
            logger.info('Redis connection established for cache', {
              metadata: { service: 'cache-manager', timestamp: new Date().toISOString() }
            });
            this.redis.removeListener('error', errorHandler);
            clearTimeout(timeoutId);
            resolve();
          };

          const errorHandler = (error) => {
            logger.warn('Redis connection failed, using in-memory cache only:', {
              error: error.message,
              metadata: { service: 'cache-manager', timestamp: new Date().toISOString() }
            });
            this.redis.removeListener('ready', readyHandler);
            clearTimeout(timeoutId);
            this.redis = null; // Disable Redis if connection fails
            resolve(); // Resolve even if Redis fails to prevent stalling
          };

          // Add event listeners with proper cleanup
          this.redis.once('ready', readyHandler);
          this.redis.once('error', errorHandler);

          // Add a timeout to prevent hanging if Redis never connects
          const timeoutId = setTimeout(() => {
            logger.warn('Redis connection timeout, using in-memory cache only', {
              metadata: { service: 'cache-manager', timestamp: new Date().toISOString() }
            });
            this.redis.removeListener('ready', readyHandler);
            this.redis.removeListener('error', errorHandler);
            this.redis = null;
            resolve();
          }, 10000); // 10 second timeout (increased for reliability)
        });
      }

      // Verify Redis connection with ping
      if (this.redis) {
        try {
          await this.redis.ping();
          logger.info('Redis connection verified with PING', {
            metadata: { service: 'cache-manager', timestamp: new Date().toISOString() }
          });
        } catch (pingError) {
          logger.warn('Redis PING failed, using in-memory cache only:', {
            error: pingError.message,
            metadata: { service: 'cache-manager', timestamp: new Date().toISOString() }
          });
          this.redis = null;
        }
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
      // Don't throw the error, just log it and continue with in-memory cache
      this.initialized = true;
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
      if (!this.initialized) {
        logger.warn('Cache not initialized, initializing now', {
          metadata: { service: 'cache-manager', timestamp: new Date().toISOString() }
        });
        await this.initialize(null); // Initialize with no Redis if not already done
      }

      this.checkMemoryUsage(); // Check memory before processing
      const inMemoryValue = this.cache.get(key);
      if (inMemoryValue !== undefined) {
        this.stats.hits++;
        return inMemoryValue;
      }

      if (this.redis) {
        try {
          const redisValue = await this.redis.get(key);
          if (redisValue) {
            this.stats.redisHits++;
            const parsedValue = JSON.parse(redisValue);
            this.cache.set(key, parsedValue, this.cache.options.stdTTL); // Sync to in-memory
            return parsedValue;
          }
          this.stats.redisMisses++;
        } catch (redisError) {
          logger.warn(`Redis get error for key ${key}, falling back to in-memory:`, {
            error: redisError.message,
            metadata: { service: 'cache-manager', timestamp: new Date().toISOString() }
          });
        }
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
      if (!this.initialized) {
        logger.warn('Cache not initialized, initializing now', {
          metadata: { service: 'cache-manager', timestamp: new Date().toISOString() }
        });
        await this.initialize(null); // Initialize with no Redis if not already done
      }

      this.checkMemoryUsage(); // Check memory before processing
      this.cache.set(key, value, ttl);

      if (this.redis) {
        try {
          await this.redis.setex(key, ttl, JSON.stringify(value));
        } catch (redisError) {
          logger.warn(`Redis set error for key ${key}, continuing with in-memory only:`, {
            error: redisError.message,
            metadata: { service: 'cache-manager', timestamp: new Date().toISOString() }
          });
          // Continue execution - don't throw error if Redis fails but in-memory succeeds
        }
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
   * Perform memory optimization when memory usage is high
   * @param {number} currentUsage - Current memory usage ratio
   * @param {number} threshold - Memory usage threshold
   */
  async performMemoryOptimization(currentUsage, threshold) {
    try {
      // Limit optimization frequency to prevent thrashing
      const now = Date.now();
      if (this._lastOptimization && (now - this._lastOptimization) < 60000) { // Only optimize once per minute max
        logger.info('Skipping cache optimization - already optimized recently', {
          timeSinceLastOptimization: `${Math.round((now - this._lastOptimization) / 1000)}s`,
          metadata: { service: 'cache-manager', timestamp: new Date().toISOString() }
        });
        return;
      }
      this._lastOptimization = now;

      logger.info('Starting cache memory optimization', {
        currentUsage: Math.round(currentUsage * 100) + '%',
        threshold: Math.round(threshold * 100) + '%',
        metadata: { service: 'cache-manager', timestamp: new Date().toISOString() }
      });

      // Get all cache keys
      const allKeys = this.cache.keys();
      if (allKeys.length === 0) {
        logger.info('No cache keys to optimize', {
          metadata: { service: 'cache-manager', timestamp: new Date().toISOString() }
        });
        return;
      }

      // More aggressive cleanup when memory usage is very high
      let removalPercentage = 0.2; // Start with 20% removal

      if (currentUsage > 0.90) {
        // Very high memory usage - remove 50% of cache
        removalPercentage = 0.5;
        logger.warn('Critical memory pressure - removing 50% of cache', {
          currentUsage: Math.round(currentUsage * 100) + '%',
          metadata: { service: 'cache-manager', timestamp: new Date().toISOString() }
        });
      } else if (currentUsage > 0.85) {
        // High memory usage - remove 30% of cache
        removalPercentage = 0.3;
        logger.warn('High memory pressure - removing 30% of cache', {
          currentUsage: Math.round(currentUsage * 100) + '%',
          metadata: { service: 'cache-manager', timestamp: new Date().toISOString() }
        });
      }

      // Calculate items to remove based on percentage
      const itemsToRemove = Math.ceil(allKeys.length * removalPercentage);

      if (itemsToRemove <= 0) {
        logger.info('No cache items need to be removed during optimization', {
          metadata: { service: 'cache-manager', timestamp: new Date().toISOString() }
        });
        return;
      }

      logger.info(`Removing ${itemsToRemove} cache items (${Math.round(removalPercentage * 100)}% of cache)`, {
        totalItems: allKeys.length,
        metadata: { service: 'cache-manager', timestamp: new Date().toISOString() }
      });

      // Optimization: Batch process keys in chunks to reduce overhead
      const BATCH_SIZE = 100;
      const keysToRemove = [];

      // Process in batches to avoid blocking the event loop
      for (let i = 0; i < allKeys.length && keysToRemove.length < itemsToRemove; i += BATCH_SIZE) {
        const batch = allKeys.slice(i, i + BATCH_SIZE);

        // Get TTL for each key in batch
        const batchStats = batch.map(key => {
          const ttl = this.cache.getTtl(key);
          return { key, ttl: ttl || 0 };
        });

        // Sort by TTL (remove items closest to expiration first)
        batchStats.sort((a, b) => a.ttl - b.ttl);

        // Add keys to remove list
        const batchToRemove = batchStats.slice(0, itemsToRemove - keysToRemove.length);
        keysToRemove.push(...batchToRemove.map(item => item.key));
      }

      // Remove keys in batches to avoid blocking
      let removedCount = 0;
      for (let i = 0; i < keysToRemove.length; i += BATCH_SIZE) {
        const batch = keysToRemove.slice(i, i + BATCH_SIZE);
        await Promise.all(batch.map(key => this.delete(key).catch(() => {})));
        removedCount += batch.length;

        // Yield to event loop occasionally
        if (i % (BATCH_SIZE * 5) === 0) {
          await new Promise(resolve => setTimeout(resolve, 0));
        }
      }

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }

      // Check memory usage after optimization
      const memoryAfter = process.memoryUsage();
      const usageAfter = memoryAfter.heapUsed / memoryAfter.heapTotal;

      logger.info(`Memory optimization complete, removed ${removedCount} cache items`, {
        beforeUsage: Math.round(currentUsage * 100) + '%',
        afterUsage: Math.round(usageAfter * 100) + '%',
        improvement: Math.round((currentUsage - usageAfter) * 100) + '%',
        remainingItems: this.cache.keys().length,
        metadata: { service: 'cache-manager', timestamp: new Date().toISOString() }
      });

    } catch (error) {
      logger.error('Error during cache memory optimization:', {
        error: error.message,
        stack: error.stack,
        metadata: { service: 'cache-manager', timestamp: new Date().toISOString() }
      });
    }
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
   * Shutdown cache system with timeout protection
   */
  async shutdown() {
    try {
      logger.info('Starting CacheManager shutdown', {
        metadata: { service: 'cache-manager', timestamp: new Date().toISOString() }
      });

      // Skip memory check during shutdown to avoid recursive cleanup

      // Clear the memory check interval
      if (this.memoryCheckInterval) {
        clearInterval(this.memoryCheckInterval);
        this.memoryCheckInterval = null;
        logger.info('Memory check interval cleared', {
          metadata: { service: 'cache-manager', timestamp: new Date().toISOString() }
        });
      }

      // Close Redis connection if it exists with timeout protection
      if (this.redis) {
        logger.info('Closing Redis connection', {
          status: this.redis.status || 'unknown',
          metadata: { service: 'cache-manager', timestamp: new Date().toISOString() }
        });

        try {
          // Use Promise.race to add timeout to Redis quit
          await Promise.race([
            this.redis.quit().catch(e => {
              logger.warn(`Redis quit error: ${e.message}, forcing disconnect`, {
                metadata: { service: 'cache-manager', timestamp: new Date().toISOString() }
              });
              // If quit fails, force disconnect
              this.redis.disconnect();
            }),
            // 2 second timeout for quit operation
            new Promise(resolve => setTimeout(() => {
              logger.warn('Redis quit operation timed out after 2 seconds, forcing disconnect', {
                metadata: { service: 'cache-manager', timestamp: new Date().toISOString() }
              });
              if (this.redis) {
                this.redis.disconnect();
              }
              resolve();
            }, 2000))
          ]);
        } catch (redisError) {
          logger.warn(`Redis shutdown error: ${redisError.message}, forcing disconnect`, {
            metadata: { service: 'cache-manager', timestamp: new Date().toISOString() }
          });
          // Force disconnect as a fallback
          if (this.redis) {
            this.redis.disconnect();
          }
        } finally {
          // Remove all listeners to prevent memory leaks
          if (this.redis) {
            this.redis.removeAllListeners();
            this.redis = null;
          }
          logger.info('Redis connection closed', {
            metadata: { service: 'cache-manager', timestamp: new Date().toISOString() }
          });
        }
      }

      // Flush the cache (don't wait for this to complete)
      try {
        this.cache.flushAll();
        logger.info('Cache flushed during shutdown', {
          metadata: { service: 'cache-manager', timestamp: new Date().toISOString() }
        });
      } catch (flushError) {
        logger.warn(`Error flushing cache: ${flushError.message}`, {
          metadata: { service: 'cache-manager', timestamp: new Date().toISOString() }
        });
      }

      logger.info('CacheManager shutdown completed', {
        metadata: { service: 'cache-manager', timestamp: new Date().toISOString() }
      });
    } catch (error) {
      logger.error('Cache shutdown error:', {
        error: error.message,
        stack: error.stack,
        metadata: { service: 'cache-manager', timestamp: new Date().toISOString() }
      });
      // Don't throw the error, just log it to prevent blocking shutdown
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