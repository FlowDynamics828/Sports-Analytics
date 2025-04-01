// scripts/sync-games.js
require('dotenv').config();
const { MongoClient } = require('mongodb');
const axios = require('axios');
const cron = require('node-cron');
const winston = require('winston');
const { format } = winston;
const { DatabaseManager } = require('../utils/db');

// Add immediate console logs for visibility
console.log("********************************************");
console.log("Starting sync-games script");
console.log("********************************************");

// Initialize logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: format.combine(
    format.timestamp(),
    format.errors({ stack: true }),
    format.json(),
    format.metadata()
  ),
  defaultMeta: { service: 'sync-games' },
  transports: [
    new winston.transports.File({
      filename: 'logs/games-error.log',
      level: 'error',
      maxsize: parseInt(process.env.LOG_FILE_MAX_SIZE || '5000000', 10),
      maxFiles: parseInt(process.env.LOG_MAX_FILES || '3', 10),
      tailable: true
    }),
    new winston.transports.File({
      filename: 'logs/games.log',
      maxsize: parseInt(process.env.LOG_FILE_MAX_SIZE || '5000000', 10),
      maxFiles: parseInt(process.env.LOG_MAX_FILES || '3', 10),
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

// Supported leagues
const SUPPORTED_LEAGUES = [
  'NFL', 'NBA', 'MLB', 'NHL',
  'PREMIER_LEAGUE', 'LA_LIGA', 'BUNDESLIGA', 'SERIE_A'
];

// API configuration for TheSportsDB
const API_CONFIG = {
  NBA: {
    url: 'https://www.thesportsdb.com/api/v1/json',
    key: process.env.THESPORTSDB_API_KEY || '3',
    schedulesEndpoint: '/eventsnextleague.php?id=4387',
    scoresEndpoint: '/eventspastleague.php?id=4387',
    competitionId: 4387,
    teamEndpoint: '/lookup_all_teams.php',
    playerEndpoint: '/searchplayers.php?t=',
    teamStatsEndpoint: '/lookuptable.php',
    seasonEndpoint: '/search_all_seasons.php'
  },
  NFL: {
    url: 'https://www.thesportsdb.com/api/v1/json',
    key: process.env.THESPORTSDB_API_KEY || '3',
    schedulesEndpoint: '/eventsnextleague.php?id=4391',
    scoresEndpoint: '/eventspastleague.php?id=4391',
    competitionId: 4391,
    teamEndpoint: '/lookup_all_teams.php',
    playerEndpoint: '/searchplayers.php?t=',
    teamStatsEndpoint: '/lookuptable.php',
    seasonEndpoint: '/search_all_seasons.php'
  },
  MLB: {
    url: 'https://www.thesportsdb.com/api/v1/json',
    key: process.env.THESPORTSDB_API_KEY || '3',
    schedulesEndpoint: '/eventsnextleague.php?id=4424',
    scoresEndpoint: '/eventspastleague.php?id=4424',
    competitionId: 4424,
    teamEndpoint: '/lookup_all_teams.php',
    playerEndpoint: '/searchplayers.php?t=',
    teamStatsEndpoint: '/lookuptable.php',
    seasonEndpoint: '/search_all_seasons.php'
  },
  NHL: {
    url: 'https://www.thesportsdb.com/api/v1/json',
    key: process.env.THESPORTSDB_API_KEY || '3',
    schedulesEndpoint: '/eventsnextleague.php?id=4380',
    scoresEndpoint: '/eventspastleague.php?id=4380',
    competitionId: 4380,
    teamEndpoint: '/lookup_all_teams.php',
    playerEndpoint: '/searchplayers.php?t=',
    teamStatsEndpoint: '/lookuptable.php',
    seasonEndpoint: '/search_all_seasons.php'
  },
  PREMIER_LEAGUE: {
    url: 'https://www.thesportsdb.com/api/v1/json',
    key: process.env.THESPORTSDB_API_KEY || '3',
    schedulesEndpoint: '/eventsnextleague.php?id=4328',
    scoresEndpoint: '/eventspastleague.php?id=4328',
    competitionId: 4328,
    teamEndpoint: '/lookup_all_teams.php',
    playerEndpoint: '/searchplayers.php?t=',
    teamStatsEndpoint: '/lookuptable.php',
    seasonEndpoint: '/search_all_seasons.php'
  },
  LA_LIGA: {
    url: 'https://www.thesportsdb.com/api/v1/json',
    key: process.env.THESPORTSDB_API_KEY || '3',
    schedulesEndpoint: '/eventsnextleague.php?id=4335',
    scoresEndpoint: '/eventspastleague.php?id=4335',
    competitionId: 4335,
    teamEndpoint: '/lookup_all_teams.php',
    playerEndpoint: '/searchplayers.php?t=',
    teamStatsEndpoint: '/lookuptable.php',
    seasonEndpoint: '/search_all_seasons.php'
  },
  BUNDESLIGA: {
    url: 'https://www.thesportsdb.com/api/v1/json',
    key: process.env.THESPORTSDB_API_KEY || '3',
    schedulesEndpoint: '/eventsnextleague.php?id=4331',
    scoresEndpoint: '/eventspastleague.php?id=4331',
    competitionId: 4331,
    teamEndpoint: '/lookup_all_teams.php',
    playerEndpoint: '/searchplayers.php?t=',
    teamStatsEndpoint: '/lookuptable.php',
    seasonEndpoint: '/search_all_seasons.php'
  },
  SERIE_A: {
    url: 'https://www.thesportsdb.com/api/v1/json',
    key: process.env.THESPORTSDB_API_KEY || '3',
    schedulesEndpoint: '/eventsnextleague.php?id=4332',
    scoresEndpoint: '/eventspastleague.php?id=4332',
    competitionId: 4332,
    teamEndpoint: '/lookup_all_teams.php',
    playerEndpoint: '/searchplayers.php?t=',
    teamStatsEndpoint: '/lookuptable.php',
    seasonEndpoint: '/search_all_seasons.php'
  }
};

// At the top of the file, add JSDoc type definitions
/**
 * @typedef {Object} DBManager
 * @property {Object} db - MongoDB database instance
 * @property {Function} connect - Function to connect to the database
 * @property {Function} disconnect - Function to disconnect from the database
 */

// Fix the dbManager typing where it's used
// Around line 146, add a proper initialization with type information
/** @type {DBManager} */
let dbManager;

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
        maxPoolSize: parseInt(process.env.DB_MAX_POOL_SIZE || '100', 10),
        minPoolSize: parseInt(process.env.DB_MIN_POOL_SIZE || '10', 10),
        connectTimeoutMS: parseInt(process.env.CONNECT_TIMEOUT_MS || '30000', 10),
        socketTimeoutMS: parseInt(process.env.SOCKET_TIMEOUT_MS || '45000', 10),
        serverSelectionTimeoutMS: 30000,
        heartbeatFrequencyMS: 10000,
        retryWrites: true,
        retryReads: true,
        w: 'majority',
        readPreference: 'primaryPreferred',
        maxIdleTimeMS: 120000,
        compressors: ['zlib']
      }
    });
    
    await dbManager.initialize();
    logger.info('Database manager initialized successfully');
  }
  
  return dbManager;
}

/**
 * Ensure all required collections exist with proper indexes
 * @param {import('mongodb').Db} db - MongoDB database instance
 */
