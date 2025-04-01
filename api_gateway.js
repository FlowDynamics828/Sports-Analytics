/**
 * api_gateway.js
 * 
 * Enterprise-grade API gateway with authentication, rate limiting, and tier-based
 * access control for the sports analytics prediction platform.
 */
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { createProxyMiddleware } = require('http-proxy-middleware');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const morgan = require('morgan');
const path = require('path');
const fs = require('fs');
const logger = require('./scripts/utils/logger');
const apiDocs = require('./api_documentation');

// Load environment variables
require('dotenv').config();

// Initialize the app
const app = express();

// Configure secure HTTP headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "cdn.jsdelivr.net"],
      styleSrc: ["'self'", "'unsafe-inline'", "cdn.jsdelivr.net"],
      imgSrc: ["'self'", "data:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'", "cdn.jsdelivr.net"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: []
    }
  },
  xssFilter: true,
  noSniff: true,
  referrerPolicy: { policy: 'same-origin' },
  hsts: {
    maxAge: 15552000, // 180 days
    includeSubDomains: true,
    preload: true
  }
}));

// Use Morgan for HTTP request logging, combined with our custom logger
// Create a write stream for access logs
const accessLogDir = path.join(__dirname, 'logs/access');
if (!fs.existsSync(accessLogDir)) {
  fs.mkdirSync(accessLogDir, { recursive: true });
}

const accessLogStream = fs.createWriteStream(
  path.join(accessLogDir, `access-${new Date().toISOString().split('T')[0]}.log`),
  { flags: 'a' }
);

// Setup request logging
app.use(morgan('combined', { stream: accessLogStream }));
app.use(logger.middleware());

// Parse JSON and URL-encoded bodies
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));

// Setup CORS
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : '*',
  methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
  exposedHeaders: ['X-Rate-Limit-Limit', 'X-Rate-Limit-Remaining', 'X-Rate-Limit-Reset'],
  preflightContinue: false,
  optionsSuccessStatus: 204,
  credentials: true
}));

// Define subscription tiers and their limits
const SUBSCRIPTION_TIERS = {
  BASIC: {
    maxFactors: 1,
    rateLimit: { windowMs: 60 * 1000, max: 10 } // 10 requests per minute
  },
  PREMIUM: {
    maxFactors: 3,
    rateLimit: { windowMs: 60 * 1000, max: 30 } // 30 requests per minute
  },
  ULTRA_PREMIUM: {
    maxFactors: 5,
    rateLimit: { windowMs: 60 * 1000, max: 60 } // 60 requests per minute
  }
};

// Database connection
const connectToDatabase = async () => {
  try {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(
        process.env.MONGO_URI || "mongodb+srv://SportAnalytics:Studyhard%402034@cluster0.et16d.mongodb.net/?retryWrites=true&w=majority", 
        {
          dbName: process.env.MONGO_DB_NAME || "SportsAnalytics",
          useNewUrlParser: true,
          useUnifiedTopology: true
        }
      );
      logger.info('Connected to MongoDB database');
    }
  } catch (error) {
    logger.error(`Database connection error: ${error.message}`);
    throw new Error(`Failed to connect to database: ${error.message}`);
  }
};

// Connect to database on startup
connectToDatabase().catch(err => {
  logger.error(`Initial database connection failed: ${err.message}`);
});

// Handle database reconnection
mongoose.connection.on('disconnected', () => {
  logger.warn('MongoDB disconnected, attempting to reconnect...');
  setTimeout(connectToDatabase, 5000);
});

// Request tracking for analytics and rate-limiting effectiveness monitoring
const requestTracker = {
  dailyRequests: {
    total: 0,
    byTier: {
      BASIC: 0,
      PREMIUM: 0,
      ULTRA_PREMIUM: 0
    },
    byEndpoint: {}
  },
  
  // Reset daily counters at midnight
  resetDaily() {
    this.dailyRequests = {
      total: 0,
      byTier: {
        BASIC: 0,
        PREMIUM: 0,
        ULTRA_PREMIUM: 0
      },
      byEndpoint: {}
    };
  },
  
  // Track a request
  trackRequest(tier, endpoint) {
    this.dailyRequests.total++;
    
    if (tier && this.dailyRequests.byTier[tier] !== undefined) {
      this.dailyRequests.byTier[tier]++;
    }
    
    if (endpoint) {
      if (!this.dailyRequests.byEndpoint[endpoint]) {
        this.dailyRequests.byEndpoint[endpoint] = 0;
      }
      this.dailyRequests.byEndpoint[endpoint]++;
    }
  },
  
  // Get current stats
  getStats() {
    return {
      timestamp: new Date().toISOString(),
      dailyRequests: this.dailyRequests
    };
  }
};

