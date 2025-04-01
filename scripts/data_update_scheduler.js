/**
 * Data Update Scheduler
 * 
 * This script sets up cron jobs to update data from TheSportsDB API
 * at regular intervals, ensuring our database stays up to date.
 */

const { CronJob } = require('cron');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const { MongoClient, ServerApiVersion } = require('mongodb');
require('dotenv').config();

// MongoDB Configuration
const MONGO_URI = process.env.MONGO_URI;
const MONGO_DB_NAME = process.env.MONGO_DB_NAME;

// Set up MongoDB client
const client = new MongoClient(MONGO_URI, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

// Log directory for job logs
const LOG_DIR = path.join(__dirname, '../logs');

// Ensure log directory exists
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

/**
 * Log a message with timestamp
 */
function log(message) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}`;
  console.log(logMessage);
  
  // Also write to log file with date as filename
  const date = new Date().toISOString().split('T')[0];
  const logFile = path.join(LOG_DIR, `data_update_${date}.log`);
  fs.appendFileSync(logFile, logMessage + '\n');
}

/**
 * Execute the data import script
 */
function runImportScript() {
  return new Promise((resolve, reject) => {
    log('Starting data import script...');
    
    // Get the absolute path to the import script
    const scriptPath = path.join(__dirname, 'import_sportsdb_data.js');
    
    // Execute the script
    exec(`node ${scriptPath}`, (error, stdout, stderr) => {
      if (error) {
        log(`Error executing import script: ${error.message}`);
        log(stderr);
        reject(error);
        return;
      }
      
      log('Data import script completed successfully');
      log(stdout);
      resolve(stdout);
    });
  });
}

/**
 * Update live scores only
 */
async function updateLiveScores() {
  try {
    log('Updating live scores...');
    
    await client.connect();
    const db = client.db(MONGO_DB_NAME);
    
    // Execute the script
    const scriptPath = path.join(__dirname, 'import_sportsdb_data.js');
    exec(`node ${scriptPath} --live-only`, (error, stdout, stderr) => {
      if (error) {
        log(`Error updating live scores: ${error.message}`);
        log(stderr);
        return;
      }
      
      log('Live scores updated successfully');
      log(stdout);
    });
  } catch (error) {
    log(`Error updating live scores: ${error.message}`);
  } finally {
    await client.close();
  }
}

/**
 * Record last update time in database
 */
async function recordUpdateTime(updateType) {
  try {
    await client.connect();
    const db = client.db(MONGO_DB_NAME);
    
    await db.collection('system_config').updateOne(
      { config_key: 'data_import' },
      { 
        $set: {
          [`last_${updateType}_update`]: new Date(),
          [`${updateType}_update_status`]: 'success'
        }
      },
      { upsert: true }
    );
    
    log(`Recorded ${updateType} update time in database`);
  } catch (error) {
    log(`Error recording ${updateType} update time: ${error.message}`);
  } finally {
    await client.close();
  }
}

/**
 * Initialize all cron jobs
 */
function initializeScheduler() {
  // 1. Full data update - Once daily at 3:00 AM
  // Format: Second(0-59) Minute(0-59) Hour(0-23) Day(1-31) Month(1-12) Day of Week(0-6)
  const fullUpdateJob = new CronJob('0 0 3 * * *', async () => {
    log('Running scheduled full data update');
    try {
      await runImportScript();
      await recordUpdateTime('full');
    } catch (error) {
      log(`Scheduled full update failed: ${error.message}`);
    }
  });
  
  // 2. Live scores update - Every 2 minutes during active hours (8 AM to midnight)
  const liveScoresJob = new CronJob('0 */2 8-23 * * *', async () => {
    log('Running scheduled live scores update');
    try {
      await updateLiveScores();
      await recordUpdateTime('live');
    } catch (error) {
      log(`Scheduled live scores update failed: ${error.message}`);
    }
  });
  
  // 3. Matches update - Every 6 hours to get updated schedules
  const matchesUpdateJob = new CronJob('0 0 0,6,12,18 * * *', async () => {
    log('Running scheduled matches update');
    try {
      // Execute the script with matches-only flag
      exec(`node ${path.join(__dirname, 'import_sportsdb_data.js')} --matches-only`, (error, stdout, stderr) => {
        if (error) {
          log(`Error updating matches: ${error.message}`);
          log(stderr);
          return;
        }
        
        log('Matches updated successfully');
        log(stdout);
      });
      
      await recordUpdateTime('matches');
    } catch (error) {
      log(`Scheduled matches update failed: ${error.message}`);
    }
  });
  
  // Start the cron jobs
  fullUpdateJob.start();
  liveScoresJob.start();
  matchesUpdateJob.start();
  
  log('Data update scheduler initialized');
  log('Full data update: Daily at 3:00 AM');
  log('Live scores update: Every 2 minutes from 8 AM to midnight');
  log('Matches update: Every 6 hours (midnight, 6 AM, noon, 6 PM)');
}

// Run a full import on startup, then initialize the scheduler
log('Starting initial data import on scheduler startup');
runImportScript()
  .then(() => {
    recordUpdateTime('full');
    initializeScheduler();
  })
  .catch((error) => {
    log(`Initial data import failed: ${error.message}`);
    // Initialize scheduler anyway
    initializeScheduler();
  });

// Handle process termination
process.on('SIGINT', async () => {
  log('Scheduler shutting down...');
  await client.close();
  log('Database connection closed');
  process.exit(0);
}); 