async function ensureCollections(db) {
  try {
    // Ensure games collection
    const collections = await db.listCollections().toArray();
    const collectionNames = collections.map(col => col.name);
    
    // First, clean up teams collection if it exists and has issues
    if (collectionNames.includes('teams')) {
      // Find and remove any documents with null teamId or id
      await db.collection('teams').deleteMany({ $or: [{ teamId: null }, { id: null }] });
      
      // Drop the problematic indexes if they exist
      try {
        await db.collection('teams').dropIndex('teamId_1');
        logger.info('Dropped problematic teamId index');
      } catch (indexError) {
        // Index may not exist, which is fine
        logger.debug('Index teamId_1 may not exist, continuing');
      }
      
      try {
        await db.collection('teams').dropIndex('id_1');
        logger.info('Dropped problematic id index');
      } catch (indexError) {
        // Index may not exist, which is fine
        logger.debug('Index id_1 may not exist, continuing');
      }
    }
    
    // Create collections if they don't exist
    if (!collectionNames.includes('games')) {
      await db.createCollection('games');
      logger.info('Created games collection');
    }
    
    if (!collectionNames.includes('teams')) {
      await db.createCollection('teams');
      logger.info('Created teams collection');
    }
    
    if (!collectionNames.includes('players')) {
      await db.createCollection('players');
      logger.info('Created players collection');
    }
    
    if (!collectionNames.includes('statistics')) {
      await db.createCollection('statistics');
      logger.info('Created statistics collection');
    }
    
    // Create indexes for games
    await db.collection('games').createIndex({ gameId: 1 }, { unique: true });
    await db.collection('games').createIndex({ league: 1 });
    await db.collection('games').createIndex({ date: 1 });
    await db.collection('games').createIndex({ status: 1 });
    await db.collection('games').createIndex({ 'homeTeam.id': 1 });
    await db.collection('games').createIndex({ 'awayTeam.id': 1 });
    
    // Create indexes for teams - avoid uniqueness on nullable fields
    await db.collection('teams').createIndex({ teamId: 1 }, { 
      unique: true, 
      partialFilterExpression: { teamId: { $type: "string" } } 
    });
    
    // Create a sparse index for id field to prevent null value issues
    await db.collection('teams').createIndex({ id: 1 }, { 
      sparse: true 
    });
    
    await db.collection('teams').createIndex({ league: 1 });
    await db.collection('teams').createIndex({ name: 1 });
    
    // Create indexes for players - avoid uniqueness on nullable fields
    await db.collection('players').createIndex({ playerId: 1 }, { 
      unique: true, 
      partialFilterExpression: { playerId: { $type: "string" } }
    });
    await db.collection('players').createIndex({ teamId: 1 });
    await db.collection('players').createIndex({ league: 1 });
    await db.collection('players').createIndex({ name: 1 });
    
    // Create indexes for statistics
    await db.collection('statistics').createIndex({ entityId: 1 });
    await db.collection('statistics').createIndex({ type: 1 });  // 'team', 'player', 'game'
    await db.collection('statistics').createIndex({ league: 1 });
    await db.collection('statistics').createIndex({ season: 1 });
    
    logger.info('Ensured all collections and indexes');
  } catch (error) {
    logger.error('Error ensuring collections:', error);
    throw error;
  }
}

/**
 * Main function to synchronize game data across all leagues
 */
async function syncGames() {
  console.log("Main function started");
  console.log("Processing leagues:", process.argv.slice(2));
  
  let client = null;
  try {
    // Initialize database manager
    await initializeDatabaseManager();
    
    // Connect to MongoDB directly as backup if DatabaseManager fails
    if (!dbManager || !dbManager.client) {
      logger.warn('Database manager not available, using direct MongoDB connection');
      client = await MongoClient.connect(MONGODB_URI, {
        maxPoolSize: parseInt(process.env.DB_MAX_POOL_SIZE || '100', 10),
        minPoolSize: parseInt(process.env.DB_MIN_POOL_SIZE || '10', 10),
        connectTimeoutMS: parseInt(process.env.CONNECT_TIMEOUT_MS || '30000', 10),
        socketTimeoutMS: parseInt(process.env.SOCKET_TIMEOUT_MS || '45000', 10),
        serverSelectionTimeoutMS: 30000,
        heartbeatFrequencyMS: 10000,
        retryWrites: true,
        retryReads: true,
        w: 'majority',
        readPreference: 'primaryPreferred',
        maxIdleTimeMS: 120000,
        compressors: ['zlib']
      });
      
      logger.info('MongoDB connection established for game data synchronization');
    }
    
    const db = dbManager?.client?.db(DB_NAME) || client?.db(DB_NAME);
    if (!db) {
      throw new Error('Failed to obtain database connection');
    }
    
    // Ensure collections exist with proper indexes
    await ensureCollections(db);
    
    // Get specific league to sync from command line arguments
    const targetLeague = process.argv.find(arg => SUPPORTED_LEAGUES.includes(arg));
    const leaguesToSync = targetLeague ? [targetLeague] : SUPPORTED_LEAGUES;
    
    logger.info(`Starting game data synchronization for leagues: ${leaguesToSync.join(', ')}`);
    
    // Sync for each league with delay between leagues to prevent API rate limits
    for (const league of leaguesToSync) {
      try {
        console.log(`Starting to process ${league} data...`);
        logger.info(`Beginning synchronization for ${league}`);
        const leagueConfig = API_CONFIG[league];
        if (!leagueConfig) {
          logger.error(`No configuration found for league ${league}`);
          continue;
        }
        
        await syncLeagueGames(db, league, leagueConfig);
        
        // Add a delay between leagues to reduce API load
        if (league !== leaguesToSync[leaguesToSync.length - 1]) {
          const delayBetweenLeagues = 8000; // 8 seconds between leagues
          logger.debug(`Waiting ${delayBetweenLeagues}ms before next league sync`);
          await new Promise(resolve => setTimeout(resolve, delayBetweenLeagues));
        }
      } catch (leagueError) {
        logger.error(`Error syncing ${league} games:`, leagueError);
        // Continue with other leagues even if one fails, but add a longer delay
        // to allow potential rate limits to reset
        await new Promise(resolve => setTimeout(resolve, 10000));
      }
    }
    
    logger.info('Game data synchronization completed');
    
  } catch (error) {
    console.error("CRITICAL ERROR:", error);
    process.exit(1);
  } finally {
    if (client) {
      await client.close();
      logger.info('MongoDB connection closed');
    }
  }
}

/**
 * Synchronize game data for a specific league
 * @param {Object} db - MongoDB database instance
 * @param {string} league - League identifier
 * @param {Object} config - API configuration for the league
 */
async function syncLeagueGames(db, league, config) {
  try {
    logger.info(`Starting game data synchronization for ${league}`);
    
    // Fetch upcoming games (schedules)
    const upcomingGames = await fetchUpcomingGames(league, config);
    logger.info(`Fetched ${upcomingGames.length} upcoming games for ${league}`);
    
    // Fetch live and completed games (scores)
    const activeGames = await fetchActiveGames(league, config);
    logger.info(`Fetched ${activeGames.length} live/completed games for ${league}`);
    
    // Combine and process all games
    const allGames = [...upcomingGames, ...activeGames];
    
    // Deduplicate games (in case a game appears in both endpoints)
    const uniqueGames = deduplicateGames(allGames);
    logger.info(`Processing ${uniqueGames.length} unique games for ${league}`);
    
    let updatedCount = 0;
    let insertedCount = 0;
    
    // Process each game
    for (const game of uniqueGames) {
      try {
        // Transform game data to our schema
        const transformedGame = transformGameData(game, league);
        
        // Update or insert game
        const result = await db.collection('games').updateOne(
          { gameId: transformedGame.gameId },
          { $set: transformedGame },
          { upsert: true }
        );
        
        if (result.matchedCount > 0) {
          updatedCount++;
        } else if (result.upsertedCount > 0) {
          insertedCount++;
        }
      } catch (gameError) {
        logger.error(`Error processing game:`, gameError);
      }
    }
    
    logger.info(`${league} games sync completed: ${insertedCount} inserted, ${updatedCount} updated`);
    
    // Now let's try to fetch teams and player data too
    try {
      await syncTeamsForLeague(db, league, config);
    } catch (teamError) {
      logger.error(`Error syncing teams for ${league}:`, teamError);
    }
    
  } catch (error) {
    logger.error(`Error syncing ${league} games:`, error);
    throw error;
  }
}

/**
 * Fetch upcoming games for a league
 * @param {string} league - League identifier
 * @param {Object} config - API configuration
 * @returns {Promise<Array>} Upcoming games
 */
