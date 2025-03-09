/**
 * StatsCalculator - Core class for sports analytics statistical calculations
 * @module utils/statsCalculator/index
 * @version 3.0.0
 */

const { performance } = require('perf_hooks');
const { LogManager } = require('../logger');
const { CacheManager } = require('../cache');
const MetricsManager = require('../metricsManager');
const predictiveModel = require('../../scripts/predictive_model');

// Import sub-modules
const baseCalculations = require('./baseCalculations');
const advancedCalculations = require('./advancedCalculations');
const { LEAGUES } = require('./leagueConfigurations');

// Initialize services
const logger = new LogManager().logger;
const cache = new CacheManager();
const metricsManager = new MetricsManager();

/**
 * StatsCalculator class providing comprehensive sports analytics calculations
 * @class
 */
class StatsCalculator {
    /**
     * Calculate comprehensive team statistics
     * @param {Array} games - Array of game objects containing team performance data
     * @param {string} teamId - Unique identifier for the team
     * @param {string} league - League identifier (e.g., 'nba', 'nfl')
     * @returns {Object} - Comprehensive team statistics
     */
    static async calculateTeamStats(games, teamId, league) {
        const startTime = performance.now();
        
        try {
            // Cache check
            const cacheKey = `team_stats:${teamId}:${league}:${this.getLatestGameDate(games)}`;
            const cachedStats = await cache.get(cacheKey);
            if (cachedStats) {
                return cachedStats;
            }

            // Parallel processing of different stat categories
            const [
                baseStats,
                advancedStats,
                situationalStats,
                predictionMetrics
            ] = await Promise.all([
                this.calculateBaseStats(games, teamId),
                this.calculateAdvancedStats(games, teamId, league),
                this.calculateSituationalStats(games, teamId, league),
                this.calculatePredictiveMetrics(games, teamId, league)
            ]);

            // Additional context and analysis
            const enhancedStats = {
                base: baseStats,
                advanced: advancedStats,
                situational: situationalStats,
                predictive: predictionMetrics,
                trends: await this.calculateTrends(games, teamId),
                context: await this.calculateHistoricalContext(games, teamId),
                performance: await this.calculatePerformanceMetrics(games, teamId),
                metadata: {
                    processingTime: (performance.now() - startTime).toFixed(2),
                    dataPoints: games.length,
                    league: this.LEAGUES[league.toLowerCase()]?.name || league,
                    lastUpdated: new Date().toISOString(),
                    version: StatsCalculator.VERSION,
                    confidence: this.calculateConfidenceScore(games.length)
                }
            };

            // Cache the results
            await cache.set(cacheKey, enhancedStats, 300); // 5 minutes TTL

            // Track metrics
            await metricsManager.recordStatCalculation({
                type: 'team',
                league,
                dataPoints: games.length,
                processingTime: performance.now() - startTime
            });

            return enhancedStats;

        } catch (error) {
            logger.error('Team stats calculation error:', error);
            throw new Error(`Failed to calculate team stats: ${error.message}`);
        }
    }

    /**
     * Calculate player statistics
     * @param {string} playerId - Player identifier
     * @param {string} league - League identifier
     * @param {Object} options - Additional options including timeframe
     * @returns {Object} - Comprehensive player statistics
     */
    static async calculatePlayerStats(playerId, league, options = {}) {
        const startTime = performance.now();

        try {
            // Cache check
            const cacheKey = `player_stats:${playerId}:${league}:${options.timeframe || 'all'}`;
            const cachedStats = await cache.get(cacheKey);
            if (cachedStats) {
                return cachedStats;
            }

            // Get player games from appropriate collection
            const db = req.app.locals.db;
            const collectionName = `${league.toLowerCase()}_player_stats`;
            
            let query = { playerId };
            
            // Apply timeframe filter if specified
            if (options.timeframe) {
                const startDate = new Date();
                startDate.setDate(startDate.getDate() - options.timeframe);
                query.date = { $gte: startDate };
            }
            
            const playerGames = await db.collection(collectionName)
                .find(query)
                .sort({ date: -1 })
                .limit(options.limit || 100)
                .toArray();
            
            // Calculate basic and advanced stats
            const baseStats = this.calculatePlayerBaseStats(playerGames, league);
            const advancedStats = this.calculatePlayerAdvancedStats(playerGames, league);
            
            // Calculate trends
            const trends = this.calculatePlayerTrends(playerGames);
            
            // Get predictions using predictive model
            const predictions = await predictiveModel.predict({
                league,
                predictionType: 'PLAYER_STATS',
                input_data: {
                    playerId,
                    recentGames: playerGames.slice(0, 10)
                }
            });
            
            const playerStats = {
                base: baseStats,
                advanced: advancedStats,
                trends,
                predictions,
                metadata: {
                    playerId,
                    league,
                    gamesAnalyzed: playerGames.length,
                    timeframe: options.timeframe,
                    processingTime: performance.now() - startTime,
                    lastUpdated: new Date()
                }
            };
            
            // Cache the results
            await cache.set(cacheKey, playerStats, 300); // 5 minutes TTL
            
            return playerStats;
        } catch (error) {
            logger.error('Player stats calculation error:', error);
            throw new Error(`Failed to calculate player stats: ${error.message}`);
        }
    }

