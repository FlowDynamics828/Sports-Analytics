// scripts/diagnose-system.js - Comprehensive system diagnostic tool

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { spawn, execSync } = require('child_process');
const os = require('os');
const net = require('net');

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

// Print header
console.log(`${colors.bright}${colors.cyan}Sports Analytics - System Diagnostic Tool${colors.reset}`);
console.log(`${colors.cyan}===========================================${colors.reset}\n`);

// Track overall status
let overallStatus = true;

// Function to check if a file exists
function checkFile(filePath, required = true) {
  const exists = fs.existsSync(filePath);
  const status = exists ? `${colors.green}OK${colors.reset}` : (required ? `${colors.red}MISSING${colors.reset}` : `${colors.yellow}MISSING${colors.reset}`);
  
  console.log(`  ${filePath}: ${status}`);
  
  if (required && !exists) {
    overallStatus = false;
  }
  
  return exists;
}

// Function to check Python installation
async function checkPython() {
  console.log(`\n${colors.bright}Checking Python Installation:${colors.reset}`);
  
  // Get Python path from environment variables
  const pythonPath = process.env.PYTHON_PATH || process.env.PYTHON_EXECUTABLE || 'python';
  console.log(`  Python path: ${pythonPath}`);
  
  try {
    // Test Python execution
    const pythonProcess = spawn(pythonPath, ['-c', 'import sys; print(f"Python {sys.version}")']);
    
    return new Promise((resolve) => {
      let output = '';
      let errorOutput = '';
      
      pythonProcess.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      pythonProcess.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });
      
      pythonProcess.on('close', (code) => {
        if (code === 0) {
          console.log(`  Python version: ${colors.green}${output.trim()}${colors.reset}`);
          
          // Check for required packages
          checkPythonPackages(pythonPath);
          resolve(true);
        } else {
          console.log(`  Python execution: ${colors.red}FAILED${colors.reset}`);
          console.log(`  Error: ${errorOutput}`);
          overallStatus = false;
          resolve(false);
        }
      });
      
      pythonProcess.on('error', (error) => {
        console.log(`  Python execution: ${colors.red}ERROR${colors.reset}`);
        console.log(`  Error: ${error.message}`);
        overallStatus = false;
        resolve(false);
      });
      
      // Set timeout
      setTimeout(() => {
        pythonProcess.kill();
        console.log(`  Python execution: ${colors.red}TIMEOUT${colors.reset}`);
        overallStatus = false;
        resolve(false);
      }, 5000);
    });
  } catch (error) {
    console.log(`  Python execution: ${colors.red}ERROR${colors.reset}`);
    console.log(`  Error: ${error.message}`);
    overallStatus = false;
    return false;
  }
}

// Function to check Python packages
function checkPythonPackages(pythonPath) {
  console.log(`\n${colors.bright}Checking Python Packages:${colors.reset}`);
  
  const requiredPackages = [
    'numpy',
    'pandas',
    'scikit-learn',
    'xgboost',
    'lightgbm',
    'pymongo',
    'redis',
    'hyperopt'
  ];
  
  try {
    // Create a Python script to check packages
    const checkScript = `
import importlib.util
import sys

packages = ${JSON.stringify(requiredPackages)}
results = {}

for package in packages:
    try:
        spec = importlib.util.find_spec(package)
        if spec is None:
            results[package] = False
        else:
            module = importlib.import_module(package)
            version = getattr(module, '__version__', 'unknown')
            results[package] = version
    except Exception as e:
        results[package] = False

for package, version in results.items():
    if version:
        print(f"{package}: {version}")
    else:
        print(f"{package}: NOT FOUND")
`;
    
    // Write the script to a temporary file
    const tempScriptPath = path.join(os.tmpdir(), 'check_packages.py');
    fs.writeFileSync(tempScriptPath, checkScript);
    
    // Execute the script
    const output = execSync(`"${pythonPath}" "${tempScriptPath}"`).toString();
    
    // Parse the output
    const lines = output.trim().split('\n');
    for (const line of lines) {
      const [packageName, status] = line.split(': ');
      const isInstalled = status !== 'NOT FOUND';
      
      console.log(`  ${packageName}: ${isInstalled ? `${colors.green}${status}${colors.reset}` : `${colors.red}${status}${colors.reset}`}`);
      
      if (!isInstalled) {
        overallStatus = false;
      }
    }
    
    // Clean up temporary file
    fs.unlinkSync(tempScriptPath);
  } catch (error) {
    console.log(`  Package check: ${colors.red}ERROR${colors.reset}`);
    console.log(`  Error: ${error.message}`);
    overallStatus = false;
  }
}

// Function to check Redis connection
async function checkRedis() {
  console.log(`\n${colors.bright}Checking Redis Connection:${colors.reset}`);
  
  // Skip Redis check if USE_IN_MEMORY_CACHE is true
  if (process.env.USE_IN_MEMORY_CACHE === 'true') {
    console.log(`  Redis check: ${colors.yellow}SKIPPED (Using in-memory cache)${colors.reset}`);
    return true;
  }
  
  const redisHost = process.env.REDIS_HOST || 'localhost';
  const redisPort = parseInt(process.env.REDIS_PORT, 10) || 6379;
  
  console.log(`  Redis host: ${redisHost}`);
  console.log(`  Redis port: ${redisPort}`);
  
  try {
    // Check if Redis module is installed
    try {
      require.resolve('ioredis');
      console.log(`  Redis module: ${colors.green}INSTALLED${colors.reset}`);
    } catch (error) {
      console.log(`  Redis module: ${colors.red}NOT INSTALLED${colors.reset}`);
      console.log(`  Run 'npm install ioredis' to install the Redis module.`);
      overallStatus = false;
      return false;
    }
    
    // Check if Redis server is running
    const Redis = require('ioredis');
    const redis = new Redis({
      host: redisHost,
      port: redisPort,
      password: process.env.REDIS_PASSWORD || undefined,
      connectTimeout: 5000
    });
    
    return new Promise((resolve) => {
      redis.on('ready', () => {
        console.log(`  Redis connection: ${colors.green}OK${colors.reset}`);
        redis.quit();
        resolve(true);
      });
      
      redis.on('error', (error) => {
        console.log(`  Redis connection: ${colors.red}FAILED${colors.reset}`);
        console.log(`  Error: ${error.message}`);
        console.log(`  Recommendation: Enable in-memory cache by setting USE_IN_MEMORY_CACHE=true in .env`);
        redis.quit();
        overallStatus = false;
        resolve(false);
      });
      
      // Set timeout
      setTimeout(() => {
        console.log(`  Redis connection: ${colors.red}TIMEOUT${colors.reset}`);
        console.log(`  Recommendation: Enable in-memory cache by setting USE_IN_MEMORY_CACHE=true in .env`);
        redis.disconnect();
        overallStatus = false;
        resolve(false);
      }, 5000);
    });
  } catch (error) {
    console.log(`  Redis check: ${colors.red}ERROR${colors.reset}`);
    console.log(`  Error: ${error.message}`);
    overallStatus = false;
    return false;
  }
}

// Function to check MongoDB connection
async function checkMongoDB() {
  console.log(`\n${colors.bright}Checking MongoDB Connection:${colors.reset}`);
  
  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/sports-analytics';
  console.log(`  MongoDB URI: ${mongoUri.replace(/\/\/([^:]+):([^@]+)@/, '//***:***@')}`); // Hide credentials
  
  try {
    // Check if MongoDB module is installed
    try {
      require.resolve('mongodb');
      console.log(`  MongoDB module: ${colors.green}INSTALLED${colors.reset}`);
    } catch (error) {
      console.log(`  MongoDB module: ${colors.red}NOT INSTALLED${colors.reset}`);
      console.log(`  Run 'npm install mongodb' to install the MongoDB module.`);
      overallStatus = false;
      return false;
    }
    
    // Check MongoDB connection
    const { MongoClient } = require('mongodb');
    const client = new MongoClient(mongoUri, {
      connectTimeoutMS: 5000,
      serverSelectionTimeoutMS: 5000
    });
    
    try {
      await client.connect();
      await client.db().command({ ping: 1 });
      console.log(`  MongoDB connection: ${colors.green}OK${colors.reset}`);
      await client.close();
      return true;
    } catch (error) {
      console.log(`  MongoDB connection: ${colors.red}FAILED${colors.reset}`);
      console.log(`  Error: ${error.message}`);
      overallStatus = false;
      return false;
    }
  } catch (error) {
    console.log(`  MongoDB check: ${colors.red}ERROR${colors.reset}`);
    console.log(`  Error: ${error.message}`);
    overallStatus = false;
    return false;
  }
}

// Function to check port availability
async function checkPorts() {
  console.log(`\n${colors.bright}Checking Port Availability:${colors.reset}`);
  
  const httpPort = parseInt(process.env.PORT, 10) || 5050;
  const wsPort = parseInt(process.env.WS_PORT, 10) || 5150;
  
  console.log(`  HTTP port: ${httpPort}`);
  console.log(`  WebSocket port: ${wsPort}`);
  
  // Function to check if a port is available
  const isPortAvailable = (port) => {
    return new Promise((resolve) => {
      const server = net.createServer()
        .once('error', () => resolve(false))
        .once('listening', () => {
          server.once('close', () => resolve(true)).close();
        })
        .listen(port);
    });
  };
  
  // Check HTTP port
  const httpPortAvailable = await isPortAvailable(httpPort);
  console.log(`  HTTP port availability: ${httpPortAvailable ? `${colors.green}AVAILABLE${colors.reset}` : `${colors.red}IN USE${colors.reset}`}`);
  
  // Check WebSocket port
  const wsPortAvailable = await isPortAvailable(wsPort);
  console.log(`  WebSocket port availability: ${wsPortAvailable ? `${colors.green}AVAILABLE${colors.reset}` : `${colors.red}IN USE${colors.reset}`}`);
  
  if (!httpPortAvailable) {
    console.log(`  Recommendation: Change PORT in .env to an available port.`);
    overallStatus = false;
  }
  
  if (!wsPortAvailable) {
    console.log(`  Recommendation: Change WS_PORT in .env to an available port.`);
    overallStatus = false;
  }
  
  return httpPortAvailable && wsPortAvailable;
}

// Function to check system resources
function checkSystemResources() {
  console.log(`\n${colors.bright}Checking System Resources:${colors.reset}`);
  
  // Check memory
  const totalMemory = os.totalmem();
  const freeMemory = os.freemem();
  const totalMemoryGB = (totalMemory / (1024 * 1024 * 1024)).toFixed(2);
  const freeMemoryGB = (freeMemory / (1024 * 1024 * 1024)).toFixed(2);
  const memoryUsagePercent = ((totalMemory - freeMemory) / totalMemory * 100).toFixed(2);
  
  console.log(`  Total memory: ${totalMemoryGB} GB`);
  console.log(`  Free memory: ${freeMemoryGB} GB`);
  console.log(`  Memory usage: ${memoryUsagePercent}%`);
  
  // Check CPU
  const cpuCount = os.cpus().length;
  console.log(`  CPU cores: ${cpuCount}`);
  
  // Check disk space
  try {
    let diskInfo;
    if (process.platform === 'win32') {
      // Windows
      const drive = process.cwd().split(path.sep)[0];
      diskInfo = execSync(`wmic logicaldisk where "DeviceID='${drive}'" get Size,FreeSpace /format:csv`).toString();
      const lines = diskInfo.trim().split('\n');
      if (lines.length >= 2) {
        const values = lines[1].split(',');
        if (values.length >= 3) {
          const freeSpace = parseInt(values[1]) / (1024 * 1024 * 1024);
          const totalSpace = parseInt(values[2]) / (1024 * 1024 * 1024);
          console.log(`  Disk space (${drive}): ${freeSpace.toFixed(2)} GB free of ${totalSpace.toFixed(2)} GB`);
        }
      }
    } else {
      // Unix-like
      const df = execSync(`df -h "${process.cwd()}"`).toString();
      const lines = df.trim().split('\n');
      if (lines.length >= 2) {
        const values = lines[1].split(/\s+/);
        if (values.length >= 4) {
          console.log(`  Disk space: ${values[3]} free of ${values[1]}`);
        }
      }
    }
  } catch (error) {
    console.log(`  Disk space check: ${colors.red}ERROR${colors.reset}`);
    console.log(`  Error: ${error.message}`);
  }
  
  // Check for resource issues
  if (freeMemory < 500 * 1024 * 1024) { // Less than 500MB free
    console.log(`  ${colors.yellow}Warning: Low memory available. Performance may be affected.${colors.reset}`);
    console.log(`  Recommendation: Close other applications to free up memory.`);
    overallStatus = false;
  }
  
  if (cpuCount < 2) {
    console.log(`  ${colors.yellow}Warning: Limited CPU resources. Performance may be affected.${colors.reset}`);
    overallStatus = false;
  }
  
  return true;
}

// Function to check required files
function checkRequiredFiles() {
  console.log(`\n${colors.bright}Checking Required Files:${colors.reset}`);
  
  // Check main application files
  checkFile('api.js', true);
  checkFile('package.json', true);
  checkFile('.env', true);
  
  // Check scripts directory
  console.log(`\n  ${colors.bright}Scripts:${colors.reset}`);
  checkFile('scripts/predictive_model.py', true);
  
  // Check utils directory
  console.log(`\n  ${colors.bright}Utils:${colors.reset}`);
  checkFile('utils/pythonBridge.js', true);
  checkFile('utils/cache.js', true);
  checkFile('utils/db.js', true);
  checkFile('utils/websocket-server.js', true);
  checkFile('utils/metricsManager.js', false);
  checkFile('utils/rateLimiter.js', false);
  
  return true;
}

// Function to check Node.js version and modules
function checkNodeEnvironment() {
  console.log(`\n${colors.bright}Checking Node.js Environment:${colors.reset}`);
  
  // Check Node.js version
  const nodeVersion = process.version;
  console.log(`  Node.js version: ${nodeVersion}`);
  
  // Check npm version
  try {
    const npmVersion = execSync('npm -v').toString().trim();
    console.log(`  npm version: ${npmVersion}`);
  } catch (error) {
    console.log(`  npm version: ${colors.red}ERROR${colors.reset}`);
    console.log(`  Error: ${error.message}`);
  }
  
  // Check required modules
  console.log(`\n  ${colors.bright}Required modules:${colors.reset}`);
  const requiredModules = [
    'express',
    'mongodb',
    'ioredis',
    'ws',
    'winston',
    'dotenv',
    'async-lock',
    'opossum'
  ];
  
  for (const moduleName of requiredModules) {
    try {
      require.resolve(moduleName);
      console.log(`  ${moduleName}: ${colors.green}INSTALLED${colors.reset}`);
    } catch (error) {
      console.log(`  ${moduleName}: ${colors.red}NOT INSTALLED${colors.reset}`);
      console.log(`  Run 'npm install ${moduleName}' to install the module.`);
      overallStatus = false;
    }
  }
  
  return true;
}

// Main function
async function main() {
  try {
    // Check required files
    checkRequiredFiles();
    
    // Check Node.js environment
    checkNodeEnvironment();
    
    // Check Python installation
    await checkPython();
    
    // Check Redis connection
    await checkRedis();
    
    // Check MongoDB connection
    await checkMongoDB();
    
    // Check port availability
    await checkPorts();
    
    // Check system resources
    checkSystemResources();
    
    // Print overall status
    console.log(`\n${colors.bright}Overall Status:${colors.reset} ${overallStatus ? `${colors.green}PASS${colors.reset}` : `${colors.red}FAIL${colors.reset}`}`);
    
    if (!overallStatus) {
      console.log(`\n${colors.yellow}Recommendations:${colors.reset}`);
      console.log(`  1. Fix any issues marked as ${colors.red}FAILED${colors.reset} or ${colors.red}MISSING${colors.reset}`);
      console.log(`  2. Run 'node scripts/fix-python-path.js' to fix Python path issues`);
      console.log(`  3. Set USE_IN_MEMORY_CACHE=true in .env if Redis is not available`);
      console.log(`  4. Check for port conflicts and update PORT and WS_PORT in .env`);
      console.log(`  5. Run 'npm install' to install missing dependencies`);
    } else {
      console.log(`\n${colors.green}All checks passed. The system is ready to run.${colors.reset}`);
    }
  } catch (error) {
    console.error(`\n${colors.red}Error during diagnostics:${colors.reset} ${error.message}`);
    console.error(error.stack);
  }
}

// Run the main function
main().catch(error => {
  console.error(`\n${colors.red}Fatal error:${colors.reset} ${error.message}`);
  console.error(error.stack);
});// scripts/diagnose-system.js - Comprehensive system diagnostic tool

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { spawn, execSync } = require('child_process');
const os = require('os');
const net = require('net');

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

// Print header
console.log(`${colors.bright}${colors.cyan}Sports Analytics - System Diagnostic Tool${colors.reset}`);
console.log(`${colors.cyan}===========================================${colors.reset}\n`);

// Track overall status
let overallStatus = true;

// Function to check if a file exists
function checkFile(filePath, required = true) {
  const exists = fs.existsSync(filePath);
  const status = exists ? `${colors.green}OK${colors.reset}` : (required ? `${colors.red}MISSING${colors.reset}` : `${colors.yellow}MISSING${colors.reset}`);
  
  console.log(`  ${filePath}: ${status}`);
  
  if (required && !exists) {
    overallStatus = false;
  }
  
  return exists;
}

// Function to check Python installation
async function checkPython() {
  console.log(`\n${colors.bright}Checking Python Installation:${colors.reset}`);
  
  // Get Python path from environment variables
  const pythonPath = process.env.PYTHON_PATH || process.env.PYTHON_EXECUTABLE || 'python';
  console.log(`  Python path: ${pythonPath}`);
  
  try {
    // Test Python execution
    const pythonProcess = spawn(pythonPath, ['-c', 'import sys; print(f"Python {sys.version}")']);
    
    return new Promise((resolve) => {
      let output = '';
      let errorOutput = '';
      
      pythonProcess.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      pythonProcess.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });
      
      pythonProcess.on('close', (code) => {
        if (code === 0) {
          console.log(`  Python version: ${colors.green}${output.trim()}${colors.reset}`);
          
          // Check for required packages
          checkPythonPackages(pythonPath);
          resolve(true);
        } else {
          console.log(`  Python execution: ${colors.red}FAILED${colors.reset}`);
          console.log(`  Error: ${errorOutput}`);
          overallStatus = false;
          resolve(false);
        }
      });
      
      pythonProcess.on('error', (error) => {
        console.log(`  Python execution: ${colors.red}ERROR${colors.reset}`);
        console.log(`  Error: ${error.message}`);
        overallStatus = false;
        resolve(false);
      });
      
      // Set timeout
      setTimeout(() => {
        pythonProcess.kill();
        console.log(`  Python execution: ${colors.red}TIMEOUT${colors.reset}`);
        overallStatus = false;
        resolve(false);
      }, 5000);
    });
  } catch (error) {
    console.log(`  Python execution: ${colors.red}ERROR${colors.reset}`);
    console.log(`  Error: ${error.message}`);
    overallStatus = false;
    return false;
  }
}

// Function to check Python packages
function checkPythonPackages(pythonPath) {
  console.log(`\n${colors.bright}Checking Python Packages:${colors.reset}`);
  
  const requiredPackages = [
    'numpy',
    'pandas',
    'scikit-learn',
    'xgboost',
    'lightgbm',
    'pymongo',
    'redis',
    'hyperopt'
  ];
  
  try {
    // Create a Python script to check packages
    const checkScript = `
import importlib.util
import sys

packages = ${JSON.stringify(requiredPackages)}
results = {}

for package in packages:
    try:
        spec = importlib.util.find_spec(package)
        if spec is None:
            results[package] = False
        else:
            module = importlib.import_module(package)
            version = getattr(module, '__version__', 'unknown')
            results[package] = version
    except Exception as e:
        results[package] = False

for package, version in results.items():
    if version:
        print(f"{package}: {version}")
    else:
        print(f"{package}: NOT FOUND")
`;
    
    // Write the script to a temporary file
    const tempScriptPath = path.join(os.tmpdir(), 'check_packages.py');
    fs.writeFileSync(tempScriptPath, checkScript);
    
    // Execute the script
    const output = execSync(`"${pythonPath}" "${tempScriptPath}"`).toString();
    
    // Parse the output
    const lines = output.trim().split('\n');
    for (const line of lines) {
      const [packageName, status] = line.split(': ');
      const isInstalled = status !== 'NOT FOUND';
      
      console.log(`  ${packageName}: ${isInstalled ? `${colors.green}${status}${colors.reset}` : `${colors.red}${status}${colors.reset}`}`);
      
      if (!isInstalled) {
        overallStatus = false;
      }
    }
    
    // Clean up temporary file
    fs.unlinkSync(tempScriptPath);
  } catch (error) {
    console.log(`  Package check: ${colors.red}ERROR${colors.reset}`);
    console.log(`  Error: ${error.message}`);
    overallStatus = false;
  }
}

// Function to check Redis connection
async function checkRedis() {
  console.log(`\n${colors.bright}Checking Redis Connection:${colors.reset}`);
  
  // Skip Redis check if USE_IN_MEMORY_CACHE is true
  if (process.env.USE_IN_MEMORY_CACHE === 'true') {
    console.log(`  Redis check: ${colors.yellow}SKIPPED (Using in-memory cache)${colors.reset}`);
    return true;
  }
  
  const redisHost = process.env.REDIS_HOST || 'localhost';
  const redisPort = parseInt(process.env.REDIS_PORT, 10) || 6379;
  
  console.log(`  Redis host: ${redisHost}`);
  console.log(`  Redis port: ${redisPort}`);
  
  try {
    // Check if Redis module is installed
    try {
      require.resolve('ioredis');
      console.log(`  Redis module: ${colors.green}INSTALLED${colors.reset}`);
    } catch (error) {
      console.log(`  Redis module: ${colors.red}NOT INSTALLED${colors.reset}`);
      console.log(`  Run 'npm install ioredis' to install the Redis module.`);
      overallStatus = false;
      return false;
    }
    
    // Check if Redis server is running
    const Redis = require('ioredis');
    const redis = new Redis({
      host: redisHost,
      port: redisPort,
      password: process.env.REDIS_PASSWORD || undefined,
      connectTimeout: 5000
    });
    
    return new Promise((resolve) => {
      redis.on('ready', () => {
        console.log(`  Redis connection: ${colors.green}OK${colors.reset}`);
        redis.quit();
        resolve(true);
      });
      
      redis.on('error', (error) => {
        console.log(`  Redis connection: ${colors.red}FAILED${colors.reset}`);
        console.log(`  Error: ${error.message}`);
        console.log(`  Recommendation: Enable in-memory cache by setting USE_IN_MEMORY_CACHE=true in .env`);
        redis.quit();
        overallStatus = false;
        resolve(false);
      });
      
      // Set timeout
      setTimeout(() => {
        console.log(`  Redis connection: ${colors.red}TIMEOUT${colors.reset}`);
        console.log(`  Recommendation: Enable in-memory cache by setting USE_IN_MEMORY_CACHE=true in .env`);
        redis.disconnect();
        overallStatus = false;
        resolve(false);
      }, 5000);
    });
  } catch (error) {
    console.log(`  Redis check: ${colors.red}ERROR${colors.reset}`);
    console.log(`  Error: ${error.message}`);
    overallStatus = false;
    return false;
  }
}

// Function to check MongoDB connection
async function checkMongoDB() {
  console.log(`\n${colors.bright}Checking MongoDB Connection:${colors.reset}`);
  
  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/sports-analytics';
  console.log(`  MongoDB URI: ${mongoUri.replace(/\/\/([^:]+):([^@]+)@/, '//***:***@')}`); // Hide credentials
  
  try {
    // Check if MongoDB module is installed
    try {
      require.resolve('mongodb');
      console.log(`  MongoDB module: ${colors.green}INSTALLED${colors.reset}`);
    } catch (error) {
      console.log(`  MongoDB module: ${colors.red}NOT INSTALLED${colors.reset}`);
      console.log(`  Run 'npm install mongodb' to install the MongoDB module.`);
      overallStatus = false;
      return false;
    }
    
    // Check MongoDB connection
    const { MongoClient } = require('mongodb');
    const client = new MongoClient(mongoUri, {
      connectTimeoutMS: 5000,
      serverSelectionTimeoutMS: 5000
    });
    
    try {
      await client.connect();
      await client.db().command({ ping: 1 });
      console.log(`  MongoDB connection: ${colors.green}OK${colors.reset}`);
      await client.close();
      return true;
    } catch (error) {
      console.log(`  MongoDB connection: ${colors.red}FAILED${colors.reset}`);
      console.log(`  Error: ${error.message}`);
      overallStatus = false;
      return false;
    }
  } catch (error) {
    console.log(`  MongoDB check: ${colors.red}ERROR${colors.reset}`);
    console.log(`  Error: ${error.message}`);
    overallStatus = false;
    return false;
  }
}

