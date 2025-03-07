// scripts/fix-environment.js
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');
const winston = require('winston');
const readline = require('readline');

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
    new winston.transports.File({ filename: 'environment-fix.log' })
  ]
});

// Create readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Promisify readline question
function question(query) {
  return new Promise(resolve => {
    rl.question(query, answer => {
      resolve(answer);
    });
  });
}

// Detect Python executable path
async function detectPythonPath() {
  logger.info('Detecting Python executable path...');
  
  // Check environment variables first
  const envPath = process.env.PYTHON_PATH || process.env.PYTHON_EXECUTABLE;
  if (envPath && fs.existsSync(envPath)) {
    logger.info(`Found Python path in environment variables: ${envPath}`);
    return envPath;
  }
  
  // Check common paths based on platform
  const isWindows = process.platform === 'win32';
  
  if (isWindows) {
    // Common Windows Python paths
    const commonWindowsPaths = [
      // Python 3 paths
      'C:\\Python39\\python.exe',
      'C:\\Python310\\python.exe',
      'C:\\Python311\\python.exe',
      'C:\\Python312\\python.exe',
      // Python launcher
      'C:\\Windows\\py.exe',
      // Anaconda/Miniconda paths
      'C:\\ProgramData\\Anaconda3\\python.exe',
      'C:\\ProgramData\\miniconda3\\python.exe',
      // User profile paths
      `${process.env.USERPROFILE}\\AppData\\Local\\Programs\\Python\\Python39\\python.exe`,
      `${process.env.USERPROFILE}\\AppData\\Local\\Programs\\Python\\Python310\\python.exe`,
      `${process.env.USERPROFILE}\\AppData\\Local\\Programs\\Python\\Python311\\python.exe`,
      `${process.env.USERPROFILE}\\AppData\\Local\\Programs\\Python\\Python312\\python.exe`,
    ];
    
    for (const pythonPath of commonWindowsPaths) {
      try {
        if (fs.existsSync(pythonPath)) {
          logger.info(`Found Python at: ${pythonPath}`);
          return pythonPath;
        }
      } catch (e) {
        // Ignore errors and continue checking
      }
    }
  } else {
    // On Unix-like systems, we can try to use the 'which' command
    try {
      const pythonPath = execSync('which python3 || which python').toString().trim();
      if (pythonPath) {
        logger.info(`Found Python at: ${pythonPath}`);
        return pythonPath;
      }
    } catch (e) {
      // Ignore errors and fall back to default
    }
  }
  
  // Try to find Python in PATH
  try {
    const pythonPath = execSync('where python', { encoding: 'utf8' }).trim().split('\n')[0];
    logger.info(`Found Python in PATH: ${pythonPath}`);
    return pythonPath;
  } catch (e) {
    // Ignore errors and continue
  }
  
  // Try Python launcher
  try {
    const pyPath = execSync('where py', { encoding: 'utf8' }).trim().split('\n')[0];
    logger.info(`Found Python launcher: ${pyPath}`);
    return pyPath;
  } catch (e) {
    // Ignore errors and continue
  }
  
  // Ask user for Python path
  logger.warn('Could not automatically detect Python path');
  const userPath = await question('Please enter the full path to your Python executable: ');
  
  if (userPath && fs.existsSync(userPath)) {
    logger.info(`Using user-provided Python path: ${userPath}`);
    return userPath;
  }
  
  logger.error('No valid Python path found. Please install Python and try again.');
  return 'python'; // Default fallback
}

// Update .env file with correct configuration
async function updateEnvFile(pythonPath) {
  logger.info('Updating .env file...');
  
  const envPath = path.join(process.cwd(), '.env');
  let envContent = '';
  
  // Create default .env content
  const defaultEnv = `# Python Configuration
PYTHON_PATH=${pythonPath}
PYTHON_EXECUTABLE=${pythonPath}
PYTHON_BRIDGE_MAX_RETRIES=3
PYTHON_EXECUTION_TIMEOUT=60000

# Server Configuration
PORT=5000
HOST=localhost
NODE_ENV=development
LOG_LEVEL=info

# Database Configuration
MONGODB_URI=mongodb://localhost:27017/sports-analytics
MONGODB_DB_NAME=sports-analytics
DB_MAX_POOL_SIZE=50
DB_MIN_POOL_SIZE=10
CONNECT_TIMEOUT_MS=30000
SOCKET_TIMEOUT_MS=45000

# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_CONNECT_TIMEOUT=10000
REDIS_ENABLE_OFFLINE_QUEUE=true
REDIS_MAX_RETRIES=3
REDIS_RETRY_STRATEGY_MAX_DELAY=2000

# Cache Configuration
CACHE_TTL=1800
CACHE_MAX_ITEMS=500
CACHE_CHECK_PERIOD=300

# WebSocket Configuration
WS_PORT=5150
WS_PATH=/ws
WS_HEARTBEAT_INTERVAL=60000
WS_CLIENT_TIMEOUT=35000
WS_MAX_PAYLOAD=52428800

# Performance Configuration
MEMORY_USAGE_THRESHOLD=0.80
CPU_LOAD_THRESHOLD=0.80
NETWORK_TRAFFIC_THRESHOLD=52428800
HEALTH_CHECK_INTERVAL=300000
METRICS_INTERVAL=300000
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX=50
MAX_CONNECTIONS_PER_IP=50
COMPRESSION_LEVEL=6
COMPRESSION_THRESHOLD=1024

# Security Configuration
JWT_SECRET=your-secret-key-here
JWT_EXPIRATION=86400
CORS_ORIGIN=http://localhost:5000`;
  
  // Check if .env file exists
  if (fs.existsSync(envPath)) {
    logger.info('.env file exists, updating...');
    envContent = fs.readFileSync(envPath, 'utf8');
    
    // Update Python path
    if (envContent.includes('PYTHON_PATH=')) {
      envContent = envContent.replace(/PYTHON_PATH=.*(\r?\n|$)/g, `PYTHON_PATH=${pythonPath}$1`);
    } else {
      envContent += `\nPYTHON_PATH=${pythonPath}\n`;
    }
    
    // Update Python executable
    if (envContent.includes('PYTHON_EXECUTABLE=')) {
      envContent = envContent.replace(/PYTHON_EXECUTABLE=.*(\r?\n|$)/g, `PYTHON_EXECUTABLE=${pythonPath}$1`);
    } else {
      envContent += `PYTHON_EXECUTABLE=${pythonPath}\n`;
    }
    
    // Ensure other critical variables are present
    const criticalVars = [
      'MONGODB_URI', 'REDIS_HOST', 'REDIS_PORT', 'PORT', 'WS_PORT'
    ];
    
    criticalVars.forEach(varName => {
      if (!envContent.includes(`${varName}=`)) {
        const defaultLine = defaultEnv.split('\n').find(line => line.startsWith(`${varName}=`));
        if (defaultLine) {
          envContent += `\n${defaultLine}\n`;
        }
      }
    });
  } else {
    logger.info('.env file does not exist, creating...');
    envContent = defaultEnv;
  }
  
  // Write updated content to .env file
  fs.writeFileSync(envPath, envContent);
  logger.info('.env file updated successfully');
  
  return envContent;
}

// Install required Python packages
async function installPythonPackages(pythonPath) {
  logger.info('Installing required Python packages...');
  
  const requiredPackages = [
    'numpy',
    'pandas',
    'scikit-learn==1.0.2',
    'matplotlib==3.5.2',
    'xgboost==1.6.1',
    'lightgbm==3.3.2',
    'hyperopt==0.2.7',
    'pymongo==4.1.1',
    'python-dotenv==0.20.0',
    'redis==4.3.4',
    'prometheus-client==0.14.1',
    'psutil==5.9.1',
    'cachetools'
  ];
  
  // Check which packages are already installed
  const installedPackages = [];
  const missingPackages = [];
  
  for (const pkg of requiredPackages) {
    const pkgName = pkg.split('==')[0];
    try {
      execSync(`"${pythonPath}" -c "import ${pkgName}; print(f'${pkgName} is installed')"`, { encoding: 'utf8' });
      installedPackages.push(pkg);
    } catch (e) {
      missingPackages.push(pkg);
    }
  }
  
  logger.info(`Already installed: ${installedPackages.join(', ')}`);
  logger.info(`Missing packages: ${missingPackages.join(', ')}`);
  
  if (missingPackages.length === 0) {
    logger.info('All required Python packages are already installed');
    return true;
  }
  
  // Install missing packages
  try {
    logger.info('Installing pip and setuptools...');
    execSync(`"${pythonPath}" -m pip install --upgrade pip setuptools wheel`, { stdio: 'inherit' });
    
    for (const pkg of missingPackages) {
      logger.info(`Installing ${pkg}...`);
      execSync(`"${pythonPath}" -m pip install ${pkg}`, { stdio: 'inherit' });
    }
    
    logger.info('All Python packages installed successfully');
    return true;
  } catch (error) {
    logger.error(`Error installing Python packages: ${error.message}`);
    return false;
  }
}

// Create logs directory if it doesn't exist
function ensureLogsDirectory() {
  const logsDir = path.join(process.cwd(), 'logs');
  if (!fs.existsSync(logsDir)) {
    logger.info(`Creating logs directory at: ${logsDir}`);
    fs.mkdirSync(logsDir, { recursive: true });
  }
}

// Fix file permissions
function fixFilePermissions() {
  logger.info('Fixing file permissions...');
  
  const scriptsDir = path.join(process.cwd(), 'scripts');
  if (fs.existsSync(scriptsDir)) {
    const files = fs.readdirSync(scriptsDir);
    const pythonScripts = files.filter(file => file.endsWith('.py'));
    
    pythonScripts.forEach(script => {
      const scriptPath = path.join(scriptsDir, script);
      try {
        // Make Python scripts executable
        fs.chmodSync(scriptPath, 0o755);
        logger.info(`Made ${script} executable`);
      } catch (error) {
        logger.error(`Error setting permissions for ${script}: ${error.message}`);
      }
    });
  }
}

// Check and fix MongoDB
async function checkAndFixMongoDB() {
  logger.info('Checking MongoDB...');
  
  try {
    // Check if MongoDB is running
    execSync('mongod --version', { stdio: 'pipe' });
    logger.info('MongoDB is installed');
    
    // Ask user if they want to start MongoDB
    const startMongo = await question('Do you want to ensure MongoDB is running? (y/n): ');
    if (startMongo.toLowerCase() === 'y') {
      try {
        logger.info('Attempting to start MongoDB...');
        execSync('net start MongoDB', { stdio: 'pipe' });
        logger.info('MongoDB service started');
      } catch (error) {
        logger.warn(`Could not start MongoDB service: ${error.message}`);
        logger.info('You may need to start MongoDB manually');
      }
    }
  } catch (error) {
    logger.warn(`MongoDB may not be installed: ${error.message}`);
    logger.info('Please install MongoDB to use this application');
  }
}

// Check and fix Redis
async function checkAndFixRedis() {
  logger.info('Checking Redis...');
  
  try {
    // Check if Redis is installed
    execSync('redis-cli --version', { stdio: 'pipe' });
    logger.info('Redis CLI is installed');
    
    // Ask user if they want to start Redis
    const startRedis = await question('Do you want to ensure Redis is running? (y/n): ');
    if (startRedis.toLowerCase() === 'y') {
      try {
        logger.info('Attempting to start Redis...');
        // This is Windows-specific, adjust for other platforms
        execSync('redis-server --service-start', { stdio: 'pipe' });
        logger.info('Redis service started');
      } catch (error) {
        logger.warn(`Could not start Redis service: ${error.message}`);
        logger.info('You may need to start Redis manually');
      }
    }
  } catch (error) {
    logger.warn(`Redis may not be installed: ${error.message}`);
    logger.info('The application can run without Redis using in-memory fallbacks');
    
    // Update .env to use in-memory cache
    const envPath = path.join(process.cwd(), '.env');
    if (fs.existsSync(envPath)) {
      let envContent = fs.readFileSync(envPath, 'utf8');
      if (!envContent.includes('USE_IN_MEMORY_CACHE=')) {
        envContent += '\nUSE_IN_MEMORY_CACHE=true\n';
        fs.writeFileSync(envPath, envContent);
        logger.info('Updated .env to use in-memory cache');
      }
    }
  }
}

// Fix Node.js dependencies
async function fixNodeDependencies() {
  logger.info('Checking Node.js dependencies...');
  
  // Check if node_modules exists
  const nodeModulesPath = path.join(process.cwd(), 'node_modules');
  if (!fs.existsSync(nodeModulesPath)) {
    logger.info('node_modules directory not found, running npm install...');
    
    try {
      execSync('npm install', { stdio: 'inherit' });
      logger.info('npm install completed successfully');
    } catch (error) {
      logger.error(`Error running npm install: ${error.message}`);
    }
  } else {
    logger.info('node_modules directory exists');
    
    // Check for critical dependencies
    const criticalDeps = [
      'python-shell',
      'mongodb',
      'ioredis',
      'redis',
      'ws',
      'express'
    ];
    
    const missingDeps = [];
    
    for (const dep of criticalDeps) {
      const depPath = path.join(nodeModulesPath, dep);
      if (!fs.existsSync(depPath)) {
        missingDeps.push(dep);
      }
    }
    
    if (missingDeps.length > 0) {
      logger.info(`Missing dependencies: ${missingDeps.join(', ')}`);
      logger.info('Installing missing dependencies...');
      
      try {
        execSync(`npm install ${missingDeps.join(' ')}`, { stdio: 'inherit' });
        logger.info('Dependencies installed successfully');
      } catch (error) {
        logger.error(`Error installing dependencies: ${error.message}`);
      }
    } else {
      logger.info('All critical dependencies are installed');
    }
  }
}

// Main fix function
async function fixEnvironment() {
  logger.info('Starting environment fix...');
  logger.info('Timestamp: ' + new Date().toISOString());
  
  try {
    // Step 1: Ensure logs directory exists
    ensureLogsDirectory();
    
    // Step 2: Detect Python path
    const pythonPath = await detectPythonPath();
    
    // Step 3: Update .env file
    await updateEnvFile(pythonPath);
    
    // Step 4: Install required Python packages
    await installPythonPackages(pythonPath);
    
    // Step 5: Fix file permissions
    fixFilePermissions();
    
    // Step 6: Check and fix MongoDB
    await checkAndFixMongoDB();
    
    // Step 7: Check and fix Redis
    await checkAndFixRedis();
    
    // Step 8: Fix Node.js dependencies
    await fixNodeDependencies();
    
    logger.info('Environment fix completed successfully');
    logger.info('You can now try running the application with: npm start');
  } catch (error) {
    logger.error(`Environment fix failed: ${error.message}`);
    logger.error(error.stack);
  } finally {
    // Close readline interface
    rl.close();
  }
}

// Run fix if this script is executed directly
if (require.main === module) {
  fixEnvironment()
    .then(() => {
      logger.info('Fix completed');
    })
    .catch(error => {
      logger.error(`Fix failed: ${error.message}`);
      process.exit(1);
    });
}

module.exports = {
  fixEnvironment,
  detectPythonPath,
  updateEnvFile,
  installPythonPackages,
  ensureLogsDirectory,
  fixFilePermissions,
  checkAndFixMongoDB,
  checkAndFixRedis,
  fixNodeDependencies
};// scripts/fix-environment.js
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');
const winston = require('winston');
const readline = require('readline');

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
    new winston.transports.File({ filename: 'environment-fix.log' })
  ]
});

// Create readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Promisify readline question
function question(query) {
  return new Promise(resolve => {
    rl.question(query, answer => {
      resolve(answer);
    });
  });
}

// Detect Python executable path
async function detectPythonPath() {
  logger.info('Detecting Python executable path...');
  
  // Check environment variables first
  const envPath = process.env.PYTHON_PATH || process.env.PYTHON_EXECUTABLE;
  if (envPath && fs.existsSync(envPath)) {
    logger.info(`Found Python path in environment variables: ${envPath}`);
    return envPath;
  }
  
  // Check common paths based on platform
  const isWindows = process.platform === 'win32';
  
  if (isWindows) {
    // Common Windows Python paths
    const commonWindowsPaths = [
      // Python 3 paths
      'C:\\Python39\\python.exe',
      'C:\\Python310\\python.exe',
      'C:\\Python311\\python.exe',
      'C:\\Python312\\python.exe',
      // Python launcher
      'C:\\Windows\\py.exe',
      // Anaconda/Miniconda paths
      'C:\\ProgramData\\Anaconda3\\python.exe',
      'C:\\ProgramData\\miniconda3\\python.exe',
      // User profile paths
      `${process.env.USERPROFILE}\\AppData\\Local\\Programs\\Python\\Python39\\python.exe`,
      `${process.env.USERPROFILE}\\AppData\\Local\\Programs\\Python\\Python310\\python.exe`,
      `${process.env.USERPROFILE}\\AppData\\Local\\Programs\\Python\\Python311\\python.exe`,
      `${process.env.USERPROFILE}\\AppData\\Local\\Programs\\Python\\Python312\\python.exe`,
    ];
    
    for (const pythonPath of commonWindowsPaths) {
      try {
        if (fs.existsSync(pythonPath)) {
          logger.info(`Found Python at: ${pythonPath}`);
          return pythonPath;
        }
      } catch (e) {
        // Ignore errors and continue checking
      }
    }
  } else {
    // On Unix-like systems, we can try to use the 'which' command
    try {
      const pythonPath = execSync('which python3 || which python').toString().trim();
      if (pythonPath) {
        logger.info(`Found Python at: ${pythonPath}`);
        return pythonPath;
      }
    } catch (e) {
      // Ignore errors and fall back to default
    }
  }
  
  // Try to find Python in PATH
  try {
    const pythonPath = execSync('where python', { encoding: 'utf8' }).trim().split('\n')[0];
    logger.info(`Found Python in PATH: ${pythonPath}`);
    return pythonPath;
  } catch (e) {
    // Ignore errors and continue
  }
  
  // Try Python launcher
  try {
    const pyPath = execSync('where py', { encoding: 'utf8' }).trim().split('\n')[0];
    logger.info(`Found Python launcher: ${pyPath}`);
    return pyPath;
  } catch (e) {
    // Ignore errors and continue
  }
  
  // Ask user for Python path
  logger.warn('Could not automatically detect Python path');
  const userPath = await question('Please enter the full path to your Python executable: ');
  
  if (userPath && fs.existsSync(userPath)) {
    logger.info(`Using user-provided Python path: ${userPath}`);
    return userPath;
  }
  
  logger.error('No valid Python path found. Please install Python and try again.');
  return 'python'; // Default fallback
}

// Update .env file with correct configuration
async function updateEnvFile(pythonPath) {
  logger.info('Updating .env file...');
  
  const envPath = path.join(process.cwd(), '.env');
  let envContent = '';
  
  // Create default .env content
  const defaultEnv = `# Python Configuration
PYTHON_PATH=${pythonPath}
PYTHON_EXECUTABLE=${pythonPath}
PYTHON_BRIDGE_MAX_RETRIES=3
PYTHON_EXECUTION_TIMEOUT=60000

# Server Configuration
PORT=5000
HOST=localhost
NODE_ENV=development
LOG_LEVEL=info

# Database Configuration
MONGODB_URI=mongodb://localhost:27017/sports-analytics
MONGODB_DB_NAME=sports-analytics
DB_MAX_POOL_SIZE=50
DB_MIN_POOL_SIZE=10
CONNECT_TIMEOUT_MS=30000
SOCKET_TIMEOUT_MS=45000

# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_CONNECT_TIMEOUT=10000
REDIS_ENABLE_OFFLINE_QUEUE=true
REDIS_MAX_RETRIES=3
REDIS_RETRY_STRATEGY_MAX_DELAY=2000

# Cache Configuration
CACHE_TTL=1800
CACHE_MAX_ITEMS=500
CACHE_CHECK_PERIOD=300

# WebSocket Configuration
WS_PORT=5150
WS_PATH=/ws
WS_HEARTBEAT_INTERVAL=60000
WS_CLIENT_TIMEOUT=35000
WS_MAX_PAYLOAD=52428800

# Performance Configuration
MEMORY_USAGE_THRESHOLD=0.80
CPU_LOAD_THRESHOLD=0.80
NETWORK_TRAFFIC_THRESHOLD=52428800
HEALTH_CHECK_INTERVAL=300000
METRICS_INTERVAL=300000
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX=50
MAX_CONNECTIONS_PER_IP=50
COMPRESSION_LEVEL=6
COMPRESSION_THRESHOLD=1024

# Security Configuration
JWT_SECRET=your-secret-key-here
JWT_EXPIRATION=86400
CORS_ORIGIN=http://localhost:5000`;
  
  // Check if .env file exists
  if (fs.existsSync(envPath)) {
    logger.info('.env file exists, updating...');
    envContent = fs.readFileSync(envPath, 'utf8');
    
    // Update Python path
    if (envContent.includes('PYTHON_PATH=')) {
      envContent = envContent.replace(/PYTHON_PATH=.*(\r?\n|$)/g, `PYTHON_PATH=${pythonPath}$1`);
    } else {
      envContent += `\nPYTHON_PATH=${pythonPath}\n`;
    }
    
    // Update Python executable
    if (envContent.includes('PYTHON_EXECUTABLE=')) {
      envContent = envContent.replace(/PYTHON_EXECUTABLE=.*(\r?\n|$)/g, `PYTHON_EXECUTABLE=${pythonPath}$1`);
    } else {
      envContent += `PYTHON_EXECUTABLE=${pythonPath}\n`;
    }
    
    // Ensure other critical variables are present
    const criticalVars = [
      'MONGODB_URI', 'REDIS_HOST', 'REDIS_PORT', 'PORT', 'WS_PORT'
    ];
    
    criticalVars.forEach(varName => {
      if (!envContent.includes(`${varName}=`)) {
        const defaultLine = defaultEnv.split('\n').find(line => line.startsWith(`${varName}=`));
        if (defaultLine) {
          envContent += `\n${defaultLine}\n`;
        }
      }
    });
  } else {
    logger.info('.env file does not exist, creating...');
    envContent = defaultEnv;
  }
  
  // Write updated content to .env file
  fs.writeFileSync(envPath, envContent);
  logger.info('.env file updated successfully');
  
  return envContent;
}

// Install required Python packages
async function installPythonPackages(pythonPath) {
  logger.info('Installing required Python packages...');
  
  const requiredPackages = [
    'numpy',
    'pandas',
    'scikit-learn==1.0.2',
    'matplotlib==3.5.2',
    'xgboost==1.6.1',
    'lightgbm==3.3.2',
    'hyperopt==0.2.7',
    'pymongo==4.1.1',
    'python-dotenv==0.20.0',
    'redis==4.3.4',
    'prometheus-client==0.14.1',
    'psutil==5.9.1',
    'cachetools'
  ];
  
  // Check which packages are already installed
  const installedPackages = [];
  const missingPackages = [];
  
  for (const pkg of requiredPackages) {
    const pkgName = pkg.split('==')[0];
    try {
      execSync(`"${pythonPath}" -c "import ${pkgName}; print(f'${pkgName} is installed')"`, { encoding: 'utf8' });
      installedPackages.push(pkg);
    } catch (e) {
      missingPackages.push(pkg);
    }
  }
  
  logger.info(`Already installed: ${installedPackages.join(', ')}`);
  logger.info(`Missing packages: ${missingPackages.join(', ')}`);
  
  if (missingPackages.length === 0) {
    logger.info('All required Python packages are already installed');
    return true;
  }
  
  // Install missing packages
  try {
    logger.info('Installing pip and setuptools...');
    execSync(`"${pythonPath}" -m pip install --upgrade pip setuptools wheel`, { stdio: 'inherit' });
    
    for (const pkg of missingPackages) {
      logger.info(`Installing ${pkg}...`);
      execSync(`"${pythonPath}" -m pip install ${pkg}`, { stdio: 'inherit' });
    }
    
    logger.info('All Python packages installed successfully');
    return true;
  } catch (error) {
    logger.error(`Error installing Python packages: ${error.message}`);
    return false;
  }
}

// Create logs directory if it doesn't exist
function ensureLogsDirectory() {
  const logsDir = path.join(process.cwd(), 'logs');
  if (!fs.existsSync(logsDir)) {
    logger.info(`Creating logs directory at: ${logsDir}`);
    fs.mkdirSync(logsDir, { recursive: true });
  }
}

