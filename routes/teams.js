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
 * @route GET /api/teams/:teamId
 * @description Get details for a specific team
 * @access Protected
 */
router.get('/:teamId',
    authenticate,
    param('teamId').isString().notEmpty(),
    asyncHandler(async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ errors: errors.array() });
            }
            
            const { teamId } = req.params;
            const cacheKey = `team:${teamId}`;
            
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
            
            // Fetch team details
            const team = await db.collection('teams').findOne({ 
                $or: [
                    { id: teamId },
                    { teamId: teamId }
                ]
            });
            
            if (!team) {
                await client.close();
                return res.status(404).json({
                    error: 'Team not found',
                    message: `No team found with ID ${teamId}`
                });
            }
            
            // Cache the result
            await cache.set(cacheKey, team, 3600); // Cache for 1 hour
            
            await client.close();
            
            res.json({
                success: true,
                data: team
            });
        } catch (error) {
            logger.error(`Error fetching team ${req.params.teamId}:`, error);
            res.status(500).json({
                error: 'Failed to fetch team details',
                message: process.env.NODE_ENV === 'development' ? error.message : 'Server error'
            });
        }
    })
);

/**
 * @route GET /api/teams/:teamId/players
 * @description Get players for a specific team
 * @access Protected
 */
router.get('/:teamId/players',
    authenticate,
    param('teamId').isString().notEmpty(),
    asyncHandler(async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ errors: errors.array() });
            }
            
            const { teamId } = req.params;
            const cacheKey = `team:${teamId}:players`;
            
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
            
            // Fetch players for the team
            const players = await db.collection('players')
                .find({ 
                    $or: [
                        { teamId: teamId },
                        { team: { $regex: new RegExp(teamId, 'i') } }
                    ]
                })
                .toArray();
            
            // Cache the result
            await cache.set(cacheKey, players, 3600); // Cache for 1 hour
            
            await client.close();
            
            res.json({
                success: true,
                data: players,
                count: players.length
            });
        } catch (error) {
            logger.error(`Error fetching players for team ${req.params.teamId}:`, error);
            res.status(500).json({
                error: 'Failed to fetch team players',
                message: process.env.NODE_ENV === 'development' ? error.message : 'Server error'
            });
        }
    })
);

/**
 * @route GET /api/teams/:teamId/stats
 * @description Get stats for a specific team
 * @access Protected
 */
router.get('/:teamId/stats',
    authenticate,
    param('teamId').isString().notEmpty(),
    asyncHandler(async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ errors: errors.array() });
            }
            
            const { teamId } = req.params;
            const cacheKey = `team:${teamId}:stats`;
            
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
            
            // Fetch team stats
            const stats = await db.collection('teamStats').findOne({ 
                $or: [
                    { teamId: teamId },
                    { team: { $regex: new RegExp(teamId, 'i') } }
                ]
            });
            
            if (!stats) {
                // If no dedicated stats document exists, try to construct one from games
                const team = await db.collection('teams').findOne({
                    $or: [
                        { id: teamId },
                        { teamId: teamId }
                    ]
                });
                
                if (team) {
                    // Get games where this team participated
                    const games = await db.collection('games').find({
                        $or: [
                            { homeTeamId: teamId },
                            { awayTeamId: teamId },
                            { 'homeTeam.id': teamId },
                            { 'awayTeam.id': teamId }
                        ],
                        status: 'completed'
                    }).toArray();
                    
                    if (games.length > 0) {
                        // Calculate basic stats from games
                        const calculatedStats = calculateTeamStats(games, teamId);
                        
                        // Cache these computed stats
                        await cache.set(cacheKey, calculatedStats, 3600); // Cache for 1 hour
                        
                        await client.close();
                        
                        return res.json({
                            success: true,
                            data: calculatedStats,
                            source: 'calculated'
                        });
                    }
                }
                
                await client.close();
                return res.status(404).json({
                    error: 'Team stats not found',
                    message: `No stats found for team with ID ${teamId}`
                });
            }
            
            // Cache the result
            await cache.set(cacheKey, stats, 3600); // Cache for 1 hour
            
            await client.close();
            
            res.json({
                success: true,
                data: stats
            });
        } catch (error) {
            logger.error(`Error fetching stats for team ${req.params.teamId}:`, error);
            res.status(500).json({
                error: 'Failed to fetch team stats',
                message: process.env.NODE_ENV === 'development' ? error.message : 'Server error'
            });
        }
    })
);

/**
 * Calculate basic team stats from games
 * @param {Array} games - Array of games
 * @param {string} teamId - Team ID to calculate stats for
 * @returns {Object} Calculated team stats
 */
function calculateTeamStats(games, teamId) {
    let wins = 0;
    let losses = 0;
    let totalPoints = 0;
    let totalPointsAllowed = 0;
    let homeWins = 0;
    let homeLosses = 0;
    let awayWins = 0;
    let awayLosses = 0;
    
    games.forEach(game => {
        const isHomeTeam = game.homeTeamId === teamId || (game.homeTeam && game.homeTeam.id === teamId);
        const isAwayTeam = game.awayTeamId === teamId || (game.awayTeam && game.awayTeam.id === teamId);
        
        if (!isHomeTeam && !isAwayTeam) return;
        
        let teamScore = 0;
        let opponentScore = 0;
        
        if (isHomeTeam) {
            teamScore = game.homeScore || 0;
            opponentScore = game.awayScore || 0;
            
            if (teamScore > opponentScore) {
                wins++;
                homeWins++;
            } else {
                losses++;
                homeLosses++;
            }
        } else {
            teamScore = game.awayScore || 0;
            opponentScore = game.homeScore || 0;
            
            if (teamScore > opponentScore) {
                wins++;
                awayWins++;
            } else {
                losses++;
                awayLosses++;
            }
        }
        
        totalPoints += teamScore;
        totalPointsAllowed += opponentScore;
    });
    
    const totalGames = games.length;
    
    return {
        teamId,
        games: totalGames,
        wins,
        losses,
        winPercentage: totalGames > 0 ? (wins / totalGames).toFixed(3) : '0.000',
        averagePointsScored: totalGames > 0 ? (totalPoints / totalGames).toFixed(1) : '0.0',
        averagePointsAllowed: totalGames > 0 ? (totalPointsAllowed / totalGames).toFixed(1) : '0.0',
        homeRecord: `${homeWins}-${homeLosses}`,
        awayRecord: `${awayWins}-${awayLosses}`,
        pointDifferential: (totalPoints - totalPointsAllowed).toFixed(1),
        lastUpdated: new Date()
    };
}

module.exports = router; 