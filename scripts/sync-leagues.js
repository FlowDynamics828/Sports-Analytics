require('dotenv').config();
const { MongoClient, ServerApiVersion } = require('mongodb');
const axios = require('axios');
const cron = require('node-cron');
const winston = require('winston');
const { format } = winston;
const { performance } = require('perf_hooks');
const { DatabaseManager } = require('../utils/db');

// Initialize logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: format.combine(
    format.timestamp(),
    format.errors({ stack: true }),
    format.json(),
    format.metadata()
  ),
  defaultMeta: { service: 'sync-leagues' },
  transports: [
    new winston.transports.File({
      filename: 'logs/leagues-error.log',
      level: 'error',
      maxsize: parseInt(process.env.LOG_FILE_MAX_SIZE, 10) || 5000000,
      maxFiles: parseInt(process.env.LOG_MAX_FILES, 10) || 3,
      tailable: true
    }),
    new winston.transports.File({
      filename: 'logs/leagues.log',
      maxsize: parseInt(process.env.LOG_FILE_MAX_SIZE, 10) || 5000000,
      maxFiles: parseInt(process.env.LOG_MAX_FILES, 10) || 3,
      tailable: true
    }),
    new winston.transports.Console({
      format: format.combine(
        format.colorize(),
        format.simple()
      )
    })
  ]
});

// Ensure logs directory exists
const fs = require('fs');
const path = require('path');
if (!fs.existsSync('logs')) {
  fs.mkdirSync('logs', { recursive: true });
}

// MongoDB connection details from .env
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/sports-analytics';
const DB_NAME = process.env.MONGODB_DB_NAME || 'sports-analytics';

// Supported leagues with metadata
const LEAGUES = [
  {
    id: 'NBA',
    name: 'National Basketball Association',
    country: 'USA',
    type: 'basketball',
    seasons: [2023, 2024],
    apiIds: {
      sportsdata: 4387,
      espn: 46
    }
  },
  {
    id: 'NFL',
    name: 'National Football League',
    country: 'USA',
    type: 'football',
    seasons: [2023, 2024],
    apiIds: {
      sportsdata: 4391,
      espn: 28
    }
  },
  {
    id: 'MLB',
    name: 'Major League Baseball',
    country: 'USA',
    type: 'baseball',
    seasons: [2023, 2024],
    apiIds: {
      sportsdata: 4424,
      espn: 10
    }
  },
  {
    id: 'NHL',
    name: 'National Hockey League',
    country: 'USA/Canada',
    type: 'hockey',
    seasons: [2023, 2024],
    apiIds: {
      sportsdata: 4380,
      espn: 90
    }
  },
  {
    id: 'PREMIER_LEAGUE',
    name: 'English Premier League',
    country: 'England',
    type: 'soccer',
    seasons: [2023, 2024],
    apiIds: {
      sportsdata: 4328,
      espn: 23
    }
  },
  {
    id: 'LA_LIGA',
    name: 'La Liga',
    country: 'Spain',
    type: 'soccer',
    seasons: [2023, 2024],
    apiIds: {
      sportsdata: 4335,
      espn: 21
    }
  },
  {
    id: 'BUNDESLIGA',
    name: 'Bundesliga',
    country: 'Germany',
    type: 'soccer',
    seasons: [2023, 2024],
    apiIds: {
      sportsdata: 4331,
      espn: 10
    }
  },
  {
    id: 'SERIE_A',
    name: 'Serie A',
    country: 'Italy',
    type: 'soccer',
    seasons: [2023, 2024],
    apiIds: {
      sportsdata: 4332,
      espn: 12
    }
  }
];

// Database manager instance
let dbManager = null;

/**
 * Initialize the database manager with enterprise-grade configuration
 * @returns {Promise<Object>} Database manager instance
 */
async function initializeDatabaseManager() {
  try {
    if (!dbManager) {
      const startTime = performance.now();
      logger.info('Initializing database manager...');
      
      dbManager = new DatabaseManager({
        uri: MONGODB_URI,
        name: DB_NAME,
        options: {
          maxPoolSize: parseInt(process.env.DB_MAX_POOL_SIZE || '100', 10),
          minPoolSize: parseInt(process.env.DB_MIN_POOL_SIZE || '10', 10),
          connectTimeoutMS: parseInt(process.env.CONNECT_TIMEOUT_MS || '30000', 10),
          socketTimeoutMS: parseInt(process.env.SOCKET_TIMEOUT_MS || '45000', 10),
          serverSelectionTimeoutMS: 30000,
          heartbeatFrequencyMS: 10000,
          retryWrites: true,
          retryReads: true,
          serverApi: {
            version: ServerApiVersion.v1,
            strict: true,
            deprecationErrors: true
          },
          w: 'majority',
          readPreference: 'primaryPreferred',
          maxIdleTimeMS: 120000,
          compressors: ['zlib']
        }
      });
      
      await dbManager.initialize();
      const initTime = performance.now() - startTime;
      logger.info(`Database manager initialized successfully in ${initTime.toFixed(2)}ms`);
    }
    
    return dbManager;
  } catch (error) {
    logger.error('Failed to initialize database manager:', { error: error.message, stack: error.stack });
    throw error;
  }
}

