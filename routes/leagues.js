const express = require('express');
const router = express.Router();
const { body, param, query, validationResult } = require('express-validator');
const { authenticate } = require('../auth/authMiddleware');
const predictiveModel = require('../scripts/predictive_model');
const { SubscriptionManager } = require('../utils/SubscriptionManager');
const { LogManager } = require('../utils/logger');
const { CacheManager } = require('../utils/cache');
const { CircuitBreaker } = require('../utils/circuitBreaker');
const { RateLimiterCluster } = require('../utils/rateLimiter');
const { MetricsManager } = require('../utils/metricsManager');
const asyncHandler = require('express-async-handler');
const rateLimit = require('express-rate-limit');
const { MongoClient } = require('mongodb');

// Initialize managers and services
const logger = new LogManager().logger;
const cache = new CacheManager();
const breaker = new CircuitBreaker();
const rateLimiter = new RateLimiterCluster();
const metricsManager = new MetricsManager();
const subscriptionManager = SubscriptionManager.getInstance();

// Prediction types configuration
const PREDICTION_TYPES = {
    SINGLE_FACTOR: 'SINGLE_FACTOR',
    MULTI_FACTOR: 'MULTI_FACTOR',
    REAL_TIME: 'REAL_TIME',
    PLAYER_PERFORMANCE: 'PLAYER_PERFORMANCE',
    TEAM_PERFORMANCE: 'TEAM_PERFORMANCE',
    GAME_OUTCOME: 'GAME_OUTCOME',
    SEASON_PROJECTION: 'SEASON_PROJECTION'
};

// Cache configuration
const CACHE_DURATIONS = {
    PREDICTION: 300, // 5 minutes
    METRICS: 600,    // 10 minutes
    HISTORY: 900     // 15 minutes
};

// Configure rate limits based on subscription tiers
const RATE_LIMITS = {
    basic: { windowMs: 60000, max: 10 },      // 10 requests per minute
    pro: { windowMs: 60000, max: 30 },        // 30 requests per minute
    enterprise: { windowMs: 60000, max: 100 } // 100 requests per minute
};

// Create a rate limiter middleware with proper defaults and tier-based limits
const createRateLimiter = (req, res, next) => {
    const tier = req.user?.subscription?.tier || 'basic';
    let tierConfig = RATE_LIMITS.basic; // Default to basic tier
    
    // Get the appropriate config
    if (tier === 'pro' && RATE_LIMITS.pro) {
        tierConfig = RATE_LIMITS.pro;
    } else if (tier === 'enterprise' && RATE_LIMITS.enterprise) {
        tierConfig = RATE_LIMITS.enterprise;
    }
    
    // Track requests in memory for this route/IP combination
    const key = `${req.ip}:${req.path}`;
    const now = Date.now();
    
    // Create/get a request timestamp array for this key
    if (!requestCounts.has(key)) {
        requestCounts.set(key, []);
    }
    
    const requests = requestCounts.get(key);
    
    // Filter out timestamps outside of current window
    const windowMs = tierConfig.windowMs;
    const validRequests = requests.filter(timestamp => now - timestamp < windowMs);
    
    // Check if the request limit is exceeded
    if (validRequests.length >= tierConfig.max) {
        logger.warn(`Rate limit exceeded for ${req.ip}`, {
            user: req.user?.id || 'anonymous',
            path: req.path
        });
        
        return res.status(429).json({
            error: 'Too many requests, please try again later',
            retryAfter: Math.ceil(windowMs / 1000)
        });
    }
    
    // Not rate limited, update request count and continue
    validRequests.push(now);
    requestCounts.set(key, validRequests);
    
    // Clean up old entries periodically
    if (Math.random() < 0.01) { // 1% chance to run cleanup
        cleanupRequestCounts();
    }
    
    next();
};

// Initialize request count storage
const requestCounts = new Map();

// Cleanup function to prevent memory leaks
function cleanupRequestCounts() {
    const now = Date.now();
    const maxWindow = Math.max(
        RATE_LIMITS.basic.windowMs,
        RATE_LIMITS.pro.windowMs,
        RATE_LIMITS.enterprise.windowMs
    );
    
    requestCounts.forEach((timestamps, key) => {
        const validTimestamps = timestamps.filter(time => now - time < maxWindow);
        if (validTimestamps.length === 0) {
            requestCounts.delete(key);
        } else {
            requestCounts.set(key, validTimestamps);
        }
    });
}

// Validation schemas
const predictionValidation = {
    base: [
        body('league').isString().notEmpty().trim()
            .withMessage('League is required'),
        body('predictionType').isString().isIn(Object.values(PREDICTION_TYPES))
            .withMessage('Invalid prediction type'),
        body('factors').optional().isArray()
            .withMessage('Factors must be an array'),
        body('confidence').optional().isFloat({ min: 0, max: 1 })
            .withMessage('Confidence must be between 0 and 1')
    ],
    singleFactor: [
        body('factor').isObject()
            .withMessage('Factor object is required')
    ],
    multiFactor: [
        body('factors').isArray({ min: 2 })
            .withMessage('Multiple factors are required'),
        body('weights').optional().isArray()
            .withMessage('Weights must be an array')
    ]
};

