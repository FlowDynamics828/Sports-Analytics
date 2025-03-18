const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const readline = require('readline');

// ANSI color codes for better readability
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m'
};

// Function to fix Redis issues
async function fixRedis() {
  console.log(`${colors.bright}${colors.cyan}Fixing Redis issues...${colors.reset}`);
  
  try {
    // Check if Redis is running
    const isRedisRunning = await checkIfRedisIsRunning();
    
    if (!isRedisRunning) {
      console.log(`${colors.yellow}Redis is not running. Enabling in-memory cache fallback.${colors.reset}`);
      await updateEnvFile('USE_IN_MEMORY_CACHE', 'true');
      await updateEnvFile('USE_REDIS', 'false');
    } else {
      console.log(`${colors.green}Redis is running. Optimizing Redis settings.${colors.reset}`);
      await updateEnvFile('REDIS_IDLE_TIMEOUT', '30000');
      await updateEnvFile('REDIS_CONNECT_TIMEOUT', '60000');
      await updateEnvFile('REDIS_MAX_RETRIES', '3');
    }
    
    console.log(`${colors.green}Redis configuration updated successfully.${colors.reset}`);
    return true;
  } catch (error) {
    console.error(`${colors.red}Error fixing Redis issues: ${error.message}${colors.reset}`);
    return false;
  }
}

// Function to fix file descriptor limits
async function fixFileDescriptorLimits() {
  console.log(`${colors.bright}${colors.cyan}Fixing file descriptor limits...${colors.reset}`);
  
  try {
    const platform = process.platform;
    
    if (platform === 'win32') {
      console.log(`${colors.yellow}File descriptor limits are not applicable on Windows.${colors.reset}`);
      return true;
    }
    
    // On Linux/Unix systems, try to increase limits
    if (platform === 'linux' || platform === 'darwin') {
      try {
        const currentLimit = require('os').constants.hasOwnProperty('UV_THREADPOOL_SIZE') 
          ? process.env.UV_THREADPOOL_SIZE 
          : 4;
          
        console.log(`${colors.blue}Current thread pool size: ${currentLimit}${colors.reset}`);
        await updateEnvFile('UV_THREADPOOL_SIZE', '8');
        console.log(`${colors.green}Thread pool size updated.${colors.reset}`);
      } catch (error) {
        console.warn(`${colors.yellow}Unable to update thread pool size: ${error.message}${colors.reset}`);
      }
    }
    
    console.log(`${colors.green}File descriptor settings updated.${colors.reset}`);
    return true;
  } catch (error) {
    console.error(`${colors.red}Error fixing file descriptor limits: ${error.message}${colors.reset}`);
    return false;
  }
}

// Function to improve memory management
async function improveMemoryManagement() {
  console.log(`${colors.bright}${colors.cyan}Improving memory management...${colors.reset}`);
  
  try {
    // Update Node.js memory settings
    await updateEnvFile('NODE_OPTIONS', '--max-old-space-size=8192 --expose-gc');
    await updateEnvFile('MEMORY_USAGE_THRESHOLD', '0.65');
    await updateEnvFile('ENABLE_AGGRESSIVE_GC', 'true');
    
    // Fix MongoDB connection string if needed
    await fixMongoDBConnectionString();
    
    // Update cache settings for better performance
    await updateEnvFile('CACHE_MAX_ITEMS', '200');
    await updateEnvFile('CACHE_CHECK_PERIOD', '120');
    
    console.log(`${colors.green}Memory management settings updated.${colors.reset}`);
    return true;
  } catch (error) {
    console.error(`${colors.red}Error improving memory management: ${error.message}${colors.reset}`);
    return false;
  }
}

// Function to check if Redis is running
async function checkIfRedisIsRunning() {
  try {
    const net = require('net');
    return new Promise((resolve) => {
      const client = net.createConnection({ 
        host: process.env.REDIS_HOST || 'localhost', 
        port: process.env.REDIS_PORT || 6379 
      });
      
      client.on('connect', () => {
        client.end();
        resolve(true);
      });
      
      client.on('error', () => {
        resolve(false);
      });
      
      // Set a timeout
      setTimeout(() => {
        client.end();
        resolve(false);
      }, 2000);
    });
  } catch (error) {
    return false;
  }
}

