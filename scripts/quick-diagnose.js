// scripts/quick-diagnose.js - Quick diagnostic tool for Sports Analytics

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn, execSync } = require('child_process');
const net = require('net');

// ANSI color codes for better readability
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m'
};

// Track overall status
let overallStatus = true;

// Print header
console.log(`${colors.bright}${colors.cyan}Sports Analytics - Quick Diagnostic Tool${colors.reset}`);
console.log(`${colors.cyan}=============================================${colors.reset}\n`);

// Main function
async function main() {
  // 1. Check Node.js version
  checkNodeVersion();
  
  // 2. Check environment variables
  checkEnvironmentVariables();
  
  // 3. Check Python installation
  await checkPythonInstallation();
  
  // 4. Check Redis connection
  await checkRedisConnection();
  
  // 5. Check MongoDB connection
  await checkMongoDBConnection();
  
  // 6. Check port availability
  await checkPortAvailability();
  
  // 7. Check system resources
  checkSystemResources();
  
  // 8. Check file permissions
  checkFilePermissions();
  
  // 9. Check and install missing Node.js modules
  console.log(`\nChecking and installing missing Node.js modules:`);
  await checkAndInstallModules();
  
  // 10. Print summary
  printSummary();
}

// Function to check Node.js version
function checkNodeVersion() {
  console.log(`${colors.bright}Checking Node.js version...${colors.reset}`);
  
  const nodeVersion = process.version;
  const requiredVersion = 'v16.0.0';
  
  console.log(`Current Node.js version: ${nodeVersion}`);
  
  if (compareVersions(nodeVersion, requiredVersion) >= 0) {
    console.log(`${colors.green}✓ Node.js version is sufficient${colors.reset}`);
  } else {
    console.log(`${colors.red}✗ Node.js version is outdated. Required: ${requiredVersion}${colors.reset}`);
    overallStatus = false;
  }
  
  console.log();
}

// Function to check environment variables
function checkEnvironmentVariables() {
  console.log(`${colors.bright}Checking environment variables...${colors.reset}`);
  
  const requiredVars = [
    'MEMORY_USAGE_THRESHOLD',
    'USE_IN_MEMORY_CACHE',
    'PYTHON_PATH',
    'PYTHON_SCRIPT'
  ];
  
  const missingVars = [];
  
  for (const varName of requiredVars) {
    if (!process.env[varName]) {
      missingVars.push(varName);
    }
  }
  
  if (missingVars.length === 0) {
    console.log(`${colors.green}✓ All required environment variables are set${colors.reset}`);
  } else {
    console.log(`${colors.red}✗ Missing environment variables: ${missingVars.join(', ')}${colors.reset}`);
    console.log(`${colors.yellow}ℹ Run 'npm run fix:all' to fix environment variables${colors.reset}`);
    overallStatus = false;
  }
  
  console.log();
}

// Function to check Python installation
async function checkPythonInstallation() {
  console.log(`${colors.bright}Checking Python installation...${colors.reset}`);
  
  const pythonPath = process.env.PYTHON_PATH || process.env.PYTHON_EXECUTABLE || 'python';
  
  try {
    const pythonVersion = await runCommand(pythonPath, ['-c', 'import sys; print(f"Python {sys.version.split()[0]}")']);
    console.log(`Python version: ${pythonVersion}`);
    console.log(`${colors.green}✓ Python is installed and working${colors.reset}`);
    
    // Check if predictive_model.py exists
    const scriptPath = process.env.PYTHON_SCRIPT || 'scripts/predictive_model.py';
    const fullScriptPath = path.resolve(process.cwd(), scriptPath);
    
    if (fs.existsSync(fullScriptPath)) {
      console.log(`${colors.green}✓ Python script found at: ${fullScriptPath}${colors.reset}`);
    } else {
      console.log(`${colors.red}✗ Python script not found at: ${fullScriptPath}${colors.reset}`);
      console.log(`${colors.yellow}ℹ Run 'npm run fix:python' to create the script${colors.reset}`);
      overallStatus = false;
    }
  } catch (error) {
    console.log(`${colors.red}✗ Python check failed: ${error.message}${colors.reset}`);
    console.log(`${colors.yellow}ℹ Run 'npm run fix:python' to fix Python path${colors.reset}`);
    overallStatus = false;
  }
  
  console.log();
}

