// scripts/sync-teams.js
// Updated for TheSportsDB v2 integration with premium key
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
  defaultMeta: { service: 'sync-teams', version: '2.0.0' },
  transports: [
    new winston.transports.File({
      filename: 'logs/teams-error.log',
      level: 'error',
      maxsize: parseInt(process.env.LOG_FILE_MAX_SIZE, 10) || 10000000,
      maxFiles: parseInt(process.env.LOG_MAX_FILES, 10) || 5,
      tailable: true
    }),
    new winston.transports.File({
      filename: 'logs/teams.log',
      maxsize: parseInt(process.env.LOG_FILE_MAX_SIZE, 10) || 10000000,
      maxFiles: parseInt(process.env.LOG_MAX_FILES, 10) || 5,
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

// TheSportsDB V2 API configuration
const SPORTSDB_API_KEY = process.env.SPORTSDB_API_KEY || '447279';
const SPORTSDB_BASE_URL = process.env.SPORTSDB_BASE_URL || 'https://www.thesportsdb.com/api/v2/json';
const API_TIMEOUT = parseInt(process.env.SPORTSDB_REQUEST_TIMEOUT, 10) || 30000;

// Supported leagues with TheSportsDB league IDs
const SUPPORTED_LEAGUES = [
  'NFL', 'NBA', 'MLB', 'NHL',
  'PREMIER_LEAGUE', 'LA_LIGA', 'BUNDESLIGA', 'SERIE_A'
];

// League ID mapping for TheSportsDB
const LEAGUE_IDS = {
  NFL: 4391,
  NBA: 4387,
  MLB: 4424,
  NHL: 4380,
  PREMIER_LEAGUE: 4328,
  LA_LIGA: 4335,
  BUNDESLIGA: 4331,
  SERIE_A: 4332
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
        maxPoolSize: parseInt(process.env.DB_MAX_POOL_SIZE, 10) || 50,
        minPoolSize: parseInt(process.env.DB_MIN_POOL_SIZE, 10) || 5,
        connectTimeoutMS: parseInt(process.env.CONNECT_TIMEOUT_MS, 10) || 10000,
        socketTimeoutMS: parseInt(process.env.SOCKET_TIMEOUT_MS, 10) || 30000
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
    await initializeDatabaseManager();

    if (!dbManager || !dbManager.client) {
      logger.warn('Database manager not available, using direct MongoDB connection');
      client = await MongoClient.connect(MONGODB_URI, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
        maxPoolSize: parseInt(process.env.DB_MAX_POOL_SIZE, 10) || 50,
        minPoolSize: parseInt(process.env.DB_MIN_POOL_SIZE, 10) || 5,
        connectTimeoutMS: parseInt(process.env.CONNECT_TIMEOUT_MS, 10) || 10000,
        socketTimeoutMS: parseInt(process.env.SOCKET_TIMEOUT_MS, 10) || 30000
      });

      logger.info('MongoDB connection established for team data synchronization');
    }

    const db = dbManager?.client?.db(DB_NAME) || client.db(DB_NAME);

    await ensureTeamsCollection(db);

    for (const league of SUPPORTED_LEAGUES) {
      try {
        await syncLeagueTeams(db, league);
      } catch (leagueError) {
        logger.error(`Error syncing ${league} teams:`, leagueError);
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
    const collections = await db.listCollections({ name: 'teams' }).toArray();
    if (collections.length === 0) {
      await db.createCollection('teams');
      logger.info('Created teams collection');
    }

    await db.collection('teams').createIndex({ teamId: 1 }, { unique: true });
    await db.collection('teams').createIndex({ league: 1 });
    await db.collection('teams').createIndex({ name: 'text' });

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
 */
async function syncLeagueTeams(db, league) {
  try {
    logger.info(`Starting team data synchronization for ${league} (v2)`);

    const teams = await fetchTeams(league);
    logger.info(`Fetched ${teams.length} teams for ${league}`);

    let updatedCount = 0;
    let insertedCount = 0;

    for (const team of teams) {
      try {
        const transformedTeam = transformTeamData(team, league);

        // Skip teams with invalid or missing IDs
        if (!transformedTeam.teamId) {
          logger.warn(`Skipping team with missing ID: ${JSON.stringify(team).substring(0, 100)}...`);
          continue;
        }

        const result = await db.collection('teams').updateOne(
          { teamId: transformedTeam.teamId },
          { $set: transformedTeam },
          { upsert: true }
        );

        if (result.matchedCount > 0) updatedCount++;
        else if (result.upsertedCount > 0) insertedCount++;
      } catch (teamError) {
        logger.error(`Error processing team:`, teamError);
      }
    }

    logger.info(`${league} teams sync completed: ${insertedCount} inserted, ${updatedCount} updated`);

  } catch (error) {
    logger.error(`Error syncing ${league} teams (v2):`, error);
    throw error;
  }
}

/**
 * Fetch teams for a league using TheSportsDB V2 API
 * @param {string} league - League identifier
 * @returns {Promise<Array>} Teams
 */
async function fetchTeams(league) {
  try {
    const leagueId = LEAGUE_IDS[league];
    
    // Using lookup_all_teams endpoint to get all teams in a league
    const url = `${SPORTSDB_BASE_URL}/${SPORTSDB_API_KEY}/lookup_all_teams.php?id=${leagueId}`;
    
    logger.debug(`Requesting teams from: ${url}`);
    
    const response = await axios.get(url, { timeout: API_TIMEOUT });
    
    if (!response.data || !response.data.teams || !Array.isArray(response.data.teams)) {
      logger.warn(`No ${league} teams returned from TheSportsDB v2`);
      return [];
    }
    
    return response.data.teams;
  } catch (error) {
    logger.error(`Error fetching ${league} teams (v2):`, error);
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
    teamId: team.idTeam,
    league,
    name: team.strTeam,
    alternateNames: [
      team.strAlternate || '',
      team.strTeamShort || ''
    ].filter(Boolean),
    abbreviation: team.strTeamShort || '',
    city: team.strStadiumLocation || '',
    country: team.strCountry || '',
    founded: team.intFormedYear || null,
    website: team.strWebsite || '',
    facebook: team.strFacebook || '',
    twitter: team.strTwitter || '',
    instagram: team.strInstagram || '',
    description: team.strDescriptionEN || '',
    stadium: {
      name: team.strStadium || '',
      location: team.strStadiumLocation || '',
      capacity: parseInt(team.intStadiumCapacity) || 0,
      description: team.strStadiumDescription || ''
    },
    logos: {
      main: team.strTeamBadge || '',
      alt: team.strTeamJersey || '',
      banner: team.strTeamBanner || '',
      logo: team.strTeamLogo || '',
      fanart: team.strTeamFanart1 || ''
    },
    colors: {
      primary: team.strPrimaryColor || '',
      secondary: team.strSecondaryColor || '',
      tertiary: team.strTertiaryColor || ''
    },
    createdAt: new Date(),
    updatedAt: new Date(),
    metadata: {
      source: 'TheSportsDB-V2',
      lastSynced: new Date()
    }
  };
}

// Schedule the sync to run daily at 3:00 AM
cron.schedule('0 3 * * *', async () => {
  try {
    logger.info('Starting scheduled team data synchronization (v2)');
    await syncTeams();
    logger.info('Scheduled team data synchronization completed successfully (v2)');
  } catch (error) {
    logger.error('Scheduled team data synchronization failed (v2):', error);
  }
});

// Run sync immediately on startup
syncTeams().catch(error => logger.error('Initial sync failed (v2):', error));

// Execute directly if run from command line
if (require.main === module) {
  syncTeams()
    .then(() => { logger.info('Team data synchronization executed successfully (v2)'); process.exit(0); })
    .catch(error => { logger.error('Team data synchronization failed (v2):', error); process.exit(1); });
}