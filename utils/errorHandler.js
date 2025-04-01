// utils/errorHandler.js

// Load environment variables
require('dotenv').config();

// Import winston for logging (ensure winston is installed: npm install winston)
const winston = require('winston');

// Import MetricsManager for error tracking (optional, if used in api.js)
let MetricsManager;
try {
  MetricsManager = require('../utils/metricsManager');
} catch (error) {
  console.warn('MetricsManager module not available, error metrics will be limited');
}

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

// Error counter to track unique errors
const errorCounts = new Map();

// Error categories for better classification
const ERROR_CATEGORIES = {
  VALIDATION: ['ValidationError', 'CastError', 'SyntaxError', 'TypeError'],
  AUTHENTICATION: ['AuthError', 'TokenExpiredError', 'JsonWebTokenError', 'NotBeforeError'],
  AUTHORIZATION: ['PermissionDeniedError', 'ForbiddenError', 'AccessDeniedError'],
  DATABASE: ['MongoError', 'ConnectionError', 'TransactionError', 'TimeoutError'],
  EXTERNAL: ['FetchError', 'AxiosError', 'RequestError', 'APIError'],
  BUSINESS: ['BusinessRuleError', 'DomainError', 'LogicError'],
  SYSTEM: ['SystemError', 'ResourceError', 'ConfigurationError', 'EnvironmentError'],
  UNKNOWN: ['Error']
};

/**
 * Classify an error based on type and message
 * @param {Error} err - The error object
 * @returns {string} Error category
 */
function classifyError(err) {
  // Check for specific error statuses
  if (err.status === 400 || err.statusCode === 400) {
    return 'VALIDATION';
  } else if (err.status === 401 || err.statusCode === 401) {
    return 'AUTHENTICATION';
  } else if (err.status === 403 || err.statusCode === 403) {
    return 'AUTHORIZATION';
  } else if (err.status === 404 || err.statusCode === 404) {
    return 'BUSINESS';
  } else if (err.status >= 500 || (err.statusCode && err.statusCode >= 500)) {
    return 'SYSTEM';
  }

  // Check error message patterns
  const message = err.message.toLowerCase();
  if (message.includes('validation') || message.includes('invalid') || message.includes('schema')) {
    return 'VALIDATION';
  } else if (message.includes('auth') || message.includes('login') || message.includes('token') || message.includes('credential')) {
    return 'AUTHENTICATION';
  } else if (message.includes('permission') || message.includes('forbidden') || message.includes('unauthorized')) {
    return 'AUTHORIZATION';
  } else if (message.includes('database') || message.includes('mongo') || message.includes('db') || message.includes('query')) {
    return 'DATABASE';
  } else if (message.includes('api') || message.includes('http') || message.includes('request') || message.includes('fetch')) {
    return 'EXTERNAL';
  }

  // Check by error name
  for (const [category, errorTypes] of Object.entries(ERROR_CATEGORIES)) {
    if (errorTypes.some(type => err.name.includes(type))) {
      return category;
    }
  }

  return 'UNKNOWN';
}

/**
 * Track error occurrence frequency
 * @param {Error} err - The error object
 * @returns {Object} Error tracking information
 */
function trackError(err) {
  const errorKey = `${err.name}:${err.message}`;
  const count = errorCounts.get(errorKey) || 0;
  errorCounts.set(errorKey, count + 1);
  
  // Prevent memory leaks by limiting the size of the map
  if (errorCounts.size > 1000) {
    // Remove the oldest entries (first 100)
    let i = 0;
    for (const key of errorCounts.keys()) {
      errorCounts.delete(key);
      i++;
      if (i >= 100) break;
    }
  }
  
  return {
    count: count + 1,
    isRecurring: count > 0
  };
}

/**
 * Get appropriate HTTP status code based on error type
 * @param {Error} err - The error object
 * @returns {number} HTTP status code
 */
function getStatusCode(err) {
  // Use explicit status code if available
  if (err.status && typeof err.status === 'number') {
    return err.status;
  }
  if (err.statusCode && typeof err.statusCode === 'number') {
    return err.statusCode;
  }
  
  // Determine status based on error category
  const category = classifyError(err);
  switch (category) {
    case 'VALIDATION':
      return 400;
    case 'AUTHENTICATION':
      return 401;
    case 'AUTHORIZATION':
      return 403;
    case 'BUSINESS':
      // Business errors often relate to not found or conflict situations
      return err.message.toLowerCase().includes('not found') ? 404 : 409;
    case 'DATABASE':
    case 'SYSTEM':
      return 500;
    case 'EXTERNAL':
      return 502; // Bad Gateway for external service failures
    default:
      return 500;
  }
}

/**
 * Create a sanitized client-safe error object
 * @param {Error} err - The original error
 * @param {string} category - Error category
 * @param {boolean} isDevelopment - Whether in development mode
 * @returns {Object} Sanitized error object
 */
