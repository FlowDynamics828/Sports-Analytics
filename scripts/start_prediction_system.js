/**
 * Sports Analytics Prediction System Startup Script
 * Ensures all required services are running and properly configured
 */

const { spawn, exec } = require('child_process');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Configuration
const config = {
  pythonPath: process.env.PYTHON_PATH || 'python',
  apiScript: 'scripts/premium_prediction_api.py',
  serverPort: process.env.PORT || 8000,
  redisRequired: true,
  mongoRequired: true,
  checkDirs: [
    'data',
    'data/embeddings',
    'models',
    'models/nlp',
    'cache',
    'logs'
  ]
};

// Store process references
const childProcesses = [];

/**
 * Check if a service is running
 */
async function isServiceRunning(serviceName) {
  return new Promise((resolve) => {
    const platform = process.platform;
    let command = '';
    
    if (platform === 'win32') {
      command = `sc query ${serviceName}`;
    } else if (platform === 'darwin') {
      command = `ps aux | grep -v grep | grep ${serviceName}`;
    } else {
      command = `systemctl is-active ${serviceName}`;
    }
    
    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.log(`${serviceName} is not running`);
        resolve(false);
        return;
      }
      
      if (platform === 'win32') {
        resolve(stdout.includes('RUNNING'));
      } else if (platform === 'darwin') {
        resolve(stdout.trim() !== '');
      } else {
        resolve(stdout.trim() === 'active');
      }
    });
  });
}

/**
 * Check if Redis is running
 */
async function checkRedis() {
  try {
    const redis = require('redis');
    const client = redis.createClient({
      url: process.env.REDIS_URL || 'redis://localhost:6379'
    });
    
    await client.connect();
    console.log('✅ Redis is running and accessible');
    await client.disconnect();
    return true;
  } catch (error) {
    console.error('❌ Redis connection failed:', error.message);
    
    // Try to check if Redis service is running
    const isRunning = await isServiceRunning('redis');
    if (!isRunning && config.redisRequired) {
      console.error('Redis service is not running. Trying to start Docker container...');
      
      try {
        // Try to start Redis via Docker
        await new Promise((resolve, reject) => {
          exec('docker run -d --name redis-cache -p 6379:6379 redis', (error, stdout, stderr) => {
            if (error) {
              console.error('Failed to start Redis Docker container:', error.message);
              reject(error);
              return;
            }
            console.log('Started Redis in Docker container:', stdout.trim());
            resolve(stdout);
          });
        });
        
        // Wait for Redis to start up
        await new Promise(resolve => setTimeout(resolve, 3000));
        console.log('Redis should be available now');
        return true;
      } catch (dockerError) {
        console.error('Could not start Redis in Docker. Please ensure Redis is installed and running.');
        if (config.redisRequired) {
          console.error('Redis is required. Exiting...');
          process.exit(1);
        }
      }
    }
    
    return false;
  }
}

/**
 * Check if MongoDB is running
 */
async function checkMongoDB() {
  try {
    const { MongoClient } = require('mongodb');
    const uri = process.env.MONGO_URI || 'mongodb://localhost:27017';
    const client = new MongoClient(uri);
    
    await client.connect();
    console.log('✅ MongoDB is running and accessible');
    await client.close();
    return true;
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error.message);
    
    // Try to check if MongoDB service is running
    const isRunning = await isServiceRunning('mongodb');
    if (!isRunning && config.mongoRequired) {
      console.error('MongoDB service is not running');
      if (config.mongoRequired) {
        console.error('MongoDB is required. Please start MongoDB service and try again.');
        process.exit(1);
      }
    }
    
    return false;
  }
}

/**
 * Check required directories
 */
function checkDirectories() {
  for (const dir of config.checkDirs) {
    if (!fs.existsSync(dir)) {
      console.log(`Creating directory: ${dir}`);
      fs.mkdirSync(dir, { recursive: true });
    }
  }
  console.log('✅ Required directories exist');
}

/**
 * Run Python script with proper error handling
 */
function runPythonScript(scriptPath, args = []) {
  return new Promise((resolve, reject) => {
    const fullPath = path.resolve(scriptPath);
    
    if (!fs.existsSync(fullPath)) {
      console.error(`❌ Python script not found: ${fullPath}`);
      reject(new Error(`Script not found: ${fullPath}`));
      return;
    }
    
    console.log(`Starting Python script: ${fullPath}`);
    const pythonProcess = spawn(config.pythonPath, [fullPath, ...args], {
      stdio: 'inherit',
      shell: true
    });
    
    childProcesses.push(pythonProcess);
    
    pythonProcess.on('error', (error) => {
      console.error(`❌ Failed to start Python script: ${error.message}`);
      reject(error);
    });
    
    pythonProcess.on('exit', (code) => {
      if (code !== 0) {
        console.error(`❌ Python script exited with code ${code}`);
        reject(new Error(`Script exited with code ${code}`));
      } else {
        console.log(`✅ Python script completed successfully`);
        resolve();
      }
    });
  });
}

/**
 * Start the prediction API
 */
async function startPredictionAPI() {
  try {
    if (!fs.existsSync(config.apiScript)) {
      console.error(`❌ API script not found: ${config.apiScript}`);
      return false;
    }
    
    console.log(`Starting prediction API on port ${config.serverPort}...`);
    
    // Convert path to module format for Python
    const moduleFormat = config.apiScript.replace(/\\/g, '/').replace(/\.py$/, '').replace(/\//g, '.');
    
    const pythonProcess = spawn(config.pythonPath, ['-m', moduleFormat], {
      stdio: 'inherit',
      env: { ...process.env, PORT: config.serverPort }
    });
    
    childProcesses.push(pythonProcess);
    
    pythonProcess.on('error', (error) => {
      console.error(`❌ Failed to start prediction API: ${error.message}`);
      return false;
    });
    
    console.log(`✅ Prediction API started (PID: ${pythonProcess.pid})`);
    return true;
  } catch (error) {
    console.error(`❌ Error starting prediction API: ${error.message}`);
    return false;
  }
}

/**
 * Main function to start the system
 */
async function startSystem() {
  console.log('=================================================');
  console.log('   Sports Analytics Prediction System Startup');
  console.log('=================================================');
  
  try {
    // First check the required directories
    checkDirectories();
    
    // Check dependencies
    const redisOk = await checkRedis();
    const mongoOk = await checkMongoDB();
    
    // Start the API server
    if (redisOk || !config.redisRequired) {
      const apiStarted = await startPredictionAPI();
      
      if (apiStarted) {
        console.log('\nPrediction system is up and running!');
        console.log(`API server available at http://localhost:${config.serverPort}`);
        console.log(`GraphQL interface available at http://localhost:${config.serverPort}/graphql`);
      } else {
        console.error('Failed to start prediction system.');
      }
    } else {
      console.error('Required dependencies are not available. Please fix the issues and try again.');
    }
  } catch (error) {
    console.error('Error starting prediction system:', error.message);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down prediction system...');
  
  // Kill all child processes
  for (const proc of childProcesses) {
    proc.kill();
  }
  
  console.log('All processes terminated. Goodbye!');
  process.exit(0);
});

// Start the system
startSystem(); 