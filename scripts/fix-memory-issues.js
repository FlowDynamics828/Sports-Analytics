// scripts/fix-memory-issues.js - Advanced memory management fix

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const os = require('os');

// ANSI color codes for better readability
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m'
};

console.log(`${colors.bright}${colors.cyan}Sports Analytics - Advanced Memory Management Fix${colors.reset}`);
console.log(`${colors.cyan}=============================================${colors.reset}\n`);

async function main() {
  try {
    // 1. Update .env file with memory management settings
    console.log(`${colors.bright}Updating memory management settings in .env...${colors.reset}`);
    
    const envPath = path.join(process.cwd(), '.env');
    
    if (fs.existsSync(envPath)) {
      let envContent = fs.readFileSync(envPath, 'utf8');
      
      // Add or update memory management settings
      const memorySettings = `
# Memory Management - Enhanced settings
MEMORY_USAGE_THRESHOLD=0.85
MEMORY_CHECK_INTERVAL=300000
CACHE_MAX_ITEMS=250
CACHE_TTL=1800
CACHE_CHECK_PERIOD=300
ENABLE_AGGRESSIVE_GC=true
ENABLE_PERFORMANCE_LOGGING=false
NODE_OPTIONS=--max-old-space-size=4096
`;
      
      if (envContent.includes('# Memory Management')) {
        // Find and replace existing memory management section
        const memoryStart = envContent.indexOf('# Memory Management');
        let memoryEnd = envContent.indexOf('#', memoryStart + 1);
        if (memoryEnd === -1) memoryEnd = envContent.length;
        
        envContent = envContent.slice(0, memoryStart) + memorySettings + envContent.slice(memoryEnd);
      } else {
        // Add new memory management settings
        envContent += memorySettings;
      }
      
      fs.writeFileSync(envPath, envContent);
      console.log(`${colors.green}✓ Updated .env with memory management settings${colors.reset}`);
    } else {
      // Create new .env file
      const newEnvContent = `
# Memory Management - Enhanced settings
MEMORY_USAGE_THRESHOLD=0.85
MEMORY_CHECK_INTERVAL=300000
CACHE_MAX_ITEMS=250
CACHE_TTL=1800
CACHE_CHECK_PERIOD=300
ENABLE_AGGRESSIVE_GC=true
ENABLE_PERFORMANCE_LOGGING=false
NODE_OPTIONS=--max-old-space-size=4096
`;
      fs.writeFileSync(envPath, newEnvContent);
      console.log(`${colors.green}✓ Created new .env file with memory management settings${colors.reset}`);
    }
    
    // 2. Create memory optimization utility
    console.log(`\n${colors.bright}Creating memory optimization utility...${colors.reset}`);
    
    const scriptsDir = path.join(process.cwd(), 'scripts');
    if (!fs.existsSync(scriptsDir)) {
      fs.mkdirSync(scriptsDir, { recursive: true });
      console.log(`${colors.green}✓ Created scripts directory${colors.reset}`);
    }
    
    const memoryUtilPath = path.join(scriptsDir, 'memoryManager.js');
    const memoryUtilContent = `// scripts/memoryManager.js - Memory optimization utility

const os = require('os');
const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');

// Try to import winston for logging, but provide fallback if unavailable
let winston;
try {
  winston = require('winston');
} catch (error) {
  // Fallback console-based logger
  winston = {
    createLogger: () => ({
      info: console.log,
      warn: console.warn,
      error: console.error,
      debug: console.debug
    })
  };
}

class MemoryManager extends EventEmitter {
  constructor(options = {}) {
    super();
    
    // Configure options with defaults
    this.options = {
      threshold: parseFloat(process.env.MEMORY_USAGE_THRESHOLD || '0.85'),
      checkInterval: parseInt(process.env.MEMORY_CHECK_INTERVAL || '300000'),
      logLevel: process.env.LOG_LEVEL || 'info',
      enableAggressiveGC: process.env.ENABLE_AGGRESSIVE_GC === 'true',
      logPerformance: process.env.ENABLE_PERFORMANCE_LOGGING === 'true',
      ...options
    };
    
    // Initialize logger
    this.logger = winston.createLogger({
      level: this.options.logLevel,
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
      defaultMeta: { service: 'memory-manager' },
      transports: [
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
          )
        })
      ]
    });
    
    // Create logs directory if it doesn't exist
    const logsDir = path.join(process.cwd(), 'logs');
    try {
      if (!fs.existsSync(logsDir)) {
        fs.mkdirSync(logsDir);
      }
      this.logger.add(new winston.transports.File({
        filename: path.join(logsDir, 'memory-manager.log')
      }));
    } catch (err) {
      this.logger.warn(\`Could not create logs directory: \${err.message}\`);
    }
    
    // Initialize state
    this.isRunning = false;
    this.checkIntervalId = null;
    this.history = [];
    this.lastOptimization = null;
    this.gcCount = 0;
    
    // Attempt to detect Node.js using --expose-gc flag
    this.gcAvailable = typeof global.gc === 'function';
    if (!this.gcAvailable) {
      this.logger.warn('Manual garbage collection unavailable. Run Node.js with --expose-gc flag for better memory management');
    }
    
    this.logger.info('MemoryManager initialized', {
      threshold: this.options.threshold,
      checkInterval: this.options.checkInterval,
      enableAggressiveGC: this.options.enableAggressiveGC,
      gcAvailable: this.gcAvailable
    });
  }
  
  // Start monitoring memory
  start() {
    if (this.isRunning) {
      this.logger.warn('MemoryManager is already running');
      return this;
    }
    
    this.isRunning = true;
    
    // Initial memory check
    this.checkMemory();
    
    // Schedule regular checks
    this.checkIntervalId = setInterval(() => {
      this.checkMemory();
    }, this.options.checkInterval);
    
    this.logger.info('MemoryManager started', {
      checkInterval: this.options.checkInterval
    });
    
    return this;
  }
  
  // Stop monitoring memory
  stop() {
    if (!this.isRunning) {
      this.logger.warn('MemoryManager is not running');
      return this;
    }
    
    if (this.checkIntervalId) {
      clearInterval(this.checkIntervalId);
      this.checkIntervalId = null;
    }
    
    this.isRunning = false;
    this.logger.info('MemoryManager stopped');
    
    return this;
  }
  
  // Check current memory usage
  checkMemory() {
    const memoryUsage = process.memoryUsage();
    const systemMemory = this.getSystemMemory();
    
    // Calculate usage ratios
    const heapRatio = memoryUsage.heapUsed / memoryUsage.heapTotal;
    const systemRatio = (systemMemory.total - systemMemory.free) / systemMemory.total;
    
    // Format memory values for logging (in MB)
    const heapUsedMB = Math.round(memoryUsage.heapUsed / (1024 * 1024));
    const heapTotalMB = Math.round(memoryUsage.heapTotal / (1024 * 1024));
    const rssUsedMB = Math.round(memoryUsage.rss / (1024 * 1024));
    
    // Log memory usage if performance logging is enabled
    if (this.options.logPerformance) {
      this.logger.info('Memory usage', {
        heap: {
          used: heapUsedMB,
          total: heapTotalMB,
          percentage: Math.round(heapRatio * 100)
        },
        rss: rssUsedMB,
        system: {
          used: Math.round((systemMemory.total - systemMemory.free) / (1024 * 1024)),
          total: Math.round(systemMemory.total / (1024 * 1024)),
          percentage: Math.round(systemRatio * 100)
        }
      });
    }
    
    // Record history
    this.history.push({
      timestamp: new Date(),
      heap: {
        used: heapUsedMB,
        total: heapTotalMB,
        ratio: heapRatio
      },
      rss: rssUsedMB
    });
    
    // Keep only the last 50 entries
    if (this.history.length > 50) {
      this.history.shift();
    }
    
    // Check if memory usage exceeds threshold
    if (heapRatio > this.options.threshold) {
      this.logger.warn(\`High memory usage detected: \${Math.round(heapRatio * 100)}% of heap used (\${heapUsedMB}MB / \${heapTotalMB}MB)\`);
      
      // Perform memory optimization
      this.optimizeMemory();
      
      // Emit high memory event
      this.emit('high-memory', {
        heap: {
          used: heapUsedMB,
          total: heapTotalMB,
          percentage: Math.round(heapRatio * 100)
        },
        rss: rssUsedMB
      });
    }
    
    return {
      heapUsed: heapUsedMB,
      heapTotal: heapTotalMB,
      heapRatio,
      rss: rssUsedMB
    };
  }
  
  // Optimize memory usage
  optimizeMemory() {
    const startTime = process.hrtime();
    this.logger.info('Starting memory optimization');
    
    // Record memory before optimization
    const beforeMemory = process.memoryUsage();
    const beforeHeapUsedMB = Math.round(beforeMemory.heapUsed / (1024 * 1024));
    
    // 1. Clear module caches for non-essential modules if aggressive GC is enabled
    if (this.options.enableAggressiveGC) {
      this.clearModuleCache();
    }
    
    // 2. Force garbage collection if available
    if (this.gcAvailable) {
      try {
        global.gc();
        this.gcCount++;
        this.logger.info('Garbage collection triggered');
      } catch (error) {
        this.logger.error(\`Error triggering garbage collection: \${error.message}\`);
      }
    }
    
    // Record memory after optimization
    const afterMemory = process.memoryUsage();
    const afterHeapUsedMB = Math.round(afterMemory.heapUsed / (1024 * 1024));
    const savedMB = beforeHeapUsedMB - afterHeapUsedMB;
    
    // Calculate duration
    const [seconds, nanoseconds] = process.hrtime(startTime);
    const duration = seconds + nanoseconds / 1e9;
    
    this.lastOptimization = {
      timestamp: new Date(),
      before: beforeHeapUsedMB,
      after: afterHeapUsedMB,
      saved: savedMB,
      duration
    };
    
    this.logger.info(\`Memory optimization completed in \${duration.toFixed(2)}s\`, {
      before: beforeHeapUsedMB,
      after: afterHeapUsedMB,
      saved: savedMB,
      gcCount: this.gcCount
    });
    
    // Emit optimization event
    this.emit('optimization', this.lastOptimization);
    
    return this.lastOptimization;
  }
  
  // Clear module cache for non-essential modules
  clearModuleCache() {
    const essentialModules = [
      'fs', 'path', 'os', 'http', 'https', 'net', 'events',
      'stream', 'util', 'winston', 'dotenv'
    ];
    
    let cleared = 0;
    
    Object.keys(require.cache).forEach(moduleId => {
      const isEssential = essentialModules.some(name => 
        moduleId.includes(\`/node_modules/\${name}/\`) || 
        moduleId.includes(\`\\\\\${name}\\\\\`) ||
        moduleId.includes(\`/\${name}/\`)
      );
      
      if (!isEssential && !moduleId.includes('node_modules')) {
        delete require.cache[moduleId];
        cleared++;
      }
    });
    
    this.logger.info(\`Cleared \${cleared} module caches\`);
    return cleared;
  }
  
  // Get history of memory usage
  getHistory() {
    return this.history;
  }
  
  // Get system memory information
  getSystemMemory() {
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    
    return {
      total: totalMemory,
      free: freeMemory,
      used: totalMemory - freeMemory,
      usedPercentage: ((totalMemory - freeMemory) / totalMemory) * 100
    };
  }
  
  // Get summary of memory manager status
  getStatus() {
    return {
      isRunning: this.isRunning,
      options: this.options,
      gcAvailable: this.gcAvailable,
      gcCount: this.gcCount,
      lastOptimization: this.lastOptimization,
      currentMemory: this.checkMemory(),
      systemMemory: this.getSystemMemory()
    };
  }
}

// Export memory manager
module.exports = MemoryManager;

// If run directly, start the memory manager
if (require.main === module) {
  const memoryManager = new MemoryManager();
  memoryManager.start();
  
  console.log('Memory Manager started. Press Ctrl+C to exit.');
  
  process.on('SIGINT', () => {
    console.log('Stopping Memory Manager...');
    memoryManager.stop();
    process.exit(0);
  });
}
`;
    
    fs.writeFileSync(memoryUtilPath, memoryUtilContent);
    console.log(`${colors.green}✓ Created memory optimization utility${colors.reset}`);
    
    // 3. Update startup.js (or create it if it doesn't exist)
    console.log(`\n${colors.bright}Updating startup.js with memory management...${colors.reset}`);
    
    const startupPath = path.join(process.cwd(), 'startup.js');
    const startupContent = `// startup.js - Entry point with memory management

require('dotenv').config();

// Initialize the memory manager at the very beginning
const MemoryManager = require('./scripts/memoryManager');
const memoryManager = new MemoryManager();
memoryManager.start();

// Store a reference to the memory manager globally
global.memoryManager = memoryManager;

// Check if garbage collection is available
if (typeof global.gc !== 'function') {
  console.warn(
    'Warning: Manual garbage collection is not available. ' +
    'Run Node.js with --expose-gc flag for better memory management.'
  );
}

// Import and start the main application
const app = require('./api');

// Handle process termination
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully');
  memoryManager.stop();
  await app.cleanup();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully');
  memoryManager.stop();
  await app.cleanup();
  process.exit(0);
});

// Handle uncaught exceptions
process.on('uncaughtException', async (error) => {
  console.error('Uncaught exception:', error);
  memoryManager.stop();
  await app.cleanup();
  process.exit(1);
});

// Handle unhandled rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled rejection at:', promise, 'reason:', reason);
});

console.log('Application started with memory management');
`;
    
    // Create or update startup.js
    fs.writeFileSync(startupPath, startupContent);
    console.log(`${colors.green}✓ Updated startup.js with memory management${colors.reset}`);
    
    // 4. Update package.json with optimized scripts
    console.log(`\n${colors.bright}Updating package.json with optimized scripts...${colors.reset}`);
    
    const packageJsonPath = path.join(process.cwd(), 'package.json');
    
    if (fs.existsSync(packageJsonPath)) {
      try {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
        
        // Add or update scripts
        if (!packageJson.scripts) {
          packageJson.scripts = {};
        }
        
        // Determine optimal memory limit based on system resources
        const totalMemoryGB = Math.round(os.totalmem() / (1024 * 1024 * 1024));
        let memoryLimit = 4096; // Default 4GB
        
        if (totalMemoryGB < 4) {
          memoryLimit = 1024; // 1GB for systems with < 4GB RAM
        } else if (totalMemoryGB < 8) {
          memoryLimit = 2048; // 2GB for systems with < 8GB RAM
        } else if (totalMemoryGB < 16) {
          memoryLimit = 4096; // 4GB for systems with < 16GB RAM
        } else {
          memoryLimit = 8192; // 8GB for systems with >= 16GB RAM
        }
        
        // Add or update scripts
        packageJson.scripts['start:optimized'] = \`node --max-old-space-size=\${memoryLimit} --expose-gc startup.js\`;
        packageJson.scripts['optimize:memory'] = 'node scripts/memoryManager.js';
        packageJson.scripts['fix:memory'] = 'node scripts/fix-memory-issues.js';
        packageJson.scripts['fix:redis'] = 'node scripts/fix-redis-connection.js';
        packageJson.scripts['fix:python'] = 'node scripts/fix-python-timeout.js';
        packageJson.scripts['fix:all'] = 'node scripts/fix-all-issues.js';
        packageJson.scripts['diagnose'] = 'node scripts/quick-diagnose.js';
        
        fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
        console.log(`${colors.green}✓ Updated package.json with optimized scripts${colors.reset}`);
        console.log(`${colors.green}✓ Set memory limit to ${memoryLimit}MB based on system resources${colors.reset}`);
      } catch (error) {
        console.log(`${colors.red}✗ Error updating package.json: ${error.message}${colors.reset}`);
      }
    } else {
      console.log(`${colors.yellow}⚠ package.json not found${colors.reset}`);
    }
    
    // 5. System memory analysis
    console.log(`\n${colors.bright}System memory analysis:${colors.reset}`);
    
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const totalMemoryGB = (totalMemory / (1024 * 1024 * 1024)).toFixed(2);
    const freeMemoryGB = (freeMemory / (1024 * 1024 * 1024)).toFixed(2);
    const memoryUsagePercent = ((totalMemory - freeMemory) / totalMemory * 100).toFixed(2);
    
    console.log(`Total memory: ${totalMemoryGB} GB`);
    console.log(`Free memory: ${freeMemoryGB} GB`);
    console.log(`Memory usage: ${memoryUsagePercent}%`);
    
    console.log(`\n${colors.bright}${colors.green}Memory management fixes completed successfully!${colors.reset}`);
    console.log(`${colors.bright}Now try running your application with: npm run start:optimized${colors.reset}`);
  } catch (error) {
    console.error(`${colors.red}Error fixing memory management issues: ${error.message}${colors.reset}`);
    process.exit(1);
  }
}

main();