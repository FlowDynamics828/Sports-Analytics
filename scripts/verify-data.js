// verify-data.js
require('dotenv').config();
const { MongoClient } = require('mongodb');
const path = require('path');
const fs = require('fs');
const winston = require('winston');

// Initialize logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    }),
    new winston.transports.File({ 
      filename: 'data-verification.log'
    })
  ]
});

// Supported leagues
const SUPPORTED_LEAGUES = [
  'NFL', 'NBA', 'MLB', 'NHL',
  'PREMIER_LEAGUE', 'LA_LIGA', 'BUNDESLIGA', 'SERIE_A'
];

// MongoDB URI from environment variable or hardcoded
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://SportAnalytics:Studyhard%402034@cluster0.et16d.mongodb.net/sports-analytics?retryWrites=true&w=majority&appName=Cluster0';
const DB_NAME = process.env.MONGODB_DB_NAME || 'sports-analytics';

// Expected schema elements based on our database structure
const EXPECTED_PLAYER_SCHEMA = [
  'playerId', 'playerName', 'teamId', 'teamName', 'gameId', 
  'date', 'league', 'season', 'stats', 'minutesPlayed'
];

const EXPECTED_GAME_SCHEMA = [
  'league', 'date', 'homeTeam', 'awayTeam', 'status'
];

const EXPECTED_TEAM_SCHEMA = [
  'id', 'name', 'league', 'stats'
];

// Check for predictive model schema elements (if available)
const EXPECTED_PREDICTION_SCHEMA = [
  'league', 'type', 'prediction', 'confidence', 'timestamp'
];

// Create results structure to hold all verification data
const verificationResults = {
  collections: {
    status: 'pending',
    details: {}
  },
  playerStats: {
    status: 'pending',
    details: {},
    sampleData: {}
  },
  gameStats: {
    status: 'pending',
    details: {}
  },
  teamStats: {
    status: 'pending',
    details: {}
  },
  predictions: {
    status: 'pending',
    details: {}
  },
  sync: {
    status: 'pending',
    lastSync: null,
    details: {}
  },
  summary: {
    overallStatus: 'pending',
    totalRecords: 0,
    issues: []
  }
};

/**
 * Verify MongoDB connection
 */
async function verifyConnection() {
  logger.info('Verifying MongoDB connection...');
  let client;
  
  try {
    client = await MongoClient.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      connectTimeoutMS: 5000,
      socketTimeoutMS: 10000
    });
    
    logger.info('MongoDB connection successful');
    return client;
  } catch (error) {
    logger.error(`MongoDB connection failed: ${error.message}`);
    throw error;
  }
}

/**
 * Verify available collections
 */
async function verifyCollections(db) {
  logger.info('Verifying collections...');
  
  try {
    const collections = await db.listCollections().toArray();
    const collectionNames = collections.map(c => c.name);
    
    verificationResults.collections.details.available = collectionNames;
    
    // Check for expected league player stats collections
    for (const league of SUPPORTED_LEAGUES) {
      const expectedCollection = `${league.toLowerCase()}_player_stats`;
      const hasCollection = collectionNames.includes(expectedCollection);
      
      verificationResults.collections.details[expectedCollection] = hasCollection;
      
      if (!hasCollection) {
        logger.warn(`Missing collection: ${expectedCollection}`);
        verificationResults.summary.issues.push(`Missing collection: ${expectedCollection}`);
      }
    }
    
    // Check for games collection
    const hasGamesCollection = collectionNames.includes('games');
    verificationResults.collections.details.games = hasGamesCollection;
    
    if (!hasGamesCollection) {
      logger.warn('Missing collection: games');
      verificationResults.summary.issues.push('Missing collection: games');
    }
    
    // Check for teams collection
    const hasTeamsCollection = collectionNames.includes('teams');
    verificationResults.collections.details.teams = hasTeamsCollection;
    
    if (!hasTeamsCollection) {
      logger.warn('Missing collection: teams');
      verificationResults.summary.issues.push('Missing collection: teams');
    }
    
    // Check for predictions collection
    const hasPredictionsCollection = collectionNames.includes('predictions');
    verificationResults.collections.details.predictions = hasPredictionsCollection;
    
    if (!hasPredictionsCollection) {
      logger.warn('Missing collection: predictions');
      // Not critical, just informational
    }
    
    // Set collections status
    verificationResults.collections.status = 
      verificationResults.summary.issues.length > 0 ? 'issues' : 'ok';

    logger.info(`Found ${collectionNames.length} collections`);
    
    return collectionNames;
  } catch (error) {
    logger.error(`Failed to verify collections: ${error.message}`);
    verificationResults.collections.status = 'error';
    verificationResults.summary.issues.push(`Failed to verify collections: ${error.message}`);
    throw error;
  }
}

