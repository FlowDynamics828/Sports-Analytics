require('dotenv').config();
const { MongoClient } = require('mongodb');
const axios = require('axios');
const cron = require('node-cron');
const winston = require('winston');
const { format } = winston;
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

// MongoDB connection details from .env
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://SportAnalytics:Studyhard%402034@cluster0.et16d.mongodb.net/sports-analytics?retryWrites=true&w=majority&appName=Cluster0';
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
    url: 'https://api.sportsdata.io/v3/nba',
    key: '447279',
    teamsEndpoint: '/scores/json/Teams',
    competitionId: 4387
  },
  NFL: {
    url: 'https://api.sportsdata.io/v3/nfl',
    key: '447279',
    teamsEndpoint: '/scores/json/Teams',
    competitionId: 4391
  },
  MLB: {
    url: 'https://api.sportsdata.io/v3/mlb',
    key: '447279',
    teamsEndpoint: '/scores/json/Teams',
    competitionId: 4424
  },
  NHL: {
    url: 'https://api.sportsdata.io/v3/nhl',
    key: '447279',
    teamsEndpoint: '/scores/json/Teams',
    competitionId: 4380
  },
  PREMIER_LEAGUE: {
    url: 'https://api.sportsdata.io/v3/soccer',
    key: '447279',
    teamsEndpoint: '/scores/json/Teams',
    competitionId: 4328
  },
  LA_LIGA: {
    url: 'https://api.sportsdata.io/v3/soccer',
    key: '447279',
    teamsEndpoint: '/scores/json/Teams',
    competitionId: 4335
  },
  BUNDESLIGA: {
    url: 'https://api.sportsdata.io/v3/soccer',
    key: '447279',
    teamsEndpoint: '/scores/json/Teams',
    competitionId: 4331
  },
  SERIE_A: {
    url: 'https://api.sportsdata.io/v3/soccer',
    key: '447279',
    teamsEndpoint: '/scores/json/Teams',
    competitionId: 4332
  }
};

// Database manager instance
let dbManager = null;

/**
 * Initialize the database manager
 * @returns {Promise<void>}
 */
async function initializeDatabaseManager() {
  if (!dbManager) {
    dbManager = new DatabaseManager({
      uri: MONGODB_URI,
      name: DB_NAME,
      options: {
        maxPoolSize: parseInt(process.env.DB_MAX_POOL_SIZE, 10) || 10,
        minPoolSize: parseInt(process.env.DB_MIN_POOL_SIZE, 10) || 1,
        connectTimeoutMS: parseInt(process.env.CONNECT_TIMEOUT_MS, 10) || 5000,
        socketTimeoutMS: parseInt(process.env.SOCKET_TIMEOUT_MS, 10) || 10000
      }
    });
    
    await dbManager.initialize();
    logger.info('Database manager initialized successfully');
  }
  
  return dbManager;
}

/**
 * Main function to synchronize team data across all leagues
 */
async function syncTeams() {
  let client = null;
  try {
    // Initialize database manager
    await initializeDatabaseManager();
    
    // Connect to MongoDB directly as backup if DatabaseManager fails
    if (!dbManager || !dbManager.client) {
      logger.warn('Database manager not available, using direct MongoDB connection');
      client = await MongoClient.connect(MONGODB_URI, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
        maxPoolSize: parseInt(process.env.DB_MAX_POOL_SIZE, 10) || 10,
        minPoolSize: parseInt(process.env.DB_MIN_POOL_SIZE, 10) || 1,
        connectTimeoutMS: parseInt(process.env.CONNECT_TIMEOUT_MS, 10) || 5000,
        socketTimeoutMS: parseInt(process.env.SOCKET_TIMEOUT_MS, 10) || 10000
      });
      
      logger.info('MongoDB connection established for team data synchronization');
    }
    
    const db = dbManager?.client?.db(DB_NAME) || client.db(DB_NAME);
    
    // Ensure teams collection exists with proper indexes
    await ensureTeamsCollection(db);
    
    // Sync for each league
    for (const league of SUPPORTED_LEAGUES) {
      try {
        await syncLeagueTeams(db, league, API_CONFIG[league]);
      } catch (leagueError) {
        logger.error(`Error syncing ${league} teams:`, leagueError);
        // Continue with other leagues even if one fails
      }
    }
    
    logger.info('Team data synchronization completed');
    
  } catch (error) {
    logger.error('Error in team data synchronization:', error);
    throw error;
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
 */
async function ensureTeamsCollection(db) {
  try {
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
    
    logger.info('Ensured indexes for teams collection');
  } catch (error) {
    logger.error('Error ensuring teams collection:', error);
    throw error;
  }
}

/**
 * Synchronize team data for a specific league
 * @param {Object} db - MongoDB database instance
 * @param {string} league - League identifier
 * @param {Object} config - API configuration for the league
 */
async function syncLeagueTeams(db, league, config) {
  try {
    logger.info(`Starting team data synchronization for ${league}`);
    
    // Fetch team data
    const teams = await fetchTeams(league, config);
    logger.info(`Fetched ${teams.length} teams for ${league}`);
    
    let updatedCount = 0;
    let insertedCount = 0;
    
    // Process each team
    for (const team of teams) {
      try {
        // Transform team data to our schema
        const transformedTeam = transformTeamData(team, league);
        
        // Update or insert team
        const result = await db.collection('teams').updateOne(
          { teamId: transformedTeam.teamId },
          { $set: transformedTeam },
          { upsert: true }
        );
        
        if (result.matchedCount > 0) {
          updatedCount++;
        } else if (result.upsertedCount > 0) {
          insertedCount++;
        }
      } catch (teamError) {
        logger.error(`Error processing team:`, teamError);
      }
    }
    
    logger.info(`${league} teams sync completed: ${insertedCount} inserted, ${updatedCount} updated`);
    
  } catch (error) {
    logger.error(`Error syncing ${league} teams:`, error);
    throw error;
  }
}

/**
 * Fetch teams for a league
 * @param {string} league - League identifier
 * @param {Object} config - API configuration
 * @returns {Promise<Array>} Teams
 */
async function fetchTeams(league, config) {
  try {
    // Set up API request parameters
    let endpoint = config.teamsEndpoint;
    
    logger.debug(`Requesting ${league} teams`);
    
    // Make API request
    const response = await axios.get(`${config.url}${endpoint}`, {
      headers: {
        'Ocp-Apim-Subscription-Key': config.key
      },
      timeout: 30000 // 30 second timeout
    });
    
    if (!response.data || !Array.isArray(response.data)) {
      logger.warn(`No ${league} teams returned from API.`);
      return [];
    }
    
    return response.data;
    
  } catch (error) {
    logger.error(`Error fetching ${league} teams:`, error);
    return [];
  }
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
    abbreviation: team.Abbreviation || team.abbreviation,
    city: team.City || team.city,
    stadium: team.Stadium || team.stadium,
    logo: team.WikipediaLogoUrl || team.logo,
    createdAt: new Date(),
    updatedAt: new Date()
  };
}

// Schedule the sync to run daily at 3 AM
cron.schedule('0 3 * * *', () => {
  logger.info('Starting scheduled team data synchronization');
  syncTeams().catch(error => logger.error('Scheduled sync failed:', error));
});

// Run sync immediately on startup
syncTeams().catch(error => logger.error('Initial sync failed:', error));

// Execute directly if run from command line
if (require.main === module) {
  syncTeams()
    .then(() => {
      logger.info('Team data synchronization executed successfully');
      process.exit(0);
    })
    .catch(error => {
      logger.error('Team data synchronization failed:', error);
      process.exit(1);
    });