// Fix file permissions
function fixFilePermissions() {
  logger.info('Fixing file permissions...');
  
  const scriptsDir = path.join(process.cwd(), 'scripts');
  if (fs.existsSync(scriptsDir)) {
    const files = fs.readdirSync(scriptsDir);
    const pythonScripts = files.filter(file => file.endsWith('.py'));
    
    pythonScripts.forEach(script => {
      const scriptPath = path.join(scriptsDir, script);
      try {
        // Make Python scripts executable
        fs.chmodSync(scriptPath, 0o755);
        logger.info(`Made ${script} executable`);
      } catch (error) {
        logger.error(`Error setting permissions for ${script}: ${error.message}`);
      }
    });
  }
}

// Check and fix MongoDB
async function checkAndFixMongoDB() {
  logger.info('Checking MongoDB...');
  
  try {
    // Check if MongoDB is running
    execSync('mongod --version', { stdio: 'pipe' });
    logger.info('MongoDB is installed');
    
    // Ask user if they want to start MongoDB
    const startMongo = await question('Do you want to ensure MongoDB is running? (y/n): ');
    if (startMongo.toLowerCase() === 'y') {
      try {
        logger.info('Attempting to start MongoDB...');
        execSync('net start MongoDB', { stdio: 'pipe' });
        logger.info('MongoDB service started');
      } catch (error) {
        logger.warn(`Could not start MongoDB service: ${error.message}`);
        logger.info('You may need to start MongoDB manually');
      }
    }
  } catch (error) {
    logger.warn(`MongoDB may not be installed: ${error.message}`);
    logger.info('Please install MongoDB to use this application');
  }
}

// Check and fix Redis
async function checkAndFixRedis() {
  logger.info('Checking Redis...');
  
  try {
    // Check if Redis is installed
    execSync('redis-cli --version', { stdio: 'pipe' });
    logger.info('Redis CLI is installed');
    
    // Ask user if they want to start Redis
    const startRedis = await question('Do you want to ensure Redis is running? (y/n): ');
    if (startRedis.toLowerCase() === 'y') {
      try {
        logger.info('Attempting to start Redis...');
        // This is Windows-specific, adjust for other platforms
        execSync('redis-server --service-start', { stdio: 'pipe' });
        logger.info('Redis service started');
      } catch (error) {
        logger.warn(`Could not start Redis service: ${error.message}`);
        logger.info('You may need to start Redis manually');
      }
    }
  } catch (error) {
    logger.warn(`Redis may not be installed: ${error.message}`);
    logger.info('The application can run without Redis using in-memory fallbacks');
    
    // Update .env to use in-memory cache
    const envPath = path.join(process.cwd(), '.env');
    if (fs.existsSync(envPath)) {
      let envContent = fs.readFileSync(envPath, 'utf8');
      if (!envContent.includes('USE_IN_MEMORY_CACHE=')) {
        envContent += '\nUSE_IN_MEMORY_CACHE=true\n';
        fs.writeFileSync(envPath, envContent);
        logger.info('Updated .env to use in-memory cache');
      }
    }
  }
}

// Fix Node.js dependencies
async function fixNodeDependencies() {
  logger.info('Checking Node.js dependencies...');
  
  // Check if node_modules exists
  const nodeModulesPath = path.join(process.cwd(), 'node_modules');
  if (!fs.existsSync(nodeModulesPath)) {
    logger.info('node_modules directory not found, running npm install...');
    
    try {
      execSync('npm install', { stdio: 'inherit' });
      logger.info('npm install completed successfully');
    } catch (error) {
      logger.error(`Error running npm install: ${error.message}`);
    }
  } else {
    logger.info('node_modules directory exists');
    
    // Check for critical dependencies
    const criticalDeps = [
      'python-shell',
      'mongodb',
      'ioredis',
      'redis',
      'ws',
      'express'
    ];
    
    const missingDeps = [];
    
    for (const dep of criticalDeps) {
      const depPath = path.join(nodeModulesPath, dep);
      if (!fs.existsSync(depPath)) {
        missingDeps.push(dep);
      }
    }
    
    if (missingDeps.length > 0) {
      logger.info(`Missing dependencies: ${missingDeps.join(', ')}`);
      logger.info('Installing missing dependencies...');
      
      try {
        execSync(`npm install ${missingDeps.join(' ')}`, { stdio: 'inherit' });
        logger.info('Dependencies installed successfully');
      } catch (error) {
        logger.error(`Error installing dependencies: ${error.message}`);
      }
    } else {
      logger.info('All critical dependencies are installed');
    }
  }
}

// Main fix function
async function fixEnvironment() {
  logger.info('Starting environment fix...');
  logger.info('Timestamp: ' + new Date().toISOString());
  
  try {
    // Step 1: Ensure logs directory exists
    ensureLogsDirectory();
    
    // Step 2: Detect Python path
    const pythonPath = await detectPythonPath();
    
    // Step 3: Update .env file
    await updateEnvFile(pythonPath);
    
    // Step 4: Install required Python packages
    await installPythonPackages(pythonPath);
    
    // Step 5: Fix file permissions
    fixFilePermissions();
    
    // Step 6: Check and fix MongoDB
    await checkAndFixMongoDB();
    
    // Step 7: Check and fix Redis
    await checkAndFixRedis();
    
    // Step 8: Fix Node.js dependencies
    await fixNodeDependencies();
    
    logger.info('Environment fix completed successfully');
    logger.info('You can now try running the application with: npm start');
  } catch (error) {
    logger.error(`Environment fix failed: ${error.message}`);
    logger.error(error.stack);
  } finally {
    // Close readline interface
    rl.close();
  }
}

// Run fix if this script is executed directly
if (require.main === module) {
  fixEnvironment()
    .then(() => {
      logger.info('Fix completed');
    })
    .catch(error => {
      logger.error(`Fix failed: ${error.message}`);
      process.exit(1);
    });
}

module.exports = {
  fixEnvironment,
  detectPythonPath,
  updateEnvFile,
  installPythonPackages,
  ensureLogsDirectory,
  fixFilePermissions,
  checkAndFixMongoDB,
  checkAndFixRedis,
  fixNodeDependencies
};// scripts/fix-environment.js
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');
const winston = require('winston');
const readline = require('readline');

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
    new winston.transports.File({ filename: 'environment-fix.log' })
  ]
});

// Create readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Promisify readline question
function question(query) {
  return new Promise(resolve => {
    rl.question(query, answer => {
      resolve(answer);
    });
  });
}

// Detect Python executable path
async function detectPythonPath() {
  logger.info('Detecting Python executable path...');
  
  // Check environment variables first
  const envPath = process.env.PYTHON_PATH || process.env.PYTHON_EXECUTABLE;
  if (envPath && fs.existsSync(envPath)) {
    logger.info(`Found Python path in environment variables: ${envPath}`);
    return envPath;
  }
  
  // Check common paths based on platform
  const isWindows = process.platform === 'win32';
  
  if (isWindows) {
    // Common Windows Python paths
    const commonWindowsPaths = [
      // Python 3 paths
      'C:\\Python39\\python.exe',
      'C:\\Python310\\python.exe',
      'C:\\Python311\\python.exe',
      'C:\\Python312\\python.exe',
      // Python launcher
      'C:\\Windows\\py.exe',
      // Anaconda/Miniconda paths
      'C:\\ProgramData\\Anaconda3\\python.exe',
      'C:\\ProgramData\\miniconda3\\python.exe',
      // User profile paths
      `${process.env.USERPROFILE}\\AppData\\Local\\Programs\\Python\\Python39\\python.exe`,
      `${process.env.USERPROFILE}\\AppData\\Local\\Programs\\Python\\Python310\\python.exe`,
      `${process.env.USERPROFILE}\\AppData\\Local\\Programs\\Python\\Python311\\python.exe`,
      `${process.env.USERPROFILE}\\AppData\\Local\\Programs\\Python\\Python312\\python.exe`,
    ];
    
    for (const pythonPath of commonWindowsPaths) {
      try {
        if (fs.existsSync(pythonPath)) {
          logger.info(`Found Python at: ${pythonPath}`);
          return pythonPath;
        }
      } catch (e) {
        // Ignore errors and continue checking
      }
    }
  } else {
    // On Unix-like systems, we can try to use the 'which' command
    try {
      const pythonPath = execSync('which python3 || which python').toString().trim();
      if (pythonPath) {
        logger.info(`Found Python at: ${pythonPath}`);
        return pythonPath;
      }
    } catch (e) {
      // Ignore errors and fall back to default
    }
  }
  
  // Try to find Python in PATH
  try {
    const pythonPath = execSync('where python', { encoding: 'utf8' }).trim().split('\n')[0];
    logger.info(`Found Python in PATH: ${pythonPath}`);
    return pythonPath;
  } catch (e) {
    // Ignore errors and continue
  }
  
  // Try Python launcher
  try {
    const pyPath = execSync('where py', { encoding: 'utf8' }).trim().split('\n')[0];
    logger.info(`Found Python launcher: ${pyPath}`);
    return pyPath;
  } catch (e) {
    // Ignore errors and continue
  }
  
  // Ask user for Python path
  logger.warn('Could not automatically detect Python path');
  const userPath = await question('Please enter the full path to your Python executable: ');
  
  if (userPath && fs.existsSync(userPath)) {
    logger.info(`Using user-provided Python path: ${userPath}`);
    return userPath;
  }
  
  logger.error('No valid Python path found. Please install Python and try again.');
  return 'python'; // Default fallback
}

// Update .env file with correct configuration
async function updateEnvFile(pythonPath) {
  logger.info('Updating .env file...');
  
  const envPath = path.join(process.cwd(), '.env');
  let envContent = '';
  
  // Create default .env content
  const defaultEnv = `# Python Configuration
PYTHON_PATH=${pythonPath}
PYTHON_EXECUTABLE=${pythonPath}
PYTHON_BRIDGE_MAX_RETRIES=3
PYTHON_EXECUTION_TIMEOUT=60000

# Server Configuration
PORT=5000
HOST=localhost
NODE_ENV=development
LOG_LEVEL=info

# Database Configuration
MONGODB_URI=mongodb://localhost:27017/sports-analytics
MONGODB_DB_NAME=sports-analytics
DB_MAX_POOL_SIZE=50
DB_MIN_POOL_SIZE=10
CONNECT_TIMEOUT_MS=30000
SOCKET_TIMEOUT_MS=45000

# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_CONNECT_TIMEOUT=10000
REDIS_ENABLE_OFFLINE_QUEUE=true
REDIS_MAX_RETRIES=3
REDIS_RETRY_STRATEGY_MAX_DELAY=2000

# Cache Configuration
CACHE_TTL=1800
CACHE_MAX_ITEMS=500
CACHE_CHECK_PERIOD=300

# WebSocket Configuration
WS_PORT=5150
WS_PATH=/ws
WS_HEARTBEAT_INTERVAL=60000
WS_CLIENT_TIMEOUT=35000
WS_MAX_PAYLOAD=52428800

# Performance Configuration
MEMORY_USAGE_THRESHOLD=0.80
CPU_LOAD_THRESHOLD=0.80
NETWORK_TRAFFIC_THRESHOLD=52428800
HEALTH_CHECK_INTERVAL=300000
METRICS_INTERVAL=300000
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX=50
MAX_CONNECTIONS_PER_IP=50
COMPRESSION_LEVEL=6
COMPRESSION_THRESHOLD=1024

# Security Configuration
JWT_SECRET=your-secret-key-here
JWT_EXPIRATION=86400
CORS_ORIGIN=http://localhost:5000`;
  
  // Check if .env file exists
  if (fs.existsSync(envPath)) {
    logger.info('.env file exists, updating...');
    envContent = fs.readFileSync(envPath, 'utf8');
    
    // Update Python path
    if (envContent.includes('PYTHON_PATH=')) {
      envContent = envContent.replace(/PYTHON_PATH=.*(\r?\n|$)/g, `PYTHON_PATH=${pythonPath}$1`);
    } else {
      envContent += `\nPYTHON_PATH=${pythonPath}\n`;
    }
    
    // Update Python executable
    if (envContent.includes('PYTHON_EXECUTABLE=')) {
      envContent = envContent.replace(/PYTHON_EXECUTABLE=.*(\r?\n|$)/g, `PYTHON_EXECUTABLE=${pythonPath}$1`);
    } else {
      envContent += `PYTHON_EXECUTABLE=${pythonPath}\n`;
    }
    
    // Ensure other critical variables are present
    const criticalVars = [
      'MONGODB_URI', 'REDIS_HOST', 'REDIS_PORT', 'PORT', 'WS_PORT'
    ];
    
    criticalVars.forEach(varName => {
      if (!envContent.includes(`${varName}=`)) {
        const defaultLine = defaultEnv.split('\n').find(line => line.startsWith(`${varName}=`));
        if (defaultLine) {
          envContent += `\n${defaultLine}\n`;
        }
      }
    });
  } else {
    logger.info('.env file does not exist, creating...');
    envContent = defaultEnv;
  }
  
  // Write updated content to .env file
  fs.writeFileSync(envPath, envContent);
  logger.info('.env file updated successfully');
  
  return envContent;
}

// Install required Python packages
async function installPythonPackages(pythonPath) {
  logger.info('Installing required Python packages...');
  
  const requiredPackages = [
    'numpy',
    'pandas',
    'scikit-learn==1.0.2',
    'matplotlib==3.5.2',
    'xgboost==1.6.1',
    'lightgbm==3.3.2',
    'hyperopt==0.2.7',
    'pymongo==4.1.1',
    'python-dotenv==0.20.0',
    'redis==4.3.4',
    'prometheus-client==0.14.1',
    'psutil==5.9.1',
    'cachetools'
  ];
  
  // Check which packages are already installed
  const installedPackages = [];
  const missingPackages = [];
  
  for (const pkg of requiredPackages) {
    const pkgName = pkg.split('==')[0];
    try {
      execSync(`"${pythonPath}" -c "import ${pkgName}; print(f'${pkgName} is installed')"`, { encoding: 'utf8' });
      installedPackages.push(pkg);
    } catch (e) {
      missingPackages.push(pkg);
    }
  }
  
  logger.info(`Already installed: ${installedPackages.join(', ')}`);
  logger.info(`Missing packages: ${missingPackages.join(', ')}`);
  
  if (missingPackages.length === 0) {
    logger.info('All required Python packages are already installed');
    return true;
  }
  
  // Install missing packages
  try {
    logger.info('Installing pip and setuptools...');
    execSync(`"${pythonPath}" -m pip install --upgrade pip setuptools wheel`, { stdio: 'inherit' });
    
    for (const pkg of missingPackages) {
      logger.info(`Installing ${pkg}...`);
      execSync(`"${pythonPath}" -m pip install ${pkg}`, { stdio: 'inherit' });
    }
    
    logger.info('All Python packages installed successfully');
    return true;
  } catch (error) {
    logger.error(`Error installing Python packages: ${error.message}`);
    return false;
  }
}

// Create logs directory if it doesn't exist
function ensureLogsDirectory() {
  const logsDir = path.join(process.cwd(), 'logs');
  if (!fs.existsSync(logsDir)) {
    logger.info(`Creating logs directory at: ${logsDir}`);
    fs.mkdirSync(logsDir, { recursive: true });
  }
}

// Fix file permissions
function fixFilePermissions() {
  logger.info('Fixing file permissions...');
  
  const scriptsDir = path.join(process.cwd(), 'scripts');
  if (fs.existsSync(scriptsDir)) {
    const files = fs.readdirSync(scriptsDir);
    const pythonScripts = files.filter(file => file.endsWith('.py'));
    
    pythonScripts.forEach(script => {
      const scriptPath = path.join(scriptsDir, script);
      try {
        // Make Python scripts executable
        fs.chmodSync(scriptPath, 0o755);
        logger.info(`Made ${script} executable`);
      } catch (error) {
        logger.error(`Error setting permissions for ${script}: ${error.message}`);
      }
    });
  }
}

// Check and fix MongoDB
async function checkAndFixMongoDB() {
  logger.info('Checking MongoDB...');
  
  try {
    // Check if MongoDB is running
    execSync('mongod --version', { stdio: 'pipe' });
    logger.info('MongoDB is installed');
    
    // Ask user if they want to start MongoDB
    const startMongo = await question('Do you want to ensure MongoDB is running? (y/n): ');
    if (startMongo.toLowerCase() === 'y') {
      try {
        logger.info('Attempting to start MongoDB...');
        execSync('net start MongoDB', { stdio: 'pipe' });
        logger.info('MongoDB service started');
      } catch (error) {
        logger.warn(`Could not start MongoDB service: ${error.message}`);
        logger.info('You may need to start MongoDB manually');
      }
    }
  } catch (error) {
    logger.warn(`MongoDB may not be installed: ${error.message}`);
    logger.info('Please install MongoDB to use this application');
  }
}

// Check and fix Redis
async function checkAndFixRedis() {
  logger.info('Checking Redis...');
  
  try {
    // Check if Redis is installed
    execSync('redis-cli --version', { stdio: 'pipe' });
    logger.info('Redis CLI is installed');
    
    // Ask user if they want to start Redis
    const startRedis = await question('Do you want to ensure Redis is running? (y/n): ');
    if (startRedis.toLowerCase() === 'y') {
      try {
        logger.info('Attempting to start Redis...');
        // This is Windows-specific, adjust for other platforms
        execSync('redis-server --service-start', { stdio: 'pipe' });
        logger.info('Redis service started');
      } catch (error) {
        logger.warn(`Could not start Redis service: ${error.message}`);
        logger.info('You may need to start Redis manually');
      }
    }
  } catch (error) {
    logger.warn(`Redis may not be installed: ${error.message}`);
    logger.info('The application can run without Redis using in-memory fallbacks');
    
    // Update .env to use in-memory cache
    const envPath = path.join(process.cwd(), '.env');
    if (fs.existsSync(envPath)) {
      let envContent = fs.readFileSync(envPath, 'utf8');
      if (!envContent.includes('USE_IN_MEMORY_CACHE=')) {
        envContent += '\nUSE_IN_MEMORY_CACHE=true\n';
        fs.writeFileSync(envPath, envContent);
        logger.info('Updated .env to use in-memory cache');
      }
    }
  }
}

// Fix Node.js dependencies
async function fixNodeDependencies() {
  logger.info('Checking Node.js dependencies...');
  
  // Check if node_modules exists
  const nodeModulesPath = path.join(process.cwd(), 'node_modules');
  if (!fs.existsSync(nodeModulesPath)) {
    logger.info('node_modules directory not found, running npm install...');
    
    try {
      execSync('npm install', { stdio: 'inherit' });
      logger.info('npm install completed successfully');
    } catch (error) {
      logger.error(`Error running npm install: ${error.message}`);
    }
  } else {
    logger.info('node_modules directory exists');
    
    // Check for critical dependencies
    const criticalDeps = [
      'python-shell',
      'mongodb',
      'ioredis',
      'redis',
      'ws',
      'express'
    ];
    
    const missingDeps = [];
    
    for (const dep of criticalDeps) {
      const depPath = path.join(nodeModulesPath, dep);
      if (!fs.existsSync(depPath)) {
        missingDeps.push(dep);
      }
    }
    
    if (missingDeps.length > 0) {
      logger.info(`Missing dependencies: ${missingDeps.join(', ')}`);
      logger.info('Installing missing dependencies...');
      
      try {
        execSync(`npm install ${missingDeps.join(' ')}`, { stdio: 'inherit' });
        logger.info('Dependencies installed successfully');
      } catch (error) {
        logger.error(`Error installing dependencies: ${error.message}`);
      }
    } else {
      logger.info('All critical dependencies are installed');
    }
  }
}

// Main fix function
async function fixEnvironment() {
  logger.info('Starting environment fix...');
  logger.info('Timestamp: ' + new Date().toISOString());
  
  try {
    // Step 1: Ensure logs directory exists
    ensureLogsDirectory();
    
    // Step 2: Detect Python path
    const pythonPath = await detectPythonPath();
    
    // Step 3: Update .env file
    await updateEnvFile(pythonPath);
    
    // Step 4: Install required Python packages
    await installPythonPackages(pythonPath);
    
    // Step 5: Fix file permissions
    fixFilePermissions();
    
    // Step 6: Check and fix MongoDB
    await checkAndFixMongoDB();
    
    // Step 7: Check and fix Redis
    await checkAndFixRedis();
    
    // Step 8: Fix Node.js dependencies
    await fixNodeDependencies();
    
    logger.info('Environment fix completed successfully');
    logger.info('You can now try running the application with: npm start');
  } catch (error) {
    logger.error(`Environment fix failed: ${error.message}`);
    logger.error(error.stack);
  } finally {
    // Close readline interface
    rl.close();
  }
}

// Run fix if this script is executed directly
if (require.main === module) {
  fixEnvironment()
    .then(() => {
      logger.info('Fix completed');
    })
    .catch(error => {
      logger.error(`Fix failed: ${error.message}`);
      process.exit(1);
    });
}

module.exports = {
  fixEnvironment,
  detectPythonPath,
  updateEnvFile,
  installPythonPackages,
  ensureLogsDirectory,
  fixFilePermissions,
  checkAndFixMongoDB,
  checkAndFixRedis,
  fixNodeDependencies
};// scripts/fix-environment.js
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');
const winston = require('winston');
const readline = require('readline');

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
    new winston.transports.File({ filename: 'environment-fix.log' })
  ]
});

// Create readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Promisify readline question
function question(query) {
  return new Promise(resolve => {
    rl.question(query, answer => {
      resolve(answer);
    });
  });
}

// Detect Python executable path
async function detectPythonPath() {
  logger.info('Detecting Python executable path...');
  
  // Check environment variables first
  const envPath = process.env.PYTHON_PATH || process.env.PYTHON_EXECUTABLE;
  if (envPath && fs.existsSync(envPath)) {
    logger.info(`Found Python path in environment variables: ${envPath}`);
    return envPath;
  }
  
  // Check common paths based on platform
  const isWindows = process.platform === 'win32';
  
  if (isWindows) {
    // Common Windows Python paths
    const commonWindowsPaths = [
      // Python 3 paths
      'C:\\Python39\\python.exe',
      'C:\\Python310\\python.exe',
      'C:\\Python311\\python.exe',
      'C:\\Python312\\python.exe',
      // Python launcher
      'C:\\Windows\\py.exe',
      // Anaconda/Miniconda paths
      'C:\\ProgramData\\Anaconda3\\python.exe',
      'C:\\ProgramData\\miniconda3\\python.exe',
      // User profile paths
      `${process.env.USERPROFILE}\\AppData\\Local\\Programs\\Python\\Python39\\python.exe`,
      `${process.env.USERPROFILE}\\AppData\\Local\\Programs\\Python\\Python310\\python.exe`,
      `${process.env.USERPROFILE}\\AppData\\Local\\Programs\\Python\\Python311\\python.exe`,
      `${process.env.USERPROFILE}\\AppData\\Local\\Programs\\Python\\Python312\\python.exe`,
    ];
    
    for (const pythonPath of commonWindowsPaths) {
      try {
        if (fs.existsSync(pythonPath)) {
          logger.info(`Found Python at: ${pythonPath}`);
          return pythonPath;
        }
      } catch (e) {
        // Ignore errors and continue checking
      }
    }
  } else {
    // On Unix-like systems, we can try to use the 'which' command
    try {
      const pythonPath = execSync('which python3 || which python').toString().trim();
      if (pythonPath) {
        logger.info(`Found Python at: ${pythonPath}`);
        return pythonPath;
      }
    } catch (e) {
      // Ignore errors and fall back to default
    }
  }
  
  // Try to find Python in PATH
  try {
    const pythonPath = execSync('where python', { encoding: 'utf8' }).trim().split('\n')[0];
    logger.info(`Found Python in PATH: ${pythonPath}`);
    return pythonPath;
  } catch (e) {
    // Ignore errors and continue
  }
  
  // Try Python launcher
  try {
    const pyPath = execSync('where py', { encoding: 'utf8' }).trim().split('\n')[0];
    logger.info(`Found Python launcher: ${pyPath}`);
    return pyPath;
  } catch (e) {
    // Ignore errors and continue
  }
  
  // Ask user for Python path
  logger.warn('Could not automatically detect Python path');
  const userPath = await question('Please enter the full path to your Python executable: ');
  
  if (userPath && fs.existsSync(userPath)) {
    logger.info(`Using user-provided Python path: ${userPath}`);
    return userPath;
  }
  
  logger.error('No valid Python path found. Please install Python and try again.');
  return 'python'; // Default fallback
}