// Function to check port availability
async function checkPorts() {
  console.log(`\n${colors.bright}Checking Port Availability:${colors.reset}`);
  
  const httpPort = parseInt(process.env.PORT, 10) || 5050;
  const wsPort = parseInt(process.env.WS_PORT, 10) || 5150;
  
  console.log(`  HTTP port: ${httpPort}`);
  console.log(`  WebSocket port: ${wsPort}`);
  
  // Function to check if a port is available
  const isPortAvailable = (port) => {
    return new Promise((resolve) => {
      const server = net.createServer()
        .once('error', () => resolve(false))
        .once('listening', () => {
          server.once('close', () => resolve(true)).close();
        })
        .listen(port);
    });
  };
  
  // Check HTTP port
  const httpPortAvailable = await isPortAvailable(httpPort);
  console.log(`  HTTP port availability: ${httpPortAvailable ? `${colors.green}AVAILABLE${colors.reset}` : `${colors.red}IN USE${colors.reset}`}`);
  
  // Check WebSocket port
  const wsPortAvailable = await isPortAvailable(wsPort);
  console.log(`  WebSocket port availability: ${wsPortAvailable ? `${colors.green}AVAILABLE${colors.reset}` : `${colors.red}IN USE${colors.reset}`}`);
  
  if (!httpPortAvailable) {
    console.log(`  Recommendation: Change PORT in .env to an available port.`);
    overallStatus = false;
  }
  
  if (!wsPortAvailable) {
    console.log(`  Recommendation: Change WS_PORT in .env to an available port.`);
    overallStatus = false;
  }
  
  return httpPortAvailable && wsPortAvailable;
}

// Function to check system resources
function checkSystemResources() {
  console.log(`\n${colors.bright}Checking System Resources:${colors.reset}`);
  
  // Check memory
  const totalMemory = os.totalmem();
  const freeMemory = os.freemem();
  const totalMemoryGB = (totalMemory / (1024 * 1024 * 1024)).toFixed(2);
  const freeMemoryGB = (freeMemory / (1024 * 1024 * 1024)).toFixed(2);
  const memoryUsagePercent = ((totalMemory - freeMemory) / totalMemory * 100).toFixed(2);
  
  console.log(`  Total memory: ${totalMemoryGB} GB`);
  console.log(`  Free memory: ${freeMemoryGB} GB`);
  console.log(`  Memory usage: ${memoryUsagePercent}%`);
  
  // Check CPU
  const cpuCount = os.cpus().length;
  console.log(`  CPU cores: ${cpuCount}`);
  
  // Check disk space
  try {
    let diskInfo;
    if (process.platform === 'win32') {
      // Windows
      const drive = process.cwd().split(path.sep)[0];
      diskInfo = execSync(`wmic logicaldisk where "DeviceID='${drive}'" get Size,FreeSpace /format:csv`).toString();
      const lines = diskInfo.trim().split('\n');
      if (lines.length >= 2) {
        const values = lines[1].split(',');
        if (values.length >= 3) {
          const freeSpace = parseInt(values[1]) / (1024 * 1024 * 1024);
          const totalSpace = parseInt(values[2]) / (1024 * 1024 * 1024);
          console.log(`  Disk space (${drive}): ${freeSpace.toFixed(2)} GB free of ${totalSpace.toFixed(2)} GB`);
        }
      }
    } else {
      // Unix-like
      const df = execSync(`df -h "${process.cwd()}"`).toString();
      const lines = df.trim().split('\n');
      if (lines.length >= 2) {
        const values = lines[1].split(/\s+/);
        if (values.length >= 4) {
          console.log(`  Disk space: ${values[3]} free of ${values[1]}`);
        }
      }
    }
  } catch (error) {
    console.log(`  Disk space check: ${colors.red}ERROR${colors.reset}`);
    console.log(`  Error: ${error.message}`);
  }
  
  // Check for resource issues
  if (freeMemory < 500 * 1024 * 1024) { // Less than 500MB free
    console.log(`  ${colors.yellow}Warning: Low memory available. Performance may be affected.${colors.reset}`);
    console.log(`  Recommendation: Close other applications to free up memory.`);
    overallStatus = false;
  }
  
  if (cpuCount < 2) {
    console.log(`  ${colors.yellow}Warning: Limited CPU resources. Performance may be affected.${colors.reset}`);
    overallStatus = false;
  }
  
  return true;
}

// Function to check required files
function checkRequiredFiles() {
  console.log(`\n${colors.bright}Checking Required Files:${colors.reset}`);
  
  // Check main application files
  checkFile('api.js', true);
  checkFile('package.json', true);
  checkFile('.env', true);
  
  // Check scripts directory
  console.log(`\n  ${colors.bright}Scripts:${colors.reset}`);
  checkFile('scripts/predictive_model.py', true);
  
  // Check utils directory
  console.log(`\n  ${colors.bright}Utils:${colors.reset}`);
  checkFile('utils/pythonBridge.js', true);
  checkFile('utils/cache.js', true);
  checkFile('utils/db.js', true);
  checkFile('utils/websocket-server.js', true);
  checkFile('utils/metricsManager.js', false);
  checkFile('utils/rateLimiter.js', false);
  
  return true;
}

// Function to check Node.js version and modules
function checkNodeEnvironment() {
  console.log(`\n${colors.bright}Checking Node.js Environment:${colors.reset}`);
  
  // Check Node.js version
  const nodeVersion = process.version;
  console.log(`  Node.js version: ${nodeVersion}`);
  
  // Check npm version
  try {
    const npmVersion = execSync('npm -v').toString().trim();
    console.log(`  npm version: ${npmVersion}`);
  } catch (error) {
    console.log(`  npm version: ${colors.red}ERROR${colors.reset}`);
    console.log(`  Error: ${error.message}`);
  }
  
  // Check required modules
  console.log(`\n  ${colors.bright}Required modules:${colors.reset}`);
  const requiredModules = [
    'express',
    'mongodb',
    'ioredis',
    'ws',
    'winston',
    'dotenv',
    'async-lock',
    'opossum'
  ];
  
  for (const moduleName of requiredModules) {
    try {
      require.resolve(moduleName);
      console.log(`  ${moduleName}: ${colors.green}INSTALLED${colors.reset}`);
    } catch (error) {
      console.log(`  ${moduleName}: ${colors.red}NOT INSTALLED${colors.reset}`);
      console.log(`  Run 'npm install ${moduleName}' to install the module.`);
      overallStatus = false;
    }
  }
  
  return true;
}

// Main function
async function main() {
  try {
    // Check required files
    checkRequiredFiles();
    
    // Check Node.js environment
    checkNodeEnvironment();
    
    // Check Python installation
    await checkPython();
    
    // Check Redis connection
    await checkRedis();
    
    // Check MongoDB connection
    await checkMongoDB();
    
    // Check port availability
    await checkPorts();
    
    // Check system resources
    checkSystemResources();
    
    // Print overall status
    console.log(`\n${colors.bright}Overall Status:${colors.reset} ${overallStatus ? `${colors.green}PASS${colors.reset}` : `${colors.red}FAIL${colors.reset}`}`);
    
    if (!overallStatus) {
      console.log(`\n${colors.yellow}Recommendations:${colors.reset}`);
      console.log(`  1. Fix any issues marked as ${colors.red}FAILED${colors.reset} or ${colors.red}MISSING${colors.reset}`);
      console.log(`  2. Run 'node scripts/fix-python-path.js' to fix Python path issues`);
      console.log(`  3. Set USE_IN_MEMORY_CACHE=true in .env if Redis is not available`);
      console.log(`  4. Check for port conflicts and update PORT and WS_PORT in .env`);
      console.log(`  5. Run 'npm install' to install missing dependencies`);
    } else {
      console.log(`\n${colors.green}All checks passed. The system is ready to run.${colors.reset}`);
    }
  } catch (error) {
    console.error(`\n${colors.red}Error during diagnostics:${colors.reset} ${error.message}`);
    console.error(error.stack);
  }
}

// Run the main function
main().catch(error => {
  console.error(`\n${colors.red}Fatal error:${colors.reset} ${error.message}`);
  console.error(error.stack);
});// scripts/diagnose-system.js - Comprehensive system diagnostic tool

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { spawn, execSync } = require('child_process');
const os = require('os');
const net = require('net');

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

// Print header
console.log(`${colors.bright}${colors.cyan}Sports Analytics - System Diagnostic Tool${colors.reset}`);
console.log(`${colors.cyan}===========================================${colors.reset}\n`);

// Track overall status
let overallStatus = true;

// Function to check if a file exists
function checkFile(filePath, required = true) {
  const exists = fs.existsSync(filePath);
  const status = exists ? `${colors.green}OK${colors.reset}` : (required ? `${colors.red}MISSING${colors.reset}` : `${colors.yellow}MISSING${colors.reset}`);
  
  console.log(`  ${filePath}: ${status}`);
  
  if (required && !exists) {
    overallStatus = false;
  }
  
  return exists;
}

// Function to check Python installation
async function checkPython() {
  console.log(`\n${colors.bright}Checking Python Installation:${colors.reset}`);
  
  // Get Python path from environment variables
  const pythonPath = process.env.PYTHON_PATH || process.env.PYTHON_EXECUTABLE || 'python';
  console.log(`  Python path: ${pythonPath}`);
  
  try {
    // Test Python execution
    const pythonProcess = spawn(pythonPath, ['-c', 'import sys; print(f"Python {sys.version}")']);
    
    return new Promise((resolve) => {
      let output = '';
      let errorOutput = '';
      
      pythonProcess.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      pythonProcess.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });
      
      pythonProcess.on('close', (code) => {
        if (code === 0) {
          console.log(`  Python version: ${colors.green}${output.trim()}${colors.reset}`);
          
          // Check for required packages
          checkPythonPackages(pythonPath);
          resolve(true);
        } else {
          console.log(`  Python execution: ${colors.red}FAILED${colors.reset}`);
          console.log(`  Error: ${errorOutput}`);
          overallStatus = false;
          resolve(false);
        }
      });
      
      pythonProcess.on('error', (error) => {
        console.log(`  Python execution: ${colors.red}ERROR${colors.reset}`);
        console.log(`  Error: ${error.message}`);
        overallStatus = false;
        resolve(false);
      });
      
      // Set timeout
      setTimeout(() => {
        pythonProcess.kill();
        console.log(`  Python execution: ${colors.red}TIMEOUT${colors.reset}`);
        overallStatus = false;
        resolve(false);
      }, 5000);
    });
  } catch (error) {
    console.log(`  Python execution: ${colors.red}ERROR${colors.reset}`);
    console.log(`  Error: ${error.message}`);
    overallStatus = false;
    return false;
  }
}

// Function to check Python packages
function checkPythonPackages(pythonPath) {
  console.log(`\n${colors.bright}Checking Python Packages:${colors.reset}`);
  
  const requiredPackages = [
    'numpy',
    'pandas',
    'scikit-learn',
    'xgboost',
    'lightgbm',
    'pymongo',
    'redis',
    'hyperopt'
  ];
  
  try {
    // Create a Python script to check packages
    const checkScript = `
import importlib.util
import sys

packages = ${JSON.stringify(requiredPackages)}
results = {}

for package in packages:
    try:
        spec = importlib.util.find_spec(package)
        if spec is None:
            results[package] = False
        else:
            module = importlib.import_module(package)
            version = getattr(module, '__version__', 'unknown')
            results[package] = version
    except Exception as e:
        results[package] = False

for package, version in results.items():
    if version:
        print(f"{package}: {version}")
    else:
        print(f"{package}: NOT FOUND")
`;
    
    // Write the script to a temporary file
    const tempScriptPath = path.join(os.tmpdir(), 'check_packages.py');
    fs.writeFileSync(tempScriptPath, checkScript);
    
    // Execute the script
    const output = execSync(`"${pythonPath}" "${tempScriptPath}"`).toString();
    
    // Parse the output
    const lines = output.trim().split('\n');
    for (const line of lines) {
      const [packageName, status] = line.split(': ');
      const isInstalled = status !== 'NOT FOUND';
      
      console.log(`  ${packageName}: ${isInstalled ? `${colors.green}${status}${colors.reset}` : `${colors.red}${status}${colors.reset}`}`);
      
      if (!isInstalled) {
        overallStatus = false;
      }
    }
    
    // Clean up temporary file
    fs.unlinkSync(tempScriptPath);
  } catch (error) {
    console.log(`  Package check: ${colors.red}ERROR${colors.reset}`);
    console.log(`  Error: ${error.message}`);
    overallStatus = false;
  }
}

// Function to check Redis connection
async function checkRedis() {
  console.log(`\n${colors.bright}Checking Redis Connection:${colors.reset}`);
  
  // Skip Redis check if USE_IN_MEMORY_CACHE is true
  if (process.env.USE_IN_MEMORY_CACHE === 'true') {
    console.log(`  Redis check: ${colors.yellow}SKIPPED (Using in-memory cache)${colors.reset}`);
    return true;
  }
  
  const redisHost = process.env.REDIS_HOST || 'localhost';
  const redisPort = parseInt(process.env.REDIS_PORT, 10) || 6379;
  
  console.log(`  Redis host: ${redisHost}`);
  console.log(`  Redis port: ${redisPort}`);
  
  try {
    // Check if Redis module is installed
    try {
      require.resolve('ioredis');
      console.log(`  Redis module: ${colors.green}INSTALLED${colors.reset}`);
    } catch (error) {
      console.log(`  Redis module: ${colors.red}NOT INSTALLED${colors.reset}`);
      console.log(`  Run 'npm install ioredis' to install the Redis module.`);
      overallStatus = false;
      return false;
    }
    
    // Check if Redis server is running
    const Redis = require('ioredis');
    const redis = new Redis({
      host: redisHost,
      port: redisPort,
      password: process.env.REDIS_PASSWORD || undefined,
      connectTimeout: 5000
    });
    
    return new Promise((resolve) => {
      redis.on('ready', () => {
        console.log(`  Redis connection: ${colors.green}OK${colors.reset}`);
        redis.quit();
        resolve(true);
      });
      
      redis.on('error', (error) => {
        console.log(`  Redis connection: ${colors.red}FAILED${colors.reset}`);
        console.log(`  Error: ${error.message}`);
        console.log(`  Recommendation: Enable in-memory cache by setting USE_IN_MEMORY_CACHE=true in .env`);
        redis.quit();
        overallStatus = false;
        resolve(false);
      });
      
      // Set timeout
      setTimeout(() => {
        console.log(`  Redis connection: ${colors.red}TIMEOUT${colors.reset}`);
        console.log(`  Recommendation: Enable in-memory cache by setting USE_IN_MEMORY_CACHE=true in .env`);
        redis.disconnect();
        overallStatus = false;
        resolve(false);
      }, 5000);
    });
  } catch (error) {
    console.log(`  Redis check: ${colors.red}ERROR${colors.reset}`);
    console.log(`  Error: ${error.message}`);
    overallStatus = false;
    return false;
  }
}

// Function to check MongoDB connection
async function checkMongoDB() {
  console.log(`\n${colors.bright}Checking MongoDB Connection:${colors.reset}`);
  
  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/sports-analytics';
  console.log(`  MongoDB URI: ${mongoUri.replace(/\/\/([^:]+):([^@]+)@/, '//***:***@')}`); // Hide credentials
  
  try {
    // Check if MongoDB module is installed
    try {
      require.resolve('mongodb');
      console.log(`  MongoDB module: ${colors.green}INSTALLED${colors.reset}`);
    } catch (error) {
      console.log(`  MongoDB module: ${colors.red}NOT INSTALLED${colors.reset}`);
      console.log(`  Run 'npm install mongodb' to install the MongoDB module.`);
      overallStatus = false;
      return false;
    }
    
    // Check MongoDB connection
    const { MongoClient } = require('mongodb');
    const client = new MongoClient(mongoUri, {
      connectTimeoutMS: 5000,
      serverSelectionTimeoutMS: 5000
    });
    
    try {
      await client.connect();
      await client.db().command({ ping: 1 });
      console.log(`  MongoDB connection: ${colors.green}OK${colors.reset}`);
      await client.close();
      return true;
    } catch (error) {
      console.log(`  MongoDB connection: ${colors.red}FAILED${colors.reset}`);
      console.log(`  Error: ${error.message}`);
      overallStatus = false;
      return false;
    }
  } catch (error) {
    console.log(`  MongoDB check: ${colors.red}ERROR${colors.reset}`);
    console.log(`  Error: ${error.message}`);
    overallStatus = false;
    return false;
  }
}

// Function to check port availability
async function checkPorts() {
  console.log(`\n${colors.bright}Checking Port Availability:${colors.reset}`);
  
  const httpPort = parseInt(process.env.PORT, 10) || 5050;
  const wsPort = parseInt(process.env.WS_PORT, 10) || 5150;
  
  console.log(`  HTTP port: ${httpPort}`);
  console.log(`  WebSocket port: ${wsPort}`);
  
  // Function to check if a port is available
  const isPortAvailable = (port) => {
    return new Promise((resolve) => {
      const server = net.createServer()
        .once('error', () => resolve(false))
        .once('listening', () => {
          server.once('close', () => resolve(true)).close();
        })
        .listen(port);
    });
  };
  
  // Check HTTP port
  const httpPortAvailable = await isPortAvailable(httpPort);
  console.log(`  HTTP port availability: ${httpPortAvailable ? `${colors.green}AVAILABLE${colors.reset}` : `${colors.red}IN USE${colors.reset}`}`);
  
  // Check WebSocket port
  const wsPortAvailable = await isPortAvailable(wsPort);
  console.log(`  WebSocket port availability: ${wsPortAvailable ? `${colors.green}AVAILABLE${colors.reset}` : `${colors.red}IN USE${colors.reset}`}`);
  
  if (!httpPortAvailable) {
    console.log(`  Recommendation: Change PORT in .env to an available port.`);
    overallStatus = false;
  }
  
  if (!wsPortAvailable) {
    console.log(`  Recommendation: Change WS_PORT in .env to an available port.`);
    overallStatus = false;
  }
  
  return httpPortAvailable && wsPortAvailable;
}

// Function to check system resources
function checkSystemResources() {
  console.log(`\n${colors.bright}Checking System Resources:${colors.reset}`);
  
  // Check memory
  const totalMemory = os.totalmem();
  const freeMemory = os.freemem();
  const totalMemoryGB = (totalMemory / (1024 * 1024 * 1024)).toFixed(2);
  const freeMemoryGB = (freeMemory / (1024 * 1024 * 1024)).toFixed(2);
  const memoryUsagePercent = ((totalMemory - freeMemory) / totalMemory * 100).toFixed(2);
  
  console.log(`  Total memory: ${totalMemoryGB} GB`);
  console.log(`  Free memory: ${freeMemoryGB} GB`);
  console.log(`  Memory usage: ${memoryUsagePercent}%`);
  
  // Check CPU
  const cpuCount = os.cpus().length;
  console.log(`  CPU cores: ${cpuCount}`);
  
  // Check disk space
  try {
    let diskInfo;
    if (process.platform === 'win32') {
      // Windows
      const drive = process.cwd().split(path.sep)[0];
      diskInfo = execSync(`wmic logicaldisk where "DeviceID='${drive}'" get Size,FreeSpace /format:csv`).toString();
      const lines = diskInfo.trim().split('\n');
      if (lines.length >= 2) {
        const values = lines[1].split(',');
        if (values.length >= 3) {
          const freeSpace = parseInt(values[1]) / (1024 * 1024 * 1024);
          const totalSpace = parseInt(values[2]) / (1024 * 1024 * 1024);
          console.log(`  Disk space (${drive}): ${freeSpace.toFixed(2)} GB free of ${totalSpace.toFixed(2)} GB`);
        }
      }
    } else {
      // Unix-like
      const df = execSync(`df -h "${process.cwd()}"`).toString();
      const lines = df.trim().split('\n');
      if (lines.length >= 2) {
        const values = lines[1].split(/\s+/);
        if (values.length >= 4) {
          console.log(`  Disk space: ${values[3]} free of ${values[1]}`);
        }
      }
    }
  } catch (error) {
    console.log(`  Disk space check: ${colors.red}ERROR${colors.reset}`);
    console.log(`  Error: ${error.message}`);
  }
  
  // Check for resource issues
  if (freeMemory < 500 * 1024 * 1024) { // Less than 500MB free
    console.log(`  ${colors.yellow}Warning: Low memory available. Performance may be affected.${colors.reset}`);
    console.log(`  Recommendation: Close other applications to free up memory.`);
    overallStatus = false;
  }
  
  if (cpuCount < 2) {
    console.log(`  ${colors.yellow}Warning: Limited CPU resources. Performance may be affected.${colors.reset}`);
    overallStatus = false;
  }
  
  return true;
}

// Function to check required files
function checkRequiredFiles() {
  console.log(`\n${colors.bright}Checking Required Files:${colors.reset}`);
  
  // Check main application files
  checkFile('api.js', true);
  checkFile('package.json', true);
  checkFile('.env', true);
  
  // Check scripts directory
  console.log(`\n  ${colors.bright}Scripts:${colors.reset}`);
  checkFile('scripts/predictive_model.py', true);
  
  // Check utils directory
  console.log(`\n  ${colors.bright}Utils:${colors.reset}`);
  checkFile('utils/pythonBridge.js', true);
  checkFile('utils/cache.js', true);
  checkFile('utils/db.js', true);
  checkFile('utils/websocket-server.js', true);
  checkFile('utils/metricsManager.js', false);
  checkFile('utils/rateLimiter.js', false);
  
  return true;
}

// Function to check Node.js version and modules
function checkNodeEnvironment() {
  console.log(`\n${colors.bright}Checking Node.js Environment:${colors.reset}`);
  
  // Check Node.js version
  const nodeVersion = process.version;
  console.log(`  Node.js version: ${nodeVersion}`);
  
  // Check npm version
  try {
    const npmVersion = execSync('npm -v').toString().trim();
    console.log(`  npm version: ${npmVersion}`);
  } catch (error) {
    console.log(`  npm version: ${colors.red}ERROR${colors.reset}`);
    console.log(`  Error: ${error.message}`);
  }
  
  // Check required modules
  console.log(`\n  ${colors.bright}Required modules:${colors.reset}`);
  const requiredModules = [
    'express',
    'mongodb',
    'ioredis',
    'ws',
    'winston',
    'dotenv',
    'async-lock',
    'opossum'
  ];
  
  for (const moduleName of requiredModules) {
    try {
      require.resolve(moduleName);
      console.log(`  ${moduleName}: ${colors.green}INSTALLED${colors.reset}`);
    } catch (error) {
      console.log(`  ${moduleName}: ${colors.red}NOT INSTALLED${colors.reset}`);
      console.log(`  Run 'npm install ${moduleName}' to install the module.`);
      overallStatus = false;
    }
  }
  
  return true;
}

// Main function
async function main() {
  try {
    // Check required files
    checkRequiredFiles();
    
    // Check Node.js environment
    checkNodeEnvironment();
    
    // Check Python installation
    await checkPython();
    
    // Check Redis connection
    await checkRedis();
    
    // Check MongoDB connection
    await checkMongoDB();
    
    // Check port availability
    await checkPorts();
    
    // Check system resources
    checkSystemResources();
    
    // Print overall status
    console.log(`\n${colors.bright}Overall Status:${colors.reset} ${overallStatus ? `${colors.green}PASS${colors.reset}` : `${colors.red}FAIL${colors.reset}`}`);
    
    if (!overallStatus) {
      console.log(`\n${colors.yellow}Recommendations:${colors.reset}`);
      console.log(`  1. Fix any issues marked as ${colors.red}FAILED${colors.reset} or ${colors.red}MISSING${colors.reset}`);
      console.log(`  2. Run 'node scripts/fix-python-path.js' to fix Python path issues`);
      console.log(`  3. Set USE_IN_MEMORY_CACHE=true in .env if Redis is not available`);
      console.log(`  4. Check for port conflicts and update PORT and WS_PORT in .env`);
      console.log(`  5. Run 'npm install' to install missing dependencies`);
    } else {
      console.log(`\n${colors.green}All checks passed. The system is ready to run.${colors.reset}`);
    }
  } catch (error) {
    console.error(`\n${colors.red}Error during diagnostics:${colors.reset} ${error.message}`);
    console.error(error.stack);
  }
}

// Run the main function
main().catch(error => {
  console.error(`\n${colors.red}Fatal error:${colors.reset} ${error.message}`);
  console.error(error.stack);
});// scripts/diagnose-system.js - Comprehensive system diagnostic tool

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { spawn, execSync } = require('child_process');
const os = require('os');
const net = require('net');

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

// Print header
console.log(`${colors.bright}${colors.cyan}Sports Analytics - System Diagnostic Tool${colors.reset}`);
console.log(`${colors.cyan}===========================================${colors.reset}\n`);

// Track overall status
let overallStatus = true;

