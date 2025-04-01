// utils/cacheManager.js - Enterprise-grade Memory/Redis cache fallback implementation
const NodeCache = require('node-cache');
const winston = require('winston');
const os = require('os');
const { v4: uuidv4 } = require('uuid');
const redis = require('redis');
const { promisify } = require('util');
const { LogManager } = require('./logger');

// Configure logging
const logger = new LogManager().logger;

// Redis client and cache
let client;
let cache;

/**
 * Initialize Redis connection with proper error handling
 * @returns {Promise<boolean>} Whether Redis is successfully initialized
 */
async function initializeRedis() {
    try {
        if (process.env.USE_REDIS !== 'true' || process.env.USE_IN_MEMORY_CACHE === 'true') {
            logger.info('Redis is disabled by configuration, using in-memory cache');
            fallbackToMemoryCache();
            return false;
        }

        const RedisClient = redis.createClient({
            url: process.env.REDIS_URL || `redis://${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || 6379}`,
            password: process.env.REDIS_PASSWORD,
            socket: {
                connectTimeout: parseInt(process.env.REDIS_CONNECT_TIMEOUT, 10) || 10000
            },
            retry_strategy: function(times) {
                const delay = Math.min(times * 50, parseInt(process.env.REDIS_RETRY_STRATEGY_MAX_DELAY, 10) || 2000);
                logger.info(`Redis connection retry attempt ${times} after ${delay}ms`);
                return delay;
            }
        });

        // Set up event handlers
        RedisClient.on('error', (err) => {
            logger.error('Redis connection error:', err);
            fallbackToMemoryCache();
        });

        await RedisClient.connect();
        
        // Test connection
        const pingResult = await RedisClient.ping();
        if (pingResult !== 'PONG') {
            throw new Error('Redis ping failed');
        }
        
        cache = {
            get: async (key) => {
                const result = await RedisClient.get(key);
                return result ? JSON.parse(result) : null;
            },
            set: async (key, value, ttl) => {
                const options = ttl ? { EX: ttl } : {};
                return await RedisClient.set(key, JSON.stringify(value), options);
            },
            del: async (key) => {
                return await RedisClient.del(key);
            }
        };
        
        logger.info('Redis connected and ready');
        return true;
    } catch (error) {
        logger.error('Redis initialization failed, falling back to in-memory cache:', error);
        fallbackToMemoryCache();
        return false;
    }
}

function fallbackToMemoryCache() {
    logger.info('Using in-memory NodeCache as fallback for Redis');
    
    // Create more robust memory cache with NodeCache instead of simple Map
    const memoryCache = new NodeCache({
        stdTTL: parseInt(process.env.CACHE_DEFAULT_TTL, 10) || 3600, // 1 hour default TTL
        checkperiod: parseInt(process.env.CACHE_CHECK_PERIOD, 10) || 600, // 10 minutes cleanup interval
        useClones: false // For better performance
    });
    
    cache = {
        get: async (key) => {
            const value = memoryCache.get(key);
            return value === undefined ? null : value;
        },
        set: async (key, value, ttl = 0) => {
            return memoryCache.set(key, value, ttl);
        },
        del: async (key) => {
            return memoryCache.del(key);
        },
        keys: async (pattern = '*') => {
            // Simple implementation that returns all keys (no pattern matching)
            return memoryCache.keys();
        },
        flushAll: async () => {
            return memoryCache.flushAll();
        },
        getStats: () => {
            return memoryCache.getStats();
        }
    };
    
    logger.info(`In-memory cache initialized with ${memoryCache.options.stdTTL}s TTL`);
}

/**
 * Enterprise-grade cache manager with Redis integration and memory optimization
 * @class CacheManager
 */
class CacheManager {
  constructor(options = {}) {
    this.initialized = false;
    this.instanceId = uuidv4().substring(0, 8);
    this.startTime = Date.now();

    this.useRedis = process.env.USE_REDIS === 'true';
    this.redisConnectionAttempts = 0;
    this.maxRedisRetries = parseInt(process.env.REDIS_MAX_RETRIES, 10) || 3;

    this.options = {
      stdTTL: parseInt(process.env.CACHE_TTL, 10) || 600,
      checkperiod: parseInt(process.env.CACHE_CHECK_PERIOD, 10) || 120,
      maxKeys: parseInt(process.env.CACHE_MAX_ITEMS, 10) || 1000,
      deleteOnExpire: true,
      useClones: false,
      ...options
    };

    this.memoryCache = new NodeCache(this.options);

    this.stats = {
      hits: { memory: 0, redis: 0 },
      misses: { memory: 0, redis: 0 },
      operations: {
        get: { count: 0, errors: 0, latency: [] },
        set: { count: 0, errors: 0, latency: [] },
        delete: { count: 0, errors: 0 }
      },
      memoryCheckCount: 0,
      cleanupCount: 0,
      redisReconnections: 0,
      lastChecked: Date.now()
    };

    this.memoryThreshold = parseFloat(process.env.MEMORY_USAGE_THRESHOLD) || 0.75;
    this.lastMemoryCheckTime = Date.now();
    this.lastCleanupTime = Date.now();
    this.memoryCheckInterval = 60000;
    this.cleanupInterval = 300000;

    this.setupMemoryMonitoring();

    logger.info(`CacheManager initialized (${this.instanceId}) with ${this.useRedis ? 'Redis + memory fallback' : 'memory-only'} mode`, {
      options: this.options,
      useRedis: this.useRedis,
      instanceId: this.instanceId,
      memoryThreshold: this.memoryThreshold
    });
  }