// Update .env file with correct configuration
async function updateEnvFile(pythonPath) {
  logger.info('Updating .env file...');
  
  const envPath = path.join(process.cwd(), '.env');
  let envContent = '';
  
  // Create default .env content
  const defaultEnv = `# Python Configuration
PYTHON_PATH=${pythonPath}
PYTHON_EXECUTABLE=${pythonPath}
PYTHON_BRIDGE_MAX_RETRIES=3
PYTHON_EXECUTION_TIMEOUT=60000

# Server Configuration
PORT=5000
HOST=localhost
NODE_ENV=development
LOG_LEVEL=info

# Database Configuration
MONGODB_URI=mongodb://localhost:27017/sports-analytics
MONGODB_DB_NAME=sports-analytics
DB_MAX_POOL_SIZE=50
DB_MIN_POOL_SIZE=10
CONNECT_TIMEOUT_MS=30000
SOCKET_TIMEOUT_MS=45000

# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_CONNECT_TIMEOUT=10000
REDIS_ENABLE_OFFLINE_QUEUE=true
REDIS_MAX_RETRIES=3
REDIS_RETRY_STRATEGY_MAX_DELAY=2000

# Cache Configuration
CACHE_TTL=1800
CACHE_MAX_ITEMS=500
CACHE_CHECK_PERIOD=300

# WebSocket Configuration
WS_PORT=5150
WS_PATH=/ws
WS_HEARTBEAT_INTERVAL=60000
WS_CLIENT_TIMEOUT=35000
WS_MAX_PAYLOAD=52428800

# Performance Configuration
MEMORY_USAGE_THRESHOLD=0.80
CPU_LOAD_THRESHOLD=0.80
NETWORK_TRAFFIC_THRESHOLD=52428800
HEALTH_CHECK_INTERVAL=300000
METRICS_INTERVAL=300000
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX=50
MAX_CONNECTIONS_PER_IP=50
COMPRESSION_LEVEL=6
COMPRESSION_THRESHOLD=1024

# Security Configuration
JWT_SECRET=your-secret-key-here
JWT_EXPIRATION=86400
CORS_ORIGIN=http://localhost:5000`;
  
  // Check if .env file exists
  if (fs.existsSync(envPath)) {
    logger.info('.env file exists, updating...');
    envContent = fs.readFileSync(envPath, 'utf8');
    
    // Update Python path
    if (envContent.includes('PYTHON_PATH=')) {
      envContent = envContent.replace(/PYTHON_PATH=.*(\r?\n|$)/g, `PYTHON_PATH=${pythonPath}$1`);
    } else {
      envContent += `\nPYTHON_PATH=${pythonPath}\n`;
    }
    
    // Update Python executable
    if (envContent.includes('PYTHON_EXECUTABLE=')) {
      envContent = envContent.replace(/PYTHON_EXECUTABLE=.*(\r?\n|$)/g, `PYTHON_EXECUTABLE=${pythonPath}$1`);
    } else {
      envContent += `PYTHON_EXECUTABLE=${pythonPath}\n`;
    }
    
    // Ensure other critical variables are present
    const criticalVars = [
      'MONGODB_URI', 'REDIS_HOST', 'REDIS_PORT', 'PORT', 'WS_PORT'
    ];
    
    criticalVars.forEach(varName => {
      if (!envContent.includes(`${varName}=`)) {
        const defaultLine = defaultEnv.split('\n').find(line => line.startsWith(`${varName}=`));
        if (defaultLine) {
          envContent += `\n${defaultLine}\n`;
        }
      }
    });
  } else {
    logger.info('.env file does not exist, creating...');
    envContent = defaultEnv;
  }
  
  // Write updated content to .env file
  fs.writeFileSync(envPath, envContent);
  logger.info('.env file updated successfully');
  
  return envContent;
}

// Install required Python packages
async function installPythonPackages(pythonPath) {
  logger.info('Installing required Python packages...');
  
  const requiredPackages = [
    'numpy',
    'pandas',
    'scikit-learn==1.0.2',
    'matplotlib==3.5.2',
    'xgboost==1.6.1',
    'lightgbm==3.3.2',
    'hyperopt==0.2.7',
    'pymongo==4.1.1',
    'python-dotenv==0.20.0',
    'redis==4.3.4',
    'prometheus-client==0.14.1',
    'psutil==5.9.1',
    'cachetools'
  ];
  
  // Check which packages are already installed
  const installedPackages = [];
  const missingPackages = [];
  
  for (const pkg of requiredPackages) {
    const pkgName = pkg.split('==')[0];
    try {
      execSync(`"${pythonPath}" -c "import ${pkgName}; print(f'${pkgName} is installed')"`, { encoding: 'utf8' });
      installedPackages.push(pkg);
    } catch (e) {
      missingPackages.push(pkg);
    }
  }
  
  logger.info(`Already installed: ${installedPackages.join(', ')}`);
  logger.info(`Missing packages: ${missingPackages.join(', ')}`);
  
  if (missingPackages.length === 0) {
    logger.info('All required Python packages are already installed');
    return true;
  }
  
  // Install missing packages
  try {
    logger.info('Installing pip and setuptools...');
    execSync(`"${pythonPath}" -m pip install --upgrade pip setuptools wheel`, { stdio: 'inherit' });
    
    for (const pkg of missingPackages) {
      logger.info(`Installing ${pkg}...`);
      execSync(`"${pythonPath}" -m pip install ${pkg}`, { stdio: 'inherit' });
    }
    
    logger.info('All Python packages installed successfully');
    return true;
  } catch (error) {
    logger.error(`Error installing Python packages: ${error.message}`);
    return false;
  }
}

// Create logs directory if it doesn't exist
function ensureLogsDirectory() {
  const logsDir = path.join(process.cwd(), 'logs');
  if (!fs.existsSync(logsDir)) {
    logger.info(`Creating logs directory at: ${logsDir}`);
    fs.mkdirSync(logsDir, { recursive: true });
  }
}

// Fix file permissions
function fixFilePermissions() {
  logger.info('Fixing file permissions...');
  
  const scriptsDir = path.join(process.cwd(), 'scripts');
  if (fs.existsSync(scriptsDir)) {
    const files = fs.readdirSync(scriptsDir);
    const pythonScripts = files.filter(file => file.endsWith('.py'));
    
    pythonScripts.forEach(script => {
      const scriptPath = path.join(scriptsDir, script);
      try {
        // Make Python scripts executable
        fs.chmodSync(scriptPath, 0o755);
        logger.info(`Made ${script} executable`);
      } catch (error) {
        logger.error(`Error setting permissions for ${script}: ${error.message}`);
      }
    });
  }
}

// Check and fix MongoDB
async function checkAndFixMongoDB() {
  logger.info('Checking MongoDB...');
  
  try {
    // Check if MongoDB is running
    execSync('mongod --version', { stdio: 'pipe' });
    logger.info('MongoDB is installed');
    
    // Ask user if they want to start MongoDB
    const startMongo = await question('Do you want to ensure MongoDB is running? (y/n): ');
    if (startMongo.toLowerCase() === 'y') {
      try {
        logger.info('Attempting to start MongoDB...');
        execSync('net start MongoDB', { stdio: 'pipe' });
        logger.info('MongoDB service started');
      } catch (error) {
        logger.warn(`Could not start MongoDB service: ${error.message}`);
        logger.info('You may need to start MongoDB manually');
      }
    }
  } catch (error) {
    logger.warn(`MongoDB may not be installed: ${error.message}`);
    logger.info('Please install MongoDB to use this application');
  }
}

// Check and fix Redis
async function checkAndFixRedis() {
  logger.info('Checking Redis...');
  
  try {
    // Check if Redis is installed
    execSync('redis-cli --version', { stdio: 'pipe' });
    logger.info('Redis CLI is installed');
    
    // Ask user if they want to start Redis
    const startRedis = await question('Do you want to ensure Redis is running? (y/n): ');
    if (startRedis.toLowerCase() === 'y') {
      try {
        logger.info('Attempting to start Redis...');
        // This is Windows-specific, adjust for other platforms
        execSync('redis-server --service-start', { stdio: 'pipe' });
        logger.info('Redis service started');
      } catch (error) {
        logger.warn(`Could not start Redis service: ${error.message}`);
        logger.info('You may need to start Redis manually');
      }
    }
  } catch (error) {
    logger.warn(`Redis may not be installed: ${error.message}`);
    logger.info('The application can run without Redis using in-memory fallbacks');
    
    // Update .env to use in-memory cache
    const envPath = path.join(process.cwd(), '.env');
    if (fs.existsSync(envPath)) {
      let envContent = fs.readFileSync(envPath, 'utf8');
      if (!envContent.includes('USE_IN_MEMORY_CACHE=')) {
        envContent += '\nUSE_IN_MEMORY_CACHE=true\n';
        fs.writeFileSync(envPath, envContent);
        logger.info('Updated .env to use in-memory cache');
      }
    }
  }
}

// Fix Node.js dependencies
async function fixNodeDependencies() {
  logger.info('Checking Node.js dependencies...');
  
  // Check if node_modules exists
  const nodeModulesPath = path.join(process.cwd(), 'node_modules');
  if (!fs.existsSync(nodeModulesPath)) {
    logger.info('node_modules directory not found, running npm install...');
    
    try {
      execSync('npm install', { stdio: 'inherit' });
      logger.info('npm install completed successfully');
    } catch (error) {
      logger.error(`Error running npm install: ${error.message}`);
    }
  } else {
    logger.info('node_modules directory exists');
    
    // Check for critical dependencies
    const criticalDeps = [
      'python-shell',
      'mongodb',
      'ioredis',
      'redis',
      'ws',
      'express'
    ];
    
    const missingDeps = [];
    
    for (const dep of criticalDeps) {
      const depPath = path.join(nodeModulesPath, dep);
      if (!fs.existsSync(depPath)) {
        missingDeps.push(dep);
      }
    }
    
    if (missingDeps.length > 0) {
      logger.info(`Missing dependencies: ${missingDeps.join(', ')}`);
      logger.info('Installing missing dependencies...');
      
      try {
        execSync(`npm install ${missingDeps.join(' ')}`, { stdio: 'inherit' });
        logger.info('Dependencies installed successfully');
      } catch (error) {
        logger.error(`Error installing dependencies: ${error.message}`);
      }
    } else {
      logger.info('All critical dependencies are installed');
    }
  }
}

// Main fix function
async function fixEnvironment() {
  logger.info('Starting environment fix...');
  logger.info('Timestamp: ' + new Date().toISOString());
  
  try {
    // Step 1: Ensure logs directory exists
    ensureLogsDirectory();
    
    // Step 2: Detect Python path
    const pythonPath = await detectPythonPath();
    
    // Step 3: Update .env file
    await updateEnvFile(pythonPath);
    
    // Step 4: Install required Python packages
    await installPythonPackages(pythonPath);
    
    // Step 5: Fix file permissions
    fixFilePermissions();
    
    // Step 6: Check and fix MongoDB
    await checkAndFixMongoDB();
    
    // Step 7: Check and fix Redis
    await checkAndFixRedis();
    
    // Step 8: Fix Node.js dependencies
    await fixNodeDependencies();
    
    logger.info('Environment fix completed successfully');
    logger.info('You can now try running the application with: npm start');
  } catch (error) {
    logger.error(`Environment fix failed: ${error.message}`);
    logger.error(error.stack);
  } finally {
    // Close readline interface
    rl.close();
  }
}

// Run fix if this script is executed directly
if (require.main === module) {
  fixEnvironment()
    .then(() => {
      logger.info('Fix completed');
    })
    .catch(error => {
      logger.error(`Fix failed: ${error.message}`);
      process.exit(1);
    });
}

module.exports = {
  fixEnvironment,
  detectPythonPath,
  updateEnvFile,
  installPythonPackages,
  ensureLogsDirectory,
  fixFilePermissions,
  checkAndFixMongoDB,
  checkAndFixRedis,
  fixNodeDependencies
};// scripts/fix-environment.js
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');
const winston = require('winston');
const readline = require('readline');

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
    new winston.transports.File({ filename: 'environment-fix.log' })
  ]
});

// Create readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Promisify readline question
function question(query) {
  return new Promise(resolve => {
    rl.question(query, answer => {
      resolve(answer);
    });
  });
}

// Detect Python executable path
async function detectPythonPath() {
  logger.info('Detecting Python executable path...');
  
  // Check environment variables first
  const envPath = process.env.PYTHON_PATH || process.env.PYTHON_EXECUTABLE;
  if (envPath && fs.existsSync(envPath)) {
    logger.info(`Found Python path in environment variables: ${envPath}`);
    return envPath;
  }
  
  // Check common paths based on platform
  const isWindows = process.platform === 'win32';
  
  if (isWindows) {
    // Common Windows Python paths
    const commonWindowsPaths = [
      // Python 3 paths
      'C:\\Python39\\python.exe',
      'C:\\Python310\\python.exe',
      'C:\\Python311\\python.exe',
      'C:\\Python312\\python.exe',
      // Python launcher
      'C:\\Windows\\py.exe',
      // Anaconda/Miniconda paths
      'C:\\ProgramData\\Anaconda3\\python.exe',
      'C:\\ProgramData\\miniconda3\\python.exe',
      // User profile paths
      `${process.env.USERPROFILE}\\AppData\\Local\\Programs\\Python\\Python39\\python.exe`,
      `${process.env.USERPROFILE}\\AppData\\Local\\Programs\\Python\\Python310\\python.exe`,
      `${process.env.USERPROFILE}\\AppData\\Local\\Programs\\Python\\Python311\\python.exe`,
      `${process.env.USERPROFILE}\\AppData\\Local\\Programs\\Python\\Python312\\python.exe`,
    ];
    
    for (const pythonPath of commonWindowsPaths) {
      try {
        if (fs.existsSync(pythonPath)) {
          logger.info(`Found Python at: ${pythonPath}`);
          return pythonPath;
        }
      } catch (e) {
        // Ignore errors and continue checking
      }
    }
  } else {
    // On Unix-like systems, we can try to use the 'which' command
    try {
      const pythonPath = execSync('which python3 || which python').toString().trim();
      if (pythonPath) {
        logger.info(`Found Python at: ${pythonPath}`);
        return pythonPath;
      }
    } catch (e) {
      // Ignore errors and fall back to default
    }
  }
  
  // Try to find Python in PATH
  try {
    const pythonPath = execSync('where python', { encoding: 'utf8' }).trim().split('\n')[0];
    logger.info(`Found Python in PATH: ${pythonPath}`);
    return pythonPath;
  } catch (e) {
    // Ignore errors and continue
  }
  
  // Try Python launcher
  try {
    const pyPath = execSync('where py', { encoding: 'utf8' }).trim().split('\n')[0];
    logger.info(`Found Python launcher: ${pyPath}`);
    return pyPath;
  } catch (e) {
    // Ignore errors and continue
  }
  
  // Ask user for Python path
  logger.warn('Could not automatically detect Python path');
  const userPath = await question('Please enter the full path to your Python executable: ');
  
  if (userPath && fs.existsSync(userPath)) {
    logger.info(`Using user-provided Python path: ${userPath}`);
    return userPath;
  }
  
  logger.error('No valid Python path found. Please install Python and try again.');
  return 'python'; // Default fallback
}

// Update .env file with correct configuration
async function updateEnvFile(pythonPath) {
  logger.info('Updating .env file...');
  
  const envPath = path.join(process.cwd(), '.env');
  let envContent = '';
  
  // Create default .env content
  const defaultEnv = `# Python Configuration
PYTHON_PATH=${pythonPath}
PYTHON_EXECUTABLE=${pythonPath}
PYTHON_BRIDGE_MAX_RETRIES=3
PYTHON_EXECUTION_TIMEOUT=60000

# Server Configuration
PORT=5000
HOST=localhost
NODE_ENV=development
LOG_LEVEL=info

# Database Configuration
MONGODB_URI=mongodb://localhost:27017/sports-analytics
MONGODB_DB_NAME=sports-analytics
DB_MAX_POOL_SIZE=50
DB_MIN_POOL_SIZE=10
CONNECT_TIMEOUT_MS=30000
SOCKET_TIMEOUT_MS=45000

# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_CONNECT_TIMEOUT=10000
REDIS_ENABLE_OFFLINE_QUEUE=true
REDIS_MAX_RETRIES=3
REDIS_RETRY_STRATEGY_MAX_DELAY=2000

# Cache Configuration
CACHE_TTL=1800
CACHE_MAX_ITEMS=500
CACHE_CHECK_PERIOD=300

# WebSocket Configuration
WS_PORT=5150
WS_PATH=/ws
WS_HEARTBEAT_INTERVAL=60000
WS_CLIENT_TIMEOUT=35000
WS_MAX_PAYLOAD=52428800

# Performance Configuration
MEMORY_USAGE_THRESHOLD=0.80
CPU_LOAD_THRESHOLD=0.80
NETWORK_TRAFFIC_THRESHOLD=52428800
HEALTH_CHECK_INTERVAL=300000
METRICS_INTERVAL=300000
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX=50
MAX_CONNECTIONS_PER_IP=50
COMPRESSION_LEVEL=6
COMPRESSION_THRESHOLD=1024

# Security Configuration
JWT_SECRET=your-secret-key-here
JWT_EXPIRATION=86400
CORS_ORIGIN=http://localhost:5000`;
  
  // Check if .env file exists
  if (fs.existsSync(envPath)) {
    logger.info('.env file exists, updating...');
    envContent = fs.readFileSync(envPath, 'utf8');
    
    // Update Python path
    if (envContent.includes('PYTHON_PATH=')) {
      envContent = envContent.replace(/PYTHON_PATH=.*(\r?\n|$)/g, `PYTHON_PATH=${pythonPath}$1`);
    } else {
      envContent += `\nPYTHON_PATH=${pythonPath}\n`;
    }
    
    // Update Python executable
    if (envContent.includes('PYTHON_EXECUTABLE=')) {
      envContent = envContent.replace(/PYTHON_EXECUTABLE=.*(\r?\n|$)/g, `PYTHON_EXECUTABLE=${pythonPath}$1`);
    } else {
      envContent += `PYTHON_EXECUTABLE=${pythonPath}\n`;
    }
    
    // Ensure other critical variables are present
    const criticalVars = [
      'MONGODB_URI', 'REDIS_HOST', 'REDIS_PORT', 'PORT', 'WS_PORT'
    ];
    
    criticalVars.forEach(varName => {
      if (!envContent.includes(`${varName}=`)) {
        const defaultLine = defaultEnv.split('\n').find(line => line.startsWith(`${varName}=`));
        if (defaultLine) {
          envContent += `\n${defaultLine}\n`;
        }
      }
    });
  } else {
    logger.info('.env file does not exist, creating...');
    envContent = defaultEnv;
  }
  
  // Write updated content to .env file
  fs.writeFileSync(envPath, envContent);
  logger.info('.env file updated successfully');
  
  return envContent;
}

// Install required Python packages
async function installPythonPackages(pythonPath) {
  logger.info('Installing required Python packages...');
  
  const requiredPackages = [
    'numpy',
    'pandas',
    'scikit-learn==1.0.2',
    'matplotlib==3.5.2',
    'xgboost==1.6.1',
    'lightgbm==3.3.2',
    'hyperopt==0.2.7',
    'pymongo==4.1.1',
    'python-dotenv==0.20.0',
    'redis==4.3.4',
    'prometheus-client==0.14.1',
    'psutil==5.9.1',
    'cachetools'
  ];
  
  // Check which packages are already installed
  const installedPackages = [];
  const missingPackages = [];
  
  for (const pkg of requiredPackages) {
    const pkgName = pkg.split('==')[0];
    try {
      execSync(`"${pythonPath}" -c "import ${pkgName}; print(f'${pkgName} is installed')"`, { encoding: 'utf8' });
      installedPackages.push(pkg);
    } catch (e) {
      missingPackages.push(pkg);
    }
  }
  
  logger.info(`Already installed: ${installedPackages.join(', ')}`);
  logger.info(`Missing packages: ${missingPackages.join(', ')}`);
  
  if (missingPackages.length === 0) {
    logger.info('All required Python packages are already installed');
    return true;
  }
  
  // Install missing packages
  try {
    logger.info('Installing pip and setuptools...');
    execSync(`"${pythonPath}" -m pip install --upgrade pip setuptools wheel`, { stdio: 'inherit' });
    
    for (const pkg of missingPackages) {
      logger.info(`Installing ${pkg}...`);
      execSync(`"${pythonPath}" -m pip install ${pkg}`, { stdio: 'inherit' });
    }
    
    logger.info('All Python packages installed successfully');
    return true;
  } catch (error) {
    logger.error(`Error installing Python packages: ${error.message}`);
    return false;
  }
}

// Create logs directory if it doesn't exist
function ensureLogsDirectory() {
  const logsDir = path.join(process.cwd(), 'logs');
  if (!fs.existsSync(logsDir)) {
    logger.info(`Creating logs directory at: ${logsDir}`);
    fs.mkdirSync(logsDir, { recursive: true });
  }
}

// Fix file permissions
function fixFilePermissions() {
  logger.info('Fixing file permissions...');
  
  const scriptsDir = path.join(process.cwd(), 'scripts');
  if (fs.existsSync(scriptsDir)) {
    const files = fs.readdirSync(scriptsDir);
    const pythonScripts = files.filter(file => file.endsWith('.py'));
    
    pythonScripts.forEach(script => {
      const scriptPath = path.join(scriptsDir, script);
      try {
        // Make Python scripts executable
        fs.chmodSync(scriptPath, 0o755);
        logger.info(`Made ${script} executable`);
      } catch (error) {
        logger.error(`Error setting permissions for ${script}: ${error.message}`);
      }
    });
  }
}

// Check and fix MongoDB
async function checkAndFixMongoDB() {
  logger.info('Checking MongoDB...');
  
  try {
    // Check if MongoDB is running
    execSync('mongod --version', { stdio: 'pipe' });
    logger.info('MongoDB is installed');
    
    // Ask user if they want to start MongoDB
    const startMongo = await question('Do you want to ensure MongoDB is running? (y/n): ');
    if (startMongo.toLowerCase() === 'y') {
      try {
        logger.info('Attempting to start MongoDB...');
        execSync('net start MongoDB', { stdio: 'pipe' });
        logger.info('MongoDB service started');
      } catch (error) {
        logger.warn(`Could not start MongoDB service: ${error.message}`);
        logger.info('You may need to start MongoDB manually');
      }
    }
  } catch (error) {
    logger.warn(`MongoDB may not be installed: ${error.message}`);
    logger.info('Please install MongoDB to use this application');
  }
}

// Check and fix Redis
async function checkAndFixRedis() {
  logger.info('Checking Redis...');
  
  try {
    // Check if Redis is installed
    execSync('redis-cli --version', { stdio: 'pipe' });
    logger.info('Redis CLI is installed');
    
    // Ask user if they want to start Redis
    const startRedis = await question('Do you want to ensure Redis is running? (y/n): ');
    if (startRedis.toLowerCase() === 'y') {
      try {
        logger.info('Attempting to start Redis...');
        // This is Windows-specific, adjust for other platforms
        execSync('redis-server --service-start', { stdio: 'pipe' });
        logger.info('Redis service started');
      } catch (error) {
        logger.warn(`Could not start Redis service: ${error.message}`);
        logger.info('You may need to start Redis manually');
      }
    }
  } catch (error) {
    logger.warn(`Redis may not be installed: ${error.message}`);
    logger.info('The application can run without Redis using in-memory fallbacks');
    
    // Update .env to use in-memory cache
    const envPath = path.join(process.cwd(), '.env');
    if (fs.existsSync(envPath)) {
      let envContent = fs.readFileSync(envPath, 'utf8');
      if (!envContent.includes('USE_IN_MEMORY_CACHE=')) {
        envContent += '\nUSE_IN_MEMORY_CACHE=true\n';
        fs.writeFileSync(envPath, envContent);
        logger.info('Updated .env to use in-memory cache');
      }
    }
  }
}

// Fix Node.js dependencies
async function fixNodeDependencies() {
  logger.info('Checking Node.js dependencies...');
  
  // Check if node_modules exists
  const nodeModulesPath = path.join(process.cwd(), 'node_modules');
  if (!fs.existsSync(nodeModulesPath)) {
    logger.info('node_modules directory not found, running npm install...');
    
    try {
      execSync('npm install', { stdio: 'inherit' });
      logger.info('npm install completed successfully');
    } catch (error) {
      logger.error(`Error running npm install: ${error.message}`);
    }
  } else {
    logger.info('node_modules directory exists');
    
    // Check for critical dependencies
    const criticalDeps = [
      'python-shell',
      'mongodb',
      'ioredis',
      'redis',
      'ws',
      'express'
    ];
    
    const missingDeps = [];
    
    for (const dep of criticalDeps) {
      const depPath = path.join(nodeModulesPath, dep);
      if (!fs.existsSync(depPath)) {
        missingDeps.push(dep);
      }
    }
    
    if (missingDeps.length > 0) {
      logger.info(`Missing dependencies: ${missingDeps.join(', ')}`);
      logger.info('Installing missing dependencies...');
      
      try {
        execSync(`npm install ${missingDeps.join(' ')}`, { stdio: 'inherit' });
        logger.info('Dependencies installed successfully');
      } catch (error) {
        logger.error(`Error installing dependencies: ${error.message}`);
      }
    } else {
      logger.info('All critical dependencies are installed');
    }
  }
}