// Function to check if a file exists
function checkFile(filePath, required = true) {
  const exists = fs.existsSync(filePath);
  const status = exists ? `${colors.green}OK${colors.reset}` : (required ? `${colors.red}MISSING${colors.reset}` : `${colors.yellow}MISSING${colors.reset}`);
  
  console.log(`  ${filePath}: ${status}`);
  
  if (required && !exists) {
    overallStatus = false;
  }
  
  return exists;
}

// Function to check Python installation
async function checkPython() {
  console.log(`\n${colors.bright}Checking Python Installation:${colors.reset}`);
  
  // Get Python path from environment variables
  const pythonPath = process.env.PYTHON_PATH || process.env.PYTHON_EXECUTABLE || 'python';
  console.log(`  Python path: ${pythonPath}`);
  
  try {
    // Test Python execution
    const pythonProcess = spawn(pythonPath, ['-c', 'import sys; print(f"Python {sys.version}")']);
    
    return new Promise((resolve) => {
      let output = '';
      let errorOutput = '';
      
      pythonProcess.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      pythonProcess.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });
      
      pythonProcess.on('close', (code) => {
        if (code === 0) {
          console.log(`  Python version: ${colors.green}${output.trim()}${colors.reset}`);
          
          // Check for required packages
          checkPythonPackages(pythonPath);
          resolve(true);
        } else {
          console.log(`  Python execution: ${colors.red}FAILED${colors.reset}`);
          console.log(`  Error: ${errorOutput}`);
          overallStatus = false;
          resolve(false);
        }
      });
      
      pythonProcess.on('error', (error) => {
        console.log(`  Python execution: ${colors.red}ERROR${colors.reset}`);
        console.log(`  Error: ${error.message}`);
        overallStatus = false;
        resolve(false);
      });
      
      // Set timeout
      setTimeout(() => {
        pythonProcess.kill();
        console.log(`  Python execution: ${colors.red}TIMEOUT${colors.reset}`);
        overallStatus = false;
        resolve(false);
      }, 5000);
    });
  } catch (error) {
    console.log(`  Python execution: ${colors.red}ERROR${colors.reset}`);
    console.log(`  Error: ${error.message}`);
    overallStatus = false;
    return false;
  }
}

// Function to check Python packages
function checkPythonPackages(pythonPath) {
  console.log(`\n${colors.bright}Checking Python Packages:${colors.reset}`);
  
  const requiredPackages = [
    'numpy',
    'pandas',
    'scikit-learn',
    'xgboost',
    'lightgbm',
    'pymongo',
    'redis',
    'hyperopt'
  ];
  
  try {
    // Create a Python script to check packages
    const checkScript = `
import importlib.util
import sys

packages = ${JSON.stringify(requiredPackages)}
results = {}

for package in packages:
    try:
        spec = importlib.util.find_spec(package)
        if spec is None:
            results[package] = False
        else:
            module = importlib.import_module(package)
            version = getattr(module, '__version__', 'unknown')
            results[package] = version
    except Exception as e:
        results[package] = False

for package, version in results.items():
    if version:
        print(f"{package}: {version}")
    else:
        print(f"{package}: NOT FOUND")
`;
    
    // Write the script to a temporary file
    const tempScriptPath = path.join(os.tmpdir(), 'check_packages.py');
    fs.writeFileSync(tempScriptPath, checkScript);
    
    // Execute the script
    const output = execSync(`"${pythonPath}" "${tempScriptPath}"`).toString();
    
    // Parse the output
    const lines = output.trim().split('\n');
    for (const line of lines) {
      const [packageName, status] = line.split(': ');
      const isInstalled = status !== 'NOT FOUND';
      
      console.log(`  ${packageName}: ${isInstalled ? `${colors.green}${status}${colors.reset}` : `${colors.red}${status}${colors.reset}`}`);
      
      if (!isInstalled) {
        overallStatus = false;
      }
    }
    
    // Clean up temporary file
    fs.unlinkSync(tempScriptPath);
  } catch (error) {
    console.log(`  Package check: ${colors.red}ERROR${colors.reset}`);
    console.log(`  Error: ${error.message}`);
    overallStatus = false;
  }
}

// Function to check Redis connection
async function checkRedis() {
  console.log(`\n${colors.bright}Checking Redis Connection:${colors.reset}`);
  
  // Skip Redis check if USE_IN_MEMORY_CACHE is true
  if (process.env.USE_IN_MEMORY_CACHE === 'true') {
    console.log(`  Redis check: ${colors.yellow}SKIPPED (Using in-memory cache)${colors.reset}`);
    return true;
  }
  
  const redisHost = process.env.REDIS_HOST || 'localhost';
  const redisPort = parseInt(process.env.REDIS_PORT, 10) || 6379;
  
  console.log(`  Redis host: ${redisHost}`);
  console.log(`  Redis port: ${redisPort}`);
  
  try {
    // Check if Redis module is installed
    try {
      require.resolve('ioredis');
      console.log(`  Redis module: ${colors.green}INSTALLED${colors.reset}`);
    } catch (error) {
      console.log(`  Redis module: ${colors.red}NOT INSTALLED${colors.reset}`);
      console.log(`  Run 'npm install ioredis' to install the Redis module.`);
      overallStatus = false;
      return false;
    }
    
    // Check if Redis server is running
    const Redis = require('ioredis');
    const redis = new Redis({
      host: redisHost,
      port: redisPort,
      password: process.env.REDIS_PASSWORD || undefined,
      connectTimeout: 5000
    });
    
    return new Promise((resolve) => {
      redis.on('ready', () => {
        console.log(`  Redis connection: ${colors.green}OK${colors.reset}`);
        redis.quit();
        resolve(true);
      });
      
      redis.on('error', (error) => {
        console.log(`  Redis connection: ${colors.red}FAILED${colors.reset}`);
        console.log(`  Error: ${error.message}`);
        console.log(`  Recommendation: Enable in-memory cache by setting USE_IN_MEMORY_CACHE=true in .env`);
        redis.quit();
        overallStatus = false;
        resolve(false);
      });
      
      // Set timeout
      setTimeout(() => {
        console.log(`  Redis connection: ${colors.red}TIMEOUT${colors.reset}`);
        console.log(`  Recommendation: Enable in-memory cache by setting USE_IN_MEMORY_CACHE=true in .env`);
        redis.disconnect();
        overallStatus = false;
        resolve(false);
      }, 5000);
    });
  } catch (error) {
    console.log(`  Redis check: ${colors.red}ERROR${colors.reset}`);
    console.log(`  Error: ${error.message}`);
    overallStatus = false;
    return false;
  }
}

// Function to check MongoDB connection
async function checkMongoDB() {
  console.log(`\n${colors.bright}Checking MongoDB Connection:${colors.reset}`);
  
  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/sports-analytics';
  console.log(`  MongoDB URI: ${mongoUri.replace(/\/\/([^:]+):([^@]+)@/, '//***:***@')}`); // Hide credentials
  
  try {
    // Check if MongoDB module is installed
    try {
      require.resolve('mongodb');
      console.log(`  MongoDB module: ${colors.green}INSTALLED${colors.reset}`);
    } catch (error) {
      console.log(`  MongoDB module: ${colors.red}NOT INSTALLED${colors.reset}`);
      console.log(`  Run 'npm install mongodb' to install the MongoDB module.`);
      overallStatus = false;
      return false;
    }
    
    // Check MongoDB connection
    const { MongoClient } = require('mongodb');
    const client = new MongoClient(mongoUri, {
      connectTimeoutMS: 5000,
      serverSelectionTimeoutMS: 5000
    });
    
    try {
      await client.connect();
      await client.db().command({ ping: 1 });
      console.log(`  MongoDB connection: ${colors.green}OK${colors.reset}`);
      await client.close();
      return true;
    } catch (error) {
      console.log(`  MongoDB connection: ${colors.red}FAILED${colors.reset}`);
      console.log(`  Error: ${error.message}`);
      overallStatus = false;
      return false;
    }
  } catch (error) {
    console.log(`  MongoDB check: ${colors.red}ERROR${colors.reset}`);
    console.log(`  Error: ${error.message}`);
    overallStatus = false;
    return false;
  }
}

// Function to check port availability
async function checkPorts() {
  console.log(`\n${colors.bright}Checking Port Availability:${colors.reset}`);
  
  const httpPort = parseInt(process.env.PORT, 10) || 5050;
  const wsPort = parseInt(process.env.WS_PORT, 10) || 5150;
  
  console.log(`  HTTP port: ${httpPort}`);
  console.log(`  WebSocket port: ${wsPort}`);
  
  // Function to check if a port is available
  const isPortAvailable = (port) => {
    return new Promise((resolve) => {
      const server = net.createServer()
        .once('error', () => resolve(false))
        .once('listening', () => {
          server.once('close', () => resolve(true)).close();
        })
        .listen(port);
    });
  };
  
  // Check HTTP port
  const httpPortAvailable = await isPortAvailable(httpPort);
  console.log(`  HTTP port availability: ${httpPortAvailable ? `${colors.green}AVAILABLE${colors.reset}` : `${colors.red}IN USE${colors.reset}`}`);
  
  // Check WebSocket port
  const wsPortAvailable = await isPortAvailable(wsPort);
  console.log(`  WebSocket port availability: ${wsPortAvailable ? `${colors.green}AVAILABLE${colors.reset}` : `${colors.red}IN USE${colors.reset}`}`);
  
  if (!httpPortAvailable) {
    console.log(`  Recommendation: Change PORT in .env to an available port.`);
    overallStatus = false;
  }
  
  if (!wsPortAvailable) {
    console.log(`  Recommendation: Change WS_PORT in .env to an available port.`);
    overallStatus = false;
  }
  
  return httpPortAvailable && wsPortAvailable;
}

// Function to check system resources
function checkSystemResources() {
  console.log(`\n${colors.bright}Checking System Resources:${colors.reset}`);
  
  // Check memory
  const totalMemory = os.totalmem();
  const freeMemory = os.freemem();
  const totalMemoryGB = (totalMemory / (1024 * 1024 * 1024)).toFixed(2);
  const freeMemoryGB = (freeMemory / (1024 * 1024 * 1024)).toFixed(2);
  const memoryUsagePercent = ((totalMemory - freeMemory) / totalMemory * 100).toFixed(2);
  
  console.log(`  Total memory: ${totalMemoryGB} GB`);
  console.log(`  Free memory: ${freeMemoryGB} GB`);
  console.log(`  Memory usage: ${memoryUsagePercent}%`);
  
  // Check CPU
  const cpuCount = os.cpus().length;
  console.log(`  CPU cores: ${cpuCount}`);
  
  // Check disk space
  try {
    let diskInfo;
    if (process.platform === 'win32') {
      // Windows
      const drive = process.cwd().split(path.sep)[0];
      diskInfo = execSync(`wmic logicaldisk where "DeviceID='${drive}'" get Size,FreeSpace /format:csv`).toString();
      const lines = diskInfo.trim().split('\n');
      if (lines.length >= 2) {
        const values = lines[1].split(',');
        if (values.length >= 3) {
          const freeSpace = parseInt(values[1]) / (1024 * 1024 * 1024);
          const totalSpace = parseInt(values[2]) / (1024 * 1024 * 1024);
          console.log(`  Disk space (${drive}): ${freeSpace.toFixed(2)} GB free of ${totalSpace.toFixed(2)} GB`);
        }
      }
    } else {
      // Unix-like
      const df = execSync(`df -h "${process.cwd()}"`).toString();
      const lines = df.trim().split('\n');
      if (lines.length >= 2) {
        const values = lines[1].split(/\s+/);
        if (values.length >= 4) {
          console.log(`  Disk space: ${values[3]} free of ${values[1]}`);
        }
      }
    }
  } catch (error) {
    console.log(`  Disk space check: ${colors.red}ERROR${colors.reset}`);
    console.log(`  Error: ${error.message}`);
  }
  
  // Check for resource issues
  if (freeMemory < 500 * 1024 * 1024) { // Less than 500MB free
    console.log(`  ${colors.yellow}Warning: Low memory available. Performance may be affected.${colors.reset}`);
    console.log(`  Recommendation: Close other applications to free up memory.`);
    overallStatus = false;
  }
  
  if (cpuCount < 2) {
    console.log(`  ${colors.yellow}Warning: Limited CPU resources. Performance may be affected.${colors.reset}`);
    overallStatus = false;
  }
  
  return true;
}

// Function to check required files
function checkRequiredFiles() {
  console.log(`\n${colors.bright}Checking Required Files:${colors.reset}`);
  
  // Check main application files
  checkFile('api.js', true);
  checkFile('package.json', true);
  checkFile('.env', true);
  
  // Check scripts directory
  console.log(`\n  ${colors.bright}Scripts:${colors.reset}`);
  checkFile('scripts/predictive_model.py', true);
  
  // Check utils directory
  console.log(`\n  ${colors.bright}Utils:${colors.reset}`);
  checkFile('utils/pythonBridge.js', true);
  checkFile('utils/cache.js', true);
  checkFile('utils/db.js', true);
  checkFile('utils/websocket-server.js', true);
  checkFile('utils/metricsManager.js', false);
  checkFile('utils/rateLimiter.js', false);
  
  return true;
}

// Function to check Node.js version and modules
function checkNodeEnvironment() {
  console.log(`\n${colors.bright}Checking Node.js Environment:${colors.reset}`);
  
  // Check Node.js version
  const nodeVersion = process.version;
  console.log(`  Node.js version: ${nodeVersion}`);
  
  // Check npm version
  try {
    const npmVersion = execSync('npm -v').toString().trim();
    console.log(`  npm version: ${npmVersion}`);
  } catch (error) {
    console.log(`  npm version: ${colors.red}ERROR${colors.reset}`);
    console.log(`  Error: ${error.message}`);
  }
  
  // Check required modules
  console.log(`\n  ${colors.bright}Required modules:${colors.reset}`);
  const requiredModules = [
    'express',
    'mongodb',
    'ioredis',
    'ws',
    'winston',
    'dotenv',
    'async-lock',
    'opossum'
  ];
  
  for (const moduleName of requiredModules) {
    try {
      require.resolve(moduleName);
      console.log(`  ${moduleName}: ${colors.green}INSTALLED${colors.reset}`);
    } catch (error) {
      console.log(`  ${moduleName}: ${colors.red}NOT INSTALLED${colors.reset}`);
      console.log(`  Run 'npm install ${moduleName}' to install the module.`);
      overallStatus = false;
    }
  }
  
  return true;
}

// Main function
async function main() {
  try {
    // Check required files
    checkRequiredFiles();
    
    // Check Node.js environment
    checkNodeEnvironment();
    
    // Check Python installation
    await checkPython();
    
    // Check Redis connection
    await checkRedis();
    
    // Check MongoDB connection
    await checkMongoDB();
    
    // Check port availability
    await checkPorts();
    
    // Check system resources
    checkSystemResources();
    
    // Print overall status
    console.log(`\n${colors.bright}Overall Status:${colors.reset} ${overallStatus ? `${colors.green}PASS${colors.reset}` : `${colors.red}FAIL${colors.reset}`}`);
    
    if (!overallStatus) {
      console.log(`\n${colors.yellow}Recommendations:${colors.reset}`);
      console.log(`  1. Fix any issues marked as ${colors.red}FAILED${colors.reset} or ${colors.red}MISSING${colors.reset}`);
      console.log(`  2. Run 'node scripts/fix-python-path.js' to fix Python path issues`);
      console.log(`  3. Set USE_IN_MEMORY_CACHE=true in .env if Redis is not available`);
      console.log(`  4. Check for port conflicts and update PORT and WS_PORT in .env`);
      console.log(`  5. Run 'npm install' to install missing dependencies`);
    } else {
      console.log(`\n${colors.green}All checks passed. The system is ready to run.${colors.reset}`);
    }
  } catch (error) {
    console.error(`\n${colors.red}Error during diagnostics:${colors.reset} ${error.message}`);
    console.error(error.stack);
  }
}

// Run the main function
main().catch(error => {
  console.error(`\n${colors.red}Fatal error:${colors.reset} ${error.message}`);
  console.error(error.stack);
});// scripts/diagnose-system.js - Comprehensive system diagnostic tool

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { spawn, execSync } = require('child_process');
const os = require('os');
const net = require('net');

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

// Print header
console.log(`${colors.bright}${colors.cyan}Sports Analytics - System Diagnostic Tool${colors.reset}`);
console.log(`${colors.cyan}===========================================${colors.reset}\n`);

// Track overall status
let overallStatus = true;

// Function to check if a file exists
function checkFile(filePath, required = true) {
  const exists = fs.existsSync(filePath);
  const status = exists ? `${colors.green}OK${colors.reset}` : (required ? `${colors.red}MISSING${colors.reset}` : `${colors.yellow}MISSING${colors.reset}`);
  
  console.log(`  ${filePath}: ${status}`);
  
  if (required && !exists) {
    overallStatus = false;
  }
  
  return exists;
}

// Function to check Python installation
async function checkPython() {
  console.log(`\n${colors.bright}Checking Python Installation:${colors.reset}`);
  
  // Get Python path from environment variables
  const pythonPath = process.env.PYTHON_PATH || process.env.PYTHON_EXECUTABLE || 'python';
  console.log(`  Python path: ${pythonPath}`);
  
  try {
    // Test Python execution
    const pythonProcess = spawn(pythonPath, ['-c', 'import sys; print(f"Python {sys.version}")']);
    
    return new Promise((resolve) => {
      let output = '';
      let errorOutput = '';
      
      pythonProcess.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      pythonProcess.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });
      
      pythonProcess.on('close', (code) => {
        if (code === 0) {
          console.log(`  Python version: ${colors.green}${output.trim()}${colors.reset}`);
          
          // Check for required packages
          checkPythonPackages(pythonPath);
          resolve(true);
        } else {
          console.log(`  Python execution: ${colors.red}FAILED${colors.reset}`);
          console.log(`  Error: ${errorOutput}`);
          overallStatus = false;
          resolve(false);
        }
      });
      
      pythonProcess.on('error', (error) => {
        console.log(`  Python execution: ${colors.red}ERROR${colors.reset}`);
        console.log(`  Error: ${error.message}`);
        overallStatus = false;
        resolve(false);
      });
      
      // Set timeout
      setTimeout(() => {
        pythonProcess.kill();
        console.log(`  Python execution: ${colors.red}TIMEOUT${colors.reset}`);
        overallStatus = false;
        resolve(false);
      }, 5000);
    });
  } catch (error) {
    console.log(`  Python execution: ${colors.red}ERROR${colors.reset}`);
    console.log(`  Error: ${error.message}`);
    overallStatus = false;
    return false;
  }
}

// Function to check Python packages
function checkPythonPackages(pythonPath) {
  console.log(`\n${colors.bright}Checking Python Packages:${colors.reset}`);
  
  const requiredPackages = [
    'numpy',
    'pandas',
    'scikit-learn',
    'xgboost',
    'lightgbm',
    'pymongo',
    'redis',
    'hyperopt'
  ];
  
  try {
    // Create a Python script to check packages
    const checkScript = `
import importlib.util
import sys

packages = ${JSON.stringify(requiredPackages)}
results = {}

for package in packages:
    try:
        spec = importlib.util.find_spec(package)
        if spec is None:
            results[package] = False
        else:
            module = importlib.import_module(package)
            version = getattr(module, '__version__', 'unknown')
            results[package] = version
    except Exception as e:
        results[package] = False

for package, version in results.items():
    if version:
        print(f"{package}: {version}")
    else:
        print(f"{package}: NOT FOUND")
`;
    
    // Write the script to a temporary file
    const tempScriptPath = path.join(os.tmpdir(), 'check_packages.py');
    fs.writeFileSync(tempScriptPath, checkScript);
    
    // Execute the script
    const output = execSync(`"${pythonPath}" "${tempScriptPath}"`).toString();
    
    // Parse the output
    const lines = output.trim().split('\n');
    for (const line of lines) {
      const [packageName, status] = line.split(': ');
      const isInstalled = status !== 'NOT FOUND';
      
      console.log(`  ${packageName}: ${isInstalled ? `${colors.green}${status}${colors.reset}` : `${colors.red}${status}${colors.reset}`}`);
      
      if (!isInstalled) {
        overallStatus = false;
      }
    }
    
    // Clean up temporary file
    fs.unlinkSync(tempScriptPath);
  } catch (error) {
    console.log(`  Package check: ${colors.red}ERROR${colors.reset}`);
    console.log(`  Error: ${error.message}`);
    overallStatus = false;
  }
}

// Function to check Redis connection
async function checkRedis() {
  console.log(`\n${colors.bright}Checking Redis Connection:${colors.reset}`);
  
  // Skip Redis check if USE_IN_MEMORY_CACHE is true
  if (process.env.USE_IN_MEMORY_CACHE === 'true') {
    console.log(`  Redis check: ${colors.yellow}SKIPPED (Using in-memory cache)${colors.reset}`);
    return true;
  }
  
  const redisHost = process.env.REDIS_HOST || 'localhost';
  const redisPort = parseInt(process.env.REDIS_PORT, 10) || 6379;
  
  console.log(`  Redis host: ${redisHost}`);
  console.log(`  Redis port: ${redisPort}`);
  
  try {
    // Check if Redis module is installed
    try {
      require.resolve('ioredis');
      console.log(`  Redis module: ${colors.green}INSTALLED${colors.reset}`);
    } catch (error) {
      console.log(`  Redis module: ${colors.red}NOT INSTALLED${colors.reset}`);
      console.log(`  Run 'npm install ioredis' to install the Redis module.`);
      overallStatus = false;
      return false;
    }
    
    // Check if Redis server is running
    const Redis = require('ioredis');
    const redis = new Redis({
      host: redisHost,
      port: redisPort,
      password: process.env.REDIS_PASSWORD || undefined,
      connectTimeout: 5000
    });
    
    return new Promise((resolve) => {
      redis.on('ready', () => {
        console.log(`  Redis connection: ${colors.green}OK${colors.reset}`);
        redis.quit();
        resolve(true);
      });
      
      redis.on('error', (error) => {
        console.log(`  Redis connection: ${colors.red}FAILED${colors.reset}`);
        console.log(`  Error: ${error.message}`);
        console.log(`  Recommendation: Enable in-memory cache by setting USE_IN_MEMORY_CACHE=true in .env`);
        redis.quit();
        overallStatus = false;
        resolve(false);
      });
      
      // Set timeout
      setTimeout(() => {
        console.log(`  Redis connection: ${colors.red}TIMEOUT${colors.reset}`);
        console.log(`  Recommendation: Enable in-memory cache by setting USE_IN_MEMORY_CACHE=true in .env`);
        redis.disconnect();
        overallStatus = false;
        resolve(false);
      }, 5000);
    });
  } catch (error) {
    console.log(`  Redis check: ${colors.red}ERROR${colors.reset}`);
    console.log(`  Error: ${error.message}`);
    overallStatus = false;
    return false;
  }
}

// Function to check MongoDB connection
async function checkMongoDB() {
  console.log(`\n${colors.bright}Checking MongoDB Connection:${colors.reset}`);
  
  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/sports-analytics';
  console.log(`  MongoDB URI: ${mongoUri.replace(/\/\/([^:]+):([^@]+)@/, '//***:***@')}`); // Hide credentials
  
  try {
    // Check if MongoDB module is installed
    try {
      require.resolve('mongodb');
      console.log(`  MongoDB module: ${colors.green}INSTALLED${colors.reset}`);
    } catch (error) {
      console.log(`  MongoDB module: ${colors.red}NOT INSTALLED${colors.reset}`);
      console.log(`  Run 'npm install mongodb' to install the MongoDB module.`);
      overallStatus = false;
      return false;
    }
    
    // Check MongoDB connection
    const { MongoClient } = require('mongodb');
    const client = new MongoClient(mongoUri, {
      connectTimeoutMS: 5000,
      serverSelectionTimeoutMS: 5000
    });
    
    try {
      await client.connect();
      await client.db().command({ ping: 1 });
      console.log(`  MongoDB connection: ${colors.green}OK${colors.reset}`);
      await client.close();
      return true;
    } catch (error) {
      console.log(`  MongoDB connection: ${colors.red}FAILED${colors.reset}`);
      console.log(`  Error: ${error.message}`);
      overallStatus = false;
      return false;
    }
  } catch (error) {
    console.log(`  MongoDB check: ${colors.red}ERROR${colors.reset}`);
    console.log(`  Error: ${error.message}`);
    overallStatus = false;
    return false;
  }
}

