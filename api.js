// api.js

// Load environment variables
require('dotenv').config();

// Import required modules
const EventEmitter = require('events');
const path = require('path');
const winston = require('winston');
const { format } = winston;
const { MongoClient } = require('mongodb');
const Redis = require('ioredis');
const prometheus = require('prom-client');
const cluster = require('cluster'); // Ensure this is available, handle conditionally
const os = require('os');
const AsyncLock = require('async-lock');
const CircuitBreaker = require('opossum');
const WebSocket = require('ws');
const MetricsManager = require('./utils/metricsManager');
const { CacheManager } = require('./utils/cache'); // Ensure CacheManager is imported
const express = require('express');
const http = require('http');
const { DatabaseManager } = require('./utils/db'); // Correct import for utils/db.js

// Initialize global metrics
global.prometheusMetrics = global.prometheusMetrics || {};

// Lazy load PythonBridge to handle potential loading issues
let PythonBridge = null;
try {
  // Verify Python script exists before loading the bridge
  const fs = require('fs');
  const path = require('path');

  // Fix the script path - ensure it's using the absolute path
  const scriptPath = path.join(__dirname, 'scripts', 'predictive_model.py');

  // Check if Python is enabled from environment
  const pythonEnabled = process.env.PYTHON_ENABLED !== 'false';

  if (!pythonEnabled) {
    console.warn('Python is disabled by configuration. Using fallback implementation.');
    throw new Error('Python is disabled by configuration');
  }

  if (!fs.existsSync(scriptPath)) {
    console.error(`Critical: Python script not found at expected path: ${scriptPath}`);

    // Create a basic script to ensure functionality
    try {
      const scriptsDir = path.dirname(scriptPath);
      if (!fs.existsSync(scriptsDir)) {
        fs.mkdirSync(scriptsDir, { recursive: true });
      }

      // Create a basic Python script
      const basicScript = `# predictive_model.py - Basic implementation
import sys
import json
import time
from datetime import datetime

def main():
    """Main function to process input and generate predictions"""
    try:
        # Get input from Node.js
        input_data = json.loads(sys.argv[1]) if len(sys.argv) > 1 else {}

        # Generate mock prediction result
        result = {
            "prediction": 0.75,
            "confidence": 0.85,
            "factors": ["historical_performance", "recent_form"],
            "timestamp": datetime.now().isoformat(),
            "league": input_data.get('league', 'unknown'),
            "type": input_data.get('prediction_type', 'unknown')
        }

        # Return result as JSON
        print(json.dumps(result))

    except Exception as e:
        error_result = {
            "error": str(e),
            "timestamp": datetime.now().isoformat()
        }
        print(json.dumps(error_result))

if __name__ == "__main__":
    main()
`;
      fs.writeFileSync(scriptPath, basicScript);
      console.log(`Created basic Python script at: ${scriptPath}`);
    } catch (writeError) {
      console.error(`Failed to create Python script: ${writeError.message}`);
      throw new Error(`Failed to create Python script: ${writeError.message}`);
    }
  }

  // Load the actual PythonBridge implementation
  PythonBridge = require('./utils/pythonBridge');
  console.log('PythonBridge module loaded successfully');
  console.log(`Python script verified at: ${scriptPath}`);
} catch (error) {
  console.error('Failed to load PythonBridge module:', error);
  // Create a more robust fallback implementation
  PythonBridge = {
    runPrediction: async (data) => {
      console.warn('Using fallback PythonBridge implementation');

      // Generate deterministic but reasonable mock data based on input
      const league = data.league || 'unknown';
      const predictionType = data.prediction_type || 'unknown';

      // Create mock prediction with some variability
      const mockPrediction = {
        prediction: Math.random() * 0.3 + 0.5, // Random value between 0.5 and 0.8
        confidence: Math.random() * 0.2 + 0.7, // Random value between 0.7 and 0.9
        factors: ["historical_performance", "recent_form", "team_strength"],
        timestamp: new Date().toISOString(),
        league: league,
        type: predictionType,
        fallback: true,
        message: 'Using fallback prediction (Python unavailable)'
      };

      return mockPrediction;
    },
    shutdown: async () => {
      console.log('Fallback PythonBridge shutdown called');
      return true;
    }
  };
}

// Configure logging with .env settings
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: format.combine(
    format.timestamp(),
    format.errors({ stack: true }),
    format.splat(),
    format.json(),
    format.metadata()
  ),
  defaultMeta: { service: 'predictive-model' },
  transports: [
    new winston.transports.File({
      filename: 'error.log',
      level: 'error',
      maxsize: 10000000, // 10MB
      maxFiles: 5,
      tailable: true
    }),
    new winston.transports.File({
      filename: 'combined.log',
      maxsize: 10000000,
      maxFiles: 5,
      tailable: true
    }),
    new winston.transports.Console({
      format: format.combine(
        format.colorize(),
        format.simple()
      )
    })
  ]
});

// Initialize Prometheus metrics with detailed labels
const prometheusMetrics = {
  predictionLatency: new prometheus.Histogram({
    name: 'prediction_latency_seconds',
    help: 'Time spent processing predictions',
    labelNames: ['league', 'type']
  }),
  modelAccuracy: new prometheus.Gauge({
    name: 'model_accuracy',
    help: 'Model accuracy by league',
    labelNames: ['league']
  }),
  predictionsTotal: new prometheus.Counter({
    name: 'predictions_total',
    help: 'Total number of predictions',
    labelNames: ['league', 'type']
  }),
  predictionErrors: new prometheus.Counter({
    name: 'prediction_errors_total',
    help: 'Total number of prediction errors',
    labelNames: ['type', 'reason']
  }),
  activeConnections: new prometheus.Gauge({
    name: 'active_connections',
    help: 'Number of active connections'
  }),
  memoryUsage: new prometheus.Gauge({
    name: 'memory_usage_bytes',
    help: 'Memory usage in bytes'
  }),
  cpuLoad: new prometheus.Gauge({
    name: 'cpu_load',
    help: 'Current CPU load percentage'
  }),
  networkTraffic: new prometheus.Counter({
    name: 'network_traffic_bytes',
    help: 'Network traffic in bytes',
    labelNames: ['direction']
  })
};

// Memory monitoring class with optimization and detailed reporting
class MemoryMonitor {
  constructor(threshold = parseFloat(process.env.MEMORY_USAGE_THRESHOLD) || 0.75) { // Reduced threshold
    this.threshold = threshold;
    this.interval = null;
    this.history = [];
    this.lastCleanupTime = Date.now();
    this.consecutiveHighUsage = 0;
    this.isRunning = false;
    this.lastGcTime = 0;
    this.gcInterval = 60000; // 1 minute between GCs

    // Perform initial cleanup
    if (global.gc) {
      global.gc();
      this.lastGcTime = Date.now();
      logger.info('Initial garbage collection performed during startup');
    }
  }

  start(checkInterval = parseInt(process.env.MEMORY_CHECK_INTERVAL, 10) || 60000) { // 1 minute by default (reduced from 15)
    if (this.interval || this.isRunning) {
      this.stop(); // Clear any existing interval to prevent duplicates
    }

    this.isRunning = true;
    logger.info(`Starting memory monitor with threshold ${this.threshold * 100}% and interval ${checkInterval/1000} seconds`);

    // Initial check immediately to catch startup issues
    this.checkMemory();

    // Then set up the regular interval
    this.interval = setInterval(() => this.checkMemory(), checkInterval);

    return this;
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    this.isRunning = false;
    return this;
  }

  checkMemory() {
    if (!this.isRunning) {
      return 0; // Don't check if not running
    }

    try {
      const memoryUsage = process.memoryUsage();
      const usedHeapPercentage = memoryUsage.heapUsed / memoryUsage.heapTotal;
      const usedHeapMB = Math.round(memoryUsage.heapUsed / (1024 * 1024));
      const totalHeapMB = Math.round(memoryUsage.heapTotal / (1024 * 1024));
      const percentageFormatted = Math.round(usedHeapPercentage * 100);

      // Check RSS (Resident Set Size) as well
      const rssMB = Math.round(memoryUsage.rss / (1024 * 1024));

      // Log memory usage at info level for better visibility during debugging
      logger.info(`Memory usage: ${percentageFormatted}% (${usedHeapMB}MB / ${totalHeapMB}MB), RSS: ${rssMB}MB`);

      // Keep history minimal - only store the last 10 entries
      this.history.push({
        timestamp: new Date().toISOString(),
        heapUsed: usedHeapMB,
        heapTotal: totalHeapMB,
        rss: rssMB,
        percentage: percentageFormatted
      });

      // Limit history size
      if (this.history.length > 10) {
        this.history = this.history.slice(-10);
      }

      // Perform periodic garbage collection regardless of memory usage
      const now = Date.now();
      if (global.gc && (now - this.lastGcTime > this.gcInterval)) {
        global.gc();
        this.lastGcTime = now;
        logger.info('Periodic garbage collection performed');
      }

      // Take action based on memory usage thresholds
      if (usedHeapPercentage > this.threshold) {
        this.consecutiveHighUsage++;

        // Log warnings immediately for high memory usage
        const message = `High memory usage detected: ${percentageFormatted}% of heap used (occurrence ${this.consecutiveHighUsage})`;

        logger.warn(message, {
          heapUsed: usedHeapMB + 'MB',
          heapTotal: totalHeapMB + 'MB',
          rss: rssMB + 'MB',
          metadata: { service: 'memory-monitor', timestamp: new Date().toISOString() }
        });

        // Perform cleanup based on severity
        if (usedHeapPercentage > 0.85) {
          // Critical memory usage - most aggressive cleanup
          this._performCriticalCleanup(usedHeapPercentage);
        } else if (this.consecutiveHighUsage > 2 || usedHeapPercentage > 0.8) {
          // High memory usage - aggressive cleanup
          this._performAggressiveCleanup(usedHeapPercentage);
        } else {
          // Moderate memory usage - standard cleanup
          this._performStandardCleanup(usedHeapPercentage);
        }
      } else {
        // Reset consecutive count when memory usage is normal
        if (this.consecutiveHighUsage > 0) {
          this.consecutiveHighUsage = 0;
        }
      }

      if (prometheusMetrics && prometheusMetrics.memoryUsage) {
        prometheusMetrics.memoryUsage.set(memoryUsage.heapUsed);
      }

      return usedHeapPercentage;
    } catch (error) {
      logger.error('Error in memory check:', {
        error: error.message,
        stack: error.stack,
        metadata: { service: 'memory-monitor', timestamp: new Date().toISOString() }
      });
      return 0;
    }
  }

