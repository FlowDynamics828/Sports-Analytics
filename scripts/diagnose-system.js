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
  
  const pythonPath = process.env.PYTHON_PATH || 'python';
  console.log(`  Python Path: ${pythonPath}`);
  
  try {
    const { stdout } = await execPromise(`${pythonPath} --version`, { timeout: 5000 });
    console.log(`  Python Version: ${stdout.trim()}`);
    return true;
  } catch (error) {
    console.log(`  Python check: ${colors.red}FAILED${colors.reset}`);
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
        if (spec is None):
            results[package] = False
        else:
            module = importlib.import_module(package)
            version = getattr(module, '__version__', 'unknown')
            results[package] = version
    except Exception as e:
        results[package] = False

for package, version in results.items():
    if (version):
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
  
  const redisHost = process.env.REDIS_HOST || 'localhost';
  const redisPort = parseInt(process.env.REDIS_PORT, 10) || 6379;
    console.log(`  Redis check: ${colors.yellow}SKIPPED (Using in-memory cache)${colors.reset}`);
    return true;
  } // Check if Redis is running
    const isRunning = await checkPortOpen(redisHost, redisPort);
  const redisHost = process.env.REDIS_HOST || 'localhost';
  const redisPort = parseInt(process.env.REDIS_PORT, 10) || 6379;
      console.log(`${colors.green}✓ Redis is running on ${redisHost}:${redisPort}${colors.reset}`);
    } else {
      console.log(`${colors.yellow}⚠ Redis is not running on ${redisHost}:${redisPort}${colors.reset}`);
      
      // Check if in-memory cache is enabled
      if (process.env.USE_IN_MEMORY_CACHE === 'true') {
        console.log(`${colors.green}✓ In-memory cache fallback is enabled${colors.reset}`);
      } else {
        console.log(`${colors.red}✗ In-memory cache fallback is not enabled${colors.reset}`);
        overallStatus = false;
      }
    }
  } catch (error) {
    console.log(`${colors.red}✗ Redis check failed: ${error.message}${colors.reset}`);
    console.log(`${colors.yellow}ℹ Run 'npm run fix:redis' to fix Redis connection${colors.reset}`);
    overallStatus = false;
  }
  
  console.log();
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
  console.log(`${colors.bright}Checking system resources...${colors.reset}`);
  
  // Check CPU
  const cpuCount = os.cpus().length;
  console.log(`CPU cores: ${cpuCount}`);
  
  if (cpuCount < 2) {
    console.log(`${colors.yellow}⚠ Low CPU core count. Performance may be affected.${colors.reset}`);
  } else {
    console.log(`${colors.green}✓ CPU core count is sufficient${colors.reset}`);
  }
  
  // Check memory
  const totalMemory = os.totalmem();
  const freeMemory = os.freemem();
  const totalMemoryGB = (totalMemory / (1024 * 1024 * 1024)).toFixed(2);
  const freeMemoryGB = (freeMemory / (1024 * 1024 * 1024)).toFixed(2);
  const memoryUsagePercent = ((totalMemory - freeMemory) / totalMemory * 100).toFixed(2);
  
  console.log(`Total memory: ${totalMemoryGB} GB`);
  console.log(`Free memory: ${freeMemoryGB} GB`);
  console.log(`Memory usage: ${memoryUsagePercent}%`);
  
  // Check disk space
  try {
    const df = execSync(`df -h "${process.cwd()}"`).toString();
    const lines = df.trim().split('\n');
    if (lines.length >= 2) {
      const values = lines[1].split(/\s+/);
      if (values.length >= 4) {
        console.log(`Disk space: ${values[3]} free of ${values[1]}`);
      }
    }
  } catch (error) {
    console.log(`Disk space check: ${colors.red}ERROR${colors.reset}`);
    console.log(`Error: ${error.message}`);
  }
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
}

// Main function
async function main() {
  try {
    // Check required files
    checkRequiredFiles();
    
    // Check Node.js environment
    checkNodeEnvironment();
    
    // Check Python installation
    const pythonInstalled = await checkPython();
    
    if (pythonInstalled) {
      // Check Python packages
      checkPythonPackages(process.env.PYTHON_PATH || 'python');
    }
    
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
});