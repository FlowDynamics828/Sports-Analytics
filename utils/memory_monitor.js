/**
 * Memory Monitor
 * 
 * Enterprise-grade memory monitoring and optimization utility to manage memory
 * usage and prevent memory leaks and crashes.
 */

const v8 = require('v8');
const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * Memory Monitor class for tracking and optimizing memory usage
 */
class MemoryMonitor {
  constructor(options = {}) {
    this.options = {
      gcInterval: parseInt(process.env.GC_INTERVAL) || 300000, // 5 minutes by default
      threshold: parseFloat(process.env.MEMORY_THRESHOLD) || 0.7, // 70% by default
      criticalThreshold: parseFloat(process.env.MEMORY_CRITICAL_THRESHOLD) || 0.9, // 90% by default
      logLevel: process.env.MEMORY_LOG_LEVEL || 'info',
      logToConsole: process.env.MEMORY_LOG_CONSOLE !== 'false',
      logToFile: process.env.MEMORY_LOG_FILE !== 'false',
      logPath: process.env.MEMORY_LOG_PATH || path.join(process.cwd(), 'logs', 'memory.log'),
      ...options
    };
    
    // Internal state
    this.status = 'normal'; // normal, warning, critical
    this.interval = null;
    this.gcEnabled = typeof global.gc === 'function';
    this.heapDumped = false;
    
    // Ensure log directory exists
    if (this.options.logToFile) {
      const logDir = path.dirname(this.options.logPath);
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }
    }
    