// Middleware to check subscription access with rate limiting
const checkSubscriptionAccess = async (req, res, next) => {
    try {
        const { league, predictionType } = req.body;
        
        // Check subscription access
        const accessCheck = await subscriptionManager.checkSubscriptionAccess(
            req.user.id,
            predictionType,
            league
        );

        if (!accessCheck.allowed) {
            return res.status(403).json({
                error: 'Subscription restriction',
                message: accessCheck.reason,
                upgrade: accessCheck.upgradePath
            });
        }

        // Apply rate limiting based on subscription tier
        const limiter = createRateLimiter(req, res, next);
        
        req.subscriptionTier = accessCheck.tier;
        next();
    } catch (error) {
        if (error.name === 'RateLimitExceeded') {
            return res.status(429).json({
                error: 'Rate limit exceeded',
                resetTime: error.resetTime
            });
        }
        
        logger.error('Subscription check error:', error);
        res.status(500).json({ 
            error: 'Access check failed',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * @route POST /api/predictions/single-factor
 * @description Get single factor prediction with advanced analytics
 * @access Protected
 */
router.post('/single-factor',
    authenticate,
    [...predictionValidation.base, ...predictionValidation.singleFactor],
    checkSubscriptionAccess,
    asyncHandler(async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ errors: errors.array() });
            }

            const { league, factor, confidence } = req.body;
            const cacheKey = `prediction:single:${league}:${JSON.stringify(factor)}`;

            // Check cache
            let prediction = await cache.get(cacheKey);
            if (prediction) {
                return res.json({
                    success: true,
                    data: prediction,
                    source: 'cache'
                });
            }

            // Generate prediction with circuit breaker
            prediction = await breaker.fire(async () => {
                const result = await predictiveModel.predict({
                    league,
                    predictionType: PREDICTION_TYPES.SINGLE_FACTOR,
                    factor,
                    confidence,
                    metadata: {
                        userId: req.user.id,
                        subscriptionTier: req.subscriptionTier,
                        timestamp: new Date()
                    }
                });

                // Enhance prediction with additional insights
                return {
                    ...result,
                    confidence: calculateConfidenceScore(result),
                    insights: generatePredictionInsights(result),
                    alternatives: generateAlternativeScenarios(result)
                };
            });

            // Cache prediction
            await cache.set(cacheKey, prediction, CACHE_DURATIONS.PREDICTION);

            // Track prediction usage
            await Promise.all([
                subscriptionManager.trackPredictionUsage(
                    req.user.id,
                    PREDICTION_TYPES.SINGLE_FACTOR,
                    league
                ),
                metricsManager.recordPrediction({
                    type: PREDICTION_TYPES.SINGLE_FACTOR,
                    league,
                    userId: req.user.id,
                    accuracy: prediction.accuracy
                })
            ]);

            res.json({
                success: true,
                data: prediction,
                source: 'generated'
            });

        } catch (error) {
            logger.error('Single factor prediction error:', error);
            res.status(500).json({
                error: 'Prediction generation failed',
                details: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    })
);

/**
 * @route POST /api/predictions/multi-factor
 * @description Get multi-factor prediction with advanced analytics
 * @access Protected
 */
router.post('/multi-factor',
    authenticate,
    [...predictionValidation.base, ...predictionValidation.multiFactor],
    checkSubscriptionAccess,
    asyncHandler(async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ errors: errors.array() });
            }

            const { league, factors, weights, confidence } = req.body;
            const cacheKey = `prediction:multi:${league}:${JSON.stringify({ factors, weights })}`;

            // Check cache
            let prediction = await cache.get(cacheKey);
            if (prediction) {
                return res.json({
                    success: true,
                    data: prediction,
                    source: 'cache'
                });
            }

            // Generate prediction with circuit breaker
            prediction = await breaker.fire(async () => {
                const result = await predictiveModel.predict({
                    league,
                    predictionType: PREDICTION_TYPES.MULTI_FACTOR,
                    factors,
                    weights,
                    confidence,
                    metadata: {
                        userId: req.user.id,
                        subscriptionTier: req.subscriptionTier,
                        timestamp: new Date()
                    }
                });

                // Enhance prediction with additional insights
                return {
                    ...result,
                    confidence: calculateMultiFactorConfidence(result, weights),
                    insights: generateMultiFactorInsights(result),
                    factorAnalysis: analyzeFactorContributions(result, weights),
                    alternatives: generateMultiFactorAlternatives(result)
                };
            });

            // Cache prediction
            await cache.set(cacheKey, prediction, CACHE_DURATIONS.PREDICTION);

            // Track prediction usage
            await Promise.all([
                subscriptionManager.trackPredictionUsage(
                    req.user.id,
                    PREDICTION_TYPES.MULTI_FACTOR,
                    league
                ),
                metricsManager.recordPrediction({
                    type: PREDICTION_TYPES.MULTI_FACTOR,
                    league,
                    userId: req.user.id,
                    accuracy: prediction.accuracy
                })
            ]);

            res.json({
                success: true,
                data: prediction,
                source: 'generated'
            });

        } catch (error) {
            logger.error('Multi-factor prediction error:', error);
            res.status(500).json({
                error: 'Prediction generation failed',
                details: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    })
);

/**
 * @route GET /api/predictions/history
 * @description Get prediction history with analytics
 * @access Protected
 */
router.get('/history',
    authenticate,
    query('league').optional().isString(),
    query('limit').optional().isInt({ min: 1, max: 1000 }),
    query('startDate').optional().isISO8601(),
    query('endDate').optional().isISO8601(),
    asyncHandler(async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ errors: errors.array() });
            }

            const { 
                league, 
                limit = 100,
                startDate,
                endDate
            } = req.query;

            const cacheKey = `history:${req.user.id}:${league}:${limit}:${startDate}:${endDate}`;

            // Check cache
            let history = await cache.get(cacheKey);
            if (history) {
                return res.json({
                    success: true,
                    data: history,
                    source: 'cache'
                });
            }

            // Fetch history with circuit breaker
            history = await breaker.fire(async () => {
                const predictions = await predictiveModel.getPredictionHistory(
                    league,
                    parseInt(limit),
                    {
                        userId: req.user.id,
                        startDate: startDate ? new Date(startDate) : undefined,
                        endDate: endDate ? new Date(endDate) : undefined
                    }
                );

                // Enhance history with analytics
                return {
                    predictions,
                    analytics: {
                        accuracy: calculateHistoricalAccuracy(predictions),
                        trends: analyzeHistoricalTrends(predictions),
                        insights: generateHistoricalInsights(predictions)
                    },
                    metadata: {
                        userId: req.user.id,
                        timeRange: { startDate, endDate },
                        predictionsAnalyzed: predictions.length,
                        timestamp: new Date()
                    }
                };
            });

            // Cache history
            await cache.set(cacheKey, history, CACHE_DURATIONS.HISTORY);

            res.json({
                success: true,
                data: history,
                source: 'generated'
            });

        } catch (error) {
            logger.error('Prediction history error:', error);
            res.status(500).json({
                error: 'Failed to retrieve prediction history',
                details: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    })
);

