// scripts/integrated-analytics-pipeline.js
require('dotenv').config();
const { MongoClient } = require('mongodb');
const path = require('path');
const fs = require('fs');
const winston = require('winston');
const { format } = winston;
const cron = require('node-cron');

// Import required modules
const { generateAdvancedMetrics } = require('./metrics-utils');
const seedPlayerStats = require('./enhanced-seed-player-stats');

// Initialize logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: format.combine(
    format.timestamp(),
    format.errors({ stack: true }),
    format.json(),
    format.metadata()
  ),
  defaultMeta: { service: 'analytics-pipeline' },
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

/**
 * Run the complete analytics pipeline
 * @param {Object} options - Pipeline configuration options
 */
async function runAnalyticsPipeline(options = {}) {
  const {
    seedData = false,
    syncExternalData = false,
    updatePlayerMetrics = true,
    updateTeamMetrics = true,
    leagueFilter = null,
    forceFull = false
  } = options;
  
  logger.info('Starting integrated analytics pipeline', {
    options,
    timestamp: new Date().toISOString()
  });
  
  let client = null;
  
  try {
    // Connect to MongoDB
    client = await MongoClient.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      maxPoolSize: parseInt(process.env.DB_MAX_POOL_SIZE, 10) || 10,
      minPoolSize: parseInt(process.env.DB_MIN_POOL_SIZE, 10) || 1,
      connectTimeoutMS: parseInt(process.env.CONNECT_TIMEOUT_MS, 10) || 5000,
      socketTimeoutMS: parseInt(process.env.SOCKET_TIMEOUT_MS, 10) || 10000
    });
    
    logger.info('MongoDB connection established');
    
    const db = client.db(DB_NAME);
    
    // Determine which leagues to process
    const leaguesToProcess = leagueFilter ? 
      SUPPORTED_LEAGUES.filter(league => league === leagueFilter || leagueFilter.includes(league)) : 
      SUPPORTED_LEAGUES;
    
    // Optional: Seed data if requested
    if (seedData) {
      logger.info('Seeding player stats data');
      try {
        // Check if the seed script exists and import it dynamically
        const seedScript = require('./enhanced-seed-player-stats');
        if (typeof seedScript === 'function') {
          await seedScript();
        } else if (seedScript && typeof seedScript.seedPlayerStats === 'function') {
          await seedScript.seedPlayerStats();
        } else {
          logger.warn('Seed player stats function not found, skipping seeding step');
        }
      } catch (seedError) {
        logger.error('Error seeding player stats:', seedError);
      }
    }
    
    // Optional: Sync with external data sources
    if (syncExternalData) {
      logger.info('Syncing with external data sources');
      try {
        // Check if the sync script exists and import it dynamically
        const syncScript = require('./sync-player-stats');
        if (typeof syncScript === 'function') {
          await syncScript();
        } else if (syncScript && typeof syncScript.syncPlayerStats === 'function') {
          await syncScript.syncPlayerStats();
        } else {
          logger.warn('Sync player stats function not found, skipping sync step');
        }
      } catch (syncError) {
        logger.error('Error syncing player stats:', syncError);
      }
    }
    
    // Update player metrics
    if (updatePlayerMetrics) {
      await updatePlayerAdvancedMetrics(db, leaguesToProcess, forceFull);
    }
    
    // Update team metrics
    if (updateTeamMetrics) {
      await updateTeamAggregateMetrics(db, leaguesToProcess);
    }
    
    logger.info('Integrated analytics pipeline completed successfully');
    
  } catch (error) {
    logger.error('Error in analytics pipeline:', error);
    throw error;
  } finally {
    if (client) {
      await client.close();
      logger.info('MongoDB connection closed');
    }
  }
}

/**
 * Update advanced metrics for players
 * @param {Object} db - MongoDB database instance
 * @param {Array} leagues - Leagues to process
 * @param {boolean} forceFull - Force full recalculation for all players
 */