// Main fix function
async function fixEnvironment() {
  logger.info('Starting environment fix...');
  logger.info('Timestamp: ' + new Date().toISOString());
  
  try {
    // Step 1: Ensure logs directory exists
    ensureLogsDirectory();
    
    // Step 2: Detect Python path
    const pythonPath = await detectPythonPath();
    
    // Step 3: Update .env file
    await updateEnvFile(pythonPath);
    
    // Step 4: Install required Python packages
    await installPythonPackages(pythonPath);
    
    // Step 5: Fix file permissions
    fixFilePermissions();
    
    // Step 6: Check and fix MongoDB
    await checkAndFixMongoDB();
    
    // Step 7: Check and fix Redis
    await checkAndFixRedis();
    
    // Step 8: Fix Node.js dependencies
    await fixNodeDependencies();
    
    logger.info('Environment fix completed successfully');
    logger.info('You can now try running the application with: npm start');
  } catch (error) {
    logger.error(`Environment fix failed: ${error.message}`);
    logger.error(error.stack);
  } finally {
    // Close readline interface
    rl.close();
  }
}

// Run fix if this script is executed directly
if (require.main === module) {
  fixEnvironment()
    .then(() => {
      logger.info('Fix completed');
    })
    .catch(error => {
      logger.error(`Fix failed: ${error.message}`);
      process.exit(1);
    });
}

module.exports = {
  fixEnvironment,
  detectPythonPath,
  updateEnvFile,
  installPythonPackages,
  ensureLogsDirectory,
  fixFilePermissions,
  checkAndFixMongoDB,
  checkAndFixRedis,
  fixNodeDependencies
};// scripts/fix-environment.js
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');
const winston = require('winston');
const readline = require('readline');

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
    new winston.transports.File({ filename: 'environment-fix.log' })
  ]
});

// Create readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Promisify readline question
function question(query) {
  return new Promise(resolve => {
    rl.question(query, answer => {
      resolve(answer);
    });
  });
}

// Detect Python executable path
async function detectPythonPath() {
  logger.info('Detecting Python executable path...');
  
  // Check environment variables first
  const envPath = process.env.PYTHON_PATH || process.env.PYTHON_EXECUTABLE;
  if (envPath && fs.existsSync(envPath)) {
    logger.info(`Found Python path in environment variables: ${envPath}`);
    return envPath;
  }
  
  // Check common paths based on platform
  const isWindows = process.platform === 'win32';
  
  if (isWindows) {
    // Common Windows Python paths
    const commonWindowsPaths = [
      // Python 3 paths
      'C:\\Python39\\python.exe',
      'C:\\Python310\\python.exe',
      'C:\\Python311\\python.exe',
      'C:\\Python312\\python.exe',
      // Python launcher
      'C:\\Windows\\py.exe',
      // Anaconda/Miniconda paths
      'C:\\ProgramData\\Anaconda3\\python.exe',
      'C:\\ProgramData\\miniconda3\\python.exe',
      // User profile paths
      `${process.env.USERPROFILE}\\AppData\\Local\\Programs\\Python\\Python39\\python.exe`,
      `${process.env.USERPROFILE}\\AppData\\Local\\Programs\\Python\\Python310\\python.exe`,
      `${process.env.USERPROFILE}\\AppData\\Local\\Programs\\Python\\Python311\\python.exe`,
      `${process.env.USERPROFILE}\\AppData\\Local\\Programs\\Python\\Python312\\python.exe`,
    ];
    
    for (const pythonPath of commonWindowsPaths) {
      try {
        if (fs.existsSync(pythonPath)) {
          logger.info(`Found Python at: ${pythonPath}`);
          return pythonPath;
        }
      } catch (e) {
        // Ignore errors and continue checking
      }
    }
  } else {
    // On Unix-like systems, we can try to use the 'which' command
    try {
      const pythonPath = execSync('which python3 || which python').toString().trim();
      if (pythonPath) {
        logger.info(`Found Python at: ${pythonPath}`);
        return pythonPath;
      }
    } catch (e) {
      // Ignore errors and fall back to default
    }
  }
  
  // Try to find Python in PATH
  try {
    const pythonPath = execSync('where python', { encoding: 'utf8' }).trim().split('\n')[0];
    logger.info(`Found Python in PATH: ${pythonPath}`);
    return pythonPath;
  } catch (e) {
    // Ignore errors and continue
  }
  
  // Try Python launcher
  try {
    const pyPath = execSync('where py', { encoding: 'utf8' }).trim().split('\n')[0];
    logger.info(`Found Python launcher: ${pyPath}`);
    return pyPath;
  } catch (e) {
    // Ignore errors and continue
  }
  
  // Ask user for Python path
  logger.warn('Could not automatically detect Python path');
  const userPath = await question('Please enter the full path to your Python executable: ');
  
  if (userPath && fs.existsSync(userPath)) {
    logger.info(`Using user-provided Python path: ${userPath}`);
    return userPath;
  }
  
  logger.error('No valid Python path found. Please install Python and try again.');
  return 'python'; // Default fallback
}

// Update .env file with correct configuration
async function updateEnvFile(pythonPath) {
  logger.info('Updating .env file...');
  
  const envPath = path.join(process.cwd(), '.env');
  let envContent = '';
  
  // Create default .env content
  const defaultEnv = `# Python Configuration
PYTHON_PATH=${pythonPath}
PYTHON_EXECUTABLE=${pythonPath}
PYTHON_BRIDGE_MAX_RETRIES=3
PYTHON_EXECUTION_TIMEOUT=60000

# Server Configuration
PORT=5000
HOST=localhost
NODE_ENV=development
LOG_LEVEL=info

# Database Configuration
MONGODB_URI=mongodb://localhost:27017/sports-analytics
MONGODB_DB_NAME=sports-analytics
DB_MAX_POOL_SIZE=50
DB_MIN_POOL_SIZE=10
CONNECT_TIMEOUT_MS=30000
SOCKET_TIMEOUT_MS=45000

# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_CONNECT_TIMEOUT=10000
REDIS_ENABLE_OFFLINE_QUEUE=true
REDIS_MAX_RETRIES=3
REDIS_RETRY_STRATEGY_MAX_DELAY=2000

# Cache Configuration
CACHE_TTL=1800
CACHE_MAX_ITEMS=500
CACHE_CHECK_PERIOD=300

# WebSocket Configuration
WS_PORT=5150
WS_PATH=/ws
WS_HEARTBEAT_INTERVAL=60000
WS_CLIENT_TIMEOUT=35000
WS_MAX_PAYLOAD=52428800

# Performance Configuration
MEMORY_USAGE_THRESHOLD=0.80
CPU_LOAD_THRESHOLD=0.80
NETWORK_TRAFFIC_THRESHOLD=52428800
HEALTH_CHECK_INTERVAL=300000
METRICS_INTERVAL=300000
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX=50
MAX_CONNECTIONS_PER_IP=50
COMPRESSION_LEVEL=6
COMPRESSION_THRESHOLD=1024

# Security Configuration
JWT_SECRET=your-secret-key-here
JWT_EXPIRATION=86400
CORS_ORIGIN=http://localhost:5000`;
  
  // Check if .env file exists
  if (fs.existsSync(envPath)) {
    logger.info('.env file exists, updating...');
    envContent = fs.readFileSync(envPath, 'utf8');
    
    // Update Python path
    if (envContent.includes('PYTHON_PATH=')) {
      envContent = envContent.replace(/PYTHON_PATH=.*(\r?\n|$)/g, `PYTHON_PATH=${pythonPath}$1`);
    } else {
      envContent += `\nPYTHON_PATH=${pythonPath}\n`;
    }
    
    // Update Python executable
    if (envContent.includes('PYTHON_EXECUTABLE=')) {
      envContent = envContent.replace(/PYTHON_EXECUTABLE=.*(\r?\n|$)/g, `PYTHON_EXECUTABLE=${pythonPath}$1`);
    } else {
      envContent += `PYTHON_EXECUTABLE=${pythonPath}\n`;
    }
    
    // Ensure other critical variables are present
    const criticalVars = [
      'MONGODB_URI', 'REDIS_HOST', 'REDIS_PORT', 'PORT', 'WS_PORT'
    ];
    
    criticalVars.forEach(varName => {
      if (!envContent.includes(`${varName}=`)) {
        const defaultLine = defaultEnv.split('\n').find(line => line.startsWith(`${varName}=`));
        if (defaultLine) {
          envContent += `\n${defaultLine}\n`;
        }
      }
    });
  } else {
    logger.info('.env file does not exist, creating...');
    envContent = defaultEnv;
  }
  
  // Write updated content to .env file
  fs.writeFileSync(envPath, envContent);
  logger.info('.env file updated successfully');
  
  return envContent;
}

// Install required Python packages
async function installPythonPackages(pythonPath) {
  logger.info('Installing required Python packages...');
  
  const requiredPackages = [
    'numpy',
    'pandas',
    'scikit-learn==1.0.2',
    'matplotlib==3.5.2',
    'xgboost==1.6.1',
    'lightgbm==3.3.2',
    'hyperopt==0.2.7',
    'pymongo==4.1.1',
    'python-dotenv==0.20.0',
    'redis==4.3.4',
    'prometheus-client==0.14.1',
    'psutil==5.9.1',
    'cachetools'
  ];
  
  // Check which packages are already installed
  const installedPackages = [];
  const missingPackages = [];
  
  for (const pkg of requiredPackages) {
    const pkgName = pkg.split('==')[0];
    try {
      execSync(`"${pythonPath}" -c "import ${pkgName}; print(f'${pkgName} is installed')"`, { encoding: 'utf8' });
      installedPackages.push(pkg);
    } catch (e) {
      missingPackages.push(pkg);
    }
  }
  
  logger.info(`Already installed: ${installedPackages.join(', ')}`);
  logger.info(`Missing packages: ${missingPackages.join(', ')}`);
  
  if (missingPackages.length === 0) {
    logger.info('All required Python packages are already installed');
    return true;
  }
  
  // Install missing packages
  try {
    logger.info('Installing pip and setuptools...');
    execSync(`"${pythonPath}" -m pip install --upgrade pip setuptools wheel`, { stdio: 'inherit' });
    
    for (const pkg of missingPackages) {
      logger.info(`Installing ${pkg}...`);
      execSync(`"${pythonPath}" -m pip install ${pkg}`, { stdio: 'inherit' });
    }
    
    logger.info('All Python packages installed successfully');
    return true;
  } catch (error) {
    logger.error(`Error installing Python packages: ${error.message}`);
    return false;
  }
}

// Create logs directory if it doesn't exist
function ensureLogsDirectory() {
  const logsDir = path.join(process.cwd(), 'logs');
  if (!fs.existsSync(logsDir)) {
    logger.info(`Creating logs directory at: ${logsDir}`);
    fs.mkdirSync(logsDir, { recursive: true });
  }
}

// Fix file permissions
function fixFilePermissions() {
  logger.info('Fixing file permissions...');
  
  const scriptsDir = path.join(process.cwd(), 'scripts');
  if (fs.existsSync(scriptsDir)) {
    const files = fs.readdirSync(scriptsDir);
    const pythonScripts = files.filter(file => file.endsWith('.py'));
    
    pythonScripts.forEach(script => {
      const scriptPath = path.join(scriptsDir, script);
      try {
        // Make Python scripts executable
        fs.chmodSync(scriptPath, 0o755);
        logger.info(`Made ${script} executable`);
      } catch (error) {
        logger.error(`Error setting permissions for ${script}: ${error.message}`);
      }
    });
  }
}

// Check and fix MongoDB
async function checkAndFixMongoDB() {
  logger.info('Checking MongoDB...');
  
  try {
    // Check if MongoDB is running
    execSync('mongod --version', { stdio: 'pipe' });
    logger.info('MongoDB is installed');
    
    // Ask user if they want to start MongoDB
    const startMongo = await question('Do you want to ensure MongoDB is running? (y/n): ');
    if (startMongo.toLowerCase() === 'y') {
      try {
        logger.info('Attempting to start MongoDB...');
        execSync('net start MongoDB', { stdio: 'pipe' });
        logger.info('MongoDB service started');
      } catch (error) {
        logger.warn(`Could not start MongoDB service: ${error.message}`);
        logger.info('You may need to start MongoDB manually');
      }
    }
  } catch (error) {
    logger.warn(`MongoDB may not be installed: ${error.message}`);
    logger.info('Please install MongoDB to use this application');
  }
}

// Check and fix Redis
async function checkAndFixRedis() {
  logger.info('Checking Redis...');
  
  try {
    // Check if Redis is installed
    execSync('redis-cli --version', { stdio: 'pipe' });
    logger.info('Redis CLI is installed');
    
    // Ask user if they want to start Redis
    const startRedis = await question('Do you want to ensure Redis is running? (y/n): ');
    if (startRedis.toLowerCase() === 'y') {
      try {
        logger.info('Attempting to start Redis...');
        // This is Windows-specific, adjust for other platforms
        execSync('redis-server --service-start', { stdio: 'pipe' });
        logger.info('Redis service started');
      } catch (error) {
        logger.warn(`Could not start Redis service: ${error.message}`);
        logger.info('You may need to start Redis manually');
      }
    }
  } catch (error) {
    logger.warn(`Redis may not be installed: ${error.message}`);
    logger.info('The application can run without Redis using in-memory fallbacks');
    
    // Update .env to use in-memory cache
    const envPath = path.join(process.cwd(), '.env');
    if (fs.existsSync(envPath)) {
      let envContent = fs.readFileSync(envPath, 'utf8');
      if (!envContent.includes('USE_IN_MEMORY_CACHE=')) {
        envContent += '\nUSE_IN_MEMORY_CACHE=true\n';
        fs.writeFileSync(envPath, envContent);
        logger.info('Updated .env to use in-memory cache');
      }
    }
  }
}

// Fix Node.js dependencies
async function fixNodeDependencies() {
  logger.info('Checking Node.js dependencies...');
  
  // Check if node_modules exists
  const nodeModulesPath = path.join(process.cwd(), 'node_modules');
  if (!fs.existsSync(nodeModulesPath)) {
    logger.info('node_modules directory not found, running npm install...');
    
    try {
      execSync('npm install', { stdio: 'inherit' });
      logger.info('npm install completed successfully');
    } catch (error) {
      logger.error(`Error running npm install: ${error.message}`);
    }
  } else {
    logger.info('node_modules directory exists');
    
    // Check for critical dependencies
    const criticalDeps = [
      'python-shell',
      'mongodb',
      'ioredis',
      'redis',
      'ws',
      'express'
    ];
    
    const missingDeps = [];
    
    for (const dep of criticalDeps) {
      const depPath = path.join(nodeModulesPath, dep);
      if (!fs.existsSync(depPath)) {
        missingDeps.push(dep);
      }
    }
    
    if (missingDeps.length > 0) {
      logger.info(`Missing dependencies: ${missingDeps.join(', ')}`);
      logger.info('Installing missing dependencies...');
      
      try {
        execSync(`npm install ${missingDeps.join(' ')}`, { stdio: 'inherit' });
        logger.info('Dependencies installed successfully');
      } catch (error) {
        logger.error(`Error installing dependencies: ${error.message}`);
      }
    } else {
      logger.info('All critical dependencies are installed');
    }
  }
}

// Main fix function
async function fixEnvironment() {
  logger.info('Starting environment fix...');
  logger.info('Timestamp: ' + new Date().toISOString());
  
  try {
    // Step 1: Ensure logs directory exists
    ensureLogsDirectory();
    
    // Step 2: Detect Python path
    const pythonPath = await detectPythonPath();
    
    // Step 3: Update .env file
    await updateEnvFile(pythonPath);
    
    // Step 4: Install required Python packages
    await installPythonPackages(pythonPath);
    
    // Step 5: Fix file permissions
    fixFilePermissions();
    
    // Step 6: Check and fix MongoDB
    await checkAndFixMongoDB();
    
    // Step 7: Check and fix Redis
    await checkAndFixRedis();
    
    // Step 8: Fix Node.js dependencies
    await fixNodeDependencies();
    
    logger.info('Environment fix completed successfully');
    logger.info('You can now try running the application with: npm start');
  } catch (error) {
    logger.error(`Environment fix failed: ${error.message}`);
    logger.error(error.stack);
  } finally {
    // Close readline interface
    rl.close();
  }
}

// Run fix if this script is executed directly
if (require.main === module) {
  fixEnvironment()
    .then(() => {
      logger.info('Fix completed');
    })
    .catch(error => {
      logger.error(`Fix failed: ${error.message}`);
      process.exit(1);
    });
}

module.exports = {
  fixEnvironment,
  detectPythonPath,
  updateEnvFile,
  installPythonPackages,
  ensureLogsDirectory,
  fixFilePermissions,
  checkAndFixMongoDB,
  checkAndFixRedis,
  fixNodeDependencies
};// scripts/fix-environment.js
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');
const winston = require('winston');
const readline = require('readline');

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
    new winston.transports.File({ filename: 'environment-fix.log' })
  ]
});

// Create readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Promisify readline question
function question(query) {
  return new Promise(resolve => {
    rl.question(query, answer => {
      resolve(answer);
    });
  });
}

// Detect Python executable path
async function detectPythonPath() {
  logger.info('Detecting Python executable path...');
  
  // Check environment variables first
  const envPath = process.env.PYTHON_PATH || process.env.PYTHON_EXECUTABLE;
  if (envPath && fs.existsSync(envPath)) {
    logger.info(`Found Python path in environment variables: ${envPath}`);
    return envPath;
  }
  
  // Check common paths based on platform
  const isWindows = process.platform === 'win32';
  
  if (isWindows) {
    // Common Windows Python paths
    const commonWindowsPaths = [
      // Python 3 paths
      'C:\\Python39\\python.exe',
      'C:\\Python310\\python.exe',
      'C:\\Python311\\python.exe',
      'C:\\Python312\\python.exe',
      // Python launcher
      'C:\\Windows\\py.exe',
      // Anaconda/Miniconda paths
      'C:\\ProgramData\\Anaconda3\\python.exe',
      'C:\\ProgramData\\miniconda3\\python.exe',
      // User profile paths
      `${process.env.USERPROFILE}\\AppData\\Local\\Programs\\Python\\Python39\\python.exe`,
      `${process.env.USERPROFILE}\\AppData\\Local\\Programs\\Python\\Python310\\python.exe`,
      `${process.env.USERPROFILE}\\AppData\\Local\\Programs\\Python\\Python311\\python.exe`,
      `${process.env.USERPROFILE}\\AppData\\Local\\Programs\\Python\\Python312\\python.exe`,
    ];
    
    for (const pythonPath of commonWindowsPaths) {
      try {
        if (fs.existsSync(pythonPath)) {
          logger.info(`Found Python at: ${pythonPath}`);
          return pythonPath;
        }
      } catch (e) {
        // Ignore errors and continue checking
      }
    }
  } else {
    // On Unix-like systems, we can try to use the 'which' command
    try {
      const pythonPath = execSync('which python3 || which python').toString().trim();
      if (pythonPath) {
        logger.info(`Found Python at: ${pythonPath}`);
        return pythonPath;
      }
    } catch (e) {
      // Ignore errors and fall back to default
    }
  }
  
  // Try to find Python in PATH
  try {
    const pythonPath = execSync('where python', { encoding: 'utf8' }).trim().split('\n')[0];
    logger.info(`Found Python in PATH: ${pythonPath}`);
    return pythonPath;
  } catch (e) {
    // Ignore errors and continue
  }
  
  // Try Python launcher
  try {
    const pyPath = execSync('where py', { encoding: 'utf8' }).trim().split('\n')[0];
    logger.info(`Found Python launcher: ${pyPath}`);
    return pyPath;
  } catch (e) {
    // Ignore errors and continue
  }
  
  // Ask user for Python path
  logger.warn('Could not automatically detect Python path');
  const userPath = await question('Please enter the full path to your Python executable: ');
  
  if (userPath && fs.existsSync(userPath)) {
    logger.info(`Using user-provided Python path: ${userPath}`);
    return userPath;
  }
  
  logger.error('No valid Python path found. Please install Python and try again.');
  return 'python'; // Default fallback
}

// Update .env file with correct configuration
async function updateEnvFile(pythonPath) {
  logger.info('Updating .env file...');
  
  const envPath = path.join(process.cwd(), '.env');
  let envContent = '';
  
  // Create default .env content
  const defaultEnv = `# Python Configuration
PYTHON_PATH=${pythonPath}
PYTHON_EXECUTABLE=${pythonPath}
PYTHON_BRIDGE_MAX_RETRIES=3
PYTHON_EXECUTION_TIMEOUT=60000

# Server Configuration
PORT=5000
HOST=localhost
NODE_ENV=development
LOG_LEVEL=info

# Database Configuration
MONGODB_URI=mongodb://localhost:27017/sports-analytics
MONGODB_DB_NAME=sports-analytics
DB_MAX_POOL_SIZE=50
DB_MIN_POOL_SIZE=10
CONNECT_TIMEOUT_MS=30000
SOCKET_TIMEOUT_MS=45000

# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_CONNECT_TIMEOUT=10000
REDIS_ENABLE_OFFLINE_QUEUE=true
REDIS_MAX_RETRIES=3
REDIS_RETRY_STRATEGY_MAX_DELAY=2000

# Cache Configuration
CACHE_TTL=1800
CACHE_MAX_ITEMS=500
CACHE_CHECK_PERIOD=300

# WebSocket Configuration
WS_PORT=5150
WS_PATH=/ws
WS_HEARTBEAT_INTERVAL=60000
WS_CLIENT_TIMEOUT=35000
WS_MAX_PAYLOAD=52428800

# Performance Configuration
MEMORY_USAGE_THRESHOLD=0.80
CPU_LOAD_THRESHOLD=0.80
NETWORK_TRAFFIC_THRESHOLD=52428800
HEALTH_CHECK_INTERVAL=300000
METRICS_INTERVAL=300000
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX=50
MAX_CONNECTIONS_PER_IP=50
COMPRESSION_LEVEL=6
COMPRESSION_THRESHOLD=1024

# Security Configuration
JWT_SECRET=your-secret-key-here
JWT_EXPIRATION=86400
CORS_ORIGIN=http://localhost:5000`;
  
  // Check if .env file exists
  if (fs.existsSync(envPath)) {
    logger.info('.env file exists, updating...');
    envContent = fs.readFileSync(envPath, 'utf8');
    
    // Update Python path
    if (envContent.includes('PYTHON_PATH=')) {
      envContent = envContent.replace(/PYTHON_PATH=.*(\r?\n|$)/g, `PYTHON_PATH=${pythonPath}$1`);
    } else {
      envContent += `\nPYTHON_PATH=${pythonPath}\n`;
    }
    
    // Update Python executable
    if (envContent.includes('PYTHON_EXECUTABLE=')) {
      envContent = envContent.replace(/PYTHON_EXECUTABLE=.*(\r?\n|$)/g, `PYTHON_EXECUTABLE=${pythonPath}$1`);
    } else {
      envContent += `PYTHON_EXECUTABLE=${pythonPath}\n`;
    }
    
    // Ensure other critical variables are present
    const criticalVars = [
      'MONGODB_URI', 'REDIS_HOST', 'REDIS_PORT', 'PORT', 'WS_PORT'
    ];
    
    criticalVars.forEach(varName => {
      if (!envContent.includes(`${varName}=`)) {
        const defaultLine = defaultEnv.split('\n').find(line => line.startsWith(`${varName}=`));
        if (defaultLine) {
          envContent += `\n${defaultLine}\n`;
        }
      }
    });
  } else {
    logger.info('.env file does not exist, creating...');
    envContent = defaultEnv;
  }
  
  // Write updated content to .env file
  fs.writeFileSync(envPath, envContent);
  logger.info('.env file updated successfully');
  
  return envContent;
}

