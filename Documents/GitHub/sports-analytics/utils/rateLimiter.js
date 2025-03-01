// utils/rateLimiter.js

// Load environment variables
require('dotenv').config();

// Import required modules
const Redis = require('ioredis');
const winston = require('winston');

// Configure Winston logger to match api.js
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

/**
 * Enterprise-Grade Rate Limiter for Cluster Environments
 * Uses Redis for distributed rate limiting, with logging and metrics
 * Version: 3.0.0
 */
class RateLimiter {
  constructor() {
    // Use .env settings for rate limiting
    this.windowMs = parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 15 * 60 * 1000; // 15 minutes default
    this.limit = parseInt(process.env.RATE_LIMIT_MAX, 10) || 50; // 50 requests default

    // Create a separate Redis client for rate limiter, avoiding circular dependency
    this.redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT, 10) || 6379,
      password: process.env.REDIS_PASSWORD || undefined,
      enableOfflineQueue: process.env.REDIS_ENABLE_OFFLINE_QUEUE === 'true',
      retryStrategy: (times) => {
        const maxDelay = parseInt(process.env.REDIS_RETRY_STRATEGY_MAX_DELAY, 10) || 2000;
        const delay = Math.min(times * 50, maxDelay);
        logger.info(`Redis connection retry attempt ${times} after ${delay}ms`, {
          metadata: { service: 'rate-limiter', timestamp: new Date().toISOString() }
        });
        return delay;
      },
      connectTimeout: parseInt(process.env.REDIS_CONNECT_TIMEOUT, 10) || 10000,
      showFriendlyErrorStack: true
    });

    // Local in-memory cache for performance (optional fallback)
    this.limits = new Map();

    // Cache statistics with Redis fallback tracking
    this.metrics = {
      rateLimitHits: 0,
      rateLimitExceeds: 0
    };

    // Add memory usage check
    this.checkMemoryUsage = () => {
      const memoryUsage = process.memoryUsage();
      if (memoryUsage.heapUsed / memoryUsage.heapTotal > 0.80) { // Match .env threshold
        logger.warn(`High memory usage detected in RateLimiter: ${Math.round((memoryUsage.heapUsed / memoryUsage.heapTotal) * 100)}% of heap used`, {
          metadata: { service: 'rate-limiter', timestamp: new Date().toISOString() }
        });
      }
    };
    setInterval(this.checkMemoryUsage, 300000); // Check every 5 minutes

    // Set up Redis connection handling
    this.redis.on('connect', () => {
      logger.info('Redis connection established for rate limiter', { 
        metadata: { service: 'rate-limiter', timestamp: new Date().toISOString() } 
      });
    });
    this.redis.on('error', (error) => {
      logger.warn('Redis connection error for rate limiter, using in-memory fallback:', { 
        error: error.message, 
        metadata: { service: 'rate-limiter', timestamp: new Date().toISOString() } 
      });
    });
  }

  /**
   * Check rate limit for a given key (e.g., IP or user ID)
   * @param {string} key - Identifier (e.g., client IP or user ID)
   * @param {number} [limit] - Maximum requests allowed (overrides default)
   * @returns {Promise<boolean>} True if within limit, false if exceeded
   */
  async checkLimit(key, limit = this.limit) {
    try {
      // Check memory before processing
      this.checkMemoryUsage();

      if (!key) {
        throw new Error('Rate limit key is required');
      }

      const redisKey = `ratelimit:${key}`;
      let currentCount;

      if (this.redis.status === 'ready') {
        currentCount = await this.redis.incr(redisKey);
        if (currentCount === 1) {
          await this.redis.expire(redisKey, Math.floor(this.windowMs / 1000));
        }
      } else {
        const now = Date.now();
        const userLimits = this.limits.get(key) || [];
        const validRequests = userLimits.filter(timestamp => now - timestamp < this.windowMs);

        if (validRequests.length >= limit) {
          this.metrics.rateLimitExceeds++;
          logger.warn('Rate limit exceeded for (in-memory fallback):', { 
            key, 
            limit, 
            timestamp: new Date().toISOString(), 
            metadata: { service: 'rate-limiter' } 
          });
          return false;
        }

        validRequests.push(now);
        this.limits.set(key, validRequests);
        currentCount = validRequests.length;
      }

      if (currentCount > limit) {
        this.metrics.rateLimitExceeds++;
        logger.warn('Rate limit exceeded for:', { 
          key, 
          limit, 
          timestamp: new Date().toISOString(), 
          metadata: { service: 'rate-limiter' } 
        });
        return false;
      }

      this.metrics.rateLimitHits++;
      logger.debug('Rate limit check passed:', { 
        key, 
        remaining: limit - currentCount, 
        timestamp: new Date().toISOString(), 
        metadata: { service: 'rate-limiter' } 
      });

      // Record metrics if MetricsManager exists
      try {
        if (MetricsManager && MetricsManager.getInstance) {
          const metrics = MetricsManager.getInstance();
          metrics.recordEvent({
            type: 'rate_limit',
            name: 'check',
            value: 1,
            tags: { key, limit, status: 'allowed' },
            metadata: { service: 'rate-limiter', timestamp: new Date().toISOString() }
          });
        }
      } catch (metricsError) {
        logger.warn('Failed to record rate limit metrics:', { 
          error: metricsError.message, 
          timestamp: new Date().toISOString(), 
          metadata: { service: 'rate-limiter' } 
        });
      }

      return true;
    } catch (error) {
      logger.error('Rate limit check failed:', { 
        error: error.message, 
        stack: error.stack, 
        key, 
        timestamp: new Date().toISOString(), 
        metadata: { service: 'rate-limiter' } 
      });
      return false; // Fallback to allow request if error occurs, preventing stalling
    }
  }

  /**
   * Reset rate limit for a given key
   * @param {string} key - Identifier (e.g., client IP or user ID)
   * @returns {Promise<void>}
   */
  async resetLimit(key) {
    try {
      if (!key) {
        throw new Error('Rate limit key is required');
      }

      const redisKey = `ratelimit:${key}`;
      if (this.redis.status === 'ready') {
        await this.redis.del(redisKey);
      } else {
        this.limits.delete(key);
      }
      logger.info('Rate limit reset for:', { 
        key, 
        timestamp: new Date().toISOString(), 
        metadata: { service: 'rate-limiter' } 
      });
    } catch (error) {
      logger.error('Rate limit reset failed:', { 
        error: error.message, 
        stack: error.stack, 
        key, 
        timestamp: new Date().toISOString(), 
        metadata: { service: 'rate-limiter' } 
      });
      throw error;
    }
  }

  /**
   * Get rate limit statistics
   * @returns {Object} Rate limit metrics
   */
  getStats() {
    return {
      ...this.metrics,
      windowMs: this.windowMs,
      limit: this.limit,
      timestamp: new Date().toISOString(),
      metadata: { service: 'rate-limiter' }
    };
  }

  /**
   * Shutdown rate limiter, cleaning up resources
   * @returns {Promise<void>}
   */
  async shutdown() {
    try {
      if (this.redis && this.redis.status === 'ready') {
        await this.redis.quit();
        logger.info('Rate limiter Redis connection closed', { 
          metadata: { service: 'rate-limiter', timestamp: new Date().toISOString() } 
        });
      }
      this.limits.clear();
    } catch (error) {
      logger.error('Rate limiter shutdown failed:', { 
        error: error.message, 
        stack: error.stack, 
        timestamp: new Date().toISOString(), 
        metadata: { service: 'rate-limiter' } 
      });
      throw error;
    }
  }
}

// Create and export singleton instance
const rateLimiter = new RateLimiter();
module.exports = rateLimiter;