/**
 * @route GET /api/predictions/metrics/:league
 * @description Get detailed prediction model metrics
 * @access Protected
 */
router.get('/metrics/:league',
    authenticate,
    checkSubscriptionAccess,
    param('league').isString().notEmpty(),
    asyncHandler(async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ errors: errors.array() });
            }

            const { league } = req.params;
            const cacheKey = `metrics:${league}`;

            // Check cache
            let metrics = await cache.get(cacheKey);
            if (metrics) {
                return res.json({
                    success: true,
                    data: metrics,
                    source: 'cache'
                });
            }

            // Fetch metrics with circuit breaker
            metrics = await breaker.fire(async () => {
                const baseMetrics = await predictiveModel.getModelMetrics(league);
                
                // Enhance metrics with advanced analytics
                return {
                    ...baseMetrics,
                    advanced: {
                        reliability: calculateModelReliability(baseMetrics),
                        trends: analyzeModelTrends(baseMetrics),
                        improvements: identifyModelImprovements(baseMetrics)
                    },
                    metadata: {
                        league,
                        timestamp: new Date(),
                        modelVersion: baseMetrics.version
                    }
                };
            });

            // Cache metrics
            await cache.set(cacheKey, metrics, CACHE_DURATIONS.METRICS);

            res.json({
                success: true,
                data: metrics,
                source: 'generated'
            });

        } catch (error) {
            logger.error('Model metrics error:', error);
            res.status(500).json({
                error: 'Failed to retrieve model metrics',
                details: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    })
);

/**
 * @route GET /api/predictions/subscription
 * @description Get user's prediction subscription details
 * @access Protected
 */