// Install required Python packages
async function installPythonPackages(pythonPath) {
  logger.info('Installing required Python packages...');
  
  const requiredPackages = [
    'numpy',
    'pandas',
    'scikit-learn==1.0.2',
    'matplotlib==3.5.2',
    'xgboost==1.6.1',
    'lightgbm==3.3.2',
    'hyperopt==0.2.7',
    'pymongo==4.1.1',
    'python-dotenv==0.20.0',
    'redis==4.3.4',
    'prometheus-client==0.14.1',
    'psutil==5.9.1',
    'cachetools'
  ];
  
  // Check which packages are already installed
  const installedPackages = [];
  const missingPackages = [];
  
  for (const pkg of requiredPackages) {
    const pkgName = pkg.split('==')[0];
    try {
      execSync(`"${pythonPath}" -c "import ${pkgName}; print(f'${pkgName} is installed')"`, { encoding: 'utf8' });
      installedPackages.push(pkg);
    } catch (e) {
      missingPackages.push(pkg);
    }
  }
  
  logger.info(`Already installed: ${installedPackages.join(', ')}`);
  logger.info(`Missing packages: ${missingPackages.join(', ')}`);
  
  if (missingPackages.length === 0) {
    logger.info('All required Python packages are already installed');
    return true;
  }
  
  // Install missing packages
  try {
    logger.info('Installing pip and setuptools...');
    execSync(`"${pythonPath}" -m pip install --upgrade pip setuptools wheel`, { stdio: 'inherit' });
    
    for (const pkg of missingPackages) {
      logger.info(`Installing ${pkg}...`);
      execSync(`"${pythonPath}" -m pip install ${pkg}`, { stdio: 'inherit' });
    }
    
    logger.info('All Python packages installed successfully');
    return true;
  } catch (error) {
    logger.error(`Error installing Python packages: ${error.message}`);
    return false;
  }
}

// Create logs directory if it doesn't exist
function ensureLogsDirectory() {
  const logsDir = path.join(process.cwd(), 'logs');
  if (!fs.existsSync(logsDir)) {
    logger.info(`Creating logs directory at: ${logsDir}`);
    fs.mkdirSync(logsDir, { recursive: true });
  }
}

// Fix file permissions
function fixFilePermissions() {
  logger.info('Fixing file permissions...');
  
  const scriptsDir = path.join(process.cwd(), 'scripts');
  if (fs.existsSync(scriptsDir)) {
    const files = fs.readdirSync(scriptsDir);
    const pythonScripts = files.filter(file => file.endsWith('.py'));
    
    pythonScripts.forEach(script => {
      const scriptPath = path.join(scriptsDir, script);
      try {
        // Make Python scripts executable
        fs.chmodSync(scriptPath, 0o755);
        logger.info(`Made ${script} executable`);
      } catch (error) {
        logger.error(`Error setting permissions for ${script}: ${error.message}`);
      }
    });
  }
}

// Check and fix MongoDB
async function checkAndFixMongoDB() {
  logger.info('Checking MongoDB...');
  
  try {
    // Check if MongoDB is running
    execSync('mongod --version', { stdio: 'pipe' });
    logger.info('MongoDB is installed');
    
    // Ask user if they want to start MongoDB
    const startMongo = await question('Do you want to ensure MongoDB is running? (y/n): ');
    if (startMongo.toLowerCase() === 'y') {
      try {
        logger.info('Attempting to start MongoDB...');
        execSync('net start MongoDB', { stdio: 'pipe' });
        logger.info('MongoDB service started');
      } catch (error) {
        logger.warn(`Could not start MongoDB service: ${error.message}`);
        logger.info('You may need to start MongoDB manually');
      }
    }
  } catch (error) {
    logger.warn(`MongoDB may not be installed: ${error.message}`);
    logger.info('Please install MongoDB to use this application');
  }
}

// Check and fix Redis
async function checkAndFixRedis() {
  logger.info('Checking Redis...');
  
  try {
    // Check if Redis is installed
    execSync('redis-cli --version', { stdio: 'pipe' });
    logger.info('Redis CLI is installed');
    
    // Ask user if they want to start Redis
    const startRedis = await question('Do you want to ensure Redis is running? (y/n): ');
    if (startRedis.toLowerCase() === 'y') {
      try {
        logger.info('Attempting to start Redis...');
        // This is Windows-specific, adjust for other platforms
        execSync('redis-server --service-start', { stdio: 'pipe' });
        logger.info('Redis service started');
      } catch (error) {
        logger.warn(`Could not start Redis service: ${error.message}`);
        logger.info('You may need to start Redis manually');
      }
    }
  } catch (error) {
    logger.warn(`Redis may not be installed: ${error.message}`);
    logger.info('The application can run without Redis using in-memory fallbacks');
    
    // Update .env to use in-memory cache
    const envPath = path.join(process.cwd(), '.env');
    if (fs.existsSync(envPath)) {
      let envContent = fs.readFileSync(envPath, 'utf8');
      if (!envContent.includes('USE_IN_MEMORY_CACHE=')) {
        envContent += '\nUSE_IN_MEMORY_CACHE=true\n';
        fs.writeFileSync(envPath, envContent);
        logger.info('Updated .env to use in-memory cache');
      }
    }
  }
}

// Fix Node.js dependencies
async function fixNodeDependencies() {
  logger.info('Checking Node.js dependencies...');
  
  // Check if node_modules exists
  const nodeModulesPath = path.join(process.cwd(), 'node_modules');
  if (!fs.existsSync(nodeModulesPath)) {
    logger.info('node_modules directory not found, running npm install...');
    
    try {
      execSync('npm install', { stdio: 'inherit' });
      logger.info('npm install completed successfully');
    } catch (error) {
      logger.error(`Error running npm install: ${error.message}`);
    }
  } else {
    logger.info('node_modules directory exists');
    
    // Check for critical dependencies
    const criticalDeps = [
      'python-shell',
      'mongodb',
      'ioredis',
      'redis',
      'ws',
      'express'
    ];
    
    const missingDeps = [];
    
    for (const dep of criticalDeps) {
      const depPath = path.join(nodeModulesPath, dep);
      if (!fs.existsSync(depPath)) {
        missingDeps.push(dep);
      }
    }
    
    if (missingDeps.length > 0) {
      logger.info(`Missing dependencies: ${missingDeps.join(', ')}`);
      logger.info('Installing missing dependencies...');
      
      try {
        execSync(`npm install ${missingDeps.join(' ')}`, { stdio: 'inherit' });
        logger.info('Dependencies installed successfully');
      } catch (error) {
        logger.error(`Error installing dependencies: ${error.message}`);
      }
    } else {
      logger.info('All critical dependencies are installed');
    }
  }
}

// Main fix function
async function fixEnvironment() {
  logger.info('Starting environment fix...');
  logger.info('Timestamp: ' + new Date().toISOString());
  
  try {
    // Step 1: Ensure logs directory exists
    ensureLogsDirectory();
    
    // Step 2: Detect Python path
    const pythonPath = await detectPythonPath();
    
    // Step 3: Update .env file
    await updateEnvFile(pythonPath);
    
    // Step 4: Install required Python packages
    await installPythonPackages(pythonPath);
    
    // Step 5: Fix file permissions
    fixFilePermissions();
    
    // Step 6: Check and fix MongoDB
    await checkAndFixMongoDB();
    
    // Step 7: Check and fix Redis
    await checkAndFixRedis();
    
    // Step 8: Fix Node.js dependencies
    await fixNodeDependencies();
    
    logger.info('Environment fix completed successfully');
    logger.info('You can now try running the application with: npm start');
  } catch (error) {
    logger.error(`Environment fix failed: ${error.message}`);
    logger.error(error.stack);
  } finally {
    // Close readline interface
    rl.close();
  }
}

// Run fix if this script is executed directly
if (require.main === module) {
  fixEnvironment()
    .then(() => {
      logger.info('Fix completed');
    })
    .catch(error => {
      logger.error(`Fix failed: ${error.message}`);
      process.exit(1);
    });
}

module.exports = {
  fixEnvironment,
  detectPythonPath,
  updateEnvFile,
  installPythonPackages,
  ensureLogsDirectory,
  fixFilePermissions,
  checkAndFixMongoDB,
  checkAndFixRedis,
  fixNodeDependencies
};// scripts/fix-environment.js
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');
const winston = require('winston');
const readline = require('readline');

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
    new winston.transports.File({ filename: 'environment-fix.log' })
  ]
});

// Create readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Promisify readline question
function question(query) {
  return new Promise(resolve => {
    rl.question(query, answer => {
      resolve(answer);
    });
  });
}

// Detect Python executable path
async function detectPythonPath() {
  logger.info('Detecting Python executable path...');
  
  // Check environment variables first
  const envPath = process.env.PYTHON_PATH || process.env.PYTHON_EXECUTABLE;
  if (envPath && fs.existsSync(envPath)) {
    logger.info(`Found Python path in environment variables: ${envPath}`);
    return envPath;
  }
  
  // Check common paths based on platform
  const isWindows = process.platform === 'win32';
  
  if (isWindows) {
    // Common Windows Python paths
    const commonWindowsPaths = [
      // Python 3 paths
      'C:\\Python39\\python.exe',
      'C:\\Python310\\python.exe',
      'C:\\Python311\\python.exe',
      'C:\\Python312\\python.exe',
      // Python launcher
      'C:\\Windows\\py.exe',
      // Anaconda/Miniconda paths
      'C:\\ProgramData\\Anaconda3\\python.exe',
      'C:\\ProgramData\\miniconda3\\python.exe',
      // User profile paths
      `${process.env.USERPROFILE}\\AppData\\Local\\Programs\\Python\\Python39\\python.exe`,
      `${process.env.USERPROFILE}\\AppData\\Local\\Programs\\Python\\Python310\\python.exe`,
      `${process.env.USERPROFILE}\\AppData\\Local\\Programs\\Python\\Python311\\python.exe`,
      `${process.env.USERPROFILE}\\AppData\\Local\\Programs\\Python\\Python312\\python.exe`,
    ];
    
    for (const pythonPath of commonWindowsPaths) {
      try {
        if (fs.existsSync(pythonPath)) {
          logger.info(`Found Python at: ${pythonPath}`);
          return pythonPath;
        }
      } catch (e) {
        // Ignore errors and continue checking
      }
    }
  } else {
    // On Unix-like systems, we can try to use the 'which' command
    try {
      const pythonPath = execSync('which python3 || which python').toString().trim();
      if (pythonPath) {
        logger.info(`Found Python at: ${pythonPath}`);
        return pythonPath;
      }
    } catch (e) {
      // Ignore errors and fall back to default
    }
  }
  
  // Try to find Python in PATH
  try {
    const pythonPath = execSync('where python', { encoding: 'utf8' }).trim().split('\n')[0];
    logger.info(`Found Python in PATH: ${pythonPath}`);
    return pythonPath;
  } catch (e) {
    // Ignore errors and continue
  }
  
  // Try Python launcher
  try {
    const pyPath = execSync('where py', { encoding: 'utf8' }).trim().split('\n')[0];
    logger.info(`Found Python launcher: ${pyPath}`);
    return pyPath;
  } catch (e) {
    // Ignore errors and continue
  }
  
  // Ask user for Python path
  logger.warn('Could not automatically detect Python path');
  const userPath = await question('Please enter the full path to your Python executable: ');
  
  if (userPath && fs.existsSync(userPath)) {
    logger.info(`Using user-provided Python path: ${userPath}`);
    return userPath;
  }
  
  logger.error('No valid Python path found. Please install Python and try again.');
  return 'python'; // Default fallback
}

// Update .env file with correct configuration
async function updateEnvFile(pythonPath) {
  logger.info('Updating .env file...');
  
  const envPath = path.join(process.cwd(), '.env');
  let envContent = '';
  
  // Create default .env content
  const defaultEnv = `# Python Configuration
PYTHON_PATH=${pythonPath}
PYTHON_EXECUTABLE=${pythonPath}
PYTHON_BRIDGE_MAX_RETRIES=3
PYTHON_EXECUTION_TIMEOUT=60000

# Server Configuration
PORT=5000
HOST=localhost
NODE_ENV=development
LOG_LEVEL=info

# Database Configuration
MONGODB_URI=mongodb://localhost:27017/sports-analytics
MONGODB_DB_NAME=sports-analytics
DB_MAX_POOL_SIZE=50
DB_MIN_POOL_SIZE=10
CONNECT_TIMEOUT_MS=30000
SOCKET_TIMEOUT_MS=45000

# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_CONNECT_TIMEOUT=10000
REDIS_ENABLE_OFFLINE_QUEUE=true
REDIS_MAX_RETRIES=3
REDIS_RETRY_STRATEGY_MAX_DELAY=2000

# Cache Configuration
CACHE_TTL=1800
CACHE_MAX_ITEMS=500
CACHE_CHECK_PERIOD=300

# WebSocket Configuration
WS_PORT=5150
WS_PATH=/ws
WS_HEARTBEAT_INTERVAL=60000
WS_CLIENT_TIMEOUT=35000
WS_MAX_PAYLOAD=52428800

# Performance Configuration
MEMORY_USAGE_THRESHOLD=0.80
CPU_LOAD_THRESHOLD=0.80
NETWORK_TRAFFIC_THRESHOLD=52428800
HEALTH_CHECK_INTERVAL=300000
METRICS_INTERVAL=300000
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX=50
MAX_CONNECTIONS_PER_IP=50
COMPRESSION_LEVEL=6
COMPRESSION_THRESHOLD=1024

# Security Configuration
JWT_SECRET=your-secret-key-here
JWT_EXPIRATION=86400
CORS_ORIGIN=http://localhost:5000`;
  
  // Check if .env file exists
  if (fs.existsSync(envPath)) {
    logger.info('.env file exists, updating...');
    envContent = fs.readFileSync(envPath, 'utf8');
    
    // Update Python path
    if (envContent.includes('PYTHON_PATH=')) {
      envContent = envContent.replace(/PYTHON_PATH=.*(\r?\n|$)/g, `PYTHON_PATH=${pythonPath}$1`);
    } else {
      envContent += `\nPYTHON_PATH=${pythonPath}\n`;
    }
    
    // Update Python executable
    if (envContent.includes('PYTHON_EXECUTABLE=')) {
      envContent = envContent.replace(/PYTHON_EXECUTABLE=.*(\r?\n|$)/g, `PYTHON_EXECUTABLE=${pythonPath}$1`);
    } else {
      envContent += `PYTHON_EXECUTABLE=${pythonPath}\n`;
    }
    
    // Ensure other critical variables are present
    const criticalVars = [
      'MONGODB_URI', 'REDIS_HOST', 'REDIS_PORT', 'PORT', 'WS_PORT'
    ];
    
    criticalVars.forEach(varName => {
      if (!envContent.includes(`${varName}=`)) {
        const defaultLine = defaultEnv.split('\n').find(line => line.startsWith(`${varName}=`));
        if (defaultLine) {
          envContent += `\n${defaultLine}\n`;
        }
      }
    });
  } else {
    logger.info('.env file does not exist, creating...');
    envContent = defaultEnv;
  }
  
  // Write updated content to .env file
  fs.writeFileSync(envPath, envContent);
  logger.info('.env file updated successfully');
  
  return envContent;
}

// Install required Python packages
async function installPythonPackages(pythonPath) {
  logger.info('Installing required Python packages...');
  
  const requiredPackages = [
    'numpy',
    'pandas',
    'scikit-learn==1.0.2',
    'matplotlib==3.5.2',
    'xgboost==1.6.1',
    'lightgbm==3.3.2',
    'hyperopt==0.2.7',
    'pymongo==4.1.1',
    'python-dotenv==0.20.0',
    'redis==4.3.4',
    'prometheus-client==0.14.1',
    'psutil==5.9.1',
    'cachetools'
  ];
  
  // Check which packages are already installed
  const installedPackages = [];
  const missingPackages = [];
  
  for (const pkg of requiredPackages) {
    const pkgName = pkg.split('==')[0];
    try {
      execSync(`"${pythonPath}" -c "import ${pkgName}; print(f'${pkgName} is installed')"`, { encoding: 'utf8' });
      installedPackages.push(pkg);
    } catch (e) {
      missingPackages.push(pkg);
    }
  }
  
  logger.info(`Already installed: ${installedPackages.join(', ')}`);
  logger.info(`Missing packages: ${missingPackages.join(', ')}`);
  
  if (missingPackages.length === 0) {
    logger.info('All required Python packages are already installed');
    return true;
  }
  
  // Install missing packages
  try {
    logger.info('Installing pip and setuptools...');
    execSync(`"${pythonPath}" -m pip install --upgrade pip setuptools wheel`, { stdio: 'inherit' });
    
    for (const pkg of missingPackages) {
      logger.info(`Installing ${pkg}...`);
      execSync(`"${pythonPath}" -m pip install ${pkg}`, { stdio: 'inherit' });
    }
    
    logger.info('All Python packages installed successfully');
    return true;
  } catch (error) {
    logger.error(`Error installing Python packages: ${error.message}`);
    return false;
  }
}

// Create logs directory if it doesn't exist
function ensureLogsDirectory() {
  const logsDir = path.join(process.cwd(), 'logs');
  if (!fs.existsSync(logsDir)) {
    logger.info(`Creating logs directory at: ${logsDir}`);
    fs.mkdirSync(logsDir, { recursive: true });
  }
}

// Fix file permissions
function fixFilePermissions() {
  logger.info('Fixing file permissions...');
  
  const scriptsDir = path.join(process.cwd(), 'scripts');
  if (fs.existsSync(scriptsDir)) {
    const files = fs.readdirSync(scriptsDir);
    const pythonScripts = files.filter(file => file.endsWith('.py'));
    
    pythonScripts.forEach(script => {
      const scriptPath = path.join(scriptsDir, script);
      try {
        // Make Python scripts executable
        fs.chmodSync(scriptPath, 0o755);
        logger.info(`Made ${script} executable`);
      } catch (error) {
        logger.error(`Error setting permissions for ${script}: ${error.message}`);
      }
    });
  }
}

// Check and fix MongoDB
async function checkAndFixMongoDB() {
  logger.info('Checking MongoDB...');
  
  try {
    // Check if MongoDB is running
    execSync('mongod --version', { stdio: 'pipe' });
    logger.info('MongoDB is installed');
    
    // Ask user if they want to start MongoDB
    const startMongo = await question('Do you want to ensure MongoDB is running? (y/n): ');
    if (startMongo.toLowerCase() === 'y') {
      try {
        logger.info('Attempting to start MongoDB...');
        execSync('net start MongoDB', { stdio: 'pipe' });
        logger.info('MongoDB service started');
      } catch (error) {
        logger.warn(`Could not start MongoDB service: ${error.message}`);
        logger.info('You may need to start MongoDB manually');
      }
    }
  } catch (error) {
    logger.warn(`MongoDB may not be installed: ${error.message}`);
    logger.info('Please install MongoDB to use this application');
  }
}

// Check and fix Redis
async function checkAndFixRedis() {
  logger.info('Checking Redis...');
  
  try {
    // Check if Redis is installed
    execSync('redis-cli --version', { stdio: 'pipe' });
    logger.info('Redis CLI is installed');
    
    // Ask user if they want to start Redis
    const startRedis = await question('Do you want to ensure Redis is running? (y/n): ');
    if (startRedis.toLowerCase() === 'y') {
      try {
        logger.info('Attempting to start Redis...');
        // This is Windows-specific, adjust for other platforms
        execSync('redis-server --service-start', { stdio: 'pipe' });
        logger.info('Redis service started');
      } catch (error) {
        logger.warn(`Could not start Redis service: ${error.message}`);
        logger.info('You may need to start Redis manually');
      }
    }
  } catch (error) {
    logger.warn(`Redis may not be installed: ${error.message}`);
    logger.info('The application can run without Redis using in-memory fallbacks');
    
    // Update .env to use in-memory cache
    const envPath = path.join(process.cwd(), '.env');
    if (fs.existsSync(envPath)) {
      let envContent = fs.readFileSync(envPath, 'utf8');
      if (!envContent.includes('USE_IN_MEMORY_CACHE=')) {
        envContent += '\nUSE_IN_MEMORY_CACHE=true\n';
        fs.writeFileSync(envPath, envContent);
        logger.info('Updated .env to use in-memory cache');
      }
    }
  }
}

// Fix Node.js dependencies
async function fixNodeDependencies() {
  logger.info('Checking Node.js dependencies...');
  
  // Check if node_modules exists
  const nodeModulesPath = path.join(process.cwd(), 'node_modules');
  if (!fs.existsSync(nodeModulesPath)) {
    logger.info('node_modules directory not found, running npm install...');
    
    try {
      execSync('npm install', { stdio: 'inherit' });
      logger.info('npm install completed successfully');
    } catch (error) {
      logger.error(`Error running npm install: ${error.message}`);
    }
  } else {
    logger.info('node_modules directory exists');
    
    // Check for critical dependencies
    const criticalDeps = [
      'python-shell',
      'mongodb',
      'ioredis',
      'redis',
      'ws',
      'express'
    ];
    
    const missingDeps = [];
    
    for (const dep of criticalDeps) {
      const depPath = path.join(nodeModulesPath, dep);
      if (!fs.existsSync(depPath)) {
        missingDeps.push(dep);
      }
    }
    
    if (missingDeps.length > 0) {
      logger.info(`Missing dependencies: ${missingDeps.join(', ')}`);
      logger.info('Installing missing dependencies...');
      
      try {
        execSync(`npm install ${missingDeps.join(' ')}`, { stdio: 'inherit' });
        logger.info('Dependencies installed successfully');
      } catch (error) {
        logger.error(`Error installing dependencies: ${error.message}`);
      }
    } else {
      logger.info('All critical dependencies are installed');
    }
  }
}

// Main fix function
async function fixEnvironment() {
  logger.info('Starting environment fix...');
  logger.info('Timestamp: ' + new Date().toISOString());
  
  try {
    // Step 1: Ensure logs directory exists
    ensureLogsDirectory();
    
    // Step 2: Detect Python path
    const pythonPath = await detectPythonPath();
    
    // Step 3: Update .env file
    await updateEnvFile(pythonPath);
    
    // Step 4: Install required Python packages
    await installPythonPackages(pythonPath);
    
    // Step 5: Fix file permissions
    fixFilePermissions();
    
    // Step 6: Check and fix MongoDB
    await checkAndFixMongoDB();
    
    // Step 7: Check and fix Redis
    await checkAndFixRedis();
    
    // Step 8: Fix Node.js dependencies
    await fixNodeDependencies();
    
    logger.info('Environment fix completed successfully');
    logger.info('You can now try running the application with: npm start');
  } catch (error) {
    logger.error(`Environment fix failed: ${error.message}`);
    logger.error(error.stack);
  } finally {
    // Close readline interface
    rl.close();
  }
}

// Run fix if this script is executed directly
if (require.main === module) {
  fixEnvironment()
    .then(() => {
      logger.info('Fix completed');
    })
    .catch(error => {
      logger.error(`Fix failed: ${error.message}`);
      process.exit(1);
    });
}

module.exports = {
  fixEnvironment,
  detectPythonPath,
  updateEnvFile,
  installPythonPackages,
  ensureLogsDirectory,
  fixFilePermissions,
  checkAndFixMongoDB,
  checkAndFixRedis,
  fixNodeDependencies
};// scripts/fix-environment.js
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');
const winston = require('winston');
const readline = require('readline');

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
    new winston.transports.File({ filename: 'environment-fix.log' })
  ]
});

// Create readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Promisify readline question
function question(query) {
  return new Promise(resolve => {
    rl.question(query, answer => {
      resolve(answer);
    });
  });
}

// Detect Python executable path
async function detectPythonPath() {
  logger.info('Detecting Python executable path...');
  
  // Check environment variables first
  const envPath = process.env.PYTHON_PATH || process.env.PYTHON_EXECUTABLE;
  if (envPath && fs.existsSync(envPath)) {
    logger.info(`Found Python path in environment variables: ${envPath}`);
    return envPath;
  }
  
  // Check common paths based on platform
  const isWindows = process.platform === 'win32';
  
  if (isWindows) {
    // Common Windows Python paths
    const commonWindowsPaths = [
      // Python 3 paths
      'C:\\Python39\\python.exe',
      'C:\\Python310\\python.exe',
      'C:\\Python311\\python.exe',
      'C:\\Python312\\python.exe',
      // Python launcher
      'C:\\Windows\\py.exe',
      // Anaconda/Miniconda paths
      'C:\\ProgramData\\Anaconda3\\python.exe',
      'C:\\ProgramData\\miniconda3\\python.exe',
      // User profile paths
      `${process.env.USERPROFILE}\\AppData\\Local\\Programs\\Python\\Python39\\python.exe`,
      `${process.env.USERPROFILE}\\AppData\\Local\\Programs\\Python\\Python310\\python.exe`,
      `${process.env.USERPROFILE}\\AppData\\Local\\Programs\\Python\\Python311\\python.exe`,
      `${process.env.USERPROFILE}\\AppData\\Local\\Programs\\Python\\Python312\\python.exe`,
    ];
    
    for (const pythonPath of commonWindowsPaths) {
      try {
        if (fs.existsSync(pythonPath)) {
          logger.info(`Found Python at: ${pythonPath}`);
          return pythonPath;
        }
      } catch (e) {
        // Ignore errors and continue checking
      }
    }
  } else {
    // On Unix-like systems, we can try to use the 'which' command
    try {
      const pythonPath = execSync('which python3 || which python').toString().trim();
      if (pythonPath) {
        logger.info(`Found Python at: ${pythonPath}`);
        return pythonPath;
      }
    } catch (e) {
      // Ignore errors and fall back to default
    }
  }
  
  // Try to find Python in PATH
  try {
    const pythonPath = execSync('where python', { encoding: 'utf8' }).trim().split('\n')[0];
    logger.info(`Found Python in PATH: ${pythonPath}`);
    return pythonPath;
  } catch (e) {
    // Ignore errors and continue
  }
  
  // Try Python launcher
  try {
    const pyPath = execSync('where py', { encoding: 'utf8' }).trim().split('\n')[0];
    logger.info(`Found Python launcher: ${pyPath}`);
    return pyPath;
  } catch (e) {
    // Ignore errors and continue
  }
  
  // Ask user for Python path
  logger.warn('Could not automatically detect Python path');
  const userPath = await question('Please enter the full path to your Python executable: ');
  
  if (userPath && fs.existsSync(userPath)) {
    logger.info(`Using user-provided Python path: ${userPath}`);
    return userPath;
  }
  
  logger.error('No valid Python path found. Please install Python and try again.');
  return 'python'; // Default fallback
}