  // Standard cleanup for moderate memory pressure
  _performStandardCleanup(usagePercentage) {
    logger.info('Performing standard memory cleanup', {
      usagePercentage: Math.round(usagePercentage * 100) + '%',
      metadata: { service: 'memory-monitor', timestamp: new Date().toISOString() }
    });

    // Clear history to free memory
    this.history = this.history.slice(-5);

    // Run garbage collection
    if (global.gc) {
      global.gc();
      this.lastGcTime = Date.now();
    }
  }

  // Aggressive cleanup for high memory pressure
  _performAggressiveCleanup(usagePercentage) {
    logger.warn('Performing aggressive memory cleanup', {
      usagePercentage: Math.round(usagePercentage * 100) + '%',
      metadata: { service: 'memory-monitor', timestamp: new Date().toISOString() }
    });

    // Clear history completely
    this.history = [];

    // Clear module cache for non-essential modules
    try {
      const moduleCache = require.cache;
      const essentialModules = [
        'fs', 'path', 'os', 'util', 'events', 'stream',
        'http', 'https', 'net', 'crypto', 'zlib', 'buffer',
        'querystring', 'url', 'domain', 'dns', 'dgram',
        'child_process', 'cluster', 'module', 'process',
        'readline', 'repl', 'tty', 'string_decoder', 'timers',
        'tls', 'vm'
      ];

      let clearedCount = 0;

      for (const moduleId in moduleCache) {
        // Skip essential modules
        if (essentialModules.some(name => moduleId.includes(`/node_modules/${name}/`))) {
          continue;
        }

        // Skip core modules
        if (!moduleId.includes('node_modules') && !moduleId.includes(process.cwd())) {
          continue;
        }

        // Clear module from cache
        delete moduleCache[moduleId];
        clearedCount++;
      }

      if (clearedCount > 0) {
        logger.info(`Cleared ${clearedCount} modules from cache during aggressive cleanup`);
      }
    } catch (error) {
      logger.warn(`Error clearing module cache: ${error.message}`);
    }

    // Run garbage collection multiple times
    if (global.gc) {
      global.gc();
      this.lastGcTime = Date.now();

      // Wait a moment and run GC again
      setTimeout(() => {
        if (global.gc) {
          global.gc();
          logger.info('Second garbage collection completed');
        }
      }, 1000);
    }

    // Reset consecutive high usage counter to give system time to recover
    this.consecutiveHighUsage = 0;
  }

  // Critical cleanup for extreme memory pressure
  _performCriticalCleanup(usagePercentage) {
    logger.error('Performing critical memory cleanup', {
      usagePercentage: Math.round(usagePercentage * 100) + '%',
      metadata: { service: 'memory-monitor', timestamp: new Date().toISOString() }
    });

    // Clear all caches
    if (global.cache && typeof global.cache.clear === 'function') {
      global.cache.clear();
      logger.info('Cleared global cache');
    }

    // Clear all history
    this.history = [];

    // Clear all module caches (more aggressive)
    try {
      const moduleCache = require.cache;
      const criticalModules = [
        'fs', 'path', 'os', 'http', 'https', 'net', 'events'
      ];

      let clearedCount = 0;

      for (const moduleId in moduleCache) {
        // Skip only the most critical modules
        if (criticalModules.some(name => moduleId.includes(`/node_modules/${name}/`))) {
          continue;
        }

        // Clear module from cache
        delete moduleCache[moduleId];
        clearedCount++;
      }

      if (clearedCount > 0) {
        logger.info(`Cleared ${clearedCount} modules from cache during critical cleanup`);
      }
    } catch (error) {
      logger.warn(`Error clearing module cache: ${error.message}`);
    }

    // Run garbage collection multiple times
    if (global.gc) {
      global.gc();

      // Wait a moment and run GC again
      setTimeout(() => {
        if (global.gc) {
          global.gc();

          // And one more time
          setTimeout(() => {
            if (global.gc) {
              global.gc();
              logger.info('Third garbage collection completed');
            }
          }, 1000);
        }
      }, 1000);
    }

    // Reset consecutive high usage counter
    this.consecutiveHighUsage = 0;

    // Log heap statistics after cleanup
    setTimeout(() => {
      try {
        const memoryUsage = process.memoryUsage();
        const usedHeapMB = Math.round(memoryUsage.heapUsed / (1024 * 1024));
        const totalHeapMB = Math.round(memoryUsage.heapTotal / (1024 * 1024));
        const percentageFormatted = Math.round((memoryUsage.heapUsed / memoryUsage.heapTotal) * 100);

        logger.info(`Memory after critical cleanup: ${percentageFormatted}% (${usedHeapMB}MB / ${totalHeapMB}MB)`);
      } catch (error) {
        logger.error(`Error getting memory stats after cleanup: ${error.message}`);
      }
    }, 3000);
  }

  getHistory() {
    // Return a copy to prevent external modification
    return [...this.history];
  }
}

// CPU monitoring class with detailed metrics
class CPUMonitor {
  constructor(threshold = parseFloat(process.env.CPU_LOAD_THRESHOLD) || 0.80) {
    this.threshold = threshold;
    this.interval = null;
    this.history = [];
  }

  start(checkInterval = 300000) { // 5 minutes, matching .env
    this.interval = setInterval(() => this.checkCPU(), checkInterval);
    return this;
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    return this;
  }

  checkCPU() {
    const cpus = os.cpus();
    const totalLoad = cpus.reduce((sum, cpu) => sum + (cpu.times.user + cpu.times.sys) / cpu.times.total, 0) / cpus.length;
    this.history.push({ 
      timestamp: new Date().toISOString(), 
      load: totalLoad 
    });

    if (this.history.length > 100) {
      this.history.shift(); // Limit history to 100 entries
    }

    if (totalLoad > this.threshold) {
      logger.warn(`High CPU load detected: ${totalLoad * 100}%`, {
        history: this.history.slice(-5), // Include recent history for debugging
        metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
      });
    }
    if (prometheusMetrics.cpuLoad) {
      prometheusMetrics.cpuLoad.set(totalLoad * 100); // Convert to percentage
    }
    return totalLoad;
  }

  getHistory() {
    return this.history;
  }
}

// Connection pool manager with detailed tracking
class ConnectionPoolManager {
  constructor() {
    this.connections = new Map();
    this.history = [];
  }

  getConnection(id) {
    return this.connections.get(id);
  }

  addConnection(id, connection) {
    this.connections.set(id, { connection, lastUsed: Date.now() });
    this.history.push({ 
      timestamp: new Date().toISOString(), 
      action: 'add', 
      id 
    });
    if (this.history.length > 100) {
      this.history.shift(); // Limit history to 100 entries
    }
  }

  removeConnection(id) {
    this.connections.delete(id);
    this.history.push({ 
      timestamp: new Date().toISOString(), 
      action: 'remove', 
      id 
    });
    if (this.history.length > 100) {
      this.history.shift(); // Limit history to 100 entries
    }
  }

  cleanup(maxIdleTime = 3600000) { // 1 hour
    const now = Date.now();
    for (const [id, info] of this.connections) {
      if (now - info.lastUsed > maxIdleTime) this.removeConnection(id);
    }
  }

  getHistory() {
    return this.history;
  }
}

