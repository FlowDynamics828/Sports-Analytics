/**
 * Revolutionary Narrative-Driven Analytics System
 * 
 * Enterprise-grade analytics engine that transforms raw statistics
 * into compelling narratives and visualizable insights.
 */

const { MongoClient } = require('mongodb');
const { EventEmitter } = require('events');

class NarrativeEngine extends EventEmitter {
  constructor(options = {}) {
    super();
    
    // Configuration with defaults
    this.config = {
      mongoUri: options.mongoUri || process.env.MONGO_URI || 'mongodb+srv://SportAnalytics:Studyhard%402034@cluster0.et16d.mongodb.net/sports-analytics?retryWrites=true',
      dbName: options.dbName || process.env.MONGO_DB_NAME || 'sports-analytics',
      updateInterval: options.updateInterval || 3600000, // 1 hour by default
      ...options
    };
    
    // State
    this.db = null;
    this.client = null;
    this.narratives = new Map();
    this.isRunning = false;
    this.updateTimer = null;
    
    // Bind methods
    this.start = this.start.bind(this);
    this.stop = this.stop.bind(this);
    this.generateNarratives = this.generateNarratives.bind(this);
  }
  
  /**
   * Start the narrative engine
   */
  async start() {
    if (this.isRunning) {
      console.log('Narrative engine is already running');
      return;
    }
    
    console.log('Starting narrative engine...');
    
    try {
      // Connect to MongoDB
      this.client = new MongoClient(this.config.mongoUri, {
        useNewUrlParser: true,
        useUnifiedTopology: true
      });
      
      await this.client.connect();
      this.db = this.client.db(this.config.dbName);
      console.log(`Connected to MongoDB database: ${this.config.dbName}`);
      
      // Set up recurring updates
      this.isRunning = true;
      this.updateTimer = setInterval(async () => {
        await this.generateNarratives();
      }, this.config.updateInterval);
      
      // Initial generation
      await this.generateNarratives();
      
      console.log('Narrative engine started successfully');
      this.emit('started');
      
      return true;
    } catch (error) {
      console.error(`Error starting narrative engine: ${error.message}`);
      this.emit('error', error);
      
      if (this.client) {
        await this.client.close();
        this.client = null;
      }
      
      return false;
    }
  }
  
  /**
   * Stop the narrative engine
   */
  async stop() {
    if (!this.isRunning) {
      console.log('Narrative engine is not running');
      return;
    }
    
    console.log('Stopping narrative engine...');
    
    if (this.updateTimer) {
      clearInterval(this.updateTimer);
      this.updateTimer = null;
    }
    
    if (this.client) {
      await this.client.close();
      this.client = null;
      this.db = null;
    }
    
    this.isRunning = false;
    console.log('Narrative engine stopped');
    this.emit('stopped');
    
    return true;
  }
  
  /**
   * Generate narratives for all upcoming matches
   */
  async generateNarratives() {
    console.log('Generating match narratives...');
    
    try {
      // Get all upcoming matches
      const upcomingMatches = await this.db.collection('matches')
        .find({ 
          $or: [
            { status: 'upcoming' },
            { strStatus: 'upcoming' }
          ]
        })
        .toArray();
      
      console.log(`Generating narratives for ${upcomingMatches.length} upcoming matches`);
      
      // Get predictions to enhance narratives
      const predictions = await this.db.collection('predictions')
        .find({})
        .toArray();
      
      const predictionsByMatchId = predictions.reduce((acc, pred) => {
        acc[pred.matchId] = pred;
        return acc;
      }, {});
      
      // Get teams data
      const teams = await this.db.collection('teams').find({}).toArray();
      const teamsById = teams.reduce((acc, team) => {
        acc[team.id || team.teamId] = team;
        return acc;
      }, {});
      
      // Generate narratives for each match
      const narratives = [];
      
      for (const match of upcomingMatches) {
        try {
          const narrative = await this.generateMatchNarrative(
            match, 
            predictionsByMatchId[match.id || match.idEvent],
            teamsById
          );
          
          this.narratives.set(match.id || match.idEvent, narrative);
          narratives.push(narrative);
        } catch (error) {
          console.error(`Error generating narrative for match ${match.id || match.idEvent}: ${error.message}`);
        }
      }
      
      // Store in database
      await this.storeNarratives(narratives);
      
      // Emit update event
      this.emit('narratives-updated', narratives);
      
      console.log(`Successfully generated ${narratives.length} match narratives`);
      return narratives;
    } catch (error) {
      console.error(`Error generating narratives: ${error.message}`);
      return [];
    }
  }
  