// Update .env file with correct configuration
async function updateEnvFile(pythonPath) {
  logger.info('Updating .env file...');
  
  const envPath = path.join(process.cwd(), '.env');
  let envContent = '';
  
  // Create default .env content
  const defaultEnv = `# Python Configuration
PYTHON_PATH=${pythonPath}
PYTHON_EXECUTABLE=${pythonPath}
PYTHON_BRIDGE_MAX_RETRIES=3
PYTHON_EXECUTION_TIMEOUT=60000

# Server Configuration
PORT=5000
HOST=localhost
NODE_ENV=development
LOG_LEVEL=info

# Database Configuration
MONGODB_URI=mongodb://localhost:27017/sports-analytics
MONGODB_DB_NAME=sports-analytics
DB_MAX_POOL_SIZE=50
DB_MIN_POOL_SIZE=10
CONNECT_TIMEOUT_MS=30000
SOCKET_TIMEOUT_MS=45000

# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_CONNECT_TIMEOUT=10000
REDIS_ENABLE_OFFLINE_QUEUE=true
REDIS_MAX_RETRIES=3
REDIS_RETRY_STRATEGY_MAX_DELAY=2000

# Cache Configuration
CACHE_TTL=1800
CACHE_MAX_ITEMS=500
CACHE_CHECK_PERIOD=300

# WebSocket Configuration
WS_PORT=5150
WS_PATH=/ws
WS_HEARTBEAT_INTERVAL=60000
WS_CLIENT_TIMEOUT=35000
WS_MAX_PAYLOAD=52428800

# Performance Configuration
MEMORY_USAGE_THRESHOLD=0.80
CPU_LOAD_THRESHOLD=0.80
NETWORK_TRAFFIC_THRESHOLD=52428800
HEALTH_CHECK_INTERVAL=300000
METRICS_INTERVAL=300000
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX=50
MAX_CONNECTIONS_PER_IP=50
COMPRESSION_LEVEL=6
COMPRESSION_THRESHOLD=1024

# Security Configuration
JWT_SECRET=your-secret-key-here
JWT_EXPIRATION=86400
CORS_ORIGIN=http://localhost:5000`;
  
  // Check if .env file exists
  if (fs.existsSync(envPath)) {
    logger.info('.env file exists, updating...');
    envContent = fs.readFileSync(envPath, 'utf8');
    
    // Update Python path
    if (envContent.includes('PYTHON_PATH=')) {
      envContent = envContent.replace(/PYTHON_PATH=.*(\r?\n|$)/g, `PYTHON_PATH=${pythonPath}$1`);
    } else {
      envContent += `\nPYTHON_PATH=${pythonPath}\n`;
    }
    
    // Update Python executable
    if (envContent.includes('PYTHON_EXECUTABLE=')) {
      envContent = envContent.replace(/PYTHON_EXECUTABLE=.*(\r?\n|$)/g, `PYTHON_EXECUTABLE=${pythonPath}$1`);
    } else {
      envContent += `PYTHON_EXECUTABLE=${pythonPath}\n`;
    }
    
    // Ensure other critical variables are present
    const criticalVars = [
      'MONGODB_URI', 'REDIS_HOST', 'REDIS_PORT', 'PORT', 'WS_PORT'
    ];
    
    criticalVars.forEach(varName => {
      if (!envContent.includes(`${varName}=`)) {
        const defaultLine = defaultEnv.split('\n').find(line => line.startsWith(`${varName}=`));
        if (defaultLine) {
          envContent += `\n${defaultLine}\n`;
        }
      }
    });
  } else {
    logger.info('.env file does not exist, creating...');
    envContent = defaultEnv;
  }
  
  // Write updated content to .env file
  fs.writeFileSync(envPath, envContent);
  logger.info('.env file updated successfully');
  
  return envContent;
}

// Install required Python packages
async function installPythonPackages(pythonPath) {
  logger.info('Installing required Python packages...');
  
  const requiredPackages = [
    'numpy',
    'pandas',
    'scikit-learn==1.0.2',
    'matplotlib==3.5.2',
    'xgboost==1.6.1',
    'lightgbm==3.3.2',
    'hyperopt==0.2.7',
    'pymongo==4.1.1',
    'python-dotenv==0.20.0',
    'redis==4.3.4',
    'prometheus-client==0.14.1',
    'psutil==5.9.1',
    'cachetools'
  ];
  
  // Check which packages are already installed
  const installedPackages = [];
  const missingPackages = [];
  
  for (const pkg of requiredPackages) {
    const pkgName = pkg.split('==')[0];
    try {
      execSync(`"${pythonPath}" -c "import ${pkgName}; print(f'${pkgName} is installed')"`, { encoding: 'utf8' });
      installedPackages.push(pkg);
    } catch (e) {
      missingPackages.push(pkg);
    }
  }
  
  logger.info(`Already installed: ${installedPackages.join(', ')}`);
  logger.info(`Missing packages: ${missingPackages.join(', ')}`);
  
  if (missingPackages.length === 0) {
    logger.info('All required Python packages are already installed');
    return true;
  }
  
  // Install missing packages
  try {
    logger.info('Installing pip and setuptools...');
    execSync(`"${pythonPath}" -m pip install --upgrade pip setuptools wheel`, { stdio: 'inherit' });
    
    for (const pkg of missingPackages) {
      logger.info(`Installing ${pkg}...`);
      execSync(`"${pythonPath}" -m pip install ${pkg}`, { stdio: 'inherit' });
    }
    
    logger.info('All Python packages installed successfully');
    return true;
  } catch (error) {
    logger.error(`Error installing Python packages: ${error.message}`);
    return false;
  }
}

// Create logs directory if it doesn't exist
function ensureLogsDirectory() {
  const logsDir = path.join(process.cwd(), 'logs');
  if (!fs.existsSync(logsDir)) {
    logger.info(`Creating logs directory at: ${logsDir}`);
    fs.mkdirSync(logsDir, { recursive: true });
  }
}

// Fix file permissions
function fixFilePermissions() {
  logger.info('Fixing file permissions...');
  
  const scriptsDir = path.join(process.cwd(), 'scripts');
  if (fs.existsSync(scriptsDir)) {
    const files = fs.readdirSync(scriptsDir);
    const pythonScripts = files.filter(file => file.endsWith('.py'));
    
    pythonScripts.forEach(script => {
      const scriptPath = path.join(scriptsDir, script);
      try {
        // Make Python scripts executable
        fs.chmodSync(scriptPath, 0o755);
        logger.info(`Made ${script} executable`);
      } catch (error) {
        logger.error(`Error setting permissions for ${script}: ${error.message}`);
      }
    });
  }
}

// Check and fix MongoDB
async function checkAndFixMongoDB() {
  logger.info('Checking MongoDB...');
  
  try {
    // Check if MongoDB is running
    execSync('mongod --version', { stdio: 'pipe' });
    logger.info('MongoDB is installed');
    
    // Ask user if they want to start MongoDB
    const startMongo = await question('Do you want to ensure MongoDB is running? (y/n): ');
    if (startMongo.toLowerCase() === 'y') {
      try {
        logger.info('Attempting to start MongoDB...');
        execSync('net start MongoDB', { stdio: 'pipe' });
        logger.info('MongoDB service started');
      } catch (error) {
        logger.warn(`Could not start MongoDB service: ${error.message}`);
        logger.info('You may need to start MongoDB manually');
      }
    }
  } catch (error) {
    logger.warn(`MongoDB may not be installed: ${error.message}`);
    logger.info('Please install MongoDB to use this application');
  }
}

// Check and fix Redis
async function checkAndFixRedis() {
  logger.info('Checking Redis...');
  
  try {
    // Check if Redis is installed
    execSync('redis-cli --version', { stdio: 'pipe' });
    logger.info('Redis CLI is installed');
    
    // Ask user if they want to start Redis
    const startRedis = await question('Do you want to ensure Redis is running? (y/n): ');
    if (startRedis.toLowerCase() === 'y') {
      try {
        logger.info('Attempting to start Redis...');
        // This is Windows-specific, adjust for other platforms
        execSync('redis-server --service-start', { stdio: 'pipe' });
        logger.info('Redis service started');
      } catch (error) {
        logger.warn(`Could not start Redis service: ${error.message}`);
        logger.info('You may need to start Redis manually');
      }
    }
  } catch (error) {
    logger.warn(`Redis may not be installed: ${error.message}`);
    logger.info('The application can run without Redis using in-memory fallbacks');
    
    // Update .env to use in-memory cache
    const envPath = path.join(process.cwd(), '.env');
    if (fs.existsSync(envPath)) {
      let envContent = fs.readFileSync(envPath, 'utf8');
      if (!envContent.includes('USE_IN_MEMORY_CACHE=')) {
        envContent += '\nUSE_IN_MEMORY_CACHE=true\n';
        fs.writeFileSync(envPath, envContent);
        logger.info('Updated .env to use in-memory cache');
      }
    }
  }
}

// Fix Node.js dependencies
async function fixNodeDependencies() {
  logger.info('Checking Node.js dependencies...');
  
  // Check if node_modules exists
  const nodeModulesPath = path.join(process.cwd(), 'node_modules');
  if (!fs.existsSync(nodeModulesPath)) {
    logger.info('node_modules directory not found, running npm install...');
    
    try {
      execSync('npm install', { stdio: 'inherit' });
      logger.info('npm install completed successfully');
    } catch (error) {
      logger.error(`Error running npm install: ${error.message}`);
    }
  } else {
    logger.info('node_modules directory exists');
    
    // Check for critical dependencies
    const criticalDeps = [
      'python-shell',
      'mongodb',
      'ioredis',
      'redis',
      'ws',
      'express'
    ];
    
    const missingDeps = [];
    
    for (const dep of criticalDeps) {
      const depPath = path.join(nodeModulesPath, dep);
      if (!fs.existsSync(depPath)) {
        missingDeps.push(dep);
      }
    }
    
    if (missingDeps.length > 0) {
      logger.info(`Missing dependencies: ${missingDeps.join(', ')}`);
      logger.info('Installing missing dependencies...');
      
      try {
        execSync(`npm install ${missingDeps.join(' ')}`, { stdio: 'inherit' });
        logger.info('Dependencies installed successfully');
      } catch (error) {
        logger.error(`Error installing dependencies: ${error.message}`);
      }
    } else {
      logger.info('All critical dependencies are installed');
    }
  }
}

// Main fix function
async function fixEnvironment() {
  logger.info('Starting environment fix...');
  logger.info('Timestamp: ' + new Date().toISOString());
  
  try {
    // Step 1: Ensure logs directory exists
    ensureLogsDirectory();
    
    // Step 2: Detect Python path
    const pythonPath = await detectPythonPath();
    
    // Step 3: Update .env file
    await updateEnvFile(pythonPath);
    
    // Step 4: Install required Python packages
    await installPythonPackages(pythonPath);
    
    // Step 5: Fix file permissions
    fixFilePermissions();
    
    // Step 6: Check and fix MongoDB
    await checkAndFixMongoDB();
    
    // Step 7: Check and fix Redis
    await checkAndFixRedis();
    
    // Step 8: Fix Node.js dependencies
    await fixNodeDependencies();
    
    logger.info('Environment fix completed successfully');
    logger.info('You can now try running the application with: npm start');
  } catch (error) {
    logger.error(`Environment fix failed: ${error.message}`);
    logger.error(error.stack);
  } finally {
    // Close readline interface
    rl.close();
  }
}

// Run fix if this script is executed directly
if (require.main === module) {
  fixEnvironment()
    .then(() => {
      logger.info('Fix completed');
    })
    .catch(error => {
      logger.error(`Fix failed: ${error.message}`);
      process.exit(1);
    });
}

module.exports = {
  fixEnvironment,
  detectPythonPath,
  updateEnvFile,
  installPythonPackages,
  ensureLogsDirectory,
  fixFilePermissions,
  checkAndFixMongoDB,
  checkAndFixRedis,
  fixNodeDependencies
};// scripts/fix-environment.js
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');
const winston = require('winston');
const readline = require('readline');

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
    new winston.transports.File({ filename: 'environment-fix.log' })
  ]
});

// Create readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Promisify readline question
function question(query) {
  return new Promise(resolve => {
    rl.question(query, answer => {
      resolve(answer);
    });
  });
}

// Detect Python executable path
async function detectPythonPath() {
  logger.info('Detecting Python executable path...');
  
  // Check environment variables first
  const envPath = process.env.PYTHON_PATH || process.env.PYTHON_EXECUTABLE;
  if (envPath && fs.existsSync(envPath)) {
    logger.info(`Found Python path in environment variables: ${envPath}`);
    return envPath;
  }
  
  // Check common paths based on platform
  const isWindows = process.platform === 'win32';
  
  if (isWindows) {
    // Common Windows Python paths
    const commonWindowsPaths = [
      // Python 3 paths
      'C:\\Python39\\python.exe',
      'C:\\Python310\\python.exe',
      'C:\\Python311\\python.exe',
      'C:\\Python312\\python.exe',
      // Python launcher
      'C:\\Windows\\py.exe',
      // Anaconda/Miniconda paths
      'C:\\ProgramData\\Anaconda3\\python.exe',
      'C:\\ProgramData\\miniconda3\\python.exe',
      // User profile paths
      `${process.env.USERPROFILE}\\AppData\\Local\\Programs\\Python\\Python39\\python.exe`,
      `${process.env.USERPROFILE}\\AppData\\Local\\Programs\\Python\\Python310\\python.exe`,
      `${process.env.USERPROFILE}\\AppData\\Local\\Programs\\Python\\Python311\\python.exe`,
      `${process.env.USERPROFILE}\\AppData\\Local\\Programs\\Python\\Python312\\python.exe`,
    ];
    
    for (const pythonPath of commonWindowsPaths) {
      try {
        if (fs.existsSync(pythonPath)) {
          logger.info(`Found Python at: ${pythonPath}`);
          return pythonPath;
        }
      } catch (e) {
        // Ignore errors and continue checking
      }
    }
  } else {
    // On Unix-like systems, we can try to use the 'which' command
    try {
      const pythonPath = execSync('which python3 || which python').toString().trim();
      if (pythonPath) {
        logger.info(`Found Python at: ${pythonPath}`);
        return pythonPath;
      }
    } catch (e) {
      // Ignore errors and fall back to default
    }
  }
  
  // Try to find Python in PATH
  try {
    const pythonPath = execSync('where python', { encoding: 'utf8' }).trim().split('\n')[0];
    logger.info(`Found Python in PATH: ${pythonPath}`);
    return pythonPath;
  } catch (e) {
    // Ignore errors and continue
  }
  
  // Try Python launcher
  try {
    const pyPath = execSync('where py', { encoding: 'utf8' }).trim().split('\n')[0];
    logger.info(`Found Python launcher: ${pyPath}`);
    return pyPath;
  } catch (e) {
    // Ignore errors and continue
  }
  
  // Ask user for Python path
  logger.warn('Could not automatically detect Python path');
  const userPath = await question('Please enter the full path to your Python executable: ');
  
  if (userPath && fs.existsSync(userPath)) {
    logger.info(`Using user-provided Python path: ${userPath}`);
    return userPath;
  }
  
  logger.error('No valid Python path found. Please install Python and try again.');
  return 'python'; // Default fallback
}

// Update .env file with correct configuration
async function updateEnvFile(pythonPath) {
  logger.info('Updating .env file...');
  
  const envPath = path.join(process.cwd(), '.env');
  let envContent = '';
  
  // Create default .env content
  const defaultEnv = `# Python Configuration
PYTHON_PATH=${pythonPath}
PYTHON_EXECUTABLE=${pythonPath}
PYTHON_BRIDGE_MAX_RETRIES=3
PYTHON_EXECUTION_TIMEOUT=60000

# Server Configuration
PORT=5000
HOST=localhost
NODE_ENV=development
LOG_LEVEL=info

# Database Configuration
MONGODB_URI=mongodb://localhost:27017/sports-analytics
MONGODB_DB_NAME=sports-analytics
DB_MAX_POOL_SIZE=50
DB_MIN_POOL_SIZE=10
CONNECT_TIMEOUT_MS=30000
SOCKET_TIMEOUT_MS=45000

# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_CONNECT_TIMEOUT=10000
REDIS_ENABLE_OFFLINE_QUEUE=true
REDIS_MAX_RETRIES=3
REDIS_RETRY_STRATEGY_MAX_DELAY=2000

# Cache Configuration
CACHE_TTL=1800
CACHE_MAX_ITEMS=500
CACHE_CHECK_PERIOD=300

# WebSocket Configuration
WS_PORT=5150
WS_PATH=/ws
WS_HEARTBEAT_INTERVAL=60000
WS_CLIENT_TIMEOUT=35000
WS_MAX_PAYLOAD=52428800

# Performance Configuration
MEMORY_USAGE_THRESHOLD=0.80
CPU_LOAD_THRESHOLD=0.80
NETWORK_TRAFFIC_THRESHOLD=52428800
HEALTH_CHECK_INTERVAL=300000
METRICS_INTERVAL=300000
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX=50
MAX_CONNECTIONS_PER_IP=50
COMPRESSION_LEVEL=6
COMPRESSION_THRESHOLD=1024

# Security Configuration
JWT_SECRET=your-secret-key-here
JWT_EXPIRATION=86400
CORS_ORIGIN=http://localhost:5000`;
  
  // Check if .env file exists
  if (fs.existsSync(envPath)) {
    logger.info('.env file exists, updating...');
    envContent = fs.readFileSync(envPath, 'utf8');
    
    // Update Python path
    if (envContent.includes('PYTHON_PATH=')) {
      envContent = envContent.replace(/PYTHON_PATH=.*(\r?\n|$)/g, `PYTHON_PATH=${pythonPath}$1`);
    } else {
      envContent += `\nPYTHON_PATH=${pythonPath}\n`;
    }
    
    // Update Python executable
    if (envContent.includes('PYTHON_EXECUTABLE=')) {
      envContent = envContent.replace(/PYTHON_EXECUTABLE=.*(\r?\n|$)/g, `PYTHON_EXECUTABLE=${pythonPath}$1`);
    } else {
      envContent += `PYTHON_EXECUTABLE=${pythonPath}\n`;
    }
    
    // Ensure other critical variables are present
    const criticalVars = [
      'MONGODB_URI', 'REDIS_HOST', 'REDIS_PORT', 'PORT', 'WS_PORT'
    ];
    
    criticalVars.forEach(varName => {
      if (!envContent.includes(`${varName}=`)) {
        const defaultLine = defaultEnv.split('\n').find(line => line.startsWith(`${varName}=`));
        if (defaultLine) {
          envContent += `\n${defaultLine}\n`;
        }
      }
    });
  } else {
    logger.info('.env file does not exist, creating...');
    envContent = defaultEnv;
  }
  
  // Write updated content to .env file
  fs.writeFileSync(envPath, envContent);
  logger.info('.env file updated successfully');
  
  return envContent;
}

// Install required Python packages
async function installPythonPackages(pythonPath) {
  logger.info('Installing required Python packages...');
  
  const requiredPackages = [
    'numpy',
    'pandas',
    'scikit-learn==1.0.2',
    'matplotlib==3.5.2',
    'xgboost==1.6.1',
    'lightgbm==3.3.2',
    'hyperopt==0.2.7',
    'pymongo==4.1.1',
    'python-dotenv==0.20.0',
    'redis==4.3.4',
    'prometheus-client==0.14.1',
    'psutil==5.9.1',
    'cachetools'
  ];
  
  // Check which packages are already installed
  const installedPackages = [];
  const missingPackages = [];
  
  for (const pkg of requiredPackages) {
    const pkgName = pkg.split('==')[0];
    try {
      execSync(`"${pythonPath}" -c "import ${pkgName}; print(f'${pkgName} is installed')"`, { encoding: 'utf8' });
      installedPackages.push(pkg);
    } catch (e) {
      missingPackages.push(pkg);
    }
  }
  
  logger.info(`Already installed: ${installedPackages.join(', ')}`);
  logger.info(`Missing packages: ${missingPackages.join(', ')}`);
  
  if (missingPackages.length === 0) {
    logger.info('All required Python packages are already installed');
    return true;
  }
  
  // Install missing packages
  try {
    logger.info('Installing pip and setuptools...');
    execSync(`"${pythonPath}" -m pip install --upgrade pip setuptools wheel`, { stdio: 'inherit' });
    
    for (const pkg of missingPackages) {
      logger.info(`Installing ${pkg}...`);
      execSync(`"${pythonPath}" -m pip install ${pkg}`, { stdio: 'inherit' });
    }
    
    logger.info('All Python packages installed successfully');
    return true;
  } catch (error) {
    logger.error(`Error installing Python packages: ${error.message}`);
    return false;
  }
}

// Create logs directory if it doesn't exist
function ensureLogsDirectory() {
  const logsDir = path.join(process.cwd(), 'logs');
  if (!fs.existsSync(logsDir)) {
    logger.info(`Creating logs directory at: ${logsDir}`);
    fs.mkdirSync(logsDir, { recursive: true });
  }
}

// Fix file permissions
function fixFilePermissions() {
  logger.info('Fixing file permissions...');
  
  const scriptsDir = path.join(process.cwd(), 'scripts');
  if (fs.existsSync(scriptsDir)) {
    const files = fs.readdirSync(scriptsDir);
    const pythonScripts = files.filter(file => file.endsWith('.py'));
    
    pythonScripts.forEach(script => {
      const scriptPath = path.join(scriptsDir, script);
      try {
        // Make Python scripts executable
        fs.chmodSync(scriptPath, 0o755);
        logger.info(`Made ${script} executable`);
      } catch (error) {
        logger.error(`Error setting permissions for ${script}: ${error.message}`);
      }
    });
  }
}

// Check and fix MongoDB
async function checkAndFixMongoDB() {
  logger.info('Checking MongoDB...');
  
  try {
    // Check if MongoDB is running
    execSync('mongod --version', { stdio: 'pipe' });
    logger.info('MongoDB is installed');
    
    // Ask user if they want to start MongoDB
    const startMongo = await question('Do you want to ensure MongoDB is running? (y/n): ');
    if (startMongo.toLowerCase() === 'y') {
      try {
        logger.info('Attempting to start MongoDB...');
        execSync('net start MongoDB', { stdio: 'pipe' });
        logger.info('MongoDB service started');
      } catch (error) {
        logger.warn(`Could not start MongoDB service: ${error.message}`);
        logger.info('You may need to start MongoDB manually');
      }
    }
  } catch (error) {
    logger.warn(`MongoDB may not be installed: ${error.message}`);
    logger.info('Please install MongoDB to use this application');
  }
}

