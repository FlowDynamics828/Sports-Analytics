/**
 * Comprehensive Startup Test Script
 * 
 * This script verifies that the server can start correctly with proper
 * MongoDB Atlas connection and data retrieval before proceeding to the visual phase.
 */

const { spawn } = require('child_process');
const axios = require('axios');
const { performance } = require('perf_hooks');
const fs = require('fs');
const path = require('path');

// Configuration
const PORT = process.env.PORT || 8000;
const SERVER_START_TIMEOUT = 30000; // 30 seconds
const API_BASE_URL = `http://localhost:${PORT}/api`;
const LOG_FILE = path.join('logs', 'startup-test.log');

// Ensure log directory exists
if (!fs.existsSync('logs')) {
  fs.mkdirSync('logs', { recursive: true });
}

// Test Results
const results = {
  serverStart: false,
  mongodbConnection: false,
  sportdbConnection: false,
  liveGamesManager: false,
  apiEndpoints: {
    health: false,
    leagues: false,
    teams: false,
    matches: false,
    liveGames: false
  }
};

// Create log stream
const logStream = fs.createWriteStream(LOG_FILE, { flags: 'a' });
const log = (message, level = 'INFO') => {
  const timestamp = new Date().toISOString();
  const formattedMessage = `[${timestamp}] [${level}] ${message}`;
  console.log(formattedMessage);
  logStream.write(formattedMessage + '\n');
};

/**
 * Start the server process
 * @returns {Promise<ChildProcess>} Server process
 */
function startServer() {
  log('Starting server...');
  
  return new Promise((resolve, reject) => {
    // Ensure environment variable to use Atlas
    process.env.MONGO_URI = 'mongodb+srv://SportAnalytics:Studyhard%402034@cluster0.et16d.mongodb.net/sports-analytics?retryWrites=true';
    process.env.MONGO_DB_NAME = 'sports-analytics';
    
    // Force application to use MongoDB Atlas
    const serverProcess = spawn('node', ['server.js'], {
      env: {
        ...process.env,
        FORCE_ATLAS: 'true',
        MONGO_URI: 'mongodb+srv://SportAnalytics:Studyhard%402034@cluster0.et16d.mongodb.net/sports-analytics?retryWrites=true',
        MONGO_DB_NAME: 'sports-analytics'
      }
    });
    
    let output = '';
    let errorOutput = '';
    
    serverProcess.stdout.on('data', (data) => {
      const strData = data.toString();
      output += strData;
      
      // Check for successful connection messages
      if (strData.includes('Connected to MongoDB successfully')) {
        results.mongodbConnection = true;
        log('✅ MongoDB connection established', 'SUCCESS');
      }
      
      if (strData.includes('Live Games Manager started')) {
        results.liveGamesManager = true;
        log('✅ Live Games Manager started', 'SUCCESS');
      }
      
      if (strData.includes('Server running on port')) {
        results.serverStart = true;
        log('✅ Server started successfully', 'SUCCESS');
      }
      
      // Log all server output
      console.log(`[SERVER] ${strData.trim()}`);
    });
    
    serverProcess.stderr.on('data', (data) => {
      errorOutput += data.toString();
      console.error(`[SERVER ERROR] ${data.toString().trim()}`);
    });
    
    let timeout = setTimeout(() => {
      log(`Server startup timed out after ${SERVER_START_TIMEOUT/1000} seconds`, 'ERROR');
      clearTimeout(timeout);
      serverProcess.kill('SIGTERM');
      reject(new Error('Server startup timed out'));
    }, SERVER_START_TIMEOUT);
    
    // Wait for server to start
    const checkInterval = setInterval(() => {
      if (results.serverStart) {
        clearInterval(checkInterval);
        clearTimeout(timeout);
        resolve(serverProcess);
      }
    }, 1000);
    
    // Handle server process error/exit
    serverProcess.on('error', (error) => {
      log(`Server process error: ${error.message}`, 'ERROR');
      clearInterval(checkInterval);
      clearTimeout(timeout);
      reject(error);
    });
    
    serverProcess.on('exit', (code, signal) => {
      if (code !== null && code !== 0) {
        log(`Server process exited with code ${code}`, 'ERROR');
        clearInterval(checkInterval);
        clearTimeout(timeout);
        reject(new Error(`Server process exited with code ${code}`));
      }
    });
  });
}

