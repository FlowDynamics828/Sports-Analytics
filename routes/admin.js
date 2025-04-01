// routes/admin.js
const express = require('express');
const router = express.Router();
const { authenticate } = require('../auth/authMiddleware');
const { LogManager } = require('../utils/logger');
const predictiveModel = require('../scripts/predictive_model');
const LiveGameUpdater = require('../scripts/live-game-updater');
const User = require('../models/User');
const os = require('os');
const asyncHandler = require('express-async-handler');

// Initialize logger
const logger = new LogManager().logger;

/**
 * Middleware to check if user is an admin
 */
const requireAdmin = async (req, res, next) => {
    try {
        if (!req.user || req.user.role !== 'admin') {
            return res.status(403).json({
                error: 'Access denied. Admin privileges required.'
            });
        }
        next();
    } catch (error) {
        logger.error('Admin authorization error:', error);
        res.status(500).json({ error: 'Authorization failed' });
    }
};

/**
 * @route GET /api/admin/system/status
 * @description Get system status and metrics
 * @access Admin
 */
router.get('/system/status', authenticate, requireAdmin, async (req, res) => {
    try {
        const db = req.app.locals.db;
        
        // Collect system metrics
        const metrics = {
            database: await getDatabaseMetrics(db),
            predictiveModel: await predictiveModel.healthCheck(),
            liveGames: await getLiveGameMetrics(db),
            systemLoad: getSystemMetrics()
        };

        res.json({
            success: true,
            data: metrics
        });
    } catch (error) {
        logger.error('System status error:', error);
        res.status(500).json({ error: 'Failed to fetch system status' });
    }
});

/**
 * @route POST /api/admin/games/seed
 * @description Seed game data for testing
 * @access Admin
 */
router.post('/games/seed', authenticate, requireAdmin, async (req, res) => {
    try {
        const { leagues = [], days = 30 } = req.body;
        const db = req.app.locals.db;

        // Import the seeder dynamically
        const seeder = require('../scripts/enhanced-seeder');
        
        // Execute seeding
        await seeder.seedGames(db, leagues, days);

        res.json({
            success: true,
            message: 'Game data seeded successfully'
        });
    } catch (error) {
        logger.error('Game seeding error:', error);
        res.status(500).json({ error: 'Failed to seed game data' });
    }
});

/**
 * @route POST /api/admin/live-games/control
 * @description Control live game updates
 * @access Admin
 */
router.post('/live-games/control', authenticate, requireAdmin, async (req, res) => {
    try {
        const { action, gameIds } = req.body;
        
        switch (action) {
            case 'start':
                await LiveGameUpdater.start(gameIds);
                break;
            case 'stop':
                await LiveGameUpdater.stop(gameIds);
                break;
            case 'pause':
                await LiveGameUpdater.pause(gameIds);
                break;
            default:
                return res.status(400).json({
                    success: false,
                    error: 'Invalid action'
                });
        }

        res.json({
            success: true,
            message: `Live game updates ${action}ed successfully`
        });
    } catch (error) {
        logger.error('Live game control error:', error);
        res.status(500).json({ error: 'Failed to control live games' });
    }
});

/**
 * @route POST /api/admin/model/retrain
 * @description Retrain predictive models
 * @access Admin
 */
router.post('/model/retrain', authenticate, requireAdmin, async (req, res) => {
    try {
        const { leagues } = req.body;
        
        for (const league of leagues) {
            await predictiveModel._updateModel(league, true);
        }

        res.json({
            success: true,
            message: 'Models retrained successfully'
        });
    } catch (error) {
        logger.error('Model retraining error:', error);
        res.status(500).json({ error: 'Failed to retrain models' });
    }
});

/**
 * @route GET /api/admin/logs
 * @description Get system logs
 * @access Admin
 */
router.get('/logs', authenticate, requireAdmin, async (req, res) => {
    try {
        const { level = 'error', limit = 100, startDate, endDate } = req.query;
        const db = req.app.locals.db;

        const query = {
            level: level.toLowerCase(),
            timestamp: {}
        };

        if (startDate) query.timestamp.$gte = new Date(startDate);
        if (endDate) query.timestamp.$lte = new Date(endDate);

        const logs = await db.collection('logs')
            .find(query)
            .sort({ timestamp: -1 })
            .limit(parseInt(limit))
            .toArray();

        res.json({
            success: true,
            data: logs
        });
    } catch (error) {
        logger.error('Log retrieval error:', error);
        res.status(500).json({ error: 'Failed to fetch logs' });
    }
});

