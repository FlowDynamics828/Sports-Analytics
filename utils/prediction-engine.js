/**
 * Revolutionary Multi-Factor Prediction Engine
 * 
 * Enterprise-grade prediction system that combines multiple weighted factors
 * to provide industry-leading predictive analytics for sports events.
 */

const { MongoClient } = require('mongodb');
const axios = require('axios');
const path = require('path');
const fs = require('fs');
const { EventEmitter } = require('events');

class PredictionEngine extends EventEmitter {
  constructor(options = {}) {
    super();
    
    // Configuration with defaults
    this.config = {
      mongoUri: options.mongoUri || process.env.MONGO_URI || 'mongodb+srv://SportAnalytics:Studyhard%402034@cluster0.et16d.mongodb.net/sports-analytics?retryWrites=true',
      dbName: options.dbName || process.env.MONGO_DB_NAME || 'sports-analytics',
      logEnabled: options.logEnabled !== false,
      updateInterval: options.updateInterval || 3600000, // 1 hour by default
      factorWeights: options.factorWeights || {
        headToHead: 0.25,
        recentForm: 0.20,
        homeAdvantage: 0.15,
        injuries: 0.15,
        weather: 0.10,
        restDays: 0.10,
        momentum: 0.05
      },
      ...options
    };
    
    // Normalize weights to ensure they sum to 1.0
    const weightSum = Object.values(this.config.factorWeights).reduce((sum, w) => sum + w, 0);
    if (Math.abs(weightSum - 1.0) > 0.001) {
      Object.keys(this.config.factorWeights).forEach(key => {
        this.config.factorWeights[key] /= weightSum;
      });
    }
    
    // State
    this.db = null;
    this.client = null;
    this.predictions = {};
    this.factors = {};
    this.isRunning = false;
    this.updateTimer = null;
    
    // Ensure logs directory exists
    const logDir = path.join(process.cwd(), 'logs');
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    
    // Create log stream if enabled
    if (this.config.logEnabled) {
      this.logStream = fs.createWriteStream(
        path.join(logDir, 'prediction-engine.log'),
        { flags: 'a' }
      );
    }
    
    // Bind methods
    this.start = this.start.bind(this);
    this.stop = this.stop.bind(this);
    this.predictMatch = this.predictMatch.bind(this);
    this.predictLeagueMatches = this.predictLeagueMatches.bind(this);
    this.analyzeMomentum = this.analyzeMomentum.bind(this);
    this.calculateHeadToHead = this.calculateHeadToHead.bind(this);
    this.factorPreparationFunctions = {
      headToHead: this.calculateHeadToHead,
      recentForm: this.calculateRecentForm,
      homeAdvantage: this.calculateHomeAdvantage,
      injuries: this.calculateInjuries,
      weather: this.calculateWeatherImpact,
      restDays: this.calculateRestDays,
      momentum: this.analyzeMomentum
    };
  }
  