/**
 * Verify player stats data
 */
async function verifyPlayerStats(db) {
  logger.info('Verifying player stats data...');
  
  let totalPlayerRecords = 0;
  
  try {
    for (const league of SUPPORTED_LEAGUES) {
      const collectionName = `${league.toLowerCase()}_player_stats`;
      
      try {
        // Count documents
        const count = await db.collection(collectionName).countDocuments();
        
        // Get latest document date
        const latestDocs = await db.collection(collectionName)
          .find()
          .sort({ date: -1 })
          .limit(1)
          .toArray();
        
        const latestDate = latestDocs.length > 0 ? latestDocs[0].date : null;
        
        // Check schema of a sample document
        const sampleDocs = await db.collection(collectionName)
          .find()
          .limit(1)
          .toArray();
        
        let schemaStatus = 'N/A';
        let missingFields = [];
        
        if (sampleDocs.length > 0) {
          const sample = sampleDocs[0];
          verificationResults.playerStats.sampleData[league] = sample;
          
          // Check for expected fields
          missingFields = EXPECTED_PLAYER_SCHEMA.filter(field => {
            const hasField = field in sample;
            if (!hasField) {
              return true;
            }
            return false;
          });
          
          schemaStatus = missingFields.length === 0 ? 'ok' : 'issues';
          
          // Save specific stats structure to help with debugging
          verificationResults.playerStats.details[`${league}_stats_structure`] = 
            sample.stats ? Object.keys(sample.stats) : 'missing';
        }
        
        // Save results
        verificationResults.playerStats.details[league] = {
          count,
          latestDate,
          schemaStatus,
          missingFields,
          collection: collectionName
        };
        
        totalPlayerRecords += count;
        
        logger.info(`${league} player stats: ${count} records, latest: ${latestDate}`);
        
        if (missingFields.length > 0) {
          logger.warn(`${league} schema issues - missing fields: ${missingFields.join(', ')}`);
          verificationResults.summary.issues.push(
            `${league} player schema missing fields: ${missingFields.join(', ')}`
          );
        }
        
        if (count === 0) {
          logger.warn(`${league} has no player stats records`);
          verificationResults.summary.issues.push(`${league} has no player stats records`);
        }
        
      } catch (error) {
        logger.error(`Error checking ${league} player stats: ${error.message}`);
        verificationResults.playerStats.details[league] = {
          error: error.message,
          collection: collectionName
        };
        verificationResults.summary.issues.push(`Error checking ${league} player stats: ${error.message}`);
      }
    }
    
    // Set overall player stats status
    verificationResults.playerStats.status = 
      verificationResults.summary.issues.filter(issue => issue.includes('player')).length > 0 
        ? 'issues' : 'ok';
    
    verificationResults.summary.totalRecords += totalPlayerRecords;
    
    logger.info(`Total player stats records across all leagues: ${totalPlayerRecords}`);
    
    return verificationResults.playerStats;
  } catch (error) {
    logger.error(`Failed to verify player stats: ${error.message}`);
    verificationResults.playerStats.status = 'error';
    verificationResults.summary.issues.push(`Failed to verify player stats: ${error.message}`);
    throw error;
  }
}

/**
 * Verify game data
 */
