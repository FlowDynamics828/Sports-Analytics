// utils/cacheManager.js - Memory/Redis cache fallback implementation

const NodeCache = require('node-cache');

class CacheManager {
  constructor(options = {}) {
    this.initialized = false;
    this.useRedis = !process.env.USE_IN_MEMORY_CACHE || process.env.USE_IN_MEMORY_CACHE !== 'true';
    this.options = {
      stdTTL: options.stdTTL || 600, // Default 10 minutes
      checkperiod: options.checkperiod || 120,
      maxKeys: options.maxKeys || 1000,
      ...options
    };
    
    // Initialize in-memory cache as fallback
    this.memoryCache = new NodeCache(this.options);
    
    // Log configuration
    console.log(`CacheManager initialized with ${this.useRedis ? 'Redis + memory fallback' : 'memory-only'} mode`);
  }

  async initialize(redisClient = null) {
    try {
      if (this.useRedis && redisClient) {
        this.redis = redisClient;
        // Test Redis connection
        try {
          await this.redis.ping();
          console.log('Redis connection successful for cache');
        } catch (error) {
          console.warn(`Redis connection failed: ${error.message}. Falling back to in-memory cache`);
          this.useRedis = false;
        }
      } else {
        this.useRedis = false;
        console.log('Using in-memory cache only (Redis disabled)');
      }
      
      this.initialized = true;
      return true;
    } catch (error) {
      console.error(`Cache initialization error: ${error.message}`);
      this.useRedis = false;
      this.initialized = true;
      return false;
    }
  }

  async set(key, value, ttl = this.options.stdTTL) {
    try {
      // Always set in memory cache as fallback
      this.memoryCache.set(key, value, ttl);
      
      // If Redis is enabled, also set in Redis
      if (this.useRedis && this.redis) {
        try {
          await this.redis.set(key, JSON.stringify(value), 'EX', ttl);
        } catch (error) {
          console.warn(`Redis set error for key ${key}: ${error.message}`);
        }
      }
      
      return true;
    } catch (error) {
      console.error(`Cache set error for key ${key}: ${error.message}`);
      return false;
    }
  }

  async get(key) {
    try {
      // Try Redis first if enabled
      if (this.useRedis && this.redis) {
        try {
          const value = await this.redis.get(key);
          if (value) {
            return JSON.parse(value);
          }
        } catch (error) {
          console.warn(`Redis get error for key ${key}: ${error.message}`);
          // Fall back to memory cache if Redis fails
        }
      }
      
      // Try memory cache as fallback
      return this.memoryCache.get(key);
    } catch (error) {
      console.error(`Cache get error for key ${key}: ${error.message}`);
      return null;
    }
  }

  async has(key) {
    try {
      // Check memory cache first (faster)
      if (this.memoryCache.has(key)) {
        return true;
      }
      
      // Then check Redis if enabled
      if (this.useRedis && this.redis) {
        try {
          return await this.redis.exists(key) === 1;
        } catch (error) {
          console.warn(`Redis exists error for key ${key}: ${error.message}`);
        }
      }
      
      return false;
    } catch (error) {
      console.error(`Cache has error for key ${key}: ${error.message}`);
      return false;
    }
  }

  async delete(key) {
    try {
      // Delete from memory cache
      this.memoryCache.del(key);
      
      // Delete from Redis if enabled
      if (this.useRedis && this.redis) {
        try {
          await this.redis.del(key);
        } catch (error) {
          console.warn(`Redis delete error for key ${key}: ${error.message}`);
        }
      }
      
      return true;
    } catch (error) {
      console.error(`Cache delete error for key ${key}: ${error.message}`);
      return false;
    }
  }

  async clear() {
    try {
      // Clear memory cache
      this.memoryCache.flushAll();
      
      // Clear Redis if enabled
      if (this.useRedis && this.redis) {
        try {
          await this.redis.flushDb();
        } catch (error) {
          console.warn(`Redis flush error: ${error.message}`);
        }
      }
      
      return true;
    } catch (error) {
      console.error(`Cache clear error: ${error.message}`);
      return false;
    }
  }
}

module.exports = { CacheManager };
