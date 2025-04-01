const express = require('express');
const router = express.Router();
const { authenticate } = require('../auth/authMiddleware');
const StatsCalculator = require('../utils/statsCalculator');
const predictiveModel = require('../scripts/predictive_model');
const { LogManager } = require('../utils/logger');
const { CacheManager } = require('../utils/cache');
const { check, param, query, validationResult } = require('express-validator');
const CircuitBreaker = require('opossum');
const asyncHandler = require('express-async-handler');
const { createLimiter } = require('../utils/rateLimiter');

// Initialize services
const logger = new LogManager({ service: 'analytics' }).logger;
const cache = new CacheManager();
// Initialize circuit breaker with a dummy function that will be replaced when used
const breaker = new CircuitBreaker(() => Promise.resolve({}), {
    timeout: 30000,
    errorThresholdPercentage: 50,
    resetTimeout: 30000
});

// Configure rate limits for analytics endpoints
const analyticsLimiter = {
    game: createLimiter({ max: 100, windowMs: 60000 }), // 100 requests per minute
    team: createLimiter({ max: 50, windowMs: 60000 }),  // 50 requests per minute
    league: createLimiter({ max: 30, windowMs: 60000 }) // 30 requests per minute
};

// Cache configuration
const CACHE_DURATIONS = {
    GAME: 300, // 5 minutes
    TEAM: 600, // 10 minutes
    LEAGUE: 900 // 15 minutes
};

// Validation schemas
const gameValidation = [
    param('gameId').isString().trim().notEmpty(),
    query('includePlayerStats').optional().isBoolean()
];

const teamValidation = [
    param('teamId').isString().trim().notEmpty(),
    query('league').isString().trim().notEmpty(),
    query('timeframe').optional().isInt({ min: 1, max: 365 })
];

const leagueValidation = [
    param('leagueId').isString().trim().notEmpty(),
    query('startDate').optional().isISO8601(),
    query('endDate').optional().isISO8601()
];

/**
 * @route GET /api/analytics/game/:gameId
 * @description Get detailed game analytics with ML predictions
 * @access Protected
 */
router.get('/game/:gameId',
    authenticate,
    gameValidation,
    analyticsLimiter.game,
    asyncHandler(async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ errors: errors.array() });
            }

            const { gameId } = req.params;
            const { includePlayerStats } = req.query;
            const cacheKey = `game_analytics:${gameId}:${includePlayerStats}`;

            // Check cache
            let analyticsData = await cache.get(cacheKey);
            if (analyticsData) {
                return res.json({
                    success: true,
                    data: analyticsData,
                    source: 'cache'
                });
            }

            // Fetch game data with circuit breaker
            const game = await breaker.fire(async () => {
                const db = req.app.locals.db;
                return await db.collection('games').findOne(
                    { _id: gameId },
                    { projection: includePlayerStats ? null : { playerStats: 0 } }
                );
            });

            if (!game) {
                return res.status(404).json({ error: 'Game not found' });
            }

            // Process analytics in parallel
            const [gameStats, predictions, insights] = await Promise.all([
                StatsCalculator.calculateGameStats(game),
                predictiveModel.predict({
                    league: game.league,
                    predictionType: 'GAME_OUTCOME',
                    inputData: game
                }),
                generateEnhancedGameInsights(game)
            ]);

            analyticsData = {
                gameStats,
                predictions,
                insights,
                metadata: {
                    gameId,
                    timestamp: new Date(),
                    analyticsVersion: '2.0'
                }
            };

            // Cache results
            await cache.set(cacheKey, analyticsData, CACHE_DURATIONS.GAME);

            // Log analytics request
            logger.info('Game analytics generated', {
                gameId,
                userId: req.user.id,
                includePlayerStats
            });

            res.json({
                success: true,
                data: analyticsData,
                source: 'generated'
            });

        } catch (error) {
            logger.error('Game analytics error:', error);
            res.status(500).json({
                error: 'Failed to fetch game analytics',
                details: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    })
);

/**
 * @route GET /api/analytics/team/:teamId
 * @description Get comprehensive team analytics with ML predictions
 * @access Protected
 */
router.get('/team/:teamId',
    authenticate,
    teamValidation,
    analyticsLimiter.team,
    asyncHandler(async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ errors: errors.array() });
            }

            const { teamId } = req.params;
            const { league, timeframe = 30 } = req.query;
            const cacheKey = `team_analytics:${teamId}:${league}:${timeframe}`;

            // Check cache
            let analyticsData = await cache.get(cacheKey);
            if (analyticsData) {
                return res.json({
                    success: true,
                    data: analyticsData,
                    source: 'cache'
                });
            }

            // Calculate date range
            const endDate = new Date();
            const startDate = new Date(endDate);
            startDate.setDate(startDate.getDate() - timeframe);

            // Fetch team games with circuit breaker
            const games = await breaker.fire(async () => {
                const db = req.app.locals.db;
                return await db.collection('games')
                    .find({
                        $or: [
                            { 'homeTeam.id': teamId },
                            { 'awayTeam.id': teamId }
                        ],
                        league: league.toUpperCase(),
                        date: { 
                            $gte: startDate,
                            $lte: endDate
                        }
                    })
                    .sort({ date: -1 })
                    .toArray();
            });

            // Process team analytics in parallel
            const [teamStats, predictions, trends, playerAnalytics] = await Promise.all([
                StatsCalculator.calculateTeamStats(games, teamId, league),
                predictiveModel.predict({
                    league,
                    predictionType: 'TEAM_PERFORMANCE',
                    inputData: { teamId, games }
                }),
                analyzeTeamTrends(games, teamId),
                analyzePlayerPerformance(games, teamId)
            ]);

            analyticsData = {
                teamStats,
                predictions,
                trends,
                playerAnalytics,
                metadata: {
                    teamId,
                    league,
                    timeframe,
                    gamesAnalyzed: games.length,
                    dateRange: {
                        start: startDate,
                        end: endDate
                    },
                    timestamp: new Date(),
                    analyticsVersion: '2.0'
                }
            };

            // Cache results
            await cache.set(cacheKey, analyticsData, CACHE_DURATIONS.TEAM);

            // Log analytics request
            logger.info('Team analytics generated', {
                teamId,
                league,
                timeframe,
                userId: req.user.id
            });

            res.json({
                success: true,
                data: analyticsData,
                source: 'generated'
            });

        } catch (error) {
            logger.error('Team analytics error:', error);
            res.status(500).json({
                error: 'Failed to fetch team analytics',
                details: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    })
);