// Set up daily reset
const resetDailyStats = () => {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);
  
  const timeUntilReset = tomorrow - now;
  
  setTimeout(() => {
    requestTracker.resetDaily();
    logger.info('Daily request stats reset');
    
    // Schedule next reset
    setInterval(() => {
      requestTracker.resetDaily();
      logger.info('Daily request stats reset');
    }, 24 * 60 * 60 * 1000); // 24 hours
  }, timeUntilReset);
};

// Start the daily reset schedule
resetDailyStats();

// JWT Authentication middleware
const authenticateJWT = (req, res, next) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ status: 'error', message: 'Authentication required' });
  }
  
  const token = authHeader.split(' ')[1];
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'sports-analytics-jwt-secret');
    req.user = decoded;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ status: 'error', message: 'Token expired', code: 'token_expired' });
    }
    return res.status(403).json({ status: 'error', message: 'Invalid token', code: 'invalid_token' });
  }
};

// API Key middleware for simpler auth
const authenticateAPIKey = async (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  
  if (!apiKey) {
    return res.status(401).json({ status: 'error', message: 'API key required', code: 'api_key_missing' });
  }
  
  try {
    await connectToDatabase();
    
    // Check API key against database
    const apiKeyDoc = await mongoose.connection.collection('api_keys').findOne({ key: apiKey });
    
    if (!apiKeyDoc) {
      return res.status(403).json({ status: 'error', message: 'Invalid API key', code: 'api_key_invalid' });
    }
    
    // Check if API key is active
    if (!apiKeyDoc.active) {
      return res.status(403).json({ status: 'error', message: 'API key is inactive', code: 'api_key_inactive' });
    }
    
    // Check if API key is expired
    if (apiKeyDoc.expiresAt && new Date(apiKeyDoc.expiresAt) < new Date()) {
      return res.status(403).json({ status: 'error', message: 'API key has expired', code: 'api_key_expired' });
    }
    
    // Set user info based on API key
    req.user = {
      userId: apiKeyDoc.userId,
      tier: apiKeyDoc.tier || 'BASIC',
      rateLimit: SUBSCRIPTION_TIERS[apiKeyDoc.tier || 'BASIC'].rateLimit
    };
    
    // Track request
    requestTracker.trackRequest(req.user.tier, req.path);
    
    next();
  } catch (error) {
    logger.error(`API key authentication error: ${error.message}`);
    return res.status(500).json({ status: 'error', message: 'Error authenticating API key', code: 'auth_error' });
  }
};

// Generate rate limiter based on user tier
const createRateLimiter = (tierName) => {
  const tier = SUBSCRIPTION_TIERS[tierName] || SUBSCRIPTION_TIERS.BASIC;
  
  return rateLimit({
    windowMs: tier.rateLimit.windowMs,
    max: tier.rateLimit.max,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      res.status(429).json({
        status: 'error',
        message: 'Too many requests, please try again later',
        code: 'rate_limit_exceeded',
        retryAfter: Math.ceil(tier.rateLimit.windowMs / 1000)
      });
    },
    keyGenerator: (req) => {
      // Use API key or IP address as the rate limiting key
      return req.headers['x-api-key'] || req.ip;
    }
  });
};

// Global rate limiter for all requests (to prevent denial of service)
const globalRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 500, // 500 requests per minute maximum from a single IP
  standardHeaders: true,
  message: {
    status: 'error',
    message: 'Too many requests from this IP, please try again later',
    code: 'global_rate_limit_exceeded'
  }
});

// Apply global rate limiter to all requests
app.use(globalRateLimiter);

// Dynamic rate limiting middleware based on user tier
const dynamicRateLimit = (req, res, next) => {
  const userTier = req.user.tier || 'BASIC';
  const limiter = createRateLimiter(userTier);
  limiter(req, res, next);
};

