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
 * @route GET /api/players/:playerId
 * @description Get details for a specific player
 * @access Protected
 */
router.get('/:playerId',
    authenticate,
    param('playerId').isString().notEmpty(),
    asyncHandler(async (req, res, next) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            res.status(400).json({ errors: errors.array() });
            return next();
        }
        
        const { playerId } = req.params;
        const cacheKey = `player:${playerId}`;
        
        try {
            // Check cache
            let cachedData = await cache.get(cacheKey);
            if (cachedData) {
                res.json({
                    success: true,
                    data: cachedData,
                    source: 'cache'
                });
                return next();
            }
            
            // Connect to MongoDB
            const client = await MongoClient.connect(process.env.MONGODB_URI);
            const db = client.db(process.env.MONGODB_DB_NAME || 'sports-analytics');
            
            // Fetch player details
            const player = await db.collection('players').findOne({
                $or: [
                    { id: playerId },
                    { playerId: playerId }
                ]
            });
            
            if (!player) {
                await client.close();
                res.status(404).json({
                    error: 'Player not found',
                    message: `No player found with ID ${playerId}`
                });
                return next();
            }
            
            // Cache the result
            await cache.set(cacheKey, player, 3600); // Cache for 1 hour
            
            await client.close();
            
            res.json({
                success: true,
                data: player
            });
            return next();
        } catch (error) {
            logger.error(`Error fetching player ${req.params.playerId}:`, error);
            res.status(500).json({
                error: 'Failed to fetch player details',
                message: process.env.NODE_ENV === 'development' ? error.message : 'Server error'
            });
            return next(error);
        }
    })
);

/**
 * @route GET /api/players
 * @description Get all players with optional filters
 * @access Protected
 */
router.get('/',
    authenticate,
    query('team').optional().isString(),
    query('league').optional().isString(),
    query('position').optional().isString(),
    asyncHandler(async (req, res, next) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            res.status(400).json({ errors: errors.array() });
            return next();
        }
        
        const { team, league, position } = req.query;
        const cacheKey = `players:${team || 'all'}:${league || 'all'}:${position || 'all'}`;
        
        try {
            // Check cache
            let cachedData = await cache.get(cacheKey);
            if (cachedData) {
                res.json({
                    success: true,
                    data: cachedData,
                    source: 'cache'
                });
                return next();
            }
            
            // Connect to MongoDB
            const client = await MongoClient.connect(process.env.MONGODB_URI);
            const db = client.db(process.env.MONGODB_DB_NAME || 'sports-analytics');
            
            // Build query based on filters
            const query = {};
            if (team) query.teamId = team;
            if (league) query.league = league.toUpperCase();
            if (position) query.position = position;
            
            // Fetch players
            const players = await db.collection('players')
                .find(query)
                .sort({ name: 1 })
                .toArray();
            
            // Cache the result
            await cache.set(cacheKey, players, 3600); // Cache for 1 hour
            
            await client.close();
            
            res.json({
                success: true,
                data: players,
                count: players.length
            });
            return next();
        } catch (error) {
            logger.error('Error fetching players:', error);
            res.status(500).json({
                error: 'Failed to fetch players',
                message: process.env.NODE_ENV === 'development' ? error.message : 'Server error'
            });
            return next(error);
        }
    })
);

/**
 * @route GET /api/players/:playerId/stats
 * @description Get stats for a specific player
 * @access Protected
 */
router.get('/:playerId/stats',
    authenticate,
    param('playerId').isString().notEmpty(),
    asyncHandler(async (req, res, next) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            res.status(400).json({ errors: errors.array() });
            return next();
        }
        
        const { playerId } = req.params;
        const cacheKey = `player:${playerId}:stats`;
        
        try {
            // Check cache
            let cachedData = await cache.get(cacheKey);
            if (cachedData) {
                res.json({
                    success: true,
                    data: cachedData,
                    source: 'cache'
                });
                return next();
            }
            
            // Connect to MongoDB
            const client = await MongoClient.connect(process.env.MONGODB_URI);
            const db = client.db(process.env.MONGODB_DB_NAME || 'sports-analytics');
            
            // Fetch player stats
            const stats = await db.collection('playerStats').findOne({
                $or: [
                    { playerId: playerId },
                    { 'player.id': playerId }
                ]
            });
            
            if (!stats) {
                await client.close();
                res.status(404).json({
                    error: 'Player stats not found',
                    message: `No stats found for player with ID ${playerId}`
                });
                return next();
            }
            
            // Cache the result
            await cache.set(cacheKey, stats, 3600); // Cache for 1 hour
            
            await client.close();
            
            res.json({
                success: true,
                data: stats
            });
            return next();
        } catch (error) {
            logger.error(`Error fetching stats for player ${req.params.playerId}:`, error);
            res.status(500).json({
                error: 'Failed to fetch player stats',
                message: process.env.NODE_ENV === 'development' ? error.message : 'Server error'
            });
            return next(error);
        }
    })
);

/**
 * @route GET /api/players/search
 * @description Search for players by name, team, or position
 * @access Protected
 */
router.get('/search',
    authenticate,
    query('q').isString().notEmpty(),
    query('league').optional().isString(),
    query('limit').optional().isInt({ min: 1, max: 50 }).toInt(),
    asyncHandler(async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ errors: errors.array() });
            }
            
            const { q, league, limit = 20 } = req.query;
            const cacheKey = `players:search:${q}:${league || 'all'}:${limit}`;
            
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
            
            // Build query for player search
            const query = {
                $or: [
                    { name: { $regex: new RegExp(q, 'i') } },
                    { firstName: { $regex: new RegExp(q, 'i') } },
                    { lastName: { $regex: new RegExp(q, 'i') } },
                    { position: { $regex: new RegExp(q, 'i') } },
                    { team: { $regex: new RegExp(q, 'i') } }
                ]
            };
            
            // Add league filter if provided
            if (league) {
                query.league = { $regex: new RegExp(league, 'i') };
            }
            
            // Fetch players
            const players = await db.collection('players')
                .find(query)
                .limit(parseInt(limit))
                .toArray();
            
            // Cache the result
            await cache.set(cacheKey, players, 300); // Cache for 5 minutes
            
            await client.close();
            
            res.json({
                success: true,
                data: players,
                count: players.length,
                query: q
            });
        } catch (error) {
            logger.error(`Error searching players:`, error);
            res.status(500).json({
                error: 'Failed to search players',
                message: process.env.NODE_ENV === 'development' ? error.message : 'Server error'
            });
        }
    })
);

module.exports = router; 