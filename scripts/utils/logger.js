/**
 * logger.js
 * 
 * Enterprise-grade logging utility with log rotation, multiple transport options,
 * and configurable log levels.
 */
const winston = require('winston');
require('winston-daily-rotate-file');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

// Ensure logs directory exists
const logsDir = path.join(__dirname, '../../logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Define log format
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.printf(({ level, message, timestamp, ...metadata }) => {
    let metaStr = '';
    if (Object.keys(metadata).length > 0 && metadata.stack !== undefined) {
      metaStr = `\n${metadata.stack}`;
    } else if (Object.keys(metadata).length > 0) {
      metaStr = Object.keys(metadata).length ? `\n${JSON.stringify(metadata, null, 2)}` : '';
    }
    
    return `[${timestamp}] [${level.toUpperCase()}] ${message}${metaStr}`;
  })
);

// Create file transport with rotation
const fileRotateTransport = new winston.transports.DailyRotateFile({
  filename: path.join(logsDir, 'sports-analytics-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  maxSize: '20m',
  maxFiles: '14d',
  level: process.env.FILE_LOG_LEVEL || 'info'
});

// Create console transport
const consoleTransport = new winston.transports.Console({
  format: winston.format.combine(
    winston.format.colorize(),
    logFormat
  ),
  level: process.env.CONSOLE_LOG_LEVEL || 'info'
});

// Create logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  defaultMeta: { service: 'sports-analytics' },
  transports: [
    fileRotateTransport,
    consoleTransport
  ],
  // Handle uncaught exceptions
  exceptionHandlers: [
    new winston.transports.DailyRotateFile({
      filename: path.join(logsDir, 'exceptions-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '14d'
    }),
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        logFormat
      )
    })
  ],
  exitOnError: false // Don't exit on handled exceptions
});

// Add log method that includes context information
logger.logWithContext = function(level, message, context = {}) {
  this.log({
    level,
    message,
    ...context
  });
};

// Enhance logger with request logging for Express
logger.middleware = function() {
  return function(req, res, next) {
    // Log at the start of the request
    const startTime = Date.now();
    const requestId = req.headers['x-request-id'] || `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    res.locals.requestId = requestId;
    
    // Add requestId to request object for use in other middlewares/routes
    req.requestId = requestId;
    
    // Log when the request completes
    res.on('finish', () => {
      const duration = Date.now() - startTime;
      const logLevel = res.statusCode >= 500 ? 'error' : 
                      res.statusCode >= 400 ? 'warn' : 'info';
      
      logger.log({
        level: logLevel,
        message: `${req.method} ${req.originalUrl} ${res.statusCode} ${duration}ms`,
        requestId,
        method: req.method,
        url: req.originalUrl,
        statusCode: res.statusCode,
        duration,
        ip: req.ip,
        userAgent: req.headers['user-agent']
      });
    });
    
    // Continue processing the request
    next();
  };
};

// Log startup information
logger.info(`Logger initialized with file level: ${fileRotateTransport.level}, console level: ${consoleTransport.level}`);

module.exports = logger; 