async function verifyGames(db) {
  logger.info('Verifying game data...');
  
  try {
    // Count total games
    const totalGames = await db.collection('games').countDocuments();
    
    // Count games by status
    const completedGames = await db.collection('games').countDocuments({ status: 'completed' });
    const liveGames = await db.collection('games').countDocuments({ status: 'live' });
    const upcomingGames = await db.collection('games').countDocuments({ status: 'upcoming' });
    
    // Count games by league
    const gamesByLeague = {};
    for (const league of SUPPORTED_LEAGUES) {
      const count = await db.collection('games').countDocuments({ 
        league: { $regex: new RegExp(league, 'i') }
      });
      gamesByLeague[league] = count;
    }
    
    // Get recent games
    const recentGames = await db.collection('games')
      .find()
      .sort({ date: -1 })
      .limit(5)
      .toArray();
    
    // Check schema of a sample document
    let schemaStatus = 'N/A';
    let missingFields = [];
    
    if (recentGames.length > 0) {
      const sample = recentGames[0];
      
      // Check for expected fields
      missingFields = EXPECTED_GAME_SCHEMA.filter(field => {
        const hasField = field in sample;
        if (!hasField) {
          return true;
        }
        return false;
      });
      
      schemaStatus = missingFields.length === 0 ? 'ok' : 'issues';
    }
    
    // Save results
    verificationResults.gameStats.details = {
      totalGames,
      completedGames,
      liveGames,
      upcomingGames,
      gamesByLeague,
      recentGames: recentGames.map(game => ({
        id: game._id,
        league: game.league,
        date: game.date,
        homeTeam: game.homeTeam?.name,
        awayTeam: game.awayTeam?.name,
        status: game.status
      })),
      schemaStatus,
      missingFields
    };
    
    if (missingFields.length > 0) {
      logger.warn(`Game schema issues - missing fields: ${missingFields.join(', ')}`);
      verificationResults.summary.issues.push(
        `Game schema missing fields: ${missingFields.join(', ')}`
      );
    }
    
    if (totalGames === 0) {
      logger.warn('No game records found');
      verificationResults.summary.issues.push('No game records found');
    }
    
    // Set overall game stats status
    verificationResults.gameStats.status = 
      totalGames === 0 || missingFields.length > 0 ? 'issues' : 'ok';
    
    verificationResults.summary.totalRecords += totalGames;
    
    logger.info(`Games: ${totalGames} total, ${liveGames} live, ${completedGames} completed, ${upcomingGames} upcoming`);
    
    return verificationResults.gameStats;
  } catch (error) {
    logger.error(`Failed to verify games: ${error.message}`);
    verificationResults.gameStats.status = 'error';
    verificationResults.summary.issues.push(`Failed to verify games: ${error.message}`);
    throw error;
  }
}

/**
 * Verify team data
 */
async function verifyTeams(db) {
  logger.info('Verifying team data...');
  
  try {
    // Check if teams collection exists
    let collections = verificationResults.collections.details.available || [];
    if (!collections.includes('teams')) {
      // Try to fetch teams from games collection instead
      logger.info('Teams collection not found, extracting team data from games collection');
      
      const teamsFromGames = await extractTeamsFromGames(db);
      
      verificationResults.teamStats.details = {
        collectionMissing: true,
        teamsExtracted: teamsFromGames.length,
        teamsByLeague: countTeamsByLeague(teamsFromGames),
        teamsSample: teamsFromGames.slice(0, 5)
      };
      
      verificationResults.teamStats.status = 'warning';
      
      logger.warn('No dedicated teams collection, extracted team info from games');
      verificationResults.summary.issues.push('No dedicated teams collection, using teams extracted from games');
      
      return verificationResults.teamStats;
    }
    
    // Count total teams
    const totalTeams = await db.collection('teams').countDocuments();
    
    // Count teams by league
    const teamsByLeague = {};
    for (const league of SUPPORTED_LEAGUES) {
      const count = await db.collection('teams').countDocuments({ 
        league: { $regex: new RegExp(league, 'i') }
      });
      teamsByLeague[league] = count;
    }
    
    // Get sample teams
    const sampleTeams = await db.collection('teams')
      .find()
      .limit(10)
      .toArray();
    
    // Check schema of a sample document
    let schemaStatus = 'N/A';
    let missingFields = [];
    
    if (sampleTeams.length > 0) {
      const sample = sampleTeams[0];
      
      // Check for expected fields
      missingFields = EXPECTED_TEAM_SCHEMA.filter(field => {
        const hasField = field in sample;
        if (!hasField) {
          return true;
        }
        return false;
      });
      
      schemaStatus = missingFields.length === 0 ? 'ok' : 'issues';
    }
    
    // Save results
    verificationResults.teamStats.details = {
      totalTeams,
      teamsByLeague,
      schemaStatus,
      missingFields,
      sampleTeams: sampleTeams.map(team => ({
        id: team._id,
        name: team.name,
        league: team.league
      }))
    };
    
    if (missingFields.length > 0) {
      logger.warn(`Team schema issues - missing fields: ${missingFields.join(', ')}`);
      verificationResults.summary.issues.push(
        `Team schema missing fields: ${missingFields.join(', ')}`
      );
    }
    
    if (totalTeams === 0) {
      logger.warn('No team records found');
      verificationResults.summary.issues.push('No team records found');
    }
    
    // Set overall team stats status
    verificationResults.teamStats.status = 
      totalTeams === 0 || missingFields.length > 0 ? 'issues' : 'ok';
    
    verificationResults.summary.totalRecords += totalTeams;
    
    logger.info(`Teams: ${totalTeams} total`);
    Object.entries(teamsByLeague).forEach(([league, count]) => {
      if (count > 0) {
        logger.info(`  ${league}: ${count} teams`);
      }
    });
    
    return verificationResults.teamStats;
  } catch (error) {
    logger.error(`Failed to verify teams: ${error.message}`);
    verificationResults.teamStats.status = 'error';
    verificationResults.summary.issues.push(`Failed to verify teams: ${error.message}`);
    throw error;
  }
}

