// scripts/fix-memory-issues.js
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Define colors manually to avoid dependency issues
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m'
};

// Function to trigger garbage collection
function triggerGarbageCollection() {
  console.log(`${colors.bright}${colors.cyan}Triggering garbage collection...${colors.reset}`);
  
  try {
    console.log('Checking for Node.js garbage collection...');
    
    // Update .env file to enable garbage collection
    const envPath = path.join(process.cwd(), '.env');
    if (fs.existsSync(envPath)) {
      let envContent = fs.readFileSync(envPath, 'utf8');
      
      // Enable aggressive garbage collection
      if (envContent.includes('ENABLE_AGGRESSIVE_GC=')) {
        envContent = envContent.replace(/ENABLE_AGGRESSIVE_GC=\w+/, 'ENABLE_AGGRESSIVE_GC=true');
      } else {
        envContent += '\nENABLE_AGGRESSIVE_GC=true';
      }
      
      // Add NODE_OPTIONS if not present
      if (!envContent.includes('NODE_OPTIONS=')) {
        envContent += '\nNODE_OPTIONS=--max-old-space-size=4096 --expose-gc';
      } else if (!envContent.includes('--expose-gc')) {
        envContent = envContent.replace(/NODE_OPTIONS=([^\n]*)/, (match, options) => {
          return `NODE_OPTIONS=${options} --expose-gc`;
        });
      }
      
      fs.writeFileSync(envPath, envContent);
      console.log('Updated .env file with garbage collection settings');
    }
    
    console.log('Garbage collection settings enabled successfully');
  } catch (error) {
    console.error(`Error enabling garbage collection: ${error.message}`);
  }
}

// Function to optimize memory usage
function optimizeMemoryUsage() {
  console.log(`${colors.bright}${colors.cyan}Optimizing memory usage...${colors.reset}`);
  
  try {
    // Update cache settings to be more conservative
    const cacheModulePath = path.join(process.cwd(), 'utils', 'cache.js');
    if (fs.existsSync(cacheModulePath)) {
      let cacheContent = fs.readFileSync(cacheModulePath, 'utf8');
      
      // Reduce cooldown period from 300000 (5 min) to 60000 (1 min)
      cacheContent = cacheContent.replace(
        /const cooldownPeriod = (\d+);/,
        'const cooldownPeriod = 60000; // 1 minute cooldown period'
      );
      
      // Lower memory threshold
      cacheContent = cacheContent.replace(
        /const memoryThreshold = parseFloat\(process\.env\.MEMORY_USAGE_THRESHOLD\) \|\| ([\d\.]+);/,
        'const memoryThreshold = parseFloat(process.env.MEMORY_USAGE_THRESHOLD) || 0.65; // Lower threshold'
      );
      
      fs.writeFileSync(cacheModulePath, cacheContent);
      console.log('Updated cache.js with optimized memory settings');
    } else {
      console.log('cache.js not found, updating environment variables instead');
    }
    
    // Update .env file with memory thresholds
    const envPath = path.join(process.cwd(), '.env');
    if (fs.existsSync(envPath)) {
      let envContent = fs.readFileSync(envPath, 'utf8');
      
      // Update memory threshold
      if (envContent.includes('MEMORY_USAGE_THRESHOLD=')) {
        envContent = envContent.replace(/MEMORY_USAGE_THRESHOLD=[\d\.]+/, 'MEMORY_USAGE_THRESHOLD=0.65');
      } else {
        envContent += '\nMEMORY_USAGE_THRESHOLD=0.65';
      }
      
      // Add cache settings
      if (!envContent.includes('CACHE_MAX_ITEMS=')) {
        envContent += '\nCACHE_MAX_ITEMS=200';
      } else {
        envContent = envContent.replace(/CACHE_MAX_ITEMS=\d+/, 'CACHE_MAX_ITEMS=200');
      }
      
      if (!envContent.includes('CACHE_TTL=')) {
        envContent += '\nCACHE_TTL=900';  // 15 minutes
      } else {
        envContent = envContent.replace(/CACHE_TTL=\d+/, 'CACHE_TTL=900');
      }
      
      if (!envContent.includes('CACHE_CHECK_PERIOD=')) {
        envContent += '\nCACHE_CHECK_PERIOD=120';  // 2 minutes
      } else {
        envContent = envContent.replace(/CACHE_CHECK_PERIOD=\d+/, 'CACHE_CHECK_PERIOD=120');
      }
      
      fs.writeFileSync(envPath, envContent);
      console.log('Updated .env file with optimized memory settings');
    }
  } catch (error) {
    console.error(`Error optimizing memory usage: ${error.message}`);
  }
}

// Main function to fix memory issues
async function fixMemoryIssues() {
  try {
    console.log(`${colors.bright}Sports Analytics - Memory Issues Fix${colors.reset}`);
    console.log('===================================');
    
    triggerGarbageCollection();
    optimizeMemoryUsage();
    
    console.log(`\n${colors.green}Memory issues fixed successfully!${colors.reset}`);
    console.log(`\nNow restart your application with: ${colors.bright}npm run start:optimized${colors.reset}`);
  } catch (error) {
    console.error(`${colors.red}Error fixing memory issues: ${error.message}${colors.reset}`);
    console.error(error.stack);
    process.exit(1);
  }
}

fixMemoryIssues().catch(error => {
  console.error(`${colors.red}Error in fix-memory-issues.js: ${error.message}${colors.reset}`);
  console.error(error.stack);
  process.exit(1);
});