// Function to check Redis connection
async function checkRedisConnection() {
  console.log(`${colors.bright}Checking Redis connection...${colors.reset}`);
  
  const redisHost = process.env.REDIS_HOST || 'localhost';
  const redisPort = parseInt(process.env.REDIS_PORT, 10) || 6379;
  
  try {
    const isRunning = await checkPortOpen(redisHost, redisPort);
    
    if (isRunning) {
      console.log(`${colors.green}✓ Redis is running on ${redisHost}:${redisPort}${colors.reset}`);
    } else {
      console.log(`${colors.yellow}⚠ Redis is not running on ${redisHost}:${redisPort}${colors.reset}`);
      
      if (process.env.USE_IN_MEMORY_CACHE === 'true') {
        console.log(`${colors.green}✓ In-memory cache fallback is enabled${colors.reset}`);
      } else {
        console.log(`${colors.red}✗ Redis is not running and in-memory cache fallback is not enabled${colors.reset}`);
        console.log(`${colors.yellow}ℹ Run 'npm run fix:redis' to enable in-memory cache fallback${colors.reset}`);
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
async function checkMongoDBConnection() {
  console.log(`${colors.bright}Checking MongoDB connection...${colors.reset}`);
  
  // Get MongoDB URI from environment, with fallback
  const mongoUri = process.env.MONGODB_URI || 'mongodb+srv://SportAnalytics:Studyhard%402034@cluster0.et16d.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';
  
  if (!mongoUri) {
    console.log(`${colors.red}✗ MONGODB_URI environment variable is not set${colors.reset}`);
    overallStatus = false;
    return;
  }
  
  try {
    // For Atlas connections, we need to check differently than just a port check
    if (mongoUri.includes('mongodb+srv')) {
      console.log(`Detected MongoDB Atlas connection string`);
      
      // Try to require mongodb - we'll need this to test the connection
      let MongoClient;
      try {
        const mongodb = require('mongodb');
        MongoClient = mongodb.MongoClient;
      } catch (moduleError) {
        console.log(`${colors.yellow}⚠ mongodb module not found, installing...${colors.reset}`);
        try {
          execSync('npm install mongodb', { stdio: 'pipe' });
          const mongodb = require('mongodb');
          MongoClient = mongodb.MongoClient;
          console.log(`${colors.green}✓ mongodb module installed successfully${colors.reset}`);
        } catch (installError) {
          console.log(`${colors.red}✗ Could not install mongodb module: ${installError.message}${colors.reset}`);
          console.log(`${colors.red}✗ Cannot verify MongoDB Atlas connection${colors.reset}`);
          overallStatus = false;
          return;
        }
      }
      
      // Extract hostname for display purposes
      let hostname = "unknown";
      try {
        // Parse just the hostname part
        const match = mongoUri.match(/@([^\/\?]+)/);
        if (match && match[1]) {
          hostname = match[1];
        }
      } catch (parseError) {
        hostname = "unknown-host";
      }
      
      // Try to connect to MongoDB
      try {
        const client = new MongoClient(mongoUri, {
          connectTimeoutMS: 5000,
          serverSelectionTimeoutMS: 5000
        });
        
        await client.connect();
        await client.db().command({ ping: 1 });
        await client.close();
        
        console.log(`${colors.green}✓ Successfully connected to MongoDB Atlas at ${hostname}${colors.reset}`);
      } catch (connectionError) {
        console.log(`${colors.red}✗ MongoDB is not accessible at ${hostname}${colors.reset}`);
        console.log(`${colors.red}✗ Error: ${connectionError.message}${colors.reset}`);
        console.log(`${colors.yellow}ℹ Check your network connection and MongoDB Atlas status${colors.reset}`);
        console.log(`${colors.yellow}ℹ Verify the connection string in your .env file${colors.reset}`);
        overallStatus = false;
      }
    } else {
      // Standard MongoDB connection - parse URL and check port
      try {
        const url = new URL(mongoUri);
        const host = url.hostname;
        const port = parseInt(url.port, 10) || 27017;
        
        const isRunning = await checkPortOpen(host, port);
        
        if (isRunning) {
          console.log(`${colors.green}✓ MongoDB is running on ${host}:${port}${colors.reset}`);
        } else {
          console.log(`${colors.red}✗ MongoDB is not running on ${host}:${port}${colors.reset}`);
          overallStatus = false;
        }
      } catch (error) {
        console.log(`${colors.yellow}⚠ Could not parse MongoDB URI: ${mongoUri}${colors.reset}`);
        console.log(`${colors.yellow}ℹ Skipping MongoDB connection check${colors.reset}`);
      }
    }
  } catch (error) {
    console.log(`${colors.red}✗ MongoDB check failed: ${error.message}${colors.reset}`);
    overallStatus = false;
  }
  
  console.log();
}

// Function to check port availability
async function checkPortAvailability() {
  console.log(`${colors.bright}Checking port availability...${colors.reset}`);
  
  const httpPort = parseInt(process.env.PORT, 10) || 5050;
  const wsPort = parseInt(process.env.WS_PORT, 10) || 5150;
  
  // Check HTTP port
  try {
    const httpPortAvailable = await isPortAvailable(httpPort);
    
    if (httpPortAvailable) {
      console.log(`${colors.green}✓ HTTP port ${httpPort} is available${colors.reset}`);
    } else {
      console.log(`${colors.yellow}⚠ HTTP port ${httpPort} is already in use${colors.reset}`);
      console.log(`${colors.yellow}ℹ The application will try to use an alternative port${colors.reset}`);
    }
  } catch (error) {
    console.log(`${colors.red}✗ HTTP port check failed: ${error.message}${colors.reset}`);
  }
  
  // Check WebSocket port
  try {
    const wsPortAvailable = await isPortAvailable(wsPort);
    
    if (wsPortAvailable) {
      console.log(`${colors.green}✓ WebSocket port ${wsPort} is available${colors.reset}`);
    } else {
      console.log(`${colors.yellow}⚠ WebSocket port ${wsPort} is already in use${colors.reset}`);
      console.log(`${colors.yellow}ℹ The application will try to use an alternative port${colors.reset}`);
    }
  } catch (error) {
    console.log(`${colors.red}✗ WebSocket port check failed: ${error.message}${colors.reset}`);
  }
  
  console.log();
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
  
  if (totalMemory < 4 * 1024 * 1024 * 1024) {
    console.log(`${colors.yellow}⚠ Low total memory. Performance may be affected.${colors.reset}`);
  } else {
    console.log(`${colors.green}✓ Total memory is sufficient${colors.reset}`);
  }
  
  if (freeMemory < 1 * 1024 * 1024 * 1024) {
    console.log(`${colors.yellow}⚠ Low free memory. Performance may be affected.${colors.reset}`);
  } else {
    console.log(`${colors.green}✓ Free memory is sufficient${colors.reset}`);
  }
  
  console.log();
}

// Function to check file permissions
function checkFilePermissions() {
  console.log(`${colors.bright}Checking file permissions...${colors.reset}`);
  
  const filesToCheck = [
    'api.js',
    'startup.js',
    '.env',
    'package.json'
  ];
  
  for (const file of filesToCheck) {
    const filePath = path.resolve(process.cwd(), file);
    
    try {
      if (fs.existsSync(filePath)) {
        // Check read permission
        try {
          fs.accessSync(filePath, fs.constants.R_OK);
          console.log(`${colors.green}✓ ${file} is readable${colors.reset}`);
        } catch (error) {
          console.log(`${colors.red}✗ ${file} is not readable${colors.reset}`);
          overallStatus = false;
        }
        
        // Check write permission
        try {
          fs.accessSync(filePath, fs.constants.W_OK);
          console.log(`${colors.green}✓ ${file} is writable${colors.reset}`);
        } catch (error) {
          console.log(`${colors.red}✗ ${file} is not writable${colors.reset}`);
          overallStatus = false;
        }
      } else {
        console.log(`${colors.yellow}⚠ ${file} does not exist${colors.reset}`);
      }
    } catch (error) {
      console.log(`${colors.red}✗ Error checking ${file}: ${error.message}${colors.reset}`);
      overallStatus = false;
    }
  }

  // Check script files
  const scriptDir = path.join(process.cwd(), 'scripts');
  if (fs.existsSync(scriptDir)) {
    const scriptFiles = [
      'fix-all-issues.js',
      'fix-python-timeout.js',
      'fix-redis-connection.js',
      'fix-memory-issues.js',
      'quick-diagnose.js',
      'predictive_model.py'
    ];
    
    for (const file of scriptFiles) {
      const filePath = path.join(scriptDir, file);
      
      if (fs.existsSync(filePath)) {
        // Check read permission
        try {
          fs.accessSync(filePath, fs.constants.R_OK);
          console.log(`${colors.green}✓ scripts/${file} is readable${colors.reset}`);
        } catch (error) {
          console.log(`${colors.red}✗ scripts/${file} is not readable${colors.reset}`);
          overallStatus = false;
        }
        
        // Check write permission
        try {
          fs.accessSync(filePath, fs.constants.W_OK);
          console.log(`${colors.green}✓ scripts/${file} is writable${colors.reset}`);
        } catch (error) {
          console.log(`${colors.red}✗ scripts/${file} is not writable${colors.reset}`);
          overallStatus = false;
        }
      }
    }
  }
  
  console.log(`${colors.green}✓ All file permissions are correct${colors.reset}`);
  
  console.log();
}

// Function to check and install missing Node.js modules
async function checkAndInstallModules() {
  const requiredModules = ['@opentelemetry/exporter-trace-otlp-http'];
  for (const module of requiredModules) {
    try {
      require.resolve(module);
      console.log(`${colors.green}✓ Module ${module} is installed${colors.reset}`);
    } catch (e) {
      console.log(`${colors.yellow}⚠ Module ${module} is missing. Installing...${colors.reset}`);
      try {
        execSync(`npm install ${module}`, { stdio: 'inherit' });
        console.log(`${colors.green}✓ Module ${module} installed successfully${colors.reset}`);
      } catch (installError) {
        console.log(`${colors.red}✗ Failed to install module ${module}: ${installError.message}${colors.reset}`);
        overallStatus = false;
      }
    }
  }
}

// Function to print summary
function printSummary() {
  console.log(`${colors.bright}Diagnostic Summary${colors.reset}`);
  console.log(`${colors.cyan}=================${colors.reset}`);
  
  if (overallStatus) {
    console.log(`${colors.green}✓ All checks passed. The system is ready to run.${colors.reset}`);
    console.log(`${colors.green}✓ You can start the application with: npm run start:optimized${colors.reset}`);
  } else {
    console.log(`${colors.red}✗ Some checks failed. Please fix the issues before running the application.${colors.reset}`);
    console.log(`${colors.yellow}ℹ Run 'npm run fix:all' to fix all issues automatically${colors.reset}`);
  }
}

// Helper function to run a command and return its output
async function runCommand(command, args) {
  return new Promise((resolve, reject) => {
    const process = spawn(command, args);
    
    let stdout = '';
    let stderr = '';
    
    process.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    process.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    process.on('close', (code) => {
      if (code === 0) {
        resolve(stdout.trim());
      } else {
        reject(new Error(`Command failed with code ${code}: ${stderr}`));
      }
    });
    
    process.on('error', (error) => {
      reject(error);
    });
    
    // Set timeout
    setTimeout(() => {
      process.kill();
      reject(new Error('Command timed out'));
    }, 10000);
  });
}

// Helper function to check if a port is open
async function checkPortOpen(host, port) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    
    socket.setTimeout(1000);
    
    socket.on('connect', () => {
      socket.destroy();
      resolve(true);
    });
    
    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    
    socket.on('error', () => {
      socket.destroy();
      resolve(false);
    });
    
    socket.connect(port, host);
  });
}

// Helper function to check if a port is available
async function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer()
      .once('error', () => resolve(false))
      .once('listening', () => {
        server.once('close', () => resolve(true)).close();
      })
      .listen(port);
  });
}

// Helper function to compare versions
function compareVersions(v1, v2) {
  const v1Parts = v1.replace('v', '').split('.').map(Number);
  const v2Parts = v2.replace('v', '').split('.').map(Number);
  
  for (let i = 0; i < Math.max(v1Parts.length, v2Parts.length); i++) {
    const v1Part = v1Parts[i] || 0;
    const v2Part = v2Parts[i] || 0;
    
    if (v1Part > v2Part) return 1;
    if (v1Part < v2Part) return -1;
  }
  
  return 0;
}

// Run the main function
main().catch(error => {
  console.error(`${colors.red}Error in diagnostic tool: ${error.message}${colors.reset}`);
  console.error(error.stack);
  process.exit(1);
});