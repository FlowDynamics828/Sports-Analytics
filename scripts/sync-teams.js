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
  defaultMeta: { service: 'sync-teams' },
  transports: [
    new winston.transports.File({
      filename: 'logs/teams-error.log',
      level: 'error',
      maxsize: parseInt(process.env.LOG_FILE_MAX_SIZE, 10) || 5000000,
      maxFiles: parseInt(process.env.LOG_MAX_FILES, 10) || 3,
      tailable: true
    }),
    new winston.transports.File({
      filename: 'logs/teams.log',
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
const SPORTS_API_URL = process.env.SPORTS_API_URL;
const SPORTS_API_KEY = process.env.SPORTS_API_KEY;

// Supported leagues
const SUPPORTED_LEAGUES = [
  'NFL', 'NBA', 'MLB', 'NHL',
  'PREMIER_LEAGUE', 'LA_LIGA', 'BUNDESLIGA', 'SERIE_A'
];

// API configuration
const API_CONFIG = {
  NBA: {
    url: 'https://www.thesportsdb.com/api/v1/json',
    key: process.env.THESPORTSDB_API_KEY || '3',
    teamsEndpoint: '/lookup_all_teams.php',
    competitionId: 4387
  },
  NFL: {
    url: 'https://www.thesportsdb.com/api/v1/json',
    key: process.env.THESPORTSDB_API_KEY || '3',
    teamsEndpoint: '/lookup_all_teams.php',
    competitionId: 4391
  },
  MLB: {
    url: 'https://www.thesportsdb.com/api/v1/json',
    key: process.env.THESPORTSDB_API_KEY || '3',
    teamsEndpoint: '/lookup_all_teams.php',
    competitionId: 4424
  },
  NHL: {
    url: 'https://www.thesportsdb.com/api/v1/json',
    key: process.env.THESPORTSDB_API_KEY || '3',
    teamsEndpoint: '/lookup_all_teams.php',
    competitionId: 4380
  },
  PREMIER_LEAGUE: {
    url: 'https://www.thesportsdb.com/api/v1/json',
    key: process.env.THESPORTSDB_API_KEY || '3',
    teamsEndpoint: '/lookup_all_teams.php',
    competitionId: 4328
  },
  LA_LIGA: {
    url: 'https://www.thesportsdb.com/api/v1/json',
    key: process.env.THESPORTSDB_API_KEY || '3',
    teamsEndpoint: '/lookup_all_teams.php',
    competitionId: 4335
  },
  BUNDESLIGA: {
    url: 'https://www.thesportsdb.com/api/v1/json',
    key: process.env.THESPORTSDB_API_KEY || '3',
    teamsEndpoint: '/lookup_all_teams.php',
    competitionId: 4331
  },
  SERIE_A: {
    url: 'https://www.thesportsdb.com/api/v1/json',
    key: process.env.THESPORTSDB_API_KEY || '3',
    teamsEndpoint: '/lookup_all_teams.php',
    competitionId: 4332
  }
};

// Metrics tracking
const metrics = {
  startTime: null,
  endTime: null,
  totalTeamsProcessed: 0,
  teamsInserted: 0,
  teamsUpdated: 0,
  errors: 0,
  apiCallsTotal: 0,
  apiCallsSuccessful: 0,
  apiCallsFailed: 0,
  dbOperationsTotal: 0,
  dbOperationsSuccessful: 0,
  dbOperationsFailed: 0,
  duration: 0,
  leagueStats: {}
};

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
          maxPoolSize: parseInt(process.env.DB_MAX_POOL_SIZE, 10) || 50,
          minPoolSize: parseInt(process.env.DB_MIN_POOL_SIZE, 10) || 5,
          connectTimeoutMS: parseInt(process.env.CONNECT_TIMEOUT_MS, 10) || 30000,
          socketTimeoutMS: parseInt(process.env.SOCKET_TIMEOUT_MS, 10) || 45000,
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
          readPreference: 'primaryPreferred'
        }
      });
      
      await dbManager.initialize();
      const initTime = performance.now() - startTime;
      logger.info(`Database manager initialized successfully in ${initTime.toFixed(2)}ms`);
    }
    
    return dbManager;
  } catch (error) {
    logger.error('Failed to initialize database manager:', { 
      error: error.message, 
      stack: error.stack 
    });
    throw error;
  }
}

