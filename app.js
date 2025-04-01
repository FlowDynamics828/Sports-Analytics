/**
 * Sports Analytics Pro - Main Application Entry Point
 * Enterprise-grade sports analytics platform
 */

// Core dependencies
const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const logger = require('morgan');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const mongoose = require('mongoose');
const session = require('express-session');
const RedisStore = require('connect-redis').default;
const Redis = require('ioredis');
const mongoSanitize = require('express-mongo-sanitize');
const rateLimit = require('express-rate-limit');
const { v4: uuidv4 } = require('uuid');

// Import middlewares
const { authenticate } = require('./auth/authMiddleware');

// Import route modules
const usersRouter = require('./routes/users');
const apiRouter = require('./routes/api');

// Import monitoring and tracing modules if available
let tracer, metrics;
try {
  if (process.env.NODE_ENV === 'production') {
    // In production, these would be actual monitoring services
    tracer = { startSpan: () => ({ end: () => {} }) };
    metrics = { increment: () => {}, timing: () => {} };
  } else {
    // Mock implementations for development
    tracer = { startSpan: () => ({ end: () => {} }) };
    metrics = { increment: () => {}, timing: () => {} };
  }
} catch (err) {
  console.warn('Monitoring services not available:', err.message);
  // Fallback implementations
  tracer = { startSpan: () => ({ end: () => {} }) };
  metrics = { increment: () => {}, timing: () => {} };
}

// Create Express application
const app = express();

// Middleware setup
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "cdn.jsdelivr.net", "cdnjs.cloudflare.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "cdn.jsdelivr.net", "cdnjs.cloudflare.com"],
      imgSrc: ["'self'", "data:", "www.thesportsdb.com", "*.cloudfront.net"],
      connectSrc: ["'self'", "api.thesportsdb.com", "cors-anywhere.herokuapp.com"]
    }
  }
}));
app.use(compression());
app.use(cors());
app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

// Request tracing middleware
app.use((req, res, next) => {
  // Generate request ID for tracing
  req.requestId = require('crypto').randomBytes(16).toString('hex');
  
  // Start timing the request
  const start = Date.now();
  
  // Trace request completion
  res.on('finish', () => {
    const duration = Date.now() - start;
    metrics.timing('http.request.duration', duration, {
      path: req.path,
      method: req.method,
      status: res.statusCode
    });
    
    // Log request details
    console.log(`[${req.method}] ${req.path} - ${res.statusCode} (${duration}ms)`);
  });
  
  next();
});

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// API Routes
app.use('/api/users', usersRouter);
app.use('/api', apiRouter);

// Route for serving dashboard
app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// Root route redirects to dashboard
app.get('/', (req, res) => {
  res.redirect('/dashboard');
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: Date.now()
  });
});

// 404 handler
app.use((req, res, next) => {
  res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Application error:', err);
  
  // Set locals, only providing error in development
  const errorDetails = process.env.NODE_ENV === 'development' ? {
    message: err.message,
    stack: err.stack
  } : {
    message: 'An unexpected error occurred'
  };
  
  // Track error
  metrics.increment('app.error', {
    path: req.path,
    type: err.name || 'Error'
  });
  
  // Render error page
  res.status(err.status || 500);
  
  // Check if client expects JSON
  if (req.xhr || req.headers.accept.includes('application/json')) {
    res.json({
      status: 'error',
      error: errorDetails.message,
      requestId: req.requestId
    });
  } else {
    // Serve error page
    res.sendFile(path.join(__dirname, 'public', '500.html'));
  }
});

/**
 * Initialize app with required services
 */
const initializeApp = async () => {
  try {
    console.log('Initializing application...');
    
    // In a real application, this would initialize database connections,
    // caching layers, and other services
    
    console.log('Application initialized successfully');
    return true;
  } catch (error) {
    console.error('Failed to initialize application:', error);
    throw error;
  }
};

// Export app and initialization function
module.exports = { app, initializeApp };