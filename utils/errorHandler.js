// utils/errorHandler.js

// Load environment variables
require('dotenv').config();

// Import winston for logging (ensure winston is installed: npm install winston)
const winston = require('winston');

// Import MetricsManager for error tracking (optional, if used in api.js)
const MetricsManager = require('../utils/metricsManager');

// Configure winston logger to match api.js and other files
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
 * Enterprise-grade error handling middleware for Express
 * Handles errors with logging, metrics, and graceful error propagation
 * @param {Error} err - The error object
 * @param {Request} req - Express request object
 * @param {Response} res - Express response object
 * @param {Function} next - Express next middleware function
 * @returns {void}
 */
async function errorHandler(err, req, res, next) {
  try {
    // Log error with winston for consistent logging across the application
    logger.error('Error encountered:', {
      error: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
      metadata: {
        service: 'predictive-model',
        timestamp: new Date().toISOString(),
        path: req.path,
        method: req.method,
        query: req.query,
        body: req.body,
        headers: req.headers
      }
    });

    // Record error metrics if MetricsManager is available
    try {
      if (MetricsManager && MetricsManager.getInstance) {
        const metrics = MetricsManager.getInstance();
        metrics.recordEvent({
          type: 'error',
          name: 'server_error',
          value: 1,
          tags: {
            path: req.path,
            method: req.method,
            status: 500
          }
        });
      }
    } catch (metricsError) {
      logger.warn('Failed to record error metrics:', metricsError);
    }

    // Send response with detailed error in development, generic in production
    res.status(500).json({
      error: 'Internal Server Error',
      message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong',
      timestamp: new Date().toISOString(),
      metadata: {
        path: req.path,
        method: req.method
      }
    });

  } catch (handlerError) {
    // Handle any errors during error handling (e.g., logging failure)
    logger.error('Error in error handler:', {
      error: handlerError.message,
      stack: process.env.NODE_ENV === 'development' ? handlerError.stack : undefined,
      metadata: {
        service: 'predictive-model',
        timestamp: new Date().toISOString(),
        originalError: err.message
      }
    });

    // Fallback response if error handling fails
    res.status(500).json({
      error: 'Critical Internal Server Error',
      message: 'An unexpected error occurred during error handling'
    });
  } finally {
    // Ensure next middleware is called for proper Express flow
    if (next) {
      next(err);
    }
  }
}

// Export the error handler for use in Express
module.exports = errorHandler;