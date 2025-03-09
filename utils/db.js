// utils/db.js
const { MongoClient } = require('mongodb');
const { StatsCalculator, TeamStatsTracker } = require('./statsCalculator');
const _ = require('lodash');

// Player stats schema definition
const playerStatsSchema = {
  playerId: String,      // Player ID
  playerName: String,    // Player Name
  teamId: String,        // Team ID
  gameId: String,        // Game ID for reference
  league: String,        // League (NFL, NBA, etc.)
  date: Date,            // Game date
  season: String,        // Season identifier
  
  // Common stats across sports
  minutesPlayed: Number,
  gamesPlayed: Number,
  
  // Sport-specific stats stored in a flexible structure
  stats: {
    // Basketball stats
    points: Number,
    rebounds: Number,
    assists: Number,
    steals: Number,
    blocks: Number,
    
    // Football stats
    passingYards: Number,
    rushingYards: Number,
    touchdowns: Number,
    
    // Baseball stats
    hits: Number,
    runs: Number,
    rbi: Number,
    
    // Soccer stats
    goals: Number,
    assists: Number,
    shots: Number
  },
  
  // Advanced metrics
  advancedMetrics: {}
};

class DatabaseManager {
  constructor(config) {
    this.client = null;
    this.connecting = false;
    this.waitingPromises = [];
    this.config = config;
    this.mongoUri = config.uri;
    this.options = {
      ...config.options,
      maxPoolSize: parseInt(process.env.DB_MAX_POOL_SIZE, 10) || 50,
      minPoolSize: parseInt(process.env.DB_MIN_POOL_SIZE, 10) || 10,
      connectTimeoutMS: parseInt(process.env.CONNECT_TIMEOUT_MS, 10) || 30000,
      socketTimeoutMS: parseInt(process.env.SOCKET_TIMEOUT_MS, 10) || 45000,
      serverSelectionTimeoutMS: 5000,
      heartbeatFrequencyMS: 30000, // Reduced for quicker detection
      maxIdleTimeMS: 60000, // 1 minute idle timeout
      retryWrites: true,
      retryReads: true,
      serverApi: { version: '1', strict: true, deprecationErrors: true }
    };
    
    // Make schema available on the instance
    this.playerStatsSchema = playerStatsSchema;
  }

  async initialize() {
    try {
      // Connect to database
      await this.connect();
      
      // Perform any additional initialization
      const db = this.client.db(this.config.name);
      
      // Create any necessary indexes or collections for existing data
      await db.collection('users').createIndex({ email: 1 }, { unique: true });
      await db.collection('games').createIndex({ date: 1 });
      await db.collection('stats').createIndex({ teamId: 1 });
      
      // Add player stats collections and indexes for each league
      const SUPPORTED_LEAGUES = [
        'NFL', 'NBA', 'MLB', 'NHL',
        'PREMIER_LEAGUE', 'LA_LIGA', 'BUNDESLIGA', 'SERIE_A'
      ];
      
      for (const league of SUPPORTED_LEAGUES) {
        const collectionName = `${league.toLowerCase()}_player_stats`;
        
        try {
          // Create collection if it doesn't exist
          await db.createCollection(collectionName);
          console.log(`Created ${collectionName} collection`);
        } catch (error) {
          // Collection may already exist, which is fine
          if (error.code !== 48) { // 48 is "NamespaceExists" error
            console.warn(`Warning creating ${collectionName}: ${error.message}`);
          }
        }
        
        // Create indexes for player stats collection
        await db.collection(collectionName).createIndex({ playerId: 1 });
        await db.collection(collectionName).createIndex({ gameId: 1 });
        await db.collection(collectionName).createIndex({ teamId: 1 });
        await db.collection(collectionName).createIndex({ date: -1 });
        await db.collection(collectionName).createIndex({ 
          playerId: 1, 
          date: -1 
        }, { name: "player_date_lookup" });
        
        console.log(`Created indexes for ${collectionName}`);
      }
      
      return true;
    } catch (error) {
      throw new Error(`Database initialization failed: ${error.message}`);
    }
  }

  async connect() {
    if (this.connecting) {
      return new Promise((resolve, reject) => {
        this.waitingPromises.push({ resolve, reject });
      });
    }

    this.connecting = true;
    try {
      this.client = await MongoClient.connect(this.mongoUri, this.options);
      this.waitingPromises.forEach(promise => promise.resolve(this.client));
      return this.client;
    } catch (error) {
      this.waitingPromises.forEach(promise => promise.reject(error));
      throw error;
    } finally {
      this.connecting = false;
      this.waitingPromises = [];
    }
  }

  async disconnect() {
    if (this.client) {
      await this.client.close();
      this.client = null;
    }
  }

  async getActiveConnections() {
    if (!this.client) return 0;
    const serverStatus = await this.client.db('admin').command({ serverStatus: 1 });
    return serverStatus.connections.current;
  }

  async healthCheck() {
    try {
      if (!this.client) {
        await this.connect();
      }
      await this.client.db('admin').command({ ping: 1 });
      return {
        status: 'healthy',
        connections: await this.getActiveConnections()
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message
      };
    }
  }

  async find(collection, query = {}, options = {}) {
    await this.connect();
    return this.client.db(this.config.name)
      .collection(collection)
      .find(query, options)
      .toArray();
  }

  async findOne(collection, query = {}, options = {}) {
    await this.connect();
    return this.client.db(this.config.name)
      .collection(collection)
      .findOne(query, options);
  }

