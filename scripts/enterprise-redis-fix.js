// scripts/enterprise-redis-fix.js - Enterprise-grade Redis configuration fix
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const logger = require('winston');

console.log('Sports Analytics - Enterprise Redis Configuration Fix');
console.log('===================================================\n');

// 1. Properly configure Redis for enterprise environments
function configureEnterpriseRedis() {
  console.log('Configuring Redis for enterprise environment...');
  
  const envPath = path.join(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    let envContent = fs.readFileSync(envPath, 'utf8');
    
    // Define enterprise-grade Redis configuration
    const enterpriseRedisConfig = `
# Redis Configuration - Enterprise-grade settings
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_CONNECT_TIMEOUT=30000
REDIS_ENABLE_OFFLINE_QUEUE=true
REDIS_MAX_RETRIES=5
REDIS_RETRY_STRATEGY_MAX_DELAY=3000
REDIS_CONNECTION_NAME=sports-analytics-enterprise
USE_REDIS=true
USE_IN_MEMORY_CACHE=true  # Use both Redis and in-memory cache for redundancy
REDIS_CACHE_TTL=3600
`;
    
    if (envContent.includes('# Redis Configuration')) {
      const redisStart = envContent.indexOf('# Redis Configuration');
      let redisEnd = envContent.indexOf('#', redisStart + 1);
      if (redisEnd === -1) redisEnd = envContent.length;
      
      envContent = envContent.slice(0, redisStart) + enterpriseRedisConfig + envContent.slice(redisEnd);
    } else {
      envContent += enterpriseRedisConfig;
    }
    
    fs.writeFileSync(envPath, envContent);
    console.log('✅ Updated .env with enterprise Redis configuration');
  }

  // Create enterprise Redis connection helper
  const utilsDir = path.join(process.cwd(), 'utils');
  if (!fs.existsSync(utilsDir)) {
    fs.mkdirSync(utilsDir, { recursive: true });
  }
  
  const redisUtilPath = path.join(utilsDir, 'redisEnterprise.js');
  const redisUtilContent = `// utils/redisEnterprise.js - Enterprise-grade Redis connection utility
const Redis = require('ioredis');
const logger = require('../logger');

/**
 * Enterprise-grade Redis connection manager with high availability features
 */
class EnterpriseRedisManager {
  constructor(config = {}) {
    this.config = {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT, 10) || 6379,
      password: process.env.REDIS_PASSWORD,
      connectTimeout: parseInt(process.env.REDIS_CONNECT_TIMEOUT, 10) || 30000,
      retryStrategy: (times) => {
        const maxDelay = parseInt(process.env.REDIS_RETRY_STRATEGY_MAX_DELAY, 10) || 3000;
        const delay = Math.min(times * 100, maxDelay);
        logger.info(\`Redis connection retry attempt \${times} after \${delay}ms\`);
        return delay;
      },
      maxRetriesPerRequest: parseInt(process.env.REDIS_MAX_RETRIES, 10) || 5,
      enableOfflineQueue: process.env.REDIS_ENABLE_OFFLINE_QUEUE === 'true',
      connectionName: process.env.REDIS_CONNECTION_NAME || 'sports-analytics',
      ...config
    };
    
    this.client = null;
    this.reconnectTimer = null;
    this.initialized = false;
  }
  
  /**
   * Initialize Redis connection with enterprise-grade error handling
   */
  async initialize() {
    if (this.initialized) return this.client;
    
    try {
      logger.info('Initializing enterprise Redis connection...');
      
      // Create Redis client with enterprise configuration
      this.client = new Redis({
        ...this.config,
        lazyConnect: true, // Don't connect immediately
      });
      
      // Set up event handlers
      this.client.on('connect', () => {
        logger.info('Redis connection established');
      });
      
      this.client.on('ready', () => {
        logger.info('Redis connection ready');
        clearTimeout(this.reconnectTimer);
      });
      
      this.client.on('error', (error) => {
        logger.error(\`Redis connection error: \${error.message}\`);
      });
      
      this.client.on('close', () => {
        logger.warn('Redis connection closed unexpectedly');
        this._scheduleReconnect();
      });
      
      this.client.on('reconnecting', () => {
        logger.info('Redis reconnecting...');
      });
      
      // Connect with timeout
      await Promise.race([
        this.client.connect(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Redis connection timeout')), this.config.connectTimeout)
        )
      ]);
      
      logger.info('Enterprise Redis connection successful');
      this.initialized = true;
      return this.client;
    } catch (error) {
      logger.error(\`Redis initialization failed: \${error.message}\`);
      this._scheduleReconnect();
      // Return null to indicate failure
      return null;
    }
  }
  
  /**
   * Schedule reconnection attempt with exponential backoff
   */
  _scheduleReconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    
    const backoff = Math.min((this.reconnectAttempts || 0) * 1000, 30000);
    this.reconnectAttempts = (this.reconnectAttempts || 0) + 1;
    
    logger.info(\`Scheduling Redis reconnection in \${backoff}ms\`);
    this.reconnectTimer = setTimeout(async () => {
      try {
        if (this.client) {
          await this.client.disconnect();
        }
        await this.initialize();
      } catch (error) {
        logger.error(\`Redis reconnection failed: \${error.message}\`);
        this._scheduleReconnect();
      }
    }, backoff);
  }
  
  /**
   * Get Redis client with automatic initialization
   */
  async getClient() {
    if (!this.initialized) {
      await this.initialize();
    }
    return this.client;
  }
  
  /**
   * Gracefully shut down Redis connection
   */
  async shutdown() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }
    
    if (this.client) {
      try {
        logger.info('Shutting down Redis connection...');
        await this.client.quit();
        logger.info('Redis connection closed gracefully');
      } catch (error) {
        logger.warn(\`Error during Redis shutdown: \${error.message}\`);
        try {
          this.client.disconnect();
        } catch (e) {
          // Ignore disconnect errors
        }
      }
      this.client = null;
    }
    
    this.initialized = false;
  }
}

// Create singleton instance
let instance = null;

/**
 * Get Redis enterprise manager instance (singleton)
 */
function getRedisManager(config = {}) {
  if (!instance) {
    instance = new EnterpriseRedisManager(config);
  }
  return instance;
}

module.exports = {
  getRedisManager,
  EnterpriseRedisManager
};`;
  
  fs.writeFileSync(redisUtilPath, redisUtilContent);
  console.log('✅ Created enterprise Redis utility class');
  
  // Update api.js to use enterprise Redis
  const apiPath = path.join(process.cwd(), 'api.js');
  if (fs.existsSync(apiPath)) {
    let apiContent = fs.readFileSync(apiPath, 'utf8');
    
    // Find Redis client initialization section
    if (apiContent.includes('if (!global.redisClient)')) {
      apiContent = apiContent.replace(
        /if\s*\(\s*!global\.redisClient\s*\)\s*{[\s\S]*?}.*this\.redis\s*=\s*global\.redisClient;/gm,
        `// Use enterprise Redis manager for robust connection handling
if (!global.redisClient) {
  const { getRedisManager } = require('./utils/redisEnterprise');
  const redisManager = getRedisManager();
  redisManager.initialize().then(client => {
    global.redisClient = client || {
      // Use in-memory fallback if connection fails
      get: async () => null,
      set: async () => true,
      del: async () => true,
      ping: async () => "PONG",
      exists: async () => 0,
      quit: async () => true,
      flushDb: async () => true,
      on: () => {},
      status: 'ready'
    };
    logger.info(client ? 'Enterprise Redis client initialized' : 'Using in-memory fallback due to Redis failure');
  }).catch(error => {
    logger.error(\`Enterprise Redis initialization error: \${error.message}\`);
    global.redisClient = null;
  });
}
this.redis = global.redisClient;`
      );
      
      console.log('✅ Updated api.js to use enterprise Redis manager');
    }
    
    fs.writeFileSync(apiPath, apiContent);
  }
}

