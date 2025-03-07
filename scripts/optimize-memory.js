// scripts/optimize-memory.js - Memory optimization script

require('dotenv').config();
const winston = require('winston');
const os = require('os');

// Configure logging
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ level, message, timestamp }) => {
      return `${timestamp} ${level}: ${message}`;
    })
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    }),
    new winston.transports.File({ filename: 'logs/memory-optimization.log' })
  ]
});

// Memory optimization module
const memoryOptimizer = {
  // Track optimization history
  history: [],
  
  // Track intervals
  intervals: [],
  
  // Start memory monitoring
  start: function(interval = 300000) { // Default: check every 5 minutes
    logger.info('Starting memory optimization module');
    
    // Clear any existing intervals
    this.stop();
    
    // Start memory monitoring
    const monitorInterval = setInterval(() => {
      this.checkMemoryUsage();
    }, interval);
    
    this.intervals.push(monitorInterval);
    
    // Return the module for chaining
    return this;
  },
  
  // Stop memory monitoring
  stop: function() {
    logger.info('Stopping memory optimization module');
    
    // Clear all intervals
    this.intervals.forEach(interval => clearInterval(interval));
    this.intervals = [];
    
    // Return the module for chaining
    return this;
  },
  
  // Check memory usage and optimize if needed
  checkMemoryUsage: function() {
    const memoryUsage = process.memoryUsage();
    const heapUsed = memoryUsage.heapUsed;
    const heapTotal = memoryUsage.heapTotal;
    const memoryRatio = heapUsed / heapTotal;
    const threshold = parseFloat(process.env.MEMORY_USAGE_THRESHOLD) || 0.85;
    
    // Format memory values for logging (in MB)
    const heapUsedMB = Math.round(heapUsed / (1024 * 1024));
    const heapTotalMB = Math.round(heapTotal / (1024 * 1024));
    const usagePercentage = Math.round(memoryRatio * 100);
    
    logger.info(`Memory usage: ${usagePercentage}% (${heapUsedMB}MB / ${heapTotalMB}MB)`);
    
    // Check if memory usage exceeds threshold
    if (memoryRatio > threshold) {
      logger.warn(`High memory usage detected: ${usagePercentage}% of heap used (${heapUsedMB}MB / ${heapTotalMB}MB)`);
      this.optimizeMemory(memoryRatio);
    }
    
    // Record memory usage history
    this.history.push({
      timestamp: new Date(),
      heapUsed: heapUsedMB,
      heapTotal: heapTotalMB,
      percentage: usagePercentage
    });
    
    // Keep only the last 100 entries
    if (this.history.length > 100) {
      this.history.shift();
    }
  },
  
  // Optimize memory usage
  optimizeMemory: function(currentUsage) {
    logger.info('Starting memory optimization');
    
    // Record optimization start time
    const startTime = process.hrtime();
    
    // 1. Clear module caches for non-essential modules
    this.clearModuleCache();
    
    // 2. Clear any global caches
    this.clearGlobalCaches();
    
    // 3. Force garbage collection if available
    if (global.gc) {
      logger.info('Running garbage collection');
      global.gc();
    } else {
      logger.info('Garbage collection not available. Run with --expose-gc flag for better optimization.');
    }
    
    // 4. Check memory usage after optimization
    const memoryUsage = process.memoryUsage();
    const heapUsed = memoryUsage.heapUsed;
    const heapTotal = memoryUsage.heapTotal;
    const memoryRatio = heapUsed / heapTotal;
    
    // Format memory values for logging (in MB)
    const heapUsedMB = Math.round(heapUsed / (1024 * 1024));
    const heapTotalMB = Math.round(heapTotal / (1024 * 1024));
    const usagePercentage = Math.round(memoryRatio * 100);
    
    // Calculate optimization duration
    const [seconds, nanoseconds] = process.hrtime(startTime);
    const duration = seconds + nanoseconds / 1e9;
    
    logger.info(`Memory optimization completed in ${duration.toFixed(2)}s`);
    logger.info(`Memory usage after optimization: ${usagePercentage}% (${heapUsedMB}MB / ${heapTotalMB}MB)`);
    
    // Calculate memory saved
    const savedPercentage = Math.round((currentUsage - memoryRatio) * 100);
    if (savedPercentage > 0) {
      logger.info(`Memory optimization saved ${savedPercentage}% of heap usage`);
    } else {
      logger.warn('Memory optimization did not reduce memory usage');
    }
    
    return {
      before: Math.round(currentUsage * 100),
      after: usagePercentage,
      saved: savedPercentage,
      duration: duration.toFixed(2)
    };
  },
  
  // Clear module cache for non-essential modules
  clearModuleCache: function() {
    const essentialModules = [
      'fs', 'path', 'os', 'http', 'https', 'net', 'events',
      'stream', 'util', 'winston', 'dotenv'
    ];
    
    let cleared = 0;
    
    // Clear module cache for non-essential modules
    Object.keys(require.cache).forEach(moduleId => {
      const isEssential = essentialModules.some(name => 
        moduleId.includes(`/node_modules/${name}/`) || 
        moduleId.includes(`\\${name}\\`) ||
        moduleId.includes(`/${name}/`)
      );
      
      if (!isEssential && !moduleId.includes('node_modules')) {
        delete require.cache[moduleId];
        cleared++;
      }
    });
    
    logger.info(`Cleared ${cleared} module caches`);
  },
  
  // Clear global caches
  clearGlobalCaches: function() {
    let cleared = 0;
    
    // Clear global caches if they exist
    if (global.cache && typeof global.cache.clear === 'function') {
      global.cache.clear();
      cleared++;
    }
    
    if (global.memoryCache && typeof global.memoryCache.clear === 'function') {
      global.memoryCache.clear();
      cleared++;
    }
    
    if (global.apiCache && typeof global.apiCache.clear === 'function') {
      global.apiCache.clear();
      cleared++;
    }
    
    logger.info(`Cleared ${cleared} global caches`);
  },
  
  // Get memory usage history
  getHistory: function() {
    return this.history;
  },
  
  // Get system memory information
  getSystemMemory: function() {
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    
    return {
      total: Math.round(totalMemory / (1024 * 1024)),
      free: Math.round(freeMemory / (1024 * 1024)),
      used: Math.round((totalMemory - freeMemory) / (1024 * 1024)),
      percentage: Math.round(((totalMemory - freeMemory) / totalMemory) * 100)
    };
  },
  
  // Run a full optimization
  runFullOptimization: function() {
    logger.info('Running full memory optimization');
    
    // Get current memory usage
    const memoryUsage = process.memoryUsage();
    const currentUsage = memoryUsage.heapUsed / memoryUsage.heapTotal;
    
    // Run optimization
    const result = this.optimizeMemory(currentUsage);
    
    // Run garbage collection again after a short delay
    setTimeout(() => {
      if (global.gc) {
        global.gc();
        logger.info('Ran second garbage collection pass');
      }
    }, 1000);
    
    return result;
  }
};

// Export the memory optimizer
module.exports = memoryOptimizer;

// If run directly, start the optimizer
if (require.main === module) {
  logger.info('Running memory optimization');
  
  // Run full optimization
  const result = memoryOptimizer.runFullOptimization();
  
  // Log system memory information
  const systemMemory = memoryOptimizer.getSystemMemory();
  logger.info(`System memory: ${systemMemory.used}MB used of ${systemMemory.total}MB total (${systemMemory.percentage}%)`);
  
  // Exit after optimization
  setTimeout(() => {
    logger.info('Memory optimization completed');
    process.exit(0);
  }, 2000);
}