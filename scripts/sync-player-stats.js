// scripts/sync-player-stats.js
const { MongoClient } = require('mongodb');
const axios = require('axios');
require('dotenv').config();
const cron = require('node-cron');
const path = require('path');
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
  defaultMeta: { service: 'sync-player-stats', version: '2.0.0' },
  transports: [
    new winston.transports.File({
      filename: 'logs/player-stats-error.log',
      level: 'error',
      maxsize: parseInt(process.env.LOG_FILE_MAX_SIZE, 10) || 10000000,
      maxFiles: parseInt(process.env.LOG_MAX_FILES, 10) || 5,
      tailable: true
    }),
    new winston.transports.File({
      filename: 'logs/player-stats.log',
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

// Supported leagues
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
 * Main function to synchronize player statistics across all leagues
 */
async function syncPlayerStats() {
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
      
      logger.info('MongoDB connection established for player stats synchronization');
    }
    
    const db = dbManager?.client?.db(DB_NAME) || client.db(DB_NAME);
    
    // Sync for each league
    for (const league of SUPPORTED_LEAGUES) {
      try {
        await syncLeaguePlayerStats(db, league);
      } catch (leagueError) {
        logger.error(`Error syncing ${league} player stats:`, leagueError);
        // Continue with other leagues even if one fails
      }
    }
    
    logger.info('Player statistics synchronization completed');
    
  } catch (error) {
    logger.error('Error in player stats synchronization:', error);
    throw error;
  } finally {
    if (client) {
      await client.close();
      logger.info('MongoDB connection closed');
    }
  }
}

/**
 * Synchronize player statistics for a specific league
 * @param {Object} db - MongoDB database instance
 * @param {string} league - League identifier
 */
async function syncLeaguePlayerStats(db, league) {
  try {
    logger.info(`Starting player stats synchronization for ${league}`);
    
    // Get collection name for this league
    const collectionName = `${league.toLowerCase()}_player_stats`;
    
    // Ensure collection exists with proper indexes
    await ensureCollectionExists(db, collectionName);
    
    // Get recent games for the league (to fetch player stats from)
    const recentGames = await fetchRecentGames(league);
    logger.info(`Found ${recentGames.length} recent games for ${league}`);
    
    let totalPlayersProcessed = 0;
    
    // Process each game's player stats
    for (const game of recentGames) {
      try {
        // Fetch player statistics for this game
        const playerStats = await fetchGamePlayerStats(league, game.idEvent);
        
        if (playerStats.length === 0) {
          logger.debug(`No player stats found for game ${game.idEvent}`);
          continue;
        }
        
        // Transform and save each player's stats
        let updatedCount = 0;
        let insertedCount = 0;
        
        for (const stat of playerStats) {
          const transformedStat = transformPlayerStat(stat, league, game);
          
          // Skip invalid stats
          if (!transformedStat.playerId || !transformedStat.gameId) {
            continue;
          }
          
          // Update or insert player stat
          const result = await db.collection(collectionName).updateOne(
            { 
              playerId: transformedStat.playerId,
              gameId: transformedStat.gameId
            },
            { $set: transformedStat },
            { upsert: true }
          );
          
          if (result.matchedCount > 0) {
            updatedCount++;
          } else if (result.upsertedCount > 0) {
            insertedCount++;
          }
        }
        
        totalPlayersProcessed += insertedCount + updatedCount;
        logger.debug(`Processed ${insertedCount + updatedCount} player stats for game ${game.idEvent}`);
        
      } catch (gameError) {
        logger.error(`Error processing player stats for game ${game.idEvent}:`, gameError);
      }
    }
    
    logger.info(`${league} player stats sync completed: ${totalPlayersProcessed} players processed`);
    
  } catch (error) {
    logger.error(`Error syncing ${league} player stats:`, error);
    throw error;
  }
}

/**
 * Ensure player stats collection exists with proper indexes
 * @param {Object} db - MongoDB database instance
 * @param {string} collectionName - Collection name
 */
async function ensureCollectionExists(db, collectionName) {
  try {
    // Check if collection exists
    const collections = await db.listCollections({ name: collectionName }).toArray();
    if (collections.length === 0) {
      // Create collection if it doesn't exist
      await db.createCollection(collectionName);
      logger.info(`Created ${collectionName} collection`);
    }
    
    // Create indexes
    await db.collection(collectionName).createIndex({ playerId: 1 });
    await db.collection(collectionName).createIndex({ gameId: 1 });
    await db.collection(collectionName).createIndex({ teamId: 1 });
    await db.collection(collectionName).createIndex({ date: -1 });
    await db.collection(collectionName).createIndex({ 
      playerId: 1, 
      date: -1 
    }, { name: "player_date_lookup" });
    
    logger.info(`Ensured indexes for ${collectionName}`);
  } catch (error) {
    logger.error(`Error ensuring collection ${collectionName}:`, error);
    throw error;
  }
}

/**
 * Fetch recent games for a league
 * @param {string} league - League identifier
 * @returns {Promise<Array>} Recent completed games
 */
async function fetchRecentGames(league) {
  try {
    const leagueId = LEAGUE_IDS[league];
    
    // Using eventspastleague endpoint to get recent completed games (last 15)
    const url = `${SPORTSDB_BASE_URL}/${SPORTSDB_API_KEY}/eventspastleague/${leagueId}/15`;
    
    logger.debug(`Requesting recent games from: ${url}`);
    
    const response = await axios.get(url, { timeout: API_TIMEOUT });
    
    if (!response.data || !response.data.events || !Array.isArray(response.data.events)) {
      logger.warn(`No ${league} recent games returned from TheSportsDB`);
      return [];
    }
    
    // Filter to get only finished games
    return response.data.events.filter(game => 
      game.strStatus === 'Match Finished' || 
      game.strStatus === 'Finished' || 
      game.strStatus === 'FT'
    );
  } catch (error) {
    logger.error(`Error fetching recent games for ${league}:`, error);
    return [];
  }
}

/**
 * Fetch player statistics for a specific game
 * @param {string} league - League identifier
 * @param {string} gameId - Game ID
 * @returns {Promise<Array>} Player statistics
 */
async function fetchGamePlayerStats(league, gameId) {
  try {
    // Using eventstatistics endpoint to get player stats for a game
    const url = `${SPORTSDB_BASE_URL}/${SPORTSDB_API_KEY}/eventstatistics/${gameId}`;
    
    logger.debug(`Requesting player stats for game ${gameId} from: ${url}`);
    
    const response = await axios.get(url, { timeout: API_TIMEOUT });
    
    // Check if we have valid player stats
    if (!response.data || !response.data.statistics) {
      return [];
    }
    
    // Extract player stats based on sport
    const sport = SPORTS_MAPPING[league];
    
    // Handle different sport structures in the API response
    switch (sport) {
      case 'soccer':
        return processPlayerStats_Soccer(response.data.statistics);
      case 'basketball':
        return processPlayerStats_Basketball(response.data.statistics);
      case 'american_football':
        return processPlayerStats_Football(response.data.statistics);
      case 'baseball':
        return processPlayerStats_Baseball(response.data.statistics);
      case 'ice_hockey':
        return processPlayerStats_Hockey(response.data.statistics);
      default:
        return [];
    }
  } catch (error) {
    logger.error(`Error fetching player stats for game ${gameId}:`, error);
    return [];
  }
}

/**
 * Process soccer player statistics
 * @param {Object} statsData - Raw statistics data
 * @returns {Array} Processed player statistics
 */
function processPlayerStats_Soccer(statsData) {
  const playerStats = [];
  
  // Process home team players
  if (statsData.home && Array.isArray(statsData.home.players)) {
    statsData.home.players.forEach(player => {
      player.teamId = statsData.home.teamid;
      player.teamName = statsData.home.strTeam;
      player.isHomeTeam = true;
      playerStats.push(player);
    });
  }
  
  // Process away team players
  if (statsData.away && Array.isArray(statsData.away.players)) {
    statsData.away.players.forEach(player => {
      player.teamId = statsData.away.teamid;
      player.teamName = statsData.away.strTeam;
      player.isHomeTeam = false;
      playerStats.push(player);
    });
  }
  
  return playerStats;
}

/**
 * Process basketball player statistics
 * @param {Object} statsData - Raw statistics data
 * @returns {Array} Processed player statistics
 */
function processPlayerStats_Basketball(statsData) {
  // Similar structure to soccer in TheSportsDB
  return processPlayerStats_Soccer(statsData);
}

/**
 * Process football player statistics
 * @param {Object} statsData - Raw statistics data
 * @returns {Array} Processed player statistics
 */
function processPlayerStats_Football(statsData) {
  // Similar structure to soccer in TheSportsDB
  return processPlayerStats_Soccer(statsData);
}

/**
 * Process baseball player statistics
 * @param {Object} statsData - Raw statistics data
 * @returns {Array} Processed player statistics
 */
function processPlayerStats_Baseball(statsData) {
  // Similar structure to soccer in TheSportsDB
  return processPlayerStats_Soccer(statsData);
}

/**
 * Process hockey player statistics
 * @param {Object} statsData - Raw statistics data
 * @returns {Array} Processed player statistics
 */
function processPlayerStats_Hockey(statsData) {
  // Similar structure to soccer in TheSportsDB
  return processPlayerStats_Soccer(statsData);
}

/**
 * Transform API player stat to our schema format
 * @param {Object} stat - Player stat from API
 * @param {string} league - League identifier
 * @param {Object} game - Game object
 * @returns {Object} Transformed player stat
 */
function transformPlayerStat(stat, league, game) {
  // Base player stat object
  const basePlayerStat = {
    playerId: stat.idPlayer,
    playerName: stat.strPlayer,
    teamId: stat.teamId,
    teamName: stat.teamName,
    gameId: game.idEvent,
    date: new Date(game.dateEvent),
    league: league,
    season: getCurrentSeason(league),
    isHomeTeam: stat.isHomeTeam,
    isStarter: stat.strPosition === 'Starter' || stat.intPosition <= 11, // Basic assumption
    minutesPlayed: extractMinutesPlayed(stat),
    stats: extractSportSpecificStats(stat, league),
    createdAt: new Date(),
    updatedAt: new Date()
  };
  
  return basePlayerStat;
}

/**
 * Extract minutes played from player stat
 * @param {Object} stat - Player stat
 * @returns {number} Minutes played
 */
function extractMinutesPlayed(stat) {
  // Different sports/leagues might store this differently
  if (stat.intMinutes) {
    return parseInt(stat.intMinutes);
  } else if (stat.strMinutes) {
    // Parse minutes from string format (e.g., "90:00")
    const minutesStr = stat.strMinutes.split(':')[0];
    return parseInt(minutesStr) || 0;
  }
  
  return 0;
}

/**
 * Extract sport-specific stats from player stat
 * @param {Object} stat - Player stat
 * @param {string} league - League identifier
 * @returns {Object} Sport-specific stats
 */
function extractSportSpecificStats(stat, league) {
  switch(league) {
    case 'NBA':
      return extractBasketballPlayerStats(stat);
    case 'NFL':
      return extractFootballPlayerStats(stat);
    case 'MLB':
      return extractBaseballPlayerStats(stat);
    case 'NHL':
      return extractHockeyPlayerStats(stat);
    case 'PREMIER_LEAGUE':
    case 'LA_LIGA':
    case 'BUNDESLIGA':
    case 'SERIE_A':
      return extractSoccerPlayerStats(stat);
    default:
      return extractGenericPlayerStats(stat);
  }
}

/**
 * Extract basketball-specific stats from player stat
 * @param {Object} stat - Player stat
 * @returns {Object} Basketball-specific stats
 */
function extractBasketballPlayerStats(stat) {
  return {
    points: parseInt(stat.intPoints) || 0,
    assists: parseInt(stat.intAssists) || 0,
    rebounds: parseInt(stat.intRebounds) || 0,
    steals: parseInt(stat.intSteals) || 0,
    blocks: parseInt(stat.intBlocks) || 0,
    turnovers: parseInt(stat.intTurnovers) || 0,
    fouls: parseInt(stat.intFouls) || 0,
    fieldGoalsMade: parseInt(stat.intFieldGoalsMade) || 0,
    fieldGoalsAttempted: parseInt(stat.intFieldGoalsAttempted) || 0,
    threePointersMade: parseInt(stat.intThreePointersMade) || 0,
    threePointersAttempted: parseInt(stat.intThreePointersAttempted) || 0,
    freeThrowsMade: parseInt(stat.intFreeThrowsMade) || 0,
    freeThrowsAttempted: parseInt(stat.intFreeThrowsAttempted) || 0,
    plusMinus: parseInt(stat.intPlusMinus) || 0
  };
}

/**
 * Extract football-specific stats from player stat
 * @param {Object} stat - Player stat
 * @returns {Object} Football-specific stats
 */
function extractFootballPlayerStats(stat) {
  return {
    passingYards: parseInt(stat.intPassingYards) || 0,
    passingTouchdowns: parseInt(stat.intPassingTouchdowns) || 0,
    passingCompletions: parseInt(stat.intPassingCompletions) || 0,
    passingAttempts: parseInt(stat.intPassingAttempts) || 0,
    passingInterceptions: parseInt(stat.intPassingInterceptions) || 0,
    rushingYards: parseInt(stat.intRushingYards) || 0,
    rushingTouchdowns: parseInt(stat.intRushingTouchdowns) || 0,
    rushingAttempts: parseInt(stat.intRushingAttempts) || 0,
    receivingYards: parseInt(stat.intReceivingYards) || 0,
    receivingTouchdowns: parseInt(stat.intReceivingTouchdowns) || 0,
    receptions: parseInt(stat.intReceptions) || 0,
    tackles: parseInt(stat.intTackles) || 0,
    sacks: parseInt(stat.intSacks) || 0,
    interceptions: parseInt(stat.intInterceptions) || 0,
    fumbles: parseInt(stat.intFumbles) || 0,
    fumblesRecovered: parseInt(stat.intFumblesRecovered) || 0
  };
}

/**
 * Extract baseball-specific stats from player stat
 * @param {Object} stat - Player stat
 * @returns {Object} Baseball-specific stats
 */
function extractBaseballPlayerStats(stat) {
  return {
    atBats: parseInt(stat.intAtBats) || 0,
    runs: parseInt(stat.intRuns) || 0,
    hits: parseInt(stat.intHits) || 0,
    doubles: parseInt(stat.intDoubles) || 0,
    triples: parseInt(stat.intTriples) || 0,
    homeRuns: parseInt(stat.intHomeRuns) || 0,
    runsBattedIn: parseInt(stat.intRunsBattedIn) || 0,
    walks: parseInt(stat.intWalks) || 0,
    strikeouts: parseInt(stat.intStrikeouts) || 0,
    stolenBases: parseInt(stat.intStolenBases) || 0,
    inningsPitched: parseFloat(stat.strInningsPitched) || 0,
    pitchingHits: parseInt(stat.intPitchingHits) || 0,
    pitchingRuns: parseInt(stat.intPitchingRuns) || 0,
    earnedRuns: parseInt(stat.intEarnedRuns) || 0,
    pitchingWalks: parseInt(stat.intPitchingWalks) || 0,
    pitchingStrikeouts: parseInt(stat.intPitchingStrikeouts) || 0,
    pitchingHomeRuns: parseInt(stat.intPitchingHomeRuns) || 0
  };
}

/**
 * Extract hockey-specific stats from player stat
 * @param {Object} stat - Player stat
 * @returns {Object} Hockey-specific stats
 */
function extractHockeyPlayerStats(stat) {
  return {
    goals: parseInt(stat.intGoals) || 0,
    assists: parseInt(stat.intAssists) || 0,
    points: parseInt(stat.intPoints) || 0,
    plusMinus: parseInt(stat.intPlusMinus) || 0,
    penaltyMinutes: parseInt(stat.intPenaltyMinutes) || 0,
    shots: parseInt(stat.intShots) || 0,
    hits: parseInt(stat.intHits) || 0,
    blocks: parseInt(stat.intBlocks) || 0,
    faceoffWins: parseInt(stat.intFaceoffWins) || 0,
    faceoffsTaken: parseInt(stat.intFaceoffsTaken) || 0,
    saves: parseInt(stat.intSaves) || 0,
    goalsAgainst: parseInt(stat.intGoalsAgainst) || 0,
    shotsFaced: parseInt(stat.intShotsFaced) || 0
  };
}

/**
 * Extract soccer-specific stats from player stat
 * @param {Object} stat - Player stat
 * @returns {Object} Soccer-specific stats
 */
function extractSoccerPlayerStats(stat) {
  return {
    goals: parseInt(stat.intGoals) || 0,
    assists: parseInt(stat.intAssists) || 0,
    yellowCards: parseInt(stat.intYellowCards) || 0,
    redCards: parseInt(stat.intRedCards) || 0,
    shots: parseInt(stat.intShots) || 0,
    shotsOnTarget: parseInt(stat.intShotsOnTarget) || 0,
    passes: parseInt(stat.intPasses) || 0,
    tackles: parseInt(stat.intTackles) || 0,
    blocks: parseInt(stat.intBlocks) || 0,
    interceptions: parseInt(stat.intInterceptions) || 0,
    fouls: parseInt(stat.intFouls) || 0,
    fouled: parseInt(stat.intFouled) || 0,
    offsides: parseInt(stat.intOffsides) || 0,
    saves: parseInt(stat.intSaves) || 0,
    conceded: parseInt(stat.intConceded) || 0
  };
}

/**
 * Extract generic stats from player stat
 * @param {Object} stat - Player stat
 * @returns {Object} Generic stats
 */
function extractGenericPlayerStats(stat) {
  const genericStats = {};
  
  // Loop through all properties and extract numeric values
  for (const [key, value] of Object.entries(stat)) {
    if (key.startsWith('int') && !isNaN(parseInt(value))) {
      // Convert intPropertyName to propertyName
      const statName = key.replace('int', '');
      const camelCaseName = statName.charAt(0).toLowerCase() + statName.slice(1);
      genericStats[camelCaseName] = parseInt(value) || 0;
    }
  }
  
  return genericStats;
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

/**
 * Get system health status
 * @returns {Object} Health status information
 */
async function getHealthStatus() {
  try {
    const memoryUsage = process.memoryUsage();
    const dbStatus = dbManager ? await dbManager.healthCheck() : { status: 'unknown' };
    
    return {
      status: 'operational',
      timestamp: new Date().toISOString(),
      memory: {
        rss: Math.round(memoryUsage.rss / 1024 / 1024) + 'MB',
        heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024) + 'MB',
        heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024) + 'MB',
        external: Math.round(memoryUsage.external / 1024 / 1024) + 'MB'
      },
      database: dbStatus,
      uptime: process.uptime(),
      version: process.version
    };
  } catch (error) {
    logger.error('Error getting health status:', error);
    return {
      status: 'degraded',
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
}

// Run the job daily at 5:00 AM
cron.schedule('0 5 * * *', async () => {
  try {
    logger.info('Starting scheduled player stats synchronization');
    await syncPlayerStats();
    logger.info('Scheduled player stats synchronization completed successfully');
  } catch (error) {
    logger.error('Scheduled player stats synchronization failed:', error);
  }
});

// Health check endpoint - When used with HTTP server
const getHealth = () => getHealthStatus();

// Export for use in other modules or manual execution
module.exports = {
  syncPlayerStats,
  syncLeaguePlayerStats,
  getHealth
};

// Execute directly if run from command line
if (require.main === module) {
  syncPlayerStats()
    .then(() => {
      logger.info('Player stats synchronization executed successfully');
      process.exit(0);
    })
    .catch(error => {
      logger.error('Player stats synchronization failed:', error);
      process.exit(1);
    });