router.get('/subscription',
    authenticate,
    asyncHandler(async (req, res) => {
        try {
            const details = await subscriptionManager.getUserSubscriptionDetails(req.user.id);
            
            // Enhance subscription details with usage analytics
            const enhancedDetails = {
                ...details,
                usage: {
                    current: await calculateCurrentUsage(req.user.id),
                    history: await getUsageHistory(req.user.id),
                    limits: RATE_LIMITS[details.tier]
                },
                recommendations: await generateUpgradeRecommendations(details),
                features: await getAvailableFeatures(details.tier)
            };

            res.json({
                success: true,
                data: enhancedDetails,
                metadata: {
                    timestamp: new Date(),
                    nextBillingDate: details.nextBillingDate,
                    tier: details.tier,
                    usagePercentage: Math.round((enhancedDetails.usage.current / enhancedDetails.usage.limits.max) * 100)
                }
            });

        } catch (error) {
            logger.error('Subscription details error:', error);
            res.status(500).json({
                error: 'Failed to retrieve subscription details',
                details: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    })
);

/**
 * @route GET /api/leagues
 * @description Get all available sports leagues
 * @access Protected
 */
router.get('/', 
    authenticate,
    asyncHandler(async (req, res) => {
        try {
            const cacheKey = 'all_leagues';
            
            // Check cache
            let leagues = await cache.get(cacheKey);
            
            if (leagues) {
                console.log('Using cached leagues data');
                return res.json(leagues);
            }
            
            // Generate complete league data
            leagues = [
                {
                    id: 'nfl',
                    name: 'NFL',
                    displayName: 'National Football League',
                    country: 'USA',
                    sport: 'Football',
                    teams: 32,
                    iconPath: '/assets/icons/leagues/nfl.svg',
                    available: true
                },
                {
                    id: 'nba',
                    name: 'NBA',
                    displayName: 'National Basketball Association',
                    country: 'USA',
                    sport: 'Basketball',
                    teams: 30,
                    iconPath: '/assets/icons/leagues/nba.svg',
                    available: true
                },
                {
                    id: 'mlb',
                    name: 'MLB',
                    displayName: 'Major League Baseball',
                    country: 'USA',
                    sport: 'Baseball',
                    teams: 30,
                    iconPath: '/assets/icons/leagues/mlb.svg',
                    available: true
                },
                {
                    id: 'nhl',
                    name: 'NHL',
                    displayName: 'National Hockey League',
                    country: 'USA/Canada',
                    sport: 'Ice Hockey',
                    teams: 32,
                    iconPath: '/assets/icons/leagues/nhl.svg',
                    available: true
                },
                {
                    id: 'premierleague',
                    name: 'Premier League',
                    displayName: 'English Premier League',
                    country: 'England',
                    sport: 'Soccer',
                    teams: 20,
                    iconPath: '/assets/icons/leagues/premierleague.svg',
                    available: true
                },
                {
                    id: 'laliga',
                    name: 'La Liga',
                    displayName: 'La Liga Santander',
                    country: 'Spain',
                    sport: 'Soccer',
                    teams: 20,
                    iconPath: '/assets/icons/leagues/laliga.svg',
                    available: true
                },
                {
                    id: 'bundesliga',
                    name: 'Bundesliga',
                    displayName: 'Bundesliga',
                    country: 'Germany',
                    sport: 'Soccer',
                    teams: 18,
                    iconPath: '/assets/icons/leagues/bundesliga.svg',
                    available: true
                },
                {
                    id: 'seriea',
                    name: 'Serie A',
                    displayName: 'Serie A',
                    country: 'Italy',
                    sport: 'Soccer',
                    teams: 20,
                    iconPath: '/assets/icons/leagues/seriea.svg',
                    available: true
                }
            ];
            
            // Cache the leagues data
            await cache.set(cacheKey, leagues, 3600); // Cache for 1 hour
            
            res.json(leagues);
        } catch (error) {
            logger.error('Failed to fetch leagues:', error);
            res.status(500).json({
                error: 'Failed to fetch leagues',
                details: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    })
);

/**
 * @route GET /api/leagues/:leagueId/teams
 * @description Get teams for a specific league
 * @access Protected
 */
router.get('/:leagueId/teams', 
    authenticate,
    param('leagueId').isString().notEmpty(),
    asyncHandler(async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ errors: errors.array() });
            }
            
            const { leagueId } = req.params;
            const cacheKey = `teams:${leagueId}`;
            
            // Check cache
            let teams = await cache.get(cacheKey);
            if (teams) {
                return res.json({
                    success: true,
                    data: teams,
                    source: 'cache'
                });
            }
            
            // Use team data from setup-teams-collection script for comprehensive data
            // This maps the normalized league IDs to the actual league names in the TEAMS_DATA
            const leagueMap = {
                'nfl': 'NFL',
                'nba': 'NBA',
                'mlb': 'MLB',
                'nhl': 'NHL',
                'epl': 'PREMIER_LEAGUE',
                'premierleague': 'PREMIER_LEAGUE',
                'laliga': 'LA_LIGA',
                'bundesliga': 'BUNDESLIGA',
                'seriea': 'SERIE_A'
            };
            
            const leagueName = leagueMap[leagueId.toLowerCase()] || leagueId.toUpperCase();
            
            // Connect to MongoDB to fetch real teams data from teams collection
            const client = await MongoClient.connect(process.env.MONGODB_URI || 'mongodb+srv://SportAnalytics:Studyhard%402034@cluster0.et16d.mongodb.net/sports-analytics?retryWrites=true&w=majority&appName=Cluster0');
            const db = client.db(process.env.MONGODB_DB_NAME || 'sports-analytics');
            
            // Try to get teams from database
            try {
                teams = await db.collection('teams')
                    .find({ league: leagueName })
                    .sort({ name: 1 })
                    .toArray();
                
                // If no teams found in database, generate sample data
                if (!teams || teams.length === 0) {
                    // Generate sample data for teams based on league
                    teams = generateSampleTeams(leagueId);
                }
                
                // Cache the teams
                await cache.set(cacheKey, teams, 3600); // Cache for 1 hour
                
                res.json({
                    success: true,
                    data: teams,
                    source: 'database'
                });
            } catch (error) {
                logger.error('Error fetching teams from database:', error);
                
                // Fallback to generating sample teams
                teams = generateSampleTeams(leagueId);
                
                // Cache the teams
                await cache.set(cacheKey, teams, 3600); // Cache for 1 hour
                
                res.json({
                    success: true,
                    data: teams,
                    source: 'generated'
                });
            } finally {
                await client.close();
            }
        } catch (error) {
            logger.error('Teams fetch error:', error);
            res.status(500).json({
                error: 'Failed to fetch teams',
                details: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    })
);

/**
 * @route GET /api/leagues/:league/teams
 * @description Get all teams for a specific league
 * @access Protected
 */
router.get('/:league/teams',
    authenticate,
    param('league').isString().trim(),
    asyncHandler(async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ errors: errors.array() });
            }
            
            const { league } = req.params;
            
            // Normalize league name to uppercase
            const leagueId = league.toUpperCase();
            
            const cacheKey = `teams:league:${leagueId}`;
            
            // Check cache
            let cachedData = await cache.get(cacheKey);
            if (cachedData) {
                return res.json({
                    success: true,
                    data: cachedData,
                    source: 'cache'
                });
            }
            
            // Connect to MongoDB
            const client = await MongoClient.connect(process.env.MONGODB_URI);
            const db = client.db(process.env.MONGODB_DB_NAME || 'sports-analytics');
            
            // Build query for teams in the specified league
            const query = { league: leagueId };
            
            // Fetch teams for the league
            const teams = await db.collection('teams')
                .find(query)
                .sort({ name: 1 })
                .toArray();
            
            // Cache the result
            await cache.set(cacheKey, teams, 3600); // Cache for 1 hour
            
            await client.close();
            
            res.json({
                success: true,
                data: teams,
                count: teams.length,
                metadata: {
                    timestamp: new Date(),
                    league: leagueId
                }
            });
        } catch (error) {
            logger.error(`Error fetching teams for league ${req.params.league}:`, error);
            res.status(500).json({
                error: 'Failed to fetch teams',
                message: process.env.NODE_ENV === 'development' ? error.message : 'Server error'
            });
        }
    })
);

// Helper function to generate sample teams based on league ID
function generateSampleTeams(leagueId) {
    // Generate teams based on league
    const leagueTeams = [];
    const teamCount = {
        'nfl': 32,
        'nba': 30,
        'mlb': 30,
        'nhl': 32,
        'epl': 20,
        'premierleague': 20,
        'laliga': 20,
        'bundesliga': 18,
        'seriea': 20
    };
    
    const count = teamCount[leagueId.toLowerCase()] || 20;
    
    for (let i = 1; i <= count; i++) {
        leagueTeams.push({
            id: `${leagueId.toLowerCase()}_team_${i}`,
            name: `${leagueId.toUpperCase()} Team ${i}`,
            league: leagueId.toUpperCase(),
            city: `City ${i}`,
            mascot: `Mascot ${i}`,
            founded: 1900 + Math.floor(Math.random() * 123),
            stadium: `${leagueId.toUpperCase()} Stadium ${i}`,
            stats: {
                wins: Math.floor(Math.random() * 60),
                losses: Math.floor(Math.random() * 40),
                ties: leagueId.toLowerCase() === 'nfl' ? Math.floor(Math.random() * 5) : 0,
                rank: Math.floor(Math.random() * count) + 1,
                points: Math.floor(Math.random() * 120),
                homeRecord: `${Math.floor(Math.random() * 30)}-${Math.floor(Math.random() * 20)}`,
                awayRecord: `${Math.floor(Math.random() * 30)}-${Math.floor(Math.random() * 20)}`
            }
        });
    }
    
    return leagueTeams;
}

/**
 * @route GET /api/leagues/:leagueId/teams/:teamId/players
 * @description Get players for a specific team in a league
 * @access Protected
 */