  setupMemoryMonitoring() {
    setTimeout(() => this.checkMemoryUsage(), 10000);
    setInterval(() => {
      const now = Date.now();
      this.updateMonitoringIntervals();
      if (now - this.lastMemoryCheckTime >= this.memoryCheckInterval) {
        this.checkMemoryUsage();
        this.lastMemoryCheckTime = now;
      }
      if (now - this.lastCleanupTime >= this.cleanupInterval) {
        this.runCleanup();
        this.lastCleanupTime = now;
      }
    }, 15000);
  }

  updateMonitoringIntervals() {
    try {
      const memUsage = process.memoryUsage();
      const currentUsage = memUsage.heapUsed / memUsage.heapTotal;
      const cpus = os.cpus();
      const cpuUsage = cpus.reduce((acc, cpu) => {
        const total = Object.values(cpu.times).reduce((a, b) => a + b, 0);
        return acc + (1 - cpu.times.idle / total);
      }, 0) / cpus.length;

      if (currentUsage > this.memoryThreshold || cpuUsage > 0.7) {
        this.memoryCheckInterval = 30000;
        this.cleanupInterval = 120000;
      } else if (currentUsage > this.memoryThreshold * 0.8 || cpuUsage > 0.5) {
        this.memoryCheckInterval = 60000;
        this.cleanupInterval = 240000;
      } else {
        this.memoryCheckInterval = 120000;
        this.cleanupInterval = 600000;
      }
    } catch (error) {
      logger.error('Error updating monitoring intervals:', error);
      this.memoryCheckInterval = 60000;
      this.cleanupInterval = 300000;
    }
  }

  checkMemoryUsage() {
    try {
      const memUsage = process.memoryUsage();
      const currentUsage = memUsage.heapUsed / memUsage.heapTotal;
      this.stats.memoryCheckCount++;

      if (process.env.LOG_LEVEL === 'debug') {
        logger.debug(`Memory usage: ${(currentUsage * 100).toFixed(1)}% (${Math.round(memUsage.heapUsed / 1024 / 1024)}MB/${Math.round(memUsage.heapTotal / 1024 / 1024)}MB)`, {
          instanceId: this.instanceId
        });
      }

      if (currentUsage > this.memoryThreshold) {
        logger.warn(`High memory usage detected: ${(currentUsage * 100).toFixed(1)}%`, {
          heapUsed: `${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`,
          heapTotal: `${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`,
          instanceId: this.instanceId
        });
        this.runCleanup(currentUsage);
        if (global.gc && currentUsage > 0.85) {
          global.gc();
          logger.info('Forced garbage collection due to high memory pressure', { instanceId: this.instanceId });
        }
      }
    } catch (error) {
      logger.error('Memory check error:', error);
    }
  }

  runCleanup(currentUsage) {
    try {
      const keys = this.memoryCache.keys();
      if (!keys.length) return;

      this.stats.cleanupCount++;
      const keysCount = keys.length;
      let cleanupPercentage = currentUsage 
        ? (currentUsage > 0.9 ? 0.5 : currentUsage > 0.85 ? 0.3 : currentUsage > 0.8 ? 0.2 : 0.1)
        : 0.1;

      const removeCount = Math.ceil(keysCount * cleanupPercentage);
      if (!removeCount) return;

      logger.info(`Running cache cleanup: removing ${removeCount} of ${keysCount} keys (${Math.round(cleanupPercentage * 100)}%)`, {
        instanceId: this.instanceId
      });

      const keyDetails = keys.map(key => ({
        key,
        ttl: this.memoryCache.getTtl(key) || Date.now()
      })).sort((a, b) => a.ttl - b.ttl);

      const keysToRemove = keyDetails.slice(0, removeCount).map(item => item.key);
      this.memoryCache.del(keysToRemove);

      logger.info(`Cache cleanup complete: removed ${keysToRemove.length} keys, ${keys.length - keysToRemove.length} remain`, {
        instanceId: this.instanceId
      });

      this.lastCleanupTime = Date.now();
    } catch (error) {
      logger.error('Cleanup error:', error);
    }
  }