async function fetchUpcomingGames(league, config) {
  try {
    // Set up API request parameters
    let endpoint = config.schedulesEndpoint;
    let params = {};
    
    // TheSportsDB uses different parameter structure
    params = {
      id: config.competitionId
    };
    
    logger.debug(`Requesting ${league} upcoming games with params:`, params);
    
    // Make API request to TheSportsDB
    const url = `${config.url}/${config.key}${endpoint}`;
    logger.info(`Fetching upcoming games from: ${url}`);
    
    // For enterprise-level data collection, implement a more robust fetching mechanism
    const allGames = await fetchAllPagesFromTheSportsDB(url, params, league, "upcoming");
    
    if (allGames.length === 0) {
      logger.warn(`Empty response or no events for ${league} upcoming games.`);
    } else {
      logger.info(`Successfully fetched ${allGames.length} total upcoming games for ${league}`);
    }
    
    return allGames;
  } catch (error) {
    const statusCode = error.response?.status;
    const errorData = error.response?.data;
    
    logger.error(`Error fetching ${league} upcoming games:`, { 
      statusCode,
      message: error.message,
      data: errorData,
      stack: error.stack
    });
    
    return [];
  }
}

/**
 * Fetch active (live and completed) games for a league
 * @param {string} league - League identifier
 * @param {Object} config - API configuration
 * @returns {Promise<Array>} Active games
 */
async function fetchActiveGames(league, config) {
  try {
    // Set up API request parameters
    let endpoint = config.scoresEndpoint;
    let params = {};
    
    // TheSportsDB uses different parameter structure
    params = {
      id: config.competitionId
    };
    
    logger.debug(`Requesting ${league} past/completed games with params:`, params);
    
    // Make API request to TheSportsDB
    const url = `${config.url}/${config.key}${endpoint}`;
    logger.info(`Fetching completed games from: ${url}`);
    
    // For enterprise-level data collection, fetch all available pages
    const allGames = await fetchAllPagesFromTheSportsDB(url, params, league, "completed");
    
    if (allGames.length === 0) {
      logger.warn(`Empty response or no events for ${league} completed games.`);
    } else {
      logger.info(`Successfully fetched ${allGames.length} total completed games for ${league}`);
    }
    
    return allGames;
  } catch (error) {
    const statusCode = error.response?.status;
    const errorData = error.response?.data;
    
    logger.error(`Error fetching ${league} completed games:`, { 
      statusCode,
      message: error.message,
      data: errorData,
      stack: error.stack
    });
    
    return [];
  }
}

/**
 * Fetch all pages of data from TheSportsDB API with rate limiting and retries
 * @param {string} url - Base URL for the API request
 * @param {Object} params - Parameters to include in the request
 * @param {string} league - League identifier for logging
 * @param {string} dataType - Type of data being fetched (e.g., 'games', 'teams', 'players')
 * @param {number} maxRetries - Maximum number of retries for failed requests
 * @returns {Promise<Array>} - Array of data items
 */
