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

// Rate limiting configuration by subscription tier
const RATE_LIMITS = {
    basic: {
        windowMs: 60 * 60 * 1000, // 1 hour
        max: 50
    },
    pro: {
        windowMs: 60 * 60 * 1000,
        max: 200
    },
    enterprise: {
        windowMs: 60 * 60 * 1000,
        max: 1000
    }
};

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
        const limits = RATE_LIMITS[accessCheck.tier];
        const limiter = rateLimiter.createLimiter(limits);
        
        await limiter.consume(req.user.id);
        
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