// Subscription tier enforcement middleware
const enforceTierLimits = (req, res, next) => {
  const userTier = req.user.tier || 'BASIC';
  const tierLimits = SUBSCRIPTION_TIERS[userTier];
  
  // Check number of factors for multi-factor predictions
  if (req.path.includes('/multi') && req.body.factors) {
    if (req.body.factors.length > tierLimits.maxFactors) {
      return res.status(403).json({
        status: 'error',
        message: `Your ${userTier} subscription allows a maximum of ${tierLimits.maxFactors} factors. Please upgrade for more.`,
        code: 'tier_limit_exceeded',
        limit: tierLimits.maxFactors,
        current: req.body.factors.length
      });
    }
  }
  
  next();
};

// Request validation middleware
const validateRequest = (req, res, next) => {
  // Validate single prediction requests
  if (req.path.includes('/single')) {
    if (!req.body.factor) {
      return res.status(422).json({
        status: 'error',
        message: 'Missing required parameter: factor',
        code: 'missing_parameter'
      });
    }
    
    if (typeof req.body.factor !== 'string' || req.body.factor.trim().length === 0) {
      return res.status(422).json({
        status: 'error',
        message: 'Invalid factor format: must be a non-empty string',
        code: 'invalid_parameter'
      });
    }
  }
  
  // Validate multi-factor prediction requests
  if (req.path.includes('/multi')) {
    if (!req.body.factors || !Array.isArray(req.body.factors)) {
      return res.status(422).json({
        status: 'error',
        message: 'Missing or invalid parameter: factors must be an array',
        code: 'missing_parameter'
      });
    }
    
    if (req.body.factors.length === 0) {
      return res.status(422).json({
        status: 'error',
        message: 'Empty factors array: provide at least one factor',
        code: 'invalid_parameter'
      });
    }
    
    // Check each factor
    for (const factor of req.body.factors) {
      if (typeof factor !== 'string' || factor.trim().length === 0) {
        return res.status(422).json({
          status: 'error',
          message: 'Invalid factor format: all factors must be non-empty strings',
          code: 'invalid_parameter'
        });
      }
    }
  }
  
  next();
};

// Routes

// Status endpoint
app.get('/status', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'sports-analytics-api-gateway',
    version: process.env.VERSION || '1.0.0'
  });
});

// Usage statistics
app.get('/admin/stats', authenticateJWT, (req, res) => {
  // Only users with admin role can access stats
  if (!req.user.roles || !req.user.roles.includes('admin')) {
    return res.status(403).json({ status: 'error', message: 'Unauthorized access to admin endpoint' });
  }
  
  res.json(requestTracker.getStats());
});

// User authentication routes
// Create new API key
app.post('/api-keys', authenticateJWT, async (req, res) => {
  try {
    await connectToDatabase();
    
    // Check if user has permission to create API keys
    const usersCollection = mongoose.connection.collection('users');
    const user = await usersCollection.findOne({ _id: mongoose.Types.ObjectId(req.user.userId) });
    
    if (!user) {
      return res.status(404).json({ status: 'error', message: 'User not found' });
    }
    
    // Generate a new API key
    const apiKey = crypto.randomBytes(24).toString('hex');
    
    // Store in database
    const apiKeysCollection = mongoose.connection.collection('api_keys');
    
    const expiresAt = req.body.expiresAt ? new Date(req.body.expiresAt) : null;
    
    await apiKeysCollection.insertOne({
      key: apiKey,
      userId: req.user.userId,
      tier: req.body.tier || user.subscriptionTier || 'BASIC',
      name: req.body.name || 'API Key',
      createdAt: new Date(),
      expiresAt,
      active: true,
      lastUsed: null
    });
    
    logger.info(`API key created for user ${req.user.userId}`);
    
    res.status(201).json({
      status: 'success',
      apiKey,
      tier: req.body.tier || user.subscriptionTier || 'BASIC',
      expiresAt
    });
  } catch (error) {
    logger.error(`API key creation error: ${error.message}`);
    res.status(500).json({ status: 'error', message: 'Error creating API key' });
  }
});