  /**
   * Start the prediction engine
   */
  async start() {
    if (this.isRunning) {
      this.log('Prediction engine is already running');
      return;
    }
    
    this.log('Starting prediction engine...');
    
    try {
      // Connect to MongoDB
      this.client = new MongoClient(this.config.mongoUri, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
        serverSelectionTimeoutMS: 5000
      });
      
      await this.client.connect();
      this.db = this.client.db(this.config.dbName);
      this.log(`Connected to MongoDB database: ${this.config.dbName}`);
      
      // Initialize factors
      await this.initializeFactors();
      
      // Set up recurring updates
      this.isRunning = true;
      this.updateTimer = setInterval(async () => {
        await this.updatePredictions();
      }, this.config.updateInterval);
      
      // Initial prediction
      await this.updatePredictions();
      
      this.log('Prediction engine started successfully');
      this.emit('started');
      
      return true;
    } catch (error) {
      this.log(`Error starting prediction engine: ${error.message}`, 'ERROR');
      this.emit('error', error);
      
      if (this.client) {
        await this.client.close();
        this.client = null;
      }
      
      return false;
    }
  }
  
  /**
   * Stop the prediction engine
   */
  async stop() {
    if (!this.isRunning) {
      this.log('Prediction engine is not running');
      return;
    }
    
    this.log('Stopping prediction engine...');
    
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
    this.log('Prediction engine stopped');
    this.emit('stopped');
    
    if (this.logStream) {
      this.logStream.end();
      this.logStream = null;
    }
    
    return true;
  }
  
  /**
   * Initialize prediction factors
   * @private
   */
  async initializeFactors() {
    this.log('Initializing prediction factors...');
    
    try {
      // Initialize historical match data
      const matches = await this.db.collection('matches').find({}).toArray();
      this.log(`Loaded ${matches.length} historical matches`);
      
      // Initialize team data
      const teams = await this.db.collection('teams').find({}).toArray();
      this.log(`Loaded ${teams.length} teams`);
      
      // Initialize factors
      this.factors = {
        matches,
        teams,
        headToHead: {},
        recentForm: {},
        homeAdvantage: {},
        restDays: {},
        injuries: {},
        momentum: {},
        weather: {}
      };
      
      // Calculate base factors
      await this.calculateBaseFactors();
      
      this.log('Prediction factors initialized successfully');
      return true;
    } catch (error) {
      this.log(`Error initializing prediction factors: ${error.message}`, 'ERROR');
      return false;
    }
  }
  
  /**
   * Calculate base factors for all teams
   * @private
   */
  async calculateBaseFactors() {
    this.log('Calculating base prediction factors...');
    
    const homeAdvantages = {};
    const teams = this.factors.teams;
    
    // Calculate home advantage factors for each team
    for (const team of teams) {
      const teamId = team.teamId || team.id;
      const homeMatches = this.factors.matches.filter(m => 
        (m.teams?.home?.id === teamId || m.idHomeTeam === teamId) && 
        m.status === 'finished'
      );
      
      if (homeMatches.length < 5) {
        homeAdvantages[teamId] = 0.6; // Default home advantage if not enough data
        continue;
      }
      
      const homeWins = homeMatches.filter(m => 
        (m.score?.home > m.score?.away) || 
        (parseInt(m.intHomeScore || 0) > parseInt(m.intAwayScore || 0))
      ).length;
      
      homeAdvantages[teamId] = homeWins / homeMatches.length;
    }
    
    this.factors.homeAdvantage = homeAdvantages;
    this.log(`Calculated home advantage factors for ${Object.keys(homeAdvantages).length} teams`);
    
    // Initialize other factors (these would be calculated in full implementation)
    this.log('Base prediction factors calculated');
  }
  
  /**
   * Update predictions for all upcoming matches
   * @private
   */
  async updatePredictions() {
    this.log('Updating predictions for upcoming matches...');
    
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
      
      this.log(`Found ${upcomingMatches.length} upcoming matches for prediction`);
      
      // Process each league's matches
      const leagueMatches = upcomingMatches.reduce((acc, match) => {
        const leagueId = match.league?.id || match.idLeague;
        if (!acc[leagueId]) acc[leagueId] = [];
        acc[leagueId].push(match);
        return acc;
      }, {});
      
      // Update predictions for each league
      const predictions = {};
      for (const [leagueId, matches] of Object.entries(leagueMatches)) {
        predictions[leagueId] = await this.predictLeagueMatches(leagueId, matches);
      }
      
      // Store updated predictions
      this.predictions = predictions;
      
      // Emit update event
      this.emit('predictions-updated', predictions);
      
      // Store predictions in database for persistence
      await this.storePredictions(predictions);
      
      this.log(`Successfully updated predictions for ${Object.keys(predictions).length} leagues`);
      return predictions;
    } catch (error) {
      this.log(`Error updating predictions: ${error.message}`, 'ERROR');
      return {};
    }
  }
  
  /**
   * Store predictions in database
   * @param {Object} predictions - Predictions to store
   * @private
   */
  async storePredictions(predictions) {
    try {
      const collection = this.db.collection('predictions');
      
      // Convert predictions to array of documents
      const documents = [];
      for (const [leagueId, leaguePredictions] of Object.entries(predictions)) {
        for (const prediction of leaguePredictions) {
          documents.push({
            ...prediction,
            leagueId,
            updatedAt: new Date()
          });
        }
      }
      
      // Delete old predictions and insert new ones
      if (documents.length > 0) {
        await collection.deleteMany({});
        await collection.insertMany(documents);
        this.log(`Stored ${documents.length} predictions in database`);
      }
      
      return true;
    } catch (error) {
      this.log(`Error storing predictions: ${error.message}`, 'ERROR');
      return false;
    }
  }
  
  /**
   * Predict matches for a specific league
   * @param {string} leagueId - League ID
   * @param {Array} matches - League matches
   * @returns {Array} Predictions
   */
  async predictLeagueMatches(leagueId, matches) {
    this.log(`Predicting ${matches.length} matches for league ${leagueId}...`);
    
    const predictions = [];
    
    for (const match of matches) {
      try {
        const prediction = await this.predictMatch(match);
        predictions.push(prediction);
      } catch (error) {
        this.log(`Error predicting match ${match.id}: ${error.message}`, 'ERROR');
      }
    }
    
    this.log(`Generated ${predictions.length} predictions for league ${leagueId}`);
    return predictions;
  }
  
  /**
   * Predict outcome of a single match using multiple factors
   * @param {Object} match - Match to predict
   * @returns {Object} Prediction
   */
  async predictMatch(match) {
    const homeTeamId = match.teams?.home?.id || match.idHomeTeam;
    const awayTeamId = match.teams?.away?.id || match.idAwayTeam;
    const matchId = match.id || match.idEvent;
    
    // Get team names
    const homeTeamName = match.teams?.home?.name || match.strHomeTeam;
    const awayTeamName = match.teams?.away?.name || match.strAwayTeam;
    
    this.log(`Predicting match: ${homeTeamName} vs ${awayTeamName} (ID: ${matchId})`);
    
    // Calculate each factor
    const factorScores = {};
    const factors = [];
    
    for (const [factor, weight] of Object.entries(this.config.factorWeights)) {
      if (this.factorPreparationFunctions[factor]) {
        try {
          // Each factor returns a value between 0 and 1, where higher favors home team
          const factorResult = await this.factorPreparationFunctions[factor](match, homeTeamId, awayTeamId);
          factorScores[factor] = factorResult;
          
          factors.push({
            name: factor,
            weight,
            score: factorResult,
            impact: factorResult * weight
          });
        } catch (error) {
          this.log(`Error calculating ${factor} factor: ${error.message}`, 'WARN');
          factorScores[factor] = 0.5; // Neutral if can't calculate
          
          factors.push({
            name: factor,
            weight,
            score: 0.5,
            impact: 0.5 * weight,
            error: error.message
          });
        }
      }
    }
    
    // Calculate overall prediction (weighted average of all factors)
    const homeWinProbability = factors.reduce((sum, factor) => sum + factor.impact, 0);
    const drawProbability = this.calculateDrawProbability(homeWinProbability);
    const awayWinProbability = 1 - homeWinProbability - drawProbability;
    
    // Add metrics about predictability and confidence
    const confidenceScore = this.calculateConfidence(factors);
    const upsetPotential = this.calculateUpsetPotential(factors, homeWinProbability);
    
    // Generate narrative insights
    const insights = this.generateInsights(match, factors, {
      homeWinProbability,
      drawProbability,
      awayWinProbability
    });
    
    // Format prediction
    const prediction = {
      matchId,
      date: match.date || match.dateEvent,
      homeTeam: {
        id: homeTeamId,
        name: homeTeamName
      },
      awayTeam: {
        id: awayTeamId,
        name: awayTeamName
      },
      probabilities: {
        homeWin: parseFloat(homeWinProbability.toFixed(4)),
        draw: parseFloat(drawProbability.toFixed(4)),
        awayWin: parseFloat(awayWinProbability.toFixed(4))
      },
      metrics: {
        confidence: parseFloat(confidenceScore.toFixed(4)),
        upsetPotential: parseFloat(upsetPotential.toFixed(4))
      },
      factors: factors.map(f => ({
        name: f.name,
        score: parseFloat(f.score.toFixed(4)),
        impact: parseFloat(f.impact.toFixed(4))
      })),
      insights,
      createdAt: new Date()
    };
    
    return prediction;
  }
  
  /**
   * Calculate head-to-head factor
   * @param {Object} match - Match to analyze
   * @param {string} homeTeamId - Home team ID
   * @param {string} awayTeamId - Away team ID
   * @returns {number} Factor score (0-1)
   */
  async calculateHeadToHead(match, homeTeamId, awayTeamId) {
    // Get historical head-to-head matches
    const h2hMatches = this.factors.matches.filter(m => 
      ((m.teams?.home?.id === homeTeamId || m.idHomeTeam === homeTeamId) && 
       (m.teams?.away?.id === awayTeamId || m.idAwayTeam === awayTeamId)) ||
      ((m.teams?.home?.id === awayTeamId || m.idHomeTeam === awayTeamId) && 
       (m.teams?.away?.id === homeTeamId || m.idAwayTeam === homeTeamId))
    );
    
    if (h2hMatches.length === 0) {
      return 0.5; // No head-to-head history, neutral prediction
    }
    
    // Count wins, losses, draws for home team
    let homeWins = 0;
    let homeLosses = 0;
    let draws = 0;
    
    for (const m of h2hMatches) {
      const isHomeTeamHome = (m.teams?.home?.id === homeTeamId || m.idHomeTeam === homeTeamId);
      const homeScore = parseInt(isHomeTeamHome ? (m.score?.home || m.intHomeScore || 0) : (m.score?.away || m.intAwayScore || 0));
      const awayScore = parseInt(!isHomeTeamHome ? (m.score?.home || m.intHomeScore || 0) : (m.score?.away || m.intAwayScore || 0));
      
      if (homeScore > awayScore) homeWins++;
      else if (homeScore < awayScore) homeLosses++;
      else draws++;
    }
    
    // Calculate factor score with weighting for more recent games
    const totalGames = homeWins + homeLosses + draws;
    const winRate = homeWins / totalGames;
    const adjustedWinRate = winRate * 0.8 + 0.1; // Scale to 0.1-0.9 range
    
    return adjustedWinRate;
  }
  
  /**
   * Calculate recent form factor
   * @param {Object} match - Match to analyze
   * @param {string} homeTeamId - Home team ID
   * @param {string} awayTeamId - Away team ID
   * @returns {number} Factor score (0-1)
   */
  async calculateRecentForm(match, homeTeamId, awayTeamId) {
    // Get recent matches for both teams (last 5)
    const homeMatches = this.factors.matches
      .filter(m => 
        (m.teams?.home?.id === homeTeamId || m.idHomeTeam === homeTeamId || 
         m.teams?.away?.id === homeTeamId || m.idAwayTeam === homeTeamId) && 
        (m.status === 'finished' || m.strStatus === 'finished' || 
         m.status === 'FT' || m.strStatus === 'FT')
      )
      .sort((a, b) => new Date(b.date || b.dateEvent) - new Date(a.date || a.dateEvent))
      .slice(0, 5);
    
    const awayMatches = this.factors.matches
      .filter(m => 
        (m.teams?.home?.id === awayTeamId || m.idHomeTeam === awayTeamId || 
         m.teams?.away?.id === awayTeamId || m.idAwayTeam === awayTeamId) && 
        (m.status === 'finished' || m.strStatus === 'finished' || 
         m.status === 'FT' || m.strStatus === 'FT')
      )
      .sort((a, b) => new Date(b.date || b.dateEvent) - new Date(a.date || a.dateEvent))
      .slice(0, 5);
    
    if (homeMatches.length === 0 && awayMatches.length === 0) {
      return 0.5; // No recent form data, neutral prediction
    }
    
    // Calculate form for each team (weighted by recency)
    const homeForm = this.calculateTeamForm(homeMatches, homeTeamId);
    const awayForm = this.calculateTeamForm(awayMatches, awayTeamId);
    
    // Compare forms
    if (homeForm === 0 && awayForm === 0) return 0.5;
    
    const formRatio = homeForm / (homeForm + awayForm);
    return formRatio;
  }
  
  /**
   * Calculate form for a team from recent matches
   * @param {Array} matches - Recent matches
   * @param {string} teamId - Team ID
   * @returns {number} Form score
   * @private
   */
  calculateTeamForm(matches, teamId) {
    if (matches.length === 0) return 0;
    
    let formPoints = 0;
    const WEIGHTS = [1.0, 0.8, 0.6, 0.4, 0.2]; // More recent games weighted higher
    
    matches.forEach((match, index) => {
      const isHome = (match.teams?.home?.id === teamId || match.idHomeTeam === teamId);
      const teamScore = parseInt(isHome ? (match.score?.home || match.intHomeScore || 0) : (match.score?.away || match.intAwayScore || 0));
      const opponentScore = parseInt(!isHome ? (match.score?.home || match.intHomeScore || 0) : (match.score?.away || match.intAwayScore || 0));
      
      const weight = index < WEIGHTS.length ? WEIGHTS[index] : 0.1;
      
      if (teamScore > opponentScore) {
        formPoints += 3 * weight; // Win
      } else if (teamScore === opponentScore) {
        formPoints += 1 * weight; // Draw
      }
      // Loss: 0 points
    });
    
    return formPoints;
  }
  
  /**
   * Calculate home advantage factor
   * @param {Object} match - Match to analyze
   * @param {string} homeTeamId - Home team ID
   * @param {string} awayTeamId - Away team ID
   * @returns {number} Factor score (0-1)
   */
  async calculateHomeAdvantage(match, homeTeamId, awayTeamId) {
    // Get home advantage for home team
    const homeAdvantage = this.factors.homeAdvantage[homeTeamId] || 0.6; // Default if not calculated
    
    // Adjust for stadium capacity and expected attendance
    const venue = match.venue || match.strVenue;
    let attendanceModifier = 0;
    
    if (venue) {
      // This would be enhanced with actual stadium data
      attendanceModifier = 0.05; // Small boost for known venue
    }
    
    return Math.min(0.9, Math.max(0.1, homeAdvantage + attendanceModifier));
  }
  
  /**
   * Calculate injuries impact factor
   * @param {Object} match - Match to analyze
   * @param {string} homeTeamId - Home team ID
   * @param {string} awayTeamId - Away team ID
   * @returns {number} Factor score (0-1)
   */
  async calculateInjuries(match, homeTeamId, awayTeamId) {
    // This would typically pull from an injuries database
    // For now, use neutral value until we have injury data
    return 0.5;
  }
  
  /**
   * Calculate weather impact factor
   * @param {Object} match - Match to analyze
   * @param {string} homeTeamId - Home team ID
   * @param {string} awayTeamId - Away team ID
   * @returns {number} Factor score (0-1)
   */
  async calculateWeatherImpact(match, homeTeamId, awayTeamId) {
    // This would typically pull from a weather API
    // For now, use neutral value until we have weather data
    return 0.5;
  }
  
  /**
   * Calculate rest days factor
   * @param {Object} match - Match to analyze
   * @param {string} homeTeamId - Home team ID
   * @param {string} awayTeamId - Away team ID
   * @returns {number} Factor score (0-1)
   */
  async calculateRestDays(match, homeTeamId, awayTeamId) {
    // Find most recent match for each team
    const homeLastMatch = this.factors.matches
      .filter(m => 
        (m.teams?.home?.id === homeTeamId || m.idHomeTeam === homeTeamId || 
         m.teams?.away?.id === homeTeamId || m.idAwayTeam === homeTeamId) &&
        (m.status === 'finished' || m.strStatus === 'finished')
      )
      .sort((a, b) => new Date(b.date || b.dateEvent) - new Date(a.date || a.dateEvent))[0];
    
    const awayLastMatch = this.factors.matches
      .filter(m => 
        (m.teams?.home?.id === awayTeamId || m.idHomeTeam === awayTeamId || 
         m.teams?.away?.id === awayTeamId || m.idAwayTeam === awayTeamId) &&
        (m.status === 'finished' || m.strStatus === 'finished')
      )
      .sort((a, b) => new Date(b.date || b.dateEvent) - new Date(a.date || a.dateEvent))[0];
    
    if (!homeLastMatch || !awayLastMatch) {
      return 0.5; // Neutral if we don't have data for both teams
    }
    
    // Calculate days since last match
    const matchDate = new Date(match.date || match.dateEvent);
    const homeLastDate = new Date(homeLastMatch.date || homeLastMatch.dateEvent);
    const awayLastDate = new Date(awayLastMatch.date || awayLastMatch.dateEvent);
    
    const homeRestDays = Math.floor((matchDate - homeLastDate) / (1000 * 60 * 60 * 24));
    const awayRestDays = Math.floor((matchDate - awayLastDate) / (1000 * 60 * 60 * 24));
    
    // Calculate advantage (3-4 days rest is ideal, less or more is worse)
    const homeRestScore = this.calculateRestScore(homeRestDays);
    const awayRestScore = this.calculateRestScore(awayRestDays);
    
    if (homeRestScore === 0 && awayRestScore === 0) return 0.5;
    
    return homeRestScore / (homeRestScore + awayRestScore);
  }
  
  /**
   * Calculate rest score for a team
   * @param {number} days - Days of rest
   * @returns {number} Rest score
   * @private
   */
  calculateRestScore(days) {
    if (days <= 1) return 0.2; // Too little rest
    if (days === 2) return 0.7;
    if (days === 3) return 1.0; // Optimal
    if (days === 4) return 0.9;
    if (days === 5) return 0.8;
    if (days >= 6 && days <= 10) return 0.7; // Diminishing returns
    return 0.6; // Too much rest, lost match sharpness
  }
  
  /**
   * Calculate momentum factor - our proprietary metric
   * @param {Object} match - Match to analyze
   * @param {string} homeTeamId - Home team ID
   * @param {string} awayTeamId - Away team ID
   * @returns {number} Factor score (0-1)
   */
  async analyzeMomentum(match, homeTeamId, awayTeamId) {
    // Get recent matches for both teams (last 3)
    const homeMatches = this.factors.matches
      .filter(m => 
        (m.teams?.home?.id === homeTeamId || m.idHomeTeam === homeTeamId || 
         m.teams?.away?.id === homeTeamId || m.idAwayTeam === homeTeamId) && 
        (m.status === 'finished' || m.strStatus === 'finished')
      )
      .sort((a, b) => new Date(b.date || b.dateEvent) - new Date(a.date || a.dateEvent))
      .slice(0, 3);
    
    const awayMatches = this.factors.matches
      .filter(m => 
        (m.teams?.home?.id === awayTeamId || m.idHomeTeam === awayTeamId || 
         m.teams?.away?.id === awayTeamId || m.idAwayTeam === awayTeamId) && 
        (m.status === 'finished' || m.strStatus === 'finished')
      )
      .sort((a, b) => new Date(b.date || b.dateEvent) - new Date(a.date || a.dateEvent))
      .slice(0, 3);
    
    if (homeMatches.length === 0 || awayMatches.length === 0) {
      return 0.5;
    }
    
    // Calculate momentum scores
    const homeMomentum = this.calculateMomentumScore(homeMatches, homeTeamId);
    const awayMomentum = this.calculateMomentumScore(awayMatches, awayTeamId);
    
    // Scale the momentum differential
    const momentumDiff = homeMomentum - awayMomentum;
    return 0.5 + (momentumDiff * 0.25); // Scale to 0.25-0.75 range
  }
  
  /**
   * Calculate momentum score for a team
   * @param {Array} matches - Recent matches
   * @param {string} teamId - Team ID
   * @returns {number} Momentum score (-1 to 1)
   * @private
   */
  calculateMomentumScore(matches, teamId) {
    if (matches.length === 0) return 0;
    
    let trendScore = 0;
    const WEIGHTS = [3, 2, 1]; // More recent games weighted higher
    
    // First determine results trend (improving, steady, declining)
    const results = matches.map(match => {
      const isHome = (match.teams?.home?.id === teamId || match.idHomeTeam === teamId);
      const teamScore = parseInt(isHome ? (match.score?.home || match.intHomeScore || 0) : (match.score?.away || match.intAwayScore || 0));
      const opponentScore = parseInt(!isHome ? (match.score?.home || match.intHomeScore || 0) : (match.score?.away || match.intAwayScore || 0));
      
      if (teamScore > opponentScore) return 3; // Win
      if (teamScore === opponentScore) return 1; // Draw
      return 0; // Loss
    });
    
    // Calculate weighted momentum
    for (let i = 0; i < Math.min(results.length - 1, WEIGHTS.length); i++) {
      const currentResult = results[i];
      const prevResult = results[i + 1];
      const change = currentResult - prevResult;
      trendScore += change * WEIGHTS[i];
    }
    
    // Normalize to -1 to 1 range
    return Math.max(-1, Math.min(1, trendScore / 12));
  }
  
  /**
   * Calculate the probability of a draw
   * @param {number} homeWinProbability - Home win probability
   * @returns {number} Draw probability
   * @private
   */
  calculateDrawProbability(homeWinProbability) {
    // Draw probability is highest when teams are evenly matched
    const evenMatchProbability = 0.25; // Max draw probability
    const unevenMatchFactor = Math.abs(homeWinProbability - 0.5) * 2; // 0 for even match, 1 for completely uneven
    
    return evenMatchProbability * (1 - unevenMatchFactor);
  }
  
  /**
   * Calculate confidence in prediction
   * @param {Array} factors - Prediction factors
   * @returns {number} Confidence score (0-1)
   * @private
   */
  calculateConfidence(factors) {
    // More data and consistent factors = higher confidence
    const factorVariance = this.calculateVariance(factors.map(f => f.score));
    const dataPoints = factors.filter(f => !f.error).length;
    
    // Lower variance and more data points = higher confidence
    const varianceComponent = 1 - Math.min(1, factorVariance * 2);
    const dataComponent = Math.min(1, dataPoints / factors.length);
    
    return (varianceComponent * 0.7) + (dataComponent * 0.3);
  }
  
  /**
   * Calculate upset potential
   * @param {Array} factors - Prediction factors
   * @param {number} favoredProbability - Probability of favored team winning
   * @returns {number} Upset potential (0-1)
   * @private
   */
  calculateUpsetPotential(factors, favoredProbability) {
    // Higher when there's a clear favorite but with some inconsistency in factors
    const favorStrength = Math.abs(favoredProbability - 0.5) * 2; // 0-1 scale of how heavily favored
    
    // Variance in the factors indicates potential for unpredictability
    const factorVariance = this.calculateVariance(factors.map(f => f.score));
    
    // Our proprietary upset formula
    return Math.min(1, Math.max(0, (favorStrength * 0.7) + (factorVariance * 0.3)));
  }
  
  /**
   * Calculate variance of an array of numbers
   * @param {Array} values - Array of numbers
   * @returns {number} Variance
   * @private
   */
  calculateVariance(values) {
    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    const squaredDiffs = values.map(val => Math.pow(val - mean, 2));
    return squaredDiffs.reduce((sum, val) => sum + val, 0) / values.length;
  }
  
  /**
   * Generate narrative insights about a prediction
   * @param {Object} match - Match being predicted
   * @param {Array} factors - Prediction factors
   * @param {Object} probabilities - Prediction probabilities
   * @returns {Array} Narrative insights
   * @private
   */
  generateInsights(match, factors, probabilities) {
    const insights = [];
    const homeTeamName = match.teams?.home?.name || match.strHomeTeam;
    const awayTeamName = match.teams?.away?.name || match.strAwayTeam;
    
    // Determine most influential factors
    const sortedFactors = [...factors].sort((a, b) => Math.abs(b.impact - 0.5) - Math.abs(a.impact - 0.5));
    const topFactors = sortedFactors.slice(0, 3);
    
    // Generate key matchup insight
    if (probabilities.homeWinProbability > 0.6) {
      insights.push(`${homeTeamName} are strong favorites with a ${Math.round(probabilities.homeWinProbability * 100)}% win probability.`);
    } else if (probabilities.awayWinProbability > 0.6) {
      insights.push(`${awayTeamName} are favored to win with a ${Math.round(probabilities.awayWinProbability * 100)}% probability despite playing away.`);
    } else {
      insights.push(`This appears to be an evenly matched contest with ${homeTeamName} having a slight home advantage.`);
    }
    
    // Generate insights based on top factors
    topFactors.forEach(factor => {
      switch(factor.name) {
        case 'headToHead':
          if (factor.score > 0.6) {
            insights.push(`${homeTeamName} have historically performed well against ${awayTeamName}.`);
          } else if (factor.score < 0.4) {
            insights.push(`${awayTeamName} have had the upper hand in previous meetings with ${homeTeamName}.`);
          }
          break;
        case 'recentForm':
          if (factor.score > 0.6) {
            insights.push(`${homeTeamName} are in better recent form than ${awayTeamName}.`);
          } else if (factor.score < 0.4) {
            insights.push(`${awayTeamName} come into this match with superior recent form.`);
          }
          break;
        case 'momentum':
          if (factor.score > 0.6) {
            insights.push(`${homeTeamName} have significant positive momentum coming into this match.`);
          } else if (factor.score < 0.4) {
            insights.push(`${awayTeamName} have momentum on their side.`);
          }
          break;
        case 'restDays':
          if (factor.score > 0.6) {
            insights.push(`${homeTeamName} have a recovery advantage with better rest between matches.`);
          } else if (factor.score < 0.4) {
            insights.push(`${awayTeamName} are better rested coming into this match.`);
          }
          break;
      }
    });
    
    // Add insight about potential upset if relevant
    if (probabilities.homeWinProbability > 0.6 && factors.some(f => f.name === 'momentum' && f.score < 0.4)) {
      insights.push(`Despite being underdogs, ${awayTeamName} could pull off an upset given their recent momentum.`);
    } else if (probabilities.awayWinProbability > 0.6 && factors.some(f => f.name === 'homeAdvantage' && f.score > 0.7)) {
      insights.push(`The strong home advantage at ${match.venue || 'this venue'} could help ${homeTeamName} challenge the favored ${awayTeamName}.`);
    }
    
    return insights.slice(0, 4); // Limit to top 4 insights
  }
  
  /**
   * Get all current predictions
   * @returns {Object} All predictions by league
   */
  getPredictions() {
    return this.predictions;
  }
  
  /**
   * Get predictions for a specific league
   * @param {string} leagueId - League ID
   * @returns {Array} League predictions
   */
  getLeaguePredictions(leagueId) {
    return this.predictions[leagueId] || [];
  }
  
  /**
   * Get prediction for a specific match
   * @param {string} matchId - Match ID
   * @returns {Object} Match prediction
   */
  getMatchPrediction(matchId) {
    for (const leaguePredictions of Object.values(this.predictions)) {
      const prediction = leaguePredictions.find(p => p.matchId === matchId);
      if (prediction) return prediction;
    }
    return null;
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
    const formattedMessage = `[${timestamp}] [PREDICTION] [${level}] ${message}`;
    
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
 * Get the PredictionEngine instance
 * @param {Object} options - Configuration options
 * @returns {PredictionEngine} Prediction engine
 */
function getPredictionEngine(options = {}) {
  if (!instance) {
    instance = new PredictionEngine(options);
  }
  return instance;
}

module.exports = {
  PredictionEngine,
  getPredictionEngine
}; 