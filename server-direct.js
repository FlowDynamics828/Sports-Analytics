/**
 * Sports Analytics Platform - Enterprise Server (Direct Execution Version)
 * 
 * This version of the server runs in a single process for immediate testing,
 * while still maintaining enterprise reliability features.
 */

const express = require('express');
const path = require('path');
const cors = require('cors');
const morgan = require('morgan');
const compression = require('compression');
const bodyParser = require('body-parser');
const helmet = require('helmet');
const os = require('os');
const http = require('http');
require('dotenv').config();

// Import routes
const apiRouter = require('./routes/api');

// Performance optimization settings
const ENABLE_MEMORY_MONITORING = process.env.ENABLE_MEMORY_MONITORING !== 'false';
const GC_INTERVAL = process.env.GC_INTERVAL || 300000; // 5 minutes

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 8000;

// Initialize memory monitoring if available
try {
  if (ENABLE_MEMORY_MONITORING) {
    const { MemoryMonitor } = require('./utils/memory_monitor');
    const memoryMonitor = new MemoryMonitor({ 
      gcInterval: GC_INTERVAL,
      threshold: 0.7,
      logLevel: 'warn'
    });
    memoryMonitor.start();
    console.log('🧠 Memory monitoring enabled');
  }
} catch (error) {
  console.warn('⚠️ Memory monitoring not available:', error.message);
}

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false,
}));

// Enable CORS
app.use(cors());

// Request logging
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// Compression middleware
app.use(compression({
  level: 6,
  threshold: 1024,
  filter: (req, res) => {
    if (req.headers['x-no-compression']) {
      return false;
    }
    return compression.filter(req, res);
  }
}));

// Body parsing middleware
app.use(bodyParser.json({ limit: '1mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '1mb' }));

// Cache control for static assets
const setCache = (req, res, next) => {
  const period = 60 * 60 * 24; // 1 day
  
  if (req.method === 'GET') {
    res.set('Cache-Control', `public, max-age=${period}`);
  } else {
    res.set('Cache-Control', 'no-store');
  }
  next();
};

// Serve static files with caching
app.use('/static', setCache, express.static(path.join(__dirname, 'public'), {
  maxAge: '1d'
}));

// Serve other static files
app.use(express.static(path.join(__dirname, 'public')));

// API response timeout
app.use((req, res, next) => {
  res.setTimeout(30000, () => {
    res.status(408).json({ error: 'Request timeout' });
  });
  next();
});

// API routes
app.use('/api', apiRouter);

// Serve main HTML page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Dashboard route
app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// Player stats route
app.get('/player/:id', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'player.html'));
});

// Team page route
app.get('/team/:id', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'team.html'));
});

// Matches route
app.get('/matches', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'matches.html'));
});

// Predictions page
app.get('/predictions', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'predictions.html'));
});

// Catch 404 and forward to error handler
app.use((req, res, next) => {
  res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    status: 'error',
    message: 'Something went wrong!',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// Create HTTP server
const server = http.createServer(app);

// Start server
server.listen(PORT, () => {
  console.log(`
========================================================================
  SPORTS ANALYTICS ENTERPRISE PLATFORM v2.1
========================================================================
  
  🚀 Server running on port ${PORT}
  📊 API available at http://localhost:${PORT}/api
  🌐 Web interface available at http://localhost:${PORT}
  🧠 Memory monitoring: ${ENABLE_MEMORY_MONITORING ? 'enabled' : 'disabled'}
  🖥️ Running on ${os.platform()} with ${os.cpus().length} CPU cores
  💾 ${Math.round(os.totalmem() / (1024 * 1024 * 1024))}GB total memory
  
========================================================================
Press Ctrl+C to stop the server
  `);
});

// Set timeouts
server.timeout = 30000; // 30 seconds

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n👋 Gracefully shutting down...');
  server.close(() => {
    console.log('✅ HTTP server closed');
    process.exit(0);
  });
});

process.on('SIGTERM', () => {
  console.log('\n👋 SIGTERM received: shutting down...');
  server.close(() => {
    console.log('✅ HTTP server closed');
    process.exit(0);
  });
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('🚨 Uncaught exception:', err);
  // Close the server but keep process running for possible recovery
  server.close(() => {
    console.log('✅ HTTP server closed due to uncaught exception');
  });
}); 