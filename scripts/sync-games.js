// scripts/sync-games.js
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
  defaultMeta: { service: 'sync-games', version: '2.0.0' },
  transports: [
    new winston.transports.File({
      filename: 'logs/games-error.log',
      level: 'error',
      maxsize: parseInt(process.env.LOG_FILE_MAX_SIZE, 10) || 10000000,
      maxFiles: parseInt(process.env.LOG_MAX_FILES, 10) || 5,
      tailable: true
    }),
    new winston.transports.File({
      filename: 'logs/games.log',
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

// TheSportsDB league IDs
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

// Sports mapping for V2 API
const SPORTS_MAPPING = {
  NFL: "american_football",
  NBA: "basketball",
  MLB: "baseball",
  NHL: "ice_hockey",
  PREMIER_LEAGUE: "soccer",
  LA_LIGA: "soccer",
  BUNDESLIGA: "soccer",
  SERIE_A: "soccer"
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
 * Main function to synchronize game data across all leagues
 */
async function syncGames() {
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
        maxPoolSize: parseInt(process.env.DB_MAX_POOL_SIZE, 10) || 50,
        minPoolSize: parseInt(process.env.DB_MIN_POOL_SIZE, 10) || 5,
        connectTimeoutMS: parseInt(process.env.CONNECT_TIMEOUT_MS, 10) || 10000,
        socketTimeoutMS: parseInt(process.env.SOCKET_TIMEOUT_MS, 10) || 30000
      });
      
      logger.info('MongoDB connection established for game data synchronization');
    }
    
    const db = dbManager?.client?.db(DB_NAME) || client.db(DB_NAME);
    
    // Ensure games collection exists with proper indexes
    await ensureGamesCollection(db);
    
    // Sync for each league
    for (const league of SUPPORTED_LEAGUES) {
      try {
        await syncLeagueGames(db, league);
      } catch (leagueError) {
        logger.error(`Error syncing ${league} games:`, leagueError);
        // Continue with other leagues even if one fails
      }
    }
    
    logger.info('Game data synchronization completed');
    
  } catch (error) {
    logger.error('Error in game data synchronization:', error);
    throw error;
  } finally {
    if (client) {
      await client.close();
      logger.info('MongoDB connection closed');
    }
  }
}

/**
 * Ensure games collection exists with proper indexes
 * @param {Object} db - MongoDB database instance
 */
async function ensureGamesCollection(db) {
  try {
    // Check if collection exists
    const collections = await db.listCollections({ name: 'games' }).toArray();
    if (collections.length === 0) {
      // Create collection if it doesn't exist
      await db.createCollection('games');
      logger.info('Created games collection');
    }
    
    // Create indexes
    await db.collection('games').createIndex({ gameId: 1 }, { unique: true });
    await db.collection('games').createIndex({ league: 1 });
    await db.collection('games').createIndex({ date: 1 });
    await db.collection('games').createIndex({ status: 1 });
    await db.collection('games').createIndex({ 'homeTeam.id': 1 });
    await db.collection('games').createIndex({ 'awayTeam.id': 1 });
    
    logger.info('Ensured indexes for games collection');
  } catch (error) {
    logger.error('Error ensuring games collection:', error);
    throw error;
  }
}

/**
 * Synchronize game data for a specific league
 * @param {Object} db - MongoDB database instance
 * @param {string} league - League identifier
 */