  async initialize(redisClient = null) {
    try {
      if (this.useRedis && redisClient) {
        this.redis = redisClient;
        await this.redis.ping();
        logger.info('Redis connection successful for cache', { instanceId: this.instanceId });

        this.redis.on('reconnecting', () => {
          this.stats.redisReconnections++;
          logger.warn('Redis reconnecting...', { reconnectCount: this.stats.redisReconnections, instanceId: this.instanceId });
        });

        this.redis.on('error', (error) => {
          logger.error(`Redis error: ${error.message}`, { instanceId: this.instanceId });
        });
      } else {
        this.useRedis = false;
        logger.info('Using in-memory cache only (Redis disabled)', { instanceId: this.instanceId });
      }
      this.initialized = true;
      return true;
    } catch (error) {
      logger.warn(`Redis connection failed: ${error.message}. Falling back to in-memory cache`, { instanceId: this.instanceId });
      this.useRedis = false;
      this.initialized = true;
      return false;
    }
  }

  async set(key, value, ttl = this.options.stdTTL) {
    const startTime = Date.now();
    try {
      if (!this.initialized) await this.initialize();
      this.memoryCache.set(key, value, ttl);
      if (this.useRedis && this.redis) await this.redis.set(key, JSON.stringify(value), 'EX', ttl);

      this.stats.operations.set.count++;
      this.stats.operations.set.latency.push(Date.now() - startTime);
      if (this.stats.operations.set.latency.length > 100) this.stats.operations.set.latency.shift();
      return true;
    } catch (error) {
      this.stats.operations.set.errors++;
      logger.error(`Cache set error for key ${key}: ${error.message}`, { instanceId: this.instanceId });
      return false;
    }
  }

  async get(key) {
    const startTime = Date.now();
    try {
      if (!this.initialized) await this.initialize();
      const memoryValue = this.memoryCache.get(key);
      if (memoryValue !== undefined) {
        this.stats.hits.memory++;
        this.updateLatency('get', startTime);
        return memoryValue;
      }

      if (this.useRedis && this.redis) {
        const redisValue = await this.redis.get(key);
        if (redisValue) {
          const parsedValue = JSON.parse(redisValue);
          this.memoryCache.set(key, parsedValue);
          this.stats.hits.redis++;
          this.updateLatency('get', startTime);
          return parsedValue;
        }
        this.stats.misses.redis++;
      }

      this.stats.misses.memory++;
      this.updateLatency('get', startTime);
      return null;
    } catch (error) {
      this.stats.operations.get.errors++;
      logger.error(`Cache get error for key ${key}: ${error.message}`, { instanceId: this.instanceId });
      return null;
    }
  }

  async has(key) {
    try {
      if (!this.initialized) await this.initialize();
      if (this.memoryCache.has(key)) return true;
      if (this.useRedis && this.redis) return (await this.redis.exists(key)) === 1;
      return false;
    } catch (error) {
      logger.error(`Cache has error for key ${key}: ${error.message}`, { instanceId: this.instanceId });
      return false;
    }
  }

  async delete(key) {
    try {
      if (!this.initialized) await this.initialize();
      this.memoryCache.del(key);
      if (this.useRedis && this.redis) await this.redis.del(key);
      this.stats.operations.delete.count++;
      return true;
    } catch (error) {
      this.stats.operations.delete.errors++;
      logger.error(`Cache delete error for key ${key}: ${error.message}`, { instanceId: this.instanceId });
      return false;
    }
  }

  async clear() {
    try {
      if (!this.initialized) await this.initialize();
      this.memoryCache.flushAll();
      if (this.useRedis && this.redis) await this.redis.flushdb();
      logger.info('Cache cleared successfully', { instanceId: this.instanceId });
      return true;
    } catch (error) {
      logger.error(`Cache clear error: ${error.message}`, { instanceId: this.instanceId });
      return false;
    }
  }

  async getKeys(pattern = '*') {
    try {
      if (!this.initialized) await this.initialize();
      const memoryKeys = this.memoryCache.keys();
      if (pattern === '*') return memoryKeys;

      const regex = new RegExp(`^${pattern
        .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '.*')
        .replace(/\?/g, '.')}$`);
      return memoryKeys.filter(key => regex.test(key));
    } catch (error) {
      logger.error(`Error getting keys with pattern ${pattern}: ${error.message}`, { instanceId: this.instanceId });
      return [];
    }
  }

