const express = require('express');
const router = express.Router();
const { authenticate } = require('../auth/authMiddleware');
const { param, query, validationResult } = require('express-validator');
const asyncHandler = require('express-async-handler');
const { LogManager } = require('../utils/logger');
const { CacheManager } = require('../utils/cache');
const { MongoClient } = require('mongodb');

// Initialize logger and cache
const logger = new LogManager().logger;
const cache = new CacheManager();

/**
 * @route GET /api/games/recent
 * @description Get recent games across all leagues
 * @access Protected
 */
router.get('/recent',
    authenticate,
    query('limit').optional().isInt({ min: 1, max: 50 }).toInt(),
    query('league').optional().isString(),
    asyncHandler(async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ errors: errors.array() });
            }
            
            const { limit = 10, league } = req.query;
            const cacheKey = `games:recent:${limit}:${league || 'all'}`;
            
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
            const client = await MongoClient.connect(process.env.MONGODB_URI || 'mongodb+srv://SportAnalytics:Studyhard%402034@cluster0.et16d.mongodb.net/sports-analytics?retryWrites=true');
            const db = client.db(process.env.MONGODB_DB_NAME || 'sports-analytics');
            
            // Build query
            const query = {
                status: 'completed',
                gameDate: { $lt: new Date() }
            };
            
            // Add league filter if specified
            if (league) {
                query.league = league.toUpperCase();
            }
            
            // Fetch recent games
            const recentGames = await db.collection('games')
                .find(query)
                .sort({ gameDate: -1 })
                .limit(parseInt(limit))
                .toArray();
            
            // Cache the result
            await cache.set(cacheKey, recentGames, 300); // Cache for 5 minutes
            
            await client.close();
            
            res.json({
                success: true,
                data: recentGames,
                count: recentGames.length,
                metadata: {
                    timestamp: new Date(),
                    limit
                }
            });
        } catch (error) {
            logger.error('Error fetching recent games:', error);
            res.status(500).json({
                error: 'Failed to fetch recent games',
                message: process.env.NODE_ENV === 'development' ? error.message : 'Server error'
            });
        }
    })
);

/**
 * @route GET /api/games/upcoming
 * @description Get upcoming games across all leagues
 * @access Protected
 */
router.get('/upcoming',
    authenticate,
    query('limit').optional().isInt({ min: 1, max: 50 }).toInt(),
    query('league').optional().isString(),
    asyncHandler(async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ errors: errors.array() });
            }
            
            const { limit = 10, league } = req.query;
            const cacheKey = `games:upcoming:${limit}:${league || 'all'}`;
            
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
            const client = await MongoClient.connect(process.env.MONGODB_URI || 'mongodb+srv://SportAnalytics:Studyhard%402034@cluster0.et16d.mongodb.net/sports-analytics?retryWrites=true');
            const db = client.db(process.env.MONGODB_DB_NAME || 'sports-analytics');
            
            // Build query
            const query = {
                status: 'scheduled',
                gameDate: { $gt: new Date() }
            };
            
            // Add league filter if specified
            if (league) {
                query.league = league.toUpperCase();
            }
            
            // Fetch upcoming games
            const upcomingGames = await db.collection('games')
                .find(query)
                .sort({ gameDate: 1 })
                .limit(parseInt(limit))
                .toArray();
            
            // Cache the result
            await cache.set(cacheKey, upcomingGames, 300); // Cache for 5 minutes
            
            await client.close();
            
            res.json({
                success: true,
                data: upcomingGames,
                count: upcomingGames.length,
                metadata: {
                    timestamp: new Date(),
                    limit
                }
            });
        } catch (error) {
            logger.error('Error fetching upcoming games:', error);
            res.status(500).json({
                error: 'Failed to fetch upcoming games',
                message: process.env.NODE_ENV === 'development' ? error.message : 'Server error'
            });
        }
    })
);

/**
 * @route GET /api/games/live
 * @description Get live games across all leagues
 * @access Protected
 */
