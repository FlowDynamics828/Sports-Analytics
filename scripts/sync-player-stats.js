require('dotenv').config();
const { MongoClient } = require('mongodb');
const axios = require('axios');
const winston = require('winston');
const cron = require('node-cron');
const path = require('path');
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
const SPORTS_API_URL = process.env.SPORTS_API_URL;
const SPORTS_API_KEY = process.env.SPORTS_API_KEY;
const THESPORTSDB_API_KEY = process.env.THESPORTSDB_API_KEY || process.env.SPORTSDB_API_KEY;
const THESPORTSDB_BASE_URL = process.env.SPORTSDB_BASE_URL || 'https://www.thesportsdb.com/api/v2/json';

// Supported leagues
const SUPPORTED_LEAGUES = [
  'NFL', 'NBA', 'MLB', 'NHL',
  'PREMIER_LEAGUE', 'LA_LIGA', 'BUNDESLIGA', 'SERIE_A'
];

// API configuration - Update with your actual API endpoints and keys
const API_CONFIG = {
  NBA: {
    url: 'https://www.thesportsdb.com/api/v1/json',
    key: process.env.THESPORTSDB_API_KEY || '3',
    statsEndpoint: '/lookupgame.php?id=',
    competitionId: 4387
  },
  NFL: {
    url: 'https://www.thesportsdb.com/api/v1/json',
    key: process.env.THESPORTSDB_API_KEY || '3',
    statsEndpoint: '/lookupgame.php?id=',
    competitionId: 4391
  },
  MLB: {
    url: 'https://www.thesportsdb.com/api/v1/json',
    key: process.env.THESPORTSDB_API_KEY || '3',
    statsEndpoint: '/lookupgame.php?id=',
    competitionId: 4424
  },
  NHL: {
    url: 'https://www.thesportsdb.com/api/v1/json',
    key: process.env.THESPORTSDB_API_KEY || '3',
    statsEndpoint: '/lookupgame.php?id=',
    competitionId: 4380
  },
  PREMIER_LEAGUE: {
    url: 'https://www.thesportsdb.com/api/v1/json',
    key: process.env.THESPORTSDB_API_KEY || '3',
    statsEndpoint: '/lookupgame.php?id=',
    competitionId: 4328
  },
  LA_LIGA: {
    url: 'https://www.thesportsdb.com/api/v1/json',
    key: process.env.THESPORTSDB_API_KEY || '3',
    statsEndpoint: '/lookupgame.php?id=',
    competitionId: 4335
  },
  BUNDESLIGA: {
    url: 'https://www.thesportsdb.com/api/v1/json',
    key: process.env.THESPORTSDB_API_KEY || '3',
    statsEndpoint: '/lookupgame.php?id=',
    competitionId: 4331
  },
  SERIE_A: {
    url: 'https://www.thesportsdb.com/api/v1/json',
    key: process.env.THESPORTSDB_API_KEY || '3',
    statsEndpoint: '/lookupgame.php?id=',
    competitionId: 4332
  }
};

// Database manager instance
let dbManager = null;

// Update connection options for M10 dedicated cluster
const DB_OPTIONS = {
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
  compressors: ['zlib']  // Remove snappy since it's causing issues
};

/**
 * Initialize the database manager
 * @returns {Promise<void>}
 */
async function initializeDatabaseManager() {
  if (!dbManager) {
    dbManager = new DatabaseManager({
      uri: MONGODB_URI,
      name: DB_NAME,
      options: DB_OPTIONS
    });
    
    await dbManager.initialize();
    logger.info('Database manager initialized successfully with M10 dedicated cluster settings');
  }
  
  return dbManager;
}

/**
 * Main function to synchronize player statistics across all leagues
 */