router.get('/:leagueId/teams/:teamId/players',
    authenticate,
    param('leagueId').isString().notEmpty(),
    param('teamId').isString().notEmpty(),
    asyncHandler(async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ errors: errors.array() });
            }
            
            const { leagueId, teamId } = req.params;
            const cacheKey = `players:${leagueId}:${teamId}`;
            
            // Check cache
            let players = await cache.get(cacheKey);
            if (players) {
                return res.json({
                    success: true,
                    data: players,
                    source: 'cache'
                });
            }
            
            // Connect to MongoDB to fetch real players data
            const client = await MongoClient.connect(process.env.MONGODB_URI || 'mongodb+srv://SportAnalytics:Studyhard%402034@cluster0.et16d.mongodb.net/sports-analytics?retryWrites=true&w=majority&appName=Cluster0');
            const db = client.db(process.env.MONGODB_DB_NAME || 'sports-analytics');
            
            try {
                // Try to get players from database
                players = await db.collection('players')
                    .find({ 
                        league: leagueId.toUpperCase(), 
                        teamId: teamId 
                    })
                    .sort({ name: 1 })
                    .toArray();
                
                // If no players found in database, generate sample data
                if (!players || players.length === 0) {
                    // Generate sample data for players based on league and team
                    players = generateSamplePlayers(leagueId, teamId);
                }
                
                // Cache the players
                await cache.set(cacheKey, players, 3600); // Cache for 1 hour
                
                res.json({
                    success: true,
                    data: players,
                    source: 'database'
                });
            } catch (error) {
                logger.error('Error fetching players from database:', error);
                
                // Fallback to generating sample players
                players = generateSamplePlayers(leagueId, teamId);
                
                // Cache the players
                await cache.set(cacheKey, players, 3600); // Cache for 1 hour
                
                res.json({
                    success: true,
                    data: players,
                    source: 'generated'
                });
            } finally {
                await client.close();
            }
        } catch (error) {
            logger.error('Players fetch error:', error);
            res.status(500).json({
                error: 'Failed to fetch players',
                details: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    })
);

// Helper function to generate sample players based on league ID and team ID
function generateSamplePlayers(leagueId, teamId) {
    // Generate players based on league
    const players = [];
    const playerCount = {
        'nfl': 53,
        'nba': 15,
        'mlb': 26,
        'nhl': 23,
        'epl': 25,
        'premierleague': 25,
        'laliga': 25,
        'bundesliga': 25,
        'seriea': 25
    };
    
    // Positions by league
    const positions = {
        'nfl': ['QB', 'RB', 'WR', 'TE', 'OT', 'OG', 'C', 'DT', 'DE', 'LB', 'CB', 'S', 'K', 'P'],
        'nba': ['PG', 'SG', 'SF', 'PF', 'C'],
        'mlb': ['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH'],
        'nhl': ['G', 'D', 'LW', 'C', 'RW'],
        'epl': ['GK', 'DF', 'MF', 'FW'],
        'premierleague': ['GK', 'DF', 'MF', 'FW'],
        'laliga': ['GK', 'DF', 'MF', 'FW'],
        'bundesliga': ['GK', 'DF', 'MF', 'FW'],
        'seriea': ['GK', 'DF', 'MF', 'FW']
    };
    
    const count = playerCount[leagueId.toLowerCase()] || 20;
    const leaguePositions = positions[leagueId.toLowerCase()] || ['POS'];
    
    const firstNames = ['James', 'John', 'Robert', 'Michael', 'William', 'David', 'Richard', 'Joseph', 'Thomas', 'Charles',
        'Mary', 'Patricia', 'Jennifer', 'Linda', 'Elizabeth', 'Barbara', 'Susan', 'Jessica', 'Sarah', 'Karen'];
    
    const lastNames = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez',
        'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson', 'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin'];
    
    for (let i = 1; i <= count; i++) {
        const firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
        const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];
        const position = leaguePositions[Math.floor(Math.random() * leaguePositions.length)];
        
        // Sport-specific stats
        let stats = {};
        
        if (leagueId.toLowerCase() === 'nba') {
            stats = {
                ppg: (Math.random() * 30).toFixed(1),
                rpg: (Math.random() * 15).toFixed(1),
                apg: (Math.random() * 12).toFixed(1),
                spg: (Math.random() * 4).toFixed(1),
                bpg: (Math.random() * 3).toFixed(1),
                fg: (Math.random() * 0.6 + 0.3).toFixed(3),
                threeP: (Math.random() * 0.5 + 0.2).toFixed(3)
            };
        } else if (leagueId.toLowerCase() === 'nfl') {
            if (position === 'QB') {
                stats = {
                    passYards: Math.floor(Math.random() * 5000),
                    passTD: Math.floor(Math.random() * 50),
                    int: Math.floor(Math.random() * 20),
                    rushYards: Math.floor(Math.random() * 500),
                    rushTD: Math.floor(Math.random() * 5)
                };
            } else if (position === 'RB') {
                stats = {
                    rushYards: Math.floor(Math.random() * 2000),
                    rushTD: Math.floor(Math.random() * 20),
                    recYards: Math.floor(Math.random() * 800),
                    recTD: Math.floor(Math.random() * 6)
                };
            } else if (position === 'WR' || position === 'TE') {
                stats = {
                    receptions: Math.floor(Math.random() * 120),
                    recYards: Math.floor(Math.random() * 1800),
                    recTD: Math.floor(Math.random() * 18)
                };
            } else if (['DE', 'DT', 'LB', 'CB', 'S'].includes(position)) {
                stats = {
                    tackles: Math.floor(Math.random() * 150),
                    sacks: Math.floor(Math.random() * 25),
                    int: Math.floor(Math.random() * 10),
                    forcedFumbles: Math.floor(Math.random() * 6)
                };
            }
        } else if (leagueId.toLowerCase() === 'mlb') {
            if (position === 'P') {
                stats = {
                    wins: Math.floor(Math.random() * 20),
                    losses: Math.floor(Math.random() * 15),
                    era: (Math.random() * 5 + 1).toFixed(2),
                    strikeouts: Math.floor(Math.random() * 300),
                    saves: Math.floor(Math.random() * 45)
                };
            } else {
                stats = {
                    avg: (Math.random() * 0.15 + 0.2).toFixed(3),
                    hr: Math.floor(Math.random() * 45),
                    rbi: Math.floor(Math.random() * 120),
                    sb: Math.floor(Math.random() * 40),
                    obp: (Math.random() * 0.15 + 0.3).toFixed(3)
                };
            }
        } else if (leagueId.toLowerCase() === 'nhl') {
            if (position === 'G') {
                stats = {
                    wins: Math.floor(Math.random() * 40),
                    losses: Math.floor(Math.random() * 30),
                    gaa: (Math.random() * 3 + 1).toFixed(2),
                    savePercentage: (Math.random() * 0.1 + 0.88).toFixed(3),
                    shutouts: Math.floor(Math.random() * 10)
                };
            } else {
                stats = {
                    goals: Math.floor(Math.random() * 50),
                    assists: Math.floor(Math.random() * 70),
                    points: 0, // Will be calculated
                    plusMinus: Math.floor(Math.random() * 60) - 30,
                    pim: Math.floor(Math.random() * 150)
                };
                stats.points = stats.goals + stats.assists;
            }
        } else {
            // Soccer leagues
            if (position === 'GK') {
                stats = {
                    cleanSheets: Math.floor(Math.random() * 25),
                    saves: Math.floor(Math.random() * 150),
                    goalsAgainstAvg: (Math.random() * 2 + 0.5).toFixed(2)
                };
            } else if (position === 'DF') {
                stats = {
                    goals: Math.floor(Math.random() * 8),
                    assists: Math.floor(Math.random() * 10),
                    cleanSheets: Math.floor(Math.random() * 15),
                    tackles: Math.floor(Math.random() * 120)
                };
            } else if (position === 'MF') {
                stats = {
                    goals: Math.floor(Math.random() * 15),
                    assists: Math.floor(Math.random() * 20),
                    keyPasses: Math.floor(Math.random() * 80),
                    passAccuracy: (Math.random() * 15 + 75).toFixed(1)
                };
            } else {
                stats = {
                    goals: Math.floor(Math.random() * 30),
                    assists: Math.floor(Math.random() * 15),
                    shotsOnTarget: Math.floor(Math.random() * 150),
                    conversionRate: (Math.random() * 30 + 10).toFixed(1)
                };
            }
        }
        
        players.push({
            id: `${teamId}_player_${i}`,
            name: `${firstName} ${lastName}`,
            firstName: firstName,
            lastName: lastName,
            number: Math.floor(Math.random() * 99) + 1,
            position: position,
            age: Math.floor(Math.random() * 18) + 18,
            height: Math.floor(Math.random() * 30) + 165, // in cm
            weight: Math.floor(Math.random() * 60) + 60, // in kg
            nationality: ["USA", "Canada", "UK", "France", "Germany", "Spain", "Italy", "Brazil", "Argentina", "Mexico"][Math.floor(Math.random() * 10)],
            teamId: teamId,
            league: leagueId.toUpperCase(),
            stats: stats,
            experience: Math.floor(Math.random() * 15),
            draft: {
                year: 2000 + Math.floor(Math.random() * 23),
                round: Math.floor(Math.random() * 7) + 1,
                pick: Math.floor(Math.random() * 30) + 1
            },
            status: ["Active", "Injured", "Suspended"][Math.floor(Math.random() * 3)],
            salary: Math.floor(Math.random() * 20 + 1) * 1000000,
            jersey: `${Math.floor(Math.random() * 99) + 1}`
        });
    }
    
    return players;
}