// Function to check port availability
async function checkPorts() {
  console.log(`\n${colors.bright}Checking Port Availability:${colors.reset}`);
  
  const httpPort = parseInt(process.env.PORT, 10) || 5050;
  const wsPort = parseInt(process.env.WS_PORT, 10) || 5150;
  
  console.log(`  HTTP port: ${httpPort}`);
  console.log(`  WebSocket port: ${wsPort}`);
  
  // Function to check if a port is available
  const isPortAvailable = (port) => {
    return new Promise((resolve) => {
      const server = net.createServer()
        .once('error', () => resolve(false))
        .once('listening', () => {
          server.once('close', () => resolve(true)).close();
        })
        .listen(port);
    });
  };
  
  // Check HTTP port
  const httpPortAvailable = await isPortAvailable(httpPort);
  console.log(`  HTTP port availability: ${httpPortAvailable ? `${colors.green}AVAILABLE${colors.reset}` : `${colors.red}IN USE${colors.reset}`}`);
  
  // Check WebSocket port
  const wsPortAvailable = await isPortAvailable(wsPort);
  console.log(`  WebSocket port availability: ${wsPortAvailable ? `${colors.green}AVAILABLE${colors.reset}` : `${colors.red}IN USE${colors.reset}`}`);
  
  if (!httpPortAvailable) {
    console.log(`  Recommendation: Change PORT in .env to an available port.`);
    overallStatus = false;
  }
  
  if (!wsPortAvailable) {
    console.log(`  Recommendation: Change WS_PORT in .env to an available port.`);
    overallStatus = false;
  }
  
  return httpPortAvailable && wsPortAvailable;
}

// Function to check system resources
function checkSystemResources() {
  console.log(`\n${colors.bright}Checking System Resources:${colors.reset}`);
  
  // Check memory
  const totalMemory = os.totalmem();
  const freeMemory = os.freemem();
  const totalMemoryGB = (totalMemory / (1024 * 1024 * 1024)).toFixed(2);
  const freeMemoryGB = (freeMemory / (1024 * 1024 * 1024)).toFixed(2);
  const memoryUsagePercent = ((totalMemory - freeMemory) / totalMemory * 100).toFixed(2);
  
  console.log(`  Total memory: ${totalMemoryGB} GB`);
  console.log(`  Free memory: ${freeMemoryGB} GB`);
  console.log(`  Memory usage: ${memoryUsagePercent}%`);
  
  // Check CPU
  const cpuCount = os.cpus().length;
  console.log(`  CPU cores: ${cpuCount}`);
  
  // Check disk space
  try {
    let diskInfo;
    if (process.platform === 'win32') {
      // Windows
      const drive = process.cwd().split(path.sep)[0];
      diskInfo = execSync(`wmic logicaldisk where "DeviceID='${drive}'" get Size,FreeSpace /format:csv`).toString();
      const lines = diskInfo.trim().split('\n');
      if (lines.length >= 2) {
        const values = lines[1].split(',');
        if (values.length >= 3) {
          const freeSpace = parseInt(values[1]) / (1024 * 1024 * 1024);
          const totalSpace = parseInt(values[2]) / (1024 * 1024 * 1024);
          console.log(`  Disk space (${drive}): ${freeSpace.toFixed(2)} GB free of ${totalSpace.toFixed(2)} GB`);
        }
      }
    } else {
      // Unix-like
      const df = execSync(`df -h "${process.cwd()}"`).toString();
      const lines = df.trim().split('\n');
      if (lines.length >= 2) {
        const values = lines[1].split(/\s+/);
        if (values.length >= 4) {
          console.log(`  Disk space: ${values[3]} free of ${values[1]}`);
        }
      }
    }
  } catch (error) {
    console.log(`  Disk space check: ${colors.red}ERROR${colors.reset}`);
    console.log(`  Error: ${error.message}`);
  }
  
  // Check for resource issues
  if (freeMemory < 500 * 1024 * 1024) { // Less than 500MB free
    console.log(`  ${colors.yellow}Warning: Low memory available. Performance may be affected.${colors.reset}`);
    console.log(`  Recommendation: Close other applications to free up memory.`);
    overallStatus = false;
  }
  
  if (cpuCount < 2) {
    console.log(`  ${colors.yellow}Warning: Limited CPU resources. Performance may be affected.${colors.reset}`);
    overallStatus = false;
  }
  
  return true;
}

// Function to check required files
function checkRequiredFiles() {
  console.log(`\n${colors.bright}Checking Required Files:${colors.reset}`);
  
  // Check main application files
  checkFile('api.js', true);
  checkFile('package.json', true);
  checkFile('.env', true);
  
  // Check scripts directory
  console.log(`\n  ${colors.bright}Scripts:${colors.reset}`);
  checkFile('scripts/predictive_model.py', true);
  
  // Check utils directory
  console.log(`\n  ${colors.bright}Utils:${colors.reset}`);
  checkFile('utils/pythonBridge.js', true);
  checkFile('utils/cache.js', true);
  checkFile('utils/db.js', true);
  checkFile('utils/websocket-server.js', true);
  checkFile('utils/metricsManager.js', false);
  checkFile('utils/rateLimiter.js', false);
  
  return true;
}

// Function to check Node.js version and modules
function checkNodeEnvironment() {
  console.log(`\n${colors.bright}Checking Node.js Environment:${colors.reset}`);
  
  // Check Node.js version
  const nodeVersion = process.version;
  console.log(`  Node.js version: ${nodeVersion}`);
  
  // Check npm version
  try {
    const npmVersion = execSync('npm -v').toString().trim();
    console.log(`  npm version: ${npmVersion}`);
  } catch (error) {
    console.log(`  npm version: ${colors.red}ERROR${colors.reset}`);
    console.log(`  Error: ${error.message}`);
  }
  
  // Check required modules
  console.log(`\n  ${colors.bright}Required modules:${colors.reset}`);
  const requiredModules = [
    'express',
    'mongodb',
    'ioredis',
    'ws',
    'winston',
    'dotenv',
    'async-lock',
    'opossum'
  ];
  
  for (const moduleName of requiredModules) {
    try {
      require.resolve(moduleName);
      console.log(`  ${moduleName}: ${colors.green}INSTALLED${colors.reset}`);
    } catch (error) {
      console.log(`  ${moduleName}: ${colors.red}NOT INSTALLED${colors.reset}`);
      console.log(`  Run 'npm install ${moduleName}' to install the module.`);
      overallStatus = false;
    }
  }
  
  return true;
}

// Main function
async function main() {
  try {
    // Check required files
    checkRequiredFiles();
    
    // Check Node.js environment
    checkNodeEnvironment();
    
    // Check Python installation
    await checkPython();
    
    // Check Redis connection
    await checkRedis();
    
    // Check MongoDB connection
    await checkMongoDB();
    
    // Check port availability
    await checkPorts();
    
    // Check system resources
    checkSystemResources();
    
    // Print overall status
    console.log(`\n${colors.bright}Overall Status:${colors.reset} ${overallStatus ? `${colors.green}PASS${colors.reset}` : `${colors.red}FAIL${colors.reset}`}`);
    
    if (!overallStatus) {
      console.log(`\n${colors.yellow}Recommendations:${colors.reset}`);
      console.log(`  1. Fix any issues marked as ${colors.red}FAILED${colors.reset} or ${colors.red}MISSING${colors.reset}`);
      console.log(`  2. Run 'node scripts/fix-python-path.js' to fix Python path issues`);
      console.log(`  3. Set USE_IN_MEMORY_CACHE=true in .env if Redis is not available`);
      console.log(`  4. Check for port conflicts and update PORT and WS_PORT in .env`);
      console.log(`  5. Run 'npm install' to install missing dependencies`);
    } else {
      console.log(`\n${colors.green}All checks passed. The system is ready to run.${colors.reset}`);
    }
  } catch (error) {
    console.error(`\n${colors.red}Error during diagnostics:${colors.reset} ${error.message}`);
    console.error(error.stack);
  }
}

// Run the main function
main().catch(error => {
  console.error(`\n${colors.red}Fatal error:${colors.reset} ${error.message}`);
  console.error(error.stack);
});// scripts/diagnose-system.js - Comprehensive system diagnostic tool

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { spawn, execSync } = require('child_process');
const os = require('os');
const net = require('net');

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

// Print header
console.log(`${colors.bright}${colors.cyan}Sports Analytics - System Diagnostic Tool${colors.reset}`);
console.log(`${colors.cyan}===========================================${colors.reset}\n`);

// Track overall status
let overallStatus = true;

// Function to check if a file exists
function checkFile(filePath, required = true) {
  const exists = fs.existsSync(filePath);
  const status = exists ? `${colors.green}OK${colors.reset}` : (required ? `${colors.red}MISSING${colors.reset}` : `${colors.yellow}MISSING${colors.reset}`);
  
  console.log(`  ${filePath}: ${status}`);
  
  if (required && !exists) {
    overallStatus = false;
  }
  
  return exists;
}

// Function to check Python installation
async function checkPython() {
  console.log(`\n${colors.bright}Checking Python Installation:${colors.reset}`);
  
  // Get Python path from environment variables
  const pythonPath = process.env.PYTHON_PATH || process.env.PYTHON_EXECUTABLE || 'python';
  console.log(`  Python path: ${pythonPath}`);
  
  try {
    // Test Python execution
    const pythonProcess = spawn(pythonPath, ['-c', 'import sys; print(f"Python {sys.version}")']);
    
    return new Promise((resolve) => {
      let output = '';
      let errorOutput = '';
      
      pythonProcess.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      pythonProcess.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });
      
      pythonProcess.on('close', (code) => {
        if (code === 0) {
          console.log(`  Python version: ${colors.green}${output.trim()}${colors.reset}`);
          
          // Check for required packages
          checkPythonPackages(pythonPath);
          resolve(true);
        } else {
          console.log(`  Python execution: ${colors.red}FAILED${colors.reset}`);
          console.log(`  Error: ${errorOutput}`);
          overallStatus = false;
          resolve(false);
        }
      });
      
      pythonProcess.on('error', (error) => {
        console.log(`  Python execution: ${colors.red}ERROR${colors.reset}`);
        console.log(`  Error: ${error.message}`);
        overallStatus = false;
        resolve(false);
      });
      
      // Set timeout
      setTimeout(() => {
        pythonProcess.kill();
        console.log(`  Python execution: ${colors.red}TIMEOUT${colors.reset}`);
        overallStatus = false;
        resolve(false);
      }, 5000);
    });
  } catch (error) {
    console.log(`  Python execution: ${colors.red}ERROR${colors.reset}`);
    console.log(`  Error: ${error.message}`);
    overallStatus = false;
    return false;
  }
}

// Function to check Python packages
function checkPythonPackages(pythonPath) {
  console.log(`\n${colors.bright}Checking Python Packages:${colors.reset}`);
  
  const requiredPackages = [
    'numpy',
    'pandas',
    'scikit-learn',
    'xgboost',
    'lightgbm',
    'pymongo',
    'redis',
    'hyperopt'
  ];
  
  try {
    // Create a Python script to check packages
    const checkScript = `
import importlib.util
import sys

packages = ${JSON.stringify(requiredPackages)}
results = {}

for package in packages:
    try:
        spec = importlib.util.find_spec(package)
        if spec is None:
            results[package] = False
        else:
            module = importlib.import_module(package)
            version = getattr(module, '__version__', 'unknown')
            results[package] = version
    except Exception as e:
        results[package] = False

for package, version in results.items():
    if version:
        print(f"{package}: {version}")
    else:
        print(f"{package}: NOT FOUND")
`;
    
    // Write the script to a temporary file
    const tempScriptPath = path.join(os.tmpdir(), 'check_packages.py');
    fs.writeFileSync(tempScriptPath, checkScript);
    
    // Execute the script
    const output = execSync(`"${pythonPath}" "${tempScriptPath}"`).toString();
    
    // Parse the output
    const lines = output.trim().split('\n');
    for (const line of lines) {
      const [packageName, status] = line.split(': ');
      const isInstalled = status !== 'NOT FOUND';
      
      console.log(`  ${packageName}: ${isInstalled ? `${colors.green}${status}${colors.reset}` : `${colors.red}${status}${colors.reset}`}`);
      
      if (!isInstalled) {
        overallStatus = false;
      }
    }
    
    // Clean up temporary file
    fs.unlinkSync(tempScriptPath);
  } catch (error) {
    console.log(`  Package check: ${colors.red}ERROR${colors.reset}`);
    console.log(`  Error: ${error.message}`);
    overallStatus = false;
  }
}

// Function to check Redis connection
async function checkRedis() {
  console.log(`\n${colors.bright}Checking Redis Connection:${colors.reset}`);
  
  // Skip Redis check if USE_IN_MEMORY_CACHE is true
  if (process.env.USE_IN_MEMORY_CACHE === 'true') {
    console.log(`  Redis check: ${colors.yellow}SKIPPED (Using in-memory cache)${colors.reset}`);
    return true;
  }
  
  const redisHost = process.env.REDIS_HOST || 'localhost';
  const redisPort = parseInt(process.env.REDIS_PORT, 10) || 6379;
  
  console.log(`  Redis host: ${redisHost}`);
  console.log(`  Redis port: ${redisPort}`);
  
  try {
    // Check if Redis module is installed
    try {
      require.resolve('ioredis');
      console.log(`  Redis module: ${colors.green}INSTALLED${colors.reset}`);
    } catch (error) {
      console.log(`  Redis module: ${colors.red}NOT INSTALLED${colors.reset}`);
      console.log(`  Run 'npm install ioredis' to install the Redis module.`);
      overallStatus = false;
      return false;
    }
    
    // Check if Redis server is running
    const Redis = require('ioredis');
    const redis = new Redis({
      host: redisHost,
      port: redisPort,
      password: process.env.REDIS_PASSWORD || undefined,
      connectTimeout: 5000
    });
    
    return new Promise((resolve) => {
      redis.on('ready', () => {
        console.log(`  Redis connection: ${colors.green}OK${colors.reset}`);
        redis.quit();
        resolve(true);
      });
      
      redis.on('error', (error) => {
        console.log(`  Redis connection: ${colors.red}FAILED${colors.reset}`);
        console.log(`  Error: ${error.message}`);
        console.log(`  Recommendation: Enable in-memory cache by setting USE_IN_MEMORY_CACHE=true in .env`);
        redis.quit();
        overallStatus = false;
        resolve(false);
      });
      
      // Set timeout
      setTimeout(() => {
        console.log(`  Redis connection: ${colors.red}TIMEOUT${colors.reset}`);
        console.log(`  Recommendation: Enable in-memory cache by setting USE_IN_MEMORY_CACHE=true in .env`);
        redis.disconnect();
        overallStatus = false;
        resolve(false);
      }, 5000);
    });
  } catch (error) {
    console.log(`  Redis check: ${colors.red}ERROR${colors.reset}`);
    console.log(`  Error: ${error.message}`);
    overallStatus = false;
    return false;
  }
}

// Function to check MongoDB connection
async function checkMongoDB() {
  console.log(`\n${colors.bright}Checking MongoDB Connection:${colors.reset}`);
  
  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/sports-analytics';
  console.log(`  MongoDB URI: ${mongoUri.replace(/\/\/([^:]+):([^@]+)@/, '//***:***@')}`); // Hide credentials
  
  try {
    // Check if MongoDB module is installed
    try {
      require.resolve('mongodb');
      console.log(`  MongoDB module: ${colors.green}INSTALLED${colors.reset}`);
    } catch (error) {
      console.log(`  MongoDB module: ${colors.red}NOT INSTALLED${colors.reset}`);
      console.log(`  Run 'npm install mongodb' to install the MongoDB module.`);
      overallStatus = false;
      return false;
    }
    
    // Check MongoDB connection
    const { MongoClient } = require('mongodb');
    const client = new MongoClient(mongoUri, {
      connectTimeoutMS: 5000,
      serverSelectionTimeoutMS: 5000
    });
    
    try {
      await client.connect();
      await client.db().command({ ping: 1 });
      console.log(`  MongoDB connection: ${colors.green}OK${colors.reset}`);
      await client.close();
      return true;
    } catch (error) {
      console.log(`  MongoDB connection: ${colors.red}FAILED${colors.reset}`);
      console.log(`  Error: ${error.message}`);
      overallStatus = false;
      return false;
    }
  } catch (error) {
    console.log(`  MongoDB check: ${colors.red}ERROR${colors.reset}`);
    console.log(`  Error: ${error.message}`);
    overallStatus = false;
    return false;
  }
}

// Function to check port availability
async function checkPorts() {
  console.log(`\n${colors.bright}Checking Port Availability:${colors.reset}`);
  
  const httpPort = parseInt(process.env.PORT, 10) || 5050;
  const wsPort = parseInt(process.env.WS_PORT, 10) || 5150;
  
  console.log(`  HTTP port: ${httpPort}`);
  console.log(`  WebSocket port: ${wsPort}`);
  
  // Function to check if a port is available
  const isPortAvailable = (port) => {
    return new Promise((resolve) => {
      const server = net.createServer()
        .once('error', () => resolve(false))
        .once('listening', () => {
          server.once('close', () => resolve(true)).close();
        })
        .listen(port);
    });
  };
  
  // Check HTTP port
  const httpPortAvailable = await isPortAvailable(httpPort);
  console.log(`  HTTP port availability: ${httpPortAvailable ? `${colors.green}AVAILABLE${colors.reset}` : `${colors.red}IN USE${colors.reset}`}`);
  
  // Check WebSocket port
  const wsPortAvailable = await isPortAvailable(wsPort);
  console.log(`  WebSocket port availability: ${wsPortAvailable ? `${colors.green}AVAILABLE${colors.reset}` : `${colors.red}IN USE${colors.reset}`}`);
  
  if (!httpPortAvailable) {
    console.log(`  Recommendation: Change PORT in .env to an available port.`);
    overallStatus = false;
  }
  
  if (!wsPortAvailable) {
    console.log(`  Recommendation: Change WS_PORT in .env to an available port.`);
    overallStatus = false;
  }
  
  return httpPortAvailable && wsPortAvailable;
}

// Function to check system resources
function checkSystemResources() {
  console.log(`\n${colors.bright}Checking System Resources:${colors.reset}`);
  
  // Check memory
  const totalMemory = os.totalmem();
  const freeMemory = os.freemem();
  const totalMemoryGB = (totalMemory / (1024 * 1024 * 1024)).toFixed(2);
  const freeMemoryGB = (freeMemory / (1024 * 1024 * 1024)).toFixed(2);
  const memoryUsagePercent = ((totalMemory - freeMemory) / totalMemory * 100).toFixed(2);
  
  console.log(`  Total memory: ${totalMemoryGB} GB`);
  console.log(`  Free memory: ${freeMemoryGB} GB`);
  console.log(`  Memory usage: ${memoryUsagePercent}%`);
  
  // Check CPU
  const cpuCount = os.cpus().length;
  console.log(`  CPU cores: ${cpuCount}`);
  
  // Check disk space
  try {
    let diskInfo;
    if (process.platform === 'win32') {
      // Windows
      const drive = process.cwd().split(path.sep)[0];
      diskInfo = execSync(`wmic logicaldisk where "DeviceID='${drive}'" get Size,FreeSpace /format:csv`).toString();
      const lines = diskInfo.trim().split('\n');
      if (lines.length >= 2) {
        const values = lines[1].split(',');
        if (values.length >= 3) {
          const freeSpace = parseInt(values[1]) / (1024 * 1024 * 1024);
          const totalSpace = parseInt(values[2]) / (1024 * 1024 * 1024);
          console.log(`  Disk space (${drive}): ${freeSpace.toFixed(2)} GB free of ${totalSpace.toFixed(2)} GB`);
        }
      }
    } else {
      // Unix-like
      const df = execSync(`df -h "${process.cwd()}"`).toString();
      const lines = df.trim().split('\n');
      if (lines.length >= 2) {
        const values = lines[1].split(/\s+/);
        if (values.length >= 4) {
          console.log(`  Disk space: ${values[3]} free of ${values[1]}`);
        }
      }
    }
  } catch (error) {
    console.log(`  Disk space check: ${colors.red}ERROR${colors.reset}`);
    console.log(`  Error: ${error.message}`);
  }
  
  // Check for resource issues
  if (freeMemory < 500 * 1024 * 1024) { // Less than 500MB free
    console.log(`  ${colors.yellow}Warning: Low memory available. Performance may be affected.${colors.reset}`);
    console.log(`  Recommendation: Close other applications to free up memory.`);
    overallStatus = false;
  }
  
  if (cpuCount < 2) {
    console.log(`  ${colors.yellow}Warning: Limited CPU resources. Performance may be affected.${colors.reset}`);
    overallStatus = false;
  }
  
  return true;
}

// Function to check required files
function checkRequiredFiles() {
  console.log(`\n${colors.bright}Checking Required Files:${colors.reset}`);
  
  // Check main application files
  checkFile('api.js', true);
  checkFile('package.json', true);
  checkFile('.env', true);
  
  // Check scripts directory
  console.log(`\n  ${colors.bright}Scripts:${colors.reset}`);
  checkFile('scripts/predictive_model.py', true);
  
  // Check utils directory
  console.log(`\n  ${colors.bright}Utils:${colors.reset}`);
  checkFile('utils/pythonBridge.js', true);
  checkFile('utils/cache.js', true);
  checkFile('utils/db.js', true);
  checkFile('utils/websocket-server.js', true);
  checkFile('utils/metricsManager.js', false);
  checkFile('utils/rateLimiter.js', false);
  
  return true;
}

// Function to check Node.js version and modules
function checkNodeEnvironment() {
  console.log(`\n${colors.bright}Checking Node.js Environment:${colors.reset}`);
  
  // Check Node.js version
  const nodeVersion = process.version;
  console.log(`  Node.js version: ${nodeVersion}`);
  
  // Check npm version
  try {
    const npmVersion = execSync('npm -v').toString().trim();
    console.log(`  npm version: ${npmVersion}`);
  } catch (error) {
    console.log(`  npm version: ${colors.red}ERROR${colors.reset}`);
    console.log(`  Error: ${error.message}`);
  }
  
  // Check required modules
  console.log(`\n  ${colors.bright}Required modules:${colors.reset}`);
  const requiredModules = [
    'express',
    'mongodb',
    'ioredis',
    'ws',
    'winston',
    'dotenv',
    'async-lock',
    'opossum'
  ];
  
  for (const moduleName of requiredModules) {
    try {
      require.resolve(moduleName);
      console.log(`  ${moduleName}: ${colors.green}INSTALLED${colors.reset}`);
    } catch (error) {
      console.log(`  ${moduleName}: ${colors.red}NOT INSTALLED${colors.reset}`);
      console.log(`  Run 'npm install ${moduleName}' to install the module.`);
      overallStatus = false;
    }
  }
  
  return true;
}

// Main function
async function main() {
  try {
    // Check required files
    checkRequiredFiles();
    
    // Check Node.js environment
    checkNodeEnvironment();
    
    // Check Python installation
    await checkPython();
    
    // Check Redis connection
    await checkRedis();
    
    // Check MongoDB connection
    await checkMongoDB();
    
    // Check port availability
    await checkPorts();
    
    // Check system resources
    checkSystemResources();
    
    // Print overall status
    console.log(`\n${colors.bright}Overall Status:${colors.reset} ${overallStatus ? `${colors.green}PASS${colors.reset}` : `${colors.red}FAIL${colors.reset}`}`);
    
    if (!overallStatus) {
      console.log(`\n${colors.yellow}Recommendations:${colors.reset}`);
      console.log(`  1. Fix any issues marked as ${colors.red}FAILED${colors.reset} or ${colors.red}MISSING${colors.reset}`);
      console.log(`  2. Run 'node scripts/fix-python-path.js' to fix Python path issues`);
      console.log(`  3. Set USE_IN_MEMORY_CACHE=true in .env if Redis is not available`);
      console.log(`  4. Check for port conflicts and update PORT and WS_PORT in .env`);
      console.log(`  5. Run 'npm install' to install missing dependencies`);
    } else {
      console.log(`\n${colors.green}All checks passed. The system is ready to run.${colors.reset}`);
    }
  } catch (error) {
    console.error(`\n${colors.red}Error during diagnostics:${colors.reset} ${error.message}`);
    console.error(error.stack);
  }
}

// Run the main function
main().catch(error => {
  console.error(`\n${colors.red}Fatal error:${colors.reset} ${error.message}`);
  console.error(error.stack);
});// scripts/diagnose-system.js - Comprehensive system diagnostic tool

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { spawn, execSync } = require('child_process');
const os = require('os');
const net = require('net');

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

// Print header
console.log(`${colors.bright}${colors.cyan}Sports Analytics - System Diagnostic Tool${colors.reset}`);
console.log(`${colors.cyan}===========================================${colors.reset}\n`);

// Track overall status
let overallStatus = true;

// Function to check if a file exists
function checkFile(filePath, required = true) {
  const exists = fs.existsSync(filePath);
  const status = exists ? `${colors.green}OK${colors.reset}` : (required ? `${colors.red}MISSING${colors.reset}` : `${colors.yellow}MISSING${colors.reset}`);
  
  console.log(`  ${filePath}: ${status}`);
  
  if (required && !exists) {
    overallStatus = false;
  }
  
  return exists;
}