/**
 * Main function to synchronize league data
 */
async function syncLeagues() {
  let client = null;
  try {
    const startTime = performance.now();
    logger.info('Starting league data synchronization');
    
    // Initialize database manager
    await initializeDatabaseManager();
    
    // Connect to MongoDB directly as backup if DatabaseManager fails
    if (!dbManager || !dbManager.isConnected()) {
      logger.warn('Database manager not available, using direct MongoDB connection');
      client = new MongoClient(MONGODB_URI, {
        maxPoolSize: parseInt(process.env.DB_MAX_POOL_SIZE || '100', 10),
        minPoolSize: parseInt(process.env.DB_MIN_POOL_SIZE || '10', 10),
        connectTimeoutMS: parseInt(process.env.CONNECT_TIMEOUT_MS || '30000', 10),
        socketTimeoutMS: parseInt(process.env.SOCKET_TIMEOUT_MS || '45000', 10),
        serverSelectionTimeoutMS: 30000,
        heartbeatFrequencyMS: 10000,
        retryWrites: true,
        retryReads: true,
        serverApi: {
          version: ServerApiVersion.v1,
          strict: true,
          deprecationErrors: true
        },
        w: 'majority',
        readPreference: 'primaryPreferred',
        maxIdleTimeMS: 120000,
        compressors: ['zlib']
      });
      
      await client.connect();
      logger.info('MongoDB connection established for league data synchronization');
    }
    
    const db = dbManager?.getDb() || client.db(DB_NAME);
    
    // Ensure leagues collection exists with proper indexes
    await ensureLeaguesCollection(db);
    
    // Sync all leagues
    const results = await syncAllLeagues(db);
    
    const duration = performance.now() - startTime;
    logger.info(`League data synchronization completed in ${duration.toFixed(2)}ms`, { results });
    
    return results;
  } catch (error) {
    logger.error('Error in league data synchronization:', { 
      error: error.message, 
      stack: error.stack 
    });
    throw error;
  } finally {
    if (client) {
      await client.close();
      logger.info('MongoDB connection closed');
    }
  }
}

/**
 * Ensure leagues collection exists with proper indexes
 * @param {Object} db - MongoDB database instance
 * @returns {Promise<void>}
 */
async function ensureLeaguesCollection(db) {
  try {
    const collections = await db.listCollections({ name: 'leagues' }).toArray();
    
    if (collections.length === 0) {
      await db.createCollection('leagues');
      logger.info('Created leagues collection', { metadata: { service: 'sync-leagues' } });
    }
    
    // Create indexes on appropriate fields, using 'id' instead of 'leagueId'
    await db.collection('leagues').createIndex({ id: 1 }, { unique: true });
    await db.collection('leagues').createIndex({ type: 1 });
    await db.collection('leagues').createIndex({ country: 1 });
    
    logger.info('Ensured indexes for leagues collection', { metadata: { service: 'sync-leagues' } });
  } catch (error) {
    logger.error('Error ensuring leagues collection:', { metadata: { error: error.message, stack: error.stack, service: 'sync-leagues' } });
    throw error;
  }
}

/**
 * Synchronize all supported leagues
 * @param {Object} db - MongoDB database instance
 * @returns {Promise<Object>} Results of the sync operation
 */
async function syncAllLeagues(db) {
  const results = {
    total: LEAGUES.length,
    inserted: 0,
    updated: 0,
    failed: 0,
    details: {}
  };
  
  for (const league of LEAGUES) {
    try {
      logger.info(`Syncing league data for ${league.id}`, { metadata: { service: 'sync-leagues' } });
      
      // Fetch additional metadata if available
      const metadata = await fetchLeagueMetadata(league.id);
      
      // Prepare league data with current timestamp
      const now = new Date();
      const leagueData = {
        ...league, // This includes the 'id' field from LEAGUES array
        ...(metadata || {}),
        updatedAt: now
      };
      
      // Make sure to use 'id' not 'leagueId'
      if (!leagueData.id) {
        leagueData.id = league.id;
      }
      
      // First check if the league exists
      const existingLeague = await db.collection('leagues').findOne({ id: league.id });
      
      let result;
      if (!existingLeague) {
        // Insert new league with createdAt
        leagueData.createdAt = now;
        result = await db.collection('leagues').insertOne(leagueData);
        
        if (result.acknowledged) {
          results.inserted++;
          results.details[league.id] = { success: true, inserted: true };
        }
      } else {
        // Update existing league but don't touch createdAt
        const { _id, createdAt, ...existingData } = existingLeague;
        const updatedData = {
          ...existingData,
          ...leagueData
        };
        
        // Keep original createdAt
        if (createdAt) {
          updatedData.createdAt = createdAt;
        }
        
        result = await db.collection('leagues').replaceOne({ id: league.id }, updatedData);
        
        if (result.acknowledged) {
          results.updated++;
          results.details[league.id] = { success: true, updated: true };
        }
      }
    } catch (error) {
      results.failed++;
      results.details[league.id] = { success: false, error: error.message };
      logger.error(`Error syncing league data for ${league.id}:`, { metadata: { error: error.message, stack: error.stack, service: 'sync-leagues' } });
    }
  }
  
  return results;
}