// Get all users (admin only)
router.get('/users', async (req, res) => {
    try {
        const users = await User.find({}, '-password');
        res.json(users);
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});

// Get user by ID (admin only)
router.get('/users/:id', authenticate, requireAdmin, async (req, res) => {
    try {
        const user = await User.findById(req.params.id, '-password');
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        res.json(user);
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});

// Update user subscription (admin only)
router.patch('/users/:id/subscription', authenticate, requireAdmin, async (req, res) => {
    try {
        const { subscription } = req.body;
        const user = await User.findByIdAndUpdate(
            req.params.id,
            { subscription },
            { new: true, select: '-password' }
        );
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        res.json(user);
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});

// Helper Functions
async function getDatabaseMetrics(db) {
    const stats = await db.stats();
    const collections = await db.listCollections().toArray();
    
    return {
        status: 'healthy',
        collections: collections.length,
        dataSize: stats.dataSize,
        storageSize: stats.storageSize,
        indexes: stats.indexes,
        avgObjSize: stats.avgObjSize
    };
}

async function getLiveGameMetrics(db) {
    const liveGames = await db.collection('games')
        .find({ status: 'live' })
        .toArray();

    return {
        count: liveGames.length,
        byLeague: liveGames.reduce((acc, game) => {
            acc[game.league] = (acc[game.league] || 0) + 1;
            return acc;
        }, {})
    };
}

function getSystemMetrics() {
    return {
        cpuUsage: os.loadavg(),
        totalMemory: os.totalmem(),
        freeMemory: os.freemem(),
        uptime: os.uptime(),
        platform: os.platform(),
        nodeVersion: process.version
    };
}

/**
 * @route POST /api/admin/db/query
 * @description Direct database query for dashboard fallback (admin only)
 * @access Admin only
 */
router.post('/db/query', 
    authenticate,
    asyncHandler(async (req, res) => {
        try {
            // Ensure user has admin privileges
            if (!req.user.roles || !req.user.roles.includes('admin')) {
                return res.status(403).json({
                    error: 'Forbidden',
                    message: 'Admin privileges required for this operation'
                });
            }
            
            const { collection, query = {}, sort = {}, limit = 50 } = req.body;
            
            // Validate collection name
            const allowedCollections = ['teams', 'players', 'games', 'statistics'];
            if (!collection || !allowedCollections.includes(collection)) {
                return res.status(400).json({
                    error: 'Invalid collection',
                    message: `Collection must be one of: ${allowedCollections.join(', ')}`
                });
            }
            
            // Security check - don't let non-admins query the users collection
            if (collection === 'users') {
                return res.status(403).json({
                    error: 'Forbidden',
                    message: 'Querying user collection is not allowed'
                });
            }
            
            // Get MongoDB client
            const db = req.app.locals.db;
            
            // Execute query with limits
            const results = await db.collection(collection)
                .find(query)
                .sort(sort)
                .limit(Math.min(limit, 100)) // Maximum 100 records
                .toArray();
            
            // Log the query for audit
            logger.info(`Admin database query executed`, {
                user: req.user.id,
                collection,
                query: JSON.stringify(query),
                resultsCount: results.length
            });
            
            res.json({
                success: true,
                data: results,
                count: results.length,
                meta: {
                    timestamp: new Date(),
                    query,
                    sort,
                    limit: Math.min(limit, 100)
                }
            });
            
        } catch (error) {
            logger.error('Admin DB query error:', error);
            res.status(500).json({
                error: 'Database query failed',
                details: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    })
);

/**
 * @route POST /api/admin/generate-sample-data
 * @description Generate sample data for testing the dashboard
 * @access Admin only
 */
router.post('/generate-sample-data', 
    authenticate,
    asyncHandler(async (req, res) => {
        try {
            // Ensure user has admin privileges
            if (!req.user.roles || !req.user.roles.includes('admin')) {
                return res.status(403).json({
                    error: 'Forbidden',
                    message: 'Admin privileges required for this operation'
                });
            }
            
            const { league } = req.body;
            
            if (!league) {
                return res.status(400).json({
                    error: 'Missing parameters',
                    message: 'League parameter is required'
                });
            }
            
            const db = req.app.locals.db;
            
            // Generate sample teams
            const teamCount = league === 'NFL' ? 32 : 
                             league === 'NBA' ? 30 : 
                             league === 'MLB' ? 30 : 
                             league === 'NHL' ? 32 : 
                             ['PREMIER_LEAGUE', 'LA_LIGA', 'SERIE_A'].includes(league) ? 20 : 
                             league === 'BUNDESLIGA' ? 18 : 20;
            
            const teams = [];
            for (let i = 1; i <= teamCount; i++) {
                teams.push({
                    teamId: `${league.toLowerCase()}_team_${i}`,
                    name: `${league} Team ${i}`,
                    league: league,
                    city: `City ${i}`,
                    venue: `${league} Stadium ${i}`,
                    logo: `/assets/logos/${league.toLowerCase()}/${i}.png`,
                    founded: 1900 + Math.floor(Math.random() * 123),
                    stats: {
                        wins: Math.floor(Math.random() * 60),
                        losses: Math.floor(Math.random() * 40),
                        ties: league === 'NFL' ? Math.floor(Math.random() * 5) : 0,
                        rank: Math.floor(Math.random() * teamCount) + 1,
                        points: Math.floor(Math.random() * 120),
                        homeRecord: `${Math.floor(Math.random() * 30)}-${Math.floor(Math.random() * 20)}`,
                        awayRecord: `${Math.floor(Math.random() * 30)}-${Math.floor(Math.random() * 20)}`
                    }
                });
            }
            
            // Insert teams
            await db.collection('teams').insertMany(teams);
            
            // Generate players for each team
            const playerCount = league === 'NFL' ? 53 : 
                               league === 'NBA' ? 15 : 
                               league === 'MLB' ? 26 : 
                               league === 'NHL' ? 23 : 25;
            
            const positions = {
                'NFL': ['QB', 'RB', 'WR', 'TE', 'OT', 'OG', 'C', 'DT', 'DE', 'LB', 'CB', 'S', 'K', 'P'],
                'NBA': ['PG', 'SG', 'SF', 'PF', 'C'],
                'MLB': ['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH'],
                'NHL': ['G', 'D', 'LW', 'C', 'RW'],
                'PREMIER_LEAGUE': ['GK', 'DF', 'MF', 'FW'],
                'LA_LIGA': ['GK', 'DF', 'MF', 'FW'],
                'SERIE_A': ['GK', 'DF', 'MF', 'FW'],
                'BUNDESLIGA': ['GK', 'DF', 'MF', 'FW']
            };
            
            const allPlayers = [];
            
            for (const team of teams) {
                for (let i = 1; i <= playerCount; i++) {
                    const position = positions[league][Math.floor(Math.random() * positions[league].length)];
                    
                    const player = {
                        playerId: `${team.teamId}_player_${i}`,
                        teamId: team.teamId,
                        name: `Player ${i} ${team.name}`,
                        league: league,
                        position: position,
                        jersey: Math.floor(Math.random() * 99) + 1,
                        nationality: ['USA', 'Canada', 'UK', 'France', 'Germany', 'Spain', 'Italy'][Math.floor(Math.random() * 7)],
                        birthDate: new Date(1980 + Math.floor(Math.random() * 20), Math.floor(Math.random() * 12), Math.floor(Math.random() * 28) + 1),
                        height: 170 + Math.floor(Math.random() * 30),
                        weight: 70 + Math.floor(Math.random() * 40),
                        photo: `/assets/players/${league.toLowerCase()}/${Math.floor(Math.random() * 10) + 1}.jpg`,
                        statistics: {
                            // Add empty statistics object to be populated later
                            current: {},
                            career: {}
                        }
                    };
                    
                    allPlayers.push(player);
                }
            }
            
            // Insert players in batches to avoid MongoDB document size limits
            const batchSize = 100;
            for (let i = 0; i < allPlayers.length; i += batchSize) {
                const batch = allPlayers.slice(i, i + batchSize);
                await db.collection('players').insertMany(batch);
            }
            
            // Generate games
            const games = [];
            const now = new Date();
            
            // Past games
            for (let i = 0; i < 50; i++) {
                const gameDate = new Date(now);
                gameDate.setDate(gameDate.getDate() - Math.floor(Math.random() * 60) - 1);
                
                // Select two random teams
                const teamIndices = [];
                while (teamIndices.length < 2) {
                    const index = Math.floor(Math.random() * teams.length);
                    if (!teamIndices.includes(index)) {
                        teamIndices.push(index);
                    }
                }
                
                const homeTeam = teams[teamIndices[0]];
                const awayTeam = teams[teamIndices[1]];
                
                // Generate scores based on league
                let homeScore, awayScore;
                if (league === 'NBA') {
                    homeScore = Math.floor(Math.random() * 40) + 80;
                    awayScore = Math.floor(Math.random() * 40) + 80;
                } else if (league === 'NFL') {
                    homeScore = Math.floor(Math.random() * 35) + 10;
                    awayScore = Math.floor(Math.random() * 35) + 10;
                } else if (league === 'MLB') {
                    homeScore = Math.floor(Math.random() * 10);
                    awayScore = Math.floor(Math.random() * 10);
                } else if (league === 'NHL') {
                    homeScore = Math.floor(Math.random() * 6);
                    awayScore = Math.floor(Math.random() * 6);
                } else {
                    // Soccer leagues
                    homeScore = Math.floor(Math.random() * 4);
                    awayScore = Math.floor(Math.random() * 4);
                }
                
                games.push({
                    gameId: `${league.toLowerCase()}_game_${i}`,
                    league: league,
                    gameDate: gameDate,
                    homeTeamId: homeTeam.teamId,
                    homeTeamName: homeTeam.name,
                    awayTeamId: awayTeam.teamId,
                    awayTeamName: awayTeam.name,
                    venue: homeTeam.venue,
                    status: 'completed',
                    homeScore: homeScore,
                    awayScore: awayScore,
                    winner: homeScore > awayScore ? homeTeam.teamId : (awayScore > homeScore ? awayTeam.teamId : 'draw'),
                    attendance: Math.floor(Math.random() * 20000) + 10000
                });
            }
            
            // Upcoming games
            for (let i = 0; i < 20; i++) {
                const gameDate = new Date(now);
                gameDate.setDate(gameDate.getDate() + Math.floor(Math.random() * 30) + 1);
                
                // Select two random teams
                const teamIndices = [];
                while (teamIndices.length < 2) {
                    const index = Math.floor(Math.random() * teams.length);
                    if (!teamIndices.includes(index)) {
                        teamIndices.push(index);
                    }
                }
                
                const homeTeam = teams[teamIndices[0]];
                const awayTeam = teams[teamIndices[1]];
                
                games.push({
                    gameId: `${league.toLowerCase()}_upcoming_${i}`,
                    league: league,
                    gameDate: gameDate,
                    homeTeamId: homeTeam.teamId,
                    homeTeamName: homeTeam.name,
                    awayTeamId: awayTeam.teamId,
                    awayTeamName: awayTeam.name,
                    venue: homeTeam.venue,
                    status: 'scheduled',
                    broadcast: ['ESPN', 'FOX', 'NBC', 'CBS', 'ABC'][Math.floor(Math.random() * 5)]
                });
            }
            
            // Insert games
            await db.collection('games').insertMany(games);
            
            res.json({
                success: true,
                message: `Sample data generated for ${league}`,
                counts: {
                    teams: teams.length,
                    players: allPlayers.length,
                    games: games.length
                }
            });
            
        } catch (error) {
            logger.error('Error generating sample data:', error);
            res.status(500).json({
                error: 'Failed to generate sample data',
                message: process.env.NODE_ENV === 'development' ? error.message : 'Server error'
            });
        }
    })
);

// Error Handler
router.use((err, req, res, next) => {
    logger.error('Admin route error:', err);
    res.status(500).json({
        error: 'Admin processing error',
        details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

module.exports = router;