async function syncPlayerStats() {
  let client = null;
  const startTime = new Date();
  const metrics = {
    success: false,
    startTime,
    endTime: null,
    duration: null,
    leagues: {},
    totalStats: 0,
    inserted: 0,
    updated: 0,
    errors: 0,
    retries: 0
  };

  try {
    logger.info('Starting player statistics synchronization process');
    
    // Initialize database manager with enterprise-grade configuration
    try {
      await initializeDatabaseManager();
      logger.info('Database manager initialized successfully');
    } catch (dbError) {
      logger.error('Failed to initialize database manager, will attempt direct connection:', { 
        error: dbError.message, 
        stack: dbError.stack 
      });
    }
    
    // Connect to MongoDB directly as backup if DatabaseManager fails
    if (!dbManager || !dbManager.isConnected()) {
      logger.warn('Database manager not available, using direct MongoDB connection');
      
      // Attempt connection with retry logic
      let retryCount = 0;
      const maxRetries = 3;
      
      while (retryCount < maxRetries && !client) {
        try {
          client = new MongoClient(MONGODB_URI, DB_OPTIONS);
          
          await client.connect();
          logger.info('MongoDB connection established successfully with M10 dedicated cluster settings');
        } catch (connError) {
          retryCount++;
          metrics.retries++;
          
          logger.error(`Failed to connect to MongoDB (attempt ${retryCount}/${maxRetries}):`, {
            error: connError.message,
            stack: connError.stack
          });
          
          if (retryCount >= maxRetries) {
            throw new Error(`Failed to connect to MongoDB after ${maxRetries} attempts: ${connError.message}`);
          }
          
          // Exponential backoff: 2ˆn * 1000ms (2s, 4s, 8s)
          const backoffMs = Math.pow(2, retryCount) * 1000;
          logger.info(`Retrying connection in ${backoffMs}ms...`);
          await new Promise(resolve => setTimeout(resolve, backoffMs));
        }
      }
    }
    
    const db = dbManager?.getDb() || client.db(DB_NAME);
    
    if (!db) {
      throw new Error('Failed to obtain database instance');
    }
    
    // Sync for each league
    const leaguePromises = [];
    
    for (const league of SUPPORTED_LEAGUES) {
      metrics.leagues[league] = {
        success: false,
        startTime: new Date(),
        endTime: null,
        duration: null,
        processed: 0,
        inserted: 0,
        updated: 0,
        errors: 0
      };
      
      const leaguePromise = (async () => {
        try {
          const result = await syncLeaguePlayerStats(db, league, API_CONFIG[league]);
          
          metrics.leagues[league].success = true;
          metrics.leagues[league].inserted = result.inserted || 0;
          metrics.leagues[league].updated = result.updated || 0;
          metrics.leagues[league].processed = result.processed || 0;
          
          metrics.inserted += result.inserted || 0;
          metrics.updated += result.updated || 0;
          metrics.totalStats += result.processed || 0;
          
          logger.info(`Successfully synced ${league} player stats:`, {
            inserted: result.inserted,
            updated: result.updated,
            total: result.processed
          });
        } catch (leagueError) {
          metrics.leagues[league].success = false;
          metrics.leagues[league].errors = 1;
          metrics.errors++;
          
          logger.error(`Error syncing ${league} player stats:`, { 
            error: leagueError.message, 
            stack: leagueError.stack 
          });
          // Continue with other leagues even if one fails
        } finally {
          metrics.leagues[league].endTime = new Date();
          metrics.leagues[league].duration = metrics.leagues[league].endTime - metrics.leagues[league].startTime;
        }
      })();
      
      leaguePromises.push(leaguePromise);
    }
    
    // Wait for all league sync operations to complete
    await Promise.allSettled(leaguePromises);
    
    metrics.success = true;
    metrics.endTime = new Date();
    metrics.duration = metrics.endTime - metrics.startTime;
    
    logger.info('Player statistics synchronization completed successfully', {
      duration: `${metrics.duration / 1000}s`,
      processed: metrics.totalStats,
      inserted: metrics.inserted,
      updated: metrics.updated,
      errors: metrics.errors
    });
    
    return metrics;
    
  } catch (error) {
    metrics.success = false;
    metrics.errors++;
    metrics.endTime = new Date();
    metrics.duration = metrics.endTime - metrics.startTime;
    
    logger.error('Error in player stats synchronization:', { 
      error: error.message, 
      stack: error.stack,
      metrics 
    });
    
    return metrics;
  } finally {
    try {
      // Cleanup connections
      if (client) {
        await client.close();
        logger.info('MongoDB connection closed');
      }
    } catch (cleanupError) {
      logger.error('Error during connection cleanup:', {
        error: cleanupError.message,
        stack: cleanupError.stack
      });
    }
  }
}

