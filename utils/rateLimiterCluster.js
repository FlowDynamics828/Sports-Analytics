/**
 * Enterprise-Grade RateLimiterCluster for distributed environments
 * Extends the base RateLimiter with cluster-specific functionality
 */

const winston = require('winston');
const RateLimiter = require('./rateLimiter').RateLimiter;

// Configure Winston logger
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
 * Enterprise-Grade Compatible RateLimiterCluster Class 
 * Maintains API compatibility with legacy systems while leveraging the RateLimiter implementation
 */
class RateLimiterCluster extends RateLimiter {
  /**
   * Create a new RateLimiterCluster instance
   * @param {Object} options - Configuration options
   */
  constructor(options = {}) {
    // Call parent constructor with options
    super();
    
    // For logging and diagnostics in cluster environments
    this.clusterMode = process.env.CLUSTER_MODE === 'true' || false;
    this.nodeId = process.env.NODE_ID || process.pid.toString();
    
    logger.info('RateLimiterCluster initialized with backward compatibility layer', {
      nodeId: this.nodeId,
      clusterMode: this.clusterMode,
      metadata: { service: 'rate-limiter', timestamp: new Date().toISOString() }
    });
  }
  
  /**
   * Enhanced cluster-aware rate checking
   * Ensures compatibility with legacy API call patterns
   * @param {string} key - Identifier (e.g., client IP or user ID)
   * @param {number} limit - Maximum requests allowed (overrides default)
   * @param {Object} options - Additional options
   * @returns {Promise<boolean>} True if within limit, false if exceeded
   */
  async checkLimit(key, limit, options = {}) {
    // Add cluster-specific context to the options
    const enhancedOptions = {
      ...options,
      nodeId: this.nodeId,
      clusterMode: this.clusterMode
    };
    
    // Call the parent implementation with enhanced options
    return await super.checkLimit(key, limit, enhancedOptions);
  }
}

// Export the class
module.exports = RateLimiterCluster; 