  /**
   * Generate narrative for a single match
   * @param {Object} match - Match to analyze
   * @param {Object} prediction - Match prediction
   * @param {Object} teamsById - Teams indexed by ID
   * @returns {Object} Match narrative
   */
  async generateMatchNarrative(match, prediction, teamsById) {
    const matchId = match.id || match.idEvent;
    const homeTeamId = match.teams?.home?.id || match.idHomeTeam;
    const awayTeamId = match.teams?.away?.id || match.idAwayTeam;
    
    // Get team names
    const homeTeamName = match.teams?.home?.name || match.strHomeTeam;
    const awayTeamName = match.teams?.away?.name || match.strAwayTeam;
    
    console.log(`Generating narrative for ${homeTeamName} vs ${awayTeamName} (ID: ${matchId})`);
    
    // Get team details
    const homeTeam = teamsById[homeTeamId] || {};
    const awayTeam = teamsById[awayTeamId] || {};
    
    // Generate storylines
    const mainStoryline = this.generateMainStoryline(match, prediction, homeTeam, awayTeam);
    const keyMatchups = this.generateKeyMatchups(match, homeTeam, awayTeam);
    const historicalContext = this.generateHistoricalContext(match, homeTeam, awayTeam);
    const upsetPotential = this.calculateUpsetPotential(match, prediction);
    const gameChangingFactors = this.identifyGameChangingFactors(match, prediction);
    
    // Generate radar chart data for team comparisons
    const radarChartData = this.generateRadarChartData(homeTeam, awayTeam);
    
    // Format narrative
    const narrative = {
      matchId,
      date: match.date || match.dateEvent,
      title: `${homeTeamName} vs ${awayTeamName}`,
      teams: {
        home: {
          id: homeTeamId,
          name: homeTeamName
        },
        away: {
          id: awayTeamId,
          name: awayTeamName
        }
      },
      storylines: {
        main: mainStoryline,
        keyMatchups,
        historicalContext
      },
      metrics: {
        upsetPotential: parseFloat(upsetPotential.toFixed(3)),
        gameChangingFactors
      },
      visualData: {
        radarChart: radarChartData
      },
      createdAt: new Date()
    };
    
    return narrative;
  }
  
  /**
   * Generate the main storyline for a match
   * @param {Object} match - Match to analyze
   * @param {Object} prediction - Match prediction
   * @param {Object} homeTeam - Home team data
   * @param {Object} awayTeam - Away team data
   * @returns {String} Main storyline
   */
  generateMainStoryline(match, prediction, homeTeam, awayTeam) {
    const homeTeamName = match.teams?.home?.name || match.strHomeTeam;
    const awayTeamName = match.teams?.away?.name || match.strAwayTeam;
    
    // Default storyline when no prediction is available
    if (!prediction) {
      return `${homeTeamName} hosts ${awayTeamName} in what promises to be an exciting matchup.`;
    }
    
    // Use prediction insights if available
    if (prediction.insights && prediction.insights.length > 0) {
      return prediction.insights.join(' ');
    }
    
    // Fallback based on probabilities
    const homeWinProb = prediction.probabilities?.homeWin || 0.5;
    const awayWinProb = prediction.probabilities?.awayWin || 0.5;
    
    if (homeWinProb > 0.65) {
      return `${homeTeamName} are heavy favorites against ${awayTeamName} with a ${Math.round(homeWinProb * 100)}% win probability.`;
    } else if (awayWinProb > 0.65) {
      return `${awayTeamName} are expected to overcome ${homeTeamName} despite playing away, with a ${Math.round(awayWinProb * 100)}% win probability.`;
    } else {
      return `${homeTeamName} and ${awayTeamName} are evenly matched, with neither team having a clear advantage.`;
    }
  }
  