    /**
     * Get the date of the most recent game in the dataset
     * @param {Array} games - Array of game objects
     * @returns {string} - ISO formatted date string
     */
    static getLatestGameDate(games) {
        if (!games || games.length === 0) return new Date().toISOString();
        return new Date(Math.max(...games.map(g => new Date(g.date)))).toISOString();
    }

    /**
     * Calculate game statistics
     * @param {Object} game - Game object
     * @returns {Object} - Game statistics
     */
    static async calculateGameStats(game) {
        try {
            return {
                teamStats: {
                    home: this.calculateTeamGameStats(game, game.homeTeam.id),
                    away: this.calculateTeamGameStats(game, game.awayTeam.id)
                },
                gameFlow: this.analyzeGameFlow(game),
                keyMoments: this.identifyKeyMoments(game),
                playerPerformance: this.analyzePlayerPerformance(game),
                advancedMetrics: this.calculateGameAdvancedMetrics(game)
            };
        } catch (error) {
            logger.error('Game stats calculation error:', error);
            throw new Error(`Failed to calculate game stats: ${error.message}`);
        }
    }

    /**
     * Calculate live game statistics
     * @param {Object} game - Live game object
     * @returns {Object} - Live game statistics
     */
    static async calculateLiveGameStats(game) {
        try {
            return {
                currentStats: this.calculateGameStats(game),
                liveMetrics: this.calculateLiveMetrics(game),
                projections: this.calculateLiveProjections(game),
                momentumIndicators: this.analyzeMomentumShifts(game)
            };
        } catch (error) {
            logger.error('Live game stats calculation error:', error);
            throw new Error(`Failed to calculate live game stats: ${error.message}`);
        }
    }

    /**
     * Calculate league metrics
     * @param {Array} games - Array of league games
     * @returns {Object} - League metrics
     */
    static async calculateLeagueMetrics(games) {
        try {
            return {
                scoringStats: this.calculateLeagueScoringStats(games),
                teamPerformance: this.calculateTeamPerformanceMetrics(games),
                leagueTrends: this.calculateLeagueTrends(games),
                competitiveness: this.calculateCompetitivenessMetrics(games)
            };
        } catch (error) {
            logger.error('League metrics calculation error:', error);
            throw new Error(`Failed to calculate league metrics: ${error.message}`);
        }
    }

    /**
     * Compare teams within a league
     * @param {Array} games - Array of games
     * @returns {Object} - Team comparison data
     */
    static async compareTeams(games) {
        try {
            const teamIds = [...new Set(games.flatMap(game => 
                [game.homeTeam.id, game.awayTeam.id]
            ))];
            
            return {
                headToHead: this.calculateHeadToHeadStats(games, teamIds),
                rankings: this.calculateTeamRankings(games, teamIds),
                strengthComparison: this.calculateStrengthComparison(games, teamIds)
            };
        } catch (error) {
            logger.error('Team comparison error:', error);
            throw new Error(`Failed to compare teams: ${error.message}`);
        }
    }

    /**
     * Generate league insights
     * @param {Array} games - Array of games
     * @returns {Object} - League insights
     */
    static async generateLeagueInsights(games) {
        try {
            return {
                standoutPerformances: this.identifyStandoutPerformances(games),
                anomalies: this.detectStatisticalAnomalies(games),
                trends: this.identifyLeagueWideTrends(games),
                recommendations: this.generateLeagueRecommendations(games)
            };
        } catch (error) {
            logger.error('League insights generation error:', error);
            throw new Error(`Failed to generate league insights: ${error.message}`);
        }
    }

    /**
     * Compare team metrics
     * @param {Array} games - Array of games
     * @param {Array} teamIds - Array of team IDs to compare
     * @param {Array} metrics - Array of metrics to compare
     * @returns {Object} - Team metrics comparison
     */
    static async compareTeamMetrics(games, teamIds, metrics = []) {
        try {
            const teamsData = {};
            for (const teamId of teamIds) {
                const teamGames = this.filterTeamGames(games, teamId);
                teamsData[teamId] = await this.calculateTeamMetrics(teamGames, teamId, metrics);
            }
            
            return {
                metrics: teamsData,
                comparison: this.generateMetricComparisons(teamsData),
                visualizationData: this.prepareVisualizationData(teamsData)
            };
        } catch (error) {
            logger.error('Team metrics comparison error:', error);
            throw new Error(`Failed to compare team metrics: ${error.message}`);
        }
    }