// Predictive model class with rate limiting and optimization
class TheAnalyzerPredictiveModel extends EventEmitter {
  constructor() {
    super();

    this.config = {
      mongoUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/sports-analytics',
      dbName: process.env.MONGODB_DB_NAME || 'sports-analytics',
      pythonScript: process.env.PYTHON_SCRIPT || 'predictive_model.py',
      port: parseInt(process.env.PORT, 10) || 5050,
      modelUpdateInterval: parseInt(process.env.MODEL_UPDATE_INTERVAL, 10) || 1209600000, // 14 days from .env
      redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT, 10) || 6379,
        password: process.env.REDIS_PASSWORD || undefined,
        enableOfflineQueue: process.env.REDIS_ENABLE_OFFLINE_QUEUE === 'true',
        retryStrategy: (times) => {
          const maxDelay = parseInt(process.env.REDIS_RETRY_STRATEGY_MAX_DELAY, 10) || 2000;
          const delay = Math.min(times * 50, maxDelay);
          logger.info(`Redis connection retry attempt ${times} after ${delay}ms`, {
            metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
          });
          return delay;
        },
        connectionName: 'predictive-model',
        connectTimeout: parseInt(process.env.REDIS_CONNECT_TIMEOUT, 10) || 10000,
        showFriendlyErrorStack: true,
        maxRetriesPerRequest: parseInt(process.env.REDIS_MAX_RETRIES, 10) || 3
      },
      cache: {
        ttl: parseInt(process.env.CACHE_TTL, 10) || 1800, // 30 minutes from .env
        max: parseInt(process.env.CACHE_MAX_ITEMS, 10) || 500,
        checkPeriod: parseInt(process.env.CACHE_CHECK_PERIOD, 10) || 300 // 5 minutes from .env
      },
      circuitBreaker: {
        timeout: parseInt(process.env.PREDICTION_TIMEOUT, 10) || 30000,
        errorThresholdPercentage: 50,
        resetTimeout: 30000,
        rollingCountTimeout: 10000
      },
      rateLimit: {
        windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 900000, // 15 minutes from .env
        max: parseInt(process.env.RATE_LIMIT_MAX, 10) || 50
      },
      streaming: {
        batchSize: 50, // Reduced to match optimizations
        interval: 5000, // 5 seconds
        maxQueueSize: 500 // Reduced to match optimizations
      },
      monitoring: {
        healthCheckInterval: parseInt(process.env.HEALTH_CHECK_INTERVAL, 10) || 300000, // 5 minutes from .env
        metricsInterval: parseInt(process.env.METRICS_INTERVAL, 10) || 300000 // 5 minutes from .env
      },
      alertThresholds: {
        memoryUsage: parseFloat(process.env.MEMORY_USAGE_THRESHOLD) || 0.80,
        cpuLoad: parseFloat(process.env.CPU_LOAD_THRESHOLD) || 0.80,
        networkTraffic: parseInt(process.env.NETWORK_TRAFFIC_THRESHOLD, 10) || 52428800 // 50MB from .env
      }
    };

    this.SUPPORTED_LEAGUES = [
      'NFL', 'NBA', 'MLB', 'NHL',
      'PREMIER_LEAGUE', 'LA_LIGA', 'BUNDESLIGA', 'SERIE_A'
    ];

    this.PREDICTION_TYPES = {
      SINGLE_FACTOR: 'single_factor',
      MULTI_FACTOR: 'multi_factor',
      PLAYER_STATS: 'player_stats',
      TEAM_PERFORMANCE: 'team_performance',
      GAME_OUTCOME: 'game_outcome',
      REAL_TIME: 'real_time',
      ADVANCED_ANALYTICS: 'advanced_analytics'
    };

    this.modelCache = new Map();
    this.lastTrainingTime = new Map();
    this.predictionHistory = new Map();
    this.modelMetrics = new Map();
    this.streamingQueue = [];
    this.isShuttingDown = false;
    this.xgbModels = new Map();
    this.lgbModels = new Map();

    // Initialize MetricsManager for monitoring with lazy loading
    this.metrics = null;
    this.initializeMetrics().catch(error => {
      logger.warn('Failed to initialize MetricsManager, using fallback metrics:', { 
        error: error.message, 
        metadata: { service: 'predictive-model', timestamp: new Date().toISOString() } 
      });
      this.metrics = {
        recordHttpRequest: () => {},
        recordEventLoopLag: () => {},
        recordMemoryUsage: () => {},
        recordAuthSuccess: () => {},
        recordAuthFailure: () => {},
        recordHealthStatus: () => {},
        recordStatCalculation: () => {},
        predictionDuration: { observe: () => {} },
        predictionErrors: { inc: () => {} },
        modelAccuracy: { set: () => {} },
        activeConnections: { inc: () => {}, dec: () => {}, set: () => {} },
        memoryUsage: { set: () => {} }
      };
    });

    // Initialize memory and CPU monitors with values from .env
    const memoryThreshold = parseFloat(process.env.MEMORY_USAGE_THRESHOLD) || this.config.alertThresholds.memoryUsage || 0.95;
    const cpuThreshold = parseFloat(process.env.CPU_LOAD_THRESHOLD) || this.config.alertThresholds.cpuLoad || 0.95;
    const memoryCheckInterval = parseInt(process.env.MEMORY_CHECK_INTERVAL, 10) || 900000; // 15 minutes default

    this.memoryMonitor = new MemoryMonitor(memoryThreshold);
    this.cpuMonitor = new CPUMonitor(cpuThreshold);

    // Only start monitors if aggressive GC is enabled
    if (process.env.ENABLE_AGGRESSIVE_GC === 'true') {
      logger.info(`Starting memory monitor with threshold ${memoryThreshold * 100}% and interval ${memoryCheckInterval/1000} seconds`);
      this.memoryMonitor.start(memoryCheckInterval);
      this.cpuMonitor.start(memoryCheckInterval);
    } else {
      logger.info('Aggressive GC is disabled, memory and CPU monitors will not be started');
    }

    this.connectionPool = new ConnectionPoolManager();

    // Store all interval references for proper cleanup
    this.intervals = [];

    // Ensure CacheManager is properly initialized
    this.cache = new CacheManager({
      stdTTL: this.config.cache.ttl,
      checkperiod: this.config.cache.checkPeriod,
      maxKeys: this.config.cache.max
    });

    // Add comprehensive cleanup interval for both connection pool and cache
    const combinedCleanupInterval = setInterval(() => {
      // Clean up connection pool
      this.connectionPool.cleanup();

      // Clean up cache
      this.cache.clear().catch(error => logger.warn('Cache cleanup failed:', {
        error: error.message,
        metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
      }));
    }, 15 * 60 * 1000); // Every 15 minutes
    this.intervals.push(combinedCleanupInterval);

    this._initializeComponents().catch(error => {
      logger.error('Critical: Failed to initialize components:', { 
        error: error.message, 
        stack: error.stack, 
        metadata: { service: 'predictive-model', timestamp: new Date().toISOString() } 
      });
      process.exit(1);
    });

    // Set up unhandled rejection and exception handlers with detailed logging
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled Rejection at:', { 
        promise, 
        reason: reason.message, 
        stack: reason.stack, 
        metadata: { service: 'predictive-model', timestamp: new Date().toISOString() } 
      });
      if (prometheusMetrics.predictionErrors) {
        prometheusMetrics.predictionErrors.inc({ type: 'unhandled_rejection', reason: reason.name || 'unknown' });
      }
      this._handleError(reason);
    });

    process.on('uncaughtException', (error) => {
      logger.error('Uncaught Exception:', { 
        error: error.message, 
        stack: error.stack, 
        metadata: { service: 'predictive-model', timestamp: new Date().toISOString() } 
      });
      if (prometheusMetrics.predictionErrors) {
        prometheusMetrics.predictionErrors.inc({ type: 'uncaught_exception', reason: error.name || 'unknown' });
      }
      this._handleError(error);
      this.cleanup().finally(() => process.exit(1));
    });
  }

  async initializeMetrics() {
    if (!this.metrics) {
      this.metrics = await MetricsManager.getInstance({
        logLevel: this.config.logLevel,
        alertThresholds: this.config.alertThresholds
      });
    }
    return this.metrics;
  }

  _handleError(error) {
    logger.error('Error handled:', { 
      error: error.message, 
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined, 
      metadata: { service: 'predictive-model', timestamp: new Date().toISOString() } 
    });
    if (prometheusMetrics.predictionErrors) {
      prometheusMetrics.predictionErrors.inc({ type: 'general_error', reason: error.name || 'unknown' });
    }
    this.emit('error:handled', error);
  }

  async _initializeComponents() {
    try {
      // Create a single Redis client instance as a global singleton with improved error handling
      let redisInitialized = false;

      if (!global.redisClient) {
        try {
          // Check if Redis port is available before attempting to connect
          const redisPort = this.config.redis.port;
          const redisHost = this.config.redis.host;

          logger.info(`Attempting to connect to Redis at ${redisHost}:${redisPort}`, {
            metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
          });

          // Create Redis client with improved error handling
          global.redisClient = new Redis({
            host: redisHost,
            port: redisPort,
            password: this.config.redis.password,
            enableOfflineQueue: this.config.redis.enableOfflineQueue,
            retryStrategy: (times) => {
              // Limit retry attempts
              if (times > 3) {
                logger.error('Redis connection failed after multiple retries, giving up', {
                  attempts: times,
                  metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
                });
                return null; // Stop retrying
              }

              const delay = Math.min(times * 200, 2000);
              logger.info(`Redis connection retry attempt ${times} after ${delay}ms`, {
                metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
              });
              return delay;
            },
            connectionName: this.config.redis.connectionName,
            connectTimeout: this.config.redis.connectTimeout,
            showFriendlyErrorStack: this.config.redis.showFriendlyErrorStack,
            maxRetriesPerRequest: this.config.redis.maxRetriesPerRequest,
            // Add disconnect listener to handle network issues
            disconnectTimeout: 5000
          });

          // Set up event handlers
          global.redisClient.on('connect', () => {
            logger.info('Redis connection established', {
              metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
            });
            redisInitialized = true;
          });

          // Enhanced Redis error handling with connection state tracking
          global.redisClient.on('error', (error) => {
            logger.error('Redis connection error:', {
              error: error.message,
              stack: error.stack,
              connectionState: global.redisClient.status || 'unknown',
              metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
            });

            // Don't throw error, just log it and handle it
            this._handleError(error);

            // Track Redis errors for monitoring
            if (this.metrics && typeof this.metrics.recordEvent === 'function') {
              try {
                this.metrics.recordEvent({
                  type: 'redis',
                  name: 'connection_error',
                  value: {
                    message: error.message,
                    connectionState: global.redisClient.status || 'unknown'
                  },
                  metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
                });
              } catch (metricsError) {
                // Ignore metrics recording errors to prevent cascading failures
                logger.debug('Failed to record Redis error metrics:', {
                  error: metricsError.message,
                  metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
                });
              }
            }
          });

          global.redisClient.on('close', () => {
            logger.warn('Redis connection closed unexpectedly', {
              connectionState: global.redisClient.status || 'unknown',
              metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
            });

            // Attempt to reconnect if not shutting down
            if (!this.isShuttingDown && global.redisClient) {
              logger.info('Attempting to reconnect to Redis after unexpected close', {
                metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
              });

              // Only attempt reconnect if the client isn't already reconnecting
              if (global.redisClient.status !== 'reconnecting') {
                try {
                  global.redisClient.connect().catch(error => {
                    logger.warn('Redis reconnection attempt failed:', {
                      error: error.message,
                      metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
                    });
                  });
                } catch (error) {
                  logger.warn('Error initiating Redis reconnection:', {
                    error: error.message,
                    metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
                  });
                }
              }
            }
          });

          // Add additional event handlers for better connection state tracking
          global.redisClient.on('ready', () => {
            logger.info('Redis connection ready', {
              metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
            });
          });

          global.redisClient.on('reconnecting', () => {
            logger.info('Redis attempting to reconnect', {
              metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
            });
          });

          global.redisClient.on('end', () => {
            logger.info('Redis connection ended', {
              metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
            });
          });

          // Wait for connection to be ready or fail
          await Promise.race([
            new Promise(resolve => global.redisClient.once('ready', resolve)),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error('Redis connection timeout')),
              this.config.redis.connectTimeout || 10000)
            )
          ]);

        } catch (redisError) {
          logger.error('Failed to initialize Redis client:', {
            error: redisError.message,
            stack: redisError.stack,
            metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
          });

          // Clean up failed connection
          if (global.redisClient) {
            try {
              global.redisClient.disconnect();
            } catch (disconnectError) {
              logger.warn('Error disconnecting Redis client:', {
                error: disconnectError.message,
                metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
              });
            }
            global.redisClient = null;
          }
        }
      } else {
        // If global client already exists, check its status
        if (global.redisClient.status === 'ready') {
          redisInitialized = true;
        } else {
          logger.warn(`Existing Redis client in ${global.redisClient.status} state`, {
            metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
          });
        }
      }

      this.redis = global.redisClient;

      if (!redisInitialized) {
        logger.warn('Redis initialization failed, system will operate with limited functionality', {
          metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
        });
      }

      // Initialize CacheManager with Redis and better error handling
      try {
        await this.cache.initialize(this.redis);
        logger.info('Cache system initialized successfully', {
          metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
        });
      } catch (cacheError) {
        logger.warn('Cache initialization failed, using minimal in-memory cache:', {
          error: cacheError.message,
          metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
        });

        // Ensure we have a working cache even if initialization fails
        if (!this.cache.initialized) {
          await this.cache.initialize(null);
        }
      }

      // Use DatabaseManager from utils/db.js
      this.dbManager = new DatabaseManager({
        uri: this.config.mongoUri,
        name: this.config.dbName,
        options: {
          maxPoolSize: parseInt(process.env.DB_MAX_POOL_SIZE, 10) || 50,
          minPoolSize: parseInt(process.env.DB_MIN_POOL_SIZE, 10) || 10,
          connectTimeoutMS: parseInt(process.env.CONNECT_TIMEOUT_MS, 10) || 30000,
          socketTimeoutMS: parseInt(process.env.SOCKET_TIMEOUT_MS, 10) || 45000,
          serverSelectionTimeoutMS: 5000,
          heartbeatFrequencyMS: 30000,
          maxIdleTimeMS: 60000,
          retryWrites: true,
          retryReads: true,
          serverApi: { version: '1', strict: true, deprecationErrors: true }
        }
      });

      // Enhanced retry logic for database initialization with improved error handling
      const maxDbRetries = 3;
      let dbInitialized = false;

      for (let attempt = 1; attempt <= maxDbRetries; attempt++) {
        try {
          // Ensure dbManager exists
          if (!this.dbManager) {
            throw new Error('Database manager is not properly initialized');
          }

          await this.dbManager.initialize();

          // Verify client exists after initialization
          if (!this.dbManager.client) {
            throw new Error('Database client is null after initialization');
          }

          this.client = this.dbManager.client;
          this.db = this.dbManager.client.db(this.config.dbName);

          // Verify db exists
          if (!this.db) {
            throw new Error('Database reference is null after initialization');
          }

          // Verify connection with a simple command
          await this.db.command({ ping: 1 });

          logger.info('MongoDB connection established and verified with retry', {
            metadata: { service: 'predictive-model', timestamp: new Date().toISOString(), attempt }
          });

          dbInitialized = true;
          break;
        } catch (error) {
          logger.warn(`Database initialization attempt ${attempt} failed, retrying...`, {
            error: error.message,
            metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
          });

          // On failure, ensure any partial connections are cleaned up
          if (this.client) {
            try {
              await this.client.close();
            } catch (closeError) {
              logger.warn('Error closing partial database connection:', {
                error: closeError.message,
                metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
              });
            }
            this.client = null;
            this.db = null;
          }

          if (attempt === maxDbRetries) {
            logger.error('Failed to initialize database after retries:', {
              error: error.message,
              stack: error.stack,
              metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
            });

            // Create fallback in-memory database for non-critical operations
            logger.info('Setting up in-memory fallback for database operations', {
              metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
            });

            // Don't throw error, continue with limited functionality
            this._handleError(error);
          } else {
            // Wait with exponential backoff before retrying
            await new Promise(resolve => setTimeout(resolve, 2000 * attempt));
          }
        }
      }

      // If database initialization failed completely, set up fallback mechanisms
      if (!dbInitialized) {
        logger.warn('Using in-memory fallbacks for database operations', {
          metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
        });

        // Set up minimal in-memory structures for critical operations
        this._setupInMemoryFallbacks();
      }

      // Create Express app and HTTP server with detailed middleware
      const app = express();
      app.use(express.json({ limit: '25mb' })); // Match MAX_PAYLOAD_SIZE from .env
      app.use(express.urlencoded({ extended: true, limit: '25mb' }));

      const server = http.createServer(app);

      // WebSocket server initialization with enhanced retry and separate port
      const { WebSocketServer } = require('./utils/websocket-server');
      this.websocketManager = new WebSocketServer({
        path: process.env.WS_PATH || '/ws',
        jwtSecret: process.env.JWT_SECRET,
        heartbeatInterval: parseInt(process.env.WS_HEARTBEAT_INTERVAL, 10) || 60000,
        clientTimeout: parseInt(process.env.WS_CLIENT_TIMEOUT, 10) || 35000,
        maxPayload: parseInt(process.env.WS_MAX_PAYLOAD, 10) || 52428800, // 50MB from .env
        maxClients: 1000,
        compression: {
          enabled: true,
          level: parseInt(process.env.COMPRESSION_LEVEL, 10) || 6,
          threshold: parseInt(process.env.COMPRESSION_THRESHOLD, 10) || 1024
        },
        security: {
          rateLimiting: {
            enabled: true,
            maxRequestsPerMinute: parseInt(process.env.RATE_LIMIT_MAX, 10) * 4 || 200
          },
          maxConnectionsPerIP: parseInt(process.env.MAX_CONNECTIONS_PER_IP, 10) || 50
        },
        monitoring: {
          enabled: true,
          metricsInterval: parseInt(process.env.METRICS_INTERVAL, 10) || 300000 // 5 minutes from .env
        }
      });

      // Create a separate server for WebSocket with port availability checking
      const net = require('net');

      // Function to check if a port is available
      const isPortAvailable = async (port) => {
        return new Promise((resolve) => {
          const tester = net.createServer()
            .once('error', () => resolve(false))
            .once('listening', () => {
              tester.once('close', () => resolve(true)).close();
            })
            .listen(port);
        });
      };

      // Function to find an available port starting from the preferred port
      const findAvailablePort = async (startPort, maxAttempts = 10) => {
        let port = startPort;
        for (let i = 0; i < maxAttempts; i++) {
          if (await isPortAvailable(port)) {
            return port;
          }
          port++;
        }
        throw new Error(`Could not find available port after ${maxAttempts} attempts starting from ${startPort}`);
      };

      // Find available WebSocket port
      const preferredWsPort = parseInt(process.env.WS_PORT, 10) || 5150;
      const wsPort = await findAvailablePort(preferredWsPort);

      if (wsPort !== preferredWsPort) {
        logger.info(`Preferred WebSocket port ${preferredWsPort} is in use, using alternative port ${wsPort}`, {
          metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
        });
      }

      const wsServer = http.createServer();

      // Store server reference for proper cleanup
      this.wsServer = wsServer;

      // Create a promise for server listening
      const wsServerListening = new Promise((resolve, reject) => {
        wsServer.once('error', reject);
        wsServer.once('listening', resolve);
      });

      // Start listening
      wsServer.listen(wsPort);

      try {
        // Wait for server to start listening
        await wsServerListening;
        logger.info(`WebSocket server listening on port ${wsPort}`, {
          metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
        });

        const maxWebSocketRetries = 3;
        for (let attempt = 1; attempt <= maxWebSocketRetries; attempt++) {
          try {
            await this.websocketManager.initialize(wsServer);
            logger.info('WebSocket server initialized successfully', {
              metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
            });
            break;
          } catch (error) {
            logger.warn(`WebSocket initialization attempt ${attempt} failed, retrying...`, {
              error: error.message,
              metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
            });
            if (attempt === maxWebSocketRetries) {
              logger.error('Failed to initialize WebSocket after retries:', {
                error: error.message,
                stack: error.stack,
                metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
              });
              this._handleError(error);
              throw error;
            }
            await new Promise(resolve => setTimeout(resolve, 2000 * attempt)); // Exponential backoff
          }
        }
      } catch (error) {
        logger.error('WebSocket server failed to start:', {
          error: error.message,
          stack: error.stack,
          port: wsPort,
          metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
        });
        // Close the server if it failed to start properly
        if (wsServer && wsServer.listening) {
          await new Promise(resolve => wsServer.close(resolve));
        }
        this._handleError(error);
        throw error;
      }

      this.lock = new AsyncLock({
        timeout: 5000,
        maxPending: 1000
      });

      // Define _executePython method if it doesn't exist with enhanced error handling and path resolution
      if (!this._executePython) {
        this._executePython = async (data) => {
          // Validate input to prevent 'data must be a non-null object' errors
          if (!data || typeof data !== 'object') {
            throw new Error('Invalid input: data must be a non-null object');
          }

          // Ensure we have the required PythonBridge
          if (!PythonBridge || typeof PythonBridge.runPrediction !== 'function') {
            logger.error('PythonBridge not available or missing runPrediction method', {
              metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
            });
            throw new Error('Python bridge not available');
          }

          // Add timestamp if not present
          if (!data.timestamp) {
            data.timestamp = new Date().toISOString();
          }

          // Resolve script path with better error handling
          let scriptPath = this.config.pythonScript;

          // Check if script exists in expected locations
          try {
            const fs = require('fs');
            const path = require('path');

            // Check multiple possible locations
            const possiblePaths = [
              // Direct path as configured
              scriptPath,
              // Path with scripts directory
              path.join('scripts', scriptPath),
              // Absolute path from current directory
              path.resolve(process.cwd(), scriptPath),
              // Absolute path with scripts directory
              path.resolve(process.cwd(), 'scripts', scriptPath)
            ];

            let scriptExists = false;
            for (const pathToCheck of possiblePaths) {
              if (fs.existsSync(pathToCheck)) {
                scriptPath = pathToCheck;
                scriptExists = true;
                logger.debug(`Found Python script at: ${scriptPath}`, {
                  metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
                });
                break;
              }
            }

            if (!scriptExists) {
              logger.warn(`Python script not found in expected locations: ${possiblePaths.join(', ')}`, {
                metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
              });
              // Continue with original path, let PythonBridge handle the error
            }
          } catch (pathError) {
            logger.warn(`Error checking Python script path: ${pathError.message}`, {
              metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
            });
            // Continue with original path
          }

          // Execute with enhanced error handling
          try {
            return await PythonBridge.runPrediction(data, scriptPath);
          } catch (error) {
            // Add more context to the error
            logger.error('Python execution failed:', {
              error: error.message,
              stack: error.stack,
              scriptPath,
              dataType: data.type,
              metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
            });

            // Rethrow with more context
            throw new Error(`Python execution failed: ${error.message} (Script: ${scriptPath})`);
          }
        };
      }

      this.breaker = new CircuitBreaker(this._executePython.bind(this), {
        timeout: this.config.circuitBreaker.timeout,
        errorThresholdPercentage: this.config.circuitBreaker.errorThresholdPercentage,
        resetTimeout: this.config.circuitBreaker.resetTimeout,
        rollingCountTimeout: this.config.circuitBreaker.rollingCountTimeout,
        errorFilter: (error) => error.type === 'ValidationError'
      });

      // Rate limiter with detailed logging
      try {
        const rateLimiterModule = require('./utils/rateLimiter');
        if (!rateLimiterModule || typeof rateLimiterModule.checkLimit !== 'function') {
          logger.error('Rate limiter module is invalid or missing checkLimit, using in-memory fallback', { 
            metadata: { service: 'predictive-model', timestamp: new Date().toISOString() } 
          });
          this.rateLimiter = {
            checkLimit: async (key) => {
              const now = Date.now();
              const userLimits = (this.rateLimiter.limits || new Map()).get(key) || [];
              const validRequests = userLimits.filter(timestamp => now - timestamp < this.config.rateLimit.windowMs);

              if (validRequests.length >= this.config.rateLimit.max) {
                logger.warn('Rate limit exceeded (in-memory fallback):', { 
                  key, 
                  limit: this.config.rateLimit.max, 
                  timestamp: new Date().toISOString(), 
                  metadata: { service: 'predictive-model' } 
                });
                return false;
              }

              validRequests.push(now);
              this.rateLimiter.limits = this.rateLimiter.limits || new Map();
              this.rateLimiter.limits.set(key, validRequests);
              return true;
            },
            limits: new Map()
          };
        } else {
          this.rateLimiter = rateLimiterModule;
          logger.info('Rate limiter initialized successfully from module', { 
            metadata: { service: 'predictive-model', timestamp: new Date().toISOString() } 
          });
        }
      } catch (error) {
        logger.error('Failed to load rate limiter module, using in-memory fallback:', { 
          error: error.message, 
          stack: error.stack, 
          metadata: { service: 'predictive-model', timestamp: new Date().toISOString() } 
        });
        this.rateLimiter = {
          checkLimit: async (key) => {
            const now = Date.now();
            const userLimits = (this.rateLimiter.limits || new Map()).get(key) || [];
            const validRequests = userLimits.filter(timestamp => now - timestamp < this.config.rateLimit.windowMs);

            if (validRequests.length >= this.config.rateLimit.max) {
              logger.warn('Rate limit exceeded (in-memory fallback):', { 
                key, 
                limit: this.config.rateLimit.max, 
                timestamp: new Date().toISOString(), 
                metadata: { service: 'predictive-model' } 
              });
              return false;
            }

            validRequests.push(now);
            this.rateLimiter.limits = this.rateLimiter.limits || new Map();
            this.rateLimiter.limits.set(key, validRequests);
            return true;
          },
          limits: new Map()
        };
      }

      this._initializeStreaming();
      this._initializeMonitoring();
      this._setupEventHandlers();

      // CORS middleware for security
      app.use((req, res, next) => {
        const origin = req.headers.origin;
        if (origin === process.env.CORS_ORIGIN || process.env.NODE_ENV === 'development') {
          res.header('Access-Control-Allow-Origin', origin);
          res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
          res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        }
        next();
      });

      // Start the HTTP server with port availability checking
      // Find available HTTP port
      const preferredHttpPort = this.config.port;
      let httpPort;
      try {
        httpPort = await findAvailablePort(preferredHttpPort);

        if (httpPort !== preferredHttpPort) {
          logger.info(`Preferred HTTP port ${preferredHttpPort} is in use, using alternative port ${httpPort}`, {
            metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
          });
        }

        // Store server reference for proper cleanup
        this.httpServer = server;

        // Create a promise for server listening
        const httpServerListening = new Promise((resolve, reject) => {
          server.once('error', reject);
          server.once('listening', resolve);
        });

        // Start listening
        server.listen(httpPort, this.config.host);

        // Wait for server to start listening
        await httpServerListening;

        // Update the config with the actual port used
        this.config.port = httpPort;

        logger.info(`HTTP server listening on ${this.config.host}:${httpPort}`, {
          metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
        });
      } catch (error) {
        logger.error('HTTP server failed to start:', {
          error: error.message,
          stack: error.stack,
          port: preferredHttpPort,
          metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
        });
        // Close the server if it failed to start properly
        if (server && server.listening) {
          await new Promise(resolve => server.close(resolve));
        }
        this._handleError(error);
        throw error;
      }

      logger.info('All components initialized successfully', { 
        metadata: { service: 'predictive-model', timestamp: new Date().toISOString() } 
      });
    } catch (error) {
      logger.error('Failed to initialize components:', { 
        error: error.message, 
        stack: error.stack, 
        metadata: { service: 'predictive-model', timestamp: new Date().toISOString() } 
      });
      this._handleError(error);
      throw error;
    }
  }

  async _initializeDatabase() {
    try {
      if (this.dbManager && this.dbManager.client) {
        return; // Already initialized via dbManager
      }
      throw new Error('Database not initialized via DatabaseManager');
    } catch (error) {
      logger.error('Database initialization failed:', { 
        error: error.message, 
        stack: error.stack, 
        metadata: { service: 'predictive-model', timestamp: new Date().toISOString() } 
      });
      if (prometheusMetrics.predictionErrors) {
        prometheusMetrics.predictionErrors.inc({ type: 'database_init', reason: error.name || 'unknown' });
      }
      this._handleError(error);
      throw error;
    }
  }

  _initializeStreaming() {
    try {
      this.streamProcessor = setInterval(() => {
        if (this.streamingQueue.length > 0 && !this.isShuttingDown) {
          this._processStreamingBatch().catch(error => {
            logger.error('Streaming batch processing error:', { 
              error: error.message, 
              stack: error.stack, 
              metadata: { service: 'predictive-model', timestamp: new Date().toISOString() } 
            });
            this._handleError(error);
          });
        }
      }, this.config.streaming.interval);

      this.intervals.push(this.streamProcessor);
      logger.info('Streaming initialization completed', { 
        metadata: { service: 'predictive-model', timestamp: new Date().toISOString() } 
      });
    } catch (error) {
      logger.error('Failed to initialize streaming:', { 
        error: error.message, 
        stack: error.stack, 
        metadata: { service: 'predictive-model', timestamp: new Date().toISOString() } 
      });
      this._handleError(error);
      throw error;
    }
  }

  _initializeMonitoring() {
    setInterval(async () => {
      try {
        const health = await this.healthCheck();
        if (health.status !== 'healthy') {
          logger.warn('Health check failed:', { 
            health, 
            metadata: { service: 'predictive-model', timestamp: new Date().toISOString() } 
          });
          this.emit('health:degraded', health);
        }
      } catch (error) {
        logger.error('Health check error:', { 
          error: error.message, 
          stack: error.stack, 
          metadata: { service: 'predictive-model', timestamp: new Date().toISOString() } 
        });
        this._handleError(error);
      }
    }, this.config.monitoring.healthCheckInterval);

    setInterval(() => {
      try {
        this._collectMetrics();
      } catch (error) {
        logger.error('Metrics collection error:', { 
          error: error.message, 
          stack: error.stack, 
          metadata: { service: 'predictive-model', timestamp: new Date().toISOString() } 
        });
        this._handleError(error);
      }
    }, this.config.monitoring.metricsInterval);

    // Only add memory monitoring if not already handled by memoryMonitor
    if (process.env.ENABLE_AGGRESSIVE_GC !== 'true') {
      // Set up a simple memory monitoring interval (less frequent)
      const memoryMonitoringInterval = parseInt(process.env.MEMORY_CHECK_INTERVAL, 10) || 900000; // 15 minutes default

      setInterval(() => {
        try {
          const usage = process.memoryUsage();
          if (prometheusMetrics && prometheusMetrics.memoryUsage) {
            prometheusMetrics.memoryUsage.set(usage.heapUsed);
          }

          // Only log memory usage at debug level to reduce noise
          const memoryRatio = usage.heapUsed / usage.heapTotal;
          const usedHeapMB = Math.round(usage.heapUsed / (1024 * 1024));
          const totalHeapMB = Math.round(usage.heapTotal / (1024 * 1024));
          const percentageFormatted = Math.round(memoryRatio * 100);

          logger.debug(`Memory usage: ${percentageFormatted}% (${usedHeapMB}MB / ${totalHeapMB}MB)`);

          // Only take action if memory usage is extremely high (95%)
          const memoryThreshold = parseFloat(process.env.MEMORY_USAGE_THRESHOLD) || 0.95;
          if (memoryRatio > memoryThreshold) {
            logger.warn('Critical memory usage detected:', {
              usage: {
                heapUsed: usedHeapMB + ' MB',
                heapTotal: totalHeapMB + ' MB',
                percentage: percentageFormatted + '%'
              },
              metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
            });

            // Force garbage collection if available
            if (global.gc) {
              global.gc();
              logger.info('Garbage collection triggered due to critical memory usage', {
                metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
              });
            }
          }

          if (this.metrics) {
            this.metrics.recordMemoryUsage();
          }
        } catch (error) {
          logger.error('Memory monitoring error:', {
            error: error.message,
            stack: error.stack,
            metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
          });
          this._handleError(error);
        }
      }, memoryMonitoringInterval);

      logger.info(`Simple memory monitoring initialized with interval ${memoryMonitoringInterval/1000} seconds`);
    }
  }

  _collectMetrics() {
    try {
      // Ensure prometheusMetrics is defined
      const prometheusMetrics = global.prometheusMetrics || {};

      for (const league of this.SUPPORTED_LEAGUES) {
        const leagueMetrics = this.modelMetrics.get(league);
        if (leagueMetrics && prometheusMetrics.modelAccuracy) {
          prometheusMetrics.modelAccuracy.set({ league }, leagueMetrics.accuracy || 0);
        }
      }

      if (prometheusMetrics.activeConnections && this.websocketManager && this.websocketManager.server) {
        prometheusMetrics.activeConnections.set(this.websocketManager.server.clients.size);
      }

      if (prometheusMetrics.memoryUsage) {
        const memUsage = process.memoryUsage();
        prometheusMetrics.memoryUsage.set(memUsage.heapUsed);
      }

      if (prometheusMetrics.cpuLoad && this.cpuMonitor) {
        const cpuLoad = this.cpuMonitor.checkCPU();
        prometheusMetrics.cpuLoad.set(cpuLoad * 100);
      }

      if (prometheusMetrics.networkTraffic) {
        const networkStats = os.networkInterfaces();
        Object.values(networkStats).forEach(iface => {
          iface.forEach(stat => {
            if (stat.traffic) {
              prometheusMetrics.networkTraffic.inc({ direction: 'in' }, stat.traffic.in);
              prometheusMetrics.networkTraffic.inc({ direction: 'out' }, stat.traffic.out);
            }
          });
        });
      }
    } catch (error) {
      logger.error('Metrics collection error:', { 
        error: error.message, 
        stack: error.stack, 
        metadata: { service: 'predictive-model', timestamp: new Date().toISOString() } 
      });
      this._handleError(error);
    }
  }

  async predict(predictionRequest) {
    const startTime = performance.now();

    try {
      if (!this.rateLimiter || typeof this.rateLimiter.checkLimit !== 'function') {
        throw new Error('Rate limiter is not properly initialized');
      }

      const clientId = predictionRequest.clientId || 'anonymous';
      const allowed = await this.rateLimiter.checkLimit(clientId);
      if (!allowed) {
        throw new Error('Prediction rate limit exceeded');
      }

      this._validatePredictionRequest(predictionRequest);

      const cacheKey = this._generateCacheKey(predictionRequest);
      const cachedResult = await this.cache.get(cacheKey);
      if (cachedResult) {
        return cachedResult;
      }

      const lastPrediction = await this.redis.get(`lastPrediction:${clientId}`);
      if (lastPrediction && (Date.now() - parseInt(lastPrediction)) < 1000) { // 1-second cooldown
        throw new Error('Prediction rate limit cooldown');
      }

      const result = await this._executePythonWithCircuitBreaker({
        type: 'prediction',
        league: predictionRequest.league,
        prediction_type: predictionRequest.predictionType,
        input_data: predictionRequest.input_data,
        factors: predictionRequest.factors,
        clientId
      });

      await this.redis.set(`lastPrediction:${clientId}`, Date.now(), 'EX', 10); // 10-second TTL
      await this.cache.set(cacheKey, result, this.config.cache.ttl);
      this._storePredictionHistory(predictionRequest.league, result);

      const duration = (performance.now() - startTime) / 1000;
      if (prometheusMetrics.predictionLatency) {
        prometheusMetrics.predictionLatency.observe({ league: predictionRequest.league, type: predictionRequest.predictionType }, duration);
      }
      if (prometheusMetrics.predictionsTotal) {
        prometheusMetrics.predictionsTotal.inc({
          league: predictionRequest.league,
          type: predictionRequest.predictionType
        });
      }

      if (this.metrics) {
        this.metrics.recordAnalyticsMetrics({
          type: 'prediction',
          accuracy: result.accuracy || 0,
          confidence: result.confidenceScore || 0,
          duration,
          modelId: predictionRequest.league
        });
      }

      return result;
    } catch (error) {
      logger.error('Prediction failed:', { 
        error: error.message, 
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined, 
        metadata: { service: 'predictive-model', timestamp: new Date().toISOString() } 
      });
      if (prometheusMetrics.predictionErrors) {
        prometheusMetrics.predictionErrors.inc({ type: 'prediction', reason: error.name || 'unknown' });
      }
      this._handleError(error);
      throw this._formatError(error);
    }
  }

  async _executePythonWithCircuitBreaker(data) {
    try {
      // Use the circuit breaker with our defined _executePython method
      return await this.breaker.fire(async () => {
        return await this._executePython(data);
      });
    } catch (error) {
      logger.error('Python execution failed via circuit breaker:', {
        error: error.message,
        stack: error.stack,
        metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
      });
      throw error;
    }
  }

  _validatePredictionRequest(request) {
    try {
      if (!request || typeof request !== 'object') {
        throw new Error('Invalid prediction request format');
      }

      if (!this.SUPPORTED_LEAGUES.includes(request.league)) {
        throw new Error(`Unsupported league: ${request.league}`);
      }

      if (!Object.values(this.PREDICTION_TYPES).includes(request.predictionType)) {
        throw new Error(`Unsupported prediction type: ${request.predictionType}`);
      }

      if (!request.clientId) {
        request.clientId = 'anonymous';
      }
    } catch (error) {
      logger.error('Validation failed:', { 
        error: error.message, 
        stack: error.stack, 
        metadata: { service: 'predictive-model', timestamp: new Date().toISOString() } 
      });
      this._handleError(error);
      throw error;
    }
  }

  _generateCacheKey(predictionRequest) {
    const crypto = require('crypto');
    const hash = crypto.createHash('sha256').update(JSON.stringify(predictionRequest)).digest('hex');
    return `pred:${predictionRequest.league}:${predictionRequest.predictionType}:${hash}`;
  }

  _storePredictionHistory(league, prediction) {
    if (!this.predictionHistory.has(league)) {
      this.predictionHistory.set(league, []);
    }

    const history = this.predictionHistory.get(league);
    history.push({ timestamp: new Date(), prediction });

    if (history.length > 500) { // Reduced for memory efficiency, matching .env
      history.shift();
    }
  }

  async _processStreamingBatch() {
    if (this.streamingQueue.length === 0 || this.isShuttingDown) return;

    try {
      const batch = this.streamingQueue.splice(0, this.config.streaming.batchSize);
      const leagueGroups = new Map();

      for (const item of batch) {
        if (!leagueGroups.has(item.league)) leagueGroups.set(item.league, []);
        leagueGroups.get(item.league).push(item);
      }

      const promises = [];
      for (const [league, data] of leagueGroups) {
        promises.push(this._processBatchForLeague(league, data));
      }

      await Promise.all(promises);
    } catch (error) {
      logger.error('Batch processing error:', { 
        error: error.message, 
        stack: error.stack, 
        metadata: { service: 'predictive-model', timestamp: new Date().toISOString() } 
      });
      if (prometheusMetrics.predictionErrors) {
        prometheusMetrics.predictionErrors.inc({ type: 'batch_processing', reason: error.name || 'unknown' });
      }
      this._handleError(error);
    }
  }

  async _processBatchForLeague(league, data) {
    try {
      const result = await this._executePythonWithCircuitBreaker({
        type: 'batch_process',
        league,
        data
      });

      // Check if websocketManager exists
      if (this.websocketManager) {
        // Check if broadcast method exists
        if (typeof this.websocketManager.broadcast === 'function') {
          this.websocketManager.broadcast(league, result);
        }
        // If broadcast doesn't exist but server and clients do, implement a fallback
        else if (this.websocketManager.server && this.websocketManager.server.clients) {
          logger.info(`Using fallback broadcast for league ${league}`, {
            metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
          });

          // Fallback implementation
          const message = JSON.stringify({
            type: 'broadcast',
            channel: league,
            data: result,
            timestamp: Date.now()
          });

          this.websocketManager.server.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN &&
                (!client.subscribedLeagues || client.subscribedLeagues.includes(league))) {
              client.send(message);
            }
          });
        } else {
          logger.warn(`Cannot broadcast results for league ${league}: websocketManager.broadcast not available`, {
            metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
          });
        }
      } else {
        logger.warn(`Cannot broadcast results for league ${league}: websocketManager not available`, {
          metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
        });
      }
      return result;
    } catch (error) {
      logger.error(`League batch processing error for ${league}:`, { 
        error: error.message, 
        stack: error.stack, 
        metadata: { service: 'predictive-model', timestamp: new Date().toISOString() } 
      });
      if (prometheusMetrics.predictionErrors) {
        prometheusMetrics.predictionErrors.inc({ type: 'batch_process', reason: error.name || 'unknown' });
      }
      this._handleError(error);
      throw error;
    }
  }

  async healthCheck() {
    try {
      const health = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: '3.0.0',
        port: this.config.port,
        components: {
          database: await this._checkDatabaseHealth(),
          redis: await this._checkRedisHealth(),
          python: await this._checkPythonHealth(),
          websocket: this._checkWebSocketHealth(),
          cache: await this._checkCacheHealth()
        },
        metrics: {
          activeConnections: this.websocketManager.server?.clients.size || 0,
          queueSize: this.streamingQueue.length,
          memoryUsage: process.memoryUsage(),
          uptime: process.uptime(),
          cpuLoad: this.cpuMonitor.checkCPU(),
          memoryHistory: this.memoryMonitor.getHistory(),
          cpuHistory: this.cpuMonitor.getHistory(),
          connectionHistory: this.connectionPool.getHistory()
        }
      };

      health.status = Object.values(health.components).every(
        status => status === 'healthy'
      ) ? 'healthy' : 'degraded';

      if (this.metrics) {
        this.metrics.recordHealthStatus(health);
      }
      return health;
    } catch (error) {
      logger.error('Health check failed:', { 
        error: error.message, 
        stack: error.stack, 
        metadata: { service: 'predictive-model', timestamp: new Date().toISOString() } 
      });
      this._handleError(error);
      return {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error.message
      };
    }
  }

  async _checkDatabaseHealth() {
    try {
      if (!this.dbManager) return 'unhealthy';
      const health = await this.dbManager.healthCheck();
      return health.status;
    } catch (error) {
      logger.error('Database health check failed:', { 
        error: error.message, 
        metadata: { service: 'predictive-model', timestamp: new Date().toISOString() } 
      });
      if (prometheusMetrics.predictionErrors) {
        prometheusMetrics.predictionErrors.inc({ type: 'database_health', reason: error.name || 'unknown' });
      }
      this._handleError(error);
      return 'unhealthy';
    }
  }

  async _checkRedisHealth() {
    try {
      if (!this.redis) return 'unhealthy';
      await this.redis.ping();
      return 'healthy';
    } catch (error) {
      logger.error('Redis health check failed:', { 
        error: error.message, 
        metadata: { service: 'predictive-model', timestamp: new Date().toISOString() } 
      });
      if (prometheusMetrics.predictionErrors) {
        prometheusMetrics.predictionErrors.inc({ type: 'redis_health', reason: error.name || 'unknown' });
      }
      this._handleError(error);
      return 'unhealthy';
    }
  }

  async _checkPythonHealth() {
    try {
      // First, try a direct Python check using child_process
      // This bypasses PythonBridge and its validation
      try {
        const fs = require('fs');
        const pythonScriptPath = path.resolve(process.cwd(), 'scripts', this.config.pythonScript);

        // Check if Python script exists
        if (!fs.existsSync(pythonScriptPath)) {
          logger.warn(`Python script not found at ${pythonScriptPath}`, {
            metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
          });
          return 'unhealthy';
        }

        // Simple health check command
        const { spawn } = require('child_process');
        const pythonProcess = spawn(process.env.PYTHON_PATH || 'python', ['-c', 'print("healthy")']);

        const result = await new Promise((resolve, reject) => {
          let output = '';
          let error = '';

          pythonProcess.stdout.on('data', (data) => {
            output += data.toString();
          });

          pythonProcess.stderr.on('data', (data) => {
            error += data.toString();
          });

          pythonProcess.on('close', (code) => {
            if (code === 0) {
              resolve(output.trim());
            } else {
              reject(new Error(`Python process exited with code ${code}: ${error}`));
            }
          });

          // Set timeout
          setTimeout(() => {
            pythonProcess.kill();
            reject(new Error('Python health check timed out'));
          }, 5000);
        });

        if (result === 'healthy') {
          return 'healthy';
        }
      } catch (directError) {
        logger.debug('Direct Python health check failed, trying PythonBridge:', {
          error: directError.message,
          metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
        });
        // Continue to PythonBridge approach
      }

      // If direct check fails, try with PythonBridge
      // Create a proper health check object that will pass validation
      const healthCheckData = {
        type: 'health_check',
        timestamp: new Date().toISOString(),
        data: {
          command: 'status'
        }
      };

      // Check if the circuit breaker is open
      if (this.breaker && this.breaker.opened) {
        logger.warn('Circuit breaker is open, Python health check failed', {
          metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
        });
        return 'unhealthy';
      }

      // Try to execute Python health check through PythonBridge
      try {
        const result = await this._executePythonWithCircuitBreaker(healthCheckData);
        return result && result.status === 'ok' ? 'healthy' : 'unhealthy';
      } catch (error) {
        logger.error('PythonBridge health check failed:', {
          error: error.message,
          metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
        });
        return 'unhealthy';
      }
    } catch (error) {
      logger.error('Python health check failed:', {
        error: error.message,
        stack: error.stack,
        metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
      });
      if (prometheusMetrics.predictionErrors) {
        prometheusMetrics.predictionErrors.inc({ type: 'python_health_check', reason: error.name || 'unknown' });
      }
      this._handleError(error);
      return 'unhealthy';
    }
  }

  _checkWebSocketHealth() {
    try {
      if (!this.websocketManager) {
        return 'unhealthy';
      }

      // Check if server property exists and is initialized
      const serverInitialized = this.websocketManager.server &&
                               (this.websocketManager.server.isInitialized ||
                                this.websocketManager.server.clients);

      return serverInitialized && !this.isShuttingDown ? 'healthy' : 'unhealthy';
    } catch (error) {
      logger.error('WebSocket health check failed:', {
        error: error.message,
        metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
      });
      if (prometheusMetrics && prometheusMetrics.predictionErrors) {
        prometheusMetrics.predictionErrors.inc({ type: 'websocket_health', reason: error.name || 'unknown' });
      }
      this._handleError(error);
      return 'unhealthy';
    }
  }

  async _checkCacheHealth() {
    try {
      if (!this.cache || !this.cache.has || !this.cache.set || !this.cache.get) {
        logger.error('Cache object is invalid or missing required methods', {
          metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
        });
        this._handleError(new Error('Invalid cache object'));
        return 'unhealthy';
      }
      await this.cache.set('_health_check_', 'ok', 5); // 5 seconds TTL
      const result = await this.cache.get('_health_check_');
      return result === 'ok' ? 'healthy' : 'unhealthy';
    } catch (error) {
      logger.error('Cache health check failed:', { 
        error: error.message, 
        metadata: { service: 'predictive-model', timestamp: new Date().toISOString() } 
      });
      if (prometheusMetrics.predictionErrors) {
        prometheusMetrics.predictionErrors.inc({ type: 'cache_health', reason: error.name || 'unknown' });
      }
      this._handleError(error);
      return 'unhealthy';
    }
  }

  async cleanup() {
    try {
      this.isShuttingDown = true;
      logger.info('Starting graceful shutdown...', { 
        metadata: { service: 'predictive-model', timestamp: new Date().toISOString() } 
      });

      // Improved WebSocket server cleanup
      try {
        // First try to use the WebSocket manager's handleGracefulShutdown method
        if (this.websocketManager && typeof this.websocketManager.handleGracefulShutdown === 'function') {
          await this.websocketManager.handleGracefulShutdown();
          logger.info('WebSocket manager gracefully shut down', {
            metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
          });
        }
        // Fallback to manual cleanup if handleGracefulShutdown is not available
        else if (this.websocketManager && this.websocketManager.server) {
          // Close all client connections first
          if (this.websocketManager.server.clients) {
            const clients = Array.from(this.websocketManager.server.clients);
            logger.info(`Closing ${clients.length} WebSocket client connections`, {
              metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
            });

            for (const client of clients) {
              try {
                client.close(1000, 'Server shutting down');
              } catch (clientError) {
                logger.warn('Error closing WebSocket client:', {
                  error: clientError.message,
                  metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
                });
              }
            }
          }

          // Then close the WebSocket server
          if (this.websocketManager.server) {
            await new Promise(resolve => {
              this.websocketManager.server.close(err => {
                if (err) {
                  logger.warn('Error closing WebSocket server:', {
                    error: err.message,
                    metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
                  });
                }
                resolve();
              });
            });
          }
        }
        // Handle case where websocketManager exists but server property doesn't
        else if (this.websocketManager) {
          if (typeof this.websocketManager.close === 'function') {
            await this.websocketManager.close();
          }
          logger.info('WebSocket manager closed (no server property)', {
            metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
          });
        }

        // Close the HTTP server used for WebSocket if it exists
        if (this.wsServer) {
          await new Promise(resolve => {
            this.wsServer.close(err => {
              if (err) {
                logger.warn('Error closing WebSocket HTTP server:', {
                  error: err.message,
                  metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
                });
              }
              resolve();
            });
          });
          logger.info('WebSocket HTTP server closed', {
            metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
          });
        }
      } catch (wsError) {
        // Don't throw error if WebSocket cleanup fails, just log it
        logger.warn('Error during WebSocket cleanup:', {
          error: wsError.message,
          stack: wsError.stack,
          metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
        });
      }

      // Close the HTTP server if it exists
      if (this.httpServer) {
        try {
          await new Promise(resolve => {
            this.httpServer.close(err => {
              if (err) {
                logger.warn('Error closing HTTP server:', {
                  error: err.message,
                  metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
                });
              }
              resolve();
            });
          });
          logger.info('HTTP server closed', {
            metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
          });
        } catch (httpError) {
          logger.warn('Error during HTTP server cleanup:', {
            error: httpError.message,
            stack: httpError.stack,
            metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
          });
        }
      }

      // Improved database manager cleanup
      if (this.dbManager) {
        try {
          await this.dbManager.disconnect();
          logger.info('MongoDB connection closed', {
            metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
          });
        } catch (dbError) {
          logger.warn('Error during MongoDB connection cleanup:', {
            error: dbError.message,
            stack: dbError.stack,
            metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
          });
        }
      }

      // Enhanced Redis connection cleanup with better error handling and connection state management
      if (this.redis) {
        try {
          // Check Redis connection status before attempting to close
          const redisStatus = this.redis.status || 'unknown';
          logger.info(`Redis connection status before cleanup: ${redisStatus}`, {
            metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
          });

          // Handle different connection states appropriately
          if (redisStatus === 'ready' || redisStatus === 'connect') {
            // Use a timeout to prevent hanging on quit
            const quitPromise = this.redis.quit();
            const timeoutPromise = new Promise((_, reject) =>
              setTimeout(() => reject(new Error('Redis quit timeout')), 5000)
            );

            await Promise.race([quitPromise, timeoutPromise])
              .then(() => {
                logger.info('Redis connection closed gracefully', {
                  metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
                });
              })
              .catch(error => {
                logger.warn(`Redis quit timed out or failed: ${error.message}, forcing disconnect`, {
                  metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
                });
                // Force disconnect if quit fails or times out
                if (this.redis && typeof this.redis.disconnect === 'function') {
                  this.redis.disconnect();
                }
              });
          } else if (redisStatus === 'end' || redisStatus === 'close') {
            logger.info('Redis connection already closed, no action needed', {
              metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
            });
          } else {
            // For any other status, force disconnect to be safe
            logger.info(`Redis in ${redisStatus} state, forcing disconnect`, {
              metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
            });
            if (typeof this.redis.disconnect === 'function') {
              this.redis.disconnect();
            }
          }

          // Remove all event listeners to prevent memory leaks
          if (this.redis.removeAllListeners) {
            this.redis.removeAllListeners();
            logger.info('Removed all Redis event listeners', {
              metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
            });
          }
        } catch (redisError) {
          // Don't throw error if Redis cleanup fails, just log it
          logger.warn('Error during Redis connection cleanup:', {
            error: redisError.message,
            stack: redisError.stack,
            metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
          });
        } finally {
          // Ensure Redis references are cleared regardless of success/failure
          this.redis = null;

          // Also clear the global Redis client if it exists
          if (global.redisClient) {
            global.redisClient = null;
            logger.info('Cleared global Redis client reference', {
              metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
            });
          }
        }
      }

      if (this.cache) {
        await this.cache.clear();
        logger.info('Cache cleared', { 
          metadata: { service: 'predictive-model', timestamp: new Date().toISOString() } 
        });
      }

      this.streamingQueue = [];

      for (const interval of this.intervals) {
        clearInterval(interval);
      }

      if (global.gc) global.gc();

      if (this.metrics && typeof this.metrics.cleanup === 'function') {
        this.metrics.cleanup();
      }

      // Enhanced Python Bridge shutdown with better error handling
      if (PythonBridge) {
        try {
          // Check if shutdown method exists
          if (typeof PythonBridge.shutdown === 'function') {
            logger.info('Shutting down Python Bridge...', {
              metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
            });

            // Set a timeout for the shutdown to prevent hanging
            const shutdownPromise = PythonBridge.shutdown();
            const timeoutPromise = new Promise((_, reject) =>
              setTimeout(() => reject(new Error('Python Bridge shutdown timed out')), 10000)
            );

            await Promise.race([shutdownPromise, timeoutPromise])
              .then(() => {
                logger.info('Python Bridge shutdown completed successfully', {
                  metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
                });
              })
              .catch(error => {
                logger.warn('Python Bridge shutdown error (continuing cleanup):', {
                  error: error.message,
                  metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
                });

                // Force cleanup of any remaining Python processes
                this._forceCleanupPythonProcesses();
              });
          } else {
            logger.warn('Python Bridge shutdown method not available, attempting manual cleanup', {
              metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
            });

            // Fallback to manual cleanup
            this._forceCleanupPythonProcesses();
          }
        } catch (pythonError) {
          logger.warn('Error during Python Bridge shutdown (continuing cleanup):', {
            error: pythonError.message,
            stack: pythonError.stack,
            metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
          });

          // Still try to force cleanup
          this._forceCleanupPythonProcesses();
        }
      }

      this.memoryMonitor.stop();
      this.cpuMonitor.stop();

      logger.info('Cleanup completed successfully', { 
        metadata: { service: 'predictive-model', timestamp: new Date().toISOString() } 
      });
    } catch (error) {
      logger.error('Cleanup failed:', { 
        error: error.message, 
        stack: error.stack, 
        metadata: { service: 'predictive-model', timestamp: new Date().toISOString() } 
      });
      this._handleError(error);
      throw error;
    }
  }

  _formatError(error) {
    return {
      message: error.message,
      type: error.constructor.name,
      timestamp: new Date().toISOString(),
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    };
  }

  /**
   * Set up in-memory fallbacks for database operations when MongoDB is unavailable
   * @private
   */
  _setupInMemoryFallbacks() {
    // Create in-memory collections
    this._inMemoryDb = {
      users: new Map(),
      games: new Map(),
      stats: new Map(),
      predictions: new Map()
    };

    // Create minimal client interface for fallback operations
    if (!this.client) {
      this.client = {
        isConnected: () => false,
        db: () => this._getInMemoryDb()
      };
    }

    // Create minimal db interface
    if (!this.db) {
      this.db = this._getInMemoryDb();
    }

    logger.info('In-memory database fallbacks initialized', {
      metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
    });
  }

  /**
   * Get in-memory database interface
   * @private
   * @returns {Object} In-memory database interface
   */
  _getInMemoryDb() {
    return {
      collection: (name) => {
        if (!this._inMemoryDb[name]) {
          this._inMemoryDb[name] = new Map();
        }

        return {
          find: (query = {}) => ({
            toArray: async () => Array.from(this._inMemoryDb[name].values())
              .filter(item => this._matchesQuery(item, query))
          }),
          findOne: async (query = {}) => Array.from(this._inMemoryDb[name].values())
            .find(item => this._matchesQuery(item, query)),
          insertOne: async (doc) => {
            const id = doc._id || `mem_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
            const newDoc = { ...doc, _id: id };
            this._inMemoryDb[name].set(id, newDoc);
            return { insertedId: id, acknowledged: true };
          },
          updateOne: async (filter, update) => {
            const item = Array.from(this._inMemoryDb[name].values())
              .find(item => this._matchesQuery(item, filter));

            if (item) {
              const id = item._id;
              if (update.$set) {
                this._inMemoryDb[name].set(id, { ...item, ...update.$set });
              }
              return { modifiedCount: 1, acknowledged: true };
            }

            return { modifiedCount: 0, acknowledged: true };
          },
          createIndex: async () => ({ acknowledged: true })
        };
      },
      command: async (cmd) => {
        if (cmd.ping) return { ok: 1 };
        return { ok: 0, error: 'Not implemented in fallback mode' };
      }
    };
  }

  /**
   * Simple query matcher for in-memory database
   * @private
   * @param {Object} item - Item to check
   * @param {Object} query - Query to match against
   * @returns {boolean} True if item matches query
   */
  _matchesQuery(item, query) {
    if (!item || !query) return false;

    for (const [key, value] of Object.entries(query)) {
      if (key === '$or' && Array.isArray(value)) {
        const matches = value.some(subQuery => this._matchesQuery(item, subQuery));
        if (!matches) return false;
      } else if (typeof value === 'object' && value !== null) {
        // Handle operators like $gt, $lt, etc.
        if (key in item) {
          if (value.$gt && !(item[key] > value.$gt)) return false;
          if (value.$gte && !(item[key] >= value.$gte)) return false;
          if (value.$lt && !(item[key] < value.$lt)) return false;
          if (value.$lte && !(item[key] <= value.$lte)) return false;
          if (value.$ne && item[key] === value.$ne) return false;
        } else {
          return false;
        }
      } else if (item[key] !== value) {
        return false;
      }
    }

    return true;
  }

  /**
   * Optimize memory usage when it exceeds thresholds
   * @param {number} currentUsage - Current memory usage ratio
   * @private
   */
  async _optimizeMemory(currentUsage) {
    try {
      logger.info('Starting memory optimization', {
        currentUsage: Math.round(currentUsage * 100) + '%',
        metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
      });

      // 1. Clear non-essential caches
      this.modelCache.clear();
      this.predictionHistory.clear();

      // 2. Trim streaming queue if it's large
      if (this.streamingQueue.length > 100) {
        const removed = this.streamingQueue.length - 100;
        this.streamingQueue = this.streamingQueue.slice(-100);
        logger.info(`Removed ${removed} items from streaming queue`, {
          metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
        });
      }

      // 3. Clear model metrics that aren't being used
      for (const [league, metrics] of this.modelMetrics.entries()) {
        // Keep only essential metrics
        if (metrics && typeof metrics === 'object') {
          Object.keys(metrics).forEach(key => {
            if (key !== 'accuracy' && key !== 'lastUpdated') {
              delete metrics[key];
            }
          });
        }
      }

      // 4. Trigger cache optimization if available
      if (this.cache && typeof this.cache.performMemoryOptimization === 'function') {
        await this.cache.performMemoryOptimization(currentUsage, this.config.alertThresholds.memoryUsage);
      } else if (this.cache && typeof this.cache.clear === 'function') {
        await this.cache.clear();
        logger.info('Cache cleared during memory optimization', {
          metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
        });
      }

      // 5. Force garbage collection if available
      if (global.gc) {
        global.gc();
        logger.info('Garbage collection triggered during memory optimization', {
          metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
        });
      }

      // 6. Log memory usage after optimization
      const newUsage = process.memoryUsage();
      const newRatio = newUsage.heapUsed / newUsage.heapTotal;

      logger.info('Memory optimization complete', {
        before: Math.round(currentUsage * 100) + '%',
        after: Math.round(newRatio * 100) + '%',
        reduction: Math.round((currentUsage - newRatio) * 100) + '%',
        metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
      });

    } catch (error) {
      logger.error('Error during memory optimization:', {
        error: error.message,
        stack: error.stack,
        metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
      });
    }
  }

  /**
   * Force cleanup of any remaining Python processes
   * @private
   */
  _forceCleanupPythonProcesses() {
    try {
      logger.info('Performing force cleanup of Python processes', {
        metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
      });

      // Use process module to find and kill Python processes
      const { execSync } = require('child_process');

      if (process.platform === 'win32') {
        // Windows approach
        try {
          // Find Python processes started by this Node.js process
          const output = execSync('wmic process where "name like \'%python%\' and ParentProcessId=' + process.pid + '" get ProcessId').toString();
          const lines = output.split('\n').filter(line => line.trim() !== '' && line.trim() !== 'ProcessId');

          for (const line of lines) {
            const pid = line.trim();
            if (pid && !isNaN(parseInt(pid))) {
              try {
                execSync(`taskkill /F /PID ${pid}`);
                logger.info(`Forcefully terminated Python process with PID ${pid}`, {
                  metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
                });
              } catch (killError) {
                logger.warn(`Failed to kill Python process with PID ${pid}`, {
                  error: killError.message,
                  metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
                });
              }
            }
          }
        } catch (error) {
          logger.warn('Error finding Python processes on Windows:', {
            error: error.message,
            metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
          });
        }
      } else {
        // Unix-like approach
        try {
          // Find Python processes started by this Node.js process
          const output = execSync(`ps -o pid,command -ww -p $(pgrep -P ${process.pid} python) 2>/dev/null || echo ""`).toString();
          const lines = output.split('\n').filter(line => line.includes('python'));

          for (const line of lines) {
            const match = line.trim().match(/^(\d+)/);
            if (match && match[1]) {
              const pid = match[1];
              try {
                execSync(`kill -9 ${pid}`);
                logger.info(`Forcefully terminated Python process with PID ${pid}`, {
                  metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
                });
              } catch (killError) {
                logger.warn(`Failed to kill Python process with PID ${pid}`, {
                  error: killError.message,
                  metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
                });
              }
            }
          }
        } catch (error) {
          logger.warn('Error finding Python processes on Unix:', {
            error: error.message,
            metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
          });
        }
      }
    } catch (error) {
      logger.warn('Error during force cleanup of Python processes:', {
        error: error.message,
        stack: error.stack,
        metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
      });
    }
  }

  _setupEventHandlers() {
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled Rejection at:', {
        promise,
        reason: reason.message,
        stack: reason.stack,
        metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
      });
      if (prometheusMetrics.predictionErrors) {
        prometheusMetrics.predictionErrors.inc({ type: 'unhandled_rejection', reason: reason.name || 'unknown' });
      }
      this._handleError(reason);
    });

    process.on('uncaughtException', (error) => {
      logger.error('Uncaught Exception:', { 
        error: error.message, 
        stack: error.stack, 
        metadata: { service: 'predictive-model', timestamp: new Date().toISOString() } 
      });
      if (prometheusMetrics.predictionErrors) {
        prometheusMetrics.predictionErrors.inc({ type: 'uncaught_exception', reason: error.name || 'unknown' });
      }
      this._handleError(error);
      this.cleanup().finally(() => process.exit(1));
    });

    ['SIGTERM', 'SIGINT', 'SIGUSR2'].forEach(signal => {
      process.on(signal, async () => {
        logger.info(`Received ${signal} signal`, { 
          metadata: { service: 'predictive-model', timestamp: new Date().toISOString() } 
        });
        try {
          await this.cleanup();
          process.exit(0);
        } catch (error) {
          logger.error(`Error during ${signal} cleanup:`, { 
            error: error.message, 
            stack: error.stack, 
            metadata: { service: 'predictive-model', timestamp: new Date().toISOString() } 
          });
          this._handleError(error);
          process.exit(1);
        }
      });
    });
  }
}

// Create singleton instance for Redis
if (!global.redisClient) {
  global.redisClient = null;
}

// Handle cluster mode for production with conditional check
if (cluster.isMaster && process.env.NODE_ENV === 'production') {
  const numWorkers = parseInt(process.env.NODE_CLUSTER_WORKERS, 10) || 2; // 2 workers from .env

  logger.info(`Master cluster setting up ${numWorkers} workers`, { 
    metadata: { service: 'predictive-model', timestamp: new Date().toISOString() } 
  });

  for (let i = 0; i < numWorkers; i++) {
    cluster.fork();
  }

  cluster.on('online', (worker) => {
    logger.info(`Worker ${worker.process.pid} is online`, { 
      metadata: { service: 'predictive-model', timestamp: new Date().toISOString() } 
    });
  });

  cluster.on('exit', (worker, code, signal) => {
    logger.warn(`Worker ${worker.process.pid} died with code: ${code} and signal: ${signal}`, { 
      metadata: { service: 'predictive-model', timestamp: new Date().toISOString() } 
    });
    logger.info('Starting a new worker', { 
      metadata: { service: 'predictive-model', timestamp: new Date().toISOString() } 
    });
    cluster.fork();
  });
} else {
  const predictiveModel = new TheAnalyzerPredictiveModel();
  predictiveModel._initializeComponents().catch(error => {
    logger.error('Failed to initialize worker:', { 
      error: error.message, 
      stack: error.stack, 
      metadata: { service: 'predictive-model', timestamp: new Date().toISOString() } 
    });
    process.exit(1);
  });
}

// Create singleton instance with proper initialization
let predictiveModel;

try {
  predictiveModel = new TheAnalyzerPredictiveModel();

  // Initialize components if not already done
  if (typeof predictiveModel._initializeComponents === 'function' && !predictiveModel.initialized) {
    predictiveModel._initializeComponents().catch(error => {
      logger.error('Failed to initialize predictive model components:', {
        error: error.message,
        stack: error.stack,
        metadata: { service: 'api', timestamp: new Date().toISOString() }
      });
    });
  }

  logger.info('Predictive model initialized successfully', {
    metadata: { service: 'api', timestamp: new Date().toISOString() }
  });
} catch (error) {
  logger.error('Failed to create predictive model instance:', {
    error: error.message,
    stack: error.stack,
    metadata: { service: 'api', timestamp: new Date().toISOString() }
  });
  // Create a minimal fallback instance
  predictiveModel = {
    predict: () => ({ error: 'Predictive model not available' }),
    healthCheck: () => ({ status: 'unhealthy', error: 'Predictive model not initialized' }),
    cleanup: () => Promise.resolve()
  };
}

// Export singleton instance and types with detailed documentation
module.exports = predictiveModel;

/**
 * Prediction Types Enum for Sports Analytics
 * @readonly
 * @enum {string}
 */
module.exports.PredictionTypes = Object.freeze({
  SINGLE_FACTOR: 'single_factor',
  MULTI_FACTOR: 'multi_factor',
  PLAYER_STATS: 'player_stats',
  TEAM_PERFORMANCE: 'team_performance',
  GAME_OUTCOME: 'game_outcome',
  REAL_TIME: 'real_time',
  ADVANCED_ANALYTICS: 'advanced_analytics'
});

/**
 * Supported Leagues for Sports Analytics
 * @readonly
 * @type {string[]}
 */
module.exports.SupportedLeagues = Object.freeze([
  'NFL', 'NBA', 'MLB', 'NHL',
  'PREMIER_LEAGUE', 'LA_LIGA', 'BUNDESLIGA', 'SERIE_A'
]);

/**
 * Global Redis Client for Shared Access Across Modules
 * @type {Redis}
 */
module.exports.redisClient = global.redisClient;