/**
 * Live Games Manager
 * 
 * This module manages the fetching and caching of live games data from TheSportsDB API.
 * It provides real-time game updates and ensures efficient data retrieval.
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const EventEmitter = require('events');

class LiveGamesManager extends EventEmitter {
  constructor(config = {}) {
    super();
    
    // Configuration with defaults
    this.config = {
      apiKey: process.env.THESPORTSDB_API_KEY || process.env.SPORTS_DB_API_KEY || '447279',
      updateInterval: process.env.LIVE_GAMES_UPDATE_INTERVAL || 60000, // 1 minute by default
      logEnabled: process.env.LIVE_GAMES_LOGGING !== 'false',
      cacheTTL: process.env.LIVE_GAMES_CACHE_TTL || 30000, // 30 seconds
      supportedLeagues: [
        { id: '4387', name: 'NBA', sport: 'basketball' },
        { id: '4391', name: 'NFL', sport: 'football' },
        { id: '4424', name: 'MLB', sport: 'baseball' },
        { id: '4380', name: 'NHL', sport: 'hockey' },
        { id: '4328', name: 'Premier League', sport: 'soccer' },
        { id: '4335', name: 'La Liga', sport: 'soccer' },
        { id: '4331', name: 'Bundesliga', sport: 'soccer' },
        { id: '4332', name: 'Serie A', sport: 'soccer' }
      ],
      ...config
    };
    
    // API endpoint
    this.baseUrl = `https://www.thesportsdb.com/api/v1/json/${this.config.apiKey}`;
    
    // State
    this.liveGames = {};
    this.lastUpdated = {};
    this.updateTimers = {};
    this.isRunning = false;
    this.updateCount = 0;
    
    // Ensure logs directory exists
    this.logDir = path.join(process.cwd(), 'logs');
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
    
    // Create log stream
    if (this.config.logEnabled) {
      this.logStream = fs.createWriteStream(
        path.join(this.logDir, 'live-games.log'),
        { flags: 'a' }
      );
    }
    
    // Bind methods
    this.start = this.start.bind(this);
    this.stop = this.stop.bind(this);
    this.fetchLiveGames = this.fetchLiveGames.bind(this);
    this.getLiveGames = this.getLiveGames.bind(this);
    this.getLiveGamesByLeague = this.getLiveGamesByLeague.bind(this);
  }
  
  /**
   * Start the live games update service
   */
  start() {
    if (this.isRunning) {
      this.log('Live games manager is already running');
      return;
    }
    
    this.log('Starting live games manager...');
    this.isRunning = true;
    
    // Initial fetch for all supported leagues
    this.fetchAllLeagues();
    
    // Set up recurring updates
    this.updateTimer = setInterval(() => {
      this.fetchAllLeagues();
    }, this.config.updateInterval);
    
    this.log('Live games manager started successfully');
    this.emit('started');
  }
  
  /**
   * Stop the live games update service
   */
  stop() {
    if (!this.isRunning) {
      this.log('Live games manager is not running');
      return;
    }
    
    this.log('Stopping live games manager...');
    
    // Clear the main update timer
    if (this.updateTimer) {
      clearInterval(this.updateTimer);
      this.updateTimer = null;
    }
    
    // Clear any league-specific timers
    Object.values(this.updateTimers).forEach(timer => {
      if (timer) clearInterval(timer);
    });
    this.updateTimers = {};
    
    this.isRunning = false;
    this.log('Live games manager stopped');
    this.emit('stopped');
    
    // Close log stream
    if (this.logStream) {
      this.logStream.end();
      this.logStream = null;
    }
  }
  
  /**
   * Fetch live games for all supported leagues
   * @private
   */
  async fetchAllLeagues() {
    this.log('Fetching live games for all supported leagues...');
    
    const promises = this.config.supportedLeagues.map(league => 
      this.fetchLiveGames(league.id)
    );
    
    try {
      await Promise.all(promises);
      this.updateCount++;
      this.log(`All leagues updated (update #${this.updateCount})`);
      this.emit('allLeaguesUpdated', this.getLiveGames());
    } catch (error) {
      this.log(`Error updating all leagues: ${error.message}`, 'ERROR');
    }
  }
  
  /**
   * Fetch live games for a specific league
   * @param {string} leagueId - ID of the league to fetch
   * @returns {Promise<Array>} - Array of live games
   */
  async fetchLiveGames(leagueId) {
    // Skip if we recently updated this league
    const now = Date.now();
    if (
      this.lastUpdated[leagueId] && 
      now - this.lastUpdated[leagueId] < this.config.cacheTTL
    ) {
      return this.liveGames[leagueId] || [];
    }
    
    try {
      const league = this.config.supportedLeagues.find(l => l.id === leagueId);
      if (!league) {
        throw new Error(`League with ID ${leagueId} is not supported`);
      }
      
      this.log(`Fetching live games for ${league.name} (${leagueId})...`);
      
      // Due to API limitations in free tier, use eventsnextleague endpoint instead of eventslive
      let allGames = [];
      
      // Try both endpoints for fallback capability
      try {
        // First try to get next 5 events for the league (more reliable with free tier)
        const nextGamesResponse = await axios.get(`${this.baseUrl}/eventsnextleague.php?id=${leagueId}`);
        
        if (nextGamesResponse.data && nextGamesResponse.data.events) {
          allGames = nextGamesResponse.data.events;
          this.log(`Found ${allGames.length} upcoming games for ${league.name}`);
        }
      } catch (err) {
        this.log(`Error fetching upcoming games: ${err.message}`, 'WARN');
      }
      
      // If no games found, try the eventspastleague endpoint to get recent games
      if (allGames.length === 0) {
        try {
          const pastGamesResponse = await axios.get(`${this.baseUrl}/eventspastleague.php?id=${leagueId}`);
          
          if (pastGamesResponse.data && pastGamesResponse.data.events) {
            // Get only the most recent 5 games
            allGames = pastGamesResponse.data.events.slice(0, 5);
            this.log(`Found ${allGames.length} recent games for ${league.name}`);
          }
        } catch (err) {
          this.log(`Error fetching past games: ${err.message}`, 'WARN');
        }
      }
      
      // Store the games
      const formattedGames = allGames.map(game => this.formatGame(game));
      this.liveGames[leagueId] = formattedGames;
      this.lastUpdated[leagueId] = now;
      
      // Log and emit events
      this.log(`Processed ${formattedGames.length} games for ${league.name}`);
      this.emit('leagueUpdated', leagueId, formattedGames);
      
      return formattedGames;
    } catch (error) {
      this.log(`Error fetching games for league ${leagueId}: ${error.message}`, 'ERROR');
      // Return cached data if available
      return this.liveGames[leagueId] || [];
    }
  }
  
  /**
   * Format a game object from the API
   * @param {Object} game - Raw game data from API
   * @returns {Object} - Formatted game object
   * @private
   */
  formatGame(game) {
    return {
      id: game.idEvent,
      league: {
        id: game.idLeague,
        name: game.strLeague
      },
      date: game.dateEvent,
      time: game.strTime,
      status: game.strStatus || 'LIVE',
      homeTeam: {
        id: game.idHomeTeam,
        name: game.strHomeTeam,
        score: parseInt(game.intHomeScore) || 0
      },
      awayTeam: {
        id: game.idAwayTeam,
        name: game.strAwayTeam,
        score: parseInt(game.intAwayScore) || 0
      },
      venue: game.strVenue,
      round: game.strRound,
      season: game.strSeason,
      lastUpdated: new Date().toISOString()
    };
  }
  
  /**
   * Get all live games across all leagues
   * @returns {Object} - Object with league IDs as keys and arrays of games as values
   */
  getLiveGames() {
    return this.liveGames;
  }
  
  /**
   * Get live games for a specific league
   * @param {string} leagueId - ID of the league
   * @returns {Array} - Array of live games for the league
   */
  getLiveGamesByLeague(leagueId) {
    return this.liveGames[leagueId] || [];
  }
  
  /**
   * Get the total count of live games across all leagues
   * @returns {number} - Total number of live games
   */
  getTotalLiveGamesCount() {
    return Object.values(this.liveGames)
      .reduce((total, games) => total + games.length, 0);
  }
  
  /**
   * Log a message
   * @param {string} message - Message to log
   * @param {string} level - Log level
   * @private
   */
  log(message, level = 'INFO') {
    if (!this.config.logEnabled) return;
    
    const timestamp = new Date().toISOString();
    const formattedMessage = `[${timestamp}] [${level}] ${message}`;
    
    // Output to console
    console.log(formattedMessage);
    
    // Write to log file if stream exists
    if (this.logStream) {
      this.logStream.write(formattedMessage + '\n');
    }
  }
}

// Singleton instance
let instance = null;

/**
 * Get the LiveGamesManager instance
 * @param {Object} config - Optional configuration
 * @returns {LiveGamesManager} - LiveGamesManager instance
 */
function getLiveGamesManager(config = {}) {
  if (!instance) {
    instance = new LiveGamesManager(config);
  }
  return instance;
}

module.exports = {
  LiveGamesManager,
  getLiveGamesManager
}; 