/**
 * Extract team data from games collection when teams collection is missing
 */
async function extractTeamsFromGames(db) {
  try {
    // Use aggregation to extract unique teams from games
    const teams = await db.collection('games').aggregate([
      { $project: { 
        "homeTeamData": {
          "id": "$homeTeam.id",
          "name": "$homeTeam.name",
          "league": "$league"
        },
        "awayTeamData": {
          "id": "$awayTeam.id",
          "name": "$awayTeam.name",
          "league": "$league"
        }
      }},
      { $facet: {
        "homeTeams": [
          { $project: { team: "$homeTeamData" } }
        ],
        "awayTeams": [
          { $project: { team: "$awayTeamData" } }
        ]
      }},
      { $project: {
        "teams": { $concatArrays: ["$homeTeams", "$awayTeams"] }
      }},
      { $unwind: "$teams" },
      { $replaceRoot: { newRoot: "$teams.team" } },
      { $match: { id: { $ne: null } } },
      { $group: {
        _id: "$id",
        name: { $first: "$name" },
        league: { $first: "$league" }
      }}
    ]).toArray();
    
    return teams;
  } catch (error) {
    logger.error(`Failed to extract teams from games: ${error.message}`);
    return [];
  }
}

/**
 * Count teams by league from an array of teams
 */
function countTeamsByLeague(teams) {
  const teamsByLeague = {};
  
  for (const league of SUPPORTED_LEAGUES) {
    teamsByLeague[league] = teams.filter(
      team => team.league && team.league.toUpperCase() === league
    ).length;
  }
  
  return teamsByLeague;
}

/**
 * Verify predictions data
 */
