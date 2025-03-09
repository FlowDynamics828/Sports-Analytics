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
  defaultMeta: { service: 'sync-player-stats' },
  transports: [
    new winston.transports.File({
      filename: 'error.log',
      level: 'error',
      maxsize: parseInt(process.env.LOG_FILE_MAX_SIZE, 10) || 5000000,
      maxFiles: parseInt(process.env.LOG_MAX_FILES, 10) || 3,
      tailable: true
    }),
    new winston.transports.File({
      filename: 'combined.log',
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

// API configuration - Update with your actual API endpoints and keys
const API_CONFIG = {
  NBA: {
    url: process.env.NBA_API_URL || 'https://api.sportsdata.io/v3/nba',
    key: process.env.NBA_API_KEY || 'your-api-key-here',
    statsEndpoint: '/stats/json/PlayerGameStatsByDate'
  },
  NFL: {
    url: process.env.NFL_API_URL || 'https://api.sportsdata.io/v3/nfl',
    key: process.env.NFL_API_KEY || 'your-api-key-here',
    statsEndpoint: '/stats/json/PlayerGameStatsByWeek'
  },
  MLB: {
    url: process.env.MLB_API_URL || 'https://api.sportsdata.io/v3/mlb',
    key: process.env.MLB_API_KEY || 'your-api-key-here',
    statsEndpoint: '/stats/json/PlayerGameStatsByDate'
  },
  NHL: {
    url: process.env.NHL_API_URL || 'https://api.sportsdata.io/v3/nhl',
    key: process.env.NHL_API_KEY || 'your-api-key-here',
    statsEndpoint: '/stats/json/PlayerGameStatsByDate'
  },
  PREMIER_LEAGUE: {
    url: process.env.PREMIER_LEAGUE_API_URL || 'https://api.sportsdata.io/v3/soccer',
    key: process.env.SOCCER_API_KEY || 'your-api-key-here',
    statsEndpoint: '/stats/json/PlayerGameStatsByDate',
    competitionId: 1 // Premier League
  },
  LA_LIGA: {
    url: process.env.LA_LIGA_API_URL || 'https://api.sportsdata.io/v3/soccer',
    key: process.env.SOCCER_API_KEY || 'your-api-key-here',
    statsEndpoint: '/stats/json/PlayerGameStatsByDate',
    competitionId: 2 // La Liga
  },
  BUNDESLIGA: {
    url: process.env.BUNDESLIGA_API_URL || 'https://api.sportsdata.io/v3/soccer',
    key: process.env.SOCCER_API_KEY || 'your-api-key-here',
    statsEndpoint: '/stats/json/PlayerGameStatsByDate',
    competitionId: 3 // Bundesliga
  },
  SERIE_A: {
    url: process.env.SERIE_A_API_URL || 'https://api.sportsdata.io/v3/soccer',
    key: process.env.SOCCER_API_KEY || 'your-api-key-here',
    statsEndpoint: '/stats/json/PlayerGameStatsByDate',
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
        maxPoolSize: parseInt(process.env.DB_MAX_POOL_SIZE, 10) || 10,
        minPoolSize: parseInt(process.env.DB_MIN_POOL_SIZE, 10) || 1,
        connectTimeoutMS: parseInt(process.env.CONNECT_TIMEOUT_MS, 10) || 5000,
        socketTimeoutMS: parseInt(process.env.SOCKET_TIMEOUT_MS, 10) || 10000
      });
      
      logger.info('MongoDB connection established for player stats synchronization');
    }
    
    const db = dbManager?.client?.db(DB_NAME) || client.db(DB_NAME);
    
    // Sync for each league
    for (const league of SUPPORTED_LEAGUES) {
      try {
        await syncLeaguePlayerStats(db, league, API_CONFIG[league]);
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
 * @param {Object} config - API configuration for the league
 */
async function syncLeaguePlayerStats(db, league, config) {
  try {
    logger.info(`Starting player stats synchronization for ${league}`);
    
    // Calculate date range (default to yesterday)
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const formattedDate = yesterday.toISOString().split('T')[0]; // YYYY-MM-DD format
    
    // Set up API request parameters based on league
    let endpoint = config.statsEndpoint;
    let params = {};
    
    // League-specific parameter adjustments
    if (league === 'NFL') {
      // NFL uses week-based stats instead of date
      const currentSeason = getCurrentNFLSeason();
      const currentWeek = calculateNFLWeek();
      params = {
        season: currentSeason,
        week: currentWeek
      };
    } else if (['PREMIER_LEAGUE', 'LA_LIGA', 'BUNDESLIGA', 'SERIE_A'].includes(league)) {
      // Soccer leagues need competition ID
      params = {
        date: formattedDate,
        competition: config.competitionId
      };
    } else {
      // Standard date-based parameters for NBA, MLB, NHL
      params = {
        date: formattedDate
      };
    }
    
    logger.info(`Requesting ${league} player stats with params:`, params);
    
    // Make API request
    const response = await axios.get(`${config.url}${endpoint}`, {
      params,
      headers: {
        'Ocp-Apim-Subscription-Key': config.key
      },
      timeout: 30000 // 30 second timeout
    });
    
    if (!response.data || !Array.isArray(response.data)) {
      logger.warn(`No ${league} player stats returned from API. Response:`, response.data);
      return;
    }
    
    // Process player stats
    const playerStats = transformPlayerStats(response.data, league, formattedDate);
    
    // Get collection name for this league
    const collectionName = `${league.toLowerCase()}_player_stats`;
    
    // Ensure collection exists with proper indexes
    await ensureCollectionExists(db, collectionName);
    
    // Insert/update player stats
    let updatedCount = 0;
    let insertedCount = 0;
    
    for (const stat of playerStats) {
      const result = await db.collection(collectionName).updateOne(
        { 
          playerId: stat.playerId,
          gameId: stat.gameId
        },
        { $set: stat },
        { upsert: true }
      );
      
      if (result.matchedCount > 0) {
        updatedCount++;
      } else if (result.upsertedCount > 0) {
        insertedCount++;
      }
    }
    
    logger.info(`${league} player stats sync completed: ${insertedCount} inserted, ${updatedCount} updated`);
    
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
 * Transform API player stats to our schema format
 * @param {Array} apiStats - Stats from API
 * @param {string} league - League identifier
 * @param {string} gameDate - Game date string
 * @returns {Array} Transformed player stats
 */
function transformPlayerStats(apiStats, league, gameDate) {
  return apiStats.map(stat => {
    // Base player stat object
    const basePlayerStat = {
      playerId: stat.PlayerID || stat.PlayerId || stat.playerId || '',
      playerName: stat.Name || stat.PlayerName || stat.name || '',
      teamId: stat.TeamID || stat.TeamId || stat.teamId || '',
      teamName: stat.Team || stat.TeamName || stat.team || '',
      gameId: stat.GameID || stat.GameId || stat.gameId || '',
      date: new Date(gameDate),
      league: league,
      season: getCurrentSeason(league),
      minutesPlayed: stat.Minutes || stat.MinutesPlayed || 0,
      isStarter: stat.IsStarting || stat.Starter || stat.isStarter || false,
      stats: {},
      advancedMetrics: {},
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    // Add sport-specific stats
    switch(league) {
      case 'NBA':
        basePlayerStat.stats = extractBasketballStats(stat);
        break;
      case 'NFL':
        basePlayerStat.stats = extractFootballStats(stat);
        break;
      case 'MLB':
        basePlayerStat.stats = extractBaseballStats(stat);
        break;
      case 'NHL':
        basePlayerStat.stats = extractHockeyStats(stat);
        break;
      case 'PREMIER_LEAGUE':
      case 'LA_LIGA':
      case 'BUNDESLIGA':
      case 'SERIE_A':
        basePlayerStat.stats = extractSoccerStats(stat);
        break;
      default:
        // Generic stats extraction
        basePlayerStat.stats = extractGenericStats(stat);
    }
    
    return basePlayerStat;
  });
}

/**
 * Extract basketball-specific stats from API response
 * @param {Object} stat - API stat object
 * @returns {Object} Basketball stats
 */
function extractBasketballStats(stat) {
  return {
    points: stat.Points || 0,
    rebounds: (stat.Rebounds || stat.TotalRebounds || 0),
    assists: stat.Assists || 0,
    steals: stat.Steals || 0,
    blocks: stat.BlockedShots || stat.Blocks || 0,
    turnovers: stat.Turnovers || 0,
    fieldGoalsMade: stat.FieldGoalsMade || 0,
    fieldGoalsAttempted: stat.FieldGoalsAttempted || 0,
    threePointersMade: stat.ThreePointersMade || 0,
    threePointersAttempted: stat.ThreePointersAttempted || 0,
    freeThrowsMade: stat.FreeThrowsMade || 0,
    freeThrowsAttempted: stat.FreeThrowsAttempted || 0,
    personalFouls: stat.PersonalFouls || 0,
    plusMinus: stat.PlusMinus || 0,
    offensiveRebounds: stat.OffensiveRebounds || 0,
    defensiveRebounds: stat.DefensiveRebounds || 0
  };
}

/**
 * Extract football-specific stats from API response
 * @param {Object} stat - API stat object
 * @returns {Object} Football stats
 */
function extractFootballStats(stat) {
  return {
    passingYards: stat.PassingYards || 0,
    passingTouchdowns: stat.PassingTouchdowns || 0,
    passingCompletions: stat.PassingCompletions || 0,
    passingAttempts: stat.PassingAttempts || 0,
    passingInterceptions: stat.PassingInterceptions || 0,
    rushingYards: stat.RushingYards || 0,
    rushingTouchdowns: stat.RushingTouchdowns || 0,
    rushingAttempts: stat.RushingAttempts || 0,
    receivingYards: stat.ReceivingYards || 0,
    receivingTouchdowns: stat.ReceivingTouchdowns || 0,
    receptions: stat.Receptions || 0,
    targets: stat.Targets || 0,
    fumbles: stat.Fumbles || 0,
    fumblesLost: stat.FumblesLost || 0,
    tacklesSolo: stat.TacklesSolo || 0,
    tacklesAssisted: stat.TacklesAssisted || 0,
    tacklesForLoss: stat.TacklesForLoss || 0,
    sacks: stat.Sacks || 0,
    interceptions: stat.Interceptions || 0,
    interceptionReturnYards: stat.InterceptionReturnYards || 0,
    interceptionReturnTouchdowns: stat.InterceptionReturnTouchdowns || 0
  };
}

/**
 * Extract baseball-specific stats from API response
 * @param {Object} stat - API stat object
 * @returns {Object} Baseball stats
 */
function extractBaseballStats(stat) {
  return {
    atBats: stat.AtBats || 0,
    runs: stat.Runs || 0,
    hits: stat.Hits || 0,
    doubles: stat.Doubles || 0,
    triples: stat.Triples || 0,
    homeRuns: stat.HomeRuns || 0,
    runsBattedIn: stat.RunsBattedIn || 0,
    battingAverage: stat.BattingAverage || 0,
    stolenBases: stat.StolenBases || 0,
    caughtStealing: stat.CaughtStealing || 0,
    strikeouts: stat.Strikeouts || 0,
    walks: stat.Walks || 0,
    hitByPitch: stat.HitByPitch || 0,
    sacrifices: stat.Sacrifices || 0,
    onBasePercentage: stat.OnBasePercentage || 0,
    sluggingPercentage: stat.SluggingPercentage || 0,
    onBasePlusSlugging: stat.OnBasePlusSlugging || 0,
    inningsPitched: stat.InningsPitched || 0,
    pitchingHits: stat.PitchingHits || 0,
    pitchingRuns: stat.PitchingRuns || 0,
    pitchingEarnedRuns: stat.PitchingEarnedRuns || 0,
    pitchingWalks: stat.PitchingWalks || 0,
    pitchingStrikeouts: stat.PitchingStrikeouts || 0,
    pitchingHomeRuns: stat.PitchingHomeRuns || 0,
    earnedRunAverage: stat.EarnedRunAverage || 0,
    wins: stat.Wins || 0,
    losses: stat.Losses || 0,
    saves: stat.Saves || 0
  };
}

/**
 * Extract hockey-specific stats from API response
 * @param {Object} stat - API stat object
 * @returns {Object} Hockey stats
 */
function extractHockeyStats(stat) {
  return {
    goals: stat.Goals || 0,
    assists: stat.Assists || 0,
    points: stat.Points || 0,
    plusMinus: stat.PlusMinus || 0,
    penaltyMinutes: stat.PenaltyMinutes || 0,
    powerPlayGoals: stat.PowerPlayGoals || 0,
    powerPlayAssists: stat.PowerPlayAssists || 0,
    shortHandedGoals: stat.ShortHandedGoals || 0,
    shortHandedAssists: stat.ShortHandedAssists || 0,
    gameWinningGoals: stat.GameWinningGoals || 0,
    shots: stat.Shots || 0,
    blockedShots: stat.BlockedShots || 0,
    hits: stat.Hits || 0,
    faceoffs: stat.Faceoffs || 0,
    faceoffWins: stat.FaceoffWins || 0,
    takeaways: stat.Takeaways || 0,
    giveaways: stat.Giveaways || 0,
    saves: stat.Saves || 0,
    goalsAgainst: stat.GoalsAgainst || 0,
    savePercentage: stat.SavePercentage || 0,
    shutouts: stat.Shutouts || 0
  };
}

/**
 * Extract soccer-specific stats from API response
 * @param {Object} stat - API stat object
 * @returns {Object} Soccer stats
 */
function extractSoccerStats(stat) {
  return {
    goals: stat.Goals || 0,
    assists: stat.Assists || 0,
    shots: stat.Shots || 0,
    shotsOnGoal: stat.ShotsOnGoal || 0,
    yellowCards: stat.YellowCards || 0,
    redCards: stat.RedCards || 0,
    passingAccuracy: stat.PassingAccuracy || 0,
    passes: stat.Passes || 0,
    passesCompleted: stat.PassesCompleted || 0,
    tackles: stat.Tackles || 0,
    interceptions: stat.Interceptions || 0,
    foulsCommitted: stat.FoulsCommitted || 0,
    foulsDrawn: stat.FoulsDrawn || 0,
    saves: stat.Saves || 0,
    cleanSheets: stat.CleanSheets || 0,
    penaltiesSaved: stat.PenaltiesSaved || 0,
    penaltiesAllowed: stat.PenaltiesAllowed || 0,
    minutesPlayed: stat.MinutesPlayed || 0
  };
}

/**
 * Extract generic stats for any sport
 * @param {Object} stat - API stat object
 * @returns {Object} Generic stats
 */
function extractGenericStats(stat) {
  // Create a generic stats object from all numeric properties
  const genericStats = {};
  
  for (const [key, value] of Object.entries(stat)) {
    if (typeof value === 'number' && !['id', 'playerId', 'teamId', 'gameId'].includes(key.toLowerCase())) {
      genericStats[key] = value;
    }
  }
  
  return genericStats;
}

/**
 * Get current season for a league
 * @param {string} league - League identifier
 * @returns {string} Current season identifier
 */
function getCurrentSeason(league = '') {
  const currentDate = new Date();
  const currentYear = currentDate.getFullYear();
  const currentMonth = currentDate.getMonth() + 1; // 1-12
  
  // League-specific season logic
  switch(league.toUpperCase()) {
    case 'NFL':
      // NFL season spans Aug/Sept to Feb
      return currentMonth >= 8 ? `${currentYear}` : `${currentYear - 1}`;
      
    case 'NBA':
    case 'NHL':
      // NBA/NHL seasons span Oct to June
      return currentMonth >= 10 ? `${currentYear}-${currentYear + 1}` : `${currentYear - 1}-${currentYear}`;
      
    case 'MLB':
      // MLB season spans March/April to Oct/Nov
      return currentMonth >= 3 && currentMonth <= 11 ? `${currentYear}` : (currentMonth < 3 ? `${currentYear}` : `${currentYear}`);
      
    case 'PREMIER_LEAGUE':
    case 'LA_LIGA':
    case 'BUNDESLIGA':
    case 'SERIE_A':
      // European soccer seasons span Aug/Sept to May
      return currentMonth >= 8 ? `${currentYear}-${currentYear + 1}` : `${currentYear - 1}-${currentYear}`;
      
    default:
      return `${currentYear}`;
  }
}

/**
 * Get current NFL season
 * @returns {string} Current NFL season year
 */
function getCurrentNFLSeason() {
  const currentDate = new Date();
  const currentYear = currentDate.getFullYear();
  const currentMonth = currentDate.getMonth() + 1; // 1-12
  
  // NFL season spans Aug/Sept to Feb
  return currentMonth >= 8 ? `${currentYear}` : `${currentYear - 1}`;
}

/**
 * Calculate current NFL week
 * @returns {number} Current NFL week
 */
function calculateNFLWeek() {
  // A simple estimation - in production, you would fetch this from a sports data API
  const currentDate = new Date();
  const currentYear = currentDate.getFullYear();
  const seasonStartDate = new Date(currentYear, 8, 1); // Sept 1 (approximate)
  
  // If before season start, return week 1
  if (currentDate < seasonStartDate) {
    return 1;
  }
  
  // Calculate weeks since season start
  const diffTime = Math.abs(currentDate - seasonStartDate);
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  const week = Math.floor(diffDays / 7) + 1;
  
  // Cap at week 17 (regular season)
  return Math.min(week, 17);
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
}