/**
 * @route GET /api/leagues/:leagueId/teams/:teamId/games
 * @description Get games for a specific team in a league
 * @access Protected
 */
router.get('/:leagueId/teams/:teamId/games',
    authenticate,
    param('leagueId').isString().notEmpty(),
    param('teamId').isString().notEmpty(),
    asyncHandler(async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ errors: errors.array() });
            }
            
            const { leagueId, teamId } = req.params;
            const cacheKey = `games:${leagueId}:${teamId}`;
            
            // Check cache
            let games = await cache.get(cacheKey);
            if (games) {
                return res.json({
                    success: true,
                    data: games,
                    source: 'cache'
                });
            }
            
            // Connect to MongoDB to fetch real games data
            const client = await MongoClient.connect(process.env.MONGODB_URI || 'mongodb+srv://SportAnalytics:Studyhard%402034@cluster0.et16d.mongodb.net/sports-analytics?retryWrites=true&w=majority&appName=Cluster0');
            const db = client.db(process.env.MONGODB_DB_NAME || 'sports-analytics');
            
            try {
                // Try to get games from database
                games = await db.collection('games')
                    .find({ 
                        league: leagueId.toUpperCase(),
                        $or: [
                            { homeTeamId: teamId },
                            { awayTeamId: teamId }
                        ]
                    })
                    .sort({ gameDate: -1 })
                    .limit(50)
                    .toArray();
                
                // If no games found in database, generate sample data
                if (!games || games.length === 0) {
                    // Generate sample data for games based on league and team
                    games = generateSampleGames(leagueId, teamId);
                }
                
                // Cache the games
                await cache.set(cacheKey, games, 3600); // Cache for 1 hour
                
                res.json({
                    success: true,
                    data: games,
                    source: 'database'
                });
            } catch (error) {
                logger.error('Error fetching games from database:', error);
                
                // Fallback to generating sample games
                games = generateSampleGames(leagueId, teamId);
                
                // Cache the games
                await cache.set(cacheKey, games, 3600); // Cache for 1 hour
                
                res.json({
                    success: true,
                    data: games,
                    source: 'generated'
                });
            } finally {
                await client.close();
            }
        } catch (error) {
            logger.error('Games fetch error:', error);
            res.status(500).json({
                error: 'Failed to fetch games',
                details: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    })
);