// Function to check Python installation
async function checkPython() {
  console.log(`\n${colors.bright}Checking Python Installation:${colors.reset}`);
  
  // Get Python path from environment variables
  const pythonPath = process.env.PYTHON_PATH || process.env.PYTHON_EXECUTABLE || 'python';
  console.log(`  Python path: ${pythonPath}`);
  
  try {
    // Test Python execution
    const pythonProcess = spawn(pythonPath, ['-c', 'import sys; print(f"Python {sys.version}")']);
    
    return new Promise((resolve) => {
      let output = '';
      let errorOutput = '';
      
      pythonProcess.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      pythonProcess.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });
      
      pythonProcess.on('close', (code) => {
        if (code === 0) {
          console.log(`  Python version: ${colors.green}${output.trim()}${colors.reset}`);
          
          // Check for required packages
          checkPythonPackages(pythonPath);
          resolve(true);
        } else {
          console.log(`  Python execution: ${colors.red}FAILED${colors.reset}`);
          console.log(`  Error: ${errorOutput}`);
          overallStatus = false;
          resolve(false);
        }
      });
      
      pythonProcess.on('error', (error) => {
        console.log(`  Python execution: ${colors.red}ERROR${colors.reset}`);
        console.log(`  Error: ${error.message}`);
        overallStatus = false;
        resolve(false);
      });
      
      // Set timeout
      setTimeout(() => {
        pythonProcess.kill();
        console.log(`  Python execution: ${colors.red}TIMEOUT${colors.reset}`);
        overallStatus = false;
        resolve(false);
      }, 5000);
    });
  } catch (error) {
    console.log(`  Python execution: ${colors.red}ERROR${colors.reset}`);
    console.log(`  Error: ${error.message}`);
    overallStatus = false;
    return false;
  }
}

// Function to check Python packages
function checkPythonPackages(pythonPath) {
  console.log(`\n${colors.bright}Checking Python Packages:${colors.reset}`);
  
  const requiredPackages = [
    'numpy',
    'pandas',
    'scikit-learn',
    'xgboost',
    'lightgbm',
    'pymongo',
    'redis',
    'hyperopt'
  ];
  
  try {
    // Create a Python script to check packages
    const checkScript = `
import importlib.util
import sys

packages = ${JSON.stringify(requiredPackages)}
results = {}

for package in packages:
    try:
        spec = importlib.util.find_spec(package)
        if spec is None:
            results[package] = False
        else:
            module = importlib.import_module(package)
            version = getattr(module, '__version__', 'unknown')
            results[package] = version
    except Exception as e:
        results[package] = False

for package, version in results.items():
    if version:
        print(f"{package}: {version}")
    else:
        print(f"{package}: NOT FOUND")
`;
    
    // Write the script to a temporary file
    const tempScriptPath = path.join(os.tmpdir(), 'check_packages.py');
    fs.writeFileSync(tempScriptPath, checkScript);
    
    // Execute the script
    const output = execSync(`"${pythonPath}" "${tempScriptPath}"`).toString();
    
    // Parse the output
    const lines = output.trim().split('\n');
    for (const line of lines) {
      const [packageName, status] = line.split(': ');
      const isInstalled = status !== 'NOT FOUND';
      
      console.log(`  ${packageName}: ${isInstalled ? `${colors.green}${status}${colors.reset}` : `${colors.red}${status}${colors.reset}`}`);
      
      if (!isInstalled) {
        overallStatus = false;
      }
    }
    
    // Clean up temporary file
    fs.unlinkSync(tempScriptPath);
  } catch (error) {
    console.log(`  Package check: ${colors.red}ERROR${colors.reset}`);
    console.log(`  Error: ${error.message}`);
    overallStatus = false;
  }
}

// Function to check Redis connection
async function checkRedis() {
  console.log(`\n${colors.bright}Checking Redis Connection:${colors.reset}`);
  
  // Skip Redis check if USE_IN_MEMORY_CACHE is true
  if (process.env.USE_IN_MEMORY_CACHE === 'true') {
    console.log(`  Redis check: ${colors.yellow}SKIPPED (Using in-memory cache)${colors.reset}`);
    return true;
  }
  
  const redisHost = process.env.REDIS_HOST || 'localhost';
  const redisPort = parseInt(process.env.REDIS_PORT, 10) || 6379;
  
  console.log(`  Redis host: ${redisHost}`);
  console.log(`  Redis port: ${redisPort}`);
  
  try {
    // Check if Redis module is installed
    try {
      require.resolve('ioredis');
      console.log(`  Redis module: ${colors.green}INSTALLED${colors.reset}`);
    } catch (error) {
      console.log(`  Redis module: ${colors.red}NOT INSTALLED${colors.reset}`);
      console.log(`  Run 'npm install ioredis' to install the Redis module.`);
      overallStatus = false;
      return false;
    }
    
    // Check if Redis server is running
    const Redis = require('ioredis');
    const redis = new Redis({
      host: redisHost,
      port: redisPort,
      password: process.env.REDIS_PASSWORD || undefined,
      connectTimeout: 5000
    });
    
    return new Promise((resolve) => {
      redis.on('ready', () => {
        console.log(`  Redis connection: ${colors.green}OK${colors.reset}`);
        redis.quit();
        resolve(true);
      });
      
      redis.on('error', (error) => {
        console.log(`  Redis connection: ${colors.red}FAILED${colors.reset}`);
        console.log(`  Error: ${error.message}`);
        console.log(`  Recommendation: Enable in-memory cache by setting USE_IN_MEMORY_CACHE=true in .env`);
        redis.quit();
        overallStatus = false;
        resolve(false);
      });
      
      // Set timeout
      setTimeout(() => {
        console.log(`  Redis connection: ${colors.red}TIMEOUT${colors.reset}`);
        console.log(`  Recommendation: Enable in-memory cache by setting USE_IN_MEMORY_CACHE=true in .env`);
        redis.disconnect();
        overallStatus = false;
        resolve(false);
      }, 5000);
    });
  } catch (error) {
    console.log(`  Redis check: ${colors.red}ERROR${colors.reset}`);
    console.log(`  Error: ${error.message}`);
    overallStatus = false;
    return false;
  }
}

// Function to check MongoDB connection
async function checkMongoDB() {
  console.log(`\n${colors.bright}Checking MongoDB Connection:${colors.reset}`);
  
  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/sports-analytics';
  console.log(`  MongoDB URI: ${mongoUri.replace(/\/\/([^:]+):([^@]+)@/, '//***:***@')}`); // Hide credentials
  
  try {
    // Check if MongoDB module is installed
    try {
      require.resolve('mongodb');
      console.log(`  MongoDB module: ${colors.green}INSTALLED${colors.reset}`);
    } catch (error) {
      console.log(`  MongoDB module: ${colors.red}NOT INSTALLED${colors.reset}`);
      console.log(`  Run 'npm install mongodb' to install the MongoDB module.`);
      overallStatus = false;
      return false;
    }
    
    // Check MongoDB connection
    const { MongoClient } = require('mongodb');
    const client = new MongoClient(mongoUri, {
      connectTimeoutMS: 5000,
      serverSelectionTimeoutMS: 5000
    });
    
    try {
      await client.connect();
      await client.db().command({ ping: 1 });
      console.log(`  MongoDB connection: ${colors.green}OK${colors.reset}`);
      await client.close();
      return true;
    } catch (error) {
      console.log(`  MongoDB connection: ${colors.red}FAILED${colors.reset}`);
      console.log(`  Error: ${error.message}`);
      overallStatus = false;
      return false;
    }
  } catch (error) {
    console.log(`  MongoDB check: ${colors.red}ERROR${colors.reset}`);
    console.log(`  Error: ${error.message}`);
    overallStatus = false;
    return false;
  }
}

// Function to check port availability
async function checkPorts() {
  console.log(`\n${colors.bright}Checking Port Availability:${colors.reset}`);
  
  const httpPort = parseInt(process.env.PORT, 10) || 5050;
  const wsPort = parseInt(process.env.WS_PORT, 10) || 5150;
  
  console.log(`  HTTP port: ${httpPort}`);
  console.log(`  WebSocket port: ${wsPort}`);
  
  // Function to check if a port is available
  const isPortAvailable = (port) => {
    return new Promise((resolve) => {
      const server = net.createServer()
        .once('error', () => resolve(false))
        .once('listening', () => {
          server.once('close', () => resolve(true)).close();
        })
        .listen(port);
    });
  };
  
  // Check HTTP port
  const httpPortAvailable = await isPortAvailable(httpPort);
  console.log(`  HTTP port availability: ${httpPortAvailable ? `${colors.green}AVAILABLE${colors.reset}` : `${colors.red}IN USE${colors.reset}`}`);
  
  // Check WebSocket port
  const wsPortAvailable = await isPortAvailable(wsPort);
  console.log(`  WebSocket port availability: ${wsPortAvailable ? `${colors.green}AVAILABLE${colors.reset}` : `${colors.red}IN USE${colors.reset}`}`);
  
  if (!httpPortAvailable) {
    console.log(`  Recommendation: Change PORT in .env to an available port.`);
    overallStatus = false;
  }
  
  if (!wsPortAvailable) {
    console.log(`  Recommendation: Change WS_PORT in .env to an available port.`);
    overallStatus = false;
  }
  
  return httpPortAvailable && wsPortAvailable;
}

// Function to check system resources
function checkSystemResources() {
  console.log(`\n${colors.bright}Checking System Resources:${colors.reset}`);
  
  // Check memory
  const totalMemory = os.totalmem();
  const freeMemory = os.freemem();
  const totalMemoryGB = (totalMemory / (1024 * 1024 * 1024)).toFixed(2);
  const freeMemoryGB = (freeMemory / (1024 * 1024 * 1024)).toFixed(2);
  const memoryUsagePercent = ((totalMemory - freeMemory) / totalMemory * 100).toFixed(2);
  
  console.log(`  Total memory: ${totalMemoryGB} GB`);
  console.log(`  Free memory: ${freeMemoryGB} GB`);
  console.log(`  Memory usage: ${memoryUsagePercent}%`);
  
  // Check CPU
  const cpuCount = os.cpus().length;
  console.log(`  CPU cores: ${cpuCount}`);
  
  // Check disk space
  try {
    let diskInfo;
    if (process.platform === 'win32') {
      // Windows
      const drive = process.cwd().split(path.sep)[0];
      diskInfo = execSync(`wmic logicaldisk where "DeviceID='${drive}'" get Size,FreeSpace /format:csv`).toString();
      const lines = diskInfo.trim().split('\n');
      if (lines.length >= 2) {
        const values = lines[1].split(',');
        if (values.length >= 3) {
          const freeSpace = parseInt(values[1]) / (1024 * 1024 * 1024);
          const totalSpace = parseInt(values[2]) / (1024 * 1024 * 1024);
          console.log(`  Disk space (${drive}): ${freeSpace.toFixed(2)} GB free of ${totalSpace.toFixed(2)} GB`);
        }
      }
    } else {
      // Unix-like
      const df = execSync(`df -h "${process.cwd()}"`).toString();
      const lines = df.trim().split('\n');
      if (lines.length >= 2) {
        const values = lines[1].split(/\s+/);
        if (values.length >= 4) {
          console.log(`  Disk space: ${values[3]} free of ${values[1]}`);
        }
      }
    }
  } catch (error) {
    console.log(`  Disk space check: ${colors.red}ERROR${colors.reset}`);
    console.log(`  Error: ${error.message}`);
  }
  
  // Check for resource issues
  if (freeMemory < 500 * 1024 * 1024) { // Less than 500MB free
    console.log(`  ${colors.yellow}Warning: Low memory available. Performance may be affected.${colors.reset}`);
    console.log(`  Recommendation: Close other applications to free up memory.`);
    overallStatus = false;
  }
  
  if (cpuCount < 2) {
    console.log(`  ${colors.yellow}Warning: Limited CPU resources. Performance may be affected.${colors.reset}`);
    overallStatus = false;
  }
  
  return true;
}

// Function to check required files
function checkRequiredFiles() {
  console.log(`\n${colors.bright}Checking Required Files:${colors.reset}`);
  
  // Check main application files
  checkFile('api.js', true);
  checkFile('package.json', true);
  checkFile('.env', true);
  
  // Check scripts directory
  console.log(`\n  ${colors.bright}Scripts:${colors.reset}`);
  checkFile('scripts/predictive_model.py', true);
  
  // Check utils directory
  console.log(`\n  ${colors.bright}Utils:${colors.reset}`);
  checkFile('utils/pythonBridge.js', true);
  checkFile('utils/cache.js', true);
  checkFile('utils/db.js', true);
  checkFile('utils/websocket-server.js', true);
  checkFile('utils/metricsManager.js', false);
  checkFile('utils/rateLimiter.js', false);
  
  return true;
}

// Function to check Node.js version and modules
function checkNodeEnvironment() {
  console.log(`\n${colors.bright}Checking Node.js Environment:${colors.reset}`);
  
  // Check Node.js version
  const nodeVersion = process.version;
  console.log(`  Node.js version: ${nodeVersion}`);
  
  // Check npm version
  try {
    const npmVersion = execSync('npm -v').toString().trim();
    console.log(`  npm version: ${npmVersion}`);
  } catch (error) {
    console.log(`  npm version: ${colors.red}ERROR${colors.reset}`);
    console.log(`  Error: ${error.message}`);
  }
  
  // Check required modules
  console.log(`\n  ${colors.bright}Required modules:${colors.reset}`);
  const requiredModules = [
    'express',
    'mongodb',
    'ioredis',
    'ws',
    'winston',
    'dotenv',
    'async-lock',
    'opossum'
  ];
  
  for (const moduleName of requiredModules) {
    try {
      require.resolve(moduleName);
      console.log(`  ${moduleName}: ${colors.green}INSTALLED${colors.reset}`);
    } catch (error) {
      console.log(`  ${moduleName}: ${colors.red}NOT INSTALLED${colors.reset}`);
      console.log(`  Run 'npm install ${moduleName}' to install the module.`);
      overallStatus = false;
    }
  }
  
  return true;
}

// Main function
async function main() {
  try {
    // Check required files
    checkRequiredFiles();
    
    // Check Node.js environment
    checkNodeEnvironment();
    
    // Check Python installation
    await checkPython();
    
    // Check Redis connection
    await checkRedis();
    
    // Check MongoDB connection
    await checkMongoDB();
    
    // Check port availability
    await checkPorts();
    
    // Check system resources
    checkSystemResources();
    
    // Print overall status
    console.log(`\n${colors.bright}Overall Status:${colors.reset} ${overallStatus ? `${colors.green}PASS${colors.reset}` : `${colors.red}FAIL${colors.reset}`}`);
    
    if (!overallStatus) {
      console.log(`\n${colors.yellow}Recommendations:${colors.reset}`);
      console.log(`  1. Fix any issues marked as ${colors.red}FAILED${colors.reset} or ${colors.red}MISSING${colors.reset}`);
      console.log(`  2. Run 'node scripts/fix-python-path.js' to fix Python path issues`);
      console.log(`  3. Set USE_IN_MEMORY_CACHE=true in .env if Redis is not available`);
      console.log(`  4. Check for port conflicts and update PORT and WS_PORT in .env`);
      console.log(`  5. Run 'npm install' to install missing dependencies`);
    } else {
      console.log(`\n${colors.green}All checks passed. The system is ready to run.${colors.reset}`);
    }
  } catch (error) {
    console.error(`\n${colors.red}Error during diagnostics:${colors.reset} ${error.message}`);
    console.error(error.stack);
  }
}

// Run the main function
main().catch(error => {
  console.error(`\n${colors.red}Fatal error:${colors.reset} ${error.message}`);
  console.error(error.stack);
});// scripts/diagnose-system.js - Comprehensive system diagnostic tool

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { spawn, execSync } = require('child_process');
const os = require('os');
const net = require('net');

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

// Print header
console.log(`${colors.bright}${colors.cyan}Sports Analytics - System Diagnostic Tool${colors.reset}`);
console.log(`${colors.cyan}===========================================${colors.reset}\n`);

// Track overall status
let overallStatus = true;

// Function to check if a file exists
function checkFile(filePath, required = true) {
  const exists = fs.existsSync(filePath);
  const status = exists ? `${colors.green}OK${colors.reset}` : (required ? `${colors.red}MISSING${colors.reset}` : `${colors.yellow}MISSING${colors.reset}`);
  
  console.log(`  ${filePath}: ${status}`);
  
  if (required && !exists) {
    overallStatus = false;
  }
  
  return exists;
}

// Function to check Python installation
async function checkPython() {
  console.log(`\n${colors.bright}Checking Python Installation:${colors.reset}`);
  
  // Get Python path from environment variables
  const pythonPath = process.env.PYTHON_PATH || process.env.PYTHON_EXECUTABLE || 'python';
  console.log(`  Python path: ${pythonPath}`);
  
  try {
    // Test Python execution
    const pythonProcess = spawn(pythonPath, ['-c', 'import sys; print(f"Python {sys.version}")']);
    
    return new Promise((resolve) => {
      let output = '';
      let errorOutput = '';
      
      pythonProcess.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      pythonProcess.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });
      
      pythonProcess.on('close', (code) => {
        if (code === 0) {
          console.log(`  Python version: ${colors.green}${output.trim()}${colors.reset}`);
          
          // Check for required packages
          checkPythonPackages(pythonPath);
          resolve(true);
        } else {
          console.log(`  Python execution: ${colors.red}FAILED${colors.reset}`);
          console.log(`  Error: ${errorOutput}`);
          overallStatus = false;
          resolve(false);
        }
      });
      
      pythonProcess.on('error', (error) => {
        console.log(`  Python execution: ${colors.red}ERROR${colors.reset}`);
        console.log(`  Error: ${error.message}`);
        overallStatus = false;
        resolve(false);
      });
      
      // Set timeout
      setTimeout(() => {
        pythonProcess.kill();
        console.log(`  Python execution: ${colors.red}TIMEOUT${colors.reset}`);
        overallStatus = false;
        resolve(false);
      }, 5000);
    });
  } catch (error) {
    console.log(`  Python execution: ${colors.red}ERROR${colors.reset}`);
    console.log(`  Error: ${error.message}`);
    overallStatus = false;
    return false;
  }
}

// Function to check Python packages
function checkPythonPackages(pythonPath) {
  console.log(`\n${colors.bright}Checking Python Packages:${colors.reset}`);
  
  const requiredPackages = [
    'numpy',
    'pandas',
    'scikit-learn',
    'xgboost',
    'lightgbm',
    'pymongo',
    'redis',
    'hyperopt'
  ];
  
  try {
    // Create a Python script to check packages
    const checkScript = `
import importlib.util
import sys

packages = ${JSON.stringify(requiredPackages)}
results = {}

for package in packages:
    try:
        spec = importlib.util.find_spec(package)
        if spec is None:
            results[package] = False
        else:
            module = importlib.import_module(package)
            version = getattr(module, '__version__', 'unknown')
            results[package] = version
    except Exception as e:
        results[package] = False

for package, version in results.items():
    if version:
        print(f"{package}: {version}")
    else:
        print(f"{package}: NOT FOUND")
`;
    
    // Write the script to a temporary file
    const tempScriptPath = path.join(os.tmpdir(), 'check_packages.py');
    fs.writeFileSync(tempScriptPath, checkScript);
    
    // Execute the script
    const output = execSync(`"${pythonPath}" "${tempScriptPath}"`).toString();
    
    // Parse the output
    const lines = output.trim().split('\n');
    for (const line of lines) {
      const [packageName, status] = line.split(': ');
      const isInstalled = status !== 'NOT FOUND';
      
      console.log(`  ${packageName}: ${isInstalled ? `${colors.green}${status}${colors.reset}` : `${colors.red}${status}${colors.reset}`}`);
      
      if (!isInstalled) {
        overallStatus = false;
      }
    }
    
    // Clean up temporary file
    fs.unlinkSync(tempScriptPath);
  } catch (error) {
    console.log(`  Package check: ${colors.red}ERROR${colors.reset}`);
    console.log(`  Error: ${error.message}`);
    overallStatus = false;
  }
}

// Function to check Redis connection
async function checkRedis() {
  console.log(`\n${colors.bright}Checking Redis Connection:${colors.reset}`);
  
  // Skip Redis check if USE_IN_MEMORY_CACHE is true
  if (process.env.USE_IN_MEMORY_CACHE === 'true') {
    console.log(`  Redis check: ${colors.yellow}SKIPPED (Using in-memory cache)${colors.reset}`);
    return true;
  }
  
  const redisHost = process.env.REDIS_HOST || 'localhost';
  const redisPort = parseInt(process.env.REDIS_PORT, 10) || 6379;
  
  console.log(`  Redis host: ${redisHost}`);
  console.log(`  Redis port: ${redisPort}`);
  
  try {
    // Check if Redis module is installed
    try {
      require.resolve('ioredis');
      console.log(`  Redis module: ${colors.green}INSTALLED${colors.reset}`);
    } catch (error) {
      console.log(`  Redis module: ${colors.red}NOT INSTALLED${colors.reset}`);
      console.log(`  Run 'npm install ioredis' to install the Redis module.`);
      overallStatus = false;
      return false;
    }
    
    // Check if Redis server is running
    const Redis = require('ioredis');
    const redis = new Redis({
      host: redisHost,
      port: redisPort,
      password: process.env.REDIS_PASSWORD || undefined,
      connectTimeout: 5000
    });
    
    return new Promise((resolve) => {
      redis.on('ready', () => {
        console.log(`  Redis connection: ${colors.green}OK${colors.reset}`);
        redis.quit();
        resolve(true);
      });
      
      redis.on('error', (error) => {
        console.log(`  Redis connection: ${colors.red}FAILED${colors.reset}`);
        console.log(`  Error: ${error.message}`);
        console.log(`  Recommendation: Enable in-memory cache by setting USE_IN_MEMORY_CACHE=true in .env`);
        redis.quit();
        overallStatus = false;
        resolve(false);
      });
      
      // Set timeout
      setTimeout(() => {
        console.log(`  Redis connection: ${colors.red}TIMEOUT${colors.reset}`);
        console.log(`  Recommendation: Enable in-memory cache by setting USE_IN_MEMORY_CACHE=true in .env`);
        redis.disconnect();
        overallStatus = false;
        resolve(false);
      }, 5000);
    });
  } catch (error) {
    console.log(`  Redis check: ${colors.red}ERROR${colors.reset}`);
    console.log(`  Error: ${error.message}`);
    overallStatus = false;
    return false;
  }
}

// Function to check MongoDB connection
async function checkMongoDB() {
  console.log(`\n${colors.bright}Checking MongoDB Connection:${colors.reset}`);
  
  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/sports-analytics';
  console.log(`  MongoDB URI: ${mongoUri.replace(/\/\/([^:]+):([^@]+)@/, '//***:***@')}`); // Hide credentials
  
  try {
    // Check if MongoDB module is installed
    try {
      require.resolve('mongodb');
      console.log(`  MongoDB module: ${colors.green}INSTALLED${colors.reset}`);
    } catch (error) {
      console.log(`  MongoDB module: ${colors.red}NOT INSTALLED${colors.reset}`);
      console.log(`  Run 'npm install mongodb' to install the MongoDB module.`);
      overallStatus = false;
      return false;
    }
    
    // Check MongoDB connection
    const { MongoClient } = require('mongodb');
    const client = new MongoClient(mongoUri, {
      connectTimeoutMS: 5000,
      serverSelectionTimeoutMS: 5000
    });
    
    try {
      await client.connect();
      await client.db().command({ ping: 1 });
      console.log(`  MongoDB connection: ${colors.green}OK${colors.reset}`);
      await client.close();
      return true;
    } catch (error) {
      console.log(`  MongoDB connection: ${colors.red}FAILED${colors.reset}`);
      console.log(`  Error: ${error.message}`);
      overallStatus = false;
      return false;
    }
  } catch (error) {
    console.log(`  MongoDB check: ${colors.red}ERROR${colors.reset}`);
    console.log(`  Error: ${error.message}`);
    overallStatus = false;
    return false;
  }
}

// Function to check port availability
async function checkPorts() {
  console.log(`\n${colors.bright}Checking Port Availability:${colors.reset}`);
  
  const httpPort = parseInt(process.env.PORT, 10) || 5050;
  const wsPort = parseInt(process.env.WS_PORT, 10) || 5150;
  
  console.log(`  HTTP port: ${httpPort}`);
  console.log(`  WebSocket port: ${wsPort}`);
  
  // Function to check if a port is available
  const isPortAvailable = (port) => {
    return new Promise((resolve) => {
      const server = net.createServer()
        .once('error', () => resolve(false))
        .once('listening', () => {
          server.once('close', () => resolve(true)).close();
        })
        .listen(port);
    });
  };
  
  // Check HTTP port
  const httpPortAvailable = await isPortAvailable(httpPort);
  console.log(`  HTTP port availability: ${httpPortAvailable ? `${colors.green}AVAILABLE${colors.reset}` : `${colors.red}IN USE${colors.reset}`}`);
  
  // Check WebSocket port
  const wsPortAvailable = await isPortAvailable(wsPort);
  console.log(`  WebSocket port availability: ${wsPortAvailable ? `${colors.green}AVAILABLE${colors.reset}` : `${colors.red}IN USE${colors.reset}`}`);
  
  if (!httpPortAvailable) {
    console.log(`  Recommendation: Change PORT in .env to an available port.`);
    overallStatus = false;
  }
  
  if (!wsPortAvailable) {
    console.log(`  Recommendation: Change WS_PORT in .env to an available port.`);
    overallStatus = false;
  }
  
  return httpPortAvailable && wsPortAvailable;
}

