/**
 * Enterprise Sports Analytics API Router
 * Serves as the main API gateway for all analytics endpoints
 */

const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
const { MongoClient, ServerApiVersion } = require('mongodb');
const mongoose = require('mongoose');
const axios = require('axios');
require('dotenv').config();

// Configure rate limiting for API protection
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: 'error',
    code: 'RATE_LIMIT_EXCEEDED',
    message: 'Too many requests, please try again later.'
  }
});

// Middleware to validate API keys
const apiKeyValidator = (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  
  // For development purposes, allow all requests
  // In production, this would validate against a database
  next();
};

// Sport DB API configuration
// Update to use the correct API key for the paid tier - not the free tier key '3'
const SPORT_DB_API_URL = 'https://www.thesportsdb.com/api/v1/json';
const SPORT_DB_API_KEY = process.env.THESPORTSDB_API_KEY || process.env.SPORTS_DB_API_KEY || '447279';

/**
 * Fetch data from SportDB API 
 * @param {string} endpoint - API endpoint
 * @param {Object} params - Query parameters
 * @returns {Promise<Array>} Data from SportDB API
 */
async function fetchFromSportDB(endpoint, params = {}) {
  try {
    // Build query string from params
    const queryParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value) queryParams.append(key, value);
    });
    
    // Build URL with proper API key from paid tier
    const queryString = queryParams.toString();
    const url = `${SPORT_DB_API_URL}/${SPORT_DB_API_KEY}/${endpoint}${queryString ? `?${queryString}` : ''}`;
    
    console.log(`Fetching data from SportDB API: ${url}`);
    
    // Make request with timeout
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      },
      timeout: 8000 // 8 second timeout
    });
    
    if (!response.ok) {
      throw new Error(`SportDB API returned ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    return data;
  } catch (error) {
    console.error(`Error fetching from SportDB API: ${error.message}`);
    throw error;
  }
}

/**
 * Fetch leagues from SportDB API
 */
async function fetchLeagues() {
  try {
    const result = await fetchFromSportDB('all_leagues.php');
    
    if (!result.leagues) {
      throw new Error('No leagues data returned from SportDB API');
    }
    
    // Transform data to match our API format
    return result.leagues.map(league => ({
      id: league.idLeague,
      name: league.strLeague,
      country: league.strCountry,
      logo: league.strBadge || `/img/leagues/league-placeholder.svg`,
      active: true
    })).filter(league => {
      // Filter for our supported leagues
      const supportedLeagues = [
        'English Premier League',
        'Spanish La Liga',
        'Italian Serie A',
        'NBA',
        'NFL',
        'MLB',
        'NHL'
      ];
      return supportedLeagues.some(supported => 
        league.name.toLowerCase().includes(supported.toLowerCase())
      );
    });
  } catch (error) {
    console.error('Error fetching leagues:', error);
    // In case of any error, return empty array
    return [];
  }
}

/**
 * Fetch teams from SportDB API
 */
async function fetchTeams(params) {
  try {
    let endpoint = 'lookup_all_teams.php';
    let apiParams = {};
    
    if (params.league) {
      endpoint = 'lookup_all_teams.php';
      apiParams.id = params.league;
    } else if (params.country) {
      endpoint = 'search_all_teams.php';
      apiParams.c = params.country;
    } else if (params.query) {
      endpoint = 'searchteams.php';
      apiParams.t = params.query;
    }
    
    const result = await fetchFromSportDB(endpoint, apiParams);
    
    // Handle both response formats for teams
    // Paid tier might have different format than free tier
    if (!result || (!result.teams && !result.team)) {
      console.log('No teams found in API response');
      return [];
    }
    
    // Use whichever teams array is available in the response
    const teamsArray = result.teams || result.team || [];
    
    // Transform data to match our API format
    return Array.isArray(teamsArray) ? teamsArray.map(team => ({
      id: team.idTeam,
      name: team.strTeam,
      logo: team.strTeamBadge || '/img/placeholder.svg',
      country: team.strCountry,
      league: team.idLeague,
      stadium: team.strStadium,
      description: team.strDescriptionEN
    })) : [];
  } catch (error) {
    console.error('Error fetching teams:', error);
    return [];
  }
}

/**
 * Fetch matches from SportDB API
 */
async function fetchMatches(params) {
  try {
    let endpoint = 'eventspastleague.php';
    let apiParams = {};
    
    if (params.league) {
      apiParams.id = params.league;
    }
    
    if (params.status === 'upcoming') {
      endpoint = 'eventsnextleague.php';
    } else if (params.status === 'live') {
      endpoint = 'eventslive.php';
    }
    
    const result = await fetchFromSportDB(endpoint, apiParams);
    
    // Handle both response formats for events
    // Paid tier might have different format than free tier
    if (!result || (!result.events && !result.event)) {
      console.log('No matches found in API response');
      return [];
    }
    
    // Use whichever events array is available in the response
    const eventsArray = result.events || result.event || [];
    
    // Transform data to match our API format
    let matches = Array.isArray(eventsArray) ? eventsArray.map(event => ({
      id: event.idEvent,
      league: {
        id: event.idLeague,
        name: event.strLeague,
        logo: `/img/leagues/${event.strLeague?.toLowerCase().replace(/\s+/g, '-') || 'default'}.svg`
      },
      teams: {
        home: {
          id: event.idHomeTeam,
          name: event.strHomeTeam,
          logo: null // We'll need to fetch this separately
        },
        away: {
          id: event.idAwayTeam,
          name: event.strAwayTeam,
          logo: null // We'll need to fetch this separately
        }
      },
      score: {
        home: parseInt(event.intHomeScore) || 0,
        away: parseInt(event.intAwayScore) || 0
      },
      date: event.dateEvent,
      time: event.strTime,
      venue: event.strVenue,
      status: event.strStatus || (new Date(event.dateEvent) > new Date() ? 'upcoming' : 'finished')
    })) : [];
    
    // Apply additional filters
    if (params.team) {
      matches = matches.filter(match => 
        match.teams.home.id === params.team || match.teams.away.id === params.team
      );
    }
    
    if (params.dateFrom) {
      const fromDate = new Date(params.dateFrom);
      matches = matches.filter(match => new Date(match.date) >= fromDate);
    }
    
    if (params.dateTo) {
      const toDate = new Date(params.dateTo);
      matches = matches.filter(match => new Date(match.date) <= toDate);
    }
    
    // Apply sorting
    if (params.sort === 'date-asc') {
      matches.sort((a, b) => new Date(a.date) - new Date(b.date));
    } else if (params.sort === 'date-desc') {
      matches.sort((a, b) => new Date(b.date) - new Date(a.date));
    }
    
    // Apply limit
    if (params.limit) {
      matches = matches.slice(0, parseInt(params.limit));
    }
    
    return matches;
  } catch (error) {
    console.error('Error fetching matches:', error);
    return [];
  }
}

/**
 * Fetch players from SportDB API
 */
async function fetchPlayers(params) {
  try {
    let endpoint = 'lookup_all_players.php';
    let apiParams = {};
    
    if (params.team) {
      apiParams.id = params.team;
    } else if (params.player) {
      endpoint = 'lookupplayer.php';
      apiParams.id = params.player;
    } else if (params.query) {
      endpoint = 'searchplayers.php';
      apiParams.p = params.query;
    }
    
    const result = await fetchFromSportDB(endpoint, apiParams);
    
    if (!result.player) {
      return [];
    }
    
    // Transform data to match our API format
    return result.player.map(player => ({
      id: player.idPlayer,
      name: player.strPlayer,
      team: player.idTeam,
      teamName: player.strTeam,
      nationality: player.strNationality,
      position: player.strPosition,
      description: player.strDescriptionEN,
      image: player.strThumb || player.strCutout || '/img/placeholder.svg',
      dateOfBirth: player.dateBorn,
      height: player.strHeight,
      weight: player.strWeight
    }));
  } catch (error) {
    console.error('Error fetching players:', error);
    return [];
  }
}

// Apply rate limiting to all API routes
router.use(apiLimiter);
router.use(apiKeyValidator);

// Live Games API Endpoints
router.get('/live-games', (req, res) => {
  try {
    const liveGamesManager = req.app.locals.liveGamesManager;
    
    if (!liveGamesManager) {
      return res.status(503).json({
        status: 'error',
        message: 'Live games service is not available'
      });
    }
    
    const allGames = liveGamesManager.getLiveGames();
    const totalGames = Object.values(allGames).reduce((sum, games) => sum + games.length, 0);
    
    res.json({
      status: 'success',
      timestamp: new Date().toISOString(),
      total: totalGames,
      leagues: Object.keys(allGames).length,
      data: allGames
    });
  } catch (error) {
    console.error('Error fetching live games:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch live games',
      error: error.message
    });
  }
});

router.get('/live-games/:leagueId', (req, res) => {
  try {
    const { leagueId } = req.params;
    const liveGamesManager = req.app.locals.liveGamesManager;
    
    if (!liveGamesManager) {
      return res.status(503).json({
        status: 'error',
        message: 'Live games service is not available'
      });
    }
    
    const games = liveGamesManager.getLiveGamesByLeague(leagueId);
    
    res.json({
      status: 'success',
      timestamp: new Date().toISOString(),
      leagueId,
      total: games.length,
      data: games
    });
  } catch (error) {
    console.error(`Error fetching live games for league ${req.params.leagueId}:`, error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch live games for league',
      error: error.message
    });
  }
});

// MongoDB Configuration with Enterprise-level fault tolerance
const MONGO_URI = 'mongodb+srv://SportAnalytics:Studyhard%402034@cluster0.et16d.mongodb.net/sports-analytics?retryWrites=true';
const MONGO_DB_NAME = 'sports-analytics';
const MONGO_CONNECT_TIMEOUT = process.env.MONGO_CONNECT_TIMEOUT || 5000; // 5 seconds
const MONGO_SOCKET_TIMEOUT = process.env.MONGO_SOCKET_TIMEOUT || 30000; // 30 seconds
const MONGO_MAX_POOL_SIZE = process.env.MONGO_MAX_POOL_SIZE || 50;
const MONGO_MIN_POOL_SIZE = process.env.MONGO_MIN_POOL_SIZE || 5;

// Create MongoDB client with advanced options for enterprise reliability
const client = new MongoClient(MONGO_URI, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
  maxPoolSize: parseInt(MONGO_MAX_POOL_SIZE),
  minPoolSize: parseInt(MONGO_MIN_POOL_SIZE),
  connectTimeoutMS: parseInt(MONGO_CONNECT_TIMEOUT),
  socketTimeoutMS: parseInt(MONGO_SOCKET_TIMEOUT),
  retryWrites: true,
  retryReads: true
});

// Cache for API responses
const cache = {
  leagues: {
    data: null,
    timestamp: 0,
    ttl: 3600000 // 1 hour
  },
  teams: {
    data: {},
    timestamp: {},
    ttl: 3600000 // 1 hour
  },
  matches: {
    data: {},
    timestamp: {},
    ttl: 60000 // 1 minute
  },
  players: {
    data: {},
    timestamp: {},
    ttl: 3600000 // 1 hour
  }
};

// Create a predictions sub-router
const predictionsRouter = express.Router();

// Mount the predictions router
router.use('/predict', predictionsRouter);

// Enterprise-grade connection management
let dbConnectionPromise = null;

/**
 * Connect to MongoDB with advanced retry logic and monitoring
 */
async function connectToMongo() {
  try {
    if (!dbConnectionPromise) {
      console.log('Establishing new MongoDB connection pool...');
      dbConnectionPromise = client.connect()
        .then(() => {
          console.log('MongoDB connection established successfully');
          return client.db(MONGO_DB_NAME);
        })
        .catch(err => {
          console.error('MongoDB connection error:', err);
          // Reset promise on error to allow retry on next request
          dbConnectionPromise = null;
          throw err;
        });
    }
    
    // Allow timeout for slow connections
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('MongoDB connection timed out')), MONGO_CONNECT_TIMEOUT);
    });
    
    // Race between connection and timeout
    return Promise.race([dbConnectionPromise, timeoutPromise]);
  } catch (err) {
    console.error('MongoDB connection failure:', err);
    
    // Provide a mock database with fallback data when MongoDB is unavailable 
    return provideRealDatabase();
  }
}

// Replace mock database function with real database connection
async function provideRealDatabase() {
    try {
        // Connect to MongoDB if not already connected
        if (mongoose.connection.readyState !== 1) {
            await mongoose.connect('mongodb+srv://SportAnalytics:Studyhard%402034@cluster0.et16d.mongodb.net/sports-analytics?retryWrites=true', {
                useNewUrlParser: true,
                useUnifiedTopology: true,
                serverSelectionTimeoutMS: 5000
            });
            console.log('Connected to MongoDB for API data');
        }
        
        // If no data in database yet, initialize by fetching from TheSportsDB
        const teamsCount = await mongoose.connection.collection('teams').countDocuments();
        if (teamsCount === 0) {
            console.log('No teams found in database. Initializing with data from TheSportsDB...');
            await initializeDatabaseFromSportsDB();
        }
        
        return mongoose.connection;
    } catch (error) {
        console.error('Database connection error:', error);
        throw new Error('Failed to connect to database. Please try again later.');
    }
}

// Initialize database with data from SportDB
async function initializeDatabaseFromSportsDB() {
    try {
        const sportsDBApiKey = process.env.THESPORTSDB_API_KEY || '447279';
        const baseUrl = 'https://www.thesportsdb.com/api/v1/json';
        
        // League IDs for the 8 supported leagues
        const leagues = [
            { id: '4387', name: 'NBA' },
            { id: '4391', name: 'NFL' }, 
            { id: '4424', name: 'MLB' },
            { id: '4380', name: 'NHL' },
            { id: '4328', name: 'Premier League' },
            { id: '4335', name: 'La Liga' },
            { id: '4331', name: 'Bundesliga' },
            { id: '4332', name: 'Serie A' }
        ];
        
        // Initialize leagues collection
        await mongoose.connection.collection('leagues').insertMany(
            leagues.map(league => ({
                leagueId: league.id,
                name: league.name,
                createdAt: new Date(),
                updatedAt: new Date()
            }))
        );
        
        // Fetch and store teams for each league
        for (const league of leagues) {
            const response = await axios.get(`${baseUrl}/${sportsDBApiKey}/lookup_all_teams.php?id=${league.id}`);
            
            if (response.data && response.data.teams) {
                const teams = response.data.teams.map(team => ({
                    teamId: team.idTeam,
                    name: team.strTeam,
                    league: league.name,
                    leagueId: league.id,
                    logo: team.strTeamBadge,
                    country: team.strCountry,
                    createdAt: new Date(),
                    updatedAt: new Date()
                }));
                
                if (teams.length > 0) {
                    await mongoose.connection.collection('teams').insertMany(teams);
                    console.log(`Added ${teams.length} teams for ${league.name}`);
                }
            }
        }
        
        console.log('Database initialized successfully with real data from TheSportsDB');
    } catch (error) {
        console.error('Error initializing database:', error);
        throw new Error('Failed to initialize database with TheSportsDB data');
    }
}

/**
 * Get data from cache or fetch from database
 */
async function getFromCacheOrDb(cacheKey, fetchFunction, params = {}) {
  try {
    const now = Date.now();
    
    // Initialize cache structure if it doesn't exist
    if (!cacheKey) {
      console.warn('Cache key is null or undefined, using temporary cache');
      // Create a temporary cache object for this request
      const tempCache = {
        data: null,
        timestamp: 0,
        ttl: 60000 // 1 minute
      };
      return await fetchFromDbWithFallback(tempCache, fetchFunction, params);
    }
    
    if (typeof cacheKey === 'object') {
      // For cache objects with subkeys (like matches by league)
      const subKey = params.key || 'default';
      
      // Initialize data and timestamp objects if they don't exist
      if (!cacheKey.data) cacheKey.data = {};
      if (!cacheKey.timestamp) cacheKey.timestamp = {};
      
      if (cacheKey.data[subKey] && (now - cacheKey.timestamp[subKey] < cacheKey.ttl)) {
        return cacheKey.data[subKey];
      }
      
      return await fetchFromDbWithFallback(cacheKey, fetchFunction, params, subKey);
    } else {
      // For simple cache keys (like leagues)
      if (cacheKey.data && (now - cacheKey.timestamp < cacheKey.ttl)) {
        return cacheKey.data;
      }
      
      return await fetchFromDbWithFallback(cacheKey, fetchFunction, params);
    }
  } catch (error) {
    console.error('Cache error:', error);
    // Fallback to direct fetch in case of cache error
    try {
      return await fetchFunction(params);
    } catch (fetchError) {
      console.error('Fetch error after cache error:', fetchError);
      return [];
    }
  }
}

/**
 * Helper function to fetch from database with fallback
 */
async function fetchFromDbWithFallback(cacheKey, fetchFunction, params, subKey = null) {
  try {
    const now = Date.now();
    const data = await fetchFunction(params);
    
    // Update cache
    if (subKey) {
      cacheKey.data[subKey] = data;
      cacheKey.timestamp[subKey] = now;
    } else {
      cacheKey.data = data;
      cacheKey.timestamp = now;
    }
    
    return data;
  } catch (error) {
    console.error(`Error fetching data:`, error);
    
    // Return empty data instead of throwing
    const emptyData = [];
    
    // Still update cache to prevent hammering the database
    if (subKey) {
      cacheKey.data[subKey] = emptyData;
      cacheKey.timestamp[subKey] = now;
    } else {
      cacheKey.data = emptyData;
      cacheKey.timestamp = now;
    }
    
    return emptyData;
  }
}

/**
 * Fetch player stats from database
 */
async function fetchPlayerStats(params) {
  try {
    const db = await connectToMongo();
    const query = { player_id: params.playerId };
    
    // Filter by date range
    if (params.dateFrom || params.dateTo) {
      query.date = {};
      
      if (params.dateFrom) {
        query.date.$gte = params.dateFrom;
      }
      
      if (params.dateTo) {
        query.date.$lte = params.dateTo;
      }
    }
    
    // Get player stats from database
    let statsQuery = db.collection('player_stats')
      .find(query)
      .sort({ date: -1 });
    
    // Apply limit if specified
    if (params.limit) {
      statsQuery = statsQuery.limit(parseInt(params.limit));
    }
    
    const stats = await statsQuery.toArray();
    
    return stats;
  } catch (error) {
    console.error('Error fetching player stats:', error);
    return [];
  }
}

/**
 * @route GET /api/health
 * @desc Health check endpoint
 * @access Public
 */
router.get('/health', (req, res) => {
  res.json({
    status: 'success',
    timestamp: new Date().toISOString(),
    service: 'sports-analytics-api',
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development'
  });
});

/**
 * @route GET /api/leagues
 * @desc Get all leagues
 * @access Public
 */
router.get('/leagues', async (req, res) => {
  try {
    const db = await provideRealDatabase();
    const leagues = await db.collection('leagues').find({}).toArray();
    
    return res.json({
      success: true,
      data: leagues
    });
  } catch (error) {
    console.error('Error fetching leagues:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch leagues'
    });
  }
});

/**
 * @route GET /api/leagues/:id
 * @desc Get league by ID
 * @access Public
 */
router.get('/leagues/:id', (req, res) => {
  const { id } = req.params;
  
  // Find league by ID
  const league = LEAGUES.find(l => l.id === id);
  
  if (!league) {
    return res.status(404).json({
      status: 'error',
      code: 'LEAGUE_NOT_FOUND',
      message: `League with ID ${id} not found`
    });
  }
  
  res.json({
    status: 'success',
    data: {
      league
    }
  });
});

/**
 * @route GET /api/teams
 * @desc Get teams, optionally filtered by league
 * @access Public
 */
router.get('/teams', async (req, res) => {
  try {
    const { league, country, query } = req.query;
    
    // Fetch teams directly from SportDB
    const teams = await fetchTeams({ 
      league, 
      country, 
      query 
    });
    
    res.json({
      status: 'success',
      data: teams,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('API Error - teams:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch teams',
      error: error.message
    });
  }
});

/**
 * @route GET /api/statistics/team/:id
 * @desc Get team statistics
 * @access Public
 */
router.get('/statistics/team/:id', (req, res) => {
  const { id } = req.params;
  
  // In production, this would fetch from database
  const stats = {
    id,
    name: id === '133602' ? 'Arsenal' : 'Team Name',
    matches: {
      played: 38,
      won: 22,
      drawn: 10,
      lost: 6
    },
    goals: {
      scored: 73,
      conceded: 39,
      difference: 34
    },
    form: ['W', 'W', 'D', 'L', 'W'],
    ranking: 4
  };
  
  res.json({
    status: 'success',
    data: {
      stats
    }
  });
});

/**
 * @route GET /api/matches
 * @desc Get matches
 * @access Public
 */
router.get('/matches', async (req, res) => {
  // Flag to track if response has been sent
  let hasResponded = false;
  
  // Wrap the entire function in a try-catch to prevent uncaught exceptions
  try {
    const {
      league,
      status,
      team,
      dateFrom,
      dateTo,
      sort,
      limit
    } = req.query;
    
    // Set a longer timeout for database operations
    const timeoutMs = parseInt(process.env.API_TIMEOUT) || 15000; // 15 seconds
    
    // Wrap the fetch operation in a Promise.race with a timeout
    try {
      // Create a promise that resolves after timeout
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Request timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      });
      
      // Fetch matches directly from SportDB
      const dataPromise = fetchMatches({
        league,
        status,
        team,
        dateFrom,
        dateTo,
        sort,
        limit
      });
      
      // Race the promises
      const matches = await Promise.race([dataPromise, timeoutPromise]);
      
      // Only send response if one hasn't been sent already
      if (!hasResponded) {
        hasResponded = true;
        return res.json({
          status: 'success',
          data: matches || [],
          timestamp: new Date().toISOString()
        });
      }
    } catch (error) {
      console.error('Error fetching matches:', error);
      
      // Only send error response if one hasn't been sent already
      if (!hasResponded) {
        hasResponded = true;
        
        // Handle timeout specifically
        if (error.message && error.message.includes('timed out')) {
          return res.status(408).json({
            status: 'error',
            message: 'Request timed out',
            error: 'SportDB API operation timed out'
          });
        }
        
        return res.status(500).json({
          status: 'error',
          message: 'Failed to fetch matches',
          error: error.message
        });
      }
    }
  } catch (outerError) {
    console.error('API Error - matches:', outerError);
    
    // Only send response if one hasn't been sent already
    if (!hasResponded) {
      return res.status(500).json({
        status: 'error',
        message: 'System error processing match request',
        error: outerError.message
      });
    }
  }
});

/**
 * @route GET /api/players
 * @desc Get players, optionally filtered
 * @access Public
 */
router.get('/players', async (req, res) => {
  try {
    const { team, player, query } = req.query;
    
    // Fetch players directly from SportDB 
    const players = await fetchPlayers({
      team,
      player,
      query
    });
    
    res.json({
      status: 'success',
      data: players,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('API Error - players:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch players',
      error: error.message
    });
  }
});

/**
 * @route GET /api/predictions/match/:id
 * @desc Get match predictions
 * @access Public
 */
router.get('/predictions/match/:id', (req, res) => {
  const { id } = req.params;
  
  // Simulate prediction data
  const prediction = {
    matchId: id,
    homeWinProbability: 0.45,
    drawProbability: 0.25,
    awayWinProbability: 0.30,
    predictedScore: {
      home: 2,
      away: 1
    },
    confidence: 0.78,
    factors: [
      'Home advantage',
      'Recent form',
      'Head-to-head record'
    ]
  };
  
  res.json({
    status: 'success',
    data: {
      prediction
    }
  });
});

/**
 * @route GET /api/standings
 * @desc Get league standings
 * @access Public
 */
router.get('/standings', (req, res) => {
  const { leagueId } = req.query;
  
  if (!leagueId) {
    return res.status(400).json({
      status: 'error',
      code: 'MISSING_LEAGUE_ID',
      message: 'League ID is required'
    });
  }
  
  // Simulate standings data
  const standings = [
    {
      position: 1,
      team: {
        id: '133615',
        name: 'Manchester City',
        logo: 'https://www.thesportsdb.com/images/media/team/badge/vuspxr1467462651.png'
      },
      played: 38,
      won: 28,
      drawn: 5,
      lost: 5,
      goalsFor: 94,
      goalsAgainst: 33,
      goalDifference: 61,
      points: 89
    },
    {
      position: 2,
      team: {
        id: '133600',
        name: 'Liverpool',
        logo: 'https://www.thesportsdb.com/images/media/team/badge/xzqdr21575276578.png'
      },
      played: 38,
      won: 27,
      drawn: 6,
      lost: 5,
      goalsFor: 87,
      goalsAgainst: 25,
      goalDifference: 62,
      points: 87
    },
    {
      position: 3,
      team: {
        id: '133602',
        name: 'Arsenal',
        logo: 'https://www.thesportsdb.com/images/media/team/badge/a1af2i1557005128.png'
      },
      played: 38,
      won: 22,
      drawn: 10,
      lost: 6,
      goalsFor: 73,
      goalsAgainst: 39,
      goalDifference: 34,
      points: 76
    }
  ];
  
  res.json({
    status: 'success',
    data: {
      standings
    }
  });
});

/**
 * @route GET /api/analytics/team/:id
 * @desc Get advanced team analytics
 * @access Premium
 */
router.get('/analytics/team/:id', (req, res) => {
  const { id } = req.params;
  
  // Simulate advanced analytics data
  const analytics = {
    teamId: id,
    xG: 56.23,
    xGA: 34.12,
    ppda: 9.45,
    possessionAvg: 58.2,
    passingAccuracy: 87.3,
    pressureSuccess: 29.8,
    defensiveActions: 45.2,
    counterAttackGoals: 8,
    setpieceEfficiency: 0.12,
    playerContributions: [
      {
        playerId: 'p1001',
        name: 'Bukayo Saka',
        xGContribution: 12.34,
        keyPasses: 56,
        progressiveRuns: 87
      },
      {
        playerId: 'p1002',
        name: 'Martin Ødegaard',
        xGContribution: 15.67,
        keyPasses: 78,
        progressiveRuns: 45
      }
    ]
  };
  
  res.json({
    status: 'success',
    data: {
      analytics
    }
  });
});

/**
 * @route GET /api/matches/live
 * @desc Get live matches
 * @access Public
 */
router.get('/matches/live', async (req, res) => {
  try {
    const { league, limit } = req.query;
    
    const matches = await getFromCacheOrDb(cache.matches, fetchMatches, {
      key: 'live_' + (league || 'all'),
      league,
      status: 'in_progress',
      sort: 'date',
      limit
    });
    
    res.json({
      status: 'success',
      data: matches,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('API Error - live matches:', error);
    
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch live matches',
      error: error.message
    });
  }
});

/**
 * @route GET /api/matches/:matchId
 * @desc Get match by ID
 * @access Public
 */
router.get('/matches/:matchId', async (req, res) => {
  try {
    const matchId = req.params.matchId;
    
    const db = await connectToMongo();
    const match = await db.collection('matches').findOne({ match_id: matchId });
    
    if (!match) {
      return res.status(404).json({
        status: 'error',
        message: 'Match not found'
      });
    }
    
    res.json({
      status: 'success',
      data: match,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('API Error - match by ID:', error);
    
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch match',
      error: error.message
    });
  }
});

/**
 * @route GET /api/players/:playerId
 * @desc Get player by ID
 * @access Public
 */
router.get('/players/:playerId', async (req, res) => {
  try {
    const playerId = req.params.playerId;
    
    const db = await connectToMongo();
    const player = await db.collection('players').findOne({ player_id: playerId });
    
    if (!player) {
      return res.status(404).json({
        status: 'error',
        message: 'Player not found'
      });
    }
    
    res.json({
      status: 'success',
      data: player,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('API Error - player by ID:', error);
    
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch player',
      error: error.message
    });
  }
});

/**
 * @route GET /api/players/:playerId/stats
 * @desc Get player stats
 * @access Public
 */
router.get('/players/:playerId/stats', async (req, res) => {
  try {
    const playerId = req.params.playerId;
    const { dateFrom, dateTo, limit } = req.query;
    
    const stats = await fetchPlayerStats({
      playerId,
      dateFrom,
      dateTo,
      limit
    });
    
    res.json({
      status: 'success',
      data: stats,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('API Error - player stats:', error);
    
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch player stats',
      error: error.message
    });
  }
});

/**
 * @route GET /api/teams/:teamId
 * @desc Get team by ID
 * @access Public
 */
router.get('/teams/:teamId', async (req, res) => {
  try {
    const teamId = req.params.teamId;
    
    const db = await connectToMongo();
    const team = await db.collection('teams').findOne({ api_id: teamId });
    
    if (!team) {
      return res.status(404).json({
        status: 'error',
        message: 'Team not found'
      });
    }
    
    res.json({
      status: 'success',
      data: team,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('API Error - team by ID:', error);
    
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch team',
      error: error.message
    });
  }
});

/**
 * @route GET /api/leagues/:leagueId
 * @desc Get league by ID
 * @access Public
 */
router.get('/leagues/:leagueId', async (req, res) => {
  try {
    const leagueId = req.params.leagueId;
    
    const db = await connectToMongo();
    const league = await db.collection('leagues').findOne({ api_id: leagueId });
    
    if (!league) {
      return res.status(404).json({
        status: 'error',
        message: 'League not found'
      });
    }
    
    res.json({
      status: 'success',
      data: league,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('API Error - league by ID:', error);
    
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch league',
      error: error.message
    });
  }
});

/**
 * @route GET /api/status/import
 * @desc Get data import status
 * @access Public
 */
router.get('/status/import', async (req, res) => {
  try {
    const db = await connectToMongo();
    const status = await db.collection('system_config').findOne({ config_key: 'data_import' });
    
    if (!status) {
      return res.status(404).json({
        status: 'error',
        message: 'Import status not found'
      });
    }
    
    res.json({
      status: 'success',
      data: status,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('API Error - import status:', error);
    
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch import status',
      error: error.message
    });
  }
});

/**
 * @route POST /api/predict/single
 * @desc Process a single factor prediction
 * @access Public
 */
predictionsRouter.post('/single', async (req, res) => {
  try {
    const { factor, league, include_supporting_data, use_advanced_model } = req.body;
    
    if (!factor) {
      return res.status(400).json({
        status: 'error',
        code: 'MISSING_FACTOR',
        message: 'Factor is required for prediction'
      });
    }
    
    // Determine which prediction model to use
    const useAdvancedModel = use_advanced_model === true || process.env.USE_ADVANCED_MODEL === 'true';
    const predictionScript = useAdvancedModel ? 'advanced_prediction.py' : 'basic_prediction.py';
    
    // Get additional context data for the prediction
    let contextData = null;
    
    if (league) {
      try {
        // Get real data for the prediction context
        // This context helps the prediction model understand better
        const leagueInfo = await fetchFromSportDB('search_all_leagues.php', { s: league });
        const matchData = await fetchFromSportDB('eventslast.php', { id: leagueInfo?.leagues[0]?.idLeague });
        
        contextData = {
          league: leagueInfo?.leagues[0] || { strLeague: league },
          recentMatches: matchData?.results || []
        };
      } catch (contextError) {
        console.warn(`Failed to fetch prediction context: ${contextError.message}`);
      }
    }
    
    // Try to use Python prediction API with real data
    try {
      const { spawn } = require('child_process');
      
      // Prepare input data with real context from SportDB
      const inputData = JSON.stringify({
        factor,
        league,
        context: contextData,
        useAdvancedModel
      });
      
      const predictProcess = spawn('python', [
        `scripts/${predictionScript}`, 
        factor, 
        league || 'null'
      ]);
      
      // If we have context data, pass it to stdin
      if (contextData) {
        predictProcess.stdin.write(inputData);
        predictProcess.stdin.end();
      }
      
      let predictOutput = '';
      let predictError = '';
      
      predictProcess.stdout.on('data', (data) => {
        predictOutput += data.toString();
      });
      
      predictProcess.stderr.on('data', (data) => {
        predictError += data.toString();
      });
      
      // Wait for process to complete
      const exitCode = await new Promise((resolve) => {
        predictProcess.on('close', (code) => {
          resolve(code);
        });
      });
      
      if (exitCode !== 0) {
        console.error(`Python prediction process exited with code ${exitCode}`);
        console.error(`Error: ${predictError}`);
        throw new Error(`Prediction failed with code ${exitCode}`);
      }
      
      // Parse the prediction result
      const predictionResult = JSON.parse(predictOutput);
      
      return res.json({
        status: 'success',
        requestId: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        model: useAdvancedModel ? 'advanced-ml' : 'basic',
        data: {
          factor,
          league: league || null,
          ...predictionResult
        }
      });
    } catch (pythonError) {
      console.warn(`Python prediction failed, using fallback: ${pythonError.message}`);
      
      // Fallback to basic prediction without Python
      const prediction = {
        probability: 0.75, // Between 0 and 1
        confidence: 0.80, // Between 0 and 1
        prediction: factor.includes('more') ? 'likely' : 'unlikely', // Simple heuristic
        model: 'fallback-v1.0'
      };
      
      if (include_supporting_data) {
        prediction.supporting_data = {
          historical_matches: 24,
          statistical_significance: 'medium',
          model_version: 'fallback-v1.0'
        };
      }
      
      return res.json({
        status: 'success',
        requestId: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        data: {
          factor,
          league: league || null,
          ...prediction
        }
      });
    }
  } catch (error) {
    console.error('Prediction error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to generate prediction',
      error: error.message
    });
  }
});

/**
 * @route POST /api/predict/multi
 * @desc Process a multi-factor prediction
 * @access Public
 */
predictionsRouter.post('/multi', async (req, res) => {
  try {
    const { factors, league, max_factors } = req.body;
    
    if (!factors || !Array.isArray(factors) || factors.length === 0) {
      return res.status(400).json({
        status: 'error',
        code: 'INVALID_FACTORS',
        message: 'Factors must be a non-empty array'
      });
    }
    
    // Check if too many factors
    const maxAllowedFactors = max_factors || 5;
    if (factors.length > maxAllowedFactors) {
      return res.status(400).json({
        status: 'error',
        code: 'TOO_MANY_FACTORS',
        message: `Maximum of ${maxAllowedFactors} factors allowed`
      });
    }
    
    // Generate individual predictions for each factor
    const factorPredictions = factors.map(factor => ({
      factor: typeof factor === 'string' ? factor : factor.factor,
      probability: typeof factor === 'string' ? 0.75 : (factor.probability || 0.75),
      contribution: (1 / factors.length) * (typeof factor === 'string' ? 1 : (factor.weight || 1))
    }));
    
    // Calculate joint probability (simplified)
    // In real implementation, this would use correlation matrix and more sophisticated calculation
    const jointProbability = 0.75; // Simplified
    
    // Generate multi-factor prediction response
    const prediction = {
      requestId: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      factors: factors.map(f => typeof f === 'string' ? f : f.factor),
      league: league || null,
      result: {
        probability: jointProbability,
        confidence: 0.80,
        factors: factorPredictions,
        dependencies: [
          { factor1: 0, factor2: 1, correlation: 0.35 },
          { factor1: 1, factor2: 2, correlation: 0.22 }
        ]
      }
    };
    
    // Log the prediction for analytics purposes
    console.log(`Multi-factor prediction requested with ${factors.length} factors, league: ${league || 'N/A'}`);
    
    res.json({
      status: 'success',
      data: prediction
    });
  } catch (error) {
    console.error('API Error - predict/multi:', error);
    
    res.status(500).json({
      status: 'error',
      message: 'Failed to generate multi-factor prediction',
      error: error.message
    });
  }
});

/**
 * Error handling for API
 */
router.use((err, req, res, next) => {
  console.error('API Error:', err);
  
  // Generate unique error ID for tracing
  const errorId = crypto.randomBytes(8).toString('hex');
  
  res.status(500).json({
    status: 'error',
    code: 'SERVER_ERROR',
    message: 'An internal server error occurred',
    errorId
  });
});

// Close MongoDB connection when the process ends
process.on('SIGINT', async () => {
  await client.close();
  console.log('MongoDB connection closed through app termination');
  process.exit(0);
});

// Import revolutionary engines
const { getPredictionEngine } = require('../utils/prediction-engine');
const { getPlayerImpactEngine } = require('../utils/player-impact');
const { getNarrativeEngine } = require('../utils/narrative-analytics');

/**
 * @api {get} /api/predictions Get all predictions
 * @apiDescription Get predictions for all upcoming matches
 * @apiGroup Revolutionary
 */
router.get('/predictions', async (req, res) => {
  try {
    const predictionEngine = getPredictionEngine();
    const predictions = predictionEngine.getPredictions();
    
    // Flatten predictions by league into a single array
    const allPredictions = Object.values(predictions).flat();
    
    res.json({
      success: true,
      count: allPredictions.length,
      data: allPredictions
    });
  } catch (error) {
    console.error('Error fetching predictions:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch predictions' });
  }
});

/**
 * @api {get} /api/predictions/:matchId Get match prediction
 * @apiDescription Get prediction for a specific match
 * @apiGroup Revolutionary
 */
router.get('/predictions/:matchId', async (req, res) => {
  try {
    const { matchId } = req.params;
    const predictionEngine = getPredictionEngine();
    const prediction = predictionEngine.getMatchPrediction(matchId);
    
    if (!prediction) {
      return res.status(404).json({
        success: false,
        error: 'Prediction not found'
      });
    }
    
    res.json({
      success: true,
      data: prediction
    });
  } catch (error) {
    console.error(`Error fetching prediction for match ${req.params.matchId}:`, error);
    res.status(500).json({ success: false, error: 'Failed to fetch prediction' });
  }
});

/**
 * @api {get} /api/predictions/league/:leagueId Get league predictions
 * @apiDescription Get predictions for all matches in a league
 * @apiGroup Revolutionary
 */
router.get('/predictions/league/:leagueId', async (req, res) => {
  try {
    const { leagueId } = req.params;
    const predictionEngine = getPredictionEngine();
    const predictions = predictionEngine.getLeaguePredictions(leagueId);
    
    res.json({
      success: true,
      count: predictions.length,
      data: predictions
    });
  } catch (error) {
    console.error(`Error fetching predictions for league ${req.params.leagueId}:`, error);
    res.status(500).json({ success: false, error: 'Failed to fetch league predictions' });
  }
});

/**
 * @api {get} /api/player-impacts Get all player impacts
 * @apiDescription Get impact metrics for all players
 * @apiGroup Revolutionary
 */
router.get('/player-impacts', async (req, res) => {
  try {
    const playerImpactEngine = getPlayerImpactEngine();
    const impacts = playerImpactEngine.getAllPlayerImpacts();
    
    res.json({
      success: true,
      count: impacts.length,
      data: impacts
    });
  } catch (error) {
    console.error('Error fetching player impacts:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch player impacts' });
  }
});

/**
 * @api {get} /api/player-impacts/:playerId Get player impact
 * @apiDescription Get impact metrics for a specific player
 * @apiGroup Revolutionary
 */
router.get('/player-impacts/:playerId', async (req, res) => {
  try {
    const { playerId } = req.params;
    const playerImpactEngine = getPlayerImpactEngine();
    const impact = playerImpactEngine.getPlayerImpact(playerId);
    
    if (!impact) {
      return res.status(404).json({
        success: false,
        error: 'Player impact metrics not found'
      });
    }
    
    res.json({
      success: true,
      data: impact
    });
  } catch (error) {
    console.error(`Error fetching impact metrics for player ${req.params.playerId}:`, error);
    res.status(500).json({ success: false, error: 'Failed to fetch player impact metrics' });
  }
});

/**
 * @api {get} /api/player-impacts/top/:limit Get top players by impact
 * @apiDescription Get top players ranked by overall impact
 * @apiGroup Revolutionary
 */
router.get('/player-impacts/top/:limit?', async (req, res) => {
  try {
    const limit = parseInt(req.params.limit) || 10;
    const playerImpactEngine = getPlayerImpactEngine();
    const topPlayers = playerImpactEngine.getTopPlayersByImpact(limit);
    
    res.json({
      success: true,
      count: topPlayers.length,
      data: topPlayers
    });
  } catch (error) {
    console.error('Error fetching top players by impact:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch top players' });
  }
});

/**
 * @api {get} /api/narratives Get all match narratives
 * @apiDescription Get narrative analytics for all upcoming matches
 * @apiGroup Revolutionary
 */
router.get('/narratives', async (req, res) => {
  try {
    const narrativeEngine = getNarrativeEngine();
    const narratives = narrativeEngine.getAllNarratives();
    
    res.json({
      success: true,
      count: narratives.length,
      data: narratives
    });
  } catch (error) {
    console.error('Error fetching match narratives:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch match narratives' });
  }
});

/**
 * @api {get} /api/narratives/:matchId Get match narrative
 * @apiDescription Get narrative analytics for a specific match
 * @apiGroup Revolutionary
 */
router.get('/narratives/:matchId', async (req, res) => {
  try {
    const { matchId } = req.params;
    const narrativeEngine = getNarrativeEngine();
    const narrative = narrativeEngine.getMatchNarrative(matchId);
    
    if (!narrative) {
      return res.status(404).json({
        success: false,
        error: 'Match narrative not found'
      });
    }
    
    res.json({
      success: true,
      data: narrative
    });
  } catch (error) {
    console.error(`Error fetching narrative for match ${req.params.matchId}:`, error);
    res.status(500).json({ success: false, error: 'Failed to fetch match narrative' });
  }
});

/**
 * @api {get} /api/narratives/league/:leagueId Get league narratives
 * @apiDescription Get narrative analytics for all matches in a league
 * @apiGroup Revolutionary
 */
router.get('/narratives/league/:leagueId', async (req, res) => {
  try {
    const { leagueId } = req.params;
    const narrativeEngine = getNarrativeEngine();
    const narratives = narrativeEngine.getLeagueNarratives(leagueId);
    
    res.json({
      success: true,
      count: narratives.length,
      data: narratives
    });
  } catch (error) {
    console.error(`Error fetching narratives for league ${req.params.leagueId}:`, error);
    res.status(500).json({ success: false, error: 'Failed to fetch league narratives' });
  }
});

// Import the custom prediction engine
const { getCustomPredictionEngine } = require('../utils/custom-prediction');

/**
 * @api {post} /api/custom-prediction Generate single factor prediction
 * @apiDescription Generate a prediction using ANY custom factor
 * @apiGroup Revolutionary
 */
router.post('/custom-prediction', async (req, res) => {
  try {
    const { factor, sport, league, teams } = req.body;
    
    if (!factor) {
      return res.status(400).json({
        success: false,
        error: 'Custom factor is required'
      });
    }
    
    const customPredictionEngine = getCustomPredictionEngine();
    
    // Build context from request
    const context = {
      sport: sport || 'general',
      league: league || 'all',
      teams: teams || [],
      date: new Date().toISOString()
    };
    
    const prediction = await customPredictionEngine.predict(factor, context);
    
    res.json({
      success: true,
      data: prediction
    });
  } catch (error) {
    console.error(`Error generating custom prediction: ${error.message}`);
    res.status(500).json({ success: false, error: 'Failed to generate custom prediction' });
  }
});

/**
 * @api {post} /api/custom-prediction/multi Generate multi-factor prediction
 * @apiDescription Generate a prediction using up to 5 custom factors from ANY sport/league/team
 * @apiGroup Revolutionary
 */
router.post('/custom-prediction/multi', async (req, res) => {
  try {
    const { factors, sport, league, teams, weights } = req.body;
    
    if (!factors || !Array.isArray(factors) || factors.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Custom factors array is required'
      });
    }
    
    const customPredictionEngine = getCustomPredictionEngine();
    
    // Check maximum factors
    if (factors.length > customPredictionEngine.config.maxCustomFactors) {
      return res.status(400).json({
        success: false,
        error: `Maximum ${customPredictionEngine.config.maxCustomFactors} factors allowed`
      });
    }
    
    // Build context from request
    const context = {
      sport: sport || 'general',
      league: league || 'all',
      teams: teams || [],
      date: new Date().toISOString()
    };
    
    // Options with optional weights
    const options = {};
    if (weights && Array.isArray(weights) && weights.length === factors.length) {
      options.weights = weights;
    }
    
    const prediction = await customPredictionEngine.predictMultiple(factors, context, options);
    
    res.json({
      success: true,
      data: prediction
    });
  } catch (error) {
    console.error(`Error generating multi-factor prediction: ${error.message}`);
    res.status(500).json({ success: false, error: 'Failed to generate multi-factor prediction' });
  }
});

module.exports = router; 