/**
 * Main function to synchronize team data across all leagues
 * @returns {Promise<Object>} Results of the synchronization
 */
async function syncTeams() {
  let client = null;
  metrics.startTime = performance.now();
  metrics.leagueStats = {};
  
  try {
    logger.info('Starting team data synchronization');
    
    // Initialize database manager
    await initializeDatabaseManager();
    
    // Connect to MongoDB directly as backup if DatabaseManager fails
    if (!dbManager || !dbManager.isConnected()) {
      logger.warn('Database manager not available, using direct MongoDB connection');
      client = new MongoClient(MONGODB_URI, {
        maxPoolSize: parseInt(process.env.DB_MAX_POOL_SIZE, 10) || 50,
        minPoolSize: parseInt(process.env.DB_MIN_POOL_SIZE, 10) || 5,
        connectTimeoutMS: parseInt(process.env.CONNECT_TIMEOUT_MS, 10) || 30000,
        socketTimeoutMS: parseInt(process.env.SOCKET_TIMEOUT_MS, 10) || 45000,
        serverSelectionTimeoutMS: 30000,
        retryWrites: true,
        retryReads: true,
        serverApi: {
          version: ServerApiVersion.v1,
          strict: true,
          deprecationErrors: true
        },
        w: 'majority',
        readPreference: 'primaryPreferred'
      });
      
      await client.connect();
      logger.info('MongoDB connection established for team data synchronization');
    }
    
    const db = dbManager?.getDb() || client.db(DB_NAME);
    
    // Ensure teams collection exists with proper indexes
    await ensureTeamsCollection(db);
    
    // Sync for each league
    const syncPromises = [];
    
    for (const league of SUPPORTED_LEAGUES) {
      // Initialize metrics for this league
      metrics.leagueStats[league] = {
        processed: 0,
        inserted: 0,
        updated: 0,
        errors: 0,
        startTime: performance.now()
      };
      
      // Process leagues in parallel, but with controlled concurrency
      const leaguePromise = (async () => {
        try {
          await syncLeagueTeams(db, league, API_CONFIG[league]);
        } catch (leagueError) {
          metrics.errors++;
          metrics.leagueStats[league].errors++;
          logger.error(`Error syncing ${league} teams:`, { 
            error: leagueError.message, 
            stack: leagueError.stack 
          });
        } finally {
          metrics.leagueStats[league].duration = performance.now() - metrics.leagueStats[league].startTime;
        }
      })();
      
      syncPromises.push(leaguePromise);
      
      // Add a small delay between API calls to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    // Wait for all league syncs to complete
    await Promise.all(syncPromises);
    
    // Calculate final metrics
    metrics.endTime = performance.now();
    metrics.duration = metrics.endTime - metrics.startTime;
    
    logger.info('Team data synchronization completed', {
      duration: `${metrics.duration.toFixed(2)}ms`,
      totalTeams: metrics.totalTeamsProcessed,
      inserted: metrics.teamsInserted,
      updated: metrics.teamsUpdated,
      errors: metrics.errors
    });
    
    return {
      success: true,
      metrics
    };
  } catch (error) {
    metrics.errors++;
    metrics.endTime = performance.now();
    metrics.duration = metrics.endTime - metrics.startTime;
    
    logger.error('Error in team data synchronization:', { 
      error: error.message, 
      stack: error.stack,
      metrics
    });
    
    return {
      success: false,
      error: error.message,
      metrics
    };
  } finally {
    if (client) {
      await client.close();
      logger.info('MongoDB connection closed');
    }
  }
}

/**
 * Ensure teams collection exists with proper indexes
 * @param {Object} db - MongoDB database instance
 * @returns {Promise<void>}
 */
async function ensureTeamsCollection(db) {
  try {
    metrics.dbOperationsTotal++;
    
    // Check if collection exists
    const collections = await db.listCollections({ name: 'teams' }).toArray();
    if (collections.length === 0) {
      // Create collection if it doesn't exist
      await db.createCollection('teams');
      logger.info('Created teams collection');
    }
    
    // Create indexes
    await db.collection('teams').createIndex({ teamId: 1 }, { unique: true });
    await db.collection('teams').createIndex({ league: 1 });
    await db.collection('teams').createIndex({ name: 1 });
    await db.collection('teams').createIndex({ country: 1 }, { sparse: true });
    await db.collection('teams').createIndex({ city: 1 }, { sparse: true });
    
    logger.info('Ensured indexes for teams collection');
    metrics.dbOperationsSuccessful++;
  } catch (error) {
    metrics.dbOperationsFailed++;
    logger.error('Error ensuring teams collection:', { 
      error: error.message, 
      stack: error.stack 
    });
    throw error;
  }
}

/**
 * Synchronize team data for a specific league
 * @param {Object} db - MongoDB database instance
 * @param {string} league - League identifier
 * @param {Object} config - API configuration for the league
 * @returns {Promise<Object>} Results for this league
 */
async function syncLeagueTeams(db, league, config) {
  const leagueMetrics = metrics.leagueStats[league];
  
  try {
    logger.info(`Starting team data synchronization for ${league}`);
    
    // Fetch team data
    const teams = await fetchTeams(league, config);
    logger.info(`Fetched ${teams.length} teams for ${league}`);
    
    if (teams.length === 0) {
      logger.warn(`No teams returned for ${league}`);
      return {
        league,
        teamsProcessed: 0,
        success: false,
        error: 'No teams returned from API'
      };
    }
    
    let updatedCount = 0;
    let insertedCount = 0;
    let errorCount = 0;
    
    // Process each team
    const teamPromises = teams.map(async (team) => {
      try {
        metrics.dbOperationsTotal++;
        leagueMetrics.processed++;
        metrics.totalTeamsProcessed++;
        
        // Transform team data to our schema
        const transformedTeam = transformTeamData(team, league);
        
        // Update or insert team with additional error handling
        try {
          const result = await db.collection('teams').updateOne(
            { teamId: transformedTeam.teamId },
            {
              $set: {
                ...transformedTeam,
                updatedAt: new Date()
              },
              $setOnInsert: {
                createdAt: new Date()
              }
            },
            { upsert: true }
          );
          
          metrics.dbOperationsSuccessful++;
          
          if (result.matchedCount > 0) {
            updatedCount++;
            metrics.teamsUpdated++;
            leagueMetrics.updated++;
          } else if (result.upsertedCount > 0) {
            insertedCount++;
            metrics.teamsInserted++;
            leagueMetrics.inserted++;
          }
        } catch (dbError) {
          metrics.dbOperationsFailed++;
          errorCount++;
          metrics.errors++;
          leagueMetrics.errors++;
          
          logger.error(`Error saving team ${transformedTeam.teamId} to database:`, {
            error: dbError.message,
            team: transformedTeam.name,
            league
          });
          
          // Try individual fields on conflict
          if (dbError.code === 11000) { // Duplicate key error
            logger.warn(`Duplicate key error for team ${transformedTeam.teamId}, attempting to update non-key fields`);
            try {
              // Update only non-key fields
              const updateResult = await db.collection('teams').updateOne(
                { teamId: transformedTeam.teamId },
                {
                  $set: {
                    name: transformedTeam.name,
                    abbreviation: transformedTeam.abbreviation,
                    city: transformedTeam.city,
                    stadium: transformedTeam.stadium,
                    logo: transformedTeam.logo,
                    updatedAt: new Date()
                  }
                }
              );
              
              if (updateResult.matchedCount > 0) {
                logger.info(`Successfully updated non-key fields for team ${transformedTeam.teamId}`);
                updatedCount++;
                metrics.teamsUpdated++;
                leagueMetrics.updated++;
                metrics.dbOperationsSuccessful++;
                errorCount--; // Decrement error count since we recovered
                metrics.errors--;
                leagueMetrics.errors--;
              }
            } catch (retryError) {
              logger.error(`Failed to update non-key fields for team ${transformedTeam.teamId}:`, {
                error: retryError.message
              });
            }
          }
        }
      } catch (teamError) {
        errorCount++;
        metrics.errors++;
        leagueMetrics.errors++;
        logger.error(`Error processing team:`, { 
          error: teamError.message, 
          league 
        });
      }
    });
    
    // Wait for all team operations to complete
    await Promise.all(teamPromises);
    
    logger.info(`${league} teams sync completed: ${insertedCount} inserted, ${updatedCount} updated, ${errorCount} errors`);
    
    return {
      league,
      teamsProcessed: teams.length,
      inserted: insertedCount,
      updated: updatedCount,
      errors: errorCount,
      success: true
    };
  } catch (error) {
    logger.error(`Error syncing ${league} teams:`, { 
      error: error.message, 
      stack: error.stack 
    });
    
    return {
      league,
      success: false,
      error: error.message
    };
  }
}

/**
 * Fetch teams for a league with retry logic
 * @param {string} league - League identifier
 * @param {Object} config - API configuration
 * @returns {Promise<Array>} Teams
 */
async function fetchTeams(league, config) {
  metrics.apiCallsTotal++;
  const MAX_RETRIES = 3;
  let retries = 0;
  
  while (retries < MAX_RETRIES) {
    try {
      // Set up API request parameters
      let endpoint = config.teamsEndpoint;
      
      logger.debug(`Requesting ${league} teams from API`);
      
      // Configure request with timeout and headers
      const options = {
        headers: {
          'Ocp-Apim-Subscription-Key': config.key,
          'Accept': 'application/json'
        },
        timeout: 30000 // 30 second timeout
      };
      
      // Make API request
      const startTime = performance.now();
      const response = await axios.get(`${config.url}${endpoint}`, options);
      const apiLatency = performance.now() - startTime;
      
      logger.debug(`API request for ${league} teams completed in ${apiLatency.toFixed(2)}ms`);
      
      if (!response.data || !Array.isArray(response.data)) {
        metrics.apiCallsFailed++;
        logger.warn(`No ${league} teams returned from API.`, {
          responseStatus: response.status,
          responseType: typeof response.data
        });
        return [];
      }
      
      metrics.apiCallsSuccessful++;
      return response.data;
      
    } catch (error) {
      retries++;
      
      // Log detailed error information
      logger.error(`Error fetching ${league} teams (attempt ${retries}/${MAX_RETRIES}):`, {
        error: error.message,
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data
      });
      
      if (retries >= MAX_RETRIES) {
        metrics.apiCallsFailed++;
        logger.error(`Failed to fetch ${league} teams after ${MAX_RETRIES} attempts`);
        return [];
      }
      
      // Exponential backoff
      const delay = Math.pow(2, retries) * 1000;
      logger.info(`Retrying ${league} teams API request in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  return [];
}

/**
 * Transform API team data to our schema format
 * @param {Object} team - Team from API
 * @param {string} league - League identifier
 * @returns {Object} Transformed team data
 */
function transformTeamData(team, league) {
  return {
    teamId: team.TeamID || team.TeamId || team.teamId || team.id,
    league,
    name: team.Name || team.TeamName || team.name,
    abbreviation: team.Abbreviation || team.abbreviation || team.abbr || team.ShortName || '',
    city: team.City || team.city || team.Location || team.Venue?.City || '',
    stadium: team.Stadium || team.stadium || team.VenueName || team.Venue?.Name || '',
    logo: team.WikipediaLogoUrl || team.logo || team.TeamLogoUrl || team.PrimaryColor || '',
    country: team.Country || team.country || '',
    conferenceId: team.ConferenceID || team.conferenceId || null,
    divisionId: team.DivisionID || team.divisionId || null,
    active: team.Active !== undefined ? team.Active : true,
    metadata: {
      externalIds: {
        apiId: team.TeamID || team.TeamId || team.teamId || team.id,
        espn: team.GlobalTeamID || team.espnId || null
      },
      sourceData: team,
      lastSyncedAt: new Date()
    }
  };
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
  logger.info('Shutting down sync-teams script');
  
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

// Schedule the sync to run daily at 2 AM
cron.schedule('0 2 * * *', async () => {
  logger.info('Starting scheduled team data synchronization');
  try {
    await syncTeams();
    logger.info('Scheduled team sync completed successfully');
  } catch (error) {
    logger.error('Scheduled team sync failed:', { 
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
  syncTeams()
    .then(() => {
      logger.info('Team data synchronization executed successfully');
      process.exit(0);
    })
    .catch(error => {
      logger.error('Team data synchronization failed:', { 
        error: error.message, 
        stack: error.stack 
      });
      process.exit(1);
    });
}

// Export functions for use in other modules
module.exports = {
  syncTeams,
  performHealthCheck,
  shutdown
};