    // Bind methods
    this.start = this.start.bind(this);
    this.stop = this.stop.bind(this);
    this.check = this.check.bind(this);
    this.optimize = this.optimize.bind(this);
    this.dumpHeap = this.dumpHeap.bind(this);
    this.getMemoryUsage = this.getMemoryUsage.bind(this);
    this.forceGC = this.forceGC.bind(this);
    this.log = this.log.bind(this);
  }
  
  /**
   * Start memory monitoring
   */
  start() {
    if (this.interval) {
      this.log('Memory monitor already running', 'warn');
      return;
    }
    
    // Check if garbage collection is enabled
    if (!this.gcEnabled) {
      this.log('Garbage collection is not exposed. Start node with --expose-gc flag for better memory management.', 'warn');
    }
    
    this.log('Starting memory monitor...');
    
    // Initial memory check
    this.check();
    
    // Set up interval for regular checks
    this.interval = setInterval(() => {
      this.check();
    }, this.options.gcInterval);
    
    this.log('Memory monitor started successfully');
  }
  
  /**
   * Stop memory monitoring
   */
  stop() {
    if (!this.interval) {
      this.log('Memory monitor is not running', 'warn');
      return;
    }
    
    clearInterval(this.interval);
    this.interval = null;
    this.log('Memory monitor stopped');
  }
  
  /**
   * Check memory usage and take action if needed
   */
  check() {
    const memoryUsage = this.getMemoryUsage();
    const memoryPercentage = memoryUsage.percentage;
    const previousStatus = this.status;
    
    // Log current memory usage
    if (this.options.logLevel === 'debug') {
      this.log(`Memory usage: ${(memoryUsage.used / 1024 / 1024 / 1024).toFixed(1)} GB / ${(memoryUsage.total / 1024 / 1024 / 1024).toFixed(1)} GB (${(memoryPercentage * 100).toFixed(1)}%)`, 'debug');
    }
    
    // Update status based on memory usage
    if (memoryPercentage >= this.options.criticalThreshold) {
      this.status = 'critical';
    } else if (memoryPercentage >= this.options.threshold) {
      this.status = 'warning';
    } else {
      this.status = 'normal';
    }
    
    // Take action based on status
    if (this.status === 'critical') {
      // Critical memory usage - aggressive optimization
      this.log(`🚨 CRITICAL memory usage: ${(memoryUsage.used / 1024 / 1024 / 1024).toFixed(1)} GB / ${(memoryUsage.total / 1024 / 1024 / 1024).toFixed(1)} GB (${(memoryPercentage * 100).toFixed(1)}%)`, 'error');
      
      // Dump heap if not already done for this critical event
      if (!this.heapDumped) {
        this.dumpHeap();
        this.heapDumped = true;
      }
      
      // Aggressive optimization
      this.optimize(true);
    } else if (this.status === 'warning') {
      // Warning level memory usage
      this.log(`⚠️ Memory usage warning: ${(memoryUsage.used / 1024 / 1024 / 1024).toFixed(1)} GB / ${(memoryUsage.total / 1024 / 1024 / 1024).toFixed(1)} GB (${(memoryPercentage * 100).toFixed(1)}%)`, 'warn');
      
      // Reset heap dump flag when we drop from critical to warning
      if (previousStatus === 'critical') {
        this.heapDumped = false;
      }
      
      // Standard optimization
      this.optimize(false);
    } else if (previousStatus !== 'normal') {
      // Transitioning from warning/critical to normal
      this.log(`Memory status changed from ${previousStatus} to normal: ${(memoryUsage.used / 1024 / 1024 / 1024).toFixed(1)} GB / ${(memoryUsage.total / 1024 / 1024 / 1024).toFixed(1)} GB`, 'info');
      this.heapDumped = false;
    }
    
    return this.status;
  }
  
  /**
   * Optimize memory usage
   * @param {boolean} aggressive - Whether to use aggressive optimization
   */
  optimize(aggressive = false) {
    // Run garbage collection if available
    if (this.gcEnabled) {
      this.forceGC();
    }
    
    if (aggressive) {
      // More aggressive memory optimization strategies
      global.gc && global.gc(true); // Force compaction
      this.log('Performed aggressive memory optimization', 'warn');
    }
  }
  
  /**
   * Force garbage collection
   */
  forceGC() {
    if (this.gcEnabled) {
      global.gc();
      this.log('Garbage collection triggered', 'debug');
    }
  }
  
  /**
   * Dump heap for analysis
   */
  dumpHeap() {
    try {
      const timestamp = new Date().toISOString().replace(/:/g, '-');
      const heapSnapshotPath = path.join(process.cwd(), 'logs', `heap-${timestamp}.heapsnapshot`);
      
      this.log(`Dumping heap snapshot to ${heapSnapshotPath}...`, 'warn');
      
      const snapshot = v8.getHeapSnapshot();
      const fileStream = fs.createWriteStream(heapSnapshotPath);
      
      snapshot.pipe(fileStream);
      
      fileStream.on('finish', () => {
        this.log(`Heap snapshot saved to ${heapSnapshotPath}`, 'info');
      });
    } catch (error) {
      this.log(`Failed to create heap snapshot: ${error.message}`, 'error');
    }
  }
  
  /**
   * Get current memory usage statistics
   * @returns {Object} Memory usage statistics
   */
  getMemoryUsage() {
    const memoryUsage = process.memoryUsage();
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const usedMemory = totalMemory - freeMemory;
    
    return {
      rss: memoryUsage.rss, // Resident Set Size
      heapTotal: memoryUsage.heapTotal,
      heapUsed: memoryUsage.heapUsed,
      external: memoryUsage.external,
      arrayBuffers: memoryUsage.arrayBuffers,
      total: totalMemory,
      free: freeMemory,
      used: usedMemory,
      percentage: usedMemory / totalMemory
    };
  }
  
  /**
   * Log a message
   * @param {string} message - Message to log
   * @param {string} level - Log level: debug, info, warn, error
   */
  log(message, level = 'info') {
    const timestamp = new Date().toISOString();
    const formattedMessage = `[${timestamp}] [MEMORY] [${level.toUpperCase()}] ${message}`;
    
    // Log to console if enabled
    if (this.options.logToConsole) {
      const consoleLevel = level === 'debug' ? 'log' : level === 'info' ? 'log' : level;
      console[consoleLevel](formattedMessage);
    }
    
    // Log to file if enabled
    if (this.options.logToFile) {
      fs.appendFileSync(this.options.logPath, formattedMessage + '\n');
    }
  }
}

module.exports = {
  MemoryMonitor
}; 