async function verifyPredictions(db) {
  logger.info('Verifying prediction data...');
  
  try {
    // Check if predictions collection exists
    let collections = verificationResults.collections.details.available || [];
    if (!collections.includes('predictions')) {
      logger.info('Predictions collection not found');
      
      verificationResults.predictions.details = {
        collectionMissing: true,
        note: 'Predictions are likely generated on-demand rather than stored'
      };
      
      verificationResults.predictions.status = 'info';
      return verificationResults.predictions;
    }
    
    // Count total predictions
    const totalPredictions = await db.collection('predictions').countDocuments();
    
    // Count predictions by league
    const predictionsByLeague = {};
    for (const league of SUPPORTED_LEAGUES) {
      const count = await db.collection('predictions').countDocuments({ 
        league: { $regex: new RegExp(league, 'i') }
      });
      predictionsByLeague[league] = count;
    }
    
    // Count predictions by type
    const predictionsByType = {};
    const types = await db.collection('predictions').distinct('type');
    for (const type of types) {
      const count = await db.collection('predictions').countDocuments({ type });
      predictionsByType[type] = count;
    }
    
    // Get recent predictions
    const recentPredictions = await db.collection('predictions')
      .find()
      .sort({ timestamp: -1 })
      .limit(5)
      .toArray();
    
    // Check schema of a sample document
    let schemaStatus = 'N/A';
    let missingFields = [];
    
    if (recentPredictions.length > 0) {
      const sample = recentPredictions[0];
      
      // Check for expected fields
      missingFields = EXPECTED_PREDICTION_SCHEMA.filter(field => {
        const hasField = field in sample;
        if (!hasField) {
          return true;
        }
        return false;
      });
      
      schemaStatus = missingFields.length === 0 ? 'ok' : 'issues';
    }
    
    // Save results
    verificationResults.predictions.details = {
      totalPredictions,
      predictionsByLeague,
      predictionsByType,
      schemaStatus,
      missingFields,
      recentPredictions: recentPredictions.map(pred => ({
        id: pred._id,
        league: pred.league,
        type: pred.type,
        timestamp: pred.timestamp,
        confidence: pred.confidence
      }))
    };
    
    if (missingFields.length > 0) {
      logger.warn(`Prediction schema issues - missing fields: ${missingFields.join(', ')}`);
      // Not critical, just informational
    }
    
    // Set overall predictions status
    verificationResults.predictions.status = 
      missingFields.length > 0 ? 'warning' : 'ok';
    
    verificationResults.summary.totalRecords += totalPredictions;
    
    logger.info(`Predictions: ${totalPredictions} total`);
    
    return verificationResults.predictions;
  } catch (error) {
    logger.error(`Failed to verify predictions: ${error.message}`);
    verificationResults.predictions.status = 'error';
    // Not critical for overall system
    return verificationResults.predictions;
  }
}

/**
 * Verify sync status by checking log files or timestamps
 */