router.get('/live',
    authenticate,
    query('league').optional().isString(),
    asyncHandler(async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ errors: errors.array() });
            }
            
            const { league } = req.query;
            const cacheKey = `games:live:${league || 'all'}`;
            
            // Check cache - short cache time for live games
            let cachedData = await cache.get(cacheKey);
            if (cachedData) {
                return res.json({
                    success: true,
                    data: cachedData,
                    source: 'cache'
                });
            }
            
            // Connect to MongoDB
            const client = await MongoClient.connect(process.env.MONGODB_URI || 'mongodb+srv://SportAnalytics:Studyhard%402034@cluster0.et16d.mongodb.net/sports-analytics?retryWrites=true');
            const db = client.db(process.env.MONGODB_DB_NAME || 'sports-analytics');
            
            // Build query
            const query = {
                $or: [
                    { status: 'live' },
                    { status: 'in_progress' }
                ]
            };
            
            // Add league filter if specified
            if (league) {
                query.league = league.toUpperCase();
            }
            
            // Fetch live games
            const liveGames = await db.collection('games')
                .find(query)
                .sort({ gameDate: 1 })
                .toArray();
            
            // Cache the result (short cache time for live data)
            await cache.set(cacheKey, liveGames, 60); // Cache for 1 minute
            
            await client.close();
            
            res.json({
                success: true,
                data: liveGames,
                count: liveGames.length,
                metadata: {
                    timestamp: new Date()
                }
            });
        } catch (error) {
            logger.error('Error fetching live games:', error);
            res.status(500).json({
                error: 'Failed to fetch live games',
                message: process.env.NODE_ENV === 'development' ? error.message : 'Server error'
            });
        }
    })
);

/**
 * @route GET /api/games/id/:gameId
 * @description Get details for a specific game
 * @access Protected
 */
router.get('/id/:gameId',
    authenticate,
    param('gameId').isString().notEmpty(),
    asyncHandler(async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ errors: errors.array() });
            }
            
            const { gameId } = req.params;
            const cacheKey = `game:${gameId}`;
            
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
            const client = await MongoClient.connect(process.env.MONGODB_URI || 'mongodb+srv://SportAnalytics:Studyhard%402034@cluster0.et16d.mongodb.net/sports-analytics?retryWrites=true');
            const db = client.db(process.env.MONGODB_DB_NAME || 'sports-analytics');
            
            // Fetch game details
            const game = await db.collection('games').findOne({ 
                $or: [
                    { id: gameId },
                    { gameId: gameId }
                ]
            });
            
            if (!game) {
                await client.close();
                return res.status(404).json({
                    error: 'Game not found',
                    message: `No game found with ID ${gameId}`
                });
            }
            
            // Cache the result
            await cache.set(cacheKey, game, 300); // Cache for 5 minutes
            
            await client.close();
            
            res.json({
                success: true,
                data: game
            });
        } catch (error) {
            logger.error(`Error fetching game ${req.params.gameId}:`, error);
            res.status(500).json({
                error: 'Failed to fetch game details',
                message: process.env.NODE_ENV === 'development' ? error.message : 'Server error'
            });
        }
    })
);

/**
 * @route GET /api/games/:league
 * @description Get games for a specific league
 * @access Protected
 */
router.get('/:league',
    authenticate,
    param('league').isString().trim(),
    query('limit').optional().isInt({ min: 1, max: 50 }).toInt(),
    asyncHandler(async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ errors: errors.array() });
            }
            
            const { league } = req.params;
            const { limit = 10 } = req.query;
            
            // Normalize league name to uppercase
            const leagueId = league.toUpperCase();
            
            const cacheKey = `games:league:${leagueId}:${limit}`;
            
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
            const client = await MongoClient.connect(process.env.MONGODB_URI || 'mongodb+srv://SportAnalytics:Studyhard%402034@cluster0.et16d.mongodb.net/sports-analytics?retryWrites=true');
            const db = client.db(process.env.MONGODB_DB_NAME || 'sports-analytics');
            
            // Build query for games in the specified league
            const query = { league: leagueId };
            
            // Fetch games for the league
            const games = await db.collection('games')
                .find(query)
                .sort({ gameDate: -1 })
                .limit(parseInt(limit))
                .toArray();
            
            // Cache the result
            await cache.set(cacheKey, games, 300); // Cache for 5 minutes
            
            await client.close();
            
            res.json({
                success: true,
                data: games,
                count: games.length,
                metadata: {
                    timestamp: new Date(),
                    limit,
                    league: leagueId
                }
            });
        } catch (error) {
            logger.error(`Error fetching games for league ${req.params.league}:`, error);
            res.status(500).json({
                error: 'Failed to fetch games',
                message: process.env.NODE_ENV === 'development' ? error.message : 'Server error'
            });
        }
    })
);

module.exports = router; 