/**
 * Fetch additional league metadata from external API
 * @param {string} leagueId - League ID
 * @returns {Promise<Object|null>} Additional metadata or null if not available
 */
async function fetchLeagueMetadata(leagueId) {
  try {
    // In a production environment, we would call an external API here
    // For now, we'll return some hardcoded metadata
    
    // This would be replaced with actual API calls in production
    const metadata = {
      NBA: {
        logoUrl: 'https://cdn.nba.com/logos/nba/nba-logoman-75-word_white.svg',
        website: 'https://www.nba.com',
        foundedYear: 1946,
        totalTeams: 30,
        commissioner: 'Adam Silver'
      },
      NFL: {
        logoUrl: 'https://static.www.nfl.com/image/upload/v1554321393/league/nvfr7ogywskqrfaiu38m.svg',
        website: 'https://www.nfl.com',
        foundedYear: 1920,
        totalTeams: 32,
        commissioner: 'Roger Goodell'
      },
      MLB: {
        logoUrl: 'https://www.mlbstatic.com/team-logos/league-on-dark/1.svg',
        website: 'https://www.mlb.com',
        foundedYear: 1903,
        totalTeams: 30,
        commissioner: 'Rob Manfred'
      },
      NHL: {
        logoUrl: 'https://www.nhl.com/site-core/images/team/logo/league-dark/133-flat.svg',
        website: 'https://www.nhl.com',
        foundedYear: 1917,
        totalTeams: 32,
        commissioner: 'Gary Bettman'
      },
      PREMIER_LEAGUE: {
        logoUrl: 'https://resources.premierleague.com/premierleague/badges/rbg/r0001.svg',
        website: 'https://www.premierleague.com',
        foundedYear: 1992,
        totalTeams: 20,
        chairman: 'Richard Masters'
      }
    };
    
    return metadata[leagueId] || null;
  } catch (error) {
    logger.error(`Error fetching metadata for ${leagueId}:`, { 
      error: error.message 
    });
    return null;
  }
}

/**
 * Performs a robust health check on MongoDB connection
 * @returns {Promise<Object>} Health check result
 */
async function performHealthCheck() {
  try {
    // Initialize database manager if not already done
    await initializeDatabaseManager();
    
    if (dbManager && dbManager.isConnected()) {
      const health = await dbManager.healthCheck();
      return {
        status: 'ok',
        connection: 'connected',
        details: health.details
      };
    }
    
    return {
      status: 'warning',
      connection: 'disconnected',
      message: 'Database manager is not connected'
    };
  } catch (error) {
    logger.error('Health check failed:', { 
      error: error.message, 
      stack: error.stack 
    });
    
    return {
      status: 'error',
      connection: 'error',
      message: error.message
    };
  }
}

/**
 * Gracefully shutdown database connections
 * @returns {Promise<void>}
 */
async function shutdown() {
  logger.info('Shutting down sync-leagues script');
  
  try {
    if (dbManager) {
      await dbManager.shutdown();
      logger.info('Database manager shutdown complete');
    }
  } catch (error) {
    logger.error('Error during shutdown:', { 
      error: error.message, 
      stack: error.stack 
    });
  }
}

// Schedule the sync to run daily at 1 AM
cron.schedule('0 1 * * *', async () => {
  logger.info('Starting scheduled league data synchronization');
  try {
    await syncLeagues();
    logger.info('Scheduled league sync completed successfully');
  } catch (error) {
    logger.error('Scheduled league sync failed:', { 
      error: error.message, 
      stack: error.stack 
    });
  }
});

// Set up process handlers for graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down');
  await shutdown();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down');
  await shutdown();
  process.exit(0);
});

// Execute directly if run from command line
if (require.main === module) {
  syncLeagues()
    .then(() => {
      logger.info('League data synchronization executed successfully');
      process.exit(0);
    })
    .catch(error => {
      logger.error('League data synchronization failed:', { 
        error: error.message, 
        stack: error.stack 
      });
      process.exit(1);
    });
}

// Export functions for use in other modules
module.exports = {
  syncLeagues,
  performHealthCheck,
  shutdown,
  LEAGUES
}; 