/**
 * Enterprise-level system startup script
 * This script handles the sequential startup of all system components:
 * 1. Database seeding
 * 2. Test user creation
 * 3. Live game updater
 * 4. Main application
 */

require('dotenv').config();
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const winston = require('winston');
const { format } = winston;

// Set up logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: format.combine(
    format.timestamp(),
    format.json()
  ),
  defaultMeta: { service: 'system-startup' },
  transports: [
    new winston.transports.Console({
      format: format.combine(
        format.colorize(),
        format.simple()
      )
    }),
    new winston.transports.File({ 
      filename: 'system-startup.log',
      format: format.combine(
        format.timestamp(),
        format.json()
      )
    })
  ]
});

// Store child processes for proper cleanup
const childProcesses = [];

/**
 * Execute a command as a child process
 * @param {string} cmd - Command to execute
 * @param {string[]} args - Command arguments
 * @param {Object} options - Spawn options
 * @param {string} label - Process label for logging
 * @param {boolean} background - Whether to run in background
 * @returns {Promise<Object>} - Process and result info
 */
function executeCommand(cmd, args, options = {}, label, background = false) {
  return new Promise((resolve, reject) => {
    logger.info(`Starting ${label}...`);
    
    const child = spawn(cmd, args, {
      ...options,
      env: { ...process.env, ...options.env },
      stdio: 'pipe'
    });
    
    let output = '';
    let errorOutput = '';
    
    child.stdout.on('data', (data) => {
      const dataStr = data.toString();
      output += dataStr;
      process.stdout.write(`[${label}] ${dataStr}`);
    });
    
    child.stderr.on('data', (data) => {
      const dataStr = data.toString();
      errorOutput += dataStr;
      process.stderr.write(`[${label}] ${dataStr}`);
    });
    
    if (background) {
      // Add to tracked processes for cleanup
      childProcesses.push({ child, label });
      
      // Resolve immediately for background processes
      resolve({ child, success: true, background: true });
    } else {
      child.on('close', (code) => {
        if (code === 0) {
          logger.info(`${label} completed successfully`);
          resolve({ success: true, output, code });
        } else {
          logger.error(`${label} failed with code ${code}`);
          reject({ success: false, error: errorOutput, code });
        }
      });
      
      child.on('error', (error) => {
        logger.error(`${label} process error: ${error.message}`);
        reject({ success: false, error: error.message });
      });
    }
  });
}

/**
 * Run database seeding
 */
async function runDatabaseSeed() {
  try {
    await executeCommand('node', ['scripts/enhanced-seeder.js'], {}, 'Database Seeder');
    logger.info('Database seeding completed successfully');
    return true;
  } catch (error) {
    logger.error('Database seeding failed', error);
    throw new Error('Database seeding failed');
  }
}

/**
 * Create test user
 */
async function createTestUser() {
  try {
    await executeCommand('node', ['scripts/setup-test-user.js'], {}, 'Test User Setup');
    logger.info('Test user created successfully');
    return true;
  } catch (error) {
    logger.error('Test user creation failed', error);
    throw new Error('Test user creation failed');
  }
}

/**
 * Start live game updater
 */
async function startLiveGameUpdater() {
  try {
    // Use custom env for live game updater with different port
    const env = { 
      WS_PORT: process.env.LIVE_GAME_UPDATER_WS_PORT || '5152'
    };
    
    const { child } = await executeCommand(
      'node', 
      ['scripts/live-game-updater.js'], 
      { env }, 
      'Live Game Updater',
      true // Run in background
    );
    
    logger.info(`Live game updater started with PID ${child.pid} on port ${env.WS_PORT}`);
    return true;
  } catch (error) {
    logger.error('Live game updater startup failed', error);
    throw new Error('Live game updater startup failed');
  }
}

/**
 * Start main application
 */
async function startMainApplication() {
  try {
    // Custom env for main app with different WebSocket port
    const env = {
      WS_PORT: process.env.WS_PORT || '5153',
      // Add extra memory for performance
      NODE_OPTIONS: '--max-old-space-size=4096 --expose-gc'
    };
    
    const { child } = await executeCommand(
      'node', 
      ['scripts/startup.js'], 
      { env }, 
      'Main Application',
      true // Run in background
    );
    
    logger.info(`Main application started with PID ${child.pid} on HTTP port ${process.env.PORT || 5050} and WS port ${env.WS_PORT}`);
    return true;
  } catch (error) {
    logger.error('Main application startup failed', error);
    throw new Error('Main application startup failed');
  }
}

/**
 * Handle cleanup on process exit
 */
function setupCleanup() {
  // Listen for termination signals
  ['SIGINT', 'SIGTERM', 'SIGHUP'].forEach(signal => {
    process.on(signal, () => {
      logger.info(`Received ${signal}, shutting down all services...`);
      
      // Terminate all child processes in reverse order
      [...childProcesses].reverse().forEach(({ child, label }) => {
        if (!child.killed) {
          logger.info(`Terminating ${label} (PID: ${child.pid})...`);
          child.kill('SIGTERM');
        }
      });
      
      logger.info('All services terminated, exiting...');
      process.exit(0);
    });
  });
  
  // Also handle uncaught exceptions
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception:', error);
    process.exit(1);
  });
}

/**
 * Main startup sequence
 */
async function startSystem() {
  logger.info('Starting Sports Analytics system...');
  
  setupCleanup();
  
  try {
    // Step 1: Seed database
    await runDatabaseSeed();
    
    // Step 2: Create test user
    await createTestUser();
    
    // Step 3: Start live game updater
    await startLiveGameUpdater();
    
    // Step 4: Start main application
    await startMainApplication();
    
    logger.info('All services started successfully');
    
    // Keep the process running to maintain child processes
    logger.info('System startup complete. Press Ctrl+C to shut down all services.');
  } catch (error) {
    logger.error('System startup failed:', error);
    process.exit(1);
  }
}

// Start the system
startSystem(); 