  async insertOne(collection, document) {
    await this.connect();
    return this.client.db(this.config.name)
      .collection(collection)
      .insertOne(document);
  }

  async updateOne(collection, filter, update, options = {}) {
    await this.connect();
    return this.client.db(this.config.name)
      .collection(collection)
      .updateOne(filter, update, options);
  }

  // Player stats specific methods
  async savePlayerStats(league, playerStats) {
    await this.connect();
    const collectionName = `${league.toLowerCase()}_player_stats`;
    
    // Validate stats against schema
    const validatedStats = this._validateAgainstSchema(playerStats);
    
    return this.client.db(this.config.name)
      .collection(collectionName)
      .insertOne(validatedStats);
  }
  
  async getPlayerStats(league, playerId, options = {}) {
    await this.connect();
    const collectionName = `${league.toLowerCase()}_player_stats`;
    
    const query = { playerId };
    if (options.gameId) query.gameId = options.gameId;
    if (options.season) query.season = options.season;
    if (options.dateRange) {
      query.date = {
        $gte: options.dateRange.start,
        $lte: options.dateRange.end
      };
    }
    
    const sort = options.sort || { date: -1 };
    const limit = options.limit || 0;
    
    return this.client.db(this.config.name)
      .collection(collectionName)
      .find(query)
      .sort(sort)
      .limit(limit)
      .toArray();
  }
  
  async updatePlayerStats(league, playerId, gameId, updates) {
    await this.connect();
    const collectionName = `${league.toLowerCase()}_player_stats`;
    
    // Ensure updates only contain valid fields
    const validUpdates = {};
    for (const field in updates) {
      if (field in this.playerStatsSchema) {
        if (field === 'stats' || field === 'advancedMetrics') {
          validUpdates[field] = {};
          for (const statField in updates[field]) {
            if (statField in this.playerStatsSchema[field]) {
              validUpdates[field][statField] = updates[field][statField];
            }
          }
        } else {
          validUpdates[field] = updates[field];
        }
      }
    }
    
    return this.client.db(this.config.name)
      .collection(collectionName)
      .updateOne(
        { playerId, gameId },
        { $set: validUpdates }
      );
  }
  
  _validateAgainstSchema(playerStats) {
    // Create a new object with only fields from the schema
    const validated = {};
    
    for (const field in this.playerStatsSchema) {
      if (playerStats.hasOwnProperty(field)) {
        if (field === 'stats' || field === 'advancedMetrics') {
          // Handle nested objects
          validated[field] = {};
          for (const statField in this.playerStatsSchema[field]) {
            if (playerStats[field] && playerStats[field].hasOwnProperty(statField)) {
              validated[field][statField] = playerStats[field][statField];
            }
          }
        } else {
          validated[field] = playerStats[field];
        }
      }
    }
    
    return validated;
  }

  async getTeamStats(teamId) {
    const games = await this.find('games', { 
      $or: [
        { 'homeTeam.id': teamId },
        { 'awayTeam.id': teamId }
      ],
      status: 'completed'
    });

    return await StatsCalculator.calculateTeamStats(
      this.client,
      this.config.name,
      teamId,
      games
    );
  }

  async calculateLeagueAverages(league, startDate, endDate) {
    try {
      const games = await this.find('games', {
        league: league.toUpperCase(),
        status: 'completed',
        date: { $gte: startDate, $lte: endDate }
      });

      if (!games.length) return null;

      const scores = _.flatMap(games, game => [
        game.homeTeam.score, 
        game.awayTeam.score
      ]);

      return {
        averageScore: _.mean(scores).toFixed(1),
        medianScore: this.calculateMedian(scores),
        highestScore: _.max(scores),
        lowestScore: _.min(scores),
        scoreStandardDeviation: this.calculateStandardDeviation(scores),
        totalGamesAnalyzed: games.length,
        scoringTrends: StatsCalculator.calculateScoringTrends(games)
      };
    } catch (error) {
      console.error('League averages calculation error:', error);
      return null;
    }
  }

  calculateRecentForm(games, teamId) {
    const recentGames = games.slice(-5);
    if (recentGames.length === 0) return 0.5;

    let wins = 0;
    recentGames.forEach(game => {
      const isHome = game.homeTeam.id === teamId;
      const teamScore = isHome ? game.homeTeam.score : game.awayTeam.score;
      const opposingScore = isHome ? game.awayTeam.score : game.homeTeam.score;
      if (teamScore > opposingScore) wins++;
    });

    return wins / recentGames.length;
  }

  calculateScoringEfficiency(games, teamId) {
    if (games.length === 0) return 0.5;

    let totalEfficiency = 0;
    games.forEach(game => {
      const isHome = game.homeTeam.id === teamId;
      const teamScore = isHome ? game.homeTeam.score : game.awayTeam.score;
      const opposingScore = isHome ? game.awayTeam.score : game.homeTeam.score;
      totalEfficiency += teamScore / (teamScore + opposingScore);
    });

    return totalEfficiency / games.length;
  }

  calculateMedian(values) {
    const sorted = _.sortBy(values);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0
      ? (sorted[mid - 1] + sorted[mid]) / 2
      : sorted[mid];
  }

  calculateStandardDeviation(values) {
    const mean = _.mean(values);
    const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
    const variance = _.mean(squaredDiffs);
    return Math.sqrt(variance);
  }
}

// Export the DatabaseManager class and the player stats schema
module.exports = { DatabaseManager, playerStatsSchema };