// Helper function to generate sample games based on league ID and team ID
function generateSampleGames(leagueId, teamId) {
    const games = [];
    const gameCount = 25; // Generate 25 sample games
    
    // Team IDs in the same league for opponent selection
    const teamIds = [];
    for (let i = 1; i <= 30; i++) {
        if (`${leagueId}_team_${i}` !== teamId) {
            teamIds.push(`${leagueId}_team_${i}`);
        }
    }
    
    // Team name mapping (simplified - in real app, would get from DB)
    const teamNames = {
        'nba': {
            'nba_team_1': 'Lakers',
            'nba_team_2': 'Celtics',
            'nba_team_3': 'Bulls',
            'nba_team_4': 'Warriors',
            'nba_team_5': 'Heat',
            // More teams would be added
        },
        'nfl': {
            'nfl_team_1': 'Chiefs',
            'nfl_team_2': 'Cowboys',
            'nfl_team_3': 'Packers',
            'nfl_team_4': 'Patriots',
            'nfl_team_5': '49ers',
            // More teams would be added
        }
        // Other leagues would follow similar pattern
    };
    
    // Venue names by league
    const venues = {
        'nba': ['Madison Square Garden', 'Staples Center', 'United Center', 'TD Garden', 'American Airlines Arena'],
        'nfl': ['Arrowhead Stadium', 'AT&T Stadium', 'Lambeau Field', 'Gillette Stadium', 'Levi\'s Stadium'],
        'mlb': ['Yankee Stadium', 'Fenway Park', 'Dodger Stadium', 'Wrigley Field', 'Oracle Park'],
        'nhl': ['Madison Square Garden', 'TD Garden', 'Amalie Arena', 'Rogers Arena', 'Bell Centre'],
        'epl': ['Old Trafford', 'Anfield', 'Emirates Stadium', 'Stamford Bridge', 'Etihad Stadium'],
        'premierleague': ['Old Trafford', 'Anfield', 'Emirates Stadium', 'Stamford Bridge', 'Etihad Stadium'],
        'laliga': ['Santiago Bernabéu', 'Camp Nou', 'Wanda Metropolitano', 'Mestalla', 'Sánchez Pizjuán'],
        'bundesliga': ['Allianz Arena', 'Signal Iduna Park', 'Red Bull Arena', 'BayArena', 'Olympiastadion'],
        'seriea': ['San Siro', 'Allianz Stadium', 'Stadio Olimpico', 'Diego Armando Maradona', 'Gewiss Stadium']
    };
    
    // Get venues for this league
    const leagueVenues = venues[leagueId.toLowerCase()] || ['Stadium'];
    
    // Generate past, current, and future games
    const now = new Date();
    
    // Past games (completed)
    for (let i = 0; i < Math.floor(gameCount * 0.6); i++) {
        const opponentId = teamIds[Math.floor(Math.random() * teamIds.length)];
        const isHomeGame = Math.random() > 0.5;
        const homeTeamId = isHomeGame ? teamId : opponentId;
        const awayTeamId = isHomeGame ? opponentId : teamId;
        
        // Generate score based on league
        let homeScore, awayScore;
        if (leagueId.toLowerCase() === 'nba') {
            homeScore = Math.floor(Math.random() * 40) + 80;
            awayScore = Math.floor(Math.random() * 40) + 80;
        } else if (leagueId.toLowerCase() === 'nfl') {
            homeScore = Math.floor(Math.random() * 35) + 10;
            awayScore = Math.floor(Math.random() * 35) + 10;
        } else if (leagueId.toLowerCase() === 'mlb') {
            homeScore = Math.floor(Math.random() * 10);
            awayScore = Math.floor(Math.random() * 10);
        } else if (leagueId.toLowerCase() === 'nhl') {
            homeScore = Math.floor(Math.random() * 6);
            awayScore = Math.floor(Math.random() * 6);
        } else {
            // Soccer leagues
            homeScore = Math.floor(Math.random() * 4);
            awayScore = Math.floor(Math.random() * 4);
        }
        
        // Past game date (1-60 days ago)
        const gameDate = new Date(now);
        gameDate.setDate(now.getDate() - Math.floor(Math.random() * 60) - 1);
        
        games.push({
            id: `game_${leagueId}_${i}`,
            league: leagueId.toUpperCase(),
            gameDate: gameDate.toISOString(),
            homeTeamId: homeTeamId,
            homeTeamName: teamNames[leagueId]?.[homeTeamId] || `Team ${homeTeamId.split('_').pop()}`,
            awayTeamId: awayTeamId,
            awayTeamName: teamNames[leagueId]?.[awayTeamId] || `Team ${awayTeamId.split('_').pop()}`,
            venue: leagueVenues[Math.floor(Math.random() * leagueVenues.length)],
            status: 'completed',
            homeScore: homeScore,
            awayScore: awayScore,
            winner: homeScore > awayScore ? homeTeamId : (awayScore > homeScore ? awayTeamId : 'draw'),
            highlights: 'https://example.com/highlights/' + Math.floor(Math.random() * 1000),
            attendance: Math.floor(Math.random() * 20000) + 10000,
            weather: Math.random() > 0.8 ? 'Rainy' : (Math.random() > 0.6 ? 'Cloudy' : 'Sunny'),
            broadcast: ['ESPN', 'FOX', 'NBC', 'CBS', 'ABC'][Math.floor(Math.random() * 5)]
        });
    }
    
    // Today's game (in progress or scheduled)
    if (Math.random() > 0.7) {
        const opponentId = teamIds[Math.floor(Math.random() * teamIds.length)];
        const isHomeGame = Math.random() > 0.5;
        const homeTeamId = isHomeGame ? teamId : opponentId;
        const awayTeamId = isHomeGame ? opponentId : teamId;
        
        // 50% chance game is in progress, 50% it's scheduled for later today
        const gameInProgress = Math.random() > 0.5;
        const status = gameInProgress ? 'in_progress' : 'scheduled';
        
        // Game time adjusted to be in past if in progress, future if scheduled
        const gameDate = new Date(now);
        if (gameInProgress) {
            gameDate.setHours(now.getHours() - Math.floor(Math.random() * 2) - 1);
        } else {
            gameDate.setHours(now.getHours() + Math.floor(Math.random() * 6) + 1);
        }
        
        // Scores only if game is in progress
        let homeScore = 0, awayScore = 0;
        if (gameInProgress) {
            if (leagueId.toLowerCase() === 'nba') {
                homeScore = Math.floor(Math.random() * 60) + 20;
                awayScore = Math.floor(Math.random() * 60) + 20;
            } else if (leagueId.toLowerCase() === 'nfl') {
                homeScore = Math.floor(Math.random() * 20) + 3;
                awayScore = Math.floor(Math.random() * 20) + 3;
            } else if (leagueId.toLowerCase() === 'mlb') {
                homeScore = Math.floor(Math.random() * 6);
                awayScore = Math.floor(Math.random() * 6);
            } else if (leagueId.toLowerCase() === 'nhl') {
                homeScore = Math.floor(Math.random() * 3);
                awayScore = Math.floor(Math.random() * 3);
            } else {
                // Soccer leagues
                homeScore = Math.floor(Math.random() * 3);
                awayScore = Math.floor(Math.random() * 3);
            }
        }
        
        games.push({
            id: `game_${leagueId}_today`,
            league: leagueId.toUpperCase(),
            gameDate: gameDate.toISOString(),
            homeTeamId: homeTeamId,
            homeTeamName: teamNames[leagueId]?.[homeTeamId] || `Team ${homeTeamId.split('_').pop()}`,
            awayTeamId: awayTeamId,
            awayTeamName: teamNames[leagueId]?.[awayTeamId] || `Team ${awayTeamId.split('_').pop()}`,
            venue: leagueVenues[Math.floor(Math.random() * leagueVenues.length)],
            status: status,
            homeScore: homeScore,
            awayScore: awayScore,
            period: gameInProgress ? ['1st', '2nd', '3rd', '4th', 'Overtime'][Math.floor(Math.random() * 5)] : null,
            timeRemaining: gameInProgress ? `${Math.floor(Math.random() * 12)}:${Math.floor(Math.random() * 60).toString().padStart(2, '0')}` : null,
            attendance: Math.floor(Math.random() * 20000) + 10000,
            weather: Math.random() > 0.8 ? 'Rainy' : (Math.random() > 0.6 ? 'Cloudy' : 'Sunny'),
            broadcast: ['ESPN', 'FOX', 'NBC', 'CBS', 'ABC'][Math.floor(Math.random() * 5)]
        });
    }
    
    // Future games (scheduled)
    for (let i = 0; i < Math.floor(gameCount * 0.4); i++) {
        const opponentId = teamIds[Math.floor(Math.random() * teamIds.length)];
        const isHomeGame = Math.random() > 0.5;
        const homeTeamId = isHomeGame ? teamId : opponentId;
        const awayTeamId = isHomeGame ? opponentId : teamId;
        
        // Future game date (1-30 days in future)
        const gameDate = new Date(now);
        gameDate.setDate(now.getDate() + Math.floor(Math.random() * 30) + 1);
        
        games.push({
            id: `game_${leagueId}_future_${i}`,
            league: leagueId.toUpperCase(),
            gameDate: gameDate.toISOString(),
            homeTeamId: homeTeamId,
            homeTeamName: teamNames[leagueId]?.[homeTeamId] || `Team ${homeTeamId.split('_').pop()}`,
            awayTeamId: awayTeamId,
            awayTeamName: teamNames[leagueId]?.[awayTeamId] || `Team ${awayTeamId.split('_').pop()}`,
            venue: leagueVenues[Math.floor(Math.random() * leagueVenues.length)],
            status: 'scheduled',
            odds: {
                homeWin: (Math.random() * 3 + 1).toFixed(2),
                awayWin: (Math.random() * 3 + 1).toFixed(2),
                draw: (Math.random() * 3 + 2).toFixed(2)
            },
            tickets: 'https://example.com/tickets/' + Math.floor(Math.random() * 1000),
            weather: 'Forecast unavailable',
            broadcast: ['ESPN', 'FOX', 'NBC', 'CBS', 'ABC'][Math.floor(Math.random() * 5)]
        });
    }
    
    // Sort games by date (newest first)
    games.sort((a, b) => new Date(b.gameDate) - new Date(a.gameDate));
    
    return games;
}