async function updatePlayerAdvancedMetrics(db, leagues, forceFull = false) {
  logger.info(`Starting player advanced metrics update for ${leagues.length} leagues`);
  
  for (const league of leagues) {
    try {
      logger.info(`Processing player metrics for ${league}`);
      
      // Player stats collection name
      const playerCollectionName = `${league.toLowerCase()}_player_stats`;
      
      // Find players to update
      const query = forceFull ? {} : {
        $or: [
          { advancedMetrics: { $exists: false } },
          { advancedMetrics: null },
          { advancedMetrics: {} }
        ]
      };
      
      const players = await db.collection(playerCollectionName).find(query).toArray();
      
      logger.info(`Found ${players.length} players to update in ${league}`);
      
      let updatedCount = 0;
      let errorCount = 0;
      
      // Process players in batches of 100
      const batchSize = 100;
      for (let i = 0; i < players.length; i += batchSize) {
        const batch = players.slice(i, i + batchSize);
        const batchPromises = batch.map(async (player) => {
          try {
            if (!player.stats || Object.keys(player.stats).length === 0) {
              return null; // Skip players with no stats
            }
            
            // Generate advanced metrics using player stats and position
            const advancedMetrics = generateAdvancedMetrics(league, player.position, player.stats);
            
            // Update player with new advanced metrics
            const result = await db.collection(playerCollectionName).updateOne(
              { _id: player._id },
              { 
                $set: { 
                  advancedMetrics: advancedMetrics,
                  updatedAt: new Date()
                }
              }
            );
            
            return result.modifiedCount > 0 ? 1 : 0;
          } catch (playerError) {
            logger.warn(`Error updating metrics for player ${player.playerName || player._id}:`, playerError);
            errorCount++;
            return 0;
          }
        });
        
        // Wait for the batch to complete
        const batchResults = await Promise.all(batchPromises);
        const batchUpdates = batchResults.filter(r => r === 1).length;
        updatedCount += batchUpdates;
        
        logger.info(`Processed batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(players.length / batchSize)}, updated ${batchUpdates} players`);
      }
      
      logger.info(`Completed ${league} player metrics update: ${updatedCount} updated, ${errorCount} errors`);
      
    } catch (leagueError) {
      logger.error(`Error updating ${league} player metrics:`, leagueError);
    }
  }
  
  logger.info('Player advanced metrics update completed');
}

/**
 * Update aggregate metrics for teams
 * @param {Object} db - MongoDB database instance
 * @param {Array} leagues - Leagues to process
 */