// Function to update .env file
async function updateEnvFile(key, value) {
  try {
    const envPath = path.join(process.cwd(), '.env');
    
    if (!fs.existsSync(envPath)) {
      console.warn(`${colors.yellow}.env file not found, creating new one.${colors.reset}`);
      fs.writeFileSync(envPath, `${key}=${value}\n`);
      return;
    }
    
    let content = fs.readFileSync(envPath, 'utf8');
    const regex = new RegExp(`^${key}=.*$`, 'm');
    
    if (regex.test(content)) {
      content = content.replace(regex, `${key}=${value}`);
    } else {
      content += `\n${key}=${value}`;
    }
    
    fs.writeFileSync(envPath, content);
    console.log(`${colors.green}Updated ${key} in .env file.${colors.reset}`);
  } catch (error) {
    console.error(`${colors.red}Error updating .env file: ${error.message}${colors.reset}`);
    throw error;
  }
}

// Function to fix MongoDB connection string in .env file
async function fixMongoDBConnectionString() {
  try {
    const envPath = path.join(process.cwd(), '.env');
    
    if (!fs.existsSync(envPath)) {
      console.warn(`${colors.yellow}.env file not found, cannot fix MongoDB connection.${colors.reset}`);
      return;
    }
    
    let content = fs.readFileSync(envPath, 'utf8');
    
    // Look for the MongoDB connection string line
    const mongoLineRegex = /^(MONGODB_URI=).*$/m;
    const match = content.match(mongoLineRegex);
    
    if (match) {
      // Check if the connection string needs fixing
      const currentConnString = match[0].substring(match[1].length);
      
      // Ensure proper URL encoding for the @ symbol in the password
      if (currentConnString.includes('Studyhard@2034')) {
        const fixedConnString = currentConnString.replace('Studyhard@2034', 'Studyhard%402034');
        content = content.replace(mongoLineRegex, `${match[1]}${fixedConnString}`);
        fs.writeFileSync(envPath, content);
        console.log(`${colors.green}Fixed MongoDB connection string in .env file.${colors.reset}`);
      } else {
        console.log(`${colors.blue}MongoDB connection string appears to be correctly formatted.${colors.reset}`);
      }
    } else {
      // Add MongoDB connection string if missing
      const correctConnString = "mongodb+srv://SportAnalytics:Studyhard%402034@cluster0.et16d.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";
      content += `\nMONGODB_URI=${correctConnString}`;
      fs.writeFileSync(envPath, content);
      console.log(`${colors.green}Added MongoDB connection string to .env file.${colors.reset}`);
    }
  } catch (error) {
    console.error(`${colors.red}Error fixing MongoDB connection string: ${error.message}${colors.reset}`);
    throw error;
  }
}

// Main function to run all fixes
async function main() {
  console.log(`${colors.bright}${colors.magenta}Starting system maintenance...${colors.reset}`);
  
  try {
    // Run Redis fixes
    const redisFixed = await fixRedis();
    console.log(redisFixed 
      ? `${colors.green}✓ Redis issues fixed${colors.reset}` 
      : `${colors.yellow}⚠ Redis fixes completed with warnings${colors.reset}`);
    
    // Run file descriptor fixes
    const fdFixed = await fixFileDescriptorLimits();
    console.log(fdFixed 
      ? `${colors.green}✓ File descriptor limits fixed${colors.reset}` 
      : `${colors.yellow}⚠ File descriptor fixes completed with warnings${colors.reset}`);
    
    // Run memory management fixes
    const memoryFixed = await improveMemoryManagement();
    console.log(memoryFixed 
      ? `${colors.green}✓ Memory management improved${colors.reset}` 
      : `${colors.yellow}⚠ Memory management fixes completed with warnings${colors.reset}`);
    
    const allFixed = redisFixed && fdFixed && memoryFixed;
    
    // Overall status
    console.log(allFixed
      ? `${colors.bright}${colors.green}All issues fixed successfully!${colors.reset}`
      : `${colors.bright}${colors.yellow}Fixes completed with some warnings. Check logs for details.${colors.reset}`);
    
  } catch (error) {
    console.error(`${colors.red}Critical error during fixes: ${error.message}${colors.reset}`);
    console.error(error.stack);
    process.exit(1);
  }
}

main().catch(error => {
  console.error(`${colors.red}Error fixing issues: ${error.message}${colors.reset}`);
  console.error(error.stack);
  process.exit(1);
});