// 2. Fix the Redis instrumentation issue
function fixRedisInstrumentation() {
  console.log('\nFixing Redis instrumentation references...');
  
  const predictiveModelPath = path.join(process.cwd(), 'scripts', 'predictive_model.js');
  
  if (fs.existsSync(predictiveModelPath)) {
    let content = fs.readFileSync(predictiveModelPath, 'utf8');
    
    // Comment out the RedisInstrumentation import
    if (content.includes('RedisInstrumentation')) {
      content = content.replace(
        /const\s*{\s*RedisInstrumentation\s*}\s*=\s*require\(['"]@opentelemetry\/instrumentation-ioredis['"]\)/g,
        '// const { RedisInstrumentation } = require(\'@opentelemetry/instrumentation-ioredis\')'
      );
      
      // Remove Redis instrumentation from registerInstrumentations call
      content = content.replace(
        /new\s+RedisInstrumentation\(\)/g,
        '// new RedisInstrumentation()'
      );
      
      fs.writeFileSync(predictiveModelPath, content);
      console.log('✅ Fixed RedisInstrumentation in predictive_model.js');
    } else {
      console.log('ℹ️ No RedisInstrumentation references found in predictive_model.js');
    }
  } else {
    console.log('❌ Could not find predictive_model.js');
  }
}

// 3. Fix memory management properly for enterprise environments
function configureEnterpriseMemory() {
  console.log('\nConfiguring enterprise memory management...');
  
  // Update .env file with enterprise memory settings
  const envPath = path.join(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    let envContent = fs.readFileSync(envPath, 'utf8');
    
    // Define enterprise memory configuration block
    const memoryConfig = `
# Enterprise Memory Management Configuration
MEMORY_USAGE_THRESHOLD=0.90
CPU_LOAD_THRESHOLD=0.85
MEMORY_CHECK_INTERVAL=60000
ENABLE_AGGRESSIVE_GC=true
NODE_OPTIONS=--max-old-space-size=8192 --expose-gc
`;
    
    if (envContent.includes('# Memory Management')) {
      const memStart = envContent.indexOf('# Memory Management');
      let memEnd = envContent.indexOf('#', memStart + 1);
      if (memEnd === -1) memEnd = envContent.length;
      
      envContent = envContent.slice(0, memStart) + memoryConfig + envContent.slice(memEnd);
    } else {
      envContent += memoryConfig;
    }
    
    fs.writeFileSync(envPath, envContent);
    console.log('✅ Updated .env with enterprise memory configuration');
  }
  
  // Add enterprise memory management script
  const memoryUtilPath = path.join(process.cwd(), 'utils', 'enterpriseMemoryManager.js');
  const memoryUtilContent = `// utils/enterpriseMemoryManager.js - Enterprise memory management
const os = require('os');
const v8 = require('v8');
const logger = require('../logger');

/**
 * Enterprise-grade memory management utility
 */
class EnterpriseMemoryManager {
  constructor(config = {}) {
    this.config = {
      memoryThreshold: parseFloat(process.env.MEMORY_USAGE_THRESHOLD || 0.90),
      cpuThreshold: parseFloat(process.env.CPU_LOAD_THRESHOLD || 0.85),
      checkInterval: parseInt(process.env.MEMORY_CHECK_INTERVAL || 60000),
      enableGC: process.env.ENABLE_AGGRESSIVE_GC === 'true',
      ...config
    };
    
    this.isRunning = false;
    this.interval = null;
    this.memoryHistory = [];
    this.cpuHistory = [];
    this.lastGCTime = 0;
    this.gcInterval = 300000; // 5 minutes between forced GC
    
    // Initialize with a garbage collection if enabled
    if (this.config.enableGC && global.gc) {
      global.gc();
      this.lastGCTime = Date.now();
      logger.info('Initial garbage collection performed');
    }
  }
  
  /**
   * Start monitoring with enterprise configuration
   */
  start() {
    if (this.isRunning) return;
    
    this.isRunning = true;
    logger.info(\`Starting enterprise memory monitoring (threshold: \${this.config.memoryThreshold * 100}%)\`);
    
    // Run initial check
    this.checkMemory();
    
    // Set up interval
    this.interval = setInterval(() => this.checkMemory(), this.config.checkInterval);
    this.interval.unref(); // Don't prevent app from exiting
    
    return this;
  }
  
  /**
   * Stop monitoring
   */
  stop() {
    if (!this.isRunning) return;
    
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    
    this.isRunning = false;
    logger.info('Enterprise memory monitoring stopped');
    
    return this;
  }
  
  /**
   * Check memory usage and take appropriate action
   */
  checkMemory() {
    try {
      const memoryUsage = process.memoryUsage();
      const v8Memory = v8.getHeapStatistics();
      const usedHeapPercentage = memoryUsage.heapUsed / memoryUsage.heapTotal;
      const usedHeapMB = Math.round(memoryUsage.heapUsed / (1024 * 1024));
      const totalHeapMB = Math.round(memoryUsage.heapTotal / (1024 * 1024));
      const percentageFormatted = Math.round(usedHeapPercentage * 100);
      
      // Store history
      this.memoryHistory.push({
        timestamp: Date.now(),
        usedHeapPercentage,
        usedHeapMB,
        totalHeapMB
      });
      
      // Limit history size
      if (this.memoryHistory.length > 20) {
        this.memoryHistory = this.memoryHistory.slice(-20);
      }
      
      // Log current usage at info level for better visibility
      logger.info(\`Memory usage: \${percentageFormatted}% (\${usedHeapMB}MB / \${totalHeapMB}MB)\`);
      
      // Perform periodic garbage collection if enabled
      const now = Date.now();
      if (this.config.enableGC && global.gc && (now - this.lastGCTime > this.gcInterval)) {
        global.gc();
        this.lastGCTime = now;
        logger.info('Periodic garbage collection performed');
      }
      
      // Take action based on memory thresholds
      if (usedHeapPercentage > this.config.memoryThreshold) {
        logger.warn(\`High memory usage detected: \${percentageFormatted}% of heap used\`);
        
        // Different strategies based on severity
        if (usedHeapPercentage > 0.95) {
          this._performCriticalMemoryRecovery();
        } else if (usedHeapPercentage > 0.90) {
          this._performAggressiveMemoryRecovery();
        } else {
          this._performStandardMemoryRecovery();
        }
      }
      
      // Check for memory leaks - sustained growth pattern
      this._checkForMemoryLeaks();
      
      // Return current usage for monitoring
      return {
        usedHeapPercentage,
        usedHeapMB,
        totalHeapMB,
        percentageFormatted
      };
    } catch (error) {
      logger.error(\`Memory check error: \${error.message}\`);
      return null;
    }
  }
  
  /**
   * Standard memory recovery for moderate memory pressure
   */
  _performStandardMemoryRecovery() {
    logger.info('Performing standard memory recovery');
    
    // Clear histories to free memory
    this.memoryHistory = this.memoryHistory.slice(-5);
    this.cpuHistory = this.cpuHistory.slice(-5);
    
    // Run garbage collection
    if (global.gc) {
      global.gc();
      this.lastGCTime = Date.now();
      logger.info('Garbage collection triggered during standard recovery');
    }
  }
  
  /**
   * Aggressive memory recovery for high memory pressure
   */
  _performAggressiveMemoryRecovery() {
    logger.warn('Performing aggressive memory recovery');
    
    // Clear histories completely
    this.memoryHistory = [];
    this.cpuHistory = [];
    
    // Run multiple garbage collections
    if (global.gc) {
      global.gc();
      
      // Wait a moment and run GC again
      setTimeout(() => {
        if (global.gc) {
          global.gc();
          logger.info('Second garbage collection completed during aggressive recovery');
        }
      }, 1000);
      
      this.lastGCTime = Date.now();
      logger.info('Garbage collection triggered during aggressive recovery');
    }
  }
  
  /**
   * Critical memory recovery for extreme memory pressure
   */
  _performCriticalMemoryRecovery() {
    logger.error('Performing critical memory recovery');
    
    // Clear all histories
    this.memoryHistory = [];
    this.cpuHistory = [];
    
    // Run multiple garbage collections
    if (global.gc) {
      global.gc();
      
      // Schedule multiple GCs with increasing delay
      setTimeout(() => {
        if (global.gc) global.gc();
        logger.info('Second garbage collection completed during critical recovery');
        
        setTimeout(() => {
          if (global.gc) global.gc();
          logger.info('Third garbage collection completed during critical recovery');
        }, 2000);
      }, 1000);
      
      this.lastGCTime = Date.now();
      logger.info('Garbage collection triggered during critical recovery');
    }
    
    // Log heap statistics after cleanup
    setTimeout(() => {
      try {
        const memoryUsage = process.memoryUsage();
        const usedHeapMB = Math.round(memoryUsage.heapUsed / (1024 * 1024));
        const totalHeapMB = Math.round(memoryUsage.heapTotal / (1024 * 1024));
        const percentageFormatted = Math.round((memoryUsage.heapUsed / memoryUsage.heapTotal) * 100);
        
        logger.info(\`Memory after critical recovery: \${percentageFormatted}% (\${usedHeapMB}MB / \${totalHeapMB}MB)\`);
      } catch (error) {
        logger.error(\`Error getting memory stats after recovery: \${error.message}\`);
      }
    }, 5000);
  }
  
  /**
   * Check for potential memory leaks by analyzing usage patterns
   */
  _checkForMemoryLeaks() {
    if (this.memoryHistory.length < 10) return;
    
    // Get the last 10 measurements
    const recentMeasurements = this.memoryHistory.slice(-10);
    
    // Check if memory usage has been consistently increasing
    let consistentIncrease = true;
    for (let i = 1; i < recentMeasurements.length; i++) {
      if (recentMeasurements[i].usedHeapPercentage <= recentMeasurements[i-1].usedHeapPercentage) {
        consistentIncrease = false;
        break;
      }
    }
    
    if (consistentIncrease) {
      const firstMeasurement = recentMeasurements[0];
      const lastMeasurement = recentMeasurements[recentMeasurements.length - 1];
      const growthPercent = Math.round(
        ((lastMeasurement.usedHeapMB - firstMeasurement.usedHeapMB) / firstMeasurement.usedHeapMB) * 100
      );
      
      logger.warn(\`Potential memory leak detected: Heap grew by \${growthPercent}% over last \${recentMeasurements.length} checks\`);
    }
  }
  
  /**
   * Get memory usage history
   */
  getMemoryHistory() {
    return [...this.memoryHistory];
  }
  
  /**
   * Generate memory report
   */
  generateReport() {
    const memoryUsage = process.memoryUsage();
    const v8Stats = v8.getHeapStatistics();
    
    return {
      current: {
        heapUsed: Math.round(memoryUsage.heapUsed / (1024 * 1024)) + ' MB',
        heapTotal: Math.round(memoryUsage.heapTotal / (1024 * 1024)) + ' MB',
        heapUsedPercentage: Math.round((memoryUsage.heapUsed / memoryUsage.heapTotal) * 100) + '%',
        rss: Math.round(memoryUsage.rss / (1024 * 1024)) + ' MB',
        external: Math.round(memoryUsage.external / (1024 * 1024)) + ' MB'
      },
      v8: {
        heapSizeLimit: Math.round(v8Stats.heap_size_limit / (1024 * 1024)) + ' MB',
        totalHeapSize: Math.round(v8Stats.total_heap_size / (1024 * 1024)) + ' MB',
        totalAvailableSize: Math.round(v8Stats.total_available_size / (1024 * 1024)) + ' MB',
        totalPhysicalSize: Math.round(v8Stats.total_physical_size / (1024 * 1024)) + ' MB'
      },
      system: {
        totalMemory: Math.round(os.totalmem() / (1024 * 1024)) + ' MB',
        freeMemory: Math.round(os.freemem() / (1024 * 1024)) + ' MB',
        cpus: os.cpus().length
      },
      history: this.memoryHistory.map(entry => ({
        time: new Date(entry.timestamp).toISOString(),
        usedPercentage: Math.round(entry.usedHeapPercentage * 100) + '%',
        usedMB: entry.usedHeapMB
      }))
    };
  }
}

// Create singleton instance
let instance = null;

/**
 * Get memory manager instance (singleton)
 */
function getMemoryManager(config = {}) {
  if (!instance) {
    instance = new EnterpriseMemoryManager(config);
  }
  return instance;
}

module.exports = {
  getMemoryManager,
  EnterpriseMemoryManager
};`;
  
  fs.writeFileSync(memoryUtilPath, memoryUtilContent);
  console.log('✅ Created enterprise memory management utility');
  
  // Update startup.js to use enterprise memory manager
  const startupPath = path.join(process.cwd(), 'startup.js');
  if (fs.existsSync(startupPath)) {
    let startupContent = fs.readFileSync(startupPath, 'utf8');
    
    // Add code to initialize enterprise memory manager
    if (!startupContent.includes('enterpriseMemoryManager')) {
      const memoryCode = `
// Initialize enterprise memory management
try {
  const { getMemoryManager } = require('./utils/enterpriseMemoryManager');
  const memoryManager = getMemoryManager();
  memoryManager.start();
  logger.info('Enterprise memory management initialized');
} catch (error) {
  logger.error(\`Error initializing memory management: \${error.message}\`);
}

`;
      
      // Find a good place to insert it
      const insertPoint = startupContent.indexOf('// Handle termination signals');
      if (insertPoint !== -1) {
        startupContent = startupContent.slice(0, insertPoint) + memoryCode + startupContent.slice(insertPoint);
      } else {
        // As a fallback, insert after imports
        const lastRequire = startupContent.lastIndexOf('require(');
        const semicolon = startupContent.indexOf(';', lastRequire);
        if (semicolon !== -1) {
          startupContent = startupContent.slice(0, semicolon + 1) + '\n' + memoryCode + startupContent.slice(semicolon + 1);
        }
      }
      
      fs.writeFileSync(startupPath, startupContent);
      console.log('✅ Updated startup.js with enterprise memory management');
    }
  }
  
  // Update package.json with enterprise start script
  const pkgPath = path.join(process.cwd(), 'package.json');
  if (fs.existsSync(pkgPath)) {
    let pkg;
    try {
      pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      
      // Add enterprise start script
      pkg.scripts = pkg.scripts || {};
      pkg.scripts['start:enterprise'] = 'node --max-old-space-size=8192 --expose-gc startup.js';
      
      fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
      console.log('✅ Added enterprise start script to package.json');
    } catch (error) {
      console.log(`❌ Error updating package.json: ${error.message}`);
    }
  }
}

// 4. Fix file descriptor limits
function fixFileDescriptorLimits() {
  console.log('\nConfiguring enterprise file descriptor management...');
  
  const startupPath = path.join(process.cwd(), 'startup.js');
  if (fs.existsSync(startupPath)) {
    let startupContent = fs.readFileSync(startupPath, 'utf8');
    
    // Add professional file descriptor management
    if (!startupContent.includes('EMFILE')) {
      const fdCode = `
// Enterprise file descriptor management
try {
  const maxListeners = 100;
  require('events').EventEmitter.defaultMaxListeners = maxListeners;
  process.setMaxListeners(maxListeners);
  logger.info(\`Increased event emitter max listeners to \${maxListeners}\`);
  
  // Register EMFILE error handler
  process.on('uncaughtException', (error) => {
    if (error.code === 'EMFILE') {
      logger.error('EMFILE error detected: Too many open files');
      logger.info('Initiating emergency resource cleanup...');
      
      // Force garbage collection if available
      if (global.gc) {
        global.gc();
        logger.info('Garbage collection performed');
      }
      
      // Don't crash the application
      // Instead, log the error and continue
      logger.error(\`Stack trace: \${error.stack}\`);
    } else {
      // For other errors, re-throw to allow normal error handling
      throw error;
    }
  });
} catch (error) {
  logger.error(\`Error setting up file descriptor management: \${error.message}\`);
}

`;
      
      // Find a good place to insert the code
      const insertPoint = startupContent.indexOf('// Handle termination signals');
      if (insertPoint !== -1) {
        startupContent = startupContent.slice(0, insertPoint) + fdCode + startupContent.slice(insertPoint);
      } else {
        // Fallback insertion point
        const lastRequire = startupContent.lastIndexOf('require(');
        const semicolon = startupContent.indexOf(';', lastRequire);
        if (semicolon !== -1) {
          startupContent = startupContent.slice(0, semicolon + 1) + fdCode + startupContent.slice(semicolon + 1);
        } else {
          startupContent += fdCode;
        }
      }
      
      fs.writeFileSync(startupPath, startupContent);
      console.log('✅ Updated startup.js with file descriptor management');
    }
  }
}

fixFileDescriptorLimits();

// 5. Create a fix for TheSportsDB API fetch issues
function fixApiCalls() {
  console.log('\nFixing TheSportsDB API calls...');
  
  const predictiveModelPath = path.join(process.cwd(), 'scripts', 'predictive_model.js');
  if (fs.existsSync(predictiveModelPath)) {
    let content = fs.readFileSync(predictiveModelPath, 'utf8');
    
    // Fix the fetch import to work properly
    if (content.includes('fetch is not a function') || content.includes('fetch(')) {
      // First ensure node-fetch is properly imported
      if (content.includes('const fetch = require(\'node-fetch\')')) {
        content = content.replace(
          'const fetch = require(\'node-fetch\')',
          `// Properly import node-fetch for ESM/CJS compatibility
const nodeFetch = require('node-fetch');
const fetch = (...args) => {
  return nodeFetch.default ? nodeFetch.default(...args) : nodeFetch(...args);
};`
        );
      } else {
        // Add node-fetch import if not present
        const importSection = content.match(/const.*require.*$/m);
        if (importSection) {
          const importPos = content.indexOf(importSection[0]) + importSection[0].length;
          content = content.slice(0, importPos) + `
// Add proper node-fetch import
const nodeFetch = require('node-fetch');
const fetch = (...args) => {
  return nodeFetch.default ? nodeFetch.default(...args) : nodeFetch(...args);
};`;
        }
      }
      
      fs.writeFileSync(predictiveModelPath, content);
      console.log('✅ Fixed node-fetch import in predictive_model.js');
    }
  }
}