async function updateTeamAggregateMetrics(db, leagues) {
  logger.info(`Starting team aggregate metrics update for ${leagues.length} leagues`);
  
  try {
    // First, ensure team collection exists
    const collections = await db.listCollections({ name: 'teams' }).toArray();
    if (collections.length === 0) {
      logger.warn('Teams collection not found, attempting to create it...');
      
      // Try to run the team setup script if it exists
      try {
        const teamSetupScript = require('./setup-teams-collection');
        if (typeof teamSetupScript === 'function') {
          await teamSetupScript();
        } else if (teamSetupScript && typeof teamSetupScript.setupTeamsCollection === 'function') {
          await teamSetupScript.setupTeamsCollection();
        } else {
          logger.warn('Team setup function not found, creating empty teams collection');
          await db.createCollection('teams');
        }
      } catch (setupError) {
        logger.error('Error setting up teams collection:', setupError);
        await db.createCollection('teams');
      }
    }
    
    for (const league of leagues) {
      try {
        logger.info(`Processing team metrics for ${league}`);
        
        // Get all teams for this league
        const teams = await db.collection('teams').find({ league }).toArray();
        
        if (teams.length === 0) {
          logger.warn(`No teams found for ${league}, skipping`);
          continue;
        }
        
        logger.info(`Found ${teams.length} teams in ${league}`);
        
        // Player stats collection name
        const playerCollectionName = `${league.toLowerCase()}_player_stats`;
        
        let updatedCount = 0;
        
        // Process teams
        for (const team of teams) {
          try {
            // Find all players on this team (using case-insensitive match for teamId)
            const teamIdRegex = new RegExp(`^${team.id}// scripts/integrated-analytics-pipeline.js
require('dotenv').config();
const { MongoClient } = require('mongodb');
const path = require('path');
const fs = require('fs');
const winston = require('winston');
const { format } = winston;
const cron = require('node-cron');

// Import required modules
const { generateAdvancedMetrics } = require('./metrics-utils');
const seedPlayerStats = require('./enhanced-seed-player-stats');

// Initialize logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: format.combine(
    format.timestamp(),
    format.errors({ stack: true }),
    format.json(),
    format.metadata()
  ),
  defaultMeta: { service: 'analytics-pipeline' },
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

/**
 * Run the complete analytics pipeline
 * @param {Object} options - Pipeline configuration options
 */
async function runAnalyticsPipeline(options = {}) {
  const {
    seedData = false,
    syncExternalData = false,
    updatePlayerMetrics = true,
    updateTeamMetrics = true,
    leagueFilter = null,
    forceFull = false
  } = options;
  
  logger.info('Starting integrated analytics pipeline', {
    options,
    timestamp: new Date().toISOString()
  });
  
  let client = null;
  
  try {
    // Connect to MongoDB
    client = await MongoClient.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      maxPoolSize: parseInt(process.env.DB_MAX_POOL_SIZE, 10) || 10,
      minPoolSize: parseInt(process.env.DB_MIN_POOL_SIZE, 10) || 1,
      connectTimeoutMS: parseInt(process.env.CONNECT_TIMEOUT_MS, 10) || 5000,
      socketTimeoutMS: parseInt(process.env.SOCKET_TIMEOUT_MS, 10) || 10000
    });
    
    logger.info('MongoDB connection established');
    
    const db = client.db(DB_NAME);
    
    // Determine which leagues to process
    const leaguesToProcess = leagueFilter ? 
      SUPPORTED_LEAGUES.filter(league => league === leagueFilter || leagueFilter.includes(league)) : 
      SUPPORTED_LEAGUES;
    
    // Optional: Seed data if requested
    if (seedData) {
      logger.info('Seeding player stats data');
      try {
        // Check if the seed script exists and import it dynamically
        const seedScript = require('./enhanced-seed-player-stats');
        if (typeof seedScript === 'function') {
          await seedScript();
        } else if (seedScript && typeof seedScript.seedPlayerStats === 'function') {
          await seedScript.seedPlayerStats();
        } else {
          logger.warn('Seed player stats function not found, skipping seeding step');
        }
      } catch (seedError) {
        logger.error('Error seeding player stats:', seedError);
      }
    }
    
    // Optional: Sync with external data sources
    if (syncExternalData) {
      logger.info('Syncing with external data sources');
      try {
        // Check if the sync script exists and import it dynamically
        const syncScript = require('./sync-player-stats');
        if (typeof syncScript === 'function') {
          await syncScript();
        } else if (syncScript && typeof syncScript.syncPlayerStats === 'function') {
          await syncScript.syncPlayerStats();
        } else {
          logger.warn('Sync player stats function not found, skipping sync step');
        }
      } catch (syncError) {
        logger.error('Error syncing player stats:', syncError);
      }
    }
    
    // Update player metrics
    if (updatePlayerMetrics) {
      await updatePlayerAdvancedMetrics(db, leaguesToProcess, forceFull);
    }
    
    // Update team metrics
    if (updateTeamMetrics) {
      await updateTeamAggregateMetrics(db, leaguesToProcess);
    }
    
    logger.info('Integrated analytics pipeline completed successfully');
    
  } catch (error) {
    logger.error('Error in analytics pipeline:', error);
    throw error;
  } finally {
    if (client) {
      await client.close();
      logger.info('MongoDB connection closed');
    }
  }
}

/**
 * Update advanced metrics for players
 * @param {Object} db - MongoDB database instance
 * @param {Array} leagues - Leagues to process
 * @param {boolean} forceFull - Force full recalculation for all players
 */
async function updatePlayerAdvancedMetrics(db, leagues, forceFull = false) {
  logger.info(`Starting player advanced metrics update for ${leagues.length} leagues`);
  
  for (const league of leagues) {
    try {
      logger.info(`Processing player metrics for ${league}`);
      
      // Player stats collection name
      const playerCollectionName = `${league.toLowerCase()}_player_stats`;
      
      // Find players to update
      const query = forceFull ? {} : {
        $or: [
          { advancedMetrics: { $exists: false } },
          { advancedMetrics: null },
          { advancedMetrics: {} }
        ]
      };
      
      const players = await db.collection(playerCollectionName).find(query).toArray();
      
      logger.info(`Found ${players.length} players to update in ${league}`);
      
, 'i');
            const teamPlayers = await db.collection(playerCollectionName).find({ 
              $or: [
                { teamId: team.id },
                { teamId: teamIdRegex }
              ]
            }).toArray();
            
            if (teamPlayers.length === 0) {
              logger.warn(`No players found for team ${team.name} (${team.id}), skipping`);
              continue;
            }
            
            logger.info(`Found ${teamPlayers.length} players for ${team.name}`);
            
            // Calculate team aggregate stats based on league
            const teamStats = calculateTeamStats(league, teamPlayers);
            
            // Update team with aggregate stats
            const result = await db.collection('teams').updateOne(
              { _id: team._id },
              { 
                $set: { 
                  stats: teamStats,
                  playerCount: teamPlayers.length,
                  updatedAt: new Date() 
                } 
              }
            );
            
            if (result.modifiedCount > 0) {
              updatedCount++;
            }
            
          } catch (teamError) {
            logger.error(`Error updating team ${team.name}:`, teamError);
          }
        }
        
        logger.info(`Completed ${league} team metrics update: ${updatedCount} teams updated`);
        
      } catch (leagueError) {
        logger.error(`Error updating ${league} team metrics:`, leagueError);
      }
    }
    
  } catch (error) {
    logger.error('Error in team metrics update:', error);
    throw error;
  }
  
  logger.info('Team aggregate metrics update completed');
}

/**
 * Calculate team statistics based on player stats
 * @param {string} league - League identifier
 * @param {Array} players - Array of player objects
 * @returns {Object} Aggregated team statistics
 */
function calculateTeamStats(league, players) {
  // This function should be implemented similarly to the one in update-player-team-metrics.js
  // For brevity, we'll create a simplified version here
  
  const baseStats = {
    gamesPlayed: 0,
    wins: 0,
    losses: 0,
    ties: 0,
    winPercentage: 0
  };
  
  // Get all unique games to count games played
  const gameIds = new Set();
  players.forEach(player => {
    if (player.gameId) {
      gameIds.add(player.gameId);
    }
  });
  
  baseStats.gamesPlayed = gameIds.size;
  
  // For demo purposes, generate random win/loss records
  // In a real implementation, you would get this from game results
  baseStats.wins = Math.floor(baseStats.gamesPlayed * 0.5 + (Math.random() * 0.3 - 0.15) * baseStats.gamesPlayed);
  baseStats.losses = baseStats.gamesPlayed - baseStats.wins;
  baseStats.winPercentage = baseStats.gamesPlayed > 0 ? (baseStats.wins / baseStats.gamesPlayed) * 100 : 0;
  
  // League-specific stats
  switch(league) {
    case 'NBA':
      return {
        ...baseStats,
        pointsPerGame: aggregateAverage(players, 'stats.points', 12),
        reboundsPerGame: aggregateAverage(players, 'stats.rebounds', 12),
        assistsPerGame: aggregateAverage(players, 'stats.assists', 12),
        stealsPerGame: aggregateAverage(players, 'stats.steals', 12),
        blocksPerGame: aggregateAverage(players, 'stats.blocks', 12),
        turnoversPerGame: aggregateAverage(players, 'stats.turnovers', 12),
        fieldGoalPercentage: calculatePercentage(players, 'stats.fieldGoalsMade', 'stats.fieldGoalsAttempted'),
        threePointPercentage: calculatePercentage(players, 'stats.threePointersMade', 'stats.threePointersAttempted'),
        freeThrowPercentage: calculatePercentage(players, 'stats.freeThrowsMade', 'stats.freeThrowsAttempted')
      };
    
    case 'NFL':
      return {
        ...baseStats,
        pointsPerGame: 20 + Math.random() * 10,
        yardsPerGame: {
          passing: aggregateSum(players, 'stats.passingYards') / baseStats.gamesPlayed,
          rushing: aggregateSum(players, 'stats.rushingYards') / baseStats.gamesPlayed,
          total: (aggregateSum(players, 'stats.passingYards') + aggregateSum(players, 'stats.rushingYards')) / baseStats.gamesPlayed
        },
        turnoversPerGame: (aggregateSum(players, 'stats.interceptions') + aggregateSum(players, 'stats.fumbles')) / baseStats.gamesPlayed,
        sacks: aggregateSum(players, 'stats.sacks'),
        thirdDownConversionRate: 35 + Math.random() * 15
      };
    
    case 'MLB':
      return {
        ...baseStats,
        runsPerGame: 4 + Math.random() * 2,
        hitsPerGame: 8 + Math.random() * 3,
        homeRunsPerGame: aggregateSum(players, 'stats.homeRuns') / baseStats.gamesPlayed,
        era: 3.5 + Math.random() * 1.5,
        battingAverage: 0.240 + Math.random() * 0.050,
        onBasePercentage: 0.310 + Math.random() * 0.050,
        sluggingPercentage: 0.390 + Math.random() * 0.070
      };
    
    case 'NHL':
      return {
        ...baseStats,
        goalsPerGame: 2.7 + Math.random() * 1,
        goalsAgainstPerGame: 2.7 + Math.random() * 1,
        powerPlayPercentage: 18 + Math.random() * 8,
        penaltyKillPercentage: 78 + Math.random() * 10,
        shotsPerGame: 29 + Math.random() * 6,
        shotsAgainstPerGame: 29 + Math.random() * 6,
        faceoffPercentage: 48 + Math.random() * 6
      };
    
    case 'PREMIER_LEAGUE':
    case 'LA_LIGA':
    case 'BUNDESLIGA':
    case 'SERIE_A':
      return {
        ...baseStats,
        goalsPerMatch: 1.2 + Math.random() * 0.8,
        goalsAgainstPerMatch: 1.2 + Math.random() * 0.8,
        cleanSheets: aggregateSum(players, 'stats.cleanSheets'),
        possession: 48 + Math.random() * 10,
        passAccuracy: 78 + Math.random() * 10,
        shotsPerMatch: 12 + Math.random() * 6,
        tacklesPerMatch: aggregateSum(players, 'stats.tackles') / baseStats.gamesPlayed
      };
    
    default:
      return baseStats;
  }
}

/**
 * Helper function to aggregate average value for a specific stat
 * @param {Array} players - Array of player objects
 * @param {string} statPath - Path to the stat in the player object
 * @param {number} playerCount - Expected number of players to contribute
 * @returns {number} Averaged stat value
 */
function aggregateAverage(players, statPath, playerCount = players.length) {
  let total = 0;
  let count = 0;
  
  players.forEach(player => {
    const stat = getNestedProperty(player, statPath);
    if (typeof stat === 'number') {
      total += stat;
      count++;
    }
  });
  
  return count > 0 ? (total / count) * Math.min(count, playerCount) / playerCount : 0;
}

/**
 * Helper function to aggregate sum of a specific stat
 * @param {Array} players - Array of player objects
 * @param {string} statPath - Path to the stat in the player object
 * @returns {number} Sum of the stat
 */
function aggregateSum(players, statPath) {
  let total = 0;
  
  players.forEach(player => {
    const stat = getNestedProperty(player, statPath);
    if (typeof stat === 'number') {
      total += stat;
    }
  });
  
  return total;
}

/**
 * Helper function to calculate percentage from two stats
 * @param {Array} players - Array of player objects
 * @param {string} madePath - Path to the "made" stat
 * @param {string} attemptedPath - Path to the "attempted" stat
 * @returns {number} Percentage
 */
function calculatePercentage(players, madePath, attemptedPath) {
  const made = aggregateSum(players, madePath);
  const attempted = aggregateSum(players, attemptedPath);
  
  return attempted > 0 ? (made / attempted) * 100 : 0;
}

/**
 * Helper function to get nested property from an object
 * @param {Object} obj - Object to get property from
 * @param {string} path - Path to the property
 * @returns {*} Property value or undefined
 */
function getNestedProperty(obj, path) {
  return path.split('.').reduce((prev, curr) => {
    return prev && prev[curr] !== undefined ? prev[curr] : undefined;
  }, obj);
}

// Schedule the analytics pipeline to run daily
// Adjust the cron schedule as needed
cron.schedule('0 1 * * *', async () => { // Runs at 1:00 AM every day
  try {
    logger.info('Running scheduled analytics pipeline');
    await runAnalyticsPipeline({
      syncExternalData: true,
      updatePlayerMetrics: true,
      updateTeamMetrics: true
    });
    logger.info('Scheduled analytics pipeline completed');
  } catch (error) {
    logger.error('Scheduled analytics pipeline failed:', error);
  }
});

// Export for use in other modules or manual execution
module.exports = {
  runAnalyticsPipeline,
  updatePlayerAdvancedMetrics,
  updateTeamAggregateMetrics
};

// Execute directly if run from command line
if (require.main === module) {
  // Parse command line arguments
  const args = process.argv.slice(2);
  const options = {
    seedData: args.includes('--seed'),
    syncExternalData: args.includes('--sync'),
    updatePlayerMetrics: !args.includes('--no-player-metrics'),
    updateTeamMetrics: !args.includes('--no-team-metrics'),
    forceFull: args.includes('--force-full'),
    leagueFilter: null
  };
  
  // Check for league filter
  const leagueArg = args.find(arg => arg.startsWith('--league='));
  if (leagueArg) {
    options.leagueFilter = leagueArg.split('=')[1].split(',');
  }
  
  runAnalyticsPipeline(options)
    .then(() => {
      console.log('Analytics pipeline executed successfully');
      process.exit(0);
    })
    .catch(error => {
      console.error('Analytics pipeline failed:', error);
      process.exit(1);
    });
}