  updateLatency(operation, startTime) {
    this.stats.operations[operation].count++;
    this.stats.operations[operation].latency.push(Date.now() - startTime);
    if (this.stats.operations[operation].latency.length > 100) this.stats.operations[operation].latency.shift();
  }

  getStats() {
    const uptime = Date.now() - this.startTime;
    const totalHits = this.stats.hits.memory + this.stats.hits.redis;
    const totalMisses = this.stats.misses.memory + this.stats.misses.redis;
    const hitRate = totalHits + totalMisses > 0 ? Math.round((totalHits / (totalHits + totalMisses)) * 100) : 0;
    const memoryUsage = process.memoryUsage();

    const calcAvgLatency = (op) => this.stats.operations[op].latency.length > 0
      ? Math.round(this.stats.operations[op].latency.reduce((a, b) => a + b, 0) / this.stats.operations[op].latency.length)
      : 0;

    return {
      instance: { id: this.instanceId, uptime: `${Math.floor(uptime / 1000 / 60)} min`, startTime: new Date(this.startTime).toISOString() },
      configuration: { useRedis: this.useRedis, ttl: this.options.stdTTL, maxKeys: this.options.maxKeys, memoryThreshold: this.memoryThreshold },
      performance: {
        hits: { memory: this.stats.hits.memory, redis: this.stats.hits.redis, total: totalHits },
        misses: { memory: this.stats.misses.memory, redis: this.stats.misses.redis, total: totalMisses },
        hitRate: `${hitRate}%`,
        operations: {
          get: { count: this.stats.operations.get.count, errors: this.stats.operations.get.errors, averageLatency: `${calcAvgLatency('get')}ms` },
          set: { count: this.stats.operations.set.count, errors: this.stats.operations.set.errors, averageLatency: `${calcAvgLatency('set')}ms` },
          delete: { count: this.stats.operations.delete.count, errors: this.stats.operations.delete.errors }
        }
      },
      maintenance: {
        memoryChecks: this.stats.memoryCheckCount,
        cleanups: this.stats.cleanupCount,
        redisReconnections: this.stats.redisReconnections,
        lastCleanup: new Date(this.lastCleanupTime).toISOString()
      },
      memory: {
        heapUsed: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`,
        heapTotal: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)}MB`,
        rss: `${Math.round(memoryUsage.rss / 1024 / 1024)}MB`,
        external: `${Math.round(memoryUsage.external / 1024 / 1024)}MB`,
        usagePercentage: `${Math.round((memoryUsage.heapUsed / memoryUsage.heapTotal) * 100)}%`
      },
      cache: { memoryKeys: this.memoryCache.keys().length, memoryStats: this.memoryCache.getStats() },
      timestamp: new Date().toISOString()
    };
  }

  async healthCheck() {
    try {
      if (!this.initialized) await this.initialize();
      const testKey = `_health_${Date.now()}`;
      const testValue = { test: 'value', timestamp: Date.now() };

      await this.set(testKey, testValue, 10);
      const retrievedValue = await this.get(testKey);

      let redisStatus = 'disabled';
      if (this.useRedis && this.redis) redisStatus = (await this.redis.ping()) ? 'connected' : 'error';

      const memoryUsage = process.memoryUsage();
      const memoryPercentage = memoryUsage.heapUsed / memoryUsage.heapTotal;
      let status = 'healthy';
      if (!retrievedValue) status = 'degraded';
      if (this.useRedis && redisStatus !== 'connected') status = status === 'healthy' ? 'warning' : 'degraded';
      if (memoryPercentage > this.memoryThreshold) status = status === 'healthy' ? 'warning' : status;

      return {
        status,
        memory: {
          used: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`,
          total: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)}MB`,
          percentage: `${Math.round(memoryPercentage * 100)}%`,
          status: memoryPercentage > this.memoryThreshold ? 'warning' : 'normal'
        },
        redis: { enabled: this.useRedis, status: redisStatus },
        operations: { set: retrievedValue ? 'working' : 'failed', get: retrievedValue ? 'working' : 'failed' },
        cache: { keys: this.memoryCache.keys().length, hitRate: `${this.getStats().performance.hitRate}` },
        uptime: `${Math.floor((Date.now() - this.startTime) / 1000 / 60)} min`,
        instance: this.instanceId,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      logger.error(`Health check error: ${error.message}`, { instanceId: this.instanceId });
      return { status: 'error', error: error.message, timestamp: new Date().toISOString() };
    }
  }
}

module.exports = {
  CacheManager,
  initializeRedis,
  fallbackToMemoryCache
};