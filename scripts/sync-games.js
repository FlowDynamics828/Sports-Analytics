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
  defaultMeta: { service: 'sync-games' },
  transports: [
    new winston.transports.File({
      filename: 'logs/games-error.log',
      level: 'error',
      maxsize: parseInt(process.env.LOG_FILE_MAX_SIZE, 10) || 5000000,
      maxFiles: parseInt(process.env.LOG_MAX_FILES, 10) || 3,
      tailable: true
    }),
    new winston.transports.File({
      filename: 'logs/games.log',
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

// Supported leagues
const SUPPORTED_LEAGUES = [
  'NFL', 'NBA', 'MLB', 'NHL',
  'PREMIER_LEAGUE', 'LA_LIGA', 'BUNDESLIGA', 'SERIE_A'
];

// API configuration
const API_CONFIG = {
  NBA: {
    url: process.env.NBA_API_URL || 'https://api.sportsdata.io/v3/nba',
    key: process.env.NBA_API_KEY || 'your-api-key-here',
    schedulesEndpoint: '/scores/json/Games',
    scoresEndpoint: '/scores/json/ScoresBasic'
  },
  NFL: {
    url: process.env.NFL_API_URL || 'https://api.sportsdata.io/v3/nfl',
    key: process.env.NFL_API_KEY || 'your-api-key-here',
    schedulesEndpoint: '/scores/json/Schedules',
    scoresEndpoint: '/scores/json/ScoresBasic'
  },
  MLB: {
    url: process.env.MLB_API_URL || 'https://api.sportsdata.io/v3/mlb',
    key: process.env.MLB_API_KEY || 'your-api-key-here',
    schedulesEndpoint: '/scores/json/Games',
    scoresEndpoint: '/scores/json/ScoresBasic'
  },
  NHL: {
    url: process.env.NHL_API_URL || 'https://api.sportsdata.io/v3/nhl',
    key: process.env.NHL_API_KEY || 'your-api-key-here',
    schedulesEndpoint: '/scores/json/Games',
    scoresEndpoint: '/scores/json/ScoresBasic'
  },
  PREMIER_LEAGUE: {
    url: process.env.PREMIER_LEAGUE_API_URL || 'https://api.sportsdata.io/v3/soccer',
    key: process.env.SOCCER_API_KEY || 'your-api-key-here',
    schedulesEndpoint: '/scores/json/Schedules',
    scoresEndpoint: '/scores/json/Scores',
    competitionId: 1 // Premier League
  },
  LA_LIGA: {
    url: process.env.LA_LIGA_API_URL || 'https://api.sportsdata.io/v3/soccer',
    key: process.env.SOCCER_API_KEY || 'your-api-key-here',
    schedulesEndpoint: '/scores/json/Schedules',
    scoresEndpoint: '/scores/json/Scores',
    competitionId: 2 // La Liga
  },
  BUNDESLIGA: {
    url: process.env.BUNDESLIGA_API_URL || 'https://api.sportsdata.io/v3/soccer',
    key: process.env.SOCCER_API_KEY || 'your-api-key-here',
    schedulesEndpoint: '/scores/json/Schedules',
    scoresEndpoint: '/scores/json/Scores',
    competitionId: 3 // Bundesliga
  },
  SERIE_A: {
    url: process.env.SERIE_A_API_URL || 'https://api.sportsdata.io/v3/soccer',
    key: process.env.SOCCER_API_KEY || 'your-api-key-here',
    schedulesEndpoint: '/scores/json/Schedules',
    scoresEndpoint: '/scores/json/Scores',
    competitionId: 4 // Serie A
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
        maxPoolSize: parseInt(process.env.DB_MAX_POOL_SIZE, 10) || 10,
        minPoolSize: parseInt(process.env.DB_MIN_POOL_SIZE, 10) || 1,
        connectTimeoutMS: parseInt(process.env.CONNECT_TIMEOUT_MS, 10) || 5000,
        socketTimeoutMS: parseInt(process.env.SOCKET_TIMEOUT_MS, 10) || 10000
      });
      
      logger.info('MongoDB connection established for game data synchronization');
    }
    
    const db = dbManager?.client?.db(DB_NAME) || client.db(DB_NAME);
    
    // Ensure games collection exists with proper indexes
    await ensureGamesCollection(db);
    
    // Sync for each league
    for (const league of SUPPORTED_LEAGUES) {
      try {
        await syncLeagueGames(db, league, API_CONFIG[league]);
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
    
    // Season parameter
    const currentSeason = getCurrentSeason(league);
    
    // League-specific parameter adjustments
    if (['PREMIER_LEAGUE', 'LA_LIGA', 'BUNDESLIGA', 'SERIE_A'].includes(league)) {
      params = {
        competition: config.competitionId,
        season: currentSeason
      };
    } else {
      params = {
        season: currentSeason
      };
    }
    
    logger.debug(`Requesting ${league} upcoming games with params:`, params);
    
    // Make API request
    const response = await axios.get(`${config.url}${endpoint}`, {
      params,
      headers: {
        'Ocp-Apim-Subscription-Key': config.key
      },
      timeout: 30000 // 30 second timeout
    });
    
    if (!response.data || !Array.isArray(response.data)) {
      logger.warn(`No ${league} upcoming games returned from API.`);
      return [];
    }
    
    // Filter for upcoming games only
    return response.data.filter(game => 
      game.Status === 'Scheduled' || 
      game.Status === 'Upcoming' || 
      game.status === 'Scheduled' ||
      game.status === 'Upcoming'
    );
    
  } catch (error) {
    logger.error(`Error fetching ${league} upcoming games:`, error);
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
    
    // Current date in format YYYY-MM-DD
    const today = new Date().toISOString().split('T')[0];
    
    // League-specific parameter adjustments
    if (['PREMIER_LEAGUE', 'LA_LIGA', 'BUNDESLIGA', 'SERIE_A'].includes(league)) {
      params = {
        competition: config.competitionId,
        date: today
      };
    } else {
      params = {
        date: today
      };
    }
    
    logger.debug(`Requesting ${league} active games with params:`, params);
    
    // Make API request
    const response = await axios.get(`${config.url}${endpoint}`, {
      params,
      headers: {
        'Ocp-Apim-Subscription-Key': config.key
      },
      timeout: 30000 // 30 second timeout
    });
    
    if (!response.data || !Array.isArray(response.data)) {
      logger.warn(`No ${league} active games returned from API.`);
      return [];
    }
    
    // Include both live and completed games
    return response.data.filter(game => 
      game.Status === 'InProgress' || 
      game.Status === 'Final' ||
      game.status === 'InProgress' || 
      game.status === 'Final' ||
      game.Status === 'Live' ||
      game.status === 'Live' ||
      game.Status === 'Complete' || 
      game.status === 'Complete' ||
      game.Status === 'Completed' || 
      game.status === 'Completed'
    );
    
  } catch (error) {
    logger.error(`Error fetching ${league} active games:`, error);
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
    const gameId = game.GameID || game.GameId || game.gameId || game.id;
    
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
    (game.HomeTeamScore !== undefined && game.HomeTeamScore !== null) ||
    (game.AwayTeamScore !== undefined && game.AwayTeamScore !== null) ||
    (game.homeTeamScore !== undefined && game.homeTeamScore !== null) ||
    (game.awayTeamScore !== undefined && game.awayTeamScore !== null)
  );
}

/**
 * Transform API game data to our schema format
 * @param {Object} game - Game from API
 * @param {string} league - League identifier
 * @returns {Object} Transformed game data
 */
function transformGameData(game, league) {
  // Determine game status
  let status = 'upcoming';
  if (
    game.Status === 'InProgress' || 
    game.status === 'InProgress' ||
    game.Status === 'Live' ||
    game.status === 'Live'
  ) {
    status = 'live';
  } else if (
    game.Status === 'Final' || 
    game.status === 'Final' ||
    game.Status === 'Complete' || 
    game.status === 'Complete' ||
    game.Status === 'Completed' || 
    game.status === 'Completed'
  ) {
    status = 'completed';
  }
  
  // Extract date
  let gameDate = new Date();
  if (game.DateTime || game.Date || game.DateTimeUTC) {
    gameDate = new Date(game.DateTime || game.Date || game.DateTimeUTC);
  } else if (game.dateTime || game.date || game.dateTimeUTC) {
    gameDate = new Date(game.dateTime || game.date || game.dateTimeUTC);
  }
  
  // Extract team IDs
  const homeTeamId = game.HomeTeamID || game.HomeTeamId || game.homeTeamId || game.homeTeam?.id;
  const awayTeamId = game.AwayTeamID || game.AwayTeamId || game.awayTeamId || game.awayTeam?.id;
  
  // Extract team names
  const homeTeamName = game.HomeTeam || game.HomeTeamName || game.homeTeamName || game.homeTeam?.name;
  const awayTeamName = game.AwayTeam || game.AwayTeamName || game.awayTeamName || game.awayTeam?.name;
  
  // Extract scores
  const homeTeamScore = game.HomeTeamScore || game.homeTeamScore || 0;
  const awayTeamScore = game.AwayTeamScore || game.awayTeamScore || 0;
  
  // Extract venue information
  const venue = game.Stadium || game.Venue || game.stadium || game.venue;
  const venueName = venue?.Name || venue?.name || venue;
  const venueLocation = venue?.Location || venue?.location || venue?.City || venue?.city;
  
  // Construct game object in our schema
  return {
    gameId: game.GameID || game.GameId || game.gameId || game.id,
    league,
    season: getCurrentSeason(league),
    date: gameDate,
    status,
    homeTeam: {
      id: homeTeamId,
      name: homeTeamName,
      score: status !== 'upcoming' ? homeTeamScore : 0
    },
    awayTeam: {
      id: awayTeamId,
      name: awayTeamName,
      score: status !== 'upcoming' ? awayTeamScore : 0
    },
    venue: {
      name: venueName,
      location: venueLocation
    },
    // Save additional data as needed
    statistics: extractGameStatistics(game, league),
    metadata: {
      source: 'API',
      rawGameId: game.GameID || game.GameId || game.gameId || game.id,
      updatedAt: new Date()
    }
  };
}

/**
 * Extract game statistics from API response
 * @param {Object} game - Game object from API
 * @param {string} league - League identifier
 * @returns {Object} Game statistics
 */
function extractGameStatistics(game, league) {
  // Extract stats based on league type
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
  return {
    periods: {
      q1: {
        home: game.HomeTeamQ1Points || game.homeTeamQ1Points || 0,
        away: game.AwayTeamQ1Points || game.awayTeamQ1Points || 0
      },
      q2: {
        home: game.HomeTeamQ2Points || game.homeTeamQ2Points || 0,
        away: game.AwayTeamQ2Points || game.awayTeamQ2Points || 0
      },
      q3: {
        home: game.HomeTeamQ3Points || game.homeTeamQ3Points || 0,
        away: game.AwayTeamQ3Points || game.awayTeamQ3Points || 0
      },
      q4: {
        home: game.HomeTeamQ4Points || game.homeTeamQ4Points || 0,
        away: game.AwayTeamQ4Points || game.awayTeamQ4Points || 0
      },
      ot: {
        home: game.HomeTeamOvertimePoints || game.homeTeamOvertimePoints || 0,
        away: game.AwayTeamOvertimePoints || game.awayTeamOvertimePoints || 0
      }
    },
    teamStats: {
      home: {
        fieldGoalsMade: game.HomeTeamFieldGoalsMade || 0,
        fieldGoalsAttempted: game.HomeTeamFieldGoalsAttempted || 0,
        threePointersMade: game.HomeTeamThreePointersMade || 0,
        threePointersAttempted: game.HomeTeamThreePointersAttempted || 0,
        freeThrowsMade: game.HomeTeamFreeThrowsMade || 0,
        freeThrowsAttempted: game.HomeTeamFreeThrowsAttempted || 0,
        reboundsOffensive: game.HomeTeamReboundsOffensive || 0,
        reboundsDefensive: game.HomeTeamReboundsDefensive || 0,
        assists: game.HomeTeamAssists || 0,
        steals: game.HomeTeamSteals || 0,
        blocks: game.HomeTeamBlocks || 0,
        turnovers: game.HomeTeamTurnovers || 0,
        personalFouls: game.HomeTeamPersonalFouls || 0,
      },
      away: {
        fieldGoalsMade: game.AwayTeamFieldGoalsMade || 0,
        fieldGoalsAttempted: game.AwayTeamFieldGoalsAttempted || 0,
        threePointersMade: game.AwayTeamThreePointersMade || 0,
        threePointersAttempted: game.AwayTeamThreePointersAttempted || 0,
        freeThrowsMade: game.AwayTeamFreeThrowsMade || 0,
        freeThrowsAttempted: game.AwayTeamFreeThrowsAttempted || 0,
        reboundsOffensive: game.AwayTeamReboundsOffensive || 0,
        reboundsDefensive: game.AwayTeamReboundsDefensive || 0,
        assists: game.AwayTeamAssists || 0,
        steals: game.AwayTeamSteals || 0,
        blocks: game.AwayTeamBlocks || 0,
        turnovers: game.AwayTeamTurnovers || 0,
        personalFouls: game.AwayTeamPersonalFouls || 0,
      }
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
        home: game.HomeTeamQ1Points || 0,
        away: game.AwayTeamQ1Points || 0
      },
      q2: {
        home: game.HomeTeamQ2Points || 0,
        away: game.AwayTeamQ2Points || 0
      },
      q3: {
        home: game.HomeTeamQ3Points || 0,
        away: game.AwayTeamQ3Points || 0
      },
      q4: {
        home: game.HomeTeamQ4Points || 0,
        away: game.AwayTeamQ4Points || 0
      },
      ot: {
        home: game.HomeTeamOvertimePoints || 0,
        away: game.AwayTeamOvertimePoints || 0
      }
    },
    teamStats: {
      home: {
        firstDowns: game.HomeTeamFirstDowns || 0,
        thirdDownConversions: game.HomeTeamThirdDownConversions || 0,
        thirdDownAttempts: game.HomeTeamThirdDownAttempts || 0,
        fourthDownConversions: game.HomeTeamFourthDownConversions || 0,
        fourthDownAttempts: game.HomeTeamFourthDownAttempts || 0,
        totalYards: game.HomeTeamTotalYards || 0,
        passingYards: game.HomeTeamPassingYards || 0,
        rushingYards: game.HomeTeamRushingYards || 0,
        penalties: game.HomeTeamPenalties || 0,
        penaltyYards: game.HomeTeamPenaltyYards || 0,
        turnovers: game.HomeTeamTurnovers || 0,
        punts: game.HomeTeamPunts || 0,
        timeOfPossession: game.HomeTeamTimeOfPossession || 0
      },
      away: {
        firstDowns: game.AwayTeamFirstDowns || 0,
        thirdDownConversions: game.AwayTeamThirdDownConversions || 0,
        thirdDownAttempts: game.AwayTeamThirdDownAttempts || 0,
        fourthDownConversions: game.AwayTeamFourthDownConversions || 0,
        fourthDownAttempts: game.AwayTeamFourthDownAttempts || 0,
        totalYards: game.AwayTeamTotalYards || 0,
        passingYards: game.AwayTeamPassingYards || 0,
        rushingYards: game.AwayTeamRushingYards || 0,
        penalties: game.AwayTeamPenalties || 0,
        penaltyYards: game.AwayTeamPenaltyYards || 0,
        turnovers: game.AwayTeamTurnovers || 0,
        punts: game.AwayTeamPunts || 0,
        timeOfPossession: game.AwayTeamTimeOfPossession || 0
      }
    }
  };
}

/**
 * Extract baseball statistics
 * @param {Object} game - Game object
 * @returns {Object} Baseball stats
 */
function extractBaseballStats(game) {
  return {
    innings: extractInnings(game),
    teamStats: {
      home: {
        runs: game.HomeTeamRuns || 0,
        hits: game.HomeTeamHits || 0,
        errors: game.HomeTeamErrors || 0,
        leftOnBase: game.HomeTeamLeftOnBase || 0,
        homeRuns: game.HomeTeamHomeRuns || 0,
        batting: {
          atBats: game.HomeTeamAtBats || 0,
          hits: game.HomeTeamHits || 0,
          doubles: game.HomeTeamDoubles || 0,
          triples: game.HomeTeamTriples || 0,
          homeRuns: game.HomeTeamHomeRuns || 0,
          runs: game.HomeTeamRuns || 0,
          runsBattedIn: game.HomeTeamRunsBattedIn || 0,
          walks: game.HomeTeamWalks || 0
        },
        pitching: {
          inningsPitched: game.HomeTeamInningsPitched || 0,
          hits: game.HomeTeamHitsAllowed || 0,
          earnedRuns: game.HomeTeamEarnedRuns || 0,
          strikeouts: game.HomeTeamPitchingStrikeouts || 0,
          walks: game.HomeTeamPitchingWalks || 0
        }
      },
      away: {
        runs: game.AwayTeamRuns || 0,
        hits: game.AwayTeamHits || 0,
        errors: game.AwayTeamErrors || 0,
        leftOnBase: game.AwayTeamLeftOnBase || 0,
        homeRuns: game.AwayTeamHomeRuns || 0,
        batting: {
          atBats: game.AwayTeamAtBats || 0,
          hits: game.AwayTeamHits || 0,
          doubles: game.AwayTeamDoubles || 0,
          triples: game.AwayTeamTriples || 0,
          homeRuns: game.AwayTeamHomeRuns || 0,
          runs: game.AwayTeamRuns || 0,
          runsBattedIn: game.AwayTeamRunsBattedIn || 0,
          walks: game.AwayTeamWalks || 0
        },
        pitching: {
          inningsPitched: game.AwayTeamInningsPitched || 0,
          hits: game.AwayTeamHitsAllowed || 0,
          earnedRuns: game.AwayTeamEarnedRuns || 0,
          strikeouts: game.AwayTeamPitchingStrikeouts || 0,
          walks: game.AwayTeamPitchingWalks || 0
        }
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
        home: game.HomeTeamP1Points || game.homeTeamP1Points || 0,
        away: game.AwayTeamP1Points || game.awayTeamP1Points || 0
      },
      p2: {
        home: game.HomeTeamP2Points || game.homeTeamP2Points || 0,
        away: game.AwayTeamP2Points || game.awayTeamP2Points || 0
      },
      p3: {
        home: game.HomeTeamP3Points || game.homeTeamP3Points || 0,
        away: game.AwayTeamP3Points || game.awayTeamP3Points || 0
      },
      ot: {
        home: game.HomeTeamOvertimePoints || game.homeTeamOvertimePoints || 0,
        away: game.AwayTeamOvertimePoints || game.awayTeamOvertimePoints || 0
      }
    },
    teamStats: {
      home: {
        shotsOnGoal: game.HomeTeamShotsOnGoal || 0,
        powerPlays: game.HomeTeamPowerPlays || 0,
        powerPlayGoals: game.HomeTeamPowerPlayGoals || 0,
        penaltyMinutes: game.HomeTeamPenaltyMinutes || 0,
        faceoffsWon: game.HomeTeamFaceoffsWon || 0,
        hits: game.HomeTeamHits || 0,
        blocks: game.HomeTeamBlocks || 0
      },
      away: {
        shotsOnGoal: game.AwayTeamShotsOnGoal || 0,
        powerPlays: game.AwayTeamPowerPlays || 0,
        powerPlayGoals: game.AwayTeamPowerPlayGoals || 0,
        penaltyMinutes: game.AwayTeamPenaltyMinutes || 0,
        faceoffsWon: game.AwayTeamFaceoffsWon || 0,
        hits: game.AwayTeamHits || 0,
        blocks: game.AwayTeamBlocks || 0
      }
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
        home: game.HomeTeamH1Goals || game.homeTeamH1Goals || 0,
        away: game.AwayTeamH1Goals || game.awayTeamH1Goals || 0
      },
      h2: {
        home: game.HomeTeamH2Goals || game.homeTeamH2Goals || 0,
        away: game.AwayTeamH2Goals || game.awayTeamH2Goals || 0
      },
      ot: {
        home: game.HomeTeamOvertimeGoals || game.homeTeamOvertimeGoals || 0,
        away: game.AwayTeamOvertimeGoals || game.awayTeamOvertimeGoals || 0
      }
    },
    teamStats: {
      home: {
        shotsOnGoal: game.HomeTeamShotsOnGoal || 0,
        shotsOffTarget: game.HomeTeamShotsOffTarget || 0,
        corners: game.HomeTeamCorners || 0,
        fouls: game.HomeTeamFouls || 0,
        yellowCards: game.HomeTeamYellowCards || 0,
        redCards: game.HomeTeamRedCards || 0,
        possession: game.HomeTeamPossession || 0
      },
      away: {
        shotsOnGoal: game.AwayTeamShotsOnGoal || 0,
        shotsOffTarget: game.AwayTeamShotsOffTarget || 0,
        corners: game.AwayTeamCorners || 0,
        fouls: game.AwayTeamFouls || 0,
        yellowCards: game.AwayTeamYellowCards || 0,
        redCards: game.AwayTeamRedCards || 0,
        possession: game.AwayTeamPossession || 0
      }
    }
  };
}

/**
 * Extract innings from baseball game data
 * @param {Object} game - Game object
 * @returns {Object} Innings data
 */
function extractInnings(game) {
  const innings = {};
  for (let i = 1; i <= 9; i++) {
    innings[`inning${i}`] = {
      home: game[`HomeTeamInning${i}Score`] || game[`homeTeamInning${i}Score`] || 0,
      away: game[`AwayTeamInning${i}Score`] || game[`awayTeamInning${i}Score`] || 0
    };
  }
  return innings;
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

// Schedule the sync to run daily at 2 AM
cron.schedule('0 2 * * *', () => {
  logger.info('Starting scheduled game data synchronization');
  syncGames().catch(error => logger.error('Scheduled sync failed:', error));
});

// Run sync immediately on startup
syncGames().catch(error => logger.error('Initial sync failed:', error));