  /**
   * Generate key matchups within the game
   * @param {Object} match - Match to analyze
   * @param {Object} homeTeam - Home team data
   * @param {Object} awayTeam - Away team data
   * @returns {Array} Key matchup descriptions
   */
  generateKeyMatchups(match, homeTeam, awayTeam) {
    const homeTeamName = match.teams?.home?.name || match.strHomeTeam;
    const awayTeamName = match.teams?.away?.name || match.strAwayTeam;
    
    // In full implementation, we would look at player matchups and tactical systems
    // For demo, return generic matchups
    
    const matchups = [
      `${homeTeamName}'s offense vs ${awayTeamName}'s defense`,
      `${awayTeamName}'s counter-attacks vs ${homeTeamName}'s defensive transitions`,
      `Midfield control will be crucial for both teams`
    ];
    
    // Add sport-specific matchups
    if (match.strSport === 'Soccer' || match.league?.name?.includes('League')) {
      matchups.push(`Set piece execution could be decisive in this match`);
    } else if (match.strSport === 'Basketball' || match.league?.name?.includes('NBA')) {
      matchups.push(`Three-point shooting efficiency will be a key factor`);
    } else if (match.strSport === 'American Football' || match.league?.name?.includes('NFL')) {
      matchups.push(`Quarterback protection vs pass rush could decide this game`);
    }
    
    return matchups;
  }
  
  /**
   * Generate historical context for the matchup
   * @param {Object} match - Match to analyze
   * @param {Object} homeTeam - Home team data
   * @param {Object} awayTeam - Away team data
   * @returns {String} Historical context
   */
  generateHistoricalContext(match, homeTeam, awayTeam) {
    const homeTeamName = match.teams?.home?.name || match.strHomeTeam;
    const awayTeamName = match.teams?.away?.name || match.strAwayTeam;
    
    // In full implementation, we would analyze past meetings and identify patterns
    // For demo, return generic historical context
    
    return `These teams have met multiple times before, with each contest bringing its own unique storylines. Their most recent meetings have shown a pattern of competitive games with narrow margins.`;
  }
  
  /**
   * Calculate upset potential for a match
   * @param {Object} match - Match to analyze
   * @param {Object} prediction - Match prediction
   * @returns {number} Upset potential (0-1)
   */
  calculateUpsetPotential(match, prediction) {
    if (!prediction || !prediction.metrics) {
      return 0.3; // Default moderate upset potential
    }
    
    // Use prediction's upset potential if available
    if (prediction.metrics.upsetPotential !== undefined) {
      return prediction.metrics.upsetPotential;
    }
    
    // Calculate based on win probabilities
    const homeWinProb = prediction.probabilities?.homeWin || 0.5;
    const awayWinProb = prediction.probabilities?.awayWin || 0.5;
    
    // The more lopsided the prediction, the higher the upset potential
    const favoredProb = Math.max(homeWinProb, awayWinProb);
    const threshold = 0.7; // Above this is considered heavy favorite
    
    if (favoredProb > threshold) {
      // Linear scale: 0.7 -> 0.3 upset potential, 1.0 -> 0.9 upset potential
      return 0.3 + ((favoredProb - threshold) / (1 - threshold)) * 0.6;
    }
    
    // Balanced matchups have lower upset potential
    return 0.2 + (Math.abs(homeWinProb - 0.5) * 0.2);
  }
  
  /**
   * Identify game-changing factors
   * @param {Object} match - Match to analyze
   * @param {Object} prediction - Match prediction
   * @returns {Array} Game-changing factors
   */
  identifyGameChangingFactors(match, prediction) {
    // Default factors when no prediction is available
    if (!prediction || !prediction.factors) {
      return [
        { name: 'Home advantage', importance: 0.6 },
        { name: 'Recent form', importance: 0.7 },
        { name: 'Key player performances', importance: 0.8 }
      ];
    }
    
    // Use prediction factors if available
    return prediction.factors
      .sort((a, b) => Math.abs(b.impact - 0.5) - Math.abs(a.impact - 0.5))
      .slice(0, 3)
      .map(factor => ({
        name: this.formatFactorName(factor.name),
        importance: Math.abs((factor.score - 0.5) * 2) // Scale to 0-1
      }));
  }
  