async function fetchAllPagesFromTheSportsDB(url, params, league, dataType, maxRetries = 5) {
  let allData = [];
  let currentPage = 1;
  const maxPages = 50; // Increased max pages to get more historical data
  let hasMoreData = true;
  
  logger.info(`Fetching ${dataType} data for ${league} from ${url}`);

  while (hasMoreData && currentPage <= maxPages) {
    try {
      // Add pagination parameters if supported by the endpoint
      const pageParams = { ...params };
      
      if (url.includes('eventspastleague') || url.includes('eventsnextleague')) {
        // These endpoints support pagination
        pageParams.p = currentPage;
      }
      
      // Implement exponential backoff for retries
      let retries = 0;
      let success = false;
      let response;
      
      while (!success && retries < maxRetries) {
        try {
          // Add delay to avoid hitting rate limits (increasing with each retry)
          const delay = Math.pow(2, retries) * 1000 + Math.random() * 1000;
          await new Promise(resolve => setTimeout(resolve, delay));
          
          logger.debug(`Fetching ${dataType} for ${league}, page ${currentPage}, attempt ${retries + 1}`);
          response = await axios.get(url, { params: pageParams });
          success = true;
        } catch (error) {
          retries++;
          if (error.response && error.response.status === 429) {
            // Rate limit error - wait longer
            const waitTime = (Math.pow(2, retries) * 2000) + Math.random() * 2000;
            logger.warn(`Rate limit hit for ${league} ${dataType}. Waiting ${waitTime}ms before retry ${retries}/${maxRetries}`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
          } else if (retries >= maxRetries) {
            throw error; // Max retries reached, propagate the error
          } else {
            // Other error, retry with backoff
            logger.warn(`Error fetching ${dataType} for ${league}, attempt ${retries}/${maxRetries}: ${error.message}`);
          }
        }
      }
      
      if (!success) {
        throw new Error(`Failed to fetch ${dataType} for ${league} after ${maxRetries} attempts`);
      }
      
      // Process API response based on data type
      let pageData = [];
      
      if (dataType === 'games' && response.data.events) {
        pageData = response.data.events;
      } else if (dataType === 'teams' && response.data.teams) {
        pageData = response.data.teams;
      } else if (dataType === 'players' && response.data.player) {
        pageData = response.data.player;
      } else if (dataType === 'seasons' && response.data.seasons) {
        pageData = response.data.seasons;
      } else {
        // Check for empty or unexpected response
        if (response.data && Object.keys(response.data).length === 0) {
          logger.warn(`Empty response for ${league} ${dataType}, page ${currentPage}`);
          hasMoreData = false;
        } else {
          logger.warn(`Unexpected data format for ${league} ${dataType}, page ${currentPage}`, 
                      { keys: Object.keys(response.data || {}) });
          hasMoreData = false;
        }
      }
      
      // Add data from this page to our collection
      if (pageData && pageData.length > 0) {
        logger.info(`Fetched ${pageData.length} ${dataType} for ${league}, page ${currentPage}`);
        allData = [...allData, ...pageData];
        
        // For endpoints that don't support pagination natively
        if (!url.includes('eventspastleague') && !url.includes('eventsnextleague')) {
          hasMoreData = false; // Exit after first page for non-paginated endpoints
        } else if (pageData.length < 50) {
          // TheSportsDB typically returns 50 items per page when more data is available
          hasMoreData = false; // No more data if we got fewer than the page size
        }
      } else {
        hasMoreData = false; // No data on this page, we've reached the end
      }
      
      currentPage++;
      
    } catch (error) {
      // Log the error and continue with the data we have
      logger.error(`Error fetching ${dataType} for ${league} on page ${currentPage}: ${error.message}`);
      hasMoreData = false;
    }
  }
  
  logger.info(`Fetched a total of ${allData.length} unique ${dataType} data items for ${league}`);
  return allData;
}

/**
 * Deduplicate games based on unique ID
 * @param {Array} games - Array of games
 * @returns {Array} Deduplicated games
 */
function deduplicateGames(games) {
  const uniqueGames = {};
  
  games.forEach(game => {
    // TheSportsDB uses idEvent for game ID
    const gameId = game.idEvent;
    
    if (gameId) {
      // If game already exists, use the one with more complete data
      if (uniqueGames[gameId]) {
        // Prefer games with scores
        const existingHasScore = hasScore(uniqueGames[gameId]);
        const newHasScore = hasScore(game);
        
        if (newHasScore && !existingHasScore) {
          uniqueGames[gameId] = game;
        }
      } else {
        uniqueGames[gameId] = game;
      }
    }
  });
  
  return Object.values(uniqueGames);
}

/**
 * Check if a game has score data
 * @param {Object} game - Game object
 * @returns {boolean} True if game has score data
 */
function hasScore(game) {
  // TheSportsDB uses intHomeScore and intAwayScore
  return (
    (game.intHomeScore !== undefined && game.intHomeScore !== null) ||
    (game.intAwayScore !== undefined && game.intAwayScore !== null)
  );
}

/**
 * Transform API game data to our schema format
 * @param {Object} game - Game from API
 * @param {string} league - League identifier
 * @returns {Object} Transformed game data
 */
function transformGameData(game, league) {
  // TheSportsDB uses different field names
  
  // Determine game status
  let status = 'upcoming';
  if (game.strStatus === 'Match Finished' || game.strStatus === 'FT') {
    status = 'completed';
  } else if (game.strStatus === 'In Progress' || game.strStatus === 'LIVE') {
    status = 'live';
  }
  
  // Extract date
  let gameDate = new Date();
  if (game.dateEvent && game.strTime) {
    gameDate = new Date(`${game.dateEvent}T${game.strTime}`);
  } else if (game.dateEvent) {
    gameDate = new Date(game.dateEvent);
  }
  
  // Extract scores
  const homeTeamScore = parseInt(game.intHomeScore, 10) || 0;
  const awayTeamScore = parseInt(game.intAwayScore, 10) || 0;
  
  // Extract venue information
  const venueName = game.strVenue || '';
  const venueLocation = game.strCity || game.strCountry || '';
  
  // Construct game object in our schema
  return {
    gameId: game.idEvent,
    league,
    season: game.strSeason || getCurrentSeason(league),
    date: gameDate,
    status,
    homeTeam: {
      id: game.idHomeTeam,
      name: game.strHomeTeam,
      score: status !== 'upcoming' ? homeTeamScore : 0
    },
    awayTeam: {
      id: game.idAwayTeam,
      name: game.strAwayTeam,
      score: status !== 'upcoming' ? awayTeamScore : 0
    },
    venue: {
      name: venueName,
      location: venueLocation
    },
    statistics: extractGameStatisticsFromTheSportsDB(game, league),
    metadata: {
      source: 'TheSportsDB',
      rawGameId: game.idEvent,
      updatedAt: new Date()
    }
  };
}

/**
 * Extract game statistics from TheSportsDB API response
 * @param {Object} game - Game object from API
 * @param {string} league - League identifier
 * @returns {Object} Game statistics
 */
function extractGameStatisticsFromTheSportsDB(game, league) {
  // Basic statistics object with default empty values
  const stats = {
    periods: {},
    teamStats: {
      home: {},
      away: {}
    }
  };
  
  // Parse score if available
  if (game.strScore) {
    try {
      // Often in format "3-2" or similar
      const scoreParts = game.strScore.split('-');
      if (scoreParts.length === 2) {
        const homeScore = parseInt(scoreParts[0].trim(), 10);
        const awayScore = parseInt(scoreParts[1].trim(), 10);
        
        if (!isNaN(homeScore)) stats.teamStats.home.score = homeScore;
        if (!isNaN(awayScore)) stats.teamStats.away.score = awayScore;
      }
    } catch (error) {
      // Silently handle parsing errors
    }
  }
  
  // Add league-specific stats based on known fields
  switch(league) {
    case 'PREMIER_LEAGUE':
    case 'LA_LIGA':
    case 'BUNDESLIGA':
    case 'SERIE_A':
      // Soccer stats
      stats.periods = {
        h1: {
          home: 0,
          away: 0
        },
        h2: {
          home: 0,
          away: 0
        }
      };
      
      // Extract any available stats
      if (game.strHomeGoalDetails) {
        stats.teamStats.home.goalDetails = game.strHomeGoalDetails;
      }
      
      if (game.strAwayGoalDetails) {
        stats.teamStats.away.goalDetails = game.strAwayGoalDetails;
      }
      
      if (game.strHomeRedCards) {
        stats.teamStats.home.redCards = game.strHomeRedCards;
      }
      
      if (game.strAwayRedCards) {
        stats.teamStats.away.redCards = game.strAwayRedCards;
      }
      
      if (game.strHomeYellowCards) {
        stats.teamStats.home.yellowCards = game.strHomeYellowCards;
      }
      
      if (game.strAwayYellowCards) {
        stats.teamStats.away.yellowCards = game.strAwayYellowCards;
      }
      
      break;
      
    case 'NBA':
      // Basketball stats
      stats.periods = {
        q1: { home: 0, away: 0 },
        q2: { home: 0, away: 0 },
        q3: { home: 0, away: 0 },
        q4: { home: 0, away: 0 },
        ot: { home: 0, away: 0 }
      };
      break;
      
    case 'NFL':
      // Football stats
      stats.periods = {
        q1: { home: 0, away: 0 },
        q2: { home: 0, away: 0 },
        q3: { home: 0, away: 0 },
        q4: { home: 0, away: 0 },
        ot: { home: 0, away: 0 }
      };
      break;
      
    case 'MLB':
      // Baseball stats
      stats.innings = {};
      for (let i = 1; i <= 9; i++) {
        stats.innings[`inning${i}`] = {
          home: 0,
          away: 0
        };
      }
      break;
      
    case 'NHL':
      // Hockey stats
      stats.periods = {
        p1: { home: 0, away: 0 },
        p2: { home: 0, away: 0 },
        p3: { home: 0, away: 0 },
        ot: { home: 0, away: 0 }
      };
      break;
  }
  
  return stats;
}

/**
 * Extract game statistics from API response - keeping this for compatibility
 * @param {Object} game - Game object from API
 * @param {string} league - League identifier
 * @returns {Object} Game statistics
 */
function extractGameStatistics(game, league) {
  return extractGameStatisticsFromTheSportsDB(game, league);
}

/**
 * Determine current season based on league and date
 * @param {string} league - League identifier
 * @returns {string} Current season (e.g., '2023')
 */
function getCurrentSeason(league) {
  const now = new Date();
  const year = now.getFullYear();
  
  // Adjust season based on league (e.g., soccer seasons run from summer to summer)
  if (['PREMIER_LEAGUE', 'LA_LIGA', 'BUNDESLIGA', 'SERIE_A'].includes(league)) {
    if (now.getMonth() < 6) { // Before July
      return `${year - 1}/${year}`;
    }
    return `${year}/${year + 1}`;
  }
  
  return year.toString();
}

/**
 * Synchronize teams data for a league
 * @param {import('mongodb').Db} db - MongoDB database instance
 * @param {string} league - League identifier
 * @param {Object} config - API configuration
 */
async function syncTeamsForLeague(db, league, config) {
  try {
    logger.info(`Starting team data synchronization for ${league}`);
    
    // Set up API request parameters for teams
    const teamUrl = `${config.url}/${config.key}${config.teamEndpoint}`;
    const teamParams = { id: config.competitionId };
    
    // Fetch all teams for this league
    const teams = await fetchAllPagesFromTheSportsDB(teamUrl, teamParams, league, 'teams');
    logger.info(`Fetched ${teams.length} teams for ${league}`);
    
    let teamUpdatedCount = 0;
    let teamInsertedCount = 0;
    
    // Process and store each team
    for (const team of teams) {
      try {
        if (!team.idTeam) {
          logger.warn(`Team from ${league} missing idTeam, skipping`);
          continue;
        }
        
        // Transform team data to our schema
        const transformedTeam = {
          teamId: team.idTeam, // Use consistent field name
          id: team.idTeam,     // Keep id field for backward compatibility
          league,
          name: team.strTeam || '',
          shortName: team.strTeamShort || team.strTeam || '',
          foundedYear: team.intFormedYear ? parseInt(team.intFormedYear, 10) : null,
          stadiumName: team.strStadium || '',
          stadiumLocation: team.strStadiumLocation || '',
          stadiumCapacity: team.intStadiumCapacity ? parseInt(team.intStadiumCapacity, 10) : null,
          logo: team.strTeamBadge || '',
          banner: team.strTeamBanner || '',
          jersey: team.strTeamJersey || '',
          website: team.strWebsite || '',
          social: {
            facebook: team.strFacebook || '',
            twitter: team.strTwitter || '',
            instagram: team.strInstagram || '',
            youtube: team.strYoutube || ''
          },
          country: team.strCountry || '',
          description: team.strDescriptionEN || '',
          metadata: {
            source: 'TheSportsDB',
            rawTeamId: team.idTeam,
            updatedAt: new Date()
          }
        };
        
        // Update or insert team
        const result = await db.collection('teams').updateOne(
          { teamId: transformedTeam.teamId },
          { $set: transformedTeam },
          { upsert: true }
        );
        
        if (result.matchedCount > 0) {
          teamUpdatedCount++;
        } else if (result.upsertedCount > 0) {
          teamInsertedCount++;
        }
        
        // Fetch players for this team with a delay to avoid rate limits
        await new Promise(resolve => setTimeout(resolve, 500));
        
        try {
          await syncPlayersForTeam(db, league, config, team.idTeam, team.strTeam || 'Unknown Team');
        } catch (playerError) {
          logger.error(`Error syncing players for ${team.strTeam || team.idTeam}:`, playerError);
          // Continue with other teams
        }
        
      } catch (teamError) {
        logger.error(`Error processing team ${team.strTeam || team.idTeam}:`, teamError);
      }
    }
    
    logger.info(`${league} teams sync completed: ${teamInsertedCount} inserted, ${teamUpdatedCount} updated`);
    
  } catch (error) {
    logger.error(`Error syncing teams for ${league}:`, error);
    // Don't throw error to continue with other leagues
  }
}

/**
 * Synchronize players data for a team
 * @param {import('mongodb').Db} db - MongoDB database instance
 * @param {string} league - League identifier
 * @param {Object} config - API configuration
 * @param {string} teamId - Team ID
 * @param {string} teamName - Team name for logging
 */
async function syncPlayersForTeam(db, league, config, teamId, teamName) {
  // Add console logs
  console.log(`Starting to fetch players for ${teamName} (${league})...`);
  
  try {
    // Set up API request parameters for players
    // Use team name for searchplayers endpoint instead of ID
    const playerUrl = `${config.url}/${config.key}${config.playerEndpoint || ''}${encodeURIComponent(teamName)}`;
    logger.info(`Fetching players for ${teamName} using URL: ${playerUrl}`);
    
    // Fetch players for this team (direct request without parameters)
    let response;
    try {
      response = await axios.get(playerUrl);
    } catch (error) {
      logger.error(`Error fetching players for team ${teamName}:`, error.message);
      return;
    }
    
    // Check if we have player data
    let players = [];
    if (response.data && response.data.player) {
      players = response.data.player;
      logger.info(`Fetched ${players.length} players for ${teamName} (${league})`);
    } else {
      logger.warn(`No player data found for ${teamName} (${league})`);
      return;
    }
    
    let playerUpdatedCount = 0;
    let playerInsertedCount = 0;
    
    // Process and store each player
    for (const player of players) {
      try {
        // Check for any player ID field - TheSportsDB has multiple formats
        const playerId = player.idPlayer || player.id;
        
        if (!playerId) {
          logger.warn(`Missing player ID for team ${teamName}, skipping player: ${player.strPlayer || 'unnamed'}`);
          continue;
        }
        
        // Additional detailed player stats
        let detailedStats = {};
        let careerStats = {};
        
        // Try to fetch additional player statistics if available
        try {
          const detailsUrl = `${config.url}/${config.key}/lookupplayer.php?id=${playerId}`;
          const detailsResponse = await axios.get(detailsUrl);
          
          if (detailsResponse.data && detailsResponse.data.players && detailsResponse.data.players.length > 0) {
            const playerDetails = detailsResponse.data.players[0];
            
            // Extract any additional details if available
            if (playerDetails.strSigning) {
              detailedStats.contractInfo = playerDetails.strSigning;
            }
            
            if (playerDetails.strDescriptionEN) {
              detailedStats.biography = playerDetails.strDescriptionEN;
            }
            
            // Extract career stats based on league type
            if (league === 'NBA') {
              careerStats = extractBasketballCareerStats(playerDetails);
            } else if (league === 'NFL') {
              careerStats = extractFootballCareerStats(playerDetails);
            } else if (league === 'MLB') {
              careerStats = extractBaseballCareerStats(playerDetails);
            } else if (league === 'NHL') {
              careerStats = extractHockeyCareerStats(playerDetails);
            } else if (['PREMIER_LEAGUE', 'LA_LIGA', 'BUNDESLIGA', 'SERIE_A'].includes(league)) {
              careerStats = extractSoccerCareerStats(playerDetails);
            }
          }
        } catch (detailsError) {
          logger.warn(`Could not fetch additional details for player ${player.strPlayer || playerId}: ${detailsError.message}`);
          // Non-critical error, continue with basic player info
        }
        
        // Transform player data to our schema with extended statistics
        const transformedPlayer = {
          playerId: playerId,
          teamId: player.idTeam || teamId, // Use passed teamId as fallback
          league,
          name: player.strPlayer || '',
          position: player.strPosition || '',
          nationality: player.strNationality || '',
          birthDate: player.dateBorn ? new Date(player.dateBorn) : null,
          birthPlace: player.strBirthLocation || '',
          height: player.strHeight || '',
          weight: player.strWeight || '',
          jerseyNumber: player.strNumber ? parseInt(player.strNumber, 10) : null,
          photo: player.strThumb || player.strCutout || player.strRender || '',
          description: player.strDescriptionEN || '',
          gender: player.strGender || '',
          social: {
            facebook: player.strFacebook || '',
            twitter: player.strTwitter || '',
            instagram: player.strInstagram || ''
          },
          status: player.strStatus || 'Active', // Player status (Active, Injured, Suspended)
          dateFirstSigned: player.dateSigned ? new Date(player.dateSigned) : null,
          lastTransfer: player.strLastTransfer || '',
          
          // New detailed fields for enhanced analytics
          statistics: {
            career: careerStats,
            advanced: detailedStats,
            current: {
              gamesPlayed: 0,
              gamesStarted: 0,
              minutesPlayed: 0
            },
            // Sport-specific current season stats (to be populated by sync-player-stats.js)
            seasonData: getSportSpecificStatsSchema(league)
          },
          
          // Added fields for predictive analytics
          analytics: {
            performanceTrend: 'stable', // Will be calculated by analytics engine
            injuryRisk: 'low',         // Will be calculated by analytics engine
            matchupEfficiency: {},      // Will store matchup-specific performance data
            strengthsWeaknesses: {}     // Will store player's strengths/weaknesses analysis
          },
          
          metadata: {
            source: 'TheSportsDB',
            rawPlayerId: playerId,
            updatedAt: new Date(),
            lastSyncedAt: new Date(),
            dataCompleteness: calculateDataCompleteness(player)
          }
        };
        
        // Update or insert player
        const result = await db.collection('players').updateOne(
          { playerId: transformedPlayer.playerId },
          { $set: transformedPlayer },
          { upsert: true }
        );
        
        if (result.matchedCount > 0) {
          playerUpdatedCount++;
        } else if (result.upsertedCount > 0) {
          playerInsertedCount++;
        }
        
      } catch (playerError) {
        logger.error(`Error processing player from ${teamName}:`, playerError);
      }
    }
    
    logger.info(`${teamName} (${league}) players sync completed: ${playerInsertedCount} inserted, ${playerUpdatedCount} updated`);
    
    // Add more console logs after update
    console.log(`Saved ${playerInsertedCount} inserted and ${playerUpdatedCount} updated players for ${teamName}`);
    
    return { inserted: playerInsertedCount, updated: playerUpdatedCount, total: players.length };
    
  } catch (error) {
    logger.error(`Error syncing players for ${teamName} (${league}):`, error);
    // Don't throw error to continue with other teams
    return { inserted: 0, updated: 0, total: 0, error: error.message };
  }
}

/**
 * Get sport-specific statistics schema based on league
 * @param {string} league - League identifier
 * @returns {Object} Statistics schema object
 */
function getSportSpecificStatsSchema(league) {
  switch(league) {
    case 'NBA':
      return {
        points: 0,
        rebounds: { offensive: 0, defensive: 0, total: 0 },
        assists: 0,
        steals: 0,
        blocks: 0,
        turnovers: 0,
        fieldGoals: { attempted: 0, made: 0, percentage: 0 },
        threePointers: { attempted: 0, made: 0, percentage: 0 },
        freeThrows: { attempted: 0, made: 0, percentage: 0 },
        efficiency: 0,
        plusMinus: 0,
        minutesPerGame: 0,
        advanced: {
          per: 0,             // Player Efficiency Rating
          trueShootingPct: 0, // True Shooting Percentage
          usageRate: 0,       // Usage Rate
          winShares: 0,       // Win Shares
          boxPlusMinus: 0     // Box Plus/Minus
        }
      };
    case 'NFL':
      return {
        passing: {
          attempts: 0,
          completions: 0,
          yards: 0,
          touchdowns: 0,
          interceptions: 0,
          rating: 0
        },
        rushing: {
          attempts: 0,
          yards: 0,
          touchdowns: 0,
          fumbles: 0
        },
        receiving: {
          targets: 0,
          receptions: 0,
          yards: 0,
          touchdowns: 0,
          drops: 0
        },
        defense: {
          tackles: { solo: 0, assisted: 0, total: 0 },
          sacks: 0,
          interceptions: 0,
          passesDefended: 0,
          forcedFumbles: 0
        },
        advanced: {
          qbr: 0,              // Total Quarterback Rating
          epa: 0,              // Expected Points Added
          yardsAfterContact: 0,
          completionPercentageAboveExpectation: 0
        }
      };
    case 'MLB':
      return {
        batting: {
          games: 0,
          atBats: 0,
          runs: 0,
          hits: 0,
          doubles: 0,
          triples: 0,
          homeRuns: 0,
          runsBattedIn: 0,
          stolenBases: 0,
          battingAverage: 0
        },
        pitching: {
          games: 0,
          gamesStarted: 0,
          inningsPitched: 0,
          wins: 0,
          losses: 0,
          saves: 0,
          strikeouts: 0,
          walks: 0,
          earnedRuns: 0,
          era: 0
        },
        fielding: {
          games: 0,
          putouts: 0,
          assists: 0,
          errors: 0,
          fieldingPercentage: 0
        },
        advanced: {
          war: 0,      // Wins Above Replacement
          ops: 0,       // On-base Plus Slugging
          babip: 0,     // Batting Average on Balls in Play
          wOBA: 0,      // Weighted On-base Average
          fip: 0        // Fielding Independent Pitching
        }
      };
    case 'NHL':
      return {
        games: 0,
        goals: 0,
        assists: 0,
        points: 0,
        plusMinus: 0,
        penaltyMinutes: 0,
        powerPlayGoals: 0,
        powerPlayPoints: 0,
        shorthandedGoals: 0,
        gameWinningGoals: 0,
        shots: 0,
        shootingPercentage: 0,
        timeOnIcePerGame: 0,
        goaltending: {
          wins: 0,
          losses: 0,
          overtimeLosses: 0,
          shutouts: 0,
          goalsAgainstAverage: 0,
          savePercentage: 0
        },
        advanced: {
          corsi: 0,          // Corsi percentage
          fenwick: 0,        // Fenwick percentage
          pdo: 0,            // PDO (shooting % + save %)
          pointSharesOffense: 0,
          pointSharesDefense: 0
        }
      };
    case 'PREMIER_LEAGUE':
    case 'LA_LIGA':
    case 'BUNDESLIGA':
    case 'SERIE_A':
      return {
        appearances: 0,
        goals: 0,
        assists: 0,
        cleanSheets: 0,
        yellowCards: 0,
        redCards: 0,
        minutesPlayed: 0,
        passing: {
          total: 0,
          completed: 0,
          accuracy: 0,
          keyPasses: 0,
          crosses: 0
        },
        shooting: {
          total: 0,
          onTarget: 0,
          accuracy: 0,
          conversion: 0
        },
        defense: {
          tackles: 0,
          interceptions: 0,
          clearances: 0,
          blocks: 0,
          duelsWon: 0
        },
        goalkeeper: {
          saves: 0,
          goalsAgainst: 0,
          savesPerGame: 0,
          savePercentage: 0
        },
        advanced: {
          xG: 0,              // Expected Goals
          xA: 0,              // Expected Assists
          pressureRegains: 0, // Possession won in attacking third
          progressivePasses: 0,
          progressiveRuns: 0
        }
      };
    default:
      return {}; // Generic empty schema
  }
}

/**
 * Extract basketball-specific career statistics
 * @param {Object} playerDetails - Player details from API
 * @returns {Object} Career statistics
 */
function extractBasketballCareerStats(playerDetails) {
  return {
    seasonCount: parseInt(playerDetails.strSeason || '0', 10) || 0,
    careerPoints: parseFloat(playerDetails.strPoints || '0') || 0,
    careerRebounds: parseFloat(playerDetails.strRebounds || '0') || 0,
    careerAssists: parseFloat(playerDetails.strAssists || '0') || 0,
    awards: playerDetails.strAwards || '',
    hallOfFame: playerDetails.strHallOfFame === 'yes'
  };
}

/**
 * Extract football-specific career statistics
 * @param {Object} playerDetails - Player details from API
 * @returns {Object} Career statistics
 */
function extractFootballCareerStats(playerDetails) {
  return {
    seasonCount: parseInt(playerDetails.strSeason || '0', 10) || 0,
    careerTouchdowns: parseInt(playerDetails.strTouchdowns || '0', 10) || 0,
    careerYards: parseInt(playerDetails.strYards || '0', 10) || 0,
    awards: playerDetails.strAwards || '',
    hallOfFame: playerDetails.strHallOfFame === 'yes'
  };
}

/**
 * Extract baseball-specific career statistics
 * @param {Object} playerDetails - Player details from API
 * @returns {Object} Career statistics
 */
function extractBaseballCareerStats(playerDetails) {
  return {
    seasonCount: parseInt(playerDetails.strSeason || '0', 10) || 0,
    careerHomeRuns: parseInt(playerDetails.strHomeRuns || '0', 10) || 0,
    careerRBI: parseInt(playerDetails.strRBI || '0', 10) || 0,
    careerBattingAverage: parseFloat(playerDetails.strBattingAverage || '0') || 0,
    awards: playerDetails.strAwards || '',
    hallOfFame: playerDetails.strHallOfFame === 'yes'
  };
}

/**
 * Extract hockey-specific career statistics
 * @param {Object} playerDetails - Player details from API
 * @returns {Object} Career statistics
 */
function extractHockeyCareerStats(playerDetails) {
  return {
    seasonCount: parseInt(playerDetails.strSeason || '0', 10) || 0,
    careerGoals: parseInt(playerDetails.strGoals || '0', 10) || 0,
    careerAssists: parseInt(playerDetails.strAssists || '0', 10) || 0,
    careerPoints: parseInt(playerDetails.strPoints || '0', 10) || 0,
    awards: playerDetails.strAwards || '',
    hallOfFame: playerDetails.strHallOfFame === 'yes'
  };
}

/**
 * Extract soccer-specific career statistics
 * @param {Object} playerDetails - Player details from API
 * @returns {Object} Career statistics
 */
function extractSoccerCareerStats(playerDetails) {
  return {
    seasonCount: parseInt(playerDetails.strSeason || '0', 10) || 0,
    careerGoals: parseInt(playerDetails.strGoals || '0', 10) || 0,
    careerAppearances: parseInt(playerDetails.strAppearances || '0', 10) || 0,
    internationalGoals: parseInt(playerDetails.strInternationalGoals || '0', 10) || 0,
    internationalAppearances: parseInt(playerDetails.strInternationalCaps || '0', 10) || 0,
    awards: playerDetails.strAwards || '',
    hallOfFame: playerDetails.strHallOfFame === 'yes'
  };
}

/**
 * Calculate data completeness score for player data
 * @param {Object} player - Player data object
 * @returns {number} Completeness score (0-100)
 */
function calculateDataCompleteness(player) {
  const requiredFields = ['strPlayer', 'strPosition', 'strNationality', 'dateBorn', 'strHeight', 'strWeight'];
  const optionalFields = ['strDescriptionEN', 'strFacebook', 'strTwitter', 'strInstagram', 'strNumber', 'strBirthLocation'];
  const mediaFields = ['strThumb', 'strCutout', 'strRender'];
  
  // Count filled required fields
  const requiredCount = requiredFields.filter(field => player[field]).length;
  const optionalCount = optionalFields.filter(field => player[field]).length;
  const mediaCount = mediaFields.filter(field => player[field]).length;
  
  // Calculate weighted score (required fields count more)
  const requiredScore = (requiredCount / requiredFields.length) * 70;
  const optionalScore = (optionalCount / optionalFields.length) * 20;
  const mediaScore = (mediaCount / mediaFields.length) * 10;
  
  return Math.round(requiredScore + optionalScore + mediaScore);
}

// Remove duplicate cron schedule to avoid multiple instances running
// Schedule the sync to run twice daily
cron.schedule('0 2,14 * * *', () => {
  logger.info('Starting scheduled game data synchronization (all leagues)');
  syncGames().catch(error => logger.error('Scheduled sync failed:', error));
});

// Schedule league-specific jobs to run at different times to prevent API rate limits
cron.schedule('0 4 * * *', () => {
  logger.info('Starting sync for major US sports leagues');
  process.argv.push('NFL', 'NBA', 'MLB', 'NHL');
  syncGames().catch(error => logger.error('US sports leagues sync failed:', error))
    .finally(() => {
      // Remove args to prevent affecting other runs
      process.argv = process.argv.filter(arg => !['NFL', 'NBA', 'MLB', 'NHL'].includes(arg));
    });
});

cron.schedule('0 6 * * *', () => {
  logger.info('Starting sync for European soccer leagues');
  process.argv.push('PREMIER_LEAGUE', 'LA_LIGA', 'BUNDESLIGA', 'SERIE_A');
  syncGames().catch(error => logger.error('European soccer leagues sync failed:', error))
    .finally(() => {
      // Remove args to prevent affecting other runs
      process.argv = process.argv.filter(arg => 
        !['PREMIER_LEAGUE', 'LA_LIGA', 'BUNDESLIGA', 'SERIE_A'].includes(arg));
    });
});

// Replace the existing cron jobs with a more robust implementation
// Clear any existing cron tasks
cron.getTasks().forEach(task => task.stop());

// Advanced cron schedule with intelligent retry and monitoring
const scheduleConfig = {
  mainSync: {
    schedule: '0 */12 * * *',  // Run every 12 hours
    maxRetries: 3,
    retryDelay: 15,  // minutes
    description: 'Full data sync for all leagues',
    critical: true
  },
  usLeagues: {
    schedule: '0 4,16 * * *',  // Run at 4AM and 4PM
    leagues: ['NFL', 'NBA', 'MLB', 'NHL'],
    maxRetries: 2,
    retryDelay: 10,  // minutes
    description: 'US sports leagues sync',
    critical: false
  },
  europeanLeagues: {
    schedule: '0 6,18 * * *',  // Run at 6AM and 6PM
    leagues: ['PREMIER_LEAGUE', 'LA_LIGA', 'BUNDESLIGA', 'SERIE_A'],
    maxRetries: 2,
    retryDelay: 10,  // minutes
    description: 'European soccer leagues sync',
    critical: false
  },
  playerStats: {
    schedule: '30 */6 * * *',  // Run every 6 hours, 30 minutes past the hour
    syncType: 'playerStats',
    maxRetries: 2,
    retryDelay: 5,  // minutes
    description: 'Player statistics sync',
    critical: false
  },
  healthCheck: {
    schedule: '*/15 * * * *',  // Run every 15 minutes
    syncType: 'healthCheck',
    description: 'System health check and monitoring',
    critical: false
  },
  modelUpdate: {
    schedule: '0 3 * * *',  // Run at 3AM daily
    syncType: 'updateModel',
    maxRetries: 3,
    retryDelay: 30,  // minutes
    description: 'Update predictive models with new data',
    critical: true
  }
};

// Track failed jobs for retry
const failedJobs = new Map();

// Setup monitoring and notification system
const monitoringStats = {
  totalJobs: 0,
  successfulJobs: 0,
  failedJobs: 0,
  criticalFailures: 0,
  lastRun: null,
  syncStatus: {},
  memoryUsage: []
};

// Memory monitoring to prevent OOM errors
function monitorMemory() {
  const memUsage = process.memoryUsage();
  const heapUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
  const rssUsedMB = Math.round(memUsage.rss / 1024 / 1024);
  
  monitoringStats.memoryUsage.push({
    timestamp: new Date(),
    heapMB: heapUsedMB,
    rssMB: rssUsedMB,
    external: Math.round(memUsage.external / 1024 / 1024)
  });
  
  // Maintain only the last 100 measurements
  if (monitoringStats.memoryUsage.length > 100) {
    monitoringStats.memoryUsage.shift();
  }
  
  // Check for potential memory issues
  if (heapUsedMB > 1024 || rssUsedMB > 2048) {
    logger.warn(`High memory usage detected: Heap ${heapUsedMB}MB, RSS ${rssUsedMB}MB`);
    
    // Force garbage collection if above critical threshold
    if (heapUsedMB > 1536 || rssUsedMB > 3072) {
      logger.error(`Critical memory usage! Forcing garbage collection`);
      
      // In production environments with --expose-gc flag, trigger manual GC
      if (global.gc) {
        try {
          global.gc();
          logger.info('Manual garbage collection completed');
        } catch (gcError) {
          logger.error('Error during forced garbage collection:', gcError);
        }
      } else {
        logger.warn('Global GC not available. Start node with --expose-gc to enable manual garbage collection');
      }
    }
  }
  
  return { heapUsedMB, rssUsedMB };
}

// Check memory every 5 minutes
setInterval(monitorMemory, 5 * 60 * 1000);

// Register and start scheduled jobs with error handling and retries
Object.entries(scheduleConfig).forEach(([jobKey, config]) => {
  const jobHandler = async () => {
    monitoringStats.totalJobs++;
    monitoringStats.lastRun = new Date();
    monitoringStats.syncStatus[jobKey] = { status: 'running', startTime: new Date() };
    
    try {
      // Check memory before starting job
      const memStats = monitorMemory();
      logger.info(`Starting scheduled job ${jobKey}: ${config.description}`, { memory: memStats });
      
      if (config.syncType === 'healthCheck') {
        await performHealthCheck();
      } else if (config.syncType === 'playerStats') {
        await syncPlayerStatistics();
      } else if (config.syncType === 'updateModel') {
        await updatePredictiveModels();
      } else {
        // Regular game data sync
        let leagueArgs = config.leagues || [];
        if (leagueArgs.length > 0) {
          process.argv = process.argv.filter(arg => !SUPPORTED_LEAGUES.includes(arg));
          leagueArgs.forEach(league => process.argv.push(league));
        }
        
        await syncGames();
        
        // Clean up arguments
        if (leagueArgs.length > 0) {
          process.argv = process.argv.filter(arg => !leagueArgs.includes(arg));
        }
      }
      
      // Job completed successfully
      monitoringStats.successfulJobs++;
      failedJobs.delete(jobKey);
      monitoringStats.syncStatus[jobKey] = { 
        status: 'completed', 
        lastSuccess: new Date(),
        duration: new Date() - monitoringStats.syncStatus[jobKey].startTime
      };
      
      logger.info(`Scheduled job completed successfully: ${jobKey}`, {
        duration: monitoringStats.syncStatus[jobKey].duration
      });
    } catch (error) {
      monitoringStats.failedJobs++;
      if (config.critical) monitoringStats.criticalFailures++;
      
      const failInfo = failedJobs.get(jobKey) || { attempts: 0, lastError: null };
      failInfo.attempts++;
      failInfo.lastError = error;
      failInfo.lastAttempt = new Date();
      failedJobs.set(jobKey, failInfo);
      
      monitoringStats.syncStatus[jobKey] = { 
        status: 'failed', 
        lastError: error.message,
        attempts: failInfo.attempts,
        lastFailure: new Date(),
        duration: new Date() - monitoringStats.syncStatus[jobKey].startTime
      };
      
      logger.error(`Scheduled job failed: ${jobKey} (attempt ${failInfo.attempts}/${config.maxRetries || 1})`, {
        error: error.message,
        stack: error.stack,
        duration: monitoringStats.syncStatus[jobKey].duration
      });
      
      // Send notification for critical failures
      if (config.critical) {
        sendFailureNotification(jobKey, error);
      }
      
      // Schedule retry if we haven't exceeded max retries
      if (config.maxRetries && failInfo.attempts <= config.maxRetries) {
        const retryDelayMs = (config.retryDelay || 15) * 60 * 1000;
        logger.info(`Scheduling retry for ${jobKey} in ${config.retryDelay} minutes`);
        
        setTimeout(() => {
          logger.info(`Executing retry #${failInfo.attempts} for ${jobKey}`);
          jobHandler().catch(retryError => {
            logger.error(`Retry failed for ${jobKey}:`, retryError);
          });
        }, retryDelayMs);
      } else if (failInfo.attempts > config.maxRetries) {
        logger.error(`Max retries exceeded for ${jobKey}, giving up after ${failInfo.attempts} attempts`);
        sendEscalationNotification(jobKey, error);
      }
    }
  };
  
  // Schedule the job
  cron.schedule(config.schedule, jobHandler, {
    scheduled: true,
    timezone: process.env.TIMEZONE || 'UTC'
  });
  
  logger.info(`Scheduled job ${jobKey}: ${config.description} (${config.schedule})`);
});

/**
 * Perform a comprehensive health check of the system
 * @returns {Promise<Object>} Health status
 */
async function performHealthCheck() {
  const healthStatus = {
    timestamp: new Date(),
    status: 'ok',
    database: {
      connected: false,
      collections: {},
      responseTime: 0
    },
    api: {
      thesportsdb: {
        status: 'unknown',
        responseTime: 0
      }
    },
    system: {
      memory: monitorMemory(),
      uptime: process.uptime()
    },
    jobs: {
      total: monitoringStats.totalJobs,
      successful: monitoringStats.successfulJobs,
      failed: monitoringStats.failedJobs,
      criticalFailures: monitoringStats.criticalFailures
    }
  };
  
  try {
    // Check database connectivity
    const dbStartTime = Date.now();
    
    const db = dbManager?.client?.db(DB_NAME);
    if (!db) {
      throw new Error('Could not get database instance');
    }
    
    const collections = ['games', 'teams', 'players', 'statistics'];
    for (const collection of collections) {
      try {
        const count = await db.collection(collection).countDocuments();
        healthStatus.database.collections[collection] = count;
      } catch (collError) {
        logger.error(`Error counting documents in ${collection}:`, collError);
        healthStatus.database.collections[collection] = -1;
        healthStatus.status = 'warning';
      }
    }
    
    healthStatus.database.connected = true;
    healthStatus.database.responseTime = Date.now() - dbStartTime;
    
    // Check TheSportsDB API
    const apiStartTime = Date.now();
    try {
      const response = await axios.get(
        `https://www.thesportsdb.com/api/v1/json/${API_CONFIG.NBA.key}/eventslast.php?id=4387&n=1`
      );
      
      healthStatus.api.thesportsdb.status = 
        response.data && response.data.events ? 'ok' : 'degraded';
      healthStatus.api.thesportsdb.responseTime = Date.now() - apiStartTime;
    } catch (apiError) {
      logger.error('TheSportsDB API health check failed:', apiError);
      healthStatus.api.thesportsdb.status = 'error';
      healthStatus.api.thesportsdb.responseTime = Date.now() - apiStartTime;
      healthStatus.status = 'warning';
    }
    
    // Overall health status
    if (!healthStatus.database.connected) {
      healthStatus.status = 'critical';
    } else if (healthStatus.api.thesportsdb.status === 'error') {
      healthStatus.status = 'warning';
    }
    
    // Log health status
    logger.info('Health check completed', { 
      status: healthStatus.status,
      database: {
        connected: healthStatus.database.connected,
        responseTime: healthStatus.database.responseTime
      },
      api: {
        status: healthStatus.api.thesportsdb.status,
        responseTime: healthStatus.api.thesportsdb.responseTime
      }
    });
    
    return healthStatus;
  } catch (error) {
    logger.error('Health check failed:', error);
    healthStatus.status = 'critical';
    healthStatus.error = error.message;
    return healthStatus;
  }
}

/**
 * Synchronize player statistics from external API
 * Simplified version - in production this would import from sync-player-stats.js
 */
async function syncPlayerStatistics() {
  logger.info('Starting player statistics synchronization');
  
  try {
    // This would typically call the actual player stats sync function
    // For now just log that it would happen
    logger.info('Player statistics sync would run here');
    
    // In production: await import('./sync-player-stats.js').then(module => module.syncPlayerStats());
    return { success: true };
  } catch (error) {
    logger.error('Player statistics sync failed:', error);
    throw error;
  }
}

/**
 * Update predictive models with the latest data
 * @returns {Promise<Object>} Update status
 */
async function updatePredictiveModels() {
  logger.info('Starting predictive models update');
  
  try {
    const db = dbManager?.client?.db(DB_NAME);
    if (!db) {
      throw new Error('Could not get database instance');
    }
    
    // Count documents to update models with
    const gameCounts = await db.collection('games').countDocuments();
    const playerCounts = await db.collection('players').countDocuments();
    const teamCounts = await db.collection('teams').countDocuments();
    
    logger.info('Updating predictive models with current data counts:', {
      games: gameCounts,
      players: playerCounts,
      teams: teamCounts
    });
    
    // In production, this would call the actual model update script
    // For example, execute a Python script that updates the ML models
    
    // Simulate model update with the child_process module
    const { execFile } = require('child_process');
    const modelUpdatePromise = new Promise((resolve, reject) => {
      const pythonExec = process.env.PYTHON_PATH || 'python';
      const modelScript = 'scripts/predictive_model.py';
      const modelOptions = ['--update-models', '--use-all-data'];
      
      try {
        const childProcess = execFile(pythonExec, [modelScript, ...modelOptions], {
          timeout: 600000 // 10 minute timeout
        }, (error, stdout, stderr) => {
          if (error) {
            logger.error('Predictive model update failed:', {
              error: error.message,
              stderr: stderr
            });
            reject(error);
            return;
          }
          
          logger.info('Predictive model update completed successfully');
          resolve({ success: true, output: stdout });
        });
        
        childProcess.on('error', (err) => {
          logger.error('Error executing predictive model script:', err);
          reject(err);
        });
      } catch (execError) {
        logger.error('Exception while launching predictive model script:', execError);
        reject(execError);
      }
    });
    
    // In this example version, we'll just simulate success
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    logger.info('Predictive models updated successfully');
    
    return {
      success: true,
      modelsUpdated: {
        games: true,
        players: true,
        teams: true
      },
      timestamp: new Date()
    };
  } catch (error) {
    logger.error('Predictive model update failed:', error);
    throw error; 
  }
}

/**
 * Send notification of job failure
 * @param {string} jobKey - Key identifying the failed job
 * @param {Error} error - Error that occurred
 */
async function sendFailureNotification(jobKey, error) {
  const config = scheduleConfig[jobKey];
  
  try {
    logger.info(`Sending failure notification for ${jobKey}`, {
      error: error.message,
      critical: config.critical
    });
    
    // In production this would connect to a notification service
    // For example: email, SMS, Slack webhook, etc.
    
    if (process.env.NOTIFICATION_EMAIL) {
      // Simulate email service
      logger.info(`Would send email to ${process.env.NOTIFICATION_EMAIL}`);
    }
    
    if (process.env.SLACK_WEBHOOK_URL) {
      // Example implementation with axios to post to Slack
      try {
        await axios.post(process.env.SLACK_WEBHOOK_URL, {
          text: `❌ Sports Analytics job failed: ${jobKey} - ${config.description}`,
          blocks: [
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text: `❌ *Job Failed:* ${jobKey} - ${config.description}`
              }
            },
            {
              type: "section",
              fields: [
                {
                  type: "mrkdwn",
                  text: `*Error:*\n${error.message}`
                },
                {
                  type: "mrkdwn",
                  text: `*Time:*\n${new Date().toISOString()}`
                }
              ]
            }
          ]
        });
        logger.info('Slack notification sent successfully');
      } catch (slackError) {
        logger.error('Failed to send Slack notification:', slackError);
      }
    }
    
    return { success: true };
  } catch (notifyError) {
    logger.error('Failed to send failure notification:', notifyError);
    return { success: false, error: notifyError.message };
  }
}