/**
 * @route GET /api/analytics/league/:leagueId
 * @description Get comprehensive league analytics with ML predictions
 * @access Protected
 */
router.get('/league/:leagueId',
    authenticate,
    leagueValidation,
    analyticsLimiter.league,
    asyncHandler(async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ errors: errors.array() });
            }

            const { leagueId } = req.params;
            const league = leagueId.toUpperCase();
            const { startDate, endDate } = req.query;

            const cacheKey = `league_analytics:${league}:${startDate}:${endDate}`;

            // Check cache
            let analyticsData = await cache.get(cacheKey);
            if (analyticsData) {
                return res.json({
                    success: true,
                    data: analyticsData,
                    source: 'cache'
                });
            }

            // Calculate date range
            const dateRange = calculateDateRange(startDate, endDate);

            // Fetch league games with circuit breaker
            const games = await breaker.fire(async () => {
                const db = req.app.locals.db;
                return await db.collection('games')
                    .find({
                        league,
                        date: { 
                            $gte: dateRange.start,
                            $lte: dateRange.end
                        }
                    })
                    .sort({ date: -1 })
                    .toArray();
            });

            // Process league analytics in parallel
            const [leagueStats, trends, predictions, competitiveAnalysis] = await Promise.all([
                analyzeLeagueStats(games),
                analyzeLeagueTrends(games),
                predictiveModel.predict({
                    league,
                    predictionType: 'LEAGUE_TRENDS',
                    inputData: { games }
                }),
                analyzeLeagueCompetitiveness(games)
            ]);

            analyticsData = {
                leagueStats,
                trends,
                predictions,
                competitiveAnalysis,
                metadata: {
                    league,
                    dateRange: {
                        start: dateRange.start,
                        end: dateRange.end
                    },
                    gamesAnalyzed: games.length,
                    timestamp: new Date(),
                    analyticsVersion: '2.0'
                }
            };

            // Cache results
            await cache.set(cacheKey, analyticsData, CACHE_DURATIONS.LEAGUE);

            // Log analytics request
            logger.info('League analytics generated', {
                league,
                dateRange,
                userId: req.user.id
            });

            res.json({
                success: true,
                data: analyticsData,
                source: 'generated'
            });

        } catch (error) {
            logger.error('League analytics error:', error);
            res.status(500).json({
                error: 'Failed to fetch league analytics',
                details: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    })
);

// Advanced Analytics Helper Functions

function generateEnhancedGameInsights(game) {
    return {
        keyMoments: identifyKeyMoments(game),
        performanceMetrics: calculateAdvancedMetrics(game),
        comparisons: generateHistoricalComparisons(game),
        momentum: analyzeMomentumShifts(game),
        playerImpact: calculatePlayerImpact(game)
    };
}

function analyzeTeamTrends(games, teamId) {
    return {
        form: calculateTeamForm(games, teamId),
        scoring: analyzeScoring(games, teamId),
        performance: analyzePerformance(games, teamId),
        consistency: calculateConsistencyMetrics(games, teamId),
        streaks: analyzeStreaks(games, teamId),
        matchupAnalysis: generateMatchupInsights(games, teamId)
    };
}

function analyzeLeagueStats(games) {
    return {
        overall: {
            totalGames: games.length,
            averageScores: calculateAverageScores(games),
            scoringDistribution: analyzeScoreDistribution(games)
        },
        standings: generateStandings(games),
        performanceMetrics: calculateLeagueMetrics(games),
        teamRankings: generateTeamRankings(games),
        efficiency: calculateLeagueEfficiency(games)
    };
}

function analyzeLeagueTrends(games) {
    return {
        scoring: {
            trends: analyzeLeagueScoringTrends(games),
            patterns: identifyScoringPatterns(games)
        },
        competitiveness: {
            overall: analyzeCompetitiveness(games),
            matchupTypes: analyzeMatchupTypes(games)
        },
        homeAdvantage: calculateDetailedHomeAdvantage(games),
        seasonalTrends: analyzeSeasonalPatterns(games),
        predictions: generateLeaguePredictions(games)
    };
}

// Date Helper Functions
function calculateDateRange(startDate, endDate) {
    const end = endDate ? new Date(endDate) : new Date();
    const start = startDate ? new Date(startDate) : new Date(end);
    start.setDate(start.getDate() - 30); // Default to 30 days if no start date

    return { start, end };
}

// Error Handler
router.use((err, req, res, next) => {
    logger.error('Analytics route error:', err);
    res.status(500).json({
        error: 'Analytics processing error',
        details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

module.exports = router;