function createClientError(err, category, isDevelopment) {
  const isDev = isDevelopment || process.env.NODE_ENV === 'development';
  const statusCode = getStatusCode(err);
  
  // Base error object
  const clientError = {
    status: statusCode,
    error: getErrorNameForClient(statusCode, category),
    message: isDev ? err.message : getGenericMessage(statusCode, category),
    timestamp: new Date().toISOString(),
    errorId: err.id || generateErrorId()
  };
  
  // Add stack trace in development
  if (isDev) {
    clientError.stack = err.stack;
    clientError.category = category;
  }
  
  return clientError;
}

/**
 * Generate a human-readable error name based on status code
 * @param {number} statusCode - HTTP status code
 * @param {string} category - Error category
 * @returns {string} Error name
 */
function getErrorNameForClient(statusCode, category) {
  switch (statusCode) {
    case 400: return 'Bad Request';
    case 401: return 'Unauthorized';
    case 403: return 'Forbidden';
    case 404: return 'Not Found';
    case 409: return 'Conflict';
    case 422: return 'Validation Error';
    case 429: return 'Too Many Requests';
    case 500: return 'Internal Server Error';
    case 502: return 'Bad Gateway';
    case 503: return 'Service Unavailable';
    default: return `${category} Error`;
  }
}

/**
 * Generate a generic error message for production
 * @param {number} statusCode - HTTP status code
 * @param {string} category - Error category
 * @returns {string} Generic error message
 */
function getGenericMessage(statusCode, category) {
  switch (statusCode) {
    case 400: return 'The request could not be understood or was missing required parameters.';
    case 401: return 'Authentication is required to access this resource.';
    case 403: return 'You do not have permission to access this resource.';
    case 404: return 'The requested resource could not be found.';
    case 409: return 'The request could not be completed due to a conflict with the current state of the resource.';
    case 422: return 'Validation failed for the provided data.';
    case 429: return 'Too many requests have been sent in a given amount of time.';
    case 500: return 'An unexpected error occurred on the server.';
    case 502: return 'An error occurred while communicating with an external service.';
    case 503: return 'The service is temporarily unavailable.';
    default: return 'An error occurred while processing your request.';
  }
}

/**
 * Generate a unique error ID
 * @returns {string} Unique error ID
 */
function generateErrorId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

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
    // Ensure error has an ID for tracking
    err.id = err.id || generateErrorId();
    
    // Classify the error
    const category = classifyError(err);
    
    // Track error frequency
    const tracking = trackError(err);
    
    // Get appropriate status code
    const statusCode = getStatusCode(err);
    
    // Log error with winston for consistent logging across the application
    logger.error('Error encountered:', {
      errorId: err.id,
      category,
      recurring: tracking.isRecurring,
      occurrences: tracking.count,
      status: statusCode,
      error: err.message,
      name: err.name,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
      metadata: {
        service: 'predictive-model',
        timestamp: new Date().toISOString(),
        path: req.path,
        method: req.method,
        query: req.query,
        body: req.body,
        headers: sanitizeHeaders(req.headers)
      }
    });

    // Record error metrics if MetricsManager is available
    try {
      if (MetricsManager && typeof MetricsManager.getInstance === 'function') {
        const metrics = MetricsManager.getInstance();
        if (metrics && typeof metrics.recordEvent === 'function') {
          metrics.recordEvent({
            type: 'error',
            name: category.toLowerCase(),
            value: 1,
            tags: {
              path: req.path,
              method: req.method,
              status: statusCode,
              errorName: err.name,
              recurring: tracking.isRecurring
            }
          });
        }
      }
    } catch (metricsError) {
      logger.warn('Failed to record error metrics:', metricsError);
    }

    // Create sanitized error for client
    const clientError = createClientError(err, category, process.env.NODE_ENV === 'development');

    // Send response with detailed error in development, generic in production
    res.status(statusCode).json(clientError);

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
      message: 'An unexpected error occurred during error handling',
      timestamp: new Date().toISOString(),
      errorId: generateErrorId()
    });
  } finally {
    // Ensure next middleware is called for proper Express flow
    if (next) {
      next(err);
    }
  }
}

/**
 * Sanitize headers to remove sensitive information
 * @param {Object} headers - Request headers
 * @returns {Object} Sanitized headers
 */
function sanitizeHeaders(headers) {
  if (!headers) return {};
  
  const sanitized = { ...headers };
  
  // Remove sensitive headers
  const sensitiveHeaders = [
    'authorization', 
    'cookie', 
    'x-api-key', 
    'api-key',
    'x-auth-token',
    'session-id',
    'x-session-id'
  ];
  
  sensitiveHeaders.forEach(header => {
    if (sanitized[header]) {
      sanitized[header] = '[REDACTED]';
    }
  });
  
  return sanitized;
}

// Export the error handler for use in Express
module.exports = errorHandler;

// Expose helper methods for direct use in application code
module.exports.classifyError = classifyError;
module.exports.getStatusCode = getStatusCode;
module.exports.trackError = trackError;
module.exports.sanitizeHeaders = sanitizeHeaders;
module.exports.ERROR_CATEGORIES = ERROR_CATEGORIES;