async function syncLeagueGames(db, league) {
  try {
    logger.info(`Starting game data synchronization for ${league}`);
    
    // Fetch live, upcoming, and recent completed games
    const liveGames = await fetchLiveGames(league);
    const upcomingGames = await fetchUpcomingGames(league);
    const recentGames = await fetchRecentGames(league);
    
    // Combine all games and deduplicate
    const allGames = [...liveGames, ...upcomingGames, ...recentGames];
    const uniqueGames = deduplicateGames(allGames);
    
    logger.info(`Processing ${uniqueGames.length} unique games for ${league}`);
    
    let updatedCount = 0;
    let insertedCount = 0;
    
    // Process each game
    for (const game of uniqueGames) {
      try {
        // Transform game data to our schema
        const transformedGame = transformGameData(game, league);
        
        // Skip games with invalid or missing IDs
        if (!transformedGame.gameId) {
          logger.warn(`Skipping game with missing ID: ${JSON.stringify(game).substring(0, 100)}...`);
          continue;
        }
        
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
    
  } catch (error) {
    logger.error(`Error syncing ${league} games:`, error);
    throw error;
  }
}

/**
 * Fetch live games using TheSportsDB V2 livescore endpoint
 * @param {string} league - League identifier
 * @returns {Promise<Array>} Live games
 */
async function fetchLiveGames(league) {
  try {
    const sport = SPORTS_MAPPING[league];
    const url = `${SPORTSDB_BASE_URL}/${SPORTSDB_API_KEY}/livescore/${sport}`;
    
    logger.debug(`Requesting live games from: ${url}`);
    
    const response = await axios.get(url, { timeout: API_TIMEOUT });
    
    if (!response.data || !response.data.events || !Array.isArray(response.data.events)) {
      logger.warn(`No ${league} live games returned from TheSportsDB`);
      return [];
    }
    
    // If this is a soccer league, filter by the specific league ID
    if (sport === "soccer") {
      return response.data.events.filter(game => 
        game.idLeague == LEAGUE_IDS[league]
      );
    }
    
    return response.data.events;
  } catch (error) {
    logger.error(`Error fetching ${league} live games:`, error);
    return [];
  }
}

/**
 * Fetch upcoming games using TheSportsDB V2 API
 * @param {string} league - League identifier
 * @returns {Promise<Array>} Upcoming games
 */
async function fetchUpcomingGames(league) {
  try {
    const leagueId = LEAGUE_IDS[league];
    
    // Using eventsnextleague endpoint to get upcoming games
    const url = `${SPORTSDB_BASE_URL}/${SPORTSDB_API_KEY}/eventsnextleague/${leagueId}`;
    
    logger.debug(`Requesting upcoming games from: ${url}`);
    
    const response = await axios.get(url, { timeout: API_TIMEOUT });
    
    if (!response.data || !response.data.events || !Array.isArray(response.data.events)) {
      logger.warn(`No ${league} upcoming games returned from TheSportsDB`);
      return [];
    }
    
    return response.data.events;
  } catch (error) {
    logger.error(`Error fetching ${league} upcoming games:`, error);
    return [];
  }
}

/**
 * Fetch recent completed games using TheSportsDB V2 API
 * @param {string} league - League identifier
 * @returns {Promise<Array>} Recent completed games
 */
async function fetchRecentGames(league) {
  try {
    const leagueId = LEAGUE_IDS[league];
    
    // Using eventspastleague endpoint to get recent completed games
    const url = `${SPORTSDB_BASE_URL}/${SPORTSDB_API_KEY}/eventspastleague/${leagueId}/15`;
    
    logger.debug(`Requesting recent games from: ${url}`);
    
    const response = await axios.get(url, { timeout: API_TIMEOUT });
    
    if (!response.data || !response.data.events || !Array.isArray(response.data.events)) {
      logger.warn(`No ${league} recent games returned from TheSportsDB`);
      return [];
    }
    
    return response.data.events;
  } catch (error) {
    logger.error(`Error fetching ${league} recent games:`, error);
    return [];
  }
}

/**
 * Deduplicate games based on unique ID
 * @param {Array} games - Array of games
 * @returns {Array} Deduplicated games
 */
function deduplicateGames(games) {
  const uniqueGames = {};
  
  games.forEach(game => {
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
  return (
    (game.intHomeScore !== undefined && game.intHomeScore !== null) ||
    (game.intAwayScore !== undefined && game.intAwayScore !== null)
  );
}

/**
 * Transform TheSportsDB API game data to our schema format
 * @param {Object} game - Game from API
 * @param {string} league - League identifier
 * @returns {Object} Transformed game data
 */
function transformGameData(game, league) {
  // Determine game status
  let status = 'upcoming';
  
  if (game.strStatus === 'In Progress' || game.strStatus === 'Live') {
    status = 'live';
  } else if (game.strStatus === 'Match Finished' || game.strStatus === 'Finished' || game.strStatus === 'FT') {
    status = 'completed';
  }
  
  // Extract date
  let gameDate = new Date();
  if (game.dateEvent && game.strTime) {
    // Combine date and time
    gameDate = new Date(`${game.dateEvent}T${game.strTime}`);
  } else if (game.dateEvent) {
    gameDate = new Date(game.dateEvent);
  }
  
  // Construct game object in our schema
  return {
    gameId: game.idEvent,
    league,
    season: getCurrentSeason(league),
    date: gameDate,
    status,
    homeTeam: {
      id: game.idHomeTeam,
      name: game.strHomeTeam,
      score: status !== 'upcoming' ? (parseInt(game.intHomeScore) || 0) : 0
    },
    awayTeam: {
      id: game.idAwayTeam,
      name: game.strAwayTeam,
      score: status !== 'upcoming' ? (parseInt(game.intAwayScore) || 0) : 0
    },
    venue: {
      name: game.strVenue || game.strStadium || '',
      location: game.strCountry || ''
    },
    // Extract statistics based on league type
    statistics: extractGameStatistics(game, league),
    metadata: {
      source: 'TheSportsDB-V2',
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
function extractGameStatistics(game, league) {
  switch(league) {
    case 'NBA':
      return extractBasketballStats(game);
    case 'NFL':
      return extractFootballStats(game);
    case 'MLB':
      return extractBaseballStats(game);
    case 'NHL':
      return extractHockeyStats(game);
    case 'PREMIER_LEAGUE':
    case 'LA_LIGA':
    case 'BUNDESLIGA':
    case 'SERIE_A':
      return extractSoccerStats(game);
    default:
      return {};
  }
}

/**
 * Extract basketball statistics
 * @param {Object} game - Game object
 * @returns {Object} Basketball stats
 */
function extractBasketballStats(game) {
  // TheSportsDB's V2 API may include these stats in a different format
  // This is a template that extracts whatever stats are available
  return {
    periods: {
      q1: {
        home: parseInt(game.intHomeScoreQ1) || 0,
        away: parseInt(game.intAwayScoreQ1) || 0
      },
      q2: {
        home: parseInt(game.intHomeScoreQ2) || 0,
        away: parseInt(game.intAwayScoreQ2) || 0
      },
      q3: {
        home: parseInt(game.intHomeScoreQ3) || 0,
        away: parseInt(game.intAwayScoreQ3) || 0
      },
      q4: {
        home: parseInt(game.intHomeScoreQ4) || 0,
        away: parseInt(game.intAwayScoreQ4) || 0
      },
      ot: {
        home: parseInt(game.intHomeScoreOT) || 0,
        away: parseInt(game.intAwayScoreOT) || 0
      }
    },
    teamStats: {
      home: parseTeamStats(game, 'Home'),
      away: parseTeamStats(game, 'Away')
    }
  };
}

/**
 * Extract football statistics
 * @param {Object} game - Game object
 * @returns {Object} Football stats
 */
function extractFootballStats(game) {
  return {
    periods: {
      q1: {
        home: parseInt(game.intHomeScoreQ1) || 0,
        away: parseInt(game.intAwayScoreQ1) || 0
      },
      q2: {
        home: parseInt(game.intHomeScoreQ2) || 0,
        away: parseInt(game.intAwayScoreQ2) || 0
      },
      q3: {
        home: parseInt(game.intHomeScoreQ3) || 0,
        away: parseInt(game.intAwayScoreQ3) || 0
      },
      q4: {
        home: parseInt(game.intHomeScoreQ4) || 0,
        away: parseInt(game.intAwayScoreQ4) || 0
      },
      ot: {
        home: parseInt(game.intHomeScoreOT) || 0,
        away: parseInt(game.intAwayScoreOT) || 0
      }
    },
    teamStats: {
      home: parseTeamStats(game, 'Home'),
      away: parseTeamStats(game, 'Away')
    }
  };
}

/**
 * Extract baseball statistics
 * @param {Object} game - Game object
 * @returns {Object} Baseball stats
 */
function extractBaseballStats(game) {
  const innings = {};
  
  // Extract innings data if available
  for (let i = 1; i <= 9; i++) {
    innings[`inning${i}`] = {
      home: parseInt(game[`intHomeScoreInning${i}`]) || 0,
      away: parseInt(game[`intAwayScoreInning${i}`]) || 0
    };
  }
  
  return {
    innings,
    teamStats: {
      home: {
        runs: parseInt(game.intHomeScore) || 0,
        hits: parseInt(game.intHomeHits) || 0,
        errors: parseInt(game.intHomeErrors) || 0
      },
      away: {
        runs: parseInt(game.intAwayScore) || 0,
        hits: parseInt(game.intAwayHits) || 0,
        errors: parseInt(game.intAwayErrors) || 0
      }
    }
  };
}

/**
 * Extract hockey statistics
 * @param {Object} game - Game object
 * @returns {Object} Hockey stats
 */
function extractHockeyStats(game) {
  return {
    periods: {
      p1: {
        home: parseInt(game.intHomeScoreP1) || 0,
        away: parseInt(game.intAwayScoreP1) || 0
      },
      p2: {
        home: parseInt(game.intHomeScoreP2) || 0,
        away: parseInt(game.intAwayScoreP2) || 0
      },
      p3: {
        home: parseInt(game.intHomeScoreP3) || 0,
        away: parseInt(game.intAwayScoreP3) || 0
      },
      ot: {
        home: parseInt(game.intHomeScoreOT) || 0,
        away: parseInt(game.intAwayScoreOT) || 0
      }
    },
    teamStats: {
      home: parseTeamStats(game, 'Home'),
      away: parseTeamStats(game, 'Away')
    }
  };
}

/**
 * Extract soccer statistics
 * @param {Object} game - Game object
 * @returns {Object} Soccer stats
 */
function extractSoccerStats(game) {
  return {
    periods: {
      h1: {
        home: parseInt(game.intHomeScoreH1) || 0,
        away: parseInt(game.intAwayScoreH1) || 0
      },
      h2: {
        home: parseInt(game.intHomeScoreH2) || 0,
        away: parseInt(game.intAwayScoreH2) || 0
      },
      ot: {
        home: parseInt(game.intHomeScoreET) || 0,
        away: parseInt(game.intAwayScoreET) || 0
      }
    },
    teamStats: {
      home: {
        shotsOnGoal: parseInt(game.intHomeShots) || 0,
        corners: parseInt(game.intHomeCorners) || 0,
        fouls: parseInt(game.intHomeFouls) || 0,
        yellowCards: parseInt(game.intHomeYellowCards) || 0,
        redCards: parseInt(game.intHomeRedCards) || 0
      },
      away: {
        shotsOnGoal: parseInt(game.intAwayShots) || 0,
        corners: parseInt(game.intAwayCorners) || 0,
        fouls: parseInt(game.intAwayFouls) || 0,
        yellowCards: parseInt(game.intAwayYellowCards) || 0,
        redCards: parseInt(game.intAwayRedCards) || 0
      }
    }
  };
}

/**
 * Parse team stats from the game object
 * @param {Object} game - Game object
 * @param {string} team - Team identifier (Home/Away)
 * @returns {Object} Team stats
 */
function parseTeamStats(game, team) {
  const stats = {};
  
  // Loop through all game properties to find stats
  for (const [key, value] of Object.entries(game)) {
    // Check if this is a stat for the specified team
    if (key.startsWith(`str${team}`) || key.startsWith(`int${team}`)) {
      const statName = key.replace(`str${team}`, '').replace(`int${team}`, '');
      
      // Skip common non-stat properties
      if (['Team', 'Score', 'Id'].includes(statName)) continue;
      
      // Add stat to the collection with proper camelCase naming
      const camelCaseName = statName.charAt(0).toLowerCase() + statName.slice(1);
      stats[camelCaseName] = isNaN(value) ? value : parseInt(value) || 0;
    }
  }
  
  return stats;
}

/**
 * Get current season based on league and date
 * @param {string} league - League identifier
 * @returns {string} Current season (e.g., '2023' or '2023-2024')
 */
function getCurrentSeason(league) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1; // 1-12
  
  // Soccer leagues typically run across two years (e.g., 2023-2024)
  if (['PREMIER_LEAGUE', 'LA_LIGA', 'BUNDESLIGA', 'SERIE_A'].includes(league)) {
    if (month >= 7) { // After July (new season starts)
      return `${year}-${year + 1}`;
    }
    return `${year - 1}-${year}`;
  }
  
  // NBA and NHL seasons span October to June
  if (['NBA', 'NHL'].includes(league)) {
    if (month >= 10 || month <= 6) { // October to June
      return month >= 10 ? `${year}-${year + 1}` : `${year - 1}-${year}`;
    }
  }
  
  // NFL season spans September to February
  if (league === 'NFL') {
    if (month >= 9 || month <= 2) { // September to February
      return month >= 9 ? `${year}` : `${year - 1}`;
    }
  }
  
  // MLB season typically runs within a single calendar year
  if (league === 'MLB') {
    return `${year}`;
  }
  
  // Default to current year
  return `${year}`;
}

// Schedule the sync to run every hour
cron.schedule('0 * * * *', () => {
  logger.info('Starting scheduled game data synchronization');
  syncGames().catch(error => logger.error('Scheduled sync failed:', error));
});

// Run sync immediately on startup
syncGames().catch(error => logger.error('Initial sync failed:', error));

// Execute directly if run from command line
if (require.main === module) {
  syncGames()
    .then(() => {
      logger.info('Game data synchronization executed successfully');
      process.exit(0);
    })
    .catch(error => {
      logger.error('Game data synchronization failed:', error);
      process.exit(1);
    });
}