// Function to check system resources
function checkSystemResources() {
  console.log(`\n${colors.bright}Checking System Resources:${colors.reset}`);
  
  // Check memory
  const totalMemory = os.totalmem();
  const freeMemory = os.freemem();
  const totalMemoryGB = (totalMemory / (1024 * 1024 * 1024)).toFixed(2);
  const freeMemoryGB = (freeMemory / (1024 * 1024 * 1024)).toFixed(2);
  const memoryUsagePercent = ((totalMemory - freeMemory) / totalMemory * 100).toFixed(2);
  
  console.log(`  Total memory: ${totalMemoryGB} GB`);
  console.log(`  Free memory: ${freeMemoryGB} GB`);
  console.log(`  Memory usage: ${memoryUsagePercent}%`);
  
  // Check CPU
  const cpuCount = os.cpus().length;
  console.log(`  CPU cores: ${cpuCount}`);
  
  // Check disk space
  try {
    let diskInfo;
    if (process.platform === 'win32') {
      // Windows
      const drive = process.cwd().split(path.sep)[0];
      diskInfo = execSync(`wmic logicaldisk where "DeviceID='${drive}'" get Size,FreeSpace /format:csv`).toString();
      const lines = diskInfo.trim().split('\n');
      if (lines.length >= 2) {
        const values = lines[1].split(',');
        if (values.length >= 3) {
          const freeSpace = parseInt(values[1]) / (1024 * 1024 * 1024);
          const totalSpace = parseInt(values[2]) / (1024 * 1024 * 1024);
          console.log(`  Disk space (${drive}): ${freeSpace.toFixed(2)} GB free of ${totalSpace.toFixed(2)} GB`);
        }
      }
    } else {
      // Unix-like
      const df = execSync(`df -h "${process.cwd()}"`).toString();
      const lines = df.trim().split('\n');
      if (lines.length >= 2) {
        const values = lines[1].split(/\s+/);
        if (values.length >= 4) {
          console.log(`  Disk space: ${values[3]} free of ${values[1]}`);
        }
      }
    }
  } catch (error) {
    console.log(`  Disk space check: ${colors.red}ERROR${colors.reset}`);
    console.log(`  Error: ${error.message}`);
  }
  
  // Check for resource issues
  if (freeMemory < 500 * 1024 * 1024) { // Less than 500MB free
    console.log(`  ${colors.yellow}Warning: Low memory available. Performance may be affected.${colors.reset}`);
    console.log(`  Recommendation: Close other applications to free up memory.`);
    overallStatus = false;
  }
  
  if (cpuCount < 2) {
    console.log(`  ${colors.yellow}Warning: Limited CPU resources. Performance may be affected.${colors.reset}`);
    overallStatus = false;
  }
  
  return true;
}

// Function to check required files
function checkRequiredFiles() {
  console.log(`\n${colors.bright}Checking Required Files:${colors.reset}`);
  
  // Check main application files
  checkFile('api.js', true);
  checkFile('package.json', true);
  checkFile('.env', true);
  
  // Check scripts directory
  console.log(`\n  ${colors.bright}Scripts:${colors.reset}`);
  checkFile('scripts/predictive_model.py', true);
  
  // Check utils directory
  console.log(`\n  ${colors.bright}Utils:${colors.reset}`);
  checkFile('utils/pythonBridge.js', true);
  checkFile('utils/cache.js', true);
  checkFile('utils/db.js', true);
  checkFile('utils/websocket-server.js', true);
  checkFile('utils/metricsManager.js', false);
  checkFile('utils/rateLimiter.js', false);
  
  return true;
}

// Function to check Node.js version and modules
function checkNodeEnvironment() {
  console.log(`\n${colors.bright}Checking Node.js Environment:${colors.reset}`);
  
  // Check Node.js version
  const nodeVersion = process.version;
  console.log(`  Node.js version: ${nodeVersion}`);
  
  // Check npm version
  try {
    const npmVersion = execSync('npm -v').toString().trim();
    console.log(`  npm version: ${npmVersion}`);
  } catch (error) {
    console.log(`  npm version: ${colors.red}ERROR${colors.reset}`);
    console.log(`  Error: ${error.message}`);
  }
  
  // Check required modules
  console.log(`\n  ${colors.bright}Required modules:${colors.reset}`);
  const requiredModules = [
    'express',
    'mongodb',
    'ioredis',
    'ws',
    'winston',
    'dotenv',
    'async-lock',
    'opossum'
  ];
  
  for (const moduleName of requiredModules) {
    try {
      require.resolve(moduleName);
      console.log(`  ${moduleName}: ${colors.green}INSTALLED${colors.reset}`);
    } catch (error) {
      console.log(`  ${moduleName}: ${colors.red}NOT INSTALLED${colors.reset}`);
      console.log(`  Run 'npm install ${moduleName}' to install the module.`);
      overallStatus = false;
    }
  }
  
  return true;
}

// Main function
async function main() {
  try {
    // Check required files
    checkRequiredFiles();
    
    // Check Node.js environment
    checkNodeEnvironment();
    
    // Check Python installation
    await checkPython();
    
    // Check Redis connection
    await checkRedis();
    
    // Check MongoDB connection
    await checkMongoDB();
    
    // Check port availability
    await checkPorts();
    
    // Check system resources
    checkSystemResources();
    
    // Print overall status
    console.log(`\n${colors.bright}Overall Status:${colors.reset} ${overallStatus ? `${colors.green}PASS${colors.reset}` : `${colors.red}FAIL${colors.reset}`}`);
    
    if (!overallStatus) {
      console.log(`\n${colors.yellow}Recommendations:${colors.reset}`);
      console.log(`  1. Fix any issues marked as ${colors.red}FAILED${colors.reset} or ${colors.red}MISSING${colors.reset}`);
      console.log(`  2. Run 'node scripts/fix-python-path.js' to fix Python path issues`);
      console.log(`  3. Set USE_IN_MEMORY_CACHE=true in .env if Redis is not available`);
      console.log(`  4. Check for port conflicts and update PORT and WS_PORT in .env`);
      console.log(`  5. Run 'npm install' to install missing dependencies`);
    } else {
      console.log(`\n${colors.green}All checks passed. The system is ready to run.${colors.reset}`);
    }
  } catch (error) {
    console.error(`\n${colors.red}Error during diagnostics:${colors.reset} ${error.message}`);
    console.error(error.stack);
  }
}

// Run the main function
main().catch(error => {
  console.error(`\n${colors.red}Fatal error:${colors.reset} ${error.message}`);
  console.error(error.stack);
});// scripts/diagnose-system.js - Comprehensive system diagnostic tool

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { spawn, execSync } = require('child_process');
const os = require('os');
const net = require('net');

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

// Print header
console.log(`${colors.bright}${colors.cyan}Sports Analytics - System Diagnostic Tool${colors.reset}`);
console.log(`${colors.cyan}===========================================${colors.reset}\n`);

// Track overall status
let overallStatus = true;

// Function to check if a file exists
function checkFile(filePath, required = true) {
  const exists = fs.existsSync(filePath);
  const status = exists ? `${colors.green}OK${colors.reset}` : (required ? `${colors.red}MISSING${colors.reset}` : `${colors.yellow}MISSING${colors.reset}`);
  
  console.log(`  ${filePath}: ${status}`);
  
  if (required && !exists) {
    overallStatus = false;
  }
  
  return exists;
}

// Function to check Python installation
async function checkPython() {
  console.log(`\n${colors.bright}Checking Python Installation:${colors.reset}`);
  
  // Get Python path from environment variables
  const pythonPath = process.env.PYTHON_PATH || process.env.PYTHON_EXECUTABLE || 'python';
  console.log(`  Python path: ${pythonPath}`);
  
  try {
    // Test Python execution
    const pythonProcess = spawn(pythonPath, ['-c', 'import sys; print(f"Python {sys.version}")']);
    
    return new Promise((resolve) => {
      let output = '';
      let errorOutput = '';
      
      pythonProcess.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      pythonProcess.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });
      
      pythonProcess.on('close', (code) => {
        if (code === 0) {
          console.log(`  Python version: ${colors.green}${output.trim()}${colors.reset}`);
          
          // Check for required packages
          checkPythonPackages(pythonPath);
          resolve(true);
        } else {
          console.log(`  Python execution: ${colors.red}FAILED${colors.reset}`);
          console.log(`  Error: ${errorOutput}`);
          overallStatus = false;
          resolve(false);
        }
      });
      
      pythonProcess.on('error', (error) => {
        console.log(`  Python execution: ${colors.red}ERROR${colors.reset}`);
        console.log(`  Error: ${error.message}`);
        overallStatus = false;
        resolve(false);
      });
      
      // Set timeout
      setTimeout(() => {
        pythonProcess.kill();
        console.log(`  Python execution: ${colors.red}TIMEOUT${colors.reset}`);
        overallStatus = false;
        resolve(false);
      }, 5000);
    });
  } catch (error) {
    console.log(`  Python execution: ${colors.red}ERROR${colors.reset}`);
    console.log(`  Error: ${error.message}`);
    overallStatus = false;
    return false;
  }
}

// Function to check Python packages
function checkPythonPackages(pythonPath) {
  console.log(`\n${colors.bright}Checking Python Packages:${colors.reset}`);
  
  const requiredPackages = [
    'numpy',
    'pandas',
    'scikit-learn',
    'xgboost',
    'lightgbm',
    'pymongo',
    'redis',
    'hyperopt'
  ];
  
  try {
    // Create a Python script to check packages
    const checkScript = `
import importlib.util
import sys

packages = ${JSON.stringify(requiredPackages)}
results = {}

for package in packages:
    try:
        spec = importlib.util.find_spec(package)
        if spec is None:
            results[package] = False
        else:
            module = importlib.import_module(package)
            version = getattr(module, '__version__', 'unknown')
            results[package] = version
    except Exception as e:
        results[package] = False

for package, version in results.items():
    if version:
        print(f"{package}: {version}")
    else:
        print(f"{package}: NOT FOUND")
`;
    
    // Write the script to a temporary file
    const tempScriptPath = path.join(os.tmpdir(), 'check_packages.py');
    fs.writeFileSync(tempScriptPath, checkScript);
    
    // Execute the script
    const output = execSync(`"${pythonPath}" "${tempScriptPath}"`).toString();
    
    // Parse the output
    const lines = output.trim().split('\n');
    for (const line of lines) {
      const [packageName, status] = line.split(': ');
      const isInstalled = status !== 'NOT FOUND';
      
      console.log(`  ${packageName}: ${isInstalled ? `${colors.green}${status}${colors.reset}` : `${colors.red}${status}${colors.reset}`}`);
      
      if (!isInstalled) {
        overallStatus = false;
      }
    }
    
    // Clean up temporary file
    fs.unlinkSync(tempScriptPath);
  } catch (error) {
    console.log(`  Package check: ${colors.red}ERROR${colors.reset}`);
    console.log(`  Error: ${error.message}`);
    overallStatus = false;
  }
}

// Function to check Redis connection
async function checkRedis() {
  console.log(`\n${colors.bright}Checking Redis Connection:${colors.reset}`);
  
  // Skip Redis check if USE_IN_MEMORY_CACHE is true
  if (process.env.USE_IN_MEMORY_CACHE === 'true') {
    console.log(`  Redis check: ${colors.yellow}SKIPPED (Using in-memory cache)${colors.reset}`);
    return true;
  }
  
  const redisHost = process.env.REDIS_HOST || 'localhost';
  const redisPort = parseInt(process.env.REDIS_PORT, 10) || 6379;
  
  console.log(`  Redis host: ${redisHost}`);
  console.log(`  Redis port: ${redisPort}`);
  
  try {
    // Check if Redis module is installed
    try {
      require.resolve('ioredis');
      console.log(`  Redis module: ${colors.green}INSTALLED${colors.reset}`);
    } catch (error) {
      console.log(`  Redis module: ${colors.red}NOT INSTALLED${colors.reset}`);
      console.log(`  Run 'npm install ioredis' to install the Redis module.`);
      overallStatus = false;
      return false;
    }
    
    // Check if Redis server is running
    const Redis = require('ioredis');
    const redis = new Redis({
      host: redisHost,
      port: redisPort,
      password: process.env.REDIS_PASSWORD || undefined,
      connectTimeout: 5000
    });
    
    return new Promise((resolve) => {
      redis.on('ready', () => {
        console.log(`  Redis connection: ${colors.green}OK${colors.reset}`);
        redis.quit();
        resolve(true);
      });
      
      redis.on('error', (error) => {
        console.log(`  Redis connection: ${colors.red}FAILED${colors.reset}`);
        console.log(`  Error: ${error.message}`);
        console.log(`  Recommendation: Enable in-memory cache by setting USE_IN_MEMORY_CACHE=true in .env`);
        redis.quit();
        overallStatus = false;
        resolve(false);
      });
      
      // Set timeout
      setTimeout(() => {
        console.log(`  Redis connection: ${colors.red}TIMEOUT${colors.reset}`);
        console.log(`  Recommendation: Enable in-memory cache by setting USE_IN_MEMORY_CACHE=true in .env`);
        redis.disconnect();
        overallStatus = false;
        resolve(false);
      }, 5000);
    });
  } catch (error) {
    console.log(`  Redis check: ${colors.red}ERROR${colors.reset}`);
    console.log(`  Error: ${error.message}`);
    overallStatus = false;
    return false;
  }
}

// Function to check MongoDB connection
async function checkMongoDB() {
  console.log(`\n${colors.bright}Checking MongoDB Connection:${colors.reset}`);
  
  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/sports-analytics';
  console.log(`  MongoDB URI: ${mongoUri.replace(/\/\/([^:]+):([^@]+)@/, '//***:***@')}`); // Hide credentials
  
  try {
    // Check if MongoDB module is installed
    try {
      require.resolve('mongodb');
      console.log(`  MongoDB module: ${colors.green}INSTALLED${colors.reset}`);
    } catch (error) {
      console.log(`  MongoDB module: ${colors.red}NOT INSTALLED${colors.reset}`);
      console.log(`  Run 'npm install mongodb' to install the MongoDB module.`);
      overallStatus = false;
      return false;
    }
    
    // Check MongoDB connection
    const { MongoClient } = require('mongodb');
    const client = new MongoClient(mongoUri, {
      connectTimeoutMS: 5000,
      serverSelectionTimeoutMS: 5000
    });
    
    try {
      await client.connect();
      await client.db().command({ ping: 1 });
      console.log(`  MongoDB connection: ${colors.green}OK${colors.reset}`);
      await client.close();
      return true;
    } catch (error) {
      console.log(`  MongoDB connection: ${colors.red}FAILED${colors.reset}`);
      console.log(`  Error: ${error.message}`);
      overallStatus = false;
      return false;
    }
  } catch (error) {
    console.log(`  MongoDB check: ${colors.red}ERROR${colors.reset}`);
    console.log(`  Error: ${error.message}`);
    overallStatus = false;
    return false;
  }
}

// Function to check port availability
async function checkPorts() {
  console.log(`\n${colors.bright}Checking Port Availability:${colors.reset}`);
  
  const httpPort = parseInt(process.env.PORT, 10) || 5050;
  const wsPort = parseInt(process.env.WS_PORT, 10) || 5150;
  
  console.log(`  HTTP port: ${httpPort}`);
  console.log(`  WebSocket port: ${wsPort}`);
  
  // Function to check if a port is available
  const isPortAvailable = (port) => {
    return new Promise((resolve) => {
      const server = net.createServer()
        .once('error', () => resolve(false))
        .once('listening', () => {
          server.once('close', () => resolve(true)).close();
        })
        .listen(port);
    });
  };
  
  // Check HTTP port
  const httpPortAvailable = await isPortAvailable(httpPort);
  console.log(`  HTTP port availability: ${httpPortAvailable ? `${colors.green}AVAILABLE${colors.reset}` : `${colors.red}IN USE${colors.reset}`}`);
  
  // Check WebSocket port
  const wsPortAvailable = await isPortAvailable(wsPort);
  console.log(`  WebSocket port availability: ${wsPortAvailable ? `${colors.green}AVAILABLE${colors.reset}` : `${colors.red}IN USE${colors.reset}`}`);
  
  if (!httpPortAvailable) {
    console.log(`  Recommendation: Change PORT in .env to an available port.`);
    overallStatus = false;
  }
  
  if (!wsPortAvailable) {
    console.log(`  Recommendation: Change WS_PORT in .env to an available port.`);
    overallStatus = false;
  }
  
  return httpPortAvailable && wsPortAvailable;
}

// Function to check system resources
function checkSystemResources() {
  console.log(`\n${colors.bright}Checking System Resources:${colors.reset}`);
  
  // Check memory
  const totalMemory = os.totalmem();
  const freeMemory = os.freemem();
  const totalMemoryGB = (totalMemory / (1024 * 1024 * 1024)).toFixed(2);
  const freeMemoryGB = (freeMemory / (1024 * 1024 * 1024)).toFixed(2);
  const memoryUsagePercent = ((totalMemory - freeMemory) / totalMemory * 100).toFixed(2);
  
  console.log(`  Total memory: ${totalMemoryGB} GB`);
  console.log(`  Free memory: ${freeMemoryGB} GB`);
  console.log(`  Memory usage: ${memoryUsagePercent}%`);
  
  // Check CPU
  const cpuCount = os.cpus().length;
  console.log(`  CPU cores: ${cpuCount}`);
  
  // Check disk space
  try {
    let diskInfo;
    if (process.platform === 'win32') {
      // Windows
      const drive = process.cwd().split(path.sep)[0];
      diskInfo = execSync(`wmic logicaldisk where "DeviceID='${drive}'" get Size,FreeSpace /format:csv`).toString();
      const lines = diskInfo.trim().split('\n');
      if (lines.length >= 2) {
        const values = lines[1].split(',');
        if (values.length >= 3) {
          const freeSpace = parseInt(values[1]) / (1024 * 1024 * 1024);
          const totalSpace = parseInt(values[2]) / (1024 * 1024 * 1024);
          console.log(`  Disk space (${drive}): ${freeSpace.toFixed(2)} GB free of ${totalSpace.toFixed(2)} GB`);
        }
      }
    } else {
      // Unix-like
      const df = execSync(`df -h "${process.cwd()}"`).toString();
      const lines = df.trim().split('\n');
      if (lines.length >= 2) {
        const values = lines[1].split(/\s+/);
        if (values.length >= 4) {
          console.log(`  Disk space: ${values[3]} free of ${values[1]}`);
        }
      }
    }
  } catch (error) {
    console.log(`  Disk space check: ${colors.red}ERROR${colors.reset}`);
    console.log(`  Error: ${error.message}`);
  }
  
  // Check for resource issues
  if (freeMemory < 500 * 1024 * 1024) { // Less than 500MB free
    console.log(`  ${colors.yellow}Warning: Low memory available. Performance may be affected.${colors.reset}`);
    console.log(`  Recommendation: Close other applications to free up memory.`);
    overallStatus = false;
  }
  
  if (cpuCount < 2) {
    console.log(`  ${colors.yellow}Warning: Limited CPU resources. Performance may be affected.${colors.reset}`);
    overallStatus = false;
  }
  
  return true;
}

// Function to check required files
function checkRequiredFiles() {
  console.log(`\n${colors.bright}Checking Required Files:${colors.reset}`);
  
  // Check main application files
  checkFile('api.js', true);
  checkFile('package.json', true);
  checkFile('.env', true);
  
  // Check scripts directory
  console.log(`\n  ${colors.bright}Scripts:${colors.reset}`);
  checkFile('scripts/predictive_model.py', true);
  
  // Check utils directory
  console.log(`\n  ${colors.bright}Utils:${colors.reset}`);
  checkFile('utils/pythonBridge.js', true);
  checkFile('utils/cache.js', true);
  checkFile('utils/db.js', true);
  checkFile('utils/websocket-server.js', true);
  checkFile('utils/metricsManager.js', false);
  checkFile('utils/rateLimiter.js', false);
  
  return true;
}

// Function to check Node.js version and modules
function checkNodeEnvironment() {
  console.log(`\n${colors.bright}Checking Node.js Environment:${colors.reset}`);
  
  // Check Node.js version
  const nodeVersion = process.version;
  console.log(`  Node.js version: ${nodeVersion}`);
  
  // Check npm version
  try {
    const npmVersion = execSync('npm -v').toString().trim();
    console.log(`  npm version: ${npmVersion}`);
  } catch (error) {
    console.log(`  npm version: ${colors.red}ERROR${colors.reset}`);
    console.log(`  Error: ${error.message}`);
  }
  
  // Check required modules
  console.log(`\n  ${colors.bright}Required modules:${colors.reset}`);
  const requiredModules = [
    'express',
    'mongodb',
    'ioredis',
    'ws',
    'winston',
    'dotenv',
    'async-lock',
    'opossum'
  ];
  
  for (const moduleName of requiredModules) {
    try {
      require.resolve(moduleName);
      console.log(`  ${moduleName}: ${colors.green}INSTALLED${colors.reset}`);
    } catch (error) {
      console.log(`  ${moduleName}: ${colors.red}NOT INSTALLED${colors.reset}`);
      console.log(`  Run 'npm install ${moduleName}' to install the module.`);
      overallStatus = false;
    }
  }
  
  return true;
}

// Main function
async function main() {
  try {
    // Check required files
    checkRequiredFiles();
    
    // Check Node.js environment
    checkNodeEnvironment();
    
    // Check Python installation
    await checkPython();
    
    // Check Redis connection
    await checkRedis();
    
    // Check MongoDB connection
    await checkMongoDB();
    
    // Check port availability
    await checkPorts();
    
    // Check system resources
    checkSystemResources();
    
    // Print overall status
    console.log(`\n${colors.bright}Overall Status:${colors.reset} ${overallStatus ? `${colors.green}PASS${colors.reset}` : `${colors.red}FAIL${colors.reset}`}`);
    
    if (!overallStatus) {
      console.log(`\n${colors.yellow}Recommendations:${colors.reset}`);
      console.log(`  1. Fix any issues marked as ${colors.red}FAILED${colors.reset} or ${colors.red}MISSING${colors.reset}`);
      console.log(`  2. Run 'node scripts/fix-python-path.js' to fix Python path issues`);
      console.log(`  3. Set USE_IN_MEMORY_CACHE=true in .env if Redis is not available`);
      console.log(`  4. Check for port conflicts and update PORT and WS_PORT in .env`);
      console.log(`  5. Run 'npm install' to install missing dependencies`);
    } else {
      console.log(`\n${colors.green}All checks passed. The system is ready to run.${colors.reset}`);
    }
  } catch (error) {
    console.error(`\n${colors.red}Error during diagnostics:${colors.reset} ${error.message}`);
    console.error(error.stack);
  }
}

// Run the main function
main().catch(error => {
  console.error(`\n${colors.red}Fatal error:${colors.reset} ${error.message}`);
  console.error(error.stack);
});// scripts/diagnose-system.js
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');
const { MongoClient } = require('mongodb');
const Redis = require('ioredis');
const winston = require('winston');
const os = require('os');
const net = require('net');

// Configure logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ level, message, timestamp }) => {
      return `${timestamp} ${level.toUpperCase()}: ${message}`;
    })
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    }),
    new winston.transports.File({ filename: 'system-diagnosis.log' })
  ]
});

// System information
async function checkSystemInfo() {
  logger.info('=== SYSTEM INFORMATION ===');
  logger.info(`Platform: ${os.platform()} ${os.release()}`);
  logger.info(`Architecture: ${os.arch()}`);
  logger.info(`CPU: ${os.cpus()[0].model} (${os.cpus().length} cores)`);
  logger.info(`Total Memory: ${Math.round(os.totalmem() / (1024 * 1024 * 1024))} GB`);
  logger.info(`Free Memory: ${Math.round(os.freemem() / (1024 * 1024 * 1024))} GB`);
  logger.info(`Node.js Version: ${process.version}`);
  logger.info(`Current Directory: ${process.cwd()}`);
  
  // Check environment variables
  logger.info('\n=== ENVIRONMENT VARIABLES ===');
  const relevantEnvVars = [
    'NODE_ENV', 'PORT', 'PYTHON_PATH', 'PYTHON_EXECUTABLE', 
    'MONGODB_URI', 'REDIS_HOST', 'REDIS_PORT'
  ];
  
  relevantEnvVars.forEach(varName => {
    logger.info(`${varName}: ${process.env[varName] || 'Not set'}`);
  });
}