async function verifySyncStatus(db) {
  logger.info('Verifying synchronization status...');
  
  try {
    // Check for sync log file
    const logPaths = [
      'combined.log',
      'live-games.log',
      'sync-player-stats.log',
      path.join(process.cwd(), 'logs', 'sync-player-stats.log')
    ];
    
    let syncLogFound = false;
    let lastSyncTime = null;
    let syncDetails = {};
    
    // Try to read each potential log file
    for (const logPath of logPaths) {
      try {
        if (fs.existsSync(logPath)) {
          syncLogFound = true;
          const logStats = fs.statSync(logPath);
          
          // Read the last few lines of the log file to check for sync activities
          const logContent = fs.readFileSync(logPath, 'utf8');
          const logLines = logContent.split('\n').filter(line => line.trim().length > 0);
          
          // Look for sync-related entries
          const syncEntries = logLines
            .filter(line => line.includes('sync') || line.includes('Sync'))
            .slice(-10); // Get last 10 sync-related entries
          
          // Try to parse timestamps from log entries
          const timestamps = syncEntries
            .map(entry => {
              // Try to extract ISO timestamp
              const match = entry.match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z/);
              return match ? new Date(match[0]) : null;
            })
            .filter(timestamp => timestamp !== null);
          
          if (timestamps.length > 0) {
            // Get the most recent timestamp
            lastSyncTime = new Date(Math.max(...timestamps.map(t => t.getTime())));
          } else {
            // If no timestamp found in content, use file modification time
            lastSyncTime = logStats.mtime;
          }
          
          syncDetails[logPath] = {
            size: logStats.size,
            modified: logStats.mtime,
            lastSyncEntries: syncEntries,
            syncTimestamp: lastSyncTime
          };
          
          break; // Stop after finding the first valid log
        }
      } catch (error) {
        logger.debug(`Error reading log file ${logPath}: ${error.message}`);
      }
    }
    
    // If no log file, check for the newest player stats record
    if (!syncLogFound) {
      logger.info('No sync log file found, checking for recent records');
      
      // Find the most recent player stats entry across all leagues
      const mostRecentByLeague = {};
      let overallMostRecent = null;
      
      for (const league of SUPPORTED_LEAGUES) {
        const collectionName = `${league.toLowerCase()}_player_stats`;
        
        try {
          const latestDoc = await db.collection(collectionName)
            .find()
            .sort({ date: -1 })
            .limit(1)
            .toArray();
          
          if (latestDoc.length > 0) {
            const latestDate = latestDoc[0].date;
            mostRecentByLeague[league] = latestDate;
            
            if (!overallMostRecent || latestDate > overallMostRecent) {
              overallMostRecent = latestDate;
            }
          }
        } catch (error) {
          logger.debug(`Error finding latest ${league} record: ${error.message}`);
        }
      }
      
      if (overallMostRecent) {
        lastSyncTime = overallMostRecent;
        syncDetails.mostRecentByLeague = mostRecentByLeague;
        syncDetails.overallMostRecent = overallMostRecent;
      }
    }
    
    // Determine sync status based on last sync time
    let syncStatus = 'unknown';
    
    if (lastSyncTime) {
      const now = new Date();
      const hoursSinceSync = (now - lastSyncTime) / (1000 * 60 * 60);
      
      if (hoursSinceSync < 24) {
        syncStatus = 'ok';
      } else if (hoursSinceSync < 72) {
        syncStatus = 'warning';
      } else {
        syncStatus = 'error';
      }
      
      syncDetails.hoursSinceSync = hoursSinceSync;
    }
    
    // Save results
    verificationResults.sync = {
      status: syncStatus,
      lastSync: lastSyncTime,
      details: syncDetails
    };
    
    if (syncStatus === 'warning') {
      logger.warn(`Last sync was ${syncDetails.hoursSinceSync.toFixed(1)} hours ago`);
      verificationResults.summary.issues.push(`Last sync was ${syncDetails.hoursSinceSync.toFixed(1)} hours ago`);
    } else if (syncStatus === 'error') {
      logger.error(`Last sync was ${syncDetails.hoursSinceSync.toFixed(1)} hours ago`);
      verificationResults.summary.issues.push(`Last sync was ${syncDetails.hoursSinceSync.toFixed(1)} hours ago`);
    } else if (syncStatus === 'unknown') {
      logger.warn('Could not determine last sync time');
      verificationResults.summary.issues.push('Could not determine last sync time');
    } else {
      logger.info(`Last sync was ${syncDetails.hoursSinceSync.toFixed(1)} hours ago`);
    }
    
    return verificationResults.sync;
  } catch (error) {
    logger.error(`Failed to verify sync status: ${error.message}`);
    verificationResults.sync.status = 'error';
    verificationResults.summary.issues.push(`Failed to verify sync status: ${error.message}`);
    return verificationResults.sync;
  }
}

/**
 * Generate summary and determine overall status
 */
function generateSummary() {
  try {
    // Count total records
    const totalRecords = verificationResults.summary.totalRecords;
    
    // Count issues
    const issuesCount = verificationResults.summary.issues.length;
    
    // Determine overall status
    let overallStatus = 'ok';
    
    // Check player stats status (most critical)
    if (verificationResults.playerStats.status === 'error') {
      overallStatus = 'error';
    } else if (verificationResults.playerStats.status === 'issues') {
      overallStatus = 'warning';
    }
    
    // Check game status (also critical)
    if (verificationResults.gameStats.status === 'error') {
      overallStatus = 'error';
    } else if (verificationResults.gameStats.status === 'issues' && overallStatus !== 'error') {
      overallStatus = 'warning';
    }
    
    // Set overall status in summary
    verificationResults.summary.overallStatus = overallStatus;
    verificationResults.summary.issuesCount = issuesCount;
    
    // Add timestamps
    verificationResults.summary.verificationTime = new Date();
    
    // Log summary
    logger.info('Verification summary:');
    logger.info(`  Status: ${overallStatus.toUpperCase()}`);
    logger.info(`  Total records: ${totalRecords}`);
    logger.info(`  Issues: ${issuesCount}`);
    
    if (issuesCount > 0) {
      logger.info('Issues found:');
      verificationResults.summary.issues.forEach((issue, index) => {
        logger.info(`  ${index + 1}. ${issue}`);
      });
    }
    
    return verificationResults.summary;
  } catch (error) {
    logger.error(`Failed to generate summary: ${error.message}`);
    verificationResults.summary.overallStatus = 'error';
    verificationResults.summary.error = error.message;
    return verificationResults.summary;
  }
}

