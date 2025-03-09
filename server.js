// server.js - Server startup with memory optimization

require('dotenv').config();
const http = require('http');
const winston = require('winston');
const app = require('./app');
const { format } = winston;

// Configure logging
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: format.combine(
    format.timestamp(),
    format.errors({ stack: true }),
    format.splat(),
    format.json()
  ),
  defaultMeta: { service: 'server' },
  transports: [
    new winston.transports.Console({
      format: format.combine(
        format.colorize(),
        format.simple()
      )
    }),
    new winston.transports.File({ 
      filename: 'logs/server-error.log', 
      level: 'error' 
    }),
    new winston.transports.File({ 
      filename: 'logs/server.log' 
    })
  ]
});

// Create HTTP server
const server = http.createServer(app);

// Set port
const port = process.env.PORT || 5050;

// Start server
server.listen(port, () => {
  logger.info(`Server running on port ${port}`);
  
  // Log memory usage on startup
  const memoryUsage = process.memoryUsage();
  logger.info('Initial memory usage:', {
    rss: Math.round(memoryUsage.rss / (1024 * 1024)) + 'MB',
    heapTotal: Math.round(memoryUsage.heapTotal / (1024 * 1024)) + 'MB',
    heapUsed: Math.round(memoryUsage.heapUsed / (1024 * 1024)) + 'MB',
    external: Math.round(memoryUsage.external / (1024 * 1024)) + 'MB'
  });
  
  // Run garbage collection if available
  if (global.gc) {
    global.gc();
    logger.info('Initial garbage collection performed');
  }
});

// Handle server errors
server.on('error', (error) => {
  logger.error('Server error:', {
    error: error.message,
    stack: error.stack
  });
  
  if (error.code === 'EADDRINUSE') {
    logger.error(`Port ${port} is already in use. Please use a different port.`);
    process.exit(1);
  }
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
  
  // Force close after 10 seconds
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
  
  // Force close after 10 seconds
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
});

// Export server for testing
module.exports = server;