/**
 * Test all API endpoints
 * @returns {Promise<boolean>} Success status
 */
async function testApiEndpoints() {
  log('Testing API endpoints...');
  const endpoints = [
    { name: 'health', url: `${API_BASE_URL}/health` },
    { name: 'leagues', url: `${API_BASE_URL}/leagues` },
    { name: 'teams', url: `${API_BASE_URL}/teams` },
    { name: 'matches', url: `${API_BASE_URL}/matches` },
    { name: 'liveGames', url: `${API_BASE_URL}/live-games` }
  ];
  
  let allSuccessful = true;
  
  for (const endpoint of endpoints) {
    try {
      log(`Testing ${endpoint.name} endpoint...`);
      const response = await axios.get(endpoint.url, { timeout: 5000 });
      
      if (response.status === 200) {
        results.apiEndpoints[endpoint.name] = true;
        log(`✅ ${endpoint.name} endpoint successful`, 'SUCCESS');
        
        if (endpoint.name === 'liveGames') {
          const totalGames = Object.values(response.data.data || {}).reduce(
            (sum, games) => sum + (Array.isArray(games) ? games.length : 0), 
            0
          );
          log(`  - Live games found: ${totalGames}`, 'INFO');
        }
      } else {
        log(`❌ ${endpoint.name} endpoint returned status ${response.status}`, 'ERROR');
        allSuccessful = false;
      }
    } catch (error) {
      log(`❌ ${endpoint.name} endpoint error: ${error.message}`, 'ERROR');
      allSuccessful = false;
    }
  }
  
  return allSuccessful;
}

/**
 * Run the complete startup test
 */
async function runStartupTest() {
  const startTime = performance.now();
  log('=== COMPREHENSIVE STARTUP TEST ===');
  
  let serverProcess = null;
  
  try {
    // Start server
    serverProcess = await startServer();
    
    // Wait for server to fully initialize
    log('Waiting for server to fully initialize...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Test API endpoints
    await testApiEndpoints();
    
    // Calculate success rate
    const endpointResults = Object.values(results.apiEndpoints);
    const successfulEndpoints = endpointResults.filter(result => result).length;
    const totalEndpoints = endpointResults.length;
    const successRate = (successfulEndpoints / totalEndpoints) * 100;
    
    // Print summary
    log('\n=== TEST SUMMARY ===');
    log(`Server Start: ${results.serverStart ? '✅ OK' : '❌ FAILED'}`);
    log(`MongoDB Connection: ${results.mongodbConnection ? '✅ OK' : '❌ FAILED'}`);
    log(`Live Games Manager: ${results.liveGamesManager ? '✅ OK' : '❌ FAILED'}`);
    log(`API Endpoints: ${successfulEndpoints}/${totalEndpoints} successful (${successRate.toFixed(1)}%)`);
    
    const totalSuccess = results.serverStart && 
                         results.mongodbConnection && 
                         results.liveGamesManager && 
                         (successRate >= 80);
    
    if (totalSuccess) {
      log('\n✅ STARTUP TEST PASSED: Your system is ready for the visual phase!', 'SUCCESS');
    } else {
      log('\n❌ STARTUP TEST FAILED: Please fix the issues before proceeding to the visual phase.', 'ERROR');
    }
    
    const duration = ((performance.now() - startTime) / 1000).toFixed(2);
    log(`\nTest completed in ${duration} seconds`);
    
  } catch (error) {
    log(`Fatal error during startup test: ${error.message}`, 'ERROR');
  } finally {
    // Clean up
    if (serverProcess) {
      serverProcess.kill('SIGTERM');
      log('Server process terminated');
    }
    
    logStream.end();
  }
}

// Run the test
runStartupTest().catch(error => {
  log(`Uncaught error: ${error.message}`, 'ERROR');
  process.exit(1);
}); 