// Check and fix Redis
async function checkAndFixRedis() {
  logger.info('Checking Redis...');
  
  try {
    // Check if Redis is installed
    execSync('redis-cli --version', { stdio: 'pipe' });
    logger.info('Redis CLI is installed');
    
    // Ask user if they want to start Redis
    const startRedis = await question('Do you want to ensure Redis is running? (y/n): ');
    if (startRedis.toLowerCase() === 'y') {
      try {
        logger.info('Attempting to start Redis...');
        // This is Windows-specific, adjust for other platforms
        execSync('redis-server --service-start', { stdio: 'pipe' });
        logger.info('Redis service started');
      } catch (error) {
        logger.warn(`Could not start Redis service: ${error.message}`);
        logger.info('You may need to start Redis manually');
      }
    }
  } catch (error) {
    logger.warn(`Redis may not be installed: ${error.message}`);
    logger.info('The application can run without Redis using in-memory fallbacks');
    
    // Update .env to use in-memory cache
    const envPath = path.join(process.cwd(), '.env');
    if (fs.existsSync(envPath)) {
      let envContent = fs.readFileSync(envPath, 'utf8');
      if (!envContent.includes('USE_IN_MEMORY_CACHE=')) {
        envContent += '\nUSE_IN_MEMORY_CACHE=true\n';
        fs.writeFileSync(envPath, envContent);
        logger.info('Updated .env to use in-memory cache');
      }
    }
  }
}

// Fix Node.js dependencies
async function fixNodeDependencies() {
  logger.info('Checking Node.js dependencies...');
  
  // Check if node_modules exists
  const nodeModulesPath = path.join(process.cwd(), 'node_modules');
  if (!fs.existsSync(nodeModulesPath)) {
    logger.info('node_modules directory not found, running npm install...');
    
    try {
      execSync('npm install', { stdio: 'inherit' });
      logger.info('npm install completed successfully');
    } catch (error) {
      logger.error(`Error running npm install: ${error.message}`);
    }
  } else {
    logger.info('node_modules directory exists');
    
    // Check for critical dependencies
    const criticalDeps = [
      'python-shell',
      'mongodb',
      'ioredis',
      'redis',
      'ws',
      'express'
    ];
    
    const missingDeps = [];
    
    for (const dep of criticalDeps) {
      const depPath = path.join(nodeModulesPath, dep);
      if (!fs.existsSync(depPath)) {
        missingDeps.push(dep);
      }
    }
    
    if (missingDeps.length > 0) {
      logger.info(`Missing dependencies: ${missingDeps.join(', ')}`);
      logger.info('Installing missing dependencies...');
      
      try {
        execSync(`npm install ${missingDeps.join(' ')}`, { stdio: 'inherit' });
        logger.info('Dependencies installed successfully');
      } catch (error) {
        logger.error(`Error installing dependencies: ${error.message}`);
      }
    } else {
      logger.info('All critical dependencies are installed');
    }
  }
}

// Main fix function
async function fixEnvironment() {
  logger.info('Starting environment fix...');
  logger.info('Timestamp: ' + new Date().toISOString());
  
  try {
    // Step 1: Ensure logs directory exists
    ensureLogsDirectory();
    
    // Step 2: Detect Python path
    const pythonPath = await detectPythonPath();
    
    // Step 3: Update .env file
    await updateEnvFile(pythonPath);
    
    // Step 4: Install required Python packages
    await installPythonPackages(pythonPath);
    
    // Step 5: Fix file permissions
    fixFilePermissions();
    
    // Step 6: Check and fix MongoDB
    await checkAndFixMongoDB();
    
    // Step 7: Check and fix Redis
    await checkAndFixRedis();
    
    // Step 8: Fix Node.js dependencies
    await fixNodeDependencies();
    
    logger.info('Environment fix completed successfully');
    logger.info('You can now try running the application with: npm start');
  } catch (error) {
    logger.error(`Environment fix failed: ${error.message}`);
    logger.error(error.stack);
  } finally {
    // Close readline interface
    rl.close();
  }
}

// Run fix if this script is executed directly
if (require.main === module) {
  fixEnvironment()
    .then(() => {
      logger.info('Fix completed');
    })
    .catch(error => {
      logger.error(`Fix failed: ${error.message}`);
      process.exit(1);
    });
}

module.exports = {
  fixEnvironment,
  detectPythonPath,
  updateEnvFile,
  installPythonPackages,
  ensureLogsDirectory,
  fixFilePermissions,
  checkAndFixMongoDB,
  checkAndFixRedis,
  fixNodeDependencies
};
// scripts/fix-environment.js
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');
const winston = require('winston');
const readline = require('readline');

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
    new winston.transports.File({ filename: 'environment-fix.log' })
  ]
});

// Create readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Promisify readline question
function question(query) {
  return new Promise(resolve => {
    rl.question(query, answer => {
      resolve(answer);
    });
  });
}

// Detect Python executable path
async function detectPythonPath() {
  logger.info('Detecting Python executable path...');
  
  // Check environment variables first
  const envPath = process.env.PYTHON_PATH || process.env.PYTHON_EXECUTABLE;
  if (envPath && fs.existsSync(envPath)) {
    logger.info(`Found Python path in environment variables: ${envPath}`);
    return envPath;
  }
  
  // Check common paths based on platform
  const isWindows = process.platform === 'win32';
  
  if (isWindows) {
    // Common Windows Python paths
    const commonWindowsPaths = [
      // Python 3 paths
      'C:\\Python39\\python.exe',
      'C:\\Python310\\python.exe',
      'C:\\Python311\\python.exe',
      'C:\\Python312\\python.exe',
      // Python launcher
      'C:\\Windows\\py.exe',
      // Anaconda/Miniconda paths
      'C:\\ProgramData\\Anaconda3\\python.exe',
      'C:\\ProgramData\\miniconda3\\python.exe',
      // User profile paths
      `${process.env.USERPROFILE}\\AppData\\Local\\Programs\\Python\\Python39\\python.exe`,
      `${process.env.USERPROFILE}\\AppData\\Local\\Programs\\Python\\Python310\\python.exe`,
      `${process.env.USERPROFILE}\\AppData\\Local\\Programs\\Python\\Python311\\python.exe`,
      `${process.env.USERPROFILE}\\AppData\\Local\\Programs\\Python\\Python312\\python.exe`,
    ];
    
    for (const pythonPath of commonWindowsPaths) {
      try {
        if (fs.existsSync(pythonPath)) {
          logger.info(`Found Python at: ${pythonPath}`);
          return pythonPath;
        }
      } catch (e) {
        // Ignore errors and continue checking
      }
    }
  } else {
    // On Unix-like systems, we can try to use the 'which' command
    try {
      const pythonPath = execSync('which python3 || which python').toString().trim();
      if (pythonPath) {
        logger.info(`Found Python at: ${pythonPath}`);
        return pythonPath;
      }
    } catch (e) {
      // Ignore errors and fall back to default
    }
  }
  
  // Try to find Python in PATH
  try {
    const pythonPath = execSync('where python', { encoding: 'utf8' }).trim().split('\n')[0];
    logger.info(`Found Python in PATH: ${pythonPath}`);
    return pythonPath;
  } catch (e) {
    // Ignore errors and continue
  }
  
  // Try Python launcher
  try {
    const pyPath = execSync('where py', { encoding: 'utf8' }).trim().split('\n')[0];
    logger.info(`Found Python launcher: ${pyPath}`);
    return pyPath;
  } catch (e) {
    // Ignore errors and continue
  }
  
  // Ask user for Python path
  logger.warn('Could not automatically detect Python path');
  const userPath = await question('Please enter the full path to your Python executable: ');
  
  if (userPath && fs.existsSync(userPath)) {
    logger.info(`Using user-provided Python path: ${userPath}`);
    return userPath;
  }
  
  logger.error('No valid Python path found. Please install Python and try again.');
  return 'python'; // Default fallback
}

// Update .env file with correct configuration
async function updateEnvFile(pythonPath) {
  logger.info('Updating .env file...');
  
  const envPath = path.join(process.cwd(), '.env');
  let envContent = '';
  
  // Create default .env content
  const defaultEnv = `# Python Configuration
PYTHON_PATH=${pythonPath}
PYTHON_EXECUTABLE=${pythonPath}
PYTHON_BRIDGE_MAX_RETRIES=3
PYTHON_EXECUTION_TIMEOUT=60000

# Server Configuration
PORT=5000
HOST=localhost
NODE_ENV=development
LOG_LEVEL=info

# Database Configuration
MONGODB_URI=mongodb://localhost:27017/sports-analytics
MONGODB_DB_NAME=sports-analytics
DB_MAX_POOL_SIZE=50
DB_MIN_POOL_SIZE=10
CONNECT_TIMEOUT_MS=30000
SOCKET_TIMEOUT_MS=45000

# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_CONNECT_TIMEOUT=10000
REDIS_ENABLE_OFFLINE_QUEUE=true
REDIS_MAX_RETRIES=3
REDIS_RETRY_STRATEGY_MAX_DELAY=2000

# Cache Configuration
CACHE_TTL=1800
CACHE_MAX_ITEMS=500
CACHE_CHECK_PERIOD=300

# WebSocket Configuration
WS_PORT=5150
WS_PATH=/ws
WS_HEARTBEAT_INTERVAL=60000
WS_CLIENT_TIMEOUT=35000
WS_MAX_PAYLOAD=52428800

# Performance Configuration
MEMORY_USAGE_THRESHOLD=0.80
CPU_LOAD_THRESHOLD=0.80
NETWORK_TRAFFIC_THRESHOLD=52428800
HEALTH_CHECK_INTERVAL=300000
METRICS_INTERVAL=300000
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX=50
MAX_CONNECTIONS_PER_IP=50
COMPRESSION_LEVEL=6
COMPRESSION_THRESHOLD=1024

# Security Configuration
JWT_SECRET=your-secret-key-here
JWT_EXPIRATION=86400
CORS_ORIGIN=http://localhost:5000`;
  
  // Check if .env file exists
  if (fs.existsSync(envPath)) {
    logger.info('.env file exists, updating...');
    envContent = fs.readFileSync(envPath, 'utf8');
    
    // Update Python path
    if (envContent.includes('PYTHON_PATH=')) {
      envContent = envContent.replace(/PYTHON_PATH=.*(\r?\n|$)/g, `PYTHON_PATH=${pythonPath}$1`);
    } else {
      envContent += `\nPYTHON_PATH=${pythonPath}\n`;
    }
    
    // Update Python executable
    if (envContent.includes('PYTHON_EXECUTABLE=')) {
      envContent = envContent.replace(/PYTHON_EXECUTABLE=.*(\r?\n|$)/g, `PYTHON_EXECUTABLE=${pythonPath}$1`);
    } else {
      envContent += `PYTHON_EXECUTABLE=${pythonPath}\n`;
    }
    
    // Ensure other critical variables are present
    const criticalVars = [
      'MONGODB_URI', 'REDIS_HOST', 'REDIS_PORT', 'PORT', 'WS_PORT'
    ];
    
    criticalVars.forEach(varName => {
      if (!envContent.includes(`${varName}=`)) {
        const defaultLine = defaultEnv.split('\n').find(line => line.startsWith(`${varName}=`));
        if (defaultLine) {
          envContent += `\n${defaultLine}\n`;
        }
      }
    });
  } else {
    logger.info('.env file does not exist, creating...');
    envContent = defaultEnv;
  }
  
  // Write updated content to .env file
  fs.writeFileSync(envPath, envContent);
  logger.info('.env file updated successfully');
  
  return envContent;
}

// Install required Python packages
async function installPythonPackages(pythonPath) {
  logger.info('Installing required Python packages...');
  
  const requiredPackages = [
    'numpy',
    'pandas',
    'scikit-learn==1.0.2',
    'matplotlib==3.5.2',
    'xgboost==1.6.1',
    'lightgbm==3.3.2',
    'hyperopt==0.2.7',
    'pymongo==4.1.1',
    'python-dotenv==0.20.0',
    'redis==4.3.4',
    'prometheus-client==0.14.1',
    'psutil==5.9.1',
    'cachetools'
  ];
  
  // Check which packages are already installed
  const installedPackages = [];
  const missingPackages = [];
  
  for (const pkg of requiredPackages) {
    const pkgName = pkg.split('==')[0];
    try {
      execSync(`"${pythonPath}" -c "import ${pkgName}; print(f'${pkgName} is installed')"`, { encoding: 'utf8' });
      installedPackages.push(pkg);
    } catch (e) {
      missingPackages.push(pkg);
    }
  }
  
  logger.info(`Already installed: ${installedPackages.join(', ')}`);
  logger.info(`Missing packages: ${missingPackages.join(', ')}`);
  
  if (missingPackages.length === 0) {
    logger.info('All required Python packages are already installed');
    return true;
  }
  
  // Install missing packages
  try {
    logger.info('Installing pip and setuptools...');
    execSync(`"${pythonPath}" -m pip install --upgrade pip setuptools wheel`, { stdio: 'inherit' });
    
    for (const pkg of missingPackages) {
      logger.info(`Installing ${pkg}...`);
      execSync(`"${pythonPath}" -m pip install ${pkg}`, { stdio: 'inherit' });
    }
    
    logger.info('All Python packages installed successfully');
    return true;
  } catch (error) {
    logger.error(`Error installing Python packages: ${error.message}`);
    return false;
  }
}

// Create logs directory if it doesn't exist
function ensureLogsDirectory() {
  const logsDir = path.join(process.cwd(), 'logs');
  if (!fs.existsSync(logsDir)) {
    logger.info(`Creating logs directory at: ${logsDir}`);
    fs.mkdirSync(logsDir, { recursive: true });
  }
}

// Fix file permissions
function fixFilePermissions() {
  logger.info('Fixing file permissions...');
  
  const scriptsDir = path.join(process.cwd(), 'scripts');
  if (fs.existsSync(scriptsDir)) {
    const files = fs.readdirSync(scriptsDir);
    const pythonScripts = files.filter(file => file.endsWith('.py'));
    
    pythonScripts.forEach(script => {
      const scriptPath = path.join(scriptsDir, script);
      try {
        // Make Python scripts executable
        fs.chmodSync(scriptPath, 0o755);
        logger.info(`Made ${script} executable`);
      } catch (error) {
        logger.error(`Error setting permissions for ${script}: ${error.message}`);
      }
    });
  }
}

// Check and fix MongoDB
async function checkAndFixMongoDB() {
  logger.info('Checking MongoDB...');
  
  try {
    // Check if MongoDB is running
    execSync('mongod --version', { stdio: 'pipe' });
    logger.info('MongoDB is installed');
    
    // Ask user if they want to start MongoDB
    const startMongo = await question('Do you want to ensure MongoDB is running? (y/n): ');
    if (startMongo.toLowerCase() === 'y') {
      try {
        logger.info('Attempting to start MongoDB...');
        execSync('net start MongoDB', { stdio: 'pipe' });
        logger.info('MongoDB service started');
      } catch (error) {
        logger.warn(`Could not start MongoDB service: ${error.message}`);
        logger.info('You may need to start MongoDB manually');
      }
    }
  } catch (error) {
    logger.warn(`MongoDB may not be installed: ${error.message}`);
    logger.info('Please install MongoDB to use this application');
  }
}

// Check and fix Redis
async function checkAndFixRedis() {
  logger.info('Checking Redis...');
  
  try {
    // Check if Redis is installed
    execSync('redis-cli --version', { stdio: 'pipe' });
    logger.info('Redis CLI is installed');
    
    // Ask user if they want to start Redis
    const startRedis = await question('Do you want to ensure Redis is running? (y/n): ');
    if (startRedis.toLowerCase() === 'y') {
      try {
        logger.info('Attempting to start Redis...');
        // This is Windows-specific, adjust for other platforms
        execSync('redis-server --service-start', { stdio: 'pipe' });
        logger.info('Redis service started');
      } catch (error) {
        logger.warn(`Could not start Redis service: ${error.message}`);
        logger.info('You may need to start Redis manually');
      }
    }
  } catch (error) {
    logger.warn(`Redis may not be installed: ${error.message}`);
    logger.info('The application can run without Redis using in-memory fallbacks');
    
    // Update .env to use in-memory cache
    const envPath = path.join(process.cwd(), '.env');
    if (fs.existsSync(envPath)) {
      let envContent = fs.readFileSync(envPath, 'utf8');
      if (!envContent.includes('USE_IN_MEMORY_CACHE=')) {
        envContent += '\nUSE_IN_MEMORY_CACHE=true\n';
        fs.writeFileSync(envPath, envContent);
        logger.info('Updated .env to use in-memory cache');
      }
    }
  }
}

// Fix Node.js dependencies
async function fixNodeDependencies() {
  logger.info('Checking Node.js dependencies...');
  
  // Check if node_modules exists
  const nodeModulesPath = path.join(process.cwd(), 'node_modules');
  if (!fs.existsSync(nodeModulesPath)) {
    logger.info('node_modules directory not found, running npm install...');
    
    try {
      execSync('npm install', { stdio: 'inherit' });
      logger.info('npm install completed successfully');
    } catch (error) {
      logger.error(`Error running npm install: ${error.message}`);
    }
  } else {
    logger.info('node_modules directory exists');
    
    // Check for critical dependencies
    const criticalDeps = [
      'python-shell',
      'mongodb',
      'ioredis',
      'redis',
      'ws',
      'express'
    ];
    
    const missingDeps = [];
    
    for (const dep of criticalDeps) {
      const depPath = path.join(nodeModulesPath, dep);
      if (!fs.existsSync(depPath)) {
        missingDeps.push(dep);
      }
    }
    
    if (missingDeps.length > 0) {
      logger.info(`Missing dependencies: ${missingDeps.join(', ')}`);
      logger.info('Installing missing dependencies...');
      
      try {
        execSync(`npm install ${missingDeps.join(' ')}`, { stdio: 'inherit' });
        logger.info('Dependencies installed successfully');
      } catch (error) {
        logger.error(`Error installing dependencies: ${error.message}`);
      }
    } else {
      logger.info('All critical dependencies are installed');
    }
  }
}

// Main fix function
async function fixEnvironment() {
  logger.info('Starting environment fix...');
  logger.info('Timestamp: ' + new Date().toISOString());
  
  try {
    // Step 1: Ensure logs directory exists
    ensureLogsDirectory();
    
    // Step 2: Detect Python path
    const pythonPath = await detectPythonPath();
    
    // Step 3: Update .env file
    await updateEnvFile(pythonPath);
    
    // Step 4: Install required Python packages
    await installPythonPackages(pythonPath);
    
    // Step 5: Fix file permissions
    fixFilePermissions();
    
    // Step 6: Check and fix MongoDB
    await checkAndFixMongoDB();
    
    // Step 7: Check and fix Redis
    await checkAndFixRedis();
    
    // Step 8: Fix Node.js dependencies
    await fixNodeDependencies();
    
    logger.info('Environment fix completed successfully');
    logger.info('You can now try running the application with: npm start');
  } catch (error) {
    logger.error(`Environment fix failed: ${error.message}`);
    logger.error(error.stack);
  } finally {
    // Close readline interface
    rl.close();
  }
}

// Run fix if this script is executed directly
if (require.main === module) {
  fixEnvironment()
    .then(() => {
      logger.info('Fix completed');
    })
    .catch(error => {
      logger.error(`Fix failed: ${error.message}`);
      process.exit(1);
    });
}

module.exports = {
  fixEnvironment,
  detectPythonPath,
  updateEnvFile,
  installPythonPackages,
  ensureLogsDirectory,
  fixFilePermissions,
  checkAndFixMongoDB,
  checkAndFixRedis,
  fixNodeDependencies
};// scripts/fix-environment.js
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');
const winston = require('winston');
const readline = require('readline');

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
    new winston.transports.File({ filename: 'environment-fix.log' })
  ]
});

// Create readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Promisify readline question
function question(query) {
  return new Promise(resolve => {
    rl.question(query, answer => {
      resolve(answer);
    });
  });
}

// Detect Python executable path
async function detectPythonPath() {
  logger.info('Detecting Python executable path...');
  
  // Check environment variables first
  const envPath = process.env.PYTHON_PATH || process.env.PYTHON_EXECUTABLE;
  if (envPath && fs.existsSync(envPath)) {
    logger.info(`Found Python path in environment variables: ${envPath}`);
    return envPath;
  }
  
  // Check common paths based on platform
  const isWindows = process.platform === 'win32';
  
  if (isWindows) {
    // Common Windows Python paths
    const commonWindowsPaths = [
      // Python 3 paths
      'C:\\Python39\\python.exe',
      'C:\\Python310\\python.exe',
      'C:\\Python311\\python.exe',
      'C:\\Python312\\python.exe',
      // Python launcher
      'C:\\Windows\\py.exe',
      // Anaconda/Miniconda paths
      'C:\\ProgramData\\Anaconda3\\python.exe',
      'C:\\ProgramData\\miniconda3\\python.exe',
      // User profile paths
      `${process.env.USERPROFILE}\\AppData\\Local\\Programs\\Python\\Python39\\python.exe`,
      `${process.env.USERPROFILE}\\AppData\\Local\\Programs\\Python\\Python310\\python.exe`,
      `${process.env.USERPROFILE}\\AppData\\Local\\Programs\\Python\\Python311\\python.exe`,
      `${process.env.USERPROFILE}\\AppData\\Local\\Programs\\Python\\Python312\\python.exe`,
    ];
    
    for (const pythonPath of commonWindowsPaths) {
      try {
        if (fs.existsSync(pythonPath)) {
          logger.info(`Found Python at: ${pythonPath}`);
          return pythonPath;
        }
      } catch (e) {
        // Ignore errors and continue checking
      }
    }
  } else {
    // On Unix-like systems, we can try to use the 'which' command
    try {
      const pythonPath = execSync('which python3 || which python').toString().trim();
      if (pythonPath) {
        logger.info(`Found Python at: ${pythonPath}`);
        return pythonPath;
      }
    } catch (e) {
      // Ignore errors and fall back to default
    }
  }
  
  // Try to find Python in PATH
  try {
    const pythonPath = execSync('where python', { encoding: 'utf8' }).trim().split('\n')[0];
    logger.info(`Found Python in PATH: ${pythonPath}`);
    return pythonPath;
  } catch (e) {
    // Ignore errors and continue
  }
  
  // Try Python launcher
  try {
    const pyPath = execSync('where py', { encoding: 'utf8' }).trim().split('\n')[0];
    logger.info(`Found Python launcher: ${pyPath}`);
    return pyPath;
  } catch (e) {
    // Ignore errors and continue
  }
  
  // Ask user for Python path
  logger.warn('Could not automatically detect Python path');
  const userPath = await question('Please enter the full path to your Python executable: ');
  
  if (userPath && fs.existsSync(userPath)) {
    logger.info(`Using user-provided Python path: ${userPath}`);
    return userPath;
  }
  
  logger.error('No valid Python path found. Please install Python and try again.');
  return 'python'; // Default fallback
}

// Update .env file with correct configuration
async function updateEnvFile(pythonPath) {
  logger.info('Updating .env file...');
  
  const envPath = path.join(process.cwd(), '.env');
  let envContent = '';
  
  // Create default .env content
  const defaultEnv = `# Python Configuration
PYTHON_PATH=${pythonPath}
PYTHON_EXECUTABLE=${pythonPath}
PYTHON_BRIDGE_MAX_RETRIES=3
PYTHON_EXECUTION_TIMEOUT=60000

# Server Configuration
PORT=5000
HOST=localhost
NODE_ENV=development
LOG_LEVEL=info

# Database Configuration
MONGODB_URI=mongodb://localhost:27017/sports-analytics
MONGODB_DB_NAME=sports-analytics
DB_MAX_POOL_SIZE=50
DB_MIN_POOL_SIZE=10
CONNECT_TIMEOUT_MS=30000
SOCKET_TIMEOUT_MS=45000

# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_CONNECT_TIMEOUT=10000
REDIS_ENABLE_OFFLINE_QUEUE=true
REDIS_MAX_RETRIES=3
REDIS_RETRY_STRATEGY_MAX_DELAY=2000

# Cache Configuration
CACHE_TTL=1800
CACHE_MAX_ITEMS=500
CACHE_CHECK_PERIOD=300

# WebSocket Configuration
WS_PORT=5150
WS_PATH=/ws
WS_HEARTBEAT_INTERVAL=60000
WS_CLIENT_TIMEOUT=35000
WS_MAX_PAYLOAD=52428800

# Performance Configuration
MEMORY_USAGE_THRESHOLD=0.80
CPU_LOAD_THRESHOLD=0.80
NETWORK_TRAFFIC_THRESHOLD=52428800
HEALTH_CHECK_INTERVAL=300000
METRICS_INTERVAL=300000
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX=50
MAX_CONNECTIONS_PER_IP=50
COMPRESSION_LEVEL=6
COMPRESSION_THRESHOLD=1024

# Security Configuration
JWT_SECRET=your-secret-key-here
JWT_EXPIRATION=86400
CORS_ORIGIN=http://localhost:5000`;
  
  // Check if .env file exists
  if (fs.existsSync(envPath)) {
    logger.info('.env file exists, updating...');
    envContent = fs.readFileSync(envPath, 'utf8');
    
    // Update Python path
    if (envContent.includes('PYTHON_PATH=')) {
      envContent = envContent.replace(/PYTHON_PATH=.*(\r?\n|$)/g, `PYTHON_PATH=${pythonPath}$1`);
    } else {
      envContent += `\nPYTHON_PATH=${pythonPath}\n`;
    }
    
    // Update Python executable
    if (envContent.includes('PYTHON_EXECUTABLE=')) {
      envContent = envContent.replace(/PYTHON_EXECUTABLE=.*(\r?\n|$)/g, `PYTHON_EXECUTABLE=${pythonPath}$1`);
    } else {
      envContent += `PYTHON_EXECUTABLE=${pythonPath}\n`;
    }
    
    // Ensure other critical variables are present
    const criticalVars = [
      'MONGODB_URI', 'REDIS_HOST', 'REDIS_PORT', 'PORT', 'WS_PORT'
    ];
    
    criticalVars.forEach(varName => {
      if (!envContent.includes(`${varName}=`)) {
        const defaultLine = defaultEnv.split('\n').find(line => line.startsWith(`${varName}=`));
        if (defaultLine) {
          envContent += `\n${defaultLine}\n`;
        }
      }
    });
  } else {
    logger.info('.env file does not exist, creating...');
    envContent = defaultEnv;
  }
  
  // Write updated content to .env file
  fs.writeFileSync(envPath, envContent);
  logger.info('.env file updated successfully');
  
  return envContent;
}

