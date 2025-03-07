// scripts/fix-memory-issues.js - Fix memory management issues

require('dotenv').config();
const fs = require('fs');
const path = require('path');
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
    new winston.transports.File({ filename: 'logs/fix-memory-issues.log' })
  ]
});

// Ensure logs directory exists
try {
  if (!fs.existsSync('logs')) {
    fs.mkdirSync('logs');
  }
} catch (error) {
  console.error('Error creating logs directory:', error);
}

// Main function
async function main() {
  logger.info('Starting memory management fix...');

  // 1. Update .env file with memory management settings
  try {
    const envPath = path.join(process.cwd(), '.env');
    if (fs.existsSync(envPath)) {
      let envContent = fs.readFileSync(envPath, 'utf8');
      
      // Add or update memory management settings
      const memorySettings = `
# Memory Management
MEMORY_USAGE_THRESHOLD=0.85
CACHE_MAX_ITEMS=250
CACHE_CHECK_PERIOD=300
ENABLE_AGGRESSIVE_GC=true
ENABLE_PERFORMANCE_LOGGING=false`;
      
      // Check if memory management settings already exist
      if (envContent.includes('# Memory Management')) {
        // Find the memory management section
        const memorySettingsStart = envContent.indexOf('# Memory Management');
        const memorySettingsEnd = envContent.indexOf('#', memorySettingsStart + 1);
        
        if (memorySettingsEnd !== -1) {
          // Replace the entire memory management section
          envContent = envContent.slice(0, memorySettingsStart) + memorySettings + '\n\n' + envContent.slice(memorySettingsEnd);
        } else {
          // Replace until the end of the file
          envContent = envContent.slice(0, memorySettingsStart) + memorySettings;
        }
      } else {
        // Add new memory management settings
        envContent += '\n' + memorySettings + '\n';
      }
      
      fs.writeFileSync(envPath, envContent);
      logger.info('Updated memory management settings in .env file');
    } else {
      logger.warn('.env file not found');
    }
  } catch (error) {
    logger.error(`Error updating .env file: ${error.message}`);
  }

  // 2. Create optimize-memory.js script
  try {
    const optimizeMemoryPath = path.join(process.cwd(), 'scripts', 'optimize-memory.js');
    
    // Create scripts directory if it doesn't exist
    if (!fs.existsSync(path.join(process.cwd(), 'scripts'))) {
      fs.mkdirSync(path.join(process.cwd(), 'scripts'), { recursive: true });
    }
    
    // Create optimize-memory.js script
    const optimizeMemoryContent = `// scripts/optimize-memory.js - Memory optimization script

require('dotenv').config();
const winston = require('winston');
const os = require('os');

// Configure logging
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ level, message, timestamp }) => {
      return \`\${timestamp} \${level}: \${message}\`;
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
    
    logger.info(\`Memory usage: \${usagePercentage}% (\${heapUsedMB}MB / \${heapTotalMB}MB)\`);
    
    // Check if memory usage exceeds threshold
    if (memoryRatio > threshold) {
      logger.warn(\`High memory usage detected: \${usagePercentage}% of heap used (\${heapUsedMB}MB / \${heapTotalMB}MB)\`);
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
    
    logger.info(\`Memory optimization completed in \${duration.toFixed(2)}s\`);
    logger.info(\`Memory usage after optimization: \${usagePercentage}% (\${heapUsedMB}MB / \${heapTotalMB}MB)\`);
    
    // Calculate memory saved
    const savedPercentage = Math.round((currentUsage - memoryRatio) * 100);
    if (savedPercentage > 0) {
      logger.info(\`Memory optimization saved \${savedPercentage}% of heap usage\`);
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
        moduleId.includes(\`/node_modules/\${name}/\`) || 
        moduleId.includes(\`\\\\\${name}\\\\\`) ||
        moduleId.includes(\`/\${name}/\`)
      );
      
      if (!isEssential && !moduleId.includes('node_modules')) {
        delete require.cache[moduleId];
        cleared++;
      }
    });
    
    logger.info(\`Cleared \${cleared} module caches\`);
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
    
    logger.info(\`Cleared \${cleared} global caches\`);
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
  logger.info(\`System memory: \${systemMemory.used}MB used of \${systemMemory.total}MB total (\${systemMemory.percentage}%)\`);
  
  // Exit after optimization
  setTimeout(() => {
    logger.info('Memory optimization completed');
    process.exit(0);
  }, 2000);
}`;
    
    fs.writeFileSync(optimizeMemoryPath, optimizeMemoryContent);
    logger.info('Created optimize-memory.js script');
  } catch (error) {
    logger.error(`Error creating optimize-memory.js script: ${error.message}`);
  }

  // 3. Update package.json with memory optimization scripts
  try {
    const packageJsonPath = path.join(process.cwd(), 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      
      // Add memory optimization scripts
      if (!packageJson.scripts) {
        packageJson.scripts = {};
      }
      
      // Add or update scripts
      packageJson.scripts['optimize:memory'] = 'node scripts/optimize-memory.js';
      packageJson.scripts['start:optimized'] = 'node --max-old-space-size=4096 --expose-gc startup.js';
      
      // Write updated package.json
      fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
      logger.info('Updated package.json with memory optimization scripts');
    } else {
      logger.warn('package.json not found');
    }
  } catch (error) {
    logger.error(`Error updating package.json: ${error.message}`);
  }

  // 4. Analyze system memory resources
  try {
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const totalMemoryGB = (totalMemory / (1024 * 1024 * 1024)).toFixed(2);
    const freeMemoryGB = (freeMemory / (1024 * 1024 * 1024)).toFixed(2);
    const memoryUsagePercent = ((totalMemory - freeMemory) / totalMemory * 100).toFixed(2);
    
    logger.info(`System memory analysis:`);
    logger.info(`Total memory: ${totalMemoryGB} GB`);
    logger.info(`Free memory: ${freeMemoryGB} GB`);
    logger.info(`Memory usage: ${memoryUsagePercent}%`);
    
    // Determine optimal Node.js memory limit based on system resources
    let recommendedMemoryLimit = 4096; // Default: 4GB
    
    if (totalMemory < 4 * 1024 * 1024 * 1024) {
      // Less than 4GB total memory
      recommendedMemoryLimit = 1024; // 1GB
    } else if (totalMemory < 8 * 1024 * 1024 * 1024) {
      // 4-8GB total memory
      recommendedMemoryLimit = 2048; // 2GB
    } else if (totalMemory < 16 * 1024 * 1024 * 1024) {
      // 8-16GB total memory
      recommendedMemoryLimit = 4096; // 4GB
    } else {
      // More than 16GB total memory
      recommendedMemoryLimit = 8192; // 8GB
    }
    
    logger.info(`Recommended Node.js memory limit: ${recommendedMemoryLimit}MB`);
    
    // Update start:optimized script with recommended memory limit
    const packageJsonPath = path.join(process.cwd(), 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      
      if (packageJson.scripts && packageJson.scripts['start:optimized']) {
        packageJson.scripts['start:optimized'] = `node --max-old-space-size=${recommendedMemoryLimit} --expose-gc startup.js`;
        
        // Write updated package.json
        fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
        logger.info(`Updated start:optimized script with memory limit of ${recommendedMemoryLimit}MB`);
      }
    }
  } catch (error) {
    logger.error(`Error analyzing system memory resources: ${error.message}`);
  }

  logger.info('Memory management fix completed successfully');
}

// Run the main function
main().catch(error => {
  logger.error(`Error in fix-memory-issues.js: ${error.message}`);
  logger.error(error.stack);
  process.exit(1);
});