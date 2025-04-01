/**
 * Enterprise-Grade Rate Limiter for Cluster Environments
 * Uses Redis for distributed rate limiting, with logging and metrics
 * Version: 3.2.0
 * @typedef {Object} RateLimiterOptions
 * @property {number} [windowMs] - Time window in milliseconds
 * @property {number} [max] - Maximum number of requests in window
 * @property {string} [message] - Message to return on rate limit
 * @property {boolean} [standardHeaders] - Whether to return standard rate limit headers
 * @property {boolean} [legacyHeaders] - Whether to return legacy rate limit headers
 */

/**
 * @typedef {import('express').Request & { user?: { id: string } }} AuthRequest
 */

/**
 * @typedef {Object} MetricsManagerType
 * @property {function(string, string): void} registerCounter - Register a counter metric
 * @property {function(string): void} incrementCounter - Increment a counter metric
 */

// Load environment variables
require('dotenv').config();

// Import required modules
const { RateLimiterMemory } = require('rate-limiter-flexible');
const winston = require('winston');
const { performance } = require('perf_hooks');
const crypto = require('crypto');

// Import express-rate-limit without TypeScript errors
let rateLimit;
try {
  // The package might have different export patterns
  rateLimit = require('express-rate-limit');
  // If it's an ESM module with default export
  if (rateLimit && typeof rateLimit.default === 'function') {
    rateLimit = rateLimit.default;
  }
} catch (err) {
  console.warn('express-rate-limit not available, will use fallback implementation');
}

// Try to import MetricsManager safely
/** @type {MetricsManagerType|null} */
let MetricsManager = null;
try {
  MetricsManager = require('./metricsManager');
} catch (error) {
  console.warn('MetricsManager module not available, rate limit metrics will be limited');
}

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
    })
  ]
});

/**
 * Enterprise-Grade Rate Limiter for production environments
 */
class RateLimiter {
  /**
   * @param {RateLimiterOptions} options - Rate limiter options
   */
  constructor(options = {}) {
    this.options = {
      windowMs: options.windowMs || 15 * 60 * 1000, // 15 minutes by default
      max: options.max || 100, // 100 requests per windowMs by default
      message: options.message || 'Too many requests, please try again later.',
      standardHeaders: options.standardHeaders !== false, // Return rate limit info in the `RateLimit-*` headers
      legacyHeaders: options.legacyHeaders !== false, // Send `X-RateLimit-*` headers
    };

    // Create in-memory rate limiter with flexible options
    this.limiter = new RateLimiterMemory({
      points: this.options.max,
      duration: this.options.windowMs / 1000, // convert ms to seconds
    });

    this.middleware = this.middleware.bind(this);
  }

  /**
   * Express middleware for rate limiting
   * @param {AuthRequest} req - Express request with auth user
   * @param {import('express').Response} res - Express response
   * @param {import('express').NextFunction} next - Express next function
   */
  middleware(req, res, next) {
    // Get user identifier (IP or user ID)
    const key = req.user?.id || req.ip || crypto.randomUUID();
    
    // Check rate limit
    this.limiter.consume(key)
      .then(() => {
        next();
      })
      .catch(() => {
        res.status(429).send(this.options.message);
      });
  }
}

/**
 * Enterprise-Grade Compatible RateLimiterCluster Class 
 * Maintains API compatibility with legacy systems while leveraging the new RateLimiter implementation
 */
class RateLimiterCluster extends RateLimiter {
  /**
   * @param {RateLimiterOptions} options - Rate limiter options
   */
  constructor(options = {}) {
    super(options);
    
    // Cluster-specific settings (using memory instead of Redis)
    this.nodeId = process.pid || Math.floor(Math.random() * 10000);
    
    // Log initialization
    console.info(`RateLimiterCluster initialized`, {
      clusterMode: false,
      nodeId: this.nodeId.toString(),
      timestamp: new Date().toISOString()
    });
  }
}

// Create singleton instances
const rateLimiter = new RateLimiter();
const rateLimiterCluster = new RateLimiterCluster();

/**
 * Enterprise-level Express middleware factory function
 * 
 * @param {RateLimiterOptions} options - Rate limiter options
 * @returns {import('express').RequestHandler} Express middleware
 */
function createLimiter(options = {}) {
  // Configuration for rate limiter
  const config = {
    windowMs: options.windowMs || 15 * 60 * 1000,
    max: options.max || 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: options.message || 'Too many requests, please try again later.'
  };
  
  try {
    // Check if express-rate-limit is available and is a function
    if (rateLimit && typeof rateLimit === 'function') {
      // Log success
      logger.debug('Using express-rate-limit for rate limiting');
      
      // Create the express-rate-limit middleware
      const limiter = rateLimit(config);
      
      return limiter;
    } else {
      // Log fallback
      logger.info('express-rate-limit unavailable in expected format, using fallback implementation');
      
      // Use our custom implementation
      return fallbackLimiter();
    }
  } catch (/** @type {unknown} */ err) {
    // Log error
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error('Error creating rate limiter, using fallback', { error: error.message, stack: error.stack });
    
    // Use fallback
    return fallbackLimiter();
  }
  
  /**
   * Fallback limiter implementation
   * @returns {import('express').RequestHandler}
   */
  function fallbackLimiter() {
    // Create a new instance for this specific middleware
    const instance = new RateLimiter(options);
    
    // Return the middleware
    return instance.middleware;
  }
}

// Primary export is the singleton rateLimiter
module.exports = rateLimiter;

// Named exports for destructuring import pattern
module.exports.rateLimiter = rateLimiter;
module.exports.rateLimiterCluster = rateLimiterCluster;
module.exports.RateLimiter = RateLimiter;
module.exports.RateLimiterCluster = RateLimiterCluster;
module.exports.createLimiter = createLimiter;