/**
 * Save verification results to a JSON file
 */
function saveResults() {
  try {
    const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\./g, '-');
    const filePath = `verification-results-${timestamp}.json`;
    
    // Remove any circular references
    const serializedResults = JSON.stringify(verificationResults, null, 2);
    
    fs.writeFileSync(filePath, serializedResults);
    logger.info(`Verification results saved to ${filePath}`);
    
    return filePath;
  } catch (error) {
    logger.error(`Failed to save verification results: ${error.message}`);
    return null;
  }
}

/**
 * Main verification function
 */
async function verifyAllData() {
  try {
    // Connect to MongoDB
    const client = await verifyConnection();
    
    if (!client) {
      logger.error('MongoDB connection failed, verification aborted');
      return verificationResults;
    }
    
    const db = client.db(DB_NAME);
    
    try {
      // Verify all data components
      await verifyCollections(db);
      await verifyPlayerStats(db);
      await verifyGames(db);
      await verifyTeams(db);
      await verifyPredictions(db);
      await verifySyncStatus(db);
      
      // Generate final summary after all checks
      generateSummary();
      
      // Save results to file
      saveResults();
      
      // Visual summary to console
      console.log('\n');
      console.log('=== DATA VERIFICATION SUMMARY ===');
      console.log(`STATUS: ${verificationResults.summary.overallStatus.toUpperCase()}`);
      console.log(`Total Records: ${verificationResults.summary.totalRecords.toLocaleString()}`);
      console.log(`Issues Found: ${verificationResults.summary.issuesCount}`);
      console.log(`Player Stats: ${verificationResults.playerStats.status.toUpperCase()}`);
      console.log(`Games: ${verificationResults.gameStats.status.toUpperCase()}`);
      console.log(`Teams: ${verificationResults.teamStats.status.toUpperCase()}`);
      console.log(`Predictions: ${verificationResults.predictions.status.toUpperCase()}`);
      console.log(`Sync Status: ${verificationResults.sync.status.toUpperCase()}`);
      console.log('================================');
      
      if (verificationResults.summary.issuesCount > 0) {
        console.log('\nISSUES FOUND:');
        verificationResults.summary.issues.forEach((issue, index) => {
          console.log(`${index + 1}. ${issue}`);
        });
      }
      
    } catch (error) {
      logger.error(`Verification process error: ${error.message}`);
      verificationResults.summary.overallStatus = 'error';
      verificationResults.summary.error = error.message;
    } finally {
      // Close MongoDB connection
      await client.close();
    }
    
    return verificationResults;
  } catch (error) {
    logger.error(`Fatal verification error: ${error.message}`);
    verificationResults.summary.overallStatus = 'error';
    verificationResults.summary.error = error.message;
    return verificationResults;
  }
}

// Execute verification if called directly
if (require.main === module) {
  verifyAllData()
    .then(() => {
      logger.info('Verification completed');
      // Exit with appropriate code based on verification status
      if (verificationResults.summary.overallStatus === 'error') {
        process.exit(1);
      } else {
        process.exit(0);
      }
    })
    .catch((error) => {
      logger.error(`Unhandled error: ${error.message}`);
      process.exit(1);
    });
} else {
  // Export for use as a module
  module.exports = {
    verifyAllData,
    verificationResults
  };
}

const { MongoClient } = require('mongodb');

async function verifyData() {
    const client = new MongoClient(MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true });
    try {
        await client.connect();
        const db = client.db(DB_NAME);
        
        const teams = await db.collection('teams').find().toArray();
        console.log('Teams:', teams);
        
        const players = await db.collection('players').find().toArray();
        console.log('Players:', players);
        
        const games = await db.collection('games').find().toArray();
        console.log('Games:', games);
    } catch (error) {
        console.error('Error verifying data:', error);
    } finally {
        await client.close();
    }
}

verifyData();