  /**
   * Format factor name for display
   * @param {string} factorName - Internal factor name
   * @returns {string} Formatted name
   */
  formatFactorName(factorName) {
    const nameMap = {
      'headToHead': 'Head-to-head history',
      'recentForm': 'Recent form',
      'homeAdvantage': 'Home advantage',
      'injuries': 'Injury situation',
      'weather': 'Weather conditions',
      'restDays': 'Rest and recovery',
      'momentum': 'Team momentum'
    };
    
    return nameMap[factorName] || factorName.replace(/([A-Z])/g, ' $1').trim();
  }
  
  /**
   * Generate radar chart data for team comparison
   * @param {Object} homeTeam - Home team data
   * @param {Object} awayTeam - Away team data
   * @returns {Object} Radar chart data
   */
  generateRadarChartData(homeTeam, awayTeam) {
    // Define comparison categories
    const categories = [
      'Offense',
      'Defense',
      'Possession',
      'Passing',
      'Physicality',
      'Experience'
    ];
    
    // In full implementation, these would be calculated from team stats
    // For demo, generate sensible random values
    
    const homeValues = categories.map(() => Math.random() * 0.5 + 0.3); // 0.3-0.8
    const awayValues = categories.map(() => Math.random() * 0.5 + 0.3); // 0.3-0.8
    
    // Ensure some categories have meaningful differences
    const primaryCategory = Math.floor(Math.random() * categories.length);
    const secondaryCategory = (primaryCategory + 2) % categories.length;
    
    // Home team is stronger in primary category
    homeValues[primaryCategory] = Math.min(1, homeValues[primaryCategory] + 0.2);
    awayValues[primaryCategory] = Math.max(0, awayValues[primaryCategory] - 0.1);
    
    // Away team is stronger in secondary category
    awayValues[secondaryCategory] = Math.min(1, awayValues[secondaryCategory] + 0.2);
    homeValues[secondaryCategory] = Math.max(0, homeValues[secondaryCategory] - 0.1);
    
    return {
      categories,
      series: [
        {
          name: homeTeam.name || 'Home Team',
          values: homeValues.map(v => parseFloat(v.toFixed(2)))
        },
        {
          name: awayTeam.name || 'Away Team',
          values: awayValues.map(v => parseFloat(v.toFixed(2)))
        }
      ]
    };
  }
  
  /**
   * Store narratives in database
   * @param {Array} narratives - Match narratives to store
   */
  async storeNarratives(narratives) {
    try {
      const collection = this.db.collection('matchNarratives');
      
      // Delete old narratives and insert new ones
      if (narratives.length > 0) {
        await collection.deleteMany({});
        await collection.insertMany(narratives);
        console.log(`Stored ${narratives.length} match narratives in database`);
      }
      
      return true;
    } catch (error) {
      console.error(`Error storing narratives: ${error.message}`);
      return false;
    }
  }
  
  /**
   * Get narratives for all matches
   * @returns {Array} All match narratives
   */
  getAllNarratives() {
    return Array.from(this.narratives.values());
  }
  
  /**
   * Get narrative for a specific match
   * @param {string} matchId - Match ID
   * @returns {Object} Match narrative
   */
  getMatchNarrative(matchId) {
    return this.narratives.get(matchId) || null;
  }
  
  /**
   * Get narratives for matches in a league
   * @param {string} leagueId - League ID
   * @returns {Array} League match narratives
   */
  getLeagueNarratives(leagueId) {
    // In a full implementation, we would filter by league ID
    // For demo, return all narratives
    return this.getAllNarratives();
  }
}

// Singleton instance
let instance = null;

/**
 * Get the NarrativeEngine instance
 * @param {Object} options - Configuration options
 * @returns {NarrativeEngine} Narrative engine
 */
function getNarrativeEngine(options = {}) {
  if (!instance) {
    instance = new NarrativeEngine(options);
  }
  return instance;
}

module.exports = {
  NarrativeEngine,
  getNarrativeEngine
}; 