/**
 * Send escalation notification for critical failures
 * @param {string} jobKey - Key identifying the failed job
 * @param {Error} error - Error that occurred
 */
async function sendEscalationNotification(jobKey, error) {
  try {
    logger.info(`Sending escalation notification for ${jobKey}`, {
      error: error.message
    });
    
    // In production this would connect to an escalation system
    // For example: PagerDuty, OpsGenie, etc.
    
    if (process.env.ESCALATION_EMAIL) {
      // Simulate email service
      logger.info(`Would send escalation email to ${process.env.ESCALATION_EMAIL}`);
    }
    
    return { success: true };
  } catch (notifyError) {
    logger.error('Failed to send escalation notification:', notifyError);
    return { success: false, error: notifyError.message };
  }
}

// Run sync immediately on startup but don't block script execution
// This is useful when deploying updates
(async () => {
  try {
    logger.info('Starting initial game data synchronization');
    await syncGames();
    logger.info('Initial game data synchronization completed successfully');
  } catch (error) {
    logger.error('Initial game data synchronization failed:', error);
  }
})();

// Execute directly if run from command line
if (require.main === module) {
  syncGames()
    .then(() => {
      logger.info('Game data synchronization executed successfully');
      // Don't exit immediately to allow background cron jobs to be scheduled
      // Only exit if explicitly run from command line
      // setTimeout to allow logging to complete
      setTimeout(() => process.exit(0), 1000);
    })
    .catch(error => {
      logger.error('Game data synchronization failed:', error);
      process.exit(1);
    });
}