/**
 * Synchronize player statistics for a specific league
 * @param {Object} db - MongoDB database instance
 * @param {string} league - League identifier
 * @param {Object} config - API configuration for the league
 * @returns {Promise<Object>} Sync results
 */
async function syncLeaguePlayerStats(db, league, config) {
  const results = {
    league,
    success: false,
    processed: 0,
    inserted: 0,
    updated: 0,
    errors: 0
  };
  
  try {
    logger.info(`Starting player stats synchronization for ${league}`);
    
    // Make API request with retry logic
    const maxRetries = 3;
    let retries = 0;
    let playerStatsData = null;
    
    while (retries < maxRetries && playerStatsData === null) {
      try {
        // For V2 API, use filter/events endpoint with league ID and current season
        // The key needs to be sent as a header instead of in the URL
        const season = getCurrentSeason(league);
        // Use the filter/events endpoint for V2 API
        const apiUrl = `${THESPORTSDB_BASE_URL}/filter/events/${config.competitionId}/${season}`;
        
        logger.info(`Using TheSportsDB API URL: ${apiUrl}`);
        
        const response = await axios.get(apiUrl, {
          headers: {
            'X-API-KEY': THESPORTSDB_API_KEY
          },
          timeout: parseInt(process.env.SPORTSDB_REQUEST_TIMEOUT, 10) || 30000
        });
        
        // Log the full response for debugging
        logger.info(`TheSportsDB API response status: ${response.status}`);
        
        // V2 API puts events under the "filter" key
        if (response.data && response.data.filter && Array.isArray(response.data.filter)) {
          playerStatsData = response.data.filter;
          logger.info(`TheSportsDB API response received with ${playerStatsData.length} events`);
        } else {
          logger.warn(`Empty or invalid response from TheSportsDB API: ${JSON.stringify(response.data).substring(0, 200)}...`);
          throw new Error('Empty or invalid response from TheSportsDB API');
        }
      } catch (apiError) {
        retries++;
        
        // Log more detailed error information
        const errorDetails = {
          message: apiError.message,
          status: apiError.response?.status,
          statusText: apiError.response?.statusText,
          url: apiError.config?.url,
          method: apiError.config?.method,
          data: apiError.response?.data
        };
        
        logger.warn(`API request failed (attempt ${retries}/${maxRetries}):`, errorDetails);
        
        if (retries >= maxRetries) {
          throw new Error(`Failed to fetch ${league} player stats after ${maxRetries} attempts: ${apiError.message}`);
        }
        
        // Exponential backoff: 2ˆn * 1000ms
        const backoffMs = Math.pow(2, retries) * 1000;
        logger.info(`Retrying API request in ${backoffMs}ms...`);
        await new Promise(resolve => setTimeout(resolve, backoffMs));
      }
    }
    
    if (!playerStatsData || !Array.isArray(playerStatsData)) {
      logger.warn(`No ${league} player stats returned from API or invalid format`);
      results.success = true; // Consider this a successful run with 0 records
      return results;
    }
    
    logger.info(`Received ${playerStatsData.length} player stats records for ${league}`);
    
    // Transform player stats based on league
    const transformedEvents = transformTheSportsDBStats(playerStatsData, league, new Date().toISOString());
    results.processed = transformedEvents.length;
    
    // Get collection name for this league
    const collectionName = `${league.toLowerCase()}_player_stats`;
    
    // Ensure collection exists with proper indexes
    await ensureCollectionExists(db, collectionName);
    
    // Insert/update player stats in batches to improve performance
    const batchSize = 100;
    const batches = [];
    
    for (let i = 0; i < transformedEvents.length; i += batchSize) {
      batches.push(transformedEvents.slice(i, i + batchSize));
    }
    
    for (const batch of batches) {
      const operations = batch.map(stat => ({
        updateOne: {
          filter: { 
            playerId: stat.playerId,
            gameId: stat.gameId
          },
          update: { $set: stat },
          upsert: true
        }
      }));
      
      try {
        const bulkResult = await db.collection(collectionName).bulkWrite(operations, { ordered: false });
        
        results.inserted += bulkResult.upsertedCount || 0;
        results.updated += bulkResult.modifiedCount || 0;
        
      } catch (bulkError) {
        // Handle partial success
        logger.error(`Bulk write error for ${league}:`, {
          error: bulkError.message,
          writeErrors: bulkError.writeErrors?.length || 0
        });
        
        // Count any successful operations from partial success
        if (bulkError.result) {
          results.inserted += bulkError.result.upsertedCount || 0;
          results.updated += bulkError.result.modifiedCount || 0;
        }
        
        results.errors++;
      }
    }
    
    results.success = true;
    logger.info(`${league} player stats sync completed: ${results.inserted} inserted, ${results.updated} updated`);
    
    return results;
    
  } catch (error) {
    results.success = false;
    results.errors++;
    logger.error(`Error syncing ${league} player stats:`, {
      error: error.message,
      stack: error.stack
    });
    return results;
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
  // Detect if this is TheSportsDB API response format by checking for specific properties
  const isTheSportsDBFormat = apiStats.some(stat => 
    stat.idEvent || stat.strEvent || stat.strHomeTeam || stat.strAwayTeam || stat.strLeague
  );

  if (isTheSportsDBFormat) {
    return transformTheSportsDBStats(apiStats, league, gameDate);
  } else {
    return transformSportsDataIOStats(apiStats, league, gameDate);
  }
}

/**
 * Transform TheSportsDB API response to our schema format
 * @param {Array} apiStats - Stats from TheSportsDB API
 * @param {string} league - League identifier
 * @param {string} gameDate - Game date string
 * @returns {Array} Transformed player stats
 */
function transformTheSportsDBStats(apiStats, league, gameDate) {
  logger.info(`Transforming TheSportsDB data with ${apiStats.length} records for ${league}`);
  
  const transformedStats = [];
  
  for (const event of apiStats) {
    try {
      // Basic event information
      const eventDate = event.dateEvent ? new Date(event.dateEvent) : new Date(gameDate);
      const gameId = event.idEvent || `thesportsdb_game_${Math.floor(Math.random() * 10000)}`;
      const homeTeamId = event.idHomeTeam || '';
      const awayTeamId = event.idAwayTeam || '';
      const homeTeamName = event.strHomeTeam || 'Home Team';
      const awayTeamName = event.strAwayTeam || 'Away Team';
      const homeScore = parseInt(event.intHomeScore, 10) || 0;
      const awayScore = parseInt(event.intAwayScore, 10) || 0;
      const venue = event.strVenue || '';
      
      // Process player stats if available in the event
      if (event.players && Array.isArray(event.players)) {
        // If there's player stats in the event, use them
        for (const player of event.players) {
          const playerStat = {
            playerId: player.idPlayer || '',
            playerName: player.strPlayer || '',
            teamId: player.idTeam || (player.strTeam === homeTeamName ? homeTeamId : awayTeamId),
            teamName: player.strTeam || '',
            gameId: gameId,
            date: eventDate,
            league: league,
            season: getCurrentSeason(league),
            minutesPlayed: parseInt(player.intMinutes, 10) || 0,
            isStarter: player.strFormation ? player.strFormation.includes('Starting') : false,
            stats: {},
            advancedMetrics: {},
            createdAt: new Date(),
            updatedAt: new Date()
          };
          
          // Add sport-specific stats
          switch(league) {
            case 'NBA':
              playerStat.stats = extractPlayerBasketballStats(player);
              break;
            case 'NFL':
              playerStat.stats = extractPlayerFootballStats(player);
              break;
            case 'MLB':
              playerStat.stats = extractPlayerBaseballStats(player);
              break;
            case 'NHL':
              playerStat.stats = extractPlayerHockeyStats(player);
              break;
            case 'PREMIER_LEAGUE':
            case 'LA_LIGA':
            case 'BUNDESLIGA':
            case 'SERIE_A':
              playerStat.stats = extractPlayerSoccerStats(player);
              break;
            default:
              // Generic stats extraction
              playerStat.stats = extractGenericPlayerStats(player);
          }
          
          transformedStats.push(playerStat);
        }
      } else {
        // If no player stats, create team-level stats
        // Create home team stats record
        const homeTeamStats = {
          playerId: `${homeTeamId}_team`,
          playerName: homeTeamName,
          teamId: homeTeamId,
          teamName: homeTeamName,
          gameId: gameId,
          date: eventDate,
          league: league,
          season: getCurrentSeason(league),
          minutesPlayed: 90, // Default for full game
          isStarter: true,
          stats: {},
          advancedMetrics: {},
          createdAt: new Date(),
          updatedAt: new Date()
        };
        
        // Create away team stats record
        const awayTeamStats = {
          playerId: `${awayTeamId}_team`,
          playerName: awayTeamName,
          teamId: awayTeamId,
          teamName: awayTeamName,
          gameId: gameId,
          date: eventDate,
          league: league,
          season: getCurrentSeason(league),
          minutesPlayed: 90, // Default for full game
          isStarter: true,
          stats: {},
          advancedMetrics: {},
          createdAt: new Date(),
          updatedAt: new Date()
        };
        
        // Add sport-specific stats based on league
        switch(league) {
          case 'NBA':
            homeTeamStats.stats = {
              points: homeScore,
              opponentPoints: awayScore,
              venue: venue,
              result: homeScore > awayScore ? 'W' : 'L',
              teamType: 'home'
            };
            
            awayTeamStats.stats = {
              points: awayScore,
              opponentPoints: homeScore,
              venue: venue,
              result: awayScore > homeScore ? 'W' : 'L',
              teamType: 'away'
            };
            break;
            
          case 'NFL':
            homeTeamStats.stats = {
              points: homeScore,
              opponentPoints: awayScore,
              venue: venue,
              result: homeScore > awayScore ? 'W' : 'L',
              teamType: 'home'
            };
            
            awayTeamStats.stats = {
              points: awayScore,
              opponentPoints: homeScore,
              venue: venue,
              result: awayScore > homeScore ? 'W' : 'L',
              teamType: 'away'
            };
            break;
            
          case 'MLB':
            homeTeamStats.stats = {
              runs: homeScore,
              opponentRuns: awayScore,
              venue: venue,
              result: homeScore > awayScore ? 'W' : 'L',
              teamType: 'home'
            };
            
            awayTeamStats.stats = {
              runs: awayScore,
              opponentRuns: homeScore,
              venue: venue,
              result: awayScore > homeScore ? 'W' : 'L',
              teamType: 'away'
            };
            break;
            
          case 'NHL':
            homeTeamStats.stats = {
              goals: homeScore,
              opponentGoals: awayScore,
              venue: venue,
              result: homeScore > awayScore ? 'W' : 'L',
              teamType: 'home'
            };
            
            awayTeamStats.stats = {
              goals: awayScore,
              opponentGoals: homeScore,
              venue: venue,
              result: awayScore > homeScore ? 'W' : 'L',
              teamType: 'away'
            };
            break;
            
          case 'PREMIER_LEAGUE':
          case 'LA_LIGA':
          case 'BUNDESLIGA':
          case 'SERIE_A':
            homeTeamStats.stats = {
              goals: homeScore,
              opponentGoals: awayScore,
              venue: venue,
              result: homeScore > awayScore ? 'W' : (homeScore < awayScore ? 'L' : 'D'),
              teamType: 'home'
            };
            
            awayTeamStats.stats = {
              goals: awayScore,
              opponentGoals: homeScore,
              venue: venue,
              result: awayScore > homeScore ? 'W' : (awayScore < homeScore ? 'L' : 'D'),
              teamType: 'away'
            };
            break;
            
          default:
            homeTeamStats.stats = {
              score: homeScore,
              opponentScore: awayScore,
              venue: venue,
              teamType: 'home'
            };
            
            awayTeamStats.stats = {
              score: awayScore,
              opponentScore: homeScore,
              venue: venue,
              teamType: 'away'
            };
        }
        
        transformedStats.push(homeTeamStats);
        transformedStats.push(awayTeamStats);
      }
    } catch (error) {
      logger.error(`Error transforming TheSportsDB event data: ${error.message}`, { 
        error: error.message, 
        event: JSON.stringify(event).substring(0, 200) + '...' 
      });
    }
  }
  
  logger.info(`Transformed ${transformedStats.length} records from TheSportsDB data`);
  return transformedStats;
}

/**
 * Extract basketball-specific stats for a player
 * @param {Object} player - Player object from TheSportsDB API
 * @returns {Object} Basketball stats
 */
function extractPlayerBasketballStats(player) {
  return {
    points: parseInt(player.intPoints, 10) || 0,
    rebounds: parseInt(player.intRebounds, 10) || 0,
    assists: parseInt(player.intAssists, 10) || 0,
    steals: parseInt(player.intSteals, 10) || 0,
    blocks: parseInt(player.intBlocks, 10) || 0,
    turnovers: parseInt(player.intTurnovers, 10) || 0,
    fieldGoalsMade: parseInt(player.intFieldGoalsMade, 10) || 0,
    fieldGoalsAttempted: parseInt(player.intFieldGoalsAttempted, 10) || 0,
    threePointersMade: parseInt(player.intThreePointersMade, 10) || 0,
    threePointersAttempted: parseInt(player.intThreePointersAttempted, 10) || 0,
    freeThrowsMade: parseInt(player.intFreeThrowsMade, 10) || 0,
    freeThrowsAttempted: parseInt(player.intFreeThrowsAttempted, 10) || 0,
    personalFouls: parseInt(player.intPersonalFouls, 10) || 0,
    plusMinus: parseInt(player.intPlusMinus, 10) || 0
  };
}

/**
 * Extract football-specific stats for a player
 * @param {Object} player - Player object from TheSportsDB API
 * @returns {Object} Football stats
 */
function extractPlayerFootballStats(player) {
  return {
    passingYards: parseInt(player.intPassingYards, 10) || 0,
    passingTouchdowns: parseInt(player.intPassingTouchdowns, 10) || 0,
    passingCompletions: parseInt(player.intPassingCompletions, 10) || 0,
    passingAttempts: parseInt(player.intPassingAttempts, 10) || 0,
    passingInterceptions: parseInt(player.intPassingInterceptions, 10) || 0,
    rushingYards: parseInt(player.intRushingYards, 10) || 0,
    rushingTouchdowns: parseInt(player.intRushingTouchdowns, 10) || 0,
    rushingAttempts: parseInt(player.intRushingAttempts, 10) || 0,
    receivingYards: parseInt(player.intReceivingYards, 10) || 0,
    receivingTouchdowns: parseInt(player.intReceivingTouchdowns, 10) || 0,
    receptions: parseInt(player.intReceptions, 10) || 0,
    tackles: parseInt(player.intTackles, 10) || 0,
    sacks: parseInt(player.intSacks, 10) || 0,
    interceptions: parseInt(player.intInterceptions, 10) || 0
  };
}

/**
 * Extract baseball-specific stats for a player
 * @param {Object} player - Player object from TheSportsDB API
 * @returns {Object} Baseball stats
 */
function extractPlayerBaseballStats(player) {
  return {
    atBats: parseInt(player.intAtBats, 10) || 0,
    runs: parseInt(player.intRuns, 10) || 0,
    hits: parseInt(player.intHits, 10) || 0,
    homeRuns: parseInt(player.intHomeRuns, 10) || 0,
    runsBattedIn: parseInt(player.intRunsBattedIn, 10) || 0,
    stolenBases: parseInt(player.intStolenBases, 10) || 0,
    battingAverage: parseFloat(player.strBattingAverage) || 0,
    strikeouts: parseInt(player.intStrikeouts, 10) || 0,
    walks: parseInt(player.intWalks, 10) || 0,
    inningsPitched: parseFloat(player.strInningsPitched) || 0,
    earnedRunAverage: parseFloat(player.strEarnedRunAverage) || 0,
    wins: parseInt(player.intWins, 10) || 0,
    losses: parseInt(player.intLosses, 10) || 0,
    saves: parseInt(player.intSaves, 10) || 0
  };
}

/**
 * Extract hockey-specific stats for a player
 * @param {Object} player - Player object from TheSportsDB API
 * @returns {Object} Hockey stats
 */
function extractPlayerHockeyStats(player) {
  return {
    goals: parseInt(player.intGoals, 10) || 0,
    assists: parseInt(player.intAssists, 10) || 0,
    points: parseInt(player.intPoints, 10) || 0,
    plusMinus: parseInt(player.intPlusMinus, 10) || 0,
    penaltyMinutes: parseInt(player.intPenaltyMinutes, 10) || 0,
    shots: parseInt(player.intShots, 10) || 0,
    powerPlayGoals: parseInt(player.intPowerPlayGoals, 10) || 0,
    shortHandedGoals: parseInt(player.intShortHandedGoals, 10) || 0,
    saves: parseInt(player.intSaves, 10) || 0,
    goalsAgainst: parseInt(player.intGoalsAgainst, 10) || 0,
    shutouts: parseInt(player.intShutouts, 10) || 0
  };
}

/**
 * Extract soccer-specific stats for a player
 * @param {Object} player - Player object from TheSportsDB API
 * @returns {Object} Soccer stats
 */
function extractPlayerSoccerStats(player) {
  return {
    goals: parseInt(player.intGoals, 10) || 0,
    assists: parseInt(player.intAssists, 10) || 0,
    shots: parseInt(player.intShots, 10) || 0,
    yellowCards: parseInt(player.intYellowCards, 10) || 0,
    redCards: parseInt(player.intRedCards, 10) || 0,
    tackles: parseInt(player.intTackles, 10) || 0,
    foulsCommitted: parseInt(player.intFouls, 10) || 0,
    saves: parseInt(player.intSaves, 10) || 0,
    minutesPlayed: parseInt(player.intMinutes, 10) || 0
  };
}

/**
 * Extract generic player stats
 * @param {Object} player - Player object from TheSportsDB API
 * @returns {Object} Generic stats
 */
function extractGenericPlayerStats(player) {
  // Create a generic stats object from numeric fields
  const genericStats = {};
  
  // Extract any numeric fields
  for (const [key, value] of Object.entries(player)) {
    if (
      key.startsWith('int') &&
      typeof value === 'number' || (!isNaN(parseInt(value, 10)))
    ) {
      const statName = key.replace('int', '').toLowerCase();
      genericStats[statName] = parseInt(value, 10) || 0;
    } else if (
      key.startsWith('str') && 
      !isNaN(parseFloat(value)) && 
      key !== 'strPlayer' && 
      key !== 'strTeam'
    ) {
      const statName = key.replace('str', '').toLowerCase();
      genericStats[statName] = parseFloat(value) || 0;
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
 * Format a date in the format required by SportsData.io API
 * @param {Date} date - Date object
 * @returns {string} Formatted date
 */
function formatDateForSportsDataAPI(date) {
  const year = date.getFullYear();
  const month = date.toLocaleString('en-US', { month: 'short' }); // "Mar"
  const day = date.getDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`; // YYYY-MMM-DD (e.g., 2025-Mar-23)
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