    /**
     * Analyze player performance
     * @param {Array} playerStats - Array of player statistics
     * @returns {Object} - Player performance analysis
     */
    static async analyzePlayerPerformance(playerStats) {
        try {
            return {
                baseStats: this.calculatePlayerBaseStats(playerStats),
                advancedStats: this.calculatePlayerAdvancedStats(playerStats),
                performance: this.evaluatePlayerPerformance(playerStats),
                projections: this.generatePlayerProjections(playerStats)
            };
        } catch (error) {
            logger.error('Player performance analysis error:', error);
            throw new Error(`Failed to analyze player performance: ${error.message}`);
        }
    }

    /**
     * Analyze player trends
     * @param {Array} playerStats - Array of player statistics
     * @returns {Object} - Player trends analysis
     */
    static async analyzePlayerTrends(playerStats) {
        try {
            return {
                recent: this.analyzeRecentPlayerTrends(playerStats),
                season: this.analyzeSeasonPlayerTrends(playerStats),
                historical: this.analyzeHistoricalPlayerTrends(playerStats),
                projections: this.projectPlayerTrends(playerStats)
            };
        } catch (error) {
            logger.error('Player trends analysis error:', error);
            throw new Error(`Failed to analyze player trends: ${error.message}`);
        }
    }

    /**
     * Analyze trends in team performance
     * @param {Array} games - Array of games
     * @param {string} teamId - Team identifier
     * @returns {Object} - Trend analysis
     */
    static async analyzeTrends(games, teamId) {
        try {
            return {
                performance: this.analyzePerformanceTrends(games, teamId),
                scoring: this.analyzeScoringTrends(games, teamId),
                momentum: this.analyzeMomentumTrends(games, teamId),
                situational: this.analyzeSituationalTrends(games, teamId)
            };
        } catch (error) {
            logger.error('Trend analysis error:', error);
            throw new Error(`Failed to analyze trends: ${error.message}`);
        }
    }
}

// Set version
StatsCalculator.VERSION = '3.0.0';

// Attach league configurations
StatsCalculator.LEAGUES = LEAGUES;

// Attach methods from baseCalculations
Object.assign(StatsCalculator, baseCalculations);

// Attach methods from advancedCalculations
Object.assign(StatsCalculator, advancedCalculations);

// Helper method implementations (placeholder implementations)
StatsCalculator.calculateTeamGameStats = (game, teamId) => ({});
StatsCalculator.analyzeGameFlow = (game) => ({});
StatsCalculator.identifyKeyMoments = (game) => ([]);
StatsCalculator.calculateGameAdvancedMetrics = (game) => ({});
StatsCalculator.calculateLiveMetrics = (game) => ({});
StatsCalculator.calculateLiveProjections = (game) => ({});
StatsCalculator.analyzeMomentumShifts = (game) => ({});
StatsCalculator.calculateLeagueScoringStats = (games) => ({});
StatsCalculator.calculateTeamPerformanceMetrics = (games) => ({});
StatsCalculator.calculateLeagueTrends = (games) => ({});
StatsCalculator.calculateCompetitivenessMetrics = (games) => ({});
StatsCalculator.calculateHeadToHeadStats = (games, teamIds) => ({});
StatsCalculator.calculateTeamRankings = (games, teamIds) => ({});
StatsCalculator.calculateStrengthComparison = (games, teamIds) => ({});
StatsCalculator.identifyStandoutPerformances = (games) => ([]);
StatsCalculator.detectStatisticalAnomalies = (games) => ([]);
StatsCalculator.identifyLeagueWideTrends = (games) => ([]);
StatsCalculator.generateLeagueRecommendations = (games) => ([]);
StatsCalculator.calculateTeamMetrics = (games, teamId, metrics) => ({});
StatsCalculator.generateMetricComparisons = (teamsData) => ({});
StatsCalculator.prepareVisualizationData = (teamsData) => ({});
StatsCalculator.calculatePlayerBaseStats = (playerStats) => ({});
StatsCalculator.calculatePlayerAdvancedStats = (playerStats) => ({});
StatsCalculator.evaluatePlayerPerformance = (playerStats) => ({});
StatsCalculator.generatePlayerProjections = (playerStats) => ({});
StatsCalculator.analyzeRecentPlayerTrends = (playerStats) => ({});
StatsCalculator.analyzeSeasonPlayerTrends = (playerStats) => ({});
StatsCalculator.analyzeHistoricalPlayerTrends = (playerStats) => ({});
StatsCalculator.projectPlayerTrends = (playerStats) => ({});
StatsCalculator.analyzePerformanceTrends = (games, teamId) => ({});
StatsCalculator.analyzeScoringTrends = (games, teamId) => ({});
StatsCalculator.analyzeMomentumTrends = (games, teamId) => ({});
StatsCalculator.analyzeSituationalTrends = (games, teamId) => ({});
StatsCalculator.calculatePlayerTrends = (playerGames) => ({});
StatsCalculator.calculateConfidenceScore = (dataPointCount) => Math.min(100, Math.max(50, dataPointCount / 10));

// Export the StatsCalculator class
module.exports = { StatsCalculator };