// Helper Functions for Subscription and Usage Analysis
async function calculateCurrentUsage(userId) {
    const currentPeriod = await subscriptionManager.getCurrentBillingPeriod(userId);
    return await subscriptionManager.getUsageForPeriod(userId, currentPeriod);
}

async function getUsageHistory(userId) {
    const periods = await subscriptionManager.getBillingPeriods(userId, 6); // Last 6 periods
    return await Promise.all(
        periods.map(async period => ({
            period: period,
            usage: await subscriptionManager.getUsageForPeriod(userId, period)
        }))
    );
}

async function generateUpgradeRecommendations(details) {
    const usagePatterns = await analyzeUsagePatterns(details);
    const currentTier = details.tier;
    
    return {
        recommended: recommendNextTier(currentTier, usagePatterns),
        reasons: generateUpgradeReasons(usagePatterns),
        benefits: calculateUpgradeBenefits(currentTier, usagePatterns),
        savings: calculatePotentialSavings(currentTier, usagePatterns)
    };
}

async function getAvailableFeatures(tier) {
    return {
        current: await subscriptionManager.getTierFeatures(tier),
        next: await subscriptionManager.getNextTierFeatures(tier),
        comparison: await subscriptionManager.getTierComparison(tier)
    };
}

// Error Handler
router.use((err, req, res, next) => {
    logger.error('Predictions route error:', err);
    res.status(500).json({
        error: 'Prediction processing error',
        details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

module.exports = router;