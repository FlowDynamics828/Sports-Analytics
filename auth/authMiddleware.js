const jwt = require('jsonwebtoken');
const { MongoClient } = require('mongodb');
const { LogManager } = require('../utils/logger');
const { RateLimiterCluster } = require('../utils/rateLimiter');

// Initialize logging
const logger = new LogManager().logger;

// Database connection variables
let mongoClient;
let db;
let initialized = false;

// Rate limiter implementation
let rateLimiter = null;
const RATE_LIMIT_WINDOW_MS = parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 60000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) || 100;

/**
 * Initialize MongoDB connection with retry logic
 * @returns {Promise<boolean>} Connection success status
 */
async function initializeDatabaseConnection() {
  if (mongoClient && db) {
    logger.info('Auth database connection already established');
    return true;
  }

  const uri = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/sports-analytics';
  const dbName = process.env.DB_NAME || process.env.MONGODB_DB_NAME || 'sports-analytics';
  let retries = 5;
  
  while (retries) {
    try {
      mongoClient = new MongoClient(uri, { 
        useNewUrlParser: true, 
        useUnifiedTopology: true,
        connectTimeoutMS: 15000,
        socketTimeoutMS: 30000,
        serverSelectionTimeoutMS: 15000
      });
      
      await mongoClient.connect();
      db = mongoClient.db(dbName);
      
      // Test connection
      await db.command({ ping: 1 });
      
      logger.info('Auth database connected successfully');
      return true;
    } catch (error) {
      retries -= 1;
      logger.error(`Auth database connection failed, retrying... (${5-retries}/5)`, error);
      if (retries === 0) throw error;
      await new Promise(res => setTimeout(res, 5000));
    }
  }
  return false;
}

/**
 * Rate limit middleware to prevent abuse
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const rateLimitMiddleware = (req, res, next) => {
  const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
  const now = Date.now();

  if (!rateLimiter[ip]) {
    rateLimiter[ip] = [];
  }

  // Remove expired timestamps
  rateLimiter[ip] = rateLimiter[ip].filter(timestamp => now - timestamp < RATE_LIMIT_WINDOW_MS);

  if (rateLimiter[ip].length >= RATE_LIMIT_MAX_REQUESTS) {
    logger.warn(`Rate limit exceeded for IP: ${ip}`);
    return res.status(429).json({ 
      success: false, 
      error: 'Too Many Requests',
      retryAfter: Math.ceil(RATE_LIMIT_WINDOW_MS / 1000)
    });
  }

  rateLimiter[ip].push(now);
  next();
};

/**
 * Authentication middleware for protecting routes
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const authenticate = (req, res, next) => {
  // First apply rate limiting
  rateLimitMiddleware(req, res, () => {
    // Then check authentication
    const token = req.headers.authorization?.split(' ')[1] || req.headers.authorization;
    
    if (!token) {
      return res.status(401).json({ success: false, error: 'Authentication token required' });
    }
    
    try {
      // Verify the token
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'default_jwt_secret_replace_in_production');
      req.user = decoded;
      next();
    } catch (error) {
      logger.error('Authentication error:', error);
      return res.status(401).json({ success: false, error: 'Invalid or expired token' });
    }
  });
};

/**
 * Middleware to require authentication
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const requireAuth = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ success: false, error: 'Authentication required' });
  }
  next();
};

/**
 * Middleware to require admin role
 * @returns {Function} Express middleware
 */
const requireAdmin = () => {
  return (req, res, next) => {
    if (!req.user || !req.user.roles || !req.user.roles.includes('admin')) {
      return res.status(403).json({ success: false, error: 'Admin access required' });
    }
    next();
  };
};

/**
 * Initialize the auth system
 * @returns {Promise<boolean>} Initialization success status
 */
async function initializeAuthSystem() {
  try {
    if (initialized) {
      logger.info('Auth system already initialized');
      return true;
    }
    
    logger.info('Initializing auth system...');
    await initializeDatabaseConnection();
    
    // Initialize enterprise-grade rate limiter
    if (!rateLimiter) {
      rateLimiter = new RateLimiterCluster({
        windowMs: RATE_LIMIT_WINDOW_MS,
        maxRequests: RATE_LIMIT_MAX_REQUESTS,
        context: 'auth'
      });
      logger.info('Rate limiter initialized successfully with enterprise configuration', {
        windowMs: RATE_LIMIT_WINDOW_MS,
        maxRequests: RATE_LIMIT_MAX_REQUESTS
      });
    }
    
    // Verify JWT_SECRET is set
    if (!process.env.JWT_SECRET) {
      logger.warn('JWT_SECRET not set in environment variables! Using a temporary secret for development.');
      process.env.JWT_SECRET = 'temporary_jwt_secret_replace_in_production_' + Date.now();
    }
    
    initialized = true;
    logger.info('Auth system initialized successfully');
    return true;
  } catch (error) {
    logger.error('Auth system initialization failed:', error);
    initialized = false;
    throw new Error(`Failed to initialize auth system: ${error.message}`);
  }
}

// Clean up connections on process termination
process.on('SIGTERM', async () => {
  try {
    if (mongoClient) {
      await mongoClient.close();
      logger.info('Auth MongoDB connection closed');
    }
  } catch (error) {
    logger.error('Error closing Auth MongoDB connection:', error);
  }
});

// Export the auth middleware functions
module.exports = {
  authenticate,
  requireAuth,
  requireAdmin,
  initializeAuthSystem,
  isInitialized: () => initialized
};