// Install required Python packages
async function installPythonPackages(pythonPath) {
  logger.info('Installing required Python packages...');
  
  const requiredPackages = [
    'numpy',
    'pandas',
    'scikit-learn==1.0.2',
    'matplotlib==3.5.2',
    'xgboost==1.6.1',
    'lightgbm==3.3.2',
    'hyperopt==0.2.7',
    'pymongo==4.1.1',
    'python-dotenv==0.20.0',
    'redis==4.3.4',
    'prometheus-client==0.14.1',
    'psutil==5.9.1',
    'cachetools'
  ];
  
  // Check which packages are already installed
  const installedPackages = [];
  const missingPackages = [];
  
  for (const pkg of requiredPackages) {
    const pkgName = pkg.split('==')[0];
    try {
      execSync(`"${pythonPath}" -c "import ${pkgName}; print(f'${pkgName} is installed')"`, { encoding: 'utf8' });
      installedPackages.push(pkg);
    } catch (e) {
      missingPackages.push(pkg);
    }
  }
  
  logger.info(`Already installed: ${installedPackages.join(', ')}`);
  logger.info(`Missing packages: ${missingPackages.join(', ')}`);
  
  if (missingPackages.length === 0) {
    logger.info('All required Python packages are already installed');
    return true;
  }
  
  // Install missing packages
  try {
    logger.info('Installing pip and setuptools...');
    execSync(`"${pythonPath}" -m pip install --upgrade pip setuptools wheel`, { stdio: 'inherit' });
    
    for (const pkg of missingPackages) {
      logger.info(`Installing ${pkg}...`);
      execSync(`"${pythonPath}" -m pip install ${pkg}`, { stdio: 'inherit' });
    }
    
    logger.info('All Python packages installed successfully');
    return true;
  } catch (error) {
    logger.error(`Error installing Python packages: ${error.message}`);
    return false;
  }
}

// Create logs directory if it doesn't exist
function ensureLogsDirectory() {
  const logsDir = path.join(process.cwd(), 'logs');
  if (!fs.existsSync(logsDir)) {
    logger.info(`Creating logs directory at: ${logsDir}`);
    fs.mkdirSync(logsDir, { recursive: true });
  }
}

// Fix file permissions
function fixFilePermissions() {
  logger.info('Fixing file permissions...');
  
  const scriptsDir = path.join(process.cwd(), 'scripts');
  if (fs.existsSync(scriptsDir)) {
    const files = fs.readdirSync(scriptsDir);
    const pythonScripts = files.filter(file => file.endsWith('.py'));
    
    pythonScripts.forEach(script => {
      const scriptPath = path.join(scriptsDir, script);
      try {
        // Make Python scripts executable
        fs.chmodSync(scriptPath, 0o755);
        logger.info(`Made ${script} executable`);
      } catch (error) {
        logger.error(`Error setting permissions for ${script}: ${error.message}`);
      }
    });
  }
}

// Check and fix MongoDB
async function checkAndFixMongoDB() {
  logger.info('Checking MongoDB...');
  
  try {
    // Check if MongoDB is running
    execSync('mongod --version', { stdio: 'pipe' });
    logger.info('MongoDB is installed');
    
    // Ask user if they want to start MongoDB
    const startMongo = await question('Do you want to ensure MongoDB is running? (y/n): ');
    if (startMongo.toLowerCase() === 'y') {
      try {
        logger.info('Attempting to start MongoDB...');
        execSync('net start MongoDB', { stdio: 'pipe' });
        logger.info('MongoDB service started');
      } catch (error) {
        logger.warn(`Could not start MongoDB service: ${error.message}`);
        logger.info('You may need to start MongoDB manually');
      }
    }
  } catch (error) {
    logger.warn(`MongoDB may not be installed: ${error.message}`);
    logger.info('Please install MongoDB to use this application');
  }
}

// Check and fix Redis
async function checkAndFixRedis() {
  logger.info('Checking Redis...');
  
  try {
    // Check if Redis is installed
    execSync('redis-cli --version', { stdio: 'pipe' });
    logger.info('Redis CLI is installed');
    
    // Ask user if they want to start Redis
    const startRedis = await question('Do you want to ensure Redis is running? (y/n): ');
    if (startRedis.toLowerCase() === 'y') {
      try {
        logger.info('Attempting to start Redis...');
        // This is Windows-specific, adjust for other platforms
        execSync('redis-server --service-start', { stdio: 'pipe' });
        logger.info('Redis service started');
      } catch (error) {
        logger.warn(`Could not start Redis service: ${error.message}`);
        logger.info('You may need to start Redis manually');
      }
    }
  } catch (error) {
    logger.warn(`Redis may not be installed: ${error.message}`);
    logger.info('The application can run without Redis using in-memory fallbacks');
    
    // Update .env to use in-memory cache
    const envPath = path.join(process.cwd(), '.env');
    if (fs.existsSync(envPath)) {
      let envContent = fs.readFileSync(envPath, 'utf8');
      if (!envContent.includes('USE_IN_MEMORY_CACHE=')) {
        envContent += '\nUSE_IN_MEMORY_CACHE=true\n';
        fs.writeFileSync(envPath, envContent);
        logger.info('Updated .env to use in-memory cache');
      }
    }
  }
}

// Fix Node.js dependencies
async function fixNodeDependencies() {
  logger.info('Checking Node.js dependencies...');
  
  // Check if node_modules exists
  const nodeModulesPath = path.join(process.cwd(), 'node_modules');
  if (!fs.existsSync(nodeModulesPath)) {
    logger.info('node_modules directory not found, running npm install...');
    
    try {
      execSync('npm install', { stdio: 'inherit' });
      logger.info('npm install completed successfully');
    } catch (error) {
      logger.error(`Error running npm install: ${error.message}`);
    }
  } else {
    logger.info('node_modules directory exists');
    
    // Check for critical dependencies
    const criticalDeps = [
      'python-shell',
      'mongodb',
      'ioredis',
      'redis',
      'ws',
      'express'
    ];
    
    const missingDeps = [];
    
    for (const dep of criticalDeps) {
      const depPath = path.join(nodeModulesPath, dep);
      if (!fs.existsSync(depPath)) {
        missingDeps.push(dep);
      }
    }
    
    if (missingDeps.length > 0) {
      logger.info(`Missing dependencies: ${missingDeps.join(', ')}`);
      logger.info('Installing missing dependencies...');
      
      try {
        execSync(`npm install ${missingDeps.join(' ')}`, { stdio: 'inherit' });
        logger.info('Dependencies installed successfully');
      } catch (error) {
        logger.error(`Error installing dependencies: ${error.message}`);
      }
    } else {
      logger.info('All critical dependencies are installed');
    }
  }
}

// Main fix function
async function fixEnvironment() {
  logger.info('Starting environment fix...');
  logger.info('Timestamp: ' + new Date().toISOString());
  
  try {
    // Step 1: Ensure logs directory exists
    ensureLogsDirectory();
    
    // Step 2: Detect Python path
    const pythonPath = await detectPythonPath();
    
    // Step 3: Update .env file
    await updateEnvFile(pythonPath);
    
    // Step 4: Install required Python packages
    await installPythonPackages(pythonPath);
    
    // Step 5: Fix file permissions
    fixFilePermissions();
    
    // Step 6: Check and fix MongoDB
    await checkAndFixMongoDB();
    
    // Step 7: Check and fix Redis
    await checkAndFixRedis();
    
    // Step 8: Fix Node.js dependencies
    await fixNodeDependencies();
    
    logger.info('Environment fix completed successfully');
    logger.info('You can now try running the application with: npm start');
  } catch (error) {
    logger.error(`Environment fix failed: ${error.message}`);
    logger.error(error.stack);
  } finally {
    // Close readline interface
    rl.close();
  }
}

// Run fix if this script is executed directly
if (require.main === module) {
  fixEnvironment()
    .then(() => {
      logger.info('Fix completed');
    })
    .catch(error => {
      logger.error(`Fix failed: ${error.message}`);
      process.exit(1);
    });
}

module.exports = {
  fixEnvironment,
  detectPythonPath,
  updateEnvFile,
  installPythonPackages,
  ensureLogsDirectory,
  fixFilePermissions,
  checkAndFixMongoDB,
  checkAndFixRedis,
  fixNodeDependencies
};// scripts/fix-environment.js
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');
const winston = require('winston');
const readline = require('readline');

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
    new winston.transports.File({ filename: 'environment-fix.log' })
  ]
});

// Create readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Promisify readline question
function question(query) {
  return new Promise(resolve => {
    rl.question(query, answer => {
      resolve(answer);
    });
  });
}

// Detect Python executable path
async function detectPythonPath() {
  logger.info('Detecting Python executable path...');
  
  // Check environment variables first
  const envPath = process.env.PYTHON_PATH || process.env.PYTHON_EXECUTABLE;
  if (envPath && fs.existsSync(envPath)) {
    logger.info(`Found Python path in environment variables: ${envPath}`);
    return envPath;
  }
  
  // Check common paths based on platform
  const isWindows = process.platform === 'win32';
  
  if (isWindows) {
    // Common Windows Python paths
    const commonWindowsPaths = [
      // Python 3 paths
      'C:\\Python39\\python.exe',
      'C:\\Python310\\python.exe',
      'C:\\Python311\\python.exe',
      'C:\\Python312\\python.exe',
      // Python launcher
      'C:\\Windows\\py.exe',
      // Anaconda/Miniconda paths
      'C:\\ProgramData\\Anaconda3\\python.exe',
      'C:\\ProgramData\\miniconda3\\python.exe',
      // User profile paths
      `${process.env.USERPROFILE}\\AppData\\Local\\Programs\\Python\\Python39\\python.exe`,
      `${process.env.USERPROFILE}\\AppData\\Local\\Programs\\Python\\Python310\\python.exe`,
      `${process.env.USERPROFILE}\\AppData\\Local\\Programs\\Python\\Python311\\python.exe`,
      `${process.env.USERPROFILE}\\AppData\\Local\\Programs\\Python\\Python312\\python.exe`,
    ];
    
    for (const pythonPath of commonWindowsPaths) {
      try {
        if (fs.existsSync(pythonPath)) {
          logger.info(`Found Python at: ${pythonPath}`);
          return pythonPath;
        }
      } catch (e) {
        // Ignore errors and continue checking
      }
    }
  } else {
    // On Unix-like systems, we can try to use the 'which' command
    try {
      const pythonPath = execSync('which python3 || which python').toString().trim();
      if (pythonPath) {
        logger.info(`Found Python at: ${pythonPath}`);
        return pythonPath;
      }
    } catch (e) {
      // Ignore errors and fall back to default
    }
  }
  
  // Try to find Python in PATH
  try {
    const pythonPath = execSync('where python', { encoding: 'utf8' }).trim().split('\n')[0];
    logger.info(`Found Python in PATH: ${pythonPath}`);
    return pythonPath;
  } catch (e) {
    // Ignore errors and continue
  }
  
  // Try Python launcher
  try {
    const pyPath = execSync('where py', { encoding: 'utf8' }).trim().split('\n')[0];
    logger.info(`Found Python launcher: ${pyPath}`);
    return pyPath;
  } catch (e) {
    // Ignore errors and continue
  }
  
  // Ask user for Python path
  logger.warn('Could not automatically detect Python path');
  const userPath = await question('Please enter the full path to your Python executable: ');
  
  if (userPath && fs.existsSync(userPath)) {
    logger.info(`Using user-provided Python path: ${userPath}`);
    return userPath;
  }
  
  logger.error('No valid Python path found. Please install Python and try again.');
  return 'python'; // Default fallback
}

// Update .env file with correct configuration
async function updateEnvFile(pythonPath) {
  logger.info('Updating .env file...');
  
  const envPath = path.join(process.cwd(), '.env');
  let envContent = '';
  
  // Create default .env content
  const defaultEnv = `# Python Configuration
PYTHON_PATH=${pythonPath}
PYTHON_EXECUTABLE=${pythonPath}
PYTHON_BRIDGE_MAX_RETRIES=3
PYTHON_EXECUTION_TIMEOUT=60000

# Server Configuration
PORT=5000
HOST=localhost
NODE_ENV=development
LOG_LEVEL=info

# Database Configuration
MONGODB_URI=mongodb://localhost:27017/sports-analytics
MONGODB_DB_NAME=sports-analytics
DB_MAX_POOL_SIZE=50
DB_MIN_POOL_SIZE=10
CONNECT_TIMEOUT_MS=30000
SOCKET_TIMEOUT_MS=45000

# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_CONNECT_TIMEOUT=10000
REDIS_ENABLE_OFFLINE_QUEUE=true
REDIS_MAX_RETRIES=3
REDIS_RETRY_STRATEGY_MAX_DELAY=2000

# Cache Configuration
CACHE_TTL=1800
CACHE_MAX_ITEMS=500
CACHE_CHECK_PERIOD=300

# WebSocket Configuration
WS_PORT=5150
WS_PATH=/ws
WS_HEARTBEAT_INTERVAL=60000
WS_CLIENT_TIMEOUT=35000
WS_MAX_PAYLOAD=52428800

# Performance Configuration
MEMORY_USAGE_THRESHOLD=0.80
CPU_LOAD_THRESHOLD=0.80
NETWORK_TRAFFIC_THRESHOLD=52428800
HEALTH_CHECK_INTERVAL=300000
METRICS_INTERVAL=300000
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX=50
MAX_CONNECTIONS_PER_IP=50
COMPRESSION_LEVEL=6
COMPRESSION_THRESHOLD=1024

# Security Configuration
JWT_SECRET=your-secret-key-here
JWT_EXPIRATION=86400
CORS_ORIGIN=http://localhost:5000`;
  
  // Check if .env file exists
  if (fs.existsSync(envPath)) {
    logger.info('.env file exists, updating...');
    envContent = fs.readFileSync(envPath, 'utf8');
    
    // Update Python path
    if (envContent.includes('PYTHON_PATH=')) {
      envContent = envContent.replace(/PYTHON_PATH=.*(\r?\n|$)/g, `PYTHON_PATH=${pythonPath}$1`);
    } else {
      envContent += `\nPYTHON_PATH=${pythonPath}\n`;
    }
    
    // Update Python executable
    if (envContent.includes('PYTHON_EXECUTABLE=')) {
      envContent = envContent.replace(/PYTHON_EXECUTABLE=.*(\r?\n|$)/g, `PYTHON_EXECUTABLE=${pythonPath}$1`);
    } else {
      envContent += `PYTHON_EXECUTABLE=${pythonPath}\n`;
    }
    
    // Ensure other critical variables are present
    const criticalVars = [
      'MONGODB_URI', 'REDIS_HOST', 'REDIS_PORT', 'PORT', 'WS_PORT'
    ];
    
    criticalVars.forEach(varName => {
      if (!envContent.includes(`${varName}=`)) {
        const defaultLine = defaultEnv.split('\n').find(line => line.startsWith(`${varName}=`));
        if (defaultLine) {
          envContent += `\n${defaultLine}\n`;
        }
      }
    });
  } else {
    logger.info('.env file does not exist, creating...');
    envContent = defaultEnv;
  }
  
  // Write updated content to .env file
  fs.writeFileSync(envPath, envContent);
  logger.info('.env file updated successfully');
  
  return envContent;
}

// Install required Python packages
async function installPythonPackages(pythonPath) {
  logger.info('Installing required Python packages...');
  
  const requiredPackages = [
    'numpy',
    'pandas',
    'scikit-learn==1.0.2',
    'matplotlib==3.5.2',
    'xgboost==1.6.1',
    'lightgbm==3.3.2',
    'hyperopt==0.2.7',
    'pymongo==4.1.1',
    'python-dotenv==0.20.0',
    'redis==4.3.4',
    'prometheus-client==0.14.1',
    'psutil==5.9.1',
    'cachetools'
  ];
  
  // Check which packages are already installed
  const installedPackages = [];
  const missingPackages = [];
  
  for (const pkg of requiredPackages) {
    const pkgName = pkg.split('==')[0];
    try {
      execSync(`"${pythonPath}" -c "import ${pkgName}; print(f'${pkgName} is installed')"`, { encoding: 'utf8' });
      installedPackages.push(pkg);
    } catch (e) {
      missingPackages.push(pkg);
    }
  }
  
  logger.info(`Already installed: ${installedPackages.join(', ')}`);
  logger.info(`Missing packages: ${missingPackages.join(', ')}`);
  
  if (missingPackages.length === 0) {
    logger.info('All required Python packages are already installed');
    return true;
  }
  
  // Install missing packages
  try {
    logger.info('Installing pip and setuptools...');
    execSync(`"${pythonPath}" -m pip install --upgrade pip setuptools wheel`, { stdio: 'inherit' });
    
    for (const pkg of missingPackages) {
      logger.info(`Installing ${pkg}...`);
      execSync(`"${pythonPath}" -m pip install ${pkg}`, { stdio: 'inherit' });
    }
    
    logger.info('All Python packages installed successfully');
    return true;
  } catch (error) {
    logger.error(`Error installing Python packages: ${error.message}`);
    return false;
  }
}

// Create logs directory if it doesn't exist
function ensureLogsDirectory() {
  const logsDir = path.join(process.cwd(), 'logs');
  if (!fs.existsSync(logsDir)) {
    logger.info(`Creating logs directory at: ${logsDir}`);
    fs.mkdirSync(logsDir, { recursive: true });
  }
}

// Fix file permissions
function fixFilePermissions() {
  logger.info('Fixing file permissions...');
  
  const scriptsDir = path.join(process.cwd(), 'scripts');
  if (fs.existsSync(scriptsDir)) {
    const files = fs.readdirSync(scriptsDir);
    const pythonScripts = files.filter(file => file.endsWith('.py'));
    
    pythonScripts.forEach(script => {
      const scriptPath = path.join(scriptsDir, script);
      try {
        // Make Python scripts executable
        fs.chmodSync(scriptPath, 0o755);
        logger.info(`Made ${script} executable`);
      } catch (error) {
        logger.error(`Error setting permissions for ${script}: ${error.message}`);
      }
    });
  }
}

// Check and fix MongoDB
async function checkAndFixMongoDB() {
  logger.info('Checking MongoDB...');
  
  try {
    // Check if MongoDB is running
    execSync('mongod --version', { stdio: 'pipe' });
    logger.info('MongoDB is installed');
    
    // Ask user if they want to start MongoDB
    const startMongo = await question('Do you want to ensure MongoDB is running? (y/n): ');
    if (startMongo.toLowerCase() === 'y') {
      try {
        logger.info('Attempting to start MongoDB...');
        execSync('net start MongoDB', { stdio: 'pipe' });
        logger.info('MongoDB service started');
      } catch (error) {
        logger.warn(`Could not start MongoDB service: ${error.message}`);
        logger.info('You may need to start MongoDB manually');
      }
    }
  } catch (error) {
    logger.warn(`MongoDB may not be installed: ${error.message}`);
    logger.info('Please install MongoDB to use this application');
  }
}

// Check and fix Redis
async function checkAndFixRedis() {
  logger.info('Checking Redis...');
  
  try {
    // Check if Redis is installed
    execSync('redis-cli --version', { stdio: 'pipe' });
    logger.info('Redis CLI is installed');
    
    // Ask user if they want to start Redis
    const startRedis = await question('Do you want to ensure Redis is running? (y/n): ');
    if (startRedis.toLowerCase() === 'y') {
      try {
        logger.info('Attempting to start Redis...');
        // This is Windows-specific, adjust for other platforms
        execSync('redis-server --service-start', { stdio: 'pipe' });
        logger.info('Redis service started');
      } catch (error) {
        logger.warn(`Could not start Redis service: ${error.message}`);
        logger.info('You may need to start Redis manually');
      }
    }
  } catch (error) {
    logger.warn(`Redis may not be installed: ${error.message}`);
    logger.info('The application can run without Redis using in-memory fallbacks');
    
    // Update .env to use in-memory cache
    const envPath = path.join(process.cwd(), '.env');
    if (fs.existsSync(envPath)) {
      let envContent = fs.readFileSync(envPath, 'utf8');
      if (!envContent.includes('USE_IN_MEMORY_CACHE=')) {
        envContent += '\nUSE_IN_MEMORY_CACHE=true\n';
        fs.writeFileSync(envPath, envContent);
        logger.info('Updated .env to use in-memory cache');
      }
    }
  }
}

// Fix Node.js dependencies
async function fixNodeDependencies() {
  logger.info('Checking Node.js dependencies...');
  
  // Check if node_modules exists
  const nodeModulesPath = path.join(process.cwd(), 'node_modules');
  if (!fs.existsSync(nodeModulesPath)) {
    logger.info('node_modules directory not found, running npm install...');
    
    try {
      execSync('npm install', { stdio: 'inherit' });
      logger.info('npm install completed successfully');
    } catch (error) {
      logger.error(`Error running npm install: ${error.message}`);
    }
  } else {
    logger.info('node_modules directory exists');
    
    // Check for critical dependencies
    const criticalDeps = [
      'python-shell',
      'mongodb',
      'ioredis',
      'redis',
      'ws',
      'express'
    ];
    
    const missingDeps = [];
    
    for (const dep of criticalDeps) {
      const depPath = path.join(nodeModulesPath, dep);
      if (!fs.existsSync(depPath)) {
        missingDeps.push(dep);
      }
    }
    
    if (missingDeps.length > 0) {
      logger.info(`Missing dependencies: ${missingDeps.join(', ')}`);
      logger.info('Installing missing dependencies...');
      
      try {
        execSync(`npm install ${missingDeps.join(' ')}`, { stdio: 'inherit' });
        logger.info('Dependencies installed successfully');
      } catch (error) {
        logger.error(`Error installing dependencies: ${error.message}`);
      }
    } else {
      logger.info('All critical dependencies are installed');
    }
  }
}

// Main fix function
async function fixEnvironment() {
  logger.info('Starting environment fix...');
  logger.info('Timestamp: ' + new Date().toISOString());
  
  try {
    // Step 1: Ensure logs directory exists
    ensureLogsDirectory();
    
    // Step 2: Detect Python path
    const pythonPath = await detectPythonPath();
    
    // Step 3: Update .env file
    await updateEnvFile(pythonPath);
    
    // Step 4: Install required Python packages
    await installPythonPackages(pythonPath);
    
    // Step 5: Fix file permissions
    fixFilePermissions();
    
    // Step 6: Check and fix MongoDB
    await checkAndFixMongoDB();
    
    // Step 7: Check and fix Redis
    await checkAndFixRedis();
    
    // Step 8: Fix Node.js dependencies
    await fixNodeDependencies();
    
    logger.info('Environment fix completed successfully');
    logger.info('You can now try running the application with: npm start');
  } catch (error) {
    logger.error(`Environment fix failed: ${error.message}`);
    logger.error(error.stack);
  } finally {
    // Close readline interface
    rl.close();
  }
}

// Run fix if this script is executed directly
if (require.main === module) {
  fixEnvironment()
    .then(() => {
      logger.info('Fix completed');
    })
    .catch(error => {
      logger.error(`Fix failed: ${error.message}`);
      process.exit(1);
    });
}

module.exports = {
  fixEnvironment,
  detectPythonPath,
  updateEnvFile,
  installPythonPackages,
  ensureLogsDirectory,
  fixFilePermissions,
  checkAndFixMongoDB,
  checkAndFixRedis,
  fixNodeDependencies
};