// User login
app.post('/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(422).json({ status: 'error', message: 'Missing username or password' });
    }
    
    await connectToDatabase();
    
    // Get user from database
    const usersCollection = mongoose.connection.collection('users');
    const user = await usersCollection.findOne({ username });
    
    if (!user) {
      return res.status(401).json({ status: 'error', message: 'Invalid credentials' });
    }
    
    // Check password
    const passwordMatch = await bcrypt.compare(password, user.password);
    
    if (!passwordMatch) {
      return res.status(401).json({ status: 'error', message: 'Invalid credentials' });
    }
    
    // Generate JWT token
    const token = jwt.sign(
      { 
        userId: user._id.toString(), 
        username: user.username, 
        tier: user.subscriptionTier || 'BASIC',
        roles: user.roles || []
      }, 
      process.env.JWT_SECRET || 'sports-analytics-jwt-secret',
      { expiresIn: '7d' }
    );
    
    // Update last login
    await usersCollection.updateOne(
      { _id: user._id },
      { $set: { lastLogin: new Date() } }
    );
    
    logger.info(`User login: ${username}`);
    
    res.json({
      status: 'success',
      token,
      user: {
        id: user._id,
        username: user.username,
        tier: user.subscriptionTier || 'BASIC',
        name: user.name
      }
    });
  } catch (error) {
    logger.error(`Login error: ${error.message}`);
    res.status(500).json({ status: 'error', message: 'Authentication error' });
  }
});

// User registration
app.post('/auth/register', async (req, res) => {
  try {
    const { username, password, email, name } = req.body;
    
    if (!username || !password || !email) {
      return res.status(422).json({ status: 'error', message: 'Missing required fields' });
    }
    
    await connectToDatabase();
    
    // Check if username already exists
    const usersCollection = mongoose.connection.collection('users');
    const existingUser = await usersCollection.findOne({ 
      $or: [{ username }, { email }]
    });
    
    if (existingUser) {
      if (existingUser.username === username) {
        return res.status(409).json({ status: 'error', message: 'Username already taken' });
      } else {
        return res.status(409).json({ status: 'error', message: 'Email already registered' });
      }
    }
    
    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Create user
    const result = await usersCollection.insertOne({
      username,
      password: hashedPassword,
      email,
      name,
      subscriptionTier: 'BASIC', // Default tier
      createdAt: new Date(),
      lastLogin: null,
      active: true
    });
    
    // Generate initial API key
    const apiKey = crypto.randomBytes(24).toString('hex');
    
    // Store API key
    const apiKeysCollection = mongoose.connection.collection('api_keys');
    await apiKeysCollection.insertOne({
      key: apiKey,
      userId: result.insertedId.toString(),
      tier: 'BASIC',
      name: 'Default API Key',
      createdAt: new Date(),
      expiresAt: null,
      active: true,
      lastUsed: null
    });
    
    logger.info(`New user registered: ${username}`);
    
    res.status(201).json({
      status: 'success',
      message: 'User registered successfully',
      apiKey
    });
  } catch (error) {
    logger.error(`Registration error: ${error.message}`);
    res.status(500).json({ status: 'error', message: 'Registration error' });
  }
});

// API Documentation
app.use('/api', apiDocs);

// Apply middleware to prediction API routes
app.use('/api/predict', 
  authenticateAPIKey, 
  dynamicRateLimit,
  enforceTierLimits,
  validateRequest
);

// Set up proxy to the prediction service
const predictionApiUrl = process.env.PREDICTION_API_URL || 'http://localhost:3001';
app.use('/api/predict', createProxyMiddleware({
  target: predictionApiUrl,
  changeOrigin: true,
  pathRewrite: {
    '^/api/predict': '/predict' // Remove /api prefix when forwarding
  },
  logLevel: 'silent', // Don't duplicate our own logging
  onError: (err, req, res) => {
    logger.error(`Proxy error: ${err.message}`);
    res.status(502).json({
      status: 'error',
      message: 'Prediction service unavailable',
      code: 'service_unavailable'
    });
  },
  onProxyReq: (proxyReq, req, res) => {
    // Forward user tier to the prediction service
    if (req.user && req.user.tier) {
      proxyReq.setHeader('X-User-Tier', req.user.tier);
    }
    
    // Add unique request ID for tracking
    const requestId = req.requestId || `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    proxyReq.setHeader('X-Request-ID', requestId);
  }
}));

// Error handler
app.use((err, req, res, next) => {
  logger.error(`Unhandled error: ${err.message}`);
  logger.error(err.stack);
  
  res.status(500).json({
    status: 'error',
    message: 'Internal server error',
    code: 'internal_error'
  });
});

// Handle 404 errors
app.use((req, res) => {
  res.status(404).json({
    status: 'error',
    message: 'Endpoint not found',
    code: 'not_found'
  });
});

// Start function
const start = () => {
  const PORT = process.env.GATEWAY_PORT || 3000;
  app.listen(PORT, () => {
    logger.info(`API Gateway running on port ${PORT}`);
  });
};

// Export the app and start function
module.exports = { app, start };

// Start the server if called directly
if (require.main === module) {
  start();
} 