// Check Python installation
async function checkPython() {
  logger.info('\n=== PYTHON INSTALLATION ===');
  
  // Check common Python paths
  const commonPaths = [
    'C:\\Python39\\python.exe',
    'C:\\Python310\\python.exe',
    'C:\\Python311\\python.exe',
    'C:\\Program Files\\Python39\\python.exe',
    'C:\\Program Files\\Python310\\python.exe',
    'C:\\Program Files\\Python311\\python.exe',
    'C:\\Users\\d07ch\\AppData\\Local\\Programs\\Python\\Python39\\python.exe',
    'C:\\Users\\d07ch\\AppData\\Local\\Programs\\Python\\Python310\\python.exe',
    'C:\\Users\\d07ch\\AppData\\Local\\Programs\\Python\\Python311\\python.exe'
  ];
  
  // Check if paths exist
  logger.info('Checking common Python paths:');
  commonPaths.forEach(pythonPath => {
    if (fs.existsSync(pythonPath)) {
      logger.info(`✓ Found Python at: ${pythonPath}`);
      
      // Test if this Python works
      try {
        const pythonVersion = execSync(`"${pythonPath}" --version`, { encoding: 'utf8' }).trim();
        logger.info(`  Version: ${pythonVersion}`);
        
        // Check for required packages
        try {
          const packages = [
            'numpy', 'pandas', 'scikit-learn', 'xgboost', 
            'lightgbm', 'pymongo', 'redis'
          ];
          
          logger.info('  Checking key packages:');
          packages.forEach(pkg => {
            try {
              execSync(`"${pythonPath}" -c "import ${pkg}; print(f'${pkg} is installed')"`, { encoding: 'utf8' });
              logger.info(`    ✓ ${pkg}`);
            } catch (e) {
              logger.info(`    ✗ ${pkg} not installed`);
            }
          });
        } catch (e) {
          logger.error(`  Error checking packages: ${e.message}`);
        }
      } catch (e) {
        logger.error(`  Error running Python: ${e.message}`);
      }
    } else {
      logger.info(`✗ Not found: ${pythonPath}`);
    }
  });
  
  // Try to get Python path from system
  try {
    logger.info('\nChecking system Python:');
    const pythonPath = execSync('where python', { encoding: 'utf8' }).trim().split('\n')[0];
    logger.info(`System Python path: ${pythonPath}`);
    
    // Test if Python works
    const pythonVersion = execSync(`"${pythonPath}" --version`, { encoding: 'utf8' }).trim();
    logger.info(`Python version: ${pythonVersion}`);
  } catch (error) {
    logger.error(`Error finding Python in system PATH: ${error.message}`);
  }
  
  // Check Python launcher
  try {
    logger.info('\nChecking Python launcher (py):');
    const pyPath = execSync('where py', { encoding: 'utf8' }).trim().split('\n')[0];
    logger.info(`Python launcher path: ${pyPath}`);
    
    // Test if Python launcher works
    const pyVersion = execSync(`"${pyPath}" --version`, { encoding: 'utf8' }).trim();
    logger.info(`Python launcher version: ${pyVersion}`);
  } catch (error) {
    logger.error(`Python launcher not found in system PATH: ${error.message}`);
  }
}

// Check MongoDB connection
async function checkMongoDB() {
  logger.info('\n=== MONGODB CONNECTION ===');
  
  const url = process.env.MONGODB_URI || 'mongodb://localhost:27017/sports-analytics';
  logger.info(`MongoDB URI: ${url}`);
  
  let client;
  try {
    // Connect to MongoDB
    client = new MongoClient(url, {
      maxPoolSize: 10,
      connectTimeoutMS: 5000,
      socketTimeoutMS: 10000
    });
    
    await client.connect();
    logger.info('✓ Successfully connected to MongoDB');
    
    // Get database reference
    const dbName = process.env.MONGODB_DB_NAME || 'sports-analytics';
    const db = client.db(dbName);
    logger.info(`Using database: ${dbName}`);
    
    // Verify connection with a ping command
    const pingResult = await db.command({ ping: 1 });
    logger.info(`Ping command result: ${JSON.stringify(pingResult)}`);
    
    // List collections
    const collections = await db.listCollections().toArray();
    logger.info(`Found ${collections.length} collections in the database`);
    collections.forEach((collection, index) => {
      logger.info(`${index + 1}. ${collection.name}`);
    });
    
    return true;
  } catch (error) {
    logger.error(`MongoDB connection failed: ${error.message}`);
    return false;
  } finally {
    // Close the connection
    if (client) {
      await client.close();
      logger.info('MongoDB connection closed');
    }
  }
}

// Check Redis connection
async function checkRedis() {
  logger.info('\n=== REDIS CONNECTION ===');
  
  const redisHost = process.env.REDIS_HOST || 'localhost';
  const redisPort = process.env.REDIS_PORT || 6379;
  const redisPassword = process.env.REDIS_PASSWORD || '';
  
  logger.info(`Redis Host: ${redisHost}`);
  logger.info(`Redis Port: ${redisPort}`);
  logger.info(`Redis Password: ${redisPassword ? '(set)' : '(not set)'}`);
  
  let redis;
  try {
    // Connect to Redis
    redis = new Redis({
      host: redisHost,
      port: redisPort,
      password: redisPassword,
      connectTimeout: 5000,
      maxRetriesPerRequest: 1
    });
    
    // Set up event handlers
    redis.on('error', (err) => {
      logger.error(`Redis error: ${err.message}`);
    });
    
    // Wait for connection or timeout
    const pingResult = await Promise.race([
      redis.ping(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Connection timeout')), 5000))
    ]);
    
    logger.info(`✓ Successfully connected to Redis. Ping result: ${pingResult}`);
    return true;
  } catch (error) {
    logger.error(`Redis connection failed: ${error.message}`);
    return false;
  } finally {
    // Close the connection
    if (redis) {
      redis.disconnect();
      logger.info('Redis connection closed');
    }
  }
}

// Check file system and project structure
async function checkFileSystem() {
  logger.info('\n=== FILE SYSTEM CHECK ===');
  
  // Check important directories
  const directories = [
    'scripts',
    'utils',
    'logs',
    'public',
    'routes'
  ];
  
  directories.forEach(dir => {
    const dirPath = path.join(process.cwd(), dir);
    if (fs.existsSync(dirPath)) {
      logger.info(`✓ Directory exists: ${dir}`);
    } else {
      logger.error(`✗ Directory missing: ${dir}`);
    }
  });
  
  // Check critical files
  const criticalFiles = [
    'api.js',
    'scripts/predictive_model.py',
    'utils/pythonBridge.js',
    '.env'
  ];
  
  criticalFiles.forEach(file => {
    const filePath = path.join(process.cwd(), file);
    if (fs.existsSync(filePath)) {
      logger.info(`✓ File exists: ${file}`);
      
      // Check file size
      const stats = fs.statSync(filePath);
      logger.info(`  Size: ${Math.round(stats.size / 1024)} KB`);
      logger.info(`  Last modified: ${stats.mtime}`);
    } else {
      logger.error(`✗ File missing: ${file}`);
    }
  });
  
  // Check .env file
  const envPath = path.join(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    logger.info('\nChecking .env file:');
    const envContent = fs.readFileSync(envPath, 'utf8');
    const envLines = envContent.split('\n');
    
    // Check for important configuration
    const requiredVars = [
      'PYTHON_PATH',
      'MONGODB_URI',
      'REDIS_HOST',
      'REDIS_PORT'
    ];
    
    requiredVars.forEach(varName => {
      const varLine = envLines.find(line => line.startsWith(`${varName}=`));
      if (varLine) {
        logger.info(`✓ ${varName} is configured`);
      } else {
        logger.error(`✗ ${varName} is missing from .env file`);
      }
    });
  } else {
    logger.error('✗ .env file is missing');
  }
}

// Check network ports
async function checkPorts() {
  logger.info('\n=== NETWORK PORTS CHECK ===');

  const portsToCheck = [
    { port: process.env.PORT || 5000, service: 'HTTP Server' },
    { port: process.env.WS_PORT || 5150, service: 'WebSocket Server' },
    { port: process.env.REDIS_PORT || 6379, service: 'Redis' },
    { port: 27017, service: 'MongoDB' }
  ];
  
  for (const portInfo of portsToCheck) {
    logger.info(`Checking port ${portInfo.port} (${portInfo.service})...`);
    
    try {
      // Check if port is in use
      const server = net.createServer();
      
      await new Promise((resolve, reject) => {
        server.once('error', (err) => {
          if (err.code === 'EADDRINUSE') {
            logger.info(`✓ Port ${portInfo.port} is in use (${portInfo.service} may be running)`);
          } else {
            logger.error(`Error checking port ${portInfo.port}: ${err.message}`);
          }
          resolve();
        });
        
        server.once('listening', () => {
          logger.info(`✗ Port ${portInfo.port} is available (${portInfo.service} is NOT running)`);
          server.close();
          resolve();
        });
        
        server.listen(portInfo.port);
      });
    } catch (error) {
      logger.error(`Error checking port ${portInfo.port}: ${error.message}`);
    }
  }
}

// Check Node.js dependencies
async function checkDependencies() {
  logger.info('\n=== NODE.JS DEPENDENCIES ===');
  
  try {
    // Check package.json
    const packageJsonPath = path.join(process.cwd(), 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      const packageJson = require(packageJsonPath);
      logger.info(`Project name: ${packageJson.name}`);
      logger.info(`Version: ${packageJson.version}`);
      
      // Check critical dependencies
      const criticalDeps = [
        'python-shell',
        'mongodb',
        'ioredis',
        'redis',
        'ws',
        'express'
      ];
      
      logger.info('\nChecking critical dependencies:');
      criticalDeps.forEach(dep => {
        if (packageJson.dependencies[dep]) {
          logger.info(`✓ ${dep}: ${packageJson.dependencies[dep]}`);
          
          // Check if module can be loaded
          try {
            require(dep);
            logger.info(`  Module can be loaded successfully`);
          } catch (e) {
            logger.error(`  Module cannot be loaded: ${e.message}`);
          }
        } else {
          logger.error(`✗ ${dep} is not in package.json`);
        }
      });
    } else {
      logger.error('package.json not found');
    }
  } catch (error) {
    logger.error(`Error checking dependencies: ${error.message}`);
  }
}

// Run all checks
async function runDiagnostics() {
  logger.info('Starting system diagnostics...');
  logger.info('Timestamp: ' + new Date().toISOString());
  
  try {
    await checkSystemInfo();
    await checkPython();
    await checkFileSystem();
    await checkPorts();
    await checkDependencies();
    await checkMongoDB();
    await checkRedis();
    
    logger.info('\n=== DIAGNOSTICS SUMMARY ===');
    logger.info('Diagnostics completed. Check the log for details.');
    logger.info('Log file: system-diagnosis.log');
  } catch (error) {
    logger.error(`Diagnostics failed: ${error.message}`);
    logger.error(error.stack);
  }
}

// Run diagnostics if this script is executed directly
if (require.main === module) {
  runDiagnostics()
    .then(() => {
      logger.info('Diagnostics completed');
    })
    .catch(error => {
      logger.error(`Diagnostics failed: ${error.message}`);
      process.exit(1);
    });
}

module.exports = {
  runDiagnostics,
  checkSystemInfo,
  checkPython,
  checkMongoDB,
  checkRedis,
  checkFileSystem,
  checkPorts,
  checkDependencies
};// scripts/diagnose-system.js
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');
const { MongoClient } = require('mongodb');
const Redis = require('ioredis');
const winston = require('winston');
const os = require('os');
const net = require('net');

// Configure logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ level, message, timestamp }) => {
      return `${timestamp} ${level.toUpperCase()}: ${message}`;
    })
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    }),
    new winston.transports.File({ filename: 'system-diagnosis.log' })
  ]
});

// System information
async function checkSystemInfo() {
  logger.info('=== SYSTEM INFORMATION ===');
  logger.info(`Platform: ${os.platform()} ${os.release()}`);
  logger.info(`Architecture: ${os.arch()}`);
  logger.info(`CPU: ${os.cpus()[0].model} (${os.cpus().length} cores)`);
  logger.info(`Total Memory: ${Math.round(os.totalmem() / (1024 * 1024 * 1024))} GB`);
  logger.info(`Free Memory: ${Math.round(os.freemem() / (1024 * 1024 * 1024))} GB`);
  logger.info(`Node.js Version: ${process.version}`);
  logger.info(`Current Directory: ${process.cwd()}`);
  
  // Check environment variables
  logger.info('\n=== ENVIRONMENT VARIABLES ===');
  const relevantEnvVars = [
    'NODE_ENV', 'PORT', 'PYTHON_PATH', 'PYTHON_EXECUTABLE', 
    'MONGODB_URI', 'REDIS_HOST', 'REDIS_PORT'
  ];
  
  relevantEnvVars.forEach(varName => {
    logger.info(`${varName}: ${process.env[varName] || 'Not set'}`);
  });
}

// Check Python installation
async function checkPython() {
  logger.info('\n=== PYTHON INSTALLATION ===');
  
  // Check common Python paths
  const commonPaths = [
    'C:\\Python39\\python.exe',
    'C:\\Python310\\python.exe',
    'C:\\Python311\\python.exe',
    'C:\\Program Files\\Python39\\python.exe',
    'C:\\Program Files\\Python310\\python.exe',
    'C:\\Program Files\\Python311\\python.exe',
    'C:\\Users\\d07ch\\AppData\\Local\\Programs\\Python\\Python39\\python.exe',
    'C:\\Users\\d07ch\\AppData\\Local\\Programs\\Python\\Python310\\python.exe',
    'C:\\Users\\d07ch\\AppData\\Local\\Programs\\Python\\Python311\\python.exe'
  ];
  
  // Check if paths exist
  logger.info('Checking common Python paths:');
  commonPaths.forEach(pythonPath => {
    if (fs.existsSync(pythonPath)) {
      logger.info(`✓ Found Python at: ${pythonPath}`);
      
      // Test if this Python works
      try {
        const pythonVersion = execSync(`"${pythonPath}" --version`, { encoding: 'utf8' }).trim();
        logger.info(`  Version: ${pythonVersion}`);
        
        // Check for required packages
        try {
          const packages = [
            'numpy', 'pandas', 'scikit-learn', 'xgboost', 
            'lightgbm', 'pymongo', 'redis'
          ];
          
          logger.info('  Checking key packages:');
          packages.forEach(pkg => {
            try {
              execSync(`"${pythonPath}" -c "import ${pkg}; print(f'${pkg} is installed')"`, { encoding: 'utf8' });
              logger.info(`    ✓ ${pkg}`);
            } catch (e) {
              logger.info(`    ✗ ${pkg} not installed`);
            }
          });
        } catch (e) {
          logger.error(`  Error checking packages: ${e.message}`);
        }
      } catch (e) {
        logger.error(`  Error running Python: ${e.message}`);
      }
    } else {
      logger.info(`✗ Not found: ${pythonPath}`);
    }
  });
  
  // Try to get Python path from system
  try {
    logger.info('\nChecking system Python:');
    const pythonPath = execSync('where python', { encoding: 'utf8' }).trim().split('\n')[0];
    logger.info(`System Python path: ${pythonPath}`);
    
    // Test if Python works
    const pythonVersion = execSync(`"${pythonPath}" --version`, { encoding: 'utf8' }).trim();
    logger.info(`Python version: ${pythonVersion}`);
  } catch (error) {
    logger.error(`Error finding Python in system PATH: ${error.message}`);
  }
  
  // Check Python launcher
  try {
    logger.info('\nChecking Python launcher (py):');
    const pyPath = execSync('where py', { encoding: 'utf8' }).trim().split('\n')[0];
    logger.info(`Python launcher path: ${pyPath}`);
    
    // Test if Python launcher works
    const pyVersion = execSync(`"${pyPath}" --version`, { encoding: 'utf8' }).trim();
    logger.info(`Python launcher version: ${pyVersion}`);
  } catch (error) {
    logger.error(`Python launcher not found in system PATH: ${error.message}`);
  }
}

// Check MongoDB connection
async function checkMongoDB() {
  logger.info('\n=== MONGODB CONNECTION ===');
  
  const url = process.env.MONGODB_URI || 'mongodb://localhost:27017/sports-analytics';
  logger.info(`MongoDB URI: ${url}`);
  
  let client;
  try {
    // Connect to MongoDB
    client = new MongoClient(url, {
      maxPoolSize: 10,
      connectTimeoutMS: 5000,
      socketTimeoutMS: 10000
    });
    
    await client.connect();
    logger.info('✓ Successfully connected to MongoDB');
    
    // Get database reference
    const dbName = process.env.MONGODB_DB_NAME || 'sports-analytics';
    const db = client.db(dbName);
    logger.info(`Using database: ${dbName}`);
    
    // Verify connection with a ping command
    const pingResult = await db.command({ ping: 1 });
    logger.info(`Ping command result: ${JSON.stringify(pingResult)}`);
    
    // List collections
    const collections = await db.listCollections().toArray();
    logger.info(`Found ${collections.length} collections in the database`);
    collections.forEach((collection, index) => {
      logger.info(`${index + 1}. ${collection.name}`);
    });
    
    return true;
  } catch (error) {
    logger.error(`MongoDB connection failed: ${error.message}`);
    return false;
  } finally {
    // Close the connection
    if (client) {
      await client.close();
      logger.info('MongoDB connection closed');
    }
  }
}

// Check Redis connection
async function checkRedis() {
  logger.info('\n=== REDIS CONNECTION ===');
  
  const redisHost = process.env.REDIS_HOST || 'localhost';
  const redisPort = process.env.REDIS_PORT || 6379;
  const redisPassword = process.env.REDIS_PASSWORD || '';
  
  logger.info(`Redis Host: ${redisHost}`);
  logger.info(`Redis Port: ${redisPort}`);
  logger.info(`Redis Password: ${redisPassword ? '(set)' : '(not set)'}`);
  
  let redis;
  try {
    // Connect to Redis
    redis = new Redis({
      host: redisHost,
      port: redisPort,
      password: redisPassword,
      connectTimeout: 5000,
      maxRetriesPerRequest: 1
    });
    
    // Set up event handlers
    redis.on('error', (err) => {
      logger.error(`Redis error: ${err.message}`);
    });
    
    // Wait for connection or timeout
    const pingResult = await Promise.race([
      redis.ping(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Connection timeout')), 5000))
    ]);
    
    logger.info(`✓ Successfully connected to Redis. Ping result: ${pingResult}`);
    return true;
  } catch (error) {
    logger.error(`Redis connection failed: ${error.message}`);
    return false;
  } finally {
    // Close the connection
    if (redis) {
      redis.disconnect();
      logger.info('Redis connection closed');
    }
  }
}

// Check file system and project structure
async function checkFileSystem() {
  logger.info('\n=== FILE SYSTEM CHECK ===');
  
  // Check important directories
  const directories = [
    'scripts',
    'utils',
    'logs',
    'public',
    'routes'
  ];
  
  directories.forEach(dir => {
    const dirPath = path.join(process.cwd(), dir);
    if (fs.existsSync(dirPath)) {
      logger.info(`✓ Directory exists: ${dir}`);
    } else {
      logger.error(`✗ Directory missing: ${dir}`);
    }
  });
  
  // Check critical files
  const criticalFiles = [
    'api.js',
    'scripts/predictive_model.py',
    'utils/pythonBridge.js',
    '.env'
  ];
  
  criticalFiles.forEach(file => {
    const filePath = path.join(process.cwd(), file);
    if (fs.existsSync(filePath)) {
      logger.info(`✓ File exists: ${file}`);
      
      // Check file size
      const stats = fs.statSync(filePath);
      logger.info(`  Size: ${Math.round(stats.size / 1024)} KB`);
      logger.info(`  Last modified: ${stats.mtime}`);
    } else {
      logger.error(`✗ File missing: ${file}`);
    }
  });
  
  // Check .env file
  const envPath = path.join(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    logger.info('\nChecking .env file:');
    const envContent = fs.readFileSync(envPath, 'utf8');
    const envLines = envContent.split('\n');
    
    // Check for important configuration
    const requiredVars = [
      'PYTHON_PATH',
      'MONGODB_URI',
      'REDIS_HOST',
      'REDIS_PORT'
    ];
    
    requiredVars.forEach(varName => {
      const varLine = envLines.find(line => line.startsWith(`${varName}=`));
      if (varLine) {
        logger.info(`✓ ${varName} is configured`);
      } else {
        logger.error(`✗ ${varName} is missing from .env file`);
      }
    });
  } else {
    logger.error('✗ .env file is missing');
  }
}

// Check network ports
async function checkPorts() {
  logger.info('\n=== NETWORK PORTS CHECK ===');

  const portsToCheck = [
    { port: process.env.PORT || 5000, service: 'HTTP Server' },
    { port: process.env.WS_PORT || 5150, service: 'WebSocket Server' },
    { port: process.env.REDIS_PORT || 6379, service: 'Redis' },
    { port: 27017, service: 'MongoDB' }
  ];
  
  for (const portInfo of portsToCheck) {
    logger.info(`Checking port ${portInfo.port} (${portInfo.service})...`);
    
    try {
      // Check if port is in use
      const server = net.createServer();
      
      await new Promise((resolve, reject) => {
        server.once('error', (err) => {
          if (err.code === 'EADDRINUSE') {
            logger.info(`✓ Port ${portInfo.port} is in use (${portInfo.service} may be running)`);
          } else {
            logger.error(`Error checking port ${portInfo.port}: ${err.message}`);
          }
          resolve();
        });
        
        server.once('listening', () => {
          logger.info(`✗ Port ${portInfo.port} is available (${portInfo.service} is NOT running)`);
          server.close();
          resolve();
        });
        
        server.listen(portInfo.port);
      });
    } catch (error) {
      logger.error(`Error checking port ${portInfo.port}: ${error.message}`);
    }
  }
}

// Check Node.js dependencies
async function checkDependencies() {
  logger.info('\n=== NODE.JS DEPENDENCIES ===');
  
  try {
    // Check package.json
    const packageJsonPath = path.join(process.cwd(), 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      const packageJson = require(packageJsonPath);
      logger.info(`Project name: ${packageJson.name}`);
      logger.info(`Version: ${packageJson.version}`);
      
      // Check critical dependencies
      const criticalDeps = [
        'python-shell',
        'mongodb',
        'ioredis',
        'redis',
        'ws',
        'express'
      ];
      
      logger.info('\nChecking critical dependencies:');
      criticalDeps.forEach(dep => {
        if (packageJson.dependencies[dep]) {
          logger.info(`✓ ${dep}: ${packageJson.dependencies[dep]}`);
          
          // Check if module can be loaded
          try {
            require(dep);
            logger.info(`  Module can be loaded successfully`);
          } catch (e) {
            logger.error(`  Module cannot be loaded: ${e.message}`);
          }
        } else {
          logger.error(`✗ ${dep} is not in package.json`);
        }
      });
    } else {
      logger.error('package.json not found');
    }
  } catch (error) {
    logger.error(`Error checking dependencies: ${error.message}`);
  }
}

// Run all checks
async function runDiagnostics() {
  logger.info('Starting system diagnostics...');
  logger.info('Timestamp: ' + new Date().toISOString());
  
  try {
    await checkSystemInfo();
    await checkPython();
    await checkFileSystem();
    await checkPorts();
    await checkDependencies();
    await checkMongoDB();
    await checkRedis();
    
    logger.info('\n=== DIAGNOSTICS SUMMARY ===');
    logger.info('Diagnostics completed. Check the log for details.');
    logger.info('Log file: system-diagnosis.log');
  } catch (error) {
    logger.error(`Diagnostics failed: ${error.message}`);
    logger.error(error.stack);
  }
}

// Run diagnostics if this script is executed directly
if (require.main === module) {
  runDiagnostics()
    .then(() => {
      logger.info('Diagnostics completed');
    })
    .catch(error => {
      logger.error(`Diagnostics failed: ${error.message}`);
      process.exit(1);
    });
}

module.exports = {
  runDiagnostics,
  checkSystemInfo,
  checkPython,
  checkMongoDB,
  checkRedis,
  checkFileSystem,
  checkPorts,
  checkDependencies
};// scripts/diagnose-system.js
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');
const { MongoClient } = require('mongodb');
const Redis = require('ioredis');
const winston = require('winston');
const os = require('os');

// Configure logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ level, message, timestamp }) => {
      return `${timestamp} ${level.toUpperCase()}: ${message}`;
    })
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    }),
    new winston.transports.File({ filename: 'system-diagnosis.log' })
  ]
});

// System information
async function checkSystemInfo() {
  logger.info('=== SYSTEM INFORMATION ===');
  logger.info(`Platform: ${os.platform()} ${os.release()}`);
  logger.info(`Architecture: ${os.arch()}`);
  logger.info(`CPU: ${os.cpus()[0].model} (${os.cpus().length} cores)`);
  logger.info(`Total Memory: ${Math.round(os.totalmem() / (1024 * 1024 * 1024))} GB`);
  logger.info(`Free Memory: ${Math.round(os.freemem() / (1024 * 1024 * 1024))} GB`);
  logger.info(`Node.js Version: ${process.version}`);
  logger.info(`Current Directory: ${process.cwd()}`);
  
  // Check environment variables
  logger.info('\n=== ENVIRONMENT VARIABLES ===');
  const relevantEnvVars = [
    'NODE_ENV', 'PORT', 'PYTHON_PATH', 'PYTHON_EXECUTABLE', 
    'MONGODB_URI', 'REDIS_HOST', 'REDIS_PORT'
  ];
  
  relevantEnvVars.forEach(varName => {
    logger.info(`${varName}: ${process.env[varName] || 'Not set'}`);
  });
}

// Check Python installation
async function checkPython() {
  logger.info('\n=== PYTHON INSTALLATION ===');
  
  // Check common Python paths
  const commonPaths = [
    'C:\\Python39\\python.exe',
    'C:\\Python310\\python.exe',
    'C:\\Python311\\python.exe',
    'C:\\Program Files\\Python39\\python.exe',
    'C:\\Program Files\\Python310\\python.exe',
    'C:\\Program Files\\Python311\\python.exe',
    'C:\\Users\\d07ch\\AppData\\Local\\Programs\\Python\\Python39\\python.exe',
    'C:\\Users\\d07ch\\AppData\\Local\\Programs\\Python\\Python310\\python.exe',
    'C:\\Users\\d07ch\\AppData\\Local\\Programs\\Python\\Python311\\python.exe'
  ];
  
  // Check if paths exist
  logger.info('Checking common Python paths:');
  commonPaths.forEach(pythonPath => {
    if (fs.existsSync(pythonPath)) {
      logger.info(`✓ Found Python at: ${pythonPath}`);
      
      // Test if this Python works
      try {
        const pythonVersion = execSync(`"${pythonPath}" --version`, { encoding: 'utf8' }).trim();
        logger.info(`  Version: ${pythonVersion}`);
        
        // Check for required packages
        try {
          const packages = [
            'numpy', 'pandas', 'scikit-learn', 'xgboost', 
            'lightgbm', 'pymongo', 'redis'
          ];
          
          logger.info('  Checking key packages:');
          packages.forEach(pkg => {
            try {
              execSync(`"${pythonPath}" -c "import ${pkg}; print(f'${pkg} is installed')"`, { encoding: 'utf8' });
              logger.info(`    ✓ ${pkg}`);
            } catch (e) {
              logger.info(`    ✗ ${pkg} not installed`);
            }
          });
        } catch (e) {
          logger.error(`  Error checking packages: ${e.message}`);
        }
      } catch (e) {
        logger.error(`  Error running Python: ${e.message}`);
      }
    } else {
      logger.info(`✗ Not found: ${pythonPath}`);
    }
  });
  
  // Try to get Python path from system
  try {
    logger.info('\nChecking system Python:');
    const pythonPath = execSync('where python', { encoding: 'utf8' }).trim().split('\n')[0];
    logger.info(`System Python path: ${pythonPath}`);
    
    // Test if Python works
    const pythonVersion = execSync(`"${pythonPath}" --version`, { encoding: 'utf8' }).trim();
    logger.info(`Python version: ${pythonVersion}`);
  } catch (error) {
    logger.error(`Error finding Python in system PATH: ${error.message}`);
  }
  
  // Check Python launcher
  try {
    logger.info('\nChecking Python launcher (py):');
    const pyPath = execSync('where py', { encoding: 'utf8' }).trim().split('\n')[0];
    logger.info(`Python launcher path: ${pyPath}`);
    
    // Test if Python launcher works
    const pyVersion = execSync(`"${pyPath}" --version`, { encoding: 'utf8' }).trim();
    logger.info(`Python launcher version: ${pyVersion}`);
  } catch (error) {
    logger.error(`Python launcher not found in system PATH: ${error.message}`);
  }
}

// Check MongoDB connection
async function checkMongoDB() {
  logger.info('\n=== MONGODB CONNECTION ===');
  
  const url = process.env.MONGODB_URI || 'mongodb://localhost:27017/sports-analytics';
  logger.info(`MongoDB URI: ${url}`);
  
  let client;
  try {
    // Connect to MongoDB
    client = new MongoClient(url, {
      maxPoolSize: 10,
      connectTimeoutMS: 5000,
      socketTimeoutMS: 10000
    });
    
    await client.connect();
    logger.info('✓ Successfully connected to MongoDB');
    
    // Get database reference
    const dbName = process.env.MONGODB_DB_NAME || 'sports-analytics';
    const db = client.db(dbName);
    logger.info(`Using database: ${dbName}`);
    
    // Verify connection with a ping command
    const pingResult = await db.command({ ping: 1 });
    logger.info(`Ping command result: ${JSON.stringify(pingResult)}`);
    
    // List collections
    const collections = await db.listCollections().toArray();
    logger.info(`Found ${collections.length} collections in the database`);
    collections.forEach((collection, index) => {
      logger.info(`${index + 1}. ${collection.name}`);
    });
    
    return true;
  } catch (error) {
    logger.error(`MongoDB connection failed: ${error.message}`);
    return false;
  } finally {
    // Close the connection
    if (client) {
      await client.close();
      logger.info('MongoDB connection closed');
    }
  }
}

// Check Redis connection
async function checkRedis() {
  logger.info('\n=== REDIS CONNECTION ===');
  
  const redisHost = process.env.REDIS_HOST || 'localhost';
  const redisPort = process.env.REDIS_PORT || 6379;
  const redisPassword = process.env.REDIS_PASSWORD || '';
  
  logger.info(`Redis Host: ${redisHost}`);
  logger.info(`Redis Port: ${redisPort}`);
  logger.info(`Redis Password: ${redisPassword ? '(set)' : '(not set)'}`);
  
  let redis;
  try {
    // Connect to Redis
    redis = new Redis({
      host: redisHost,
      port: redisPort,
      password: redisPassword,
      connectTimeout: 5000,
      maxRetriesPerRequest: 1
    });
    
    // Set up event handlers
    redis.on('error', (err) => {
      logger.error(`Redis error: ${err.message}`);
    });
    
    // Wait for connection or timeout
    const pingResult = await Promise.race([
      redis.ping(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Connection timeout')), 5000))
    ]);
    
    logger.info(`✓ Successfully connected to Redis. Ping result: ${pingResult}`);
    return true;
  } catch (error) {
    logger.error(`Redis connection failed: ${error.message}`);
    return false;
  } finally {
    // Close the connection
    if (redis) {
      redis.disconnect();
      logger.info('Redis connection closed');
    }
  }
}

// Check file system and project structure
async function checkFileSystem() {
  logger.info('\n=== FILE SYSTEM CHECK ===');
  
  // Check important directories
  const directories = [
    'scripts',
    'utils',
    'logs',
    'public',
    'routes'
  ];
  
  directories.forEach(dir => {
    const dirPath = path.join(process.cwd(), dir);
    if (fs.existsSync(dirPath)) {
      logger.info(`✓ Directory exists: ${dir}`);
    } else {
      logger.error(`✗ Directory missing: ${dir}`);
    }
  });
  
  // Check critical files
  const criticalFiles = [
    'api.js',
    'scripts/predictive_model.py',
    'utils/pythonBridge.js',
    '.env'
  ];
  
  criticalFiles.forEach(file => {
    const filePath = path.join(process.cwd(), file);
    if (fs.existsSync(filePath)) {
      logger.info(`✓ File exists: ${file}`);
      
      // Check file size
      const stats = fs.statSync(filePath);
      logger.info(`  Size: ${Math.round(stats.size / 1024)} KB`);
      logger.info(`  Last modified: ${stats.mtime}`);
    } else {
      logger.error(`✗ File missing: ${file}`);
    }
  });
  
  // Check .env file
  const envPath = path.join(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    logger.info('\nChecking .env file:');
    const envContent = fs.readFileSync(envPath, 'utf8');
    const envLines = envContent.split('\n');
    
    // Check for important configuration
    const requiredVars = [
      'PYTHON_PATH',
      'MONGODB_URI',
      'REDIS_HOST',
      'REDIS_PORT'
    ];
    
    requiredVars.forEach(varName => {
      const varLine = envLines.find(line => line.startsWith(`${varName}=`));
      if (varLine) {
        logger.info(`✓ ${varName} is configured`);
      } else {
        logger.error(`✗ ${varName} is missing from .env file`);
      }
    });
  } else {
    logger.error('✗ .env file is missing');
  }
}

// Check network ports
async function checkPorts() {
  logger.info('\n=== NETWORK PORTS CHECK ===');
  
  const portsToCheck = [
    { port: process.env.PORT || 5000, service: 'HTTP Server' },
    { port: process.env.WS_PORT || 5150, service: 'WebSocket Server' },
    { port: process.env.REDIS_PORT || 6379, service: 'Redis' },
    { port: 27017, service: 'MongoDB' }
  ];
  
  const net = require('net');
  
  for (const portInfo of portsToCheck) {
    logger.info(`Checking port ${portInfo.port} (${portInfo.service})...`);
    
    try {
      // Check if port is in use
      const server = net.createServer();
      
      await new Promise((resolve, reject) => {
        server.once('error', (err) => {
          if (err.code === 'EADDRINUSE') {
            logger.info(`✓ Port ${portInfo.port} is in use (${portInfo.service} may be running)`);
          } else {
            logger.error(`Error checking port ${portInfo.port}: ${err.message}`);
          }
          resolve();
        });
        
        server.once('listening', () => {
          logger.info(`✗ Port ${portInfo.port} is available (${portInfo.service} is NOT running)`);
          server.close();
          resolve();
        });
        
        server.listen(portInfo.port);
      });
    } catch (error) {
      logger.error(`Error checking port ${portInfo.port}: ${error.message}`);
    }
  }
}

// Check Node.js dependencies
async function checkDependencies() {
  logger.info('\n=== NODE.JS DEPENDENCIES ===');
  
  try {
    // Check package.json
    const packageJsonPath = path.join(process.cwd(), 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      const packageJson = require(packageJsonPath);
      logger.info(`Project name: ${packageJson.name}`);
      logger.info(`Version: ${packageJson.version}`);
      
      // Check critical dependencies
      const criticalDeps = [
        'python-shell',
        'mongodb',
        'ioredis',
        'redis',
        'ws',
        'express'
      ];
      
      logger.info('\nChecking critical dependencies:');
      criticalDeps.forEach(dep => {
        if (packageJson.dependencies[dep]) {
          logger.info(`✓ ${dep}: ${packageJson.dependencies[dep]}`);
          
          // Check if module can be loaded
          try {
            require(dep);
            logger.info(`  Module can be loaded successfully`);
          } catch (e) {
            logger.error(`  Module cannot be loaded: ${e.message}`);
          }
        } else {
          logger.error(`✗ ${dep} is not in package.json`);
        }
      });
    } else {
      logger.error('package.json not found');
    }
  } catch (error) {
    logger.error(`Error checking dependencies: ${error.message}`);
  }
}

// Run all checks
async function runDiagnostics() {
  logger.info('Starting system diagnostics...');
  logger.info('Timestamp: ' + new Date().toISOString());
  
  try {
    await checkSystemInfo();
    await checkPython();
    await checkFileSystem();
    await checkPorts();
    await checkDependencies();
    await checkMongoDB();
    await checkRedis();
    
    logger.info('\n=== DIAGNOSTICS SUMMARY ===');
    logger.info('Diagnostics completed. Check the log for details.');
    logger.info('Log file: system-diagnosis.log');
  } catch (error) {
    logger.error(`Diagnostics failed: ${error.message}`);
    logger.error(error.stack);
  }
}

// Run diagnostics if this script is executed directly
if (require.main === module) {
  runDiagnostics()
    .then(() => {
      logger.info('Diagnostics completed');
    })
    .catch(error => {
      logger.error(`Diagnostics failed: ${error.message}`);
      process.exit(1);
    });
}

module.exports = {
  runDiagnostics,
  checkSystemInfo,
  checkPython,
  checkMongoDB,
  checkRedis,
  checkFileSystem,
  checkPorts,
  checkDependencies
};// scripts/diagnose-system.js
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');
const { MongoClient } = require('mongodb');
const Redis = require('ioredis');
const winston = require('winston');
const os = require('os');

// Configure logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ level, message, timestamp }) => {
      return `${timestamp} ${level.toUpperCase()}: ${message}`;
    })
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    }),
    new winston.transports.File({ filename: 'system-diagnosis.log' })
  ]
});

// System information
async function checkSystemInfo() {
  logger.info('=== SYSTEM INFORMATION ===');
  logger.info(`Platform: ${os.platform()} ${os.release()}`);
  logger.info(`Architecture: ${os.arch()}`);
  logger.info(`CPU: ${os.cpus()[0].model} (${os.cpus().length} cores)`);
  logger.info(`Total Memory: ${Math.round(os.totalmem() / (1024 * 1024 * 1024))} GB`);
  logger.info(`Free Memory: ${Math.round(os.freemem() / (1024 * 1024 * 1024))} GB`);
  logger.info(`Node.js Version: ${process.version}`);
  logger.info(`Current Directory: ${process.cwd()}`);
  
  // Check environment variables
  logger.info('\n=== ENVIRONMENT VARIABLES ===');
  const relevantEnvVars = [
    'NODE_ENV', 'PORT', 'PYTHON_PATH', 'PYTHON_EXECUTABLE', 
    'MONGODB_URI', 'REDIS_HOST', 'REDIS_PORT'
  ];
  
  relevantEnvVars.forEach(varName => {
    logger.info(`${varName}: ${process.env[varName] || 'Not set'}`);
  });
}

// Check Python installation
async function checkPython() {
  logger.info('\n=== PYTHON INSTALLATION ===');
  
  // Check common Python paths
  const commonPaths = [
    'C:\\Python39\\python.exe',
    'C:\\Python310\\python.exe',
    'C:\\Python311\\python.exe',
    'C:\\Program Files\\Python39\\python.exe',
    'C:\\Program Files\\Python310\\python.exe',
    'C:\\Program Files\\Python311\\python.exe',
    'C:\\Users\\d07ch\\AppData\\Local\\Programs\\Python\\Python39\\python.exe',
    'C:\\Users\\d07ch\\AppData\\Local\\Programs\\Python\\Python310\\python.exe',
    'C:\\Users\\d07ch\\AppData\\Local\\Programs\\Python\\Python311\\python.exe'
  ];
  
  // Check if paths exist
  logger.info('Checking common Python paths:');
  commonPaths.forEach(pythonPath => {
    if (fs.existsSync(pythonPath)) {
      logger.info(`✓ Found Python at: ${pythonPath}`);
      
      // Test if this Python works
      try {
        const pythonVersion = execSync(`"${pythonPath}" --version`, { encoding: 'utf8' }).trim();
        logger.info(`  Version: ${pythonVersion}`);
        
        // Check for required packages
        try {
          const packages = [
            'numpy', 'pandas', 'scikit-learn', 'xgboost', 
            'lightgbm', 'pymongo', 'redis'
          ];
          
          logger.info('  Checking key packages:');
          packages.forEach(pkg => {
            try {
              execSync(`"${pythonPath}" -c "import ${pkg}; print(f'${pkg} is installed')"`, { encoding: 'utf8' });
              logger.info(`    ✓ ${pkg}`);
            } catch (e) {
              logger.info(`    ✗ ${pkg} not installed`);
            }
          });
        } catch (e) {
          logger.error(`  Error checking packages: ${e.message}`);
        }
      } catch (e) {
        logger.error(`  Error running Python: ${e.message}`);
      }
    } else {
      logger.info(`✗ Not found: ${pythonPath}`);
    }
  });
  
  // Try to get Python path from system
  try {
    logger.info('\nChecking system Python:');
    const pythonPath = execSync('where python', { encoding: 'utf8' }).trim().split('\n')[0];
    logger.info(`System Python path: ${pythonPath}`);
    
    // Test if Python works
    const pythonVersion = execSync(`"${pythonPath}" --version`, { encoding: 'utf8' }).trim();
    logger.info(`Python version: ${pythonVersion}`);
  } catch (error) {
    logger.error(`Error finding Python in system PATH: ${error.message}`);
  }
  
  // Check Python launcher
  try {
    logger.info('\nChecking Python launcher (py):');
    const pyPath = execSync('where py', { encoding: 'utf8' }).trim().split('\n')[0];
    logger.info(`Python launcher path: ${pyPath}`);
    
    // Test if Python launcher works
    const pyVersion = execSync(`"${pyPath}" --version`, { encoding: 'utf8' }).trim();
    logger.info(`Python launcher version: ${pyVersion}`);
  } catch (error) {
    logger.error(`Python launcher not found in system PATH: ${error.message}`);
  }
}

// Check MongoDB connection
async function checkMongoDB() {
  logger.info('\n=== MONGODB CONNECTION ===');
  
  const url = process.env.MONGODB_URI || 'mongodb://localhost:27017/sports-analytics';
  logger.info(`MongoDB URI: ${url}`);
  
  let client;
  try {
    // Connect to MongoDB
    client = new MongoClient(url, {
      maxPoolSize: 10,
      connectTimeoutMS: 5000,
      socketTimeoutMS: 10000
    });
    
    await client.connect();
    logger.info('✓ Successfully connected to MongoDB');
    
    // Get database reference
    const dbName = process.env.MONGODB_DB_NAME || 'sports-analytics';
    const db = client.db(dbName);
    logger.info(`Using database: ${dbName}`);
    
    // Verify connection with a ping command
    const pingResult = await db.command({ ping: 1 });
    logger.info(`Ping command result: ${JSON.stringify(pingResult)}`);
    
    // List collections
    const collections = await db.listCollections().toArray();
    logger.info(`Found ${collections.length} collections in the database`);
    collections.forEach((collection, index) => {
      logger.info(`${index + 1}. ${collection.name}`);
    });
    
    return true;
  } catch (error) {
    logger.error(`MongoDB connection failed: ${error.message}`);
    return false;
  } finally {
    // Close the connection
    if (client) {
      await client.close();
      logger.info('MongoDB connection closed');
    }
  }
}

// Check Redis connection
async function checkRedis() {
  logger.info('\n=== REDIS CONNECTION ===');
  
  const redisHost = process.env.REDIS_HOST || 'localhost';
  const redisPort = process.env.REDIS_PORT || 6379;
  const redisPassword = process.env.REDIS_PASSWORD || '';
  
  logger.info(`Redis Host: ${redisHost}`);
  logger.info(`Redis Port: ${redisPort}`);
  logger.info(`Redis Password: ${redisPassword ? '(set)' : '(not set)'}`);
  
  let redis;
  try {
    // Connect to Redis
    redis = new Redis({
      host: redisHost,
      port: redisPort,
      password: redisPassword,
      connectTimeout: 5000,
      maxRetriesPerRequest: 1
    });
    
    // Set up event handlers
    redis.on('error', (err) => {
      logger.error(`Redis error: ${err.message}`);
    });
    
    // Wait for connection or timeout
    const pingResult = await Promise.race([
      redis.ping(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Connection timeout')), 5000))
    ]);
    
    logger.info(`✓ Successfully connected to Redis. Ping result: ${pingResult}`);
    return true;
  } catch (error) {
    logger.error(`Redis connection failed: ${error.message}`);
    return false;
  } finally {
    // Close the connection
    if (redis) {
      redis.disconnect();
      logger.info('Redis connection closed');
    }
  }
}

// Check file system and project structure
async function checkFileSystem() {
  logger.info('\n=== FILE SYSTEM CHECK ===');
  
  // Check important directories
  const directories = [
    'scripts',
    'utils',
    'logs',
    'public',
    'routes'
  ];
  
  directories.forEach(dir => {
    const dirPath = path.join(process.cwd(), dir);
    if (fs.existsSync(dirPath)) {
      logger.info(`✓ Directory exists: ${dir}`);
    } else {
      logger.error(`✗ Directory missing: ${dir}`);
    }
  });
  
  // Check critical files
  const criticalFiles = [
    'api.js',
    'scripts/predictive_model.py',
    'utils/pythonBridge.js',
    '.env'
  ];
  
  criticalFiles.forEach(file => {
    const filePath = path.join(process.cwd(), file);
    if (fs.existsSync(filePath)) {
      logger.info(`✓ File exists: ${file}`);
      
      // Check file size
      const stats = fs.statSync(filePath);
      logger.info(`  Size: ${Math.round(stats.size / 1024)} KB`);
      logger.info(`  Last modified: ${stats.mtime}`);
    } else {
      logger.error(`✗ File missing: ${file}`);
    }
  });
  
  // Check .env file
  const envPath = path.join(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    logger.info('\nChecking .env file:');
    const envContent = fs.readFileSync(envPath, 'utf8');
    const envLines = envContent.split('\n');
    
    // Check for important configuration
    const requiredVars = [
      'PYTHON_PATH',
      'MONGODB_URI',
      'REDIS_HOST',
      'REDIS_PORT'
    ];
    
    requiredVars.forEach(varName => {
      const varLine = envLines.find(line => line.startsWith(`${varName}=`));
      if (varLine) {
        logger.info(`✓ ${varName} is configured`);
      } else {
        logger.error(`✗ ${varName} is missing from .env file`);
      }
    });
  } else {
    logger.error('✗ .env file is missing');
  }
}

// Check network ports
async function checkPorts() {
  logger.info('\n=== NETWORK PORTS CHECK ===');
  
  const portsToCheck = [
    { port: process.env.PORT || 5000, service: 'HTTP Server' },
    { port: process.env.WS_PORT || 5150, service: 'WebSocket Server' },
    { port: process.env.REDIS_PORT || 6379, service: 'Redis' },
    { port: 27017, service: 'MongoDB' }
  ];
  
  const net = require('net');
  
  for (const portInfo of portsToCheck) {
    logger.info(`Checking port ${portInfo.port} (${portInfo.service})...`);
    
    try {
      // Check if port is in use
      const server = net.createServer();
      
      await new Promise((resolve, reject) => {
        server.once('error', (err) => {
          if (err.code === 'EADDRINUSE') {
            logger.info(`✓ Port ${portInfo.port} is in use (${portInfo.service} may be running)`);
          } else {
            logger.error(`Error checking port ${portInfo.port}: ${err.message}`);
          }
          resolve();
        });
        
        server.once('listening', () => {
          logger.info(`✗ Port ${portInfo.port} is available (${portInfo.service} is NOT running)`);
          server.close();
          resolve();
        });
        
        server.listen(portInfo.port);
      });
    } catch (error) {
      logger.error(`Error checking port ${portInfo.port}: ${error.message}`);
    }
  }
}

// Check Node.js dependencies
async function checkDependencies() {
  logger.info('\n=== NODE.JS DEPENDENCIES ===');
  
  try {
    // Check package.json
    const packageJsonPath = path.join(process.cwd(), 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      const packageJson = require(packageJsonPath);
      logger.info(`Project name: ${packageJson.name}`);
      logger.info(`Version: ${packageJson.version}`);
      
      // Check critical dependencies
      const criticalDeps = [
        'python-shell',
        'mongodb',
        'ioredis',
        'redis',
        'ws',
        'express'
      ];
      
      logger.info('\nChecking critical dependencies:');
      criticalDeps.forEach(dep => {
        if (packageJson.dependencies[dep]) {
          logger.info(`✓ ${dep}: ${packageJson.dependencies[dep]}`);
          
          // Check if module can be loaded
          try {
            require(dep);
            logger.info(`  Module can be loaded successfully`);
          } catch (e) {
            logger.error(`  Module cannot be loaded: ${e.message}`);
          }
        } else {
          logger.error(`✗ ${dep} is not in package.json`);
        }
      });
    } else {
      logger.error('package.json not found');
    }
  } catch (error) {
    logger.error(`Error checking dependencies: ${error.message}`);
  }
}

// Run all checks
async function runDiagnostics() {
  logger.info('Starting system diagnostics...');
  logger.info('Timestamp: ' + new Date().toISOString());
  
  try {
    await checkSystemInfo();
    await checkPython();
    await checkFileSystem();
    await checkPorts();
    await checkDependencies();
    await checkMongoDB();
    await checkRedis();
    
    logger.info('\n=== DIAGNOSTICS SUMMARY ===');
    logger.info('Diagnostics completed. Check the log for details.');
    logger.info('Log file: system-diagnosis.log');
  } catch (error) {
    logger.error(`Diagnostics failed: ${error.message}`);
    logger.error(error.stack);
  }
}

// Run diagnostics if this script is executed directly
if (require.main === module) {
  runDiagnostics()
    .then(() => {
      logger.info('Diagnostics completed');
    })
    .catch(error => {
      logger.error(`Diagnostics failed: ${error.message}`);
      process.exit(1);
    });
}

module.exports = {
  runDiagnostics,
  checkSystemInfo,
  checkPython,
  checkMongoDB,
  checkRedis,
  checkFileSystem,
  checkPorts,
  checkDependencies
};